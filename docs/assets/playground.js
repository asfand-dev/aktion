/**
 * Aktion playground.
 *
 * Single-page IDE-style playground built on CodeMirror 6 (loaded from
 * esm.sh) and the language spec exported by `src/language/`. Wiring:
 *   - editor: custom StreamLanguage + autocomplete + linter + snippets
 *   - viewer: live <aktion-app> element
 *   - inspect: hover overlay + click-to-jump to source line
 *   - persistence: localStorage under `rui:playground:*`
 *   - URL share: gzipped+base64 program in #code=
 *
 * No build step — this file is shipped as-is to GitHub Pages.
 */

import {
  parse,
  getLanguageSpec,
} from "../../dist/aktion.js";

// Public CDN URL embedded in standalone HTML exports so the downloaded file
// runs anywhere without a local build step. Mirrors the constant used by
// `chat-bot.js`.
const CDN_BUNDLE = "https://asfand-dev.github.io/aktion/dist/aktion.js";

// ---------------------------------------------------------------------------
// CodeMirror 6 — dynamic import from esm.sh

const CM_VER = {
  state: "6.5.0",
  view: "6.36.4",
  commands: "6.7.1",
  language: "6.10.3",
  autocomplete: "6.18.3",
  search: "6.5.7",
  lint: "6.8.4",
  highlight: "1.2.1",
};

const ESM = (pkg, ver, deps = []) => {
  const url = new URL(`https://esm.sh/${pkg}@${ver}`);
  if (deps.length) url.searchParams.set("deps", deps.join(","));
  return url.toString();
};

const baseDep = `@codemirror/state@${CM_VER.state}`;
const viewDep = `@codemirror/view@${CM_VER.view}`;
const langDep = `@codemirror/language@${CM_VER.language}`;

async function loadCodeMirror() {
  const [
    state, view, commands, lang, autocomplete, search, lint, highlight,
  ] = await Promise.all([
    import(ESM("@codemirror/state", CM_VER.state)),
    import(ESM("@codemirror/view", CM_VER.view, [baseDep])),
    import(ESM("@codemirror/commands", CM_VER.commands, [baseDep, viewDep])),
    import(ESM("@codemirror/language", CM_VER.language, [baseDep, viewDep])),
    import(ESM("@codemirror/autocomplete", CM_VER.autocomplete, [baseDep, viewDep, langDep])),
    import(ESM("@codemirror/search", CM_VER.search, [baseDep, viewDep])),
    import(ESM("@codemirror/lint", CM_VER.lint, [baseDep, viewDep])),
    import(ESM(`@lezer/highlight`, CM_VER.highlight)),
  ]);
  return { state, view, commands, lang, autocomplete, search, lint, highlight };
}

// ---------------------------------------------------------------------------
// Examples

