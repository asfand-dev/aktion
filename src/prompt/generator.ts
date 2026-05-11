/**
 * System prompt generator.
 *
 * Produces a clear, ordered prompt that teaches the LLM:
 *   1. The LLM Response UI Lang syntax it must use.
 *   2. The components in the active library and their positional signatures.
 *   3. The data tools (Query/Mutation) it can call.
 *   4. Any preamble, rules, and worked examples the host app provides.
 *
 * The output is plain text — no JSON wrapping — so it drops cleanly into a
 * chat completion `system` message.
 */

import type { ComponentLibrary, ComponentSpec } from "../library/types.js";

export interface ToolSpec {
  name: string;
  description: string;
  /** Example argument shape the LLM should call with. */
  argsExample?: Record<string, unknown>;
  /** Whether this tool is read-only (Query) or mutating (Mutation). */
  kind?: "Query" | "Mutation";
}

export interface PromptOptions {
  /** Library description / role line at the top. */
  preamble?: string;
  /** Free-form rules added at the very end. */
  additionalRules?: ReadonlyArray<string>;
  /** Worked examples to anchor the LLM. */
  examples?: ReadonlyArray<string>;
  /** Tool descriptors to expose as Query/Mutation calls. */
  tools?: ReadonlyArray<ToolSpec>;
  /** Examples that demonstrate tool usage. */
  toolExamples?: ReadonlyArray<string>;
  /** Feature flags (default: tool-aware if `tools` is non-empty). */
  toolCalls?: boolean;
  bindings?: boolean;
  inlineMode?: boolean;
  editMode?: boolean;
  /**
   * When true, teach the LLM about Script(...) and @Js(...). Default false —
   * matches the `enable-javascript` attribute on the element so consumers
   * never advertise a feature they haven't enabled at runtime.
   */
  enableJavascript?: boolean;
}

export function generatePrompt(library: ComponentLibrary, options: PromptOptions = {}): string {
  const hasTools = (options.tools?.length ?? 0) > 0;
  const flags = {
    toolCalls: options.toolCalls ?? hasTools,
    bindings: options.bindings ?? (options.toolCalls ?? hasTools),
    inlineMode: options.inlineMode ?? false,
    editMode: options.editMode ?? false,
    enableJavascript: options.enableJavascript ?? false,
  };

  const sections: string[] = [];
  sections.push(headerSection(options.preamble, library.root));
  sections.push(syntaxSection(library.root));
  sections.push(componentsSection(library, { includeScripting: flags.enableJavascript }));
  if (flags.bindings) sections.push(bindingsSection());
  if (flags.toolCalls) sections.push(toolingSection());
  if (flags.toolCalls || flags.bindings) sections.push(builtinsSection());
  if (flags.enableJavascript) sections.push(javascriptSection());
  if (flags.inlineMode) sections.push(inlineModeSection());
  if (flags.editMode) sections.push(editModeSection());
  if (options.tools && options.tools.length > 0) {
    sections.push(toolsListSection(options.tools));
  }
  if (options.toolExamples && options.toolExamples.length > 0) {
    sections.push(examplesSection("Tool examples", options.toolExamples));
  }
  if (options.examples && options.examples.length > 0) {
    sections.push(examplesSection("Examples", options.examples));
  }
  if (options.additionalRules && options.additionalRules.length > 0) {
    sections.push(rulesSection(options.additionalRules));
  }
  sections.push(streamingSection(library.root));
  sections.push(closingSection(flags.enableJavascript));
  sections.push(finalVerificationSection(library.root));

  return sections.join("\n\n").trim() + "\n";
}

function headerSection(preamble: string | undefined, rootComponent: string): string {
  const header = preamble?.trim() ||
    "You are a UI assistant. Respond ONLY in LLM Response UI Lang — a compact, line-oriented language for generating user interfaces. Never write prose, JSON, markdown, or HTML. Output a flat list of `identifier = Expression` lines and nothing else.";
  const rootRule = `Every response MUST begin with \`root = ${rootComponent}([...])\`. The renderer drops invalid lines, so prefer correctness over verbosity.`;
  return `${header}\n${rootRule}`;
}

