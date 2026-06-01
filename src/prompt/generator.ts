/**
 * System prompt generator — Aktion.
 *
 * Produces an ordered system prompt that teaches an LLM how to author
 * Aktion — a declarative language whose surface syntax is a strict subset
 * of JavaScript. Two flavours ship side-by-side:
 *
 *   - `"full"` (default): teaches every language feature — reactive state,
 *     components, actions, effects, `$http({...})`, routing, builtins,
 *     helpers, theming — plus the entire component library. Use when
 *     generating full applications.
 *
 *   - `"chat"`: read-only subset that converts an LLM's prose reply into
 *     a rich UI — layout, content, data-presentation, charts, plus
 *     `FollowUpBlock`. No state, actions, HTTP, or routing.
 *
 * Public API (kept stable for the docs site and `<aktion-app>.getSystemPrompt`):
 *   - `generatePrompt(library, options?)` — returns the prompt string.
 *   - `describeComponentSpec(spec)` — formats a single component signature.
 *   - Types: `PromptMode`, `PromptOptions`, `ToolSpec`.
 */

import type { ComponentLibrary, ComponentSpec } from "../library/types.js";
import { findPositionalProp } from "../library/types.js";

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export interface ToolSpec {
  name: string;
  description: string;
  argsExample?: Record<string, unknown>;
  kind?: "Query" | "Mutation";
}

export type PromptMode = "full" | "chat";

export interface PromptOptions {
  mode?: PromptMode;
  preamble?: string;
  additionalRules?: ReadonlyArray<string>;
  examples?: ReadonlyArray<string>;
  tools?: ReadonlyArray<ToolSpec>;
  toolExamples?: ReadonlyArray<string>;
  toolCalls?: boolean;
  bindings?: boolean;
  inlineMode?: boolean;
  editMode?: boolean;
}

const ROOT = "aktion";

export function generatePrompt(
  library: ComponentLibrary,
  options: PromptOptions = {},
): string {
  return options.mode === "chat"
    ? buildChatPrompt(library, options)
    : buildFullPrompt(library, options);
}

export function describeComponentSpec(spec: ComponentSpec): string {
  return formatComponentSignature(spec);
}

/* -------------------------------------------------------------------------- */
/*  Section assembly                                                          */
/* -------------------------------------------------------------------------- */

function buildFullPrompt(library: ComponentLibrary, options: PromptOptions): string {
  // Reactive state and HTTP are core to Aktion. They are included by
  // default; the legacy `bindings` / `toolCalls` flags can still
  // force-disable them when a host wants a stripped-down prompt (e.g.
  // only structural rendering without state).
  const showState = options.bindings ?? true;
  const showHttp = options.toolCalls ?? true;

  const sections: string[] = [];
  sections.push(fullHeader(options.preamble));
  sections.push(fullCoreSyntax());
  sections.push(fullJavaScript());
  if (showState) sections.push(fullReactiveState());
  sections.push(fullComponentsAndActions());
  sections.push(fullEffects());
  if (showHttp) sections.push(fullHttp());
  sections.push(fullRouting());
  sections.push(fullGlobals());
  sections.push(fullEmitAndWrappers());
  sections.push(fullEscapeHatches());
  sections.push(fullThemingI18nIcons());
  sections.push(fullUtil());
  sections.push(fullHelpers());
  sections.push(fullComponentLibrary(library));
  if (options.inlineMode) sections.push(fullInlineMode());
  if (options.editMode) sections.push(fullEditMode());
  if (options.tools && options.tools.length > 0) {
    sections.push(toolsListSection(options.tools));
  }
  if (options.toolExamples && options.toolExamples.length > 0) {
    sections.push(examplesSection("Endpoint examples", options.toolExamples));
  }
  const examples = options.examples ?? fullDefaultExamples();
  if (examples.length > 0) sections.push(examplesSection("Examples", examples));
  if (options.additionalRules && options.additionalRules.length > 0) {
    sections.push(rulesSection(options.additionalRules));
  }
  sections.push(fullVerification());

  return sections.join("\n\n").trim() + "\n";
}

function buildChatPrompt(library: ComponentLibrary, options: PromptOptions): string {
  const sections: string[] = [];
  sections.push(chatHeader(options.preamble));
  sections.push(chatSyntax());
  sections.push(chatComponentLibrary(library));
  sections.push(chatUtil());
  if (options.tools && options.tools.length > 0) {
    sections.push(chatToolsList(options.tools));
  }
  const examples = options.examples ?? chatDefaultExamples();
  if (examples.length > 0) sections.push(examplesSection("Examples", examples));
  if (options.additionalRules && options.additionalRules.length > 0) {
    sections.push(rulesSection(options.additionalRules));
  }
  sections.push(chatStreaming());
  sections.push(chatImportantRules());
  sections.push(chatFinalVerification());

  return sections.join("\n\n").trim() + "\n";
}


/* -------------------------------------------------------------------------- */
/*  FULL mode                                                                 */
/* -------------------------------------------------------------------------- */

function fullHeader(preamble: string | undefined): string {
  const lead = preamble?.trim() ||
    "You are a UI engineer authoring complete, working applications in Aktion — a declarative language whose surface syntax is a strict subset of JavaScript. Every Aktion program is valid JavaScript; the runtime adds reactive semantics on top. Respond ONLY in Aktion: no prose, JSON, markdown, or HTML.";
  return `${lead}

Every response MUST start with \`${ROOT} = ...\` on the first line. Forward references are allowed — declare the shell first (\`${ROOT} = AppShell(...)\` for apps, \`${ROOT} = Column(...)\` or \`${ROOT} = Container(...)\` for pages, \`${ROOT} = MyApp()\` when you wrap a user component) and let children stream in below it.`;
}

function fullCoreSyntax(): string {
  return `## Core syntax

A program is a flat list of \`name = expression\` statements, one per line. Newlines terminate statements; semicolons are optional.

\`\`\`
${ROOT} = Column([header, kpis, table])     // root assignment (always first)
header  = PageHeader("Sales", { subtitle: "Q4 2026" })
$count  = 0                                  // reactive atom — '$' prefix is the contract
function Counter(label) { return Text(\`\${label}: \${$count}\`) }     // component (returns a render tree)
function inc() { $count = $count + 1 }       // action (no return — runs for side effects)
$effect(() => { $console.log($count) }, [$count])                       // declarative side effect
\`\`\`

### Three name conventions
- \`name = value\` — plain binding (not reactive). Captured once.
- \`$name = value\` — reactive atom. Reading subscribes; writing notifies.
- \`function name(...)\` — declares a component AND an action with that name. The same declaration works in both render position (its return value renders) and event-handler position (its body runs). First-letter case is NOT significant: \`function Card(...)\`, \`function card(...)\`, \`function SaveOrder(...)\`, and \`function saveOrder(...)\` are all valid.

### One hard rule — broken constantly, ALWAYS check
1. **Always invoke components with parentheses.** A component is a function — to render it you MUST call it. The bare identifier \`MyApp\` is a *reference to the function*; the rendered element is \`MyApp()\`. Even with no arguments, write \`MyApp()\`. So \`${ROOT} = MyApp\` is wrong — write \`${ROOT} = MyApp()\`. Inside arrays the same applies: \`Column([Header(), Body(), Footer()])\`, never \`Column([Header, Body, Footer])\`. The only exception is passing a component as a callback (e.g. \`render: UserCard\`) where the caller invokes it.

### Reserved top-level names
- \`${ROOT}\` — the UI root (REQUIRED, first line).
- \`theme\` — optional brand override (\`theme = $theme({...})\`).
- \`route\` — reactive router handle (\`route.path\`, \`route.params\`, \`route.navigate("/x")\`). NEVER declare \`route\` yourself.

### Component-call shape — One positional argument max (TRAILING-OBJECT RULE)
Every call takes **at most one positional argument**; every other argument lives in a trailing \`{ }\` object literal:

\`\`\`
Button("Save", { variant: "primary", loading: $isSaving })
StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%" })
Row([Card1(), Card2()], { gap: "m" })
\`\`\`

\`Button("Save", "primary", true)\` is a schema error — write the named-prop form instead. Every call site also accepts \`{ key: ... }\` to pin per-instance state across reorders.`;
}

