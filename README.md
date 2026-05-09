# llm-response-ui-lang

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Pages](https://img.shields.io/badge/docs-github%20pages-6366f1)](https://asfand-dev.github.io/llm-response-ui-lang/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-10b981.svg)](#contributing)

A framework-agnostic web component that renders LLM-generated UI from
**LLM Response UI Lang** — a compact, declarative language designed for chat
assistants. Drop one `<script>` tag and one `<llm-response-ui-lang>` tag into
any HTML page — React, Vue, Angular, Svelte, plain HTML, or no framework at
all — and you have a streaming, interactive renderer for an LLM's response.

- **Repository:** <https://github.com/asfand-dev/llm-response-ui-lang>
- **Live docs and demos:** <https://asfand-dev.github.io/llm-response-ui-lang/>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/llm-response-ui-lang/dist/llm-response-ui-lang.js>
- **System prompt:** <https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt>

The library bundles everything needed at runtime:

- An **LLM Response UI Lang parser** (line-oriented, streaming-first, error-tolerant).
- An **evaluator with reactive state**, queries, mutations, actions, and 17
  built-in functions (`@Count`, `@Filter`, `@Each`, etc.).
- A **rich component library** of ~50 components (layout, content, forms,
  tables, charts, chat composites, …).
- **Two built-in themes** (`light`, `dark`) plus full custom-token support via
  CSS custom properties.
- A **system prompt generator** that emits a clean, ordered prompt teaching the
  LLM exactly which components are available.

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
<script type="module" src="https://asfand-dev.github.io/llm-response-ui-lang/dist/llm-response-ui-lang.js"></script>
```

For non-module setups use the IIFE build:

```html
<script src="https://asfand-dev.github.io/llm-response-ui-lang/dist/llm-response-ui-lang.iife.js" defer></script>
```

The CSS is bundled inside the JS and injected into each instance's shadow root,
so you do **not** need a separate stylesheet.

### 2. Mount the tag

```html
<llm-response-ui-lang id="reply" theme="light"></llm-response-ui-lang>
```

### 3. Render a response

There are three equivalent ways to set the program text:

```html
<!-- as an attribute -->
<llm-response-ui-lang response='root = Card([CardHeader("Hi")])'></llm-response-ui-lang>

<!-- as inner text -->
<llm-response-ui-lang>
  root = Card([CardHeader("Hi")])
</llm-response-ui-lang>

<!-- as a property / method -->
<script>
  const el = document.querySelector("llm-response-ui-lang");
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
  "https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt",
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

All members live on the `<llm-response-ui-lang>` element.

### Attributes

| Attribute    | Values                                                | Description                                                                                |
|--------------|-------------------------------------------------------|--------------------------------------------------------------------------------------------|
| `theme`      | `light`, `dark`, or a JSON object literal             | Switches the theme. JSON objects are merged with the default `light` token map.            |
| `streaming`  | `true` / unset                                        | Hint that text is still being appended. Useful for status indicators in your app.          |
| `response`   | LLM Response UI Lang text                             | Sets the program declaratively. Re-renders whenever the attribute changes.                 |
| `showerrors` | `true` / unset                                        | If present and `true`, displays parse errors in the rendered UI. Defaults to off.          |

### Properties

| Property     | Type                          | Description                                                            |
|--------------|-------------------------------|------------------------------------------------------------------------|
| `response`   | `string`                      | Equivalent to `setResponse`.                                           |
| `tools`      | `Record<string, Function>`    | Setter equivalent to `setTools(...)`.                                  |
| `streaming`  | `boolean`                     | Reflects the `streaming` attribute.                                    |
| `showErrors` | `boolean`                     | Reflects the `showerrors` attribute.                                   |

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

### Events

| Event                | Detail                          | When it fires                                                  |
|----------------------|---------------------------------|----------------------------------------------------------------|
| `assistant-message`  | `{ message: string }`           | When `@ToAssistant("...")` runs (e.g. a follow-up button).     |
| `error`              | `{ errors: ParseError[] }`      | After each render whose source had parse errors.               |

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
llm-response-ui-lang {
  --rui-color-primary: #16a34a;
  --rui-radius-md: 14px;
}
```

A full list of tokens lives in `docs/themes.html` and `src/theme/index.ts`.

---

## LLM Response UI Lang in 60 seconds

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
- `Query("tool", {args}, {defaults}, refreshSec?)` runs immediately and re-runs
  when its `$variable` args change.
- `Mutation("tool", {...})` only runs from `@Run(name)` inside an `Action([...])`.
- `@Each(arr, "row", template)` iterates inline; `@Filter`, `@Sort`, `@Count`,
  `@Sum`, `@Avg`, `@Round`, etc. are all available.
- Forward references are allowed — list `root = Stack([...])` first and let the
  children stream in beneath it.

The full reference is on the docs site (`docs/language.html`).

---

## Built-in components

| Group     | Components                                                                                                              |
|-----------|-------------------------------------------------------------------------------------------------------------------------|
| Layout    | `Stack`, `Section`, `Card`, `CardHeader`, `CardBody`, `CardFooter`, `Divider`, `Separator`, `Tabs`, `TabItem`, `Accordion`, `AccordionItem`, `Modal`, `Steps`, `StepsItem` |
| Content   | `TextContent`, `Header`, `Image`, `Link`, `Badge`, `Tag`, `TagBlock`, `Alert`, `Callout`, `CodeBlock`, `Skeleton`, `Markdown` |
| Forms     | `Form`, `FormControl`, `Input`, `TextArea`, `Select`, `SelectItem`, `Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Button`, `Buttons` |
| Data      | `Table`, `Col`, `List`, `ListItem`, `StatCard`                                                                          |
| Charts    | `BarChart`, `LineChart`, `PieChart`, `Series`                                                                           |
| Chat      | `SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`, `ActionLink`                                              |

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
read [`SKILL.md`](./SKILL.md) — it's a self-contained guide that teaches an LLM
exactly when to reach for this component, what the language looks like, and how
to wire it into a host application.

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
git clone https://github.com/asfand-dev/llm-response-ui-lang.git
cd llm-response-ui-lang
npm install
```

### Build the library and system prompt

```bash
npm run build
```

Produces:

```
dist/llm-response-ui-lang.js          # ESM bundle
dist/llm-response-ui-lang.umd.cjs     # UMD bundle for older bundlers
dist/llm-response-ui-lang.iife.js     # IIFE for non-module <script> tags
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
<script type="module" src="https://asfand-dev.github.io/llm-response-ui-lang/dist/llm-response-ui-lang.js"></script>
<llm-response-ui-lang theme="dark"></llm-response-ui-lang>
```

…and a fetch of `system_prompt.txt` server-side to build LLM messages:

```bash
curl https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt
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
<https://github.com/asfand-dev/llm-response-ui-lang/issues>.

By contributing you agree that your work will be released under the project's
MIT license.

---

## License

MIT — see [LICENSE](LICENSE).
