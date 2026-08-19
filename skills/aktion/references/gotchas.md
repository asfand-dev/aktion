# Gotchas — what the validator cannot catch

Every entry here shares one property: **`getDiagnostics` passes it.** The program
validates, then behaves differently from how it reads. These are the highest-value
items in the skill, because a linter can never replace them.

Read this before declaring a program finished.

---

## Argument forms

### `Button("Save", "primary")` does not set the variant

Pick **one** argument form per call and stick to it:

- **Canonical** — one positional plus a trailing options object:
  `Button("Save", { variant: "primary" })`
- **All-positional** — arguments bind to the signature's props in listed order:
  `StatCard("Revenue", "$48k", "up")`
- **All-named** — a single object naming every prop:
  `Button({ label: "Save", variant: "primary" })`

Never split one object between roles. And note the trap: in
`Button("Save", "primary")`, `"primary"` binds to the **second positional slot**,
not to `variant`. Whenever the props you want are not adjacent in the signature,
use the trailing object.

Some components accept a **leading** props object when children are the trailing
positional — `Grid({ columns: 12 }, [Card1(), Card2()])`. Both route through the
same slot mapping.

### A trailing object with no matching key becomes an opaque bag

For **your own** components, if a trailing object's keys match none of the
parameters, it is forwarded positionally rather than destructured. That is what
makes a "slots" bag work — and also what makes a typo'd prop name silently arrive
as a positional argument instead of raising an error.

### Named slots

Once positional parameters are filled, extra named props become **both** a `slots`
object and direct bindings:

```aktion
function Panel(children, header, footer) {
  return Card([header, children, footer])
}

$app(Column([
  Panel(Text("Body"), SectionHeader("Title"), Text("Footnote")),
]))
```

---

## Reactivity

### Not everything is path-tracked

Fine-grained, path-level tracking applies **only to top-level `$name = value`
atoms**. These all trigger a **full re-render** (every component body
re-executes; the morph reconciler still patches only changed DOM):

- hook setters — `$state`, `$memo`, `$ref`, `$reducer`
- `$http` / `$query` / `$mutation` lifecycle changes
- `setTimeout` / `setInterval` ticks
- `$effect` writes
- `$emit`

Prefer plain `$name` atoms for hot-path state. Reach for hooks when you need
per-instance isolation and can accept the cost.

### Effect dependency arrays accept only atoms and string tokens

`$effect(fn, [deps])` dependencies may be **`$`-atoms** or the string tokens
`"mount"`, `"unmount"`, `"every(N)"`, `"debounce(N)"`, `"throttle(N)"`. Anything
else is a **parse error** — including the `route` handle, which is the mistake
that looks most reasonable:

```js
// ✗ parse error: `route` is not a valid dependency
$effect(() => { $emit("track", { path: route.path }) }, [route.path])
```

Track a URL change through the reactive `$util.url` surface instead:

```aktion
$app(Column([PageHeader("Analytics")]))

$effect(() => { $emit("track", { path: $util.url.path }) }, [$util.url.path])
```

### Per-instance state is per call site

A `$name = value` declared inside a component body is private to that instance —
two call sites get two independent atoms. A `$name` at the top level is shared by
everything that reads it.

---

## Components

### Case does not mark a component

A function declaration is **both** a component and an action; whether it renders
depends on whether it returns a tree and where it is called. `function myCard(t) {
return Card([Text(t)]) }` renders fine. PascalCase / camelCase is a readability
convention only.

### No `return` renders nothing

A component whose body falls through renders nothing — silently. If a component
mysteriously produces no output, check for a missing `return` first.

### Shadowing a built-in name extends it

Inside its own body, a component's name still refers to the **built-in**, so this
wraps rather than recurses:

```aktion
function Badge(label) { return Badge(label, { variant: "success" }) }

$app(Column([Badge("Shipped"), Badge("Paid")]))
```

### Component-local helpers do not leak

A `function` declared inside another component's body is scoped to it.

### The legacy root binding still parses

`aktion = Column([...])` is the pre-0.5 root form. The parser tolerates it, so the
validator will **not** flag it — but the UI root is `$app(...)`, and there must be
exactly **one** `$app(...)` per program.

### `$head` must be reached during rendering

Call `$head({...})` inside a component body, not as a dangling top-level
statement, or it never runs.

---

## Test ids (`testId`)

### `testId` marks the component ROOT, not necessarily the control

