/**
 * System prompt generator.
 *
 * Produces a clear, ordered prompt that teaches the LLM:
 *   1. The Streaming UI Script syntax it must use.
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
  /**
   * When true, teach the LLM about hash-based routing (`Routes`, `Route`,
   * `NavLink`, `@Navigate`, and the `$route` / `params` reactive surfaces).
   * Default false — mirrors the `enable-routes` attribute on the element.
   */
  enableRoutes?: boolean;
}

export function generatePrompt(library: ComponentLibrary, options: PromptOptions = {}): string {
  const hasTools = (options.tools?.length ?? 0) > 0;
  const flags = {
    toolCalls: options.toolCalls ?? hasTools,
    bindings: options.bindings ?? (options.toolCalls ?? hasTools),
    inlineMode: options.inlineMode ?? false,
    editMode: options.editMode ?? false,
    enableJavascript: options.enableJavascript ?? false,
    enableRoutes: options.enableRoutes ?? false,
  };

  const sections: string[] = [];
  sections.push(headerSection(options.preamble, library.root));
  sections.push(syntaxSection(library.root));
  sections.push(designPrinciplesSection());
  sections.push(componentsSection(library, {
    includeScripting: flags.enableJavascript,
    includeRouting: flags.enableRoutes,
  }));
  sections.push(compositionRecipesSection());
  if (flags.bindings) sections.push(bindingsSection());
  if (flags.toolCalls) sections.push(toolingSection());
  if (flags.toolCalls || flags.bindings) sections.push(builtinsSection());
  if (flags.enableJavascript) sections.push(javascriptSection());
  if (flags.enableRoutes) sections.push(routingSection());
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
  sections.push(closingSection(flags.enableJavascript, flags.enableRoutes));
  sections.push(finalVerificationSection(library.root));

  return sections.join("\n\n").trim() + "\n";
}

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

function designPrinciplesSection(): string {
  return `## Design principles (READ THIS BEFORE COMPOSING)
You are emitting UI for a real product surface — not a wireframe. Aim for the
visual polish of a shadcn/ui or Vercel-quality page, not a "minimal demo".
Follow these rules every time:

1. **Reach for high-level patterns first.** Before composing Card+Stack by hand,
   check whether one of these single-line composites already does the job:
   - \`Hero(...)\` for landing/intro headers
   - \`PageHeader(...)\` for dashboard / detail page headers (with breadcrumbs + actions)
   - \`MetricGrid([...])\` for KPI strips (NOT \`Stack(direction="row")\`)
   - \`FeatureGrid([FeatureItem(...)])\` for product highlights
   - \`Timeline([TimelineItem(...)])\` for activity / changelog feeds
   - \`KanbanBoard([KanbanColumn([KanbanCard(...)])])\` for task views
   - \`EmptyState(...)\` for zero-state placeholders
   - \`ProfileCard(...)\`, \`Comment(...)\`, \`Testimonial(...)\` for people-shaped content
   - \`Banner(...)\` for top-of-page announcements
2. **Lay out grids with \`Grid\`, not \`Stack\`.** Use \`Grid(children, columns?, gap?, minItemWidth?)\`
   when children should size uniformly across a row (cards, tiles, KPIs). \`Stack\`
   is for prose-style sequences and side-by-side asymmetric content.
3. **Always wrap dashboards in a \`PageHeader\`.** Every dashboard, detail page,
   or settings screen starts with \`PageHeader(title, subtitle, breadcrumbs, actions)\`.
4. **Use status badges liberally.** Pair a primary title with a \`Badge\`/\`Tag\`
   for status, priority, owner, etc. — never leave status as plain prose.
5. **Use icons (emoji) for visual hierarchy.** \`StatCard\`, \`FeatureItem\`,
   \`TimelineItem\`, \`Callout\`, \`Banner\`, \`KanbanCard\`, \`ListItem\`,
   \`Tag\`, and \`BreadcrumbItem\` all accept an \`icon\` — set it. Suggested mapping:
   - 📊 metrics · 📈 growth · 📉 decline · ⚡️ performance · 🔔 alerts
   - ✅ success · ⚠️ warning · ❌ error · ℹ️ info · 🔒 security
   - 🚀 launch · 🎯 goal · 💡 idea · 🛠 settings · 👥 team
6. **Use avatars for people.** Author names, assignees, commenters always render
   with \`Avatar(name, src?, size?)\` — never plain text. Pair multiple users
   with \`AvatarGroup\`.
7. **End empty/zero states with a \`Button\` CTA.** Use \`EmptyState(title, description, icon, action)\`
   instead of an empty Card with a sad paragraph.
8. **Group related fields.** Inside a \`Form\`, group related \`FormControl\`s
   inside a \`Card\` with a \`CardHeader\` per section.
9. **Mix tone deliberately.** Most surfaces should be \`default\`. Use \`primary\`,
   \`success\`, \`warning\`, \`danger\`, \`info\` to highlight ONE thing per page
   (the primary CTA, the critical alert, the active KPI delta).
10. **Density matters.** A page should have AT LEAST 4–6 named sections
    (PageHeader, MetricGrid, content cards, related lists, FollowUpBlock). One
    Card with a paragraph of text is never enough for a dashboard request.`;
}

