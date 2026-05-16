/**
 * Snippet templates for common Streaming UI Script composites.
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
    name: "Card",
    description: "Card with header + body block.",
    template:
      'card${1} = Card([\n' +
      '  CardHeader("${2:Title}", "${3:Subtitle}"),\n' +
      '  CardBody([\n' +
      '    TextContent("${4:Body copy goes here.}")\n' +
      '  ])\n' +
      '])',
  },
  {
    name: "Hero",
    description: "Landing-page hero with eyebrow, title, subtitle, and a CTA.",
    template:
      'hero${1} = Hero(\n' +
      '  "${2:Ship faster}",\n' +
      '  "${3:From idea to production in minutes.}",\n' +
      '  Button("${4:Get started}", Action([@Run(start)]), "primary"),\n' +
      '  Button("${5:Live demo}", Action([@Run(open_demo)]), "ghost"),\n' +
      '  "${6:v2 launch}"\n' +
      ')',
  },
  {
    name: "PageHeader",
    description: "Dashboard page header with breadcrumbs and actions.",
    template:
      'header${1} = PageHeader(\n' +
      '  "${2:Page title}",\n' +
      '  "${3:Subtitle / meta line}",\n' +
      '  ["${4:Workspace}", "${5:Section}"],\n' +
      '  [Button("${6:Action}", Action([@Run(run_action)]), "primary")],\n' +
      '  Badge("${7:On track}", "success")\n' +
      ')',
  },
  {
    name: "MetricGrid",
    description: "Responsive KPI strip with four StatCards.",
    template:
      'metrics${1} = MetricGrid([\n' +
      '  StatCard("${2:Active}", "${3:12}", "flat"),\n' +
      '  StatCard("${4:At risk}", "${5:4}", "up", "+2"),\n' +
      '  StatCard("${6:Shipped}", "${7:8}", "up", "+3"),\n' +
      '  StatCard("${8:On-time}", "${9:87%}", "down", "-3%")\n' +
      '])',
  },
  {
    name: "KanbanBoard",
    description: "Three-column kanban board with sample cards.",
    template:
      'board${1} = KanbanBoard([\n' +
      '  KanbanColumn("To do", [\n' +
      '    KanbanCard("${2:Migrate auth}", "${3:Roll out the new SDK.}", ["auth"], "${4:Asha}")\n' +
      '  ]),\n' +
      '  KanbanColumn("Doing", [\n' +
      '    KanbanCard("${5:Streaming UI v2}", "${6:Ship 20 new components.}", ["frontend"], "${7:Alex}", "primary")\n' +
      '  ]),\n' +
      '  KanbanColumn("Done", [\n' +
      '    KanbanCard("${8:Activity timeline}", "${9:Shipped to 100%.}", ["shipped"], "${10:Mira}", "success")\n' +
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
    name: "Routes",
    description: "Multi-page routing skeleton.",
    template:
      'nav${1} = Stack([\n' +
      '  NavLink("Home",      "/",          "ghost", true),\n' +
      '  NavLink("Dashboard", "/dashboard", "ghost"),\n' +
      '  NavLink("Users",     "/users",     "ghost")\n' +
      '], "row", "s")\n\n' +
      'main = Routes([\n' +
      '  Route("/",           homePage),\n' +
      '  Route("/dashboard",  dashboardPage),\n' +
      '  Route("/users/:id",  userPage),\n' +
      '  Route("*",           notFoundPage)\n' +
      '], "/")\n\n' +
      'homePage      = Card([CardHeader("Welcome")])\n' +
      'dashboardPage = Card([CardHeader("Dashboard")])\n' +
      'userPage      = Card([CardHeader("User " + params.id)])\n' +
      'notFoundPage  = Callout("warning", "Not found", "We couldn\'t find " + $route + ".")',
  },
  {
    name: "Script",
    description: "Lifecycle-managed Script with cleanup.",
    template:
      'scriptId${1} = Script("${2:effect}", `\n' +
      '  const id = setInterval(() => {\n' +
      '    ctx.state.set("${3:now}", new Date().toISOString());\n' +
      '  }, 1000);\n' +
      '  return () => clearInterval(id);\n' +
      '`, ["${3:now}"])',
  },
  {
    name: "JsHandler",
    description: "@Js action that captures per-row data via args.",
    template:
      'row = Card([Stack([\n' +
      '  TextContent(item.text),\n' +
      '  Button("Delete", Action([\n' +
      '    @Js(`\n' +
      '      const list = ctx.state.get("${1:items}") || [];\n' +
      '      ctx.state.set("${1:items}", list.filter(x => x.id !== ctx.args.id));\n' +
      '    `, {id: item.id})\n' +
      '  ]))\n' +
      '])])',
  },
  {
    name: "Each",
    description: "Render an array as a list using @Each.",
    template:
      'list${1} = @Each($items, "item", row)\n' +
      'row = Card([TextContent(item.${2:name})])',
  },
  {
    name: "FormReactive",
    description: "Two-way bound input with submit action.",
    template:
      '$draft = ""\n' +
      'form${1} = Stack([\n' +
      '  Input("${2:draft}", "What needs doing?", "text", null, $draft),\n' +
      '  Button("Add", Action([\n' +
      '    @Set($items, @Push($items, {id: $items.length + 1, text: $draft})),\n' +
      '    @Reset($draft)\n' +
      '  ]), "primary")\n' +
      '])',
  },
  {
    name: "Theme",
    description: "Brand-style theme override applied on top of the base theme.",
    template:
      'theme = Theme({\n' +
      '  colorPrimary:       "${1:#0969da}",\n' +
      '  colorPrimaryHover:  "${2:#0860c4}",\n' +
      '  colorBg:            "${3:#ffffff}",\n' +
      '  colorText:          "${4:#1f2328}",\n' +
      '  fontFamily:         "${5:-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", sans-serif}",\n' +
      '  fontFamilyHeading:  "${6:-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", sans-serif}",\n' +
      '  radiusButton:       "${7:6px}",\n' +
      '  radiusInput:        "${8:6px}",\n' +
      '  buttonFontWeight:   "${9:500}"\n' +
      '})',
  },
];

export function getSnippets(): readonly SnippetEntry[] {
  return snippetCatalog;
}
