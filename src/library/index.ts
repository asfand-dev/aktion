/**
 * Built-in component library for `<aktion-app>`.
 *
 * Exports a single `defaultLibrary` that ships with the package. Consumers can
 * extend it via `<aktion-app>.registerComponents([...])`.
 */

import { assertOnePositionalMax } from "./types.js";
import type { ComponentLibrary, ComponentSpec, ComponentGroup } from "./types.js";
import {
  Stack, StackItem, Row, Column, Center, Grid, GridItem, Box, Fragment, Card, CardHeader, CardFooter, CardSection, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps,
  AspectRatio, ScrollArea,
} from "./components/layout.js";
import {
  Text, TextContent, Image, Badge, BadgeList, Pill,
  Callout, CodeBlock, Skeleton, Markdown,
  Container, Spacer, Quote, Icon, Spinner, LoadingDots,
} from "./components/content.js";
import {
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, ButtonGroup, InputGroup, SearchBar,
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
  MultiSelect, DateRangePicker,
} from "./components/forms.js";
import {
  Table, Col, List, ListItem, StatCard, Tree, TreeNode, Sparkline,
} from "./components/data.js";
import { BarChart, LineChart, PieChart, Series } from "./components/charts.js";
import {
  SectionBlock, ListBlock, FollowUpBlock, FollowUpItem, ActionLink,
} from "./components/chat.js";
import {
  Avatar, AvatarGroup, Progress, Switch, ToggleGroup,
  Tooltip, HoverCard, Popover, Toast, Toasts, Kbd, Rating, ProgressRing, ChatBubble,
} from "./components/feedback.js";
import {
  Breadcrumb, BreadcrumbItem, Pagination, Navbar, NavbarItem,
} from "./components/navigation.js";
import {
  DropdownMenu, MenuItem, MenuSeparator, MenuLabel,
} from "./components/menu.js";
import {
  Hero, PageHeader, EmptyState,
  Timeline, TimelineItem, FeatureGrid, FeatureItem,
  Testimonial, ProfileCard, Comment, Banner,
  KanbanBoard, KanbanColumn, KanbanCard,
  SectionHeader, Toolbar, Sidebar, SidebarSection, SidebarItem,
  AppShell, SplitView, DescriptionList, DescriptionItem,
  StatusDot, PricingTable, PricingCard,
  MediaCard, Stats, Tile, Notification, PersonChip, ActionStripe,
} from "./components/patterns.js";
import {
  DataGrid, CalendarView, ActivityLog, ComparisonTable, InfiniteList,
} from "./components/advanced-data.js";
import {
  VideoPlayer, AudioPlayer, Carousel, Gallery, Lightbox, Map,
} from "./components/media.js";
import {
  RichTextEditor, CodeEditor, ContextMenu, ColorPicker,
} from "./components/editors.js";
import {
  Gauge, Heatmap, RadarChart, ScatterChart, Histogram,
} from "./components/advanced-charts.js";
import {
  PinInput, PasswordInput, TagInput, MentionInput,
  TimePicker, DateTimePicker, MaskedInput,
  FormSection, FieldSet, ValidationSummary, RequirementList, MultiStepForm,
} from "./components/advanced-forms.js";
import {
  InboxPanel, OnboardingChecklist, LoadingState, ErrorState, SuccessState,
  Tour, Spotlight, Sticky, ResizablePanels, MasonryGrid, Drawer, TopBar,
} from "./components/advanced-patterns.js";
import { NavLink } from "./components/router.js";
import {
  IconButton, CommandPalette, FilterChips, FilterPill, FieldRepeater,
  VirtualList, VirtualGrid, QueryBuilder, DiffViewer, JsonTree, Gantt,
  Truncate, InlineEdit, NotificationBell,
} from "./components/new-components.js";
import {
  Async, Show, Portal, Redirect, Lazy, ErrorBoundary,
} from "./components/helpers.js";
import { HTMLTag, Styles } from "./components/escape-hatch.js";
import { Mount, WebComponent } from "./components/interop.js";
import {
  OnClick, OnMouse, OnKeyboard, OnFocus, OnIntersect, OnMount, Css, Link,
} from "./components/wrappers.js";
import {
  GradientText, Display, Heading, Eyebrow, Section, Overlay, OverlayItem,
  Brand, NavBar, Footer, FooterColumn, LogoCloud, LogoChip,
  CountUp, Metric, MetricStrip, CodeWindow, BrowserFrame, Terminal,
  Backdrop, ThemeToggle, Swatch, CopyButton, SegmentedControl,
  FloatingActionButton, Prose, RelativeTime,
  PriceTag, QuantityStepper, ProductCard, TableOfContents, TypingIndicator,
  CountdownTimer, BackToTop,
} from "./components/marketing.js";
import {
  Split, Bento, BentoCell, Reveal, OnGesture, Sortable, Draggable, DropZone,
  Parallax, ReadingProgress, Transition, FlipList, RouteView,
} from "./components/layout-motion.js";
import {
  VisuallyHidden, SkipLink, LiveRegion, FocusTrap,
} from "./components/a11y.js";
import {
  QRCode, ReactionPicker, LiveCursor, TabBar, Cart,
} from "./components/wave3.js";
import { Calendar } from "./components/scheduling.js";
import {
  DrawingCanvas, SignaturePad,
} from "./components/canvas.js";
import {
  Svg, Sheet, BottomSheet, ConfirmDialog, PresenceAvatars, ShareButtons,
  AuthorByline, VariantSelector, OrderSummary, ScrollSpy, SpeedDial, Confetti,
  KbdShortcut, Lottie,
} from "./components/extras.js";

export * from "./types.js";
export * from "./registry.js";
export { validateProgramSchema, validateProgram } from "./validate.js";

