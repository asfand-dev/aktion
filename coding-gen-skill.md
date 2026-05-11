---
name: llm-response-ui-lang/coding-gen-skill
description: >-
  Deep knowledge base for building **complete applications** in
  LLM Response UI Lang. Read this when the goal is to author a full
  reactive app (todo list, dashboard, wizard, chat, settings, real-time feed,
  search, CRUD) rather than embed the renderer or answer a one-shot UI
  question. Companion to README.md (integration) and SKILL.md (skill summary).
---

# Introduction 

## What is LLM Response UI Lang (llm-response-ui-lang)

A framework-agnostic web component that renders LLM-generated UI from
**LLM Response UI Lang** — a compact, declarative language designed for chat
assistants. Drop one `<script>` tag and one `<llm-response-ui-lang>` tag into
any HTML page — React, Vue, Angular, Svelte, plain HTML, or no framework at
all — and you have a streaming, interactive renderer for an LLM's response.

- **Live docs and demos:** <https://asfand-dev.github.io/llm-response-ui-lang/>
- **CDN bundle (ESM):** <https://asfand-dev.github.io/llm-response-ui-lang/dist/llm-response-ui-lang.js>
- **System prompt:** <https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt>

The library bundles everything needed at runtime:

- An **LLM Response UI Lang parser** (line-oriented, streaming-first, error-tolerant) with single-, double-, and backtick-quoted strings.
- An **evaluator with reactive state**, queries, mutations, actions, and 20+ built-in functions (`@Count`, `@Filter`, `@Sort`, `@Push`, `@Concat`, `@Each`, …) plus array shortcuts (`.length`, `.first`, `.last`).
- A **rich component library** of ~50 components (layout, content, forms, tables, charts, chat composites, …).
- An **opt-in JavaScript layer** — `Script(...)` (lifecycle-managed, `useEffect`-style) and `@Js(body, args?)` (one-shot click handlers with per-item arg capture). Off by default.
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

# Building applications with LLM Response UI Lang

> **Audience.** You are an LLM authoring code in a host page that has mounted
> `<llm-response-ui-lang>`. This document teaches the full mental model and
> all the patterns needed to build apps end-to-end. It assumes the basics
> from [`SKILL.md`](./SKILL.md) and goes deep.
>
> Use this as the *single source of truth* for the language. When in doubt,
> grep this file before writing code; the prompt sent to you at runtime is
> intentionally compressed.

---

## 0. TL;DR — the ten rules

If you internalise only these ten rules, you will write correct programs:

1. **One statement per line.** `name = Expression`. The renderer commits each
   line as it streams in.
2. **`root = …` is line one.** It anchors the UI shell so users see structure
   before children arrive. Use forward references (`root = Stack([header, list])`)
   and define `header`, `list` below it.
3. **`$variables` are the only mutable state.** Everything else is recomputed
   from them on every render.
4. **`Query` runs automatically when its `$variable` args change.** Pass the
   bare `$variable` — `{q: $search}`, not `{q: "" + $search}` — so dependency
   tracking works.
5. **`Mutation` only runs from `@Run(name)` inside `Action([...])`.**
6. **`@Each($items, "x", template)` scopes `x` strictly to `template`.** `x`
   is **not** state and **cannot** be read via `ctx.state` from JS.
7. **Pass per-item data to JS via `@Js(body, {id: x.id})`.** Read it inside
   the body as `ctx.args.id`.
8. **Prefer declarative builtins (`@Push`, `@Filter`, `@Sort`, `@Set`) over
   `@Js`.** Only fall back to JS when no builtin captures the change (e.g.
   toggling one field on one item).
9. **Strings come in three flavours.** `"double"`, `'single'`, and
   `` `backtick` ``. Backticks span lines and don't need escapes — use them
   for multi-line script bodies.
10. **`Script(...)` requires `enable-javascript="true"` on the host element.**
    Without it, `Script` and `@Js` silently no-op.

---

## 1. Mental model

LLM Response UI Lang has three layers that compose into a full application:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1 — Declarative tree                                      │
│   Composition of components. Pure data. Re-computed every       │
│   render. Lazy: each `name = Expr` is a function of the current │
│   state, evaluated only when something downstream needs it.     │
│                                                                 │
│       root = Stack([header, body])                              │
│       header = Header("Hi", "Welcome")                          │
│       body = Card([TextContent($message)])                      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ depends on
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2 — Reactive state                                        │
│   `$variables` (read/written by humans and by JS) and `Query`   │
│   results (read-only, refreshed by the runtime when args        │
│   change). A change to either schedules a re-render.            │
│                                                                 │
│       $message = "Hello"                                        │
│       data = Query("get_metrics", {days: $days})                │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ updated by
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3 — Effects                                               │
│   `Action([...])` runs on click / submit / follow-up.           │
│   `Script(...)` runs on mount and re-runs when deps change      │
│   (opt-in via `enable-javascript`). Both can update state, call │
│   tools, and dispatch messages — closing the loop back to L2.   │
│                                                                 │
│       btn = Button("Refresh", Action([@Run(data), @Set($q, "")]))│
└─────────────────────────────────────────────────────────────────┘
```

**Why this matters.** Most app behaviour is expressible in L1 + L2 alone.
Reach for L3 only when the change isn't expressible as a pure data
transformation (timers, fetches you control, focus, animation, clipboard,
keyboard shortcuts, audio).

---

## 2. Anatomy of a response

### Statement shape

```
identifier = Expression
$identifier = Literal               # reactive state declaration
```

- `identifier` is bare: `kebab-case`, `snake_case`, or `lowerCamelCase`. No
  prefix unless it's a state declaration.
- `Expression` is any LLM Response UI Lang expression (component call, value,
  ternary, member access, etc.).
- `$identifier = …` declares reactive state. The right-hand side **must be a
  literal** (string, number, boolean, array, object) — no function calls.

### Streaming-friendly ordering

The renderer commits one statement at a time as text streams in. To make
your UI render top-down (shell first, leaves last):

1. **`root = …` first.** Always.
2. **Component definitions** that `root` references (`header`, `body`,
   `footer`, etc.).
3. **State declarations** (`$days = "7"`).
4. **Leaf data** (long arrays, big strings, generated tables) on their own
   trailing lines so they appear last.

Example:

```text
root = Stack([hero, kpis, chart, footer])
hero = Card([CardHeader("Q3 Performance", "Revenue and growth")])
kpis = Stack([rev, growth], "row", "m")
rev = StatCard("Revenue", "" + data.revenue, "up", "+12%")
growth = StatCard("Growth", data.growth_pct, "up")
chart = LineChart(months, [series])
footer = TextContent("Generated by LLM Response UI Lang", "small", "muted")

