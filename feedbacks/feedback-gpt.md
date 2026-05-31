# Aktion Developer Feedback — GPT Review

> Perspective: a senior front-end engineer evaluating `aktion-runtime` as a library I might embed in a real product, especially from a React/TypeScript background. I reviewed the public README, docs pages, source under [src/](src/), package/build setup, tests under [tests/](tests/), and existing examples.
>
> Date: 2026-05-31

## Executive Summary

Aktion is a genuinely strong idea: a framework-agnostic `<aktion-app>` web component that renders rich, interactive, streaming LLM-authored UI from a compact language. The project already includes much more than a renderer: parser, runtime, reactive state, component library, router, HTTP resource primitive, i18n, theming, icons, generated system prompts, docs, playgrounds, and a small language-service/tooling layer.

My honest assessment is that Aktion is very promising for LLM-generated UI, embedded widgets, internal tools, and rapid prototyping. It is not yet a general replacement for React for most product teams. The biggest reasons are developer experience gaps: authored programs are still strings, TypeScript/build-time validation is incomplete, the security model is too permissive for untrusted LLM output, the public package exports do not fully match the documented tooling story, and several lifecycle/reset semantics require reading source to understand.

The core technology feels real. The adoption story needs tightening.

---

## What The Library Offers

From a developer user's perspective, Aktion currently offers these major capabilities:

- **Single web component integration**: load the bundle, mount `<aktion-app>`, and feed it program text via `response`, inner text, `setResponse()`, or streaming `appendChunk()`.
- **Streaming-first DSL**: the parser accepts partial programs and lets the UI progressively commit as an LLM response arrives.
- **Reactive state**: `$name = value` declares state; assignments to `$name` trigger re-rendering; member writes like `$form.email = value` rebuild roots immutably.
- **User components and actions**: `function PascalCase(...) { return ... }` declares UI components, while `function camelCase(...) { ... }` declares actions/event handlers.
- **Effects**: `effect(() => { ... }, [...deps])` supports state triggers, lifecycle triggers, polling, debounce, throttle, timers, and cleanup.
- **HTTP resource primitive**: `Http({ url, method, headers, body, query, ... })` returns a reactive bag with `data`, `error`, `loading`, `status`, `headers`, `lastUpdated`, `refetch()`, `cancel()`, and `onDone`.
- **Router**: a hash-based `Router({ "/": Home(), "/users/:id": UserPage(), default: NotFound() })` with `route.path`, `route.params`, `route.query`, and `route.navigate()`.
- **Large component library**: 170+ components across layout, forms, data, charts, navigation, feedback, chat, media, editors, app-shell patterns, helpers, and escape hatches.
- **Theming**: built-in themes plus token overrides through `theme` attribute, `setTheme()`, or `theme = Theme({...})` inside the program.
- **i18n**: `i18n({ locale, messages, fallback })`, `t(key, vars?)`, and locale-aware formatting hooks.
- **Storage and console globals**: `storage.local/session/cookies` and `console.*` are directly usable.
- **Full host JavaScript globals**: actions/effects can access `window`, `document`, `fetch`, `crypto`, `navigator`, `localStorage`, timers, browser dialogs, etc.
- **DOM reconciliation**: the renderer diffs fresh output against live DOM and preserves focus, input selection, scroll state, `<details>.open`, and component-local state.
- **Custom components**: host apps can call `el.registerComponents([...])` with `ComponentSpec` renderers.
- **System prompt generation**: `getSystemPrompt()` and generated prompt text files teach an LLM how to emit Aktion.
- **Tooling source exists**: formatter, delta protocol, AST inspector, diagnostics, completions, hover, and migration helpers exist under [src/tooling/](src/tooling/).

That is a broad surface. The breadth is impressive, but it also creates much of the complexity below.

---

## 1. Things That Feel Complicated And Could Be Simplified

### 1.1 The “strict JavaScript subset” claim is confusing

The README repeatedly frames Aktion as a strict subset of JavaScript where every program is valid JavaScript. That is only partly true.

This is valid JavaScript-shaped code:

```js
$count = 0
function Counter() {
  return Text(`Count: ${$count}`)
}
aktion = Counter()
```

But core documented examples use `@` builtins:

```js
total = @Sum($prices)
label = @Plural(count, "item", "items")
```

`@Sum(...)` is not normal JavaScript expression syntax. It is Aktion-specific syntax. A developer will eventually discover this, but it weakens trust in the “strict subset” language.

**Suggestion:** describe Aktion as a “JavaScript-shaped DSL with a small number of explicit extensions: `$` reactive atoms and `@` builtins.” That is clearer and still compelling.

### 1.2 Too many mental models show up early

To write a non-trivial Aktion program, a developer must understand all of these at once:

1. `aktion = ...` as the reserved render root.
2. `$name = value` as reactive atom declaration.
3. `function Name() { return ... }` as component declaration.
4. `function name() { ... }` as action declaration.
5. Inline lambdas like `onClick: () => $open = true`.
6. `effect(() => { ... }, [...deps])` for side effects.
7. `Http({...})` resources and their mutable bags.
8. The router’s reserved `route` object.
9. Component calls with one positional argument and a trailing object.

React has its own complexity, but a React developer has strong IDE help, type checking, and mature lint rules. Aktion currently asks the developer to learn a new mental model in a string language with weaker tooling.

**Simplification direction:** introduce an official “small core” teaching path:

```js
// Level 1: static UI
aktion = Card([Text("Hello")])

// Level 2: state and action
$count = 0
function increment() { $count += 1 }
aktion = Button(`Count ${$count}`, { onClick: increment })

// Level 3: HTTP
$todos = Http({ url: "https://api.example.com/todos" })
aktion = Async($todos, { data: TodoList($todos.data) })
```

Then push effects, custom components, delta protocol, snapshots, and raw JS globals into advanced pages.

### 1.3 PascalCase vs camelCase is too invisible

The convention is powerful but subtle:

```js
function TodoList(items) { return Column(items.map(TodoRow)) } // component
function todoList(items) { return Column(items.map(TodoRow)) } // action, not component
```

A React developer understands component names are conventionally uppercase, but in React a lowercase function is still a function they can call from JavaScript. In Aktion, naming affects how the parser/runtime classifies the declaration.

**Suggestion:** add a dedicated diagnostic when a lowercase action returns a component node or is called from `aktion =`. The message should say:

```text
function todoList(...) returns UI but is camelCase, so Aktion treats it as an action.
Rename it to TodoList(...) to render it as a component.
```

### 1.4 Effect dependencies use magic strings

Effects mix atoms and strings in one array:

```js
effect(() => {
  $results = Http({ url: "https://api.example.com/search", query: { q: $q } })
}, [$q, "debounce(300)", "mount"])
```

This is compact for LLM output, but it is not ergonomic for human developers:

- Typing `"debouce(300)"` instead of `"debounce(300)"` is easy.
- String payloads do not autocomplete well.
- Combinations like `"mount"`, `"every(1000)"`, and `"debounce(300)"` need clearer rules.
- The dependency array has three meanings at once: data dependencies, lifecycle triggers, and rate modifiers.

**Suggestion:** keep the current syntax for backward compatibility and LLM brevity, but add a structured form for developers:

```js
effect(() => {
  $results = Http({ url: searchUrl, query: { q: $q } })
}, { deps: [$q], debounce: 300, run: "mount" })
```

Even if the runtime keeps the string syntax, the docs should clearly mark it as the compact form and teach the structured form first once it exists.

### 1.5 HTTP is simple, but the re-fetch model is subtle

`Http({...})` is a good primitive. The hard part is that a request does not automatically re-run when atoms used inside its config change. Developers need to know when to use:

```js
$todos = Http({ url: endpoint })
$todos.refetch()
```

versus:

```js
effect(() => {
  $results = Http({ url: endpoint, query: { q: $query } })
}, [$query, "debounce(300)"])
```

versus:

```js
$patch = Http({ url: endpoint + "/" + id, method: "PATCH", body: payload })
$patch.onDone = () => { $todos.refetch() }
```

Those are three valid patterns. The docs explain them, but as a developer I still want a decision tree: “one-shot query,” “query depends on state,” “mutation then refresh,” “polling,” “manual refresh,” and “cancelable upload.”

### 1.6 Response loading APIs need a lifecycle matrix

