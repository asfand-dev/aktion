# Aktion vs. React — A Gap Analysis

> Perspective: a senior front-end engineer who has shipped large React/Next.js
> apps and is asking the hard question: *"could I bet a real product on
> Aktion the way I'd bet on React today, and if not, what would have to
> change?"* I read the [README](README.md), walked
> [src/](src/) (parser, runtime, renderer, library), the test suite under
> [tests/](tests/), the docs in [docs/](docs/), and the system-prompt
> generator under [src/prompt/](src/prompt/).
>
> tl;dr — Aktion is the best **LLM-generated-UI** runtime I've seen. As a
> general-purpose React competitor it is **not close yet**, and the gap is
> not "more components." The gap is in the *primitives a hand-written app
> needs to scale*: a true component model, real async/data semantics,
> testability, type safety, performance ceilings, and an editor/debugger
> story. Below is the honest, opinionated list of what would have to ship
> before I'd reach for it instead of React for a new product.

---

## 0. Where Aktion is already excellent

Before the criticism, the genuine wins — these are real reasons to pick
Aktion *today* for the niche it targets:

- **Streaming-first parser & reconciler.** Each line commits to the DOM as
  it arrives. React + Suspense gets nowhere near this ergonomically; the
  whole architecture in [src/parser/frontier.ts](src/parser/frontier.ts)
  and [src/renderer/morph.ts](src/renderer/morph.ts) is purpose-built for
  it.
- **One sigil, one reactive kind.** `$name = value` is *simpler* than
  React state. No `useState`, no setter, no stale closures, no
  `useCallback` dance. For 80% of UI work this is just better.
- **Component-call shape is uniform.** `Component(positional, { props })`
  killed React's grab-bag prop list. Beautiful for diffing, validation,
  prompt generation.
- **Shadow-DOM isolation + drop-in script tag.** The "paste into any
  page" promise actually works.
- **Visual editor + chat + playground + system-prompt generator** in
  the same repo. Few libraries ship the whole loop.
- **Schema-driven validation.** `validateProgramSchema` in
  [src/library/validate.ts](src/library/validate.ts) catches whole
  categories of bugs React simply can't (unknown prop, wrong enum
  value).
- **170+ components on tap.** No React UI kit ships a comparable
  breadth in one bundle.

Everything below assumes that high baseline.

---

## 1. The component model is the biggest gap

React's core abstraction isn't JSX — it's *the component as a closure
of state, props, effects, and a stable identity*. Aktion has the
pieces but they are bolted on, and the seams show in any non-trivial
app.

### 1.1 No first-class props object, no children pattern

In React you write:

```jsx
function Card({ title, children, footer, ...rest }) { … }
<Card title="x"><Row/><Row/></Card>
```

In Aktion the closest equivalent is:

```js
function Card(title, { footer }) { … }  // title is the only positional
```

Problems:

1. **No `children` slot convention.** The trailing-object rule says
   "everything is named," but composition is the heart of UI work.
   Every component invents its own `children` / `items` / `content` /
   `body` named prop. The library is internally inconsistent
   (`Card([...])` vs `Modal("title", { children: [...] })` vs
   `Stack(items)`). React beats this with the universal `children`
   prop. Aktion should pick one canonical name (`children:`) and use
   it for every container.
2. **No multi-slot composition.** React lets you pass `header`,
   `footer`, `aside` as JSX. Aktion can do it via named props but
   it's neither documented nor consistent. A `<Card header={…} footer={…}>`
   equivalent needs to be a *first-class pattern*, not a per-component
   shape decision.
3. **No spread / forwarded refs.** I cannot write
   `<MyButton {...buttonProps} />` cleanly, and there is no `ref`
   forwarding to a DOM node. For wrappers that augment a base
   component (a tracked button, an analytics-wrapped input) this is
   essential.
4. **Component IDs are positional by default.** `key:` exists but the
   default is path-based identity, which silently breaks reordering.
   React's "keys are mandatory in lists, warned at runtime" rule has
   been earned the hard way. Aktion's renderer should warn loudly
   when an array of components without `key:` is reordered between
   renders. Today it just loses state.

### 1.2 PascalCase = component, camelCase = action

This is a footgun:

```js
function Card(...) { return … }   // component
function card(...) { return … }   // silently an action — renders nothing
```

I will absolutely typo this in a hurry. Make the distinction
**explicit**, not lexical:

```js
const Card = component((title, props) => …)
const save = action(() => …)
```

The README already calls this out as a sharp edge; doubling down
matters at the scale of a real app.

