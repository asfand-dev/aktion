# Streaming UI Script — Language & Component Audit

> Generated from a full codebase review (parser, runtime, builtins, component library, themes, routing, prompts).  
> **Scope:** ~130 registered components, ~45 `@`-builtins + action/iteration steps, seven themes.  
> **Goal:** Reduce redundancy, close layout gaps (especially `Stack` / `Grid`), and make rich UIs easier for LLMs and developers.

## Implementation status (completed)

The following items from this audit were **implemented** in the codebase (no deprecation flags — removed or merged directly):

| Area | Done |
|------|------|
| **Language** | Removed `@Push`, `@Concat`, `@Take`, `@Map`, `@FormatCurrency`, `@FormatNumber`, case builtins → `@Case`; added `@Join`, `@Split`, `@Trim`, `@Replace`, `@Substring`, `@StartsWith`, `@EndsWith`, `@Contains`, `@Match`, `@Pow`, `@Sqrt`, `@Random`, `@Log`, `@FilterBy`, `@AddHours`, `@DiffDays`, `@StartOfWeek`, `@EndOfMonth`, `@Const`; bracket access `obj[$key]` / `arr[i]`; lazy ternary; trailing-object named component args |
| **Layout** | `StackItem`, `GridItem`, `Box`; `Stack` gains `reverse`, `uniform`, `inline`, `padding`, `alignContent`, responsive `align`/`justify`, `justify="evenly"`; `Grid` 12-column mode + fractional spans (`"1/2"`…`"1/12"`) |
| **Components removed** | `BreadcrumbPageHeader`, `Toasts`, `StepsItem`, `Section`, `CardBody`, `Toggle`, `SegmentedControl`, `OtpInput`, `AreaChart`, `AuditTrail`, `Cover`, `MetricGrid`, `Sheet` (use `Drawer`) |
| **Components merged** | `Hero(layout="cover")`, `Stats(layout="grid")`, `ActivityLog(variant="audit")`, `LineChart(filled=true)` |
| **Components added** | `IconButton`, `CommandPalette`, `FilterChips`, `FieldRepeater`, `VirtualList`, `QueryBuilder`, `DiffViewer`, `JsonTree`, `Gantt`, `Truncate`, `InlineEdit`, `NotificationBell` |
| **Docs** | `README.md`, `coding-gen-skill.md`, `src/prompt/generator.ts`, `docs/assets/live-example.js`, demo tests updated |

**Still open** (not yet implemented): `Effect`/`Watch`, host-registerable builtins, `Query` error surface, virtualization in `DataGrid`, DnD Kanban, full `Notice`/`Header` unification, `ctx.toast()`, anchored `Tour`/`Spotlight`.

---

## Table of contents

