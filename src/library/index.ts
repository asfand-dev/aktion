/**
 * Built-in component library for `<streaming-ui-script>`.
 *
 * Exports a single `defaultLibrary` that ships with the package. Consumers can
 * extend it via `<streaming-ui-script>.registerComponents([...])`.
 */

import type { ComponentLibrary, ComponentSpec, ComponentGroup } from "./types.js";
import {
  Stack, Grid, Section, Card, CardHeader, CardBody, CardFooter, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps, StepsItem,
  AspectRatio, ScrollArea,
} from "./components/layout.js";
import {
  TextContent, Image, Link, Badge, BadgeList,
  Callout, CodeBlock, Skeleton, Markdown,
  Container, Spacer, Quote, Icon, Spinner,
} from "./components/content.js";
import {
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, SearchBar,
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
  MultiSelect, DateRangePicker, SegmentedControl,
} from "./components/forms.js";
import {
  Table, Col, List, ListItem, StatCard, Tree, TreeNode, Sparkline,
} from "./components/data.js";
import { BarChart, LineChart, PieChart, Series } from "./components/charts.js";
import {
  SectionBlock, ListBlock, FollowUpBlock, FollowUpItem, ActionLink,
} from "./components/chat.js";
import {
  Avatar, AvatarGroup, Progress, Switch, Toggle, ToggleGroup,
  Tooltip, HoverCard, Popover, Toast, Toasts, Kbd, Rating, ProgressRing, ChatBubble,
} from "./components/feedback.js";
import {
  Breadcrumb, BreadcrumbItem, Pagination, Sheet, Navbar, NavbarItem,
} from "./components/navigation.js";
import {
  DropdownMenu, MenuItem, MenuSeparator, MenuLabel,
} from "./components/menu.js";
import {
  Hero, PageHeader, MetricGrid, EmptyState,
  Timeline, TimelineItem, FeatureGrid, FeatureItem,
  Testimonial, ProfileCard, Comment, Banner,
  KanbanBoard, KanbanColumn, KanbanCard,
  SectionHeader, Toolbar, Sidebar, SidebarSection, SidebarItem,
  AppShell, SplitView, DescriptionList, DescriptionItem,
  StatusDot, PricingTable, PricingCard,
  Cover, MediaCard, Stats, Tile, Notification, PersonChip,
} from "./components/patterns.js";
import {
  DataGrid, CalendarView, ActivityLog, AuditTrail, ComparisonTable, InfiniteList,
} from "./components/advanced-data.js";
import {
  VideoPlayer, AudioPlayer, Carousel, Gallery, Lightbox, Map,
} from "./components/media.js";
import {
  RichTextEditor, CodeEditor, ContextMenu, ColorPicker,
} from "./components/editors.js";
import {
  AreaChart, Gauge, Heatmap, RadarChart, ScatterChart, Histogram,
} from "./components/advanced-charts.js";
import {
  PinInput, OtpInput, PasswordInput, TagInput, MentionInput,
  TimePicker, DateTimePicker, MaskedInput,
  FormSection, FieldSet, ValidationSummary, MultiStepForm,
} from "./components/advanced-forms.js";
import {
  InboxPanel, OnboardingChecklist, LoadingState, ErrorState, SuccessState,
  Tour, Spotlight, Sticky, ResizablePanels, MasonryGrid, Drawer, TopBar,
  BreadcrumbPageHeader,
} from "./components/advanced-patterns.js";
import { Script } from "./components/scripts.js";
import { Theme } from "./components/theme.js";
import { Routes, Route, NavLink } from "./components/router.js";

export * from "./types.js";
export * from "./registry.js";

