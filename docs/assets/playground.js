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
  linkProject,
  resolveSpecifier,
  defineCompiledProgram,
  COMPILED_PROGRAM_VERSION,
} from "../../dist/aktion.js";

// Public CDN URL embedded in standalone HTML exports so the downloaded file
// runs anywhere without a local build step. Mirrors the constant used by
// `chat-bot.js`.
const CDN_BUNDLE = "https://asfand-dev.github.io/aktion/dist/aktion.js";

// The DevTools panel ships as a separate, opt-in bundle. We resolve it
// relative to this module so it works both from the repo root (dev server →
// `/dist/devtools.js`) and the deployed site, where `build-docs.mjs` rewrites
// `../../dist/devtools` → `../dist/devtools`. Imported lazily on first use so
// the panel UI is only fetched when the user actually opens DevTools.
const DEVTOOLS_BUNDLE = new URL("../../dist/devtools.js", import.meta.url).href;

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
    code: `// Highlights: one positional + named args everywhere, template literals, FollowUpBlock dispatch.
$app(Stack([greeting, sample, follow]))

greeting = Card([
  CardHeader("Hello, world", { subtitle: "Edit this text and watch it update" })
])

sample = Card([
  CardHeader("Sample stats"),
  Stats([
    StatCard("Active users", { value: \`\${$util.format(12540, "number")}\`, trend: "up",   delta: "+12% vs last week", icon: "users" }),
    StatCard("Revenue",      { value: \`\${$util.format(48230, "currency", "USD")}\`, trend: "flat", delta: "stable",       icon: "sack-dollar" }),
    StatCard("Errors",       { value: "12", trend: "down", delta: "-32%", icon: "triangle-exclamation" })
  ])
])

follow = FollowUpBlock([
  FollowUpItem("Add a chart"),
  FollowUpItem("Show an alert"),
  FollowUpItem("Export as CSV")
], { title: "Try editing" })`,
  },
  modules: {
    label: "Multi-file modules",
    // A multi-file example: the entry imports a component from one file and a
    // shared `$state` store from another. Open the other files in the explorer
    // on the left — edit any of them and the preview re-links live.
    files: {
      "app.aktion": `// Entry file. Imports a component + a shared store from sibling files.
import { PrimaryButton } from "./Button.aktion"
import { $count, increment } from "./store.aktion"

$app(Column([
  Card([
    CardHeader("Multi-file counter", { subtitle: "Imported button + shared store" }),
    Text(\`Count: \${$count}\`),
    PrimaryButton({ label: "Increment", onClick: increment })
  ])
], { gap: "l", align: "center", padding: "xl" }))`,
      "Button.aktion": `// A reusable button. \`icon\` is private to this module — another file can
// declare its own \`icon\` without clashing (true module scope).
icon = "bolt"

export function PrimaryButton({ label, onClick }) {
  return Button(label, { variant: "primary", icon: icon, onClick: onClick })
}`,
      "store.aktion": `// A shared reactive store. \`$count\` and \`increment\` are imported by
// app.aktion; both files read and write the SAME atom after linking.
export $count = 0

export function increment() {
  $count = $count + 1
}`,
    },
  },
  dashboard: {
    label: "Project dashboard",
    code: `// Highlights: function declaration, for-loop with destructuring, named args, Badge tone alias.
projects = [
  {title: "Migrate auth",      description: "Roll out the new SDK.",   tags: ["auth"],     assignee: "Asha", tone: "default", icon: "shield-halved",       stage: "todo"},
  {title: "Streaming UI v2",   description: "20 new components.",      tags: ["frontend"], assignee: "Alex", tone: "primary", icon: "wand-magic-sparkles", stage: "doing"},
  {title: "Mobile onboarding", description: "Awaiting design review.", tags: ["mobile"],   assignee: "Wren", tone: "warning", icon: "mobile-screen",       stage: "review"},
  {title: "Activity timeline", description: "Shipped to everyone.",    tags: ["shipped"],  assignee: "Mira", tone: "success", icon: "circle-check",        stage: "done"}
]

$atRisk = $util.filter(projects, "tone", "==", "warning")

function Card2(p) {
  return KanbanCard(p.title, { description: p.description, tags: p.tags, assignee: p.assignee, tone: p.tone, icon: p.icon })
}

$app(Stack([
  PageHeader(
    "Engineering Q3",
    {
      subtitle: \`\${$util.count(projects)} active · \${$util.count($atRisk)} at risk\`,
      breadcrumbs: ["Workspace", "Engineering"],
      status: Badge("On track", { tone: "success" })
    }
  ),
  Stats([
    StatCard("Active",  { value: \`\${$util.count(projects)}\`,   trend: "flat", delta: "0 vs last week",                          icon: "folder" }),
    StatCard("At risk", { value: \`\${$util.count($atRisk)}\`,    trend: "up",   delta: "+1 vs last week",                         icon: "triangle-exclamation" }),
    StatCard("Shipped", { value: "8",                       trend: "up",   delta: "+3 vs last week",                         icon: "rocket" }),
    StatCard("On-time", { value: "87%",                     trend: "down", delta: "-3% vs last week",                        icon: "clock" })
  ]),
  KanbanBoard([
    KanbanColumn("To do",  { items: $util.filter(projects, "stage", "==", "todo").map(p => Card2(p)) }),
    KanbanColumn("Doing",  { items: $util.filter(projects, "stage", "==", "doing").map(p => Card2(p)), tone: "primary" }),
    KanbanColumn("Review", { items: $util.filter(projects, "stage", "==", "review").map(p => Card2(p)), tone: "warning" }),
    KanbanColumn("Done",   { items: $util.filter(projects, "stage", "==", "done").map(p => Card2(p)), tone: "success" })
  ])
]))`,
  },
  todo: {
    label: "Reactive todo",
    code: `// Highlights: $-prefixed reactive state, template literals, .map for lists, ternary for the empty state.
$todos = [{id: 1, text: "Welcome — try editing. Refresh me, I persist!", done: false}]
$draft = ""

function addTodo() {
  $todos = [...$todos, {id: $todos.length + 1, text: $draft, done: false}]
  $draft = ""
}

function Row(t) {
  return Card([Stack([
    Text(t.text),
    Button("Delete", { action: () => { $todos = $util.filter($todos, "id", "!=", t.id) }, variant: "ghost", size: "small" })
  ], { direction: "row", gap: "s", align: "center", justify: "between" })])
}

list = $todos.map(t => Row(t))
body = $todos.length > 0
  ? list
  : EmptyState("Nothing to do", { description: "Add a task above to get started.", icon: "list-check" })

$app(Stack([
  Card([CardHeader("Todo list", { subtitle: \`\${$util.count($todos)} \${$util.plural($util.count($todos), "task", "tasks")} · persisted across reloads\` })]),
  Input("draft-input", { placeholder: "What needs doing?", value: $draft }),
  Button("Add", { action: addTodo, variant: "primary" }),
  body
]))`,
  },
  reactiveApp: {
    label: "Reactive app",
    code: `$app(Grid([items, addBtn], 2))

$events = [
  { title: "Product Sync" },
  { title: "Design Review" },
  { title: "Daily Standup" },
]

function removeItem(name) {
  $events = $util.filter($events, "title", "!=", name)
}

function addEvent() {
  $events = [...$events, { title: \`New Event \${$util.now()}\` }]
}

function Item(name) {
  return Card([
    Text(name),
    Button("Remove", { size: "xs", action: () => { removeItem(name) } })
  ])
}

addBtn = Card([Button("New Event", { variant: "ghost", action: addEvent })])

items = $events.map(e => Item(e.title))`,
  },
  routing: {
    label: "Routing demo",
    code: `// Highlights: $router({…}) call, params injected per-arm, route.path reads, named-arg NavLink.
page = $router({
  "/":          Card([CardHeader("Welcome", { subtitle: "Click a link above to navigate" })]),
  "/dashboard": Card([
    CardHeader("Dashboard"),
    Text(\`Live path: \${route.path}\`)
  ]),
  "/users/:id": Card([
    CardHeader(\`User \${params.id}\`),
    Text(\`Looking at user \${params.id}\`)
  ]),
  default:      Callout("Not found", { tone: "warning", description: \`Nothing here at \${route.path}.\` })
})

nav = Stack([
  NavLink("Home",      { to: "/",            variant: "ghost" }),
  NavLink("Dashboard", { to: "/dashboard",   variant: "ghost" }),
  NavLink("Alice",     { to: "/users/alice", variant: "ghost" })
], { direction: "row", gap: "s" })

$app(Stack([nav, page]))`,
  },
  counter: {
    label: "JS counter",
    code: `// Highlights: actions assign $atoms directly, @Clamp safe arithmetic, ?? for fallbacks.
$count = 0

function inc() { $count = ($count ?? 0) + 1 }
function dec() { $count = ($count ?? 0) - 1 }
function reset() { $count = 0 }

$app(Card([
  CardHeader("JS counter", { subtitle: "Three actions, one $atom." }),
  Stack([
    Text(\`Current: \${$util.clamp($count, -99, 99)}\`),
    Stack([
      Button("-",     { action: dec }),
      Button("Reset", { action: reset, variant: "ghost" }),
      Button("+",     { action: inc,   variant: "primary" })
    ], { direction: "row", gap: "s" })
  ])
]))`,
  },
  chart: {
    label: "Chart + metrics",
    code: `// Highlights: derived totals via @Sum + template literals, responsive Grid for chart row.
$range = "7"
thisWk = [820, 1240, 1500, 1180, 1310, 980, 740]
lastWk = [780, 1180, 1420, 1090, 1240, 920, 690]

$app(Stack([
  PageHeader("Analytics", { subtitle: \`Daily traffic last \${$range} days\` }),
  Stats([
    StatCard("Sessions",     { value: \`\${$util.format($util.sum(thisWk), "number")}\`, trend: "up",   delta: \`+\${$util.round(($util.sum(thisWk) / $util.sum(lastWk) - 1) * 100, 1)}%\`, icon: "chart-line" }),
    StatCard("Avg duration", { value: "3m 12s",                              trend: "flat", delta: "stable",                                                     icon: "clock" }),
    StatCard("Bounce rate",  { value: "32%",                                 trend: "down", delta: "-2%",                                                        icon: "arrow-trend-down" })
  ]),
  Grid([
    Card([
      CardHeader("Sessions"),
      LineChart(["Mo","Tu","We","Th","Fr","Sa","Su"],
        { series: [Series("This week", { values: thisWk }), Series("Last week", { values: lastWk })] })
    ]),
    Card([
      CardHeader("By channel"),
      PieChart(["Organic","Direct","Referral"], { values: [60, 25, 15] })
    ])
  ], { columns: {sm: 1, md: 2}, gap: "l" })
]))`,
  },
  dataGrid: {
    label: "DataGrid + bulk actions",
    code: `// Highlights: sortable DataGrid, per-column filter chips, $-prefixed selection state, bulk-action toolbar.
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

bulkBar = $util.count($selectedIds) > 0
  ? Toolbar(
      {
        left: [Badge(\`\${$util.count($selectedIds)} selected\`, { tone: "primary", icon: "check", size: "sm" })],
        right: [
          Button("Email",  { variant: "ghost",     size: "small", icon: "envelope" }),
          Button("Export", { variant: "secondary", size: "small", icon: "file-csv" }),
          Button("Clear",  { action: () => { $selectedIds = [] }, variant: "ghost", size: "small" })
        ]
      }
    )
  : null

$app(Stack([
  PageHeader(
    "Top contributors",
    {
      subtitle: \`\${$util.count(people)} engineers · sorted by \${$sort.key} \${$sort.direction}\`,
      breadcrumbs: ["Workspace", "Engineering"]
    }
  ),
  bulkBar,
  Card([
    SectionHeader("Leaderboard", { eyebrow: "DATAGRID", actions: [Badge("Live", { tone: "success", icon: "circle", size: "sm" })] }),
    DataGrid([
      Col("Id",      { values: people.id,      align: "left" }),
      Col("Name",    { values: people.name,    align: "left",  sortable: true, filterable: true }),
      Col("Team",    { values: people.team,    align: "left",  sortable: true, filterable: true }),
      Col("Score",   { values: people.score,   align: "right", format: "number", sortable: true }),
      Col("Commits", { values: people.commits, align: "right", format: "number", sortable: true })
    ], { rowIds: people.id, sort: $sort, selectedIds: $selectedIds, page: $page, perPage: 5, emptyLabel: "No people match" })
  ])
]))`,
  },
  calendar: {
    label: "CalendarView planner",
    code: `// Highlights: CalendarView grid, OnboardingChecklist with reactive state, ActivityLog timeline.
$selectedDate = "2026-05-17"
$ob1 = false
$ob2 = false
$ob3 = false

$obDone = ($ob1 ? 1 : 0) + ($ob2 ? 1 : 0) + ($ob3 ? 1 : 0)

events = [
  {date: "2026-05-04", title: "Sprint planning", time: "09:00", tone: "primary"},
  {date: "2026-05-12", title: "Standup",         time: "09:00", tone: "primary"},
  {date: "2026-05-12", title: "1:1 · Ada",       time: "16:00", tone: "info"},
  {date: "2026-05-15", title: "Release window",  time: "10:00", tone: "success"},
  {date: "2026-05-17", title: "Demo day",        time: "14:30", tone: "success"},
  {date: "2026-05-22", title: "Retro",           time: "16:00", tone: "info"}
]

$app(Stack([
  PageHeader("May 2026", { subtitle: \`\${$util.count(events)} events · \${$obDone}/3 onboarding\` }),
  Grid([
    Card([
      SectionHeader("Calendar", { subtitle: "Focus a day to see details", eyebrow: "PLANNER" }),
      CalendarView($selectedDate, { month: "2026-05", events: events, view: "month" })
    ]),
    Stack([
      Card([
        SectionHeader("Onboarding", { subtitle: "Finish setup to enable publishing", eyebrow: "SETUP" }),
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
    ], { direction: "column", gap: "l" })
  ], { columns: {sm: 1, lg: 2}, gap: "l" })
]))`,
  },
  media: {
    label: "Media gallery + Map",
    code: `// Highlights: Carousel hero, Gallery wired to Lightbox via $variable, VideoPlayer + AudioPlayer + Map.
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

slides = photos.map(p => ({src: p.src, alt: p.caption, caption: p.caption}))

$app(Stack([
  PageHeader("Aurora Expedition", { subtitle: "Iceland · Aug 2026", breadcrumbs: ["Trips", "Aurora"] }),
  Card([
    SectionHeader("Highlights"),
    Carousel(slides, { activeIndex: $slide, ratio: "16:9", showDots: true })
  ]),
  Card([
    SectionHeader("Photos", { subtitle: "Tap a thumbnail to zoom" }),
    Gallery(slides, { columns: 3, onSelect: () => { $lightboxIdx = 0; $lightboxOpen = true } })
  ]),
  Grid([
    Card([
      SectionHeader("Trailer"),
      VideoPlayer(
        "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
        {
          poster: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
          controls: true,
          caption: "Aurora Expedition trailer",
          ratio: "16:9"
        }
      )
    ]),
    Card([
      SectionHeader("Soundtrack"),
      AudioPlayer(
        "https://upload.wikimedia.org/wikipedia/commons/b/b4/Bach_-_Cello_Suite_No._5_-_1._Prelude.ogg",
        {
          title: "Northern Skies",
          artist: "Aurora Strings"
        }
      )
    ])
  ], { columns: {sm: 1, md: 2}, gap: "l" }),
  Card([
    SectionHeader("Itinerary", { subtitle: "Six stops" }),
    Map(65.0, { lng: -16.0, zoom: 5, markers: [
      {lat: 64.1466, lng: -21.9426, label: "Reykjavík"},
      {lat: 64.7140, lng: -19.0608, label: "Highlands"},
      {lat: 65.6839, lng: -18.0907, label: "Akureyri"}
    ], height: "320px" })
  ]),
  Lightbox(photos, { open: $lightboxOpen, index: $lightboxIdx })
]))`,
  },
  wizard: {
    label: "MultiStepForm wizard",
    code: `// Highlights: MultiStepForm steps, RichTextEditor, ColorPicker, PinInput, ValidationSummary.
$step = 0
$title = "Streaming UI v3 — release notes"
$body = "<h2>What's new</h2><p>Thirty new components — DataGrid, CalendarView, RichTextEditor, six charts.</p>"
$tags = ["release", "ui", "v3"]
$brand = "#6366f1"
$pin = ""

$errors = $util.filter([
  $title == "" ? {label: "title", message: "Title is required."} : null,
  $pin.length != 4 ? {label: "pin",   message: "PIN must be 4 digits."} : null
], "label", "!=", null)

publishGate = $util.count($errors) > 0
  ? Card([ValidationSummary($errors, { title: "Fix these before publishing" })])
  : Card([Callout("Ready to publish", { tone: "success", description: "All gates passed.", icon: "circle-check", compact: true })])

$app(Stack([
  PageHeader($title, { subtitle: "Compose, brand, gate, publish.", breadcrumbs: ["Content", "Drafts"] }),
  MultiStepForm([
    {title: "Compose", details: "Title, body, tags", content: [
      Card([
        SectionHeader("Body", { eyebrow: "EDITOR" }),
        FormSection("Post", { helper: "All fields stream into the preview.", children: [
          FormControl("Title", { field: Input("title", { placeholder: "Headline…",     value: $title }) }),
          FormControl("Body",  { field: RichTextEditor("body", { value: $body, placeholder: "Start composing…", minHeight: "200px" }) }),
          FormControl("Tags",  { field: TagInput("tags", { value: $tags, placeholder: "Press enter to add" }) })
        ] })
      ])
    ]},
    {title: "Brand", details: "Pick an accent", content: [
      Card([
        SectionHeader("Brand"),
        ColorPicker("brand", { value: $brand, label: "Accent",
          swatches: ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6"] })
      ])
    ]},
    {title: "Gate", details: "4-digit PIN", content: [
      Card([
        SectionHeader("Two-factor publish", { eyebrow: "GATE" }),
        FormControl("PIN", { field: PinInput("pin", { length: 4, value: $pin, type: "numeric" }) }),
        publishGate
      ])
    ]}
  ], { current: $step })
]))`,
  },
  advancedCharts: {
    label: "Gauge, Heatmap, Radar, Scatter",
    code: `// Highlights: every new chart primitive in one dashboard.
$app(Stack([
  PageHeader("Engineering analytics", { subtitle: "Quarterly view" }),
  Stats([
    StatCard("SLA",    { value: "99.3%", trend: "up",   delta: "+0.2 pp", icon: "shield-halved" }),
    StatCard("P95",    { value: "112ms", trend: "down", delta: "-12 ms",  icon: "gauge-high" }),
    StatCard("Errors", { value: "0.42%", trend: "flat", delta: "stable",  icon: "circle-exclamation" }),
    StatCard("MRR",    { value: "$84k",  trend: "up",   delta: "+12%",    icon: "sack-dollar" })
  ]),
  Grid([
    Card([SectionHeader("SLA uptime"),  Gauge(99.3, { min: 95, max: 100, caption: "Above target", tone: "success", size: "lg" })]),
    Card([SectionHeader("P95 latency"), Gauge(112,  { min: 0,  max: 250, caption: "ms",           tone: "primary", size: "lg" })]),
    Card([SectionHeader("Error rate"),  Gauge(0.42, { min: 0,  max: 5,   caption: "% requests",   tone: "warning", size: "lg" })])
  ], { columns: {sm: 1, md: 3}, gap: "l" }),
  Card([
    SectionHeader("Signups · last 7 days", { subtitle: "Stacked by source" }),
    LineChart(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
      { series: [
        Series("Organic",  { values: [40, 52, 65, 78, 92, 105, 124] }),
        Series("Referral", { values: [20, 28, 35, 42, 50, 60,  72] }),
        Series("Paid",     { values: [10, 14, 18, 24, 30, 36,  44] })
      ] })
  ]),
  Grid([
    Card([
      SectionHeader("Office capacity"),
      Heatmap(["Mon","Tue","Wed","Thu","Fri"], { yLabels: ["9am","12pm","3pm","6pm"],
        values: [[3,4,5,3,2],[8,9,11,7,5],[12,14,16,13,10],[6,7,9,10,12]] })
    ]),
    Card([
      SectionHeader("Vendor scorecard"),
      RadarChart(["Speed","Quality","Cost","Coverage","Trust"], { series: [
        Series("Atlas Cloud", { values: [80,70,60,75,85] }),
        Series("Northwind",   { values: [60,85,70,65,80] })
      ] })
    ])
  ], { columns: {sm: 1, md: 2}, gap: "l" }),
  Grid([
    Card([
      SectionHeader("Sessions vs conversions"),
      ScatterChart([
        Series("Cohort A", { values: [{x:1,y:2},{x:2,y:4},{x:3,y:5},{x:4,y:7}] }),
        Series("Cohort B", { values: [{x:1,y:3},{x:2,y:2},{x:3,y:6},{x:4,y:5}] })
      ], { xLabel: "Sessions (k)", yLabel: "Conversions" })
    ]),
    Card([
      SectionHeader("Response time"),
      Histogram([1,2,2,3,3,3,4,4,5,5,5,5,6,6,7,8,8,9], { bins: 6 })
    ])
  ], { columns: {sm: 1, md: 2}, gap: "l" })
]))`,
  },
  storageConsole: {
    label: "Storage + console globals",
    code: `// Highlights: \`$storage\` namespace (local / session / cookies), \`$console\` forwarder, named-arg method calls.
$name = $storage.get("rui:demo:name")
$theme = $storage.session.get("rui:demo:theme")
$consent = $storage.cookies.get("rui:demo:consent")

function saveName(value) {
  $storage.set("rui:demo:name", value)
  $name = value
  $console.log("Saved name", value)
}

function setTheme(value) {
  $storage.session.set("rui:demo:theme", value)
  $theme = value
  $console.info("Theme preference set to", value)
}

function acceptCookies() {
  $storage.cookies.set("rui:demo:consent", "accepted", { expires: 30, path: "/", sameSite: "Lax" })
  $consent = "accepted"
  $console.warn("Cookies accepted — will persist for 30 days")
}

function clearAll() {
  $storage.clear()
  $storage.session.clear()
  $storage.cookies.clear()
  $name = null
  $theme = null
  $consent = null
  $console.error("Cleared every storage namespace (demo only).")
}

$app(Stack([
  PageHeader("Storage + console", { subtitle: "All values persist across reloads via the matching browser API." }),
  Card([
    SectionHeader("localStorage", { eyebrow: "PERSISTENT" }),
    FormControl("Display name", { field: Input("name", { placeholder: "Your name", value: $name ?? "" }) }),
    Button("Save name", { action: () => { saveName($name ?? "") }, variant: "primary" })
  ]),
  Card([
    SectionHeader("sessionStorage", { eyebrow: "PER TAB" }),
    FormControl("Theme", { field: Select("theme", { items: [
      SelectItem("light", "Light"),
      SelectItem("dark",  "Dark"),
      SelectItem("auto",  "Auto")
    ], value: $theme ?? "auto" }) }),
    Button("Save theme", { action: () => { setTheme($theme ?? "auto") } })
  ]),
  Card([
    SectionHeader("cookies", { eyebrow: "NAMED ARGS" }),
    Text(\`Current consent: \${$consent ?? "—"}\`),
    Stack([
      Button("Accept cookies", { action: acceptCookies, variant: "primary" }),
      Button("Reset everything", { action: clearAll, variant: "ghost" })
    ], { direction: "row", gap: "s" })
  ])
]))`,
  },
  gridLayout: {
    label: "12-col grid + named args",
    code: `// Highlights: Grid(columns: 12), GridItem(span: "1/4"), named-arg layout props.
sidebar = Card([
  CardHeader("Sidebar", { subtitle: "GridItem span='1/4'" }),
  Stack([
    NavLink("Overview", { to: "/",         variant: "ghost" }),
    NavLink("Reports",  { to: "/reports",  variant: "ghost" }),
    NavLink("Settings", { to: "/settings", variant: "ghost" })
  ], { direction: "column", gap: "s" })
])

content = Card([
  CardHeader("Main workspace", { subtitle: "GridItem span='3/4' fills the rest" }),
  Text("Use Grid([...], { columns: 12, gap: 'l' }) with GridItem(child, { span: '1/4' }) for sidebar layouts.")
])

$app(Grid([
  GridItem(sidebar, { span: "1/4" }),
  GridItem(content, { span: "3/4" })
], { columns: 12, gap: "l" }))`,
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
  files: "rui:playground:files",
  folders: "rui:playground:folders",
  openTabs: "rui:playground:openTabs",
  expanded: "rui:playground:expanded",
  activeFile: "rui:playground:activeFile",
  mode: "rui:playground:mode",
  runMode: "rui:playground:runMode",
  theme: "rui:playground:theme",
  example: "rui:playground:example",
  inspect: "rui:playground:inspect",
  split: "rui:playground:split",
  splitV: "rui:playground:splitV",
  sidebarCollapsed: "rui:playground:sidebarCollapsed",
};

