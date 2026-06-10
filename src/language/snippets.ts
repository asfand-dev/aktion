/**
 * Snippet templates for common Aktion composites.
 *
 * Placeholders use `${1:label}` syntax. CodeMirror's `snippet()` from
 * `@codemirror/autocomplete` parses this format natively. Monaco and VS
 * Code do too (it matches the LSP snippet format).
 */

export interface SnippetEntry {
  /** Snippet key — used as the autocomplete completion label. */
  name: string;
  /** Human-readable description shown in the autocomplete popup. */
  description: string;
  /** The template body with `${n:label}` placeholders. */
  template: string;
}

export const snippetCatalog: readonly SnippetEntry[] = [
  {
    name: "App",
    description: "Top-level `$app(...)` root — every program needs one.",
    template:
      '$app(Column([\n' +
      '  ${1:Card([CardHeader("${2:Hello}")])}\n' +
      ']))',
  },
  {
    name: "Card",
    description: "Card with header + body block.",
    template:
      'card${1} = Card([\n' +
      '  CardHeader("${2:Title}", { subtitle: "${3:Subtitle}" }),\n' +
      '  Column([\n' +
      '    Text("${4:Body copy goes here.}")\n' +
      '  ])\n' +
      '])',
  },
  {
    name: "Row",
    description: "Horizontal toolbar — label on the left, actions pushed to the right.",
    template:
      'toolbar${1} = Row([\n' +
      '  Text("${2:Section title}", { variant: "large-heavy" }),\n' +
      '  Spacer(),\n' +
      '  Button("${3:Action}", { variant: "primary" })\n' +
      '], { gap: "m" })',
  },
  {
    name: "Center",
    description: "Center content on both axes inside a tall region.",
    template:
      'empty${1} = Center([\n' +
      '  EmptyState("${2:Nothing here yet}", { description: "${3:Create your first item to get started.}" })\n' +
      '], { minHeight: "${4:50vh}" })',
  },
  {
    name: "Hero",
    description: "Landing-page hero with eyebrow, title, subtitle, and a CTA.",
    template:
      'function ${4:start}() { route.navigate("/start") }\n' +
      'function ${5:openDemo}() { route.navigate("/demo") }\n' +
      'hero${1} = Hero(\n' +
      '  "${2:Ship faster}",\n' +
      '  { subtitle: "${3:From idea to production in minutes.}",\n' +
      '    primary: Button("${6:Get started}", { action: ${4:start}, variant: "primary" }),\n' +
      '    secondary: Button("${7:Live demo}", { action: ${5:openDemo}, variant: "ghost" }),\n' +
      '    eyebrow: "${8:v2 launch}" }\n' +
      ')',
  },
  {
    name: "PageHeader",
    description: "Dashboard page header with breadcrumbs and actions.",
    template:
      'function ${6:runAction}() { /* TODO: implement */ }\n' +
      'header${1} = PageHeader(\n' +
      '  "${2:Page title}",\n' +
      '  { subtitle: "${3:Subtitle / meta line}",\n' +
      '    breadcrumbs: ["${4:Workspace}", "${5:Section}"],\n' +
      '    actions: [Button("${7:Action}", { action: ${6:runAction}, variant: "primary" })],\n' +
      '    status: Badge("${8:On track}", { variant: "success" }) }\n' +
      ')',
  },
  {
    name: "Stats",
    description: "Responsive KPI strip with four StatCards.",
    template:
      'metrics${1} = Stats([\n' +
      '  StatCard("${2:Active}", { value: "${3:12}", trend: "flat" }),\n' +
      '  StatCard("${4:At risk}", { value: "${5:4}", trend: "up", delta: "+2" }),\n' +
      '  StatCard("${6:Shipped}", { value: "${7:8}", trend: "up", delta: "+3" }),\n' +
      '  StatCard("${8:On-time}", { value: "${9:87%}", trend: "down", delta: "-3%" })\n' +
      '])',
  },
  {
    name: "GridLayout",
    description: "12-column sidebar layout with named GridItem spans.",
    template:
      'sidebar${1} = Card([CardHeader("${2:Sidebar}")])\n' +
      'main${1}    = Card([CardHeader("${3:Main}")])\n' +
      '$app(Grid([\n' +
      '  GridItem(sidebar${1}, { span: "1/4" }),\n' +
      '  GridItem(main${1}, { span: "3/4" })\n' +
      '], { columns: 12, gap: "l" }))',
  },
  {
    name: "KanbanBoard",
    description: "Three-column kanban board with sample cards.",
    template:
      'board${1} = KanbanBoard([\n' +
      '  KanbanColumn("To do", { items: [\n' +
      '    KanbanCard("${2:Migrate auth}", { description: "${3:Roll out the new SDK.}", tags: ["auth"], assignee: "${4:Asha}" })\n' +
      '  ] }),\n' +
      '  KanbanColumn("Doing", { items: [\n' +
      '    KanbanCard("${5:Streaming UI v2}", { description: "${6:Ship 20 new components.}", tags: ["frontend"], assignee: "${7:Alex}", tone: "primary" })\n' +
      '  ] }),\n' +
      '  KanbanColumn("Done", { items: [\n' +
      '    KanbanCard("${8:Activity timeline}", { description: "${9:Shipped to 100%.}", tags: ["shipped"], assignee: "${10:Mira}", tone: "success" })\n' +
      '  ] })\n' +
      '])',
  },
  {
    name: "FollowUpBlock",
    description: "Chat follow-up prompts.",
    template:
      'follow${1} = FollowUpBlock([\n' +
      '  FollowUpItem("${2:Show me a chart}"),\n' +
      '  FollowUpItem("${3:Add a filter}"),\n' +
      '  FollowUpItem("${4:Export as CSV}")\n' +
      '])',
  },
  {
    name: "Router",
    description: "Multi-page router via $router({…}) with NavLink sidebar.",
    template:
      'pages = $router({\n' +
      '  "/":            HomePage(),\n' +
      '  "/dashboard":   DashboardPage(),\n' +
      '  "/users/:id":   UserPage(params.id),\n' +
      '  "/docs/*":      DocsPage(params._),\n' +
      '  default:        NotFoundPage()\n' +
      '})\n\n' +
      'function HomePage() {\n' +
      '  return Card([CardHeader("Welcome")])\n' +
      '}\n' +
      'function DashboardPage() {\n' +
      '  return Card([CardHeader("Dashboard")])\n' +
      '}\n' +
      'function UserPage(id) {\n' +
      '  return Card([CardHeader(`User ${id}`)])\n' +
      '}\n' +
      'function DocsPage(rest) {\n' +
      '  return Card([CardHeader(`Docs · ${rest}`)])\n' +
      '}\n' +
      'function NotFoundPage() {\n' +
      '  return Callout("Not found", { variant: "warning", description: `We couldn\'t find ${route.path}.` })\n' +
      '}\n\n' +
      'nav${1} = Row([\n' +
      '  NavLink("Home",      { to: "/",          variant: "ghost", exact: true }),\n' +
      '  NavLink("Dashboard", { to: "/dashboard", variant: "ghost" }),\n' +
      '  NavLink("Users",     { to: "/users",     variant: "ghost" })\n' +
      '], { gap: "s" })',
  },
  {
    name: "Effect",
    description: "Lifecycle-managed effect (clock/interval) with cleanup.",
    template:
      '$${3:now} = ""\n\n' +
      '$effect(() => {\n' +
      '  let id = setInterval(() => { $${3:now} = new Date().toISOString() }, 1000)\n' +
      '  cleanup(() => clearInterval(id))\n' +
      '}, ["mount"])\n\n' +
      'body = Text($${3:now})',
  },
  {
    name: "Action",
    description: "Action declaration that POSTs through the $http() builtin.",
    template:
      '$${1:items} = []\n\n' +
      'function add(text) {\n' +
      '  $${1:items} = [...$${1:items}, { id: $${1:items}.length + 1, text: text }]\n' +
      '  $response = $http({ url: "https://api.example.com/save", method: "POST", body: { item: { text: text } } })\n' +
      '}',
  },
  {
    name: "MapList",
    description: "Map an array of items into a list of components using `.map`.",
    template:
      'list${1} = $items.map(item => Card([Text(item.${2:name})]))',
  },
  {
    name: "ForLoop",
    description: "Iterate over an array statement-style — usable in a function body.",
    template:
      'function build${1:List}() {\n' +
      '  let out = []\n' +
      '  for (let item of $items) {\n' +
      '    out.push(Card([Text(item.${2:name})]))\n' +
      '  }\n' +
      '  return Column(out)\n' +
      '}',
  },
  {
    name: "FormReactive",
    description: "Two-way bound input with submit action.",
    template:
      '$draft = ""\n' +
      '$items = []\n\n' +
      'function add() {\n' +
      '  $items = [...$items, { id: $items.length + 1, text: $draft }]\n' +
      '  $draft = ""\n' +
      '}\n\n' +
      'form${1} = Column([\n' +
      '  Input("${2:draft}", { placeholder: "What needs doing?", type: "text", value: $draft }),\n' +
      '  Button("Add", { action: add, variant: "primary" })\n' +
      '])',
  },
  {
    name: "Theme",
    description: "Brand-style theme override applied on top of the base theme.",
    template:
      '$theme({\n' +
      '  name: "${1:brand}",\n' +
      '  colors: {\n' +
      '    primary:      "${2:#0969da}",\n' +
      '    primaryHover: "${3:#0860c4}",\n' +
      '    bg:           "${4:#ffffff}",\n' +
      '    text:         "${5:#1f2328}"\n' +
      '  },\n' +
      '  radius: { button: "${6:6px}", input: "${7:6px}" },\n' +
      '  font: { family: "${8:-apple-system, BlinkMacSystemFont, sans-serif}" }\n' +
      '})',
  },
  {
    name: "Component",
    description: "Reusable component declaration — first-letter case is not significant; a function with no `return` simply renders nothing.",
    template:
      'function ${1:UserCard}(${2:user}) {\n' +
      '  return Card([\n' +
      '    Avatar(${2:user}.name),\n' +
      '    Text(${2:user}.role)\n' +
      '  ])\n' +
      '}\n\n' +
      'list = $users.map(u => ${1:UserCard}(u))',
  },
  {
    name: "Ternary",
    description: "Pick between two expressions — the JS way to express a value-producing if.",
    template:
      'body${1} = ${2:condition} ? ${3:trueBranch} : ${4:falseBranch}',
  },
  {
    name: "IfStatement",
    description: "Imperative `if (cond) { … } else { … }` — usable inside function / effect bodies.",
    template:
      'if (${1:condition}) {\n' +
      '  ${2:// then branch}\n' +
      '} else {\n' +
      '  ${3:// else branch}\n' +
      '}',
  },
  {
    name: "SwitchStatement",
    description: "Switch on a value with case/default/break — statement form.",
    template:
      'switch (${1:$tab}) {\n' +
      '  case "overview": ${2:// …}; break\n' +
      '  case "billing":  ${3:// …}; break\n' +
      '  case "security": ${4:// …}; break\n' +
      '  default: ${5:// …}\n' +
      '}',
  },
  {
    name: "TemplateLiteral",
    description: "Template literal with `${}` interpolation.",
    template: 'greeting${1} = `Hello ${${2:$user.name}}, you have ${${3:$messages.length}} messages`',
  },
  {
    name: "Http",
    description: "Fire an $http() request and bind the reactive resource bag.",
    template:
      '$${1:response} = $http({\n' +
      '  url: "${2:https://api.example.com/items}",\n' +
      '  method: "${3:GET}",\n' +
      '  headers: { "Content-Type": "application/json" }\n' +
      '})',
  },
  {
    name: "State",
    description: "Reactive state atom — declared with `$name = value`.",
    template: '$${1:name} = ${2:"default"}',
  },
  {
    name: "Store",
    description: "Global store — colocated state + actions shared across components (like Zustand/Pinia).",
    template:
      '${1:cart} = $store({\n' +
      '  ${2:items}: [],\n' +
      '  ${3:count}: (s) => s.${2:items}.length,\n' +
      '  ${4:add}: (s, item) => { s.${2:items} = [...s.${2:items}, item] },\n' +
      '})',
  },
  {
    name: "useState",
    description: "`$state` hook — per-instance state with a [value, setValue] pair (like React's useState).",
    template: 'const [${1:value}, set${2:Value}] = $state(${3:"default"})',
  },
  {
    name: "useMemo",
    description: "`$memo` hook — value recomputed only when a dependency changes (like React's useMemo).",
    template: 'const ${1:memoized} = $memo(() => ${2:compute}, [${3:deps}])',
  },
  {
    name: "Hook",
    description: "Custom hook declaration — a `$`-prefixed function that composes $state / $memo.",
    template:
      'function $use${1:Counter}(${2:start}) {\n' +
      '  const [${3:count}, set${4:Count}] = $state(${2:start})\n' +
      '  return { ${3:count}: ${3:count}, increment: () => set${4:Count}(v => v + 1) }\n' +
      '}',
  },
  {
    name: "ResponsiveGrid",
    description: "Grid with a responsive column map per breakpoint.",
    template: 'cards${1} = Grid(${2:items}, { columns: {sm: 1, md: 2, lg: 4}, gap: "${3:l}" })',
  },
  // ── New feature snippets ──────────────────────────────────────────────────
  {
    name: "Query",
    description: "$query — cached + deduplicated read with TTL and polling.",
    template:
      '${1:$data} = $query({\n' +
      '  url: "${2:https://api.example.com/items}",\n' +
      '  key: "${3:items}",\n' +
      '  ttl: ${4:30000}\n' +
      '})',
  },
  {
    name: "InfiniteQuery",
    description: "$query infinite mode — paginated list with .loadMore() and .hasMore.",
    template:
      '${1:$feed} = $query({\n' +
      '  url: "${2:https://api.example.com/posts}",\n' +
      '  key: "${3:feed}",\n' +
      '  infinite: { param: "${4:page}", limit: ${5:20}, mode: "${6:page}", select: b => b.${7:items} }\n' +
      '})\n\n' +
      'Button("Load more", { onClick: () => ${1:$feed}.loadMore(), disabled: !${1:$feed}.hasMore })',
  },
  {
    name: "Mutation",
    description: "$mutation — deferred write with optimistic update and cache invalidation.",
    template:
      '${1:$save} = $mutation({\n' +
      '  url: "${2:https://api.example.com/items}",\n' +
      '  optimistic: (o) => { ${3:$items} = [...${3:$items}, o.body] },\n' +
      '  invalidates: ["${4:items}"]\n' +
      '})\n\n' +
      'Button("${5:Save}", { onClick: () => ${1:$save}.mutate({ body: { ${6:title}: ${7:$title} } }) })',
  },
  {
    name: "Form",
    description: "$form — managed form with $util.rules validators and handleSubmit().",
    template:
      '${1:form} = $form({\n' +
      '  values: { ${2:email}: "", ${3:password}: "" },\n' +
      '  rules: {\n' +
      '    ${2:email}:    [$util.rules.required(), $util.rules.email()],\n' +
      '    ${3:password}: [$util.rules.required(), $util.rules.minLength(8)]\n' +
      '  },\n' +
      '  onSubmit: (v) => { ${4:// handle submit} }\n' +
      '})\n\n' +
      'Column([\n' +
      '  Input("${2:email}", { label: "${5:Email}", value: ${1:form}.values.${2:email}, error: ${1:form}.errors.${2:email}, onBlur: () => ${1:form}.touch("${2:email}") }),\n' +
      '  Button("${6:Submit}", { onClick: () => ${1:form}.handleSubmit(), disabled: ${1:form}.submitting })\n' +
      '])',
  },
  {
    name: "Socket",
    description: "$socket — reactive WebSocket bag (.connected / .last / .messages / .send()).",
    template:
      '${1:$chat} = $socket({\n' +
      '  url: "${2:wss://example.com/room/42}",\n' +
      '  bufferSize: ${3:50}\n' +
      '})\n\n' +
      'Button("Send", { onClick: () => ${1:$chat}.send({ text: ${4:$draft} }) })',
  },
  {
    name: "Sse",
    description: "$sse — reactive Server-Sent Events stream (.connected / .last / .messages).",
    template:
      '${1:$stream} = $sse({\n' +
      '  url: "${2:https://api.example.com/events}",\n' +
      '  event: "${3:message}"\n' +
      '})',
  },
  {
    name: "Persist",
    description: "$store with persist + history — survives reload with undo/redo.",
    template:
      '${1:doc} = $store({\n' +
      '  persist: "${2:my-doc}",\n' +
      '  history: true,\n' +
      '  ${3:title}: "",\n' +
      '  set${4:Title}: (s, v) => { s.${3:title} = v }\n' +
      '})\n\n' +
      'Button("Undo", { onClick: () => ${1:doc}.undo(), disabled: !${1:doc}.canUndo })',
  },
  {
    name: "SxCard",
    description: "Card using the sx styling channel — responsive, interaction states, gradient.",
    template:
      'Card([Text("${1:Content}")], {\n' +
      '  sx: {\n' +
      '    p: "${2:l}",\n' +
      '    radius: "${3:lg}",\n' +
      '    bg: "${4:surface}",\n' +
      '    shadow: "${5:md}",\n' +
      '    states: { hover: { scale: ${6:1.03}, shadow: "${7:lg}" } }\n' +
      '  }\n' +
      '})',
  },
  {
    name: "SxResponsive",
    description: "sx with responsive breakpoint maps + logical spacing (RTL-safe).",
    template:
      'Box([${1:children}], {\n' +
      '  sx: {\n' +
      '    p: { base: "${2:m}", md: "${3:xl}" },\n' +
      '    direction: { base: "column", lg: "row" },\n' +
      '    px: "${4:l}",\n' +
      '    fontSize: "${5:lg}",\n' +
      '    weight: "${6:600}"\n' +
      '  }\n' +
      '})',
  },
  {
    name: "FormAsync",
    description: "$form with an async uniqueness rule + validating/submitting states.",
    template:
      '${1:form} = $form({\n' +
      '  values: { ${2:user}: "" },\n' +
      '  rules: { ${2:user}: [$util.rules.required(), $util.rules.asyncCustom((v) => ${3:checkAvailable}(v), "${4:Already taken}")] },\n' +
      '  onSubmit: (values) => ${5:save}(values)\n' +
      '})\n\n' +
      'Column([\n' +
      '  Input("${2:user}", { value: ${1:form}.values.${2:user}, error: ${1:form}.errors.${2:user}, label: "${6:Username}", onBlur: () => ${1:form}.touch("${2:user}") }),\n' +
      '  Button("Submit", { onClick: () => ${1:form}.submit(), disabled: ${1:form}.submitting || ${1:form}.validating, loading: ${1:form}.submitting })\n' +
      '])',
  },
  {
    name: "SocketReconnect",
    description: "$socket with auto-reconnect + status-driven UI.",
    template:
      '${1:$chat} = $socket({ url: "${2:wss://example.com/room}", reconnect: true })\n\n' +
      'Column([\n' +
      '  Badge(${1:$chat}.status, { tone: ${1:$chat}.status == "open" ? "success" : "warning" }),\n' +
      '  List(${1:$chat}.messages.map((m) => ListItem(m.text))),\n' +
      '  Row([\n' +
      '    Input("draft", { value: ${3:$draft} }),\n' +
      '    Button("Send", { onClick: () => { ${1:$chat}.send({ text: ${3:$draft} }); ${3:$draft} = "" } })\n' +
      '  ], { gap: "s" })\n' +
      '])',
  },
  {
    name: "MarketingSection",
    description: "Landing-page band: Section + eyebrow/title/subtitle + Metric strip.",
    template:
      'Section([\n' +
      '  MetricStrip([\n' +
      '    Metric("${1:170+}", { label: "${2:Components}", countUp: true }),\n' +
      '    Metric("${3:7}", { label: "${4:Themes}", countUp: true })\n' +
      '  ], { columns: ${5:2} })\n' +
      '], {\n' +
      '  eyebrow: "${6:Why teams switch}",\n' +
      '  title: "${7:Everything a frontend needs}",\n' +
      '  subtitle: "${8:Components, state, routing, theming and data — built in.}",\n' +
      '  background: "${9:soft}", align: "center"\n' +
      '})',
  },
  {
    name: "ConfirmDanger",
    description: "ConfirmDialog gated destructive action (Escape cancels, focus lands on Cancel).",
    template:
      '$confirmOpen = false\n\n' +
      'Column([\n' +
      '  Button("${1:Delete}", { tone: "danger", onClick: () => { $confirmOpen = true } }),\n' +
      '  ConfirmDialog("${2:Delete item?}", {\n' +
      '    open: $confirmOpen,\n' +
      '    message: "${3:This cannot be undone.}",\n' +
      '    tone: "danger",\n' +
      '    onConfirm: () => ${4:remove}(),\n' +
      '    onCancel: () => {}\n' +
      '  })\n' +
      '])',
  },
];

export function getSnippets(): readonly SnippetEntry[] {
  return snippetCatalog;
}
