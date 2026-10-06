/**
 * The `$`-builtin, resource and injected-name callbacks whose result the
 * runtime ignores return `unknown`, not `void` (scripts/dsl-types/builtins.ts).
 *
 * The reason is typescript-eslint's `no-misused-promises`, in the
 * `recommendedTypeChecked` config the `aktion-runtime/eslint` docs pair with
 * `aktionTypeScriptConfig`: with `checksVoidReturn` on (the default) it reports
 * a Promise-returning function passed or assigned where a function returning
 * `void` is expected — and `create.onDone = () => $todos.refetch()` returns
 * the refetch Promise. This repo does not depend on that plugin, so its check
 * is restated over the TypeScript checker (`misusedPromises` below: a function
 * whose return type is thenable, whose contextual type has a call signature
 * returning exactly `void` and none returning a thenable — the rule's
 * `isVoidReturningFunctionType`), validated on a control, and run over every
 * callback in tests/fixtures/dsl-types/surface.types-round2.aktion.ts.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(repoRoot, "tests/fixtures/dsl-types");
const fixture = join(fixtureDir, "surface.types-round2.aktion.ts");
const control = join(fixtureDir, "__misused-promises-control.ts");

const CONTROL = [
  "declare function voidCallback(fn: () => void): void;",
  "declare function unknownCallback(fn: () => unknown): void;",
  "declare function eitherCallback(fn: () => void | Promise<void>): void;",
  "declare const holder: { done?: () => void };",
  "voidCallback(() => Promise.resolve(1));",
  "unknownCallback(() => Promise.resolve(1));",
  "eitherCallback(() => Promise.resolve());",
  "holder.done = () => Promise.resolve(2);",
  "voidCallback(() => 1);",
  "export {};",
  "",
].join("\n");

function createProgram(): ts.Program {
  const { config } = ts.readConfigFile(join(fixtureDir, "tsconfig.json"), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, fixtureDir);
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    resolve(name) === control ? ts.createSourceFile(name, CONTROL, languageVersion, true) : getSourceFile(name, languageVersion, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => resolve(name) === control || fileExists(name);
  return ts.createProgram({ rootNames: [fixture, control], options, host });
}

const program = createProgram();
const checker = program.getTypeChecker();

const parts = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);

function isThenable(type: ts.Type, at: ts.Node): boolean {
  return parts(type).some((part) => {
    const then = part.getProperty("then");
    return then !== undefined && checker.getTypeOfSymbolAtLocation(then, at).getCallSignatures().length > 0;
  });
}

/** typescript-eslint's `isVoidReturningFunctionType`, over the function's contextual type. */
function expectsVoidReturn(fn: ts.Expression): boolean {
  const contextual = checker.getContextualType(fn);
  if (!contextual) return false;
  let hadVoidReturn = false;
  for (const part of parts(contextual)) {
    for (const signature of part.getCallSignatures()) {
      const returnType = checker.getReturnTypeOfSignature(signature);
      if (isThenable(returnType, fn)) return false;
      if (returnType.flags & ts.TypeFlags.Void) hadVoidReturn = true;
    }
  }
  return hadVoidReturn;
}

/** Every Promise-returning function in `file`, and the ones `no-misused-promises` would report. */
function misusedPromises(file: string): { promiseReturning: number; reported: string[] } {
  const sf = program.getSourceFile(file);
  if (!sf) throw new Error(`not in the program: ${file}`);
  let promiseReturning = 0;
  const reported: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const signature = checker.getSignatureFromDeclaration(node);
      if (signature && isThenable(checker.getReturnTypeOfSignature(signature), node)) {
        promiseReturning += 1;
        if (expectsVoidReturn(node)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          reported.push(`${line + 1}: ${node.getText(sf).replace(/\s+/g, " ").slice(0, 60)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { promiseReturning, reported };
}

describe("builtin callbacks and no-misused-promises (checksVoidReturn)", () => {
  it("the fixture type-checks", () => {
    const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(fixture));
    expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  });

  it("the restated check reports a Promise-returning function only where `void` alone is expected", () => {
    const { promiseReturning, reported } = misusedPromises(control);
    expect(promiseReturning).toBe(4);
    expect(reported).toEqual(["5: () => Promise.resolve(1)", "8: () => Promise.resolve(2)"]);
  });

  it("no callback in the round-2 surface fixture is reported — onDone, onMessage, optimistic, $effect, timers, cleanup, $dom", () => {
    const { promiseReturning, reported } = misusedPromises(fixture);
    // A drop here means the fixture stopped exercising the callbacks.
    expect(promiseReturning).toBeGreaterThanOrEqual(10);
    expect(reported).toEqual([]);
  });
});
