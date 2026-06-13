# Aktion — Developer Feedback & Analysis (Round 2)

> **Reviewer perspective.** A senior full-stack TypeScript / frontend engineer who
> read the runtime, parser, evaluator, renderer/morph reconciler, the ~271-component
> library, the tooling/language surface, the VS Code extension, the Vite plugin and
> multi-file linker, routing, the data layer, themes, the docs site, and the tests —
> then imagined shipping a real, complex SaaS-grade application with it.
>
> **Scope reviewed:** `src/**`, `docs/**` (not `_docs/**`), `editors/**`,
> `create-aktion/**`, `README.md`, `CHANGELOG.md`, `coding-gen-skill.md`, and the
> tests. Findings below are grounded in specific files and line numbers so they are
> verifiable, not impressionistic.
>
> **Framing note.** This is a *second* review. A prior `feedbacks.md` exists in the
> repo, and a large fraction of what it flagged has since been **fixed** — the data
> layer (`$query`/`$mutation`), `$toast`, `$form`, hooks (`$ref`/`$reducer`/`$id`),
> the `OnMount` DOM-ref escape hatch, history-mode routing with nested layouts and
> guards, a `CHANGELOG.md` with a stability matrix, scope-aware completions, a full
> in-editor LSP feature set, source maps from the plugin, a genuine accessibility
> pass, and a much broader docs site (37 pages) are all now present. So this round is
> deliberately calibrated to the **current** state: more positive overall, and the
> remaining critique is sharper and more specific. Where the previous review is now
> stale, I say so explicitly.

---

## 0. What Aktion actually is (so the critique is fair)

Aktion is **a framework-agnostic web component that renders an LLM-authored,
streaming DSL into a rich interactive UI inside a shadow DOM.** The surface syntax is
a strict subset of JavaScript; every statement commits to the DOM as it streams in.
Almost everything that looks unusual from a React lens — the line-oriented parser,
schema-as-truth validation, silent-`null` fallbacks, the system-prompt generator, the
delta protocol, "skeleton on unknown component" — is a deliberate, well-executed
choice **for that job**.

This document answers two related questions throughout:

1. **As an LLM-UI runtime** (its actual target): it is genuinely strong, and in
   several areas (testing library, DevTools, visual editor, prompt generator,
   accessibility primitives, the morph reconciler) ahead of most pre-1.0 projects.
2. **"Can it be as good as React for complex, hand-authored apps?"** (the question
   asked): meaningfully closer than it was, but several gaps are still structural —
   no type system, no scoped context/DI, a full-tree render model for everything that
   isn't a plain atom, and a Portal that opts out of the reconciler.

Both lenses are kept visible so the feedback stays actionable rather than "it isn't
React."

---

## 1. What would it take to be "as good as React for complex apps"? Gaps & what's missing

### 1.1 The headline reactivity story is real — but only for atoms, and "fine-grained" does not mean "partial subtree render"

This is the single most important thing to internalise, and it is subtle.

There is **no partial-subtree re-render** in Aktion. Every tick re-evaluates the
*entire* tree from the root `aktion` binding and morphs the result against the live
DOM (`src/element.ts:1200-1247`). "Fine-grained" is two narrower things layered on
top of a full-tree walk:

- **A render *gate*** — decide whether to schedule a render at all, by comparing the
  changed paths against the read-set of the previous render
  (`src/element.ts:450-452`, `pathAffects`/`pathsOverlap` in `src/runtime/state.ts:43-58`).
- **Per-user-component memoization** — during the walk, skip an individual *user
  component body's work* and reuse its previously returned node value when its args
  are shallow-equal and none of its read paths overlap the change set
  (`src/renderer/renderer.ts:464-484`).

A "full re-render" doesn't change *what* gets walked; it just disables the
memoization (`memoize = !this.forceFullRender`, `src/element.ts:1222-1223`). And the
list of things that force a full, non-memoized render is long. Every one of these
funnels through `ctx.notify()` → `requestFullRender()` (`src/element.ts:1131-1134`):

