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
import { findPositionalProp, propExpectsObject } from "../library/types.js";

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

  // Section ORDER is a deliberate part of the prompt's design, not an accident of
  // how the file grew. The component library is ~80% of the characters and is
  // near-uniform bullet list, so anything placed after it competes with 190k
  // chars of low-salience text. The cheat-sheet, the common-mistakes table, the
  // worked examples, and the pre-flight checklist are the four highest-value
  // pieces, so three of them go BEFORE the dump and the checklist goes last,
  // where a final instruction lands best.
  const sections: string[] = [];
  sections.push(fullHeader(options.preamble));
  sections.push(fullHostElement());
  sections.push(fullCheatSheet());
  sections.push(fullCommonMistakes());
  sections.push(fullCoreSyntax());
  sections.push(fullJavaScript());
  if (showState) sections.push(fullReactiveState());
  sections.push(fullComponentsAndActions());
  sections.push(fullEffects());
  if (showHttp) sections.push(fullHttp());
  sections.push(fullRouting());
  sections.push(fullGlobals());
  sections.push(fullEmitAndWrappers());
  sections.push(fullOverlays());
  sections.push(fullEscapeHatches());
  sections.push(fullInteropAndHead());
  sections.push(fullUniversalProps());
  sections.push(fullThemingI18nIcons());
  sections.push(fullUtil());
  sections.push(fullHelpers());
  if (options.tools && options.tools.length > 0) {
    sections.push(toolsListSection(options.tools));
  }
  if (options.toolExamples && options.toolExamples.length > 0) {
    sections.push(examplesSection("Endpoint examples", options.toolExamples));
  }
  const examples = options.examples ?? fullDefaultExamples();
  if (examples.length > 0) sections.push(examplesSection("Examples", examples));
  sections.push(fullComponentLibrary(library));
  if (options.inlineMode) sections.push(fullInlineMode());
  if (options.editMode) sections.push(fullEditMode());
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
  sections.push(chatMarkdownMapping());
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

/**
 * The host element's attributes. These are set by the PAGE, never by a program,
 * but a model needs to know they exist: `theme` selects the palette the program
 * must look right on, and `router-mode` decides whether `route.navigate("/x")`
 * writes a path or a hash.
 */
function fullHostElement(): string {
  return `## The host element — \`<aktion-app>\`

Set by the HOST PAGE, never from Aktion code. Listed so you know what is configurable and never try to set it yourself.

| Attribute | Values | Effect |
| --- | --- | --- |
| \`theme\` | \`light\` \`dark\` \`corporate\` \`soft\` \`glass\` \`modern\` | Base palette. \`$theme({...})\` layers on top of it. A theme selected by name also loads its web fonts. |
| \`dir\` | \`ltr\` \`rtl\` \`auto\` | Flips the whole tree. Programs need no change. |
| \`margin\` | \`0\` \`12\` \`1rem\` | Outer gutter (default 20px). |
| \`scroll-restoration\` | \`auto\` \`top\` | Scroll behaviour on navigation. |
| \`router-mode\` | \`hash\` (default) \`history\` | Whether \`route.navigate()\` uses clean paths or hashes. |
| \`router-base\` | e.g. \`/app\` | Path prefix in history mode. |
| \`streaming\` \`response\` \`src\` | — | How the program text is delivered. |
| \`showerrors\` | — | Renders the error banner instead of hiding failures. |
| \`strict\` | — | Dev mode: surfaces silent failures (unknown identifiers, unmatched props) as console warnings. |`;
}

/**
 * A compact grammar the model can pattern-match on before reading any prose.
 * Placed third, right after the header, because the single most useful thing a
 * prompt can do early is show the shape of every construct in one screen.
 */
function fullCheatSheet(): string {
  return `## Cheat sheet — every construct, one line each

\`\`\`
$app(Column([header, list]))                      // UI root — EXACTLY ONE per program, first line
$count = 0                                        // reactive atom (the $ sigil is what makes it reactive)
label = "Total"                                   // plain binding, evaluated once
function Card2(t) { return Card([Text(t)]) }      // returns a tree → renders where called
function save() { $count += 1 }                   // no return → runs for side effects
$effect(() => { … }, [$count])                    // deps: $atoms and "mount"/"unmount"/"every(N)"/"debounce(N)"/"throttle(N)" ONLY
$rows = $http({ url: "https://…" })               // bag: .data .loading .error .status .refetch() .onDone
$me   = $query({ url: "…", key: "me", ttl: 5000 }) // cached + deduplicated read
$save = $mutation({ url: "…", method: "POST" })   // deferred write — fires on .mutate(overrides?)
cart  = $store({ items: [], add: (s, x) => { s.items = [...s.items, x] }, persist: "cart", history: true })
form  = $form({ values: { email: "" }, rules: { email: [$util.rules.required()] }, onSubmit: (v) => … })
pages = $router({ "/": Home(), "/o/:id": Detail(params.id), default: NotFound() })
$theme({ colors: { primary: "#0969da" }, radius: { button: "6px" } })   // before $app(...)
Async($rows, { loading: …, error: …, empty: …, data: … })               // all four states
Show($cond, { children: A(), fallback: B() })                            // sugar over if/else
items.map(r => Row([Text(r.name)]))               // value-producing iteration (for/if/switch are STATEMENTS)
Card([...], { sx: { p: "lg", maxW: "480px" }, animate: "fade-in-up" })   // universal props, every component
$state(0) $memo(() => v, [d]) $ref(null) $reducer(fn, init) $id("x")     // per-instance hooks
$util.* $storage.* $console.* $toast.* $dom.*     // the five reserved namespaces
route.path route.params route.query route.pattern route.navigate(to)     // always in scope, reactive
\`\`\``;
}

/**
 * WRONG → RIGHT pairs. Every code block elsewhere in the prompt shows only
 * correct code, which is the weakest format for teaching a constraint; a model
 * needs to see the mistake it is about to make. Ordered by how often each is
 * actually made — hallucinated component names first, because
 * `src/tooling/language-service.ts` calls that "the single most common defect in
 * LLM-authored Aktion".
 */
function fullCommonMistakes(): string {
  return `## Common mistakes — read before writing

\`\`\`
✗ Alert("Failed", { tone: "danger" })          ✓ Callout("Failed", { tone: "danger" })
   Alert / Tag / Chip / Panel / Textbox DO NOT EXIST. Every component name must appear
   verbatim in the Component library section below. An unknown name renders NOTHING,
   silently — no error. When unsure, pick the nearest listed name.

✗ Column([Header, Body])                        ✓ Column([Header(), Body()])
   A bare identifier is a value, not a call. Components need ().

✗ Button("Save", "primary")                     ✓ Button("Save", { variant: "primary" })
   Slot 2 of Button is onClick, not variant. Non-adjacent props go in the trailing object.

✗ Card([x], { p: "md" }, { gap: "sm" })         ✓ Card([x], { p: "md", gap: "sm" })
   One trailing object per call. Never split named props across two objects.

✗ Column([$count += 1, Text($count)])           ✓ Button("Add", { action: () => { $count += 1 } })
   State writes belong in handlers and effects, never in render position.

✗ $theme({ colorPrimary: "#09f" })              ✓ $theme({ colors: { primary: "#09f" } })
   Flat token keys were removed in 0.5 and raise a schema error.

✗ Table([{ name: "Ada", age: 36 }])             ✓ Table([Col("Name", rows.name), Col("Age", rows.age)])
   Tables are COLUMN-oriented — pluck an array per column.

✗ util.format(n)  /  toast.success("Hi")        ✓ $util.format(n)  /  $toast.success("Hi")
   $util, $toast and $dom exist ONLY with the sigil. Without it they resolve to nothing.

✗ $toasts = [...$toasts, { msg }]               ✓ $toast.success("Saved")
   $toast renders its own stacked layer. Never hand-manage a toast array.

✗ Icon("fa-house")  /  Text("🎉 Done")          ✓ Icon("house")  /  Text("Done", { icon: "party-horn" })
   Font Awesome names carry no fa- prefix, and raw emoji are never acceptable.

✗ $effect(() => { … }, [route.path])            ✓ $effect(() => { … }, [$util.url.path])
   Effect deps accept $atoms and the string tokens only — route is a parse error.

✗ Stack([...], { direction: "row" })            ✓ Row([...], { gap: "md" })
   Reserve Stack for a direction that CHANGES across breakpoints.
\`\`\`

### Confusable names — all of these are real, distinct components

- \`Navbar\` top nav bar for a site · \`NavBar\` marketing-page variant · \`TopBar\` compact strip above scrolling content · \`AppShell\` full sidebar+content product shell.
- \`Toast\` one transient notice · \`Toasts\` a stack container (usually unnecessary — \`$toast.*\` auto-renders).
- \`Button\` one control · \`Buttons\` a gapped row · \`ButtonGroup\` buttons joined edge-to-edge · \`SegmentedControl\`/\`ToggleGroup\` a padded track with a selected chip.
- \`Split\` a two-pane layout primitive · \`SplitView\` master/detail with scrollable panes · \`ResizablePanels\` user-draggable divider.
- \`Calendar\` scheduling grid · \`CalendarView\` month/week event grid · \`DatePicker\` an input.
- \`Table\` static columns · \`DataGrid\` sortable/filterable/paged/selectable · \`ComparisonTable\` feature-matrix rows.
- \`Text\` one string with a type variant · \`TextContent\` a block of prose nodes · \`Prose\` long-form article styling · \`Markdown\` parses markdown source.
- \`Badge\` solid attention chip ("Recommended") · \`Pill\` soft tinted state label ("SSL active") · \`StatusDot\` inline pip · \`Chip\` does not exist.
- \`Spinner\` rotating ring · \`LoadingDots\` three-dot pulse · \`Skeleton\` content placeholder · \`LoadingState\` full-card state.`;
}

