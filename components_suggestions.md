# Component Library Suggestions

A review of every component shipped from `src/library/components/*` to identify
redundancies, gaps, and improvement opportunities. The goal is a smaller,
sharper surface area that makes both the **LLM prompt** and **developer DX**
easier — fewer overlapping options, more obvious choices, and better coverage
of the patterns developers actually want to render.

The library currently exposes **131 components** across 12 groups. Several
components either duplicate each other, sit outside the natural choice
pipeline, or are so trivial they cost more in prompt budget than they save in
output. A handful of high-value patterns are missing entirely (DataGrid,
AreaChart, MultiSelect, DateRangePicker, Spinner, Calendar/Heatmap, …).

> **Sibling document:** `suggestions.md` covers cross-cutting language /
> code-organisation cleanups (sanitiser dedup, helper consolidation, etc.).
> This file focuses purely on the *component catalogue*.

---

## 1. Components to remove or merge

These either duplicate another component, can be replaced by a one-liner of
existing primitives, or live in such an awkward middle ground that the LLM
guesses wrong.

### 1.1 Header components — collapse 4 into 2

The library currently has **four** "header"-style components:

| Component | Where | Why it overlaps |
|---|---|---|
| `Header(title, subtitle?)` | `content.ts` | Just an `<h2>` + optional `<p>`. A degenerate `PageHeader` with no actions, breadcrumbs, or status. |
| `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)` | `patterns.ts` | The proper page-level header. |
| `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)` | `patterns.ts` | The proper inside-card header. |
| `CardHeader(title, subtitle?)` | `layout.ts` | Slot meant only for `Card`. |

**Suggestion:**
- **Remove `Header`** — strictly redundant with `PageHeader` (drop optional props) and trivially expressible as `TextContent(variant="title")`. The LLM keeps reaching for it instead of `PageHeader` because its name is shorter.
- **Keep `PageHeader`, `SectionHeader`, `CardHeader`** — each owns a clear slot (page top / inside-card section / Card slot).

### 1.2 `Section` — remove

`Section(children, title?)` is "render an `<section>` with an optional `<h3>`".
Already covered by `Container` + `SectionHeader`, or by a bare
`Stack(children=[Header(title), …])`. Removing it forces the LLM toward the
better-looking `SectionHeader` + `Card` composition.

### 1.3 `Divider` + `Separator` — merge into one

Two horizontal-rule components with overlapping responsibilities:
- `Divider(label?)` — supports a labeled center segment.
- `Separator(orientation?, decorative?)` — supports vertical orientation.

**Suggestion:** keep `Separator` and add `label` + `decorative` props to it;
delete `Divider`. Net result: one obvious component, both features.

### 1.4 `Alert` / `Callout` / `Note` / `Banner` — collapse to 2

Four "tinted notice with title + message + tone" components:

| Component | Distinguishing feature |
|---|---|
| `Alert(title, message?, variant?)` | Banner-style block. |
| `Callout(variant?, title, description?, icon?)` | Same plus icon. |
| `Note(content, tone?, icon?)` | Compact one-line variant of Callout. |
| `Banner(title, message?, action?, icon?, tone?)` | Full-width announcement, supports a CTA. |

**Suggestion:**
- **Keep `Callout`** as the inline notice (covers Alert + Note). Add
  `compact=true` for the Note shape and accept `description | message` as
  aliases.
- **Keep `Banner`** as the full-width, action-bearing announcement.
- **Remove `Alert` and `Note`** — both are subsets of the surviving two.

### 1.5 `Tag` + `Badge` — merge

`Tag(label, icon?, size?, variant?)` and `Badge(label, variant?)` render the
same pill. Tag adds icon and size; Badge is a stripped-down Tag.

**Suggestion:** keep `Badge` (shorter name, more familiar from shadcn-style
libs) and let it accept `icon` + `size`. Delete `Tag`. `TagBlock` becomes
`BadgeList` (or stays as a convenience alias).

### 1.6 `TagBlock` — keep but rename

`TagBlock(tags, variant?, size?)` is a row of badges from a string array.
Saves real LLM tokens vs. `Stack(direction="row", wrap=true, [Badge(...), …])`.
Worth keeping; rename to `BadgeList` once `Tag` is removed.

### 1.7 `Buttons` — remove

`Buttons(items, direction?)` is "a Stack of Buttons". `Stack(direction="row",
gap="s", [Button(…)])` is one extra prop and is more flexible (mixed
button/text/spacer content). Removing trims the catalogue without losing
anything.

