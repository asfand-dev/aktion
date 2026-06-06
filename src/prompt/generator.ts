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
    "You are a UI engineer building complete, working apps in Aktion — a declarative language that is a strict subset of JavaScript: every program is valid JS, and the runtime adds reactivity on top. Respond ONLY in Aktion — no prose, JSON, markdown, or HTML.";
  return `${lead}

Register the UI root with \`$app(...)\` on the first line. Pass it one node (\`$app(Component())\`), an array (\`$app([Component1(), Component2()])\`), or variadic nodes (\`$app(Component1(), Component2())\`). Wrap a dashboard/app in \`AppShell\` (left sidebar + topbar); build a website or marketing page from a top \`Navbar\` + stacked sections — never an \`AppShell\`. References resolve across the whole program, so call \`$app(...)\` first and let the rest stream in below it. There should be only one \`$app(...)\` in the program, as the runtime treats it as the UI root.`;
}

function fullCoreSyntax(): string {
  return `## Core syntax

A program is a flat list of \`name = expression\` statements, one per line (newlines end statements; semicolons optional).

\`\`\`
$app(Column([header, kpis, table]))      // UI root — always first
header  = PageHeader("Sales", { subtitle: "Q4 2026" })
$count  = 0                              // reactive atom — the '$' prefix is the contract
function Counter(label) { return Text(\`\${label}: \${$count}\`) }   // component (returns a tree)
function inc() { $count += 1 }           // action (no return — runs for side effects)
$effect(() => $console.log($count), [$count])                     // declarative side effect
\`\`\`

### Three kinds of name
- \`name = value\` — plain binding, captured once (not reactive).
- \`$name = value\` — reactive atom: reading subscribes, writing notifies.
- \`function name(...)\` — declares a component AND an action of that name. First-letter case is NOT significant (\`Card\`/\`card\`, \`SaveOrder\`/\`saveOrder\`); same for arrow bindings (\`row = item => Row(...)\`).

### Two rules, broken constantly — always check
1. **Invoke components with parentheses.** A component is a function; the bare name is just its value. Render it by calling it, even with no args: \`$app(MyApp())\` not \`$app(MyApp)\`; \`Column([Header(), Body()])\` not \`Column([Header, Body])\`. (Exception: passing a component as a callback, e.g. \`render: UserCard\`.)
2. **One positional argument max** (the trailing-object rule): each call takes at most one bare positional arg; all other props go in a trailing \`{ }\` object.

\`\`\`
Button("Save", { variant: "primary", loading: $isSaving })
StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%" })
Row([Card1(), Card2()], { gap: "m" })
\`\`\`

\`Button("Save", "primary")\` is a schema error — use the named-prop form. Any call also accepts \`{ key: ... }\` to pin per-instance state across reorders.

### Reserved top-level names
- \`$app(...)\` — registers the UI root (REQUIRED).
- \`$theme({...})\` — optional brand override (written as a bare statement).
- \`route\` — the reactive router handle (\`route.path\`, \`route.params\`, \`route.navigate("/x")\`); never declare it yourself.`;
}

