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
  $app(Card([
    CardHeader("Hello", { subtitle: "Generative UI in plain HTML" }),
    Markdown("This card was streamed in as **plain text**.")
  ]))
</aktion-app>
```

That is the whole integration. Works in React, Vue, Angular, Svelte, plain
HTML, or no framework at all.

- **Docs site:** <https://asfand-dev.github.io/aktion/>
- **Live demos:** <https://asfand-dev.github.io/aktion/live-demos.html>
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
- [Built-in globals (`$storage`, `$console`)](#built-in-globals)
- [Internationalization (`$i18n`)](#internationalization)
- [System prompt generator](#system-prompt-generator)
- [Tooling](#tooling)
- [Build-time compiler & multi-file modules](#build-time-compiler--multi-file-modules)
- [Documentation site](#documentation-site)
- [Live demos](#live-demos)
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
  runtime tracks dependencies automatically — and at **path
  granularity**: reading `$user.name` subscribes to `user.name` alone,
  so a write to `$user.role` never re-renders, recomputes, or re-fires
  an effect that only read `name` (see *Fine-grained reactivity* below).
  Automatic two-way binding
  via direct state refs (and member chains rooted at one —
  `value: $form.email`), and a **`$util` runtime namespace** of pure
  helpers (`$util.filter`, `$util.sort`, `$util.find`, `$util.groupBy`,
  `$util.format`, `$util.formatDate`, `$util.plural`, `$util.case`,
  `$util.range`, `$util.pick`, `$util.omit`, `$util.merge`,
  `$util.cloneDeep`, `$util.chunk`, `$util.partition`, `$util.keyBy`, …)
  callable from Aktion expressions and ordinary JavaScript alike.
- **One component-call shape.** Every call follows the trailing-object
  rule — `Component(positionalArg, { prop: value, … })`. At most one
  positional argument; every other argument goes in a trailing
  `{ }` object literal.
- **One HTTP primitive.** `$http({ url, method, headers, body, query, ... })`
  is the only network call. Each call is self-contained (pass a full
  absolute `url`; `GET` is the default; no host-wide defaults). It returns
  a reactive resource bag exposing
  `data | error | status | loading | headers | lastUpdated`, plus the
  callables `refetch()` and `cancel()`. Re-run a request via `refetch()`
  or by wrapping it in an `$effect(..., [$dep])`.
- **`$storage` and `$console` globals.** Always in scope, no import,
  lowercase. `$storage.set/get` (localStorage by default),
  `$storage.session.*`, `$storage.cookies.*` with object-literal options,
  and `console.log/error/warn/info/debug`.
- **`$toast` — imperative notifications.** A reserved namespace that owns the
  toast lifecycle so you never hand-manage a `$toasts = [...]` array.
  `$toast.show(message, { tone?, title?, duration? })` (auto-dismisses after
  `duration` ms, default `4000`; `0` keeps it), plus shortcuts
  `$toast.success/.error/.info/.warning`, `$toast.dismiss(id)`, and
  `$toast.clear()`. Toasts **render themselves** (stacked top-right) — no
  `Toasts(...)` to wire into `$app`. For custom placement, render the reactive
  `$toast.items` list yourself with `Toasts`/`Toast` (which opts out of the
  auto-rendered layer).
- **`$form({ values, rules, onSubmit })` — the form engine.** Managed
  reactive form with per-field `$util.rules` validators (including async
  ones via `$util.rules.asyncCustom` — think server-side uniqueness checks),
  touched/dirty tracking, and `form.submit()` (alias `handleSubmit()`) that
  validates — awaiting async rules — then calls `onSubmit`. Access
  `form.values.field` (two-way bindable), `form.errors.field`,
  `form.touched.field`, `form.dirty` (flips on the first edit, even via
  two-way binding; clears on reset), `form.valid`, `form.submitting`
  (stays `true` until an async `onSubmit` settles), `form.validating`
  (async rules in flight), and call `form.setField()`, `form.touch()`,
  `form.reset()`. `Input`/`TextArea`/`Select`/`NumberInput` accept
  `onBlur`/`onFocus`, so validate-on-blur is one prop:
  `Input("email", { value: form.values.email, onBlur: () => form.touch("email") })`.
- **`$store` persistence + undo/redo.** Add `persist: "key"` to mirror the
  store to `localStorage` (or `persistIn: "session"` for `sessionStorage`) — hydrates on mount. Add `history: true` (or a depth number) for full undo/redo: `store.undo()` / `store.redo()` / `store.canUndo` / `store.canRedo`.
- **Universal `sx` / `animate` styling channel.** Every component accepts a
  token-aware `sx` object — spacing (`p px py pt…`, logical `ps pe ms me`;
  `px`/`mx` emit `padding-inline`/`margin-inline` so RTL apps mirror
  automatically), sizing (`w h minW maxW…`), color (`bg color borderColor`,
  gradient refs like `"gradient.brand"`), surface (`border radius shadow
  opacity backdrop`), background imagery (`bgImage` + `bgOverlay` wash +
  `bgSize`), typography (`fontSize weight textDecoration textAlign`),
  flex/grid (`display direction align justify wrap grow shrink basis
  columns`), position/layering (`position top right bottom left inset
  zIndex` — layer tokens resolve through themeable `--rui-z-*` vars), and
  interaction `states: { hover|focus|active|disabled|… }` compiled to
  scoped CSS rules — plus `animate: "fade-up"` motion presets. Any value
  accepts a `{ base, sm, md, lg, xl }` map that resolves to real `@media`
  breakpoints. No stylesheet required.
- **60+ new components** since v0.4: marketing bands (`Section`, `Split`,
  `Bento`), motion (`Reveal`, `Transition`, `FlipList`, `Parallax`),
  accessibility primitives (`VisuallyHidden`, `SkipLink`, `LiveRegion`,
  `FocusTrap`), realtime (`TypingIndicator`, `PresenceAvatars`,
  `ReactionPicker`, `LiveCursor`), e-commerce (`Cart`, `ProductCard`,
  `OrderSummary`), canvas (`DrawingCanvas`, `SignaturePad`), scheduling
  (`Calendar`), virtualization (`VirtualGrid`), and many more.
- **RTL + logical layout.** Set `dir="rtl"` on `<aktion-app>` and the whole
  tree flips (text direction, flex order, logical spacing). Programs need no
  code change.
- **SSR / SSG.** `renderToString(program, { path, initialState })` → `{ html, state }` for server-side rendering. `renderToStaticMarkup` for static pages.
- **DX tooling.** `tailwindToSx(classString)` maps Tailwind classes to `sx`; `htmlToAktion(html)` imports common HTML/JSX; `componentSchema()` emits a stable JSON schema for editor autocomplete; `buildGallery()` generates a self-contained component explorer; `suggestComponent("Buttn")` returns typo candidates.
- **Testing utilities.** `within(node)` for scoped queries, `axe(node)` for a11y audits from the `aktion-runtime/test` entry.
- **A React-like DOM reconciler.** Diffs each re-render against the live
  DOM. Text-input value, selection, IME state, scroll positions,
  `<details>.open`, and stateful primitives like `Tabs` are all preserved
  across renders. Components that need to hold UI state get a
  `helpers.useInstanceState(...)` slot keyed by their position in the tree.
- **A rich component library** of **275 components** spanning layout,
  forms, charts, data, feedback, navigation, patterns, app-shell composites,
  editors, advanced UI, motion, marketing, e-commerce, accessibility,
  realtime, and standard helpers. See [Component library](#component-library).
- **Declarative side effects.** `$effect(() => { body }, [...deps])` for
  background work — anonymous blocks where the dependency list mixes
  state triggers (`$atom`), lifecycle triggers (`"mount"`, `"unmount"`,
  `"every(N)"`), and rate-limit modifiers (`"debounce(N)"`,
  `"throttle(N)"`). `$effect(() => { … })` with no dependency array is
  equivalent to `$effect(() => { … }, ["mount"])`. Declare an effect
  **at the top level** for program-wide work, or **inside a component
  function body** to scope it to a single instance — timers, watched
  atoms, and `cleanup(fn)` registrations tear down when the component
  leaves the tree. `function name(args) { … }` (camelCase) declares an
  action — click-driven mutations that may optionally `return` a value.
- **Outbound events.** `$emit("name", { detail })` dispatches a
  `CustomEvent` on the host element from inside any action / effect /
  lambda body. The host listens with
  `el.addEventListener("name", …)`.
- **A built-in router.**
  `pages = $router({ "/path": Component(), "/users/:id": UserPage({ id: params.id }), default: NotFound() })`
  plus `NavLink(label, { to })` and a reserved `route` handle that
  exposes `route.path`, `route.params`, `route.query`, `route.pattern`,
  and `route.navigate("/path")`. Hash-based, framework-agnostic, always
  wired up.
- **Six built-in themes** (`light`, `dark`, `corporate`, `soft`, `glass`,
  `modern`) plus full custom-token support via CSS custom
  properties. **80+ design tokens** organised into `colors`, `radius`,
  `font`, `spacing`, `shadows`, `gradients` (referenced as
  `"gradient.brand"` from `sx`/`GradientText`), `zIndex` (layer tokens
  feeding `sx.zIndex`), and `motion` groups — plus `fonts` (Google-Fonts
  shorthand import) and `icons` (custom inline-SVG registration). Brand
  the UI from inside the script with a `$theme({...})` statement.
- **`$i18n` factory.** `const { t, setCurrentLanguage, getCurrentLanguage } = $i18n({ defaultLanguage, currentLanguage, translations })` builds a translation bundle keyed by language, with `{name}` placeholder interpolation.
- **Font Awesome 6.7.2** auto-loaded — every `icon` prop accepts a Free
  Font Awesome name (no `fa-` prefix). Use `Icon(name, { variant?, size? })`
  for standalone glyphs. Variant prefixes supported: `"regular:star"`,
  `"brands:github"`.
- **Markup escape hatches.** `HTMLTag(tag, { attributes?, children? })`
  and `Styles(css)` are the last-resort raw-HTML / raw-CSS injectors
  when no standard component captures the design.
- **Third-party widget interop.** `Mount({ setup, update?, cleanup?, props? })`
  hosts an imperative library (chart, map, editor, payment element) with a
  managed lifecycle; `WebComponent(tag, { attributes?, properties?, on? })`
  bridges native custom elements; `$script({ src, global? })` loads an external
  SDK once; and the `$dom` namespace gives auto-disposed resize / intersection /
  mutation observers + `$dom.measure(node)`.
- **Document head & SEO.** `$head({ title, meta, og, twitter, link, jsonLd })`
  is a reactive head manager — per-route titles / meta / Open Graph / JSON-LD
  that also feed `renderToString` (`head` + `headAttrs`) for crawlable SSR.
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
<aktion-app response='$app(Card([CardHeader("Hi")]))'></aktion-app>

<!-- as inner text (rendered on connect) -->
<aktion-app>
  $app(Card([CardHeader("Hi")]))
</aktion-app>

<!-- from an external file (linked with its imports) -->
<aktion-app src="./app.aktion"></aktion-app>

<!-- as a property/method -->
<script>
  const el = document.querySelector("aktion-app");
  el.setResponse(`
    $app(Column([greeting]))
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
> `$http({ url, method, body, ... })` primitive. The host is not involved.
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
| `src`           | URL to an `.aktion` file                        | Loads the program from an external file resolved relative to the document. The file is linked through the in-browser project linker, so an entry that `import`s other modules resolves and fetches its whole graph. `response` (and any inner text) takes precedence; changing `src` reloads. |
| `showerrors`    | `true` / unset                                  | If present and `true`, displays parse errors in the rendered UI. Defaults to off.   |
| `strict`        | `true` / unset                                  | Dev/strict mode. Surfaces silent failures as `console.warn`s — unknown identifiers that would resolve to `null`, and trailing `{...}` objects passed to a user component whose keys match no parameter (the silent named→positional flip). Off by default; enable while developing. |
| `router-mode`   | `hash` (default) / `history`                    | URL strategy. `history` uses the History API for clean `/about` URLs (needs an `index.html` fallback on the server); `hash` works on any static host. |
| `router-base`   | path string (e.g. `/app`)                       | Sub-directory the SPA is served under, stripped from / prepended to URLs in `history` mode. |
| `dir`           | `ltr` / `rtl` / `auto`                          | Writing direction. Reflects onto the render root so logical CSS properties, flex order, and text direction flip automatically. Programs need no code change. |
| `scroll-restoration` | `auto` / `top`                             | Opt-in scroll restoration. `auto` restores per-path scroll on back/forward and jumps to top on fresh navigation; `top` always jumps to top. |

