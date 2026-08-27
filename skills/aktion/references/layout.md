# Rich-layout principles

Models writing Aktion default to sparse layouts unless explicitly pushed not to.
**The goal of this reference is to make polished, dense, SaaS-style UIs the
default** — the quality of a hand-crafted shadcn/ui + Tailwind layout, not a
wireframe.

This is the most important page in the skill. Everything else is reference
material; this is judgement.

## Pattern-first composition

Before opening a `Card` or a `Column`, scan this table. Each right-hand entry
commits an entire visual section in one line.

| If you need… | Use this single-line composite |
| --- | --- |
| A page title + breadcrumbs + actions | `PageHeader(title, { subtitle, breadcrumbs, actions, status })` |
| A sub-section title inside a Card | `SectionHeader(title, { subtitle, eyebrow, status, actions })` |
| A row of KPIs | `Stats([StatCard(...), ...])` |
| A compact inline stat strip (3–6 items) | `Stats([{label, value, hint, tone}, ...], { layout: "strip" })` |
| Quick-action / category tiles | `Grid([Tile(label, { icon, value, description, tone, action }), ...], { columns })` |
| A filter + actions bar above a list/table | `Toolbar({ left: [...], right: [...], searchable: true })` |
| A polished search input | `SearchBar(id, { placeholder, value, shortcut })` |
| A key/value summary on a detail page | `DescriptionList([DescriptionItem(label, value, { icon })])` |
| Inline health pip | `StatusDot(label, { tone, pulse })` |
| A soft status label ("SSL active", "pending") | `Pill(label, { tone })` |
| A solid attention chip ("Recommended") | `Badge(label, { variant, icon })` |
| Pricing tiers | `PricingTable([PricingCard(plan, { price, period, features, action })])` |
| App-level navigation | `AppShell(Sidebar(...), [content...], { topbar, collapsible })` |
| Master/detail (inbox, file browser) | `SplitView([primary...], [detail...], { primaryWidth })` |
| Empty list | `EmptyState(title, { description, icon, actions })` |
| Async content with all four states | `Async(resource, { loading, error, empty, data })` |
| Activity feed | `Timeline([TimelineItem(title, { time, description, icon, tone })])` |
| A feed of user actions / audit trail | `ActivityLog(entries, { variant })` |
| Kanban / task board | `KanbanBoard([KanbanColumn(title, { items: [KanbanCard(...)] })])` |
| Hero / marketing intro | `Hero(title, { subtitle, primary, secondary, eyebrow, highlights, tone })` |
| Image-led hero (product, article) | `Hero(title, { imageSrc, caption, layout: "cover", height })` |
| Feature highlights | `FeatureGrid([FeatureItem(title, { description, icon, tone })])` |
| Product / article preview card | `MediaCard(title, { imageSrc, description, tags, meta, actions, badge })` |
| Star rating + review count | `Rating(value, { max, count, interactive, halfStep })` |
| Circular progress / completion ring | `ProgressRing(value, { max, label, tone, size })` |
| Inline notification (inbox / feed item) | `Notification(title, { message, time, icon, tone, unread, actions })` |
| A whole notification inbox | `InboxPanel(items, { onMarkAllRead })` |
| Person reference in a row / cell | `PersonChip(name, { role, avatarSrc, status })` |
| Inline tip / footnote | `Callout(variant, title, { description, icon, compact: true })` |
| Pull quote (not a full testimonial) | `Quote(text, { cite })` |
| Chat-style message (review, transcript) | `ChatBubble(author, { body, time, avatarSrc, from })` |
| A sortable/filterable/paged table | `DataGrid(cols, { sort, selectedIds, selectable, page, perPage })` |
| Onboarding / setup checklist | `OnboardingChecklist(items, { title, subtitle })` |
| A multi-step form | `MultiStepForm(steps, { current, onSubmit })` |
| A group of related form fields | `FormSection(label, [FormControl(...), ...], { helper })` |
| Centered readable column | `Container([content...], { size })` |
| Center content on both axes | `Center([content...], { minHeight })` |
| Push siblings to opposite edges in a row | `Row([a, Spacer(), b])` or `Row([a, b], { justify: "between" })` |

## Visual hierarchy rules

1. **Status colour carries meaning.** A `Column` of plain `StatCard`s is flat.
   `StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%", icon: "sack-dollar" })`
   communicates health at a glance — trend, delta, and icon together.
2. **Put an icon in every iconable slot.** `StatCard`, `FeatureItem`,
   `TimelineItem`, `Banner`, `KanbanCard`, `Callout`, `ListItem`, `Badge`,
   `BreadcrumbItem`, `SidebarItem`, `Tile`, `MenuItem` all accept `icon`. Use
   `Icon(name, { variant, size })` for a standalone glyph. **Never raw emoji.**
