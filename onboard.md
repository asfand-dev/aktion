# Onboarding tutorial — learn Streaming UI Script by building a tiny app

Welcome. This is a hands-on tour of **Streaming UI Script** — a tiny
declarative language for building rich, reactive UIs that stream straight
from an LLM (or from your own code). By the end of this tutorial you will:

- Understand the four layers of a Streaming UI Script program: **components**,
  **reactive state**, **actions**, and **patterns**.
- Have built a small but real personal task tracker — *FocusFlow* — that
  persists across reloads.
- Know exactly where to go next for routing, queries/mutations, JS interop,
  and theming.

> **Heads up.** Every snippet in this tutorial is meant to be pasted directly
> into the runtime and run. The fastest playground is here:
> <https://asfand-dev.github.io/streaming-ui-script/playground.html>.
> Open it in a second tab and copy snippets across as you go.

If you'd rather see the full language reference, jump to
[`README.md`](./README.md) for integration and the
[`coding-gen-skill.md`](./coding-gen-skill.md) for the deep authoring guide.
This file is the gentle introduction.

---

## What you'll build

The capstone of this tutorial is a small but production-quality personal
planner called **FocusFlow**. It has:

- A page header with the date and a status badge.
- A KPI strip — total tasks, completed, completion percentage.
- A composer (input + priority chip + "Add" button) that pushes new tasks
  into state.
- A list with toggle, delete, and priority-coloured pills, plus filters
  (All / Active / Done).
- A friendly empty state when there's nothing to do.
- A celebration banner when everything is done.
- **State that survives a page reload** — your tasks come back when you
  return.

You'll write the whole thing in well under 60 lines. Let's get there.

---

## Chapter 0 — The 60-second tour

Streaming UI Script is a tiny line-based language. **Every line is one
statement** of the shape:

```text
name = Expression
```

Where `Expression` is a component call, a value, or a reactive `$variable`.
The renderer commits each statement as it arrives, so the UI streams in
top-down.

A complete "Hello, world" looks like this:

```text
root = Card([CardHeader("Hello", "Streaming UI Script is alive."), TextContent("Welcome to the tour.")])
```

Three things to notice:

1. **`root = …` is the entry point.** The runtime renders whatever `root`
   evaluates to.
2. **Components are positional function calls.** `Card([...])` takes children
   as an array; `CardHeader(title, subtitle)` takes a title and an optional
   subtitle.
3. **No HTML, no JSX, no setup code.** One line, one rendered card.

