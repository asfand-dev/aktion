/**
 * `aktion/props-literal` and `aktion/router-literal` against the GENERATED
 * `aktion-runtime/dsl` declarations (`src/dsl/index.d.ts`), where
 * tests/eslint-typescript.test.ts uses a hand-written stand-in.
 *
 * The fixture project (`tests/fixtures/eslint-generated-dsl/`) covers what the
 * stand-in project deliberately avoids: calls that do not type-check — in an
 * untyped `.aktion.js` module under `allowJs` without `checkJs`, where that
 * happens with no error shown, and in a `.aktion.ts` module with deliberate
 * TS2769 errors — plus object literals TypeScript matches to a positional
 * object parameter, and `$router` tables. As there, each fixture marks the
 * lines it expects to be reported with `// expect: <messageId> …`, and the
 * rules must report exactly those (line, message id) pairs.
 */
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { ESLint, type Linter as LinterTypes } from "eslint";
import tsParser from "@typescript-eslint/parser";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import aktionEslintPlugin, { aktionRouterLiteralRule } from "../src/eslint-api.js";

const fixtureDir = join(__dirname, "fixtures", "eslint-generated-dsl");
const AKTION_MODULES = readdirSync(fixtureDir)
  .filter((file) => /\.aktion\.(?:ts|js)$/.test(file))
  .sort();
const RULES = ["aktion/props-literal", "aktion/router-literal"];

function parserBlock(typed: boolean): LinterTypes.Config {
  return {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parser: tsParser,
      parserOptions: typed
        ? { projectService: true, tsconfigRootDir: fixtureDir }
        : { project: false, projectService: false },
    },
  };
}

const rulesOnly: LinterTypes.Config = {
  files: ["**/*.aktion.ts", "**/*.aktion.js"],
  plugins: { aktion: aktionEslintPlugin },
  rules: { "aktion/props-literal": "error", "aktion/router-literal": "error" },
};

async function lintFixtures(config: LinterTypes.Config[]): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint({ cwd: fixtureDir, overrideConfigFile: true, overrideConfig: config });
  return eslint.lintFiles(AKTION_MODULES);
}

function resultFor(results: ESLint.LintResult[], file: string): ESLint.LintResult {
  const result = results.find((candidate) => candidate.filePath === join(fixtureDir, file));
  if (!result) throw new Error(`no lint result for ${file}`);
  return result;
}

function fixtureLines(file: string): string[] {
  return readFileSync(join(fixtureDir, file), "utf8").split("\n");
}

/** `line:messageId` for every `// expect: …` marker in a fixture, sorted. */
function expectedReports(file: string): string[] {
  return fixtureLines(file)
    .flatMap((text, index) => {
      const marker = /\/\/ expect: (.+)$/.exec(text);
      return marker ? marker[1]!.trim().split(/\s+/).map((id) => `${index + 1}:${id}`) : [];
    })
    .sort();
}

function actualReports(result: ESLint.LintResult): string[] {
  return result.messages
    .filter((message) => message.ruleId !== null && RULES.includes(message.ruleId))
    .map((message) => `${message.line}:${message.messageId}`)
    .sort();
}

/** The 1-based line of `export const <name> =` (or `export function <name>(`) in a fixture. */
function lineOf(file: string, name: string): number {
  const line =
    fixtureLines(file).findIndex(
      (text) => text.startsWith(`export const ${name} =`) || text.startsWith(`export function ${name}(`),
    ) + 1;
  if (line === 0) throw new Error(`${file} declares no ${name}`);
  return line;
}

