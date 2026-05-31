# aktion

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-github%20pages-6366f1)](https://asfand-dev.github.io/aktion/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-10b981.svg)](#contributing)

A framework-agnostic web component that renders LLM-generated UI from
**Aktion** — a reactive language whose surface syntax is a strict subset of
JavaScript, designed for chat assistants. Drop one `<script>` tag and one
`<aktion-app>` tag into any HTML page and you have a streaming, interactive
renderer for an LLM's response.

```html
<script type="module" src="https://asfand-dev.github.io/aktion/dist/aktion.js"></script>
<aktion-app theme="light">
  aktion = Card([
    CardHeader("Hello", { subtitle: "Generative UI in plain HTML" }),
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
  statement commits to the DOM as soon as it arrives. The surface syntax
  is a **strict subset of JavaScript** — `function` declarations,
  `for...of`, `if/else`, `switch/case`, template literals with
  `${expression}` interpolation, arrow functions, default parameters,
  destructuring, spread, optional chaining (`a?.b`), nullish coalescing
  (`a ?? b`), and object-literal named arguments. Every Aktion program
  is valid JavaScript.
- **One reactive atom kind.** Declare any reactive state with
  `$name = value` and read or write it with `$name`. The `$` prefix is
  the only thing that makes a binding reactive — `let` / `const` /
  `var` keywords are optional and have no effect on reactivity. The
  runtime tracks dependencies automatically. Automatic two-way binding
  via direct state refs (and member chains rooted at one —
  `value: $form.email`), and **50+ pure `@`-functions** (`@Filter`,
  `@Sort`, `@Find`, `@GroupBy`, `@Format`, `@FormatDate`, `@Plural`,
  `@Case`, `@Range`, `@Pick`, …).
- **One component-call shape.** Every call follows the trailing-object
  rule — `Component(positionalArg, { prop: value, … })`. At most one
  positional argument; every other argument goes in a trailing
  `{ }` object literal.
- **One HTTP primitive.** `Http({ url, method, headers, body, query, ... })`
  is the only network call. Each call is self-contained (pass a full
  absolute `url`; `GET` is the default; no host-wide defaults). It returns
  a reactive resource bag exposing
  `data | error | status | loading | headers | lastUpdated`, plus the
  callables `refetch()` and `cancel()`. Re-run a request via `refetch()`
  or by wrapping it in an `effect(..., [$dep])`.
- **`storage` and `console` globals.** Always in scope, no import,
  lowercase. `storage.set/get` (localStorage by default),
  `storage.session.*`, `storage.cookies.*` with object-literal options,
  and `console.log/error/warn/info/debug`.
- **A React-like DOM reconciler.** Diffs each re-render against the live
  DOM. Text-input value, selection, IME state, scroll positions,
  `<details>.open`, and stateful primitives like `Tabs` are all preserved
  across renders. Components that need to hold UI state get a
  `helpers.useInstanceState(...)` slot keyed by their position in the tree.
- **A rich component library** of **170+ components** spanning layout,
  forms, charts, data, feedback, navigation, patterns, app-shell composites,
  editors, advanced UI, and standard helpers. See [Component library](#component-library).
- **Declarative side effects.** `effect(() => { body }, [...deps])` for
  background work — anonymous blocks where the dependency list mixes
  state triggers (`$atom`), lifecycle triggers (`"mount"`, `"unmount"`,
  `"every(N)"`), and rate-limit modifiers (`"debounce(N)"`,
  `"throttle(N)"`). `effect(() => { … })` with no dependency array is
  equivalent to `effect(() => { … }, ["mount"])`. Declare an effect
  **at the top level** for program-wide work, or **inside a component
  function body** to scope it to a single instance — timers, watched
  atoms, and `cleanup(fn)` registrations tear down when the component
  leaves the tree. `function name(args) { … }` (camelCase) declares an
  action — click-driven mutations that may optionally `return` a value.
- **Outbound events.** `emit("name", { detail })` dispatches a
  `CustomEvent` on the host element from inside any action / effect /
  lambda body. The host listens with
  `el.addEventListener("name", …)`.
- **A built-in router.**
  `pages = Router({ "/path": Component(), "/users/:id": UserPage({ id: params.id }), default: NotFound() })`
  plus `NavLink(label, { to })` and a reserved `route` handle that
  exposes `route.path`, `route.params`, `route.query`, `route.pattern`,
  and `route.navigate("/path")`. Hash-based, framework-agnostic, always
  wired up.
- **Seven built-in themes** (`light`, `dark`, `neon`, `pastel`, `glass`,
  `brutalist`, `skyline`) plus full custom-token support via CSS custom
  properties. **50+ design tokens** organised into `colors`, `radius`,
  `font`, `motion`, and `elevation` groups. Brand the UI from inside
  the script with `theme = Theme({...})`.
- **`i18n` runtime.** `$i18n = i18n({ locale, messages, fallback })` plus
  a global `t("key", vars?)` builtin and a `Locale()` helper that feeds
  the active locale into `@Format` / `@FormatDate`.
- **Font Awesome 6.7.2** auto-loaded — every `icon` prop accepts a Free
  Font Awesome name (no `fa-` prefix). Use `Icon(name, { variant?, size? })`
  for standalone glyphs. Variant prefixes supported: `"regular:star"`,
  `"brands:github"`.
- **Markup escape hatches.** `HTMLTag(tag, { attributes?, children? })`
  and `Styles(css)` are the last-resort raw-HTML / raw-CSS injectors
  when no standard component captures the design.
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
<aktion-app response='aktion = Card([CardHeader("Hi")])'></aktion-app>

<!-- as inner text (rendered on connect) -->
<aktion-app>
  aktion = Card([CardHeader("Hi")])
</aktion-app>

<!-- as a property/method -->
<script>
  const el = document.querySelector("aktion-app");
  el.setResponse(`
    aktion = Column([greeting])
    greeting = Card([CardHeader("Hello", { subtitle: "Generative UI in plain HTML" })])
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
});
```

> Network calls are issued by the LLM-authored code itself via the
> `Http({ url, method, body, ... })` primitive. The host is not involved.
> Install `el.registerHttpInterceptors(...)` if you need to attach auth
> headers, retry on 401, or log every request.

### 6. (Optional) Listen for assistant messages

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

Routing and JavaScript execution inside `effect` / action bodies are
always available — no host attribute, no allow-list. To omit those
surfaces from the *generated prompt*, build it via
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
| `registerComponents(specs, root?)`                              | Extend the built-in library with your own components.                                                                        |
| `getSystemPrompt(options?)`                                     | Build a system prompt that matches the current library. Pass `{ mode: "chat" }` for the compact variant.                     |
| `navigate(path)`                                                | Programmatically navigate. Updates `window.location.hash`.                                                                   |
| `registerHttpInterceptors({ onRequest?, onResponse?, onError? })` | Install interceptors for the `Http({...})` layer. `onResponse` receives a `retry()` one-shot for e.g. 401 refresh flows.       |
| `serializeState()`                                              | Return every reactive atom as a plain JSON-friendly object (for SSR / resumption).                                           |
| `hydrateState(snapshot)`                                        | Apply a snapshot to the live store and schedule a re-render. Atoms not in the snapshot are untouched.                        |
| `loadSnapshot({ programText, state })`                          | Atomic program + state load. The next render plans the program with the hydrated state already in place.                     |
| `applyDelta(ops)`                                               | Apply a structured delta (`patch` / `replace` / `append` / `new` / `delete`). User `$state` is preserved across the diff.    |

### Events

| Event                | Detail                                        | When it fires                                                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `assistant-message`  | `{ message: string }`                         | When an action or lambda calls `emit("assistant-message", { message: "..." })`. |
| `error`              | `{ errors: ParseError[] }`                    | After each render whose source had parse errors.                               |
| `route-change`       | `{ path, previousPath, source }`              | When the current hash path changes. `source` is `"init" \| "hashchange" \| "navigate" \| "external"`. |
| `<custom-name>`      | User-defined `{ ... }`                        | When script calls `emit("name", { ... })` inside an action / effect body.       |

The `error` event always fires regardless of `showerrors`, so host apps
can log or report errors even when the in-page banner is suppressed.

### Runtime safety limits

Every program is evaluated under a per-render **runtime budget** that
bounds three independent dimensions so a partial / accidentally
recursive program (typed live in the playground, mid-stream LLM token,
…) can't freeze the browser:

| Dimension           | Default      | Triggers on                                              |
| ------------------- | ------------ | -------------------------------------------------------- |
| `componentDepth`    | 150 levels   | `function Foo() { return Foo() }` and other recursive trees |
| `iterations`        | 250 000 / render | unbounded `for`/`while` loops inside function bodies    |
| `arrayLength`       | 100 000 entries | `@Range(0, 1e9)`, `@Repeat(value, 1e9)`                 |

When a limit trips, the runtime aborts the render, emits an `error`
event whose detail is shaped like a parse error (`{ line: 0, column:
0, message }`), and leaves the previous tick's DOM intact so the user
still sees something useful. The defaults comfortably fit any
realistic app; tighten or relax them by constructing a custom budget
via `createRuntimeBudget({ … })` and passing it through `createContext`
(or pass `null` to disable enforcement entirely in trusted offline
pipelines).

---

## Aktion — the language

Aktion's surface syntax is a **strict subset of JavaScript**. Every
declaration uses standard JS constructs — `function`, `for...of`,
`if/else`, `switch/case`, arrow functions, object literals — so any
developer reading the output immediately knows what it does. The renderer
commits each line as soon as it streams in, so the user sees the page
shell before the leaves arrive.

```js
$count = 0
$theme = "dark"