/**
 * The floating/top-layer contract. `src/library/floating.ts` is a shared
 * positioning engine behind nine components, and the behaviour an author must
 * know — they are never clipped, they share a side/align vocabulary, they share a
 * dismissal contract — was only discoverable by reading nine separate component
 * descriptions.
 */
function fullOverlays(): string {
  return `## Overlays & floating layers

\`Modal\`, \`Drawer\`, \`Sheet\`, \`BottomSheet\`, \`ConfirmDialog\`, \`Tooltip\`, \`HoverCard\`, \`Popover\`, \`DropdownMenu\`, \`ContextMenu\`, \`CommandPalette\` and \`Lightbox\` all render through one shared positioning engine:

- **Never clipped.** They render in the browser's top layer, so no \`overflow: hidden\` and no transformed ancestor can cut them off. You do not need to hoist them out of a Card or use \`Portal\`.
- **Shared placement vocabulary.** \`side: "top"|"bottom"|"left"|"right"\` × \`align: "start"|"center"|"end"\` gives 12 placements, and they flip automatically when there is not enough room.
- **Shared dismissal contract.** Escape, an outside click, and the × control all close them; focus moves in on open and is restored on close.
- **Controlled or uncontrolled.** Bind \`open\` to a \`$variable\` and handle \`onOpenChange\` to drive one yourself. A \`Modal\` given a literal \`open: true\` MUST also get \`onRequestClose\`, or the user cannot dismiss it.
- **Stacking** is token-driven — \`sx: { zIndex: "dropdown" | "sticky" | "modal" | "toast" }\` — so a custom overlay layers correctly against the built-ins.`;
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
2. **Argument forms** (per call, pick ONE): the canonical form is one bare positional — the prop tagged \`(positional)\` in the signature — plus a trailing \`{ }\` object for every other prop. Also supported: ALL-positional (arguments bind to the signature's props in listed order, so only use it for adjacent leading props), and ALL-named (a single \`{ }\` object naming every prop). Never split one object between roles.

\`\`\`
Button("Save", { variant: "primary", loading: $isSaving })   // canonical: positional + trailing object
StatCard("Revenue", { value: "$48k", trend: "up", delta: "+12%" })
StatCard("Revenue", "$48k", "up")                            // all-positional, signature order
Button({ label: "Save", variant: "primary" })                // all-named single object
Row([Card1(), Card2()], { gap: "md" })
\`\`\`

Mind the signature order with all-positional calls: \`Button("Save", "primary")\` puts \`"primary"\` in the second slot (\`onClick\`), NOT \`variant\` — prefer the trailing object for non-adjacent props. A lone object argument to a component whose positional prop is itself object-typed is that prop's payload, not named props. Any call also accepts \`{ key: ... }\` to pin per-instance state across reorders.

### Reserved top-level names
Never declare or shadow any of these.
- \`$app(...)\` — registers the UI root (REQUIRED, and exactly ONE per program).
- \`$theme({...})\` — optional brand override (written as a bare statement, before \`$app\`).
- \`route\` — the reactive router handle (\`route.path\`, \`route.params\`, \`route.query\`, \`route.pattern\`, \`route.navigate("/x")\`).
- \`$util\`, \`$storage\`, \`$console\`, \`$toast\`, \`$dom\` — the five runtime namespaces.
- \`params\` — the captured path segments, in scope inside a \`$router\` arm.
- \`outlet\` — the matched child, in scope inside a nested route's \`layout\`.
- \`slots\` — the named-props bag, in scope inside a component body.
- \`cleanup(fn)\` — registers an effect teardown, in scope inside \`$effect\`.`;
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

Use a store for shared state; use a component's local \`$state\` / \`$name\` for state one component owns.

Add \`persist: "key"\` to mirror the store's data to \`localStorage\` (or \`persistIn: "session"\` for \`sessionStorage\`): declared fields hydrate from the saved snapshot on first render and every change writes back. \`persist\` / \`persistIn\` are config, not state fields.

\`\`\`
prefs = $store({
  persist: "user-prefs",          // restored on reload, saved on every change
  theme: "system",
  setTheme: (s, t) => { s.theme = t },
})
\`\`\`

Add \`history: true\` (or \`history: 50\` for a depth cap) for **undo/redo**: the store gains \`store.undo()\` / \`store.redo()\` / \`store.clearHistory()\` methods and reactive \`store.canUndo\` / \`store.canRedo\` flags (wire them to button \`disabled\`). Each user mutation records a snapshot; a fresh edit after undo clears the redo branch.

\`\`\`
doc = $store({
  history: true,
  title: "", body: "",
  setTitle: (s, t) => { s.title = t },
})
undoBtn = Button("Undo", { onClick: () => doc.undo(), disabled: !doc.canUndo })
\`\`\``;
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
- **Named slots** (XIII.1): once positional args fill the params, extra named props become both a \`slots\` object and direct bindings — \`function Panel(children) { return Column([slots.header, children, footer]) }\` called as \`Panel(body, { header: H, footer: F })\`.
- **Component-local helpers** (XIII.4): a \`function Row() {…}\` declared inside another component's body is scoped to it (callable by siblings, not leaked globally).

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
From any action / effect / lambda, \`$emit\` dispatches a \`CustomEvent\` on the host \`<aktion-app>\` (listen with \`el.addEventListener\`). Reserved names: \`assistant-message\`, \`error\`, \`route-change\`.

### Reactive environment globals (under \`$util\`)
Read-only reactive namespaces the UI branches on without manual listeners (listeners attach lazily on first read, re-render on change). They live under \`$util\` so the top-level \`$\`-name space stays free for your own atoms:
- \`$util.viewport.width\` / \`.height\`
- \`$util.breakpoint.active\` (\`base|sm|md|lg|xl\`) + \`.sm\` / \`.md\` / \`.lg\` / \`.xl\` booleans
- \`$util.scroll.y\` / \`.x\` / \`.progress\` (0–1) / \`.direction\` (\`up|down\`)
- \`$util.media.prefersDark\` / \`.prefersReducedMotion\` / \`.online\` / \`.pointer\` (\`coarse|fine\`) / \`.portrait\`
- \`$util.mouse.x\` / \`.y\`
- \`$util.url.path\` / \`.params\` (route params) / \`.query\` (parsed object) / \`.hash\` + \`.navigate(to)\` / \`.setQuery(name, value)\` / \`.setQuery({…})\` / \`.removeQuery(name)\` — a reactive snapshot of the current URL plus query-param writers (IV.6).

\`\`\`
Show($util.breakpoint.md, { children: Sidebar(), fallback: Drawer() })
NavBar({ blur: $util.scroll.y > 12 })
\`\`\`

### \`$util.onError(fn)\`
Register a program-level error sink: \`fn({ error, source })\` fires when a user action body throws (before the default logging) — report to a telemetry sink or surface a toast so a bad row never blanks the page.

### \`$util.onNavigate(fn)\`
Register a navigation guard: \`fn({ to, from })\` runs before every route change (in-app \`navigate(...)\` and browser back/forward). Return \`false\` to block, a path string to redirect, or nothing to allow. \`$util.onNavigate(null)\` clears it.

### \`$util.onRequest(fn)\` / \`$util.onResponse(fn)\`
Cross-cutting HTTP interceptors for every \`$http\` / \`$query\` / \`$mutation\` request (VI.5). \`$util.onRequest(req => ({ headers: { Authorization: "Bearer " + $token } }))\` returns a partial that is merged over the request (headers shallow-merged) — ideal for auth tokens. \`$util.onResponse(async (res, retry) => …)\` can inspect/replace the response or \`await retry()\` to re-issue once (e.g. after refreshing a token on a 401). They reset on each new program.`;
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
- \`$query({ url, key?, ttl?, refetchInterval?, refetchOnFocus?, refetchOnReconnect? })\` — a **cached, deduplicated** read. Identical queries (same \`key\`, or same method+url+query+body) share one in-flight request and one cached bag, so calling it from several components fetches once. Pass \`ttl\` (ms) to auto-refetch stale data, \`refetchInterval\` (ms) to poll a live dashboard, and \`refetchOnFocus\` / \`refetchOnReconnect\` to refresh on tab focus / network reconnect. Same bag as \`$http\` (\`.data\`/\`.loading\`/\`.error\`/\`.refetch()\`).
- \`$mutation({ url, method? })\` — a **deferred** write that fires only when you call \`.mutate(overrides?)\`, not on render (method defaults to \`POST\`). Assign it to an atom, then trigger it from a handler:
\`\`\`
$save = $mutation({ url: "https://api.example.com/orders" })
$save.onDone = () => $orders.refetch()
...
Button("Save", { onClick: () => $save.mutate({ body: { item: $item } }) })
\`\`\`
\`.mutate()\` resolves with the response body; the bag exposes \`.loading\`/\`.error\`/\`.data\` plus \`.reset()\`.

**Optimistic + invalidation (VI.2):** \`$mutation({ url, optimistic: () => { … }, invalidates: ["key"] })\` — \`optimistic\` runs synchronously before the request so the UI updates instantly (auto-rolled-back if it fails); \`invalidates\` refetches every cached \`$query\` whose key contains a listed substring once the write succeeds. \`$util.invalidate("key")\` does the same on demand.

**Infinite / paginated reads (VI.1):** \`$feed = $query({ url, infinite: { param?: "page", start?: 1, limit?: 20, mode?: "page"|"offset", select?: body => body.items } })\` — \`.data\` is the flattened item list across loaded pages; call \`.loadMore()\` (often from \`OnIntersect\`) while \`.hasMore\` is true; \`.loadingMore\` flags the in-flight next page.

**GraphQL (VI.6):** add \`gql\` (+ optional \`variables\`) to any \`$http\`/\`$query\`/\`$mutation\`: it POSTs \`{ query, variables }\` and \`.data\` is the unwrapped GraphQL \`data\` (a GraphQL \`errors\` array surfaces through \`.error\`).

\`\`\`
$repos = $query({ url: "/graphql", gql: "query($n:Int){ repos(first:$n){ name } }", variables: { n: 10 } })
\`\`\`

### Realtime — \`$socket({...})\` and \`$sse({...})\` (VI.3)
- \`$socket({ url, protocols?, bufferSize?, onMessage?, reconnect? })\` — a reactive WebSocket. Read \`.status\` (\`"connecting"|"open"|"closed"\`), \`.connected\`, \`.last\`, \`.messages\` (re-render on change); \`.send(data)\` (objects auto-JSON; messages sent while connecting queue and flush on open); \`.close()\` (stops for good). \`reconnect: true\` (or a max-attempt number) retries dropped connections with exponential backoff — \`.attempts\` counts the current streak.
- \`$sse({ url, event?, withCredentials?, bufferSize? })\` — a reactive Server-Sent Events stream with the same \`.status\`/\`.connected\`/\`.last\`/\`.messages\`/\`.close()\` surface (EventSource reconnects natively). Both tear down automatically on the next program.
\`\`\`
$chat = $socket({ url: "wss://example.com/room/42" })
send = () => { $chat.send({ text: $draft }); $draft = "" }
feed = Column(map($chat.messages, m => Bubble(m.text)))
\`\`\``;
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
nav = Sidebar([SidebarSection("Main", [SidebarItem("Dashboard", { to: "/", icon: "gauge" }), SidebarItem("Orders", { to: "/orders", icon: "receipt", badge: "12" })])], { brand: "Acme", tagline: "Ops console" })
$app(AppShell(nav, pages))             // app/dashboard shell — Sidebar is a real component, build it
\`\`\`

- **Pick the shell for the surface.** \`AppShell(Sidebar(...), pages)\` for an app/dashboard (left sidebar + optional topbar); a top \`Navbar(...)\` above the pages inside a \`Column\` for a website / marketing / docs layout (no sidebar) — never wrap a website in \`AppShell\`. The router result is just a node, so it drops into either.
- Patterns: literal, \`:param\` (read \`params.id\`), trailing \`*\` (read \`params._\`), and \`default:\` for the catch-all (unknown paths render \`null\` without it).
- The read-only \`route\` handle: \`route.path\`, \`route.params.x\`, \`route.query.tab\`; navigate with \`route.navigate("/path")\` from an action/effect. \`$util.url\` mirrors this (\`$util.url.path\` / \`.params\` / \`.query\` / \`.hash\`).
- **Query-param ↔ state** (IV.6): write the URL query without leaving the page — \`$util.url.setQuery("tab", "billing")\`, \`$util.url.setQuery({ sort: "name", page: 2 })\` (a \`null\`/\`""\` value drops the key), or \`$util.url.removeQuery("tab")\`. Read it back reactively via \`$util.url.query.tab\` (or \`route.query.tab\`), so a tab/sort/filter survives reload and is shareable.
- **Navigation guards** (IV.2): \`$util.onNavigate(fn)\` registers a guard. \`fn({ to, from })\` returns \`false\` to block, a path string to redirect, or nothing to allow — covers in-app \`navigate(...)\` and browser back/forward. Call \`$util.onNavigate(null)\` to clear.
- **Scroll restoration** (IV.5): set \`scroll-restoration="auto"\` on \`<aktion-app>\` to restore scroll on back/forward and jump to top on a fresh navigation (\`"top"\` always jumps to top).
- **Nested / layout routes** (IV.1): an arm whose value is \`{ layout, routes }\` matches as a path PREFIX and slots the matched child into the \`outlet\` identifier — so a shell (sidebar/topbar) stays mounted while only the inner page swaps. Child route keys are matched against the remaining path; \`params\` merges parent + child captures.
\`\`\`
pages = $router({
  "/app": {
    layout: AppShell(nav, outlet),               // \`outlet\` = the matched child; \`nav\` from above
    routes: {
      "/":            Dashboard(),
      "/orders/:id":  OrderDetail({ id: params.id }),
      default:        AppHome()
    }
  },
  default: Landing()
})
\`\`\`
- \`NavLink(label, { to, exact?, icon? })\` and \`SidebarItem(label, { to, icon?, badge? })\` derive active state from \`route.path\`. Never declare \`route\` yourself.

\`\`\`
$util.onNavigate(({ to }) => $isLoggedIn || to === "/login" ? true : "/login")   // auth gate
function selectTab(name) { $util.url.setQuery("tab", name) }                       // shareable tab
activeTab = $util.url.query.tab ?? "overview"
\`\`\``;
}