The element supports many ways to load or mutate a program: `response`, inner text, `setResponse()`, `appendChunk()`, `clear()`, `hydrateState()`, `loadSnapshot()`, and `applyDelta()`.

These are useful, but a host developer needs to know exactly which ones reset state, preserve state, re-plan the program, tear down effects, preserve instance state, keep HTTP resources, and dispatch errors.

**Suggested docs table:**

| API | Program text changes? | Clears `$` state? | Preserves user state? | Re-plans effects? | Main use case |
| --- | --- | --- | --- | --- | --- |
| `setResponse()` | Yes | Yes | No | Yes | Replace the whole LLM response |
| `appendChunk()` | Yes | Partially | Mostly | Yes when dirty | Streaming token output |
| `hydrateState()` | No | No | Yes | No full re-plan | Restore values into current program |
| `loadSnapshot()` | Yes | Replaces from snapshot | Yes, from payload | Yes | SSR/resume/conversation continuation |
| `applyDelta()` | Yes | No, starts from snapshot | Yes | Yes | Structured LLM edits |
| `clear()` | Yes, empty | Yes | No | Yes/teardown | Reset the element |

The exact values should be verified and kept in sync with [src/element.ts](src/element.ts), but this shape of table is what developers need.

### 1.7 Full JavaScript globals make the trust boundary hard to explain

The runtime intentionally resolves host globals like `window`, `document`, `fetch`, `crypto`, `navigator`, `localStorage`, `alert`, `prompt`, and `Function` as a final fallback in [src/runtime/evaluator.ts](src/runtime/evaluator.ts). This is powerful, but it changes the security model completely.

If the source is LLM-generated and user-influenced, it is not “safe UI markup.” It is a program with page-level capabilities. Shadow DOM isolates styles; it does not sandbox JavaScript capability.

**Simplification direction:** expose a capabilities mode:

```html
<aktion-app capabilities="ui,http,storage" globals="none"></aktion-app>
```

or host-side configuration:

```js
el.configureRuntime({
  allowGlobals: ["Math", "Date", "Intl"],
  allowRawHtml: false,
  allowRawCss: false,
  allowDialogs: false,
})
```

This would let Aktion be used safely in more real products.

### 1.8 The component library is broad, but discoverability suffers

The library includes layout, forms, charts, media, editors, advanced data, app shells, helpers, and escape hatches. That breadth is useful for LLMs because they can usually find a component. For human developers, 170+ choices can feel like an uncurated UI warehouse.

Examples of overlap that need clearer guidance:

- `PageHeader`, `SectionHeader`, `CardHeader`, `Hero`
- `Table`, `DataGrid`, `ComparisonTable`, `List`, `InfiniteList`, `VirtualList`
- `Input`, `SearchBar`, `Combobox`, `Select`, `MultiSelect`, `TagInput`, `MentionInput`
- `Modal`, `Drawer`, `Popover`, `HoverCard`, `Tooltip`
- `Theme`, `Css`, `Styles`, `HTMLTag`

**Suggestion:** maintain the full catalog, but teach opinionated “default choices.” For example: use `Column`/`Row`/`Grid` for layout, `Card` + `CardHeader` for grouped content, `FormControl` + `Input` for simple forms, `DataGrid` only when sorting/filtering/selection are needed, and `HTMLTag`/`Styles` only after all standard components fail.

### 1.9 Host theming and in-program theming are easy to mix up

There are multiple theme layers:

- `<aktion-app theme="dark">`
- `el.setTheme(...)`
- `theme = Theme({...})` inside the program
- host CSS variables on the element

This is flexible, but the precedence model should be more prominent. A design-system team will ask: who owns final tokens, the host app or the LLM response? Can an LLM override brand colors? Can the host lock tokens?

**Suggestion:** add a policy option such as `el.setThemePolicy({ allowProgramTheme: false })`. That matters for brand governance.

### 1.10 Some source comments and old concepts leak into the current API

I saw several signs of historical surfaces still visible in source comments or compatibility types:

- [src/runtime/state.ts](src/runtime/state.ts) still contains persistent `$$variable` adapter comments and `declarePersistent()`, but [src/parser/lexer.ts](src/parser/lexer.ts) rejects legacy `$$x` as removed.
- [src/runtime/http.ts](src/runtime/http.ts) contains `HttpDefaults` and `setDefaults()`, while the public docs correctly emphasize no host-wide HTTP defaults.
- [src/runtime/http.ts](src/runtime/http.ts) still has a `SubscriptionTransport` compatibility shim even though subscriptions were removed.
- [src/library/validate.ts](src/library/validate.ts) starts with advisory-warning wording, then later says 0.5 schema violations are fatal.

These may be harmless internally, but they make the codebase feel less settled to a prospective contributor.

---

## 2. Missing Features That Would Make Developer Life Easier

### 2.1 First-class authoring format and IDE support

The runtime is TypeScript, but authored Aktion programs are usually strings. That means no natural TypeScript checking, no normal import graph, no standard Prettier integration, and no editor-native diagnostics unless the playground or a host app wires the tooling manually.

I would strongly want:

- A `.aktion` file format.
- A VS Code extension using [src/tooling/language-service.ts](src/tooling/language-service.ts).
- Syntax highlighting, formatting, hover, completions, diagnostics, and snippets.
- A Vite plugin: `import dashboard from "./dashboard.aktion?raw"` with build-time validation.
- A CLI: `aktion check src/**/*.aktion`, `aktion format`, `aktion migrate`.

### 2.2 Fix or expose the documented tooling exports

This is one of the most concrete issues I found. The README says tooling helpers can be imported like this:

```ts
import { formatProgram, inspectAST, getDiagnostics } from "aktion-runtime";
```

But [src/index.ts](src/index.ts) does not re-export [src/tooling/index.ts](src/tooling/index.ts), and [package.json](package.json) only exposes `.`, `./style.css`, `./system_prompt.txt`, and `./system_prompt_chat.txt`. The source has tooling, but the public package export story does not appear to match the docs.

Similarly, [src/language/README.md](src/language/README.md) uses:

```ts
import { getLanguageSpec } from "aktion/language";
```

The actual package name is `aktion-runtime`, and there is no `./language` subpath export in [package.json](package.json). The root entry does export language helpers, but the documented subpath does not exist.

**Suggestion:** either add public `./tooling` and `./language` subpath exports, or re-export tooling from the root and update all docs to use only `aktion-runtime`. Add tests that assert the documented imports work against the built package.

### 2.3 Testing helpers for user-authored programs

Developers need to test their own programs, not just the runtime. A small testing package would help adoption enormously:

```ts
import { renderAktion, screen, fireEvent } from "aktion-runtime/testing";

const ui = await renderAktion(`
  $count = 0
  function inc() { $count += 1 }
  aktion = Button("Count " + $count, { onClick: inc })
`);

await fireEvent.click(screen.getByText("Count 0"));
expect(screen.getByText("Count 1")).toBeTruthy();
```

That should cover parse errors, schema errors, event dispatching, state snapshots, HTTP mocking, route navigation, and effects.

### 2.4 Host-side state subscriptions

The element has `serializeState()` and `hydrateState()`, which are useful for snapshots. Host apps often need live subscriptions:

```js
const unsubscribe = el.subscribeState("cartCount", (value) => {
  updateHeaderBadge(value);
});
```

Real examples: mirror `$cartCount` into a React header, persist `$draft` to a server-side session, track analytics when `$selectedPlan` changes, or debug state changes in a devtools panel. Without this, the host either waits for custom `emit()` calls or polls `serializeState()`.

### 2.5 A query/cache layer on top of `Http()`

The current `Http()` primitive is understandable and small, but production apps often need cache keys, request deduplication, stale-while-revalidate, background refresh, optimistic mutations with rollback, pagination helpers, infinite query helpers, and visible retry/backoff policies.

This does not need to replace `Http()`. It could be a higher-level primitive:

```js
$todos = Query({ key: ["todos", $filter], url: endpoint, query: { filter: $filter } })

function addTodo() {
  $create = Mutation({
    url: endpoint,
    method: "POST",
    body: { title: $draft },
    invalidate: [["todos"]]
  })
}
```

If you intentionally want only `Http()`, document that choice and provide recipes for common caching patterns.

### 2.6 Accessibility guarantees