const EXAMPLES = {
  chat: {
    label: "Chat reply",
    code: `# Highlights: one positional + named args everywhere, template literals, FollowUpBlock dispatch.
_app_ = Stack([greeting, sample, follow])

greeting = Card([
  CardHeader("Hello, world", subtitle: "Edit this text and watch it update")
])

sample = Card([
  CardHeader("Sample stats"),
  Stats([
    StatCard("Active users", value: \`\${@Format(12540, "number")}\`, trend: "up",   delta: "+12% vs last week", icon: "users"),
    StatCard("Revenue",      value: \`\${@Format(48230, "currency", "USD")}\`, trend: "flat", delta: "stable",       icon: "sack-dollar"),
    StatCard("Errors",       value: "12", trend: "down", delta: "-32%", icon: "triangle-exclamation")
  ])
])

follow = FollowUpBlock([
  FollowUpItem("Add a chart"),
  FollowUpItem("Show an alert"),
  FollowUpItem("Export as CSV")
], title: "Try editing")`,
  },
  dashboard: {
    label: "Project dashboard",
    code: `# Highlights: component declaration, for-loop with destructuring, named args, Badge tone alias.
projects = [
  {title: "Migrate auth",      description: "Roll out the new SDK.",   tags: ["auth"],     assignee: "Asha", tone: "default", icon: "shield-halved",       stage: "todo"},
  {title: "Streaming UI v2",   description: "20 new components.",      tags: ["frontend"], assignee: "Alex", tone: "primary", icon: "wand-magic-sparkles", stage: "doing"},
  {title: "Mobile onboarding", description: "Awaiting design review.", tags: ["mobile"],   assignee: "Wren", tone: "warning", icon: "mobile-screen",       stage: "review"},
  {title: "Activity timeline", description: "Shipped to everyone.",    tags: ["shipped"],  assignee: "Mira", tone: "success", icon: "circle-check",        stage: "done"}
]

$atRisk = @Filter(projects, "tone", "==", "warning")

component Card2(p) {
  return KanbanCard(p.title, description: p.description, tags: p.tags, assignee: p.assignee, tone: p.tone, icon: p.icon)
}

_app_ = Stack([
  PageHeader(
    "Engineering Q3",
    subtitle: \`\${@Count(projects)} active · \${@Count($atRisk)} at risk\`,
    breadcrumbs: ["Workspace", "Engineering"],
    status: Badge("On track", tone: "success")
  ),
  Stats([
    StatCard("Active",  value: \`\${@Count(projects)}\`,   trend: "flat", delta: "0 vs last week",                          icon: "folder"),
    StatCard("At risk", value: \`\${@Count($atRisk)}\`,    trend: "up",   delta: "+1 vs last week",                         icon: "triangle-exclamation"),
    StatCard("Shipped", value: "8",                       trend: "up",   delta: "+3 vs last week",                         icon: "rocket"),
    StatCard("On-time", value: "87%",                     trend: "down", delta: "-3% vs last week",                        icon: "clock")
  ]),
  KanbanBoard([
    KanbanColumn("To do",  items: for p in @Filter(projects, "stage", "==", "todo")   { Card2(p) }),
    KanbanColumn("Doing",  items: for p in @Filter(projects, "stage", "==", "doing")  { Card2(p) }, tone: "primary"),
    KanbanColumn("Review", items: for p in @Filter(projects, "stage", "==", "review") { Card2(p) }, tone: "warning"),
    KanbanColumn("Done",   items: for p in @Filter(projects, "stage", "==", "done")   { Card2(p) }, tone: "success")
  ])
])`,
  },
  todo: {
    label: "Reactive todo",
    code: `# Highlights: $-prefixed reactive state, template literals, for-loop destructuring, if expression for empty state.
$todos = [{id: 1, text: "Welcome — try editing. Refresh me, I persist!", done: false}]
$draft = ""

action addTodo() {
  $todos = [...$todos, {id: $todos.length + 1, text: $draft, done: false}]
  $draft = ""
}

component Row(t) {
  return Card([Stack([
    Text(t.text),
    Button("Delete", action: () => { $todos = @Filter($todos, "id", "!=", t.id) }, variant: "ghost", size: "small")
  ], direction: "row", gap: "s", align: "center", justify: "between")])
}

list = for t in $todos { Row(t) }
body = if $todos.length > 0 {
  list
} else {
  EmptyState("Nothing to do", description: "Add a task above to get started.", icon: "list-check")
}

_app_ = Stack([
  Card([CardHeader("Todo list", subtitle: \`\${@Count($todos)} \${@Plural(@Count($todos), "task", "tasks")} · persisted across reloads\`)]),
  Input("draft-input", placeholder: "What needs doing?", value: $draft),
  Button("Add", action: addTodo, variant: "primary"),
  body
])`,
  },
  reactiveApp: {
    label: "Reactive app",
    code: `_app_ = Grid([items, addBtn], 2)

$events = [
  { title: "Product Sync" },
  { title: "Design Review" },
  { title: "Daily Standup" },
]

action removeItem(name) {
  $events = @Filter($events, "title", "!=", name)
}

action addEvent() {
  $events = [...$events, { title: \`New Event \${@Now()}\` }]
}

component Item(name) {
  return Card([
    Text(name),
    Button("Remove", size: "xs", action: () => { removeItem(name) })
  ])
}

addBtn = Card([Button("New Event", variant: "ghost", action: addEvent)])

items = for { title } in $events { Item(title) }`,
  },
  routing: {
    label: "Routing demo",
    code: `# Highlights: _router_({…}) call, params injected per-arm, _route_.path reads, named-arg NavLink.
page = _router_({
  "/":          Card([CardHeader("Welcome", subtitle: "Click a link above to navigate")]),
  "/dashboard": Card([
    CardHeader("Dashboard"),
    Text(\`Live path: \${_route_.path}\`)
  ]),
  "/users/:id": Card([
    CardHeader(\`User \${params.id}\`),
    Text(\`Looking at user \${params.id}\`)
  ]),
  default:      Callout("Not found", tone: "warning", description: \`Nothing here at \${_route_.path}.\`)
})

nav = Stack([
  NavLink("Home",      to: "/",            variant: "ghost"),
  NavLink("Dashboard", to: "/dashboard",   variant: "ghost"),
  NavLink("Alice",     to: "/users/alice", variant: "ghost")
], direction: "row", gap: "s")

_app_ = Stack([nav, page])`,
  },
  counter: {
    label: "JS counter",
    code: `# Highlights: actions assign $atoms directly, @Clamp safe arithmetic, ?? for fallbacks.
$count = 0

action inc() { $count = ($count ?? 0) + 1 }
action dec() { $count = ($count ?? 0) - 1 }
action reset() { $count = 0 }

_app_ = Card([
  CardHeader("JS counter", subtitle: "Three actions, one $atom."),
  Stack([
    Text(\`Current: \${@Clamp($count, -99, 99)}\`),
    Stack([
      Button("-",     action: dec),
      Button("Reset", action: reset, variant: "ghost"),
      Button("+",     action: inc,   variant: "primary")
    ], direction: "row", gap: "s")
  ])
])`,
  },
  chart: {
    label: "Chart + metrics",
    code: `# Highlights: derived totals via @Sum + template literals, responsive Grid for chart row.
$range = "7"
thisWk = [820, 1240, 1500, 1180, 1310, 980, 740]
lastWk = [780, 1180, 1420, 1090, 1240, 920, 690]

_app_ = Stack([
  PageHeader("Analytics", subtitle: \`Daily traffic last \${$range} days\`),
  Stats([
    StatCard("Sessions",     value: \`\${@Format(@Sum(thisWk), "number")}\`, trend: "up",   delta: \`+\${@Round((@Sum(thisWk) / @Sum(lastWk) - 1) * 100, 1)}%\`, icon: "chart-line"),
    StatCard("Avg duration", value: "3m 12s",                              trend: "flat", delta: "stable",                                                     icon: "clock"),
    StatCard("Bounce rate",  value: "32%",                                 trend: "down", delta: "-2%",                                                        icon: "arrow-trend-down")
  ]),
  Grid([
    Card([
      CardHeader("Sessions"),
      LineChart(["Mo","Tu","We","Th","Fr","Sa","Su"],
        series: [Series("This week", values: thisWk), Series("Last week", values: lastWk)])
    ]),
    Card([
      CardHeader("By channel"),
      PieChart(["Organic","Direct","Referral"], values: [60, 25, 15])
    ])
  ], columns: {sm: 1, md: 2}, gap: "l")
])`,
  },
  dataGrid: {
    label: "DataGrid + bulk actions",
    code: `# Highlights: sortable DataGrid, per-column filter chips, $-prefixed selection state, bulk-action toolbar.
$sort = {key: "Score", direction: "desc"}
$selectedIds = []
$page = 1

people = [
  {id: "u01", name: "Ada Lovelace",      team: "Compilers",   score: 98, commits: 412},
  {id: "u02", name: "Linus Torvalds",    team: "Kernel",      score: 96, commits: 380},
  {id: "u03", name: "Grace Hopper",      team: "Compilers",   score: 95, commits: 358},
  {id: "u04", name: "Margaret Hamilton", team: "Apollo",      score: 94, commits: 340},
  {id: "u05", name: "Donald Knuth",      team: "Algorithms",  score: 93, commits: 322},
  {id: "u06", name: "Anita Borg",        team: "Systems",     score: 91, commits: 296},
  {id: "u07", name: "Tim Berners-Lee",   team: "Web",         score: 90, commits: 284},
  {id: "u08", name: "Barbara Liskov",    team: "Compilers",   score: 89, commits: 272}
]

bulkBar = if @Count($selectedIds) > 0 {
  Toolbar(
    left: [Badge(\`\${@Count($selectedIds)} selected\`, tone: "primary", icon: "check", size: "sm")],
    right: [
      Button("Email",  variant: "ghost",     size: "small", icon: "envelope"),
      Button("Export", variant: "secondary", size: "small", icon: "file-csv"),
      Button("Clear",  action: () => { $selectedIds = [] }, variant: "ghost", size: "small")
    ]
  )
} else {
  null
}

_app_ = Stack([
  PageHeader(
    "Top contributors",
    subtitle: \`\${@Count(people)} engineers · sorted by \${$sort.key} \${$sort.direction}\`,
    breadcrumbs: ["Workspace", "Engineering"]
  ),
  bulkBar,
  Card([
    SectionHeader("Leaderboard", eyebrow: "DATAGRID", actions: [Badge("Live", tone: "success", icon: "circle", size: "sm")]),
    DataGrid([
      Col("Id",      values: people.id,      align: "left"),
      Col("Name",    values: people.name,    align: "left",  sortable: true, filterable: true),
      Col("Team",    values: people.team,    align: "left",  sortable: true, filterable: true),
      Col("Score",   values: people.score,   align: "right", format: "number", sortable: true),
      Col("Commits", values: people.commits, align: "right", format: "number", sortable: true)
    ], rowIds: people.id, sort: $sort, selectedIds: $selectedIds, page: $page, perPage: 5, emptyLabel: "No people match")
  ])
])`,
  },
  calendar: {
    label: "CalendarView planner",
    code: `# Highlights: CalendarView grid, OnboardingChecklist with reactive state, ActivityLog timeline.
$selectedDate = "2026-05-17"
$ob1 = false
$ob2 = false
$ob3 = false

$obDone = (if $ob1 { 1 } else { 0 }) + (if $ob2 { 1 } else { 0 }) + (if $ob3 { 1 } else { 0 })

events = [
  {date: "2026-05-04", title: "Sprint planning", time: "09:00", tone: "primary"},
  {date: "2026-05-12", title: "Standup",         time: "09:00", tone: "primary"},
  {date: "2026-05-12", title: "1:1 · Ada",       time: "16:00", tone: "info"},
  {date: "2026-05-15", title: "Release window",  time: "10:00", tone: "success"},
  {date: "2026-05-17", title: "Demo day",        time: "14:30", tone: "success"},
  {date: "2026-05-22", title: "Retro",           time: "16:00", tone: "info"}
]

_app_ = Stack([
  PageHeader("May 2026", subtitle: \`\${@Count(events)} events · \${$obDone}/3 onboarding\`),
  Grid([
    Card([
      SectionHeader("Calendar", subtitle: "Focus a day to see details", eyebrow: "PLANNER"),
      CalendarView($selectedDate, month: "2026-05", events: events, view: "month")
    ]),
    Stack([
      Card([
        SectionHeader("Onboarding", subtitle: "Finish setup to enable publishing", eyebrow: "SETUP"),
        OnboardingChecklist([
          {title: "Connect calendar",     description: "Sync with Google.",     done: $ob1, action: () => { $ob1 = true }, cta: "Connect"},
          {title: "Invite teammates",     description: "Share an invite link.", done: $ob2, action: () => { $ob2 = true }, cta: "Invite"},
          {title: "Schedule first event", description: "Pick a slot.",          done: $ob3, action: () => { $ob3 = true }, cta: "Schedule"}
        ])
      ]),
      Card([
        SectionHeader("Activity"),
        ActivityLog([
          {actor: "Ada",   title: "rescheduled All-hands", time: "5m", icon: "calendar-plus", tone: "primary"},
          {actor: "Linus", title: "RSVPed to Demo day",    time: "1h", icon: "circle-check",  tone: "success"},
          {actor: "Grace", title: "added release window",  time: "1d", icon: "rocket",        tone: "info"}
        ])
      ])
    ], direction: "column", gap: "l")
  ], columns: {sm: 1, lg: 2}, gap: "l")
])`,
  },
  media: {
    label: "Media gallery + Map",
    code: `# Highlights: Carousel hero, Gallery wired to Lightbox via $variable, VideoPlayer + AudioPlayer + Map.
$slide = 0
$lightboxOpen = false
$lightboxIdx = 0

photos = [
  {src: "https://picsum.photos/seed/aurora-cliffs/1200/700",  caption: "Cliffs at dawn"},
  {src: "https://picsum.photos/seed/aurora-village/1200/700", caption: "Fishing village"},
  {src: "https://picsum.photos/seed/aurora-forest/1200/700",  caption: "Boreal forest"},
  {src: "https://picsum.photos/seed/aurora-lake/1200/700",    caption: "Glacier lake"},
  {src: "https://picsum.photos/seed/aurora-fjord/1200/700",   caption: "Fjord"},
  {src: "https://picsum.photos/seed/aurora-aurora/1200/700",  caption: "Northern lights"}
]

slides = for p in photos { {src: p.src, alt: p.caption, caption: p.caption} }

_app_ = Stack([
  PageHeader("Aurora Expedition", subtitle: "Iceland · Aug 2026", breadcrumbs: ["Trips", "Aurora"]),
  Card([
    SectionHeader("Highlights"),
    Carousel(slides, activeIndex: $slide, ratio: "16:9", showDots: true)
  ]),
  Card([
    SectionHeader("Photos", subtitle: "Tap a thumbnail to zoom"),
    Gallery(slides, columns: 3, onSelect: () => { $lightboxIdx = 0; $lightboxOpen = true })
  ]),
  Grid([
    Card([
      SectionHeader("Trailer"),
      VideoPlayer(
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        poster: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
        controls: true,
        caption: "Aurora Expedition trailer",
        ratio: "16:9"
      )
    ]),
    Card([
      SectionHeader("Soundtrack"),
      AudioPlayer(
        "https://upload.wikimedia.org/wikipedia/commons/2/26/Cello_Suite_No._1_Prelude.ogg",
        title: "Northern Skies",
        artist: "Aurora Strings"
      )
    ])
  ], columns: {sm: 1, md: 2}, gap: "l"),
  Card([
    SectionHeader("Itinerary", subtitle: "Six stops"),
    Map(65.0, lng: -16.0, zoom: 5, markers: [
      {lat: 64.1466, lng: -21.9426, label: "Reykjavík"},
      {lat: 64.7140, lng: -19.0608, label: "Highlands"},
      {lat: 65.6839, lng: -18.0907, label: "Akureyri"}
    ], height: "320px")
  ]),
  Lightbox(photos, open: $lightboxOpen, index: $lightboxIdx)
])`,
  },
  wizard: {
    label: "MultiStepForm wizard",
    code: `# Highlights: MultiStepForm steps, RichTextEditor, ColorPicker, PinInput, ValidationSummary.
$step = 0
$title = "Streaming UI v3 — release notes"
$body = "<h2>What's new</h2><p>Thirty new components — DataGrid, CalendarView, RichTextEditor, six charts.</p>"
$tags = ["release", "ui", "v3"]
$brand = "#6366f1"
$pin = ""

$errors = @Filter([
  if $title == "" { {label: "title", message: "Title is required."} } else { null },
  if $pin.length != 4 { {label: "pin",   message: "PIN must be 4 digits."} } else { null }
], "label", "!=", null)

publishGate = if @Count($errors) > 0 {
  Card([ValidationSummary($errors, title: "Fix these before publishing")])
} else {
  Card([Callout("Ready to publish", tone: "success", description: "All gates passed.", icon: "circle-check", compact: true)])
}

_app_ = Stack([
  PageHeader($title, subtitle: "Compose, brand, gate, publish.", breadcrumbs: ["Content", "Drafts"]),
  MultiStepForm([
    {title: "Compose", details: "Title, body, tags", content: [
      Card([
        SectionHeader("Body", eyebrow: "EDITOR"),
        FormSection("Post", helper: "All fields stream into the preview.", children: [
          FormControl("Title", field: Input("title", placeholder: "Headline…",     value: $title)),
          FormControl("Body",  field: RichTextEditor("body", value: $body, placeholder: "Start composing…", minHeight: "200px")),
          FormControl("Tags",  field: TagInput("tags", value: $tags, placeholder: "Press enter to add"))
        ])
      ])
    ]},
    {title: "Brand", details: "Pick an accent", content: [
      Card([
        SectionHeader("Brand"),
        ColorPicker("brand", value: $brand, label: "Accent",
          swatches: ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6"])
      ])
    ]},
    {title: "Gate", details: "4-digit PIN", content: [
      Card([
        SectionHeader("Two-factor publish", eyebrow: "GATE"),
        FormControl("PIN", field: PinInput("pin", length: 4, value: $pin, type: "numeric")),
        publishGate
      ])
    ]}
  ], current: $step)
])`,
  },
  advancedCharts: {
    label: "Gauge, Heatmap, Radar, Scatter",
    code: `# Highlights: every new chart primitive in one dashboard.
_app_ = Stack([
  PageHeader("Engineering analytics", subtitle: "Quarterly view"),
  Stats([
    StatCard("SLA",    value: "99.3%", trend: "up",   delta: "+0.2 pp", icon: "shield-halved"),
    StatCard("P95",    value: "112ms", trend: "down", delta: "-12 ms",  icon: "gauge-high"),
    StatCard("Errors", value: "0.42%", trend: "flat", delta: "stable",  icon: "circle-exclamation"),
    StatCard("MRR",    value: "$84k",  trend: "up",   delta: "+12%",    icon: "sack-dollar")
  ]),
  Grid([
    Card([SectionHeader("SLA uptime"),  Gauge(99.3, min: 95, max: 100, caption: "Above target", tone: "success", size: "lg")]),
    Card([SectionHeader("P95 latency"), Gauge(112,  min: 0,  max: 250, caption: "ms",           tone: "primary", size: "lg")]),
    Card([SectionHeader("Error rate"),  Gauge(0.42, min: 0,  max: 5,   caption: "% requests",   tone: "warning", size: "lg")])
  ], columns: {sm: 1, md: 3}, gap: "l"),
  Card([
    SectionHeader("Signups · last 7 days", subtitle: "Stacked by source"),
    LineChart(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
      series: [
        Series("Organic",  values: [40, 52, 65, 78, 92, 105, 124]),
        Series("Referral", values: [20, 28, 35, 42, 50, 60,  72]),
        Series("Paid",     values: [10, 14, 18, 24, 30, 36,  44])
      ])
  ]),
  Grid([
    Card([
      SectionHeader("Office capacity"),
      Heatmap(["Mon","Tue","Wed","Thu","Fri"], yLabels: ["9am","12pm","3pm","6pm"],
        values: [[3,4,5,3,2],[8,9,11,7,5],[12,14,16,13,10],[6,7,9,10,12]])
    ]),
    Card([
      SectionHeader("Vendor scorecard"),
      RadarChart(["Speed","Quality","Cost","Coverage","Trust"], series: [
        Series("Atlas Cloud", values: [80,70,60,75,85]),
        Series("Northwind",   values: [60,85,70,65,80])
      ])
    ])
  ], columns: {sm: 1, md: 2}, gap: "l"),
  Grid([
    Card([
      SectionHeader("Sessions vs conversions"),
      ScatterChart([
        Series("Cohort A", values: [{x:1,y:2},{x:2,y:4},{x:3,y:5},{x:4,y:7}]),
        Series("Cohort B", values: [{x:1,y:3},{x:2,y:2},{x:3,y:6},{x:4,y:5}])
      ], xLabel: "Sessions (k)", yLabel: "Conversions")
    ]),
    Card([
      SectionHeader("Response time"),
      Histogram([1,2,2,3,3,3,4,4,5,5,5,5,6,6,7,8,8,9], bins: 6)
    ])
  ], columns: {sm: 1, md: 2}, gap: "l")
])`,
  },
  storageConsole: {
    label: "Storage + console globals",
    code: `# Highlights: \`storage\` namespace (local / session / cookies), \`console\` forwarder, named-arg method calls.
$name = storage.get("rui:demo:name")
$theme = storage.session.get("rui:demo:theme")
$consent = storage.cookies.get("rui:demo:consent")

action saveName(value) {
  storage.set("rui:demo:name", value)
  $name = value
  console.log("Saved name", value)
}

action setTheme(value) {
  storage.session.set("rui:demo:theme", value)
  $theme = value
  console.info("Theme preference set to", value)
}

action acceptCookies() {
  storage.cookies.set("rui:demo:consent", "accepted", expires: 30, path: "/", sameSite: "Lax")
  $consent = "accepted"
  console.warn("Cookies accepted — will persist for 30 days")
}

action clearAll() {
  storage.clear()
  storage.session.clear()
  storage.cookies.clear()
  $name = null
  $theme = null
  $consent = null
  console.error("Cleared every storage namespace (demo only).")
}

_app_ = Stack([
  PageHeader("Storage + console", subtitle: "All values persist across reloads via the matching browser API."),
  Card([
    SectionHeader("localStorage", eyebrow: "PERSISTENT"),
    FormControl("Display name", field: Input("name", placeholder: "Your name", value: $name ?? "")),
    Button("Save name", action: () => { saveName($name ?? "") }, variant: "primary")
  ]),
  Card([
    SectionHeader("sessionStorage", eyebrow: "PER TAB"),
    FormControl("Theme", field: Select("theme", items: [
      SelectItem("light", "Light"),
      SelectItem("dark",  "Dark"),
      SelectItem("auto",  "Auto")
    ], value: $theme ?? "auto")),
    Button("Save theme", action: () => { setTheme($theme ?? "auto") })
  ]),
  Card([
    SectionHeader("cookies", eyebrow: "NAMED ARGS"),
    Text(\`Current consent: \${$consent ?? "—"}\`),
    Stack([
      Button("Accept cookies", action: acceptCookies, variant: "primary"),
      Button("Reset everything", action: clearAll, variant: "ghost")
    ], direction: "row", gap: "s")
  ])
])`,
  },
  gridLayout: {
    label: "12-col grid + named args",
    code: `# Highlights: Grid(columns: 12), GridItem(span: "1/4"), named-arg layout props.
sidebar = Card([
  CardHeader("Sidebar", subtitle: "GridItem span='1/4'"),
  Stack([
    NavLink("Overview", to: "/",         variant: "ghost"),
    NavLink("Reports",  to: "/reports",  variant: "ghost"),
    NavLink("Settings", to: "/settings", variant: "ghost")
  ], direction: "column", gap: "s")
])

content = Card([
  CardHeader("Main workspace", subtitle: "GridItem span='3/4' fills the rest"),
  Text("Use Grid(columns: 12, gap: 'l', [...]) with GridItem(child, span: '1/4') for sidebar layouts.")
])

_app_ = Grid([
  GridItem(sidebar, span: "1/4"),
  GridItem(content, span: "3/4")
], columns: 12, gap: "l")`,
  },
};

