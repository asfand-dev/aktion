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
}

export function generatePrompt(library: ComponentLibrary, options: PromptOptions = {}): string {
  const hasTools = (options.tools?.length ?? 0) > 0;
  const flags = {
    toolCalls: options.toolCalls ?? hasTools,
    bindings: options.bindings ?? (options.toolCalls ?? hasTools),
    inlineMode: options.inlineMode ?? false,
    editMode: options.editMode ?? false,
  };

  const sections: string[] = [];
  sections.push(headerSection(options.preamble, library.root));
  sections.push(syntaxSection(library.root));
  sections.push(componentsSection(library));
  if (flags.bindings) sections.push(bindingsSection());
  if (flags.toolCalls) sections.push(toolingSection());
  if (flags.toolCalls || flags.bindings) sections.push(builtinsSection());
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
  sections.push(closingSection());
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

function componentsSection(library: ComponentLibrary): string {
  const groups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
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
  // Append any components not in a group.
  const grouped = new Set<string>(groups.flatMap((g) => g.components));
  const ungrouped = library.components.filter((c) => !grouped.has(c.name));
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
- Iteration: \`@Each(arr, "varName", template)\` — \`varName\` is bound inline (only inside the template expression).`;
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

function closingSection(): string {
  return `## Output rules
- Output ONLY LLM Response UI Lang lines (or a fenced \`\`\`llm-response-ui-lang block when inline mode is enabled).
- Always start with \`root = ...\` on the very first line.
- Prefer many small, named statements over deeply nested inline expressions — small statements stream in one at a time and render as soon as they complete.
- Order statements top-down: \`root\` first, then the components it references, then leaf data values last.
- Use the smallest set of components that satisfies the request.
- Do not invent component names that are not in the list above.`;
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