function fullJavaScript(): string {
  return `## JavaScript is fully supported

Aktion is a strict subset of JavaScript — every standard JS feature works inside expressions, action bodies, effect callbacks, and lambdas. Use whichever style is clearest for the value you need to compute.

### In expressions (right-hand side of \`=\`)
Use **value-producing** JS — no \`if\`/\`switch\`/\`for\` statements here.

\`\`\`
// Ternary for branching
banner = $error ? Banner($error, { tone: "danger" }) : null
tone   = $value > 0 ? "success" : ($value < 0 ? "danger" : "muted")

// .map / .filter / .reduce for iteration
rows    = $todos.map(t => TodoRow(t))
visible = $todos.filter(t => !t.done).map(t => TodoRow(t))
total   = $cart.reduce((sum, item) => sum + item.price, 0)

// Object/array spread, destructuring, optional chaining, nullish coalescing
merged   = { ...$base, status: "done" }
[a, b]   = $points
name     = $user?.profile?.name ?? "Guest"

// Template literals — preferred over string concatenation
title = \`Found \${rows.length} \${$util.plural(rows.length, "result", "results")}\`

// Wrap a switch/match in a function and call it
function panelFor(tab) {
  switch (tab) {
    case "overview": return Overview()
    case "billing":  return Billing()
    default:         return Empty()
  }
}
panel = panelFor($tab)
\`\`\`

### In action / effect / lambda bodies
The full **statement** surface is available — \`if\`, \`else\`, \`switch\`, \`for...of\`, \`for...in\`, classic \`for\`, \`while\`, \`do…while\`, \`break\`, \`continue\`, \`try\`/\`catch\`/\`finally\`, \`throw\`, \`return\`. Plus all assignment operators (\`= += -= *= /= ??= ++ --\`) against \`$atoms\` and member chains rooted at one (\`$user.name = "Alex"\`).

\`\`\`
function submit(payload) {
  if (!payload.email) return
  for (let tag of payload.tags) $tags = [...$tags, tag]
  switch (payload.kind) {
    case "draft": $drafts = [...$drafts, payload]; break
    default:      $records = [...$records, payload]
  }
  $emit("submitted", { id: payload.id })
}
\`\`\`

### Timers — \`setTimeout\` / \`setInterval\`
\`setTimeout(fn, ms)\`, \`setInterval(fn, ms)\`, \`clearTimeout(id)\`, and \`clearInterval(id)\` are available and behave like their JS counterparts. They return a handle you can later clear. Timers are tracked by the runtime and torn down automatically when the program re-plans, so they never outlive the program — but you should still clear a \`setInterval\` you no longer need. Create them inside an \`effect\` (not at the top level, which would re-create them on every render) and clear them in the effect's \`cleanup\`.

\`\`\`
// Debounced search — restart a 300ms timer on every keystroke
function onType(q) {
  clearTimeout($searchTimer)
  $searchTimer = setTimeout(() => { $results = $http({ url: \`/search?q=\${q}\` }) }, 300)
}

// A ticking clock — start on mount, clear on unmount
$effect(() => {
  let id = setInterval(() => { $now = $util.now() }, 1000)
  cleanup(() => clearInterval(id))
}, ["mount"])
\`\`\`

Prefer \`$effect(..., ["every(1000)"])\` for a simple repeating effect; reach for \`setInterval\`/\`setTimeout\` when you need an imperative handle to clear, a one-shot delay, or a debounce/restart.

### Lambdas (arrow functions) — every JS form works
\`() => expr\`, \`x => expr\`, \`(x, y) => expr\`, \`(x = 0) => x\`, \`(...args) => sum(args)\`, and the multi-statement \`(x) => { ...; return ... }\` form. Long lambdas may continue onto the next line.

### Line continuations (matches JS ASI)
Any expression operator (\`.\`, \`?.\`, \`?\`, \`:\`, \`&&\`, \`||\`, \`??\`, comparison, arithmetic) at the **start** of the next line keeps building the same expression.

\`\`\`
filteredTodos = $todos
  .filter(t => t.category == $filter)
  .filter(t => t.title.includes($searchQuery))
\`\`\`

### Comments
Only \`// line\` and \`/* block */\` comments. No \`#\` shebangs.

### Forbidden in expression position
\`if\`, \`switch\`, \`for\`, \`while\`, \`try\` are statements — they cannot be assigned to a binding directly. Use a ternary, \`.map\`/\`.filter\`, or wrap them in a function.`;
}


