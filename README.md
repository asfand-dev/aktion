# aktion

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-github%20pages-6366f1)](https://asfand-dev.github.io/aktion/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-10b981.svg)](#contributing)

A framework-agnostic web component that renders LLM-generated UI from
**Aktion** — a compact, declarative language designed for chat
assistants. Drop one `<script>` tag and one `<aktion-app>` tag into
any HTML page and you have a streaming, interactive renderer for an LLM's
response.

```html
<script type="module" src="https://asfand-dev.github.io/aktion/dist/aktion.js"></script>
<aktion-app theme="light">
  _app_ = Card([
    CardHeader("Hello", subtitle: "Generative UI in plain HTML"),
    Markdown("This card was streamed in as **plain text**.")
  ])
</aktion-app>
```

That is the whole integration. Works in React, Vue, Angular, Svelte, plain
HTML, or no framework at all.

- **Docs site:** <https://asfand-dev.github.io/aktion/>
- **Live examples:** <https://asfand-dev.github.io/aktion/live-examples.html>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/aktion/dist/aktion.js>
- **System prompt (full):** <https://asfand-dev.github.io/aktion/dist/system_prompt.txt>
- **System prompt (chat):** <https://asfand-dev.github.io/aktion/dist/system_prompt_chat.txt>
- **Deep authoring guide:** [`coding-gen-skill.md`](./coding-gen-skill.md)

---

## Table of contents

- [What's in the box](#whats-in-the-box)
- [Quick start](#quick-start)
- [Public API](#public-api)
- [Aktion — the language](#aktion--the-language)
- [Component library](#component-library)
- [Themes](#themes)
- [Icons](#icons)
- [Routing](#routing)
- [JavaScript escape hatch](#javascript-escape-hatch)
- [Built-in globals (`storage`, `console`)](#built-in-globals)
- [Internationalization (`i18n`)](#internationalization)
- [System prompt generator](#system-prompt-generator)
- [Tooling](#tooling)
- [Documentation site](#documentation-site)
- [Live examples](#live-examples)
- [Project layout](#project-layout)
- [Run it locally](#run-it-locally)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## What's in the box

Everything you need at runtime ships in a single bundle:

- **A streaming-first parser.** Line-oriented, error-tolerant. Each
  statement commits to the DOM as soon as it arrives. Single, double, and
  backtick-quoted strings (with `${expression}` interpolation). `js{ … }`
  opaque blocks and `{ … }` declaration bodies for `component` / `effect` /
  `action`.
- **One reactive atom kind.** Declare any reactive state with `$name = value`
  and read or write it with `$name`. The runtime tracks dependencies
  automatically. Template literals, spread, bracket access, optional
  chaining, nullish coalescing, expression-form `if` / `match` / `for`,
  lambdas (`(p) => …`), `bind:prop: $atom` two-way binding, and **30+ pure
  `@`-functions** (`@Filter`, `@Sort`, `@Find`, `@GroupBy`, `@Format`,
  `@FormatDate`, `@Plural`, `@Case`, `@Range`, `@Pick`, …).
- **One HTTP primitive.** `http({ url, method, headers, body, query, ... })`
  is the only network call. It returns a reactive resource bag exposing
  `data | error | status | loading | headers | lastUpdated`, plus the
  callables `refetch()` and `cancel()`. Re-runs automatically when any
  reactive input in the options object changes.
- **`storage` and `console` globals.** Always in scope. `storage.set/get`
  (localStorage by default), `storage.session.*`, `storage.cookies.*` with
  named-arg options, and `console.log/error/warn/info/debug`. No `js{}`
  escape hatch needed.
- **A React-like DOM reconciler.** Diffs each re-render against the live
  DOM. Text-input value, selection, IME state, scroll positions,
  `<details>.open`, and stateful primitives like `Tabs` are all preserved
  across renders. Components that need to hold UI state get a
  `helpers.useInstanceState(...)` slot keyed by their position in the tree.
- **A rich component library** of **130+ components** spanning layout,
  forms, charts, data, feedback, navigation, patterns, app-shell composites,
  editors, advanced UI, and standard helpers. See [Component library](#component-library).
- **Declarative side effects.** `effect [ ...deps ] { … }` for background
  work — anonymous blocks where the dependency list mixes state triggers
  (`$atom`), lifecycle triggers (`on:mount`, `on:unmount`, `on:every(N)`),
  and rate-limit modifiers (`debounce(N)`, `throttle(N)`). `effect { … }`
  with an empty list is equivalent to `effect [on:mount] { … }`. Declare
  an effect **at the top level** for program-wide work, or **inside a
  `component { … }` body** to scope it to a single instance — timers,
  watched atoms, and `cleanup(fn)` registrations tear down when the
  component leaves the tree. `action Name(args) { … }` declares
  click-driven mutations and may optionally `return` a value.
- **A built-in router.** `pages = _router_({ "/path": Component(), "/users/:id": UserPage(id: params.id), default: NotFound() })` plus
  `NavLink(label, to)` and a reserved `_route_` handle that exposes
  `_route_.path`, `_route_.params`, `_route_.query`, `_route_.pattern`,
  and `_route_.navigate("/path")`. Hash-based, framework-agnostic,
  always wired up.
- **Seven built-in themes** (`light`, `dark`, `neon`, `pastel`, `glass`,
  `brutalist`, `skyline`) plus full custom-token support via CSS custom
  properties. **50+ design tokens** organised into `colors`, `radius`,
  `font`, `motion`, and `elevation` groups. Brand the UI from inside the
  script with `theme = Theme({...})`.
- **`i18n` runtime.** `$i18n = i18n({ locale, messages, fallback })` plus
  a global `t("key", vars?)` builtin and a `Locale()` helper that feeds
  the active locale into `@Format` / `@FormatDate`.
- **Font Awesome 6.7.2** auto-loaded — every `icon` prop accepts a Free
  Font Awesome name (no `fa-` prefix). Use `Icon(name, variant?, size?)`
  for standalone glyphs. Variant prefixes supported: `"regular:star"`,
  `"brands:github"`.
- **A system prompt generator.** Emits a clean, ordered prompt teaching
  the LLM exactly which components, builtins, and tools are available.
  Two flavours ship: `system_prompt.txt` (full — every feature) and
  `system_prompt_chat.txt` (compact — read-only UI conversion).
- **Host-side tooling.** A canonical formatter, structured-edit delta
  protocol, AST inspector, and LSP-ready language service all exported
  from `aktion/tooling`.

Everything lives inside a Shadow DOM, so the renderer's styles never leak
into your application — and your application's styles never leak into the
renderer.

---

## Quick start

### 1. Load the bundle

Use the CDN build (no install, just a script tag):

```html
<script type="module" src="https://asfand-dev.github.io/aktion/dist/aktion.js"></script>
```

For non-module setups (older bundlers, embedded contexts) use the IIFE build:

```html
<script src="https://asfand-dev.github.io/aktion/dist/aktion.iife.js" defer></script>
```

…or install from npm and import once from your client-side entry point:

```bash
npm install aktion-runtime
# yarn add aktion-runtime
# pnpm add aktion-runtime
```

```js
import "aktion-runtime";
```

The package is published as
[`aktion-runtime`](https://www.npmjs.com/package/aktion-runtime). The
npm tarball ships only the compiled `dist/` output (ESM + CJS + UMD +
IIFE bundles, type declarations, the stylesheet, and the two
`system_prompt*.txt` files), so installs stay small. Subpath imports
are available for convenience:

```js
import "aktion-runtime/style.css";
const SYSTEM_PROMPT = await fetch(
  new URL("aktion-runtime/system_prompt.txt", import.meta.url),
).then((r) => r.text());
```

The CSS is bundled inside the JS and injected into each instance's shadow
root, so you do **not** need a separate stylesheet.

### 2. Mount the tag

```html
<aktion-app id="reply" theme="light"></aktion-app>
```

### 3. Render a response

Three equivalent ways:

```html
<!-- as an attribute -->
<aktion-app response='_app_ = Card([CardHeader("Hi")])'></aktion-app>

<!-- as inner text (rendered on connect) -->
<aktion-app>
  _app_ = Card([CardHeader("Hi")])
</aktion-app>

<!-- as a property/method -->
<script>
  const el = document.querySelector("aktion-app");
  el.setResponse(`
    _app_ = Stack([greeting])
    greeting = Card([CardHeader("Hello", subtitle: "Generative UI in plain HTML")])
  `);
</script>
```

### 4. Stream from your LLM

```js
const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ system: systemPrompt, messages }),
});
const reader = response.body.getReader();
const decoder = new TextDecoder();

el.streaming = true;
el.clear();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  el.appendChunk(decoder.decode(value, { stream: true }));
}
el.streaming = false;
```

### 5. Send the system prompt

Either fetch the auto-generated `system_prompt.txt` from the CDN:

```js
const systemPrompt = await fetch(
  "https://asfand-dev.github.io/aktion/dist/system_prompt.txt",
).then((r) => r.text());
```

…or build a richer prompt programmatically:

```js
const prompt = el.getSystemPrompt({
  mode: "full", // or "chat" for the compact read-only prompt
  preamble: "You are an analytics assistant.",
  additionalRules: ["Always end with a FollowUpBlock of 2 prompts."],
  tools: [{ name: "list_orders", description: "Return recent orders.", argsExample: { limit: 10 } }],
});
```

### 6. (Optional) Provide tools

Register host-side async functions exposed to `js{}` bodies as
`ctx.tools.<name>(args)`:

```js
el.setTools({
  list_orders: async ({ limit }) => fetch(`/api/orders?limit=${limit}`).then(r => r.json()),
  update_order: async ({ id, status }) =>
    fetch(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(r => r.json()),
});
```

### 7. (Optional) Listen for assistant messages

Wire LLM-driven follow-ups back into your chat loop:

```js
el.addEventListener("assistant-message", (event) => {
  appendUserMessageToChat(event.detail.message);
});
```

---

## Public API

All members live on the `<aktion-app>` element.

### Attributes

| Attribute       | Values                                          | Description                                                                         |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `theme`         | Theme name or JSON token map                    | Switches the theme. JSON objects are merged on top of the default `light` tokens.   |
| `streaming`     | `true` / unset                                  | Hint that text is still being appended. The error banner is suppressed while set.   |
| `response`      | Aktion text                        | Sets the program declaratively. Re-renders whenever the attribute changes.          |
| `showerrors`    | `true` / unset                                  | If present and `true`, displays parse errors in the rendered UI. Defaults to off.   |

Routing and the JavaScript escape hatch (`js{ … }` inside `effect` /
`action` bodies) are always available — no host attribute, no allow-list.
To omit those surfaces from the *generated prompt*, build it via
`getSystemPrompt({ mode: "chat" })`.

### Properties

| Property      | Type                          | Description                                                                            |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `response`    | `string`                      | Get or set the current program text. Setter is equivalent to `setResponse(text)`.       |
| `streaming`   | `boolean`                     | Reflects the `streaming` attribute.                                                    |
| `showErrors`  | `boolean`                     | Reflects the `showerrors` attribute.                                                   |
| `route`       | `string` (read-only)          | Current path tracked by the router (e.g. `"/users/42"`).                               |

### Methods

| Method                                                          | Description                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `setResponse(text)`                                             | Replace the program (one-shot rendering). Resets state and queries.                                                          |
| `appendChunk(chunk)`                                            | Append a streaming chunk and re-render.                                                                                      |
| `clear()`                                                       | Reset state, queries, and the rendered output.                                                                               |
| `setTheme(name \| tokens)`                                      | Apply a built-in theme by name or a partial token map.                                                                       |
| `setTools(tools)`                                               | Register host async tools exposed to `js{}` blocks as `ctx.tools.<name>(args)`. Replaces previously-registered tools.        |
| `registerComponents(specs, root?)`                              | Extend the built-in library with your own components.                                                                        |
| `getSystemPrompt(options?)`                                     | Build a system prompt that matches the current library and tools. Pass `{ mode: "chat" }` for the compact variant.            |
| `navigate(path)`                                                | Programmatically navigate. Updates `window.location.hash`.                                                                   |
| `registerHttpInterceptors({ onRequest?, onResponse?, onError? })` | Install interceptors for the `http({...})` layer. `onResponse` receives a `retry()` one-shot for e.g. 401 refresh flows.       |
| `serializeState()`                                              | Return every reactive atom as a plain JSON-friendly object (for SSR / resumption).                                           |
| `hydrateState(snapshot)`                                        | Apply a snapshot to the live store and schedule a re-render. Atoms not in the snapshot are untouched.                        |
| `loadSnapshot({ programText, state })`                          | Atomic program + state load. The next render plans the program with the hydrated state already in place.                     |
| `applyDelta(ops)`                                               | Apply a structured delta (`patch` / `replace` / `append` / `new` / `delete`). User `$state` is preserved across the diff.    |

### Events

| Event                | Detail                                        | When it fires                                                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `assistant-message`  | `{ message: string }`                         | When an action or lambda emits `emit "assistant-message" { message: "..." }`.   |
| `error`              | `{ errors: ParseError[] }`                    | After each render whose source had parse errors.                               |
| `route-change`       | `{ path, previousPath, source }`              | When the current hash path changes. `source` is `"init" \| "hashchange" \| "navigate" \| "external"`. |
| `<custom-name>`      | User-defined `{ ... }`                        | When script emits `emit "name" { ... }` inside an `action` / `effect` body.    |

The `error` event always fires regardless of `showerrors`, so host apps
can log or report errors even when the in-page banner is suppressed.

---

## Aktion — the language

A program is a flat list of `name = expression` statements. The renderer
commits each line as soon as it streams in, so the user sees the page
shell before the leaves arrive.

```text
$count = 0
$theme = "dark"

component Counter(label: "Count") {
  return Stack([
    SectionHeader(label),
    Button("Inc", onClick: () => $count = $count + 1),
    Text(`Current: ${$count}`)
  ])
}

action loadOrders() {
  $orders = http({ url: "/api/orders", method: "GET" })
}

effect [$draft, debounce(500)] {
  $save = http({ url: "/api/draft", method: "PUT", body: $draft })
}

$orders = http({
  url:    "/api/users/42/orders",
  method: "GET",
  query:  { limit: 5 }
})

pages = _router_({
  "/":         Counter(),
  "/orders":   Async($orders, loading: Spinner(), data: OrderTable($orders.data)),
  default:     NotFound()
})

_app_ = pages
```

### Key constructs

- `_app_ = …` — the reserved entry point. Every program starts with it.
- `$name = value` — reactive state. One kind. Read or write with the
  same sigil. Inside `action` / `effect` / lambda bodies, assignment
  operators (`= += -= *= /= ??= ++ --`) are all allowed.
- `component Name(p: default) { return Expression }` — first-class
  declarations with default expressions, lexical scope, and per-instance
  state. Inside the body, `$x = expr` is a **declaration**: the
  initializer runs once when the instance first mounts, and re-renders
  preserve whatever value the user (or an action / effect) has written.
  **Always** end with an explicit `return`.
- `action Name(args) { body }` — callable effects with optional
  `return`. Used as event handlers (`onClick: save`) or as expressions
  (`$result = greet("Ada")`).
- `effect [ ...deps ] { body }` — declarative, anonymous side effects.
  The bracketed dependency list mixes state triggers (`$atom`),
  lifecycle / interval triggers (`on:mount`, `on:unmount`,
  `on:every(N)`), and rate-limit modifiers (`debounce(N)`,
  `throttle(N)`). `effect { ... }` (no brackets) is equivalent to
  `effect [on:mount] { ... }`. Declare at the program top level for
  global work, or inside a `component { … }` body to scope the effect
  to that instance — the runtime mounts it on first render and tears
  down its timers / subscriptions / `cleanup(fn)` handlers when the
  instance leaves the tree.
- Expression-form control flow: `if cond { … } else { … }`,
  `match expr { "a": A() default: Else() }`, `for x in xs { Row(x) }`.
  Match and router arms use `:` and `default:` (not `->` / `_`).
- `http({ url, method, headers, body, query, ... })` — the only network
  primitive. Returns a reactive resource with `.data`, `.error`,
  `.status`, `.loading`, `.headers`, `.lastUpdated`, `.refetch()`,
  `.cancel()`.
- `pages = _router_({ "/path": Component(), default: NotFound() })` —
  function-call router. The reserved `_route_` handle exposes the
  reactive surface and a `navigate("/path")` method; each arm body
  additionally receives a scoped `params` loop var with its captures.
- `bind:value: $atom` — two-way binding sugar on inputs.
- Lambdas `(args) => expr` and opaque `js{ … }` blocks placed inside
  `effect` / `action` bodies.
- `emit "name" { detail }` — dispatch an outbound `CustomEvent` on the
  host element.
- Comments: `// line`, `# line`, and `/* block */` — all stripped silently.

### The 60-second pitch

```text
$days = "7"
$data = http({ url: "/api/metrics", method: "GET", query: { days: $days } })

filter = FormControl("Range", control: Select("days",
  items: [SelectItem("7", "7d"), SelectItem("30", "30d")],
  value: $days))
kpi    = StatCard("Events", value: `${$data.data?.events ?? 0}`, trend: "up")
chart  = LineChart(
  labels: $data.data?.daily?.day ?? [],
  series: [Series("Events", $data.data?.daily?.events ?? [])])

_app_ = Stack([CardHeader("Analytics"), filter, kpi, chart])
```

Highlights:

- One statement per line.
- Three string flavours: `"double"`, `'single'`, and `` `backtick` `` with
  `${expression}` interpolation.
- Optional chaining (`obj?.prop`) and nullish coalescing (`a ?? b`).
- Spread in arrays (`[...$pinned, ...$todos]`) and objects
  (`{...$current, status: "done"}`).
- Array shortcuts: `$rows.length`, `$rows.first`, `$rows.last`,
  plus pluck (`$rows.title` → `[title1, title2, …]`).
- Responsive prop maps on layout components:
  `Grid(items, columns: { sm: 1, md: 2, lg: 4 }, gap: "l")`.
- Forward references are allowed — list `_app_ = Stack([...])` first
  and let the children stream in beneath it.

### Declarative todo app (no JS required)

```text
$todos = [{ id: 1, text: "Welcome — try editing", done: false }]
$draft = ""

action add() {
  $todos = [...$todos, { id: $todos.length + 1, text: $draft, done: false }]
  $draft = ""
}

action remove(id) {
  $todos = @Filter($todos, "id", "!=", id)
}

row = (t) => Card([Stack([
  Text(t.text),
  Button("Delete", onClick: () => remove(t.id), variant: "ghost")
])])

list  = for t in $todos { row(t) }
_app_ = Stack([
  Input("draft-input", placeholder: "What needs doing?", value: $draft),
  Button("Add", onClick: add, variant: "primary"),
  list
])
```

### Per-instance state & content-addressed identity

```text
component Counter(label) {
  $n = 0
  return Stack([
    Text(`${label}: ${$n}`),
    Button("inc", onClick: () => $n = $n + 1)
  ])
}

# Two independent counters — each holds its own atom.
_app_ = Stack([Counter("A"), Counter("B")])
```

Every call site accepts a universal `key:` named argument. The renderer
uses it as the instance suffix instead of source location, so reordering
siblings keeps per-instance state attached to the right element:

```text
component TaskRow(task) {
  return Stack([Text(task.title)], key: task.id)
}
```

### Component-scoped effects

`effect [ ...deps ] { … }` blocks can live at the program top level
**or** inside a `component { … }` body. Inside a component body the
runtime mounts the effect when the instance first renders and tears it
down (clearing timers, unsubscribing watched atoms, firing every
registered `cleanup(fn)`) the moment the instance disappears from the
tree. Two `LiveClock()` calls produce two independent intervals — and
removing one stops only that one:

```text
_app_ = Stack([LiveClock("UTC"), LiveClock("Local")])

component LiveClock(label) {
  $now = @Now()
  effect [on:every(1000)] {
    $now = @Now()
  }
  return Stack([Text(label), Text(@FormatDate($now, "time"))])
}
```

Use a top-level `effect [...] { … }` for global work (analytics,
app-wide keyboard shortcuts, hydration of shared atoms); use a
component-local effect whenever the background work logically belongs
to the UI it serves.

### Schema-as-truth diagnostics

`validateProgramSchema(program, library)` (exported from
[`src/library/index.js`](./src/library/index.ts)) emits **hard errors**
for:

- Closed-token enum mismatches (`Button("Save", variant: "magic")`).
- Unknown named args (`Stack(junk: 1)`).
- One-positional-max violations (`Button("Save", "primary", true)` →
  "use `variant: "primary"`, `loading: true`").

The host element merges these into `program.errors` so the on-screen
banner surfaces every violation.

### Anticipatory skeletons

A reference to a component that hasn't been declared yet (and isn't in
the library) renders a `Skeleton` placeholder instead of
`[unknown component: …]`. Mid-stream forward references just shimmer
until the next render pass picks the declaration up.

For the complete language reference see
[`docs/language.html`](./docs/language.html) or, for full apps, the
deep authoring guide [`coding-gen-skill.md`](./coding-gen-skill.md).

---

## Component library

The bundle ships **130+ components** grouped by domain. Reach for **pattern composites**
(`Hero`, `PageHeader`, `Stats`, `Toolbar`, `EmptyState`, `Timeline`,
`KanbanBoard`, `DescriptionList`, `PricingTable`, …) before hand-rolling
the equivalent with `Card` + `Stack` — they're tuned to produce dense,
production-quality SaaS UI in a single line.

| Group              | Components |
| ------------------ | ---------- |
| **Layout**         | `Stack`, `StackItem`, `Grid`, `GridItem`, `Container`, `Box`, `Spacer`, `Card`, `CardHeader`, `CardFooter`, `Separator`, `Tabs`, `TabItem`, `Accordion`, `AccordionItem`, `Modal`, `Drawer`, `Steps`, `AspectRatio`, `ScrollArea`, `Sticky`, `ResizablePanels`, `MasonryGrid` |
| **Content**        | `Text`, `Image`, `Icon`, `Link`, `Badge`, `BadgeList`, `Callout`, `Quote`, `CodeBlock`, `Skeleton`, `Spinner`, `Markdown`, `Kbd` |
| **Forms**          | `Form`, `FormControl`, `FormSection`, `FieldSet`, `ValidationSummary`, `Input`, `TextArea`, `PasswordInput`, `MaskedInput`, `MentionInput`, `TagInput`, `Select`, `SelectItem`, `Combobox`, `MultiSelect`, `Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Switch`, `ToggleGroup`, `Button`, `Buttons`, `SearchBar`, `Slider`, `NumberInput`, `ColorPicker`, `DatePicker`, `DateRangePicker`, `TimePicker`, `DateTimePicker`, `FileUpload`, `PinInput`, `MultiStepForm` |
| **Data**           | `Table`, `Col`, `DataGrid`, `List`, `ListItem`, `StatCard`, `Stats`, `Sparkline`, `Tile`, `Progress`, `ProgressRing`, `Pagination`, `Tree`, `TreeNode`, `CalendarView`, `ComparisonTable`, `InfiniteList` |
| **Charts**         | `BarChart`, `LineChart`, `PieChart`, `RadarChart`, `ScatterChart`, `Histogram`, `Heatmap`, `Gauge`, `Series` |
| **Feedback & Media** | `Avatar`, `AvatarGroup`, `PersonChip`, `Tooltip`, `HoverCard`, `Popover`, `Rating`, `Toast`, `VideoPlayer`, `AudioPlayer`, `Carousel`, `Gallery`, `Lightbox`, `Map` |
| **Navigation**     | `Breadcrumb`, `BreadcrumbItem`, `Navbar`, `NavbarItem`, `TopBar`, `NavLink` (router-aware) |
| **Menus**          | `DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `ContextMenu` |
| **Editors**        | `RichTextEditor`, `CodeEditor` |
| **Chat**           | `SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`, `ActionLink`, `ChatBubble` |
| **Patterns**       | `Hero`, `PageHeader`, `SectionHeader`, `Toolbar`, `EmptyState`, `Timeline`, `TimelineItem`, `ActivityLog`, `FeatureGrid`, `FeatureItem`, `MediaCard`, `Testimonial`, `ProfileCard`, `Comment`, `Banner`, `Notification`, `InboxPanel`, `OnboardingChecklist`, `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `DescriptionList`, `DescriptionItem`, `StatusDot`, `PricingTable`, `PricingCard`, `LoadingState`, `ErrorState`, `SuccessState`, `Tour`, `Spotlight` |
| **App shell**      | `AppShell`, `Sidebar`, `SidebarSection`, `SidebarItem`, `SplitView` |
| **Advanced UI**    | `IconButton`, `CommandPalette`, `FilterChips`, `FieldRepeater`, `VirtualList`, `QueryBuilder`, `DiffViewer`, `JsonTree`, `Gantt`, `Truncate`, `InlineEdit`, `NotificationBell` |
| **Helpers**        | `Async`, `Show`, `Portal`, `Redirect`, `Lazy`, `ErrorBoundary` |
| **Escape hatches** | `HTMLTag`, `Styles` (last-resort raw HTML / CSS — see [language.html](https://asfand-dev.github.io/aktion/language.html#escape-hatches)) |
| **Theming**        | `Theme` |
| **Routing**        | `_router_({ … })`, `NavLink` |

The full catalog with positional signatures, prop tables, enum values, and
live previews is at
[`docs/components.html`](https://asfand-dev.github.io/aktion/components.html).

### Rich pattern composites

```text
action export_q3() { $exp = http({ url: "/exports/q3", method: "POST" }) }
action new_project() { _route_.navigate("/projects/new") }

dashHeader  = PageHeader("Engineering Q3", subtitle: "12 active · 4 at risk", breadcrumbs: ["Workspace", "Engineering"], actions: dashActions, status: Badge("On track", "success"))
dashActions = [Button("Export", onClick: export_q3, variant: "secondary"), Button("New project", onClick: new_project, variant: "primary")]
kpis        = Stats([
  StatCard("Active",  value: "12",  trend: "flat"),
  StatCard("At risk", value: "4",   trend: "up",   delta: "+2"),
  StatCard("Shipped", value: "8",   trend: "up",   delta: "+3"),
  StatCard("On-time", value: "87%", trend: "down", delta: "-3%")
])
board = KanbanBoard([
  KanbanColumn("To do",  items: [KanbanCard("Migrate auth", description: "Roll out new SDK.", tags: ["auth"],     assignee: "Asha")]),
  KanbanColumn("Doing",  items: [KanbanCard("Streaming UI v2", description: "20 new components.", tags: ["frontend"], assignee: "Alex", tone: "primary")]),
  KanbanColumn("Review", items: [KanbanCard("Mobile onboarding", description: "Awaiting design.", tags: ["mobile"], assignee: "Wren", tone: "warning")]),
  KanbanColumn("Done",   items: [KanbanCard("Activity timeline",  description: "Shipped to 100%.", tags: ["shipped"], assignee: "Mira", tone: "success")])
])
follow = FollowUpBlock(["Show at-risk projects", "Compare to Q2", "Who needs help?"])

_app_ = Stack([dashHeader, kpis, board, follow])
```

### Adding your own components

```js
const ProductCard = {
  name: "ProductCard",
  description: "Product tile with title and price.",
  props: [
    { name: "title", type: "string" },
    { name: "price", type: "number" },
  ],
  render: (_node, props) => {
    const div = document.createElement("div");
    div.textContent = `${props.title} — $${props.price}`;
    return div;
  },
};

el.registerComponents([ProductCard]);
```

The next call to `getSystemPrompt()` automatically includes the new component.

---

## Themes

Seven themes are built in. Pick one with `theme="..."` or pass a custom token map.

| Theme        | Vibe                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `light`      | Crisp default, indigo accent.                                                                     |
| `dark`       | Standard dark surface, indigo accent.                                                             |
| `neon`       | Cyberpunk-inspired dark mode with magenta/cyan glow, monospace headings, sharp corners.           |
| `pastel`     | Soft, friendly, light & rounded. Lavender + mint palette, generous radii, gentle shadows.         |
| `glass`      | Modern glassmorphism — vivid gradient backdrop, frosted translucent surfaces, indigo→cyan accent. |
| `brutalist`  | Neo-brutalism — hard 2px black borders, chunky offset shadows, loud primary, zero gradients.      |
| `skyline`    | Enterprise cloud-console aesthetic — deep navy primary, cyan accents, calm pale blue bg.          |

### Token groups

Themes are flat maps of CSS-valued strings, grouped by domain:

| Group        | Sample tokens                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface      | `colorBg`, `colorBgSubtle`, `colorSurface`, `colorSurfaceMuted`, `colorBorder`, `colorText`, `colorTextMuted`                                                                       |
| Brand        | `colorPrimary`, `colorPrimaryHover`, `colorPrimaryText`, `colorAccent`, `colorAccentHover`, `colorFocusRing`                                                                        |
| Semantic     | `colorSuccess`, `colorWarning`, `colorDanger`, `colorInfo`                                                                                                                          |
| Typography   | `fontFamily`, `fontFamilyHeading`, `fontFamilyMono`, `fontSizeBase`, `fontSizeHeading`, `fontSizeTitle`, `fontWeightBody`, `fontWeightHeading`, `letterSpacingHeading`, `headingTextTransform` |
| Shape        | `radiusXs`, `radiusSm`, `radiusMd`, `radiusLg`, `radiusPill`, `radiusButton`, `radiusInput`, `borderWidth`, `shadowSm`, `shadowMd`, `shadowLg`                                       |
| Spacing      | `spacingXs`, `spacingS`, `spacingM`, `spacingL`, `spacingXl`                                                                                                                        |
| Buttons      | `buttonFontWeight`, `buttonTextTransform`, `buttonLetterSpacing`, `buttonPaddingY`, `buttonPaddingX`                                                                                |
| Motion       | `transitionDuration`                                                                                                                                                                |
| Charts       | `chart1`–`chart6`                                                                                                                                                                   |

### Custom token map from the host

```js
el.setTheme({
  colorPrimary:      "#16a34a",
  colorPrimaryHover: "#15803d",
  colorBg:           "#f0fdf4",
  fontFamilyHeading: "'Inter', system-ui, sans-serif",
  radiusButton:      "14px",
  buttonFontWeight:  "600",
});
```

### `Theme({...})` from inside a response

A response can brand itself by assigning a `Theme({...})` call to the
reserved `theme` binding. The tokens land on the host as CSS variables on
top of the base theme.

```text
theme = Theme({
  colors: {
    primary: "#0969da",
    border:  "#d0d7de",
    text:    "#1f2328"
  },
  font: {
    family:        "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    familyHeading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    weightHeading: "500"
  },
  radius: { button: "6px", input: "6px" }
})

_app_ = Stack([CardHeader("GitHub-style page"), Buttons([Button("New repository")])])
```

`Theme` expects the **structured** form — top-level groups `colors` /
`radius` / `font` / `motion` / `elevation` (plus metadata keys `name`
and `direction`). Removing the `Theme(...)` line snaps the UI back to
the base theme. Unknown keys are ignored silently, so typos in an
LLM-emitted token map can never break the page.

### Host-page CSS variable override

```css
aktion-app {
  --rui-color-primary: #16a34a;
  --rui-radius-button: 14px;
  --rui-font-family-heading: 'Inter', system-ui, sans-serif;
}
```

A full token reference lives in
[`docs/themes.html`](https://asfand-dev.github.io/aktion/themes.html),
and the
[brand themes live example](https://asfand-dev.github.io/aktion/brand-themes.html)
ships ready-made GitHub / Apple / Stripe / IONOS / Notion / Vercel token
maps to copy.

---

## Icons

The runtime auto-loads
[Font Awesome 6.7.2](https://fontawesome.com/v6/search?o=r&m=free) from
the public CDN — once into `document.head` and once into each instance's
shadow root. Host apps do **not** need to add a stylesheet.

- Icon strings are Font Awesome names **without** the `fa-` prefix:
  `"house"`, `"chart-line"`, `"star"`, `"cart-shopping"`,
  `"circle-check"`, `"triangle-exclamation"`, `"sack-dollar"`.
- Optional variant prefix: `"regular:star"`, `"brands:github"`. The
  default variant is `solid`.
- Use the dedicated `Icon(name, variant?, size?)` component to render a
  standalone glyph (`size` ∈ `xs`, `sm`, `md`, `lg`, `xl`).
- Every component prop named `icon` — `NavLink`, `SidebarItem`, `Banner`,
  `Notification`, `FeatureItem`, `Badge`, `StatCard`, `ListItem`,
  `TimelineItem`, `DescriptionItem`, `Tile`, `EmptyState`, … — expects a
  Font Awesome name.
- Invisible Unicode glyph modifiers (variation selectors, ZWJ) are
  stripped silently so legacy emoji leftovers still resolve to the
  proper icon.

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

## Routing

Hash-based routing is built into the runtime. The LLM emits routes that
stay in sync with the URL (`#/dashboard`, `#/users/42`). Browser
back/forward, bookmarks, and deep links all work — and the host page
never reloads.

```text
pages = _router_({
  "/":          homePage,
  "/dashboard": dashboardPage,
  "/users/:id": userPage(id: params.id),
  default:      notFoundPage
})

nav = Stack([
  NavLink("Home",      to: "/", exact: true),
  NavLink("Dashboard", to: "/dashboard"),
  NavLink("Users",     to: "/users")
], direction: "row", gap: "s")

_app_ = Stack([nav, pages])

homePage      = Card([CardHeader("Welcome")])
dashboardPage = Card([CardHeader("Dashboard")])
userPage      = (id) => Card([CardHeader(`User ${id}`)])
notFoundPage  = Callout("Not found", description: `We couldn't find ${_route_.path}.`, variant: "warning")
```

- `pages = _router_({ "/path": Component(), default: Fallback() })` picks
  the matching arm based on the current hash path. First match wins;
  `default:` is the fallback.
- Route patterns support literal segments (`"/about"`), parameter
  segments (`"/users/:id"` → `params.id`), and trailing wildcards
  (`"/docs/*"` → `params._`).
- `NavLink(label, to:, variant?, exact?, icon?)` is a router-aware anchor
  that intercepts clicks and reflects `data-active="true"` for the
  current path.
- The reactive `_route_` handle exposes `_route_.path`, `_route_.params`,
  `_route_.query`, and `_route_.pattern`. Call `_route_.navigate("/path")`
  from inside the script, or `el.navigate("/path")` from the host.

The default ("full") system prompt teaches the LLM about routing. The
chat-flavoured prompt omits it. See the
[routing guide](https://asfand-dev.github.io/aktion/routing.html)
for the full walkthrough.

---

## JavaScript escape hatch

`js{ … }` blocks live inside `effect` or `action` bodies — no host
attribute, no allow-list. Reach for them only when no declarative path
captures the behaviour (timers, clipboard, audio, complex computations,
host-tool calls).

```text
$todos = []

action toggle(id) {
  js {
    const todos = ctx.state.get("todos") || []
    ctx.state.set("todos", todos.map(t => t.id === ctx.args.id ? { ...t, done: !t.done } : t))
  }
}

row = (t) => Card([Stack([
  Text(t.text),
  Button("Toggle", onClick: () => toggle(t.id))
])])

list  = for t in $todos { row(t) }
_app_ = Stack([list])
```

Inside the `js{ … }` block:

- `ctx.state.get(name)` / `ctx.state.set(name, value)` read and write
  reactive atoms.
- `ctx.args` exposes the action's positional parameters keyed by name.
- `ctx.cleanup(fn)` (effects only) registers a teardown to fire on
  re-run and unmount.
- `ctx.host` is the host element, for DOM-observing effects.
- `ctx.tools` is a host-registered async tool registry (see `el.setTools(...)`).

The body runs inside `(async () => { … })()` so `await` is free. Errors
are caught and logged — a broken body never crashes the host page.

For long-lived behaviour, prefer an `effect`:

```text
effect [$draft, debounce(500)] {
  js {
    await fetch("/save", { method: "POST", body: JSON.stringify({ draft: ctx.state.get("draft") }) })
  }
}
```

The default (full) system prompt teaches `effect` / `action` / `js{}`;
the chat-flavoured prompt (`getSystemPrompt({ mode: "chat" })`) omits
the JS section entirely.

See the
[JavaScript interactions guide](https://asfand-dev.github.io/aktion/javascript-interactions.html)
or the deep
[`coding-gen-skill.md`](./coding-gen-skill.md)
for a full walkthrough.

---

## Built-in globals

Two namespace globals are always in scope inside a Aktion
program — no import, no `js{}` block required. Both follow the standard
`obj.method(args)` method-call syntax and accept named-arg options.

```text
# localStorage is the default; `storage.local` is its alias.
storage.set("name", "John")
$name = storage.get("name")

# Per-tab sessionStorage.
storage.session.set("draft", $draft)
$draft = storage.session.get("draft")

# Cookies — named-arg options become a single options object.
storage.cookies.set("user", "John", expires: 7, path: "/", sameSite: "Lax")
$user = storage.cookies.get("user")
storage.cookies.remove("user", path: "/")

# Forwards to the host console.
console.log("Hello", $user)
console.error("Something failed", $error)
```

- Non-string values round-trip through `JSON.stringify` / `JSON.parse`;
  missing keys return `null`.
- Cookie options: `expires` (days, `Date`, or ISO string), `maxAge`
  (seconds), `path`, `domain`, `secure`, `sameSite`.
- Failures (quota exceeded, disabled storage, malformed JSON) are
  swallowed — perfect for partial-stream renders in privacy / SSR
  contexts.

See the
[language reference](https://asfand-dev.github.io/aktion/language.html#globals)
for the full surface.

---

## Internationalization

The `$i18n = i18n({...})` declaration configures the active locale,
message bundles, and fallback. A global `t(key, vars?)` builtin and a
`Locale()` helper feed the active locale into `@Format` / `@FormatDate`.

```text
$i18n = i18n({
  locale: "fr-FR",
  fallback: "en",
  messages: {
    greeting: "Bonjour, ${name}!",
    orders: { title: "Commandes récentes" }
  }
})

welcome    = Text(t("greeting", { name: $user.name }))
sectionTitle = SectionHeader(t("orders.title"))
formatted  = Text(@Format(1234.5, "currency", "EUR", Locale()))
```

Keys support dot paths. Variables are interpolated using `${name}`
placeholders. Missing keys fall back to the fallback locale's bundle,
then to the bare key as a literal string.

---

## System prompt generator

The bundle ships a tiny generator that walks the registered component
library, builtin catalog, and (optionally) host-registered tools, then
emits a clean, ordered prompt teaching the LLM exactly what's available.

Two flavours:

| Variant       | Built-in path                          | API                                              | Use when                                                                                       |
| ------------- | -------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Full**      | `dist/system_prompt.txt`               | `el.getSystemPrompt()` or `{ mode: "full" }`     | Generating full applications — dashboards, multi-page websites, settings consoles, admin apps. |
| **Chat**     | `dist/system_prompt_chat.txt`           | `el.getSystemPrompt({ mode: "chat" })`           | Converting an LLM's prose answer into a rich, read-only UI surface (cards, tables, charts).    |

`PromptOptions`:

```ts
interface PromptOptions {
  mode?: "full" | "chat";
  preamble?: string;                        // Replace the opening sentence
  additionalRules?: string[];               // Bullets under "## Additional rules"
  examples?: string[];                      // Worked-example snippets
  tools?: ToolSpec[];                       // Surfaced under "## Available endpoints"
  toolExamples?: string[];                  // Worked tool examples
  toolCalls?: boolean;                      // Force-include HTTP / tool sections
  bindings?: boolean;                       // Force-include reactive state + builtins
  inlineMode?: boolean;                     // Permit fenced ```aktion blocks
  editMode?: boolean;                       // Emit only changed statements
}
```

Both prompts are kept in lock-step with the library by `npm run build`.

---

## Tooling

[`src/tooling/index.ts`](./src/tooling/index.ts) exports the full
host-side helper surface:

```ts
import {
  formatProgram,   // canonical pretty-printer (idempotent)
  applyDelta,      // structured-edit protocol
  inspectAST,      // structured Committed + Drafting AST snapshot
  getDiagnostics,  // merged parse + schema errors (LSP-ready)
  getCompletions,  // context-aware completions
  getHoverInfo,    // hover docs for symbols
} from "aktion-runtime";
```

- `formatProgram` projects the parsed AST back to canonical source —
  `prop: value` named args, double-quoted strings, two-space block
  indentation, `bind:` preserved, template literals intact.
- `inspectAST(source)` returns a JSON-friendly view of the Committed +
  Drafting ASTs at the current byte position — bindings (with
  kind / line / column / summary), in-flight names, and any parse errors.
- `applyDelta(programText, ops)` patches a program with a structured
  sequence of operations and returns the new text plus any advisory
  warnings. Used by the element-level `el.applyDelta(...)` method.
- `getDiagnostics`, `getCompletions`, and `getHoverInfo` are the data
  layer a real LSP server would wrap. The
  [playground](https://asfand-dev.github.io/aktion/playground.html)
  uses them under the hood.

---

## Documentation site

The `docs/` folder is the source for the live documentation site at
<https://asfand-dev.github.io/aktion/>. Every page is a
static HTML file that loads the same bundle the rest of the world
consumes from the CDN.

| Page                                | What's on it                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `index.html`                        | Overview, drop-in install, live theme picker.                                           |
| `get-started.html`                  | Step-by-step integration walkthrough.                                                   |
| `frameworks.html`                   | Integration recipes for React, Next.js, Vue, Angular, Svelte, plain HTML.               |
| `language.html`                     | Full Aktion language reference.                                            |
| `components.html`                   | Every built-in component with a live preview, positional signatures, prop tables, and enum values. |
| `actions.html`                      | `action Name() { … }` guide — declarative state mutations, optimistic snapshot/rollback, lambda-based click handlers, navigation, and end-to-end examples. |
| `side-effects.html`                 | `effect [ ...deps ] { … }` guide — anonymous side effects, dependency entries (state, lifecycle, intervals, debounce/throttle), top-level vs. component-local scope, cleanup, and effect vs. action. |
| `javascript-interactions.html`      | `effect [ ...deps ] { js { … } }` + action `js{}` bodies — the JS escape hatch.         |
| `routing.html`                      | Hash-based routing guide — always available at runtime.                                 |
| `themes.html`                       | Built-in themes gallery, live picker, side-by-side compare, and the token customization studio. |
| `examples.html`                     | Curated showcase of real-world block UIs (auth, products, FAQ, cart, todos, …).         |
| `playground.html`                   | CodeMirror 6 editor with custom highlighting / autocomplete, live preview, share links, hover-over component info, and an inspection mode. |
| `chat-bot.html`                     | OpenRouter-powered streaming chat with four generation modes (Chat Compact, Chat Full, Website Builder, App Builder), image / PDF attachment support, and download-as-standalone-HTML. |
| `live-examples.html`                | Catalog page that links every demo into the shared `live-example.html?example=<slug>` shell. |
| `live-example.html`                 | Shared shell for the bundled live examples — picks the demo from the `?example=<slug>` query parameter. |

---

## Live examples

Every standalone demo is served by a single shell page
(`docs/live-example.html`) and a single JS bundle
(`docs/assets/live-example.js`) that ships every demo's UI Script source
and setup code together. Open any example with
`live-example.html?example=<slug>` — the shell renders the original
hero / source / output layout, so each demo doubles as an integration
recipe for `setResponse`, `appendChunk`, `setTools`, and `setTheme`.

| Demo slug                       | Highlights                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `routing-demo`                  | A four-page app driven by `pages = _router_({ … })` + `NavLink`, deep links, browser back/forward.          |
| `settings-app`                  | Tabs, `Switch`, `ToggleGroup`, `Progress`, `Kbd`, danger-zone confirmation `Drawer`.                        |
| `data-explorer`                 | Analytics surface: sortable `DataGrid` + bulk toolbar, `Gauge` SLA dials, `LineChart`, `Heatmap`, `RadarChart`, `ScatterChart`, `Histogram`, `InfiniteList`, `ActivityLog`. |
| `media-gallery`                 | Travel magazine: `Carousel` hero, `Gallery` + click-to-zoom `Lightbox`, `VideoPlayer`, `AudioPlayer`, Leaflet-backed `Map`. |
| `content-studio`                | CMS-style authoring surface: `RichTextEditor`, `CodeEditor`, `MultiStepForm`, `ColorPicker`, `TagInput`, `MentionInput`, `PinInput`, `ValidationSummary`, `TopBar`. |
| `brand-themes.html`             | Same UI reskinned with `Theme({...})` for **GitHub**, **Apple**, **Stripe**, **IONOS**, **Notion**, **Vercel** (bespoke UI on its own page). |

The full catalog with tag filters lives at
[`docs/live-examples.html`](https://asfand-dev.github.io/aktion/live-examples.html).

---

## Project layout

```
.
├── src/                       # Library source
│   ├── parser/                #   Lexer, parser, AST types
│   ├── runtime/               #   Evaluator, reactive state, effects, HTTP, i18n
│   │   ├── builtins.ts        #     pure @-function helpers
│   │   ├── evaluator.ts       #     program planner + binding resolver
│   │   ├── state.ts           #     reactive store — `$name = value`
│   │   ├── effects.ts         #     EffectRunner + ActionDeclRunner + js{} executor
│   │   ├── http.ts            #     http({...}) reactive HTTP primitive + interceptors
│   │   ├── i18n.ts            #     $i18n runtime + t() / Locale() builtins
│   │   ├── storage.ts         #     storage.local / .session / .cookies bridge
│   │   ├── console.ts         #     console.* host bridge
│   │   └── router.ts          #     Hash-based router for _router_({…}) calls and NavLink
│   ├── library/               #   Component specs and registry
│   │   └── components/        #     layout / content / forms / data / charts / chat /
│   │                          #     feedback / navigation / menu / patterns / helpers / router
│   ├── renderer/              #   Tree → DOM
│   │   ├── renderer.ts        #     walks the tree, calls component renderers
│   │   └── morph.ts           #     React-like DOM reconciler — keeps focus, selection, scroll, <details>.open
│   ├── theme/                 #   Token system + injected stylesheet
│   ├── prompt/                #   System prompt generator
│   ├── tooling/               #   Host-side helpers (formatter, inspector, language service)
│   ├── language/              #   Reusable language-support module
│   ├── icons/                 #   Font Awesome CDN loader
│   ├── element.ts             #   The custom element
│   └── index.ts               #   Public entry point
├── docs/                      # Static documentation site (HTML + CSS + JS)
│   ├── _examples/             #   Author-facing source for every bundled live example
│   └── assets/live-example.js #   GENERATED single-bundle for live-example.html
├── _docs/                     # Internal design notes and inspirations (not shipped)
├── scripts/
│   ├── emit-prompt.mjs        #   Writes dist/system_prompt*.txt from the bundle
│   └── build-docs.mjs         #   Assembles ./site/ from docs/ + dist/
├── tests/                     # Vitest unit + element regression tests
├── dist/                      # Built artifacts (created by `npm run build`)
├── site/                      # Deployable static docs (created by `npm run build:docs`)
├── .github/workflows/         # GitHub Pages deploy pipeline
├── README.md                  # This file
└── coding-gen-skill.md        # Deep authoring knowledge base
```

---

## Run it locally

Requirements: **Node ≥ 18** and **npm ≥ 9** (pnpm/yarn work too).

### Install

```bash
git clone https://github.com/asfand-dev/aktion.git
cd aktion
npm install
```

### Build the library and system prompt

```bash
npm run build
```

Produces:

```
dist/aktion.js              # ESM bundle (CDN entry)
dist/aktion.umd.cjs         # UMD bundle for older bundlers
dist/aktion.iife.js         # IIFE for non-module <script> tags
dist/aktion.css             # Stylesheet (also inlined into the JS bundles)
dist/index.js               # ESM npm entry — re-exports aktion.js
dist/index.cjs              # CommonJS npm entry — wraps aktion.umd.cjs
dist/index.d.ts             # TypeScript types entry
dist/types/                 # Per-module .d.ts declarations
dist/system_prompt.txt      # Full prompt — every feature
dist/system_prompt_chat.txt # Compact chat-focused prompt
```

### Publish to npm

The package is published as `aktion-runtime`. The `files` field
restricts the tarball to `dist/` only, and `prepublishOnly` runs the
full build, so a release is:

```bash
npm publish
```

Run `npm pack --dry-run` first to confirm the tarball contains only the
expected `dist/` artefacts.

The two prompt variants exist so host apps can pick the right flavour
up front. Both are kept in lock-step with the library by the build
script.

### Run the test suite

```bash
npm test
```

The suite covers:

- Parser / lexer correctness (`tests/parser.test.ts`).
- Runtime evaluator + reactive state + `http({...})` (`tests/runtime.test.ts`).
- `effect` / `action` declarations + `js{}` execution (`tests/javascript-integration.test.ts`).
- Hash-based router + `NavLink` (`tests/router.test.ts`).
- Theme resolution and token application (`tests/theme.test.ts`).
- In-script `Theme(...)` overrides (`tests/in-script-theme.test.ts`).
- Component library smoke tests (`tests/library.test.ts`).
- Element-level integration via happy-dom (`tests/element.test.ts`).
- System prompt generator output (`tests/prompt.test.ts`).
- Storage + console globals (`tests/storage-console.test.ts`).
- End-to-end programs (`tests/suis2-end-to-end.test.ts`).
- Language support spec for editor / tooling integrations (`tests/language.test.ts`).
- One-positional-max enforcement (`tests/suis2-one-positional.test.ts`).
- Component prop aliases (`tests/suis2-prop-aliases.test.ts`).
- Icon rendering (`tests/icons.test.ts`).

### Build the documentation site

```bash
npm run build:docs
```

Assembles `./site/` from `./docs/` + `./dist/`. Serve it with anything
static:

```bash
npx http-server site -p 4321
# or
npx serve site
```

Then open <http://localhost:4321/index.html>.

---

## Security

The library treats every LLM-supplied attribute as untrusted and runs
it through a small set of sanitisers before it lands on the DOM. HTTP
requests issued by the LLM through `http({...})` flow through your host's
`registerHttpInterceptors({ onRequest, onResponse, onError })` chain so
auth headers, CORS workarounds, and refresh-token retries stay under
host control.

| Sink                                                                       | Helper                       | Effect                                                                                                                          |
| -------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Anchor `href` (`Link`, `BreadcrumbItem`, `NavbarItem`, Markdown links)     | `sanitiseHref`               | Allow-lists `http(s):`, `mailto:`, `tel:`, fragments, root-relative paths. Rejects `javascript:`, `vbscript:`, `data:text/html`, control-char bypasses (`java\tscript:`), protocol-relative `//host/...`. Unsafe URLs collapse to `#`. |
| Image `src` (`Image`, `Avatar`, `MediaCard`, `Hero`, `Testimonial`, `ChatBubble`) | `sanitiseImageSrc`           | Allow-lists `http(s):`, `data:image/*`, `blob:`, plus relative paths. Anything else falls back to an empty string so callers render a placeholder. |
| Inline `style` lengths (`Container.maxWidth`, `Skeleton.height`, …)        | `sanitiseCssLength`          | Restricts the alphabet so semicolons / quotes cannot inject extra declarations.                                                 |
| `background-image: url(...)` (`Hero.imageSrc`)                             | `sanitiseCssUrl`             | Drops characters that would close the `url()` literal.                                                                          |
| `helpers.openUrl(...)` from an action body                                 | `sanitiseHref` (renderer)    | The renderer sanitises the URL before calling `window.open`. External windows open with `noopener,noreferrer`.                  |

External links rendered by `Link`, `NavbarItem`, and the Markdown
renderer get `rel="noopener noreferrer"` so the destination cannot
read the opener's `document.referrer`.

If you embed `<aktion-app>` behind a CSP, the bundle does not
use `eval`. `js{}` bodies inside `effect` / `action` declarations are
evaluated with `new Function(...)` which requires `'unsafe-eval'` if
you want them to work; if you cannot relax CSP, simply avoid emitting
`js{}` blocks from the LLM — every other part of the runtime keeps
working without the JS escape hatch.

---

## CDN deployment

This repository ships its own copy of the bundle on GitHub Pages, so
most users do not need to host anything themselves:

```html
<script type="module" src="https://asfand-dev.github.io/aktion/dist/aktion.js"></script>
<aktion-app theme="dark"></aktion-app>
```

…plus a fetch of `system_prompt.txt` server-side to build LLM messages:

```bash
curl https://asfand-dev.github.io/aktion/dist/system_prompt.txt
```

To ship your own copy, run `npm run build` and serve the `dist/` folder
from any static host — every artifact in `dist/` is self-contained.

GitHub Pages deployment for this repo is automated via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).
Push to `main` and the workflow will build, test, assemble `site/`, and
publish.

---

## Contributing

Contributions are very welcome. The fastest path is:

1. Fork and clone the repo.
2. `npm install && npm test` — make sure the suite is green on `main` first.
3. Make your change in a focused branch (e.g. `feat/inline-charts`).
4. Add or update tests in `tests/`. Aim for good edge-case coverage.
5. Run `npm run build` to confirm the bundle and the system prompt still build.
6. Open a pull request describing the motivation and any user-visible changes.

Two cursor rules keep documentation in sync with the code:

- [`.cursor/rules/readme-sync.mdc`](.cursor/rules/readme-sync.mdc) — when
  you change the public API, attribute set, component list, theme list,
  or build outputs, update this README in the same commit.
- [`.cursor/rules/coding-gen-skill-sync.mdc`](.cursor/rules/coding-gen-skill-sync.mdc) —
  when you add or change a component, builtin, action step, theme, or
  authoring rule, update `coding-gen-skill.md` so LLMs consuming this
  library don't generate broken code.

Issues, design discussions, and bug reports are tracked at
<https://github.com/asfand-dev/aktion/issues>.

By contributing you agree that your work will be released under the
project's MIT license.

---

## License

MIT — see [LICENSE](LICENSE).