const components: ComponentSpec[] = [
  Stack, Grid, Section, Card, CardHeader, CardBody, CardFooter, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps, StepsItem,
  AspectRatio, ScrollArea, Container, Spacer,
  TextContent, Image, Link, Badge, BadgeList,
  Callout, CodeBlock, Skeleton, Markdown, Quote, Icon, Spinner,
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, SearchBar,
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
  MultiSelect, DateRangePicker, SegmentedControl,
  Table, Col, List, ListItem, StatCard, Sparkline, Tree, TreeNode,
  BarChart, LineChart, PieChart, Series,
  SectionBlock, ListBlock, FollowUpBlock, FollowUpItem, ActionLink, ChatBubble,
  Avatar, AvatarGroup, Progress, ProgressRing, Switch, Toggle, ToggleGroup,
  Tooltip, HoverCard, Popover, Toast, Toasts, Kbd, Rating,
  Breadcrumb, BreadcrumbItem, Pagination, Sheet, Navbar, NavbarItem,
  DropdownMenu, MenuItem, MenuSeparator, MenuLabel,
  Hero, Cover, PageHeader, MetricGrid, Stats, Tile, EmptyState,
  Timeline, TimelineItem, FeatureGrid, FeatureItem,
  Testimonial, ProfileCard, PersonChip, Comment, Banner, Notification,
  MediaCard, KanbanBoard, KanbanColumn, KanbanCard,
  SectionHeader, Toolbar, Sidebar, SidebarSection, SidebarItem,
  AppShell, SplitView, DescriptionList, DescriptionItem,
  StatusDot, PricingTable, PricingCard,
  // Advanced data
  DataGrid, CalendarView, ActivityLog, AuditTrail, ComparisonTable, InfiniteList,
  // Media
  VideoPlayer, AudioPlayer, Carousel, Gallery, Lightbox, Map,
  // Editors
  RichTextEditor, CodeEditor, ContextMenu, ColorPicker,
  // More charts
  AreaChart, Gauge, Heatmap, RadarChart, ScatterChart, Histogram,
  // Advanced forms
  PinInput, OtpInput, PasswordInput, TagInput, MentionInput,
  TimePicker, DateTimePicker, MaskedInput,
  FormSection, FieldSet, ValidationSummary, MultiStepForm,
  // Advanced patterns + state cards
  InboxPanel, OnboardingChecklist, LoadingState, ErrorState, SuccessState,
  Tour, Spotlight, Sticky, ResizablePanels, MasonryGrid, Drawer, TopBar,
  BreadcrumbPageHeader,
  Script,
  Theme,
  Routes, Route, NavLink,
];