$days = "90"
data = Query("perf_summary", {days: $days}, {revenue: 0, growth_pct: "0%"})
months = ["Jul", "Aug", "Sep"]
series = Series("Revenue", [120000, 145000, 162000])
```

When this streams in, the user sees the four-card layout immediately, then
each card fills in as its definition arrives.

### Forward references (hoisting)

Names are resolved lazily — every identifier reference re-evaluates the
binding when read. That's why `root = Stack([greeting])` works even when
`greeting = Card(...)` is defined later. The same hoisting works inside
`@Each` templates:

```text
list = @Each($todos, "t", row)
row = Card([TextContent(t.text), Button("X", Action([@Set($todos, @Filter($todos, "id", "!=", t.id))]))])
```

Even though `row` references `t` (a loop variable), the binding for `row`
re-evaluates per iteration with `t` in scope — so each rendered row sees its
own item.

### Comments

There are no comments. Anything you'd express as a comment, leave out.
(Identifiers double as documentation: name things well — `expandedRowId`,
`totalCount`, `formIsValid`.)

---

## 3. Reactive state

### Declaring state

```text
$count = 0
$query = ""
$filter = "all"
$todos = [{id: 1, text: "Welcome"}]
$user = {name: "Anon", email: ""}
$open = false
```

The literal on the right is the **initial value AND the reset value**.
`@Reset($count)` returns it to `0`, not `undefined`.

### Reading state

Use the `$` prefix anywhere an expression is allowed:

```text
greeting = TextContent("Hello, " + $user.name)
visible = @Filter($todos, "done", "==", false)
disabled = $query == ""
```

### Writing state from actions

```text
clearBtn = Button("Clear", Action([@Set($query, "")]))
resetAll = Button("Reset", Action([@Reset($query, $filter, $count)]))
incBtn   = Button("+1",    Action([@Set($count, $count + 1)]))
```

`@Set(name, value)` evaluates `value` at render time and bakes it into the
step. `@Reset(...)` returns each named state to its declared default.

### Two-way binding

Forms two-way-bind when you pass a `$variable` as the value prop:

```text
$query = ""
field = Input("q", "Search…", "text", null, $query)
```

Typing into the field updates `$query`. Anywhere else in the program that
reads `$query` re-renders.

Bindings work for `Input`, `TextArea`, `Select`, `Checkbox`, `CheckBoxGroup`,
and `Radio`. The argument position is always the trailing `value` prop —
check the component reference (§ 9) for each signature.

### Snapshotting state in JS

Inside a `Script` or `@Js` body, use `ctx.state.get(name)` / `ctx.state.set(name, value)`.
Loop variables (from `@Each`) are **render-time only** — see § 6 and § 10.

---

## 4. Tools: Query and Mutation

The host page registers async functions:

```js
el.setTools({
  list_orders:  async ({ limit }) => fetch(`/api/orders?limit=${limit}`).then(r => r.json()),
  update_order: async ({ id, status }) => fetch(`/api/orders/${id}`, {method:"PATCH", body: JSON.stringify({status})}).then(r => r.json()),
});
```

The LLM calls them through two declarative wrappers.

### Query: auto-running, dependency-tracked

```text
data = Query("list_orders", {limit: 10, status: $statusFilter}, {rows: [], total: 0}, 30)
```

- **Args 0 — tool name.** Must match a key in `setTools`.
- **Args 1 — arguments object.** Each `$variable` reference becomes a
  dependency. When it changes, `Query` re-runs.
- **Args 2 — default value.** Shown until the first result lands; also used
  while the query is re-running. Pick a shape your downstream code can
  safely read (`{rows: [], total: 0}`, not `null`).
- **Args 3 — optional refresh interval in seconds.** `Query(..., ..., ..., 30)`
  re-runs the tool every 30 s **in addition to** dependency-triggered runs.

Reading the result is just member access:

```text
totalRow = TextContent("" + data.total + " orders")
rows = @Each(data.rows, "o", orderRow)
orderRow = ListItem(o.title, "$" + o.amount)
```

### Mutation: explicit, action-triggered

```text
saveBtn = Button("Save", Action([@Run(saveMutation), @ToAssistant("Saved")]))
saveMutation = Mutation("update_order", {id: $current.id, status: $current.status})
```

- Same first three argument positions as `Query`.
- **Never runs automatically.** You must trigger it via `@Run(name)` inside
  an action.
- After `@Run` completes, the renderer re-evaluates everything (so any
  `Query` whose result was invalidated should re-fetch — see § 7 on cache
  busting).

### Forcing a Query to re-fetch

If a mutation changes server state but doesn't change any `Query` argument,
add a version counter:

```text
$ver = 0
data = Query("list_todos", {filter: $filter, ver: $ver}, {rows: []})

