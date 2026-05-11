---
name: llm-response-ui-lang
description: >-
  Renders LLM-generated UI inside any HTML page using the
  `<llm-response-ui-lang>` web component. Use when the user wants a chat
  assistant, agent, or LLM endpoint to return rich, interactive UI (cards,
  tables, charts, forms, follow-ups) instead of plain text or JSON, when
  integrating generative UI into React/Vue/Angular/Svelte/plain HTML, when
  asked to wire up streaming LLM responses, or when working with files that
  reference `llm-response-ui-lang`, `LLM Response UI Lang`, or `system_prompt.txt`.
---

# llm-response-ui-lang

A single web component that renders **LLM Response UI Lang** — a compact,
line-oriented language the LLM emits — into a styled, interactive shadow-DOM
UI. Drop one `<script>` tag and one `<llm-response-ui-lang>` tag into a page
and you have streaming generative UI in any framework.

- **Live docs:** <https://asfand-dev.github.io/llm-response-ui-lang/>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/llm-response-ui-lang/dist/llm-response-ui-lang.js>
- **System prompt:** <https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt>

## Quick start (copy-paste integration)

```html
<script type="module" src="https://asfand-dev.github.io/llm-response-ui-lang/dist/llm-response-ui-lang.js"></script>

<llm-response-ui-lang id="reply" theme="light"></llm-response-ui-lang>

<script>
  const el = document.getElementById("reply");
  el.setResponse(`root = Card([CardHeader("Hello", "Generative UI")])`);
</script>
```

That's the entire integration surface for static content. For a real LLM the
flow is:

1. Fetch the system prompt once and prepend it to every chat request.
2. Stream tokens from your model into `el.appendChunk(chunk)` while
   `el.streaming = true`.
3. When the stream finishes, set `el.streaming = false`.

```js
const systemPrompt = await fetch(
  "https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt",
).then((r) => r.text());

const res = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ system: systemPrompt, messages }),
});
const reader = res.body.getReader();
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

## Element API at a glance

### Attributes

| Attribute            | Values                                  | Purpose                                                                                                                                  |
|----------------------|-----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `theme`              | `light` (default), `dark`, JSON literal | Switches the theme. JSON merges into the light token map.                                                                                |
| `streaming`          | `true` / unset                          | Hint that text is still arriving. Suppresses transient mid-token parse errors.                                                           |
| `response`           | LLM Response UI Lang text               | Sets the program declaratively.                                                                                                          |
| `showerrors`         | `true` / unset                          | If present, shows parse errors in the rendered UI. Defaults to off.                                                                      |
| `enable-javascript`  | `true` / unset                          | If `true`, allows `Script(...)` and `@Js(...)` to execute and the generated system prompt includes a JavaScript section. Default `false`. |

### Methods

| Method                              | Purpose                                                         |
|-------------------------------------|-----------------------------------------------------------------|
| `setResponse(text)`                 | Replace the program (one-shot).                                 |
| `appendChunk(text)`                 | Append a streamed chunk and re-render.                          |
| `clear()`                           | Reset state, queries, and rendered output.                      |
| `setTheme(name \| tokens)`          | Apply a theme name or partial token map.                        |
| `setTools(tools)`                   | Register `Query` / `Mutation` handlers.                         |
| `registerComponents(specs, root?)`  | Extend the built-in library.                                    |
| `getSystemPrompt(opts?)`            | Build a system prompt that matches the live library.            |

### Events

| Event               | Detail                       | When it fires                                         |
|---------------------|------------------------------|-------------------------------------------------------|
| `assistant-message` | `{ message: string }`        | A button or follow-up ran `@ToAssistant("...")`.      |
| `error`             | `{ errors: ParseError[] }`   | After a render whose source had parse errors.         |

The `error` event always fires regardless of `showerrors`, so host apps can
log or surface errors even when the in-page banner is suppressed.

## LLM Response UI Lang in 60 seconds

Use this section to author or debug the program text the LLM produces.

```text
$days = "7"
data = Query("get_metrics", {days: $days}, {events: 0, daily: []})
filter = FormControl("Range", Select("days", [SelectItem("7","7d"), SelectItem("30","30d")], null, null, $days))
kpi = StatCard("Events", "" + data.events, "up")
chart = LineChart(data.daily.day, [Series("Events", data.daily.events)])
root = Stack([CardHeader("Analytics"), filter, kpi, chart])
```

Key rules:

- One statement per line: `name = Expression`.
- The first line MUST be `root = Stack([...])` (or another root component).
- Identifiers are bare (`snake_case` / `lowerCamel`); strings use double quotes.
- `$variables` are reactive — passing one as the value of `Input`, `Select`, or
  `Checkbox` two-way-binds it.
- `Query("tool", args, defaults, refreshSec?)` runs immediately and re-runs
  when its `$variable` args change. `Mutation("tool", args)` runs only via
  `@Run(name)` inside an `Action([...])`.
- Member access on arrays plucks: `data.rows.title` → array of titles.
- Forward references are allowed; define `root` first so the shell appears
  immediately during streaming.

Built-in functions (all `@`-prefixed):

- Aggregation: `@Count`, `@Sum`, `@Avg`, `@Min`, `@Max`, `@First`, `@Last`.
- Numeric: `@Round`, `@Abs`, `@Floor`, `@Ceil`.
- Filter / sort: `@Filter(arr, "field", "op", value)`, `@Sort(arr, "field", "asc"|"desc")`.
- Array growth: `@Push(arr, value)` (append, returns NEW array), `@Concat(a, b)`.
- Iteration: `@Each(arr, "varName", template)` — `varName` is scoped strictly to `template`.
- Action steps: `@Run(ref)`, `@Set($var, value)`, `@Reset($a, $b, ...)`,
  `@ToAssistant("text")`, `@OpenUrl("https://...")`, `@Js(body, args?)`.

Array & string shortcuts (member access):

- `$rows.length` / `$rows.first` / `$rows.last` — count and boundary elements.
- `$rows.field` — array pluck (map each item to `field`).
- `$msg.length` — character count for strings.

Component groups available out of the box: **Layout** (Stack, Card, Tabs,
Accordion, Modal, Steps), **Content** (TextContent, Markdown, Callout, Tag,
TagBlock, CodeBlock, Image), **Forms** (Form, Input, Select, Checkbox,
CheckBoxGroup, Radio, Button, Buttons), **Data** (Table, Col, List, StatCard),
**Charts** (BarChart, LineChart, PieChart, Series), **Chat** composites
(SectionBlock, FollowUpBlock, FollowUpItem, ActionLink), and **Scripting**
(`Script` — opt-in via `enable-javascript="true"`). For the full positional
signature of every component, call `el.getSystemPrompt()` or open
[components reference](https://asfand-dev.github.io/llm-response-ui-lang/components.html).

### JavaScript interactions (opt-in)

Set `enable-javascript="true"` on the element to allow the LLM to author
JavaScript via two surfaces:

- `Script("id", body, deps?)` — behaviour-only node that runs on mount and
  again whenever any listed `$variable` changes. Lifecycle matches
  `useEffect` (cleanup before re-run, disposal on unmount).
- `@Js(body, args?)` — action step you drop inside `Action([...])` to run JS
  imperatively from a button or follow-up. The optional `args` object is
  evaluated at render time and exposed inside the body as `ctx.args` — this
  is the **only correct way** to feed per-row data from `@Each` into a click
  handler.

`body` is a string. Two ergonomic options:

- Double-quoted (`"..."`) — one-line bodies. Escape inner `"` as `\"` and
  newlines as `\n`.