function syntaxSection(rootComponent: string): string {
  return `## Syntax
- One statement per line: \`identifier = Expression\`.
- Identifiers use lower_camel or snake_case (no spaces, no quotes).
- State variables start with \`$\`: \`$days = "7"\`.
- Component calls use positional arguments: \`Stack([...children], "row", "m")\`.
- Strings use double quotes, numbers are bare, booleans are \`true\`/\`false\`, null is \`null\`.
- Arrays: \`[a, b, c]\`. Objects: \`{key: value, other: 1}\` (object keys are bare identifiers).
- Member access: \`data.rows.title\` plucks \`title\` from each row when applied to an array.
- Operators: \`+ - * / %\`, \`== != > < >= <=\`, \`&& ||\`, unary \`! -\`.
- Ternary: \`cond ? a : b\`.
- Forward references are allowed — refer to a name before defining it (the parser hoists all references after parsing).
- Comments are not allowed.
- The first line MUST be \`root = ${rootComponent}([...])\` so the UI shell appears immediately during streaming.`;
}

interface ComponentsSectionOptions {
  includeScripting: boolean;
}

const SCRIPTING_GROUP_NAMES = new Set(["Scripting"]);
const SCRIPTING_COMPONENT_NAMES = new Set(["Script"]);

function componentsSection(library: ComponentLibrary, options: ComponentsSectionOptions): string {
  const allGroups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const groups = options.includeScripting
    ? allGroups
    : allGroups.filter((g) => !SCRIPTING_GROUP_NAMES.has(g.name));
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const lines: string[] = [];
  lines.push("## Components");
  lines.push("Use only these components. The order of arguments matches the signature exactly. Optional props end with `?`.");
  lines.push("");
  for (const group of groups) {
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
  // Append any components not in a group, skipping scripting ones unless
  // JavaScript interactions are explicitly enabled.
  const grouped = new Set<string>(allGroups.flatMap((g) => g.components));
  const ungrouped = library.components.filter((c) => {
    if (grouped.has(c.name)) return false;
    if (!options.includeScripting && SCRIPTING_COMPONENT_NAMES.has(c.name)) return false;
    return true;
  });
  if (ungrouped.length > 0) {
    lines.push("### Other");
    for (const spec of ungrouped) lines.push(formatComponentSignature(spec));
  }
  return lines.join("\n").trim();
}

function formatComponentSignature(spec: ComponentSpec): string {
  const params = spec.props.map((prop) => {
    const typePart = prop.enum ? prop.enum.map((v) => `"${v}"`).join("|") : prop.type;
    return `${prop.name}${prop.optional ? "?" : ""}: ${typePart}`;
  }).join(", ");
  return `- ${spec.name}(${params}) — ${spec.description}`;
}

function bindingsSection(): string {
  return `## Reactive State (\`$variables\`)
- Declare with \`$name = defaultValue\` (string/number/boolean/null/array/object literals).
- Pass a \`$variable\` directly as an Input/Select/Checkbox value to enable two-way binding.
- Use \`@Set($name, value)\` to write a state variable from an action.
- Use \`@Reset($a, $b)\` to restore variables to their declared defaults.
- Any expression that reads a \`$variable\` re-evaluates automatically when it changes.`;
}

function toolingSection(): string {
  return `## Data: Query and Mutation
- \`name = Query("tool_name", {arg: value}, {default: shape}, refreshSeconds?)\`
  - Runs immediately and re-runs when any \`$variable\` referenced in args changes.
  - The third argument is rendered before data arrives.
  - The fourth argument (optional) is a polling interval in seconds.
- \`name = Mutation("tool_name", {field: $variable})\`
  - Does NOT run on load. Trigger via \`@Run(name)\` inside an Action.
- Compose interactions inside \`Action([...])\`:
  - \`btn = Button("Save", Action([@Run(mutation), @Run(query), @Reset($title)]))\`
  - Steps run sequentially; if a step fails the rest are skipped.
- Action steps available: \`@Run(ref)\`, \`@Set($var, value)\`, \`@Reset($a, $b, ...)\`, \`@ToAssistant("message")\`, \`@OpenUrl("https://...")\`.`;
}

function builtinsSection(): string {
  return `## Built-in functions
All built-ins use the \`@\` prefix and may appear anywhere in an expression.
- Aggregation: \`@Count(arr)\`, \`@Sum(nums)\`, \`@Avg(nums)\`, \`@Min(nums)\`, \`@Max(nums)\`, \`@First(arr)\`, \`@Last(arr)\`.
- Numeric: \`@Round(n, decimals?)\`, \`@Abs(n)\`, \`@Floor(n)\`, \`@Ceil(n)\`.
- Filter & sort: \`@Filter(arr, "field", "op", value)\` (ops: \`==\`, \`!=\`, \`>\`, \`<\`, \`>=\`, \`<=\`, \`contains\`); \`@Sort(arr, "field", "asc"|"desc")\`.
- Array growth: \`@Push(arr, value)\` (returns a NEW array with \`value\` appended); \`@Concat(a, b)\` (concatenate two arrays).
- Iteration: \`@Each(arr, "varName", template)\` — \`varName\` is bound ONLY inside \`template\` (see "Loop scoping" below).

### Loop scoping (CRITICAL — read this before writing @Each)
\`@Each($items, "x", template)\` is the only way to scope a per-item variable. \`x\` is bound while \`template\` is being evaluated and is invisible everywhere else (top-level statements, \`Script\` bodies, \`@Js\` strings).
- INSIDE \`template\`: refer to \`x.id\`, \`x.title\`, etc. Even named references work — \`@Each($todos, "t", row)\` where \`row = Card([..., t.title, ...])\` re-evaluates \`row\` per item with \`t\` bound.
- OUTSIDE \`template\`: \`x\` is undefined. Do NOT write \`ctx.state.get('x')\` to read a loop variable — \`x\` is not state, it is a per-iteration local. To pass per-item data into a \`@Js\` handler, use the second argument of \`@Js\` (see the JS section).

### Array / string member shortcuts
You may use property access for the most common JS-shaped queries:
- \`$rows.length\` / \`$todos.length\` / \`$text.length\` — element or character count.
- \`$rows.first\` / \`$rows.last\` — first or last element (or \`null\` if empty).
- \`$rows.title\` — "array pluck": map each element to its \`title\` field (idiomatic for charts / columns).
For anything else, use the \`@\` builtins above. There is no \`.filter()\`, \`.map()\`, \`.find()\`, \`.slice()\`, etc. — they do not exist.`;
}

function javascriptSection(): string {
  return `## JavaScript interactions (advanced)
The host has opted in with \`enable-javascript="true"\`. You may now emit JavaScript through two surfaces. **Reach for plain LLM Response UI Lang first** — \`$variables\`, \`Query\`/\`Mutation\`, and \`Action([@Set,@Run,@Reset,@ToAssistant,@OpenUrl])\` already cover most behaviour. Only emit JS when the requested feature truly needs it (timers, fetch you control, DOM focus/scroll, clipboard, keyboard shortcuts, animation, sub-second polling).

### Two surfaces
1. \`Script("id", body, deps?)\` — a behaviour-only component. Runs the body when it mounts, and re-runs when any listed \`$variable\` changes. Renders nothing visible.
2. \`@Js(body, args?)\` — an action step usable inside \`Action([...])\`. Runs the body once when the action fires (typically from a Button). The optional second argument is an object captured at render time and exposed inside the body as \`ctx.args\` — this is the ONLY correct way to feed per-item data (loop variables) into a click handler.

Both receive a single \`ctx\` argument. Use the bare variable name (no \`$\`) when calling \`ctx.state\`.

### How to write the body string
- Use a **backtick-quoted string** (\`...\`) for multi-line bodies. Backticks are LLM-Response-UI-Lang strings that allow real newlines — no need to escape \\n.
- Use a **double-quoted string** ("...") for one-liners. Escape inner double quotes as \\" and newlines as \\n.
- Inside the body, prefer single quotes for JS string literals so you never need to escape.
- The body runs inside an \`async\` function. \`await\` is allowed at the top level.

### \`ctx\` API (the whole surface)
- \`ctx.state.get("count")\` — read the value of \`$count\`. Returns undefined if unset.
- \`ctx.state.set("count", 7)\` — write \`$count = 7\`. Triggers a re-render and re-runs dependent scripts.
- \`ctx.state.reset("a", "b")\` — clear one or more \`$variables\` (back to undefined).
- \`ctx.state.values()\` — snapshot of every \`$variable\` as a plain object.
- \`ctx.args.foo\` — render-time argument captured by \`@Js(body, {foo: ...})\`. Always present (defaults to \`{}\`); empty for \`Script(...)\` bodies.
- \`ctx.tools.toolName(args)\` — invoke any registered \`Query\`/\`Mutation\` handler. Always async; \`await\` it.
- \`ctx.dispatch(message)\` — fire an \`assistant-message\` event (same payload as \`@ToAssistant\`).
- \`ctx.open(url)\` — open a URL (same as \`@OpenUrl\`).
- \`ctx.query(id)\` / \`ctx.queryAll(selector)\` — DOM lookups inside the renderer's shadow root.
- \`ctx.host\` — the \`<llm-response-ui-lang>\` element (for custom-event dispatch).
- \`ctx.cleanup(fn)\` — register a teardown that runs before the next re-run AND on unmount. Always pair intervals, listeners, observers, subscriptions with cleanup.
- \`ctx.signal\` — AbortSignal that fires when the script is about to re-run or be unmounted. Pass it to \`fetch\` and check \`ctx.signal.aborted\` before writing state from async work.

### Before reaching for JS: do it declaratively
Most "imperative-looking" UI logic is already expressible without JS. Check this table FIRST:

| You're tempted to write…              | Idiomatic LLM Response UI Lang                                                |
|---------------------------------------|-------------------------------------------------------------------------------|
| \`Script("init", "ctx.state.set('todos', [...])")\` to seed data | \`$todos = [...]\` — state declarations seed themselves |
| \`@Js("ctx.state.set('todos', ctx.state.get('todos').concat(newItem))")\` | \`@Set($todos, @Push($todos, newItem))\` |
| \`@Js("...filter(t => t.id !== id)")\` to delete | \`@Set($todos, @Filter($todos, "id", "!=", x.id))\` (inside \`@Each\` where \`x\` is the row) |
| \`$todos.filter(...)\` for display                          | \`@Filter($todos, "done", "==", false)\` |
| \`$todos.length\`, \`$todos.first\`, \`$todos.last\`           | Same — these member shortcuts work directly. |
| \`$todos.map(t => t.title)\`                                | \`$todos.title\` (array pluck via member access). |
| \`@Js("ctx.state.set('toggle', !ctx.state.get('toggle'))")\` | \`@Set($toggle, !$toggle)\` |
| Imperative reset of several values                          | \`@Reset($a, $b, $c)\` |

Use \`@Js\` only when:
- You need to read the **current value** of state and mutate it relative to it in a way \`@Push\`/\`@Filter\`/\`@Set\` can't express (e.g. toggling a flag on one item in an array).
- You need a side effect (timer, fetch, DOM focus, clipboard, audio).
- You need to compose multiple state writes that depend on each other.

### \`deps\` (third Script argument)
- Omit it, or pass \`null\` — run once on mount, dispose on unmount.
- Pass \`["foo","bar"]\` — re-run whenever \`$foo\` or \`$bar\` changes. Previous run's \`ctx.cleanup\` fires first.

### Worked example: a complete reactive todo list
Study this end-to-end pattern carefully — it covers add, toggle, delete, filter, count, and empty state without any tools or external fetches. Most "list app" requests can be built by copying this shape and renaming.
\`\`\`
root = Stack([header, composer, list, footer])
$todos = [{id: 1, text: "Welcome — try editing", done: false}]
$draft = ""
$filter = "all"

header = Header("Todos", "Add tasks below")

composer = Stack([
  Input("draft-input", "What needs doing?", "text", null, $draft),
  Button("Add", Action([
    @Set($todos, @Push($todos, {id: $todos.length + 1, text: $draft, done: false})),
    @Reset($draft)
  ]), "primary")
])

visible = $filter == "open" ? @Filter($todos, "done", "==", false) : ($filter == "done" ? @Filter($todos, "done", "==", true) : $todos)
list = visible.length == 0 ? Callout("info", "All clear", "No todos match this filter.") : @Each(visible, "t", row)

row = Card([Stack([
  Tag(t.done ? "done" : "open"),
  TextContent(t.text),
  Button("Toggle", Action([
    @Js(\`
      const todos = ctx.state.get('todos') || [];
      ctx.state.set('todos', todos.map(x => x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x));
    \`, {id: t.id})
  ])),
  Button("Delete", Action([@Set($todos, @Filter($todos, "id", "!=", t.id))]), "ghost")
])])

footer = Stack([
  Buttons([
    Button("All",  Action([@Set($filter, "all")]),  $filter == "all"  ? "primary" : "ghost"),
    Button("Open", Action([@Set($filter, "open")]), $filter == "open" ? "primary" : "ghost"),
    Button("Done", Action([@Set($filter, "done")]), $filter == "done" ? "primary" : "ghost")
  ]),
  TextContent("" + @Filter($todos, "done", "==", false).length + " open · " + $todos.length + " total", "small", "muted")
])
\`\`\`
Notes on this template:
- **Add** is fully declarative (\`@Set\` + \`@Push\`). No JS.
- **Delete** is fully declarative (\`@Set\` + \`@Filter\`). No JS.
- **Toggle** uses \`@Js\` because there is no builtin to flip one field of one item — and the per-item id is passed via \`{id: t.id}\`, NOT via \`ctx.state\`.
- **Count** uses \`.length\` and \`@Filter(...).length\` directly.
- **Empty state** uses a ternary — no JS, no extra script.

### Pattern: interval (multi-line backtick body)
\`\`\`
$running = false
$count = 0
display = Card([TextContent("" + $count, "large-heavy")])
controls = Buttons([
  Button($running ? "Pause" : "Start", Action([@Set($running, !$running)])),
  Button("Reset", Action([@Reset($count, $running)]))
])
ticker = Script("ticker", \`
  if (!ctx.state.get('running')) return;
  const id = setInterval(() => {
    ctx.state.set('count', (ctx.state.get('count') ?? 0) + 1);
  }, 1000);
  ctx.cleanup(() => clearInterval(id));
\`, ["running"])
root = Stack([display, controls, ticker])
\`\`\`

### Pattern: one-liner with @Js (double-quoted body)
\`\`\`
copyBtn = Button("Copy", Action([
  @Js("await navigator.clipboard.writeText(ctx.state.get('snippet') ?? ''); ctx.state.set('copied', true);"),
  @ToAssistant("Copied!")
]))
\`\`\`

### Pattern: async fetch with AbortSignal
\`\`\`
$query = ""
$results = []
fetcher = Script("fetcher", \`
  const q = (ctx.state.get('query') ?? '').trim();
  if (!q) { ctx.state.set('results', []); return; }
  try {
    const data = await ctx.tools.search({ q, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    ctx.state.set('results', data.rows ?? []);
  } catch (e) {
    if (!ctx.signal.aborted) ctx.state.set('results', []);
  }
\`, ["query"])
\`\`\`

### Pattern: debounce (keep latest input only)
\`\`\`
$draft = ""
$pending = ""
debouncer = Script("debounce", \`
  const id = setTimeout(() => ctx.state.set('pending', ctx.state.get('draft')), 250);
  ctx.cleanup(() => clearTimeout(id));
\`, ["draft"])
\`\`\`

### Pattern: per-item button inside @Each (using \`@Js\` args)
This is the canonical way to wire delete/toggle/edit buttons on rows. The \`@Js\` second argument captures the loop variable's value at render time so each row's handler knows which item it belongs to.
\`\`\`
$todos = [{id: 1, text: "Buy milk", done: false}, {id: 2, text: "Walk dog", done: true}]
list = @Each($todos, "t", row)
row = Card([Stack([
  Tag(t.done ? "done" : "open"),
  TextContent(t.text),
  Buttons([
    Button("Toggle", Action([
      @Js(\`
        const todos = ctx.state.get('todos') || [];
        ctx.state.set('todos', todos.map(x => x.id === ctx.args.id ? Object.assign({}, x, {done: !x.done}) : x));
      \`, {id: t.id})
    ])),
    Button("Delete", Action([
      @Set($todos, @Filter($todos, "id", "!=", t.id))
    ]), "ghost")
  ])
])])
root = Stack([list])
\`\`\`
Notice that **Delete needs no JS at all** — \`@Filter\` produces a new array and \`@Set\` writes it. JS is only used for **Toggle** because there is no declarative way to flip a single field on one item.

### Pattern: focus + keyboard shortcut
\`\`\`
focusBtn = Button("Focus input", Action([
  @Js("ctx.query('search-input')?.focus();")
]))
shortcut = Script("shortcut", \`
  const onKey = (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      ctx.query('search-input')?.focus();
    }
  };
  window.addEventListener('keydown', onKey);
  ctx.cleanup(() => window.removeEventListener('keydown', onKey));
\`)
\`\`\`

### WRONG vs RIGHT
- WRONG: \`Script("id", "console.log("hi")")\` — unescaped inner double quotes break the string.
  RIGHT: \`Script("id", "console.log('hi')")\` — use single quotes inside, or backticks: \`Script("id", \`console.log("hi")\`)\`.
- WRONG: forgetting to escape newlines in a double-quoted body — the parser stops at the first real newline and the JS is truncated.
  RIGHT: use backticks for multi-line code (\`Script("id", \`line 1\\nline 2\\nline 3\`)\`) — real newlines are part of the string.
- WRONG: inside \`@Each($todos, "t", row)\`, writing \`@Js("const id = ctx.state.get('t').id; ...")\` to delete a row. \`t\` is a loop variable, NOT state — it does not exist outside of \`row\`.
  RIGHT: pass per-item data with \`@Js(body, {id: t.id})\` and read \`ctx.args.id\` inside the body. Or skip JS entirely and use \`@Set($todos, @Filter($todos, "id", "!=", t.id))\`.
- WRONG: \`Script("init", \`if (!ctx.state.get('todos')) ctx.state.set('todos', [{id:1, text:"…"}])\`)\` to seed initial state.
  RIGHT: \`$todos = [{id: 1, text: "…"}]\` — state declarations seed themselves on parse.
- WRONG: \`"" + ($todos.length || 0)\`, \`filter($todos, "done")\`, \`$todos.find(...)\`, \`$todos.map(t => t.title)\`.
  RIGHT: \`"" + $todos.length\` (length is already a number). Use builtins: \`@Filter($todos, "done", "==", true)\`. Array pluck via member access: \`$todos.title\`.
- WRONG: \`@Js("...todos.concat([newItem])...")\` to append.
  RIGHT: \`@Set($todos, @Push($todos, newItem))\` — no JS required.
- WRONG: a stray word or descriptor inside an Action array, e.g. \`Action([@Js(\`...\`) Enthusiastic])\`. Action arrays contain ONLY action steps separated by commas — no prose, no adverbs, no labels.
  RIGHT: \`Action([@Js(\`...\`), @ToAssistant("Saved!")])\`.
- WRONG: \`state.set('x', 1)\` — \`state\` is not global. Always go through \`ctx.state\`.
- WRONG: \`Script("id", "ctx.state.set('x', await fetch(...))")\` — no cleanup, no abort check.
  RIGHT: an async body that checks \`ctx.signal.aborted\` before writing state.
- WRONG: omitting the id, or reusing the same id for two different scripts.
  RIGHT: every \`Script(...)\` has a stable, unique id within the response.
- WRONG: touching \`localStorage\`, \`document.cookie\`, \`fetch\` to a custom URL directly. Side effects belong in the host's tools.
  RIGHT: \`await ctx.tools.save_pref({ key, value })\`.
- WRONG: emitting \`Script(...)\` when a plain \`Action([@Set(...), @Run(...)])\` would do.
  RIGHT: keep the UI declarative; reach for JS only when the behaviour can't be expressed otherwise.

### Final checks before emitting Script / @Js
1. Did I really need JS for this, or would \`Action([@Set/@Run/@Reset])\` already work?
2. Are all my \`Script\` ids unique within the response?
3. Did I list every reactive \`$variable\` the body reads in \`deps\`?
4. Did I register cleanup for every interval, listener, subscription, observer?
5. If the body does async work, do I check \`ctx.signal.aborted\` before mutating state?
6. Did I escape correctly (or use backticks to avoid escapes)?`;
}

function inlineModeSection(): string {
  return `## Inline mode
You may answer questions in plain text. When you do, wrap any UI you produce in a fenced \`\`\`llm-response-ui-lang block. Otherwise output LLM Response UI Lang directly.`;
}

function editModeSection(): string {
  return `## Edit mode
When the user asks for an incremental change, output ONLY the statements that need to change (additions, replacements, removals). Do not re-emit the whole UI. To remove a statement, write \`name = null\`.`;
}

function toolsListSection(tools: ReadonlyArray<ToolSpec>): string {
  const lines: string[] = ["## Tools"];
  for (const tool of tools) {
    const kind = tool.kind ?? "Query";
    const argsLine = tool.argsExample ? `  args: ${JSON.stringify(tool.argsExample)}` : "  args: {}";
    lines.push(`- ${tool.name} (${kind}) — ${tool.description}\n${argsLine}`);
  }
  return lines.join("\n");
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

function streamingSection(rootComponent: string): string {
  return `## Hoisting & Streaming (CRITICAL)
LLM Response UI Lang supports hoisting: a reference can be used BEFORE it is defined. The renderer re-parses the program on every streamed chunk and silently treats unresolved references as empty, so a partially-streamed response renders progressively without flashing errors — provided you write statements in the right order.

**Required statement order for streaming-friendly output:**
1. \`root = ${rootComponent}([...])\` — emit this FIRST so the UI shell appears immediately, even before its children stream in.
2. Container/component definitions — fill in the layout next (Cards, Sections, Tabs, Forms, Tables, Charts, etc.).
3. Leaf data last — strings, numbers, arrays of values, Series payloads, Col data, FollowUpItem labels, etc.

**Streaming rules — follow strictly:**
- Always reference children by name from the root (\`root = Stack([hero, body, footer])\`) instead of inlining everything in one giant expression. Inline trees only stabilise after the closing bracket streams in, but named references render the parent shell immediately and let each child appear as its line completes.
- Define one reference per FormControl, TabItem, AccordionItem, StepsItem, Series, and Col. Bundling many fields inside a single literal array delays rendering until the entire array has streamed.
- Place large data values (long arrays, big strings, base64, generated tables) on their own trailing lines so they appear last and never block the visible structure.
- Never split a single statement across multiple lines unless it sits inside an unmatched bracket — the parser only commits on a complete line, so half-finished lines stay invisible until they finish.
- Do not introduce trailing commas, dangling operators, or open brackets you don't close on the same line — these will keep the chunk un-parseable until the next chunk arrives.
- Skip narration, retries, or "fixing" earlier lines mid-stream. Treat the response as append-only.

A correctly-ordered response renders top-down: the shell appears first, sections fill in next, and the leaf data lands last — without any flash of error text in between.`;
}

function closingSection(enableJavascript: boolean): string {
  const base = `## Output rules
- Output ONLY LLM Response UI Lang lines (or a fenced \`\`\`llm-response-ui-lang block when inline mode is enabled).
- Always start with \`root = ...\` on the very first line.
- Prefer many small, named statements over deeply nested inline expressions — small statements stream in one at a time and render as soon as they complete.
- Order statements top-down: \`root\` first, then the components it references, then leaf data values last.
- Use the smallest set of components that satisfies the request.
- While using the icons, it should be emoji strings only.
- Do not invent component names that are not in the list above.`;
  if (!enableJavascript) return base;
  return `${base}
- Only emit \`Script(...)\` / \`@Js(...)\` when behaviour cannot be expressed with \`$variables\` + \`Action([...])\`. Default to the declarative path.
- Place \`Script(...)\` definitions AFTER the visible UI in your statement order so the shell renders before scripts execute.
- Prefer backtick-quoted bodies (\`\`...\`\`) for any \`Script\` body longer than one line — they allow real newlines and unescaped double quotes, eliminating the most common parse errors.
- Every \`Script(...)\` MUST have a string id as the first argument and a body as the second. Never omit the id. Never reuse an id within a single response.`;
}

function finalVerificationSection(rootComponent: string): string {
  return `## Final verification
Before finishing, walk your output and verify:
1. \`root = ${rootComponent}(...)\` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than \`root\`) is reachable from \`root\` — unreachable definitions render nothing.
4. Containers reference their children by name; large data arrays are on their own trailing lines.
5. No statement is split across multiple lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.`;
}

export function describeComponentSpec(spec: ComponentSpec): string {
  return formatComponentSignature(spec);
}
