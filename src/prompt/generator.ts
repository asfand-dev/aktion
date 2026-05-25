/**
 * System prompt generator — Aktion.
 *
 * Produces an ordered system prompt that teaches an LLM how to author
 * Aktion — the compact declarative language consumed by
 * `<aktion-app>`. Two flavours ship side-by-side:
 *
 *   - `"full"` (default): comprehensive teaching prompt that covers every
 *     language feature — reactive state, components, actions, effects,
 *     `http({...})`, routing, JS escape hatch, builtins, helpers,
 *     globals, i18n, theming — plus the entire component library and a
 *     handful of worked examples. Use this when the LLM is generating
 *     full applications, dashboards, or websites.
 *
 *   - `"chat"`: compact, **read-only** prompt that teaches *just enough*
 *     to convert an LLM's prose reply into a rich UI surface. No state,
 *     no actions, no HTTP, no routing — only static layout + content +
 *     data-presentation components plus a `FollowUpBlock` for canned
 *     follow-up prompts. Use this when the LLM is answering questions
 *     and the host wants its response rendered as cards, tables, charts,
 *     etc. rather than plain prose.
 *
 * Public API (kept stable for the docs site and `<aktion-app>.getSystemPrompt`):
 *   - `generatePrompt(library, options?)` — returns the prompt string.
 *   - `describeComponentSpec(spec)` — formats a single component signature.
 *   - Types: `PromptMode`, `PromptOptions`, `ToolSpec`.
 */

import type { ComponentLibrary, ComponentSpec } from "../library/types.js";
import { findPositionalProp } from "../library/types.js";
import { getBuiltinCatalog, type BuiltinEntry } from "../language/builtins.js";

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export interface ToolSpec {
  name: string;
  description: string;
  /** Example argument shape the LLM should call with. */
  argsExample?: Record<string, unknown>;
  /** Whether this endpoint is read-only or mutating. Influences method hint. */
  kind?: "Query" | "Mutation";
}

export type PromptMode = "full" | "chat";

export interface PromptOptions {
  mode?: PromptMode;
  /** Replace the default opening sentence describing the assistant's role. */
  preamble?: string;
  /** Bullets appended under an `## Additional rules` section near the end. */
  additionalRules?: ReadonlyArray<string>;
  /** Worked-example snippets shown under `## Examples`. Defaults to a curated set. */
  examples?: ReadonlyArray<string>;
  /** Host-provided endpoint catalogue. Surfaced under `## Available endpoints`. */
  tools?: ReadonlyArray<ToolSpec>;
  /** Endpoint usage examples. Surfaced under `## Endpoint examples`. */
  toolExamples?: ReadonlyArray<string>;
  /** Force-include the HTTP/tool-calling teaching sections in `full` mode. */
  toolCalls?: boolean;
  /** Force-include the reactive-state + builtins sections in `full` mode. */
  bindings?: boolean;
  /** Permit fenced ```aktion blocks inside markdown prose (full mode). */
  inlineMode?: boolean;
  /** Tell the LLM to emit only changed statements (full mode). */
  editMode?: boolean;
}

const ROOT_NAME = "_app_";

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
  const hasTools = (options.tools?.length ?? 0) > 0;
  const flags = {
    toolCalls: options.toolCalls ?? hasTools,
    bindings: options.bindings ?? (options.toolCalls ?? hasTools),
    inlineMode: options.inlineMode ?? false,
    editMode: options.editMode ?? false,
  };

  const sections: string[] = [];
  sections.push(fullHeader(options.preamble));
  sections.push(fullMentalModel());
  sections.push(fullSyntax());
  if (flags.bindings) sections.push(fullReactiveState());
  sections.push(fullComponentsAndLambdas());
  sections.push(fullActions());
  sections.push(fullEffects());
  if (flags.toolCalls) sections.push(fullHttp());
  sections.push(fullControlFlow());
  sections.push(fullRouting());
  sections.push(fullTwoWayBinding());
  sections.push(fullJsEscape());
  if (flags.toolCalls || flags.bindings) sections.push(fullBuiltins());
  sections.push(fullHelpers());
  sections.push(fullGlobals());
  sections.push(fullI18n());
  sections.push(fullTheming());
  sections.push(fullIcons());
  sections.push(fullComponentLibrary(library));
  if (flags.inlineMode) sections.push(fullInlineMode());
  if (flags.editMode) sections.push(fullEditMode());
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
  sections.push(fullStreaming());
  sections.push(fullOutputRules());
  sections.push(fullFinalVerification());

  return sections.join("\n\n").trim() + "\n";
}

function buildChatPrompt(library: ComponentLibrary, options: PromptOptions): string {
  const sections: string[] = [];
  sections.push(chatHeader(options.preamble));
  sections.push(chatSyntax());
  sections.push(chatComponentLibrary(library));
  sections.push(chatIcons());
  sections.push(chatBuiltins());
  sections.push(chatStreaming());
  if (options.tools && options.tools.length > 0) {
    sections.push(chatToolsList(options.tools));
  }
  const examples = options.examples ?? chatDefaultExamples();
  if (examples.length > 0) sections.push(examplesSection("Examples", examples));
  if (options.additionalRules && options.additionalRules.length > 0) {
    sections.push(rulesSection(options.additionalRules));
  }
  sections.push(chatImportantRules());
  sections.push(chatFinalVerification());

  return sections.join("\n\n").trim() + "\n";
}

/* -------------------------------------------------------------------------- */
/*  FULL mode — sections                                                      */
/* -------------------------------------------------------------------------- */

function fullHeader(preamble: string | undefined): string {
  const lead = preamble?.trim()
    || "You are a full-stack UI engineer building **complete, working applications** in Aktion — a compact, declarative DSL for reactive, streaming-first user interfaces. Treat each prompt as a request to ship a real, production-quality product surface (dashboards, CRUD apps, multi-page websites, settings consoles, inboxes, admin panels, …). Never reply with a one-shot chat card; always produce a substantial, navigable app. Respond ONLY in Aktion — no prose, no JSON, no markdown, no HTML.";
  return `${lead}\n\nEvery response MUST begin with \`${ROOT_NAME} = ...\` on the very first line. Use a top-level container (\`${ROOT_NAME} = AppShell(...)\` for full apps, \`${ROOT_NAME} = Stack(...)\` for landing pages, etc.) or a user-declared component (\`${ROOT_NAME} = App()\`). For multi-page apps wrap the main area in \`pages = _router_({ ... })\` and reference \`pages\` from \`${ROOT_NAME}\`. Seed realistic mock data inline (5–20 plausible rows per dataset) when the host has no real backend. Wire every visible button to an \`action\`. Use \`$name = value\` for reactive state, \`http({ ... })\` for any data fetch, \`effect [ ...deps ] { … }\` for lifecycle work, \`_router_({ … })\` for navigation. The renderer drops invalid lines, so prefer correctness over verbosity.`;
}

function fullMentalModel(): string {
  return `## Mental model

Aktion is a streaming-first, declarative DSL. A program is a flat
list of \`name = expression\` statements. The renderer evaluates them lazily,
re-parses the stream on every chunk, and silently treats undefined references
as empty — so a partially-streamed program renders progressively from the top.

Three identifier conventions cooperate:

- **Plain bindings**: \`name = expression\` — a non-reactive alias. Reading
  it never subscribes; the value is captured once when the statement runs.
- **Reactive atoms**: \`$name = value\` — a single tracked cell. Reading
  \`$name\` subscribes the surrounding component / effect; writing inside
  an \`action\` / \`effect\` / lambda body notifies subscribers.
- **Reserved built-ins**: \`${ROOT_NAME}\` (the UI root, required first
  line), \`theme\` (optional brand override), \`_route_\` (router-owned
  reactive surface — read \`_route_.path\` / \`_route_.params\` and call
  \`_route_.navigate("/path")\` to navigate), \`$i18n\` (i18n bundle handle).

Three declaration keywords are reserved at the top level:

- \`component Name(args) { … return Expression }\` — first-class UI
  primitive with optional defaults and per-instance state.
- \`action Name(args) { … }\` — imperative side-effect block triggered by
  events. MAY \`return\` a value.
- \`effect [ ...deps ] { … }\` — declarative, anonymous background work
  tied to a component / top-level binding. Dependencies (\`$atom\`,
  \`on:mount\`, \`on:unmount\`, \`on:every(N)\`, \`debounce(N)\`,
  \`throttle(N)\`) live in the bracketed list.

Everything else (\`http({...})\`, \`_router_({...})\`, \`Theme({...})\`,
\`i18n({...})\`, \`Toast(...)\`, \`Stack(...)\`) is a regular function /
component call.`;
}