3. **People render as avatars, not text.** Author names, assignees, commenters →
   `Avatar`, `PersonChip`, `ProfileCard`, or `Comment`.
4. **Group fields inside Cards.** A settings page is a stack of Cards, each
   opened by a `SectionHeader` (or `FormSection`) and containing a few related
   controls — never a flat list of fields on the page.
5. **Hide secondary content behind `Tabs` or a `Drawer`** rather than scrolling
   forever.
6. **Keep a spacing rhythm.** `gap: "lg"` between top-level sections, `"md"`
   inside Cards, `"sm"` between tightly related controls. The scale everywhere
   (`gap`/`padding`/`margin`/`Spacer`) is
   `none|3xs|2xs|xs|sm|md|lg|xl|2xl|3xl`; `none` is exactly 0.

## Density targets — the most common failure

| Page type | Min sections | What to include |
| --- | :-: | --- |
| Dashboard | **6** | `PageHeader` + `Toolbar`/filters + `Stats` + chart Card + table/list Card + follow-ups |
| Detail / profile | **5** | `PageHeader` + `DescriptionList` Card + content Card + activity/timeline Card + related items |
| Settings | **5** | `PageHeader` + 3+ section Cards (each with `SectionHeader`) + danger-zone Card |
| Landing / marketing | **5** | `Hero` + `FeatureGrid` + (`Testimonial` / `Quote` / `PricingTable`) + closing `Banner` |
| Product / article | **6** | `Hero` + `Stats` trust strip + spec `DescriptionList` + related `MediaCard` grid + reviews + closing CTA |
| Pricing | **5** | `Hero` + cycle `ToggleGroup` + `PricingTable` + `FeatureGrid` + FAQ `Accordion` + closing `Banner` |
| Inbox / messaging | **4** | `PageHeader` + `SplitView` (`Notification` list + `ChatBubble` thread) + composer |
| Directory / CRM | **5** | `PageHeader` + `Tile` quick-stats + `SearchBar` + filter `ToggleGroup` + `ProfileCard` grid + `Pagination` |
| List / browse | **5** | `PageHeader` + `Toolbar` + (optional `Stats`) + `Table`/`Grid` Card + `Pagination` |
| Full app surface | **4 (in shell)** | `AppShell` wrapping a `Sidebar` + (`PageHeader` + sections) |
| Empty / zero state | **3** | `PageHeader` + `EmptyState` with a CTA + follow-ups |

If a draft has fewer named sections than the minimum, **add a complementary
section** — related items, recent activity, status, follow-ups. Vertically
stacking two or three components reads as a wireframe, not a product.

## App or website? — pick the right shell

- **App / dashboard / console** → wrap it in `AppShell(Sidebar(...), [...])`.
  The sidebar persists across content, which is what makes a surface feel like an
  application.
- **Website / marketing / docs page** → a top `Navbar` plus stacked `Section`s
  inside a `Container`, closing with a `Footer`. **Never an `AppShell`** — a
  marketing page with a fixed left rail looks broken.

## Theme awareness — write tone-first, never colour-first

The host page picks one of eleven built-in themes, under fifteen names, or supplies a
partial token map. **A program must work on every one of them** — including the
dark ones, which is the failure mode a hard-coded colour hits first.

Four come as a light and a dark variant, and the bare name means the light one, so
`shadcn` is `shadcn-light`. Three of those re-create a design system you already
know; `signal` is the library's own.

| Theme | Vibe | Use for |
| --- | --- | --- |
| `light` | Crisp default, indigo accent, soft shadows. | Most business apps, dashboards, settings. |
| `dark` | Standard dark surface, indigo accent. | Night mode, code-heavy workflows, ops dashboards. |
| `shadcn` · `shadcn-light` · `shadcn-dark` | shadcn/ui's default neutral theme — white page, ink primary, one flat grey wash, 8px controls in 14px cards, hairline borders, Geist. | Anything that should look shadcn-built: app dashboards, admin panels, developer tools. |
| `mui` · `mui-light` · `mui-dark` | Material UI's default theme — `#1976d2` primary, 4px radii, UPPERCASE buttons, borderless Paper on elevation shadows, tall outlined fields, Roboto. | Enterprise apps, internal tools, anywhere the house style is Material. |
| `heroui` · `heroui-light` · `heroui-dark` | HeroUI — `#006fee` primary, 12–14px corners, borderless cards on soft shadows, filled fields, hover that dims rather than recolours, Inter at 16px. | Consumer products, marketing apps, anything rounded and modern. |
| `signal` · `signal-light` · `signal-dark` | The instrument console. Colour is reserved for status and data and never used on furniture; graphite chrome, hairline panels with no shadows, 13px IBM Plex Sans on a 3/6/10/14 ramp, every measured value monospace and tabular. The densest theme in the set. | Observability dashboards, NOC and status walls, trading and ops desks, log and telemetry viewers, control planes. |
| `soft` | Friendly, light, rounded. Lavender + mint, generous radii. | Onboarding, wellness, education, consumer apps. |