const DEFAULT_EXAMPLE = "chat";

// Splitter ratio bounds: keep both panes usable when the user drags the
// gutter to extremes. The CSS `--pg-split` / `--pg-split-v` variable carries
// the full grid-template (left/top + 6px gutter + right/bottom).
const SPLIT_MIN = 0.15;
const SPLIT_MAX = 0.85;
const SPLIT_GUTTER = "6px";

function clampSplitRatio(value) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, value));
}

// ---------------------------------------------------------------------------
// Persistence

const LS = {
  code: "rui:playground:code",
  mode: "rui:playground:mode",
  runMode: "rui:playground:runMode",
  theme: "rui:playground:theme",
  example: "rui:playground:example",
  inspect: "rui:playground:inspect",
  split: "rui:playground:split",
  splitV: "rui:playground:splitV",
  sidebarCollapsed: "rui:playground:sidebarCollapsed",
};

const lsRead = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
};
const lsWrite = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch { /* quota / privacy */ }
};

// ---------------------------------------------------------------------------
// Share-link encoding (gzip via CompressionStream when available)

async function encodeShare(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let compressed = bytes;
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
      compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* fall back to raw bytes */ }
  }
  const b64 = btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return b64;
}

async function decodeShare(b64) {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "===".slice((padded.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (typeof DecompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const out = await new Response(stream).arrayBuffer();
      return new TextDecoder().decode(out);
    } catch {
      // not gzipped — fall through and try as raw UTF-8
    }
  }
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// UI helpers

const $ = (id) => document.getElementById(id);

function showToast(message, opts = {}) {
  const el = $("pg-toast");
  el.textContent = "";
  if (opts.icon) {
    const i = document.createElement("i");
    i.className = `fa-solid fa-${opts.icon}`;
    el.append(i);
  }
  el.append(document.createTextNode(message));
  el.dataset.visible = "true";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.dataset.visible = "false"; }, 1800);
}