| Trigger | Forces full render? | Evidence |
|---|---|---|
| `$state` setter | **Yes** | `src/runtime/evaluator.ts:4363` |
| `$reducer` dispatch | **Yes** | `src/runtime/evaluator.ts:4465` |
| `$http`/`$query`/`$mutation` lifecycle | **Yes** | `src/runtime/http.ts` (many `notify()` calls) |
| `$socket`/`$sse` messages | **Yes** | `src/runtime/realtime.ts` |
| `setTimeout`/`setInterval`/`every(N)` | **Yes** | `src/runtime/evaluator.ts:4722`, `src/runtime/effects.ts:280` |
| any `$effect` body completing | **Yes (unconditionally)** | `finally { notify() }`, `src/runtime/effects.ts:257-259` |
| `$toast.*`, env getters (`$util.viewport`, …), `$util.url.setQuery` | **Yes** | `src/runtime/toast.ts`, `src/runtime/env.ts:50` |
| plain `$name = value` atom write | **No** (path-gated, fine-grained) | `src/runtime/state.ts` |
| `$ref` write | **No** (deliberate escape hatch) | `src/runtime/evaluator.ts:4405-4431` |
| `$memo`, `$id` | **No** (read-time only) | `src/runtime/evaluator.ts:4374-4403` |

Two consequences a complex-app author must understand:

1. **The most React-familiar style (`const [x, setX] = $state(...)`) gets none of the
   fine-grained benefit.** A hook-heavy tree re-executes every component body on every
   interaction; only the morph pass saves the DOM. The team has now documented this
   loudly (`README.md` "IMPORTANT" box around line 828, `CHANGELOG.md:67-69`,
   `docs/reactivity.html`) — that's the right call and a big improvement over the
   prior state where it was undocumented. But it remains a real architectural ceiling:
   a React dev reaching for hooks by reflex builds the *slow* path.