With 170+ components, accessibility is not a nice-to-have. Enterprise teams will want to know whether `Modal` traps focus, whether `Drawer` restores focus, whether `DropdownMenu`/`CommandPalette`/`Tabs`/`Accordion` implement expected keyboard interactions, whether charts are screen-reader-readable, and whether `IconButton` labels are required and enforced.

Add an accessibility matrix, automated tests where possible, and manual screen-reader notes.

### 2.7 Security and capability controls

Because the language exposes full JS globals, `HTMLTag`, `Styles`, raw `fetch`, `document`, `localStorage`, `window`, and browser dialogs, I would not run untrusted LLM output in production without a capability system.

Missing controls I would want:

- Disable full global fallback.
- Disable `HTMLTag` and `Styles`.
- Restrict `Http()` to allowed origins.
- Restrict methods, for example `GET` only in chat/read-only mode.
- Block `localStorage`, `document.cookie`, dialogs, clipboard, and navigation unless explicitly enabled.
- Emit an audit event when the program attempts denied capabilities.

### 2.8 SSR, hydration, and first paint

The source exposes state snapshot/hydration APIs, but I did not see a complete story for server-rendering the initial UI, hydrating it inside the shadow DOM, and avoiding a blank first paint.

For production apps, especially dashboards and docs, I would want server render to HTML string, serialized initial state, hydrate without replacing DOM, documented server/client effect behavior, and documented `Http()` behavior on the server.

### 2.9 Devtools

A simple devtools overlay would make the reactive runtime far less mysterious. It should show current `$` atoms and values, computed-state dependencies, mounted effects, HTTP resources, router state, render count/timings, and recent parse/schema/runtime errors.

### 2.10 Forms validation model

The component catalog includes form UI and `ValidationSummary`, but real-world forms need a validation engine: required/min/max/pattern validators, cross-field validation, async validation, dirty/touched/submitted flags, server error mapping, and form-level disabled/loading/submitting states.

### 2.11 Bundle-size and performance data

For a “drop in one bundle” library, developers will ask immediately: minified/gzipped size, how much is parser vs components vs styles, parse/eval/render timings for common program sizes, reconciler performance with large lists, and recommended limits. The runtime budget is a good start; the missing piece is published benchmark data and practical guidance.

### 2.12 Custom component authoring guide

The docs show a small `ProductCard` custom component, but `RenderHelpers` is a deep API and deserves a full guide: `helpers.renderNode()`, `helpers.invoke()`, `helpers.bindState()`, `argMeta`, `stateRef`, `helpers.useInstanceState()`, `helpers.registerDisposer()`, typed props, cleanup, prompt integration, and language completions.

### 2.13 Better i18n and RTL documentation

The runtime has `i18n`, `t()`, and formatting support, but I did not see a dedicated docs page for internationalization. A real app needs message bundle examples, fallback behavior, interpolation rules, plural rules, date/number/currency examples, RTL layout behavior, and runtime locale switching.

---

## 3. Things That Feel Unnecessary Or Could Be Removed/Scoped Out

### 3.1 Raw escape hatches should be opt-in

`HTMLTag` and `Styles` are sanitized, and I appreciate the effort in [src/library/components/escape-hatch.ts](src/library/components/escape-hatch.ts). Still, they undermine the clean “component catalog” contract.

For trusted internal programs, they are useful. For LLM-generated UI, they are risky and hard to review. `Styles` can still substantially alter the rendered UI inside the shadow root. `HTMLTag` can create broad markup shapes that bypass component-level accessibility and design constraints.

**Recommendation:** keep them, but require host opt-in and omit them from the default chat prompt.

### 3.2 Font Awesome auto-loading should be configurable

Auto-loading Font Awesome from a CDN is convenient, but it creates a surprise network request, offline and intranet issues, privacy/compliance questions, version coupling, and possible duplicate icon frameworks in host apps.

Make icons pluggable or provide a local CSS import path as the default production recommendation.

### 3.3 Some advanced components may not belong in the core bundle

Components like `Gantt`, `DiffViewer`, `RichTextEditor`, `CodeEditor`, `Map`, `VideoPlayer`, `AudioPlayer`, `Lightbox`, `QueryBuilder`, and `VirtualList` are useful, but they feel like optional packages rather than core primitives.