addBtn = Button("Add", Action([
  @Run(addMutation),
  @Set($ver, $ver + 1)   // bumps the dependency, forces re-run
]))
addMutation = Mutation("add_todo", {title: $draft})
```

### When to model as Query vs Mutation vs local state

| Operation                                   | Use                       |
|---------------------------------------------|---------------------------|
| Fetch a list / search results / KPIs        | `Query` (auto, with deps) |
| Create / update / delete on the server      | `Mutation`                |
| Toggle a panel, switch a tab, hold a draft  | `$variable` + `@Set`      |
| Compute something from existing data        | bare expression / builtin |
| Run periodic polling                        | `Query(..., refreshSec)`  |

---

## 5. Actions — wiring buttons, follow-ups, and forms

Every interactive control takes an `Action([...])` payload. Action steps
execute sequentially; a failing step short-circuits the rest.

### The full step menu

| Step                          | Effect                                                                 |
|-------------------------------|------------------------------------------------------------------------|
| `@Set($name, value)`          | Write `$name = value`. `value` is evaluated at render time.            |
| `@Reset($a, $b, …)`           | Reset each state to its declared default.                              |
| `@Run(ref)`                   | Execute a `Query` or `Mutation` by name. Awaited before next step.     |
| `@ToAssistant("text")`        | Fire `assistant-message` event. Typical for follow-ups.                |
| `@OpenUrl("https://…")`       | Open a URL (defaults to `window.open` with `noopener`).                |
| `@Js(body, args?)`            | Run a JavaScript body. Opt-in. See § 10.                               |

### Multi-step actions

```text
saveBtn = Button("Save & Close", Action([
  @Run(saveMutation),
  @Set($editing, false),
  @ToAssistant("Saved.")
]))
```

### Buttons grouped horizontally

```text
controls = Buttons([
  Button("Cancel", Action([@Set($open, false)]), "ghost"),
  Button("Save",   Action([@Run(saveMutation)]),  "primary")
])
```

### Follow-ups

`FollowUpBlock` accepts plain strings, `{label, message}` objects, or
`FollowUpItem(label, message?)` calls. Clicking sends the message back to
the LLM via `@ToAssistant`.

```text
prompts = FollowUpBlock([
  FollowUpItem("Show me last week's data"),
  FollowUpItem("Filter to closed deals", "Show only closed deals.")
])
```

---

## 6. Loops & lists

The single most error-prone area for LLMs. Read this carefully.

### `@Each(arr, "varName", template)`

- Iterates `arr`. For each item, binds `varName` and evaluates `template`.
- `template` is **any expression** — typically an identifier that references
  a component definition, or an inline `Component(...)` call.
- The bound variable is **only visible inside `template`** (and inside
  anything `template` recursively references via named bindings).

```text
$todos = [{id: 1, text: "a", done: false}, {id: 2, text: "b", done: true}]
list = @Each($todos, "t", row)
row = Card([Stack([
  Tag(t.done ? "done" : "open"),
  TextContent(t.text)
])])
```

Both `row` and the bindings it references re-evaluate per iteration with
`t` bound.

### What does **not** work

- Reading `t` outside the template: `total = @Count(t)`. ❌
- Reading `t` from JS via `ctx.state.get('t')`. ❌ (`t` is not state.)
- Defining `t` as a state variable (`$t = ...`) to "share" the loop var. ❌

### Passing per-item data to JS

Use `@Js`'s second argument:

```text
delBtn = Button("Delete", Action([
  @Js(`
    const todos = ctx.state.get('todos') || [];
    ctx.state.set('todos', todos.filter(x => x.id !== ctx.args.id));
  `, {id: t.id})
]))
```

The `{id: t.id}` literal is evaluated **at render time, per iteration**, so
each rendered row's button captures its own id. Inside the body, read it as
`ctx.args.id`.

### Filtering / sorting / paginating before iterating

```text
$query = ""
$sortDir = "asc"

visible = @Sort(@Filter($todos, "title", "contains", $query), "title", $sortDir)
list = @Each(visible, "t", row)
```

### Counts and aggregates

```text
total = $todos.length
done  = @Filter($todos, "done", "==", true).length
open  = @Filter($todos, "done", "==", false).length
summary = TextContent(open + " open · " + done + " done · " + total + " total", "small", "muted")
```

Note `$todos.length`, `@Filter(...).length`, and `.first` / `.last` all work
directly — no extra `@Count(...)` wrapper required.

---

## 7. Values, operators, and member access

### Literal types

```text
str      = "double quoted"
str2     = 'single quoted'
multi    = `backtick
spans multiple
lines without escapes`
num      = 42
neg      = -3.14
bool     = true
nothing  = null
arr      = [1, "two", true, null]
obj      = {label: "X", value: 1, nested: {ok: true}}
```

### Operators (in precedence order)

| Group          | Operators                                     |
|----------------|-----------------------------------------------|
| Unary          | `!a`, `-a`                                    |
| Multiplicative | `*`, `/`, `%`                                 |
| Additive       | `+`, `-`                                      |
| Comparison     | `==`, `!=`, `<`, `<=`, `>`, `>=`              |
| Logical        | `&&`, `\|\|`                                  |
| Conditional    | `cond ? a : b` (ternary)                      |

`+` is string-concatenation when either operand is a string, otherwise
numeric. Coerce to string explicitly with `"" + value` when in doubt.

### Member access

`a.b` reaches into objects and does smart things on arrays:

| Target                 | `target.property` semantics                                |
|------------------------|------------------------------------------------------------|
| Object                 | Looks up `property` (or `undefined`).                      |
| Array, special prop    | `.length`, `.first`, `.last` return scalar values.         |
| Array, any other prop  | **Pluck** — returns `target.map(item => item.property)`.   |
| String, `.length`      | Character count.                                           |
| null / undefined       | `undefined`.                                               |

Examples:

```text
$rows = [{title: "A", n: 1}, {title: "B", n: 2}, {title: "C", n: 3}]

