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
- **Agent skill (deep authoring guide):** [`skills/aktion/`](./skills/aktion/)

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
- [Built-in globals (`$storage`, `$console`, `$toast`, `$util`, `$dom`)](#built-in-globals)
- [Internationalization (`$i18n`)](#internationalization)
- [System prompt generator](#system-prompt-generator)
- [Tooling](#tooling)
- [Build-time compiler & multi-file modules](#build-time-compiler--multi-file-modules)
- [Editor support](#editor-support)
- [Agent skill](#agent-skill)
- [Documentation site](#documentation-site)
- [Live demos](#live-demos)
- [Project layout](#project-layout)
- [Run it locally](#run-it-locally)
- [Security](#security)
- [CDN deployment](#cdn-deployment)
- [Versioning & stability](#versioning--stability)
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
  and `$console.log/error/warn/info/debug`.
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
  breakpoints. The same universal channel carries
  `class`/`className`, `style`, `id`, `anchor`, `aria`, `data`, `tooltip`,
  `hidden`, and two accessibility escape valves: `role` (allow-listed to 41 ARIA
  roles — landmarks, live/status, common widgets, `none`/`presentation`;
  anything else is silently dropped, because a plausible-but-wrong role is worse
  than the original defect) and `dataAttrs` (`{ testid: "row" }` →
  `data-testid`; use this spelling on the six components that declare a `data`
  prop of their own — `LineChart`, `JsonTree`, `Async`, `Draggable`, `Lottie`,
  `QRCode`). No stylesheet required.
- **Seven new components in `0.6.0`** — the framework-parity set: `Pill`,
  `CardSection`, `ActionStripe`, `ButtonGroup`, `InputGroup`, `FilterPill`,
  `LoadingDots`. See [`CHANGELOG.md`](./CHANGELOG.md) for what each one is for.
- **Breadth beyond the obvious primitives**, all long-standing: marketing bands
  (`Section`, `Split`, `Bento`), motion (`Reveal`, `Transition`, `FlipList`,
  `Parallax`), accessibility primitives (`VisuallyHidden`, `SkipLink`,
  `LiveRegion`, `FocusTrap`), realtime (`TypingIndicator`, `PresenceAvatars`,
  `ReactionPicker`, `LiveCursor`), e-commerce (`Cart`, `ProductCard`,
  `OrderSummary`), canvas (`DrawingCanvas`, `SignaturePad`), scheduling
  (`Calendar`), and virtualization (`VirtualList`, `VirtualGrid`).
- **RTL + logical layout.** Set `dir="rtl"` on `<aktion-app>` and the whole
  tree flips (text direction, flex order, logical spacing). Programs need no
  code change.
- **SSR / SSG.** `renderToString(program, { path, initialState })` → `{ html, state }` for server-side rendering. `renderToStaticMarkup` for static pages.
- **DX tooling.** `tailwindToSx(classString)` maps Tailwind classes to `sx`; `cssToSx(cssText)` and `styledToSx(template)` do the same for plain CSS and styled-components templates; `htmlToAktion(html)` imports common HTML/JSX; `componentSchema(library)` emits a stable JSON schema for editor autocomplete; `buildGallery(library)` generates a self-contained component explorer; `suggestComponent("Buttn", library)` returns typo candidates.
- **Testing utilities.** `render(program)` / `renderComponent(expression)` return a `Screen` with Testing-Library-style queries and a `screen.user` interaction driver; plus `waitFor` / `act` / `flush` for async assertions, `json(data, status?)` for mocked fetches, `within(node)` for scoped queries, and `axe(node)` for a dependency-free a11y audit — all from the `aktion-runtime/test` entry.
- **DevTools.** `aktion-runtime/devtools` ships an in-page panel: a live state inspector you can write through, the current program text, and a forced-render button. Import it once on the page and call `el.connectDevtools()` (or label an instance with `data-devtools-label`) — see [`docs/devtools.html`](./docs/devtools.html).
- **A React-like DOM reconciler.** Diffs each re-render against the live
  DOM. Text-input value, selection, IME state, scroll positions,
  `<details>.open`, and stateful primitives like `Tabs` are all preserved
  across renders. Components that need to hold UI state get a
  `helpers.useInstanceState(...)` slot keyed by their position in the tree.
- **A rich component library** of **281 components** in **17 groups** —
  Layout, Content, Forms, Data, Charts, Feedback & Media, Navigation, Chat,
  Patterns, Editors & overlays, App shell, Advanced UI, Routing, Helpers,
  Behaviour wrappers, Interop, Escape hatches. See
  [Component library](#component-library).
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
  properties. **86 design tokens** are set by every built-in theme (every
  theme spreads `light`), out of 113 declared on `ThemeTokens` — the extras
  are optional, and individual themes set a handful more. They are
  organised into `colors`, `radius`,
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
- **Host-side tooling.** A canonical formatter, an AST inspector, and a
  complete language service — diagnostics, lint warnings, hover,
  completions, signature help, definition, references, rename, document
  symbols, semantic tokens, snippets — all exported from
  `aktion-runtime/language` (the structured-edit delta protocol is applied
  via `el.applyDelta(ops)`). Three editor adapters ride on that one
  surface — see [Editor support](#editor-support).

Everything lives inside a Shadow DOM, so the renderer's styles never leak
into your application — and your application's styles never leak into the
renderer. (Style encapsulation, not a security boundary — see
[Security](#security).)

> **One embedding constraint.** Do not place `<aktion-app>` inside a host-page
> wrapper that sets `transform`, `filter`, `backdrop-filter`, `perspective`,
> `contain: paint|layout|strict|content`, or `will-change`. Such an element
> becomes the containing block for `position: fixed`, so `Modal`, `Sheet`,
> `BottomSheet`, the toast stack, `FloatingActionButton`, `Tour`, `Spotlight`,
> and `SkipLink` would be positioned against the embed box instead of the
> viewport. Anchored popups (menus, tooltips, selects) are unaffected — they use
> the browser top layer. The runtime warns once, naming the offending element
> and property.

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
npm tarball ships the compiled `dist/` output (ESM + CJS + UMD + IIFE bundles,
the `/test`, `/devtools`, `/language` and `/vite` entries, type declarations,
and the two `system_prompt*.txt` files) plus `skills/` (the
[agent skill](#agent-skill)), so installs stay small. Subpath imports are
available for convenience:

```js
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
| `strict`        | `true` / unset                                  | Dev/strict mode. Surfaces silent failures as `console.warn`s — unknown identifiers that would resolve to `null`, trailing `{...}` objects passed to a user component whose keys match no parameter (the silent named→positional flip), and attributes a handler wrote imperatively that the next commit reverted. Off by default; enable while developing. **Read at plan time** — toggling it on a mounted element takes effect on the next render, not immediately. |
| `router-mode`   | `hash` (default) / `history`                    | URL strategy. `history` uses the History API for clean `/about` URLs (needs an `index.html` fallback on the server); `hash` works on any static host. Read once on connect. |
| `router-base`   | path string (e.g. `/app`)                       | Sub-directory the SPA is served under, stripped from / prepended to URLs in `history` mode. Read once on connect. |
| `dir`           | `ltr` / `rtl` / `auto`                          | Writing direction. Reflects onto the render root so logical CSS properties, flex order, and text direction flip automatically. Programs need no code change. |
| `scroll-restoration` | `auto` / `top`                             | Opt-in scroll restoration. `auto` restores per-path scroll on back/forward and jumps to top on fresh navigation; `top` always jumps to top. Read once on connect. |
| `margin`        | number or CSS length                            | Outer spacing around the rendered app shell, reflected as `--rui-app-margin` on the render root. A bare number is px (`margin="12"` → `12px`); `px` / `rem` / `em` / `vh` / `vw` / `vmin` / `vmax` / `%` pass through. Defaults to `20px`; `margin="0"` lets the shell touch its container's edges, and a malformed value clears the override. |

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
| `mountCompiled(program, state?)`                                | Mount a pre-parsed, pre-linked `CompiledProgram` from the Vite plugin or `linkProject` — the browser parser never runs.       |
| `loadFromSrc(url)`                                              | Fetch and link the program at `url` (the imperative form of the `src` attribute); resolves the whole import graph.            |
| `setTheme(name \| tokens)`                                      | Apply a built-in theme by name or a partial token map.                                                                       |
| `registerComponents(specs, root?)`                              | Extend the built-in library with your own components.                                                                        |
| `registerIcons(icons)`                                          | Register custom inline-SVG icons (`{ logo: "<path …/>" }`), usable anywhere a Font Awesome name works. Markup runs through the SVG allow-list. |
| `getSystemPrompt(options?)`                                     | Build a system prompt that matches the current library. Pass `{ mode: "chat" }` for the compact variant.                     |
| `navigate(path)`                                                | Programmatically navigate. Updates `window.location.hash`.                                                                   |
| `registerHttpInterceptors({ onRequest?, onResponse?, onError? })` | Install interceptors for the `$http({...})` layer. `onResponse` receives a `retry()` one-shot for e.g. 401 refresh flows.       |
| `serializeState()`                                              | Return every reactive atom as a plain JSON-friendly object (for SSR / resumption).                                           |
| `hydrateState(snapshot)`                                        | Apply a snapshot to the live store and schedule a re-render. Atoms not in the snapshot are untouched.                        |
| `loadSnapshot({ programText, state })`                          | Atomic program + state load. The next render plans the program with the hydrated state already in place.                     |
| `applyDelta(ops)`                                               | Apply a structured delta (`patch` / `replace` / `append` / `new` / `delete`). User `$state` is preserved across the diff.    |
| `connectDevtools()`                                             | Attach this instance to the Aktion DevTools panel (`aktion-runtime/devtools`). Idempotent; label the instance with `data-devtools-label`. |

### Module exports

Beyond the element, `aktion-runtime` exports a set of standalone utilities importable from subpaths:

```ts
import { renderToString, renderToStaticMarkup } from "aktion-runtime";
// → { html, state } for SSR; renderToStaticMarkup for SSG

import {
  htmlToAktion, tailwindToSx, cssToSx, styledToSx,
  componentSchema, buildGallery, suggestComponent, defaultLibrary,
} from "aktion-runtime";
// htmlToAktion(html)                     → Aktion program string from common HTML/JSX
// tailwindToSx("p-4 bg-white")           → sx object ({ p: "m", bg: "surface", _unmapped: [...] })
// cssToSx("padding:16px;color:#111")     → sx object from a plain CSS declaration list
// styledToSx(template)                   → sx object from a styled-components template
// componentSchema(defaultLibrary)        → stable JSON schema for editor tooling
// buildGallery(defaultLibrary)           → self-contained HTML component explorer
// suggestComponent("Buttn", defaultLibrary) → ["Button", ...] typo suggestions

import { setGlobalAccessPolicy } from "aktion-runtime";
// Narrow what a program may reach in the host realm — see Security below

import {
  render, renderComponent, within, axe, waitFor, act, flush, json, cleanup,
} from "aktion-runtime/test";
// render(program, opts)            → Screen: queries, `screen.user` interactions, `screen.state`
// renderComponent(expression, opts) → render one component expression in isolation
// waitFor(fn, opts)                → poll until an assertion passes
// act(fn) / flush(times?)          → drain the render queue
// json(data, status?)              → build a mocked fetch result
// within(node)                     → scoped query set
// axe(node)                        → a11y audit (returns array of violations)

import { getDiagnostics, getCompletions, formatProgram } from "aktion-runtime/language";
// DOM-free language service for editor integrations — see Tooling below
```

The three subpath entries (`/test`, `/devtools`, `/language`) and the Node-only
`/vite` plugin never enter the browser bundle. `componentSchema`,
`buildGallery`, and `suggestComponent` all take the library explicitly — pass
`defaultLibrary`, or your own extended library, so a schema dump always matches
the components the element actually renders.

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

function OrderTable(rows) {
  return Table([Col("Order", rows.map(r => r.id)), Col("Total", rows.map(r => r.total))])
}

function NotFound() {
  return EmptyState("No such page", { icon: "compass" })
}

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

  ```text
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
  banner = $error ? Callout($error, { tone: "danger" }) : Callout("All good", { tone: "success" })
  rows   = $items.map(item => Row([Text(item.title)]))
  // Multi-way dispatch: wrap a `switch` in a function and `return` per arm.
  function viewFor(tab) {
    switch (tab) {
      case "list":  return List($items.title)
      case "grid":  return Grid($items.map(i => Card([Text(i.title)])), { columns: 3 })
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

The runtime surface is **26 `$`-builtins**: `$app`, `$router`, `$effect`,
`$theme`, `$head`, `$emit`, `$optimistic`, `$script`, `$i18n`, the data +
realtime factories (`$http`, `$query`, `$mutation`, `$socket`, `$sse`, `$form`,
`$store`), the five hooks (`$state`, `$memo`, `$ref`, `$reducer`, `$id`), and the
**five namespaces** below (`$storage`, `$console`, `$toast`, `$util`, `$dom` —
153 members between them). Eight of the builtins return a reactive **resource
bag** (`$http`, `$query`, `$mutation`, `$socket`, `$sse`, `$script`, `$form`,
`$store`) with its own documented member set. The whole catalog ships as data
(`builtinCatalog`, `namespaceCatalog`, `factoryResourceCatalog`), so editors and
generators read it rather than restating it.

| Global    | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| `$storage` | Browser persistence — `$storage.set/get`, `$storage.session.*`, `$storage.cookies.*`. |
| `$console` | Forwards to the host console — `log` / `error` / `warn` / `info` / `debug`. |
| `$toast`  | Imperative notifications — `$toast.show/.success/.error/.info/.warning`, `.dismiss(id)`, `.clear()`, reactive `.items`. |
| `$util`   | Pure data / format / date / math / string helpers, plus reactive env getters (`$util.scroll`, `.viewport`, `.breakpoint`, `.media`, `.mouse`, `.url`), the `$util.style.*` / `$util.rules.*` / `$util.url.*` sub-namespaces, `$util.derived`, the `onError` / `onNavigate` / `onRequest` / `onResponse` / `invalidate` hooks, and the device helpers. |
| `$dom`    | Auto-disposed observers — `$dom.onResize(node, cb)`, `$dom.onIntersect(node, cb, opts?)`, `$dom.onMutation(node, cb, opts?)`, and `$dom.measure(node)` → `{ rect, scroll, viewport }`. |
| `route`   | Reactive router handle — `path`, `params`, `query`, `pattern`, `navigate(path)`. |
| JS stdlib | The JS standard library — `Math`, `JSON`, `Object`, `Array`, `Number`, `String`, `Boolean`, `Date`, `Map`, `Set`, `RegExp`, `Promise`, plus `parseInt` / `parseFloat` / `isNaN` / `isFinite` / `encodeURIComponent` / … Use directly (`Math.max(a, b)`, `JSON.stringify(x)`, `Object.keys(o)`) or with `new` (`new Date()`, `new Map()`). |
| timers    | `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` — like their JS counterparts, but tracked by the runtime and cleared automatically on re-plan/disconnect. Use inside an `effect` and clear in `cleanup`. |
| full JS globals | The **entire** JavaScript global surface is available — dialogs (`alert`, `confirm`, `prompt`), Web APIs (`fetch`, `URL`, `URLSearchParams`, `Blob`, `FormData`, `crypto`, `navigator`, `localStorage`, `atob`/`btoa`, `Intl`, `BigInt`, `Reflect`, …), and `window` / `document` themselves. Any `globalThis` member resolves by name. |

All five namespaces are **lowercase** after the `$`; the `route` handle is
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
function ShowName(name) { return Text(name, { variant: "large-heavy" }) }
function ShowAge(age)   { return Text(`Age ${age}`) }

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
> the full-re-render cost. See
> [`docs/reactivity.html`](./docs/reactivity.html) and the language reference in
> the [agent skill](./skills/aktion/references/language.md) for the full model.

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
[`src/library/validate.ts`](./src/library/validate.ts), re-exported from the
package root and from `aktion-runtime/language`) emits **hard errors**
for:

- Closed-token enum mismatches (`Button("Save", { variant: "magic" })`).
- Unknown named args (`Stack({ junk: 1 })`).
- One-positional-max violations (`Button("Save", "primary", true)` →
  "use `{ variant: "primary", loading: true }`").

The host element merges these into `program.errors` so the on-screen
banner surfaces every violation.

An **unknown component name** is deliberately *not* a hard error here — the
validator cannot tell a typo (`Cardd`) from a component the author declares
further down the file. The editors catch it instead, as a `warning` with a
"Did you mean …?" hint; see [Tooling](#tooling).

### Anticipatory skeletons

A reference to a component that hasn't been declared yet (and isn't in
the library) renders a `Skeleton` placeholder instead of
`[unknown component: …]`. Mid-stream forward references just shimmer
until the next render pass picks the declaration up.

For the complete language reference see
[`docs/language.html`](./docs/language.html) or, for full apps, the
[agent skill](#agent-skill) under [`skills/aktion/`](./skills/aktion/).

---

## Component library

The bundle ships **281 components** in **17 groups**, with nothing ungrouped —
so every component carries usage guidance into the generated system prompt and
is visible in chat mode. Reach for **pattern composites**
(`Hero`, `PageHeader`, `Stats`, `Toolbar`, `EmptyState`, `Timeline`,
`KanbanBoard`, `DescriptionList`, `PricingTable`, …) before hand-rolling
the equivalent with `Card` + `Stack` — they're tuned to produce dense,
production-quality SaaS UI in a single line.

The groups below are exactly `defaultLibrary.componentGroups`, in registration
order — the same taxonomy the prompt generator, the editors, and the agent skill
project.

| Group (count) | Components |
| ------------- | ---------- |
| **Layout** (34) | `Column`, `Row`, `Center`, `Stack`, `StackItem`, `Grid`, `GridItem`, `Box`, `Container`, `Spacer`, `Card`, `CardHeader`, `CardFooter`, `CardSection` (full-bleed tinted band inside a `Card`), `Separator`, `Tabs`, `TabItem`, `Accordion`, `AccordionItem`, `Modal`, `Drawer`, `Steps`, `AspectRatio`, `ScrollArea`, `Sticky` (with a `data-stuck` pinned hook), `ResizablePanels`, `MasonryGrid`, `Fragment`, `Section` (page band with eyebrow/title/subtitle), `Split` (sticky two-pane), `Bento`/`BentoCell` (asymmetric grid), `Overlay`/`OverlayItem` (anchored layering) |
| **Content** (27) | `Text`, `Image`, `Badge`, `BadgeList`, `Pill` (soft tinted state label), `Callout`, `Quote`, `CodeBlock`, `Skeleton`, `Spinner`, `LoadingDots` (three sequenced dots — the quiet inline loader), `Markdown`, `Kbd`, `Icon`, `TextContent`, `GradientText`, `Display`, `Heading`, `Eyebrow`, `Prose`, `RelativeTime`, `Svg` (sanitised inline SVG), `VisuallyHidden`, `KbdShortcut`, `CountUp`, `CountdownTimer`, `TableOfContents` |
| **Forms** (43) | `Form`, `FormControl`, `FormSection`, `FieldSet`, `ValidationSummary`, `Input`, `TextArea`, `PasswordInput`, `MaskedInput`, `MentionInput`, `TagInput`, `Select`, `SelectItem`, `Combobox`, `MultiSelect`, `Checkbox`, `CheckBoxGroup`, `CheckBoxItem`, `Radio`, `Switch`, `ToggleGroup`, `Button`, `Buttons` (gapped row), `ButtonGroup` (joined segmented row), `InputGroup` (one shell around a field + leading icon / trailing action / unit suffix), `SearchBar`, `Slider`, `NumberInput`, `ColorPicker`, `DatePicker`, `DateRangePicker`, `TimePicker`, `DateTimePicker`, `FileUpload`, `PinInput`, `MultiStepForm`, `SegmentedControl`, `QuantityStepper`, `VariantSelector`, `Swatch`, `DrawingCanvas`, `SignaturePad`, `ReactionPicker` |
| **Data** (24) | `Table`, `Col`, `DataGrid`, `List`, `ListItem`, `StatCard`, `Stats`, `Sparkline`, `Tile`, `Progress`, `ProgressRing`, `Pagination`, `Tree`, `TreeNode`, `CalendarView`, `ComparisonTable`, `InfiniteList`, `VirtualGrid` (windowed 2-D grid), `Metric`, `MetricStrip`, `Calendar` (month grid with arrow-key navigation, event chips/dots), `OrderSummary`, `Cart`, `PriceTag` |
| **Charts** (9) | `BarChart`, `LineChart`, `PieChart`, `RadarChart`, `ScatterChart`, `Histogram`, `Heatmap`, `Gauge`, `Series` |
| **Feedback & Media** (22) | `Avatar`, `AvatarGroup`, `PersonChip`, `Tooltip`, `HoverCard`, `Popover`, `Rating`, `Toast`, `Toasts` (only needed for custom placement — see `$toast`), `VideoPlayer`, `AudioPlayer`, `Carousel`, `Gallery`, `Lightbox`, `Map`, `TypingIndicator`, `Confetti`, `Lottie`, `QRCode`, `PresenceAvatars`, `LiveCursor`, `Backdrop` (grid/blobs/particles) |
| **Navigation** (16) | `Breadcrumb`, `BreadcrumbItem`, `Navbar`, `NavbarItem`, `DropdownMenu`, `MenuItem`, `MenuSeparator`, `MenuLabel`, `NavBar` (sticky/blur + mobile burger menu), `TabBar` (mobile bottom nav), `BackToTop`, `ScrollSpy`, `Brand`, `Footer`, `FooterColumn`, `SkipLink` |
| **Chat** (6) | `SectionBlock`, `ListBlock`, `FollowUpBlock`, `FollowUpItem`, `ActionLink`, `ChatBubble` |
| **Patterns** (43) | `Hero`, `PageHeader`, `EmptyState`, `Timeline`, `TimelineItem`, `ActivityLog`, `FeatureGrid`, `FeatureItem`, `Testimonial`, `ProfileCard`, `Comment`, `Banner`, `Notification`, `InboxPanel`, `OnboardingChecklist`, `MediaCard`, `TopBar`, `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `SectionHeader`, `Toolbar`, `DescriptionList`, `DescriptionItem`, `ActionStripe` (full-width clickable nav row with chevron), `StatusDot`, `PricingTable`, `PricingCard`, `LoadingState`, `ErrorState`, `SuccessState`, `Tour`, `Spotlight`, `LogoCloud`, `LogoChip`, `ProductCard`, `ShareButtons`, `AuthorByline`, `CodeWindow`, `BrowserFrame`, `Terminal`, `ThemeToggle`, `CopyButton` |
| **Editors & overlays** (8) | `RichTextEditor`, `CodeEditor`, `ContextMenu`, `Sheet`, `BottomSheet`, `ConfirmDialog`, `SpeedDial`, `FloatingActionButton` — the dialog-shaped surfaces all get Escape-to-close (innermost layer first), a Tab focus trap, and focus restore |
| **App shell** (5) | `AppShell`, `Sidebar`, `SidebarSection`, `SidebarItem` (supports `to` for router navigation), `SplitView` |
| **Advanced UI** (22) | `IconButton`, `CommandPalette`, `FilterChips` (already-applied, removable), `FilterPill` (toggleable filter-bar control), `FieldRepeater`, `VirtualList`, `QueryBuilder`, `DiffViewer`, `JsonTree`, `Gantt`, `Truncate`, `InlineEdit`, `NotificationBell`, `Reveal` (scroll-triggered), `Transition` (enter/exit), `FlipList` (FLIP reorder), `Parallax`, `ReadingProgress`, `Sortable`, `Draggable`, `DropZone`, `OnGesture` (swipe/pan/longPress/doubleTap) |
| **Routing** (2) | `NavLink` (router-aware anchor), `RouteView` (route transitions) |
| **Helpers** (8) | `Async`, `Show`, `Portal`, `Redirect`, `Lazy`, `ErrorBoundary`, `LiveRegion` (takes a plain STRING, not a node — `LiveRegion($status, { politeness: "polite" })`), `FocusTrap` |
| **Behaviour wrappers** (8) | `OnClick`, `OnMouse`, `OnKeyboard`, `OnFocus`, `OnIntersect`, `OnMount`, `Css`, `Link` — attach click / mouse / keyboard / focus / intersection / lifecycle listeners or raw class / style to ANY component without it needing a dedicated prop. `OnMount(child, { onMount, onUnmount })` is the DOM-ref escape hatch — `onMount(node)` fires once after attach so you can measure, focus, or hand the node to an imperative library. `Link(label_or_child, { to?, href?, external? })` wraps either a string or a component as a router-aware anchor. |
| **Interop** (2) | `Mount`, `WebComponent` — host an imperative / third-party widget (chart, map, editor, payment element) that owns its own DOM. `Mount({ setup, update?, cleanup?, props?, tag?, sx? })` gives a managed `setup → update → cleanup` lifecycle; `WebComponent(tag, { attributes?, properties?, on? })` renders + hydrates any native custom element with reactive attributes / events. Pair with the `$script({ src, global? })` loader and the `$dom` observer namespace — see [interop.html](https://asfand-dev.github.io/aktion/interop.html). |
| **Escape hatches** (2) | `HTMLTag`, `Styles` (last-resort raw HTML / CSS — see [language.html](https://asfand-dev.github.io/aktion/language.html#escape-hatches)) |

`$theme({ … })` and `$router({ … })` are **builtins**, not components — see
[Themes](#themes) and [Routing](#routing).

### Picking between near-neighbours

Several groups ship deliberately similar components. The distinctions the
schema validator cannot make for you:

- **`Badge` vs `Pill`** — `Badge` is the SOLID high-attention chip; `Pill(label, tone?, icon?)` is the softer tinted STATE label ("SSL active", "pending", "broken"). Pill tones: `neutral`, `activating`, `success`, `warning`, `critical`, `promoting`, `corporate`.
- **`Spinner` vs `LoadingDots`** — a rotating ring vs three sequenced dots. Use `LoadingDots` inline, `Spinner` for a whole panel.
- **`Buttons` vs `ButtonGroup` vs `SegmentedControl`/`ToggleGroup`** — gapped row, edge-to-edge joined row, floating chip track.
- **`CardSection` vs `Callout`** — a full-bleed tinted band *inside* a `Card` vs a standalone bordered notice.
- **`ActionStripe` vs `ListItem` vs `Tile`** — always-interactive navigation row, presentational list row, grid unit.
- **`FilterPill` vs `FilterChips`** — the toggleable control in a filter bar vs the already-applied, removable representation.

Two prop vocabularies are bridged across the library so a plausible guess is not
a build failure: **`tone` and `variant`** are interchangeable on 41 specs (only
`Text` and `TextContent` declare both as genuinely different props — `variant`
is typographic, `tone` is colour), and **`children` and `child`** are
interchangeable on 74 — 56 declare one of the two names, and 18 more (`Link`,
`Tooltip`, `Popover`, `Display`, `Heading`, `Bento`, …) accept both as aliases
of their own positional prop. Every container primitive takes either spelling.

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

Eight tiny wrappers attach behaviour to any component:

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

// DOM-ref escape hatch — measure, focus, or hand the node to an imperative library
OnMount(Input("search", { placeholder: "Search" }), { onMount: node => node.focus() })

// Any component as a router-aware anchor
Link(Card([Text("Open the settings page")]), { to: "/settings" })
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
| `light`      | Crisp default, indigo accent (`#4f46e5`).                                                         |
| `dark`       | Standard dark surface, indigo accent.                                                             |
| `corporate`  | Enterprise admin console — flat white surfaces on a pale blue-grey page, navy `#0b2a63` primary that *brightens* to `#1474c4` on hover, 24px pill buttons, borderless/shadowless cards, transparent inputs, borderless uppercase table headers. Blue is reserved for interactive elements; body and heading text stay dark navy `#001b41`. |
| `soft`       | Soft, friendly, light & rounded. Violet primary + mint accent fill, generous radii, gentle shadows. |
| `glass`      | Light glassmorphism — frosted translucent surfaces over an airy pastel gradient, warm terracotta primary. |
| `modern`     | Clean modern SaaS dashboard — light, generous rounding, ink primary with fully pill-shaped buttons, soft shadows, vibrant charts. |

**Theme fonts.** Selecting a built-in theme *by name* loads the web fonts that
theme needs to look like itself. `corporate` pulls `Open Sans:400,600` and
`Overpass:400,600` from Google Fonts — declared in the exported
`builtInThemeFonts` map and fetched by both `theme="corporate"` and
`$theme({ name: "corporate" })`, with no `$theme({ fonts: … })` in the program.
Every other built-in theme uses system fonts and issues no request. If your CSP
forbids `fonts.googleapis.com` / `fonts.gstatic.com`, self-host the families and
override `fontFamily` / `fontFamilyHeading` via `el.setTheme(...)`.

### Token groups

Themes are flat maps of CSS-valued strings, grouped by domain:

| Group        | Sample tokens                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface      | `colorBg`, `colorBgSubtle`, `colorSurface`, `colorSurfaceMuted`, `colorSurfaceHover`, `colorBorder`, `colorBorderSubtle`, `colorBorderControl`, `colorText`, `colorTextMuted`         |
| Brand        | `colorPrimary`, `colorPrimaryHover`, `colorPrimaryText`, `colorAccent`, `colorAccentHover`, `colorAccentText`, `colorFocusRing`, `colorLink`, `colorLinkHover`                        |
| Semantic     | `colorSuccess`, `colorWarning`, `colorDanger`, `colorInfo` (3:1 **fills**) plus their `…Text` partners (`colorSuccessText`, …, ≥4.5:1 as text) and `colorOn…` inks painted on the filled shape (`colorOnSuccess`, …) |
| Typography   | `fontFamily`, `fontFamilyHeading`, `fontFamilyMono`, `fontSizeBase`, `fontSizeSm`, `fontSizeLg`, `fontSizeHeading`, `fontSizeTitle`, the fixed rungs `fontSize10` / `11` / `13` / `15` / `18` / `20` / `24` / `32`, `fontWeightBody`, `fontWeightHeading`, `lineHeightBody`, `lineHeightHeading`, `letterSpacingHeading`, `headingTextTransform` |
| Code         | `hlKeyword`, `hlString`, `hlNumber`, `hlComment`, `hlFn`, `hlTag`, `hlAttr`, `hlPunct` — the `CodeBlock` / `CodeEditor` syntax palette (GitHub-light in `light`, One Dark in `dark`) |
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
| `name`      | `string`            | Selects a built-in theme as the base palette (`"light"`, `"dark"`, `"corporate"`, `"soft"`, `"glass"`, `"modern"`); structured overrides layer on top. Unknown names are ignored. A named theme also loads its own web fonts — see *Theme fonts* above. |
| `direction` | `"ltr"` \| `"rtl"`  | Reading direction. Metadata only — not applied as a token.                                                                                                                                        |
| `colors`    | `{ [key]: string }` | CSS color strings. Keys: `bg`, `bgSubtle`, `surface`, `surfaceMuted`, `surfaceHover`, `border`, `borderSubtle`, `borderControl`, `text`, `textMuted`, `primary`, `primaryHover`, `primaryText`, `accent`, `accentHover`, `accentText`, `focusRing`, `link`, `linkHover`, `success`, `warning`, `danger`, `info`, plus the `successText` / `warningText` / `dangerText` / `infoText` text partners and the `onSuccess` / `onWarning` / `onDanger` / `onInfo` inks. |
| `radius`    | `{ [key]: string }` | CSS length strings. Keys: `xs`, `sm`, `md`, `lg`, `pill`, `button`, `input`.                                                                                                                       |
| `font`      | `{ [key]: string }` | CSS strings. Keys: `family`, `familyHeading`, `familyMono`, `sizeBase`, `sizeSm`, `sizeLg`, `sizeHeading`, `sizeTitle`, the fixed rungs `size10` / `11` / `13` / `15` / `18` / `20` / `24` / `32`, `weightBody`, `weightHeading`. Also accepts `import` for web fonts (see `fonts`). |
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
shadow root. Host apps do **not** need to add a stylesheet. The `<link>` is
emitted with `crossorigin="anonymous"` and `referrerpolicy="no-referrer"`; set
the exported `FONT_AWESOME_CDN_INTEGRITY` constant to a `sha384-…` digest to
have the browser reject a tampered stylesheet (it ships empty, because a wrong
hash would break icons for every consumer), or self-host the CSS and never call
`ensureFontAwesomeLoaded`.

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

**Five** namespace globals are always in scope inside an Aktion program — no
import required: `$storage`, `$console`, `$toast`, `$util`, and `$dom`. All
follow the standard `obj.method(args)` method-call syntax and accept
object-literal options. `$toast` is described under
[What's in the box](#whats-in-the-box), `$util` under
[the language](#aktion--the-language), and `$dom` alongside the interop
components; the two persistence / logging namespaces are shown here.

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
$console.log("Hello", $user)
$console.error("Something failed", $error)
```

- Non-string values round-trip through `JSON.stringify` / `JSON.parse`;
  missing keys return `null`.
- Cookie options: `expires` (days, `Date`, or ISO string), `maxAge`
  (seconds), `path`, `domain`, `secure`, `sameSite`. `path` and `domain`
  are validated (so a stray `;` cannot append attributes of its own) and
  `SameSite` is always emitted, defaulting to `Lax`.
- Failures (quota exceeded, disabled storage, malformed JSON) are
  swallowed — perfect for partial-stream renders in privacy / SSR
  contexts.
- Bare `console.*` also works: it resolves through the JavaScript-globals
  passthrough rather than the `$console` namespace. Prefer `$console` when
  naming the namespace so there is exactly one spelling to learn.

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

The DOM-free `aktion-runtime/language` entry
([`src/language-api.ts`](./src/language-api.ts)) is the published host-side
language surface — one analysis, reused by every editor and by the playground:

```ts
import {
  formatProgram,        // canonical pretty-printer (idempotent)
  getDiagnostics,       // parse + schema errors AND lint warnings
  getLintWarnings,      // just the soft warnings
  getCompletions,       // context-aware completions
  getHoverInfo,         // hover docs for symbols
  getSignatureHelp,     // active parameter in a component / builtin call
  getDefinition,        // go to declaration (cross-file aware)
  getReferences,        // find all references
  getRenameEdits,       // rename a binding (the `$` sigil is preserved)
  getDocumentSymbols,   // outline of atoms / components / actions / imports
  getSemanticTokens,    // semantic highlighting
  getSnippets,          // component + pattern snippets
  parse,                // the raw parser
  validateProgram,      // structural validation
  validateProgramSchema,// schema-as-truth errors
  linkProgram,          // link one module graph
  linkProject,          // link an in-memory project
  resolveSpecifier,     // relative `.aktion` specifier resolution
  createMemoryResolver, // resolver over a `{ path: source }` map
  builtInThemes,        // theme token records (data only, no DOM)
  builtInThemeFonts,    // which built-in theme needs which web fonts
  resolveTheme,         // pure token resolution
  sanitiseThemeTokens,  // drop unknown / unsafe token keys
  defaultLibrary,       // the component library itself
} from "aktion-runtime/language";
```

`applyDelta` (the structured-edit protocol) and `inspectAST` live in
[`src/tooling/index.ts`](./src/tooling/index.ts), which `package.json`
`exports` does not expose — from the published package the delta protocol is
reachable as `el.applyDelta(ops)`, and the inspector by importing from source.

- `formatProgram` projects the parsed AST back to canonical source —
  object-literal named args, double-quoted strings, two-space block
  indentation, template literals intact. A file with parse errors is left
  untouched, so a mid-edit document is never mangled.
- `inspectAST(source)` returns a JSON-friendly view of the Committed +
  Drafting ASTs at the current byte position — bindings (with
  kind / line / column / summary), in-flight names, and any parse errors.
- `applyDelta(programText, ops)` patches a program with a structured
  sequence of operations and returns the new text plus any advisory
  warnings. Used by the element-level `el.applyDelta(...)` method.
- `getDiagnostics(source, library?)` merges parse errors, schema errors, and
  **lint warnings**. The headline warning is `unknown-component`: a PascalCase
  call that is neither a library component nor declared / imported in the file
  is flagged with a `suggestComponent`-derived *"Did you mean …?"* hint. It is a
  warning, not an error — the runtime renders an unknown component as nothing,
  and a stale editor library must never turn a working file red. The other
  warning is `shadowed-i18n` (a parameter or loop variable shadowing a binding
  destructured from `$i18n(...)`, typically `t`). `getLintWarnings(source,
  library?)` returns only the warnings; pass the library to enable the
  unknown-component pass, omit it to skip it.
- `getDiagnostics`, `getCompletions`, and `getHoverInfo` are the data
  layer a real LSP server wraps — see [Editor support](#editor-support). The
  [playground](https://asfand-dev.github.io/aktion/playground.html)
  uses them under the hood. `getCompletions` is **scope-aware**: alongside
  the library + reserved words it surfaces the symbols declared in the
  current document — your own reactive atoms, components, and actions. It is
  also **member-aware**: after a `.` it completes (and hovers / typechecks the
  signature of) every namespace member — `$util.*` (incl. nested `$util.style`
  / `$util.rules` / `$util.url`), `$storage.*`, `$console.*`, `$toast.*`, the
  `route` handle, and the resource bag a factory builtin returns (`$http`,
  `$query`, `$mutation`, `$socket`, `$sse`, `$script`, `$form`, `$store`). Inside a
  config-taking builtin's object (`$http({ … })`, `$theme({ … })`, …) it
  completes and hovers the accepted config keys. The member + config catalog
  ships as data (`namespaceCatalog`, `factoryResourceCatalog`,
  `findBuiltinConfig`) so any host can reuse it.

### Migration & DX tooling

The migration / DX / test helpers, and where each one lives:

| Export | What it does |
| ------ | ------------ |
| `htmlToAktion(html)` | Convert static HTML to an Aktion program — common tags map to components, `class` attributes run through `tailwindToSx` (mapped utilities become `sx`, leftovers stay under `className`), and `flex`/`flex-col` containers become `Row`/`Column`. |
| `tailwindToSx(classString)` | Map Tailwind utilities to an `sx` object — spacing/color/typography/flex/grid/radius/shadow/sizing/position/z-index/overflow, with responsive prefixes (`md:p-8`) becoming `sx` breakpoint maps and state prefixes (`hover:bg-primary`) becoming `sx.states` entries. Unrecognised classes come back under `_unmapped`. |
| `cssToSx(cssText)` | Map a plain CSS declaration list (`"padding:16px;color:#111"`) to an `sx` object — the migration path for hand-written stylesheets. |
| `styledToSx(template)` | Same, for a styled-components / emotion template literal. |
| `componentSchema(library)` | Stable, machine-readable JSON schema of every component (props/types/enums/flags) for editor autocomplete and release diffing. |
| `buildGallery(library)` | Self-contained HTML component explorer ("Storybook page") generated from the schema. |
| `suggestComponent(name, library)` | "Did you mean?" typo candidates by edit distance. |
| `renderToString(program, opts)` / `renderToStaticMarkup` | SSR/SSG — render a program to `{ html, state }` under any DOM (browser or Node + happy-dom/jsdom); pair with `StateStore.hydrate`. From the main entry. |
| `within(node)` / `axe(node)` | Testing helpers from `aktion-runtime/test` — scoped queries and a dependency-free a11y audit (`img-alt`, `svg-name`, `button-name`, `link-name`, `label` — with `aria-labelledby` resolution —, `duplicate-id`, `tabindex`). |
| `el.connectDevtools()` | Attach a live instance to the DevTools panel from `aktion-runtime/devtools` — state inspector (writable), current program text, forced render. See [`docs/devtools.html`](./docs/devtools.html). |

### Validating `.aktion` files from the CLI

Two zero-dependency scripts run the same checks the editors and the test suite
run, so a hand-authored program can be gated in CI or a pre-commit hook. Both
read the built `dist/language.js`, so run `npm run build:language` (or
`npm run build`) first.

```bash
# One or more self-contained programs (also accepts `-` for stdin)
node tools/validate-aktion.mjs docs/demos/blocks/login-card.aktion

# A multi-module app — links the import graph from the entry first
node tools/validate-aktion-app.mjs src/app.aktion
```

They print `FILE: OK` or `FILE: Lnn: message` per problem and exit non-zero on
any **error**; warnings (including `unknown-component`) are reported but do not
fail the run.

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
/ `applyDelta` target). Specifier lists may span multiple lines and carry a
trailing comma, and a syntax error in an **imported** module is reported as a
link diagnostic rather than silently dropping that module's statements.

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
(see [`create-aktion`](./create-aktion/)) — its templates wire up the plugin, the
ambient `*.aktion` types, and the editor extension for you.

`.aktion` imports are confined to the Vite project root: a specifier that
escapes it is refused at both `resolve` and `load` time. A monorepo that
genuinely imports `.aktion` files from a sibling package opts out with
`aktion({ allowOutsideRoot: true })`.

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

### Package entry points

| Import                          | Runs in | Purpose                                                                     |
| ------------------------------- | ------- | --------------------------------------------------------------------------- |
| `aktion-runtime`                | browser | `<aktion-app>` + `mountCompiled` + the browser-safe linker (`linkProject`)  |
| `aktion-runtime/vite`           | Node    | the Vite/Rollup plugin (`aktion()`)                                         |
| `aktion-runtime/language`       | Node    | DOM-free diagnostics / lint warnings / hover / completions / signature help / definition / references / rename / document symbols / semantic tokens / formatting / snippets, plus the parser, the schema validator, the linker, and the theme data (editors, LSP, CLIs) |
| `aktion-runtime/test`           | browser / happy-dom | `render` / `renderComponent` → a `Screen` (queries, `screen.user`, `screen.state`), plus `waitFor` / `act` / `flush` / `within` / `axe` / `json` / `cleanup` |
| `aktion-runtime/devtools`       | browser | the DevTools panel + inspector bridge (`el.connectDevtools()`)              |
| `aktion-runtime/aktion-modules` | types   | ambient `*.aktion` module declarations                                      |
| `aktion-runtime/skill`          | any     | the [agent skill](#agent-skill) entry point (`skills/aktion/SKILL.md`)       |
| `aktion-runtime/system_prompt.txt` · `/system_prompt_chat.txt` | any | the two generated prompt texts, as package assets |

The plugin, language service, testing library, and DevTools ship as separate
entries and never enter the browser bundle, so `dist/aktion.js` is unchanged.

---

## Editor support

Three editor integrations ship from this repo, and they share **one** analysis.
Every diagnostic, completion, hover, and formatting result comes from the pure,
DOM-free functions in [`src/language-api.ts`](./src/language-api.ts)
(`aktion-runtime/language`); each integration is only an adapter that carries
those results to its host. No editor owns language logic, so an editor can never
disagree with the runtime about what a valid program is:

```
src/tooling/*  (one parser, one schema validator, one formatter)
      │
      └── src/language-api.ts ──► editors/vscode                in-process
                              ──► editors/lsp                   LSP over stdio
                              │        └──► editors/jetbrains, Neovim, Helix, Zed, …
                              └── docs/assets/playground.js     in-page
```

| Integration | What it is |
| ----------- | ---------- |
| [`editors/vscode`](./editors/vscode/) | The VS Code / Cursor / Open VSX extension. Treats `.aktion` as TypeScript for base highlighting and layers the full language service on top **in-process** — it can, because a VS Code extension is JavaScript. Semantic highlighting, inline diagnostics, hover, scope-aware completions, signature help, **cross-file** go-to-definition (jump to an imported binding's declaration or open the module specifier's file), find-all-references, rename, document outline, document highlights, format-on-save, and generated snippets. Its public [README](./editors/vscode/README.md) covers install / use / update; the [contributor guide](./editors/vscode/docs/README.md) covers local F5 debugging, architecture, **and** publishing to the Marketplace + Open VSX. |
| [`editors/lsp`](./editors/lsp/) | **`aktion-language-server`** — a standalone Language Server Protocol server wrapping the same surface. Speaks LSP over stdio, has zero runtime dependencies, and builds to a single `.mjs` (`npm run build:lsp` → `editors/lsp/dist/server.mjs`). This is what unlocks every editor that is not a JavaScript host: **JetBrains** IDEs, **Neovim**, **Helix**, **Zed**, **Sublime Text**, and **Emacs**. Covered by `tests/lsp-server.test.ts`. |
| [`editors/jetbrains`](./editors/jetbrains/) | The JetBrains plugin (Kotlin + Gradle), an [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) client that bundles the server above. Works in IntelliJ IDEA, WebStorm, PyCharm, PhpStorm, GoLand, RubyMine, CLion, Rider, and Android Studio from 2024.2 onward — same diagnostics, completion, quick documentation, navigation, structure view, reformat, and snippets, with nothing to install separately. |

Why an LSP server *and* an in-process extension: a JetBrains plugin is JVM code
and Neovim / Helix / Zed / Sublime / Emacs are not JS hosts at all, so the
in-process trick is available to VS Code alone. Rather than reimplement the
parser and schema validator per editor family, the server exposes the identical
functions over the protocol.

If a feature needs new behaviour, it goes into the language surface — never into
an editor. The one sanctioned exception is filesystem-bound work the pure
service cannot do: cross-file go-to-definition *classifies* the cursor in the
service (`getDefinitionTarget` → `local` / `import-binding` / `module`) and the
host performs the path resolution and file reads.

---

## Agent skill

[`skills/aktion/`](./skills/aktion/) is an **Agent Skill**: the authoring
knowledge base an LLM coding agent loads when it writes or edits `.aktion`
source. It replaces the former single-file `coding-gen-skill.md`.

| Part | Source |
| ---- | ------ |
| [`SKILL.md`](./skills/aktion/SKILL.md), `references/layout.md`, `references/language.md`, `references/patterns.md`, `references/gotchas.md` | Hand-written. These carry judgement — layout density, pattern-first composition, the traps the schema validator cannot catch. |
| `references/components/index.md` + one file per component group, `references/builtins.md`, `references/namespaces.md`, `references/themes.md` | **Generated** by [`scripts/emit-skill.mjs`](./scripts/emit-skill.mjs) from `dist/language.js`, and wired into `npm run build` as `build:skill`. |

Generating the enumerative half is the point: a hand-maintained component
reference is guaranteed to drift, and a skill that names a component which no
longer exists makes an agent produce broken code silently. The same script also
validates every `aktion`-tagged fenced block in the skill — hand-written ones
included — against the live library, so the build fails rather than shipping a
worked example that no longer parses. It additionally refuses to run when a
hand-written count disagrees with the library, or when a component belongs to no
component group (it would otherwise be absent from the reference entirely).
[`tests/skill-artifacts.test.ts`](./tests/skill-artifacts.test.ts) enforces the
same contract in CI, so a library change that skips `npm run build:skill` fails
review instead of shipping.

The skill ships in the npm tarball and is importable as
`aktion-runtime/skill`. The two `system_prompt*.txt` files remain the surface
for *runtime* LLM generation (chat assistants streaming into `<aktion-app>`);
the skill is for *authoring* agents working on files in a repo.

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
| `tutorial.html`                     | *Aktion Quest* — an interactive, game-style tutorial. Eleven hands-on levels with a live editor and instant previews, covering reactive state, components, layout, forms, effects, `$http`, `sx`, and theming. |
| `migration-guide.html`              | Concept-by-concept migration from React, Vue, Angular, Svelte, Solid, and plain HTML — components, state, props, events, lists, conditionals, effects, HTTP, routing, styling, slots, side by side. |
| `frameworks.html`                   | Integration recipes for React, Next.js, Vue, Angular, Svelte, plain HTML.               |
| `language.html`                     | Full Aktion language guide — the conceptual walkthrough of syntax and semantics. |
| `language-reference.html`           | Searchable reference of every language symbol — keywords, `$`-builtins & hooks, the `$util` namespace, JavaScript globals, and operators/literals, each with a one-line description and copy-paste example. Filter by category or type to jump straight to an entry. |
| `hooks.html`                        | The five built-in hooks (`$state`, `$memo`, `$ref`, `$reducer`, `$id`) and how to write and compose custom `$name` hooks. |
| `stores.html`                       | Global state with `$store({...})` — colocated state / actions / getters, no prop drilling, fine-grained per-component updates, plus persistence and undo/redo. |
| `http.html`                         | HTTP guide — the `$http({...})` primitive, config options, the reactive resource bag, `Async`, refetch/cancel patterns, and a full CRUD walkthrough. |
| `sx.html`                           | The universal `sx` styling prop — a complete reference for every key (spacing, sizing, color, border, flex/grid, position, typography, effects, background images), plus responsive breakpoint maps, interaction-state styling, the sibling `animate` prop, and live mini-UI examples. |
| `layout.html`                       | Layout recipes — `Column` / `Row` / `Grid` plus `Center`, `Container`, `Box`, `Spacer`, `GridItem` spans, `Card` + `CardSection` bands, joined control groups, `ScrollArea`, `Sticky`, and how anchored popups escape clipping via the browser top layer. |
| `components.html`                   | Every built-in component with a live preview, positional signatures, prop tables, and enum values. |
| `forms.html`                        | Forms guide — `$form({...})` for field state, validation rules, submission and error surfacing, and how it composes with `$http` mutations and the Forms component group. |
| `actions.html`                      | `function name() { … }` guide — declarative state mutations, optimistic snapshot/rollback, lambda-based click handlers, navigation, and end-to-end examples. |
| `side-effects.html`                 | `$effect(() => { … }, [...deps])` guide — anonymous side effects, dependency entries (state, lifecycle, intervals, debounce/throttle), top-level vs. component-local scope, cleanup, and effect vs. action. |
| `interop.html`                      | Third-party / imperative widget interop — `Mount` (managed setup/update/cleanup lifecycle), `WebComponent` (native custom-element bridge), the `$script` external-SDK loader, and the `$dom` observer namespace. How `data-rui-preserve` keeps a widget's DOM intact. |
| `head.html`                         | Document head & SEO — `$head({...})` for reactive title, meta, canonical/alternate links, Open Graph / Twitter cards, JSON-LD, and `<html>` attrs; per-route composition; and the SSR `head` / `headAttrs` output from `renderToString`. |
| `javascript-interactions.html`      | Effect + action bodies — the JavaScript execution surface.                               |
| `routing.html`                      | Hash-based routing guide — always available at runtime.                                 |
| `modules.html`                      | Splitting an app across multiple `.aktion` files — `import` / `export`, true per-file scope, relative / absolute / URL specifiers, and the linker. |
| `reactivity.html`                   | Reactivity & rendering deep-dive — path tracking, the two render gates, exactly what forces a full re-render, and how to stay fine-grained. |
| `performance.html`                  | Performance & optimization — re-render avoidance, memoization rules, the safety budget, bundle size, and `setResponse` vs `appendChunk`. |
| `troubleshooting.html`              | Troubleshooting / FAQ — focus loss, effects not firing, memoized-away components, the `Map` component vs JS `Map`, dropped styles, missing i18n keys. |
| `errors.html`                       | Error handling & debugging — reading parse/runtime errors, the render-loop and budget guards, the `error` event, and strict mode. |
| `devtools.html`                     | The `aktion-runtime/devtools` panel — mount it with one line, inspect and edit live `$state`, profile every render commit, and watch effects fire. |
| `testing.html`                      | The Aktion Testing Library (`aktion-runtime/test`) — render a program, query the shadow DOM the way a user sees it, drive real interactions, assert on output, `$state`, emitted events, and mocked `$http`. |
| `typescript.html`                   | TypeScript guide — public types, subpath entry points, typing custom components/helpers/interceptors, host event payloads, a typed host-wrapper recipe. |
| `accessibility.html`                | Accessibility guide — conformance target, keyboard map, screen-reader/streaming behaviour, built-in ARIA, and theme contrast. |
| `security.html`                     | Security & the trust model — program text as trusted code vs rendered values as untrusted data, `setGlobalAccessPolicy`, the sink→sanitiser table, why the shadow DOM is not a boundary. |
| `deployment.html`                   | Production & deployment — SSR/hydration via `serializeState`, a complete CSP (no `unsafe-eval` needed), integrity hashes, CDN caching, edge-function LLM streaming. |
| `llm-integration.html`              | LLM integration — wiring OpenAI/Anthropic/OpenRouter/Bedrock streams into `appendChunk`, prompt selection, interceptors, the `assistant-message` round-trip. |
| `themes.html`                       | Built-in themes gallery, live picker, side-by-side compare, and the token customization studio. |
| `theme-generator.html`              | Visual theme generator — tune colors, radius, typography, spacing, shadows, and a brand gradient with a live preview, then copy a ready-to-paste `$theme({…})` statement. |
| `theme-customization.html`          | Token-by-token customization studio (now folded into `themes.html`, kept as a redirect for old links). |
| `brand-themes.html`                 | One program rendered with six ready-made brand token maps — GitHub, Apple, Stripe, IONOS, Notion, Vercel — each shown as a flat `setTheme()` map and its grouped `$theme({…})` translation. |
| `exos-parity.html`                  | Corporate-theme parity harness — the Aktion component set rendered side by side with the Exos/corporate design framework it mirrors. |
| `exos-blocks.html`                  | Exos ↔ Aktion UI blocks — whole framework sections rebuilt as Aktion programs. |
| `exos-micro-frontends-blocks.html`  | The DCD micro-frontend blocks rebuilt in Aktion.                                        |
| `playground.html`                   | CodeMirror 6 editor with custom highlighting / autocomplete, live preview, share links, hover-over component info, and an inspection mode. |
| `visual-editor.html`                | Drag-and-drop visual editor for the full 281-component library. Three canvas modes (Raw Edit / Visual Edit / Preview), an Outline tab for top-level entity navigation, typed prop editors, cross-entity selection, and import / export of `.aktion` + self-contained HTML via an editable Source drawer. |
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
│   │   ├── builtins.ts        #     the $-builtin catalog + pure helpers
│   │   ├── evaluator.ts       #     program planner + binding resolver + global access policy
│   │   ├── state.ts           #     reactive store — `$name = value`
│   │   ├── effects.ts         #     EffectRunner + ActionDeclRunner
│   │   ├── http.ts            #     $http({...}) reactive HTTP primitive + interceptors
│   │   ├── realtime.ts        #     $socket / $sse reactive streams
│   │   ├── i18n.ts            #     $i18n({...}) factory — returns { t, setCurrentLanguage, getCurrentLanguage }
│   │   ├── storage.ts         #     $storage.local / .session / .cookies bridge
│   │   ├── console.ts         #     $console.* host bridge
│   │   ├── head.ts            #     $head({...}) host-document manager (allow-listed)
│   │   ├── interop.ts         #     $script loader + third-party widget bridge
│   │   ├── ssr.ts             #     renderToString / renderToStaticMarkup
│   │   └── router.ts          #     Hash-based router for $router({…}) calls and NavLink
│   ├── library/               #   Component specs and registry
│   │   ├── components/        #     layout / content / forms / data / charts / chat / feedback /
│   │   │                      #     navigation / menu / patterns / editors / canvas / marketing /
│   │   │                      #     media / interop / helpers / wrappers / router / escape hatches
│   │   ├── sx.ts              #     universal sx → CSS compiler + the universal prop channel
│   │   ├── responsive-style.ts #    responsive sx maps → scoped @media rules
│   │   ├── validate.ts        #     validateProgram / validateProgramSchema
│   │   ├── floating.ts        #     anchored overlay positioning (dropdown / popover / tooltip)
│   │   ├── html-sanitizer.ts  #     the sanctioned string → DOM path (allow-list)
│   │   ├── svg-sanitizer.ts   #     inline-SVG allow-list (Svg, custom icons)
│   │   ├── highlight.ts       #     CodeBlock / CodeEditor tokeniser
│   │   └── qr.ts              #     QRCode encoder
│   ├── renderer/              #   Tree → DOM
│   │   ├── renderer.ts        #     walks the tree, calls component renderers
│   │   └── morph.ts           #     React-like DOM reconciler — keeps focus, selection, scroll, <details>.open
│   ├── compiler/              #   .aktion linker (linkProgram / linkProject / resolveSpecifier)
│   ├── plugin/                #   The Vite plugin (aktion-runtime/vite)
│   ├── testing/               #   The testing library (aktion-runtime/test)
│   ├── devtools/              #   DevTools panel, hook, and protocol (aktion-runtime/devtools)
│   ├── theme/                 #   Token system + injected stylesheet
│   ├── prompt/                #   System prompt generator
│   ├── tooling/               #   Host-side helpers (formatter, inspector, language service)
│   ├── language/              #   Reusable language-support module
│   ├── icons/                 #   Font Awesome CDN loader
│   ├── element.ts             #   The custom element
│   ├── language-api.ts        #   aktion-runtime/language entry (DOM-free)
│   └── index.ts               #   Public entry point
├── docs/                      # Static documentation site (HTML + CSS + JS)
│   └── demos/                 #   Bundled .aktion demo programs (mini-apps / blocks / components / industry-specific)
├── editors/
│   ├── vscode/                #   VS Code / Cursor / Open VSX extension (in-process)
│   ├── lsp/                   #   aktion-language-server — standalone LSP server
│   └── jetbrains/             #   JetBrains plugin (LSP4IJ client, bundles the server)
├── skills/aktion/             # The agent skill (references/ is generated)
├── create-aktion/             # `npm create aktion` scaffolder
├── tools/                     # validate-aktion.mjs / validate-aktion-app.mjs CLI gates
├── scripts/
│   ├── emit-prompt.mjs        #   Writes dist/system_prompt*.txt from the bundle
│   ├── emit-skill.mjs         #   Writes skills/aktion/references/** from dist/language.js
│   ├── emit-entry.mjs         #   Writes the dist/index.{js,cjs,d.ts} wrappers
│   └── build-docs.mjs         #   Assembles ./site/ from docs/ + dist/
├── tests/                     # Vitest unit + element regression tests
├── dist/                      # Built artifacts (created by `npm run build`)
├── site/                      # Deployable static docs (created by `npm run build:docs`)
├── .github/workflows/         # GitHub Pages deploy pipeline
├── CHANGELOG.md               # Release notes + the stability & versioning matrix
├── SECURITY.md                # Threat model + reporting policy
└── README.md                  # This file
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

### Build the library, prompts, and agent skill

```bash
npm run build
```

Produces:

```
dist/aktion.js              # ESM bundle (CDN entry)
dist/aktion.umd.cjs         # UMD bundle for older bundlers
dist/aktion.iife.js         # IIFE for non-module <script> tags
dist/index.js               # ESM npm entry — re-exports aktion.js
dist/index.cjs              # CommonJS npm entry — wraps aktion.umd.cjs
dist/index.d.ts             # TypeScript types entry
dist/types/                 # Per-module .d.ts declarations
dist/testing.js             # aktion-runtime/test entry
dist/devtools.js            # aktion-runtime/devtools entry
dist/language.js            # aktion-runtime/language entry (DOM-free)
dist/plugin.js              # aktion-runtime/vite entry (ESM)
dist/plugin.cjs             # aktion-runtime/vite entry (CJS)
dist/system_prompt.txt      # Full prompt — every feature
dist/system_prompt_chat.txt # Compact chat-focused prompt
skills/aktion/references/** # Generated halves of the agent skill
```

There is **no** `dist/aktion.css`: the whole stylesheet is a TypeScript
template literal in `src/theme/styles.ts` and is injected into each instance's
shadow root, so no separate CSS file is emitted or needed.

Individual steps are also available as scripts, which is what you want while
iterating:

```bash
npm run build:lib       # dist/aktion.{js,umd.cjs,iife.js} + dist/types/
npm run build:test      # dist/testing.js
npm run build:devtools  # dist/devtools.js
npm run build:language  # dist/language.js  (needed by tools/validate-aktion*.mjs)
npm run build:plugin    # dist/plugin.{js,cjs}
npm run build:prompt    # dist/system_prompt*.txt
npm run build:skill     # skills/aktion/references/**  (+ validates every aktion-tagged example)
npm run build:entry     # dist/index.{js,cjs,d.ts}
npm run build:lsp       # editors/lsp/dist/server.mjs
npm run build:docs      # ./site/
```

### Publish to npm

The package is published as `aktion-runtime`. The `files` field restricts the
tarball to `dist/` and `skills/`, and `prepublishOnly` runs the full build, so a
release is:

```bash
npm publish
```

Run `npm pack --dry-run` first to confirm the tarball contains only the
expected artefacts. The standalone language server publishes separately from
[`editors/lsp`](./editors/lsp/) as `aktion-language-server`.

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
lambdas, hoisting, i18n, `for` extensions, user components) — plus the
multi-file linker and the Vite-plugin compile path, SSR
(`renderToString`), `$head`, the `$form` engine, `$store` (persistence +
undo/redo), the `$query` / `$mutation` data layer, `$socket` / `$sse`
realtime, `$toast`, hooks, fine-grained reactivity + memoization, strict
mode, the morph value/event contracts, `sx` conversion, third-party
interop, the sanitiser + DoS security suite, registry-wide spec
invariants over all 281 components, the testing library, DevTools, the
standalone LSP server, and the editor-tooling surfaces (navigation,
semantic tokens, signature help, namespace members).

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

See [SECURITY.md](SECURITY.md) for the full threat model and reporting policy.
Two things are worth stating up front, because they are easy to conflate:

**The program text is trusted code.** By default an Aktion program can reach the
whole host realm — including `eval`, `Function`, `document`, and `fetch` — so
authoring a program is equivalent to shipping a JavaScript file. If your program
text comes from somewhere you do not fully trust (a prompt-injectable LLM, a
multi-tenant store, a user-editable template), narrow that surface first:

```ts
import { setGlobalAccessPolicy } from "aktion-runtime";
setGlobalAccessPolicy("safe"); // data + formatting only: no eval/DOM/network/storage
```

**Everything the program renders is untrusted data.** This is the surface the
sanitisers below defend, and it is the one that matters in the common case of a
trusted program rendering LLM output, API responses, URL parameters, or user
input. Note that the shadow DOM gives style encapsulation, not a security
boundary — script running inside a shadow root has the host page's full origin
privileges.

HTTP requests issued through `$http({...})` flow through your host's
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
| Inline SVG (`Svg`, `$theme({ icons })`)                                    | `sanitiseSvgMarkup`          | Parses in an inert document and applies an element/attribute **allow-list** — drops `<script>`, `<foreignObject>`, SVG `<a>` (whose `href` executes `javascript:`), `<style>`, `<image>`, SMIL `<animate attributeName="href">`, and all `on*`. Never assigns `innerHTML` on the live document. |
| Markdown text + attributes                                                 | text/attribute escapers      | Escapes attribute contexts as well as text (`alt`, fence info strings), decodes entities before scheme checks (`&#106;avascript:`), and isolates generated markup so a later pass cannot rewrite inside an earlier one. |
| `$head({...})` — title, meta, link, base, `htmlAttrs`                      | per-field allow-lists        | `<base>` limited to same-origin paths (an absolute base would re-target every relative URL in the **host** page); `<link>` limited to metadata/hint `rel` values (no `stylesheet`/`preload`/`modulepreload`); `<html>` attributes limited to `lang`/`dir`/`class`/`data-*`; attribute *names* validated so they cannot inject a second attribute into the SSR output. |
| `HTMLTag` attributes                                                       | tag + attribute allow-list   | Unknown tags collapse to `div`; `on*` dropped; `href`/`src` sanitised; `srcset`/`srcdoc`/`data`/`background` dropped; `target="_blank"` forced to carry `rel="noopener noreferrer"`. |
| Cookies (`storage.cookies`)                                                | attribute validation         | Name/value percent-encoded; `path`/`domain` validated so a `;` cannot append attributes; `SameSite` always emitted (default `Lax`).            |
| State path writes (`$a.b.c = …`)                                           | forbidden-segment check      | `__proto__` / `constructor` / `prototype` segments are refused, so an untrusted key cannot reach `Object.prototype`.            |
| CSV export (`DataGrid`)                                                    | formula-injection guard      | Cells starting `=`, `+`, `-`, `@`, TAB, or CR are prefixed so a spreadsheet reads them as text rather than a live formula.      |

External links rendered by `Link`, `NavbarItem`, and the Markdown
renderer get `rel="noopener noreferrer"` so the destination cannot
read the opener's `document.referrer`.

If you embed `<aktion-app>` behind a CSP: the runtime uses neither `eval`
nor `new Function` — action and effect bodies are interpreted from the AST
— so it does **not** require `'unsafe-eval'`. It does inject `<style>`
elements (theme tokens, component CSS, the `Styles` component) and emits
inline `style` attributes, so a strict CSP needs `style-src 'self'
'unsafe-inline'` or a nonce/hash strategy for those. Under the default
`"all"` policy a *program* can still reach `eval`/`Function` itself;
`setGlobalAccessPolicy("safe")` removes that reachability, which is what
makes a `script-src` without `'unsafe-eval'` meaningful when program text
is not fully trusted. Two outbound requests are worth allow-listing or
blocking deliberately: the Font Awesome stylesheet (`cdnjs.cloudflare.com`,
skippable by self-hosting and never calling `ensureFontAwesomeLoaded`) and, for
`theme="corporate"` only, its Google Fonts stylesheet — that one needs
`style-src`/`font-src https://fonts.googleapis.com https://fonts.gstatic.com`,
or self-hosted families and a `fontFamily` override. See
[SECURITY.md](SECURITY.md#content-security-policy)
and the [deployment guide](docs/deployment.html#csp) for the full policy.

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
5. Run `npm run build` to confirm the bundle, the system prompts, and the
   generated skill references still build. Gate any hand-authored `.aktion`
   file with `node tools/validate-aktion.mjs <file>`.
6. Open a pull request describing the motivation and any user-visible changes.

The rules in [`.cursor/rules/`](.cursor/rules/) keep the downstream artifacts in
sync with the code:

- [`readme-sync.mdc`](.cursor/rules/readme-sync.mdc) — when
  you change the public API, attribute set, component list, theme list,
  or build outputs, update this README in the same commit.
- [`editor-tooling-sync.mdc`](.cursor/rules/editor-tooling-sync.mdc) — the
  editors and the playground own **no** language logic. Add the behaviour to
  [`src/language-api.ts`](./src/language-api.ts) and let each adapter consume
  it; never hard-code component names, builtins, keywords, or theme names in a
  downstream artifact.
- When you add or change a component, builtin, theme, or authoring rule, the
  [agent skill](#agent-skill) has to follow: run `npm run build:skill` to
  regenerate its machine-derived references, and update the hand-written parts
  of [`skills/aktion/`](./skills/aktion/) so LLMs consuming this library don't
  generate broken code.

Issues, design discussions, and bug reports are tracked at
<https://github.com/asfand-dev/aktion/issues>.

By contributing you agree that your work will be released under the
project's MIT license.

---

## License

MIT — see [LICENSE](LICENSE).