The current “everything in one bundle” approach helps LLMs because the prompt can assume availability. It hurts teams that only need cards, forms, tables, and layout. A full CDN build can still exist, but npm consumers would benefit from core/advanced package boundaries.

### 3.4 Decorative themes can move to a gallery

`light` and `dark` are essential. Themes like `neon`, `pastel`, `glass`, `brutalist`, and `skyline` are nice demos, but they add product surface and QA burden. If they stay, make them copy-paste theme recipes rather than built-in runtime commitments.

### 3.5 Legacy compatibility code should be cleaned up

The codebase contains migration warnings and compatibility shims from older API ideas. Some are helpful, especially in [src/library/validate.ts](src/library/validate.ts). Others feel like internal residue: `SubscriptionTransport`, persistent `$$` state comments/API, legacy aliases after deprecation, and comments that describe fatal errors as advisory warnings.

### 3.6 `async function` as a no-op modifier is surprising

The parser accepts `async function` as a no-op modifier, while `await` is allowed in action/effect bodies. To JavaScript developers, `async function` has a very specific meaning. I would either implement real async semantics consistently or reject `async function` with a clear migration message.

### 3.7 Advanced program mutation APIs should be documented as advanced

`applyDelta()`, `loadSnapshot()`, and `hydrateState()` are powerful. Most basic users should not need to think about them. Consider grouping them under an “advanced/resumability” docs section, even if the methods remain on the element for compatibility.

---

## 4. Documentation That Needs Improvement

### 4.1 Public API/export documentation is currently inconsistent

The tooling and language import docs do not appear to match [package.json](package.json) and [src/index.ts](src/index.ts). This should be fixed before a developer tries to build editor tooling from the docs.

Concrete fixes:

- Add public `./tooling` and `./language` subpath exports, or remove subpath examples.
- Re-export tooling from [src/index.ts](src/index.ts) if the README keeps `from "aktion-runtime"` examples.
- Add tests that assert documented imports work against the built package.

### 4.2 The docs mention a `ctx` bridge that I could not verify

[docs/side-effects.html](docs/side-effects.html) includes an example:

```js
const sentinel = ctx.host.shadowRoot?.querySelector("[data-sentinel]")
```

and several docs cards refer to a `ctx` bridge. I did not find a `ctx` global in the evaluator’s identifier resolution. If `ctx` is intended, it needs implementation and docs. If it is old, remove it from docs.

This matters because examples with nonexistent globals are adoption killers: developers copy them first.

### 4.3 Add an architecture/lifecycle page

I want one page that explains:

```text
source text
  -> tokenize
  -> parse
  -> schema validate
  -> plan program
  -> declare state
  -> install bindings/actions/effects
  -> evaluate aktion root
  -> render component nodes
  -> morph live DOM
```

Also explain when effects mount/unmount, when computed state re-derives, when HTTP fires, and when renderer instance state is preserved.

### 4.4 Document error categories

Errors can come from lexer/parser errors, schema validation errors, runtime budget aborts, entry-point evaluation errors, component render errors, action exceptions/rejections, effect exceptions, and HTTP errors as resource state.

These do not all surface the same way. Developers need a table showing which ones dispatch `error`, which appear in `showerrors`, which only log to console, and which are represented in UI state.

### 4.5 Make the security model explicit

The docs should not imply that shadow DOM equals safety. A more honest model:

```text
Aktion isolates CSS by default.
Aktion does not sandbox JavaScript by default.
Programs can access host globals unless the host disables them.
Only run trusted programs, or configure a restricted capability policy.
```

This should be on the README, JavaScript interactions page, and system prompt docs.

### 4.6 Component docs need “when to use” guidance, not only prop tables

The component reference is useful, but prop tables are not enough for a large catalog. Add human guidance such as:

- Use `PageHeader` at the top of a page, `SectionHeader` inside a page region, and `CardHeader` inside cards.
- Use `Table` for static display, `DataGrid` for interactive sorting/filtering/selection, and `VirtualList` for large scrollable lists.
- Use `Select` for short fixed lists, `Combobox` for searchable long lists, and `MultiSelect` for multiple values.
- Use `Modal` for blocking decisions, `Drawer` for side-panel detail, and `Popover` for small contextual controls.