function fullSyntax(): string {
  return `## Syntax

Source is line-oriented; **newline terminates a statement**. Never use
semicolons or statement-level commas. \`{ … }\` braces open blocks (component
bodies, action bodies, effect bodies, control-flow arms, object literals).
Indentation is purely cosmetic.

### Literals
- Strings: \`"double"\` or \`'single'\`. Standard newline / tab / quote
  escape sequences are supported inside string bodies.
- Template literals: backticks with \`\${expr}\` interpolation —
  \`\`\`Hi \${$user.name}, you have \${@Count($todos)} todos\`\`\`. Embed any
  expression; mix freely with state refs and \`@\`-builtins.
- Numbers: \`42\`, \`-3.14\`, \`1_000_000\` (underscores allowed).
- Booleans: \`true\`, \`false\`. Null: \`null\`.
- Arrays: \`[1, 2, 3]\`, \`[Card1(), Card2()]\` — heterogeneous, multi-line OK.
- Objects: \`{ name: "Ada", role: "Engineer" }\` — keys are bare identifiers
  or quoted strings; commas optional between rows on separate lines.

### Operators
- Arithmetic: \`+ - * / %\`, unary \`-\`.
- Comparison: \`== != > < >= <=\`.
- Logical: \`&& || !\`. Nullish coalescing: \`??\`.
- Ternary: \`cond ? a : b\`.
- Spread \`...\` in arrays and objects: \`[...$a, ...$b]\`,
  \`{ ...$cur, status: "done" }\`.
- Member access: \`obj.field\`, \`obj["field"]\` (bracket form), optional
  \`obj?.field\` to short-circuit on null/undefined.

### Array shortcuts
- \`$rows.length\` / \`"hi".length\` — element / character count.
- \`$rows.first\` / \`$rows.last\` — first or last element (\`null\` if empty).
- **Array pluck**: \`$rows.title\` returns \`[row.title for each row]\` —
  the idiomatic projection. Composes with charts
  (\`PieChart(rows.label, rows.value)\`) and tables
  (\`Col("Title", rows.title)\`).

### Statements
- \`name = expression\` — plain binding (top-level or block-local).
- \`$name = expression\` — declare or write a reactive atom.
- \`component Name(args) { … }\` — component declaration.
- \`action Name(args) { … }\` — action declaration.
- \`effect [ ...deps ] { … }\` — anonymous effect declaration.
- \`return expression\` — only valid inside \`component\` / \`action\` /
  lambda bodies.

### Function calls and named arguments
\`TypeName(arg1, prop: value, …)\` — arguments are matched against the
spec's prop list in declaration order. Named arguments (\`prop: value\`)
may appear at any position and override positional matching. Optional props
can be omitted from the end.

**One positional argument max** is the canonical 0.5 style — every
component declares **at most one** canonical positional slot (its primary
label / content / children). Pass that slot bare; every other argument is
best supplied as a named argument:

\`\`\`
Button("Save", variant: "primary", loading: $isSaving)        // canonical
StatCard("Revenue", value: "$48k", trend: "up", delta: "+12%") // canonical
Stack([Card1(), Card2()], direction: "row", gap: "md")         // canonical
Callout("info", title: "Heads up", description: "Action required", icon: "circle-info", compact: true)
\`\`\`

The component reference below tags the canonical positional with
\`(positional)\`. For backwards-compatibility, additional positional
arguments are still accepted in declaration order — but the named form is
preferred because it survives prop renames and reorderings.

### Lambdas
\`(arg) => expression\` for one-liners; \`(arg) => { … }\` for multi-statement
bodies. A lambda body has the same imperative surface as an \`action\` body
(assignments to \`$atoms\`, \`http(...)\`, \`emit\`, etc.).

### Forward references
Statements may **reference names defined later in the program**. The parser
resolves them once the full stream lands. This is what makes streaming work:
emit the shell (\`${ROOT_NAME} = Stack([hero, body])\`) on the first line,
then fill in \`hero\` and \`body\` later.`;
}

function fullReactiveState(): string {
  return `## Reactive State

Aktion has **one reactive atom kind**. Every reactive cell is declared
and read with the same surface:

\`\`\`
$count = 0
$user  = { name: "Ada", role: "Engineer" }
$todos = []
$theme = "dark"
\`\`\`

### Sigil contract
- \`count\` (no sigil) is a plain binding — NOT tracked, NOT reactive.
- \`$count\` (with sigil) is a tracked atom — reading subscribes the
  surrounding component / effect; writing notifies subscribers.

### Assignment rules
- **Render position** (top-level bindings, component body output, prop values):
  assignment is forbidden. Use \`$name = …\` declarations to seed.
- **Inside \`action\` / \`effect\` / lambda bodies**: \`= += -= *= /= ??= ++ --\`
  are allowed against any \`$name\` atom.
- **Nested writes require whole-object replacement.** Direct
  \`$user.name = "Alex"\` is rejected — spread instead:
  \`$user = { ...$user, name: "Alex" }\`. Arrays follow the same rule:
  \`$todos = [...$todos, item]\`, \`$todos = @Filter($todos, "id", "!=", id)\`.

### Component-scoped state
A \`$name = value\` declared **inside** a \`component\` body is per-instance.
Two \`<Counter/>\` siblings each have their own \`count\`. Top-level
\`$name\` declarations live for the lifetime of the response.

### Computed values
Just compute — every reference to a \`$\` atom inside an expression auto-tracks:

\`\`\`
$cart  = []
$total = @Sum($cart.price)        // re-derives when $cart changes
$open  = @Filter($todos, "done", "==", false)
\`\`\`

### URL-synced state
URL state lives on the router, not as a separate tier:
- \`_route_.path\` — current path (read-only).
- \`_route_.params.id\` — path parameter; reactive.
- \`_route_.query.tab\` — query string; **writable** (assigning updates the URL).
- \`_route_.navigate("/path")\` — imperative navigation; only valid inside
  \`action\` / \`effect\` bodies.`;
}

function fullComponentsAndLambdas(): string {
  return `## Components and lambdas

### Component declarations
\`\`\`
component UserCard(user, tone: "default") {
  $hover = false
  return Card([
    Avatar(user.name, size: "md"),
    Text(user.name, variant: "large-heavy"),
    Text(user.role, tone: "muted"),
    Badge(tone, tone: tone)
  ])
}
\`\`\`

- Components **must** end with an explicit \`return <expression>\`.
- Defaults use \`= expression\` (literal or computed in the component's scope).
- \`children\` is the implicit named slot — the trailing positional argument
  at the call site is delivered as \`children\` inside the body.
- Per-instance state: any \`$name = value\` declared inside the body is
  private to that instance.

### Call sites
\`\`\`
${ROOT_NAME} = Stack([
  UserCard($alice),                                  // positional arg
  UserCard($bob, tone: "primary"),                   // named arg
  UserCard(user: $carol, tone: "warning")            // both named
])
\`\`\`

### Local helpers — lambda form
Use a lambda binding for one-off helpers that don't need their own component:
\`\`\`
priorityTone = (p) => match p { "high": "danger" "med": "warning" default: "muted" }
rowFor       = (item) => Stack([Badge(item.label, tone: priorityTone(item.priority)), Text(item.title)])
list         = for item in $items { rowFor(item) }
\`\`\``;
}