Routing and JavaScript execution inside `effect` / action bodies are
always available — no host attribute, no allow-list. To omit those
surfaces from the *generated prompt*, build it via
`getSystemPrompt({ mode: "chat" })`.

### Properties

| Property      | Type                          | Description                                                                            |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `response`    | `string`                      | Get or set the current program text. Setter is equivalent to `setResponse(text)`.       |
| `src`         | `string \| null`              | Reflects the `src` attribute. Setting it loads (or reloads) the program from that URL.  |
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
| `registerHttpInterceptors({ onRequest?, onResponse?, onError? })` | Install interceptors for the `$http({...})` layer. `onResponse` receives a `retry()` one-shot for e.g. 401 refresh flows.       |
| `serializeState()`                                              | Return every reactive atom as a plain JSON-friendly object (for SSR / resumption).                                           |
| `hydrateState(snapshot)`                                        | Apply a snapshot to the live store and schedule a re-render. Atoms not in the snapshot are untouched.                        |
| `loadSnapshot({ programText, state })`                          | Atomic program + state load. The next render plans the program with the hydrated state already in place.                     |
| `applyDelta(ops)`                                               | Apply a structured delta (`patch` / `replace` / `append` / `new` / `delete`). User `$state` is preserved across the diff.    |

### Module exports

Beyond the element, `aktion-runtime` exports a set of standalone utilities importable from subpaths:

```ts
import { renderToString, renderToStaticMarkup } from "aktion-runtime";
// → { html, state } for SSR; renderToStaticMarkup for SSG

import { htmlToAktion, tailwindToSx, componentSchema, buildGallery, suggestComponent } from "aktion-runtime";
// htmlToAktion(html)           → Aktion program string from common HTML/JSX
// tailwindToSx("p-4 bg-white") → sx object ({ p: "m", bg: "surface", _unmapped: [...] })
// componentSchema()             → stable JSON schema for editor tooling
// buildGallery()                → self-contained HTML component explorer
// suggestComponent("Buttn")     → ["Button", ...] typo suggestions

import { render, within, axe, cleanup } from "aktion-runtime/test";
// render(program, opts) → Screen with Testing-Library-style queries + interactions
// within(node)          → scoped query set
// axe(node)             → a11y audit (returns array of violations)

import { getDiagnostics, getCompletions, formatProgram } from "aktion-runtime/language";
// DOM-free language service for editor integrations
```

### Events

| Event                | Detail                                        | When it fires                                                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `assistant-message`  | `{ message: string }`                         | When an action or lambda calls `$emit("assistant-message", { message: "..." })`. |
| `error`              | `{ errors: ParseError[] }`                    | After each render whose source had parse errors.                               |
| `route-change`       | `{ path, previousPath, source }`              | When the current hash path changes. `source` is `"init" \| "hashchange" \| "navigate" \| "external"`. |
| `<custom-name>`      | User-defined `{ ... }`                        | When script calls `$emit("name", { ... })` inside an action / effect body.       |

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
| `arrayLength`       | 100 000 entries | `$util.range(0, 1e9)`, `$util.repeat(value, 1e9)`                 |

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
  $orders = $http({ url: "https://api.example.com/orders", method: "GET" })
}

$effect(() => {
  $save = $http({ url: "https://api.example.com/draft", method: "PUT", body: $draft })
}, [$draft, "debounce(500)"])

$orders = $http({
  url:    "https://api.example.com/users/42/orders",
  method: "GET",
  query:  { limit: 5 }
})

pages = $router({
  "/":         Counter(),
  "/orders":   Async($orders, { loading: Spinner(), data: OrderTable($orders.data) }),
  default:     NotFound()
})