### 1.8 `SectionBlock` — fold into `Section` (or remove)

`SectionBlock(title, description?, children)` from `chat.ts` is a chat-friendly
copy of `Section`. With `Section` gone (1.2), there is no need for a chat-only
duplicate either — use `Stack([Header(title), TextContent(description),
…children])` or rely on `SectionHeader` + `Card`.

### 1.9 `Steps` + `StepsItem` — fuse into one

`Steps(items=[StepsItem("Title", "Details"), …])` is the only consumer of
`StepsItem`. Adopt the `Stats` pattern and accept `[{title, details}]`
objects directly:

```
Steps([
  { title: "Sign up", details: "Create an account" },
  { title: "Connect", details: "Link your data source" },
])
```

Removes one component from the catalogue and saves prompt tokens.

### 1.10 `Comment` vs `ChatBubble` — keep both, but unify the prop names

Both render avatar + author + body + time + actions. Difference is alignment
(`from="me|agent|system"` for chat lanes vs. flat for `Comment`). They serve
different conversational contexts so keep both, but standardise:
- `body` (both) → `body`
- `avatarSrc` (both) → `avatarSrc`
- `time` (both) → `time`
- `actions` (Comment) → also expose on `ChatBubble`

Naming alignment alone halves the LLM's "which one do I pick" cost.

### 1.11 `Cover` vs `Hero` — keep both, separate the slots clearly

`Hero(title, subtitle, primary, secondary, eyebrow?, highlights?, imageSrc?, tone?)`
already accepts `imageSrc` for a side illustration; `Cover(title, imageSrc, …)`
is image-backed. Today the LLM picks between them by guessing.

**Suggestion:** keep both, but change `Hero` to error/no-op when `imageSrc` is
also passed (force the LLM toward `Cover` for image-backed). Add a
`background="image|tone"` prop on `Cover` for documentation.

### 1.12 `AvatarGroup` items handling — duplicate of `Avatar`

`AvatarGroup` accepts either `Avatar(...)` nodes or `{name, src}` objects and
internally re-renders each as an `Avatar`. Same pattern in `Stats` and
`Breadcrumb`. Document this once, drop the duplicate "render Avatar from raw
object" branch by using a shared `coerceToAvatarProps(item)` utility.

### 1.13 `Toasts` is mandatory wrapper for `Toast` — relax it

A standalone `Toast(...)` outside `Toasts(...)` is technically valid but won't
get position pinning. Add an optional `position` prop directly on `Toast` and
let callers skip `Toasts(...)` entirely for one-off notifications. Keeps
`Toasts(items, position)` for grouped stacks.

---

## 2. Components to add

These cover patterns that the LLM currently has to fake with `Stack` +
`TextContent`, or that come up so often in real product UIs that their
absence forces ugly workarounds.

### 2.1 Data + tables

- **`DataGrid`** — sortable headers, sticky first column / first row, row
  click action, selectable rows (`$selectedRowIds` binding), built-in
  pagination. The current `Table` is presentational only and does not scale
  past ~10 rows of demo data.
- **`Sparkline(values, tone?)`** — inline mini-chart for `StatCard`,
  `Stats`, table cells. Trivial SVG, huge UX win.
- **`Calendar / DateGrid(events)`** — month/week schedule view.
- **`Heatmap(values, max?)`** — GitHub-style activity calendar.

### 2.2 Charts

- **`AreaChart`** — filled-area variant of `LineChart` for cumulative
  metrics; one extra `<path fill>` from existing line-chart code.
- **`Gauge(value, max?, label?)`** — half-circle dial for SLOs, capacity,
  budget remaining. Currently `ProgressRing` is the closest fit but it is
  full-circle.
- **`ScatterChart`**, **`Histogram`**, **`RadarChart`** — round out the
  basic chart vocabulary so the LLM does not silently fall back to a bar or
  line chart for the wrong data shape.
- **Chart annotations** (target line, threshold band) on existing charts.

### 2.3 Forms

- **`MultiSelect(id, items, value, …)`** — multi-option `Combobox` that
  writes an array into the bound `$variable` and renders chips inside the
  trigger.
- **`TagInput(id, value, suggestions?)`** — editable tag list for keywords,
  emails, contributors. Currently faked with `Input` + manual `@Js` glue.