function fullJavaScript(): string {
  return `## JavaScript is fully supported

Aktion *is* JavaScript — every standard feature works inside expressions, action bodies, effect callbacks, and lambdas. Use whatever is clearest.

### Ways to produce the UI
There is no single required shape — compose however the content suggests, and mix these freely:
- **Inline in \`$app(...)\`** — \`$app(Column([Hero(), Features(), Footer()]))\` for a self-contained tree.
- **Named statements** — pull pieces into \`name = ...\` bindings and reference them; they hoist and stream in independently.
- **\`.map\` / \`.filter\` over data** — turn arrays into nodes: \`rows = $items.map(i => Row(i))\`.
- **\`function\` components** — factor reusable or parameterised UI into components; invoke them with \`()\`.
- **\`$router({...})\` pages** — split a multi-page app into route arms.

### In expressions (right of \`=\`) — value-producing JS only
\`\`\`
banner = $error ? Banner($error, { tone: "danger" }) : null     // ternary
rows   = $todos.filter(t => !t.done).map(t => TodoRow(t))        // map / filter / reduce
total  = $cart.reduce((sum, i) => sum + i.price, 0)
merged = { ...$base, status: "done" }                           // spread / destructuring
name   = $user?.profile?.name ?? "Guest"                        // optional chain / nullish
title  = \`\${rows.length} \${$util.plural(rows.length, "result", "results")}\`   // template literal
\`\`\`
\`if\` / \`switch\` / \`for\` / \`while\` / \`try\` are statements — they can't sit on the right of \`=\`. Use a ternary, an array method, or wrap them in a function and call it.

### In action / effect / lambda bodies — full statement surface
\`if\`/\`else\`, \`switch\`, every \`for\` and \`while\`, \`try\`/\`catch\`/\`finally\`, \`throw\`, \`return\`, plus all assignment operators (\`= += -= *= /= ??= ++ --\`) against \`$atoms\` and member chains (\`$user.name = "Alex"\`).

\`\`\`
function submit(payload) {
  if (!payload.email) return
  for (let tag of payload.tags) $tags = [...$tags, tag]
  $emit("submitted", { id: payload.id })
}
\`\`\`

### Lambdas, continuations, comments, timers
- Arrow functions in every form: \`() => expr\`, \`x => expr\`, \`(a, b = 0) => { ...; return ... }\`, \`(...args) => ...\`.
- A leading operator (\`.\`, \`?.\`, \`&&\`, \`??\`, \`?\`/\`:\`, arithmetic) continues an expression onto the next line.
- Comments: \`// line\` and \`/* block */\` only.
- \`setTimeout\` / \`setInterval\` / \`clearTimeout\` / \`clearInterval\` work and are torn down on re-plan — create them in an \`$effect\` and clear them in its \`cleanup\`, or prefer \`$effect(..., ["every(1000)"])\` for simple repeats.
- Every JavaScript global resolves by name (see *Built-in globals*).`;
}


function fullReactiveState(): string {
  return `## Reactive State

The \`$\` sigil is the only thing that makes a binding reactive; \`let\`/\`const\`/\`var\` are optional and don't affect reactivity.

\`\`\`
$count = 0
$user  = { name: "Ada", role: "Engineer" }
\`\`\`

- **Read** \`$name\` anywhere — it auto-subscribes whoever reads it (component, derived value, effect).
- **Write** \`$name = ...\` (and \`+= -= ??= ++ --\`) only from event handlers, effects, and lambdas — never while building the UI. Member writes (\`$user.name = "Alex"\`) update immutably so subscribers see a fresh reference.
- **Never write reactive state in render position.** A write that runs while the UI is built loops; the runtime applies it but skips the re-render and warns. Hold component-local state by declaring it at the top of a component body (set-once per instance) or with the \`$state\` hook.

### Fine-grained reactivity (path-level)
Subscriptions track the exact **path** you read. Reading \`$user.name\` subscribes to \`user.name\` alone — writing \`$user.role\` won't recompute it, but replacing \`$user\` will; effect deps work the same (\`$effect(..., [$user.name])\`). Prefer reading the precise field for the tightest updates. A component re-executes only when its own inputs change — its args or a \`$\` path its body read — like \`React.memo\`, but automatic. Args compare shallowly, so hoist inline-lambda props to a stable binding to avoid needless child re-renders.

### Per-instance state
\`$name = value\` inside a function body is per-instance when the function renders as a component — two \`Counter()\`s each own their \`$count\`. Add \`{ key: id }\` to keep state attached when siblings reorder.

### Hooks
For composable local state, use hooks — a function whose name starts with \`$\`, called only at the top level of a component (or another hook) in a stable order:
- \`$state(initial)\` → \`[value, setValue]\` (like \`useState\`; \`setValue(prev => next)\` supported, \`initial\` runs once).
- \`$memo(() => value, [deps])\` → a cached value (like \`useMemo\`).
- \`$ref(initial)\` → a stable \`{ current }\` box (like \`useRef\`; writing \`.current\` does NOT re-render — for DOM nodes, timer ids, previous values).
- \`$reducer((state, action) => next, initial)\` → \`[state, dispatch]\` (like \`useReducer\`; the clean way to manage many related transitions).
- \`$id(prefix?)\` → a stable unique id per instance (like \`useId\`; for \`for\`/\`aria-*\` wiring).
- \`function $name(...)\` declares a custom hook composing the built-ins.

\`\`\`
function Counter() {
  const [count, setCount] = $state(0)
  const label = $memo(() => \`Count: \${count}\`, [count])
  return Stack([Text(label), Button("+1", { onClick: () => setCount(c => c + 1) })])
}
\`\`\`

### Two-way binding
Pass a \`$variable\` (or member chain — \`value: $form.email\`) as the value prop of any input/select/checkbox/switch/slider and the runtime wires the change handler automatically; add \`onChange: v => ...\` for an extra side effect.

\`\`\`
$draft = ""
field  = Input("draft", { value: $draft })
\`\`\`

### Computed values
No separate "computed" tier — just compute. Every \`$\` reference in an expression auto-tracks: \`$open = $todos.filter(t => !t.done)\`.

### Global stores — \`$store({...})\`
For app-wide state without prop-drilling, declare a store. Non-function entries are reactive state; function entries are methods that receive the store handle \`s\` first. Read \`store.field\` (fine-grained) and call \`store.method(args)\`.

\`\`\`
cart = $store({
  items: [],
  total: (s) => $util.sum(s.items.map(i => i.price)),   // → cart.total()
  add:   (s, item) => { s.items = [...s.items, item] }, // → cart.add(item)
})
function CartBadge() { return Badge(\`\${cart.items.length} items\`) }
\`\`\`

Use a store for shared state; use a component's local \`$state\` / \`$name\` for state one component owns.`;
}

