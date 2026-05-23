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
- [10. JavaScript escape hatch — `js{ … }`](#10-javascript-escape-hatch--js--)
- [11. Routing](#11-routing)
- [12. Globals — `storage`, `console`](#12-globals--storage-console)
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
2. **`_app_ = …` is line one.** Anchor the UI shell so users see structure
   before children arrive. Use forward references
   (`_app_ = Stack([header, list])`) and define `header`, `list` below it.
3. **`$variables` are the single reactive atom kind.** Declare with
   `$name = value`; read or write with `$name`. There are no tiers — one
   kind of atom for every use case. Inside `action` / `effect` / lambda
   bodies the assignment operators `= += -= *= /= ??= ++ --` are allowed.
4. **HTTP is one function.** `http({ url, method, body, headers, query, ... })`
   is the only network primitive. It returns a reactive bag exposing
   `.data | .error | .status | .loading | .headers | .lastUpdated` and the
   callables `.refetch()` / `.cancel()`. The runtime tracks reactive inputs
   inside the options object and re-issues the request when they change.
5. **Components MUST `return`.** `component Name(args) { … return Expression }`
   — always end a `component` body with an explicit `return`.
6. **Actions MAY `return`.** Used as event handlers the return is ignored;
   used as expressions (`$value = greet("Ada")`) the return flows out.
7. **Reach for pattern composites first.** Start with `Hero`, `PageHeader`,
   `SectionHeader`, `Stats`, `Toolbar`, `EmptyState`, `Timeline`,
   `FeatureGrid`, `Testimonial`, `ProfileCard`, `Banner`, `KanbanBoard`,
   `DescriptionList`, `PricingTable`, `StatusDot`, and the **app-shell**
   composites (`AppShell`, `Sidebar`, `SplitView`). They commit a full
   visual section in one line.
8. **One positional argument max per call.** Every component accepts at
   most one positional argument — the canonical primary slot — and every
   other prop is a named arg (`prop: value`). Extra positionals raise a
   **schema-validator error** (the program will not render):
   - ✅ `Button("Save", variant: "primary", loading: $isSaving)`
   - ✅ `StatCard("Revenue", value: "$48k", trend: "up", delta: "+12%")`
   - ❌ `Button("Save", "primary", true)`
9. **`for item in items { Row(item) }` scopes `item` strictly to the body.**
   The loop variable is not state and cannot be read via `ctx.state` from JS.
10. **Pass per-item data to JS via an arg-bag.** From a lambda body:
    `() => { js { /* read ctx.args.id, ctx.state.get(name), … */ } }`.
11. **Prefer declarative builtins** (`[...spread]`, `@Filter`, `@Sort`,
    expression-form `if`/`match`/`for`) over `js{}`. Only reach for JS
    when no builtin captures the change.
12. **Strings come in three flavours.** `"double"`, `'single'`, and
    `` `backtick` ``. Backticks span lines and don't need escapes — use
    them for multi-line script bodies and `${expression}` interpolation.
13. **Use `Grid`, not `Stack(direction: "row", wrap: true)`, for uniform
    tiles.** Use `Stack(direction: "row")` only when items have different
    sizes.
14. **Add status colour everywhere.** `StatCard(..., trend, delta)`,
    `Badge` variants, `TimelineItem(tone)`, `Banner.tone`,
    `StatusDot(label, tone)` — colour conveys meaning.
15. **`storage` and `console` are always-available globals.** Use
    `storage.set/get/remove/clear` (alias `storage.local.*`),
    `storage.session.*`, and `storage.cookies.*` (with named-arg options:
    `expires`, `maxAge`, `path`, `domain`, `secure`, `sameSite`)
    directly — no `js{}` block. `console.log/error/warn/info/debug`
    forwards to the host console.
16. **`pages = _router_({ … })` and `NavLink(label, to)` are always
    available.** The reactive `_route_.path` / `_route_.params` /
    `_route_.query` surface stays live across the whole app; inside an
    arm body the `params` local holds the captured path segments.
    Router arms are ordinary object properties — separate with `:` and
    commas, use `default:` (not `_`). `match` arms follow the same rule.
17. **Density must match the page type.** Dashboards have 6+ named
    sections, detail pages 5+, settings pages 5+, list pages 5+, landing
    pages 5+. If your draft is short, **add a complementary section**
    (recent activity, status, related items, follow-ups) — never ship a
    sparse response.
18. **Icons are Font Awesome names.** Every `icon` prop expects a Free
    Font Awesome name (no `fa-` prefix) — `"house"`, `"chart-line"`,
    `"sack-dollar"`, `"cart-shopping"`, `"circle-check"`. Optional variant
    prefix: `"regular:star"`, `"brands:github"`. Use
    `Icon(name, variant?, size?)` to render a standalone glyph. The CDN
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
21. **Prefer expression-form `if cond { … } else { … }` and
    `match value { … }` over nested ternaries.** Both are lazy — only
    the chosen branch is evaluated, which keeps loop variables in scope
    from leaking into branches that aren't being rendered.
22. **Factor repeated trees with `component Name(args) { … }`
    declarations.** Declare once, call anywhere — including inside
    `for x in xs { … }`. Parameters accept default values and named
    overrides; per-instance `$name` declared inside the body holds an
    independent atom per call site. Components **must** end with an
    explicit `return Expression`. Lambdas `(args) => Card(…)` are an
    alternative for one-off helpers that don't need their own state.
23. **Use responsive prop maps for full pages.** `Grid(items, columns: {sm: 1, md: 2, lg: 4}, gap: "l")`
    and `Stack(children, direction: {sm: "column", md: "row"})` work
    out of the box. Plain numbers / strings still work for simple sections.
24. **Self-decorating defaults are real — drop the obvious props.** Several
    components auto-pick the most-likely value when a prop is omitted, so
    the *minimum useful version* already looks rich. Don't fight it:
    - `StatCard(label, value: …)` auto-picks an icon from the label
      (`"Revenue"` → `sack-dollar`, `"Customers"` → `users`,
      `"Uptime"` → `heart-pulse`).
    - `PageHeader(title)` auto-derives `["Home", title]` as breadcrumbs.
      Pass `breadcrumbs: false` to suppress, or an explicit array to override.
    - `Banner(title, message: …, tone: "success")` auto-picks an icon
      from tone (`primary` → `bolt`, `success` → `circle-check`, …).
    - `Hero(title, subtitle: …)` auto-derives an eyebrow from intent
      keywords ("introducing"/"announcing"/"launch" → "Introducing",
      "beta" → "Beta", "welcome" → "Welcome", "free" → "Free trial").
    - `EmptyState(title)` auto-picks an icon from the title ("messages"
      → `inbox`, "files" → `folder-open`, "analytics" → `chart-pie`).
    - `Avatar(name)` falls back to a deterministic DiceBear illustration
      (`fallback: "initials"` reverts to the two-letter pill).
    - `LineChart(data: [...])` accepts row-shaped shorthand — labels +
      series are derived automatically.
    - `Toolbar(searchable: true)` auto-mounts a `SearchBar` at the start
      of the left slot (pass `searchValue: $q` to bind it).

### Quick reference

Everything an LLM might reach for first:

```text
# Reactive state — one kind, declare with `$name = value`.
$count = 0
$theme = "dark"
$cart  = []
$total = @Sum($cart.price)

# Components are first-class declarations and MUST return.
component UserCard(user, tone: "default") {
  return Stack([
    Avatar(user.name),
    Text(user.role)
  ])
}

# Expression-form control flow.
priorityTone = (p) => match p { "high": "danger" default: "muted" }
greetings    = for u in $users { UserCard(u) }
hint         = if $hasError { Banner("Try again", tone: "danger") } else { null }

# Declarative effects — anonymous, with dependencies in a single bracketed list.
effect [$draft, debounce(500)] {
  $save = http({ url: "/api/draft", method: "PUT", body: $draft })
}

# Actions — optional `return`. Used as event handlers OR as expressions.
action markShipped(orderId) {
  $orders = for o in $orders { if o.id == orderId { {...o, status: "shipped"} } else { o } }
  $ship   = http({ url: "/api/orders/" + orderId + "/ship", method: "POST" })
  return orderId
}

# HTTP — the single primitive. Returns a reactive resource bag.
$orders = http({
  url:    "/users/42/orders",
  method: "GET",
  query:  { limit: 10 }
})
# $orders.data | .error | .status | .loading | .headers | .lastUpdated
# $orders.refetch() | $orders.cancel()

# Router — `_router_({…})` is a regular function call. `params` is bound
# inside each matched arm (captures from `:id`, `*`).
pages = _router_({
  "/":           Dashboard(),
  "/orders/:id": OrderDetail(id: params.id),
  default:       NotFound()
})

# Two-way binding sugar.
NameField = Input(bind:value: $name)

# Lambdas + opaque JS escape hatch (inside action / effect / lambda bodies).
onSearch = (q) => $query = q
onResize = () => js{ window.dispatchEvent(new Event("ui-resize")) }

# Outbound CustomEvent.
emit "order:selected" { id: order.id }

# Internationalisation.
$i18n   = i18n({ locale: "en", messages: { greeting: "Hello, ${name}!" }, fallback: "en" })
welcome = t("greeting", { name: $user.name })
locale  = Locale()  # e.g. "en", "fr-FR" — feed to @Format / @FormatDate

# Per-instance state — every Counter() call holds an independent atom.
component Counter(label) {
  $n = 0
  return Stack([
    Text(`${label}: ${$n}`),
    Button("inc", onClick: () => $n = $n + 1)
  ])
}
_app_ = Stack([Counter("A"), Counter("B")])  # two independent counters

# Content-addressed identity — `key:` survives sibling reorders.
component TaskRow(task) {
  return Stack([Text(task.title), TaskMenu(task.id)], key: task.id)
}
```

**Standard helper components.** These ship as library components, not
language keywords, to keep the core small:

- `Async(resource, loading:, error:, empty:, data:)` — branches on an
  `http({...})` resource state.
- `Show(when, fallback?, children)` — sugar over `if`.
- `Portal(children, target?)` — render outside the parent subtree.
- `Redirect(path)` — router-aware navigate-and-unmount.
- `Lazy(loader, fallback?)` — defer children until `loader` resolves.
- `ErrorBoundary(children, fallback?, onError?)` — catches descendant
  rendering errors.

**Escape hatches (last resort).** When the standard catalogue cannot
express the markup or styling you need, two primitives are available:

- `HTMLTag(tag, attributes?, children?)` — render an allow-listed HTML
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
| A page title + breadcrumbs + actions        | `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)`                                              |
| A sub-section title inside a Card           | `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)`                                                |
| A row of KPIs                               | `Stats([StatCard(...), ...])`                                                                                  |
| A compact inline stat strip (3–6 items)     | `Stats([{label, value, hint?, tone?}, ...], layout: "strip")`                                                  |
| Quick-action / category tiles               | `Grid([Tile(label, icon?, value?, description?, tone?, action?), ...], columns?)`                              |
| A filter + actions bar above a list/table   | `Toolbar([searchControls...], [actions...])`                                                                   |
| A polished search input                     | `SearchBar(id, placeholder?, value?, shortcut?, action?)`                                                      |
| A key/value summary on a detail page        | `DescriptionList([DescriptionItem(label, value, icon?)])`                                                      |
| Inline health pip                           | `StatusDot(label, tone?, pulse?)`                                                                              |
| Pricing tiers                               | `PricingTable([PricingCard(plan, price, period?, ...)])`                                                       |
| App-level navigation                        | `AppShell(Sidebar(...), [content...], topbar?)`                                                                |
| Master/detail (inbox, file browser)         | `SplitView([primary...], [detail...], primaryWidth?)`                                                          |
| Empty list                                  | `EmptyState(title, description?, icon?, action?)`                                                              |
| Activity feed                               | `Timeline([TimelineItem(title, time?, description?, icon?, tone?)])`                                           |
| Kanban / task board                         | `KanbanBoard([KanbanColumn(title, items: [KanbanCard(...)], tone?)])`                                          |
| Hero / marketing intro                      | `Hero(title, subtitle?, primary?, secondary?, eyebrow?, highlights?, imageSrc?, tone?)`                        |
| Image-led hero (product, article)           | `Hero(title, imageSrc: ..., subtitle?, eyebrow?, caption?, actions?, tone?, height?, layout: "cover")`         |
| Feature highlights                          | `FeatureGrid([FeatureItem(title, description?, icon?, tone?)])`                                                |
| Product / article preview card              | `MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?)`                       |
| Star rating + review count                  | `Rating(value, max?, label?, count?, size?, interactive?, halfStep?, icon?)`                                   |
| Circular progress / completion ring         | `ProgressRing(value?, max?, label?, caption?, tone?, size?, indeterminate?)`                                   |
| Inline notification (inbox / feed item)     | `Notification(title, message?, time?, icon?, avatarSrc?, tone?, unread?, actions?)`                            |
| Person reference in a row / cell            | `PersonChip(name, role?, avatarSrc?, size?, status?, action?)`                                                 |
| Inline tip / footnote                       | `Callout(title, description?, icon?, variant?, compact: true)`                                                 |
| Pull quote (not a full testimonial)         | `Quote(text, cite?, tone?)`                                                                                    |
| Chat-style message (review, transcript)     | `ChatBubble(author, body, time?, avatarSrc?, from?, status?)`                                                  |
| Centered readable column                    | `Container([content...], size?, maxWidth?, padding?)`                                                          |
| Push siblings to opposite edges in a row    | `Spacer()` (inside `Stack(direction: "row")`)                                                                  |

### Visual hierarchy rules

1. **Status colour for meaning.** Bad: a `Stack` of plain `StatCard`s.
   Good: `StatCard("Revenue", value: "$48k", trend: "up", delta: "+12%", icon: "sack-dollar")` —
   trend + delta + icon together communicate health at a glance.
2. **Font Awesome icons on every iconable slot.** `StatCard`,
   `FeatureItem`, `TimelineItem`, `Banner`, `KanbanCard`, `Callout`,
   `ListItem`, `Badge`, `BreadcrumbItem`, `SidebarItem` all accept an
   `icon`. Set it to a Free Font Awesome name (no `fa-` prefix) such as
   `"sack-dollar"`, `"chart-line"`, `"house"`, `"cart-shopping"`,
   `"circle-check"`. Optional variant prefix: `"regular:star"`,
   `"brands:github"`. Use the dedicated `Icon(name, variant?, size?)`
   component for a standalone glyph. The stylesheet is auto-loaded via
   CDN — **never emit raw emoji**.
3. **Avatar for people, not text.** Author names, assignees, commenters
   render as `Avatar(name, src?, size?)` or via `ProfileCard` / `Comment` /
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
| Landing / marketing   | **5**        | `Hero` + `FeatureGrid` + (`Testimonial` ∣ `Quote` ∣ `PricingTable`) + closing `Banner`                            |
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
  `Badge("Active", variant: "success")`, not `Badge("Active")` with
  manual styling. `Badge`, `StatCard.trend`, `Banner.tone`,
  `Callout.variant`, `TimelineItem.tone`, `KanbanCard.tone`,
  `Quote.tone`, `Progress.tone`, `ProgressRing.tone`, and
  `StatusDot.tone` all map to the active theme's palette.
- **Stick to semantic palette values** — `"default"`, `"primary"`,
  `"success"`, `"warning"`, `"danger"`, `"info"`. Anything else
  (`"red"`, `"#ff0000"`, `"--my-token"`) will render as the default
  tone on every theme except the one you wrote against.
- **Use `Icon` as a visual accent**, never as a colour: the icon
  adopts the surrounding tone token
  (`StatCard("Revenue", trend: "up", icon: "sack-dollar")` renders
  green on `light`, lime on `neon`, and so on).
- **Trust the chart palette.** `Series` colours come from the active
  theme (`chart1`…`chart6`). Never pass a `stroke` / `fill` — there
  is no API for it and the chart would clash with the rest of the page.
- **Brutalist and neon will collapse if you nest gradients.** Stay
  declarative; the theme adds the visual personality.

A correctly-authored response should look polished on `pastel` and
`brutalist` without changes — if you have to "tweak it for dark mode",
you've leaked a colour somewhere.

### In-script theming with `Theme({...})`

When the user **explicitly asks for a brand or product feel** ("make it
look like GitHub", "use our company colours", "I want a Stripe-style
page"), emit a `Theme({...})` declaration on a top-level binding called
`theme`. The runtime evaluates the call and writes the token map to the
host as CSS custom properties — **on top of** whatever base theme the
host configured.

```text
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
_app_ = Stack([...])
```

**Rules:**

- `Theme(...)` expects the **structured form** — top-level groups must
  be one of `colors`, `radius`, `font`, `motion`, `elevation` (plus the
  metadata keys `name` and `direction`). Flat-shape keys
  (`Theme({ colorPrimary: ... })`) and free-form `--rui-...` keys raise
  a schema-validator error.
- Put `theme = Theme({...})` **before** the `_app_ = ...` line so the
  tokens are visible when the rest of the program streams in.
- Stick to documented keys. The runtime ignores unknown keys inside a
  group, so typos fail silent.
- **Don't double-pay tokens.** If `Theme(...)` already sets `colors.primary`,
  do NOT also pass `"primary"` overrides on individual components; rely
  on the token cascade.
- Removing the `Theme(...)` line snaps the UI back to the base theme —
  no manual cleanup required.

**Brand recipes the LLM can compose on demand** (see
[`docs/brand-themes.html`](https://asfand-dev.github.io/aktion/brand-themes.html)
for the full set):

- **GitHub** — sans-serif `-apple-system` stack, blue `#0969da` primary,
  gray-on-white surfaces, 6 px radii, weight-500 buttons.
- **Apple** — SF Pro Display heading, large titles, generous spacing,
  12–14 px button radius, light borders.
- **Stripe** — Sohne / Inter stack, indigo `#635bff` primary, 10 px
  button radius, weight-600 buttons.
- **IONOS** — Inter stack, navy `#003580` primary, cyan `#0095d6`
  accent, 4 px button radius, dense spacing.
- **Notion** — Inter stack, near-black `#191919` primary, generous
  whitespace, soft gray borders.
- **Vercel** — Geist + JetBrains Mono stack, near-black primary,
  inverted black-on-white CTA, ultra-tight radii.

### Anti-patterns (never ship these)

| Wrong                                                                       | Right                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Single `Card([CardHeader, Text])` for a dashboard request                   | Use the **dashboard recipe** in §16 Pattern I                                                |
| Vertical `Stack` of `StatCard`s                                             | `Stats([StatCard(...), ...])`                                                          |
| `Stack(direction: "row", wrap: true)` for uniform tiles                     | `Grid(items, columns?, gap?)`                                                                |
| Vertical `Stack` of `Text("Label: " + value)` lines on a detail page | `DescriptionList([DescriptionItem(label, value, icon?)])`                                   |
| Table with no `Toolbar` above it                                            | Wrap in `Card([SectionHeader(...), Toolbar([...], [...]), Table(...)])`                     |
| Flat form on the page                                                       | Group `FormControl`s inside Cards opened by `SectionHeader`                                 |
| Settings with no sectioning                                                 | A `Stack` of Cards, one per concern (General, Notifications, Billing, Danger zone)          |
| Plain text for status / priority / count                                    | `Badge` or `StatusDot`                                                                      |
| No nav for a multi-page surface                                             | `AppShell(Sidebar(...), [...])` — sidebar stays visible across content                       |
| Empty list rendered as bare grey text                                       | `EmptyState(title, description, icon, Button(...))`                                          |
| Hand-rolled progress bar inside a Stack                                     | `Progress(value, max?, label?, tone?)` or `ProgressRing(...)`                                |
| `Action([...])` payloads on Buttons                                         | `action Name() { … }` declarations + `Button("Save", onClick: Name)`                         |
| `$state x = …` / `$persist x = …` / `$computed x = …`                       | `$x = …` — one atom kind covers every use case                                              |
| `root = Stack([...])`                                                       | `_app_ = Stack([...])` — `_app_` is the canonical entry point                                |

---

## 1. Mental model

Aktion is a **streaming-first declarative DSL**. A program
is a flat list of `name = expression` statements. The renderer evaluates
them lazily, re-parses the stream on every chunk, and silently treats
undefined references as empty — so a partially-streamed program renders
progressively from the top.

Three identifier conventions cooperate:

- **Plain bindings**: `name = expression` — a non-reactive alias.
  Reading it never subscribes; the value is captured once when the
  statement runs.
- **Reactive atoms**: `$name = value` — a single tracked cell. Reading
  `$name` subscribes the surrounding component / effect; writing inside
  an `action` / `effect` / lambda body notifies subscribers.
- **Reserved built-ins**:
  - `_app_` (the UI root, required first line).
  - `theme` (optional in-script `Theme({...})` brand override).
  - `_route_` (router-owned reactive surface — `_route_.path`,
    `_route_.params`, `_route_.query`, `_route_.pattern`,
    `_route_.navigate("/path")`).
  - `$i18n` (i18n bundle handle).
  - `$http` (HTTP defaults configured via `Http({...})`).

Three declaration keywords are reserved at the top level:

- `component Name(args) { … return Expression }` — first-class UI
  primitive with optional defaults and per-instance state.
- `action Name(args) { … }` — imperative side-effect block triggered by
  events. MAY `return` a value.
- `effect [ ...deps ] { … }` — declarative, anonymous background work
  tied to a top-level binding or a single component instance.
  Dependencies (`$atom`, `on:mount`, `on:unmount`, `on:every(N)`,
  `debounce(N)`, `throttle(N)`) sit in the bracketed list. An effect
  declared **inside** a `component { … }` body is scoped to that
  instance — timers, subscriptions, and `cleanup(fn)` registrations
  tear down when the instance leaves the tree.

Everything else (`http({...})`, `_router_({...})`, `Theme({...})`,
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
│       _app_ = Stack([header, body])                             │
│       header = PageHeader("Hi", subtitle: "Welcome")            │
│       body = Card([Text($message)])                      │
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
│   `action` blocks run on click / submit / follow-up.            │
│   `effect` blocks run on mount and re-run when triggers fire.   │
│   Both can update state, call tools, dispatch messages          │
│   — closing the loop back to L2.                                │
│                                                                 │
│       action refresh() { $data.refetch() }                      │
│       btn = Button("Refresh", onClick: refresh)                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why this matters.** Most app behaviour is expressible in L1 + L2 alone.
Reach for L3 only when the change isn't expressible as a pure data
transformation (timers, fetches you control, focus, animation, clipboard,
keyboard shortcuts, audio).

**Rendering is reconciliation, not re-creation.** Every state change
re-runs L1 to produce a fresh tree, but the runtime diffs the new tree
against the live DOM instead of replacing it. That means you can drive
a re-render from anywhere (typing into an input, ticking a counter, an
`http({...})` refreshing) and the user's browser-owned state stays intact:

- A focused `Input` keeps focus, the caret position, the selection, and
  any IME composition through the re-render.
- An open `AccordionItem` stays open.
- The active pane of a `Tabs` stays active.
- A scrolled `ScrollArea` keeps its scroll position.

You do **not** need to wire state for these behaviours — they happen
for free. If you build a custom component that needs to hold UI state
across re-renders, use `helpers.useInstanceState(key, initial)` (the
same slot the built-in `Tabs` uses); the renderer keys the slot by the
component's position in the tree so independent instances never collide.

---

## 2. Anatomy of a response

### Statement shape

```
identifier = Expression
$identifier = Expression            # reactive state declaration
```

- `identifier` is bare: `kebab-case`, `snake_case`, or `lowerCamelCase`.
  No prefix unless it's a state declaration.
- `Expression` is any Aktion expression (component call,
  value, ternary, member access, etc.).
- `$identifier = …` declares a reactive atom. The right-hand side can be
  any expression — literal, computed, or an `http({...})` call.

### Streaming-friendly ordering

The renderer commits one statement at a time as text streams in. To
make your UI render top-down (shell first, leaves last):

1. **`_app_ = …` first.** Always.
2. **Component / action / effect declarations** that `_app_` references.
3. **State declarations** (`$days = "7"`).
4. **Leaf data** (long arrays, big strings, generated tables) on their
   own trailing lines so they appear last.

Example:

```text
_app_ = Stack([hero, kpis, chart, footer])

hero    = Card([CardHeader("Q3 Performance", subtitle: "Revenue and growth")])
kpis    = Stats([
  StatCard("Revenue", value: `$${data.revenue}`, trend: "up", delta: "+12%"),
  StatCard("Growth",  value: data.growth_pct,    trend: "up")
])
chart   = LineChart(labels: months, series: [series])
footer  = Text("Generated by Aktion", variant: "small", tone: "muted")

$days   = "90"
$data   = http({ url: "/api/perf", query: { days: $days } })
months  = ["Jul", "Aug", "Sep"]
series  = Series("Revenue", values: [120000, 145000, 162000])
```

When this streams in, the user sees the four-card layout immediately,
then each card fills in as its definition arrives.

### Forward references (hoisting)

Names are resolved lazily — every identifier reference re-evaluates the
binding when read. That's why `_app_ = Stack([greeting])` works even
when `greeting = Card(...)` is defined later. The same hoisting works
inside expression-form `for` loops:

```text
list = for t in $todos { row(t) }
row  = (t) => Card([Text(t.text), Button("X", onClick: () => remove(t.id))])
```

Even though `row` references the loop variable `t`, lambdas evaluate
fresh per iteration with `t` in scope — so each rendered row sees its
own item.

### Comments

The parser strips three comment styles silently, so they never reach
the renderer:

- `// rest of line` — canonical line comment.
- `# rest of line` — shell/Python-style line comment (identical semantics).
- `/* … */` — block comment, can span multiple lines.

Prefer self-documenting identifiers and leave comments out of your
output. Each comment costs tokens that would be better spent on actual
UI. Name things well — `expandedRowId`, `totalCount`, `formIsValid` —
and let the structure speak for itself.

---

## 3. Reactive state

### One kind, one sigil

Aktion has **one reactive atom kind**. There is no
`$state`, `$persist`, `$session`, `$shared`, or `$computed` keyword —
every reactive cell is declared and read with the same surface:

```text
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
- **Inside `action` / `effect` / lambda bodies**:
  `= += -= *= /= ??= ++ --` are all allowed against any `$name` atom.
- **Nested writes require whole-object replacement.** Direct
  `$user.name = "Alex"` is rejected — spread instead:
  `$user = { ...$user, name: "Alex" }`. Arrays follow the same rule:
  `$todos = [...$todos, item]`,
  `$todos = @Filter($todos, "id", "!=", id)`.

### Component-scoped state

A `$name = value` declared **inside** a `component` body is per-instance
**and the right-hand side is an initializer, not a write**: it runs
exactly once when the instance first mounts. Every subsequent render
sees whatever value the user (or an action / effect) has written —
re-rendering never snaps the value back to the initializer. Two
`Counter()` siblings each hold their own `$count`. Top-level `$name`
declarations live for the lifetime of the response.

Non-literal initializers also work (the expression is fully evaluated
on first mount): `$now = @Now()`, `$n = initial` (referencing a
parameter), `$id = @Uuid()` — all run once per instance.

```text
component Counter(label) {
  $n = 0
  return Stack([
    Text(`${label}: ${$n}`),
    Button("inc", onClick: () => $n = $n + 1)
  ])
}

_app_ = Stack([Counter("A"), Counter("B")])  # independent counters
```

`$x = newValue` outside the top of a component body — inside a lambda,
action, effect, `if` arm, `for` body — is a regular write (not a
re-declaration). The `onClick: () => $n = $n + 1` handler above is a
write against the same per-instance slot the body initialised.

### Computed values

There is no dedicated `$computed` keyword. Just compute:

```text
$cart  = []
$total = @Sum($cart.price)        # re-derives when $cart changes
$open  = @Filter($todos, "done", "==", false)
```

Each read re-evaluates against the current state — the runtime tracks
dependencies via the sigil reads inside the expression.

### URL-synced state

URL state lives on the router, not as a separate tier:

- `_route_.path` — current path (read-only).
- `_route_.params.id` — path parameter; reactive.
- `_route_.query.tab` — query string; reactive (read-only — to change
  the URL, navigate via `_route_.navigate("/path?tab=...")`).
- `_route_.navigate("/path")` — imperative navigation; only valid
  inside `action` / `effect` / lambda bodies.

### Persistence

The runtime keeps `$name` atoms in memory for the lifetime of the
`<aktion-app>` element. Host pages persist them via:

```js
// snapshot every atom into a plain JSON-friendly object
const snapshot = el.serializeState();
sendToClient({ programText: el.response, state: snapshot });

// reapply on the other side
target.loadSnapshot({ programText, state: snapshot });
```

For ad-hoc per-tab / per-browser persistence from inside the script,
use the `storage` global (§12):

```text
# Sync a single $variable to localStorage manually.
effect [$draft, debounce(500)] {
  storage.set("draft", $draft)
}

effect [on:mount] {
  $draft = storage.get("draft") ?? ""
}
```

### Setup bindings (reserved)

- `$http = Http({ baseUrl, headers, retry, timeout })` configures
  HTTP defaults (§7).
- `$i18n = i18n({ locale, messages, fallback })` configures
  internationalization (§13).
- `theme = Theme({ colors, radius, font, motion, elevation })` brands
  the UI (§14).

These declarations are read by the runtime at plan time, not part of
the rendered tree.

---

## 4. Components and lambdas

### Component declarations

```text
component UserCard(user, tone: "default") {
  $hover = false
  return Card([
    Avatar(user.name, size: "md"),
    Text(user.name, variant: "large-heavy"),
    Text(user.role, tone: "muted"),
    Badge(tone, tone: tone)
  ])
}
```

- Components **must** end with an explicit `return <expression>`.
- Defaults use `= expression` (literal or computed in the component's
  scope).
- `children` is the implicit named slot — the trailing positional
  argument at the call site is delivered as `children` inside the body
  (used by helpers like `Show`, `Portal`, `ErrorBoundary`).
- Per-instance state: any `$name = value` declared inside the body is
  private to that instance.

### Call sites

```text
_app_ = Stack([
  UserCard($alice),                                  # positional arg
  UserCard($bob, tone: "primary"),                   # named arg
  UserCard(user: $carol, tone: "warning")            # both named
])
```

### Local helpers — lambda form

Use a lambda binding for one-off helpers that don't need their own
component:

```text
priorityTone = (p) => match p { "high": "danger" "med": "warning" default: "muted" }
rowFor       = (item) => Stack([Badge(item.label, tone: priorityTone(item.priority)), Text(item.title)])
list         = for item in $items { rowFor(item) }
```

### Content-addressed identity — `key:`

Every call site accepts a universal `key:` named argument. The renderer
uses it as the instance suffix instead of source location, so reordering
siblings keeps per-instance state attached to the right element:

```text
component TaskRow(task) {
  $expanded = false
  return Stack([
    Button(task.title, onClick: () => $expanded = !$expanded),
    if $expanded { Text(task.description) } else { null }
  ], key: task.id)
}

list = for t in $todos { TaskRow(t) }
```

Reorder, filter, or paginate `$todos` and each `$expanded` slot follows
its task.

### Anticipatory skeletons

A reference to a component that hasn't been declared yet (and isn't in
the library) renders a `Skeleton` placeholder instead of
`[unknown component: …]`. Mid-stream forward references just shimmer
until the next render pass picks the declaration up.

---

## 5. Actions

An `action` is a callable block of imperative statements. Declare at
the top level (or inside a component body); invoke from any
event-handler prop (`onClick`, `onChange`, `onSubmit`, `action`) or as
an expression.

```text
action save(item) {
  $items = [...$items, item]
  $save  = http({ url: "/api/save", method: "POST", body: { item: item } })
  emit "saved" { id: item.id }
}

submitBtn = Button("Save", onClick: save)
```

### Body grammar

Inside an action body the imperative surface is small:

- Assignments: `$x = newValue`, `$x += 1`, `$x = { ...$x, field: v }`.
- `http({ ... })` — fire a request; the result is a reactive resource
  bag.
- `emit "event-name" { detail }` — dispatch a `CustomEvent` on the
  host element. The conventional `emit "assistant-message" { message: "..." }`
  reports back to the host chat loop.
- `_route_.navigate("/path")` — programmatic navigation.
- `storage.set(...)`, `console.log(...)` — global namespaces (§12).
- Statement-form `if` / `match` / `for` — same keywords as the
  expression forms (covered in §4).
- `return` — optionally yields a value to the caller.
- `js{ /* opaque JS */ }` — escape hatch for browser APIs not exposed
  natively (§10).

### Optional `return`

Actions MAY include a `return` statement. When omitted the action runs
for its side effects and yields `undefined`. When present the result
is observable from `$x = myAction(...)` expressions:

```text
action greet(name) {
  return "Hello, " + name
}
$hello = greet("Ada")   # re-runs whenever the action call's args change
```

### Inline lambdas — the short form

For trivial handlers, skip the `action` declaration entirely:

```text
incBtn   = Button("+",     onClick: () => $count = $count + 1)
resetBtn = Button("Reset", onClick: () => { $count = 0  $message = "" })
copyBtn  = Button("Copy",  onClick: () => { js{ navigator.clipboard.writeText("hi") } })
```

### Common action recipes

**List mutation:**

```text
action add() {
  $todos = [...$todos, { id: $todos.length + 1, text: $draft, done: false }]
  $draft = ""
}

action toggle(id) {
  $todos = for t in $todos { if t.id == id { { ...t, done: !t.done } } else { t } }
}

action remove(id) {
  $todos = @Filter($todos, "id", "!=", id)
}
```

**Optimistic update with rollback:**

```text
action shipOrder(orderId) {
  prev    = $orders
  $orders = for o in $orders { if o.id == orderId { {...o, status: "shipped"} } else { o } }
  $ship   = http({ url: "/api/orders/" + orderId + "/ship", method: "POST" })

  effect [$ship] {
    if $ship.error { $orders = prev }
  }
}
```

**Form submission:**

```text
$title = ""
$body  = ""

action submit() {
  if !$title { return }
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

**Save + refresh chain:**

```text
action saveSettings(settings) {
  $save = http({
    url: "/api/settings",
    method: "PUT",
    body: settings
  })
  $settings.refetch()
  emit "settings:saved" { settings: settings }
}
```

**Navigation:**

```text
action openDetail(id) {
  _route_.navigate("/items/" + id)
}

action openExternal(url) {
  js { window.open(url, "_blank", "noopener,noreferrer") }
}
```

---

## 6. Effects

`effect` blocks attach side effects to a component or top-level binding.
They are **anonymous** — there is no name and no `on` keyword. Every
dependency lives inside a single bracketed list after the keyword:

```text
effect [ ...dependencies ] {
  // body
}
```

A dependency entry is one of:

- `$atom` — re-run when the named reactive atom changes.
- `on:mount` — run once when the surrounding scope mounts.
- `on:unmount` — run once when it unmounts.
- `on:every(N)` — re-run every N milliseconds.
- `debounce(N)` / `throttle(N)` — wrap the body with a trailing-edge
  rate limit.

Dependencies can be combined freely and the order inside the brackets
does not matter:

```text
component LiveClock() {
  $now = @Now()
  effect [on:every(1000)] { $now = @Now() }
  return Text(@FormatDate($now, "time"))
}

effect [$query, $page, debounce(250)] {
  $results = http({
    url:   "/api/search",
    query: { q: $query, page: $page }
  })
}

effect [on:every(1000), throttle(500)] {
  $now = @Now()
}
```

`effect { ... }` (no brackets) is equivalent to `effect [on:mount] { ... }`
— both run the body once on mount.

### Scope — top-level vs. component-local

An `effect` block can live in **two** places, and the location determines
its lifecycle. The dependency-list syntax is identical in both:

| | Top-level effect | Component-local effect |
| --- | --- | --- |
| **Location** | Next to other top-level bindings. | Inside a `component Name() { … }` body. |
| **Mounted** | Once, when the program first runs. | Once per component instance, on its first render. |
| **Unmounted** | When the program is replaced (`setResponse` / `clear()`). | When the instance disappears from the render tree. |
| **Multiplicity** | One shared copy. | One copy per instance — two `App()` calls = two independent timers / cleanups. |

**Top-level effect** — mounts as soon as the program is parsed:

```text
_app_ = App()
$value = 10

effect [on:every(1000)] {
  $value = $value + 1
}

component App() {
  return Box([
    Text("Value: " + $value)
  ])
}
```

**Component-local effect** — same dependency list, declared inside the
component body so its lifecycle is tied to the instance:

```text
_app_ = App()
$value = 10

component App() {
  effect [on:every(1000)] {
    $value = $value + 1
  }
  return Box([
    Text("Value: " + $value)
  ])
}
```

When a component-local effect's instance leaves the tree (conditional
render, list item removed, etc.) the runtime clears its intervals,
unsubscribes its watched atoms, and fires every `cleanup(fn)` it
registered — without affecting any other instance.

Reach for a **component-local** effect when the background work logically
belongs to the UI it serves (per-row polling, focus management for a
modal, observers for a widget). Reach for a **top-level** effect when the
work is global (analytics, app-wide keyboard shortcuts, hydration of a
shared atom).

### Cleanup

Use `cleanup(fn)` inside a `js{ … }` block to register teardown for
intervals, listeners, observers. Cleanup fires before the next re-run
AND on unmount:

```text
effect [on:mount] {
  js{
    const onKey = (e) => { if (e.key === "k" && e.metaKey) ctx.host.emit("toggle-palette", {}) }
    document.addEventListener("keydown", onKey)
    ctx.cleanup(() => document.removeEventListener("keydown", onKey))
  }
}
```

### Common effect recipes

**Sync to storage:**

```text
effect [$draft, debounce(500)] {
  storage.set("draft", $draft)
}
```

**Periodic refresh:**

```text
effect [on:every(30000)] {
  $orders.refetch()
}
```

**Refetch on filter change:**

```text
$query = http({ url: "/api/search", query: { q: $search, limit: 20 } })
# The runtime tracks $search inside the options and re-issues automatically.
# An explicit effect is only needed when you also want to update non-HTTP atoms.
```

**Cross-cutting analytics on route changes:**

```text
effect [on:mount] {
  js {
    const onChange = () => {
      ctx.host.dispatchEvent(new CustomEvent("track", { detail: { event: "page_view", path: location.hash } }))
    }
    ctx.host.addEventListener("route-change", onChange)
    ctx.cleanup(() => ctx.host.removeEventListener("route-change", onChange))
  }
}
```

---

## 7. HTTP — `http({...})`

There is exactly one HTTP primitive: the `http({ ... })` function. Pass
any `fetch`-compatible option (`url`, `method`, `headers`, `body`,
`signal`, `credentials`, …) plus a convenience `query` object that's
serialised into the URL.

### Reads (GET / HEAD / OPTIONS)

```text
$orders = http({
  url:    "/api/users/" + $userId + "/orders",
  method: "GET",
  query:  { limit: 5, status: "open" },
  headers:{ "X-Tenant": $tenant }
})
```

The runtime tracks **every reactive read inside the options object**
(`$userId`, `$tenant`) and re-issues the request whenever they change.

### Writes (POST / PUT / PATCH / DELETE)

Fire writes from inside an `action` body and observe the resulting
resource:

```text
action saveOrder(payload) {
  $save = http({ url: "/api/orders", method: "POST", body: payload })
  emit "assistant-message" { message: "Saved." }
}
```

### Reactive resource shape

Every `http({ ... })` call returns a reactive bag with:

```text
$orders.data         # parsed response body (null until resolved)
$orders.error        # null on success
$orders.status       # HTTP status code, e.g. 200
$orders.loading      # true while the request is in-flight
$orders.headers      # response headers as a plain object
$orders.lastUpdated  # ms-epoch of the last successful response
$orders.refetch()    # re-issue the request
$orders.cancel()     # abort the in-flight request (no-op when idle)
```

### `Async(resource, …)` wrapper

The standard library component
`Async(resource, loading:, error:, empty:, data:)` covers the loading
/ error / empty / data branches uniformly. Prefer it over hand-rolled
`if` chains:

```text
view = Async($orders,
  loading: LoadingState("Loading orders…"),
  error:   ErrorState("Couldn't fetch orders", description: "Try again in a moment."),
  empty:   EmptyState("No orders yet", description: "Place your first order."),
  data:    Table([Col("Item", $orders.data.title), Col("Total", $orders.data.total, format: "currency")])
)
```

### Optional `Http({ ... })` defaults

Configure host-wide defaults once at the top of the response:

```text
$http = Http({
  baseUrl: "https://api.example.com",
  headers: { "Accept": "application/json" },
  timeout: 10000,
  retry:   { count: 2, backoff: "exponential" }
})

# All subsequent http({...}) calls inherit these.
$orders = http({ url: "/orders" })  # resolves to https://api.example.com/orders
```

### Host-side interceptors

For auth headers, CORS workarounds, or refresh-token retries, register
interceptors from the host page:

```js
el.registerHttpInterceptors({
  onRequest:  (req) => ({ ...req, headers: { ...req.headers, Authorization: `Bearer ${token}` } }),
  onResponse: async (res, { retry }) => res.status === 401 ? retry() : res,
  onError:    (err, req) => console.error("HTTP failed", req.url, err),
});
```

`retry()` is a one-shot escape hatch that re-issues the same request
through the interceptor chain.

---

## 8. Built-in `@`-functions

All built-ins use the `@` prefix and may appear anywhere in an
expression. They are **pure** — no side effects, no I/O. Use them for
data shaping, formatting, and inline iteration.

### Aggregation

| Function           | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `@Count(arr)`      | Number of items.                                                |
| `@Sum(arr)`        | Sum of numeric items (or numeric field after a pluck).          |
| `@Avg(arr)`        | Mean of numeric items.                                          |
| `@Min(arr)`        | Smallest numeric value.                                         |
| `@Max(arr)`        | Largest numeric value.                                          |
| `@First(arr)`      | First item or `null`.                                           |
| `@Last(arr)`       | Last item or `null`.                                            |

### Numeric

| Function                          | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `@Round(n, decimals?)`            | Round to N decimal places (default 0). |
| `@Abs(n)` / `@Floor(n)` / `@Ceil(n)` | Standard math.                       |
| `@Clamp(n, min, max)`             | Constrain into a range.                |
| `@Pow(base, exp)` / `@Sqrt(n)` / `@Log(n)` | Standard math.                 |
| `@Random()`                       | Random number in `[0, 1)`.             |

### Array shape

| Function                                    | Purpose                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `@Filter(arr, "field", "op", value)`        | Keep items matching a comparator. Ops: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`. Dotted field paths supported. |
| `@Sort(arr, "field", "asc" \| "desc")`      | Stable sort by field.                                                            |
| `@Find(arr, "field", "op", value)`          | First match (or `null`).                                                         |
| `@GroupBy(arr, "field")`                    | `{ groupKey: [items…] }`.                                                        |
| `@Slice(arr, start?, end?)`                 | Standard slice (non-mutating).                                                   |
| `@Reverse(arr)`                             | Reversed copy (non-mutating).                                                    |
| `@Unique(arr, "field"?)`                    | Deduplicate. Without a field, strict equality; with a field, dedupes by it.       |
| `@Range(start, end, step?)`                 | Inclusive integer range.                                                         |
| `@Repeat(value, n)`                         | Repeat a value N times — handy for skeleton placeholders.                       |
| `@Pick(obj, ["a", "b"])`                    | Reshape an object — keep only the listed keys.                                  |

**Array growth** uses spread: `[...$todos, newItem]` for append,
`[...$a, ...$b]` for concat.

### Formatting

| Function                                                            | Purpose                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@Format(value, "currency" \| "percent" \| "number", currencyOrLocale?, locale?)` | Locale-aware number / currency / percent formatter. Currency defaults to USD. Percent multiplies by 100; pass `0.42` for "42%".  |
| `@FormatDate(value, format?)`                                       | Formats a date. Format is either a moment-like pattern (e.g. `"MMM D"`, `"YYYY-MM-DD"`) or a named mode: `"relative"`, `"date"`, `"time"`, `"datetime"`, `"iso"`. |
| `@Plural(n, "singular", "plural"?)`                                 | Returns `"1 order"` / `"2 orders"`.                                                                                                |

### Date / time

| Function                       | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `@Now()`                       | Current moment as epoch ms.                                        |
| `@Today()`                     | Today's date at midnight, as an ISO string.                        |
| `@AddDays(date, n)`            | Shift a date by N days. Returns ISO string.                        |
| `@AddHours(date, n)`           | Shift a date by N hours. Returns ISO string.                       |
| `@DiffDays(start, end)`        | Whole-day difference (end − start).                                |
| `@StartOfWeek(date)`           | UTC Sunday 00:00:00 for the week containing `date`.                 |
| `@EndOfMonth(date)`            | Last moment of the calendar month containing `date`.                |

### String

| Function                                                                     | Purpose                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@Capitalize(s)` / `@Lowercase(s)` / `@Uppercase(s)` / `@Titlecase(s)`        | Standard case operations.                                                                                |
| `@Case(value, "camel" \| "snake" \| "kebab" \| "pascal")`                    | Re-case a value into the target form.                                                                    |
| `@Join(arr, sep?)`                                                           | Join with a separator (default `","`).                                                                   |
| `@Split(s, sep?)`                                                            | Split on a separator (default `","`).                                                                    |
| `@Trim(s)` / `@StartsWith(s, p)` / `@EndsWith(s, p)` / `@Contains(s, p)`     | Standard string ops.                                                                                     |
| `@Replace(s, search, replacement?)`                                          | Replace all occurrences (string match, not regex).                                                       |
| `@Substring(s, start, end?)`                                                 | Standard substring.                                                                                      |
| `@Match(s, pattern)`                                                         | Boolean — does `s` match the regex `pattern`?                                                            |

### Array shortcuts (not functions)

- `$rows.length` — element / character count.
- `$rows.first` / `$rows.last` — first or last element (`null` if empty).
- **Array pluck**: `$rows.title` returns `[row.title for each row]` —
  the idiomatic way to project a single field. Composes with charts
  (`PieChart(values: rows.value, labels: rows.label)`) and tables
  (`Col("Title", rows.title)`).

### Control-flow — expression form

Control flow is always expression-form `if` / `match` / `for`. They return
values that can be assigned, passed as arguments, or composed:

```text
active = if $tab == "billing" { billingPanel } else { overviewPanel }
list   = for item in $todos { TaskRow(item) }
panel  = match $stage { "done": Done() "ready": Ready() default: Pending() }
```

`match` arms accept either a bare expression (`"draft": DraftView()`)
or a **statement block** (`"draft": { $drafts = [...$drafts, payload] }`).
Use the block form inside `action` / `effect` bodies when an arm needs
to write state or run multiple statements before yielding a value. To
return a literal object from an arm, parenthesise it
(`"a": ({ y: 1 })`) so the brace is parsed as an expression, not a block.

### Responsive prop maps

`Grid(items, columns: {sm: 1, md: 2, lg: 4}, gap: "l")` — 1 column on
mobile, 2 on tablet, 4 on desktop.
`Stack(children, direction: {sm: "column", md: "row"})` — stack on
mobile, row on desktop. Both `columns` / `gap` / `direction` accept
either a single value or a responsive map. Breakpoints:

- `base` — less than 640px (mobile).
- `sm` — ≥ 640px.
- `md` — ≥ 768px.
- `lg` — ≥ 1024px.
- `xl` — ≥ 1280px.

---

## 9. Component reference (by group)

> Below is a curated list. Every component declared in
> [`src/library/index.ts`](./src/library/index.ts) is part of the
> default library. The full positional / named signatures and enum values
> live in the system prompt and in
> [`docs/components.html`](https://asfand-dev.github.io/aktion/components.html).

### Layout

`Stack`, `StackItem`, `Grid`, `GridItem`, `Box`, `Container`, `Spacer`,
`Card`, `CardHeader`, `CardFooter`, `Separator`, `Tabs`, `TabItem`,
`Accordion`, `AccordionItem`, `Modal`, `Drawer`, `Steps`, `AspectRatio`,
`ScrollArea`, `Sticky`, `ResizablePanels`, `MasonryGrid`.

Notes:

- `_app_` MUST resolve to a top-level container (`Stack`, `AppShell`,
  `Container`, `Card`, or a user component returning one of those).
- Wrap each major chunk of content in a `Card` for visual grouping.
- Prefer `Grid(items, columns?, gap?)` over `Stack(direction: "row", wrap: true)`
  when children should size uniformly.
- Use `Container(children, size?)` to centre a wide page within a
  comfortable max-width (landing pages, articles, marketing sections).
- Use `Spacer()` inside `Stack(direction: "row")` to push the next item
  to the far edge; pass a `size` for an explicit fixed gap.
- Use `Separator(orientation?, label?)` between sections. Pass a
  `label` for a centered "OR"-style separator.
- Use `Drawer` for side-panel detail views, `Modal` for centered dialogs.
- Use `Sticky(children, side?, offset?)` to pin a toolbar/banner while
  the surrounding content scrolls.
- Use `ResizablePanels(primary, secondary, initialPrimaryWidth?)` for
  user-resizable two-pane layouts (code editors, file browsers).
- Use `MasonryGrid([...])` for Pinterest-style mixed-height card walls.
- Use `Grid(columns: 12, [GridItem(child, span: "1/4"), GridItem(main, span: "3/4")])`
  for sidebar layouts — fractional spans `"1/2"`…`"1/12"` resolve on
  a 12-column track.

### Content

`Text`, `Image`, `Icon`, `Link`, `Badge`, `BadgeList`, `Callout`,
`Quote`, `CodeBlock`, `Skeleton`, `Spinner`, `Markdown`, `Kbd`.

Notes:

- `Text(value, variant?, tone?, style?)` renders inline text with a
  typographic variant. The optional `style` prop accepts a CSS
  declaration string (e.g. `"font-size: 16px; font-weight: bold; color: #000;"`)
  applied directly to the rendered element — use it for one-off
  visual tweaks; reach for `variant`/`tone` first to stay on-theme.
- Prefer `Markdown(...)` for rich paragraph text — the parser supports
  headings, blockquotes, fenced code, numbered/bullet lists, links,
  images, and bare-URL auto-linking.
- `Callout(title, description?, icon?, variant?, compact?)` — pass
  `compact: true` for a one-line inline note.
- `Quote(text, cite?)` is for inline pull-quotes; use `Testimonial` when
  you also have author/role/rating.
- `CodeBlock(language, code, showLineNumbers?, highlightLines?)` — the
  header always renders a copy-to-clipboard button.
- `Badge(label, variant?, icon?, size?)` for a single pill;
  `BadgeList(["a","b","c"], variant?, size?)` to render a string array
  as Badge pills.
- `Skeleton(variant?, lines?, height?, shape?, width?)` for loading
  placeholders. Variants: `paragraph` (default), `card`, `table-row`,
  `avatar`, `image`.
- `Spinner(size?, label?, tone?)` for tiny inline loaders inside
  buttons, toolbars, or table cells.
- `Image(src, alt?, caption?, ratio?, fit?, fallback?)` — `ratio` (e.g.
  `"16:9"`) makes the image self-constrain so you do not need an
  outer `AspectRatio`.
- `Kbd(["Cmd", "K"])` for keyboard shortcuts.
- `Icon(name, variant?, size?)` for a standalone Font Awesome icon.

### Forms

`Form`, `FormControl`, `FormSection`, `FieldSet`, `ValidationSummary`,
`Input`, `TextArea`, `PasswordInput`, `MaskedInput`, `MentionInput`,
`TagInput`, `Select`, `SelectItem`, `Combobox`, `MultiSelect`,
`Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Switch`,
`ToggleGroup`, `Button`, `Buttons`, `SearchBar`, `Slider`, `NumberInput`,
`ColorPicker`, `DatePicker`, `DateRangePicker`, `TimePicker`,
`DateTimePicker`, `FileUpload`, `PinInput`, `MultiStepForm`.

Notes:

- Pass a `$variable` as `value:` for two-way binding. The explicit form
  is `bind:value: $name`.
- Prefer `Switch` over `Checkbox` for settings; use `ToggleGroup` for
  view-mode pickers and mutually-exclusive filters.
- Reach for `SearchBar(id, placeholder?, value?, shortcut?)` instead
  of a raw `Input` whenever the field's purpose is to filter content.
- `FormSection(label, children, helper?)` is the canonical wrapper for
  related fields. Reach for it INSTEAD of nesting fields in Card +
  SectionHeader by hand.
- `FieldSet(legend, children, helper?)` is the accessible `<fieldset>`
  for radio/checkbox groups.
- `ValidationSummary(errors, title?)` renders an aggregate error panel
  at the top of the form. Pass `errors` as `{label, message}` objects.
- `PasswordInput(id, value?, placeholder?, strengthMeter?)` adds a
  show/hide toggle and an optional 4-step strength meter — prefer over
  `Input(type: "password")` for sign-up flows.
- `PinInput(id, length?, value?, type?)` renders per-digit code entry
  for 2FA / SMS verification (use `length: 6` for OTP codes).
- `TagInput(id, value?, placeholder?)` lets the user add comma- or
  Enter-separated chips bound to a `$variable` array.
- `MentionInput(id, people, value?)` is a textarea with inline
  @-mention suggestions.
- `MaskedInput(id, mask, value?)` formats input against a mask string
  (`9` digit, `A` letter, `*` any). For phone numbers, postal codes.
- `ColorPicker(id, value?, label?, swatches?)` pairs a color chip with
  a hex input and preset swatches.
- `MultiStepForm(steps, current, onSubmit?)` replaces ad-hoc
  `Steps` + content + manual prev/next wiring. Each step is
  `{title, details?, content}`.
- Button `size` accepts `xs | sm | md | lg | xl` (with `small | normal | large`
  as accepted aliases). Pass `icon:` for an inline leading icon.

### Data

`Table`, `Col`, `DataGrid`, `List`, `ListItem`, `StatCard`, `Stats`,
`Sparkline`, `Tile`, `Progress`, `ProgressRing`, `Pagination`, `Tree`,
`TreeNode`, `CalendarView`, `ComparisonTable`, `InfiniteList`.

Notes:

- Build columns using array pluck: `Col("Title", data.rows.title, format?, align?)`.
- For per-row controls inside a Col, use
  `for row in data.rows { Button("X", onClick: () => remove(row.id)) }`
  and reference `row.field` inline.
- `Table(cols, caption?, density?, striped?, sticky?, emptyLabel?)` —
  pass `density: "compact"` for dense data, `sticky: true` to pin the
  header in a scrolling parent.
- `DataGrid(cols, rowIds?, caption?, sort, selectedIds, selectable?, page, perPage?, …)` —
  adds sortable headers (`sortable: true` on Col), per-column filter
  chips (`filterable: true`), checkbox row selection bound to
  `$selectedIds`, sticky header / first column, pagination, and an
  optional bulk-action toolbar.
- `CalendarView(value?, month?, events?, view?, firstDay?, onSelect?)`
  renders a full-month (or week) calendar grid — distinct from the
  `DatePicker` input.
- `ComparisonTable(columns, rows, highlightColumn?)` is the generic
  counterpart of `PricingTable` — pass rows of
  `{label, values, hint?, group?}`.
- `InfiniteList(items, onLoadMore?, loading?, hasMore?)` is a
  scroll-to-load list.
- `Progress(value, max?, label?, tone?, indeterminate?, segments?, buffered?)` —
  `segments` renders an N-step strip (onboarding flows), `buffered` adds
  a secondary buffer indicator.
- `ProgressRing(value, max?, label?, tone?, size?)` is the circular
  variant. The label renders as an icon when it resolves to a Font
  Awesome name.
- `Stats([{label, value, hint?, tone?, spark?}, …], layout?)` —
  `layout: "strip"` (default) for inline KPIs; `layout: "grid"` for a
  responsive StatCard grid. Pass `spark` for an inline trend line.
- `StatCard(label, value, trend?, delta?, icon?, spark?, tone?)` gains
  an optional inline `Sparkline` via the `spark` prop.
- `Tile(label, icon?, value?, description?, tone?, action?)` is the
  dense icon tile for quick-action menus and category grids.
- `Tree([TreeNode(label, children?, icon?, expanded?, active?, badge?, action?)])`
  renders a hierarchical tree.
- `Pagination(page, totalPages, siblings?, total?, perPage?, perPageOptions?, compact?)` —
  bind `page` (and optionally `perPage`) to a `$variable`; pass `total`
  to render the "Showing N–M of T" summary.

### Charts

`BarChart`, `LineChart`, `PieChart`, `RadarChart`, `ScatterChart`,
`Histogram`, `Heatmap`, `Gauge`, `Series`.

Notes:

- Use `LineChart` for trends (`filled: true` for area-style charts),
  `BarChart` for comparisons, `PieChart` for proportions, `RadarChart`
  for multi-axis scorecards.
- `LineChart` accepts a row-shaped `data: [{x, …series}]` shorthand —
  labels + series are derived automatically.
- `Heatmap(xLabels, yLabels, values)` renders a color-intensity matrix
  — perfect for calendar heatmaps, correlation grids, schedule density.
- `ScatterChart(series, xLabel?, yLabel?)` plots XY points; pass each
  Series as `Series(name, values: points)` where points are
  `{x, y, label?}`.
- `Histogram(values, binCount?)` bins raw numbers; pass pre-computed
  `bins: [{label, count}]` instead when you control the bucketing.
- `Gauge(value, min?, max?, label?, tone?, size?)` is the half-doughnut
  KPI indicator for thresholds (uptime %, score, NPS).
- Series are constructed via `Series("Name", values: [...numbers])`.
- Chart colours come from theme tokens `chart1`…`chart6`. Never pass
  manual `stroke` / `fill`.

### Feedback & media

`Avatar`, `AvatarGroup`, `PersonChip`, `Tooltip`, `HoverCard`, `Popover`,
`Rating`, `Toast`, `VideoPlayer`, `AudioPlayer`, `Carousel`, `Gallery`,
`Lightbox`, `Map`.

Notes:

- `Avatar(name, src?, size?, status?)` falls back to a deterministic
  DiceBear illustration when `src` is missing (override with
  `fallback: "initials"` for the two-letter pill).
- `AvatarGroup` renders contributor strips with a `+N` overflow chip.
- `PersonChip(name, role?, avatarSrc?, size?, status?, action?)` is the
  inline avatar + name + role pill — use everywhere a person is
  referenced.
- `Tooltip(label, trigger)` for inline hints.
- `HoverCard(trigger, content)` when the popover needs rich content
  (profile preview, link target) and the trigger opens on hover.
- `Popover(trigger, content, title?, side?, align?, width?)` is the
  click-triggered counterpart — for filter panels, color pickers,
  share menus.
- `Rating(value, max?, label?, count?, size?, interactive?, halfStep?, icon?)` —
  pass a `$variable` as `value` with `interactive: true` to let users
  rate; `halfStep: true` enables half-stars. Set `icon: "heart" | "thumb" | "fire"`
  (or any FA name) to swap glyphs.
- `Toast(title, message?, tone?, icon?, duration?, action?, onClose?, position?)`
  pins a transient notice. Drive lists from an `action`:
  `$toasts = [...$toasts, item]` to append,
  `$toasts = @Filter($toasts, "id", "!=", id)` to dismiss.

### Navigation

`Breadcrumb`, `BreadcrumbItem`, `Navbar`, `NavbarItem`, `TopBar`,
`NavLink`, `Pagination`.

Notes:

- `Breadcrumb(["Workspace", "Reports", "Q3"])` at the top of every detail
  page so users see the path. Pass `BreadcrumbItem(label, href)` nodes
  for linkable items.
- `Navbar(brand?, items?, actions?, sticky?, variant?)` + `NavbarItem(label, to?, href?, icon?, active?, action?, external?)`
  for top navigation bars (marketing pages, docs).
- `TopBar(title?, search?, actions?, sticky?)` — compact top strip for a
  content surface (panels, dialogs).
- `NavLink(label, to, variant?, exact?, icon?)` is the router-aware anchor
  for hash-based routing (§11).

### Menus

`DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `ContextMenu`.

Notes:

- `DropdownMenu(trigger, items, side?, align?, label?)` is the
  click-triggered dropdown — for user-profile menus, row "…" action
  menus, and any compact list of actions hanging off a single trigger.
- `MenuItem(label, action?, icon?, shortcut?, variant?, disabled?)` —
  use `variant: "danger"` for destructive actions and
  `MenuSeparator()` / `MenuLabel(label)` to group related items.
- `ContextMenu(target, items)` attaches a right-click menu to any node.

### Chat

`SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`,
`ActionLink`, `ChatBubble`.

Notes:

- End most chat-style responses with a `FollowUpBlock` of 2–4 short
  prompts to keep the conversation moving.
- `ChatBubble(author, body, time?, avatarSrc?, from?, status?)` renders
  a single message bubble; use `from: "me"` for the active speaker and
  `from: "agent"` for the assistant.

### Patterns

`Hero`, `PageHeader`, `SectionHeader`, `Toolbar`, `EmptyState`,
`Timeline`, `TimelineItem`, `ActivityLog`, `FeatureGrid`, `FeatureItem`,
`MediaCard`, `Testimonial`, `ProfileCard`, `Comment`, `Banner`,
`Notification`, `InboxPanel`, `OnboardingChecklist`, `KanbanBoard`,
`KanbanColumn`, `KanbanCard`, `DescriptionList`, `DescriptionItem`,
`StatusDot`, `PricingTable`, `PricingCard`, `Stats`, `Tile`,
`PersonChip`, `LoadingState`, `ErrorState`, `SuccessState`, `Tour`,
`Spotlight`.

Notes:

- Patterns are **opinionated composites** — reach for them BEFORE
  composing equivalent layouts by hand with `Card` + `Stack`.
- `Hero(title, subtitle, primary, secondary, eyebrow?, highlights?, tone?)`
  — landing-style text-first header. Use `layout: "cover"` with
  `imageSrc`, `height`, and optional `caption` for image-backed hero
  bands.
- `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)` —
  the canonical first child for any dashboard or detail page.
- `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)` —
  sub-header inside a Card or panel.
- `Stats(items, layout?)` — KPI strip or responsive grid.
- `Toolbar(left?, right?, center?, searchable?, searchPlaceholder?, searchValue?)`
  — filter/search/actions row above a list, table, or board.
- `EmptyState(title, description?, icon?, illustration?, actions?, action?)`
  — render when a list is empty rather than an empty Card.
- `ActivityLog(entries, variant?)` — purpose-built feed of user actions.
  `variant: "audit"` for security/admin trails with monospace meta.
- `Notification(title, message?, time?, icon?, avatarSrc?, tone?, unread?, actions?)`
  for inbox cards (prefer `Banner` for top-of-page announcements).
- `InboxPanel(items, title?, onMarkAllRead?)` — `Notification` cards
  grouped into Unread / Earlier sections.
- `OnboardingChecklist(items, title?, description?)` — checklist with
  progress for product onboarding.
- `KanbanBoard([KanbanColumn(title, items: [KanbanCard(...)])])` —
  task boards.
- `DescriptionList([DescriptionItem(label, value, icon?)])` —
  detail-page key/value summary. Always preferable to a Stack of
  Text rows on profile, billing, or metadata panels.
- `StatusDot(label, tone?, pulse?)` — inline status pip.
- `PricingTable([PricingCard(plan, price, period?, ...)])` — full
  pricing page block.
- `LoadingState`, `ErrorState`, `SuccessState` — full-card empty-state
  alternatives for asynchronous content states.
- `Tour(steps, current, onFinish?)` and `Spotlight(title?, description?, action?)`
  — product-tour primitives.

### App shell

`AppShell`, `Sidebar`, `SidebarSection`, `SidebarItem`, `SplitView`.

Notes:

- Reach for app-shell composites whenever the response represents a
  complete product surface (dashboards with nav, settings sections,
  admin consoles, inboxes).
- `AppShell(sidebar, content, topbar?, collapsible?, sidebarOpen?)` —
  fixed-left navigation + scrollable main area. `collapsible: true`
  enables a hamburger that turns the sidebar into a slide-over drawer
  on mobile.
- `Sidebar(items, brand?, tagline?, footer?, collapsed?)` + `SidebarItem(label, icon?, active?, badge?, action?)` + `SidebarSection(label, items)`
  — group nav links, mark current page with `active: true`, attach
  badges for counts.
- `SplitView(primary, detail, primaryWidth?)` — master/detail layout
  for inboxes, file browsers, contact lists.

### Editors

`RichTextEditor`, `CodeEditor`.

Notes:

- `RichTextEditor(id, value?, placeholder?, minHeight?)` — contenteditable
  WYSIWYG editor with bold/italic/underline/strike/heading/lists/link
  toolbar. Bind `value` to a `$variable` holding HTML.
- `CodeEditor(id, value?, language?, placeholder?, minHeight?)` —
  `<textarea>` with synced line-number gutter and tab indentation.

### Advanced UI

`IconButton`, `CommandPalette`, `FilterChips`, `FieldRepeater`,
`VirtualList`, `QueryBuilder`, `DiffViewer`, `JsonTree`, `Gantt`,
`Truncate`, `InlineEdit`, `NotificationBell`.

Notes:

- `IconButton(icon, label, action?, variant?, size?, disabled?)` —
  accessible icon-only control.
- `CommandPalette(items, open?, placeholder?, shortcut?)` — Cmd-K
  searchable actions.
- `FilterChips(chips, onRemove?, onClear?)` — applied filter pills with
  remove.
- `FieldRepeater(items, fields, onAdd?, onRemove?)` — dynamic form rows.
- `VirtualList(items, itemHeight?, renderItem)` — windowed long lists.
- `QueryBuilder(fields, value?)` — visual AND/OR filter builder.
- `DiffViewer(left, right, mode?)` — side-by-side or unified diff.
- `JsonTree(data)` — collapsible JSON inspector.
- `Gantt(tasks, startDate?, endDate?)` — horizontal schedule timeline.
- `Truncate(text, maxLines?)`, `InlineEdit(value, onSave?)`,
  `NotificationBell(count?, items?, onOpen?)`.

### Helpers

`Async`, `Show`, `Portal`, `Redirect`, `Lazy`, `ErrorBoundary`.

Notes:

- `Async(resource, loading:, error:, empty:, data:)` switches an
  `http({...})` resource on its `state` field.
- `Show(when, fallback?, children)` is sugar over
  `if expr { children } else { fallback }`.
- `Portal(target?, children)` renders into a different DOM subtree
  (defaults to `document.body`).
- `Redirect(path)` is a router-aware component — returning it from a
  route's body navigates and unmounts the rest of the subtree.
- `Lazy(loader, fallback?)` defers children until `loader` resolves.
- `ErrorBoundary(children, fallback?, onError?)` catches rendering
  errors thrown by descendants.

### Escape hatches — last-resort raw HTML / CSS

`HTMLTag`, `Styles`.

> ⚠️ **Use these only when no standard component captures the design.**
> The dedicated catalogue produces a more consistent, on-theme UI for
> fewer tokens. Reach for these primitives only after confirming
> nothing in §9 (or a composite from §11) covers the case.

- `HTMLTag(tag, attributes?, children?)` renders an allow-listed HTML
  tag (`div`, `section`, `article`, `header`, `footer`, `main`, `nav`,
  `aside`, headings, lists, table tags, `a`, `img`, `figure`,
  `details`/`summary`, inline text tags, …) with the supplied attribute
  object and child nodes. Tag names outside the allow-list collapse to
  `div`. Attribute sanitisation drops `on*` event handlers,
  `javascript:` URLs in `href`/`src`, and unsafe `style` patterns
  (`expression()`, `@import`, `behavior:`).
- `Styles(css)` injects a `<style>` block whose CSS targets your own
  selectors. Pair it with `HTMLTag` (or any component that exposes a
  `class` attribute) to scope custom rules. Payloads containing
  `</style>`, `<script>`, `expression(`, `javascript:`, `behavior:`, or
  `@import` are dropped silently.

```text
_app_ = Stack([
  Styles(`
    .hero-callout { background: linear-gradient(135deg, #6366f1, #10b981); color: white; padding: 24px; border-radius: 12px; }
    .hero-callout h2 { margin: 0 0 8px; font-size: 22px; }
  `),
  HTMLTag("div", attributes: { class: "hero-callout" }, children: [
    HTMLTag("h2", children: [Text("Custom block")]),
    Text("Use HTMLTag + Styles only when the standard catalogue cannot capture the design.")
  ])
])
```

---

## 10. JavaScript escape hatch — `js{ … }`

`js{ /* opaque JS body */ }` runs raw JavaScript inside an `effect`,
`action`, or lambda body. Use sparingly — every other surface is
preferred — but it is always available for browser APIs not exposed
natively (clipboard, keyboard listeners, IntersectionObserver, audio,
custom DOM work).

### The `ctx` bridge

The body receives a single `ctx` bridge:

- `ctx.host` — the `<aktion-app>` host element (for `dispatchEvent`).
- `ctx.state` — `{ get(name), set(name, value) }` for reactive atoms.
- `ctx.cleanup(fn)` — register teardown (same semantics as `effect`
  cleanup).
- `ctx.tools` — host-registered endpoint catalog (rarely needed;
  prefer `http()`).
- `ctx.args` — when invoked from an `action` or lambda, the call's
  arguments keyed by name.

The body runs inside `(async () => { … })()` so `await` is free. Errors
are caught and logged — a broken body never crashes the host page.

### Common recipes

**Clipboard:**

```text
action copyShareLink() {
  js{ navigator.clipboard.writeText(window.location.href) }
  emit "assistant-message" { message: "Link copied" }
}
```

**Keyboard shortcuts:**

```text
effect [on:mount] {
  js{
    const onKey = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        ctx.state.set("paletteOpen", true)
        e.preventDefault()
      }
    }
    document.addEventListener("keydown", onKey)
    ctx.cleanup(() => document.removeEventListener("keydown", onKey))
  }
}
```

**Live clock:**

```text
component LiveClock() {
  $now = @Now()
  effect [on:mount] {
    js{
      const id = setInterval(() => ctx.state.set("now", Date.now()), 1000)
      ctx.cleanup(() => clearInterval(id))
    }
  }
  return Text(@FormatDate($now, "time"))
}
```

**Reading per-item data from a lambda:**

```text
component Row(task) {
  return Stack([
    Text(task.title),
    Button("Toggle", onClick: () => {
      js{
        const todos = ctx.state.get("todos") || []
        ctx.state.set("todos", todos.map(t =>
          t.id === ctx.args.task.id ? { ...t, done: !t.done } : t
        ))
      }
    })
  ])
}
```

Note that `ctx.args.task` is the lambda's parameter, automatically
keyed by name.

**Host-registered tool call:**

```text
action loadOrders() {
  js{
    const data = await ctx.tools.list_orders({ limit: 10 })
    ctx.state.set("orders", data)
  }
}
```

(The host registered `list_orders` via `el.setTools({ list_orders: ... })`.)

**File upload via `FileUpload`:**

```text
$status = "idle"

action upload(files) {
  $status = "uploading"
  js{
    const form = new FormData()
    for (const file of ctx.args.files) form.append("files", file)
    await fetch("/api/upload", { method: "POST", body: form })
    ctx.state.set("status", "done")
  }
}

picker = FileUpload("upload", label: "Drop files", action: upload)
```

The CSP note: `js{ … }` bodies are evaluated with `new Function(...)`
which requires `'unsafe-eval'` if you embed `<aktion-app>`
behind a Content Security Policy. If you cannot relax CSP, simply
avoid emitting `js{}` blocks — every other part of the runtime keeps
working without the JS escape hatch.

---

## 11. Routing

The router is a plain function call. `_router_({ "/path": ... })`
returns the matched arm's evaluated value — assign the result to any
binding and reference that binding inside your shell.

```text
pages = _router_({
  "/":             Dashboard(),
  "/orders":       OrdersPage(),
  "/orders/:id":   OrderDetail(id: params.id),
  "/settings/*":   SettingsArea(rest: params._),
  default:         NotFound()
})

_app_ = AppShell(MainSidebar(), pages, TopBar())
```

### Path patterns

- **Literal segments:** `"/"`, `"/about"`, `"/settings/profile"`.
- **Parameter segments:** `"/users/:id"`. Read inside the arm body with
  `params.id` (or `_route_.params.id` from elsewhere).
- **Trailing wildcard:** `"/docs/*"`. Remainder lands in `params._`.
- **Default arm:** `default: NotFound()` is the catch-all (synonym: `"*"`).

### Inside an arm body

- `params` is bound to the matched route's path captures. It is
  scoped to the arm — the value is **not** available outside
  `_router_({…})`.
- Use `_route_` for cross-cutting reactive reads (current path,
  query string) that don't depend on which arm matched.

### Reactive surface

- `_route_.path` — current path (read-only).
- `_route_.params.id` — path parameter; reactive.
- `_route_.query.tab` — query string; reactive.
- `_route_.pattern` — the pattern that matched (e.g. `"/users/:id"`).
- `_route_.navigate("/path")` — imperative navigation. Use inside any
  action or effect body.

### `NavLink` companion

`NavLink(label, to, variant?, exact?, icon?)` reads `_route_.path` and
dispatches `_route_.navigate(to)` on click — use for sidebars, navbars,
and breadcrumbs. The link reflects `data-active="true"` when its `to`
matches the current path.

```text
nav = Stack([
  NavLink("Home",      to: "/", exact: true, icon: "house"),
  NavLink("Dashboard", to: "/dashboard",      icon: "chart-line"),
  NavLink("Settings",  to: "/settings",       icon: "gear")
], direction: "column", gap: "xs")
```

### Common mistakes

- **`_route_` is read-only** (apart from `_route_.navigate(...)`).
  Assigning to `_route_` or to a state slot named `route` is ignored.
- **Forgetting the `default:` arm.** Without it, unknown paths render
  `null` and the outlet collapses.
- **Using `->` instead of `:` for arm bodies.** Inside `_router_({…})`
  the arms are ordinary object properties — separate with `:` and
  commas.

### Sub-routes (layout-preserving)

`_router_` can be nested inside a component to preserve a section's
chrome while swapping its content:

```text
component SettingsArea() {
  inner = _router_({
    "/settings/profile":      ProfilePane(),
    "/settings/billing":      BillingPane(),
    "/settings/notifications": NotificationsPane(),
    default:                   ProfilePane()
  })
  return Stack([SettingsSidebar(), inner], direction: "row", gap: "l")
}

pages = _router_({
  "/":           Dashboard(),
  "/settings/*": SettingsArea(),
  default:       NotFound()
})
```

---

## 12. Globals — `storage`, `console`

Two namespace globals are always in scope inside a Aktion
program — no import, no declaration. Both follow the standard
`obj.method(args)` method-call syntax and accept named-arg options that
collapse into a trailing options object.

### `storage` — browser storage

```text
# localStorage is the default; `storage.local` is its alias.
storage.set("name", "John")
$name = storage.get("name")
storage.remove("name")
storage.clear()

# Per-tab sessionStorage.
storage.session.set("draft", $draft)
$draft = storage.session.get("draft")

# Cookies — options use the standard named-arg form.
storage.cookies.set("user", "John", expires: 7, path: "/", domain: "example.com", secure: true, sameSite: "Lax")
$user = storage.cookies.get("user")
storage.cookies.remove("user", path: "/")
storage.cookies.clear()
```

- Non-string values round-trip through `JSON.stringify` / `JSON.parse`;
  missing keys return `null`.
- Cookie options: `expires` (days, `Date`, or ISO string), `maxAge`
  (seconds), `path`, `domain`, `secure`, `sameSite`.
- Failures (quota exceeded, disabled storage, malformed JSON) are
  swallowed — perfect for partial-stream renders in privacy / SSR
  contexts.

### `console` — host console forwarder

```text
console.log("Hello", $user)
console.error("Failed", $error)
console.warn("Deprecated path")
console.info("Route changed", _route_.path)
console.debug({ days: $days, count: $count })
```

Calls in environments without a host console (SSR workers, etc.)
silently no-op.

Both globals can be used inside `action` / `effect` bodies, inline
lambdas, and template literals. They are independent of `js{ … }`
blocks and the host's `tools` registry — no escape hatch required.

---

## 13. Internationalization

```text
$locale = "fr-FR"
$bundle = http({ url: "/i18n/" + $locale + ".json", method: "GET" })
$i18n = i18n({
  locale:   $locale,
  messages: $bundle.data ?? {},
  fallback: "en"
})

Text(t("orders.title"))                          # "Commandes"
Text(t("orders.greeting", { name: $userName }))  # "Bonjour, Alex"
```

- `t(key, vars?)` looks up the translation by dot-pathed key with
  `${name}` interpolation. Missing keys fall back to the fallback
  locale's bundle, then to the bare key as a literal string.
- `Locale()` returns the active locale tag.
- Formatting builtins (`@Format`, `@FormatDate`) consult `Locale()`
  automatically.

Reload-friendly pattern:

```text
$locale = storage.get("locale") ?? "en"

action setLocale(next) {
  $locale = next
  storage.set("locale", next)
}

$i18n   = i18n({ locale: $locale, messages: messages, fallback: "en" })
picker  = Select("locale", items: [
  SelectItem("en", "English"),
  SelectItem("fr-FR", "Français"),
  SelectItem("de", "Deutsch")
], value: $locale, onChange: setLocale)
```

---

## 14. Theming

### Runtime themes (host-side)

The host page chooses one of seven built-in themes (`light`, `dark`,
`neon`, `pastel`, `glass`, `brutalist`, `skyline`) via the `theme`
attribute or `el.setTheme(...)`. Authored programs should be
theme-neutral.

### In-script branding with `Theme({...})`

When the user **explicitly asks for a brand or product feel**, emit a
`Theme({...})` declaration on a top-level binding called `theme`. The
runtime evaluates the call and writes the token map to the host as CSS
custom properties — **on top of** whatever base theme the host
configured.

```text
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

_app_ = AppShell(...)
```

### Token groups (structured form is mandatory)

Top-level keys must be one of:

| Group          | Tokens                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `colors`       | `bg`, `bgSubtle`, `surface`, `surfaceMuted`, `border`, `borderSubtle`, `text`, `textMuted`, `primary`, `primaryHover`, `primaryText`, `accent`, `accentHover`, `accentText`, `focusRing`, `success`, `warning`, `danger`, `info` |
| `radius`       | `xs`, `sm`, `md`, `lg`, `pill`, `button`, `input`, `borderWidth`                                                              |
| `font`         | `family`, `familyHeading`, `familyMono`, `sizeBase`, `sizeSm`, `sizeLg`, `sizeHeading`, `sizeTitle`, `weightBody`, `weightHeading`, `lineHeightBody`, `lineHeightHeading`, `letterSpacingHeading`, `headingTextTransform` |
| `motion`       | `transitionDuration`                                                                                                          |
| `elevation`    | `shadowSm`, `shadowMd`, `shadowLg`                                                                                            |

Plus metadata keys `name` and `direction` (`"ltr"` / `"rtl"`).

Values are CSS strings — colours (`"#0969da"`, `"rgb(99,102,241)"`),
lengths (`"6px"`, `"1.4em"`), font stacks
(`"'Inter', system-ui, sans-serif"`), numeric weights (`"600"`),
keywords (`"uppercase"`, `"none"`). Numbers are auto-stringified.

Flat-shape token names (`Theme({ colorPrimary: ... })`) and free-form
`--rui-...` keys raise a schema-validator error when used inside an
in-script `Theme(...)` call — always group them under `colors`,
`radius`, `font`, `motion`, or `elevation`.

### Brand recipes

The bundled [brand-themes live example](https://asfand-dev.github.io/aktion/brand-themes.html)
ships ready-made GitHub / Apple / Stripe / IONOS / Notion / Vercel
token maps. Copy them when the user asks for a specific brand feel.

### Rules

- Only emit `Theme(...)` when the user **asks for a brand or specific
  look**. The default themes already cover most replies.
- Put `theme = Theme({...})` **before** the `_app_ = ...` line so the
  tokens are visible when the rest of the program streams in.
- Stick to documented keys. The runtime ignores typos inside a group
  silently.
- **Don't double-pay tokens.** If `Theme(...)` already sets
  `colors.primary`, do NOT also pass `"primary"` overrides on
  individual components.
- Removing the `Theme(...)` line snaps the UI back to the base theme —
  no manual cleanup required.

---

## 15. Icons (Font Awesome)

The runtime auto-loads [Font Awesome 6.7.2](https://fontawesome.com/v6/search?o=r&m=free)
from the public CDN — once into `document.head` and once into each
instance's shadow root. Host apps do **not** need to add a stylesheet.

- Icon strings are Font Awesome names **without** the `fa-` prefix:
  `"house"`, `"chart-line"`, `"star"`, `"cart-shopping"`,
  `"circle-check"`, `"triangle-exclamation"`, `"sack-dollar"`.
- Optional variant prefix: `"regular:star"`, `"brands:github"`. Default
  variant is `solid`.
- Use the dedicated `Icon(name, variant?, size?)` component to render
  a standalone glyph (`size` ∈ `xs`, `sm`, `md`, `lg`, `xl`).
- Every component prop named `icon` — `NavLink`, `SidebarItem`,
  `Banner`, `Notification`, `FeatureItem`, `Badge`, `StatCard`,
  `ListItem`, `TimelineItem`, `DescriptionItem`, `Tile`, `EmptyState` —
  expects a Font Awesome name.
- `ProgressRing(value, max?, label?, …)` renders `label` as an icon
  when it resolves to a Font Awesome name (e.g. `"circle-check"`).
- **Never emit raw emoji.** Invisible Unicode glyph modifiers
  (variation selectors, ZWJ) are stripped silently so values like
  `"triangle-exclamation\uFE0F"` still resolve to the icon name.

```text
brandIcon  = Icon("rocket", "solid", "lg")
homeIcon   = Icon("house")
profileTab = NavLink("Profile", to: "/profile", variant: "ghost", icon: "user")
kpis       = Stats([
  StatCard("Revenue", value: "$48k", trend: "up",   delta: "+12%", icon: "sack-dollar"),
  StatCard("Orders",  value: "1,284", trend: "up",   delta: "+8%",  icon: "cart-shopping"),
  StatCard("Refunds", value: "12",   trend: "down", delta: "-3",   icon: "rotate-left")
])
_app_      = Stack([brandIcon, kpis, profileTab])
```

---

## 16. Application patterns (recipes)

Each pattern is a complete, self-contained snippet showing how to
compose state + components + actions + effects for a common product
surface. Pattern letters are stable — add new ones at the end with the
next letter; do not renumber existing patterns.

### Pattern A — Todo list (declarative, no JS)

```text
$todos = [
  { id: 1, text: "Try editing this list", done: false },
  { id: 2, text: "Write a follow-up", done: false }
]
$draft = ""

action add() {
  if !$draft { return }
  $todos = [...$todos, { id: $todos.length + 1, text: $draft, done: false }]
  $draft = ""
}

action toggle(id) {
  $todos = for t in $todos { if t.id == id { { ...t, done: !t.done } } else { t } }
}

action remove(id) {
  $todos = @Filter($todos, "id", "!=", id)
}

row = (t) => Card([Stack([
  Checkbox("done-" + t.id, label: t.text, checked: t.done, onChange: () => toggle(t.id)),
  Button("Delete", onClick: () => remove(t.id), variant: "ghost", size: "sm")
], direction: "row", gap: "m", justify: "between", align: "center")])

list = for t in $todos { row(t) }

_app_ = Stack([
  PageHeader("Todos", subtitle: `${@Count($todos)} items`, actions: [Button("Clear all", onClick: () => $todos = [], variant: "ghost")]),
  Card([Stack([
    Input("draft", placeholder: "What needs doing?", value: $draft, onEnter: add),
    Button("Add", onClick: add, variant: "primary")
  ], direction: "row", gap: "s")]),
  if @Count($todos) == 0 {
    EmptyState("No todos yet", description: "Add your first task above.", icon: "list-check")
  } else {
    Stack(list, gap: "s")
  }
], gap: "l")
```

### Pattern B — Counter with per-instance state

```text
component Counter(label: "Count", initial: 0) {
  $n = initial
  return Card([Stack([
    SectionHeader(label),
    Buttons([
      Button("-", onClick: () => $n = $n - 1, variant: "ghost"),
      Button(`${$n}`, variant: "secondary"),
      Button("+", onClick: () => $n = $n + 1, variant: "primary")
    ])
  ])])
}

_app_ = Grid([
  Counter("A"),
  Counter("B", initial: 10),
  Counter("C", initial: 100)
], columns: { sm: 1, md: 3 }, gap: "l")
```

### Pattern C — Dashboard with KPIs + chart + table

```text
action refresh() { $orders.refetch() }
action exportCsv() { $exp = http({ url: "/api/exports/orders.csv", method: "POST" }) }
action newOrder() { _route_.navigate("/orders/new") }

$orders = http({ url: "/api/orders", method: "GET", query: { range: $range } })
$range  = "30d"

header = PageHeader("Orders", subtitle: "Revenue, conversions, latency",
  breadcrumbs: ["Workspace", "Reports", "Orders"],
  actions: [
    Button("Refresh", onClick: refresh, variant: "ghost", icon: "rotate"),
    Button("Export CSV", onClick: exportCsv, variant: "secondary", icon: "file-csv"),
    Button("New order", onClick: newOrder, variant: "primary", icon: "plus")
  ],
  status: Badge("Live", variant: "success", icon: "circle"))

filterBar = Toolbar(
  left: [
    SearchBar("orders-q", placeholder: "Search orders…", shortcut: "/"),
    Select("range", items: [SelectItem("7d","7d"), SelectItem("30d","30d"), SelectItem("90d","90d")], value: $range)
  ],
  right: [
    Button("Filters", variant: "ghost", icon: "filter")
  ])

kpis = Stats([
  StatCard("Revenue",     value: "$48.2k", trend: "up",   delta: "+12% vs last period", icon: "sack-dollar"),
  StatCard("Orders",      value: "1,284", trend: "up",   delta: "+8%",                 icon: "cart-shopping"),
  StatCard("Avg. value",  value: "$37.5", trend: "down", delta: "-3%",                 icon: "scale-balanced"),
  StatCard("Refunds",     value: "12",    trend: "down", delta: "-2",                  icon: "rotate-left")
], layout: "grid")

chart = Card([
  SectionHeader("Daily revenue", subtitle: "Last 30 days"),
  LineChart(
    labels: ["Mar 1","Mar 8","Mar 15","Mar 22","Mar 29"],
    series: [Series("Revenue", values: [12000, 14800, 13900, 17200, 18250])],
    filled: true
  )
])

ordersTable = Card([
  SectionHeader("Recent orders", actions: [Button("View all", onClick: () => _route_.navigate("/orders/all"), variant: "ghost")]),
  Async($orders,
    loading: LoadingState("Loading orders…"),
    error:   ErrorState("Couldn't load orders", action: Button("Retry", onClick: refresh, variant: "primary")),
    empty:   EmptyState("No orders in range", description: "Try a wider date range.", icon: "cart-shopping"),
    data:    DataGrid([
      Col("Order", $orders.data.id, sortable: true),
      Col("Customer", for o in $orders.data { PersonChip(o.customer, role: o.email) }),
      Col("Status", for o in $orders.data { Badge(o.status, variant: if o.status == "shipped" { "success" } else { "warning" }) }, filterable: true),
      Col("Total", $orders.data.total, format: "currency", align: "right", sortable: true),
      Col("Placed", $orders.data.created, format: "datetime", sortable: true)
    ])
  )
])

activity = Card([
  SectionHeader("Recent activity"),
  ActivityLog([
    { actor: "Asha", title: "Approved refund for #4821", time: @FormatDate(@Now() - 600000, "relative"), icon: "circle-check", tone: "success" },
    { actor: "Wren", title: "Flagged order #4798 for review", time: @FormatDate(@Now() - 3_600_000, "relative"), icon: "flag", tone: "warning" },
    { actor: "Mira", title: "Updated shipping rules", time: @FormatDate(@Now() - 7_200_000, "relative"), icon: "truck" }
  ])
])

follow = FollowUpBlock(["Compare to last quarter", "Show only refunds", "Which products underperformed?"])

_app_ = Stack([header, filterBar, kpis, chart, ordersTable, activity, follow], gap: "l")
```

### Pattern D — Multi-step wizard

```text
$step = 0
$data = { name: "", email: "", role: "" }

stepLabels = ["Profile", "Account", "Review"]

action next() { if $step < 2 { $step = $step + 1 } }
action prev() { if $step > 0 { $step = $step - 1 } }
action submit() {
  $save = http({ url: "/api/users", method: "POST", body: $data })
  $step = 0
  $data = { name: "", email: "", role: "" }
}

step0 = Card([
  SectionHeader("Profile"),
  FormSection("About you", [
    FormControl("Name",  control: Input("name",  value: $data.name,  onChange: (v) => $data = {...$data, name: v})),
    FormControl("Email", control: Input("email", value: $data.email, onChange: (v) => $data = {...$data, email: v}))
  ])
])

step1 = Card([
  SectionHeader("Account"),
  FormControl("Role", control: Select("role",
    items: [SelectItem("admin","Admin"), SelectItem("editor","Editor"), SelectItem("viewer","Viewer")],
    value: $data.role,
    onChange: (v) => $data = {...$data, role: v}))
])

step2 = Card([
  SectionHeader("Review"),
  DescriptionList([
    DescriptionItem("Name",  $data.name),
    DescriptionItem("Email", $data.email),
    DescriptionItem("Role",  $data.role)
  ])
])

current = match $step {
  0:       step0
  1:       step1
  default: step2
}

navBtns = Buttons([
  Button("Back", onClick: prev, variant: "ghost", disabled: $step == 0),
  if $step == 2 {
    Button("Submit", onClick: submit, variant: "primary")
  } else {
    Button("Next", onClick: next, variant: "primary")
  }
])

_app_ = Stack([
  PageHeader("Create account", subtitle: `Step ${$step + 1} of 3`),
  Steps(stepLabels, current: $step),
  current,
  navBtns
], gap: "l")
```

### Pattern E — Settings page (sectioned)

```text
$profile      = { name: "Alex Diaz", email: "alex@example.com" }
$notify_email = true
$notify_sms   = false
$timezone     = "America/Los_Angeles"
$theme_pref   = "system"

action save() { $save = http({ url: "/api/settings", method: "PUT", body: { profile: $profile, notify: { email: $notify_email, sms: $notify_sms }, timezone: $timezone, theme: $theme_pref } }) }

general = Card([
  SectionHeader("General", subtitle: "Your basic profile information"),
  FormSection("Profile", [
    FormControl("Name",  control: Input("p-name",  value: $profile.name,  onChange: (v) => $profile = {...$profile, name: v})),
    FormControl("Email", control: Input("p-email", type: "email", value: $profile.email, onChange: (v) => $profile = {...$profile, email: v}))
  ])
])

notify = Card([
  SectionHeader("Notifications"),
  Stack([
    FormControl("Email notifications", control: Switch("notify-email", checked: $notify_email, onChange: (v) => $notify_email = v)),
    FormControl("SMS notifications",   control: Switch("notify-sms",   checked: $notify_sms,   onChange: (v) => $notify_sms = v))
  ])
])

prefs = Card([
  SectionHeader("Preferences"),
  Stack([
    FormControl("Timezone", control: Select("tz", items: [SelectItem("UTC","UTC"), SelectItem("America/Los_Angeles","Los Angeles"), SelectItem("Europe/Berlin","Berlin")], value: $timezone, onChange: (v) => $timezone = v)),
    FormControl("Theme",    control: ToggleGroup("theme", items: [{value: "light", label: "Light"}, {value: "dark", label: "Dark"}, {value: "system", label: "System"}], value: $theme_pref, onChange: (v) => $theme_pref = v))
  ])
])

danger = Card([
  SectionHeader("Danger zone", actions: [Button("Delete account", variant: "ghost", tone: "danger")]),
  Callout("This will permanently delete your account and all associated data.", variant: "danger", icon: "triangle-exclamation")
])

_app_ = Stack([
  PageHeader("Settings", subtitle: "Configure your account and workspace"),
  general,
  notify,
  prefs,
  danger,
  Buttons([Button("Save changes", onClick: save, variant: "primary")])
], gap: "l")
```

### Pattern F — Chat / messaging surface

```text
$thread = [
  { id: 1, from: "agent", body: "Hi Alex — how can I help today?",        time: "9:24 AM" },
  { id: 2, from: "me",    body: "Where is order #4821?",                  time: "9:25 AM" },
  { id: 3, from: "agent", body: "Let me check… it shipped this morning.", time: "9:25 AM" }
]
$draft = ""

action send() {
  if !$draft { return }
  $thread = [...$thread, { id: $thread.length + 1, from: "me", body: $draft, time: @FormatDate(@Now(), "time") }]
  $draft  = ""
  emit "assistant-message" { message: "User said: " + $draft }
}

inbox = InboxPanel([
  { title: "Alex Diaz",   message: "Where is order #4821?",        time: "9:25 AM",  avatarSrc: "https://i.pravatar.cc/40?u=alex",  unread: true },
  { title: "Sam Lee",     message: "Thanks for the update!",       time: "8:12 AM",  avatarSrc: "https://i.pravatar.cc/40?u=sam" },
  { title: "Wren Carter", message: "Can we ship overnight?",       time: "Yesterday", avatarSrc: "https://i.pravatar.cc/40?u=wren" }
], title: "Conversations")

thread = Card([
  Stack(for m in $thread { ChatBubble(m.from == "me" ? "You" : "Agent", body: m.body, time: m.time, from: m.from) }, gap: "s")
])

composer = Card([
  Stack([
    TextArea("draft", placeholder: "Write a message…", value: $draft),
    Buttons([
      Button("Send", onClick: send, variant: "primary", icon: "paper-plane")
    ])
  ], gap: "s")
])

_app_ = Stack([
  PageHeader("Support inbox"),
  SplitView(inbox, Stack([thread, composer], gap: "m"), primaryWidth: "320px")
], gap: "l")
```

### Pattern G — Routed multi-page app

```text
component HomePage() {
  return Stack([
    PageHeader("Home", subtitle: "Welcome back, Alex"),
    Stats([
      StatCard("Active",  value: "12", trend: "flat"),
      StatCard("Pending", value: "3",  trend: "up", delta: "+1"),
      StatCard("Done",    value: "27", trend: "up", delta: "+4")
    ])
  ], gap: "l")
}

component OrdersPage() {
  return Stack([
    PageHeader("Orders", breadcrumbs: ["Home", "Orders"]),
    DataGrid([
      Col("ID", ["4821", "4822", "4823"]),
      Col("Customer", ["Alex", "Sam", "Wren"]),
      Col("Total", ["$120", "$80", "$210"], format: "currency", align: "right")
    ])
  ], gap: "l")
}

component OrderDetail(id) {
  return Stack([
    PageHeader(`Order #${id}`, breadcrumbs: ["Home", "Orders", id], actions: [Button("Back", onClick: () => _route_.navigate("/orders"), variant: "ghost", icon: "arrow-left")]),
    DescriptionList([
      DescriptionItem("Status",   Badge("Shipped", variant: "success")),
      DescriptionItem("Customer", "Alex Diaz"),
      DescriptionItem("Total",    "$120.00")
    ])
  ], gap: "l")
}

component NotFound() {
  return EmptyState("Page not found", description: `We couldn't find ${_route_.path}.`, action: Button("Go home", onClick: () => _route_.navigate("/"), variant: "primary"))
}

pages = _router_({
  "/":             HomePage(),
  "/orders":       OrdersPage(),
  "/orders/:id":   OrderDetail(id: params.id),
  default:         NotFound()
})

sidebar = Sidebar([
  SidebarSection("Workspace", items: [
    SidebarItem("Home",   to: "/",       icon: "house",      active: _route_.path == "/"),
    SidebarItem("Orders", to: "/orders", icon: "cart-shopping", active: _route_.path == "/orders")
  ])
], brand: "Acme Co", tagline: "Operations console")

_app_ = AppShell(sidebar, pages, collapsible: true)
```

### Pattern H — Real-time status page

```text
$services = [
  { id: "api",    name: "API",       status: "operational", uptime: 99.97 },
  { id: "web",    name: "Web app",   status: "operational", uptime: 99.99 },
  { id: "db",     name: "Database",  status: "degraded",    uptime: 98.71 },
  { id: "queue",  name: "Queue",     status: "operational", uptime: 99.95 }
]

statusTone = (s) => match s {
  "operational": "success"
  "degraded":    "warning"
  "down":        "danger"
  default:       "neutral"
}

statusIcon = (s) => match s {
  "operational": "circle-check"
  "degraded":    "triangle-exclamation"
  "down":        "circle-xmark"
  default:       "circle"
}

healthBar = Card([
  Stack([
    SectionHeader("System status", actions: [Button("Subscribe", icon: "bell", variant: "ghost")]),
    Banner("All systems operational", description: "Auto-refreshed every 30 seconds.", tone: "success", icon: "circle-check")
  ])
])

list = Stack(for s in $services {
  Card([Stack([
    StatusDot(s.name, tone: statusTone(s.status), pulse: s.status != "operational"),
    Badge(`${s.uptime}% uptime`, variant: statusTone(s.status), icon: statusIcon(s.status))
  ], direction: "row", justify: "between")])
}, gap: "s")

timeline = Card([
  SectionHeader("Recent incidents"),
  Timeline([
    TimelineItem("Database latency",   time: @FormatDate(@Now() - 1_800_000, "relative"), description: "p99 latency above 500ms.", icon: "database",  tone: "warning"),
    TimelineItem("Resolved: queue",    time: @FormatDate(@Now() - 86_400_000, "relative"), description: "Queue throughput restored.", icon: "circle-check", tone: "success")
  ])
])

effect [on:every(30000)] {
  # In a real app, this would refetch from a status endpoint.
  console.log("refreshing status")
}

_app_ = Stack([
  PageHeader("Status", subtitle: "Live availability across our services"),
  healthBar,
  list,
  timeline
], gap: "l")
```

### Pattern I — Pricing page

```text
$cycle = "monthly"

action toggleCycle(v) { $cycle = v }

monthly = [
  { plan: "Free",    price: "$0",   period: "forever", description: "For solo hobbyists", features: ["1 project", "Community support"], action: Button("Start free", variant: "secondary") },
  { plan: "Pro",     price: "$24",  period: "per month", description: "For growing teams", features: ["Unlimited projects", "Priority email"], action: Button("Choose Pro", variant: "primary"), featured: true },
  { plan: "Business", price: "$99", period: "per month", description: "For larger teams", features: ["SSO", "Dedicated CSM"], action: Button("Contact sales", variant: "secondary") }
]

yearly = [
  { plan: "Free",    price: "$0",    period: "forever",  description: "For solo hobbyists", features: ["1 project", "Community support"], action: Button("Start free", variant: "secondary") },
  { plan: "Pro",     price: "$240",  period: "per year", description: "Save 17%",          features: ["Unlimited projects", "Priority email"], action: Button("Choose Pro", variant: "primary"), featured: true },
  { plan: "Business", price: "$990", period: "per year", description: "Save 17%",          features: ["SSO", "Dedicated CSM"], action: Button("Contact sales", variant: "secondary") }
]

plans = if $cycle == "yearly" { yearly } else { monthly }

hero = Hero("Simple pricing", subtitle: "Pick the plan that fits your team. Cancel anytime.", primary: Button("Compare plans", variant: "primary"))

picker = Card([Stack([
  Badge("Save 17% yearly", variant: "success"),
  ToggleGroup("cycle", items: [{value:"monthly", label:"Monthly"}, {value:"yearly", label:"Yearly"}], value: $cycle, onChange: toggleCycle)
], direction: "row", justify: "between", align: "center")])

table = PricingTable(for p in plans { PricingCard(p.plan, price: p.price, period: p.period, description: p.description, features: p.features, action: p.action, featured: p.featured) })

faq = Accordion([
  AccordionItem("Can I change plans later?",  content: Markdown("Yes — you can upgrade or downgrade at any time.")),
  AccordionItem("Do you offer student discounts?", content: Markdown("Email **students@example.com** for a 50% discount.")),
  AccordionItem("How does billing work?", content: Markdown("All plans bill in advance and renew automatically."))
])

closing = Banner("Need a custom plan?", description: "We'll help you build a quote.", tone: "primary", icon: "envelope")

_app_ = Stack([hero, picker, table, faq, closing], gap: "l")
```

### Pattern J — Checkout flow

```text
$step  = "details"
$cart  = [
  { id: 1, title: "Coffee mug",    qty: 2, price: 12.5 },
  { id: 2, title: "Notebook",      qty: 1, price: 18.0 },
  { id: 3, title: "Sticker pack",  qty: 3, price: 4.5 }
]
$total = @Sum(for it in $cart { it.qty * it.price })

$customer = { name: "", email: "", address: "" }

action next() { $step = "payment" }
action back() { $step = "details" }
action place() { $place = http({ url: "/api/checkout", method: "POST", body: { customer: $customer, items: $cart } })  $step = "confirm" }

steps = Steps(["Details", "Payment", "Confirmation"], current: if $step == "details" { 0 } else if $step == "payment" { 1 } else { 2 })

orderSummary = Card([
  SectionHeader("Order summary"),
  Stack(for it in $cart {
    Stack([
      Text(`${it.qty} × ${it.title}`),
      Text(@Format(it.qty * it.price, "currency", "USD"))
    ], direction: "row", justify: "between")
  }, gap: "s"),
  Separator(),
  Stack([Text("Total", variant: "large-heavy"), Text(@Format($total, "currency", "USD"), variant: "large-heavy")], direction: "row", justify: "between")
])

detailsForm = Card([
  SectionHeader("Shipping details"),
  FormSection("Contact", [
    FormControl("Name",    control: Input("c-name",    value: $customer.name,    onChange: (v) => $customer = {...$customer, name: v})),
    FormControl("Email",   control: Input("c-email",   type: "email", value: $customer.email, onChange: (v) => $customer = {...$customer, email: v})),
    FormControl("Address", control: TextArea("c-addr", value: $customer.address, onChange: (v) => $customer = {...$customer, address: v}))
  ]),
  Buttons([Button("Continue to payment", onClick: next, variant: "primary")])
])

paymentForm = Card([
  SectionHeader("Payment"),
  Callout("This demo doesn't process real payments.", variant: "info", icon: "circle-info"),
  Buttons([
    Button("Back", onClick: back, variant: "ghost", icon: "arrow-left"),
    Button(`Pay ${@Format($total, "currency", "USD")}`, onClick: place, variant: "primary")
  ])
])

confirmation = SuccessState("Order placed", description: "We'll email you a receipt and tracking number.", action: Button("Continue shopping", variant: "primary"))

content = match $step {
  "details": detailsForm
  "payment": paymentForm
  default:   confirmation
}

_app_ = Stack([
  PageHeader("Checkout"),
  steps,
  Grid([content, orderSummary], columns: { sm: 1, md: 2 }, gap: "l")
], gap: "l")
```

### Pattern K — File manager

```text
$path  = ["Documents"]
$nodes = [
  { name: "Reports",        type: "folder" },
  { name: "Q3.pdf",         type: "file", size: "1.2 MB", modified: "2 days ago" },
  { name: "Photos",         type: "folder" },
  { name: "Diagram.png",    type: "file", size: "320 KB", modified: "Yesterday" }
]
$selected = null

action open(node) {
  if node.type == "folder" {
    $path = [...$path, node.name]
  } else {
    $selected = node
  }
}

action back() {
  if $path.length > 1 { $path = @Slice($path, 0, $path.length - 1) }
}

breadcrumb = Breadcrumb(for p in $path { p })

toolbar = Toolbar(
  left: [Button("Up", onClick: back, variant: "ghost", icon: "arrow-up", disabled: $path.length <= 1)],
  right: [Button("New folder", variant: "secondary", icon: "folder-plus"), Button("Upload", variant: "primary", icon: "upload")])

rows = for n in $nodes {
  Card([Stack([
    Stack([
      Icon(if n.type == "folder" { "folder" } else { "file" }, "regular", "md"),
      Text(n.name, variant: "large-heavy")
    ], direction: "row", gap: "m", align: "center"),
    if n.type == "file" { Text(`${n.size} · ${n.modified}`, tone: "muted") } else { null },
    Button("Open", onClick: () => open(n), variant: "ghost")
  ], direction: "row", justify: "between", align: "center")])
}

preview = if $selected {
  Card([
    SectionHeader($selected.name, actions: [Button("Close", onClick: () => $selected = null, variant: "ghost", icon: "xmark")]),
    DescriptionList([
      DescriptionItem("Size",     $selected.size),
      DescriptionItem("Modified", $selected.modified)
    ])
  ])
} else {
  EmptyState("No file selected", description: "Pick a file on the left to see details.", icon: "file")
}

_app_ = Stack([
  PageHeader("Files", subtitle: "Browse and manage your assets"),
  breadcrumb,
  toolbar,
  SplitView(Stack(rows, gap: "s"), preview, primaryWidth: "60%")
], gap: "l")
```

### Pattern L — Calendar / scheduler

```text
$selected = @Today()
$events   = [
  { date: @Today(),                          title: "Team standup", time: "9:00",  tone: "primary" },
  { date: @AddDays(@Today(), 1),             title: "Customer call", time: "14:00", tone: "info"    },
  { date: @AddDays(@Today(), 3),             title: "1:1 with manager", time: "11:00", tone: "warning" }
]

dayEvents = @Filter($events, "date", "==", $selected)

calendar = Card([
  SectionHeader("Schedule", actions: [Button("Add event", icon: "plus", variant: "primary")]),
  CalendarView(value: $selected, events: $events, onSelect: (d) => $selected = d)
])

list = Card([
  SectionHeader(`Events for ${@FormatDate($selected, "MMM D")}`),
  if @Count(dayEvents) == 0 {
    EmptyState("Nothing scheduled", description: "Pick a different day or add an event.", icon: "calendar-plus")
  } else {
    Stack(for e in dayEvents {
      Stack([Badge(e.time, variant: e.tone), Text(e.title)], direction: "row", gap: "m", align: "center")
    }, gap: "s")
  }
])

_app_ = Stack([
  PageHeader("Calendar"),
  Grid([calendar, list], columns: { sm: 1, md: 2 }, gap: "l")
], gap: "l")
```

### Pattern M — Docs portal

```text
docTree = [
  TreeNode("Getting started", children: [
    TreeNode("Installation", action: () => _route_.navigate("/docs/install"),  active: _route_.path == "/docs/install"),
    TreeNode("Quick start",  action: () => _route_.navigate("/docs/quickstart"), active: _route_.path == "/docs/quickstart")
  ], expanded: true),
  TreeNode("Guides", children: [
    TreeNode("Routing",   action: () => _route_.navigate("/docs/routing")),
    TreeNode("Theming",   action: () => _route_.navigate("/docs/theming"))
  ])
]

sidebar = Sidebar([
  SidebarSection("Documentation", items: [
    SidebarItem("Search", icon: "magnifying-glass")
  ])
], brand: "Acme Docs")

content = match _route_.path {
  "/docs/install":    Markdown("# Installation\n\nRun `npm install acme`.")
  "/docs/quickstart": Markdown("# Quick start\n\nMount the tag and stream a response.")
  "/docs/routing":    Markdown("# Routing\n\nUse `pages = _router_({ … })`.")
  "/docs/theming":    Markdown("# Theming\n\nPick a theme or pass `Theme({…})`.")
  default:            Markdown("# Welcome\n\nPick a topic from the tree.")
}

inner = Grid([
  Card([Tree(docTree)]),
  Card([content])
], columns: { sm: 1, md: { _: "1 / 3" } }, gap: "l")

_app_ = AppShell(sidebar, Stack([
  PageHeader("Docs"),
  inner
], gap: "l"))
```

### Pattern N — Onboarding checklist

```text
$tasks = [
  { title: "Connect your data",    description: "Hook up a database.",        done: true,  action: () => _route_.navigate("/connect") },
  { title: "Invite your team",     description: "Add at least one teammate.", done: false, action: () => _route_.navigate("/team")    },
  { title: "Configure billing",    description: "Pick a plan.",               done: false, action: () => _route_.navigate("/billing") },
  { title: "Customize your theme", description: "Match your brand.",          done: false, action: () => _route_.navigate("/theme")   }
]

_app_ = Stack([
  PageHeader("Welcome to Acme", subtitle: "Let's get you set up — 4 quick steps."),
  OnboardingChecklist($tasks, title: "Setup", description: "Complete these to unlock your full workspace."),
  Banner("Need help?", description: "Book a 30-minute call with our team.", action: Button("Schedule", variant: "primary"), tone: "info")
], gap: "l")
```

### Pattern O — Search-driven directory / CRM

```text
$query = ""
$role  = "all"

$people = [
  { name: "Alex Diaz",   role: "Engineer", team: "Platform",  status: "online" },
  { name: "Sam Lee",     role: "Designer", team: "Marketing", status: "away" },
  { name: "Wren Carter", role: "PM",       team: "Platform",  status: "offline" },
  { name: "Mira Patel",  role: "Engineer", team: "Mobile",    status: "online" }
]

filtered = @Filter(
  if $role == "all" { $people } else { @Filter($people, "role", "==", $role) },
  "name", "contains", $query
)

toolbar = Toolbar(
  left: [
    SearchBar("dir-q", placeholder: "Search by name…", value: $query),
    ToggleGroup("role", items: [
      { value: "all",      label: "All" },
      { value: "Engineer", label: "Engineers" },
      { value: "Designer", label: "Designers" },
      { value: "PM",       label: "PMs" }
    ], value: $role)
  ])

cards = Grid(for p in filtered {
  ProfileCard(p.name, role: p.role, team: p.team, avatarSrc: `https://i.pravatar.cc/120?u=${p.name}`, status: p.status)
}, columns: { sm: 1, md: 2, lg: 3 }, gap: "l")

_app_ = Stack([
  PageHeader("Directory", subtitle: `${@Count(filtered)} people`),
  toolbar,
  if @Count(filtered) == 0 { EmptyState("No matches", description: "Try a different search term.", icon: "magnifying-glass") } else { cards }
], gap: "l")
```

### Pattern P — Brand-themed landing page

```text
theme = Theme({
  colors: { primary: "#0969da", accent: "#1f6feb", bg: "#ffffff", text: "#1f2328", border: "#d0d7de" },
  font:   { family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", familyHeading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", weightHeading: "600" },
  radius: { button: "6px", input: "6px" }
})

hero = Hero("Where the world builds software", subtitle: "Ship faster with collaborative coding.",
  primary: Button("Get started", variant: "primary"),
  secondary: Button("View pricing", variant: "secondary"),
  eyebrow: "Introducing Codespaces 2.0")

features = FeatureGrid([
  FeatureItem("Real-time collaboration", description: "Code together with your team in real-time, anywhere.", icon: "people-group", tone: "primary"),
  FeatureItem("Powerful CI/CD",          description: "From commit to deployment without leaving the platform.", icon: "code-branch",   tone: "info"),
  FeatureItem("Security first",          description: "Built-in scanning, secret management, and audit logs.",  icon: "shield-halved", tone: "success")
])

testimonial = Testimonial("This changed how our team ships.", author: "Asha Verma", role: "VP Engineering, Acme", avatarSrc: "https://i.pravatar.cc/80?u=asha")

closing = Banner("Start building today", description: "Free for personal use.", action: Button("Create a repository", variant: "primary"), tone: "primary")

_app_ = Stack([hero, features, testimonial, closing], gap: "l")
```

### Pattern Q — Kanban board

```text
$cards = [
  { id: 1, col: "todo",    title: "Migrate auth",        tags: ["auth"],     assignee: "Asha", tone: null     },
  { id: 2, col: "doing",   title: "Streaming UI v2",     tags: ["frontend"], assignee: "Alex", tone: "primary" },
  { id: 3, col: "review",  title: "Mobile onboarding",   tags: ["mobile"],   assignee: "Wren", tone: "warning" },
  { id: 4, col: "done",    title: "Activity timeline",   tags: ["shipped"],  assignee: "Mira", tone: "success" }
]

columns = [
  { id: "todo",   title: "To do" },
  { id: "doing",  title: "Doing" },
  { id: "review", title: "Review" },
  { id: "done",   title: "Done" }
]

cardsFor = (colId) => @Filter($cards, "col", "==", colId)

_app_ = Stack([
  PageHeader("Sprint board", subtitle: `${@Count($cards)} cards across ${@Count(columns)} columns`),
  KanbanBoard(for c in columns {
    KanbanColumn(c.title, items: for card in cardsFor(c.id) {
      KanbanCard(card.title, description: card.title, tags: card.tags, assignee: card.assignee, tone: card.tone)
    })
  })
], gap: "l")
```

### Pattern R — Inbox / split-view

```text
$threads = [
  { id: 1, title: "Alex Diaz",   message: "Where is order #4821?",   time: "9:25 AM",  unread: true,  avatarSrc: "https://i.pravatar.cc/40?u=alex" },
  { id: 2, title: "Sam Lee",     message: "Thanks for the update!",  time: "8:12 AM",  unread: false, avatarSrc: "https://i.pravatar.cc/40?u=sam" },
  { id: 3, title: "Wren Carter", message: "Can we ship overnight?",  time: "Yesterday", unread: true,  avatarSrc: "https://i.pravatar.cc/40?u=wren" }
]
$active = 1

action open(id) { $active = id }

list = InboxPanel(for t in $threads { { ...t, action: () => open(t.id) } }, title: "Inbox")

thread = if $active {
  Card([
    SectionHeader($threads.first.title),
    Stack(for n in @Range(1, 3) { ChatBubble("Alex", body: "Message body " + n) }, gap: "s"),
    TextArea("reply", placeholder: "Reply…"),
    Buttons([Button("Send", variant: "primary", icon: "paper-plane")])
  ])
} else {
  EmptyState("Pick a conversation", description: "Select a thread on the left.", icon: "inbox")
}

_app_ = Stack([
  PageHeader("Inbox"),
  SplitView(list, thread, primaryWidth: "360px")
], gap: "l")
```

### Pattern S — Content studio

```text
$body  = ""
$tags  = ["draft"]
$color = "#635bff"

editor = Card([
  SectionHeader("Article", actions: [Button("Publish", variant: "primary")]),
  RichTextEditor("body", value: $body, placeholder: "Write your story…")
])

metadata = Card([
  SectionHeader("Metadata"),
  FormSection("Tags & color", [
    FormControl("Tags",  control: TagInput("tags", value: $tags)),
    FormControl("Brand color", control: ColorPicker("color", value: $color))
  ])
])

snippet = Card([
  SectionHeader("Code snippet"),
  CodeEditor("snippet", language: "javascript", placeholder: "function hello() { return 'world' }")
])

_app_ = Stack([
  PageHeader("Studio", subtitle: "Compose and publish stories"),
  Grid([Stack([editor, snippet], gap: "l"), metadata], columns: { sm: 1, md: { _: "1fr 320px" } }, gap: "l")
], gap: "l")
```

### Pattern T — Data explorer

```text
$rows = http({ url: "/api/events", method: "GET" })
$sortField = "ts"
$sortDir   = "desc"
$selected  = []

action sortBy(field) {
  if $sortField == field { $sortDir = if $sortDir == "asc" { "desc" } else { "asc" } }
  else { $sortField = field  $sortDir = "asc" }
}

bulk = if @Count($selected) > 0 {
  Card([Stack([
    Text(`${@Count($selected)} selected`),
    Buttons([
      Button("Mark resolved", variant: "primary"),
      Button("Clear", onClick: () => $selected = [], variant: "ghost")
    ])
  ], direction: "row", justify: "between")])
} else { null }

table = DataGrid([
  Col("Time",     $rows.data.ts,     format: "datetime", sortable: true),
  Col("Service",  $rows.data.service, filterable: true),
  Col("Severity", for r in $rows.data { Badge(r.severity, variant: r.severity == "error" ? "danger" : "warning") }, sortable: true),
  Col("Message",  $rows.data.message)
], rowIds: $rows.data.id, selectedIds: $selected, selectable: true, sort: { field: $sortField, direction: $sortDir })

_app_ = Stack([
  PageHeader("Events", subtitle: `${@Count($rows.data)} events`),
  bulk,
  Async($rows,
    loading: LoadingState("Loading events…"),
    error:   ErrorState("Couldn't load events"),
    empty:   EmptyState("No events", icon: "rectangle-list"),
    data:    Card([table])
  )
], gap: "l")
```

### Pattern U — Media gallery

```text
$active = 0

photos = [
  { src: "https://picsum.photos/id/1018/800/500", caption: "Mountains" },
  { src: "https://picsum.photos/id/1019/800/500", caption: "Forest" },
  { src: "https://picsum.photos/id/1020/800/500", caption: "Beach" }
]

hero = Carousel(for p in photos { Image(p.src, caption: p.caption, ratio: "16:9") })

gallery = Gallery(for p in photos { { src: p.src, alt: p.caption } })

_app_ = Stack([
  PageHeader("Travel diary", subtitle: "A photo a day, every day."),
  hero,
  Card([SectionHeader("All photos"), gallery])
], gap: "l")
```

### Pattern V — Real-time feed

```text
$messages = []

effect [on:every(2000)] {
  $messages = [{ id: @Now(), body: "Server tick at " + @FormatDate(@Now(), "time"), tone: "info" }, ...$messages]
  if $messages.length > 20 { $messages = @Slice($messages, 0, 20) }
}

feed = Stack(for m in $messages {
  Card([Stack([
    Badge(@FormatDate(m.id, "time"), variant: m.tone),
    Text(m.body)
  ], direction: "row", gap: "m")])
}, gap: "s")

_app_ = Stack([
  PageHeader("Live feed", subtitle: "Auto-updating every 2s"),
  if @Count($messages) == 0 { EmptyState("Waiting for events…", icon: "satellite-dish") } else { feed }
], gap: "l")
```

---

## 17. Anti-patterns

| Wrong                                                                          | Right                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `$state x = 0`                                                                 | `$x = 0` — there is only one reactive atom kind.                                                       |
| `root = Stack([...])`                                                          | `_app_ = Stack([...])` — `_app_` is the canonical entry point.                                          |
| `Button("Save", Action([...]))`                                                | Declare `action save() { $x = 1 }` + `Button("Save", onClick: save)`.                                  |
| `Button("Save", "primary", true)`                                              | `Button("Save", variant: "primary", loading: true)` — multi-positional raises a schema error.            |
| `match $tab { "a" -> A() _ -> Default() }`                                     | `match $tab { "a": A() default: Default() }` — arms use `:`, wildcard is `default:`.                    |
| `component User(u) { Card([Text(u.name)]) }`                            | `component User(u) { return Card([Text(u.name)]) }` — components MUST `return`.                  |
| Single `Card([CardHeader, Text])` for a dashboard request                       | Use the **dashboard recipe** in §16 Pattern C.                                                          |
| Vertical `Stack` of `StatCard`s                                                | `Stats([StatCard(...), ...])`.                                                                          |
| `Stack(direction: "row", wrap: true)` for uniform tiles                        | `Grid(items, columns?, gap?)`.                                                                          |
| Vertical `Stack` of `Text("Label: " + v)` on a detail page              | `DescriptionList([DescriptionItem(label, value, icon?)])`.                                              |
| Table with no `Toolbar` above it                                               | Wrap in `Card([SectionHeader(...), Toolbar([...], [...]), Table(...)])`.                                |
| Flat form on the page                                                          | Group `FormControl`s inside Cards opened by `SectionHeader`.                                            |
| Plain text for status / priority / count                                       | `Badge` or `StatusDot`.                                                                                 |
| No nav for a multi-page surface                                                | `AppShell(Sidebar(...), [...])`.                                                                        |
| Empty list rendered as bare grey text                                          | `EmptyState(title, description, icon, Button(...))`.                                                    |
| `theme = Theme({ colorPrimary: "..." })`                                       | `theme = Theme({ colors: { primary: "..." } })` — only structured tokens are accepted.                   |
| Manual `<style>` injection or `style:` props for colour                        | Use `tone:` / `variant:` props and let the theme resolve.                                                |
| Emoji (`"❤️"`, `"⚠️"`) in `icon:` slots                                         | Use Font Awesome names (`"heart"`, `"triangle-exclamation"`).                                            |
| `for x in $items { … }` with a stale closure over `x` in a lambda outside body | Define the lambda inline: `for x in $items { Button("X", onClick: () => remove(x.id)) }`.                |
| `$user.name = "Alex"` direct mutation                                          | `$user = { ...$user, name: "Alex" }` — nested writes require whole-object replacement.                  |
| `Series("Name", values: numbers, stroke: "red")`                               | `Series("Name", values: numbers)` — chart colours come from theme tokens (`chart1`…`chart6`).            |

---

## 18. Self-check

Before finishing, walk your output and verify:

1. `_app_ = ...` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than `_app_`, `theme`, `$http`, `$i18n`)
   is reachable from `_app_`.
4. Containers reference their children by name; large data arrays
   live on their own trailing lines.
5. No statement is split across multiple lines unless it sits inside
   an unmatched `[`, `(`, or `{`.
6. Components end with an explicit `return` statement.
7. State uses the single-sigil `$name = value` form.
8. HTTP uses `http({ url, method, ... })`; the reactive bag exposes
   `.data` / `.error` / `.loading` / `.status` / `.refetch()` / `.cancel()`.
9. Router and `match` arms use `:` (not `->`) and `default:` (not `_`)
   as the wildcard.
10. Every visible button is wired to an `action` or a lambda.
11. Icons are Font Awesome names (no `fa-` prefix, no emoji).
12. Density target (§0.5) met for the page type — dashboards have 6+
    sections, settings 5+, etc.
13. No hard-coded colours / gradients. All styling uses `tone:` /
    `variant:` / theme tokens.
14. One positional argument max per component call.

---

## 19. Where do I look?

| For…                                                                  | Look in                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Quick syntax reference & the rules                                    | §0 (TL;DR) and the quick-reference snippet in §0.                                                                              |
| Visual hierarchy, density targets, theme awareness                    | §0.5.                                                                                                                          |
| Mental model (3 layers) & rendering semantics                         | §1.                                                                                                                            |
| Response structure, streaming-friendly ordering                        | §2.                                                                                                                            |
| Reactive state (declaration, scoping, persistence)                    | §3.                                                                                                                            |
| Component declarations, lambdas, `key:`                                | §4.                                                                                                                            |
| Actions — handlers, optimistic updates, navigation                     | §5.                                                                                                                            |
| Effects — triggers, debounce, cleanup, top-level vs. component-local   | §6.                                                                                                                            |
| HTTP — `http({...})`, `Async`, interceptors                            | §7.                                                                                                                            |
| Built-in `@` functions (aggregation, formatting, dates)                | §8.                                                                                                                            |
| Component catalog by group                                             | §9.                                                                                                                            |
| `js{ … }` escape hatch                                                 | §10.                                                                                                                           |
| Routing — `_router_`, `params`, `_route_`                              | §11.                                                                                                                           |
| Globals — `storage`, `console`                                         | §12.                                                                                                                           |
| Internationalisation — `$i18n`, `t()`, `Locale()`                      | §13.                                                                                                                           |
| Theming — `Theme({...})`, structured tokens, brand recipes             | §14.                                                                                                                           |
| Icons (Font Awesome)                                                   | §15.                                                                                                                           |
| Application recipes A–V                                                | §16.                                                                                                                           |
| Things to avoid                                                        | §17 + the anti-patterns table at the end of §0.5.                                                                              |
| Last-pass verification                                                 | §18 self-check.                                                                                                                |

### Further reading

- **README.md** — host integration (script tag, attributes, methods,
  events, system prompt fetching, build pipeline).
- **`docs/components.html`** — every component with live preview,
  positional signatures, prop tables, and enum values.
- **`docs/playground.html`** — CodeMirror 6 editor with syntax
  highlighting, autocomplete, share links, and an inspector that maps
  rendered DOM back to source.
- **`docs/visual-editor.html`** — previous drag-and-drop visual editor.
- **`docs/live-examples.html`** — catalog of bundled live demos
  (routing, settings, data explorer, media gallery, content studio,
  brand themes).
- **`docs/chat-bot.html`** — OpenRouter-powered streaming chat with
  four modes (Chat Compact / Chat Full / Website Builder / App Builder),
  image and PDF attachments, and "open in playground" / "download as
  standalone HTML" actions.
- **System prompts at the CDN** —
  [`system_prompt.txt`](https://asfand-dev.github.io/aktion/dist/system_prompt.txt)
  (full) and
  [`system_prompt_chat.txt`](https://asfand-dev.github.io/aktion/dist/system_prompt_chat.txt)
  (compact).