- **`DateRangePicker(id, from, to, …)`** — paired date picker with one
  shared popover.
- **`TimePicker` / `DateTimePicker`** — time-only and combined.
- **`ColorPicker(id, value)`** — swatch + hex input, very common in
  product/admin UIs.
- **`PasswordInput(id, value, …)`** — `Input` with a built-in show/hide
  toggle eye icon.
- **`PinInput(id, length, value)`** / **`OtpInput`** — one-character per box
  code entry.
- **`MaskedInput(id, mask, value, …)`** — phone, currency, credit card.
- **`MentionInput`** — textarea with `@user` autocomplete.
- **`FileUploadList`** — visual list of selected/uploading files with
  per-file progress, used alongside `FileUpload`.
- **`FormSection(label, helper?, items)`** / **`FieldSet(legend, items)`** —
  group fields inside a Form with proper spacing and an `<fieldset>` /
  `<legend>` (a11y win).

### 2.4 Feedback / status

- **`Spinner(size?, label?)`** — a one-line indeterminate loader. Currently
  the LLM uses `Skeleton` or `Progress(indeterminate=true)`, both of which
  are awkward for "loading something tiny inline".
- **`Counter(value, format?, duration?)`** — animated number readout for
  KPI dashboards.
- **`InlineEdit(value, action)`** — click-to-edit field. Common product
  pattern, not currently expressible.
- **`UploadProgress(value, max, status?)`** — uploads need a tone-aware,
  status-bearing progress (currently faked with `Progress` + `Tag`).

### 2.5 Navigation / layout

- **`CommandPalette(items, placeholder?, shortcut?)`** — Cmd+K palette.
  Critical for power-user UIs and the LLM has no current way to express it.
- **`ContextMenu(target, items)`** — right-click counterpart of
  `DropdownMenu`.
- **`SegmentedControl(id, items, value)`** — explicit view-mode toggler;
  visually distinct from `ToggleGroup`. Saves the LLM from mis-using
  `ToggleGroup` for view modes.
- **`Drawer`** — already exists as `Sheet`; **rename `Sheet` → `Drawer`**
  in a future major (Drawer is the dominant industry term and the docs use
  both interchangeably).
- **`Affix / Sticky(child, offset?)`** — pin a child to the viewport on
  scroll. Comes up for filter bars, table headers, "back to top" buttons.
- **`ScrollIndicator(target?)`** — top-of-page reading-progress bar.
- **`InfiniteList(items, onLoadMore)`** — accompanies `Pagination` for the
  scroll-to-load case.

### 2.6 Media

- **`Carousel(items, autoplay?)`** — swipeable horizontal item viewer.
- **`Gallery(items)`** + **`Lightbox(image)`** — image grid + modal viewer.
- **`VideoPlayer(src, poster?, captions?)`** — wraps HTML5 video.
- **`AudioPlayer(src, …)`** — audio counterpart.
- **`Map(latitude, longitude, zoom?)`** — static map preview (iframe-based)
  for "where is this" addresses.
- **`Diff(left, right, view?)`** — unified or side-by-side text diff for
  PR-review UIs.

### 2.7 Patterns / pages

- **`SearchResultList(items)`** — properly styled hits with snippet,
  highlighted match, and meta. Currently faked with `List` + `ListItem`.
- **`FilterBar(filters, onReset?)`** — chip group with "X active" reset
  affordance.
- **`ActivityLog(entries)`** / **`AuditTrail(entries)`** — purpose-built
  sibling of `Timeline` with stronger structure (actor, action, target,
  diff).
- **`ComparisonTable(rows, columns)`** — generic counterpart of
  `PricingTable` (feature matrix, plan compare, model compare).
- **`InfoCard(icon, title, body, action?)`** — a flexible "feature
  highlight" tile distinct from `FeatureItem` (which insists on a
  small-icon-disc shape).
- **`InboxPanel(notifications)`** — composes `Notification` cards with
  read/unread grouping and "mark all read".
- **`OnboardingChecklist(items)`** — common product pattern.

---

## 3. Components to improve

These exist but are too thin to satisfy real-world needs. Each item is a
small extension, not a redesign.

### 3.1 `Markdown`

Hand-rolled mini-parser in `content.ts:414`. Supports only **bold**,
*italic*, `code`, links, and `-`/`*` lists. Missing:

