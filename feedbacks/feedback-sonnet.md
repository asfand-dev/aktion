# Aktion Library — Developer Feedback

**Perspective:** A developer evaluating Aktion for use in a new project, having read the full README, `coding-gen-skill.md`, docs site, and the source code.

---

## 1. What Is Complicated and Could Be Simplified

### 1.1 The naming convention system is a lot to internalize at once

Four parallel conventions exist and all of them are mandatory, not optional:

| Form | Meaning |
|---|---|
| `$name = value` | Reactive atom |
| `name = value` | Plain (non-reactive) binding |
| `function Name()` | Component (must return) |
| `function name()` | Action (return optional) |

Plus four reserved identifiers (`aktion`, `route`, `theme`, `$i18n`) and two sigil families (`$` for state, `@` for builtins). None of these conventions are enforced at parse time with a useful error — they're rules the runtime interprets silently. A new developer who writes `function dashboard()` (camelCase) and wonders why it doesn't render the UI the same way as `function Dashboard()` will spend non-trivial time debugging.

**Suggestion:** At a minimum, the runtime should emit a clear console warning like: `"function dashboard() is an action, not a component. Did you mean function Dashboard()?"` when a camelCase function is used where a component is expected.

---

### 1.2 The `effect()` dependency array mixes incompatible types in one array

```js
effect(() => {
  $save = Http({ url: "...", method: "PUT", body: $draft })
}, [$draft, "debounce(500)"])
```

Mixing reactive atoms (`$draft`) and string literals (`"debounce(500)"`, `"mount"`, `"every(30000)"`) in the same array is a design that saves vertical space but creates conceptual friction. A new developer can't tell what the first element type means versus the second without reading the docs. The fact that order inside the array doesn't matter — and that `"debounce"` applies to the whole effect, not just the atom next to it — is also non-obvious.

A more readable alternative would be separate named options:

```js
// hypothetical clearer API
effect(() => { ... }, {
  on: [$draft],
  rate: "debounce(500)"
})
```

---

### 1.3 `let`/`const`/`var` are "accepted as no-ops" — confusing, not helpful

The README says:
> `let`/`const`/`var` keywords are optional and have **no effect on reactivity**

But they're accepted without error. This means:
```js
const $count = 0  // const keyword is ignored; this is just $count = 0
let name = "Ada"  // let keyword is ignored; this is just name = "Ada"
```

This is a trap for JavaScript developers. `const` being a no-op is confusing; it creates false confidence about immutability. The right call is to either fully support `const` semantics (make reassignment a parse error) or reject the keyword with a clear message. Silently ignoring them is the worst option.

---

### 1.4 `Stack` vs. `Column`/`Row` — redundant primitives

The docs say: _"Use `Column`/`Row`/`Grid` — not raw `Stack`"_. The `coding-gen-skill.md` lists `Stack` in the anti-patterns table:

```
Raw Stack([...], { direction: "row" }) for a toolbar/row  →  Row([...], ...)
```

If `Stack` shouldn't be used, it creates confusion to have it in the library at all. A new developer will reach for `Stack` first (it sounds the most generic), only to later discover they should use `Column` or `Row`. Either remove `Stack` or remove `Column`/`Row` and make `Stack` the primary with cleaner direction props.

---

### 1.5 The plain binding re-seed-on-render behavior is a subtle footgun

From the docs:
> A plain binding is re-seeded from its initialiser on the next render. Use it as a scratch container during a render; reach for a `$state` atom when you need the value to persist across renders.

This rule is non-obvious and almost certain to confuse developers. If I write:
```js
cart = []
cart.push({ id: 1, qty: 1 })
```
...the `cart` gets reset to `[]` on the next render. This is not how JavaScript `let` works. Since the language looks like JavaScript, developers will expect JavaScript semantics.

---

### 1.6 Http() requires an absolute URL everywhere — friction in real projects

```js
$orders = Http({ url: "https://api.example.com/users/42/orders" })
```

In real projects, the API base URL changes between environments (dev, staging, prod). There is no `baseUrl` option and no way to configure a global URL prefix. Developers must either:
- Compute the URL in every call: `url: location.origin + "/api/orders"` 
- Use `registerHttpInterceptors` from the host — but that's not documented as the recommended solution for base URL configuration

**Suggestion:** Allow a `baseUrl` to be configured on the element (e.g., `data-base-url` attribute or via a method), which `Http()` prepends automatically.

