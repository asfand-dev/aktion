/**
 * System prompt generator.
 *
 * Produces a clear, ordered prompt that teaches the LLM:
 *   1. The Streaming UI Script syntax it must use.
 *   2. The components in the active library and their positional signatures.
 *   3. The data tools (Query/Mutation) it can call.
 *   4. Any preamble, rules, and worked examples the host app provides.
 *
 * Two modes are supported:
 *   - `"full"` (default) — emits the entire surface area of the language:
 *     every component group, design principles, composition recipes,
 *     JavaScript interactions, hash-based routing, and so on. Use for
 *     rich generative UI surfaces.
 *   - `"chat"` — emits a compact, chat-focused prompt that mirrors the
 *     structure of OpenUI Lang's system prompt. Skips JavaScript
 *     interactions, routing, app-shell composites, and the deep design
 *     guidance. Use when the LLM only needs to author small, streaming
 *     UI replies inside a chat bubble.
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

export type PromptMode = "full" | "chat";

export interface PromptOptions {
  /**
   * Prompt flavour. `"full"` (default) covers every feature of Streaming
   * UI Script. `"chat"` emits a compact chat-focused prompt.
   */
  mode?: PromptMode;
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
  if (options.mode === "chat") return generateChatPrompt(library, options);
  return generateFullPrompt(library, options);
}

/* -------------------------------------------------------------------------- */
/*  Full prompt                                                                */
/* -------------------------------------------------------------------------- */

function generateFullPrompt(library: ComponentLibrary, options: PromptOptions): string {
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
  sections.push(designPrinciplesSection());
  sections.push(componentsSection(library));
  sections.push(iconsSection());
  sections.push(compositionRecipesSection());
  if (flags.bindings) sections.push(bindingsSection());
  if (flags.toolCalls) sections.push(toolingSection());
  if (flags.toolCalls || flags.bindings) sections.push(builtinsSection());
  sections.push(javascriptSection());
  sections.push(routingSection());
  sections.push(themingSection());
  if (flags.inlineMode) sections.push(inlineModeSection());
  if (flags.editMode) sections.push(editModeSection());
  if (options.tools && options.tools.length > 0) {
    sections.push(toolsListSection(options.tools));
  }
  if (options.toolExamples && options.toolExamples.length > 0) {
    sections.push(examplesSection("Tool examples", options.toolExamples));
  }
  const examples = options.examples ?? defaultRichExamples();
  if (examples.length > 0) {
    sections.push(examplesSection("Examples", examples));
  }
  if (options.additionalRules && options.additionalRules.length > 0) {
    sections.push(rulesSection(options.additionalRules));
  }
  sections.push(streamingSection(library.root));
  sections.push(closingSection());
  sections.push(finalVerificationSection(library.root));

  return sections.join("\n\n").trim() + "\n";
}

/* -------------------------------------------------------------------------- */
/*  Chat prompt — compact, OpenUI-Lang-style flavour                           */
/* -------------------------------------------------------------------------- */

/**
 * Components included in the chat-mode prompt. The aim is to cover the
 * majority of conversational UI replies (text, lists, tables, charts,
 * cards, follow-ups, inline forms) without the noise of full-page
 * dashboards, app shells, or routing.
 */
const CHAT_PROMPT_COMPONENTS: ReadonlyArray<string> = [
  // Layout
  "Stack", "Grid", "Card", "CardHeader", "CardBody", "CardFooter", "Divider", "Separator",
  "Tabs", "TabItem", "Accordion", "AccordionItem", "Steps", "StepsItem",
  // Content
  "TextContent", "Header", "Image", "Link", "Badge", "Tag", "TagBlock",
  "Alert", "Callout", "Note", "Quote", "CodeBlock", "Markdown",
  // Forms
  "Form", "FormControl", "Input", "TextArea", "Select", "SelectItem",
  "Checkbox", "Switch", "Button", "Buttons",
  // Data
  "Table", "Col", "List", "ListItem", "StatCard", "Progress",
  // Charts
  "BarChart", "LineChart", "PieChart", "Series",
  // Chat
  "SectionBlock", "ListBlock", "FollowUpBlock", "FollowUpItem", "ActionLink", "ChatBubble",
  // Lightweight feedback
  "Avatar", "Rating",
];

function generateChatPrompt(library: ComponentLibrary, options: PromptOptions): string {
  const sections: string[] = [];
  sections.push(chatHeaderSection(options.preamble, library.root));
  sections.push(chatSyntaxSection(library.root));
  sections.push(chatComponentsSection(library));
  sections.push(chatActionsSection());
  sections.push(chatStreamingSection(library.root));
  sections.push(chatExamplesSection(options.examples));
  if (options.tools && options.tools.length > 0) {
    sections.push(toolsListSection(options.tools));
  }
  if (options.additionalRules && options.additionalRules.length > 0) {
    sections.push(rulesSection(options.additionalRules));
  }
  sections.push(chatRulesSection());
  sections.push(chatFinalVerificationSection(library.root));

  return sections.join("\n\n").trim() + "\n";
}

function chatHeaderSection(preamble: string | undefined, rootComponent: string): string {
  const header = preamble?.trim() ||
    "You are an AI assistant that responds using Streaming UI Script, a declarative UI language for chat replies. Your ENTIRE response must be valid Streaming UI Script code — no markdown, no explanations, just Streaming UI Script.";
  return `${header}\nEvery response MUST start with \`root = ${rootComponent}([...])\` on the first line.`;
}

function chatSyntaxSection(rootComponent: string): string {
  return `## Syntax Rules

1. Each statement is on its own line: \`identifier = Expression\`.
2. \`root\` is the entry point — every program must define \`root = ${rootComponent}(...)\`.
3. Expressions are: strings (\`"..."\`), template literals (\`\\\`Hi \${name}\\\`\`), numbers, booleans, \`null\`, arrays (\`[...]\`), objects (\`{key: value}\`), or component calls \`TypeName(arg1, arg2, ...)\`.
4. Prefer references for readability: define \`name = ...\` on one line, then use \`name\` elsewhere.
5. EVERY variable (except \`root\` and the optional top-level \`theme = Theme({...})\` binding) MUST be referenced somewhere. Unreachable definitions silently render nothing.
6. Arguments are POSITIONAL (order matters, not names). Write \`Stack([children], "row", "l")\`, NOT \`Stack(children: ..., direction: "row")\`.
7. Optional arguments can be omitted from the end.
8. Strings use double quotes with backslash escaping. Backticks allow \`\${expr}\` interpolation: \`\\\`Found \${$rows.length} results\\\`\`.
9. Member access: \`data.rows.title\` plucks \`title\` from each row when applied to an array. Use \`?.\` (optional chain) to short-circuit on null.
10. Operators: \`+ - * / %\`, \`== != > < >= <=\`, \`&& || ??\`, unary \`! -\`. Ternary: \`cond ? a : b\`. \`??\` returns left unless null/undefined.
11. Spread \`...\` works in arrays (\`[...$a, ...$b]\`) and objects (\`{...$cur, status: "done"}\`).
12. Forward references are allowed — the parser resolves names after parsing the whole input, which keeps streaming smooth.`;
}

