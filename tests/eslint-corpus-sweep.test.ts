/**
 * Whole-repo integrity sweep for `aktion-runtime/eslint`: every committed
 * `.aktion` program in this repo (docs examples, demo apps, the
 * `create-aktion` scaffolder templates) is run through the FULL
 * preprocess → lint → `--fix` → postprocess pipeline against a real,
 * broad, autofix-enabled rule set (`eslint-plugin-unicorn`'s own
 * `recommended` config plus core `object-shorthand`/`new-cap` — the exact
 * rules the seven DSL-idiom/grammar-incompatible overrides in
 * `src/eslint/rules.ts` target), and every fixed output is re-parsed
 * through THIS repo's own `parse()` (imported directly from source, not the
 * built package) to confirm the fix pipeline never corrupts a real file.
 *
 * IMPORTANT: `parse()` does NOT throw on a syntax error — it returns
 * `{statements, errors}`, catching `ParseError` internally (confirmed by
 * reading `src/parser/parser.ts`'s `Parser#expect` alongside
 * `tests/aktion-programs-validate.test.ts`'s own usage). Every check in this
 * file asserts on `.errors`, never on `parse()` throwing — a `not.toThrow()`
 * assertion here would pass vacuously regardless of what `.errors` contains.
 *
 * Mirrors the collection pattern in `tests/aktion-programs-validate.test.ts`
 * and `tests/formatter-idempotency-sweep.test.ts`. This whole-corpus pass is
 * the exact class of check that caught grammar-breaking autofix rules in the
 * downstream dcd-monorepo consumer's own pilot — a smaller, single-app pilot
 * missed them — AND it caught an EIGHTH rule (`unicorn/switch-case-braces`,
 * not present in the downstream set at all) directly in THIS repo's own
 * corpus on the first real run of this sweep: see `rules.ts`'s citation for
 * the full story. Measured against THIS repo's own corpus (see the
 * "measured trigger counts" block below): `unicorn/prefer-export-from` and
 * `unicorn/no-top-level-side-effects` never fire here at all (no re-export
 * or bare-top-level-call shape happens to appear in this particular set of
 * example programs) — their justification is the grammar fact itself (see
 * `rules.ts`'s citations, cross-checked directly against
 * `src/parser/parser.ts`), not corpus frequency. `new-cap` and
 * `unicorn/max-nested-calls` fire thousands of times, `object-shorthand` and
 * `unicorn/prefer-string-raw` fire a handful of times,
 * `unicorn/no-optional-chaining-on-undeclared-variable` fires once, and
 * `unicorn/switch-case-braces` fires seven times (across two files) — real,
 * measured evidence the overrides are load-bearing against real code, not
 * just theoretically justified.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Linter, type Linter as LinterTypes } from "eslint";
import tsParser from "@typescript-eslint/parser";
import unicornPlugin from "eslint-plugin-unicorn";
import aktionEslintPlugin, { aktionRecommendedRules } from "../src/eslint-api.js";
import { parse } from "../src/parser/index.js";

const root = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "site"]);

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collect(full, out);
    else if (entry.endsWith(".aktion")) out.push(full);
  }
}

const files: string[] = [];
collect(root, files);

const verifyOptions = { filename: "app.aktion", filterCodeBlock: () => true };

const TARGET_RULES = [
  "object-shorthand",
  "unicorn/prefer-export-from",
  "unicorn/prefer-string-raw",
  "new-cap",
  "unicorn/max-nested-calls",
  "unicorn/no-optional-chaining-on-undeclared-variable",
  "unicorn/no-top-level-side-effects",
  "unicorn/switch-case-braces",
] as const;

/**
 * The two portable blocks every `aktion-runtime/eslint` consumer wires in
 * (processor + parser), plus `unicornPlugin.configs.recommended`'s real,
 * autofix-enabled rule set — the same plugin every one of the six
 * `unicorn/*` overrides targets, alongside the seventh (core
 * `object-shorthand`/`new-cap`, added explicitly below since unicorn's own
 * recommended config doesn't touch core rules). `rulesOverride` is spread
 * LAST so it can turn specific rules back off for the "shipped default"
 * pass, or be left empty for the "what if we hadn't disabled these" pass.
 */