### 1.3 No equivalent of hooks beyond `$state` + `effect`

React's hook ecosystem isn't bloat — it's *extension surface*:

- `useMemo` — derived values cached across renders.
- `useRef` — escape hatch for DOM access without re-render.
- `useImperativeHandle` — exposing methods to parents.
- `useContext` — implicit prop drilling.
- `useReducer` — formal state machines.
- `useId` — stable accessibility IDs.
- `useSyncExternalStore` — integrating outside data sources.
- Custom hooks — *the* composition primitive.

Aktion has none of these. **`Util.*` is not a substitute** because
`Util` helpers are pure functions; they can't hold state, can't subscribe
to anything, can't return a stable identity across renders.

Concrete missing primitives:

- **Memoized derived state.** Today `derived = $items.filter(...)`
  recomputes on every render. For large lists this is fatal. There
  is no `computed($items, items => items.filter(...))` or
  `$total = derived(() => $items.reduce(...))` with caching.
- **Refs.** There is no way to grab a DOM node to call `.focus()`,
  measure with `getBoundingClientRect`, integrate a non-Aktion
  widget (a third-party chart, a Mapbox instance), or attach a ResizeObserver
  cleanly. `OnIntersect` is a one-off; a general `Ref` primitive is
  needed.
- **Context.** A theme override in a subtree, a "current user" object,
  a feature-flag bundle — today you stuff it in `$state` and
  every component reads the global. Scoped context (provider/consumer)
  is essential past a certain size.
- **Custom composables.** I cannot write `useTodos()` returning
  `{ todos, add, remove, loading }` and reuse it across screens. The
  best I can do is duplicate the `Http` + `effect` setup in each
  component. This is a productivity cliff.
- **A `Suspense` equivalent.** `Async` is a single component with
  fixed slot names; React's `<Suspense fallback>` composes recursively
  through arbitrary trees. Aktion needs the same.

**Recommendation:** ship a `useState($name)`, `useMemo`, `useRef`,
`useContext` family that mirrors React's mental model but reuses the
`$` reactive substrate. A `composable name() { … }` keyword (or
`hook(name, () => ({ data, refetch }))`) would unlock the
ecosystem the same way custom hooks unlocked React.

### 1.4 No real component contract

A React component has a contract: props in, JSX out, lifecycle in
between. An Aktion component is "any function with a PascalCase name
that returns something the renderer accepts." There is no type, no
required-prop check at the call site, no static analysis of the
return shape. This is fine for LLM-emitted UI; it's painful when a
team of 8 humans owns 400 components.

---

## 2. State management beyond "one global atom store"

`$state` is brilliant for small apps. It becomes a foot-gun at scale:

### 2.1 Everything is global by default

```js
$count = 0   // top-level — global
function Foo() {
  $count = 0   // inside a component — instance-scoped
}
```

Both are spelled identically. Reading the source you cannot tell
which `$count` a line refers to without knowing the surrounding
scope. React has the same `useState` shape in both spots but the
*call site* makes it obvious. Aktion's elegance here costs
readability.

### 2.2 No selectors / no fine-grained subscription

Every reactive read in a component subscribes the *whole component*
to that atom. If `$user` changes one nested field, every component
that touched `$user.anything` re-evaluates. React-Redux solved this
with selectors; Solid with fine-grained reactivity; MobX with
observables. Aktion needs at least:

- `$user.name` should subscribe only to `name`, not the whole `$user`
  graph.
- A way to write `derived(() => $items.filter(...))` that caches
  until inputs change.

Browser DevTools profiling on a 50-component dashboard with a single
streaming `$data` atom will be ugly without this.

### 2.3 No time-travel / no devtools

React DevTools + Redux DevTools are the reason teams are *productive*
on stateful apps. Aktion has no inspector for `$state`, no action
log, no replay, no diff view. The visual editor is for authoring,
not debugging a live session. Ship an `aktion-devtools` browser
extension (or even a simple in-page panel) that shows:

- All `$atoms` with current values and which components subscribe.
- Effect mount tree, last-run timestamp, dependency snapshot.
- A timeline of mutations with diff.
- Component render counts and time.

Without this, debugging a "why did this re-render" question requires
reading [src/runtime/state.ts](src/runtime/state.ts) and
[src/renderer/renderer.ts](src/renderer/renderer.ts). Not viable for
a team.

### 2.4 Persistence and SSR are half-built

`serializeState()` and `hydrateState()` exist (`element.ts`), but
there is no server-side rendering story:

- The shadow-DOM bundle assumes a browser. Node SSR support would
  require splitting the renderer from the DOM substrate.
- There is no streaming SSR equivalent — ironic, given streaming is
  the whole pitch.
- There is no hydration mismatch detection.
- There is no route-aware data preloading (Next.js loaders /
  Remix `loader`).

For SEO-sensitive, content-heavy apps (the bread-and-butter of React
in 2026 via Next.js / Remix / Astro), Aktion is currently a
non-starter.

---

## 3. Async and data fetching

`Http({...})` is clean for one call. Real apps need more.

### 3.1 Missing primitives

- **Mutations vs. queries.** React Query / SWR distinguish read
  (`useQuery`) from write (`useMutation`). Aktion uses the same
  `Http` for both. There is no `invalidate`, no "after this mutation,
  refetch these queries," no optimistic update primitive.
- **Caching across components.** Two components calling
  `Http({ url: "/api/me" })` issue two requests. There is no shared
  cache keyed by URL+params. React Query's dedup + cache layer is
  table stakes for any non-trivial app.
- **Pagination / infinite scrolling.** `InfiniteList` exists as a
  component, but no data primitive backs it. `useInfiniteQuery` in
  React Query handles cursor, page accumulation, refetch — Aktion's
  consumer has to wire it manually.
- **WebSockets / SSE.** No primitive. For a live dashboard,
  collaborative editor, or chat product, this is a hole.
- **Suspense-style boundaries.** `Async` only handles a single
  resource. What if a screen needs three things? You write nested
  `Async`. Composability is poor.

### 3.2 No retry / backoff / cancellation policy

`refetch()` and `cancel()` are exposed, but retry-on-failure,
exponential backoff, race-condition handling (newer request wins),
and request deduplication are left to the user. The README's "host
can install interceptors" is the wrong layer — these are runtime
concerns, not host concerns.

### 3.3 The reactive resource bag has subtle traps

```js
$todos = Http({ url: "..." })
$todos.refetch()   // ok
$todos.data        // null until resolved
```

If `$todos` is reassigned (`$todos = Http(...)` again), the old
resource leaks (its in-flight request, its `onDone`, its `lastUpdated`).
There is no `useResource` lifecycle. Re-running with a different URL
should be a single primitive, not a `$key = Math.random()` hack.

---

## 4. Type safety, IDE, and tooling

**This is the single biggest reason senior teams pick React in 2026.**
TypeScript + VS Code + React DevTools is a productivity multiplier
that Aktion currently cannot match.

### 4.1 No type checking at the component-call site

Aktion ships TypeScript types for the *runtime API*, not for the
*language*. Inside `<aktion-app>` source:

```js
Button("Save", { variant: "magic", loading: 42 })
```

…produces a runtime/validate.ts error, not a compile-time one. There
is no `.aktion.d.ts` mapping component schemas to TypeScript. There
is no LSP server emitting diagnostics in VS Code (the
[src/tooling/](src/tooling/) layer has `getDiagnostics` but no
published extension).

**Ship:**

- A real VS Code extension (the playground's intellisense is close —
  port it to a Language Server).
- A TypeScript code-generator that, given the component library,
  emits typed wrappers so you can write `.aktion.ts` files that
  compile-check at build time.
- Or — go the SolidJS route: make Aktion *a TypeScript DSL* compiled
  by a Vite plugin, so the editor experience is "real TypeScript."

### 4.2 Source maps and stack traces

Errors inside `effect`/`function` bodies point to lines in the
generated runtime, not the user's source. A reactive bug at line 240
of a 600-line program is a maze. The parser already tracks line/
column — propagate them through the evaluator into thrown errors so
the console shows the *user's* line.

### 4.3 No formatter integration

`formatProgram` exists but there's no Prettier plugin, no
`.editorconfig` story, no save-on-format in any popular editor.
Ship a Prettier plugin. Adoption depends on it.

### 4.4 No test runner / no `@testing-library/aktion`

How do I unit-test a component? There is no documented answer. The
project's own tests use Vitest against parsed programs — fine for
the library author, useless for a consumer who wants to assert
"clicking the Save button on `<UserForm/>` calls the API with
`{ name: 'X' }`."

React has 10 years of `@testing-library/react`. Without an analog,
no professional team will adopt Aktion at scale.

---

## 5. Performance ceiling

The reconciler in [src/renderer/morph.ts](src/renderer/morph.ts) is
solid but the design has fundamental ceilings vs. React Fiber:

### 5.1 No incremental rendering / no time-slicing