Open the [playground](https://asfand-dev.github.io/streaming-ui-script/playground.html),
paste that line in, and you should see a card appear immediately.

---

## Chapter 1 — Set up your sandbox

You have two choices:

### Option A — Use the public playground (recommended)

Open <https://asfand-dev.github.io/streaming-ui-script/playground.html>.
You get an editor with syntax highlighting, autocomplete, hover docs, and
live preview. Paste any snippet from this tutorial directly into the
editor.

### Option B — Drop it into a local HTML file

Create `index.html` and open it in your browser:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Streaming UI Script — sandbox</title>
    <script type="module" src="https://asfand-dev.github.io/streaming-ui-script/dist/streaming-ui-script.js"></script>
  </head>
  <body style="margin:0;font-family:system-ui">
    <streaming-ui-script theme="light">
      root = Card([CardHeader("Hello"), TextContent("Edit this file to play with the language.")])
    </streaming-ui-script>
  </body>
</html>
```

That's it. **No build step, no framework, no install.** The web component
loads from the CDN and renders its children in a Shadow DOM, so the
runtime's styles never collide with the rest of your page.

Pick whichever option feels easiest. The snippets in the rest of this
tutorial work in both.

---

## Chapter 2 — Hello, world (and one tiny upgrade)

Start with this:

```text
root = TextContent("Hello, world.")
```

You should see plain text. Now wrap it in something nicer:

```text
root = Card([
  CardHeader("Hello", "First Streaming UI Script render"),
  TextContent("This entire UI is one line of code.")
])
```

Notice how components compose. A `Card` takes an array of child nodes; a
`CardHeader` takes a title plus an optional subtitle. The whole call tree
is just data — Streaming UI Script never asks you to write HTML by hand.

> **Try this.** Add a third child to the card: `Badge("New", "primary")`.
> The badge will appear inside the card, below the header.

You now know enough to make the most common mistake (and avoid it):

```text
root = Card(CardHeader("Hi"), TextContent("Bye"))     ✘ Card expects ONE array
root = Card([CardHeader("Hi"), TextContent("Bye")])    ✓ children go in []
```

Whenever a component's signature says "children", pass them as a single
array literal.

---

## Chapter 3 — Components are just function calls

Streaming UI Script ships with **180+ built-in components**, organised
into a handful of families:

- **Layout** — `Stack`, `Grid`, `Card`, `Section`, `Tabs`, `Modal`, …
- **Content** — `TextContent`, `Markdown`, `Icon`, `Quote`, `Badge`, …
- **Forms** — `Input`, `TextArea`, `Select`, `Checkbox`, `Switch`, `Button`, …
- **Data** — `Table`, `List`, `StatCard`, `Progress`, …
- **Charts** — `BarChart`, `LineChart`, `PieChart`, `Gauge`, …
- **Patterns** (the secret sauce) — `PageHeader`, `MetricGrid`, `Hero`,
  `EmptyState`, `KanbanBoard`, `Timeline`, …

You don't have to remember the full list. The browseable catalog with live
previews lives at
<https://asfand-dev.github.io/streaming-ui-script/components.html>.

Let's stack a few of them:

```text
root = Stack([
  CardHeader("Order #1024", "Placed 2 minutes ago"),
  Stack([
    Badge("Paid", "success"),
    Badge("Express shipping", "info"),
    Badge("Gift", "primary")
  ], "row", "s"),
  TextContent("Total: $48.20", "body-heavy")
], "column", "m")
```

What's happening:

- The outer `Stack(children, direction, gap)` lays out everything in a
  column with medium spacing.
- The inner `Stack` is a horizontal row of `Badge`s with small spacing.
- Every component accepts only positional arguments — there is no JSX
  prop syntax to learn.

> **Try this.** Wrap the whole thing in a `Card([...])`. Then change the
> outer Stack's direction to `"row"` and watch the layout reflow.

### The two layout components you'll use most

| You want…                                  | Reach for                         |
|--------------------------------------------|-----------------------------------|
| A column of mixed-height blocks            | `Stack(children)`                 |
| A row of mixed-size things                 | `Stack(children, "row", "m")`     |
| A grid of uniform tiles (cards, KPIs)      | `Grid(children, columns?, gap?)`  |

Don't reach for `Stack(direction="row", wrap=true)` to fake a grid — `Grid`
already auto-fits responsively and keeps tiles equal-width.

---

## Chapter 4 — Make it react: `$variable` state

So far the UI is static. Now meet **reactive state**. Any binding whose
name starts with `$` becomes a reactive variable. Read it like a normal
value; the runtime tracks every place it appears and re-renders the
affected parts whenever it changes.

```text
$count = 0

root = Card([
  CardHeader("Counter", "Click the button to add one."),
  TextContent("Current count: " + $count, "large-heavy"),
  Button("Add one", Action([@Set($count, $count + 1)]), "primary")
])
```

Paste that in. Click "Add one" a few times — the number updates. The whole
UI re-renders every click, but the runtime diffs against the live DOM
(focus, scroll, IME, `<details>.open` — all preserved), so it feels
instant.

The new pieces:

- `$count = 0` declares reactive state. The right-hand side is the
  **initial value** *and* the **reset value**.
- `Action([...])` is a list of action steps that fire when something is
  clicked. `Button(label, action, variant)` takes that action as its
  second argument.
- `@Set($name, value)` writes `value` back into `$name` at click time.
  Because `$count` is reactive, every line that reads `$count` re-evaluates.

> **Try this.** Add a second button labelled "Reset" wired to
> `Action([@Reset($count)])`. Click it — the counter goes back to `0`,
> which is the initial value you declared.

### The full action menu

You'll meet most of these throughout this tutorial:

| Step                          | Effect                                        |
|-------------------------------|-----------------------------------------------|
| `@Set($name, value)`          | Write `$name = value` (evaluated at click).   |
| `@Reset($a, $b, …)`           | Reset each state to its declared default.    |
| `@ToAssistant("text")`        | Send a message back to the chat assistant.   |
| `@OpenUrl("https://…")`       | Open a URL in a new tab (sanitised).         |
| `@Navigate("/path")`          | Push a new hash route (we'll cover routing). |
| `@Run(ref)`                   | Run a `Query` or `Mutation` (advanced).      |
| `@Js(body, args?)`            | Drop into JavaScript (we'll touch this).     |

You can chain them — they run in order and `@Run` is `await`ed before the
next step:

```text
saveBtn = Button("Save & dismiss", Action([
  @Run(saveMutation),
  @Set($confirming, false),
  @ToAssistant("Saved.")
]), "primary")
```

---

## Chapter 5 — Forms talk back (two-way binding)

`Input`, `Select`, `Checkbox`, `Switch`, `Radio`, and `TextArea` all
**two-way bind** when you hand them a `$variable` as their value prop:

```text
$name = ""

greeting = $name == "" ? Callout("info", "Waiting for a name…") : TextContent("Hi there, " + $name + "!", "large-heavy")

root = Stack([
  CardHeader("Hello", "Type your name and watch it appear below."),
  Input("name-input", "Your name", "text", null, $name),
  greeting
])
```

Type into the input — the greeting updates in real time, and the
`Callout` disappears as soon as you type a character. Three things to
notice:

1. The `Input` signature is
   `Input(id, placeholder?, type?, validations?, value?)`. Pass `$name` as
   the value to bind it.
2. The ternary in `greeting` picks between two branches based on a
   reactive expression. The runtime re-evaluates it whenever `$name`
   changes.
3. Strings concatenate with `+`. If either side is a string, the other is
   coerced. For multi-line strings with interpolation, use backticks:
   `` `Hi ${$name}!` ``.

> **Watch out — ternaries are single-line.** The `?` and `:` must stay on
> the same line as the expression they belong to. To split a long branch
> across lines, extract it into its own named binding (like `greeting`
> above), or reach for `@If` / `@Switch` from chapter 8 instead.

> **Try this.** Replace the input with `TextArea("note", "Tell me more", 4, $name)`
> and add a button:
> `Button("Clear", Action([@Reset($name)]), "ghost")`. The button restores
> the empty string you declared as the initial value.

### Backtick strings are nicer for templates

Anywhere you'd write `"Hi " + $user.name + ", you have " + $count + " tabs"`,
prefer:

```text
greeting = `Hi ${$user.name}, you have ${$count} tabs`
```

Backticks support `${expression}` interpolation when at least one
`${...}` block is present, and they span multiple lines without escapes.

---

## Chapter 6 — Lists with `@Each`

Most apps render lists. `@Each(items, "varName", template)` is the loop:

```text
$todos = [
  {id: 1, text: "Write the onboarding doc", done: true},
  {id: 2, text: "Take a walk", done: false},
  {id: 3, text: "Brew coffee", done: false}
]

list = @Each($todos, "t", row)

row = Card([Stack([
  Badge(t.done ? "Done" : "Open", t.done ? "success" : "neutral", null, "sm"),
  TextContent(t.text, t.done ? "muted" : "body")
], "row", "m", "center")])

root = Stack([CardHeader("Today"), list], "column", "m")
```

Key idea: `t` is a **loop variable**, scoped strictly to the template
expression and anything it references by name. The binding `row =
Card(...)` re-evaluates per iteration with `t` in scope, so each rendered
card sees its own todo.

> **Try this.** Add another card after the list showing `$todos.length`
> total tasks. Hint: bare `.length`, `.first`, and `.last` work on any
> array shortcut without an `@Count(...)` wrapper.

### Destructuring loop variables

When your rows have a stable shape, destructure inline for cleaner code:

```text
list = @Each($users, "{id, name, role}", row)
row  = Card([TextContent(name, "body-heavy"), TextContent(role, "small", "muted")])
```

`{id, name, role}` binds those fields directly inside `row`. If you also
need the raw row, use `"row, {id, name}"` to bind both at once.

---

## Chapter 7 — `@`-builtins: do more with less code

`@`-prefixed builtins are pure helpers you can use anywhere an expression
is allowed. There are 40+ of them, but the ones you'll lean on every day
fall into three groups:

### Filter / sort / pluck

```text
$todos = [{title: "Buy milk", done: true}, {title: "Call mum", done: false}]

open    = @Filter($todos, "done", "==", false)        # subset where done is false
done    = @Filter($todos, "done", "==", true)
sorted  = @Sort($todos, "title", "asc")               # sort by field
titles  = $todos.title                                # pluck — same as @Map($todos, "title")
total   = $todos.length
```

Supported filter operators: `==`, `!=`, `>`, `>=`, `<`, `<=`, and
`contains` (case-insensitive substring on stringified values).

### Add / remove without writing JS

```text
addBtn = Button("Add", Action([
  @Set($todos, @Push($todos, {id: $todos.length + 1, title: "New", done: false}))
]))

clearDoneBtn = Button("Clear done", Action([
  @Set($todos, @Filter($todos, "done", "==", false))
]))
```

`@Push(arr, value)` returns a new array with `value` appended (it never
mutates), and pairs perfectly with `@Set`. `@Filter(arr, field, op, value)`
returns a new array — drop it into `@Set` to "remove" items declaratively.

### Format numbers, dates, and counts

```text
price   = @FormatCurrency(48.2, "USD")        # "$48.20"
percent = @Format(0.873, "percent")           # "87%"
ago     = @FormatDate(@Now(), "relative")     # "just now" / "5m ago" / …
label   = @Plural($todos.length, "task")      # "1 task" / "3 tasks"
```

You can mix and match freely — every builtin is a pure function of its
arguments, so you can chain them: `@FormatCurrency(@Sum($invoices.amount))`.

> **Try this.** Combine what you've learned: render only the *open* todos
> from chapter 6, sorted by title.
>
> ```text
> visible = @Sort(@Filter($todos, "done", "==", false), "title", "asc")
> list = @Each(visible, "t", row)
> ```

---

## Chapter 8 — Branching: `@If` and `@Switch`

Ternaries (`cond ? a : b`) are great for inline checks, but two- and
three-way branches read more clearly with `@If` and `@Switch`. Both are
**lazy** — only the matched branch is evaluated, which keeps loop
variables in scope from leaking into branches that aren't being rendered.

```text
$mode = "loading"

body = @Switch($mode, {
  loading: LoadingState("Hang on…"),
  error:   ErrorState("Something went wrong", "Please retry."),
  empty:   EmptyState("Nothing here yet", "Add your first item below."),
  ready:   Card([CardHeader("Your dashboard"), TextContent("All good.")])
}, LoadingState())
```

`@Switch(value, branches, default?)` stringifies `value` and renders the
matching property (or the `default` argument when none matches).

`@If(cond, trueBranch, falseBranch?)` is the lazy two-branch sibling:

```text
banner = @If($todos.length == 0,
  Callout("info", "All clear", "Add your first task to get started."),
  null
)
```

`null` is fine as a branch — the renderer simply skips it.

---

## Chapter 9 — Rich patterns: a section per line

Here's the single most important trick in Streaming UI Script: instead of
hand-rolling sections out of `Stack` + `Card` + `TextContent`, reach for
the high-level **pattern** components. They commit a whole visual section
in one line and look polished out of the box.

| You want…                                | Use this one-liner                                                |
|-----------------------------------------|--------------------------------------------------------------------|
| Page title + breadcrumbs + actions      | `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)`   |
| KPI strip                               | `MetricGrid([StatCard(...), ...])`                                |
| Empty list                              | `EmptyState(title, description?, icon?, action?)`                 |
| Activity feed                           | `Timeline([TimelineItem(title, time?, description?, icon?, tone?)])` |
| Kanban board                            | `KanbanBoard([KanbanColumn(title, [KanbanCard(...)])])`           |
| Marketing hero                          | `Hero(title, subtitle?, primary?, secondary?, eyebrow?)`          |
| Pricing tiers                           | `PricingTable([PricingCard(plan, price, period?, …), …])`         |
| Inline banner                           | `Banner(title, message?, action?, icon?, tone?)`                  |

Compare these two ways of rendering a "no items" screen:

**Don't:**

```text
root = Card([
  CardHeader("No items"),
  TextContent("Add one below.", "small", "muted"),
  Button("Add", Action([@Set($adding, true)]), "primary")
])
```

**Do:**

```text
root = EmptyState("No items", "Add your first one below.", "inbox",
  Button("Add", Action([@Set($adding, true)]), "primary"))
