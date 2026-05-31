# Aktion — Developer Feedback & Analysis

> Perspective: a mid/senior front-end engineer (React/Vue background) who has just
> read the README, browsed the source under [src/](src/), the test suite under
> [tests/](tests/), and the docs in [docs/](docs/), and is evaluating whether to
> adopt `aktion-runtime` for a real product.

Aktion is genuinely impressive: it bundles a streaming parser, a reactive
runtime, a 170+ component library, theming, routing, i18n, HTTP, an LSP-ready
tooling layer, a visual editor and a chat playground — all into one web
component. The "drop one script tag and one tag" pitch works. The criticisms
below assume that high bar; almost everything is "what would I want before
I bet a product on this," not "this is broken."

---

## 1. What feels complicated and could be simplified

### 1.1 The mental model leaks framework-author concepts to authors
The pitch is "it's just a strict subset of JavaScript," but in practice an
author has to internalise *six* parallel author surfaces:

1. `aktion = …` (reserved entry point)
2. `$name = value` (reactive atoms — read/write with the same sigil)
3. `function Name() { return … }` (component — PascalCase, always returns)
4. `function name() { … }` (action — camelCase, may return)
5. `effect(() => …, [deps])` (anonymous side effects, with magic strings
   `"mount"`, `"unmount"`, `"every(N)"`, `"debounce(N)"`, `"throttle(N)"`
   mixed into the same array as `$atom` references)
6. Lambdas as inline handlers — `onClick: () => …`

That is *more* concepts than React's hooks model, not fewer. The README
itself needs ~200 lines to introduce them. The case-sensitivity rule
(PascalCase = component, camelCase = action) is the kind of invisible
distinction that produces silent failures.

**Suggestions:**
- Replace string-as-trigger entries (`"every(1000)"`, `"debounce(500)"`)
  with structured helpers: `effect(fn, { deps: [$x], every: 1000, debounce: 500 })`
  or `effect(fn).every(1000)`. Magic strings inside a dependency array are
  the kind of thing that won't autocomplete and will silently typo.
- Make `component(…)` / `action(…)` factories explicit instead of overloading
  `function` by case. Self-documenting and avoids the "I named it `card`
  and nothing renders" trap.
- Document a single recommended way to do each of: derived value, async
  load, debounced search, interval. Right now `effect` + `Http` + `@`-
  functions + actions can all overlap.

### 1.2 Too many ways to render a response
The element accepts the program through `response` attribute, inner text,
`setResponse()`, `appendChunk()`, `loadSnapshot()`, `applyDelta()`,
`hydrateState()`. Each has different reset semantics (does it clear state?
does it preserve queries? does it re-plan?). That table belongs in the README
as a matrix; today an author has to read [src/element.ts](src/element.ts) to
know whether `setResponse` resets `$atom` state.

### 1.3 `@`-builtins are a third dialect on top of JS + components
Authors learn JS (`Array.prototype.filter`), then `$rows.filter(...)`, then
*also* `@Filter($rows, "id", "!=", 7)`. They overlap in coverage but not in
ergonomics. The string-DSL form (`"id", "!=", 7`) is appealing for an LLM
to emit but a human reviewer has to keep flipping to the docs to know whether
the third arg is a value or another column name. Pick one canonical style
(prefer JS-native callbacks) and keep the string DSL as a documented
shorthand, not the default in examples.