- Headings (`#`, `##`, `###`)
- Blockquotes (`>`)
- Multi-line fenced code blocks (```` ``` ````) — currently only inline
  `` ` `` is supported, which is a frequent LLM frustration
- Tables
- Numbered lists
- Images (`![alt](src)`) routed through `sanitiseImageSrc`
- Auto-linking bare URLs

Either (a) extend the parser, or (b) take a peer-dep on `marked` /
`micromark` and document the size/perf trade-off.

### 3.2 `Table` / `Col`

- **Sortable headers** (`sortable=true` on `Col`, optional bound `$sort`).
- **Sticky header / first column** for long tables.
- **Row click action** + `data-active` highlighting.
- **Empty state slot** instead of the literal "No data" text.
- **Per-column alignment** (`align="left|center|right"`).
- **Row striping / dense mode** (`density="compact|comfortable"` on `Table`).
- **Built-in pagination integration** (`pagination={ page: $page, perPage: 20 }`).

If the surface grows past Col count of 5, promote to a new **`DataGrid`**
component (see 2.1) and keep `Table` as the lightweight presentational one.

### 3.3 Charts (`BarChart`, `LineChart`, `PieChart`)

- **Axis labels** (`xLabel`, `yLabel`).
- **Stacked bar / 100% stacked** modes for `BarChart`.
- **Horizontal bar** orientation for `BarChart`.
- **Tooltips** beyond the SVG `<title>` fallback (consistent across charts).
- **Series visibility toggle** in the legend.
- **`yMin` / `yMax` / `formatTick`** props for full control.
- **`donut=true`** mode for `PieChart`.

### 3.4 `Form` / `FormControl`

- **Per-field error display** (`error` prop on `FormControl`).
- **Async validation** hook (current `applyValidations` only sets HTML5
  attributes).
- **Field `state` styling** (default / error / success / warning).
- **`inline=true` layout** for short inline forms.
- **`Form` accepts arbitrary child slots** (today it forces a strict
  `fields` + `buttons` shape — no room for a divider, helper text block,
  or subsection title between fields).

### 3.5 `Pagination`

- **`perPage` selector** + `$perPage` binding.
- **Total-count display** (`total=123 → "Showing 21–30 of 123"`).
- **Jump-to-page** input.
- **Compact variant** for tight toolbars.

### 3.6 `DatePicker` / `DateRangePicker`

The native `<input type="date">` is uneven across browsers (Safari shows
nothing on focus, Firefox renders a non-stylable picker). Either:
- Build a small popover-based picker that uses the existing `Popover` +
  `Calendar` component (after 2.1), or
- Document the trade-off and ship `DateRangePicker` first (highest demand).

### 3.7 `Combobox`

- **Multi-select mode** (chips inside trigger; bound value is an array).
- **Async `loadOptions(query)`** for server-driven suggestions.
- **Grouped options** (`groups=[{label, items}]`).
- **"Create new" affordance** when no match — common pattern.

### 3.8 `Tree` / `TreeNode`

- **Multi-select** (`selectable="single|multi"` + `$selected` array).
- **Search/filter** with match highlighting.
- **Lazy-load children** on expand (`loadChildren(node)`).
- **Drag-and-drop** between branches (large lift; can be a follow-up).

### 3.9 `Modal`

- **Footer slot** (today actions must live inside `children`).
- **`size="sm|md|lg|xl|full"`**.
- **Built-in close (×) button** (`Sheet` already has one — be consistent).
- **Close on backdrop click** (configurable, off by default).
- **Documented focus-trap** behaviour (likely already works via the
  morph reconciler, just needs a doc note).

### 3.10 `Sheet`

- **`size="sm|md|lg|full"`** (current width is fixed in CSS).
- **Rename to `Drawer`** in a future major version (industry standard).

### 3.11 `Tabs`

- **Keyboard navigation** (`ArrowLeft` / `ArrowRight` / `Home` / `End`)
  between tabs (only `tabindex` is set today).
- **Vertical orientation** for sidebar-style tabs.
- **Scrollable tab list** when overflowing horizontally.
- **Per-tab badge** prop on `TabItem` (count chip in the tab trigger).

### 3.12 `Sidebar` / `AppShell`

- **Collapsible/icon-only mode** with a `$collapsed` boolean for responsive
  layouts.
- **Mobile drawer toggle** — on narrow viewports, the sidebar should be a
  Sheet that opens via a hamburger button in the topbar.
- **`AppShell` right-side panel** for doc/inspector layouts.

### 3.13 `Toast` / `Toasts`

- **`helpers.toast(...)`** API exposed to `Script`s so JS can imperatively
  push toasts without round-tripping through `$toasts` + `@Push`.
- **Action button slot** on `Toast` already exists; document the pattern
  for "Undo" toasts in the skill file.

### 3.14 `KanbanBoard`

- **Drag-and-drop between columns** (the obvious missing capability).
  Stretch goal — large but high-impact for the "demo a real product UI"
  use case.

### 3.15 `Skeleton`

- **Variants**: `paragraph`, `card`, `table-row`, `avatar`, `image`.
- **`shape="rect|circle"`** + `width` prop.
- **Shimmer animation** (currently a static block).

### 3.16 `Image`

- **`fit="cover|contain"`** and **`ratio`** shorthand (so callers do not
  need an outer `AspectRatio`).
- **`fallback`** prop (text or icon) when `src` is missing or fails.

### 3.17 `CodeBlock`

- **Copy-to-clipboard button** — the description claims one exists but
  there is no implementation in `content.ts:246`.
- **Optional syntax highlighting** (toggle via prop; default off so we
  do not pull in highlight.js automatically).
- **Line numbers** + **line-range highlight**.

### 3.18 `Progress` / `ProgressRing`

- **`segmented`** variant (`Progress` of N steps with current).
- **Stripped / animated bar** styling for indeterminate clarity.
- **Buffer value** (`buffered` prop) for video / download progress.

### 3.19 `Rating`

- **Half-step interaction** when `interactive=true`.
- **Custom icon** (heart, thumb, fire) instead of star-only.

### 3.20 `Toolbar`

- **Middle slot** (`center` prop) for centered controls.
- **Overflow menu** — when `left`/`right` items don't fit, collapse
  trailing ones into a `…` `DropdownMenu` automatically.

### 3.21 `EmptyState`

- **Multiple action slot** — currently one `action` only; many real
  empty states have a primary + a secondary ("Try a sample" + "Read
  docs").
- **Illustration slot** for image/SVG instead of just an icon.

### 3.22 `Stats` / `MetricGrid` / `StatCard`

- **Sparkline slot** (`spark=[…]`) — see 2.1.
- **Footer trend line** + **comparison-to-previous** label.
- **Icon-leading variant** to align with `Tile`'s denser shape.

---

## 4. Cross-cutting consistency improvements

Even before adding/removing anything, the existing surface area has small
inconsistencies that make the LLM guess and developers double-check.

### 4.1 Standardise `tone` / `variant` / `color` naming

Today these names are used interchangeably for the same concept ("visual
accent"):

- `Badge` uses `variant`
- `Hero`, `Stats`, `Tile`, `Notification`, `KanbanCard`, `StatusDot` use `tone`
- `TextContent` uses `color`
- `Button` uses `variant`
- `Toast`, `Banner` use `tone`

**Suggestion:** standardise on one prop name across the catalogue. `tone` is
the most descriptive (variant says nothing about colour) and matches the
patterns in feedback components. Keep `variant` for *shape* differences
(e.g. `Button(variant="ghost|primary|secondary|danger")` is genuinely about
shape, not tone).

### 4.2 Standardise `size` enum values

- `Stack`, `Spacer`, `gap` props use `["xs", "s", "m", "l", "xl"]`
- `Avatar`, `Tag`, `Toggle`, `ToggleGroup`, `Rating`, `PersonChip`, `Kbd`,
  `Progress` use `["sm", "md", "lg"]` (or `["sm", "md", "lg", "xl"]`)
- `Button` uses `["small", "normal", "large"]`

**Suggestion:** lock one shared enum (`["xs","sm","md","lg","xl"]`),
deprecate `["small","normal","large"]` on `Button`, and run the rename in a
single sweep. Today the LLM emits `Button(size="small")` and `Tag(size="sm")`
in the same response.

### 4.3 Standardise tone enum values

Components mix `["primary","success","warning","danger","info"]` (no
default) with `["default","primary","success","warning","danger","info"]`
(adds default). A few add `"error"` as a synonym for `"danger"` (`Callout`
does this; nothing else does). Pick one and document it.

### 4.4 Standardise `value` / `model` two-way binding

`Switch`, `Checkbox`, `Slider`, `Combobox`, `Pagination` all use `value` for
the `$variable` slot. Good. But `CheckBoxGroup` uses `value` (object),
`Pagination` uses `page`, `Sheet` / `Modal` use `open`, `Toggle` uses
`value`. Mixed. Consider a shared convention: if the bound state is the
single thing the component is *for*, name the prop `value`; if the
component has multiple stateful inputs, document each binding explicitly.

### 4.5 Standardise icon / image safety

`renderIcon`, `sanitiseImageSrc`, and `sanitiseHref` are already used
consistently. Add lint-style guidance to the skill file: "any prop named
`icon` is a Font Awesome name; any prop named `*Src` is a URL routed
through `sanitiseImageSrc`; any prop named `href` / `to` is routed through
`sanitiseHref`." This is mostly already true — codifying it prevents drift.

### 4.6 Group naming

The catalogue groups are useful, but a few items live in surprising places:

- `Stats`, `Tile`, `Notification`, `Banner` are in `Patterns`, but
  `StatCard`, `Progress`, `ProgressRing`, `Pagination` are in `Data`.
  Move the KPI tiles together.
- `Sheet` lives in `Navigation` but is conceptually a `Modal` sibling
  (overlay). Move to `Layout` next to `Modal`.
- `Toast` / `Toasts` live in `Feedback & Media` but really belong with the
  notification family (`Banner`, `Notification`). Either fold all three into
  one "Notifications" sub-group, or document the distinctions clearly in
  one place.

### 4.7 Remove the `"any"` prop type where a real shape exists

`Stats(items)`, `ToggleGroup(items)`, `Combobox(items)`, `Form(buttons)`,
all use `type: "any"` or `"any[]"` in the spec. The skill file shows the
expected shape, but the spec itself does not. Tighten these to
`{label, value, hint?, tone?}[]`-style types so that:
- Editor tooling can autocomplete the inner keys.
- The system prompt can pass the constraint to the LLM verbatim.
- `findComponent` based validation could eventually catch shape errors.

---

## 5. Suggested rollout (low risk → high)

1. **No-op renames + dedup of headers / dividers / notices** (1.1, 1.2,
   1.3, 1.4, 1.5, 1.7, 1.8, 1.9). Each is independently mergeable, gated
   by a deprecation alias so existing prompts still work.
2. **Naming standardisation pass** (4.1, 4.2, 4.3) — accept old names as
   aliases for one minor release, drop in the next.
3. **Quick-win additions** that reuse existing primitives — `Spinner`,
   `Sparkline`, `MultiSelect`, `DateRangePicker`, `SegmentedControl`,
   `BadgeList` (rename of `TagBlock`).
4. **Component improvements that require no new files** — `Pagination`
   per-page selector, `Tabs` keyboard nav, `Toast.helpers.toast()`,
   `Skeleton` shapes, `Image` fit, `CodeBlock` copy button, `Modal` size +
   footer, `EmptyState` two actions.
5. **Larger additions** — `DataGrid`, `Calendar`, `Heatmap`, `Carousel`,
   `Gallery`, `CommandPalette`, `MentionInput`, `PasswordInput`,
   `PinInput`, `MaskedInput`.
6. **Long-tail improvements** — `KanbanBoard` drag-and-drop, `Tree` drag,
   chart annotations, real `Markdown` parser, syntax-highlighted
   `CodeBlock`.

After steps 1–4 the LLM-facing catalogue should be **smaller** (fewer
overlapping components), **more consistent** (one `tone` enum, one `size`
enum), and **more capable** (covers Spinner, MultiSelect, DateRangePicker,
Sparkline) — without breaking any existing prompt that uses the old
names.

> Every change above must be reflected in `coding-gen-skill.md` (component
> reference, intro counts, pattern letters) per
> `.cursor/rules/coding-gen-skill-sync.mdc`, and in `README.md` per
> `.cursor/rules/readme-sync.mdc`.

---

## Implementation status (May 2026)

Phases 1–4 of the rollout above have been implemented. Deprecated component
names have been **removed entirely** — call sites in this repo were migrated
to the canonical replacements via `scripts/migrate-deprecated.mjs`.

| Suggestion | Status | Notes |
|---|---|---|
| 1.1 Header → `PageHeader`/`SectionHeader` | DONE | `Header` removed. Use `PageHeader`, `SectionHeader`, or `TextContent(value, "large-heavy")`. |
| 1.2 `Section` removed | NOT DONE | Kept for now to avoid breaking demos. Marked secondary in docs. |
| 1.3 `Divider` → `Separator(label?)` | DONE | `Divider` removed. `Separator` carries the optional center `label`. |
| 1.4 `Alert`/`Note` → `Callout(compact?)` | DONE | `Alert` and `Note` removed. `Callout(variant, title, description, icon, compact?)` covers both. |
| 1.5 `Tag` → `Badge` | DONE | `Tag` removed. `Badge(label, variant?, icon?, size?)`. |
| 1.6 `TagBlock` → `BadgeList` | DONE | `TagBlock` removed. `BadgeList(labels, variant?, size?)`. |
| 1.7 `Buttons` | KEPT | Still rendered as a row wrapper of `Button` children. |
| 1.8 `Steps` accepts objects | DONE | `Steps([{title, details, active}])` is the canonical shape; `StepsItem(...)` still works. |
| 1.9 Standalone `Toast` | DONE | Pass `position` to render a single Toast pinned to a viewport corner. |
| 2.1 `DataGrid` | NOT DONE | Targeted for a future release. |
| 2.2 `Spinner` | DONE | `Spinner(size?, label?, tone?)`. |
| 2.3 `Sparkline` + `StatCard.spark` + `Stats.spark` | DONE | Shared inline SVG renderer. |
| 2.4 `Calendar`, `Heatmap` | NOT DONE | Future release. |
| 2.5 `Gallery`, `Carousel` | NOT DONE | Future release. |
| 2.6 `CommandPalette` | NOT DONE | Future release. |
| 2.7 `MultiSelect` | DONE | Chip-based selection with filter + max. |
| 2.8 `DateRangePicker` | DONE | Paired date inputs sharing min/max. |
| 2.9 `SegmentedControl` | DONE | `items`, `value`, `size`. |
| 2.10 `BadgeList` (replaces `TagBlock`) | DONE | Single canonical name. |
| 2.11 Specialised inputs (PIN, masked, password) | NOT DONE | Future release. |
| 3.1 `CodeBlock` copy + line numbers + highlight | DONE | All three props live. |
| 3.2 `Image` ratio / fit / fallback | DONE | `ratio="16:9"`, `fit`, `fallback`. |
| 3.3 `Skeleton` variants | DONE | `paragraph` / `card` / `table-row` / `avatar` / `image`. |
| 3.4 `Modal` size + footer + close | DONE | `size`, `footer`, `closable`, `closeOnBackdrop`. |
| 3.5 `EmptyState` actions + illustration | DONE | `actions[]` (preferred) + `illustration` (URL). |
| 3.6 `Pagination` total + perPage + compact | DONE | `total`, `perPage` ($variable), `perPageOptions`, `compact`. |
| 3.7 `Tabs` keyboard + badge + orientation | DONE | ←/→/↑/↓/Home/End; vertical orientation; `TabItem(badge?, icon?)`. |
| 3.8 `Toolbar` center slot | DONE | `Toolbar(left?, right?, center?)`. |
| 3.9 `Rating` half-step + icon families | DONE | `halfStep`, `icon=star|heart|thumb|fire|bolt|<custom>`. |
| 3.10 `Progress` segmented + buffered | DONE | `segments` strip + `buffered` secondary value. |
| 3.11 `Table` density + sticky + align + emptyLabel | DONE | All four props live; `Col` gains `align`. |
| 4.1 Single `tone` enum | DONE (soft) | New components use `tone`; some older props still accept `variant` for parity. |
| 4.2 Single `size` enum | DONE (soft) | `Button` accepts `sm`/`md`/`lg` + legacy; new components use `xs|sm|md|lg|xl`. |
| 4.3 Single `align` enum | NOT DONE | Per-component alignment props still vary. |
| 4.4 Better Markdown parser | DONE | Headings, blockquotes, fenced code, ordered lists, images, auto-link. |
| 4.5 Naming consistency | DONE | Legacy aliases removed; every component now ships under a single name. |

After phases 1–4 the catalogue is now richer (Spinner, Sparkline,
MultiSelect, DateRangePicker, SegmentedControl, BadgeList), more capable
(better `Pagination`, `Tabs`, `Modal`, `Toast`, `Progress`, `Rating`,
`Image`, `Skeleton`, `CodeBlock`, `Markdown`, `Table`), and has a
**single canonical name per component** — the legacy
`Header` / `Tag` / `TagBlock` / `Alert` / `Note` / `Divider` aliases were
fully removed from source, docs, and tests in this pass.