```

`EmptyState` auto-picks an icon from the title when you omit it, centers
everything, applies muted typography for the description, and pairs the
CTA with the right spacing — all for free.

> **Try this.** Replace the counter from chapter 4 with a `MetricGrid`:
>
> ```text
> kpis = MetricGrid([
>   StatCard("Tasks",     "" + $count,      "up"),
>   StatCard("Streak",    "5 days",         "up", "+1"),
>   StatCard("Focus",     "2h 18m",         "flat")
> ])
> ```
> Add it to your root and you've turned a one-button counter into a
> dashboard-ready stat strip.

---

## Chapter 10 — State that survives a refresh: `$$variable`

Real apps remember things. A todo list that empties itself every time
you reload feels broken. Streaming UI Script gives you persistent state
out of the box — just declare it with a **double-dollar sigil**:

```text
$$theme       = "dark"
$$sidebarOpen = true
$$cart        = []
```

Everything else is identical to `$variables`: read with `$$theme`, write
with `@Set($$theme, "neon")`, reset with `@Reset($$theme)`. The runtime
persists every change to `localStorage` (keyed per element id, so two
embedded instances never collide).

A real-world use: remember the active filter chip across reloads.

```text
$$filter = "all"

filters = Buttons([
  Button("All",    Action([@Set($$filter, "all")]),    $$filter == "all"    ? "primary" : "ghost"),
  Button("Active", Action([@Set($$filter, "active")]), $$filter == "active" ? "primary" : "ghost"),
  Button("Done",   Action([@Set($$filter, "done")]),   $$filter == "done"   ? "primary" : "ghost")
])
```

Click "Done", reload the page, the "Done" pill is still highlighted.

---

## Chapter 11 — The capstone: build FocusFlow

Time to put it all together. FocusFlow is a personal daily planner that
uses every concept we've covered: state, two-way binding, lists, filters,
builtins, patterns, branching, and persistence.

Paste the entire program into the playground and play with it. Then
we'll walk through it.

```text
# --- State (persists across reloads) -----------------------------------
$$tasks  = []
$$filter = "all"
$draft     = ""
$priority  = "medium"