function fullReactiveState(): string {
  return `## Reactive State

The \`$\` sigil is the only thing that makes a binding reactive. \`let\`/\`const\`/\`var\` keywords are optional and have no effect on reactivity.

\`\`\`
$count = 0
$user  = { name: "Ada", role: "Engineer" }
$todos = []
\`\`\`

### Read & write
- Read \`$name\` anywhere — auto-subscribes whoever reads it (component, derived value, effect).
- Write \`$name = ...\` from event handlers, effect callbacks, and lambda bodies — i.e. in response to an event, never while building the UI. \`+=\`, \`-=\`, \`*=\`, \`/=\`, \`??=\`, \`++\`, \`--\` work too. Member writes (\`$user.name = "Alex"\`) rebuild the root immutably so subscribers see a fresh reference.
- **Never write \`$state\` in render position.** A \`$name = ...\` that runs while the UI is being built schedules a re-render that re-runs the write — an infinite loop. This bites when a \`function\` that *declares* state is invoked to render (\`aktion = app()\` where \`app\` does \`$user = {...}\`): a lowercase \`function\` called that way runs as an action, so the assignment is a per-render write. To hold component-local state, make it a **PascalCase component** (then top-of-body \`$count = 0\` is a set-once per-instance declaration) or use the \`$state\` hook — both seed once and persist. (The runtime defends against the loop — it applies the write but skips the re-render and warns — but the pattern is still wrong.)

### Fine-grained reactivity (path-level)
Subscriptions are tracked at the **path** you read, not the whole atom. Reading \`$user.name\` subscribes to \`user.name\` alone: a write to a sibling field (\`$user.role = ...\`) won't re-render or recompute it, while replacing the whole atom (\`$user = ...\`) or writing a descendant still does. The same rule drives computed values and effect deps (\`$effect(..., [$user.name])\` fires only on \`name\` changes). Reading a whole object (\`$user\`) or indexing into an array (\`$rows[i]\`, the \`$rows.field\` pluck) subscribes at that object/array — so prefer reading the exact field you need (\`$user.name\`) to get the tightest updates. No selectors or special syntax — just read the path.

A component re-executes only when **its own inputs change** — its args (props) or a \`$state\` path its body read — like \`React.memo\` / Solid, but automatic. So \`ShowName($user.name)\` and \`ShowAge($user.age)\` are independent: changing \`$user.age\` re-runs only \`ShowAge\`. Args are compared shallowly, so (as in React) a fresh inline lambda prop each render makes the child re-render — hoist the handler to a stable binding to skip it.

### Per-instance state
\`$name = value\` inside a function body is per-instance when the function is used as a component. Two \`Counter()\` siblings each hold their own \`$count\`. Add \`{ key: id }\` at the call site to keep state attached when siblings reorder.

### Hooks — composable per-instance state
A function whose name starts with \`$\` is a **hook** (mirroring React's \`use*\` convention). Call hooks only at the top level of a component body (or another hook), in a stable order — never inside an \`if\`, loop, or callback. Hook state is per-instance and resets when the instance leaves the tree.

- \`$state(initial)\` → \`[value, setValue]\`, like React's \`useState\`. \`setValue(next)\` replaces the value; \`setValue(prev => next)\` derives it from the previous value. \`initial\` is evaluated once, on first render.
- \`$memo(() => compute, [deps])\` → a cached value, like React's \`useMemo\`. Recomputes only when a dependency changes (shallow \`Object.is\` compare); omit the deps array to recompute every render.
- \`function $name(...) { ... }\` declares a custom hook that composes the built-ins. Its \`$state\` / \`$memo\` calls attach to the component that called it.

\`\`\`
function $useCounter(start) {
  const [count, setCount] = $state(start)
  return { count: count, increment: () => setCount(c => c + 1) }
}

function Counter() {
  const c = $useCounter(0)
  const label = $memo(() => \`Count: \${c.count}\`, [c.count])
  return Stack([Text(label), Button("+1", { onClick: c.increment })])
}
${ROOT} = Counter()
\`\`\`

Reach for \`$state(...)\` when a component owns local state with explicit setters; the bare \`$name = value\` per-instance form above is the lighter option when an atom is written directly by the component's actions. \`$state\` and \`$memo\` are reserved hook names.

### Two-way binding (implicit)
Pass a \`$variable\` (or a member chain rooted at one — \`value: $form.email\`) as a value prop on any input/select/checkbox/switch/slider/picker and the runtime wires the change handler automatically. Add \`onChange: v => ...\` when you also need a side effect (debounced search, persistence, etc.).

\`\`\`
$draft = ""
$theme = "light"

field    = Input("draft",   { value: $draft })
darkMode = Switch("dark",   { value: $theme == "dark", onChange: on => $theme = on ? "dark" : "light" })
search   = Input("query",   { onChange: q => $results = $http({ url: \`https://api.example.com/search?q=\${q}\` }) })
\`\`\`

### Computed values
There is no separate "computed" tier — just compute. Every \`$\` reference inside an expression auto-tracks.

\`\`\`
$open  = $todos.filter((t) => !t.done)
$total = $util.sum($cart.price)
\`\`\`

### Global stores — \`$store({...})\`
For app-wide state shared across many components (no prop drilling), declare a **store** at the top level. Non-function entries are reactive **state**; function entries are **methods** that receive the store handle \`s\` as their first argument. Read state as \`store.field\` (fine-grained — subscribes to that slice) and call methods as \`store.method(args)\`. Mutate inside a method with \`s.field = …\`. The handle is an app-global singleton with reference-stable methods.

\`\`\`
cart = $store({
  items: [],                                          // state
  count: (s) => s.items.length,                       // getter-method → cart.count()
  total: (s) => $util.sum(s.items.map(i => i.price)),  // getter-method → cart.total()
  add: (s, item) => { s.items = [...s.items, item] }, // action → cart.add(item)
  clear: (s) => { s.items = [] },
})

function CartBadge() { return Badge(\`\${cart.count()} items\`) }                     // reads the store
function AddButton(item) { return Button("Add", { onClick: () => cart.add(item) }) } // calls a method
\`\`\`

Reads are fine-grained and per-component: changing \`cart.items\` re-renders only components that read \`items\`. Two-way binding works against a store field (\`Input(value: form.draft)\`). Use a \`Store\` for shared/global state; use a component's local \`$state\` / \`$name = …\` for state only one component owns.`;
}

function fullComponentsAndActions(): string {
  return `## Components & Actions

A \`function\` declaration creates BOTH a component (callable in render position; its return value is rendered) and an action (callable from an event handler; its body runs for side effects). The first-letter case of the name is NOT significant — \`function Card(...)\`, \`function card(...)\`, \`function SaveOrder(...)\`, and \`function saveOrder(...)\` are all valid. A function with no \`return\` simply renders nothing when invoked in a render position. The same applies to arrow-function bindings (\`Display = () => Card(...)\` and \`display = () => Card(...)\` both work).

### Components
A function used as a component returns a render tree. Parameters use standard JS defaults; destructured options are canonical. To render a component you MUST call it with parentheses — even when it takes no arguments. The bare identifier is just the function value.

\`\`\`
// Both forms work — case is not significant
function UserCard(user) { return Card([Text(user.name)]) }
function userCard(user) { return Card([Text(user.name)]) }
Display = () => ["apple", "banana"].map(function (e) { return Button(e) })
${ROOT} = Column([UserCard($currentUser), userCard($otherUser), Display()])
\`\`\`

\`\`\`
function UserCard(user, { tone = "default" } = {}) {
  $hover = false
  return Card([
    Avatar(user.name, { size: "md" }),
    Text(user.name, { variant: "large-heavy" }),
    Text(user.role, { tone: "muted" }),
    Badge(tone, { tone: tone })
  ])
}
\`\`\`

- \`children\` parameter is the implicit slot — the call site's positional argument is delivered into it.
- User-declared components shadow built-ins by name, so you can wrap library components with telemetry / per-app styling.
- Lambdas (\`row = item => Row(item)\`) are the right tool for one-off helpers that don't need their own component.
- A function that does not \`return\` anything simply renders nothing when called in a render position — the runtime treats the missing/undefined value as an empty fragment.

### Actions
A \`function\` whose body runs for side effects (rather than returning a render tree) acts as an action. Use as event handler (\`onClick: save\`) or as a value-producing expression (\`$result = greet("Ada")\`). The first-letter case of the name does not matter — \`save\` and \`Save\` are both valid.

\`\`\`
function save(item) {
  $items = [...$items, item]
  $save  = $http({ url: "https://api.example.com/save", method: "POST", body: { item } })
  $emit("saved", { id: item.id })
}

submitBtn = Button("Save", { onClick: save })
resetBtn  = Button("Reset", { onClick: () => { $count = 0; $message = "" } })   // inline lambda
\`\`\`

\`return\` is optional. Inside the body, the full JS statement surface is available (see *JavaScript is fully supported*).

### \`$emit("name", { detail })\`
Inside any action / effect / lambda, \`$emit("name", { detail })\` dispatches an outbound \`CustomEvent\` on the host \`<aktion-app>\` element. Reserved names: \`assistant-message\` (chat follow-up), \`error\`, \`route-change\`. Pick stable names; the host listens with \`el.addEventListener("name", ...)\`.`;
}

function fullEffects(): string {
  return `## Effects — Declarative side effects

\`$effect(() => { ... }, [...deps])\` runs declarative side effects. Dependency entries:

- \`$atom\` — re-run when this reactive atom changes.
- \`"mount"\` — run once when the surrounding scope mounts.
- \`"unmount"\` — run once when it unmounts.
- \`"every(N)"\` — re-run every N milliseconds.
- \`"debounce(N)"\` / \`"throttle(N)"\` — wrap the body with a trailing-edge rate limit.

\`$effect(() => { ... })\` (no second argument) is shorthand for \`["mount"]\`.

### Scope — top-level vs. component-local
Top-level effects mount on parse, tear down on \`setResponse\` / \`clear()\`. Effects inside a component body mount per-instance and tear down when the instance leaves the tree (clearing intervals, watched-atom subscriptions, and \`cleanup(fn)\` registrations).

\`\`\`
function LiveClock() {
  $now = $util.now()
  $effect(() => { $now = $util.now() }, ["every(1000)"])
  return Text($util.formatDate($now, "time"))
}

// Debounced search — re-issue the request when inputs change
$effect(() => {
  $results = $http({ url: "https://api.example.com/search", query: { q: $query, page: $page } })
}, [$query, $page, "debounce(250)"])

// Cleanup
$effect(() => {
  const onKey = e => { if (e.key == "/") $palette = true }
  document.addEventListener("keydown", onKey)
  cleanup(() => document.removeEventListener("keydown", onKey))
}, ["mount"])
\`\`\``;
}

