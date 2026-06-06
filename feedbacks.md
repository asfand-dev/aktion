# Aktion — Developer Feedback & Analysis

> Reviewer perspective: a senior full-stack TypeScript / frontend engineer who read
> the runtime, parser, component library, renderer, tooling, compiler, tests, and the
> documentation site, then imagined building a real, complex SaaS-grade application
> with it.
>
> Scope reviewed: `src/**`, `docs/**`, `tests/**`, `editors/**`, `create-aktion/**`,
> `examples/**`, `README.md`, `coding-gen-skill.md`. The `_docs/**` and
> `feedbacks/**` folders were intentionally **not** read.

---

## 0. Framing — what is this library, really?

Before the critique, it's important to be fair about the design intent, because most
"gaps vs React" only matter once you know which game Aktion is playing.

Aktion is **a streaming, framework-agnostic web component that renders LLM-generated
UI** from a JS-subset DSL. The whole architecture is optimized for one job: *an LLM
emits a program token-by-token, and the user sees a correct, interactive UI appear as
it streams.* Everything that looks unusual from a React lens — the line-oriented
parser, the schema-as-truth validation, the silent-null runtime, the system-prompt
generator, the delta protocol, "skeleton on unknown component" — is a deliberate,
well-executed choice **for that job**.

So this document answers two related but different questions:

1. **As an LLM-UI runtime** (its actual target): it is genuinely strong, often ahead
   of the field (the testing library, DevTools, visual editor, and playground are more
   mature than most v0.5 projects ever ship).
2. **"Can it be as good as React for complex hand-authored frontend apps?"** (what you
   asked): not today, and several of the gaps are structural rather than cosmetic.

I'll keep both lenses visible throughout so the feedback is actionable rather than just
"it's not React."

---

## 1. What would it take to be "as good as React for complex apps"? Gaps & what's missing

The single most important realization: **for complex apps, the headline feature
(fine-grained reactivity) and the most React-familiar API tier (`$state`/`$memo`
hooks) are in direct conflict.** Below are the gaps ranked by how much they block a
real app, with evidence.

### 1.1 Critical structural gaps

#### (a) No DOM refs — third-party integration is effectively impossible
There is no `useRef`-to-a-DOM-node equivalent anywhere. User-authored components never
touch the live DOM; they only return evaluator nodes. The only escape hatches are
`HTMLTag` and `Styles` (raw markup/CSS), which let you *emit* markup but never *run
script against a rendered node*.

Consequence: you cannot integrate Chart.js, Mapbox/Leaflet beyond the bundled `Map`,
Stripe Elements, a focus trap, a `ResizeObserver`-driven layout, or any imperative
library — without dropping down to writing a built-in component spec in TypeScript and
`registerComponents(...)`. In React this is a 10-line `useRef` + `useEffect`. This is
the number-one blocker for "complex apps."

#### (b) No Context API / dependency injection / scoped providers
`$store({...})` is the closest thing, but stores are **global singletons keyed by their
source location** (`evaluateStoreCall` keys by `${line}:${col}`). You cannot:
- instantiate the same store factory at two call sites to get two scoped instances,
- provide a different value to a subtree (a `<ThemeProvider>` around one panel),
- inject test fixtures/mocks by wrapping a subtree.

There is no `createContext`/`useContext` analogue at all. For complex apps this kills
multi-tenant theming, scoped feature state, and clean testing seams.

#### (c) The data layer is a single un-cached primitive
`$http({...})` is the *only* network primitive and it is missing everything a real app
data layer needs:
- **No caching, no request deduplication.** Two components calling
  `$http({ url: "/api/me" })` fire two requests. No `staleTime`/`cacheTime`/query keys.
- **No mutation primitive.** `$http({...})` **fires immediately on construction**
  (`http.ts` ends `run()` synchronously). There is no "build a request to fire later."
  To POST on a button click you must hold the resource in state and `refetch()` — but
  the request config is captured at construction, so refetch re-sends the original
  body. Every form submit is hand-rolled state juggling.