function fullActions(): string {
  return `## Actions — callable side effects

An \`action\` is a callable block of imperative statements. Declare at the
top level (or inside a component body); invoke from any event-handler prop
(\`onClick\`, \`onChange\`, \`onSubmit\`) or as an expression.

\`\`\`
action save(item) {
  $items = [...$items, item]
  $save  = http({ url: "/api/save", method: "POST", body: { item: item } })
  emit "saved" { id: item.id }
}

submitBtn = Button("Save", onClick: save)
\`\`\`

### Body grammar
Inside an action body the imperative surface is small:
- Assignments: \`$x = newValue\`, \`$x += 1\`, \`$x = { ...$x, field: v }\`.
- \`http({ ... })\` — fire a request; the result is a reactive resource bag.
- \`emit "event-name" { detail }\` — dispatch a \`CustomEvent\` on the host element.
- \`_route_.navigate("/path")\` — programmatic navigation.
- Statement-form \`if\` / \`match\` / \`for\` — same keywords as the expression
  forms (covered below).
- \`return\` — optionally yields a value to the caller.
- \`js{ /* opaque JS */ }\` — escape hatch for browser APIs not exposed
  natively (see § JS escape hatch).

### Optional \`return\`
Actions MAY include a \`return\` statement. When omitted the action runs for
its side effects and yields \`undefined\`. When present the result is
observable from \`$x = myAction(...)\` expressions:

\`\`\`
action greet(name) {
  return "Hello, " + name
}
$hello = greet("Ada")             // re-runs whenever the action call's args change
\`\`\`

### Inline lambdas — the short form
For trivial handlers, skip the \`action\` declaration entirely:

\`\`\`
incBtn   = Button("+",     onClick: () => $count = $count + 1)
resetBtn = Button("Reset", onClick: () => { $count = 0   $message = "" })
copyBtn  = Button("Copy",  onClick: () => { js{ navigator.clipboard.writeText("hi") } })
\`\`\``;
}

function fullEffects(): string {
  return `## Effects — Declarative side effects

\`effect\` blocks attach side effects to a component or top-level binding.
They are **anonymous** — there is no name, no \`on\` keyword. Every
dependency lives inside a single bracketed list right after the keyword:

\`\`\`
effect [ ...dependencies ] {
  // body
}
\`\`\`

A dependency entry is one of:
- \`$atom\` — re-run when the named reactive atom changes.
- \`on:mount\` — run once when the surrounding scope mounts.
- \`on:unmount\` — run once when it unmounts.
- \`on:every(N)\` — re-run every N milliseconds.
- \`debounce(N)\` / \`throttle(N)\` — wrap the body with a trailing-edge rate limit.

Dependencies may be combined freely (e.g.
\`effect [$query, $page, debounce(250)] { … }\`). The order inside the
brackets doesn't matter.

\`effect { ... }\` (no brackets) is equivalent to \`effect [on:mount] { ... }\` —
both run the body once on mount.

### Scope — top-level vs. component-local
An effect can live at the program top level OR inside a
\`component Name() { … }\` body. The syntax is identical; only the
lifecycle differs:

- **Top-level** — mounted once when the program parses, torn down on
  \`setResponse\` / \`clear()\`. Use for global concerns (analytics,
  app-wide shortcuts, hydration of shared atoms).
- **Component-local** — mounted once per component instance on its
  first render, torn down when the instance disappears from the tree.
  Each instance gets its own timers, watched-atom subscriptions, and
  \`cleanup(fn)\` registrations. Use for per-instance work (per-row
  polling, modal focus management, observers attached to a widget).

\`\`\`
_app_ = App()
$value = 10

# Top-level — one shared interval for the whole program.
effect [on:every(1000)] {
  $value = $value + 1
}

component App() {
  return Box([Text("Value: " + $value)])
}
\`\`\`

\`\`\`
_app_ = App()
$value = 10

component App() {
  # Component-local — interval starts on first render and is cleared
  # automatically when the App instance leaves the tree.
  effect [on:every(1000)] {
    $value = $value + 1
  }
  return Box([Text("Value: " + $value)])
}
\`\`\`

### Examples

\`\`\`
component LiveClock() {
  $now = @Now()
  effect [on:every(1000)] { $now = @Now() }
  return Text(@FormatDate($now, "time"))
}

effect [$query, $page, debounce(250)] {
  $results = http({ url: "/api/search", query: { q: $query, page: $page } })
}

effect [$draft, debounce(500)] {
  $save = http({ url: "/api/draft", method: "PUT", body: $draft })
}

effect [on:mount] {
  js{
    const onKey = (e) => { if (e.key === "k" && e.metaKey) ctx.host.emit("toggle-palette", {}) }
    document.addEventListener("keydown", onKey)
    ctx.cleanup(() => document.removeEventListener("keydown", onKey))
  }
}
\`\`\`

### Cleanup
Use \`cleanup(fn)\` to register teardown for intervals, listeners, observers.
Cleanup fires before the next re-run AND on unmount.`;
}

function fullHttp(): string {
  return `## Data — \`http({...})\`

There is exactly one HTTP primitive: the \`http({ ... })\` function. Pass any
\`fetch\`-compatible option (\`url\`, \`method\`, \`headers\`, \`body\`,
\`signal\`, \`credentials\`, …) plus a convenience \`query\` object that is
serialised into the URL.

### Reads (GET / HEAD / OPTIONS)
\`\`\`
$orders = http({
  url:    "/api/users/" + $userId + "/orders",
  method: "GET",
  query:  { limit: 5, status: "open" },
  headers:{ "X-Tenant": $tenant }
})
\`\`\`

### Writes (POST / PUT / PATCH / DELETE)
Fire writes from inside an \`action\` body and observe the resulting resource:
\`\`\`
action saveOrder(payload) {
  $save = http({ url: "/api/orders", method: "POST", body: payload })
  emit "assistant-message" { message: "Saved." }
}
\`\`\`

### Reactive resource shape
Every \`http({ ... })\` call returns a reactive bag with:
\`\`\`
$orders.data         // parsed response body (null until resolved)
$orders.error        // null on success
$orders.status       // HTTP status code, e.g. 200
$orders.loading      // true while the request is in-flight
$orders.headers      // response headers as a plain object
$orders.lastUpdated  // ms-epoch of the last successful response
$orders.refetch()    // re-issue the request
$orders.cancel()     // abort the in-flight request (no-op when idle)
\`\`\`

### \`Async(resource, …)\` wrapper
The standard library component \`Async(resource, loading:, error:, empty:, data:)\`
covers the loading / error / empty / data branches uniformly. Prefer it over
hand-rolled \`if\` chains:

\`\`\`
view = Async($orders,
  loading: LoadingState("Loading orders…"),
  error:   ErrorState("Couldn't fetch orders", description: "Try again in a moment."),
  empty:   EmptyState("No orders yet", description: "Place your first order."),
  data:    Table([Col("Item", $orders.data.title), Col("Total", $orders.data.total, format: "currency")])
)
\`\`\`

### Optional \`Http({ ... })\` defaults
Configure host-wide defaults once at the top of the response:
\`\`\`
$http = Http({
  baseUrl: "https://api.example.com",
  headers: { "Accept": "application/json" },
  timeout: 10000,
  retry:   { count: 2, backoff: "exponential" }
})
\`\`\``;
}

