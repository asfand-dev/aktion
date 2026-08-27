# The Aktion authoring language

A compact reference for writing programs. This is **not** the complete language
spec — that is `dist/system_prompt.txt` (also at
<https://asfand-dev.github.io/aktion/dist/system_prompt.txt>), generated from the
runtime and always current. Read this to write; read that when you need a detail
this page omits.

Aktion's surface syntax is a **strict subset of TypeScript**. If a construct is
valid JS and is not listed as rejected in [`gotchas.md`](gotchas.md), it works.

## Statements

One statement per line; the renderer commits each as it streams.

```js
$count = 0                                  // reactive atom
label = "Total"                             // plain binding
items = [1, 2, 3].map(n => Text(`#${n}`))   // value-producing expression
function inc() { $count += 1 }              // action (no return)
function Chip(t) { return Badge(t) }        // component (returns a tree)
$effect(() => { $console.log($count) }, [$count])
$app(Column([label, items]))                // the UI root — exactly one
```

Forward references are the point of streaming: put `$app(...)` first and define
what it names below.

## Three kinds of name

| Form | Meaning |
| --- | --- |
| `$name` | A **reactive atom**. Declare with `$name = value`; read or write anywhere. |
| `name` | A plain binding — evaluated once, not reactive. |
| `Name(...)` / `name(...)` | A function declaration. Returns a tree → renders. No return → side effects. Case is convention only. |

Reserved top-level names: `$app(...)`, `$theme({...})`, and the always-in-scope
`route` handle.

## State

```js
$count = 0                       // atom
$user = { name: "Ada", role: "admin" }
$count += 1                      // assignment operators work inside bodies
$user.role = "editor"            // path-level update — only readers of .role re-render
```

Two-way binding: pass a `$variable` as the value to `Input`, `Select`, `Checkbox`,
`Switch`, `Slider`, `MultiSelect`, `CheckBoxGroup`, `DatePicker`, and friends.

```aktion
$name = ""
$optIn = false

$app(Card([
  SectionHeader("Sign up"),
  FormSection("Details", [
    FormControl("Name", Input("name", { value: $name, placeholder: "Ada Lovelace" })),
    FormControl("Updates", Switch("optIn", { checked: $optIn })),
  ]),
  Buttons([Button("Continue", { variant: "primary" })]),
]))
```

Hooks give **per-instance** state, mirroring React: `$state(initial)`,
`$memo(() => v, [deps])`, `$ref(initial)`, `$reducer(fn, initial)`, `$id(prefix?)`.
Custom hooks are `function $useThing() { … }`, called as `$useThing()`, and share
the caller's hook slots — so call them unconditionally, in a stable order.

Global stores: `$store({ ...state, ...methods })`, with `persist` / `history` /
undo-redo config. See [`builtins.md`](builtins.md).

## Components and actions

```aktion
function UserCard(user, { tone = "default" } = {}) {
  return Card([
    Row([Avatar(user.name), Column([Text(user.name, { variant: "large-heavy" }), Text(user.role)])], { gap: "sm" }),
    Badge(user.status, { variant: tone }),
  ])
}

function promote(user) { $selected = user; $toast.success(`Promoted ${user.name}`) }

$people = [{ name: "Ada", role: "Engineer", status: "Active" }]
$selected = null

$app(Column([
  PageHeader("Team"),
  Grid($people.map(p => UserCard(p, { tone: "success" })), { columns: { base: 1, md: 3 }, gap: "lg" }),
]))
```

Wire an action to a handler prop: `Button("Promote", { action: () => promote(p) })`
or `Button("Refresh", { action: refresh })`.

## Effects

```js
$effect(() => { … }, [$dep])              // runs when $dep changes
$effect(() => { … }, ["mount"])           // once, on mount
$effect(() => { … }, ["every(5000)"])     // every 5s
$effect(() => { … }, [$q, "debounce(300)"])
$effect(() => { const t = setInterval(tick, 1000); cleanup(() => clearInterval(t)) }, ["mount"])
```

Dependencies must be `$`-atoms or those string tokens — nothing else parses. See
[`gotchas.md`](gotchas.md).

## Data

```js
$orders   = $http({ url: "https://api.example.com/orders" })        // reactive bag
$profile  = $query({ url: "…/me", key: "me", ttl: 60000 })          // cached + deduped read
$save     = $mutation({ url: "…/orders", method: "POST" })          // fires on .mutate()
$feed     = $sse({ url: "…/stream", event: "tick" })
$socket   = $socket({ url: "wss://…", reconnect: true })
$form     = $form({ values: { email: "" }, rules: { email: ["required", "email"] }, onSubmit })
```

Every one returns a **bag** — `.data`, `.loading`, `.error`, `.refetch()`, … —
never a bare value. Members per builtin are in [`namespaces.md`](namespaces.md);
accepted config keys are in [`builtins.md`](builtins.md).

Render all four states with `Async`:

```aktion
$orders = $http({ url: "https://api.example.com/orders" })

$app(Card([
  SectionHeader("Orders"),
  Async($orders, {
    loading: Skeleton({ variant: "table-row", lines: 4 }),
    error: ErrorState("Could not load orders"),
    empty: EmptyState("No orders yet", { description: "They appear here after checkout." }),
    data: Table([Col("Order", $orders.data.id), Col("Total", $orders.data.total, { format: "currency" })]),
  }),
]))
```

## Routing

```aktion
function Dashboard() { return Column([PageHeader("Dashboard"), Card([Text("Overview")])]) }
function OrderDetail(id) { return Column([PageHeader(`Order ${id}`), Card([Text("Detail")])]) }
function NotFound() { return EmptyState("Page not found", { icon: "compass" }) }

pages = $router({
  "/": Dashboard(),
  "/orders/:id": OrderDetail(params.id),
  default: NotFound(),
})

$app(AppShell(
  Sidebar([SidebarItem("Dashboard", { icon: "gauge", active: true }), SidebarItem("Orders", { icon: "receipt" })], { brand: "Acme" }),
  [pages],
))
```

- Inside a matched arm, `params` holds the captured segments.
- The reactive `route` handle exposes `route.path`, `route.params`, `route.query`,
  and `route.navigate(to)`.
- `NavLink(label, { to })` is the link primitive; `Redirect(path)` navigates and
  unmounts.
- Nest `$router` inside a component for layout-preserving sub-routes.
- The host chooses hash (default) or `router-mode="history"`.

## Styling

Every component accepts the universal `sx` and `animate` props — use them for the
gaps the component props don't cover, not as a first resort.

```js
Card([...], { sx: { p: "lg", maxW: "480px", textAlign: "center" } })
Card([...], { animate: "fade-in-up" })
```

For layout, prefer `Column` / `Row` / `Grid` / `Box` / `Container` props. For
tokens, prefer `$theme(...)`. `Css(child, { style, class })` and the
`HTMLTag` / `Styles` escape hatches are last resorts.

## Theming, i18n, icons

```js
$theme({ colors: { primary: "#0969da" }, radius: { button: "6px" } })

const { t, setCurrentLanguage } = $i18n({
  defaultLanguage: "en",
  translations: { en: { hello: "Hello {name}" }, de: { hello: "Hallo {name}" } },
})

Icon("chart-line", { size: "lg" })   // Font Awesome name, no `fa-` prefix
```

All 11 themes (15 names) and 86 tokens: [`themes.md`](themes.md). Authoring rules:
[`layout.md`](layout.md).

## Helper components

`Async`, `Show(when, { children, fallback })`, `Portal`, `Redirect`,
`Lazy(loader, fallback)`, `ErrorBoundary(fallback, { children })` — see the
Helpers group in [`components/helpers.md`](components/helpers.md).

## Behaviour wrappers

Any component can be made interactive by wrapping it, rather than waiting for the
component to grow a prop: `OnClick`, `OnMouse`, `OnKeyboard`, `OnFocus`,
`OnIntersect`, `OnMount`, `Css`, `Link`. See
[`components/behaviour-wrappers.md`](components/behaviour-wrappers.md).

## Interop

For libraries that own their own DOM (charts, maps, editors, payment elements):
`Mount({ setup, update, cleanup, props })` and
`WebComponent(tag, { attributes, properties, on })`, paired with the `$script`
loader and the `$dom` observer namespace. See
[`components/interop.md`](components/interop.md).

## Multi-file programs

```js
// counter.aktion
export $count = 0
export function increment() { $count += 1 }

// app.aktion
import { $count, increment } from "./counter.aktion"
```

Only relative specifiers resolve. Validate a multi-module app with
`node tools/validate-aktion-app.mjs app.aktion`, which links first — a per-file
check reports every imported name as unknown.