function fullHttp(): string {
  return `## Data — \`$http({...})\`

\`$http({ ... })\` is the only HTTP primitive. Every call is self-contained — pass a full absolute \`url\`, an optional \`method\` (\`GET\` is the default), a convenience \`query\` object serialised into the URL, \`headers\`, \`body\`, and any other \`fetch\`-compatible option. There are NO host-wide defaults.

\`\`\`
$orders = $http({
  url:    \`https://api.example.com/users/\${$userId}/orders\`,
  method: "GET",
  query:  { limit: 5, status: "open" },   // → ?limit=5&status=open
  headers:{ "X-Tenant": $tenant }
})
\`\`\`

The request fires once when the binding mounts. To re-run it call \`$orders.refetch()\`, or wrap it in an \`$effect(..., [$dep])\` so it re-issues when a dependency changes.

### Reactive resource shape
\`\`\`
$orders.data         // parsed body (null until resolved)
$orders.error        // null on success
$orders.status       // HTTP status code, e.g. 200
$orders.loading      // true while in-flight
$orders.headers      // response headers as a plain object
$orders.lastUpdated  // ms-epoch of last successful response
$orders.refetch()    // re-issue the request
$orders.cancel()     // abort the in-flight request
$orders.onDone = fn  // callback fired each time the request settles
\`\`\`

### \`onDone\` — run something when the request settles
Assign \`onDone\` after creating the resource. It fires once every time the request completes — the initial load and every \`refetch()\`, on both success and error — and receives the resource bag as its argument. It does NOT fire for a request that was superseded or \`cancel()\`led. This is the idiomatic way to refresh a list after a mutation:

\`\`\`
$patch = $http({
  url:    endpoint + "/" + todo.id,
  method: "PATCH",
  body:   { isCompleted: !todo.isCompleted }
})

$patch.onDone = () => {
  $todos.refetch()
}
\`\`\`

### Writes — fire from an action
\`\`\`
function saveOrder(payload) {
  $save = $http({ url: "https://api.example.com/orders", method: "POST", body: payload })
  $save.onDone = () => { $orders.refetch() }
  $emit("assistant-message", { message: "Saved." })
}
\`\`\`

\`body\` objects are JSON-encoded automatically (a \`Content-Type: application/json\` header is added unless you set one). After a write, call \`.refetch()\` on the list resource to refresh it — either directly or from the write resource's \`onDone\`.

### \`Async\` wrapper — branch on resource state
\`\`\`
view = Async($orders, {
  loading: LoadingState("Loading orders…"),
  error:   ErrorState("Couldn't fetch orders"),
  empty:   EmptyState("No orders yet"),    // shown when data is null or an empty array
  data:    Table([Col("Item", $orders.data.title), Col("Total", $orders.data.total, { format: "currency" })])
})
\`\`\``;
}

function fullRouting(): string {
  return `## Routing

The router is a plain function call. Assign \`$router({ ... })\` to a binding and reference that binding from your shell.

\`\`\`
pages = $router({
  "/":             Dashboard(),
  "/orders":       OrdersPage(),
  "/orders/:id":   OrderDetail({ id: params.id }),
  "/settings/*":   SettingsArea({ rest: params._ }),
  default:         NotFound()
})

${ROOT} = AppShell(MainSidebar(), pages, TopBar())
\`\`\`

- Path patterns: literal \`"/about"\`, parameter \`"/users/:id"\` (read \`params.id\`), trailing wildcard \`"/docs/*"\` (read \`params._\`), \`default:\` for the catch-all.
- \`route\` handle (read-only): \`route.path\`, \`route.params.x\`, \`route.query.tab\`, \`route.pattern\`.
- \`route.navigate("/path")\` inside an action / effect changes the URL.
- \`NavLink(label, { to, exact?, icon? })\` and \`SidebarItem(label, { to, icon?, badge? })\` are router-aware anchors that auto-derive their active state from \`route.path\`.

NEVER declare a state slot named \`route\` yourself. Forget the \`default:\` arm and unknown paths render \`null\`.`;
}

function fullGlobals(): string {
  return `## Built-in globals — \`storage\` & \`console\`

Both are always in scope, lowercase. No imports.

\`\`\`
// localStorage (default); '$storage.local' is its alias
$storage.set("name", "John")
$name = $storage.get("name")
$storage.remove("name")

// sessionStorage (per-tab)
$storage.session.set("draft", $draft)

// Cookies — options as an object literal
$storage.cookies.set("user", "John", { expires: 7, path: "/", sameSite: "Lax" })
$storage.cookies.remove("user", { path: "/" })

// Console — forwards to host console
$console.log("Hello", $user)
$console.error("Failed", $error)
\`\`\`

Non-string values JSON-roundtrip; missing keys return \`null\`. Cookie options: \`expires\` (days/Date/ISO), \`maxAge\` (seconds), \`path\`, \`domain\`, \`secure\`, \`sameSite\`. Failures (quota, disabled storage) are swallowed silently.

### The full JavaScript global surface
Beyond \`storage\` and \`console\`, **every** JavaScript global resolves by name — the standard library (\`Math\`, \`JSON\`, \`Object\`, \`Date\`, \`Map\`, …), browser dialogs (\`alert\`, \`confirm\`, \`prompt\`), and Web APIs (\`fetch\`, \`URL\`, \`URLSearchParams\`, \`Blob\`, \`FormData\`, \`crypto\`, \`navigator\`, \`localStorage\`, \`atob\`/\`btoa\`, \`Intl\`, \`BigInt\`, …), plus \`window\` / \`document\`.

\`\`\`
function copyLink() {
  navigator.clipboard.writeText(window.location.href)
  $toast = "Link copied"
}
function remove(id) {
  if (confirm("Delete this item?")) { $items = $items.filter(x => x.id != id) }
}
id = crypto.randomUUID()
\`\`\`

Author declarations and built-in components always win over a same-named global, so the passthrough only fills in names you haven't defined. Prefer the reactive \`$http({...})\` over raw \`fetch\` for data that drives the UI, and keep timers/listeners inside \`$effect(...)\` so they're cleaned up.`;
}