# --- Derived values ----------------------------------------------------
done    = @Filter($$tasks, "done", "==", true)
open    = @Filter($$tasks, "done", "==", false)
visible = @Switch($$filter, {open: open, done: done, all: $$tasks}, $$tasks)

allDone = $$tasks.length > 0 && open.length == 0
percent = $$tasks.length == 0 ? 0 : @Round(done.length * 100 / $$tasks.length)

# --- UI shell ----------------------------------------------------------
root = Stack([header, banner, kpis, composer, filters, body], "column", "l")

header = PageHeader(
  "FocusFlow",
  `Today, ${@FormatDate(@Now(), "MMM D")} — let's get it done.`,
  null,
  null,
  Badge(allDone ? "All clear" : @Plural(open.length, "task left"), allDone ? "success" : "primary", null, "sm")
)

banner = @If(allDone,
  Banner("Nice work.", "Every task on your list is done. Take a break.",
    Button("Reset day", Action([@Reset($$tasks)]), "ghost"),
    "trophy", "success"),
  null
)

kpis = MetricGrid([
  StatCard("Total",     "" + $$tasks.length, "flat",  null, "list-check"),
  StatCard("Completed", "" + done.length,    "up",    null, "circle-check"),
  StatCard("Progress",  percent + "%",       allDone ? "up" : "flat", null, "gauge-high")
])