function fullGlobals(): string {
  return `## Runtime namespaces — \`$util\`, \`$storage\`, \`$console\`, \`$toast\`, \`$dom\`

Five reserved namespaces, always in scope, no imports. **All five carry the \`$\` sigil.** The sigil is REQUIRED for \`$util\`, \`$toast\` and \`$dom\` — bare \`util.format(...)\` / \`toast.success(...)\` / \`dom.measure(...)\` resolve to nothing and fail silently. \`$storage\` and \`$console\` additionally accept the bare spelling for backwards compatibility, but use the sigil everywhere for consistency. These names are reserved: you cannot shadow them.

\`$storage.set/get/remove/clear\` target localStorage; the same four methods also exist on \`$storage.local\`, \`$storage.session\` and \`$storage.cookies\`.

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
Instead of hand-managing a \`$toasts = [...]\` array, use the reserved \`$toast\` namespace. \`$toast.show(message, { tone?, title?, duration? })\` shows a toast (auto-dismisses after \`duration\` ms, default 4000; pass \`0\` to keep it). Shortcuts: \`$toast.success/.error/.info/.warning\`. Remove with \`$toast.dismiss(id)\` / \`$toast.clear()\`. **Toasts render themselves** (stacked top-right) — just call \`$toast.*\`; you do NOT add a \`Toasts(...)\` to \`$app\`:

\`\`\`
function save() { $save = $http({ url, method: "POST", body }); $save.onDone = () => $toast.success("Saved") }
$app(Button("Save", { onClick: save }))   // the "Saved" toast appears on its own
\`\`\`

Only if you want custom placement, render the reactive \`$toast.items\` list yourself — the auto-layer steps aside when you do: \`Toasts($toast.items.map(t => Toast({ title: t.title, message: t.message, tone: t.tone, onClose: () => $toast.dismiss(t.id) })))\`.`;
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

function fullInteropAndHead(): string {
  return `## Third-party widgets & document head

### Imperative / third-party widget interop
For a library that owns its own DOM (chart, map, editor, payment element, captcha) — NOT for normal markup (use components). The host carries \`data-rui-preserve\`, so the reconciler never touches the widget's DOM.
- \`Mount({ setup, update?, cleanup?, props?, tag?, sx? })\` — managed imperative host. \`setup(node, props)\` runs once after attach and **returns the instance handle**; \`update(instance, props)\` runs when the (shallow-compared) \`props\` bag changes; \`cleanup(instance)\` runs on unmount. \`props\` is the reactive boundary; \`tag\` sets the host (default \`"div"\`).
- \`WebComponent(tag, { attributes?, properties?, on?, children? })\` — render + hydrate a native custom element (tag must contain a hyphen). \`attributes\` is reactive, \`properties\` assigns rich JS props, \`on\` binds listeners that stay current.
- \`$script({ src, global?, type?, as?, attributes? })\` — load an external script/stylesheet once (de-duplicated per \`src\`) → reactive \`{ ready, loading, error, value }\`. Gate a widget on \`.ready\`; \`value\` = \`window[global]\`. Stays un-ready under SSR.
- \`$dom\` — managed observers, auto-disposed on replan: \`$dom.onResize(node, cb)\`, \`$dom.onIntersect(node, cb, opts?)\`, \`$dom.onMutation(node, cb, opts?)\`, and one-shot \`$dom.measure(node)\` → \`{ rect, scroll, viewport }\`. Pair with an \`OnMount\` / \`Mount\` node ref.

\`\`\`
$chartjs = $script({ src: "https://cdn.jsdelivr.net/npm/chart.js", global: "Chart" })
function SalesChart() {
  if (!$chartjs.ready) return Skeleton({ sx: { h: "320px" } })
  return Mount({
    sx: { h: "320px" },
    setup: (node, p) => new $chartjs.value(node, { type: "bar", data: { datasets: [{ data: p.series }] } }),
    update: (chart, p) => { chart.data.datasets[0].data = p.series; chart.update() },
    cleanup: (chart) => chart.destroy(),
    props: { series: $series }
  })
}
\`\`\`

### Document head — \`$head({...})\`
Reactive head manager: call it from a page component body. Sets the title, meta, canonical/alternate links, Open Graph + Twitter cards, JSON-LD, and \`<html>\` attrs. Reads \`$state\`, so it re-applies on change; per-route calls compose (later wins). \`renderToString\` returns the resolved \`head\` + \`headAttrs\` for crawlable SSR.

\`\`\`
function ProductPage() {
  $head({
    title: \`\${$product.name} — Acme\`,
    meta:  { description: $product.summary },
    og:    { title: $product.name, image: $product.image, type: "product" },
    link:  [{ rel: "canonical", href: $canonicalUrl }],
    jsonLd: { "@type": "Product", name: $product.name }
  })
  return Column([ /* … */ ])
}
\`\`\``;
}

function fullThemingI18nIcons(): string {
  return `## Theming, i18n & icons

### \`$theme({ ... })\`
A bare \`$theme({...})\` statement (before \`$app\`) brands the response. Omit it entirely to inherit the host theme.

**Shape rules.** Only the structured form is accepted: every top-level key must be one of the ten token groups below, or a metadata key (\`name\`, \`direction\`). Flat keys like \`$theme({ colorPrimary: … })\` raise a schema error — the flat shape was removed in 0.5. Unknown keys INSIDE a group are silently ignored, so typos there fail quietly: check names before you ship.

| Group | Value type | Notes |
| --- | --- | --- |
| \`colors\` | CSS colour string | \`{ primary, primaryHover, accent, bg, surface, text, textMuted, border, success, warning, danger, info, … }\` |
| \`radius\` | CSS length string | \`{ xs, sm, md, lg, pill, button, input }\` |
| \`spacing\` | CSS length string | \`{ xs, s, m, l, xl }\` |
| \`shadows\` | CSS box-shadow string | \`{ sm, md, lg }\` |
| \`font\` | CSS string | \`{ family, familyHeading, familyMono, sizeBase, weightHeading, … }\` |
| \`fonts\` | \`{ import: string[] }\` | Google-Fonts shorthand: \`fonts: { import: ["Inter:400,700", "JetBrains Mono"] }\` |
| \`gradients\` | string **or** string[] of stops | \`gradients: { brand: ["#6366f1", "#ec4899"] }\`; use as \`gradient.brand\` in \`sx\` / \`GradientText\` |
| \`zIndex\` | **number** | Layer tokens \`{ dropdown, sticky, modal, toast }\` — these feed \`sx.zIndex\` |
| \`motion\` | CSS duration / easing string | \`{ fast, base, slow, ease }\` → \`--rui-motion-*\` |
| \`icons\` | inline SVG markup string | \`icons: { logo: "<path …/>" }\`, then usable anywhere a Font Awesome name is: \`Icon("logo")\` |

Note that \`zIndex\` values are numbers and \`gradients\` accepts an array — do not quote them.

Core group keys (all optional):
- \`name?: string\` — selects a built-in theme as the base palette (\`"dark"\`, \`"light"\`, \`"modern"\`, \`"corporate"\`, \`"soft"\`, \`"glass"\`; unknown names are ignored).
- \`direction?: "ltr" | "rtl"\` — reading direction (metadata; not applied as a token).
- \`colors?: { ... }\` — CSS color strings. Keys: \`bg\`, \`bgSubtle\`, \`surface\`, \`surfaceMuted\`, \`border\`, \`borderSubtle\`, \`text\`, \`textMuted\`, \`primary\`, \`primaryHover\`, \`primaryText\`, \`accent\`, \`accentHover\`, \`accentText\`, \`focusRing\`, \`success\`, \`warning\`, \`danger\`, \`info\`.
- \`radius?: { ... }\` — CSS length strings. Keys: \`xs\`, \`sm\`, \`md\`, \`lg\`, \`pill\`, \`button\`, \`input\`.
- \`font?: { ... }\` — CSS strings. Keys: \`family\`, \`familyHeading\`, \`familyMono\`, \`sizeBase\`, \`sizeSm\`, \`sizeLg\`, \`sizeHeading\`, \`sizeTitle\`, \`weightBody\`, \`weightHeading\`.

\`\`\`
$theme({
  colors: { primary: "#635bff", primaryHover: "#4f46e5", accent: "#1f6feb", bg: "#0a0a23", surface: "#10103a", text: "#fff", textMuted: "#a5b4fc", focusRing: "#635bff" },
  radius: { md: "0.5rem", button: "999px", input: "8px" },
  font:   { family: "Inter, sans-serif", familyHeading: "Inter, sans-serif", weightHeading: "600" }
})
\`\`\`

The host picks one of six base themes (\`light\`, \`dark\`, \`corporate\`, \`soft\`, \`glass\`, \`modern\`) — author theme-neutral UI (use \`tone:\` / \`variant:\`, not hard-coded colours).

### i18n
\`\`\`
const { t, setCurrentLanguage } = $i18n({
  defaultLanguage: "en", currentLanguage: $lang,
  translations: { greeting: { en: "Hello, {name}!", fr: "Bonjour, {name}!" } }
})
welcome = Text(t("greeting", { name: $user.name }))
\`\`\`
\`t(key, vars?)\` resolves \`translations[key][currentLanguage]\`, falling back to the default language then the bare key; \`{name}\` placeholders interpolate. Drive \`currentLanguage\` from a reactive atom for live switching. ICU plural and select forms are supported: \`{ n, plural, =0{No items} one{1 item} other{# items} }\`.

### RTL / bidirectional text
Set \`dir="rtl"\` / \`"ltr"\` / \`"auto"\` on the host \`<aktion-app>\` element (not in code). The runtime reflects it onto the render root so the whole tree — text direction, flex order, logical spacing — flips automatically. Programs do not need any code change; use logical CSS properties (no hard-coded \`left\`/\`right\`) in raw CSS.

### Accessibility primitives
- \`VisuallyHidden(child)\` — hides content visually, keeps it in the a11y tree.
- \`SkipLink({ to: "#main", label: "Skip to content" })\` — first tab stop for keyboard users.
- \`LiveRegion($status, { politeness: "polite" })\` — announces dynamic changes (\`"polite"\` queues; \`"assertive"\` interrupts). The first argument is a plain string, not a component.
- \`FocusTrap(child, { active: $isOpen })\` — Tab cycles within the subtree; required for dialogs.
- Pass \`aria: { label, labelledBy, describedBy, ... }\` to any component via the universal props channel.

### Icons
Icon props take a Font Awesome name (no \`fa-\` prefix, never an emoji): \`"house"\`, \`"chart-line"\`, \`"regular:star"\`, \`"brands:github"\`. \`Icon(name, { variant?, size? })\` renders a standalone glyph.`;
}

function fullUniversalProps(): string {
  return `## Universal style props (\`sx\` / \`animate\`) — every component

EVERY component accepts a universal style/behaviour channel as named props, in addition to its own props. These are **bounded** (tokens & enums, never raw CSS) so they stay theme-safe — prefer them over the \`Css\`/\`Styles\`/\`HTMLTag\` escape hatches.

- **\`sx: { … }\`** — token-aware inline styling. Keys (all optional):
  - Spacing (\`none|3xs|2xs|xs|sm|md|lg|xl|2xl|3xl|auto\` (\`none\` = 0), the \`safe\`/\`safe-top\`/\`safe-right\`/\`safe-bottom\`/\`safe-left\` notch insets, or a CSS length): \`p px py pt pr pb pl\`, \`m mx my mt mr mb ml\`, \`gap\`. \`px\`/\`mx\` are logical (\`padding-inline\`) and \`ps pe ms me\` set the inline start/end sides, so RTL apps mirror automatically.
  - Sizing (\`full|half|screen|dvh|min|max|fit|auto\` or length): \`w h minW maxW minH maxH\`.
  - Color (token \`surface|surface-muted|bg|bg-subtle|text|text-muted|muted|primary|primary-hover|primary-text|accent|success|warning|danger|border|border-subtle\`, a gradient ref \`gradient.brand|accent|warm|cool|success|danger\`, or a raw color): \`bg color borderColor\`.
  - Surface: \`border: none|subtle|strong|<color>\`, \`radius: xs|sm|md|lg|pill|full\`, \`shadow: sm|md|lg|none\`, \`opacity\`, \`backdrop: "blur"\`, \`bgImage\` (http(s)/relative/data:image only) + \`bgOverlay\` (color or \`gradient.*\` wash over the image), \`bgSize: cover|contain\`.
  - Typography: \`fontSize: xs|sm|base|lg|xl|2xl|3xl|4xl\` (or a length), \`weight: 100…900|bold|normal\`, \`textDecoration: underline|line-through|none\`, \`textAlign\`.
  - Flex/grid: \`display direction align justify wrap grow shrink basis columns\`.
  - Position: \`position top right bottom left inset zIndex(base|dropdown|sticky|modal|toast|…)\`, \`overflow cursor\`. Layer tokens resolve through \`--rui-z-*\` so \`$theme({ zIndex: {...} })\` rebrands them.
  - Interaction: \`hover: { lift|grow|glow|bright|border|scale }\`, \`focus: { glow|border }\` (mapped to bounded utility classes). For arbitrary state CSS use \`states: { hover|focus|active|disabled|focus-visible|checked|group-hover: { bg, color, borderColor, shadow, radius, opacity, scale, translateX, translateY, rotate, cursor } }\` — compiled to scoped \`:state\` rules in the adopted stylesheet. Example: \`sx: { states: { hover: { scale: 1.04, shadow: "lg" }, focus: { borderColor: "primary" } } }\` (I.4).
  - Responsive: any value may be \`{ base, sm, md, lg, xl }\` (resolves to \`base\`).
- **\`animate: "fade-up"\`** (or \`{ preset, delay?, duration?, repeat? }\`) — entrance/loop motion. Presets: \`fade fade-up/down/left/right zoom slide-up/down/left/right pulse float shimmer bounce spin ping wiggle\`. Auto-respects \`prefers-reduced-motion\`.
- **\`id\` / \`anchor\`** — set the element id (smooth-scroll targets).
- **\`className\` / \`class\` / \`style\`** — extra classes (either spelling) / a sanitised inline style string.
- **\`aria: {…}\` / \`data: {…}\` / \`dataAttrs: {…}\` / \`role\` / \`tooltip\` / \`hidden\`** — accessibility & metadata passthrough. \`role\` overrides the component's own ARIA role. Use \`dataAttrs\` instead of \`data\` on the components that declare a \`data\` prop of their own (\`LineChart\`, \`JsonTree\`, \`Async\`, \`Draggable\`, \`Lottie\`, \`QRCode\`) — there, \`data:\` is the component's prop and the universal channel is otherwise unreachable.

\`\`\`
Card([Text("Lift on hover")], { sx: { p: "lg", radius: "lg", bg: "surface", shadow: "md", hover: { lift: true } } })
Badge("Live", { tone: "success", animate: "pulse" })
Display(["Build in ", GradientText("record time")], { size: "hero", align: "center", animate: "fade-up" })
\`\`\``;
}

function fullUtil(): string {
  return `## \`$util\` — runtime helper namespace

Pure helpers (no side effects), available in every expression, action, effect, and lambda. Reach for \`$util\` when plain JS would be verbose (formatting, dates, grouping); use plain JS when it's just as clear (\`arr.length\`, \`arr.slice(0, 5)\`).

- **Collections**: \`$util.sort(arr, field, dir?)\`, \`$util.groupBy(arr, field)\`, \`$util.unique(arr, field?)\`, \`$util.sum / .avg / .min / .max / .count\`, \`.first / .last\`, \`.filter(arr, field, op, value)\`, \`.find\`, \`.partition(arr, field, op, value)\`, \`.keyBy(arr, field)\`, \`.chunk(arr, size)\`, \`.flatten(arr, depth?)\`, \`.zip(...arrays)\`, \`.range(start, end, step?)\`.
- **Objects**: \`$util.pick(obj, keys)\`, \`.omit(obj, keys)\`, \`.merge(target, ...sources)\` (deep), \`.cloneDeep(value)\`.
- **Strings**: \`$util.capitalize / .titlecase / .uppercase / .lowercase\`, \`.plural(n, singular, plural)\`, \`.trim / .replace / .split / .match\`.
- **Formatting**: \`$util.format(value, mode, opts?)\` (number, currency, percent, compact) and \`$util.formatDate(value, mode)\` (\`"short" | "long" | "time" | "relative"\` or a token string).
- **Dates / math**: \`.now / .today / .addDays / .diffDays / .startOfWeek\`; \`.round / .floor / .ceil / .abs / .clamp(v, min, max) / .random\`.
- **Formatting / misc**: \`.slugify / .truncate(text, len) / .initials / .currency(v, code?) / .percent(v) / .bytes(v) / .relativeTime(date) / .copy(text)\` (async — resolves \`true\` once the clipboard write succeeds) \`/ .sleep(ms) / .uuid() / .debounceFn(fn, ms) / .throttleFn(fn, ms)\` (leading + trailing edge).
- **Device / platform**: \`.vibrate(pattern) / .share({ title, text, url }) / .readClipboard() / .geolocate() / .isOnline() / .deviceType()\` (XII.3); \`.worker(pureFn, ...args)\` runs a closure-free function off the main thread, resolving its result (XI.5); \`.registerServiceWorker(url) / .webManifest({ name, icons, … })\` for PWA setup (XII.2).
- **Reactive env getters**: \`$util.scroll\`, \`$util.viewport\`, \`$util.breakpoint\`, \`$util.media\`, \`$util.mouse\`, \`$util.url\` (listeners attach lazily on first read, re-render on change).

\`\`\`
sorted  = $util.sort($users.filter(u => u.team === $team), "joinedAt", "desc")
summary = \`\${rows.length} \${$util.plural(rows.length, "order", "orders")} · \${$util.format($util.sum(rows.amount), "currency")}\`
\`\`\`

## \`$util.style\`, \`$util.rules\` and \`$util.derived\` — styling, validation & computed helpers

- **\`$util.style\`** — bounded, sanitised CSS helpers (return safe strings for the \`sx.style\` / inline use): \`$util.style.cx("a", { active: cond })\` (classnames), \`$util.style.gradient(["#6366f1", "#ec4899"], 120)\`, \`$util.style.alpha("primary", 0.12)\` (color-mix), \`$util.style.clamp("16px", "2vw", "24px")\`, \`$util.style.token("spacing.l")\` → \`var(--rui-spacing-l)\`, \`$util.style.toStyle({ padding: "8px" })\`.
- **\`$util.rules\`** — composable validators that return \`(value) => message | null\`: \`$util.rules.required() / .email() / .url() / .min(n) / .max(n) / .minLength(n) / .maxLength(n) / .pattern(re) / .oneOf([...]) / .matches(other) / .custom(fn) / .asyncCustom(fn)\` (\`fn\` may return a Promise — server-side checks like username uniqueness; \`$form\` awaits it before submitting). Run them with \`$util.rules.validate(value, [..])\` (first error or null; a Promise when an async rule is hit) or \`$util.rules.validateAll(values, schema)\` (→ \`{ field: message }\`).
- **\`$util.derived(fn)\`** — a computed value: \`total = $util.derived(() => $util.sum($cart.map(i => i.price)))\` recomputes reactively from the atoms \`fn\` reads.

\`\`\`
$email = ""
error = $util.rules.validate($email, [$util.rules.required(), $util.rules.email()])
Input("email", { value: $email, error: error })
\`\`\`

### \`$form({...})\` — the form engine (managed forms)
For anything beyond one or two fields, reach for \`$form\` instead of wiring atoms by hand. \`$form({ values: {...initial}, rules: { field: [validators] }, onSubmit: (values) => {...} })\` returns a managed bag:
- \`form.values.x\` — two-way binds straight onto an input (\`Input("email", { value: form.values.email })\`).
- \`form.errors.x\` / \`form.touched.x\` / \`form.dirty\` / \`form.valid\` / \`form.submitting\` / \`form.validating\` — reactive reads (\`dirty\` flips on the first edit and clears on \`reset()\`; \`validating\` is true while async rules are in flight).
- \`form.field("email")\` — returns \`{ value, error, name, onChange, onBlur }\` to spread for a controlled, validated field.
- \`form.validate()\` (all) / \`form.validateField(name)\` / \`form.touch(name)\` / \`form.setField(name, v)\` / \`form.setValues({...})\` / \`form.reset()\`.
- \`form.submit()\` (alias \`form.handleSubmit()\`) — marks fields touched, validates (awaiting async rules), then calls \`onSubmit(values)\` only when valid. \`form.submitting\` stays true until an async \`onSubmit\` settles.

\`\`\`
form = $form({
  values: { email: "", age: "" },
  rules: { email: [$util.rules.required(), $util.rules.email()], age: [$util.rules.min(18)] },
  onSubmit: (v) => { $saved = $mutation({ url: "/signup", body: v }); $saved.mutate() }
})
$app(Column([
  Input("email", { value: form.values.email, error: form.errors.email, onBlur: () => form.touch("email") }),
  Button("Submit", { onClick: () => form.handleSubmit(), disabled: form.submitting })
]))
\`\`\``;
}

/**
 * NOTE ON DELIBERATE DUPLICATION.
 *
 * This section, `fullEmitAndWrappers`, `fullEscapeHatches`, `fullInteropAndHead`
 * and the a11y bullets in `fullThemingI18nIcons` hand-write signatures for ~27
 * components that the generated dump also covers in full. That duplication is
 * kept ON PURPOSE: each of these sections carries *guidance* the spec cannot
 * express — when to reach for `OnClick` instead of `Button`, that the escape
 * hatches are a last resort, that `Mount` is for libraries owning their own DOM —
 * and it sits where the model reads it, ~150k characters before the dump.
 *
 * The real hazard was that a hand-written signature could drift from the spec, as
 * `VirtualList({ key, render })` once did. That is now closed by
 * `tests/prompt-signature-integrity.test.ts`, which checks bullet-list signatures
 * as well as table rows — 137 signatures rather than the 15 it used to cover.
 *
 * If you find yourself adding MORE prose signatures here, prefer putting the
 * guidance in `componentGroups[].notes` (src/library/index.ts) instead: the group
 * loop emits those automatically, so they reach this prompt AND the agent skill
 * from one source.
 */
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
| \`VirtualList(items, { itemHeight?, renderItem? })\` | Virtualised 1-D list — preferred for >100 rows. |
| \`VirtualGrid(items, { columns?, itemHeight?, gap?, height? })\` | Virtualised 2-D grid — only visible rows mount; essential for tables/grids >100 rows. |
| \`VisuallyHidden(child)\` | Hides content visually but keeps it in the accessibility tree (extra context for screen readers). |
| \`SkipLink({ to, label })\` | "Skip to main content" link that appears on focus — the first tab stop for keyboard users. |
| \`LiveRegion(text, { politeness?, visible? })\` | \`aria-live\` region (\`politeness: "polite"\` default or \`"assertive"\`). Announces dynamic changes to screen readers. Takes a plain STRING, not a node. |
| \`FocusTrap(child, { active })\` | Cycles Tab within its subtree and autofocuses the first control — required for accessible dialogs. |
| \`Fragment(children)\` | Groups siblings without a layout box (\`display:contents\`) so a component can return several nodes into a parent Grid/Stack. |
| \`Transition(child, { show, preset, duration? })\` | Enter/exit transition — keeps child mounted through exit animation; reduced-motion safe. |
| \`FlipList(children, { duration? })\` | FLIP reorder animation — keyed children physically move to their new positions. |`;
}

