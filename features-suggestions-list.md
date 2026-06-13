# Aktion — Migration Readiness Feature Proposals

> **Audience:** the Code Gen LLM that will implement these features into Aktion.
> **Goal:** make migrating *any* type of modern web page or application (marketing
> sites, SaaS dashboards, admin consoles, e-commerce, content/docs sites, realtime
> & collaborative apps, BI/analytics, auth flows, PWAs) into Aktion **a piece of
> cake** — fast, predictable, and lossless.
>
> **How to read this:** each proposal states the *real migration challenge* a
> frontend developer hits, the *proposed feature*, an *API sketch in Aktion's own
> conventions*, and a *priority*. Every proposal is designed to respect Aktion's
> existing design philosophy:
>
> - **Surface syntax stays a strict subset of JavaScript.** No new alien syntax;
>   reuse `$builtin(...)`, function-call components, the trailing-object prop rule,
>   `sx`, and the `$util` namespace.
> - **LLM-friendliness first.** Every feature must be teachable in the system prompt
>   and expressible declaratively.
> - **No heavy new dependencies.** Prefer platform primitives; keep the single-bundle
>   story intact.
> - **Streaming- and partial-render-safe.** Features degrade gracefully on incomplete
>   input.
>
> **Important — what already exists (do NOT re-propose):** `$http`/`$query`/`$mutation`
> (caching, dedup, polling, infinite pagination, GraphQL, optimistic, invalidation),
> `$socket`/`$sse`, hash **and** history routing with nested layout routes + navigation
> guards + query-param state + scroll restoration, `$state`/`$memo`/`$ref`/`$reducer`/`$id`
> hooks, `$store` (persist + undo/redo), `$form` + `$util.rules` (incl. async), `$toast`,
> `$theme`, `$i18n`, `$storage`, SSR/SSG (`renderToString`), the `sx`/`animate` channel,
> `OnMount` DOM-ref escape hatch, `Portal`/`ErrorBoundary`/`Async`/`Show`/`Lazy`,
> testing utils, the LSP/language service, and `htmlToAktion`/`tailwindToSx`. The
> proposals below are the **remaining** gaps.

---

## Table of contents

