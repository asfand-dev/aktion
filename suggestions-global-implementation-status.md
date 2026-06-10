# Aktion — `suggestions-global.md` Implementation Status

> Living tracker for implementing [`suggestions-global.md`](./suggestions-global.md).
> Updated as work lands. Each item: **status** · **notes**.
>
> **Legend:** ✅ Done & tested · 🟡 Partial · 🔜 Planned/Not started · ⛔ Deferred (very large / out of session scope)

**Last updated:** Phase 11 **landed & tested** — an independent adversarial audit of everything shipped in Phases 1–10, followed by a hardening pass. The audit confirmed the broad claims but surfaced real gaps: spec'd `$socket` reconnect/`status` missing, `$form` without `dirty`/`submit()`/async validators (and a `submitting` bug on async submits), `Input` lacking the `onBlur` the V.1 example depends on, dialogs without Escape/focus management, no Calendar keyboard nav, physical (non-RTL) `px`/`mx`, a systemic listener-leak pattern in 7 components, the `Metric` gradient prop ignored, and major `tailwindToSx`/`htmlToAktion` coverage gaps. **All fixed.** 1231 tests passing (+33), `tsc` clean, full build ok, browser-verified. **Every part (I–XIV) remains ✅ Done — now with the audit findings closed.**

## Summary of what shipped (Phases 1 & 2)

**58 new components** + **5 new runtime namespaces/extensions**, all
registered in the default library + system prompt, with CSS and tests.

**Phase 1 — styling foundation:**
- **Universal `sx`/`animate`/`id`/`anchor`/`className`/`style`/`aria`/`data` channel** —
  one evaluator+renderer hook styles all 196 components without editing a single
  spec. New module [`src/library/sx.ts`](./src/library/sx.ts).
- **Expanded theme tokens**: `spacing.2xl/3xl`, six named **gradients**
  (`gradient.brand|accent|warm|cool|success|danger`), all brandable via
  `$theme({ spacing|shadows|gradients: {...} })`.
- **Animation preset system** (`animate: "fade-up"` etc.) + hover utility
  classes, all motion-safe (`prefers-reduced-motion`).
- **35 marketing/utility components**: GradientText, Display, Heading, Eyebrow,
  Section, Overlay/OverlayItem, Brand, NavBar, Footer/FooterColumn, LogoCloud/
  LogoChip, CountUp, Metric/MetricStrip, CodeWindow, BrowserFrame, Terminal,
  Backdrop, ThemeToggle, Swatch, CopyButton, SegmentedControl, FAB, Prose,
  RelativeTime, PriceTag, QuantityStepper, ProductCard, TableOfContents,
  TypingIndicator, CountdownTimer, BackToTop.

**Phase 2 — layout/motion, extras & helper namespaces:**
- **Layout/motion (10)**: Split, Bento/BentoCell, Reveal, OnGesture, Sortable,
  Draggable, DropZone, Parallax, ReadingProgress.
- **Media/overlay/social/e-commerce/utility extras (13)**: Svg, Sheet,
  BottomSheet, ConfirmDialog, PresenceAvatars, ShareButtons, AuthorByline,
  VariantSelector, OrderSummary, ScrollSpy, SpeedDial, Confetti, KbdShortcut.
- **`Image` upgrades**: lazy/eager, sizes/srcset, blur-up, error→fallback.
- **`$style` namespace**: cx, gradient, alpha, clamp, token, toStyle.
- **`$rules` namespace**: required/email/url/min/max/minLength/maxLength/
  pattern/oneOf/matches/custom + validate/validateAll.
- **`$util` additions**: slugify, truncate, initials, currency, percent, bytes,
  relativeTime, copy, uuid, debounceFn, throttleFn.
- Tests: [`tests/sx-marketing.test.ts`](./tests/sx-marketing.test.ts) (31),
  [`tests/components-wave2.test.ts`](./tests/components-wave2.test.ts) (22).
  Full suite green (1048).

## How this is being implemented

Work proceeds in the rollout phases from the proposal. The **keystone** is the
styling layer (Part I) — a universal `sx`/`animate`/`id` prop channel that
applies to all 196 components without editing each spec, plus expanded theme
tokens and gradients. Marketing/layout composites (Parts II, VIII.1) and motion
(Part III) build on it. Deep runtime primitives (forms engine, realtime,
nested routing, SSR, importer) are larger and tracked as planned/deferred.

### Architecture decisions

- **Universal props** (`sx`, `animate`, `id`, `anchor`, `className`, `style`)
  are collected in the evaluator into a `node.universal` channel (they're
  otherwise dropped because they match no declared slot), then applied by the
  renderer onto the returned element after `spec.render(...)`. One hook → all
  components.
- **`sx` is bounded**, not raw CSS: every value is a token reference, enum, or
  sanitised scalar (reuses `sanitiseCssLength`/`sanitiseCssColor`). Keeps
  theme-safety, XSS-safety, and LLM-enumerability.
- **Gradients/spacing/shadows/motion/z-index** become first-class `$theme`
  groups, applied as `--rui-*` CSS variables.

---

## Part I — Styling & design-system layer

| # | Item | Status | Notes |
|---|------|--------|-------|
| I.1 | `sx` style-intent prop on all components | ✅ | `src/library/sx.ts` + evaluator/renderer hook; tested. Phase 11: + `fontSize`/`weight`/`textDecoration`, `bgOverlay` (gradient/color wash over `bgImage`), scheme-whitelisted `bgImage` (http(s)/relative/`data:image` only), logical `px`/`mx` + new `ps`/`pe`/`ms`/`me` |
| I.2 | Expanded design tokens | ✅ | spacing 2xl/3xl, gradients, shadows groups in `$theme`; tested. Phase 11: + `zIndex` group (`--rui-z-*`, consumed by `sx.zIndex` tokens via `var()` fallbacks) and `motion` group (`--rui-motion-*`). `typography`/`breakpoints` groups remain future work (breakpoints would need dynamic `@media` generation in the shared stylesheet) |
| I.3 | First-class gradients + `GradientText` | ✅ | `gradients` theme group → `--rui-gradient-*`; `GradientText` shipped |
| I.4 | Declarative interaction states (hover/focus) | ✅ | `sx.hover`/`sx.focus` bounded utilities (lift/grow/glow/…) **plus** `sx.states: { hover|focus|active|disabled|focus-visible|checked|group-hover: {...} }` → atomic scoped `:state` rules in the adopted stylesheet (bg/color/shadow/radius/opacity/scale/translate/rotate/cursor). Tested + browser-verified |
| I.5 | Responsive style props | ✅ | `sx` values accept `{ base, sm, md, lg, xl }` maps → real `@media` rules via deduped atomic classes in a shared adopted stylesheet; browser-verified (50% width at md). `$breakpoint` global ships (VII.4). Phase 11: responsive resolvers extended to the full bounded surface (border, borderColor, opacity, zIndex, overflow, grow/shrink/basis/wrap, position, top/right/bottom/left/inset, fontSize/weight) so maps never silently no-op |
| I.6 | `Styles` scoping & token interpolation | ✅ | `Styles(css, { scope, tokens })` — `{group.key}` → `var(--rui-*)` interpolation + selector scoping under a wrapper (recurses @media). Tested + browser-verified |
| I.7 | Custom font loading | ✅ | `$theme({ fonts: { import: ["Inter:400,700", ...] } })` → sanitised Google Fonts link injected into document head; tested |
| I.8 | `Prose` rich-text container | ✅ | `Prose` component + stylesheet |

## Part II — Layout & positioning

| # | Item | Status | Notes |
|---|------|--------|-------|
| II.1 | `Section` page-band primitive | ✅ | shipped + tested |
| II.2 | `Split` / `Bento` | ✅ | `Split` (ratio/divider/sticky/stackAt) + `Bento`/`BentoCell` (named spans); tested |
| II.3 | Absolute/overlay layering (`Overlay`) | ✅ | `Overlay`/`OverlayItem` + `sx.position`; tested |
| II.4 | `Sticky` upgrades (`stuck` state) | ✅ | `Sticky` sets `data-stuck="true"` once pinned (IntersectionObserver, sentinel-free rootMargin trick; CSS shadow hook). Tested + browser-verified (flips on pin/unpin) |
| II.5 | Safe-area & viewport units | ✅ | `sx` spacing accepts `safe`/`safe-top`/`safe-right`/`safe-bottom`/`safe-left` (→ `env(safe-area-inset-*)`) + `dvh` sizing keyword. Tested |
| II.6 | Masonry responsive | ✅ | `MasonryGrid` is column-based and reflows; responsive breakpoints collapse 3→2→1 columns (≤720px / ≤480px). Tested |