This is exactly the kind of guidance that helps both developers and LLMs.

### 4.7 Add response/state lifecycle docs

As described earlier, the host APIs need a reset/preservation matrix. This should live in the public API section, not only source comments.

### 4.8 Add accessibility docs

Add an “Accessibility” page with component-by-component status, keyboard interactions, focus management, ARIA roles/attributes, known gaps, and testing approach.

### 4.9 Add performance docs

Document runtime budget defaults, expected program sizes, large list strategy, `VirtualList`/`InfiniteList` guidance, bundle size, cost of charts/media/editors, and how to profile renders.

### 4.10 Add production integration recipes

I would like copy-pasteable guides for streaming from OpenAI/Anthropic/local LLMs into `appendChunk()`, auth headers and token refresh with `registerHttpInterceptors()`, CORS and absolute URL recommendations, error logging, state persistence and restore, multi-tenant theming, CSP setup, and offline/self-hosted assets.

---

## 5. Additional Documentation Pages Or Resources To Add

If I were organizing the docs for adoption, I would add these pages:

1. **Architecture and Lifecycle**: parser, planner, evaluator, renderer, effects, reconciliation.
2. **Security Model**: trust boundary, capabilities, globals, raw HTML/CSS, HTTP restrictions, CSP.
3. **Authoring Setup**: `.aktion` files, VS Code extension, formatter, linting, build plugin.
4. **Testing Aktion Programs**: unit tests, interaction tests, mocked HTTP, route tests.
5. **Production Integration**: streaming LLM responses, auth, logging, deployment, self-hosting.
6. **Performance Guide**: bundle size, runtime budgets, large data, profiling, benchmarks.
7. **Accessibility Matrix**: every interactive component and its keyboard/screen-reader contract.
8. **Custom Components Deep Dive**: `ComponentSpec`, `RenderHelpers`, prompts, typed props, cleanup.
9. **State and Resumability**: snapshots, hydration, deltas, state lifecycle, host subscriptions.
10. **HTTP Recipes**: CRUD, search, polling, mutation refresh, optimistic update, retry, cancellation.
11. **i18n and RTL**: message bundles, locale switching, pluralization, direction, formatting.
12. **Design System Integration**: token mapping, theme locking, brand governance, icon provider setup.
13. **Troubleshooting**: common parser errors, schema errors, missing components, shadow DOM styling surprises.
14. **React Adoption Patterns**: using Aktion as an island inside React, not replacing the whole app.

---

## 6. Can React Developers Migrate Future Projects To Aktion?

### Short answer

React developers can adopt Aktion for specific future features, especially LLM-generated or embedded UI. I would not recommend migrating a full React product to Aktion today unless the product is intentionally centered on LLM-authored interfaces and accepts the current tradeoffs.

### Where React developers will feel comfortable

Aktion maps well to familiar ideas:

| React idea | Aktion equivalent |
| --- | --- |
| Root component | `aktion = App()` |
| Component | `function App() { return ... }` |
| State | `$count = 0` |
| Event handler | `function save() { ... }`, `onClick: save` |
| Effects | `effect(() => { ... }, [$dep])` |
| Conditional render | ternary or helper function |
| List render | `$items.map(item => Row(item))` |
| Client-side route | `Router({ ... })` |
| Data fetch | `Http({...})` and `Async(...)` |

The biggest delight is how little host integration is required. A React team can embed Aktion as a custom element without changing the rest of the app.

### Where React developers will hesitate

React teams will miss TypeScript checking of UI code, JSX/TSX ecosystem support, mature test utilities, React Query/TanStack Query-level data management, Storybook workflows, existing design-system components, SSR integration, devtools, the npm component ecosystem, and a familiar security model for rendering untrusted content.

### Recommended migration pattern

Use Aktion as an island:

```tsx
function AssistantPanel({ program }: { program: string }) {
  const ref = useRef<HTMLElement & { setResponse(text: string): void }>(null);

  useEffect(() => {
    ref.current?.setResponse(program);
  }, [program]);

  return <aktion-app ref={ref} theme="light" />;
}
```

This is excellent for AI assistant responses, generated dashboards, internal admin panels, workflow builders, report previews, and prototypes.

