# streaming-ui-script

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Pages](https://img.shields.io/badge/docs-github%20pages-6366f1)](https://asfand-dev.github.io/streaming-ui-script/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-10b981.svg)](#contributing)

A framework-agnostic web component that renders LLM-generated UI from
**Streaming UI Script** — a compact, declarative language designed for chat
assistants. Drop one `<script>` tag and one `<streaming-ui-script>` tag into
any HTML page — React, Vue, Angular, Svelte, plain HTML, or no framework at
all — and you have a streaming, interactive renderer for an LLM's response.

- **Live docs:** <https://asfand-dev.github.io/streaming-ui-script/>
- **Live examples catalog** (chat, dashboards, commerce, inbox, CRM, pricing, routing, status, checkout, files, calendar, docs…): <https://asfand-dev.github.io/streaming-ui-script/live-examples.html>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js>
- **System prompt (full):** <https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt.txt>
- **System prompt (chat):** <https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt_chat.txt>

The library bundles everything needed at runtime:

- A **Streaming UI Script parser** (line-oriented, streaming-first, error-tolerant) with single-, double-, and backtick-quoted strings.
- An **evaluator with reactive state** (including `$$persistent` variables that survive page reloads via `localStorage`), template literals (`` `Hello ${$user.name}` ``), spread (`[...$pinned, ...$todos]`), optional chaining (`user?.profile?.avatar`), nullish coalescing (`name ?? "Guest"`), `@Each` destructuring (`"{id, name}"`), DSL-level component macros (`MyCard(user) = Card([...])`), lazy `@If` / `@Switch` control flow, queries, mutations, actions, and **40+ built-in functions** (data: `@Count`, `@Sum`, `@Avg`, `@Min`, `@Max`, `@Filter`, `@Sort`, `@Find`, `@Map`, `@GroupBy`, `@Slice`, `@Take`, `@Unique`, `@Reverse`, `@Range`, `@Repeat`, `@Pick`, `@Push`, `@Concat`; formatting: `@Format`, `@FormatCurrency`, `@FormatNumber`, `@FormatDate`, `@Plural`, `@Capitalize`/`@Lowercase`/`@Uppercase`/`@Titlecase`/`@Camelcase`/`@Snakecase`/`@Kebabcase`/`@Pascalcase`; numeric: `@Round`, `@Floor`, `@Ceil`, `@Abs`, `@Clamp`; dates: `@Now`, `@Today`, `@AddDays`) plus array shortcuts (`.length`, `.first`, `.last`, and field pluck like `$rows.title`).
- A **React-like DOM reconciler** that diffs each re-render against the live DOM — text-input value, selection, IME state, scroll positions, `<details>.open`, and stateful primitives like `Tabs` are all preserved across renders. Components that need to hold UI state get a `helpers.useInstanceState(...)` slot keyed by their position in the tree.
- A **rich component library** of 180+ components — layout, content (including a Markdown parser with headings/blockquotes/fenced code/numbered lists/images/auto-links and `Spinner`), forms (`Slider`, `NumberInput`, `DatePicker`, `DateRangePicker`, `TimePicker`, `DateTimePicker`, `FileUpload`, `Combobox`, `MultiSelect`, `SegmentedControl`, `PinInput`, `OtpInput`, `PasswordInput`, `MaskedInput`, `TagInput`, `MentionInput`, `ColorPicker`, `FormSection`, `FieldSet`, `ValidationSummary`, `MultiStepForm`), tables (with `density`, `striped`, `sticky`, per-column `align`) and the advanced `DataGrid` (sortable headers, per-column filters, row selection, pagination, sticky first column, bulk-action toolbar), charts (`BarChart`, `LineChart` with `data=[{x, …series}]` shorthand, `AreaChart`, `PieChart`, `RadarChart`, `ScatterChart`, `Histogram`, `Heatmap`, `Gauge`) and inline `Sparkline`, feedback & media (`Avatar`, `Progress` with `segments`/`buffered`, `Tooltip`, `HoverCard`, `Popover`, `Toast`/`Toasts`, `Rating` with `halfStep` + custom icons, `ProgressRing`, `ChatBubble`, `VideoPlayer`, `AudioPlayer`, `Carousel`, `Gallery`, `Lightbox`, `Map`), navigation (`Breadcrumb`, `Pagination` with `total`/`perPage`/`compact`, `Navbar`, `TopBar`), menus (`DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `ContextMenu`), hierarchical data (`Tree`, `TreeNode`), editors (`RichTextEditor`, `CodeEditor`), chat composites, **high-level pattern composites** (`Hero` with auto-derived eyebrow, `Cover`, `PageHeader` with auto-derived breadcrumbs, `BreadcrumbPageHeader`, `MetricGrid`, `Toolbar` with `center` slot + `searchable=true`, `EmptyState` with multi-action + `illustration` + auto-icon, `Timeline`, `ActivityLog`, `AuditTrail`, `KanbanBoard`, `CalendarView`, `Testimonial`, `PricingTable`, `ComparisonTable`, `MediaCard`, `InboxPanel`, `OnboardingChecklist`, `InfiniteList`, …), **state cards** (`LoadingState`, `ErrorState`, `SuccessState`, `Tour`, `Spotlight`), **layout primitives** (`Sticky`, `ResizablePanels`, `MasonryGrid`, `Drawer`) and **app-shell composites** (`AppShell` with optional collapsible/mobile-drawer mode, `Sidebar` with `collapsed` rail, `SplitView`) that render a full SaaS layout in one statement.
- A **built-in JavaScript layer** — `Script(...)` (lifecycle-managed, `useEffect`-style) and `@Js(body, args?)` (one-shot click handlers with per-item arg capture). Always available.
- A **built-in routing layer** — `Routes(...)`, `Route(path, content)`, `NavLink(label, to)`, `@Navigate("/path")`, and reactive `$route` + `params`. Hash-based, framework-agnostic, always on.
- **Seven built-in themes** (`light`, `dark`, `neon`, `pastel`, `glass`, `brutalist`, `skyline`) plus full custom-token support via CSS custom properties. **50+ design tokens** (colors, typography, button styling, radii, shadows, focus rings, motion, charts) make it easy to match any brand. Themes can also be set **from inside the script** with `theme = Theme({...})` so a single response can be branded without touching host config — see the [brand themes live example](https://asfand-dev.github.io/streaming-ui-script/brand-themes.html) (GitHub, Apple, Stripe, IONOS, Notion, Vercel).
- A **system prompt generator** that emits a clean, ordered prompt teaching the LLM exactly which components, builtins, and tools are available. The build emits two flavours: `system_prompt.txt` (full — every feature) and `system_prompt_chat.txt` (compact — only the surfaces a chat reply needs).

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

### 5. Send the system prompt to your LLM

Either fetch the auto-generated `system_prompt.txt` from the CDN:

```js
const systemPrompt = await fetch(
  "https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt.txt",
).then((r) => r.text());
```

…or build a richer prompt programmatically (with custom rules, tool
descriptions, examples, etc.):

```js
const prompt = el.getSystemPrompt({
  preamble: "You are an analytics assistant.",
  additionalRules: ["Always end with a FollowUpBlock of 2 prompts."],
  tools: [{ name: "list_orders", description: "Return recent orders.", argsExample: { limit: 10 } }],
});
```

### 6. (Optional) Provide tools

```js
el.setTools({
  list_orders: async ({ limit }) => fetch(`/api/orders?limit=${limit}`).then(r => r.json()),
  update_order: async ({ id, status }) => fetch(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(r => r.json()),
});
```

### 7. (Optional) Listen for assistant messages

```js
el.addEventListener("assistant-message", (event) => {
  appendUserMessageToChat(event.detail.message);
});
```

---

## Public API

All members live on the `<streaming-ui-script>` element.

### Attributes

| Attribute            | Values                                                | Description                                                                                                                              |
|----------------------|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `theme`              | `light`, `dark`, or a JSON object literal             | Switches the theme. JSON objects are merged with the default `light` token map.                                                          |
| `streaming`          | `true` / unset                                        | Hint that text is still being appended. Useful for status indicators in your app.                                                        |
| `response`           | Streaming UI Script text                             | Sets the program declaratively. Re-renders whenever the attribute changes.                                                               |
| `showerrors`         | `true` / unset                                        | If present and `true`, displays parse errors in the rendered UI. Defaults to off.                                                        |

`Script(...)` / `@Js(...)` and hash-based routing (`Routes`, `Route`, `NavLink`, `@Navigate`) are always on. To skip them in the generated prompt, build the chat-flavoured prompt via `getSystemPrompt({ mode: "chat" })`.

### Properties

| Property            | Type                          | Description                                                            |
|---------------------|-------------------------------|------------------------------------------------------------------------|
| `response`          | `string`                      | Equivalent to `setResponse`.                                           |
| `tools`             | `Record<string, Function>`    | Getter returns the currently-registered tools; setter is equivalent to `setTools(...)`. |
| `streaming`         | `boolean`                     | Reflects the `streaming` attribute.                                    |
| `showErrors`        | `boolean`                     | Reflects the `showerrors` attribute.                                   |
| `route`             | `string` (read-only)          | Current path tracked by the router (e.g. `"/users/42"`).               |

### Methods

| Method                                   | Description                                                                  |
|------------------------------------------|------------------------------------------------------------------------------|
| `setResponse(text)`                      | Replace the program (one-shot rendering). Resets state and queries.          |
| `appendChunk(chunk)`                     | Append a streaming chunk and re-render.                                      |
| `clear()`                                | Reset state, queries, and the rendered output.                               |
| `setTheme(name \| tokens)`               | Apply a built-in theme by name or a partial token map.                       |
| `setTools(tools)`                        | Register tools used by `Query()` and `Mutation()`.                           |
| `registerComponents(specs, root?)`       | Extend the built-in library with your own components.                        |
| `getSystemPrompt(options?)`              | Build a system prompt that matches the current library and tools.            |
| `navigate(path)`                         | Programmatically navigate when routing is enabled (updates `window.location.hash`). |

### Events

| Event                | Detail                          | When it fires                                                  |
|----------------------|---------------------------------|----------------------------------------------------------------|
| `assistant-message`  | `{ message: string }`           | When `@ToAssistant("...")` runs (e.g. a follow-up button).     |
| `error`              | `{ errors: ParseError[] }`      | After each render whose source had parse errors.               |
| `route-change`       | `{ path, previousPath, params, pattern }` | When the current hash path changes. |

The `error` event always fires regardless of `showerrors`, so host apps can
log or report errors even when the in-page banner is suppressed.

---

## Themes

Seven themes are built in. Pick one with `theme="..."` or pass a custom token map.

| Theme        | Vibe                                                                                              |
|--------------|---------------------------------------------------------------------------------------------------|
| `light`      | Crisp default, indigo accent.                                                                     |
| `dark`       | Standard dark surface, indigo accent.                                                             |
| `neon`       | Cyberpunk-inspired dark mode with magenta/cyan glow, monospace headings, sharp corners.           |
| `pastel`     | Soft, friendly, light & rounded. Lavender + mint palette, generous radii, gentle shadows.         |
| `glass`      | Modern glassmorphism — vivid gradient backdrop, frosted translucent surfaces, indigo→cyan accent. |
| `brutalist`  | Neo-brutalism — hard 2px black borders, chunky offset shadows, loud primary, zero gradients.      |
| `skyline`    | Enterprise cloud-console aesthetic — deep navy primary, cyan accents, calm pale blue bg.          |

### Token groups

Themes are a flat object of CSS-valued strings, grouped by domain:

| Group        | Sample tokens                                                                                                                                                                       |
|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Surface      | `colorBg`, `colorBgSubtle`, `colorSurface`, `colorSurfaceMuted`, `colorBorder`, `colorText`, `colorTextMuted`                                                                       |
| Brand        | `colorPrimary`, `colorPrimaryHover`, `colorPrimaryText`, `colorAccent`, `colorAccentHover`, `colorFocusRing`                                                                        |
| Semantic     | `colorSuccess`, `colorWarning`, `colorDanger`, `colorInfo`                                                                                                                          |
| Typography   | `fontFamily`, `fontFamilyHeading`, `fontFamilyMono`, `fontSizeBase`, `fontSizeHeading`, `fontSizeTitle`, `fontWeightBody`, `fontWeightHeading`, `letterSpacingHeading`, `headingTextTransform` |
| Shape        | `radiusXs`, `radiusSm`, `radiusMd`, `radiusLg`, `radiusPill`, `radiusButton`, `radiusInput`, `borderWidth`, `shadowSm`, `shadowMd`, `shadowLg`                                       |
| Spacing      | `spacingXs`, `spacingS`, `spacingM`, `spacingL`, `spacingXl`                                                                                                                        |
| Buttons      | `buttonFontWeight`, `buttonTextTransform`, `buttonLetterSpacing`, `buttonPaddingY`, `buttonPaddingX`                                                                                |
| Motion       | `transitionDuration`                                                                                                                                                                |
| Charts       | `chart1`–`chart6`                                                                                                                                                                   |

### Custom token maps (from the host)

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

A response can also brand itself by assigning a `Theme({...})` call to the
reserved `theme` binding. The tokens land on the host as CSS variables on
top of the base theme, so the next render of the same element renders in
the new palette without a reload:

```text
theme = Theme({
  colorPrimary:       "#0969da",
  fontFamily:         "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyHeading:  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radiusButton:       "6px",
  borderWidth:        "1px",
  buttonFontWeight:   "500"
})
root = Stack([CardHeader("GitHub-style page"), Buttons([Button("New repository")])])
```

Removing the `Theme(...)` line snaps the UI back to the base theme. Unknown
keys are ignored silently, so typos in an LLM-emitted token map can never
break the page.

### Host-page CSS variable override

```css
streaming-ui-script {
  --rui-color-primary: #16a34a;
  --rui-radius-button: 14px;
  --rui-font-family-heading: 'Inter', system-ui, sans-serif;
}
```

A full list of tokens lives in `docs/themes.html` and `src/theme/index.ts`,
and the [brand themes live example](https://asfand-dev.github.io/streaming-ui-script/brand-themes.html)
ships ready-made GitHub / Apple / Stripe / IONOS / Notion / Vercel token
maps you can copy.

---

## Icons (Font Awesome)

The runtime auto-loads [Font Awesome 6.7.2](https://fontawesome.com/v6/search?o=r&m=free)
from the public CDN — once into `document.head` and once into each instance's
shadow root. Host apps do **not** need to add a stylesheet.

- Icon strings are Font Awesome names **without** the `fa-` prefix:
  `"house"`, `"chart-line"`, `"star"`, `"cart-shopping"`, `"circle-check"`,
  `"triangle-exclamation"`, `"sack-dollar"`.
- Optional variant prefix: `"regular:star"`, `"brands:github"`. The default
  variant is `solid`.
- Use the dedicated `Icon(name, variant?, size?)` component to render a
  standalone glyph (`size` ∈ `xs`, `sm`, `md`, `lg`, `xl`).
- Every component prop named `icon` — `NavLink`, `SidebarItem`, `Banner`,
  `Notification`, `FeatureItem`, `Badge`, `StatCard`, `ListItem`,
  `TimelineItem`, `DescriptionItem`, `Tile`, `EmptyState`, …  — now expects a
  Font Awesome name (or a `variant:name` string).
- `ProgressRing(value, max?, label?, …)` renders `label` as an icon when it
  resolves to a Font Awesome name (e.g. `"circle-check"`), and as plain text
  otherwise — perfect for completion rings.
- Invisible Unicode glyph modifiers (variation selectors, ZWJ) are stripped
  silently so `"triangle-exclamation\uFE0F"` (a legacy emoji leftover) still
  resolves to the proper icon instead of falling back to inline text.

```text
brandIcon  = Icon("rocket", "solid", "lg")
homeIcon   = Icon("house")
profileTab = NavLink("Profile", "/profile", "ghost", false, "user")
kpis       = MetricGrid([
  StatCard("Revenue", "$48k", "up",   "+12%", "sack-dollar"),
  StatCard("Orders",  "1,284","up",   "+8%",  "cart-shopping"),
  StatCard("Refunds", "12",   "down", "-3",   "rotate-left")
])
```

The CDN URL and a tiny `ensureFontAwesomeLoaded(shadow)` helper live in
[`src/icons/index.ts`](./src/icons/index.ts) and are re-exported as
`FONT_AWESOME_CDN_URL`. The custom element calls the helper from its
`connectedCallback` (idempotent — safe to mount multiple instances).

---

## Streaming UI Script in 60 seconds

```text
$days = "7"
data = Query("get_metrics", {days: $days}, {events: 0, daily: []})
filter = FormControl("Range", Select("days", [SelectItem("7","7d"), SelectItem("30","30d")], null, null, $days))
kpi = StatCard("Events", "" + data.events, "up")
chart = LineChart(data.daily.day, [Series("Events", data.daily.events)])
root = Stack([CardHeader("Analytics"), filter, kpi, chart])
```

Highlights:

- One statement per line: `name = Expression`.
- `$variables` are reactive — passing one to an Input or Select two-way-binds. `$$variables` persist across reloads (e.g. `$$theme = "dark"`) via `localStorage`, keyed per element id.
- Strings come in three flavours: `"double"`, `'single'`, and `` `backtick` ``. Backticks support `${expression}` interpolation: `` `Hello ${$user.name}, you have ${$todos.length} todos` ``. Backtick strings without `${...}` are plain — perfect for JS bodies.
- Optional chaining `obj?.prop` and nullish coalescing `name ?? "Guest"` mirror their JavaScript counterparts.
- Spread works in arrays (`[...$pinned, ...$todos]`) and objects (`{...$current, status: "done"}`).
- `@Each` supports destructuring: `@Each($users, "{id, name}", row)` exposes `id` / `name` directly inside `row`.
- Comments are stripped silently: `// line`, `# line` (shell-style), and `/* block */`.
- `Query("tool", {args}, {defaults}, refreshSec?)` runs immediately and re-runs when its `$variable` args change.
- `Mutation("tool", {...})` only runs from `@Run(name)` inside an `Action([...])`.
- `@Each(arr, "row", template)` iterates inline. The loop variable is scoped strictly to `template`.
- `@If(cond, trueBranch, falseBranch?)` and `@Switch(value, {key: branch, …}, default?)` are lazy — only the matched branch is evaluated, replacing nested ternaries.
- Custom component macros let you factor repeated trees: `MyUserCard(user) = Card([Avatar(user.name), TextContent(user.role)])`, then `MyUserCard(u)` anywhere.
- `@Filter`, `@Sort`, `@Find`, `@Map`, `@GroupBy`, `@Slice`, `@Take`, `@Unique`, `@Reverse`, `@Range`, `@Repeat`, `@Pick`, `@Push`, `@Concat`, `@Count`, `@Sum`, `@Avg`, `@Min`, `@Max`, `@Round`, `@Clamp`, `@Format` / `@FormatCurrency` / `@FormatNumber` / `@FormatDate`, `@Now` / `@Today` / `@AddDays`, `@Plural`, casing helpers (`@Capitalize` / `@Lowercase` / `@Uppercase` / `@Titlecase` / `@Camelcase` / `@Snakecase` / `@Kebabcase` / `@Pascalcase`) and more are available.
- Array shortcuts: `$rows.length`, `$rows.first`, `$rows.last`, plus pluck (`$rows.title` → `[title1, title2, …]`).
- **Responsive prop maps** on layout components: `Grid(items, {sm: 1, md: 2, lg: 4}, "l")`, `Stack(children, {sm: "column", md: "row"})`. Bare numbers / strings still work.
- Forward references are allowed — list `root = Stack([...])` first and let the children stream in beneath it.

### Build a todo app declaratively (no JS required for add/delete)

```text
$todos = [{id: 1, text: "Welcome — try editing", done: false}]
$draft = ""

addBtn = Button("Add", Action([
  @Set($todos, @Push($todos, {id: $todos.length + 1, text: $draft, done: false})),
  @Reset($draft)
]), "primary")

row = Card([Stack([
  TextContent(t.text),
  Button("Delete", Action([@Set($todos, @Filter($todos, "id", "!=", t.id))]), "ghost")
])])

list = @Each($todos, "t", row)
root = Stack([Input("draft-input", "What needs doing?", "text", null, $draft), addBtn, list])
```

The full reference is on the docs site (`docs/language.html`).

---

## JavaScript interactions

`Script(...)` and `@Js(...)` ship with every renderer — no attribute to flip.
The LLM can author two surfaces whenever the full prompt is in use:

- `Script("id", body, deps?)` — behaviour-only node that runs on mount and
  re-runs whenever any listed `$variable` changes. Lifecycle matches
  `useEffect`: cleanup before re-run, disposal on unmount, AbortSignal exposed
  as `ctx.signal`.
- `@Js(body, args?)` — action step you drop inside `Action([...])`. The
  optional `args` object is evaluated at render time and exposed inside the
  body as `ctx.args`. This is the canonical way to feed per-row data from an
  `@Each` loop into a click handler.

```html
<streaming-ui-script></streaming-ui-script>
```

```text
list = @Each($todos, "t", row)
row = Card([Stack([
  TextContent(t.text),
  Button("Toggle", Action([
    @Js(`
      const todos = ctx.state.get('todos') || [];
      ctx.state.set('todos', todos.map(x => x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x));
    `, {id: t.id})
  ]))
])])
```

`body` is a regular string. Use double quotes for one-liners (escape inner
`"` as `\"` and newlines as `\n`) or backticks for multi-line code (real
newlines and unescaped `"` are fine). The default (full) system prompt
teaches the LLM about these features; for chat-style replies where you want
to keep the LLM purely declarative, build the prompt via
`getSystemPrompt({ mode: "chat" })` — the chat flavour omits the JS section.

See the [JavaScript interactions guide](https://asfand-dev.github.io/streaming-ui-script/javascript-interactions.html)
or the deeper [`coding-gen-skill.md`](./coding-gen-skill.md) for a full
end-to-end app walkthrough.

## Routing

Hash-based routing is built into the runtime. The LLM may emit routes that
stay in sync with the URL (`#/dashboard`, `#/users/42`). Browser
back/forward, bookmarks, and deep links all work — and the host page never
reloads.

```html
<streaming-ui-script></streaming-ui-script>
```

```text
root = Stack([nav, main])

nav = Stack([
  NavLink("Home",     "/",          "ghost", true),
  NavLink("Dashboard","/dashboard", "ghost"),
  NavLink("Users",    "/users",     "ghost")
], "row", "s")

main = Routes([
  Route("/",           homePage),
  Route("/dashboard",  dashboardPage),
  Route("/users/:id",  userPage),
  Route("*",           notFoundPage)
], "/")

homePage      = Card([CardHeader("Welcome")])
dashboardPage = Card([CardHeader("Dashboard")])
userPage      = Card([CardHeader("User " + params.id)])
notFoundPage  = Callout("warning", "Not found", "We couldn't find " + $route + ".")
```

- `Routes(items, default?)` picks the matching `Route` based on the current
  hash path. First match wins; `default` is the fallback when nothing else
  matches.
- `Route(path, content)` supports literal segments (`"/about"`), parameter
  segments (`"/users/:id"` → `params.id`), and trailing wildcards
  (`"/docs/*"` → `params._`).
- `NavLink(label, to, variant?, exact?, icon?)` is a router-aware anchor
  that intercepts clicks and reflects `data-active="true"` for the current
  path.
- `@Navigate("/path")` is an action step you can drop into any
  `Action([...])` for programmatic navigation. From JS, call
  `el.navigate("/path")`.
- The current path is exposed reactively as `$route`. Inside a matched
  route's content, the captured params land in the `params` loop variable.

The default (full) system prompt teaches the LLM about routing. To skip the
routing section (e.g. for chat-style replies where you don't want the model
inventing URLs), build the prompt via `getSystemPrompt({ mode: "chat" })`.

See the [routing guide](https://asfand-dev.github.io/streaming-ui-script/routing.html)
and the [live routing demo](https://asfand-dev.github.io/streaming-ui-script/live-example.html?example=routing-demo)
for a full end-to-end walkthrough.

## Built-in components

| Group              | Components                                                                                                              |
|--------------------|-------------------------------------------------------------------------------------------------------------------------|
| Layout             | `Stack`, `Grid`, `Section`, `Container`, `Spacer`, `Card`, `CardHeader`, `CardBody`, `CardFooter`, `Separator` (with optional label), `Tabs` (orientation + keyboard nav), `TabItem` (icon + badge), `Accordion`, `AccordionItem`, `Modal` (size + footer + close), `Drawer` / `Sheet`, `Steps`, `StepsItem`, `AspectRatio`, `ScrollArea`, `Sticky`, `ResizablePanels`, `MasonryGrid` |
| Content            | `TextContent`, `Image` (ratio + fit + fallback), `Icon`, `Link`, `Badge`, `BadgeList`, `Callout` (compact), `Quote`, `CodeBlock` (copy + lines + highlight), `Skeleton` (variants), `Spinner`, `Markdown` (headings, fenced code, blockquotes, lists, images, auto-link), `Kbd` |
| Forms              | `Form`, `FormControl`, `FormSection`, `FieldSet`, `ValidationSummary`, `Input`, `TextArea`, `PasswordInput`, `MaskedInput`, `MentionInput`, `TagInput`, `Select`, `SelectItem`, `Combobox`, `MultiSelect`, `Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Switch`, `Toggle`, `ToggleGroup`, `SegmentedControl`, `Button` (sm/md/lg + icon), `Buttons`, `SearchBar`, `Slider`, `NumberInput`, `ColorPicker`, `DatePicker`, `DateRangePicker`, `TimePicker`, `DateTimePicker`, `FileUpload`, `PinInput`, `OtpInput`, `MultiStepForm` |
| Data               | `Table` (density/striped/sticky/align/emptyLabel), `Col` (align), `DataGrid` (sort + filter + selection + pagination + sticky first column), `List`, `ListItem`, `StatCard` (spark + auto-icon), `Stats` (spark), `Sparkline`, `Tile`, `Progress` (segments + buffered), `ProgressRing`, `Pagination` (total + perPage + compact), `Tree`, `TreeNode`, `CalendarView`, `ComparisonTable`, `InfiniteList` |
| Charts             | `BarChart`, `LineChart` (with row-shaped `data=` shorthand), `AreaChart`, `PieChart`, `RadarChart`, `ScatterChart`, `Histogram`, `Heatmap`, `Gauge`, `Series` |
| Feedback & Media   | `Avatar` (DiceBear fallback when `src` is missing, override with `fallback="initials"`), `AvatarGroup`, `PersonChip`, `Tooltip`, `HoverCard`, `Popover`, `Rating` (half-step + icon family), `Toast` (standalone via `position`), `Toasts`, `VideoPlayer`, `AudioPlayer`, `Carousel`, `Gallery`, `Lightbox`, `Map` |
| Navigation         | `Breadcrumb`, `BreadcrumbItem`, `Pagination` (total + perPage + compact), `Navbar`, `NavbarItem`, `TopBar`                       |
| Menus              | `DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `ContextMenu`                                                                |
| Editors            | `RichTextEditor`, `CodeEditor`                                                                                          |
| Chat               | `SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`, `ActionLink`, `ChatBubble`                                |
| Patterns           | `Hero` (auto-eyebrow), `Cover`, `PageHeader` (auto-breadcrumbs), `BreadcrumbPageHeader`, `SectionHeader`, `MetricGrid`, `Toolbar` (center slot + `searchable=true`), `EmptyState` (multi-action + illustration + auto-icon), `Timeline`, `TimelineItem`, `ActivityLog`, `AuditTrail`, `FeatureGrid`, `FeatureItem`, `MediaCard`, `Testimonial`, `ProfileCard`, `Comment`, `Banner` (auto-icon from tone), `Notification`, `InboxPanel`, `OnboardingChecklist`, `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `DescriptionList`, `DescriptionItem`, `StatusDot`, `PricingTable`, `PricingCard`, `LoadingState`, `ErrorState`, `SuccessState`, `Tour`, `Spotlight` |
| App shell          | `AppShell` (`collapsible=true` for mobile drawer), `Sidebar` (`collapsed=true` icon rail), `SidebarSection`, `SidebarItem`, `SplitView` |
| Scripting          | `Script` (always available; `chat` prompt mode omits it)                                                                |
| Routing            | `Routes`, `Route`, `NavLink` (always available; `chat` prompt mode omits them)                                          |

### Rich pattern composites

The **Patterns** group is the secret sauce for getting beautiful, dense UI out
of an LLM with minimal tokens. Each composite packs an entire idiom (hero,
page header, KPI strip, empty state, timeline, kanban, …) into one positional
call. Reach for these before composing the equivalent layout from
`Card` + `Stack`:

```text
root = Stack([dashHeader, kpis, board, follow])
dashHeader = PageHeader("Engineering Q3", "12 active · 4 at risk", ["Workspace", "Engineering"], dashActions, Badge("On track", "success"))
dashActions = [Button("Export", Action([@Run(export_q3)]), "secondary"), Button("New project", Action([@Run(new_project)]), "primary")]
kpis = MetricGrid([StatCard("Active", "12", "flat"), StatCard("At risk", "4", "up", "+2"), StatCard("Shipped", "8", "up", "+3"), StatCard("On-time", "87%", "down", "-3%")])
board = KanbanBoard([
  KanbanColumn("To do",      [KanbanCard("Migrate auth", "Roll out new SDK.", ["auth"], "Asha")]),
  KanbanColumn("Doing",      [KanbanCard("Streaming UI v2", "20 new components.", ["frontend"], "Alex", "primary")]),
  KanbanColumn("Review",     [KanbanCard("Mobile onboarding", "Awaiting design.", ["mobile"], "Wren", "warning")]),
  KanbanColumn("Done",       [KanbanCard("Activity timeline", "Shipped to 100%.", ["shipped"], "Mira", "success")])
])
follow = FollowUpBlock(["Show at-risk projects", "Compare to Q2", "Who needs help?"])
```

The generated system prompt teaches the LLM about every component, and the
`## Design principles` + `## Composition recipes` sections steer the model
toward dashboard / landing / detail-page layouts that look like a shadcn site
out of the box.

Add your own with `registerComponents`:

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

## LLM integration helper

If you're driving the renderer from an agentic LLM (Cursor, Claude Code, etc.)
one companion document is kept in sync with the bundle:

- [`coding-gen-skill.md`](./coding-gen-skill.md) — an **extensive knowledge
  base** for building complete applications in Streaming UI Script: mental
  model, every component group, state management, queries/mutations, actions,
  loops, JavaScript interactions, routing, app patterns (todo list,
  dashboard, wizard, chat, settings, real-time, status page, checkout flow,
  file manager, calendar, docs portal), and anti-patterns. Treat it as the
  "deep dive" the model can read once and then author full apps unaided. It
  also opens with a short **"When to reach for this library"** section so
  agents can decide quickly whether `<streaming-ui-script>` is the right
  tool for the job.

---

## Documentation site

The `docs/` folder is the source for the live documentation site published at
<https://asfand-dev.github.io/streaming-ui-script/>. Every page is a static
HTML file that loads the same bundle the rest of the world consumes from the
CDN.

| Page                                | What's on it                                                                            |
|-------------------------------------|-----------------------------------------------------------------------------------------|
| `index.html`                        | Overview, drop-in install, live theme picker.                                           |
| `get-started.html`                  | Step-by-step integration walkthrough.                                                   |
| `frameworks.html`                   | Integration recipes for React, Next.js, Vue, Angular, Svelte, plain HTML.               |
| `language.html`                     | Full Streaming UI Script language reference.                                            |
| `components.html`                   | Every built-in component with a live preview, positional signatures, prop tables, and enum values. |
| `actions.html`                      | `Action([...])` guide — every action step (`@Set`, `@Reset`, `@Run`, `@ToAssistant`, `@OpenUrl`, `@Navigate`, `@Js`), the implicit-label fallback, and worked examples for forms, list mutations, save/refresh chains, and programmatic navigation. |
| `javascript-interactions.html`      | `Script(...)` + `@Js(...)` guide — always available at runtime.                         |
| `routing.html`                      | Hash-based routing guide — always available at runtime.                                 |
| `themes.html`                       | Built-in themes gallery, live picker, side-by-side compare, and the token customization studio (formerly `theme-customization.html`, now redirected). |
| `examples.html`                     | Curated showcase of real-world block UIs (auth, products, FAQ, cart, todos, …).         |
| `playground.html`                   | CodeMirror 6 editor with custom Streaming UI Script highlighting + autocomplete, live preview, share links (`?code=` query param + hash), persistent layout modes (drag the splitter, collapse the docs sidebar), hover-over component info, signature/argument tooltips with allowed enum values, and an inspection mode that maps rendered DOM back to the source. Powered by [`src/language/`](./src/language/README.md). |
| `chat-bot.html`                     | OpenRouter-powered streaming chat with four generation modes — **Chat Compact** (`system_prompt_chat`), **Chat Full** (`system_prompt`), **Website Builder** (full prompt + landing-page extensions), and **App Builder** (full prompt + routed-app extensions with seeded mock data). Each assistant turn renders both a live preview and a copy-able source view, with one-click *Open in playground* and *Download as standalone HTML*. Picks any built-in theme and any OpenRouter model; obeys the docs light/dark toggle. |
| `chat-bot-advanced.html`            | Production-grade **LLM pipeline** demo. Every user prompt runs four sequential OpenRouter calls — **(1) Brief** (intent classifier that outputs JSON: intent, industry, audience, brand, app name, tagline, tone, locale, currency, polished prompt), **(2) Blueprint** (information architect that returns JSON pages, navigation, data schemas, 6–15 realistic sample records per schema, KPIs, primary actions, filters, ctaLines, copy), **(3) Brand theme** (returns a tailored `theme = Theme({...})` line keyed to the industry/brand/tone), and **(4) Intent-specific UI generator** — 14+ specialised generators for `dashboard` / `app` / `website` / `landing` / `storefront` / `crm` / `booking` / `directory` / `portfolio` / `docs` / `form` / `data-view` / `profile` / `chat` / `generic` covering essentially every professional/industry use case, each enforcing shared production rules (accessibility, responsive, real copy, working interactions, density, icons, follow-ups). The theme line is prepended to the streaming UI source and rendered live. Per-turn **Refine** flow rewrites the program in place from a change request. Every successful generation auto-saves to a local **Saved-apps gallery** (12 most recent) with quick Playground / HTML download / Rebuild / Remove actions. Settings drawer adds an industry-hint field that biases ambiguous prompts. |
| `live-examples.html`                | Catalog page that links every demo into the shared `live-example.html?example=<slug>` shell. |
| `live-example.html`                 | Shared shell for the bundled live examples — picks the demo from the `?example=<slug>` query parameter and renders it from `assets/live-example.js`. |

---

## Live examples

Every standalone demo is served by a single shell page
(`docs/live-example.html`) and the single JS bundle
(`docs/assets/live-example.js`) that ships every demo's UI Script source and
setup code together. Open any example with `live-example.html?example=<slug>`
— the shell renders the original hero / source / output layout from the
bundled data, so each demo doubles as an integration recipe for
`setResponse`, `appendChunk`, `setTools`, and `setTheme`.

A few demos (`chat-bot`, `chat-bot-advanced`, `brand-themes`) have bespoke
UIs and remain on their own HTML pages.

| Demo slug                       | Highlights                                                                                                  |
|---------------------------------|-------------------------------------------------------------------------------------------------------------|
| `tools-example`                 | Read / write / poll patterns wired to in-page `setTools()` handlers.                                        |
| `external-data-example`         | Live GitHub repository explorer powered by a single tool function.                                          |
| `support-agent`                 | AI triage workspace: pick a ticket, the agent suggests priority + draft reply.                              |
| `analytics-assistant`           | Natural-language → charts/KPIs/breakdown.                                                                   |
| `javascript-todo-app`           | Reactive todo list with filters + localStorage persistence via one `Script(...)`.                           |
| `javascript-pomodoro`           | Pomodoro timer with phases, audio chime, and notifications.                                                 |
| `javascript-stopwatch`          | Sub-second stopwatch + laps using `requestAnimationFrame` and proper teardown.                              |
| `routing-demo`                  | A four-page app driven by `Routes` + `NavLink` + `@Navigate`, deep links, browser back/forward.             |
| `app-workspace`                 | Full SaaS workspace: sticky `Sidebar`, topbar, `MetricGrid`, timeline, `DescriptionList`.                   |
| `project-dashboard`             | Engineering program dashboard: banner, `PageHeader`, KPIs, kanban board, activity timeline.                 |
| `marketing-landing`             | Hero, feature grid, pricing tiers, testimonials, team line-up, FAQ.                                         |
| `team-directory`                | Profile cards, avatar groups, search-with-pagination, empty state, slide-in `Sheet`.                        |
| `settings-app`                  | Tabs, `Switch`, `ToggleGroup`, `Progress`, `Kbd`, danger-zone confirmation `Sheet`.                         |
| `ecommerce-product`             | Product page with `Cover` hero, `MediaCard` related items, `Rating`, `ProgressRing`, `Stats`, reviews.      |
| `inbox-app`                     | Focused mail/chat inbox using `SplitView`, `SearchBar`, `PersonChip`, `Notification`, `ChatBubble`.         |
| `pricing-page`                  | Pricing surface: `Cover`, `Stats` trust strip, `PricingTable`, `FeatureGrid`, `Quote`, FAQ, CTA.            |
| `crm-contacts`                  | Directory: `SearchBar`, segmented filters, `Tile` quick stats, paginated cards, detail `Sheet`.             |
| `status-page`                   | Public SRE status: incident `Banner`, latency `LineChart`, services with `StatusDot`, incident `Timeline`.  |
| `checkout-flow`                 | Four-step checkout wizard: `Steps`, `SplitView` cart, promo codes, address + payment + review + confirmation. |
| `file-manager`                  | Cloud file browser: `Tree` sidebar, `Toolbar`, files `Table`, preview `Sheet`, storage `ProgressRing`.       |
| `calendar-app`                  | Calendar & scheduler: `DatePicker`, category chips, busy-hours ring, agenda `Timeline`, event detail `Sheet`. |
| `docs-portal`                   | Help center / knowledge base: `SearchBar`, `Tree` categories, `Markdown` article, `Rating`, FAQ `Accordion`. |
| `issue-tracker`                 | Linear-style tracker: `KanbanBoard`, priority/assignee filters, activity `Timeline`, squad `AvatarGroup`, detail `Sheet`. |
| `expense-tracker`               | Personal finance: 6-month `LineChart`, category `BarChart`, savings `ProgressRing`, per-budget `Progress` bars, transaction list. |
| `polls-app`                     | Multiple-choice polls with live results: per-option `Progress` bars, leader `ProgressRing`, 7-day `LineChart`, comments thread. |
| `data-explorer`                 | Analytics surface: sortable `DataGrid` + bulk toolbar, `Gauge` SLA dials, `AreaChart`, `Heatmap`, `RadarChart`, `ScatterChart`, `Histogram`, `InfiniteList`, `AuditTrail`. |
| `media-gallery`                 | Travel magazine: `Carousel` hero, `Gallery` + click-to-zoom `Lightbox`, `VideoPlayer` trailer, `AudioPlayer` soundtrack, Leaflet-backed `Map` with pinned itinerary. |
| `content-studio`                | CMS-style authoring surface: `RichTextEditor`, `CodeEditor`, `MultiStepForm`, `ColorPicker`, `TagInput`, `MentionInput`, `PinInput`/`OtpInput`, `ValidationSummary`, `TopBar`. |
| `scheduler`                     | Full-month `CalendarView`, `OnboardingChecklist`, `InboxPanel`, `ActivityLog`, and `LoadingState`/`ErrorState`/`SuccessState` wired through one `@Switch`. |
| `brand-themes.html`             | Same UI reskinned with `Theme({...})` for **GitHub**, **Apple**, **Stripe**, **IONOS**, **Notion**, and **Vercel** (own page — bespoke UI). |

The full catalog with tag filters lives at
[`docs/live-examples.html`](https://asfand-dev.github.io/streaming-ui-script/live-examples.html).

### Editing live examples

Each bundled demo's source-of-truth is a self-contained HTML in
`docs/_examples/<slug>.html`. Edit one of those files and run
`npm run build:examples` to regenerate the single `docs/assets/live-example.js`
bundle (also triggered automatically by `npm run build:docs`). The
`docs/_examples/` folder is excluded from the deployed `site/` output.

---

## Project layout

```
.
├── src/                       # Library source
│   ├── parser/                # Lexer, parser, AST types
│   ├── runtime/               # Evaluator, reactive state, queries, actions,
│   │   ├── builtins.ts        #   builtin @-functions and action-step markers
│   │   ├── evaluator.ts       #   program planner + binding resolver
│   │   ├── state.ts           #   reactive store (subscribers, two-way binds)
│   │   ├── queries.ts         #   Query / Mutation registry + auto-refresh
│   │   ├── actions.ts         #   ActionRunner (@Run, @Set, @Reset, …)
│   │   ├── scripts.ts         #   ScriptRunner — useEffect-style Script(...)
│   │   └── router.ts          #   Hash-based router for Routes / NavLink
│   ├── library/               # Component specs and registry
│   │   └── components/        #   layout / content / forms / data / charts /
│   │                          #   chat / feedback / navigation / menu /
│   │                          #   patterns / scripts / router
│   ├── renderer/              # Tree → DOM
│   │   ├── renderer.ts        #   walks the tree, calls component renderers,
│   │   │                      #   tracks per-instance state by tree path
│   │   └── morph.ts           #   React-like DOM reconciler — keeps focus,
│   │                          #   selection, scroll, and <details>.open
│   ├── theme/                 # Token system + injected stylesheet
│   │   ├── index.ts           #   Seven built-in themes + custom token merge
│   │   └── styles.ts          #   Shadow-DOM stylesheet (theme-aware)
│   ├── prompt/                # System prompt generator
│   ├── language/              # Reusable language-support module
│   │   ├── grammar.ts         #   Pure-data tokens + CodeMirror StreamParser
│   │   ├── components.ts      #   Component catalog (derived from library)
│   │   ├── builtins.ts        #   @-builtin catalog (sourced from runtime)
│   │   ├── snippets.ts        #   Ready-to-insert templates for composites
│   │   └── index.ts           #   `getLanguageSpec()` barrel for editors
│   ├── element.ts             # The custom element
│   └── index.ts               # Public entry point
├── docs/                      # Static documentation site (HTML + CSS + JS)
│   ├── _examples/             #   Author-facing source for every bundled live
│   │                          #   example. Excluded from the deployed site.
│   │                          #   Regenerate the bundle via `npm run build:examples`.
│   └── assets/live-example.js #   GENERATED single-bundle for `live-example.html`.
├── _docs/                     # Internal design notes and inspirations (not shipped)
├── scripts/
│   ├── emit-prompt.mjs        # Writes dist/system_prompt*.txt from the bundle
│   ├── build-live-examples.mjs # Assembles docs/assets/live-example.js from docs/_examples/
│   └── build-docs.mjs         # Assembles ./site/ from docs/ + dist/
├── tests/                     # Vitest unit + element regression tests
├── dist/                      # Built artifacts (created by `npm run build`)
├── site/                      # Deployable static docs (created by `npm run build:docs`)
├── .github/workflows/         # GitHub Pages deploy pipeline
├── README.md                  # This file
└── coding-gen-skill.md        # Deep knowledge base for building full apps
```

---

## Run it locally

Requirements: **Node ≥ 18** and **npm ≥ 9** (or pnpm/yarn — examples use npm).

### Install

```bash
git clone https://github.com/asfand-dev/streaming-ui-script.git
cd streaming-ui-script
npm install
```

### Build the library and system prompt

```bash
npm run build
```

Produces:

```
dist/streaming-ui-script.js          # ESM bundle
dist/streaming-ui-script.umd.cjs     # UMD bundle for older bundlers
dist/streaming-ui-script.iife.js     # IIFE for non-module <script> tags
dist/system_prompt.txt               # Full prompt — every component, JS, routing
dist/system_prompt_chat.txt          # Compact chat-focused prompt (lighter, OpenUI-Lang style)
```

The two prompt variants exist so host apps can pick the right flavour up
front: `system_prompt.txt` (or `getSystemPrompt()` with no options) for rich
generative UI surfaces that need JS and routing, and `system_prompt_chat.txt`
(or `getSystemPrompt({ mode: "chat" })`) for chat assistants whose replies
should stay purely declarative. Both are kept in lock-step with the library by
the build script.

### Run the test suite

```bash
npm test
```

Includes:

- Parser / lexer correctness (`tests/parser.test.ts`).
- Runtime evaluator + reactive state (`tests/runtime.test.ts`).
- Built-in function semantics (covered across runtime + library tests).
- JavaScript interactions: `Script(...)` lifecycle + `@Js(...)` (`tests/javascript-integration.test.ts`).
- Hash-based router and `Routes` / `Route` / `NavLink` (`tests/router.test.ts`).
- Theme resolution and token application (`tests/theme.test.ts`).
- Component library smoke tests (`tests/library.test.ts`).
- Element-level integration tests — Custom Elements + Shadow DOM via happy-dom (`tests/element.test.ts`).
- System prompt generator output (`tests/prompt.test.ts`).
- End-to-end demo programs from the docs (`tests/demos.test.ts`).
- Language support spec for editor / tooling integrations (`tests/language.test.ts`).

### Build the documentation site

```bash
npm run build:docs
```

Assembles `./site/` from `./docs/` + `./dist/`. Serve it with anything static:

```bash
npx http-server site -p 4321
# or
npx serve site
```

Then open <http://localhost:4321/index.html>.

---

## Security

The library treats every LLM-supplied attribute as untrusted and runs it
through a small set of sanitisers before it lands on the DOM:

| Sink | Helper | Effect |
| --- | --- | --- |
| Anchor `href` (`Link`, `BreadcrumbItem`, `NavbarItem`, Markdown links) | `sanitiseHref` | Allow-lists `http(s):`, `mailto:`, `tel:`, fragments, root-relative paths. Rejects `javascript:`, `vbscript:`, `data:text/html`, control-char bypasses (`java\tscript:`), protocol-relative `//host/...`. Unsafe URLs collapse to `#`. |
| Image `src` (`Image`, `Avatar`, `MediaCard`, `Hero`, `Testimonial`, `ChatBubble`) | `sanitiseImageSrc` | Allow-lists `http(s):`, `data:image/*`, `blob:`, plus relative paths. Anything else falls back to an empty string so callers render a placeholder. |
| Inline `style` lengths (`Container.maxWidth`, `Skeleton.height`, …) | `sanitiseCssLength` | Restricts the alphabet so semicolons / quotes cannot inject extra declarations. |
| `background-image: url(...)` (`Cover.imageSrc`) | `sanitiseCssUrl` | Drops characters that would close the `url()` literal. |
| `@OpenUrl("...")` action step | `sanitiseHref` (runtime) | The action runner sanitises the URL before calling `window.open` (or any consumer `onOpenUrl` override). External windows are opened with `noopener,noreferrer`. |

External links rendered by `Link`, `NavbarItem`, and the Markdown renderer
get `rel="noopener noreferrer"` so the destination cannot read the opener's
`document.referrer`.

If you embed `<streaming-ui-script>` behind a CSP, the bundle does not use
`eval`. `Script(...)` bodies are evaluated with `new (Async)Function(...)`
which requires `'unsafe-eval'` if you want scripting to work; omit the
attribute (and `@Js` action steps) if you cannot relax CSP.

---

## CDN deployment

This repository ships its own copy of the bundle on GitHub Pages, so most users
do not need to host anything themselves:

```html
<script type="module" src="https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js"></script>
<streaming-ui-script theme="dark"></streaming-ui-script>
```

…and a fetch of `system_prompt.txt` server-side to build LLM messages:

```bash
curl https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt.txt
```

To ship your own copy, run `npm run build` and serve the `dist/` folder from
any static host — every artifact in `dist/` is self-contained.

GitHub Pages deployment for this repo is automated via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). Push
to `main` and the workflow will build, test, assemble `site/`, and publish.

---

## Contributing

Contributions are very welcome. The fastest path is:

1. Fork and clone the repo.
2. `npm install && npm test` — make sure the suite is green on `main` first.
3. Make your change in a focused branch (e.g. `feat/inline-charts`).
4. Add or update tests in `tests/`. Aim for good edge-case coverage.
5. Run `npm run build` to confirm the bundle and the system prompt still build.
6. Open a pull request describing the motivation and any user-visible changes.

Issues, design discussions, and bug reports are tracked at
<https://github.com/asfand-dev/streaming-ui-script/issues>.

By contributing you agree that your work will be released under the project's
MIT license.

---

## License

MIT — see [LICENSE](LICENSE).