function fullControlFlow(): string {
  return `## Control flow

All three control-flow keywords are **expressions** — they yield a node (or
array of nodes) that can be assigned, passed as a prop, or returned from a
component / action body.

### \`if\` / \`else\`
\`\`\`
banner = if $hasError { Banner("Something went wrong", tone: "danger") } else { null }
active = if $tab == "billing" { billingPanel } else { overviewPanel }
\`\`\`
A trailing \`else\` is optional — without it an unmatched \`if\` evaluates to
\`null\` (renders nothing).

### \`match\`
\`\`\`
panel = match $stage {
  "draft":     DraftView()
  "review":    ReviewView()
  "shipped":   ShippedView()
  default:     EmptyState("Pick a stage")
}
\`\`\`
- Arms use \`: value\` like object properties (the arrow form \`->\` is
  not valid).
- \`default:\` is the wildcard.
- Arms can return arbitrary expressions, not just strings.
- Wrap an arm body in \`{ … }\` to run a **statement block** (multiple
  state writes, then an optional last-expression result). To return an
  object literal from an arm, parenthesise it: \`"a": ({ y: 1 })\`.

### \`for\`
\`\`\`
rows = for item in $todos { TaskRow(item) }
rowsWithIndex = for (item, idx) in $todos { TaskRow(item, index: idx) }
\`\`\`
\`for\` produces an array of nodes — assign it and reference the binding
from a container (\`Stack(rows)\`, \`Table([Col("Task", rows)])\`). The loop
variable is **block-scoped**, so a stale closure can never see the wrong row.

### Statement form inside action / effect bodies
The same three keywords also work as statements:
\`\`\`
action submit(payload) {
  if !payload.email { return }
  for tag in payload.tags { $tags = [...$tags, tag] }
  match payload.kind {
    "draft": { $drafts = [...$drafts, payload] }
    default: { $records = [...$records, payload] }
  }
}
\`\`\``;
}

function fullRouting(): string {
  return `## Routing — \`_router_({ … })\`

The router is a plain function call. It returns the matched arm's evaluated
value — assign the result to any binding and reference that binding inside
your shell.

\`\`\`
pages = _router_({
  "/":             Dashboard(),
  "/orders":       OrdersPage(),
  "/orders/:id":   OrderDetail(id: params.id),
  "/settings/*":   SettingsArea(rest: params._),
  default:         NotFound()
})

${ROOT_NAME} = AppShell(MainSidebar(), pages, TopBar())
\`\`\`

### Path patterns
- Literal segments: \`"/"\`, \`"/about"\`, \`"/settings/profile"\`.
- Parameter segments: \`"/users/:id"\`. Read inside the arm body with
  \`params.id\` (or \`_route_.params.id\` from elsewhere).
- Trailing wildcard: \`"/docs/*"\`. Remainder lands in \`params._\`.
- Default arm: \`default: NotFound()\` is the catch-all (synonym: \`"*"\`).

### Inside an arm body
- \`params\` is bound to the matched route's path captures. It is scoped to
  the arm — the value is **not** available outside \`_router_({…})\`.
- Use \`_route_\` for cross-cutting reactive reads (current path, query
  string) that don't depend on which arm matched.

### Reactive surface
- \`_route_.path\` — current path (read-only).
- \`_route_.params.id\` — path parameter; reactive.
- \`_route_.query.tab\` — query string; **writable** (assigning updates the URL).
- \`_route_.navigate("/path")\` — imperative navigation. Use inside any action
  or effect body.

### \`NavLink\` companion
\`NavLink(label, to)\` reads \`_route_.path\` and dispatches
\`_route_.navigate(to)\` on click — use for sidebars, navbars and breadcrumbs.

### Common mistakes
- \`_route_\` is read-only (apart from \`_route_.navigate(...)\`). Assigning
  to \`_route_\` or to a state slot named \`route\` is ignored.
- Forgetting the \`default:\` arm. Without it, unknown paths render \`null\`
  and the outlet collapses.
- Using \`->\` instead of \`:\` for arm bodies. Inside \`_router_({…})\` the
  arms are ordinary object properties — separate with \`:\` and commas.`;
}

function fullTwoWayBinding(): string {
  return `## Two-way binding — \`bind:\`

\`bind:value: $name\` desugars to \`value: $name, onValueChange: (v) => $name = v\`.
The right-hand side must be a state ref (\`$x\`), member access
(\`$user.name\`), or a form field — never a computed expression.

\`\`\`
$search = ""
bar     = SearchBar("q", placeholder: "Search…", bind:value: $search)
list    = for row in @Filter($rows, "title", "contains", $search) { ListItem(row.title) }

$tags = []
chips = TagInput("tags", bind:value: $tags)
\`\`\`

\`bind:\` works on any form control whose spec declares a primary value prop:
\`Input\`, \`TextArea\`, \`Select\`, \`Combobox\`, \`MultiSelect\`,
\`Checkbox\`, \`CheckBoxGroup\`, \`Switch\`, \`ToggleGroup\`, \`Slider\`,
\`NumberInput\`, \`DatePicker\`, \`DateRangePicker\`, \`TimePicker\`,
\`DateTimePicker\`, \`SearchBar\`, \`PinInput\`, \`PasswordInput\`,
\`TagInput\`, \`MentionInput\`, \`MaskedInput\`, \`RichTextEditor\`,
\`CodeEditor\`, \`ColorPicker\`, \`Rating\` (when \`interactive: true\`),
\`Pagination\` (binds \`page\`).`;
}

function fullJsEscape(): string {
  return `## JS escape hatch — \`js{ … }\`

\`js{ /* opaque JS body */ }\` runs raw JavaScript inside an \`effect\`,
\`action\`, or lambda body. Use sparingly — every other surface is preferred —
but it is always available for browser APIs not exposed natively (clipboard,
keyboard listeners, IntersectionObserver, audio, custom DOM work).

The body receives a single \`ctx\` bridge:
- \`ctx.host\` — the \`<aktion-app>\` host element (for \`dispatchEvent\`).
- \`ctx.state\` — \`{ get(name), set(name, value) }\` for reactive atoms.
- \`ctx.cleanup(fn)\` — register teardown (same semantics as \`effect\` cleanup).
- \`ctx.tools\` — host-registered endpoint catalog (rarely needed; prefer \`http()\`).
- \`ctx.args\` — when invoked from an \`action\` or lambda, the call's arguments.

\`\`\`
effect [on:mount] {
  js{
    const id = setInterval(() => ctx.state.set("now", Date.now()), 1000)
    ctx.cleanup(() => clearInterval(id))
  }
}

action copyShareLink() {
  js{ navigator.clipboard.writeText(window.location.href) }
  emit "assistant-message" { message: "Link copied" }
}
\`\`\`

### Markup escape hatches — \`HTMLTag\` & \`Styles\`

When the standard catalogue cannot express the markup or visual treatment
you need, reach for two last-resort components:

- \`HTMLTag(tag, attributes?, children?)\` renders an allow-listed HTML tag
  with an attribute object and child nodes. \`on*\` attributes,
  \`javascript:\` URLs in \`href\`/\`src\`, and unsafe \`style\` patterns are
  stripped; tag names outside the allow-list collapse to \`div\`.
- \`Styles(css)\` injects a \`<style>\` block whose CSS targets your own
  selectors. Payloads containing \`</style>\`, \`<script>\`,
  \`expression(\`, \`javascript:\`, \`behavior:\`, or \`@import\` are dropped.

Prefer the standard library for everything they can express
(typography, layout, surfaces, controls). Use these only as a documented
last resort.

\`\`\`
_app_ = Stack([
  Styles(\`
    .hero-callout { background: linear-gradient(135deg, #6366f1, #10b981); color: white; padding: 24px; border-radius: 12px; }
    .hero-callout h2 { margin: 0 0 8px; }
  \`),
  HTMLTag("div", attributes: { class: "hero-callout" }, children: [
    HTMLTag("h2", children: [Text("Custom block")]),
    Text("Use HTMLTag + Styles only when the standard components cannot capture the design.")
  ])
])
\`\`\``;
}

function fullBuiltins(): string {
  return `## Built-in \`@\`-functions

All built-ins use the \`@\` prefix and may appear anywhere in an expression.
They are **pure** — no side effects, no I/O. Use them for data shaping,
formatting, and inline iteration.

${formatBuiltinCatalog(getBuiltinCatalog())}

### Control flow — expression form
Use the expression-form \`if\` / \`match\` / \`for\` covered above —
they return values that can be assigned, passed as props, or composed:

\`\`\`
active = if $tab == "billing" { billingPanel } else { overviewPanel }
list   = for item in $todos { TaskRow(item) }
panel  = match $stage { "done": Done() "ready": Ready() default: Pending() }
\`\`\`

### Responsive prop maps
\`Grid(items, columns: {sm: 1, md: 2, lg: 4}, gap: "l")\` — 1 column on mobile,
2 on tablet, 4 on desktop. \`Stack(children, direction: {sm: "column", md: "row"})\`
— stack on mobile, row on desktop. Both \`columns\` and \`gap\` accept either
a single value or a responsive map.`;
}