function fullEmitAndWrappers(): string {
  return `## Behaviour wrappers

Six tiny wrappers attach behaviour or styling to ANY component without forcing every primitive to grow another prop. They render the child via \`display: contents\`, so the visual tree is unchanged — only the event / styling layer changes.

\`\`\`
// Clickable card
OnClick(Card([Text("View order")]),       { onClick: () => route.navigate("/orders/4821") })

// Lazy-load sentinel — fires once when scrolled into view
OnIntersect(Skeleton({ variant: "card" }), { onEnter: $items.refetch, once: true })

// Drop zone using HTML5 drag-and-drop
OnMouse(Card([Text("Drop files here")]), {
  dragOver: e => e.preventDefault(),
  drop:     e => { e.preventDefault(); $files = e.dataTransfer.files }
})

// Apply a class / inline style without breaking out of the component
Css(Card([Text("Highlighted")]), { class: "highlight", style: "border-color: #f59e0b;" })

// Router-aware anchor wrapping any node
Link(PersonChip("Ada Lovelace"), { to: "/people/ada" })
\`\`\`

- \`OnClick(child, { onClick, disabled?, stopPropagation? })\` — touch + mouse + keyboard (Enter/Space) activatable.
- \`OnMouse(child, { enter?, leave?, hover?, move?, down?, up?, click?, doubleClick?, contextMenu?, scroll?, wheel?, drag?, drop?, dragStart?, dragEnd?, dragEnter?, dragLeave?, dragOver?, draggable?, passiveScroll? })\` — pass only the events you need.
- \`OnKeyboard(child, { onKeyDown?, onKeyUp?, onKeyPress?, focusable? })\`.
- \`OnFocus(child, { onFocus?, onBlur? })\` — uses bubbling \`focusin\`/\`focusout\`.
- \`OnIntersect(child, { onEnter?, onLeave?, onChange?, threshold?, rootMargin?, once? })\` — IntersectionObserver wrapper.
- \`Css(child, { style?, class? })\` — last-resort raw CSS class/style merge.
- \`Link(child_or_label, { to?, href?, external?, variant? })\` — anchor primitive; \`to\` for router nav, \`href\`+\`external: true\` for outbound links.

Don't wrap a \`Button\` in \`OnClick\` — \`Button\` already exposes \`onClick\`. Use \`OnClick\` for clickable cards / list rows / custom layouts.`;
}

function fullEscapeHatches(): string {
  return `## Escape hatches — \`HTMLTag\` & \`Styles\`

Use only when the standard catalogue cannot express the markup or styling you need.

- \`HTMLTag(tag, { attributes?, children? })\` — render an allow-listed HTML tag. \`on*\` attributes, \`javascript:\` URLs, and unsafe \`style\` patterns are stripped; tag names outside the allow-list collapse to \`div\`.
- \`Styles(css)\` — inject a \`<style>\` block. Payloads containing \`</style>\`, \`<script>\`, \`expression(\`, \`javascript:\`, \`behavior:\`, or \`@import\` are dropped.

\`\`\`
${ROOT} = Column([
  Styles(\`.hero-callout { background: linear-gradient(135deg, #6366f1, #10b981); color: white; padding: 24px; border-radius: 12px; }\`),
  HTMLTag("div", { attributes: { class: "hero-callout" }, children: [
    HTMLTag("h2", { children: [Text("Custom block")] }),
    Text("Use these only when the standard library cannot capture the design.")
  ]})
])
\`\`\``;
}

function fullThemingI18nIcons(): string {
  return `## Theming, i18n & icons

### \`theme = $theme({ ... })\`
Assign before \`${ROOT}\` to brand the response. Tokens use the structured form — top-level groups \`colors\`, \`radius\`, \`font\`, \`motion\`, \`elevation\` (plus metadata: \`name\`, \`direction\`). Removing the line snaps the UI back to the host theme.

\`\`\`
theme = $theme({
  colors: { primary: "#635bff", bg: "#0a0a23", surface: "#10103a", text: "#fff" },
  radius: { md: "0.5rem", button: "999px" },
  font:   { family: "Inter, sans-serif", familyHeading: "Inter, sans-serif" }
})
\`\`\`

The host page picks one of seven base themes (\`light\`, \`dark\`, \`neon\`, \`pastel\`, \`glass\`, \`brutalist\`, \`skyline\`) via the \`theme\` attribute. Authored programs should be theme-neutral by default — pass \`tone:\` / \`variant:\` instead of hard-coded colours.

### i18n
\`\`\`
const { t, setCurrentLanguage, getCurrentLanguage } = $i18n({
  defaultLanguage: "en",
  currentLanguage: "fr",
  translations: {
    greeting:    { en: "Hello, {name}!", fr: "Bonjour, {name}!" },
    items_count: { en: "{count} items",  fr: "{count} objets"   }
  }
})
welcome = Text(t("greeting", { name: $user.name }))
\`\`\`
\`t(key, vars?)\` looks up \`translations[key][currentLanguage]\`, falls back to \`translations[key][defaultLanguage]\`, then to the bare key. Placeholders use \`{name}\` syntax. Drive \`currentLanguage\` from a \`$state\` atom (e.g. \`currentLanguage: $lang\`) for reactive language switching, or call \`setCurrentLanguage(next)\` on the bundle.

### Icons
Icon-typed props expect a Font Awesome name as a string — no \`fa-\` prefix, NEVER an emoji character.

- \`"name"\` defaults to the solid set: \`"house"\`, \`"chart-line"\`, \`"star"\`.
- \`"regular:name"\` for the outline set; \`"brands:name"\` for brand logos.
- \`Icon(name, { variant?, size? })\` renders a standalone glyph (\`size\` ∈ \`xs|sm|md|lg|xl\`).`;
}

function fullUtil(): string {
  return `## \`$util\` — runtime helper namespace

Pure helpers — no side effects. \`$util\` is a global available inside every Aktion expression, action body, effect, and lambda. Library consumers can call the same methods from JavaScript (\`import { Util } from "aktion"\`).

Reach for \`$util\` when native JavaScript would be verbose (formatting, date math, grouping). Prefer plain JS where it is just as clear: \`arr.length\` over \`$util.count(arr)\`, \`a.filter(x => x.done)\` over \`$util.filter(a, "done", "==", true)\`.

### Collections
- \`$util.count(arr)\` — length / object key count.
- \`$util.sum(arr)\` / \`$util.avg(arr)\` / \`$util.min(arr)\` / \`$util.max(arr)\` — numeric reductions.
- \`$util.first(arr)\` / \`$util.last(arr)\` — endpoints (safe on empty arrays).
- \`$util.filter(arr, field, op, value)\` — declarative filter (\`op\` ∈ \`==\`, \`!=\`, \`<\`, \`<=\`, \`>\`, \`>=\`, \`contains\`, \`startsWith\`, \`endsWith\`).
- \`$util.find(arr, field, op, value)\` — first match.
- \`$util.sort(arr, field, dir?)\` — stable sort (\`dir\` ∈ \`"asc"\` | \`"desc"\`).
- \`$util.groupBy(arr, field)\` — \`{ [key]: items[] }\`.
- \`$util.unique(arr, field?)\` / \`$util.reverse(arr)\` / \`$util.slice(arr, start, end?)\` / \`$util.pick(obj, ["a", "b"])\`.
- \`$util.range(start, end, step?)\` — inclusive numeric range.
- \`$util.repeat(value, count)\` — fixed-length array.
- \`$util.join(arr, sep?)\` — string join.

### Strings
- \`$util.capitalize(s)\` / \`$util.lowercase(s)\` / \`$util.uppercase(s)\` / \`$util.titlecase(s)\` / \`$util.case(s, mode)\`.
- \`$util.split / .trim / .replace / .substring / .startsWith / .endsWith / .contains / .match\`.
- \`$util.plural(n, singular, plural)\` — picks the right word for a count.

### Formatting
- \`$util.format(value, mode, opts?)\` — numbers, currency, percent, compact (\`{ currency, locale, decimals }\`).
- \`$util.formatDate(value, mode, opts?)\` — \`"short"\` | \`"long"\` | \`"time"\` | \`"relative"\` | token strings (\`"YYYY-MM-DD"\`).

### Dates
- \`$util.now()\` / \`$util.today()\` / \`$util.addDays(date, n)\` / \`$util.addHours(date, n)\` / \`$util.diffDays(a, b)\` / \`$util.startOfWeek(date)\` / \`$util.endOfMonth(date)\`.

### Math
- \`$util.round / .floor / .ceil / .abs / .clamp(v, min, max) / .pow / .sqrt / .random / .log\`.

The namespace is open for extension — new helpers may be added over time.

\`\`\`
filtered  = $users.filter((u) => u.team === $team)
sorted    = $util.sort(filtered, "joinedAt", "desc")
firstFive = sorted.slice(0, 5)
summary   = \`\${rows.length} \${$util.plural(rows.length, "order", "orders")}: \${$util.format($util.sum(rows.amount), "currency")}\`
\`\`\``;
}