function compositionRecipesSection(): string {
  return `## Composition recipes
Use these recipes as starting points. Pick the one that matches the user's intent and adapt it.

### Dashboard / analytics page
\`\`\`
root          = Stack([dashHeader, dashKpis, dashChartCard, dashRecent, dashFollowUps])
dashHeader    = PageHeader("Sales overview", "Last 30 days", ["Workspace", "Reports", "Sales"], dashActions, dashStatus)
dashActions   = [Button("Export", Action([@Run(export_csv)]), "secondary"), Button("New report", Action([@Run(new_report)]), "primary")]
dashStatus    = Badge("Live", "success")
dashKpis      = MetricGrid([kpiRevenue, kpiOrders, kpiAov, kpiConvRate])
kpiRevenue    = StatCard("Revenue", "$248,312", "up", "+12.4%")
kpiOrders     = StatCard("Orders", "1,284", "up", "+4.1%")
kpiAov        = StatCard("AOV", "$193.36", "flat", "+0.2%")
kpiConvRate   = StatCard("Conversion", "3.42%", "down", "-0.7%")
dashChartCard = Card([CardHeader("Revenue trend", "Daily, last 30 days"), dashChart])
dashChart     = LineChart(metrics.day, [Series("Revenue", metrics.revenue), Series("Orders", metrics.orders)])
dashRecent    = Card([CardHeader("Latest orders"), recentTable])
recentTable   = Table([Col("Order", orders.id), Col("Customer", orders.customer), Col("Total", orders.total, "currency"), Col("Status", orders.statusTag)])
dashFollowUps = FollowUpBlock(["Break down by region", "Compare to last quarter", "Show top customers"])
\`\`\`

### Landing / marketing page
\`\`\`
root        = Stack([landingHero, landingFeatures, landingTestimonial, landingFollowUps])
landingHero = Hero(
  "Ship generative UI in minutes",
  "Drop one tag into your app and let your LLM render rich, streaming interfaces.",
  Button("Get started", Action([@OpenUrl("/docs")]), "primary"),
  Button("Live demo", Action([@OpenUrl("/demo")]), "secondary"),
  "NEW",
  ["No framework lock-in", "Streaming-first", "Shadow DOM isolated"]
)
landingFeatures = FeatureGrid([featInstall, featStream, featExtend])
featInstall = FeatureItem("One script tag", "Works in React, Vue, Svelte, Angular, and vanilla HTML.", "📦")
featStream  = FeatureItem("Streaming-first", "Progressive render — the shell appears before children stream in.", "⚡️", "info")
featExtend  = FeatureItem("Extensible", "Register your own components and they show up in the system prompt automatically.", "🛠", "success")
landingTestimonial = Testimonial(
  "Replaced 400 lines of JSON-rendering React in an afternoon. Our chat bot finally looks like a product.",
  "Asha Patel",
  "Staff Engineer · Acme",
  ""
)
landingFollowUps = FollowUpBlock(["Show me the system prompt", "Embed it in my React app", "Wire up tools"])
\`\`\`

### Detail / profile page
\`\`\`
root        = Stack([profileHeader, profileGrid, profileTimeline, profileFollowUps])
profileHeader = PageHeader("Alex Rivera", "Product Designer · alex@acme.com", ["Team", "Engineering"], profileActions, profileStatus)
profileActions = [Button("Message", Action([@Run(open_chat)]), "primary"), Button("Edit", Action([@Run(edit_profile)]), "ghost")]
profileStatus = Tag("Online", "online", "sm", "success")
profileGrid = Grid([profileCard, profileBio], 2, "l")
profileCard = ProfileCard("Alex Rivera", "Product Designer", "", "Designs the future of generative UI at Acme.", ["design", "ux", "type"], profileSocial)
profileSocial = [Button("Follow", Action([@Run(follow)]), "primary", "small"), Button("Resume", Action([@OpenUrl("/resume.pdf")]), "ghost", "small")]
profileBio = Card([CardHeader("About"), aboutMd])
aboutMd = Markdown("Alex joined Acme in 2022 and led the design system rewrite. Outside of work: rock climbing, espresso, and **lots** of typography.")
profileTimeline = Card([CardHeader("Recent activity"), recentEvents])
recentEvents = Timeline([
  TimelineItem("Shipped v2.0", "2 hours ago", "Updated 14 components and added the patterns API.", "🚀", "success"),
  TimelineItem("Joined Design Review", "Yesterday", "Reviewed the new dashboard wireframes.", "🎨", "primary"),
  TimelineItem("Profile updated", "3 days ago", "", "✏️")
])
profileFollowUps = FollowUpBlock(["Show projects", "Open inbox", "Schedule a 1:1"])
\`\`\`

### Empty / zero state
\`\`\`
root = Stack([blankHeader, blankBody])
blankHeader = PageHeader("Reports", "Generate, schedule, and share insights.", null, blankActions)
blankActions = [Button("New report", Action([@Run(new_report)]), "primary")]
blankBody = EmptyState("No reports yet", "Reports you create or are shared with you will show up here.", "📊", Button("Create your first report", Action([@Run(new_report)]), "primary"))
\`\`\`

### Settings page (form + Switches)
\`\`\`
root = Stack([settingsHeader, settingsForm])
settingsHeader = PageHeader("Notification preferences", "Choose where you want to be notified.", ["Settings", "Notifications"])
$emailEnabled = true
$pushEnabled = false
$digest = "weekly"
settingsForm = Card([
  CardHeader("Channels"),
  FormControl("Email", Switch("email-on", "Send important updates to alex@acme.com", $emailEnabled)),
  Separator,
  FormControl("Push", Switch("push-on", "Mobile push notifications", $pushEnabled)),
  Separator,
  FormControl("Digest frequency", ToggleGroup("digest", [["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]], $digest))
])
\`\`\``;
}

