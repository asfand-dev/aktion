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
  defaultLibrary,
  findComponent,
  chooseNamedBagIndex,
  slotForNthPositional,
  validateProgramSchema,
  // Shared, canonical language catalogs (the same single source of truth the
  // VS Code extension + language service consume). The playground reconciles
  // its editor-shaped catalogs against these at startup so a builtin /
  // namespace / member / config-key added to the runtime automatically shows
  // up in autocomplete + hover — no hand-maintained drift.
  namespaceCatalog,
  factoryResourceCatalog,
  routeMembers as runtimeRouteMembers,
  i18nResultMembers,
  universalPropCatalog,
  findBuiltinConfig,
  SAFE_HOST_GLOBALS,
  keywordDocs as runtimeKeywordDocs,
  setGlobalAccessPolicy,
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

// `dist/language.js` is the DOM-free language + tooling surface. It carries the
// two pieces of the language service the runtime bundle deliberately leaves
// out — `getDiagnostics` (parse + schema errors PLUS the soft lint warnings:
// unknown component, `$i18n` `t` shadowing) and `formatProgram` — so the
// playground gets exactly the diagnostics the VS Code extension and the LSP
// server get, rather than a hand-rolled subset. Loaded lazily on first lint so
// the initial page load still only pays for `dist/aktion.js` + CodeMirror; if
// the fetch fails the linter silently falls back to the runtime bundle's
// `parse` + `validateProgramSchema` (see `lintSource`).
const LANGUAGE_BUNDLE = new URL("../../dist/language.js", import.meta.url).href;

let languageServicePromise = null;

/** Resolve the lazily-imported language service, or `null` if it can't load. */
function loadLanguageService() {
  languageServicePromise ??= import(LANGUAGE_BUNDLE).catch((err) => {
    console.warn("[playground] language service unavailable — diagnostics will omit lint warnings", err);
    return null;
  });
  return languageServicePromise;
}

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
    code: `// Highlights: the canonical call form (positional + named args), template literals, FollowUpBlock dispatch.
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
], { gap: "lg", align: "center", padding: "xl" }))`,
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

// Named \`TodoRow\`, not \`Row\` — \`Row\` is a built-in Layout component and the
// validator rejects a custom component that shadows a library name.
function TodoRow(t) {
  return Card([Stack([
    Text(t.text),
    Button("Delete", { action: () => { $todos = $util.filter($todos, "id", "!=", t.id) }, variant: "ghost", size: "small" })
  ], { direction: "row", gap: "sm", align: "center", justify: "between" })])
}

list = $todos.map(t => TodoRow(t))
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
], { direction: "row", gap: "sm" })

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
    ], { direction: "row", gap: "sm" })
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
  ], { columns: {sm: 1, md: 2}, gap: "lg" })
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
    ], { direction: "column", gap: "lg" })
  ], { columns: {sm: 1, lg: 2}, gap: "lg" })
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
  ], { columns: {sm: 1, md: 2}, gap: "lg" }),
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
  ], { columns: {sm: 1, md: 3}, gap: "lg" }),
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
  ], { columns: {sm: 1, md: 2}, gap: "lg" }),
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
  ], { columns: {sm: 1, md: 2}, gap: "lg" })
]))`,
  },
  storageConsole: {
    label: "Storage + console globals",
    code: `// Highlights: \`$storage\` namespace (local / session / cookies), \`$console\` forwarder, named-arg method calls.
//
// Note the bare \`value: $name\`. Two-way binding hangs off an argument that IS a
// $variable; \`value: $name ?? ""\` is an expression, so the field has nothing to
// write back to — you type, $name stays null, and "Save" persists an empty
// string. Give the atom its fallback at the point of INITIALISATION instead.
$name = $storage.get("rui:demo:name") ?? ""
$themePref = $storage.session.get("rui:demo:theme") ?? "auto"
$consent = $storage.cookies.get("rui:demo:consent")

function saveName(value) {
  $storage.set("rui:demo:name", value)
  $console.log("Saved name", value)
}

function saveTheme(value) {
  $storage.session.set("rui:demo:theme", value)
  $console.info("Theme preference set to", value)
}

function acceptCookies() {
  $storage.cookies.set("rui:demo:consent", "accepted", { expires: 30, path: "/", sameSite: "Lax" })
  $consent = "accepted"
  $console.warn("Cookies accepted — will persist for 30 days")
}

function clearAll() {
  // \`remove\`, not \`clear\`: $storage.clear() empties the WHOLE origin, which here
  // would take the playground's own saved editor state with it.
  $storage.remove("rui:demo:name")
  $storage.session.remove("rui:demo:theme")
  $storage.cookies.remove("rui:demo:consent")
  $name = ""
  $themePref = "auto"
  $consent = null
  $console.error("Cleared the three demo keys.")
}

