/**
 * `aktion/router-literal`'s `armComputed` (src/eslint/router-literal.ts): a
 * computed route path in a `$router` table, or in a layout arm's `routes`,
 * is ignored by the runtime — the lint side of the compiler's E127 for
 * `.aktion.ts` / `.aktion.js` modules. The fixture
 * (tests/fixtures/eslint-round2/router-computed.aktion.ts) marks the lines it
 * expects with `// expect: <messageId>`; the rule is syntactic, so it runs
 * without type information. The same tables are then evaluated and compiled,
 * so each report matches what the runtime and the compiler do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import aktionEslintPlugin from "../src/eslint-api.js";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { defaultLibrary } from "../src/library/index.js";
import { parse } from "../src/parser/index.js";
import type { Expression } from "../src/parser/types.js";
import { StateStore, createContext, evaluate } from "../src/runtime/index.js";

const fixtureDir = join(__dirname, "fixtures", "eslint-round2");
const FILE = "router-computed.aktion.ts";
const source = readFileSync(join(fixtureDir, FILE), "utf8");
const lines = source.split("\n");

describe("armComputed", () => {
  let messages: Array<{ line: number; messageId?: string; message: string; fatal?: boolean }> = [];
  beforeAll(async () => {
    const eslint = new ESLint({
      cwd: fixtureDir,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser, parserOptions: { project: false, projectService: false } },
        },
        { files: ["**/*.aktion.ts"], plugins: { aktion: aktionEslintPlugin }, rules: { "aktion/router-literal": "error" } },
      ],
    });
    const [result] = await eslint.lintFiles([FILE]);
    messages = result!.messages;
  }, 60_000);

  it("the fixture type-checks: `RouteTable` takes any string key", () => {
    const { config } = ts.readConfigFile(join(fixtureDir, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, fixtureDir);
    const program = ts.createProgram({ rootNames: [join(fixtureDir, FILE)], options: parsed.options });
    const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(join(fixtureDir, FILE)));
    expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  });

  it("reports exactly the lines marked `// expect:`, without type information", () => {
    expect(messages.filter((message) => message.fatal)).toEqual([]);
    const expected = lines.flatMap((text, index) => {
      const marker = /\/\/ expect: (.+)$/.exec(text);
      return marker ? marker[1]!.trim().split(/\s+/).map((id) => `${index + 1}:${id}`) : [];
    });
    expect(expected).toHaveLength(3);
    expect(messages.map((message) => `${message.line}:${message.messageId}`).sort()).toEqual(expected.sort());
    expect(messages[0]!.message).toBe(
      "Aktion reads each route path by syntax and ignores a computed one, so this arm never matches — write the path as a string key (`\"/users/:id\": …`).",
    );
  });

  it("the runtime ignores a computed path — even `[\"/\"]` — and falls through to `default`", () => {
    const ctx = createContext(new StateStore(), { library: defaultLibrary });
    ctx.loopVars.set("p", "/");
    const value = (src: string): unknown => {
      const program = parse(src);
      expect(program.errors, src).toEqual([]);
      return evaluate((program.statements[0] as { expression: Expression }).expression, ctx);
    };
    // The router matches the current path, "/" here.
    expect(value('$router({ "/": "string key", default: "fallback" })')).toBe("string key");
    expect(value('$router({ [p]: "computed", default: "fallback" })')).toBe("fallback");
    expect(value('$router({ ["/"]: "computed literal", default: "fallback" })')).toBe("fallback");
    expect(value('$router({ "/": { layout: outlet, routes: { [p]: "child", default: "child fallback" } } })')).toBe("child fallback");
  });

  it("the compiler reports E127 on each reported line", () => {
    // The fixture has no type annotations, so it compiles as `.aktion.js` too.
    const out = javascriptFrontend.compile(source, join(fixtureDir, "router-computed.aktion.js"));
    const e127 = out.diagnostics.filter((d) => d.code === "E127").map((d) => d.line).sort((a, b) => a - b);
    expect(e127).toEqual(messages.map((message) => message.line).sort((a, b) => a - b));
  });
});