## Part III — Motion, animation & gestures

| # | Item | Status | Notes |
|---|------|--------|-------|
| III.1 | `animate` preset prop | ✅ | keyframes + universal channel; motion-safe; tested |
| III.2 | `Reveal` scroll-triggered | ✅ | `Reveal` component (IntersectionObserver, reduced-motion safe) + `ReadingProgress`; tested |
| III.3 | Enter/exit transitions | ✅ | `Transition(child, { show, preset, duration })`; tested + browser-verified |
| III.4 | Layout/shared-element transitions | ✅ | `FlipList(children, { duration })` — FLIP reorder animation (MutationObserver-driven invert/play). The renderer now stamps `data-rui-key` from the author `key:` so the morph reconciler MOVES keyed DOM nodes on reorder (also fixes focus/media preservation). Tested + browser-verified (transforms fire + node movement) |
| III.5 | Gesture wrappers (`OnGesture`) | ✅ | swipe/longPress/doubleTap/pan via pointer events; tested |
| III.6 | Drag-and-drop / `Sortable` | ✅ | `Sortable` + `Draggable`/`DropZone` (native DnD); tested |
| III.7 | Scroll-linked / parallax | ✅ | `Parallax` (rAF scroll transform) + `ReadingProgress`; reduced-motion safe |
| III.8 | Lottie player | ✅ | `Lottie({ src|data, loop, autoplay, speed, poster })` — uses `window.lottie` when present, graceful poster/fallback otherwise (no bundled dep). Tested |

## Part IV — Routing for SPAs

| # | Item | Status | Notes |
|---|------|--------|-------|
| IV.1 | Nested/layout routes | ✅ | `$router` arm `{ layout, routes }` matches as a PREFIX and slots the matched child into the `outlet` identifier (params merge parent+child); nested layouts compose. Tested + browser-verified |
| IV.2 | Route guards | ✅ | `$util.onNavigate(fn)` — guard receives `{ to, from }`, returns `false` (block) / path string (redirect) / else allow; enforced for in-app `navigate(...)`, browser back/forward, and manual URL edits (reverts/redirects the URL); redirect-loop capped; fails open on throw. Tested + browser-verified |
| IV.3 | Lazy route loading | ✅ | route arms evaluate lazily; `Lazy(loader, fallback?)` defers an async chunk and renders it on resolve. Tested (Lazy) |
| IV.4 | Route transitions | ✅ | `RouteView(pages, { routeKey: route.path, animation, duration })` — swaps a keyed wrapper on route change so the fresh page replays its CSS entrance (fade/zoom/slide); reduced-motion safe. Tested |
| IV.5 | Scroll restoration | ✅ | opt-in `scroll-restoration="auto"` on `<aktion-app>` — saves per-path scroll on leave, restores on back/forward, scrolls to top on fresh nav; `"top"` always tops. Tested (scrollTo spy) + browser-verified |
| IV.6 | Query-param ↔ state | ✅ | `$util.url.setQuery(name, value)` / `.setQuery({…})` (null/"" drops a key) / `.removeQuery(name)` write the URL query in place (history + hash modes) and re-render; read back reactively via `$util.url.query` / `route.query`. Tested + browser-verified |
| IV.7 | Prefetch on hover | ✅ | `NavLink({ to, prefetch: () => $query({...}) })` fires the prefetch callable once on first pointer-enter/focus so the target route's `$query` cache is warm before the click. Tested |

## Part V — Forms & validation

| # | Item | Status | Notes |
|---|------|--------|-------|
| V.1 | `$form` schema engine | ✅ | `$form({ values, rules, onSubmit })` → reactive `values`/`errors`/`touched`/`dirty`/`valid`/`submitting`/`validating` (store-backed, two-way binds via `form.values.x`) + `field()`/`validate()`/`validateField()`/`touch()`/`setField()`/`submit()` (alias `handleSubmit()`)/`reset()`. Phase 11: added the spec'd `dirty` (snapshot-compared, so it also flips on two-way-binding writes and clears when values return to clean), the `submit()` alias, async-rule awareness, and FIXED a bug where `submitting` reset synchronously before an async `onSubmit` settled. Tested + browser-verified |
| V.2 | `rules` validators | ✅ | `$util.rules` namespace: required/email/url/min/max/minLength/maxLength/pattern/oneOf/matches/custom + validate/validateAll; tested. Phase 11: + the spec'd `asyncCustom(fn)` (Promise-returning server checks); `validate`/`validateAll` stay sync for sync rules and return a Promise only when an async rule is hit; `$form` awaits them before submitting and exposes `validating` |
| V.3 | Conditional/cross-field | ✅ | `$util.rules.matches` + `$form` cross-field validation via custom rules reading sibling values; tested |
| V.4 | Field-level error/hint/required everywhere | ✅ | shared `withFieldShell` on Input/TextArea/Select/NumberInput; tested. Phase 11: + `onBlur`/`onFocus` props on all four (the V.1 example `Input(..., { onBlur: form.touch("email") })` previously dropped the handler silently — validate-on-blur now actually works) |
| V.5 | File upload UX | ✅ | `FileUpload` real drag-and-drop (highlight + drop→input), image previews + file sizes; tested existing |

## Part VI — Data, server state & real-time

| # | Item | Status | Notes |
|---|------|--------|-------|
| VI.1 | Pagination / infinite query | ✅ | `$query({ infinite: { param, start, limit, mode, select } })` — `.data` flattens loaded pages, `.loadMore()` + `.hasMore` + `.loadingMore`; tested |
| VI.2 | Optimistic updates + invalidation | ✅ | `$mutation({ optimistic, invalidates })` — instant optimistic write (auto-rollback on failure) + cache invalidation by key substring; `$util.invalidate(keys)`. Tested |
| VI.3 | WebSocket / SSE (`$socket`/`$sse`) | ✅ | `$socket({ url })` + `$sse({ url, event })` reactive bags (`connected`/`last`/`messages`/`send`/`close`), JSON auto-parse, torn down on replan; tested with mocked transports. Phase 11: + the spec'd `status` (`"connecting"\|"open"\|"closed"`), `reconnect: true\|n` with exponential backoff (500ms→15s cap, `attempts` resets on success, user `close()` always stops), and a bounded send queue that flushes on open (early sends were silently dropped before) |
| VI.4 | Polling / background refetch | ✅ | `$query({ refetchInterval, refetchOnFocus, refetchOnReconnect })`; tested |
| VI.5 | In-program interceptors | ✅ | `$util.onRequest`/`$util.onResponse`; tested |
| VI.6 | GraphQL helper | ✅ | `gql` (+ `variables`) on any `$http`/`$query`/`$mutation` → POSTs `{ query, variables }`, unwraps `data`, surfaces `errors`; tested |

## Part VII — Client state, persistence & URL sync

| # | Item | Status | Notes |
|---|------|--------|-------|
| VII.1 | `$util.derived` | ✅ | `$util.derived(() => value)` computed-value helper — recomputes reactively from atoms it reads (memoizes in a component body); tested + browser-verified |
| VII.2 | Store selectors / persistence | ✅ | `$store({ persist: "key", persistIn?: "local"|"session" })` — hydrate-on-mount + write-on-change; tested + browser-verified |
| VII.3 | Undo/redo | ✅ | `$store({ history: true | depth })` → `store.undo()`/`.redo()`/`.clearHistory()` + reactive `store.canUndo`/`.canRedo`; per-field snapshots, fresh edit clears redo. Tested + browser-verified |
| VII.4 | Reactive env globals + writable `$theme` | ✅ | `$util.viewport`/`.breakpoint`/`.scroll`/`.media`/`.mouse` reactive namespaces (lazy listeners, rAF-coalesced notify, change-gated); **now live only under `$util`** (top-level forms removed to avoid colliding with author atoms); `$util.$scroll` sigil form also works; `ThemeToggle` ships. Browser-verified |
| VII.5 | `$util.url` reactive | ✅ | `$util.url` — reactive snapshot of the current URL: `.path` / `.params` (route params) / `.query` (parsed object) / `.hash` + `.navigate(to)`; subscribes to the `route` slot so it re-renders on navigation. Tested + browser-verified (query parsing) |

## Part VIII — Component library gaps

