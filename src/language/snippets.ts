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
    description: "Top-level `_app_` binding — every program needs one.",
    template:
      '_app_ = Stack([\n' +
      '  ${1:Card([CardHeader("${2:Hello}")])}\n' +
      '])',
  },
  {
    name: "Card",
    description: "Card with header + body block.",
    template:
      'card${1} = Card([\n' +
      '  CardHeader("${2:Title}", subtitle: "${3:Subtitle}"),\n' +
      '  Stack([\n' +
      '    Text("${4:Body copy goes here.}")\n' +
      '  ])\n' +
      '])',
  },
  {
    name: "Hero",
    description: "Landing-page hero with eyebrow, title, subtitle, and a CTA.",
    template:
      'action ${4:Start}() { _route_.navigate("/start") }\n' +
      'action ${5:OpenDemo}() { _route_.navigate("/demo") }\n' +
      'hero${1} = Hero(\n' +
      '  "${2:Ship faster}",\n' +
      '  subtitle: "${3:From idea to production in minutes.}",\n' +
      '  primary: Button("${6:Get started}", action: ${4:Start}, variant: "primary"),\n' +
      '  secondary: Button("${7:Live demo}", action: ${5:OpenDemo}, variant: "ghost"),\n' +
      '  eyebrow: "${8:v2 launch}"\n' +
      ')',
  },
  {
    name: "PageHeader",
    description: "Dashboard page header with breadcrumbs and actions.",
    template:
      'action ${6:RunAction}() { /* TODO: implement */ }\n' +
      'header${1} = PageHeader(\n' +
      '  "${2:Page title}",\n' +
      '  subtitle: "${3:Subtitle / meta line}",\n' +
      '  breadcrumbs: ["${4:Workspace}", "${5:Section}"],\n' +
      '  actions: [Button("${7:Action}", action: ${6:RunAction}, variant: "primary")],\n' +
      '  status: Badge("${8:On track}", variant: "success")\n' +
      ')',
  },
  {
    name: "Stats",
    description: "Responsive KPI strip with four StatCards.",
    template:
      'metrics${1} = Stats([\n' +
      '  StatCard("${2:Active}", value: "${3:12}", trend: "flat"),\n' +
      '  StatCard("${4:At risk}", value: "${5:4}", trend: "up", delta: "+2"),\n' +
      '  StatCard("${6:Shipped}", value: "${7:8}", trend: "up", delta: "+3"),\n' +
      '  StatCard("${8:On-time}", value: "${9:87%}", trend: "down", delta: "-3%")\n' +
      '])',
  },
  {
    name: "GridLayout",
    description: "12-column sidebar layout with named GridItem spans.",
    template:
      'sidebar${1} = Card([CardHeader("${2:Sidebar}")])\n' +
      'main${1}    = Card([CardHeader("${3:Main}")])\n' +
      '_app_ = Grid([\n' +
      '  GridItem(sidebar${1}, span: "1/4"),\n' +
      '  GridItem(main${1}, span: "3/4")\n' +
      '], columns: 12, gap: "l")',
  },
  {
    name: "KanbanBoard",
    description: "Three-column kanban board with sample cards.",
    template:
      'board${1} = KanbanBoard([\n' +
      '  KanbanColumn("To do", items: [\n' +
      '    KanbanCard("${2:Migrate auth}", description: "${3:Roll out the new SDK.}", tags: ["auth"], assignee: "${4:Asha}")\n' +
      '  ]),\n' +
      '  KanbanColumn("Doing", items: [\n' +
      '    KanbanCard("${5:Streaming UI v2}", description: "${6:Ship 20 new components.}", tags: ["frontend"], assignee: "${7:Alex}", tone: "primary")\n' +
      '  ]),\n' +
      '  KanbanColumn("Done", items: [\n' +
      '    KanbanCard("${8:Activity timeline}", description: "${9:Shipped to 100%.}", tags: ["shipped"], assignee: "${10:Mira}", tone: "success")\n' +
      '  ])\n' +
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
    description: "Multi-page router via _router_({…}) with NavLink sidebar.",
    template:
      'pages = _router_({\n' +
      '  "/":            homePage(),\n' +
      '  "/dashboard":   dashboardPage(),\n' +
      '  "/users/:id":   userPage(id: params.id),\n' +
      '  "/docs/*":      docsPage(rest: params._),\n' +
      '  default:        notFoundPage()\n' +
      '})\n\n' +
      'component homePage() {\n' +
      '  return Card([CardHeader("Welcome")])\n' +
      '}\n' +
      'component dashboardPage() {\n' +
      '  return Card([CardHeader("Dashboard")])\n' +
      '}\n' +
      'component userPage(id) {\n' +
      '  return Card([CardHeader(`User ${id}`)])\n' +
      '}\n' +
      'component docsPage(rest) {\n' +
      '  return Card([CardHeader(`Docs · ${rest}`)])\n' +
      '}\n' +
      'component notFoundPage() {\n' +
      '  return Callout("Not found", variant: "warning", description: `We couldn\'t find ${_route_.path}.`)\n' +
      '}\n\n' +
      'nav${1} = Stack([\n' +
      '  NavLink("Home",      to: "/",          variant: "ghost", exact: true),\n' +
      '  NavLink("Dashboard", to: "/dashboard", variant: "ghost"),\n' +
      '  NavLink("Users",     to: "/users",     variant: "ghost")\n' +
      '], direction: "row", gap: "s")',
  },
  {
    name: "Effect",
    description: "Lifecycle-managed effect (clock/interval) with cleanup.",
    template:
      '$${3:now} = ""\n\n' +
      'effect [on:mount] {\n' +
      '  let id = js{ setInterval(() => helpers.setState("${3:now}", new Date().toISOString()), 1000) }\n' +
      '  cleanup { js{ clearInterval(id) } }\n' +
      '}\n\n' +
      'body = Text($${3:now})',
  },
  {
    name: "Action",
    description: "Action declaration that POSTs through the http() builtin.",
    template:
      '$${1:items} = []\n\n' +
      'action Add(text) {\n' +
      '  $${1:items} = [...$${1:items}, { id: $${1:items}.length + 1, text: text }]\n' +
      '  $response = http({ url: "/api/save", method: "POST", body: { item: { text: text } } })\n' +
      '}',
  },
  {
    name: "Each",
    description: "Iterate over an array using the expression-form `for` loop.",
    template:
      'list${1} = for item in $items {\n' +
      '  Card([Text(item.${2:name})])\n' +
      '}',
  },
  {
    name: "FormReactive",
    description: "Two-way bound input with submit action.",
    template:
      '$draft = ""\n' +
      '$items = []\n\n' +
      'action Add() {\n' +
      '  $items = [...$items, { id: $items.length + 1, text: $draft }]\n' +
      '  $draft = ""\n' +
      '}\n\n' +
      'form${1} = Stack([\n' +
      '  Input("${2:draft}", placeholder: "What needs doing?", type: "text", value: $draft),\n' +
      '  Button("Add", action: Add, variant: "primary")\n' +
      '])',
  },
  {
    name: "Theme",
    description: "Brand-style theme override applied on top of the base theme.",
    template:
      'theme = Theme({\n' +
      '  name: "${1:brand}",\n' +
      '  colors: {\n' +
      '    primary:      "${2:#0969da}",\n' +
      '    primaryHover: "${3:#0860c4}",\n' +
      '    bg:           "${4:#ffffff}",\n' +
      '    text:         "${5:#1f2328}"\n' +
      '  },\n' +
      '  radius: { button: "${6:6px}", input: "${7:6px}" },\n' +
      '  font: {\n' +
      '    family:  "${8:-apple-system, BlinkMacSystemFont, sans-serif}",\n' +
      '    heading: "${9:-apple-system, BlinkMacSystemFont, sans-serif}"\n' +
      '  }\n' +
      '})',
  },
  {
    name: "Component",
    description: "Reusable component declaration — components MUST `return`.",
    template:
      'component ${1:UserCard}(${2:user}) {\n' +
      '  return Card([\n' +
      '    Avatar(${2:user}.name),\n' +
      '    Text(${2:user}.role)\n' +
      '  ])\n' +
      '}\n\n' +
      'list = for u in $users { ${1:UserCard}(u) }',
  },
  {
    name: "If",
    description: "Expression-form `if`.",
    template:
      'body${1} = if ${2:condition} {\n' +
      '  ${3:trueBranch}\n' +
      '} else {\n' +
      '  ${4:falseBranch}\n' +
      '}',
  },
  {
    name: "Match",
    description: "Pattern match on a value with arms.",
    template:
      'panel${1} = match ${2:$tab} {\n' +
      '  "overview" : overviewPanel\n' +
      '  "billing"  : billingPanel\n' +
      '  "security" : securityPanel\n' +
      '  default    : overviewPanel\n' +
      '}',
  },
  {
    name: "TemplateLiteral",
    description: "Template literal with `${}` interpolation.",
    template: 'greeting${1} = `Hello ${${2:$user.name}}, you have ${${3:$messages.length}} messages`',
  },
  {
    name: "Http",
    description: "Fire an http() request and bind the reactive resource bag.",
    template:
      '$${1:response} = http({\n' +
      '  url: "${2:/api/items}",\n' +
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
    name: "ResponsiveGrid",
    description: "Grid with a responsive column map per breakpoint.",
    template: 'cards${1} = Grid(${2:items}, columns: {sm: 1, md: 2, lg: 4}, gap: "${3:l}")',
  },
];

export function getSnippets(): readonly SnippetEntry[] {
  return snippetCatalog;
}
