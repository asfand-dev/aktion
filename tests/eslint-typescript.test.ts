/**
 * `aktion-runtime/eslint` for modules authored in TypeScript/JavaScript:
 * `aktionTypeScriptRules`, the `aktionTypeScriptConfig` preset, and the
 * type-aware `aktion/props-literal` rule.
 *
 * The rule is exercised the way a consumer runs it — the real `ESLint` class
 * with `@typescript-eslint/parser` and `projectService`, over a fixture
 * project (`tests/fixtures/eslint-typescript/`) whose `tsconfig.json` maps
 * `aktion-runtime/dsl` onto a hand-written stand-in for the generated
 * declarations. Each fixture marks the lines it expects to be reported with a
 * trailing `// expect: <messageId> …` comment, so the fixture is the spec:
 * the rule must report exactly those (line, message id) pairs and nothing
 * else.
 */
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { ESLint, Linter, type Linter as LinterTypes } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tsParser from "@typescript-eslint/parser";
import unicornPlugin from "eslint-plugin-unicorn";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import aktionEslintPlugin, {
  aktionPropsLiteralRule,
  aktionRecommendedRules,
  aktionTypeScriptConfig,
  aktionTypeScriptRules,
} from "../src/eslint-api.js";
import { parse } from "../src/parser/index.js";

const fixtureDir = join(__dirname, "fixtures", "eslint-typescript");
const AKTION_MODULES = readdirSync(fixtureDir)
  .filter((file) => /\.aktion\.(?:ts|js)$/.test(file))
  .sort();

/**
 * `eslint-plugin-import-x`, when installed. It is not a dependency of this
 * repo; the specifier is a variable so Vite leaves the import to run time.
 */
const IMPORT_X = "eslint-plugin-import-x";
const importXPlugin: ESLint.Plugin | null = await import(/* @vite-ignore */ IMPORT_X)
  .then((module: { default?: ESLint.Plugin }) => module.default ?? null)
  .catch(() => null);

const NOT_LITERAL_MESSAGE =
  "Aktion only reads props from an object literal written at the call site — inline it: Button(\"Go\", { …opts }) is not supported either (spreads are dropped), so list the props.";
const SPREAD_MESSAGE =
  "Spreads inside component props are ignored by Aktion — list the props explicitly (`{ variant: extra.variant, … }`).";

/** `@typescript-eslint/parser` for every fixture file, with or without type information. */
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

/** Only `aktion/props-literal`, so every report in a result is the rule's. */
const ruleOnly: LinterTypes.Config = {
  files: ["**/*.aktion.ts", "**/*.aktion.js"],
  plugins: { aktion: aktionEslintPlugin },
  rules: { "aktion/props-literal": "error" },
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

/** `line:messageId` for every `// expect: …` marker in a fixture, sorted. */
function expectedReports(file: string): string[] {
  const lines = readFileSync(join(fixtureDir, file), "utf8").split("\n");
  return lines
    .flatMap((text, index) => {
      const marker = /\/\/ expect: (.+)$/.exec(text);
      return marker ? marker[1]!.trim().split(/\s+/).map((id) => `${index + 1}:${id}`) : [];
    })
    .sort();
}

function actualReports(result: ESLint.LintResult): string[] {
  return result.messages
    .filter((message) => message.ruleId === "aktion/props-literal")
    .map((message) => `${message.line}:${message.messageId}`)
    .sort();
}

describe("the eslint-typescript fixture project", () => {
  it("type-checks cleanly, so every call resolves to the overload the fixture intends", () => {
    // A call with a type error still resolves — to a signature TypeScript
    // built for the error message — and the rule then binds the arguments
    // from the overloads instead (tests/eslint-generated-dsl.test.ts covers
    // that path). Zero diagnostics keeps every call here on the other one:
    // the overload TypeScript actually picked.
    const configPath = join(fixtureDir, "tsconfig.json");
    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, fixtureDir);
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    expect(parsed.errors).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(parsed.fileNames.some((file) => file.endsWith("script.aktion.js"))).toBe(true);
  });

  it("covers both message ids, a .aktion.js module and a file with nothing to report", () => {
    const all = AKTION_MODULES.flatMap(expectedReports);
    expect(all.some((entry) => entry.endsWith(":propsNotLiteral"))).toBe(true);
    expect(all.some((entry) => entry.endsWith(":propsSpread"))).toBe(true);
    expect(AKTION_MODULES).toContain("script.aktion.js");
    expect(expectedReports("user-components.aktion.ts")).toEqual([]);
  });
});

