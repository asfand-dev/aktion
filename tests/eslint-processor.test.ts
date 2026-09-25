import {
  type ESLint,
  Linter,
  type Linter as LinterTypes,
  type Rule,
} from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
import aktionEslintPlugin from "../src/eslint-api.js";

/**
 * End-to-end tests against a REAL `eslint.Linter` instance — not a mock —
 * wired exactly the way a consumer's flat config would wire the plugin,
 * confirming the processor's `preprocess`/`postprocess`/`supportsAutofix`
 * contract actually holds under ESLint's own processor machinery, not just
 * under this package's own remap/scan unit tests in isolation.
 *
 * TWO config blocks, mirroring the shape every real ESLint processor plugin
 * uses (e.g. `eslint-plugin-markdown`'s `configs.recommended`) and the
 * `aktion-runtime/eslint` README's own documented wiring:
 * 1. `**\/*.aktion` — routes the file through the processor. No rules here;
 *    this block only ever sees the ORIGINAL, untransformed text.
 * 2. `**\/*.aktion/*.ts` — matches the VIRTUAL per-block path ESLint's own
 *    `ProcessorService` constructs (`path.join(file.path, block.filename)`,
 *    confirmed by reading `eslint/lib/services/processor-service.js`
 *    directly) once the extension changes from `.aktion` to `.ts`. This is
 *    where the parser and rules actually apply.
 *
 * `filterCodeBlock` is supplied explicitly because we're driving the raw
 * `Linter` class directly. The real `ESLint` class (what a consumer's CLI
 * actually uses under the hood) supplies this SAME "keep the block if any
 * config matches its filename" default itself
 * (`eslint/lib/eslint/eslint-helpers.js`'s `verifyText`) — `Linter`'s own
 * built-in fallback is a much more conservative `.endsWith(".js")`, which
 * would silently drop every block this processor produces.
 */
const config: LinterTypes.Config[] = [
  {
    files: ["**/*.aktion"],
    plugins: { aktion: aktionEslintPlugin },
    processor: "aktion/aktion",
  },
  {
    files: ["**/*.aktion/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      quotes: ["error", "double"],
      semi: ["error", "never"],
      "no-unused-vars": "error",
      "no-var": "error",
    },
  },
];

/**
 * Matches the real `ESLint` class's own default (see the block comment
 * above) rather than `Linter`'s much narrower `.js`-only fallback.
 */
const verifyOptions = { filename: "app.aktion", filterCodeBlock: () => true };