- **Optimistic updates are documented but dead code.** `ActionDeclaration.optimistic`
  exists in the AST (`parser/types.ts:377`) and the runner has full snapshot/rollback
  machinery (`effects.ts:628-696`), but the parser **hardcodes `optimistic: false`**
  (`parser.ts:236`) and nothing else ever sets it true. So the optimistic path can
  never execute. This is a real correctness/feature gap, not a nuance.
- No pagination/infinite-scroll helpers, no polling, no retry/backoff, no SSE/streaming
  response support, no parallel-fetch coordination.

A complex app needs the React-Query/SWR layer. Here you build it by hand on top of a
primitive that re-fires on construct.

#### (d) The hook tier defeats the headline reactivity claim
Path-granular reactivity (`pathAffects` in `state.ts:43-48`) is real and elegant — but
**only for `$name = value` atoms and `$store` fields.** The moment a change goes
through `ctx.notify()` it calls `requestFullRender()` (`element.ts:887-895`), which sets
`forceFullRender` and re-executes the *entire* tree with memoization disabled. And
`notify()` is what's called by:
- every `$state` setter,
- `$memo` recomputation,
- every `$http` lifecycle transition (`loading → data`),
- `setTimeout`/`setInterval` callbacks,
- effect bodies that mutate state,
- `$emit`.

So an app written in the most React-familiar style (`const [x, setX] = $state(...)`)
gets **no fine-grained benefit at all** — each interaction is "uncached React with a
full-tree re-render." The advertised reactivity applies to the *older* atom/store
style, which is the opposite of what a React dev will reach for. This needs to be
either fixed (route hook/`$http` updates through the path-tracker) or documented loudly.

#### (e) No type system for the DSL
`.aktion` files are not type-checked and there is no type-annotation syntax in the
grammar. Component params are untyped (`function Counter(initial)` — `initial` is
`any`), `$state` atoms are untyped (`$count = 0` then `$count = "oops"` is allowed),
and library prop types are *string identifiers* (`type: "Series[]"`), validated only
for unknown-name and string-literal-enum cases. For a complex codebase, losing
compiler-grade types is losing the main tool that makes large React+TS apps
maintainable.

#### (f) Routing is hash-only
`$router` is hash-based only (`#/users/42`), with no History API mode, no nested route
components, no data-loading routes (`loader`/`action` à la React Router), no scroll
restoration, no route transitions. Fine for an embedded LLM surface; a non-starter for
a marketing site or an app that needs clean URLs and SSR.

### 1.2 Important (not fatal) gaps

| Expected (React) | Aktion today | Status |
|---|---|---|
| `useReducer` | none | missing — hand-roll `$state` + switch |
| `useRef` (mutable box) | none | missing |
| `useId` | none | missing (ids hard-coded) |
| `Suspense` (tree boundary) | `Async`/`Lazy` components | partial; `Lazy` is "best-effort static" only |
| `ErrorBoundary` | `ErrorBoundary` component | present but doesn't catch async errors, no reset/`getDerivedStateFromError` |
| `Portal` | `Portal` component | present but **subtree doesn't participate in morph → focus lost every render** (a focused input inside a Portal loses focus on every state change) |
| `useTransition`/`useDeferredValue` | none | missing (all renders sync via microtask) |
| SSR + hydration | `serializeState`/`hydrateState` exist; no server renderer | client-only ship |
| i18n | `$i18n` with `{name}` placeholders | very basic — no ICU/CLDR plurals; `$util.plural` only appends English "s" |
| Animations / transitions | none at runtime; no FLIP, no enter/exit hooks | missing |
| Form framework | `Form`/`FormControl` are presentational | no `useForm`-style collector, no schema (Zod/Yup), no async/cross-field validation |
| Drag-and-drop reorder | only `ResizablePanels` drags | Kanban components are presentation-only |
| Virtualization | `VirtualList` fixed-height only; `DataGrid` not virtualized | a 100k-row grid renders all DOM |

### 1.3 What it would take (concrete roadmap to "React-grade")
1. **Add DOM refs** for user components (a `ref` helper that yields the node post-mount)
   and a real component-author API (`onMount`/`onUnmount`/`ref`). This unblocks the
   entire third-party ecosystem.
2. **Route hook/`$http`/timer updates through the path tracker** so adopting `$state`
   doesn't silently disable fine-grained rendering. This is the highest-leverage
   internal fix.