function Counter(label = "Count") {
  return Stack([
    SectionHeader(label),
    Button("Inc", { onClick: () => $count = $count + 1 }),
    Text(`Current: ${$count}`)
  ])
}

function loadOrders() {
  $orders = Http({ url: "https://api.example.com/orders", method: "GET" })
}

effect(() => {
  $save = Http({ url: "https://api.example.com/draft", method: "PUT", body: $draft })
}, [$draft, "debounce(500)"])

$orders = Http({
  url:    "https://api.example.com/users/42/orders",
  method: "GET",
  query:  { limit: 5 }
})

pages = Router({
  "/":         Counter(),
  "/orders":   Async($orders, { loading: Spinner(), data: OrderTable($orders.data) }),
  default:     NotFound()
})

aktion = pages
```

### Key constructs

- `aktion = …` — the reserved entry point. Every program renders from
  it.
- `$name = value` — reactive state. One kind. Read or write with the
  same sigil. Inside action / effect / lambda bodies, assignment
  operators (`= += -= *= /= ??= ++ --`) are all allowed.
  `let/const/var` are optional and do not affect reactivity — only the
  `$` prefix makes a value reactive.
- **Component-call shape** — every call follows the trailing-object
  rule:

  ```js
  Component(positionalArg, { prop: value, … })
  ```

  Each component accepts **at most one positional argument** (typically
  the title, children array, or primary value); every other argument
  goes in a trailing `{ }` object literal. This is the *only* call
  shape — `Button("Save", "primary", true)` is a schema error; write
  `Button("Save", { variant: "primary", loading: true })` instead.
- `function Name(p = default) { return Expression }` — PascalCase name
  means it's a component. Parameters use standard JS defaults (`=`).
  Inside the body, `$x = expr` is a **declaration**: the initializer
  runs once when the instance first mounts, and re-renders preserve
  whatever value the user (or an action / effect) has written.
  **Always** end with an explicit `return`. Components do not have a
  `props` object — every parameter is a real JS parameter.
- `function name(args) { body }` — camelCase name means it's an action.
  Callable effects with optional `return`. Used as event handlers
  (`onClick: save`) or as expressions (`$result = greet("Ada")`).
- `effect(() => { body }, [...deps])` — declarative, anonymous side
  effects. The dependency array mixes state triggers (`$atom`),
  lifecycle / interval triggers (`"mount"`, `"unmount"`, `"every(N)"`),
  and rate-limit modifiers (`"debounce(N)"`, `"throttle(N)"`).
  `effect(() => { … })` (no second argument) is equivalent to
  `effect(() => { … }, ["mount"])`. Declare at the program top level
  for global work, or inside a component function body to scope the
  effect to that instance — the runtime mounts it on first render and
  tears down its timers / subscriptions / `cleanup(fn)` handlers when
  the instance leaves the tree.
- `emit("name", { detail })` — dispatch an outbound `CustomEvent` on
  the host element. Call from any action / effect / lambda body
  whenever the surrounding host page needs to react to a user
  interaction.
- Standard JS control flow — `if`, `switch`, `for`, `while`, `do…while`,
  `try` are **statements**, exactly as in JavaScript. They run inside
  any imperative body (`function`, lambda with `{ … }`, `effect`) but
  cannot appear on the right-hand side of an assignment. Use ternaries
  and `.map`/`.filter` for value-producing expressions. Bodies may be
  either a block or a single statement (`if (!ok) return`):

  ```js
  banner = $error ? ErrorAlert($error) : Notice("All good")
  rows   = $items.map(item => Row(item))
  // Multi-way dispatch: wrap a `switch` in a function and `return` per arm.
  function viewFor(tab) {
    switch (tab) {
      case "list":  return ListView($items)
      case "grid":  return GridView($items)
      default:      return EmptyState("Pick a view")
    }
  }
  view = viewFor($tab)
  ```
- Full operator set — arithmetic (`+`, `-`, `*`, `/`, `%`, `**`),
  comparison (`==` / `!=` / `===` / `!==`, `<` / `>` / `<=` / `>=`),
  logical (`&&`, `||`, `??`), bitwise / shift (`&`, `|`, `^`, `~`, `<<`,
  `>>`, `>>>`), and the relational keywords `instanceof` / `in`. Every
  compound-assignment form is supported too (`+=`, `-=`, `*=`, `/=`,
  `%=`, `**=`, `&&=`, `||=`, `??=`, `&=`, `|=`, `^=`, `<<=`, `>>=`,
  `>>>=`).
- Line continuations — any expression operator (`.`, `?.`, `?`, `:`,
  `&&`, `||`, `??`, `==` / `!=` / `===` / `!==`, `<` / `>` / `<=` /
  `>=`, `instanceof`, `+`, `-`, `*`, `/`, `%`, `**`) may appear at the
  start of the next line and the parser keeps building the same
  expression — matches JavaScript's ASI rules. Use this to split long
  method chains, ternaries, and logical expressions across lines.
- `Http({ url, method, headers, body, query, ... })` — the only network
  primitive (absolute `url`; `GET` default; no host-wide defaults).
  Returns a reactive resource with `.data`, `.error`,
  `.status`, `.loading`, `.headers`, `.lastUpdated`, `.refetch()`,
  `.cancel()`, and a settable `.onDone` callback that fires each time the
  request settles (handy for `$todos.refetch()` after a write).
- `pages = Router({ "/path": Component(), default: NotFound() })` —
  function-call router. The reserved `route` handle exposes the
  reactive surface (`route.path`, `route.params`, `route.query`,
  `route.pattern`) and a `route.navigate("/path")` method; each arm
  body additionally receives a scoped `params` loop var with its
  captures.
- Two-way binding is implicit: pass a `$variable` (or a member chain
  rooted at one — `value: $form.email`) as an input prop and the
  runtime wires it both ways.
- Lambdas — every JavaScript arrow form is supported: `() => expr`,
  `x => expr` (single param, no parens), `(x) => expr`, `(x, y) => expr`,
  `(x = 0) => x + 1` (defaults), `(...args) => sum(args)` (rest),
  `({ a, b }) => a + b` / `([x, y]) => x` (destructured params),
  `(args) => { … }` (multi-statement, may `return`). The body can wrap
  onto the next line (`x =>\n  expr`).
- Destructured parameters — both `function` declarations and lambdas
  accept array / object patterns (`function Card({ title, tone = "info" })`,
  `function head([first, ...rest])`), with the same defaults / renames /
  rest support as `let`-destructuring.
- JS expression niceties — array / object spread (`[...xs, y]`,
  `{ ...base, k: v }`), array / object destructuring in `let` / `const`
  / `var` (`let [a, b, ...rest] = arr`, `let { name, age = 0 } = user`),
  computed property keys (`{ [$dynamic]: value }`), prefix and postfix
  `++` / `--` (with JS-accurate return semantics), `new Constructor(...)`
  with trailing member / call chains (`new Date(0).getTime()`), trailing
  commas in function params / call args / literal lists. `async function`
  is accepted as a no-op modifier; `await` is allowed in both statement
  and expression position inside action / effect bodies.
- Top-level imperative statements — `if` / `for` / `while` / `try` and
  bare expression statements written at the program top level run once
  per plan (e.g. building a `$state` array with a `while` loop). Inside
  a render they behave like a module init block; prefer pure expressions
  (`.map`, `@Range`) where you can.
- **Built-in `@`-functions** — pure, side-effect-free helpers for data
  shaping, formatting, dates, math, and strings (`@Filter`, `@Sort`,
  `@Map`, `@GroupBy`, `@Format`, `@FormatDate`, `@Plural`, `@Range`,
  `@AddDays`, `@Pick`, `@Count`, …). Never carry hidden state — safe
  to call anywhere.
- **Escape hatches** — `HTMLTag(tag, { attributes?, children? })` for
  raw HTML elements and `Styles(css)` for raw CSS injected into the
  shadow root. Use only when the standard component library cannot
  express the design.
- **Hoisting & streaming** — references resolve from the entire
  top-level scope, not source order. Always emit `aktion = …` first
  so the reconciler has the page shell to attach streamed leaves to.
- Comments: `//` line comments and `/* block */` comments — standard
  JS style.

