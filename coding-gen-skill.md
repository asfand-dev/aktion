---
name: aktion/coding-gen-skill
description: >-
  Deep authoring knowledge base for **building complete applications** in
  Aktion. Read this when the goal is to ship a full reactive
  product surface (dashboards, CRUD apps, multi-page websites, settings
  consoles, inboxes, admin panels, todo lists, wizards, chat, real-time
  feeds, search, status pages, calendars, docs portals, content studios)
  rather than embed the renderer or answer a one-shot UI question.
  Companion to README.md (integration).
---

# Aktion — Authoring Guide

> **Audience.** You are an LLM authoring code in a host page that has
> mounted `<aktion-app>`. This document teaches the full mental
> model and all the patterns needed to ship apps end-to-end. It assumes
> the basics from [`README.md`](./README.md) and goes deep.
>
> **Use this as the single source of truth.** When in doubt, grep this
> file before writing code. The system prompt sent to you at runtime is
> intentionally compressed — this document is the canonical long form.

## Table of contents

- [0. TL;DR — the rules](#0-tldr--the-rules)
- [0.5. Rich-layout principles](#05-rich-layout-principles)
- [1. Mental model](#1-mental-model)
- [2. Anatomy of a response](#2-anatomy-of-a-response)
- [3. Reactive state](#3-reactive-state)
- [4. Components and lambdas](#4-components-and-lambdas)
- [5. Actions](#5-actions)
- [6. Effects](#6-effects)
- [7. HTTP — `$http({...})`](#7-http--http)
- [8. `$util` — runtime helper namespace](#8-util--runtime-helper-namespace)
- [9. Component reference (by group)](#9-component-reference-by-group)
- [10. JavaScript layer](#10-javascript-layer)
- [11. Routing](#11-routing)
- [12. Globals — `$storage`, `$console`, `$toast`](#12-globals--storage-console-toast)
- [13. Internationalization](#13-internationalization)
- [14. Theming](#14-theming)
- [15. Icons (Font Awesome)](#15-icons-font-awesome)
- [16. Application patterns (recipes)](#16-application-patterns-recipes)
- [17. Anti-patterns](#17-anti-patterns)
- [18. Self-check](#18-self-check)
- [19. Where do I look?](#19-where-do-i-look)

---

## 0. TL;DR — the rules

Internalize these rules and you will write correct, polished programs:

1. **One statement per line.** `name = Expression`. The renderer commits
   each line as it streams in.
2. **`$app(…)` is line one.** Anchor the UI shell so users see structure
   before children arrive. `$app(...)` accepts a single root node, an array
   of nodes, or variadic nodes. Use forward references
   (`$app(Stack([header, list]))`) and define `header`, `list` below it.
3. **`$variables` are the single reactive atom kind.** Declare with
   `$name = value`; read or write with `$name`. There are no tiers — one
   kind of atom for every use case. Inside function bodies (actions/components)
   and `effect` callbacks the assignment operators
   `= += -= *= /= ??= ++ --` are allowed.
4. **HTTP is one function.** `$http({ url, method, body, headers, query, ... })`
   is the only network primitive. Pass a full absolute `url`; `GET` is the
   default `method`; there are no host-wide defaults. It returns a reactive
   bag exposing `.data | .error | .status | .loading | .headers | .lastUpdated`,
   the callables `.refetch()` / `.cancel()`, and a settable `.onDone`
   callback. Re-run a request via `.refetch()` or by wrapping it in an
   `$effect(..., [$dep])`; use `.onDone` to refresh another resource after a
   write. Two same-config variants build on it: `$query({...})` (cached +
   deduplicated reads) and `$mutation({...})` (a deferred write that fires
   only on `.mutate(overrides?)`) — see § 7.
5. **Components are PascalCase functions that MUST `return`.**
   `function Name(args) { … return Expression }` — PascalCase name signals
   a component. Always end with an explicit `return`.
6. **Actions are camelCase functions.** `function name(args) { … }` —
   camelCase name signals an action. MAY `return` a value.
7. **Reach for pattern composites first.** Start with `Hero`, `PageHeader`,
   `SectionHeader`, `Stats`, `Toolbar`, `EmptyState`, `Timeline`,
   `FeatureGrid`, `Testimonial`, `ProfileCard`, `Banner`, `KanbanBoard`,
   `DescriptionList`, `PricingTable`, `StatusDot`, and the **app-shell**
   composites (`AppShell`, `Sidebar`, `SplitView`). They commit a full
   visual section in one line.
8. **One positional argument max per call.** Every component accepts at
   most one positional argument — the canonical primary slot — and every
   other prop goes in an options object:
   - ✅ `Button("Save", { variant: "primary", loading: $isSaving })`
   - ✅ `StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%" })`
   - ❌ `Button("Save", "primary", true)`
9. **`items.map(item => Row(item))` is the value-producing iteration form.**
   `for`/`if`/`switch` are JavaScript **statements** — they don't return
   a value, so they cannot appear on the RHS of `name = …`. Use them
   only inside imperative bodies (`function`, lambda with `{ … }`,
   `effect`). The lambda parameter is block-scoped, just like a `for`
   loop variable.
10. **Pass per-item data to JS via standard parameters.** Lambdas and
    action functions use ordinary JS parameter binding —
    `(id, status) => …` and `function update(id, status) { … }` read
    their arguments by name. There is no `ctx.args` indirection.
11. **Prefer declarative helpers** (`[...spread]`, `$util.filter`, `$util.sort`,
    `.map()`, ternary) over imperative DOM code. Reach for raw
    JavaScript only when neither a `$util` helper nor a native JS
    feature is a clearer fit.
12. **Strings come in three flavours.** `"double"`, `'single'`, and
    `` `backtick` ``. Backticks span lines and don't need escapes — use
    them for multi-line bodies and `${expression}` interpolation.
13. **Use `Column`/`Row`/`Grid` — not raw `Stack`.** `Column([...])` stacks
    vertically, `Row([...])` lays out horizontally (natural widths, centered),
    `Grid([...], { columns })` makes equal columns. Prefer `Grid` for uniform
    tiles; use `Row` for toolbars/rows of differing sizes.
14. **Add status colour everywhere.** `StatCard(..., { trend, delta })`,
    `Badge` variants, `TimelineItem` tone, `Banner` tone,
    `StatusDot(label, { tone })` — colour conveys meaning.
15. **`$storage` and `$console` are always-available globals (lowercase).**
    Use `$storage.set/get/remove/clear` (alias `$storage.local.*`),
    `$storage.session.*`, and `$storage.cookies.*` (with options:
    `expires`, `maxAge`, `path`, `domain`, `secure`, `sameSite`)
    directly. `console.log/error/warn/info/debug` forwards to the host
    console. Both globals follow the standard `obj.method(args)`
    method-call syntax and accept object-literal options. `$toast` is a
    third reserved namespace — `$toast.show(msg, { tone?, duration? })`
    (and `.success/.error/.dismiss/.clear`) drives notifications from a
    reactive `$toast.items` list instead of a hand-managed array.
16. **`pages = $router({ … })` and `NavLink(label, { to })` are always
    available.** The reactive `route.path` / `route.params` /
    `route.query` surface stays live across the whole app; inside a
    matched arm the `params` local holds the captured path segments.
    Router arms are ordinary object properties — separate with `:` and
    commas, use `default:` (not `_`).
17. **Density must match the page type.** Dashboards have 6+ named
    sections, detail pages 5+, settings pages 5+, list pages 5+, landing
    pages 5+. If your draft is short, **add a complementary section**
    (recent activity, status, related items, follow-ups) — never ship a
    sparse response.
18. **Icons are Font Awesome names.** Every `icon` prop expects a Free
    Font Awesome name (no `fa-` prefix) — `"house"`, `"chart-line"`,
    `"sack-dollar"`, `"cart-shopping"`, `"circle-check"`. Optional variant
    prefix: `"regular:star"`, `"brands:github"`. Use
    `Icon(name, { variant, size })` to render a standalone glyph. The CDN
    stylesheet auto-loads — **never emit raw emoji**.
19. **Themes are runtime, not authored.** The host picks a theme via the
    `theme` attribute (`light`, `dark`, `neon`, `pastel`, `glass`,
    `brutalist`, `skyline`) or a partial token map. Authored programs
    **must work on every theme** — never hard-code colours. Use semantic
    props (`tone: "primary"`, `variant: "success"`) and let the theme
    resolve them.
20. **Reactive state survives the response, not the page.** The runtime
    only keeps `$name = value` atoms in memory for the lifetime of the
    `<aktion-app>` element. Host pages persist them via
    `el.serializeState()` / `el.hydrateState()`. Call `$i18n({...})` to
    build a translation bundle (§13).
21. **Prefer ternary `cond ? a : b` and `switch` over nested ternaries.**
    Both evaluate lazily — only the chosen branch renders. Use ternary
    for two-way conditions, `switch` for multi-way dispatch.
22. **Factor repeated trees with `function Name(args) { … return … }`
    declarations.** PascalCase = component, declare once, call anywhere.
    Parameters accept default values; per-instance `$name` declared inside
    the body holds an independent atom per call site. Lambdas
    `(args) => Card(…)` are an alternative for one-off helpers.
23. **Use responsive prop maps for full pages.**
    `Grid(items, { columns: {sm: 1, md: 2, lg: 4}, gap: "l" })` and
    `Stack(children, { direction: {sm: "column", md: "row"} })` work
    out of the box. Plain numbers / strings still work for simple sections.
24. **Self-decorating defaults are real — drop the obvious props.** Several
    components auto-pick the most-likely value when a prop is omitted, so
    the *minimum useful version* already looks rich. Don't fight it:
    - `StatCard("Revenue", { value: "…" })` auto-picks an icon from the
      label (`"Revenue"` → `sack-dollar`, `"Customers"` → `users`).
    - `PageHeader(title)` auto-derives `["Home", title]` as breadcrumbs.
      Pass `breadcrumbs: false` to suppress, or an explicit array to override.
    - `Banner(title, { message: "…", tone: "success" })` auto-picks an
      icon from tone.
    - `Hero(title, { subtitle: "…" })` auto-derives an eyebrow from intent
      keywords.
    - `EmptyState(title)` auto-picks an icon from the title.
    - `Avatar(name)` falls back to a deterministic DiceBear illustration
      (`fallback: "initials"` reverts to the two-letter pill).
    - `LineChart({ data: [...] })` accepts row-shaped shorthand — labels +
      series are derived automatically.
    - `Toolbar({ searchable: true })` auto-mounts a `SearchBar`.

### Quick reference

Everything an LLM might reach for first:

```javascript
// Reactive state — one kind, declare with `$name = value`.
$count = 0
$theme = "dark"
$cart  = []
$total = $util.sum($cart.price)

// Components are PascalCase functions that MUST return.
function UserCard(user, { tone = "default" } = {}) {
  return Stack([
    Avatar(user.name),
    Text(user.role)
  ])
}

// Expression-form control flow — ternary and .map().
priorityTone = (p) => p === "high" ? "danger" : "muted"
greetings    = $users.map(u => UserCard(u))
hint         = $hasError ? Banner("Try again", { tone: "danger" }) : null

// Effects — callback + dependency array.
$effect(() => {
  $save = $http({ url: "https://api.example.com/draft", method: "PUT", body: $draft })
}, [$draft, "debounce(500)"])

// Actions — camelCase functions. Optional `return`.
function markShipped(orderId) {
  $orders = $orders.map(o => o.id == orderId ? {...o, status: "shipped"} : o)
  $ship   = $http({ url: "https://api.example.com/orders/" + orderId + "/ship", method: "POST" })
  return orderId
}

// HTTP — the single primitive. Returns a reactive resource bag.
$orders = $http({
  url:    "https://api.example.com/users/42/orders",
  method: "GET",
  query:  { limit: 10 }
})
// $orders.data | .error | .status | .loading | .headers | .lastUpdated
// $orders.refetch() | $orders.cancel()

// Router — `$router({…})` is a regular function call. `params` is bound
// inside each matched arm (captures from `:id`, `*`).
pages = $router({
  "/":           Dashboard(),
  "/orders/:id": OrderDetail({ id: params.id }),
  default:       NotFound()
})

// Two-way binding is implicit — pass a `$variable` (or a member chain
// rooted at one) and the runtime wires it both ways automatically.
NameField = Input("name", { value: $name })
EmailField = Input("email", { value: $form.email })

// Lambdas.
onSearch = (q) => $query = q

// Outbound CustomEvent.
$emit("order:selected", { id: order.id })

// Internationalisation.
const { t, setCurrentLanguage } = $i18n({
  defaultLanguage: "en",
  currentLanguage: "en",
  translations: { greeting: { en: "Hello, {name}!", fr: "Bonjour, {name}!" } }
})
welcome = t("greeting", { name: $user.name })

// Per-instance state — every Counter() call holds an independent atom.
function Counter(label) {
  $n = 0
  return Stack([
    Text(`${label}: ${$n}`),
    Button("inc", { onClick: () => $n = $n + 1 })
  ])
}
$app(Stack([Counter("A"), Counter("B")]))  // two independent counters

// Content-addressed identity — `key:` survives sibling reorders.
function TaskRow(task) {
  return Stack([Text(task.title), TaskMenu(task.id)], { key: task.id })
}
```

**Standard helper components.** These ship as library components, not
language keywords, to keep the core small:

- `Async(resource, { loading, error, empty, data })` — branches on an
  `$http({...})` resource state.
- `Show(when, { fallback, children })` — sugar over ternary.
- `Portal(children, { target })` — render outside the parent subtree.
- `Redirect(path)` — router-aware navigate-and-unmount.
- `Lazy(loader, { fallback })` — defer children until `loader` resolves.
- `ErrorBoundary(children, { fallback, onError })` — catches descendant
  rendering errors.

**Escape hatches (last resort).** When the standard catalogue cannot
express the markup or styling you need, two primitives are available:

- `HTMLTag(tag, { attributes, children })` — render an allow-listed HTML
  tag with sanitised attributes (`on*` handlers and unsafe URLs are
  dropped).
- `Styles(css)` — inject a `<style>` block scoped to your own
  selectors (payloads with `</style>`, `<script>`, `expression(`,
  `javascript:`, or `@import` are dropped).

Reach for them only after confirming nothing in the standard library
captures the design.

---

## 0.5. Rich-layout principles

LLMs that use this library tend to default to sparse layouts unless
explicitly nudged. **The goal of this section is to make polished, dense,
SaaS-style UIs the default**, matching the quality of hand-crafted
shadcn/ui + Tailwind layouts.

### Pattern-first composition

Before opening a `Stack`/`Card`, scan this checklist:

| If you need…                                | Use this single-line composite                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A page title + breadcrumbs + actions        | `PageHeader(title, { subtitle, breadcrumbs, actions, status })`                                              |
| A sub-section title inside a Card           | `SectionHeader(title, { subtitle, eyebrow, status, actions })`                                                |
| A row of KPIs                               | `Stats([StatCard(...), ...])`                                                                                  |
| A compact inline stat strip (3–6 items)     | `Stats([{label, value, hint, tone}, ...], { layout: "strip" })`                                                |
| Quick-action / category tiles               | `Grid([Tile(label, { icon, value, description, tone, action }), ...], { columns })`                            |
| A filter + actions bar above a list/table   | `Toolbar({ left: [searchControls...], right: [actions...] })`                                                  |
| A polished search input                     | `SearchBar(id, { placeholder, value, shortcut, action })`                                                      |
| A key/value summary on a detail page        | `DescriptionList([DescriptionItem(label, value, { icon })])`                                                   |
| Inline health pip                           | `StatusDot(label, { tone, pulse })`                                                                            |
| Pricing tiers                               | `PricingTable([PricingCard(plan, { price, period, ... })])`                                                    |
| App-level navigation                        | `AppShell(Sidebar(...), [content...], { topbar })`                                                             |
| Master/detail (inbox, file browser)         | `SplitView([primary...], [detail...], { primaryWidth })`                                                       |
| Empty list                                  | `EmptyState(title, { description, icon, action })`                                                             |
| Activity feed                               | `Timeline([TimelineItem(title, { time, description, icon, tone })])`                                           |
| Kanban / task board                         | `KanbanBoard([KanbanColumn(title, { items: [KanbanCard(...)], tone })])`                                       |
| Hero / marketing intro                      | `Hero(title, { subtitle, primary, secondary, eyebrow, highlights, imageSrc, tone })`                           |
| Image-led hero (product, article)           | `Hero(title, { imageSrc, subtitle, eyebrow, caption, actions, tone, height, layout: "cover" })`                |
| Feature highlights                          | `FeatureGrid([FeatureItem(title, { description, icon, tone })])`                                               |
| Product / article preview card              | `MediaCard(title, { imageSrc, description, tags, meta, actions, badge, orientation })`                          |
| Star rating + review count                  | `Rating(value, { max, label, count, size, interactive, halfStep, icon })`                                      |
| Circular progress / completion ring         | `ProgressRing({ value, max, label, caption, tone, size, indeterminate })`                                      |
| Inline notification (inbox / feed item)     | `Notification(title, { message, time, icon, avatarSrc, tone, unread, actions })`                               |
| Person reference in a row / cell            | `PersonChip(name, { role, avatarSrc, size, status, action })`                                                  |
| Inline tip / footnote                       | `Callout(title, { description, icon, variant, compact: true })`                                                |
| Pull quote (not a full testimonial)         | `Quote(text, { cite, tone })`                                                                                  |
| Chat-style message (review, transcript)     | `ChatBubble(author, { body, time, avatarSrc, from, status })`                                                  |
| Centered readable column                    | `Container([content...], { size, maxWidth, padding })`                                                         |
| Center content on both axes                 | `Center([content...], { minHeight })`                                                                          |
| Push siblings to opposite edges in a row    | `Row([a, Spacer(), b])` — or `Row([a, b], { justify: "between" })`                                             |

### Visual hierarchy rules

1. **Status colour for meaning.** Bad: a `Stack` of plain `StatCard`s.
   Good: `StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%", icon: "sack-dollar" })` —
   trend + delta + icon together communicate health at a glance.
2. **Font Awesome icons on every iconable slot.** `StatCard`,
   `FeatureItem`, `TimelineItem`, `Banner`, `KanbanCard`, `Callout`,
   `ListItem`, `Badge`, `BreadcrumbItem`, `SidebarItem` all accept an
   `icon`. Set it to a Free Font Awesome name (no `fa-` prefix) such as
   `"sack-dollar"`, `"chart-line"`, `"house"`, `"cart-shopping"`,
   `"circle-check"`. Optional variant prefix: `"regular:star"`,
   `"brands:github"`. Use the dedicated `Icon(name, { variant, size })`
   component for a standalone glyph. The stylesheet is auto-loaded via
   CDN — **never emit raw emoji**.
3. **Avatar for people, not text.** Author names, assignees, commenters
   render as `Avatar(name, { src, size })` or via `ProfileCard` / `Comment` /
   `PersonChip`.
4. **Group fields inside Cards.** Settings pages are a stack of Cards.
   Each Card opens with a `SectionHeader` (or `CardHeader`) and contains
   a few related `FormControl`s — never a flat list of fields on the page.
5. **Tabs/Drawers for secondary content.** Hide low-priority sections
   behind `Tabs` or a side `Drawer` rather than scrolling forever.
6. **Padding, gap, and rhythm.** Use `gap: "l"` for top-level section
   spacing, `gap: "m"` inside Cards, `gap: "s"` between tightly related
   controls. Wrap each major chunk in a `Card` for visual grouping.

### Density targets (the most common failure)

| Page type             | Min sections | What sections to include                                                                                          |
| --------------------- | :----------: | ----------------------------------------------------------------------------------------------------------------- |
| Dashboard             | **6**        | `PageHeader` + `Toolbar` / filters + `Stats` + chart Card + table/list Card + follow-ups                          |
| Detail / profile      | **5**        | `PageHeader` + `DescriptionList` Card + content Card + activity/timeline Card + related items                     |
| Settings              | **5**        | `PageHeader` + 3+ Section Cards (each with `SectionHeader`) + danger-zone Card                                    |
| Landing / marketing   | **5**        | `Hero` + `FeatureGrid` + (`Testimonial` | `Quote` | `PricingTable`) + closing `Banner`                            |
| Product / article     | **6**        | `Hero` + `Stats` trust strip + spec Card / `DescriptionList` + related `MediaCard` grid + reviews + closing CTA   |
| Pricing               | **5**        | `Hero` + cycle `ToggleGroup` + `PricingTable` + `FeatureGrid` + FAQ `Accordion` + closing `Banner`                |
| Inbox / messaging     | **4**        | `PageHeader` + `SplitView` (`Notification` list + `ChatBubble` thread) + composer (`TextArea` + `Buttons`)        |
| Directory / CRM       | **5**        | `PageHeader` + `Tile` quick-stats + `SearchBar` + filter `ToggleGroup` + `ProfileCard` grid + `Pagination`        |
| List / browse         | **5**        | `PageHeader` + `Toolbar` + (optional `Stats`) + `Table` / `Grid` Card + `Pagination`                               |
| Full app surface      | **4 (in shell)** | `AppShell` wrapping a `Sidebar` + (`PageHeader` + sections)                                                   |
| Empty / zero state    | **3**        | `PageHeader` + `EmptyState` (with CTA) + follow-ups                                                               |

If your response has fewer named sections than the minimum, **add a
complementary section** (related items, recent activity, status,
follow-ups). Plain vertical stacking of two or three components reads
as a wireframe.

### Theme awareness (write tone-first, never colour-first)

The host page chooses one of seven built-in themes (`light`, `dark`,
`neon`, `pastel`, `glass`, `brutalist`, `skyline`) or a partial token
map. **Authored programs must work on every theme** — never hard-code
colours, gradients, or typography. Use semantic props and let the
runtime resolve them.

| Theme        | Vibe                                                                                              | Use for                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `light`      | Crisp default, indigo accent, soft shadows.                                                       | Most business apps, dashboards, settings.                          |
| `dark`       | Standard dark surface, indigo accent.                                                             | Night mode, code-heavy workflows, ops dashboards.                  |
| `neon`       | Cyberpunk-inspired dark mode with magenta/cyan glow, monospace headings, sharp corners.           | Devtools, gaming, music apps, late-night dashboards.               |
| `pastel`     | Soft, friendly, light & rounded. Lavender + mint palette, generous radii, gentle shadows.        | Onboarding, wellness, education, consumer apps.                    |
| `glass`      | Modern glassmorphism — vivid gradient backdrop, frosted translucent surfaces, indigo→cyan accent. | Marketing, product launches, hero pages with imagery.              |
| `brutalist`  | Neo-brutalism — hard 2 px black borders, chunky offset shadows, loud primary, zero gradients.     | Editorial sites, art portfolios, statement landing pages.          |
| `skyline`    | Enterprise cloud-console aesthetic — deep navy primary, cyan accents, calm pale blue bg.         | Admin consoles, B2B portals, infra dashboards.                     |

Rules for theme-friendly authoring:

- **Always pass `variant` / `tone` instead of colour.**
  `Badge("Active", { variant: "success" })`, not `Badge("Active")` with
  manual styling.
- **Stick to semantic palette values** — `"default"`, `"primary"`,
  `"success"`, `"warning"`, `"danger"`, `"info"`. Anything else
  (`"red"`, `"#ff0000"`) will render as the default tone.
- **Use `Icon` as a visual accent**, never as a colour: the icon
  adopts the surrounding tone token.
- **Trust the chart palette.** `Series` colours come from the active
  theme (`chart1`…`chart6`). Never pass a `stroke` / `fill`.
- **Brutalist and neon will collapse if you nest gradients.** Stay
  declarative; the theme adds the visual personality.

### In-script theming with `$theme({...})`

When the user **explicitly asks for a brand or product feel** ("make it
look like GitHub", "use our company colours"), emit a bare `$theme({...})`
statement (no binding needed). The runtime evaluates
the call and writes the token map to the host as CSS custom properties.

```javascript
$theme({
  colors: {
    primary:     "#0969da",
    primaryHover:"#0860c4",
    accent:      "#1f6feb",
    bg:          "#ffffff",
    text:        "#1f2328",
    textMuted:   "#656d76",
    border:      "#d0d7de"
  },
  font: {
    family:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    familyHeading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    weightHeading: "500"
  },
  radius: { button: "6px", input: "6px" }
})
$app(Stack([...]))
```

**Rules:**

- `$theme(...)` expects the **structured form** — top-level groups must
  be one of `colors`, `radius`, `font` (plus the metadata keys `name`
  and `direction`). Flat-shape keys
  (`$theme({ colorPrimary: ... })`) raise a schema-validator error.
- Put `$theme({...})` **before** the `$app(...)` line so the
  tokens are visible when the rest of the program streams in.
- Stick to documented keys. The runtime ignores unknown keys inside a
  group, so typos fail silent.
- **Don't double-pay tokens.** If `$theme(...)` already sets `colors.primary`,
  do NOT also pass `"primary"` overrides on individual components.
- Removing the `$theme(...)` line snaps the UI back to the base theme.

### Anti-patterns (never ship these)

| Wrong                                                                       | Right                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Single `Card([CardHeader, Text])` for a dashboard request                   | Use the **dashboard recipe** in §16 Pattern C                                                |
| Vertical `Stack` of `StatCard`s                                             | `Stats([StatCard(...), ...])`                                                                |
| Raw `Stack([...], { direction: "row" })` for a toolbar/row                  | `Row([...], { gap, justify })` (clearer; natural widths, centered)                          |
| `Row`/`Stack` with wrapping for uniform tiles                               | `Grid(items, { columns, gap })`                                                              |
| Vertical `Stack` of `Text("Label: " + value)` lines on a detail page       | `DescriptionList([DescriptionItem(label, value, { icon })])`                                 |
| Table with no `Toolbar` above it                                            | Wrap in `Card([SectionHeader(...), Toolbar({...}), Table(...)])`                             |
| Flat form on the page                                                       | Group `FormControl`s inside Cards opened by `SectionHeader`                                 |
| Settings with no sectioning                                                 | A `Stack` of Cards, one per concern (General, Notifications, Billing, Danger zone)          |
| Plain text for status / priority / count                                    | `Badge` or `StatusDot`                                                                      |
| No nav for a multi-page surface                                             | `AppShell(Sidebar(...), [...])` — sidebar stays visible across content                       |
| Empty list rendered as bare grey text                                        | `EmptyState(title, { description, icon, action: Button(...) })`                              |
| Hand-rolled progress bar inside a Stack                                     | `Progress(value, { max, label, tone })` or `ProgressRing({...})`                             |

---

## 1. Mental model

Aktion is a **streaming-first declarative DSL** whose surface syntax is
a strict subset of standard JavaScript — every Aktion program is
valid JavaScript. A program is a flat list of `name = expression`
statements. The renderer evaluates them lazily, re-parses the stream
on every chunk, and silently treats undefined references as empty —
so a partially-streamed program renders progressively from the top.

**JavaScript on top.** Because Aktion is a strict subset, everything
the language doesn't model **is just JavaScript**:

- `Array.prototype.map / filter / reduce / sort / find / slice / …`,
  destructuring (`const [a, b] = pair`), spread (`[...xs, ...ys]`),
  template literals (`` `Hello ${name}` ``), optional chaining
  (`obj?.deep?.field`), nullish coalescing (`a ?? b`), default
  parameters, rest parameters, computed object keys.
- The **full operator set**: arithmetic, comparison, logical, plus
  bitwise / shift (`& | ^ ~ << >> >>>`) and the relational keywords
  `instanceof` / `in`. Every compound-assignment form works too
  (`+= -= *= /= %= **= &&= ||= ??= &= |= ^= <<= >>= >>>=`).
- **Destructured parameters** in both `function` declarations and
  lambdas: `function Card({ title, tone = "info" })`,
  `function head([first, ...rest])`, `({ a, b }) => a + b`.
- The **full JavaScript global surface** is available everywhere. The
  standard library — `Math`, `JSON`, `Object`, `Array`, `Number`, `String`,
  `Boolean`, `Date`, `Map`, `Set`, `RegExp`, `Promise`, plus `parseInt` /
  `parseFloat` / `isNaN` / `isFinite` / `encodeURIComponent` / … — works
  directly (`Math.max(a, b)`, `JSON.stringify(x)`) or with `new`
  (`new Date(0).getTime()`, `new Map([[k, v]])`). The timer globals
  `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` are
  runtime-tracked and cleared automatically on re-plan/disconnect. Every
  other host global also resolves by name — browser dialogs (`alert`,
  `confirm`, `prompt`), Web APIs (`fetch`, `URL`, `URLSearchParams`, `Blob`,
  `FormData`, `crypto`, `navigator`, `localStorage`, `atob`/`btoa`, `Intl`,
  `BigInt`, …), and `window` / `document`. Author declarations and built-in
  components always win over a same-named global. Still prefer `$http({...})`
  over raw `fetch` for reactive data, and keep timers/listeners inside
  `$effect(...)` so they're torn down on unmount.
- Inside **action bodies, effect callbacks, and lambda bodies**, you
  may also call browser APIs directly — `navigator.clipboard`,
  `window.open`, `document.addEventListener`, `setTimeout`,
  `crypto.randomUUID`, etc. Prefer the runtime-tracked timer globals for
  `setTimeout` / `setInterval` so they're torn down with the program.
- The `@`-functions (§8) and library components (§9) cover the cases
  where pure JS would be verbose — but you are never *forced* to use
  them when a one-liner of JS will do.

Three identifier conventions cooperate:

- **Plain bindings**: `name = expression` (or `let name = …`) — a
  non-reactive alias. Reading it never subscribes. Within a single
  render it is a **stable, mutable slot**: re-reads return the same
  value/reference (so `name.push(x)` and `name = [...name, x]` stick),
  and it is re-seeded from its initialiser on the next render. Use it
  as a scratch container during a render; reach for a `$state` atom
  when you need the value to persist across renders or drive reactivity.
- **Reactive atoms**: `$name = value` — a single tracked cell. Reading
  `$name` subscribes the surrounding component / effect; writing inside
  a function body or effect callback notifies subscribers.
- **Reserved built-ins**:
  - `aktion` (the UI root, required first line).
  - `theme` (optional in-script `$theme({...})` brand override).
  - `route` (router-owned reactive surface — `route.path`,
    `route.params`, `route.query`, `route.pattern`,
    `route.navigate("/path")`).

Two function conventions cooperate at the top level:

- `function PascalName(args) { … return Expression }` — a component.
  First-class UI primitive with optional defaults and per-instance state.
  MUST end with an explicit `return`.
- `function camelName(args) { … }` — an action. Imperative side-effect
  block triggered by events. MAY `return` a value.

Effects are declared via the `$effect(callback, deps)` function call:

- `$effect(() => { … }, [$atom, "mount", "every(N)", "debounce(N)"])` —
  declarative background work with dependencies. Dependencies can be
  `$atom` references or string qualifiers: `"mount"`, `"unmount"`,
  `"every(N)"`, `"debounce(N)"`, `"throttle(N)"`.

Everything else (`$http({...})`, `$router({...})`, `$theme({...})`,
`$i18n({...})`, `Toast(...)`, `Stack(...)`) is a regular function /
component call.

### Three layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1 — Declarative tree                                      │
│   Composition of components. Pure data. Re-computed every       │
│   render. Lazy: each `name = Expr` is a function of the current │
│   state, evaluated only when something downstream needs it.     │
│                                                                 │
│       $app(Stack([header, body]))                               │
│       header = PageHeader("Hi", { subtitle: "Welcome" })        │
│       body = Card([Text($message)])                             │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ depends on
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2 — Reactive state + HTTP                                 │
│   `$variables` (read/written by humans and by JS) and           │
│   `$http({...})` resource bags. A change to either               │
│   schedules a re-render.                                        │
│                                                                 │
│       $message = "Hello"                                        │
│       $data    = $http({ url: "https://api.x.dev/metrics" })     │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ updated by
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3 — Actions & effects                                     │
│   Action functions run on click / submit / follow-up.           │
│   Effect callbacks run on mount and re-run when triggers fire.  │
│   Both can update state, call tools, dispatch messages          │
│   — closing the loop back to L2.                                │
│                                                                 │
│       function refresh() { $data.refetch() }                    │
│       btn = Button("Refresh", { onClick: refresh })             │
└─────────────────────────────────────────────────────────────────┘
```

**Why this matters.** Most app behaviour is expressible in L1 + L2 alone.
Reach for L3 only when the change isn't expressible as a pure data
transformation (timers, fetches you control, focus, animation, clipboard,
keyboard shortcuts, audio).

**Rendering is reconciliation, not re-creation.** Every state change
re-runs L1 to produce a fresh tree, but the runtime diffs the new tree
against the live DOM instead of replacing it.

---

## 2. Anatomy of a response

### Statement shape

```javascript
identifier = Expression
$identifier = Expression            // reactive state declaration
```

- `identifier` is bare: `kebab-case`, `snake_case`, or `lowerCamelCase`.
- `Expression` is any Aktion expression (component call, value, ternary,
  member access, etc.).
- `$identifier = …` declares a reactive atom.

### Streaming-friendly ordering

The renderer commits one statement at a time as text streams in:

1. **`$app(…)` first.** Always.
2. **Function declarations** that the `$app(...)` root references.
3. **State declarations** (`$days = "7"`).
4. **Leaf data** (long arrays, big strings, generated tables) on their
   own trailing lines.

Example:

```javascript
$app(Stack([hero, kpis, chart, footer]))

hero    = Card([CardHeader("Q3 Performance", { subtitle: "Revenue and growth" })])
kpis    = Stats([
  StatCard("Revenue", { value: `$${data.revenue}`, trend: "up", delta: "+12%" }),
  StatCard("Growth",  { value: data.growth_pct, trend: "up" })
])
chart   = LineChart({ labels: months, series: [series] })
footer  = Text("Generated by Aktion", { variant: "small", tone: "muted" })

$days   = "90"
$data   = $http({ url: "https://api.example.com/perf", query: { days: $days } })
months  = ["Jul", "Aug", "Sep"]
series  = Series("Revenue", { values: [120000, 145000, 162000] })
```

### Forward references (hoisting)

Names are resolved lazily — every identifier reference re-evaluates the
binding when read. That's why `$app(Stack([greeting]))` works even
when `greeting = Card(...)` is defined later.

**Hoisting and streaming together.** Because identifiers are resolved
lazily and the renderer commits each statement as soon as it arrives,
calling `$app(...)` first lets the page shell appear instantly:

1. The first chunk parses `$app(Stack([hero, kpis, chart]))` — the
   reconciler installs an empty `Stack` and three skeleton placeholders
   for the named children.
2. As the rest of the program streams in, each child binding
   (`hero = ...`, `kpis = ...`, `chart = ...`) replaces its skeleton
   in place.
3. Users see the layout structure first and content arrive
   progressively — never a blank screen waiting for the closing brace.

Forward references to *unknown* names render as a `Skeleton` shimmer
instead of an error, so a half-streamed program is always renderable.

### Comments

The parser strips two comment styles:

- `// rest of line` — line comment.
- `/* … */` — block comment, can span multiple lines.

Prefer self-documenting identifiers and leave comments out of your
output. Each comment costs tokens that would be better spent on actual
UI.

---

## 3. Reactive state

### One kind, one sigil

Aktion has **one reactive atom kind**. There is no
`$state`, `$persist`, `$session`, `$shared`, or `$computed` keyword —
every reactive cell is declared and read with the same surface:

```javascript
$count = 0
$user  = { name: "Ada", role: "Engineer" }
$todos = []
$theme = "dark"
```

### Sigil contract

- `count` (no sigil) is a plain binding — **not** tracked, **not**
  reactive.
- `$count` (with sigil) is a tracked atom — reading subscribes the
  reader (component / derived value / effect); writing notifies subscribers.

### Fine-grained reactivity (path-level)

Subscriptions are keyed to the **path** you read, not the whole atom.

- Reading `$user.name` subscribes to `user.name`. A write to a sibling
  (`$user.role = …`) does **not** re-render, recompute, or re-fire it;
  replacing the whole atom (`$user = …`, an ancestor) or writing a
  descendant does. Sibling paths never interfere.
- Object fields track field-by-field; reading into an **array**
  (`$rows[i]`, the `$rows.field` pluck) or through a **dynamic key**
  (`$obj[$key]`) subscribes at the array/container, so any element change
  re-renders. Prefer reading the exact field (`$user.name`) for the
  tightest updates; read the whole object (`$user`) only when you need it.
- The same rule drives computed values and effect deps:
  `$effect(() => save($user.name), [$user.name])` fires on `name` changes,
  not `role`. No selectors, no special syntax — just read the path.
- **Per-component re-rendering.** A component re-executes only when its own
  inputs change — its args (props) or a `$state` path its body read — like
  `React.memo` / Solid, but automatic. Split a screen into focused
  components (`ShowName($user.name)`, `ShowAge($user.age)`) and each updates
  independently. Args are compared shallowly, so (as in React) a fresh
  inline-lambda prop each render makes the child re-render; hoist the
  handler to a stable binding to skip it. Name case does **not** matter —
  `App` and `app` both seed `$state` once and re-render the same way.
- **Full-re-render caveat (important).** Path-tracking only applies to
  top-level `$name = value` atoms. The hook setters (`$state` / `$memo` /
  `$ref` / `$reducer`), `$http` / `$query` / `$mutation` lifecycle changes,
  `setTimeout` / `setInterval` ticks, `$effect` writes, and `$emit` cannot be
  path-tracked and therefore trigger a **full re-render** (every component
  body re-executes; the morph reconciler still patches only the changed DOM).
  Prefer plain `$name` atoms for hot-path app state; reach for hooks when you
  need per-instance isolation and can accept the full-re-render cost.

### Assignment rules

- **Render position** (top-level bindings, component body output, prop
  values): assignment is forbidden. Use `$name = …` declarations to seed.
- **Inside function bodies and effect callbacks**:
  `= += -= *= /= ??= ++ --` are all allowed against any `$name` atom.
- **Nested writes are first-class.** Member-target assignments
  (`$user.name = "Alex"`, `$cart.items[0].qty += 1`) are accepted.

### Component-scoped state

A `$name = value` declared **inside** a component function body is
per-instance. Two `Counter()` siblings each hold their own `$count`.

```javascript
function Counter(label) {
  $n = 0
  return Stack([
    Text(`${label}: ${$n}`),
    Button("inc", { onClick: () => $n = $n + 1 })
  ])
}

$app(Stack([Counter("A"), Counter("B")]))  // independent counters
```

### Hooks — `$state`, `$memo`, `$ref`, `$reducer`, `$id`, custom `$name`

A function whose name starts with `$` is a **hook** (React's `use*`
convention). Hooks are the composable form of per-instance state. The five
built-ins mirror React exactly:

- `$state(initial)` → `[value, setValue]` (like `useState`). `setValue(v)`
  replaces the value; `setValue(prev => v)` derives it from the previous
  value. `initial` is evaluated once, on first render.
- `$memo(() => compute, [deps])` → a cached value (like `useMemo`) that
  recomputes only when a dependency changes (shallow `Object.is`). Omit the
  deps array to recompute every render.
- `$ref(initial)` → a stable `{ current }` box (like `useRef`). Its identity
  persists across renders and writing `ref.current = …` does **not**
  re-render — use it for a DOM node (via `OnMount`), a timer id, or a
  previous value you want to remember without driving the UI.
- `$reducer((state, action) => next, initial)` → `[state, dispatch]` (like
  `useReducer`). `dispatch(action)` runs the pure reducer and re-renders
  when the result changes — the clean way to manage many related
  transitions instead of juggling several `$state` setters.
- `$id(prefix?)` → a stable, unique id string for the instance's lifetime
  (like `useId`) — for `for` / `id` / `aria-labelledby` wiring that must not
  collide when a component renders more than once.

```javascript
function Counter() {
  const [count, setCount] = $state(0)
  const label = $memo(() => `Count: ${count}`, [count])
  return Stack([Text(label), Button("+1", { onClick: () => setCount(c => c + 1) })])
}

$app(Counter())
```

Declare custom hooks with `function $name(...)`. The body runs **inline
in the calling component's hook scope**, so its `$state` / `$memo` calls
attach to that component — the React custom-hook model:

```javascript
function $useToggle(initial) {
  const [on, setOn] = $state(initial)
  return { on: on, toggle: () => setOn(v => !v) }
}

function Panel() {
  const t = $useToggle(false)
  return Stack([
    Button(t.on ? "Hide" : "Show", { onClick: t.toggle }),
    t.on ? Card([Text("Revealed")]) : null
  ])
}
```

**Rules of hooks** (inherited from React): call hooks unconditionally and
in a stable order at the top level of a component / hook body — never
inside an `if`, loop, or callback (slots are matched by call order across
renders). Hook state **resets when the instance leaves the tree**; a
remounted component starts from its initial value again. `$state`,
`$memo`, `$ref`, `$reducer`, and `$id` are reserved names. Prefer the hook
form when a component owns
local state with explicit setters; the bare `$name = value` form above is
the lighter option when an atom is written directly by the component's
actions.

### Computed values

There is no dedicated `$computed` keyword. Just compute:

```javascript
$cart  = []
$total = $util.sum($cart.price)
$open  = $util.filter($todos, "done", "==", false)
```

### Global stores — `$store({...})`

For state shared across distant components (cart, current user, theme,
notifications), declare a **store** at the top level. Non-function entries
are reactive state; function entries are methods that receive the store
handle `s` first. Read state as `store.field` (fine-grained), call methods as
`store.method(args)`, and mutate inside a method with `s.field = …`. The
handle is an app-global singleton with reference-stable methods — every
component talks to it directly, so there is **no prop drilling**.

```javascript
cart = $store({
  items: [],                                          // state
  count: (s) => s.items.length,                       // getter → cart.count()
  total: (s) => $util.sum(s.items.map(i => i.price)),  // getter → cart.total()
  add: (s, item) => { s.items = [...s.items, item] }, // action → cart.add(item)
  clear: (s) => { s.items = [] },
})

function CartBadge() { return Badge(`${cart.count()} items`) }  // reads the store directly
function ClearButton() { return Button("Clear", { onClick: cart.clear }) }
```

Reads are fine-grained and per-component (changing `cart.items` re-renders
only components that read `items`), and two-way binding works against a store
field (`Input(value: form.draft)`). Use a `$store` for shared state; use a
component's local `$state` / `$name = …` for state one component owns.

### URL-synced state

URL state lives on the router:

- `route.path` — current path (read-only).
- `route.params.id` — path parameter; reactive.
- `route.query.tab` — query string; reactive.
- `route.navigate("/path")` — imperative navigation; only valid
  inside function bodies or effect callbacks.

### Persistence

The runtime keeps `$name` atoms in memory for the lifetime of the
`<aktion-app>` element. Host pages persist them via:

```javascript
const snapshot = el.serializeState();
sendToClient({ programText: el.response, state: snapshot });
target.loadSnapshot({ programText, state: snapshot });
```

For ad-hoc per-tab / per-browser persistence from inside the script,
use the `$storage` global (§12):

```javascript
// Sync a single $variable to localStorage manually.
$effect(() => {
  $storage.set("draft", $draft)
}, [$draft, "debounce(500)"])

$effect(() => {
  $draft = $storage.get("draft") ?? ""
}, ["mount"])
```

### Setup bindings

- `const { t, setCurrentLanguage, getCurrentLanguage } = $i18n({ defaultLanguage, currentLanguage, translations })` — build a translation bundle (§13).
- `$theme({ colors, radius, font })` brands the UI (§14).

---

## 4. Components and lambdas

### Component declarations

```javascript
function UserCard(user, { tone = "default" } = {}) {
  $hover = false
  return Card([
    Avatar(user.name, { size: "md" }),
    Text(user.name, { variant: "large-heavy" }),
    Text(user.role, { tone: "muted" }),
    Badge(tone, { tone: tone })
  ])
}
```

**The five component rules.** Whenever you author a component, the
runtime enforces these:

1. **PascalCase name.** The leading capital letter is what marks the
   function as a component. `function Counter(...)` is a component;
   `function counter(...)` is an action.
2. **Single positional argument.** Take at most one positional
   parameter — typically the title, primary value, or children array.
   Every other prop goes in a destructured trailing object.
3. **Trailing options object.** Named props always sit in a single
   trailing `{ }` object literal — both at the call site
   (`Button("Save", { variant: "primary" })`) and in the parameter
   list (`function Card(title, { children = [], padding = "m" } = {})`).
   Use destructuring with `=` defaults to assign fallbacks.
4. **Explicit `return`.** The last statement must be
   `return <expression>` — never let a component fall through
   implicitly. Without `return`, the component renders as nothing.
5. **Per-instance state lives in the body.** Any `$name = value`
   declared inside the function body is private to that instance — two
   `Counter()` siblings each get their own `$count`. The initializer
   runs once on first mount; re-renders preserve whatever value the
   user or an action has written.

### Call sites

```javascript
$app(Stack([
  UserCard($alice),
  UserCard($bob, { tone: "primary" }),
  UserCard($carol, { tone: "warning" })
]))
```

**Named-props placement.** The named-props object literal is canonically
placed *after* the positional arguments (`Button("Save", { variant: "primary" })`).
The runtime also accepts a *leading* props object for components that
take children as the trailing positional
(`Grid({ columns: 12 }, [Card1(), Card2()])`); both forms route through
the same slot mapping. If a user component's trailing object has no key
matching any of the component's parameters, it is forwarded positionally
— so an opaque "slots" or data bag can be passed without surprises
(`function Card(title, slots) { … }` called as
`Card("Hello", { footer: Text("…") })`).

**Why the trailing object rule.** Library components like `Button`,
`Card`, and `Stack` have many optional props (`variant`, `tone`,
`loading`, `disabled`, `icon`, `size`, `onClick`, …). Listing them
all positionally would be unreadable and error-prone. The trailing
object lets every call site read like English:

```javascript
// ✅ Self-documenting — props say what they mean.
StatCard("Revenue", {
  value:  "$48k",
  trend:  "up",
  delta:  "+12%",
  icon:   "sack-dollar"
})

// ❌ Multi-positional — order matters, meaning is hidden.
StatCard("Revenue", "$48k", "up", "+12%", "sack-dollar")
```

The schema validator emits a hard error for the multi-positional form
and suggests the trailing-object rewrite.

### Local helpers — lambda form

Use a lambda binding for one-off helpers:

```javascript
priorityTone = (p) => p === "high" ? "danger" : p === "med" ? "warning" : "muted"
rowFor       = (item) => Stack([Badge(item.label, { tone: priorityTone(item.priority) }), Text(item.title)])
list         = $items.map(item => rowFor(item))
```

### Content-addressed identity — `key:`

Every call site accepts a universal `key:` option. The renderer uses it
as the instance suffix instead of source location:

```javascript
function TaskRow(task) {
  $expanded = false
  return Stack([
    Button(task.title, { onClick: () => $expanded = !$expanded }),
    $expanded ? Text(task.description) : null
  ], { key: task.id })
}

list = $todos.map(t => TaskRow(t))
```

---

## 5. Actions

An action is a camelCase function. Declare at the top level (or inside
a component body); invoke from any event-handler prop (`onClick`,
`onChange`, `onSubmit`, `onClose`, `onSelect`, …) or as an expression.

```javascript
function save(item) {
  $items = [...$items, item]
  $save  = $http({ url: "https://api.example.com/save", method: "POST", body: { item: item } })
  $emit("saved", { id: item.id })
}

submitBtn = Button("Save", { onClick: save })
```

### Pass declarations directly to array helpers

Both PascalCase **component** and camelCase **action** declarations can
be passed by name to any array helper (`.map`, `.filter`, `.find`,
`.some`, `.every`, `.forEach`, `.sort`, `.reduce`, …) — the runtime
resolves the bare identifier to a synchronous callable with the
standard `(item, index, array)` signature, so there's no need to wrap
in an arrow:

```javascript
function Fruit(name) { return Badge(name) }
function long(name) { return name.length > 5 }
fruits = ["Apple", "Banana", "Orange"]

$app(Grid(fruits.filter(long).map(Fruit)))   // ✅ equivalent to .map(n => Fruit(n))
```

### Body grammar

Inside an action body the imperative surface is small:

- Assignments: `$x = newValue`, `$x += 1`, `$x = { ...$x, field: v }`.
- `$http({ ... })` — fire a request.
- `$emit("event-name", { detail })` — dispatch a `CustomEvent` on the
  host element.
- `route.navigate("/path")` — programmatic navigation.
- `$storage.set(...)`, `console.log(...)` — global namespaces (§12).
- Standard JS control flow: `if`/`switch`/`for`.
- `return` — optionally yields a value to the caller.

### Optimistic updates — `$optimistic(() => { … })`

Wrap optimistic writes in the `$optimistic` builtin — an ordinary
`$`-prefixed function call (valid JS, no special keyword). It **snapshots
every reactive atom before the callback runs** and **rolls the store back
automatically if the callback throws (or the promise it returns rejects)**.
This is the built-in pattern for optimistic UI: write the change
immediately so the UI feels instant, then let a failed validation / request
revert it for you.

```javascript
$todos = []
function addTodo(text) {
  $optimistic(() => {
    if (text == "") throw new Error("empty")        // guard → rolls back
    $todos = [...$todos, { id: $todos.length + 1, text: text, pending: true }]
    $save = $http({ url: "/todos", method: "POST", body: { text: text } })
  })
}
```

If the callback throws, `$todos` (and every other atom) snaps back to its
pre-call value — no manual rollback bookkeeping. Atoms created inside the
callback are cleared on rollback; a write made **outside** `$optimistic` is
never reverted.

### Optional `return`

Actions MAY include a `return` statement:

```javascript
function greet(name) {
  return "Hello, " + name
}
$hello = greet("Ada")
```

### Inline lambdas — the short form

For trivial handlers, skip the function declaration entirely:

```javascript
incBtn   = Button("+", { onClick: () => $count = $count + 1 })
resetBtn = Button("Reset", { onClick: () => { $count = 0; $message = "" } })
copyBtn  = Button("Copy", { onClick: () => navigator.clipboard.writeText("hi") })
```

### Common action recipes

**List mutation:**

```javascript
function add() {
  $todos = [...$todos, { id: $todos.length + 1, text: $draft, done: false }]
  $draft = ""
}

function toggle(id) {
  $todos = $todos.map(t => t.id == id ? { ...t, done: !t.done } : t)
}

function remove(id) {
  $todos = $util.filter($todos, "id", "!=", id)
}
```

**Optimistic update with rollback:**

```javascript
function shipOrder(orderId) {
  let prev = $orders
  $orders = $orders.map(o => o.id == orderId ? {...o, status: "shipped"} : o)
  $ship   = $http({ url: "https://api.example.com/orders/" + orderId + "/ship", method: "POST" })

  $effect(() => {
    if ($ship.error) { $orders = prev }
  }, [$ship])
}
```

**Form submission:**

```javascript
$title = ""
$body  = ""

function submit() {
  if (!$title) { return }
  $create = $http({
    url:    "https://api.example.com/posts",
    method: "POST",
    body:   { title: $title, body: $body },
    headers: { "Content-Type": "application/json" }
  })
  $title = ""
  $body  = ""
  $posts.refetch()
}
```

**Navigation:**

```javascript
function openDetail(id) {
  route.navigate("/items/" + id)
}

function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer")
}
```

---

## 6. Effects

`effect` attaches side effects to a component or top-level binding.
The signature is `$effect(callback, dependencies)`:

```javascript
$effect(() => {
  // body
}, [...dependencies])
```

A dependency entry is one of:

- `$atom` — re-run when the named reactive atom changes.
- `"mount"` — run once when the surrounding scope mounts.
- `"unmount"` — run once when it unmounts.
- `"every(N)"` — re-run every N milliseconds.
- `"debounce(N)"` / `"throttle(N)"` — wrap the body with a
  trailing-edge rate limit.

Dependencies can be combined freely:

```javascript
function LiveClock() {
  $now = $util.now()
  $effect(() => { $now = $util.now() }, ["every(1000)"])
  return Text($util.formatDate($now, "time"))
}

$effect(() => {
  $results = $http({
    url:   "https://api.example.com/search",
    query: { q: $query, page: $page }
  })
}, [$query, $page, "debounce(250)"])
```

`$effect(() => { ... })` with no second argument is equivalent to
`$effect(() => { ... }, ["mount"])`.

### Scope — top-level vs. component-local

An `effect` can live in **two** places:

| | Top-level effect | Component-local effect |
| --- | --- | --- |
| **Location** | Next to other top-level bindings. | Inside a component function body. |
| **Mounted** | Once, when the program first runs. | Once per component instance. |
| **Unmounted** | When the program is replaced. | When the instance disappears. |

**Top-level effect:**

```javascript
$app(App())
$value = 10

$effect(() => {
  $value = $value + 1
}, ["every(1000)"])

function App() {
  return Box([Text("Value: " + $value)])
}
```

**Component-local effect:**

```javascript
function App() {
  $value = 10
  $effect(() => {
    $value = $value + 1
  }, ["every(1000)"])
  return Box([Text("Value: " + $value)])
}
$app(App())
```

### Cleanup

Use `cleanup(fn)` inside an effect callback to register teardown for
intervals, listeners, observers:

```javascript
$effect(() => {
  const onKey = (e) => {
    if (e.key === "k" && e.metaKey) $emit("toggle-palette", {})
  }
  document.addEventListener("keydown", onKey)
  cleanup(() => document.removeEventListener("keydown", onKey))
}, ["mount"])
```

### Common effect recipes

**Sync to storage:**

```javascript
$effect(() => {
  $storage.set("draft", $draft)
}, [$draft, "debounce(500)"])
```

**Periodic refresh:**

```javascript
$effect(() => {
  $orders.refetch()
}, ["every(30000)"])
```

**Cross-cutting analytics on route changes:**

```javascript
$effect(() => {
  $emit("track", { event: "page_view", path: route.path })
}, [route.path])
```

---

## 7. HTTP — `$http({...})`

There is exactly one HTTP primitive: the `$http({ ... })` function. Every
call is **self-contained** — there are NO host-wide defaults, no
`$http = $http({ baseUrl })` setter. Pass a full absolute `url` to each
call.

### Config options

| Key | Notes |
|---|---|
| `url` | **Required.** Full absolute URL (e.g. `"https://api.example.com/todos"`). |
| `method` | `"GET"` (default), `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`, … |
| `query` | Object serialised into the URL querystring (`{ limit: 5 }` → `?limit=5`). |
| `headers` | Plain object of request headers. |
| `body` | Request body. Objects are JSON-encoded (adds `Content-Type: application/json` unless you set one). |
| `…rest` | Any other `fetch` option (`credentials`, `mode`, `cache`, `redirect`, …) is forwarded verbatim. |

### Reads (GET / HEAD / OPTIONS)

```javascript
$orders = $http({
  url:    "https://api.example.com/users/" + $userId + "/orders",
  method: "GET",                          // GET is the default — can be omitted
  query:  { limit: 5, status: "open" },   // → ?limit=5&status=open
  headers:{ "X-Tenant": $tenant }
})
```

A request fires once when its binding mounts. To re-run it, call
`$orders.refetch()`, or wrap the call in an `$effect(..., [$dep])` so it
re-issues when a dependency changes:

```javascript
$effect(() => {
  $results = $http({ url: "https://api.example.com/search", query: { q: $query } })
}, [$query, "debounce(300)"])
```

### Writes (POST / PUT / PATCH / DELETE)

```javascript
function saveOrder(payload) {
  $save = $http({ url: "https://api.example.com/orders", method: "POST", body: payload })
  $orders.refetch()   // refresh the list after a write
  $emit("assistant-message", { message: "Saved." })
}
```

### Reactive resource shape

```javascript
$orders.data         // parsed response body (null until resolved)
$orders.error        // null on success
$orders.status       // HTTP status code, e.g. 200
$orders.loading      // true while in-flight
$orders.headers      // response headers as a plain object
$orders.lastUpdated  // ms-epoch of last success
$orders.refetch()    // re-issue the request
$orders.cancel()     // abort in-flight request
$orders.onDone = fn  // callback fired each time the request settles
```

### `onDone` — react when a request settles

Assign `onDone` after creating a resource. It fires once every time the
request completes (the initial load and every `refetch()`, on both success
and error), receives the resource bag as its argument, and never fires for
a superseded or `cancel()`led request. It's the cleanest way to refresh a
list after a write:

```javascript
$patch = $http({
  url:    endpoint + "/" + todo.id,
  method: "PATCH",
  body:   { isCompleted: !todo.isCompleted }
})

$patch.onDone = () => {
  $todos.refetch()
}
```

### `Async(resource, …)` wrapper

```javascript
view = Async($orders, {
  loading: LoadingState("Loading orders…"),
  error:   ErrorState("Couldn't fetch orders"),
  empty:   EmptyState("No orders yet"),   // shown when data is null or an empty array
  data:    Table([Col("Item", $orders.data.title), Col("Total", $orders.data.total, { format: "currency" })])
})
```

### `$query({...})` — cached + deduplicated reads

Same config as `$http`, but the resource is **cached and deduplicated**. Two
calls with the same `key` (or the same derived method + url + query + body)
share one in-flight request and one reactive bag — so the same data fetched
from several components hits the network once. Pass `ttl` (ms) to auto-refetch
when the cached data is older than the TTL.

```javascript
$users = $query({ url: "https://api.example.com/users", key: "users", ttl: 30000 })
// elsewhere — reuses the cached bag, no second request:
$alsoUsers = $query({ url: "https://api.example.com/users" })
```

The bag is identical to `$http` (`.data` / `.loading` / `.error` /
`.refetch()` / …). `key` and `ttl` are query-layer-only and are never sent to
`fetch`. Use `$query` for read-heavy data shown in multiple places; use plain
`$http` for one-off requests.

### `$mutation({...})` — deferred-fire writes

`$http` fires on mount, which is wrong for create/update/delete that should
run on a click. `$mutation({...})` is the **deferred** variant: it does
nothing until you call `.mutate(overrides?)`. Method defaults to `POST`.

```javascript
$save = $mutation({ url: "https://api.example.com/todos" })
$save.onDone = () => $todos.refetch()
...
Button("Add", { onClick: () => $save.mutate({ body: { title: $title } }) })
```

`.mutate(overrides)` shallow-merges `overrides` over the base config (set
`body` / `query` / `url` / `method` per call) and resolves with the response
body. The bag exposes `.loading` / `.error` / `.data`, a `.reset()` to clear
it, and the same `.onDone` settle hook as `$http`.

---

## 8. `$util` — runtime helper namespace

Aktion exposes a single global `$util` object whose methods may appear
anywhere in an expression. Every method is **pure** — no side effects,
no I/O — and the namespace is extensible: new helpers can be added to
`$util` over time without changing the language. Many helpers overlap
with native JavaScript (`arr.length`, `arr.filter(…)`,
`Math.round(…)`); prefer the native form when it reads cleanly and
reach for `$util` for field-based comparators, locale-aware
formatting, or skeleton ranges.

### Aggregation

| Function           | Purpose                                |
| ------------------ | -------------------------------------- |
| `$util.count(arr)`      | Number of items.                       |
| `$util.sum(arr)`        | Sum of numeric items.                  |
| `$util.avg(arr)`        | Mean of numeric items.                 |
| `$util.min(arr)`        | Smallest numeric value.                |
| `$util.max(arr)`        | Largest numeric value.                 |
| `$util.first(arr)`      | First item or `null`.                  |
| `$util.last(arr)`       | Last item or `null`.                   |

### Numeric

| Function                          | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `$util.round(n, decimals?)`            | Round to N decimal places.             |
| `$util.abs(n)` / `$util.floor(n)` / `$util.ceil(n)` | Standard math.                     |
| `$util.clamp(n, min, max)`             | Constrain into a range.                |
| `$util.pow(base, exp)` / `$util.sqrt(n)` / `$util.log(n)` | Standard math.               |
| `$util.random()`                       | Random number in `[0, 1)`.             |

### Array shape

| Function                                    | Purpose                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| `$util.filter(arr, "field", "op", value)`        | Keep items matching a comparator.                               |
| `$util.sort(arr, "field", "asc" \| "desc")`      | Stable sort by field.                                           |
| `$util.find(arr, "field", "op", value)`          | First match (or `null`).                                        |
| `$util.groupBy(arr, "field")`                    | `{ groupKey: [items…] }`.                                       |
| `$util.slice(arr, start?, end?)`                 | Standard slice.                                                 |
| `$util.reverse(arr)`                             | Reversed copy.                                                  |
| `$util.unique(arr, "field"?)`                    | Deduplicate.                                                    |
| `$util.partition(arr, "field", "op", value)`     | Split into `[matching, rest]`.                                  |
| `$util.keyBy(arr, "field")`                      | `{ keyValue: item }` lookup map.                                |
| `$util.chunk(arr, size)`                         | Split into fixed-size groups.                                   |
| `$util.flatten(arr, depth?)`                     | Flatten nested arrays (depth 1 by default).                     |
| `$util.zip(...arrays)`                           | Pair up by index, padding short lists with `null`.             |
| `$util.range(start, end, step?)`                 | Inclusive integer range.                                        |
| `$util.repeat(value, n)`                         | Repeat a value N times.                                         |

### Object shape

| Function                                    | Purpose                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| `$util.pick(obj, ["a", "b"])`                    | Keep only the listed keys.                                      |
| `$util.omit(obj, ["a", "b"])`                    | Drop the listed keys.                                           |
| `$util.merge(target, ...sources)`                | Deep-merge plain objects (inputs untouched).                   |
| `$util.cloneDeep(value)`                         | Independent deep copy (arrays / objects / dates).              |

### Formatting

| Function                                                            | Purpose                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `$util.format(value, mode?, options?)`                                   | Locale-aware number formatter. Modes: `"number"`, `"currency"`, `"percent"`, `"compact"`. |
| `$util.formatDate(value, format?)`                                       | Formats a date. Named modes: `"relative"`, `"date"`, `"time"`, `"datetime"`, `"iso"`. |
| `$util.plural(n, "singular", "plural"?)`                                 | Returns `"1 order"` / `"2 orders"`.                                        |

### Date / time

| Function                       | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `$util.now()`                       | Current moment as epoch ms.                |
| `$util.today()`                     | Today's date at midnight, ISO string.      |
| `$util.addDays(date, n)`            | Shift a date by N days.                    |
| `$util.addHours(date, n)`           | Shift a date by N hours.                   |
| `$util.diffDays(start, end)`        | Whole-day difference.                      |
| `$util.startOfWeek(date)`           | UTC Sunday 00:00:00 for the week.          |
| `$util.endOfMonth(date)`            | Last moment of the calendar month.         |

### String

| Function                                                                     | Purpose                              |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| `$util.capitalize(s)` / `$util.lowercase(s)` / `$util.uppercase(s)` / `$util.titlecase(s)`      | Standard case operations.            |
| `$util.case(value, "camel" \| "snake" \| "kebab" \| "pascal")`                    | Re-case a value.                     |
| `$util.join(arr, sep?)`                                                           | Join with separator.                 |
| `$util.split(s, sep?)`                                                            | Split on separator.                  |
| `$util.trim(s)` / `$util.startsWith(s, p)` / `$util.endsWith(s, p)` / `$util.contains(s, p)`   | Standard string ops.                 |
| `$util.replace(s, search, replacement?)`                                          | Replace all occurrences.             |
| `$util.substring(s, start, end?)`                                                 | Standard substring.                  |
| `$util.match(s, pattern)`                                                         | Boolean regex match.                 |

### Array shortcuts (not functions)

- `$rows.length` — element count.
- `$rows.first` / `$rows.last` — first or last element.
- **Array pluck**: `$rows.title` returns `[row.title for each row]`.

### Control-flow — strict JavaScript subset

Aktion follows JS exactly: `if`, `switch`, `for`, `while`, and `try`
are **statements** — they don't produce a value and cannot appear on
the RHS of an assignment. Use the JavaScript-native expression forms
to pick values:

```javascript
// Ternary — two-way conditional value.
active = $tab == "billing" ? billingPanel : overviewPanel

// Ternary chain — multi-way dispatch as a single expression.
tone = $value > 0 ? "success" : ($value < 0 ? "danger" : "muted")

// .map() — collect a rendered row per item. Lambda param is block-scoped.
rows = $items.map(item => Row(item, { key: item.id }))
list = $todos.map(item => TaskRow(item))

// .filter().map() chains read fluently.
visible = $todos.filter(t => !t.done).map(t => TaskRow(t))
```

For multi-way dispatch that doesn't fit a ternary chain, **wrap a
`switch` statement inside a function** and `return` per arm. Or use a
plain lookup object:

```javascript
function panelFor(tab) {
  switch (tab) {
    case "list":  return ListView($items)
    case "grid":  return GridView($items)
    case "table": return Table($items)
    default:      return EmptyState("Pick a view")
  }
}
view = panelFor($tab)

// Object-as-switch idiom — terse for label / colour maps.
toneFor = { ok: "success", warn: "warning", err: "danger" }
tone    = toneFor[$status] ?? "muted"
```

Inside function / lambda / effect bodies the **full statement-form
control flow** is available — exactly as in JS: `if`/`else`,
`switch`/`case`/`break`/`default`, `for (let x of xs)`,
`for (let key in obj)`, `for (let i = 0; i < n; i += 1)`, `while`,
`do { … } while (cond)`, `break`/`continue`,
`try`/`catch`/`finally`, `throw`. Mutate `$state` or local `let` arrays
inside the body; the body itself produces no value (use `return` to
yield one from a function).

Bodies may be either a brace-delimited block or a single statement —
the same shape as JS allows. `if (!ok) return` and
`while (q.length > 0) q.pop()` both work.

```javascript
function submit(payload) {
  if (!payload.email) return                              // single-statement body
  for (let tag of payload.tags) $tags = [...$tags, tag]   // single-statement body
  switch (payload.kind) {
    case "draft": $drafts = [...$drafts, payload]; break
    default:      $records = [...$records, payload]
  }
}

function safeFetch(_) {
  try   { $resp = $http({ url: "https://api.example.com/data" }) }
  catch (err) { $error = err }
  finally     { $loading = false }
}

function poll() {
  let attempts = 0
  do {
    attempts = attempts + 1
    $log = [...$log, "try " + attempts]
  } while (attempts < 3 && !$ready)
}
```

### Line continuations (JS ASI)

Any expression operator can appear at the start of the next line and
the parser keeps building the same expression. Use this to break up
long method chains, ternaries, and logical expressions:

```javascript
// Method chain split across lines.
filteredTodos = $todos
  .filter(t => t.category == $filter)
  .filter(t => t.title.includes($searchQuery))

// Ternary split across lines.
tabUI = $util.count(filteredTodos) == 0
  ? EmptyState()
  : Stack(filteredTodos.map(TodoRow))

// Logical operators on the continuation line.
filtered = attractions.filter(a =>
  ($selectedDistrict == "All") &&
  (a.name.includes($searchQuery))
)
```

Continuation-eligible tokens: `.`, `?.`, `?`, `:`, `&&`, `||`, `??`,
`==` / `!=` / `===` / `!==`, `<` / `>` / `<=` / `>=`, `instanceof`,
`+`, `-`, `*`, `/`, `%`, `**`, plus the bitwise / shift operators
(`& | ^ << >> >>>`) and `in`. (`(`/`[` after a newline still terminate
the previous statement — same as JS.)

### Destructuring, spread, computed keys

```javascript
// Destructuring in let / const / var.
let [first, second, ...rest] = arr
let { name, role = "guest", ...other } = user

// Destructured PARAMETERS (function declarations + lambdas).
function Card({ title, tone = "info" }) { return Badge(title, { tone }) }
function head([first, ...rest]) { return first }
sum = ({ a, b }) => a + b

// Spread in array / object literals and function calls.
$cart   = [...$cart, item]
$user   = { ...$user, role: "admin" }
result  = fn(...args)

// Computed property keys.
$obj = { [$dynamic]: value, fixed: "ok" }
```

### Operators & JS standard-library globals

```javascript
// Arithmetic / comparison / logical, plus bitwise & shift.
flags = READ | WRITE          // 6
masked = perms & 0xF
toggled = state ^ 1
high = value >> 8
inv = ~mask                   // bitwise NOT
// Relational keywords.
isDate = d instanceof Date
hasKey = "name" in $user
// Compound assignment (all JS forms).
$count += 1; $bits <<= 2; $opts ??= {}

// Safe JS stdlib — call directly or with `new`.
biggest = Math.max(...$scores)
json    = JSON.stringify($user)
keys    = Object.keys($config)
when    = new Date().getTime()
seen    = new Set($ids).size
```

### Increment / decrement & `async` / `await`

`i++`, `++i`, `i--`, `--i` all work. Postfix returns the OLD value
(`let prev = i++`); prefix returns the NEW value (`let next = ++i`).

`async function name(…)` is accepted as a no-op modifier in front of a
function declaration. `await` works in both statement and expression
position inside action / effect bodies — the runner unwraps thenables
automatically:

```javascript
async function loadUser(id) {
  let user = await $http({ url: "https://api.example.com/users/" + id }).data
  $current = user
  return user
}
```

**Anti-patterns the parser rejects** (each has a clean JS replacement):

| Anti-pattern | Replace with |
| --- | --- |
| `x = if (cond) { a } else { b }` | `x = cond ? a : b` |
| `x = for (let r of rows) { Row(r) }` | `x = rows.map(r => Row(r))` |
| `x = switch (v) { case "a": A; … }` | ternary chain, lookup object, or `function pickX(v) { switch (v) { … } }; x = pickX(v)` |

### Responsive prop maps

`Grid(items, { columns: {sm: 1, md: 2, lg: 4}, gap: "l" })` — 1 column
on mobile, 2 on tablet, 4 on desktop. Breakpoints:

- `base` — less than 640px (mobile).
- `sm` — ≥ 640px.
- `md` — ≥ 768px.
- `lg` — ≥ 1024px.
- `xl` — ≥ 1280px.

---

## 9. Component reference (by group)

> Below is a curated list. Every component declared in
> [`src/library/index.ts`](./src/library/index.ts) is part of the
> default library.

### Layout

`Column`, `Row`, `Center`, `Stack`, `StackItem`, `Grid`, `GridItem`,
`Box`, `Container`, `Spacer`, `Card`, `CardHeader`, `CardFooter`,
`Separator`, `Tabs`, `TabItem`, `Accordion`, `AccordionItem`, `Modal`,
`Drawer`, `Steps`, `AspectRatio`, `ScrollArea`, `Sticky`,
`ResizablePanels`, `MasonryGrid`.

**Reach for three primitives first — they cover ~90% of layouts:**

- `Column([...], { gap, align })` — stack children top→bottom. The default
  page body and card body. Children stretch to full width.
- `Row([...], { gap, align, justify })` — lay children left→right at their
  natural width, vertically centered. Toolbars, button rows, label+value
  pairs, nav. Use `justify: "between"` to push items to the edges, or drop a
  `Spacer()` between them. Set `grow: true` for equal-width children.
- `Grid([...], { columns, gap })` — equal columns. Omit `columns` for
  auto-fit (wraps as many ≥`minChildWidth` columns as fit — best for KPI /
  card walls). Always prefer `Grid` over a wrapping `Row` for uniform tiles.

Notes:

- `aktion` MUST resolve to a top-level container (`Column`, `Container`,
  `AppShell`, `Card`, or a user component returning one of those).
- Wrap each major chunk in a `Card` for visual grouping.
- `Center([...], { minHeight })` centers content on both axes — spinners,
  empty states, hero CTAs. Add `minHeight: "60vh"` to center in a tall area.
- 12-column / sidebar layouts: `Grid([GridItem(side, { span: "1/4" }),
  GridItem(main, { span: "3/4" })])`. Any `GridItem` child turns the
  12-track grid on; fractions `"1/2"`…`"1/12"` (or numbers 1–12) set spans.
- Make one `Row` child expand with `StackItem(child, { grow: 1 })` (e.g. a
  search input beside a fixed button).
- `Stack([...], { direction: {base: "column", md: "row"} })` is the escape
  hatch ONLY when the direction itself must change across breakpoints.
- `Container(children, { size })` centers a wide page within a comfortable
  max-width (sm/md/lg/xl/full).
- `Box(children, { padding, background, border, maxWidth })` is a plain
  spacing/surface wrapper when a `Card` is too heavy.

### Content

`Text`, `Image`, `Icon`, `Badge`, `BadgeList`, `Callout`,
`Quote`, `CodeBlock`, `Skeleton`, `Spinner`, `Markdown`, `Kbd`.

Notes:

- `Text(value, { variant, tone, style })` renders inline text.
- `Badge(label, { variant, icon, size })` for pills;
  `BadgeList(["a","b","c"], { variant, size })` for arrays.
- `Icon(name, { variant, size })` for a standalone Font Awesome icon.
- For anchors / links, reach for `Link(label_or_child, { to, href, external })`
  from the Behaviour wrappers section — it accepts either a plain string
  or a wrapped component and supports both router-aware (`to`) and plain
  (`href`) navigation.

### Forms

`Form`, `FormControl`, `FormSection`, `FieldSet`, `ValidationSummary`,
`Input`, `TextArea`, `PasswordInput`, `MaskedInput`, `MentionInput`,
`TagInput`, `Select`, `SelectItem`, `Combobox`, `MultiSelect`,
`Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Switch`,
`ToggleGroup`, `Button`, `Buttons`, `SearchBar`, `Slider`, `NumberInput`,
`ColorPicker`, `DatePicker`, `DateRangePicker`, `TimePicker`,
`DateTimePicker`, `FileUpload`, `PinInput`, `MultiStepForm`.

Notes:

- Pass a `$variable` as `value:` for two-way binding.
- Every input also accepts an optional `onChange(value)` callable that
  fires with the freshly-read value on every change (use it to debounce
  a search, persist a setting, or kick off an HTTP call beyond a bare
  state write). Shape of `value`: `string` for text inputs / pickers,
  `boolean` for `Checkbox` / `Switch`, `number` for `Slider` /
  `NumberInput`, `string[]` for `MultiSelect` / `TagInput`,
  `{name: checked}` for `CheckBoxGroup`, `{from, to}` for
  `DateRangePicker`, `FileList` for `FileUpload`.
- Prefer `Switch` over `Checkbox` for settings.
- `SearchBar(id, { placeholder, value, shortcut })` for filter fields.
- `FormSection(label, children, { helper })` for related fields.

### Data

`Table`, `Col`, `DataGrid`, `List`, `ListItem`, `StatCard`, `Stats`,
`Sparkline`, `Tile`, `Progress`, `ProgressRing`, `Pagination`, `Tree`,
`TreeNode`, `CalendarView`, `ComparisonTable`, `InfiniteList`.

Notes:

- Build columns with array pluck: `Col("Title", data.rows.title, { format, align })`.
- Columns can render **any component** — action buttons, badges, links,
  avatars — not just text. The simplest form is to map each value to a
  component directly in the `values` array — `render` is not required:

  ```text
  Table([
    Col("Order ID",  orders.id),
    Col("Customer", orders.customer),
    Col("Status",   orders.map(o => Badge(o.status))),
    Col("Actions",  orders.map(o => Button("View", { onClick: () => open(o.id), size: "sm" })))
  ], { sticky: true })
  ```

  Equivalent long form using `render` (handy when you need the row index
  or want to keep `values` as raw rows):
  `Col("", $rows, { render: (r, i) => Button("Edit", { onClick: () => edit(r.id), size: "sm" }) })`.
  Both `values`-as-components and `render` may return a component, a
  string, or an array of either.
- Make a whole column clickable (pointer + keyboard) with
  `onClick: (value, index) => …` — e.g. `Col("Name", $rows.name, { onClick: (name) => open(name) })`.
- Both `render` and `onClick` work in `Table` and `DataGrid`.
- `DataGrid` adds sortable headers, filter chips, row selection,
  pagination, and an `onRowClick: (index) => …` for whole-row clicks.

### Charts

`BarChart`, `LineChart`, `PieChart`, `RadarChart`, `ScatterChart`,
`Histogram`, `Heatmap`, `Gauge`, `Series`.

Notes:

- Series via `Series("Name", { values: [...numbers] })`.
- Chart colours come from theme tokens. Never pass manual colours.

### Feedback & media

`Avatar`, `AvatarGroup`, `PersonChip`, `Tooltip`, `HoverCard`, `Popover`,
`Rating`, `Toast`, `VideoPlayer`, `AudioPlayer`, `Carousel`, `Gallery`,
`Lightbox`, `Map`.

### Navigation

`Breadcrumb`, `BreadcrumbItem`, `Navbar`, `NavbarItem`, `TopBar`,
`NavLink`, `Pagination`.

### Menus

`DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `ContextMenu`.

### Chat

`SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`,
`ActionLink`, `ChatBubble`.

### Patterns

`Hero`, `PageHeader`, `SectionHeader`, `Toolbar`, `EmptyState`,
`Timeline`, `TimelineItem`, `ActivityLog`, `FeatureGrid`, `FeatureItem`,
`MediaCard`, `Testimonial`, `ProfileCard`, `Comment`, `Banner`,
`Notification`, `InboxPanel`, `OnboardingChecklist`, `KanbanBoard`,
`KanbanColumn`, `KanbanCard`, `DescriptionList`, `DescriptionItem`,
`StatusDot`, `PricingTable`, `PricingCard`, `Stats`, `Tile`,
`PersonChip`, `LoadingState`, `ErrorState`, `SuccessState`, `Tour`,
`Spotlight`.

### App shell

`AppShell`, `Sidebar`, `SidebarSection`, `SidebarItem`, `SplitView`.

Notes:

- `SidebarItem(label, { icon, to, badge })` — pass `to` for router
  navigation and the item auto-derives its `active` state from
  `route.path` (no need to thread it manually). `action` still works
  for arbitrary click handlers and runs in addition to `to`-based
  navigation.

### Editors

`RichTextEditor`, `CodeEditor`.

### Advanced UI

`IconButton`, `CommandPalette`, `FilterChips`, `FieldRepeater`,
`VirtualList`, `QueryBuilder`, `DiffViewer`, `JsonTree`, `Gantt`,
`Truncate`, `InlineEdit`, `NotificationBell`.

### Helpers

`Async`, `Show`, `Portal`, `Redirect`, `Lazy`, `ErrorBoundary`.

### Behaviour & styling wrappers

`OnClick`, `OnMouse`, `OnKeyboard`, `OnFocus`, `OnIntersect`, `OnMount`,
`Css`, `Link`.

These wrappers attach **behaviour** (click / mouse / keyboard /
focus / intersection / lifecycle) or **styling** (class / inline style)
onto any component without forcing every primitive to grow another prop.
They render the child via a transparent wrapper (`display: contents`) so
the visual tree stays identical — only the event / styling layer
changes.

Notes:

- `OnClick(child, { onClick, disabled?, stopPropagation? })` — makes
  any component clickable / tappable. Click events fire on touch
  devices too, so a single handler covers both. The wrapper is
  keyboard-activatable (Enter / Space) for accessibility. Don't wrap
  `Button` / `IconButton` — they already expose `onClick`.
- `OnMouse(child, { enter?, leave?, hover?, move?, down?, up?, click?,
  doubleClick?, contextMenu?, scroll?, wheel?, drag?, drop?, dragStart?,
  dragEnd?, dragEnter?, dragLeave?, dragOver?, draggable?, passiveScroll? })`
  — attaches mouse / pointer / drag listeners. Pass only the events
  you need; unused props install no listener. Set `draggable: true`
  to make the wrapper itself draggable. Scroll / wheel listeners
  default to `{ passive: true }` so smooth scrolling stays smooth.
- `OnKeyboard(child, { onKeyDown?, onKeyUp?, onKeyPress?, focusable? })`
  — attaches keyboard listeners. Focusable by default; pass
  `focusable: false` when the child is already focusable.
- `OnFocus(child, { onFocus?, onBlur? })` — tracks focus moving into
  or out of a subtree (uses bubbling `focusin` / `focusout`).
- `OnIntersect(child, { onEnter?, onLeave?, onChange?, threshold?,
  rootMargin?, once? })` — IntersectionObserver wrapper for lazy-load
  sentinels, infinite-scroll triggers, impression analytics, and
  reveal-on-scroll animations. `onChange` receives `{visible, ratio}`.
- `OnMount(child, { onMount?, onUnmount? })` — the DOM-ref / lifecycle
  wrapper, and the **only** sanctioned way to touch a raw DOM node.
  `onMount(node)` fires once, on a microtask after the wrapped element is
  attached; `onUnmount(node)` fires when it leaves the tree. Use it to
  measure or focus an element, or to hand the node to an imperative
  library (a chart, a map, a rich-text editor). Stash the node in a
  `$ref(...)` so later renders / cleanup can reach it.
- `Css(child, { style?, class? })` — merge raw class tokens and inline
  style declarations onto the child. Use ONLY when the standard
  component props can't express the styling. Prefer `Box` / `Stack` /
  `Grid` props for layout and `$theme(...)` for tokens.
- `Link(label_or_child, { to?, href?, external?, variant? })` —
  anchor primitive. The positional accepts either a string label or
  a wrapped component. Pass `to` for client-side router navigation
  (no reload) and `href` (with `external: true` for outbound links)
  for plain anchors.

```javascript
// Clickable card → opens a detail page
$app(OnClick(Card([
  CardHeader("Order #4821", { subtitle: "$1,240 · 3 items" }),
  Text("Shipped from Berlin · arrives Mon", { tone: "muted" })
]), { onClick: () => route.navigate("/orders/4821") }))

// Lazy-load sentinel for infinite scrolling
sentinel = OnIntersect(Skeleton({ variant: "card" }), {
  onEnter: () => $items.loadMore(),
  once: true
})

// Drop zone using standard HTML5 drag-and-drop
dropZone = OnMouse(Card([Text("Drop files here")]), {
  dragOver: (e) => e.preventDefault(),
  drop: (e) => { e.preventDefault(); $files = e.dataTransfer.files }
})

// Custom class / one-off styling without breaking out of the component
highlighted = Css(Card([Text("Featured")]), {
  class: "highlight",
  style: "border-color: #f59e0b; box-shadow: 0 0 0 2px #fde68a;"
})

// Wrap a component as a router-aware link
profileLink = Link(PersonChip("Ada Lovelace", { role: "Lead engineer" }), {
  to: "/people/ada"
})
```

When to reach for what:

- Need a clickable surface? → `OnClick`. Need a clickable surface that
  is also an `<a href>`? → `Link`.
- Need a real `<button>`? → `Button` / `IconButton` (don't wrap them
  in `OnClick`).
- Need drag-and-drop? → `OnMouse` with `dragStart` / `dragOver` /
  `drop`. Mark the source draggable with `draggable: true`.
- Need infinite scroll? → `OnIntersect({ onEnter: loadMore, once: true })`
  on a sentinel at the bottom of the list.
- Need a custom CSS class or one-off style? → `Css`. Need theme tokens
  or sweeping styles? → `$theme(...)` or `Styles` + a selector.

### Escape hatches — last-resort raw HTML / CSS

The standard catalogue covers ~99% of cases. When you genuinely need
markup or styling that no component captures, two primitives are
available:

- **`HTMLTag(tag, { attributes?, children? })`** — render an
  allow-listed HTML element (`div`, `span`, `section`, `article`,
  `figure`, `figcaption`, `details`, `summary`, `mark`, `cite`, …).
  Attributes are sanitised — `on*` handlers, `style` strings
  containing `expression(`, and `href`/`src` values starting with
  `javascript:` are dropped silently.
- **`Styles(css)`** — inject a `<style>` block into the shadow root.
  Payloads containing `</style>`, `<script>`, `expression(`,
  `javascript:`, or `@import` are dropped silently. Scope selectors
  to a custom class to avoid leaking into library components.

```javascript
$app(Stack([
  Styles(`
    .hero-callout {
      background: linear-gradient(135deg, #6366f1, #10b981);
      color: white;
      padding: 24px;
      border-radius: 12px;
    }
    .hero-callout h2 { margin: 0 0 8px; font-size: 22px; }
  `),
  HTMLTag("div", { attributes: { class: "hero-callout" }, children: [
    HTMLTag("h2", { children: [Text("Custom block")] }),
    Text("Use HTMLTag + Styles only when the standard catalogue cannot capture the design.")
  ]})
]))
```

**Rules of thumb:**

- Always try a standard component first (`Banner`, `Hero`, `Callout`,
  `Card`, …).
- Use `Styles(...)` only for selectors you own (custom classes).
  Never override library component selectors directly — themes will
  fight you.
- Both primitives are safe: the sanitiser strips dangerous payloads
  rather than throwing, so a malformed escape hatch can never break
  the page.

---

## 10. JavaScript layer

Aktion programs ARE JavaScript. The entire surface syntax is standard JS,
so there is no separate "escape hatch" — all browser APIs are directly
accessible inside function bodies and effect callbacks.

### Available globals inside action / effect / lambda bodies

Two globals (beyond `window` and the usual browser APIs) are recognised
by the runtime:

- `$emit("name", detail?)` — dispatches a `CustomEvent` on the
  `<aktion-app>` host element. Reserved names: `assistant-message`,
  `error`, `route-change`. Hosts listen with
  `el.addEventListener("name", ...)`.
- `cleanup(fn)` — register teardown for the surrounding effect /
  component. Fires on dependency re-run, unmount, or `clear()`.

The other always-available bindings (also documented in §12 and §11)
are `$storage` (localStorage / sessionStorage / cookies), `$console`,
`route` (the router handle), and your own reactive `$atom`s.

### Common recipes

**Clipboard:**

```javascript
function copyShareLink() {
  navigator.clipboard.writeText(window.location.href)
  $emit("assistant-message", { message: "Link copied" })
}
```

**Keyboard shortcuts:**

```javascript
$effect(() => {
  const onKey = (e) => {
    if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
      $paletteOpen = true
      e.preventDefault()
    }
  }
  document.addEventListener("keydown", onKey)
  cleanup(() => document.removeEventListener("keydown", onKey))
}, ["mount"])
```

**Live clock:**

```javascript
function LiveClock() {
  $now = $util.now()
  $effect(() => {
    const id = setInterval(() => { $now = Date.now() }, 1000)
    cleanup(() => clearInterval(id))
  }, ["mount"])
  return Text($util.formatDate($now, "time"))
}
```

**HTTP-driven fetch:**

```javascript
function loadOrders() {
  $orders = $http({ url: "https://api.example.com/orders", query: { limit: 10 } })
}
```

**File upload via `FileUpload`:**

```javascript
$status = "idle"

function upload(files) {
  $status = "uploading"
  const form = new FormData()
  for (let file of files) { form.append("files", file) }
  await fetch("/api/upload", { method: "POST", body: form })
  $status = "done"
}

picker = FileUpload("upload", { label: "Drop files", onSelect: upload })
```

The CSP note: effect callbacks and action functions are evaluated with
`new Function(...)` which requires `'unsafe-eval'` if you embed
`<aktion-app>` behind a Content Security Policy.

---

## 11. Routing

The router is a plain function call. `$router({ "/path": ... })` returns
the matched arm's evaluated value — assign the result to any binding.

```javascript
pages = $router({
  "/":             Dashboard(),
  "/orders":       OrdersPage(),
  "/orders/:id":   OrderDetail({ id: params.id }),
  "/settings/*":   SettingsArea({ rest: params._ }),
  default:         NotFound()
})

$app(AppShell(MainSidebar(), pages, TopBar()))
```

### Path patterns

- **Literal segments:** `"/"`, `"/about"`, `"/settings/profile"`.
- **Parameter segments:** `"/users/:id"`. Read inside the arm with
  `params.id` (or `route.params.id` from elsewhere).
- **Trailing wildcard:** `"/docs/*"`. Remainder lands in `params._`.
- **Default arm:** `default: NotFound()` is the catch-all.

### Inside an arm body

- `params` is bound to the matched route's path captures.
- Use `route` for cross-cutting reactive reads.

### Hash vs history URLs (host concern, not your code)

The same `$router({…})` / `NavLink` / `route.navigate(...)` code works in
both URL strategies — the strategy is chosen by the host via the
`router-mode` attribute on `<aktion-app>` (`"hash"`, the default, or
`"history"` for clean `/about` URLs). Never hard-code `#/…` prefixes in
`to` / `navigate(...)` — always pass a clean path (`"/orders/42"`) and let
the runtime render it correctly for the active mode.

### Reactive surface

- `route.path` — current path (read-only).
- `route.params.id` — path parameter; reactive.
- `route.query.tab` — query string; reactive.
- `route.pattern` — the pattern that matched.
- `route.navigate("/path")` — imperative navigation.

### `NavLink` companion

`NavLink(label, { to, variant, exact, icon })` reads `route.path` and
dispatches navigation on click:

```javascript
nav = Stack([
  NavLink("Home",      { to: "/", exact: true, icon: "house" }),
  NavLink("Dashboard", { to: "/dashboard", icon: "chart-line" }),
  NavLink("Settings",  { to: "/settings", icon: "gear" })
], { direction: "column", gap: "xs" })
```

### Sub-routes (layout-preserving)

```javascript
function SettingsArea() {
  inner = $router({
    "/settings/profile":       ProfilePane(),
    "/settings/billing":       BillingPane(),
    "/settings/notifications": NotificationsPane(),
    default:                   ProfilePane()
  })
  return Stack([SettingsSidebar(), inner], { direction: "row", gap: "l" })
}

pages = $router({
  "/":           Dashboard(),
  "/settings/*": SettingsArea(),
  default:       NotFound()
})
```

---

## 12. Globals — `$storage`, `$console`, `$toast`

These namespace globals are always in scope — no import, no declaration.
`$storage` and `$console` follow standard JS `obj.method(args)` method-call
syntax with object-literal options; `$toast` is the imperative notification
manager (below).

### `$storage` — browser storage

```javascript
// localStorage is the default; `$storage.local` is its alias.
$storage.set("name", "John")
$name = $storage.get("name")
$storage.remove("name")
$storage.clear()

// Per-tab sessionStorage.
$storage.session.set("draft", $draft)
$draft = $storage.session.get("draft")

// Cookies — options as an object literal.
$storage.cookies.set("user", "John", { expires: 7, path: "/", domain: "example.com", secure: true, sameSite: "Lax" })
$user = $storage.cookies.get("user")
$storage.cookies.remove("user", { path: "/" })
$storage.cookies.clear()
```

**Notes:**

- Non-string values round-trip through `JSON.stringify` / `JSON.parse`;
  missing keys return `null`.
- Cookie options: `expires` (days, `Date`, or ISO string), `maxAge`
  (seconds), `path`, `domain`, `secure`, `sameSite`.
- Failures (quota exceeded, disabled storage, malformed JSON) are
  swallowed silently — perfect for partial-stream renders in
  privacy / SSR contexts.

### `$console` — host console forwarder

```javascript
console.log("Hello", $user)
console.error("Failed", $error)
console.warn("Deprecated path")
console.info("Route changed", route.path)
console.debug({ days: $days, count: $count })
```

Both globals can be used inside function bodies, effect callbacks,
and inline lambdas.

### `$toast` — imperative notifications

A third reserved namespace. Instead of hand-managing a `$toasts = [...]`
array (push on show, splice on dismiss, a timer per entry), `$toast` owns the
lifecycle:

```javascript
$toast.show("Saved!", { tone: "success" })   // returns an id; auto-dismisses after 4000ms
$toast.error("Could not save", { duration: 0 })  // 0 = sticky until dismissed
$toast.success(msg)  $toast.info(msg)  $toast.warning(msg)   // tone shortcuts
$toast.dismiss(id)   // remove one
$toast.clear()       // remove all
```

Render the reactive `$toast.items` list with the `Toasts` / `Toast`
components — the manager owns the timer, so each `Toast` is just a view:

```javascript
function save() {
  $save = $http({ url: "https://api.example.com/todos", method: "POST", body: { title: $title } })
  $save.onDone = () => { if ($save.error) $toast.error("Save failed"); else $toast.success("Saved") }
}

toaster = Toasts(map($toast.items, t =>
  Toast({ title: t.title, message: t.message, tone: t.tone, onClose: () => $toast.dismiss(t.id) })))
```

Each `$toast.items` entry is `{ id, message, title?, tone, duration, createdAt }`.

---

## 13. Internationalization

Call `$i18n({...})` to build a translation bundle. Destructure `t`,
`setCurrentLanguage`, `getCurrentLanguage` — or keep the bundle as an
instance and call its methods.

```javascript
const { t, setCurrentLanguage, getCurrentLanguage } = $i18n({
  defaultLanguage: "en",
  currentLanguage: "fr",
  translations: {
    orders_title:   { en: "Recent orders",      fr: "Commandes récentes"     },
    orders_greeting:{ en: "Hello, {name}!",     fr: "Bonjour, {name}!"       },
    items_count:    { en: "{count} items",      fr: "{count} objets"         }
  }
})

Text(t("orders_title"))
Text(t("orders_greeting", { name: $userName }))
Text(t("items_count",    { count: 5 }))
```

- `t(key, vars?)` looks up `translations[key][currentLanguage]`,
  falls back to `translations[key][defaultLanguage]`, then to the bare
  `key`. Placeholders use `{name}` syntax.
- `setCurrentLanguage(lang)` switches the active language on the bundle.
- `getCurrentLanguage()` returns the active language tag.

Reactive language switching — drive `currentLanguage` from a `$state`
atom so the bundle rebuilds when the user picks a new language:

```javascript
$locale = $storage.get("locale") ?? "en"

function setLocale(next) {
  $locale = next
  $storage.set("locale", next)
}

const { t } = $i18n({
  defaultLanguage: "en",
  currentLanguage: $locale,
  translations: { hi: { en: "Hi", fr: "Salut", de: "Hallo" } }
})

picker = Select("locale", { items: [
  SelectItem("en", "English"),
  SelectItem("fr", "Français"),
  SelectItem("de", "Deutsch")
], value: $locale, onChange: setLocale })

greeting = Text(t("hi"))
```

---

## 14. Theming

### Runtime themes (host-side)

The host page chooses one of seven built-in themes via the `theme`
attribute or `el.setTheme(...)`. Authored programs should be
theme-neutral.

### In-script branding with `$theme({...})`

When the user **explicitly asks for a brand feel**, emit:

```javascript
$theme({
  colors: {
    primary:    "#635bff",
    bg:         "#0a0a23",
    surface:    "#10103a",
    text:       "#ffffff"
  },
  radius: { md: "0.5rem", button: "999px" },
  font:   { family: "Inter, sans-serif", familyHeading: "Inter, sans-serif" }
})

$app(AppShell(...))
```

### Token groups (structured form is mandatory)

| Group          | Tokens                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| `colors`       | `bg`, `bgSubtle`, `surface`, `surfaceMuted`, `border`, `borderSubtle`, `text`, `textMuted`, `primary`, `primaryHover`, `primaryText`, `accent`, `accentHover`, `accentText`, `focusRing`, `success`, `warning`, `danger`, `info` |
| `radius`       | `xs`, `sm`, `md`, `lg`, `pill`, `button`, `input`, `borderWidth`                          |
| `font`         | `family`, `familyHeading`, `familyMono`, `sizeBase`, `sizeSm`, `sizeLg`, `sizeHeading`, `sizeTitle`, `weightBody`, `weightHeading`, `lineHeightBody`, `lineHeightHeading`, `letterSpacingHeading`, `headingTextTransform` |

Plus metadata keys `name` and `direction` (`"ltr"` / `"rtl"`).

---

## 15. Icons (Font Awesome)

The runtime auto-loads Font Awesome 6.7.2 from the public CDN.

- Icon strings are Font Awesome names **without** the `fa-` prefix.
- Optional variant prefix: `"regular:star"`, `"brands:github"`.
- Use `Icon(name, { variant, size })` for standalone glyphs.
- **Never emit raw emoji.**

```javascript
brandIcon  = Icon("rocket", { size: "lg" })
homeIcon   = Icon("house")
profileTab = NavLink("Profile", { to: "/profile", variant: "ghost", icon: "user" })
kpis       = Stats([
  StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%", icon: "sack-dollar" }),
  StatCard("Orders",  { value: "1,284", trend: "up", delta: "+8%", icon: "cart-shopping" }),
  StatCard("Refunds", { value: "12", trend: "down", delta: "-3", icon: "rotate-left" })
])
$app(Stack([brandIcon, kpis, profileTab]))
```

---

## 16. Application patterns (recipes)

Each pattern is a complete, self-contained snippet. Pattern letters are
stable — add new ones at the end.

### Pattern A — Todo list

```javascript
$todos = [
  { id: 1, text: "Try editing this list", done: false },
  { id: 2, text: "Write a follow-up", done: false }
]
$draft = ""

function add() {
  if (!$draft) { return }
  $todos = [...$todos, { id: $todos.length + 1, text: $draft, done: false }]
  $draft = ""
}

function toggle(id) {
  $todos = $todos.map(t => t.id == id ? { ...t, done: !t.done } : t)
}

function remove(id) {
  $todos = $util.filter($todos, "id", "!=", id)
}

row = (t) => Card([Stack([
  Checkbox("done-" + t.id, { label: t.text, checked: t.done, onChange: () => toggle(t.id) }),
  Button("Delete", { onClick: () => remove(t.id), variant: "ghost", size: "sm" })
], { direction: "row", gap: "m", justify: "between", align: "center" })])

list = $todos.map(t => row(t))

$app(Stack([
  PageHeader("Todos", { subtitle: `${$util.count($todos)} items`, actions: [Button("Clear all", { onClick: () => $todos = [], variant: "ghost" })] }),
  Card([Stack([
    Input("draft", { placeholder: "What needs doing?", value: $draft, onEnter: add }),
    Button("Add", { onClick: add, variant: "primary" })
  ], { direction: "row", gap: "s" })]),
  $util.count($todos) == 0
    ? EmptyState("No todos yet", { description: "Add your first task above.", icon: "list-check" })
    : Stack(list, { gap: "s" })
], { gap: "l" }))
```

### Pattern B — Counter with per-instance state

```javascript
function Counter(label = "Count", { initial = 0 } = {}) {
  $n = initial
  return Card([Stack([
    SectionHeader(label),
    Buttons([
      Button("-", { onClick: () => $n = $n - 1, variant: "ghost" }),
      Button(`${$n}`, { variant: "secondary" }),
      Button("+", { onClick: () => $n = $n + 1, variant: "primary" })
    ])
  ])])
}

$app(Grid([
  Counter("A"),
  Counter("B", { initial: 10 }),
  Counter("C", { initial: 100 })
], { columns: { sm: 1, md: 3 }, gap: "l" }))
```

### Pattern C — Dashboard with KPIs + chart + table

```javascript
function refresh() { $orders.refetch() }
function exportCsv() { $exp = $http({ url: "https://api.example.com/exports/orders.csv", method: "POST" }) }
function newOrder() { route.navigate("/orders/new") }

$orders = $http({ url: "https://api.example.com/orders", method: "GET", query: { range: $range } })
$range  = "30d"

header = PageHeader("Orders", {
  subtitle: "Revenue, conversions, latency",
  breadcrumbs: ["Workspace", "Reports", "Orders"],
  actions: [
    Button("Refresh", { onClick: refresh, variant: "ghost", icon: "rotate" }),
    Button("Export CSV", { onClick: exportCsv, variant: "secondary", icon: "file-csv" }),
    Button("New order", { onClick: newOrder, variant: "primary", icon: "plus" })
  ],
  status: Badge("Live", { variant: "success", icon: "circle" })
})

filterBar = Toolbar({
  left: [
    SearchBar("orders-q", { placeholder: "Search orders…", shortcut: "/" }),
    Select("range", { items: [SelectItem("7d","7d"), SelectItem("30d","30d"), SelectItem("90d","90d")], value: $range })
  ],
  right: [
    Button("Filters", { variant: "ghost", icon: "filter" })
  ]
})

kpis = Stats([
  StatCard("Revenue",    { value: "$48.2k", trend: "up",   delta: "+12% vs last period", icon: "sack-dollar" }),
  StatCard("Orders",     { value: "1,284",  trend: "up",   delta: "+8%",                 icon: "cart-shopping" }),
  StatCard("Avg. value", { value: "$37.5",  trend: "down", delta: "-3%",                 icon: "scale-balanced" }),
  StatCard("Refunds",    { value: "12",     trend: "down", delta: "-2",                  icon: "rotate-left" })
], { layout: "grid" })

chart = Card([
  SectionHeader("Daily revenue", { subtitle: "Last 30 days" }),
  LineChart({
    labels: ["Mar 1","Mar 8","Mar 15","Mar 22","Mar 29"],
    series: [Series("Revenue", { values: [12000, 14800, 13900, 17200, 18250] })],
    filled: true
  })
])

ordersTable = Card([
  SectionHeader("Recent orders", { actions: [Button("View all", { onClick: () => route.navigate("/orders/all"), variant: "ghost" })] }),
  Async($orders, {
    loading: LoadingState("Loading orders…"),
    error:   ErrorState("Couldn't load orders", { action: Button("Retry", { onClick: refresh, variant: "primary" }) }),
    empty:   EmptyState("No orders in range", { description: "Try a wider date range.", icon: "cart-shopping" }),
    data:    DataGrid([
      Col("Order", $orders.data.id, { sortable: true }),
      Col("Customer", $orders.data.map(o => PersonChip(o.customer, { role: o.email }))),
      Col("Status", $orders.data.map(o => Badge(o.status, { variant: o.status == "shipped" ? "success" : "warning" })), { filterable: true }),
      Col("Total", $orders.data.total, { format: "currency", align: "right", sortable: true }),
      Col("Placed", $orders.data.created, { format: "datetime", sortable: true })
    ])
  })
])

activity = Card([
  SectionHeader("Recent activity"),
  ActivityLog([
    { actor: "Asha", title: "Approved refund for #4821", time: $util.formatDate($util.now() - 600000, "relative"), icon: "circle-check", tone: "success" },
    { actor: "Wren", title: "Flagged order #4798 for review", time: $util.formatDate($util.now() - 3600000, "relative"), icon: "flag", tone: "warning" },
    { actor: "Mira", title: "Updated shipping rules", time: $util.formatDate($util.now() - 7200000, "relative"), icon: "truck" }
  ])
])

follow = FollowUpBlock(["Compare to last quarter", "Show only refunds", "Which products underperformed?"])

$app(Stack([header, filterBar, kpis, chart, ordersTable, activity, follow], { gap: "l" }))
```

### Pattern D — Multi-step wizard

```javascript
$step = 0
$data = { name: "", email: "", role: "" }

stepLabels = ["Profile", "Account", "Review"]

function next() { if ($step < 2) { $step = $step + 1 } }
function prev() { if ($step > 0) { $step = $step - 1 } }
function submit() {
  $save = $http({ url: "https://api.example.com/users", method: "POST", body: $data })
  $step = 0
  $data = { name: "", email: "", role: "" }
}

step0 = Card([
  SectionHeader("Profile"),
  FormSection("About you", [
    FormControl("Name",  { control: Input("name",  { value: $data.name,  onChange: (v) => $data = {...$data, name: v} }) }),
    FormControl("Email", { control: Input("email", { value: $data.email, onChange: (v) => $data = {...$data, email: v} }) })
  ])
])

step1 = Card([
  SectionHeader("Account"),
  FormControl("Role", { control: Select("role", {
    items: [SelectItem("admin","Admin"), SelectItem("editor","Editor"), SelectItem("viewer","Viewer")],
    value: $data.role,
    onChange: (v) => $data = {...$data, role: v}
  })})
])

step2 = Card([
  SectionHeader("Review"),
  DescriptionList([
    DescriptionItem("Name",  $data.name),
    DescriptionItem("Email", $data.email),
    DescriptionItem("Role",  $data.role)
  ])
])

current = $step == 0 ? step0 : $step == 1 ? step1 : step2

navBtns = Buttons([
  Button("Back", { onClick: prev, variant: "ghost", disabled: $step == 0 }),
  $step == 2
    ? Button("Submit", { onClick: submit, variant: "primary" })
    : Button("Next", { onClick: next, variant: "primary" })
])

$app(Stack([
  PageHeader("Create account", { subtitle: `Step ${$step + 1} of 3` }),
  Steps(stepLabels, { current: $step }),
  current,
  navBtns
], { gap: "l" }))
```

### Pattern E — Settings page (sectioned)

```javascript
$profile      = { name: "Alex Diaz", email: "alex@example.com" }
$notify_email = true
$notify_sms   = false
$timezone     = "America/Los_Angeles"
$theme_pref   = "system"

function save() {
  $save = $http({ url: "https://api.example.com/settings", method: "PUT", body: { profile: $profile, notify: { email: $notify_email, sms: $notify_sms }, timezone: $timezone, theme: $theme_pref } })
}

general = Card([
  SectionHeader("General", { subtitle: "Your basic profile information" }),
  FormSection("Profile", [
    FormControl("Name",  { control: Input("p-name",  { value: $profile.name,  onChange: (v) => $profile = {...$profile, name: v} }) }),
    FormControl("Email", { control: Input("p-email", { type: "email", value: $profile.email, onChange: (v) => $profile = {...$profile, email: v} }) })
  ])
])

notify = Card([
  SectionHeader("Notifications"),
  Stack([
    FormControl("Email notifications", { control: Switch("notify-email", { checked: $notify_email, onChange: (v) => $notify_email = v }) }),
    FormControl("SMS notifications",   { control: Switch("notify-sms",   { checked: $notify_sms,   onChange: (v) => $notify_sms = v }) })
  ])
])

prefs = Card([
  SectionHeader("Preferences"),
  Stack([
    FormControl("Timezone", { control: Select("tz", { items: [SelectItem("UTC","UTC"), SelectItem("America/Los_Angeles","Los Angeles"), SelectItem("Europe/Berlin","Berlin")], value: $timezone, onChange: (v) => $timezone = v }) }),
    FormControl("Theme",    { control: ToggleGroup("theme", { items: [{value: "light", label: "Light"}, {value: "dark", label: "Dark"}, {value: "system", label: "System"}], value: $theme_pref, onChange: (v) => $theme_pref = v }) })
  ])
])

danger = Card([
  SectionHeader("Danger zone", { actions: [Button("Delete account", { variant: "ghost", tone: "danger" })] }),
  Callout("This will permanently delete your account and all associated data.", { variant: "danger", icon: "triangle-exclamation" })
])

$app(Stack([
  PageHeader("Settings", { subtitle: "Configure your account and workspace" }),
  general,
  notify,
  prefs,
  danger,
  Buttons([Button("Save changes", { onClick: save, variant: "primary" })])
], { gap: "l" }))
```

### Pattern F — Chat / messaging surface

```javascript
$thread = [
  { id: 1, from: "agent", body: "Hi Alex — how can I help today?",        time: "9:24 AM" },
  { id: 2, from: "me",    body: "Where is order #4821?",                  time: "9:25 AM" },
  { id: 3, from: "agent", body: "Let me check… it shipped this morning.", time: "9:25 AM" }
]
$draft = ""

function send() {
  if (!$draft) { return }
  $thread = [...$thread, { id: $thread.length + 1, from: "me", body: $draft, time: $util.formatDate($util.now(), "time") }]
  $draft  = ""
  $emit("assistant-message", { message: "User said: " + $draft })
}

inbox = InboxPanel([
  { title: "Alex Diaz",   message: "Where is order #4821?",  time: "9:25 AM",  avatarSrc: "https://i.pravatar.cc/40?u=alex",  unread: true },
  { title: "Sam Lee",     message: "Thanks for the update!", time: "8:12 AM",  avatarSrc: "https://i.pravatar.cc/40?u=sam" },
  { title: "Wren Carter", message: "Can we ship overnight?", time: "Yesterday", avatarSrc: "https://i.pravatar.cc/40?u=wren" }
], { title: "Conversations" })

thread = Card([
  Stack($thread.map(m => ChatBubble(m.from == "me" ? "You" : "Agent", { body: m.body, time: m.time, from: m.from })), { gap: "s" })
])

composer = Card([
  Stack([
    TextArea("draft", { placeholder: "Write a message…", value: $draft }),
    Buttons([Button("Send", { onClick: send, variant: "primary", icon: "paper-plane" })])
  ], { gap: "s" })
])

$app(Stack([
  PageHeader("Support inbox"),
  SplitView(inbox, Stack([thread, composer], { gap: "m" }), { primaryWidth: "320px" })
], { gap: "l" }))
```

### Pattern G — Routed multi-page app

```javascript
function HomePage() {
  return Stack([
    PageHeader("Home", { subtitle: "Welcome back, Alex" }),
    Stats([
      StatCard("Active",  { value: "12", trend: "flat" }),
      StatCard("Pending", { value: "3",  trend: "up", delta: "+1" }),
      StatCard("Done",    { value: "27", trend: "up", delta: "+4" })
    ])
  ], { gap: "l" })
}

function OrdersPage() {
  return Stack([
    PageHeader("Orders", { breadcrumbs: ["Home", "Orders"] }),
    DataGrid([
      Col("ID", ["4821", "4822", "4823"]),
      Col("Customer", ["Alex", "Sam", "Wren"]),
      Col("Total", ["$120", "$80", "$210"], { format: "currency", align: "right" })
    ])
  ], { gap: "l" })
}

function OrderDetail({ id } = {}) {
  return Stack([
    PageHeader(`Order #${id}`, { breadcrumbs: ["Home", "Orders", id], actions: [Button("Back", { onClick: () => route.navigate("/orders"), variant: "ghost", icon: "arrow-left" })] }),
    DescriptionList([
      DescriptionItem("Status",   Badge("Shipped", { variant: "success" })),
      DescriptionItem("Customer", "Alex Diaz"),
      DescriptionItem("Total",    "$120.00")
    ])
  ], { gap: "l" })
}

function NotFound() {
  return EmptyState("Page not found", { description: `We couldn't find ${route.path}.`, action: Button("Go home", { onClick: () => route.navigate("/"), variant: "primary" }) })
}

pages = $router({
  "/":             HomePage(),
  "/orders":       OrdersPage(),
  "/orders/:id":   OrderDetail({ id: params.id }),
  default:         NotFound()
})

sidebar = Sidebar([
  SidebarSection("Workspace", { items: [
    SidebarItem("Home",   { to: "/", icon: "house", active: route.path == "/" }),
    SidebarItem("Orders", { to: "/orders", icon: "cart-shopping", active: route.path == "/orders" })
  ]})
], { brand: "Acme Co", tagline: "Operations console" })

$app(AppShell(sidebar, pages, { collapsible: true }))
```

### Pattern H — Real-time status page

```javascript
$services = [
  { id: "api",   name: "API",      status: "operational", uptime: 99.97 },
  { id: "web",   name: "Web app",  status: "operational", uptime: 99.99 },
  { id: "db",    name: "Database", status: "degraded",    uptime: 98.71 },
  { id: "queue", name: "Queue",    status: "operational", uptime: 99.95 }
]

statusTone = (s) => {
  switch (s) {
    case "operational": return "success"
    case "degraded": return "warning"
    case "down": return "danger"
    default: return "neutral"
  }
}

statusIcon = (s) => {
  switch (s) {
    case "operational": return "circle-check"
    case "degraded": return "triangle-exclamation"
    case "down": return "circle-xmark"
    default: return "circle"
  }
}

healthBar = Card([
  Stack([
    SectionHeader("System status", { actions: [Button("Subscribe", { icon: "bell", variant: "ghost" })] }),
    Banner("All systems operational", { description: "Auto-refreshed every 30 seconds.", tone: "success", icon: "circle-check" })
  ])
])

list = Stack($services.map(s =>
  Card([Stack([
    StatusDot(s.name, { tone: statusTone(s.status), pulse: s.status != "operational" }),
    Badge(`${s.uptime}% uptime`, { variant: statusTone(s.status), icon: statusIcon(s.status) })
  ], { direction: "row", justify: "between" })])
), { gap: "s" })

timeline = Card([
  SectionHeader("Recent incidents"),
  Timeline([
    TimelineItem("Database latency",   { time: $util.formatDate($util.now() - 1800000, "relative"), description: "p99 latency above 500ms.", icon: "database", tone: "warning" }),
    TimelineItem("Resolved: queue",    { time: $util.formatDate($util.now() - 86400000, "relative"), description: "Queue throughput restored.", icon: "circle-check", tone: "success" })
  ])
])

$effect(() => {
  console.log("refreshing status")
}, ["every(30000)"])

$app(Stack([
  PageHeader("Status", { subtitle: "Live availability across our services" }),
  healthBar,
  list,
  timeline
], { gap: "l" }))
```

### Pattern I — Pricing page

```javascript
$cycle = "monthly"

function toggleCycle(v) { $cycle = v }

monthly = [
  { plan: "Free",     price: "$0",   period: "forever",   description: "For solo hobbyists", features: ["1 project", "Community support"], action: Button("Start free", { variant: "secondary" }) },
  { plan: "Pro",      price: "$24",  period: "per month", description: "For growing teams",  features: ["Unlimited projects", "Priority email"], action: Button("Choose Pro", { variant: "primary" }), featured: true },
  { plan: "Business", price: "$99",  period: "per month", description: "For larger teams",   features: ["SSO", "Dedicated CSM"], action: Button("Contact sales", { variant: "secondary" }) }
]

yearly = [
  { plan: "Free",     price: "$0",   period: "forever",  description: "For solo hobbyists", features: ["1 project", "Community support"], action: Button("Start free", { variant: "secondary" }) },
  { plan: "Pro",      price: "$240", period: "per year", description: "Save 17%",           features: ["Unlimited projects", "Priority email"], action: Button("Choose Pro", { variant: "primary" }), featured: true },
  { plan: "Business", price: "$990", period: "per year", description: "Save 17%",           features: ["SSO", "Dedicated CSM"], action: Button("Contact sales", { variant: "secondary" }) }
]

plans = $cycle == "yearly" ? yearly : monthly

hero = Hero("Simple pricing", { subtitle: "Pick the plan that fits your team. Cancel anytime.", primary: Button("Compare plans", { variant: "primary" }) })

picker = Card([Stack([
  Badge("Save 17% yearly", { variant: "success" }),
  ToggleGroup("cycle", { items: [{value:"monthly", label:"Monthly"}, {value:"yearly", label:"Yearly"}], value: $cycle, onChange: toggleCycle })
], { direction: "row", justify: "between", align: "center" })])

table = PricingTable(plans.map(p => PricingCard(p.plan, { price: p.price, period: p.period, description: p.description, features: p.features, action: p.action, featured: p.featured })))

faq = Accordion([
  AccordionItem("Can I change plans later?",       { content: Markdown("Yes — you can upgrade or downgrade at any time.") }),
  AccordionItem("Do you offer student discounts?", { content: Markdown("Email **students@example.com** for a 50% discount.") }),
  AccordionItem("How does billing work?",          { content: Markdown("All plans bill in advance and renew automatically.") })
])

closing = Banner("Need a custom plan?", { description: "We'll help you build a quote.", tone: "primary", icon: "envelope" })

$app(Stack([hero, picker, table, faq, closing], { gap: "l" }))
```

### Pattern J — Checkout flow

```javascript
$step  = "details"
$cart  = [
  { id: 1, title: "Coffee mug",   qty: 2, price: 12.5 },
  { id: 2, title: "Notebook",     qty: 1, price: 18.0 },
  { id: 3, title: "Sticker pack", qty: 3, price: 4.5 }
]
$total = $util.sum($cart.map(it => it.qty * it.price))
$customer = { name: "", email: "", address: "" }

function next() { $step = "payment" }
function back() { $step = "details" }
function place() {
  $place = $http({ url: "https://api.example.com/checkout", method: "POST", body: { customer: $customer, items: $cart } })
  $step = "confirm"
}

steps = Steps(["Details", "Payment", "Confirmation"], { current: $step == "details" ? 0 : $step == "payment" ? 1 : 2 })

orderSummary = Card([
  SectionHeader("Order summary"),
  Stack($cart.map(it =>
    Stack([
      Text(`${it.qty} × ${it.title}`),
      Text($util.format(it.qty * it.price, "currency"))
    ], { direction: "row", justify: "between" })
  ), { gap: "s" }),
  Separator(),
  Stack([Text("Total", { variant: "large-heavy" }), Text($util.format($total, "currency"), { variant: "large-heavy" })], { direction: "row", justify: "between" })
])

detailsForm = Card([
  SectionHeader("Shipping details"),
  FormSection("Contact", [
    FormControl("Name",    { control: Input("c-name",    { value: $customer.name,    onChange: (v) => $customer = {...$customer, name: v} }) }),
    FormControl("Email",   { control: Input("c-email",   { type: "email", value: $customer.email, onChange: (v) => $customer = {...$customer, email: v} }) }),
    FormControl("Address", { control: TextArea("c-addr", { value: $customer.address, onChange: (v) => $customer = {...$customer, address: v} }) })
  ]),
  Buttons([Button("Continue to payment", { onClick: next, variant: "primary" })])
])

paymentForm = Card([
  SectionHeader("Payment"),
  Callout("This demo doesn't process real payments.", { variant: "info", icon: "circle-info" }),
  Buttons([
    Button("Back", { onClick: back, variant: "ghost", icon: "arrow-left" }),
    Button(`Pay ${$util.format($total, "currency", "USD")}`, { onClick: place, variant: "primary" })
  ])
])

confirmation = SuccessState("Order placed", { description: "We'll email you a receipt and tracking number.", action: Button("Continue shopping", { variant: "primary" }) })

content = $step == "details" ? detailsForm : $step == "payment" ? paymentForm : confirmation

$app(Stack([
  PageHeader("Checkout"),
  steps,
  Grid([content, orderSummary], { columns: { sm: 1, md: 2 }, gap: "l" })
], { gap: "l" }))
```

### Pattern K — File manager

```javascript
$path  = ["Documents"]
$nodes = [
  { name: "Reports",     type: "folder" },
  { name: "Q3.pdf",      type: "file", size: "1.2 MB", modified: "2 days ago" },
  { name: "Photos",      type: "folder" },
  { name: "Diagram.png", type: "file", size: "320 KB", modified: "Yesterday" }
]
$selected = null

function open(node) {
  if (node.type == "folder") {
    $path = [...$path, node.name]
  } else {
    $selected = node
  }
}

function back() {
  if ($path.length > 1) { $path = $util.slice($path, 0, $path.length - 1) }
}

breadcrumb = Breadcrumb($path)

toolbar = Toolbar({
  left: [Button("Up", { onClick: back, variant: "ghost", icon: "arrow-up", disabled: $path.length <= 1 })],
  right: [Button("New folder", { variant: "secondary", icon: "folder-plus" }), Button("Upload", { variant: "primary", icon: "upload" })]
})

rows = $nodes.map(n =>
  Card([Stack([
    Stack([
      Icon(n.type == "folder" ? "folder" : "file", { size: "md" }),
      Text(n.name, { variant: "large-heavy" })
    ], { direction: "row", gap: "m", align: "center" }),
    n.type == "file" ? Text(`${n.size} · ${n.modified}`, { tone: "muted" }) : null,
    Button("Open", { onClick: () => open(n), variant: "ghost" })
  ], { direction: "row", justify: "between", align: "center" })])
)

preview = $selected
  ? Card([
      SectionHeader($selected.name, { actions: [Button("Close", { onClick: () => $selected = null, variant: "ghost", icon: "xmark" })] }),
      DescriptionList([
        DescriptionItem("Size",     $selected.size),
        DescriptionItem("Modified", $selected.modified)
      ])
    ])
  : EmptyState("No file selected", { description: "Pick a file on the left to see details.", icon: "file" })

$app(Stack([
  PageHeader("Files", { subtitle: "Browse and manage your assets" }),
  breadcrumb,
  toolbar,
  SplitView(Stack(rows, { gap: "s" }), preview, { primaryWidth: "60%" })
], { gap: "l" }))
```

### Pattern L — Calendar / scheduler

```javascript
$selected = $util.today()
$events   = [
  { date: $util.today(),              title: "Team standup",     time: "9:00",  tone: "primary" },
  { date: $util.addDays($util.today(), 1), title: "Customer call",   time: "14:00", tone: "info" },
  { date: $util.addDays($util.today(), 3), title: "1:1 with manager", time: "11:00", tone: "warning" }
]

dayEvents = $util.filter($events, "date", "==", $selected)

calendar = Card([
  SectionHeader("Schedule", { actions: [Button("Add event", { icon: "plus", variant: "primary" })] }),
  CalendarView({ value: $selected, events: $events, onSelect: (d) => $selected = d })
])

list = Card([
  SectionHeader(`Events for ${$util.formatDate($selected, "MMM D")}`),
  $util.count(dayEvents) == 0
    ? EmptyState("Nothing scheduled", { description: "Pick a different day or add an event.", icon: "calendar-plus" })
    : Stack(dayEvents.map(e =>
        Stack([Badge(e.time, { variant: e.tone }), Text(e.title)], { direction: "row", gap: "m", align: "center" })
      ), { gap: "s" })
])

$app(Stack([
  PageHeader("Calendar"),
  Grid([calendar, list], { columns: { sm: 1, md: 2 }, gap: "l" })
], { gap: "l" }))
```

### Pattern M — Docs portal

```javascript
docTree = [
  TreeNode("Getting started", { children: [
    TreeNode("Installation", { onClick: () => route.navigate("/docs/install"),    active: route.path == "/docs/install" }),
    TreeNode("Quick start",  { onClick: () => route.navigate("/docs/quickstart"), active: route.path == "/docs/quickstart" })
  ], expanded: true }),
  TreeNode("Guides", { children: [
    TreeNode("Routing", { onClick: () => route.navigate("/docs/routing") }),
    TreeNode("Theming", { onClick: () => route.navigate("/docs/theming") })
  ]})
]

sidebar = Sidebar([
  SidebarSection("Documentation", { items: [
    SidebarItem("Search", { icon: "magnifying-glass" })
  ]})
], { brand: "Acme Docs" })

function getContent() {
  switch (route.path) {
    case "/docs/install":    return Markdown("# Installation\n\nRun `npm install acme`.")
    case "/docs/quickstart": return Markdown("# Quick start\n\nMount the tag and stream a response.")
    case "/docs/routing":    return Markdown("# Routing\n\nUse `pages = $router({ … })`.")
    case "/docs/theming":    return Markdown("# Theming\n\nPick a theme or pass `$theme({…})`.")
    default:                 return Markdown("# Welcome\n\nPick a topic from the tree.")
  }
}

inner = Grid([
  Card([Tree(docTree)]),
  Card([getContent()])
], { columns: { sm: 1, md: 2 }, gap: "l" })

$app(AppShell(sidebar, Stack([
  PageHeader("Docs"),
  inner
], { gap: "l" })))
```

### Pattern N — Onboarding checklist

```javascript
$tasks = [
  { title: "Connect your data",    description: "Hook up a database.",        done: true,  onClick: () => route.navigate("/connect") },
  { title: "Invite your team",     description: "Add at least one teammate.", done: false, onClick: () => route.navigate("/team") },
  { title: "Configure billing",    description: "Pick a plan.",               done: false, onClick: () => route.navigate("/billing") },
  { title: "Customize your theme", description: "Match your brand.",          done: false, onClick: () => route.navigate("/theme") }
]

$app(Stack([
  PageHeader("Welcome to Acme", { subtitle: "Let's get you set up — 4 quick steps." }),
  OnboardingChecklist($tasks, { title: "Setup", description: "Complete these to unlock your full workspace." }),
  Banner("Need help?", { description: "Book a 30-minute call with our team.", action: Button("Schedule", { variant: "primary" }), tone: "info" })
], { gap: "l" }))
```

### Pattern O — Search-driven directory / CRM

```javascript
$query = ""
$role  = "all"

$people = [
  { name: "Alex Diaz",   role: "Engineer", team: "Platform",  status: "online" },
  { name: "Sam Lee",     role: "Designer", team: "Marketing", status: "away" },
  { name: "Wren Carter", role: "PM",       team: "Platform",  status: "offline" },
  { name: "Mira Patel",  role: "Engineer", team: "Mobile",    status: "online" }
]

filtered = $util.filter(
  $role == "all" ? $people : $util.filter($people, "role", "==", $role),
  "name", "contains", $query
)

toolbar = Toolbar({
  left: [
    SearchBar("dir-q", { placeholder: "Search by name…", value: $query }),
    ToggleGroup("role", { items: [
      { value: "all",      label: "All" },
      { value: "Engineer", label: "Engineers" },
      { value: "Designer", label: "Designers" },
      { value: "PM",       label: "PMs" }
    ], value: $role })
  ]
})

cards = Grid(filtered.map(p =>
  ProfileCard(p.name, { role: p.role, team: p.team, avatarSrc: `https://i.pravatar.cc/120?u=${p.name}`, status: p.status })
), { columns: { sm: 1, md: 2, lg: 3 }, gap: "l" })

$app(Stack([
  PageHeader("Directory", { subtitle: `${$util.count(filtered)} people` }),
  toolbar,
  $util.count(filtered) == 0
    ? EmptyState("No matches", { description: "Try a different search term.", icon: "magnifying-glass" })
    : cards
], { gap: "l" }))
```

### Pattern P — Brand-themed landing page

```javascript
$theme({
  colors: { primary: "#0969da", accent: "#1f6feb", bg: "#ffffff", text: "#1f2328", border: "#d0d7de" },
  font:   { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", familyHeading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", weightHeading: "600" },
  radius: { button: "6px", input: "6px" }
})

hero = Hero("Where the world builds software", {
  subtitle: "Ship faster with collaborative coding.",
  primary: Button("Get started", { variant: "primary" }),
  secondary: Button("View pricing", { variant: "secondary" }),
  eyebrow: "Introducing Codespaces 2.0"
})

features = FeatureGrid([
  FeatureItem("Real-time collaboration", { description: "Code together with your team in real-time, anywhere.", icon: "people-group", tone: "primary" }),
  FeatureItem("Powerful CI/CD",          { description: "From commit to deployment without leaving the platform.", icon: "code-branch", tone: "info" }),
  FeatureItem("Security first",          { description: "Built-in scanning, secret management, and audit logs.", icon: "shield-halved", tone: "success" })
])

testimonial = Testimonial("This changed how our team ships.", { author: "Asha Verma", role: "VP Engineering, Acme", avatarSrc: "https://i.pravatar.cc/80?u=asha" })

closing = Banner("Start building today", { description: "Free for personal use.", action: Button("Create a repository", { variant: "primary" }), tone: "primary" })

$app(Stack([hero, features, testimonial, closing], { gap: "l" }))
```

### Pattern Q — Kanban board

```javascript
$cards = [
  { id: 1, col: "todo",   title: "Migrate auth",      tags: ["auth"],     assignee: "Asha", tone: null },
  { id: 2, col: "doing",  title: "Streaming UI v2",   tags: ["frontend"], assignee: "Alex", tone: "primary" },
  { id: 3, col: "review", title: "Mobile onboarding", tags: ["mobile"],   assignee: "Wren", tone: "warning" },
  { id: 4, col: "done",   title: "Activity timeline", tags: ["shipped"],  assignee: "Mira", tone: "success" }
]

columns = [
  { id: "todo",   title: "To do" },
  { id: "doing",  title: "Doing" },
  { id: "review", title: "Review" },
  { id: "done",   title: "Done" }
]

cardsFor = (colId) => $util.filter($cards, "col", "==", colId)

$app(Stack([
  PageHeader("Sprint board", { subtitle: `${$util.count($cards)} cards across ${$util.count(columns)} columns` }),
  KanbanBoard(columns.map(c =>
    KanbanColumn(c.title, { items: cardsFor(c.id).map(card =>
      KanbanCard(card.title, { description: card.title, tags: card.tags, assignee: card.assignee, tone: card.tone })
    )})
  ))
], { gap: "l" }))
```

### Pattern R — Inbox / split-view

```javascript
$threads = [
  { id: 1, title: "Alex Diaz",   message: "Where is order #4821?",  time: "9:25 AM",  unread: true,  avatarSrc: "https://i.pravatar.cc/40?u=alex" },
  { id: 2, title: "Sam Lee",     message: "Thanks for the update!", time: "8:12 AM",  unread: false, avatarSrc: "https://i.pravatar.cc/40?u=sam" },
  { id: 3, title: "Wren Carter", message: "Can we ship overnight?", time: "Yesterday", unread: true,  avatarSrc: "https://i.pravatar.cc/40?u=wren" }
]
$active = 1

function open(id) { $active = id }

list = InboxPanel($threads.map(t => ({ ...t, onClick: () => open(t.id) })), { title: "Inbox" })

thread = $active
  ? Card([
      SectionHeader($threads.first.title),
      Stack($util.range(1, 3).map(n => ChatBubble("Alex", { body: "Message body " + n })), { gap: "s" }),
      TextArea("reply", { placeholder: "Reply…" }),
      Buttons([Button("Send", { variant: "primary", icon: "paper-plane" })])
    ])
  : EmptyState("Pick a conversation", { description: "Select a thread on the left.", icon: "inbox" })

$app(Stack([
  PageHeader("Inbox"),
  SplitView(list, thread, { primaryWidth: "360px" })
], { gap: "l" }))
```

### Pattern S — Content studio

```javascript
$body  = ""
$tags  = ["draft"]
$color = "#635bff"

editor = Card([
  SectionHeader("Article", { actions: [Button("Publish", { variant: "primary" })] }),
  RichTextEditor("body", { value: $body, placeholder: "Write your story…" })
])

metadata = Card([
  SectionHeader("Metadata"),
  FormSection("Tags & color", [
    FormControl("Tags",  { control: TagInput("tags", { value: $tags }) }),
    FormControl("Brand color", { control: ColorPicker("color", { value: $color }) })
  ])
])

snippet = Card([
  SectionHeader("Code snippet"),
  CodeEditor("snippet", { language: "javascript", placeholder: "function hello() { return 'world' }" })
])

$app(Stack([
  PageHeader("Studio", { subtitle: "Compose and publish stories" }),
  Grid([Stack([editor, snippet], { gap: "l" }), metadata], { columns: { sm: 1, md: 2 }, gap: "l" })
], { gap: "l" }))
```

### Pattern T — Data explorer

```javascript
$rows = $http({ url: "https://api.example.com/events", method: "GET" })
$sortField = "ts"
$sortDir   = "desc"
$selected  = []

function sortBy(field) {
  if ($sortField == field) { $sortDir = $sortDir == "asc" ? "desc" : "asc" }
  else { $sortField = field; $sortDir = "asc" }
}

bulk = $util.count($selected) > 0
  ? Card([Stack([
      Text(`${$util.count($selected)} selected`),
      Buttons([
        Button("Mark resolved", { variant: "primary" }),
        Button("Clear", { onClick: () => $selected = [], variant: "ghost" })
      ])
    ], { direction: "row", justify: "between" })])
  : null

table = DataGrid([
  Col("Time",     $rows.data.ts,      { format: "datetime", sortable: true }),
  Col("Service",  $rows.data.service,  { filterable: true }),
  Col("Severity", $rows.data.map(r => Badge(r.severity, { variant: r.severity == "error" ? "danger" : "warning" })), { sortable: true }),
  Col("Message",  $rows.data.message)
], { rowIds: $rows.data.id, selectedIds: $selected, selectable: true, sort: { field: $sortField, direction: $sortDir } })

$app(Stack([
  PageHeader("Events", { subtitle: `${$util.count($rows.data)} events` }),
  bulk,
  Async($rows, {
    loading: LoadingState("Loading events…"),
    error:   ErrorState("Couldn't load events"),
    empty:   EmptyState("No events", { icon: "rectangle-list" }),
    data:    Card([table])
  })
], { gap: "l" }))
```

### Pattern U — Media gallery

```javascript
$active = 0

photos = [
  { src: "https://picsum.photos/id/1018/800/500", caption: "Mountains" },
  { src: "https://picsum.photos/id/1019/800/500", caption: "Forest" },
  { src: "https://picsum.photos/id/1020/800/500", caption: "Beach" }
]

hero = Carousel(photos.map(p => Image(p.src, { caption: p.caption, ratio: "16:9" })))

gallery = Gallery(photos.map(p => ({ src: p.src, alt: p.caption })))

$app(Stack([
  PageHeader("Travel diary", { subtitle: "A photo a day, every day." }),
  hero,
  Card([SectionHeader("All photos"), gallery])
], { gap: "l" }))
```

### Pattern V — Real-time feed

```javascript
$messages = []

$effect(() => {
  $messages = [{ id: $util.now(), body: "Server tick at " + $util.formatDate($util.now(), "time"), tone: "info" }, ...$messages]
  if ($messages.length > 20) { $messages = $util.slice($messages, 0, 20) }
}, ["every(2000)"])

feed = Stack($messages.map(m =>
  Card([Stack([
    Badge($util.formatDate(m.id, "time"), { variant: m.tone }),
    Text(m.body)
  ], { direction: "row", gap: "m" })])
), { gap: "s" })

$app(Stack([
  PageHeader("Live feed", { subtitle: "Auto-updating every 2s" }),
  $util.count($messages) == 0
    ? EmptyState("Waiting for events…", { icon: "satellite-dish" })
    : feed
], { gap: "l" }))
```

---

## 17. Anti-patterns

Use only the JS-aligned surface. Common shapes to follow:

| Use this                                                                                                 | Notes                                                                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `$x = 0`                                                                                                 | One reactive-atom kind. No prefix keyword.                                           |
| `$app(Stack([...]))`                                                                                     | Canonical entry point. Call `$app(...)` with a node, an array of nodes, or variadic nodes. The legacy `aktion = ...` binding is replaced. |
| `Button("Save", { variant: "primary", loading: true })`                                                  | Multi-positional calls raise a schema error — group options into a trailing object.  |
| `function User(u) { return Card([...]) }`                                                                | PascalCase function = component. MUST `return` its tree. The DSL `component` keyword is gone. |
| `function save() { ... }`                                                                                | camelCase function = action. The DSL `action` keyword is gone.                       |
| `$effect(() => { ... }, [$x])`                                                                            | Callback + deps array. The old square-bracket effect form is gone.                   |
| `items.map(x => ...)` / `cond ? a : b`                                                                   | Use standard JS `.map()` and ternaries in expression position. Function declarations work as bare callbacks too — `items.map(Row)` and `items.filter(isReady)`. |
| `switch (value) { case "a": return X; default: return Y }`                                               | Standard JS `switch`. The DSL `match` keyword is gone.                               |
| `$router({ ... })` / `route.path`                                                                         | Capitalised helper, no-underscore route surface. Legacy underscored forms are gone.  |
| `$emit("name", { detail })`                                                                               | Function-call syntax. The old whitespace-string form is gone.                        |
| `$storage.set("key", value)`                                                                              | Lowercase global. `$storage.local.*`, `$storage.session.*`, `$storage.cookies.*` cover every browser-persistence target. |
| `navigator.clipboard.writeText(...)`                                                                     | Direct JS — there is no `js`-wrapper block anymore.                                  |
| `// comment` or `/* … */`                                                                                | Only the two JS comment forms. `#` line comments are no longer parsed.               |
| `Button("Save", { variant: "primary" })`                                                                 | Named props always live inside a trailing `{ ... }` object literal.                  |
| `$theme({ colors: { primary: "..." } })`                                                          | Structured tokens only — flat `colorPrimary`-style keys are gone.                    |
| Font Awesome names (`"heart"`, `"triangle-exclamation"`)                                                 | No emoji in `icon:` slots.                                                           |
| `Series("Name", { values: numbers })`                                                                    | Chart colours come from the theme — don't pass `stroke` / `fill` overrides.          |

---

## 18. Self-check

Before finishing, walk your output and verify:

1. `$app(...)` is the FIRST line.
2. Every referenced name is defined somewhere.
3. Every defined name (other than the `$app(...)` root and `theme`)
   is reachable from the `$app(...)` root.
4. Containers reference their children by name; large data arrays
   live on their own trailing lines.
5. Components (PascalCase functions) end with an explicit `return`.
6. Actions (camelCase functions) use `function` keyword.
7. State uses the single-sigil `$name = value` form.
8. HTTP uses `$http({ url, method, ... })` with an absolute `url`; the
   reactive bag exposes `.data` / `.error` / `.loading` / `.status` /
   `.refetch()` / `.cancel()`. `$query({...})` (cached/deduped) and
   `$mutation({...})` (deferred `.mutate()`) are same-config variants; toasts
   go through the `$toast` manager, not a hand-managed array.
9. Router uses `$router({...})` and route surface is `route.*`.
10. Effects use `$effect(() => { ... }, [deps])` syntax.
11. Named arguments are wrapped in an object: `Button("x", { variant: "primary" })`.
12. Every visible button is wired to a function or a lambda.
13. Icons are Font Awesome names (no `fa-` prefix, no emoji).
14. Density target (§0.5) met for the page type.
15. No hard-coded colours / gradients. All styling uses `tone:` /
    `variant:` / theme tokens.
16. One positional argument max per component call.
17. Comments use only `//` or `/* */`.
18. No DSL JS-wrapper blocks — direct JS lives in function/effect bodies.
19. `$emit("name", detail)` function call syntax for events.
20. `$storage.*` / `console.*` are lowercase — the only built-in globals.

---

## 19. Where do I look?

| For…                                                                  | Look in                                |
| --------------------------------------------------------------------- | -------------------------------------- |
| Quick syntax reference & the rules                                    | §0 (TL;DR) and the quick-reference.   |
| Visual hierarchy, density targets, theme awareness                    | §0.5.                                  |
| Mental model (3 layers) & rendering semantics                         | §1.                                    |
| Response structure, streaming-friendly ordering                        | §2.                                    |
| Reactive state (declaration, scoping, persistence)                    | §3.                                    |
| Component declarations, lambdas, `key:`                                | §4.                                    |
| Actions — handlers, optimistic updates, navigation                     | §5.                                    |
| Effects — triggers, debounce, cleanup                                  | §6.                                    |
| HTTP — `$http({...})`, `Async`, interceptors                            | §7.                                    |
| `$util` runtime helpers (aggregation, formatting, dates)               | §8.                                    |
| Component catalog by group                                             | §9.                                    |
| JavaScript layer — `$emit`, `cleanup`, browser APIs                     | §10.                                   |
| Routing — `$router`, `params`, `route`                                  | §11.                                   |
| Globals — `$storage`, `$console`, `$toast`                               | §12.                                   |
| Internationalisation — `$i18n({...})`, `t()`, `setCurrentLanguage()`    | §13.                                   |
| Theming — `$theme({...})`, structured tokens, brand recipes             | §14.                                   |
| Icons (Font Awesome)                                                   | §15.                                   |
| Application recipes A–V                                                | §16.                                   |
| Things to avoid                                                        | §17 + the anti-patterns table in §0.5. |
| Last-pass verification                                                 | §18 self-check.                        |

### Further reading

- **README.md** — host integration (script tag, attributes, methods,
  events, system prompt fetching, build pipeline).
- **`docs/components.html`** — every component with live preview,
  positional signatures, prop tables, and enum values.
- **`docs/playground.html`** — CodeMirror 6 editor with syntax
  highlighting, autocomplete, share links, and an inspector.
- **`docs/visual-editor.html`** — drag-and-drop visual editor.
- **`docs/live-examples.html`** — catalog of bundled live demos.
- **`docs/chat-bot.html`** — OpenRouter-powered streaming chat.
- **System prompts at the CDN** —
  [`system_prompt.txt`](https://asfand-dev.github.io/aktion/dist/system_prompt.txt)
  (full) and
  [`system_prompt_chat.txt`](https://asfand-dev.github.io/aktion/dist/system_prompt_chat.txt)
  (compact).