function defaultRichExamples(): string[] {
  return [
    // Compact "good vs lazy" pair the LLM can pattern-match against. The
    // example is intentionally dense so the model sees rich layouts as
    // the baseline expectation.
    `# Project status dashboard\nroot          = Stack([statusBanner, dashHeader, kpis, projectsBoard, statusFollowUps])\nstatusBanner  = Banner("Quarterly review is open", "Submit your team's update by Friday.", Banner_cta, "🎯", "primary")\nBanner_cta    = Button("Submit update", Action([@Run(open_submit)]), "primary", "small")\ndashHeader    = PageHeader("Engineering Q3", "12 active projects · 4 at risk", ["Workspace", "Engineering", "Q3"], dashActions, dashStatus)\ndashActions   = [Button("Export", Action([@Run(export_q3)]), "secondary"), Button("New project", Action([@Run(new_project)]), "primary")]\ndashStatus    = Badge("On track", "success")\nkpis          = MetricGrid([kpiOpen, kpiAtRisk, kpiDone, kpiOnTime])\nkpiOpen       = StatCard("Active", "12", "flat", "0 vs last week")\nkpiAtRisk     = StatCard("At risk", "4", "up", "+2")\nkpiDone       = StatCard("Shipped", "8", "up", "+3")\nkpiOnTime     = StatCard("On-time", "87%", "down", "-3%")\nprojectsBoard = KanbanBoard([colTodo, colDoing, colReview, colDone])\ncolTodo       = KanbanColumn("To do",      [cardA, cardB], "default")\ncolDoing      = KanbanColumn("In progress",[cardC],        "primary")\ncolReview     = KanbanColumn("In review",  [cardD],        "warning")\ncolDone       = KanbanColumn("Done",       [cardE],        "success")\ncardA         = KanbanCard("Migrate auth to new SDK", "Track auth → SDK rollout across services.", ["auth","p1"], "Asha P.", "primary")\ncardB         = KanbanCard("Spike: vector search",    "Compare pgvector vs Qdrant.",                ["research"], "Diego",  "default")\ncardC         = KanbanCard("Streaming UI v2",         "Add 20 components & rich prompt patterns.", ["frontend"], "Alex",   "primary")\ncardD         = KanbanCard("Mobile onboarding",       "Awaiting design review.",                    ["mobile"],  "Wren",   "warning")\ncardE         = KanbanCard("Activity timeline",       "Shipped to 100% of users.",                  ["shipped"], "Mira",   "success")\nstatusFollowUps = FollowUpBlock(["Show at-risk projects", "Compare to Q2", "Who needs help?"])`,
  ];
}

interface ComponentsSectionOptions {
  includeScripting: boolean;
  includeRouting: boolean;
}

const SCRIPTING_GROUP_NAMES = new Set(["Scripting"]);
const SCRIPTING_COMPONENT_NAMES = new Set(["Script"]);
const ROUTING_GROUP_NAMES = new Set(["Routing"]);
const ROUTING_COMPONENT_NAMES = new Set(["Routes", "Route", "NavLink"]);

