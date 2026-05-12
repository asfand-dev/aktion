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
} from "./components/content.js";
import {
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons,
} from "./components/forms.js";
import {
  Table, Col, List, ListItem, StatCard,
} from "./components/data.js";
import { BarChart, LineChart, PieChart, Series } from "./components/charts.js";
import {
  SectionBlock, ListBlock, FollowUpBlock, FollowUpItem, ActionLink,
} from "./components/chat.js";
import {
  Avatar, AvatarGroup, Progress, Switch, Toggle, ToggleGroup,
  Tooltip, HoverCard, Kbd,
} from "./components/feedback.js";
import {
  Breadcrumb, BreadcrumbItem, Pagination, Sheet,
} from "./components/navigation.js";
import {
  Hero, PageHeader, MetricGrid, EmptyState,
  Timeline, TimelineItem, FeatureGrid, FeatureItem,
  Testimonial, ProfileCard, Comment, Banner,
  KanbanBoard, KanbanColumn, KanbanCard,
} from "./components/patterns.js";
import { Script } from "./components/scripts.js";
import { Routes, Route, NavLink } from "./components/router.js";

export * from "./types.js";
export * from "./registry.js";

const components: ComponentSpec[] = [
  Stack, Grid, Section, Card, CardHeader, CardBody, CardFooter, Divider, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps, StepsItem,
  AspectRatio, ScrollArea,
  TextContent, Header, Image, Link, Badge, Tag, TagBlock,
  Alert, Callout, CodeBlock, Skeleton, Markdown,
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons,
  Table, Col, List, ListItem, StatCard,
  BarChart, LineChart, PieChart, Series,
  SectionBlock, ListBlock, FollowUpBlock, FollowUpItem, ActionLink,
  Avatar, AvatarGroup, Progress, Switch, Toggle, ToggleGroup,
  Tooltip, HoverCard, Kbd,
  Breadcrumb, BreadcrumbItem, Pagination, Sheet,
  Hero, PageHeader, MetricGrid, EmptyState,
  Timeline, TimelineItem, FeatureGrid, FeatureItem,
  Testimonial, ProfileCard, Comment, Banner,
  KanbanBoard, KanbanColumn, KanbanCard,
  Script,
  Routes, Route, NavLink,
];