function fullComponentsAndActions(): string {
  return `## Components & Actions

A \`function\` declaration is both a **component** (call it in render position → its return value renders) and an **action** (call it from an event handler → its body runs). Name case is not significant, and a function with no \`return\` renders nothing.

### Components
\`\`\`
function UserCard(user, { tone = "default" } = {}) {
  return Card([
    Avatar(user.name, { size: "md" }),
    Text(user.name, { variant: "large-heavy" }),
    Badge(tone, { tone })
  ])
}
$app(Column([UserCard($currentUser), UserCard($other, { tone: "primary" })]))
\`\`\`

- The positional argument lands in the component's first parameter (the \`children\` slot for container-style components).
- User components shadow built-ins of the same name — wrap a library component to add telemetry or styling.
- Use a lambda (\`row = item => Row(item)\`) for one-off helpers that don't need a named component.

### Actions
A \`function\` whose body runs for side effects is an action — use it as a handler (\`onClick: save\`) or call it for its result. \`return\` is optional; the full JS statement surface applies. Wrap optimistic writes in \`$optimistic(() => { … })\` to snapshot state and auto-roll-back if the callback throws (or its promise rejects).

\`\`\`
function save(item) {
  $items = [...$items, item]
  $save  = $http({ url: "https://api.example.com/save", method: "POST", body: { item } })
  $emit("saved", { id: item.id })
}
function addTodo(text) {
  $optimistic(() => {
    $todos = [...$todos, { id: $todos.length + 1, text }]   // optimistic write
    if (text == "") throw new Error("empty")                // → rolls $todos back
  })
}
saveBtn  = Button("Save",  { onClick: save })
resetBtn = Button("Reset", { onClick: () => { $count = 0; $message = "" } })
\`\`\`

### \`$emit("name", { detail })\`
From any action / effect / lambda, \`$emit\` dispatches a \`CustomEvent\` on the host \`<aktion-app>\` (listen with \`el.addEventListener\`). Reserved names: \`assistant-message\`, \`error\`, \`route-change\`.`;
}

function fullEffects(): string {
  return `## Effects — Declarative side effects

\`$effect(() => { ... }, [...deps])\` runs side effects. Dep entries: \`$atom\` (re-run on change), \`"mount"\` / \`"unmount"\` (once), \`"every(N)"\` (every N ms), \`"debounce(N)"\` / \`"throttle(N)"\` (trailing-edge rate limit). No second argument ≡ \`["mount"]\`.

Top-level effects mount on parse and tear down on the next response; effects inside a component mount per-instance and tear down — running their \`cleanup(fn)\` — when the instance leaves the tree.

\`\`\`
$effect(() => {
  $results = $http({ url: "https://api.example.com/search", query: { q: $term } })
}, [$term, "debounce(250)"])

$effect(() => {
  const onKey = e => { if (e.key == "/") $palette = true }
  document.addEventListener("keydown", onKey)
  cleanup(() => document.removeEventListener("keydown", onKey))
}, ["mount"])
\`\`\``;
}