function fullComponentLibrary(library: ComponentLibrary): string {
  const groups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const lines: string[] = [];
  lines.push("## Component library");
  lines.push("Use ONLY these components. A PascalCase call that does not appear verbatim below renders NOTHING, silently — if you are unsure, pick the nearest listed name rather than inventing one.");
  lines.push("");
  lines.push("Each signature lists props in declaration order; optional props end with `?`. The prop tagged `(positional)` is the canonical positional slot. Canonical call: pass it bare and put every other prop in a trailing `{ prop: value }` object. Also valid: all-positional in the listed order (the first positional fills the `(positional)` slot, the rest fill the remaining slots top-to-bottom), or a single `{ prop: value }` object naming every prop. `(positional, object payload)` means the positional prop is itself object-typed, so a lone object argument is that prop's value — not a named-props bag.");
  lines.push("Props marked `[also: …]` accept those spellings as synonyms for the same slot (`tone`/`variant`/`status`, `children`/`child`, `onClick`/`action`); the signature shows the canonical name.");
  lines.push("");
  for (const group of groups) {
    lines.push(`### ${group.name}`);
    // Emit the library's own authoring notes BEFORE the signatures. These are the
    // pick-the-right-component decisions — "THREE primitives cover almost
    // everything: Column / Row / Grid", "use LineChart for trends, BarChart for
    // comparisons", "build columns using array pluck" — and they are exactly what
    // a model gets wrong. `defaultLibrary` authors 150 of them across the 17
    // groups; before this loop read `group.notes`, 144 never reached the prompt
    // at all and the remaining 6 survived only because they had been hand-copied
    // into prose sections elsewhere.
    for (const note of group.notes ?? []) {
      lines.push(note.startsWith("-") ? note : `- ${note}`);
    }
    if (group.notes?.length) lines.push("");
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
6. Tables are column-oriented (\`Table([Col("Label", arr)])\`, cells may be components via \`rows.map(r => Badge(r.status))\`); charts take numeric arrays (\`PieChart(rows.label, rows.value)\`); icons are Font Awesome names; the five runtime namespaces carry the \`$\` sigil (\`$util\`, \`$storage\`, \`$console\`, \`$toast\`, \`$dom\`); \`route\` is reserved.`;
}

/**
 * Worked examples.
 *
 * Hand-authored rather than seeded from `getSnippets()` on purpose: snippet
 * templates carry `${1:placeholder}` editor markers, which would teach a model
 * syntax that is not Aktion. Every program below is validated against the real
 * component library by `tests/prompt-examples-validate.test.ts`, so an example
 * can never drift into demonstrating a prop that no longer exists — which is
 * exactly how the prompt came to ship a call to a non-existent `MainSidebar`.
 *
 * The set covers the constructs that previously had NO example at all: an app
 * shell with nested routing, a marketing page (Navbar, not AppShell), a managed
 * form with a deferred write, and a persisted store with undo/redo plus polling.
 */
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
], { gap: "md" })])

