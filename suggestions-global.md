# Aktion — Global migration gap analysis & proposals

> **Purpose.** [`suggestions.md`](./suggestions.md) captured the gaps found
> porting *one* marketing landing page into Aktion. **This document zooms
> out to the entire modern frontend landscape** — every major class of app a
> team might migrate to Aktion — and proposes the language features,
> runtime primitives, components, props, and tooling needed so that *any*
> of them ports cleanly.
>
> **Audience.** A code-generation LLM implementing changes in the Aktion
> codebase. Each item is written as an actionable proposal: **Gap → who
> hits it → proposed API → priority**.
>
> **Method.** I inventoried the current surface first (196 library
> components; `$state`/`$effect`/`$http`/`$query`/`$mutation`/`$store`/
> `$router`/`$theme`/`$i18n`/`$emit`/`$toast`/`$storage`/`$util`; a JS-subset
> language with map/filter/reduce, destructuring, spread, async/await,
> operators; escape hatches `HTMLTag`/`Styles`/`Css`). Proposals below are
> **only for genuine gaps** — I note where something already exists and only
> needs extension.

---

## How to read priorities

- **P0 — Structural blocker.** Whole categories of apps cannot be expressed
  without escape hatches or host glue. Fix first.
- **P1 — High-friction.** Doable today but verbose/fragile enough to stall a
  migration.
- **P2 — Polish / long-tail.** Specific verticals; raises the ceiling.

Each section also tags the **app archetypes** it unblocks:
`🛍️ e-commerce` `📊 dashboard/analytics` `📱 mobile/PWA` `💬 real-time/social`
`📝 content/docs` `🧩 SaaS/admin` `🎨 marketing` `🎬 media` `🗺️ maps/geo`
`🎮 interactive/canvas`.

---

## Table of contents