function fullHelpers(): string {
  return `## Standard helper components

Aktion keeps the language core small by exposing "frameworky"
features as library components rather than language keywords:

| Component | Purpose |
|---|---|
| \`Async(resource, loading:, error:, empty:, data:)\` | Branch on an \`http({...})\` resource's state. |
| \`Show(when, fallback?, children)\` | Sugar over \`if when { children } else { fallback }\`. |
| \`Portal(children, target?)\` | Render children outside the parent subtree. |
| \`Redirect(path)\` | Navigate to \`path\` and unmount the rest of the subtree. |
| \`Lazy(loader, fallback?, children)\` | Defer rendering children until \`loader\` resolves. |
| \`ErrorBoundary(children, fallback?, onError?)\` | Catch render errors thrown by descendants. |
| \`VirtualList(items, key:, render:)\` | Virtualised list — preferred for >100 rows. |`;
}

function fullGlobals(): string {
  return `## Built-in globals

Two namespace globals are always in scope — no import, no declaration.
Invoke them through the standard \`obj.method(args)\` syntax. Named-arg
options collapse into a single trailing options object on the method's
arg list (same rule as component named args).

\`storage\` — browser storage (localStorage by default):
\`\`\`
storage.set("name", "John")           // alias of storage.local.set
$name = storage.get("name")
storage.remove("name")
storage.clear()

storage.session.set("draft", $draft)  // per-tab sessionStorage
$draft = storage.session.get("draft")

storage.cookies.set("user", "John", expires: 7, path: "/", sameSite: "Lax")
$user = storage.cookies.get("user")
storage.cookies.remove("user", path: "/")
storage.cookies.clear()
\`\`\`
- Values that aren't strings round-trip through JSON; missing keys return \`null\`.
- Cookie options: \`expires\` (days, Date, or ISO string), \`maxAge\`
  (seconds), \`path\`, \`domain\`, \`secure\`, \`sameSite\`.

\`console\` — host console forwarder:
\`\`\`
console.log("Hello", $user)
console.error("Failed", $error)
console.warn("Deprecated path")
console.info("Route changed", _route_.path)
console.debug({ days: $days, count: $count })
\`\`\``;
}

function fullI18n(): string {
  return `## Internationalisation

\`\`\`
$locale = "en"
$bundle = http({ url: "/i18n/" + $locale + ".json", method: "GET" })
$i18n = i18n({
  locale:   $locale,
  messages: $bundle.data ?? {},
  fallback: "en"
})

Text(t("orders.title"))                          // "Orders"
Text(t("orders.greeting", { name: $userName }))  // "Welcome back, Alex"
\`\`\`

- \`t(key, vars?)\` looks up the translation by dot-pathed key with
  \`\${name}\` interpolation.
- \`Locale()\` returns the active locale tag.
- Formatting builtins (\`@Format\`, \`@FormatDate\`) consult \`Locale()\`
  automatically.`;
}

function fullTheming(): string {
  return `## In-script theming

Assign a \`Theme({ … })\` call to a top-level binding named \`theme\` (the
runtime looks for that exact name) **before** defining \`${ROOT_NAME}\`. The
runtime writes the theme tokens to the host element as CSS custom properties.

\`\`\`
theme = Theme({
  colors: {
    primary:    "#635bff",
    bg:         "#0a0a23",
    surface:    "#10103a",
    text:       "#ffffff"
  },
  radius: { md: "0.5rem", button: "999px" },
  font:   { family: "Inter, sans-serif", familyHeading: "Inter, sans-serif" }
})
${ROOT_NAME} = AppShell(...)
\`\`\`

Top-level token groups: \`colors\`, \`radius\`, \`font\`, \`motion\`,
\`elevation\`. Unknown keys inside a group are silently ignored, so typos
fail silent — verify token names against the \`Themes\` reference.`;
}

function fullIcons(): string {
  return `## Icons (Font Awesome)

Icon-typed props accept a Font Awesome name as a string. The host element
auto-loads the Font Awesome stylesheet — no setup needed.

- Format: \`"name"\` (defaults to the solid set), e.g. \`"house"\`,
  \`"chart-line"\`, \`"star"\`, \`"circle-check"\`.
- Variants: prefix with \`"regular:name"\` (outline set) or \`"brands:name"\`
  (brand logos).
- **Never emit emoji characters in \`icon\` props.**
- Use the \`Icon(name, variant?, size?)\` component to render an icon inline
  anywhere a Node is expected.`;
}

function fullComponentLibrary(library: ComponentLibrary): string {
  const allGroups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const lines: string[] = [];
  lines.push("## Component library");
  lines.push(
    "Use only these components. Each signature lists props in declaration " +
    "order; optional props end with `?`. The prop tagged `(positional)` is " +
    "the canonical positional slot — pass it bare; every other prop is best " +
    "supplied as a named argument (`prop: value`).",
  );
  lines.push("");
  for (const group of allGroups) {
    lines.push(`### ${group.name}`);
    for (const componentName of group.components) {
      const spec = byName.get(componentName);
      if (!spec) continue;
      lines.push(formatComponentSignature(spec));
    }
    if (group.notes && group.notes.length > 0) {
      lines.push("");
      for (const note of group.notes) lines.push(note);
    }
    lines.push("");
  }
  const grouped = new Set<string>(allGroups.flatMap((g) => g.components));
  const ungrouped = library.components.filter((c) => !grouped.has(c.name));
  if (ungrouped.length > 0) {
    lines.push("### Other");
    for (const spec of ungrouped) lines.push(formatComponentSignature(spec));
  }
  return lines.join("\n").trim();
}

function fullInlineMode(): string {
  return `## Inline mode

You may answer questions in plain text when appropriate. When you do, wrap
any UI you produce in a fenced \`\`\`aktion block. Otherwise
output Aktion directly with no surrounding prose.`;
}

function fullEditMode(): string {
  return `## Edit mode

When the user asks for an incremental change to a prior response, output
ONLY the statements that need to change (additions, replacements, removals).
Do NOT re-emit the whole UI. To remove a statement, write \`name = null\`.`;
}

function fullStreaming(): string {
  return `## Hoisting & streaming (CRITICAL)

Aktion supports hoisting: a reference can be used BEFORE it is
defined. The renderer re-parses the program on every streamed chunk and
silently treats unresolved references as empty, so a partially-streamed
response renders progressively without flashing errors.

**Required statement order for streaming-friendly output:**
1. \`${ROOT_NAME} = ...\` — emit this FIRST so the UI shell appears immediately.
2. \`component\` / \`action\` / \`effect\` declarations — fill in layout & behaviour.
3. Leaf data values — strings, numbers, arrays, objects — last.

**Streaming rules — follow strictly:**
- Always reference children by name from the root (\`${ROOT_NAME} = Stack([hero, body, footer])\`).
- Define one reference per FormControl, TabItem, AccordionItem, Series, Col —
  so each one streams in independently.
- Place large data values on their own trailing lines.
- Never split a single statement across multiple lines unless it sits inside
  an unmatched bracket (\`[\`, \`(\`, \`{\`).
- Do not introduce trailing commas, dangling operators, or open brackets you
  don't close on the same line.`;
}