const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text) {
  return String(text ?? "").replace(/[<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Build a self-contained HTML document that boots `<aktion-app>` from the
 * public CDN bundle and renders the given Aktion source. Mirrors the
 * approach in `chat-bot.js` so links shared with non-developers Just Work.
 */
function buildStandaloneHtml(source, theme, title) {
  const safeSource = JSON.stringify(source).replace(/<\/(script)/gi, "<\\/$1");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(title)}</title>`,
    '  <meta name="generator" content="Aktion playground" />',
    `  <script type="module" src="${CDN_BUNDLE}"></script>`,
    "  <style>",
    "    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }",
    "    aktion-app { display: block; min-height: 100vh; }",
    "  </style>",
    "</head>",
    "<body>",
    `  <aktion-app theme="${escapeAttr(theme)}"></aktion-app>`,
    '  <script type="module">',
    '    const el = document.querySelector("aktion-app");',
    `    const SOURCE = ${safeSource};`,
    '    customElements.whenDefined("aktion-app").then(() => {',
    "      if (typeof el.setResponse === \"function\") el.setResponse(SOURCE);",
    '      else el.setAttribute("response", SOURCE);',
    "    });",
    "  </script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function downloadStandaloneHtml(source, theme, title) {
  const html = buildStandaloneHtml(source, theme, title);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aktion-${Date.now()}.html`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Bootstrap

const langSpec = getLanguageSpec();
const componentNames = new Set(langSpec.components.map((c) => c.name));

/**
 * Reserved language keywords — surfaced in autocomplete so the LLM-author
 * (or a human) can discover the full grammar without leaving the editor.
 * Mirror the lexer's `KEYWORDS_AKTION` set plus the contextual
 * keywords (`on:mount`, `on:unmount`, `on:every`) that aren't true tokens
 * but still appear at the surface.
 */
const LANGUAGE_KEYWORDS = [
  { label: "component", info: "Declare a reusable component: `component Name(arg) { return ... }`." },
  { label: "effect",    info: "Declare an anonymous side-effect: `effect [$atom, on:mount, debounce(N)] { ... }`." },
  { label: "action",    info: "Declare a callable action body: `action save(payload) { ... }`." },
  { label: "if",        info: "Expression-form `if cond { ... } else { ... }`." },
  { label: "else",      info: "`else` arm of an `if` expression." },
  { label: "match",     info: "Expression-form `match value { \"x\": A(), default: B() }`." },
  { label: "for",       info: "Expression-form `for x in xs { Card(x) }`." },
  { label: "in",        info: "Used in `for x in xs { ... }`." },
  { label: "await",     info: "Wait for an HTTP / promise inside an action body." },
  { label: "return",    info: "Return from a `component` / `action` / `effect` body." },
  { label: "cleanup",   info: "Register a teardown handler inside an `effect` body." },
  { label: "optimistic",info: "Mark an `action` as optimistic: `action save(...) optimistic { ... }`." },
  { label: "on",        info: "Used inside `effect [...]` lifecycle deps: `on:mount`, `on:unmount`, `on:every(N)`." },
  { label: "emit",      info: "Dispatch a custom event: `emit \"name\" { detail }`." },
  { label: "bind",      info: "Two-way binding shorthand: `Input(bind:value: $name)`." },
  { label: "default",   info: "Wildcard arm inside `_router_({...})` / `match`." },
  { label: "on:mount",  info: "Effect trigger that fires once on mount." },
  { label: "on:unmount",info: "Effect trigger that fires once on unmount." },
  { label: "on:every",  info: "Effect trigger that fires every N ms: `on:every(1000)`." },
];

/**
 * Reserved identifiers / special globals exposed by the runtime. Surfaced
 * in autocomplete so authors learn the names — `_app_` and `_router_` are
 * underscore-bracketed so they're easy to type but never collide with
 * user identifiers.
 */
const SPECIAL_IDENTIFIERS = [
  {
    label: "_app_",
    info: "Top-level entry binding — the renderer reads `_app_` to draw the UI.",
    apply: "_app_ = ",
  },
  {
    label: "_router_",
    info: "Routing primitive. Pass an object literal whose keys are route patterns.",
    apply: "_router_({\n  \"/\":     ${1:Home()},\n  default: ${2:NotFound()}\n})",
    snippet: true,
  },
  {
    label: "params",
    info: "Inside an `_router_({...})` arm, holds the captured path segments (`params.id`, `params._`).",
    apply: "params",
  },
  {
    label: "_route_",
    info: "Reserved router handle. Read-only reactive surface: `_route_.path`, `_route_.params`, `_route_.query`, `_route_.pattern`. Call `_route_.navigate(path)` to navigate imperatively.",
    apply: "_route_",
  },
  {
    label: "$http",
    info: "HTTP runtime configuration binding: `$http = Http({ baseUrl, headers, retry, timeout })`.",
    apply: "$http",
  },
  {
    label: "$i18n",
    info: "i18n runtime binding: `$i18n = i18n({ locale, messages, fallback })`.",
    apply: "$i18n",
  },
  {
    label: "theme",
    info: "Per-response theme override: `theme = Theme({ colors: { primary: ... } })`.",
    apply: "theme",
  },
];

/**
 * Top-level multi-line snippets — surfaced via the `…` ellipsis suffix
 * so they show up alongside ordinary identifiers without polluting the
 * inline completion list. Pulled from `langSpec.snippets` plus the
 * language constructs (`component`, `action`, `effect`, `match`,
 * `_router_`).
 */
const LANGUAGE_SNIPPETS = [
  {
    name: "router",
    description: "Multi-page _router_({...}) with NavLink nav.",
    template:
      'pages = _router_({\n' +
      '  "/":          ${1:Home()},\n' +
      '  "/users/:id": ${2:UserPage(id: params.id)},\n' +
      '  default:      ${3:NotFound()}\n' +
      '})\n\n' +
      'nav = Stack([\n' +
      '  NavLink("Home",  to: "/",      variant: "ghost", exact: true),\n' +
      '  NavLink("Users", to: "/users", variant: "ghost")\n' +
      '], direction: "row", gap: "s")\n\n' +
      '_app_ = Stack([nav, pages])',
  },
  {
    name: "component",
    description: "User-defined component with explicit return.",
    template:
      'component ${1:Name}(${2:prop}) {\n' +
      '  return ${3:Card([CardHeader(${2:prop})])}\n' +
      '}',
  },
  {
    name: "action",
    description: "Callable action block — invoked via `action:` props.",
    template:
      'action ${1:save}(${2:payload}) {\n' +
      '  $${3:result} = http({ url: "/api/${4:endpoint}", method: "POST", body: ${2:payload} })\n' +
      '}',
  },
  {
    name: "effect",
    description: "Side-effect block — anonymous, with bracketed dependency list.",
    template:
      'effect [$${1:dep}] {\n' +
      '  ${2:// side effect body}\n' +
      '  cleanup(() => { ${3:// teardown} })\n' +
      '}',
  },
  {
    name: "match",
    description: "Pattern-matching expression — first match wins.",
    template:
      'match ${1:value} {\n' +
      '  "${2:active}": ${3:onActive()},\n' +
      '  default:    ${4:otherwise()}\n' +
      '}',
  },
  {
    name: "for",
    description: "for-comprehension loop expression.",
    template: 'for ${1:item} in ${2:items} { ${3:Card(${1:item})} }',
  },
  {
    name: "if",
    description: "Expression-form if / else.",
    template:
      'if ${1:cond} {\n' +
      '  ${2:Body()}\n' +
      '} else {\n' +
      '  ${3:Fallback()}\n' +
      '}',
  },
  {
    name: "http",
    description: "Reactive HTTP resource.",
    template:
      '$${1:data} = http({ url: "${2:/api/items}", method: "${3:GET}" })',
  },
];

/**
 * Built-in namespace globals — surfaced in autocomplete so authors can
 * discover the `storage` / `console` API the same way they discover
 * components and `@`-builtins.
 */
const GLOBAL_NAMESPACES = [
  {
    name: "storage",
    signature: "storage.<local|session|cookies>?.<set|get|remove|clear>(...)",
    description: "Browser storage namespace — localStorage (default), sessionStorage, and cookies share a uniform set/get/remove/clear surface.",
    members: [
      { label: "storage.set",            apply: "storage.set(\"${1:key}\", ${2:value})",                                                                                         info: "Persist a value to localStorage (default namespace)." },
      { label: "storage.get",            apply: "storage.get(\"${1:key}\")",                                                                                                       info: "Read a value from localStorage. Returns null when missing." },
      { label: "storage.remove",         apply: "storage.remove(\"${1:key}\")",                                                                                                    info: "Delete a key from localStorage." },
      { label: "storage.clear",          apply: "storage.clear()",                                                                                                                  info: "Wipe every localStorage entry." },
      { label: "storage.local.set",      apply: "storage.local.set(\"${1:key}\", ${2:value})",                                                                                     info: "Alias of `storage.set`." },
      { label: "storage.local.get",      apply: "storage.local.get(\"${1:key}\")",                                                                                                  info: "Alias of `storage.get`." },
      { label: "storage.session.set",    apply: "storage.session.set(\"${1:key}\", ${2:value})",                                                                                   info: "Per-tab sessionStorage write." },
      { label: "storage.session.get",    apply: "storage.session.get(\"${1:key}\")",                                                                                                info: "Per-tab sessionStorage read." },
      { label: "storage.session.remove", apply: "storage.session.remove(\"${1:key}\")",                                                                                             info: "Drop a sessionStorage entry." },
      { label: "storage.session.clear",  apply: "storage.session.clear()",                                                                                                          info: "Wipe sessionStorage." },
      { label: "storage.cookies.set",    apply: "storage.cookies.set(\"${1:key}\", ${2:value}, expires: ${3:7}, path: \"/\")",                                                       info: "Set a cookie. Named-arg options: expires, maxAge, path, domain, secure, sameSite." },
      { label: "storage.cookies.get",    apply: "storage.cookies.get(\"${1:key}\")",                                                                                                info: "Read a cookie value." },
      { label: "storage.cookies.remove", apply: "storage.cookies.remove(\"${1:key}\", path: \"/\")",                                                                                info: "Delete a cookie. Path/domain must match the original set call." },
      { label: "storage.cookies.clear",  apply: "storage.cookies.clear()",                                                                                                          info: "Clear every cookie on this document." },
    ],
  },
  {
    name: "console",
    signature: "console.<log|error|warn|info|debug>(...)",
    description: "Forwards to the browser console. Useful for stream-time debugging without an `js{}` escape hatch.",
    members: [
      { label: "console.log",   apply: "console.log(${1})",   info: "Log a message at the default level." },
      { label: "console.error", apply: "console.error(${1})", info: "Log an error." },
      { label: "console.warn",  apply: "console.warn(${1})",  info: "Log a warning." },
      { label: "console.info",  apply: "console.info(${1})",  info: "Log an informational message." },
      { label: "console.debug", apply: "console.debug(${1})", info: "Log a verbose debug message." },
    ],
  },
];

// Build the inverse mapping (rui-* class → component name) for inspect mode.
function kebab(name) {
  return name.replace(/[A-Z]/g, (m, i) => (i === 0 ? m.toLowerCase() : "-" + m.toLowerCase()));
}
const cssClassToComponent = new Map();
for (const entry of langSpec.components) {
  cssClassToComponent.set(`rui-${kebab(entry.name)}`, entry.name);
}

(async function bootstrap() {
  let cm;
  try {
    cm = await loadCodeMirror();
  } catch (err) {
    $("pg-editor-loader").innerHTML =
      `<i class="fa-solid fa-circle-exclamation"></i>&nbsp;Couldn't load editor (${String(err)})`;
    return;
  }

  initPlayground(cm);
})();

// ---------------------------------------------------------------------------
// Main initialiser

function initPlayground(cm) {
  const { state, view, commands, lang, autocomplete, search, lint, highlight } = cm;
  const { tags } = highlight;

  // ---- Language: StreamLanguage from our pure-data tokenizer ----
  // We map each grammar token kind to a highlight tag via `tokenTable`, so the
  // tokenizer can simply return its kind string and CM resolves the tag.
  const baseTokenizer = langSpec.tokenizer;
  const tokenTable = {
    comment: tags.lineComment,
    string: tags.string,
    number: tags.number,
    atom: tags.atom,
    builtin: tags.keyword,
    state: tags.special(tags.variableName),
    component: tags.typeName,
    identifier: tags.variableName,
    loopvar: tags.local(tags.variableName),
    property: tags.propertyName,
    operator: tags.operator,
  };

  const streamLanguage = lang.StreamLanguage.define({
    name: "aktion-app",
    startState: () => baseTokenizer.startState(),
    copyState: (s) => baseTokenizer.copyState(s),
    token: (stream, st) => {
      const kind = baseTokenizer.token(stream, st);
      if (!kind || kind === "punctuation") return null;
      return kind;
    },
    tokenTable,
    languageData: {
      commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
      closeBrackets: { brackets: ["(", "[", "{", '"', "'", "`"] },
    },
  });

  const highlightStyle = lang.HighlightStyle.define([
    { tag: tags.keyword, color: "#7c3aed", fontWeight: "600" },          // @builtins
    { tag: tags.typeName, color: "#2563eb", fontWeight: "500" },         // Components
    { tag: tags.special(tags.variableName), color: "#ea580c" },          // $state
    { tag: tags.local(tags.variableName), color: "#0891b2" },            // loop vars
    { tag: tags.variableName, color: "#0f172a" },
    { tag: tags.propertyName, color: "#0f766e" },
    { tag: tags.string, color: "#16a34a" },
    { tag: tags.number, color: "#dc2626" },
    { tag: tags.atom, color: "#9333ea" },
    { tag: tags.lineComment, color: "#64748b", fontStyle: "italic" },
    { tag: tags.blockComment, color: "#64748b", fontStyle: "italic" },
    { tag: tags.operator, color: "#64748b" },
  ]);

  // ---- Autocomplete sources ----

  /**
   * Inspect the slice of the current argument from the last comma (or `(`)
   * at depth 0 inside `call.openParen` up to `pos`. Returns the raw text
   * and the absolute start offset so completion handlers can compute the
   * replace range precisely.
   */
  function readCurrentArg(text, call, pos) {
    let i = call.openParen + 1;
    let depth = 0;
    let str = null;
    let comment = null;
    let argStart = i;
    while (i < pos) {
      const ch = text[i];
      if (comment === "line") {
        if (ch === "\n") comment = null;
        i++; continue;
      }
      if (comment === "block") {
        if (ch === "*" && text[i + 1] === "/") { comment = null; i += 2; continue; }
        i++; continue;
      }
      if (str) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === str) str = null;
        i++; continue;
      }
      if (ch === "/" && text[i + 1] === "/") { comment = "line"; i += 2; continue; }
      if (ch === "#") { comment = "line"; i++; continue; }
      if (ch === "/" && text[i + 1] === "*") { comment = "block"; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { str = ch; i++; continue; }
      if (ch === "(" || ch === "[" || ch === "{") { depth++; i++; continue; }
      if (ch === ")" || ch === "]" || ch === "}") { depth--; i++; continue; }
      if (ch === "," && depth === 0) { argStart = i + 1; }
      i++;
    }
    return { argStart, argText: text.slice(argStart, pos) };
  }

  /**
   * Collect named-arg names already used inside `call` so we can hide
   * duplicates from the suggestion list. Walks every arg slot bounded by
   * top-level commas; only `name:` shapes count.
   */
  function collectUsedNamedArgs(text, call) {
    const used = new Set();
    let i = call.openParen + 1;
    let depth = 0;
    let str = null;
    let comment = null;
    let argStart = i;
    const len = text.length;
    const consider = (start, end) => {
      const chunk = text.slice(start, end).trim();
      const m = chunk.match(/^([A-Za-z_][\w]*)\s*:/);
      if (m) used.add(m[1]);
    };
    while (i < len) {
      const ch = text[i];
      if (comment === "line") {
        if (ch === "\n") comment = null;
        i++; continue;
      }
      if (comment === "block") {
        if (ch === "*" && text[i + 1] === "/") { comment = null; i += 2; continue; }
        i++; continue;
      }
      if (str) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === str) str = null;
        i++; continue;
      }
      if (ch === "/" && text[i + 1] === "/") { comment = "line"; i += 2; continue; }
      if (ch === "#") { comment = "line"; i++; continue; }
      if (ch === "/" && text[i + 1] === "*") { comment = "block"; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { str = ch; i++; continue; }
      if (ch === "(" || ch === "[" || ch === "{") { depth++; i++; continue; }
      if (ch === ")" || ch === "]" || ch === "}") {
        if (depth === 0) { consider(argStart, i); return used; }
        depth--; i++; continue;
      }
      if (ch === "," && depth === 0) { consider(argStart, i); argStart = i + 1; }
      i++;
    }
    consider(argStart, i);
    return used;
  }

  /**
   * Render a tiny inline doc body (signature + description + bullet list
   * of params) for a completion's `info` callback. Used by both
   * named-arg and top-level component completions.
   */
  function makeInfoPopup(signature, description, params) {
    const wrap = document.createElement("div");
    wrap.style.maxWidth = "320px";
    wrap.style.fontSize = "12px";
    wrap.style.lineHeight = "1.45";
    const code = document.createElement("code");
    code.textContent = signature;
    code.style.display = "block";
    code.style.padding = "4px 6px";
    code.style.background = "rgba(0,0,0,.06)";
    code.style.borderRadius = "4px";
    code.style.marginBottom = "6px";
    wrap.append(code);
    if (description) {
      const p = document.createElement("p");
      p.textContent = description;
      p.style.margin = "0 0 6px";
      p.style.color = "var(--doc-text-muted)";
      wrap.append(p);
    }
    if (params && params.length > 0) {
      const ul = document.createElement("ul");
      ul.style.margin = "0";
      ul.style.paddingLeft = "16px";
      for (const p of params) {
        const li = document.createElement("li");
        const opt = p.required === false || p.required === undefined ? "?" : "";
        li.innerHTML = `<code>${p.name}${opt}</code>: <span style="color:var(--doc-text-muted)">${p.type}</span>${p.description ? " — " + p.description : ""}`;
        ul.append(li);
      }
      wrap.append(ul);
    }
    return wrap;
  }

  /**
   * Build a small info DOM for a single named-arg suggestion (param spec)
   * — name, type, enum values, description. Distinguished from the
   * component-level popup by surfacing the enum values prominently.
   */
  function makeParamInfo(param) {
    const wrap = document.createElement("div");
    wrap.style.maxWidth = "300px";
    wrap.style.fontSize = "12px";
    wrap.style.lineHeight = "1.45";
    const head = document.createElement("code");
    head.style.display = "block";
    head.style.padding = "4px 6px";
    head.style.background = "rgba(0,0,0,.06)";
    head.style.borderRadius = "4px";
    head.style.marginBottom = "6px";
    head.textContent = `${param.name}${param.required ? "" : "?"}: ${param.type}`;
    wrap.append(head);
    if (param.description) {
      const p = document.createElement("p");
      p.textContent = param.description;
      p.style.margin = "0 0 6px";
      p.style.color = "var(--doc-text-muted)";
      wrap.append(p);
    }
    if (param.enumValues && param.enumValues.length > 0) {
      const lbl = document.createElement("div");
      lbl.style.color = "var(--doc-text-muted)";
      lbl.style.fontSize = "11px";
      lbl.style.textTransform = "uppercase";
      lbl.style.letterSpacing = "0.05em";
      lbl.textContent = "Allowed values";
      lbl.style.marginBottom = "4px";
      wrap.append(lbl);
      const list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexWrap = "wrap";
      list.style.gap = "4px";
      for (const v of param.enumValues) {
        const badge = document.createElement("span");
        badge.textContent = v;
        badge.style.padding = "2px 6px";
        badge.style.borderRadius = "4px";
        badge.style.background = "rgba(99, 102, 241, 0.10)";
        badge.style.color = "var(--doc-primary)";
        badge.style.fontFamily = "monospace";
        badge.style.fontSize = "11px";
        list.append(badge);
      }
      wrap.append(list);
    }
    return wrap;
  }

  function completions(ctx) {
    const text = ctx.state.doc.toString();
    const pos = ctx.pos;

    // What did the user just type? `matchBefore` returns the longest
    // matching word + its absolute range, or null when the cursor sits
    // on whitespace and the trigger wasn't explicit.
    const word = ctx.matchBefore(/[\w@$_]*/);
    if (!word) return null;

    // ---------- Context: enclosing call ----------
    const call = findEnclosingCall(text, pos);
    if (call && call.name) {
      const ctxKind = call.name.startsWith("@") ? "builtin" : "component";
      const spec = ctxKind === "builtin"
        ? langSpec.builtinsByName[call.name.slice(1)]
        : langSpec.componentsByName[call.name];

      if (spec) {
        const { argStart, argText } = readCurrentArg(text, call, pos);

        // CASE 1: cursor sits in a named-arg VALUE position
        //         (`Button("Save", variant: <here>)`). Surface the enum
        //         values inline so the user can tab through them.
        const valueMatch = argText.match(/^\s*([A-Za-z_]\w*)\s*:\s*(.*)$/s);
        if (valueMatch) {
          const paramName = valueMatch[1];
          const partialValue = valueMatch[2];
          // Allow nested expression edits — only short-circuit when the
          // partial value has no opening bracket that hasn't been closed.
          const valueHasBracket =
            /[(\[{`"']/.test(partialValue) &&
            !looksClosed(partialValue);
          if (!valueHasBracket) {
            const param = spec.params.find((p) => p.name === paramName);
            const enumOptions = enumValueOptions(param);
            if (enumOptions.length > 0) {
              // Token under the cursor inside the value — quote prefix
              // is fine, we just want to replace whatever is being typed
              // (including a leading `"`).
              const valueStart = pos - partialValue.length;
              return {
                from: valueStart,
                options: enumOptions,
              };
            }
          }
        }

        // CASE 2: cursor sits at the start of an arg, OR is typing a
        //         bare identifier with no colon after it. Suggest the
        //         remaining named args of the enclosing call so the
        //         user can fill them in `name:` form.
        const couldBeNamedArgName = /^\s*[A-Za-z_]?[\w]*$/.test(argText);
        if (couldBeNamedArgName && ctxKind === "component") {
          const used = collectUsedNamedArgs(text, call);
          const remaining = spec.params.filter((p) => !used.has(p.name));
          if (remaining.length > 0) {
            const options = remaining.map((p) => ({
              label: `${p.name}:`,
              type: "property",
              detail: p.type + (p.required ? "" : " (optional)"),
              boost: p.required ? 50 : 30,
              info: () => makeParamInfo(p),
              apply: applyNamedArg(p),
            }));
            // When we have something to offer for named args, return them
            // as the only suggestions — anything else (component names,
            // builtins) would be wrong here. The user can still escape
            // with `Esc` if they want a positional value.
            const from = word.from;
            return { from, options, validFor: /[\w]*/ };
          }
        }
      }
    }

    // ---------- General completions ----------
    if (word.from === word.to && !ctx.explicit) return null;

    const wordText = word.text;
    const options = [];

    // @builtins
    if (wordText.startsWith("@") || wordText === "") {
      for (const b of langSpec.builtins) {
        options.push({
          label: `@${b.name}`,
          type: "function",
          detail: b.category ?? "builtin",
          info: () => makeInfoPopup(b.signature, b.description, b.params),
          apply: `@${b.name}(`,
        });
      }
    }

    // Components (with snippet-aware apply)
    if (!wordText.startsWith("@") && !wordText.startsWith("$")) {
      for (const c of langSpec.components) {
        const snippet = langSpec.snippets.find((s) => s.name === c.name);
        const apply = snippet
          ? autocomplete.snippet(snippet.template)
          : autocomplete.snippet(componentCallTemplate(c));
        options.push({
          label: c.name,
          type: "class",
          detail: c.group,
          info: () => makeInfoPopup(c.signature, c.description, c.params),
          apply,
        });
      }
    }

    // Built-in namespace globals (`storage`, `console`).
    if (!wordText.startsWith("@") && !wordText.startsWith("$")) {
      for (const ns of GLOBAL_NAMESPACES) {
        options.push({
          label: ns.name,
          type: "namespace",
          detail: "global",
          info: ns.description,
          apply: `${ns.name}.`,
        });
        for (const member of ns.members) {
          options.push({
            label: member.label,
            type: "method",
            detail: ns.name,
            info: member.info,
            apply: autocomplete.snippet(member.apply),
          });
        }
      }
    }

    // Language keywords (`if`, `match`, `for`, `component`, …).
    if (!wordText.startsWith("@") && !wordText.startsWith("$")) {
      for (const kw of LANGUAGE_KEYWORDS) {
        options.push({
          label: kw.label,
          type: "keyword",
          detail: "keyword",
          info: kw.info,
        });
      }
    }

    // Reserved identifiers (`_app_`, `_router_`, `_route_`, `params`, …).
    if (!wordText.startsWith("@")) {
      for (const id of SPECIAL_IDENTIFIERS) {
        if (wordText.startsWith("$") && !id.label.startsWith("$")) continue;
        if (!wordText.startsWith("$") && id.label.startsWith("$") && wordText !== "") continue;
        options.push({
          label: id.label,
          type: id.label.startsWith("$") ? "variable" : "constant",
          detail: id.label.startsWith("_") ? "runtime" : "reactive",
          info: id.info,
          apply: id.snippet ? autocomplete.snippet(id.apply) : id.apply,
        });
      }
    }

    // Multi-line snippets — language-level templates first, then the
    // library's component-shaped snippets.
    if (!wordText.startsWith("@") && !wordText.startsWith("$")) {
      for (const s of LANGUAGE_SNIPPETS) {
        options.push({
          label: s.name + "…",
          type: "snippet",
          detail: "language",
          info: s.description,
          apply: autocomplete.snippet(s.template),
        });
      }
      for (const s of langSpec.snippets) {
        // Skip snippets that are already surfaced as `LANGUAGE_SNIPPETS`
        // (router) — they share a name and the language version is more
        // up-to-date.
        if (LANGUAGE_SNIPPETS.some((ls) => ls.name === s.name.toLowerCase())) continue;
        options.push({
          label: s.name + "…",
          type: "snippet",
          detail: "snippet",
          info: s.description,
          apply: autocomplete.snippet(s.template),
        });
      }
    }

    // $variables — scan the program for stateRefs declared elsewhere.
    if (wordText.startsWith("$") || ctx.explicit) {
      const stateNames = scanStateRefs(ctx.state.doc.toString());
      for (const name of stateNames) {
        options.push({
          label: `$${name}`,
          type: "variable",
          detail: "$state",
        });
      }
    }

    // Theme names — fire when we're clearly in a theme=, "theme":, or
    // setTheme( context.
    if (ctx.state.doc.lineAt(ctx.pos).text.match(/theme\s*=\s*$|"theme"\s*:\s*$|setTheme\(\s*$/)) {
      for (const t of langSpec.themeNames) {
        options.push({ label: `"${t}"`, type: "constant", detail: "theme" });
      }
    }

    return { from: word.from, options, validFor: /[\w@$_]*/ };
  }

  /**
   * Build the apply text for a named-arg completion. For enum-typed
   * params we prefer to insert the first allowed value as a placeholder
   * the user can tab through; for plain string / number params we just
   * leave the cursor after the colon. Boolean params get a `true` /
   * `false` template choice.
   */
  function applyNamedArg(param) {
    const enumValues = param.enumValues ?? [];
    if (enumValues.length > 0) {
      const choices = enumValues.map((v) => `"${v}"`).join("|");
      return autocomplete.snippet(`${param.name}: \${1|${choices}|}`);
    }
    if (param.type === "boolean") {
      return autocomplete.snippet(`${param.name}: \${1|true,false|}`);
    }
    if (param.type === "string") {
      return autocomplete.snippet(`${param.name}: "\${1}"`);
    }
    if (param.type === "number") {
      return autocomplete.snippet(`${param.name}: \${1:0}`);
    }
    return autocomplete.snippet(`${param.name}: \${1}`);
  }

  /**
   * Suggestion list for a named arg's value position — enum values,
   * theme names (for theme-shaped props), and `true` / `false` for
   * boolean params. Returns an empty array when nothing useful to add.
   */
  function enumValueOptions(param) {
    if (!param) return [];
    const out = [];
    if (param.enumValues && param.enumValues.length > 0) {
      for (const v of param.enumValues) {
        out.push({ label: `"${v}"`, type: "constant", detail: param.name });
      }
    }
    if (param.type === "boolean") {
      out.push({ label: "true",  type: "constant", detail: "boolean" });
      out.push({ label: "false", type: "constant", detail: "boolean" });
    }
    if (/theme/i.test(param.name)) {
      for (const t of langSpec.themeNames) {
        out.push({ label: `"${t}"`, type: "constant", detail: "theme" });
      }
    }
    return out;
  }

  /**
   * Quick balanced-brackets / quotes check used to decide whether an
   * already-started argument value is "still open" (i.e. the user is
   * editing inside a nested expression and we shouldn't fire enum
   * completions over the top of it).
   */
  function looksClosed(text) {
    let depth = 0;
    let str = null;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (str) {
        if (ch === "\\") { i += 1; continue; }
        if (ch === str) str = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { str = ch; continue; }
      if (ch === "(" || ch === "[" || ch === "{") { depth += 1; continue; }
      if (ch === ")" || ch === "]" || ch === "}") { depth -= 1; continue; }
    }
    return depth <= 0 && str === null;
  }

  /**
   * Compose a snippet template for a component call that pre-fills the
   * canonical positional slot and exposes every required prop as a
   * named-arg tab stop. Optional props are skipped so the inserted call
   * stays minimal.
   */
  function componentCallTemplate(spec) {
    if (!spec.params || spec.params.length === 0) return `${spec.name}()`;
    const positional = spec.params.find((p) => p.positional || p.required) ?? spec.params[0];
    const required = spec.params.filter((p) => p !== positional && p.required);
    const stops = [];
    let i = 1;
    const posStop = `\${${i++}:${positional.name}}`;
    if (required.length === 0) {
      return `${spec.name}(${posStop})`;
    }
    for (const p of required) {
      stops.push(`${p.name}: \${${i++}:${p.name}}`);
    }
    return `${spec.name}(${posStop}, ${stops.join(", ")})`;
  }

  function scanStateRefs(source) {
    const out = new Set();
    const re = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
    let m;
    while ((m = re.exec(source))) out.add(m[1]);
    return Array.from(out).sort();
  }

  // ---- Spec lookup (hover & signature tooltips share this) ----
  function resolveSpec(rawName) {
    if (!rawName) return null;
    if (rawName.startsWith("@")) {
      const builtin = langSpec.builtinsByName[rawName.slice(1)];
      return builtin ? { kind: "builtin", spec: builtin } : null;
    }
    const component = langSpec.componentsByName[rawName];
    if (component) return { kind: "component", spec: component };
    return null;
  }

  /**
   * Lightweight scanner: returns the enclosing call (component or @builtin)
   * at `pos`, or `null`. Tracks strings, escapes, and both line and block
   * comments so commas inside literals are ignored.
   */
  function findEnclosingCall(text, pos) {
    const stack = []; // [{ name, openParen, argIndex, brackets }]
    let str = null;     // null | '"' | "'" | '`'
    let comment = null; // null | "line" | "block"
    let i = 0;
    const len = Math.min(pos, text.length);
    while (i < len) {
      const ch = text[i];
      if (comment === "line") {
        if (ch === "\n") comment = null;
        i++;
        continue;
      }
      if (comment === "block") {
        if (ch === "*" && text[i + 1] === "/") { comment = null; i += 2; continue; }
        i++;
        continue;
      }
      if (str) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === str) str = null;
        i++;
        continue;
      }
      if (ch === "/" && text[i + 1] === "/") { comment = "line"; i += 2; continue; }
      if (ch === "#") { comment = "line"; i += 1; continue; }
      if (ch === "/" && text[i + 1] === "*") { comment = "block"; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { str = ch; i++; continue; }

      if (ch === "(") {
        let j = i - 1;
        while (j >= 0 && /\s/.test(text[j])) j--;
        const end = j + 1;
        while (j >= 0 && /[A-Za-z0-9_$@]/.test(text[j])) j--;
        const name = text.slice(j + 1, end);
        stack.push({ name, openParen: i, argIndex: 0, brackets: 0 });
      } else if (ch === ")") {
        stack.pop();
      } else if (ch === "[" || ch === "{") {
        if (stack.length > 0) stack[stack.length - 1].brackets++;
      } else if (ch === "]" || ch === "}") {
        if (stack.length > 0) stack[stack.length - 1].brackets--;
      } else if (ch === "," && stack.length > 0 && stack[stack.length - 1].brackets === 0) {
        stack[stack.length - 1].argIndex++;
      }
      i++;
    }
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].name) return stack[k];
    }
    return null;
  }

  function buildSpecTooltipDom(spec, kind, activeIndex, namedArgName) {
    const wrap = document.createElement("div");

    const header = document.createElement("h4");
    const icon = document.createElement("i");
    icon.className = kind === "builtin" ? "fa-solid fa-bolt" : "fa-solid fa-cube";
    header.append(icon, document.createTextNode(` ${kind === "builtin" ? "@" : ""}${spec.name}`));
    const groupLabel = kind === "builtin" ? spec.category : spec.group;
    if (groupLabel) {
      const tag = document.createElement("span");
      tag.className = "pg-cm-group";
      tag.textContent = groupLabel;
      header.append(tag);
    }
    wrap.append(header);

    // Resolve which parameter to highlight: name-based match wins when
    // the cursor sits in a `name:` slot, otherwise fall back to the
    // positional `argIndex`.
    let activeIdx = null;
    if (namedArgName && spec.params.length > 0) {
      const found = spec.params.findIndex((p) => p.name === namedArgName);
      if (found !== -1) activeIdx = found;
    }
    if (
      activeIdx === null &&
      typeof activeIndex === "number" &&
      spec.params.length > 0
    ) {
      activeIdx = Math.min(activeIndex, spec.params.length - 1);
    }

    const sig = document.createElement("code");
    sig.className = "pg-cm-sig";
    if (activeIdx !== null) {
      sig.append(document.createTextNode(`${kind === "builtin" ? "@" : ""}${spec.name}(`));
      spec.params.forEach((p, idx) => {
        if (idx > 0) sig.append(document.createTextNode(", "));
        const text = p.required ? p.name : `${p.name}?`;
        if (idx === activeIdx) {
          const active = document.createElement("span");
          active.className = "pg-cm-active";
          active.textContent = text;
          sig.append(active);
        } else {
          sig.append(document.createTextNode(text));
        }
      });
      sig.append(document.createTextNode(")"));
    } else {
      sig.textContent = spec.signature;
    }
    wrap.append(sig);

    if (spec.description) {
      const desc = document.createElement("p");
      desc.className = "pg-cm-desc";
      desc.textContent = spec.description;
      wrap.append(desc);
    }

    if (activeIdx !== null) {
      const param = spec.params[activeIdx];
      wrap.append(buildParamCard(param));
    } else if (spec.params.length > 0) {
      const ul = document.createElement("ul");
      ul.className = "pg-cm-params";
      for (const p of spec.params) {
        const li = document.createElement("li");
        const nameEl = document.createElement("code");
        nameEl.textContent = `${p.name}${p.required ? "" : "?"}`;
        const typeEl = document.createElement("span");
        typeEl.style.color = "var(--doc-text-muted)";
        typeEl.textContent = `: ${p.type}`;
        li.append(nameEl, typeEl);
        if (p.description) li.append(document.createTextNode(` — ${p.description}`));
        if (p.enumValues && p.enumValues.length > 0) {
          li.append(buildEnumBadges(p.enumValues));
        }
        ul.append(li);
      }
      wrap.append(ul);
    }

    return wrap;
  }

  function buildParamCard(param) {
    const card = document.createElement("div");
    card.className = "pg-cm-param";
    const nameEl = document.createElement("span");
    nameEl.className = "pg-cm-param-name";
    nameEl.textContent = `${param.name}${param.required ? "" : "?"}`;
    const typeEl = document.createElement("span");
    typeEl.className = "pg-cm-param-type";
    typeEl.textContent = `: ${param.type}`;
    card.append(nameEl, typeEl);
    if (param.description) {
      const desc = document.createElement("p");
      desc.className = "pg-cm-param-desc";
      desc.textContent = param.description;
      card.append(desc);
    }
    if (param.enumValues && param.enumValues.length > 0) {
      const label = document.createElement("span");
      label.className = "pg-cm-enum-label";
      label.textContent = "Allowed values";
      card.append(label, buildEnumBadges(param.enumValues));
    }
    return card;
  }

  function buildEnumBadges(values) {
    const list = document.createElement("div");
    list.className = "pg-cm-enum-list";
    for (const value of values) {
      const badge = document.createElement("span");
      badge.className = "pg-cm-enum";
      badge.textContent = value;
      list.append(badge);
    }
    return list;
  }

  // ---- Linter: surface ParseError from runtime/parser ----
  const lintSource = lint.linter((view) => {
    const text = view.state.doc.toString();
    const program = parse(text);
    parseErrors = program.errors;
    refreshStatusErrors();
    return program.errors.map((err) => {
      const line = Math.max(1, err.line || 1);
      const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
      const fromCol = Math.max(0, (err.column || 1) - 1);
      const from = lineInfo.from + Math.min(fromCol, lineInfo.length);
      const to = lineInfo.to;
      return { from, to, severity: "error", message: err.message };
    });
  }, { delay: 250 });

  // ---- Hover tooltip: show component/builtin info when hovering an identifier ----
  const hoverTooltipExt = view.hoverTooltip((cmView, pos) => {
    const doc = cmView.state.doc;
    const text = doc.toString();
    const word = cmView.state.wordAt(pos);
    if (!word) return null;
    const prev = word.from > 0 ? text[word.from - 1] : "";
    const fromIdx = prev === "@" ? word.from - 1 : word.from;
    const rawName = text.slice(fromIdx, word.to);
    const resolved = resolveSpec(rawName);
    if (resolved) {
      return {
        pos: fromIdx,
        end: word.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "pg-cm-tooltip";
          dom.append(buildSpecTooltipDom(resolved.spec, resolved.kind));
          return { dom };
        },
      };
    }

    // Not a component/builtin — fall back to "is this a named-arg key of
    // the enclosing call?". Lets users hover over `variant`, `tone`,
    // `icon`, etc. in `Button("Save", variant: "primary")` and see the
    // exact parameter spec (type, description, allowed values).
    let after = word.to;
    while (after < text.length && /\s/.test(text[after])) after += 1;
    if (text[after] !== ":") return null;
    const enclosing = findEnclosingCall(text, pos);
    if (!enclosing) return null;
    const enclosingResolved = resolveSpec(enclosing.name);
    if (!enclosingResolved) return null;
    const param = enclosingResolved.spec.params.find((p) => p.name === rawName);
    if (!param) return null;
    return {
      pos: word.from,
      end: word.to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "pg-cm-tooltip";
        dom.append(buildSpecTooltipDom(
          enclosingResolved.spec,
          enclosingResolved.kind,
          undefined,
          rawName,
        ));
        return { dom };
      },
    };
  }, { hideOnChange: true, hoverTime: 250 });

  // ---- Signature help: while the cursor is inside a `Name(...)` call, show
  //      the active parameter and its allowed enum values (when present). ----
  const signatureField = state.StateField.define({
    create: computeSignatureTooltip,
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value;
      return computeSignatureTooltip(tr.state);
    },
    provide: (f) => view.showTooltip.from(f),
  });

  function computeSignatureTooltip(s) {
    const sel = s.selection.main;
    if (sel.from !== sel.to) return null;
    const text = s.doc.toString();
    const call = findEnclosingCall(text, sel.head);
    if (!call) return null;
    const resolved = resolveSpec(call.name);
    if (!resolved) return null;
    // Prefer name-based resolution: when the user has typed `variant: …`,
    // pin the active param to `variant` (not whatever positional index
    // happens to fall there). Falls back to `argIndex` for purely
    // positional args.
    const namedArgName = detectActiveNamedArg(text, call, sel.head);
    return {
      pos: sel.head,
      above: true,
      strictSide: false,
      arrow: false,
      create() {
        const dom = document.createElement("div");
        dom.className = "pg-cm-tooltip";
        dom.append(buildSpecTooltipDom(
          resolved.spec,
          resolved.kind,
          call.argIndex,
          namedArgName,
        ));
        return { dom };
      },
    };
  }

  /**
   * Return the name of the named-arg slot the cursor currently sits in
   * (e.g. `"variant"` for `Button("Save", variant: "p|rimary")`) or null
   * for positional args. Walks from the call's open-paren to `pos` using
   * the same comma-depth tracking as `readCurrentArg`.
   */
  function detectActiveNamedArg(text, call, pos) {
    const { argText } = readCurrentArg(text, call, pos);
    const match = argText.match(/^\s*([A-Za-z_]\w*)\s*:/);
    return match ? match[1] : null;
  }

  // ---- Compartments for live updates ----
  const themeCompartment = new state.Compartment();
  const editableCompartment = new state.Compartment();

  // ---- Module-scoped UI state (declared early so closures captured by the
  //      editor's updateListener can reference them safely). ----
  let parseErrors = [];
  let currentRunMode = (lsRead(LS.runMode, "live") === "manual") ? "manual" : "live";
  let inspectOn = lsRead(LS.inspect, "false") === "true";
  let viewMode = lsRead(LS.mode, defaultViewMode());

  // Forward declarations — bodies are assigned once the editor view is built
  // and all UI helpers can safely close over `editorView`.
  let editorView = null;
  let scheduleViewerUpdate = () => {};
  let refreshStatusCursor = () => {};
  let refreshStatusChars = () => {};
  let refreshStatusErrors = () => {};
  let refreshStatusArg = () => {};

  const persistCode = () => { if (editorView) lsWrite(LS.code, editorView.state.doc.toString()); };

  function handleDocChange() {
    persistCode();
    refreshStatusChars();
    if (currentRunMode === "live") scheduleViewerUpdate(false);
  }

  // ---- Build initial state ----
  const initialCode = pickInitialCode();

  const startState = state.EditorState.create({
    doc: initialCode.code,
    extensions: [
      view.lineNumbers(),
      view.highlightActiveLineGutter(),
      view.highlightActiveLine(),
      view.drawSelection(),
      view.dropCursor(),
      state.EditorState.allowMultipleSelections.of(true),
      lang.bracketMatching(),
      lang.foldGutter(),
      lang.indentOnInput(),
      lang.syntaxHighlighting(highlightStyle),
      streamLanguage,
      autocomplete.autocompletion({
        override: [completions],
        activateOnTyping: true,
        defaultKeymap: true,
      }),
      search.highlightSelectionMatches(),
      lintSource,
      lint.lintGutter(),
      hoverTooltipExt,
      signatureField,
      commands.history(),
      view.keymap.of([
        ...commands.defaultKeymap,
        ...commands.historyKeymap,
        ...autocomplete.completionKeymap,
        ...search.searchKeymap,
        ...lint.lintKeymap,
        commands.indentWithTab,
        {
          key: "Mod-Enter",
          run: () => {
            doRun(true);
            return true;
          },
        },
        {
          key: "Mod-Shift-i",
          run: () => {
            toggleInspect();
            return true;
          },
        },
        {
          key: "Mod-k",
          run: () => {
            toggleRunMode();
            return true;
          },
        },
        {
          key: "Mod-s",
          run: () => {
            persistCode();
            showToast("Saved to localStorage", { icon: "floppy-disk" });
            return true;
          },
          preventDefault: true,
        },
      ]),
      view.EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          handleDocChange();
        }
        if (u.selectionSet || u.docChanged) {
          refreshStatusCursor();
          refreshStatusArg();
        }
      }),
      view.EditorView.theme({
        "&": { height: "100%", fontSize: "13px" },
        ".cm-content, .cm-gutter": { minHeight: "100%" },
        ".cm-content": { caretColor: "var(--doc-primary)" },
        ".cm-cursor": { borderLeftColor: "var(--doc-primary)" },
        ".cm-tooltip": {
          background: "var(--doc-surface-elev)",
          border: "1px solid var(--doc-border)",
          borderRadius: "6px",
          color: "var(--doc-text)",
        },
        ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
          background: "var(--doc-primary-soft)",
          color: "var(--doc-primary)",
        },
        ".cm-selectionBackground, ::selection": { background: "var(--doc-primary-soft) !important" },
      }),
      themeCompartment.of([]),
      editableCompartment.of([]),
    ],
  });

  const editorHost = $("pg-editor");
  $("pg-editor-loader").hidden = true;
  editorView = new view.EditorView({ state: startState, parent: editorHost });

  let currentExample = initialCode.example;

  // Make sure the custom element is upgraded before we start dispatching
  // property updates — otherwise the initial `response` assignment would
  // hit a plain HTMLElement and be lost.
  customElements.whenDefined("aktion-app").then(() => {
    scheduleViewerUpdate(true);
  });

  // ---- Initial UI ----
  applyViewMode(viewMode);
  applyRunModeUI(currentRunMode);
  applyInspectUI(inspectOn);
  applySidebarCollapsed(lsRead(LS.sidebarCollapsed, "false") === "true");
  $("pg-example").value = currentExample;
  $("pg-pill-preset").textContent = EXAMPLES[currentExample]?.label ?? "Custom";
  setRendererTheme(lsRead(LS.theme, "light"));
  refreshStatusCursor();
  refreshStatusChars();
  refreshStatusArg();

  // ---- Event wiring: top app bar ----
  $("pg-example").addEventListener("change", (e) => {
    const next = e.target.value;
    loadExample(next);
  });

  $("pg-theme").addEventListener("change", (e) => {
    setRendererTheme(e.target.value);
  });

  // Mode buttons
  for (const btn of document.querySelectorAll(".pg-iconbtn[data-mode]")) {
    btn.addEventListener("click", () => {
      applyViewMode(btn.dataset.mode);
    });
  }

  $("pg-run-mode").addEventListener("click", toggleRunMode);
  $("pg-run").addEventListener("click", () => doRun(true));
  $("pg-inspect").addEventListener("click", toggleInspect);
  $("pg-share").addEventListener("click", doShare);
  $("pg-copy").addEventListener("click", doCopy);
  $("pg-download").addEventListener("click", doDownload);
  $("pg-reset").addEventListener("click", () => loadExample(currentExample, true));
  $("pg-help").addEventListener("click", openHelp);
  $("pg-modal-backdrop").addEventListener("click", (e) => {
    if (e.target === $("pg-modal-backdrop")) closeHelp();
  });
  $("pg-errors-backdrop").addEventListener("click", (e) => {
    if (e.target === $("pg-errors-backdrop")) closeErrorModal();
  });
  $("pg-errors-close").addEventListener("click", closeErrorModal);
  $("pg-fullscreen").addEventListener("click", toggleFullscreen);
  $("pg-status-errors").addEventListener("click", openErrorModal);
  $("pg-sidebar-toggle").addEventListener("click", toggleSidebarCollapsed);

  // Global hotkeys
  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !isInEditor(e.target)) {
      e.preventDefault();
      openHelp();
      return;
    }
    if (e.key === "Escape") {
      closeHelp();
      closeErrorModal();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  });

  // Splitter drag
  initSplitter();

  // Inspect mode handlers
  initInspect();

  // ---- Functions defined within closure ----

  function pickInitialCode() {
    // 1. Shared snippet via `?code=` query string or `#code=` hash. The
    //    chat-bot opens links as `playground.html?code=...`; older share
    //    links use the hash. Both formats use the same gzip+base64 codec.
    const shared = readSharedCode();
    if (shared) {
      scheduleHydrateFromHash(shared);
      return { code: "// Loading shared snippet…", example: "custom" };
    }
    // 2. Saved code
    const saved = lsRead(LS.code, null);
    const savedExample = lsRead(LS.example, DEFAULT_EXAMPLE);
    if (saved !== null) {
      return { code: saved, example: savedExample };
    }
    // 3. Default example
    return { code: EXAMPLES[DEFAULT_EXAMPLE].code, example: DEFAULT_EXAMPLE };
  }

  function readSharedCode() {
    const params = new URLSearchParams(location.search);
    const queryCode = params.get("code");
    if (queryCode) return queryCode;
    if (location.hash.startsWith("#code=")) {
      return location.hash.slice("#code=".length);
    }
    return null;
  }

  async function scheduleHydrateFromHash(encoded) {
    try {
      const text = await decodeShare(encoded);
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: text },
      });
      currentExample = "custom";
      $("pg-pill-preset").textContent = "Shared snippet";
      showToast("Loaded shared snippet", { icon: "link" });
    } catch (err) {
      console.error(err);
      showToast("Couldn't decode shared link", { icon: "triangle-exclamation" });
    }
  }

  function defaultViewMode() {
    return window.matchMedia("(max-width: 880px)").matches ? "split-v" : "split-h";
  }

  function applyViewMode(mode) {
    if (!["split-h", "split-v", "editor-only", "viewer-only"].includes(mode)) {
      mode = "split-h";
    }
    viewMode = mode;
    const ws = $("pg-workspace");
    ws.dataset.mode = mode;
    for (const btn of document.querySelectorAll(".pg-iconbtn[data-mode]")) {
      btn.setAttribute("aria-pressed", btn.dataset.mode === mode ? "true" : "false");
    }
    lsWrite(LS.mode, mode);
    if (mode === "split-h") {
      applySplitRatio("split-h", readSplitRatio(LS.split));
    } else if (mode === "split-v") {
      applySplitRatio("split-v", readSplitRatio(LS.splitV));
    }
  }

  function readSplitRatio(key) {
    const stored = lsRead(key, "");
    const parsed = parseFloat(stored);
    return clampSplitRatio(parsed);
  }

  function applySplitRatio(mode, ratio) {
    const ws = $("pg-workspace");
    const safe = clampSplitRatio(ratio);
    const template = `${safe}fr ${SPLIT_GUTTER} ${1 - safe}fr`;
    if (mode === "split-h") {
      ws.style.setProperty("--pg-split", template);
      lsWrite(LS.split, String(safe));
    } else if (mode === "split-v") {
      ws.style.setProperty("--pg-split-v", template);
      lsWrite(LS.splitV, String(safe));
    }
  }

  function setRendererTheme(name) {
    const target = $("pg-target");
    target.setAttribute("theme", name);
    $("pg-theme").value = name;
    $("pg-pill-theme").textContent = name;
    lsWrite(LS.theme, name);
  }

  function toggleRunMode() {
    currentRunMode = currentRunMode === "live" ? "manual" : "live";
    applyRunModeUI(currentRunMode);
    lsWrite(LS.runMode, currentRunMode);
    if (currentRunMode === "live") scheduleViewerUpdate(true);
  }

  function applyRunModeUI(mode) {
    const btn = $("pg-run-mode");
    btn.setAttribute("aria-pressed", mode === "live" ? "true" : "false");
    $("pg-run-label").textContent = mode === "live" ? "Live" : "Manual";
    $("pg-run").disabled = mode === "live";
  }

  function toggleInspect() {
    inspectOn = !inspectOn;
    applyInspectUI(inspectOn);
    lsWrite(LS.inspect, inspectOn ? "true" : "false");
  }

  function toggleSidebarCollapsed() {
    const layout = document.querySelector(".layout");
    if (!layout) return;
    const next = layout.getAttribute("data-sidebar-collapsed") !== "true";
    applySidebarCollapsed(next);
  }

  function applySidebarCollapsed(collapsed) {
    const layout = document.querySelector(".layout");
    if (!layout) return;
    layout.setAttribute("data-sidebar-collapsed", collapsed ? "true" : "false");
    const btn = $("pg-sidebar-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
      btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    }
    lsWrite(LS.sidebarCollapsed, collapsed ? "true" : "false");
  }

  function applyInspectUI(on) {
    $("pg-inspect").setAttribute("aria-pressed", on ? "true" : "false");
    $("pg-viewer-pane").setAttribute("data-inspect", on ? "true" : "false");
    if (!on) hideInspectOverlay();
  }

  async function doShare() {
    try {
      const code = editorView.state.doc.toString();
      const encoded = await encodeShare(code);
      const url = `${location.origin}${location.pathname}#code=${encoded}`;
      await navigator.clipboard.writeText(url);
      location.hash = `#code=${encoded}`;
      showToast("Share link copied", { icon: "link" });
    } catch (err) {
      console.error(err);
      showToast("Couldn't copy share link", { icon: "triangle-exclamation" });
    }
  }

  async function doCopy() {
    try {
      await navigator.clipboard.writeText(editorView.state.doc.toString());
      showToast("Code copied", { icon: "copy" });
    } catch {
      showToast("Couldn't copy code", { icon: "triangle-exclamation" });
    }
  }

  function doDownload() {
    try {
      const code = editorView.state.doc.toString();
      const theme = $("pg-target").getAttribute("theme") || "light";
      const exampleLabel = EXAMPLES[currentExample]?.label ?? "Aktion app";
      const title = `${exampleLabel} · Aktion`;
      downloadStandaloneHtml(code, theme, title);
      showToast("HTML downloaded", { icon: "download" });
    } catch (err) {
      console.error(err);
      showToast("Couldn't download file", { icon: "triangle-exclamation" });
    }
  }

  function loadExample(key, force) {
    const ex = EXAMPLES[key];
    if (!ex) return;
    const cur = editorView.state.doc.toString();
    const isDirty =
      cur !== EXAMPLES[currentExample]?.code &&
      cur !== ex.code;
    if (isDirty && !force) {
      if (!window.confirm("Replace your current code with this example?")) {
        // Revert dropdown to current example
        $("pg-example").value = currentExample;
        return;
      }
    }
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: ex.code },
    });
    currentExample = key;
    $("pg-pill-preset").textContent = ex.label;
    lsWrite(LS.example, key);
  }

  function doRun(force) {
    scheduleViewerUpdate(true, force);
  }

  scheduleViewerUpdate = debounce((immediate, force) => {
    if (!editorView) return;
    const target = $("pg-target");
    const code = editorView.state.doc.toString();
    if (force || currentRunMode === "live" || immediate) {
      if (typeof target.setResponse === "function") {
        target.setResponse(code);
      } else {
        target.setAttribute("response", code);
      }
    }
    // The inspect index gets refreshed by the MutationObserver attached in
    // `initInspect()` once the shadow DOM finishes updating.
  }, 250);

  refreshStatusErrors = () => {
    const btn = $("pg-status-errors");
    const text = $("pg-status-errors-text");
    if (parseErrors.length === 0) {
      btn.dataset.tone = "success";
      btn.querySelector("i").className = "fa-solid fa-check";
      text.textContent = "No errors";
    } else {
      btn.dataset.tone = "danger";
      btn.querySelector("i").className = "fa-solid fa-triangle-exclamation";
      text.textContent = `${parseErrors.length} error${parseErrors.length === 1 ? "" : "s"}`;
    }
    if ($("pg-errors-backdrop") && !$("pg-errors-backdrop").hidden) {
      renderErrorList();
    }
  };

  refreshStatusCursor = () => {
    if (!editorView) return;
    const pos = editorView.state.selection.main.head;
    const lineInfo = editorView.state.doc.lineAt(pos);
    $("pg-status-cursor").innerHTML =
      `<i class="fa-solid fa-arrow-pointer" aria-hidden="true"></i> Ln ${lineInfo.number}, Col ${pos - lineInfo.from + 1}`;
  };

  refreshStatusChars = () => {
    if (!editorView) return;
    const n = editorView.state.doc.length;
    $("pg-status-chars").innerHTML =
      `<i class="fa-solid fa-text-width" aria-hidden="true"></i> ${n} char${n === 1 ? "" : "s"}`;
  };

  refreshStatusArg = () => {
    const pill = $("pg-status-arg");
    if (!editorView || !pill) return;
    const sel = editorView.state.selection.main;
    if (sel.from !== sel.to) {
      pill.hidden = true;
      return;
    }
    const text = editorView.state.doc.toString();
    const call = findEnclosingCall(text, sel.head);
    if (!call || !call.name) {
      pill.hidden = true;
      return;
    }
    const resolved = resolveSpec(call.name);
    if (!resolved) {
      pill.hidden = true;
      return;
    }
    const namedArgName = detectActiveNamedArg(text, call, sel.head);
    let param = null;
    if (namedArgName) {
      param = resolved.spec.params.find((p) => p.name === namedArgName) ?? null;
    }
    if (!param && resolved.spec.params.length > 0) {
      param = resolved.spec.params[
        Math.min(call.argIndex, resolved.spec.params.length - 1)
      ];
    }
    if (!param) {
      pill.hidden = true;
      return;
    }
    const optional = param.required ? "" : "?";
    pill.innerHTML = "";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-bullseye";
    icon.style.fontSize = "10px";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createTextNode(
      ` ${call.name}(${param.name}${optional}: ${param.type})`,
    );
    pill.append(icon, label);
    pill.title = param.description
      ? `${param.name}: ${param.type} — ${param.description}`
      : `${param.name}: ${param.type}`;
    pill.hidden = false;
  };

  function jumpToError(err) {
    if (!err || !editorView) return;
    const line = err.line;
    const isGlobal = !Number.isFinite(line) || line < 1;
    if (isGlobal) return;
    const lineNum = Math.min(Math.max(1, line), editorView.state.doc.lines);
    const lineInfo = editorView.state.doc.line(lineNum);
    const col = Math.min(Math.max(0, (err.column || 1) - 1), lineInfo.length);
    editorView.dispatch({
      selection: { anchor: lineInfo.from + col },
      scrollIntoView: true,
    });
    editorView.focus();
    flashLine(lineInfo);
  }

  function openErrorModal() {
    renderErrorList();
    $("pg-errors-backdrop").hidden = false;
  }

  function closeErrorModal() {
    $("pg-errors-backdrop").hidden = true;
  }

  function renderErrorList() {
    const list = $("pg-errors-list");
    const title = $("pg-errors-title-text");
    const lede = $("pg-errors-lede");
    list.replaceChildren();

    const total = parseErrors.length;
    title.textContent = total === 0
      ? "No errors"
      : `${total} error${total === 1 ? "" : "s"}`;

    if (total === 0) {
      lede.hidden = true;
      const empty = document.createElement("div");
      empty.className = "pg-errors-empty";
      empty.innerHTML = '<i class="fa-solid fa-check"></i> Your program parses cleanly.';
      list.append(empty);
      return;
    }
    lede.hidden = false;

    // Errors at line 0/undefined are surfaced as "Global" — they happen
    // when the parser couldn't anchor the diagnostic to a position (for
    // example: missing `_app_` binding, structural failures, theme-level
    // diagnostics). Showing them up front prevents the "errors with no
    // editor markers" confusion.
    const sorted = parseErrors
      .map((err, idx) => ({ ...err, _index: idx }))
      .sort((a, b) => {
        const aGlobal = !Number.isFinite(a.line) || a.line < 1;
        const bGlobal = !Number.isFinite(b.line) || b.line < 1;
        if (aGlobal !== bGlobal) return aGlobal ? -1 : 1;
        return (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0);
      });

    for (const err of sorted) {
      const isGlobal = !Number.isFinite(err.line) || err.line < 1;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "pg-error-item";
      item.dataset.severity = err.severity || "error";
      item.dataset.global = isGlobal ? "true" : "false";

      const loc = document.createElement("span");
      loc.className = "pg-error-loc";
      loc.dataset.global = isGlobal ? "true" : "false";
      loc.textContent = isGlobal
        ? "Global"
        : `Ln ${err.line}, Col ${err.column || 1}`;

      const msg = document.createElement("span");
      msg.className = "pg-error-message";
      msg.textContent = err.message || "Unknown error";

      const jump = document.createElement("span");
      jump.className = "pg-error-jump";
      jump.textContent = "Jump →";

      item.append(loc, msg, jump);
      if (!isGlobal) {
        item.addEventListener("click", () => {
          jumpToError(err);
          closeErrorModal();
        });
      } else {
        item.style.cursor = "default";
      }
      list.append(item);
    }
  }

  function openHelp() {
    $("pg-modal-backdrop").hidden = false;
  }
  function closeHelp() {
    $("pg-modal-backdrop").hidden = true;
  }

  function toggleFullscreen() {
    const pane = $("pg-viewer-pane");
    if (document.fullscreenElement === pane) {
      document.exitFullscreen().catch(() => {});
    } else if (pane.requestFullscreen) {
      pane.requestFullscreen().catch(() => {
        // Fallback: viewer-only mode
        applyViewMode("viewer-only");
      });
    } else {
      applyViewMode("viewer-only");
    }
  }

  // ---- Splitter drag ----
  function initSplitter() {
    const splitter = $("pg-splitter");
    const ws = $("pg-workspace");
    let dragging = false;
    const onDown = (e) => {
      if (ws.dataset.mode !== "split-h" && ws.dataset.mode !== "split-v") return;
      dragging = true;
      splitter.dataset.dragging = "true";
      document.body.style.userSelect = "none";
      document.body.style.cursor = ws.dataset.mode === "split-v" ? "row-resize" : "col-resize";
      splitter.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = ws.getBoundingClientRect();
      if (ws.dataset.mode === "split-h") {
        applySplitRatio("split-h", (e.clientX - rect.left) / rect.width);
      } else if (ws.dataset.mode === "split-v") {
        applySplitRatio("split-v", (e.clientY - rect.top) / rect.height);
      }
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      splitter.dataset.dragging = "false";
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      splitter.releasePointerCapture?.(e.pointerId);
    };
    splitter.addEventListener("pointerdown", onDown);
    splitter.addEventListener("pointermove", onMove);
    splitter.addEventListener("pointerup", onUp);
    splitter.addEventListener("pointercancel", onUp);
    splitter.addEventListener("lostpointercapture", () => onUp({ pointerId: -1 }));

    splitter.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -0.05 : 0.05;
      const mode = ws.dataset.mode === "split-v" ? "split-v" : "split-h";
      const lsKey = mode === "split-v" ? LS.splitV : LS.split;
      applySplitRatio(mode, readSplitRatio(lsKey) + delta);
      e.preventDefault();
    });
  }

  // ---- Inspect mode ----

  /**
   * Index of DOM elements rendered in the shadow root → AST source info.
   * Rebuilt after every render via `refreshInspectIndex()`.
   */
  let inspectIndex = new WeakMap();
  let inspectOrderedAst = [];

  function initInspect() {
    const target = $("pg-target");
    const overlay = $("pg-inspect-overlay");
    const tooltip = $("pg-inspect-tooltip");

    // Make sure overlay sits outside any shadow tree (it already does — it's
    // appended at document body level). It's pointer-events: none so it
    // never absorbs clicks.

    const onPointerMove = (e) => {
      if (!inspectOn) return;
      const path = e.composedPath();
      const el = path.find((node) =>
        node instanceof Element &&
        node !== target &&
        node !== target.shadowRoot &&
        node.tagName !== "AKTION-APP" &&
        node.classList && node.classList.length > 0,
      );
      if (!el) return hideInspectOverlay();
      const matched = matchComponentForElement(el);
      if (!matched) return hideInspectOverlay();
      showInspect(matched.element, matched.componentName, matched.astEntry);
    };

    const onClick = (e) => {
      if (!inspectOn) return;
      const path = e.composedPath();
      const el = path.find((node) =>
        node instanceof Element &&
        node.classList && node.classList.length > 0 &&
        node.tagName !== "AKTION-APP",
      );
      if (!el) return;
      const matched = matchComponentForElement(el);
      if (!matched || !matched.astEntry) return;
      e.preventDefault();
      e.stopPropagation();
      jumpToLine(matched.astEntry.line);
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerleave", () => hideInspectOverlay());
    target.addEventListener("click", onClick, true);

    // Re-index on attribute changes via a mutation observer on the shadow root
    const observe = () => {
      if (!target.shadowRoot) return;
      const mo = new MutationObserver(() => {
        // Rebuild the index lazily on next animation frame to coalesce bursts.
        cancelAnimationFrame(observe._raf);
        observe._raf = requestAnimationFrame(() => refreshInspectIndex());
      });
      mo.observe(target.shadowRoot, { childList: true, subtree: true });
    };
    queueMicrotask(observe);
  }

  function matchComponentForElement(el) {
    let cursor = el;
    while (cursor && cursor !== document.body) {
      const componentName = componentNameFromClasses(cursor);
      if (componentName) {
        const astEntry = inspectIndex.get(cursor);
        return { element: cursor, componentName, astEntry };
      }
      cursor = cursor.parentElement || cursor.getRootNode().host;
      if (!cursor) break;
    }
    return null;
  }

  function componentNameFromClasses(el) {
    if (!el || !el.classList) return null;
    for (const cls of el.classList) {
      const name = cssClassToComponent.get(cls);
      if (name) return name;
    }
    return null;
  }

  function showInspect(element, componentName, astEntry) {
    const overlay = $("pg-inspect-overlay");
    const tooltip = $("pg-inspect-tooltip");
    const rect = element.getBoundingClientRect();
    overlay.hidden = false;
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const spec = langSpec.componentsByName[componentName];
    if (!spec) return;

    tooltip.innerHTML = "";
    const h = document.createElement("h4");
    h.innerHTML = `<i class="fa-solid fa-cube"></i> ${spec.name} <span style="font-weight:400; color:var(--doc-text-muted)">· ${spec.group}</span>`;
    tooltip.append(h);
    const sig = document.createElement("code");
    sig.className = "pg-inspect-sig";
    sig.textContent = spec.signature;
    tooltip.append(sig);
    if (spec.description) {
      const p = document.createElement("p");
      p.className = "pg-inspect-desc";
      p.textContent = spec.description;
      tooltip.append(p);
    }
    if (spec.params.length > 0) {
      const ul = document.createElement("ul");
      ul.className = "pg-inspect-params";
      for (const p of spec.params) {
        const li = document.createElement("li");
        const opt = p.required ? "" : "?";
        li.innerHTML =
          `<code>${p.name}${opt}</code>: <span style="color:var(--doc-text-muted)">${p.type}</span>` +
          (p.enumValues ? ` <small style="color:var(--doc-text-subtle)">${p.enumValues.join(" | ")}</small>` : "");
        ul.append(li);
      }
      tooltip.append(ul);
    }
    if (astEntry) {
      const meta = document.createElement("div");
      meta.className = "pg-inspect-meta";
      meta.innerHTML = `<i class="fa-solid fa-code-branch"></i> Source: line ${astEntry.line} · <em>click to jump</em>`;
      tooltip.append(meta);
    }
    tooltip.hidden = false;
    // Position tooltip beside the element.
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width + 8;
    let top = rect.top;
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = Math.max(8, rect.left - tooltipRect.width - 8);
    }
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - tooltipRect.height - 8);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideInspectOverlay() {
    $("pg-inspect-overlay").hidden = true;
    $("pg-inspect-tooltip").hidden = true;
  }

  function refreshInspectIndex() {
    const target = $("pg-target");
    if (!target.shadowRoot) return;
    inspectIndex = new WeakMap();
    const source = editorView.state.doc.toString();
    const program = parse(source);

    // Walk AST in document order, collecting every Call expression whose
    // callee is a known component name. The result is a flat list in source
    // order, including nested calls.
    const astOrdered = [];
    const visit = (expr) => {
      if (!expr || typeof expr !== "object") return;
      if (expr.kind === "Call" && componentNames.has(expr.callee)) {
        astOrdered.push({
          name: expr.callee,
          line: expr.loc?.line ?? 0,
          column: expr.loc?.column ?? 0,
        });
        for (const a of expr.arguments) visit(a);
        return;
      }
      switch (expr.kind) {
        case "Array":
          for (const el of expr.elements) visit(el);
          break;
        case "Object":
          for (const p of expr.properties) visit(p.value);
          break;
        case "Member":
          visit(expr.object);
          break;
        case "Unary":
          visit(expr.argument);
          break;
        case "Binary":
          visit(expr.left); visit(expr.right);
          break;
        case "Ternary":
          visit(expr.test); visit(expr.consequent); visit(expr.alternate);
          break;
        case "BuiltinCall":
          for (const a of expr.arguments) visit(a);
          break;
        case "Call":
          for (const a of expr.arguments) visit(a);
          break;
      }
    };
    for (const stmt of program.statements) visit(stmt.expression);
    inspectOrderedAst = astOrdered;

    // Walk the rendered shadow DOM in document order; for each element whose
    // class matches a known component, pair it with the next matching AST
    // entry of the same name.
    const queueByName = new Map();
    for (const entry of astOrdered) {
      if (!queueByName.has(entry.name)) queueByName.set(entry.name, []);
      queueByName.get(entry.name).push(entry);
    }
    const walk = (node) => {
      if (!(node instanceof Element)) return;
      const name = componentNameFromClasses(node);
      if (name) {
        const q = queueByName.get(name);
        if (q && q.length > 0) {
          inspectIndex.set(node, q.shift());
        }
      }
      for (const child of node.children) walk(child);
    };
    walk(target.shadowRoot);
  }

  function jumpToLine(line) {
    if (!line || line < 1) return;
    const lineNum = Math.min(line, editorView.state.doc.lines);
    const lineInfo = editorView.state.doc.line(lineNum);
    editorView.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
      effects: view.EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
    });
    editorView.focus();
    // Brief highlight for visual feedback
    flashLine(lineInfo);
  }

  function flashLine(lineInfo) {
    // Lightweight visual flash — apply a class to the rendered .cm-line via
    // DOM directly so we don't need a StateField + Decoration plumbing here.
    requestAnimationFrame(() => {
      const lines = editorView.dom.querySelectorAll(".cm-line");
      const targetLine = lines[lineInfo.number - 1];
      if (targetLine) {
        targetLine.classList.add("pg-source-highlight");
        setTimeout(() => targetLine.classList.remove("pg-source-highlight"), 900);
      }
    });
  }

  function isInEditor(target) {
    if (!target) return false;
    return target.closest && target.closest(".cm-editor");
  }

  // Subscribe to runtime error events as a redundant source for the linter
  // (covers cases where the linter hasn't run yet).
  $("pg-target").addEventListener("error", (e) => {
    if (Array.isArray(e.detail?.errors)) {
      parseErrors = e.detail.errors;
      refreshStatusErrors();
    }
  });
}