- [Part I — The styling & design-system layer](#part-i--the-styling--design-system-layer) (the #1 systemic gap)
- [Part II — Layout & positioning](#part-ii--layout--positioning)
- [Part III — Motion, animation & gestures](#part-iii--motion-animation--gestures)
- [Part IV — Routing & navigation for real SPAs](#part-iv--routing--navigation-for-real-spas)
- [Part V — Forms & validation](#part-v--forms--validation)
- [Part VI — Data fetching, server state & real-time](#part-vi--data-fetching-server-state--real-time)
- [Part VII — Client state, persistence & URL sync](#part-vii--client-state-persistence--url-sync)
- [Part VIII — Component library gaps](#part-viii--component-library-gaps)
- [Part IX — Media, images, SVG & assets](#part-ix--media-images-svg--assets)
- [Part X — Accessibility, i18n & RTL](#part-x--accessibility-i18n--rtl)
- [Part XI — Performance, SSR & rendering](#part-xi--performance-ssr--rendering)
- [Part XII — Mobile / PWA / native bridges](#part-xii--mobile--pwa--native-bridges)
- [Part XIII — Language & authoring ergonomics](#part-xiii--language--authoring-ergonomics)
- [Part XIV — Migration & developer tooling](#part-xiv--migration--developer-tooling)
- [Part XV — Priority matrix & design principles](#part-xv--priority-matrix--design-principles)

---

## Part I — The styling & design-system layer

> **This is the single biggest blocker for *every* archetype.** Aktion has
> semantic props (`tone`, `variant`) and a token-based `$theme(...)`, but no
> way to express bespoke spacing, color, layout, or state styling without
> dropping to raw `Styles`/`Css`/`HTMLTag`. Real apps have brand-specific
> visuals on nearly every screen. (Expanded from `suggestions.md` §1, now
> generalized.)

### I.1 — `sx` style-intent prop on every component (P0) — *all archetypes*

A **bounded, token-aware** styling object accepted by all components and
layout primitives. Not raw CSS — every value is an enum, a token reference,
or a sanitised scalar, so it stays theme-safe, XSS-safe, and **enumerable by
an LLM**.

```javascript
Box([...], {
  sx: {
    // box model — all resolve to spacing tokens or sanitised lengths
    p: "l", px: "xl", py: "m", m: "auto", gap: "s",
    w: "full", maxW: "640px", h: "100vh", minH: "60vh",
    // color & surface — tokens or named gradients
    bg: "surface", color: "text-muted", border: "subtle",
    radius: "lg", shadow: "md", opacity: 0.9,
    // flex/grid shorthands
    display: "flex", direction: "row", align: "center", justify: "between",
    grow: 1, wrap: true,
    // position & layering
    position: "sticky", top: 0, zIndex: "nav",
    // effects
    backdrop: "blur", overflow: "hidden", cursor: "pointer",
    // interaction states (see I.4)
    hover: { bg: "surface-muted", lift: 2 },
    focus: { ring: "primary" }
  }
})
```

**Impact:** eliminates the overwhelming majority of escape-hatch usage. This
is the keystone — most items in Part I/II build on it.

### I.2 — Expanded design-token system (P0) — *all archetypes*

`$theme(...)` currently exposes `colors` / `radius` / `font`. Real design
systems need the full token taxonomy so `sx` and components can reference
them:

```javascript
$theme({
  colors: { /* existing + arbitrary named scales */
    brand: { 50: "#eef", 500: "#6366f1", 900: "#312e81" } // numeric ramps
  },
  spacing: { xs: 4, s: 8, m: 12, l: 20, xl: 32, "2xl": 48, "3xl": 80 },
  shadows: { sm: "...", md: "...", lg: "...", glow: "..." },
  gradients: { brand: ["#6366f1", "#8b5cf6", "#ec4899"] },      // see I.3
  typography: { display: { size: "clamp(...)", weight: 900, tracking: "-0.03em" } },
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },
  motion: { fast: "120ms", base: "200ms", slow: "400ms", ease: "cubic-bezier(...)" },
  zIndex: { base: 0, dropdown: 1000, sticky: 1100, modal: 1300, toast: 1400 }
})
```

All groups optional and merge over the active theme. **Numeric color ramps**
(`brand.500`) match Tailwind/Radix mental models migrators already have.

### I.3 — First-class gradients (P0) — *🎨 marketing 🛍️ e-commerce 🧩 SaaS*

Gradients as tokens + a `GradientText` content component + `fill`/`bg`
acceptance everywhere. (Detailed in `suggestions.md` §1.2.) Generalized: any
prop that takes a color (`tone`, `bg`, `fill`, `accent`, chart series colors)
should accept `"gradient.brand"`.

### I.4 — Declarative interaction states (P0) — *all archetypes*

Hover/focus/active/disabled/`aria-*`/`data-*` styling is impossible today
without `Styles`. Expose them through `sx` (above) **and** as a `states`
prop so components can restyle on interaction without CSS:

```javascript
Card([...], { states: { hover: { lift: 2, shadow: "lg" }, active: { scale: 0.98 } } })
```

### I.5 — Responsive style props (P0) — *all archetypes*

Every `sx`/layout value accepts a breakpoint map (the pattern already exists
for `Grid.columns` — generalize it everywhere):

```javascript
Box([...], { sx: { p: { base: "m", md: "xl" }, direction: { base: "column", lg: "row" } } })
```

Plus a reactive `$breakpoint` global (`$breakpoint.md`, `$breakpoint.active`)
for logic-level branching (show/hide, different component per size).

### I.6 — `Styles` scoping & token interpolation (P1) — *📝 content 🎨 marketing*

When `Styles(...)` is genuinely needed (sweeping prose styling, third-party
widget theming), let it (a) auto-scope to a wrapper class to prevent leaks,
and (b) interpolate theme tokens: `Styles(".prose a { color: token(colors.primary) }")`.

### I.7 — Custom font loading (P1) — *🎨 marketing 📝 content*

No way to load a web font today. Add `$theme({ fonts: { import: ["Inter:400,700", "JetBrains Mono"] } })` (Google Fonts shorthand) or `FontFace({ family, src })`, injected into the shadow root / document head safely.

### I.8 — `Prose` / rich-text styling container (P1) — *📝 content/docs 🛍️ e-commerce*

`Markdown` renders content but unstyled bodies of long-form text (blog posts,
product descriptions, docs, CMS HTML) need typographic defaults. Add
`Prose(markdownOrNodes, { size, theme })` — a styled reading container
(headings, lists, blockquotes, code, tables, links) themed via tokens.

---

## Part II — Layout & positioning

> Aktion has `Column`/`Row`/`Grid`/`Stack`/`Box`/`Container` (strong) but
> lacks page-band, asymmetric, sticky-split, overlay-layer, and
> absolute-positioning primitives that real layouts need.

### II.1 — `Section` page-band primitive (P0) — *🎨 marketing 📝 content 🧩 SaaS*

Full-bleed band → centered container → optional tinted background → optional
eyebrow/title/subtitle header, in one call. (Spec in `suggestions.md` §2.1.)
Used by *every* marketing, docs, and settings page.

### II.2 — `Split` (sticky two-pane) & `Bento` (asymmetric grid) (P1) — *🎨 marketing 📊 dashboard 📝 docs*

Spec in `suggestions.md` §2.2–2.3. Broadly: docs sidebars, settings nav,
editor + preview, feature bento all need these.

### II.3 — Absolute/relative positioning & overlay layering (P0) — *🎮 interactive 🛍️ e-commerce 🎬 media*

No way to position a badge on a corner, a play button over a thumbnail, a
"sale" ribbon, a floating action button, or stacked canvas layers without
`HTMLTag` + CSS. Add:

```javascript
Overlay(baseNode, [
  OverlayItem(Badge("Sale", { tone: "danger" }), { anchor: "top-right", offset: "s" }),
  OverlayItem(PlayButton(), { anchor: "center" })
])
// and a positioning escape inside sx: position: "absolute", inset/top/left/right/bottom
```

### II.4 — `Sticky` / scroll-affordance upgrades (P1) — *📊 dashboard 📝 docs*

`Sticky` exists; add `offset`, `until` (stick within a container), and a
reactive `stuck` state so headers can restyle when pinned (the classic
"shadow on scroll" header). Pairs with `$scroll` (Part VII).

### II.5 — Safe-area & viewport units (P1) — *📱 mobile/PWA*

Expose `env(safe-area-inset-*)` via tokens (`sx: { pb: "safe-bottom" }`) and
dynamic viewport units (`svh`/`lvh`/`dvh`) so mobile layouts don't sit under
notches/home indicators.

### II.6 — Masonry / auto-flow gallery (P1) — *🎬 media 🛍️ e-commerce 💬 social*

`MasonryGrid` exists — verify it supports responsive column maps and
variable-height items (Pinterest/photo-grid/feed layouts).

---

## Part III — Motion, animation & gestures

> **Near-total gap.** No entrance/exit, layout, scroll-linked, or
> gesture-driven animation exists. Modern apps live and die on this.

### III.1 — `animate` preset prop on all components (P0) — *all archetypes*

Bounded enum entrance/loop animations, auto-respecting
`prefers-reduced-motion`:

```javascript
Card([...], { animate: "fade-up" })
Badge("Live", { animate: "pulse" })
List(items.map((x, i) => Row(x, { animate: { preset: "fade-up", delay: i * 60 } })))
```

Presets: `fade | fade-up/down/left/right | zoom | slide-* | pulse | float |
shimmer | bounce | spin`.

### III.2 — `Reveal` (scroll-triggered) (P1) — *🎨 marketing 📝 content*

`OnIntersect` exists (good). Add a `Reveal(child, { animation, once, stagger })`
composite + auto-defer of `animate` until in-view, so scroll choreography is
declarative.

### III.3 — Enter/exit (mount/unmount) transitions (P0) — *all archetypes*

When a node is added/removed by a `Show`/ternary/`.map()`, it should be able
to animate in and out. The reconciler needs an exit-animation hook:

```javascript
Show($open, { children: Modal(...), transition: "scale-fade" })  // animates close before unmount
```

This is table-stakes for modals, toasts, dropdowns, list add/remove, route
changes.

### III.4 — Layout / shared-element transitions (P1) — *🛍️ e-commerce 🎬 media 🎮 interactive*

FLIP-style animation when items reorder/resize (sortable lists, filtering
grids, tab indicators) and shared-element transitions (thumbnail → detail).
Propose `animateLayout: true` on `Grid`/`List`/`Stack` and a `sharedId` prop
for cross-view morphs.

### III.5 — Gesture wrappers (P0 for mobile) — *📱 mobile 🎮 interactive 🎬 media*

`OnMouse` covers pointer/drag listeners but there's no high-level gesture
vocabulary. Add:

```javascript
OnGesture(child, {
  swipe: (dir) => ...,         // left/right/up/down
  pinch: (scale) => ...,
  longPress: () => ...,
  pan: ({ dx, dy }) => ...,
  doubleTap: () => ...
})
```

Powers swipe-to-dismiss, pull-to-refresh, carousels, image pan/zoom,
drag-to-reorder.

### III.6 — Drag-and-drop & sortable (P1) — *🧩 SaaS 📊 dashboard 🛍️ e-commerce*

`KanbanBoard` exists but generic DnD doesn't. Add `Sortable(items, { onReorder })`
and a `DropZone`/`Draggable` pair for file/card/list reordering, dashboard
widget arrangement, form builders.

### III.7 — Scroll-linked & parallax (P2) — *🎨 marketing 🎬 media*

A `$scroll.progress` reactive (Part VII) + a `Parallax(child, { speed })`
wrapper for hero parallax, progress bars, scroll-tied reveals.

### III.8 — Lottie / SVG animation player (P2) — *🎨 marketing 🎮 interactive*

`LottiePlayer(src, { loop, autoplay })` for the animated illustrations common
on marketing/onboarding screens.

---

## Part IV — Routing & navigation for real SPAs

> `$router({...})` + `NavLink` + hash/history modes exist (good foundation),
> but multi-page apps need nesting, guards, lazy loading, transitions, and
> scroll restoration that aren't there.

### IV.1 — Nested routes & layout routes (P0) — *🧩 SaaS 📊 dashboard 📝 docs*

Real apps have shared shells (sidebar + header) wrapping child routes. Today
`$router` is flat. Add nested definitions with an `<Outlet>`-style slot:

```javascript
pages = $router({
  "/app": Layout({ outlet: route.child }, {
    "/": Dashboard(),
    "/settings": SettingsLayout({ outlet: route.child }, {
      "/profile": Profile(),
      "/billing": Billing()
    })
  })
})
```

### IV.2 — Route guards / auth redirects (P0) — *🧩 SaaS 🛍️ e-commerce*

Declarative protection so unauthenticated users can't hit private routes:

```javascript
$router({
  "/admin": { guard: () => $user.isAdmin, redirect: "/login", element: Admin() }
})
```

### IV.3 — Lazy route loading / code splitting (P1) — *🧩 SaaS 📊 dashboard*

`Lazy` exists for components; routes should support `lazy: () => import("./Reports.aktion")`
so large apps don't ship everything up front. Ties into the module linker
that already exists.

### IV.4 — Route transitions (P1) — *all SPA archetypes*

Animate between routes (`$router({ ..., transition: "fade" })`) — depends on
III.3 enter/exit.

### IV.5 — Scroll restoration & hash anchors (P1) — *📝 docs 🛍️ e-commerce*

Restore scroll position on back/forward; smooth-scroll to `#anchor`; reset to
top on forward nav. Currently manual. Add `$router({ scrollBehavior: "restore" })`.

### IV.6 — Query-param ↔ state binding (P1) — *🛍️ e-commerce 📊 dashboard*

Two-way bind filters/pagination/tabs to the URL so they're shareable and
survive reload:

```javascript
$filters = $router.query({ sort: "price", page: 1 })   // reads + writes ?sort=&page=
```

### IV.7 — Prefetch on hover/visible (P2) — *🛍️ e-commerce 📝 content*

`NavLink(..., { prefetch: "hover" })` to warm lazy routes/data.

---

## Part V — Forms & validation

> Aktion has every input component, two-way `$state` binding, `Form`,
> `FormSection`, `FieldSet`, `ValidationSummary`, `MultiStepForm`,
> `FieldRepeater`. **What's missing is the validation/▸form-state engine** —
> the part that makes forms-heavy apps (the majority of CRUD/SaaS) tractable.

### V.1 — `$form` schema & validation primitive (P0) — *🧩 SaaS 🛍️ e-commerce*

A reactive form controller with schema validation, per-field errors, and
dirty/touched tracking — the thing React devs get from React Hook Form /
Formik / Zod:

```javascript
form = $form({
  initial: { email: "", age: 0 },
  schema: {
    email: [rules.required(), rules.email()],
    age:   [rules.min(18, "Must be 18+")]
  },
  onSubmit: (values) => $save.mutate(values)
})
// usage
Input("email", { value: form.email, error: form.errors.email, onBlur: form.touch("email") })
Button("Submit", { onClick: form.submit, disabled: !form.valid || form.submitting })
```

Exposes `.values .errors .touched .dirty .valid .submitting .submit() .reset()
.setField() .validate()`. Async validators (uniqueness checks) supported.

### V.2 — Built-in `rules` / validators namespace (P0) — *🧩 SaaS*

`rules.required | email | url | min | max | minLength | pattern | matches |
oneOf | custom(fn) | asyncCustom(fn)`. Composable, i18n-aware messages.

### V.3 — Conditional & cross-field fields (P1) — *🧩 SaaS*

First-class conditional rendering tied to form state (already doable via
ternary, but a `When(form.country == "US", ...)` helper + cross-field rules
(`rules.sameAs("password")`) reduce boilerplate.

### V.4 — Field-level `error`/`hint`/`required` props everywhere (P1)

Audit every input to consistently accept `error`, `hint`, `required`, `label`
(some have `label`, some don't — I had to add manual field labels in the
landing-page port). Standardize the field wrapper.

### V.5 — File upload UX (P1) — *🧩 SaaS 🎬 media*

`FileUpload` exists; ensure drag-drop dropzone, progress, preview thumbnails,
multi-file, and an `onUpload` that integrates with `$mutation` for direct-to-S3
style uploads.

---

## Part VI — Data fetching, server state & real-time

> `$http`/`$query`/`$mutation`/`Async` are a strong base (cache, dedup, TTL,
> deferred writes). Gaps are pagination, optimistic updates, invalidation,
> and **real-time transport**, which whole product categories require.

### VI.1 — Pagination & infinite query (P0) — *💬 social 🛍️ e-commerce 📊 dashboard*

`InfiniteList`/`VirtualList` render, but there's no paginated fetch model:

```javascript
$feed = $infiniteQuery({
  url: "/api/posts",
  pageParam: (last) => last.nextCursor,
  getPages: (r) => r.items
})
// $feed.pages, $feed.fetchNext(), $feed.hasNext, $feed.isFetchingNext
```

### VI.2 — Optimistic updates & cache invalidation (P0) — *💬 social 🛍️ e-commerce 🧩 SaaS*

The single hardest data pattern to hand-roll. Add to `$mutation`:

```javascript
$like = $mutation({
  url: "/api/like",
  optimistic: (vars) => { $post.likes += 1 },     // applied immediately
  rollbackOnError: true,
  invalidates: ["posts", "feed"]                   // refetch these $query keys
})
```

Plus a `$queryClient.invalidate(key)` / `.setData(key, updater)` for manual
cache control.

### VI.3 — WebSocket / realtime subscription primitive (P0) — *💬 real-time/social 📊 live dashboards 🎮 interactive*

No realtime transport exists. This blocks chat, collaboration, live feeds,
trading/analytics, multiplayer, presence:

```javascript
$chat = $socket({
  url: "wss://api/chat",
  onMessage: (msg) => { $messages = [...$messages, msg] },
  reconnect: true
})
$chat.send({ text: $draft })
// reactive: $chat.status ("connecting"|"open"|"closed"), $chat.lastMessage
```

Also `$sse({...})` for Server-Sent Events (notifications, live logs).

### VI.4 — Polling & background refetch (P1) — *📊 dashboard 💬 social*

`$query({ refetchInterval: 5000, refetchOnFocus: true, refetchOnReconnect: true })`
— live dashboards without manual timers.

### VI.5 — Request/response interceptors at program level (P1) — *🧩 SaaS*

Host has `registerHttpInterceptors`; expose an in-program
`$http.intercept({ onRequest, onResponse, onError })` for auth headers,
401-refresh, global error toasts — so auth flows don't need host glue.

### VI.6 — GraphQL helper (P2) — *🧩 SaaS*

A thin `$graphql({ query, variables })` over `$http` for teams migrating
Apollo/urql apps.

---

## Part VII — Client state, persistence & URL sync

> `$state`, `$store`, `$storage` exist. Gaps are derived state, selectors,
> persistence middleware, undo/redo, and reactive browser/environment
> globals.

### VII.1 — `$derived` / computed values (P1) — *all archetypes*

A memoized computed atom (today people recompute inline). Confirm/parallel to
`$memo`:

```javascript
$total = $derived(() => $util.sum($cart.map(i => i.price * i.qty)))
```

### VII.2 — Store selectors & persistence middleware (P1) — *🧩 SaaS 🛍️ e-commerce*

`$store` upgrades: `select(s => s.cart.count)` (subscribe to a slice),
`persist: "localStorage"` (auto-save/hydrate), and `subscribe(fn)`.

### VII.3 — Undo/redo / time-travel (P2) — *🎮 editors 🧩 SaaS*

`$history($doc)` exposing `.undo() .redo() .canUndo` for editors, form
builders, design tools.

### VII.4 — Reactive environment globals (P1) — *all archetypes*

Read-only reactive handles the UI can branch on without manual listeners:

- `$scroll` — `.y`, `.progress`, `.direction`
- `$viewport` — `.width`, `.height`, `$breakpoint.md`
- `$media` — `.prefersDark`, `.prefersReducedMotion`, `.online`, `.pointer`
- `$mouse` — `.x`, `.y` (for spotlight/tilt effects)
- `$theme.mode` — readable & **writable** (built-in `ThemeToggle()`; removes
  host glue — confirmed pain in the landing port)

### VII.5 — URL/hash state & history helpers (P1)

Covered in IV.6; also a `$url` reactive for reading path/query/hash anywhere.

---

## Part VIII — Component library gaps

> 196 components is excellent coverage. Below are the **genuinely missing**
> ones grouped by archetype, plus existing components that need extension.
> (I verified each against the registry list.)

### VIII.1 — Marketing / landing (P0–P1) — *🎨*

Missing composites that forced escape hatches in the port: **`NavBar`**
(marketing nav, distinct from app-shell `Navbar`/`TopBar`), **`Footer`**,
**`LogoCloud`**, **`MetricStrip`/`CountUp`**, **`CodeWindow`/`BrowserFrame`/
`Terminal`** chrome, **`Backdrop`/`Particles`/`Blobs`/`GridPattern`**,
**`Display`/`Heading`** typography, **`GradientText`**, **`ThemeToggle`**,
**`Swatch`/`ThemePreview`**. (All specced in `suggestions.md` §3–6.)

### VIII.2 — E-commerce (P1) — *🛍️*

- `ProductCard` (image, price, rating, wishlist, quick-add)
- `PriceTag` (currency, compare-at, discount %)
- `QuantityStepper`
- `VariantSelector` (color swatches / size pills)
- `Cart` / `CartLineItem` / `OrderSummary`
- `ImageZoom` (hover-magnify) & `ImageGallery` with thumbnails (Lightbox/Gallery exist — verify zoom)
- `Checkout` stepper (build on `MultiStepForm`)
- `StarRatingInput` (Rating exists — confirm interactive input mode)

### VIII.3 — Content / docs / blog (P1) — *📝*

- `Prose` (Part I.8), `TableOfContents` (auto from headings),
  `ReadingProgress` bar, `Callout`/`Admonition` (Callout exists),
  `CodeBlock` with **real syntax highlighting** (currently monochrome — see
  `suggestions.md` §6.2), `Tabs` for code (exists), `Footnote`,
  `Bibliography`, `ShareButtons`, `AuthorByline`, `RelatedPosts`.

### VIII.4 — Real-time / social (P1) — *💬*

- `ChatThread` / `MessageBubble` (ChatBubble exists — verify threading,
  reactions, typing indicator), `PresenceAvatars` (live online dots),
  `TypingIndicator`, `Mention`/`MentionInput` (exists), `ReactionPicker`,
  `LiveCursor` (collab), `FeedItem`, `NotificationCenter` (NotificationBell
  exists).

### VIII.5 — Data / analytics (P1) — *📊*

- `DataGrid` exists — extend with **column resize/reorder/pin/group,
  CSV/Excel export, row virtualization, sticky columns, cell editing,
  master-detail expand**. These are why teams pick AG-Grid; without them,
  analytics apps stall.
- Charts: add **`FunnelChart`, `SankeyChart`, `TreemapChart`,
  `CandlestickChart`, `WaterfallChart`, `BoxPlot`** (Bar/Line/Pie/Radar/
  Scatter/Histogram/Heatmap/Gauge/Sparkline exist).
- `PivotTable`, `MetricCard`/`KPI` (StatCard exists), `DateRangeFilter`
  (DateRangePicker exists), `Crosstab`.

### VIII.6 — Scheduling / calendar (P1) — *🧩 SaaS*

`CalendarView` exists — verify it supports **event scheduling, week/day
views, drag-to-create, resource lanes** (a `Scheduler`/`EventCalendar`).
`Gantt` exists. Add `Availability`/`TimeSlotPicker` (booking apps).

### VIII.7 — Interactive / editor / canvas (P2) — *🎮*

- `Canvas`/`DrawingBoard` (free-draw, annotate), `SignaturePad`,
  `ImageCropper`, `ColorPicker` (exists), `NodeEditor`/`FlowGraph`
  (node-based editors), `SpreadsheetGrid` (editable cells/formulas),
  `MapEditor`.

### VIII.8 — Utility components (P1) — *all*

- `QRCode`, `Barcode`, `CopyButton` (copy-to-clipboard — needed in the port),
  `Clipboard`, `Confetti`, `CountdownTimer`, `RelativeTime` (auto "3m ago"),
  `Currency`/`NumberFormat`/`DateFormat` (Intl-backed display components),
  `Stat`/`Trend`, `Stepper` (Steps exists), `SegmentedControl`
  (ToggleGroup exists — verify), `FloatingActionButton`, `SpeedDial`,
  `BackToTop`, `ScrollSpy`.

### VIII.9 — Overlay/feedback gaps (P1) — *all*

`Modal`/`Drawer`/`Popover`/`Tooltip`/`Toast` exist. Add **`Sheet`/
`BottomSheet`** (mobile), **`ConfirmDialog`/`$confirm()`** imperative promise
(`if (await $confirm("Delete?")) ...`), **`ContextMenu`** (exists),
**`Banner`/cookie consent**, **`ProgressToast`** (upload progress).

---

## Part IX — Media, images, SVG & assets

### IX.1 — `Image` upgrades (P0) — *all archetypes*

`Image` exists; real apps need **lazy loading, `srcset`/responsive sizes,
blur-up/LQIP placeholder, aspect-ratio reservation (no layout shift),
object-fit, and error fallback**. These prevent CLS and are expected of any
modern image. Propose:

```javascript
Image("/photo.jpg", { sizes: "responsive", placeholder: "blur", ratio: "16/9",
                      fit: "cover", fallback: "/avatar.png", loading: "lazy" })
```

### IX.2 — Inline SVG & icon sprites (P1) — *🎨 marketing 🎮 interactive*

I had to use `HTMLTag("svg", ...)` for custom graphics. Add a safe
`Svg(markupOrPaths, { viewBox })` and `InlineSvg(src)` (fetch + sanitise) so
brand illustrations, custom icons, and data-viz overlays don't need raw
`HTMLTag`. Icons today are Font Awesome only — allow **custom icon sets** via
`$theme({ icons: {...} })` or an `IconSet` registration.

### IX.3 — Background images & patterns (P1) — *🎨 marketing*

`sx: { bgImage: "/hero.jpg", bgSize: "cover", bgOverlay: "gradient.dark" }` —
hero backgrounds, card covers, pattern fills. Today impossible without CSS.

### IX.4 — Avatar/image generation & optimization (P2)

`Avatar` has DiceBear fallback (nice). Add `gravatar`, initials styling, and
an optional image CDN transform hook (`Image(..., { transform: "w=400" })`).

---

## Part X — Accessibility, i18n & RTL

### X.1 — RTL & bidirectional layout (P0 for global apps) — *all archetypes*

`$theme` accepts a `direction` key but layout primitives must honor logical
properties (start/end vs left/right) so Arabic/Hebrew apps mirror correctly.
Audit `Row`/`sx` spacing to use logical insets. Add `$i18n.dir` reactive.

### X.2 — i18n upgrades (P1) — *all archetypes*

`$i18n` does keys + `{name}` interpolation. Add **ICU pluralization/select**
(`{count, plural, one {# item} other {# items}}`), **lazy locale loading**,
**number/date/currency formatting bound to locale** (Intl-backed
`$i18n.formatNumber/Date/Currency`), and **namespace splitting** for big apps.

### X.3 — Accessibility primitives (P0) — *all archetypes*

- **Focus management**: `$focus.trap(ref)`, `$focus.restore()`,
  auto-focus-trap in `Modal`/`Drawer` (verify), focus-visible rings via `sx`.
- **Live regions**: `LiveRegion(message, { politeness })` /
  `$a11y.announce(msg)` for async status (toasts already, but forms/loaders
  need it).
- **Skip links**, **landmark roles** on layout primitives, **`aria-*`
  passthrough** on all components.
- **Keyboard nav** helpers for lists/menus/grids (roving tabindex).

### X.4 — Reduced-motion & contrast (P1)

All `animate` presets auto-honor `prefers-reduced-motion` (had to hand-write
the media query). Expose `$media.prefersReducedMotion` and a high-contrast
theme variant.

---

## Part XI — Performance, SSR & rendering

### XI.1 — SSR / SSG / hydration story (P1) — *📝 content 🛍️ e-commerce (SEO)*

Host has `serializeState()`/`hydrateState()`. Document and smooth the
**server-render → hydrate** path so content/commerce sites get SEO + fast
first paint. A `renderToString(source, { theme })` server export + streaming
SSR would let Aktion compete for marketing/content sites where SEO is
non-negotiable.

### XI.2 — Code splitting & route-level lazy (P1)

`Lazy` + linker exist; wire route-level lazy (IV.3) and document chunking so
large SaaS apps stay fast.

### XI.3 — List virtualization everywhere (P1) — *📊 💬*

`VirtualList`/`InfiniteList` exist; add **variable-height virtualization,
horizontal virtualization, and a virtualized `Table`/`DataGrid` mode** for
10k+ row datasets.

### XI.4 — Memoization & render control (P1)

`$memo`/`$derived` for expensive computed UI; a `Memo(child, { deps })`
wrapper to skip re-render of stable subtrees in hot paths (long lists,
dashboards).

### XI.5 — Web Worker offload (P2) — *🎮 📊*

`$worker(fn)` to run heavy compute (parsing, image processing, large sorts)
off the main thread — keeps interactive/data apps responsive.

---

## Part XII — Mobile / PWA / native bridges

> Aktion runs anywhere HTML runs, so mobile-web/PWA is a key target, yet
> there's no mobile-platform vocabulary.

### XII.1 — Mobile interaction components (P1) — *📱*

`BottomSheet`, `PullToRefresh`, `SwipeableListItem` (swipe actions),
`TabBar` (bottom nav), `SegmentedControl`, `ActionSheet`, `Stepper`,
`FloatingActionButton`. Build on the gesture layer (III.5).

### XII.2 — PWA & offline (P1) — *📱*

- `$pwa.installPrompt()` / `$pwa.canInstall`
- Service-worker registration helper + offline cache strategy config
- `$storage` already covers local persistence; add IndexedDB-backed
  `$storage.db` for large/offline datasets
- `$media.online` reactive (offline banners)

### XII.3 — Device & sensor APIs (P2) — *📱 🎬 🗺️*

Safe wrappers: `$device.share(data)` (Web Share), `$device.geolocation`,
`$device.camera`/`$device.media` (getUserMedia), `$device.vibrate()`
(haptics), `$device.clipboard`, `$device.notify()` (push/local
notifications), `$device.battery`, `$device.orientation`. Today these need
raw `navigator`/`window` in action bodies (works, but unsanitised and
verbose).

### XII.4 — Native shell bridges (P2)

Documented patterns/events for wrapping in Capacitor/Tauri/WebView
(deep-link handling, back-button, status-bar theming).

---

## Part XIII — Language & authoring ergonomics

> The language handled composition well, but a few additions would cut noise
> across all app types.

### XIII.1 — Named slots in user components (P1)

First-class slots so composites mirror built-ins (`Hero.media`,
`CodeWindow.preview`):

```javascript
function Layout(_, { header, sidebar, children, footer }) { ... }
Layout({ header: TopBar(), sidebar: Nav(), footer: Footer() }, [Page()])
```

### XIII.2 — `clsx`/`cx` and `styleObject` helpers (P1)

`$style.cx({ "is-active": $active, "is-loading": $loading })` and
`$style({...}) → safe style string` (kills the `"a:" + x + ";"` concatenation
I had to do for particle positions).

### XIII.3 — `Fragment` & array flattening (P2)

Implicit flattening of nested arrays in children, and a `Fragment(...)` for
keyed lists without a wrapper element.

### XIII.4 — Component-local/private helpers (P2)

A way to scope helper factories so they don't pollute the program's flat
reactive namespace (large pages defined dozens of top-level helpers).

### XIII.5 — Keyed lists & stable identity (P1) — *💬 📊*

A `key` convention on `.map()` output (or `List(items, { key: i => i.id })`)
so the reconciler preserves identity/animation across reorders and
insertions — critical for animated/virtualized lists and form arrays.

### XIII.6 — Typed/structured data helpers (P2)

`$util` is rich. Add `$util.currency`, `$util.percent`, `$util.bytes`,
`$util.relativeTime`, `$util.slugify`, `$util.debounceFn`/`throttleFn`,
`$util.copy(text)` — the formatting/utility funcs every app reaches for.

### XIII.7 — Error boundaries & dev diagnostics (P1)

`ErrorBoundary` exists. Add per-component error isolation defaults and a
`$onError` program hook (report to Sentry-style sinks) so a bad data row
can't blank the page.

---

## Part XIV — Migration & developer tooling

> The biggest accelerator for "migrate *anything*" is tooling that converts
> existing code, not just runtime features.

### XIV.1 — HTML/JSX → Aktion importer (P0 for adoption) — *all*

A codemod that maps `<div className="flex gap-4">` / JSX / Vue SFC templates
to `Row`/`Column` + `sx`. Even 70% automation makes migration tractable. This
is arguably the highest-leverage item for "migrate any app."

### XIV.2 — Tailwind/utility-class mapping (P1)

A documented (and codemod-backed) mapping from Tailwind utilities → `sx`
tokens, since most modern apps being migrated use Tailwind.

### XIV.3 — Component prop-types / IntelliSense (P1)

Ship machine-readable component schemas (the registry already has them!) as
TS types / a JSON schema so editors autocomplete props and validate at
author time — and so the **LLM generating Aktion has a typed contract**.

### XIV.4 — Better error surfaces (P1)

Source-mapped parse/runtime errors with line numbers, "did you mean" prop
suggestions (registry has alias data), and a strict-mode lint for unknown
props/identifiers (partly exists via `strict`).

### XIV.5 — Storybook-style component explorer (P2)

A gallery that renders every component with controls — already partially
present in the docs; formalize as a migration reference.

### XIV.6 — Testing utilities (P1)

`render()/screen/fireEvent` exist (great). Add interaction helpers for the
new primitives (gestures, forms, router) so migrated apps keep their test
suites.

---

## Part XV — Priority matrix & design principles

### The P0 set — implement these and *most* apps become migratable

| # | Proposal | Unblocks |
| --- | --- | --- |
| I.1 | `sx` style-intent prop | every screen of every app |
| I.2 | Expanded design tokens | every design system |
| I.3 | First-class gradients | marketing, commerce, SaaS |
| I.4 | Interaction-state styling | every interactive element |
| I.5 | Responsive style props | every responsive layout |
| II.1 | `Section` band | marketing, docs, settings |
| II.3 | Positioning & overlays | badges, FABs, media, canvas |
| III.1 | `animate` presets | all modern UI |
| III.3 | Enter/exit transitions | modals, toasts, lists, routes |
| III.5 | Gesture wrappers | all mobile |
| IV.1 | Nested/layout routes | all multi-page SPAs |
| IV.2 | Route guards | all authed apps |
| V.1 | `$form` + validation | all forms-heavy apps |
| V.2 | `rules` validators | all forms |
| VI.1 | Pagination/infinite query | feeds, lists, tables |
| VI.2 | Optimistic updates + invalidation | social, commerce, SaaS |
| VI.3 | WebSocket/SSE realtime | chat, collab, live dashboards |
| IX.1 | `Image` lazy/responsive/placeholder | every app (perf+SEO) |
| X.1 | RTL/logical layout | every global app |
| X.3 | a11y primitives | every accessible app |
| VII.4 | Reactive env globals + writable `$theme` | theming, responsive logic |
| XIV.1 | HTML/JSX → Aktion importer | the migration itself |

### Design principles (keep additions idiomatic)

1. **Bounded, not free-form.** Every styling/animation input is an enum or a
   token reference — never arbitrary CSS. Preserves theme-safety,
   XSS-safety, the "describe intent" philosophy, and — crucially —
   **LLM-enumerability** (a model can list valid values, which keeps Aktion
   the most LLM-friendly option).
2. **Composites over config.** Prefer shipping one-line composites
   (`Section`, `Hero`, `$form`, `$infiniteQuery`) over piling props onto
   primitives.
3. **Token-native everything.** Gradients, motion, spacing, z-index, and
   breakpoints all flow from `$theme(...)`, so one brand override restyles a
   whole app.
4. **Reactive, not imperative.** Prefer reactive handles (`$scroll`,
   `$breakpoint`, `$form`, `$socket`) over manual listeners/host glue, so the
   program stays self-contained.
5. **Accessible & motion-safe by default.** Focus traps, ARIA, and
   `prefers-reduced-motion` are built into primitives, not author homework.
6. **The escape hatch stays — as the exception.** `HTMLTag`/`Styles`/`Css`
   remain for the genuine long tail; the goal of every P0/P1 item is to make
   reaching for them rare.

### Suggested rollout phases

- **Phase 1 (unblock):** Part I (styling/tokens/`sx`), II.1/II.3, III.1/III.3,
  IX.1, VII.4. → Marketing, content, and most static/CRUD UIs migrate cleanly.
- **Phase 2 (apps):** IV (routing), V (forms), VI.1/VI.2 (data), X (a11y/i18n).
  → Full SaaS/admin/e-commerce apps migrate.
- **Phase 3 (frontier):** VI.3 (realtime), III.4–III.6 (motion/gesture/DnD),
  XII (mobile/PWA), VIII.5 (data-grid/charts), XI (SSR/perf). → Social,
  collaborative, mobile, and data-heavy apps migrate.
- **Continuous:** XIV (importer + typed schemas) — the force-multiplier that
  makes every phase land faster.

---

### Appendix — what already works (don't rebuild)

Strong foundations the proposals build on, not replace: the **196-component
library**; **reactivity** (`$state`/`$effect`/`$memo`); **data layer**
(`$http`/`$query`/`$mutation`/`Async`); **`$store`** global state;
**`$router`** (hash/history); **`$i18n`** & **`$theme`** (7 themes + tokens);
**`$emit`/`$toast`/`$storage`/`$util`**; **escape hatches**; the **module
linker**; **DevTools**, **testing utilities**, and **machine-readable
component schemas** (reuse these for XIV.3). The job is to extend these into
the styling, motion, routing-depth, forms, realtime, and mobile dimensions
that the broader app landscape demands.
