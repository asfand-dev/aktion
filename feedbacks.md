# Aktion — Developer Feedback & Gap Analysis

**Author:** External review, adopting the library as an application developer
**Date:** 2026-06-02
**Version reviewed:** `aktion-runtime` 0.5.3
**Scope:** Everything under `src/**`, the public docs (`README.md`, `docs/*.html`), the system-prompt generator, and the test suite. (Excludes `_docs/*` and `feedbacks/*` by request.)

---

## 0. How I read the codebase

I went through it the way a developer evaluating it for a real project would: I read the reactivity engine (`src/runtime/state.ts`), the effect/action runtime (`src/runtime/effects.ts`), the reconciler (`src/renderer/morph.ts`, `renderer.ts`), the host element (`src/element.ts`), the parser/evaluator, the full component library (`src/library/**`), the theming system (`src/theme/**`, including the 7,892-line `styles.ts`), the runtime services (`$router`, `$http`, `$storage`, `$i18n`, `$console`, `$util`), the tooling (`formatter`, `codemod`, `delta`, `inspector`, `language-service`), and the docs.

This document is organized around the six questions in the brief, but everything rests on one observation I want to state up front because it reframes the whole comparison.

---

## 1. The most important thing first: Aktion and React are not the same category of tool

The brief asks "what would it take to make this library as good as React for creating complex frontend applications?" Having read the code, I think the honest and most useful answer starts by naming a category difference.

**React** is a component model for *your* application. You write typed components in your own language, compose them freely, pass data and callbacks across the tree, and ship the result as your whole app.

**Aktion** is, by its own description (`README.md:6-10`, `package.json` keywords `llm`, `ai`, `generative-ui`), *"a framework-agnostic web component that renders LLM-generated UI from Aktion — a reactive language… designed for chat assistants."* The entire application is a **program string** you feed to a custom element via `setResponse(text)` / `appendChunk(text)` (`src/element.ts:417-519`). The host page's only channels into a running program are: the program text, a theme, a set of TypeScript-authored components you can register, HTTP interceptors, and a state snapshot to hydrate. The only channels out are DOM events (`assistant-message`, `route-change`, `error`, and custom `emit()` events). There is no JSX, no typed props from host to program, no way to pass a live host callback or a reactive host value into the DSL as a first-class prop.

That design is *excellent* for its real purpose — an LLM emits a compact DSL, it streams token-by-token into a sandboxed shadow-DOM island, and it renders rich interactive UI safely. React has nothing comparable for that job (see §2).

But it means the React comparison is really two different questions, and I'll answer both throughout:

- **As an LLM/generative-UI runtime** (its actual design center): it is already strong; the gaps are mostly depth and polish.
- **As a general-purpose framework for hand-built complex apps** (the literal comparison the brief asks for): there are large, partly *structural* gaps — some of which would require essentially rebuilding the React/TypeScript ecosystem, and a few of which fight the core design (the string-island boundary, the dynamic untyped language).

My single strongest recommendation (expanded in §11): **decide which of these two products Aktion is**, and let that decision drive the roadmap. Chasing "React parity for hand-coded apps" while keeping the LLM-first architecture will produce a tool that is mediocre at both. Doubling down on generative UI — and treating hand-authoring as a well-supported but secondary path — plays to genuinely novel strengths.

---

## 2. What is genuinely excellent (credit where it's due)

Before the critique, these are real, and several have no direct React equivalent:

1. **Fine-grained, path-level reactivity.** `pathAffects` / `anyPathAffects` (`src/runtime/state.ts:43-58`) track dependencies at the `user.name` granularity, not the whole-atom level. Writing `$user.role` does not re-render a view that only read `$user.name` (`src/element.ts:340-354`). This is Solid/Vue-class reactivity, and it's implemented cleanly without proxies.

2. **A real render gate + per-component memoization.** The host accumulates changed paths and only re-renders when they overlap what the last render actually read (`src/element.ts:351`), and the renderer skips a component whose args are unchanged *and* whose read-paths didn't change — React.memo semantics, derived automatically (`src/renderer/renderer.ts:381-398`).

3. **Streaming coherence (the "frontier" / SCC).** `src/parser/frontier.ts` partitions a half-streamed program into a committed prefix and a drafting tail, and gates effects so a half-typed `function Counter() {` can't fire downstream work (`isQuiescent`, `frontier.ts:147-154`). This is purpose-built for LLM token streams and is a capability React simply does not have.