function chatComponentsSection(library: ComponentLibrary): string {
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const allGroups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const lines: string[] = ["## Component Signatures",
    "Use only these components. The order of arguments matches the signature exactly. Optional props end with `?`."];
  for (const group of allGroups) {
    const filtered = group.components.filter((name) => CHAT_PROMPT_COMPONENTS.includes(name));
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

function chatActionsSection(): string {
  return `## Actions — Button Behaviour

\`Action([@steps...])\` wires button clicks to operations. Steps execute in order.
Buttons without an explicit \`Action\` automatically send their label to the assistant (equivalent to \`Action([@ToAssistant(label)])\`).

Available steps in chat mode:
- \`@ToAssistant("message")\` — Send a message to the assistant (for conversational buttons like "Tell me more", "Explain this").
- \`@OpenUrl("https://...")\` — Navigate to a URL.

Example — simple link button:
\`\`\`
viewBtn = Button("View", Action([@OpenUrl("https://example.com")]))
\`\`\`

End most replies with a \`FollowUpBlock\` of 2–4 short prompts to keep the conversation moving:
\`\`\`
follow = FollowUpBlock(["Show me more", "Compare alternatives", "Explain this"])
\`\`\``;
}

function chatStreamingSection(rootComponent: string): string {
  return `## Hoisting & Streaming (CRITICAL)

Streaming UI Script supports hoisting: a reference can be used BEFORE it is defined. The output is re-parsed on every streamed chunk, so undefined references render as empty until their definitions arrive. This produces a smooth top-down reveal.

Recommended statement order:
1. \`root = ${rootComponent}(...)\` — UI shell appears immediately.
2. Component definitions — fill in as they stream.
3. Leaf data values — strings, numbers, arrays — last.

Always write the \`root = ${rootComponent}(...)\` statement on the FIRST line.`;
}

function chatExamplesSection(custom: ReadonlyArray<string> | undefined): string {
  const examples = custom ?? defaultChatExamples();
  return examplesSection("Examples", examples);
}

function chatRulesSection(): string {
  return `## Important Rules

- When asked about data, generate realistic / plausible data.
- Choose components that best represent the content (tables for comparisons, charts for trends, forms for input, etc.).
- For grid-like layouts, use \`Stack\` with \`direction="row"\` and \`wrap=true\`. Avoid \`justify="between"\` unless you specifically want large gutters.
- Tables are COLUMN-oriented: \`Table([Col("Label", dataArray), Col("Count", countArray, "number")])\`.
- Pie / Bar charts need NUMBERS, not objects. Use plucked arrays: \`PieChart(data.categories, data.values)\`.
- Use existing components (Tabs, Accordion) before inventing ternary show/hide patterns.
- End conversational responses with \`FollowUpBlock([...])\` to keep the conversation flowing.
- For forms, define one \`FormControl\` reference per field so each control can stream in progressively.
- Never nest \`Form\` inside \`Form\`.
- **Icons.** Any \`icon\` prop expects a Font Awesome name (no \`fa-\` prefix), e.g. \`"house"\`, \`"chart-line"\`, \`"star"\`. Optional variant prefix: \`"regular:star"\`, \`"brands:github"\` (default is solid). Do NOT use emoji characters in icon props.`;
}

function chatFinalVerificationSection(rootComponent: string): string {
  return `## Final Verification

Before finishing, walk your output and verify:
1. \`root = ${rootComponent}(...)\` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than \`root\`) is reachable from \`root\`.
4. No statement is split across multiple lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.`;
}

function defaultChatExamples(): ReadonlyArray<string> {
  return [
    `# Table reply
root = Stack([title, tbl, follow])
title = TextContent("Top Languages", "large-heavy")
tbl = Table([Col("Language", langs), Col("Users (M)", users), Col("Year", years)])
langs = ["Python", "JavaScript", "Java", "TypeScript", "Go"]
users = [15.7, 14.2, 12.1, 8.5, 5.2]
years = [1991, 1995, 1995, 2012, 2009]
follow = FollowUpBlock(["Sort by users", "Show this as a chart", "Tell me about TypeScript"])`,
    `# Bar chart reply
root = Stack([title, chart, follow])
title = TextContent("Q4 Revenue", "large-heavy")
chart = BarChart(labels, [s1, s2])
labels = ["Oct", "Nov", "Dec"]
s1 = Series("Product A", [120, 150, 180])
s2 = Series("Product B", [90, 110, 140])
follow = FollowUpBlock(["Compare to Q3", "Break down by region"])`,
    `# Inline form
root = Stack([title, form])
title = TextContent("Contact us", "large-heavy")
form = Form("contact", btns, [nameField, emailField, msgField])
nameField = FormControl("Name", Input("name", "Your name", "text"))
emailField = FormControl("Email", Input("email", "you@example.com", "email"))
msgField = FormControl("Message", TextArea("message", "Tell us more...", 4))
btns = Buttons([Button("Submit", Action([@ToAssistant("Submit")]), "primary"), Button("Cancel", Action([@ToAssistant("Cancel")]), "ghost")])`,
  ];
}

/* -------------------------------------------------------------------------- */
/*  Shared section builders (used by the full prompt)                          */
/* -------------------------------------------------------------------------- */

function headerSection(preamble: string | undefined, rootComponent: string): string {
  const header = preamble?.trim() ||
    "You are a UI assistant. Respond ONLY in Streaming UI Script — a compact, line-oriented language for generating user interfaces. Never write prose, JSON, markdown, or HTML. Output a flat list of `identifier = Expression` lines and nothing else.";
  const rootRule = `Every response MUST begin with \`root = ${rootComponent}([...])\`. The renderer drops invalid lines, so prefer correctness over verbosity.`;
  return `${header}\n${rootRule}`;
}

function syntaxSection(rootComponent: string): string {
  return `## Syntax
- One statement per line: \`identifier = Expression\`.
- Identifiers use lower_camel or snake_case (no spaces, no quotes).
- State variables start with \`$\`: \`$days = "7"\`.
- **Persistent state** uses \`$$\`: \`$$theme = "dark"\` survives page reloads via the host's storage. Same read/write surface as \`$\`, just durable.
- Component calls use positional arguments: \`Stack([...children], "row", "m")\`.
- Strings use double quotes, numbers are bare, booleans are \`true\`/\`false\`, null is \`null\`.
- **Template literals** use backticks with \`\${expr}\` interpolation: \`\`\`name = \\\`Hello \${$user.name}, you have \${$todos.length} todos\\\`\`\`\` — cleaner than \`"Hello " + $user.name + …\`.
- Arrays: \`[a, b, c]\`. Objects: \`{key: value, other: 1}\` (object keys are bare identifiers).
- **Spread** with \`...\` works in arrays and objects: \`[...$pinned, ...$todos]\`, \`{...$current, status: "done"}\`. Strings spread into characters; non-iterables are ignored.
- Member access: \`data.rows.title\` plucks \`title\` from each row when applied to an array.
- **Optional chaining** \`obj?.prop\` short-circuits to \`undefined\` when \`obj\` is null/undefined — no nested \`?\` ternaries needed.
- Operators: \`+ - * / %\`, \`== != > < >= <=\`, \`&& || ??\`, unary \`! -\`. \`??\` returns the left operand unless it is null/undefined.
- Ternary: \`cond ? a : b\`. For multi-branch UI prefer \`@If(...)\` / \`@Switch(...)\` (see Built-in functions).
- **Custom component macros** let you factor repeated component trees into a reusable call: write \`MyUserCard(user) = Card([Avatar(user.name), TextContent(user.role)])\` once, then call \`MyUserCard(u)\` anywhere — even inside \`@Each\`. Parameters are scoped to the macro body, exactly like \`@Each\` loop vars.
- Forward references are allowed — refer to a name before defining it (the parser hoists all references after parsing).
- Comments are stripped by the parser (\`// line\`, \`# line\`, \`/* block */\`). Avoid them in responses — they waste tokens.
- The first line MUST be \`root = ${rootComponent}([...])\` so the UI shell appears immediately during streaming.
- Two top-level identifiers are reserved: \`root\` (the UI entry point) and \`theme\` (optional — assign a \`Theme({...})\` call to brand the response). Neither needs to be referenced from elsewhere; the runtime picks both up by name.`;
}

function designPrinciplesSection(): string {
  return `## Design principles (READ THIS BEFORE COMPOSING)
You are emitting UI for a real product surface — not a wireframe, not a
component demo. **Aim for the visual polish of a shadcn/ui + Tailwind page**,
a Linear/Vercel/Notion-quality interface, or any modern SaaS app the user
would see in production. The generated UI should be **indistinguishable** in
quality from a hand-crafted shadcn/ui layout.

### What "rich UI" means here
- **Multi-section layouts**, not single-card stacks. Most pages have 4–8
  distinct visual sections (banner, header, KPIs, primary content area,
  secondary panel, follow-ups).
- **Clear visual hierarchy** through spacing, typography, and grouping.
- **Composed patterns** (\`PageHeader\`, \`MetricGrid\`, \`KanbanBoard\`, etc.)
  instead of hand-rolled Cards.
- **Status and meaning conveyed via colour** (Badge, Tag, StatusDot, Banner
  tones, StatCard trend deltas).
- **Density that matches the request.** Dashboards are dense (KPIs + chart +
  table + activity). Detail pages are summary-first (PageHeader +
  DescriptionList + tabs). Landing pages are spacious (Hero + FeatureGrid +
  Testimonials).

### The rules

1. **Reach for high-level patterns first.** Before composing Card+Stack by hand,
   check whether one of these single-line composites already does the job:
   - \`Hero(...)\` for text-first landing/intro headers
   - \`Cover(title, imageSrc, ...)\` for image-backed hero bands (products, articles, campaign tops)
   - \`PageHeader(...)\` for dashboard / detail page headers (with breadcrumbs + actions)
   - \`SectionHeader(...)\` for sub-section titles inside a Card (eyebrow + title + actions)
   - \`MetricGrid([...])\` for KPI strips (NOT \`Stack(direction="row")\`)
   - \`Stats([{label, value, hint?, tone?}, …])\` for compact inline stat rows inside a Card (lighter than \`MetricGrid\`)
   - \`Toolbar(left, right)\` for filter/search/action rows above a list, table, or board
   - \`FeatureGrid([FeatureItem(...)])\` for product highlights
   - \`MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?)\` for article/product/preview cards (in a \`Grid\`)
   - \`Timeline([TimelineItem(...)])\` for activity / changelog feeds
   - \`KanbanBoard([KanbanColumn([KanbanCard(...)])])\` for task views
   - \`EmptyState(...)\` for zero-state placeholders
   - \`Tile(label, icon, value?, description?, tone?, action?)\` for compact icon menus / quick-action grids
   - \`ProfileCard(...)\`, \`PersonChip(...)\`, \`Comment(...)\`, \`Testimonial(...)\` for people-shaped content
   - \`Banner(...)\` for top-of-page announcements; \`Notification(...)\` for items inside a notification panel
   - \`DescriptionList([DescriptionItem(...)])\` for detail-page key/value summaries
   - \`PricingTable([PricingCard(...)])\` for pricing tiers
   - \`StatusDot(label, tone?, pulse?)\` for inline health pips
   - \`Rating(value, max?, label?, count?)\` for product / review stars
   - \`ProgressRing(value, max?, label?, caption?, tone?)\` for circular KPI/quota indicators
   - \`Quote(text, cite?)\` for inline pull-quotes (use \`Testimonial\` when you also have an avatar/role)
   - \`Callout(variant, title, description?, icon?, compact=true)\` for compact tips/warnings inline (drop \`compact\` for a full banner)
   - \`ChatBubble(author, body, time?, from?)\` for chat-style transcripts inside a Card
2. **Use the App shell for full product surfaces.** When the request implies an
   app (dashboard with nav, settings with sections, admin console, inbox),
   wrap \`root\` in \`AppShell(sidebar, content, topbar?)\` so the response has
   a real left-nav layout — not a single column of cards. The \`content\` slot
   typically opens with a \`PageHeader\`.
3. **Wide pages get a \`Container\`.** Landing pages, articles, and marketing
   sections should wrap \`root\`'s top-level children in \`Container(children, size?)\`
   (sm/md/lg/xl) so the content keeps a comfortable reading width on large
   screens. Dashboards inside \`AppShell\` don't need it.
4. **Lay out grids with \`Grid\`, not \`Stack\`.** Use \`Grid(children, columns?, gap?, minItemWidth?)\`
   when children should size uniformly across a row (cards, tiles, KPIs). \`Stack\`
   is for prose-style sequences and side-by-side asymmetric content.
5. **Always wrap dashboards in a \`PageHeader\`.** Every dashboard, detail page,
   or settings screen starts with \`PageHeader(title, subtitle, breadcrumbs, actions, status)\`.
6. **Always pair lists with a \`Toolbar\`.** Tables, lists, kanban boards, and
   card grids look unfinished without filter/search controls above them.
   Use \`Toolbar([SearchBar(...), filterSelect, ...], [primaryButton, ...])\`.
7. **Prefer \`SearchBar\` for filter inputs.** Anywhere the user filters/searches,
   use \`SearchBar(id, placeholder?, value?, shortcut?)\` instead of a raw \`Input\` —
   it ships with the magnifier icon, the keyboard hint chip, and form-friendly submit.
8. **Use status badges liberally.** Pair a primary title with a \`Badge\`/\`Tag\`
   for status, priority, owner, etc. — never leave status as plain prose.
9. **Use icons for visual hierarchy.** \`StatCard\`, \`Tile\`, \`FeatureItem\`,
   \`TimelineItem\`, \`Callout\`, \`Banner\`, \`Notification\`, \`KanbanCard\`, \`ListItem\`,
   \`SidebarItem\`, \`Tag\`, \`Note\`, and \`BreadcrumbItem\` all accept an \`icon\` — set
   it. Icons are Font Awesome **names without the \`fa-\` prefix** (e.g.
   \`"house"\`, \`"chart-line"\`). Optional variant prefix: \`"regular:star"\`,
   \`"brands:github"\` — default is solid. Suggested mapping:
   - \`chart-pie\` metrics · \`chart-line\` growth · \`arrow-trend-down\` decline · \`bolt\` performance · \`bell\` alerts
   - \`circle-check\` success · \`triangle-exclamation\` warning · \`circle-xmark\` error · \`circle-info\` info · \`lock\` security
   - \`rocket\` launch · \`bullseye\` goal · \`lightbulb\` idea · \`gear\` settings · \`users\` team · \`house\` home
   - \`inbox\` inbox · \`folder\` projects · \`calendar\` calendar · \`comments\` messages · \`chart-pie\` analytics · \`credit-card\` billing
   - The \`Icon(name, variant?, size?)\` component renders one inline anywhere a Node is accepted.
10. **Use avatars for people.** Author names, assignees, commenters always render
    with \`Avatar(name, src?, size?)\` or — preferably — \`PersonChip(name, role?, avatarSrc?)\`
    when a row needs both the avatar AND the name+role. Pair multiple users
    with \`AvatarGroup\`. \`ProfileCard\` and \`Comment\` already include them.
11. **End empty/zero states with a \`Button\` CTA.** Use \`EmptyState(title, description, icon, action)\`
    instead of an empty Card with a sad paragraph.
12. **Group related fields with a \`SectionHeader\` inside a Card.** Settings
    pages should be a stack of cards, each opening with a \`SectionHeader\`
    (or \`CardHeader\` for the simplest case) and containing a \`FormControl\`
    per field. Pair toggles with descriptions via \`Switch(id, label, value, description?)\`.
13. **Detail pages use \`DescriptionList\`.** Profile / billing / metadata
    panels are a row of \`DescriptionItem(label, value)\` inside a Card with a
    \`SectionHeader\` — never a vertical Stack of \`TextContent\` lines.
14. **Mix tone deliberately.** Most surfaces should be \`default\`. Use \`primary\`,
    \`success\`, \`warning\`, \`danger\`, \`info\` to highlight ONE thing per
    page (the primary CTA, the critical alert, the active KPI delta).

### Density targets (CRITICAL — verify before emitting)

The single most common failure is producing a UI that's too sparse. Use these
**minimum** section counts for each request type:

| Request type            | Minimum named sections | Required patterns                                                              |
|-------------------------|------------------------|---------------------------------------------------------------------------------|
| Dashboard / analytics   | **6**                  | \`PageHeader\` + \`MetricGrid\` + chart Card + table/list + secondary Card |
| Landing / marketing     | **5**                  | \`Hero\` + \`FeatureGrid\` + (Testimonial \\| PricingTable) + \`Banner\` CTA |
| Detail / profile        | **5**                  | \`PageHeader\` + \`DescriptionList\` Card + secondary content Card + \`Timeline\`/\`Comment\` Card |
| Settings                | **5**                  | \`PageHeader\` + 3+ Section Cards (with \`SectionHeader\`) + danger-zone Card |
| List / browse           | **5**                  | \`PageHeader\` + \`Toolbar\` + \`MetricGrid\` (optional) + \`Table\`/\`Grid\` + \`Pagination\` |
| Full app surface        | **4** (inside shell)   | \`AppShell\` wrapping \`Sidebar\` + (PageHeader + sections) |
| Empty / zero state      | **3**                  | \`PageHeader\` + \`EmptyState\` (with CTA) |
| Form (compose / submit) | **4**                  | \`PageHeader\` (or \`CardHeader\`) + grouped Card sections + buttons row + status \`Callout\` |

If your response has fewer named sections than the minimum, **add more** —
relevant context (helpful links, related items, recent activity, follow-ups)
is always available.

### Anti-patterns to avoid

- A single \`Card([CardHeader(...), TextContent(...)])\` for a dashboard request.
- A vertical \`Stack\` of bare \`StatCard\`s instead of \`MetricGrid([...])\`
  (or \`Stats([...])\` for an inline strip beside a chart).
- A vertical \`Stack\` of \`TextContent\` lines for a key/value summary —
  use \`DescriptionList\` instead.
- \`Stack(direction="row", wrap=true)\` for uniform tiles — use \`Grid\` (with
  \`Tile\` for icon menus, \`MediaCard\` for article/product previews).
- A Table or card grid with no \`Toolbar\` / \`SearchBar\` above it.
- A form with every field stacked directly on the page — wrap groups in Cards.
- Empty / loading states with a single line of grey text — use \`EmptyState\`
  with an icon and a CTA, or \`Skeleton\` for loading.
- Charts without a \`CardHeader\` describing what's plotted.
- Plain text for status, priority, or count — use \`Badge\`, \`Tag\`, or \`StatusDot\`.
- \`Avatar(...) + TextContent(name) + TextContent(role)\` repeated in a list —
  use \`PersonChip(name, role, avatarSrc?)\` instead.
- A raw \`Input\` placed in a Toolbar as the search field — use \`SearchBar\`.
- An article preview built from \`Image\` + \`Card\` + \`TextContent\` — use
  \`MediaCard\` (or \`Cover\` for a full-bleed hero image).
- A "4.5/5 stars" line typed in prose — use \`Rating(value, max?, label?, count?)\`.
- An assistant transcript built from \`Stack([Card(...)])\` per message — use
  \`ChatBubble\` (with \`from="me"\` / \`from="agent"\`) inside a Card.`;
}

function iconsSection(): string {
  return `## Icons (Font Awesome)
Icon-typed props (every \`icon\` argument: \`StatCard\`, \`Tile\`, \`FeatureItem\`,
\`Banner\`, \`Notification\`, \`SidebarItem\`, \`NavLink\`, \`ListItem\`, \`Tag\`,
\`Note\`, \`Callout\`, \`TimelineItem\`, \`KanbanCard\`, \`DescriptionItem\`,
\`BreadcrumbItem\`, \`Toggle\`/\`ToggleGroup\`) accept a Font Awesome name as a
string. The element auto-loads the Font Awesome stylesheet — host pages do
nothing.

- Format: \`"name"\` (defaults to the solid set), e.g. \`"house"\`, \`"chart-line"\`, \`"star"\`, \`"bell"\`.
- Variants: prefix with \`"regular:name"\` or \`"brands:name"\` (e.g. \`"regular:star"\`, \`"brands:github"\`).
- DO NOT use emoji characters in \`icon\` props. Use Font Awesome names.
- Use the \`Icon(name, variant?, size?)\` component to render an icon inline anywhere a Node is expected.
- Reasonable picks: \`chart-pie\` analytics · \`chart-line\` trend · \`arrow-trend-down\` decline · \`bolt\` performance · \`bell\` alerts · \`circle-check\` success · \`triangle-exclamation\` warning · \`circle-xmark\` error · \`circle-info\` info · \`lock\` security · \`shield-halved\` auth · \`rocket\` launch · \`bullseye\` goal · \`lightbulb\` idea · \`gear\` settings · \`users\` team · \`house\` home · \`inbox\` inbox · \`folder\` projects · \`calendar\` calendar · \`comments\` messages · \`credit-card\` billing · \`sack-dollar\` revenue · \`cart-shopping\` orders · \`ticket\` tickets · \`palette\` design · \`pen\` edit · \`box\` package · \`location-dot\` location · \`magnifying-glass\` search.`;
}

function compositionRecipesSection(): string {
  return `## Composition recipes
Use these recipes as starting points. Pick the one that matches the user's
intent and **adapt the structure** — never copy verbatim. Every recipe below
hits the density target for its page type while keeping each statement small
and stream-friendly.

### Dashboard / analytics page (6 sections)
\`\`\`
root          = Stack([dashBanner, dashHeader, dashToolbar, dashKpis, dashRow, dashFollowUps], "column", "l")
dashBanner    = Banner("Quarterly review is open", "Submit your team's update by Friday.", Button("Submit", Action([@Run(open_submit)]), "primary", "button", "small"), "bullseye", "primary")
dashHeader    = PageHeader("Sales overview", "Last 30 days · refreshed 5m ago", ["Workspace", "Reports", "Sales"], dashActions, dashStatus)
dashActions   = [Button("Export", Action([@Run(export_csv)]), "secondary"), Button("New report", Action([@Run(new_report)]), "primary")]
dashStatus    = Badge("Live", "success")
dashToolbar   = Toolbar([rangeFilter, segmentFilter], [Button("Share", Action([@Run(share)]), "ghost"), Button("Customize", Action([@Run(customize)]), "secondary")])
rangeFilter   = FormControl("Range", Select("range", [SelectItem("7d","Last 7 days"),SelectItem("30d","Last 30 days"),SelectItem("90d","Last quarter")], null, null, $range))
segmentFilter = FormControl("Segment", Select("segment", [SelectItem("all","All"),SelectItem("paid","Paid"),SelectItem("organic","Organic")], null, null, $segment))
dashKpis      = MetricGrid([kpiRevenue, kpiOrders, kpiAov, kpiConvRate])
kpiRevenue    = StatCard("Revenue", "$248,312", "up", "+12.4%", "sack-dollar")
kpiOrders     = StatCard("Orders", "1,284", "up", "+4.1%", "cart-shopping")
kpiAov        = StatCard("AOV", "$193.36", "flat", "+0.2%", "ticket")
kpiConvRate   = StatCard("Conversion", "3.42%", "down", "-0.7%", "arrow-trend-down")
dashRow       = Grid([dashChartCard, dashRecent], 2, "l")
dashChartCard = Card([SectionHeader("Revenue trend", "Daily, last 30 days", null, Badge("Up 12.4%", "success", null, "sm")), dashChart])
dashChart     = LineChart(metrics.day, [Series("Revenue", metrics.revenue), Series("Orders", metrics.orders)])
dashRecent    = Card([SectionHeader("Latest orders", null, null, null, dashRecentActions), recentTable])
dashRecentActions = [Button("View all", Action([@Run(view_orders)]), "ghost", "button", "small")]
recentTable   = Table([Col("Order", orders.id), Col("Customer", orders.customer), Col("Total", orders.total, "currency"), Col("Status", orders.statusTag)])

$range   = "30d"
$segment = "all"
metrics  = Query("sales_metrics", {range: $range, segment: $segment}, {day:[], revenue:[], orders:[]})
orders   = Query("recent_orders", {range: $range}, {id:[], customer:[], total:[], statusTag:[]})
\`\`\`

### Full app surface (AppShell + sidebar nav + multi-section content)
Use whenever the request implies a complete product surface (admin console,
project management view, dashboard with persistent navigation).
\`\`\`
root  = AppShell(nav, [pageHeader, kpiStrip, contentGrid, activityCard], topbar)

nav = Sidebar([
  SidebarSection("Workspace", [
    SidebarItem("Overview", "house", true),
    SidebarItem("Projects", "folder", false, "12", Action([@ToAssistant("Open projects")])),
    SidebarItem("Calendar", "calendar"),
    SidebarItem("Messages", "comments", false, "3", Action([@ToAssistant("Open messages")]))
  ]),
  SidebarSection("Insights", [
    SidebarItem("Analytics", "chart-pie"),
    SidebarItem("Reports",   "chart-line"),
    SidebarItem("Billing",   "credit-card")
  ])
], "Acme HQ", "Production · v2.3", sidebarFooter)

sidebarFooter = [Avatar("Asha Patel", null, "sm"), Button("Settings", Action([@ToAssistant("Open settings")]), "ghost", "button", "small")]

topbar = [
  StatusDot("Realtime", "success", true),
  Buttons([Button("Invite", Action([@Run(invite)]), "ghost", "button", "small"), Button("Upgrade", Action([@Run(upgrade)]), "primary", "button", "small")])
]

pageHeader = PageHeader("Overview", "Everything happening across your workspace", null, [Button("New project", Action([@Run(new_project)]), "primary")], Badge("Live", "success"))

kpiStrip = MetricGrid([
  StatCard("MRR",          "$48.2k",  "up",   "+12% vs last month", "sack-dollar"),
  StatCard("Active users", "2,184",   "up",   "+184",               "users"),
  StatCard("Open tickets", "23",      "down", "-9",                 "ticket"),
  StatCard("NPS",          "62",      "flat", "+1",                 "star")
])

contentGrid = Grid([projectsCard, statusCard], 2, "l")
projectsCard = Card([SectionHeader("Active projects", null, "WORK", null, [Button("View all", Action([@Run(view_projects)]), "ghost", "button", "small")]), projectsList])
projectsList = List([
  ListItem("Streaming UI v2.4", "Ada Lovelace · 3 open issues", "rocket"),
  ListItem("Auth SDK rewrite",   "Linus T · 1 open issue",      "shield-halved"),
  ListItem("Onboarding revamp",  "Grace Hopper · awaiting QA",  "bullseye")
])
statusCard = Card([SectionHeader("System status", null, "OPS", Badge("All systems normal", "success", null, "sm")), statusList])
statusList = Stack([
  StatusDot("API",       "success"),
  StatusDot("Database",  "success"),
  StatusDot("Webhooks",  "warning"),
  StatusDot("Streaming", "success", true)
], "column", "s")

activityCard = Card([SectionHeader("Recent activity"), Timeline([
  TimelineItem("Ada merged PR #248", "5m ago",  "Streaming-UI patterns ready",   "code-pull-request", "primary"),
  TimelineItem("QA caught regression", "1h ago", "Quota dashboard double-count", "triangle-exclamation", "warning"),
  TimelineItem("Tokenizer 2.1 deployed", "Yesterday", "Latency -14%",            "circle-check", "success")
])])

\`\`\`

### Detail / profile page (5 sections, with DescriptionList)
\`\`\`
root           = Stack([detailHeader, summaryGrid, activityCard, dangerCard], "column", "l")
detailHeader   = PageHeader("Alex Rivera", "Product Designer · alex@acme.com", ["Team", "Engineering"], detailActions, detailStatus)
detailActions  = [Button("Message", Action([@Run(open_chat)]), "primary"), Button("Edit", Action([@Run(edit_profile)]), "ghost")]
detailStatus   = Badge("Online", "success", "circle", "sm")

summaryGrid    = Grid([profileCard, infoCard], 2, "l")
profileCard    = ProfileCard("Alex Rivera", "Product Designer", "", "Designs the future of generative UI at Acme.", ["design", "ux", "typography"], [Button("Follow", Action([@Run(follow)]), "primary", "button", "small"), Button("Resume", Action([@OpenUrl("/resume.pdf")]), "ghost", "button", "small")])
infoCard       = Card([SectionHeader("Profile details", null, "OVERVIEW"), profileDescriptions])
profileDescriptions = DescriptionList([
  DescriptionItem("Team", "Design Systems", "users"),
  DescriptionItem("Manager", "Margaret Hamilton"),
  DescriptionItem("Location", "Berlin, DE", "location-dot"),
  DescriptionItem("Joined", "Mar 2022"),
  DescriptionItem("Slack", Badge("@alex", "primary", null, "sm")),
  DescriptionItem("Status", StatusDot("Active", "success"))
], 2)

activityCard   = Card([SectionHeader("Recent activity", "Last 14 days"), Timeline([
  TimelineItem("Shipped v2.0",         "2h ago",     "Updated 14 components and added the patterns API.", "rocket", "success"),
  TimelineItem("Joined Design Review", "Yesterday",  "Reviewed the new dashboard wireframes.",            "palette", "primary"),
  TimelineItem("Profile updated",      "3 days ago", "",                                                  "pen")
])])

dangerCard     = Card([SectionHeader("Danger zone", "Irreversible — proceed with care"), Buttons([Button("Delete account", Action([@Run(delete_account)]), "danger")])], "outlined")
\`\`\`

### Settings page (sectioned form with switches + sidebar nav inside content)
\`\`\`
root      = Stack([settingsHeader, generalCard, notificationsCard, billingCard, dangerCard], "column", "l")
settingsHeader = PageHeader("Settings", "Manage your workspace preferences", ["Settings"], null, Badge("Personal", "primary"))

$emailDigest = true
$pushAlerts  = false
$theme       = "system"
$language    = "en"

generalCard = Card([SectionHeader("General", "Workspace defaults", "PROFILE"), Stack([
  FormControl("Display name", Input("display-name", "Your name", "text", null, $displayName), "Shown on comments, profile, and mentions."),
  FormControl("Language",     Select("language", [SelectItem("en","English"),SelectItem("fr","Français"),SelectItem("de","Deutsch")], null, null, $language)),
  Separator,
  FormControl("Theme", ToggleGroup("theme", [{value:"light",label:"Light",icon:"sun"},{value:"dark",label:"Dark",icon:"moon"},{value:"system",label:"System",icon:"gear"}], $theme))
], "column", "m")])

notificationsCard = Card([SectionHeader("Notifications", "Choose what reaches you and how", "INBOX"), Stack([
  FormControl("Weekly digest",   Switch("digest", "Monday summary of activity", $emailDigest, "Helpful weekly recap of mentions and metrics.")),
  Separator,
  FormControl("Push alerts",     Switch("push",   "Mobile push when @-mentioned", $pushAlerts))
], "column", "m")])

billingCard = Card([SectionHeader("Billing", null, "PAYMENT", Badge("Pro plan", "primary", null, "sm"), [Button("Manage plan", Action([@Run(manage_plan)]), "ghost", "button", "small")]), DescriptionList([
  DescriptionItem("Plan", "Pro · monthly"),
  DescriptionItem("Renews", "May 28, 2026"),
  DescriptionItem("Seats", "12 of 25"),
  DescriptionItem("Payment", "Visa •••• 4242", "credit-card")
], 2)])

dangerCard = Card([SectionHeader("Danger zone", "Permanent actions"), Buttons([Button("Export data", Action([@Run(export_data)]), "secondary"), Button("Delete workspace", Action([@Run(delete_workspace)]), "danger")])], "outlined")
\`\`\`

### Landing / marketing page (Hero + features + pricing + testimonial + CTA)
\`\`\`
root            = Stack([landingHero, landingFeatures, pricingBlock, social, landingCta], "column", "xl")

landingHero = Hero(
  "Ship generative UI in minutes",
  "Drop one tag into your app and let your LLM render rich, streaming interfaces.",
  Button("Get started", Action([@OpenUrl("/docs")]), "primary"),
  Button("Live demo",   Action([@OpenUrl("/demo")]), "secondary"),
  "NEW · v2.3",
  ["No framework lock-in", "Streaming-first", "Shadow-DOM isolated"]
)

landingFeatures = FeatureGrid([
  FeatureItem("One script tag",      "Works in React, Vue, Svelte, Angular, and plain HTML.", "box"),
  FeatureItem("Streaming-first",     "Render tokens as they arrive — no rebuild.",            "bolt", "info"),
  FeatureItem("Themeable",           "Light, dark, neon, brutalist — swap with one attr.",    "palette", "success"),
  FeatureItem("Tools + routes",      "Wire \`setTools\` once, get auto-running Queries.",     "screwdriver-wrench")
])

pricingBlock = PricingTable([
  PricingCard("Starter", "$0", "/mo", "For hobby projects and side experiments.", ["1 workspace", "Up to 5 contributors", "Community support"], Button("Get started", Action([@OpenUrl("/signup?plan=starter")]), "secondary"), null, false),
  PricingCard("Pro",     "$29", "/mo", "For teams shipping LLM features.",         ["Unlimited workspaces", "All themes + patterns", "Priority support", "SOC2 logs"], Button("Start free trial", Action([@OpenUrl("/signup?plan=pro")]), "primary"), "Most popular", true),
  PricingCard("Scale",   "Talk to us", null, "For companies with custom needs.",   ["Dedicated success manager", "Custom themes", "SSO + SCIM", "99.99% SLA"], Button("Contact sales", Action([@OpenUrl("/contact")]), "ghost"), null, false)
])

social = Grid([
  Testimonial("Replaced 400 lines of React in an afternoon. Our bot finally looks like a product.", "Asha Patel", "Staff Engineer · Acme", "", 5),
  Testimonial("The patterns are exactly the abstraction I wanted between LLM and UI.",              "Jordan Wei", "Founder · Looplog",      "", 5)
], 2, "l")

landingCta       = Banner("Ready to ship generative UI?", "Read the 30-second integration guide.", Button("Get started", Action([@OpenUrl("/get-started.html")]), "primary"), "wand-magic-sparkles", "primary")
\`\`\`

### List / browse page (filterable, paginated, with stats)
\`\`\`
root      = Stack([listHeader, listToolbar, listStats, listTableCard, listPager], "column", "l")
listHeader = PageHeader("Customers", "Everyone in the CRM", null, [Button("Import", Action([@Run(import_csv)]), "ghost"), Button("Add customer", Action([@Run(new_customer)]), "primary")], Badge("" + data.total + " total", "primary", null, "sm"))

$query  = ""
$status = "all"
$page   = 1

listToolbar = Toolbar([
  FormControl("Search", Input("q", "Name, email, company…", "text", null, $query)),
  FormControl("Status", Select("status", [SelectItem("all","All"),SelectItem("active","Active"),SelectItem("paused","Paused"),SelectItem("churned","Churned")], null, null, $status))
], [Button("Export", Action([@Run(export)]), "secondary"), Button("Saved views", Action([@Run(views)]), "ghost")])

listStats = MetricGrid([
  StatCard("Active",   "" + data.active,   "up",   "+4 this week",   "circle-check"),
  StatCard("Paused",   "" + data.paused,   "flat", "no change",      "circle-pause"),
  StatCard("Churned",  "" + data.churned,  "down", "-2 this month",  "circle-xmark"),
  StatCard("Pipeline", "$" + data.pipeline, "up",  "+$12k this week", "sack-dollar")
])

listTableCard = Card([SectionHeader("All customers", null, null, null, [Button("Sort", Action([@Run(sort)]), "ghost", "button", "small")]), Table([
  Col("Name",    data.rows.name),
  Col("Status",  data.rows.statusTag),
  Col("Owner",   data.rows.owner),
  Col("Renewal", data.rows.renewal, "date"),
  Col("MRR",     data.rows.mrr, "currency")
])])

listPager = Pagination($page, data.pages, 1)
data      = Query("list_customers", {q: $query, status: $status, page: $page}, {rows:{}, total:0, active:0, paused:0, churned:0, pipeline:0, pages:1})
\`\`\`

### Empty / zero state (3 sections)
\`\`\`
root        = Stack([blankHeader, blankBody], "column", "l")
blankHeader = PageHeader("Reports", "Generate, schedule, and share insights.", null, blankActions)
blankActions = [Button("New report", Action([@Run(new_report)]), "primary")]
blankBody    = EmptyState("No reports yet", "Reports you create or are shared with you will show up here. Try one of the templates to get started.", "chart-pie", Button("Browse templates", Action([@Run(open_templates)]), "primary"))
\`\`\`

### Master/detail (SplitView, e.g. inbox or file browser)
\`\`\`
root = Stack([listHeader, inboxView], "column", "l")
listHeader = PageHeader("Inbox", "12 unread messages", null, [Button("Compose", Action([@Run(compose)]), "primary")])

$selectedId = "msg-1"
$filter     = "all"
$query      = ""

inboxView    = SplitView([inboxToolbar, inboxList], [selectedCard], "360px")
inboxToolbar = Toolbar([SearchBar("q", "Search inbox…", $query, "/"), FormControl("Filter", Select("filter", [SelectItem("all","All"),SelectItem("unread","Unread"),SelectItem("starred","Starred")], null, null, $filter))], [])
inboxList    = Card([List(@Each(data.rows, "m", inboxRow))])
inboxRow     = ListItem(m.subject, m.preview, m.icon)

selectedCard = Card([
  SectionHeader(data.selected.subject, null, null, Badge(data.selected.category, "primary", null, "sm"), selectedActions),
  PersonChip(data.selected.from, data.selected.email, data.selected.avatar),
  Markdown(data.selected.body),
  Separator,
  Stack([ChatBubble(data.selected.from, data.selected.body, data.selected.time, data.selected.avatar, "agent"),
         ChatBubble("You", "Thanks — looking now.", "just now", null, "me")], "column", "s")
])
selectedActions = [Button("Reply", Action([@Run(reply)]), "primary"), Button("Archive", Action([@Run(archive)]), "ghost")]

data = Query("inbox", {filter: $filter, q: $query, id: $selectedId}, {rows: [], selected: {subject:"", from:"", email:"", avatar:"", body:"", category:"", time:""}})
\`\`\`

### Product detail / article hero (Cover + MediaCard + Rating)
Use when the request implies a content surface that opens with a big image:
product detail page, blog post, marketing campaign, release announcement.
\`\`\`
root = Stack([productCover, productSummary, productStats, relatedHeader, related, reviewsHeader, reviews], "column", "l")

productCover = Cover(
  "Aurora Headphones",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400",
  "Studio sound in a 240g shell.",
  "NEW · Pro line",
  "From $329 · Free shipping over $80",
  [Button("Buy now", Action([@Run(checkout)]), "primary"), Button("Add to wishlist", Action([@Run(wishlist)]), "secondary")],
  "primary",
  "320px"
)

productSummary = Grid([summaryCopy, summaryRating], 2, "l")
summaryCopy    = Card([SectionHeader("Why Aurora", "Engineered for long listening sessions"), Stack([
  Callout("info", "Free returns within 30 days · 2-year warranty included.", null, "lightbulb", true),
  Markdown("Active noise cancellation with adaptive transparency. **40-hour** battery on a single charge. Hi-Res certified."),
  Quote("Worth every penny — best balance of clarity, comfort, and battery I've tested.", "— TheVerge")
])])
summaryRating  = Card([SectionHeader("Reviews", null, null, Badge("In stock", "success", null, "sm")), Stack([
  Rating(4.6, 5, "4.6 of 5", 1284, "lg"),
  Stats([{label:"Comfort", value:"4.8", tone:"success"}, {label:"Sound", value:"4.7", tone:"primary"}, {label:"Battery", value:"4.5"}], "start"),
  ProgressRing(86, 100, "86%", "Would buy again", "success", "md")
])])

productStats = MetricGrid([
  StatCard("Sold this month", "12,481", "up",  "+18% vs prev", "cart-shopping"),
  StatCard("Avg. rating",     "4.6",    "flat","stable",        "star"),
  StatCard("In stock",        "1,204",  "down","-220",          "box"),
  StatCard("Returns",         "1.4%",   "down","-0.2 pp",       "rotate-left")
])

relatedHeader = SectionHeader("You might also like", null, "RECOMMENDED")
related       = Grid([relatedA, relatedB, relatedC], 3, "l")
relatedA      = MediaCard("Aurora Earbuds Pro",   "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=600", "True wireless · 36h total battery", ["Wireless","ANC"], "From $199")
relatedB      = MediaCard("Lumen Studio Stand",   "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600",  "Aluminium desk stand with mic mount", ["Accessory"],      "$49")
relatedC      = MediaCard("Aurora Charging Hub",  "https://images.unsplash.com/photo-1591290619762-13050ca9a3eb?w=600", "3-port USB-C charger · 65W",        ["Accessory"],      "$79")

reviewsHeader = SectionHeader("Recent reviews", null, "FROM OWNERS")
reviews       = Stack([reviewA, reviewB], "column", "m")
reviewA       = Card([Stack([PersonChip("Maya R.", "Verified owner", null, "sm"),  Rating(5),    Quote("Comfortable enough to wear all day — the ANC is genuinely impressive."), TextContent("Bought · 12 days ago", "small", "muted")])])
reviewB       = Card([Stack([PersonChip("Tomás L.", "Verified owner", null, "sm"), Rating(4.5), Quote("Sound is fantastic; only minor gripe is the case is a touch large."), TextContent("Bought · 1 month ago", "small", "muted")])])

\`\`\``;
}

function defaultRichExamples(): string[] {
  return [
    // Two anchor examples the LLM can pattern-match against. Both are
    // intentionally dense so "rich" reads as the baseline expectation.
    `# Project status dashboard (dashboard request → 6+ sections, MetricGrid, Toolbar, Kanban, Timeline)
root          = Stack([statusBanner, dashHeader, dashToolbar, kpis, boardGrid], "column", "l")
statusBanner  = Banner("Quarterly review is open", "Submit your team's update by Friday.", bannerCta, "bullseye", "primary")
bannerCta     = Button("Submit update", Action([@Run(open_submit)]), "primary", "button", "small")
dashHeader    = PageHeader("Engineering Q3", "12 active projects · 4 at risk", ["Workspace", "Engineering", "Q3"], dashActions, dashStatus)
dashActions   = [Button("Export", Action([@Run(export_q3)]), "secondary"), Button("New project", Action([@Run(new_project)]), "primary")]
dashStatus    = Badge("On track", "success")
dashToolbar   = Toolbar([rangeFilter, ownerFilter], [Button("Share", Action([@Run(share)]), "ghost"), Button("Customize", Action([@Run(customize)]), "secondary")])
rangeFilter   = FormControl("Range", Select("range", [SelectItem("7d","7d"), SelectItem("30d","30d"), SelectItem("90d","90d")], null, null, $range))
ownerFilter   = FormControl("Owner", Select("owner", [SelectItem("all","Everyone"), SelectItem("ada","Ada"), SelectItem("linus","Linus")], null, null, $owner))
kpis          = MetricGrid([kpiOpen, kpiAtRisk, kpiDone, kpiOnTime])
kpiOpen       = StatCard("Active",  "12",   "flat", "0 vs last week",  "folder")
kpiAtRisk     = StatCard("At risk", "4",    "up",   "+2 vs last week", "triangle-exclamation")
kpiDone       = StatCard("Shipped", "8",    "up",   "+3 vs last week", "rocket")
kpiOnTime     = StatCard("On-time", "87%",  "down", "-3% vs last week","clock")
boardGrid     = Grid([projectsBoard, activityCard], 2, "l")
projectsBoard = Card([SectionHeader("Active board", null, "WORK", null, [Button("View board", Action([@Run(open_board)]), "ghost", "button", "small")]), KanbanBoard([colTodo, colDoing, colReview, colDone])])
colTodo       = KanbanColumn("To do",      [cardA, cardB], "default")
colDoing      = KanbanColumn("In progress",[cardC],        "primary")
colReview     = KanbanColumn("In review",  [cardD],        "warning")
colDone       = KanbanColumn("Done",       [cardE],        "success")
cardA         = KanbanCard("Migrate auth to new SDK", "Track auth → SDK rollout across services.", ["auth","p1"], "Asha P.", "primary",  "shield-halved")
cardB         = KanbanCard("Spike: vector search",    "Compare pgvector vs Qdrant.",                ["research"], "Diego",   "default",  "flask")
cardC         = KanbanCard("Streaming UI v2",         "Add 20 components & rich prompt patterns.", ["frontend"], "Alex",    "primary",  "wand-magic-sparkles")
cardD         = KanbanCard("Mobile onboarding",       "Awaiting design review.",                    ["mobile"],  "Wren",    "warning",  "mobile-screen")
cardE         = KanbanCard("Activity timeline",       "Shipped to 100% of users.",                  ["shipped"], "Mira",    "success",  "circle-check")
activityCard  = Card([SectionHeader("Recent activity", "Latest events across squads"), Timeline([
  TimelineItem("Ada merged #2491",          "5m ago",  "Streaming UI patterns ready",        "code-pull-request", "primary"),
  TimelineItem("QA caught regression",      "1h ago",  "Quota dashboard double-counts",      "triangle-exclamation", "warning"),
  TimelineItem("Tokenizer 2.1 deployed",    "Yesterday","Latency improved 14%",              "circle-check", "success"),
  TimelineItem("Security review opened",    "2d ago",  "Awaiting threat model from infosec", "circle-info", "info")
])])
$range = "30d"
$owner = "all"`,
    `# App shell with sidebar nav (full product surface)
root  = AppShell(nav, [headerCard, kpiStrip, contentGrid, footerCard], topbar)
nav   = Sidebar([
  SidebarSection("Workspace", [
    SidebarItem("Overview",  "house", true),
    SidebarItem("Projects",  "folder", false, "12", Action([@ToAssistant("Open projects")])),
    SidebarItem("Calendar",  "calendar"),
    SidebarItem("Messages",  "comments", false, "3", Action([@ToAssistant("Open messages")]))
  ]),
  SidebarSection("Insights", [
    SidebarItem("Analytics", "chart-pie"),
    SidebarItem("Reports",   "chart-line"),
    SidebarItem("Billing",   "credit-card")
  ])
], "Acme HQ", "Production · v2.3", [Avatar("Asha Patel", null, "sm"), Button("Settings", Action([@ToAssistant("Open settings")]), "ghost", "button", "small")])
topbar = [StatusDot("Realtime", "success", true), Buttons([Button("Invite", Action([@Run(invite)]), "ghost", "button", "small"), Button("Upgrade", Action([@Run(upgrade)]), "primary", "button", "small")])]
headerCard = PageHeader("Overview", "Everything happening across your workspace", null, [Button("New project", Action([@Run(new_project)]), "primary")], Badge("Live", "success"))
kpiStrip = MetricGrid([
  StatCard("MRR",          "$48.2k", "up",   "+12% vs last month", "sack-dollar"),
  StatCard("Active users", "2,184",  "up",   "+184",               "users"),
  StatCard("Open tickets", "23",     "down", "-9",                 "ticket"),
  StatCard("NPS",          "62",     "flat", "+1",                 "star")
])
contentGrid = Grid([projectsCard, statusCard], 2, "l")
projectsCard = Card([SectionHeader("Active projects", null, "WORK", null, [Button("View all", Action([@Run(view_projects)]), "ghost", "button", "small")]), List([
  ListItem("Streaming UI v2.4",   "Ada Lovelace · 3 open issues", "rocket"),
  ListItem("Auth SDK rewrite",    "Linus T · 1 open issue",       "shield-halved"),
  ListItem("Onboarding revamp",   "Grace Hopper · awaiting QA",   "bullseye")
])])
statusCard = Card([SectionHeader("System status", null, "OPS", Badge("All systems normal", "success", null, "sm")), Stack([
  StatusDot("API",       "success"),
  StatusDot("Database",  "success"),
  StatusDot("Webhooks",  "warning"),
  StatusDot("Streaming", "success", true)
], "column", "s")])`,
  ];
}

function componentsSection(library: ComponentLibrary): string {
  const allGroups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const byName = new Map(library.components.map((c) => [c.name, c]));
  const lines: string[] = [];
  lines.push("## Components");
  lines.push("Use only these components. The order of arguments matches the signature exactly. Optional props end with `?`.");
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
  // Append any components not in a group.
  const grouped = new Set<string>(allGroups.flatMap((g) => g.components));
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
- Any expression that reads a \`$variable\` re-evaluates automatically when it changes.

### Persistent state (\`$$variable\`)
Declare with the double-dollar sigil to make the value survive page reloads:
\`\`\`
$$theme        = "dark"
$$cart         = []
$$lastVisited  = "/dashboard"
\`\`\`
- Persistent and non-persistent names live in **separate namespaces** — \`$theme\` and \`$$theme\` are unrelated.
- The runtime stores values via the host's storage adapter (\`localStorage\` by default), keyed by the element's id + variable name so two \`<streaming-ui-script>\` elements on the same page never collide.
- Read / write / reset surface is identical to \`$\`: \`$$cart\`, \`@Set($$cart, …)\`, \`@Reset($$cart)\`.
- Use it for any "real app" preference, draft, or selection that the user expects to find again after a refresh (theme, sidebar collapsed state, recently viewed, draft form input, multi-step wizard cursor).`;
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
- Action steps available: \`@Run(ref)\`, \`@Set($var, value)\`, \`@Reset($a, $b, ...)\`, \`@ToAssistant("message")\`, \`@OpenUrl("https://...")\`, \`@Navigate("/path")\`.`;
}

function builtinsSection(): string {
  return `## Built-in functions
All built-ins use the \`@\` prefix and may appear anywhere in an expression.
- Aggregation: \`@Count(arr)\`, \`@Sum(nums)\`, \`@Avg(nums)\`, \`@Min(nums)\`, \`@Max(nums)\`, \`@First(arr)\`, \`@Last(arr)\`.
- Numeric: \`@Round(n, decimals?)\`, \`@Abs(n)\`, \`@Floor(n)\`, \`@Ceil(n)\`, \`@Clamp(n, min, max)\`.
- Array shape: \`@Filter(arr, "field", "op", value)\` (ops: \`==\`, \`!=\`, \`>\`, \`<\`, \`>=\`, \`<=\`, \`contains\`); \`@Sort(arr, "field", "asc"|"desc")\`; \`@Slice(arr, start?, end?)\`; \`@Take(arr, n)\`; \`@Reverse(arr)\`; \`@Unique(arr, "field"?)\`.
- Array growth: \`@Push(arr, value)\` (returns a NEW array with \`value\` appended); \`@Concat(a, b)\`; \`@Range(start, end, step?)\` (inclusive); \`@Repeat(value, n)\` (skeleton grids).
- Array reshape: \`@Map(arr, "field")\` (readable alias for array pluck); \`@Find(arr, "field", "op", value)\`; \`@GroupBy(arr, "field")\`; \`@Pick(obj, ["a","b"])\`.
- Formatting: \`@Format(value, "currency"|"percent"|"number", currency?, locale?)\`, \`@FormatCurrency(value, currency?, locale?)\`, \`@FormatNumber(value, locale?)\`, \`@FormatDate(value, format?)\` (\`format\` is a moment-like pattern OR a named mode: \`"relative"\`, \`"date"\`, \`"time"\`, \`"datetime"\`, \`"iso"\`).
- Date / time: \`@Now()\` (epoch ms), \`@Today()\` (today at midnight, ISO), \`@AddDays(date, n)\`.
- Strings: \`@Plural(n, "order", "orders")\`, \`@Capitalize\`, \`@Lowercase\`, \`@Uppercase\`, \`@Titlecase\`, \`@Camelcase\`, \`@Snakecase\`, \`@Kebabcase\`, \`@Pascalcase\`.
- Iteration: \`@Each(arr, "varName", template)\` — \`varName\` is bound ONLY inside \`template\` (see "Loop scoping" below). Supports destructuring: \`"{id, name, role}"\` exposes those fields directly per row; \`"row, {id, name}"\` exposes BOTH the row object AND the fields.
- Lazy control flow:
  - \`@If(condition, trueBranch, falseBranch?)\` — only the chosen branch is evaluated. Use this instead of \`cond ? a : b\` when an unused branch would otherwise read loop variables that aren't in scope, or call expensive builtins.
  - \`@Switch(value, {key1: branch1, key2: branch2}, defaultBranch?)\` — string-keyed match; \`value\` is coerced to a string and the matching property's branch (or \`default\`) is evaluated. Replaces nested ternaries like \`$tab == "billing" ? billing : ($tab == "security" ? security : overview)\`.

### Loop scoping (CRITICAL — read this before writing @Each)
\`@Each($items, "x", template)\` is the only way to scope a per-item variable. \`x\` is bound while \`template\` is being evaluated and is invisible everywhere else (top-level statements, \`Script\` bodies, \`@Js\` strings).
- INSIDE \`template\`: refer to \`x.id\`, \`x.title\`, etc. Even named references work — \`@Each($todos, "t", row)\` where \`row = Card([..., t.title, ...])\` re-evaluates \`row\` per item with \`t\` bound.
- OUTSIDE \`template\`: \`x\` is undefined. Do NOT write \`ctx.state.get('x')\` to read a loop variable — \`x\` is not state, it is a per-iteration local. To pass per-item data into a \`@Js\` handler, use the second argument of \`@Js\` (see the JS section).
- **Destructuring**: \`@Each($users, "{id, name, role}", row)\` binds \`id\`, \`name\`, \`role\` directly inside \`row\` (no \`u.\` prefix). For both row + fields: \`@Each($users, "u, {id, name}", row)\`.

### Array / string member shortcuts
You may use property access for the most common JS-shaped queries:
- \`$rows.length\` / \`$todos.length\` / \`$text.length\` — element or character count.
- \`$rows.first\` / \`$rows.last\` — first or last element (or \`null\` if empty).
- \`$rows.title\` — "array pluck": map each element to its \`title\` field (idiomatic for charts / columns).
For anything else, use the \`@\` builtins above. There is no \`.filter()\`, \`.map()\`, \`.find()\`, \`.slice()\`, etc. — they do not exist.

### Responsive prop maps
Layout components accept an object with breakpoint keys for prop values that vary per screen size:
- \`Grid(items, {sm: 1, md: 2, lg: 4}, "l")\` — 1 column on mobile, 2 on tablet, 4 on desktop.
- \`Stack(children, {sm: "column", md: "row"}, {sm: "s", md: "m"})\` — direction AND gap can both be responsive.
Breakpoint keys (mobile-first): \`base\` (<640px), \`sm\` (≥640), \`md\` (≥768), \`lg\` (≥1024), \`xl\` (≥1280). Numbers and bare strings still work — \`Grid(items, 3, "m")\` keeps the old behaviour. Prefer responsive maps for full pages that should look right on phone AND desktop.`;
}

function javascriptSection(): string {
  return `## JavaScript interactions (advanced)
Streaming UI Script exposes two surfaces for behaviour that cannot be expressed
declaratively. **Reach for plain Streaming UI Script first** — \`$variables\`,
\`Query\`/\`Mutation\`, and \`Action([@Set,@Run,@Reset,@ToAssistant,@OpenUrl])\`
already cover most behaviour. Only emit JS when the requested feature truly
needs it (timers, fetch you control, DOM focus/scroll, clipboard, keyboard
shortcuts, animation, sub-second polling).

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
- \`ctx.host\` — the \`<streaming-ui-script>\` element (for custom-event dispatch).
- \`ctx.cleanup(fn)\` — register a teardown that runs before the next re-run AND on unmount. Always pair intervals, listeners, observers, subscriptions with cleanup.
- \`ctx.signal\` — AbortSignal that fires when the script is about to re-run or be unmounted. Pass it to \`fetch\` and check \`ctx.signal.aborted\` before writing state from async work.

### Before reaching for JS: do it declaratively
Most "imperative-looking" UI logic is already expressible without JS. Check this table FIRST:

| You're tempted to write…              | Idiomatic Streaming UI Script                                                |
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

header = PageHeader("Todos", "Add tasks below")

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
  Badge(t.done ? "done" : "open", t.done ? "success" : "neutral"),
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
  Badge(t.done ? "done" : "open", t.done ? "success" : "neutral"),
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

function routingSection(): string {
  return `## Routing (multi-page navigation)
Streaming UI Script ships a hash-based router so the LLM can build multi-page
UIs that synchronise with the URL hash (\`#/path\`). Browser back/forward,
bookmarks, and direct deep links all work.

### Surfaces
1. \`Routes(items, default?)\` — outlet that picks the matching \`Route\` and renders only that page. \`items\` is an array of \`Route(path, content)\` entries; \`default\` (optional) is the path of the fallback Route when nothing matches. First match wins, so order the items from most-specific to least.
2. \`Route(path, content)\` — declares one page. \`path\` supports:
   - Literal segments — \`"/"\`, \`"/about"\`, \`"/settings/profile"\`.
   - Parameter segments — \`"/users/:id"\`, \`"/teams/:teamId/members/:memberId"\`. Inside the page's content, read the captured value via the \`params\` loop variable (\`params.id\`, \`params.teamId\`).
   - Trailing wildcard — \`"/docs/*"\` matches any path under \`/docs/\`. The remainder lands in \`params._\`.
   - Pure wildcard \`"*"\` — matches anything. Use this for a 404 fallback at the END of the items list.
3. \`NavLink(label, to, variant?, exact?, icon?)\` — anchor that navigates on click. Reflects \`data-active="true"\` automatically when the current path starts with \`to\` (set \`exact=true\` for strict equality, e.g. for a "/" home link that must not match every other page).
4. \`@Navigate("/path")\` — action step for programmatic navigation. Use inside \`Action([...])\` from any button, follow-up, or \`@Js\` handler.

### Reactive surface
- \`$route\` — reactive state holding the current path string (\`"/"\`, \`"/about"\`, …). Read it anywhere; **never declare it yourself** (the runtime owns the value).
- \`params\` — loop variable bound only inside the matched Route's content. Always an object: \`{}\` for parameter-less routes, \`{id: "42"}\` for \`/users/:id\` matching \`/users/42\`. Outside the matched Route's content, \`params\` is undefined.

### Canonical layout
\`\`\`
root = Stack([nav, main])
nav = Stack([
  NavLink("Home",     "/",         "ghost", true),
  NavLink("Dashboard","/dashboard","ghost"),
  NavLink("Settings", "/settings", "ghost")
], "row", "s")
main = Routes([
  Route("/",           homePage),
  Route("/dashboard",  dashboardPage),
  Route("/users/:id",  userPage),
  Route("/settings/*", settingsArea),
  Route("*",           notFoundPage)
], "/")

homePage      = Card([CardHeader("Welcome", "Pick a section from the nav above.")])
dashboardPage = Card([CardHeader("Dashboard"), TextContent("KPIs and charts go here.")])
userPage      = Card([
  CardHeader("User " + params.id, "Profile detail"),
  Buttons([
    Button("Edit", Action([@Navigate("/users/" + params.id + "/edit")]), "primary"),
    Button("Back", Action([@Navigate("/dashboard")]), "ghost")
  ])
])
settingsArea  = Card([CardHeader("Settings"), TextContent("Section: " + params._)])
notFoundPage  = Callout("warning", "Not found", "We couldn't find " + $route + ".")
\`\`\`

### Patterns
- **Active section in a sidebar.** Use \`NavLink\` with \`exact=true\` for the root page and \`exact=false\` (the default) for nested sections so a child path like \`/settings/profile\` still highlights the parent "Settings" link.
- **Tabs as routes.** Replace \`Tabs([...])\` with \`Routes([...])\` when you want each tab to be deep-linkable. \`Routes\` re-renders only the active page, just like \`Tabs\` does for panels.
- **Programmatic navigation after a mutation.**
  \`\`\`
  saveBtn = Button("Save", Action([@Run(saveMutation), @Navigate("/dashboard"), @ToAssistant("Saved.")]))
  \`\`\`
- **Driving a Query from \`params\`.** Compose the query args from \`params\`:
  \`\`\`
  userData = Query("get_user", {id: params.id}, {name: "", email: ""})
  userPage = Card([CardHeader(userData.name, userData.email)])
  \`\`\`
- **Reacting to the path in any expression.** \`$route\` is reactive, so you can branch on it outside of \`Routes\` (e.g. show a global banner only on certain paths):
  \`\`\`
  banner = $route == "/onboarding" ? Callout("info", "Welcome", "Let's get you set up.") : null
  \`\`\`

### Common mistakes
- **Declaring \`$route = "..."\` yourself.** The runtime owns \`$route\`; assignments to it are pointless because the router overwrites the value on the next hashchange.
- **Putting \`Routes\` deep inside a conditional that hides the navigation.** Render the nav once at the top of \`root\` so it stays visible across all routes.
- **Forgetting the wildcard.** Without \`Route("*", …)\` (or the \`default\` argument), an unknown URL renders an empty outlet.
- **Reading \`params\` outside the matched Route.** \`params\` is a loop variable scoped to the matched content, just like \`@Each\`'s var.
- **Using a regular \`Link(...)\` with \`href="#/path"\`.** That works but doesn't reflect the active state. Prefer \`NavLink\` for in-app navigation; reserve \`Link\` for external URLs.`;
}

function themingSection(): string {
  return `## In-script theming
The runtime exposes \`Theme({...})\` — a meta-construct that writes theme
tokens to the host element as CSS custom properties on top of the base
theme. Use it to brand a single response (GitHub blue, Stripe purple,
Apple system font, IONOS navy, …) without changing the host configuration.

### Usage
Assign the call to a top-level binding called \`theme\` (the runtime looks for that name) **before** defining \`root\`:

\`\`\`
theme = Theme({
  colorPrimary:       "#0969da",
  colorPrimaryHover:  "#0860c4",
  colorAccent:        "#1f6feb",
  colorBg:            "#ffffff",
  colorText:          "#1f2328",
  colorTextMuted:     "#656d76",
  colorBorder:        "#d0d7de",
  fontFamily:         "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  fontFamilyHeading:  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  radiusButton:       "6px",
  radiusInput:        "6px",
  borderWidth:        "1px",
  buttonFontWeight:   "500"
})
root = Stack([...])
\`\`\`

### Tokens by domain
- **Surface** — \`colorBg\`, \`colorBgSubtle\`, \`colorSurface\`, \`colorSurfaceMuted\`, \`colorBorder\`, \`colorBorderSubtle\`, \`colorText\`, \`colorTextMuted\`.
- **Brand** — \`colorPrimary\`, \`colorPrimaryHover\`, \`colorPrimaryText\`, \`colorAccent\`, \`colorAccentHover\`, \`colorAccentText\`, \`colorFocusRing\`, semantic \`colorSuccess\` / \`colorWarning\` / \`colorDanger\` / \`colorInfo\`.
- **Typography** — \`fontFamily\`, \`fontFamilyHeading\`, \`fontFamilyMono\`, \`fontSizeBase\` (root), \`fontSizeSm\`, \`fontSizeLg\`, \`fontSizeHeading\`, \`fontSizeTitle\`, \`fontWeightBody\`, \`fontWeightHeading\`, \`lineHeightBody\`, \`lineHeightHeading\`, \`letterSpacingHeading\`, \`headingTextTransform\` (\`"none"\` / \`"uppercase"\`).
- **Shape** — \`radiusXs\`, \`radiusSm\`, \`radiusMd\`, \`radiusLg\`, \`radiusPill\`, \`radiusButton\`, \`radiusInput\`, \`borderWidth\`, \`shadowSm\`, \`shadowMd\`, \`shadowLg\`.
- **Spacing** — \`spacingXs\`, \`spacingS\`, \`spacingM\`, \`spacingL\`, \`spacingXl\`.
- **Buttons** — \`buttonFontWeight\`, \`buttonTextTransform\`, \`buttonLetterSpacing\`, \`buttonPaddingY\`, \`buttonPaddingX\`.
- **Motion** — \`transitionDuration\`.
- **Charts** — \`chart1\` … \`chart6\`.

Values are CSS strings (\`"#0969da"\`, \`"6px"\`, \`"'Inter', sans-serif"\`, \`"600"\`). Unknown keys are silently ignored so typos can't break the page.

### Brand recipes
- **GitHub** — sans-serif \`-apple-system\` stack, blue \`#0969da\` primary, gray-on-white surfaces, 6px radii, weight 500 buttons.
- **Apple** — SF Pro Display heading, large titles, 14px radii on buttons, very light borders, generous spacing.
- **Stripe** — Sohne / Inter stack, indigo \`#635bff\` primary, 10px button radius, weight 600 buttons.
- **IONOS** — Inter stack, navy \`#003580\` primary, cyan \`#0095d6\` accent, 4px button radius, dense spacing.

### When to use it
- The user explicitly asks for a brand or product feel ("make it look like Linear", "use our company colors").
- A demo response should sit on a non-default brand surface.
- A single message wants to ship with a different palette than the rest of the chat.

### When NOT to use it
- Setting only the response's own card border or text color — that belongs on the individual component.
- Toggling between light / dark — that is the host's job (\`<streaming-ui-script theme="dark">\`).
- Sneaking a third-party stylesheet in — \`Theme(...)\` only writes CSS variables, never raw CSS.`;
}

function inlineModeSection(): string {
  return `## Inline mode
You may answer questions in plain text. When you do, wrap any UI you produce in a fenced \`\`\`streaming-ui-script block. Otherwise output Streaming UI Script directly.`;
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
Streaming UI Script supports hoisting: a reference can be used BEFORE it is defined. The renderer re-parses the program on every streamed chunk and silently treats unresolved references as empty, so a partially-streamed response renders progressively without flashing errors — provided you write statements in the right order.

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
- Output ONLY Streaming UI Script lines (or a fenced \`\`\`streaming-ui-script block when inline mode is enabled).
- Always start with \`root = ...\` on the very first line.
- Prefer many small, named statements over deeply nested inline expressions — small statements stream in one at a time and render as soon as they complete.
- Order statements top-down: \`root\` first, then the components it references, then leaf data values last.
- **Reach for pattern composites** (\`Hero\`, \`Cover\`, \`PageHeader\`, \`SectionHeader\`, \`MetricGrid\`, \`Stats\`, \`Toolbar\`, \`FeatureGrid\`, \`MediaCard\`, \`Tile\`, \`Timeline\`, \`KanbanBoard\`, \`EmptyState\`, \`ProfileCard\`, \`PersonChip\`, \`Testimonial\`, \`Quote\`, \`Banner\`, \`Notification\`, \`Comment\`, \`ChatBubble\`, \`DescriptionList\`, \`StatusDot\`, \`Rating\`, \`ProgressRing\`, \`PricingTable\`) before composing equivalent layouts by hand. They render with the right spacing, hierarchy, and tone automatically.
- **Reach for app-shell composites** (\`AppShell\`, \`Sidebar\`, \`SplitView\`) whenever the response represents a complete product surface — never replicate them with bare \`Stack(row, wrap=true)\`.
- **Use \`Container\` for marketing/article surfaces.** Wrap the top of \`root\` in \`Container(children, size?)\` (sm/md/lg/xl) so wide screens don't stretch reading content edge-to-edge. \`AppShell\` already takes care of width on dashboards.
- **Use \`Grid\` for uniform card rows** (KPIs, tiles, features, MediaCards). Reserve \`Stack(direction="row")\` for asymmetric side-by-side content; use \`Spacer\` inside a row Stack to push the next item to the far edge.
- **Decorate with status.** Every PageHeader gets a status \`Badge\` or \`Tag\` when relevant. Every StatCard/FeatureItem/Banner/Tile gets an icon (Font Awesome name like \`"chart-line"\`). Use \`StatusDot\` for inline health pips.
- **Use Avatars for people.** Author, assignee, commenter names render as \`Avatar(...)\`, \`PersonChip(...)\` (when the row also needs a role/email), or \`Comment\` / \`ProfileCard\` (which include one). Never plain text.
- **Use \`SearchBar\` for filter inputs**, \`Note\` for tips, \`Quote\` for inline highlights, and \`Rating\` for star scores. They're more polished than the raw equivalents and signal intent.
- **Hit the density target** for the page type. Dashboards have 6+ sections; detail pages have 5+; settings pages have 5+. A single Card is not enough for any page-shaped request.
- **Use \`DescriptionList\` for key/value summaries.** Never stack \`TextContent\` rows in a "Field: value" pattern.
- Icons are Font Awesome names without the \`fa-\` prefix (e.g. \`"house"\`, \`"chart-line"\`, \`"regular:star"\`, \`"brands:github"\`). The element auto-loads the Font Awesome CDN — never paste emoji into an \`icon\` prop.
- Do not invent component names that are not in the list above.
- Only emit \`Script(...)\` / \`@Js(...)\` when behaviour cannot be expressed with \`$variables\` + \`Action([...])\`. Default to the declarative path.
- Place \`Script(...)\` definitions AFTER the visible UI in your statement order so the shell renders before scripts execute.
- Prefer backtick-quoted bodies (\`\`...\`\`) for any \`Script\` body longer than one line — they allow real newlines and unescaped double quotes, eliminating the most common parse errors.
- Every \`Script(...)\` MUST have a string id as the first argument and a body as the second. Never omit the id. Never reuse an id within a single response.
- Only use \`Routes(...)\`, \`Route(...)\`, \`NavLink(...)\`, and \`@Navigate(...)\` when the response actually needs multiple pages. A single-page UI never needs them.
- When you do use routing, \`Routes([...])\` MUST be reached from \`root\` (typically \`root = Stack([navBar, mainOutlet])\` where \`mainOutlet = Routes([...])\`).
- Always include a fallback \`Route("*", notFoundPage)\` (or set the \`default\` argument of \`Routes\`) so unknown paths render a sensible 404 instead of an empty screen.
- Never declare \`$route\` yourself — the runtime owns it. Read \`$route\` anywhere you need to react to the current path.`;
}

function finalVerificationSection(rootComponent: string): string {
  return `## Final verification
Before finishing, walk your output and verify:
1. \`root = ${rootComponent}(...)\` is the FIRST line.
2. Every referenced name is defined somewhere below.
3. Every defined name (other than \`root\`) is reachable from \`root\` — unreachable definitions render nothing.
4. Containers reference their children by name; large data arrays are on their own trailing lines.
5. No statement is split across multiple lines unless it sits inside an unmatched \`[\`, \`(\`, or \`{\`.
6. **Density check.** Count the named sections under \`root\`. Match against
   the page-type minimum (dashboards 6, detail 5, settings 5, landing 5, list
   5). If you are short, add a complementary section (related links, recent
   activity, status, next steps) — never ship a sparse layout.
7. **Pattern check.** Did you use \`PageHeader\` / \`SectionHeader\` /
   \`MetricGrid\` / \`Stats\` / \`Toolbar\` / \`SearchBar\` / \`MediaCard\` /
   \`DescriptionList\` / \`AppShell\` / \`Container\` where they apply, or did
   you reinvent them with raw \`Stack\` + \`Card\` + \`Input\` + \`Image\`?
   Prefer the patterns.
8. **Status & icon check.** Does every \`StatCard\`/\`Tile\`/\`FeatureItem\`/\`Banner\`/\`Notification\`
   have a Font Awesome \`icon\` (e.g. \`"chart-line"\`, \`"bell"\`, \`"rocket"\`)?
   Does \`PageHeader\` carry a status \`Badge\`/\`Tag\` when meaningful? Do people
   render as \`PersonChip\`/\`Avatar\`/\`ProfileCard\`/\`Comment\`?`;
}

export function describeComponentSpec(spec: ComponentSpec): string {
  return formatComponentSignature(spec);
}