3. **Ship a data layer**: a `$query`/`$mutation` pair with keys, caching, dedup, and a
   deferred-fire mutation. Wire the existing optimistic rollback machinery to real
   syntax (it's already written — just dead).
4. **Add a Context/provider primitive** (scoped `$store` instances, or
   `Provide(value, children)` + `inject()`).
5. **A real (optional) type story** — even gradual: typed props via a small annotation
   subset or `.d.ts` generation from `registerComponents`, plus typed `$state`.
6. **History-mode routing** with nested routes and data loaders.
7. **Portal-in-morph** so overlays preserve focus; FLIP/transition hooks for
   enter/exit.

None of these is required for the LLM-UI use case — but all are required to credibly
say "as good as React for complex apps."

---

## 2. What's complicated and could be simplified

### 2.1 `$x = expr` means four different things depending on scope (biggest one)
The same syntax behaves differently based on where it appears:
- **Top level:** declares a reactive atom; a non-literal RHS becomes a *computed
  derivation* (`installComputedStateDerivations`).
- **Inside `function Pascal(...)` (component):** a **per-instance state declaration**
  (initializer runs once, value persists across renders).
- **Inside `function name(...)` (action) / effect / lambda:** a plain reactive
  *write*.

So `$count = 0` is a declaration in one place and an assignment in another, with no
syntactic difference. The runtime even needs a *render guard* (`state.ts:74-84,
112-119`) specifically because authors keep accidentally writing reactive state during
render. This is the single most cognitively expensive rule in the language, and it's the
kind of thing both humans and LLMs get subtly wrong. **Suggestion:** introduce a
distinct declaration keyword/sigil (or lint) so "declare" vs "assign" is visible in the
source.

### 2.2 Three coexisting state models with different rules
`$name = value` atoms, `$state`/`$memo` hooks, and `$store({...})` each have different
reactivity (path-tracked vs untracked), different reset semantics (persist vs
reset-on-unmount vs never), and different re-render behavior (gated vs full-tree). A
newcomer must learn all three and *when* to use each, and mixing them is encouraged by
the docs. For a "one reactive atom kind" pitch, the surface area is large. **Suggestion:**
pick atoms+store as the canonical model, present hooks as the "React-compat" tier with
an explicit caveat about full re-renders, and add a decision table front-and-center.

### 2.3 The "trailing object" call convention is parser magic — and silently flips
The one-positional-arg + trailing-`{}` rule is consistent for built-ins, but for
**user components** the trailing object is treated as named-args *only if one of its
keys matches a declared parameter name* (`evaluator.ts:2925-2939`). Rename a param and a
caller passing `{ x: 1 }` silently switches from "named arg" to "positional arg" with no
diagnostic. That's a genuine footgun. **Suggestion:** make user-component named-arg
expansion explicit/diagnosable, or always treat a trailing literal object the same way.

### 2.4 Inconsistent "children" prop naming
There is no JSX/slot convention, so children arrive as an array prop — but the prop name
varies per component: `Stack({children})`, `Tabs({items})`, `Buttons({items})`,
`Table({columns})`, `KanbanColumn({items}/cards)`, `OnClick({child}/children)`,
`Portal({children})`. A developer must consult each spec. **Suggestion:** standardize on
`children` (with documented aliases only where semantically necessary like `columns`).

### 2.5 `cleanup`/`emit` are detected by literal callee name
Effects register teardown only when they literally call `cleanup(...)`
(`effects.ts:506-512`); the same for `emit`. Aliasing (`const c = cleanup; c(fn)`)
silently breaks teardown — a leak with no warning. **Suggestion:** make these real
bound functions in scope, or warn when they're shadowed/aliased.

### 2.6 Imperative DOM construction in component specs
Authoring a custom built-in means hand-writing `el("div", {...}, [...])` trees (a
5-field card is ~30 lines). There's no JSX, no `html`-tagged template. This makes the
"just register your own component" story far more friction than React. **Suggestion:**
ship a small `html`-template-literal or hyperscript helper for spec authors.

### 2.7 Silent failure everywhere
Unknown identifiers return `null`; non-callable callees return `null`; unknown
components render a `Skeleton`; bad props are coerced via `asString/asNumber`; invalid
enums from a *variable* bypass validation; rejected inline styles drop silently; missing
i18n keys return the key. This is *correct and intentional* for streaming partial LLM
output — but for a human developer debugging an app it means bugs are invisible. **Suggestion:**
a "strict/dev mode" flag that turns these silent fallbacks into console warnings or
visible errors.

---

## 3. Things I wish existed (would make developer life easier)

These are net-new ergonomics that aren't necessarily "gaps vs React" but would
materially help anyone building with Aktion:

1. **A `dev`/`strict` mode** (see 2.7) — loud warnings for unknown identifiers, bad
   props, enum mismatches via variables, dropped styles, and missing i18n keys.
2. **Scope-aware editor completions.** Today autocomplete only knows library components
   and reserved keywords — your own `$state`, components, and actions never appear. This
   is the biggest day-to-day DX papercut for hand-authoring.
3. **A real (or thin) LSP** with go-to-definition, find-references, rename, and document
   symbols. The data layer (`getDiagnostics/getCompletions/getHoverInfo`) already exists;
   only the transport + a cross-file symbol index are missing.
4. **Source maps from the Vite plugin.** Currently `map: { mappings: "" }`
   (`plugin/index.ts:79`), so every runtime stack trace points at the generated JSON
   blob, not your `.aktion` line. This alone makes debugging compiled apps painful.
5. **Format-on-save.** `formatProgram` is idempotent and shipped, but never registered as
   a VS Code `DocumentFormattingEditProvider`. Wiring it is a few lines.
6. **A deferred-fire mutation primitive** (`$mutation`) and a cached `$query` — so forms
   and writes aren't hand-rolled (see 1.1c).
7. **DOM refs + an `onMount` for user components** (see 1.1a).
8. **A component-tree picker in DevTools** ("click a DOM node → find the component" +
   per-instance props inspection). The current DevTools is strong on *why-did-it-render*
   but you can't go from element → source, and you can't see an instance's props.
9. **A `$http` network tab in DevTools.** Requests aren't tracked in the panel today.
10. **`$util` round-outs** — `debounce`/`throttle` as standalone helpers, plus
    `cloneDeep`, `merge`, `omit`, `keyBy`, `chunk`, `partition`. (Native array methods
    work, so this is convenience, not necessity.)
11. **A `toast.show()` imperative API** and an overlays/notifications manager — today you
    hand-manage a `$toasts = [...]` array yourself.
12. **A focus-trap / `FocusScope` and `useId`** for accessible overlays and forms.
13. **CHANGELOG + stability matrix** (see §5) so adopters can plan upgrades.

---

## 4. Things that are unnecessary / could be removed or trimmed

Be conservative here — most of the surface earns its keep for the LLM use case. But a few
candidates:

1. **Dead optimistic-action machinery.** Either wire `ActionDeclaration.optimistic` to
   real syntax or remove the `effects.ts:628-696` rollback branch and the `optimistic`
   AST field. Shipping unreachable code that the docs imply works is worse than not
   having the feature.
2. **`$util` math one-liners** (`round/floor/ceil/abs/pow/sqrt/log/random`) are thin
   wrappers over `Math.*`, which is already fully available in expressions. They add
   prompt surface and API to memorize for near-zero benefit. Consider dropping them in
   favor of `Math.*` (keep `clamp`, which is the only non-trivial one).
3. **`$util` string one-liners** (`trim/replace/substring/startsWith/endsWith/split/join`)
   duplicate `String.prototype`/`Array.prototype` methods that already work. The
   string-operator `filter/sort/groupBy` are defensible (LLM-friendly); the trivially
   duplicative ones aren't.
4. **The `Lazy` component** is documented as "best-effort static rendering" with the real
   feature unimplemented. Either finish runtime-level lazy resolution or remove it so it
   doesn't imply code-splitting that doesn't exist.
5. **`required` prop flag** is decorative (not enforced at runtime — `types.ts:38-40`).
   If it's only for the prompt generator, name it so (`promptRequired`) to avoid implying
   runtime validation that doesn't happen.
6. **Redundant docs shells** — `theme-customization.html` is a meta-refresh redirect and
   `live-example.html`/`live-examples.html` overlap; minor cleanup.

I would **not** remove: the streaming parser, schema-as-truth validation, the
system-prompt generator, the delta protocol, the visual editor, the testing library, or
the DevTools — these are the project's differentiators and are well built.

---

## 5. Documentation: what's not well-documented or could be improved

The docs site is broad — 24 real pages, almost every concept has a dedicated page with
live previews, and the `migration-guide.html` (6 frameworks × 16 concepts) is genuinely
excellent. But several things are under-documented relative to what a developer hits in
practice:

1. **The fine-grained-reactivity caveat is the most important undocumented behavior.**
   Nowhere does the site say "`$state`/`$memo`/`$http`/timers force a full re-render and
   bypass path-tracking." A developer reading the "fine-grained reactivity" pitch will
   build a hook-heavy app and be surprised by the perf profile. This *must* be documented
   prominently (ideally on `hooks.html` and a new performance page).
2. **The `$x = expr` "declare vs assign by scope" rule** (§2.1) is the highest-stakes
   semantic in the language and deserves its own explainer with a diagram, not a few
   scattered sentences in `language.html`.
3. **No performance/optimization guide:** when re-renders happen, how to avoid waste,
   the runtime safety budget (componentDepth/iterations/arrayLength — only in the
   README), `setResponse` vs `appendChunk` cost, bundle-size/tree-shaking story (today
   the whole library ships in one bundle with no trimming path).
4. **No error-handling / debugging guide:** how to read parse errors, what the render-loop
   guard and safety-budget errors mean (both are tested but undocumented), how to surface
   errors to end users, how to use DevTools to diagnose an unexpected re-render.
5. **No FAQ / troubleshooting page.** The most common real questions live only as test
   cases: "why did my Input lose focus?" (Portal+morph), "why isn't my effect re-running?"
   (only `$atom`/lifecycle/interval deps), "why was my component memoized away?",
   "why did `Map(...)` call the JS constructor?". These should be a single searchable page.
6. **TypeScript reference is thin.** Beyond one JSX-intrinsic snippet, there's no guide to
   the public `dist/types`, typing `ComponentSpec`/`helpers`/interceptors/host event
   payloads (`assistant-message`, `route-change`, `error`), or the subpath entry types
   (`/test`, `/devtools`, `/language`, `/vite`).
7. **Accessibility is undocumented and under-built.** No WCAG statement, no keyboard-nav
   map, no screen-reader/streaming behavior, no theme contrast claims. (And in code:
   `aria-live` appears in zero components; Modal sets `aria-modal` but doesn't trap/restore
   focus; menus are plain buttons.) For LLM-generated UI this is high-stakes — worth both
   docs and component fixes.
8. **No SSR/hydration or production-deployment guide.** Custom element + shadow DOM make
   SSR non-trivial; `serializeState`/`hydrateState` exist but there's no end-to-end story,
   nor CSP-nonce / integrity-hash / edge-function guidance beyond two README paragraphs.
9. **`components.html` is dynamically generated** — always in sync, but no stable per-component
   anchors, no category filtering in the UI, no "when to use X vs Y" (Card vs Box, Tabs vs
   Router, Stack vs Row vs Column), and no per-component a11y/keyboard notes.
10. **The 22 application patterns (A–V) and the anti-patterns/self-check in
    `coding-gen-skill.md` are never surfaced on the docs site.** That file is effectively a
    hidden human cookbook. Surfacing it (or a derived "Recipes"/"Patterns"/"Anti-patterns"
    page) would close several gaps at once.
11. **No CHANGELOG, versioning, or stability policy** anywhere (verified: no `CHANGELOG*`
    exists). At v0.5.x with a published npm package, a CDN, a Vite plugin, and a VS Code
    extension, the absence of "what changed / what's stable vs experimental / SemVer
    policy / is `system_prompt.txt` contract-stable" is the most material doc gap for
    adopters.

---

## 6. Documentation pages / resources to create

In priority order:

1. **"Reactivity & rendering deep-dive"** — path tracking, the two render gates,
   *exactly* what forces a full re-render, and how to keep renders fine-grained. (Closes
   §5.1, §5.2.)
2. **"Performance & optimization"** — re-render avoidance, memoization rules, safety
   budget, bundle size, streaming throughput, `setResponse` vs `appendChunk`.
3. **"Troubleshooting / FAQ"** — the focus-loss, effect-not-firing, memoized-away,
   `Map`-constructor, dropped-style, missing-i18n-key questions in one place.
4. **"Error handling & debugging"** — reading parse/runtime errors, render-loop and
   budget guards, the `error` event, DevTools-driven diagnosis.
5. **"TypeScript guide"** — public types, typing custom components/helpers/interceptors,
   host event payloads, subpath entry types, a typed host-wrapper recipe.
6. **"Recipes / Patterns / Anti-patterns"** — surface the A–V patterns and the
   self-check from `coding-gen-skill.md` for human readers, organized by task ("How do
   I…?").
7. **"Accessibility guide"** — conformance target, keyboard map, streaming/SR behavior,
   theme contrast.
8. **"Production & deployment"** — SSR/hydration, CSP nonces, integrity hashes, CDN
   caching, edge-function LLM streaming, error reporting/telemetry hooks.
9. **"LLM integration guide"** — the actual point of the library, currently only implicit
   in `examples.html` and the chat-bot demo: how to wire OpenAI/Anthropic/OpenRouter/Bedrock
   streams into `appendChunk`, prompt selection (full vs chat), interceptors,
   `assistant-message` round-trips, and the delta protocol.
10. **"State management deep-dive"** — atoms vs hooks vs stores decision table, derived
    state, persistence, hydration, the full-re-render caveat.
11. **"Extending Aktion"** — end-to-end custom-component pack, custom themes, the
    `registerComponents` contract, the `helpers` surface, publishing a component library.
12. **"Vite plugin & modules"** dedicated page (today only in the README) + the import
    limitations (named-only, no bare specifiers, no JS interop).
13. **A `CHANGELOG.md` + a "Stability & versioning" page** — per-API stable/experimental
    badges and a SemVer/upgrade policy.

---

## 7. What's genuinely impressive (so the feedback is balanced)

- **The morph reconciler** does the one hard thing streamed UI needs — preserving focus,
  selection, IME state, scroll, `<details>.open`, and input values across re-renders — in
  under 250 lines (`renderer/morph.ts`).
- **The testing library** (`src/testing`) is the most polished part of the toolchain: a
  faithful Testing-Library-style API with `$http` mocking, route mocking, state probes,
  and event capture. A React dev is productive immediately.
- **DevTools** ships a real backend/frontend split with a state inspector, commit
  profiler/flamegraph, and an *effect timeline* — plus per-render "why did this render"
  reasons that React DevTools doesn't give you out of the box.
- **Schema-as-truth validation** with genuinely excellent, actionable error messages (it
  tells you the allowed enum values and rewrites multi-positional calls for you).
- **The multi-file linker** correctly implements true module scope via per-module renaming
  while keeping entry-module names canonical, tolerates cycles, and shares `$state` across
  files.
- **Path-granular reactivity** (`pathAffects`) is a clean, dependency-free design — when it
  applies, it's the auto-tracking of MobX with the path-granularity of Solid and no
  selectors.
- **Security defaults** are conservative and well-tested (href/image/CSS sanitizers,
  `noopener noreferrer`, dropped event handlers in raw HTML).

---

## 8. Bottom line

**As an LLM-UI runtime:** excellent and, in several areas (testing, DevTools, visual
editor, prompt generator, delta protocol), ahead of expectations for its version.

**As a React replacement for complex hand-authored apps:** not yet, and the blockers are
structural: no DOM refs (no third-party integration), no context/providers, an un-cached
single-fire HTTP primitive with dead optimistic code, a hook tier that disables the
headline reactivity, no DSL type system, and hash-only routing — wrapped in a runtime
that fails silently by design.

A pragmatic positioning that the architecture actually supports: **use Aktion for the
LLM-generated / streamed view layer, embedded inside a host (React, Vue, or vanilla) that
owns routing, refs, data fetching/caching, and DI.** Push it past that boundary and the
friction compounds quickly. If the goal is genuinely "as good as React for complex
apps," the §1.3 roadmap — DOM refs, routing reactivity through the path-tracker, a real
data layer, context, and a gradual type story — is the path there.