titles = $rows.title       # ["A", "B", "C"]
total  = $rows.length      # 3
first  = $rows.first       # {title: "A", n: 1}
nValue = $rows.first.n     # 1
```

### Ternary chains

```text
status = $loading ? "Loading…" : ($error ? "Error" : "Ready")
```

### `&&` / `||` short-circuit

```text
canSave  = $email != "" && $emailError == ""
greeting = $user.name || "Guest"
```

---

## 8. Built-in functions

All are `@`-prefixed and may appear anywhere in an expression.

### Aggregation

| Builtin              | Returns                                                        |
|----------------------|----------------------------------------------------------------|
| `@Count(arr)`        | Length of an array. Same as `arr.length`.                      |
| `@Sum(nums)`         | Sum of numbers. Non-numbers count as 0.                        |
| `@Avg(nums)`         | Average. Empty → 0.                                            |
| `@Min(nums)`         | Minimum. Empty → 0.                                            |
| `@Max(nums)`         | Maximum. Empty → 0.                                            |
| `@First(arr)`        | First element or `null`. Same as `arr.first`.                  |
| `@Last(arr)`         | Last element or `null`. Same as `arr.last`.                    |

### Numeric

| Builtin                     | Returns                          |
|-----------------------------|----------------------------------|
| `@Round(n, decimals?)`      | Half-up rounding.                |
| `@Abs(n)`                   | Absolute value.                  |
| `@Floor(n)`, `@Ceil(n)`     | Floor / ceil.                    |

### Filter / sort

| Builtin                                       | Returns                                                                       |
|-----------------------------------------------|-------------------------------------------------------------------------------|
| `@Filter(arr, "field", "op", value)`          | Subset where `item[field] op value` is true.                                  |
| `@Sort(arr, "field", "asc"\|"desc")`          | Sorted copy. Numbers compared numerically; everything else lexically.         |

Filter operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`
(case-insensitive substring on stringified values).

### Array growth (declarative add)

| Builtin                      | Returns                                            |
|------------------------------|----------------------------------------------------|
| `@Push(arr, value)`          | New array with `value` appended. Non-mutating.     |
| `@Concat(a, b)`              | Concatenated array. Either side may be `null`.     |

These pair perfectly with `@Set`:

```text
addBtn = Button("Add", Action([@Set($todos, @Push($todos, newTodo))]))
prependBtn = Button("Pin", Action([@Set($todos, @Concat([$pinned], $todos))]))
```

### Iteration

`@Each(arr, "varName", template)` — see § 6.

### Action step builtins

Use these only inside `Action([...])`:

| Step                       | Effect                                                       |
|----------------------------|--------------------------------------------------------------|
| `@Run(ref)`                | Run a `Query`/`Mutation` by name.                            |
| `@Set($name, value)`       | Write reactive state.                                        |
| `@Reset($a, $b, ...)`      | Reset reactive state.                                        |
| `@ToAssistant("text")`     | Fire `assistant-message`.                                    |
| `@OpenUrl("url")`          | Open a URL.                                                  |
| `@Js(body, args?)`         | Run JavaScript (requires `enable-javascript`).               |

---

## 9. Component reference (by category)

Signatures below are positional. Optional arguments come last. When a prop
expects an array of a named subcomponent (e.g. `Table` takes `Col[]`), pass
the children as a literal `[...]` array.

### Layout

```text
Stack(children, direction?, gap?, align?, justify?, wrap?)
  direction: "column" (default) | "row"
  gap: "xs" | "s" | "m" (default) | "l" | "xl"
  align: "start" | "center" | "end" | "stretch"
  justify: "start" | "center" | "end" | "between" | "around"
  wrap: boolean

Section(children, title?)
Card(children, variant?)
  variant: "default" | "outlined" | "elevated"
CardHeader(title, subtitle?)
CardBody(children)
CardFooter(children)
Divider(label?)
Separator(orientation?, decorative?)
  orientation: "horizontal" | "vertical"

Tabs(items, defaultValue?)
TabItem(value, label, children)

Accordion(items)
AccordionItem(title, children, open?)

Modal(title, open, children)             # `open` is usually a $variable
Steps(items)
StepsItem(title, details?)
```

### Content

```text
TextContent(value, variant?, color?)
  variant: "small" | "body" | "body-heavy" | "large" | "large-heavy" | "muted"
  color: "default" | "muted" | "primary" | "success" | "warning" | "danger"

Header(title, subtitle?)
Image(src, alt?, caption?)
Link(label, href, external?)
Badge(label, variant?)
Tag(label, icon?, size?, variant?)
  size: "sm" | "md" | "lg"
TagBlock(tags, variant?, size?)         # tags is string[]
Alert(title, message?, variant?)
  variant: "info" | "success" | "warning" | "danger"
Callout(variant?, title, description?, icon?)
CodeBlock(language?, codeString)
Skeleton(lines?, height?)
Markdown(content)                       # **bold**, *italic*, `code`, links
```

### Forms

```text
Button(label, action?, variant?, type?, size?, disabled?)
  variant: "primary" | "secondary" | "ghost" | "danger"
  type: "button" | "submit"
  size: "sm" | "md" | "lg"
Buttons(items, direction?)              # items: Button[]; direction: "row"|"column"

Input(id, placeholder?, type?, validations?, value?)
  type: "text" (default) | "email" | "password" | "number" | "tel" | "url" | "date"

TextArea(id, placeholder?, rows?, value?)
Select(id, items, label?, placeholder?, value?)
SelectItem(value, label)
Checkbox(id, label, value?)
CheckBoxGroup(name, items, value?)
CheckBoxItem(label, name, description?, defaultChecked?)
Radio(id, items, value?)                # items: SelectItem[]
FormControl(label, field, hint?)
Form(id, buttons, fields)               # fields: FormControl[]; buttons: Buttons|Button
```

### Data

```text
Table(columns, caption?)                # columns: Col[]
Col(header, values, format?)
  format: "text" | "number" | "currency" | "date"
  values: typically an array pluck (data.rows.title)

List(items, ordered?)
ListItem(title, description?, icon?)

StatCard(label, value, trend?, delta?)
  trend: "up" | "down" | "flat"
```

### Charts

```text
Series(name, values)                    # values: number[]
BarChart(labels, series, title?)        # series: Series[]
LineChart(labels, series, title?)
PieChart(labels, values, title?)        # parallel arrays
```

### Chat composites

```text
SectionBlock(title, children, description?)
ListBlock(items, ordered?)              # items: string[]
FollowUpBlock(items, title?)            # items: FollowUpItem[] | {label,message}[] | string[]
FollowUpItem(label, message?)
ActionLink(label, action)
```

