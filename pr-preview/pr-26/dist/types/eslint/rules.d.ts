import { Linter } from 'eslint';
/**
 * Rule overrides that are properties of the Aktion LANGUAGE ITSELF, not of
 * any one consumer's app — every consumer routing `.aktion` files through
 * `aktionProcessor` (see `processor.ts`) hits the same eight false positives
 * / grammar incompatibilities, because they all stem from this repo's own
 * grammar (`src/parser/parser.ts`) or this repo's own component/reactivity
 * idiom (`src/library`, `src/runtime`), not from anything a consumer wrote.
 *
 * Spread this into the `rules` block of whatever config matches the
 * processor's virtual `**\/*.aktion/*.ts` files (see this package's README
 * for the full two-block wiring a consumer needs). Every entry below is
 * cited as either:
 *
 * - **GENUINE GRAMMAR INCOMPATIBILITY** — the rule's autofix produces a
 *   construct this repo's own parser cannot parse. Turning the rule off
 *   entirely (not just its autofix) is the only safe option: even the
 *   non-fixed diagnostic is a false positive here, since the flagged
 *   pattern is the ONLY way to express the same thing in Aktion.
 * - **DSL-IDIOM FALSE POSITIVE** — the rule is doing exactly what it is
 *   designed to do, correctly, against JS/TS in general, but the pattern it
 *   flags is the DSL's normal, unavoidable idiom, not a mistake.
 *
 * `tests/eslint-corpus-sweep.test.ts` re-verifies all eight against this
 * repo's own real `.aktion` corpus on every test run — see that file for the
 * measured trigger counts. That whole-corpus sweep is how the eighth entry
 * (`unicorn/switch-case-braces`) was found: it doesn't appear in the
 * downstream dcd-monorepo pilot this rule set was originally ported from
 * (its own `.aktion` corpus happens not to contain a `switch` statement
 * shaped this way), but two files in THIS repo's own corpus
 * (`docs/demos/blocks/signup-wizard.aktion`,
 * `docs/demos/blocks/profile-header.aktion`) do, and the sweep caught the
 * corruption the same way it was designed to.
 */
export declare const aktionRecommendedRules: Linter.RulesRecord;
/**
 * Rule settings for Aktion modules AUTHORED IN TypeScript or JavaScript —
 * `*.aktion.ts` and `*.aktion.js`. Those files never pass through
 * `aktionProcessor`: to ESLint they are ordinary `.ts`/`.js` files, linted by
 * whatever parser and (type-aware) rule set the consumer already applies to
 * that extension. Aktion, however, compiles them by erasing the types and
 * handing the result to the SAME parser and evaluator as `.aktion` source, so
 * an autofix that is safe for JavaScript can still produce code Aktion cannot
 * parse — or code that parses and then runs differently.
 *
 * The record is the subset of the downstream dcd-monorepo consumer's measured
 * `.aktion` rule set (its root `eslint.aktion.js`, `aktionRules`, each entry
 * checked against a 155-file corpus on aktion-runtime 0.8.0) that holds for
 * erased TypeScript/JavaScript exactly as it does for `.aktion`. The parser and
 * evaluator facts below were re-checked against this repo's own `src/`; the
 * ones marked "measured" were run (the fix through ESLint, its output through
 * `parse()` or the evaluator). Each entry is cited as one of:
 *
 * - **GENUINE GRAMMAR INCOMPATIBILITY** / **DSL-IDIOM FALSE POSITIVE** — as in
 *   `aktionRecommendedRules` above.
 * - **SEMANTIC DIVERGENCE** — the autofix's output parses, but the Aktion
 *   evaluator computes something other than what JavaScript would, so the
 *   "equivalent" rewrite silently changes behaviour.
 * - **CROSS-MODULE RENAME** — the autofix renames, in the one file ESLint is
 *   looking at, a name that other modules depend on, so they break.
 *
 * Every entry is `"off"` except `unicorn/switch-case-braces`, which is
 * reconfigured instead. ESLint does not validate a rule that is off, so the
 * `"off"` entries are inert where their plugin is not installed. The one
 * enabled entry is not: a config applying this record needs
 * `eslint-plugin-unicorn` registered under the `unicorn` namespace (XO and
 * unicorn's own `configs.recommended` both do that), or ESLint rejects the
 * config with `Could not find plugin "unicorn"`. Without unicorn, add a later
 * block with `"unicorn/switch-case-braces": "off"` — the autofix it guards
 * against cannot run without the plugin either.
 *
 * `aktion/props-literal` is not in this record because it is this package's
 * own rule (`props-literal.ts`): `aktionTypeScriptConfig` in
 * `src/eslint-api.ts` registers the plugin and enables it next to these.
 */
export declare const aktionTypeScriptRules: Linter.RulesRecord;