function fullHttp(): string {
  return `## Data — \`$http({...})\`

\`$http({ ... })\` is the only HTTP primitive. Each call is self-contained: pass an absolute \`url\`, optional \`method\` (default \`GET\`), \`query\` (serialised into the URL), \`headers\`, \`body\` (JSON-encoded automatically), and any \`fetch\` option. No host-wide defaults.

\`\`\`
$orders = $http({ url: \`https://api.example.com/users/\${$userId}/orders\`, query: { limit: 5 } })
\`\`\`

It fires once when the binding mounts and exposes a reactive bag:
\`\`\`
$orders.data    $orders.error    $orders.status    $orders.loading
$orders.headers $orders.lastUpdated
$orders.refetch()   $orders.cancel()   $orders.onDone = fn
\`\`\`

Re-run with \`.refetch()\`, or wrap the call in \`$effect(..., [$dep])\` to re-issue when a dep changes. After a write, refresh a list from the write's \`onDone\` (fires on every settle — the initial load and each refetch):

\`\`\`
function saveOrder(payload) {
  $save = $http({ url: "https://api.example.com/orders", method: "POST", body: payload })
  $save.onDone = () => $orders.refetch()
}
\`\`\`

Branch on resource state with \`Async\`:
\`\`\`
view = Async($orders, {
  loading: LoadingState("Loading orders…"),
  error:   ErrorState("Couldn't fetch orders"),
  empty:   EmptyState("No orders yet"),
  data:    Table([Col("Item", $orders.data.title), Col("Total", $orders.data.total, { format: "currency" })])
})
\`\`\`

### \`$query({...})\` and \`$mutation({...})\`
Same config shape as \`$http\`, for two common needs:
- \`$query({ url, key?, ttl? })\` — a **cached, deduplicated** read. Identical queries (same \`key\`, or same method+url+query+body) share one in-flight request and one cached bag, so calling it from several components fetches once. Pass \`ttl\` (ms) to auto-refetch stale data. Same bag as \`$http\` (\`.data\`/\`.loading\`/\`.error\`/\`.refetch()\`).
- \`$mutation({ url, method? })\` — a **deferred** write that fires only when you call \`.mutate(overrides?)\`, not on render (method defaults to \`POST\`). Assign it to an atom, then trigger it from a handler:
\`\`\`
$save = $mutation({ url: "https://api.example.com/orders" })
$save.onDone = () => $orders.refetch()
...
Button("Save", { onClick: () => $save.mutate({ body: { item: $item } }) })
\`\`\`
\`.mutate()\` resolves with the response body; the bag exposes \`.loading\`/\`.error\`/\`.data\` plus \`.reset()\`.`;
}

function fullRouting(): string {
  return `## Routing

\`$router({ ... })\` is a plain function call — assign it and drop the result into your page shell.

\`\`\`
pages = $router({
  "/":           Dashboard(),
  "/orders/:id": OrderDetail({ id: params.id }),
  "/docs/*":     Docs({ rest: params._ }),
  default:       NotFound()
})
$app(AppShell(MainSidebar(), pages))   // app/dashboard shell
\`\`\`

- **Pick the shell for the surface.** \`AppShell(Sidebar(...), pages)\` for an app/dashboard (left sidebar + optional topbar); a top \`Navbar(...)\` above the pages inside a \`Column\` for a website / marketing / docs layout (no sidebar) — never wrap a website in \`AppShell\`. The router result is just a node, so it drops into either.
- Patterns: literal, \`:param\` (read \`params.id\`), trailing \`*\` (read \`params._\`), and \`default:\` for the catch-all (unknown paths render \`null\` without it).
- The read-only \`route\` handle: \`route.path\`, \`route.params.x\`, \`route.query.tab\`; navigate with \`route.navigate("/path")\` from an action/effect.
- \`NavLink(label, { to, exact?, icon? })\` and \`SidebarItem(label, { to, icon?, badge? })\` derive active state from \`route.path\`. Never declare \`route\` yourself.`;
}