$app(Column([
  PageHeader("Tasks", { subtitle: \`\${$tasks.data.length} items\`, actions: [Button("Refresh", { onClick: $tasks.refetch, variant: "ghost" })] }),
  Async($tasks, {
    loading: LoadingState("Loading tasks…"),
    error:   ErrorState("Couldn't fetch tasks"),
    empty:   EmptyState("No tasks yet"),
    data:    Column($tasks.data.map(t => row(t)), { gap: "sm" })
  })
], { gap: "lg" }))`,
    `// App shell + nested routing — the canonical product-surface shape
nav = Sidebar([
  SidebarSection("Workspace", [
    SidebarItem("Dashboard", { to: "/", icon: "gauge", active: true }),
    SidebarItem("Orders", { to: "/orders", icon: "receipt", badge: "12" }),
  ]),
  SidebarSection("Admin", [SidebarItem("Team", { to: "/team", icon: "users" })]),
], { brand: "Acme", tagline: "Ops console" })

function Dashboard() {
  return Column([
    PageHeader("Dashboard", { subtitle: "Everything at a glance" }),
    Stats([
      StatCard("Open", { value: "12", trend: "up", delta: "+3" }),
      StatCard("Shipped", { value: "340", trend: "up", delta: "+18" }),
      StatCard("Refunds", { value: "4", tone: "warning" }),
    ], { layout: "grid" }),
    Card([SectionHeader("Recent activity"), Timeline([
      TimelineItem("Order #1204 shipped", { time: "2h ago", icon: "truck", tone: "success" }),
      TimelineItem("Refund issued", { time: "5h ago", icon: "rotate-left", tone: "warning" }),
    ])]),
  ], { gap: "lg" })
}

function Orders() {
  return Column([
    PageHeader("Orders", { breadcrumbs: ["Home", "Orders"] }),
    Card([
      Toolbar({ searchable: true, searchPlaceholder: "Search orders…" }),
      Table([Col("Order", ["#1204", "#1203"]), Col("Status", ["Shipped", "Paid"])], { density: "compact" }),
    ]),
  ], { gap: "lg" })
}

function OrderDetail(id) {
  return Column([
    PageHeader(\`Order \${id}\`, { breadcrumbs: ["Home", "Orders", id] }),
    Card([SectionHeader("Summary"), DescriptionList([
      DescriptionItem("Status", Pill("Shipped", { tone: "success" })),
      DescriptionItem("Total", "$248.00"),
    ])]),
  ], { gap: "lg" })
}

pages = $router({
  "/": Dashboard(),
  "/orders": Orders(),
  "/orders/:id": OrderDetail(params.id),
  default: EmptyState("Page not found", { icon: "compass" }),
})

$app(AppShell(nav, [pages], { collapsible: true }))`,
    `// Marketing page — Navbar + stacked Sections, NEVER an AppShell
$app(Column([
  Navbar({
    brand: "Acme",
    items: [NavbarItem("Features"), NavbarItem("Pricing"), NavbarItem("Docs")],
    actions: [Button("Start free", { variant: "primary" })],
    sticky: true,
  }),
  Hero("Ship your interface in an afternoon", {
    eyebrow: "New in 2.0",
    subtitle: "One component, every framework.",
    primary: Button("Start free", { variant: "primary", icon: "rocket" }),
    secondary: Button("Read the docs", { variant: "secondary" }),
    highlights: ["No build step", "6 themes", "Zero dependencies"],
  }),
  Container(Column([
    Section([SectionHeader("Why teams switch", { eyebrow: "Features" }), FeatureGrid([
      FeatureItem("Fast", { description: "Streams as it renders.", icon: "bolt" }),
      FeatureItem("Safe", { description: "Unknown props are errors.", icon: "shield-check" }),
      FeatureItem("Themeable", { description: "86 tokens, six themes.", icon: "palette" }),
    ])]),
    Section([SectionHeader("Pricing", { eyebrow: "Plans" }), PricingTable([
      PricingCard("Solo", { price: "$0", period: "forever", features: ["1 project"], action: Button("Start", { variant: "secondary" }) }),
      PricingCard("Team", { price: "$29", period: "per month", features: ["Unlimited projects", "Priority support"], action: Button("Choose Team", { variant: "primary" }), featured: true }),
    ])]),
  ], { gap: "2xl" }), { size: "lg" }),
  Banner("Ready when you are", { message: "Scaffold in one command.", tone: "primary", action: Button("npm create aktion", { variant: "primary", icon: "terminal" }) }),
  Footer("Acme", { tagline: "Interfaces, faster.", columns: [FooterColumn("Product", { links: [Link("Features"), Link("Pricing")] })] }),
], { gap: "none" }))`,
    `// Managed form + deferred write — $form({...}) validates, $mutation({...}) persists
$saved = null

function onSubmit(values) {
  $create.mutate({ body: values })
}

$create = $mutation({ url: "https://api.example.com/customers", method: "POST" })
$create.onDone = () => { $saved = "Customer created"; signup.reset() }

signup = $form({
  values: { name: "", email: "", plan: "team" },
  rules: {
    name: [$util.rules.required()],
    email: [$util.rules.required(), $util.rules.email()],
  },
  onSubmit: onSubmit,
})

$app(Container(Column([
  PageHeader("New customer"),
  Show($saved, { children: Callout("Saved", { tone: "success", description: $saved, compact: true }) }),
  Card([
    SectionHeader("Details"),
    ValidationSummary(signup.errors),
    FormSection("About", [
      FormControl("Name", Input("name", { value: signup.values.name, error: signup.errors.name, onBlur: () => signup.touch("name") })),
      FormControl("Email", Input("email", { type: "email", value: signup.values.email, error: signup.errors.email })),
    ]),
    FormSection("Plan", [FormControl("Plan", SegmentedControl(["solo", "team", "enterprise"], { value: signup.values.plan }))]),
    Buttons([
      Button("Create", { variant: "primary", loading: $create.loading, disabled: signup.submitting, action: () => signup.handleSubmit() }),
      Button("Cancel", { variant: "ghost" }),
    ]),
  ]),
], { gap: "lg" }), { size: "sm" }))`,
    `// Persisted store with undo/redo + a polling effect
board = $store({
  persist: "board-state",
  history: true,
  columns: ["Todo", "Doing", "Done"],
  cards: [],
  add: (s, title) => { s.cards = [...s.cards, { title, column: "Todo" }] },
})

$draft = ""
$health = $http({ url: "https://api.example.com/health" })

$effect(() => { $health.refetch() }, ["every(15000)"])

function addCard() {
  if ($draft.length > 0) { board.add($draft); $draft = ""; $toast.success("Card added") }
}

$app(Column([
  PageHeader("Board", {
    status: StatusDot("Live", { tone: "success", pulse: true }),
    actions: [
      Button("Undo", { icon: "rotate-left", variant: "ghost", disabled: !board.canUndo, action: () => board.undo() }),
      Button("Redo", { icon: "rotate-right", variant: "ghost", disabled: !board.canRedo, action: () => board.redo() }),
    ],
  }),
  Card([
    SectionHeader("Add a card"),
    InputGroup(Input("draft", { value: $draft, placeholder: "What needs doing?" }), { action: Button("Add", { variant: "primary", action: addCard }) }),
  ]),
  KanbanBoard([
    KanbanColumn("Todo", { items: board.cards.map(c => KanbanCard(c.title)) }),
    KanbanColumn("Doing", { items: [], tone: "primary" }),
    KanbanColumn("Done", { items: [], tone: "success" }),
  ]),
], { gap: "lg" }))`,
  ];
}


/* -------------------------------------------------------------------------- */
/*  CHAT mode — read-only UI rendering                                        */
/* -------------------------------------------------------------------------- */

/**
 * Chat mode has exactly one job: turn the Markdown answer an assistant would
 * otherwise write into a rich, READ-ONLY reply. So the catalogue it teaches is
 * an explicit ALLOWLIST — one component per shape a good answer takes, plus the
 * shapes Markdown cannot express at all (charts, KPI tiles, timelines, diffs).
 *
 * A denylist was tried first and failed in the expensive direction: it left 135
 * components reachable and the catalogue alone ate 71k of the prompt's 77k
 * characters, most of it teaching landing-page furniture (`Hero`,
 * `PricingTable`, `LogoCloud`, `Testimonial`, `ProductCard`, …). Every one of
 * those is budget spent on something the model should not do, and a standing
 * invitation to answer a question with a marketing page.
 *
 * The cost of an allowlist is that a newly added display component is invisible
 * here until someone adds it. That is the right failure: chat replies want a
 * small, memorable vocabulary, not everything the library can render.
 *
 * Grouped by the job each one does, so the line stays easy to argue about.
 */
const CHAT_COMPONENTS: ReadonlySet<string> = new Set([
  // Structure — the containers a reply is built from.
  "Column", "Row", "Grid", "Stack", "Card", "CardHeader", "Separator",
  "Tabs", "TabItem", "Accordion", "AccordionItem",
  // Prose — the Markdown constructs, one for one.
  "Text", "Heading", "Markdown", "Quote", "Callout", "CodeBlock", "Terminal",
  "DiffViewer", "Badge", "Pill", "Icon", "Kbd", "Image", "Avatar",
  // Tabular and list data.
  "Table", "Col", "ComparisonTable", "List", "ListItem",
  "DescriptionList", "DescriptionItem", "Steps",
  // Figures Markdown cannot express.
  "Stats", "StatCard", "Progress",
  "BarChart", "LineChart", "PieChart", "RadarChart", "ScatterChart",
  "Histogram", "Heatmap", "Gauge", "Series",
  "Timeline", "TimelineItem",
  // Chat-native blocks, including the follow-up prompts the host renders.
  "SectionBlock", "ListBlock", "FollowUpBlock", "FollowUpItem",
  // The two states a reply legitimately reports.
  "EmptyState", "ErrorState",
]);

/** True when a component may appear in the chat-mode catalogue. */
function isChatComponent(_groupName: string, componentName: string): boolean {
  return CHAT_COMPONENTS.has(componentName);
}

function chatHeader(preamble: string | undefined): string {
  const lead = preamble?.trim() ||
    "You respond in Aktion — a declarative language that is a strict subset of JavaScript. The host renders your reply as a rich, read-only UI. Output ONLY Aktion: no markdown, prose, or JSON.";
  return `${lead}

Register the UI root with \`$app(...)\` on the first line (typically \`$app(Column([...]))\`). Answer the question exactly as you otherwise would — same substance, same length, same care — but emit that answer as components instead of Markdown prose.

This is read-only display mode. Do NOT emit state writes, actions, effects, HTTP, routing, form controls, or clickable buttons. The single exception is \`FollowUpBlock\`, which the host renders as suggested follow-up prompts.`;
}

/**
 * The highest-value section in this prompt. The model already knows how to
 * write a good Markdown answer; the only new skill is the substitution, so it
 * is taught as a substitution table rather than as prose about composition.
 * Placed directly after the header, before the catalogue it indexes into.
 */
function chatMarkdownMapping(): string {
  return `## Markdown → Aktion

Compose the answer you would have written, then emit each piece as its component. Never put Markdown syntax inside a string — \`Text("## Results")\` renders the literal hashes.

| You would have written | Emit instead |
| --- | --- |
| \`# Title\` / \`## Section\` | \`Heading("Title", { level: 2 })\`, or \`SectionBlock("Section", { children: [...] })\` for a titled block with body |
| A paragraph | \`Text("…")\` for a sentence or two; \`Markdown("…")\` when the prose itself carries **bold**, inline code, links, or nested lists |
| \`- bullet\` / \`1. step\` | \`ListBlock(["…", "…"])\` (\`ordered: true\` for numbers); \`List([ListItem(…)])\` when each row needs an icon, badge, or description |
| A numbered procedure | \`Steps([{ title, details }])\` — clearer than a numbered list for anything the reader follows in order |
| \`> quote\` | \`Quote("…", { cite: "…" })\` |
| A fenced code block | \`CodeBlock(source, { language: "ts", filename: "…" })\`; \`Terminal(lines)\` for shell sessions, \`DiffViewer(before, after)\` for before/after |
| A Markdown table | \`Table([Col("Header", values)])\` — column-oriented; \`ComparisonTable\` for a feature-by-option matrix |
| **Note:** / **Warning:** | \`Callout("Heads up", { tone: "warning", description: "…" })\` — the positional slot is the TITLE, not the body |
| \`key: value\` lines | \`DescriptionList([DescriptionItem("Key", "Value")])\` |
| A bolded figure inside a sentence | \`StatCard\` / \`Stats\` — lift the number out of the prose |
| \`---\` | \`Separator()\` |
| \`![alt](url)\` | \`Image(url, { alt: "…" })\` |
| Describing a trend, split, or ranking in words | A chart — \`LineChart\` over time, \`BarChart\` to rank, \`PieChart\` for a breakdown |
| Recounting dates or a history in words | \`Timeline([TimelineItem(…)])\` |
| "I couldn't find anything" | \`EmptyState\` |
| "That failed because…" | \`ErrorState\` |

Group related pieces in a \`Card\` with a \`CardHeader\`. Put long supporting detail behind \`Accordion\` and parallel alternatives behind \`Tabs\`, so a long answer stays scannable instead of becoming a wall.`;
}

function chatSyntax(): string {
  return `## Syntax (read-only subset)

A program is a flat list of \`name = expression\` statements in standard JavaScript. \`$app(...)\` registers the entry point (always first); every other binding hoists, so order is free — emit \`$app(...)\`, then containers, then leaf data last for a smooth streaming reveal.

- Strings, numbers, booleans, \`null\`, arrays, objects; template literals \`Found \${rows.length}\` over \`+\` concatenation.
- Operators \`+ - * / %\`, comparisons, \`&& || !\`, ternary \`cond ? a : b\`, nullish \`a ?? b\`, spread, member \`obj.field\`, optional chaining \`obj?.field\`.

### Component calls
- **Case doesn't matter** — \`Card\` and \`card\` are equivalent.
- **Always invoke with parentheses** — \`Column([Header(), Body()])\`, never \`Column([Header, Body])\`; write \`Separator()\` even with no args.
- **Canonical call: the prop tagged \`(positional)\` goes bare, everything else in a trailing object** — \`Callout("Heads up", { tone: "info", icon: "circle-info" })\`, \`Badge("Live", { tone: "success" })\`. The tagged prop is not always the first one listed: \`Callout\`'s is \`title\`, \`CodeBlock\`'s is \`codeString\`. All-positional (signature order) and all-named (single \`{ }\` object) calls also work.

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
    "This is the complete vocabulary for a chat reply — a name that does not appear here does not exist in this mode and renders nothing at all. Each signature lists props in declaration order; optional props end with `?`. Pass the positional prop bare, then all other props in a trailing `{ prop: value }` object.",
  ];
  for (const group of groups) {
    const filtered = group.components.filter((name) => isChatComponent(group.name, name));
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
totals = Callout(\`Tracking \${langs.length} languages · \${$util.sum(langs.users)}M users\`, { tone: "info", icon: "chart-line", compact: true })
follow = FollowUpBlock(["Sort by users", "Show as a chart"])

langs = [
  { name: "Python",     users: 15.7, year: 1991 },
  { name: "JavaScript", users: 14.2, year: 1995 },
  { name: "TypeScript", users: 8.5,  year: 2012 }
]`,
    `// An explanatory answer — the common case. Prose stays prose; only the
// parts that are genuinely a list, a warning or a snippet become components.
$app(Column([intro, steps, warn, snippet, follow], { gap: "md" }))
intro   = Markdown("A **debounce** delays a function until the calls stop arriving. It is the right tool for search-as-you-type, autosave, and resize handlers — anywhere the last call is the only one that matters.")
steps   = Steps([
  { title: "Start a timer", details: "Each call clears the pending timer and schedules a new one." },
  { title: "Wait for quiet", details: "Nothing runs while calls keep arriving." },
  { title: "Fire once",     details: "The timer survives the quiet period and the function runs." }
])
warn    = Callout("Not the same as throttle", { tone: "warning", description: "Debounce drops the intermediate calls. Use throttle when you need a steady sample rate instead." })
snippet = CodeBlock(code, { language: "js", filename: "debounce.js" })
follow  = FollowUpBlock(["Show the throttle version", "How do I cancel a pending call?"])

code = "const debounce = (fn, ms) => {\\n  let t\\n  return (...args) => {\\n    clearTimeout(t)\\n    t = setTimeout(() => fn(...args), ms)\\n  }\\n}"`,
    `// A short factual answer. Do not over-build: no Card, no header, no sections.
$app(Column([answer, follow], { gap: "sm" }))
answer = Text("Mount Everest is 8,849 m (29,032 ft) above sea level — remeasured jointly by Nepal and China in 2020.")
follow = FollowUpBlock(["How does that compare to K2?", "How long does the climb take?"])`,
  ];
}

function chatImportantRules(): string {
  return `## Important rules

- **The answer comes first, the layout second.** Say everything you would have said. A prettier reply that dropped half the explanation is a worse reply.
- **Match the component to the content** — see the Markdown → Aktion table above. \`Table\` for comparisons, a chart for trends, \`Callout\` for warnings and asides, \`Markdown\` for real paragraphs, \`Text\` for short labels, \`Heading\`/\`SectionBlock\` for titles, \`Stats\` for KPI strips.
- **Scale the structure to the question.** A one-line factual answer is \`Text\` plus \`FollowUpBlock\` — do not wrap it in a Card, a header and three sections. Reach for \`Card\`/\`SectionBlock\` only once the reply has genuinely separate parts.
- **Never invent data to fill a component.** Only chart or tabulate numbers you actually have; if the answer is prose, \`Markdown\` is the right answer.
- **Template literals** for any string mixing copy with values.
- **End conversational replies with \`FollowUpBlock([...])\`** — 2–4 short next-prompt suggestions.
- **Compose freely** — vary the structure and component mix to fit each request rather than reaching for the same template every time.`;
}

function chatFinalVerification(): string {
  return `## Final verification

1. \`$app(...)\` is first; every referenced name is defined below and reachable from the root.
2. Every component is invoked with \`()\` — \`Separator()\`, never bare \`Separator\`. Every name appears verbatim in the catalogue above; an unlisted name renders NOTHING, silently.
3. Only the read-only display components above — no forms, clickable buttons, state writes, actions, effects, HTTP, or routing.
4. Tables are column-oriented (\`Table([Col("Label", arr)])\`, cells may be components via \`rows.map(r => Badge(r.status))\`); charts take numeric arrays (array-pluck \`rows.value\`).
5. Prefer one positional arg per call with everything else in a trailing \`{ }\` object; no statement split across lines outside an unmatched bracket.`;
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

function formatComponentSignature(spec: ComponentSpec): string {
  const positional = findPositionalProp(spec);
  const params = spec.props.map((prop) => {
    const typePart = prop.enum ? prop.enum.map((v) => `"${v}"`).join("|") : prop.type;
    // Mark whichever prop the RUNTIME resolves as the positional slot. Only 88 of
    // 282 specs set `positional: true` explicitly; for the rest
    // `findPositionalIndex` falls back to props[0], so gating the tag on the
    // explicit flag left 194 components — Column, Row, Card, Text, Button, Grid,
    // Table, Input, Icon, Hero, PageHeader … — with no marker at all, while the
    // section header above tells the model to "pass the prop tagged
    // (positional) bare". The convention has to be visible on every component
    // for that instruction to mean anything.
    //
    // The two cases must stay distinguishable: when the positional prop is
    // itself object-typed, a lone object argument IS that prop's payload rather
    // than a named-props bag, which changes how the call must be written.
    const tag = prop === positional
      ? (propExpectsObject(prop) ? " (positional, object payload)" : " (positional)")
      : "";
    const aliasPart = prop.aliases?.length ? ` [also: ${prop.aliases.join(", ")}]` : "";
    // A bare `items: object[]` tells the model nothing about the required shape,
    // and that shape is often only recoverable from the prop description. Inline
    // the description for exactly those props — the ones whose type alone is
    // useless — rather than for all 1,521 (which would balloon the dump).
    const shapePart = prop.description && OPAQUE_PROP_TYPES.has(prop.type)
      ? ` (${prop.description})`
      : "";
    return `${prop.name}${prop.optional ? "?" : ""}: ${typePart}${tag}${aliasPart}${shapePart}`;
  }).join(", ");
  return `- ${spec.name}(${params}) — ${spec.description}`;
}

/**
 * Prop types that carry no information on their own, so the prop's description
 * is worth inlining into the signature.
 */
const OPAQUE_PROP_TYPES: ReadonlySet<string> = new Set([
  "object",
  "object[]",
  "any",
  "any[]",
]);

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