#### Built-in globals at a glance

| Global    | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| `storage` | Browser persistence — `storage.set/get`, `storage.session.*`, `storage.cookies.*`. |
| `console` | Forwards to the host console — `log` / `error` / `warn` / `info` / `debug`. |
| `route`   | Reactive router handle — `path`, `params`, `query`, `pattern`, `navigate(path)`. |
| JS stdlib | The JS standard library — `Math`, `JSON`, `Object`, `Array`, `Number`, `String`, `Boolean`, `Date`, `Map`, `Set`, `RegExp`, `Promise`, plus `parseInt` / `parseFloat` / `isNaN` / `isFinite` / `encodeURIComponent` / … Use directly (`Math.max(a, b)`, `JSON.stringify(x)`, `Object.keys(o)`) or with `new` (`new Date()`, `new Map()`). |
| timers    | `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` — like their JS counterparts, but tracked by the runtime and cleared automatically on re-plan/disconnect. Use inside an `effect` and clear in `cleanup`. |
| full JS globals | The **entire** JavaScript global surface is available — dialogs (`alert`, `confirm`, `prompt`), Web APIs (`fetch`, `URL`, `URLSearchParams`, `Blob`, `FormData`, `crypto`, `navigator`, `localStorage`, `atob`/`btoa`, `Intl`, `BigInt`, `Reflect`, …), and `window` / `document` themselves. Any `globalThis` member resolves by name. |