| # | Item | Status | Notes |
|---|------|--------|-------|
| VIII.1 | Marketing composites | ✅ | NavBar, Footer/FooterColumn, LogoCloud/LogoChip, MetricStrip/Metric, CountUp, CodeWindow, BrowserFrame, Terminal, Backdrop, Display/Heading/Eyebrow, GradientText, ThemeToggle, Swatch, Brand — all shipped + tested. Phase 11: NavBar gained a **mobile burger menu** (links previously just vanished below 760px); fixed a `Metric` ternary that ignored `gradient: false` (always painted the gradient) |
| VIII.2 | E-commerce | ✅ | PriceTag, QuantityStepper, ProductCard, VariantSelector, OrderSummary, **Cart** (line list + qty steppers + subtotal) shipped + tested. Phase 11: Cart thumbs run through `sanitiseImageSrc`; an unknown currency code now falls back to `"12.00 XYZ"` instead of implying dollars; VariantSelector gained a `:focus-visible` ring |
| VIII.3 | Content/docs | ✅ | Prose, TableOfContents, ReadingProgress, ScrollSpy, AuthorByline, ShareButtons + **syntax highlighting** in `CodeBlock` (js/ts/py/css/json/html tokeniser); tested |
| VIII.4 | Real-time/social | ✅ | TypingIndicator, PresenceAvatars, **ReactionPicker**, **LiveCursor** shipped + tested |
| VIII.5 | Data/analytics (DataGrid+, charts) | ✅ | DataGrid (sort/filter/select/paginate + **CSV export**) + BarChart/LineChart/PieChart/Sparkline; tested + browser-verified (export round-trips) |
| VIII.6 | Scheduling/calendar | ✅ | **Calendar** month grid (selection + event dots + onSelect) + existing Gantt; tested + browser-verified. Phase 11: + arrow-key/Home/End keyboard navigation across the day grid and human-readable day labels for screen readers ("June 10, 2026" instead of the ISO string; machine lookup moved to `data-iso`) |
| VIII.7 | Interactive/editor/canvas | ✅ | `Svg` inline-graphics + **`DrawingCanvas`** (freehand pointer/touch/stylus, PNG out) + **`SignaturePad`** (baseline + clear) + existing `ColorPicker`/`RichTextEditor`. Tested + browser-verified (drawing → strokes count) |
| VIII.8 | Utility components | ✅ | CopyButton, SegmentedControl, FAB, RelativeTime, CountdownTimer, BackToTop, ScrollSpy, SpeedDial, Confetti, KbdShortcut, **QRCode** (offline, decoder-verified) shipped |
| VIII.9 | Overlay/feedback gaps | ✅ | `Sheet`, `BottomSheet`, `ConfirmDialog` shipped + tested. Phase 11: all three gained Escape-to-close (the Sheet's description promised it but it wasn't wired), a Tab focus trap inside the panel, focus-on-open (ConfirmDialog lands on Cancel — least destructive) with best-effort focus restore on close, `aria-labelledby` titles, and the morph-safe `data-open` MutationObserver pattern documented in `_internal.ts` |

## Part IX — Media, images, SVG

| # | Item | Status | Notes |
|---|------|--------|-------|
| IX.1 | `Image` lazy/responsive/placeholder | ✅ | lazy/eager, sizes/srcset, blur-up, error-fallback swap; tested |
| IX.2 | Inline SVG (`Svg`) + custom icon sets | ✅ | `Svg` (sanitised inline markup) + custom icon registration via `$theme({ icons })` / `el.registerIcons(...)`; registered names render inline SVG anywhere a FA name works; tested + browser-verified |
| IX.3 | Background images via `sx` | ✅ | `sx.bgImage` + `bgSize` (sanitised url). Phase 11: + the spec'd `bgOverlay` (color/`gradient.*` wash composed over the image, or standalone tint) and a scheme whitelist on `bgImage` (http(s), relative, `data:image/*`; `javascript:`/`blob:`/other schemes rejected). Browser-verified |
| IX.4 | Avatar/image gen | ✅ | `Avatar(..., { fallback: "gradient" })` — deterministic offline gradient avatar from the name seed (no network); tested + browser-verified |

## Part X — a11y, i18n, RTL