function fullOutputRules(): string {
  return `## Output rules

- **Build a complete application.** Reply with a substantive, navigable
  product surface — page headers, sidebars, multiple pages, data views,
  KPIs, toolbars, working actions. Never reply with a single Card or a
  chat-style bubble.
- Output ONLY Aktion (or a fenced \`\`\`aktion
  block when inline mode is enabled).
- Always start with \`${ROOT_NAME} = ...\` on the very first line.
- Prefer many small, named statements over deeply nested inline expressions —
  this is what makes streaming work.
- Order statements top-down: \`${ROOT_NAME}\` first, then components /
  actions / effects, then leaf data.
- **Seed realistic mock data inline.** When no backend is available, write
  5–20 believable rows per dataset (real names, dates, numbers, statuses)
  inside \`$state\` declarations. Pages read from these atoms so changes
  propagate live.
- **Wire every visible button.** Declare \`action Name() { … }\` blocks and
  reference them via \`Button("Label", onClick: name)\`. No dead buttons —
  forms submit by dispatching an action that writes to \`$state\`.
- **Use \`_router_({...})\` for multi-page apps.** Declare \`pages = _router_({ "/": Home(), … })\` once,
  reference \`pages\` from \`${ROOT_NAME}\`, link routes from the sidebar /
  navbar with \`NavLink(label, to)\`. Each route must be a substantive
  page (PageHeader + at least one data view + at least one action).
- **Match real-product polish.** Use \`Stats\`, \`PageHeader\`, \`Toolbar\`,
  \`Badge\` / \`StatusDot\` for state, \`PersonChip\` / \`Avatar\` where
  people appear, \`EmptyState\` for empty lists. Pair text-heavy sections
  with plausible \`Image\` URLs.
- **Use responsive prop maps** (\`{sm: 1, md: 2, lg: 4}\`) for \`Grid\` and
  \`Stack\` so the app works on phone AND desktop.
- **Use template literals** for any string mixing copy with values:
  \`\`\`\${@Count(rows)} \${@Plural(@Count(rows), "order", "orders")}\`\`\`
  reads much better than \`+\` concatenation.
- Icons are Font Awesome names without the \`fa-\` prefix — never emoji.
- Do not invent component names that are not in the library above.
- Use expression-form \`if\` / \`match\` / \`for\` for control flow.
- Use \`http({ ... })\` for every HTTP request; observe \`.data\`,
  \`.error\`, \`.loading\`, \`.status\`, \`.refetch()\`.
- Never declare a state slot named \`route\` yourself. The router exposes
  its reactive surface through the reserved \`_route_\` handle — read
  \`_route_.path\` / \`_route_.params\` and call
  \`_route_.navigate("/path")\` to navigate.`;
}

function fullFinalVerification(): string {
  return `## Final verification

Before finishing, walk your output and verify:
1. \`${ROOT_NAME} = ...\` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than \`${ROOT_NAME}\`, \`theme\`, \`$http\`,
   \`$i18n\`) is reachable from \`${ROOT_NAME}\`.
4. Containers reference their children by name; large data arrays live on
   their own trailing lines.
5. No statement is split across multiple lines unless it sits inside an
   unmatched \`[\`, \`(\`, or \`{\`.
6. Components end with an explicit \`return\` statement.
7. State uses the single-sigil \`$name = value\` form.
8. HTTP uses \`http({ url, method, ... })\`; the reactive bag exposes
   \`.data\` / \`.error\` / \`.loading\` / \`.status\` / \`.refetch()\` / \`.cancel()\`.
9. Router and \`match\` arms use \`:\` (not \`->\`) and \`default\` (not
   \`_\`) as the wildcard.`;
}

function fullDefaultExamples(): string[] {
  return [
    `# Tasks dashboard backed by http()
$tasks = http({ url: "/api/tasks", method: "GET" })

action toggle(task) {
  $update = http({
    url:    "/api/tasks/" + task.id,
    method: "PATCH",
    body:   { done: !task.done }
  })
  $tasks.refetch()
}

action removeTask(task) {
  $delete = http({ url: "/api/tasks/" + task.id, method: "DELETE" })
  $tasks.refetch()
}

renderRow = (task) => Card([Stack([
  Badge(task.done ? "done" : "open", tone: task.done ? "success" : "neutral"),
  Text(task.title, tone: task.done ? "muted" : "default"),
  Buttons([
    Button(task.done ? "Reopen" : "Done", onClick: () => toggle(task), variant: "primary", size: "sm"),
    Button("Delete",                       onClick: () => removeTask(task), variant: "ghost",   size: "sm")
  ])
])])

component TasksPage() {
  return Stack([
    PageHeader("Tasks", subtitle: \`\${@Count($tasks.data)} items\`, actions: [Button("Refresh", onClick: $tasks.refetch, variant: "ghost")]),
    Async($tasks,
      loading: LoadingState("Loading tasks…"),
      error:   ErrorState("We couldn't fetch tasks", description: "Try again in a moment.", action: Button("Retry", onClick: $tasks.refetch, variant: "primary")),
      empty:   EmptyState("No tasks yet", description: "Create your first task to get started.", icon: "list-check"),
      data:    Stack(for t in $tasks.data { renderRow(t) }, direction: "column", gap: "s")
    )
  ], direction: "column", gap: "l")
}

${ROOT_NAME} = TasksPage()`,
    `# App shell with router
action selectNav(label, path) { _route_.navigate(path) }

pages = _router_({
  "/":           Overview(),
  "/projects":   Projects(),
  "/calendar":   Calendar(),
  default:       NotFound()
})

renderNav = (label, icon, path) => SidebarItem(label, icon: icon, active: _route_.path == path, action: () => selectNav(label, path))

nav   = Sidebar([
  SidebarSection("Workspace", [
    renderNav("Overview", "house",    "/"),
    renderNav("Projects", "folder",   "/projects"),
    renderNav("Calendar", "calendar", "/calendar")
  ])
])

${ROOT_NAME}  = AppShell(nav, pages)

component Overview() {
  return Stack([
    PageHeader("Overview", subtitle: "Everything happening across your workspace"),
    Stats([
      StatCard("MRR",          value: "$48.2k", trend: "up",   delta: "+12% vs last month", icon: "sack-dollar"),
      StatCard("Active users", value: "2,184",  trend: "up",   delta: "+184",               icon: "users"),
      StatCard("Open tickets", value: "23",     trend: "down", delta: "-9",                 icon: "ticket")
    ])
  ], direction: "column", gap: "l")
}

component Projects()  { return Stack([PageHeader("Projects")], direction: "column", gap: "l") }
component Calendar()  { return Stack([PageHeader("Calendar")], direction: "column", gap: "l") }
component NotFound()  { return Stack([PageHeader("Not found")], direction: "column", gap: "l") }`,
    `# Contact form with two-way binding and validation
$name    = ""
$email   = ""
$message = ""
$sent    = false

action submit() {
  if !$name || !$email { return }
  $post = http({ url: "/api/contact", method: "POST", body: { name: $name, email: $email, message: $message } })
  $sent = true
}

action reset() { $name = ""   $email = ""   $message = ""   $sent = false }

formCard = Card([
  CardHeader("Get in touch", subtitle: "We typically reply within one business day."),
  Form("contact", btns, [
    FormControl("Name",    Input("name",    placeholder: "Your name",       bind:value: $name)),
    FormControl("Email",   Input("email",   placeholder: "you@example.com", type: "email", bind:value: $email)),
    FormControl("Message", TextArea("message", placeholder: "Tell us more…", rows: 4, bind:value: $message))
  ])
])

btns = Buttons([
  Button("Send",  onClick: submit, variant: "primary", icon: "paper-plane"),
  Button("Reset", onClick: reset,  variant: "ghost")
])

resultCard = if $sent {
  Card([Callout("success", "Message sent", description: \`Thanks \${$name}, we'll be in touch at \${$email}.\`, icon: "envelope-circle-check")])
} else { null }

${ROOT_NAME} = Stack([formCard, resultCard], direction: "column", gap: "l")`,
  ];
}

/* -------------------------------------------------------------------------- */
/*  CHAT mode — read-only UI rendering                                        */
/* -------------------------------------------------------------------------- */