4. **A morph reconciler that preserves browser-owned state.** `src/renderer/morph.ts` keeps input values, selection/IME state, scroll position, and `<details>.open` stable across re-renders, with focus + selection restoration in `element.ts:865-904` (including the `type="text"` round-trip for inputs where `setSelectionRange` throws). This is careful, real-world work.

5. **A sophisticated effect/action runtime.** Per-instance effects with captured alias frames and loop vars (`src/runtime/effects.ts:152-184`), `debounce`/`throttle` modifiers (`effects.ts:329-367`), interval/lifecycle triggers, and optimistic actions with automatic snapshot/rollback (`effects.ts:538-602`).

6. **Strong, centralized security.** One sanitizer each for `href`, image `src`, CSS length/color/url (`src/library/utils.ts`), `on*` handlers stripped from raw HTML, an allow-listed `HTMLTag`, and a runtime *budget* that aborts divergent programs (recursion/iteration/allocation) before they freeze the tab (`src/runtime/evaluator.ts`, tests in `tests/language-concepts.test.ts:845-1021`). For executing untrusted/LLM-authored code this is exactly right.

7. **Zero runtime dependencies, shadow-DOM isolation, framework-agnostic embedding, 7 polished themes with free theme-switching** (CSS variables rewritten without a re-render, `src/theme/index.ts:593-626`).

8. **LLM-authoring tooling that's ahead of its weight class:** a round-trip-safe formatter (`src/tooling/formatter.ts:47-61`), a structured Delta edit protocol that preserves `$state` across edits (`src/tooling/delta.ts`), an AST inspector, and a build-time system-prompt generator that keeps the model's mental model in sync with the actual component catalog.

Keep these. They are the foundation, and most of them are the *reasons* to use Aktion over React for the generative-UI use case.

---

## 3. Q1 — What would it take to be "as good as React for complex apps"? (Gaps & missing pieces)

Ordered by how much they matter for building a large, hand-maintained application. Tier 1 is structural; Tier 2 is component/rendering depth; Tier 3 is the dev loop.

### Tier 1 — Structural / language-level gaps

#### 3.1 No static type system — this is the single biggest gap

Everything in the DSL is dynamically evaluated and aggressively coerced. There is no type checker, no inference, no typed props. The evaluator swallows errors and returns `null` (`src/runtime/evaluator.ts` call/`new` paths), and `$util.toNumber` turns junk into `0` rather than erroring (`src/runtime/util.ts:14-18`). The practical consequence:

```js
// A typo in a state name or prop renders NOTHING — silently.
$user = { name: "Ada" }
aktion = Text($user.nmae)        // renders "" — no error, no warning
Button("Save", { variant: "primry" })  // enum typo: schema validator catches THIS one…
Button("Save", { onClik: save })       // …but an unknown prop on a USER component is never checked
```

The schema validator (`src/library/validate.ts`) catches unknown props/enums on *built-in* components, which is good, but it cannot type-check expressions, values, or user-defined components (`validate.ts:281`). For a complex app, the loss of compile-time safety that React+TypeScript provides is the thing that will hurt most over time. Hover doesn't help either — it reports `$count` as the literal string "reactive state atom" regardless of its initializer (`src/tooling/language-service.ts:217-219`).

**What it would take:** a static analysis pass (even a gradual/optional one) that infers atom types from initializers and flags member-access and prop typos before runtime, plus surfacing those as diagnostics. This is a large project, and it partly fights the "strict subset of JS, evaluated dynamically" design.

#### 3.2 No modules, no multi-file, no code-splitting

The DSL has no `import`/`export` (confirmed against the keyword set, `src/parser/lexer.ts:32-63`); a program is one flat statement list. A "complex app" is therefore **one giant file**. There is no lazy-loaded route, no dynamically imported component, no bundle splitting. React's `lazy()` + `Suspense` + route-level code-splitting are table stakes for large apps and have no analog here (the `Lazy` component just renders a fallback for a promise, `src/library/components/helpers.ts:160-186`).

**What it would take:** a module/include mechanism and lazy route/component boundaries. For the LLM use case this matters less (the model emits one program); for hand-built apps it's essential.

#### 3.3 The host↔program boundary is too narrow for app composition

Because the program is a string and the only inbound channels are `setResponse`, `setTheme`, `registerComponents`, `registerHttpInterceptors`, and `hydrateState` (`src/element.ts`), you cannot:

- pass a live host value into the program as a reactive prop,
- hand the program a typed callback from your host app,
- compose an Aktion subtree *inside* a host React tree with shared context.

