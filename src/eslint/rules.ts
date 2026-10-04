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
  // FORMERLY A GRAMMAR INCOMPATIBILITY, KEPT OFF: `object-shorthand`'s autofix
  // rewrites a `key: function (…) { … }` handler into method shorthand
  // (`{ onClick() { … } }`). That used to be a parse error; since the parser
  // widening (2026-10-02) it parses to the same `Lambda` handler
  // (`tests/eslint-corpus-sweep.test.ts` pins the round trip). The override is
  // kept so existing `.aktion` corpora are not restyled by an upgrade; the
  // TypeScript preset below enforces the `properties` form instead.
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
  // grammar rejects with a "Tagged template literals are not supported"
  // parse error.
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
export const aktionTypeScriptRules: Linter.RulesRecord = {
  // RECONFIGURED, not off: method shorthand (`{ onClick() { … } }`) parses to
  // the same handler since the parser widening, but the guide keeps handlers in
  // property form; `properties` enforces only `{ title }` for `{ title: title }`,
  // which the JS-semantics layer keeps working after renaming locals (W1).
  "object-shorthand": ["error", "properties"],
  // GENUINE GRAMMAR INCOMPATIBILITY, reconfigured rather than off: a braced
  // case body parses as an object literal (no `BlockStatement` production, see
  // above), so unicorn's default `always` corrupts every switch it fixes, while
  // `avoid` only ever REMOVES braces. It does not report braces around a body
  // that declares something (`case 1: { const y = x … }`), which still fails
  // to parse.
  "unicorn/switch-case-braces": ["error", "avoid"],
  // GENUINE GRAMMAR INCOMPATIBILITY: the fix creates an `export { … } from …`
  // list, which `parseExportStatement` rejects (see above).
  "unicorn/prefer-export-from": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: the fix creates a tagged template
  // (`` String.raw`…` ``), which the parser rejects (see above).
  "unicorn/prefer-string-raw": "off",
  // SEMANTIC DIVERGENCE: the fix turns `const count = cart.count` into
  // `const { count } = cart`, and destructuring a `$store`/`$form` handle reads
  // nothing (measured: `null`) where the member access reads the field.
  "prefer-destructuring": "off",
  // DSL-IDIOM FALSE POSITIVE: the premise (build the Set once, look up many
  // times) does not hold — a module-level binding re-seeds from its
  // initialiser on every render (`resetMutableBindings`), so the Set is rebuilt
  // as often as the array it replaces.
  "unicorn/prefer-set-has": "off",
  // SEMANTIC DIVERGENCE: the fix hoists a nested block's statements to the
  // function body, and a `$x = …` at the top level of a component body
  // declares per-instance state initialised ONCE (`evaluateUserComponent`),
  // where the same statement inside a block assigns on every render.
  "unicorn/prefer-early-return": "off",
  // SEMANTIC DIVERGENCE: the fix swaps `window` for `globalThis`; both resolve
  // through the host-global passthrough, but an explicit access policy
  // (`setGlobalAccessPolicy(["window", …])`) admits only the names it lists,
  // so the rewrite can turn a permitted read into a blocked one.
  "unicorn/prefer-global-this": "off",
  // CROSS-MODULE RENAME: exported names are only reported, but the fix renames
  // an exported component's PARAMETERS (measured: `export function Row(btn)`
  // → `Row(button)`), and parameter names are a component's named-argument
  // API — a caller's `Row({ btn: x })` binds by parameter name
  // (`invokeComponentDecl`).
  "unicorn/name-replacements": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: the fix prefixes the whole name, so
  // `let $open = false` becomes `let is$open = false` (measured), which the
  // lexer reads as `is` followed by the atom `$open` — a parse error.
  "unicorn/consistent-boolean-name": "off",
  // DSL-IDIOM FALSE POSITIVE: components are PascalCase calls without `new`
  // (`Button(…)`, see above).
  "new-cap": "off",
  // DSL-IDIOM FALSE POSITIVE: a component tree is nested calls by
  // construction (see above).
  "unicorn/max-nested-calls": "off",
  // DSL-IDIOM FALSE POSITIVE: `$app(…)` and `$effect(…)` are bare top-level
  // calls by design (see above).
  "unicorn/no-top-level-side-effects": "off",
  // DSL-IDIOM FALSE POSITIVE: exported state is `export let $count = 0`, a
  // `let` that importing modules write to.
  "import-x/no-mutable-exports": "off",
  // DSL-IDIOM FALSE POSITIVE: `$` state is declared with `let` and is often
  // written only through a two-way binding (`Input("Name", { value: $name })`)
  // or by an importing module — writes ESLint cannot see.
  "prefer-const": "off",
};