# --- Composer ----------------------------------------------------------
composer = Card([
  CardHeader("New task", "Pick a priority and add it to your day."),
  Stack([
    Input("draft", "What needs doing?", "text", null, $draft),
    ToggleGroup("priority", [
      {value: "low",    label: "Low",    icon: "leaf"},
      {value: "medium", label: "Medium", icon: "circle-half-stroke"},
      {value: "high",   label: "High",   icon: "fire"}
    ], $priority),
    Buttons([
      Button("Add task", Action([
        @Set($$tasks, @Push($$tasks, {
          id:       $$tasks.length + 1,
          text:     $draft,
          priority: $priority,
          done:     false
        })),
        @Reset($draft)
      ]), "primary"),
      Button("Clear", Action([@Reset($draft)]), "ghost")
    ])
  ], "column", "m")
])

# --- Filters -----------------------------------------------------------
filters = Buttons([
  Button("All",      Action([@Set($$filter, "all")]),  $$filter == "all"  ? "primary" : "ghost"),
  Button("Active",   Action([@Set($$filter, "open")]), $$filter == "open" ? "primary" : "ghost"),
  Button("Done",     Action([@Set($$filter, "done")]), $$filter == "done" ? "primary" : "ghost"),
  Button("Clear done", Action([@Set($$tasks, open)]),  "ghost")
])