---

### 1.7 No clear story for request de-duplication

If two components both declare `Http({ url: "https://api.example.com/users" })`, they fire two separate requests. There's no built-in request caching or de-duplication. This is a major difference from React Query / SWR that developers expecting data-fetching ergonomics will miss immediately.

---

## 2. Missing Features That Would Make Developer Life Easier

### 2.1 No DevTools / runtime inspector

React has React DevTools. Aktion has no equivalent. There's an `inspectAST` tooling export but no browser extension or panel that lets you:
- See the current reactive atom values
- Trace which state change triggered a re-render
- Inspect the current component tree
- See which effects are active

The playground has an inspection mode but it only shows AST structure, not runtime state. Without this, debugging reactive bugs is essentially `console.log` archaeology.

---

### 2.2 No TypeScript safety for Aktion programs

Aktion programs are strings. When embedded as:
```ts
app.setResponse(`
  $count = 0
  aktion = Button("Save", { varinat: "primary" })   // typo: "varinat"
`)
```
...the typo is invisible to TypeScript. There's no prop type checking, no autocomplete for component names or prop keys, and no "did you mean?" suggestions at authoring time.

The tooling layer exports `getDiagnostics`, `getCompletions`, and `getHoverInfo` — but these aren't wired into any mainstream editor extension. A VS Code extension shipping these capabilities would be transformative. Without it, a developer writing Aktion code by hand (outside the playground) works completely blind.

---

### 2.3 No WebSocket / Server-Sent Events primitive

`Http({})` handles REST. For real-time apps — live feeds, collaborative editing, notifications — you need WebSocket or SSE. The library suggests using raw `WebSocket` / `EventSource` APIs inside `effect()`:

```js
effect(() => {
  const ws = new WebSocket("wss://...")
  ws.onmessage = (e) => { $data = JSON.parse(e.data) }
  cleanup(() => ws.close())
}, ["mount"])
```

This works but it's not documented, not declarative, and entirely manual. A first-class `Subscribe({ url, protocol })` or `EventStream({ url })` primitive returning a reactive bag (similar to `Http`) would close a major gap for real-time applications.

---

### 2.4 No global / shared state across multiple `<aktion-app>` elements

Each `<aktion-app>` instance has its own isolated state store. If you have two elements on the same page, they can't share `$count`. There's no `SharedAtom` or context mechanism. Developers building multi-panel dashboards where panels share filter state, or apps where the sidebar and content area need synchronized state, will have to bounce events through the host page — which is cumbersome.

---

### 2.5 No accessibility props documented

The `components.html` prop tables list things like `label`, `icon`, `disabled`, but there are no explicit `aria-label`, `aria-describedby`, `role`, or `tabIndex` props documented. The library probably handles some ARIA internally (buttons have focus states, inputs have labels), but there's no guarantee of ARIA compliance for screen readers and no way to override internal ARIA attributes when the auto-generated ones are wrong.

For any public-facing product or enterprise app with accessibility requirements, this gap needs to be addressed and documented explicitly.

---

### 2.6 No form-level validation error access from within Aktion code

`Input` has a `validation` prop:
```js
Input("email", { validation: ["required", "email"], value: $email })
```
But there's no documented way to read the validation state from within an Aktion program. An action function can't check `if (emailInput.isValid)` before submitting. Validation errors are internal to the component with no external interface.

---

### 2.7 No pagination or infinite scroll primitive

The `Table` component has no built-in pagination. The `Pagination` component exists but how to wire it to a `Table` with client-side or server-side pagination is not documented end-to-end. A `PaginatedTable` composite or a clear recipe would save significant trial-and-error.

---

### 2.8 No built-in date picker with time support

The `DatePicker` component exists but the docs don't show whether it supports time selection (date+time), time zones, or date range picking (two-date range for filters). These are extremely common UI requirements.

---

### 2.9 State serialization is host-only — no `$persist` convenience

To persist state across page refreshes, you must either:
- Call `el.serializeState()` from the host and restore with `el.hydrateState()`, or
- Manually sync each atom with `effect(() => { storage.set("key", $val) }, [$val])`

The second pattern requires two effects per persisted atom (one for read on mount, one for write on change). A `$persist = persist("key", initialValue)` builtin or a `persisted: true` flag on state declarations would cut this boilerplate dramatically.

