/**
 * Built-in component library for `<streaming-ui-script>`.
 *
 * Exports a single `defaultLibrary` that ships with the package. Consumers can
 * extend it via `<streaming-ui-script>.registerComponents([...])`.
 */

import type { ComponentLibrary, ComponentSpec, ComponentGroup } from "./types.js";
import {
  Stack, Section, Card, CardHeader, CardBody, CardFooter, Divider, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps, StepsItem,
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
import { Script } from "./components/scripts.js";
import { Routes, Route, NavLink } from "./components/router.js";

export * from "./types.js";
export * from "./registry.js";

const components: ComponentSpec[] = [
  Stack, Section, Card, CardHeader, CardBody, CardFooter, Divider, Separator,
  Tabs, TabItem, Accordion, AccordionItem, Modal, Steps, StepsItem,
  TextContent, Header, Image, Link, Badge, Tag, TagBlock,
  Alert, Callout, CodeBlock, Skeleton, Markdown,
  Form, FormControl, Input, TextArea, Select, SelectItem, Checkbox,
  CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons,
  Table, Col, List, ListItem, StatCard,
  BarChart, LineChart, PieChart, Series,
  SectionBlock, ListBlock, FollowUpBlock, FollowUpItem, ActionLink,
  Script,
  Routes, Route, NavLink,
];

const componentGroups: ComponentGroup[] = [
  {
    name: "Layout",
    components: [
      "Stack", "Section", "Card", "CardHeader", "CardBody", "CardFooter",
      "Divider", "Separator", "Tabs", "TabItem", "Accordion", "AccordionItem",
      "Modal", "Steps", "StepsItem",
    ],
    notes: [
      "- `root` MUST be `Stack(...)` and contain at least one child.",
      "- Wrap each major chunk of content in a `Card(...)` for visual grouping.",
      "- Use `Stack` `direction=\"row\"` with `wrap=true` for grid-like layouts.",
      "- Use `Separator` (or `Divider`) between sections to add visual breaks.",
    ],
  },
  {
    name: "Content",
    components: [
      "TextContent", "Header", "Image", "Link", "Badge", "Tag", "TagBlock",
      "Alert", "Callout", "CodeBlock", "Skeleton", "Markdown",
    ],
    notes: [
      "- Prefer `Markdown(...)` for rich paragraph text with inline formatting.",
      "- Use `Callout(variant, title, description)` for highlighted notices.",
      "- Use `CodeBlock(\"language\", \"source...\")` for read-only code snippets.",
      "- Use `TagBlock([\"a\",\"b\",\"c\"])` to render an array of strings as tag pills.",
    ],
  },
  {
    name: "Forms",
    components: [
      "Form", "FormControl", "Input", "TextArea", "Select", "SelectItem",
      "Checkbox", "CheckBoxGroup", "CheckBoxItem", "Radio", "Button", "Buttons",
    ],
    notes: [
      "- Each FormControl should be a separate reference for progressive streaming.",
      "- Pass a `$variable` as the last argument to `Input`, `Select`, `Checkbox`, or `CheckBoxGroup` for two-way binding.",
      "- For multi-select boolean groups, use `CheckBoxGroup(name, [CheckBoxItem(...)], $value)`.",
      "- A submit button should run `Action([@Run(mutation), @Run(query), @Reset($var1, $var2)])`.",
    ],
  },
  {
    name: "Data",
    components: ["Table", "Col", "List", "ListItem", "StatCard"],
    notes: [
      "- Build columns using array pluck: `Col(\"Title\", data.rows.title)`.",
      "- For per-row controls inside a Col, use `@Each(data.rows, \"row\", ...)` and reference `row.field` inline.",
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
    name: "Chat",
    components: ["SectionBlock", "ListBlock", "FollowUpBlock", "FollowUpItem", "ActionLink"],
    notes: [
      "- End most responses with a `FollowUpBlock` of 2–4 short prompts to keep the conversation moving.",
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