# --- Body: list OR empty state ----------------------------------------
emptyTitle = @Switch($$filter, {
  done: "Nothing finished yet",
  open: "All tasks done — well done."
}, "No tasks yet")

emptyView = EmptyState(emptyTitle, "Add your first task above to get started.", "clipboard-list")
listView  = Card([@Each(visible, "t", row)])

body = @If(visible.length == 0, emptyView, listView)

row = Stack([
  Badge(t.priority, t.priority == "high" ? "danger" : t.priority == "medium" ? "warning" : "success", null, "sm"),
  TextContent(t.text, t.done ? "muted" : "body"),
  Spacer(null, true),
  Button(t.done ? "Undo" : "Done",
    Action([@Js(`
      const tasks = ctx.state.get('tasks') || [];
      ctx.state.set('tasks', tasks.map(x =>
        x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x
      ));
    `, {id: t.id})]),
    t.done ? "ghost" : "primary"),
  Button("Delete",
    Action([@Set($$tasks, @Filter($$tasks, "id", "!=", t.id))]),
    "ghost")
], "row", "s", "center")
```

That's the entire app. Reload your page — the tasks (and filter) come
back. Mark them all done — the celebration banner appears.

### Anatomy: how each chapter shows up

Let's tour the program with the chapters in mind.

| Section                      | Concept from this tutorial                                              |
|------------------------------|--------------------------------------------------------------------------|
| `$$tasks`, `$$filter`        | Chapter 10 — persistent state                                            |
| `$draft`, `$priority`        | Chapter 4 — reactive state, with two-way binding from chapter 5          |
| `done`, `open`, `visible`    | Chapter 7 — `@Filter` as derived values                                  |
| `allDone`, `percent`         | Plain expressions on state — no helpers needed                           |
| `root = Stack([...])`        | Chapter 2 — composition; chapter 9 — high-level layout                   |
| `PageHeader`, `MetricGrid`, `Banner`, `EmptyState` | Chapter 9 — patterns: one line per section            |
| `@If(allDone, ..., null)`    | Chapter 8 — lazy conditional branches                                    |
| `Input`, `ToggleGroup`       | Chapter 5 — two-way binding via the trailing value prop                  |
| `Action([@Set, @Reset])`     | Chapter 4 — chained action steps                                         |
| `@Push`, `@Filter`           | Chapter 7 — declarative add/remove                                       |
| `@Each(visible, "t", row)`   | Chapter 6 — loops with template references                               |

> **About the `@Js` block in the toggle button.** "Flipping one field on
> one item" is the one common operation that has no declarative shortcut —
> there's no `@Update` builtin. Streaming UI Script's answer is to drop
> into one line of JavaScript via `@Js(body, args?)`. The optional `args`
> object is evaluated at render time per iteration (here, `{id: t.id}`),
> so each rendered button captures its own row's id and reads it back as
> `ctx.args.id`. Inside JS, state names are **bare** (`'tasks'`, not
> `'$tasks'`) — the `$` / `$$` sigils are language syntax, not part of
> the actual variable name. You'll see this pattern again in chapter 12.

### Make it yours

Try these small extensions:

1. **Sort by priority.** Replace `visible` with
   `@Sort(visible, "priority", "asc")`.
2. **Show the most-recently added task in a `Banner`.** Use `$$tasks.last`
   plus an `@If` to render a "Just added: …" line above the composer.
3. **Add a sparkline.** Track completions per day in a `$$completionLog`
   array and feed it to `StatCard(..., spark=[3, 5, 4, 7, …])`.
4. **Theme it.** Add `theme="neon"` to your `<streaming-ui-script>` tag —
   the entire app re-renders with the cyberpunk palette. No code change.

---

## Chapter 12 — Where to go next

You've covered enough of Streaming UI Script to build real UIs. Here's
where to head when you need more power.

### JavaScript when you need to escape the declarative box

`Script(id, body, deps?)` and `@Js(body, args?)` give you a real
JavaScript runtime when the change you need can't be expressed as a pure
data transformation (timers, fetches you control, focus, clipboard,
keyboard shortcuts, animation).

```text
$count = 0
$running = false