Rules:

- **Pass `variant` / `tone`, never a colour.** `Badge("Active", { variant: "success" })`.
- **Stick to the semantic palette** — `default`, `primary`, `success`, `warning`,
  `danger`, `info`. Anything else (`"red"`, `"#ff0000"`) falls back to the default
  tone. (`Pill` additionally accepts the enterprise vocabulary `neutral`,
  `activating`, `promoting`, `critical`, `corporate`.)
- **Icons are accents, not colour** — an icon adopts the surrounding tone token.
- **Trust the chart palette.** `Series` colours come from the theme
  (`chart1`…`chart6`). Never pass a `stroke` or `fill`.
- **Let the theme own the personality.** Don't nest gradients or hand-roll
  surfaces.

## In-script theming with `$theme({…})`

When the user explicitly asks for a brand or product feel ("make it look like
GitHub", "use our company colours"), emit a bare `$theme({…})` statement — no
binding needed — **before** `$app(...)`, so tokens are in place as the rest
streams in.

```aktion
$theme({
  colors: {
    primary: "#0969da",
    primaryHover: "#0860c4",
    accent: "#1f6feb",
    bg: "#ffffff",
    text: "#1f2328",
    textMuted: "#656d76",
    border: "#d0d7de"
  },
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    weightHeading: "500"
  },
  radius: { button: "6px", input: "6px" }
})

$app(Container([
  PageHeader("Repositories", { subtitle: "Themed to match the host brand" }),
  Card([SectionHeader("Recent"), List(["aktion", "docs", "examples"])]),
]))
```

Rules:

- `$theme(...)` takes the **structured form**. The ten valid top-level groups are
  `colors`, `radius`, `font`, `fonts`, `spacing`, `shadows`, `gradients`,
  `zIndex`, `motion`, `icons`, plus the metadata keys `name` and `direction`.
  Flat keys (`$theme({ colorPrimary: … })`) raise a schema error — the flat shape
  was removed in 0.5.
- **Unknown keys inside a group fail silently**, so typos are invisible. Check
  names against [`themes.md`](themes.md).
- Every value is a **string**.
- **Don't double-pay tokens.** If `$theme(...)` sets `colors.primary`, don't also
  pass `tone: "primary"` overrides on individual components to compensate.
- Removing the `$theme(...)` line snaps the UI back to the base theme.

## Anti-patterns — never ship these

| Wrong | Right |
| --- | --- |
| A single `Card([CardHeader, Text])` for a "dashboard" request | The dashboard recipe in [`patterns.md`](patterns.md) |
| A vertical stack of `StatCard`s | `Stats([StatCard(...), ...])` |
| `Stack([...], { direction: "row" })` for a toolbar | `Row([...], { gap, justify })` — natural widths, vertically centred |
| A wrapping `Row` for uniform tiles | `Grid(items, { columns, gap })` |
| `Text("Label: " + value)` lines on a detail page | `DescriptionList([DescriptionItem(label, value)])` |
| A `Table` with nothing above it | `Card([SectionHeader(...), Toolbar({...}), Table(...)])` |
| A flat form on the page | `FormSection`s inside Cards |
| A settings page with no sectioning | One Card per concern (General, Notifications, Billing, Danger zone) |
| Plain text for status / priority / count | `Badge`, `Pill`, or `StatusDot` |
| No navigation on a multi-page surface | `AppShell(Sidebar(...), [...])` |
| An empty list rendered as grey text | `EmptyState(title, { description, icon, actions })` |
| A hand-rolled progress bar | `Progress(value, { max, label, tone })` or `ProgressRing(...)` |
| `loading ? Spinner() : content` around an `$http` resource | `Async(resource, { loading, error, empty, data })` |
| `Stack` used where direction never changes | `Column` or `Row` — reserve `Stack` for responsive direction maps |

`Stack` is the responsive escape hatch. Use it **only** when the direction itself
must change across breakpoints:

```aktion
$app(Stack([
  Card([SectionHeader("Filters"), Text("Narrow the list")]),
  Card([SectionHeader("Results"), List(["One", "Two", "Three"])]),
], { direction: { base: "column", md: "row" }, gap: "lg" }))
```