$app(pages)
```

### Key constructs

- `$app(…)` — the reserved entry point. Every program renders from
  it. It accepts a single root node, an array of nodes (rendered as
  siblings), or variadic nodes.
- `$name = value` — reactive state. One kind. Read or write with the
  same sigil. Inside action / effect / lambda bodies, assignment
  operators (`= += -= *= /= ??= ++ --`) are all allowed.
  `let/const/var` are optional and do not affect reactivity — only the
  `$` prefix makes a value reactive.
- **Component-call shapes** — pick ONE per call:

  ```js
  Component(positionalArg, { prop: value, … })  // canonical
  Component(arg1, arg2, arg3)                   // all-positional, signature order
  Component({ prop: value, … })                 // all-named single object
  ```

  The canonical form passes the prop tagged `(positional)` bare and every
  other prop in a trailing `{ }` object. All-positional calls bind
  arguments to the signature's props in listed order — mind that order:
  `Button("Save", "primary")` puts `"primary"` in the second slot
  (`onClick`), not `variant`, so prefer the trailing object for
  non-adjacent props. A single `{ }` argument whose keys are prop names
  is an all-named call; when the component's positional prop is itself
  object-typed, a lone object is that prop's payload instead. One object
  is never split between the two roles.
- `function Name(p = default) { return Expression }` — PascalCase name
  means it's a component. Parameters use standard JS defaults (`=`).
  Inside the body, `$x = expr` is a **declaration**: the initializer
  runs once when the instance first mounts, and re-renders preserve
  whatever value the user (or an action / effect) has written.
  **Always** end with an explicit `return`. Components do not have a
  `props` object — every parameter is a real JS parameter.
  A custom component may NOT reuse a built-in component's name (the
  validator flags it) — unless its body calls that same name, the
  supported **wrapper pattern**: inside its own body the name resolves to
  the BUILT-IN, so `function Badge(l) { return Badge(l, { tone:
  "success" }) }` extends the library Badge instead of recursing.
- `function name(args) { body }` — camelCase name means it's an action.
  Callable effects with optional `return`. Used as event handlers
  (`onClick: save`) or as expressions (`$result = greet("Ada")`). Wrap
  optimistic writes in `$optimistic(() => { … })` — it snapshots reactive
  state, runs the callback, and automatically rolls back if the callback
  throws (or the promise it returns rejects). An ordinary `$`-prefixed
  builtin call, so it works anywhere an expression does.
- `$effect(() => { body }, [...deps])` — declarative, anonymous side
  effects. The dependency array mixes state triggers (`$atom`),
  lifecycle / interval triggers (`"mount"`, `"unmount"`, `"every(N)"`),
  and rate-limit modifiers (`"debounce(N)"`, `"throttle(N)"`).
  `$effect(() => { … })` (no second argument) is equivalent to
  `$effect(() => { … }, ["mount"])`. Declare at the program top level
  for global work, or inside a component function body to scope the
  effect to that instance — the runtime mounts it on first render and
  tears down its timers / subscriptions / `cleanup(fn)` handlers when
  the instance leaves the tree.
- `$emit("name", { detail })` — dispatch an outbound `CustomEvent` on
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
- `$http({ url, method, headers, body, query, ... })` — the only network
  primitive (absolute `url`; `GET` default; no host-wide defaults).
  Returns a reactive resource with `.data`, `.error`,
  `.status`, `.loading`, `.headers`, `.lastUpdated`, `.refetch()`,
  `.cancel()`, and a settable `.onDone` callback that fires each time the
  request settles (handy for `$todos.refetch()` after a write).
- `$query({ url, key?, ttl?, refetchInterval?, refetchOnFocus?, refetchOnReconnect? })` — a **cached, deduplicated** read built on
  `$http`. Identical queries share one bag. Optional `ttl` auto-refetches stale data; `refetchInterval` (ms) polls a live feed; `refetchOnFocus` / `refetchOnReconnect` refresh on tab focus / reconnect. Add `infinite: { param, limit, mode, select }` for a paginated list — `$feed.loadMore()` appends the next page while `$feed.hasMore` is true. Pass `gql` (+ optional `variables`) to POST a GraphQL document and unwrap `.data` automatically.
- `$mutation({ url, method?, optimistic?, invalidates? })` — a **deferred** write that fires only when
  you call `.mutate(overrides?)` (not on render; `method` defaults to
  `POST`). `optimistic: (overrides) => { … }` runs synchronously before the request and auto-rolls-back if it fails; `invalidates: ["key"]` refetches matching cached queries after success. The bag exposes `.loading` / `.error` / `.data`, plus `.reset()` and a settable `.onDone`. Use `$util.invalidate(keys)` to manually trigger cache invalidation from anywhere.
- `$socket({ url, protocols?, bufferSize?, reconnect? })` — reactive **WebSocket**. Read `.status` (`"connecting" | "open" | "closed"`), `.connected`, `.last`, `.messages`, `.attempts`; call `.send(data)` (queues while connecting, flushes on open) or `.close()` (stops for good). `reconnect: true` (or a max-attempt number) retries dropped connections with exponential backoff. Auto-tears-down on re-plan.
- `$sse({ url, event?, withCredentials?, bufferSize? })` — reactive **Server-Sent Events** stream with the same `.status`/`.connected`/`.last`/`.messages`/`.close()` surface (EventSource reconnects natively).
- `pages = $router({ "/path": Component(), default: NotFound() })` —
  function-call router. The reserved `route` handle exposes the
  reactive surface (`route.path`, `route.params`, `route.query`,
  `route.pattern`) and a `route.navigate("/path")` method. Supports
  **nested layout routes** (`"/app": { layout: AppShell, routes: {...} }` —
  the shell stays mounted while only the `outlet` swaps), **navigation guards**
  (`$util.onNavigate(({ to, from }) => …)` — return `false` to block or a
  path to redirect), **query-param state** (`$util.url.setQuery("tab","v")`),
  **lazy routes** (`Lazy(() => import(…))`), and **scroll restoration**
  (set `scroll-restoration="auto"` on `<aktion-app>`).
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
  `{ ...base, k: v }`, `fn(...args)`), array / object destructuring in
  `let` / `const` / `var` (`let [a, b, ...rest] = arr`,
  `let { name, age = 0 } = user`) **including nested patterns**
  (`let { data: { items: [first] } } = resp`), destructuring in `for-of`
  heads (`for (const [k, v] of Object.entries(obj))`, `for (const { id } of
  rows)`), computed property keys (`{ [$dynamic]: value }`), prefix and postfix
  `++` / `--` (with JS-accurate return semantics), `new Constructor(...)`
  with trailing member / call chains (`new Date(0).getTime()`), trailing
  commas in function params / call args / literal lists. `async function`
  is accepted as a no-op modifier; `await` is allowed in both statement
  and expression position inside action / effect bodies.
- Equality & comparison match JavaScript — `==` / `!=` use abstract-equality
  coercion (so `x == null` matches `null` *and* `undefined`, `1 == "1"`,
  `0 == false`), while `===` / `!==` stay strict. Relational `<` / `>`
  compare alphabetic strings lexicographically (alphabetical `.sort`
  comparators work) and coerce `Date` operands via `valueOf`; two numeric
  strings still compare numerically (`"5" < "10"`).
- Top-level imperative statements — `if` / `for` / `while` / `try` and
  bare expression statements written at the program top level run once
  per plan (e.g. building a `$state` array with a `while` loop). Inside
  a render they behave like a module init block; prefer pure expressions
  (`.map`, `$util.range`) where you can.
- **`$util` runtime namespace** — pure, side-effect-free helpers for data
  shaping, formatting, dates, math, and strings (`$util.filter`, `$util.sort`,
  `$util.groupBy`, `$util.format`, `$util.formatDate`, `$util.plural`, `$util.range`,
  `$util.addDays`, `$util.pick`, `$util.omit`, `$util.merge`, `$util.cloneDeep`,
  `$util.chunk`, `$util.partition`, `$util.keyBy`, `$util.zip`, `$util.flatten`,
  `$util.count`, `$util.slugify`, `$util.truncate`, `$util.initials`, `$util.currency`,
  `$util.bytes`, `$util.relativeTime`, `$util.uuid`, `$util.copy` (async — resolves
  `true` only when the clipboard write succeeds), `$util.sleep(ms)`,
  `$util.debounceFn`, `$util.throttleFn` (leading + trailing edge), …). Never
  carry hidden state — safe to call anywhere.
  Also exposes **reactive env getters** (`$util.scroll`, `$util.viewport`,
  `$util.breakpoint`, `$util.media`, `$util.mouse`, `$util.url` — lazy listeners,
  re-render on change; `$util.url.setQuery`/`.removeQuery` write query params),
  **styling/validation sub-namespaces** (`$util.style.cx`,
  `.gradient`, `.alpha`, `.clamp`, `.token`, `.toStyle`; `$util.rules.required()`,
  `.email()`, `.min()`, `.pattern()`, `.custom()`, `.asyncCustom()` — awaited by
  `$form` —, `.validate()`, `.validateAll()`), **computed helper**
  (`$util.derived(fn)`), **side-effect hooks** (`$util.onError`, `$util.onNavigate`,
  `$util.onRequest`, `$util.onResponse`, `$util.invalidate`), and **device/platform
  helpers** (`$util.vibrate`, `.share`, `.readClipboard`, `.geolocate`, `.isOnline`,
  `.deviceType`, `.worker(pureFn)`, `.registerServiceWorker`, `.webManifest`,
  `.nativeShell`, `.isNativeApp`).
- **Escape hatches** — `HTMLTag(tag, { attributes?, children? })` for
  raw HTML elements and `Styles(css)` for raw CSS injected into the
  shadow root. Use only when the standard component library cannot
  express the design.
- **Hoisting & streaming** — references resolve from the entire
  top-level scope, not source order. Always call `$app(…)` first
  so the reconciler has the page shell to attach streamed leaves to.
- Comments: `//` line comments and `/* block */` comments — standard
  JS style.