ticker = Script("ticker", `
  if (!ctx.state.get('running')) return;
  const id = setInterval(() => ctx.state.set('count', (ctx.state.get('count') ?? 0) + 1), 1000);
  ctx.cleanup(() => clearInterval(id));
`, ["running"])
```

The `Script` is a behaviour-only node; place it at the bottom of `root` so
the visible UI commits first. Deep dive:
[`coding-gen-skill.md § 10`](./coding-gen-skill.md#10-javascript-layer-deep-dive)
or the [live guide](https://asfand-dev.github.io/streaming-ui-script/javascript-interactions.html).

### Multi-page apps with `Routes`

Hash-based routing is wired into the runtime — no opt-in attribute:

```text
root = Stack([nav, main])

nav = Stack([
  NavLink("Home",     "/",         "ghost", true),
  NavLink("Inbox",    "/inbox",    "ghost"),
  NavLink("Settings", "/settings", "ghost")
], "row", "s")

main = Routes([
  Route("/",         homePage),
  Route("/inbox",    inboxPage),
  Route("/settings", settingsPage),
  Route("*",         notFoundPage)
], "/")

inboxPage     = Card([CardHeader("Inbox")])
settingsPage  = Card([CardHeader("Settings")])
homePage      = Card([CardHeader("Welcome")])
notFoundPage  = Callout("warning", "Not found", "We couldn't find " + $route + ".")
```

`@Navigate("/inbox")` inside any action step pushes a new path. Route
parameters (`/users/:id`) land in `params.id` inside the matched
`Route`. Deep dive:
[`coding-gen-skill.md § 10.5`](./coding-gen-skill.md#105-routing-layer-multi-page-uis)
or the [live demo](https://asfand-dev.github.io/streaming-ui-script/routing-demo.html).

### Talking to your backend: `Query` and `Mutation`

When you have a real API, register tools once on the host and use them
declaratively from inside the program.

```js
// On the host page:
el.setTools({
  list_orders:  async ({ limit })       => fetch(`/api/orders?limit=${limit}`).then(r => r.json()),
  update_order: async ({ id, status })  => fetch(`/api/orders/${id}`,
    { method: "PATCH", body: JSON.stringify({ status }) }).then(r => r.json()),
});
```

```text
$status = "open"