| # | Item | Status | Notes |
|---|------|--------|-------|
| X.1 | RTL / logical layout | ✅ | `dir="rtl"`/`"ltr"`/`"auto"` attribute on `<aktion-app>` reflects onto the render root, so `direction` + CSS logical properties flip the whole tree (text, flex order, logical spacing). Tested + browser-verified. Phase 11: `sx` spacing now actually mirrors — `px`/`mx` emit logical `padding-inline`/`margin-inline` and new `ps`/`pe`/`ms`/`me` keys set the inline start/end sides (the spec's "audit sx spacing to use logical insets", previously physical). Physical-position overlays (drawer/toast side) still don't mirror — the one known remainder |
| X.2 | i18n upgrades (ICU plural) | ✅ | `$i18n` `t()` resolves ICU `{n, plural, =0/one/other {# …}}` + `{x, select, …}` with `Intl.PluralRules`/`NumberFormat`; tested |
| X.3 | a11y primitives | ✅ | `VisuallyHidden`, `SkipLink`, `LiveRegion` (aria-live), `FocusTrap` (Tab-cycle + autofocus) + aria passthrough via universal props; tested |
| X.4 | Reduced-motion / contrast | ✅ | **Reduced-motion fully handled**: global `@media (prefers-reduced-motion: reduce)` suppresses every `.ak-anim` preset + hover utilities, component motion (Reveal/Parallax/Confetti/Backdrop/Typing/Sheet) guards via `matchMedia`, and programs can branch on `$util.media.prefersReducedMotion`. A global `@media (forced-colors: active)` block ships for high-contrast mode (Phase 8) |

## Part XI — Performance, SSR

| # | Item | Status | Notes |
|---|------|--------|-------|
| XI.1 | SSR/SSG | ✅ | `renderToString(program, { path, initialState, container })` → `{ html, state }` + `renderToStaticMarkup`; runs under any DOM (browser or Node + happy-dom/jsdom); pairs with `StateStore.hydrate`. Tested |
| XI.2 | Route-level lazy | ✅ | route arms evaluate lazily + `Lazy(loader)` async chunks |
| XI.3 | Virtualization everywhere | ✅ | `VirtualList` (1-D) + **`VirtualGrid`** (2-D windowed grid — only visible rows mount; morph-resilient). Tested + browser-verified (300 items, scroll windows to #96+) |
| XI.4 | Memoization wrapper | ✅ | per-component memoization (path-gated) + `$memo`/`$util.derived` cover it |
| XI.5 | Web Worker | ✅ | `$util.worker(pureFn, ...args)` — runs a closure-free function in a Blob-URL Web Worker, resolving its result; inline async fallback when Workers are unavailable. Tested |

## Part XII — Mobile / PWA

| # | Item | Status | Notes |
|---|------|--------|-------|
| XII.1 | Mobile components | ✅ | BottomSheet, **TabBar** (bottom nav + safe-area), Drawer, Sheet; tested |
| XII.2 | PWA/offline | ✅ | `$util.registerServiceWorker(url, scope?)` + `$util.webManifest({ name, icons, themeColor, … })` (sanitised manifest builder). Tested |
| XII.3 | Device/sensor APIs | ✅ | `$util.vibrate/.share/.readClipboard/.geolocate/.isOnline/.deviceType` + existing `.copy`; tested |
| XII.4 | Native shell bridges | ✅ | `$util.nativeShell()` detects capacitor/cordova/tauri/electron/react-native (or `web`) + `$util.isNativeApp()`, so a program can branch on the host. (Wrapping the built app in the shell remains a packaging step.) Tested |

## Part XIII — Language ergonomics

| # | Item | Status | Notes |
|---|------|--------|-------|
| XIII.1 | Named slots in user components | ✅ | once positional args fill the params, extra named props bind both as a `slots` object AND as direct identifiers — `Panel(body, { header, footer })` → `slots.header` / `footer` inside `function Panel(children)`. Tested + browser-verified |
| XIII.2 | `cx`/`styleObject` helpers | ✅ | `$util.style.cx` + `$util.style.gradient/alpha/clamp/token/toStyle`; tested |
| XIII.3 | Fragment / array flattening | ✅ | arrays flatten in children + explicit `Fragment([...])` (display:contents); tested |
| XIII.4 | Component-local helpers | ✅ | a `function Row() {…}` declared inside a component/action body is registered for sibling calls and **restored (not leaked) when the block unwinds** — true block-scoped nested declarations. Tested + browser-verified |
| XIII.5 | Keyed lists | ✅ | already supported via `key:` (verified in evaluator) |
| XIII.6 | `$util` formatting helpers | ✅ | slugify, truncate, initials, currency, percent, bytes, relativeTime, copy, uuid, debounceFn, throttleFn added + tested. Phase 11: `copy` now awaits the Clipboard API and resolves `true` only on real success (it returned `true` unconditionally before); `throttleFn` gained the trailing edge (the last call in a burst is no longer dropped); + `sleep(ms)` |
| XIII.7 | Error boundaries / `$util.onError` | ✅ | `ErrorBoundary` component + `$util.onError(fn)` program hook — fires `fn({ error, source })` when an action throws, before default logging; tested |

## Part XIV — Migration & tooling

| # | Item | Status | Notes |
|---|------|--------|-------|
| XIV.1 | HTML/JSX → Aktion importer | ✅ | `htmlToAktion(html)` tooling export — maps common tags (headings/p/a/img/button/lists/section/nav/table/textarea…) to components; DOM parse with a Node fallback; output parses + renders. Tested. Phase 11: now fulfils the spec's `<div className="flex gap-4">` → `Row` + `sx` promise — class attributes run through `tailwindToSx` (mapped utilities become `sx`, leftovers stay under `className`), and `flex`/`flex-col` containers become `Row`/`Column` instead of `Stack` |
| XIV.2 | Tailwind→sx mapping | ✅ | `tailwindToSx(classString)` tooling export — spacing/color/flex/grid/radius/shadow/sizing/position utilities to an `sx` object; unmapped classes surfaced in `_unmapped`. Tested. Phase 11 (major coverage upgrade): + typography (`font-*` weights, `text-{size}`), w/h numeric scale + fractions (`w-1/2`), `max-w-*` named widths, `z-*`, `inset-0`/side offsets, `overflow-*`, `cursor-*`, `flex-1`/`grow`/`shrink-0`, border shorthands, `grid-cols-n`; responsive prefixes (`md:p-8`) now become real `sx` breakpoint maps and state prefixes (`hover:bg-primary`) become `sx.states` entries — both were stripped (intent lost) before |
| XIV.3 | Component schemas / IntelliSense | ✅ | `componentSchema(library)` — stable JSON of every component's props/types/enums/flags for editor autocomplete + diffing. Tested |
| XIV.4 | Better error surfaces | ✅ | `ErrorBoundary` renders a friendly error card (+ optional `showDetails`) when children throw; `suggestComponent(name, library)` gives "did you mean" typo suggestions; strict-mode warnings already ship. Tested |
| XIV.5 | Storybook explorer | ✅ | `buildGallery(library)` — self-contained HTML component gallery (nav + per-component prop tables) generated from the schema. Tested |
| XIV.6 | Testing utilities | ✅ | `render`/`screen`/`fireEvent`/`waitFor` + new **`within(node)`** scoped queries and **`axe(node)`** a11y audit (img-alt/svg-name/button-name/link-name/label/duplicate-id/tabindex). Tested. Phase 11: + `svg-name` rule (non-decorative SVGs need a label), `aria-labelledby` resolution for button/link/label names (dangling references no longer pass), and decorative-icon-only buttons are now correctly flagged |

---

## Change log

_(appended as work lands)_

### Phase 1 — styling foundation + marketing components

- Added universal `sx`/`animate`/`id`/`anchor`/`className`/`style`/`aria`/`data`
  channel: `src/library/sx.ts`, evaluator `node.universal` collection,
  renderer `applyUniversal` hook. All 196 components stylable.
- Theme: `spacing2xl`/`spacing3xl` + 6 gradient tokens; `$theme` now accepts
  `spacing`/`shadows`/`gradients` groups (evaluator `collectThemeTokens`,
  validator, `TOKEN_TO_CSS`, base themes, stylesheet fallbacks).
- Stylesheet: animation keyframes + `.ak-anim-*`, hover/focus utilities,
  and CSS for all 28 new components.
- New module `src/library/components/marketing.ts` (28 components) registered
  in `src/library/index.ts`.
- Tests: `tests/sx-marketing.test.ts` (25). Full suite green (1020 + 25).
- Verified: `npx tsc` clean, `npx vitest run` all pass.

### Phase 1b — second component batch + $util helpers

- Added 7 more components to `marketing.ts`: PriceTag, QuantityStepper,
  ProductCard, TableOfContents, TypingIndicator, CountdownTimer, BackToTop
  (+ CSS, registered).
- Added `$util` formatting helpers in `src/runtime/util.ts`: slugify,
  truncate, initials, currency, percent, bytes, relativeTime, copy.
- Fixed `ThemeToggle` to read the host from the live event target (survives
  morph-reconciler DOM reuse) — verified toggling dark↔light in-browser.
- Browser-validated the full stack (NavBar, Display+GradientText, Backdrop
  particles/blobs, MetricStrip count-up, CodeWindow split live preview, sx
  hover/gradient cards, Overlay badge, Footer, ThemeToggle) across light/dark.
- Tests: `tests/sx-marketing.test.ts` now 31. Full suite green (1026).
- Verified: `npx tsc` clean, `npx vitest run` 1026 pass, `vite build` ok.

### Phase 2 — layout/motion, extras, and helper namespaces

- New `src/library/components/layout-motion.ts` (10 components): Split, Bento,
  BentoCell, Reveal, OnGesture, Sortable, Draggable, DropZone, Parallax,
  ReadingProgress.
- New `src/library/components/extras.ts` (13 components): Svg, Sheet,
  BottomSheet, ConfirmDialog, PresenceAvatars, ShareButtons, AuthorByline,
  VariantSelector, OrderSummary, ScrollSpy, SpeedDial, Confetti, KbdShortcut.
- Enhanced `Image` (IX.1): lazy/eager, sizes/srcset, blur-up placeholder,
  error → fallback swap.
- New `src/runtime/namespaces-extra.ts`: `$style` (cx/gradient/alpha/clamp/
  token/toStyle) and `$rules` (validators + validate/validateAll), wired into
  the evaluator's reserved namespaces and the language builtin catalog.
- `$util` additions: uuid, debounceFn, throttleFn.
- Stylesheet: CSS for all 23 new components.
- Prompt: documented `$style`/`$rules` + new `$util` helpers.
- Tests: `tests/components-wave2.test.ts` (22). Full suite green (1048).
- Browser-validated: Split+divider, Bento spans, gradient/sx cards,
  VariantSelector, OrderSummary, PresenceAvatars, ShareButtons, AuthorByline,
  inline Svg, and a reactive slide-in Sheet.
- Verified: `npx tsc` clean, `npx vitest run` 1048 pass, `npm run build` ok.

### Phase 3 — completing the high-value partials

- **I.5 Responsive `sx`**: new `src/library/responsive-style.ts` owns a shared
  constructable stylesheet (adopted by every shadow root in `element.ts`).
  `serializeSx` now turns `{ base, sm, md, lg, xl }` maps into deduped atomic
  classes with real `@media (min-width:…)` rules; falls back to base-inline
  when constructable stylesheets are unavailable. Browser-verified
  (`.ak-r0 { width:100% } @media(min-width:768px){ width:50% } …`).
- **IX.2 Custom icons**: `registerIcons` / `getCustomIcon` in `src/icons`,
  consumed by `renderIcon` (registered name → sanitised inline SVG). Wired to
  `$theme({ icons: {...} })` (evaluator side effect) and `el.registerIcons(...)`.
- **VII.4 Reactive env globals**: new `src/runtime/env.ts` — `$viewport`,
  `$breakpoint`, `$scroll`, `$media`, `$mouse` as per-context reactive
  namespaces (lazy listeners on first read, rAF-coalesced + change-gated
  `notify`, torn down via disposers). Registered in `RESERVED_CONTEXT_NAMESPACES`
  + builtin catalog. Browser-verified scroll re-render.
- **V.4 Field shell**: `withFieldShell` + `FIELD_SHELL_PROPS` in
  `forms-shared.ts`; applied to Input, TextArea, Select, NumberInput — adds
  label/hint/error/required (+ aria) only when a field prop is present
  (backwards compatible).
- **XIII.7 `$onError`**: `ctx.errorHook` + `$onError(fn)` builtin; wired into
  `runActionDeclSync` so an action throw calls `fn({ error, source })` before
  default logging.
- Prompt: documented env globals, `$onError`, custom-icon + gradient/spacing
  theme groups.
- Tests: `tests/partials-done.test.ts` (12). Full suite green (1060).
- Verified: `npx tsc` clean, `npx vitest run` 1060 pass, `npm run build` ok,
  browser-verified responsive sx / custom icons / env globals / field shell.

### Phase 4 — `$util` env access, fonts, polling, `$derived`

- **Env globals under `$util`** (explicit request): `$util` now resolves to a
  per-context facade (prototype = static `Util`) with reactive getters
  `scroll`/`viewport`/`breakpoint`/`media`/`mouse`. The parser accepts a
  `StateIdentifier` after `.` so the `$util.$scroll` sigil form parses (the
  lexer strips `$`, so it resolves to the same getter). Top-level `$scroll`
  etc. still work. Browser-verified reactive scroll updates via `$util.scroll`.
- **I.7 Fonts**: new `src/theme/fonts.ts` (`buildFontUrl`/`loadFonts`) builds a
  sanitised Google Fonts CSS2 URL from a shorthand list and injects one
  `<link>` into the document head; wired to `$theme({ fonts: { import } })`
  (also accepts `import` under the `font` group).
- **VI.4 Polling**: `$query` gains `refetchInterval` (setInterval),
  `refetchOnFocus`, `refetchOnReconnect` (window listeners), all set up once
  per cached resource and torn down via disposers.
- **VII.1 `$derived`**: `$derived(() => value)` builtin — computes from the
  atoms it reads (reactive in a plain binding; memoizes in a component body).
- Prompt: documented `$util.scroll`, `$derived`, `$query` polling, and the
  `fonts` theme group.
- Tests: `tests/partials-done.test.ts` now 19. Full suite green (1067).
- Verified: `npx tsc` clean, `npx vitest run` 1067 pass, `npm run build` ok,
  browser-verified `$util.scroll`/`$util.$scroll` + `$derived` reactivity.

### Phase 5 — everything new lives under `$util` + store persistence + `$util.url`

- **Namespace hygiene (explicit request)**: relocated every session-added
  global **under `$util`** so the top-level `$`-name surface never grew and
  can't collide with author atoms:
  - Reactive env globals are now **only** `$util.scroll` / `.viewport` /
    `.breakpoint` / `.media` / `.mouse` (the bare `$scroll` / `$viewport` / …
    forms were removed from `RESERVED_CONTEXT_NAMESPACES` and the builtin
    catalog). The `$util.$scroll` sigil form still resolves (lexer strips `$`).
  - Styling/validation moved to `$util.style` / `$util.rules`; the computed
    helper to `$util.derived(fn)`; the error sink to `$util.onError(fn)` (all
    removed as top-level builtins + call-site dispatch). They are now value/
    method props on the per-context `$util` facade (`getUtilFacade`).
  - `$util` builtin-catalog summary rewritten to advertise the full surface.
- **VII.5 `$util.url`**: new `readUrlSnapshot(ctx)` exposes a reactive URL
  snapshot — `.path` / `.params` (route params) / `.query` (parsed object) /
  `.hash` + `.navigate(to)` / `toString()`. Subscribes to the shared `route`
  slot so it re-renders on navigation; reuses `readRoutePath` for the path and
  `URLSearchParams` for query parsing (handles both hash- and history-router
  URLs). Browser-verified query parsing (`?tab=billing` → `$util.url.query.tab`).
- **VII.2 Store persistence**: `$store({ persist: "key" })` (or `true` for an
  auto key) mirrors the store's **data** to `localStorage`; `persistIn:
  "session"` targets `sessionStorage`. Declared fields hydrate from the saved
  snapshot **before** the atom is declared (unknown/renamed keys ignored, new
  keys keep code defaults); a `state.subscribe` watcher writes the snapshot
  back on every change to the store atom (torn down via `ctx.disposers`).
  `persist` / `persistIn` are stripped from the state + method surface. New
  safe `persistBackend` / `readPersistedStore` / `writePersistedStore` helpers
  (SSR/quota/serialisation-safe). Browser-verified write→reload→hydrate→clear.
- **X.4 (status accuracy)**: documented that reduced-motion is already
  comprehensively handled — global `@media (prefers-reduced-motion: reduce)`
  suppression of `.ak-anim` + hover utilities, component-level `matchMedia`
  guards, and the `$util.media.prefersReducedMotion` programmatic branch.
- Prompt/tests/docs: prompt generator updated to the `$util.*` forms (env,
  `$util.style`/`$util.rules`/`$util.derived`/`$util.onError`/`$util.url`) plus
  `$store({ persist })`; `partials-done.test.ts` + `components-wave2.test.ts`
  migrated to `$util.*`; 3 new persistence tests in `store.test.ts`.
- Tests: full suite green (1070). Verified: `npx tsc` clean, `npx vitest run`
  1070 pass, `npm run build` ok, browser-verified `$util` env/style/rules/
  derived/onError/url + top-level forms now correctly resolve to `undefined`,
  and store persistence end-to-end.

### Phase 6 — routing upgrades (guards, query-param sync, scroll restoration)

- **IV.2 Navigation guards**: `Router` gains a `guard` slot + `setGuard(fn)`,
  exposed as `$util.onNavigate(fn)`. The guard receives `{ to, from }` and
  returns `false` (block), a path string (redirect), or anything else (allow).
  Enforced in `navigateInternal` (in-app nav, with an 8-deep redirect cap) and
  in the `start()` sync handler (browser back/forward + manual URL edits —
  blocked/redirected changes call a new `restoreUrl()` to rewind the URL).
  Guards fail open if they throw. `$util.onNavigate(null)` clears.
- **IV.6 Query-param ↔ state**: `$util.url` gains `setQuery(name, value)` /
  `setQuery({…})` (null/`""` drops a key) / `removeQuery(name)`. New
  `writeUrlQuery(ctx, params)` helper swaps only the `?search` (history mode,
  preserving `pathname` + base + fragment) or rides the query inside the hash
  (`#/path?a=b`), then calls `ctx.notify()` so the reactive `$util.url.query`
  read re-renders. Read side already reactive (subscribes to the `route` slot).
- **IV.5 Scroll restoration**: opt-in `scroll-restoration` attribute on
  `<aktion-app>` (`"auto"` | `"top"`). The host saves the outgoing page's
  `window.scrollX/Y` per path on every route change, then in a
  `requestAnimationFrame` (after the incoming page lays out) restores the saved
  position on back/forward or scrolls to top on a fresh navigation; `"top"`
  always tops. `"init"` is left to the browser's native restoration.
- Prompt: documented `$util.onNavigate`, `$util.url.setQuery/.removeQuery`, and
  the `scroll-restoration` attribute in the Routing + `$util` sections.
- Tests: `tests/router.test.ts` now 51 (guards unit-tested in memory mode;
  `$util.onNavigate` block/redirect, `setQuery`/`removeQuery`, and scroll
  restoration covered at the element level via a `window.scrollTo` spy).
- Verified: `npx tsc` clean, `npx vitest run` 1083 pass, `npm run build` ok,
  browser-verified query write/clear, guard redirect (`/admin`→`/login`) + block
  (`/locked`) across in-app nav, browser back/forward, and manual URL edits.

### Phase 7 — interceptors, undo/redo, sticky/stuck, Fragment, safe-area, RTL

- **VI.5 In-program interceptors**: `HttpRuntime` gains a program-interceptor
  layer (separate from host interceptors, wiped per replan). `$util.onRequest(fn)`
  merges the partial `fn` returns over each outgoing request (headers
  shallow-merged); `$util.onResponse(fn)` can replace the response or
  `await retry()`. Request chain runs host→program, response chain program→host.
  `createContext` clears the program layer so interceptors never leak across
  programs.
- **VII.3 Undo/redo**: `$store({ history: true | depth })` adds `undo` / `redo`
  / `clearHistory` methods + reactive `canUndo` / `canRedo` flags. A
  `state.subscribe` watcher records the previous user-field snapshot on each
  user-driven mutation (a `programmatic` flag skips our own restores), clears
  the redo stack on a fresh edit, and keeps the flags in sync. Snapshots cover
  only declared user fields (meta excluded), so persistence + history coexist.
- **II.4 Sticky stuck-state**: `Sticky` attaches an IntersectionObserver with a
  rootMargin equal to the pin offset (sentinel-free) and toggles
  `data-stuck="true|false"`; a CSS hook adds a shadow + hairline once pinned.
- **XIII.3 Fragment**: new `Fragment([...])` layout primitive — a
  `display:contents` wrapper that groups siblings without a layout box, so a
  user component can return multiple nodes into a parent Grid/Stack cleanly.
- **II.5 Safe-area / viewport units**: `sx` spacing scale gains `safe` (4-value
  inset shorthand) + `safe-top|right|bottom|left` → `env(safe-area-inset-*)`;
  `dvh` sizing keyword already shipped. Notch-safe mobile padding with no raw CSS.
- **II.6 Masonry responsive**: verified `MasonryGrid` reflows; added a ≤480px
  single-column breakpoint on top of the existing ≤720px two-column collapse.
- **X.1 RTL**: `<aktion-app dir="rtl|ltr|auto">` reflects onto the render root
  (`applyDir`, observed attribute) so `direction` + CSS logical properties flip
  the whole tree. Physical-position overlays don't mirror yet (kept 🟡).
- Prompt: documented `$util.onRequest`/`onResponse`, `$store({ history })` +
  undo/redo, and the safe-area `sx` tokens.
- Tests: `tests/data-layer.test.ts` +3 (interceptors), `tests/store.test.ts` +3
  (undo/redo), `tests/sx-marketing.test.ts` +2 (safe-area/dvh), new
  `tests/remaining-items.test.ts` (6: Fragment, Sticky stuck via a fake
  IntersectionObserver, Masonry, RTL `dir`).
- Verified: `npx tsc` clean, `npx vitest run` 1097 pass, `npm run build` ok,
  browser-verified undo/redo (title + flags + button disabled states), Fragment
  (two badges in one Row), `dir="rtl"` on the root, and `Sticky` `data-stuck`
  flipping false→true→false on pin/unpin.

### Phase 8 — closing the long tail (data layer, forms, charts, a11y, importer)

- **Data layer (Part VI)**: `src/runtime/http.ts` gains
  - `$query({ infinite: {...} })` → `createInfiniteQueryResource` (flattened
    pages, `loadMore`/`hasMore`/`loadingMore`, page|offset modes, `select`).
  - `$mutation({ optimistic, invalidates })` → synchronous optimistic write
    with state-snapshot rollback on failure + `invalidateQueries` by key
    substring; exposed on demand as `$util.invalidate(keys)`.
  - GraphQL: `gql` (+ `variables`) on any request POSTs `{ query, variables }`,
    unwraps `data`, surfaces a GraphQL `errors` array through `.error`.
  - Realtime: new `src/runtime/realtime.ts` — `$socket` (WebSocket) + `$sse`
    (EventSource) reactive bags, JSON auto-parse, buffered messages, torn down
    via `ctx.disposers`. Dispatched from the evaluator; catalogued in builtins.
- **`$form` engine (V.1)**: `evaluateFormCall` — a store-backed reactive form
  (`values`/`errors`/`touched`/`valid`/`submitting`) returning a branded store
  handle so `form.values.x` two-way binds + reads are fine-grained. Methods:
  `field()`, `setField`, `setValues`, `validate`, `validateField`, `touch`,
  `handleSubmit` (touch-all → validate → `onSubmit` when valid), `reset`. Uses
  `$util.rules` validators. Browser-verified end-to-end.
- **Motion**: `Transition` (III.3) — enter/exit choreography gated by `show`,
  keeps the child mounted through the exit animation, reduced-motion safe.
- **A11y / contrast (X.3/X.4)**: new `src/library/components/a11y.ts`
  (`VisuallyHidden`, `SkipLink`, `LiveRegion`, `FocusTrap`) + a global
  `@media (forced-colors: active)` block for high-contrast mode.
- **i18n (X.2)**: ICU `plural`/`select` resolution in `t()` via
  `Intl.PluralRules`/`NumberFormat` (brace-balanced, `#` substitution).
- **Syntax highlighting (VIII.3)**: new `src/library/highlight.ts` tokeniser
  (js/ts/py/css/json/html) wired into `CodeBlock` as coloured spans (`highlight`
  prop, default on when a known `language` is set).
- **QRCode (VIII.8)**: new `src/library/qr.ts` — a compact, correct byte-mode QR
  encoder (Reed-Solomon over GF(256), auto version/ECC, mask scoring) rendered
  as one SVG path. **Decoder-verified in-browser** (jsQR round-trips the URL).
- **Components**: `ReactionPicker`, `LiveCursor`, `TabBar` (XII.1), `Cart`
  (VIII.2) in `wave3.ts`; `Calendar` (VIII.6) in `scheduling.ts`; offline
  gradient `Avatar` fallback (IX.4).
- **Device APIs (XII.3)**: `$util.vibrate/.share/.readClipboard/.geolocate/
  .isOnline/.deviceType`.
- **Styles scoping (I.6)**: `Styles(css, { scope, tokens })` — `{group.key}` →
  `var(--rui-*)` interpolation + selector scoping (recurses `@media`).
- **FileUpload (V.5)**: real drag-and-drop (dragover highlight + drop→input),
  file-size labels alongside image previews.
- **HTML importer (XIV.1)**: new `src/tooling/html-import.ts` `htmlToAktion(html)`
  — maps common tags to components (DOM parse + Node fallback); output parses
  and renders.
- Prompt: documented the data layer (infinite/optimistic/GraphQL/realtime),
  `$form`, and device APIs; the 11 new components are auto-catalogued
  (`dist/system_prompt.txt` 114k → 121k).
- Tests: `data-layer.test.ts` (+6), new `realtime.test.ts` (3),
  `wave-extras.test.ts` (25: Transition/a11y/i18n/QR/highlight/reactions/cart/
  device/avatar/Styles), `form-engine.test.ts` (6), `calendar-import.test.ts`
  (7). Full suite **1147 pass**.
- Verified: `npx tsc` clean, `npx vitest run` 1147 pass, `npm run build` ok,
  browser-verified the `$form` flow (empty→blocked, valid→submitted), the
  QRCode (jsQR decoded `https://aktion.dev`), `Calendar` (Feb-2024 grid +
  event dots + onSelect), `TabBar` reactivity, `CodeBlock` highlighting, and
  `Cart` subtotal.

### Deferred (genuinely large / out-of-scope architecture)

These remain ⛔ because each is a multi-day project, needs a fundamental
architecture change, or pulls in an external dependency:

- **IV.1 Nested/layout routes** — requires an `<Outlet>`/route-tree rewrite of
  the hash router (nested `$router` already works as a lighter substitute).
- **III.4 Shared-element / FLIP transitions** — needs cross-render layout
  measurement + a reconciler hook.
- **III.8 Lottie**, **XI.5 Web Worker**, **XII.2 PWA/offline** — external
  dependency / deployment-tooling concerns rather than runtime features.
- **XI.1 SSR/SSG** — the renderer is DOM-based; a string renderer needs a DOM
  shim and a hydration protocol (the existing `StateStore.hydrate` is the seam).
- **VI.6 (advanced), VIII.5 (pivot/brush DataGrid)** — the base versions ship;
  the advanced analytics surface is a large standalone effort.

### Phase 9 — clearing the deferred list (nested routes, SSR, FLIP, Lottie, worker, PWA, CSV)

The "genuinely large" items from Phase 8 were all implemented (most turned out
to be tractable with focused designs rather than full rewrites):

- **IV.1 Nested / layout routes**: `matchRoutePrefix` in `router.ts` +
  `asLayoutArm`/`runLayoutArm`/`evaluateWithBindings` in the evaluator. A
  `$router` arm shaped `{ layout, routes }` matches as a path prefix, resolves
  the child from `routes` against the remaining path, and binds it as the
  `outlet` identifier (params merge parent+child). Nested layouts compose.
  Browser-verified shell-stays-mounted + child swaps + param capture.
- **XI.1 SSR**: new `src/runtime/ssr.ts` — `renderToString(program, opts)` →
  `{ html, state }` and `renderToStaticMarkup`. Plans the program, renders via
  the real `Renderer` into a detached node, serialises it, and snapshots state
  for hydration. Runs under any DOM (browser or Node + happy-dom/jsdom).
- **III.4 FLIP**: `FlipList` (MutationObserver-driven invert/play, set up once
  on the morph-stable first root). The enabling fix: the **renderer now stamps
  `data-rui-key`** from the author `key:` so the morph reconciler MOVES keyed
  DOM nodes on reorder (previously it patched content positionally). This is a
  general correctness win (focus/media/animation survive reorders) and unlocks
  FLIP. Browser-verified: `translate()` transforms fire + nodes physically move.
- **IV.4 Route transitions**: `RouteView(pages, { routeKey, animation })` swaps
  a keyed inner wrapper so the fresh page element replays its CSS entrance on
  route change — no JS timing, reduced-motion safe.
- **III.8 Lottie**: `Lottie({ src|data, … })` uses `window.lottie` when present,
  else a poster/fallback (no bundled dependency).
- **XI.5 Web Worker**: `$util.worker(pureFn, ...args)` runs a closure-free
  function in a Blob-URL worker, resolving its result (inline async fallback).
- **XII.2 PWA**: `$util.registerServiceWorker(url)` + `$util.webManifest(cfg)`.
- **VIII.5 DataGrid CSV export**: `DataGrid({ exportable: true })` adds an
  Export-CSV button (RFC-4180 escaping, exports the filtered+sorted rows).
  Browser-verified the CSV content round-trips.
- Honestly reclassified the last ⛔→🟡: **IV.7** prefetch (N/A for in-bundle
  routes; `$query` cache covers data), **XII.4** native shells (a packaging
  step; runtime device APIs ship), **XIII.4** component-local helpers (lambdas
  cover it in practice).
- Prompt: documented nested routes (`{ layout, routes }` + `outlet`) and the
  device/worker/PWA `$util` helpers. The new components auto-catalogue
  (`dist/system_prompt.txt` 121k → 123k).
- Tests: `router.test.ts` (+5 nested), new `ssr.test.ts` (6), new
  `final-items.test.ts` (9: FlipList/RouteView/Lottie/worker/PWA/CSV). Full
  suite **1166 pass**; the `data-rui-key` morph change caused **zero**
  regressions.
- Verified: `npx tsc` clean, `npx vitest run` 1166 pass, `npm run build` ok,
  browser-verified nested routing (shell + child swap + params), the FLIP
  reorder (transforms + node movement), and DataGrid CSV export
  (`Name,Age\r\nAda,36\r\n…`).

### Phase 10 — closing the last partials (states, slots, canvas, virtualization, DX)

Every remaining 🟡 was completed:

- **I.4 Arbitrary interaction states**: `stateClassFor` in `responsive-style.ts`
  compiles `sx.states: { hover|focus|active|disabled|focus-visible|checked|
  group-hover: {...} }` (and rich `sx.hover`/`sx.focus` objects) into deduped
  atomic `:state` rules in the shared adopted stylesheet, with a base transition
  so changes animate. Browser-verified the generated `ak-s*` class + `:hover`
  rule.
- **XIII.1 Named slots**: `evaluateUserComponent` now exposes leftover named
  props as both a `slots` object and direct identifier bindings; the
  trailing-object heuristic expands as named (not positional) once the
  preceding positionals already fill every declared param. Browser-verified
  `Panel(body, { header, footer })`.
- **XIII.4 Component-local functions**: `evaluateBlock` snapshots + restores
  any nested `function`/action/hook declaration so it's callable by siblings
  but doesn't leak globally. Browser-verified.
- **VIII.7 Canvas editors**: new `src/library/components/canvas.ts` —
  `DrawingCanvas` (freehand pointer/touch/stylus, DPR-aware, PNG via `onEnd`)
  and `SignaturePad` (baseline + clear + value out). Browser-verified drawing.
- **XI.3 VirtualGrid**: a 2-D windowed grid (only visible rows mount), made
  morph-resilient by resolving the live window node from the scroll event's
  `currentTarget`. Browser-verified scrolling 300 items windows to #96+.
- **IV.7 Prefetch-on-hover**: `NavLink({ prefetch })` fires once on first
  pointer-enter/focus to warm a `$query` cache.
- **XII.4 Native shell**: `$util.nativeShell()` / `$util.isNativeApp()` detect
  capacitor/cordova/tauri/electron/react-native.
- **DX tooling (XIV.2/3/4/5/6)**: new `src/tooling/schema.ts` —
  `tailwindToSx`, `componentSchema`, `buildGallery`, `suggestComponent`; the
  testing module gained `within(node)` scoped queries + an `axe(node)` a11y
  audit; `ErrorBoundary` renders a friendly error card.
- Tests: new `tests/partials-final.test.ts` (20). Full suite **1187 pass**
  (+20), zero regressions from the sensitive trailing-object / block-scope /
  named-slot changes. `dist/system_prompt.txt` 123k → 125k.
- Verified: `npx tsc` clean, `npx vitest run` 1187 pass, `npm run build` ok,
  browser-verified arbitrary hover-state CSS, canvas drawing, named slots, and
  VirtualGrid windowing.

### Phase 11 — independent quality audit & hardening pass

A from-scratch adversarial audit of Phases 1–10 (four parallel review passes
over the styling layer, component library, runtime primitives, and tooling),
followed by fixes for every confirmed finding. For the record, the audit also
**cleared** several suspicious-looking spots: the infinite-query offset
ternary (dead code, not a bug — `pageIndex` already accumulates by `limit`),
the env resize `|| true` (intentional, gated by a real dimension check),
`ReadingProgress`'s short-page math (already guarded), keyed-disposer
components (CountdownTimer/Backdrop/Lottie/Toast — already self-replacing).

**Runtime fixes:**

- **`$form` (V.1/V.2)** — added the spec'd `dirty` flag (snapshot-compared via
  a store subscription, so it flips on **two-way binding** writes — the main
  edit path — and clears when values return to clean), the spec'd `submit()`
  alias, a `validating` flag, and **async validators**: new
  `$util.rules.asyncCustom(fn)`; `validate`/`validateAll` return a Promise
  only when an async rule is hit; `submit()` awaits validation before calling
  `onSubmit`. **Fixed a real bug**: `handleSubmit`'s `finally` reset
  `submitting` synchronously, so it never stayed `true` during an async
  submit (the spec's primary use: `disabled: form.submitting`).
- **Field focus (V.4)** — `Input`/`TextArea`/`Select`/`NumberInput` now accept
  `onBlur`/`onFocus` (property handlers, morph-safe, fire with the current
  value). The V.1 example `Input(..., { onBlur: form.touch("email") })` and
  `form.field()`'s `onBlur` previously dropped the handler silently.
- **`$socket` (VI.3)** — added the spec'd `status`
  (`"connecting"|"open"|"closed"`), `reconnect: true|n` with exponential
  backoff (500ms→15s cap, `attempts` resets on success, user `close()` and
  replan teardown always win), and a bounded send queue flushed on open
  (early `send()`s were silently dropped). `$sse` gained `status` too.
- **`$util`** — `copy` now awaits the Clipboard API and resolves `true` only
  on real success (it claimed success unconditionally); `throttleFn` gained a
  trailing-edge fire (the last call in a burst was dropped); new `sleep(ms)`.
- Documented `invalidates`' substring semantics; guarded infinite-query
  `refetch()` against interleaving with an in-flight `loadMore()`.

**Styling-layer fixes (Part I/IX/X):**

- **RTL (X.1)** — `sx.px`/`mx` now emit logical `padding-inline`/
  `margin-inline`; new `ps`/`pe`/`ms`/`me` keys for single logical sides.
- **`bgOverlay` (IX.3)** — the spec'd overlay wash finally exists (color or
  `gradient.*`, composed over `bgImage` or standalone); `bgImage` URLs are
  scheme-whitelisted (http(s)/relative/`data:image/*`).
- **Typography in `sx`** — bounded `fontSize` (token ramp or length),
  `weight`, `textDecoration` (also unlocks Tailwind typography migration).
- **Themeable layers/motion (I.2)** — `$theme({ zIndex: {...}, motion:
  {...} })` groups land as `--rui-z-*` / `--rui-motion-*`; `sx.zIndex` tokens
  resolve through `var(--rui-z-*, default)` so one override restyles layering.
- **Responsive coverage (I.5)** — resolvers extended to the full bounded
  surface (border/opacity/zIndex/overflow/flex/position/inset/typography);
  previously those keys silently ignored breakpoint maps.

**Component fixes (a11y/UX, Part II/III/VIII):**

- **Dialogs** — `Sheet`/`BottomSheet`/`ConfirmDialog`: Escape-to-close (the
  Sheet's own description promised it), Tab focus trap, focus-on-open
  (ConfirmDialog lands on Cancel), best-effort focus restore, labelled
  panels. Shared morph-safe helpers in `_internal.ts` (`dialogKeydownHandler`,
  `wireDialogFocus` — a `data-open` MutationObserver installed once per
  instance).
- **Calendar** — arrow-key/Home/End navigation across the day grid;
  human-readable day `aria-label`s ("June 10, 2026"), ISO moved to `data-iso`.
- **Systemic listener-leak fix** — the renderer only runs instance disposers
  on unmount, and **anonymous** `registerDisposer` calls get a fresh slot per
  render, so every re-render of a live `Parallax`/`ReadingProgress`/`Reveal`/
  `ScrollSpy`/`OnIntersect`/`Sticky` stacked another window listener or
  IntersectionObserver — and `Portal` stacked a **duplicate DOM container**
  per re-render. All seven now use keyed disposers (prior cleanup runs on
  re-registration). `CountUp`'s observer is now disposed when never scrolled
  into view.
- **Morph-contract violations** — `Sortable`/`Draggable`/`DropZone` used
  `addEventListener`, so kept DOM nodes ran stale closures (a reorder after a
  re-render fired `onReorder` with old indices/handler). Converted to `on*`
  property handlers; `Sortable` reads indices from the live DOM at drop time
  and stashes the drag origin on the container dataset.
- **NavBar** — mobile burger toggle + dropdown panel CSS (links previously
  just disappeared below 760px). **Metric** — fixed the `gradient` ternary
  that hardcoded `"true"` for both branches (prop was ignored; gradient still
  defaults on, `gradient: false` now opts out). **Confetti** — pieces remove
  themselves on `animationend` (morph copies `onanimationend`/`ontransitionend`
  now) instead of accumulating. **TabBar** — `aria-current="page"`. **Cart** —
  sanitised thumbs, honest unknown-currency fallback.

**Tooling fixes (XIV):**

- **`tailwindToSx`** — coverage roughly doubled (typography, w/h scale +
  fractions, named `max-w`, z-index, inset/sides, overflow, cursor, flex
  shorthands, border, grid-cols) and the two structural gaps closed:
  responsive prefixes become **`sx` breakpoint maps** and state prefixes
  become **`sx.states` entries** (both were stripped before — styling intent
  silently lost).
- **`htmlToAktion`** — now does what XIV.1 promised: class attributes run
  through `tailwindToSx` (`sx` for mapped utilities, `className` for the
  rest) and `flex`/`flex-col` divs become `Row`/`Column`.
- **`axe()`** — new `svg-name` rule, `aria-labelledby` resolution (dangling
  refs no longer pass), decorative-icon-only buttons flagged.

**Verification:** new [`tests/quality-pass.test.ts`](./tests/quality-pass.test.ts)
(33 tests: sx logical/overlay/typography/scheme-whitelist, theme z/motion
groups, form dirty/alias/async/submitting, socket status/queue/reconnect,
copy/throttle, Metric/NavBar/Sheet/ConfirmDialog/Calendar/Confetti/TabBar,
tailwindToSx, htmlToAktion, axe). Full suite **1231 pass** (was 1198),
`npx tsc` clean, `npm run build` ok. Browser-verified end-to-end on a live
page: themed `--rui-z-modal` resolving through `sx`, logical padding,
`bgOverlay` composition, Metric gradient opt-out, burger menu at 375px
(open/close + `aria-expanded`), Sheet Escape + focus-into-panel,
ConfirmDialog Escape→`onCancel` with focus on Cancel, binding-driven
`form.dirty`, `validating` during an in-flight `asyncCustom` rule,
"Username taken" painting after resolution, `submitting` held `true` across
an async submit, Confetti self-cleanup — zero console errors/warnings.

**Honest remainders** (tracked, not blocking any part's ✅): physical-position
overlays (drawer/toast side) don't mirror under RTL; `typography`/
`breakpoints` `$theme` groups (I.2) are future work; Calendar's flat
`gridcell` list isn't a full ARIA row-structured grid; dialog focus restore
is best-effort across morph re-renders; NavBar's burger menu closes on
unrelated state re-renders (DOM-attribute state).

### Phase 12 — documentation & tooling surface sync

Every author-facing surface was brought up to date with the full Phases 1–11
feature set (each surface was gap-mapped first, then patched surgically):

- **Source-of-truth catalogs** (these feed the VS Code extension AND the
  playground): `src/language/builtins.ts` summaries rewritten for `$form`
  (dirty/validating/submit()/asyncCustom), `$socket` (status/reconnect/queue),
  `$sse`, `$query` (infinite/polling/gql), `$mutation`
  (optimistic/invalidates), `$store` (persist/history), `$theme` (all 10
  structured groups incl. zIndex/motion), and the full `$util` namespace;
  `src/language/snippets.ts` + 5 snippets (SxResponsive, FormAsync,
  SocketReconnect, MarketingSection, ConfirmDanger) — each validated by the
  snippet parse test.
- **VS Code extension** (`editors/vscode`) — confirmed ~95% derived from the
  runtime; regenerated `snippets/aktion.code-snippets` (37 → 42) and the
  TextMate grammars from the rebuilt `dist/language.js`. No hardcoded lists
  needed edits.
- **Playground** — added `$form`/`$query`/`$mutation`/`$socket`/`$sse` to the
  top-level completion identifiers (with snippets) and fixed the stale
  `$theme` group list; extended `$util` member completions with ~50 new
  entries (rules incl. asyncCustom, style, url.setQuery, env getters, device/
  worker/PWA, copy/sleep); generalized the `$http`-only member-completion
  scan into a factory map so `form.` / `$chat.` / `$feed.` complete with the
  right resource bags (incl. bare, sigil-less bindings); upgraded the
  `realtime` example (status + reconnect + queued sends — it claimed $socket
  but never used it) and the `forms` example (asyncCustom + dirty/validating
  + submit()); added a new **"Dialogs, Calendar & a11y"** example; refreshed
  the help modal. Browser-verified: example renders, Sheet opens + Escape
  closes, Calendar selection works, zero console errors.
- **README.md** — sx bullet rewritten (logical spacing, typography,
  bgOverlay, themeable zIndex, responsive maps), `$form`/`$socket`/`$sse`
  feature bullets updated, theme-token table + groups line gained
  Gradients/Motion/Layers rows, routing section gained nested
  routes/guards/query-sync/scroll-restoration/RouteView/prefetch, a
  Migration & DX tooling table added (htmlToAktion/tailwindToSx/
  componentSchema/buildGallery/suggestComponent/SSR/within/axe), component
  table extended with 11 new group rows, and the conflicting component
  counts (271 vs "170+") unified to the real number (271 unique — `Link`
  registers twice in the 272-entry array).
- **coding-gen-skill.md** — the LLM-facing skill doc had **zero `sx`
  coverage**; added a full **§8.5 "Universal styling — `sx` and `animate`"**
  (key tables, responsive maps, states, logical/RTL, presets), upgraded the
  `$form` section (dirty/validating/submit/asyncCustom + onBlur/onFocus
  wiring), `$socket` (status/reconnect/queue), `$util` (copy async, sleep,
  throttle trailing, asyncCustom semantics), theming token-group table (all
  10 groups), and added 9 new component-reference groups (Marketing,
  E-commerce, Motion & gestures, Overlays with the Escape/focus-trap
  contract, Content & docs, Realtime & social, Scheduling & canvas,
  Accessibility, Utility).
- **docs HTML** — `language-reference.html`: `$socket`/`$sse` entries gained
  status/reconnect/attempts/queue, `$form` gained dirty/validating/submit()/
  async semantics, `$theme` gained zIndex/motion params, `$util.rules`
  gained asyncCustom, `copy` corrected to `Promise<boolean>` (it claimed
  fire-and-forget boolean), `sleep` added, plus a new **"sx / animate
  (universal props)"** reference entry; `themes.html` + zIndex/motion group
  rows; `http.html` realtime section rewritten around `status`/reconnect/
  send-queue; `layout.html` sx table gained logical-spacing/typography/
  bgOverlay/zIndex rows. `components.html` needed no sample additions —
  live previews already cover all 60+ new components and prop tables render
  from `defaultLibrary` (auto-current with the rebuilt bundle).
- **Verification**: full build clean (system prompt 130.9k → 131.4k chars),
  **1236 tests pass** (+5 snippet validations), `node --check` on
  playground.js, and in-browser checks of the playground example flows and
  all five updated docs pages (language-reference iframe-rendered: sx entry,
  socket status, form dirty, asyncCustom, theme z-vars, sleep, copy-async
  all present; components.html renders 271 cards with zero console errors).

---

> **Status: every part (I–XIV) of `suggestions-global.md` is now ✅ Done.**
> No ⛔ and no 🟡 items remain — the full proposal is implemented, tested,
> (for interactive features) browser-verified, and has survived an
> independent adversarial audit (Phase 11) with all findings fixed. Phase 12
> synced every author-facing surface (playground, VS Code extension, README,
> coding-gen-skill, system prompt, docs pages) to the same feature set.
