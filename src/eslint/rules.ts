import type { Linter } from "eslint";

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
export const aktionRecommendedRules: Linter.RulesRecord = {
  // GENUINE GRAMMAR INCOMPATIBILITY: `parseObjectProps` in
  // `src/parser/parser.ts` accepts a `key: value` entry or a bare
  // property-value shorthand (`{ foo }` for `{ foo: foo }`) but has no
  // production at all for ES6 METHOD shorthand (`{ onClick() { … } }`) — the
  // token immediately after an object key is either `:` or a `,`/`}` that
  // closes the property-value-shorthand case; anything else (e.g. a `(`
  // opening a method's parameter list) is a parse error. `object-shorthand`'s
  // autofix rewrites `onClick: () => { … }` handlers into `onClick() { … }`,
  // which is valid JS/TS but an Aktion parse error.
  "object-shorthand": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: `parseExportStatement` in
  // `src/parser/parser.ts` throws an explicit parse error on `export { … }`
  // ("`export { … }` lists are not supported yet") — there is no production
  // for a re-export list at all. `unicorn/prefer-export-from`'s autofix
  // CREATES exactly that construct from a plain same-file `import` plus
  // `export`.
  "unicorn/prefer-export-from": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: this repo's tokenizer/parser has no
  // tagged-template-literal production — a program is built from plain
  // string, template-literal, and identifier tokens, never a JS tagged-
  // template call form. `unicorn/prefer-string-raw`'s autofix rewrites a
  // backslash-bearing string literal into a tagged template
  // (`` String.raw`…` ``), which a real JS/TS parser accepts but this
  // grammar cannot.
  "unicorn/prefer-string-raw": "off",
  // DSL-IDIOM FALSE POSITIVE: Aktion's component-instantiation idiom
  // (`Container(...)`, `Text(...)`, `Row(...)`, any entry in
  // `src/library`'s component catalogue) is a capitalized function call to a
  // JS/TS linter, but it is the DSL's NORMAL syntax for building the
  // component tree — there is no other way to write it. `new-cap` reads
  // every one of these as a constructor-vs-plain-call mistake.
  "new-cap": "off",
  // DSL-IDIOM FALSE POSITIVE, same root cause as `new-cap` above: the
  // component tree IS deeply nested calls (`Column([Row([Button(...), ...])])`
  // and deeper) — that is the normal SHAPE of an Aktion UI declaration, not a
  // cyclomatic-complexity problem `unicorn/max-nested-calls` is designed to
  // catch.
  "unicorn/max-nested-calls": "off",
  // DSL-IDIOM FALSE POSITIVE: `route` (no `$` prefix) is a screen-scope
  // global the RUNTIME injects directly into evaluation scope — see
  // `src/runtime/evaluator.ts`'s `ctx.trackedState.add("route")` — the same
  // class of binding as `$router`, just without the sigil, documented as
  // `route.path` / `route.params` / `route.query` / `route.navigate(...)`
  // (`docs/routing.html`). It is never declared via `let`/`const`/`import`
  // in any Aktion source, which is exactly what makes typescript-eslint call
  // it "undeclared" the moment it's accessed through an optional chain
  // (`route.params?.id`) — the rule has no way to know the runtime injects
  // it.
  "unicorn/no-optional-chaining-on-undeclared-variable": "off",
  // DSL-IDIOM FALSE POSITIVE: registering a reactive primitive
  // (`$effect(() => {...}, [...])`, `$store(...)`, `pages = $router({...})`)
  // via a bare call at MODULE TOP LEVEL is how this DSL wires up its
  // reactive/effect system — there is no other call site for it. Real-corpus
  // precedent: dozens of `docs/demos/**/*.aktion` files register a top-level
  // `$effect(...)` this same way (see `tests/eslint-corpus-sweep.test.ts`
  // for the measured count).
  "unicorn/no-top-level-side-effects": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY, found by this package's own corpus
  // sweep (not carried over from the downstream pilot this rule set
  // originated from — see the module doc comment above): `parseStatementImpl`
  // in `src/parser/parser.ts` has no `BlockStatement` production at all — a
  // leading `{` in statement position falls through to
  // `parseExpressionStatement` → `parseExpression`, which parses it as an
  // OBJECT LITERAL, the grammar's only interpretation of a bare `{`.
  // `unicorn/switch-case-braces`'s autofix wraps a `case N: return X` body in
  // `case N: { return X }` — valid, unambiguous JS/TS (lexical block
  // scoping), but this grammar reads the injected `{` as the start of an
  // object literal expression and `return` inside it as a malformed object
  // key, producing a cascade of parse errors. Confirmed real-world trigger:
  // `docs/demos/blocks/signup-wizard.aktion` and
  // `docs/demos/blocks/profile-header.aktion`, the only two files in this
  // corpus with a `case N: return …` shaped switch statement.
  "unicorn/switch-case-braces": "off",
};