const componentGroups: ComponentGroup[] = [
  {
    name: "Layout",
    components: [
      "Stack", "Grid", "Section", "Container", "Spacer", "Card", "CardHeader", "CardBody", "CardFooter",
      "Separator", "Tabs", "TabItem", "Accordion", "AccordionItem",
      "Modal", "Drawer", "Sheet", "Steps", "StepsItem", "AspectRatio", "ScrollArea",
      "Sticky", "ResizablePanels", "MasonryGrid",
    ],
    notes: [
      "- `root` MUST be `Stack(...)` and contain at least one child.",
      "- Wrap each major chunk of content in a `Card(...)` for visual grouping.",
      "- Prefer `Grid(...)` over `Stack` with `direction=\"row\" wrap=true` when children should size uniformly (KPIs, feature tiles, card grids).",
      "- Use `Container(children, size?)` to centre a wide page within a comfortable max-width (landing pages, articles, marketing sections).",
      "- Use `Spacer()` inside `Stack(direction=\"row\")` to push the next item to the far edge; pass a `size` for an explicit fixed gap.",
      "- Use `Separator(orientation?, label?)` between sections to add visual breaks. Pass a `label` for a centered \"OR\"-style separator.",
      "- Use `Drawer` (new canonical name) or `Sheet` (alias) for side-panel detail views, `Modal` for centered dialogs.",
      "- Use `Sticky(children, side?, offset?)` to pin a toolbar/banner while the surrounding content scrolls.",
      "- Use `ResizablePanels(primary, secondary, initialPrimaryWidth?)` for user-resizable two-pane layouts (code editors, file browsers).",
      "- Use `MasonryGrid([...])` for Pinterest-style mixed-height card walls — prefer `Grid` when rows should share a height.",
    ],
  },
  {
    name: "Content",
    components: [
      "TextContent", "Image", "Link", "Badge", "BadgeList",
      "Callout", "Quote", "CodeBlock", "Skeleton", "Spinner",
      "Markdown", "Kbd", "Icon",
    ],
    notes: [
      "- Prefer `Markdown(...)` for rich paragraph text with inline formatting — the parser supports headings, blockquotes, fenced code, numbered/bullet lists, links, images, and bare-URL auto-linking.",
      "- Use `Callout(variant, title, description, icon?, compact?)` for highlighted notices; pass `compact=true` for a one-line inline note.",
      "- Use `Quote(text, cite?)` for inline pull-quotes inside articles and marketing sections (use `Testimonial` when you also have author/role/rating).",
      "- Use `CodeBlock(language, codeString, showLineNumbers?, highlightLines?)` for read-only code snippets. The header always renders a copy-to-clipboard button.",
      "- Use `Badge(label, variant?, icon?, size?)` for a single pill and `BadgeList([\"a\",\"b\",\"c\"], variant?, size?)` to render an array of strings as Badge pills.",
      "- Use `Skeleton(variant?, lines?, height?, shape?, width?)` for loading placeholders; `variant` accepts `paragraph` (default), `card`, `table-row`, `avatar`, `image`.",
      "- Use `Spinner(size?, label?, tone?)` for tiny inline loading indicators inside buttons, toolbars, or table cells.",
      "- Use `Image(src, alt?, caption?, ratio?, fit?, fallback?)` — `ratio` (e.g. `\"16:9\"`) makes the image self-constrain so you do not need an outer `AspectRatio`.",
      "- Use `Kbd([\"Cmd\", \"K\"])` when referring to keyboard shortcuts.",
      "- Use `Icon(name, variant?, size?)` to render a standalone Font Awesome icon (`name` is the FA name without the `fa-` prefix, e.g. `\"house\"`, `\"chart-line\"`, `\"regular:star\"`, `\"brands:github\"`).",
      "- For page-level titles reach for `PageHeader(...)` (top of dashboards/detail pages) or `SectionHeader(...)` (inside a Card). For tiny inline titles use `TextContent(value, variant=\"large-heavy\")`.",
    ],
  },
  {
    name: "Forms",
    components: [
      "Form", "FormControl", "FormSection", "FieldSet", "ValidationSummary",
      "Input", "TextArea", "PasswordInput", "MaskedInput", "MentionInput", "TagInput",
      "Select", "SelectItem", "Combobox", "MultiSelect",
      "Checkbox", "CheckBoxGroup", "CheckBoxItem", "Radio", "Switch", "Toggle",
      "ToggleGroup", "SegmentedControl", "Button", "Buttons", "SearchBar",
      "Slider", "NumberInput", "ColorPicker",
      "DatePicker", "DateRangePicker", "TimePicker", "DateTimePicker",
      "FileUpload", "PinInput", "OtpInput",
      "MultiStepForm",
    ],
    notes: [
      "- Each FormControl should be a separate reference for progressive streaming.",
      "- Pass a `$variable` as the last argument to `Input`, `Select`, `Checkbox`, `Switch`, `MultiSelect`, or `CheckBoxGroup` for two-way binding.",
      "- Prefer `Switch` over `Checkbox` for settings, `ToggleGroup` for view-mode pickers, `SegmentedControl(items, value?, size?)` for 2–5 mutually-exclusive view modes (grid/list, day/week/month, light/dark).",
      "- Reach for `SearchBar(id, placeholder?, value?, shortcut?)` instead of a raw `Input` whenever the field's purpose is to filter content. It ships with the magnifier icon and keyboard hint baked in.",
      "- `Slider(id, min?, max?, step?, value?, label?, showValue?)` is the canonical control for numeric ranges (volume, brightness, filters); pass a `$variable` as `value` for two-way binding.",
      "- `NumberInput(id, value?, min?, max?, step?, placeholder?)` is friendlier than `Input(type=\"number\")` for quantity steppers and integer settings — it ships with +/- buttons that respect `min`/`max`.",
      "- `DatePicker(id, value?, label?, min?, max?, placeholder?)` wraps the native date picker; pass `value` as a `$variable` for two-way binding (ISO `YYYY-MM-DD`).",
      "- `DateRangePicker(id, from?, to?, label?, min?, max?)` is the paired-date variant — bind both `from` and `to` to `$variable`s for a single shared range.",
      "- `Combobox(id, items, value?, placeholder?, emptyLabel?)` is the searchable single-select alternative to `Select` — type to filter long option lists (countries, currencies, users).",
      "- `MultiSelect(id, items, value?, placeholder?, emptyLabel?, max?)` is the multi-select equivalent — bind a `$variable` array as `value` for two-way binding, the trigger renders the picks as removable chips.",
      "- `FileUpload(id, label?, hint?, accept?, multiple?, action?)` is the styled file picker; the picked files cannot pass through a `$variable`, so use the `action` with an `@Js` step to read them.",
      "- A submit button should run `Action([@Run(mutation), @Run(query), @Reset($var1, $var2)])`.",
      "- Button `size` accepts both `sm|md|lg` (canonical) and the legacy `small|normal|large`. Pass `icon` for an inline leading icon.",
      "- `FormSection(label, children, helper?)` is the canonical wrapper for related fields. Reach for it INSTEAD of nesting fields in Card + SectionHeader by hand.",
      "- `FieldSet(legend, children, helper?)` is the accessible `<fieldset>` for radio/checkbox groups; prefer `FormSection` for purely visual grouping.",
      "- `ValidationSummary(errors, title?)` renders an aggregate error panel at the top of the form. Pass `errors` as `{label, message}` objects.",
      "- `PasswordInput(id, value?, placeholder?, strengthMeter?)` adds a show/hide toggle and an optional 4-step strength meter — prefer over `Input(type=\"password\")` for sign-up flows.",
      "- `PinInput(id, length?, value?, type?)` and `OtpInput(id, value?, length?)` render per-digit code entry for 2FA / SMS verification.",
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
    components: ["Table", "Col", "DataGrid", "List", "ListItem", "StatCard", "Stats", "Sparkline", "Tile", "Progress", "ProgressRing", "Pagination", "Tree", "TreeNode", "CalendarView", "ComparisonTable", "InfiniteList"],
    notes: [
      "- Build columns using array pluck: `Col(\"Title\", data.rows.title, format?, align?)`.",
      "- For per-row controls inside a Col, use `@Each(data.rows, \"row\", ...)` and reference `row.field` inline.",
      "- `Table(cols, caption?, density?, striped?, sticky?, emptyLabel?)` — pass `density=\"compact\"` for dense data, `sticky=true` to pin the header in a scrolling parent, and `emptyLabel` for the zero-state cell.",
      "- `DataGrid(cols, rowIds?, caption?, sort, selectedIds, selectable?, page, perPage?, …)` is the advanced Table — adds sortable headers (`sortable=true` on Col), per-column filter chips (`filterable=true`), checkbox row selection bound to `$selectedIds`, sticky header / first column, pagination, and an optional bulk-action toolbar. Reach for this whenever a user needs to sort, filter, or page through a list.",
      "- `CalendarView(value?, month?, events?, view?, firstDay?, onSelect?)` renders a full-month (or week) calendar grid for scheduling apps — distinct from the `DatePicker` input. Bind `value` to a `$variable` for the selected ISO date.",
      "- `ComparisonTable(columns, rows, highlightColumn?)` is the generic counterpart of `PricingTable` — pass rows of `{label, values, hint?, group?}`. Use for feature comparisons, spec sheets, plan grids.",
      "- `InfiniteList(items, onLoadMore?, loading?, hasMore?)` is a scroll-to-load list; the action fires when the sentinel scrolls into view.",
      "- Use `Progress(value, max?, label?, tone?, indeterminate?, segments?, buffered?)` for linear bars — `segments` renders an N-step strip (onboarding flows), `buffered` adds a secondary buffer indicator.",
      "- `ProgressRing(value, max?, label?, tone?, size?)` is the circular variant for quotas/completion.",
      "- `Stats([{label, value, hint?, tone?, spark?}, …])` is the compact inline stat strip — pass `spark` (number array) for an inline trend line beside each value. Lighter than `MetricGrid`, perfect inside a chart Card or beneath a header.",
      "- `StatCard(label, value, trend?, delta?, icon?, spark?, tone?)` gains an optional inline `Sparkline` via the `spark` prop. Use `Sparkline(values, tone?)` standalone for tiny trend chips in table cells.",
      "- `Tile(label, icon?, value?, description?, tone?, action?)` is the dense icon tile for quick-action menus and category grids; pair with `Grid` for uniform rows.",
      "- `Tree([TreeNode(label, children?, icon?, expanded?, active?, badge?, action?)])` renders a hierarchical tree (file browsers, nested navigation, category pickers); use `expanded=true` to open a branch by default.",
      "- `Pagination(page, totalPages, siblings?, total?, perPage?, perPageOptions?, compact?)` — bind `page` (and optionally `perPage`) to a `$variable`; pass `total` to render the \"Showing N–M of T\" summary. Reuse the same variable when slicing data with `@Filter` / `@Each`.",
    ],
  },
  {
    name: "Charts",
    components: [
      "BarChart", "LineChart", "AreaChart", "PieChart", "RadarChart",
      "ScatterChart", "Histogram", "Heatmap", "Gauge", "Series",
    ],
    notes: [
      "- Use `LineChart` for trends, `BarChart` for comparisons, `PieChart` for proportions, `AreaChart` for cumulative trends, `RadarChart` for multi-axis scorecards.",
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
    ],
    notes: [
      "- `Avatar(name, src?, size?, status?)` falls back to initials when the image is missing.",
      "- Use `AvatarGroup` to render contributor strips with a `+N` overflow chip.",
      "- `PersonChip(name, role?, avatarSrc?, size?, status?, action?)` is the inline avatar + name + role pill — use everywhere a person is referenced (table cells, list rows, sidebar footers, kanban cards) instead of a raw `Avatar` next to `TextContent`.",
      "- Wrap any node in `Tooltip(label, trigger)` for inline hints.",
      "- Use `HoverCard(trigger, content)` when the popover needs rich content (profile preview, link target) and the trigger should open on hover.",
      "- `Popover(trigger, content, title?, side?, align?, width?)` is the click-triggered counterpart of `HoverCard` — use for filter panels, color pickers, share menus, and small settings flyouts. Always renders an × close button in the header; clicking the trigger again, clicking outside, or pressing Escape also closes it.",
      "- `Rating(value, max?, label?, count?, size?, interactive?, halfStep?, icon?)` renders stars for product reviews, testimonials, and ranked lists. Pass a `$variable` as `value` with `interactive=true` to let users rate; add `halfStep=true` so clicking the left half of a star sets a half-value. Set `icon=\"heart\"|\"thumb\"|\"fire\"|\"bolt\"` (or any FA name) to swap glyphs.",
      "- `Toasts([Toast(...)], position?)` pins a fixed corner stack of transient `Toast(title, message?, tone?, icon?, duration?, action?, onClose?, position?)` cards. Every Toast always shows a × close button; pass `duration` (ms) for auto-dismiss, omit it for a persistent toast. A standalone `Toast(...)` with a `position` prop pins itself to a viewport corner without needing `Toasts(...)`. Drive lists via a `$toasts` $variable plus `@Push`/`@Filter`. Use `Banner` for top-of-page announcements and `Notification` for permanent inbox entries.",
    ],
  },
  {
    name: "Navigation",
    components: ["Breadcrumb", "BreadcrumbItem", "Navbar", "NavbarItem", "DropdownMenu", "MenuItem", "MenuSeparator", "MenuLabel"],
    notes: [
      "- Use `Breadcrumb([\"Workspace\", \"Reports\", \"Q3\"])` at the top of every detail page so users see the path.",
      "- For per-item links, pass `BreadcrumbItem(label, href)` nodes instead of strings.",
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
      "Hero", "Cover", "PageHeader", "BreadcrumbPageHeader", "MetricGrid", "EmptyState",
      "Timeline", "TimelineItem", "ActivityLog", "AuditTrail",
      "FeatureGrid", "FeatureItem",
      "Testimonial", "ProfileCard", "Comment", "Banner", "Notification",
      "InboxPanel", "OnboardingChecklist",
      "MediaCard", "TopBar",
      "KanbanBoard", "KanbanColumn", "KanbanCard",
      "SectionHeader", "Toolbar", "DescriptionList", "DescriptionItem",
      "StatusDot", "PricingTable", "PricingCard",
      "LoadingState", "ErrorState", "SuccessState",
      "Tour", "Spotlight",
    ],
    notes: [
      "- Patterns are **opinionated composites** that pack an entire UI idiom into one component. Reach for them BEFORE composing equivalent layouts by hand with Card+Stack — the result will look more polished and require fewer tokens.",
      "- `Hero(title, subtitle, primary, secondary, eyebrow?, highlights?, tone?)` — landing-style text-first header. Pair with a FeatureGrid below.",
      "- `Cover(title, imageSrc, subtitle?, eyebrow?, caption?, actions?, tone?, height?)` — image-backed hero band. Use for product, article, or campaign top sections.",
      "- `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)` — the canonical first child for any dashboard or detail page. If you omit `breadcrumbs`, the component auto-derives `[\"Home\", title]`.",
      "- `BreadcrumbPageHeader(path, subtitle?, actions?, status?)` — convenience composite that builds a `PageHeader` from a raw breadcrumb array (the last segment becomes the title).",
      "- `TopBar(title?, search?, actions?, sticky?)` — compact top strip for a content surface (panels, dialogs, embedded views). Use `AppShell` when you need a full sidebar; use `TopBar` for narrower headers above scrolling content.",
      "- `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)` — sub-header inside a Card or panel. Use instead of bare `CardHeader` when the section also needs eyebrow / actions / status.",
      "- `MetricGrid([statCard1, statCard2, …])` — responsive KPI strip. Always prefer this over a `Stack(direction=\"row\")` of StatCards.",
      "- `Toolbar(left?, right?, center?, searchable?, searchPlaceholder?, searchValue?)` — filter/search/actions row above a list, table, or board. Pass `searchable=true` to auto-mount a `SearchBar` (use `searchValue` to bind it to a `$variable`). The optional `center` slot pins controls (e.g. `SegmentedControl`) between the left filters and right actions.",
      "- `EmptyState(title, description?, icon?, illustration?, actions?, action?)` — render this when a list is empty rather than an empty Card. The icon is auto-picked from the title keywords if you omit it (inbox/messages → `inbox`, charts/analytics → `chart-pie`, files/folders → `folder-open`, etc.).",
      "- `Timeline([TimelineItem(...)])` — vertical event feed (audit log, changelog, activity).",
      "- `ActivityLog(entries, title?)` — purpose-built feed of user actions. Pass `entries` of `{actor, title, description?, time?, icon?, tone?, avatarSrc?}`. Prefer over a hand-rolled `Timeline` for product activity streams.",
      "- `AuditTrail(entries, title?)` — sibling of `ActivityLog` rendered in a monospace voice for security/admin trails. Adds an optional `meta` field per entry for IPs, IDs, browsers.",
      "- `FeatureGrid([FeatureItem(...)])` — feature highlights with iconography.",
      "- `MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?, ratio?)` — image + content card. Use for article previews, product cards, project highlights. Pair with `Grid` for uniform card rows.",
      "- `KanbanBoard([KanbanColumn(\"To do\", [KanbanCard(...), ...])])` — task boards.",
      "- `DescriptionList([DescriptionItem(\"Status\", Badge(...)), …])` — detail-page key/value summary. Always preferable to a Stack of TextContent rows on profile, billing, or metadata panels.",
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
    components: ["RichTextEditor", "CodeEditor", "ContextMenu"],
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
    name: "Scripting",
    components: ["Script"],
    notes: [
      "- Use sparingly: most state can be handled with `$variables` + `Action([@Set(...), @Run(...)])`.",
      "- The body receives a `ctx` object exposing reactive state, registered tools, DOM refs, and lifecycle hooks.",
    ],
  },
  {
    name: "Theming",
    components: ["Theme"],
    notes: [
      "- `Theme({...})` applies a partial token override **on top of** the base theme set by the host (attribute / `setTheme()`). Use it to brand a single response without changing host configuration.",
      "- Assign the result to a top-level binding called `theme` so the runtime picks it up:",
      "  `theme = Theme({colorPrimary: \"#0969da\", radiusButton: \"6px\"})`",
      "- Common branding tokens: `colorPrimary`, `colorPrimaryHover`, `colorPrimaryText`, `colorAccent`, `colorBg`, `colorSurface`, `colorText`, `colorTextMuted`, `colorBorder`, `colorFocusRing`, `fontFamily`, `fontFamilyHeading`, `fontSizeBase`, `fontWeightHeading`, `letterSpacingHeading`, `headingTextTransform`, `radiusMd`, `radiusButton`, `radiusInput`, `borderWidth`, `shadowMd`, `buttonFontWeight`, `buttonTextTransform`, `buttonPaddingY`, `buttonPaddingX`, `transitionDuration`, `chart1`–`chart6`.",
      "- Tokens are CSS values (`\"#0969da\"`, `\"'Inter', sans-serif\"`, `\"6px\"`, `\"600\"`). The runtime ignores unknown keys, so typos fail silent.",
      "- Removing the `Theme(...)` line snaps the UI back to the base theme without a reload.",
    ],
  },
  {
    name: "Routing",
    components: ["Routes", "Route", "NavLink"],
    notes: [
      "- Wrap a list of `Route(path, content)` entries inside `Routes(...)` to declare a multi-page UI.",
      "- Use `NavLink(label, to)` for navigation and `@Navigate(\"/path\")` action steps for programmatic moves.",
      "- Inside a Route's content, read URL params via the `params` loop variable (e.g. `params.id` for `/users/:id`).",
      "- The current path is also available as `$route` so any expression can react to it.",
    ],
  },
];

export const defaultLibrary: ComponentLibrary = {
  root: "Stack",
  components,
  componentGroups,
};
