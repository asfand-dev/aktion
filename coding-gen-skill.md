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
- [7. HTTP — `http({...})`](#7-http--http)
- [8. Built-in `@`-functions](#8-built-in--functions)
- [9. Component reference (by group)](#9-component-reference-by-group)
- [10. JavaScript layer](#10-javascript-layer)
- [11. Routing](#11-routing)
- [12. Globals — `Storage`, `console`](#12-globals--storage-console)
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
2. **`aktion = …` is line one.** Anchor the UI shell so users see structure
   before children arrive. Use forward references
   (`aktion = Stack([header, list])`) and define `header`, `list` below it.
3. **`$variables` are the single reactive atom kind.** Declare with
   `$name = value`; read or write with `$name`. There are no tiers — one
   kind of atom for every use case. Inside function bodies (actions/components)
   and `effect` callbacks the assignment operators
   `= += -= *= /= ??= ++ --` are allowed.
4. **HTTP is one function.** `http({ url, method, body, headers, query, ... })`
   is the only network primitive. It returns a reactive bag exposing
   `.data | .error | .status | .loading | .headers | .lastUpdated` and the
   callables `.refetch()` / `.cancel()`. The runtime tracks reactive inputs
   inside the options object and re-issues the request when they change.
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
9. **`for (let item of items) { Row(item) }` scopes `item` strictly to
   the body.** The loop variable is not state and cannot be read via
   `ctx.state` from external JS.
10. **Pass per-item data to JS via arguments.** From a lambda body access
    `ctx.args.id`, `ctx.state.get(name)`, etc.
11. **Prefer declarative builtins** (`[...spread]`, `@Filter`, `@Sort`,
    `.map()`, ternary, `for`/`if`/`switch`) over raw DOM manipulation.
    Only reach for the `ctx` bridge when no builtin captures the change.
12. **Strings come in three flavours.** `"double"`, `'single'`, and
    `` `backtick` ``. Backticks span lines and don't need escapes — use
    them for multi-line bodies and `${expression}` interpolation.
13. **Use `Grid`, not `Stack([...], { direction: "row", wrap: true })`, for
    uniform tiles.** Use `Stack([...], { direction: "row" })` only when
    items have different sizes.
14. **Add status colour everywhere.** `StatCard(..., { trend, delta })`,
    `Badge` variants, `TimelineItem` tone, `Banner` tone,
    `StatusDot(label, { tone })` — colour conveys meaning.
15. **`Storage` and `console` are always-available globals.** Use
    `Storage.set/get/remove/clear` (alias `Storage.local.*`),
    `Storage.session.*`, and `Storage.cookies.*` (with options:
    `expires`, `maxAge`, `path`, `domain`, `secure`, `sameSite`)
    directly. `console.log/error/warn/info/debug` forwards to the host
    console.
16. **`pages = Router({ … })` and `NavLink(label, { to })` are always
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
    `el.serializeState()` / `el.hydrateState()`. Setup bindings
    (`$http = Http({...})`, `$i18n = i18n({...})`) configure runtime
    defaults.
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
$total = @Sum($cart.price)

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
effect(() => {
  $save = http({ url: "/api/draft", method: "PUT", body: $draft })
}, [$draft, "debounce(500)"])

// Actions — camelCase functions. Optional `return`.
function markShipped(orderId) {
  $orders = $orders.map(o => o.id == orderId ? {...o, status: "shipped"} : o)
  $ship   = http({ url: "/api/orders/" + orderId + "/ship", method: "POST" })
  return orderId
}

// HTTP — the single primitive. Returns a reactive resource bag.
$orders = http({
  url:    "/users/42/orders",
  method: "GET",
  query:  { limit: 10 }
})
// $orders.data | .error | .status | .loading | .headers | .lastUpdated
// $orders.refetch() | $orders.cancel()

// Router — `Router({…})` is a regular function call. `params` is bound
// inside each matched arm (captures from `:id`, `*`).
pages = Router({
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
emit("order:selected", { id: order.id })

// Internationalisation.
$i18n   = i18n({ locale: "en", messages: { greeting: "Hello, ${name}!" }, fallback: "en" })
welcome = t("greeting", { name: $user.name })
locale  = Locale()

// Per-instance state — every Counter() call holds an independent atom.
function Counter(label) {
  $n = 0
  return Stack([
    Text(`${label}: ${$n}`),
    Button("inc", { onClick: () => $n = $n + 1 })
  ])
}
aktion = Stack([Counter("A"), Counter("B")])  // two independent counters

// Content-addressed identity — `key:` survives sibling reorders.
function TaskRow(task) {
  return Stack([Text(task.title), TaskMenu(task.id)], { key: task.id })
}
```

**Standard helper components.** These ship as library components, not
language keywords, to keep the core small:

- `Async(resource, { loading, error, empty, data })` — branches on an
  `http({...})` resource state.
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
| Push siblings to opposite edges in a row    | `Spacer()` (inside `Stack([...], { direction: "row" })`)                                                       |

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

### In-script theming with `Theme({...})`

When the user **explicitly asks for a brand or product feel** ("make it
look like GitHub", "use our company colours"), emit a `Theme({...})`
declaration on a top-level binding called `theme`. The runtime evaluates
the call and writes the token map to the host as CSS custom properties.

```javascript
theme = Theme({
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
aktion = Stack([...])
```

**Rules:**

- `Theme(...)` expects the **structured form** — top-level groups must
  be one of `colors`, `radius`, `font`, `motion`, `elevation` (plus the
  metadata keys `name` and `direction`). Flat-shape keys
  (`Theme({ colorPrimary: ... })`) raise a schema-validator error.
- Put `theme = Theme({...})` **before** the `aktion = ...` line so the
  tokens are visible when the rest of the program streams in.
- Stick to documented keys. The runtime ignores unknown keys inside a
  group, so typos fail silent.
- **Don't double-pay tokens.** If `Theme(...)` already sets `colors.primary`,
  do NOT also pass `"primary"` overrides on individual components.
- Removing the `Theme(...)` line snaps the UI back to the base theme.

### Anti-patterns (never ship these)

| Wrong                                                                       | Right                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Single `Card([CardHeader, Text])` for a dashboard request                   | Use the **dashboard recipe** in §16 Pattern C                                                |
| Vertical `Stack` of `StatCard`s                                             | `Stats([StatCard(...), ...])`                                                                |
| `Stack([...], { direction: "row", wrap: true })` for uniform tiles          | `Grid(items, { columns, gap })`                                                              |
| Vertical `Stack` of `Text("Label: " + value)` lines on a detail page       | `DescriptionList([DescriptionItem(label, value, { icon })])`                                 |
| Table with no `Toolbar` above it                                            | Wrap in `Card([SectionHeader(...), Toolbar({...}), Table(...)])`                             |
| Flat form on the page                                                       | Group `FormControl`s inside Cards opened by `SectionHeader`                                 |
| Settings with no sectioning                                                 | A `Stack` of Cards, one per concern (General, Notifications, Billing, Danger zone)          |
| Plain text for status / priority / count                                    | `Badge` or `StatusDot`                                                                      |
| No nav for a multi-page surface                                             | `AppShell(Sidebar(...), [...])` — sidebar stays visible across content                       |
| Empty list rendered as bare grey text                                        | `EmptyState(title, { description, icon, action: Button(...) })`                              |
| Hand-rolled progress bar inside a Stack                                     | `Progress(value, { max, label, tone })` or `ProgressRing({...})`                             |
| `$state x = …` / `$persist x = …` / `$computed x = …`                       | `$x = …` — one atom kind covers every use case                                              |
| `root = Stack([...])`                                                       | `aktion = Stack([...])` — `aktion` is the canonical entry point                              |

---

## 1. Mental model

Aktion is a **streaming-first declarative DSL** whose surface syntax is
a strict subset of standard JavaScript. A program is a flat list of
`name = expression` statements. The renderer evaluates them lazily,
re-parses the stream on every chunk, and silently treats undefined
references as empty — so a partially-streamed program renders
progressively from the top.

Three identifier conventions cooperate:

- **Plain bindings**: `name = expression` — a non-reactive alias.
  Reading it never subscribes; the value is captured once when the
  statement runs.
- **Reactive atoms**: `$name = value` — a single tracked cell. Reading
  `$name` subscribes the surrounding component / effect; writing inside
  a function body or effect callback notifies subscribers.
- **Reserved built-ins**:
  - `aktion` (the UI root, required first line).
  - `theme` (optional in-script `Theme({...})` brand override).
  - `route` (router-owned reactive surface — `route.path`,
    `route.params`, `route.query`, `route.pattern`,
    `route.navigate("/path")`).
  - `$i18n` (i18n bundle handle).
  - `$http` (HTTP defaults configured via `Http({...})`).

Two function conventions cooperate at the top level:

- `function PascalName(args) { … return Expression }` — a component.
  First-class UI primitive with optional defaults and per-instance state.
  MUST end with an explicit `return`.
- `function camelName(args) { … }` — an action. Imperative side-effect
  block triggered by events. MAY `return` a value.

Effects are declared via the `effect(callback, deps)` function call:

- `effect(() => { … }, [$atom, "mount", "every(N)", "debounce(N)"])` —
  declarative background work with dependencies. Dependencies can be
  `$atom` references or string qualifiers: `"mount"`, `"unmount"`,
  `"every(N)"`, `"debounce(N)"`, `"throttle(N)"`.

Everything else (`http({...})`, `Router({...})`, `Theme({...})`,
`i18n({...})`, `Toast(...)`, `Stack(...)`) is a regular function /
component call.

### Three layers

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1 — Declarative tree                                      │
│   Composition of components. Pure data. Re-computed every       │
│   render. Lazy: each `name = Expr` is a function of the current │
│   state, evaluated only when something downstream needs it.     │
│                                                                 │
│       aktion = Stack([header, body])                            │
│       header = PageHeader("Hi", { subtitle: "Welcome" })        │
│       body = Card([Text($message)])                             │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ depends on
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2 — Reactive state + HTTP                                 │
│   `$variables` (read/written by humans and by JS) and           │
│   `http({...})` resource bags. A change to either               │
│   schedules a re-render.                                        │
│                                                                 │
│       $message = "Hello"                                        │
│       $data    = http({ url: "/api/metrics", query: { days } }) │
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

1. **`aktion = …` first.** Always.
2. **Function declarations** that `aktion` references.
3. **State declarations** (`$days = "7"`).
4. **Leaf data** (long arrays, big strings, generated tables) on their
   own trailing lines.

Example:

```javascript
aktion = Stack([hero, kpis, chart, footer])

hero    = Card([CardHeader("Q3 Performance", { subtitle: "Revenue and growth" })])
kpis    = Stats([
  StatCard("Revenue", { value: `$${data.revenue}`, trend: "up", delta: "+12%" }),
  StatCard("Growth",  { value: data.growth_pct, trend: "up" })
])
chart   = LineChart({ labels: months, series: [series] })
footer  = Text("Generated by Aktion", { variant: "small", tone: "muted" })

$days   = "90"
$data   = http({ url: "/api/perf", query: { days: $days } })
months  = ["Jul", "Aug", "Sep"]
series  = Series("Revenue", { values: [120000, 145000, 162000] })
```

### Forward references (hoisting)

Names are resolved lazily — every identifier reference re-evaluates the
binding when read. That's why `aktion = Stack([greeting])` works even
when `greeting = Card(...)` is defined later.

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
  surrounding component / effect; writing notifies subscribers.

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

aktion = Stack([Counter("A"), Counter("B")])  // independent counters
```

### Computed values

There is no dedicated `$computed` keyword. Just compute:

```javascript
$cart  = []
$total = @Sum($cart.price)
$open  = @Filter($todos, "done", "==", false)
```

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
use the `Storage` global (§12):

```javascript
// Sync a single $variable to localStorage manually.
effect(() => {
  Storage.set("draft", $draft)
}, [$draft, "debounce(500)"])

effect(() => {
  $draft = Storage.get("draft") ?? ""
}, ["mount"])
```

### Setup bindings (reserved)

- `$http = Http({ baseUrl, headers, retry, timeout })` configures
  HTTP defaults (§7).
- `$i18n = i18n({ locale, messages, fallback })` configures
  internationalization (§13).
- `theme = Theme({ colors, radius, font, motion, elevation })` brands
  the UI (§14).

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

- Components **must** end with an explicit `return <expression>`.
- Defaults use `= expression` in destructured options.
- Per-instance state: any `$name = value` declared inside the body is
  private to that instance.

### Call sites

```javascript
aktion = Stack([
  UserCard($alice),
  UserCard($bob, { tone: "primary" }),
  UserCard($carol, { tone: "warning" })
])
```

**Named-props placement.** The named-props object literal is canonically
placed *after* the positional arguments (`Button("Save", { variant: "primary" })`).
The runtime also accepts a *leading* props object for components that take
children as the trailing positional (`Grid({ columns: 12 }, [Card1(), Card2()])`);
both forms route through the same slot mapping. If a user component's
trailing object has no key matching any of the component's parameters,
it is forwarded positionally — so an opaque "slots" or data bag can be
passed without surprises (`function Card(title, slots) { … }` called as
`Card("Hello", { footer: Text("…") })`).

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
`onChange`, `onSubmit`, `action`) or as an expression.

```javascript
function save(item) {
  $items = [...$items, item]
  $save  = http({ url: "/api/save", method: "POST", body: { item: item } })
  emit("saved", { id: item.id })
}

submitBtn = Button("Save", { onClick: save })
```

### Body grammar

Inside an action body the imperative surface is small:

- Assignments: `$x = newValue`, `$x += 1`, `$x = { ...$x, field: v }`.
- `http({ ... })` — fire a request.
- `emit("event-name", { detail })` — dispatch a `CustomEvent` on the
  host element.
- `route.navigate("/path")` — programmatic navigation.
- `Storage.set(...)`, `console.log(...)` — global namespaces (§12).
- Standard JS control flow: `if`/`switch`/`for`.
- `return` — optionally yields a value to the caller.

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
  $todos = @Filter($todos, "id", "!=", id)
}
```

**Optimistic update with rollback:**

```javascript
function shipOrder(orderId) {
  let prev = $orders
  $orders = $orders.map(o => o.id == orderId ? {...o, status: "shipped"} : o)
  $ship   = http({ url: "/api/orders/" + orderId + "/ship", method: "POST" })

  effect(() => {
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
  $create = http({
    url:    "/api/posts",
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
The signature is `effect(callback, dependencies)`:

```javascript
effect(() => {
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
  $now = @Now()
  effect(() => { $now = @Now() }, ["every(1000)"])
  return Text(@FormatDate($now, "time"))
}

effect(() => {
  $results = http({
    url:   "/api/search",
    query: { q: $query, page: $page }
  })
}, [$query, $page, "debounce(250)"])
```

`effect(() => { ... })` with no second argument is equivalent to
`effect(() => { ... }, ["mount"])`.

### Scope — top-level vs. component-local

An `effect` can live in **two** places:

| | Top-level effect | Component-local effect |
| --- | --- | --- |
| **Location** | Next to other top-level bindings. | Inside a component function body. |
| **Mounted** | Once, when the program first runs. | Once per component instance. |
| **Unmounted** | When the program is replaced. | When the instance disappears. |

**Top-level effect:**

```javascript
aktion = App()
$value = 10

effect(() => {
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
  effect(() => {
    $value = $value + 1
  }, ["every(1000)"])
  return Box([Text("Value: " + $value)])
}
aktion = App()
```

### Cleanup

Use `cleanup(fn)` inside an effect callback to register teardown for
intervals, listeners, observers:

```javascript
effect(() => {
  const onKey = (e) => {
    if (e.key === "k" && e.metaKey) ctx.host.emit("toggle-palette", {})
  }
  document.addEventListener("keydown", onKey)
  cleanup(() => document.removeEventListener("keydown", onKey))
}, ["mount"])
```

### Common effect recipes

**Sync to storage:**

```javascript
effect(() => {
  Storage.set("draft", $draft)
}, [$draft, "debounce(500)"])
```

**Periodic refresh:**

```javascript
effect(() => {
  $orders.refetch()
}, ["every(30000)"])
```

**Cross-cutting analytics on route changes:**

```javascript
effect(() => {
  const onChange = () => {
    ctx.host.dispatchEvent(new CustomEvent("track", { detail: { event: "page_view", path: location.hash } }))
  }
  ctx.host.addEventListener("route-change", onChange)
  cleanup(() => ctx.host.removeEventListener("route-change", onChange))
}, ["mount"])
```

---

## 7. HTTP — `http({...})`

There is exactly one HTTP primitive: the `http({ ... })` function.

### Reads (GET / HEAD / OPTIONS)

```javascript
$orders = http({
  url:    "/api/users/" + $userId + "/orders",
  method: "GET",
  query:  { limit: 5, status: "open" },
  headers:{ "X-Tenant": $tenant }
})
```

The runtime tracks **every reactive read inside the options object**
and re-issues the request whenever they change.

### Writes (POST / PUT / PATCH / DELETE)

```javascript
function saveOrder(payload) {
  $save = http({ url: "/api/orders", method: "POST", body: payload })
  emit("assistant-message", { message: "Saved." })
}
```

### Reactive resource shape

```javascript
$orders.data         // parsed response body (null until resolved)
$orders.error        // null on success
$orders.status       // HTTP status code
$orders.loading      // true while in-flight
$orders.headers      // response headers
$orders.lastUpdated  // ms-epoch of last success
$orders.refetch()    // re-issue the request
$orders.cancel()     // abort in-flight request
```

### `Async(resource, …)` wrapper

```javascript
view = Async($orders, {
  loading: LoadingState("Loading orders…"),
  error:   ErrorState("Couldn't fetch orders"),
  empty:   EmptyState("No orders yet"),
  data:    Table([Col("Item", $orders.data.title), Col("Total", $orders.data.total, { format: "currency" })])
})
```

### Optional `Http({ ... })` defaults

```javascript
$http = Http({
  baseUrl: "https://api.example.com",
  headers: { "Accept": "application/json" },
  timeout: 10000,
  retry:   { count: 2, backoff: "exponential" }
})

// All subsequent http({...}) calls inherit these.
$orders = http({ url: "/orders" })
```

---

## 8. Built-in `@`-functions

All built-ins use the `@` prefix and may appear anywhere in an
expression. They are **pure** — no side effects, no I/O.

### Aggregation

| Function           | Purpose                                |
| ------------------ | -------------------------------------- |
| `@Count(arr)`      | Number of items.                       |
| `@Sum(arr)`        | Sum of numeric items.                  |
| `@Avg(arr)`        | Mean of numeric items.                 |
| `@Min(arr)`        | Smallest numeric value.                |
| `@Max(arr)`        | Largest numeric value.                 |
| `@First(arr)`      | First item or `null`.                  |
| `@Last(arr)`       | Last item or `null`.                   |

### Numeric

| Function                          | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `@Round(n, decimals?)`            | Round to N decimal places.             |
| `@Abs(n)` / `@Floor(n)` / `@Ceil(n)` | Standard math.                     |
| `@Clamp(n, min, max)`             | Constrain into a range.                |
| `@Pow(base, exp)` / `@Sqrt(n)` / `@Log(n)` | Standard math.               |
| `@Random()`                       | Random number in `[0, 1)`.             |

### Array shape

| Function                                    | Purpose                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| `@Filter(arr, "field", "op", value)`        | Keep items matching a comparator.                               |
| `@Sort(arr, "field", "asc" \| "desc")`      | Stable sort by field.                                           |
| `@Find(arr, "field", "op", value)`          | First match (or `null`).                                        |
| `@GroupBy(arr, "field")`                    | `{ groupKey: [items…] }`.                                       |
| `@Slice(arr, start?, end?)`                 | Standard slice.                                                 |
| `@Reverse(arr)`                             | Reversed copy.                                                  |
| `@Unique(arr, "field"?)`                    | Deduplicate.                                                    |
| `@Range(start, end, step?)`                 | Inclusive integer range.                                        |
| `@Repeat(value, n)`                         | Repeat a value N times.                                         |
| `@Pick(obj, ["a", "b"])`                    | Keep only the listed keys.                                      |

### Formatting

| Function                                                            | Purpose                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@Format(value, mode?, options?)`                                   | Locale-aware number formatter. Modes: `"number"`, `"currency"`, `"percent"`, `"compact"`. |
| `@FormatDate(value, format?)`                                       | Formats a date. Named modes: `"relative"`, `"date"`, `"time"`, `"datetime"`, `"iso"`. |
| `@Plural(n, "singular", "plural"?)`                                 | Returns `"1 order"` / `"2 orders"`.                                        |

### Date / time

| Function                       | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `@Now()`                       | Current moment as epoch ms.                |
| `@Today()`                     | Today's date at midnight, ISO string.      |
| `@AddDays(date, n)`            | Shift a date by N days.                    |
| `@AddHours(date, n)`           | Shift a date by N hours.                   |
| `@DiffDays(start, end)`        | Whole-day difference.                      |
| `@StartOfWeek(date)`           | UTC Sunday 00:00:00 for the week.          |
| `@EndOfMonth(date)`            | Last moment of the calendar month.         |

### String

| Function                                                                     | Purpose                              |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| `@Capitalize(s)` / `@Lowercase(s)` / `@Uppercase(s)` / `@Titlecase(s)`      | Standard case operations.            |
| `@Case(value, "camel" \| "snake" \| "kebab" \| "pascal")`                    | Re-case a value.                     |
| `@Join(arr, sep?)`                                                           | Join with separator.                 |
| `@Split(s, sep?)`                                                            | Split on separator.                  |
| `@Trim(s)` / `@StartsWith(s, p)` / `@EndsWith(s, p)` / `@Contains(s, p)`   | Standard string ops.                 |
| `@Replace(s, search, replacement?)`                                          | Replace all occurrences.             |
| `@Substring(s, start, end?)`                                                 | Standard substring.                  |
| `@Match(s, pattern)`                                                         | Boolean regex match.                 |

### Array shortcuts (not functions)

- `$rows.length` — element count.
- `$rows.first` / `$rows.last` — first or last element.
- **Array pluck**: `$rows.title` returns `[row.title for each row]`.

### Control-flow

Control flow uses standard JavaScript syntax:

```javascript
active = $tab == "billing" ? billingPanel : overviewPanel
list   = $todos.map(item => TaskRow(item))
```

For multi-way dispatch inside function bodies, use `switch`:

```javascript
function getPanel(stage) {
  switch (stage) {
    case "done": return Done()
    case "ready": return Ready()
    default: return Pending()
  }
}
```

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

`Stack`, `StackItem`, `Grid`, `GridItem`, `Box`, `Container`, `Spacer`,
`Card`, `CardHeader`, `CardFooter`, `Separator`, `Tabs`, `TabItem`,
`Accordion`, `AccordionItem`, `Modal`, `Drawer`, `Steps`, `AspectRatio`,
`ScrollArea`, `Sticky`, `ResizablePanels`, `MasonryGrid`.

Notes:

- `aktion` MUST resolve to a top-level container (`Stack`, `AppShell`,
  `Container`, `Card`, or a user component returning one of those).
- Wrap each major chunk in a `Card` for visual grouping.
- Prefer `Grid(items, { columns, gap })` over
  `Stack([...], { direction: "row", wrap: true })` for uniform children.
- Use `Container(children, { size })` for comfortable max-width.
- Use `Spacer()` inside `Stack([...], { direction: "row" })` to push
  items apart.

### Content

`Text`, `Image`, `Icon`, `Link`, `Badge`, `BadgeList`, `Callout`,
`Quote`, `CodeBlock`, `Skeleton`, `Spinner`, `Markdown`, `Kbd`.

Notes:

- `Text(value, { variant, tone, style })` renders inline text.
- `Badge(label, { variant, icon, size })` for pills;
  `BadgeList(["a","b","c"], { variant, size })` for arrays.
- `Icon(name, { variant, size })` for a standalone Font Awesome icon.

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
- Prefer `Switch` over `Checkbox` for settings.
- `SearchBar(id, { placeholder, value, shortcut })` for filter fields.
- `FormSection(label, children, { helper })` for related fields.

### Data

`Table`, `Col`, `DataGrid`, `List`, `ListItem`, `StatCard`, `Stats`,
`Sparkline`, `Tile`, `Progress`, `ProgressRing`, `Pagination`, `Tree`,
`TreeNode`, `CalendarView`, `ComparisonTable`, `InfiniteList`.

Notes:

- Build columns with array pluck: `Col("Title", data.rows.title, { format, align })`.
- `DataGrid` adds sortable headers, filter chips, row selection,
  pagination.

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

### Editors

`RichTextEditor`, `CodeEditor`.

### Advanced UI

`IconButton`, `CommandPalette`, `FilterChips`, `FieldRepeater`,
`VirtualList`, `QueryBuilder`, `DiffViewer`, `JsonTree`, `Gantt`,
`Truncate`, `InlineEdit`, `NotificationBell`.

### Helpers

`Async`, `Show`, `Portal`, `Redirect`, `Lazy`, `ErrorBoundary`.

### Escape hatches — last-resort raw HTML / CSS

`HTMLTag`, `Styles`.

```javascript
aktion = Stack([
  Styles(`
    .hero-callout { background: linear-gradient(135deg, #6366f1, #10b981); color: white; padding: 24px; border-radius: 12px; }
    .hero-callout h2 { margin: 0 0 8px; font-size: 22px; }
  `),
  HTMLTag("div", { attributes: { class: "hero-callout" }, children: [
    HTMLTag("h2", { children: [Text("Custom block")] }),
    Text("Use HTMLTag + Styles only when the standard catalogue cannot capture the design.")
  ]})
])
```

---

## 10. JavaScript layer

Aktion programs ARE JavaScript. The entire surface syntax is standard JS,
so there is no separate "escape hatch" — all browser APIs are directly
accessible inside function bodies and effect callbacks.

### The `ctx` bridge

Inside effect callbacks and action functions, a `ctx` object provides
access to the host:

- `ctx.host` — the `<aktion-app>` host element (for `dispatchEvent`).
- `ctx.state` — `{ get(name), set(name, value) }` for reactive atoms.
- `ctx.cleanup(fn)` — register teardown (same semantics as `cleanup()`).
- `ctx.tools` — host-registered endpoint catalog.
- `ctx.args` — when invoked from a lambda, the call's arguments keyed
  by name.

### Common recipes

**Clipboard:**

```javascript
function copyShareLink() {
  navigator.clipboard.writeText(window.location.href)
  emit("assistant-message", { message: "Link copied" })
}
```

**Keyboard shortcuts:**

```javascript
effect(() => {
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
  $now = @Now()
  effect(() => {
    const id = setInterval(() => { $now = Date.now() }, 1000)
    cleanup(() => clearInterval(id))
  }, ["mount"])
  return Text(@FormatDate($now, "time"))
}
```

**Host-registered tool call:**

```javascript
function loadOrders() {
  const data = await ctx.tools.list_orders({ limit: 10 })
  $orders = data
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

picker = FileUpload("upload", { label: "Drop files", action: upload })
```

The CSP note: effect callbacks and action functions are evaluated with
`new Function(...)` which requires `'unsafe-eval'` if you embed
`<aktion-app>` behind a Content Security Policy.

---

## 11. Routing

The router is a plain function call. `Router({ "/path": ... })` returns
the matched arm's evaluated value — assign the result to any binding.

```javascript
pages = Router({
  "/":             Dashboard(),
  "/orders":       OrdersPage(),
  "/orders/:id":   OrderDetail({ id: params.id }),
  "/settings/*":   SettingsArea({ rest: params._ }),
  default:         NotFound()
})

aktion = AppShell(MainSidebar(), pages, TopBar())
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
  inner = Router({
    "/settings/profile":       ProfilePane(),
    "/settings/billing":       BillingPane(),
    "/settings/notifications": NotificationsPane(),
    default:                   ProfilePane()
  })
  return Stack([SettingsSidebar(), inner], { direction: "row", gap: "l" })
}

pages = Router({
  "/":           Dashboard(),
  "/settings/*": SettingsArea(),
  default:       NotFound()
})
```

---

## 12. Globals — `Storage`, `console`

Two namespace globals are always in scope — no import, no declaration.

### `Storage` — browser storage

```javascript
// localStorage is the default; `Storage.local` is its alias.
Storage.set("name", "John")
$name = Storage.get("name")
Storage.remove("name")
Storage.clear()

// Per-tab sessionStorage.
Storage.session.set("draft", $draft)
$draft = Storage.session.get("draft")

// Cookies — options in second/third arg.
Storage.cookies.set("user", "John", { expires: 7, path: "/", domain: "example.com", secure: true, sameSite: "Lax" })
$user = Storage.cookies.get("user")
Storage.cookies.remove("user", { path: "/" })
Storage.cookies.clear()
```

### `console` — host console forwarder

```javascript
console.log("Hello", $user)
console.error("Failed", $error)
console.warn("Deprecated path")
console.info("Route changed", route.path)
console.debug({ days: $days, count: $count })
```

Both globals can be used inside function bodies, effect callbacks,
and inline lambdas.

---

## 13. Internationalization

```javascript
$locale = "fr-FR"
$bundle = http({ url: "/i18n/" + $locale + ".json", method: "GET" })
$i18n = i18n({
  locale:   $locale,
  messages: $bundle.data ?? {},
  fallback: "en"
})

Text(t("orders.title"))
Text(t("orders.greeting", { name: $userName }))
```

- `t(key, vars?)` looks up the translation.
- `Locale()` returns the active locale tag.

Reload-friendly pattern:

```javascript
$locale = Storage.get("locale") ?? "en"

function setLocale(next) {
  $locale = next
  Storage.set("locale", next)
}

$i18n   = i18n({ locale: $locale, messages: messages, fallback: "en" })
picker  = Select("locale", { items: [
  SelectItem("en", "English"),
  SelectItem("fr-FR", "Français"),
  SelectItem("de", "Deutsch")
], value: $locale, onChange: setLocale })
```

---

## 14. Theming

### Runtime themes (host-side)

The host page chooses one of seven built-in themes via the `theme`
attribute or `el.setTheme(...)`. Authored programs should be
theme-neutral.

### In-script branding with `Theme({...})`

When the user **explicitly asks for a brand feel**, emit:

```javascript
theme = Theme({
  colors: {
    primary:    "#635bff",
    bg:         "#0a0a23",
    surface:    "#10103a",
    text:       "#ffffff"
  },
  radius: { md: "0.5rem", button: "999px" },
  font:   { family: "Inter, sans-serif", familyHeading: "Inter, sans-serif" }
})

aktion = AppShell(...)
```

### Token groups (structured form is mandatory)

| Group          | Tokens                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| `colors`       | `bg`, `bgSubtle`, `surface`, `surfaceMuted`, `border`, `borderSubtle`, `text`, `textMuted`, `primary`, `primaryHover`, `primaryText`, `accent`, `accentHover`, `accentText`, `focusRing`, `success`, `warning`, `danger`, `info` |
| `radius`       | `xs`, `sm`, `md`, `lg`, `pill`, `button`, `input`, `borderWidth`                          |
| `font`         | `family`, `familyHeading`, `familyMono`, `sizeBase`, `sizeSm`, `sizeLg`, `sizeHeading`, `sizeTitle`, `weightBody`, `weightHeading`, `lineHeightBody`, `lineHeightHeading`, `letterSpacingHeading`, `headingTextTransform` |
| `motion`       | `transitionDuration`                                                                      |
| `elevation`    | `shadowSm`, `shadowMd`, `shadowLg`                                                        |

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
aktion = Stack([brandIcon, kpis, profileTab])
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
  $todos = @Filter($todos, "id", "!=", id)
}

row = (t) => Card([Stack([
  Checkbox("done-" + t.id, { label: t.text, checked: t.done, onChange: () => toggle(t.id) }),
  Button("Delete", { onClick: () => remove(t.id), variant: "ghost", size: "sm" })
], { direction: "row", gap: "m", justify: "between", align: "center" })])

list = $todos.map(t => row(t))

aktion = Stack([
  PageHeader("Todos", { subtitle: `${@Count($todos)} items`, actions: [Button("Clear all", { onClick: () => $todos = [], variant: "ghost" })] }),
  Card([Stack([
    Input("draft", { placeholder: "What needs doing?", value: $draft, onEnter: add }),
    Button("Add", { onClick: add, variant: "primary" })
  ], { direction: "row", gap: "s" })]),
  @Count($todos) == 0
    ? EmptyState("No todos yet", { description: "Add your first task above.", icon: "list-check" })
    : Stack(list, { gap: "s" })
], { gap: "l" })
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

aktion = Grid([
  Counter("A"),
  Counter("B", { initial: 10 }),
  Counter("C", { initial: 100 })
], { columns: { sm: 1, md: 3 }, gap: "l" })
```

### Pattern C — Dashboard with KPIs + chart + table

```javascript
function refresh() { $orders.refetch() }
function exportCsv() { $exp = http({ url: "/api/exports/orders.csv", method: "POST" }) }
function newOrder() { route.navigate("/orders/new") }

$orders = http({ url: "/api/orders", method: "GET", query: { range: $range } })
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
    { actor: "Asha", title: "Approved refund for #4821", time: @FormatDate(@Now() - 600000, "relative"), icon: "circle-check", tone: "success" },
    { actor: "Wren", title: "Flagged order #4798 for review", time: @FormatDate(@Now() - 3600000, "relative"), icon: "flag", tone: "warning" },
    { actor: "Mira", title: "Updated shipping rules", time: @FormatDate(@Now() - 7200000, "relative"), icon: "truck" }
  ])
])

follow = FollowUpBlock(["Compare to last quarter", "Show only refunds", "Which products underperformed?"])

aktion = Stack([header, filterBar, kpis, chart, ordersTable, activity, follow], { gap: "l" })
```

### Pattern D — Multi-step wizard

```javascript
$step = 0
$data = { name: "", email: "", role: "" }

stepLabels = ["Profile", "Account", "Review"]

function next() { if ($step < 2) { $step = $step + 1 } }
function prev() { if ($step > 0) { $step = $step - 1 } }
function submit() {
  $save = http({ url: "/api/users", method: "POST", body: $data })
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

aktion = Stack([
  PageHeader("Create account", { subtitle: `Step ${$step + 1} of 3` }),
  Steps(stepLabels, { current: $step }),
  current,
  navBtns
], { gap: "l" })
```

### Pattern E — Settings page (sectioned)

```javascript
$profile      = { name: "Alex Diaz", email: "alex@example.com" }
$notify_email = true
$notify_sms   = false
$timezone     = "America/Los_Angeles"
$theme_pref   = "system"

function save() {
  $save = http({ url: "/api/settings", method: "PUT", body: { profile: $profile, notify: { email: $notify_email, sms: $notify_sms }, timezone: $timezone, theme: $theme_pref } })
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

aktion = Stack([
  PageHeader("Settings", { subtitle: "Configure your account and workspace" }),
  general,
  notify,
  prefs,
  danger,
  Buttons([Button("Save changes", { onClick: save, variant: "primary" })])
], { gap: "l" })
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
  $thread = [...$thread, { id: $thread.length + 1, from: "me", body: $draft, time: @FormatDate(@Now(), "time") }]
  $draft  = ""
  emit("assistant-message", { message: "User said: " + $draft })
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

aktion = Stack([
  PageHeader("Support inbox"),
  SplitView(inbox, Stack([thread, composer], { gap: "m" }), { primaryWidth: "320px" })
], { gap: "l" })
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

pages = Router({
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

aktion = AppShell(sidebar, pages, { collapsible: true })
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
    TimelineItem("Database latency",   { time: @FormatDate(@Now() - 1800000, "relative"), description: "p99 latency above 500ms.", icon: "database", tone: "warning" }),
    TimelineItem("Resolved: queue",    { time: @FormatDate(@Now() - 86400000, "relative"), description: "Queue throughput restored.", icon: "circle-check", tone: "success" })
  ])
])

effect(() => {
  console.log("refreshing status")
}, ["every(30000)"])

aktion = Stack([
  PageHeader("Status", { subtitle: "Live availability across our services" }),
  healthBar,
  list,
  timeline
], { gap: "l" })
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

aktion = Stack([hero, picker, table, faq, closing], { gap: "l" })
```

### Pattern J — Checkout flow

```javascript
$step  = "details"
$cart  = [
  { id: 1, title: "Coffee mug",   qty: 2, price: 12.5 },
  { id: 2, title: "Notebook",     qty: 1, price: 18.0 },
  { id: 3, title: "Sticker pack", qty: 3, price: 4.5 }
]
$total = @Sum($cart.map(it => it.qty * it.price))
$customer = { name: "", email: "", address: "" }

function next() { $step = "payment" }
function back() { $step = "details" }
function place() {
  $place = http({ url: "/api/checkout", method: "POST", body: { customer: $customer, items: $cart } })
  $step = "confirm"
}

steps = Steps(["Details", "Payment", "Confirmation"], { current: $step == "details" ? 0 : $step == "payment" ? 1 : 2 })

orderSummary = Card([
  SectionHeader("Order summary"),
  Stack($cart.map(it =>
    Stack([
      Text(`${it.qty} × ${it.title}`),
      Text(@Format(it.qty * it.price, "currency"))
    ], { direction: "row", justify: "between" })
  ), { gap: "s" }),
  Separator(),
  Stack([Text("Total", { variant: "large-heavy" }), Text(@Format($total, "currency"), { variant: "large-heavy" })], { direction: "row", justify: "between" })
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
    Button(`Pay ${@Format($total, "currency", "USD")}`, { onClick: place, variant: "primary" })
  ])
])

confirmation = SuccessState("Order placed", { description: "We'll email you a receipt and tracking number.", action: Button("Continue shopping", { variant: "primary" }) })

content = $step == "details" ? detailsForm : $step == "payment" ? paymentForm : confirmation

aktion = Stack([
  PageHeader("Checkout"),
  steps,
  Grid([content, orderSummary], { columns: { sm: 1, md: 2 }, gap: "l" })
], { gap: "l" })
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
  if ($path.length > 1) { $path = @Slice($path, 0, $path.length - 1) }
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

aktion = Stack([
  PageHeader("Files", { subtitle: "Browse and manage your assets" }),
  breadcrumb,
  toolbar,
  SplitView(Stack(rows, { gap: "s" }), preview, { primaryWidth: "60%" })
], { gap: "l" })
```

### Pattern L — Calendar / scheduler

```javascript
$selected = @Today()
$events   = [
  { date: @Today(),              title: "Team standup",     time: "9:00",  tone: "primary" },
  { date: @AddDays(@Today(), 1), title: "Customer call",   time: "14:00", tone: "info" },
  { date: @AddDays(@Today(), 3), title: "1:1 with manager", time: "11:00", tone: "warning" }
]

dayEvents = @Filter($events, "date", "==", $selected)

calendar = Card([
  SectionHeader("Schedule", { actions: [Button("Add event", { icon: "plus", variant: "primary" })] }),
  CalendarView({ value: $selected, events: $events, onSelect: (d) => $selected = d })
])

list = Card([
  SectionHeader(`Events for ${@FormatDate($selected, "MMM D")}`),
  @Count(dayEvents) == 0
    ? EmptyState("Nothing scheduled", { description: "Pick a different day or add an event.", icon: "calendar-plus" })
    : Stack(dayEvents.map(e =>
        Stack([Badge(e.time, { variant: e.tone }), Text(e.title)], { direction: "row", gap: "m", align: "center" })
      ), { gap: "s" })
])

aktion = Stack([
  PageHeader("Calendar"),
  Grid([calendar, list], { columns: { sm: 1, md: 2 }, gap: "l" })
], { gap: "l" })
```

### Pattern M — Docs portal

```javascript
docTree = [
  TreeNode("Getting started", { children: [
    TreeNode("Installation", { action: () => route.navigate("/docs/install"),    active: route.path == "/docs/install" }),
    TreeNode("Quick start",  { action: () => route.navigate("/docs/quickstart"), active: route.path == "/docs/quickstart" })
  ], expanded: true }),
  TreeNode("Guides", { children: [
    TreeNode("Routing", { action: () => route.navigate("/docs/routing") }),
    TreeNode("Theming", { action: () => route.navigate("/docs/theming") })
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
    case "/docs/routing":    return Markdown("# Routing\n\nUse `pages = Router({ … })`.")
    case "/docs/theming":    return Markdown("# Theming\n\nPick a theme or pass `Theme({…})`.")
    default:                 return Markdown("# Welcome\n\nPick a topic from the tree.")
  }
}

inner = Grid([
  Card([Tree(docTree)]),
  Card([getContent()])
], { columns: { sm: 1, md: 2 }, gap: "l" })

aktion = AppShell(sidebar, Stack([
  PageHeader("Docs"),
  inner
], { gap: "l" }))
```

### Pattern N — Onboarding checklist

```javascript
$tasks = [
  { title: "Connect your data",    description: "Hook up a database.",        done: true,  action: () => route.navigate("/connect") },
  { title: "Invite your team",     description: "Add at least one teammate.", done: false, action: () => route.navigate("/team") },
  { title: "Configure billing",    description: "Pick a plan.",               done: false, action: () => route.navigate("/billing") },
  { title: "Customize your theme", description: "Match your brand.",          done: false, action: () => route.navigate("/theme") }
]

aktion = Stack([
  PageHeader("Welcome to Acme", { subtitle: "Let's get you set up — 4 quick steps." }),
  OnboardingChecklist($tasks, { title: "Setup", description: "Complete these to unlock your full workspace." }),
  Banner("Need help?", { description: "Book a 30-minute call with our team.", action: Button("Schedule", { variant: "primary" }), tone: "info" })
], { gap: "l" })
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

filtered = @Filter(
  $role == "all" ? $people : @Filter($people, "role", "==", $role),
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

aktion = Stack([
  PageHeader("Directory", { subtitle: `${@Count(filtered)} people` }),
  toolbar,
  @Count(filtered) == 0
    ? EmptyState("No matches", { description: "Try a different search term.", icon: "magnifying-glass" })
    : cards
], { gap: "l" })
```

### Pattern P — Brand-themed landing page

```javascript
theme = Theme({
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

aktion = Stack([hero, features, testimonial, closing], { gap: "l" })
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

cardsFor = (colId) => @Filter($cards, "col", "==", colId)

aktion = Stack([
  PageHeader("Sprint board", { subtitle: `${@Count($cards)} cards across ${@Count(columns)} columns` }),
  KanbanBoard(columns.map(c =>
    KanbanColumn(c.title, { items: cardsFor(c.id).map(card =>
      KanbanCard(card.title, { description: card.title, tags: card.tags, assignee: card.assignee, tone: card.tone })
    )})
  ))
], { gap: "l" })
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

list = InboxPanel($threads.map(t => ({ ...t, action: () => open(t.id) })), { title: "Inbox" })

thread = $active
  ? Card([
      SectionHeader($threads.first.title),
      Stack(@Range(1, 3).map(n => ChatBubble("Alex", { body: "Message body " + n })), { gap: "s" }),
      TextArea("reply", { placeholder: "Reply…" }),
      Buttons([Button("Send", { variant: "primary", icon: "paper-plane" })])
    ])
  : EmptyState("Pick a conversation", { description: "Select a thread on the left.", icon: "inbox" })

aktion = Stack([
  PageHeader("Inbox"),
  SplitView(list, thread, { primaryWidth: "360px" })
], { gap: "l" })
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

aktion = Stack([
  PageHeader("Studio", { subtitle: "Compose and publish stories" }),
  Grid([Stack([editor, snippet], { gap: "l" }), metadata], { columns: { sm: 1, md: 2 }, gap: "l" })
], { gap: "l" })
```

### Pattern T — Data explorer

```javascript
$rows = http({ url: "/api/events", method: "GET" })
$sortField = "ts"
$sortDir   = "desc"
$selected  = []

function sortBy(field) {
  if ($sortField == field) { $sortDir = $sortDir == "asc" ? "desc" : "asc" }
  else { $sortField = field; $sortDir = "asc" }
}

bulk = @Count($selected) > 0
  ? Card([Stack([
      Text(`${@Count($selected)} selected`),
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

aktion = Stack([
  PageHeader("Events", { subtitle: `${@Count($rows.data)} events` }),
  bulk,
  Async($rows, {
    loading: LoadingState("Loading events…"),
    error:   ErrorState("Couldn't load events"),
    empty:   EmptyState("No events", { icon: "rectangle-list" }),
    data:    Card([table])
  })
], { gap: "l" })
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

aktion = Stack([
  PageHeader("Travel diary", { subtitle: "A photo a day, every day." }),
  hero,
  Card([SectionHeader("All photos"), gallery])
], { gap: "l" })
```

### Pattern V — Real-time feed

```javascript
$messages = []

effect(() => {
  $messages = [{ id: @Now(), body: "Server tick at " + @FormatDate(@Now(), "time"), tone: "info" }, ...$messages]
  if ($messages.length > 20) { $messages = @Slice($messages, 0, 20) }
}, ["every(2000)"])

feed = Stack($messages.map(m =>
  Card([Stack([
    Badge(@FormatDate(m.id, "time"), { variant: m.tone }),
    Text(m.body)
  ], { direction: "row", gap: "m" })])
), { gap: "s" })

aktion = Stack([
  PageHeader("Live feed", { subtitle: "Auto-updating every 2s" }),
  @Count($messages) == 0
    ? EmptyState("Waiting for events…", { icon: "satellite-dish" })
    : feed
], { gap: "l" })
```

---

## 17. Anti-patterns

Use only the JS-aligned surface. Common shapes to follow:

| Use this                                                                                                 | Notes                                                                                |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `$x = 0`                                                                                                 | One reactive-atom kind. No prefix keyword.                                           |
| `aktion = Stack([...])`                                                                                  | Canonical entry-point binding. The legacy underscore-wrapped entry name is removed.  |
| `Button("Save", { variant: "primary", loading: true })`                                                  | Multi-positional calls raise a schema error — group options into a trailing object.  |
| `function User(u) { return Card([...]) }`                                                                | PascalCase function = component. MUST `return` its tree. The DSL `component` keyword is gone. |
| `function save() { ... }`                                                                                | camelCase function = action. The DSL `action` keyword is gone.                       |
| `effect(() => { ... }, [$x])`                                                                            | Callback + deps array. The old square-bracket effect form is gone.                   |
| `items.map(x => ...)` / `cond ? a : b`                                                                   | Use standard JS `.map()` and ternaries in expression position.                       |
| `switch (value) { case "a": return X; default: return Y }`                                               | Standard JS `switch`. The DSL `match` keyword is gone.                               |
| `Router({ ... })` / `route.path`                                                                         | Capitalised helper, no-underscore route surface. Legacy underscored forms are gone.  |
| `emit("name", { detail })`                                                                               | Function-call syntax. The old whitespace-string form is gone.                        |
| `Storage.set("key", value)`                                                                              | Capitalised global. The lowercase legacy alias is gone.                              |
| `navigator.clipboard.writeText(...)`                                                                     | Direct JS — there is no `js`-wrapper block anymore.                                  |
| `// comment` or `/* … */`                                                                                | Only the two JS comment forms. `#` line comments are no longer parsed.               |
| `Button("Save", { variant: "primary" })`                                                                 | Named props always live inside a trailing `{ ... }` object literal.                  |
| `theme = Theme({ colors: { primary: "..." } })`                                                          | Structured tokens only — flat `colorPrimary`-style keys are gone.                    |
| Font Awesome names (`"heart"`, `"triangle-exclamation"`)                                                 | No emoji in `icon:` slots.                                                           |
| `Series("Name", { values: numbers })`                                                                    | Chart colours come from the theme — don't pass `stroke` / `fill` overrides.          |

---

## 18. Self-check

Before finishing, walk your output and verify:

1. `aktion = ...` is the FIRST line.
2. Every referenced name is defined somewhere.
3. Every defined name (other than `aktion`, `theme`, `$http`, `$i18n`)
   is reachable from `aktion`.
4. Containers reference their children by name; large data arrays
   live on their own trailing lines.
5. Components (PascalCase functions) end with an explicit `return`.
6. Actions (camelCase functions) use `function` keyword.
7. State uses the single-sigil `$name = value` form.
8. HTTP uses `http({ url, method, ... })`; the reactive bag exposes
   `.data` / `.error` / `.loading` / `.status` / `.refetch()` / `.cancel()`.
9. Router uses `Router({...})` and route surface is `route.*`.
10. Effects use `effect(() => { ... }, [deps])` syntax.
11. Named arguments are wrapped in an object: `Button("x", { variant: "primary" })`.
12. Every visible button is wired to a function or a lambda.
13. Icons are Font Awesome names (no `fa-` prefix, no emoji).
14. Density target (§0.5) met for the page type.
15. No hard-coded colours / gradients. All styling uses `tone:` /
    `variant:` / theme tokens.
16. One positional argument max per component call.
17. Comments use only `//` or `/* */`.
18. No DSL JS-wrapper blocks — direct JS lives in function/effect bodies.
19. `emit("name", detail)` function call syntax for events.
20. `Storage.*` (capitalized) for browser storage access.

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
| HTTP — `http({...})`, `Async`, interceptors                            | §7.                                    |
| Built-in `@` functions (aggregation, formatting, dates)                | §8.                                    |
| Component catalog by group                                             | §9.                                    |
| JavaScript layer — `ctx` bridge, browser APIs                          | §10.                                   |
| Routing — `Router`, `params`, `route`                                  | §11.                                   |
| Globals — `Storage`, `console`                                         | §12.                                   |
| Internationalisation — `$i18n`, `t()`, `Locale()`                      | §13.                                   |
| Theming — `Theme({...})`, structured tokens, brand recipes             | §14.                                   |
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