describe("aktion/props-literal with type information", () => {
  // One ESLint run (one project service) for the whole describe block.
  let results: ESLint.LintResult[] = [];
  beforeAll(async () => {
    results = await lintFixtures([parserBlock(true), ruleOnly]);
  });

  it.each(AKTION_MODULES)("%s: reports exactly the lines marked `// expect:`", (file) => {
    const result = resultFor(results, file);
    expect(result.messages.filter((message) => message.fatal)).toEqual([]);
    expect(actualReports(result)).toEqual(expectedReports(file));
  });

  it("uses the exact message text for both reports", () => {
    const messages = results.flatMap((result) => result.messages);
    const texts = new Map(messages.map((message) => [message.messageId, message.message]));
    expect(texts.get("propsNotLiteral")).toBe(NOT_LITERAL_MESSAGE);
    expect(texts.get("propsSpread")).toBe(SPREAD_MESSAGE);
  });

  it("reports on the argument itself, or on each spread entry, and offers no fix", () => {
    const result = resultFor(results, "library-calls.aktion.ts");
    const lines = readFileSync(join(fixtureDir, "library-calls.aktion.ts"), "utf8").split("\n");
    /** The reported source text of every report on the line declaring `name`. */
    const reportedText = (name: string): string[] => {
      const line = lines.findIndex((text) => text.startsWith(`export const ${name} =`)) + 1;
      return result.messages
        .filter((message) => message.line === line && message.endLine === line)
        .map((message) => lines[line - 1]!.slice(message.column - 1, message.endColumn! - 1));
    };
    expect(reportedText("fromVariable")).toEqual(["opts"]);
    expect(reportedText("castVariable")).toEqual(["opts as ButtonNamed"]);
    expect(reportedText("restVariable")).toEqual(["toolbarOpts"]);
    expect(reportedText("spreadMixed")).toEqual(["...extra", "...opts"]);
    for (const message of result.messages) {
      expect(message.fix).toBeUndefined();
      expect(message.suggestions ?? []).toEqual([]);
    }
  });
});

describe("aktion/props-literal without type information", () => {
  it("reports nothing when the TypeScript parser has no project", async () => {
    const results = await lintFixtures([parserBlock(false), ruleOnly]);
    expect(results).toHaveLength(AKTION_MODULES.length);
    for (const result of results) {
      expect(result.messages).toEqual([]);
    }
  });

  it("reports nothing under ESLint's default parser", () => {
    const linter = new Linter();
    const source = readFileSync(join(fixtureDir, "script.aktion.js"), "utf8");
    const messages = linter.verify(source, [ruleOnly], { filename: join(fixtureDir, "script.aktion.js") });
    expect(messages).toEqual([]);
  });
});