### Scripting (opt-in)

```text
Script(id, body, deps?)                 # body: string; deps: ("$name")[] | null
```

`Script` renders nothing. Place it at the bottom of `root = Stack([...])`
so the visible UI commits first.

---

## 10. JavaScript layer (deep dive)

Enable with `enable-javascript="true"` on the host element. When off, both
`Script(...)` and `@Js(...)` silently no-op, and the generated system prompt
omits the JS section entirely.

### Two surfaces

| Surface                          | Lifecycle                                                                        | Typical use                                            |
|----------------------------------|----------------------------------------------------------------------------------|--------------------------------------------------------|
| `Script("id", body, deps?)`      | Runs on mount; re-runs when any `$variable` in `deps` changes; cleanup on unmount | Timers, observers, keyboard shortcuts, debounce, fetches |
| `@Js(body, args?)` action step   | Runs once when the action fires (button click, follow-up)                        | Clipboard, focus, one-off mutations, per-item changes  |

### The `ctx` bridge

Every body receives a single `ctx` argument:

```ts
ctx.state.get(name)         // read $name
ctx.state.set(name, value)  // write $name (triggers re-render)
ctx.state.reset(...names)   // back to declared defaults
ctx.state.values()          // snapshot { name: value, ... }

ctx.tools.toolName(args)    // async; await it. args is the same shape Query/Mutation uses.

ctx.args                    // render-time args from @Js(body, args). Always {} for Script.
ctx.dispatch(message)       // fire `assistant-message` event
ctx.open(url)               // open URL via configured opener

ctx.query(id)               // shadowRoot.getElementById
ctx.queryAll(selector)      // shadowRoot.querySelectorAll → array

ctx.host                    // the <llm-response-ui-lang> element
ctx.cleanup(fn)             // register teardown (intervals, listeners, observers)
ctx.signal                  // AbortSignal — fires when the script is about to re-run or unmount
```

### Writing the body string

- **Backticks** (`` `...` ``) — multi-line, real newlines, unescaped double
  quotes. **Use these for anything longer than one line.**
- **Double quotes** (`"..."`) — single-line. Escape `"` as `\"` and newlines
  as `\n`.
- Inside the body, prefer **single quotes** for JS strings so you never need
  to escape:
  ```text
  Script("toast", `setTimeout(() => ctx.state.set('toast', null), 3000);`)
  ```

### `Script` deps semantics

| `deps` value         | Behaviour                                                  |
|----------------------|------------------------------------------------------------|
| Omitted or `null`    | Run once on mount, cleanup on unmount.                     |
| `[]`                 | Run once on mount, cleanup on unmount (no re-runs).        |
| `["foo", "bar"]`     | Re-run whenever `$foo` or `$bar` changes. Cleanup first.   |

### `@Js(body, args?)` — the per-item handler pattern

The single most useful idiom in this library. Use it whenever a button
lives inside `@Each` and needs to know which row it belongs to.

```text
row = Card([
  TextContent(t.text),
  Button("Toggle", Action([
    @Js(`
      const todos = ctx.state.get('todos') || [];
      ctx.state.set('todos', todos.map(x =>
        x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x
      ));
    `, {id: t.id})
  ]))
])
```

`{id: t.id}` is evaluated at render time per iteration. Each rendered button
captures its own row's id. Inside the body, read it as `ctx.args.id`.

### Common patterns

#### Periodic timer

```text
$running = false
$count = 0
ticker = Script("ticker", `
  if (!ctx.state.get('running')) return;
  const id = setInterval(() => ctx.state.set('count', (ctx.state.get('count') ?? 0) + 1), 1000);
  ctx.cleanup(() => clearInterval(id));
`, ["running"])
```

#### Debounce

```text
$draft = ""
$pending = ""
debouncer = Script("debounce", `
  const id = setTimeout(() => ctx.state.set('pending', ctx.state.get('draft')), 250);
  ctx.cleanup(() => clearTimeout(id));
`, ["draft"])
```

#### Cancellable fetch

```text
$query = ""
$results = []
fetcher = Script("fetcher", `
  const q = (ctx.state.get('query') ?? '').trim();
  if (!q) { ctx.state.set('results', []); return; }
  try {
    const r = await ctx.tools.search({ q, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    ctx.state.set('results', r.rows ?? []);
  } catch (e) { if (!ctx.signal.aborted) ctx.state.set('results', []); }
`, ["query"])
```

#### Keyboard shortcut

```text
shortcut = Script("shortcut", `
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      ctx.query('search-input')?.focus();
    }
  };
  window.addEventListener('keydown', onKey);
  ctx.cleanup(() => window.removeEventListener('keydown', onKey));
`)
```

#### Clipboard + toast (one-shot)

```text
copyBtn = Button("Copy", Action([
  @Js("await navigator.clipboard?.writeText(ctx.state.get('snippet') ?? ''); ctx.state.set('toast', 'Copied!');"),
  @Js(`setTimeout(() => ctx.state.set('toast', null), 2000);`)
]))
```

### When NOT to use JS

| Tempting JS                                                       | Use this instead                                                     |
|-------------------------------------------------------------------|----------------------------------------------------------------------|
| `Script("init", "ctx.state.set('todos', [...])")` to seed         | `$todos = [...]`                                                     |
| `@Js("ctx.state.set('todos', todos.concat(newItem))")`             | `@Set($todos, @Push($todos, newItem))`                               |
| `@Js("...filter(t => t.id !== id)...")`                            | `@Set($todos, @Filter($todos, "id", "!=", t.id))`                    |
| `$todos.filter(...)` for display                                  | `@Filter($todos, "done", "==", false)`                               |
| `$todos.length`, `$todos.first`, `$todos.last`                    | They already work as member shortcuts.                               |
| `$todos.map(t => t.title)`                                        | `$todos.title` (array pluck).                                        |
| `@Js("ctx.state.set('open', !ctx.state.get('open'))")`             | `@Set($open, !$open)`                                                |
| Imperative reset of several values                                | `@Reset($a, $b, $c)`                                                 |