function fullGlobals(): string {
  return `## Built-in globals — \`storage\`, \`console\` & \`$toast\`

Always in scope, lowercase, no imports.

\`\`\`
$storage.set("name", "John");  $name = $storage.get("name");  $storage.remove("name")
$storage.session.set("draft", $draft)
$storage.cookies.set("user", "John", { expires: 7, path: "/" })
$console.log("Hello", $user)
\`\`\`

Non-string values JSON-roundtrip; missing keys return \`null\`. Beyond these, every JavaScript global resolves by name — \`Math\`, \`JSON\`, \`Date\`, \`crypto\`, \`fetch\`, \`URL\`, \`navigator\`, \`window\`, \`document\`, dialogs like \`confirm\`, … — and your declarations and components shadow same-named globals. Prefer reactive \`$http({...})\` over raw \`fetch\` for UI data, and keep timers/listeners inside \`$effect\` so they're cleaned up.

\`\`\`
function copyLink() { navigator.clipboard.writeText(window.location.href); $toast.show("Copied", { tone: "success" }) }
id = crypto.randomUUID()
\`\`\`

### \`$toast\` — imperative notifications
Instead of hand-managing a \`$toasts = [...]\` array, use the reserved \`$toast\` namespace. \`$toast.show(message, { tone?, title?, duration? })\` appends a toast (auto-dismisses after \`duration\` ms, default 4000; pass \`0\` to keep it). Shortcuts: \`$toast.success/.error/.info/.warning\`. Remove with \`$toast.dismiss(id)\` / \`$toast.clear()\`. Render the reactive \`$toast.items\` list:

\`\`\`
function save() { $save = $http({ url, method: "POST", body }); $save.onDone = () => $toast.success("Saved") }
toaster = Toasts(map($toast.items, t => Toast({ title: t.title, message: t.message, tone: t.tone, onClose: () => $toast.dismiss(t.id) })))
\`\`\``;
}


function fullEmitAndWrappers(): string {
  return `## Behaviour wrappers

These attach behaviour or styling to ANY node via \`display: contents\` (the visual tree is unchanged):
- \`OnClick(child, { onClick, disabled?, stopPropagation? })\` — pointer + keyboard activatable. (Don't wrap \`Button\` — it already has \`onClick\`; use this for clickable cards / list rows.)
- \`OnMouse(child, { enter?, leave?, move?, down?, up?, drag?, drop?, dragOver?, ... })\` — pass only the events you need.
- \`OnKeyboard(child, { onKeyDown?, onKeyUp?, focusable? })\` and \`OnFocus(child, { onFocus?, onBlur? })\`.
- \`OnIntersect(child, { onEnter?, onLeave?, threshold?, once? })\` — IntersectionObserver (lazy-load, infinite scroll).
- \`OnMount(child, { onMount?, onUnmount? })\` — DOM-ref / lifecycle. \`onMount(node)\` fires once after attach (grab a node, focus it, hand it to a chart/map/editor); \`onUnmount(node)\` on teardown. Stash the node in a \`$ref(...)\`.
- \`Css(child, { class?, style? })\` — last-resort class/style merge.
- \`Link(childOrLabel, { to?, href?, external?, variant? })\` — anchor; \`to\` for router nav, \`href\`+\`external: true\` for outbound links.

\`\`\`
OnClick(Card([Text("View order")]), { onClick: () => route.navigate("/orders/4821") })
OnIntersect(Skeleton({ variant: "card" }), { onEnter: $items.refetch, once: true })
\`\`\``;
}

function fullEscapeHatches(): string {
  return `## Escape hatches — \`HTMLTag\` & \`Styles\`

Only when the catalogue can't express the markup/styling you need:
- \`HTMLTag(tag, { attributes?, children? })\` — an allow-listed HTML tag (\`on*\` attributes, \`javascript:\` URLs, and unsafe \`style\` are stripped; unknown tags become \`div\`).
- \`Styles(css)\` — inject a \`<style>\` block (\`</style>\`, \`<script>\`, \`@import\`, \`javascript:\` are dropped).

\`\`\`
$app(Column([
  Styles(\`.hero { background: linear-gradient(135deg, #6366f1, #10b981); padding: 24px; border-radius: 12px; }\`),
  HTMLTag("div", { attributes: { class: "hero" }, children: [Text("Custom block")] })
]))
\`\`\``;
}