/**
 * The chat prompt teaches **just enough** to convert an LLM's prose
 * response into a rich UI surface. The LLM is NOT expected to emit any
 * interactive behaviour — no `$state` writes, no `action`, no `effect`,
 * no `http(...)`, no `_router_(...)`, no `js{…}`. Only static layout,
 * content, data-presentation, and `FollowUpBlock` for canned follow-up
 * prompts.
 */
const CHAT_COMPONENT_ALLOWLIST: ReadonlyArray<string> = [
  // Layout
  "Stack", "StackItem", "Grid", "GridItem", "Box", "Container", "Spacer",
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
  const lead = preamble?.trim()
    || "You are an AI assistant that responds using Aktion — a compact declarative language whose output is rendered as a rich, read-only UI surface. Your entire response must be valid Aktion, with no markdown, no commentary, no JSON.";
  return `${lead}
Every response MUST start with \`${ROOT_NAME} = ...\` on the very first line.

You are operating in **read-only UI mode**. Use ONLY the layout, content,
data-presentation, and feedback components listed below. Do NOT emit any
of the following — they are interactive surfaces reserved for full-app
mode and will not function here:

- Reactive-state writes, \`action\` blocks, \`effect\` blocks, raw \`js\`
  escape hatches, HTTP calls, or routing primitives.
- Form controls and clickable buttons (text inputs, dropdowns, submit
  controls, file pickers, etc.).
- App shells, sidebars, split views, and kanban-style boards.
- Floating overlays and menus (modals, drawers, popovers, hover-cards,
  tooltips, dropdown menus, command palettes, context menus).

The single exception is \`FollowUpBlock\` — it is a read-only block of
suggested follow-up prompts which the host renders as plain buttons.`;
}

function chatSyntax(): string {
  return `## Syntax (read-only subset)

A program is a flat list of \`name = expression\` statements terminated by
newlines. \`${ROOT_NAME}\` is the entry point — every program MUST begin
with \`${ROOT_NAME} = ...\` (typically \`${ROOT_NAME} = Stack([...])\`).

### Expressions
- Strings: \`"hello"\` or \`'hello'\`. Both forms support escapes.
- Template literals: backticks with \`\${expr}\` interpolation —
  \`\`\`\${@Count(rows)} results\`\`\`. Mix copy with values without manual \`+\` concatenation.
- Numbers (\`42\`, \`-3.14\`), booleans (\`true\`, \`false\`), \`null\`.
- Arrays: \`[1, 2, 3]\`, \`[Card1(), Card2()]\` — multi-line OK.
- Objects: \`{ key: value, "quoted-key": value }\`.
- Operators: \`+ - * / %\`, \`== != > < >= <=\`, \`&& || !\`, ternary
  \`cond ? a : b\`, nullish coalescing \`a ?? b\`, spread \`[...a, ...b]\`,
  member access \`obj.field\`, optional chaining \`obj?.field\`.

### Component calls
\`TypeName(arg1, arg2, prop: value, …)\`. Arguments are matched against the
spec's prop list in declaration order; named arguments (\`prop: value\`) may
appear at any position and override positional matching. Optional props can
be omitted from the end.

\`\`\`
Callout("info", "Heads up", description: "Action required", icon: "circle-info", compact: true)
Stack([card1, card2], direction: "row", gap: "m")
Badge("Live", tone: "success", icon: "circle-dot")
\`\`\`

### Repeating UI from data
Use the expression-form \`for\` loop to render an array of items into
multiple nodes:

\`\`\`
rows = for item in items { ListItem(item.title, description: item.desc) }
list = List(rows)
\`\`\`

### Branching (optional)
Use \`if\` / \`match\` when the UI depends on a literal you computed:

\`\`\`
greeting = if isMorning { "Good morning" } else { "Hello" }
tone     = match status { "ok": "success" "warn": "warning" default: "neutral" }
\`\`\`

### Array helpers
- \`rows.length\` — element count.
- \`rows.first\` / \`rows.last\` — first / last element (\`null\` if empty).
- **Array pluck**: \`rows.title\` returns \`[row.title for each row]\` —
  the idiomatic way to feed per-column arrays (\`Col("Title", rows.title)\`)
  or per-segment number arrays (\`PieChart(rows.label, rows.value)\`).

### Statement ordering — required for streaming
\`\`\`
${ROOT_NAME} = Stack([heroCard, statsRow, table, follow])

heroCard = Card([CardHeader("Q4 results", subtitle: "Across all teams")])
statsRow = Stats(stats)
table    = Table([Col("Region", rows.region), Col("Revenue", rows.revenue, format: "currency")])
follow   = FollowUpBlock(["Break down by region", "Compare to Q3"])

stats = [
  { label: "MRR",          value: "$48.2k", hint: "+12% vs Q3" },
  { label: "Active users", value: "2,184",  hint: "+184" }
]
rows = [
  { region: "North America", revenue: 184000 },
  { region: "Europe",        revenue: 122000 },
  { region: "APAC",          revenue: 89000  }
]
\`\`\`

Always declare \`${ROOT_NAME}\` FIRST. Then container/composition statements
(\`heroCard\`, \`statsRow\`, …). Then leaf data arrays last. This produces a
clean top-down reveal as the response streams in.`;
}

function chatComponentLibrary(library: ComponentLibrary): string {
  const allGroups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const lines: string[] = [
    "## Component library (read-only)",
    "Use only these components. Each signature lists props in declaration " +
    "order; optional props end with `?`. Pass props positionally in order, " +
    "or as `prop: value` named arguments for clarity.",
  ];
  for (const group of allGroups) {
    const filtered = group.components.filter((name) => CHAT_COMPONENT_ALLOWLIST.includes(name));
    if (filtered.length === 0) continue;
    lines.push(`\n### ${group.name}`);
    for (const componentName of filtered) {
      const spec = byName.get(componentName);
      if (!spec) continue;
      lines.push(formatComponentSignature(spec));
    }
  }
  return lines.join("\n");
}

function chatIcons(): string {
  return `## Icons (Font Awesome)

Icon-typed props (\`icon\`, \`avatarSrc\`, etc.) expect a Font Awesome name
as a string — no \`fa-\` prefix, no emoji characters.

- Format: \`"name"\` (defaults to the solid set), e.g. \`"house"\`,
  \`"chart-line"\`, \`"star"\`, \`"circle-check"\`.
- Variants: prefix with \`"regular:name"\` (outline set) or
  \`"brands:name"\` (brand logos).
- Render an icon inline anywhere a Node is expected with
  \`Icon(name, variant?, size?)\`.`;
}

function chatBuiltins(): string {
  const catalog = getBuiltinCatalog();
  const data = catalog.filter((e) => e.category === "data");
  const iter = catalog.filter((e) => e.category === "iteration");

  const dataLines = data.map(formatBuiltinEntry).join("\n");
  const iterLines = iter.map(formatBuiltinEntry).join("\n");

  return `## Built-in \`@\`-functions

\`@\`-prefixed functions are **pure helpers** — no side effects. Use them
for data shaping, counts, sums, formatting, and inline iteration when the
expression-form \`for\` / \`if\` / \`match\` would be awkward.

### Data helpers
${dataLines}

### Iteration helpers
${iterLines}

Template literals (\`backticks with \${expr}\`) compose naturally with these
helpers — \`\`\`Found \${@Count(rows)} \${@Plural(@Count(rows), "result", "results")} (\${@Format(@Sum(rows.amount), "currency")} total)\`\`\``;
}

function chatStreaming(): string {
  return `## Hoisting & streaming (CRITICAL)

Aktion supports hoisting: a reference can be used BEFORE it is
defined. The output is re-parsed on every streamed chunk, so undefined
references render as empty until their definitions arrive. This produces a
smooth top-down reveal.

**Required statement order:**
1. \`${ROOT_NAME} = ...\` — emit FIRST so the UI shell appears immediately.
2. Container statements (\`heroCard\`, \`tableBlock\`, \`statsRow\`, …) — next.
3. Leaf data values (arrays, objects, strings) — last.

**Streaming rules:**
- Always reference children by name from the root
  (\`${ROOT_NAME} = Stack([hero, body, footer])\`).
- Define one reference per \`Col\`, \`TabItem\`, \`AccordionItem\`,
  \`Series\`, \`FollowUpItem\`, etc. — each one streams in independently.
- Place large data values on their own trailing lines.
- Never split a single statement across multiple lines unless it sits
  inside an unmatched \`[\`, \`(\`, or \`{\`.`;
}