1. [The migration mental model — what "easy migration" requires](#1-the-migration-mental-model)
2. [Tier 0 — Structural blockers (highest leverage)](#tier-0--structural-blockers)
3. [Tier 1 — Language & runtime gaps](#tier-1--language--runtime-gaps)
4. [Tier 2 — Host interop & incremental migration](#tier-2--host-interop--incremental-migration)
5. [Tier 3 — Styling & CSS migration](#tier-3--styling--css-migration)
6. [Tier 4 — SEO, document head & metadata](#tier-4--seo-document-head--metadata)
7. [Tier 5 — Auth, authorization & session](#tier-5--auth-authorization--session)
8. [Tier 6 — Data layer round-outs](#tier-6--data-layer-round-outs)
9. [Tier 7 — Component library gaps](#tier-7--component-library-gaps)
10. [Tier 8 — Forms & inputs](#tier-8--forms--inputs)
11. [Tier 9 — Animation & motion](#tier-9--animation--motion)
12. [Tier 10 — i18n / l10n depth](#tier-10--i18n--l10n-depth)
13. [Tier 11 — Accessibility automation](#tier-11--accessibility-automation)
14. [Tier 12 — PWA, offline & native](#tier-12--pwa-offline--native)
15. [Tier 13 — Observability & error handling](#tier-13--observability--error-handling)
16. [Tier 14 — Migration tooling & codemods](#tier-14--migration-tooling--codemods)
17. [Priority matrix & suggested roadmap](#priority-matrix--suggested-roadmap)

---

## 1. The migration mental model

A "migration" is rarely a green-field rewrite. Modern teams migrate in one of three
shapes, and Aktion should be excellent at all three:

1. **Lift-and-shift a whole page** (a marketing page, a settings screen, a report).
   Blockers: missing components, CSS fidelity, SEO/meta, and any imperative
   third-party widget on the page.
2. **Strangler-fig / incremental** (replace one route or panel at a time inside an
   existing React/Vue/Angular app). Blockers: there is no clean **two-way data bridge**
   between the host app and `<aktion-app>`, no way to pass reactive props in or read
   state out without manual `setResponse`/event glue, and no shared auth/session.
3. **AI-assisted rewrite** (feed the old source to an LLM, emit Aktion). Blockers:
   the converters only cover static HTML today; there is no React/Vue/Svelte/Angular →
   Aktion path, and no fidelity report telling you *what could not be translated*.

The proposals are ordered so that the **structural blockers that affect all three
shapes** come first.

A migration is "a piece of cake" when a developer can answer **yes** to all of:

- *Does a component exist for every UI element on my page?* → Tier 7.
- *Can I reproduce my exact styling?* → Tier 3.
- *Can I drop in my existing third-party widget (Stripe, Mapbox, a chart lib, a rich
  editor)?* → Tier 0.1.
- *Can I share state/auth between the host app and Aktion during incremental
  migration?* → Tier 2.
- *Will my SEO/meta/social cards survive?* → Tier 4.
- *Can I express my async control flow and shared context the way I do today?* →
  Tier 0.2, Tier 1.
- *Is there a tool that does 80% of the conversion for me and tells me about the
  remaining 20%?* → Tier 14.

---

## Tier 0 — Structural blockers

> These three gaps block entire **classes** of applications. They are the highest
> leverage items in the whole document.

### 0.1 First-class third-party / imperative widget interop — `Mount(...)` + `$dom`

**Migration challenge.** Almost every real app embeds at least one imperative library
that owns its own DOM: Stripe/Adyen Elements, Mapbox/Leaflet/Google Maps, a charting
lib (Chart.js, ECharts, D3), Monaco, TipTap/ProseMirror, a video SDK, a captcha, a
calendar SDK. Today the only escape hatch is `OnMount(child, { onMount: node => … })`,
which hands you a node but gives no managed lifecycle (props updates, teardown, async
script loading, web-component interop). This makes "I just need my existing widget on
the page" disproportionately hard and is the **#1 reason a page cannot be fully
migrated**.

**Proposal.** A first-class managed-imperative-component primitive with a clean
lifecycle contract, plus an external-script loader and native web-component bridge.

```js
// Managed imperative widget: setup runs once after attach, update runs on dep change,
// cleanup runs on unmount. The host node is created/owned by Aktion; you fill it.
chart = Mount({
  tag: "div",                          // wrapper element (default "div")
  sx: { h: "320px" },
  setup: (node, props) => {            // runs once; return an instance handle
    return new Chart(node, props.config)
  },
  update: (instance, props) => {       // runs when `props` change (shallow-compared)
    instance.data = props.data; instance.update()
  },
  cleanup: (instance) => instance.destroy(),
  props: { config: $cfg, data: $series }
})

// Load an external UMD/ESM script or stylesheet once, reactively gated on readiness.
$stripe = $script({ src: "https://js.stripe.com/v3/", global: "Stripe" })
// → { ready, error, value }  (value = window.Stripe once loaded)

// Render and hydrate ANY custom element / web component with reactive attrs + events.
widget = WebComponent("stripe-pricing-table", {
  attributes: { "pricing-table-id": $id, "publishable-key": $pk },
  on: { "checkout": e => route.navigate("/thanks") }
})
```

Also expose a managed observer namespace so migrations of resize/intersection/mutation
logic don't each hand-roll listeners:

```js
$dom.onResize(node, ({ width, height }) => $w = width)   // ResizeObserver, auto-disposed
$dom.onIntersect(node, entry => …)                       // beyond the OnIntersect wrapper
$dom.measure(node)                                        // → { rect, scroll } one-shot
```

**Priority:** 🔴 Critical. Unblocks the entire imperative-library ecosystem.

---

### 0.2 Scoped context / dependency injection — `$context(...)` / `Provide(...)`

**Migration challenge.** React's Context, Vue's provide/inject, Angular's DI, and
Svelte's `setContext` are *everywhere* in modern apps: theme providers, auth/user
providers, feature flags, form contexts, locale, design-system tokens scoped to a
subtree, and test mocking. Aktion's `$store` is a **global singleton keyed by call
site** — you cannot scope a value to a subtree, instantiate two of the same factory,
or override a value for one panel. Migrating any provider-based app means flattening
all of it into globals and rewiring every consumer, which is exactly the kind of deep
rewrite that makes migration *not* a piece of cake.

**Proposal.** A lightweight context primitive that respects the component tree.

```js
// Create a context with a default value.
ThemeCtx = $context({ accent: "indigo" })

// Provide a scoped value to a subtree (overrides ancestors for descendants only).
panel = Provide(ThemeCtx, { value: { accent: "rose" } }, [
  Toolbar(...),               // sees accent: "rose"
  SettingsList(...)
])

// Consume from anywhere inside the subtree — reactive, fine-grained by path.
function AccentBadge() {
  ctx = ThemeCtx.use()        // reads nearest provider, falls back to default
  return Badge(ctx.accent)
}
```

This also gives migrations a clean **testing/mocking seam** (wrap a subtree, inject a
fixture) and enables **multi-tenant theming** and **scoped feature state** without
prop-drilling.

**Priority:** 🔴 Critical. Required by virtually every non-trivial React/Vue/Angular app.

---

### 0.3 Gradual type story for `.aktion` — typed props, typed state, generated `.d.ts`

**Migration challenge.** Migrating a TypeScript codebase means giving up the single
biggest maintainability tool. Component params are `any`, `$state` atoms are untyped,
and a renamed prop silently flips named→positional with no diagnostic. Teams that live
in TS will resist a migration that erases their type safety.

**Proposal.** An *optional*, gradual type layer that stays a strict JS subset (types
live in comments or a thin annotation subset so every program remains valid JS), plus
tooling that generates `.d.ts` from `registerComponents` and from the `.aktion` source.

```js
// Option A — JSDoc-style annotations the language service understands (zero new syntax):
/** @param {string} title @param {"sm"|"md"|"lg"} size */
function Card2(title, size = "md") { return Card([CardHeader(title)]) }

// Option B — typed state hints surfaced as diagnostics:
$count = 0          // inferred number; later `$count = "x"` warns in strict mode

// Tooling:
// - `componentTypes(library)` → emit a .d.ts for all registered components.
// - LSP: flag named→positional flips, enum mismatches from variables, arity errors.
```

This is **gradual** — no program is forced to add types, but TS-heavy teams get back
their safety net during and after migration.

**Priority:** 🟠 High. Major adoption unblocker for enterprise/TS teams.

---

## Tier 1 — Language & runtime gaps

### 1.1 Real sequential async — make `await` actually suspend

**Migration challenge.** `await` currently parses but is a **no-op** (it evaluates the
expression and discards the promise); action/effect bodies run synchronously. Any
migrated code with sequential async logic — `const a = await fetchA(); const b =
await fetchB(a.id); save(b)` — silently breaks. Developers reach for `await` reflexively;
"it parses but does nothing" is the single most dangerous surprise in migration.

**Proposal.** Implement true async suspension inside action/effect bodies (an `async`
action returns a promise; `await` actually awaits). Keep render-time evaluation
synchronous, but let imperative bodies sequence. Provide a clear, prompt-documented
contract:

```js
async function checkout() {
  order = await $http({ url: "/orders", method: "POST", body: $cart }).done()  // resolves the bag
  $receipt = await $http({ url: `/orders/${order.data.id}/receipt` }).done()
  $toast.success("Done")
}
```

If full suspension is too invasive, the **minimum viable fix** is to (a) make `await`
on an `$http`/`$query`/`$mutation` bag resolve when it settles, and (b) emit a
**strict-mode warning** whenever `await` is used on a value that won't actually
suspend, so the no-op is never silent.

**Priority:** 🔴 Critical. Prevents a whole category of silent migration bugs.

---

### 1.2 Regex literals (or a clearly-documented substitute)

**Migration challenge.** There is no `/pattern/flags` token; the lexer treats `/` only
as divide/comment. Migrated validation, parsing, routing, and formatting code is full
of regex literals and will fail to parse. `new RegExp("...")` works but forces
double-escaping that LLMs and humans get wrong.

**Proposal.** Add regex-literal lexing (`/foo\d+/gi`) with the standard `/`-disambiguation
rules, OR — if that's deemed too risky for the streaming line parser — add a
first-class `$re("foo\\d+", "gi")` builtin and **loudly document** that `/.../` is
unsupported, with the language service auto-suggesting the rewrite.

**Priority:** 🟠 High.

---

### 1.3 Class-free OOP escape & `this`-free service pattern

**Migration challenge.** No `class`/`extends`/`super`/`this`. Migrated services, models,
view-models, and class components have no direct landing spot. Most can become plain
objects + functions, but there is no documented, prompt-taught pattern, so an LLM
converting class-based code has nowhere to put it.

**Proposal.** Don't add classes (keeps the subset clean). Instead:

1. Ship a **prompt-documented "service object" pattern** (factory functions returning
   objects of methods, with `$store` for stateful services).
2. Add a `$service({ state, ...methods })` convenience builtin (a non-rendering sibling
   of `$store` for pure logic/services with no UI binding) so converters have a
   canonical target for class-based logic modules.

**Priority:** 🟡 Medium (mostly a converter + docs concern).

---

### 1.4 Runtime dynamic `import()` / true lazy code-splitting

**Migration challenge.** `Lazy(() => import(...))` is best-effort; there is no runtime
module system, so large migrated apps can't code-split routes/heavy components. A 200-route
admin app would ship as one program.

**Proposal.** Wire `Lazy`/route-level lazy to the compiler + a runtime module registry
so `import()` resolves an out-of-band compiled chunk, with a `Suspense`-style fallback.
Pair with per-route lazy in `$router` (`{ "/reports": Lazy(() => import("./reports.aktion")) }`).

**Priority:** 🟡 Medium (matters most for large SaaS/admin migrations).

---

## Tier 2 — Host interop & incremental migration

> This tier is what makes the **strangler-fig** migration shape possible. Without it,
> teams must rewrite a whole app at once.

### 2.1 Two-way host ⇆ Aktion data bridge — reactive props in, state out

**Migration challenge.** When you embed `<aktion-app>` inside an existing React/Vue/Angular
screen, the only inbound channel is `setResponse`/attributes (string-typed, re-parses
the whole program) and the only outbound channel is `$emit` events. There is no way to
**pass live reactive props** from the host into a running program, or to **subscribe**
to a program's state from the host, without manual glue. Incremental migration (the most
common real-world shape) is therefore painful.

**Proposal.** A typed, reactive props/state bridge on the element.

```js
// Host side (React/Vue/plain):
const el = document.querySelector("aktion-app")
el.setProps({ user: currentUser, cart })          // merges into a reserved $props atom
el.watchState("cart", cart => syncToReduxStore(cart))   // subscribe to a program atom
el.callAction("checkout", { coupon })             // invoke a named action from the host
```

```js
// Program side: $props is a reserved, reactive, read-only-from-host inbound bag.
greeting = Text(`Hi ${$props.user.name}`)
$cart = $props.cart                                // hydrate local state from host props
```

This makes `<aktion-app>` behave like a real component in the host framework: props
down, events/state up. Provide thin official wrappers (`<AktionApp>` for React, a Vue
component, an Angular directive) that map framework props → `setProps` and state → host
signals.

**Priority:** 🔴 Critical for incremental migration.

---

### 2.2 Shared runtime registries — fonts, icons, components, interceptors at the host

**Migration challenge.** During incremental migration a team has an existing design
system. They want Aktion to use the *same* icon set, fonts, tokens, and a few shared
components, configured once. Today `registerComponents` exists but icons/fonts/tokens
are configured per-instance and custom components don't flow into tooling.

**Proposal.** A host-level registry applied to all `<aktion-app>` instances:
`Aktion.configure({ theme, icons, fonts, components, interceptors })`, plus make
`registerComponents` feed the language service so custom components get
completions/hover/diagnostics (closing the editor-tooling gap noted in the repo's own
sync rule).

**Priority:** 🟠 High.

---

### 2.3 Official framework adapter packages

**Migration challenge.** The docs have integration *recipes*, but every team re-writes
the same wrapper. A migration is smoother when there's a blessed `@aktion/react`,
`@aktion/vue`, `@aktion/angular`, `@aktion/svelte` that handles props/state bridging
(2.1), SSR hydration, and TypeScript types out of the box.

**Proposal.** Ship thin adapter packages (no logic duplication — they wrap the element +
the bridge from 2.1) with typed props and SSR helpers.

**Priority:** 🟡 Medium.

---

## Tier 3 — Styling & CSS migration

> `sx` + `tailwindToSx` are strong, but real pages use CSS features `sx` can't express,
> so a migration loses fidelity exactly where pixel-perfection matters most.

### 3.1 Custom keyframes & animation authoring — `$keyframes` / `sx.animation`

**Migration challenge.** Only named motion presets exist (`animate: "fade-up"`).
Migrated apps have bespoke `@keyframes`, multi-step animations, and CSS transitions on
arbitrary properties. There's no way to author them without dropping to `Styles(css)`
raw strings (which lose token-awareness and scoping).

**Proposal.**

```js
$keyframes("pulse-ring", { "0%": { opacity: 1, scale: 1 }, "100%": { opacity: 0, scale: 2 } })
Box({ sx: { animation: { name: "pulse-ring", duration: "1.5s", iterations: "infinite", ease: "ease-out" } } })
```

**Priority:** 🟠 High (visual fidelity).

### 3.2 Pseudo-elements & richer selectors in `sx` — `before` / `after` / `selectors`

**Migration challenge.** `sx.states` covers hover/focus/etc., but migrated CSS uses
`::before`/`::after` (badges, ribbons, decorative carets), `:nth-child`, `:first-child`,
group/peer-style relationships, and `::placeholder`/`::selection`. None are expressible.

**Proposal.** Extend `sx` with `before`/`after` (object → pseudo-element rule) and a
guarded `selectors: { "&:nth-child(2n)": {...}, "&::placeholder": {...} }` channel
(sanitised, scoped to the component's shadow subtree).

**Priority:** 🟠 High.

### 3.3 Container queries & full responsive parity

**Migration challenge.** `sx` responsive maps resolve to media breakpoints only.
Modern component-driven CSS uses **container queries** (`@container`), which are now the
idiomatic way to build reusable responsive components — exactly the kind of thing being
migrated.

**Proposal.** Add a `container` channel: mark a node as a container
(`sx: { container: "card" }`) and allow `{ "@card": { md: ... } }`-style maps that emit
`@container` rules.

**Priority:** 🟡 Medium.

### 3.4 Global/raw CSS with token awareness & scoping guarantees — `$styles(...)`

**Migration challenge.** `Styles(css)` injects raw CSS but is opaque (no token vars
interpolated, no documented scoping, easy to leak/conflict). Migrated stylesheets,
CSS-module output, and styled-components extractions need a managed sink.

**Proposal.** A `$styles` builtin that accepts an object or string, interpolates theme
tokens (`{{color.primary}}`), scopes to the shadow root, and dedupes — the safe target
for "paste my existing CSS here."

**Priority:** 🟡 Medium.

### 3.5 Deepen `tailwindToSx` + add CSS-string → `sx` and styled-components extraction

**Migration challenge.** `tailwindToSx` leaves many utilities `_unmapped`
(arbitrary values `w-[327px]`, gradients, transforms, transitions, ring/divide, grid
templates, aspect, backdrop). A migration that loses 20% of classes isn't a piece of cake.

**Proposal.** Expand coverage to arbitrary values, transforms, transitions, gradients,
grid-template utilities, and ring/divide; add `cssToSx(cssText)` and a
`styledToSx(template)` helper for styled-components/emotion extraction.

**Priority:** 🟠 High (directly improves automated conversion %).

---

## Tier 4 — SEO, document head & metadata

### 4.1 Document head management — `$head(...)` / `$meta(...)`

**Migration challenge.** There is **no** API to set `document.title`, meta description,
canonical link, Open Graph / Twitter cards, JSON-LD, or `<link rel>` per route.
Migrating *any* marketing page, blog, docs site, or e-commerce PDP — i.e. anything that
must rank in search or render a social preview — is blocked. This is a silent
deal-breaker for the entire "content/marketing" class of pages.

**Proposal.** A reactive head manager that also feeds SSR output.

```js
$head({
  title: `${$product.name} — Acme`,
  meta: { description: $product.summary, "theme-color": "#111" },
  og: { title: $product.name, image: $product.image, type: "product" },
  twitter: { card: "summary_large_image" },
  link: [{ rel: "canonical", href: $canonicalUrl }],
  jsonLd: { "@type": "Product", name: $product.name, offers: {...} }
})
```

Per-route titles compose with the router; `renderToString` emits the resolved head so
SSR pages are crawlable.

**Priority:** 🔴 Critical for marketing/content/e-commerce migrations.

### 4.2 Responsive images & asset hints — `Image` srcset/lazy/priority

**Migration challenge.** `Image` takes a single `src`. Migrated pages use `srcset`/`sizes`,
lazy loading, `fetchpriority`, blur-up placeholders, and aspect-ratio reservation
(CLS avoidance) — core to Lighthouse/Core-Web-Vitals scores teams won't regress on.

**Proposal.** Extend `Image` with `srcset`, `sizes`, `loading`, `priority`, `placeholder`
(blur/color), and intrinsic `width`/`height` for layout reservation.

**Priority:** 🟠 High.

---

## Tier 5 — Auth, authorization & session

### 5.1 Auth/session primitive — `$auth(...)` + route protection + role gates

**Migration challenge.** Practically every app behind a login screen has: a session,
token storage + refresh, protected routes, role/permission-gated UI, and an OAuth/redirect
flow. Aktion has interceptors and navigation guards as building blocks but **no
first-class auth concept**, so every migration re-implements the same fragile glue.

**Proposal.** A reactive auth bag plus declarative gates.

```js
auth = $auth({
  session: () => $http({ url: "/me" }),     // how to load the current user
  refresh: () => $http({ url: "/refresh", method: "POST" }),  // token refresh on 401
  storageKey: "session",
  loginRedirect: "/login"
})
// → { user, status: "anonymous"|"authenticating"|"authenticated", login(), logout(), hasRole(r), can(perm) }

// Declarative route protection (integrates with $router guards):
pages = $router({
  "/dashboard": Protected(Dashboard(), { roles: ["admin"], fallback: "/login" }),
  "/login": Login()
})

// UI-level permission gate:
Can("billing:write", { fallback: ReadOnlyNotice() }, [EditButton()])
```

Wire `$auth` into the HTTP interceptor chain for automatic token attach + refresh-retry.

**Priority:** 🔴 Critical for app (non-marketing) migrations.

---

## Tier 6 — Data layer round-outs

### 6.1 Declarative HTTP retries & backoff

**Migration challenge.** `$socket` reconnects, but `$http`/`$query`/`$mutation` have no
declarative `retries`/backoff. Migrated apps relying on React-Query's `retry` lose
resilience.

**Proposal.** `$query({ retry: 3, retryDelay: "exponential" })` and the same on
`$http`/`$mutation`.

**Priority:** 🟠 High.

### 6.2 Normalized entity cache / shared list mutations

**Migration challenge.** Apps migrating off Apollo/RTK Query rely on a normalized cache
where updating one entity updates it everywhere. Aktion caches by query key only, so a
mutation must manually invalidate every list that contains the entity.

**Proposal.** An optional normalized store: `$entities("users", { key: "id" })` with
`upsert`/`remove` that auto-updates every query/list reading those entities, plus
helpers for optimistic list insert/remove/reorder.

**Priority:** 🟡 Medium.

### 6.3 File upload primitive — `$upload(...)` with progress

**Migration challenge.** `FileUpload` is presentational; there's no managed multipart
upload with progress, cancellation, retries, or chunked/resumable support — table
stakes for any app with avatars, attachments, or media.

**Proposal.**

```js
up = $upload({ url: "/files", field: "file", multiple: true })
// → { progress, items: [{ name, progress, status, url, cancel() }], start(files), cancelAll() }
FileUpload("avatar", { onChange: files => up.start(files) })
ProgressRing({ value: up.progress })
```

**Priority:** 🟠 High.

### 6.4 Query persistence / offline cache

**Migration challenge.** PWAs and offline-first apps persist the query cache to survive
reloads/offline. Aktion has `$storage`/`$store` persist but not query-cache persistence.

**Proposal.** `$query({ persist: "key", offline: true })` — hydrate cache from storage,
serve stale while offline, revalidate on reconnect.

**Priority:** 🟡 Medium.

---

## Tier 7 — Component library gaps

> The library (271 components) is unusually complete. These are the concrete components
> a migrating developer will look for and **not find**, grouped by app type.

### 7.1 Analytics / BI dashboards — advanced charts
**Missing:** `AreaChart` (first-class, not `LineChart` filled), `FunnelChart`,
`TreemapChart`, `SankeyChart`, `CandlestickChart`/OHLC, `WaterfallChart`, `BoxPlot`,
`BubbleChart`, `ChartLegend` (toggleable, standalone), and **chart interactivity**
(hover tooltips, zoom/pan, brush-to-select, click-through). Analytics/finance migrations
stall without these.
**Priority:** 🟠 High.

### 7.2 Diagramming & node graphs
**Missing:** a `NodeGraph`/`Flow` (react-flow-style node+edge canvas), `OrgChart`,
`MindMap`, `NetworkDiagram`. Needed for workflow builders, data-lineage, BPM, and
infra tools.
**Priority:** 🟡 Medium.

### 7.3 Data-heavy apps — editable & advanced grids
**Missing:** an **editable spreadsheet-style grid** (inline cell editing, copy/paste,
keyboard navigation), `PivotTable`, `TreeGrid`/tree-table (Tree and Table exist only
separately), column resize/reorder/pin, row grouping, and **virtualized `DataGrid`**
(today a large grid renders all rows). This is the single biggest gap for admin/back-office
migrations.
**Priority:** 🔴 Critical for admin/data apps.

### 7.4 Power inputs / selection widgets
**Missing:** dual-handle **`RangeSlider`** (price filters), **`TransferList`**/dual-listbox,
**`Cascader`** (multi-level select), `TreeSelect`, async-`Autocomplete` beyond `Combobox`,
**`PhoneInput`** (country + format), **`CurrencyInput`**, and a desktop **`Menubar`**
(File/Edit/View).
**Priority:** 🟠 High.

### 7.5 Media tooling
**Missing:** `ImageCropper`, `AudioRecorder`, `VideoRecorder`/camera capture, `PdfViewer`,
and an image **annotation/markup** overlay. Common in onboarding, KYC, support, and
content apps.
**Priority:** 🟡 Medium.

### 7.6 Misc expected primitives
**Missing:** `Watermark`, standalone `Stepper` distinct from `Steps`/`MultiStepForm`,
`Affix` (beyond `Sticky`), `Anchor`/in-page nav (beyond `TableOfContents`), `Statistic`
with countdown, `Result`/full-page status pages, and a `Splitter` for arbitrary panes
(beyond `ResizablePanels`).
**Priority:** 🟢 Low–Medium.

---

## Tier 8 — Forms & inputs

### 8.1 Schema-driven forms — Zod/Yup/JSON-Schema adapter

**Migration challenge.** Many apps define validation as a Zod/Yup schema and derive the
form from it. `$form` + `$util.rules` is capable but rule-by-rule; there's no schema
ingestion, so migrating a schema-first form means hand-translating every rule.

**Proposal.** `$form({ schema })` accepting a JSON-Schema (and an adapter for Zod/Yup
shapes) to auto-derive field rules and types.

**Priority:** 🟠 High.

### 8.2 Field arrays / dynamic forms with validation

**Migration challenge.** `FieldRepeater` exists, but there's no first-class
`$form`-integrated field-array with per-row validation, add/remove/reorder, and nested
groups — required for invoices, builders, and settings.

**Proposal.** `form.fieldArray("lineItems")` → `{ items, add(), remove(i), move(a,b) }`
with validation wired into `form.valid`.

**Priority:** 🟡 Medium.

### 8.3 Autosave / dirty-navigation guard

**Migration challenge.** Apps commonly autosave drafts and warn on navigating away from
a dirty form. `form.dirty` exists; the autosave + `beforeunload`/route-guard wiring is
manual.

**Proposal.** `$form({ autosave: { to: url, debounce: 800 }, guardUnsaved: true })`.

**Priority:** 🟡 Medium.

---

## Tier 9 — Animation & motion

### 9.1 Shared-element / layout transitions across routes

**Migration challenge.** `FlipList` handles list reorder and `RouteView` swaps the
outlet, but there's no shared-element transition (a thumbnail morphing into a detail
hero) — a signature of modern polished apps.

**Proposal.** `sharedElement: "id"` prop honoured across renders/routes, driving a FLIP
transition between matching ids.

**Priority:** 🟢 Low–Medium.

### 9.2 Spring physics & gesture-driven motion values

**Migration challenge.** Migrations from Framer Motion / react-spring rely on spring
configs and gesture-bound motion values. Aktion has presets + `OnGesture` but no
spring/value model.

**Proposal.** `$motion(initial, { type: "spring", stiffness, damping })` → a reactive
value bindable to `sx` transforms and drivable from `OnGesture`.

**Priority:** 🟢 Low.

---

## Tier 10 — i18n / l10n depth

### 10.1 Lazy / namespaced translation loading

**Migration challenge.** `$i18n` takes an inline `translations` map. Real apps load
locale bundles lazily by namespace/route (i18next-style). Migrating a large translation
set inline is impractical.

**Proposal.** `$i18n({ load: (lang, ns) => $http({ url: `/i18n/${lang}/${ns}.json` }) })`
with lazy + cached namespace loading.

**Priority:** 🟡 Medium.

### 10.2 Locale-aware number/date/currency formatting bound to current language

**Migration challenge.** `$util.format`/`formatDate` exist, but formatting isn't tied to
the active `$i18n` locale (Intl with the right locale, currency per region, relative
time per language). Migrations from `react-intl`/`vue-i18n` expect locale-coupled
formatting.

**Proposal.** Make `$util.format`/`formatDate`/`currency`/`relativeTime` read the active
i18n locale by default, with explicit override; expose `t.number()`, `t.date()`,
`t.currency()` on the i18n handle.

**Priority:** 🟡 Medium.

### 10.3 Pluralization beyond English & gender/select

**Migration challenge.** Ensure full ICU plural categories (zero/one/two/few/many/other)
per CLDR and `select` for gender — anything less breaks non-English migrations.

**Proposal.** Back `$util.plural` and `$i18n` interpolation with proper CLDR plural rules
via `Intl.PluralRules`.

**Priority:** 🟡 Medium.

---

## Tier 11 — Accessibility automation

### 11.1 Route-change focus & announcement management

**Migration challenge.** SPAs must move focus and announce route changes for screen
readers; migrated apps often had this via a router integration. Aktion has `LiveRegion`/
`FocusTrap` primitives but no automatic route-change focus/announce.

**Proposal.** Built-in: on navigation, move focus to the main landmark / route heading
and announce the new title via a managed live region (opt-out via attribute).

**Priority:** 🟡 Medium.

### 11.2 `axe`-in-dev + a11y lint in the language service

**Migration challenge.** `axe(node)` exists in the test entry but isn't surfaced during
authoring. Migrated UI regressions in a11y go unnoticed.

**Proposal.** A dev-mode overlay and language-service diagnostics for missing
alt/label/name, contrast, and tab-order issues.

**Priority:** 🟢 Low–Medium.

---

## Tier 12 — PWA, offline & native

### 12.1 First-class PWA scaffolding & install prompt

**Migration challenge.** `$util.registerServiceWorker`/`webManifest` exist as helpers,
but there's no cohesive PWA story (precaching strategy, update-available prompt,
`beforeinstallprompt`, offline fallback page) that a migrating PWA expects.

**Proposal.** `$pwa({ manifest, strategy: "stale-while-revalidate", offlineFallback })`
→ `{ updateAvailable, applyUpdate(), canInstall, promptInstall() }`.

**Priority:** 🟢 Low–Medium.

### 12.2 Push notifications & background sync hooks

**Migration challenge.** No web-push subscription or background-sync surface for apps
migrating notification features.

**Proposal.** `$push({ vapidKey })` → subscribe/unsubscribe + a host event for received
messages; document the SW glue.

**Priority:** 🟢 Low.

---

## Tier 13 — Observability & error handling

### 13.1 Reset-able, granular error boundaries with async capture

**Migration challenge.** `ErrorBoundary` exists but (per the repo's own notes) doesn't
catch async errors and has no reset. Migrated apps rely on `react-error-boundary`-style
reset + fallback render props.

**Proposal.** Extend `ErrorBoundary` with `onError`, `resetKeys`, a `reset()` passed to
the fallback, and async-error capture (effects/HTTP failures route to the nearest
boundary).

**Priority:** 🟠 High.

### 13.2 Telemetry / error-reporting hooks (Sentry-style)

**Migration challenge.** No standard hook to forward errors/perf to Sentry/Datadog.
`$util.onError` is a start but isn't a structured reporting surface.

**Proposal.** A host hook `Aktion.configure({ onError, onMetric })` receiving structured
events (parse/runtime errors, slow renders, budget trips, failed requests) for forwarding.

**Priority:** 🟡 Medium.

---

## Tier 14 — Migration tooling & codemods

> This tier is what most directly delivers the "piece of cake" promise: automate the
> conversion and *report* what couldn't be converted.

### 14.1 Framework → Aktion converters (React/Vue/Svelte/Angular)

**Migration challenge.** Only `htmlToAktion` exists. The bulk of migrations start from
JSX/SFC/templates, not static HTML.

**Proposal.** Best-effort, LLM-assistable converters that map: JSX/template element trees
→ component calls, `useState`/`ref`/`data` → `$state`/atoms, `useEffect`/`watch` →
`$effect`, props → params, event handlers → actions, conditional/list rendering → ternaries/
`.map`, and class/style → `sx` (via the Tier-3 converters). Output an annotated program
with `// TODO(migration): ...` markers where a construct couldn't be translated.

**Priority:** 🟠 High.

### 14.2 Fidelity / coverage report

**Migration challenge.** After a conversion, developers need to know *what's missing* —
unmapped CSS, unsupported language constructs, components with no Aktion equivalent,
imperative widgets needing `Mount` (0.1).

**Proposal.** A `migrationReport(input)` that emits a structured list of gaps with
file/line, severity, and a suggested manual fix — so the remaining 20% is a checklist,
not a hunt.

**Priority:** 🟠 High.

### 14.3 `suggestComponent` → `suggestEquivalent`

**Migration challenge.** Developers think in their old library's names (MUI `Dialog`,
AntD `Drawer`, Chakra `Stack`, shadcn `Sheet`). `suggestComponent` does typo distance,
not cross-library mapping.

**Proposal.** A curated alias map (`"Dialog" → Modal`, `"Snackbar" → Toast`,
`"Skeleton" → Skeleton`, `"Chip" → Badge/FilterChips`, …) so converters and the LSP can
resolve foreign component names to Aktion equivalents.

**Priority:** 🟡 Medium.

---

## Priority matrix & suggested roadmap

### 🔴 Critical — start here (unblock whole app classes)
| # | Feature | Migration class unblocked |
|---|---------|---------------------------|
| 0.1 | `Mount` / `$script` / `WebComponent` interop | Any page with a third-party imperative widget |
| 0.2 | `$context` / `Provide` scoped DI | Any provider-based React/Vue/Angular app |
| 1.1 | Real `await` (or strict-mode no-op warning) | Any app with sequential async logic |
| 2.1 | Host ⇆ Aktion reactive props/state bridge | Incremental / strangler-fig migration |
| 4.1 | `$head` / `$meta` document-head manager | Marketing, content, docs, e-commerce SEO |
| 5.1 | `$auth` + `Protected`/`Can` | Any authenticated app |
| 7.3 | Editable + virtualized `DataGrid`, `PivotTable`, `TreeGrid` | Admin / back-office / data apps |

### 🟠 High — large fidelity & adoption gains
0.3 gradual types · 1.2 regex · 2.2 host registries · 3.1 keyframes · 3.2 pseudo-elements ·
3.5 deeper Tailwind/CSS converters · 4.2 responsive images · 6.1 retries · 6.3 `$upload` ·
7.1 advanced charts · 7.4 power inputs · 8.1 schema forms · 13.1 error boundaries ·
14.1 framework converters · 14.2 fidelity report

### 🟡 Medium — depth & polish
1.3 service pattern · 1.4 runtime lazy/code-split · 2.3 adapter packages · 3.3 container
queries · 3.4 `$styles` · 6.2 normalized cache · 6.4 query persistence · 7.2 diagramming ·
7.5 media tooling · 8.2 field arrays · 8.3 autosave guard · 10.1–10.3 i18n depth ·
11.1 route focus · 13.2 telemetry · 14.3 equivalent suggestions

### 🟢 Low — nice-to-have
7.6 misc primitives · 9.1 shared-element · 9.2 springs · 11.2 a11y lint ·
12.1 PWA scaffolding · 12.2 push

### Suggested sequencing
1. **Wave 1 (foundations):** 0.1, 0.2, 2.1, 1.1 — the structural primitives every later
   feature and converter depends on.
2. **Wave 2 (content & apps go live):** 4.1, 5.1, 7.3, 6.3, 13.1 — make real pages and
   real apps fully migratable.
3. **Wave 3 (fidelity & automation):** 3.1/3.2/3.5, 14.1/14.2, 0.3, 7.1/7.4, 8.1 — drive
   the automated-conversion percentage up and close styling/type gaps.
4. **Wave 4 (depth):** everything in Medium/Low as demand dictates.

---

### Design guardrails for the implementing LLM
- Keep every new builtin a `$name(...)` call and every new component a PascalCase
  function honouring the **one-positional-arg + trailing-object** rule.
- Add each new builtin/component to `src/language/builtins.ts` / the library index so
  completions, hover, semantic tokens, signature help, and the generated grammar +
  system prompt stay in sync (per the repo's `editor-tooling-sync` and
  `coding-gen-skill-sync` rules).
- Update `coding-gen-skill.md` (§8 builtins, §9 components, relevant §11 patterns) and
  `README.md` tables in the same change, and add `tests/tooling-*.test.ts` +
  runtime tests.
- Everything must degrade gracefully on partial/streamed input and remain valid
  JavaScript on the surface.