Both `storage` and `console` are **lowercase**; the `route` handle is
**reserved** (never declare a state slot named `route`). Author declarations
and built-in components always win over a same-named global (a library
`Text` / `Map` component is never shadowed by the DOM `Text` / `Map`), so the
global passthrough only resolves names you haven't otherwise defined. For
reactive data prefer `Http({...})` over raw `fetch`, and timers/listeners
belong inside an `effect(...)` so they're cleaned up on unmount.

### The 60-second pitch

```js
$days = "7"
$data = Http({ url: "https://api.example.com/metrics", method: "GET", query: { days: $days } })

filter = FormControl("Range", { control: Select("days", {
  items: [SelectItem("7", "7d"), SelectItem("30", "30d")],
  value: $days
}) })
kpi    = StatCard("Events", { value: `${$data.data?.events ?? 0}`, trend: "up" })
chart  = LineChart({
  labels: $data.data?.daily?.day ?? [],
  series: [Series("Events", $data.data?.daily?.events ?? [])]
})

aktion = Column([CardHeader("Analytics"), filter, kpi, chart])
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
  `Grid(items, { columns: { sm: 1, md: 2, lg: 4 }, gap: "l" })`.
- Forward references are allowed — list `aktion = Column([...])` first
  and let the children stream in beneath it.

### Declarative todo app

```js
$todos = [{ id: 1, text: "Welcome — try editing", done: false }]
$draft = ""

