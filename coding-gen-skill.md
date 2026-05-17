---
name: streaming-ui-script/coding-gen-skill
description: >-
  Deep knowledge base for building **complete applications** in
  Streaming UI Script. Read this when the goal is to author a full
  reactive app (todo list, dashboard, wizard, chat, settings, real-time feed,
  search, CRUD) rather than embed the renderer or answer a one-shot UI
  question. Companion to README.md (integration).
---

# Introduction 

## What is Streaming UI Script (streaming-ui-script)

A framework-agnostic web component that renders LLM-generated UI from
**Streaming UI Script** — a compact, declarative language designed for chat
assistants. Drop one `<script>` tag and one `<streaming-ui-script>` tag into
any HTML page — React, Vue, Angular, Svelte, plain HTML, or no framework at
all — and you have a streaming, interactive renderer for an LLM's response.

- **Live docs and demos:** <https://asfand-dev.github.io/streaming-ui-script/>
- **Live examples catalog** (chat, dashboards, commerce, inbox, CRM, pricing, routing, status, checkout, files, calendar, docs…): <https://asfand-dev.github.io/streaming-ui-script/live-examples.html>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js>
- **System prompt (full):** <https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt.txt>
- **System prompt (chat):** <https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt_chat.txt>

The library bundles everything needed at runtime:

- A **Streaming UI Script parser** (line-oriented, streaming-first, error-tolerant) with single-, double-, and backtick-quoted strings.
- An **evaluator with reactive state** (including `$$persistent` variables that survive page reloads via `localStorage`), template literals (`` `Hi ${$user.name}` ``), spread (`[...$a, ...$b]`, `{...$cur, key: v}`), optional chaining (`obj?.prop`), nullish coalescing (`name ?? "Guest"`), `@Each` destructuring (`"{id, name}"`), DSL-level component macros (`MyCard(user) = Card([…])`), lazy `@If` / `@Switch`, queries, mutations, actions, and **40+ built-in `@`-functions** — data ops (`@Count`, `@Sum`, `@Avg`, `@Min`, `@Max`, `@First`, `@Last`, `@Filter`, `@Sort`, `@Find`, `@Map`, `@GroupBy`, `@Slice`, `@Take`, `@Unique`, `@Reverse`, `@Range`, `@Repeat`, `@Pick`, `@Push`, `@Concat`), numeric (`@Round`, `@Abs`, `@Floor`, `@Ceil`, `@Clamp`), formatting (`@Format`, `@FormatCurrency`, `@FormatNumber`, `@FormatDate`, `@Plural`, casing helpers `@Capitalize`/`@Lowercase`/`@Uppercase`/`@Titlecase`/`@Camelcase`/`@Snakecase`/`@Kebabcase`/`@Pascalcase`), dates (`@Now`, `@Today`, `@AddDays`), iteration (`@Each`, `@If`, `@Switch`), and action steps (`@Run`, `@Set`, `@Reset`, `@ToAssistant`, `@OpenUrl`, `@Navigate`, `@Js`) — plus array shortcuts (`.length`, `.first`, `.last`, array pluck `$rows.title`).
- A **rich component library** of 130+ components — layout (`Stack`, `Grid`, `Sheet`, `Container`, `Spacer`, `AspectRatio`, `ScrollArea`, `Separator` with `label?`), content (`TextContent`, `Markdown`, `Icon`, `Quote`, `Callout`, `Spinner`, `Badge`, `BadgeList`), forms (`Input`, `TextArea`, `Select`, `Radio`, `Checkbox`, `Switch`, `Toggle`, `ToggleGroup`, `SegmentedControl`, `SearchBar`, `Button`, `Buttons`, `Form`, `FormControl`, `Slider`, `NumberInput`, `DatePicker`, `DateRangePicker`, `FileUpload`, `Combobox`, `MultiSelect`), tables and lists (`Table` with `density`/`striped`/`sticky`/`emptyLabel`, `Col` with `align`, `List`, `ListItem`, `Pagination` with `total`/`perPage`/`compact`, `Tree`, `TreeNode`), charts (`BarChart`, `LineChart`, `PieChart`, `Series`, `Sparkline`), chat composites (`SectionBlock`, `FollowUpBlock`, `ChatBubble`), feedback & media (`Avatar`, `AvatarGroup`, `Progress` with `segments`/`buffered`, `ProgressRing`, `Rating` with `halfStep` + custom icons, `Tooltip`, `HoverCard`, `Popover`, `Toast` (standalone via `position`), `Toasts`, `Kbd`, `Skeleton` (`paragraph`/`card`/`table-row`/`avatar`/`image` variants)), navigation (`Breadcrumb`, `Pagination`, `Navbar`, `NavbarItem`), menus (`DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`), **high-level pattern composites** (`Hero`, `Cover`, `PageHeader`, `SectionHeader`, `MetricGrid`, `Stats`, `Tile`, `Toolbar`, `EmptyState`, `Timeline`, `FeatureGrid`, `Testimonial`, `ProfileCard`, `PersonChip`, `Comment`, `MediaCard`, `Banner`, `Notification`, `KanbanBoard`, `DescriptionList`, `StatusDot`, `PricingTable`), and **app-shell composites** (`AppShell`, `Sidebar`, `SidebarSection`, `SidebarItem`, `SplitView`) that render full SaaS-style layouts in a single statement.
- A **built-in JavaScript layer** — `Script(...)` (lifecycle-managed, `useEffect`-style) and `@Js(body, args?)` (one-shot click handlers with per-item arg capture). Always available; the chat-mode prompt simply hides it from the LLM.
- A **built-in routing layer** — `Routes(...)`, `Route(path, content)`, `NavLink(...)`, `@Navigate(...)`, and reactive `$route` + `params`. Hash-based, framework-agnostic, always wired up.
- **Seven built-in themes** (`light`, `dark`, `neon`, `pastel`, `glass`, `brutalist`, `skyline`) plus full custom-token support via CSS custom properties.
- An auto-loaded **Font Awesome 6.7** stylesheet so every `icon` prop (`StatCard`, `Tile`, `FeatureItem`, `SidebarItem`, `Banner`, `Notification`, `TimelineItem`, `KanbanCard`, `Callout`, `Badge`, `BreadcrumbItem`, `DescriptionItem`, …) resolves out of the box. Never emit emoji.
- A **system prompt generator** that emits a clean, ordered prompt teaching the LLM exactly which components, builtins, and tools are available. Two flavours ship: `getSystemPrompt()` returns the full prompt (every feature); `getSystemPrompt({ mode: "chat" })` returns a compact chat-focused prompt without JS or routing.

Everything lives inside a Shadow DOM, so the renderer's styles never leak into
your application — and your application's styles never leak into the
renderer.

---

## Why?

LLMs are great at writing structured text, and a small DSL lets them describe a
full UI in 60–70% fewer tokens than JSON. This project ships that idea
**as a single web component**, so any framework — or no framework at all — can
render generative UI without extra wiring.

---

## When to reach for this library

Reach for `<streaming-ui-script>` when:

- The **LLM output drives the UI** — the user can't enumerate every possible
  layout up front, and the model needs to compose cards, tables, charts,
  forms, and follow-ups on the fly.
- You want streaming responses to **render progressively** without
  rebuilding a parser per host app. Each statement commits to the DOM as
  soon as it streams in.
- You need a **framework-agnostic embed** that works in legacy HTML,
  React, Vue, Angular, Svelte, or no framework at all.
- You want **two prompt flavours** (full vs. chat) without maintaining two
  separate authoring guides — both are emitted from one library.

Skip it when:

- The UI is fully **static and known ahead of time** — use plain HTML or a
  framework's components directly.
- The LLM only ever returns **short text** — render the text directly, no
  DSL needed.
- You need **full design-system parity with one framework's component
  library** (e.g. shadcn/ui under React with all your custom Tailwind
  tokens) — build a custom renderer instead.

---

## Quick start

### 1. Add the script tag

```html
<script type="module" src="https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js"></script>
```

For non-module setups use the IIFE build:

```html
<script src="https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.iife.js" defer></script>
```

The CSS is bundled inside the JS and injected into each instance's shadow root,
so you do **not** need a separate stylesheet.

### 2. Mount the tag

```html
<streaming-ui-script id="reply" theme="light"></streaming-ui-script>
```

### 3. Render a response

There are three equivalent ways to set the program text:

```html
<!-- as an attribute -->
<streaming-ui-script response='root = Card([CardHeader("Hi")])'></streaming-ui-script>

<!-- as inner text -->
<streaming-ui-script>
  root = Card([CardHeader("Hi")])
</streaming-ui-script>

<!-- as a property / method -->
<script>
  const el = document.querySelector("streaming-ui-script");
  el.setResponse(`root = Stack([greeting])
greeting = Card([CardHeader("Hello", "Generative UI in plain HTML")])`);
</script>
```

# Building applications with Streaming UI Script

> **Audience.** You are an LLM authoring code in a host page that has mounted
> `<streaming-ui-script>`. This document teaches the full mental model and
> all the patterns needed to build apps end-to-end. It assumes the basics
> from [`README.md`](./README.md) and goes deep.
>
> Use this as the *single source of truth* for the language. When in doubt,
> grep this file before writing code; the prompt sent to you at runtime is
> intentionally compressed.

---

## 0. TL;DR — the rules

If you internalise these rules, you will write correct, polished programs:

1. **One statement per line.** `name = Expression`. The renderer commits each
   line as it streams in.
2. **`root = …` is line one.** It anchors the UI shell so users see structure
   before children arrive. Use forward references (`root = Stack([header, list])`)
   and define `header`, `list` below it.
3. **Reach for high-level patterns first.** Start with `Hero`, `PageHeader`,
   `SectionHeader`, `MetricGrid`, `Toolbar`, `EmptyState`, `Timeline`,
   `FeatureGrid`, `Testimonial`, `ProfileCard`, `Banner`, `KanbanBoard`,
   `DescriptionList`, `PricingTable`, `StatusDot`, and the **app-shell**
   composites (`AppShell`, `Sidebar`, `SplitView`). They commit a full visual
   section in one line — never reinvent these with raw `Stack`/`Card`.
   The fastest way to take a request from "wireframe" to "production UI" is
   to swap a hand-rolled section for the matching pattern.
4. **`$variables` are the only mutable state.** Everything else is recomputed
   from them on every render.
5. **`Query` runs automatically when its `$variable` args change.** Pass the
   bare `$variable` — `{q: $search}`, not `{q: "" + $search}` — so dependency
   tracking works.
6. **`Mutation` only runs from `@Run(name)` inside `Action([...])`.**
7. **`@Each($items, "x", template)` scopes `x` strictly to `template`.** `x`
   is **not** state and **cannot** be read via `ctx.state` from JS.
8. **Pass per-item data to JS via `@Js(body, {id: x.id})`.** Read it inside
   the body as `ctx.args.id`.
9. **Prefer declarative builtins (`@Push`, `@Filter`, `@Sort`, `@Set`) over
   `@Js`.** Only fall back to JS when no builtin captures the change (e.g.
   toggling one field on one item).
10. **Strings come in three flavours.** `"double"`, `'single'`, and
    `` `backtick` ``. Backticks span lines and don't need escapes — use them
    for multi-line script bodies, and add `${expression}` interpolation
    when you need to splice values in (`` `Hello ${$user.name}` ``). Without
    `${...}` they stay as plain strings — perfect for raw JS bodies.
11. **Use `Grid`, not `Stack(row, wrap=true)`, for uniform-sized tiles.**
    Use `Stack(direction="row")` only when items have different sizes.
12. **Add status colour everywhere.** `StatCard(..., trend, delta)`, `Badge`
    variants, `TimelineItem(status)`, `Banner` — colour conveys meaning.
13. **`Script(...)` and `@Js(...)` are part of the runtime.** They always
    run when you emit them — no opt-in attribute. The default ("full") system
    prompt teaches the LLM about them; the chat-flavoured prompt
    (`getSystemPrompt({ mode: "chat" })`) omits the JavaScript section when
    you want to keep the model purely declarative for chat-style replies.
14. **`Routes(...)` / `Route(...)` / `NavLink(...)` / `@Navigate(...)` are
    part of the runtime.** Hash-based routing is always wired up; the
    reactive `$route` and `params` surfaces are always available. The chat
    prompt mode omits the routing section so the LLM doesn't reach for it
    in chat-style replies.
15. **Density must match the page type.** Dashboards have 6+ named sections,
    detail pages 5+, settings pages 5+, list pages 5+, landing pages 5+.
    If your draft is short, add a complementary section (recent activity,
    status, related items, follow-ups) — never ship a sparse response.
16. **Icons are Font Awesome names.** Every `icon` prop expects a Free Font
    Awesome name (no `fa-` prefix) — `"house"`, `"chart-line"`,
    `"sack-dollar"`, `"cart-shopping"`, `"circle-check"`. Optional variant
    prefix: `"regular:star"`, `"brands:github"`. Use `Icon(name, variant?, size?)`
    to render a standalone glyph. The CDN stylesheet auto-loads — never emit
    raw emoji.
17. **Themes are runtime, not authored.** The host page picks a theme via the
    `theme` attribute (`light`, `dark`, `neon`, `pastel`, `glass`, `brutalist`,
    `skyline`) or a partial token map. Authored Streaming UI Script must work
    on every theme — never hard-code colours. Use semantic props
    (`tone="primary"`, `variant="success"`) and let the theme map handle the
    pixels.
18. **Hit the density target.** A response that mentions "dashboard",
    "settings", "inbox", "profile", "pricing", or "report" but produces a
    single `Card` reads as a wireframe. The minimums in § 0.5 are the
    baseline — always add a complementary section (related items, recent
    activity, follow-ups) when the draft is short.
19. **Use `$$persistent` for anything the user expects to find after a
    refresh.** Theme picks, sidebar collapsed state, draft form input,
    "recently viewed", multi-step wizard cursor — every "real app" UI has
    at least one. Read/write surface is identical to `$`; the runtime
    stores values via `localStorage`, keyed per element id, so two
    `<streaming-ui-script>` instances on the same page never collide.
20. **Reach for `@If` / `@Switch` instead of nested ternaries.** Both are
    lazy — only the chosen branch is evaluated, which keeps loop variables
    in scope from leaking into branches that aren't being rendered.
21. **Factor repeated trees with macros (`Name(args) = Expression`).**
    Define once at the top of the response, call anywhere — including
    inside `@Each`. Parameters are scoped to the body, exactly like
    `@Each` loop vars.
22. **Use responsive prop maps for full pages.** `Grid(items, {sm: 1, md: 2, lg: 4}, "l")`
    and `Stack(children, {sm: "column", md: "row"})` work out of the box.
    Plain numbers / strings still work for simple sections.

---

## 0.5. Rich layout principles (for production-quality UIs)

LLMs that use this library tend to default to sparse layouts unless they're
explicitly nudged. **The goal of this section is to make polished, dense,
SaaS-style UIs the default**, matching the quality of hand-crafted
shadcn/ui + Tailwind layouts.

### Pattern-first composition

Before opening a `Stack`/`Card`, scan this checklist:

| If you need…                              | Use this single-line composite                                                                        |
|-------------------------------------------|--------------------------------------------------------------------------------------------------------|
| A page title + breadcrumbs + actions     | `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)`                                       |
| A sub-section title inside a Card         | `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)`                                        |
| A row of KPIs                             | `MetricGrid([StatCard(...), ...])`                                                                    |
| A compact inline stat strip (3–6 items)   | `Stats([{label, value, hint?, tone?}, ...], align?)`                                                  |
| Quick-action / category tiles             | `Grid([Tile(label, icon?, value?, description?, tone?, action?), ...], columns?)`                     |
| A filter + actions bar above a list/table | `Toolbar([searchControls...], [actions...])`                                                          |
| A polished search input                   | `SearchBar(id, placeholder?, value?, shortcut?, action?)`                                             |
| A key/value summary on a detail page      | `DescriptionList([DescriptionItem(label, value, icon?)])`                                             |
| Inline health pip                         | `StatusDot(label, tone?, pulse?)`                                                                     |
| Pricing tiers                             | `PricingTable([PricingCard(plan, price, period?, ...)])`                                              |
| App-level navigation                      | `AppShell(Sidebar(...), [content...], topbar?)`                                                       |
| Master/detail (inbox, file browser)       | `SplitView([primary...], [detail...], primaryWidth?)`                                                 |
| Empty list                                | `EmptyState(title, description?, icon?, action?)`                                                     |
| Activity feed                             | `Timeline([TimelineItem(title, time?, description?, icon?, tone?)])`                                  |
| Kanban / task board                       | `KanbanBoard([KanbanColumn(title, [KanbanCard(...)], tone?)])`                                        |
| Hero / marketing intro                    | `Hero(title, subtitle?, primary?, secondary?, eyebrow?, highlights?, imageSrc?, tone?)`               |
| Image-led hero (product, article)         | `Cover(title, imageSrc, subtitle?, eyebrow?, caption?, actions?, tone?, height?)`                     |
| Feature highlights                        | `FeatureGrid([FeatureItem(title, description?, icon?, tone?)])`                                       |
| Product / article preview card            | `MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?)`             |
| Star rating + review count                | `Rating(value, max?, label?, count?, size?, interactive?)`                                            |
| Circular progress / completion ring       | `ProgressRing(value?, max?, label?, caption?, tone?, size?, indeterminate?)`                          |
| Inline notification (inbox / feed item)   | `Notification(title, message?, time?, icon?, avatarSrc?, tone?, unread?, actions?)`                   |
| Person reference in a row / cell          | `PersonChip(name, role?, avatarSrc?, size?, status?, action?)`                                        |
| Inline tip / footnote                     | `Callout(variant, title, description?, icon?, true)` — pass `compact=true` for a dense one-line note |
| Pull quote (not a full testimonial)       | `Quote(text, cite?, tone?)`                                                                           |
| Chat-style message (review, transcript)   | `ChatBubble(author, body, time?, avatarSrc?, from?, status?)`                                         |
| Centered readable column                  | `Container([content...], size?, maxWidth?, padding?)`                                                 |
| Push siblings to opposite edges in a row  | `Spacer()` (inside `Stack(direction="row")`)                                                          |

### Visual hierarchy rules

1. **Status colour for meaning.** Bad: `Stack` of plain `StatCard`s. Good:
   `StatCard("Revenue","$48k","up","+12%","sack-dollar")` — trend + delta + icon
   together communicate health at a glance.
2. **Font Awesome icons on every iconable slot.** `StatCard`, `FeatureItem`,
   `TimelineItem`, `Banner`, `KanbanCard`, `Callout`, `ListItem`, `Badge`,
   `BreadcrumbItem`, `SidebarItem` all accept an `icon`. Set it to a Free
   Font Awesome name (no `fa-` prefix) such as `"sack-dollar"`,
   `"chart-line"`, `"house"`, `"cart-shopping"`, `"circle-check"`. Optional
   variant prefix: `"regular:star"`, `"brands:github"`. Use the dedicated
   `Icon(name, variant?, size?)` component for a standalone glyph. The
   stylesheet is auto-loaded via CDN — never emit raw emoji.
3. **Avatar for people, not text.** Author names, assignees, commenters
   render as `Avatar(name, src?, size?)` or via `ProfileCard`/`Comment`.
4. **Group fields inside Cards.** Settings pages are a stack of Cards. Each
   Card opens with a `SectionHeader` (or `CardHeader`) and contains a few
   related `FormControl`s — never a flat list of fields on the page.
5. **Tabs/Sheets for secondary content.** Hide low-priority sections behind
   `Tabs` or a side `Sheet` rather than scrolling forever.
6. **Padding, gap, and rhythm.** Use `gap="l"` for top-level section
   spacing, `gap="m"` inside Cards, `gap="s"` between tightly related
   controls. Wrap each major chunk in a `Card` for visual grouping.

### Density targets (the most common failure)