const componentGroups: ComponentGroup[] = [
  {
    name: "Layout",
    components: [
      "Stack", "Grid", "Section", "Card", "CardHeader", "CardBody", "CardFooter",
      "Divider", "Separator", "Tabs", "TabItem", "Accordion", "AccordionItem",
      "Modal", "Sheet", "Steps", "StepsItem", "AspectRatio", "ScrollArea",
    ],
    notes: [
      "- `root` MUST be `Stack(...)` and contain at least one child.",
      "- Wrap each major chunk of content in a `Card(...)` for visual grouping.",
      "- Prefer `Grid(...)` over `Stack` with `direction=\"row\" wrap=true` when children should size uniformly (KPIs, feature tiles, card grids).",
      "- Use `Separator` (or `Divider`) between sections to add visual breaks.",
      "- Use `Sheet` for side-panel detail views, `Modal` for centered dialogs.",
    ],
  },
  {
    name: "Content",
    components: [
      "TextContent", "Header", "Image", "Link", "Badge", "Tag", "TagBlock",
      "Alert", "Callout", "CodeBlock", "Skeleton", "Markdown", "Kbd",
    ],
    notes: [
      "- Prefer `Markdown(...)` for rich paragraph text with inline formatting.",
      "- Use `Callout(variant, title, description)` for highlighted notices.",
      "- Use `CodeBlock(\"language\", \"source...\")` for read-only code snippets.",
      "- Use `TagBlock([\"a\",\"b\",\"c\"])` to render an array of strings as tag pills.",
      "- Use `Kbd([\"Cmd\", \"K\"])` when referring to keyboard shortcuts.",
    ],
  },
  {
    name: "Forms",
    components: [
      "Form", "FormControl", "Input", "TextArea", "Select", "SelectItem",
      "Checkbox", "CheckBoxGroup", "CheckBoxItem", "Radio", "Switch", "Toggle",
      "ToggleGroup", "Button", "Buttons",
    ],
    notes: [
      "- Each FormControl should be a separate reference for progressive streaming.",
      "- Pass a `$variable` as the last argument to `Input`, `Select`, `Checkbox`, `Switch`, or `CheckBoxGroup` for two-way binding.",
      "- Prefer `Switch` over `Checkbox` for settings, `ToggleGroup` for view-mode pickers.",
      "- A submit button should run `Action([@Run(mutation), @Run(query), @Reset($var1, $var2)])`.",
    ],
  },
  {
    name: "Data",
    components: ["Table", "Col", "List", "ListItem", "StatCard", "Progress", "Pagination"],
    notes: [
      "- Build columns using array pluck: `Col(\"Title\", data.rows.title)`.",
      "- For per-row controls inside a Col, use `@Each(data.rows, \"row\", ...)` and reference `row.field` inline.",
      "- Use `Progress(value, max?, label?, tone?)` for upload/loading/quota bars.",
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
    components: ["Avatar", "AvatarGroup", "Tooltip", "HoverCard"],
    notes: [
      "- `Avatar(name, src?, size?, status?)` falls back to initials when the image is missing.",
      "- Use `AvatarGroup` to render contributor strips with a `+N` overflow chip.",
      "- Wrap any node in `Tooltip(label, trigger)` for inline hints.",
      "- Use `HoverCard(trigger, content)` when the popover needs rich content (profile preview, link target).",
    ],
  },
  {
    name: "Navigation",
    components: ["Breadcrumb", "BreadcrumbItem"],
    notes: [
      "- Use `Breadcrumb([\"Workspace\", \"Reports\", \"Q3\"])` at the top of every detail page so users see the path.",
      "- For per-item links, pass `BreadcrumbItem(label, href)` nodes instead of strings.",
    ],
  },
  {
    name: "Chat",
    components: ["SectionBlock", "ListBlock", "FollowUpBlock", "FollowUpItem", "ActionLink"],
    notes: [
      "- End most responses with a `FollowUpBlock` of 2–4 short prompts to keep the conversation moving.",
    ],
  },
  {
    name: "Patterns",
    components: [
      "Hero", "PageHeader", "MetricGrid", "EmptyState",
      "Timeline", "TimelineItem", "FeatureGrid", "FeatureItem",
      "Testimonial", "ProfileCard", "Comment", "Banner",
      "KanbanBoard", "KanbanColumn", "KanbanCard",
    ],
    notes: [
      "- Patterns are **opinionated composites** that pack an entire UI idiom into one component. Reach for them BEFORE composing equivalent layouts by hand with Card+Stack — the result will look more polished and require fewer tokens.",
      "- `Hero(title, subtitle, primary, secondary, eyebrow?, highlights?, tone?)` — landing-style header. Pair with a FeatureGrid below.",
      "- `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)` — the canonical first child for any dashboard or detail page.",
      "- `MetricGrid([statCard1, statCard2, …])` — responsive KPI strip. Always prefer this over a `Stack(direction=\"row\")` of StatCards.",
      "- `EmptyState(title, description?, icon?, action?)` — render this when a list is empty rather than an empty Card.",
      "- `Timeline([TimelineItem(...)])` — vertical event feed (audit log, changelog, activity).",
      "- `FeatureGrid([FeatureItem(...)])` — feature highlights with iconography.",
      "- `KanbanBoard([KanbanColumn(\"To do\", [KanbanCard(...), ...])])` — task boards.",
    ],
  },
  {
    name: "Scripting",
    components: ["Script"],
    notes: [
      "- Only available when the host page enables JavaScript interactions (`<streaming-ui-script enable-javascript=\"true\">`).",
      "- Use sparingly: most state can be handled with `$variables` + `Action([@Set(...), @Run(...)])`.",
    ],
  },
  {
    name: "Routing",
    components: ["Routes", "Route", "NavLink"],
    notes: [
      "- Only available when the host page enables routing (`<streaming-ui-script enable-routes=\"true\">`).",
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