function add() {
  $todos = [...$todos, { id: $todos.length + 1, text: $draft, done: false }]
  $draft = ""
}

function remove(id) {
  $todos = @Filter($todos, "id", "!=", id)
}

row = t => Card([Stack([
  Text(t.text),
  Button("Delete", { onClick: () => remove(t.id), variant: "ghost" })
])])

list  = $todos.map(t => row(t))
aktion = Stack([
  Input("draft-input", { placeholder: "What needs doing?", value: $draft }),
  Button("Add", { onClick: add, variant: "primary" }),
  list
])
```

### Per-instance state & content-addressed identity

```js
function Counter(label) {
  $n = 0
  return Stack([
    Text(`${label}: ${$n}`),
    Button("inc", { onClick: () => $n = $n + 1 })
  ])
}

// Two independent counters — each holds its own atom.
aktion = Stack([Counter("A"), Counter("B")])
```

Every call site accepts a universal `key` named argument. The renderer
uses it as the instance suffix instead of source location, so reordering
siblings keeps per-instance state attached to the right element:

```js
function TaskRow(task) {
  return Stack([Text(task.title)], { key: task.id })
}
```

### Component-scoped effects

`effect(() => { … }, [...deps])` blocks can live at the program top level
**or** inside a component function body. Inside a component body the
runtime mounts the effect when the instance first renders and tears it
down (clearing timers, unsubscribing watched atoms, firing every
registered `cleanup(fn)`) the moment the instance disappears from the
tree. Two `LiveClock()` calls produce two independent intervals — and
removing one stops only that one:

```js
aktion = Stack([LiveClock("UTC"), LiveClock("Local")])