function fullHelpers(): string {
  return `## Standard helper components

| Component | Purpose |
|---|---|
| \`Async(resource, { loading, error, empty, data })\` | Branch on an \`$http({...})\` resource state. |
| \`Show(when, { fallback?, children })\` | Sugar for \`when ? children : fallback\`. |
| \`Portal(children, { target? })\` | Render outside the parent subtree. |
| \`Redirect(path)\` | Navigate and unmount the rest of the subtree. |
| \`Lazy(loader, { fallback?, children })\` | Defer rendering until \`loader\` resolves. |
| \`ErrorBoundary(children, { fallback?, onError? })\` | Catch render errors thrown by descendants. |
| \`VirtualList(items, { key, render })\` | Virtualised list — preferred for >100 rows. |`;
}

function fullComponentLibrary(library: ComponentLibrary): string {
  const groups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const lines: string[] = [];
  lines.push("## Component library");
  lines.push("Use only these components. Each signature lists props in declaration order; optional props end with `?`. The prop tagged `(positional)` is the canonical positional slot — pass it bare; every other prop goes in a trailing `{ prop: value }` object.");
  lines.push("");
  for (const group of groups) {
    lines.push(`### ${group.name}`);
    for (const name of group.components) {
      const spec = byName.get(name);
      if (spec) lines.push(formatComponentSignature(spec));
    }
    lines.push("");
  }
  const grouped = new Set<string>(groups.flatMap((g) => g.components));
  const ungrouped = library.components.filter((c) => !grouped.has(c.name));
  if (ungrouped.length > 0) {
    lines.push("### Other");
    for (const spec of ungrouped) lines.push(formatComponentSignature(spec));
  }
  return lines.join("\n").trim();
}

function fullInlineMode(): string {
  return `## Inline mode

You may answer questions in plain text. When you do, wrap any UI you produce in a fenced \`\`\`aktion\`\`\` block. Otherwise output Aktion directly with no surrounding prose.`;
}

function fullEditMode(): string {
  return `## Edit mode

When the user asks for an incremental change to a prior response, output ONLY the statements that need to change (additions, replacements, removals). Do NOT re-emit the whole UI. To remove a statement, write \`name = null\`.`;
}

function fullVerification(): string {
  return `## Streaming, output rules & verification

### Hoisting & streaming (CRITICAL)
References resolve from the entire top-level scope, not source order. Emit the shell first so the renderer has somewhere to attach streamed leaves. Required statement order:

1. \`${ROOT} = ...\` — first line, always.
2. Function declarations (components & actions) and \`$effect(...)\` calls.
3. Leaf data values (strings, numbers, arrays, objects) — last.

Define one named reference per FormControl, TabItem, AccordionItem, Series, Col, etc. so each one streams independently. Never split a single statement across multiple lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.

### Output rules
- Output ONLY Aktion (or a fenced \`\`\`aktion\`\`\` block when inline mode is enabled).
- Build a complete, navigable surface — \`PageHeader\`, multi-section layouts, working buttons. Don't reply with a single Card.
- Wire every visible button. Declare \`function name() { ... }\` blocks (any case for the name); reference via \`Button("Label", { onClick: name })\`.
- Use \`$router({...})\` for multi-page apps; reach \`pages\` from \`${ROOT}\`; link from sidebar/navbar with \`NavLink\`/\`SidebarItem\` (\`to: "/path"\`).
- Seed realistic mock data inline when no backend is available (5–20 plausible rows).
- Lay out with three primitives: \`Column([...])\` (vertical, the usual page/section), \`Row([...])\` (horizontal toolbars/rows), and \`Grid([...], { columns })\` (equal columns / card walls). \`Center([...], { minHeight })\` centers content. Use responsive prop maps (\`{ base: 1, md: 2, lg: 4 }\`) on \`Grid\` columns or \`Stack\` direction so the app works on phone and desktop.
- Use template literals for any string mixing copy with values.
- Tables are column-oriented: \`Table([Col("Label", arr1), Col("Count", arr2, { format: "number" })])\`. A column cell can be any component — the simplest form just maps each row to a component: \`Col("Status", rows.map(r => Badge(r.status)))\`, \`Col("Actions", rows.map(r => Button("Edit", { onClick: () => edit(r.id) })))\`. You can also keep \`values\` as the raw rows and pass \`render: (value, index) => Component\`. Make a column clickable with \`onClick: (value, index) => …\`. Both work in \`Table\` and \`DataGrid\`.
- Charts need numeric arrays. Use array pluck: \`PieChart(rows.label, rows.value)\`.
- Icons are Font Awesome names (no \`fa-\` prefix, no emoji).
- Named arguments use a trailing \`{ prop: value }\` object — never bare \`prop: value\` in a call.

### Final verification
Before finishing, walk your output and check:
1. \`${ROOT} = ...\` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than \`${ROOT}\`, \`theme\`) is reachable from \`${ROOT}\`.
4. **Function name case is NOT significant.** \`function Card(...)\` and \`function card(...)\` both declare a component-and-action; the same applies to arrow bindings.
5. **Every component reference is invoked with parentheses.** Scan for bare component identifiers used as values (root assignment, array elements, prop values) — wrap each in \`()\`. \`${ROOT} = MyApp\` → \`${ROOT} = MyApp()\`; \`Column([Hero, Body])\` → \`Column([Hero(), Body()])\`. The only exception is passing a component as a callback (e.g. \`render: UserCard\`) where the caller invokes it.
6. A function with no \`return\` simply renders nothing when called in a render position.
7. State uses the single-sigil \`$name = value\` form.
8. \`$http({...})\` uses an absolute \`url\` and exposes \`.data\`, \`.error\`, \`.loading\`, \`.status\`, \`.refetch()\`, \`.cancel()\`.
9. \`$router({...})\` arms use \`:\` (not \`->\`) and \`default\` (not \`_\`) for the wildcard.
10. Effects use \`$effect(() => {...}, [deps])\` — never the legacy bracket form.
11. \`storage\` / \`console\` are lowercase; \`route\` is reserved (never declare it).`;
}