---

## 11. Application patterns

### Pattern A — Todo list (the canonical reactive app)

```text
root = Stack([header, composer, list, footer])

$todos = [{id: 1, text: "Welcome — try editing", done: false}]
$draft = ""
$filter = "all"

header = Header("Todos", "Add tasks below")

composer = Stack([
  Input("draft-input", "What needs doing?", "text", null, $draft),
  Button("Add", Action([
    @Set($todos, @Push($todos, {id: $todos.length + 1, text: $draft, done: false})),
    @Reset($draft)
  ]), "primary")
])

visible = $filter == "open" ? @Filter($todos, "done", "==", false) :
          ($filter == "done" ? @Filter($todos, "done", "==", true) : $todos)

list = visible.length == 0
  ? Callout("info", "All clear", "No todos match this filter.")
  : @Each(visible, "t", row)

row = Card([Stack([
  Tag(t.done ? "done" : "open"),
  TextContent(t.text),
  Button("Toggle", Action([
    @Js(`
      const todos = ctx.state.get('todos') || [];
      ctx.state.set('todos', todos.map(x => x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x));
    `, {id: t.id})
  ])),
  Button("Delete", Action([@Set($todos, @Filter($todos, "id", "!=", t.id))]), "ghost")
])])

footer = Stack([
  Buttons([
    Button("All",  Action([@Set($filter, "all")]),  $filter == "all"  ? "primary" : "ghost"),
    Button("Open", Action([@Set($filter, "open")]), $filter == "open" ? "primary" : "ghost"),
    Button("Done", Action([@Set($filter, "done")]), $filter == "done" ? "primary" : "ghost")
  ]),
  TextContent("" + @Filter($todos, "done", "==", false).length + " open · " + $todos.length + " total", "small", "muted")
])
```

**Lessons baked into this pattern**

- Add: declarative via `@Push` + `@Set`.
- Delete: declarative via `@Filter` + `@Set` (no JS).
- Toggle: `@Js(body, {id: t.id})` because no builtin flips one field of one item.
- Filter UI: ternary + `@Filter`.
- Empty state: ternary picks between `Callout` and `@Each`.
- Counts: `.length` and `@Filter(...).length`.

### Pattern B — Analytics dashboard with auto-refresh

```text
root = Stack([header, controls, kpis, chart, breakdown])

$days = "30"
$segment = "all"

header = Header("Analytics", "Live performance metrics")
controls = Stack([
  FormControl("Range",   Select("range",   [SelectItem("7","7d"), SelectItem("30","30d"), SelectItem("90","90d")], null, null, $days)),
  FormControl("Segment", Select("segment", [SelectItem("all","All"), SelectItem("paid","Paid"), SelectItem("organic","Organic")], null, null, $segment))
], "row", "m")

data = Query("analytics_summary",
  {days: $days, segment: $segment},
  {events: 0, revenue: 0, growth: "0%", daily: []},
  60)   // refresh every 60s

kpis = Stack([
  StatCard("Events",  "" + data.events,  data.events_trend),
  StatCard("Revenue", "$" + data.revenue, data.rev_trend, data.rev_delta),
  StatCard("Growth",  data.growth,        "up")
], "row", "m")

chart = LineChart(data.daily.day, [Series("Events", data.daily.events)], "Daily events")

breakdown = Section([
  Table([
    Col("Channel", data.channels.name),
    Col("Visits",  data.channels.visits,  "number"),
    Col("Revenue", data.channels.revenue, "currency")
  ])
], "Channel breakdown")
```

Auto-refresh comes free from the fourth `Query` arg. Changing the dropdowns
re-runs the query because `$days` and `$segment` are dependencies.

### Pattern C — Wizard / multi-step form

```text
root = Stack([progress, stepView, footer])

$step = 1
$name = ""
$email = ""
$plan = "starter"

progress = Steps([
  StepsItem("Account", $step >= 1 ? "✓" : null),
  StepsItem("Profile", $step >= 2 ? "✓" : null),
  StepsItem("Plan",    $step >= 3 ? "✓" : null)
])

stepView = $step == 1 ? accountStep : ($step == 2 ? profileStep : planStep)

accountStep = Card([
  CardHeader("Create your account"),
  FormControl("Email", Input("email", "you@example.com", "email", null, $email)),
  Button("Next", Action([@Set($step, 2)]), "primary", "button", "md", $email == "")
])

profileStep = Card([
  CardHeader("About you"),
  FormControl("Name", Input("name", "Jane Doe", "text", null, $name)),
  Buttons([
    Button("Back", Action([@Set($step, 1)]), "ghost"),
    Button("Next", Action([@Set($step, 3)]), "primary")
  ])
])

planStep = Card([
  CardHeader("Pick a plan"),
  Radio("plan", [SelectItem("starter","Starter"), SelectItem("pro","Pro"), SelectItem("ent","Enterprise")], $plan),
  Buttons([
    Button("Back",   Action([@Set($step, 2)]), "ghost"),
    Button("Finish", Action([@Run(signUpMutation), @ToAssistant("Account created")]), "primary")
  ])
])

signUpMutation = Mutation("sign_up", {name: $name, email: $email, plan: $plan})

footer = TextContent("Step " + $step + " of 3", "small", "muted")
```

### Pattern D — Live search with debounce + cancel

Requires `enable-javascript="true"`.

```text
root = Stack([searchBar, results, busy])

$query = ""
$pending = ""
$results = []
$loading = false

searchBar = FormControl("Search", Input("q", "Type to search…", "text", null, $query))

# Debounce 250 ms.
debouncer = Script("debounce", `
  const id = setTimeout(() => ctx.state.set('pending', ctx.state.get('query')), 250);
  ctx.cleanup(() => clearTimeout(id));