orders = Query("list_orders", {limit: 10, status: $status}, {rows: [], total: 0}, 30)

saveOrder = Mutation("update_order", {id: $current.id, status: "shipped"})

root = Stack([
  PageHeader("Orders"),
  Toolbar([FormControl("Status", Select("status", [
    SelectItem("open", "Open"),
    SelectItem("shipped", "Shipped")
  ], null, null, $status))], []),
  Table([
    Col("Order", orders.rows.title),
    Col("Total", orders.rows.amount, "currency")
  ])
])
```

`Query` re-runs automatically when any `$variable` in its arguments
changes — and every 30 seconds in the snippet above, thanks to the
fourth argument. `Mutation` runs only when you `@Run` it inside an
action.

### Theming

Pick one of the seven built-in themes (`light`, `dark`, `neon`, `pastel`,
`glass`, `brutalist`, `skyline`) with the `theme` attribute, or send a
brand token map straight from inside the program:

```text
theme = Theme({
  colorPrimary:      "#0969da",
  fontFamilyHeading: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radiusButton:      "6px",
  buttonFontWeight:  "500"
})

root = Stack([CardHeader("GitHub-style page"), Buttons([Button("New repository", null, "primary")])])
```

Live brand recipes (GitHub / Apple / Stripe / IONOS / Notion / Vercel)
ship in the
[brand themes example](https://asfand-dev.github.io/streaming-ui-script/brand-themes.html).

---

## Cheat sheet — the 12 things you'll actually use

Print this on a sticky note. It covers ~80% of the programs you'll write.

| Need to…                                | Snippet                                                                       |
|-----------------------------------------|--------------------------------------------------------------------------------|
| Render anything                         | `root = SomeComponent(...)`                                                    |
| Compose children                        | `Stack([a, b, c], "row", "m")` or `Grid([…], 3, "l")`                          |
| Declare reactive state                  | `$count = 0`                                                                   |
| Persist across reloads                  | `$$theme = "dark"`                                                             |
| Two-way bind a form field               | `Input("q", "Search…", "text", null, $query)`                                  |
| Write state on click                    | `Button("+", Action([@Set($count, $count + 1)]))`                              |
| Reset back to declared default          | `@Reset($a, $b)`                                                               |
| Loop a list                             | `@Each($items, "x", template)`                                                 |
| Filter / sort                           | `@Filter($rows, "field", "op", value)` · `@Sort($rows, "field", "asc")`        |
| Add / remove without JS                 | `@Set($rows, @Push($rows, item))` · `@Set($rows, @Filter($rows, "id", "!=", id))` |
| Conditional branch                      | `@If(cond, yes, no?)` · `@Switch(value, {key: branch, ...}, default?)`         |
| Polished section in one line            | `PageHeader(...)` · `MetricGrid([...])` · `EmptyState(...)` · `Banner(...)`    |

---

## Where to look next

- [`README.md`](./README.md) — integration: drop-in install, public API
  (attributes / methods / events), tool registration, build/test recipes.
- [`coding-gen-skill.md`](./coding-gen-skill.md) — the deep authoring
  knowledge base. Read this when you want to ship a full application.
- [Components catalog](https://asfand-dev.github.io/streaming-ui-script/components.html) — every built-in with a live preview and prop table.
- [Live examples](https://asfand-dev.github.io/streaming-ui-script/live-examples.html) — production-quality demos (dashboard, inbox, checkout, calendar, file manager, status page, expense tracker, …) — open any one to study the source.
- [Playground](https://asfand-dev.github.io/streaming-ui-script/playground.html) — autocomplete, hover docs, share via URL.

Have fun building. The fastest way to get good at Streaming UI Script is
to open the playground and start typing.
