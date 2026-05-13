/**
 * Built-in component library for `<streaming-ui-script>`.
 *
 * Exports a single `defaultLibrary` that ships with the package. Consumers can
 * extend it via `<streaming-ui-script>.registerComponents([...])`.
 */

import type { ComponentLibrary, ComponentSpec, ComponentGroup } from "./types.js";
import {
  Stack, Grid, Section, Card, CardHeader, CardBody, CardFooter, Divider, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps, StepsItem,
  AspectRatio, ScrollArea,
} from "./components/layout.js";
import {
  TextContent, Header, Image, Link, Badge, Tag, TagBlock,
  Alert, Callout, CodeBlock, Skeleton, Markdown,
  Container, Spacer, Quote, Note, Icon,
} from "./components/content.js";
import {
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, SearchBar,
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
} from "./components/forms.js";
import {
  Table, Col, List, ListItem, StatCard, Tree, TreeNode,
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
import { Script } from "./components/scripts.js";
import { Routes, Route, NavLink } from "./components/router.js";

export * from "./types.js";
export * from "./registry.js";

const components: ComponentSpec[] = [
  Stack, Grid, Section, Card, CardHeader, CardBody, CardFooter, Divider, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps, StepsItem,
  AspectRatio, ScrollArea, Container, Spacer,
  TextContent, Header, Image, Link, Badge, Tag, TagBlock,
  Alert, Callout, CodeBlock, Skeleton, Markdown, Quote, Note, Icon,
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, SearchBar,
  Slider, NumberInput, DatePicker, FileUpload, Combobox,
  Table, Col, List, ListItem, StatCard, Tree, TreeNode,
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
  Script,
  Routes, Route, NavLink,
];

const componentGroups: ComponentGroup[] = [
  {
    name: "Layout",
    components: [
      "Stack", "Grid", "Section", "Container", "Spacer", "Card", "CardHeader", "CardBody", "CardFooter",
      "Divider", "Separator", "Tabs", "TabItem", "Accordion", "AccordionItem",
      "Modal", "Sheet", "Steps", "StepsItem", "AspectRatio", "ScrollArea",
    ],
    notes: [
      "- `root` MUST be `Stack(...)` and contain at least one child.",
      "- Wrap each major chunk of content in a `Card(...)` for visual grouping.",
      "- Prefer `Grid(...)` over `Stack` with `direction=\"row\" wrap=true` when children should size uniformly (KPIs, feature tiles, card grids).",
      "- Use `Container(children, size?)` to centre a wide page within a comfortable max-width (landing pages, articles, marketing sections).",
      "- Use `Spacer()` inside `Stack(direction=\"row\")` to push the next item to the far edge; pass a `size` for an explicit fixed gap.",
      "- Use `Separator` (or `Divider`) between sections to add visual breaks.",
      "- Use `Sheet` for side-panel detail views, `Modal` for centered dialogs.",
    ],
  },
  {
    name: "Content",
    components: [
      "TextContent", "Header", "Image", "Link", "Badge", "Tag", "TagBlock",
      "Alert", "Callout", "Note", "Quote", "CodeBlock", "Skeleton", "Markdown", "Kbd", "Icon",
    ],
    notes: [
      "- Prefer `Markdown(...)` for rich paragraph text with inline formatting.",
      "- Use `Callout(variant, title, description)` for highlighted notices.",
      "- Use `Note(content, tone?, icon?)` for compact tips/warnings inline (lighter than `Callout`).",
      "- Use `Quote(text, cite?)` for inline pull-quotes inside articles and marketing sections (use `Testimonial` when you also have author/role/rating).",
      "- Use `CodeBlock(\"language\", \"source...\")` for read-only code snippets.",
      "- Use `TagBlock([\"a\",\"b\",\"c\"])` to render an array of strings as tag pills.",
      "- Use `Kbd([\"Cmd\", \"K\"])` when referring to keyboard shortcuts.",
      "- Use `Icon(name, variant?, size?)` to render a standalone Font Awesome icon (`name` is the FA name without the `fa-` prefix, e.g. `\"house\"`, `\"chart-line\"`, `\"regular:star\"`, `\"brands:github\"`).",
    ],
  },
  {
    name: "Forms",
    components: [
      "Form", "FormControl", "Input", "TextArea", "Select", "SelectItem",
      "Checkbox", "CheckBoxGroup", "CheckBoxItem", "Radio", "Switch", "Toggle",
      "ToggleGroup", "Button", "Buttons", "SearchBar",
      "Slider", "NumberInput", "DatePicker", "FileUpload", "Combobox",
    ],
    notes: [
      "- Each FormControl should be a separate reference for progressive streaming.",
      "- Pass a `$variable` as the last argument to `Input`, `Select`, `Checkbox`, `Switch`, or `CheckBoxGroup` for two-way binding.",
      "- Prefer `Switch` over `Checkbox` for settings, `ToggleGroup` for view-mode pickers.",
      "- Reach for `SearchBar(id, placeholder?, value?, shortcut?)` instead of a raw `Input` whenever the field's purpose is to filter content. It ships with the magnifier icon and keyboard hint baked in.",
      "- `Slider(id, min?, max?, step?, value?, label?, showValue?)` is the canonical control for numeric ranges (volume, brightness, filters); pass a `$variable` as `value` for two-way binding.",
      "- `NumberInput(id, value?, min?, max?, step?, placeholder?)` is friendlier than `Input(type=\"number\")` for quantity steppers and integer settings — it ships with +/- buttons that respect `min`/`max`.",
      "- `DatePicker(id, value?, label?, min?, max?, placeholder?)` wraps the native date picker; pass `value` as a `$variable` for two-way binding (ISO `YYYY-MM-DD`).",
      "- `Combobox(id, items, value?, placeholder?, emptyLabel?)` is the searchable single-select alternative to `Select` — type to filter long option lists (countries, currencies, users).",
      "- `FileUpload(id, label?, hint?, accept?, multiple?, action?)` is the styled file picker; the picked files cannot pass through a `$variable`, so use the `action` with an `@Js` step to read them.",
      "- A submit button should run `Action([@Run(mutation), @Run(query), @Reset($var1, $var2)])`.",
    ],
  },
  {
    name: "Data",
    components: ["Table", "Col", "List", "ListItem", "StatCard", "Stats", "Tile", "Progress", "ProgressRing", "Pagination", "Tree", "TreeNode"],
    notes: [
      "- Build columns using array pluck: `Col(\"Title\", data.rows.title)`.",
      "- For per-row controls inside a Col, use `@Each(data.rows, \"row\", ...)` and reference `row.field` inline.",
      "- Use `Progress(value, max?, label?, tone?)` for linear bars; `ProgressRing(value, max?, label?, tone?, size?)` for circular quotas/completion.",
      "- `Stats([{label, value, hint?, tone?}, …])` is the compact inline stat strip — lighter than `MetricGrid`, perfect inside a chart Card or beneath a header.",
      "- `Tile(label, icon?, value?, description?, tone?, action?)` is the dense icon tile for quick-action menus and category grids; pair with `Grid` for uniform rows.",
      "- `Tree([TreeNode(label, children?, icon?, expanded?, active?, badge?, action?)])` renders a hierarchical tree (file browsers, nested navigation, category pickers); use `expanded=true` to open a branch by default.",
      "- Pagination binds to a `$page` $variable; reuse the same variable when slicing data with `@Filter` / `@Each`.",
    ],
  },
  {
    name: "Charts",
    components: ["BarChart", "LineChart", "PieChart", "Series"],
    notes: [
      "- Use `LineChart` for trends, `BarChart` for comparisons, `PieChart` for proportions.",
      "- Pass series via `Series(\"Name\", [...numbers])`.",
    ],
  },
  {
    name: "Feedback & Media",
    components: ["Avatar", "AvatarGroup", "PersonChip", "Tooltip", "HoverCard", "Popover", "Rating", "Toast", "Toasts"],
    notes: [
      "- `Avatar(name, src?, size?, status?)` falls back to initials when the image is missing.",
      "- Use `AvatarGroup` to render contributor strips with a `+N` overflow chip.",
      "- `PersonChip(name, role?, avatarSrc?, size?, status?, action?)` is the inline avatar + name + role pill — use everywhere a person is referenced (table cells, list rows, sidebar footers, kanban cards) instead of a raw `Avatar` next to `TextContent`.",
      "- Wrap any node in `Tooltip(label, trigger)` for inline hints.",
      "- Use `HoverCard(trigger, content)` when the popover needs rich content (profile preview, link target) and the trigger should open on hover.",
      "- `Popover(trigger, content, title?, side?, align?, width?)` is the click-triggered counterpart of `HoverCard` — use for filter panels, color pickers, share menus, and small settings flyouts. Always renders an × close button in the header; clicking the trigger again, clicking outside, or pressing Escape also closes it.",
      "- `Rating(value, max?, label?, count?, size?, interactive?)` renders stars for product reviews, testimonials, and ranked lists. Pass a `$variable` as `value` with `interactive=true` to let users rate.",
      "- `Toasts([Toast(...)], position?)` pins a fixed corner stack of transient `Toast(title, message?, tone?, icon?, duration?, action?, onClose?)` cards. Every Toast always shows a × close button; pass `duration` (ms) for auto-dismiss, omit it for a persistent toast. Drive the list via a `$toasts` $variable plus `@Push`/`@Filter`. Use `Banner` for top-of-page announcements and `Notification` for permanent inbox entries.",
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
      "Hero", "Cover", "PageHeader", "MetricGrid", "EmptyState",
      "Timeline", "TimelineItem", "FeatureGrid", "FeatureItem",
      "Testimonial", "ProfileCard", "Comment", "Banner", "Notification",
      "MediaCard",
      "KanbanBoard", "KanbanColumn", "KanbanCard",
      "SectionHeader", "Toolbar", "DescriptionList", "DescriptionItem",
      "StatusDot", "PricingTable", "PricingCard",
    ],
    notes: [
      "- Patterns are **opinionated composites** that pack an entire UI idiom into one component. Reach for them BEFORE composing equivalent layouts by hand with Card+Stack — the result will look more polished and require fewer tokens.",
      "- `Hero(title, subtitle, primary, secondary, eyebrow?, highlights?, tone?)` — landing-style text-first header. Pair with a FeatureGrid below.",
      "- `Cover(title, imageSrc, subtitle?, eyebrow?, caption?, actions?, tone?, height?)` — image-backed hero band. Use for product, article, or campaign top sections.",
      "- `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)` — the canonical first child for any dashboard or detail page.",
      "- `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)` — sub-header inside a Card or panel. Use instead of bare `CardHeader` when the section also needs eyebrow / actions / status.",
      "- `MetricGrid([statCard1, statCard2, …])` — responsive KPI strip. Always prefer this over a `Stack(direction=\"row\")` of StatCards.",
      "- `Toolbar(left?, right?)` — filter/search/actions row above a list, table, or board. Reach for it instead of a hand-rolled `Stack(direction=\"row\")`.",
      "- `EmptyState(title, description?, icon?, action?)` — render this when a list is empty rather than an empty Card.",
      "- `Timeline([TimelineItem(...)])` — vertical event feed (audit log, changelog, activity).",
      "- `FeatureGrid([FeatureItem(...)])` — feature highlights with iconography.",
      "- `MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?, ratio?)` — image + content card. Use for article previews, product cards, project highlights. Pair with `Grid` for uniform card rows.",
      "- `KanbanBoard([KanbanColumn(\"To do\", [KanbanCard(...), ...])])` — task boards.",
      "- `DescriptionList([DescriptionItem(\"Status\", Tag(...)), …])` — detail-page key/value summary. Always preferable to a Stack of TextContent rows on profile, billing, or metadata panels.",
      "- `StatusDot(label, tone?, pulse?)` — inline status pip. Use in toolbars, list rows, table cells, sidebars.",
      "- `Notification(title, message?, time?, icon?, avatarSrc?, tone?, unread?, actions?)` — inline notification card for notification panels / inboxes (prefer `Banner` for top-of-page announcements).",
      "- `PricingTable([PricingCard(plan, price, period?, description?, features?, action?, badge?, featured?)])` — full pricing page block.",
    ],
  },
  {
    name: "App shell",
    components: [
      "AppShell", "Sidebar", "SidebarSection", "SidebarItem", "SplitView",
    ],
    notes: [
      "- App shell components produce a **full SaaS-style layout in a single statement**. Use them whenever the response represents a complete product surface (dashboards with nav, settings sections, admin consoles, inboxes).",
      "- `AppShell(sidebar, content, topbar?)` — fixed-left navigation + scrollable main area. The `content` usually starts with a `PageHeader`.",
      "- `Sidebar(items, brand?, tagline?, footer?)` + `SidebarItem(label, icon?, active?, badge?, action?)` + `SidebarSection(label, items)` — group nav links into sections, mark the current page with `active=true`, attach badges for counts.",
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