`, ["query"])

# Fetch only after debounce settles; cancel in-flight on each new keystroke.
fetcher = Script("fetcher", `
  const q = (ctx.state.get('pending') ?? '').trim();
  if (!q) { ctx.state.set('results', []); return; }
  ctx.state.set('loading', true);
  try {
    const r = await ctx.tools.search({ q });
    if (ctx.signal.aborted) return;
    ctx.state.set('results', r.rows ?? []);
  } finally {
    if (!ctx.signal.aborted) ctx.state.set('loading', false);
  }
`, ["pending"])

busy = $loading ? Skeleton(3) : null
results = $results.length == 0 && $query != "" && !$loading
  ? Callout("info", "No results", "Try a different term.")
  : @Each($results, "r", resultRow)
resultRow = ListItem(r.title, r.summary)
```

### Pattern E — Settings panel with multiple sections

```text
root = Tabs([
  TabItem("profile",  "Profile",  profileTab),
  TabItem("account",  "Account",  accountTab),
  TabItem("notifs",   "Notifications", notifsTab)
], "profile")

$displayName = "Jane Doe"
$emails = {weekly: true, releases: false, promos: false}

profileTab = Stack([
  FormControl("Display name", Input("display-name", "Your name", "text", null, $displayName)),
  Button("Save", Action([@Run(saveProfile), @ToAssistant("Profile updated.")]), "primary")
])

accountTab = Section([
  Callout("warning", "Sign-in", "Changing your email requires re-verification."),
  Link("Manage subscription", "/billing")
], "Account")

notifsTab = Stack([
  CheckBoxGroup("emails", [
    CheckBoxItem("Weekly digest",        "weekly",   "Sent every Monday morning"),
    CheckBoxItem("Release notes",        "releases", "When a new version ships"),
    CheckBoxItem("Promotional offers",   "promos",   "Occasional discounts and partner deals")
  ], $emails),
  Button("Save preferences", Action([@Run(savePrefs)]))
])

saveProfile = Mutation("update_profile", {displayName: $displayName})
savePrefs   = Mutation("update_notifs", {emails: $emails})
```

### Pattern F — Real-time feed (poll + scroll-to-bottom)

```text
root = Stack([feed, status])

$messages = []

# Poll every 5 s and append new messages.
data = Query("inbox", {since: $lastId}, {rows: [], lastId: ""}, 5)

$lastId = ""

# Whenever new rows arrive, prepend to $messages and remember the latest id.
ingest = Script("ingest", `
  const rows = ctx.state.get('messages') || [];
  const incoming = arguments[0]; /* not used — read from state */
`, ["lastId"])

feed = Section([@Each(data.rows, "m", msgRow)], "Inbox")
msgRow = Card([
  Stack([
    Tag(m.kind, m.kind == "alert" ? "🚨" : "💬"),
    TextContent(m.subject, "body-heavy"),
    TextContent(m.preview, "small", "muted")
  ])
], "outlined")

status = TextContent("Last refreshed: " + data.lastUpdated, "small", "muted")
```

(For real apps, integrate WebSockets via `ctx.host.addEventListener('ws-message', …)` in a `Script` and write the result into `$messages`.)

### Pattern G — Modal confirmation dialog

```text
root = Stack([list, confirmModal])

$confirming = null

list = @Each($items, "x", row)
row = Card([
  TextContent(x.title),
  Button("Delete", Action([@Set($confirming, x)]), "danger")
])

confirmModal = Modal("Delete item?", $confirming != null, [
  TextContent("This permanently removes '" + ($confirming.title ?? "this item") + "'."),
  Buttons([
    Button("Cancel", Action([@Set($confirming, null)]), "ghost"),
    Button("Delete", Action([
      @Set($items, @Filter($items, "id", "!=", $confirming.id)),
      @Set($confirming, null)
    ]), "danger")
  ])
])
```

---

## 12. Common pitfalls and anti-patterns

| Mistake                                                                              | Fix                                                                                                                              |
|--------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| Multi-line `Script` body with `"..."` (real newline breaks the string).              | Use backticks `` `...` `` for multi-line bodies.                                                                                 |
| `ctx.state.get('item').id` inside a loop where `item` is the `@Each` variable.       | `@Each` vars are render-time only. Use `@Js(body, {id: t.id})` → `ctx.args.id`.                                                  |
| `$todos.length \|\| 0` "just in case".                                               | `.length` is always a number. Drop the `\|\| 0`.                                                                                  |
| `filter($todos, "done")` (treating builtins as functions without `@`).               | Builtins are `@`-prefixed: `@Filter($todos, "done", "==", true)`.                                                                 |
| `Script("init", "ctx.state.set('todos', [...])")` to seed initial state.             | `$todos = [...]` — state declarations seed themselves.                                                                            |
| Reusing the same `Script` id for two different scripts.                              | Every `Script(...)` needs a stable, unique id within the response.                                                                |
| Forgetting `ctx.cleanup(...)` for intervals/listeners.                               | Always register cleanup. The script will leak otherwise.                                                                          |
| Stray prose inside `Action([...])` (`Action([@Js(...) Enthusiastic])`).              | Action arrays contain ONLY action steps, comma-separated. No labels, no adverbs.                                                  |
| `Query("tool", {q: "" + $search})` (string interpolation hides the dependency).      | `Query("tool", {q: $search})` — pass the bare `$variable`.                                                                        |
| Mutating `$todos` inside `@Js` via `.push()` (mutates state in place; no re-render). | Always assign a fresh array: `ctx.state.set('todos', [...todos, newItem])`.                                                       |
| Touching `localStorage`, `document.cookie`, custom `fetch(...)` directly.            | Go through tools: `await ctx.tools.save_pref({key, value})`.                                                                      |
| Defining everything inline in `root = Stack([...])` (no streaming).                  | Break into named statements: `root = Stack([header, body, footer])` so each section renders independently as it arrives.          |

---

## 13. Streaming, performance, and ergonomics

### Stream-friendly structure

- One statement per line.
- Bracketed expressions can span lines, but anything else must fit on one line.
- Long arrays (e.g. chart data, table rows) go on their own trailing lines so
  they appear last and never block the shell.