React 18+ can pause work, prioritize urgent updates, and yield to
the browser. Aktion re-evaluates the whole program on every change
and morphs the DOM. For a complex dashboard with a streaming WS
feed, this will block the main thread.

**Mitigations needed:**

- Memoized component results keyed by props identity.
- Fine-grained reactivity (Solid-style) so a `$user.name` change
  doesn't re-evaluate the whole tree.
- Concurrent scheduling — at minimum, debounce render via
  `requestIdleCallback` for non-urgent updates.

### 5.2 No virtualization story beyond `VirtualList`

`Table`, `DataGrid`, `Tree`, `KanbanBoard` will all collapse past a
few thousand rows because every row evaluates every render. React
has react-window / TanStack Virtual baked into community muscle
memory.

### 5.3 Bundle size

The "everything in one script tag" pitch means *everything ships*:
170 components, charts, editor, FA icons, theme engine. Look at
`docs/assets/` — a typical site only needs `Button + Card + Input`.
Tree-shaking via `import "aktion-runtime"` (named imports) would be
a huge win for production use.

### 5.4 Runtime parsing cost

The whole DSL is parsed at runtime on every `setResponse`. For an
LLM-generated UI that's the point. For a hand-written app it's
pointless overhead vs. React's compile-time JSX. Offer a **build-time
compiler** that turns `.aktion` files into pre-compiled component
trees + serialized state plans.

---

## 6. Accessibility, i18n, internationalization

### 6.1 A11y

The component library *uses* native elements (good), but:

- No documented a11y contract per component (does `Modal` trap focus?
  does `Tabs` arrow-navigate? does `DropdownMenu` announce expanded
  state?).
- No automated a11y test suite (no axe-core integration).
- No skip-link primitive, no live-region helper, no documented
  reduced-motion respect.

For enterprise apps (the React majority), an a11y audit is a
release-blocker. Aktion needs a published WCAG 2.1 AA matrix per
component and a CI job that enforces it.

### 6.2 i18n

The new `i18n({...})` factory is fine for messages but missing:

- ICU/MessageFormat (plurals, gender, select).
- Date/number formatting per locale (Aktion uses `Util.formatDate`
  with hardcoded English).
- RTL layout (`direction: "rtl"` is in the theme but no `dir`
  attribute on components).
- Translation file loading / lazy locale bundles.
- Pseudo-locale generation for testing.

A serious React app uses FormatJS or i18next; the Aktion built-in is
30% of either.

---

## 7. Routing

`Router({...})` is fine for hash routing. Missing for real apps:

- **History-mode routing** (clean URLs). Hash is fine for embeddable
  widgets, terrible for SEO/sharing.
- **Nested routes** with shared layouts. `pages = Router({...})`
  is flat. React Router / Remix nest layouts; Aktion would need
  `RouterLayout(children: …, routes: …)` or similar.
- **Route guards / loaders.** No `beforeEach`, no auth gate, no
  data loader. Today you scatter `if (!$auth) route.navigate("/login")`
  effects across components.
- **Code splitting per route.** Everything is in one bundle, so the
  whole app loads up front. React + lazy/Suspense + dynamic import
  is a 2017 baseline that Aktion does not match.
- **Scroll restoration**, **focus restoration on navigation**,
  **transition animations** — none exist.
- **Type-safe route params.** `route.params.id` is `any`.

---

## 8. Forms (the most under-discussed gap)

React has `react-hook-form`, Formik, TanStack Form — entire
sub-ecosystems for forms because forms are 60% of business apps.
Aktion has `Form`, `FormControl`, `ValidationSummary`, `MultiStepForm`
as *components* but no **form state primitive**:

- No `useForm()` analog (values, errors, touched, dirty, submitCount,
  isSubmitting).
- No schema-driven validation (Zod / Yup integration).
- No async-validation contract.
- No "submit" lifecycle (`onSubmit` + automatic loading state +
  error mapping back to fields).
- No field-array helper for repeating sections.
- No persistence (autosave drafts on type) primitive.

`ValidationSummary` *displays* errors but the developer is on the
hook to compute them. For a 30-field onboarding flow, this is days
of work that React handles in 50 LOC.

---

## 9. Animation & gesture

React has Framer Motion / React Spring / Auto-Animate. Aktion has:

- `transitionDuration` in the theme.
- Nothing else.

Missing:

- Enter/exit animations (a `Modal` snaps in and out).
- Shared element transitions.
- Spring/physics-based motion.
- Gesture handling beyond `OnMouse` (no swipe, no pinch, no drag with
  inertia).
