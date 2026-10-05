/**
 * The `aktion-runtime/eslint` presets next to the rule set the docs pair them
 * with — `eslint-plugin-unicorn`'s `configs.recommended` — for the two entries
 * no corpus sweep exercises (`unicorn/prefer-switch`,
 * `unicorn/no-top-level-assignment-in-function`) and for the two rules
 * `aktionTypeScriptConfig` switches on rather than off.
 *
 * Each case runs both presets: `aktionTypeScriptConfig` on a `.aktion.js` /
 * `.aktion.ts` module, and `configs.recommended` (processor +
 * `aktionRecommendedRules`) on the same code as a `.aktion` file. A control
 * run without the override shows the rule really fires (or really corrupts),
 * so the preset is what makes the difference.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Linter, type Linter as LinterTypes } from "eslint";
import tsParser from "@typescript-eslint/parser";
import unicornPlugin from "eslint-plugin-unicorn";
import { describe, expect, it } from "vitest";
import aktionEslintPlugin, { aktionRecommendedRules, aktionTypeScriptConfig, aktionTypeScriptRules } from "../src/eslint-api.js";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { parse } from "../src/parser/index.js";

const root = join(__dirname, "..");
const unicornRecommended = unicornPlugin.configs.recommended as unknown as LinterTypes.Config;

/** unicorn's recommended set with the TypeScript parser, then the TS preset, then `extra`. */
function typescriptConfig(extra: LinterTypes.RulesRecord = {}): LinterTypes.Config[] {
  return [
    {
      ...unicornRecommended,
      files: ["**/*.ts", "**/*.js"],
      languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
    },
    ...aktionTypeScriptConfig,
    { files: ["**/*.aktion.ts", "**/*.aktion.js"], rules: extra },
  ];
}

/** The `.aktion` wiring: processor, unicorn's recommended set, then `rules`. */
function aktionConfig(rules: LinterTypes.RulesRecord): LinterTypes.Config[] {
  return [
    ...(aktionEslintPlugin.configs!.recommended as LinterTypes.Config[]),
    {
      ...unicornRecommended,
      files: ["**/*.aktion/*.ts"],
      languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
      rules: { ...(unicornRecommended.rules as LinterTypes.RulesRecord), ...rules },
    },
  ];
}
const aktionOptions = { filename: "app.aktion", filterCodeBlock: () => true };

describe("unicorn/prefer-switch is off: its fix writes braced case bodies Aktion parses as objects", () => {
  // Three comparisons of one discriminant, one branch declaring a binding.
  const chain = [
    "function status(kind) {",
    '  if (kind === "ok") { const label = "All good"; return Badge(label, { tone: "success" }) }',
    '  else if (kind === "warn") { return Badge("Careful", { tone: "warning" }) }',
    '  else if (kind === "err") { return Badge("Broken", { tone: "danger" }) }',
    '  return Text("?")',
    "}",
  ].join("\n");
  const moduleSource = `export ${chain}\n$app(status("ok"))\n`;
  const aktionSource = `${chain}\n$app(status("ok"))\n`;

  it("the module compiles before any fix", () => {
    const before = javascriptFrontend.compile(moduleSource, "/app.aktion.js");
    expect([...before.program.errors, ...before.diagnostics]).toEqual([]);
    expect(parse(aktionSource).errors).toEqual([]);
  });

  it("aktionTypeScriptConfig: --fix leaves a .aktion.js module that still compiles", () => {
    const fixed = new Linter().verifyAndFix(moduleSource, typescriptConfig(), { filename: "app.aktion.js" });
    expect(fixed.output).not.toContain("switch");
    const after = javascriptFrontend.compile(fixed.output, "/app.aktion.js");
    expect([...after.program.errors, ...after.diagnostics]).toEqual([]);

    const control = new Linter().verifyAndFix(moduleSource, typescriptConfig({ "unicorn/prefer-switch": "error" }), {
      filename: "app.aktion.js",
    });
    expect(control.output).toContain('case "ok": {');
    // The braced case body is a block statement: E113 from the JS-semantics check.
    const broken = javascriptFrontend.compile(control.output, "/app.aktion.js");
    expect([...broken.program.errors.map((e) => e.message), ...broken.diagnostics.map((d) => d.code ?? d.message)]).toContain("E113");
  });

  it("configs.recommended: --fix leaves a .aktion file that still parses", () => {
    const fixed = new Linter().verifyAndFix(aktionSource, aktionConfig(aktionRecommendedRules), aktionOptions);
    expect(fixed.output).not.toContain("switch");
    expect(parse(fixed.output).errors).toEqual([]);

    const control = new Linter().verifyAndFix(
      aktionSource,
      aktionConfig({ ...aktionRecommendedRules, "unicorn/prefer-switch": "error" }),
      aktionOptions,
    );
    expect(control.output).toContain('case "ok": {');
    expect(parse(control.output).errors.length).toBeGreaterThan(0);
  });
});

describe("unicorn/no-top-level-assignment-in-function is off: actions writing atoms are the state model", () => {
  const RULE = "unicorn/no-top-level-assignment-in-function";
  const count = (messages: LinterTypes.LintMessage[]): number => messages.filter((m) => m.ruleId === RULE).length;
  const template = (path: string): string => readFileSync(join(root, "create-aktion", "template", path), "utf8");

  it.each(["todos-app-ts/src/store.aktion.ts", "todos-app-js/src/store.aktion.js"])(
    "aktionTypeScriptConfig: %s reports nothing",
    (path) => {
      const source = template(path);
      const filename = join(root, "create-aktion", "template", path);
      expect(count(new Linter().verify(source, typescriptConfig(), { filename }))).toBe(0);
      expect(count(new Linter().verify(source, typescriptConfig({ [RULE]: "error" }), { filename }))).toBeGreaterThan(0);
    },
  );

  it("configs.recommended: todos-app/src/store.aktion reports nothing", () => {
    const source = template("todos-app/src/store.aktion");
    expect(count(new Linter().verify(source, aktionConfig(aktionRecommendedRules), aktionOptions))).toBe(0);
    expect(
      count(new Linter().verify(source, aktionConfig({ ...aktionRecommendedRules, [RULE]: "error" }), aktionOptions)),
    ).toBeGreaterThan(0);
  });

  it("is in both records", () => {
    expect(aktionTypeScriptRules[RULE]).toBe("off");
    expect(aktionRecommendedRules[RULE]).toBe("off");
    expect(aktionTypeScriptRules["unicorn/prefer-switch"]).toBe("off");
    expect(aktionRecommendedRules["unicorn/prefer-switch"]).toBe("off");
  });
});

describe("aktionTypeScriptConfig switches object-shorthand on, over the consumer's own setting", () => {
  const source = [
    'const title = "x";',
    "export const a = { title: title };",
    "export const b = { onClick() { return 1; } };",
    "export const c = { onClick: function () { return 1; } };",
    "",
  ].join("\n");

  it("reports `{ title: title }` even after the consumer turned the rule off, and no handler form", () => {
    const config: LinterTypes.Config[] = [
      { plugins: { unicorn: unicornPlugin } },
      { files: ["**/*.js"], rules: { "object-shorthand": "off" } },
      ...aktionTypeScriptConfig,
    ];
    const messages = new Linter().verify(source, config, { filename: "m.aktion.js" });
    expect(messages.map((m) => `${m.line}:${m.ruleId}:${m.severity}`)).toEqual(["2:object-shorthand:2"]);
  });
});