// The entry module of a playground project. `app.aktion` is always present,
// is what the linker links from, and is where examples / shared snippets land.
const ENTRY_FILE = "app.aktion";

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
// Multi-file project helpers

/**
 * Normalize a user-entered file name into a project key: trim, strip leading
 * slashes, ensure a `.aktion` extension, and reject anything with traversal or
 * unsafe characters. Returns `null` for an invalid name.
 */
function normalizeFileName(raw) {
  let name = String(raw || "").trim().replace(/^\/+/, "");
  if (!name) return null;
  if (!/\.aktion$/i.test(name)) name += ".aktion";
  if (name.includes("..")) return null;
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*\.aktion$/i.test(name)) return null;
  return name;
}

// CRC-32 (IEEE) table + helper, used by the store-only ZIP writer below.
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a ZIP archive (store / no compression) from a `{ path → text }` map.
 * Dependency-free: just local file headers + a central directory + EOCD, which
 * every unzip tool accepts. Subdirectory paths (`components/Button.aktion`) are
 * preserved verbatim as entry names.
 */
function buildProjectZip(files) {
  const enc = new TextEncoder();
  const names = Object.keys(files).sort();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const name of names) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(files[name] ?? "");
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central dir header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // method: store
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0, true); // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // disk number
  ev.setUint16(6, 0, true); // disk with central dir
  ev.setUint16(8, names.length, true); // entries on this disk
  ev.setUint16(10, names.length, true); // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // central dir offset
  ev.setUint16(20, 0, true); // comment length

  return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}

/**
 * Map a path to a Font Awesome icon + color class for the explorer/tabs, so the
 * tree reads like a familiar code editor (different colors per file type).
 */
function fileKind(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  // NOTE: only Font Awesome 6 *free solid* glyphs — brand/Pro names like
  // `fa-js` / `fa-markdown` / `fa-brackets-curly` render as empty boxes. We
  // differentiate file types by COLOR (the `cls`), VSCode-style.
  switch (ext) {
    case "aktion": return { icon: "fa-cube", cls: "pg-ic-aktion" };
    case "html": case "htm": return { icon: "fa-file-code", cls: "pg-ic-html" };
    case "css": case "scss": case "less": return { icon: "fa-file-code", cls: "pg-ic-css" };
    case "js": case "mjs": case "cjs": return { icon: "fa-file-code", cls: "pg-ic-js" };
    case "ts": case "tsx": return { icon: "fa-file-code", cls: "pg-ic-ts" };
    case "json": return { icon: "fa-file-code", cls: "pg-ic-json" };
    case "md": case "markdown": case "txt": return { icon: "fa-file-lines", cls: "pg-ic-md" };
    case "svg": case "png": case "jpg": case "jpeg": case "gif": case "webp":
      return { icon: "fa-file-image", cls: "pg-ic-img" };
    default: return { icon: "fa-file", cls: "pg-ic-file" };
  }
}

/**
 * Read a ZIP archive (store + deflate) into a `{ path → text }` map. Deflate
 * entries are inflated with the platform `DecompressionStream("deflate-raw")`;
 * stored entries are copied. Directory entries and binary-looking files are
 * skipped (the playground is text-only). No dependency.
 */
async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const out = {};
  // Find the End Of Central Directory record (scan backwards for its signature).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .zip file");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true); // central directory offset
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue; // directory entry
    // Local header: data starts after its (separately sized) name + extra fields.
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(dataStart, dataStart + compSize);
    let raw;
    if (method === 0) {
      raw = comp;
    } else if (method === 8 && typeof DecompressionStream !== "undefined") {
      const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      raw = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      continue; // unsupported compression — skip
    }
    out[name.replace(/^\/+/, "")] = decoder.decode(raw);
  }
  return out;
}

/**
 * Parse a module's source and list its `export`ed top-level bindings, shaped as
 * editor completion candidates. State atoms and hooks carry the `$` sigil
 * (that's how they're referenced); components/actions/plain bindings are bare.
 */
function collectModuleExports(src) {
  let program;
  try {
    program = parse(src || "");
  } catch {
    return [];
  }
  const out = [];
  for (const stmt of program.statements || []) {
    if (!stmt || !stmt.exported) continue;
    if (stmt.kind === "Assignment") {
      out.push(stmt.isState
        ? { label: "$" + stmt.identifier, type: "variable", detail: "exported $state" }
        : { label: stmt.identifier, type: "variable", detail: "exported binding" });
    } else if (stmt.kind === "ComponentDeclaration") {
      out.push({ label: stmt.name, type: "class", detail: "exported component" });
    } else if (stmt.kind === "ActionDeclaration") {
      out.push({ label: stmt.name, type: "function", detail: "exported action" });
    } else if (stmt.kind === "HookDeclaration") {
      out.push({ label: "$" + stmt.name, type: "function", detail: "exported hook" });
    }
  }
  return out;
}

/**
 * When `pos` sits inside the `{ … }` of an `import { … } from "…"` statement,
 * return the module specifier and the names already listed in the braces (so we
 * don't re-suggest them). Returns `null` otherwise. Imports are single-line, so
 * we only inspect the line containing the cursor.
 */
function findImportBracketContext(text, pos) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  let lineEnd = text.indexOf("\n", pos);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  if (!/^\s*import\b/.test(line)) return null;
  const col = pos - lineStart;
  const open = line.indexOf("{");
  if (open === -1 || col <= open) return null;
  const close = line.indexOf("}", open + 1);
  const closeCol = close === -1 ? line.length : close;
  if (col > closeCol) return null; // cursor is past the closing brace
  const fromMatch = /from\s*["']([^"']*)["']/.exec(line);
  const braceContent = line.slice(open + 1, closeCol);
  const used = new Set((braceContent.match(/\$?[A-Za-z_]\w*/g) || []));
  return { specifier: fromMatch ? fromMatch[1] : null, used };
}

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

