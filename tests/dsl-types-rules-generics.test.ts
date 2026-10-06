/**
 * `$util.rules.validate` / `.validateAll` are generic in the value they check,
 * so a validator written for one type cannot be run against another, and a
 * schema field must be one the values have:
 *
 *   validate<T>(value: T, validators: Validator<T> | readonly Validator<T>[])
 *   validateAll<V extends object>(values: V, schema: { [K in keyof V]?: Validator<V[K]> | … })
 *
 * They used to take `unknown` for both, so every call type-checked. The
 * signatures are printed into `src/dsl/index.d.ts` from
 * `src/runtime/namespaces-extra.ts`; this compiles a probe against that file
 * (the `@ts-expect-error` lines would be unused errors under the old types).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { Rules } from "../src/runtime/namespaces-extra.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const probePath = resolve(repoRoot, "tests/__rules_generics_probe__.ts");

const PROBE = `
import type { RulesNamespace, Validator } from "../src/dsl/index.js";
declare const rules: RulesNamespace;
declare const email: string;
declare const age: number;
const positive: Validator<number> = (v) => (v > 0 ? null : "must be positive");

// validate infers the value type; the built-in rules accept any value.
const r1: string | null | Promise<string | null> = rules.validate(email, [rules.required(), rules.email()]);
rules.validate(email, rules.required());
rules.validate(age, positive);
rules.validate(age, [rules.required(), positive]);
// @ts-expect-error a number validator cannot check a string
rules.validate(email, positive);
// @ts-expect-error nor inside a list
rules.validate(email, [rules.required(), positive]);

// validateAll checks each field's validators against that field's value.
const errors: Partial<Record<"email" | "age", string>> | Promise<Partial<Record<"email" | "age", string>>> =
  rules.validateAll({ email, age }, { email: [rules.required(), rules.email()], age: positive });
// @ts-expect-error a field the values do not have
rules.validateAll({ email }, { emial: [rules.required()] });
// @ts-expect-error a validator for another type
rules.validateAll({ email }, { email: positive });
// An interface-typed values object (no index signature) is accepted.
interface Signup { email: string; age: number }
declare const signup: Signup;
rules.validateAll(signup, { age: [positive] });
export { r1, errors };
`;

function diagnostics(): string[] {
  const config = ts.readConfigFile(resolve(repoRoot, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repoRoot);
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    declaration: false,
    emitDeclarationOnly: false,
    rootDir: repoRoot,
    types: [],
    noUnusedLocals: false,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, ...rest) =>
    resolve(name) === probePath ? ts.createSourceFile(name, PROBE, version, true) : getSourceFile(name, version, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => resolve(name) === probePath || fileExists(name);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => (resolve(name) === probePath ? PROBE : readFile(name));
  const program = ts.createProgram([probePath], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => {
      const where = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
      const file = d.file ? d.file.fileName.replace(`${repoRoot}/`, "") : "";
      return `${file}${where ? `(${where.line + 1})` : ""}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
    });
}

describe("$util.rules.validate / validateAll are generic in the checked value", () => {
  it("the probe type-checks, and every @ts-expect-error is used", () => {
    expect(diagnostics()).toEqual([]);
  }, 60_000);

  it("the printed declarations carry the generic signatures", () => {
    const index = readFileSync(resolve(repoRoot, "src/dsl/index.d.ts"), "utf8");
    expect(index).toContain(
      "readonly validate: <T>(value: T, validators: Validator<T> | readonly Validator<T>[]) => string | Promise<string | null> | null;",
    );
    expect(index).toMatch(/readonly validateAll: <V extends object>\(values: V, schema: \{ readonly \[K in keyof V\]\?: /);
  });

  it("runtime behaviour is unchanged: a missing or non-function entry is skipped", () => {
    expect(Rules.validate("", [Rules.required()])).toBe("This field is required");
    expect(Rules.validate("x", [] as never)).toBeNull();
    expect(Rules.validate("", ["not a rule", Rules.required()] as never)).toBe("This field is required");
    expect(Rules.validateAll({ a: "" }, { a: [Rules.required()], b: undefined } as never)).toEqual({ a: "This field is required" });
  });
});