const components: ComponentSpec[] = [
  Row, Column, Center, Stack, StackItem, Grid, GridItem, Box, Fragment, Card, CardHeader, CardFooter, CardSection, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps,
  AspectRatio, ScrollArea, Container, Spacer,
  Text, TextContent, Image, Link, Badge, BadgeList, Pill,
  Callout, CodeBlock, Skeleton, Markdown, Quote, Icon, Spinner, LoadingDots,
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, ButtonGroup, InputGroup, SearchBar,
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
  MultiSelect, DateRangePicker,
  Table, Col, List, ListItem, StatCard, Sparkline, Tree, TreeNode,
  BarChart, LineChart, PieChart, Series,
  SectionBlock, ListBlock, FollowUpBlock, FollowUpItem, ActionLink, ChatBubble,
  Avatar, AvatarGroup, Progress, ProgressRing, Switch, ToggleGroup,
  Tooltip, HoverCard, Popover, Toast, Toasts, Kbd, Rating,
  Breadcrumb, BreadcrumbItem, Pagination, Navbar, NavbarItem,
  DropdownMenu, MenuItem, MenuSeparator, MenuLabel,
  Hero, PageHeader, Stats, Tile, EmptyState,
  Timeline, TimelineItem, FeatureGrid, FeatureItem,
  Testimonial, ProfileCard, PersonChip, Comment, Banner, Notification, ActionStripe,
  MediaCard, KanbanBoard, KanbanColumn, KanbanCard,
  SectionHeader, Toolbar, Sidebar, SidebarSection, SidebarItem,
  AppShell, SplitView, DescriptionList, DescriptionItem,
  StatusDot, PricingTable, PricingCard,
  // Advanced data
  DataGrid, CalendarView, ActivityLog, ComparisonTable, InfiniteList,
  // Media
  VideoPlayer, AudioPlayer, Carousel, Gallery, Lightbox, Map,
  // Editors
  RichTextEditor, CodeEditor, ContextMenu, ColorPicker,
  // More charts
  Gauge, Heatmap, RadarChart, ScatterChart, Histogram,
  // Advanced forms
  PinInput, PasswordInput, TagInput, MentionInput,
  TimePicker, DateTimePicker, MaskedInput,
  FormSection, FieldSet, ValidationSummary, RequirementList, MultiStepForm,
  // Advanced patterns + state cards
  InboxPanel, OnboardingChecklist, LoadingState, ErrorState, SuccessState,
  Tour, Spotlight, Sticky, ResizablePanels, MasonryGrid, Drawer, TopBar,
  NavLink,
  IconButton, CommandPalette, FilterChips, FilterPill, FieldRepeater,
  VirtualList, VirtualGrid, QueryBuilder, DiffViewer, JsonTree, Gantt,
  Truncate, InlineEdit, NotificationBell,
  // Aktion 0.5 standard helpers
  Async, Show, Portal, Redirect, Lazy, ErrorBoundary,
  // Behavioural & styling wrappers.
  // `Link` is deliberately NOT repeated here: it is already registered above,
  // with the Content primitives. Registering it twice made `components.length`
  // one higher than the number of DISTINCT component names, which in turn made
  // every count derived from the array — the prompt, the skill reference, the
  // extension's description — off by one. (No literal counts in this comment:
  // they went stale the first time a component was added.)
  OnClick, OnMouse, OnKeyboard, OnFocus, OnIntersect, OnMount, Css,
  // Marketing / landing / utility composites (suggestions-global Parts II, VIII)
  GradientText, Display, Heading, Eyebrow, Section, Overlay, OverlayItem,
  Brand, NavBar, Footer, FooterColumn, LogoCloud, LogoChip,
  CountUp, Metric, MetricStrip, CodeWindow, BrowserFrame, Terminal,
  Backdrop, ThemeToggle, Swatch, CopyButton, SegmentedControl,
  FloatingActionButton, Prose, RelativeTime,
  PriceTag, QuantityStepper, ProductCard, TableOfContents, TypingIndicator,
  CountdownTimer, BackToTop,
  // Layout & motion (suggestions-global Parts II.2, III.2/3/4/5/6/7, IV.4)
  Split, Bento, BentoCell, Reveal, OnGesture, Sortable, Draggable, DropZone,
  Parallax, ReadingProgress, Transition, FlipList, RouteView,
  // Media / overlay / social / e-commerce / utility extras (Parts VIII, IX)
  Svg, Sheet, BottomSheet, ConfirmDialog, PresenceAvatars, ShareButtons,
  AuthorByline, VariantSelector, OrderSummary, ScrollSpy, SpeedDial, Confetti,
  KbdShortcut, Lottie,
  // Accessibility primitives (suggestions-global X.3)
  VisuallyHidden, SkipLink, LiveRegion, FocusTrap,
  // Wave-3: QR, reactions, presence, mobile tab bar, cart (VIII.2/4/8, XII.1)
  QRCode, ReactionPicker, LiveCursor, TabBar, Cart,
  // Scheduling (VIII.6)
  Calendar,
  // Interactive canvas / editor (VIII.7)
  DrawingCanvas, SignaturePad,
  // Escape hatches for raw HTML / CSS — last-resort primitives
  HTMLTag, Styles,
  // Imperative / third-party widget interop
  Mount, WebComponent,
];