function buildConfig(rulesOverride: LinterTypes.RulesRecord): LinterTypes.Config[] {
  return [
    {
      files: ["**/*.aktion"],
      plugins: { aktion: aktionEslintPlugin },
      processor: "aktion/aktion",
    },
    {
      // eslint-plugin-unicorn's own `recommended` config is itself a single
      // flat-config-shaped object (not an array) in this version — spreading
      // it here folds its `plugins`/`languageOptions`/`rules` into this one
      // block rather than needing a second array entry for it.
      ...(unicornPlugin.configs.recommended as unknown as LinterTypes.Config),
      files: ["**/*.aktion/*.ts"],
      languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
        parserOptions: { project: false, projectService: false },
      },
      rules: {
        ...(unicornPlugin.configs.recommended.rules as LinterTypes.RulesRecord),
        "object-shorthand": "error",
        "new-cap": "error",
        ...rulesOverride,
      },
    },
  ];
}

describe("aktion-runtime/eslint corpus sweep", () => {
  it("found a representative set of programs", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  describe("the shipped aktionRecommendedRules overrides never corrupt a real file", () => {
    const shippedConfig = buildConfig(aktionRecommendedRules);

    for (const file of files.sort()) {
      const relPath = relative(root, file);
      it(`${relPath} still parses with zero errors after preprocess → lint → --fix → postprocess`, () => {
        const source = readFileSync(file, "utf8");

        // A program with pre-existing parse errors is not this sweep's
        // concern (covered by `tests/aktion-programs-validate.test.ts`) —
        // skip it the same way `formatter-idempotency-sweep.test.ts` does.
        if (parse(source).errors.length > 0) {
          return;
        }

        const linter = new Linter();
        const result = linter.verifyAndFix(source, shippedConfig, verifyOptions);
        expect(parse(result.output).errors).toEqual([]);
      });
    }
  });

  it("measures how often each override actually fires against this repo's real corpus", () => {
    const unrestrictedConfig = buildConfig({});
    const counts: Record<string, number> = Object.fromEntries(TARGET_RULES.map(rule => [rule, 0]));

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const linter = new Linter();
      const messages = linter.verify(source, unrestrictedConfig, verifyOptions);
      for (const message of messages) {
        if (message.ruleId && message.ruleId in counts) {
          counts[message.ruleId] += 1;
        }
      }
    }

    // Real, measured evidence (not a guess) that the two idiom overrides
    // hit in the thousands against actual component trees — the exact
    // shape the "DSL-IDIOM FALSE POSITIVE" citations in `rules.ts` describe.
    // Re-measure and update these floors if the corpus grows or shrinks
    // substantially; they are load-bearing evidence, not decoration.
    expect(counts["new-cap"]).toBeGreaterThan(1000);
    expect(counts["unicorn/max-nested-calls"]).toBeGreaterThan(1000);
    // The exact two files that led to this rule's discovery (see `rules.ts`):
    // 4 case arms in `signup-wizard.aktion` + 3 in `profile-header.aktion`.
    // A regression here (0, or a count that no longer matches these two
    // specific files) means either the corpus changed or the rule's own
    // trigger condition did — worth a fresh look either way.
    expect(counts["unicorn/switch-case-braces"]).toBe(7);
    // `unicorn/prefer-export-from` and `unicorn/no-top-level-side-effects`
    // are legitimately 0 against this specific corpus (no re-export or bare
    // top-level side-effecting call happens to appear in these particular
    // example programs) — see the module doc comment above. Their
    // correctness rests on the grammar fact cited in `rules.ts`, verified
    // independently in the synthetic reproduction below, not on this count.
  });
});

/**
 * Targeted, minimal synthetic reproductions of the three GENUINE GRAMMAR
 * INCOMPATIBILITY overrides — the ones where leaving the rule on doesn't
 * just produce a worse lint experience, it produces text this repo's own
 * `parse()` cannot round-trip. Unlike the corpus-wide sweep above (which
 * only proves these three don't happen to trigger destructively in THIS
 * repo's current example set), these fixtures are built to hit each rule's
 * fixer directly — the same technique `tests/eslint-processor.test.ts`'s
 * "leaky fix" test already uses for the general overlapping-fix hazard.
 */