- View Transitions API integration.

For a "best UX in 2026" library this is a glaring hole.

---

## 10. Error handling & resilience

- **`ErrorBoundary` exists as a component** but the docs don't say
  what it catches (render errors? effect errors? action errors? HTTP
  errors?). React drew this line carefully and documented it.
- **No global error reporting hook.** Sentry / Datadog integration
  is a `try/catch` in every action.
- **Effect errors silently die.** A throw inside an `effect` should
  bubble somewhere observable (the host `error` event, currently
  parse-only).
- **The runtime budget is a great safety net** (componentDepth,
  iterations, arrayLength). React has nothing like it. Lean into it
  — surface it in DevTools so devs *see* when they're close to a
  ceiling.

---

## 11. Ecosystem maturity (the meta-gap)

Honest truth: even if every technical gap above were closed
tomorrow, React wins on ecosystem inertia. To close *that*:

- **A package registry.** `npm i @aktion/form`, `@aktion/charts`,
  `@aktion/router`. Today everything is in one bundle, so there is
  nowhere for the community to plug in.
- **Plugin architecture.** No way to inject middleware into
  `$state` mutations (for logging, persistence, undo/redo),
  middleware into `Http`, middleware into the renderer.
- **A starter / scaffolding CLI.** `npx create-aktion-app`. No
  serious framework lives without one.
- **Migration codemods.** "Move from React to Aktion" — a script
  that converts simple JSX to component calls. The visual editor
  already kind of does the reverse; productize it.
- **A real project showcase.** "Built with Aktion": three actual
  shipped products, not a docs site. Until those exist, "is this
  production-ready" cannot be answered with yes.
- **Versioning + LTS commitment.** What is the breaking-change
  policy? The `prompts.txt` history shows many language-level
  reshapes in a short window (rename `_app_` → `aktion`, drop
  `@Filter`, etc.). For consumers this is terrifying. Publish a
  "stability promise" doc.

---

## 12. Concrete prioritized roadmap

If I were running the project and the goal were "rival React for
hand-written apps within 18 months," here is the order I'd ship:

1. **Build-time compiler + TypeScript DSL.** `.aktion.ts` files
   compiled by a Vite/Rollup plugin into pre-evaluated component
   trees. Unlocks type-safety, source maps, and the IDE story all
   at once.
2. **Hook-equivalent primitives**: `useMemo` / `derived`, `useRef`,
   `useContext`, `composable` (custom hooks).
3. **Fine-grained reactivity.** Subscribe at the property level, not
   the atom level. Borrow from SolidJS.
4. **Real DevTools extension.** State inspector, render profiler,
   effect timeline. Without this, no enterprise adoption.
5. **Form state primitive.** A `useForm()` with Zod integration.
6. **Data layer.** `useQuery` / `useMutation` style, shared cache,
   invalidation, optimistic updates. Or vendor TanStack Query.
7. **Routing v2.** History mode, nested layouts, loaders, code
   splitting.
8. **SSR + streaming SSR**, hydration.
9. **Testing library**, **Prettier plugin**, **VS Code extension**.
10. **Animation primitive** (port Auto-Animate semantics).
11. **A11y matrix + axe-CI**.
12. **Package split** + plugin protocol.

Items 1-4 alone would make me consider Aktion for an internal tool.
1-9 would make me consider it for a customer-facing product. All 12
would put it in genuine React-competitor territory.

---

## 13. Closing assessment

**For its core mission — rendering streamed LLM-generated UI in a
chat or embed — Aktion is already best-in-class.** I'd reach for it
today, not React, for any "the assistant draws the answer" use case.

**For replacing React in a complex hand-written app, Aktion is
roughly where Vue 1 was in 2014**: an elegant reactive core, a
charming component story, no ecosystem yet, no IDE story, no
DevTools, no SSR, no testing convention. Vue closed those gaps over
ten years. Aktion *can* — the architecture is clean, the parser is
real, the team clearly cares about ergonomics — but the work
remaining is roughly the work of building Next.js + React Query +
React Hook Form + React DevTools + react-i18next combined.

The single highest-leverage move is **a build-time compiler with
TypeScript types**. Without it, every other improvement runs into
the IDE-experience wall. With it, the path to React parity is at
least visible.

Aktion is a delight to read. The README, the language design, the
component library, and the prompt generator are all the work of
someone who cares. I want the next 18 months of this project to be
about *what hand-written apps need*, not more components — because
the components are already great, and the next 100 won't close any
of the gaps above.