1. [Executive summary](#executive-summary)
2. [Language — redundant / optimizable features](#language--redundant--optimizable-features)
3. [Language — missing features](#language--missing-features)
4. [Components — redundant / candidates for removal](#components--redundant--candidates-for-removal)
5. [Components — improvements to existing](#components--improvements-to-existing)
6. [Components — missing (recommended additions)](#components--missing-recommended-additions)
7. [Stack & Grid — current limits](#stack--grid--current-limits)
8. [Stack & Grid — improvement proposals](#stack--grid--improvement-proposals)
9. [Prioritized roadmap](#prioritized-roadmap)

---

## Executive summary

| Area | Finding |
|------|---------|
| **Language** | Solid expression grammar and reactive model. Main waste: overlapping builtins (`@Push`/`@Concat` vs spread), eager ternary vs lazy `@If`, and no `obj[key]` / array indexing. |
| **Components** | ~140 components with many overlapping families (notices, headers, loading, toggles, quotes). Several are pure aliases or one-class wrappers. |
| **Layout** | `Stack` already has flex-like `align` / `justify` / `wrap`, but lacks `grow`, `basis`, `reverse`, responsive align/justify, and per-child flex. `Grid` is equal-column only — no per-child span or fractional widths (1/2, 1/3, … 1/12). |
| **DX** | Chat prompt still lists removed components (`Divider`, `Header`, `Tag`, `Alert`, `Note`). Positional-only args are the #1 LLM footgun. |

---

## Language — redundant / optimizable features

### High confidence — safe to deprecate or merge

| Feature | Overlaps with | Recommendation |
|---------|---------------|----------------|
| `[...$arr, x]` | `[...$arr, x]` (spread in grammar) | Deprecate; document spread in skill/prompt. |
| `[...a, ...b]` | `[...a, ...b]` | Deprecate. |
| `@Slice(arr, 0, n)` | `@Slice(arr, 0, n)` | Remove `@Take`; keep `@Slice` only. |
| `arr.field` | Array pluck: `$rows.title` (`evaluator.ts`) | Deprecate `@Map`; document pluck as canonical. |
| `@FormatCurrency` / `@FormatNumber` | `@Format(value, mode, …)` | Merge into `@Format` with clearer param names (avoid overloaded 3rd arg). |
| `@Camelcase` / `@Snakecase` / `@Kebabcase` / `@Pascalcase` | Same `recase()` helper | Single `@Case(value, "camel"\|"snake"\|…)`. |
| Eager ternary `a ? b : c` | Lazy `@If(a, b, c)` | Make ternary lazy for UI branches, or restrict ternary to pure values in docs/lint. |
| `$x` + `$$x` (one namespace) | Could be `$x` + `persistent` flag | Unify sigils long-term; keep `$$` as alias during migration. |
| `@Each` destructure as string | `"row, {id, name}"` mini-parser | Parse destructuring in main grammar: `@Each($items, {id, name}, row, …)`. |

### Medium confidence — simplify authoring surface

| Feature | Issue | Recommendation |
|---------|-------|----------------|
| Action step registry duplicated | `builtins.ts` + `evaluator.ts` switch | Single source of truth; generate evaluator dispatch from catalog. |
| `@Run(name)` bare identifier | Other steps take expressions | Allow `@Run(mutationRef)` or `mutation()`-style for consistency. |
| `Query` / `Mutation` / `Routes` / `Theme` / `Action` special-cased in evaluator | Parallel to `ComponentNode` union | Model as components or one `MetaNode` type to reduce name-based switches. |
| `params` for routing | Hard-coded loop-var bind vs `@Each` machinery | Reuse loop-var bind/restore from `@Each`. |
| Route truth: `Router.currentPath` vs `state.get("route")` | Two sources | Single source: router writes `$route` only. |
| Chat prompt component list | References `Divider`, `Header`, `Tag`, `TagBlock`, `Alert`, `Note` (removed) | Derive allowlist from library tags or fix list (`Separator`, `TextContent`, `Badge`, `Callout`, …). |
| Size tokens | `xs/sm/md/lg/xl` vs Button `small/normal/large` vs Skeleton variants | Normalize on `xs–xl`; alias legacy sizes internally. |

### Low priority — document rather than remove

| Feature | Note |
|---------|------|
| Macros (single-expression only) | Fine for DSL; document when `@Js` is required. |
| `null` vs `undefined` | Coerced equally; document for LLMs. |
| Optional chaining `?.` | Keep; underused in examples. |
| Template literals | Keep; promote for multi-line `@Js` bodies. |

---

## Language — missing features

### Syntax & expressions (high impact)

| Feature | Why it matters |
|---------|----------------|
| **Bracket / computed member access** `obj[$key]`, `arr[$i]` | Dynamic keys today need `@Pick`, `@Switch`, or `@Js`. |
| **Array index access** `arr[0]`, negative index | Only `.first` / `.last` shortcuts exist. |
| **Named / keyword arguments** for components | Positional args cause most LLM render bugs; options object as last arg would help. |
| **Parse-time component name validation** | Typos silently render `null`. |
| **Lazy ternary** (or lint against eager ternary in UI) | Prevents evaluating branches that reference `@Each` loop vars. |

### String, math, collections (medium impact)

| Feature | Why it matters |
|---------|----------------|
| `@Join`, `@Split`, `@Trim`, `@Replace`, `@Substring` | Trivial string ops force `@Js`. |
| `@Contains`, `@StartsWith`, `@EndsWith` | Filter/search UIs. |
| `@Match` / regex helper | Validation, parsing. |
| `@Pow`, `@Sqrt`, `@Random`, `@Log` | Charts and simulations. |
| `@FilterBy(arr, predicate)` or expression predicates | `(field, op, value)` triple is limiting. |
| `@DiffDays`, `@AddHours`, `@StartOfWeek`, `@EndOfMonth` | Scheduling beyond `@AddDays`. |

### Runtime & DX (medium impact)

| Feature | Why it matters |
|---------|----------------|
| **`Query` error surface** (`$queryError`, `loading`, `empty`) | Failures silently fall back to defaults. |
| **`@Const` / one-shot bindings** | Recompute everything on every dep change. |
| **`Effect` / `Watch($x, fn)`** | Lighter than `Script("id", …)` for simple side effects. |
| **Host-registerable `@` builtins** with dep tracking | Extensibility without `@Js`. |
| **Scoped namespaces** per response region | Flat namespace collisions in large apps. |
| **Structured action logging** | Host observability beyond `assistant-message`. |
| **Source locations in runtime errors** | `ComponentNode.source` exists but underused. |

### Async (lower priority for v1)

| Feature | Why it matters |
|---------|----------------|
| Declarative `await` in expressions | Only `@Js` can await today. |
| `try` / `catch` in actions | Multi-step flows with failure branches. |

---

## Components — redundant / candidates for removal

> **Policy:** Prefer deprecation + aliases over hard breaks. Update `coding-gen-skill.md`, README, and prompts when removing.

### Remove or alias (high confidence)

| Component | Reason | Replacement |
|-----------|--------|-------------|
| `Drawer` | Literal alias of `Sheet` (`advanced-patterns.ts`) | Keep `Drawer` as canonical name; make `Sheet` the alias (docs already prefer `Drawer`). |
| `BreadcrumbPageHeader` | Calls `PageHeader.render` with derived breadcrumbs | `PageHeader(breadcrumbs=path, …)` or snippet only. |
| `Toasts` | `Toast(position=…)` already pins to viewport | Document `Toast` list pattern; deprecate `Toasts`. |
| `StepsItem` | Marked back-compat; `Steps` accepts object items | Remove from prompt; keep render compat. |
| `Section` | Thin `<section>` + optional `<h3>` | `Card` + `SectionHeader` or `Container`. |
| `CardBody` | One-class wrapper | Children directly in `Card`. |
| `Toggle` (standalone) | Overlaps `Switch` | `Switch` for booleans; keep `ToggleGroup` only if needed. |
| `SegmentedControl` **or** `ToggleGroup` | Same “pick one of N” model | Pick one; deprecate the other. |
| `OtpInput` | Documented as canonical 6-digit `PinInput` | `PinInput(length=6, autocomplete=one-time-code)`. |
| `LineChart` + `AreaChart` | Same data; `filled` flag differs | `LineChart(…, filled=true)`. |
| `AuditTrail` | Nearly identical to `ActivityLog` (+ `meta`, monospace CSS) | `ActivityLog(variant="audit", …)`. |
| `Hero` **or** `Cover` | Same marketing header family | `Hero(media=imageSrc, …)` with optional background. |
| `MetricGrid` **or** `Stats` | Both render KPI rows | `Stats(items, layout="grid"\|"strip")`. |

### Consolidate families (medium confidence)

| Family | Overlap | Suggestion |
|--------|---------|------------|
| **Notices** | `Banner`, `Callout`, `Notification`, `Toast` | One `Notice` with `placement` + `dismissible`; keep thin aliases. |
| **Quotes** | `Quote`, `Testimonial`, `Comment`, `ChatBubble` | `Quote` + `author` / `role` / `rating` / `from` props. |
| **Loading** | `Spinner`, `Skeleton`, `Progress(indeterminate)`, `ProgressRing(indeterminate)`, `LoadingState` | Document decision tree; merge tiny inline cases. |
| **Headers** | `PageHeader`, `SectionHeader`, `TopBar`, `Navbar` | `Header(level="page"\|"section"\|"bar", …)`. |
| **Feeds** | `Timeline`, `ActivityLog`, `AuditTrail` | `Timeline(entries, variant="activity"\|"audit")`. |
| **Tables** | `Table`, `DataGrid` | `Table(mode="advanced", sort, filter, …)` or keep both with clearer “when to use”. |
| **Multi-select** | `MultiSelect`, `CheckBoxGroup` | Same bound array; differ only in UI chrome. |
| **Combobox** | `Combobox`, `Select` + filter | `Select(searchable=true)`. |

### Thin child components (low priority — expand object shorthand instead)

Consider accepting `{label, …}` objects on parents (like `Steps`, `Breadcrumb`, `Toolbar` already do) and stop prompting for: `SelectItem`, `CheckBoxItem`, `FollowUpItem`, `FeatureItem`, `TimelineItem`, `KanbanCard`, `KanbanColumn`, `PricingCard`, `DescriptionItem`, `MenuItem` (keep for `DropdownMenu` slot typing if needed).

---

## Components — improvements to existing

| Component | Improvement |
|-----------|-------------|
| **`Button`** | `loading=true`, `iconOnly=true`, `iconPosition`, `fullWidth`; unify size to `xs–xl`. |
| **`Form` / `FormControl`** | Per-field `error` prop; bind validation to `$errors` map; async validator hook via `@Js` or builtin. |
| **`DataGrid`** | Optional inline cell edit; column resize; export CSV action slot. |
| **`Table` / `Col`** | `Col(width?, minWidth?, sticky?)`; document that sort/filter props apply only in `DataGrid`. |
| **`KanbanBoard`** | Drag-and-drop reorder (even column-only); `onMove` action. |
| **`InfiniteList`** | True windowing / virtualization for 1k+ rows. |
| **`Markdown`** | `copyable` on fenced blocks to reduce `CodeBlock` usage. |
| **`EmptyState`** | Built-in illustration presets (not just keyword icons). |
| **`Tour` / `Spotlight`** | Anchor to selector / ref, not only centered overlay. |
| **`Toast`** | `ctx.toast({ title, tone })` from `Script` / `@Js`. |
| **`SearchBar`** | Optional `CommandPalette` mode (modal + fuzzy list). |
| **`Rating`** | Already strong; expose in chat prompt. |
| **`FileUpload`** | Progress per file; preview thumbnails. |
| **`CalendarView`** | Drag to create events; week/day density. |
| **`RichTextEditor`** | Markdown round-trip or `MarkdownEditor` variant. |
| **All form inputs** | Consistent `disabled`, `readOnly`, `hint`, `error` slots on every control. |

---

## Components — missing (recommended additions)

### Tier 1 — unlock most SaaS layouts

| Component | Purpose |
|-----------|---------|
| **`GridItem` / `Col` layout child** | Per-child `span`, `offset`, `width` (see Stack & Grid section). |
| **`Flex` / enhanced `Stack`** | Full flexbox surface (grow, shrink, basis, order). |
| **`Box`** | Padding, margin, border, background semantic tokens — layout spacing without raw CSS. |
| **`IconButton`** | Icon-only `Button` with accessible `label`. |
| **`CommandPalette`** | Cmd-K searchable actions (complements `SearchBar`). |
| **`FilterChips`** | Applied filters with remove + clear-all. |
| **`FieldRepeater`** | Dynamic add/remove rows (line items, contacts). |

### Tier 2 — data-heavy & admin UIs

| Component | Purpose |
|-----------|---------|
| **`VirtualList` / `VirtualTable`** | Performance for large datasets. |
| **`QueryBuilder`** | Visual AND/OR filter builder. |
| **`DiffViewer`** | Side-by-side or unified diff. |
| **`JsonTree`** | Collapsible object/array inspector. |
| **`EditableCell` / `EditableGrid`** | Spreadsheet-style editing. |
| **`Gantt` / `ScheduleTimeline`** | Horizontal task timeline (beyond `CalendarView`). |

### Tier 3 — polish & niche

| Component | Purpose |
|-----------|---------|
| **`Truncate` / `ShowMore`** | Long text collapse. |
| **`InlineEdit`** | Click-to-edit single line. |
| **`ImageCropper` / `SignaturePad`** | Capture flows. |
| **`FlowChart` / `NodeGraph`** | Simple diagrams (nodes + edges). |
| **`PresenceAvatars`** | Live “viewing” strip. |
| **`NotificationBell`** | Compact inbox trigger → `InboxPanel`. |
| **`MarkdownEditor`** | WYSIWYG or split preview. |
| **`PivotTable`** | Cross-tab summaries. |

---

## Stack & Grid — current limits

### `Stack` today (`layout.ts`, `styles.ts`)

**Props:** `children`, `direction` (`column` \| `row` + responsive map), `gap` (xs–xl + responsive), `align` (`start` \| `center` \| `end` \| `stretch`), `justify` (`start` \| `center` \| `end` \| `between` \| `around`), `wrap` (boolean).

**Already works:** Basic flexbox main/cross alignment, responsive direction/gap via CSS variables, wrap.

**Gaps vs typical flexbox / layout needs:**

| Gap | Impact |
|-----|--------|
| No `align` / `justify` responsive maps | Can't center on mobile, space-between on desktop without nested stacks. |
| No `gap` as raw CSS length in docs (only tokens) | Fine for themes; document raw lengths where supported. |
| No `reverse` | Common for chat timelines (column-reverse). |
| No per-child `grow` / `shrink` / `basis` / `alignSelf` | Row stacks force `flex: 1 1 auto` on all children (`styles.ts:155`) — breaks toolbars (partially patched for badges/icons). |
| No `inline` stack | Inline flex for chip rows next to text. |
| No `padding` / `maxWidth` on container | Authors nest `Container` + `Stack` manually. |
| `justify: "around"` only | Missing `evenly` (`space-evenly`). |
| No `alignContent` for multi-line wrap | Wrapped rows can't align as a group. |

### `Grid` today (`layout.ts`, `styles.ts`)

**Props:** `children`, `columns` (1–12 or responsive map), `gap`, `minItemWidth` (auto-fit fallback).

**Already works:** Equal-width columns, responsive column counts, auto-fit card walls.

**Gaps vs Bootstrap / CSS Grid layouts:**

| Gap | Impact |
|-----|--------|
| **Equal columns only** | Cannot do sidebar (1/4) + main (3/4) or asymmetric dashboards. |
| **No per-child span** | No “this card spans 2 columns”. |
| **No fractional widths** | No 1/2, 1/3, …, 1/12 per column or per child. |
| **No row gap / column gap split** | Single `gap` only. |
| **No `areas` / named template** | App shells need nested grids. |
| **No `alignItems` / `justifyItems`** | Cell content alignment inside grid cells. |
| **`minItemWidth` ignored when `columns` set** | Can't combine fixed column count with min child width. |
| **No `Container` integration** | Page width vs grid width left to author. |

---

## Stack & Grid — improvement proposals

### A. Enhance `Stack` (flexbox-complete for LLM authoring)

#### A.1 New props (container)

| Prop | Values | Maps to |
|------|--------|---------|
| `reverse` | `boolean` | `flex-direction: *-reverse` |
| `justify` | add `evenly` | `space-evenly` |
| `alignContent` | `start` \| `center` \| `end` \| `between` \| `around` \| `stretch` | Multi-line wrap alignment |
| `align` / `justify` | responsive maps `{ sm: "center", lg: "between" }` | Same pattern as `direction` |
| `padding` | `none` \| `xs`–`xl` \| responsive map | Theme spacing on container |
| `inline` | `boolean` | `display: inline-flex` |

#### A.2 New component: `StackItem` (or `FlexItem`)

Wrap any child to control flex item without `@Js`:

```text
Stack(direction="row", justify="between", [
  StackItem(child, grow=0),
  Logo(),
  StackItem(child, grow=1),
  SearchBar(...),
  StackItem(child, grow=0),
  Avatar(...)
])
```

| `StackItem` prop | Values |
|----------------|--------|
| `grow` | `0` \| `1` \| number |
| `shrink` | `0` \| `1` |
| `basis` | `auto` \| `0` \| CSS length |
| `alignSelf` | `start` \| `center` \| `end` \| `stretch` |
| `order` | number |
| `minWidth` / `maxWidth` | CSS length |

**Implementation:** Render wrapper `div.rui-stack-item` with `data-grow`, etc.; CSS maps to flex longhands. Default row-stack rule `> * { flex: 1 1 auto }` becomes `> *:not(.rui-stack-item)` or only when `uniform=true` on `Stack`.

#### A.3 `Stack(uniform?)`

- `uniform=true` (default for backward compat on row): children share space equally.
- `uniform=false`: children size to content unless wrapped in `StackItem`.

---

### B. Enhance `Grid` (12-column + spans)

#### B.1 Twelve-column system (Bootstrap-like)

Introduce constant `GRID_COLUMNS = 12`. Two authoring styles (pick one primary for LLMs):

**Style 1 — `Grid` + `GridItem` (recommended for LLMs)**

```text
Grid(columns=12, gap="m", [
  GridItem(child, span=3),   // sidebar 3/12
  SidebarNav(),
  GridItem(child, span=9),   // main 9/12
  MainContent()
])
```

**Style 2 — shorthand on `Grid` children via array of specs**

```text
Grid([
  { span: 3, content: SidebarNav() },
  { span: 9, content: MainContent() }
])
```

#### B.2 `GridItem` props

| Prop | Description |
|------|-------------|
| `span` | Columns occupied at `base` (1–12) |
| `offset` | Empty columns before item (0–11) |
| `spanAt` / responsive map | `{ sm: 12, md: 6, lg: 4 }` → CSS vars `--rui-grid-span-sm: 6` |
| `start` / `end` | Optional line-based placement (advanced) |
| `align` / `justify` | Item-level cell alignment |

**CSS approach:** Parent `display: grid; grid-template-columns: repeat(12, minmax(0, 1fr));` Children `grid-column: span var(--rui-grid-item-span, 1)`.

#### B.3 Fractional width aliases (authoring sugar)

Accept string fractions on `GridItem` / `span`:

| Author writes | Resolved span (12-col) |
|---------------|------------------------|
| `"1/2"` | 6 |
| `"1/3"` | 4 |
| `"2/3"` | 8 |
| `"1/4"` | 3 |
| `"3/4"` | 9 |
| `"1/5"` | `round(12/5)` → document as 2 or use subgrid |
| `"1/6"` | 2 |
| `"1/12"` … `"11/12"` | 1 … 11 |

Parser: `span="1/3"` → integer 4 at render time. Document table in skill file.

#### B.4 Keep existing `Grid(columns=n)` for equal columns

- `columns=4` → `repeat(4, 1fr)` (unchanged).
- `columns=12` + `GridItem(span=…)` → explicit 12-col mode (`data-grid-mode="12"`).
- When any child is `GridItem`, auto-enable 12-col mode if `columns` omitted.

#### B.5 Additional `Grid` container props

| Prop | Purpose |
|------|---------|
| `rows` | Fixed row count or `auto` |
| `rowGap` / `columnGap` | Split gaps (fallback to `gap`) |
| `alignItems` / `justifyItems` | Cell content alignment |
| `dense` | `grid-auto-flow: dense` for masonry-like packing |
| `minChildWidth` + `columns` | `repeat(auto-fill, minmax(min, 1fr))` with max column cap |

---

### C. Unified layout primitives (optional long-term)

| Primitive | Role |
|-----------|------|
| `Stack` | 1D flex |
| `Grid` | 2D equal or 12-col |
| `Box` | Spacing/surface wrapper |
| `Container` | Max-width page centering (exists) |
| `Split` | Alias for `ResizablePanels` or `SplitView` |

Document in skill: **“Pick Grid for 2D; Stack for 1D; never use `Stack(row, wrap=true)` for uniform tiles — use `Grid`.”**

---

### D. Example patterns after improvements

**Dashboard sidebar + main**

```text
root = Grid(columns=12, gap="l", [
  GridItem(Sidebar(), span="1/4"),
  GridItem(Stack([PageHeader(...), content]), span="3/4")
])
```

**Responsive marketing features**

```text
Grid(columns=12, gap="m", [
  GridItem(FeatureCard(...), spanAt={ base: 12, md: 6, lg: 4 }),
  GridItem(FeatureCard(...), spanAt={ base: 12, md: 6, lg: 4 }),
  GridItem(FeatureCard(...), spanAt={ base: 12, md: 6, lg: 4 })
])
```

**Toolbar (no unwanted flex grow)**

```text
Stack(direction="row", justify="between", uniform=false, [
  StackItem(Stack(direction="row", [filters...]), grow=0),
  StackItem(SearchBar(...), grow=1),
  StackItem(Button("Save"), grow=0)
])
```

---

## Prioritized roadmap

### Phase 1 — Quick wins (docs + prompt, no breaking changes)

1. Fix chat prompt dead component names (`generator.ts`).
2. Document Stack/Grid decision tree + existing `align`/`justify`.
3. Document array pluck vs `@Map`, spread vs `@Push`/`@Concat`.
4. Add “notice / loading / header” decision trees to `coding-gen-skill.md`.

### Phase 2 — Layout (highest user value)

1. `GridItem` with `span` / `offset` + 12-column mode.
2. Fractional aliases (`"1/2"`, `"1/3"`, … `"1/12"`).
3. `StackItem` with `grow` / `shrink` / `alignSelf`.
4. `Stack(uniform=false)` + fix row flex defaults.
5. Responsive `align` / `justify` on `Stack`.

### Phase 3 — Language ergonomics

1. Bracket access `obj[key]`, `arr[i]`.
2. Named args or trailing options object for components.
3. Lazy ternary or lint rule.
4. Deprecate redundant builtins (`@Push`, `@Take`, …).

### Phase 4 — Component consolidation

1. Merge notice/quote/loading families behind aliases.
2. Remove `Drawer`/`Sheet` duplication (one canonical).
3. Add Tier 1 missing components (`IconButton`, `CommandPalette`, `FieldRepeater`, …).

### Phase 5 — Advanced

1. Virtualized lists/tables.
2. DnD Kanban.
3. Host-registerable builtins.
4. Form validation model.

---

## Appendix — inventory snapshot

| Category | Count (approx.) |
|----------|-----------------|
| Registered components | ~140 |
| Data `@` builtins | ~45 |
| Action / iteration builtins | `@Run`, `@Set`, `@Reset`, `@ToAssistant`, `@OpenUrl`, `@Navigate`, `@Js`, `@Each`, `@If`, `@Switch` |
| Built-in themes | 7 |
| Responsive breakpoints | `base`, `sm`, `md`, `lg`, `xl` |

**Files reviewed:** `src/parser/*`, `src/runtime/*`, `src/library/**`, `src/theme/*`, `src/prompt/generator.ts`, `coding-gen-skill.md`, `src/theme/styles.ts` (Stack/Grid CSS).

---

*This document is advisory. Implementation should pair each change with tests (`tests/library.test.ts`, `tests/new-language-features.test.ts`, `tests/demos.test.ts`) and sync `coding-gen-skill.md` + `README.md` per workspace rules.*