describe("aktionTypeScriptConfig", () => {
  const presetRules = { ...aktionTypeScriptRules, "aktion/props-literal": "error", "aktion/router-literal": "error" };

  it("registers the plugin by reference and applies the rules to .aktion.ts/.aktion.js", () => {
    expect(aktionEslintPlugin.configs?.typescript).toBe(aktionTypeScriptConfig);
    expect(aktionEslintPlugin.rules?.["props-literal"]).toBe(aktionPropsLiteralRule);
    const pluginBlock = aktionTypeScriptConfig.find((block) => block.plugins !== undefined);
    expect(pluginBlock?.plugins?.aktion).toBe(aktionEslintPlugin);
    const rulesBlock = aktionTypeScriptConfig.find((block) => block.rules !== undefined);
    expect(rulesBlock?.files).toEqual(["**/*.aktion.ts", "**/*.aktion.js"]);
    expect(rulesBlock?.rules).toEqual(presetRules);
    expect(aktionTypeScriptConfig.every((block) => typeof block.name === "string")).toBe(true);
  });

  it("matches .aktion.ts/.aktion.js only — not host code, not the processor's virtual blocks", async () => {
    const eslint = new ESLint({
      cwd: fixtureDir,
      overrideConfigFile: true,
      overrideConfig: [
        ...(aktionEslintPlugin.configs!.recommended as LinterTypes.Config[]),
        ...aktionTypeScriptConfig,
        { plugins: { unicorn: unicornPlugin } },
        parserBlock(false),
      ],
    });
    for (const file of ["library-calls.aktion.ts", "script.aktion.js"]) {
      const config = await eslint.calculateConfigForFile(file);
      expect(config.rules["aktion/props-literal"]).toEqual([2]);
      expect(config.rules["unicorn/switch-case-braces"]).toEqual([2, "avoid"]);
    }
    for (const file of ["main.ts", "dsl.d.ts", "app.aktion/0_eslint-aktion.ts"]) {
      const config = await eslint.calculateConfigForFile(file);
      expect(config?.rules?.["aktion/props-literal"]).toBeUndefined();
    }
  });

  it("loads in a flat config next to eslint-plugin-unicorn and lints the fixture project", async () => {
    const results = await lintFixtures([
      parserBlock(true),
      { plugins: { unicorn: unicornPlugin } },
      ...aktionTypeScriptConfig,
    ]);
    for (const file of AKTION_MODULES) {
      const result = resultFor(results, file);
      // Besides `aktion/props-literal`, the preset enables
      // `aktion/router-literal`, `unicorn/switch-case-braces` and
      // `object-shorthand`; the fixtures contain no `$router`, no `switch` and
      // no `{ x: x }`.
      expect(result.messages.map((message) => message.ruleId).filter((id) => id !== "aktion/props-literal")).toEqual([]);
      expect(actualReports(result)).toEqual(expectedReports(file));
    }
  });

  it("needs eslint-plugin-unicorn for its one enabled plugin rule; switching that rule off is the escape hatch", () => {
    const linter = new Linter();
    const options = { filename: "pick.aktion.js" };
    expect(() => linter.verify("export const a = 1\n", aktionTypeScriptConfig, options)).toThrow(
      /Could not find plugin "unicorn"/,
    );
    const withoutUnicorn: LinterTypes.Config[] = [
      ...aktionTypeScriptConfig,
      { files: ["**/*.aktion.ts", "**/*.aktion.js"], rules: { "unicorn/switch-case-braces": "off" } },
    ];
    expect(linter.verify("export const a = 1\n", withoutUnicorn, options)).toEqual([]);
  });

  it("unicorn/switch-case-braces `avoid` removes the braces Aktion cannot parse, where unicorn's default adds them", () => {
    const source = "export function pick(step) {\n  switch (step) {\n    case 0: { return 1 }\n    default: return 2\n  }\n}\n";
    expect(parse(source).errors.length).toBeGreaterThan(0);
    const options = { filename: "pick.aktion.js" };

    const preset = new Linter().verifyAndFix(
      source,
      [{ plugins: { unicorn: unicornPlugin } }, ...aktionTypeScriptConfig],
      options,
    );
    expect(preset.fixed).toBe(true);
    expect(preset.output).toContain("case 0: return 1");
    expect(parse(preset.output).errors).toEqual([]);

    const unicornDefault = new Linter().verifyAndFix(
      "export function pick(step) {\n  switch (step) {\n    case 0: return 1\n    default: return 2\n  }\n}\n",
      [{ files: ["**/*.js"], plugins: { unicorn: unicornPlugin }, rules: { "unicorn/switch-case-braces": "error" } }],
      options,
    );
    expect(unicornDefault.fixed).toBe(true);
    expect(parse(unicornDefault.output).errors.length).toBeGreaterThan(0);
  });
});