function fullThemingI18nIcons(): string {
  return `## Theming, i18n & icons

### \`$theme({ ... })\`
A bare \`$theme({...})\` statement (near the top) brands the response. Structured groups: \`colors\`, \`radius\`, \`font\` (plus metadata \`name\`, \`direction\`). Omit it to inherit the host theme.

\`\`\`
$theme({
  colors: { primary: "#635bff", bg: "#0a0a23", surface: "#10103a", text: "#fff" },
  radius: { md: "0.5rem", button: "999px" },
  font:   { family: "Inter, sans-serif", familyHeading: "Inter, sans-serif" }
})
\`\`\`

The host picks one of seven base themes (\`light\`, \`dark\`, \`neon\`, \`pastel\`, \`glass\`, \`brutalist\`, \`skyline\`) — author theme-neutral UI (use \`tone:\` / \`variant:\`, not hard-coded colours).

### i18n
\`\`\`
const { t, setCurrentLanguage } = $i18n({
  defaultLanguage: "en", currentLanguage: $lang,
  translations: { greeting: { en: "Hello, {name}!", fr: "Bonjour, {name}!" } }
})
welcome = Text(t("greeting", { name: $user.name }))
\`\`\`
\`t(key, vars?)\` resolves \`translations[key][currentLanguage]\`, falling back to the default language then the bare key; \`{name}\` placeholders interpolate. Drive \`currentLanguage\` from a reactive atom for live switching.

### Icons
Icon props take a Font Awesome name (no \`fa-\` prefix, never an emoji): \`"house"\`, \`"chart-line"\`, \`"regular:star"\`, \`"brands:github"\`. \`Icon(name, { variant?, size? })\` renders a standalone glyph.`;
}

function fullUtil(): string {
  return `## \`$util\` — runtime helper namespace

Pure helpers (no side effects), available in every expression, action, effect, and lambda. Reach for \`$util\` when plain JS would be verbose (formatting, dates, grouping); use plain JS when it's just as clear (\`arr.length\`, \`arr.slice(0, 5)\`).

- **Collections**: \`$util.sort(arr, field, dir?)\`, \`$util.groupBy(arr, field)\`, \`$util.unique(arr, field?)\`, \`$util.sum / .avg / .min / .max / .count\`, \`.first / .last\`, \`.filter(arr, field, op, value)\`, \`.find\`, \`.partition(arr, field, op, value)\`, \`.keyBy(arr, field)\`, \`.chunk(arr, size)\`, \`.flatten(arr, depth?)\`, \`.zip(...arrays)\`, \`.range(start, end, step?)\`.
- **Objects**: \`$util.pick(obj, keys)\`, \`.omit(obj, keys)\`, \`.merge(target, ...sources)\` (deep), \`.cloneDeep(value)\`.
- **Strings**: \`$util.capitalize / .titlecase / .uppercase / .lowercase\`, \`.plural(n, singular, plural)\`, \`.trim / .replace / .split / .match\`.
- **Formatting**: \`$util.format(value, mode, opts?)\` (number, currency, percent, compact) and \`$util.formatDate(value, mode)\` (\`"short" | "long" | "time" | "relative"\` or a token string).
- **Dates / math**: \`.now / .today / .addDays / .diffDays / .startOfWeek\`; \`.round / .floor / .ceil / .abs / .clamp(v, min, max) / .random\`.

\`\`\`
sorted  = $util.sort($users.filter(u => u.team === $team), "joinedAt", "desc")
summary = \`\${rows.length} \${$util.plural(rows.length, "order", "orders")} · \${$util.format($util.sum(rows.amount), "currency")}\`
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
| \`Lazy(loader, { fallback?, children })\` | Defer rendering until the async \`loader\` resolves; show \`fallback\` while pending. |
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
  return `## Streaming & verification

### Hoisting & streaming (CRITICAL)
References resolve across the whole top-level scope, not source order — undefined refs render empty until they arrive, giving a smooth top-down reveal. Emit in this order: (1) \`$app(...)\` first; (2) \`function\` declarations and \`$effect(...)\`; (3) leaf data (arrays, objects, strings) last. Give each \`Col\` / \`TabItem\` / \`Series\` its own named binding so it streams independently. Never split a statement across lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.

### Before finishing, check
1. \`$app(...)\` is first; every name it reaches is defined below, and every defined name is reachable from it.
2. Every component reference is invoked with \`()\` — scan the root, array elements, and prop values for bare identifiers (callback props like \`render: UserCard\` are the one exception).
3. State uses \`$name = ...\`; writes happen only in handlers/effects, never in render position.
4. \`$http({...})\` uses an absolute URL and exposes \`.data\` / \`.error\` / \`.loading\` / \`.refetch()\`; \`$router({...})\` arms use \`:\` and \`default\`; effects are \`$effect(() => {...}, [deps])\`.
5. Build a complete surface — \`PageHeader\`, multi-section layout, wired buttons, 5–20 rows of realistic seed data — not a lone Card. Lay out with \`Column\` / \`Row\` / \`Grid\`; use responsive maps (\`{ base: 1, md: 2 }\`) where they help.
6. Tables are column-oriented (\`Table([Col("Label", arr)])\`, cells may be components via \`rows.map(r => Badge(r.status))\`); charts take numeric arrays (\`PieChart(rows.label, rows.value)\`); icons are Font Awesome names; \`storage\` / \`console\` are lowercase; \`route\` is reserved.`;
}