You can register TypeScript `ComponentSpec`s (`element.ts:531-538`) that close over host data, and you can `hydrateState` a snapshot, but there is no ergonomic, reactive, typed bridge. For an embedded "assistant renders a rich response" island this is fine. For "build my whole complex app in Aktion and wire it to my backend/services," the boundary is a real constraint.

**What it would take:** a typed, reactive props/host-context API — e.g. `el.setProps({...})` that lands in a reserved reactive namespace, and a way to expose host functions to the program safely.

#### 3.4 No real data-fetching layer (no cache, dedup, mutations, pagination)

`$http` is a very well-built *per-request* `fetch` wrapper — its race-safety (generation tokens) and `onDone` settle semantics are genuinely correct (`src/runtime/http.ts:324-381`). But it is not React Query / SWR:

- **No cache / no dedup:** two components calling `$http({url: same})` make two requests; there's no shared store or cache key.
- **No revalidation** (on focus/reconnect/stale), **no mutation abstraction / optimistic-cache updates**, **no polling option**, **no retry/backoff** reachable from the DSL, **no infinite/paginated queries**.
- The doc comment promises a `defaults.timeoutMs` (`http.ts:139`) that **isn't implemented** — there's no timeout.

For data-heavy complex apps, the absence of a cache/mutation layer means you rebuild a lot of coordination by hand on `$state` + `$effect` + manual `.refetch()`.

#### 3.5 The router is minimal

`$router` (`src/runtime/router.ts`, ~270 lines) does hash-based matching with `:params` and wildcards, active-link highlighting, and browser history — cleanly. But for complex apps it lacks:

- **Nested routes / layouts / outlets** (you approximate with `/section/*` + a second `$router`),
- **Route guards / auth redirects**, **data loaders**, **lazy routes**,
- **Writable query params** — `route.query` is *read-only* and `navigate("/x?a=1")` has its query stripped (`router.ts:60-61`),
- **HTML5 history** (`pushState`/`replaceState`), `replace:`-style navigation, scroll restoration, typed params.

This is well short of React Router / TanStack Router.

### Tier 2 — Component & rendering depth

#### 3.6 The component library is wide but shallow exactly where complex apps push hardest

~165 components is a big catalog, but the "advanced" ones are presentational shells:

| Component | What a React dev expects | What Aktion ships |
|---|---|---|
| `VirtualList` (`new-components.ts:433-491`) | Variable-height, overscan, large lists | Fixed-height rows only, viewport hard-capped at **12 rows** |
| `DataGrid` (`advanced-data.ts:85-459`) | Server-side data, column resize/reorder/pin, grouping, cell edit, virtual rows, CSV | In-memory only, client paginated, none of those |
| `KanbanBoard` (`patterns.ts:520-619`) | Drag cards between columns | Purely presentational — `KanbanCard` has only `onClick`, **no drag** |
| `RichTextEditor` (`editors.ts:37-150`) | Lexical/TipTap/Slate model | `contenteditable` + deprecated `document.execCommand`, `window.prompt` for links |
| `CodeEditor` (`editors.ts:158-266`) | Syntax highlighting | Textarea + line-number gutter, **no highlighting** |
| `FieldRepeater` (`new-components.ts:399`) | Editable dynamic rows | Inputs are `readonly` — can't edit values |