$app(Stack([
  PageHeader("Storage + console", { subtitle: "All values persist across reloads via the matching browser API." }),
  Card([
    SectionHeader("localStorage", { eyebrow: "PERSISTENT" }),
    FormControl("Display name", { field: Input("name", { placeholder: "Your name", value: $name }) }),
    Button("Save name", { action: () => { saveName($name) }, variant: "primary" })
  ]),
  Card([
    SectionHeader("sessionStorage", { eyebrow: "PER TAB" }),
    FormControl("Theme", { field: Select("theme", { items: [
      SelectItem("light", "Light"),
      SelectItem("dark",  "Dark"),
      SelectItem("auto",  "Auto")
    ], value: $themePref }) }),
    Button("Save theme", { action: () => { saveTheme($themePref) } })
  ]),
  Card([
    SectionHeader("cookies", { eyebrow: "NAMED ARGS" }),
    Text(\`Current consent: \${$consent ?? "—"}\`),
    Stack([
      Button("Accept cookies", { action: acceptCookies, variant: "primary" }),
      Button("Reset everything", { action: clearAll, variant: "ghost" })
    ], { direction: "row", gap: "sm" })
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
  ], { direction: "column", gap: "sm" })
])

content = Card([
  CardHeader("Main workspace", { subtitle: "GridItem span='3/4' fills the rest" }),
  Text("Use Grid([...], { columns: 12, gap: 'lg' }) with GridItem(child, { span: '1/4' }) for sidebar layouts.")
])

$app(Grid([
  GridItem(sidebar, { span: "1/4" }),
  GridItem(content, { span: "3/4" })
], { columns: 12, gap: "lg" }))`,
  },

  advancedUI: {
    label: "Advanced UI power tools",
    code: `// Highlights: the Advanced UI group — CommandPalette, JsonTree, DiffViewer,
// QueryBuilder, Sortable and VirtualList. These are the "power tool" widgets:
// each one replaces a few hundred lines of hand-rolled interaction code.

$paletteOpen = false
$lastCommand = "(none)"
$rules = [{ field: "status", operator: "==", value: "open" }]
$order = ["Draft the RFC", "Review with design", "Ship behind a flag", "Announce"]
$picked = "(nothing yet)"

// onReorder hands back (fromIndex, toIndex); the list itself stays yours to own.
function reorder(from, to) {
  moved = $order[from]
  rest = $order.filter((item, i) => i !== from)
  $order = [...rest.slice(0, to), moved, ...rest.slice(to)]
}

// 5,000 rows — VirtualList only ever renders the visible window.
rows = $util.range(1, 5000).map(n => ({ id: n, label: \`Row \${n}\`, score: (n * 37) % 100 }))

before = "function total(items) {\\n  let sum = 0\\n  for (const i of items) {\\n    sum += i.price\\n  }\\n  return sum\\n}"
after  = "function total(items) {\\n  return items.reduce((sum, i) => sum + i.price, 0)\\n}"

config = {
  runtime: { version: "0.6.4", strict: true },
  features: { router: "hash", i18n: ["en", "de", "fr"] },
  limits: { requests: 60, budgetMs: 2000 }
}

$app(Stack([
  PageHeader("Advanced UI", {
    subtitle: "CommandPalette · JsonTree · DiffViewer · QueryBuilder · Sortable · VirtualList",
    actions: [
      Button("Open palette", { onClick: () => { $paletteOpen = true }, variant: "primary", icon: "terminal" })
    ]
  }),
  // A modal command launcher. \`open\` is two-way: onClose is called with false.
  CommandPalette([
    { value: "new-order", label: "Create order", icon: "plus", hint: "O" },
    { value: "invite", label: "Invite teammate", icon: "user-plus" },
    { value: "export", label: "Export as CSV", icon: "file-csv" },
    { value: "theme", label: "Toggle theme", icon: "circle-half-stroke" }
  ], {
    open: $paletteOpen,
    placeholder: "Type a command…",
    shortcut: "Cmd+K",
    onSelect: (value) => { $lastCommand = value; $paletteOpen = false },
    onClose: () => { $paletteOpen = false },
    emptyLabel: "No commands match"
  }),
  Callout({ title: \`Last command: \${$lastCommand}\`, tone: "neutral", icon: "terminal", compact: true }),
  Grid([
    Card([
      CardHeader("QueryBuilder", { subtitle: "structured filters, no free-text parsing" }),
      QueryBuilder([
        { value: "status", label: "Status", type: "enum", options: ["open", "closed", "archived"] },
        { value: "total", label: "Total", type: "number" },
        { value: "customer", label: "Customer", type: "string" }
      ], {
        value: $rules,
        onChange: (next) => { $rules = next },
        maxRules: 5
      }),
      Text(\`\${$util.count($rules)} \${$util.plural($util.count($rules), "rule", "rules")}\`, { tone: "muted", variant: "small" })
    ]),
    Card([
      CardHeader("JsonTree", { subtitle: "collapsible object inspector" }),
      JsonTree(config, { expandedDepth: 2, maxHeight: 240 })
    ])
  ], { columns: { sm: 1, md: 2 }, gap: "lg" }),
  Card([
    CardHeader("DiffViewer", { subtitle: "side-by-side or unified, with line numbers" }),
    DiffViewer(before, after, {
      mode: "split",
      leftTitle: "Before",
      rightTitle: "After",
      lineNumbers: true,
      maxHeight: 260
    })
  ]),
  Grid([
    Card([
      CardHeader("Sortable", { subtitle: "drag OR arrow keys — reordering is keyboard-accessible" }),
      Sortable($order.map(t => Row([Icon("grip-vertical", { size: "sm" }), Text(t)], { gap: "sm" })), {
        onReorder: reorder,
        ariaLabel: "Task order"
      })
    ]),
    Card([
      CardHeader("VirtualList", { subtitle: "5,000 rows, ~15 in the DOM" }),
      VirtualList(rows, {
        itemHeight: 40,
        height: 260,
        renderItem: (row, index) => Row([
          Text(row.label),
          Badge(\`\${row.score}\`, { tone: row.score > 66 ? "success" : row.score > 33 ? "warning" : "neutral", size: "sm" })
        ], { gap: "sm", justify: "between" }),
        onItemClick: (row) => { $picked = row.label },
        empty: EmptyState("Nothing to show")
      }),
      Text(\`Clicked: \${$picked}\`, { tone: "muted", variant: "small" })
    ])
  ], { columns: { sm: 1, md: 2 }, gap: "lg" })
]))`,
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
  entryFile: "rui:playground:entryFile",
  mode: "rui:playground:mode",
  runMode: "rui:playground:runMode",
  theme: "rui:playground:theme",
  example: "rui:playground:example",
  inspect: "rui:playground:inspect",
  split: "rui:playground:split",
  splitV: "rui:playground:splitV",
  sidebarCollapsed: "rui:playground:sidebarCollapsed",
  // `<aktion-app>` attributes driven from the Runtime toolbar group. The access
  // policy is deliberately NOT persisted: a shared link must always open
  // sandboxed, however the reader left the toggle last time.
  strict: "rui:playground:strict",
  rtl: "rui:playground:rtl",
  showErrors: "rui:playground:showErrors",
};

/**
 * `<aktion-app>` attributes the Runtime toolbar group drives, as
 * `[localStorage key, attribute, button id]`. `rtl` is the odd one out: the
 * element's attribute is `dir="rtl"`, a value attribute rather than a boolean
 * one, so `applyRuntimeAttributes` special-cases it.
 */
const RUNTIME_FLAGS = [
  [LS.strict, "strict", "pg-strict"],
  [LS.rtl, "rtl", "pg-rtl"],
  [LS.showErrors, "showerrors", "pg-showerrors"],
];

// The default entry module of a playground project. `app.aktion` is always
// present and is where examples / shared snippets land. The file the linker
// actually links from is the mutable `entryFile` (see below), which the user
// can repoint to any `.aktion` file via the explorer context menu.
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

// ---------------------------------------------------------------------------
// Live preview iframe
//
// The preview renders inside a same-origin <iframe> so the renderer's
// responsive @media breakpoints resolve against the PREVIEW PANE width — not
// the whole browser window. (An inline <aktion-app> reads the full window, so
// a narrow split pane would still render at desktop breakpoints — the bug this
// fixes.) The iframe loads its own copy of the runtime; the parent drives the
// inner <aktion-app> (mountCompiled / theme), reaches its shadow root for
// Inspect, and bridges the DevTools global hook to the parent window so the
// parent-mounted panel still sees the app.
const RUNTIME_URL = new URL("../../dist/aktion.js", import.meta.url).href;
let previewFrame = null;
let previewApp = null; // the <aktion-app> inside the iframe (formerly #pg-target)
let _frameReadyResolve;
// Re-assignable, because the frame can be re-booted (the global-access-policy
// toggle rebuilds it). Every `await frameReady` reads this binding at call time,
// so it always waits on the CURRENT frame rather than a stale resolved promise.
// Declared before `resetFrameReady()` runs — the function assigns to it, and a
// `let x = resetFrameReady()` one-liner would touch `x` inside its own TDZ.
let frameReady;
resetFrameReady();

function resetFrameReady() {
  previewApp = null;
  frameReady = new Promise((resolve) => { _frameReadyResolve = resolve; });
  return frameReady;
}

// The live preview element the rest of the playground talks to. Null until the
// iframe runtime upgrades <aktion-app>; callers await `frameReady` or use `?.`.
const getTarget = () => previewApp;

/**
 * (Re)build the preview iframe.
 *
 * `accessPolicy` is the runtime's {@link setGlobalAccessPolicy} argument for the
 * program about to run inside it:
 *   - `"all"` — the full `globalThis` surface, `eval`/`Function` included. The
 *     right default for code the author typed themselves.
 *   - `"safe"` — the runtime's vetted allow-list (data, formatting, encoding;
 *     no code execution, DOM, network, or storage). Used automatically when the
 *     program arrived through a SHARED LINK (`?code=` / `#code=`), i.e. from
 *     whoever wrote the URL rather than from the person opening it.
 *
 * The policy is module state inside the runtime, and the preview loads its OWN
 * copy of the runtime, so it has to be set in the frame — setting it in the
 * parent would have no effect on the program. A second module script does it:
 * module scripts are deferred and run in document order, and an `import` of an
 * already-evaluated URL reuses the same instance, so this lands after the
 * element is defined and before the parent ever calls `mountCompiled`.
 */
function initPreviewFrame(accessPolicy = "all") {
  previewFrame = $("pg-frame");
  if (!previewFrame) return frameReady;
  const ready = resetFrameReady();
  // `srcdoc` (not document.write) — the latter races the iframe's initial
  // about:blank and gets clobbered. srcdoc resolves relative URLs against the
  // parent base, so the absolute RUNTIME_URL loads the same dist build.
  previewFrame.srcdoc = [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width, initial-scale=1'>",
    "<style>html,body{margin:0;padding:0;background:transparent}aktion-app{display:block;min-height:100vh}body.pg-inspecting,body.pg-inspecting *{cursor:crosshair!important}</style>",
    // Mirror the DevTools global hook to the parent so the parent-mounted panel
    // sees this app. A live accessor keeps them in sync regardless of when
    // DevTools opens. Runs before the runtime module so early reads work too.
    "<script>(function(){try{var k='__AKTION_DEVTOOLS_HOOK__';Object.defineProperty(window,k,{configurable:true,get:function(){return window.parent[k];},set:function(v){window.parent[k]=v;}});}catch(e){}})();</script>",
    "<script type='module' src='" + RUNTIME_URL + "'></script>",
    "<script type='module'>import { setGlobalAccessPolicy } from '" + RUNTIME_URL + "';"
      + "setGlobalAccessPolicy(" + JSON.stringify(accessPolicy) + ");</script>",
    "</head><body><aktion-app id='pg-target' theme='light'></aktion-app></body></html>",
  ].join("");
  const onReady = () => {
    const win = previewFrame.contentWindow;
    if (!win) return;
    win.customElements.whenDefined("aktion-app").then(() => {
      previewApp = previewFrame.contentDocument.getElementById("pg-target");
      _frameReadyResolve(previewApp);
    });
  };
  previewFrame.addEventListener("load", onReady, { once: true });
  return ready;
}

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
 *
 * DERIVED from `keywordDocs`, not hand-listed: a hand-listed copy silently lost
 * `import` and `export` when multi-file projects landed — precisely the two
 * keywords the playground's own file explorer exists to serve. Every entry that
 * has a keyword doc therefore has a hover popup too, by construction.
 *
 * Two adjustments on top of the canonical map:
 *   - `$`-sigil entries (`$emit`, `$effect`) and the reactive handles (`aktion`,
 *     `route`) are NOT keywords — they live in `SPECIAL_IDENTIFIERS`;
 *   - `KEYWORD_EXTRA_PROSE` re-attaches the hand-written Aktion-specific
 *     guidance for the handful of keywords where it says more than the generic
 *     grammar summary (`switch` and `for` both need "use `.map()` instead for
 *     value-producing iteration", which the grammar doc has no room for).
 */
const KEYWORD_EXTRA_PROSE = {
  switch:  "Statement-form `switch (value) { case \"x\": A(); break; default: B() }`. Use inside a function body — wrap and `return` to pick a value.",
  for:     "Statement-form `for (let x of xs) { … }` / `for (let i = 0; i < n; i += 1) { … }`. Use `xs.map(x => …)` for value-producing iteration.",
  default: "Wildcard arm inside `$router({...})`, or the `default` case of a `switch`.",
  return:  "Return from a `function` / `$effect` body.",
};

const LANGUAGE_KEYWORDS = [
  ...Object.entries(KEYWORD_DOCS)
    .filter(([label]) => !label.startsWith("$") && label !== "aktion" && label !== "route")
    .map(([label, doc]) => ({ label, info: KEYWORD_EXTRA_PROSE[label] || doc.summary })),
  // `cleanup` is a call the runtime injects into every `$effect` body rather
  // than a lexer keyword, so it has no `keywordDocs` entry — but authors reach
  // for it exactly where they reach for the keywords, so keep it listed here.
  { label: "cleanup", info: "Register a teardown handler inside a `$effect` body — e.g. `cleanup(() => clearInterval(id))`." },
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
    info: "Per-response theme override: a bare `$theme({ … })` statement (no binding needed) brands the response. Structured groups: `colors`, `radius`, `font`, `spacing`, `shadows`, `gradients` (→ `gradient.brand` refs), `zIndex` (layer tokens for `sx.zIndex`), `motion`, `fonts` (web-font import), `icons` (custom inline SVG), plus `name`/`direction`.",
    apply: "$theme({\n  colors: { primary: \"${1:#6366f1}\" }\n})",
    snippet: true,
  },
  {
    label: "$form",
    info: "Managed form factory: `form = $form({ values, rules, onSubmit })`. The bag exposes reactive `values`/`errors`/`touched`/`dirty`/`valid`/`submitting`/`validating` plus `field()`, `touch()`, `setField()`, `validate()`, `submit()` (alias `handleSubmit()`), `reset()`. Rules come from `$util.rules.*` — async ones (`asyncCustom`) are awaited before submit.",
    apply: "$form({\n  values: { ${1:email}: \"\" },\n  rules: { ${1:email}: [$util.rules.required(), $util.rules.email()] },\n  onSubmit: (values) => { ${2} }\n})",
    snippet: true,
  },
  {
    label: "$query",
    info: "Cached, deduplicated HTTP read: `$data = $query({ url, key?, ttl? })`. Polling via `refetchInterval`/`refetchOnFocus`/`refetchOnReconnect`; pagination via `infinite: { param, limit, mode }` (→ `.loadMore()`, `.hasMore`, `.loadingMore`); GraphQL via `gql` + `variables`.",
    apply: "$query({\n  url: \"${1:https://api.example.com/items}\",\n  key: \"${2:items}\"\n})",
    snippet: true,
  },
  {
    label: "$mutation",
    info: "Deferred write: `$save = $mutation({ url, method })` fires on `.mutate(overrides?)`. `optimistic: (vars) => { … }` applies state instantly (auto-rollback on failure); `invalidates: [keys]` refetches matching cached queries.",
    apply: "$mutation({\n  url: \"${1:https://api.example.com/items}\",\n  method: \"${2:POST}\"\n})",
    snippet: true,
  },
  {
    label: "$socket",
    info: "Reactive WebSocket: `$chat = $socket({ url, reconnect? })`. Read `.status` (\"connecting\"|\"open\"|\"closed\"), `.connected`, `.last`, `.messages`; `.send(data)` queues while connecting and flushes on open; `reconnect: true|n` retries with backoff; `.close()` stops for good.",
    apply: "$socket({ url: \"${1:wss://example.com/room}\", reconnect: true })",
    snippet: true,
  },
  {
    label: "$sse",
    info: "Reactive Server-Sent Events stream: `$feed = $sse({ url, event? })` with the same `.status`/`.connected`/`.last`/`.messages`/`.close()` surface (EventSource reconnects natively).",
    apply: "$sse({ url: \"${1:https://api.example.com/events}\" })",
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
 * inline completion list.
 *
 * These are the SUPPLEMENT to `langSpec.snippets`, not a replacement for it:
 * only bare language constructs the canonical list has no counterpart for
 * belong here. Anything that collides by name is dropped in favour of the
 * canonical template (see `completions()`), so adding a duplicate here has no
 * effect other than dead weight — the previous hand-written `router` / `action`
 * / `effect` / `ternary` / `http` entries had SUPPRESSED their canonical
 * counterparts, and the `effect` one was still teaching the legacy bare
 * `effect(` form years after the runtime moved to `$effect(`.
 */
const LANGUAGE_SNIPPETS = [
  {
    name: "function",
    description: "User-defined function (component or action) with explicit return.",
    template:
      'function ${1:Name}(${2:prop}) {\n' +
      '  return ${3:Card([CardHeader(${2:prop})])}\n' +
      '}',
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
      // Formatting / misc additions
      { name: "slugify",      apply: "slugify(${1:text})",        info: "URL-safe slug: \"Hello World\" → \"hello-world\"." },
      { name: "truncate",     apply: "truncate(${1:text}, ${2:80})", info: "Cut text to n chars with an ellipsis." },
      { name: "initials",     apply: "initials(${1:name})",       info: "Two-letter initials from a full name." },
      { name: "currency",     apply: "currency(${1:value}, \"${2:USD}\")", info: "Locale currency string." },
      { name: "percent",      apply: "percent(${1:value})",       info: "Locale percent string (0.42 → \"42%\")." },
      { name: "bytes",        apply: "bytes(${1:value})",         info: "Human-readable byte size (1536 → \"1.5 KB\")." },
      { name: "relativeTime", apply: "relativeTime(${1:date})",   info: "\"3 minutes ago\" / \"in 2 days\" via Intl." },
      { name: "copy",         apply: "copy(${1:text})",           info: "Copy to the clipboard — async; resolves true only when the write actually succeeds (`await $util.copy(x)`)." },
      { name: "sleep",        apply: "sleep(${1:300})",           info: "Awaitable pause: `await $util.sleep(ms)` (capped at 60s)." },
      { name: "uuid",         apply: "uuid()",                    info: "Random UUID v4 string." },
      { name: "debounceFn",   apply: "debounceFn(${1:fn}, ${2:250})", info: "Wrap a function so it fires `wait` ms after the LAST call." },
      { name: "throttleFn",   apply: "throttleFn(${1:fn}, ${2:250})", info: "Wrap a function to fire at most once per `wait` ms — leading edge + one trailing fire with the latest args." },
      // Computed + hooks
      { name: "derived",    apply: "derived(() => ${1:expression})", info: "Computed reactive value — recomputes from the atoms the lambda reads." },
      { name: "onError",    apply: "onError((e) => { ${1} })",       info: "Program-level error sink — fires with { error, source } when an action throws." },
      { name: "onNavigate", apply: "onNavigate(({ to, from }) => ${1:true})", info: "Navigation guard: return false to block, a path string to redirect, anything else to allow." },
      { name: "onRequest",  apply: "onRequest((req) => ({ headers: { ${1} } }))", info: "HTTP request interceptor — partial returns merge over every outgoing request." },
      { name: "onResponse", apply: "onResponse((res, retry) => ${1:res})", info: "HTTP response interceptor — replace the response or `await retry()`." },
      { name: "invalidate", apply: "invalidate([\"${1:key}\"])",     info: "Refetch every cached $query whose key contains one of the substrings." },
      // Reactive environment (listeners attach lazily on first read)
      { name: "scroll",     apply: "scroll",     info: "Reactive scroll: .x / .y / .progress (0–1) / .direction (\"up\"|\"down\")." },
      { name: "viewport",   apply: "viewport",   info: "Reactive viewport: .width / .height." },
      { name: "breakpoint", apply: "breakpoint", info: "Reactive breakpoint: .active (\"base\"|\"sm\"|\"md\"|\"lg\"|\"xl\") + boolean .sm/.md/.lg/.xl." },
      { name: "media",      apply: "media",      info: "Reactive media flags: .prefersDark / .prefersReducedMotion / .online / .pointer / .portrait." },
      { name: "mouse",      apply: "mouse",      info: "Reactive pointer position: .x / .y." },
      // URL + query-param state
      { name: "url",             apply: "url",                                    info: "Reactive URL snapshot: .path / .params / .query / .hash + .navigate(to)." },
      { name: "url.setQuery",    apply: "url.setQuery(\"${1:key}\", ${2:value})", info: "Write a query param in place (null/\"\" drops it) — shareable filter/tab state." },
      { name: "url.removeQuery", apply: "url.removeQuery(\"${1:key}\")",          info: "Drop a query param from the URL." },
      // Styling helpers
      { name: "style.cx",       apply: "style.cx(${1:\"base\"}, { ${2:active}: ${3:cond} })", info: "clsx-style class composer — strings, arrays, { name: cond } objects." },
      { name: "style.gradient", apply: "style.gradient([${1:\"#6366f1\", \"#ec4899\"}], ${2:120})", info: "Safe linear-gradient() from color stops + angle." },
      { name: "style.alpha",    apply: "style.alpha(\"${1:primary}\", ${2:0.12})", info: "color-mix transparency: token or color at 0–1 alpha." },
      { name: "style.clamp",    apply: "style.clamp(\"${1:16px}\", \"${2:2vw}\", \"${3:24px}\")", info: "Responsive clamp(min, preferred, max) size." },
      { name: "style.token",    apply: "style.token(\"${1:spacing.l}\")",          info: "Resolve a theme token path to its CSS var: \"colors.primary\" → var(--rui-color-primary)." },
      // Validators (compose per field; run with validate/validateAll or hand to $form)
      { name: "rules.required",    apply: "rules.required(${1:})",                 info: "Non-empty value." },
      { name: "rules.email",      apply: "rules.email()",                          info: "Valid email address." },
      { name: "rules.url",        apply: "rules.url()",                            info: "Valid http(s) URL." },
      { name: "rules.min",        apply: "rules.min(${1:0})",                      info: "Number ≥ n." },
      { name: "rules.max",        apply: "rules.max(${1:100})",                    info: "Number ≤ n." },
      { name: "rules.minLength",  apply: "rules.minLength(${1:3})",                info: "String length ≥ n." },
      { name: "rules.maxLength",  apply: "rules.maxLength(${1:80})",               info: "String length ≤ n." },
      { name: "rules.pattern",    apply: "rules.pattern(${1:/^[a-z]+$/})",         info: "Match a regular expression." },
      { name: "rules.oneOf",      apply: "rules.oneOf([${1:\"a\", \"b\"}])",       info: "Value is in the allowed list." },
      { name: "rules.matches",    apply: "rules.matches(${1:other})",              info: "Equals another value (password confirmation)." },
      { name: "rules.custom",     apply: "rules.custom((v) => ${1:true})",         info: "Custom sync rule — return true/null (valid), false, or an error string." },
      { name: "rules.asyncCustom", apply: "rules.asyncCustom((v) => ${1:check}(v), \"${2:Already taken}\")", info: "Async rule (Promise) — server-side checks; $form awaits it before submitting." },
      { name: "rules.validate",    apply: "rules.validate(${1:value}, [${2:validators}])", info: "Run validators — first error message or null (a Promise when an async rule is hit)." },
      { name: "rules.validateAll", apply: "rules.validateAll(${1:values}, ${2:schema})",   info: "Validate an object against { field: [validators] } → { field: message }." },
      // Device / platform
      { name: "vibrate",       apply: "vibrate(${1:10})",        info: "Haptic pulse (ms or pattern array) on supporting devices." },
      { name: "share",         apply: "share({ title: \"${1}\", url: \"${2}\" })", info: "Native share sheet (Web Share API) — resolves true on share." },
      { name: "readClipboard", apply: "readClipboard()",         info: "Read clipboard text (async, permission-gated)." },
      { name: "geolocate",     apply: "geolocate()",             info: "Resolve { lat, lng } via the Geolocation API." },
      { name: "isOnline",      apply: "isOnline()",              info: "Current navigator.onLine flag." },
      { name: "deviceType",    apply: "deviceType()",            info: "\"mobile\" | \"tablet\" | \"desktop\" heuristic." },
      { name: "worker",        apply: "worker(${1:fn}, ${2:args})", info: "Run a closure-free function in a Web Worker; resolves its return value." },
      { name: "registerServiceWorker", apply: "registerServiceWorker(\"${1:/sw.js}\")", info: "Register a service worker for PWA/offline." },
      { name: "webManifest",   apply: "webManifest({ name: \"${1:App}\" })", info: "Inject a sanitised web-app manifest (name, icons, themeColor…)." },
      { name: "nativeShell",   apply: "nativeShell()",           info: "Detect the wrapper: capacitor/cordova/tauri/electron/react-native or \"web\"." },
      { name: "isNativeApp",   apply: "isNativeApp()",           info: "True when running inside a native shell." },
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
    name: "$toast",
    signature: "$toast.<show|success|error|info|warning|dismiss|clear>(...) · $toast.items",
    description: "Imperative toast namespace. Owns the toast lifecycle (auto-dismiss + reactive list); render `$toast.items` with the Toasts/Toast components.",
    members: [
      { name: "show",    apply: "show(${1:message}, { title: \"${2}\", tone: \"${3:info}\" })", info: "Show a toast; returns its id. Options: { title?, tone?, duration? } (duration 0 keeps it sticky)." },
      { name: "success", apply: "success(${1:message})", info: "Show a toast with tone \"success\"." },
      { name: "error",   apply: "error(${1:message})",   info: "Show a toast with tone \"danger\"." },
      { name: "info",    apply: "info(${1:message})",    info: "Show a toast with tone \"info\"." },
      { name: "warning", apply: "warning(${1:message})", info: "Show a toast with tone \"warning\"." },
      { name: "dismiss", apply: "dismiss(${1:id})",      info: "Remove a single toast by id." },
      { name: "clear",   apply: "clear()",               info: "Remove every toast." },
      { name: "items",   apply: "items",                 info: "Reactive list of live toasts (newest last). Treat as read-only." },
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
    { name: "gql",         type: "string", required: false, description: "GraphQL query — POSTs { query, variables }; `.data` is the unwrapped GraphQL data." },
    { name: "variables",   type: "object", required: false, description: "GraphQL variables paired with `gql`." },
  ],
};

/**
 * Synthetic config specs for the remaining config-taking builtins so the
 * editor surfaces every accepted config-object key (completion + value enums),
 * hover, and signature help inside `$query({…})`, `$mutation({…})`,
 * `$socket({…})`, `$sse({…})`, `$form({…})`, `$store({…})`, `$theme({…})`,
 * and `$i18n({…})`. `$router({…})` is intentionally omitted — its keys are
 * arbitrary route patterns, not a fixed config object. Mirror the canonical
 * `findBuiltinConfig` catalog in `src/language/namespaces.ts`.
 */
const QUERY_CONFIG_SPEC = {
  name: "$query",
  signature: "$query({ url, key?, ttl?, refetchInterval?, infinite?, ... })",
  description: "Cached, deduplicated HTTP read. Returns a resource bag with polling + pagination extras.",
  params: [
    ...HTTP_CONFIG_SPEC.params,
    { name: "key",                type: "string",  required: false, description: "Cache key — identical keys share one in-flight request + cached bag." },
    { name: "ttl",                type: "number",  required: false, description: "Milliseconds before cached data is stale and auto-refetched." },
    { name: "refetchInterval",    type: "number",  required: false, description: "Poll interval in ms (live dashboards)." },
    { name: "refetchOnFocus",     type: "boolean", required: false, description: "Refetch when the tab regains focus." },
    { name: "refetchOnReconnect", type: "boolean", required: false, description: "Refetch when the network reconnects." },
    { name: "infinite",           type: "object",  required: false, description: "Pagination config: { param?, start?, limit?, mode?, select? } → .loadMore()/.hasMore." },
  ],
};

const MUTATION_CONFIG_SPEC = {
  name: "$mutation",
  signature: "$mutation({ url, method?, body?, optimistic?, invalidates?, ... })",
  description: "Deferred write fired on `.mutate(overrides?)`. Supports optimistic updates + cache invalidation.",
  params: [
    { name: "url",         type: "string", required: true,  description: "Absolute request URL." },
    { name: "method",      type: "enum",   required: false, enumValues: ["POST", "PUT", "PATCH", "DELETE"], description: "HTTP method. Defaults to POST." },
    { name: "body",        type: "object", required: false, description: "Default body; shallow-merged with `.mutate(overrides)`." },
    { name: "headers",     type: "object", required: false, description: "Request headers as a plain object." },
    { name: "query",       type: "object", required: false, description: "Object serialised into the URL querystring." },
    { name: "optimistic",  type: "function", required: false, description: "Runs synchronously before the request; auto-rolled-back on failure." },
    { name: "invalidates", type: "array",  required: false, description: "Refetch every cached $query whose key contains a listed substring on success." },
    { name: "gql",         type: "string", required: false, description: "GraphQL mutation document." },
    { name: "variables",   type: "object", required: false, description: "GraphQL variables paired with `gql`." },
  ],
};

const SOCKET_CONFIG_SPEC = {
  name: "$socket",
  signature: "$socket({ url, protocols?, bufferSize?, onMessage?, reconnect? })",
  description: "Reactive WebSocket bag (`.status`, `.messages`, `.send()`, `.close()`).",
  params: [
    { name: "url",        type: "string",  required: true,  description: "WebSocket URL (ws:// or wss://)." },
    { name: "protocols",  type: "string",  required: false, description: "Optional sub-protocol(s)." },
    { name: "bufferSize", type: "number",  required: false, description: "Max buffered messages kept in `.messages`." },
    { name: "onMessage",  type: "function", required: false, description: "Callback fired for each received message." },
    { name: "reconnect",  type: "boolean", required: false, description: "Retry dropped connections (true, or a max-attempt count) with backoff." },
  ],
};

const SSE_CONFIG_SPEC = {
  name: "$sse",
  signature: "$sse({ url, event?, withCredentials?, bufferSize? })",
  description: "Reactive Server-Sent-Events bag (`.messages`, `.data`, `.close()`).",
  params: [
    { name: "url",             type: "string",  required: true,  description: "EventSource URL." },
    { name: "event",           type: "string",  required: false, description: "Named event to listen for (defaults to message)." },
    { name: "withCredentials", type: "boolean", required: false, description: "Send credentials with the EventSource request." },
    { name: "bufferSize",      type: "number",  required: false, description: "Max buffered events kept in `.messages`." },
  ],
};

const FORM_CONFIG_SPEC = {
  name: "$form",
  signature: "$form({ values, rules?, onSubmit? })",
  description: "Managed-form engine. Returns a bag with field state, validation, and submit handling.",
  params: [
    { name: "values",   type: "object",   required: true,  description: "Initial field values — the clean snapshot." },
    { name: "rules",    type: "object",   required: false, description: "Per-field validator arrays: { field: [$util.rules.required(), …] }." },
    { name: "onSubmit", type: "function", required: false, description: "Called with the values once validation passes." },
  ],
};

const STORE_CONFIG_SPEC = {
  name: "$store",
  signature: "$store({ ...state, ...methods, persist?, history? })",
  description: "Global store. Your own state + methods, plus optional persistence and undo/redo.",
  params: [
    { name: "persist",   type: "string", required: false, description: "Mirror the store's data to localStorage under this key (hydrates on first render)." },
    { name: "persistIn", type: "enum",   required: false, enumValues: ["local", "session"], description: "Storage backend for `persist` (defaults to local)." },
    { name: "history",   type: "boolean", required: false, description: "Enable undo()/redo()/clearHistory() + reactive canUndo/canRedo (number = depth)." },
  ],
};

const THEME_CONFIG_SPEC = {
  name: "$theme",
  signature: "$theme({ name?, colors?, radius?, font?, motion?, ... })",
  description: "Define / extend the active theme. Token groups flow into the CSS variable surface.",
  params: [
    { name: "name",      type: "string", required: false, description: 'Selects a built-in base theme ("dark", "modern", …).' },
    { name: "direction", type: "enum",   required: false, enumValues: ["ltr", "rtl"], description: "Reading direction (metadata)." },
    { name: "colors",    type: "object", required: false, description: "CSS color tokens: bg, surface, border, text, primary, accent, success, warning, danger, info, …." },
    { name: "radius",    type: "object", required: false, description: "Border-radius tokens: xs, sm, md, lg, pill, button, input." },
    { name: "font",      type: "object", required: false, description: "Font tokens: family, familyHeading, familyMono, sizeBase, weightBody, …." },
    { name: "spacing",   type: "object", required: false, description: "Spacing scale tokens." },
    { name: "shadows",   type: "object", required: false, description: "Box-shadow tokens." },
    { name: "gradients", type: "object", required: false, description: "Gradient color-stop arrays — referenced as gradient.<name>." },
    { name: "zIndex",    type: "object", required: false, description: "Layer tokens (modal, toast, …) → sx.zIndex / --rui-z-*." },
    { name: "motion",    type: "object", required: false, description: "Motion tokens: { fast, base, slow, ease } → --rui-motion-*." },
    { name: "fonts",     type: "object", required: false, description: 'Web-font import: { import: ["Inter:400,700"] }.' },
    { name: "icons",     type: "object", required: false, description: "Custom inline-SVG icons by name, usable anywhere an icon name is." },
  ],
};

const I18N_CONFIG_SPEC = {
  name: "$i18n",
  signature: "$i18n({ defaultLanguage, currentLanguage?, translations })",
  description: "Translation engine. Returns `.t(key, vars?)` plus reactive language state.",
  params: [
    { name: "defaultLanguage", type: "string", required: true,  description: "Fallback language when a key is missing for the current language." },
    { name: "currentLanguage", type: "string", required: false, description: "Active language — drive from a reactive atom for live switching." },
    { name: "translations",    type: "object", required: true,  description: '{ key: { lang: "text {name}" } }. Supports ICU plural/select.' },
  ],
};

/**
 * Config-taking builtin name → its synthetic config spec. Drives config-object
 * key completion, hover, and signature help inside `$builtin({ … })`.
 */
const BUILTIN_CONFIG_SPECS = {
  $http: HTTP_CONFIG_SPEC,
  $query: QUERY_CONFIG_SPEC,
  $mutation: MUTATION_CONFIG_SPEC,
  $socket: SOCKET_CONFIG_SPEC,
  $sse: SSE_CONFIG_SPEC,
  $form: FORM_CONFIG_SPEC,
  $store: STORE_CONFIG_SPEC,
  $theme: THEME_CONFIG_SPEC,
  $i18n: I18N_CONFIG_SPEC,
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

/** `$query({...})` bag — HTTP resource + pagination extras (infinite mode). */
const QUERY_RESOURCE_MEMBERS = [
  ...HTTP_RESOURCE_MEMBERS,
  { name: "loadMore",    apply: "loadMore()",  info: "Fetch the next page (infinite mode)." },
  { name: "hasMore",     apply: "hasMore",     info: "`true` while more pages are available (infinite mode)." },
  { name: "loadingMore", apply: "loadingMore", info: "`true` while a `loadMore()` page is in flight." },
  { name: "pages",       apply: "pages",       info: "Raw page bodies loaded so far (infinite mode); `.data` is the flattened items." },
];

/** `$mutation({...})` bag — fires on `.mutate()`. */
const MUTATION_RESOURCE_MEMBERS = [
  { name: "mutate",  apply: "mutate(${1:{ body: payload }})", snippet: true, info: "Fire the request; optional overrides shallow-merge over the config. With `optimistic` the state applies instantly and rolls back on failure." },
  { name: "data",    apply: "data",    info: "Response body of the last successful mutation." },
  { name: "error",   apply: "error",   info: "`null` on success; error details on failure." },
  { name: "loading", apply: "loading", info: "`true` while the mutation request is in flight." },
  { name: "status",  apply: "status",  info: "HTTP status code of the last response." },
  { name: "onDone",  apply: "onDone = () => {\n  ${1}\n}", snippet: true, info: "Settable callback fired when the mutation settles." },
];

/** `$socket({...})` bag — reactive WebSocket (VI.3). */
const SOCKET_RESOURCE_MEMBERS = [
  { name: "status",    apply: "status",    info: "Connection lifecycle: \"connecting\" | \"open\" | \"closed\"." },
  { name: "connected", apply: "connected", info: "`true` while status is \"open\"." },
  { name: "last",      apply: "last",      info: "Most recent message (JSON auto-parsed), or null." },
  { name: "messages",  apply: "messages",  info: "Buffered messages, newest last (capped to bufferSize)." },
  { name: "attempts",  apply: "attempts",  info: "Reconnect attempts in the current streak (resets on success)." },
  { name: "error",     apply: "error",     info: "Last socket error event, if any." },
  { name: "send",      apply: "send(${1:data})", snippet: true, info: "Send a message (objects JSON-stringified). Queues while connecting; flushes on open." },
  { name: "close",     apply: "close()",   info: "Close for good — disables auto-reconnect." },
];

/** `$sse({...})` bag — reactive Server-Sent Events stream. */
const SSE_RESOURCE_MEMBERS = [
  { name: "status",    apply: "status",    info: "\"connecting\" | \"open\" | \"closed\" (EventSource retries natively)." },
  { name: "connected", apply: "connected", info: "`true` while the stream is open." },
  { name: "last",      apply: "last",      info: "Most recent event payload (JSON auto-parsed)." },
  { name: "messages",  apply: "messages",  info: "Buffered events, newest last (capped to bufferSize)." },
  { name: "error",     apply: "error",     info: "Last stream error, if any." },
  { name: "close",     apply: "close()",   info: "Close the stream." },
];

/** `$form({...})` bag — the managed form engine (V.1). */
const FORM_RESOURCE_MEMBERS = [
  { name: "values",     apply: "values",     info: "Reactive field values — two-way bind with `Input(\"email\", { value: form.values.email })`." },
  { name: "errors",     apply: "errors",     info: "Per-field error messages (set after validate/touch/submit)." },
  { name: "touched",    apply: "touched",    info: "Per-field booleans — true once the user has interacted." },
  { name: "dirty",      apply: "dirty",      info: "`true` once any value differs from the clean snapshot; clears on reset() or when values return to clean." },
  { name: "valid",      apply: "valid",      info: "`true` when the last validation pass found no errors." },
  { name: "submitting", apply: "submitting", info: "`true` from submit() until an async onSubmit settles." },
  { name: "validating", apply: "validating", info: "`true` while async rules (`$util.rules.asyncCustom`) are in flight." },
  { name: "field",      apply: "field(\"${1:name}\")", snippet: true, info: "Controlled prop bag: { value, error, name, onChange, onBlur } — spread onto an input." },
  { name: "touch",      apply: "touch(\"${1:name}\")", snippet: true, info: "Mark a field touched + validate it (wire to `onBlur`)." },
  { name: "setField",   apply: "setField(\"${1:name}\", ${2:value})", snippet: true, info: "Set one field value (clears its error)." },
  { name: "setValues",  apply: "setValues({ ${1} })", snippet: true, info: "Merge several field values at once." },
  { name: "validate",   apply: "validate()",   info: "Validate every field → boolean (a Promise when async rules exist)." },
  { name: "validateField", apply: "validateField(\"${1:name}\")", snippet: true, info: "Validate one field → message | null (Promise for async rules)." },
  { name: "submit",     apply: "submit()",     info: "Touch all → validate (awaiting async rules) → onSubmit(values) when valid. Alias: handleSubmit()." },
  { name: "handleSubmit", apply: "handleSubmit()", info: "Alias of submit()." },
  { name: "reset",      apply: "reset()",      info: "Restore initial values; clears errors/touched/dirty." },
];

/** `$store({...})` handles — built-in methods (user fields/methods add to these). */
const STORE_RESOURCE_MEMBERS = [
  { name: "undo",         apply: "undo()",       info: "Undo the last change (`history: true|depth` stores)." },
  { name: "redo",         apply: "redo()",       info: "Redo the last undone change." },
  { name: "canUndo",      apply: "canUndo",      info: "Reactive — `true` when an undo step is available." },
  { name: "canRedo",      apply: "canRedo",      info: "Reactive — `true` when a redo step is available." },
  { name: "clearHistory", apply: "clearHistory()", info: "Drop the undo/redo stacks." },
];

/**
 * Factory primitive → the member list its returned bag completes with.
 * `scanFactoryResources` maps every `name = $factory(` / `$name = $factory(`
 * assignment to one of these tables.
 */
const FACTORY_RESOURCE_MEMBERS = {
  http: HTTP_RESOURCE_MEMBERS,
  query: QUERY_RESOURCE_MEMBERS,
  mutation: MUTATION_RESOURCE_MEMBERS,
  socket: SOCKET_RESOURCE_MEMBERS,
  sse: SSE_RESOURCE_MEMBERS,
  form: FORM_RESOURCE_MEMBERS,
  store: STORE_RESOURCE_MEMBERS,
};

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
 * not listed here still works when typed.
 *
 * The curated entries below exist for their ergonomic snippet `apply`; the
 * reconciliation pass then appends every name in the runtime's own
 * `SAFE_HOST_GLOBALS` allow-list that isn't already covered (see step 5), so
 * this is no longer a hand-maintained-sync contract with
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

/* -------------------------------------------------------------------------
 * Reconcile the editor catalogs above with the runtime's CANONICAL catalogs.
 *
 * The lists above are hand-tuned for ergonomics (nice snippet `apply`
 * templates). This pass MERGES IN everything the runtime exposes that the
 * curated lists are missing — new `$`-namespaces (e.g. `$dom`), new namespace
 * members (`$util.merge`, `$util.chunk`, …), factory resource bags
 * (e.g. `$script`), config-object keys (e.g. `$head`, `$script`), and `route`
 * handle members — deriving a reasonable snippet from each entry's signature.
 *
 * The split of ownership is deliberate and is what makes this drift-proof:
 *   - the PLAYGROUND owns `apply` (the CodeMirror snippet template — the
 *     ergonomic value a generic signature can't produce), and
 *   - the RUNTIME owns `info` / `description` / `required` (the prose and the
 *     flags). Those are OVERWRITTEN from the canonical entry on every load, not
 *     merely added when absent.
 * An earlier additive-by-name-only version let a curated description that had
 * since become WRONG (`$util.filter` advertising an `in` comparator that does
 * not exist, `$util.initials` documented as two-letter-only, `$util.geolocate`
 * documented as taking no arguments) survive indefinitely, because the name was
 * already present. Overwriting kills that whole failure class permanently.
 *
 * Sources: `namespaceCatalog` / `factoryResourceCatalog` / `routeMembers` /
 * `i18nResultMembers` / `findBuiltinConfig` in `src/language/namespaces.ts`,
 * `builtinCatalog` in `src/language/builtins.ts`.
 * ---------------------------------------------------------------------- */

/** Turn a signature skeleton ("format(value, mode?)" / "scroll") into a CodeMirror snippet apply. */
function signatureToApply(signature, fallbackName) {
  if (typeof signature !== "string") return fallbackName;
  const open = signature.indexOf("(");
  if (open < 0) return signature || fallbackName; // property — bare name
  const close = signature.lastIndexOf(")");
  const head = signature.slice(0, open);
  const inner = close > open ? signature.slice(open + 1, close) : "";
  const params = inner.split(",").map((p) => p.trim()).filter(Boolean);
  if (params.length === 0) return `${head}()`;
  const stops = params.map((p, i) => {
    const clean = p.replace(/^\.\.\./, "").replace(/[?:].*$/, "").trim() || `arg${i + 1}`;
    return `\${${i + 1}:${clean}}`;
  });
  return `${head}(${stops.join(", ")})`;
}

/** Compact "$ns.<a|b|c|…>(...)" header line for a namespace hover popup. */
function namespaceSignature(ns) {
  const names = ns.members
    .filter((m) => m.kind !== "namespace")
    .slice(0, 6)
    .map((m) => m.name.split(".").pop());
  return `${ns.sigil}.<${names.join("|")}|…>(...)`;
}

/** Map a runtime ConfigKey.type string onto the playground's { type, enumValues } shape. */
function normalizeConfigType(rawType) {
  if (typeof rawType !== "string") return { type: "object" };
  if (rawType.startsWith("enum:")) {
    const enumValues = (rawType.match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1));
    return { type: "enum", enumValues };
  }
  if (rawType.includes("=>")) return { type: "function" };
  if (rawType.includes("[]")) return { type: "array" };
  if (rawType === "number") return { type: "number" };
  if (rawType === "boolean" || rawType.startsWith("boolean")) return { type: "boolean" };
  if (rawType === "string") return { type: "string" };
  return { type: "object" };
}

/**
 * Merge one canonical member list into a curated one: append what's missing,
 * and refresh the prose of what's already there. The curated `apply` survives.
 */
function reconcileMembers(curated, canonical) {
  const byName = new Map(curated.map((m) => [m.name, m]));
  for (const m of canonical) {
    if (m.kind === "namespace") continue;
    const existing = byName.get(m.name);
    if (existing) {
      if (m.summary) existing.info = m.summary; // runtime owns the prose
      continue;
    }
    const added = { name: m.name, apply: signatureToApply(m.signature, m.name), info: m.summary };
    curated.push(added);
    byName.set(m.name, added);
  }
  return curated;
}

// 1. `$`-namespaces ($util / $storage / $console / $toast / $dom): add the
//    whole namespace if missing, then merge members + refresh their prose.
for (const ns of namespaceCatalog) {
  let pgNs = GLOBAL_NAMESPACES.find((n) => n.name === ns.sigil);
  if (!pgNs) {
    pgNs = { name: ns.sigil, signature: namespaceSignature(ns), description: ns.summary, members: [] };
    GLOBAL_NAMESPACES.push(pgNs);
  } else if (ns.summary) {
    pgNs.description = ns.summary;
  }
  reconcileMembers(pgNs.members, ns.members);
}

// 2. Factory resource bags ($http / $query / $mutation / $socket / $sse /
//    $form / $store / $script): add missing bags + members, refresh prose.
for (const f of factoryResourceCatalog) {
  let bag = FACTORY_RESOURCE_MEMBERS[f.factory];
  if (!bag) { bag = []; FACTORY_RESOURCE_MEMBERS[f.factory] = bag; }
  reconcileMembers(bag, f.members);
}

// 2b. `$i18n` is the one config-taking builtin whose result bag is DESTRUCTURED
//     (`const { t } = $i18n({…})`) rather than bound whole, so it never appears
//     in `factoryResourceCatalog`. Register it by hand from the canonical
//     `i18nResultMembers` so `t.`/`setCurrentLanguage` still complete — see
//     `scanFactoryResources`, which recognises the destructuring form.
FACTORY_RESOURCE_MEMBERS.i18n = reconcileMembers(
  FACTORY_RESOURCE_MEMBERS.i18n ?? [],
  i18nResultMembers,
);

// 3. The reserved reactive `route` handle: merge members + refresh prose.
reconcileMembers(ROUTE_MEMBERS, runtimeRouteMembers);

// 4. Config-taking builtins ($http / $query / … / $script / $head / $theme /
//    $i18n): add whole specs (e.g. $script, $head) + any missing config keys.
for (const b of langSpec.builtins) {
  const keys = findBuiltinConfig(b.name);
  if (!keys) continue;
  let spec = BUILTIN_CONFIG_SPECS[b.sigil];
  if (!spec) {
    spec = { name: b.sigil, signature: b.signature, description: b.summary, params: [] };
    BUILTIN_CONFIG_SPECS[b.sigil] = spec;
  }
  const byName = new Map(spec.params.map((p) => [p.name, p]));
  for (const k of keys) {
    const norm = normalizeConfigType(k.type);
    const existing = byName.get(k.name);
    if (existing) {
      if (k.summary) existing.description = k.summary;
      // `required` only ever gets promoted here: the canonical ConfigKey list
      // is still filling in its flags, so a curated `required: true` must not
      // be demoted by a canonical entry that simply hasn't declared one yet.
      if (k.required) existing.required = true;
      continue;
    }
    const param = { name: k.name, type: norm.type, required: Boolean(k.required), description: k.summary };
    if (norm.enumValues) param.enumValues = norm.enumValues;
    spec.params.push(param);
    byName.set(param.name, param);
  }
}

// 5. Vetted host globals. `SAFE_HOST_GLOBALS` is the allow-list the runtime
//    itself enforces under `setGlobalAccessPolicy("safe")`, so it is the
//    authoritative answer to "which JS globals is a program meant to reach?".
//    Appending it here surfaces the whole family the curated list never
//    mentioned — TextEncoder/TextDecoder, Blob/File/FormData/Headers, Symbol,
//    WeakMap/WeakSet, the TypedArrays, Error/TypeError/RangeError/SyntaxError,
//    ArrayBuffer/DataView.
{
  const have = new Set([
    ...CALLABLE_GLOBALS.map((g) => g.label),
    ...GLOBAL_NAMESPACES.map((n) => n.name),
  ]);
  for (const name of SAFE_HOST_GLOBALS) {
    if (have.has(name)) continue;
    CALLABLE_GLOBALS.push({ label: name, detail: "global", apply: name });
  }
}

// 6. Reserved identifiers / Aktion globals: adopt the canonical SIGNATURE from
//    `builtinCatalog` (these entries carried none, so hovering `$form` or
//    `$router` showed prose with no call shape) and fall back to the canonical
//    summary when there is no curated prose at all. The curated `info` is kept
//    where it exists: it is deliberately longer than a one-line summary — it
//    enumerates each factory's whole result bag — and the snippet `apply` is
//    hand-tuned for CodeMirror.
for (const ident of SPECIAL_IDENTIFIERS) {
  const builtin = langSpec.builtins.find((b) => b.sigil === ident.label);
  if (!builtin) continue;
  if (builtin.signature) ident.signature = builtin.signature;
  if (!ident.info && builtin.summary) ident.info = builtin.summary;
}

// Labels already surfaced by the curated lists — used so the builtin sweep in
// `completions()` only ADDS the `$`-builtins those lists don't already cover
// ($state, $memo, $ref, $reducer, $id, $optimistic, $head, $script).
const CURATED_BUILTIN_LABELS = new Set([
  ...SPECIAL_IDENTIFIERS.map((s) => s.label),
  ...CALLABLE_GLOBALS.map((g) => g.label),
  ...GLOBAL_NAMESPACES.map((n) => n.name),
]);

/* -------------------------------------------------------------------------
 * Universal props.
 *
 * `sx`, `animate`, `id`, `aria`, `data`, … are accepted by EVERY component, but
 * none of the catalog entries declares them — the validator allows them
 * through a separate allow-list, so anything derived from the component catalog
 * (completion, hover, the status-bar arg pill) was blind to them. That made the
 * two channels an author is MOST likely to reach for the only two that never
 * completed. `universalPropCatalog` is the canonical list; nothing here
 * hand-writes the names.
 * ---------------------------------------------------------------------- */

const UNIVERSAL_PARAMS = universalPropCatalog.map((p) => ({ ...p, universal: true }));
const universalParamCache = new WeakMap();

/**
 * A component spec's own params PLUS the universal ones it doesn't already
 * declare (a component that declares its own `data`/`style`/`id` wins, and
 * `dataAttrs` is the alternate channel for exactly that case).
 *
 * Only the named-arg COMPLETION paths use this. Signature help, the hover popup
 * and `makeInfoPopup` deliberately keep the component's own params: 13 extra
 * universal rows on every single component would bury the actual API, and the
 * value here is discoverability while typing a key, not documentation volume.
 */
function paramsWithUniversal(spec) {
  if (!spec || !Array.isArray(spec.params)) return spec?.params ?? [];
  let merged = universalParamCache.get(spec);
  if (!merged) {
    const own = new Set(spec.params.map((p) => p.name));
    merged = [...spec.params, ...UNIVERSAL_PARAMS.filter((p) => !own.has(p.name))];
    universalParamCache.set(spec, merged);
  }
  return merged;
}

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
    // `return`, `switch`, `try`, …).
    keyword: tags.controlKeyword,
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
    // Straight from the canonical tokenizer (comment tokens, close-brackets,
    // indentOnInput) rather than a hand-written copy that drifts.
    languageData: baseTokenizer.languageData,
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
  //
  // Several helpers below (`readCurrentArg`, `collectUsedNamedArgs`,
  // `looksClosed`, `enclosingObjectOpen`, `scanCallArgShapes`,
  // `findEnclosingCall`) each run a small string / comment / bracket-depth state
  // machine over the document. They deliberately recognise ONLY the comment
  // forms Aktion has — `getLanguageSpec().grammar.comments` is
  // `{ line: "//", blockStart: "/*", blockEnd: "*/" }`. They used to also treat
  // `#` as a line comment, which Aktion does not have: a single bare `#` outside
  // a string silently killed completion, signature help and hover for the rest
  // of the line. Do not re-add it.

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
   * Ranking for a named-arg completion: required props first, then the
   * component's own optional props, then the universal channels last. Universal
   * props apply to everything, so surfacing them above a component's own API
   * would be actively unhelpful — they are here for discoverability, not
   * prominence.
   */
  function namedArgBoost(param) {
    if (param.universal) return 10;
    return param.required ? 50 : 30;
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
        const name = document.createElement("code");
        name.textContent = `${p.name}${opt}`;
        const type = document.createElement("span");
        type.style.color = "var(--doc-text-muted)";
        type.textContent = p.type;
        li.append(name, document.createTextNode(": "), type);
        if (p.description) li.append(document.createTextNode(` — ${p.description}`));
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
    const word = ctx.matchBefore(/[\w$_]*/);
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
      // A config-taking builtin (`$http`, `$query`, `$theme`, …) exposes its
      // synthetic config spec when the cursor is inside the `{ … }`; every
      // other call resolves to a library component by name.
      const spec = (inObject && BUILTIN_CONFIG_SPECS[call.name])
        ? BUILTIN_CONFIG_SPECS[call.name]
        : langSpec.componentsByName[call.name];

      if (spec) {
        const { argStart, argText } = readCurrentArg(text, call, pos, argBase);

        // §19 binding context — shared by the cases below. `runtimeSpec`
        // carries the prop metadata (enum, positional flag, aliases) the
        // flexible-call helpers need; `scan` mirrors the runtime's view of
        // the arguments typed so far.
        const runtimeSpec = runtimeSpecFor(call.name);
        const scan = runtimeSpec ? scanCallArgShapes(text, call, pos) : null;
        const bagIdx = runtimeSpec ? chooseNamedBagIndex(scan.shapes, runtimeSpec) : -1;
        // An object argument that binds POSITIONALLY (payload for an
        // object-typed slot) takes data keys, not prop names — suppress the
        // named-arg machinery inside it and fall through to the general list.
        const inPayloadObject = Boolean(
          runtimeSpec && inObject && scan.activeObject && scan.activeObject.argIndex !== bagIdx,
        );

        // CASE 0 (§19 all-positional): cursor in a BARE positional slot —
        // when the slot the argument will bind to carries an enum, offer
        // its values. Inside an open string the quotes are already typed.
        if (!inObject && runtimeSpec && !scan.activeObject && bagIdx !== call.argIndex) {
          let slotIndex = call.argIndex;
          if (bagIdx >= 0 && bagIdx < call.argIndex) slotIndex -= 1;
          const slot = slotForNthPositional(runtimeSpec, slotIndex);
          if (slot && slot.enum && slot.enum.length > 0) {
            const openString = argText.match(/^\s*(["'])([\w-]*)$/);
            if (openString) {
              return {
                from: pos - openString[2].length,
                options: slot.enum.map((v) => ({
                  label: v,
                  type: "constant",
                  detail: `${slot.name} (${call.name})`,
                })),
              };
            }
            if (/^\s*$/.test(argText)) {
              const named = collectUsedNamedArgs(text, call, argBase);
              const remainingParams = paramsWithUniversal(spec).filter((p) => !named.has(p.name));
              return {
                from: word.from,
                options: [
                  ...slot.enum.map((v) => ({
                    label: `"${v}"`,
                    type: "constant",
                    detail: `${slot.name} (${call.name})`,
                    boost: 55,
                  })),
                  ...remainingParams.map((p) => ({
                    label: `{ ${p.name}: … }`,
                    type: "property",
                    detail: p.type + (p.required ? "" : " (optional)"),
                    boost: namedArgBoost(p),
                    info: () => makeParamInfo(p),
                    apply: applyNamedArg(p, false),
                  })),
                ],
                validFor: /[\w"']*/,
              };
            }
          }
        }

        // CASE 1: cursor sits in a named-arg VALUE position
        //         (`Button("Save", variant: <here>)`). Surface the enum
        //         values inline so the user can tab through them.
        const valueMatch = inPayloadObject ? null : argText.match(/^\s*([A-Za-z_]\w*)\s*:\s*(.*)$/s);
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
        const couldBeNamedArgName = !inPayloadObject && /^\s*[A-Za-z_]?[\w]*$/.test(argText);
        const namedArgParams = paramsWithUniversal(spec);
        if (couldBeNamedArgName && namedArgParams.length > 0) {
          const used = collectUsedNamedArgs(text, call, argBase);
          const remaining = namedArgParams.filter((p) => !used.has(p.name));
          if (remaining.length > 0) {
            const options = remaining.map((p) => ({
              label: inObject ? `${p.name}:` : `{ ${p.name}: … }`,
              type: "property",
              detail: p.universal ? `${p.type} (universal)` : p.type + (p.required ? "" : " (optional)"),
              boost: namedArgBoost(p),
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
    const sigilOk = (label) => !wordText.startsWith("$") || label.startsWith("$");

    // Components (with snippet-aware apply). Names are always bare, so they
    // drop out as soon as the user types a `$`.
    //
    // Nine canonical snippet names COLLIDE with component names (Card, Row,
    // Center, Hero, PageHeader, Stats, KanbanBoard, FollowUpBlock, Form), and
    // borrowing the snippet as the component's insert template is wrong in two
    // distinct ways, so `snippetSuitsComponent` gates it:
    //   - `Form` isn't a component snippet at all — its template is a `$form`
    //     state binding, so accepting the Form COMPONENT completion used to
    //     insert `form = $form({ … })`;
    //   - the other eight are assignment-shaped (`card1 = Card([…])`), which is
    //     a syntax error the moment the cursor is nested inside an array
    //     literal: `Stack([ Ca|` completed to `Stack([ card1 = Card([…])`.
    // The assignment-shaped templates stay reachable through the separate
    // `Name…` snippet list below, where they are always at statement start.
    const atStatementStart = /^\s*$/.test(text.slice(ctx.state.doc.lineAt(word.from).from, word.from));
    for (const c of langSpec.components) {
      if (!sigilOk(c.name)) continue;
      const snippet = langSpec.snippets.find((s) => s.name === c.name);
      const apply = snippetSuitsComponent(snippet, atStatementStart)
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

    // Every remaining runtime `$`-builtin the curated lists above don't already
    // cover — hooks ($state, $memo, $ref, $reducer, $id), $optimistic, and the
    // app/data builtins $head / $script — so typing `$` discovers them all.
    for (const b of langSpec.builtins) {
      if (CURATED_BUILTIN_LABELS.has(b.sigil) || !sigilOk(b.sigil)) continue;
      options.push({
        label: b.sigil,
        type: b.namespace ? "namespace" : "function",
        detail: b.category,
        info: b.summary,
        apply: b.namespace ? `${b.sigil}.` : `${b.sigil}(`,
      });
    }

    // Multi-line snippets, canonical FIRST. `langSpec.snippets` is generated
    // from the runtime, so where the two collide by name the canonical one is
    // by definition the current spelling — the playground's hand-written copies
    // are what rot. (Inverting this is what un-suppressed the canonical Router /
    // Effect / Action / Ternary / Http snippets; the hand-written `effect` in
    // particular still taught the legacy bare `effect(` form instead of
    // `$effect(`.) Snippet names are bare.
    const canonicalSnippetNames = new Set(langSpec.snippets.map((s) => s.name.toLowerCase()));
    for (const s of langSpec.snippets) {
      if (!sigilOk(s.name)) continue;
      options.push({
        label: s.name + "…",
        type: "snippet",
        detail: "snippet",
        info: s.description,
        apply: autocomplete.snippet(s.template),
      });
    }
    for (const s of LANGUAGE_SNIPPETS) {
      if (!sigilOk(s.name)) continue;
      if (canonicalSnippetNames.has(s.name.toLowerCase())) continue;
      options.push({
        label: s.name + "…",
        type: "snippet",
        detail: "language",
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

    return { from: word.from, options, validFor: /[\w$_]*/ };
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

  /**
   * May a canonical snippet stand in as a COMPONENT completion's insert
   * template? Only when it actually produces a call to that component in the
   * position the cursor is in. Two disqualifiers:
   *
   *   1. The name is really a builtin's snippet, not the component's — every
   *      config-taking builtin has a same-spelled snippet (`Form` → `$form`,
   *      `Store` → `$store`, `Query`, `Mutation`, `Socket`, `Sse`, `Http`), and
   *      those insert a state binding, not a component call. Detected against
   *      `langSpec.builtins` rather than a hand-listed set of names.
   *   2. The template is assignment-shaped (`card1 = Card([…])`). Perfectly
   *      correct at statement start; a syntax error anywhere nested.
   */
  function snippetSuitsComponent(snippet, atStatementStart) {
    if (!snippet) return false;
    const sigil = `$${snippet.name.toLowerCase()}`;
    if (langSpec.builtins.some((b) => b.sigil === sigil)) return false;
    if (/^\s*[$\w]+\s*=/.test(snippet.template) && !atStatementStart) return false;
    return true;
  }

  function scanStateRefs(source) {
    const out = new Set();
    const re = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
    let m;
    while ((m = re.exec(source))) out.add(m[1]);
    return Array.from(out).sort();
  }

  /**
   * Find every binding whose value comes from a factory primitive —
   * `$todos = $http(`, `form = $form(`, `$chat = await $socket(`, … — and
   * map the receiver (exactly as typed, with or without the `$` sigil) to
   * the factory's member table so `receiver.` completes to the right bag
   * (`.data` / `.refetch()` for $http, `.values` / `.submit()` for $form,
   * `.status` / `.send()` for $socket, …).
   *
   * Matches the WHOLE-BAG binding form only (`name = $factory(…)`); the
   * destructured form (`const { t } = $i18n(…)`, where each name is one MEMBER
   * of the bag rather than the bag itself) is handled by
   * `scanDestructuredMembers` — `t.` would be meaningless, but hovering `t`
   * should still show `t(key, vars?)`.
   */
  function scanFactoryResources(source) {
    const out = new Map();
    // Alternation derived from the (reconciled) factory map so every factory —
    // including ones merged from the runtime, e.g. `$script` — is recognised.
    const factoryAlt = factoryAlternation();
    if (!factoryAlt) return out;
    const re = new RegExp(
      `(\\$?[A-Za-z_][\\w]*)\\s*=\\s*(?:await\\s+)?\\$(${factoryAlt})\\s*\\(`,
      "g",
    );
    let m;
    while ((m = re.exec(source))) out.set(m[1], FACTORY_RESOURCE_MEMBERS[m[2]]);
    return out;
  }

  /** `$http|$query|…` alternation, derived from the reconciled factory map. */
  function factoryAlternation() {
    return Object.keys(FACTORY_RESOURCE_MEMBERS).join("|");
  }

  /**
   * Find every LOCAL name introduced by destructuring a factory result —
   * `const { t, setCurrentLanguage } = $i18n({…})` — and map it to the canonical
   * member spec it came from, so hover shows the member's real signature and
   * summary instead of nothing. `$i18n` is the motivating case: it is the only
   * config-taking builtin whose documented result bag is normally destructured.
   */
  function scanDestructuredMembers(source) {
    const out = new Map();
    const factoryAlt = factoryAlternation();
    if (!factoryAlt) return out;
    const re = new RegExp(
      `\\{([^}]*)\\}\\s*=\\s*(?:await\\s+)?\\$(${factoryAlt})\\s*\\(`,
      "g",
    );
    let m;
    while ((m = re.exec(source))) {
      const bag = FACTORY_RESOURCE_MEMBERS[m[2]] ?? [];
      for (const part of m[1].split(",")) {
        // `{ t, setCurrentLanguage: setLang }` → key `setCurrentLanguage` binds
        // the LOCAL name `setLang`; hover keys off the local name.
        const colon = part.indexOf(":");
        const key = (colon < 0 ? part : part.slice(0, colon)).trim();
        const local = (colon < 0 ? part : part.slice(colon + 1)).trim();
        if (!/^[A-Za-z_$][\w$]*$/.test(key) || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
        const member = bag.find((x) => x.name === key);
        if (member) out.set(local, { ...member, factory: `$${m[2]}` });
      }
    }
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
   * `storage.local` / `util.rules`), the reserved `route` handle, and any
   * binding assigned from a factory primitive — `$http`/`$query`/`$mutation`/
   * `$socket`/`$sse`/`$form`/`$store` — which completes with that factory's
   * resource-bag members. Returns `null` when the receiver isn't a known
   * object so general completions can take over.
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
    const factoryMembers = scanFactoryResources(source).get(receiver);
    if (factoryMembers) {
      return factoryMembers.map((m) => memberOption(m, receiver));
    }
    return null;
  }

  // ---- Spec lookup (hover & signature tooltips share this) ----
  function resolveSpec(rawName) {
    if (!rawName) return null;
    // Config-taking builtins (`$http`, `$query`, `$theme`, …) carry a synthetic
    // param spec (`url`, `method`, …) so signature help + hover light up inside
    // the config object. Kind "component" keeps the name un-prefixed.
    const configSpec = BUILTIN_CONFIG_SPECS[rawName];
    if (configSpec) return { kind: "component", spec: configSpec };
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
        signature: ident.signature,
        description: ident.info,
        kind: ident.label.startsWith("$") ? "global" : "reserved",
      };
    }
    // Fallback to the canonical builtin catalog so hovering any `$`-builtin not
    // surfaced by the curated lists ($state, $memo, $head, $script, …) still
    // shows its signature + summary.
    const builtin = langSpec.builtins.find((b) => b.sigil === rawName);
    if (builtin) {
      return {
        name: builtin.sigil,
        signature: builtin.signature,
        description: builtin.summary,
        kind: builtin.namespace ? "namespace" : "global",
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
   * §19 flexible-call scan: walk the active call's arguments up to `pos`
   * and report each argument's shape (`objectKeys` — the top-level keys
   * when the argument is an object literal, else `null`) plus the cursor's
   * object context (whether the cursor sits inside an argument's object
   * literal and the prop key it is on). Feeds `chooseNamedBagIndex` /
   * `slotForNthPositional` from the runtime so completions and signature
   * help highlight the slot an argument will ACTUALLY bind to — for the
   * canonical form, all-positional calls, and all-named object calls alike.
   */
  function scanCallArgShapes(text, call, pos) {
    const shapes = [{ objectKeys: null }];
    let str = null;
    let comment = null;
    let depth = 0;        // bracket depth relative to the call's arg list
    let obj = null;       // top-level-object state for the CURRENT argument
    let i = call.openParen + 1;
    const top = Math.min(pos, text.length);
    const flushPending = () => {
      if (obj && obj.expectingKey && obj.pendingKey) obj.keys.push(obj.pendingKey);
      if (obj) obj.pendingKey = "";
    };
    while (i < top) {
      const ch = text[i];
      if (comment === "line") { if (ch === "\n") comment = null; i++; continue; }
      if (comment === "block") { if (ch === "*" && text[i + 1] === "/") { comment = null; i += 2; continue; } i++; continue; }
      if (str) { if (ch === "\\") { i += 2; continue; } if (ch === str) str = null; i++; continue; }
      if (ch === "/" && text[i + 1] === "/") { comment = "line"; i += 2; continue; }
      if (ch === "/" && text[i + 1] === "*") { comment = "block"; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { str = ch; i++; continue; }
      if (ch === "(" || ch === "[") { depth++; i++; continue; }
      if (ch === "{") {
        if (depth === 0) {
          const arg = shapes[shapes.length - 1];
          if (arg.objectKeys === null) {
            arg.objectKeys = [];
            obj = { keys: arg.objectKeys, expectingKey: true, pendingKey: "", valueKey: null };
          }
        }
        depth++; i++; continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        depth--;
        if (ch === "}" && depth === 0 && obj) { flushPending(); obj = null; }
        i++; continue;
      }
      if (ch === ",") {
        if (depth === 0) {
          shapes.push({ objectKeys: null });
          obj = null;
        } else if (depth === 1 && obj) {
          flushPending();
          obj.expectingKey = true;
          obj.valueKey = null;
        }
        i++; continue;
      }
      if (depth === 1 && obj && obj.expectingKey) {
        if (/[\w$]/.test(ch)) obj.pendingKey += ch;
        else if (ch === ":") {
          obj.keys.push(obj.pendingKey);
          obj.valueKey = obj.pendingKey;
          obj.pendingKey = "";
          obj.expectingKey = false;
        } else if (ch === "." && text.slice(i, i + 3) === "...") {
          obj.pendingKey = "";
          obj.expectingKey = false;
          i += 3; continue;
        } else if (!/\s/.test(ch)) {
          obj.pendingKey = "";
        }
      }
      i++;
    }
    const activeObject = obj
      ? {
          argIndex: shapes.length - 1,
          activeKey: obj.expectingKey ? obj.pendingKey : (obj.valueKey || ""),
        }
      : null;
    return { shapes, activeObject };
  }

  /** Runtime component spec (props + binding metadata) for a callee, or null. */
  function runtimeSpecFor(name) {
    if (!name) return null;
    try { return findComponent(defaultLibrary, name) || null; } catch { return null; }
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

  function buildSpecTooltipDom(spec, activeIndex, namedArgName) {
    const wrap = document.createElement("div");

    const header = document.createElement("h4");
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-cube";
    header.append(icon, document.createTextNode(` ${spec.name}`));
    const groupLabel = spec.group;
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
      // Out-of-range (negative or past the last slot) means "highlight
      // nothing" — e.g. the named-props object just opened, or an
      // all-positional call ran past the spec's slots.
      activeIdx = activeIndex >= 0 && activeIndex < spec.params.length ? activeIndex : null;
    }

    const sig = document.createElement("code");
    sig.className = "pg-cm-sig";
    if (activeIdx !== null) {
      sig.append(document.createTextNode(`${spec.name}(`));
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

  // ---- Linter: the runtime's own language service ----
  // `getDiagnostics(source, library)` is exactly what the VS Code extension and
  // the LSP server consume, so the playground reports the same three classes
  // the rest of the toolchain does:
  //   - parse errors,
  //   - schema errors — the §19 flexible-call checks (positional arity, enum
  //     values along the slot mapping), the canonical spacing-token enums, and
  //     the built-in-name collision error for custom components (the same list
  //     the <aktion-app> error banner shows),
  //   - soft lint WARNINGS the schema validator structurally cannot see: a
  //     PascalCase call that is neither a library component nor declared /
  //     imported in the file (which otherwise renders nothing, silently), and a
  //     lambda/loop variable shadowing the `t` destructured from `$i18n(...)`.
  // Every diagnostic carries its own `severity`; nothing here hard-codes it, so
  // the warning styling path in the error modal actually fires.
  const lintSource = lint.linter(async (view) => {
    const text = view.state.doc.toString();
    const svc = await loadLanguageService();
    const diagnostics = collectDiagnostics(svc, text);
    parseErrors = diagnostics;
    refreshStatusErrors();
    return diagnostics.map((err) => {
      const line = Math.max(1, err.line || 1);
      const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
      const fromCol = Math.max(0, (err.column || 1) - 1);
      const from = lineInfo.from + Math.min(fromCol, lineInfo.length);
      const to = lineInfo.to;
      return { from, to, severity: err.severity || "error", message: err.message };
    });
  }, { delay: 250 });

  /**
   * Diagnostics for one source string, normalised to
   * `{ line, column, message, severity }`.
   *
   * `svc` is the lazily-loaded `dist/language.js`; when it is unavailable we
   * degrade to the runtime bundle's `parse` + `validateProgramSchema` (errors
   * only, no lint warnings) rather than leaving the editor with no linter at
   * all. Both paths are fully guarded: `parse` THROWS on some malformed input
   * (as opposed to collecting a `program.errors` entry) and an unguarded throw
   * would take down the whole CodeMirror lint extension, and with it the gutter
   * markers and the status pill.
   */
  function collectDiagnostics(svc, text) {
    try {
      if (svc) return svc.getDiagnostics(text, defaultLibrary);
      const program = parse(text);
      let schemaErrors = [];
      try {
        schemaErrors = validateProgramSchema(program, defaultLibrary);
      } catch { /* the validator must never break the editor */ }
      return [...program.errors, ...schemaErrors].map((err) => ({ ...err, severity: "error" }));
    } catch (err) {
      return [{ line: 1, column: 1, severity: "error", message: String(err?.message ?? err) }];
    }
  }

  // ---- Hover tooltip: show component/builtin info when hovering an identifier ----
  const hoverTooltipExt = view.hoverTooltip((cmView, pos) => {
    const doc = cmView.state.doc;
    const text = doc.toString();
    const word = cmView.state.wordAt(pos);
    if (!word) return null;
    const prev = word.from > 0 ? text[word.from - 1] : "";
    // Pull the sigil into the name so `$util` / `$router` / `$http` resolve
    // as globals (CodeMirror's `wordAt` stops at the `$`).
    const fromIdx = prev === "$" ? word.from - 1 : word.from;
    const rawName = text.slice(fromIdx, word.to);

    // Reserved-keyword popup: definition + syntax + example. Only when the
    // hovered word isn't sigil-prefixed (`$state` / `$global` are handled
    // elsewhere) and is a known keyword.
    if (prev !== "$" && KEYWORD_DOCS[rawName]) {
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
          dom.append(buildSpecTooltipDom(resolved.spec));
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

    // A name destructured out of a factory result — the `t` of
    // `const { t } = $i18n({…})`. Show the MEMBER's canonical signature and
    // summary; without this the single most-used i18n binding hovers blank.
    const destructured = scanDestructuredMembers(text).get(rawName);
    if (destructured) {
      return {
        pos: fromIdx,
        end: word.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "pg-cm-tooltip";
          dom.append(buildGlobalTooltipDom({
            name: rawName,
            signature: destructured.apply.replace(/\$\{\d+:([^}]*)\}/g, "$1"),
            description: destructured.info,
            kind: `${destructured.factory} result`,
          }));
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
    if (!param) {
      // `sx:` / `animate:` / `aria:` … — a universal channel rather than one of
      // this component's own props, so it has its own small popup instead of the
      // full component spec.
      const universal = UNIVERSAL_PARAMS.find((p) => p.name === rawName);
      if (!universal) return null;
      return {
        pos: word.from,
        end: word.to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "pg-cm-tooltip";
          dom.append(buildGlobalTooltipDom({
            name: universal.name,
            signature: `${universal.name}: ${universal.type}`,
            description: universal.description,
            kind: "universal prop",
          }));
          return { dom };
        },
      };
    }
    return {
      pos: word.from,
      end: word.to,
      above: true,
      create() {
        const dom = document.createElement("div");
        dom.className = "pg-cm-tooltip";
        dom.append(buildSpecTooltipDom(
          enclosingResolved.spec,
          undefined,
          rawName,
        ));
        return { dom };
      },
    };
  }, { hideOnChange: true, hoverTime: 250 });

  // ---- Signature help: while the cursor is inside a `Name(...)` call, show
  //      the active parameter and its allowed enum values (when present). ----
  // Dispatched (Escape) to dismiss the signature popup; it stays hidden
  // until the next doc/selection change recomputes it.
  const hideSignatureEffect = state.StateEffect.define();
  const signatureField = state.StateField.define({
    create: computeSignatureTooltip,
    update(value, tr) {
      if (tr.effects.some((e) => e.is(hideSignatureEffect))) return null;
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
    // §19 flexible calls — highlight the parameter the cursor's argument
    // will BIND to: inside the named-props object (trailing, leading, or a
    // single all-named argument) that is the prop whose key the cursor is
    // on; at a positional slot it is resolved with the same slot-ordering
    // helpers the runtime uses, so all-positional calls track the
    // signature correctly (first positional → the `(positional)` slot,
    // later ones → the next unfilled slots in declaration order).
    const runtimeSpec = runtimeSpecFor(call.name);
    const scan = scanCallArgShapes(text, call, sel.head);
    let namedArgName = null;
    let activeIndex = null;
    if (runtimeSpec) {
      const bagIdx = chooseNamedBagIndex(scan.shapes, runtimeSpec);
      if (scan.activeObject && scan.activeObject.argIndex === bagIdx) {
        const key = scan.activeObject.activeKey;
        if (key) {
          const exact = runtimeSpec.props.find(
            (p) => p.name === key || (p.aliases && p.aliases.includes(key)),
          );
          const match = exact || runtimeSpec.props.find((p) => p.name.startsWith(key));
          if (match) namedArgName = match.name;
        }
        if (!namedArgName) activeIndex = -1; // object open, no key yet → no highlight
      } else {
        let n = call.argIndex;
        if (bagIdx >= 0 && bagIdx < call.argIndex) n -= 1;
        const slot = slotForNthPositional(runtimeSpec, n);
        activeIndex = slot ? runtimeSpec.props.indexOf(slot) : -1;
      }
    } else {
      // Synthetic specs ($http config) — key match inside the object,
      // otherwise the plain positional index.
      namedArgName =
        (scan.activeObject && scan.activeObject.activeKey) ||
        detectActiveNamedArg(text, call, sel.head);
      if (!namedArgName) activeIndex = call.argIndex;
    }
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
          activeIndex,
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

  /**
   * Dismiss the editor's hover + signature popups (wired to Escape). The
   * signature popup stays hidden until the next doc/selection change.
   */
  function dismissEditorPopups() {
    if (!editorView) return;
    const effects = [hideSignatureEffect.of(null)];
    if (view.closeHoverTooltips) effects.push(view.closeHoverTooltips);
    editorView.dispatch({ effects });
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
  // copy/cut→paste. The linker links from `entryFile`, which defaults to
  // `ENTRY_FILE` but can be repointed to any project file by the user.
  let files = {};
  let folders = new Set();
  let activeFile = ENTRY_FILE;
  let entryFile = ENTRY_FILE;
  let openTabs = [];
  let expanded = new Set();
  let selected = new Set();
  let lastClicked = null;     // anchor for shift-range selection
  let clipboard = null;       // { mode: "copy" | "cut", paths: string[] }
  let visiblePaths = [];      // tree paths in render order (range-select / keyboard nav)
  let dragPaths = [];         // paths being dragged
  let projectDiagnostics = [];
  // Errors reported by the runtime's own `error` event (render-time failures the
  // static linter can't see). Its own slot, not a second writer of
  // `parseErrors` — otherwise whichever of the two fired last would silently
  // erase the other's diagnostics. `combinedErrors()` merges all three.
  let runtimeErrors = [];

  // Persist the whole project. The legacy `LS.code` key is kept in sync with
  // the entry file so older single-file share/restore paths keep working.
  function persistFiles() {
    lsWrite(LS.files, JSON.stringify(files));
    lsWrite(LS.folders, JSON.stringify([...folders]));
    lsWrite(LS.openTabs, JSON.stringify(openTabs));
    lsWrite(LS.expanded, JSON.stringify([...expanded]));
    lsWrite(LS.activeFile, activeFile);
    lsWrite(LS.entryFile, entryFile);
    lsWrite(LS.code, files[entryFile] ?? files[ENTRY_FILE] ?? "");
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
        // `foldGutter()` gives click-to-fold; `foldKeymap` is what makes folding
        // reachable from the keyboard (Mod-Alt-[ / Mod-Alt-]). The gutter was
        // installed without it, so folding was mouse-only.
        ...lang.foldKeymap,
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

  // Boot the preview iframe, then render once its runtime has upgraded the
  // inner <aktion-app> — otherwise the initial program assignment would hit a
  // plain element and be lost. The renderer theme is (re)applied here too,
  // since `setRendererTheme` during init runs before the inner app exists.
  //
  // A program that arrived through a share link came from whoever wrote the URL,
  // not from the person opening it, so it boots under the runtime's `"safe"`
  // global-access policy — no `eval`, no `Function`, no `document`/`fetch`/
  // `localStorage`. The Trusted toggle in the Runtime toolbar group re-boots the
  // frame with the full surface once the reader has looked at the code.
  let accessPolicy = initialCode.fromSharedLink ? "safe" : "all";
  bootPreview();

  // ---- Initial UI ----
  applyViewMode(viewMode);
  applyRunModeUI(currentRunMode);
  applyInspectUI(inspectOn);
  applySidebarCollapsed(lsRead(LS.sidebarCollapsed, "false") === "true");
  populateExampleSelect();
  populateThemeSelect();
  $("pg-example").value = currentExample;
  setRendererTheme(lsRead(LS.theme, "light"));
  applyAccessPolicyUI();
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

  // Runtime attribute toggles. Each flips one `<aktion-app>` attribute and then
  // re-renders, because `strict` is read at render time rather than observed.
  $("pg-strict").addEventListener("click", () => toggleRuntimeFlag(LS.strict, "strict"));
  $("pg-rtl").addEventListener("click", () => toggleRuntimeFlag(LS.rtl, "rtl"));
  $("pg-showerrors").addEventListener("click", () => toggleRuntimeFlag(LS.showErrors, "showerrors"));
  $("pg-access").addEventListener("click", toggleAccessPolicy);

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
      dismissEditorPopups();
      if (inspectOn) toggleInspect();
      hideInspectOverlay();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  });

  // Splitter drag
  initSplitter();


  // ---- Functions defined within closure ----

  // Reset the folder/tab/expanded model to the defaults for the current
  // `files`/`activeFile` (one open tab, no extra folders, all collapsed).
  function freshModel() {
    folders = new Set();
    openTabs = [activeFile];
    expanded = new Set();
    selected = new Set();
    clipboard = null;
    entryFile = ENTRY_FILE;
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
      // `fromSharedLink` drives the preview's global-access policy — see the
      // `initPreviewFrame` call in the init block.
      return { code: files[ENTRY_FILE], example: "custom", fromSharedLink: true };
    }
    // 2. Saved multi-file project — restore files, folders, tabs, expansion.
    const savedFiles = readSavedFiles();
    if (savedFiles) {
      files = savedFiles;
      const saved = lsRead(LS.activeFile, ENTRY_FILE);
      activeFile = files[saved] !== undefined ? saved : ENTRY_FILE;
      const savedEntry = lsRead(LS.entryFile, ENTRY_FILE);
      entryFile = files[savedEntry] !== undefined ? savedEntry : ENTRY_FILE;
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
        if (dir === "") {
          if (a === entryFile) return -1; if (b === entryFile) return 1;
          if (a === ENTRY_FILE) return -1; if (b === ENTRY_FILE) return 1;
        }
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
    if (path === entryFile) {
      const badge = document.createElement("span");
      badge.className = "pg-row-badge";
      badge.dataset.entry = "true";
      badge.textContent = "entry";
      badge.title = "This file is the entry point the playground runs and links from";
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
    entryFile = remap(entryFile);
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
    // A deleted entry falls back to the always-present default file.
    if (files[entryFile] === undefined) entryFile = ENTRY_FILE;
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

  // Repoint the linker's entry to any project file. The new entry must exist;
  // the choice is persisted and the viewer re-runs from it immediately.
  function setEntryFile(path) {
    if (files[path] === undefined) { showToast("Pick an existing file as the entry", { icon: "triangle-exclamation" }); return; }
    if (path === entryFile) return;
    entryFile = path;
    persistFiles();
    renderFileExplorer();
    doRun(true);
    showToast(`Entry point set to ${baseName(path)}`, { icon: "play" });
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
      const mi = document.createElement("i");
      mi.className = `fa-solid ${item.icon || "fa-circle"}`;
      mi.setAttribute("aria-hidden", "true");
      const mlabel = document.createElement("span");
      mlabel.textContent = item.label;
      el.append(mi, mlabel);
      if (item.key) {
        const key = document.createElement("span");
        key.className = "pg-menu-key";
        key.textContent = item.key;
        el.append(key);
      }
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
      items.push({ label: "Set as entry point", icon: "fa-play", disabled: path === entryFile, action: () => setEntryFile(path) });
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
      const theme = getTarget()?.getAttribute("theme") || "light";
      const title = `${EXAMPLES[currentExample]?.label ?? "Aktion app"} · Aktion`;
      // No 4th arg → the exported index.html loads the library from the public
      // CDN instead of inlining it (the separate "Standalone HTML" download
      // inlines everything). Synchronous — it just builds a string.
      const indexHtml = buildStandaloneHtml(linked.source || files[ENTRY_FILE] || "", theme, title);
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

  /**
   * Build the example `<select>` from `EXAMPLES` itself.
   *
   * The options used to be hand-listed in playground.html, and the two lists
   * drifted: `storageConsole` — the only example exercising `$storage` and
   * `$console` — shipped in the bundle with no way to reach it from the UI for
   * as long as nobody diffed them. Generating makes that class of drift
   * structurally impossible.
   *
   * One flat list, in declaration order — no `<optgroup>`. The grouped tiers
   * ("New features", "Primitives & coverage") are gone along with the examples
   * that filled them, so a divider would now be a heading over a single item.
   */
  function populateExampleSelect() {
    const sel = $("pg-example");
    sel.replaceChildren();
    for (const [key, ex] of Object.entries(EXAMPLES)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = ex.label || key;
      sel.append(opt);
    }
  }

  /**
   * Build the renderer-theme `<select>` from `langSpec.themeNames`. Same reason
   * as the example select: a seventh runtime theme would otherwise appear in
   * autocomplete (which already reads `themeNames`) while being absent from the
   * only UI that can actually preview it.
   */
  function populateThemeSelect() {
    const sel = $("pg-theme");
    sel.replaceChildren();
    for (const name of langSpec.themeNames) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      sel.append(opt);
    }
  }

  function setRendererTheme(name) {
    // No-op on the inner app until the iframe is ready; the bootstrap
    // re-applies the persisted theme via `frameReady` once it exists.
    getTarget()?.setAttribute("theme", name);
    $("pg-theme").value = name;
    $("pg-pill-theme").textContent = name;
    lsWrite(LS.theme, name);
  }

  /* ---- Runtime attributes ------------------------------------------------
   * `theme` used to be the ONLY `<aktion-app>` attribute the playground could
   * set, which left `strict` — the dev-mode morph guard plus unresolved-
   * identifier warnings, the most useful debugging aid in the runtime — and
   * `dir="rtl"` unreachable even though THEME_CONFIG_SPEC documents
   * `direction: ltr|rtl` right there in the editor.
   *
   * `router-mode`/`router-base` are deliberately NOT offered: the preview lives
   * in an `about:srcdoc` document, which has no pushable URL, and the router
   * reads those attributes once in `connectedCallback` rather than observing
   * them. Hash routing (the default) works and the `routing` example uses it.
   * ---------------------------------------------------------------------- */

  /** Reflect the persisted runtime flags onto the preview element + toolbar. */
  function applyRuntimeAttributes() {
    for (const [key, attr, id] of RUNTIME_FLAGS) {
      const on = lsRead(key, "false") === "true";
      getTarget()?.toggleAttribute(attr === "rtl" ? "dir" : attr, on);
      // `dir` is a value attribute, not a boolean one.
      if (attr === "rtl" && on) getTarget()?.setAttribute("dir", "rtl");
      $(id).setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function toggleRuntimeFlag(key, attr) {
    lsWrite(key, lsRead(key, "false") === "true" ? "false" : "true");
    applyRuntimeAttributes();
    // `strict` is read during render (not observed), so force a re-render.
    scheduleViewerUpdate(true, true);
  }

  /**
   * Flip the preview between the full JS global surface and the runtime's vetted
   * allow-list. The policy is module state inside the frame's runtime copy and
   * there is no way to reach in and change it after the fact, so the toggle
   * re-boots the frame — which also guarantees the program restarts from a clean
   * slate under the new policy rather than half-way through its lifecycle.
   */
  function toggleAccessPolicy() {
    accessPolicy = accessPolicy === "safe" ? "all" : "safe";
    applyAccessPolicyUI();
    reloadPreviewFrame();
    showToast(
      accessPolicy === "safe" ? "Preview sandboxed" : "Preview trusted",
      { icon: accessPolicy === "safe" ? "lock" : "lock-open" },
    );
  }

  function applyAccessPolicyUI() {
    const sandboxed = accessPolicy === "safe";
    const btn = $("pg-access");
    btn.setAttribute("aria-pressed", sandboxed ? "true" : "false");
    btn.querySelector("i").className = sandboxed ? "fa-solid fa-lock" : "fa-solid fa-lock-open";
    $("pg-access-label").textContent = sandboxed ? "Sandboxed" : "Trusted";
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
        // mountDevtools just installed the global hook in this (parent) window;
        // the iframe app mirrors it via a live accessor but only registers on a
        // render, so re-run the preview to make the panel pick it up.
        scheduleViewerUpdate(true, true);
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
    // The crosshair cursor lives inside the iframe document (a parent CSS rule
    // can't reach it), so toggle a body class the injected stylesheet targets.
    frameReady.then(() => {
      const body = previewFrame?.contentDocument?.body;
      if (body) body.classList.toggle("pg-inspecting", on);
    });
    if (!on) hideInspectOverlay();
  }

  // Link the whole project (entry + every file) into one program, fetching any
  // URL imports. Shared by run, share, and standalone-HTML download so they all
  // operate on the linked app, not just the active file.
  async function linkCurrentProject() {
    syncActiveFile();
    return linkProject({ entry: entryFile, files });
  }

  async function doShare() {
    try {
      // Share the linked (single-file) program so the recipient gets a working
      // app even when it was split across files locally.
      const linked = await linkCurrentProject();
      const code = linked.source || files[entryFile] || files[ENTRY_FILE] || "";
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
      const code = linked.source || files[entryFile] || files[ENTRY_FILE] || "";
      const theme = getTarget()?.getAttribute("theme") || "light";
      const exampleLabel = EXAMPLES[currentExample]?.label ?? "Aktion app";
      const title = `${exampleLabel} · Aktion`;
      downloadStandaloneHtml(code, theme, title);
      showToast("HTML downloaded", { icon: "download" });
    } catch (err) {
      console.error(err);
      showToast("Couldn't download file", { icon: "triangle-exclamation" });
    }
  }

  /**
   * The `{ path → source }` project an example ships, normalising the two
   * shapes: multi-file examples carry a `files` map, single-file ones a `code`
   * string. `null` for an unknown key (e.g. the `"custom"` pseudo-example a
   * shared link loads under).
   */
  function exampleFiles(key) {
    const ex = EXAMPLES[key];
    if (!ex) return null;
    const out = ex.files ? { ...ex.files } : { [ENTRY_FILE]: ex.code };
    if (out[ENTRY_FILE] === undefined) out[ENTRY_FILE] = "";
    return out;
  }

  /** Do two `{ path → source }` maps have exactly the same files and contents? */
  function sameProject(a, b) {
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false;
    return aKeys.every((k) => a[k] === b[k]);
  }

  function loadExample(key, force) {
    const nextFiles = exampleFiles(key);
    if (!nextFiles) return;

    syncActiveFile();
    // "Dirty" = the project no longer matches the example it was loaded from.
    // Compare against `exampleFiles(currentExample)`, NOT `EXAMPLES[…].code`:
    // multi-file examples carry only a `files` map, so reading `.code` gave
    // `undefined` and the check was unconditionally true — switching away from
    // "Multi-file modules" always prompted, even on a pristine project.
    // Every file is compared, so editing a non-entry module counts as dirty too.
    const current = exampleFiles(currentExample);
    const isDirty = current !== null && !sameProject(files, current);
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
    await frameReady; // the preview <aktion-app> lives inside the iframe
    const target = getTarget();
    if (!target) return;
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
      // Linker diagnostics carry their own severity (a missing export is an
      // error; an unused import is a warning) — keep it so the error modal can
      // style them apart instead of promoting everything to red.
      severity: d.severity || "error",
    }));
    // Drop the previous render's runtime errors: the runtime only FIRES the
    // `error` event when a render fails, so without this the list would be
    // sticky and a fixed program would keep showing its old failure.
    runtimeErrors = [];
    refreshStatusErrors();
    if (typeof target.mountCompiled === "function") {
      target.mountCompiled(
        defineCompiledProgram({
          __aktionCompiled: COMPILED_PROGRAM_VERSION,
          program: linked.program,
          source: linked.source,
          path: entryFile,
        }),
      );
    } else if (typeof target.setResponse === "function") {
      // Fallback for an older bundle without mountCompiled.
      target.setResponse(linked.source);
    }
    // Rebuild the inspect index now that the DOM matches this source. The
    // MutationObserver in `initInspect()` also triggers a rebuild, but it goes
    // through `requestAnimationFrame` — which never fires in a background tab —
    // so the source-changed path (the one that actually invalidates the AST→DOM
    // mapping) does not depend on it. A timeout, not rAF, for the same reason.
    setTimeout(refreshInspectIndex, 0);
  }, 250);

  // Active-file diagnostics (from the linter), the last run's cross-file linker
  // diagnostics and the last render's runtime errors, deduped by position +
  // message. Three independent producers, three independent slots — merging
  // here rather than letting whichever fired last overwrite the others.
  // `severity` rides along so the error modal and the status pill can tell an
  // error from a warning.
  function combinedErrors() {
    const seen = new Set();
    const out = [];
    for (const err of [...parseErrors, ...projectDiagnostics, ...runtimeErrors]) {
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
    const all = combinedErrors();
    const errors = all.filter((e) => (e.severity || "error") !== "warning");
    const warnings = all.filter((e) => e.severity === "warning");
    if (all.length === 0) {
      btn.dataset.tone = "success";
      btn.querySelector("i").className = "fa-solid fa-check";
      text.textContent = "No errors";
    } else {
      // Warnings alone must not read as a hard failure — they are silent
      // footguns (an unknown component renders nothing) rather than a broken
      // program, so they get their own tone and label.
      btn.dataset.tone = errors.length > 0 ? "danger" : "warning";
      btn.querySelector("i").className = errors.length > 0
        ? "fa-solid fa-triangle-exclamation"
        : "fa-solid fa-circle-exclamation";
      const parts = [];
      if (errors.length) parts.push(`${errors.length} error${errors.length === 1 ? "" : "s"}`);
      if (warnings.length) parts.push(`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`);
      text.textContent = parts.join(", ");
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
      // `paramsWithUniversal` so the pill also names `sx` / `animate` / `aria`,
      // which no component declares but every component accepts.
      param = paramsWithUniversal(resolved.spec).find((p) => p.name === namedArgName) ?? null;
    }
    if (!param && resolved.spec.params.length > 0) {
      // Positional slots are the component's OWN params only — a universal prop
      // can never occupy one.
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
    // Count the two severities separately: a program with only warnings still
    // renders, and titling that "2 errors" is actively misleading.
    const hard = errors.filter((e) => (e.severity || "error") !== "warning").length;
    const soft = total - hard;
    const titleParts = [];
    if (hard) titleParts.push(`${hard} error${hard === 1 ? "" : "s"}`);
    if (soft) titleParts.push(`${soft} warning${soft === 1 ? "" : "s"}`);
    title.textContent = total === 0 ? "No errors" : titleParts.join(", ");

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
    renderMemberHelp();
    $("pg-modal-backdrop").hidden = false;
  }

  /**
   * Write the help modal's "Member completion" paragraph from the RECONCILED
   * catalogs, rather than leaving it as prose in the HTML.
   *
   * The hand-written version listed the `$http` / `$query` / `$socket` / `$form`
   * / `$store` bags and then went stale the moment the runtime grew `$sse`,
   * `$script`, `$dom`, `$toast`, `.pages`, `.validateField()`, `.setValues()`,
   * `.clearHistory()` and `route.pattern` — the modal was documenting an editor
   * that no longer existed. Generated, it cannot drift: it says exactly what the
   * completion engine will actually offer.
   */
  function renderMemberHelp() {
    const el = $("pg-help-members");
    if (!el) return;
    el.replaceChildren();
    const lead = document.createElement("strong");
    lead.textContent = "Member completion.";
    el.append(lead, document.createTextNode(
      " Type a dot after an object to see its members. Factory results — bind"
      + " one with e.g. ",
    ));
    const example = document.createElement("code");
    example.textContent = "$feed = $query({ … })";
    el.append(example, document.createTextNode(" — complete to:"));

    const list = document.createElement("ul");
    list.style.margin = "6px 0 0";
    list.style.paddingLeft = "18px";

    const row = (label, members) => {
      if (!members || members.length === 0) return;
      const li = document.createElement("li");
      const name = document.createElement("code");
      name.textContent = label;
      li.append(name, document.createTextNode(" → "));
      members.forEach((m, i) => {
        if (i > 0) li.append(document.createTextNode(", "));
        const code = document.createElement("code");
        code.textContent = `.${m.name}${m.apply && m.apply.includes("(") ? "()" : ""}`;
        code.title = m.info || "";
        li.append(code);
      });
      list.append(li);
    };

    for (const factory of Object.keys(FACTORY_RESOURCE_MEMBERS).sort()) {
      row(`$${factory}`, FACTORY_RESOURCE_MEMBERS[factory]);
    }
    row("route", ROUTE_MEMBERS);
    for (const ns of GLOBAL_NAMESPACES) {
      // Namespaces carry up to ~120 members; name the first few and say so
      // rather than printing the whole surface into a help modal.
      const shown = ns.members.slice(0, 8);
      const li = document.createElement("li");
      const name = document.createElement("code");
      name.textContent = ns.name;
      li.append(name, document.createTextNode(" → "));
      shown.forEach((m, i) => {
        if (i > 0) li.append(document.createTextNode(", "));
        const code = document.createElement("code");
        code.textContent = `.${m.name}`;
        code.title = m.info || "";
        li.append(code);
      });
      if (ns.members.length > shown.length) {
        li.append(document.createTextNode(` … and ${ns.members.length - shown.length} more`));
      }
      list.append(li);
    }
    el.append(list);
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

  /**
   * Bind inspect mode to ONE preview frame.
   *
   * Called from `bootPreview` on every frame boot, not once at init: the
   * global-access-policy toggle rebuilds the iframe, which replaces its
   * `contentDocument` and its shadow root — listeners and the MutationObserver
   * bound to the previous ones are silently orphaned, and inspect mode stops
   * responding with no visible error.
   */
  let inspectFrameHooked = false;

  function initInspect() {
    // The preview lives inside the iframe, so pointer events fire on its
    // document (they don't cross the frame boundary). Listen there and build
    // the index from the inner app's shadow root.
    const target = getTarget();
    if (!target || !previewFrame) return;
    const idoc = previewFrame.contentDocument;

    const onPointerMove = (e) => {
      if (!inspectOn) return;
      const path = e.composedPath();
      const el = path.find((node) =>
        node && node.nodeType === 1 && // Element (cross-realm: iframe nodes fail `instanceof Element`)
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
        node && node.nodeType === 1 && // Element (cross-realm: iframe nodes fail `instanceof Element`)
        node.classList && node.classList.length > 0 &&
        node.tagName !== "AKTION-APP",
      );
      if (!el) return;
      const matched = matchComponentForElement(el);
      if (!matched) return;
      e.preventDefault();
      e.stopPropagation();
      if (!matched.astEntry) {
        // No line index — see `inspectSourceDoc`. Say so rather than doing
        // nothing, which reads as inspect mode being broken.
        showToast(
          `${matched.componentName} — click-to-jump needs a single-file project`,
          { icon: "circle-info" },
        );
        return;
      }
      jumpToLine(matched.astEntry.line);
    };

    idoc.addEventListener("pointermove", onPointerMove);
    idoc.addEventListener("click", onClick, true);
    // The pointer leaving the iframe altogether can't fire inside it — catch
    // that from the parent side on the iframe ELEMENT, which survives a frame
    // re-boot; bind it once so repeated boots don't stack listeners.
    if (!inspectFrameHooked) {
      inspectFrameHooked = true;
      previewFrame.addEventListener("pointerleave", () => hideInspectOverlay());
    }

    // Re-index on shadow-DOM changes (a re-render swaps the tree).
    if (target.shadowRoot) {
      let raf = 0;
      const mo = new MutationObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => refreshInspectIndex());
      });
      mo.observe(target.shadowRoot, { childList: true, subtree: true });
    }
  }

  function matchComponentForElement(el) {
    let cursor = el;
    // Stop at any <body> (the iframe's own body when walking the preview tree).
    while (cursor && cursor.tagName !== "BODY") {
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
    // `element` lives inside the iframe, so its rect is relative to the iframe
    // viewport. The overlay/tooltip are position:fixed in the parent, so shift
    // by the iframe's own position to land over the right spot.
    const frameRect = previewFrame ? previewFrame.getBoundingClientRect() : { left: 0, top: 0 };
    const r = element.getBoundingClientRect();
    const rect = { left: frameRect.left + r.left, top: frameRect.top + r.top, width: r.width, height: r.height };
    overlay.hidden = false;
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const spec = langSpec.componentsByName[componentName];
    if (!spec) return;

    tooltip.innerHTML = "";
    const h = document.createElement("h4");
    const hIcon = document.createElement("i");
    hIcon.className = "fa-solid fa-cube";
    hIcon.setAttribute("aria-hidden", "true");
    const hGroup = document.createElement("span");
    hGroup.style.fontWeight = "400";
    hGroup.style.color = "var(--doc-text-muted)";
    hGroup.textContent = `· ${spec.group}`;
    h.append(hIcon, document.createTextNode(` ${spec.name} `), hGroup);
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
        const name = document.createElement("code");
        name.textContent = `${p.name}${opt}`;
        const type = document.createElement("span");
        type.style.color = "var(--doc-text-muted)";
        type.textContent = p.type;
        li.append(name, document.createTextNode(": "), type);
        if (p.enumValues) {
          const enums = document.createElement("small");
          enums.style.color = "var(--doc-text-subtle)";
          enums.textContent = ` ${p.enumValues.join(" | ")}`;
          li.append(enums);
        }
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

  /**
   * The document whose LINE NUMBERS the inspect index can legitimately report,
   * or `null` when there isn't one.
   *
   * Click-to-jump needs a source that is BOTH what the preview rendered AND what
   * the editor is showing. Neither candidate satisfies that on its own:
   *   - the active editor buffer is one file of a possibly multi-file project,
   *     so in a multi-file project its call order doesn't match the render (the
   *     bug this replaces: every mapping was computed against a file the preview
   *     never rendered), and
   *   - `linked.source` IS the rendered program, but the linker RE-EMITS it —
   *     comments stripped, object literals reformatted, roughly double the line
   *     count — so its line numbers point nowhere in the editor.
   * The one case where both hold is a single-file project, so that is the only
   * case that gets lines. Otherwise the index is built without them: hover still
   * identifies the component (that comes from the CSS class, not the index) and
   * the click handler explains why it can't jump.
   */
  function inspectSourceDoc() {
    if (Object.keys(files).length !== 1) return null;
    return editorView.state.doc.toString();
  }

  function refreshInspectIndex() {
    const target = getTarget();
    if (!target || !target.shadowRoot) return;
    inspectIndex = new WeakMap();
    const source = inspectSourceDoc();
    if (source === null) return;
    let program;
    try {
      program = parse(source);
    } catch {
      return; // a half-typed program is not worth an exception here
    }

    // Walk the AST in document order, collecting every Call whose callee is a
    // known component name. The result is a flat list in source order, nested
    // calls included.
    //
    // The walk is GENERIC — every own object/array value of every node — rather
    // than a switch over the node kinds someone remembered. A hand-written
    // switch missed `MethodCall`, so `items.map(item => Card(...))` (the single
    // most common Aktion idiom, used by a third of the examples) produced no
    // mapping at all; it also missed `Lambda` bodies, `Template` expressions and
    // `ComponentDeclaration`, which carries `body` rather than `expression`.
    const astOrdered = [];
    const seen = new Set();
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (seen.has(node)) return; // cheap cycle guard
      seen.add(node);
      if (node.kind === "Call" && componentNames.has(node.callee)) {
        astOrdered.push({
          name: node.callee,
          line: node.loc?.line ?? 0,
          column: node.loc?.column ?? 0,
        });
      }
      for (const key of Object.keys(node)) {
        if (key === "loc") continue;
        const value = node[key];
        if (value && typeof value === "object") visit(value);
      }
    };
    // A statement's payload is `expression` for assignments/bare expressions and
    // `body` for a `function`/component declaration.
    for (const stmt of program.statements) visit(stmt.expression ?? stmt.body ?? stmt);

    // Walk the rendered shadow DOM in document order; for each element whose
    // class matches a known component, pair it with the next matching AST
    // entry of the same name.
    const queueByName = new Map();
    for (const entry of astOrdered) {
      if (!queueByName.has(entry.name)) queueByName.set(entry.name, []);
      queueByName.get(entry.name).push(entry);
    }
    const walk = (node) => {
      if (!node || node.nodeType !== 1) return; // Element (cross-realm safe)
      const name = componentNameFromClasses(node);
      if (name) {
        const q = queueByName.get(name);
        if (q && q.length > 0) {
          inspectIndex.set(node, q.shift());
        }
      }
      for (const child of node.children) walk(child);
    };
    // Start from the shadow root's CHILDREN, not the root: a ShadowRoot is a
    // DocumentFragment (nodeType 11), so `walk(shadowRoot)` failed its own
    // `nodeType !== 1` guard on the first line and returned immediately —
    // leaving the index permanently empty, which is why inspect mode never
    // showed a source line or jumped anywhere.
    for (const child of target.shadowRoot.children) walk(child);
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

  /**
   * Boot (or re-boot) the preview iframe under the current `accessPolicy` and
   * re-bind everything that hangs off the inner `<aktion-app>`.
   *
   * Called once at init and again whenever the global-access policy changes —
   * the policy is module state inside the frame's own copy of the runtime, so it
   * can only be changed by building a fresh frame. Everything the parent
   * attaches to the element (theme, runtime attributes, the runtime `error`
   * listener) has to be re-attached to the NEW element, which is why this lives
   * in one place rather than being spread across the init block.
   */
  function bootPreview() {
    initPreviewFrame(accessPolicy).then((app) => {
      app.setAttribute("theme", $("pg-theme").value || "light");
      applyRuntimeAttributes();
      attachRuntimeErrorListener(app);
      initInspect();
      scheduleViewerUpdate(true, true);
    });
  }

  function reloadPreviewFrame() {
    bootPreview();
  }

  /**
   * Subscribe to runtime error events — render-time failures the static linter
   * structurally cannot see, plus a safety net for the window before the linter
   * has run. They land in `runtimeErrors`, their OWN slot: writing them into
   * `parseErrors` (which `lintSource` owns) meant whichever producer fired last
   * erased the other's diagnostics, so the status pill and the gutter markers
   * could disagree. The §19.1 positional advisory is filtered out so the
   * playground stays focused on real errors.
   */
  function attachRuntimeErrorListener(app) {
    app.addEventListener("error", (e) => {
      if (Array.isArray(e.detail?.errors)) {
        runtimeErrors = e.detail.errors
          .filter((err) => !isPositionalAdvisory(err))
          .map((err) => ({ ...err, severity: err.severity || "error" }));
        refreshStatusErrors();
      }
    });
  }
}
