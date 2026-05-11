# streaming-ui-script

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Pages](https://img.shields.io/badge/docs-github%20pages-6366f1)](https://asfand-dev.github.io/streaming-ui-script/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-10b981.svg)](#contributing)

A framework-agnostic web component that renders LLM-generated UI from
**Streaming UI Script** — a compact, declarative language designed for chat
assistants. Drop one `<script>` tag and one `<streaming-ui-script>` tag into
any HTML page — React, Vue, Angular, Svelte, plain HTML, or no framework at
all — and you have a streaming, interactive renderer for an LLM's response.

- **Live docs and demos:** <https://asfand-dev.github.io/streaming-ui-script/>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js>
- **System prompt:** <https://asfand-dev.github.io/streaming-ui-script/dist/system_prompt.txt>

The library bundles everything needed at runtime:

- An **Streaming UI Script parser** (line-oriented, streaming-first, error-tolerant) with single-, double-, and backtick-quoted strings.
- An **evaluator with reactive state**, queries, mutations, actions, and 20+ built-in functions (`@Count`, `@Filter`, `@Sort`, `@Push`, `@Concat`, `@Each`, …) plus array shortcuts (`.length`, `.first`, `.last`).
- A **rich component library** of ~50 components (layout, content, forms, tables, charts, chat composites, …).
- An **opt-in JavaScript layer** — `Script(...)` (lifecycle-managed, `useEffect`-style) and `@Js(body, args?)` (one-shot click handlers with per-item arg capture). Off by default.
- An **opt-in routing layer** — `Routes(...)`, `Route(path, content)`, `NavLink(label, to)`, `@Navigate("/path")`, and reactive `$route` + `params`. Hash-based, framework-agnostic, off by default.
- **Two built-in themes** (`light`, `dark`) plus full custom-token support via CSS custom properties.
- A **system prompt generator** that emits a clean, ordered prompt teaching the LLM exactly which components, builtins, and tools are available.

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
| `enable-javascript`  | `true` / unset                                        | If `true`, allows `Script(...)` + `@Js(...)` to run and the generated system prompt teaches the LLM about them. Defaults to off.         |
| `enable-routes`      | `true` / unset                                        | If `true`, enables hash-based routing (`Routes` / `Route` / `NavLink` / `@Navigate`) and adds the routing section to the system prompt. Defaults to off. |

### Properties

| Property            | Type                          | Description                                                            |
|---------------------|-------------------------------|------------------------------------------------------------------------|
| `response`          | `string`                      | Equivalent to `setResponse`.                                           |
| `tools`             | `Record<string, Function>`    | Setter equivalent to `setTools(...)`.                                  |
| `streaming`         | `boolean`                     | Reflects the `streaming` attribute.                                    |
| `showErrors`        | `boolean`                     | Reflects the `showerrors` attribute.                                   |
| `enableJavascript`  | `boolean`                     | Reflects the `enable-javascript` attribute.                            |
| `enableRoutes`      | `boolean`                     | Reflects the `enable-routes` attribute.                                |
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
| `route-change`       | `{ path, previousPath, params, pattern }` | When the current hash path changes (only fires while routing is enabled). |

The `error` event always fires regardless of `showerrors`, so host apps can
log or report errors even when the in-page banner is suppressed.

---

## Themes

Two themes are built in. Pick one with `theme="..."` or pass a custom token map.

| Theme       | Vibe                                                  |
|-------------|-------------------------------------------------------|
| `light`     | Crisp default, indigo accent.                         |
| `dark`      | Standard dark surface, indigo accent.                 |

Custom token maps:

```js
el.setTheme({
  colorPrimary: "#16a34a",
  colorPrimaryHover: "#15803d",
  colorBg: "#f0fdf4",
  radiusMd: "14px",
});
```

You can also style the host element from outside:

```css
streaming-ui-script {
  --rui-color-primary: #16a34a;
  --rui-radius-md: 14px;
}
```

A full list of tokens lives in `docs/themes.html` and `src/theme/index.ts`.

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
- `$variables` are reactive — passing one to an Input or Select two-way-binds.
- Strings come in three flavours: `"double"`, `'single'`, and `` `backtick` `` (multi-line, no escaping required — perfect for JS bodies).
- `Query("tool", {args}, {defaults}, refreshSec?)` runs immediately and re-runs when its `$variable` args change.
- `Mutation("tool", {...})` only runs from `@Run(name)` inside an `Action([...])`.
- `@Each(arr, "row", template)` iterates inline. The loop variable is scoped strictly to `template`.
- `@Filter`, `@Sort`, `@Count`, `@Sum`, `@Avg`, `@Round`, `@Push`, `@Concat` and more are available.
- Array shortcuts: `$rows.length`, `$rows.first`, `$rows.last`, plus pluck (`$rows.title` → `[title1, title2, …]`).
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

## JavaScript interactions (opt-in)

Add `enable-javascript="true"` to the element and the LLM may emit two extra
surfaces:

- `Script("id", body, deps?)` — behaviour-only node that runs on mount and
  re-runs whenever any listed `$variable` changes. Lifecycle matches
  `useEffect`: cleanup before re-run, disposal on unmount, AbortSignal exposed
  as `ctx.signal`.
- `@Js(body, args?)` — action step you drop inside `Action([...])`. The
  optional `args` object is evaluated at render time and exposed inside the
  body as `ctx.args`. This is the canonical way to feed per-row data from an
  `@Each` loop into a click handler.

```html
<streaming-ui-script enable-javascript="true"></streaming-ui-script>
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
newlines and unescaped `"` are fine). The generated system prompt teaches the
LLM about these features only when the flag is on, and `getSystemPrompt()`
always mirrors the live attribute.

See the [JavaScript interactions guide](https://asfand-dev.github.io/streaming-ui-script/javascript-interactions.html)
or the deeper [`coding-gen-skill.md`](./coding-gen-skill.md) for a full
end-to-end app walkthrough.

## Routing (opt-in)

Add `enable-routes="true"` to the element and the LLM may emit hash-based
routes that stay in sync with the URL (`#/dashboard`, `#/users/42`). Browser
back/forward, bookmarks, and deep links all work — and the host page never
reloads.

```html
<streaming-ui-script enable-routes="true"></streaming-ui-script>
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

The generated system prompt teaches the LLM about routing only when the flag
is on; with `enable-routes="false"` (the default) the routing section is
omitted entirely and routing components fall back to inert rendering.

See the [routing guide](https://asfand-dev.github.io/streaming-ui-script/routing.html)
and the [live routing demo](https://asfand-dev.github.io/streaming-ui-script/routing-demo.html)
for a full end-to-end walkthrough.

## Built-in components

| Group     | Components                                                                                                              |
|-----------|-------------------------------------------------------------------------------------------------------------------------|
| Layout    | `Stack`, `Section`, `Card`, `CardHeader`, `CardBody`, `CardFooter`, `Divider`, `Separator`, `Tabs`, `TabItem`, `Accordion`, `AccordionItem`, `Modal`, `Steps`, `StepsItem` |
| Content   | `TextContent`, `Header`, `Image`, `Link`, `Badge`, `Tag`, `TagBlock`, `Alert`, `Callout`, `CodeBlock`, `Skeleton`, `Markdown` |
| Forms     | `Form`, `FormControl`, `Input`, `TextArea`, `Select`, `SelectItem`, `Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Button`, `Buttons` |
| Data      | `Table`, `Col`, `List`, `ListItem`, `StatCard`                                                                          |
| Charts    | `BarChart`, `LineChart`, `PieChart`, `Series`                                                                           |
| Chat      | `SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`, `ActionLink`                                              |
| Scripting | `Script` (opt-in via `enable-javascript="true"`)                                                                        |
| Routing   | `Routes`, `Route`, `NavLink` (opt-in via `enable-routes="true"`)                                                        |

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
two companion documents are kept in sync with the bundle:

- [`SKILL.md`](./SKILL.md) — a focused, hostable agent skill describing **when
  to reach for this component** and the minimum integration surface (mount,
  stream, tools, theme).
- [`coding-gen-skill.md`](./coding-gen-skill.md) — an **extensive knowledge
  base** for building complete applications in Streaming UI Script: mental
  model, every component group, state management, queries/mutations, actions,
  loops, JavaScript interactions, app patterns (todo list, dashboard, wizard,
  chat, settings, real-time), and anti-patterns. Treat it as the "deep dive"
  the model can read once and then author full apps unaided.

---

## Project layout

```
.
├── src/                 # Library source
│   ├── parser/          # Lexer, parser, AST types
│   ├── runtime/         # Evaluator, reactive state, queries, actions, builtins
│   ├── library/         # Component specs and registry
│   ├── renderer/        # Tree → DOM
│   ├── theme/           # Token system + injected stylesheet
│   ├── prompt/          # System prompt generator
│   ├── element.ts       # The custom element
│   └── index.ts         # Public entry point
├── docs/                # Static documentation site (HTML + CSS + JS)
├── scripts/
│   ├── emit-prompt.mjs  # Writes dist/system_prompt.txt from the bundle
│   └── build-docs.mjs   # Assembles ./site/ from docs/ + dist/
├── tests/               # Vitest unit + element regression tests
├── dist/                # Built artifacts (created by `npm run build`)
└── site/                # Deployable static docs (created by `npm run build:docs`)
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
dist/system_prompt.txt                # Auto-generated prompt
```

### Run the test suite

```bash
npm test
```

Includes:

- Parser/lexer correctness.
- Runtime evaluator + reactive state.
- Built-in function semantics.
- Component library smoke tests.
- Element-level integration tests (Custom Elements + Shadow DOM via happy-dom).

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