I would not rewrite a mature React app into Aktion unless the team is deliberately replacing hand-authored UI with generated UI as a product strategy.

### Readiness verdict

Aktion is ready for experimental production islands, internal tools, embedded generated UI, chat assistant rich responses, and controlled/trusted program sources.

Aktion is not yet ready as a broad React replacement for large customer-facing SPAs, heavily branded design-system apps, SEO/SSR-heavy products, security-sensitive untrusted LLM rendering, apps with very complex state/data synchronization, or teams that require full TypeScript coverage for every UI unit.

---

## 7. Real-World Use Cases

### 7.1 LLM-generated chat UI

This is the clearest fit. Instead of returning Markdown, an assistant can return:

```js
aktion = Card([
  CardHeader("Order summary", { subtitle: "3 items" }),
  Table([
    Col("Item", $order.items.name),
    Col("Qty", $order.items.qty),
    Col("Price", $order.items.price)
  ]),
  FollowUpBlock([
    FollowUpItem("Track shipment"),
    FollowUpItem("Start a return")
  ])
])
```

That is much richer than Markdown and still streamable.

### 7.2 Internal dashboards and CRUD tools

Aktion has enough layout, form, table, HTTP, async, and chart components to build many internal tools quickly:

```js
$tickets = Http({ url: "https://api.example.com/tickets" })
$status = "open"

visible = @Filter($tickets.data ?? [], "status", "==", $status)

aktion = Column([
  PageHeader("Support queue"),
  Select("status", { value: $status, items: [
    SelectItem("open", "Open"),
    SelectItem("closed", "Closed")
  ]}),
  Async($tickets, {
    loading: LoadingState("Loading tickets"),
    data: DataGrid([
      Col("Subject", visible.subject),
      Col("Priority", visible.priority)
    ])
  })
])
```

### 7.3 Embedded widgets

The Shadow DOM boundary and one-tag integration make Aktion a good fit for widgets embedded into arbitrary host pages: support tools, quote calculators, lead forms, onboarding checklists, report cards, and partner portals.

### 7.4 Agent-built workflow screens

If an AI agent needs to construct a temporary UI for a task, Aktion is well aligned. The component catalog gives the agent a constrained vocabulary, and the host can stream updates.

### 7.5 Documentation and education

The live examples pattern is strong: code on one side, rendered output on the other. Aktion can power interactive docs, tutorials, and playgrounds with very little setup.

### 7.6 Weaker use cases

Aktion is less compelling for large branded SaaS applications with mature design systems, complex collaborative editors, SEO-heavy public sites, and untrusted third-party program execution. In those cases it can still work as an embedded island, but I would not make it the whole app framework yet.

---

## 8. Prioritized Recommendations

### Highest impact

1. Fix public exports and docs for tooling/language imports.
2. Add a security/capability model or clearly document that programs must be trusted.
3. Ship first-class IDE support or at least a CLI checker/formatter.
4. Add response/state lifecycle documentation.
5. Add custom component authoring documentation for `RenderHelpers`.
6. Publish accessibility and performance status.

### Medium impact

1. Add `.aktion` files and a Vite plugin.
2. Add testing helpers for authored programs.
3. Add host state subscription APIs.
4. Add query/cache helpers or recipes on top of `Http()`.
5. Make Font Awesome loading configurable.
6. Move advanced components/themes toward optional packages or documented “full build” vs “core build.”

### Nice to have

1. Devtools panel.
2. Component marketplace/registry.
3. React-to-Aktion migration examples for common UI patterns.
4. Advanced form validation engine.
5. SSR/static rendering prototype.

---

## Final Opinion

Aktion has a real niche and a strong technical foundation. The best version of it is not “React but smaller.” It is “a safe, streamable UI runtime for LLM-authored interfaces that can live inside any app.” That is a valuable product category.

To get there, the project should narrow the beginner-facing story, harden the trust boundary, make package exports match documentation, and invest in authoring tools. Once those are in place, React developers will be much more comfortable adopting Aktion for future AI-native surfaces, even if they keep React for the main application shell.

My recommendation: position Aktion as a production-capable generated-UI island today, and as a possible app framework later once IDE, security, testing, SSR, and data-layer stories mature.