describe("the eslint-generated-dsl fixture project", () => {
  const { config } = ts.readConfigFile(join(fixtureDir, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, fixtureDir);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const diagnosticsIn = (file: string): ts.Diagnostic[] =>
    ts.getPreEmitDiagnostics(program, program.getSourceFile(join(fixtureDir, file)));

  it("type-checks the fixtures that must resolve cleanly", () => {
    expect(parsed.errors).toEqual([]);
    for (const file of ["any-arguments.aktion.ts", "positional-object.aktion.ts", "router.aktion.ts", "untyped.aktion.js"]) {
      expect(diagnosticsIn(file).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), file).toEqual([]);
    }
  });

  it("type-errors.aktion.ts has a TS2769 on every exported call", () => {
    const file = "type-errors.aktion.ts";
    const source = program.getSourceFile(join(fixtureDir, file))!;
    const errorLines = new Set(
      diagnosticsIn(file)
        .filter((d) => d.code === 2769)
        .map((d) => source.getLineAndCharacterOfPosition(d.start!).line + 1),
    );
    const callLines = fixtureLines(file).flatMap((text, index) => (text.startsWith("export const ") ? [index + 1] : []));
    expect(callLines.length).toBeGreaterThan(3);
    expect(callLines.filter((line) => !errorLines.has(line))).toEqual([]);
  });

  it("in untyped.aktion.js, a call on a widened value matches no overload, with no error shown", () => {
    // The premise of the fixture: `getResolvedSignature` returns a signature
    // that is not one of the callee's overloads — except where an argument is
    // an untyped (`any`) parameter, which every overload accepts, so the call
    // resolves to the first one, `props` in second position.
    const file = "untyped.aktion.js";
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(join(fixtureDir, file))!;
    const resolvesToOverload = new Map<number, boolean>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^[A-Z]/.test(node.expression.text)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const signature = checker.getResolvedSignature(node);
        const overloads = checker.getTypeAtLocation(node.expression).getCallSignatures();
        if (!resolvesToOverload.has(line)) resolvesToOverload.set(line, signature !== undefined && overloads.includes(signature));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const name of ["handlerAndBag", "positionalVariant", "wholeProps", "trailingVariable", "spreadBag"]) {
      expect(resolvesToOverload.get(lineOf(file, name)), name).toBe(false);
    }
    // (`NameColumn` is left out: `Col` is generic, so its resolution is an
    // instantiation of the first overload rather than the overload itself.)
    for (const name of ["handlerOnly", "Save", "Detail", "Option", "Greeting"]) {
      expect(resolvesToOverload.get(lineOf(file, name)), name).toBe(true);
    }
  });
});

describe("aktion/props-literal and aktion/router-literal against the generated declarations", () => {
  let results: ESLint.LintResult[] = [];
  beforeAll(async () => {
    results = await lintFixtures([parserBlock(true), rulesOnly]);
  }, 120_000);

  it.each(AKTION_MODULES)("%s: reports exactly the lines marked `// expect:`", (file) => {
    const result = resultFor(results, file);
    expect(result.messages.filter((message) => message.fatal)).toEqual([]);
    expect(actualReports(result)).toEqual(expectedReports(file));
  });

  it("names the parameter, the prop key and what the runtime drops in objectReadAsProps", () => {
    const file = "positional-object.aktion.ts";
    const result = resultFor(results, file);
    const messageOn = (name: string): string | undefined =>
      result.messages.find((message) => message.line === lineOf(file, name))?.message;
    expect(messageOn("mixed")).toBe(
      "Aktion reads this object as the component's named props, not as its `attributes` argument, because `id` is a prop name: `data-x`, `title` are not props and are dropped. Pass it by name instead (`{ attributes: { … } }`).",
    );
    expect(messageOn("withChildren")).toBe(
      "Aktion reads this object as the component's named props, not as its `attributes` argument, because `class` is a prop name: `data-id` is not a prop and is dropped, and the argument after it lands in `attributes` instead. Pass it by name instead (`{ attributes: { … } }`).",
    );
  });

  it("reports on the argument itself, and offers no fix", () => {
    const file = "untyped.aktion.js";
    const lines = fixtureLines(file);
    const result = resultFor(results, file);
    const reported = (name: string): string[] => {
      const line = lineOf(file, name);
      return result.messages
        .filter((message) => message.line === line && message.endLine === line)
        .map((message) => lines[line - 1]!.slice(message.column - 1, message.endColumn! - 1));
    };
    expect(reported("wholeProps")).toEqual(["full"]);
    expect(reported("trailingVariable")).toEqual(["looseOpts"]);
    expect(reported("spreadBag")).toEqual(["...extra"]);
    for (const message of results.flatMap((each) => each.messages)) {
      expect(message.fix).toBeUndefined();
    }
  });
});

describe("aktion/router-literal without type information", () => {
  it("reports the same lines: the rule is syntactic", async () => {
    const results = await lintFixtures([parserBlock(false), rulesOnly]);
    const result = resultFor(results, "router.aktion.ts");
    expect(actualReports(result)).toEqual(expectedReports("router.aktion.ts"));
    // …while props-literal, which needs the checker, reports nothing anywhere.
    for (const each of results) {
      expect(each.messages.filter((message) => message.ruleId === "aktion/props-literal")).toEqual([]);
    }
  });

  it("is registered on the plugin and enabled by configs.typescript", () => {
    expect(aktionEslintPlugin.rules?.["router-literal"]).toBe(aktionRouterLiteralRule);
    const rules = (aktionEslintPlugin.configs?.typescript as LinterTypes.Config[]).find((block) => block.rules)?.rules;
    expect(rules?.["aktion/router-literal"]).toBe("error");
  });
});
