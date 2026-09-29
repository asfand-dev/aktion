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