function LiveClock(label) {
  $now = @Now()
  effect(() => {
    $now = @Now()
  }, ["every(1000)"])
  return Stack([Text(label), Text(@FormatDate($now, "time"))])
}
```

Use a top-level `effect(() => { … }, [...])` for global work (analytics,
app-wide keyboard shortcuts, hydration of shared atoms); use a
component-local effect whenever the background work logically belongs
to the UI it serves.

### Schema-as-truth diagnostics

`validateProgramSchema(program, library)` (exported from
[`src/library/index.js`](./src/library/index.ts)) emits **hard errors**
for:

- Closed-token enum mismatches (`Button("Save", { variant: "magic" })`).
- Unknown named args (`Stack({ junk: 1 })`).
- One-positional-max violations (`Button("Save", "primary", true)` →
  "use `{ variant: "primary", loading: true }`").

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

The bundle ships **170+ components** grouped by domain. Reach for **pattern composites**
(`Hero`, `PageHeader`, `Stats`, `Toolbar`, `EmptyState`, `Timeline`,
`KanbanBoard`, `DescriptionList`, `PricingTable`, …) before hand-rolling
the equivalent with `Card` + `Stack` — they're tuned to produce dense,
production-quality SaaS UI in a single line.

| Group              | Components |
| ------------------ | ---------- |
| **Layout**         | `Column`, `Row`, `Center`, `Stack`, `StackItem`, `Grid`, `GridItem`, `Container`, `Box`, `Spacer`, `Card`, `CardHeader`, `CardFooter`, `Separator`, `Tabs`, `TabItem`, `Accordion`, `AccordionItem`, `Modal`, `Drawer`, `Steps`, `AspectRatio`, `ScrollArea`, `Sticky`, `ResizablePanels`, `MasonryGrid` |
| **Content**        | `Text`, `Image`, `Icon`, `Badge`, `BadgeList`, `Callout`, `Quote`, `CodeBlock`, `Skeleton`, `Spinner`, `Markdown`, `Kbd` |
| **Forms**          | `Form`, `FormControl`, `FormSection`, `FieldSet`, `ValidationSummary`, `Input`, `TextArea`, `PasswordInput`, `MaskedInput`, `MentionInput`, `TagInput`, `Select`, `SelectItem`, `Combobox`, `MultiSelect`, `Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Switch`, `ToggleGroup`, `Button`, `Buttons`, `SearchBar`, `Slider`, `NumberInput`, `ColorPicker`, `DatePicker`, `DateRangePicker`, `TimePicker`, `DateTimePicker`, `FileUpload`, `PinInput`, `MultiStepForm` |
| **Data**           | `Table`, `Col`, `DataGrid`, `List`, `ListItem`, `StatCard`, `Stats`, `Sparkline`, `Tile`, `Progress`, `ProgressRing`, `Pagination`, `Tree`, `TreeNode`, `CalendarView`, `ComparisonTable`, `InfiniteList` |
| **Charts**         | `BarChart`, `LineChart`, `PieChart`, `RadarChart`, `ScatterChart`, `Histogram`, `Heatmap`, `Gauge`, `Series` |
| **Feedback & Media** | `Avatar`, `AvatarGroup`, `PersonChip`, `Tooltip`, `HoverCard`, `Popover`, `Rating`, `Toast`, `VideoPlayer`, `AudioPlayer`, `Carousel`, `Gallery`, `Lightbox`, `Map` |
| **Navigation**     | `Breadcrumb`, `BreadcrumbItem`, `Navbar`, `NavbarItem`, `TopBar`, `NavLink` (router-aware) |
| **Menus**          | `DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `ContextMenu` |
| **Editors**        | `RichTextEditor`, `CodeEditor` |
| **Chat**           | `SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`, `ActionLink`, `ChatBubble` |
| **Patterns**       | `Hero`, `PageHeader`, `SectionHeader`, `Toolbar`, `EmptyState`, `Timeline`, `TimelineItem`, `ActivityLog`, `FeatureGrid`, `FeatureItem`, `MediaCard`, `Testimonial`, `ProfileCard`, `Comment`, `Banner`, `Notification`, `InboxPanel`, `OnboardingChecklist`, `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `DescriptionList`, `DescriptionItem`, `StatusDot`, `PricingTable`, `PricingCard`, `LoadingState`, `ErrorState`, `SuccessState`, `Tour`, `Spotlight` |
| **App shell**      | `AppShell`, `Sidebar`, `SidebarSection`, `SidebarItem` (supports `to` for router navigation), `SplitView` |
| **Advanced UI**    | `IconButton`, `CommandPalette`, `FilterChips`, `FieldRepeater`, `VirtualList`, `QueryBuilder`, `DiffViewer`, `JsonTree`, `Gantt`, `Truncate`, `InlineEdit`, `NotificationBell` |
| **Helpers**        | `Async`, `Show`, `Portal`, `Redirect`, `Lazy`, `ErrorBoundary` |
| **Behaviour wrappers** | `OnClick`, `OnMouse`, `OnKeyboard`, `OnFocus`, `OnIntersect`, `Css`, `Link` — attach click / mouse / keyboard / focus / intersection listeners or raw class / style to ANY component without it needing a dedicated prop. `Link(label_or_child, { to?, href?, external? })` wraps either a string or a component as a router-aware anchor. |
| **Escape hatches** | `HTMLTag`, `Styles` (last-resort raw HTML / CSS — see [language.html](https://asfand-dev.github.io/aktion/language.html#escape-hatches)) |
| **Theming**        | `Theme` |
| **Routing**        | `Router({ … })`, `NavLink` |

### Form `onChange` callback

Every input component accepts an optional `onChange(value)` callable
that fires with the freshly-read value on every change. Use it alongside
(or instead of) `$variable` two-way binding when you need to react
beyond a state write (debounce a search, persist a setting, kick off
a fetch).

```js
Input("query", { onChange: q => $results = Http({ url: `https://api.example.com/search?q=${q}` }) })
Slider("vol", { min: 0, max: 100, value: $vol, onChange: v => storage.set("volume", v) })
Switch("dark", { value: $theme == "dark", onChange: on => $theme = on ? "dark" : "light" })
```

### Behaviour wrappers

Six tiny wrappers attach behaviour to any component:

```js
// Clickable / tappable card
OnClick(Card([Text("View order")]), { onClick: () => route.navigate("/orders/4821") })

// Lazy-load sentinel — fires once when the placeholder scrolls into view
OnIntersect(Skeleton({ variant: "card" }), { onEnter: $items.refetch, once: true })

// Drop zone — uses standard HTML5 drag-and-drop
OnMouse(Card([Text("Drop files here")]), {
  dragOver: e => e.preventDefault(),
  drop: e => { e.preventDefault(); $files = e.dataTransfer.files }
})

// Apply a custom class / style without breaking out of the component
Css(Card([Text("Highlighted")]), { class: "highlight", style: "border-color: #f59e0b;" })
```

`OnClick` / `OnMouse` / `OnKeyboard` / `OnFocus` render the child via a
transparent wrapper (`display: contents`) so the visual tree is
unchanged — only events bubble through the wrapper. `OnIntersect` uses
`IntersectionObserver` and disposes cleanly when the component leaves
the tree. `Css` merges classes / inline styles directly onto the
rendered child element. `Link` is the same wrapper applied as an
`<a>` anchor with optional router-aware navigation (`to`).

The full catalog with positional signatures, prop tables, enum values, and
live previews is at
[`docs/components.html`](https://asfand-dev.github.io/aktion/components.html).

### Rich pattern composites

```js
function export_q3() { $exp = Http({ url: "https://api.example.com/exports/q3", method: "POST" }) }
function new_project() { route.navigate("/projects/new") }