#### Built-in globals at a glance

| Global    | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| `$storage` | Browser persistence — `$storage.set/get`, `$storage.session.*`, `$storage.cookies.*`. |
| `$console` | Forwards to the host console — `log` / `error` / `warn` / `info` / `debug`. |
| `$toast`  | Imperative notifications — `$toast.show/.success/.error/.info/.warning`, `.dismiss(id)`, `.clear()`, reactive `.items`. |
| `route`   | Reactive router handle — `path`, `params`, `query`, `pattern`, `navigate(path)`. |
| JS stdlib | The JS standard library — `Math`, `JSON`, `Object`, `Array`, `Number`, `String`, `Boolean`, `Date`, `Map`, `Set`, `RegExp`, `Promise`, plus `parseInt` / `parseFloat` / `isNaN` / `isFinite` / `encodeURIComponent` / … Use directly (`Math.max(a, b)`, `JSON.stringify(x)`, `Object.keys(o)`) or with `new` (`new Date()`, `new Map()`). |
| timers    | `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` — like their JS counterparts, but tracked by the runtime and cleared automatically on re-plan/disconnect. Use inside an `effect` and clear in `cleanup`. |
| full JS globals | The **entire** JavaScript global surface is available — dialogs (`alert`, `confirm`, `prompt`), Web APIs (`fetch`, `URL`, `URLSearchParams`, `Blob`, `FormData`, `crypto`, `navigator`, `localStorage`, `atob`/`btoa`, `Intl`, `BigInt`, `Reflect`, …), and `window` / `document` themselves. Any `globalThis` member resolves by name. |

Both `$storage` and `$console` are **lowercase**; the `route` handle is
**reserved** (never declare a state slot named `route`). Author declarations
and built-in components always win over a same-named global (a library
`Text` / `Map` component is never shadowed by the DOM `Text` / `Map`), so the
global passthrough only resolves names you haven't otherwise defined. For
reactive data prefer `$http({...})` over raw `fetch`, and timers/listeners
belong inside an `$effect(...)` so they're cleaned up on unmount.

### The 60-second pitch

```js
$days = "7"
$data = $http({ url: "https://api.example.com/metrics", method: "GET", query: { days: $days } })

filter = FormControl("Range", { control: Select("days", {
  items: [SelectItem("7", "7d"), SelectItem("30", "30d")],
  value: $days
}) })
kpi    = StatCard("Events", { value: `${$data.data?.events ?? 0}`, trend: "up" })
chart  = LineChart({
  labels: $data.data?.daily?.day ?? [],
  series: [Series("Events", $data.data?.daily?.events ?? [])]
})

$app(Column([CardHeader("Analytics"), filter, kpi, chart]))
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
  `Grid(items, { columns: { sm: 1, md: 2, lg: 4 }, gap: "lg" })`.
- Forward references are allowed — call `$app(Column([...]))` first
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
  $todos = $util.filter($todos, "id", "!=", id)
}

row = t => Card([Stack([
  Text(t.text),
  Button("Delete", { onClick: () => remove(t.id), variant: "ghost" })
])])

list  = $todos.map(t => row(t))
$app(Stack([
  Input("draft-input", { placeholder: "What needs doing?", value: $draft }),
  Button("Add", { onClick: add, variant: "primary" }),
  list
]))
```

### Fine-grained reactivity

Dependencies are tracked at the **path** you read, not the whole atom.
Reading `$user.name` subscribes to `user.name` — so a write to a
**sibling** field leaves that reader untouched, while replacing the whole
atom (an ancestor) or writing a descendant still wakes it. This is the
auto-tracking of MobX, the path-granularity of Solid, and the
"recompute-only-on-input-change" of Redux selectors — with no selectors
or special syntax. You just read the path.

```js
$user = { name: "Ada", role: "Engineer" }

// Reads `user.name` → depends on `user.name` only.
greeting = Text(`Hi ${$user.name}`)

// Writing the sibling `role` does NOT re-render `greeting`, recompute a
// `$user.name`-derived value, or fire a `[$user.name]` effect.
function promote() { $user.role = "Manager" }   // greeting stays put
function rename(next) { $user.name = next }      // greeting updates
```

The rule that keeps it predictable:

| You read… | You depend on… |
| --- | --- |
| `$user` | `user` (the whole atom) |
| `$user.name` | `user.name` |
| `$user.address.city` | `user.address.city` |
| `$rows[i]` / `$rows.name` (array index / pluck) | `rows` (the array) |
| `$obj[$key]` (dynamic key) | `obj` + whatever `$key` reads |

A change to path **C** wakes a dependency on path **D** exactly when one
is a prefix of the other (equal, ancestor, or descendant) — sibling paths
never interfere. Object fields are tracked field-by-field; reading into an
array (or through a dynamic key) subscribes at the array/container, so
mutating any element re-renders the list. The same model powers the four
places work is triggered: **render scheduling** (the app re-renders only
when a changed path overlaps what it displayed), **computed values**
(`$total = $util.sum($cart.lines)` recomputes only when `cart.lines`
changes), **effects** (`$effect(..., [$user.name])`), and **per-component
re-rendering** (below).

#### Per-component re-rendering