describe("aktionProcessor (end-to-end via eslint.Linter)", () => {
  it("parses a bare `export IDENTIFIER =` file with zero parse errors", () => {
    const linter = new Linter();
    const source = 'export ENDPOINT = "https://example.com"\n';
    const messages = linter.verify(source, config, verifyOptions);
    expect(messages.some(m => m.fatal)).toBe(false);
  });

  it("reports a real rule violation (single quotes) at the ORIGINAL position", () => {
    const linter = new Linter();
    const source = "export ENDPOINT = 'https://example.com'\n";
    const messages = linter.verify(source, config, verifyOptions);
    const quoteMessage = messages.find(m => m.ruleId === "quotes");
    expect(quoteMessage).toBeDefined();
    // The string literal starts right after "export ENDPOINT = " in the
    // ORIGINAL source — line 1, column 19 (1-based) — NOT shifted by the
    // "const " this processor injected internally.
    expect(quoteMessage!.line).toBe(1);
    expect(quoteMessage!.column).toBe(source.indexOf("'") + 1);
  });

  it("autofixes a real violation and the fix lands at the correct ORIGINAL offset", () => {
    const linter = new Linter();
    const source = "export ENDPOINT = 'https://example.com'\n";
    const result = linter.verifyAndFix(source, config, verifyOptions);
    expect(result.fixed).toBe(true);
    expect(result.output).toBe('export ENDPOINT = "https://example.com"\n');
    // Confirm the bare-export construct itself was never leaked into the
    // autofixed OUTPUT — the rewrite is purely an internal linting device.
    expect(result.output).not.toContain("const ENDPOINT");
  });

  it("autofixes multiple bare exports in one file, each at its own original offset", () => {
    const linter = new Linter();
    const source = [
      "export A = 'one'",
      "export $b = 'two'",
      "export CCC = 'three'",
      "",
    ].join("\n");
    const result = linter.verifyAndFix(source, config, verifyOptions);
    expect(result.fixed).toBe(true);
    expect(result.output).toBe([
      'export A = "one"',
      'export $b = "two"',
      'export CCC = "three"',
      "",
    ].join("\n"));
  });

  it("flags an unused-var violation with a message positioned on the real identifier", () => {
    const linter = new Linter();
    const source = "export UNUSED_LOCAL_HELPER = 1\nfunction useNothing() { const local = 2; return 1 }\n";
    const messages = linter.verify(source, config, verifyOptions);
    const unusedMessage = messages.find(m => m.ruleId === "no-unused-vars");
    expect(unusedMessage).toBeDefined();
    // "local" lives on line 2 in the ORIGINAL source (unaffected by the
    // export rewrite on line 1) — confirms multi-line remap correctness,
    // not just same-line offset arithmetic.
    expect(unusedMessage!.line).toBe(2);
  });

  it("remaps endLine/endColumn across MULTIPLE insertions, not just line/column", () => {
    // A custom rule reporting a span from the FIRST export statement's start
    // (before any insertion -- line/column unaffected) to the SECOND export
    // statement's end (after BOTH insertions' cumulative length -- endColumn
    // must subtract 12, not 6). This is the case a naive "just remap
    // line/column, leave endLine/endColumn as ESLint reported them" bug would
    // get wrong: the raw (transformed-world) endColumn here is 20 (right after
    // "export const B = 2"), but the ORIGINAL source's line 2 is
    // "export B = 2" (12 characters), so the correctly remapped endColumn is
    // 13 -- proving the fix subtracts BOTH insertions' lengths, not just the
    // one nearest the reported position.
    const spanPlugin: ESLint.Plugin = {
      rules: {
        "flag-span": {
          meta: {},
          create(context: Rule.RuleContext): Rule.RuleListener {
            return {
              Program(program) {
                const declarations = program.body.filter(node => node.type === "ExportNamedDeclaration");
                if (declarations.length < 2) {
                  return;
                }

                const first = declarations[0];
                const last = declarations.at(-1)!;
                context.report({
                  loc: { start: first.loc!.start, end: last.loc!.end },
                  message: "span",
                });
              },
            };
          },
        },
      },
    };

    const spanConfig: LinterTypes.Config[] = [
      {
        files: ["**/*.aktion"],
        plugins: { aktion: aktionEslintPlugin },
        processor: "aktion/aktion",
      },
      {
        files: ["**/*.aktion/*.ts"],
        plugins: { probe: spanPlugin },
        languageOptions: {
          parser: tsParser,
          ecmaVersion: 2022,
          sourceType: "module",
        },
        rules: {
          "probe/flag-span": "error",
        },
      },
    ];

    const linter = new Linter();
    const source = "export A = 1\nexport B = 2\n";
    const messages = linter.verify(source, spanConfig, verifyOptions);
    const message = messages.find(m => m.ruleId === "probe/flag-span");
    expect(message).toBeDefined();
    expect(message!.line).toBe(1);
    expect(message!.column).toBe(1);
    expect(message!.endLine).toBe(2);
    expect(message!.endColumn).toBe("export B = 2".length + 1);
  });

  it("a second --fix pass over the already-fixed output is a no-op (idempotent)", () => {
    const linter = new Linter();
    const source = "export ENDPOINT = 'https://example.com'\n";
    const first = linter.verifyAndFix(source, config, verifyOptions);
    const second = linter.verifyAndFix(first.output, config, verifyOptions);
    expect(second.fixed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  /**
   * Reproduces the leaked-fix hazard `rangeOverlapsInsertion` guards
   * against: a fix whose range starts exactly at the processor's own
   * injected `const ` span must never be remapped and applied verbatim —
   * its replacement text was generated against the TRANSFORMED source (the
   * one that already contains the injected keyword), so applying it at the
   * naively-remapped original offset can leak that injected text straight
   * into the real `.aktion` file.
   *
   * This mirrors the real-world trigger (`unicorn/prefer-export-from`
   * rewriting a bare-export file into an `export { … } from …` list, which
   * this repo's own grammar rejects outright — see `rules.ts`) with a
   * minimal custom rule instead of pulling in the whole unicorn plugin: the
   * rule fixes the ENTIRE `const IDENTIFIER = …` declaration it flags, and —
   * because that declaration's AST range starts at the literal `const`
   * keyword this processor injects — the fix's range always starts exactly
   * at the injected span's boundary.
   */
  describe("a fix overlapping the injected `const ` span is dropped, not corrupted", () => {
    const leakyFixPlugin: ESLint.Plugin = {
      rules: {
        "rewrite-declaration": {
          meta: { fixable: "code" },
          create(context: Rule.RuleContext): Rule.RuleListener {
            return {
              VariableDeclaration(node) {
                const [declarator] = node.declarations;
                if (node.kind !== "const" || declarator?.id.type !== "Identifier" || declarator.id.name !== "ALPHA") {
                  return;
                }

                context.report({
                  node,
                  message: "rewritten for test",
                  fix(fixer) {
                    // Replaces the WHOLE declaration -- including the literal
                    // `const` keyword this processor injected -- with text
                    // generated against the TRANSFORMED source. If this were
                    // ever applied at the naively-remapped original offset, the
                    // literal string `const ALPHA_RENAMED` would leak into the
                    // real `.aktion` file, which never had a `const` keyword.
                    return fixer.replaceText(node, "const ALPHA_RENAMED = 1");
                  },
                });
              },
            };
          },
        },
      },
    };

    const leakyConfig: LinterTypes.Config[] = [
      {
        files: ["**/*.aktion"],
        plugins: { aktion: aktionEslintPlugin },
        processor: "aktion/aktion",
      },
      {
        files: ["**/*.aktion/*.ts"],
        plugins: { leaky: leakyFixPlugin },
        languageOptions: {
          parser: tsParser,
          ecmaVersion: 2022,
          sourceType: "module",
        },
        rules: {
          "leaky/rewrite-declaration": "error",
        },
      },
    ];

    it("never leaks the injected `const` keyword into the fixed output", () => {
      const linter = new Linter();
      const source = "export ALPHA = 1\n";
      const result = linter.verifyAndFix(source, leakyConfig, verifyOptions);

      // The dangerous fix must never have been applied.
      expect(result.output).not.toContain("const");
      expect(result.fixed).toBe(false);
      expect(result.output).toBe(source);
    });

    it("still reports the diagnostic (without a fix) at the original position", () => {
      const linter = new Linter();
      const source = "export ALPHA = 1\n";
      const messages = linter.verify(source, leakyConfig, verifyOptions);
      const message = messages.find(m => m.ruleId === "leaky/rewrite-declaration");
      expect(message).toBeDefined();
      expect(message!.fix).toBeUndefined();
      // "ALPHA" starts right after "export " in the ORIGINAL source.
      expect(message!.line).toBe(1);
      expect(message!.column).toBe(source.indexOf("ALPHA") + 1);
    });
  });

  it("does not choke on a file with no bare exports at all", () => {
    const linter = new Linter();
    const source = "export function Foo() {\n  return 1\n}\n";
    const messages = linter.verify(source, config, verifyOptions);
    expect(messages.some(m => m.fatal)).toBe(false);
  });
});

describe("aktionEslintPlugin.configs.recommended", () => {
  it("exposes the processor-wiring + rules blocks a consumer splices into their own config", () => {
    expect(aktionEslintPlugin.configs).toBeDefined();
    const recommended = aktionEslintPlugin.configs!.recommended;
    expect(Array.isArray(recommended)).toBe(true);
    const blocks = recommended as LinterTypes.Config[];
    const processorBlock = blocks.find(block => "processor" in block);
    expect(processorBlock?.files).toEqual(["**/*.aktion"]);
    const rulesBlock = blocks.find(block => block.files?.[0] === "**/*.aktion/*.ts");
    expect(rulesBlock?.rules).toMatchObject({
      "object-shorthand": "off",
      "unicorn/prefer-export-from": "off",
      "unicorn/prefer-string-raw": "off",
      "new-cap": "off",
      "unicorn/max-nested-calls": "off",
      "unicorn/no-optional-chaining-on-undeclared-variable": "off",
      "unicorn/no-top-level-side-effects": "off",
      "unicorn/switch-case-braces": "off",
    });
  });

  it("lints for real when spliced with a consumer-supplied parser block", () => {
    const linter = new Linter();
    const consumerConfig: LinterTypes.Config[] = [
      ...(aktionEslintPlugin.configs!.recommended as LinterTypes.Config[]),
      {
        files: ["**/*.aktion/*.ts"],
        languageOptions: {
          parser: tsParser,
          ecmaVersion: 2022,
          sourceType: "module",
        },
      },
    ];

    const source = "export ENDPOINT = 'https://example.com'\n";
    const result = linter.verifyAndFix(source, consumerConfig, verifyOptions);
    // `quotes`/`semi` aren't configured in this consumer config, but a
    // genuinely broken parse would still show up as a fatal message — the
    // point of this test is that the recommended rules block (which turns
    // OFF eight rules) does not prevent the file from linting at all.
    expect(result.messages.some(m => m.fatal)).toBe(false);
  });
});