dashHeader  = PageHeader("Engineering Q3", { subtitle: "12 active · 4 at risk", breadcrumbs: ["Workspace", "Engineering"], actions: dashActions, status: Badge("On track", "success") })
dashActions = [Button("Export", { onClick: export_q3, variant: "secondary" }), Button("New project", { onClick: new_project, variant: "primary" })]
kpis        = Stats([
  StatCard("Active",  { value: "12",  trend: "flat" }),
  StatCard("At risk", { value: "4",   trend: "up",   delta: "+2" }),
  StatCard("Shipped", { value: "8",   trend: "up",   delta: "+3" }),
  StatCard("On-time", { value: "87%", trend: "down", delta: "-3%" })
])
board = KanbanBoard([
  KanbanColumn("To do",  { items: [KanbanCard("Migrate auth", { description: "Roll out new SDK.", tags: ["auth"],     assignee: "Asha" })] }),
  KanbanColumn("Doing",  { items: [KanbanCard("Streaming UI v2", { description: "20 new components.", tags: ["frontend"], assignee: "Alex", tone: "primary" })] }),
  KanbanColumn("Review", { items: [KanbanCard("Mobile onboarding", { description: "Awaiting design.", tags: ["mobile"], assignee: "Wren", tone: "warning" })] }),
  KanbanColumn("Done",   { items: [KanbanCard("Activity timeline",  { description: "Shipped to 100%.", tags: ["shipped"], assignee: "Mira", tone: "success" })] })
])
follow = FollowUpBlock(["Show at-risk projects", "Compare to Q2", "Who needs help?"])

aktion = Column([dashHeader, kpis, board, follow])
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
reserved top-level `theme` binding. The tokens land on the host as CSS
variables on top of the base theme.

```js
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

aktion = Column([CardHeader("GitHub-style page"), Buttons([Button("New repository")])])
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
- Use the dedicated `Icon(name, { variant?, size? })` component to render
  a standalone glyph (`size` ∈ `xs`, `sm`, `md`, `lg`, `xl`).
- Every component prop named `icon` — `NavLink`, `SidebarItem`, `Banner`,
  `Notification`, `FeatureItem`, `Badge`, `StatCard`, `ListItem`,
  `TimelineItem`, `DescriptionItem`, `Tile`, `EmptyState`, … — expects a
  Font Awesome name.
- Invisible Unicode glyph modifiers (variation selectors, ZWJ) are
  stripped silently so legacy emoji leftovers still resolve to the
  proper icon.

```js
brandIcon  = Icon("rocket", { variant: "solid", size: "lg" })
homeIcon   = Icon("house")
profileTab = NavLink("Profile", { to: "/profile", variant: "ghost", icon: "user" })
kpis       = Stats([
  StatCard("Revenue", { value: "$48k", trend: "up",   delta: "+12%", icon: "sack-dollar" }),
  StatCard("Orders",  { value: "1,284", trend: "up",   delta: "+8%",  icon: "cart-shopping" }),
  StatCard("Refunds", { value: "12",   trend: "down", delta: "-3",   icon: "rotate-left" })
])
aktion     = Stack([brandIcon, kpis, profileTab])
```

---

## Routing

Hash-based routing is built into the runtime. The LLM emits routes that
stay in sync with the URL (`#/dashboard`, `#/users/42`). Browser
back/forward, bookmarks, and deep links all work — and the host page
never reloads.

```js
pages = Router({
  "/":          homePage,
  "/dashboard": dashboardPage,
  "/users/:id": userPage({ id: params.id }),
  default:      notFoundPage
})

nav = Row([
  NavLink("Home",      { to: "/", exact: true }),
  NavLink("Dashboard", { to: "/dashboard" }),
  NavLink("Users",     { to: "/users" })
], { gap: "s" })

aktion = Stack([nav, pages])

homePage      = Card([CardHeader("Welcome")])
dashboardPage = Card([CardHeader("Dashboard")])
userPage      = (id) => Card([CardHeader(`User ${id}`)])
notFoundPage  = Callout("Not found", { description: `We couldn't find ${route.path}.`, variant: "warning" })
```

- `pages = Router({ "/path": Component(), default: Fallback() })` picks
  the matching arm based on the current hash path. First match wins;
  `default:` is the fallback.
- Route patterns support literal segments (`"/about"`), parameter
  segments (`"/users/:id"` → `params.id`), and trailing wildcards
  (`"/docs/*"` → `params._`).
- `NavLink(label, { to, variant?, exact?, icon? })` is a router-aware
  anchor that intercepts clicks and reflects `data-active="true"` for the
  current path.
- The reactive `route` handle exposes `route.path`, `route.params`,
  `route.query`, and `route.pattern`. Call `route.navigate("/path")`
  from inside the script, or `el.navigate("/path")` from the host.

The default ("full") system prompt teaches the LLM about routing. The
chat-flavoured prompt omits it. See the
[routing guide](https://asfand-dev.github.io/aktion/routing.html)
for the full walkthrough.

---

## Built-in globals

Two namespace globals are always in scope inside an Aktion
program — no import required. Both follow the standard
`obj.method(args)` method-call syntax and accept object-literal options.

```js
// localStorage is the default; `storage.local` is its alias.
storage.set("name", "John")
$name = storage.get("name")