const componentGroups: ComponentGroup[] = [
  {
    name: "Layout",
    components: [
      "Column", "Row", "Center", "Stack", "StackItem", "Grid", "GridItem",
      "Box", "Container", "Spacer",
      "Card", "CardHeader", "CardFooter", "CardSection", "Separator", "Tabs", "TabItem",
      "Accordion", "AccordionItem", "Modal", "Drawer", "Steps",
      "AspectRatio", "ScrollArea", "Sticky", "ResizablePanels", "MasonryGrid",
    
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "Fragment", "Section", "Split", "Bento", "BentoCell", "Overlay", "OverlayItem",
    ],
    notes: [
      "- THREE primitives cover almost everything: `Column` (stack top→bottom), `Row` (left→right), and `Grid` (equal columns / card walls). Reach for these first.",
      "- `root` is normally a `Column([...])` (or `Container([...])` for a centered page). A `Column` is the page body; put each major chunk in a `Card(...)`.",
      "- `Row([...])` keeps children at their natural width and vertically centered — ideal for toolbars, button rows, label+value pairs, nav bars. Use `justify` to distribute (`between`, `center`, `end`) and `gap` for spacing.",
      "- `Grid([...], { columns: N })` = N equal columns. Omit `columns` for auto-fit (wraps as many ≥`minChildWidth` columns as fit — best for KPI/card grids). Prefer `Grid` over a wrapping `Row` whenever cells should share a width.",
      "- For a 12-column dashboard / sidebar layout use `GridItem` spans: `Grid([GridItem(side, { span: \"1/4\" }), GridItem(main, { span: \"3/4\" })])`. Fractions `\"1/2\"`…`\"1/12\"` (or numbers 1–12) resolve on a 12-track grid; any `GridItem` child turns the grid on automatically.",
      "- `Center([...], { minHeight })` centers content on both axes — spinners, empty states, hero CTAs, modal bodies. Add `minHeight: \"60vh\"` to center vertically in a region.",
      "- `Stack` is the responsive escape hatch: use it ONLY when the direction itself must change across breakpoints, e.g. `Stack([...], { direction: {base: \"column\", md: \"row\"} })`.",
      "- Make one child in a `Row` expand with `StackItem(child, { grow: 1 })` (e.g. a search input beside a fixed button), or push items apart with a bare `Spacer()` between them.",
      "- `Container([...], { size })` centers a wide page within a comfortable max-width (sm/md/lg/xl/full) — landing pages, articles, marketing sections.",
      "- `Box([...], { padding?, margin?, border?, background?, maxWidth? })` is a plain spacing/surface wrapper for when a `Card` is too heavy.",
      "- `Separator(orientation?, label?)` adds a visual break between sections; pass a `label` for a centered \"OR\"-style divider.",
      "- `gap`/`padding` spacing tokens are `none|3xs|2xs|xs|sm|md|lg|xl|2xl|3xl` (`none` = 0); `align`/`justify`/`columns`/`direction`/`gap` all accept responsive maps like `{base: …, md: …, lg: …}`.",
      "- Use `Drawer` for side-panel detail views and `Modal` for centered dialogs. `Sticky(children, side?, offset?)` pins a toolbar/banner while content scrolls. `ResizablePanels(primary, secondary)` gives a user-resizable two-pane split. `MasonryGrid([...])` is for Pinterest-style mixed-height walls.",
    ],
  },
  {
    name: "Content",
    components: [
      "Text", "Image", "Badge", "BadgeList", "Pill",
      "Callout", "Quote", "CodeBlock", "Skeleton", "Spinner", "LoadingDots",
      "Markdown", "Kbd", "Icon",
    
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "TextContent", "GradientText", "Display", "Heading", "Eyebrow", "Prose", "RelativeTime", "Svg", "VisuallyHidden", "KbdShortcut", "CountUp", "CountdownTimer", "TableOfContents",
    ],
    notes: [
      "- Prefer `Markdown(...)` for rich paragraph text with inline formatting — the parser supports headings, blockquotes, fenced code, numbered/bullet lists, links, images, and bare-URL auto-linking.",
      "- Use `Callout(variant, title, description, icon?, compact?)` for highlighted notices; pass `compact: true` for a one-line inline note.",
      "- Use `Quote(text, cite?)` for inline pull-quotes inside articles and marketing sections (use `Testimonial` when you also have author/role/rating).",
      "- Use `CodeBlock(language, codeString, showLineNumbers?, highlightLines?)` for read-only code snippets. The header always renders a copy-to-clipboard button.",
      "- Use `Badge(label, variant?, icon?, size?)` for a single pill and `BadgeList([\"a\",\"b\",\"c\"], variant?, size?)` to render an array of strings as Badge pills.",
      "- `Badge` vs `Pill`: `Badge` is a SOLID high-attention chip (\"Recommended\", \"Save 50 %\"); `Pill(label, tone?, icon?)` is the softer tinted STATE label for the current status of a thing (\"SSL active\", \"pending\", \"broken\"). Pill tones: neutral, activating, success, warning, critical, promoting, corporate.",
      "- Use `Skeleton(variant?, lines?, height?, shape?, width?)` for loading placeholders; `variant` accepts `paragraph` (default), `card`, `table-row`, `avatar`, `image`.",
      "- Use `Spinner(size?, label?, tone?)` for tiny inline loading indicators inside buttons, toolbars, or table cells; `LoadingDots(label?, size?, tone?)` is the quieter three-dot pulse alternative.",
      "- Use `Image(src, alt?, caption?, ratio?, fit?, fallback?)` — `ratio` (e.g. `\"16:9\"`) makes the image self-constrain so you do not need an outer `AspectRatio`.",
      "- Use `Kbd([\"Cmd\", \"K\"])` when referring to keyboard shortcuts.",
      "- Use `Icon(name, variant?, size?)` to render a standalone Font Awesome icon (`name` is the FA name without the `fa-` prefix, e.g. `\"house\"`, `\"chart-line\"`, `\"regular:star\"`, `\"brands:github\"`).",
      "- For page-level titles reach for `PageHeader(...)` (top of dashboards/detail pages) or `SectionHeader(...)` (inside a Card). For tiny inline titles use `Text(value, variant=\"large-heavy\")`.",
    ],
  },
  {
    name: "Forms",
    components: [
      "Form", "FormControl", "FormSection", "FieldSet", "ValidationSummary", "RequirementList",
      "Input", "TextArea", "PasswordInput", "MaskedInput", "MentionInput", "TagInput",
      "Select", "SelectItem", "Combobox", "MultiSelect",
      "Checkbox", "CheckBoxGroup", "CheckBoxItem", "Radio", "Switch",
      "ToggleGroup", "Button", "Buttons", "ButtonGroup", "InputGroup", "SearchBar",
      "Slider", "NumberInput", "ColorPicker",
      "DatePicker", "DateRangePicker", "TimePicker", "DateTimePicker",
      "FileUpload", "PinInput",
      "MultiStepForm",
    
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "SegmentedControl", "QuantityStepper", "VariantSelector", "Swatch", "DrawingCanvas", "SignaturePad", "ReactionPicker",
    ],
    notes: [
      "- Each FormControl should be a separate reference for progressive streaming.",
      "- Pass a `$variable` as the last argument to `Input`, `Select`, `Checkbox`, `Switch`, `MultiSelect`, or `CheckBoxGroup` for two-way binding.",
      "- Prefer `Switch` over `Checkbox` for settings; use `ToggleGroup` for view-mode pickers and mutually-exclusive filters.",
      "- Reach for `SearchBar(id, placeholder?, value?, shortcut?)` instead of a raw `Input` whenever the field's purpose is to filter content. It ships with the magnifier icon and keyboard hint baked in.",
      "- `Slider(id, min?, max?, step?, value?, label?, showValue?)` is the canonical control for numeric ranges (volume, brightness, filters); pass a `$variable` as `value` for two-way binding.",
      "- `NumberInput(id, value?, min?, max?, step?, placeholder?)` is friendlier than `Input(type=\"number\")` for quantity steppers and integer settings — it ships with +/- buttons that respect `min`/`max`.",
      "- `DatePicker(id, value?, label?, min?, max?, placeholder?)` wraps the native date picker; pass `value` as a `$variable` for two-way binding (ISO `YYYY-MM-DD`).",
      "- `DateRangePicker(id, from?, to?, label?, min?, max?)` is the paired-date variant — bind both `from` and `to` to `$variable`s for a single shared range.",
      "- `Combobox(id, items, value?, placeholder?, emptyLabel?)` is the searchable single-select alternative to `Select` — type to filter long option lists (countries, currencies, users).",
      "- `MultiSelect(id, items, value?, placeholder?, emptyLabel?, max?)` is the multi-select equivalent — bind a `$variable` array as `value` for two-way binding, the trigger renders the picks as removable chips.",
      "- `FileUpload(id, { label?, hint?, accept?, multiple?, action? })` is the styled file picker; the picked files cannot pass through a `$variable`, so wire the `action` prop to a `function` declaration.",
      "- Read what was picked with `$util.readFile(files, { as? })` — pass the whole pick straight through, it resolves the first file's contents as text (or `\"dataUrl\"` / `\"base64\"`) and resolves `\"\"` rather than rejecting on any failure. `FileReader` is NOT reachable under the `\"safe\"` global policy, so this is the vetted read.",
      "- A submit button should call an `action` that awaits the relevant `$mutation` resource, optionally refetches a `$query`, and resets the form `$variable`s (e.g. `$title = \"\"`).",
      "- Button `size` accepts both `sm|md|lg` (canonical) and the legacy `small|normal|large`. Pass `icon` for an inline leading icon.",
      "- `FormSection(label, children, helper?)` is the canonical wrapper for related fields. Reach for it INSTEAD of nesting fields in Card + SectionHeader by hand.",
      "- `FieldSet(legend, children, helper?)` is the accessible `<fieldset>` for radio/checkbox groups; prefer `FormSection` for purely visual grouping.",
      "- `ValidationSummary(errors, title?)` renders an aggregate error panel at the top of the form. Pass `errors` as `{label, message}` objects.",
      "- `RequirementList(items)` marks each rule a value must satisfy met / unmet / not-yet-checked. Reach for it INSTEAD of restating every rule inside one `error` string — pair it with the field's `invalid` and `describedBy` so the border still reddens and the list is the explanation.",
      "- `PasswordInput(id, value?, placeholder?, strengthMeter?)` adds a show/hide toggle and an optional 4-step strength meter — prefer over `Input(type=\"password\")` for sign-up flows.",
      "- `PinInput(id, length?, value?, type?)` renders per-digit code entry for 2FA / SMS verification (use `length=6` for OTP codes).",
      "- `TagInput(id, value?, placeholder?)` lets the user add comma- or Enter-separated chips bound to a `$variable` array.",
      "- `MentionInput(id, people, value?)` is a textarea with inline @-mention suggestions — use for comments, task notes, chat composers.",
      "- `MaskedInput(id, mask, value?)` formats input against a mask string (`9` digit, `A` letter, `*` any). Use for phone numbers, postal codes.",
      "- `TimePicker(id, value?)` and `DateTimePicker(id, value?)` wrap the corresponding native inputs with consistent styling.",
      "- `ColorPicker(id, value?, label?, swatches?)` pairs a color chip with a hex input and preset swatches — bind a $variable holding a hex string.",
      "- `MultiStepForm(steps, current, onSubmit?)` replaces ad-hoc `Steps` + content + manual prev/next wiring. Each step is `{title, details?, content}`.",
    ],
  },
  {
    name: "Data",
    components: ["Table", "Col", "DataGrid", "List", "ListItem", "StatCard", "Stats", "Sparkline", "Tile", "Progress", "ProgressRing", "Pagination", "Tree", "TreeNode", "CalendarView", "ComparisonTable", "InfiniteList",
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "VirtualGrid", "Metric", "MetricStrip", "Calendar", "OrderSummary", "Cart", "PriceTag",
    ],
    notes: [
      "- Build columns using array pluck: `Col(\"Title\", data.rows.title, format?, align?)`.",
      "- For per-row controls inside a Col, use `for (let row of data.rows) { ... }` and reference `row.field` inline.",
      "- `Table(cols, caption?, density?, striped?, sticky?, emptyLabel?)` — pass `density=\"compact\"` for dense data, `sticky=true` to pin the header in a scrolling parent, and `emptyLabel` for the zero-state cell.",
      "- `DataGrid(cols, rowIds?, caption?, sort, selectedIds, selectable?, page, perPage?, …)` is the advanced Table — adds sortable headers (`sortable=true` on Col), per-column filter chips (`filterable=true`), checkbox row selection bound to `$selectedIds`, sticky header / first column, pagination, and an optional bulk-action toolbar. Set `columnMenu=true` to let users hide / reorder / pin columns (the button overlays the top-right of the header — it takes no column of its own and stays put while the grid scrolls sideways; pinning moves the column to the front of the table and above a divider in the panel, reordering never crosses that divider, and the last visible column cannot be hidden). Bind `columnMenuOpen` + `onColumnMenuOpenChange` and point `columnMenuAnchor` at your own button to open the panel from outside the grid, with `columnMenuButton: false` to drop the in-header icon; `resizable=true` for draggable column widths (the first drag pins the columns at their current widths and switches to a fixed layout, so a narrowed column truncates instead of shoving its neighbours);`persistKey=\"myTable\"` to save the layout in localStorage. A small chevron appears in the header band whenever there are columns off-screen left / right — `scrollArrows=false` turns it off. `wrapCells=false` renders single-line cells with ellipsis + hover tooltip. `globalSearch` adds a cross-column search bar. `rowNumbers=true` shows a leading number column. Reach for this whenever a user needs to sort, filter, or page through a list.",
      "- `CalendarView(value?, month?, events?, view?, firstDay?, onSelect?)` renders a full-month (or week) calendar grid for scheduling apps — distinct from the `DatePicker` input. Bind `value` to a `$variable` for the selected ISO date.",
      "- `ComparisonTable(columns, rows, highlightColumn?)` is the generic counterpart of `PricingTable` — pass rows of `{label, values, hint?, group?}`. Use for feature comparisons, spec sheets, plan grids.",
      "- `InfiniteList(items, onLoadMore?, loading?, hasMore?)` is a scroll-to-load list; the action fires when the sentinel scrolls into view.",
      "- Use `Progress(value, max?, label?, tone?, indeterminate?, segments?, buffered?)` for linear bars — `segments` renders an N-step strip (onboarding flows), `buffered` adds a secondary buffer indicator.",
      "- `ProgressRing(value, max?, label?, tone?, size?)` is the circular variant for quotas/completion.",
      "- `Stats([{label, value, hint?, tone?, spark?}, …], layout?)` — `layout=\"strip\"` (default) for inline KPIs; `layout=\"grid\"` for a responsive StatCard grid. Pass `spark` for an inline trend line.",
      "- `StatCard(label, value, trend?, delta?, icon?, spark?, tone?)` gains an optional inline `Sparkline` via the `spark` prop. Use `Sparkline(values, tone?)` standalone for tiny trend chips in table cells.",
      "- `Tile(label, icon?, value?, description?, tone?, action?)` is the dense icon tile for quick-action menus and category grids; pair with `Grid` for uniform rows.",
      "- `Tree([TreeNode(label, children?, icon?, expanded?, active?, badge?, action?)])` renders a hierarchical tree (file browsers, nested navigation, category pickers); use `expanded=true` to open a branch by default.",
      "- `Pagination(page, totalPages, siblings?, total?, perPage?, perPageOptions?, compact?)` — bind `page` (and optionally `perPage`) to a `$variable`; pass `total` to render the \"Showing N–M of T\" summary. Reuse the same variable when slicing data with `arr.filter(...)` / `for`.",
    ],
  },
  {
    name: "Charts",
    components: [
      "BarChart", "LineChart", "PieChart", "RadarChart",
      "ScatterChart", "Histogram", "Heatmap", "Gauge", "Series",
    ],
    notes: [
      "- Use `LineChart` for trends (pass `filled=true` for area-style charts), `BarChart` for comparisons, `PieChart` for proportions, `RadarChart` for multi-axis scorecards.",
      "- `Heatmap(xLabels, yLabels, values)` renders a color-intensity matrix — perfect for calendar heatmaps, correlation grids, schedule density.",
      "- `ScatterChart(series, xLabel?, yLabel?)` plots XY points; pass each Series as `Series(name, points)` where points are `{x, y, label?}`.",
      "- `Histogram(values, binCount?)` bins raw numbers; pass pre-computed `bins=[{label, count}]` instead when you control the bucketing.",
      "- `Gauge(value, min?, max?, label?, tone?, size?)` is the half-doughnut KPI indicator for thresholds (uptime %, score, NPS).",
      "- Pass series via `Series(\"Name\", [...numbers])`.",
    ],
  },
  {
    name: "Feedback & Media",
    components: [
      "Avatar", "AvatarGroup", "PersonChip", "Tooltip", "HoverCard", "Popover",
      "Rating", "Toast", "Toasts",
      "VideoPlayer", "AudioPlayer", "Carousel", "Gallery", "Lightbox", "Map",
    
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "TypingIndicator", "Confetti", "Lottie", "QRCode", "PresenceAvatars", "LiveCursor", "Backdrop",
    ],
    notes: [
      "- `Avatar(name, src?, size?, status?)` falls back to initials when the image is missing.",
      "- Use `AvatarGroup` to render contributor strips with a `+N` overflow chip.",
      "- `PersonChip(name, role?, avatarSrc?, size?, status?, action?)` is the inline avatar + name + role pill — use everywhere a person is referenced (table cells, list rows, sidebar footers, kanban cards) instead of a raw `Avatar` next to `Text`.",
      "- Wrap any node in `Tooltip(label, trigger)` for inline hints.",
      "- Use `HoverCard(trigger, content)` when the popover needs rich content (profile preview, link target) and the trigger should open on hover.",
      "- `Popover(trigger, content, title?, side?, align?, width?)` is the click-triggered counterpart of `HoverCard` — use for filter panels, color pickers, share menus, and small settings flyouts. Always renders an × close button in the header; clicking the trigger again, clicking outside, or pressing Escape also closes it.",
      "- `Rating(value, max?, label?, count?, size?, interactive?, halfStep?, icon?)` renders stars for product reviews, testimonials, and ranked lists. Pass a `$variable` as `value` with `interactive=true` to let users rate; add `halfStep=true` so clicking the left half of a star sets a half-value. Set `icon=\"heart\"|\"thumb\"|\"fire\"|\"bolt\"` (or any FA name) to swap glyphs.",
      "- `Toast(title, message?, tone?, icon?, duration?, action?, onClose?, position?)` pins a transient notice; pass `duration` (ms) for auto-dismiss. Use `Banner` for top-of-page announcements and `Notification` for permanent inbox entries.",
      "- `Toasts(children, position?)` stacks toasts in a viewport corner. Usually unnecessary — the `$toast` namespace (`$toast.success(...)` etc.) auto-renders its own stack. Use `Toasts` only to place the stack yourself: `Toasts($toast.items.map(t => Toast({ title: t.message, tone: t.tone, onClose: () => $toast.dismiss(t.id) })))` (rendering `$toast.items` opts out of the auto-layer).",
      "- `NotificationBell(count?, items?, onOpen?)` — compact inbox trigger; `CommandPalette` for Cmd-K action search.",
    ],
  },
  {
    name: "Navigation",
    components: ["Breadcrumb", "BreadcrumbItem", "Navbar", "NavbarItem", "DropdownMenu", "MenuItem", "MenuSeparator", "MenuLabel",
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "NavBar", "TabBar", "BackToTop", "ScrollSpy", "Brand", "Footer", "FooterColumn", "SkipLink",
    ],
    notes: [
      "- Use `Breadcrumb([\"Workspace\", \"Reports\", \"Q3\"])` at the top of every detail page so users see the path.",
      "- Crumbs navigate by default: a string trail derives `/workspace`, `/workspace/reports`, … from its own labels, and the first crumb gets a home icon. Pass `{ label, to }` objects (or `BreadcrumbItem` nodes) when the real routes are not the slugified labels, `autoLink: false` for a trail that is pure text, and `homeIcon: false` to drop the icon.",
      "- `Navbar(brand?, items?, actions?, sticky?, variant?)` + `NavbarItem(label, to?, href?, icon?, active?, action?, external?)` produces a top navigation bar with brand on the left, links in the middle, and actions on the right — the canonical companion of `Sidebar` for marketing pages, docs, or any product surface without left-side nav.",
      "- `DropdownMenu(trigger, items, side?, align?, label?)` is the click-triggered dropdown menu — use it for user-profile menus, row \"…\" action menus, and any compact list of actions hanging off a single trigger. Children must be `MenuItem`, `MenuSeparator`, or `MenuLabel` entries.",
      "- `MenuItem(label, action?, icon?, shortcut?, variant?, disabled?)` renders a single row inside a `DropdownMenu`; use `variant=\"danger\"` for destructive actions and `MenuSeparator()`/`MenuLabel(label)` to group related items.",
    ],
  },
  {
    name: "Chat",
    components: ["SectionBlock", "ListBlock", "FollowUpBlock", "FollowUpItem", "ActionLink", "ChatBubble"],
    notes: [
      "- End most responses with a `FollowUpBlock` of 2–4 short prompts to keep the conversation moving.",
      "- `ChatBubble(author, body, time?, avatarSrc?, from?)` renders a single message bubble; use `from=\"me\"` for the active speaker and `from=\"agent\"` for the assistant. Compose transcripts as `Stack([ChatBubble(...), ChatBubble(...), …])` inside a `Card`.",
    ],
  },
  {
    name: "Patterns",
    components: [
      "Hero", "PageHeader", "EmptyState",
      "Timeline", "TimelineItem", "ActivityLog",
      "FeatureGrid", "FeatureItem",
      "Testimonial", "ProfileCard", "Comment", "Banner", "Notification",
      "InboxPanel", "OnboardingChecklist",
      "MediaCard", "TopBar",
      "KanbanBoard", "KanbanColumn", "KanbanCard",
      "SectionHeader", "Toolbar", "DescriptionList", "DescriptionItem", "ActionStripe",
      "StatusDot", "PricingTable", "PricingCard",
      "LoadingState", "ErrorState", "SuccessState",
      "Tour", "Spotlight",
    
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "LogoCloud", "LogoChip", "ProductCard", "ShareButtons", "AuthorByline", "CodeWindow", "BrowserFrame", "Terminal", "ThemeToggle", "CopyButton",
    ],
    notes: [
      "- Patterns are **opinionated composites** that pack an entire UI idiom into one component. Reach for them BEFORE composing equivalent layouts by hand with Card+Stack — the result will look more polished and require fewer tokens.",
      "- `Hero(title, subtitle, primary, secondary, eyebrow?, highlights?, tone?)` — landing-style text-first header. Use `layout=\"cover\"` with `imageSrc`, `height`, and optional `caption` for image-backed hero bands.",
      "- `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)` — the canonical first child for any dashboard or detail page. If you omit `breadcrumbs`, the component auto-derives `[\"Home\", title]`.",
      "- `TopBar(title?, search?, actions?, sticky?)` — compact top strip for a content surface (panels, dialogs, embedded views). Use `AppShell` when you need a full sidebar; use `TopBar` for narrower headers above scrolling content.",
      "- `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)` — sub-header inside a Card or panel. Use instead of bare `CardHeader` when the section also needs eyebrow / actions / status.",
      "- `Stats(items, layout?)` — KPI strip (`layout=\"strip\"`, default) or responsive grid (`layout=\"grid\"` with StatCard children). Prefer over hand-rolled StatCard rows.",
      "- `Toolbar(left?, right?, center?, searchable?, searchPlaceholder?, searchValue?)` — filter/search/actions row above a list, table, or board. Pass `searchable: true` to auto-mount a `SearchBar` (use `searchValue` to bind it to a `$variable`).",
      "- `EmptyState(title, description?, icon?, illustration?, actions?, action?)` — render this when a list is empty rather than an empty Card. The icon is auto-picked from the title keywords if you omit it (inbox/messages → `inbox`, charts/analytics → `chart-pie`, files/folders → `folder-open`, etc.).",
      "- `Timeline([TimelineItem(...)])` — vertical event feed (audit log, changelog, activity).",
      "- `ActivityLog(entries, variant?)` — purpose-built feed of user actions. Pass `entries` of `{actor, title, description?, time?, icon?, tone?, meta?}`; use `variant=\"audit\"` for security/admin trails with monospace meta.",
      "- `FeatureGrid([FeatureItem(...)])` — feature highlights with iconography.",
      "- `MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?, ratio?)` — image + content card. Use for article previews, product cards, project highlights. Pair with `Grid` for uniform card rows.",
      "- `KanbanBoard([KanbanColumn(\"To do\", [KanbanCard(...), ...])])` — task boards.",
      "- `DescriptionList([DescriptionItem(\"Status\", Badge(...)), …])` — detail-page key/value summary. Always preferable to a Stack of Text rows on profile, billing, or metadata panels.",
      "- `StatusDot(label, tone?, pulse?)` — inline status pip. Use in toolbars, list rows, table cells, sidebars.",
      "- `Notification(title, message?, time?, icon?, avatarSrc?, tone?, unread?, actions?)` — inline notification card for notification panels / inboxes (prefer `Banner` for top-of-page announcements).",
      "- `InboxPanel(items, title?, onMarkAllRead?)` — `Notification` cards grouped into Unread / Earlier sections, with a shared mark-all-read action.",
      "- `OnboardingChecklist(items, title?, description?)` — checklist of `{title, description?, done?, action?}` items with progress. Use for product onboarding, setup wizards, getting-started panels.",
      "- `PricingTable([PricingCard(plan, price, period?, description?, features?, action?, badge?, featured?)])` — full pricing page block.",
      "- `LoadingState(title?, description?, tone?, action?)`, `ErrorState(title, description?, action?, secondaryAction?, retryLabel?)`, `SuccessState(title, description?, action?, secondaryAction?)` — full-card empty-state alternatives for asynchronous content states.",
      "- `Tour(steps, current, onFinish?)` and `Spotlight(title?, description?, action?)` are the product-tour primitives. `Spotlight` is a single highlighted call-out; `Tour` walks the user through multiple `{title, description, image?}` steps with Prev/Next/Skip controls and a progress dots indicator.",
    ],
  },
  {
    name: "Editors & overlays",
    components: ["RichTextEditor", "CodeEditor", "ContextMenu",
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "Sheet", "BottomSheet", "ConfirmDialog", "SpeedDial", "FloatingActionButton",
    ],
    notes: [
      "- `RichTextEditor(id, value?, placeholder?, minHeight?)` is the contenteditable WYSIWYG editor — toolbar ships with bold/italic/underline/strike/heading/lists/link. Bind `value` to a `$variable` holding HTML.",
      "- `CodeEditor(id, value?, language?, placeholder?, minHeight?)` is a lightweight `<textarea>` with a synced line-number gutter and tab indentation. Use for snippet editors, prompt sandboxes, settings JSON.",
      "- `ContextMenu(target, items)` attaches a right-click menu to any node. `items` are `MenuItem` or `{label, action?, icon?, shortcut?, variant?, disabled?}` objects; pass a `MenuSeparator()` to split groups.",
    ],
  },
  {
    name: "App shell",
    components: [
      "AppShell", "Sidebar", "SidebarSection", "SidebarItem", "SplitView",
    ],
    notes: [
      "- App shell components produce a **full SaaS-style layout in a single statement**. Use them whenever the response represents a complete product surface (dashboards with nav, settings sections, admin consoles, inboxes).",
      "- `AppShell(sidebar, content, topbar?, collapsible?, sidebarOpen?)` — fixed-left navigation + scrollable main area. Pass `collapsible=true` to enable a hamburger that turns the sidebar into a slide-over drawer on mobile; bind `sidebarOpen` to a `$variable` if you want to drive that drawer programmatically.",
      "- `Sidebar(items, brand?, tagline?, footer?, collapsed?)` + `SidebarItem(label, icon?, active?, badge?, action?)` + `SidebarSection(label, items)` — group nav links into sections, mark the current page with `active=true`, attach badges for counts. Pass `collapsed=true` (or bind to a `$variable`) to collapse it to an icon rail.",
      "- `SplitView(primary, detail, primaryWidth?)` — master/detail layout (inboxes, file browsers, contact lists). Both panes are scrollable.",
    ],
  },
  {
    name: "Advanced UI",
    components: [
      "IconButton", "CommandPalette", "FilterChips", "FilterPill", "FieldRepeater",
      "VirtualList", "QueryBuilder", "DiffViewer", "JsonTree", "Gantt",
      "Truncate", "InlineEdit", "NotificationBell",
    
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "Reveal", "Transition", "FlipList", "Parallax", "ReadingProgress", "Sortable", "Draggable", "DropZone", "OnGesture",
    ],
    notes: [
      "- `IconButton(icon, label, action?, variant?, size?, disabled?)` — accessible icon-only control.",
      "- `CommandPalette(items, open?, placeholder?, shortcut?)` — Cmd-K searchable actions.",
      "- `FilterChips(chips, onRemove?, onClear?)` — applied filter pills with remove.",
      "- `FieldRepeater(items, fields, onAdd?, onRemove?)` — dynamic form rows.",
      "- `VirtualList(items, itemHeight?, renderItem)` — windowed long lists.",
      "- `QueryBuilder(fields, value?)` — visual AND/OR filter builder.",
      "- `DiffViewer(left, right, mode?)` — side-by-side or unified diff.",
      "- `JsonTree(data)` — collapsible JSON inspector.",
      "- `Gantt(tasks, startDate?, endDate?)` — horizontal schedule timeline.",
      "- `Truncate(text, maxLines?)` / `InlineEdit(value, onSave?)` / `NotificationBell(count?, items?)`.",
    ],
  },
  {
    name: "Routing",
    components: ["NavLink",
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "RouteView",
    ],
    notes: [
      "- Declare routes with the `$router({...})` call form: `pages = $router({ \"/\": Dashboard(), \"/orders/:id\": OrderDetail({ id: params.id }), default: NotFound() })`. The matched arm's `params` object is in scope on the right-hand side; nest `$router` inside components for layout-preserving sub-routes.",
      "- `Redirect(path)` is a router-aware component: returning it from a route's body navigates and unmounts the rest of the subtree.",
      "- `NavLink(label, { to })` is a thin link wrapper that reads `route.path` and dispatches `route.navigate(to)` — use it for sidebars, navbars and breadcrumbs.",
      "- Read URL params via `route.params.<name>` (e.g. `route.params.id` for `/users/:id`) and the current path via `route.path`.",
    ],
  },
  {
    name: "Helpers",
    components: ["Async", "Show", "Portal", "Redirect", "Lazy", "ErrorBoundary",
      // Previously ungrouped: without a group entry a component ships with no
      // usage guidance in the generated prompt and is invisible in chat mode.
      "LiveRegion", "FocusTrap",
    ],
    notes: [
      "- `Async(resource, { loading:, error:, empty:, data: })` switches an `$http({...})` resource on its `state` field (`empty` shows for `null`/empty-array data).",
      "- `Show(when, { fallback?, children })` is sugar over `if (expr) { children } else { fallback }`.",
      "- `Portal(target?, children)` renders into a different DOM subtree (defaults to `document.body`).",
      "- `Redirect(path)` is a router-aware component — see Routing.",
      "- `Lazy(loader, fallback?)` defers rendering until the async `loader` resolves, showing `fallback` while pending (a synchronous loader value renders immediately).",
      "- `ErrorBoundary(fallback?, onError?, children)` catches rendering errors thrown by descendants.",
    ],
  },
  {
    name: "Behaviour wrappers",
    components: [
      "OnClick", "OnMouse", "OnKeyboard", "OnFocus", "OnIntersect", "OnMount", "Css", "Link",
    ],
    notes: [
      "- Wrappers compose: any built-in component can be made clickable, hoverable, observable, or restyled by wrapping it in one of these primitives — no need for the underlying component to grow another prop.",
      "- `OnClick(child, { onClick, disabled?, stopPropagation? })` makes any component clickable / tappable (touch devices fire `click` too). Use for clickable cards, list rows, media tiles, and any custom layout that needs a tap target without a `<button>` baseline.",
      "- `OnMouse(child, { enter?, leave?, hover?, move?, down?, up?, click?, doubleClick?, contextMenu?, scroll?, wheel?, drag?, drop?, dragStart?, dragEnd?, dragEnter?, dragLeave?, dragOver?, draggable?, passiveScroll? })` attaches any combination of mouse / pointer / drag listeners. Pass `draggable: true` to make the wrapper itself draggable. Scroll / wheel listeners default to `{ passive: true }` for smooth scrolling.",
      "- `OnKeyboard(child, { onKeyDown?, onKeyUp?, onKeyPress?, focusable? })` attaches keyboard listeners. The wrapper is focusable by default; pass `focusable: false` when the child is already focusable (input, button).",
      "- `OnFocus(child, { onFocus?, onBlur? })` tracks focus moving into or out of a subtree (uses bubbling `focusin` / `focusout` so descendants count).",
      "- `OnIntersect(child, { onEnter?, onLeave?, onChange?, threshold?, rootMargin?, once? })` is the IntersectionObserver wrapper — perfect for lazy-load sentinels, infinite-scroll triggers, impression analytics, and reveal-on-scroll animations.",
      "- `OnMount(child, { onMount?, onUnmount? })` is the DOM-ref / lifecycle wrapper. `onMount(node)` fires once after the wrapped element attaches; `onUnmount(node)` fires when it leaves the tree. Use it to measure or focus an element, or to hand a node to an imperative library (chart / map / editor). Stash the node in a `$ref(...)`.",
      "- `Css(child, { style?, class? })` merges raw class tokens and inline styles onto the wrapped child. Reach for it ONLY when the standard component props can't express the styling — prefer `Box`/`Stack`/`Grid` for layout and `$theme(...)` for tokens.",
      "- `Link(label_or_child, { to?, href?, external?, variant? })` is the anchor primitive — accepts either a plain string label or a wrapped component. Use `to` for client-side router navigation and `href` (with `external: true`) for outbound links.",
    ],
  },
  {
    name: "Interop",
    components: ["Mount", "WebComponent"],
    notes: [
      "- Interop primitives are the bridge to imperative / third-party libraries that own their own DOM. Reach for them ONLY when a real widget (chart, map, editor, payment element, captcha) cannot be expressed with built-in components.",
      "- `Mount({ setup, update?, cleanup?, props?, tag?, sx? })` is the managed imperative-component host. `setup(node, props)` runs once after the host attaches and returns an instance handle; `update(instance, props)` runs when the (shallow-compared) `props` bag changes; `cleanup(instance)` runs on unmount. Aktion owns + preserves the host element so the widget is never rebuilt mid-session. Example: `Mount({ sx: { h: \"320px\" }, setup: (node, p) => new Chart(node, p.config), update: (c, p) => { c.data = p.data; c.update() }, cleanup: c => c.destroy(), props: { config: $cfg, data: $series } })`.",
      "- `WebComponent(tag, { attributes?, properties?, on?, children? })` renders + hydrates a native custom element. `attributes` is reactive (re-applies on `$state` change); `properties` assigns rich JS props; `on` binds event listeners that stay current across renders. Example: `WebComponent(\"stripe-pricing-table\", { attributes: { \"pricing-table-id\": $id, \"publishable-key\": $pk }, on: { checkout: e => route.navigate(\"/thanks\") } })`.",
      "- Pair these with the `$script({ src, global? })` loader (gate a widget on its SDK being ready) and the `$dom` observer namespace (`$dom.onResize`/`onIntersect`/`measure`) for layout-aware widgets.",
    ],
  },
  {
    name: "Escape hatches",
    components: ["HTMLTag", "Styles"],
    notes: [
      "- **Use only as a last resort.** Reach for these primitives when the standard catalogue cannot express the markup or styling you need; for everything else (typography, layout, surfaces, controls) the dedicated components produce a more consistent UI for fewer tokens.",
      "- `HTMLTag(tag, attributes?, children?)` renders an allow-listed HTML tag with the given attribute object and child nodes (e.g. `HTMLTag(\"section\", attributes: {class: \"hero\", \"data-id\": 1}, children: [Text(\"Hello\")])`). Tag names outside the allow-list collapse to `div`; `on*` attributes, `javascript:` URLs in `href`/`src`, and `expression()` / `@import` in inline `style` are stripped.",
      "- `Styles(css)` injects a `<style>` block containing the given CSS rules (e.g. `` Styles(`.hero { background: linear-gradient(...); }`) ``). Pair it with `HTMLTag` (or any built-in component's `class`-bearing wrapper) when scoping to a custom selector. Payloads containing `</style>`, `<script>`, `expression(`, `javascript:`, `behavior:`, or `@import` are dropped.",
    ],
  },
];

// Aktion 0.5 §19.1 — fail-fast guard: no library spec may
// declare more than one `positional: true` prop. Surfaces as a clear
// SyntaxError at module load so a broken spec never ships.
assertOnePositionalMax(components);

export const defaultLibrary: ComponentLibrary = {
  root: "Column",
  components,
  componentGroups,
};