---

## 3. Things That Should Be Removed or Are Unnecessary

### 3.1 `Stack` — superseded by `Column`, `Row`, and `Grid`

The docs already say not to use it. Its existence adds cognitive load without adding capability. It should be deprecated in the next minor version and removed in a major version.

---

### 3.2 `@FilterBy` — an alias for `@Filter`

From `src/language/builtins.ts`:
```
FilterBy: { description: "Alias for `@Filter` — filter an array by a field/operator/value comparison." }
```

Aliases for builtins double the API surface without adding capability. If `@Filter` is the canonical name, remove `@FilterBy` (or at minimum, remove it from the generated system prompt so LLMs don't use it).

---

### 3.3 Multiple ways to set the program

There are currently five equivalent ways to set an Aktion program on an element:

1. `response` attribute
2. Element inner text (parsed on connect)
3. `el.response = text` (property setter)
4. `el.setResponse(text)` (method)
5. `el.loadSnapshot({ programText, state })` (method, for state + program)

Ways 2, 3, and 4 are all equivalent. For streaming there's `el.appendChunk()`. This is five APIs doing essentially the same thing. New developers reading the docs and the framework integration snippets encounter all of these and wonder which is "correct."

A clear hierarchy (attribute for static, `setResponse` for dynamic, `appendChunk` for streaming) should be enforced with deprecation notices for the others.

---

### 3.4 `async function` being silently accepted as a no-op modifier

The parser accepts `async function save() { ... }` but `async` has no effect on the function. Meanwhile, `await` IS supported inside action and effect bodies (the runtime wraps them as async). This inconsistency — where `async` keyword is a no-op but `await` works — will confuse developers who write `async function loadData() { const data = await fetchSomething() }` and wonder why the function behaves like a synchronous action.

Either fully support `async function` semantics or reject the `async` keyword with a clear error.

---

### 3.5 The visual editor on the docs site

The visual editor (`visual-editor.html`) is impressive in scope but feels underpowered compared to the playground. The drag-and-drop editor and the code editor are solving the same problem (building Aktion programs) for the same audience. In its current state the visual editor feels like it's splitting attention without closing the gap on either front. Either invest in making it production-quality or remove it and direct users to the playground.

---

## 4. Documentation Gaps and What Could Be Improved

### 4.1 The `coding-gen-skill.md` is the deepest reference but it's written for LLMs

The authoring guide is excellent, but it's formatted and phrased for an LLM to consume as a system prompt context — not for a human developer learning the library. The "Audience: You are an LLM..." opening alone signals this. The result is that the richest reference document in the repository is hard for human developers to use directly.

**Suggestion:** Create a human-readable `AUTHORING.md` or a dedicated docs page (`/authoring`) that covers the same depth as `coding-gen-skill.md` but is written as a tutorial for developers, not as instructions for an AI.

---

### 4.2 No error message catalog

When a program fails to parse or render, the `error` event fires with `{ errors: ParseError[] }`. But there's no documented catalog of what error messages look like, what they mean, and how to fix them. A developer seeing `"Unexpected token '{'  at line 3"` has no reference to turn to.

---

### 4.3 Component catalog lacks live demos

The `components.html` page has excellent prop tables and signature summaries. But for the vast majority of the 170+ components, there are no live previews — you have to go to the playground and write code from scratch to see what the component looks like. Every component card should have a minimal live example inline, matching the pattern of the language and layout docs pages.

---

### 4.4 The `applyDelta` API is undocumented on the docs site

`applyDelta(ops)` is documented in the README's API table and exported from `aktion/tooling`, but there is no docs page explaining the `DeltaOp` protocol, when to use it (vs. `setResponse`), or concrete examples. This is a significant capability (structured program editing without replacing the whole program) that is invisible to most users.

---

### 4.5 "One positional argument max" rule has no user-facing error

The "Component accepts at most one positional argument" rule is documented but when violated, the runtime silently ignores the extra arguments or produces unexpected behavior. There should be a clear runtime warning:
```
Warning: Button() received 3 positional arguments. Only 1 is allowed; put extras in the options object.
```

---

### 4.6 The `Http` docs don't address auth patterns clearly

The most common question from any developer integrating a backend API will be: "How do I attach a JWT token to every request?" The answer — `registerHttpInterceptors({ onRequest: (req) => ({...req, headers: {...req.headers, Authorization: "Bearer " + token}}) })` — is only mentioned briefly in the README and not on the `http.html` page. It should be the first thing shown after the basics.

---

### 4.7 No side-by-side React ↔ Aktion comparison

The `frameworks.html` page shows how to embed `<aktion-app>` in React. But it doesn't show the conceptual equivalent of common React patterns in Aktion:

| React pattern | Aktion equivalent |
|---|---|
| `useState` | `$count = 0` |
| `useEffect(() => {}, [dep])` | `effect(() => {}, [$dep])` |
| `useEffect(() => {}, [])` | `effect(() => {})` or `effect(() => {}, ["mount"])` |
| `useMemo` | Plain binding that reads `$state` |
| `useCallback` | Named action function |
| `useRef` | Not applicable (no direct DOM access) |
| `fetch` + `useEffect` | `$data = Http({ url: "..." })` |
| `Context` | Not available (program-level `$state` is effectively global within a program) |
| `React.lazy` | `Lazy(loader, { fallback })` |

A table like this would make the conceptual migration dramatically easier for React developers.

---

## 5. Additional Documentation Pages That Would Help

1. **Error reference** — A searchable catalog of every parse and runtime error with explanation and fix.

2. **Accessibility guide** — Which ARIA attributes are automatically added by which components, how to override them, and how to test with screen readers.

3. **Production deployment guide** — CDN setup, Content Security Policy (CSP) configuration for the shadow DOM and Font Awesome CDN, caching strategy, bundle size budgets.

4. **Performance guide** — When and why the runtime triggers re-renders, how to use plain bindings to avoid unnecessary subscriptions, the cost of large arrays with `.map()`, and how the runtime budget limits work in practice.

5. **Testing guide** — How to unit-test Aktion programs with Vitest/Jest and how to do integration testing with Playwright or Cypress. The library has its own test suite in `/tests/` — these patterns should be documented for users.

6. **Custom component development guide** — A full walkthrough of writing a `ComponentSpec`, using the `render()` helper utilities (`el`, `asString`, `asBoolean`), writing the DOM manipulation code, and distributing it as an npm package compatible with `registerComponents`.

7. **Security guide** — An explicit explanation of the shadow DOM isolation boundary, what `HTMLTag`'s sanitization blocks and what it allows, how the `lookupHostGlobal` passthrough (which exposes `eval`, `Function`, `fetch`, etc.) interacts with Content Security Policy, and guidance on sandboxing in high-security contexts.

8. **React/Vue/Angular migration guide** — Not just "how to embed the web component" but "how to replace a React component with an Aktion program at the feature level."

9. **Real-world cookbook** — End-to-end documented examples for: auth flow (login → protected routes → logout), CRUD admin panel with server pagination, multi-tenant theming, CSV export, drag-and-drop list, real-time dashboard with polling.

---

## 6. Can React Developers Migrate Future Projects to Aktion?

**Short answer: Not yet — but it's the right bet for a specific niche.**

### Where Aktion is genuinely ready and compelling

- **AI-first products.** If you're building a product where an LLM generates or customizes the UI at runtime, Aktion is the most coherent solution available. The streaming-first parser, the component library, the system prompt generator, and the reactive runtime are all designed specifically for this workflow. React has no equivalent.

- **Internal tools driven by AI.** Ops dashboards, admin panels, and reporting tools where a non-technical user types "show me this week's signups by region" and gets a live dashboard — this is Aktion's sweet spot and React has nothing close.

- **Rapid UI prototyping.** The CDN bundle + no build step + live preview is genuinely faster than React for getting something on screen.

### Where Aktion is not ready to replace React

1. **No SSR / full-stack integration.** Next.js, Remix, and Nuxt are deeply integrated into the JavaScript ecosystem. Aktion runs in a browser shadow DOM. There's no server rendering, no `<head>` management, no SEO-friendly output, no streaming HTML with hydration. React app developers building public-facing products can't migrate to Aktion today.

2. **No TypeScript throughout the authoring experience.** React developers are accustomed to full type safety in their component trees. Aktion programs are strings where prop typos fail silently at runtime.

3. **No testing story.** React Testing Library + Vitest is a mature, well-documented testing stack. Aktion has no equivalent. You can't write unit tests for individual Aktion components, you can't mock `Http()` calls in tests easily, and there's no guidance on integration testing patterns.

4. **No mature debugging tools.** Without DevTools, debugging reactive bugs is hard. React's time-travel debugging, strict mode double-render detection, and component tree inspection have no equivalents.

5. **Limited ecosystem.** React has tens of thousands of component libraries, hooks, and utilities. Aktion's ecosystem is zero third-party packages as of today. Features like rich text editors, map components, complex data grids, and virtualized lists require falling back to raw DOM APIs inside escape hatches.

6. **The authoring model is LLM-first, not developer-first.** The language syntax is designed to be easy for LLMs to emit token-by-token. The programming model — one statement per line, forward references, the specific naming conventions — is optimized for that use case. Human developers writing Aktion programs by hand are using a tool that wasn't designed for them as the primary author.

### The honest assessment

Aktion is v0.5 and genuinely impressive for what it sets out to do. React developers should evaluate it for embedding into AI-first products (chat interfaces, AI-driven dashboards, generative UI features) rather than as a wholesale replacement. The right adoption pattern is: **React drives the outer shell, authentication, routing to major sections, and data management; Aktion renders the AI-generated UI inside a panel or a conversation thread.**

For greenfield projects that are explicitly AI-first (where LLMs write most of the UI), Aktion is the most compelling option today. For traditional web apps, it's not ready.

---

## 7. Real-World Use Case Assessment

### Strong fit (use it now)

**1. AI chat interfaces with rich UI responses**
The library's core design — stream in tokens, progressively render — maps perfectly to "ChatGPT but with rich data visualizations." A user asks "show me our Q3 revenue by region" and the LLM responds with a `BarChart` + `Table` + `Stats` layout streaming in in real time. No other library has this streaming-first reconciler built in.

**2. AI-powered internal tools**
Operations teams, data analysts, and support agents benefit enormously from tools that generate their own interfaces. An agent workflow where an LLM generates a triage dashboard, a report, or a form on demand — and where non-developers can use it without touching code — is exactly what Aktion enables.

**3. Embeddable UI for SaaS products**
If you're building a developer tool or a SaaS product and want to let customers build custom dashboards or embed AI-generated reports, Aktion's `registerComponents` API lets you expose your own domain-specific components to the LLM.

**4. No-code / low-code platforms**
The playground, visual editor, and system prompt generator together form a credible foundation for a no-code product where users describe what they want and get a working UI.

**5. Prototyping and demo creation**
Drop one script tag, write 10 lines, have a live demo. This is faster than any other option for solo developers, designers, or product managers who need a working prototype quickly.

### Risky fit (wait for more maturity)

**1. Consumer web apps with SEO requirements**
No SSR, no `<meta>` management, no semantic HTML outside the shadow DOM. Google won't index content inside a shadow DOM reliably.

**2. Accessibility-critical applications**
The library handles some ARIA internally but there's no systematic documentation of ARIA compliance, no guaranteed keyboard navigation patterns, and no guidance for screen reader testing.

**3. Complex e-commerce flows**
Payment processing, multi-step checkout, address validation, and shopping cart synchronization across tabs require the kind of state management, error handling, and third-party SDK integration that Aktion doesn't yet make easy.

**4. Enterprise apps with compliance requirements**
CSP, audit logging, role-based access control within the UI, and WCAG 2.1 AA compliance all require features or documentation that don't exist yet.

**5. Teams without LLM integration**
If you're not using an LLM to generate the Aktion programs, you're hand-authoring a string-based DSL with limited tooling. The value proposition is significantly reduced without the LLM in the loop.

---

## Summary

Aktion is a genuinely novel library with a coherent vision: LLM-generated, streaming-first, declarative UI. Its core mechanics — the `$atom` reactivity, the component library, the streaming parser, the shadow DOM isolation — work well and are well-thought-out. The documentation is unusually good for a v0.5 library.

The gaps are around the developer experience for non-LLM authoring: no TypeScript support in programs, no DevTools, no testing story, limited debugging. These are the table-stakes features React developers take for granted.

The path forward that makes the most sense: lean into the LLM-first identity rather than competing with React on traditional developer-experience axes, ship the VS Code extension with real-time diagnostics and completions, and write a comprehensive "embedding Aktion in your React app for AI features" guide. That positions the library correctly and gives it the best chance of adoption by the React community as an additive tool rather than a replacement.