function fullDefaultExamples(): string[] {
  return [
    `// Tasks dashboard — $http(), Async, action, multi-section layout
$tasks = $http({ url: "https://api.example.com/tasks", method: "GET" })

function toggle(task) {
  $update = $http({ url: \`https://api.example.com/tasks/\${task.id}\`, method: "PATCH", body: { done: !task.done } })
  $tasks.refetch()
}

renderRow = task => Card([Row([
  Badge(task.done ? "done" : "open", { tone: task.done ? "success" : "neutral" }),
  StackItem(Text(task.title, { tone: task.done ? "muted" : "default" }), { grow: 1 }),
  Buttons([Button(task.done ? "Reopen" : "Done", { onClick: () => toggle(task), variant: "primary", size: "sm" })])
], { gap: "m" })])

${ROOT} = Column([
  PageHeader("Tasks", { subtitle: \`\${$tasks.data.length} items\`, actions: [Button("Refresh", { onClick: $tasks.refetch, variant: "ghost" })] }),
  Async($tasks, {
    loading: LoadingState("Loading tasks…"),
    error:   ErrorState("Couldn't fetch tasks", { description: "Try again in a moment." }),
    empty:   EmptyState("No tasks yet", { description: "Create your first task." }),
    data:    Column($tasks.data.map(t => renderRow(t)), { gap: "s" })
  })
], { gap: "l" })`,
    `// Multi-page app shell with router and sidebar
pages = $router({
  "/":         Overview(),
  "/projects": Projects(),
  "/calendar": Calendar(),
  default:     NotFound()
})

nav = Sidebar([SidebarSection("Workspace", [
  SidebarItem("Overview", { icon: "house",    to: "/" }),
  SidebarItem("Projects", { icon: "folder",   to: "/projects" }),
  SidebarItem("Calendar", { icon: "calendar", to: "/calendar" })
])])

${ROOT} = AppShell(nav, pages)

function Overview() {
  return Column([
    PageHeader("Overview", { subtitle: "Everything across your workspace" }),
    Stats([
      StatCard("MRR",          { value: "$48.2k", trend: "up",   delta: "+12%", icon: "sack-dollar" }),
      StatCard("Active users", { value: "2,184",  trend: "up",   delta: "+184", icon: "users" }),
      StatCard("Open tickets", { value: "23",     trend: "down", delta: "-9",   icon: "ticket" })
    ])
  ], { gap: "l" })
}

function Projects() { return PageHeader("Projects") }
function Calendar() { return PageHeader("Calendar") }
function NotFound() { return PageHeader("Not found") }`,
  ];
}


/* -------------------------------------------------------------------------- */
/*  CHAT mode — read-only UI rendering                                        */
/* -------------------------------------------------------------------------- */

const CHAT_COMPONENT_ALLOWLIST: ReadonlyArray<string> = [
  // Layout
  "Column", "Row", "Center", "Stack", "StackItem", "Grid", "GridItem", "Box", "Container", "Spacer",
  "Card", "CardHeader", "CardFooter", "Separator",
  "Tabs", "TabItem", "Accordion", "AccordionItem", "Steps",
  "AspectRatio",
  // Content
  "Text", "Markdown", "Quote", "Callout", "CodeBlock", "Image",
  "Link", "Badge", "BadgeList", "Icon", "Kbd", "Spinner", "Skeleton",
  // Data presentation (read-only)
  "Table", "Col", "List", "ListItem", "StatCard", "Stats", "Sparkline",
  "Tile", "Progress", "ProgressRing", "DescriptionList", "DescriptionItem",
  "StatusDot", "Tree", "TreeNode",
  // Charts (read-only)
  "BarChart", "LineChart", "PieChart", "RadarChart", "ScatterChart",
  "Histogram", "Heatmap", "Gauge", "Series",
  // Feedback / media (display)
  "Avatar", "AvatarGroup", "PersonChip", "Rating", "ChatBubble",
  "Banner", "Notification",
  // Patterns (display)
  "Hero", "PageHeader", "SectionHeader", "EmptyState",
  "Timeline", "TimelineItem", "ActivityLog",
  "FeatureGrid", "FeatureItem",
  "Testimonial", "ProfileCard", "Comment",
  "MediaCard",
  "LoadingState", "ErrorState", "SuccessState",
  "DiffViewer", "JsonTree",
  // Chat
  "SectionBlock", "ListBlock", "FollowUpBlock", "FollowUpItem",
];

function chatHeader(preamble: string | undefined): string {
  const lead = preamble?.trim() ||
    "You are an assistant that responds in Aktion — a declarative language whose surface syntax is a strict subset of JavaScript. The host renders your reply as a rich, read-only UI surface. Output ONLY Aktion: no markdown, prose, or JSON.";
  return `${lead}

Every response MUST start with \`${ROOT} = ...\` on the first line. You are in read-only UI mode — use only the layout, content, data-presentation, chart, and feedback components listed below. Do NOT emit reactive-state writes, action functions, \`effect\` calls, HTTP calls, routing primitives, form controls, clickable buttons, app shells, sidebars, kanban boards, modals, drawers, popovers, hover-cards, tooltips, or dropdown menus. The single exception is \`FollowUpBlock\`, which the host renders as plain follow-up prompt buttons.`;
}

function chatSyntax(): string {
  return `## Syntax (read-only subset)

A program is a flat list of \`name = expression\` statements, written in standard JavaScript. \`${ROOT}\` is the entry point — every program MUST begin with \`${ROOT} = ...\` (typically \`${ROOT} = Column([...])\`).

### Expressions
- Strings \`"hello"\` / \`'hello'\`. Template literals: \`\` \`\${rows.length} results\` \`\` — preferred over \`+\` concatenation.
- Numbers, booleans, \`null\`, arrays \`[1, 2, 3]\`, objects \`{ key: value }\`.
- Operators: \`+ - * / %\`, \`== != > < >= <=\`, \`&& || !\`, ternary \`cond ? a : b\`, nullish \`a ?? b\`, spread \`[...a, ...b]\`, member access \`obj.field\`, optional chaining \`obj?.field\`.

### Component calls — two hard rules
1. **Any case works.** Component names may start with either an uppercase or lowercase letter — \`Card\`, \`card\`, \`Hero\`, \`hero\` are all valid declarations.
2. **Always invoke with parentheses.** A bare identifier (\`Hero\`) is a function reference; the rendered element is \`Hero()\`. Even with no arguments, write \`Hero()\`. In arrays: \`Column([Header(), Body(), Footer()])\`, never \`Column([Header, Body, Footer])\`.

### Trailing-object rule
\`TypeName(positionalArg, { prop: value, ... })\`. The first argument is the canonical positional slot; every other argument lives in a trailing \`{ }\` object.

\`\`\`
Callout("info", { title: "Heads up", description: "Action required", icon: "circle-info", compact: true })
Row([card1, card2], { gap: "m" })
Badge("Live", { tone: "success", icon: "circle-dot" })
\`\`\`

### Building UI from data — JS is fully supported
- \`.map(...)\` / \`.filter().map()\` to render arrays into nodes (same as React).
- Ternary for branching: \`tone = status == "ok" ? "success" : "warning"\`.
- Array pluck: \`rows.title\` returns \`[row.title for each row]\` — feed columns (\`Col("Title", rows.title)\`) and chart series (\`PieChart(rows.label, rows.value)\`).
- \`rows.length\`, \`rows.first\`, \`rows.last\` shortcuts.

\`if\` / \`switch\` / \`for\` are statement-only — they cannot appear on the right-hand side of an assignment in chat mode.

### Streaming order
Always declare \`${ROOT}\` FIRST. Then container/composition statements. Then leaf data arrays last.

\`\`\`
${ROOT} = Column([heroCard, statsRow, table, follow])

heroCard = Card([CardHeader("Q4 results", { subtitle: "Across all teams" })])
statsRow = Stats(stats)
table    = Table([Col("Region", rows.region), Col("Revenue", rows.revenue, { format: "currency" })])
follow   = FollowUpBlock(["Break down by region", "Compare to Q3"])

stats = [{ label: "MRR", value: "$48.2k", hint: "+12% vs Q3" }]
rows  = [{ region: "NA", revenue: 184000 }, { region: "EU", revenue: 122000 }]
\`\`\``;
}

function chatComponentLibrary(library: ComponentLibrary): string {
  const groups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const lines: string[] = [
    "## Component library (read-only)",
    "Use only these components. Each signature lists props in declaration order; optional props end with `?`. Pass the positional prop bare, then all other props in a trailing `{ prop: value }` object.",
  ];
  for (const group of groups) {
    const filtered = group.components.filter((name) => CHAT_COMPONENT_ALLOWLIST.includes(name));
    if (filtered.length === 0) continue;
    lines.push(`\n### ${group.name}`);
    for (const name of filtered) {
      const spec = byName.get(name);
      if (spec) lines.push(formatComponentSignature(spec));
    }
  }
  return lines.join("\n");
}