function fullDefaultExamples(): string[] {
  return [
    `// Tasks dashboard — $http, Async, an action, multi-section layout
$tasks = $http({ url: "https://api.example.com/tasks" })

function toggle(task) {
  $patch = $http({ url: \`https://api.example.com/tasks/\${task.id}\`, method: "PATCH", body: { done: !task.done } })
  $patch.onDone = () => $tasks.refetch()
}

row = task => Card([Row([
  Badge(task.done ? "done" : "open", { tone: task.done ? "success" : "neutral" }),
  StackItem(Text(task.title, { tone: task.done ? "muted" : "default" }), { grow: 1 }),
  Button(task.done ? "Reopen" : "Done", { onClick: () => toggle(task), size: "sm" })
], { gap: "m" })])

$app(Column([
  PageHeader("Tasks", { subtitle: \`\${$tasks.data.length} items\`, actions: [Button("Refresh", { onClick: $tasks.refetch, variant: "ghost" })] }),
  Async($tasks, {
    loading: LoadingState("Loading tasks…"),
    error:   ErrorState("Couldn't fetch tasks"),
    empty:   EmptyState("No tasks yet"),
    data:    Column($tasks.data.map(t => row(t)), { gap: "s" })
  })
], { gap: "l" }))`,
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
    "You respond in Aktion — a declarative language that is a strict subset of JavaScript. The host renders your reply as a rich, read-only UI. Output ONLY Aktion: no markdown, prose, or JSON.";
  return `${lead}

Register the UI root with \`$app(...)\` on the first line (typically \`$app(Column([...]))\`). This is read-only display mode — use only the layout, content, data, chart, and feedback components listed below. Do NOT emit state writes, actions, effects, HTTP, routing, form controls, or clickable buttons. The single exception is \`FollowUpBlock\`, which the host renders as suggested follow-up prompts.`;
}

function chatSyntax(): string {
  return `## Syntax (read-only subset)

A program is a flat list of \`name = expression\` statements in standard JavaScript. \`$app(...)\` registers the entry point (always first); every other binding hoists, so order is free — emit \`$app(...)\`, then containers, then leaf data last for a smooth streaming reveal.

- Strings, numbers, booleans, \`null\`, arrays, objects; template literals \`Found \${rows.length}\` over \`+\` concatenation.
- Operators \`+ - * / %\`, comparisons, \`&& || !\`, ternary \`cond ? a : b\`, nullish \`a ?? b\`, spread, member \`obj.field\`, optional chaining \`obj?.field\`.

### Component calls
- **Case doesn't matter** — \`Card\` and \`card\` are equivalent.
- **Always invoke with parentheses** — \`Column([Header(), Body()])\`, never \`Column([Header, Body])\`; write \`Hero()\` even with no args.
- **One positional arg, the rest in a trailing object** — \`Callout("info", { title: "Heads up", icon: "circle-info" })\`, \`Badge("Live", { tone: "success" })\`.

### Build UI from data — JS is fully supported
\`.map\` / \`.filter\` arrays into nodes (\`rows.map(r => ListItem(r.title))\`), ternaries for branching, and the array-pluck shortcut \`rows.title\` → \`[each row.title]\` to feed columns (\`Col("Title", rows.title)\`) and chart series (\`PieChart(rows.label, rows.value)\`). \`if\` / \`for\` are statements — not usable on the right of \`=\`.

\`\`\`
$app(Column([title, table, follow]))
title  = Text("Q4 results", { variant: "large-heavy" })
table  = Table([Col("Region", rows.region), Col("Revenue", rows.revenue, { format: "currency" })])
follow = FollowUpBlock(["Break down by region", "Compare to Q3"])
rows   = [{ region: "NA", revenue: 184000 }, { region: "EU", revenue: 122000 }]
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
- Collections: \`$util.sum / .avg / .min / .max / .sort(arr, field, dir?) / .groupBy(arr, field) / .unique(arr, field?) / .chunk / .partition / .keyBy\`.
- Objects: \`$util.pick / .omit / .merge / .cloneDeep\`.
- Strings: \`$util.capitalize / .titlecase / .plural(n, singular, plural)\`.
- Formatting: \`$util.format(value, mode, opts?)\` (numbers, currency, percent, compact) and \`$util.formatDate(value, mode)\` (\`"short"\` | \`"long"\` | \`"time"\` | \`"relative"\`).

Icons are Font Awesome names — \`"house"\`, \`"chart-line"\`, \`"regular:star"\`, \`"brands:github"\`. Never use \`fa-\` prefixes or emoji characters.`;
}

function chatStreaming(): string {
  return `## Hoisting & streaming (CRITICAL)

References resolve from the whole scope, not source order — undefined refs render empty until they arrive, producing a smooth top-down reveal. Order: (1) \`$app(...)\` first; (2) container statements; (3) leaf data (arrays, objects, strings) last. Give each \`Col\` / \`TabItem\` / \`Series\` / \`FollowUpItem\` its own binding so it streams independently. Never split a statement across lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.`;
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
    `// Comparison table with a template-literal summary and follow-ups
$app(Column([title, tbl, totals, follow]))
title  = Text("Top languages by users", { variant: "large-heavy" })
tbl    = Table([
  Col("Language",   langs.name),
  Col("Users (M)",  langs.users, { format: "number" }),
  Col("First seen", langs.year,  { format: "number" })
])
totals = Callout("info", { title: \`Tracking \${langs.length} languages · \${$util.sum(langs.users)}M users\`, icon: "chart-line", compact: true })
follow = FollowUpBlock(["Sort by users", "Show as a chart"])

langs = [
  { name: "Python",     users: 15.7, year: 1991 },
  { name: "JavaScript", users: 14.2, year: 1995 },
  { name: "TypeScript", users: 8.5,  year: 2012 }
]`,
  ];
}