// The IIFE runtime bundle (exposes a global `Aktion` and registers
// `<aktion-app>` with a classic <script> — no module loader). Inlined into
// standalone exports so they run by double-clicking, offline, with no setup.
const RUNTIME_IIFE_URL = new URL("../../dist/aktion.iife.js", import.meta.url).href;
let runtimeIifePromise = null;
function fetchRuntimeIife() {
  if (!runtimeIifePromise) {
    runtimeIifePromise = fetch(RUNTIME_IIFE_URL)
      .then((r) => (r.ok ? r.text() : null))
      // Drop the trailing sourcemap comment (an inline data: map can be multi-MB,
      // and an external ref 404s when the file is opened offline).
      .then((t) => (t ? t.replace(/\n?\/\/[#@]\s*sourceMappingURL=[^\n]*\s*$/, "") : t))
      .catch(() => null);
  }
  return runtimeIifePromise;
}

const escapeScript = (js) => String(js).replace(/<\/(script)/gi, "<\\/$1");

/**
 * Build a self-contained HTML document that boots `<aktion-app>` and renders
 * the given (already-linked) Aktion `source`. When `runtimeJs` is supplied the
 * runtime is inlined so the file runs offline from `file://` with nothing else;
 * otherwise it falls back to the public CDN module bundle.
 */
function buildStandaloneHtml(source, theme, title, runtimeJs) {
  const safeSource = escapeScript(JSON.stringify(source));
  const head = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(title)}</title>`,
    '  <meta name="generator" content="Aktion playground" />',
    "  <style>",
    "    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }",
    "    aktion-app { display: block; min-height: 100vh; }",
    "  </style>",
  ];
  if (runtimeJs) {
    // Inlined runtime: a classic script that defines <aktion-app> synchronously.
    head.push(`  <script>${escapeScript(runtimeJs)}</script>`);
  } else {
    head.push(`  <script type="module" src="${CDN_BUNDLE}"></script>`);
  }
  const boot = [
    "  <script>",
    '    var el = document.querySelector("aktion-app");',
    `    var SOURCE = ${safeSource};`,
    '    function mount() {',
    '      if (typeof el.setResponse === "function") el.setResponse(SOURCE);',
    '      else el.setAttribute("response", SOURCE);',
    "    }",
    '    if (window.customElements && customElements.get("aktion-app")) mount();',
    '    else customElements.whenDefined("aktion-app").then(mount);',
    "  </script>",
  ];
  return [
    ...head,
    "</head>",
    "<body>",
    `  <aktion-app theme="${escapeAttr(theme)}"></aktion-app>`,
    ...boot,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * Build the runnable `index.html` for a project export. It loads the library
 * from the public CDN (kept lean — the bundle is NOT inlined) and renders the
 * linked program. The separate "Standalone HTML" download inlines everything.
 */
function buildIndexHtml(source, theme, title) {
  return buildStandaloneHtml(source, theme, title); // no runtimeJs → CDN <script>
}

async function downloadStandaloneHtml(source, theme, title) {
  const runtimeJs = await fetchRuntimeIife();
  const html = buildStandaloneHtml(source, theme, title, runtimeJs);
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
// Reserved-keyword documentation (definition + syntax + example) — drives
// the keyword hover-popup and enriches keyword autocomplete. Sourced from
// the shared grammar module so the editor never drifts from the runtime.
const KEYWORD_DOCS = langSpec.keywordDocs || {};

/**
 * Reserved language keywords — surfaced in autocomplete so the LLM-author
 * (or a human) can discover the full grammar without leaving the editor.
 * Mirror the lexer's `KEYWORDS_AKTION` set plus the lifecycle string deps
 * (`"mount"`, `"unmount"`, `"every(N)"`) that appear inside effect() calls.
 */
const LANGUAGE_KEYWORDS = [
  { label: "function",  info: "Declare a function (component or callable action): `function Name(arg) { return ... }`." },
  { label: "if",        info: "Expression-form `if (cond) { ... } else { ... }`." },
  { label: "else",      info: "`else` arm of an `if` expression." },
  { label: "switch",    info: "Statement-form `switch (value) { case \"x\": A(); break; default: B() }`. Use inside a function body — wrap and `return` to pick a value." },
  { label: "case",      info: "Arm of a `switch` statement: `case \"x\": A(); break`." },
  { label: "break",     info: "Terminate a `switch` arm or `for`/`while` loop." },
  { label: "continue",  info: "Skip to the next iteration of a `for`/`while` loop." },
  { label: "for",       info: "Statement-form `for (let x of xs) { … }` / `for (let i = 0; i < n; i += 1) { … }`. Use `xs.map(x => …)` for value-producing iteration." },
  { label: "while",     info: "Statement-form `while (cond) { … }` — inside a function body." },
  { label: "do",        info: "`do { … } while (cond)` — run the body once, then repeat while truthy." },
  { label: "of",        info: "Used in `for (let x of xs) { ... }` (iterate VALUES)." },
  { label: "in",        info: "`for (let k in obj) { ... }` (iterate KEYS) or `\"key\" in obj` membership test." },
  { label: "let",       info: "Block-scoped mutable binding: `let x = …` (supports destructuring)." },
  { label: "const",     info: "Block-scoped constant binding: `const x = …` (supports destructuring)." },
  { label: "var",       info: "Function-scoped variable — `let` is preferred." },
  { label: "try",       info: "`try { … } catch (err) { … } finally { … }` — inside a function body." },
  { label: "catch",     info: "Handle an error thrown in the preceding `try` block: `catch (e) { … }`." },
  { label: "finally",   info: "Run cleanup after `try` / `catch`, regardless of outcome." },
  { label: "throw",     info: "`throw new Error(\"msg\")` — surfaces as a thrown JS error." },
  { label: "new",       info: "`new Constructor(args)` — invoke a JS constructor (e.g. `new FormData()`, `new Date()`)." },
  { label: "typeof",    info: "`typeof x` — JS type guard returning a string." },
  { label: "instanceof",info: "`x instanceof Ctor` — prototype check." },
  { label: "delete",    info: "`delete obj.prop` — remove a property from an object." },
  { label: "void",      info: "`void expr` — evaluate an expression and yield `undefined`." },
  { label: "await",     info: "Wait for an HTTP / promise inside a function body." },
  { label: "async",     info: "Marks a function as async — accepted as a no-op modifier." },
  { label: "return",    info: "Return from a `function` / `$effect` body." },
  { label: "cleanup",   info: "Register a teardown handler inside a `$effect` body — e.g. `cleanup(() => clearInterval(id))`." },
  { label: "default",   info: "Wildcard arm inside `$router({...})`." },
];

/**
 * Reserved identifiers / special globals exposed by the runtime. Surfaced
 * in autocomplete so authors learn the names — `aktion` is the top-level
 * entry binding and `$router` / `route` are the routing primitives.
 */
const SPECIAL_IDENTIFIERS = [
  {
    label: "$app",
    info: "Register the UI root: `$app(node)`, `$app([nodes])`, or `$app(node, …)`. The renderer mounts whatever you pass.",
    apply: "$app(",
  },
  {
    label: "aktion",
    info: "Legacy top-level entry binding — prefer `$app(...)`. The renderer still reads an `aktion = ...` assignment to draw the UI.",
    apply: "aktion = ",
  },
  {
    label: "$router",
    info: "Routing primitive. Pass an object literal whose keys are route patterns; bind the result and read `route.*` for the active match.",
    apply: "$router({\n  \"/\":     ${1:Home()},\n  default: ${2:NotFound()}\n})",
    snippet: true,
  },
  {
    label: "$store",
    info: "App-wide store factory: `name = $store({ field, method: (s, …) => … })`. Non-function entries are reactive state; function entries are methods that receive the store handle `s`. Read `store.field` (fine-grained) and call `store.method(args)`.",
    apply: "$store({\n  ${1:items}: [],\n  ${2:add}: (s, item) => { s.${1:items} = [...s.${1:items}, item] }\n})",
    snippet: true,
  },
  {
    label: "$effect",
    info: "Declarative side-effect: `$effect(() => { … }, [deps])`. Deps are `$atoms` plus lifecycle strings (\"mount\", \"unmount\", \"every(1000)\", \"debounce(300)\", \"throttle(300)\"). Register teardown with `cleanup(() => …)`.",
    apply: "$effect(() => {\n  ${2}\n}, [$${1:dep}])",
    snippet: true,
  },
  {
    label: "$emit",
    info: "Dispatch an outbound CustomEvent on the host `<aktion-app>`: `$emit(\"name\", { detail })`. Reserved names: `assistant-message`, `error`, `route-change`.",
    apply: "$emit(\"${1:event}\", { ${2:detail} })",
    snippet: true,
  },
  {
    label: "$theme",
    info: "Per-response theme override: a bare `$theme({ colors: { primary: … }, radius, font, motion, elevation })` statement (no binding needed) brands the response.",
    apply: "$theme({\n  colors: { primary: \"${1:#6366f1}\" }\n})",
    snippet: true,
  },
  {
    label: "$i18n",
    info: "Internationalisation factory: `const { t, setCurrentLanguage, getCurrentLanguage } = $i18n({ defaultLanguage, currentLanguage, translations })`. `t(key, vars?)` resolves a translation with `{placeholder}` interpolation.",
    apply: "$i18n({\n  defaultLanguage: \"${1:en}\",\n  translations: { ${2:greeting}: { en: \"${3:Hello}\" } }\n})",
    snippet: true,
  },
  {
    label: "params",
    info: "Inside a `$router({...})` arm, holds the captured path segments (`params.id`, `params._`).",
    apply: "params",
  },
  {
    label: "route",
    info: "Reserved router handle. Read-only reactive surface: `route.path`, `route.params`, `route.query`, `route.pattern`. Call `route.navigate(path)` to navigate imperatively.",
    apply: "route",
  },
  {
    label: "theme",
    info: "Optional theme binding. Prefer a bare `$theme({ colors: { primary: … } })` statement; the legacy `theme = $theme({...})` binding also works. Removing it snaps back to the host theme.",
    apply: "theme",
  },
];

/**
 * Top-level multi-line snippets — surfaced via the `…` ellipsis suffix
 * so they show up alongside ordinary identifiers without polluting the
 * inline completion list. Pulled from `langSpec.snippets` plus the
 * language constructs (`function`, `effect`, `switch`, `$router`).
 */
const LANGUAGE_SNIPPETS = [
  {
    name: "router",
    description: "Multi-page $router({...}) with NavLink nav.",
    template:
      'pages = $router({\n' +
      '  "/":          ${1:Home()},\n' +
      '  "/users/:id": ${2:UserPage({ id: params.id })},\n' +
      '  default:      ${3:NotFound()}\n' +
      '})\n\n' +
      'nav = Stack([\n' +
      '  NavLink("Home",  { to: "/",      variant: "ghost", exact: true }),\n' +
      '  NavLink("Users", { to: "/users", variant: "ghost" })\n' +
      '], { direction: "row", gap: "s" })\n\n' +
      '$app(Stack([nav, pages]))',
  },
  {
    name: "function",
    description: "User-defined function (component or action) with explicit return.",
    template:
      'function ${1:Name}(${2:prop}) {\n' +
      '  return ${3:Card([CardHeader(${2:prop})])}\n' +
      '}',
  },
  {
    name: "action",
    description: "Callable action — invoked via `{ action: name }` props.",
    template:
      'function ${1:save}(${2:payload}) {\n' +
      '  $${3:result} = $http({ url: "https://api.example.com/${4:endpoint}", method: "POST", body: ${2:payload} })\n' +
      '}',
  },
  {
    name: "effect",
    description: "Side-effect call — body callback plus dependency array.",
    template:
      'effect(() => {\n' +
      '  ${2:// side effect body}\n' +
      '  cleanup(() => { ${3:// teardown} })\n' +
      '}, [$${1:dep}])',
  },
  {
    name: "switch",
    description: "Switch statement — first matching case wins. Use inside a function body.",
    template:
      'switch (${1:value}) {\n' +
      '  case "${2:active}": ${3:onActive()}; break;\n' +
      '  default:            ${4:otherwise()}\n' +
      '}',
  },
  {
    name: "for",
    description: "for-of loop statement — use `.map(item => …)` for value-producing iteration.",
    template: 'for (let ${1:item} of ${2:items}) { ${3:$console.log(${1:item})} }',
  },
  {
    name: "map",
    description: "Project an array of items into a list of components.",
    template: '${1:items}.map(${2:item} => ${3:Card([Text(${2:item}.name)])})',
  },
  {
    name: "if",
    description: "Statement-form if / else (use a ternary for value picking).",
    template:
      'if (${1:cond}) {\n' +
      '  ${2:body}\n' +
      '} else {\n' +
      '  ${3:fallback}\n' +
      '}',
  },
  {
    name: "ternary",
    description: "JS ternary — `cond ? a : b`. Use it on the RHS of an assignment.",
    template: '${1:result} = ${2:cond} ? ${3:trueBranch} : ${4:falseBranch}',
  },
  {
    name: "http",
    description: "Reactive HTTP resource + onDone refresh.",
    template:
      '$${1:data} = $http({ url: "${2:https://api.example.com/items}", method: "${3:GET}" })',
  },
  {
    name: "http-write",
    description: "Mutation that refreshes a list resource via onDone.",
    template:
      'function ${1:save}(${2:item}) {\n' +
      '  $${3:patch} = $http({ url: "${4:https://api.example.com/items}", method: "${5:POST}", body: ${2:item} })\n' +
      '  $${3:patch}.onDone = () => { $${6:items}.refetch() }\n' +
      '}',
  },
];

/**
 * Built-in namespace globals — surfaced in autocomplete so authors can
 * discover the runtime's globals. Aktion's own namespaces carry the `$`
 * sigil (`$util`, `$console`, `$storage`); the curated JS standard library
 * (`Math`, `JSON`, `Object`, `Array`) is referenced bare. Members are
 * stored in RELATIVE form (`name`/`apply` are the part AFTER the namespace
 * dot) so they can be surfaced both flat at the top level (`$util.count`)
 * and after a typed dot (`$util.` → `count`). Keep `$util`/`$console`/
 * `$storage` in sync with `RESERVED_STATE_NAMESPACES` (and `Util` in
 * `src/runtime/util.ts`); the bare JS namespaces mirror `GLOBAL_NAMESPACES`
 * in `src/runtime/evaluator.ts`.
 */
const GLOBAL_NAMESPACES = [
  {
    name: "$util",
    signature: "$util.<count|sum|filter|sort|format|formatDate|plural|…>(...)",
    description: "Pure data-transformation helpers — aggregation, reshaping, formatting, date math, and string/number utilities. Available everywhere; no import needed.",
    members: [
      // Aggregation
      { name: "count",   apply: "count(${1:items})",  info: "Number of items in an array." },
      { name: "sum",     apply: "sum(${1:items})",    info: "Sum of the numeric values." },
      { name: "avg",     apply: "avg(${1:items})",    info: "Arithmetic mean of the values." },
      { name: "min",     apply: "min(${1:items})",    info: "Smallest numeric value." },
      { name: "max",     apply: "max(${1:items})",    info: "Largest numeric value." },
      { name: "first",   apply: "first(${1:items})",  info: "First element, or null when empty." },
      { name: "last",    apply: "last(${1:items})",   info: "Last element, or null when empty." },
      // Reshaping
      { name: "filter",  apply: "filter(${1:items}, \"${2:field}\", \"${3:==}\", ${4:value})", info: "Keep items where field matches. Operators: == != > < >= <= contains in." },
      { name: "find",    apply: "find(${1:items}, \"${2:field}\", \"${3:==}\", ${4:value})",   info: "First item matching the comparator, or null." },
      { name: "sort",    apply: "sort(${1:items}, \"${2:field}\", \"${3:asc}\")", info: "Sort by field, \"asc\" (default) or \"desc\"." },
      { name: "groupBy", apply: "groupBy(${1:items}, \"${2:field}\")", info: "Group items into an object keyed by the field value." },
      { name: "slice",   apply: "slice(${1:items}, ${2:0}, ${3:10})", info: "Subarray between start and end indices." },
      { name: "unique",  apply: "unique(${1:items})", info: "De-duplicate an array (optionally by a field)." },
      { name: "reverse", apply: "reverse(${1:items})", info: "Reversed copy of the array." },
      { name: "range",   apply: "range(${1:0}, ${2:10})", info: "Array of numbers from start to end (inclusive)." },
      { name: "repeat",  apply: "repeat(${1:value}, ${2:3})", info: "Array with the value repeated n times." },
      { name: "pick",    apply: "pick(${1:obj}, ${2:[\"a\", \"b\"]})", info: "Object containing only the listed keys." },
      // Formatting
      { name: "format",     apply: "format(${1:value}, \"${2:number}\")", info: "Locale number format: \"number\" | \"currency\" | \"percent\" | \"compact\"." },
      { name: "formatDate", apply: "formatDate(${1:value}, \"${2:MMM D}\")", info: "Format a date — a token pattern (MMM D, YYYY-MM-DD) or \"relative\"/\"date\"/\"time\"/\"datetime\"/\"iso\"." },
      { name: "plural",     apply: "plural(${1:count}, \"${2:item}\")", info: "Count + correctly pluralised noun: `3 items` / `1 item`." },
      { name: "capitalize", apply: "capitalize(${1:text})", info: "Capitalise the first letter." },
      { name: "lowercase",  apply: "lowercase(${1:text})",  info: "Lowercase the whole string." },
      { name: "uppercase",  apply: "uppercase(${1:text})",  info: "Uppercase the whole string." },
      { name: "titlecase",  apply: "titlecase(${1:text})",  info: "Title-case each word." },
      { name: "case",       apply: "case(${1:text}, \"${2:camel}\")", info: "Recase: \"camel\" | \"pascal\" | \"snake\" | \"kebab\"." },
      // Date / time
      { name: "now",         apply: "now()",   info: "Current time as epoch milliseconds." },
      { name: "today",       apply: "today()", info: "Start of today as an ISO string." },
      { name: "addDays",     apply: "addDays(${1:date}, ${2:1})",   info: "Date shifted by n days (ISO)." },
      { name: "addHours",    apply: "addHours(${1:date}, ${2:1})",  info: "Date shifted by n hours (ISO)." },
      { name: "diffDays",    apply: "diffDays(${1:start}, ${2:end})", info: "Whole days between two dates." },
      { name: "startOfWeek", apply: "startOfWeek(${1:date})", info: "Start of the week containing the date (ISO)." },
      { name: "endOfMonth",  apply: "endOfMonth(${1:date})",  info: "End of the month containing the date (ISO)." },
      // String / regex
      { name: "join",       apply: "join(${1:items}, \"${2:, }\")", info: "Join an array into a string with a separator." },
      { name: "split",      apply: "split(${1:text}, \"${2:,}\")",  info: "Split a string into an array on a separator." },
      { name: "trim",       apply: "trim(${1:text})", info: "Trim surrounding whitespace." },
      { name: "replace",    apply: "replace(${1:text}, \"${2:search}\", \"${3:replacement}\")", info: "Replace every occurrence of a substring." },
      { name: "substring",  apply: "substring(${1:text}, ${2:0}, ${3:5})", info: "Substring between two indices." },
      { name: "startsWith", apply: "startsWith(${1:text}, \"${2:prefix}\")", info: "True when the text starts with the prefix." },
      { name: "endsWith",   apply: "endsWith(${1:text}, \"${2:suffix}\")", info: "True when the text ends with the suffix." },
      { name: "contains",   apply: "contains(${1:text}, \"${2:needle}\")", info: "True when the text contains the needle." },
      { name: "match",      apply: "match(${1:text}, \"${2:pattern}\")", info: "Test the text against a regular-expression pattern." },
      // Math
      { name: "round",  apply: "round(${1:value}, ${2:0})", info: "Round to n decimal places." },
      { name: "floor",  apply: "floor(${1:value})", info: "Round down to an integer." },
      { name: "ceil",   apply: "ceil(${1:value})",  info: "Round up to an integer." },
      { name: "abs",    apply: "abs(${1:value})",   info: "Absolute value." },
      { name: "clamp",  apply: "clamp(${1:value}, ${2:min}, ${3:max})", info: "Constrain a number to a [min, max] range." },
      { name: "pow",    apply: "pow(${1:base}, ${2:exp})", info: "Exponentiation (base^exp)." },
      { name: "sqrt",   apply: "sqrt(${1:value})",  info: "Square root." },
      { name: "random", apply: "random()",          info: "Pseudo-random number in [0, 1)." },
      { name: "log",    apply: "log(${1:value})",   info: "Natural logarithm." },
    ],
  },
  {
    name: "$storage",
    signature: "$storage.<local|session|cookies>?.<set|get|remove|clear>(...)",
    description: "Browser storage namespace — localStorage (default), sessionStorage, and cookies share a uniform set/get/remove/clear surface.",
    members: [
      { name: "set",            apply: "set(\"${1:key}\", ${2:value})",                              info: "Persist a value to localStorage (default namespace)." },
      { name: "get",            apply: "get(\"${1:key}\")",                                          info: "Read a value from localStorage. Returns null when missing." },
      { name: "remove",         apply: "remove(\"${1:key}\")",                                       info: "Delete a key from localStorage." },
      { name: "clear",          apply: "clear()",                                                    info: "Wipe every localStorage entry." },
      { name: "local.set",      apply: "local.set(\"${1:key}\", ${2:value})",                        info: "Alias of `$storage.set`." },
      { name: "local.get",      apply: "local.get(\"${1:key}\")",                                    info: "Alias of `$storage.get`." },
      { name: "session.set",    apply: "session.set(\"${1:key}\", ${2:value})",                      info: "Per-tab sessionStorage write." },
      { name: "session.get",    apply: "session.get(\"${1:key}\")",                                  info: "Per-tab sessionStorage read." },
      { name: "session.remove", apply: "session.remove(\"${1:key}\")",                               info: "Drop a sessionStorage entry." },
      { name: "session.clear",  apply: "session.clear()",                                            info: "Wipe sessionStorage." },
      { name: "cookies.set",    apply: "cookies.set(\"${1:key}\", ${2:value}, { expires: ${3:7}, path: \"/\" })", info: "Set a cookie. Options object: expires, maxAge, path, domain, secure, sameSite." },
      { name: "cookies.get",    apply: "cookies.get(\"${1:key}\")",                                  info: "Read a cookie value." },
      { name: "cookies.remove", apply: "cookies.remove(\"${1:key}\", { path: \"/\" })",              info: "Delete a cookie. Path/domain must match the original set call." },
      { name: "cookies.clear",  apply: "cookies.clear()",                                            info: "Clear every cookie on this document." },
    ],
  },
  {
    name: "$console",
    signature: "$console.<log|error|warn|info|debug>(...)",
    description: "Forwards to the browser console. Useful for stream-time debugging from inside function / effect bodies.",
    members: [
      { name: "log",   apply: "log(${1})",   info: "Log a message at the default level." },
      { name: "error", apply: "error(${1})", info: "Log an error." },
      { name: "warn",  apply: "warn(${1})",  info: "Log a warning." },
      { name: "info",  apply: "info(${1})",  info: "Log an informational message." },
      { name: "debug", apply: "debug(${1})", info: "Log a verbose debug message." },
    ],
  },
  {
    name: "Math",
    signature: "Math.<max|min|round|floor|ceil|abs|random|pow|sqrt|…>(...)",
    description: "Standard JS Math namespace. Exposed verbatim — every method and constant works.",
    members: [
      { name: "max",    apply: "max(${1:a}, ${2:b})", info: "Largest of the given numbers." },
      { name: "min",    apply: "min(${1:a}, ${2:b})", info: "Smallest of the given numbers." },
      { name: "round",  apply: "round(${1})",         info: "Round to the nearest integer." },
      { name: "floor",  apply: "floor(${1})",         info: "Round down to an integer." },
      { name: "ceil",   apply: "ceil(${1})",          info: "Round up to an integer." },
      { name: "abs",    apply: "abs(${1})",           info: "Absolute value." },
      { name: "random", apply: "random()",            info: "Pseudo-random number in [0, 1)." },
      { name: "pow",    apply: "pow(${1:base}, ${2:exp})", info: "Exponentiation." },
      { name: "sqrt",   apply: "sqrt(${1})",          info: "Square root." },
      { name: "PI",     apply: "PI",                  info: "The constant π." },
    ],
  },
  {
    name: "JSON",
    signature: "JSON.<stringify|parse>(...)",
    description: "Standard JS JSON namespace for serialising and parsing values.",
    members: [
      { name: "stringify", apply: "stringify(${1:value})",  info: "Serialise a value to a JSON string." },
      { name: "parse",     apply: "parse(${1:text})",       info: "Parse a JSON string into a value." },
    ],
  },
  {
    name: "Object",
    signature: "Object.<keys|values|entries|assign|fromEntries|freeze>(...)",
    description: "Standard JS Object namespace — reflection and shaping helpers.",
    members: [
      { name: "keys",        apply: "keys(${1:obj})",                    info: "Array of an object's own enumerable keys." },
      { name: "values",      apply: "values(${1:obj})",                  info: "Array of an object's own enumerable values." },
      { name: "entries",     apply: "entries(${1:obj})",                 info: "Array of `[key, value]` pairs." },
      { name: "assign",      apply: "assign(${1:target}, ${2:source})",  info: "Copy enumerable own properties onto a target." },
      { name: "fromEntries", apply: "fromEntries(${1:pairs})",           info: "Build an object from `[key, value]` pairs." },
      { name: "freeze",      apply: "freeze(${1:obj})",                  info: "Make an object immutable." },
    ],
  },
  {
    name: "Array",
    signature: "Array.<isArray|from|of>(...)",
    description: "Standard JS Array namespace — construction and type-checking helpers.",
    members: [
      { name: "isArray", apply: "isArray(${1:value})", info: "True when the value is an array." },
      { name: "from",    apply: "from(${1:iterable})", info: "Build an array from an iterable or array-like." },
      { name: "of",      apply: "of(${1})",            info: "Build an array from the given arguments." },
    ],
  },
];

/**
 * Synthetic param spec for the `$http({...})` config object. Surfaced as
 * named-arg completions inside the braces (`$http({ <here> })`) the same way
 * component props are, so authors discover `url` / `method` / `query` / … .
 * Mirrors the keys recognised by `buildRequestFromConfig` in
 * `src/runtime/http.ts` (everything else is forwarded to `fetch`).
 */
const HTTP_CONFIG_SPEC = {
  name: "$http",
  signature: "$http({ url, method?, query?, headers?, body?, ...fetchOptions })",
  description: "The reactive network primitive. Returns a resource bag (`.data`, `.error`, `.loading`, `.status`, `.refetch()`, `.cancel()`, `.onDone`).",
  params: [
    { name: "url",         type: "string", required: true,  description: "Absolute request URL." },
    { name: "method",      type: "enum",   required: false, enumValues: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"], description: "HTTP method. Defaults to GET." },
    { name: "query",       type: "object", required: false, description: "Object serialised into the URL querystring (`?k=v`)." },
    { name: "headers",     type: "object", required: false, description: "Request headers as a plain object." },
    { name: "body",        type: "object", required: false, description: "Request body. Objects are JSON-encoded automatically." },
    { name: "credentials", type: "enum",   required: false, enumValues: ["omit", "same-origin", "include"], description: "Fetch credentials mode." },
    { name: "mode",        type: "enum",   required: false, enumValues: ["cors", "no-cors", "same-origin"], description: "Fetch request mode." },
    { name: "cache",       type: "enum",   required: false, enumValues: ["default", "no-store", "reload", "no-cache", "force-cache"], description: "Fetch cache mode." },
  ],
};

/**
 * The reactive resource bag returned by `$http({...})`. Surfaced as
 * member completions after a dot on any `$variable` assigned from `$http(`
 * (e.g. `$todos.` → `data`, `refetch()`, `onDone`, …). Mirrors
 * `EndpointResource` in `src/runtime/http.ts` — keep the two in sync.
 */
const HTTP_RESOURCE_MEMBERS = [
  { name: "data",        apply: "data",        info: "Parsed response body — `null` until the request resolves." },
  { name: "error",       apply: "error",       info: "`null` on success; `{ status, body }` on a non-2xx; the thrown error on network failure." },
  { name: "status",      apply: "status",      info: "HTTP status code of the last response, e.g. `200`." },
  { name: "loading",     apply: "loading",     info: "`true` while a request is in flight." },
  { name: "headers",     apply: "headers",     info: "Response headers as a plain object." },
  { name: "lastUpdated", apply: "lastUpdated", info: "Epoch-ms of the last successful response." },
  { name: "refetch",     apply: "refetch()",   info: "Re-issue the original request." },
  { name: "cancel",      apply: "cancel()",    info: "Abort the in-flight request." },
  { name: "onDone",      apply: "onDone = () => {\n  ${1}\n}", snippet: true, info: "Settable callback fired each time the request settles (initial load + every refetch, on success or error). Not fired for superseded/cancelled requests — e.g. `$patch.onDone = () => $todos.refetch()`." },
];

/**
 * Members of the reserved reactive `route` handle — surfaced after `route.`.
 */
const ROUTE_MEMBERS = [
  { name: "path",     apply: "path",                     info: "Current URL path, e.g. `/users/42`." },
  { name: "params",   apply: "params",                   info: "Captured path segments from the matched route pattern (`route.params.id`)." },
  { name: "query",    apply: "query",                    info: "Parsed query-string parameters as an object." },
  { name: "pattern",  apply: "pattern",                  info: "The matched route pattern, or `null`." },
  { name: "navigate", apply: "navigate(\"${1:/path}\")", info: "Imperatively navigate to a path." },
];

/**
 * Plain callable globals and constructors exposed by the runtime — the
 * network primitive `$http`, the timer family, the curated slice of the JS
 * standard library, and the most-reached-for browser globals. Surfaced as
 * bare-identifier completions so authors can discover and insert them. This
 * is NOT exhaustive: the runtime exposes the FULL JavaScript global surface
 * (any `window` / `globalThis` member — `document`, `fetch`, `crypto`,
 * `localStorage`, `Reflect`, `eval`, …) via a host passthrough, so anything
 * not listed here still works when typed. Keep in sync with the timer
 * handlers + `GLOBAL_NAMESPACES` + `lookupHostGlobal` in
 * `src/runtime/evaluator.ts`.
 */
const CALLABLE_GLOBALS = [
  {
    label: "$http",
    detail: "network",
    info: "The only network primitive. Self-contained config: absolute `url`, optional `method` (GET default), `query`, `headers`, `body`, plus any fetch option. Returns a reactive resource bag (`.data`, `.error`, `.loading`, `.status`, `.headers`, `.lastUpdated`, `.refetch()`, `.cancel()`, settable `.onDone`).",
    apply: '$http({\n  url:    "${1:https://api.example.com/items}",\n  method: "${2:GET}"\n})',
    snippet: true,
  },
  { label: "setTimeout",    detail: "timer", info: "Run a callback once after `ms`. Returns a handle for `clearTimeout`. Tracked by the runtime and cleared on re-plan/disconnect.", apply: "setTimeout(() => {\n  ${1}\n}, ${2:1000})", snippet: true },
  { label: "setInterval",   detail: "timer", info: "Run a callback every `ms`. Returns a handle for `clearInterval`. Clear it in an effect `cleanup` when no longer needed.", apply: "setInterval(() => {\n  ${1}\n}, ${2:1000})", snippet: true },
  { label: "clearTimeout",  detail: "timer", info: "Cancel a pending `setTimeout` by its handle.", apply: "clearTimeout(${1:id})", snippet: true },
  { label: "clearInterval", detail: "timer", info: "Stop a running `setInterval` by its handle.", apply: "clearInterval(${1:id})", snippet: true },
  { label: "parseInt",           detail: "global", info: "Parse a string to an integer.", apply: "parseInt(${1})", snippet: true },
  { label: "parseFloat",         detail: "global", info: "Parse a string to a floating-point number.", apply: "parseFloat(${1})", snippet: true },
  { label: "isNaN",              detail: "global", info: "True when the value is NaN after numeric coercion.", apply: "isNaN(${1})", snippet: true },
  { label: "isFinite",           detail: "global", info: "True when the value is a finite number.", apply: "isFinite(${1})", snippet: true },
  { label: "encodeURIComponent", detail: "global", info: "Percent-encode a URI component.", apply: "encodeURIComponent(${1})", snippet: true },
  { label: "decodeURIComponent", detail: "global", info: "Decode a percent-encoded URI component.", apply: "decodeURIComponent(${1})", snippet: true },
  { label: "encodeURI",          detail: "global", info: "Percent-encode a full URI.", apply: "encodeURI(${1})", snippet: true },
  { label: "decodeURI",          detail: "global", info: "Decode a percent-encoded URI.", apply: "decodeURI(${1})", snippet: true },
  { label: "structuredClone",    detail: "global", info: "Deep-clone a value.", apply: "structuredClone(${1})", snippet: true },
  { label: "Number",  detail: "constructor", info: "Coerce a value to a number (`Number(x)`).", apply: "Number(${1})", snippet: true },
  { label: "String",  detail: "constructor", info: "Coerce a value to a string (`String(x)`).", apply: "String(${1})", snippet: true },
  { label: "Boolean", detail: "constructor", info: "Coerce a value to a boolean (`Boolean(x)`).", apply: "Boolean(${1})", snippet: true },
  { label: "Date",    detail: "constructor", info: "Date constructor — `new Date()`, `new Date(ms)`. Also `Date.now()`.", apply: "Date(${1})", snippet: true },
  { label: "Map",     detail: "constructor", info: "Map constructor — `new Map([[k, v]])`.", apply: "Map(${1})", snippet: true },
  { label: "Set",     detail: "constructor", info: "Set constructor — `new Set([1, 2, 3])`.", apply: "Set(${1})", snippet: true },
  { label: "RegExp",  detail: "constructor", info: "RegExp constructor — `new RegExp(\"\\\\d+\")`.", apply: "RegExp(${1})", snippet: true },
  { label: "Promise", detail: "constructor", info: "Promise constructor — `new Promise((resolve) => …)`.", apply: "Promise(${1})", snippet: true },
  // Browser dialog + common Web globals (resolved via the host passthrough).
  { label: "alert",   detail: "dialog", info: "Show a blocking alert dialog: `alert(message)`.", apply: "alert(${1})", snippet: true },
  { label: "confirm", detail: "dialog", info: "Show a blocking confirm dialog — returns `true`/`false`: `confirm(message)`.", apply: "confirm(${1})", snippet: true },
  { label: "prompt",  detail: "dialog", info: "Show a blocking prompt dialog — returns the entered string (or null): `prompt(message, default?)`.", apply: "prompt(${1})", snippet: true },
  { label: "fetch",   detail: "global", info: "Low-level network fetch. Prefer the reactive `$http({…})` primitive for UI data — use `fetch` only for imperative one-off requests inside actions.", apply: "fetch(${1:url})", snippet: true },
  { label: "URL",            detail: "constructor", info: "URL parser — `new URL(\"https://example.com/path?q=1\")`.", apply: "URL(${1})", snippet: true },
  { label: "URLSearchParams", detail: "constructor", info: "Query-string helper — `new URLSearchParams(\"a=1&b=2\")`.", apply: "URLSearchParams(${1})", snippet: true },
  { label: "atob",    detail: "global", info: "Decode a base-64 string.", apply: "atob(${1})", snippet: true },
  { label: "btoa",    detail: "global", info: "Encode a string to base-64.", apply: "btoa(${1})", snippet: true },
  { label: "crypto",  detail: "namespace", info: "Web Crypto namespace — e.g. `crypto.randomUUID()`.", apply: "crypto" },
  { label: "navigator", detail: "namespace", info: "Browser navigator — e.g. `navigator.clipboard.writeText(text)`.", apply: "navigator" },
  { label: "localStorage",  detail: "namespace", info: "Raw Web Storage. Prefer the `$storage` global for a friendlier API.", apply: "localStorage" },
  { label: "Intl",    detail: "namespace", info: "Internationalization API — `Intl.NumberFormat`, `Intl.DateTimeFormat`.", apply: "Intl" },
  { label: "BigInt",  detail: "global", info: "Arbitrary-precision integer — `BigInt(123)`.", apply: "BigInt(${1})", snippet: true },
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
    // Reserved control-flow / declaration keywords (`if`, `for`, `function`,
    // `return`, `switch`, `try`, …). Mapped to `controlKeyword` so they get
    // a distinct style from the `@builtin` functions (which use `keyword`).
    keyword: tags.controlKeyword,
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

  // Two palettes: the light one is tuned for white surfaces; the dark one
  // uses brighter, lower-saturation hues that stay legible on `--doc-bg`
  // in dark mode (where colours like `#0f172a` or `#2563eb` would
  // disappear into the background). We swap between them via
  // `themeCompartment` whenever `data-doc-theme` flips.
  const lightHighlightStyle = lang.HighlightStyle.define([
    { tag: tags.keyword, color: "#7c3aed", fontWeight: "600" },          // @builtins
    { tag: tags.controlKeyword, color: "#c026d3", fontWeight: "700" },   // reserved keywords
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

  const darkHighlightStyle = lang.HighlightStyle.define([
    { tag: tags.keyword, color: "#c4b5fd", fontWeight: "600" },          // @builtins
    { tag: tags.controlKeyword, color: "#f0abfc", fontWeight: "700" },   // reserved keywords
    { tag: tags.typeName, color: "#7dd3fc", fontWeight: "500" },         // Components
    { tag: tags.special(tags.variableName), color: "#fdba74" },          // $state
    { tag: tags.local(tags.variableName), color: "#5eead4" },            // loop vars
    { tag: tags.variableName, color: "#e5e7eb" },
    { tag: tags.propertyName, color: "#99f6e4" },
    { tag: tags.string, color: "#86efac" },
    { tag: tags.number, color: "#fca5a5" },
    { tag: tags.atom, color: "#d8b4fe" },
    { tag: tags.lineComment, color: "#94a3b8", fontStyle: "italic" },
    { tag: tags.blockComment, color: "#94a3b8", fontStyle: "italic" },
    { tag: tags.operator, color: "#cbd5e1" },
  ]);

  const isDarkDocTheme = () =>
    document.documentElement.getAttribute("data-doc-theme") === "dark";
  const highlightExtFor = (dark) =>
    lang.syntaxHighlighting(dark ? darkHighlightStyle : lightHighlightStyle);

  // ---- Autocomplete sources ----

  /**
   * Inspect the slice of the current argument from the last comma (or `(`)
   * at depth 0 inside `call.openParen` up to `pos`. Returns the raw text
   * and the absolute start offset so completion handlers can compute the
   * replace range precisely.
   */
  function readCurrentArg(text, call, pos, baseOpen = call.openParen) {
    let i = baseOpen + 1;
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
  function collectUsedNamedArgs(text, call, baseOpen = call.openParen) {
    const used = new Set();
    let i = baseOpen + 1;
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

    // ---------- Context: import braces ----------
    // Inside `import { … } from "./other.aktion"`, suggest the names that
    // module exports — `$count`, `increment`, components, … — resolved from the
    // current project files (relative/absolute specifier). We return here so the
    // general component/global completions never leak into the braces.
    const importCtx = findImportBracketContext(text, pos);
    if (importCtx) {
      let options = [];
      if (importCtx.specifier) {
        const resolved = resolveSpecifier(importCtx.specifier, activeFile);
        const src = resolved != null ? files[resolved] : undefined;
        if (typeof src === "string") {
          options = collectModuleExports(src)
            .filter((e) => !importCtx.used.has(e.label) || e.label === word.text)
            .map((e) => ({ label: e.label, type: e.type, detail: e.detail, apply: e.label, boost: 60 }));
        }
      }
      return { from: word.from, options, validFor: /[\w$]*/ };
    }

    // ---------- Context: enclosing call ----------
    const call = findEnclosingCall(text, pos);
    if (call && call.name) {
      // Named props are written inside a trailing object literal
      // (`Button("Save", { variant: … })`, `$http({ url: … })`). When the
      // cursor sits inside such an object, scan the current arg / used keys
      // relative to that `{` so key + value completions fire inside braces.
      const objOpen = enclosingObjectOpen(text, call, pos);
      const argBase = objOpen != null ? objOpen : call.openParen;
      const inObject = objOpen != null;
      // `$http({ … })` exposes the synthetic config spec (`url`, `method`,
      // …); every other call resolves to a library component by name.
      const spec = (call.name === "$http" && inObject)
        ? HTTP_CONFIG_SPEC
        : langSpec.componentsByName[call.name];

      if (spec) {
        const { argStart, argText } = readCurrentArg(text, call, pos, argBase);

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
        //
        //         Named args live in a trailing object literal — `Button("Save",
        //         { variant: "primary" })`. When the cursor is NOT yet inside a
        //         `{ }` (a bare positional slot like `Button("Save", |)`), the
        //         completion inserts the WHOLE object (`{ variant: "primary" }`)
        //         so it stays valid; inside the braces it just inserts the
        //         `name: value` pair. A bare `name: value` directly as a call
        //         argument is a parse error, so we never emit that shape.
        const couldBeNamedArgName = /^\s*[A-Za-z_]?[\w]*$/.test(argText);
        if (couldBeNamedArgName && spec.params && spec.params.length > 0) {
          const used = collectUsedNamedArgs(text, call, argBase);
          const remaining = spec.params.filter((p) => !used.has(p.name));
          if (remaining.length > 0) {
            const options = remaining.map((p) => ({
              label: inObject ? `${p.name}:` : `{ ${p.name}: … }`,
              type: "property",
              detail: p.type + (p.required ? "" : " (optional)"),
              boost: p.required ? 50 : 30,
              info: () => makeParamInfo(p),
              apply: applyNamedArg(p, inObject),
            }));
            // When we have something to offer for named args, return them
            // as the only suggestions — anything else (component names,
            // globals) would be wrong here. The user can still escape
            // with `Esc` if they want a positional value.
            const from = word.from;
            return { from, options, validFor: /[\w]*/ };
          }
        }
      }
    }

    // ---------- Member completions (after a `.`) ----------
    // `$todos.` → resource bag members, `Math.` → Math methods,
    // `route.` → router handle, `storage.local.` → nested namespace. We
    // look at the receiver path immediately before the partial member name.
    const beforeWord = text.slice(0, word.from);
    const dotMatch = beforeWord.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.\s*$/);
    if (dotMatch) {
      const memberOpts = memberCompletionsFor(dotMatch[1], text);
      if (memberOpts && memberOpts.length > 0) {
        return { from: word.from, options: memberOpts, validFor: /[\w$]*/ };
      }
    }

    // ---------- General completions ----------
    if (word.from === word.to && !ctx.explicit) return null;

    const wordText = word.text;
    const options = [];

    // Sigil-aware visibility. `$`-typing shows only the Aktion globals that
    // carry the sigil (`$util`, `$http`, `$router`, `$store`, …); a plain (or
    // empty / explicit) prefix shows everything else, INCLUDING the `$`
    // globals so they're still discoverable when typed without the sigil and
    // CodeMirror fuzzy-matches them. (`@`-builtins were removed when the
    // runtime moved to the `$util` namespace, so nothing starts with `@`.)
    const sigilOk = (label) => {
      if (wordText.startsWith("@")) return label.startsWith("@");
      if (wordText.startsWith("$")) return label.startsWith("$");
      return !label.startsWith("@");
    };

    // Components (with snippet-aware apply). Names are always bare, so they
    // drop out as soon as the user types a `$`.
    for (const c of langSpec.components) {
      if (!sigilOk(c.name)) continue;
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

    // Built-in namespace globals — Aktion's `$util` / `$console` / `$storage`
    // plus the bare JS standard library (`Math`, `JSON`, `Object`, `Array`).
    // We surface the namespace itself plus its flat members (`$util.count`).
    for (const ns of GLOBAL_NAMESPACES) {
      if (!sigilOk(ns.name)) continue;
      options.push({
        label: ns.name,
        type: "namespace",
        detail: "global",
        info: ns.description,
        apply: `${ns.name}.`,
      });
      for (const member of ns.members) {
        options.push({
          label: `${ns.name}.${member.name}`,
          type: member.apply.includes("(") ? "method" : "property",
          detail: ns.name,
          info: member.info,
          apply: autocomplete.snippet(`${ns.name}.${member.apply}`),
        });
      }
    }

    // Callable globals & constructors (`$http`, the timer family,
    // `parseInt`, `Date`, `Map`, …).
    for (const g of CALLABLE_GLOBALS) {
      if (!sigilOk(g.label)) continue;
      options.push({
        label: g.label,
        type: g.detail === "constructor" ? "class" : "function",
        detail: g.detail,
        info: g.info,
        apply: g.snippet ? autocomplete.snippet(g.apply) : g.apply,
      });
    }

    // Language keywords (`if`, `match`, `for`, `function`, …).
    for (const kw of LANGUAGE_KEYWORDS) {
      if (!sigilOk(kw.label)) continue;
      options.push({
        label: kw.label,
        type: "keyword",
        detail: "keyword",
        info: kw.info,
      });
    }

    // Reserved identifiers & Aktion globals (`aktion`, `route`, `$router`,
    // `$store`, `$effect`, `$emit`, `$theme`, `$i18n`, …).
    for (const id of SPECIAL_IDENTIFIERS) {
      if (!sigilOk(id.label)) continue;
      options.push({
        label: id.label,
        type: id.label.startsWith("$") ? "variable" : "constant",
        detail: id.label.startsWith("$") ? "global" : "reactive",
        info: id.info,
        apply: id.snippet ? autocomplete.snippet(id.apply) : id.apply,
      });
    }

    // Multi-line snippets — language-level templates first, then the
    // library's component-shaped snippets. Snippet names are bare.
    for (const s of LANGUAGE_SNIPPETS) {
      if (!sigilOk(s.name)) continue;
      options.push({
        label: s.name + "…",
        type: "snippet",
        detail: "language",
        info: s.description,
        apply: autocomplete.snippet(s.template),
      });
    }
    for (const s of langSpec.snippets) {
      if (!sigilOk(s.name)) continue;
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
   *
   * `inObject` controls wrapping: inside an existing props object we emit
   * the bare `name: value` pair; at a positional slot we wrap it in a fresh
   * `{ … }` so the result is `Button("Save", { variant: "primary" })` rather
   * than the invalid `Button("Save", variant: "primary")`.
   */
  function applyNamedArg(param, inObject = true) {
    const enumValues = param.enumValues ?? [];
    let body;
    if (enumValues.length > 0) {
      // CodeMirror 6 has no choice-field snippet syntax (`${1|a,b|}` is a
      // VS Code-ism), so seed the FIRST allowed value as an overtypeable
      // placeholder — `variant: "primary"`. The value-position completion
      // and the status-bar enum picker offer the rest once the cursor lands
      // in the slot.
      body = `${param.name}: \${1:"${enumValues[0]}"}`;
    } else if (param.type === "boolean") {
      body = `${param.name}: \${1:true}`;
    } else if (param.type === "string") {
      body = `${param.name}: "\${1}"`;
    } else if (param.type === "number") {
      body = `${param.name}: \${1:0}`;
    } else {
      body = `${param.name}: \${1}`;
    }
    return autocomplete.snippet(inObject ? body : `{ ${body} }`);
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

  /**
   * Find every `$name` whose value comes from an `$http({...})` call
   * (`$todos = $http(`, `$x = await $http(`). Those names carry the reactive
   * resource bag, so `$name.` should complete to `.data` / `.refetch()` /
   * `.onDone` / … rather than nothing.
   */
  function scanHttpResources(source) {
    const out = new Set();
    const re = /\$([A-Za-z_][\w]*)\s*=\s*(?:await\s+)?\$http\s*\(/g;
    let m;
    while ((m = re.exec(source))) out.add(m[1]);
    return out;
  }

  /** Build a single member-completion option from a relative member spec. */
  function memberOption(member, receiverLabel) {
    return {
      label: member.name,
      type: member.apply.includes("(") || member.snippet ? "method" : "property",
      detail: receiverLabel,
      info: member.info,
      apply: autocomplete.snippet(member.apply),
    };
  }

  /**
   * Resolve member completions for a `receiver.` position. Handles the JS
   * namespace globals (and their nested sub-namespaces like
   * `storage.local`), the reserved `route` handle, and any `$variable`
   * assigned from `$http({...})` (→ the reactive resource bag). Returns
   * `null` when the receiver isn't a known object so general completions
   * can take over.
   */
  function memberCompletionsFor(receiver, source) {
    for (const ns of GLOBAL_NAMESPACES) {
      if (receiver === ns.name) {
        return ns.members.map((m) => memberOption(m, ns.name));
      }
      if (receiver.startsWith(ns.name + ".")) {
        const sub = receiver.slice(ns.name.length + 1); // e.g. "local"
        const matched = ns.members
          .filter((m) => m.name.startsWith(sub + "."))
          .map((m) => memberOption(
            { ...m, name: m.name.slice(sub.length + 1), apply: m.apply.slice(sub.length + 1) },
            receiver,
          ));
        if (matched.length > 0) return matched;
      }
    }
    if (receiver === "route") {
      return ROUTE_MEMBERS.map((m) => memberOption(m, "route"));
    }
    if (receiver.startsWith("$") && scanHttpResources(source).has(receiver.slice(1))) {
      return HTTP_RESOURCE_MEMBERS.map((m) => memberOption(m, receiver));
    }
    return null;
  }

  // ---- Spec lookup (hover & signature tooltips share this) ----
  function resolveSpec(rawName) {
    if (!rawName) return null;
    // `$http(...)` carries a synthetic param spec (`url`, `method`, …) so
    // signature help + hover light up inside the config object. Kind
    // "component" keeps the `$http` name un-prefixed in the tooltip.
    if (rawName === "$http") return { kind: "component", spec: HTTP_CONFIG_SPEC };
    const component = langSpec.componentsByName[rawName];
    if (component) return { kind: "component", spec: component };
    return null;
  }

  /**
   * Resolve a runtime global / reserved identifier (namespace, callable, or
   * special binding) to a small doc record for the hover popup. Covers the
   * Aktion globals (`$util`, `$console`, `$storage`, `$router`, `$store`,
   * `$effect`, `$emit`, `$theme`, `$i18n`, `route`, `params`, `aktion`) and
   * the curated JS surface (`Math`, `setTimeout`, `Date`, …). Returns `null`
   * when the name isn't a known global so the caller can fall through.
   */
  function resolveGlobalDoc(rawName) {
    if (!rawName) return null;
    const ns = GLOBAL_NAMESPACES.find((n) => n.name === rawName);
    if (ns) {
      return {
        name: ns.name,
        signature: ns.signature,
        description: ns.description,
        kind: "namespace",
        members: ns.members,
      };
    }
    const callable = CALLABLE_GLOBALS.find((g) => g.label === rawName);
    if (callable) {
      return { name: callable.label, description: callable.info, kind: callable.detail };
    }
    const ident = SPECIAL_IDENTIFIERS.find((s) => s.label === rawName);
    if (ident) {
      return {
        name: ident.label,
        description: ident.info,
        kind: ident.label.startsWith("$") ? "global" : "reserved",
      };
    }
    return null;
  }

  /**
   * Build the hover-popup DOM for a runtime global — header + optional
   * signature + description, plus a member-chip preview for namespaces.
   * Reuses the shared `.pg-cm-*` tooltip styling.
   */
  function buildGlobalTooltipDom(doc) {
    const wrap = document.createElement("div");
    const header = document.createElement("h4");
    const icon = document.createElement("i");
    icon.className = doc.kind === "namespace"
      ? "fa-solid fa-cubes"
      : (doc.kind === "constructor" || doc.kind === "class")
        ? "fa-solid fa-cube"
        : "fa-solid fa-bolt";
    header.append(icon, document.createTextNode(` ${doc.name}`));
    if (doc.kind) {
      const tag = document.createElement("span");
      tag.className = "pg-cm-group";
      tag.textContent = doc.kind;
      header.append(tag);
    }
    wrap.append(header);
    if (doc.signature) {
      const sig = document.createElement("code");
      sig.className = "pg-cm-sig";
      sig.textContent = doc.signature;
      wrap.append(sig);
    }
    if (doc.description) {
      const p = document.createElement("p");
      p.className = "pg-cm-desc";
      p.textContent = doc.description;
      wrap.append(p);
    }
    if (doc.members && doc.members.length > 0) {
      const lbl = document.createElement("div");
      lbl.className = "pg-cm-section";
      lbl.textContent = "Members";
      wrap.append(lbl);
      const list = document.createElement("div");
      list.className = "pg-cm-enum-list";
      const shown = doc.members.slice(0, 16);
      for (const m of shown) {
        const chip = document.createElement("span");
        chip.className = "pg-cm-enum";
        chip.textContent = m.name;
        list.append(chip);
      }
      if (doc.members.length > shown.length) {
        const more = document.createElement("span");
        more.className = "pg-cm-enum";
        more.textContent = `+${doc.members.length - shown.length} more`;
        list.append(more);
      }
      wrap.append(list);
    }
    return wrap;
  }

  /**
   * Return the source index of the innermost object-literal `{` that
   * encloses `pos` within the call's parentheses, or `null` when the cursor
   * isn't inside a `{ }`. Used so named-arg completion fires relative to a
   * trailing props object (`Button("Save", { … })`, `$http({ … })`) rather
   * than the call's bare `(`. String / comment aware.
   */
  function enclosingObjectOpen(text, call, pos) {
    let i = call.openParen + 1;
    let str = null;
    let comment = null;
    const stack = []; // [{ ch, index }]
    const top = Math.min(pos, text.length);
    while (i < top) {
      const ch = text[i];
      if (comment === "line") { if (ch === "\n") comment = null; i++; continue; }
      if (comment === "block") { if (ch === "*" && text[i + 1] === "/") { comment = null; i += 2; continue; } i++; continue; }
      if (str) { if (ch === "\\") { i += 2; continue; } if (ch === str) str = null; i++; continue; }
      if (ch === "/" && text[i + 1] === "/") { comment = "line"; i += 2; continue; }
      if (ch === "#") { comment = "line"; i++; continue; }
      if (ch === "/" && text[i + 1] === "*") { comment = "block"; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { str = ch; i++; continue; }
      if (ch === "(" || ch === "[" || ch === "{") { stack.push({ ch, index: i }); i++; continue; }
      if (ch === ")" || ch === "]" || ch === "}") { stack.pop(); i++; continue; }
      i++;
    }
    for (let k = stack.length - 1; k >= 0; k -= 1) {
      if (stack[k].ch === "{") return stack[k].index;
    }
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

  /**
   * Build the hover-popup DOM for a reserved keyword: header, one-line
   * definition, the syntax skeleton, and a usage example.
   */
  function buildKeywordTooltipDom(name, doc) {
    const wrap = document.createElement("div");

    const header = document.createElement("h4");
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-key";
    header.append(icon, document.createTextNode(` ${name}`));
    const tag = document.createElement("span");
    tag.className = "pg-cm-group";
    tag.textContent = "keyword";
    header.append(tag);
    wrap.append(header);

    const desc = document.createElement("p");
    desc.className = "pg-cm-desc";
    desc.textContent = doc.summary;
    wrap.append(desc);

    const syntaxLabel = document.createElement("div");
    syntaxLabel.className = "pg-cm-section";
    syntaxLabel.textContent = "Syntax";
    wrap.append(syntaxLabel);
    const syntax = document.createElement("code");
    syntax.className = "pg-cm-sig";
    syntax.textContent = doc.syntax;
    wrap.append(syntax);

    const exampleLabel = document.createElement("div");
    exampleLabel.className = "pg-cm-section";
    exampleLabel.textContent = "Example";
    wrap.append(exampleLabel);
    const example = document.createElement("pre");
    example.className = "pg-cm-example";
    example.textContent = doc.example;
    wrap.append(example);

    return wrap;
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
          li.append(buildEnumSelect(p));
        } else if (p.type === "boolean") {
          li.append(buildEnumSelect({ ...p, enumValues: ["true", "false"] }));
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
      label.textContent = "Allowed values · click to insert";
      card.append(label, buildEnumSelect(param));
    } else if (param.type === "boolean") {
      const label = document.createElement("span");
      label.className = "pg-cm-enum-label";
      label.textContent = "Allowed values · click to insert";
      const synthetic = { ...param, enumValues: ["true", "false"], type: "boolean" };
      card.append(label, buildEnumSelect(synthetic));
    }
    return card;
  }

  /**
   * Render a parameter's enum values as a clickable picker. Each value is a
   * button that, when clicked, drops the literal at the editor cursor —
   * either replacing the partial value the user is editing, inserting a
   * properly-quoted token into a fresh slot, or wrapping a bare identifier
   * in a `name: value` pair when the cursor is on the argument boundary.
   *
   * Booleans render as a two-button toggle (`true` / `false`).
   */
  function buildEnumSelect(param) {
    const list = document.createElement("div");
    list.className = "pg-cm-enum-list";
    const isBoolean = param.type === "boolean";
    for (const value of param.enumValues) {
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "pg-cm-enum pg-cm-enum-pick";
      badge.textContent = value;
      badge.title = `Insert ${value}`;
      badge.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertEnumValueAtCursor(param, value, { quoted: !isBoolean });
      });
      list.append(badge);
    }
    return list;
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

  /**
   * Drop an enum literal at the current cursor position inside the active
   * `name: …` slot. Detects whether a partial value is already there and
   * replaces it; otherwise inserts a properly-quoted token. Falls back to
   * pasting `name: value` when the cursor isn't yet inside a value slot.
   */
  function insertEnumValueAtCursor(param, value, opts) {
    if (!editorView) return;
    const quoted = opts && opts.quoted;
    const text = editorView.state.doc.toString();
    const pos = editorView.state.selection.main.head;
    const literal = quoted ? `"${value}"` : value;
    const call = findEnclosingCall(text, pos);
    if (call) {
      const { argStart, argText } = readCurrentArg(text, call, pos);
      const valueMatch = argText.match(/^(\s*[A-Za-z_]\w*\s*:\s*)(.*)$/s);
      if (valueMatch) {
        const prefixLen = valueMatch[1].length;
        const partial = valueMatch[2];
        // Replace whatever literal/identifier the user is editing.
        let trailing = 0;
        while (
          trailing < partial.length &&
          !/[,)\n]/.test(partial[trailing])
        ) {
          trailing += 1;
        }
        const from = argStart + prefixLen;
        const to = argStart + prefixLen + trailing;
        editorView.dispatch({
          changes: { from, to, insert: literal },
          selection: { anchor: from + literal.length },
        });
        editorView.focus();
        return;
      }
    }
    editorView.dispatch({
      changes: { from: pos, insert: `${param.name}: ${literal}` },
      selection: { anchor: pos + param.name.length + 2 + literal.length },
    });
    editorView.focus();
  }

  // ---- Linter: surface ParseError from runtime/parser ----
  // The §19.1 "one positional argument max" advisory is informational for
  // every component (the runtime still slots extras into the next prop),
  // so we hide it from the playground to keep the inline diagnostic list
  // focused on hard errors.
  const isPositionalAdvisory = (err) =>
    typeof err?.message === "string" &&
    /allows at most one positional argument/i.test(err.message);

  const lintSource = lint.linter((view) => {
    const text = view.state.doc.toString();
    const program = parse(text);
    const filtered = program.errors.filter((e) => !isPositionalAdvisory(e));
    parseErrors = filtered;
    refreshStatusErrors();
    return filtered.map((err) => {
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
    // Pull the sigil into the name so `$util` / `$router` / `$http` resolve
    // as globals (CodeMirror's `wordAt` stops at the `$`).
    const fromIdx = (prev === "@" || prev === "$") ? word.from - 1 : word.from;
    const rawName = text.slice(fromIdx, word.to);

    // Reserved-keyword popup: definition + syntax + example. Only when the
    // hovered word isn't sigil-prefixed (`$state` / `$global` are handled
    // elsewhere) and is a known keyword.
    if (prev !== "@" && prev !== "$" && KEYWORD_DOCS[rawName]) {
      const kwDoc = KEYWORD_DOCS[rawName];
      return {
        pos: word.from,
        end: word.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "pg-cm-tooltip";
          dom.append(buildKeywordTooltipDom(rawName, kwDoc));
          return { dom };
        },
      };
    }

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

    // Runtime globals — `$util`, `$console`, `$storage`, `$router`, `$store`,
    // `route`, `setTimeout`, `Math`, … — show their signature + description.
    const globalDoc = resolveGlobalDoc(rawName);
    if (globalDoc) {
      return {
        pos: fromIdx,
        end: word.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "pg-cm-tooltip";
          dom.append(buildGlobalTooltipDom(globalDoc));
          return { dom };
        },
      };
    }

    // Not a component/global — fall back to "is this a named-arg key of
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

  // Multi-file project state. `files` maps a path to its source (folders are
  // implied by `/` in the path); `folders` holds explicitly-created folder
  // paths (so empty folders persist). `activeFile` is the file shown in the
  // editor; `openTabs` is the ordered set of files with a tab. `expanded` is
  // the set of open folders; `selected` drives multi-select; `clipboard` backs
  // copy/cut→paste. The linker always links from `ENTRY_FILE`.
  let files = {};
  let folders = new Set();
  let activeFile = ENTRY_FILE;
  let openTabs = [];
  let expanded = new Set();
  let selected = new Set();
  let lastClicked = null;     // anchor for shift-range selection
  let clipboard = null;       // { mode: "copy" | "cut", paths: string[] }
  let visiblePaths = [];      // tree paths in render order (range-select / keyboard nav)
  let dragPaths = [];         // paths being dragged
  let projectDiagnostics = [];

  // Persist the whole project. The legacy `LS.code` key is kept in sync with
  // the entry file so older single-file share/restore paths keep working.
  function persistFiles() {
    lsWrite(LS.files, JSON.stringify(files));
    lsWrite(LS.folders, JSON.stringify([...folders]));
    lsWrite(LS.openTabs, JSON.stringify(openTabs));
    lsWrite(LS.expanded, JSON.stringify([...expanded]));
    lsWrite(LS.activeFile, activeFile);
    lsWrite(LS.code, files[ENTRY_FILE] ?? "");
  }

  // Capture the editor's current text into the active file (call before any
  // read of the whole project — linking, zipping, switching files).
  function syncActiveFile() {
    if (editorView) files[activeFile] = editorView.state.doc.toString();
  }

  const persistCode = () => {
    syncActiveFile();
    persistFiles();
  };

  function handleDocChange() {
    persistCode();
    refreshStatusChars();
    if (currentRunMode === "live") scheduleViewerUpdate(false);
  }

  // Auto-open the export suggestions when the cursor lands inside import braces.
  // Typing a name already triggers autocomplete (`activateOnTyping`); this also
  // fires for the separators — `{`, `,`, space — so empty braces pop suggestions
  // too. Deferred to a microtask so we don't re-dispatch mid-update.
  function maybeAutostartImportCompletion(u) {
    let sawSeparator = false;
    u.changes.iterChanges((_fa, _ta, _fb, _tb, inserted) => {
      if (/[{,\s]/.test(inserted.toString())) sawSeparator = true;
    });
    if (!sawSeparator) return;
    const pos = u.state.selection.main.head;
    if (!findImportBracketContext(u.state.doc.toString(), pos)) return;
    queueMicrotask(() => {
      try { autocomplete.startCompletion(editorView); } catch { /* noop */ }
    });
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
        // Accept the highlighted completion with Tab (in addition to Enter).
        // `acceptCompletion` returns false when no completion popup is open,
        // so Tab falls through to snippet-field navigation / indentation.
        // Ordered before `indentWithTab` so an open popup wins over indent.
        { key: "Tab", run: autocomplete.acceptCompletion },
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
          key: "Mod-Shift-d",
          run: () => {
            toggleDevtools();
            return true;
          },
          preventDefault: true,
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
          maybeAutostartImportCompletion(u);
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
      themeCompartment.of(highlightExtFor(isDarkDocTheme())),
      editableCompartment.of([]),
    ],
  });

  const editorHost = $("pg-editor");
  $("pg-editor-loader").hidden = true;
  editorView = new view.EditorView({ state: startState, parent: editorHost });

  // Keep the CM highlight palette in sync with the docs light/dark theme.
  const themeObserver = new MutationObserver(() => {
    editorView.dispatch({
      effects: themeCompartment.reconfigure(highlightExtFor(isDarkDocTheme())),
    });
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-doc-theme"],
  });

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
  setRendererTheme(lsRead(LS.theme, "light"));
  renderFileExplorer();
  renderTabs();
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
  $("pg-devtools").addEventListener("click", toggleDevtools);
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

  // File explorer wiring
  $("pg-file-new").addEventListener("click", () => createFileAt(""));
  $("pg-folder-new").addEventListener("click", () => createFolderAt(""));
  // stopPropagation so this same click doesn't reach the document-level
  // "click outside → close menu" listener and instantly dismiss the menu.
  $("pg-import").addEventListener("click", (e) => { e.stopPropagation(); openImportMenu(e.currentTarget); });
  $("pg-export").addEventListener("click", (e) => { e.stopPropagation(); openExportMenu(e.currentTarget); });

  const tree = $("pg-file-list");
  tree.addEventListener("click", onTreeClick);
  tree.addEventListener("dblclick", onTreeDblClick);
  tree.addEventListener("contextmenu", onTreeContextMenu);
  tree.addEventListener("keydown", onTreeKeydown);
  // Drag-and-drop to move files/folders.
  tree.addEventListener("dragstart", onTreeDragStart);
  tree.addEventListener("dragover", onTreeDragOver);
  tree.addEventListener("dragleave", onTreeDragLeave);
  tree.addEventListener("drop", onTreeDrop);

  // Tabs
  $("pg-tabs").addEventListener("click", onTabsClick);

  // Hidden import inputs
  $("pg-import-files").addEventListener("change", (e) => importLocalFiles(e.target.files, ""));
  $("pg-import-folder").addEventListener("change", (e) => importLocalFiles(e.target.files, "", true));
  $("pg-import-zip").addEventListener("change", (e) => importZipFile(e.target.files[0]));

  // Dismiss any open menu on outside click / Escape / scroll.
  document.addEventListener("click", (e) => { if (!e.target.closest(".pg-ctxmenu")) closeContextMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeContextMenu(); });

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

  // Reset the folder/tab/expanded model to the defaults for the current
  // `files`/`activeFile` (one open tab, no extra folders, all collapsed).
  function freshModel() {
    folders = new Set();
    openTabs = [activeFile];
    expanded = new Set();
    selected = new Set();
    clipboard = null;
  }

  function pickInitialCode() {
    // Seeds `files` / `activeFile` (+ the folder/tab model) as a side effect and
    // returns the doc text + example label for the editor's initial state.
    // 1. Shared snippet via `?code=` / `#code=` → lands in `app.aktion`.
    const shared = readSharedCode();
    if (shared) {
      files = { [ENTRY_FILE]: "// Loading shared snippet…" };
      activeFile = ENTRY_FILE;
      freshModel();
      scheduleHydrateFromHash(shared);
      return { code: files[ENTRY_FILE], example: "custom" };
    }
    // 2. Saved multi-file project — restore files, folders, tabs, expansion.
    const savedFiles = readSavedFiles();
    if (savedFiles) {
      files = savedFiles;
      const saved = lsRead(LS.activeFile, ENTRY_FILE);
      activeFile = files[saved] !== undefined ? saved : ENTRY_FILE;
      folders = new Set((readJSON(LS.folders) || []).filter((p) => typeof p === "string"));
      const tabs = (readJSON(LS.openTabs) || []).filter((p) => files[p] !== undefined);
      openTabs = tabs.length ? tabs : [activeFile];
      if (!openTabs.includes(activeFile)) openTabs.push(activeFile);
      expanded = new Set((readJSON(LS.expanded) || []).filter((p) => typeof p === "string"));
      selected = new Set();
      clipboard = null;
      return { code: files[activeFile] ?? "", example: lsRead(LS.example, "custom") };
    }
    // 3. Legacy single-file code → migrate into `app.aktion`.
    const legacy = lsRead(LS.code, null);
    if (legacy !== null) {
      files = { [ENTRY_FILE]: legacy };
      activeFile = ENTRY_FILE;
      freshModel();
      return { code: legacy, example: lsRead(LS.example, DEFAULT_EXAMPLE) };
    }
    // 4. Default example.
    files = { [ENTRY_FILE]: EXAMPLES[DEFAULT_EXAMPLE].code };
    activeFile = ENTRY_FILE;
    freshModel();
    return { code: files[ENTRY_FILE], example: DEFAULT_EXAMPLE };
  }

  function readJSON(key) {
    const raw = lsRead(key, null);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // Parse the persisted project; returns a validated `{ path → source }` map
  // (must be a non-empty object that includes the entry) or `null`.
  function readSavedFiles() {
    const raw = lsRead(LS.files, null);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const keys = Object.keys(parsed);
      if (keys.length === 0) return null;
      for (const k of keys) if (typeof parsed[k] !== "string") return null;
      if (parsed[ENTRY_FILE] === undefined) parsed[ENTRY_FILE] = "";
      return parsed;
    } catch {
      return null;
    }
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
      // Shared snippets are single-file: reset the project to just the entry.
      files = { [ENTRY_FILE]: text };
      activeFile = ENTRY_FILE;
      freshModel();
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: text },
      });
      persistFiles();
      renderFileExplorer();
      renderTabs();
      currentExample = "custom";
      showToast("Loaded shared snippet", { icon: "link" });
    } catch (err) {
      console.error(err);
      showToast("Couldn't decode shared link", { icon: "triangle-exclamation" });
    }
  }

  // ---- File explorer (tree) ----
  // NOTE: these are function declarations (not const arrows) so they're hoisted
  // — `renderFileExplorer()` runs from the init block ABOVE this section.

  function parentOf(p) { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }
  function baseName(p) { const i = p.lastIndexOf("/"); return i < 0 ? p : p.slice(i + 1); }

  // Every folder path, derived from file paths + explicitly-created folders.
  function allFolders() {
    const set = new Set(folders);
    for (const f of Object.keys(files)) {
      const parts = f.split("/"); parts.pop();
      let acc = "";
      for (const seg of parts) { acc = acc ? `${acc}/${seg}` : seg; set.add(acc); }
    }
    return set;
  }
  const isFolderPath = (p) => allFolders().has(p);
  const isDescendant = (p, ancestor) => ancestor !== "" && (p === ancestor || p.startsWith(`${ancestor}/`));

  function renderFileExplorer() {
    const tree = $("pg-file-list");
    if (!tree) return;
    tree.replaceChildren();
    tree.dataset.rootDrop = "false";
    visiblePaths = [];
    const all = allFolders();

    const renderDir = (dir, depth) => {
      const subs = [...all].filter((p) => parentOf(p) === dir && p !== "").sort((a, b) => baseName(a).localeCompare(baseName(b)));
      const filePaths = Object.keys(files).filter((p) => parentOf(p) === dir).sort((a, b) => {
        if (dir === "") { if (a === ENTRY_FILE) return -1; if (b === ENTRY_FILE) return 1; }
        return baseName(a).localeCompare(baseName(b));
      });
      for (const sub of subs) {
        tree.append(makeRow(sub, "folder", depth));
        visiblePaths.push(sub);
        if (expanded.has(sub)) renderDir(sub, depth + 1);
      }
      for (const f of filePaths) {
        tree.append(makeRow(f, "file", depth));
        visiblePaths.push(f);
      }
    };
    renderDir("", 0);
  }

  function makeRow(path, kind, depth) {
    const row = document.createElement("div");
    row.className = "pg-row";
    row.dataset.path = path;
    row.dataset.kind = kind;
    row.draggable = true;
    row.style.paddingLeft = `${depth * 14 + 4}px`;
    if (path === activeFile && kind === "file") row.dataset.active = "true";
    if (selected.has(path)) row.dataset.selected = "true";
    // Dim a cut file/folder (and its descendants) until it's pasted.
    if (clipboard && clipboard.mode === "cut" &&
        clipboard.paths.some((p) => p === path || path.startsWith(`${p}/`))) {
      row.dataset.cut = "true";
    }
    row.setAttribute("role", "treeitem");

    const twisty = document.createElement("span");
    twisty.className = "pg-row-twisty";
    if (kind === "folder") {
      twisty.innerHTML = `<i class="fa-solid ${expanded.has(path) ? "fa-chevron-down" : "fa-chevron-right"}"></i>`;
    }
    const icon = document.createElement("span");
    icon.className = "pg-row-icon";
    if (kind === "folder") {
      icon.innerHTML = `<i class="fa-solid ${expanded.has(path) ? "fa-folder-open" : "fa-folder"} pg-ic-folder"></i>`;
    } else {
      const { icon: ic, cls } = fileKind(path);
      icon.innerHTML = `<i class="fa-solid ${ic} ${cls}"></i>`;
    }
    const name = document.createElement("span");
    name.className = "pg-row-name";
    name.textContent = baseName(path);
    name.title = path;
    row.append(twisty, icon, name);
    if (path === ENTRY_FILE) {
      const badge = document.createElement("span");
      badge.className = "pg-row-badge";
      badge.textContent = "entry";
      row.append(badge);
    }
    return row;
  }

  // ---- Tabs ----
  function renderTabs() {
    const bar = $("pg-tabs");
    if (!bar) return;
    bar.replaceChildren();
    for (const path of openTabs) {
      if (files[path] === undefined) continue;
      const tab = document.createElement("div");
      tab.className = "pg-tab";
      tab.dataset.path = path;
      tab.dataset.active = path === activeFile ? "true" : "false";
      tab.setAttribute("role", "tab");
      const { icon, cls } = fileKind(path);
      const ic = document.createElement("i");
      ic.className = `fa-solid ${icon} ${cls} pg-tab-icon`;
      const nm = document.createElement("span");
      nm.className = "pg-tab-name";
      nm.textContent = baseName(path);
      nm.title = path;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "pg-tab-close";
      close.dataset.close = path;
      close.title = `Close ${baseName(path)}`;
      close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      tab.append(ic, nm, close);
      bar.append(tab);
    }
  }

  function onTabsClick(e) {
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) { closeTab(closeBtn.dataset.close); return; }
    const tab = e.target.closest(".pg-tab");
    if (tab) openFile(tab.dataset.path);
  }

  function closeTab(path) {
    const i = openTabs.indexOf(path);
    if (i < 0) return;
    openTabs.splice(i, 1);
    if (activeFile === path) {
      const next = openTabs[i] || openTabs[i - 1] || openTabs[openTabs.length - 1];
      if (next) { openFile(next); return; }
      openFile(ENTRY_FILE); return; // never leave the editor with no file
    }
    persistFiles();
    renderTabs();
  }

  // Expand every ancestor folder of `path` so it's visible in the tree.
  function revealPath(path) {
    let acc = "";
    for (const seg of parentOf(path).split("/")) {
      if (!seg) continue;
      acc = acc ? `${acc}/${seg}` : seg;
      expanded.add(acc);
    }
  }

  // ---- Open / select ----
  function openFile(path) {
    if (files[path] === undefined) return;
    syncActiveFile();
    activeFile = path;
    if (!openTabs.includes(path)) openTabs.push(path);
    selected = new Set([path]);
    lastClicked = path;
    revealPath(path);
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: files[path] } });
    persistFiles();
    renderFileExplorer();
    renderTabs();
    refreshStatusChars();
    refreshStatusCursor();
  }

  function onTreeClick(e) {
    const row = e.target.closest(".pg-row");
    if (!row) { selected = new Set(); lastClicked = null; renderFileExplorer(); return; }
    const path = row.dataset.path;
    const kind = row.dataset.kind;
    if (e.metaKey || e.ctrlKey) {
      if (selected.has(path)) selected.delete(path); else selected.add(path);
      lastClicked = path;
      renderFileExplorer();
      return;
    }
    if (e.shiftKey && lastClicked) {
      const a = visiblePaths.indexOf(lastClicked);
      const b = visiblePaths.indexOf(path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        selected = new Set(visiblePaths.slice(lo, hi + 1));
        renderFileExplorer();
        return;
      }
    }
    selected = new Set([path]);
    lastClicked = path;
    if (kind === "folder") {
      if (expanded.has(path)) expanded.delete(path); else expanded.add(path);
      persistFiles();
      renderFileExplorer();
    } else {
      openFile(path);
    }
  }

  function onTreeDblClick(e) {
    const row = e.target.closest(".pg-row");
    if (row) renameOne(row.dataset.path);
  }

  function onTreeKeydown(e) {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selected.size) { e.preventDefault(); deletePaths([...selected]); }
    } else if (e.key === "F2") {
      if (selected.size === 1) { e.preventDefault(); renameOne([...selected][0]); }
    } else if (e.key === "Enter") {
      if (selected.size === 1) { const p = [...selected][0]; if (files[p] !== undefined) openFile(p); }
    }
  }

  // ---- Structure changes ----
  function afterStructureChange(relink) {
    persistFiles();
    renderFileExplorer();
    renderTabs();
    if (relink !== false) scheduleViewerUpdate(true);
  }

  function ensureFolder(path) {
    if (!path) return;
    folders.add(path);
    let acc = "";
    for (const seg of path.split("/")) { acc = acc ? `${acc}/${seg}` : seg; folders.add(acc); }
  }

  function cleanPath(raw) {
    let n = String(raw || "").trim().replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
    if (!n || n.includes("..")) return null;
    if (!/^[A-Za-z0-9_][A-Za-z0-9_./ -]*$/.test(n)) return null;
    return n;
  }

  function createFileAt(parentFolder) {
    const raw = window.prompt("New file name (e.g. Button.aktion or ui/Card.aktion)", "Component.aktion");
    if (!raw) return;
    let rel = cleanPath(raw);
    if (!rel) { showToast("Invalid file name", { icon: "triangle-exclamation" }); return; }
    if (!/\.[A-Za-z0-9]+$/.test(rel)) rel += ".aktion"; // default extension
    const path = parentFolder ? `${parentFolder}/${rel}` : rel;
    if (files[path] !== undefined) { openFile(path); showToast(`${path} already exists`, { icon: "circle-info" }); return; }
    const base = baseName(path).replace(/\.[^.]+$/, "");
    files[path] = /\.aktion$/i.test(path)
      ? `// ${path}\nexport function ${/^[A-Z]/.test(base) ? base : "Component"}() {\n  return Text("${base}")\n}\n`
      : "";
    ensureFolder(parentOf(path));
    if (parentFolder) expanded.add(parentFolder);
    afterStructureChange(false);
    openFile(path);
    showToast(`Created ${path}`, { icon: "file-circle-plus" });
  }

  function createFolderAt(parentFolder) {
    const raw = window.prompt("New folder name", "components");
    if (!raw) return;
    const rel = cleanPath(raw);
    if (!rel) { showToast("Invalid folder name", { icon: "triangle-exclamation" }); return; }
    const path = parentFolder ? `${parentFolder}/${rel}` : rel;
    ensureFolder(path);
    if (parentFolder) expanded.add(parentFolder);
    expanded.add(path);
    afterStructureChange(false);
    showToast(`Created folder ${path}`, { icon: "folder-plus" });
  }

  // Re-key a file/folder (and a folder's descendants) from one prefix to another.
  function rekeyPrefix(oldPrefix, newPrefix) {
    const moves = {};
    for (const f of Object.keys(files)) {
      if (f === oldPrefix || f.startsWith(`${oldPrefix}/`)) {
        moves[newPrefix + f.slice(oldPrefix.length)] = files[f];
        delete files[f];
      }
    }
    Object.assign(files, moves);
    folders = new Set([...folders].map((d) => (d === oldPrefix || d.startsWith(`${oldPrefix}/`)) ? newPrefix + d.slice(oldPrefix.length) : d));
    const remap = (p) => (p === oldPrefix || p.startsWith(`${oldPrefix}/`)) ? newPrefix + p.slice(oldPrefix.length) : p;
    openTabs = openTabs.map(remap);
    activeFile = remap(activeFile);
    expanded = new Set([...expanded].map(remap));
    selected = new Set([...selected].map(remap));
  }

  function renameOne(path) {
    if (path === ENTRY_FILE) { showToast("The entry file must stay app.aktion", { icon: "circle-info" }); return; }
    const isFolder = isFolderPath(path) && files[path] === undefined;
    const raw = window.prompt(`Rename ${isFolder ? "folder" : "file"}`, baseName(path));
    if (!raw) return;
    const base = cleanPath(raw);
    if (!base || base.includes("/")) { showToast("Invalid name", { icon: "triangle-exclamation" }); return; }
    const dest = parentOf(path) ? `${parentOf(path)}/${base}` : base;
    if (dest === path) return;
    if (files[dest] !== undefined || isFolderPath(dest)) { showToast(`"${dest}" already exists`, { icon: "triangle-exclamation" }); return; }
    rekeyPrefix(path, dest);
    afterStructureChange();
  }

  function deletePaths(paths) {
    const targets = paths.filter((p) => p !== ENTRY_FILE);
    if (!targets.length) { showToast("The entry file can't be deleted", { icon: "circle-info" }); return; }
    const label = targets.length === 1 ? `"${targets[0]}"` : `${targets.length} items`;
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    for (const p of targets) {
      for (const f of Object.keys(files)) if (f === p || f.startsWith(`${p}/`)) delete files[f];
      folders = new Set([...folders].filter((d) => !(d === p || d.startsWith(`${p}/`))));
      openTabs = openTabs.filter((t) => !(t === p || t.startsWith(`${p}/`)));
      expanded = new Set([...expanded].filter((d) => !(d === p || d.startsWith(`${p}/`))));
    }
    selected = new Set();
    if (files[activeFile] === undefined) {
      activeFile = openTabs.find((t) => files[t] !== undefined) || ENTRY_FILE;
      if (!openTabs.includes(activeFile)) openTabs.push(activeFile);
      editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: files[activeFile] ?? "" } });
    }
    afterStructureChange();
    showToast(`Deleted ${label}`, { icon: "trash" });
  }

  function movePaths(paths, targetFolder) {
    let moved = 0;
    for (const p of paths) {
      if (p === ENTRY_FILE) { showToast("The entry file stays at the root", { icon: "circle-info" }); continue; }
      const dest = targetFolder ? `${targetFolder}/${baseName(p)}` : baseName(p);
      if (dest === p) continue;
      if (isFolderPath(p) && files[p] === undefined && isDescendant(targetFolder, p)) continue; // into itself
      if (files[dest] !== undefined || isFolderPath(dest)) { showToast(`"${dest}" already exists`, { icon: "triangle-exclamation" }); continue; }
      rekeyPrefix(p, dest);
      moved++;
    }
    if (moved) { ensureFolder(targetFolder); afterStructureChange(); }
  }

  function uniquePath(path) {
    if (files[path] === undefined && !isFolderPath(path)) return path;
    const dir = parentOf(path);
    const b = baseName(path);
    const dot = b.lastIndexOf(".");
    const stem = dot > 0 ? b.slice(0, dot) : b;
    const ext = dot > 0 ? b.slice(dot) : "";
    let i = 1, cand;
    do { cand = `${dir ? `${dir}/` : ""}${stem}-copy${i > 1 ? i : ""}${ext}`; i++; }
    while (files[cand] !== undefined || isFolderPath(cand));
    return cand;
  }

  function pasteInto(targetFolder) {
    if (!clipboard) return;
    for (const src of clipboard.paths) {
      if (clipboard.mode === "cut") {
        movePaths([src], targetFolder);
      } else {
        // Copy: duplicate the file / folder subtree.
        const destBase = targetFolder ? `${targetFolder}/${baseName(src)}` : baseName(src);
        const dest = uniquePath(destBase);
        if (files[src] !== undefined) {
          files[dest] = files[src];
        } else {
          ensureFolder(dest);
          for (const f of Object.keys(files)) {
            if (f.startsWith(`${src}/`)) files[dest + f.slice(src.length)] = files[f];
          }
        }
      }
    }
    if (clipboard.mode === "cut") clipboard = null;
    ensureFolder(targetFolder);
    afterStructureChange();
  }

  // ---- Clipboard ----
  function setClipboard(mode, paths) {
    clipboard = { mode, paths: [...paths] };
    renderFileExplorer(); // re-render so a cut selection dims immediately
  }

  // ---- Context menu ----
  function closeContextMenu() {
    const m = $("pg-ctxmenu");
    if (m) { m.hidden = true; m.replaceChildren(); }
  }

  function showMenu(x, y, items) {
    const menu = $("pg-ctxmenu");
    menu.replaceChildren();
    for (const item of items) {
      if (item.separator) { const sep = document.createElement("div"); sep.className = "pg-menu-sep"; menu.append(sep); continue; }
      const el = document.createElement("div");
      el.className = "pg-menu-item";
      el.setAttribute("role", "menuitem");
      if (item.disabled) el.setAttribute("aria-disabled", "true");
      el.innerHTML = `<i class="fa-solid ${item.icon || "fa-circle"}"></i><span>${item.label}</span>${item.key ? `<span class="pg-menu-key">${item.key}</span>` : ""}`;
      if (!item.disabled) el.addEventListener("click", () => { closeContextMenu(); item.action(); });
      menu.append(el);
    }
    menu.hidden = false;
    // Position within the viewport.
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  }

  function onTreeContextMenu(e) {
    e.preventDefault();
    const row = e.target.closest(".pg-row");
    const path = row ? row.dataset.path : "";
    if (row && !selected.has(path)) { selected = new Set([path]); lastClicked = path; renderFileExplorer(); }
    const multi = selected.size > 1;
    const isFolder = row && row.dataset.kind === "folder";
    const targetFolder = !row ? "" : isFolder ? path : parentOf(path);
    const items = [];
    if (multi) {
      items.push({ label: `Delete ${selected.size} items`, icon: "fa-trash", action: () => deletePaths([...selected]) });
      items.push({ label: "Cut", icon: "fa-scissors", action: () => setClipboard("cut", [...selected]) });
      items.push({ label: "Copy", icon: "fa-copy", action: () => setClipboard("copy", [...selected]) });
    } else if (row && isFolder) {
      items.push({ label: "New File", icon: "fa-file-circle-plus", action: () => createFileAt(path) });
      items.push({ label: "New Folder", icon: "fa-folder-plus", action: () => createFolderAt(path) });
      items.push({ separator: true });
      items.push({ label: "Rename", icon: "fa-pen", key: "F2", action: () => renameOne(path) });
      items.push({ label: "Delete", icon: "fa-trash", action: () => deletePaths([path]) });
      items.push({ separator: true });
      items.push({ label: "Cut", icon: "fa-scissors", action: () => setClipboard("cut", [path]) });
      items.push({ label: "Copy", icon: "fa-copy", action: () => setClipboard("copy", [path]) });
      items.push({ label: "Paste", icon: "fa-paste", disabled: !clipboard, action: () => pasteInto(path) });
    } else if (row) {
      items.push({ label: "Open", icon: "fa-up-right-from-square", action: () => openFile(path) });
      items.push({ separator: true });
      items.push({ label: "Rename", icon: "fa-pen", key: "F2", disabled: path === ENTRY_FILE, action: () => renameOne(path) });
      items.push({ label: "Delete", icon: "fa-trash", disabled: path === ENTRY_FILE, action: () => deletePaths([path]) });
      items.push({ separator: true });
      items.push({ label: "Cut", icon: "fa-scissors", disabled: path === ENTRY_FILE, action: () => setClipboard("cut", [path]) });
      items.push({ label: "Copy", icon: "fa-copy", action: () => setClipboard("copy", [path]) });
    } else {
      items.push({ label: "New File", icon: "fa-file-circle-plus", action: () => createFileAt("") });
      items.push({ label: "New Folder", icon: "fa-folder-plus", action: () => createFolderAt("") });
      items.push({ label: "Paste", icon: "fa-paste", disabled: !clipboard, action: () => pasteInto("") });
    }
    showMenu(e.clientX, e.clientY, items);
  }

  // ---- Drag and drop ----
  function onTreeDragStart(e) {
    const row = e.target.closest(".pg-row");
    if (!row) return;
    const path = row.dataset.path;
    if (!selected.has(path)) { selected = new Set([path]); lastClicked = path; renderFileExplorer(); }
    dragPaths = [...selected];
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragPaths.join("\n"));
  }
  function clearDropHints() {
    for (const r of $("pg-file-list").querySelectorAll('[data-drop="true"]')) r.dataset.drop = "false";
    $("pg-file-list").dataset.rootDrop = "false";
  }
  function onTreeDragOver(e) {
    if (!dragPaths.length) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropHints();
    const folderRow = e.target.closest('.pg-row[data-kind="folder"]');
    if (folderRow) folderRow.dataset.drop = "true";
    else $("pg-file-list").dataset.rootDrop = "true";
  }
  function onTreeDragLeave(e) {
    if (!e.relatedTarget || !$("pg-file-list").contains(e.relatedTarget)) clearDropHints();
  }
  function onTreeDrop(e) {
    e.preventDefault();
    clearDropHints();
    if (!dragPaths.length) return;
    const folderRow = e.target.closest('.pg-row[data-kind="folder"]');
    const target = folderRow ? folderRow.dataset.path : "";
    movePaths(dragPaths, target);
    dragPaths = [];
  }

  // ---- Import ----
  function openImportMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, [
      { label: "Import files…", icon: "fa-file-arrow-up", action: () => { $("pg-import-files").value = ""; $("pg-import-files").click(); } },
      { label: "Import folder…", icon: "fa-folder-tree", action: () => { $("pg-import-folder").value = ""; $("pg-import-folder").click(); } },
      { label: "Import .zip…", icon: "fa-file-zipper", action: () => { $("pg-import-zip").value = ""; $("pg-import-zip").click(); } },
      { label: "Import from URL…", icon: "fa-link", action: importFromUrl },
    ]);
  }

  async function importLocalFiles(fileList, parentFolder, useRelative) {
    const list = [...(fileList || [])];
    if (!list.length) return;
    let added = 0, first = null;
    for (const file of list) {
      const rel = (useRelative && file.webkitRelativePath) ? file.webkitRelativePath : file.name;
      const cleaned = cleanPath(parentFolder ? `${parentFolder}/${rel}` : rel);
      if (!cleaned) continue;
      try { files[cleaned] = await file.text(); } catch { continue; }
      ensureFolder(parentOf(cleaned));
      added++; first = first || cleaned;
    }
    if (added) {
      afterStructureChange();
      if (first) openFile(first);
      showToast(`Imported ${added} file${added === 1 ? "" : "s"}`, { icon: "file-import" });
    } else {
      showToast("Nothing imported", { icon: "triangle-exclamation" });
    }
  }

  async function importZipFile(file) {
    if (!file) return;
    try {
      const entries = await readZipEntries(await file.arrayBuffer());
      const names = Object.keys(entries);
      if (!names.length) { showToast("No text files in that .zip", { icon: "triangle-exclamation" }); return; }
      let first = null;
      for (const name of names) {
        const cleaned = cleanPath(name);
        if (!cleaned || cleaned === "index.html") continue; // skip the generated runner
        files[cleaned] = entries[name];
        ensureFolder(parentOf(cleaned));
        first = first || cleaned;
      }
      afterStructureChange();
      if (first && files[first] !== undefined) openFile(first);
      showToast(`Imported ${names.length} file${names.length === 1 ? "" : "s"} from .zip`, { icon: "file-zipper" });
    } catch (err) {
      console.error(err);
      showToast(err.message || "Couldn't read the .zip", { icon: "triangle-exclamation" });
    }
  }

  async function importFromUrl() {
    const url = window.prompt("Import a file from URL", "https://");
    if (!url) return;
    try {
      const text = await fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });
      let name = cleanPath((url.split("?")[0].split("#")[0].split("/").pop()) || "imported.aktion") || "imported.aktion";
      if (!/\.[A-Za-z0-9]+$/.test(name)) name += ".aktion";
      const path = uniquePath(name);
      files[path] = text;
      afterStructureChange();
      openFile(path);
      showToast(`Imported ${path}`, { icon: "file-import" });
    } catch (err) {
      console.error(err);
      showToast(`Couldn't fetch: ${err.message || url}`, { icon: "triangle-exclamation" });
    }
  }

  // ---- Export ----
  function openExportMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, [
      { label: "Project (.zip)", icon: "fa-file-zipper", action: exportProjectZip },
      { label: "Standalone HTML", icon: "fa-file-code", action: doDownload },
    ]);
  }

  async function exportProjectZip() {
    try {
      const linked = await linkCurrentProject();
      const theme = $("pg-target").getAttribute("theme") || "light";
      const title = `${EXAMPLES[currentExample]?.label ?? "Aktion app"} · Aktion`;
      const indexHtml = await buildIndexHtml(linked.source || files[ENTRY_FILE] || "", theme, title);
      // Files in their folder structure + empty-folder entries + a runnable index.html.
      const bundle = { ...files, "index.html": indexHtml };
      for (const dir of allFolders()) {
        if (dir && !Object.keys(files).some((f) => f.startsWith(`${dir}/`))) bundle[`${dir}/`] = "";
      }
      const blob = buildProjectZip(bundle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "aktion-project.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Project exported (.zip)", { icon: "file-zipper" });
    } catch (err) {
      console.error(err);
      showToast("Couldn't build the zip", { icon: "triangle-exclamation" });
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

  // Aktion DevTools — lazily mounted on first use, then toggled. The panel
  // attaches itself to the viewer's <aktion-app> via the global hook, so we
  // just mount it once and flip its visibility thereafter.
  let devtoolsController = null;
  let devtoolsLoading = false;
  async function toggleDevtools() {
    const btn = $("pg-devtools");
    if (devtoolsLoading) return;
    try {
      if (!devtoolsController) {
        devtoolsLoading = true;
        btn.disabled = true;
        const mod = await import(/* @vite-ignore */ DEVTOOLS_BUNDLE);
        devtoolsController = mod.mountDevtools();
        btn.disabled = false;
        devtoolsLoading = false;
        showToast("DevTools opened", { icon: "bug" });
      } else {
        devtoolsController.toggle();
      }
      applyDevtoolsUI(!devtoolsController.element.hidden);
    } catch (err) {
      devtoolsLoading = false;
      btn.disabled = false;
      // eslint-disable-next-line no-console
      console.error("[playground] failed to open DevTools", err);
      showToast("Could not load DevTools", { icon: "triangle-exclamation" });
    }
  }

  function applyDevtoolsUI(open) {
    $("pg-devtools").setAttribute("aria-pressed", open ? "true" : "false");
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
      btn.title = collapsed ? "Show file explorer" : "Hide file explorer";
    }
    lsWrite(LS.sidebarCollapsed, collapsed ? "true" : "false");
  }

  function applyInspectUI(on) {
    $("pg-inspect").setAttribute("aria-pressed", on ? "true" : "false");
    $("pg-viewer-pane").setAttribute("data-inspect", on ? "true" : "false");
    if (!on) hideInspectOverlay();
  }

  // Link the whole project (entry + every file) into one program, fetching any
  // URL imports. Shared by run, share, and standalone-HTML download so they all
  // operate on the linked app, not just the active file.
  async function linkCurrentProject() {
    syncActiveFile();
    return linkProject({ entry: ENTRY_FILE, files });
  }

  async function doShare() {
    try {
      // Share the linked (single-file) program so the recipient gets a working
      // app even when it was split across files locally.
      const linked = await linkCurrentProject();
      const code = linked.source || files[ENTRY_FILE] || "";
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

  async function doDownload() {
    try {
      // Bundle the linked program into the standalone HTML so it runs anywhere.
      const linked = await linkCurrentProject();
      const code = linked.source || files[ENTRY_FILE] || "";
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
    // Multi-file examples ship a `files` map; single-file ones ship `code`.
    const nextFiles = ex.files
      ? { ...ex.files }
      : { [ENTRY_FILE]: ex.code };
    if (nextFiles[ENTRY_FILE] === undefined) nextFiles[ENTRY_FILE] = "";

    syncActiveFile();
    const isDirty =
      files[ENTRY_FILE] !== EXAMPLES[currentExample]?.code &&
      files[ENTRY_FILE] !== nextFiles[ENTRY_FILE];
    if (isDirty && !force) {
      if (!window.confirm("Replace your current project with this example?")) {
        $("pg-example").value = currentExample;
        return;
      }
    }
    files = nextFiles;
    activeFile = ENTRY_FILE;
    freshModel();
    // Open every example file as a tab, entry first, so multi-file examples are
    // immediately explorable.
    openTabs = [ENTRY_FILE, ...Object.keys(files).filter((p) => p !== ENTRY_FILE).sort()];
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: files[ENTRY_FILE] },
    });
    currentExample = key;
    lsWrite(LS.example, key);
    persistFiles();
    renderFileExplorer();
    renderTabs();
  }

  function doRun(force) {
    scheduleViewerUpdate(true, force);
  }

  scheduleViewerUpdate = debounce(async (immediate, force) => {
    if (!editorView) return;
    if (!(force || currentRunMode === "live" || immediate)) return;
    const target = $("pg-target");
    let linked;
    try {
      linked = await linkCurrentProject();
    } catch (err) {
      console.error("[playground] link failed", err);
      return;
    }
    // Surface cross-file diagnostics (unresolved import, missing export, fetch
    // failure) alongside the active file's parse errors.
    projectDiagnostics = linked.diagnostics.map((d) => ({
      line: d.line,
      column: d.column,
      message: d.message,
    }));
    refreshStatusErrors();
    if (typeof target.mountCompiled === "function") {
      target.mountCompiled(
        defineCompiledProgram({
          __aktionCompiled: COMPILED_PROGRAM_VERSION,
          program: linked.program,
          source: linked.source,
          path: ENTRY_FILE,
        }),
      );
    } else if (typeof target.setResponse === "function") {
      // Fallback for an older bundle without mountCompiled.
      target.setResponse(linked.source);
    }
    // The inspect index gets refreshed by the MutationObserver attached in
    // `initInspect()` once the shadow DOM finishes updating.
  }, 250);

  // Active-file parse errors (from the linter / runtime) plus the last run's
  // cross-file linker diagnostics, deduped by position + message.
  function combinedErrors() {
    const seen = new Set();
    const out = [];
    for (const err of [...parseErrors, ...projectDiagnostics]) {
      const key = `${err.line}:${err.column}:${err.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(err);
    }
    return out;
  }

  refreshStatusErrors = () => {
    const btn = $("pg-status-errors");
    const text = $("pg-status-errors-text");
    const errors = combinedErrors();
    if (errors.length === 0) {
      btn.dataset.tone = "success";
      btn.querySelector("i").className = "fa-solid fa-check";
      text.textContent = "No errors";
    } else {
      btn.dataset.tone = "danger";
      btn.querySelector("i").className = "fa-solid fa-triangle-exclamation";
      text.textContent = `${errors.length} error${errors.length === 1 ? "" : "s"}`;
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

    const errors = combinedErrors();
    const total = errors.length;
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
    // example: missing `aktion` binding, structural failures, theme-level
    // diagnostics). Showing them up front prevents the "errors with no
    // editor markers" confusion.
    const sorted = errors
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
  // (covers cases where the linter hasn't run yet). The §19.1 positional
  // advisory is filtered out so the playground stays focused on real errors.
  $("pg-target").addEventListener("error", (e) => {
    if (Array.isArray(e.detail?.errors)) {
      parseErrors = e.detail.errors.filter((err) => !isPositionalAdvisory(err));
      refreshStatusErrors();
    }
  });
}