2. **Library components are never memoized at all.** They re-run their `render`
   function on every commit (`src/renderer/renderer.ts:665-666`, "library components
   have no memoization"). So a `DataGrid`, a chart, or a big `Table` rebuilds its
   entire render output every tick regardless of whether its inputs changed — the
   morph reconciler is the only thing keeping the DOM stable. For a 200-row grid on a
   page with a 1s clock effect, that's a full grid rebuild every second. The only
   mitigation is to wrap expensive sections in a user `function` so they become
   memoizable.

**To close the gap:** route at least `$http`/`$query` lifecycle updates and timer
ticks through the path-tracker (they often only affect one resource's readers), and
consider memoizing library components by args+read-paths the same way user components
are. This is the highest-leverage internal change for "complex app" performance.

### 1.2 No type system for the DSL — still the biggest structural gap vs React+TS

`.aktion` is entirely untyped. There are no type annotations in the grammar, no
inference, and no checking:

- Component params carry only `{ name, defaultValue?, optional?, rest? }` — no type
  (`src/tooling/formatter.ts:230`, `src/tooling/signature-help.ts:248-258`).
- Atoms are untyped: `$count = 0` then `$count = "oops"` is fine; hover for any
  user atom is the constant string `"reactive state atom"`
  (`src/tooling/language-service.ts:507`).
- Library prop "types" are **documentation strings**, not checked types: `type:
  "Series[]"` is `PrimitiveType | string` (`src/library/types.ts:24-26`) and nothing
  validates a passed value against them.

For a large hand-authored codebase, losing compiler-grade types is losing the main
tool that keeps big React+TS apps maintainable. This is acceptable for short
LLM-streamed views; it is a serious impediment for a 50-file app with a team.

**What would help (gradual, not all-or-nothing):** a small optional annotation subset
(`function Card(title: string, tone: "info" | "danger" = "info")`) that the language
service checks but the runtime ignores; typed atoms via the same mechanism; and
`.d.ts` generation from `registerComponents(...)` so host code gets typed specs. Even
JSDoc-style `@param` hints surfaced in completions would move the needle.

### 1.3 No scoped context / dependency injection / providers

`$store({...})` is the only shared-state mechanism, and it is an **app-global
singleton** keyed by source location — the README itself calls it "an app-global
singleton." There is no `createContext`/`useContext`/`Provider` equivalent for
authors (the `createContext` in `src/runtime/evaluator.ts` is the *internal*
`EvaluationContext` factory, not a user-facing API — verified by reading its call
sites). You therefore cannot:

- instantiate the same store factory twice to get two independent scoped instances,
- provide a different value to one subtree (a `ThemeProvider` around a single panel),
- inject a mock/fixture by wrapping a subtree in a test.

For complex apps this blocks multi-tenant theming, scoped feature state, and clean
testing seams. A `Provide(value, children)` + `inject()` pair (or scoped `$store`
instances) would unblock a whole category of patterns.

### 1.4 The Portal opts out of the reconciler → focus/scroll/input loss inside overlays

`Portal` renders its children into a **fresh `<div>` appended to `document.body` on
every commit**, removing the previous container via a disposer
(`src/library/components/helpers.ts:104-131`). Because the morph reconciler only
reconciles `rootEl` (`src/element.ts:1246`), **portal content is never morphed — it is
destroyed and recreated on every re-render.** Consequences:

- A focused input, text selection, IME composition, scroll position, or
  `<details>.open` *inside a Portal* is lost on every state change.
- `OnMount`'s captured node goes **stale**: `OnMount` fires once (gated by per-instance
  state), so after the first re-render of a portal its container child is replaced and
  `onMount` does not re-fire — a `$ref.current` stashed via `OnMount` inside a Portal
  then points at a detached node, and any imperative library (chart/map/editor) handed
  that node operates on a dead subtree.

This is a genuine correctness bug, not a nuance. Note the modern overlays (`Modal`,
`Sheet`, `BottomSheet`, `ConfirmDialog`) are well-built with real focus traps and
restore — but anything that relies on the raw `Portal` primitive (or an imperative
widget mounted through it) will misbehave. **Fix:** give the Portal subtree its own
morph pass (reconcile the previous container against the new render instead of
recreating it), or register portaled roots with the same reconciler.

### 1.5 No render-loop guard on the hook-setter path

There is a "write state during render" guard, but it only covers `StateStore` writes
(`src/runtime/state.ts:112-119`, opened/closed around the render pass in
`src/element.ts:1182-1284`). It does **not** cover hook setters. A `$state` setter or
`$reducer` dispatch called *unconditionally during render* goes straight to
`ctx.notify()` → `requestFullRender()` → `scheduleRender()` → render → … an infinite
loop, with **no diagnostic** (React throws "Too many re-renders" here; Aktion just
spins). For a hand-authored app this is a sharp, silent footgun — add a per-render
setter counter or extend the guard to hook cells.

### 1.6 Data layer: strong now, but with three real footguns

Credit where due — the prior review's "single un-cached primitive with dead optimistic
code" critique is **resolved**. `$query` genuinely implements cache, dedup, TTL
(stale-while-revalidate), `refetchInterval`/`refetchOnFocus`/`refetchOnReconnect`,
infinite pagination, and GraphQL (`src/runtime/http.ts:516-690`). `$mutation` defers
until `.mutate()`, and optimistic update + rollback is now live and tested
(`src/runtime/http.ts:749-822`). `$socket` has exponential backoff + a send queue,
`$form` does async validation with stale-result guards. That is a real data layer.

But three issues will bite a complex app:

1. **Optimistic rollback restores the *entire* state store.** On failure it snapshots
   *every* atom and writes them all back (`src/runtime/http.ts:762-769`). If the user
   edited an unrelated field while the mutation was in flight, that edit is **clobbered
   on rollback.** Optimistic rollback should be scoped to the paths the optimistic
   callback touched.
2. **`queryCache` never evicts.** Entries are `set` and kept for the app's lifetime
   (`src/runtime/http.ts:532-552`); there is no max-size or LRU. With dynamic keys
   (`key: \`user-${id}\``) this is an unbounded memory leak over a long session.
3. **No automatic retry/backoff anywhere except `$socket`.** A real data layer needs
   configurable retry on transient 5xx/network failures; today every `$query`/`$http`
   failure is terminal unless the author hand-rolls `refetch()`.

Minor: GraphQL `.data` unwrapping applies to `$query` but not `$mutation`, so a
GraphQL mutation that returns `200 { errors: [...] }` is treated as success.

### 1.7 Routing: capable, but missing a few load-bearing pieces

History + hash mode, nested/layout routes with a persistent shell + `outlet`, path
params, blocking/redirecting guards, scroll restoration, and prefetch-on-hover all
work (`src/runtime/router.ts`, `src/runtime/evaluator.ts:1493-1591`). Remaining gaps
that matter for complex apps:

- **No first-class `route.query`.** Query strings are stripped at the router boundary
  (`src/runtime/router.ts:89-91`) and only reachable via the *separate* `$util.url`
  reactive env. So routing has **two disjoint URL-state systems** (path via router,
  query via `$util.url`) — confusing and easy to get wrong.
- **Guards are single and synchronous.** `setGuard` replaces (no stack/composition)
  and `runGuard` does not `await` (`src/runtime/router.ts:334-348`), so an async auth
  check can't block navigation.
- **No `navigate(path, { replace })`** — every navigation pushes history.
- **No data loaders/actions** (React-Router style) — the workaround is `$query` +
  `NavLink` prefetch, with no blocking data phase tied to a transition.
- "Route transitions" (`RouteView`) and "lazy routes" (`Lazy` + `import()`) are
  *component/technique* features, not router-engine features — the docs slightly
  oversell them as routing capabilities.

### 1.8 Concrete roadmap to "React-grade"

In rough priority order:

1. **Portal-in-morph** (fix 1.4) — overlays and imperative widgets are common; this is
   a correctness bug.
2. **Route `$http`/timer updates through the path tracker** and **memoize library
   components** (1.1) — the biggest perf lever.
3. **A gradual type story** (1.2) — optional annotations checked by the language
   service + `.d.ts` from `registerComponents`.
4. **Scoped context/providers** (1.3).
5. **Scoped optimistic rollback + query cache eviction + retry/backoff** (1.6).
6. **`route.query`, async guards, `replace` navigation** (1.7).
7. **Hook-setter render-loop guard** (1.5).

None of these is required for the LLM-UI use case; all are required to credibly say
"as good as React for complex apps."

---

## 2. What's complicated and could be simplified

### 2.1 `$x = expr` means (at least) four different things depending on scope

This is still the single most cognitively expensive rule in the language:

- **Top level, literal RHS** → declares a reactive atom.
- **Top level, non-literal RHS** → a *computed derivation* (re-derives when deps
  change).
- **Inside `function Pascal(...)`** (component) → a per-instance state *declaration*
  (initializer runs once; value persists across renders).
- **Inside `function name(...)` / lambda / effect** → a plain reactive *write*.

There is no syntactic difference between "declare" and "assign", which is exactly why
the runtime needs a render-write guard (`src/runtime/state.ts:112-119`). Both humans
and LLMs get this subtly wrong. A distinct declaration form (a keyword or sigil), or
at minimum a strict-mode lint that flags "assignment in render position," would make
intent visible in the source.

### 2.2 There are now *four* ways to hold state, with different rules

`$name = value` atoms, `$state`/`$reducer` hooks, `$store({...})`, and computed
derivations each differ in:

- **reactivity granularity** — atoms/stores/computed are path-tracked and fine-grained;
  hooks force full re-renders (1.1);
- **lifetime** — atoms persist; hook state resets on unmount; stores are app-global
  (and optionally persisted); `$ref` never re-renders;
- **sharing** — stores are global, the rest are local.

The "one reactive atom kind" pitch in the README undersells how much surface a
newcomer must actually learn. A front-and-center **decision table** ("shared across
components → `$store`; one component owns it, written by its actions → `$name`;
React-style composition / custom hooks → `$state`, accepting full re-renders;
non-reactive box → `$ref`") would cut the learning curve a lot. Some of this is in
`docs/stores.html`/`reactivity.html`, but it isn't surfaced as a single canonical
"which state model do I use?" answer.

### 2.3 The trailing-object call convention can silently flip named → positional

The one-positional-arg + trailing-`{}` rule is consistent for library components, but
for **user components** the trailing object is treated as named-args only if one of
its keys matches a declared parameter name. Rename a param and a caller passing
`{ x: 1 }` silently switches from "named arg" to "a positional object payload" with no
diagnostic (strict mode warns for *some* of this per `CHANGELOG.md:50-52`, but it's
opt-in). This is a genuine footgun for refactoring. Making user-component named-arg
expansion explicit/diagnosable would remove a class of silent bugs.

### 2.4 Inconsistent and overloaded prop names

There is no slot/children convention, so "the content" arrives under different prop
names depending on the component: `children` (`Stack`/`Row`/`Card`/`Grid`/`Modal`),
`child` (most wrappers), `items` (`Select`/`Accordion`/`VirtualList`/`KanbanColumn`),
`cards` (`KanbanColumn` alias), `columns`, `content`, `cells`, `metrics`, … The worst
offender is **`columns`, which is overloaded**: a *track-count number* in
`Grid`/`Bento`/`Stats` (`src/library/components/layout.ts:864`) but a *column-definition
array* in `DataGrid`/`KanbanBoard` (`src/library/components/advanced-data.ts:126`,
`patterns.ts:613`) and a `FooterColumn[]` in `Footer`. An alias system papers over
some of this, but a developer still has to memorise per-component shapes. Standardising
on `children` for generic content (keeping `columns: number` vs a renamed
`columnDefs`/`schema` for data grids) would reduce friction.

### 2.5 Authoring a custom *library* component is imperative DOM construction

`registerComponents([...])` requires hand-writing `document.createElement(...)` trees
(see the `ProductCard` example in the README, ~line 1152). There's no `html`-tagged
template or hyperscript helper, so "just register your own component" is far more
friction than a React component. A small `html\`...\`` helper or a hyperscript `h()`
exported for spec authors would make the extension path approachable. (Note: the
common case — composing existing components with a `function` — is already ergonomic;
this only bites when you need a genuinely new primitive.)

### 2.6 Silent failure by design is great for streaming, hard for debugging

Unknown identifiers resolve to `null`, unknown components render a `Skeleton`, bad
enum values from a *variable* bypass validation, missing i18n keys return the key. This
is *correct* for partial LLM output. `strict` mode now turns some of these into
`console.warn`s (`CHANGELOG.md:50-52`) — a real improvement — but it's incomplete
(e.g. unknown *component* calls are still not diagnosed even by the schema validator;
see 5.x) and off by default. Making strict mode the default in the Vite plugin /
dev builds, and widening what it catches, would help hand-authors a lot.

---

## 3. Things I wish existed (would make developer life easier)

1. **Diagnose typo'd component/action/atom names.** A Levenshtein `suggestComponent`
   helper already exists (`src/tooling/schema.ts:97-110`) but is **not wired into
   `getDiagnostics`** — `validateCall` returns early when the component is unknown
   (`src/library/validate.ts:324-325`). So `Buttn(...)` produces no error. Wiring the
   existing suggester into diagnostics is a few lines and would be the single biggest
   day-to-day DX win for hand-authoring.
2. **Diagnostics on user components.** Author components are excluded from schema
   validation entirely (`src/library/validate.ts:323`), so wrong arity / unknown props
   on *your own* components are never flagged. Even minimal arity/required checks would
   help.
3. **Undefined-symbol and unused-variable diagnostics.** Referencing an undeclared
   `$atom` or calling an undefined action is silently `null` today.
4. **Real source-map line mapping.** The plugin now emits a valid v3 map (big
   improvement), but every generated line maps to original `[0,0,0,0]` — line 1 of the
   file (`src/plugin/index.ts:131-141`). Stack frames land at the top of the `.aktion`
   file, not the offending statement. A per-statement mapping would make compiled-app
   debugging real.
5. **Scope-aware rename/find-references.** Today these are token-based and file-scoped
   (`src/tooling/navigation.ts:444-449`); two different locals sharing a name are
   treated as one symbol, so rename can over-rewrite, and there's no cross-file rename.
6. **A real DOM-ref + `onMount`/`onUnmount` on plain user components**, not only via
   the `OnMount` wrapper — and one that survives Portals (see 1.4).
7. **Scoped context/providers** (1.3) and a **`replace` navigation** option (1.7).
8. **Query cache controls** — `cacheTime`/eviction and a manual `$util.invalidate`
   that also drops entries, plus retry/backoff config (1.6).
9. **Arrow-key roving in `DropdownMenu`/`Combobox`/`MultiSelect`.** They have correct
   `role=menu`/`listbox` + Enter/Escape/type-ahead, but no `ArrowUp`/`ArrowDown`
   navigation or `aria-activedescendant` (`src/library/components/menu.ts:127-141`,
   `forms.ts:945-953`) — so they advertise a keyboard pattern they don't fully honor.
10. **A working Kanban with drag.** `KanbanBoard`/`KanbanColumn`/`KanbanCard` are
    presentation-only (no `draggable`, no drop handling — `src/library/components/
    patterns.ts:614-618`) despite the name implying a movable board. `Sortable`/
    `Draggable`/`DropZone` *are* real; the Kanban suite should build on them.
11. **Per-instance dialog ids.** `Sheet`/`ConfirmDialog` hard-code `id="rui-sheet-label"`
    / `"rui-confirm-label"` (`src/library/components/extras.ts:85-86,157-158`); two on
    one page produce duplicate ids (which the library's own `axe()` would flag). `Modal`
    already does this correctly with a counter.

---

## 4. Things that are unnecessary / could be removed or trimmed

Be conservative — most of the surface earns its keep. A few real candidates:

1. **`$util.derived(fn)` is a no-op wrapper.** It just calls `fn()`
   (`src/runtime/evaluator.ts:175-178`); it adds no memoization and no tracking beyond
   inline evaluation, yet its doc comment claims it builds "a reactive computed value."
   Either make it actually memoize/track, or remove it — shipping a misleading API is
   worse than not having it.
2. **`$util` math one-liners** (`round/floor/ceil/abs/pow/sqrt/log/random`) duplicate
   `Math.*`, which is already fully available in expressions. They add prompt surface
   and API to memorise for ~zero benefit. Keep `clamp` (non-trivial); consider dropping
   the rest.
3. **`$util` string one-liners** (`trim/replace/substring/startsWith/…`) duplicate
   `String.prototype` methods that already work. The collection operators
   (`filter/sort/groupBy` with operator strings) are defensible as LLM-friendly; the
   trivial pass-throughs aren't.
4. **Dead `RouteChangeDetail.source: "external"`** — declared (`src/runtime/router.ts:34`)
   and even checked in scroll restoration (`src/element.ts:1061`), but never emitted.
   Harmless but stale; remove or wire it.
5. **Near-duplicate tutorial pages.** `docs/learn-2.html` and `docs/learn-3.html` share
   the same `<title>`; the `tutorial.html`/`learn-*` trio looks like it needs a cleanup
   pass.
6. **`required` prop flag is decorative** (a marker, not runtime-enforced — see
   `src/library/types.ts:38-41`). If it only feeds the prompt generator, name it so
   (e.g. `promptRequired`) to avoid implying validation that doesn't happen.

I would **not** remove: the streaming parser, schema-as-truth validation, the
system-prompt generator, the delta protocol, the visual editor, the testing library,
DevTools, the morph reconciler, or the now-real data layer — these are the project's
differentiators and are well built.

---

## 5. Documentation: what's not well-documented or could be improved

The docs site is now genuinely broad — 37 pages including dedicated `performance.html`,
`reactivity.html`, `troubleshooting.html`, `typescript.html`, `accessibility.html`,
`deployment.html`, `llm-integration.html`, and `stores.html`, plus a working
multi-file playground with autocomplete, linting, and gzip URL sharing. The previous
review's "no performance/FAQ/TS/a11y pages" critique is **largely resolved.** What
remains:

1. **The full-tree render model needs to be even more explicit about *library
   components***. The README/`reactivity.html` document the hook/`$http`/timer
   full-re-render caveat well, but the fact that **library components are never
   memoized and re-execute their render every commit**
   (`src/renderer/renderer.ts:665-666`) is the practical perf cliff for data-heavy
   pages and isn't called out. Add it to the performance page with the "wrap expensive
   sections in a `function`" guidance.

2. **Routing docs slightly oversell vs. the engine.** "Route transitions" and "lazy
   routes" are component/`import()` techniques, not router features
   (`docs/routing.html`), and the real limitations — no `route.query`, no data
   loaders, synchronous-only single guard, no `replace` — aren't stated. A
   "Routing limitations & query-state" section would set expectations correctly.

3. **The Portal focus-loss behavior (1.4) is undocumented** and is exactly the kind of
   thing that ends up as a bug report. Until it's fixed, it needs a prominent warning;
   after it's fixed, a note in the troubleshooting page.

4. **Data-layer caveats aren't documented** — the whole-state optimistic rollback
   (1.6.1), the unbounded `queryCache` (1.6.2), and the lack of retry (1.6.3) are
   surprises a developer will hit in production. The `$query`/`$mutation` docs should
   state cache lifetime and rollback scope explicitly.

5. **CHANGELOG / stability matrix isn't surfaced on the docs site.** `CHANGELOG.md`
   exists at the repo root with a good stability matrix and pre-1.0 SemVer policy
   (`CHANGELOG.md:86-109`), but there's no `docs/*.html` page or nav entry for it — so
   an evaluator browsing the site never sees "what's stable vs experimental."

6. **No SSR/hydration end-to-end guide** despite SSR-aware code paths
   (`renderToString`/`renderToStaticMarkup`, the router's memory mode in
   `src/runtime/router.ts:18-19`). `deployment.html` is general; a custom-element +
   shadow-DOM SSR story (CSP nonces, hydration of `serializeState`/`hydrateState`,
   streaming from an edge function) is non-trivial and worth its own page.

7. **No "extending Aktion" / custom-library-component guide.** This may be *by design*
   (the schema is closed and you usually compose with functions), but the README does
   document `registerComponents`, so the boundary ("compose with functions; only
   register a spec for a genuinely new primitive, and here's the `ComponentSpec`/
   `helpers` contract") should be written down.

8. **TypeScript guide is present but thin on the host contract.** `typescript.html`
   exists; it should also cover typing custom `ComponentSpec`/`helpers`, the
   interceptor signatures, and the host event payloads (`assistant-message`,
   `route-change`, `error`) and subpath entry types (`/test`, `/devtools`,
   `/language`, `/vite`).

9. **`components.html` lacks per-component a11y/keyboard notes and "when to use X vs
   Y"** (Card vs Box, Tabs vs Router, Stack vs Row vs Column, `DataGrid` vs
   `VirtualList`). Given the keyboard gaps in menus/listboxes (3.9) and the
   `DataGrid`-isn't-virtualized boundary, per-component notes would prevent
   foot-guns.

---

## 6. Documentation pages / resources to create

Most of the previously-requested pages now exist. The remaining high-value additions:

1. **"Reactivity & rendering — the full cost model"** (extend `reactivity.html`):
   path-gating vs memoization vs full render, the *library-components-never-memoized*
   fact, and a checklist for keeping a page fine-grained. (Closes 5.1.)
2. **"Routing limitations & URL state"** — unify path params and `$util.url` query
   state, document the missing pieces (loaders, async guards, `replace`,
   `route.query`). (Closes 5.2.)
3. **"Data layer in depth"** — cache lifetime/eviction, optimistic rollback scope,
   retry strategy, GraphQL handling differences between `$query` and `$mutation`.
   (Closes 5.4.)
4. **"State management decision guide"** — the atoms vs hooks vs stores vs `$ref`
   decision table (2.2), with the full-re-render trade-off front and center.
5. **"Extending Aktion"** — the `registerComponents` contract, the `helpers` surface,
   the `OnMount`/`$ref` imperative-integration pattern (and its Portal caveat),
   publishing a component pack. (Closes 5.7.)
6. **"SSR & hydration"** — end-to-end shadow-DOM SSR, CSP nonces, edge streaming.
   (Closes 5.6.)
7. **"Troubleshooting" additions** — Portal focus loss, "why did my whole tree
   re-render?", "why did my optimistic edit get clobbered?", the unguarded
   hook-setter loop, duplicate dialog ids. (Several of these only exist as test cases
   today.)
8. **Surface the `coding-gen-skill.md` patterns (A–V) and anti-patterns for human
   readers** as a "Recipes / Patterns" page — that file is currently a hidden human
   cookbook.
9. **Link `CHANGELOG.md` / a "Stability & versioning" page into the docs nav.**
   (Closes 5.5.)

---

## 7. What's genuinely impressive (so the feedback is balanced)

- **The morph reconciler** preserves focus, selection, IME state, scroll,
  `<details>.open`, and input values across re-renders in a compact, dependency-free
  design (`src/renderer/morph.ts`). This is the hard thing streamed UI needs, done
  well — outside Portals (1.4).
- **Accessibility is now a systematic concern, not an afterthought.** Real focus
  trap + restore + Escape on `Modal`/`Sheet`/`BottomSheet`/`ConfirmDialog`, ARIA
  labelling, `aria-live` regions (the prior "aria-live in zero components" claim is
  now **false** — `LiveRegion`/`Toast` emit it correctly), `SkipLink`/`VisuallyHidden`/
  `FocusTrap` primitives, and a shipped `axe()` audit (`src/testing/index.ts:943`).
  This is well above typical "N components" libraries.
- **The data layer caught up fast.** `$query` (cache/dedup/TTL/infinite/GraphQL),
  `$mutation` (deferred + optimistic + invalidate), `$socket` (backoff + queue),
  `$form` (async validation) are all real and tested — a big leap from the prior
  single-fire `$http`.
- **Charts are real inline SVG**, virtualization is real windowing
  (`VirtualList`/`VirtualGrid`), and `Sortable`/`Draggable`/`DropZone` implement real
  HTML5 DnD.
- **Tooling breadth.** A pure DOM-free language surface drives diagnostics, hover,
  scope-aware completions, formatting (with VS Code format-on-save), go-to-definition,
  references, rename, document symbols, signature help, and semantic tokens — plus a
  multi-file linker with true module scope and HMR, and now real (if coarse) source
  maps.
- **Documentation & process maturity.** 37 docs pages, a working multi-file playground,
  a CHANGELOG with a stability matrix and SemVer policy, and an explicit LLM-integration
  guide — unusually complete for a pre-1.0 framework.

---

## 8. Bottom line

**As an LLM-UI runtime:** excellent and, in several areas (testing, DevTools, visual
editor, prompt generator, delta protocol, accessibility primitives), ahead of
expectations for its version. Most of the prior review's critiques have been
addressed.

**As a React replacement for complex, hand-authored apps:** much closer than before,
but still not there. The remaining blockers are structural rather than cosmetic:

1. **No type system** for the DSL (1.2) — the biggest gap vs React+TS.
2. **A full-tree render model** for everything except plain atoms, with **library
   components never memoized** (1.1) — a real perf ceiling for data-heavy pages.
3. **No scoped context/DI** (1.3).
4. **A Portal that opts out of the reconciler** (1.4) — a correctness bug for overlays
   and imperative integrations.
5. **Sharp silent footguns** — whole-state optimistic rollback, unbounded query cache,
   unguarded hook-setter render loop, undiagnosed typos.

A pragmatic positioning the architecture genuinely supports today: **use Aktion for
the LLM-generated / streamed view layer (and for surprisingly rich hand-authored UIs),
embedded inside a host that owns global routing, refs, DI, and the production data
story** — while the team works down the §1.8 roadmap. With Portal-in-morph, library
memoization (or path-routed `$http`/timer updates), a gradual type story, scoped
context, and the data-layer footgun fixes, "as good as React for complex apps" stops
being aspirational and becomes a defensible claim.