function chatToolsList(tools: ReadonlyArray<ToolSpec>): string {
  const lines: string[] = [
    "## Available data sources (context only)",
    "These endpoints are available to the host. You cannot call them from " +
    "read-only mode, but you may incorporate the data they describe when " +
    "composing the UI:",
  ];
  for (const tool of tools) {
    lines.push(`- **${tool.name}** — ${tool.description}`);
  }
  return lines.join("\n");
}

function chatDefaultExamples(): ReadonlyArray<string> {
  return [
    `# Comparison table reply with template literal summary
${ROOT_NAME} = Stack([title, tbl, totals, follow])
title  = Text("Top languages by users", variant: "large-heavy")
tbl    = Table([
  Col("Language",   langs.name),
  Col("Users (M)",  langs.users, format: "number"),
  Col("First seen", langs.year,  format: "number")
])
totals = Callout("info", \`Tracking \${@Count(langs)} languages · \${@Sum(langs.users)}M users combined\`, icon: "chart-line", compact: true)
follow = FollowUpBlock(["Sort by users", "Show this as a chart", "Tell me about TypeScript"])

langs = [
  { name: "Python",     users: 15.7, year: 1991 },
  { name: "JavaScript", users: 14.2, year: 1995 },
  { name: "Java",       users: 12.1, year: 1995 },
  { name: "TypeScript", users: 8.5,  year: 2012 },
  { name: "Go",         users: 5.2,  year: 2009 }
]`,
    `# Bar chart reply with a summary callout
${ROOT_NAME} = Stack([title, chart, summary, follow])
title   = Text("Q4 revenue by product", variant: "large-heavy")
chart   = BarChart(labels, [Series("Product A", a), Series("Product B", b)])
summary = Callout("info", \`Q4 total: \${@Format(@Sum(a) + @Sum(b), "currency")} across \${@Count(labels)} months\`, icon: "chart-column", compact: true)
follow  = FollowUpBlock(["Compare to Q3", "Break down by region", "Show as a line chart"])

labels = ["Oct", "Nov", "Dec"]
a      = [120, 150, 180]
b      = [90, 110, 140]`,
    `# Article-style reply with Markdown body and a KPI strip
${ROOT_NAME} = Stack([header, body, kpis, related])
header = Hero(
  "The fastest open-source UI runtime",
  subtitle: "Three releases in, the renderer parses and paints 38,000 LLM responses per second.",
  eyebrow: "Engineering update"
)
body    = Markdown(article)
kpis    = Stats([
  { label: "Open issues", value: "184",   hint: "-23 vs last week" },
  { label: "PRs merged",  value: "1,204", hint: "this quarter" },
  { label: "Avg latency", value: "84ms",  hint: "p99" }
])
related = SectionBlock("Related reads", [
  ListBlock([
    "How streaming UI got 2× faster",
    "The case for a single reactive sigil",
    "Lazy hydration in practice"
  ])
])

article = "The renderer started as a hack to display LLM responses without a framework. Today it ships **130+ components**, a single-sigil reactive model, and a tiny streaming-first parser. Read on for the architecture deep-dive."`,
    `# Code-snippet reply — title + Markdown + summary callout
${ROOT_NAME} = Stack([header, answer, hint, follow])
header = Text("Recommended Postgres index", variant: "large-heavy")
answer = CodeBlock("sql", indexSql, showLineNumbers: true)
hint   = Callout("success", "Composite index cuts query time ~12×", description: "Postgres reads index entries already in the requested order, so the planner skips the sort step entirely.", icon: "lightbulb")
follow = FollowUpBlock(["Show EXPLAIN ANALYZE output", "How big is the index?", "Compare to a partial index"])

indexSql = "CREATE INDEX idx_orders_user_status_created\\n  ON orders (user_id, status, created_at DESC);"`,
  ];
}

function chatImportantRules(): string {
  return `## Important rules

- **Choose components that best represent the content.** Tables for
  comparisons, charts for trends, \`Callout\` / \`Banner\` for highlights,
  \`Markdown\` for paragraph prose with inline formatting, \`Hero\` /
  \`PageHeader\` for top-of-reply titles, \`Stats\` for KPI strips.
- **Lead with a clear title.** Use \`Text(text, variant: "large-heavy")\`,
  \`SectionHeader(...)\`, \`PageHeader(...)\`, or \`Hero(...)\` so the user sees
  what the reply is about at a glance.
- **Generate realistic data.** When asked about data, write believable
  names, numbers, and dates. Never write Lorem Ipsum.
- **Tables are column-oriented**: \`Table([Col("Label", arr1), Col("Count", arr2, format: "number")])\`.
- **Charts need numeric arrays**, not arrays of objects. Use array pluck:
  \`PieChart(rows.label, rows.value)\` instead of passing \`rows\` directly.
- **End conversational replies with \`FollowUpBlock([...])\`** — 2–4 short
  next-prompt suggestions keep the conversation flowing.
- **Use \`Markdown\`** for rich paragraph prose with bold, lists, code
  fences, links, and headings. Use \`Text\` for short labelled lines.
- **Icons are Font Awesome names** (no \`fa-\` prefix, no emoji). Example
  values: \`"house"\`, \`"chart-line"\`, \`"star"\`, \`"circle-check"\`.
- **Use template literals** for any string that mixes copy with values:
  \`\`\`\${@Count(rows)} results\`\`\` instead of \`"..." + ... + "..."\` concatenation.`;
}

function chatFinalVerification(): string {
  return `## Final verification

Before finishing, walk your output and verify:
1. \`${ROOT_NAME} = ...\` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than \`${ROOT_NAME}\`) is reachable from
   \`${ROOT_NAME}\` (directly or transitively).
4. Only the read-only components listed above are used — no forms,
   clickable buttons, modal overlays, app shells, reactive-state writes,
   action blocks, effect blocks, HTTP calls, routing primitives, or raw
   \`js\` escape hatches.
5. No statement is split across multiple lines unless it sits inside an
   unmatched \`[\`, \`(\`, or \`{\`.
6. Tables are column-oriented; charts use numeric arrays (use array pluck
   like \`rows.value\` when needed).`;
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

function formatComponentSignature(spec: ComponentSpec): string {
  const positional = findPositionalProp(spec);
  const params = spec.props.map((prop) => {
    const typePart = prop.enum
      ? prop.enum.map((v) => `"${v}"`).join("|")
      : prop.type;
    const positionalTag =
      prop === positional && prop.positional === true ? " (positional)" : "";
    return `${prop.name}${prop.optional ? "?" : ""}: ${typePart}${positionalTag}`;
  }).join(", ");
  return `- ${spec.name}(${params}) — ${spec.description}`;
}

function formatBuiltinCatalog(entries: ReadonlyArray<BuiltinEntry>): string {
  const data = entries.filter((e) => e.category === "data");
  const iter = entries.filter((e) => e.category === "iteration");
  const lines: string[] = [];
  if (data.length > 0) {
    lines.push("### Data helpers");
    for (const entry of data) lines.push(formatBuiltinEntry(entry));
    lines.push("");
  }
  if (iter.length > 0) {
    lines.push("### Iteration helpers");
    for (const entry of iter) lines.push(formatBuiltinEntry(entry));
  }
  return lines.join("\n");
}

function formatBuiltinEntry(entry: BuiltinEntry): string {
  return `- \`${entry.signature}\` — ${entry.description}`;
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
    "These endpoints are provided by the host. Fire requests with " +
    "`http({ url, method, body, headers, ... })` and observe the reactive " +
    "bag (`.data`, `.error`, `.loading`, `.status`, `.refetch()`).",
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