A component only re-executes when **its own inputs change** — its args
(props) or a `$state` path its body read. This is the granularity of
`React.memo` / Solid, but automatic: no `memo()` wrapper. If `$user.age`
changes, a `ShowName($user.name)` that only read `name` is skipped (its
body — and any `console.log` in it — doesn't run); only the components that
actually depend on `age` re-execute.

```js
function App() {
  $user = { name: "Ada", age: 30 }
  return [ShowName($user.name), ShowAge($user.age)]   // siblings, independent
}
// Changing $user.age re-runs ShowAge only; ShowName is reused (memoized).
```

Args are compared shallowly (`Object.is`), so — exactly as in React —
passing a **fresh inline lambda** each render (`onClick: () => …`) makes the
receiving component re-render every time; hoist the handler to a stable
binding if you want it skipped. State changes the path-tracker can't see
(hook setters, timers, HTTP, effects) fall back to a full re-render.

> Granularity is at both the *subscription* and *component* level. When a
> component does re-execute, Aktion rebuilds its render tree and the morph
> reconciler patches only the DOM that actually differs.

> [!IMPORTANT]
> **Path-tracking applies to `$name = value` atoms only.** The other state
> sources — the `$state` / `$memo` / `$ref` / `$reducer` hook setters, `$http`
> / `$query` / `$mutation` lifecycle changes, `setTimeout` / `setInterval`
> ticks, `$effect` writes, and `$emit` — cannot be path-tracked, so each of
> them triggers a **full re-render** (the morph reconciler still patches only
> the changed DOM, but every component body re-executes). This is the single
> most important performance characteristic to internalise: a hook-heavy
> component tree loses the fine-grained skipping you get from plain atoms.
> Prefer top-level `$name = value` atoms for app state on the hot path, and
> reach for hooks when you specifically need per-instance isolation, accepting
> the full-re-render cost. See the "Reactivity" section of
> [`coding-gen-skill.md`](./coding-gen-skill.md) for the full model.

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
$app(Stack([Counter("A"), Counter("B")]))
```

Every call site accepts a universal `key` named argument. The renderer
uses it as the instance suffix instead of source location, so reordering
siblings keeps per-instance state attached to the right element:

```js
function TaskRow(task) {
  return Stack([Text(task.title)], { key: task.id })
}
```

### Hooks — `$state`, `$memo`, `$ref`, `$reducer`, `$id`, and custom `$name`

A function whose name starts with `$` is a **hook**, mirroring React's
`use*` convention. Hooks are the composable way to manage per-instance
state. The built-in hooks mirror their React counterparts one-to-one:

| Hook | React equivalent | Returns |
| --- | --- | --- |
| `$state(initial)` | `useState` | `[value, setValue]` |
| `$memo(() => v, [deps])` | `useMemo` | cached value |
| `$ref(initial)` | `useRef` | stable `{ current }` box (writes don't re-render) |
| `$reducer((state, action) => next, initial)` | `useReducer` | `[state, dispatch]` |
| `$id(prefix?)` | `useId` | stable unique id per instance |

`$state` and `$memo` are the everyday pair:

```js
function Counter() {
  const [count, setCount] = $state(0)
  const label = $memo(() => `Count: ${count}`, [count])
  return Stack([
    Text(label),
    Button("+1", { onClick: () => setCount(c => c + 1) })
  ])
}

$app(Counter())
```

- `$state(initial)` returns a `[value, setValue]` pair. `setValue(next)`
  replaces the value; `setValue(prev => next)` derives it from the
  previous value. The initializer is evaluated once, on first render.
- `$memo(() => compute, [deps])` returns a cached value and recomputes
  only when a dependency changes (shallow `Object.is` compare). Omit the
  deps array to recompute every render.
- `$ref(initial)` returns a stable mutable `{ current }` box whose identity
  persists across renders. Writing `ref.current = …` does **not** schedule
  a re-render — the escape hatch for holding a DOM node, a timer id, or a
  previous value. Pair it with `OnMount(child, { onMount: node => ref.current = node })`
  to grab a rendered DOM node.
- `$reducer((state, action) => next, initial)` returns `[state, dispatch]`.
  `dispatch(action)` runs the reducer and re-renders when the result
  changes — the clean way to manage many related state transitions.
- `$id(prefix?)` returns a stable, unique string id for the instance's
  lifetime — for wiring `for` / `id` / `aria-labelledby` pairs without
  hard-coding ids that collide across multiple instances.

Declare your own hooks with `function $name(...)`. A custom hook's
body runs **inline in the calling component's hook scope**, so its
`$state` / `$memo` calls attach to that component — exactly how a React
custom hook shares its caller's slots:

```js
function $useCounter(start) {
  const [count, setCount] = $state(start)
  return { count: count, increment: () => setCount(c => c + 1) }
}

function Counter(label) {
  const c = $useCounter(0)
  return Stack([Text(`${label}: ${c.count}`), Button("+1", { onClick: c.increment })])
}
```

Two rules, both inherited from React: call hooks **unconditionally and in
a stable order** at the top level of a component / hook body (slots are
matched by call order across renders), and remember that hook state
**resets when the instance leaves the tree** — a remounted component
starts again from its initial value. `$state`, `$memo`, `$ref`,
`$reducer`, and `$id` are reserved
names. The lighter `$name = value` per-instance form above remains
available when an atom is written directly by the component's actions.

### Global stores — `$store({...})`

For state shared across components — the role Redux / Zustand / Pinia play
elsewhere — declare a **store**. Non-function entries are reactive state;
function entries are methods that receive the store handle `s` first. Read
state with `store.field` (fine-grained), call methods with
`store.method(args)`, and mutate inside a method with `s.field = …`. The
handle is an app-global singleton with reference-stable methods, so any
component reads it or calls its actions directly — no prop drilling.

```js
cart = $store({
  items: [],                                          // state
  count: (s) => s.items.length,                       // getter → cart.count()
  total: (s) => $util.sum(s.items.map(i => i.price)),  // getter → cart.total()
  add: (s, item) => { s.items = [...s.items, item] }, // action → cart.add(item)
  clear: (s) => { s.items = [] },
})

// Siblings with no relationship both talk to the same cart.
function AddLatte() { return Button("Add", { onClick: () => cart.add({ price: 4.5 }) }) }
function MiniCart() { return Text(`${cart.count()} items — ${$util.format(cart.total(), "currency")}`) }
$app(Column([AddLatte(), MiniCart()]))
```

Reads are fine-grained and per-component (changing `cart.items` re-renders
only components that read it), and store fields support two-way binding
(`Input(value: form.draft)`). Use a `$store` for shared state; use a
component's local `$state` / `$name = value` for state one component owns.
See the [Global state guide](https://asfand-dev.github.io/aktion/stores.html).

**Persistence.** Add `persist: "key"` and the store's data round-trips to `localStorage` on every change and hydrates on mount. Use `persistIn: "session"` for `sessionStorage`. `persist` and `persistIn` are config-only — they're never exposed as state fields.

**Undo/redo.** Add `history: true` (or a depth cap) and the store records per-mutation snapshots. `store.undo()` / `store.redo()` / `store.clearHistory()` plus reactive `store.canUndo` / `store.canRedo` for wiring button `disabled` states.

```js
doc = $store({
  persist: "my-doc",   // survives reload
  history: 25,         // undo/redo up to 25 steps
  title: "Untitled",
  setTitle: (s, v) => { s.title = v }
})
// doc.undo() / doc.redo() / doc.canUndo / doc.canRedo
```

### Component-scoped effects

`$effect(() => { … }, [...deps])` blocks can live at the program top level
**or** inside a component function body. Inside a component body the
runtime mounts the effect when the instance first renders and tears it
down (clearing timers, unsubscribing watched atoms, firing every
registered `cleanup(fn)`) the moment the instance disappears from the
tree. Two `LiveClock()` calls produce two independent intervals — and
removing one stops only that one:

```js
$app(Stack([LiveClock("UTC"), LiveClock("Local")]))

function LiveClock(label) {
  $now = $util.now()
  $effect(() => {
    $now = $util.now()
  }, ["every(1000)"])
  return Stack([Text(label), Text($util.formatDate($now, "time"))])
}
```

Use a top-level `$effect(() => { … }, [...])` for global work (analytics,
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

The bundle ships **275 components** grouped by domain. Reach for **pattern composites**
(`Hero`, `PageHeader`, `Stats`, `Toolbar`, `EmptyState`, `Timeline`,
`KanbanBoard`, `DescriptionList`, `PricingTable`, …) before hand-rolling
the equivalent with `Card` + `Stack` — they're tuned to produce dense,
production-quality SaaS UI in a single line.

| Group              | Components |
| ------------------ | ---------- |
| **Layout**         | `Column`, `Row`, `Center`, `Stack`, `StackItem`, `Grid`, `GridItem`, `Container`, `Box`, `Spacer`, `Card`, `CardHeader`, `CardFooter`, `Separator`, `Tabs`, `TabItem`, `Accordion`, `AccordionItem`, `Modal`, `Drawer`, `Steps`, `AspectRatio`, `ScrollArea`, `Sticky` (with a `data-stuck` pinned hook), `ResizablePanels`, `MasonryGrid`, `Section` (page band with eyebrow/title/subtitle), `Split` (sticky two-pane), `Bento`/`BentoCell` (asymmetric grid), `Overlay`/`OverlayItem` (anchored layering), `Fragment` |
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
| **Marketing**      | `NavBar` (sticky/blur + mobile burger menu), `Brand`, `Footer`, `FooterColumn`, `LogoCloud`, `LogoChip`, `Display`, `Heading`, `Eyebrow`, `GradientText`, `CountUp`, `Metric`, `MetricStrip`, `CodeWindow`, `BrowserFrame`, `Terminal`, `Backdrop` (grid/blobs/particles), `ThemeToggle`, `Swatch`, `Prose` |
| **E-commerce**     | `ProductCard`, `PriceTag`, `QuantityStepper`, `VariantSelector`, `OrderSummary`, `Cart` |
| **Motion & gestures** | `Reveal` (scroll-triggered), `Transition` (enter/exit), `FlipList` (FLIP reorder), `RouteView` (route transitions), `Parallax`, `OnGesture` (swipe/pan/longPress/doubleTap), `Sortable`, `Draggable`, `DropZone`, `Confetti`, `Lottie` |
| **Overlays**       | `Sheet`, `BottomSheet`, `ConfirmDialog` — all with Escape-to-close, a Tab focus trap, and focus restore |
| **Content & docs** | `TableOfContents`, `ReadingProgress`, `ScrollSpy`, `AuthorByline`, `ShareButtons`, `RelativeTime`, `CopyButton`, `KbdShortcut`, `QRCode`, `Svg` (sanitised inline SVG) |
| **Realtime & social** | `TypingIndicator`, `PresenceAvatars`, `ReactionPicker`, `LiveCursor`, `TabBar` (mobile bottom nav) |
| **Scheduling**     | `Calendar` (month grid with arrow-key navigation, event chips/dots), `CountdownTimer` |
| **Canvas**         | `DrawingCanvas`, `SignaturePad` |
| **Accessibility**  | `VisuallyHidden`, `SkipLink`, `LiveRegion`, `FocusTrap` |
| **Utility**        | `SegmentedControl`, `FloatingActionButton`, `SpeedDial`, `BackToTop`, `VirtualGrid` (windowed 2-D grid) |
| **Helpers**        | `Async`, `Show`, `Portal`, `Redirect`, `Lazy`, `ErrorBoundary` |
| **Behaviour wrappers** | `OnClick`, `OnMouse`, `OnKeyboard`, `OnFocus`, `OnIntersect`, `OnMount`, `Css`, `Link` — attach click / mouse / keyboard / focus / intersection / lifecycle listeners or raw class / style to ANY component without it needing a dedicated prop. `OnMount(child, { onMount, onUnmount })` is the DOM-ref escape hatch — `onMount(node)` fires once after attach so you can measure, focus, or hand the node to an imperative library. `Link(label_or_child, { to?, href?, external? })` wraps either a string or a component as a router-aware anchor. |
| **Interop**        | `Mount`, `WebComponent` — host an imperative / third-party widget (chart, map, editor, payment element) that owns its own DOM. `Mount({ setup, update?, cleanup?, props?, tag?, sx? })` gives a managed `setup → update → cleanup` lifecycle; `WebComponent(tag, { attributes?, properties?, on? })` renders + hydrates any native custom element with reactive attributes / events. Pair with the `$script({ src, global? })` loader and the `$dom` observer namespace — see [interop.html](https://asfand-dev.github.io/aktion/interop.html). |
| **Escape hatches** | `HTMLTag`, `Styles` (last-resort raw HTML / CSS — see [language.html](https://asfand-dev.github.io/aktion/language.html#escape-hatches)) |
| **Theming**        | `$theme` |
| **Routing**        | `$router({ … })`, `NavLink` |

### Form `onChange` callback

Every input component accepts an optional `onChange(value)` callable
that fires with the freshly-read value on every change. Use it alongside
(or instead of) `$variable` two-way binding when you need to react
beyond a state write (debounce a search, persist a setting, kick off
a fetch).

```js
Input("query", { onChange: q => $results = $http({ url: `https://api.example.com/search?q=${q}` }) })
Slider("vol", { min: 0, max: 100, value: $vol, onChange: v => $storage.set("volume", v) })
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
function export_q3() { $exp = $http({ url: "https://api.example.com/exports/q3", method: "POST" }) }
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

$app(Column([dashHeader, kpis, board, follow]))
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

Six themes are built in. Pick one with `theme="..."` or pass a custom token map.

| Theme        | Vibe                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `light`      | Crisp default, indigo accent.                                                                     |
| `dark`       | Standard dark surface, indigo accent.                                                             |
| `corporate`  | Enterprise cloud-console aesthetic — deep navy primary, cyan accents, calm pale blue bg.          |
| `soft`       | Soft, friendly, light & rounded. Lavender + mint palette, generous radii, gentle shadows.         |
| `glass`      | Light glassmorphism — frosted white surfaces over an airy pastel gradient, warm coral accent.     |
| `modern`     | Clean modern SaaS dashboard — light, generous rounding, ink primary with pill buttons, soft shadows, vibrant charts. |

### Token groups

Themes are flat maps of CSS-valued strings, grouped by domain:

| Group        | Sample tokens                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface      | `colorBg`, `colorBgSubtle`, `colorSurface`, `colorSurfaceMuted`, `colorBorder`, `colorText`, `colorTextMuted`                                                                       |
| Brand        | `colorPrimary`, `colorPrimaryHover`, `colorPrimaryText`, `colorAccent`, `colorAccentHover`, `colorFocusRing`                                                                        |
| Semantic     | `colorSuccess`, `colorWarning`, `colorDanger`, `colorInfo`                                                                                                                          |
| Typography   | `fontFamily`, `fontFamilyHeading`, `fontFamilyMono`, `fontSizeBase`, `fontSizeHeading`, `fontSizeTitle`, `fontWeightBody`, `fontWeightHeading`, `letterSpacingHeading`, `headingTextTransform` |
| Shape        | `radiusXs`, `radiusSm`, `radiusMd`, `radiusLg`, `radiusPill`, `radiusButton`, `radiusInput`, `borderWidth`, `shadowSm`, `shadowMd`, `shadowLg`                                       |
| Spacing      | `spacingXs`, `spacingS`, `spacingM`, `spacingL`, `spacingXl`, `spacing2xl`, `spacing3xl`                                                                                            |
| Gradients    | `gradientBrand`, `gradientAccent`, `gradientWarm`, `gradientCool`, `gradientSuccess`, `gradientDanger` — referenced as `"gradient.brand"` from `sx`, `GradientText`, `fill` props    |
| Buttons      | `buttonFontWeight`, `buttonTextTransform`, `buttonLetterSpacing`, `buttonPaddingY`, `buttonPaddingX`                                                                                |
| Motion       | `transitionDuration`, `motionFast`, `motionBase`, `motionSlow`, `motionEase` (optional — set via `$theme({ motion: {...} })`)                                                       |
| Layers       | `zBase`, `zRaised`, `zDropdown`, `zSticky`, `zBanner`, `zOverlay`, `zModal`, `zPopover`, `zToast`, `zTooltip` (optional — set via `$theme({ zIndex: {...} })`; consumed by `sx.zIndex` tokens) |
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

### `$theme({...})` from inside a response

A response can brand itself with a `$theme({...})` statement. The tokens land on the host as CSS variables on top
of the base theme.

```js
$theme({
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

$app(Column([CardHeader("GitHub-style page"), Buttons([Button("New repository")])]))
```

`$theme` expects the **structured** form — top-level token groups
(`colors`, `radius`, `font`, `spacing`, `shadows`, `gradients`,
`zIndex`, `motion`, `fonts`, `icons`) plus metadata keys `name` and
`direction`. Removing the `$theme(...)` line snaps the UI back to
the base theme. Unknown keys are ignored silently, so typos in an
LLM-emitted token map can never break the page.

**Full property list** (all optional; token values are strings — bare
numbers are coerced):

| Key         | Type                | Notes                                                                                                                                                                                              |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`      | `string`            | Selects a built-in theme as the base palette (`"dark"`, `"corporate"`, `"soft"`, `"glass"`, `"modern"`); structured overrides layer on top. Unknown names are ignored.                |
| `direction` | `"ltr"` \| `"rtl"`  | Reading direction. Metadata only — not applied as a token.                                                                                                                                        |
| `colors`    | `{ [key]: string }` | CSS color strings. Keys: `bg`, `bgSubtle`, `surface`, `surfaceMuted`, `border`, `borderSubtle`, `text`, `textMuted`, `primary`, `primaryHover`, `primaryText`, `accent`, `accentHover`, `accentText`, `focusRing`, `success`, `warning`, `danger`, `info`. |
| `radius`    | `{ [key]: string }` | CSS length strings. Keys: `xs`, `sm`, `md`, `lg`, `pill`, `button`, `input`.                                                                                                                       |
| `font`      | `{ [key]: string }` | CSS strings. Keys: `family`, `familyHeading`, `familyMono`, `sizeBase`, `sizeSm`, `sizeLg`, `sizeHeading`, `sizeTitle`, `weightBody`, `weightHeading`. Also accepts `import` for web fonts (see `fonts`). |
| `spacing`   | `{ [key]: string }` | CSS length strings. Keys: `xs`, `s`, `m`, `l`, `xl`, `2xl`, `3xl`.                                                                                                                                 |
| `shadows`   | `{ [key]: string }` | CSS shadow strings. Keys: `sm`, `md`, `lg`.                                                                                                                                                        |
| `gradients` | `object`            | Named gradients. Keys: `brand`, `accent`, `warm`, `cool`, `success`, `danger`. Values: color-stop arrays (`["#6366f1", "#ec4899"]`), `{ stops, angle? }`, or a safe gradient string.               |
| `zIndex`    | `object`            | Layer tokens (numbers OK). Keys: `base`, `raised`, `dropdown`, `sticky`, `banner`, `overlay`, `modal`, `popover`, `toast`, `tooltip`.                                                              |
| `motion`    | `{ [key]: string }` | Motion tokens. Keys: `fast`, `base`, `slow`, `ease`.                                                                                                                                               |
| `fonts`     | `object`            | Web-font loader: `{ import: ["Inter:400,700"] }` (Google Fonts shorthand).                                                                                                                         |
| `icons`     | `object`            | Custom inline-SVG icons: `{ logo: "<path …/>" }` — usable anywhere a Font Awesome name works.                                                                                                      |

Tokens outside these groups (line-height, letter-spacing, heading
text-transform, border width, button styling, chart series, transition
duration) are base-theme-only — set them from the host via
`el.setTheme(...)` or CSS variables, not `$theme({...})`.

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
$app(Stack([brandIcon, kpis, profileTab]))
```

---

## Routing

Hash-based routing is built into the runtime. The LLM emits routes that
stay in sync with the URL (`#/dashboard`, `#/users/42`). Browser
back/forward, bookmarks, and deep links all work — and the host page
never reloads.

Routing defaults to **hash mode**, which works on any static host with no
server configuration. To opt into clean History-API URLs (`/dashboard`
instead of `#/dashboard`), set `router-mode="history"` on the element (and
`router-base` if the app is served under a sub-directory). History mode
requires the server to fall back to `index.html` for unknown paths:

```html
<aktion-app router-mode="history" router-base="/app"></aktion-app>
```

```js
pages = $router({
  "/":          homePage,
  "/dashboard": dashboardPage,
  "/users/:id": userPage({ id: params.id }),
  default:      notFoundPage
})

nav = Row([
  NavLink("Home",      { to: "/", exact: true }),
  NavLink("Dashboard", { to: "/dashboard" }),
  NavLink("Users",     { to: "/users" })
], { gap: "sm" })

$app(Stack([nav, pages]))

homePage      = Card([CardHeader("Welcome")])
dashboardPage = Card([CardHeader("Dashboard")])
userPage      = (id) => Card([CardHeader(`User ${id}`)])
notFoundPage  = Callout("Not found", { description: `We couldn't find ${route.path}.`, variant: "warning" })
```

- `pages = $router({ "/path": Component(), default: Fallback() })` picks
  the matching arm based on the current hash path. First match wins;
  `default:` is the fallback.
- Route patterns support literal segments (`"/about"`), parameter
  segments (`"/users/:id"` → `params.id`), and trailing wildcards
  (`"/docs/*"` → `params._`).
- **Nested layout routes** — an arm shaped `{ layout, routes }` matches as
  a path *prefix*: the shell stays mounted while the matched child binds to
  the `outlet` identifier inside the layout (params merge parent + child;
  layouts compose).
- **Navigation guards** — `$util.onNavigate(({ to, from }) => …)`: return
  `false` to block, a path string to redirect (`"/login"`), anything else
  to allow. Enforced for in-app navigation, browser back/forward, and
  manual URL edits.
- **Query-param state** — `$util.url.setQuery("sort", v)` /
  `.removeQuery("sort")` write the URL query in place (shareable filters /
  tabs); read back reactively via `$util.url.query` or `route.query`.
- **Scroll restoration** — set `scroll-restoration="auto"` on
  `<aktion-app>` to restore per-path scroll on back/forward (`"top"`
  always jumps to top). **Route transitions** — wrap the outlet in
  `RouteView(pages, { routeKey: route.path, animation: "fade" })` to
  replay an entrance animation on navigation. **Prefetch** —
  `NavLink(..., { prefetch: () => $query({...}) })` warms a query cache on
  first hover/focus.
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
// localStorage is the default; `$storage.local` is its alias.
$storage.set("name", "John")
$name = $storage.get("name")

// Per-tab sessionStorage.
$storage.session.set("draft", $draft)
$draft = $storage.session.get("draft")

// Cookies — options as an object literal.
$storage.cookies.set("user", "John", { expires: 7, path: "/", sameSite: "Lax" })
$user = $storage.cookies.get("user")
$storage.cookies.remove("user", { path: "/" })

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

Call `$i18n({...})` to build a translation bundle. You can destructure
`t`, `setCurrentLanguage`, and `getCurrentLanguage`, or keep the result
as an instance and call its methods.

```js
const { t, setCurrentLanguage, getCurrentLanguage } = $i18n({
  defaultLanguage: "en",
  currentLanguage: "fr",
  translations: {
    greeting:    { en: "Hello, {name}!",   fr: "Bonjour, {name}!"   },
    orders_title:{ en: "Recent orders",    fr: "Commandes récentes" },
    items_count: { en: "{count} items",    fr: "{count} objets"     }
  }
})

welcome      = Text(t("greeting", { name: $user.name }))
sectionTitle = SectionHeader(t("orders_title"))
count        = Text(t("items_count", { count: 5 }))
```

Lookups resolve `translations[key][currentLanguage]`, fall back to
`translations[key][defaultLanguage]`, then to the bare key as a literal
string. Variables are interpolated using `{name}` placeholders.

For reactive language switching, drive `currentLanguage` from a state
atom and either call `setCurrentLanguage(...)` or rebuild the bundle:

```js
$lang = "fr"
const i18nInstance = $i18n({
  defaultLanguage: "en",
  currentLanguage: $lang,
  translations: { hi: { en: "Hi", fr: "Salut", de: "Hallo" } }
})
$app(Column([
  Text(i18nInstance.t("hi")),
  Button("Deutsch", { onClick: () => { $lang = "de" } })
]))
```

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
  uses them under the hood. `getCompletions` is **scope-aware**: alongside
  the library + reserved words it surfaces the symbols declared in the
  current document — your own reactive atoms, components, and actions. It is
  also **member-aware**: after a `.` it completes (and hovers / typechecks the
  signature of) every namespace member — `$util.*` (incl. nested `$util.style`
  / `$util.rules` / `$util.url`), `$storage.*`, `$console.*`, `$toast.*`, the
  `route` handle, and the resource bag a factory builtin returns (`$http`,
  `$query`, `$mutation`, `$socket`, `$sse`, `$form`, `$store`). Inside a
  config-taking builtin's object (`$http({ … })`, `$theme({ … })`, …) it
  completes and hovers the accepted config keys. The member + config catalog
  ships as data (`namespaceCatalog`, `factoryResourceCatalog`,
  `findBuiltinConfig`) so any host can reuse it.

### Migration & DX tooling

The same entry exports the migration/DX suite:

| Export | What it does |
| ------ | ------------ |
| `htmlToAktion(html)` | Convert static HTML to an Aktion program — common tags map to components, `class` attributes run through `tailwindToSx` (mapped utilities become `sx`, leftovers stay under `className`), and `flex`/`flex-col` containers become `Row`/`Column`. |
| `tailwindToSx(classString)` | Map Tailwind utilities to an `sx` object — spacing/color/typography/flex/grid/radius/shadow/sizing/position/z-index/overflow, with responsive prefixes (`md:p-8`) becoming `sx` breakpoint maps and state prefixes (`hover:bg-primary`) becoming `sx.states` entries. Unrecognised classes come back under `_unmapped`. |
| `componentSchema(library)` | Stable, machine-readable JSON schema of every component (props/types/enums/flags) for editor autocomplete and release diffing. |
| `buildGallery(library)` | Self-contained HTML component explorer ("Storybook page") generated from the schema. |
| `suggestComponent(name, library)` | "Did you mean?" typo candidates by edit distance. |
| `renderToString(program, opts)` / `renderToStaticMarkup` | SSR/SSG — render a program to `{ html, state }` under any DOM (browser or Node + happy-dom/jsdom); pair with `StateStore.hydrate`. From the main entry. |
| `within(node)` / `axe(node)` | Testing helpers from `aktion-runtime/test` — scoped queries and a dependency-free a11y audit (`img-alt`, `svg-name`, `button-name`, `link-name`, `label` — with `aria-labelledby` resolution —, `duplicate-id`, `tabindex`). |

---

## Build-time compiler & multi-file modules

> **Optional.** The CDN bundle and the streamed-string path
> (`<aktion-app response="...">`, `setResponse`, `appendChunk`) work exactly as
> before. This is an opt-in enhancement for NPM consumers who author UI by hand.

Author UI in `.aktion` files that `import`/`export` from one another like JS/TS
modules, then mount the pre-parsed, linked program with
`el.mountCompiled(program)` — the runtime parser never runs in the browser. The
runtime stays fully reactive (`$state`, `$http`, effects, routing run as usual);
only parsing + linking move ahead of time.

### Multi-file modules

Named `import`/`export` with **true module scope** — a file's non-exported
top-level names are private:

```js
// src/components/counter.aktion
export $count = 0
export function Counter() { return Button(`Clicked ${$count}`, { action: bump }) }
function bump() { $count = $count + 1 }      // private to this module

// src/app.aktion  (entry — must define `aktion`)
import { Counter, $count } from "./components/counter.aktion"
aktion = Column([Markdown(`Shared count: ${$count}`), Counter()])
```

The linker merges the graph into one program, renaming each module's private
names so two files can reuse a name without clashing; the entry keeps its own
names canonical (the `aktion` binding + the `$state` names that `serializeState`
/ `applyDelta` target).

### Vite plugin

The `aktion-runtime/vite` plugin compiles `.aktion` files at build time so you
can import them directly, with HMR that preserves live `$state`:

```ts
// vite.config.ts
import aktion from "aktion-runtime/vite";
export default { plugins: [aktion()] };
```

The plugin emits a source map that carries the original `.aktion` path and its
contents (`sourcesContent`), so the file shows up in the browser's Sources
panel and runtime frames resolve to your `.aktion` module rather than the
generated JSON blob.

```jsonc
// tsconfig.json — resolve `import app from "./app.aktion"`
{ "compilerOptions": { "types": ["aktion-runtime/aktion-modules"] } }
```

```ts
import "aktion-runtime";
import app from "./app.aktion"; // a typed CompiledProgram (the linked graph)
document.querySelector("aktion-app").mountCompiled(app);
```

Scaffold a ready-made Vite + TypeScript project with **`npm create aktion@latest`**
(see [`create-aktion`](./create-aktion/)). A runnable example lives in
[`examples/vite-compiler/`](./examples/vite-compiler/).

### Link in the browser (no bundler)

The linker is browser-safe and re-exported from the package root, so a host (or
the playground) can link a project in-page from raw sources:

```ts
import { linkProject, defineCompiledProgram } from "aktion-runtime";
const { program, source } = await linkProject({
  entry: "app.aktion",
  files: { "app.aktion": "…", "components/counter.aktion": "…" },
});
el.mountCompiled(defineCompiledProgram({ __aktionCompiled: 1, program, source, path: "app.aktion" }));
```

### Editor support

The [Aktion VS Code extension](./editors/vscode/) treats `.aktion` as
TypeScript (highlighting) and layers full language intelligence on top —
semantic highlighting, inline diagnostics, hover, scope-aware completions,
signature help, **cross-file** go-to-definition (jump to an imported binding's
declaration or open the module specifier's file), find-all-references, rename,
document outline, document highlights, document formatting (format-on-save), and
snippets — all via the DOM-free `aktion-runtime/language` API. Its public
[README](./editors/vscode/README.md) covers install / use / update; the
[contributor guide](./editors/vscode/docs/README.md) covers local F5 debugging,
architecture, **and** publishing to the VS Code Marketplace + Open VSX.

### Package entry points

| Import                          | Runs in | Purpose                                                                     |
| ------------------------------- | ------- | --------------------------------------------------------------------------- |
| `aktion-runtime`                | browser | `<aktion-app>` + `mountCompiled` + the browser-safe linker (`linkProject`)  |
| `aktion-runtime/vite`           | Node    | the Vite/Rollup plugin (`aktion()`)                                         |
| `aktion-runtime/language`       | Node    | DOM-free diagnostics / hover / completions / signature help / definition / references / rename / document symbols / semantic tokens / formatting / snippets (editors, LSP) |
| `aktion-runtime/aktion-modules` | types   | ambient `*.aktion` module declarations                                      |

The plugin + language service ship as separate entries and never enter the
browser bundle, so `dist/aktion.js` is unchanged.

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
| `language.html`                     | Full Aktion language guide — the conceptual walkthrough of syntax and semantics. |
| `language-reference.html`           | Searchable reference of every language symbol — keywords, `$`-builtins & hooks, the `$util` namespace, JavaScript globals, and operators/literals, each with a one-line description and copy-paste example. Filter by category or type to jump straight to an entry. |
| `http.html`                         | HTTP guide — the `$http({...})` primitive, config options, the reactive resource bag, `Async`, refetch/cancel patterns, and a full CRUD walkthrough. |
| `sx.html`                           | The universal `sx` styling prop — a complete reference for every key (spacing, sizing, color, border, flex/grid, position, typography, effects, background images), plus responsive breakpoint maps, interaction-state styling, the sibling `animate` prop, and live mini-UI examples. |
| `components.html`                   | Every built-in component with a live preview, positional signatures, prop tables, and enum values. |
| `actions.html`                      | `function name() { … }` guide — declarative state mutations, optimistic snapshot/rollback, lambda-based click handlers, navigation, and end-to-end examples. |
| `side-effects.html`                 | `$effect(() => { … }, [...deps])` guide — anonymous side effects, dependency entries (state, lifecycle, intervals, debounce/throttle), top-level vs. component-local scope, cleanup, and effect vs. action. |
| `interop.html`                      | Third-party / imperative widget interop — `Mount` (managed setup/update/cleanup lifecycle), `WebComponent` (native custom-element bridge), the `$script` external-SDK loader, and the `$dom` observer namespace. How `data-rui-preserve` keeps a widget's DOM intact. |
| `head.html`                         | Document head & SEO — `$head({...})` for reactive title, meta, canonical/alternate links, Open Graph / Twitter cards, JSON-LD, and `<html>` attrs; per-route composition; and the SSR `head` / `headAttrs` output from `renderToString`. |
| `javascript-interactions.html`      | Effect + action bodies — the JavaScript execution surface.                               |
| `routing.html`                      | Hash-based routing guide — always available at runtime.                                 |
| `reactivity.html`                   | Reactivity & rendering deep-dive — path tracking, the two render gates, exactly what forces a full re-render, and how to stay fine-grained. |
| `performance.html`                  | Performance & optimization — re-render avoidance, memoization rules, the safety budget, bundle size, and `setResponse` vs `appendChunk`. |
| `troubleshooting.html`              | Troubleshooting / FAQ — focus loss, effects not firing, memoized-away components, the `Map` component vs JS `Map`, dropped styles, missing i18n keys. |
| `errors.html`                       | Error handling & debugging — reading parse/runtime errors, the render-loop and budget guards, the `error` event, and strict mode. |
| `typescript.html`                   | TypeScript guide — public types, subpath entry points, typing custom components/helpers/interceptors, host event payloads, a typed host-wrapper recipe. |
| `accessibility.html`                | Accessibility guide — conformance target, keyboard map, screen-reader/streaming behaviour, built-in ARIA, and theme contrast. |
| `deployment.html`                   | Production & deployment — SSR/hydration via `serializeState`, CSP and `unsafe-eval`, integrity hashes, CDN caching, edge-function LLM streaming. |
| `llm-integration.html`              | LLM integration — wiring OpenAI/Anthropic/OpenRouter/Bedrock streams into `appendChunk`, prompt selection, interceptors, the `assistant-message` round-trip. |
| `themes.html`                       | Built-in themes gallery, live picker, side-by-side compare, and the token customization studio. |
| `theme-generator.html`              | Visual theme generator — tune colors, radius, typography, spacing, shadows, and a brand gradient with a live preview, then copy a ready-to-paste `$theme({…})` statement. |
| `playground.html`                   | CodeMirror 6 editor with custom highlighting / autocomplete, live preview, share links, hover-over component info, and an inspection mode. |
| `visual-editor.html`                | Drag-and-drop visual editor for the full 170+ component library. Three canvas modes (Raw Edit / Visual Edit / Preview), an Outline tab for top-level entity navigation, typed prop editors, cross-entity selection, and import / export of `.aktion` + self-contained HTML via an editable Source drawer. |
| `chat-bot.html`                     | OpenRouter-powered streaming chat with four generation modes (Chat Compact, Chat Full, Website Builder, App Builder), image / PDF attachment support, and download-as-standalone-HTML. |
| `live-demos.html`                   | Catalog of every bundled demo program as zoomed-out live preview cards, sectioned by `docs/demos/` folder. |
| `demos/index.html`                  | Shared runner shell for the bundled demos — picks the program from the `?app=<folder>/<file>.aktion` query parameter. |

---

## Live demos

Every bundled demo is a pure `.aktion` program under `docs/demos/`,
grouped by folder:

| Folder                | What's inside                                                                  |
| --------------------- | ------------------------------------------------------------------------------ |
| `demos/mini-apps/`    | Complete interactive apps — trackers, dashboards, storefronts, live-API browsers, marketing pages. |
| `demos/blocks/`       | Single-file, drop-in functional sections (login card, pricing plans, checkout form, …). |
| `demos/components/`   | Reusable `function` component showcases grouped by type (buttons, inputs, charts, …). |
| `demos/industry-specific/` | Full per-industry surfaces with reusable building blocks (finance, healthcare, SaaS, e-commerce, AI, real estate, …). |

All programs are served by one runner shell,
`docs/demos/index.html?app=<folder>/<file>.aktion` (defaults to
`mini-apps/aktion-website.aktion`), which also offers an app picker, a
renderer-theme switcher, and a **View .aktion source** button that opens
the program in the playground editor for live editing. The folder
contents are scanned into `docs/demos/manifest.json` by
`scripts/build-docs.mjs`.

The full catalog with zoomed-out live preview cards lives at
[`docs/live-demos.html`](https://asfand-dev.github.io/aktion/live-demos.html).

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
│   │   ├── http.ts            #     $http({...}) reactive HTTP primitive + interceptors
│   │   ├── i18n.ts            #     $i18n({...}) factory — returns { t, setCurrentLanguage, getCurrentLanguage }
│   │   ├── $storage.ts         #     $storage.local / .session / .cookies bridge
│   │   ├── console.ts         #     console.* host bridge
│   │   └── router.ts          #     Hash-based router for $router({…}) calls and NavLink
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
│   └── demos/                 #   Bundled .aktion demo programs (mini-apps / blocks / components / industry-specific)
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
`$http({...})`, effects / actions, the hash-based router + `NavLink`,
theme resolution, in-script `$theme(...)` overrides, the component
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
requests issued by the LLM through `$http({...})` flow through your host's
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
trees, `$http()`, `@`-functions) keep working without `unsafe-eval`.

---

## CDN deployment

This repo serves its own bundle on GitHub Pages (see Quick start §1).
To ship your own copy, run `npm run build` and serve `dist/` from any
static host — every artifact in `dist/` is self-contained. Push to
`main` and [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
builds, tests, and publishes.

---

## Versioning & stability

See [`CHANGELOG.md`](./CHANGELOG.md) for what changed between versions and a
**Stability & versioning** matrix (which APIs are stable vs experimental, the
pre-1.0 SemVer policy, and how the generated `system_prompt.txt` is versioned).
Aktion is pre-1.0: minor versions may include behavioural changes, always
flagged in the changelog.

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
