/**
 * `aktion/props-literal`'s `objectReadAsProps` for a call whose ONLY argument
 * is an object literal (src/eslint/props-literal.ts, `electsLoneObject`),
 * against the generated declarations — set up like
 * tests/eslint-generated-dsl.test.ts, over its own fixture project
 * (tests/fixtures/eslint-round2/). The fixture marks the lines it expects to
 * be reported with `// expect: <messageId>`; the same calls are then mounted,
 * so each reported line is one where the runtime drops what TypeScript bound
 * (`chooseNamedBagIndex` rule 2), and each silent one renders as written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint, type Linter as LinterTypes } from "eslint";
import tsParser from "@typescript-eslint/parser";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "../src/index.js";
import aktionEslintPlugin from "../src/eslint-api.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";

const fixtureDir = join(__dirname, "fixtures", "eslint-round2");
const FILE = "single-argument.aktion.ts";
const lines = readFileSync(join(fixtureDir, FILE), "utf8").split("\n");

/** The fixture's `export const <name> = <call>;` lines, by name. */
const CALLS = new Map(
  lines.flatMap((text) => {
    const m = /^export const (\w+) = (.+?);(?: \/\/.*)?$/.exec(text);
    return m ? [[m[1]!, m[2]!] as const] : [];
  }),
);
const lineOf = (name: string): number => lines.findIndex((text) => text.startsWith(`export const ${name} =`)) + 1;

afterEach(() => cleanup());

describe("the eslint-round2 fixture", () => {
  it("type-checks: every call resolves to the overload it shows", () => {
    const { config } = ts.readConfigFile(join(fixtureDir, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, fixtureDir);
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
    const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(join(fixtureDir, FILE)));
    expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
    expect([...CALLS.keys()]).toEqual(["payload", "named", "bag", "mixed", "optionsOnly", "withExtra"]);
  });
});

describe("objectReadAsProps on a lone object literal", () => {
  let messages: LinterTypes.LintMessage[] = [];
  beforeAll(async () => {
    const eslint = new ESLint({
      cwd: fixtureDir,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser, parserOptions: { projectService: true, tsconfigRootDir: fixtureDir } },
        },
        { files: ["**/*.aktion.ts"], plugins: { aktion: aktionEslintPlugin }, rules: { "aktion/props-literal": "error" } },
      ],
    });
    const [result] = await eslint.lintFiles([FILE]);
    messages = result!.messages;
  }, 120_000);

  it("reports exactly the lines marked `// expect:`", () => {
    expect(messages.filter((message) => message.fatal)).toEqual([]);
    const expected = lines.flatMap((text, index) => {
      const marker = /\/\/ expect: (.+)$/.exec(text);
      return marker ? marker[1]!.trim().split(/\s+/).map((id) => `${index + 1}:${id}`) : [];
    });
    expect(messages.map((message) => `${message.line}:${message.messageId}`).sort()).toEqual(expected.sort());
  });

  it("names the parameter, the prop key and what is dropped", () => {
    const messageOn = (name: string): string | undefined => messages.find((message) => message.line === lineOf(name))?.message;
    expect(messageOn("mixed")).toBe(
      "Aktion reads this object as the component's named props, not as its `data` argument, because `id` is a prop name: `name` is not a prop and is dropped. Pass it by name instead (`{ data: { … } }`).",
    );
    expect(messageOn("optionsOnly")).toBe(
      "Aktion reads this object as the component's named props, not as its `data` argument, because `expanded` is a prop name: nothing reaches `data`. Pass it by name instead (`{ data: { … } }`).",
    );
    expect(messageOn("withExtra")).toBe(
      "Aktion reads this object as the component's named props, not as its `data` argument, because `data` is a prop name: `extra` is not a prop and is dropped. Pass it by name instead (`{ data: { … } }`).",
    );
  });
});

describe("what the runtime renders for the same calls", () => {
  it("drops the data of every reported call and keeps every silent one as written", async () => {
    const names = [...CALLS.keys()];
    const entry = [
      'import { Column, JsonTree, Text } from "aktion-runtime/dsl";',
      ...names.map((name) => `export const ${name} = ${CALLS.get(name)!};`),
      `$app(Column([${names.join(", ")}]));`,
      "",
    ].join("\n");
    const res = await linkProject({ entry: "app.aktion.js", files: { "app.aktion.js": entry } });
    expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const screen = renderCompiled(defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion.js" }));
    await flush();
    const trees = [...screen.shadowRoot.querySelectorAll(".rui-json-tree")].map((tree) => tree.textContent ?? "");
    const [payload, named, mixed, optionsOnly, withExtra] = trees;
    expect(trees).toHaveLength(5);
    expect(payload).toContain('"payload-name"');
    expect(named).toContain('"named-name"');
    expect(screen.shadowRoot.textContent).toContain("bag-child");
    expect(mixed).not.toContain("mixed-name");
    expect(mixed).toContain("undefined");
    expect(optionsOnly).toContain("undefined");
    expect(withExtra).toContain('"extra-data"');
    expect(withExtra).not.toContain("extra-dropped");
  });
});