describe("aktionTypeScriptRules entries", () => {
  const entries = Object.entries(aktionTypeScriptRules);
  const pluginOf = (id: string): string | null => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : null);

  it("ports the measured list; `switch-case-braces` and `object-shorthand` are reconfigured, the rest off", () => {
    expect(Object.keys(aktionTypeScriptRules).sort()).toEqual(
      [
        "import-x/no-mutable-exports",
        "new-cap",
        "object-shorthand",
        "prefer-const",
        "prefer-destructuring",
        "unicorn/consistent-boolean-name",
        "unicorn/max-nested-calls",
        "unicorn/name-replacements",
        "unicorn/no-top-level-assignment-in-function",
        "unicorn/no-top-level-side-effects",
        "unicorn/prefer-early-return",
        "unicorn/prefer-export-from",
        "unicorn/prefer-global-this",
        "unicorn/prefer-set-has",
        "unicorn/prefer-string-raw",
        "unicorn/prefer-switch",
        "unicorn/switch-case-braces",
      ].sort(),
    );
    expect(entries.filter(([, setting]) => setting !== "off")).toEqual([
      ["object-shorthand", ["error", "properties"]],
      ["unicorn/switch-case-braces", ["error", "avoid"]],
    ]);
    // Gone since the runtime caught up: a bare `let a` parses (`no-useless-undefined`)
    // and `[...set]` spreads any iterable (`prefer-spread`, R4).
    expect("unicorn/no-useless-undefined" in aktionTypeScriptRules).toBe(false);
    expect("unicorn/prefer-spread" in aktionTypeScriptRules).toBe(false);
    // Shared with the `.aktion` preset, so the two cannot drift apart where
    // they make the same call.
    for (const id of [
      "unicorn/prefer-export-from",
      "unicorn/prefer-string-raw",
      "unicorn/prefer-switch",
      "unicorn/no-top-level-assignment-in-function",
      "new-cap",
    ]) {
      expect(aktionTypeScriptRules[id]).toEqual(aktionRecommendedRules[id]);
    }
  });

  it("names only core rules and rules of unicorn and import-x", () => {
    for (const [id] of entries) {
      expect([null, "unicorn", "import-x"]).toContain(pluginOf(id));
    }
  });

  it("every core entry is a rule ESLint ships", () => {
    for (const [id] of entries.filter(([id]) => pluginOf(id) === null)) {
      expect(builtinRules.has(id), id).toBe(true);
    }
  });

  it("every unicorn entry is a current eslint-plugin-unicorn rule", () => {
    for (const [id] of entries.filter(([id]) => pluginOf(id) === "unicorn")) {
      const rule = unicornPlugin.rules?.[id.slice("unicorn/".length)];
      expect(rule, id).toBeDefined();
      expect(rule!.meta?.deprecated ?? false, id).toBe(false);
    }
  });

  // eslint-plugin-import-x is not a dependency of this repo, so this check
  // only runs where it happens to be installed. Its one entry is `off`, which
  // ESLint never validates, so a consumer without the plugin is unaffected.
  it.skipIf(importXPlugin === null)("every import-x entry is a current eslint-plugin-import-x rule (runs only where the plugin is installed)", () => {
    for (const [id] of entries.filter(([id]) => pluginOf(id) === "import-x")) {
      expect(importXPlugin!.rules?.[id.slice("import-x/".length)], id).toBeDefined();
    }
  });

  it("ESLint accepts every entry, options included, once the plugins it names are loaded", () => {
    // ESLint validates a rule's existence and options only when it is not
    // `off`, so turn each entry on (keeping its options) to make ESLint check
    // it. Entries of a plugin that is not installed are left out: in this
    // repo that is the one `import-x` entry, which is `off` and therefore
    // never validated — it cannot fail a consumer without the plugin either.
    const plugins: Record<string, ESLint.Plugin> = { unicorn: unicornPlugin };
    if (importXPlugin) plugins["import-x"] = importXPlugin;
    const loaded = entries.filter(([id]) => pluginOf(id) === null || pluginOf(id)! in plugins);
    const rules = Object.fromEntries(
      loaded.map(([id, setting]) => [id, Array.isArray(setting) ? ["warn", ...setting.slice(1)] : "warn"]),
    ) as LinterTypes.RulesRecord;
    const config: LinterTypes.Config[] = [{ files: ["**/*.js"], plugins, rules }];
    expect(() => new Linter().verify("export const a = 1\n", config, { filename: "x.aktion.js" })).not.toThrow();
    const leftOut = entries.filter((entry) => !loaded.includes(entry)).map(([id]) => id);
    expect(leftOut).toEqual(importXPlugin ? [] : ["import-x/no-mutable-exports"]);
  });
});