Drag-and-drop is essentially absent (only raw DOM drag events via `OnMouse`, and — see §3.8 — those event handlers aren't even reconciled across re-renders). There is **no animation/transition system** at all. There is **no focus trap or focus restoration in `Modal`/`Drawer`/`Popover`** (`layout.ts:998-1067`, `advanced-patterns.ts:533-592`) — overlays don't trap focus, don't restore it on close, and `Modal` doesn't close on Escape. For accessibility-sensitive complex apps these are blocking.

#### 3.7 No controlled-input contract; two-way binding is positional and brittle

Inputs "bind" only when a **bare `$variable`** is detected and lifted to a `stateRef` at a **hardcoded positional index** in the spec (e.g. `Input` binds at arg index 4, `Slider` at 4, `Switch` at 2 — `forms.ts:128`, `forms.ts:547`, `feedback.ts:235`). So:

```js
Input("title", { value: $title })          // ✅ binds
Input("title", { value: $title || "" })     // ❌ does NOT bind (not a bare $var)
Input("title", { value: cond ? $a : $b })   // ❌ does NOT bind
```

There is no React-style `value` + `onChange` controlled contract, and many components keep internal `useInstanceState` you can't drive from the host (e.g. you cannot force a `DropdownMenu` closed). `CommandPalette` tries to be "controlled if `open` provided, else internal" (`new-components.ts:228-236`) — exactly the ambiguity React's controlled/uncontrolled split exists to avoid.

#### 3.8 The reconciler has a fixed event-property list (a latent correctness bug)

`morph.ts` transfers event handlers across re-renders by copying a **fixed list of 16 `on*` properties** (`EVENT_PROPS`, `src/renderer/morph.ts:32-49`). Drag events (`ondragstart`, `ondrop`, `ondragover`) and others (`onscroll`, `onwheel`, `oncontextmenu`, `ontouch*`) are **not in the list** — yet the `OnMouse` wrapper advertises drag/drop support (`wrappers.ts:177-184`). After the first re-render, those handlers won't be updated/cleared correctly. This should be either a complete list or a generic mechanism that discovers `on*` properties.

#### 3.9 Closed component set + a deliberately limited escape hatch

You cannot extend the system *from within the DSL* for anything genuinely custom. `HTMLTag` is allow-listed and **excludes SVG/MathML, `<script>`, `<style>`, form controls**, and strips all `on*` handlers (`escape-hatch.ts:28-41, 99`). There's no raw-`innerHTML`, no `ref`/mount lifecycle exposed to authors to hand a node to a third-party library (D3, a real datagrid, a map SDK). The intended answer to "I need X that isn't here" is **"write a TypeScript `ComponentSpec` and call `registerComponents`"** (`element.ts:531`) — i.e. you extend it as a host developer, not as an app author. That's a reasonable security posture, but it caps what the DSL alone can express.

### Tier 3 — The development loop

#### 3.10 No HMR, no DevTools, no LSP server, no source maps, no app-author test harness

The tooling is "library-grade pure functions and data," not "IDE-grade running infrastructure":

- **No hot reload / Fast Refresh.** Every program-text change triggers a full re-plan: re-parse the entire string, rebuild the context, re-mount effects (`element.ts:710-722, 906-986`). During streaming that's an O(n²) re-parse per chunk.
- **No DevTools.** The `inspector` is a static projection of source text (`src/tooling/inspector.ts`), not a live component/state tree. There is nothing like React DevTools' tree + props/state inspection + profiler.
- **No real editor extension.** `src/language/` ships the *data* a CodeMirror/Monaco/VS Code integration needs (tokenizer, grammar, snippets, completion catalog) but **no LSP server, no VS Code extension, no TextMate grammar** — the language-service file says as much (`language-service.ts:21-24`). No go-to-definition, rename, or find-references exist.
- **No source maps / DSL stack traces.** It's a tree-walking interpreter; breakpoints land in `evaluator.ts`, not your DSL. Runtime errors are mostly swallowed to `console.error` and the UI silently degrades.
- **No documented way for an app author to unit-test their program.** (The Vitest suite tests the framework itself.)

**Bottom line for Q1:** to be "as good as React for hand-built complex apps" Aktion would need, at minimum: a type system (§3.1), modules + code-splitting (§3.2), a richer host bridge (§3.3), a data-cache layer (§3.4), a real router (§3.5), deepened components + a11y/focus + animation (§3.6–3.7), and a real dev loop (§3.10). That is, candidly, most of the React ecosystem. The more realistic and valuable target is to be **the best generative-UI runtime**, where it already leads, and to fix the depth/polish issues that also happen to help hand-authors.

---

## 4. Q2 — What is too complicated and could be simplified?

These are places where the current design imposes avoidable cognitive load.

### 4.1 Too many overlapping ways to hold state, differentiated by *casing and position*

A developer must internalize all of these:

```js
count = 0                      // plain binding (re-seeded each render)
let total = count + 1          // local inside an action/effect body
$count = 0                     // top-level reactive atom
$total = $cart.sum(...)        // top-level COMPUTED atom (re-derives on dep change)
function Counter() { $n = 0 }  // PascalCase ⇒ per-instance state, "set once"
function tick() { $n = 0 }     // lowercase ⇒ action; same `$n = 0` writes a GLOBAL atom
const { value } = $state(0)    // the $state hook (per-instance)
$store({...})                  // global cross-component store
```

The rule that **first-letter casing determines whether `$n = 0` is per-instance set-once state or a global write** (`src/runtime/state.ts:131-151`, and the long warning at `element.ts:826-840`) is clever, but it's a footgun: rename a component from `Counter` to `counter` and its state silently relocates to a global atom. The "state write during render" warning is a 9-line paragraph (`element.ts:830-839`) — that length is itself a signal the model is hard to predict. **Simplify** by making the distinctions explicit and lexically obvious (e.g. a distinct keyword/sigil for per-instance state) rather than inferred from capitalization + render context.

### 4.2 The positional-arg + trailing-object call model with hidden binding indices

"At most one positional arg; everything else in a trailing object" (`src/library/types.ts:93-104`) is learnable, but which argument is positional differs per component and two-way binding depends on a literal slot index buried in the spec (§3.7). The searchable-`Select` shim that copies `argMeta[4] → argMeta[2]` before delegating to `Combobox` (`forms.ts:1221-1235`) is a smell that this coupling is fragile. **Simplify** by making binding name-based rather than index-based, so reordering a spec's props can't silently break binding.

### 4.3 Inconsistent prop and event naming across the catalog

- Click/submit handlers are variously `onClick`, `onSubmit`, `onSelect`, `onLoadMore`, `onComplete`, `onClose`, and the `action` alias is applied to some components but not others (`Button` has it, many don't).
- `onChange` payloads have *different shapes* per component: a string (`Input`), a boolean (`Checkbox`), a `{name: checked}` object (`CheckBoxGroup`), an array (`MultiSelect`), `{from,to}` (`DateRangePicker`), `{key,direction}` (`DataGrid` sort). Nothing signals which.
- Sizes use two vocabularies — `xs|sm|md|lg|xl` *and* legacy `small|normal|large` (`forms.ts:15-32`), with a dead double-check branch in the normalizer (`forms.ts:26` vs `30`).

**Simplify** by standardizing one event-naming convention, documenting (or unifying) the `onChange` payload contract, and collapsing to a single size vocabulary.

### 4.4 Theming has two shapes and two non-functional groups

`setTheme()` / the `theme` attribute take a **flat** token map (`{ colorPrimary, radiusButton }`); the in-DSL `$theme({...})` requires a **nested** shape (`{ colors:{primary}, radius:{button} }`) and rejects the flat form. Worse, two advertised nested groups don't work at all: `$theme({ motion: {...}, elevation: {...} })` is silently dropped because no `motion.*`/`elevation.*` subkey maps to a real token (`src/runtime/evaluator.ts:3955-3989` flattening vs the token set in `src/theme/index.ts`), and the snippet/validator even suggest broken `font: { heading }` / `font: { mono }` keys (`src/language/snippets.ts:230-233`, `validate.ts:428-430`). **Simplify** by supporting one shape everywhere and removing or implementing `motion`/`elevation`/`font.heading`.

### 4.5 Silent-everywhere error handling makes debugging harder than it should be

`$storage` swallows quota/SecurityError and returns `false`/`null` (`storage.ts:54-60`); the evaluator swallows call errors and returns `null`; `$i18n` falls back to the bare key; `$util` coerces rather than throws. Great for resilience under streaming, but for a *developer* it means failures are systematically invisible. A dev-mode that surfaces these (a strict flag) would make the same robust runtime debuggable.

---

## 5. Q3 — What's missing that would make a developer's life easier?

Things I reached for and didn't find:

1. **A development mode / strict mode.** A toggle that turns the silent `null`-on-error behavior into loud, sourced diagnostics; warns on unbound `value: $x || ""`; flags unknown member access. Today `showerrors` only shows *parse* errors, and even those are suppressed while streaming (`element.ts:988-1013`).

2. **A typed host-integration story.** Worked, typed examples (and `.d.ts`-driven docs) for `registerComponents`, `registerHttpInterceptors`, `serializeState`/`hydrateState`/`loadSnapshot`, `applyDelta`, events — these are powerful and currently documented as one-line table rows (`README.md:315-330`).

3. **A data-cache primitive** (`$query`/`$resource` with a key) so multiple readers share one request with revalidation — the single biggest convenience missing for real apps (§3.4).

4. **A controlled-input contract** (`value` + `onChange`) so host state is the single source of truth, plus a way to drive currently-internal UI state (open dropdowns, active tabs) from `$state`.

5. **Focus management + a11y primitives**: a focus-trap for overlays, Escape-to-close, focus restoration, and a documented statement of which components are keyboard/AT-ready (§3.6).

6. **Animation/transition primitives** (enter/exit, layout transitions) — even a small `Transition`/`Motion` wrapper.

7. **A real editor extension** (an actual LSP server + VS Code package), not just the data to build one. This is the highest-leverage DX investment given there are no types.

8. **An app-author testing guide + helpers** — a documented harness to mount a program, drive `setResponse`/`appendChunk`, assert on rendered output, and snapshot via `serializeState`.

9. **Writable query params and nested layouts** in the router (§3.5).

10. **`$util` completeness**: `map`/`reduce`/`keyBy`/`chunk`/`omit`/`debounce`/`isEqual`, locale-aware date month/day names (currently hard-coded English, `util.ts:70-73`), and fixing the `$util.filter(arr, field, "startsWith", v)` operator that the prompt advertises but the implementation doesn't support — it silently returns `[]` (`util.ts:25-40` vs `prompt/generator.ts:689`).

11. **Cross-tab + reactive persistence.** `$storage` has no reactivity and no hydration helper; a `persist($atom, "key")` that mirrors an atom to storage and rehydrates on load would remove a lot of boilerplate (§ runtime services).

---

## 6. Q4 — What is unnecessary or could be removed/streamlined?

The library is large (≈39k LOC, ~165 components, a 7,892-line CSS string). Streamlining options:

### 6.1 Cut or clearly label the "advanced" components that don't deliver

Shipping a `VirtualList` capped at 12 rows, a `KanbanBoard` with no drag, a `CodeEditor` with no highlighting, a `RichTextEditor` on `execCommand`, and a `FieldRepeater` with read-only inputs (§3.6) is arguably **worse than not shipping them** — the names set expectations the implementations don't meet, and they inflate both the catalog and the system prompt. Either deepen them to match their names or drop them and document the gap honestly. This directly improves the LLM use case too (fewer misleading affordances in the prompt).

### 6.2 Trim the opinionated "pattern composites"

Single-purpose composites like `Hero`, `PricingTable`, `Testimonial`, `ProfileCard`, `OnboardingChecklist`, `Spotlight`, `Tour` are heavy, rarely match a real product's design, and bloat the catalog/prompt. They help an LLM produce a quick mockup but are noise for a hand-coding developer. Consider moving them to an optional "starter/marketing" pack rather than the core library.

### 6.3 The 7,892-line single CSS string ships in full regardless of usage

`componentStyles` (`src/theme/styles.ts`) is one ~274 KB / ~38.5 KB-gzip template literal adopted wholesale (`element.ts:168-196`). Every page pays for all ~165 components' CSS even if it uses three. There's no tree-shaking. Consider generating per-component CSS (or splitting the sheet) so unused component styles can be dropped. It's also a maintenance liability — the Font-Awesome cascade regression guarded by `tests/theme.test.ts:112-143` is evidence of how brittle a hand-written 835-selector string is.

### 6.4 Remove dead/contradictory surface

- Non-functional `motion`/`elevation` theme groups and the broken `font:{heading|mono}` hints (§4.4).
- The stale `$http` `defaults.timeoutMs` doc comment for unimplemented behavior (`http.ts:139`).
- The dead `xs` double-check branch in `normaliseButtonSize` (`forms.ts:26/30`) and one of the two button-size vocabularies (§4.3).
- The empty `dataBuiltins` registry left over from the `@`-builtin → `$util` migration (`builtins.ts`).
- Repo hygiene: `backup-files/` and the empty `runtime-llm-todo.txt` shouldn't be in the tree.

### 6.5 The v1 legacy surface is necessary debt, but it is debt

The codemod, `LEGACY_V1_CALLS`, and manual-migration hints (`src/tooling/codemod.ts`, `validate.ts:245-279`) plus the lexer *throwing* on `@builtin`/`$$x` (see §10) are all carrying the weight of a past syntax. Once the migration window closes, removing this will simplify the parser and validator meaningfully.

---

## 7. Q5 — What is poorly documented or could be improved?

The docs are unusually good in some places (an auto-generated per-component prop reference in `docs/components.html`; a genuinely thorough React/Vue/Angular/Svelte migration guide in `docs/migration-guide.html`) and absent in others. The biggest problems are *discoverability* and *audience*.

### 7.1 Concepts that need much better documentation

- **The reactivity model's subtle rules.** The fine-grained model is explained well (`README.md:626-694`), but the rules that bite — *computed atom vs literal seed*, *PascalCase per-instance vs lowercase global write* (§4.1), and the "state write during render" anti-pattern — need a single, example-driven deep-dive. These are the rules most likely to produce "it silently does the wrong thing."
- **The two-way binding "bare `$var`" rule** (§3.7). This is surprising and currently implicit; it deserves an explicit, prominent callout with the failing cases (`value: $x || ""`).
- **The `onChange` payload contract per component** (§4.3) — what shape each component emits.
- **Custom component authoring.** There is exactly one 18-line example (`README.md:959-979`). The full `ComponentSpec` shape, declaring props/enums (so schema validation *and* the prompt pick them up), how `render` interacts with the morph reconciler, and how to support two-way binding / `key:` in a custom component are undocumented.
- **The host TypeScript API** (`element.ts` public surface) — `serializeState`/`hydrateState`/`loadSnapshot`/`applyDelta`/`registerHttpInterceptors`/`getSystemPrompt` and all events have no worked examples and `serializeState`/`hydrateState`/`loadSnapshot` appear in **zero** docs pages.
- **Tooling usage** — `formatProgram`/`applyDelta`/`inspectAST`/`getDiagnostics`/`getCompletions`/`getHoverInfo` are listed (`README.md:1276-1304`) without a real walkthrough, and the strong editor-integration content is buried in `src/language/README.md`, off the docs site.

### 7.2 Navigation and structure problems (mechanical, high ROI)

- **Orphan pages.** `stores.html`, `hooks.html`, `migration-guide.html`, `brand-themes.html`, `chat-bot.html`, `theme-customization.html` are not linked from any page's nav. Three of the most important conceptual pages (Hooks, Stores, Migration) are unreachable by clicking.
- **The README docs table is stale** (`README.md:1315-1334`) — it omits migration-guide, stores, hooks, and brand-themes.
- **Stubs:** `theme-customization.html` and `live-example.html` are near-empty shells.

### 7.3 Audience mismatch — there is no human learning path

The LLM-facing docs (the system prompt in `src/prompt/generator.ts`, and the 3,319-line `coding-gen-skill.md`) are the most complete, polished, maintained artifacts. But for a *human* developer:

- The README's Quick Start is LLM-streaming-centric (steps 4–5 are "stream from your LLM" / "send the system prompt", `README.md:231-274`) — a hand-coding developer must wade through that before reaching the language.
- There is no "build a complete app by hand, step by step" tutorial.
- The migration guide that would serve React developers exists but is orphaned.

So an LLM consuming `system_prompt.txt` is extremely well served; a human evaluating or hand-adopting Aktion has good *reference* material but no guided journey.

---

## 8. Q6 — New documentation pages / resources to create

Prioritized, each with a one-line rationale.

**Tier 1 — fix the human on-ramp (highest ROI):**

1. **Fix the site nav + README docs table** to surface Hooks, Stores, Migration, HTTP, Side-effects, Actions, Themes, Routing, i18n. *Mostly surfacing existing content; three of the strongest pages are currently unreachable.*
2. **"Build an app by hand" tutorial** — counter → list+state → form with binding → `$http` → routing → theming, explicitly without an LLM. *The missing human on-ramp; the #1 thing an evaluating developer needs.*
3. **"Aktion for React developers" landing page** that maps JSX→component calls, `useState`→`$state`, `useEffect`→`$effect`, props→positional+trailing-object, and links into the (excellent, currently orphaned) migration guide. *The brief explicitly asks for this comparison; the content largely exists but is buried.*

**Tier 2 — fill the missing-topic holes:**

4. **Testing guide** — render programs in tests, drive `setResponse`/`appendChunk`, assert output, snapshot via `serializeState`. *Zero coverage today.*
5. **Host integration & TypeScript API reference** — the full `<aktion-app>` surface with typed signatures and examples (`registerComponents`, interceptors, snapshot/hydrate/loadSnapshot, `applyDelta`, events). *Currently one-line table rows.*
6. **Security & trust-boundary guide for embedders** — CSP guidance, what full-JS-global access means for LLM-authored code, constraining `$http` egress via interceptors, the runtime budget as a safety lever. *Rendering untrusted output that can touch `fetch`/`document`/`localStorage` is the central risk and there's no host-facing guidance.*
7. **Error handling & debugging guide** — the `error` event shape, `showerrors`, `validateProgramSchema`, `ErrorBoundary`, and a "my program renders nothing" troubleshooting checklist. *No debugging story exists for humans.*
8. **Custom component authoring guide** — full `ComponentSpec`, props/enums, reconciler interaction, two-way binding + `key:`, and how the component flows into `getSystemPrompt()`. *Only an 18-line snippet exists; this is core extensibility.*

**Tier 3 — depth & polish:**

9. **Reactivity deep-dive** — computed vs seeded atoms, per-instance vs global writes, memoization rules, the state-write-during-render trap (§4.1, §7.1).
10. **Performance guide** — re-render/memoization in practice, inline-lambda cost, `VirtualList`/`InfiniteList`, the iteration budget, profiling.
11. **Editor tooling / LSP / formatter guide** — surface `src/language/README.md` on the site: CodeMirror/Monaco/VS Code setup, `formatProgram`, diagnostics wiring.
12. **State & persistence (incl. SSR/hydration)** — consolidate `$storage`, `$store`, `serializeState`/`hydrateState`/`loadSnapshot`, URL-synced state into one page.
13. **Accessibility guide** — which components are keyboard/focus/ARIA-ready and how to author accessible UI (and fix the overlay focus gaps first, §3.6).

---

## 9. A few concrete bugs surfaced during review

Not the focus of the brief, but worth flagging because they affect correctness:

1. **Lexer throws uncaught on legacy `@builtin(...)` / `$$x`.** `tokenize()` is called outside the per-statement try/catch (`parser.ts:38`) and `element.ts:926` doesn't wrap it, so a single `@foo()` or `$$x` is a hard crash of the planning pass rather than a recoverable diagnostic (`lexer.ts:329-353`). Contradicts the otherwise-graceful "render partial UI" philosophy.
2. **Reconciler doesn't reconcile drag/scroll/etc. handlers** — fixed `EVENT_PROPS` list (§3.8).
3. **`$util.filter`/`find` "startsWith"/"endsWith" operators** are advertised in the prompt but unimplemented — silently return `[]` (§5/§3.4).
4. **`$http` `defaults.timeoutMs`** documented but not implemented (`http.ts:139`).
5. **`$theme` `motion`/`elevation` groups** (and `font:{heading|mono}`) silently dropped (§4.4).
6. **`reconcileChildren` end-truncation** (`morph.ts:240-243`) removes surplus nodes from the end by count; combined with the parking logic for keyed reorders this looks capable of removing the wrong node in some reorder cases — worth a targeted test.

I can spin any of these off as separate fixes.

---

## 10. Summary scorecard

| Dimension | As a generative-UI / chat-assistant runtime | As a React replacement for hand-built complex apps |
|---|---|---|
| Reactivity engine | Excellent | Excellent |
| Streaming / partial render | Excellent (unique) | N/A |
| Reconciler / form-state preservation | Strong (fix event list) | Strong |
| Security / sandboxing | Excellent | Good |
| Component breadth | Strong | Wide but shallow |
| Component depth (virtualization, DnD, a11y, rich text) | Adequate for mockups | Weak |
| State model clarity | Acceptable (LLM-emitted) | Confusing (casing-driven) |
| Type safety | Acceptable (schema validation) | Missing — the biggest gap |
| Data layer (`$http`) | Good per-request | No cache/dedup/mutations |
| Router | Adequate | Minimal (no nesting/guards/loaders) |
| Modules / code-splitting | N/A | Missing |
| Host composition / typed props | By design narrow | Too narrow |
| Theming | Excellent | Good but capped |
| Dev loop (HMR/DevTools/LSP/types/maps) | Tailored (formatter/delta/inspector) | Far behind |
| Docs for the target audience | Excellent (LLM prompt) | Incomplete (no human path) |

---

## 11. The one recommendation that matters most

**Pick the product.** Aktion is, today, a *very good generative-UI runtime* wearing the marketing of a *general-purpose framework*. The two goals pull the roadmap in opposite directions:

- If the goal is **generative UI / chat assistants** (where the code already excels and where it does things React cannot): invest in component *depth* and honesty (§6.1), a11y/focus (§3.6), the data-cache primitive (§3.4), fixing the silent-failure debuggability (§4.5), and a real editor extension (§3.10) — and stop inviting a head-to-head with React in the docs.

- If the goal is genuinely to **rival React for hand-built complex apps**: the prerequisites are a type system (§3.1), modules + code-splitting (§3.2), a typed host bridge (§3.3), a router and data layer with real depth (§3.4–3.5), and a real dev loop (§3.10). That is a multi-year effort that substantially re-implements the React/TypeScript ecosystem — and it would mean walking back some core design choices (the string-island boundary, the dynamic untyped language) that are exactly what make the generative-UI story strong.

My recommendation is the first path. Aktion's best, most defensible identity is "the safest, most ergonomic way to render rich, interactive, *streaming* UI from an LLM." Lean into that, fix the depth-and-polish gaps that also happen to help hand-authors, and the React comparison stops being the relevant yardstick.