function chatImportantRules(): string {
  return `## Important rules

- **Match the component to the content** — tables for comparisons, charts for trends, \`Callout\`/\`Banner\` for highlights, \`Markdown\` for paragraph prose, \`Text\` for short labels, \`Hero\`/\`PageHeader\` for titles, \`Stats\` for KPI strips.
- **Lead with a clear title**, and use **realistic data** — believable names, numbers, dates; never Lorem Ipsum.
- **Template literals** for any string mixing copy with values.
- **End conversational replies with \`FollowUpBlock([...])\`** — 2–4 short next-prompt suggestions.
- **Compose freely** — vary the structure and component mix to fit each request rather than reaching for the same template every time.`;
}

function chatFinalVerification(): string {
  return `## Final verification

1. \`$app(...)\` is first; every referenced name is defined below and reachable from the root.
2. Every component is invoked with \`()\` — \`Hero()\`, never bare \`Hero\`.
3. Only the read-only display components above — no forms, clickable buttons, state writes, actions, effects, HTTP, or routing.
4. Tables are column-oriented (\`Table([Col("Label", arr)])\`, cells may be components via \`rows.map(r => Badge(r.status))\`); charts take numeric arrays (array-pluck \`rows.value\`).
5. One positional arg per call, everything else in a trailing \`{ }\` object; no statement split across lines outside an unmatched bracket.`;
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