- Backtick-quoted (`` `...` ``) — multi-line bodies. Real newlines and
  unescaped double quotes are fine. Prefer this for any non-trivial script.

Both share a `ctx` argument exposing `state`, `tools`, `args`, `dispatch`,
`open`, `query`, `queryAll`, `host`, `cleanup`, and `signal`. The system
prompt only mentions these features when the flag is on, and
`getSystemPrompt()` mirrors the live attribute. See the
[JavaScript interactions guide](https://asfand-dev.github.io/llm-response-ui-lang/javascript-interactions.html)
for the full API, or [`coding-gen-skill.md`](./coding-gen-skill.md) for a
full app walkthrough.

```html
<llm-response-ui-lang
  id="renderer"
  enable-javascript="true"
></llm-response-ui-lang>
```

```js
// Backticks let the Script body span lines without escapes.
el.setResponse(`$count = 0
display = TextContent("" + $count, "large-heavy")
ticker = Script("ticker", \`
  const id = setInterval(() => {
    ctx.state.set('count', (ctx.state.get('count') ?? 0) + 1);
  }, 1000);
  ctx.cleanup(() => clearInterval(id));
\`, [])
root = Stack([display, ticker])`);
```

#### Per-item handler pattern (the @Js(body, args) idiom)

Loop variables from `@Each` are **render-time only**. They are NOT readable
from JS through `ctx.state` — pass them as `@Js`'s second argument instead:

```text
$todos = [{id: 1, text: "Walk dog"}, {id: 2, text: "Buy milk"}]

list = @Each($todos, "t", row)
row = Card([Stack([
  TextContent(t.text),
  Button("Delete", Action([
    @Set($todos, @Filter($todos, "id", "!=", t.id))  // no JS — pure builtins
  ])),
  Button("Toggle", Action([
    @Js(`
      const todos = ctx.state.get('todos') || [];
      ctx.state.set('todos', todos.map(x => x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x));
    `, {id: t.id})
  ]))
])])

root = Stack([list])
```

Prefer pure builtins (`@Set` + `@Filter` / `@Push` / `@Sort`) over JS whenever
the operation is expressible declaratively. Reach for `@Js` only when no
builtin captures the change (e.g. toggling one field of one item).

## Common integration patterns

### 1. Chat bot that renders rich responses

Tell the model in the system prompt that it must respond ONLY in LLM Response
UI Lang, then stream tokens into the element. The component handles partial
parses, so users see the layout shell appear before its children fill in.

```js
el.streaming = true;
el.clear();
for await (const delta of streamFromModel(messages)) {
  el.appendChunk(delta);
}
el.streaming = false;
```

Hook follow-up buttons back into the conversation:

```js
el.addEventListener("assistant-message", (event) => {
  sendMessage(event.detail.message);
});
```

### 2. Wiring tools (`Query` / `Mutation`)

Tools are plain async functions registered on the element. The argument object
matches the call site; the return value becomes the result of the `Query` or
`Mutation`.

```js
el.setTools({
  list_orders: async ({ limit }) =>
    fetch(`/api/orders?limit=${limit}`).then((r) => r.json()),
  update_order: async ({ id, status }) => {
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    return { ok: true };
  },
});
```

Then advertise them to the LLM in the system prompt so it knows the names and
shapes:

```js
const prompt = el.getSystemPrompt({
  tools: [
    { name: "list_orders", description: "Recent orders.", argsExample: { limit: 10 } },
    { name: "update_order", description: "Patch an order.", kind: "Mutation",
      argsExample: { id: "ord_1", status: "shipped" } },
  ],
});
```

### 3. Adding a custom component

Custom specs render to any DOM. Register them on the element and they appear
in the next `getSystemPrompt()` call automatically.

```js
el.registerComponents([
  {
    name: "ProductCard",
    description: "Product tile with title and price.",
    props: [
      { name: "title", type: "string" },
      { name: "price", type: "number" },
    ],
    render: (_node, props) => {
      const card = document.createElement("div");
      card.textContent = `${props.title} — $${props.price}`;
      return card;
    },
  },
]);
```

### 4. Theming

Pass a built-in name or a partial token map. Tokens are CSS custom properties
on the host element, so they propagate without re-rendering.

```js
el.setTheme("dark");
el.setTheme({
  colorPrimary: "#16a34a",
  colorPrimaryHover: "#15803d",
  radiusMd: "14px",
});
```

## Framework integration recipes

The element is a standard Custom Element, so every framework treats it like a
native HTML tag. Three details worth knowing:

| Framework | Notes                                                                                                |
|-----------|------------------------------------------------------------------------------------------------------|
| React     | Pass `response` as a string prop. For tools/events use a `ref` and call `setTools` / `addEventListener` in `useEffect`. |
| Vue       | Treat as a normal element. Bind `:response` and use `@assistant-message` for the event.              |
| Angular   | Add `CUSTOM_ELEMENTS_SCHEMA` to the module. Use property binding `[response]` and `(assistant-message)` events. |
| Svelte    | Just use `<llm-response-ui-lang response={text}>` and handle events with `on:assistant-message`.     |

## Troubleshooting

- **Nothing renders.** Confirm the script tag is `type="module"`. Confirm the
  first emitted line is `root = Stack(...)` (or another root component).
- **Errors flash during streaming.** Set `el.streaming = true` before the
  first `appendChunk` and back to `false` after the last one. Banner is
  suppressed during streaming.
- **Parse errors hidden.** They are by design. Add the `showerrors`
  attribute (or set `el.showErrors = true`) when debugging, or listen to the
  `error` event for programmatic reporting.
- **Query never re-runs when state changes.** Make sure the state variable is
  passed as a `$variable` reference inside the args object — string
  interpolation (`{q: "" + $search}`) breaks the dependency tracking.
- **Tools called with `undefined` args.** The arg object always reflects the
  call site; if a `$variable` is empty, the value is `""` (string). Default
  inside the tool with `?? ""` rather than relying on absence.

## When to use this skill vs. alternatives

Reach for this library when:

- The LLM output drives the UI (the user can't enumerate every layout up front).
- You want streaming responses to render progressively without rebuilding a
  parser per host app.
- You want a framework-agnostic embed that works in legacy HTML, React, Vue,
  Angular, Svelte, etc.

Skip it when:

- The UI is fully static and known ahead of time — use plain HTML/components.
- The LLM only ever returns short text — render the text directly, no DSL
  needed.
- You need full design-system parity with a specific framework's components —
  build a custom renderer instead.

## Further reading

- Full README: [README.md](./README.md)
- **Deep app-building knowledge base:** [`coding-gen-skill.md`](./coding-gen-skill.md)
  — read this when the goal is to author a complete app (todo list, dashboard,
  chat, wizard, settings, real-time feed, etc.) rather than embed the
  component.
- Component reference: <https://asfand-dev.github.io/llm-response-ui-lang/components.html>
- Language reference: <https://asfand-dev.github.io/llm-response-ui-lang/language.html>
- JavaScript interactions: <https://asfand-dev.github.io/llm-response-ui-lang/javascript-interactions.html>
- Live demos (chat, tools, external data): <https://asfand-dev.github.io/llm-response-ui-lang/examples.html>
- Generated system prompt (always in sync with the bundle):
  <https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt>