function chatUtil(): string {
  return `## \`$util\` — runtime helper namespace

Pure helpers — no side effects. Use \`$util\` anywhere in expressions for data shaping, formatting, math, and strings. Prefer plain JavaScript where it is just as clear (\`arr.length\`, \`arr.slice(0, 5)\`, \`s.toUpperCase()\`).

### Most useful helpers
- Collections: \`$util.sum / .avg / .min / .max / .sort(arr, field, dir?) / .groupBy(arr, field) / .unique(arr, field?)\`.
- Strings: \`$util.capitalize / .titlecase / .plural(n, singular, plural)\`.
- Formatting: \`$util.format(value, mode, opts?)\` (numbers, currency, percent, compact) and \`$util.formatDate(value, mode)\` (\`"short"\` | \`"long"\` | \`"time"\` | \`"relative"\`).

Icons are Font Awesome names — \`"house"\`, \`"chart-line"\`, \`"regular:star"\`, \`"brands:github"\`. Never use \`fa-\` prefixes or emoji characters.`;
}

function chatStreaming(): string {
  return `## Hoisting & streaming (CRITICAL)

References resolve from the entire scope, not source order — undefined references render as empty until their definitions arrive. This produces a smooth top-down reveal as the response streams.

Required statement order:
1. \`${ROOT} = ...\` — emit FIRST so the shell appears immediately.
2. Container statements (\`heroCard\`, \`tableBlock\`, \`statsRow\`, ...).
3. Leaf data values (arrays, objects, strings) — last.

Define one named reference per \`Col\`, \`TabItem\`, \`AccordionItem\`, \`Series\`, \`FollowUpItem\` so each one streams independently. Never split a single statement across multiple lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.`;
}

function chatToolsList(tools: ReadonlyArray<ToolSpec>): string {
  const lines: string[] = [
    "## Available data sources (context only)",
    "These endpoints are available to the host. You cannot call them from read-only mode, but you may incorporate the data they describe when composing the UI:",
  ];
  for (const tool of tools) {
    lines.push(`- **${tool.name}** — ${tool.description}`);
  }
  return lines.join("\n");
}

function chatDefaultExamples(): ReadonlyArray<string> {
  return [
    `// Comparison table reply with a template-literal summary
${ROOT} = Column([title, tbl, totals, follow])
title  = Text("Top languages by users", { variant: "large-heavy" })
tbl    = Table([
  Col("Language",   langs.name),
  Col("Users (M)",  langs.users, { format: "number" }),
  Col("First seen", langs.year,  { format: "number" })
])
totals = Callout("info", { title: \`Tracking \${langs.length} languages · \${$util.sum(langs.users)}M users combined\`, icon: "chart-line", compact: true })
follow = FollowUpBlock(["Sort by users", "Show as a chart"])

langs = [
  { name: "Python",     users: 15.7, year: 1991 },
  { name: "JavaScript", users: 14.2, year: 1995 },
  { name: "TypeScript", users: 8.5,  year: 2012 },
  { name: "Go",         users: 5.2,  year: 2009 }
]`,
    `// Article-style reply with Markdown body and KPI strip
${ROOT} = Column([header, body, kpis])
header = Hero("The fastest open-source UI runtime", { subtitle: "38,000 LLM responses per second.", eyebrow: "Engineering update" })
body   = Markdown(article)
kpis   = Stats([
  { label: "Open issues", value: "184",   hint: "-23 vs last week" },
  { label: "PRs merged",  value: "1,204", hint: "this quarter" },
  { label: "Avg latency", value: "84ms",  hint: "p99" }
])

article = "The renderer ships **130+ components**, a single reactive sigil, and a streaming-first parser."`,
  ];
}

function chatImportantRules(): string {
  return `## Important rules

- **Pick the right component for the content.** Tables for comparisons, charts for trends, \`Callout\`/\`Banner\` for highlights, \`Markdown\` for paragraph prose, \`Hero\`/\`PageHeader\` for top titles, \`Stats\` for KPI strips.
- **Lead with a clear title.** \`Text(text, { variant: "large-heavy" })\`, \`SectionHeader(...)\`, \`PageHeader(...)\`, or \`Hero(...)\`.
- **Realistic data** — believable names, numbers, and dates. Never Lorem Ipsum.
- **Tables are column-oriented:** \`Table([Col("Label", arr1), Col("Count", arr2, { format: "number" })])\`. Columns can hold components in two equivalent ways: map values to components directly — \`Col("Status", rows.map(r => Badge(r.status)))\`, \`Col("Actions", rows.map(r => Button("Edit")))\` — or keep rows as values and use \`render: (r) => Component\`. A whole column can be clickable with \`onClick: (value, index) => …\`.
- **Charts need numeric arrays** — use array pluck (\`PieChart(rows.label, rows.value)\`).
- **End conversational replies with \`FollowUpBlock([...])\`** — 2–4 short next-prompt suggestions.
- **\`Markdown\`** for rich paragraph prose; **\`Text\`** for short labels.
- **Template literals** for any string mixing copy with values.
- **Trailing-object form** — \`Button("Save", { variant: "primary" })\`, never bare \`Button("Save", variant: "primary")\`.`;
}

function chatFinalVerification(): string {
  return `## Final verification

Before finishing, walk your output and verify:
1. \`${ROOT} = ...\` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than \`${ROOT}\`) is reachable from \`${ROOT}\`.
4. Component name case is not significant, but every component reference is invoked with parentheses — \`Hero()\`, never bare \`Hero\`.
5. Only the read-only components above are used — no forms, clickable buttons, modals, app shells, reactive-state writes, action functions, effect calls, HTTP calls, or routing primitives.
6. No statement is split across multiple lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.
7. Tables are column-oriented; charts use numeric arrays (use array pluck like \`rows.value\` when needed).
8. Named arguments use a trailing \`{ prop: value }\` object — not bare \`prop: value\` syntax.`;
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

function formatComponentSignature(spec: ComponentSpec): string {
  const positional = findPositionalProp(spec);
  const params = spec.props.map((prop) => {
    const typePart = prop.enum ? prop.enum.map((v) => `"${v}"`).join("|") : prop.type;
    const tag = prop === positional && prop.positional === true ? " (positional)" : "";
    return `${prop.name}${prop.optional ? "?" : ""}: ${typePart}${tag}`;
  }).join(", ");
  return `- ${spec.name}(${params}) — ${spec.description}`;
}

function examplesSection(title: string, examples: ReadonlyArray<string>): string {
  const lines = [`## ${title}`];
  for (const example of examples) {
    lines.push("```");
    lines.push(example.trim());
    lines.push("```");
  }
  return lines.join("\n");
}

function rulesSection(rules: ReadonlyArray<string>): string {
  const lines = ["## Additional rules"];
  for (const rule of rules) lines.push(`- ${rule}`);
  return lines.join("\n");
}

function toolsListSection(tools: ReadonlyArray<ToolSpec>): string {
  const lines: string[] = [
    "## Available endpoints",
    "These endpoints are provided by the host. Fire requests with `$http({ url, method, body, headers, ... })` and observe the reactive bag (`.data`, `.error`, `.loading`, `.status`, `.refetch()`).",
  ];
  for (const tool of tools) {
    const kind = tool.kind === "Mutation" ? "POST/PUT/PATCH/DELETE" : "GET";
    const argsLine = tool.argsExample
      ? `  example body: ${JSON.stringify(tool.argsExample)}`
      : "  example body: {}";
    lines.push(`- ${tool.name} (${kind}) — ${tool.description}\n${argsLine}`);
  }
  return lines.join("\n");
}