| Page type             | Minimum sections | What sections to include                                                                              |
|-----------------------|------------------|-------------------------------------------------------------------------------------------------------|
| Dashboard             | **6**            | `PageHeader` + `Toolbar`/filters + `MetricGrid` + chart Card + table/list Card      |
| Detail / profile      | **5**            | `PageHeader` + `DescriptionList` Card + content Card + activity/timeline Card       |
| Settings              | **5**            | `PageHeader` + 3+ Section Cards (each with `SectionHeader`) + danger-zone Card                        |
| Landing / marketing   | **5**            | `Hero` (or `Cover`) + `FeatureGrid` + (`Testimonial` &#124; `Quote` &#124; `PricingTable`) + closing `Banner` |
| Product / article     | **6**            | `Cover` + `Stats` trust strip + spec Card / `DescriptionList` + related `MediaCard` grid + reviews (`ChatBubble`/`Testimonial`) + closing `Banner`/`Notification` |
| Pricing               | **5**            | `Cover` (or `Hero`) + cycle `ToggleGroup` + `PricingTable` + `FeatureGrid` + FAQ `Accordion` + closing `Banner` |
| Inbox / messaging     | **4**            | `PageHeader` + `SplitView` (list of `Notification` + thread of `ChatBubble`) + composer (`TextArea` + `Buttons`) |
| Directory / CRM       | **5**            | `PageHeader` + `Tile` quick-stats + `SearchBar` + filter `ToggleGroup` + `ProfileCard` grid + `Pagination` |
| List / browse         | **5**            | `PageHeader` + `Toolbar` + (optional `MetricGrid`) + `Table`/`Grid` Card + `Pagination`               |
| Full app surface      | **4 (in shell)** | `AppShell` wrapping a `Sidebar` + (PageHeader + sections)                                              |
| Empty / zero state    | **3**            | `PageHeader` + `EmptyState` (with CTA)                                              |

If your response has fewer named sections than the minimum, **add a
complementary section** (related items, recent activity, status, follow-ups).
Plain vertical stacking of two or three components reads as a wireframe.

### Theme awareness (write tone-first, never colour-first)

The host page chooses one of seven built-in themes (`light`, `dark`, `neon`,
`pastel`, `glass`, `brutalist`, `skyline`) or a partial token map. **Authored
programs must work on every theme** — never hard-code colours, gradients, or
typography. Use semantic props and let the runtime resolve them.

| Theme        | Vibe                                                                                              | Use for                                                            |
|--------------|---------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| `light`      | Crisp default, indigo accent, soft shadows.                                                       | Most business apps, dashboards, settings.                          |
| `dark`       | Standard dark surface, indigo accent.                                                             | Night mode, code-heavy workflows, ops dashboards.                  |
| `neon`       | Cyberpunk-inspired dark mode with magenta/cyan glow, monospace headings, sharp corners.           | Devtools, gaming, music apps, late-night dashboards.               |
| `pastel`     | Soft, friendly, light & rounded. Lavender + mint palette, generous radii, gentle shadows.        | Onboarding, wellness, education, consumer apps.                    |
| `glass`      | Modern glassmorphism — vivid gradient backdrop, frosted translucent surfaces, indigo→cyan accent. | Marketing, product launches, hero pages with imagery.              |
| `brutalist`  | Neo-brutalism — hard 2 px black borders, chunky offset shadows, loud primary, zero gradients.     | Editorial sites, art portfolios, statement landing pages.          |
| `skyline`    | Enterprise cloud-console aesthetic — deep navy primary, cyan accents, calm pale blue bg.         | Admin consoles, B2B portals, infra dashboards.                     |

Rules for theme-friendly authoring:

- **Always pass `variant` / `tone` instead of colour.** `Badge("Active", "success", null, "sm")`,
  not `Badge("Active", "default", null, "sm")` with manual styling. `Badge`,
  `StatCard.trend`, `Banner.tone`, `Callout.variant`, `TimelineItem.tone`,
  `KanbanCard.tone`, `Quote.tone`, `Progress.tone`, `ProgressRing.tone`,
  and `StatusDot.tone` all map to the active theme's palette.
- **Stick to semantic palette values** — `"default"`, `"primary"`, `"success"`,
  `"warning"`, `"danger"`, `"info"`. Anything else (`"red"`, `"#ff0000"`,
  `"--my-token"`) will render as the default tone on every theme except the
  one you wrote against.
- **Use `Icon` as a visual accent**, never as a colour: the icon adopts the
  surrounding tone token (`StatCard("Revenue", ..., "up", ..., "sack-dollar")`
  renders green on `light`, lime on `neon`, and so on).
- **Trust the chart palette.** `Series` colours come from the active theme
  (`chart1`…`chart6`). Never pass a `stroke` / `fill` — there is no API for it
  and the chart would clash with the rest of the page.
- **Brutalist and neon will collapse if you nest gradients.** Stay declarative;
  the theme adds the visual personality.

A correctly-authored response should look polished on `pastel` and `brutalist`
without changes — if you have to "tweak it for dark mode", you've leaked a
colour somewhere.

### In-script theming with `Theme({...})`

When the user **explicitly asks for a brand or product feel** ("make it look
like GitHub", "use our company colours", "I want a Stripe-style page"), the
LLM may emit a `Theme({...})` declaration on a top-level binding called
`theme`. The runtime treats `theme` (like `root`) as a reserved name: it
evaluates the call and writes the resulting token map to the host as CSS
custom properties — **on top of** whatever base theme the host configured.
Every component in the rendered tree picks the tokens up instantly.

```
theme = Theme({
  colorPrimary:       "#0969da",
  colorPrimaryHover:  "#0860c4",
  colorAccent:        "#1f6feb",
  colorBg:            "#ffffff",
  colorText:          "#1f2328",
  colorTextMuted:     "#656d76",
  colorBorder:        "#d0d7de",
  fontFamily:         "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyHeading:  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radiusButton:       "6px",
  radiusInput:        "6px",
  borderWidth:        "1px",
  buttonFontWeight:   "500"
})
root = Stack([...])
```

**Tokens by domain** (all optional — unknown keys are ignored):

| Group        | Tokens                                                                                                                                       |
|--------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| Surface      | `colorBg`, `colorBgSubtle`, `colorSurface`, `colorSurfaceMuted`, `colorBorder`, `colorBorderSubtle`, `colorText`, `colorTextMuted`           |
| Brand        | `colorPrimary`, `colorPrimaryHover`, `colorPrimaryText`, `colorAccent`, `colorAccentHover`, `colorAccentText`, `colorFocusRing`              |
| Semantic     | `colorSuccess`, `colorWarning`, `colorDanger`, `colorInfo`                                                                                   |
| Typography   | `fontFamily`, `fontFamilyHeading`, `fontFamilyMono`, `fontSizeBase`, `fontSizeSm`, `fontSizeLg`, `fontSizeHeading`, `fontSizeTitle`, `fontWeightBody`, `fontWeightHeading`, `lineHeightBody`, `lineHeightHeading`, `letterSpacingHeading`, `headingTextTransform` |
| Shape        | `radiusXs`, `radiusSm`, `radiusMd`, `radiusLg`, `radiusPill`, `radiusButton`, `radiusInput`, `borderWidth`, `shadowSm`, `shadowMd`, `shadowLg` |
| Spacing      | `spacingXs`, `spacingS`, `spacingM`, `spacingL`, `spacingXl`                                                                                 |
| Buttons      | `buttonFontWeight`, `buttonTextTransform`, `buttonLetterSpacing`, `buttonPaddingY`, `buttonPaddingX`                                          |
| Motion       | `transitionDuration`                                                                                                                          |
| Charts       | `chart1`–`chart6`                                                                                                                            |

Values are CSS strings — colours (`"#0969da"`, `"rgb(99,102,241)"`), lengths
(`"6px"`, `"1.4em"`), font stacks (`"'Inter', system-ui, sans-serif"`),
numeric weights (`"600"`), keywords (`"uppercase"`, `"none"`). Numbers are
auto-stringified.

**Brand recipes the LLM can compose on demand:**

- **GitHub** — sans-serif `-apple-system` stack, blue `#0969da` primary,
  gray-on-white surfaces, 6 px radii, weight-500 buttons.
- **Apple** — SF Pro Display heading, large titles, generous spacing,
  12–14 px button radius, light borders.
- **Stripe** — Sohne / Inter stack, indigo `#635bff` primary, 10 px button
  radius, weight-600 buttons with `-0.01em` tracking.
- **IONOS** — Inter stack, navy `#003580` primary, cyan `#0095d6` accent,
  4 px button radius, dense spacing.

**Rules for `Theme(...)`:**

- Only emit it when the user **asks for a brand or specific look**. The
  default themes already cover most replies; don't override them by reflex.
- Put `theme = Theme({...})` **before** the `root = ...` line so the tokens
  are visible when the rest of the program streams in.
- Stick to documented keys. The runtime ignores typos silently — but you
  also won't get the customisation you wanted.
- **Don't double-pay tokens.** If a `Theme(...)` already sets `colorPrimary`,
  do NOT also pass `"primary"` overrides on individual components; rely on
  the token cascade.
- Removing the `Theme(...)` line snaps the UI back to the base theme — no
  manual cleanup required.

### Anti-patterns (never ship these)

| Wrong                                                                       | Right                                                                                       |
|----------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| Single `Card([CardHeader, TextContent])` for a dashboard request           | Use the **Dashboard recipe** in § 11 Pattern I or the dashboard recipe in the system prompt |
| Vertical `Stack` of `StatCard`s                                            | `MetricGrid([StatCard(...), ...])`                                                          |
| `Stack(direction="row", wrap=true)` for uniform tiles                     | `Grid(items, columns?, gap?)`                                                                |
| Vertical `Stack` of `TextContent("Label: " + value)` lines on a detail page| `DescriptionList([DescriptionItem(label, value, icon?)])`                                   |
| Table with no `Toolbar` above it                                           | Wrap in `Card([SectionHeader(...), Toolbar([...], [...]), Table(...)])`                     |
| Flat form on the page                                                      | Group `FormControl`s inside Cards opened by `SectionHeader`                                 |
| Settings with no sectioning                                                | A `Stack` of Cards, one per concern (General, Notifications, Billing, Danger zone)          |
| Plain text for status / priority / count                                   | `Badge` or `StatusDot`                                                                      |
| No nav for a multi-page surface                                            | `AppShell(Sidebar(...), [...])` — sidebar stays visible across content                       |
| Empty list rendered as bare grey text                                      | `EmptyState(title, description, icon, Button(...))`                                          |

---

## 1. Mental model

Streaming UI Script has three layers that compose into a full application:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1 — Declarative tree                                      │
│   Composition of components. Pure data. Re-computed every       │
│   render. Lazy: each `name = Expr` is a function of the current │
│   state, evaluated only when something downstream needs it.     │
│                                                                 │
│       root = Stack([header, body])                              │
│       header = PageHeader("Hi", "Welcome")                          │
│       body = Card([TextContent($message)])                      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ depends on
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2 — Reactive state                                        │
│   `$variables` (read/written by humans and by JS) and `Query`   │
│   results (read-only, refreshed by the runtime when args        │
│   change). A change to either schedules a re-render.            │
│                                                                 │
│       $message = "Hello"                                        │
│       data = Query("get_metrics", {days: $days})                │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ updated by
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3 — Effects                                               │
│   `Action([...])` runs on click / submit / follow-up.           │
│   `Script(...)` runs on mount and re-runs when deps change      │
│   (always available). Both can update state, call               │
│   tools, and dispatch messages — closing the loop back to L2.   │
│                                                                 │
│       btn = Button("Refresh", Action([@Run(data), @Set($q, "")]))│
└─────────────────────────────────────────────────────────────────┘
```

**Why this matters.** Most app behaviour is expressible in L1 + L2 alone.
Reach for L3 only when the change isn't expressible as a pure data
transformation (timers, fetches you control, focus, animation, clipboard,
keyboard shortcuts, audio).

**Rendering is reconciliation, not re-creation.** Every state change re-runs
L1 to produce a fresh tree, but the runtime diffs the new tree against the
live DOM instead of replacing it. That means you can drive a re-render from
anywhere (typing into an input, ticking a counter, a Query refreshing) and
the user's browser-owned state stays intact:

- A focused `Input` keeps focus, the caret position, the selection, and any
  IME composition through the re-render.
- An open `AccordionItem` stays open.
- The active pane of a `Tabs` stays active.
- A scrolled `ScrollArea` keeps its scroll position.

You do **not** need to wire state for these behaviours — they happen for
free. If you build a custom component that needs to hold UI state across
re-renders, use `helpers.useInstanceState(key, initial)` (the same slot the
built-in `Tabs` uses); the renderer keys the slot by the component's
position in the tree so independent instances never collide.

---

## 2. Anatomy of a response

### Statement shape

```
identifier = Expression
$identifier = Literal               # reactive state declaration
```

- `identifier` is bare: `kebab-case`, `snake_case`, or `lowerCamelCase`. No
  prefix unless it's a state declaration.
- `Expression` is any Streaming UI Script expression (component call, value,
  ternary, member access, etc.).
- `$identifier = …` declares reactive state. The right-hand side **must be a
  literal** (string, number, boolean, array, object) — no function calls.

### Streaming-friendly ordering

The renderer commits one statement at a time as text streams in. To make
your UI render top-down (shell first, leaves last):

1. **`root = …` first.** Always.
2. **Component definitions** that `root` references (`header`, `body`,
   `footer`, etc.).
3. **State declarations** (`$days = "7"`).
4. **Leaf data** (long arrays, big strings, generated tables) on their own
   trailing lines so they appear last.

Example:

```text
root = Stack([hero, kpis, chart, footer])
hero = Card([CardHeader("Q3 Performance", "Revenue and growth")])
kpis = Stack([rev, growth], "row", "m")
rev = StatCard("Revenue", "" + data.revenue, "up", "+12%")
growth = StatCard("Growth", data.growth_pct, "up")
chart = LineChart(months, [series])
footer = TextContent("Generated by Streaming UI Script", "small", "muted")

$days = "90"
data = Query("perf_summary", {days: $days}, {revenue: 0, growth_pct: "0%"})
months = ["Jul", "Aug", "Sep"]
series = Series("Revenue", [120000, 145000, 162000])
```

When this streams in, the user sees the four-card layout immediately, then
each card fills in as its definition arrives.

### Forward references (hoisting)

Names are resolved lazily — every identifier reference re-evaluates the
binding when read. That's why `root = Stack([greeting])` works even when
`greeting = Card(...)` is defined later. The same hoisting works inside
`@Each` templates:

```text
list = @Each($todos, "t", row)
row = Card([TextContent(t.text), Button("X", Action([@Set($todos, @Filter($todos, "id", "!=", t.id))]))])
```

Even though `row` references `t` (a loop variable), the binding for `row`
re-evaluates per iteration with `t` in scope — so each rendered row sees its
own item.

### Comments

The parser strips three comment styles silently, so they never reach the
renderer:

- `// rest of line` — canonical line comment.
- `# rest of line` — shell/Python-style line comment (identical semantics).
- `/* … */` — block comment, can span multiple lines.

Prefer self-documenting identifiers and leave comments out of your output.
Each comment costs tokens that would be better spent on actual UI. Name
things well — `expandedRowId`, `totalCount`, `formIsValid` — and let the
structure speak for itself.

---

## 3. Reactive state

### Declaring state

```text
$count = 0
$query = ""
$filter = "all"
$todos = [{id: 1, text: "Welcome"}]
$user = {name: "Anon", email: ""}
$open = false
```

The literal on the right is the **initial value AND the reset value**.
`@Reset($count)` returns it to `0`, not `undefined`.

### Reading state

Use the `$` prefix anywhere an expression is allowed:

```text
greeting = TextContent("Hello, " + $user.name)
visible = @Filter($todos, "done", "==", false)
disabled = $query == ""
```

### Writing state from actions

```text
clearBtn = Button("Clear", Action([@Set($query, "")]))
resetAll = Button("Reset", Action([@Reset($query, $filter, $count)]))
incBtn   = Button("+1",    Action([@Set($count, $count + 1)]))
```

`@Set(name, value)` evaluates `value` at render time and bakes it into the
step. `@Reset(...)` returns each named state to its declared default.

### Persistent state (`$$variable`)

For values the user expects to survive page reloads (theme preference, cart
contents, sidebar collapsed state, draft form text, recently viewed item,
multi-step wizard cursor), declare with the **double-dollar sigil**:

```text
$$theme        = "dark"
$$cart         = []
$$lastVisited  = "/dashboard"
$$sidebarOpen  = true
```

- The runtime persists every change via the host's storage (`localStorage`
  by default), keyed by the element id + variable name so two
  `<streaming-ui-script>` elements on the same page don't collide.
- Read / write / reset uses **the same surface as `$`** — `$$cart`,
  `@Set($$cart, …)`, `@Reset($$cart)`. The only thing that changes is the
  sigil.
- Persistent and non-persistent names live in separate namespaces — `$theme`
  and `$$theme` are unrelated. Pick one flavour per variable.
- The declared default is the **seed** — used only when no stored value
  exists yet. On every subsequent mount, the stored value wins.

This is critical for any "real app" UI. A todo list, settings page, or
shopping cart that resets on refresh feels broken.

### Two-way binding

Forms two-way-bind when you pass a `$variable` as the value prop:

```text
$query = ""
field = Input("q", "Search…", "text", null, $query)
```

Typing into the field updates `$query`. Anywhere else in the program that
reads `$query` re-renders.

Bindings work for `Input`, `TextArea`, `Select`, `Checkbox`, `CheckBoxGroup`,
and `Radio`. The argument position is always the trailing `value` prop —
check the component reference (§ 9) for each signature.

### Snapshotting state in JS

Inside a `Script` or `@Js` body, use `ctx.state.get(name)` / `ctx.state.set(name, value)`.
Loop variables (from `@Each`) are **render-time only** — see § 6 and § 10.

---

## 4. Tools: Query and Mutation

The host page registers async functions:

```js
el.setTools({
  list_orders:  async ({ limit }) => fetch(`/api/orders?limit=${limit}`).then(r => r.json()),
  update_order: async ({ id, status }) => fetch(`/api/orders/${id}`, {method:"PATCH", body: JSON.stringify({status})}).then(r => r.json()),
});
```

The LLM calls them through two declarative wrappers.

### Query: auto-running, dependency-tracked

```text
data = Query("list_orders", {limit: 10, status: $statusFilter}, {rows: [], total: 0}, 30)
```

- **Args 0 — tool name.** Must match a key in `setTools`.
- **Args 1 — arguments object.** Each `$variable` reference becomes a
  dependency. When it changes, `Query` re-runs.
- **Args 2 — default value.** Shown until the first result lands; also used
  while the query is re-running. Pick a shape your downstream code can
  safely read (`{rows: [], total: 0}`, not `null`).
- **Args 3 — optional refresh interval in seconds.** `Query(..., ..., ..., 30)`
  re-runs the tool every 30 s **in addition to** dependency-triggered runs.

Reading the result is just member access:

```text
totalRow = TextContent("" + data.total + " orders")
rows = @Each(data.rows, "o", orderRow)
orderRow = ListItem(o.title, "$" + o.amount)
```

### Mutation: explicit, action-triggered

```text
saveBtn = Button("Save", Action([@Run(saveMutation), @ToAssistant("Saved")]))
saveMutation = Mutation("update_order", {id: $current.id, status: $current.status})
```

- Same first three argument positions as `Query`.
- **Never runs automatically.** You must trigger it via `@Run(name)` inside
  an action.
- After `@Run` completes, the renderer re-evaluates everything (so any
  `Query` whose result was invalidated should re-fetch — see § 7 on cache
  busting).

### Forcing a Query to re-fetch

If a mutation changes server state but doesn't change any `Query` argument,
add a version counter:

```text
$ver = 0
data = Query("list_todos", {filter: $filter, ver: $ver}, {rows: []})

addBtn = Button("Add", Action([
  @Run(addMutation),
  @Set($ver, $ver + 1)   // bumps the dependency, forces re-run
]))
addMutation = Mutation("add_todo", {title: $draft})
```

### When to model as Query vs Mutation vs local state

| Operation                                   | Use                       |
|---------------------------------------------|---------------------------|
| Fetch a list / search results / KPIs        | `Query` (auto, with deps) |
| Create / update / delete on the server      | `Mutation`                |
| Toggle a panel, switch a tab, hold a draft  | `$variable` + `@Set`      |
| Compute something from existing data        | bare expression / builtin |
| Run periodic polling                        | `Query(..., refreshSec)`  |

---

## 5. Actions — wiring buttons, follow-ups, and forms

Every interactive control takes an `Action([...])` payload. Action steps
execute sequentially; a failing step (notably an `@Run` that throws)
short-circuits the rest.

> **Live deep dive:**
> [`docs/actions.html`](https://asfand-dev.github.io/streaming-ui-script/actions.html)
> covers every step, every action carrier (Button, FollowUpItem, SidebarItem,
> NavbarItem, MenuItem, Tile, Form), worked examples, and common mistakes.

### The full step menu

| Step                          | Effect                                                                                |
|-------------------------------|---------------------------------------------------------------------------------------|
| `@Set($name, value)`          | Write `$name = value`. `value` is evaluated at click time, so it can read other state.|
| `@Reset($a, $b, …)`           | Reset each named state to its declared default.                                       |
| `@Run(ref)`                   | Execute a `Query` or `Mutation` by name. **Awaited** before the next step runs.       |
| `@ToAssistant("text")`        | Fire `assistant-message` event. Typical for follow-ups and "ask the model" buttons.   |
| `@OpenUrl("https://…")`       | Open a URL in a new tab. Sanitised; opened with `noopener,noreferrer`.                |
| `@Navigate("/path")`          | Push a new hash path through the built-in router. See § 10.5.                         |
| `@Js(body, args?)`            | Run a JavaScript body. Reach for it last — see § 10 for the full surface.             |

### Implicit "ask the assistant"

Buttons and `FollowUpItem`s **without** an explicit `Action(...)` automatically
fire `@ToAssistant(label)`. This keeps chat-style replies compact:

```text
follow = FollowUpBlock([
  FollowUpItem("Show me more"),
  FollowUpItem("Compare alternatives"),
  FollowUpItem("Explain this")
])
askMore = Button("Why?")     # equivalent to Action([@ToAssistant("Why?")])
```

### Multi-step actions

Steps run sequentially. `@Run` is awaited, so subsequent steps see post-mutation state:

```text
saveBtn = Button("Save & close", Action([
  @Run(saveMutation),
  @Set($editing, false),
  @ToAssistant("Saved.")
]), "primary")
```

### Buttons grouped horizontally

```text
controls = Buttons([
  Button("Cancel", Action([@Set($open, false)]), "ghost"),
  Button("Save",   Action([@Run(saveMutation)]),  "primary")
])
```

### Follow-ups

`FollowUpBlock` accepts plain strings, `{label, message}` objects, or
`FollowUpItem(label, message?)` calls. Clicking sends `message ?? label`
back to the LLM via `@ToAssistant`.

```text
prompts = FollowUpBlock([
  FollowUpItem("Show me last week's data"),
  FollowUpItem("Filter to closed deals", "Show only closed deals.")
])
```

### Save → refresh → close (canonical mutation chain)

When a mutation invalidates a query whose args don't otherwise change, bump a
version counter to force a refetch:

```text
$ver = 0
list   = Query("list_tickets", {ver: $ver}, {rows: []})
create = Mutation("create_ticket", {title: $draft})

addBtn = Button("Create", Action([
  @Run(create),               # POST to the server
  @Set($ver, $ver + 1),       # bumps the dependency, refetches `list`
  @Reset($draft),             # clears the form
  @ToAssistant("Created.")
]), "primary")
```

### Navigate after a save

`@Navigate` slots cleanly into any chain — wire post-save redirects without JS:

```text
saveBtn = Button("Save", Action([
  @Run(saveMutation),
  @Navigate("/dashboard"),
  @ToAssistant("Saved.")
]), "primary")

cancelBtn = Button("Cancel", Action([@Navigate("/dashboard")]), "ghost")
```

### Where actions appear

| Component                                          | Action prop                              |
|----------------------------------------------------|------------------------------------------|
| `Button(label, action?, …)`                        | 2nd arg                                  |
| `FollowUpItem(label, message?)`                    | implicit `@ToAssistant(message ?? label)`|
| `SidebarItem(label, icon?, active?, badge?, action?)` | 5th arg                               |
| `NavbarItem(label, to?, href?, icon?, active?, action?)` | 6th arg                            |
| `MenuItem(label, action?, icon?, shortcut?, …)`    | 2nd arg                                  |
| `Tile(label, icon?, value?, description?, tone?, action?)` | 6th arg                          |
| `Form(name, buttons, fields)`                      | each Button in `buttons`                 |
| `Banner` / `Notification`                          | pass a Button as the action slot         |

---

## 6. Loops & lists

The single most error-prone area for LLMs. Read this carefully.

### `@Each(arr, "varName", template)`

- Iterates `arr`. For each item, binds `varName` and evaluates `template`.
- `template` is **any expression** — typically an identifier that references
  a component definition, or an inline `Component(...)` call.
- The bound variable is **only visible inside `template`** (and inside
  anything `template` recursively references via named bindings).

```text
$todos = [{id: 1, text: "a", done: false}, {id: 2, text: "b", done: true}]
list = @Each($todos, "t", row)
row = Card([Stack([
  Badge(t.done ? "done" : "open"),
  TextContent(t.text)
])])
```

Both `row` and the bindings it references re-evaluate per iteration with
`t` bound.

### What does **not** work

- Reading `t` outside the template: `total = @Count(t)`. ❌
- Reading `t` from JS via `ctx.state.get('t')`. ❌ (`t` is not state.)
- Defining `t` as a state variable (`$t = ...`) to "share" the loop var. ❌

### Passing per-item data to JS

Use `@Js`'s second argument:

```text
delBtn = Button("Delete", Action([
  @Js(`
    const todos = ctx.state.get('todos') || [];
    ctx.state.set('todos', todos.filter(x => x.id !== ctx.args.id));
  `, {id: t.id})
]))
```

The `{id: t.id}` literal is evaluated **at render time, per iteration**, so
each rendered row's button captures its own id. Inside the body, read it as
`ctx.args.id`.

### Filtering / sorting / paginating before iterating

```text
$query = ""
$sortDir = "asc"

visible = @Sort(@Filter($todos, "title", "contains", $query), "title", $sortDir)
list = @Each(visible, "t", row)
```

### Counts and aggregates

```text
total = $todos.length
done  = @Filter($todos, "done", "==", true).length
open  = @Filter($todos, "done", "==", false).length
summary = TextContent(open + " open · " + done + " done · " + total + " total", "small", "muted")
```

Note `$todos.length`, `@Filter(...).length`, and `.first` / `.last` all work
directly — no extra `@Count(...)` wrapper required.

---

## 7. Values, operators, and member access

### Literal types

```text
str      = "double quoted"
str2     = 'single quoted'
multi    = `backtick
spans multiple
lines without escapes`
num      = 42
neg      = -3.14
bool     = true
nothing  = null
arr      = [1, "two", true, null]
obj      = {label: "X", value: 1, nested: {ok: true}}
```

### Template literals

Backtick strings support `${expression}` interpolation when at least one
`${...}` block is present:

```text
greeting = `Hello ${$user.name}, you have ${$todos.length} todos`
summary  = `Filtered ${@Filter($rows, "active", "==", true).length}/${$rows.length}`
```

Cleaner than `"Hello " + $user.name + ", you have " + $todos.length + " todos"`.
Plain backtick strings without `${...}` stay as regular strings — perfect for
multi-line JS bodies inside `Script(...)` / `@Js(...)`. To embed a literal
`${` in a JS body, escape it as `\${`.

### Operators (in precedence order)

| Group          | Operators                                                   |
|----------------|-------------------------------------------------------------|
| Unary          | `!a`, `-a`                                                  |
| Multiplicative | `*`, `/`, `%`                                               |
| Additive       | `+`, `-`                                                    |
| Comparison     | `==`, `!=`, `<`, `<=`, `>`, `>=`                            |
| Logical        | `&&`, `\|\|`, `??` (nullish — returns left unless null/undefined) |
| Conditional    | `cond ? a : b` (ternary)                                    |

`+` is string-concatenation when either operand is a string, otherwise
numeric. Coerce to string explicitly with `"" + value` when in doubt.

`??` is distinct from `||`: it short-circuits **only** on `null` /
`undefined`. Use it for "default when missing" without accidentally
discarding `0`, `false`, or `""`:

```text
total  = $count ?? 0          # 0 stays 0, undefined becomes 0
label  = $title ?? "Untitled" # "" stays "", null becomes "Untitled"
```

### Optional chaining (`?.`)

```text
avatar = $user?.profile?.avatar     # undefined if $user or profile is null
city   = data?.address?.city ?? "—"
```

`obj?.prop` short-circuits to `undefined` when `obj` is `null` /
`undefined`, instead of throwing or returning the JS error string. Chain
freely without verbose ternary guards.

### Spread operator (`...`)

Works in array literals and object literals:

```text
merged  = [...$pinned, ...$todos, lastItem]
patched = {...$current, status: "done", updatedAt: @Now()}
chars   = [..."abc"]    # ["a", "b", "c"] — strings spread into characters
```

Useful for merging state in mutation args (`Mutation("update", {...$current, status: "done"})`)
or building derived arrays without dropping reactivity.

### Member access

`a.b` reaches into objects and does smart things on arrays:

| Target                 | `target.property` semantics                                |
|------------------------|------------------------------------------------------------|
| Object                 | Looks up `property` (or `undefined`).                      |
| Array, special prop    | `.length`, `.first`, `.last` return scalar values.         |
| Array, any other prop  | **Pluck** — returns `target.map(item => item.property)`.   |
| String, `.length`      | Character count.                                           |
| null / undefined       | `undefined`.                                               |

Examples:

```text
$rows = [{title: "A", n: 1}, {title: "B", n: 2}, {title: "C", n: 3}]

titles = $rows.title       # ["A", "B", "C"]
total  = $rows.length      # 3
first  = $rows.first       # {title: "A", n: 1}
nValue = $rows.first.n     # 1
```

### Ternary chains

```text
status = $loading ? "Loading…" : ($error ? "Error" : "Ready")
```

### `&&` / `||` short-circuit

```text
canSave  = $email != "" && $emailError == ""
greeting = $user.name || "Guest"
```

---

## 8. Built-in functions

All are `@`-prefixed and may appear anywhere in an expression.

### Aggregation

| Builtin              | Returns                                                        |
|----------------------|----------------------------------------------------------------|
| `@Count(arr)`        | Length of an array. Same as `arr.length`.                      |
| `@Sum(nums)`         | Sum of numbers. Non-numbers count as 0.                        |
| `@Avg(nums)`         | Average. Empty → 0.                                            |
| `@Min(nums)`         | Minimum. Empty → 0.                                            |
| `@Max(nums)`         | Maximum. Empty → 0.                                            |
| `@First(arr)`        | First element or `null`. Same as `arr.first`.                  |
| `@Last(arr)`         | Last element or `null`. Same as `arr.last`.                    |

### Numeric

| Builtin                     | Returns                          |
|-----------------------------|----------------------------------|
| `@Round(n, decimals?)`      | Half-up rounding.                |
| `@Abs(n)`                   | Absolute value.                  |
| `@Floor(n)`, `@Ceil(n)`     | Floor / ceil.                    |

### Numeric (extras)

| Builtin                     | Returns                                                       |
|-----------------------------|---------------------------------------------------------------|
| `@Clamp(n, min, max)`       | Clamps `n` into `[min, max]`. Great for progress / sliders.   |

### Array shape

| Builtin                                       | Returns                                                                       |
|-----------------------------------------------|-------------------------------------------------------------------------------|
| `@Filter(arr, "field", "op", value)`          | Subset where `item[field] op value` is true.                                  |
| `@Sort(arr, "field", "asc"\|"desc")`          | Sorted copy. Numbers compared numerically; everything else lexically.         |
| `@Find(arr, "field", "op", value)`            | First matching item or `null`.                                                |
| `@Map(arr, "field")`                          | Pluck a field — readable alias for `arr.field`.                               |
| `@GroupBy(arr, "field")`                      | `{key: [items…]}` grouped by `item[field]`.                                   |
| `@Slice(arr, start?, end?)`                   | `arr.slice(start, end)`.                                                      |
| `@Take(arr, n)`                               | First N items — `@Slice(arr, 0, n)`.                                          |
| `@Reverse(arr)`                               | Reversed copy (non-mutating).                                                 |
| `@Unique(arr, "field"?)`                      | Dedupe by strict equality or by a field.                                      |
| `@Range(start, end, step?)`                   | Inclusive integer range (`[0..4]`). Step defaults to ±1.                      |
| `@Repeat(value, n)`                           | `n` copies of `value` — great for skeleton/placeholder grids.                 |
| `@Pick(obj, ["a", "b"])`                      | New object with only the listed keys.                                         |

Filter operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`
(case-insensitive substring on stringified values).

### Array growth (declarative add)

| Builtin                      | Returns                                            |
|------------------------------|----------------------------------------------------|
| `@Push(arr, value)`          | New array with `value` appended. Non-mutating.     |
| `@Concat(a, b)`              | Concatenated array. Either side may be `null`.     |

These pair perfectly with `@Set`:

```text
addBtn = Button("Add", Action([@Set($todos, @Push($todos, newTodo))]))
prependBtn = Button("Pin", Action([@Set($todos, @Concat([$pinned], $todos))]))
```

### Formatting

| Builtin                                          | Returns                                                                          |
|--------------------------------------------------|----------------------------------------------------------------------------------|
| `@Format(value, "currency"\|"percent"\|"number", currencyOrLocale?, locale?)` | Locale-aware number formatter. |
| `@FormatCurrency(value, currency?, locale?)`     | Shortcut for currency mode (default `"USD"`).                                    |
| `@FormatNumber(value, locale?)`                  | Plain locale-aware number formatting.                                            |
| `@FormatDate(value, format?)`                    | Moment-like tokens (`"MMM D"`, `"YYYY-MM-DD"`) OR named modes: `"relative"` (e.g. "5m ago"), `"date"`, `"time"`, `"datetime"`, `"iso"`. |
| `@Plural(n, singular, plural?)`                  | `"1 order"` / `"3 orders"`. Plural defaults to `singular + "s"`.                 |

### Date / time

| Builtin                | Returns                                                       |
|------------------------|---------------------------------------------------------------|
| `@Now()`               | Current epoch ms — feed into `@FormatDate` for display.       |
| `@Today()`             | Today at local midnight, as ISO string.                       |
| `@AddDays(date, n)`    | Shift a date by N days (negative N moves backward). Returns ISO. |

### String helpers

| Builtin                | Returns                                                       |
|------------------------|---------------------------------------------------------------|
| `@Capitalize(s)`       | Uppercase first char.                                         |
| `@Lowercase(s)`        | Lowercase every char.                                         |
| `@Uppercase(s)`        | Uppercase every char.                                         |
| `@Titlecase(s)`        | Capitalise the first letter of each word.                     |
| `@Camelcase(s)`        | `"hello world"` → `"helloWorld"`.                             |
| `@Snakecase(s)`        | `"helloWorld"` → `"hello_world"`.                             |
| `@Kebabcase(s)`        | `"hello world"` → `"hello-world"`.                            |
| `@Pascalcase(s)`       | `"hello world"` → `"HelloWorld"`.                             |

### Iteration

`@Each(arr, "varName", template)` — see § 6. `varName` supports
destructuring: `"{id, name, role}"` binds those fields directly per row,
`"row, {id, name}"` binds BOTH the row object and the individual fields.

### Lazy control flow

| Builtin                                       | Returns                                                                       |
|-----------------------------------------------|-------------------------------------------------------------------------------|
| `@If(condition, trueBranch, falseBranch?)`    | Only the chosen branch is evaluated.                                          |
| `@Switch(value, {key: branch, …}, default?)`  | Stringifies `value`; renders the matching property or `default`. Branches are lazy. |

Use these instead of nested ternaries — especially when an unused branch
would otherwise reference a loop variable that isn't in scope, or call a
slow builtin you'd rather skip.

```text
body  = @If($mode == "empty", emptyState, dataView)
panel = @Switch($tab, {
  overview: overviewPanel,
  billing:  billingPanel,
  security: securityPanel
}, overviewPanel)
```

### Action step builtins

Use these only inside `Action([...])`:

| Step                       | Effect                                                       |
|----------------------------|--------------------------------------------------------------|
| `@Run(ref)`                | Run a `Query`/`Mutation` by name.                            |
| `@Set($name, value)`       | Write reactive state.                                        |
| `@Reset($a, $b, ...)`      | Reset reactive state.                                        |
| `@ToAssistant("text")`     | Fire `assistant-message`.                                    |
| `@OpenUrl("url")`          | Open a URL.                                                  |
| `@Js(body, args?)`         | Run JavaScript (always available; omitted from the `chat` prompt). |
| `@Navigate("/path")`       | Navigate to a hash path (always available; omitted from the `chat` prompt). |

---

## 9. Component reference (by category)

Signatures below are positional. Optional arguments come last. When a prop
expects an array of a named subcomponent (e.g. `Table` takes `Col[]`), pass
the children as a literal `[...]` array.

### Layout

```text
Stack(children, direction?, gap?, align?, justify?, wrap?)
  direction: "column" (default) | "row"
              — OR a responsive map like {sm: "column", md: "row"}
  gap: "xs" | "s" | "m" (default) | "l" | "xl"
              — OR a responsive map like {sm: "s", md: "m"}
  align: "start" | "center" | "end" | "stretch"
  justify: "start" | "center" | "end" | "between" | "around"
  wrap: boolean

Grid(children, columns?, gap?, minItemWidth?)
  columns: 1..12 (default: auto-fit responsive)
              — OR a responsive map like {sm: 1, md: 2, lg: 4}
  gap: "xs" | "s" | "m" (default) | "l" | "xl"
              — OR a responsive map like {sm: "s", md: "l"}
  minItemWidth: CSS width (default 220px) — used when columns is omitted

# Breakpoints used by responsive maps (mobile-first):
#   base (default)   sm (≥640px)   md (≥768px)   lg (≥1024px)   xl (≥1280px)
# Bare numbers / strings still work for simple sections — the responsive
# form is opt-in. Prefer it on full pages that should adapt to phone +
# tablet + desktop.

Section(children, title?)
Card(children, variant?)
  variant: "default" | "outlined" | "elevated"
CardHeader(title, subtitle?)
CardBody(children)
CardFooter(children)
Separator(orientation?, label?, decorative?)
  orientation: "horizontal" | "vertical"
  label: optional center label (horizontal only).

Tabs(items, defaultValue?, orientation?)
  orientation: "horizontal" (default) | "vertical"
  Built-in keyboard nav: Left/Right (or Up/Down vertical), Home, End.
TabItem(value, label, children, badge?, icon?)
  badge: trailing count chip rendered in the trigger.
  icon:  leading Font Awesome icon name.

Accordion(items)
AccordionItem(title, children, open?)

Modal(title, open, children, size?, footer?, closable?, closeOnBackdrop?)
  open is usually a $variable; clicking the × close button clears it.
  size: "sm" | "md" (default) | "lg" | "xl" | "full"
  footer: Node[] — typically a row of action Buttons.
  closable: true by default (renders the × button).
  closeOnBackdrop: false by default; opt in to backdrop-click dismissal.
Sheet(title, open, children, side?, footer?)
  side: "right" (default) | "left" | "top" | "bottom"

Steps(items)
  items can be {title, details?, active?} objects (preferred) or
  StepsItem(...) nodes. Plain strings render as a title-only step.
StepsItem(title, details?, active?)
  active=true highlights the current step in a multi-step flow.

AspectRatio(ratio, children)              # ratio: "16:9", "1:1", "4:3", or decimal
ScrollArea(children, maxHeight?, direction?)
  maxHeight: CSS height (default 320px)
  direction: "vertical" (default) | "horizontal" | "both"

Container(children, size?, maxWidth?, padding?)
  size: "sm" | "md" | "lg" (default) | "xl" | "full"  — picks sensible max-width per size
  maxWidth: custom CSS max-width (overrides size)
  padding: "none" | "s" | "m" (default) | "l"
  Use for landing pages and long-form articles that need a centered, readable
  column inside a wider page.

Spacer(size?, flex?)
  size: "xs" | "s" | "m" | "l" | "xl"  — fixed gap when set
  flex: boolean — when true (or when size is omitted) acts as a flex grower
  Use inside Stack(direction="row") to push the next sibling to the far edge.
```

**When to reach for which container.**

| Goal                                                | Use                                                                |
|-----------------------------------------------------|--------------------------------------------------------------------|
| Vertical list of mixed-height blocks                | `Stack` (default direction)                                        |
| Uniform-sized cards / tiles / KPIs in a row         | `Grid` — auto-fits responsively, children stay equal width         |
| Asymmetric row (sidebar + main)                     | `Stack(direction="row")`                                           |
| Centered confirmation dialog                        | `Modal(title, open, [body])`                                       |
| Detail panel that slides in from the side           | `Sheet(title, open, [body], side)`                                 |
| Long log / chat / list with capped height           | `ScrollArea([items], maxHeight)`                                   |
| Fixed-ratio embed (video, thumbnail)                | `AspectRatio("16:9", [Image(...)])`                                |

### Content

```text
TextContent(value, variant?, tone?)
  variant: "small" | "body" | "body-heavy" | "large" | "large-heavy" | "muted"
  tone: "default" | "muted" | "primary" | "success" | "warning" | "danger"

Image(src, alt?, caption?, ratio?, fit?, fallback?)
  ratio: "16:9" | "1:1" | "4:3" | … — self-constrains; no outer AspectRatio needed.
  fit: "cover" (default) | "contain" | "fill" | "none" | "scale-down"
  fallback: text label OR Font Awesome icon name shown when src is missing/unsafe.

Icon(name, variant?, size?)
  name: Font Awesome name without the `fa-` prefix ("house", "chart-line", …).
        Accepts an optional `variant:name` form ("regular:star", "brands:github").
  variant: "solid" (default) | "regular" | "brands"
  size: "xs" | "sm" | "md" (default) | "lg" | "xl"

Link(label, href, external?)
Badge(label, variant?, icon?, size?)
  variant: "neutral" (default) | "primary" | "success" | "warning" | "danger" | "info"
  size: "xs" | "sm" | "md" (default) | "lg" | "xl"
  icon: optional Font Awesome name rendered before the label.
BadgeList(labels, variant?, size?)
  Renders a row of Badge pills from an array of strings.

Callout(variant?, title, description?, icon?, compact?)
  variant: "neutral" | "info" | "success" | "warning" | "danger" | "error"
  compact=true renders a single-line note variant (useful for inline tips).

CodeBlock(language?, codeString, showLineNumbers?, highlightLines?)
  Always renders a copy-to-clipboard button.
  highlightLines: e.g. "3-5,8" to emphasise specific lines.

Skeleton(variant?, lines?, height?, shape?, width?)
  variant: "paragraph" (default) | "card" | "table-row" | "avatar" | "image"
  shape:   "rect" | "circle" — for custom one-off shapes (use with width/height).

Spinner(size?, label?, tone?)
  Inline indeterminate loader. Pass `label` to render a caption beside
  the ring (also announced via aria-label). size accepts the shared
  xs|sm|md|lg|xl enum.

Markdown(content)
  Hand-rolled renderer with the following surfaces:
    - Headings (#, ##, ###)
    - Blockquotes (`>`)
    - Fenced code blocks (```lang)
    - Bullet (`-` / `*`) and numbered (`1.`) lists
    - Inline **bold**, *italic*, `code`
    - Links `[label](href)` (sanitised, opens in new tab)
    - Images `![alt](src)` (sanitised src)
    - Auto-linked bare http/https URLs

Quote(text, cite?, tone?)
  tone: "default" | "primary" | "success" | "warning" | "danger" | "info"
  Inline pull-quote — lighter than Testimonial.
```

### Forms

```text
Button(label, action?, variant?, type?, size?, icon?, disabled?)
  variant: "primary" | "secondary" | "ghost" | "danger"
  type: "button" | "submit"
  size: "sm" | "md" (default) | "lg"   (legacy "small"/"normal"/"large" also accepted)
  icon: Font Awesome name for an inline leading icon.
Buttons(items, direction?)              # items: Button[]; direction: "row"|"column"

Input(id, placeholder?, type?, validations?, value?)
  type: "text" (default) | "email" | "password" | "number" | "tel" | "url" | "date"

TextArea(id, placeholder?, rows?, value?)
Select(id, items, label?, placeholder?, value?)
SelectItem(value, label)
Checkbox(id, label, value?)
CheckBoxGroup(name, items, value?)
CheckBoxItem(label, name, description?, defaultChecked?)
Radio(id, items, value?)                # items: SelectItem[]
FormControl(label, field, hint?)
Form(id, buttons, fields)               # fields: FormControl[]; buttons: Buttons|Button

SearchBar(id, placeholder?, value?, shortcut?, action?, submitLabel?)
  Pre-styled search input with a leading magnifying-glass icon and an optional keyboard
  hint (e.g. shortcut="/"). Pass a $variable as `value` for two-way binding;
  pass `action` for an explicit submit button.

Slider(id, min?, max?, step?, value?, label?, showValue?, disabled?)
  Range input. Pass a $variable as `value` for two-way binding (binds on "input"
  so the bound state tracks the thumb live). showValue=true renders the current
  numeric value next to the label.
NumberInput(id, value?, min?, max?, step?, placeholder?, disabled?)
  Numeric input flanked by decrement/increment buttons that respect step,
  min, and max. Pass a $variable as `value` for two-way binding.
  The component fills its container's width (the field stretches; the −/+
  buttons stay a fixed size on each end) — drop it directly inside a
  FormControl and it will look consistent with Input / Select.
DatePicker(id, value?, label?, min?, max?, placeholder?, disabled?)
  Native date input ("yyyy-mm-dd"). Pass a $variable as `value` for two-way
  binding. min / max are ISO date strings.
FileUpload(id, label?, accept?, multiple?, hint?, action?, disabled?)
  Styled file picker. `accept` matches the standard HTML `accept` attribute
  (e.g. "image/*"). Files are not serialisable, so wire `action` to handle
  the selection — typically `Action([@Js("upload(files)", [$files])])`
  with the input ref captured by a Script.
Combobox(id, items, value?, placeholder?, emptyText?, disabled?)
  Searchable single-select dropdown. items: SelectItem[] (or {value,label}[]).
  Pass a $variable as `value` for two-way binding; picking an option fires
  a Set(name, value) on that variable. Filter state is held locally via
  useInstanceState so typing does not collapse the panel.

MultiSelect(id, items, value?, placeholder?, emptyLabel?, max?, disabled?)
  Multi-option searchable dropdown. Bind a $variable (array of values) as
  `value` for two-way binding — picking/removing an option fires a
  Set(name, [...]) on that variable. The trigger renders selected items as
  removable chips. max caps the number of selections.

DateRangePicker(id, from?, to?, label?, min?, max?, disabled?)
  Paired ISO date inputs that share the same min/max. Bind `from` and
  `to` to separate $variables for a two-way-bound range.

SegmentedControl(id, items, value?, size?)
  View-mode picker for 2–5 mutually-exclusive options (grid/list,
  day/week/month, light/dark). items can be {value, label, icon?}
  objects, [value, label] tuples, or plain strings. Visually distinct
  from ToggleGroup — use this when all options act on the same surface.
  size: "sm" | "md" (default) | "lg".
```

### Data

```text
Table(columns, caption?, density?, striped?, sticky?, emptyLabel?)
  columns: Col[]
  density: "comfortable" (default) | "compact"
  striped:  zebra-stripe alternating rows
  sticky:   pin the header row when the wrapper scrolls (use with maxHeight via ScrollArea)
  emptyLabel: text for the zero-state cell (default "No data")

Col(header, values, format?, align?)
  format: "text" | "number" | "currency" | "date"
  align:  "left" | "center" | "right"  (per-column alignment)
  values: typically an array pluck (data.rows.title)

List(items, ordered?)
ListItem(title, description?, icon?)

StatCard(label, value, trend?, delta?, icon?, spark?, tone?)
  trend: "up" | "down" | "flat"
  spark: number[] — inline Sparkline rendered beneath the value.
  tone:  "default" | "primary" | "success" | "warning" | "danger" | "info"

Sparkline(values, tone?)
  Tiny inline trend chart for KPIs, table cells, and dashboards. Renders
  an SVG line with a soft fill. Lighter than LineChart — use anywhere
  you would otherwise inline a single-series chart.

Tree(items)                              # items: TreeNode[]
TreeNode(label, children?, icon?, expanded?, active?, badge?, action?)
  Hierarchical row built on native <details>/<summary>, so expand/collapse state
  survives re-renders for free. Pass `children` (TreeNode[]) to make a branch
  and `expanded=true` to open it by default. Leaf nodes render as a button
  that fires `action` (typically @Navigate or @Set). Use for file trees, org
  charts, sidebar category browsers, settings outlines.
```

### Charts

```text
Series(name, values)                    # values: number[]
BarChart(labels, series, title?)        # series: Series[]
LineChart(labels, series, title?)
PieChart(labels, values, title?)        # parallel arrays
```

### Chat composites

```text
SectionBlock(title, children, description?)
ListBlock(items, ordered?)              # items: string[]
FollowUpBlock(items, title?)            # items: FollowUpItem[] | {label,message}[] | string[]
FollowUpItem(label, message?)
ActionLink(label, action)

ChatBubble(author, body, time?, avatarSrc?, from?, status?)
  from: "agent" (default, left-aligned) | "me" (right-aligned, primary tint) | "system"
  status: "sending" | "sent" | "delivered" | "read" | "error"
  Use for conversation threads, agent transcripts, support chats, and any
  message-style UI — including review threads on product pages.
```

### Feedback & media

```text
Avatar(name, src?, size?, status?)
  size: "sm" | "md" (default) | "lg" | "xl"
  status: "online" | "offline" | "busy" | "away"
AvatarGroup(items, max?, size?)
  items: Avatar[] | {name, src?}[] | string[]
  max: maximum avatars to show before showing "+N" (default 4)
Progress(value?, max?, label?, tone?, indeterminate?, showValue?, segments?, buffered?)
  value: 0..max
  tone: "primary" (default) | "success" | "warning" | "danger" | "info"
  segments: render N equal segments (steps) instead of a continuous bar —
            ideal for onboarding flows and multi-step wizards.
  buffered: secondary value (0..max) drawn behind the bar — downloads,
            video buffering, "loaded vs played" indicators.
Switch(id, label?, value?, description?, disabled?)
  value: bound boolean (typically a $variable for two-way binding)
Toggle(label, value?, icon?, variant?, size?)
  value: pressed state — pass $variable for click-to-flip binding
  variant: "default" | "outline" | "ghost"
ToggleGroup(id, items, value?, variant?, size?)
  items: string[] | [value,label][] | {value,label,icon?}[]
  value: typically $variable for two-way single-select binding
Tooltip(label, trigger, side?)         # short hint on hover/focus
  side: "top" (default) | "bottom" | "left" | "right"
HoverCard(trigger, content, side?)     # rich card on hover/focus
Kbd(keys, size?)                       # keys: "⌘ K" or string[] (renders chips)

Rating(value, max?, label?, count?, size?, interactive?, halfStep?, icon?)
  0–max stars with optional numeric badge and review count. Pass a $variable
  as `value` plus interactive=true to let users rate something. halfStep=true
  lets clicking the left half of a star set a fractional value. icon swaps
  the glyph family — "star" (default), "heart", "thumb", "fire", "bolt", or
  any custom Font Awesome name.
ProgressRing(value?, max?, label?, caption?, tone?, size?, indeterminate?)
  Circular progress indicator. Use for KPIs, quotas, completion rings —
  anything better visualised as a circle than a bar.

Popover(trigger, content, title?, side?, align?, width?)
  Click-triggered overlay companion to HoverCard (which opens on hover).
  trigger: Node — the click target (typically a Button or Avatar). The trigger
           remains visible while the popover is open — clicking it again
           toggles the panel closed.
  content: Node[] — body shown inside the popover when open.
  title:   optional small header above the body.
  side:    "bottom" (default) | "top" | "left" | "right"
  align:   "start" (default) | "center" | "end"
  width:   CSS width (default "280px")
  Open/closed state is held locally and survives re-renders. Always shows a
  × close button in the header. Clicking the trigger again, clicking outside,
  or pressing Escape also closes the panel.
Toast(title, message?, tone?, icon?, duration?, action?, onClose?, position?)
  Single transient notification card. Always renders a × close button in the
  top-right corner, regardless of whether onClose is set.
  title:    required string.
  message:  optional secondary body line.
  tone:     "default" (info) | "primary" | "success" | "warning" | "danger" | "info"
  icon:     Font Awesome name (defaults to a tone-appropriate icon).
  duration: auto-dismiss after N ms (e.g. 4000). Omit/null = persistent.
  action:   optional Button(...) shown beneath the message (e.g. "Undo", "Retry").
  onClose:  Action fired when the toast is dismissed (× button OR auto-dismiss).
            Use it to remove the toast from your reactive list, log analytics, etc.
  position: pin a STANDALONE Toast to a viewport corner without wrapping it in
            Toasts(...). Accepts the same values as Toasts.position. Use this
            for one-off notifications; for grouped/queued toasts use Toasts.
Toasts(items, position?)
  Fixed-position stack of Toasts.
  items:    Toast[]
  position: "top-right" | "top-left" | "top-center" |
            "bottom-right" (default) | "bottom-left" | "bottom-center"
  Use for queued, transient feedback: save confirmations, copy-success blips,
  error chains. For top-of-page persistent announcements use Banner instead.
```

### Menus

```text
DropdownMenu(trigger, items, side?, align?, label?)
  trigger: Node — clickable trigger (Button, Avatar, IconButton, …).
  items:   (MenuItem | MenuSeparator | MenuLabel)[]
  side:    "bottom" (default) | "top" | "left" | "right"
  align:   "start" (default) | "center" | "end"
  label:   optional ARIA label for the menu.
  Click toggles, click on a MenuItem runs its action and closes, click outside
  or press Escape closes without acting. Open state persists across re-renders
  via useInstanceState — typing into an unrelated input does NOT collapse it.
MenuItem(label, action?, icon?, shortcut?, variant?, disabled?)
  variant: "default" | "danger" (for destructive entries)
  icon:    Font Awesome name shown before the label
  shortcut: trailing keyboard hint (e.g. "⌘ K", "⇧ Enter")
MenuSeparator()                            # thin horizontal rule
MenuLabel(label)                           # small uppercase group heading
```

### Navigation

```text
Breadcrumb(items, separator?)          # items: BreadcrumbItem[] or string[]
BreadcrumbItem(label, href?, icon?)    # omit href on the current/leaf page
Pagination(page, totalPages, siblings?, total?, perPage?, perPageOptions?, compact?)
  page: typically a $variable for two-way binding
  siblings: page numbers shown either side of current (default 1)
  total: total record count — when set with perPage, renders the
         "Showing N–M of T" summary line.
  perPage: bind a $variable to expose a per-page selector (the bound state
           absorbs change events). Pass a plain number to render the summary
           without an editable selector.
  perPageOptions: number[] — overrides the default 10/20/50/100 dropdown.
  compact: drop the page-number row; keep Prev / page-counter / Next only.

Navbar(brand?, items?, actions?, sticky?, variant?)
  Horizontal top bar with three slots: brand (left), items (centre), actions
  (right). sticky=true pins it to the top of the scroll container.
  variant: "default" | "transparent" (sits on top of a Hero/Cover) |
           "elevated" (subtle shadow for floating navs)
  items / actions: Node[] — typically NavbarItem(...) entries on the left
                   and Button(...) entries on the right.
NavbarItem(label, to?, icon?, active?, action?, href?)
  Single nav entry. Use `to` for internal route navigation (fires @Navigate
  on click), `href` for an external link, or `action` for a custom handler.
  active=true highlights the current page (typically driven by $route).
```

### Patterns (high-level composites — reach for these first)

```text
Hero(title, subtitle?, primary?, secondary?, eyebrow?, highlights?, imageSrc?, tone?)
  primary / secondary: pass Button(...) nodes for the CTAs
  highlights: string[] — small pill chips below subtitle
Cover(title, imageSrc, subtitle?, eyebrow?, caption?, actions?, tone?, height?)
  Image-backed hero band with gradient overlay, eyebrow tag, subtitle,
  optional caption row, and CTA buttons. Use as the top section of
  product, article, or campaign pages — Hero is text-first with optional
  side image; Cover is image-first.
PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)
  breadcrumbs: Breadcrumb OR string[]
  actions: Node[] — Buttons shown on the right
  status: Badge(...) — small inline status next to title
SectionHeader(title, subtitle?, eyebrow?, status?, actions?)
  Use inside a Card to introduce a section with eyebrow + status + right-aligned actions.
Toolbar(left?, right?, center?)
  Left slot: search / filter FormControls. Right slot: primary action Buttons.
  Center slot (optional): centered controls — typically SegmentedControl,
  a centered search bar, or a date-range pill.

MetricGrid(items, columns?)            # items: StatCard[]
Stats(items, align?)                    # items: {label, value, hint?, tone?, spark?}[]
  Compact inline stat strip — lighter than MetricGrid. Use beside a chart,
  in a Toolbar, or beneath a PageHeader for a trust-strip / quick KPIs row.
  Each item may include `spark: number[]` for an inline Sparkline beside
  the value.
Tile(label, icon?, value?, description?, tone?, action?)
  Compact icon + label + optional value tile. Smaller and denser than
  StatCard — ideal for menu grids, quick-action panels, category filters.
  Pass `action` for an Action that fires when the tile is clicked.
EmptyState(title, description?, icon?, illustration?, action?, actions?)
  icon: Font Awesome name (default "inbox")
  illustration: image URL — takes precedence over `icon` when provided.
  action: Button(...) — single CTA (legacy slot).
  actions: Node[] — preferred over `action` when you need a primary +
           secondary CTA row.
Timeline(items)
TimelineItem(title, time?, description?, icon?, tone?)
  tone: "default" | "primary" | "success" | "warning" | "danger" | "info"
FeatureGrid(items, columns?)
FeatureItem(title, description?, icon?, tone?)
Testimonial(quote, author, role?, avatarSrc?, rating?)
  rating: 0–5 stars
MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?, ratio?)
  Card with a media (image) header followed by title, body, optional tag
  pills, footer meta line, and an actions row. Use for article previews,
  product cards, project highlights, gallery items. orientation="horizontal"
  renders side-by-side media + content on wide viewports.
ProfileCard(name, role?, avatarSrc?, bio?, tags?, actions?)
  tags: string[]
  actions: Node[] — Buttons rendered at the bottom (string Action shorthand also accepted)
PersonChip(name, role?, avatarSrc?, size?, status?, action?)
  size: "sm" | "md" (default) | "lg"
  status: "online" | "offline" | "busy" | "away"
  Inline avatar + name + optional role/meta. Use anywhere a person is referenced
  compactly: table cells, list rows, comments, kanban cards, sidebar footers.
Notification(title, message?, time?, icon?, avatarSrc?, tone?, unread?, actions?)
  Inline notification card with title, message, time, optional avatar, and
  dismiss/action buttons. Use inside notification panels, inboxes, or
  activity drawers — for top-of-page announcements prefer Banner.
Comment(author, body, time?, avatarSrc?, actions?)
Banner(title, message?, action?, icon?, tone?)
  tone: "default" | "primary" | "success" | "warning" | "danger" | "info"
  action: Button(...)

KanbanBoard(columns)                    # columns: KanbanColumn[]
KanbanColumn(title, items, tone?)       # items: KanbanCard[]
KanbanCard(title, description?, tags?, assignee?, tone?, icon?, action?)

DescriptionList(items, columns?)        # items: DescriptionItem[]
  columns: 1 or 2 (default 2)
DescriptionItem(label, value, icon?)
  value may be a string or any Node (Badge, StatusDot, Link, Avatar, …)

StatusDot(label, tone?, pulse?)
  tone: "default" | "primary" | "success" | "warning" | "danger" | "info"
  pulse: animate the marker (for live/realtime status)

PricingTable(tiers, columns?)           # tiers: PricingCard[]
PricingCard(plan, price, period?, description?, features?, action?, badge?, featured?)
  features: string[] of bullet items
  badge: optional eyebrow chip above the plan name
  featured: true highlights the tier (raised card + badge)
```

### App shell (full SaaS layouts in one statement)

```text
AppShell(sidebar, content, topbar?)
  sidebar: a Sidebar(...) node
  content: Node[] — main pane (usually starts with PageHeader)
  topbar: optional Node[] — thin top bar above the content

Sidebar(items, brand?, tagline?, footer?)
  items: (SidebarItem | SidebarSection)[]
SidebarSection(label, items)            # group nav links
SidebarItem(label, icon?, active?, badge?, action?)
  active=true highlights the current page
  badge: trailing count / status chip
  action: Action(...) fired on click

SplitView(primary, detail, primaryWidth?)
  Master/detail layout (inboxes, file browsers, contact lists)
  primaryWidth: CSS width for the left pane (default "320px")
```

**Why patterns matter for streaming.** Patterns commit a full visual section
in one statement. `MetricGrid([StatCard("MRR","$48k","up","+12%","sack-dollar"), …])`
streams a dashboard row as a single line instead of a half-screen `Stack` of
ad-hoc primitives. **Reach for a pattern before composing from scratch.**

**Why the app shell matters.** A full product surface (admin console,
project workspace, inbox) needs persistent navigation. `AppShell` wraps a
fixed-left `Sidebar` and a scrollable main area in one statement — without
it, multi-page responses devolve into nested `Stack`s and lose the SaaS
feel.

### Scripting (always available)

```text
Script(id, body, deps?)                 # body: string; deps: ("$name")[] | null
```

`Script` renders nothing. Place it at the bottom of `root = Stack([...])`
so the visible UI commits first.

### Routing (always available)

```text
Routes(items, default?)                 # items: Route[]; default: matching path string
Route(path, content)                    # path supports literals, ":params", and trailing "*"
NavLink(label, to, variant?, exact?, icon?)
  variant: "default" | "primary" | "ghost" | "pill"
  exact: boolean (defaults to false → prefix match for nested-route highlighting)
```

`Routes` renders only the matched `Route`'s content. Inside that content, the
loop variable `params` is bound to the captured URL parameters (e.g.
`params.id` for `/users/:id`; `params._` for trailing wildcards). The
runtime-owned reactive state `$route` holds the current path everywhere.

`@Navigate("/path")` is the action step for programmatic navigation; see
§ 10.5 for details.

### Theming (always available)

```text
Theme(tokens)                           # tokens: object literal of theme tokens
```

`Theme({...})` does not render anything — it captures a partial token map
that the runtime applies to the host element as CSS custom properties. Use
it on a top-level binding named `theme` to brand a single response:

```text
theme = Theme({
  colorPrimary:      "#0969da",
  fontFamily:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyHeading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radiusButton:      "6px",
  buttonFontWeight:  "500"
})
root = Stack([...])
```

See § 0.5 "In-script theming" for the full token taxonomy, brand recipes,
and when to reach for it. Removing the `Theme(...)` line snaps the UI back
to the base theme set by the host.

---

## 10. JavaScript layer (deep dive)

`Script(...)` and `@Js(...)` are part of the runtime — no opt-in attribute.
The default ("full") system prompt teaches the LLM about both surfaces. When
you want to keep replies purely declarative (e.g. for chat bubbles), build
the system prompt with `getSystemPrompt({ mode: "chat" })` so the JS section
is omitted from the LLM's instructions.

### Two surfaces

| Surface                          | Lifecycle                                                                        | Typical use                                            |
|----------------------------------|----------------------------------------------------------------------------------|--------------------------------------------------------|
| `Script("id", body, deps?)`      | Runs on mount; re-runs when any `$variable` in `deps` changes; cleanup on unmount | Timers, observers, keyboard shortcuts, debounce, fetches |
| `@Js(body, args?)` action step   | Runs once when the action fires (button click, follow-up)                        | Clipboard, focus, one-off mutations, per-item changes  |

### The `ctx` bridge

Every body receives a single `ctx` argument:

```ts
ctx.state.get(name)         // read $name
ctx.state.set(name, value)  // write $name (triggers re-render)
ctx.state.reset(...names)   // back to declared defaults
ctx.state.values()          // snapshot { name: value, ... }

ctx.tools.toolName(args)    // async; await it. args is the same shape Query/Mutation uses.

ctx.args                    // render-time args from @Js(body, args). Always {} for Script.
ctx.dispatch(message)       // fire `assistant-message` event
ctx.open(url)               // open URL via configured opener

ctx.query(id)               // shadowRoot.getElementById
ctx.queryAll(selector)      // shadowRoot.querySelectorAll → array

ctx.host                    // the <streaming-ui-script> element
ctx.cleanup(fn)             // register teardown (intervals, listeners, observers)
ctx.signal                  // AbortSignal — fires when the script is about to re-run or unmount
```

### Writing the body string

- **Backticks** (`` `...` ``) — multi-line, real newlines, unescaped double
  quotes. **Use these for anything longer than one line.**
- **Double quotes** (`"..."`) — single-line. Escape `"` as `\"` and newlines
  as `\n`.
- Inside the body, prefer **single quotes** for JS strings so you never need
  to escape:
  ```text
  Script("toast", `setTimeout(() => ctx.state.set('toast', null), 3000);`)
  ```

### `Script` deps semantics

| `deps` value         | Behaviour                                                  |
|----------------------|------------------------------------------------------------|
| Omitted or `null`    | Run once on mount, cleanup on unmount.                     |
| `[]`                 | Run once on mount, cleanup on unmount (no re-runs).        |
| `["foo", "bar"]`     | Re-run whenever `$foo` or `$bar` changes. Cleanup first.   |

### `@Js(body, args?)` — the per-item handler pattern

The single most useful idiom in this library. Use it whenever a button
lives inside `@Each` and needs to know which row it belongs to.

```text
row = Card([
  TextContent(t.text),
  Button("Toggle", Action([
    @Js(`
      const todos = ctx.state.get('todos') || [];
      ctx.state.set('todos', todos.map(x =>
        x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x
      ));
    `, {id: t.id})
  ]))
])
```

`{id: t.id}` is evaluated at render time per iteration. Each rendered button
captures its own row's id. Inside the body, read it as `ctx.args.id`.

### Common patterns

#### Periodic timer

```text
$running = false
$count = 0
ticker = Script("ticker", `
  if (!ctx.state.get('running')) return;
  const id = setInterval(() => ctx.state.set('count', (ctx.state.get('count') ?? 0) + 1), 1000);
  ctx.cleanup(() => clearInterval(id));
`, ["running"])
```

#### Debounce

```text
$draft = ""
$pending = ""
debouncer = Script("debounce", `
  const id = setTimeout(() => ctx.state.set('pending', ctx.state.get('draft')), 250);
  ctx.cleanup(() => clearTimeout(id));
`, ["draft"])
```

#### Cancellable fetch

```text
$query = ""
$results = []
fetcher = Script("fetcher", `
  const q = (ctx.state.get('query') ?? '').trim();
  if (!q) { ctx.state.set('results', []); return; }
  try {
    const r = await ctx.tools.search({ q, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    ctx.state.set('results', r.rows ?? []);
  } catch (e) { if (!ctx.signal.aborted) ctx.state.set('results', []); }
`, ["query"])
```

#### Keyboard shortcut

```text
shortcut = Script("shortcut", `
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      ctx.query('search-input')?.focus();
    }
  };
  window.addEventListener('keydown', onKey);
  ctx.cleanup(() => window.removeEventListener('keydown', onKey));
`)
```

#### Clipboard + toast (one-shot)

```text
copyBtn = Button("Copy", Action([
  @Js("await navigator.clipboard?.writeText(ctx.state.get('snippet') ?? ''); ctx.state.set('toast', 'Copied!');"),
  @Js(`setTimeout(() => ctx.state.set('toast', null), 2000);`)
]))
```

### When NOT to use JS

| Tempting JS                                                       | Use this instead                                                     |
|-------------------------------------------------------------------|----------------------------------------------------------------------|
| `Script("init", "ctx.state.set('todos', [...])")` to seed         | `$todos = [...]`                                                     |
| `@Js("ctx.state.set('todos', todos.concat(newItem))")`             | `@Set($todos, @Push($todos, newItem))`                               |
| `@Js("...filter(t => t.id !== id)...")`                            | `@Set($todos, @Filter($todos, "id", "!=", t.id))`                    |
| `$todos.filter(...)` for display                                  | `@Filter($todos, "done", "==", false)`                               |
| `$todos.length`, `$todos.first`, `$todos.last`                    | They already work as member shortcuts.                               |
| `$todos.map(t => t.title)`                                        | `$todos.title` (array pluck).                                        |
| `@Js("ctx.state.set('open', !ctx.state.get('open'))")`             | `@Set($open, !$open)`                                                |
| Imperative reset of several values                                | `@Reset($a, $b, $c)`                                                 |

---

## 10.5. Routing layer (multi-page UIs)

Hash-based routing is wired into the runtime — no opt-in attribute. The
default ("full") system prompt documents `Routes` / `Route` / `NavLink` /
`@Navigate`, so the LLM can author multi-page UIs by default. Switch to
`getSystemPrompt({ mode: "chat" })` when you want a compact chat-focused
prompt that omits the routing section.

The router is **hash-based** by design: it owns `window.location.hash`, plays
nicely with static hosting, deep links, browser back/forward, and bookmarks,
and never requires server-side rewrite rules. It's a tiny addition (~100
lines), zero new dependencies.

### Surfaces

| Surface                                       | Purpose                                                                                                                  |
|-----------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| `Routes(items, default?)`                     | Outlet that renders the matching `Route`. First match wins. `default` is the path of the fallback Route.                |
| `Route(path, content)`                        | Declares one page. `path` supports literal, `:param`, and trailing `*` segments.                                         |
| `NavLink(label, to, variant?, exact?, icon?)` | Router-aware anchor. Intercepts clicks, updates the hash without reload, reflects `data-active="true"` for the current path. |
| `@Navigate("/path")` action step              | Programmatic navigation inside any `Action([...])` chain.                                                                |
| `$route` (reactive)                           | Current path. Owned by the runtime — never declare it yourself.                                                          |
| `params` (loop variable)                      | URL parameters captured by the matched Route. Scoped to that Route's content (acts like an `@Each` var).                 |

### Path patterns

| Pattern                              | Matches                                                | Captures                                              |
|--------------------------------------|--------------------------------------------------------|-------------------------------------------------------|
| `"/"`                                | Only the root path.                                    | —                                                     |
| `"/about"`                           | Exact path `#/about`.                                  | —                                                     |
| `"/users/:id"`                       | `#/users/42`, `#/users/jane`.                          | `params.id`                                           |
| `"/teams/:teamId/members/:memberId"` | Nested parameters.                                     | `params.teamId`, `params.memberId`                    |
| `"/docs/*"`                          | `#/docs`, `#/docs/guides/intro`, etc.                  | `params._` (the remainder)                            |
| `"*"`                                | Anything (use as the LAST route for a 404 fallback).    | `params._`                                            |

Parameter values are automatically URI-decoded, so `#/users/jane%20doe`
yields `params.id === "jane doe"`.

### Canonical layout

```text
root = Stack([nav, main])

nav = Stack([
  NavLink("Home",      "/",          "ghost", true),   # exact=true keeps "/" from highlighting on every other path
  NavLink("Dashboard", "/dashboard", "ghost"),
  NavLink("Users",     "/users",     "ghost"),
  NavLink("Settings",  "/settings",  "ghost")
], "row", "s")

main = Routes([
  Route("/",           homePage),
  Route("/dashboard",  dashboardPage),
  Route("/users",      usersListPage),
  Route("/users/:id",  userDetailPage),
  Route("/settings/*", settingsArea),
  Route("*",           notFoundPage)
], "/")

homePage       = Card([CardHeader("Welcome")])
dashboardPage  = Card([CardHeader("Dashboard")])
usersListPage  = Card([CardHeader("Users")])
userDetailPage = Card([CardHeader("User " + params.id), Buttons([Button("Back", Action([@Navigate("/users")]), "ghost")])])
settingsArea   = Card([CardHeader("Settings"), TextContent("Section: " + params._)])
notFoundPage   = Callout("warning", "Not found", "We couldn't find " + $route + ".")
```

### Idioms

- **Drive a `Query` from `params`.** Pass the bare loop variable so dependency
  tracking still works inside the matched Route's content:
  ```text
  userData = Query("get_user", {id: params.id}, {name: "", email: ""})
  userDetailPage = Card([CardHeader(userData.name, userData.email)])
  ```
- **Save → navigate → notify.** Compose `@Navigate` with other action steps:
  ```text
  saveBtn = Button("Save", Action([
    @Run(saveMutation),
    @Navigate("/dashboard"),
    @ToAssistant("Profile updated.")
  ]), "primary")
  ```
- **React to `$route` outside a Route.** Show a global banner only on certain
  paths:
  ```text
  banner = $route == "/onboarding" ? Callout("info", "Welcome", "Let's get you set up.") : null
  ```
- **Tabs become routes.** Replace `Tabs([...])` with `Routes([...])` whenever
  individual tabs should be deep-linkable.
- **Programmatic navigation from `@Js`.** When you need imperative routing
  (e.g. for keyboard shortcuts or after a fetch), call `ctx.host.navigate("/path")`
  from inside an `@Js` body. The standard declarative path is `@Navigate(...)`.

### Common mistakes

| Mistake                                                                              | Fix                                                                              |
|--------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| `$route = "/dashboard"` (assigning the route yourself).                              | Never declare or assign `$route`. The runtime owns it. Use `@Navigate("/dashboard")`. |
| `NavLink("Home", "/")` without `exact=true`.                                         | The home link will light up on every page (every path starts with `/`). Pass `exact=true`. |
| Putting `Routes` inside a conditional that hides the nav.                            | Render `nav` once at the top of `root` so it stays visible across pages.         |
| Forgetting `Route("*", notFoundPage)`.                                               | Unknown URLs render an empty outlet. Always include a wildcard or a `default`.    |
| Reading `params` outside a matched `Route`.                                          | `params` is a loop variable — undefined outside the matched Route's content.      |
| Using `Link("…", "#/path")` for in-app navigation.                                   | Use `NavLink` so the link reflects the active state and avoids a full reload.    |

---

## 10.9. Composition cookbook (copy-paste recipes)

The full application patterns in § 11 show end-to-end programs. This section
collects the smaller building blocks that appear inside almost every rich
response — search inputs, sorts, segmented filters, async forms, toasts,
copy-to-clipboard, etc. **Memorise these snippets.** Combining 3–4 of them
covers most "add a small interactive widget" requests without reaching for a
full pattern.

### Recipe 1 — Filter a list by search query (declarative, no JS)

```text
$query = ""

filtered = @Filter($products, "name", "contains", $query)

search = SearchBar($query, "Search products")

results = @Each(filtered, "p", ListItem(p.name, p.category, p.price))

root = Stack([search, List(results, "comma")])
```

`@Filter` re-runs whenever `$query` changes; no `@Js` needed. Supported
operators: `"=="`, `"!="`, `">"`, `">="`, `"<"`, `"<="`, `"contains"`,
`"startsWith"`, `"endsWith"`, `"in"`.

### Recipe 2 — Sort by a user-picked column

```text
$sortBy = "name"
$dir = "asc"

sorted = @Sort($rows, $sortBy, $dir)

picker = Stack([
  Select($sortBy, [SelectItem("name", "Name"), SelectItem("price", "Price"), SelectItem("stock", "Stock")]),
  ToggleGroup($dir, [{value: "asc", label: "↑"}, {value: "desc", label: "↓"}])
], "row", "s")

root = Stack([picker, Table(sorted, [Col("Name", "name"), Col("Price", "price"), Col("Stock", "stock")])])
```

### Recipe 3 — Segmented filter chip group

```text
$tab = "all"

tabs = ToggleGroup($tab, [
  {value: "all", label: "All"},
  {value: "active", label: "Active"},
  {value: "done", label: "Done"}
])

visible = $tab == "all" ? $todos
         : $tab == "active" ? @Filter($todos, "done", "==", false)
         : @Filter($todos, "done", "==", true)
```

Use `ToggleGroup` over a row of `Buttons` when only one value can be active at
a time — it renders as a connected segmented control and binds two-way to the
state.

### Recipe 4 — Async submit with loading + error states

```text
$email = ""
saveContact = Mutation("createContact", {email: $email})

form = Form([
  FormControl("Email", Input($email, "you@example.com", "email")),
  Button("Subscribe", "primary", Action([@Run(saveContact)]))
])

state = saveContact.loading ? Callout("info", "Submitting…", null, null, true)
      : saveContact.error   ? Callout("danger", saveContact.error, null, null, true)
      : saveContact.data    ? Callout("success", "Thanks!", "Check your inbox to confirm.", "circle-check")
      : null

root = Stack([form, state])
```

`Mutation` exposes `.loading`, `.error`, and `.data` reactively. Render each
state inline rather than building a custom spinner.

### Recipe 5 — Debounced live search

```text
$query = ""
$debounced = ""

search = Query("searchProducts", {q: $debounced})

debounce = Script("debounce-search", `
  const handle = setTimeout(() => {
    ctx.state.set('debounced', ctx.state.get('query'));
  }, 250);
  ctx.cleanup(() => clearTimeout(handle));
`, ["$query"])

root = Stack([
  SearchBar($query, "Search…"),
  search.loading ? Skeleton(80) : List(@Each(search.data, "p", ListItem(p.name, p.category))),
  debounce
])
```

The `Script` re-runs on every keystroke (because `$query` is in `deps`),
clears its previous timeout via `ctx.cleanup`, and only writes `$debounced`
after 250 ms of quiet typing. The `Query` then re-fires.

### Recipe 6 — Optimistic add (Push) and remove (Filter)

```text
$todos = []
$draft = ""

add = Action([
  @Set("todos", @Push($todos, {id: $todos.length + 1, text: $draft, done: false})),
  @Set("draft", "")
])

delTodo = (id) => @Set("todos", @Filter($todos, "id", "!=", id))

list = @Each($todos, "t", Stack([
  TextContent(t.text),
  Button("Delete", "ghost", @Js(`
    const id = ctx.args.id;
    const next = ctx.state.get('todos').filter(t => t.id !== id);
    ctx.state.set('todos', next);
  `, {id: t.id}))
], "row", "s"))
```

`@Push` and `@Filter` are the declarative way to mutate arrays in `@Set`
without writing JS. For per-item delete you still need `@Js(body, {id: t.id})`
so the row id is captured at render time.

### Recipe 7 — Copy to clipboard button

```text
$copied = false

copyBtn = Button($copied ? "Copied!" : "Copy", $copied ? "success" : "default", @Js(`
  await navigator.clipboard.writeText("npm install streaming-ui-script");
  ctx.state.set('copied', true);
  setTimeout(() => ctx.state.set('copied', false), 1500);
`))

root = Card([CodeBlock("npm install streaming-ui-script", "bash"), copyBtn])
```

### Recipe 8 — Toast / transient notification

Use the built-in `Toast` + `Toasts` components: each `Toast` carries its own
× close button and an optional `duration` (ms) for auto-dismiss. Pair with
a `$variable` of toasts plus `@Push` / `@Filter` to append/remove
notifications declaratively.

```text
$toasts = []

addToast = (msg, tone) => @Push($toasts, {id: @Now(), msg: msg, tone: tone})
dropToast = (id)       => @Filter($toasts, "id", "!=", id)

cards = $toasts.map((t) =>
  Toast(t.msg, null, t.tone, null, 4000, null, dropToast(t.id))
)

root = Stack([
  Buttons([
    Button("Save",   addToast("Saved.",        "success"), "primary"),
    Button("Notify", addToast("Heads up.",     "info"),    "secondary"),
    Button("Fail",   addToast("Sync failed.",  "danger"),  "ghost")
  ]),
  Toasts(cards, "bottom-right")
])
```

Pass `null` for `duration` if you want a persistent toast that the user
must dismiss manually. Use `action` (slot 6) when you need an inline
"Retry" / "Undo" button beneath the message.

### Recipe 9 — Confirm-before-destructive action

```text
$confirm = null

askDelete = (id) => @Set("confirm", id)

confirmModal = $confirm
  ? Modal("Delete item?", Stack([
      TextContent("This cannot be undone."),
      Buttons([
        Button("Cancel", "ghost", @Set("confirm", null)),
        Button("Delete", "danger", Action([
          @Js(`ctx.state.set('items', ctx.state.get('items').filter(i => i.id !== ${$confirm}));`),
          @Set("confirm", null)
        ]))
      ])
    ]))
  : null
```

Prefer this over `window.confirm(...)` — it stays inside the streaming-ui
runtime and styles itself with the active theme.

### Recipe 10 — Tabbed sections (no router, in-page)

```text
$tab = "overview"

tabs = Tabs($tab, [
  TabItem("overview", "Overview"),
  TabItem("activity", "Activity"),
  TabItem("members",  "Members")
])

body = $tab == "overview" ? overviewSection
     : $tab == "activity" ? activitySection
     : memberSection

root = Stack([PageHeader("Project Atlas"), tabs, body])
```

For multi-page apps that need URLs and back-button support, switch to the
routing layer (§ 10.5). For purely local "show this section now" toggling,
`Tabs` is lighter and faster.

### Recipe 11 — Pagination over a derived list

```text
$page = 1
pageSize = 10

filtered = @Filter($rows, "active", "==", true)
total = @Ceil(filtered.length / 10)
start = ($page - 1) * pageSize
visible = @Each(filtered, "r", r)   # see § 6 for paging slices via Js

root = Stack([
  Table(visible, [Col("Name", "name"), Col("Score", "score")]),
  Pagination($page, total, 1)
])
```

`Pagination($page, total)` binds `$page` two-way; the user clicking a number
updates the variable and the derived `visible` re-evaluates.

### Recipe 12 — Stat row with trends and tones

```text
metrics = MetricGrid([
  StatCard("MRR",        "$48.2k", "up",   "+12.4%", "sack-dollar"),
  StatCard("Active",     "1,284",  "up",   "+8%",    "users"),
  StatCard("Churn",      "2.1%",   "down", "-0.3%",  "user-minus"),
  StatCard("NPS",        "62",     "flat", "0",      "face-smile")
], 4)
```

Always pair a value with a trend and an icon. `trend` is one of `"up"`,
`"down"`, `"flat"`; the icon colour adapts to the active theme.

### Recipe 13 — Empty / loading / error triad for any Query

```text
search = Query("listOrders", {status: $status})

body = search.loading ? Skeleton(96)
     : search.error   ? Callout("danger", "Something went wrong", search.error, "triangle-exclamation")
     : search.data.length == 0
         ? EmptyState("No orders yet", "Orders will appear here once a customer checks out.", "cart-shopping",
             Button("View products", "primary", @Navigate("/products")))
     : Table(search.data, cols)
```

Memorise this exact triad — loading, error, empty, success. A response that
skips any of these branches will look broken under streaming.

### Recipe 14 — Wire a keyboard shortcut

```text
shortcut = Script("kbd-cmd-k", `
  const handler = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      ctx.state.set('paletteOpen', true);
    }
  };
  window.addEventListener('keydown', handler);
  ctx.cleanup(() => window.removeEventListener('keydown', handler));
`)
```

Always register a `ctx.cleanup` matching every `addEventListener`. Put one
`Script` per shortcut so each has a stable id.

### Recipe 15 — Two-way binding for forms

```text
$form = {name: "", email: "", company: ""}

contact = Form([
  FormControl("Name",    Input($form.name,    "Jane Doe")),
  FormControl("Email",   Input($form.email,   "jane@example.com", "email")),
  FormControl("Company", Input($form.company, "Acme Inc.")),
  Buttons([
    Button("Cancel", "ghost", @Reset("form")),
    Button("Save",   "primary", @Run(saveContact))
  ])
])
```

Field paths (`$form.name`, `$form.email`) bind two-way without manual `onInput`
wiring. `@Reset("form")` restores the initial declared value.

---

## 11. Application patterns

### Pattern A — Todo list (the canonical reactive app)

```text
root = Stack([header, composer, list, footer])

$todos = [{id: 1, text: "Welcome — try editing", done: false}]
$draft = ""
$filter = "all"

header = PageHeader("Todos", "Add tasks below")

composer = Stack([
  Input("draft-input", "What needs doing?", "text", null, $draft),
  Button("Add", Action([
    @Set($todos, @Push($todos, {id: $todos.length + 1, text: $draft, done: false})),
    @Reset($draft)
  ]), "primary")
])

visible = $filter == "open" ? @Filter($todos, "done", "==", false) :
          ($filter == "done" ? @Filter($todos, "done", "==", true) : $todos)

list = visible.length == 0
  ? Callout("info", "All clear", "No todos match this filter.")
  : @Each(visible, "t", row)

row = Card([Stack([
  Badge(t.done ? "done" : "open"),
  TextContent(t.text),
  Button("Toggle", Action([
    @Js(`
      const todos = ctx.state.get('todos') || [];
      ctx.state.set('todos', todos.map(x => x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x));
    `, {id: t.id})
  ])),
  Button("Delete", Action([@Set($todos, @Filter($todos, "id", "!=", t.id))]), "ghost")
])])

footer = Stack([
  Buttons([
    Button("All",  Action([@Set($filter, "all")]),  $filter == "all"  ? "primary" : "ghost"),
    Button("Open", Action([@Set($filter, "open")]), $filter == "open" ? "primary" : "ghost"),
    Button("Done", Action([@Set($filter, "done")]), $filter == "done" ? "primary" : "ghost")
  ]),
  TextContent("" + @Filter($todos, "done", "==", false).length + " open · " + $todos.length + " total", "small", "muted")
])
```

**Lessons baked into this pattern**

- Add: declarative via `@Push` + `@Set`.
- Delete: declarative via `@Filter` + `@Set` (no JS).
- Toggle: `@Js(body, {id: t.id})` because no builtin flips one field of one item.
- Filter UI: ternary + `@Filter`.
- Empty state: ternary picks between `Callout` and `@Each`.
- Counts: `.length` and `@Filter(...).length`.

### Pattern B — Analytics dashboard with auto-refresh

```text
root = Stack([header, controls, kpis, chart, breakdown])

$days = "30"
$segment = "all"

header = PageHeader("Analytics", "Live performance metrics")
controls = Stack([
  FormControl("Range",   Select("range",   [SelectItem("7","7d"), SelectItem("30","30d"), SelectItem("90","90d")], null, null, $days)),
  FormControl("Segment", Select("segment", [SelectItem("all","All"), SelectItem("paid","Paid"), SelectItem("organic","Organic")], null, null, $segment))
], "row", "m")

data = Query("analytics_summary",
  {days: $days, segment: $segment},
  {events: 0, revenue: 0, growth: "0%", daily: []},
  60)   // refresh every 60s

kpis = Stack([
  StatCard("Events",  "" + data.events,  data.events_trend),
  StatCard("Revenue", "$" + data.revenue, data.rev_trend, data.rev_delta),
  StatCard("Growth",  data.growth,        "up")
], "row", "m")

chart = LineChart(data.daily.day, [Series("Events", data.daily.events)], "Daily events")

breakdown = Section([
  Table([
    Col("Channel", data.channels.name),
    Col("Visits",  data.channels.visits,  "number"),
    Col("Revenue", data.channels.revenue, "currency")
  ])
], "Channel breakdown")
```

Auto-refresh comes free from the fourth `Query` arg. Changing the dropdowns
re-runs the query because `$days` and `$segment` are dependencies.

### Pattern C — Wizard / multi-step form

```text
root = Stack([progress, stepView, footer])

$step = 1
$name = ""
$email = ""
$plan = "starter"

progress = Steps([
  StepsItem("Account", $step >= 1 ? "circle-check" : null),
  StepsItem("Profile", $step >= 2 ? "circle-check" : null),
  StepsItem("Plan",    $step >= 3 ? "circle-check" : null)
])

stepView = $step == 1 ? accountStep : ($step == 2 ? profileStep : planStep)

accountStep = Card([
  CardHeader("Create your account"),
  FormControl("Email", Input("email", "you@example.com", "email", null, $email)),
  Button("Next", Action([@Set($step, 2)]), "primary", "button", "md", $email == "")
])

profileStep = Card([
  CardHeader("About you"),
  FormControl("Name", Input("name", "Jane Doe", "text", null, $name)),
  Buttons([
    Button("Back", Action([@Set($step, 1)]), "ghost"),
    Button("Next", Action([@Set($step, 3)]), "primary")
  ])
])

planStep = Card([
  CardHeader("Pick a plan"),
  Radio("plan", [SelectItem("starter","Starter"), SelectItem("pro","Pro"), SelectItem("ent","Enterprise")], $plan),
  Buttons([
    Button("Back",   Action([@Set($step, 2)]), "ghost"),
    Button("Finish", Action([@Run(signUpMutation), @ToAssistant("Account created")]), "primary")
  ])
])

signUpMutation = Mutation("sign_up", {name: $name, email: $email, plan: $plan})

footer = TextContent("Step " + $step + " of 3", "small", "muted")
```

### Pattern D — Live search with debounce + cancel

Uses the always-on JavaScript surfaces (`Script` + `@Js`).

```text
root = Stack([searchBar, results, busy])

$query = ""
$pending = ""
$results = []
$loading = false

searchBar = FormControl("Search", Input("q", "Type to search…", "text", null, $query))

# Debounce 250 ms.
debouncer = Script("debounce", `
  const id = setTimeout(() => ctx.state.set('pending', ctx.state.get('query')), 250);
  ctx.cleanup(() => clearTimeout(id));
`, ["query"])

# Fetch only after debounce settles; cancel in-flight on each new keystroke.
fetcher = Script("fetcher", `
  const q = (ctx.state.get('pending') ?? '').trim();
  if (!q) { ctx.state.set('results', []); return; }
  ctx.state.set('loading', true);
  try {
    const r = await ctx.tools.search({ q });
    if (ctx.signal.aborted) return;
    ctx.state.set('results', r.rows ?? []);
  } finally {
    if (!ctx.signal.aborted) ctx.state.set('loading', false);
  }
`, ["pending"])

busy = $loading ? Skeleton(3) : null
results = $results.length == 0 && $query != "" && !$loading
  ? Callout("info", "No results", "Try a different term.")
  : @Each($results, "r", resultRow)
resultRow = ListItem(r.title, r.summary)
```

### Pattern E — Settings panel with multiple sections

```text
root = Tabs([
  TabItem("profile",  "Profile",  profileTab),
  TabItem("account",  "Account",  accountTab),
  TabItem("notifs",   "Notifications", notifsTab)
], "profile")

$displayName = "Jane Doe"
$emails = {weekly: true, releases: false, promos: false}

profileTab = Stack([
  FormControl("Display name", Input("display-name", "Your name", "text", null, $displayName)),
  Button("Save", Action([@Run(saveProfile), @ToAssistant("Profile updated.")]), "primary")
])

accountTab = Section([
  Callout("warning", "Sign-in", "Changing your email requires re-verification."),
  Link("Manage subscription", "/billing")
], "Account")

notifsTab = Stack([
  CheckBoxGroup("emails", [
    CheckBoxItem("Weekly digest",        "weekly",   "Sent every Monday morning"),
    CheckBoxItem("Release notes",        "releases", "When a new version ships"),
    CheckBoxItem("Promotional offers",   "promos",   "Occasional discounts and partner deals")
  ], $emails),
  Button("Save preferences", Action([@Run(savePrefs)]))
])

saveProfile = Mutation("update_profile", {displayName: $displayName})
savePrefs   = Mutation("update_notifs", {emails: $emails})
```

### Pattern F — Real-time feed (poll + scroll-to-bottom)

```text
root = Stack([feed, status])

$messages = []

# Poll every 5 s and append new messages.
data = Query("inbox", {since: $lastId}, {rows: [], lastId: ""}, 5)

$lastId = ""

# Whenever new rows arrive, prepend to $messages and remember the latest id.
ingest = Script("ingest", `
  const rows = ctx.state.get('messages') || [];
  const incoming = arguments[0]; /* not used — read from state */
`, ["lastId"])

feed = Section([@Each(data.rows, "m", msgRow)], "Inbox")
msgRow = Card([
  Stack([
    Badge(m.kind, null, m.kind == "alert" ? "triangle-exclamation" : "comments"),
    TextContent(m.subject, "body-heavy"),
    TextContent(m.preview, "small", "muted")
  ])
], "outlined")

status = TextContent("Last refreshed: " + data.lastUpdated, "small", "muted")
```

(For real apps, integrate WebSockets via `ctx.host.addEventListener('ws-message', …)` in a `Script` and write the result into `$messages`.)

### Pattern G — Modal confirmation dialog

```text
root = Stack([list, confirmModal])

$confirming = null

list = @Each($items, "x", row)
row = Card([
  TextContent(x.title),
  Button("Delete", Action([@Set($confirming, x)]), "danger")
])

confirmModal = Modal("Delete item?", $confirming != null, [
  TextContent("This permanently removes '" + ($confirming.title ?? "this item") + "'."),
  Buttons([
    Button("Cancel", Action([@Set($confirming, null)]), "ghost"),
    Button("Delete", Action([
      @Set($items, @Filter($items, "id", "!=", $confirming.id)),
      @Set($confirming, null)
    ]), "danger")
  ])
])
```

### Pattern H — Multi-page app with hash routing

Uses the built-in hash router (`Routes` / `NavLink` / `@Navigate`). The nav
lives at the top of `root` and stays visible; `Routes(...)` swaps in the
active page based on the URL.

```text
$users = [
  {id: "ada",   name: "Ada Lovelace",   role: "Founding engineer"},
  {id: "grace", name: "Grace Hopper",   role: "Compiler researcher"}
]

root = Stack([nav, main])

nav = Stack([
  NavLink("Home",  "/",      "ghost", true),
  NavLink("Users", "/users", "ghost")
], "row", "s")

main = Routes([
  Route("/",          homePage),
  Route("/users",     usersListPage),
  Route("/users/:id", userDetailPage),
  Route("*",          notFoundPage)
], "/")

homePage = Card([
  CardHeader("Welcome"),
  Buttons([Button("Browse users", Action([@Navigate("/users")]), "primary")])
])

usersListPage = Card([
  CardHeader("Users"),
  @Each($users, "u", userRow)
])

userRow = Card([
  Stack([
    TextContent(u.name, "body-heavy"),
    Buttons([Button("Open", Action([@Navigate("/users/" + u.id)]), "ghost")])
  ], "row", "m", "center", "between")
], "outlined")

userDetailPage = Card([
  CardHeader("User " + params.id),
  Buttons([Button("Back", Action([@Navigate("/users")]), "ghost")])
])

notFoundPage = Callout("warning", "Not found", "No page matches " + $route + ".")
```

Highlights:

- Inline `@Navigate("/users/" + u.id)` works because each `Route`'s content
  is evaluated with the `@Each` variable in scope at render time.
- `params.id` lands automatically when `/users/:id` matches — no extra
  bookkeeping required.
- The fallback `Route("*", notFoundPage)` makes sure unknown URLs render
  something meaningful instead of an empty outlet.

### Pattern I — Rich project dashboard (PageHeader + MetricGrid + Kanban + Timeline)

When the prompt is "show me a dashboard", reach for high-level patterns first.
The dashboard below uses **one statement per visual section** and never
hand-rolls a row of `Card`s.

```text
root = Stack([banner, header, metrics, board, timelineCard, follow], "column", "l")

$range = "30d"
$assignee = "everyone"

banner = Banner(
  "v2.3 ships Friday",
  "Two hot bugs left in QA — see the board below.",
  Button("Open release", null, "ghost", "button", "small"),
  "rocket",
  "info"
)

header = PageHeader(
  "Engineering · Q3 program",
  "Track deliverables across squads",
  Breadcrumb([BreadcrumbItem("Programs", "#"), BreadcrumbItem("Q3", "#"), BreadcrumbItem("Engineering")]),
  [Button("Export", null, "ghost"), Button("New milestone", null, "primary")],
  Badge("On track", "success", null, "sm")
)

# Data — one Query that drives every tile in the dashboard.
data = Query("program_summary", {range: $range, assignee: $assignee},
  {shipped: 0, inReview: 0, blocked: 0, velocity: 0, deltas: {}, columns: [], events: []})

metrics = MetricGrid([
  StatCard("Shipped this week", "" + data.shipped,           "up",   data.deltas.shipped,  "rocket"),
  StatCard("In review",         "" + data.inReview,          "flat", data.deltas.review,   "eye"),
  StatCard("Blocked",           "" + data.blocked,           "down", data.deltas.blocked,  "circle-stop"),
  StatCard("Velocity",          "" + data.velocity + " pts", "up",   data.deltas.velocity, "bolt")
])

board = KanbanBoard(
  @Each(data.columns, "col",
    KanbanColumn(col.title,
      @Each(col.cards, "c",
        KanbanCard(c.title, c.description, c.tags, c.assignee, c.tone, c.icon)
      ),
      col.tone
    )
  )
)

timelineCard = Card([
  CardHeader("Recent activity"),
  Timeline(@Each(data.events, "e",
    TimelineItem(e.title, e.time, e.description, e.icon, e.tone)
  ))
])

follow = FollowUpBlock([
  FollowUpItem("Open the blocked items"),
  FollowUpItem("Drill into QA velocity"),
  FollowUpItem("Send weekly digest")
], "Next steps")
```

**Why this works.**

- `PageHeader` ships breadcrumbs + actions + status in one statement.
- `MetricGrid` is a `Grid` of `StatCard`s with sensible defaults — replaces
  a wide row of hand-rolled cards.
- `KanbanBoard` + `KanbanColumn` + `KanbanCard` encode the entire "trello-like
  board" shape; `@Each` over `data.columns` lets the LLM stay agnostic about
  how many columns the tool returned.
- `Timeline` lives inside a `Card` so the section reads as a feed, with status
  pips coloured by `e.tone`.

### Pattern J — Marketing landing page (Hero + FeatureGrid + Testimonial)

Static content that still feels alive. No `Query`, no `Mutation` — just
patterns.

```text
root = Stack([hero, features, social, cta], "column", "xl")

hero = Hero(
  "Ship LLM UI in a single tag",
  "Drop in <streaming-ui-script>, paste a prompt, watch the UI come alive.",
  Button("Get started",     Action([@OpenUrl("/get-started.html")]), "primary"),
  Button("View on GitHub",  Action([@OpenUrl("https://github.com/")]), "ghost"),
  "New · v2.3 just shipped",
  ["Framework-agnostic", "Streaming-first", "Themeable"]
)

features = FeatureGrid([
  FeatureItem("Framework-agnostic", "Works in React, Vue, Angular, Svelte, or plain HTML.", "puzzle-piece"),
  FeatureItem("Streaming-first",   "Render tokens as they arrive.",                          "bolt"),
  FeatureItem("Theming",           "Light, dark, neon, pastel — swap with one attribute.",  "palette"),
  FeatureItem("Routing built-in",  "Multi-page apps without a router.",                     "compass")
])

social = Grid([
  Testimonial("This is exactly the abstraction I wanted between my agent and my UI.",
    "Jordan Patel", "Founder, Looplog", null, 5),
  Testimonial("Our weekly recap email is generated end-to-end by an LLM. No more dashboards to maintain.",
    "Mei Tanaka", "Eng lead, Atlasworks", null, 5)
], 2)

cta = Banner(
  "Ready to ship generative UI?",
  "Read the 30-second integration guide.",
  Button("Get started", Action([@OpenUrl("/get-started.html")]), "primary"),
  "wand-magic-sparkles",
  "primary"
)
```

### Pattern K — Team directory (ProfileCard grid + Pagination + EmptyState)

```text
root = Stack([header, controls, body, pager], "column", "l")

$search = ""
$page = 1

data = Query("list_members", {q: $search, page: $page}, {rows: [], total: 0, pageSize: 6, pages: 1})

header = PageHeader("Team", "Everyone in the company directory", null,
  [Button("Invite", null, "primary")],
  Badge("" + data.total + " people", "primary", null, "sm"))

controls = Stack([
  FormControl("Search", Input("search", "Name, role, team…", "text", null, $search)),
  AvatarGroup(data.rows, 5, "md")
], "row", "m", "center", "between", true)

empty = EmptyState(
  `No matches for "` + $search + `"`,
  "Try a different name, team, or role.",
  "magnifying-glass",
  Button("Clear", Action([@Reset($search)]), "ghost")
)

cards = Grid(@Each(data.rows, "u",
  ProfileCard(u.name, u.role, u.avatar, u.bio, u.tags,
    [Button("Message", null, "secondary", "button", "small")]
  )
))

body = @Count(data.rows) > 0 ? cards : empty
pager = Pagination($page, data.pages, 1)
```

### Pattern L — Settings panel (Tabs + Switch + ToggleGroup + Sheet)

```text
root = Stack([header, tabsBlock, dangerZone, confirmSheet], "column", "l")

$notifications = true
$theme = "light"
$autosave = true
$language = "en"
$deleting = false

header = PageHeader(
  "Settings", "Personalise your workspace",
  Breadcrumb([BreadcrumbItem("Home", "#"), BreadcrumbItem("Settings")])
)

generalTab = Card([
  CardHeader("General"),
  Switch("notifications", "Email me weekly digests", $notifications),
  Switch("autosave",      "Autosave drafts every 30s", $autosave),
  Separator("horizontal", true),
  FormControl("Language", Select("language", [
    SelectItem("en", "English"),
    SelectItem("fr", "Français"),
    SelectItem("de", "Deutsch")
  ], null, null, $language))
])

appearanceTab = Card([
  CardHeader("Appearance"),
  FormControl("Theme",
    ToggleGroup("theme", [
      {value: "light", label: "Light", icon: "sun"},
      {value: "dark",  label: "Dark",  icon: "moon"},
      {value: "neon",  label: "Neon",  icon: "wand-magic-sparkles"}
    ], $theme)
  ),
  FormControl("Open palette", Kbd(["⌘", "K"]))
])

tabsBlock = Tabs([
  TabItem("general",    "General",    [generalTab]),
  TabItem("appearance", "Appearance", [appearanceTab])
], "general")

dangerZone = Card([
  CardHeader("Danger zone", "Irreversible — proceed with care"),
  Buttons([Button("Delete workspace", Action([@Set($deleting, true)]), "danger")])
], "outlined")

confirmSheet = Sheet("Delete workspace?", $deleting, [
  TextContent("This permanently deletes every project, file, and member."),
  Buttons([
    Button("Cancel",  Action([@Set($deleting, false)]), "ghost"),
    Button("Delete",  Action([@Set($deleting, false)]), "danger")
  ])
], "right")
```

**Why this works.**

- `Switch`, `ToggleGroup`, and `Pagination` are all **two-way bound** to a
  `$variable` — just pass the bare `$name` as the value/page arg.
- `Sheet` is the right pattern for a "confirm" affordance that should feel
  heavier than a `Modal` but lighter than a full page.

### Pattern M — Full app surface (AppShell + Sidebar + multi-section content)

When the user asks for "a project workspace", "an admin console", "an inbox
view", or any product UI with persistent navigation, reach for `AppShell`.
The result feels like a real SaaS application — never a chat reply.

```text
root = AppShell(nav, content, topbar)

# 1. Sidebar — sectioned navigation with icons + counts.
nav = Sidebar([
  SidebarSection("Workspace", [
    SidebarItem("Overview",  "house", true),
    SidebarItem("Projects",  "folder", false, "12", Action([@ToAssistant("Open projects")])),
    SidebarItem("Calendar",  "calendar"),
    SidebarItem("Messages",  "comments", false, "3", Action([@ToAssistant("Open messages")]))
  ]),
  SidebarSection("Insights", [
    SidebarItem("Analytics", "chart-pie"),
    SidebarItem("Reports",   "chart-line"),
    SidebarItem("Billing",   "credit-card")
  ])
], "Acme HQ", "Production · v2.3", [Avatar("Asha Patel", null, "sm"), Button("Settings", Action([@ToAssistant("Open settings")]), "ghost", "button", "small")])

# 2. Optional topbar — status pip + small actions.
topbar = [StatusDot("Realtime", "success", true), Buttons([Button("Invite", Action([@Run(invite)]), "ghost", "button", "small"), Button("Upgrade", Action([@Run(upgrade)]), "primary", "button", "small")])]

# 3. Main content — opens with a PageHeader, then dense sections.
content = [pageHeader, kpiStrip, contentGrid, activityCard, followUps]

pageHeader = PageHeader("Overview", "Everything happening across your workspace", null, [Button("New project", Action([@Run(new_project)]), "primary")], Badge("Live", "success"))

kpiStrip = MetricGrid([
  StatCard("MRR",          "$48.2k",  "up",   "+12% vs last month", "sack-dollar"),
  StatCard("Active users", "2,184",   "up",   "+184",               "users"),
  StatCard("Open tickets", "23",      "down", "-9",                 "ticket"),
  StatCard("NPS",          "62",      "flat", "+1",                 "star")
])

contentGrid = Grid([projectsCard, statusCard], 2, "l")

projectsCard = Card([SectionHeader("Active projects", null, "WORK", null, [Button("View all", Action([@Run(view_projects)]), "ghost", "button", "small")]), List([
  ListItem("Streaming UI v2.4", "Ada Lovelace · 3 open issues", "rocket"),
  ListItem("Auth SDK rewrite",   "Linus T · 1 open issue",      "shield-halved"),
  ListItem("Onboarding revamp",  "Grace Hopper · awaiting QA",  "bullseye")
])])

statusCard = Card([SectionHeader("System status", null, "OPS", Badge("All normal", "success", null, "sm")), Stack([
  StatusDot("API",       "success"),
  StatusDot("Database",  "success"),
  StatusDot("Webhooks",  "warning"),
  StatusDot("Streaming", "success", true)
], "column", "s")])

activityCard = Card([SectionHeader("Recent activity"), Timeline([
  TimelineItem("Ada merged PR #248",      "5m ago",   "Streaming-UI patterns ready", "code-pull-request", "primary"),
  TimelineItem("QA caught regression",     "1h ago",   "Quota dashboard double-count","triangle-exclamation", "warning"),
  TimelineItem("Tokenizer 2.1 deployed",   "Yesterday","Latency improved 14%",        "circle-check", "success")
])])

followUps = FollowUpBlock(["Show at-risk projects", "Open billing", "Invite my team"])
```

**Why this works.**

- One `AppShell` call commits the entire SaaS layout — sidebar + topbar +
  scrollable main area — in one statement. No nested `Stack(row, wrap=true)`
  workarounds.
- `Sidebar` items can be active, badged, and actionable — no need for a
  manual highlight or count chip.
- The content uses **dense sections** (header, KPIs, grid of detail Cards,
  activity, follow-ups) so the response feels like a real product surface,
  not a chat preview.

### Pattern N — Detail page (PageHeader + DescriptionList + activity)

Profile, billing, ticket, and order pages share the same shape: a header
with status + actions, a summary `DescriptionList`, a content panel, and an
activity feed. Never stack bare `TextContent("Label: " + value)` lines.

```text
root           = Stack([detailHeader, summaryGrid, activityCard, dangerCard, detailFollowUps], "column", "l")

detailHeader   = PageHeader("Alex Rivera", "Product Designer · alex@acme.com", ["Team", "Engineering"], detailActions, detailStatus)
detailActions  = [Button("Message", Action([@Run(open_chat)]), "primary"), Button("Edit", Action([@Run(edit_profile)]), "ghost")]
detailStatus   = Badge("Online", "success", "circle-check", "sm")

summaryGrid    = Grid([profileCard, infoCard], 2, "l")
profileCard    = ProfileCard("Alex Rivera", "Product Designer", "", "Designs the future of generative UI at Acme.",
  ["design", "ux", "typography"],
  [Button("Follow", Action([@Run(follow)]), "primary", "button", "small"),
   Button("Resume", Action([@OpenUrl("/resume.pdf")]), "ghost", "button", "small")])
infoCard       = Card([SectionHeader("Profile details", null, "OVERVIEW"), profileDescriptions])
profileDescriptions = DescriptionList([
  DescriptionItem("Team",     "Design Systems", "users"),
  DescriptionItem("Manager",  "Margaret Hamilton"),
  DescriptionItem("Location", "Berlin, DE", "location-dot"),
  DescriptionItem("Joined",   "Mar 2022"),
  DescriptionItem("Slack",    Badge("@alex", "primary", null, "sm")),
  DescriptionItem("Status",   StatusDot("Active", "success"))
], 2)

activityCard   = Card([SectionHeader("Recent activity", "Last 14 days"), Timeline([
  TimelineItem("Shipped v2.0",         "2h ago",     "Updated 14 components and added the patterns API.", "rocket", "success"),
  TimelineItem("Joined Design Review", "Yesterday",  "Reviewed the new dashboard wireframes.",            "palette", "primary"),
  TimelineItem("Profile updated",      "3 days ago", "",                                                  "pen")
])])

dangerCard     = Card([SectionHeader("Danger zone", "Irreversible — proceed with care"), Buttons([Button("Delete account", Action([@Run(delete_account)]), "danger")])], "outlined")
detailFollowUps = FollowUpBlock(["Show projects", "Open inbox", "Schedule a 1:1"])
```

**Why this works.**

- `DescriptionList` aligns labels and values automatically — no need to fake
  a key/value table with nested Stacks.
- `DescriptionItem`'s `value` can be a Badge, StatusDot, Avatar, or any Node —
  so status and badges appear inline with the data, not as separate sections.
- `SectionHeader` carries the eyebrow + actions for each Card, so the page
  reads as several distinct concerns rather than one long scroll.

### Pattern O — Pricing page (Hero + PricingTable + closing CTA)

```text
root        = Stack([pricingHero, pricingBlock, faqs, closingBanner, pricingFollowUps], "column", "xl")

pricingHero = Hero(
  "Pricing that scales with you",
  "Start free, upgrade as your team grows. No hidden fees.",
  Button("Compare plans", Action([@OpenUrl("#tiers")]), "primary"),
  Button("Contact sales", Action([@OpenUrl("/contact")]), "secondary"),
  "PRICING",
  ["Free for hobby projects", "Cancel anytime", "Annual discount: 20%"]
)

pricingBlock = PricingTable([
  PricingCard("Starter", "$0", "/mo", "For hobby projects and side experiments.",
    ["1 workspace", "Up to 5 contributors", "Community support", "1 GB storage"],
    Button("Get started", Action([@OpenUrl("/signup?plan=starter")]), "secondary"),
    null, false),
  PricingCard("Pro", "$29", "/mo", "For teams shipping LLM features in production.",
    ["Unlimited workspaces", "All themes + patterns", "Priority support", "100 GB storage", "SOC2 audit logs"],
    Button("Start free trial", Action([@OpenUrl("/signup?plan=pro")]), "primary"),
    "Most popular", true),
  PricingCard("Scale", "Talk to us", null, "For companies with custom requirements.",
    ["Dedicated success manager", "Custom themes", "SSO + SCIM", "99.99% SLA", "On-prem available"],
    Button("Contact sales", Action([@OpenUrl("/contact")]), "ghost"),
    null, false)
])

faqs = Card([SectionHeader("Frequently asked questions"), Accordion([
  AccordionItem("Can I switch plans later?", [Markdown("Yes — upgrade or downgrade any time from **Billing → Subscription**.")]),
  AccordionItem("Do you offer student discounts?", [Markdown("**50% off Pro** for verified students and educators.")]),
  AccordionItem("How does the free trial work?", [Markdown("14-day Pro trial. No credit card. Cancel any time.")])
])])

closingBanner = Banner("Still deciding?", "Talk to a real human about your use case.", Button("Book a call", Action([@OpenUrl("/contact")]), "primary"), "comments", "primary")
pricingFollowUps = FollowUpBlock(["Compare to competitors", "Show the enterprise plan", "Open the FAQ"])
```

### Pattern P — Master/detail (SplitView, e.g. inbox)

```text
root = Stack([inboxHeader, inboxView], "column", "l")

inboxHeader = PageHeader("Inbox", "12 unread messages", null, [Button("Compose", Action([@Run(compose)]), "primary")], Badge("Sync · just now", "success"))

$selectedId = "msg-1"
$filter     = "all"

inboxView = SplitView(
  [Toolbar([FormControl("Filter", Select("filter", [SelectItem("all","All"),SelectItem("unread","Unread"),SelectItem("starred","Starred")], null, null, $filter))], []),
   inboxList],
  [selectedCard],
  "340px"
)

inboxList = Card([List(@Each(data.rows, "m", inboxRow))])
inboxRow  = ListItem(m.subject, m.preview, m.icon)

selectedCard = Card([
  SectionHeader(data.selected.subject, data.selected.from, null, Badge(data.selected.category, "primary", null, "sm"),
    [Button("Reply", Action([@Run(reply)]), "primary"),
     Button("Archive", Action([@Run(archive)]), "ghost")]),
  DescriptionList([
    DescriptionItem("From", data.selected.from, "envelope"),
    DescriptionItem("To",   data.selected.to),
    DescriptionItem("Sent", data.selected.time, "⏰"),
    DescriptionItem("Status", StatusDot(data.selected.status, "primary"))
  ], 2),
  Markdown(data.selected.body)
])

data = Query("inbox", {filter: $filter, id: $selectedId}, {rows: [], selected: {subject:"", from:"", to:"", time:"", status:"", category:"", body:""}})
```

`SplitView` collapses to a single column on narrow viewports, so the same
program works on phones without a redesign.

### Pattern Q — Product detail page (Cover + Stats + MediaCard + ChatBubble)

```text
$variant = "midnight"

variants = ToggleGroup("variant", [
  {value: "midnight", label: "Midnight", icon: "moon"},
  {value: "sunset",   label: "Sunset",   icon: "sun"}
], $variant)

cover = Cover(
  "Aurora Wireless Headphones",
  "https://images.unsplash.com/photo-1518443895914-83a35c1eed90?w=1600",
  "Studio-grade sound, 40-hour battery.",
  "New release",
  "Free 2-day shipping · 30-day returns",
  [Button("Add to cart", Action([@Run(add_to_cart)]), "primary"),
   Button("Save",        Action([@Run(save)]),         "ghost")],
  "primary",
  "320px"
)

trustStrip = Stats([
  {label: "Avg rating",   value: "4.8 / 5", hint: "1,284 reviews",  tone: "warning"},
  {label: "Battery life", value: "40 hrs",  hint: "Quick-charge",   tone: "success"},
  {label: "Warranty",     value: "2 yrs",   hint: "Free repair",    tone: "info"}
], "start")

spec = DescriptionList([
  DescriptionItem("Driver",   "40 mm beryllium",      "volume-high"),
  DescriptionItem("Bluetooth","5.3 + multipoint",     "signal"),
  DescriptionItem("Weight",   "248 g",                "scale-balanced")
])

stockCard = Card([
  CardHeader("Stock for " + $variant, "Updated just now"),
  Stack([
    ProgressRing(72, 100, null, "In stock", "success"),
    Stack([
      TextContent("72% of warehouse capacity", "small", "muted"),
      Badge("Ships today", "success", true)
    ], "column", "s")
  ], "row", "l", "center")
], "elevated")

reviews = Stack([
  ChatBubble("Naomi", "Sound stage is huge. Worth every penny.",
             "2h ago", "https://i.pravatar.cc/64?img=47", "me", "read"),
  ChatBubble("Aurora team",
             "Glad you're loving them! Enable Studio EQ in the app for orchestral recordings.",
             "1h ago", null, "agent", "delivered")
], "column", "m")

related = Grid([
  MediaCard("Aurora Earbuds",
            "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=900",
            "Same DAC, in-ear comfort.",
            ["wireless", "in-ear"],
            "$149 · 4.7 stars",
            [Button("View", Action([@ToAssistant("Show the earbuds")]), "secondary")]),
  MediaCard("Aurora Case",
            "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=900",
            "Hard shell, magnetic clasp.",
            ["accessory"],
            "$39 · 4.6 stars",
            [Button("View", Action([@ToAssistant("Show the case")]), "secondary")])
], 2, "m")

closing = Notification(
  "Free Aurora app", "Custom EQ + find-my-headphones.",
  "Available now", "mobile-screen", null,
  "info", false,
  [Button("Get the app", Action([@OpenUrl("/app")]), "ghost")]
)

root = Stack([
  cover,
  Section([variants], "Pick a colorway"),
  stockCard,
  trustStrip,
  Section([], "Specs"),
  spec,
  Section([Rating(4.8, 5, "Average rating", 1284, "md", false)], "Reviews"),
  reviews,
  Section([], "Customers also buy"),
  related,
  closing
], "column", "xl")
```

This is the canonical commerce / article layout: image-led `Cover`, trust
`Stats`, a stock `ProgressRing`, a `Rating`, review `ChatBubble`s, related
`MediaCard`s, and a closing `Notification`. **No `Stack` of raw primitives —
every visual section is one named pattern.**

### Pattern R — Directory / CRM (Tile stats + SearchBar + ProfileCard grid + Sheet)

```text
$segment = "all"
$query   = ""
$selected = ""

search = SearchBar("crm-q", "Search contacts…", $query, "/")

segments = ToggleGroup("segment", [
  {value: "all",        label: "All",        icon: "users"},
  {value: "customers",  label: "Customers",  icon: "handshake"},
  {value: "champions",  label: "Champions",  icon: "trophy"},
  {value: "at-risk",    label: "At-risk",    icon: "triangle-exclamation"}
], $segment)

tiles = Grid([
  Tile("Total contacts",   "users", "2,481", "+128 this week",    "primary",  Action([@Set($segment, "all")])),
  Tile("Active deals",     "briefcase", "47",    "$418k ARR",         "info",     Action([@ToAssistant("Show deals")])),
  Tile("At-risk accounts", "triangle-exclamation", "12",   "Follow up this week","warning",  Action([@Set($segment, "at-risk")])),
  Tile("Champions",        "trophy", "63",    "NPS 9 or 10",       "success",  Action([@Set($segment, "champions")]))
], 4, "m")

data = Query("crm_contacts", {segment: $segment, query: $query}, {rows: []})

cards = data.rows.length == 0
  ? EmptyState("No contacts match", "Adjust the segment or clear the search.", "magnifying-glass", Button("Reset", Action([@Reset($segment), @Reset($query)]), "secondary"))
  : Grid(@Each(data.rows, "c",
      ProfileCard(c.name, c.role, c.avatar, c.bio, c.tags,
                  Action([@Set($selected, c.id)]))
    ), 4, "m")

detail = $selected == "" ? null : Sheet(
  "Contact detail",
  true,
  [Stack([
    PersonChip(data.selectedName, data.selectedRole, data.selectedAvatar, "lg", "online"),
    DescriptionList([
      DescriptionItem("Company", data.selectedCompany),
      DescriptionItem("Owner",   data.selectedOwner),
      DescriptionItem("ARR",     data.selectedArr),
      DescriptionItem("Renewal", data.selectedRenewal)
    ]),
    Callout("tip", "Last touch: " + data.selectedLastTouch, null, null, true),
    Quote(data.selectedQuote, data.selectedQuoteCite, "primary")
  ], "column", "m")],
  "right",
  [Buttons([
    Button("Close",       Action([@Reset($selected)]), "secondary"),
    Button("Open in CRM", Action([@ToAssistant("Open " + $selected + " in the CRM")]), "primary")
  ])]
)

root = Stack([
  PageHeader("Contacts", "2,481 contacts · 12 at-risk", null,
             [Button("New contact", Action([@ToAssistant("Open new-contact form")]), "primary")],
             Badge("CRM v3.1", "info", true)),
  tiles,
  Stack([search, segments], "column", "m"),
  cards,
  Pagination($page, 6, 1),
  detail
], "column", "l")
```

The `Tile` row gives the page a dense quick-stats strip; clicking a tile
filters the directory. `SearchBar` provides a polished search input without
manual styling. The slide-in `Sheet` reuses `PersonChip`, `Callout`, and
`Quote` for a richer detail view than a plain `Card`.

### Pattern S — E-commerce checkout (multi-step + Stripe-style summary)

```text
root = AppShell(
  Sidebar([
    SidebarSection("Checkout", [
      SidebarItem("Cart",     "cart-shopping",   $step >= 0),
      SidebarItem("Shipping", "truck",           $step >= 1),
      SidebarItem("Payment",  "credit-card",     $step >= 2),
      SidebarItem("Review",   "circle-check",    $step >= 3)
    ])
  ], "Aurora", "Secure checkout"),
  [header, body, summary]
)

$step = 0
$cart = [
  {id: 1, name: "Aurora Pro Headphones", qty: 1, price: 349},
  {id: 2, name: "Aurora Case",           qty: 1, price: 39}
]
$address = {name: "", line1: "", city: "", country: "US"}
$payment = {method: "card", number: "", expiry: "", cvc: ""}

next = @Set("step", $step + 1)
prev = @Set("step", $step - 1)

header = PageHeader(
  "Checkout",
  "Step " + ($step + 1) + " of 4",
  Breadcrumb([BreadcrumbItem("Store", "/"), BreadcrumbItem("Cart", "/cart"), BreadcrumbItem("Checkout")]),
  null,
  StatusDot("Secure", "success")
)

cartStep = Stack([
  SectionHeader("Your cart", "Review items before continuing"),
  Table($cart, [Col("Item", "name"), Col("Qty", "qty"), Col("Price", "price")]),
  Buttons([Button("Continue to shipping", "primary", next)])
])

shippingStep = Stack([
  SectionHeader("Shipping address", "Where should we deliver?"),
  Form([
    FormControl("Full name",  Input($address.name)),
    FormControl("Address",    Input($address.line1)),
    FormControl("City",       Input($address.city)),
    FormControl("Country",    Select($address.country, [SelectItem("US","United States"), SelectItem("UK","United Kingdom"), SelectItem("DE","Germany")])),
    Buttons([Button("Back", "ghost", prev), Button("Continue", "primary", next)])
  ])
])

paymentStep = Stack([
  SectionHeader("Payment", "All transactions are encrypted", null,
                StatusDot("PCI compliant", "success")),
  ToggleGroup($payment.method, [
    {value: "card",   label: "Card"},
    {value: "paypal", label: "PayPal"},
    {value: "apple",  label: "Apple Pay"}
  ]),
  $payment.method == "card" ? Form([
    FormControl("Card number", Input($payment.number, "4242 4242 4242 4242")),
    Grid([
      FormControl("Expiry", Input($payment.expiry, "MM/YY")),
      FormControl("CVC",    Input($payment.cvc,    "123"))
    ], 2),
    Buttons([Button("Back", "ghost", prev), Button("Review order", "primary", next)])
  ]) : Callout("info", "You'll be redirected to " + $payment.method + " after review.", null, null, true)
])

reviewStep = Stack([
  SectionHeader("Review and pay"),
  DescriptionList([
    DescriptionItem("Ship to",  $address.name + " · " + $address.city, "truck"),
    DescriptionItem("Payment",  $payment.method + " ending " + $payment.number, "credit-card"),
    DescriptionItem("Items",    $cart.length + " in cart", "box")
  ]),
  Buttons([Button("Back", "ghost", prev), Button("Place order — $" + @Sum($cart, "price"), "success", Action([@Run(placeOrder)]))])
])

placeOrder = Mutation("placeOrder", {cart: $cart, address: $address, payment: $payment})

body = $step == 0 ? cartStep
     : $step == 1 ? shippingStep
     : $step == 2 ? paymentStep
     :              reviewStep

summary = Card([
  SectionHeader("Order summary"),
  DescriptionList([
    DescriptionItem("Items",    "$" + @Sum($cart, "price")),
    DescriptionItem("Shipping", "Free"),
    DescriptionItem("Tax",      "$0")
  ]),
  Separator(),
  Stack([TextContent("Total", "small", "muted"), TextContent("$" + @Sum($cart, "price"), "large-heavy")], "row"),
  placeOrder.loading ? Banner("Processing order…", null, null, "spinner", "info")
                     : placeOrder.data ? Callout("success", "Order placed!", "Confirmation #" + placeOrder.data.id, "circle-check")
                     : null
])
```

Highlights:

- `Sidebar` doubles as a **stepper** by toggling `active` on each item with
  `$step >= n`. The sidebar tracks progress while staying part of the app
  shell.
- Each step is an isolated named statement — body picks the right one. No
  global "if/else if" tree.
- The right-hand `summary` `Card` is shared across all steps. Use the same
  `Card` everywhere for a consistent receipt feel.
- `Mutation` for order placement: the `loading` / `data` branches drive the
  inline success banner without leaving the page.

### Pattern T — Docs reader / knowledge base (Routes + TOC + content)

```text
articles = [
  {slug: "intro",        title: "Introduction",        category: "Get started", body: "Welcome to Aurora docs. This guide…"},
  {slug: "install",      title: "Installation",        category: "Get started", body: "Install via npm or include the CDN…"},
  {slug: "components",   title: "Components",          category: "Reference",   body: "The component library exposes 90+…"},
  {slug: "routing",      title: "Routing",             category: "Reference",   body: "Use Routes / Route / NavLink to…"},
  {slug: "themes",       title: "Themes",              category: "Customise",   body: "Seven built-in themes ship out-of-the-box…"}
]

root = AppShell(sidebar, [header, Routes([
  Route("/",            Stack([welcome, picks])),
  Route("/docs/:slug",  article),
  Route("*",            notFound)
])], topbar)

categories = ["Get started", "Reference", "Customise"]

sidebar = Sidebar(
  @Each(categories, "c", SidebarSection(c,
    @Each(@Filter(articles, "category", "==", c), "a",
      SidebarItem(a.title, "file-lines", $route == "/docs/" + a.slug, null, @Navigate("/docs/" + a.slug))))),
  "Aurora docs", "v3.2.0"
)

topbar = Stack([
  SearchBar($query, "Search docs (⌘K)"),
  Stack([NavLink("GitHub", "/github", "ghost", true, "brands:github"),
         NavLink("Discord", "/discord", "ghost", true, "brands:discord")], "row", "s")
], "row", "m")

welcome = Hero("Aurora docs", "Build streaming UI for any LLM in minutes.",
               Button("Get started", "primary", @Navigate("/docs/intro")),
               Button("Try the playground", "ghost", @OpenUrl("/playground.html")),
               "Docs",
               ["Streaming-first", "130+ components", "7 themes"])

picks = FeatureGrid([
  FeatureItem("Quick start",  "Install via CDN or npm.",  "rocket",       "primary"),
  FeatureItem("Components",   "Browse the catalog.",       "boxes-stacked","info"),
  FeatureItem("Theming",      "Match your brand.",         "palette",      "success"),
  FeatureItem("JavaScript",   "Add custom behaviour.",     "code",         "warning")
], 4)

article = Stack([
  Breadcrumb([BreadcrumbItem("Docs", "/"), BreadcrumbItem("Article")]),
  PageHeader(@First(@Filter(articles, "slug", "==", params.slug)).title),
  TextContent(@First(@Filter(articles, "slug", "==", params.slug)).body, "lg"),
  Separator(),
  SectionHeader("Was this helpful?"),
  Buttons([Button("👍 Yes", "success", @Run(thumbsUp)), Button("👎 No", "ghost", @Run(thumbsDown))])
])

notFound = EmptyState("Article not found",
                      "We couldn't find that page. Try the index.",
                      "circle-question",
                      Button("Back to docs", "primary", @Navigate("/")))
```

Highlights:

- The `Sidebar` is generated from a single `articles` list grouped by
  `category` — adding a new article only needs one new row.
- `$route` drives the `active` highlight; never assign `$route` directly.
- Top-bar `SearchBar` would pair with Recipe 5 (debounced search) for live
  filtering.
- `:slug` is a route param; `params.slug` is only valid inside the matched
  `Route`'s content.

### Pattern U — File manager (SplitView + breadcrumb path + Table)

```text
$path = ["home", "projects", "aurora"]
$selected = null

files = Query("listFiles", {path: $path})

root = Stack([
  PageHeader(@Last($path), $path.length + " levels deep",
             Breadcrumb(@Each($path, "p", BreadcrumbItem(p))),
             Buttons([Button("Upload", "primary", @Js(`alert('Upload TBD')`)),
                      Button("New folder", "ghost", @Run(newFolder))])),
  SplitView(primary, detail, "60%")
])

primary = Card([
  Toolbar(
    [SearchBar($query, "Filter files"),
     Select($sort, [SelectItem("name","Name"), SelectItem("modified","Modified"), SelectItem("size","Size")])],
    [ToggleGroup($view, [{value:"list",label:"List"},{value:"grid",label:"Grid"}])]
  ),
  files.loading ? Skeleton(160)
   : files.error ? Callout("danger", "Couldn't load folder", files.error, "triangle-exclamation")
   : files.data.length == 0
       ? EmptyState("Folder is empty", "Drop files here or click Upload.", "folder-open",
                    Button("Upload", "primary"))
   : Table(@Sort(@Filter(files.data, "name", "contains", $query), $sort, "asc"), [
         Col("",         "icon"),
         Col("Name",     "name"),
         Col("Modified", "modified"),
         Col("Size",     "size")
       ])
])

detail = $selected ? Stack([
  Stack([Icon("file-lines", null, "lg"), TextContent($selected.name, "large-heavy")], "row", "s"),
  DescriptionList([
    DescriptionItem("Size",     $selected.size,      "weight-hanging"),
    DescriptionItem("Modified", $selected.modified,  "clock"),
    DescriptionItem("Owner",    $selected.owner,     "user"),
    DescriptionItem("Path",     "/" + $path.join("/") + "/" + $selected.name, "folder-tree")
  ], 1),
  Separator(),
  Buttons([Button("Download", "primary", @Js(`window.open(ctx.args.url)`, {url: $selected.url})),
           Button("Share",    "ghost",   @Run(share)),
           Button("Delete",   "danger",  @Set("confirm", $selected.id))])
]) : EmptyState("Select a file", "Choose a file from the list to see its details.", "hand-pointer")
```

Highlights:

- The breadcrumb in the `PageHeader` is the **path** — pushing/popping the
  `$path` array drives navigation.
- `SplitView` is the canonical master/detail layout: list on the left,
  contextual details on the right.
- Always handle the **no-selection** case with an `EmptyState` so the right
  pane is never blank.
- The `Toolbar` neatly groups filters on the left and view-mode controls on
  the right.

### Pattern V — Calendar / scheduler (Grid of day cells + day detail)

```text
$month = "2026-05"
$selectedDay = 13

days = @Each([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31], "d",
  Card([
    Stack([TextContent(d, "lg"),
           d == 1 || d == 15 ? StatusDot("event", "primary", true) : null], "row", "s"),
    d == 13 ? Badge("Today", null, "info", "sm") : null
  ], d == $selectedDay ? "primary" : "default"))

events = [
  {day: 13, time: "09:00", title: "Standup",       tone: "info",    icon: "users"},
  {day: 13, time: "11:30", title: "Design review", tone: "primary", icon: "pen-ruler"},
  {day: 13, time: "14:00", title: "1:1 with Sara", tone: "success", icon: "user"},
  {day: 15, time: "10:00", title: "All-hands",     tone: "warning", icon: "bullhorn"},
  {day: 22, time: "16:00", title: "Demo day",      tone: "primary", icon: "play"}
]

selectedEvents = @Filter(events, "day", "==", $selectedDay)

root = Stack([
  PageHeader("Calendar", "Schedule and events",
             null,
             Buttons([Button("◀", "ghost", @Js(`/* prev month */`)),
                      TextContent("May 2026", "lg"),
                      Button("▶", "ghost", @Js(`/* next month */`)),
                      Button("New event", "primary", @Run(createEvent))]),
             StatusDot("3 today", "info")),
  Grid([
    TextContent("Mon"), TextContent("Tue"), TextContent("Wed"),
    TextContent("Thu"), TextContent("Fri"), TextContent("Sat"), TextContent("Sun")
  ], 7, "s"),
  Grid(days, 7, "s"),
  SectionHeader("Events on May " + $selectedDay),
  selectedEvents.length == 0
    ? EmptyState("No events", "This day is wide open. Block some focus time?", "calendar-day",
                 Button("Add event", "primary", @Run(createEvent)))
    : Timeline(@Each(selectedEvents, "e",
        TimelineItem(e.title, e.time, null, e.icon, e.tone)))
])
```

Highlights:

- A month grid is just `Grid(cells, 7)` — each cell is a small `Card` whose
  `tone` switches when it matches `$selectedDay`.
- `StatusDot(..., true)` (pulsing) marks days that have events without
  cluttering the cell.
- The day-detail uses `Timeline` rather than a `List` — a calendar day is an
  ordered sequence of events.
- For a real production calendar you'd compute the day cells from the active
  month with a `Script`. The shape above keeps the snippet readable.

---

## 12. Common pitfalls and anti-patterns

| Mistake                                                                              | Fix                                                                                                                              |
|--------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| Multi-line `Script` body with `"..."` (real newline breaks the string).              | Use backticks `` `...` `` for multi-line bodies.                                                                                 |
| `ctx.state.get('item').id` inside a loop where `item` is the `@Each` variable.       | `@Each` vars are render-time only. Use `@Js(body, {id: t.id})` → `ctx.args.id`.                                                  |
| `$todos.length \|\| 0` "just in case".                                               | `.length` is always a number. Drop the `\|\| 0`.                                                                                  |
| `filter($todos, "done")` (treating builtins as functions without `@`).               | Builtins are `@`-prefixed: `@Filter($todos, "done", "==", true)`.                                                                 |
| `Script("init", "ctx.state.set('todos', [...])")` to seed initial state.             | `$todos = [...]` — state declarations seed themselves.                                                                            |
| Reusing the same `Script` id for two different scripts.                              | Every `Script(...)` needs a stable, unique id within the response.                                                                |
| Forgetting `ctx.cleanup(...)` for intervals/listeners.                               | Always register cleanup. The script will leak otherwise.                                                                          |
| Stray prose inside `Action([...])` (`Action([@Js(...) Enthusiastic])`).              | Action arrays contain ONLY action steps, comma-separated. No labels, no adverbs.                                                  |
| `Query("tool", {q: "" + $search})` (string interpolation hides the dependency).      | `Query("tool", {q: $search})` — pass the bare `$variable`.                                                                        |
| Mutating `$todos` inside `@Js` via `.push()` (mutates state in place; no re-render). | Always assign a fresh array: `ctx.state.set('todos', [...todos, newItem])`.                                                       |
| Touching `localStorage`, `document.cookie`, custom `fetch(...)` directly.            | Go through tools: `await ctx.tools.save_pref({key, value})`.                                                                      |
| Defining everything inline in `root = Stack([...])` (no streaming).                  | Break into named statements: `root = Stack([header, body, footer])` so each section renders independently as it arrives.          |
| Hand-rolling a dashboard row from raw `Card`s + `Stack` + `TextContent`.             | Use `MetricGrid([StatCard(...), ...])` — one statement, polished defaults, responsive grid.                                       |
| Building a multi-column "trello-like" board out of nested `Stack`s.                  | Use `KanbanBoard([KanbanColumn(title, [KanbanCard(...)])])` — encodes the entire shape.                                            |
| Putting page title + breadcrumbs + actions in 4 separate statements.                 | Use `PageHeader(title, subtitle, breadcrumbs, actions, status)` — one statement.                                                  |
| Using `Stack(direction="row", wrap=true)` for tiles that should all be the same size.| Use `Grid(items, columns?)` — auto-fits with uniform sizing.                                                                       |
| Showing an empty list with bare `TextContent("No items.", "small", "muted")`.        | Use `EmptyState(title, description, action, icon)` — guides the user to the next step.                                            |
| Sparse output: 2–3 `Card`s for a dashboard, profile, or settings request.            | Hit the **density target** in § 0.5 (6 sections for dashboards, 5 for detail/settings/landing/list).                              |
| Stacking labels above values as `TextContent("Label") + TextContent(value)`.         | Use `DescriptionList([DescriptionItem(label, value, icon?)])`.                                                                    |
| Building a SaaS UI without persistent navigation.                                    | Wrap the whole layout in `AppShell(Sidebar(...), [content...])`.                                                                  |
| Hand-rolling a master/detail layout with `Grid(items, 2)`.                           | Use `SplitView([primary...], [detail...], "320px")` — collapses gracefully on mobile.                                              |
| Showing live status as plain `Badge` everywhere.                                     | Use `StatusDot(label, tone, pulse?)` for inline health pips; reserve `Badge` for categorical labels.                              |
| Drawing pricing tiers from raw `Card`s.                                              | Use `PricingTable([PricingCard(...)])` — featured tier, badge, and feature lists are built in.                                    |
| Filter Selects floating above a table with no grouping.                              | Wrap them in `Toolbar([filters...], [actions...])` — left/right slots produce a clean SaaS toolbar.                                |

---

## 13. Streaming, performance, and ergonomics

### Stream-friendly structure

- One statement per line.
- Bracketed expressions can span lines, but anything else must fit on one line.
- Long arrays (e.g. chart data, table rows) go on their own trailing lines so
  they appear last and never block the shell.
- Avoid trailing commas, dangling operators, or open brackets — they keep the
  chunk un-parseable until the next chunk arrives.

### Avoid re-render storms

- `Query` re-runs only when one of its `$variable` args changes. Don't add
  extra deps "for safety".
- `Script` deps are the same way — list only the variables the body actually
  reads.
- `@Set($x, $x)` (writing the same value) is a no-op and does NOT trigger a
  re-render.

### Big data

- Build `Series` and `Col.values` from a `Query` result, not from inline
  literals; the renderer handles the array efficiently.
- Use `Skeleton` while loading. Avoid showing a blank shell with no
  affordance for "data is coming".

### Showing the source

When debugging, set the `showerrors` attribute to surface parse errors.
Listen to the `error` event for programmatic reporting in production.

---

## 14. Extending the library

Host pages can teach the LLM about new components via `registerComponents`:

```js
el.registerComponents([
  {
    name: "ProductCard",
    description: "Product tile with title, price, and badge.",
    props: [
      { name: "title", type: "string" },
      { name: "price", type: "number" },
      { name: "badge", type: "string", optional: true },
    ],
    render: (_node, props) => {
      const card = document.createElement("article");
      card.className = "product-card";
      card.innerHTML = `
        <h3>${props.title}</h3>
        <p class="price">$${props.price.toFixed(2)}</p>
        ${props.badge ? `<span class="badge">${props.badge}</span>` : ""}
      `;
      return card;
    },
  },
]);
```

After registering, the next `getSystemPrompt()` call includes the new
component, so the LLM can use `ProductCard("Widget", 9.99, "New")` in any
response.

### Tool descriptors

Mirror the host's `setTools` registration in the prompt so the LLM knows
what tools exist:

```js
const prompt = el.getSystemPrompt({
  preamble: "You are a storefront assistant.",
  tools: [
    { name: "list_products", description: "Catalog rows.",       argsExample: { limit: 20 } },
    { name: "place_order",   description: "Create a new order.", kind: "Mutation",
      argsExample: { items: [{ id: "sku_1", qty: 1 }] } },
  ],
  additionalRules: [
    "Always end with a FollowUpBlock of 2 prompts.",
  ],
});
```

---

## 15. Glossary

| Term                | Meaning                                                                                              |
|---------------------|------------------------------------------------------------------------------------------------------|
| Statement           | One line, `name = Expression` or `$name = Literal`.                                                  |
| Identifier          | A bare name (no `$` prefix). Resolved to the most recent binding when read.                          |
| State (`$name`)     | A reactive variable. The only mutable storage. Re-renders dependents on change.                      |
| Query               | An auto-running tool call. Re-runs when any `$variable` arg changes, or every `refreshSec` if set.   |
| Mutation            | An action-triggered tool call. Runs only from `@Run(name)`.                                          |
| Action              | A sequenced list of effects (`Action([@Set, @Run, @ToAssistant, …])`) attached to a control.         |
| Builtin             | `@Name(args)`. Pure function. May appear in any expression.                                          |
| Loop variable       | The middle argument of `@Each($items, "x", template)`. Scoped strictly to `template`.                |
| Action step         | A node inside `Action([...])`. One of `@Set / @Reset / @Run / @ToAssistant / @OpenUrl / @Js`.        |
| `ctx`               | The bridge passed to JS bodies (`Script` and `@Js`). See § 10.                                       |
| `ctx.args`          | Render-time arguments captured by `@Js(body, args)`. Empty for `Script`.                             |
| Route               | A single page declaration: `Route(path, content)`. Lives inside a `Routes(...)` outlet. See § 10.5.  |
| `$route`            | Runtime-owned reactive state holding the current hash path. See § 10.5.                              |
| `params`            | Loop variable bound inside a matched `Route`'s content. Holds URL parameters. See § 10.5.            |

---

## 16. Quick "where do I look?" index

| You want to…                                          | Read…                                                 |
|-------------------------------------------------------|-------------------------------------------------------|
| Pick the right top-level shape                        | § 2 "Anatomy of a response"                           |
| Track user input                                      | § 3 "Reactive state"                                  |
| Call a backend                                        | § 4 "Tools: Query and Mutation"                       |
| Wire up a button                                      | § 5 "Actions" (deep dive: `docs/actions.html`)        |
| Render a list                                         | § 6 "Loops & lists"                                   |
| Filter / count / sort / aggregate                     | § 8 "Built-in functions"                              |
| Find a component signature                            | § 9 "Component reference"                             |
| Compose a polished UI fast                            | § 9 "Patterns" + § 11 Patterns I–V                    |
| Match a theme (`light` / `dark` / `neon` / `glass` …) | § 0.5 "Theme awareness"                               |
| Drop-in snippet for search / sort / toast / debounce  | § 10.9 "Composition cookbook"                         |
| Add a timer, fetch, focus, keyboard shortcut          | § 10 "JavaScript layer"                               |
| Wire a per-row Delete / Toggle button                 | § 10 (Per-item handler pattern) or Cookbook Recipe 6  |
| Build a complete app                                  | § 11 "Application patterns"                           |
| Build a dashboard                                     | § 11 Pattern I (Rich project dashboard)               |
| Build a landing page                                  | § 11 Pattern J (Marketing landing page)               |
| Build a directory / search-with-pagination            | § 11 Pattern K (Team directory)                       |
| Build a settings / preferences screen                 | § 11 Pattern L (Settings panel)                       |
| Build a full app surface with sidebar nav             | § 11 Pattern M (AppShell)                             |
| Build a detail / profile page                         | § 11 Pattern N (PageHeader + DescriptionList)         |
| Build a pricing page                                  | § 11 Pattern O (PricingTable)                         |
| Build a master/detail (inbox, files)                  | § 11 Pattern P (SplitView)                            |
| Build a product detail / store page                   | § 11 Pattern Q (Cover + MediaCard)                    |
| Build a CRM / contacts directory                      | § 11 Pattern R (Tile stats + Sheet)                   |
| Build an e-commerce checkout                          | § 11 Pattern S                                        |
| Build docs / knowledge-base reader                    | § 11 Pattern T                                        |
| Build a file manager                                  | § 11 Pattern U                                        |
| Build a calendar / scheduler                          | § 11 Pattern V                                        |
| Wire up multiple pages / deep links                   | § 10.5 "Routing layer" and Pattern H in § 11          |
| Diagnose a parse error or broken interaction          | § 12 "Common pitfalls"                                |
| Avoid sparse / wireframe-y output                     | § 0.5 "Rich layout principles" + density table        |

---

## 17. Self-check before emitting a response

Walk this list before you send your output:

1. Is `root = …` the FIRST line?
2. Is every name referenced from `root` defined somewhere below?
3. **Did I reach for high-level patterns first?** Could a `PageHeader`
   replace a hand-rolled title row? A `MetricGrid` replace a row of
   `StatCard`s? A `KanbanBoard` replace nested `Stack`s? An `EmptyState`
   replace a bare "no results" text? A `SplitView` instead of a hand-rolled
   2-column grid?
4. **For tiles that should all be the same size**, did I use `Grid` instead
   of `Stack(row, wrap=true)`?
5. **Did I add status colour where it conveys meaning?** Trends on
   `StatCard`, variants on `Badge` and `Banner`, `tone` on `TimelineItem`,
   `pulse` on `StatusDot` for realtime.
6. **Is the response theme-safe?** No hard-coded colours, gradients, fonts,
   or pixel values that override theme tokens. Only semantic props
   (`tone="success"`, `variant="primary"`).
7. **Did I hit the density target?** Dashboard ≥ 6 sections, detail/settings
   ≥ 5, landing ≥ 5 (see § 0.5).
8. **Did I render loading / error / empty branches** for every `Query` and
   `Mutation` instead of assuming a single happy path?
9. Are state declarations literal values (no function calls on the right)?
10. Are `Query` args bare `$variable` references (not interpolations)?
11. Inside `@Each`, are loop-variable reads confined to the template?
12. For per-row buttons, am I using `@Js(body, {id: x.id})` instead of
    `ctx.state.get('x')`?
13. For multi-line `Script` bodies, am I using backticks?
14. Did I register `ctx.cleanup(...)` for every interval / listener /
    subscription / observer?
15. Are all `Script` ids unique within this response?
16. Could any `@Js` be replaced by `@Set` + a builtin (`@Push`, `@Filter`,
    `@Sort`, `@Concat`)?
17. If the response uses routing, does it include a wildcard or `default`
    fallback, never assign `$route` itself, and read `params.*` only inside
    a matched `Route`'s content?
18. Does the response end with a `FollowUpBlock` (or an equally obvious set
    of next-step buttons)?
19. Are all icons valid Font Awesome 6 free names (no emoji, no `fa-`
    prefix)?
20. **Did I use `$$persistent`** for any value the user expects to find
    again after a refresh (theme, sidebar state, cart, draft text,
    "recently viewed")?
21. **Did I replace nested ternaries with `@If` / `@Switch`?** Especially
    when the unused branch would otherwise read an out-of-scope loop
    variable.
22. **For full pages, did I use responsive prop maps?** `Grid(items, {sm: 1, md: 2, lg: 4})`,
    `Stack(children, {sm: "column", md: "row"})`. Single-value props are
    fine for simple sections.
23. **Did I prefer template literals (`` `…${expr}…` ``) over string
    concatenation?** They're shorter and easier to read.
24. **Did I factor repeated component trees into macros**
    (`MyCard(user) = …`) when the same shape appears more than twice?

If you can answer "yes" to all checks, your response is ready.

---

## Further reading

### Docs site (canonical references)

- **Library README:** [`README.md`](./README.md) — install, embed, theme, deploy.
- **Overview:** <https://asfand-dev.github.io/streaming-ui-script/>
- **Get started:** <https://asfand-dev.github.io/streaming-ui-script/get-started.html>
- **Framework integration:** <https://asfand-dev.github.io/streaming-ui-script/frameworks.html>
- **Component reference:** <https://asfand-dev.github.io/streaming-ui-script/components.html>
- **Language reference:** <https://asfand-dev.github.io/streaming-ui-script/language.html>
- **Actions guide:** <https://asfand-dev.github.io/streaming-ui-script/actions.html>
- **JS interactions guide:** <https://asfand-dev.github.io/streaming-ui-script/javascript-interactions.html>
- **Routing guide:** <https://asfand-dev.github.io/streaming-ui-script/routing.html>
- **Theming:** <https://asfand-dev.github.io/streaming-ui-script/themes.html>
- **Theme customization:** <https://asfand-dev.github.io/streaming-ui-script/theme-customization.html>
- **Examples gallery:** <https://asfand-dev.github.io/streaming-ui-script/examples.html>
- **Live examples catalog:** <https://asfand-dev.github.io/streaming-ui-script/live-examples.html>
- **Playground:** <https://asfand-dev.github.io/streaming-ui-script/playground.html>

### Live examples by category

LLM and tool integrations:

- **Chat bot:** <https://asfand-dev.github.io/streaming-ui-script/chat-bot.html>
- **Chat bot · advanced pipeline:** <https://asfand-dev.github.io/streaming-ui-script/chat-bot-advanced.html>
- **Tools integration:** <https://asfand-dev.github.io/streaming-ui-script/tools-example.html>
- **External data:** <https://asfand-dev.github.io/streaming-ui-script/external-data-example.html>
- **Support agent:** <https://asfand-dev.github.io/streaming-ui-script/support-agent.html>
- **Analytics assistant:** <https://asfand-dev.github.io/streaming-ui-script/analytics-assistant.html>

JavaScript layer demos:

- **Todo app (localStorage):** <https://asfand-dev.github.io/streaming-ui-script/javascript-todo-app.html>
- **Pomodoro timer:** <https://asfand-dev.github.io/streaming-ui-script/javascript-pomodoro.html>
- **Stopwatch + laps:** <https://asfand-dev.github.io/streaming-ui-script/javascript-stopwatch.html>

Routing and multi-page:

- **Multi-page routing demo:** <https://asfand-dev.github.io/streaming-ui-script/routing-demo.html>
- **App workspace (AppShell):** <https://asfand-dev.github.io/streaming-ui-script/app-workspace.html>

Pattern-driven applications:

- **Project dashboard:** <https://asfand-dev.github.io/streaming-ui-script/project-dashboard.html>
- **Marketing landing:** <https://asfand-dev.github.io/streaming-ui-script/marketing-landing.html>
- **Team directory:** <https://asfand-dev.github.io/streaming-ui-script/team-directory.html>
- **Settings app:** <https://asfand-dev.github.io/streaming-ui-script/settings-app.html>
- **Product detail (e-commerce):** <https://asfand-dev.github.io/streaming-ui-script/ecommerce-product.html>
- **Inbox app (SplitView):** <https://asfand-dev.github.io/streaming-ui-script/inbox-app.html>
- **Pricing page:** <https://asfand-dev.github.io/streaming-ui-script/pricing-page.html>
- **CRM contacts:** <https://asfand-dev.github.io/streaming-ui-script/crm-contacts.html>
- **Status page (monitoring):** <https://asfand-dev.github.io/streaming-ui-script/status-page.html>
- **Checkout flow (wizard):** <https://asfand-dev.github.io/streaming-ui-script/checkout-flow.html>
- **File manager (Tree + preview):** <https://asfand-dev.github.io/streaming-ui-script/file-manager.html>
- **Calendar & scheduler:** <https://asfand-dev.github.io/streaming-ui-script/calendar-app.html>
- **Docs portal (help center):** <https://asfand-dev.github.io/streaming-ui-script/docs-portal.html>
- **Issue tracker (Kanban + filters):** <https://asfand-dev.github.io/streaming-ui-script/issue-tracker.html>
- **Expense tracker (finance + charts):** <https://asfand-dev.github.io/streaming-ui-script/expense-tracker.html>
- **Polls & surveys (voting + results):** <https://asfand-dev.github.io/streaming-ui-script/polls-app.html>

### Build artefacts

- **Generated system prompt (full):** <https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt.txt>
- **Generated system prompt (chat):** <https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt_chat.txt>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js>