// Per-tab sessionStorage.
storage.session.set("draft", $draft)
$draft = storage.session.get("draft")

// Cookies — options as an object literal.
storage.cookies.set("user", "John", { expires: 7, path: "/", sameSite: "Lax" })
$user = storage.cookies.get("user")
storage.cookies.remove("user", { path: "/" })

// Forwards to the host console.
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

```js
$i18n = i18n({
  locale: "fr-FR",
  fallback: "en",
  messages: {
    greeting: "Bonjour, ${name}!",
    orders: { title: "Commandes récentes" }
  }
})

welcome     = Text(t("greeting", { name: $user.name }))
sectionTitle = SectionHeader(t("orders.title"))
formatted   = Text(@Format(1234.5, "currency", { currency: "EUR", locale: Locale() }))
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
  object-literal named args, double-quoted strings, two-space block
  indentation, template literals intact.
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
| `http.html`                         | HTTP guide — the `Http({...})` primitive, config options, the reactive resource bag, `Async`, refetch/cancel patterns, and a full CRUD walkthrough. |
| `components.html`                   | Every built-in component with a live preview, positional signatures, prop tables, and enum values. |
| `actions.html`                      | `function name() { … }` guide — declarative state mutations, optimistic snapshot/rollback, lambda-based click handlers, navigation, and end-to-end examples. |
| `side-effects.html`                 | `effect(() => { … }, [...deps])` guide — anonymous side effects, dependency entries (state, lifecycle, intervals, debounce/throttle), top-level vs. component-local scope, cleanup, and effect vs. action. |
| `javascript-interactions.html`      | Effect + action bodies — the JavaScript execution surface.                               |
| `routing.html`                      | Hash-based routing guide — always available at runtime.                                 |
| `themes.html`                       | Built-in themes gallery, live picker, side-by-side compare, and the token customization studio. |
| `examples.html`                     | Curated showcase of real-world block UIs (auth, products, FAQ, cart, todos, …).         |
| `playground.html`                   | CodeMirror 6 editor with custom highlighting / autocomplete, live preview, share links, hover-over component info, and an inspection mode. |
| `visual-editor.html`                | Drag-and-drop visual editor for the full 170+ component library. Three canvas modes (Raw Edit / Visual Edit / Preview), an Outline tab for top-level entity navigation, typed prop editors, cross-entity selection, and import / export of `.aktion` + self-contained HTML via an editable Source drawer. |
| `chat-bot.html`                     | OpenRouter-powered streaming chat with four generation modes (Chat Compact, Chat Full, Website Builder, App Builder), image / PDF attachment support, and download-as-standalone-HTML. |
| `live-examples.html`                | Catalog page that links every demo into the shared `live-example.html?example=<slug>` shell. |
| `live-example.html`                 | Shared shell for the bundled live examples — picks the demo from the `?example=<slug>` query parameter. |

---

## Live examples

Every standalone demo is served by a single shell page
(`docs/live-example.html`) and a single JS bundle
(`docs/assets/live-example.js`) that ships every demo's Aktion source
and setup code together. Open any example with
`live-example.html?example=<slug>` — the shell renders the original
hero / source / output layout, so each demo doubles as an integration
recipe for `setResponse`, `appendChunk`, and `setTheme`.

| Demo slug                       | Highlights                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
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
│   │   ├── effects.ts         #     EffectRunner + ActionDeclRunner
│   │   ├── http.ts            #     Http({...}) reactive HTTP primitive + interceptors
│   │   ├── i18n.ts            #     $i18n runtime + t() / Locale() builtins
│   │   ├── storage.ts         #     storage.local / .session / .cookies bridge
│   │   ├── console.ts         #     console.* host bridge
│   │   └── router.ts          #     Hash-based router for Router({…}) calls and NavLink
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

The suite covers parser/lexer, runtime evaluator + reactive state +
`Http({...})`, effects / actions, the hash-based router + `NavLink`,
theme resolution, in-script `Theme(...)` overrides, the component
library, element-level integration via happy-dom, the system prompt
generator, storage / console globals, the language-support spec for
editor tooling, prop aliases & one-positional-max enforcement, icon
rendering, and language-concept coverage (computed values, math,
lambdas, hoisting, i18n, `for` extensions, user components).

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
requests issued by the LLM through `Http({...})` flow through your host's
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
use `eval`. Effect and action bodies are evaluated with
`new Function(...)` which requires `'unsafe-eval'` if you want them to
run arbitrary JavaScript; if you cannot relax CSP, simply avoid emitting
complex JS expressions from the LLM — declarative constructs (component
trees, `Http()`, `@`-functions) keep working without `unsafe-eval`.

---

## CDN deployment

This repo serves its own bundle on GitHub Pages (see Quick start §1).
To ship your own copy, run `npm run build` and serve `dist/` from any
static host — every artifact in `dist/` is self-contained. Push to
`main` and [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
builds, tests, and publishes.

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