function componentsSection(library: ComponentLibrary, options: ComponentsSectionOptions): string {
  const allGroups = library.componentGroups ?? [{ name: "Components", components: library.components.map((c) => c.name) }];
  const groups = allGroups.filter((g) => {
    if (!options.includeScripting && SCRIPTING_GROUP_NAMES.has(g.name)) return false;
    if (!options.includeRouting && ROUTING_GROUP_NAMES.has(g.name)) return false;
    return true;
  });
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
  // Append any components not in a group, skipping scripting and routing
  // ones unless the corresponding feature is explicitly enabled.
  const grouped = new Set<string>(allGroups.flatMap((g) => g.components));
  const ungrouped = library.components.filter((c) => {
    if (grouped.has(c.name)) return false;
    if (!options.includeScripting && SCRIPTING_COMPONENT_NAMES.has(c.name)) return false;
    if (!options.includeRouting && ROUTING_COMPONENT_NAMES.has(c.name)) return false;
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
The host has opted in with \`enable-javascript="true"\`. You may now emit JavaScript through two surfaces. **Reach for plain Streaming UI Script first** — \`$variables\`, \`Query\`/\`Mutation\`, and \`Action([@Set,@Run,@Reset,@ToAssistant,@OpenUrl])\` already cover most behaviour. Only emit JS when the requested feature truly needs it (timers, fetch you control, DOM focus/scroll, clipboard, keyboard shortcuts, animation, sub-second polling).

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

function routingSection(): string {
  return `## Routing (multi-page navigation)
The host has opted in with \`enable-routes="true"\`. You can now build multi-page UIs that synchronise with the URL hash (\`#/path\`). Browser back/forward, bookmarks, and direct deep links all work.

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

function closingSection(enableJavascript: boolean, enableRoutes: boolean): string {
  const base = `## Output rules
- Output ONLY Streaming UI Script lines (or a fenced \`\`\`streaming-ui-script block when inline mode is enabled).
- Always start with \`root = ...\` on the very first line.
- Prefer many small, named statements over deeply nested inline expressions — small statements stream in one at a time and render as soon as they complete.
- Order statements top-down: \`root\` first, then the components it references, then leaf data values last.
- **Reach for pattern composites** (\`Hero\`, \`PageHeader\`, \`MetricGrid\`, \`FeatureGrid\`, \`Timeline\`, \`KanbanBoard\`, \`EmptyState\`, \`ProfileCard\`, \`Testimonial\`, \`Banner\`, \`Comment\`) before composing equivalent layouts by hand. They render with the right spacing, hierarchy, and tone automatically.
- **Use \`Grid\` for uniform card rows** (KPIs, tiles, features). Reserve \`Stack(direction="row")\` for asymmetric side-by-side content.
- **Decorate with status.** Every PageHeader gets a status \`Badge\` or \`Tag\` when relevant. Every StatCard/FeatureItem/Banner gets an icon (emoji string).
- **Use Avatars for people.** Author, assignee, commenter names render as \`Avatar(...)\` (or via \`Comment\` / \`ProfileCard\` which include one). Never plain text.
- Use the smallest set of components that satisfies the request — but the request is rarely satisfied by a single Card. Most responses use 4–8 named sections.
- While using the icons, it should be emoji strings only.
- Do not invent component names that are not in the list above.`;
  const lines: string[] = [base];
  if (enableJavascript) {
    lines.push(`- Only emit \`Script(...)\` / \`@Js(...)\` when behaviour cannot be expressed with \`$variables\` + \`Action([...])\`. Default to the declarative path.
- Place \`Script(...)\` definitions AFTER the visible UI in your statement order so the shell renders before scripts execute.
- Prefer backtick-quoted bodies (\`\`...\`\`) for any \`Script\` body longer than one line — they allow real newlines and unescaped double quotes, eliminating the most common parse errors.
- Every \`Script(...)\` MUST have a string id as the first argument and a body as the second. Never omit the id. Never reuse an id within a single response.`);
  }
  if (enableRoutes) {
    lines.push(`- Only use \`Routes(...)\`, \`Route(...)\`, \`NavLink(...)\`, and \`@Navigate(...)\` when the response actually needs multiple pages. A single-page UI never needs them.
- When you do use routing, \`Routes([...])\` MUST be reached from \`root\` (typically \`root = Stack([navBar, mainOutlet])\` where \`mainOutlet = Routes([...])\`).
- Always include a fallback \`Route("*", notFoundPage)\` (or set the \`default\` argument of \`Routes\`) so unknown paths render a sensible 404 instead of an empty screen.
- Never declare \`$route\` yourself — the runtime owns it. Read \`$route\` anywhere you need to react to the current path.`);
  }
  return lines.join("\n");
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