### 1.4 The trailing-object rule has a sharp edge
"At most one positional argument; everything else goes in `{}`" is a great
rule, but it conflicts with the JS habit of `Button("Save", "primary")`.
The validator now treats it as a schema error. Good — but the error message
needs to be specific and copy-pasteable (it is, but make sure every single
component's error suggests the exact rewrite).

### 1.5 The shadow-DOM boundary is silently load-bearing
Authors don't see it, but it changes how every host CSS rule, every dev-tool
inspector path, every Tailwind class, and every `:focus-within` selector
behaves. Document the implications up front: "your global CSS will not
style anything inside `<aktion-app>`."

### 1.6 Effect dependency arrays mixing atoms, strings, and lifecycle
```js
effect(() => { … }, [$draft, "debounce(500)", "every(1000)", "mount"])
```
There's no compiler that tells you `"debounce(500)"` + `"every(1000)"` is
incoherent, or that `"mount"` with no deps does what you expect. A typed
options bag (per 1.1) would also surface mutual-exclusion in the type system.

---

## 2. What's missing that I'd want before shipping

### 2.1 First-class TypeScript story for authored programs
The runtime is in TS, but the **program text** is an untyped string. There's
no `.aktion` file, no language-server you can point at a source file, no
`.d.ts` describing the component library at the call-site level. A React
developer expects to get squiggles when they pass `variant: "magik"`. Today
that surfaces *at render time* via `validateProgramSchema`. Ship at minimum:
- A `aktion-vscode` extension wrapping [src/tooling/language-service.ts](src/tooling/language-service.ts).
- A way to author programs as ES modules that get pre-validated at build
  time (e.g. `import { program } from "./dashboard.aktion?inline"`).

### 2.2 SSR / first-paint story
For a content site or a SaaS dashboard, FCP matters. The current model is
"ship JS, parse, run, render." Document or implement:
- A pre-render path so the server returns HTML for the initial route.
- A hydration story (`hydrateState` exists, but how do I get a pre-rendered
  shadow DOM tree?).
- A loading skeleton that the host can render before the bundle parses.

### 2.3 Testing the authored programs
There's no `@testing-library`-style helper for *Aktion programs*. A user can
test the runtime, but not their dashboard. I'd want:
```ts
import { render, fireEvent } from "aktion-runtime/test";
const ui = render(program);
fireEvent.click(ui.getByText("Add"));
expect(ui.getByText("Todo 1")).toBeInTheDocument();
```

### 2.4 Devtools panel
Reactivity is the biggest win and the biggest mystery. I want a panel that
shows: every `$atom`, its current value, what depends on it, which `effect`
last fired, the last 50 renders with timings, and the matched route. The
runtime already tracks all of this — surface it.

### 2.5 Forms validation
`Form`, `FormControl`, `ValidationSummary` exist, but I see no integrated
schema validator (zod/yup analogue). Real forms need: per-field validators,
async validators, dirty/touched/submitted flags, server-side error
attribution. The current shape is closer to a UI grouping than a form
engine.

### 2.6 HTTP ergonomics
`Http({...})` is fine for one-shot calls. Missing:
- A query cache shared across components (today every call site is its own
  resource bag — no `useQuery`-style cache key dedupe).
- Pagination/infinite-scroll helper that pairs with `InfiniteList`.
- Mutation primitives with optimistic-update affordances and rollback (the
  language references "optimistic snapshot/rollback" but nothing in the
  public API points at it).
- A request-deduplication policy when two components mount with the same
  URL in the same tick.

### 2.7 Accessibility audit & docs
With 170+ components, a11y guarantees are a make-or-break for enterprise.
The README mentions `aria-*` nowhere meaningful, and I can't tell from
[src/library/components/](src/library/components/) which components are
audited. Publish a matrix: per component, which WAI-ARIA pattern, which
keyboard interactions, focus-trap status (for `Modal`, `Drawer`, `Popover`,
`CommandPalette`), screen-reader test results.

### 2.8 Theming: a token reference *file*
Themes are mentioned in [docs/themes.html](docs/themes.html), but I want a
machine-readable `tokens.json` and a TS type so my IDE can autocomplete
`colorPrimary` vs `colorPrimaryHover` vs `colorSurfaceMuted`. The Theme
structured form (`colors.primary` vs flat `colorPrimary`) needs a single
documented canonical name per token.

### 2.9 Internationalization beyond strings
`i18n({ messages })` covers translation. Missing:
- Pluralisation/ICU MessageFormat (`@Plural` exists but the contract isn't
  documented as a full MessageFormat replacement).
- RTL story — does setting `direction: "rtl"` flip the layout components
  reliably? Untested in the visible test suite.
- Date/number locale fallback when `Intl` is missing on the runtime.

### 2.10 Programmatic state subscription from the host
`serializeState()` / `hydrateState()` are snapshots. There's no
`el.subscribe("$cartCount", fn)` for the host page. Real apps need to
mirror a slice of state to the chrome (cart badge, unread count).

### 2.11 Error boundary policy
`ErrorBoundary` is listed under "Helpers" but I can't find documentation on
*what* it catches: parser errors, render-time errors, action exceptions,
effect exceptions, `Http` errors? Without that contract I can't rely on it.

### 2.12 Bundle-size answer
The README never states the gzipped size of the runtime. For a "drop a
script tag" library, that's the first question every team asks. Publish
the number; offer a slim build that excludes the visual editor, codemirror,
font-awesome auto-load, and rarely-used components like `Gantt` / `DiffViewer`.

---

## 3. What feels like it could be removed or scoped out

### 3.1 The visual editor probably shouldn't live in the runtime repo
[docs/visual-editor.html](docs/visual-editor.html) and the chat-bot
playground are wonderful demos but bloat the project mental model.
Ship them as separate packages (`aktion-visual-editor`, `aktion-playground`).
Today a developer reading "what is aktion-runtime" gets a 1,200-line README
that has to cover both the library *and* a no-code editor.

### 3.2 `HTMLTag` and `Styles` escape hatches
They're framed as last resort but their existence undermines the "the LLM
can only produce safe components" promise. If an attacker can convince the
LLM to emit `HTMLTag("script", …)` or `Styles("body{display:none}")`, the
shadow DOM does not protect the *page*'s perceived behaviour. At minimum:
- Disable `HTMLTag`/`Styles` by default; require an opt-in flag.
- Whitelist the tags/CSS properties allowed.
- Document the threat model.

### 3.3 Seven built-in themes feels like marketing, not engineering
`neon`, `pastel`, `glass`, `brutalist`, `skyline` are fun but every theme
ships extra CSS in the bundle. Two themes (`light`, `dark`) plus a clean
`Theme({...})` example is enough; move the rest to a separate
`@aktion/themes` package or a docs gallery that users copy-paste.

### 3.4 Font Awesome auto-load
Auto-fetching Font Awesome 6.7.2 from a CDN at runtime is:
- A surprise network call.
- A privacy concern (CDN logs the user's IP on every page load).
- An offline-app blocker.
- A version coupling — what if I want FA 7?
Make it opt-in (`<aktion-app icons="font-awesome">`) and document a path
to ship icons locally or use a different set (lucide, heroicons).

### 3.5 Two prompt flavours hard-coded in the build
`system_prompt.txt` and `system_prompt_chat.txt` get baked at build time.
The right primitive is `generatePrompt(library, options)`; the two text
files should be examples in docs, not first-class exports. Otherwise every
non-default consumer ships dead bytes.

### 3.6 IIFE bundle
In 2026 with ESM everywhere, shipping an IIFE bundle is a maintenance
tax for unknown benefit. Drop it unless there's a documented consumer
who genuinely can't load a module.

### 3.7 Async function as a no-op modifier
"`async function` is accepted as a no-op modifier; `await` is allowed in
both statement and expression position" — accepting `async` but ignoring
it leads to programs that *look* async but aren't. Either implement it or
make it a parse error.

---

## 4. Documentation gaps

### 4.1 Architecture & rendering pipeline
There is no "how it works" page. A library this opinionated needs one:
parse → plan → bind → render → reconcile → diff. Add a diagram in
[docs/](docs/) so adopters can reason about performance and lifecycle.

### 4.2 Lifecycle contract per construct
For each of `effect`, action, component, `Http`, `Router`: when is it
created, when re-run, when torn down, in what order? Today this is
scattered across README sections and source comments.

### 4.3 Performance guidance
- When does the reconciler decide to reuse a node vs replace it?
- What's the cost of a re-render? Are atoms batched?
- What's the recommendation for a 10,000-row table? Pointer to
  `VirtualList`? `InfiniteList`?
- How big can a single program get before the parser/runtime budget bites?

### 4.4 Security model
The runtime budget is documented; the *threat model* is not.
- What can a malicious LLM-emitted program do? (`HTMLTag`, `Styles`,
  `fetch`, `document`, `localStorage`, `crypto`…)
- Are full JS globals (`window`, `document`) really exposed inside an
  action body? If yes, the "safe by shadow DOM" framing is misleading.
  Document the actual sandboxing guarantees.

### 4.5 Migration guide *from* React/Vue
[docs/migration-guide.html](docs/migration-guide.html) exists — make sure
it explicitly maps `useState`→`$atom`, `useEffect`→`effect`,
`useMemo`→`@Memoize?` (does that exist?), `useRef`→? props
spread→`{ ...rest }`, context→? (no context primitive surfaces in the README).

### 4.6 Versioning & stability
The package is `0.5.2`. Which APIs are stable, which are experimental?
Without a deprecation policy I can't recommend it for a multi-year project.

### 4.7 Per-component examples in the prompt
The "chat" prompt is great for LLMs; humans want the same examples in
[docs/components.html](docs/components.html) inline so they can copy-paste
without booting the playground.

### 4.8 Error catalog
Every parse / schema error code in one page, with cause and fix. Adopters
hit these constantly; today they're documented as they're emitted in source.

---

## 5. Documentation pages I'd add

- **`how-it-works.html`** — architecture, render pipeline, diff strategy.
- **`performance.html`** — benchmarks, budgets, virtualisation, large-list
  patterns, profiling tips, devtools usage.
- **`security.html`** — threat model, sandbox guarantees, `HTMLTag` /
  `Styles` policy, CSP recommendations, host CSP headers.
- **`testing.html`** — unit-testing authored programs, mocking `Http`,
  faking `storage`, asserting on rendered output.
- **`ssr.html`** — server-side rendering / pre-render strategies and
  hydration with `loadSnapshot` / `hydrateState`.
- **`accessibility.html`** — per-component a11y matrix, keyboard map,
  screen-reader test status, RTL support.
- **`recipes.html`** — task-oriented: "debounced search," "auth refresh,"
  "optimistic mutation," "infinite scroll," "modal stack," "wizard form
  with validation," "i18n with pluralisation," "shared cart between two
  components."
- **`comparison.html`** — honest comparison with React Server Components,
  Lit, htmx, Alpine, Svelte runes. Helps adopters slot it mentally.
- **`devtools.html`** — once the panel exists.
- **`cookbook-for-llms.html`** — best practices for prompt engineers
  using `getSystemPrompt(opts)`: how `additionalRules`, `tools`,
  `editMode` actually affect generation, with paired before/after model
  outputs.
- **`extending.html`** — deeper than "register a component": custom
  `@`-builtins, custom themes packaged as npm modules, custom escape
  hatches, contributing components upstream.

---

## 6. Could a React developer migrate? Honest take

**Today (v0.5.2): not for a greenfield production product yet, but yes for a
narrow and growing class of products.**

### Where it's already a great fit
- **LLM-driven UI surfaces.** This is the killer use case. If your product
  has a chat that produces UI (an analyst tool, an in-app copilot, an
  AI-generated dashboard), Aktion is the *best* option I've seen. The
  streaming reconciler, the system-prompt generator, and the schema-as-truth
  validator together solve problems that custom React glue takes months
  to get right.
- **Internal tools & admin panels.** 170+ components, a router, theming,
  i18n, a visual editor — a small team can ship a CRUD admin in a day.
- **Marketing / docs sites with interactive widgets.** The drop-in tag
  story is unbeatable for embedding.
- **Embedded UI inside another app.** Shadow-DOM isolation is exactly
  what you want here.

### Where I would not migrate yet
- **Customer-facing flagship apps.** Missing SSR, no devtools, no proven
  bundle-size story, no perf benchmarks, no a11y matrix, no testing
  helpers, no TypeScript story for *programs*. These aren't deal-breakers
  intrinsically — they're "I can't justify the risk to the team" blockers.
- **Apps with heavy form/validation logic.** The form layer is a UI
  grouping, not a form engine. React + react-hook-form + zod is years
  ahead here.
- **Apps with deep ecosystem dependencies.** React's ecosystem
  (stripe-js, mapbox, charting libs, animation libs) is enormous. Aktion
  has 170+ components but you cannot drop a React component into the
  middle of a program. The `HTMLTag` escape hatch is the only bridge,
  and it's deliberately discouraged.
- **Apps where a senior team will read every line of UI code.** "It's a
  subset of JS" sounds great, but `$`-prefixed atoms, `@`-builtins, and
  string-encoded effect deps create just enough novelty that onboarding
  a hire takes a real investment vs React.

### What would tip me to "yes" for greenfield apps
1. TypeScript-first authoring (`.aktion` files with `tsserver` diagnostics).
2. SSR + hydration documented.
3. Devtools.
4. A11y matrix.
5. Test library.
6. A 1.0 with a stability promise.

That's a believable 6–12 month roadmap, not a multi-year rewrite. The
architectural foundations (parser, reactive runtime, tooling, prompt
generator) are already there.

---

## 7. Real-world use cases

Ranked by fit, with rationale.

### Very strong fit
1. **AI assistants that produce rich UI** — analyst tools, ops copilots,
   "ask your data" products. Aktion was clearly designed for this and it
   shows. The `assistant-message` event + `getSystemPrompt({ mode: "chat" })`
   close the loop in one element.
2. **Internal tools and admin dashboards** — the 170+ components plus
   `KanbanBoard`, `DataGrid`, `DescriptionList`, `Timeline`, `Stats`,
   `Toolbar`, `EmptyState` cover ~95% of admin needs in single calls.
3. **Embeddable widgets in third-party pages** — pricing tables, support
   chat surfaces, "configure your plan" wizards. Shadow DOM isolation +
   one-tag install is exactly the integration story embedders want.
4. **Rapid prototyping** for product designers and PMs — the visual
   editor + chat-bot are a credible Figma-to-prototype path.
5. **Documentation sites with live demos** — the existing site is itself
   evidence; the `<aktion-app response="…">` attribute is the cleanest
   live-example primitive I've seen.

### Plausible with reservations
6. **SaaS dashboards** (analytics, CRMs, project management) — viable
   once SSR + perf + a11y stories land.
7. **B2B forms-heavy apps** (insurance, healthcare intake) — viable once
   the form layer gets validation/server-error integration.
8. **No-code / low-code platforms targeting Aktion as output** — the
   delta protocol (`applyDelta`) is a strong primitive for visual editors
   that emit Aktion source. Could be the runtime for a Retool/Tooljet
   competitor.

### Where I would not reach for it
9. **High-interactivity consumer apps** (games, design tools, video
   editors) — the diffing/string-DSL overhead doesn't pay off when you
   need 60fps custom canvases.
10. **Apps with bespoke design systems and animation-heavy brand work** —
    you'll fight the component library and the theme tokens rather than
    using them.
11. **Native-feeling mobile web apps** — touch gesture stack, scroll
    momentum, virtualisation edge cases are not yet first-class.
12. **Highly regulated apps requiring audited frameworks** (FedRAMP,
    HIPAA) — pre-1.0 + no published threat model is a procurement
    blocker today.

---

## 8. Top-10 actionable wins (if I were prioritising)

1. **Bundle-size number on the README**, plus a slim build.
2. **TypeScript types for programs** via a `.aktion`-aware language
   service shipped as a VS Code extension.
3. **Devtools panel** that visualises atoms, effects, renders, routes.
4. **Form validation engine** + `Form` integration.
5. **HTTP cache & mutation primitives** (one query cache, one mutation
   helper with optimistic patterns).
6. **A11y matrix page** + automated axe runs in CI.
7. **SSR / pre-render path** with a documented hydration recipe.
8. **Testing library** for authored programs.
9. **Replace magic-string effect deps** with a typed options object.
10. **Split visual-editor / chat-bot into their own packages** so the
    runtime stays lean and the value prop stays focused.

---

## 9. Summary

Aktion is one of the most interesting front-end projects I've seen in
the LLM era. The architectural decisions — strict-JS-subset surface,
streaming parser, single component shape, reactive atoms with one sigil,
shadow-DOM isolation, schema-as-truth validation, baked-in prompt
generator — are mostly *right*. The library breadth is genuinely
production-grade in surface count.

What holds it back from a confident "yes, build your next app on this"
is the absence of the boring-but-essential infrastructure that React has
spent a decade accumulating: types at the author surface, devtools,
SSR, test helpers, form validation, perf benchmarks, a11y guarantees,
and a stable version contract. None of those are research problems —
they're scope-and-time problems on top of a strong foundation.

For LLM-generated UI, internal tools, embedded widgets, and rapid
prototyping, it is already *the* tool I would reach for. For a flagship
customer app, I would wait one or two more minor versions and revisit.