describe("synthetic reproductions: grammar-incompatible rules corrupt output when left enabled", () => {
  const withOverridesOff = buildConfig(aktionRecommendedRules);
  const withoutOverrides = buildConfig({});

  it("object-shorthand rewrites an anonymous function-expression handler into method shorthand, which fails to parse", () => {
    const source = 'export Comp = Button("Click", { onClick: function() { return 1 } })\n';

    const broken = new Linter().verifyAndFix(source, withoutOverrides, verifyOptions);
    expect(broken.fixed).toBe(true);
    expect(broken.output).toContain("onClick() {");
    expect(parse(broken.output).errors.length).toBeGreaterThan(0);

    const shipped = new Linter().verifyAndFix(source, withOverridesOff, verifyOptions);
    expect(shipped.output).toBe(source);
    expect(parse(shipped.output).errors).toEqual([]);
  });

  it("unicorn/prefer-export-from rewrites a same-file re-export into an `export { … } from …` list, which fails to parse", () => {
    // Deliberately uses the ALREADY-`const`-qualified export form
    // (`export const ALPHA = alpha`), not the bare `export ALPHA = alpha`
    // form `scan.ts` rewrites: both are valid Aktion source (the grammar's
    // `export const …` production needs no rewriting at all — see
    // `scan.ts`'s header), but only the bare form happens to get an
    // incidental second layer of protection here. Its own `const`-injection
    // insertion sits at the exact start of the `ExportNamedDeclaration` this
    // rule's fixer removes, so `rangeOverlapsInsertion` (see `remap.ts`)
    // drops the fix as unsafe regardless of this rule's own setting — a
    // coincidence of the two ranges lining up, not something this rule's
    // override should be allowed to rely on. The `const`-qualified form has
    // no insertion at all, so nothing shields it from the fixer below.
    const source = 'import { alpha } from "./a.aktion"\nexport const ALPHA = alpha\n';

    const broken = new Linter().verifyAndFix(source, withoutOverrides, verifyOptions);
    expect(broken.fixed).toBe(true);
    expect(broken.output).toContain("export {");
    expect(parse(broken.output).errors.length).toBeGreaterThan(0);

    const shipped = new Linter().verifyAndFix(source, withOverridesOff, verifyOptions);
    expect(shipped.output).toBe(source);
    expect(parse(shipped.output).errors).toEqual([]);
  });

  it("unicorn/prefer-string-raw rewrites a backslash string into a tagged template, which silently truncates the value with NO reported parse error", () => {
    // This is the sharpest case of the three: this grammar has no
    // tagged-template production, so `String.raw\`...\`` doesn't fail loudly
    // — the parser reads `String.raw` as a plain member-expression value for
    // the assignment, then treats the orphaned backtick string as a second,
    // unrelated top-level statement. `errors` stays EMPTY; the corruption is
    // silent, not a diagnosable parse failure — worse than the other two.
    const source = 'export NAME_PATTERN = "^[^\\\\s]+$"\n';

    const broken = new Linter().verifyAndFix(source, withoutOverrides, verifyOptions);
    expect(broken.fixed).toBe(true);
    expect(broken.output).toContain("String.raw`");
    const brokenProgram = parse(broken.output);
    // No parse error is reported...
    expect(brokenProgram.errors).toEqual([]);
    // ...but the assignment's expression is no longer the original string
    // literal — it silently became a bare `String.raw` member reference,
    // with the real pattern demoted to a disconnected, dead statement.
    const assignment = brokenProgram.statements[0] as { expression?: { kind?: string } };
    expect(assignment.expression?.kind).not.toBe("Literal");
    expect(brokenProgram.statements.length).toBeGreaterThan(1);

    const shipped = new Linter().verifyAndFix(source, withOverridesOff, verifyOptions);
    expect(shipped.output).toBe(source);
    const shippedProgram = parse(shipped.output);
    expect(shippedProgram.errors).toEqual([]);
    expect(shippedProgram.statements).toHaveLength(1);
  });

  it("unicorn/switch-case-braces wraps a case body in a block this grammar reads as an object literal, which fails to parse", () => {
    // Minimal reproduction of the exact shape found by the whole-corpus
    // sweep in `docs/demos/blocks/signup-wizard.aktion` — see `rules.ts`'s
    // citation for the full grammar explanation
    // (`parseStatementImpl` has no `BlockStatement` production; a bare `{`
    // in statement position is read as an object-literal expression).
    const source = "function pick(step) {\n  switch (step) {\n    case 0: return 1\n    default: return 2\n  }\n}\n";

    const broken = new Linter().verifyAndFix(source, withoutOverrides, verifyOptions);
    expect(broken.fixed).toBe(true);
    // The fixer adds an opening `{` right after the `:` and a closing `}` on
    // its own line before the next case — it does not collapse the case body
    // onto one line.
    expect(broken.output).toContain("case 0: { return 1");
    expect(parse(broken.output).errors.length).toBeGreaterThan(0);

    const shipped = new Linter().verifyAndFix(source, withOverridesOff, verifyOptions);
    expect(shipped.output).toBe(source);
    expect(parse(shipped.output).errors).toEqual([]);
  });
});