- Avoid trailing commas, dangling operators, or open brackets — they keep the
  chunk un-parseable until the next chunk arrives.

### Avoid re-render storms

- `Query` re-runs only when one of its `$variable` args changes. Don't add
  extra deps "for safety".
- `Script` deps are the same way — list only the variables the body actually
  reads.
- `@Set($x, $x)` (writing the same value) is a no-op and does NOT trigger a
  re-render.

### Big data

- Build `Series` and `Col.values` from a `Query` result, not from inline
  literals; the renderer handles the array efficiently.
- Use `Skeleton` while loading. Avoid showing a blank shell with no
  affordance for "data is coming".

### Showing the source

When debugging, set the `showerrors` attribute to surface parse errors.
Listen to the `error` event for programmatic reporting in production.

---

## 14. Extending the library

Host pages can teach the LLM about new components via `registerComponents`:

```js
el.registerComponents([
  {
    name: "ProductCard",
    description: "Product tile with title, price, and badge.",
    props: [
      { name: "title", type: "string" },
      { name: "price", type: "number" },
      { name: "badge", type: "string", optional: true },
    ],
    render: (_node, props) => {
      const card = document.createElement("article");
      card.className = "product-card";
      card.innerHTML = `
        <h3>${props.title}</h3>
        <p class="price">$${props.price.toFixed(2)}</p>
        ${props.badge ? `<span class="badge">${props.badge}</span>` : ""}
      `;
      return card;
    },
  },
]);
```

After registering, the next `getSystemPrompt()` call includes the new
component, so the LLM can use `ProductCard("Widget", 9.99, "New")` in any
response.

### Tool descriptors

Mirror the host's `setTools` registration in the prompt so the LLM knows
what tools exist:

```js
const prompt = el.getSystemPrompt({
  preamble: "You are a storefront assistant.",
  tools: [
    { name: "list_products", description: "Catalog rows.",       argsExample: { limit: 20 } },
    { name: "place_order",   description: "Create a new order.", kind: "Mutation",
      argsExample: { items: [{ id: "sku_1", qty: 1 }] } },
  ],
  additionalRules: [
    "Always end with a FollowUpBlock of 2 prompts.",
  ],
});
```

---

## 15. Glossary

| Term                | Meaning                                                                                              |
|---------------------|------------------------------------------------------------------------------------------------------|
| Statement           | One line, `name = Expression` or `$name = Literal`.                                                  |
| Identifier          | A bare name (no `$` prefix). Resolved to the most recent binding when read.                          |
| State (`$name`)     | A reactive variable. The only mutable storage. Re-renders dependents on change.                      |
| Query               | An auto-running tool call. Re-runs when any `$variable` arg changes, or every `refreshSec` if set.   |
| Mutation            | An action-triggered tool call. Runs only from `@Run(name)`.                                          |
| Action              | A sequenced list of effects (`Action([@Set, @Run, @ToAssistant, …])`) attached to a control.         |
| Builtin             | `@Name(args)`. Pure function. May appear in any expression.                                          |
| Loop variable       | The middle argument of `@Each($items, "x", template)`. Scoped strictly to `template`.                |
| Action step         | A node inside `Action([...])`. One of `@Set / @Reset / @Run / @ToAssistant / @OpenUrl / @Js`.        |
| `ctx`               | The bridge passed to JS bodies (`Script` and `@Js`). See § 10.                                       |
| `ctx.args`          | Render-time arguments captured by `@Js(body, args)`. Empty for `Script`.                             |

---

## 16. Quick "where do I look?" index

| You want to…                                  | Read…                                            |
|-----------------------------------------------|--------------------------------------------------|
| Pick the right top-level shape                | § 2 "Anatomy of a response"                      |
| Track user input                              | § 3 "Reactive state"                             |
| Call a backend                                | § 4 "Tools: Query and Mutation"                  |
| Wire up a button                              | § 5 "Actions"                                    |
| Render a list                                 | § 6 "Loops & lists"                              |
| Filter / count / sort / aggregate             | § 8 "Built-in functions"                         |
| Find a component signature                    | § 9 "Component reference"                        |
| Add a timer, fetch, focus, keyboard shortcut  | § 10 "JavaScript layer"                          |
| Wire a per-row Delete / Toggle button         | § 10 (Per-item handler pattern)                  |
| Build a complete app                          | § 11 "Application patterns"                      |
| Diagnose a parse error or broken interaction  | § 12 "Common pitfalls"                           |

---

## 17. Self-check before emitting a response

Walk this list before you send your output:

1. Is `root = …` the FIRST line?
2. Is every name referenced from `root` defined somewhere below?
3. Are state declarations literal values (no function calls on the right)?
4. Are `Query` args bare `$variable` references (not interpolations)?
5. Inside `@Each`, are loop-variable reads confined to the template?
6. For per-row buttons, am I using `@Js(body, {id: x.id})` instead of
   `ctx.state.get('x')`?
7. For multi-line `Script` bodies, am I using backticks?
8. Did I register `ctx.cleanup(...)` for every interval / listener /
   subscription / observer?
9. Are all `Script` ids unique within this response?
10. Could any `@Js` be replaced by `@Set` + a builtin (`@Push`, `@Filter`,
    `@Sort`, `@Concat`)?

If you can answer "yes" to all ten, your response is ready.

---

## Further reading

- **Library README:** [`README.md`](./README.md) — install, embed, theme, deploy.
- **Skill summary:** [`SKILL.md`](./SKILL.md) — short "when to use this and how".
- **Component reference:** <https://asfand-dev.github.io/llm-response-ui-lang/components.html>
- **Language reference:** <https://asfand-dev.github.io/llm-response-ui-lang/language.html>
- **JS interactions guide:** <https://asfand-dev.github.io/llm-response-ui-lang/javascript-interactions.html>
- **Live demos:** <https://asfand-dev.github.io/llm-response-ui-lang/examples.html>
- **Generated system prompt:** <https://asfand-dev.github.io/llm-response-ui-lang/dist/system_prompt.txt>