`testId` (alias `testid`) renders `data-testid` on whatever a component returns as its
outermost node. For a labelled form field that is the `.rui-field` wrapper `withFieldShell`
builds, not the control inside it: an `Input` with none of `label`/`hint`/`error`/`required`
returns the bare control as its own root, but supplying any one of those props swaps the root
for the wrapper (`src/library/components/forms-shared.ts`). Reach the control itself with a
scoped query:

```js
within(getByTestId("email")).getByRole("textbox")
```

### `Portal` drops it

`Portal`'s render function (`src/library/components/helpers.ts`) returns an anchor —
`el("span", { class: "rui-portal-anchor", ... })` — that stays connected where you wrote it,
while the actual children live in a different element, `entry.container`
(`class="rui-portal"`), mounted after paint into the `target` you named, or into the portal
layer when no target resolves. Universal props passed to `Portal(...)` itself — `testId`,
`sx`, `id`, everything — land on the anchor, not on the portalled content. Put `testId` on the
child component being portalled instead of on `Portal`.

### A user-declared component silently drops the whole universal channel

`UserComponentNode` (`src/runtime/evaluator.ts`) has no `universal` field — only the library's
`ComponentNode` does, and only a `ComponentNode` reaches `applyUniversal`. A `testId` handed
to one of your own components is therefore just another argument, and nothing renders it. It
does not even reliably become a *named* one: a trailing object whose keys match no parameter
is forwarded **positionally** instead (see "A trailing object with no matching key becomes an
opaque bag" above), so `MyCard({ testId: "x" })` binds the whole object to the first parameter.

Forward it explicitly onto a library component inside the body, and call the component with
its positional arguments first:

```js
function MyCard(title, { testId }) {
  return Card([Text(title)], { testId })
}

MyCard("Weekly report", { testId: "weekly-card" })
```

You do not have to declare the parameter — once the positional parameters are filled, an
extra named prop is also bound as a plain local — but declaring it documents the contract.

### A reparented floating panel breaks a scoped `within()` query

Where the `popover` API is unavailable — including headless test DOMs — `openFloating`
(`src/library/floating.ts`) reparents a promoted panel (dropdown, popover, tooltip, `Combobox`
list) out of its original subtree into a shared `.rui-layer` node. Not specific to `testId`:
once a panel has moved, any universal attribute on an ancestor — `testId`, `id`, `className` —
no longer scopes to it via `within(ancestor)`. Query the open panel directly instead.

---

## JavaScript semantics

### `await` never suspends — the value is the promise

`await` is accepted so JavaScript-shaped source still parses, but bodies run
synchronously and nothing unwraps the thenable. `await expr` yields `expr`
**unchanged**, so an awaited value is a `Promise` — and a `Promise` is always
truthy:

```js
// WRONG — the toast fires even when the clipboard write failed
function copy(value) {
  const copied = await $util.copy(value)
  if (copied) { $toast.success("Copied") }
}

// RIGHT
function copy(value) {
  $util.copy(value).then(ok => { if (ok) { $toast.success("Copied") } })
}
```

For a data builtin, use the bag's own callback instead — `$result.onDone = () => …`.

This one **is** linted, as a warning, whenever the awaited value is consumed
(bound, tested, or passed as an argument). A bare `await f()` statement whose
result is discarded is not flagged.

### Equality and comparison match JavaScript

- `==` / `!=` use abstract equality, so `x == null` matches `null` **and**
  `undefined`. `===` / `!==` stay strict.
- Relational `<` / `>` compare alphabetic strings lexicographically, so
  `arr.sort((a, b) => a.name > b.name ? 1 : -1)` orders correctly.
- `Date` operands coerce via `valueOf`.
- Two numeric strings still compare numerically: `"5" < "10"`.

### Statements cannot be values

The parser rejects these; each has a clean replacement:

| Rejected | Replace with |
| --- | --- |
| `x = if (cond) { a } else { b }` | `x = cond ? a : b` |
| `x = for (let r of rows) { Row(r) }` | `x = rows.map(r => Row(r))` |
| `x = switch (v) { case "a": A }` | a ternary chain, a lookup object, or `function pick(v) { switch (v) { … } }` then `x = pick(v)` |

### Line continuations

A statement continues onto the next line after: `.` `?.` `?` `:` `&&` `||` `??`
`==` `!=` `===` `!==` `<` `>` `<=` `>=` `instanceof` `in` `+` `-` `*` `/` `%` `**`
and the bitwise/shift operators.

**A `(` or `[` at the start of a line does not continue the previous statement** —
same as JavaScript. Break after the operator, not before the bracket.

---

## Components with surprising defaults

These auto-pick their most likely value, so the minimal call already looks rich.
Don't fight them, and don't pass what they already infer:

- `StatCard("Revenue", { value: "…" })` picks an icon from the label
  (`"Revenue"` → `sack-dollar`, `"Customers"` → `users`).
- `PageHeader(title)` derives `["Home", title]` breadcrumbs. Pass
  `breadcrumbs: false` to suppress, or an array to override.
- `Banner(title, { tone: "success" })` picks an icon from the tone.
- `Hero(title, { subtitle })` derives an eyebrow from intent keywords.
- `EmptyState(title)` picks an icon from the title.
- `Avatar(name)` falls back to a deterministic DiceBear illustration;
  `fallback: "initials"` reverts to the two-letter pill.
- `LineChart({ data: [...] })` accepts row-shaped shorthand — labels and series
  are derived.
- `Toolbar({ searchable: true })` auto-mounts a `SearchBar`.
- `$toast.*` renders its own stacked layer. You do **not** need a `Toasts(...)` in
  the tree; adding one that reads `$toast.items` opts out of the auto-layer.
- `Image(src, { ratio: "16:9" })` self-constrains — no outer `AspectRatio` needed.

---

## Namespaces and globals

There are exactly **five** reserved namespaces: `$util`, `$storage`, `$console`,
`$toast`, `$dom`. Every other JavaScript global resolves by name, and your own
declarations shadow same-named globals.

Use `$console.log(...)`, not bare `console.log(...)`. Both validate — bare
`console` resolves as an ordinary JS global — but `$console` is the canonical form
and routes through the host forwarder.

**Check [`namespaces.md`](namespaces.md) before writing a helper.** There are 153
members across the five namespaces; most formatting, date, collection, validation,
and storage work is already there. Prefer native JS when it reads more cleanly,
and reach for `$util` for field-based comparators, locale-aware formatting, and
skeleton ranges.

`$util.derived` is often better than `$memo` when the dependency list is obvious
from the body.

---

## Data

### A data builtin returns a bag, not a value

`$todos = $http({ url })` makes `$todos.data`, `$todos.loading`, `$todos.error`,
`$todos.status`, `$todos.refetch()` available. Never treat the binding itself as
the payload. See [`namespaces.md`](namespaces.md) for every bag's members.

### Prefer `Async` over manual state branching

`Async(resource, { loading, error, empty, data })` switches on the resource's
state, with `empty` covering `null` and empty-array data. It is shorter and
handles the case a hand-rolled ternary usually forgets.

### Refresh after a write with `.onDone`

```js
function save() {
  $result = $http({ url, method: "POST", body: $draft })
  $result.onDone = () => { $orders.refetch(); $toast.success("Saved") }
}
```

---

## Formatting

`$util.formatDate` accepts moment-like patterns (`"MMM D"`, `"YYYY-MM-DD"`) in
addition to the named modes, and **defaults to `"MMM D"`**.

`Col(label, values, { format })` accepts only `text`, `number`, `currency`, and
`date` — there is no `datetime`.

---

## Responsive

`gap`, `padding`, `align`, `justify`, `columns`, and `direction` all accept
responsive maps: `{ base: …, sm: …, md: …, lg: …, xl: … }`.

To swap whole components across breakpoints, use `Show` with a breakpoint atom:

```aktion
$app(Column([
  Show($util.breakpoint.md, {
    children: Card([SectionHeader("Filters"), Text("Wide layout")]),
    fallback: Button("Filters", { icon: "filter" }),
  }),
]))
```

---

## Security, briefly

The **program text is trusted code** — by default it can reach the whole host
realm. A host that renders program text it does not fully trust should narrow that
first, from the host page (not from Aktion):

```js
import { setGlobalAccessPolicy } from "aktion-runtime";
setGlobalAccessPolicy("safe"); // data + formatting only: no eval/DOM/network/storage
```

Everything a program **renders** is untrusted data, and that is what the runtime's
sanitisers defend.

The runtime does **not** use `eval` or `new Function` internally, so it needs no
`unsafe-eval` in a Content Security Policy. It does inject `<style>` elements
(theme tokens, component CSS, the `Styles` component), so a strict CSP needs
`style-src 'self' 'unsafe-inline'` or a nonce/hash.

---

## Internationalisation and direction

- `dir="rtl" | "ltr" | "auto"` on the host element flips the whole tree. Programs
  need no change.
- `$i18n` supports ICU plural/select:
  `{ n, plural, =0{No items} one{1 item} other{# items} }`.
- Don't shadow an `$i18n`-destructured binding (typically `t`) with a parameter or
  loop variable — inside that scope `t("key")` calls the local, not the
  translator. This one **is** linted, as a warning.
