/**
 * Streaming UI Script playground.
 *
 * Single-page IDE-style playground built on CodeMirror 6 (loaded from
 * esm.sh) and the language spec exported by `src/language/`. Wiring:
 *   - editor: custom StreamLanguage + autocomplete + linter + snippets
 *   - viewer: live <streaming-ui-script> element
 *   - inspect: hover overlay + click-to-jump to source line
 *   - persistence: localStorage under `rui:playground:*`
 *   - URL share: gzipped+base64 program in #code=
 *
 * No build step — this file is shipped as-is to GitHub Pages.
 */

import {
  parse,
  getLanguageSpec,
} from "../../dist/streaming-ui-script.js";

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
    code: `root = Stack([greeting, sample, follow])
greeting = Card([CardHeader("Hello, world", "Edit this text and watch it update")])
sample = Card([
  CardHeader("Sample stats"),
  Stats([
    StatCard("Active users", \`\${@Format(12540, "number")}\`, "up", "+12% vs last week", "users"),
    StatCard("Revenue",      \`\${@Format(48230, "currency", "USD")}\`, "flat", "stable", "sack-dollar"),
    StatCard("Errors",       "12", "down", "-32%", "triangle-exclamation")
  ])
])
follow = FollowUpBlock([
  FollowUpItem("Add a chart"),
  FollowUpItem("Show an alert"),
  FollowUpItem("Export as CSV")
], "Try editing")`,
  },
  dashboard: {
    label: "Project dashboard",
    code: `# Highlights: macro for KanbanCard, @Each with destructuring, template literals.
root = Stack([header, kpis, board, follow])
header = PageHeader("Engineering Q3", \`\${@Count(projects)} active · \${@Count(atRisk)} at risk\`, ["Workspace", "Engineering"], headerActions, Badge("On track", "success"))
headerActions = [Button("Export", Action([@Run(export_q3)]), "secondary"), Button("New project", Action([@Run(new_project)]), "primary")]
kpis = Stats([
  StatCard(\`Active\`,  \`\${@Count(projects)}\`, "flat", "0 vs last week",                          "folder"),
  StatCard(\`At risk\`, \`\${@Count(atRisk)}\`,   "up",   \`+\${@Count(atRisk) - 2} vs last week\`,    "triangle-exclamation"),
  StatCard("Shipped", "8",                     "up",   "+3 vs last week",                          "rocket"),
  StatCard("On-time", "87%",                   "down", "-3% vs last week",                         "clock")
])

Card2(p) = KanbanCard(p.title, p.summary, p.tags, p.owner, p.tone, p.icon)

board = KanbanBoard([
  KanbanColumn("To do",  @Each(@Filter(projects, "stage", "==", "todo"),   "p", Card2(p))),
  KanbanColumn("Doing",  @Each(@Filter(projects, "stage", "==", "doing"),  "p", Card2(p)), "primary"),
  KanbanColumn("Review", @Each(@Filter(projects, "stage", "==", "review"), "p", Card2(p)), "warning"),
  KanbanColumn("Done",   @Each(@Filter(projects, "stage", "==", "done"),   "p", Card2(p)), "success")
])

projects = [
  {title:"Migrate auth",      summary:"Roll out the new SDK.",   tags:["auth"],     owner:"Asha",  tone:"default", icon:"shield-halved",       stage:"todo"},
  {title:"Streaming UI v2",   summary:"20 new components.",      tags:["frontend"], owner:"Alex",  tone:"primary", icon:"wand-magic-sparkles", stage:"doing"},
  {title:"Mobile onboarding", summary:"Awaiting design review.", tags:["mobile"],   owner:"Wren",  tone:"warning", icon:"mobile-screen",       stage:"review"},
  {title:"Activity timeline", summary:"Shipped to everyone.",    tags:["shipped"],  owner:"Mira",  tone:"success", icon:"circle-check",        stage:"done"}
]
atRisk = @Filter(projects, "tone", "==", "warning")
follow = FollowUpBlock(["Show at-risk projects", "Compare to Q2", "Who needs help?"])`,
  },
  todo: {
    label: "Reactive todo",
    code: `# Highlights: $$persistent todos, template literals, @Each destructuring, @If for empty state.
$$todos = [{id: 1, text: "Welcome — try editing. Refresh me, I persist!", done: false}]
$draft  = ""

addBtn = Button("Add", Action([
  @Set($$todos, [...$$todos, {id: $$todos.length + 1, text: $draft, done: false}]),
  @Reset($draft)
]), "primary")

# Destructure each row — \`id\`, \`text\` are bound directly inside \`row\`, no \`t.\` prefix.
row  = Card([Stack([
  TextContent(text),
  Button("Delete", Action([@Set($$todos, @Filter($$todos, "id", "!=", id))]), "ghost", "button", "small")
], "row", "s", "center", "between")])

list = @Each($$todos, "{id, text}", row)
body = @If($$todos.length > 0, list, EmptyState("Nothing to do", "Add a task above to get started.", "list-check"))

root = Stack([
  Card([CardHeader("Todo list", \`\${@Count($$todos)} \${@Plural(@Count($$todos), "task", "tasks")} · persisted across reloads\`)]),
  Input("draft-input", "What needs doing?", "text", null, $draft),
  addBtn,
  body
])`,
  },
  routing: {
    label: "Routing demo",
    code: `# Highlights: template literals replace string concatenation, ?? for fallbacks.
root = Stack([nav, main])
nav  = Stack([
  NavLink("Home",      "/",          "ghost", true),
  NavLink("Dashboard", "/dashboard", "ghost"),
  NavLink("Users",     "/users",     "ghost")
], "row", "s")

main = Routes([
  Route("/",           homePage),
  Route("/dashboard",  dashPage),
  Route("/users/:id",  userPage),
  Route("*",           notFoundPage)
], "/")

homePage     = Card([CardHeader("Welcome", "Click a link above to navigate")])
dashPage     = Card([CardHeader("Dashboard"), TextContent(\`Live route is \${$route}\`)])
userPage     = Card([CardHeader("User profile"), TextContent(\`Looking at user \${params.id ?? "(none)"}\`)])
notFoundPage = Callout("warning", "Not found", \`Nothing here at \${$route}.\`)`,
  },
  counter: {
    label: "JS counter",
    code: `# Highlights: template literal label, @Clamp for safe arithmetic, optional chaining via ??.
$count = 0

root = Card([
  CardHeader("JS counter", "Powered by a single @Js action."),
  Stack([
    TextContent(\`Current: \${@Clamp($count, -99, 99)}\`),
    Stack([
      Button("-",     Action([@Js(\`ctx.state.set("count", (ctx.state.get("count") ?? 0) - 1)\`)])),
      Button("Reset", Action([@Reset($count)]), "ghost"),
      Button("+",     Action([@Js(\`ctx.state.set("count", (ctx.state.get("count") ?? 0) + 1)\`)]), "primary")
    ], "row", "s")
  ])
])`,
  },
  chart: {
    label: "Chart + metrics",
    code: `# Highlights: derived totals via @Sum + template literals, responsive Grid for chart row.
$range = "7"
root   = Stack([header, kpis, trendRow])
header = PageHeader("Analytics", \`Daily traffic last \${$range} days\`)
kpis   = Stats([
  StatCard("Sessions",     \`\${@Format(@Sum(thisWk, "number"))}\`, "up",   \`+\${@Round((@Sum(thisWk) / @Sum(lastWk) - 1) * 100, 1)}%\`, "chart-line"),
  StatCard("Avg. duration","3m 12s",                          "flat", "stable", "clock"),
  StatCard("Bounce rate",  "32%",                             "down", "-2%",    "arrow-trend-down")
])
trendRow = Grid([trend, breakdown], {sm: 1, md: 2}, "l")
trend = Card([
  CardHeader("Sessions"),
  Stack([LineChart(["Mo","Tu","We","Th","Fr","Sa","Su"], [Series("This week", thisWk), Series("Last week", lastWk)])])
])
breakdown = Card([
  CardHeader("By channel"),
  Stack([PieChart(["Organic","Direct","Referral"], [60, 25, 15])])
])
thisWk = [820, 1240, 1500, 1180, 1310, 980, 740]
lastWk = [780, 1180, 1420, 1090, 1240, 920, 690]`,
  },
  dataGrid: {
    label: "DataGrid + bulk actions",
    code: `# Highlights: sortable DataGrid, per-column filter chips, $$persistent selection, bulk-action toolbar.
$$sort        = {key: "Score", direction: "desc"}
$$selectedIds = []
$$page        = 1

people = [
  {id: "u01", name: "Ada Lovelace",   team: "Compilers",  score: 98, commits: 412},
  {id: "u02", name: "Linus Torvalds", team: "Kernel",     score: 96, commits: 380},
  {id: "u03", name: "Grace Hopper",   team: "Compilers",  score: 95, commits: 358},
  {id: "u04", name: "Margaret Hamilton", team: "Apollo",  score: 94, commits: 340},
  {id: "u05", name: "Donald Knuth",   team: "Algorithms", score: 93, commits: 322},
  {id: "u06", name: "Anita Borg",     team: "Systems",    score: 91, commits: 296},
  {id: "u07", name: "Tim Berners-Lee","team":"Web",        score: 90, commits: 284},
  {id: "u08", name: "Barbara Liskov", team: "Compilers",  score: 89, commits: 272}
]

bulkBar = @If(@Count($$selectedIds) > 0,
  Toolbar(
    [Badge(\`\${@Count($$selectedIds)} selected\`, "primary", "check", "sm")],
    [Button("Email",  Action([@ToAssistant("Email selected")]),   "ghost",   "button", "small", "envelope"),
     Button("Export", Action([@ToAssistant("Export selected")]),   "secondary","button", "small", "file-csv"),
     Button("Clear",  Action([@Reset($$selectedIds)]),             "ghost",   "button", "small")]
  ), null)

root = Stack([
  PageHeader("Top contributors", \`\${@Count(people)} engineers · sorted by \${$$sort.key} \${$$sort.direction}\`, ["Workspace","Engineering"]),
  bulkBar,
  Card([
    SectionHeader("Leaderboard", null, "DATAGRID", Badge("Live", "success", "circle", "sm")),
    DataGrid([
      Col("Id",    people.id,      "text",   "left",  false, false),
      Col("Name",  people.name,    "text",   "left",  true,  true),
      Col("Team",  people.team,    "text",   "left",  true,  true),
      Col("Score", people.score,   "number", "right", true,  false),
      Col("Commits", people.commits, "number","right", true,  false)
    ], people.id, null, $$sort, $$selectedIds, true, $$page, 5, "No people match")
  ])
])`,
  },
  calendar: {
    label: "CalendarView planner",
    code: `# Highlights: CalendarView grid, OnboardingChecklist with $$persistent state, ActivityLog timeline.
$selectedDate = "2026-05-17"
$$ob1 = false
$$ob2 = false
$$ob3 = false

obDone = @If($$ob1, 1, 0) + @If($$ob2, 1, 0) + @If($$ob3, 1, 0)

events = [
  {date: "2026-05-04", title: "Sprint planning", time: "09:00", tone: "primary"},
  {date: "2026-05-12", title: "Standup",          time: "09:00", tone: "primary"},
  {date: "2026-05-12", title: "1:1 · Ada",        time: "16:00", tone: "info"},
  {date: "2026-05-15", title: "Release window",   time: "10:00", tone: "success"},
  {date: "2026-05-17", title: "Demo day",          time: "14:30", tone: "success"},
  {date: "2026-05-22", title: "Retro",             time: "16:00", tone: "info"}
]

root = Stack([
  PageHeader("May 2026", \`\${@Count(events)} events · \${obDone}/3 onboarding\`),
  Grid([
    Card([
      SectionHeader("Calendar", "Focus a day to see details", "PLANNER"),
      CalendarView($selectedDate, "2026-05", events, "month")
    ]),
    Stack([
      Card([
        SectionHeader("Onboarding", "Finish setup to enable publishing", "SETUP"),
        OnboardingChecklist([
          {title: "Connect calendar",      description: "Sync with Google.",     done: $$ob1, action: Action([@Set($$ob1, true)]), cta: "Connect"},
          {title: "Invite teammates",      description: "Share an invite link.", done: $$ob2, action: Action([@Set($$ob2, true)]), cta: "Invite"},
          {title: "Schedule first event",  description: "Pick a slot.",          done: $$ob3, action: Action([@Set($$ob3, true)]), cta: "Schedule"}
        ])
      ]),
      Card([
        SectionHeader("Activity"),
        ActivityLog([
          {actor: "Ada",   title: "rescheduled All-hands",  time: "5m",  icon: "calendar-plus", tone: "primary"},
          {actor: "Linus", title: "RSVPed to Demo day",     time: "1h",  icon: "circle-check",  tone: "success"},
          {actor: "Grace", title: "added release window",   time: "1d",  icon: "rocket",        tone: "info"}
        ])
      ])
    ], "column", "l")
  ], {sm: 1, lg: 2}, "l")
])`,
  },
  media: {
    label: "Media gallery + Map",
    code: `# Highlights: Carousel hero, Gallery wired to Lightbox via $variable, VideoPlayer + AudioPlayer + Map.
$slide        = 0
$lightboxOpen = false
$lightboxIdx  = 0

photos = [
  {src: "https://picsum.photos/seed/aurora-cliffs/1200/700",  caption: "Cliffs at dawn"},
  {src: "https://picsum.photos/seed/aurora-village/1200/700", caption: "Fishing village"},
  {src: "https://picsum.photos/seed/aurora-forest/1200/700",  caption: "Boreal forest"},
  {src: "https://picsum.photos/seed/aurora-lake/1200/700",    caption: "Glacier lake"},
  {src: "https://picsum.photos/seed/aurora-fjord/1200/700",   caption: "Fjord"},
  {src: "https://picsum.photos/seed/aurora-aurora/1200/700",  caption: "Northern lights"}
]

root = Stack([
  PageHeader("Aurora Expedition", "Iceland · Aug 2026", ["Trips", "Aurora"]),
  Card([
    SectionHeader("Highlights"),
    Carousel(@Each(photos, "{src, caption}", {src: src, alt: caption, caption: caption}), $slide, "16:9", true)
  ]),
  Card([
    SectionHeader("Photos", "Tap a thumbnail to zoom"),
    Gallery(@Each(photos, "{src, caption}", {src: src, alt: caption, caption: caption}), 3,
      Action([@Set($lightboxIdx, 0), @Set($lightboxOpen, true)]))
  ]),
  Grid([
    Card([SectionHeader("Trailer"), VideoPlayer(
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
      null, true, false, false, false, "Aurora Expedition trailer", "16:9")]),
    Card([SectionHeader("Soundtrack"), AudioPlayer(
      "https://upload.wikimedia.org/wikipedia/commons/2/26/Cello_Suite_No._1_Prelude.ogg",
      null, "Northern Skies", "Aurora Strings")])
  ], {sm: 1, md: 2}, "l"),
  Card([
    SectionHeader("Itinerary", "Six stops"),
    Map(65.0, -16.0, 5, [
      {lat: 64.1466, lng: -21.9426, label: "Reykjavík"},
      {lat: 64.7140, lng: -19.0608, label: "Highlands"},
      {lat: 65.6839, lng: -18.0907, label: "Akureyri"}
    ], "320px")
  ]),
  Lightbox($lightboxOpen, $lightboxIdx, photos)
])`,
  },
  wizard: {
    label: "MultiStepForm wizard",
    code: `# Highlights: MultiStepForm steps, RichTextEditor, ColorPicker, PinInput, ValidationSummary.
$step  = 0
$title = "Streaming UI v3 — release notes"
$body  = "<h2>What's new</h2><p>Thirty new components — DataGrid, CalendarView, RichTextEditor, six charts.</p>"
$tags  = ["release", "ui", "v3"]
$brand = "#6366f1"
$pin   = ""

errors = @Filter([
  @If($title == "", {label: "title", message: "Title is required."}, null),
  @If($pin.length != 4, {label: "pin",   message: "PIN must be 4 digits."}, null)
], "label", "!=", null)

publishGate = @If(@Count(errors) > 0,
  Card([ValidationSummary(errors, "Fix these before publishing")]),
  Card([Callout("success", "Ready to publish", "All gates passed.", "circle-check", true)]))

root = Stack([
  PageHeader(["Content", "Drafts", $title], "Compose, brand, gate, publish."),
  MultiStepForm([
    {title: "Compose", details: "Title, body, tags", content: [
      Card([SectionHeader("Body", null, "EDITOR"), FormSection("Post",
        [FormControl("Title", Input("title", "Headline…", "text", null, $title)),
         FormControl("Body",  RichTextEditor("body", $body, "Start composing…", "200px")),
         FormControl("Tags",  TagInput("tags", $tags, "Press enter to add"))],
        "All fields stream into the preview.")])
    ]},
    {title: "Brand",   details: "Pick an accent", content: [
      Card([SectionHeader("Brand"), ColorPicker("brand", $brand, "Accent",
        ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6"])])
    ]},
    {title: "Gate",    details: "4-digit PIN", content: [
      Card([SectionHeader("Two-factor publish", null, "GATE"),
        FormControl("PIN", PinInput("pin", 4, $pin, "numeric")),
        publishGate])
    ]}
  ], $step, Action([@ToAssistant("Publish the draft")]))
])`,
  },
  advancedCharts: {
    label: "Gauge, Heatmap, Radar, Scatter",
    code: `# Highlights: every new chart primitive in one dashboard.
root = Stack([
  PageHeader("Engineering analytics", "Quarterly view"),
  Stats([
    StatCard("SLA",    "99.3%", "up",   "+0.2 pp", "shield-halved"),
    StatCard("P95",    "112ms", "down", "-12 ms",  "gauge-high"),
    StatCard("Errors", "0.42%", "flat", "stable",  "circle-exclamation"),
    StatCard("MRR",    "$84k",  "up",   "+12%",    "sack-dollar")
  ]),
  Grid([
    Card([SectionHeader("SLA uptime"),  Gauge(99.3, 95, 100, "Above target", "success", "lg")]),
    Card([SectionHeader("P95 latency"), Gauge(112, 0, 250, "ms",             "primary", "lg")]),
    Card([SectionHeader("Error rate"),  Gauge(0.42, 0, 5,  "% requests",     "warning", "lg")])
  ], {sm: 1, md: 3}, "l"),
  Card([
    SectionHeader("Signups · last 7 days", "Stacked by source"),
    LineChart(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
      [Series("Organic", [40, 52, 65, 78, 92, 105, 124]),
       Series("Referral",[20, 28, 35, 42, 50, 60,  72]),
       Series("Paid",    [10, 14, 18, 24, 30, 36,  44])])
  ]),
  Grid([
    Card([SectionHeader("Office capacity"),
      Heatmap(["Mon","Tue","Wed","Thu","Fri"], ["9am","12pm","3pm","6pm"],
        [[3,4,5,3,2],[8,9,11,7,5],[12,14,16,13,10],[6,7,9,10,12]])
    ]),
    Card([SectionHeader("Vendor scorecard"),
      RadarChart(["Speed","Quality","Cost","Coverage","Trust"],
        [Series("Atlas Cloud", [80,70,60,75,85]),
         Series("Northwind",   [60,85,70,65,80])])
    ])
  ], {sm: 1, md: 2}, "l"),
  Grid([
    Card([SectionHeader("Sessions vs conversions"),
      ScatterChart(
        [Series("Cohort A", [{x:1,y:2},{x:2,y:4},{x:3,y:5},{x:4,y:7}]),
         Series("Cohort B", [{x:1,y:3},{x:2,y:2},{x:3,y:6},{x:4,y:5}])],
        "Sessions (k)", "Conversions")
    ]),
    Card([SectionHeader("Response time"),
      Histogram([1,2,2,3,3,3,4,4,5,5,5,5,6,6,7,8,8,9], null, 6)
    ])
  ], {sm: 1, md: 2}, "l")
])`,
  },
  gridLayout: {
    label: "12-col grid + named args",
    code: `# Highlights: Grid(columns=12), GridItem(span="1/4"), inline name=value props.
sidebar = Card([
  CardHeader("Sidebar", "Named args: span='1/4'"),
  Stack([
    NavLink("Overview", "/", "ghost", true),
    NavLink("Reports", "/reports",   "ghost"),
    NavLink("Settings", "/settings", "ghost")
  ], "column", "s")
])

content = Card([
  CardHeader("Main workspace", "GridItem span='3/4' fills the rest"),
  TextContent("Use Grid(columns=12, gap='l', [...]) with GridItem(child, span='1/4') for sidebar layouts.")
])

root = Grid(columns=12, gap="l", [
  GridItem(sidebar, span="1/4"),
  GridItem(content, span="3/4")
])`,
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

// ---------------------------------------------------------------------------
// Bootstrap

const langSpec = getLanguageSpec();
const componentNames = new Set(langSpec.components.map((c) => c.name));

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
    name: "streaming-ui-script",
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
  function completions(ctx) {
    const word = ctx.matchBefore(/[\w@$]*/);
    if (!word) return null;
    if (word.from === word.to && !ctx.explicit) return null;

    const text = word.text;
    const options = [];

    // @builtins
    if (text.startsWith("@") || text === "") {
      for (const b of langSpec.builtins) {
        options.push({
          label: `@${b.name}`,
          type: "function",
          info: () => makeInfoPopup(b.signature, b.description, b.params),
          apply: `@${b.name}(`,
        });
      }
    }

    // Components
    if (!text.startsWith("@") && !text.startsWith("$")) {
      for (const c of langSpec.components) {
        const snippet = langSpec.snippets.find((s) => s.name === c.name);
        const apply = snippet
          ? autocomplete.snippet(snippet.template)
          : autocomplete.snippet(`${c.name}(\${})`);
        options.push({
          label: c.name,
          type: "class",
          detail: c.group,
          info: () => makeInfoPopup(c.signature, c.description, c.params),
          apply,
        });
      }
    }

    // Snippets (composite templates) — surface them as top-level completions
    for (const s of langSpec.snippets) {
      options.push({
        label: s.name + "…",
        type: "snippet",
        detail: "snippet",
        info: s.description,
        apply: autocomplete.snippet(s.template),
      });
    }

    // $variables — scan the program for stateRefs declared elsewhere.
    if (text.startsWith("$") || ctx.explicit) {
      const stateNames = scanStateRefs(ctx.state.doc.toString());
      for (const name of stateNames) {
        options.push({
          label: `$${name}`,
          type: "variable",
          detail: "$state",
        });
      }
    }

    // Theme names
    if (ctx.state.doc.lineAt(ctx.pos).text.match(/theme\s*=\s*$|"theme"\s*:\s*$|setTheme\(\s*$/)) {
      for (const t of langSpec.themeNames) {
        options.push({ label: `"${t}"`, type: "constant", detail: "theme" });
      }
    }

    return { from: word.from, options, validFor: /[\w@$]*/ };
  }

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

  function buildSpecTooltipDom(spec, kind, activeIndex) {
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

    const sig = document.createElement("code");
    sig.className = "pg-cm-sig";
    if (typeof activeIndex === "number" && spec.params.length > 0) {
      sig.append(document.createTextNode(`${kind === "builtin" ? "@" : ""}${spec.name}(`));
      spec.params.forEach((p, idx) => {
        if (idx > 0) sig.append(document.createTextNode(", "));
        const text = p.required ? p.name : `${p.name}?`;
        if (idx === Math.min(activeIndex, spec.params.length - 1)) {
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

    if (typeof activeIndex === "number" && spec.params.length > 0) {
      const param = spec.params[Math.min(activeIndex, spec.params.length - 1)];
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
    if (!resolved) return null;
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
    return {
      pos: sel.head,
      above: true,
      strictSide: false,
      arrow: false,
      create() {
        const dom = document.createElement("div");
        dom.className = "pg-cm-tooltip";
        dom.append(buildSpecTooltipDom(resolved.spec, resolved.kind, call.argIndex));
        return { dom };
      },
    };
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
  customElements.whenDefined("streaming-ui-script").then(() => {
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
  $("pg-reset").addEventListener("click", () => loadExample(currentExample, true));
  $("pg-help").addEventListener("click", openHelp);
  $("pg-modal-backdrop").addEventListener("click", (e) => {
    if (e.target === $("pg-modal-backdrop")) closeHelp();
  });
  $("pg-fullscreen").addEventListener("click", toggleFullscreen);
  $("pg-status-errors").addEventListener("click", jumpToFirstError);
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

  function jumpToFirstError() {
    if (parseErrors.length === 0) return;
    const err = parseErrors[0];
    const lineNum = Math.min(Math.max(1, err.line || 1), editorView.state.doc.lines);
    const line = editorView.state.doc.line(lineNum);
    const col = Math.min(Math.max(0, (err.column || 1) - 1), line.length);
    editorView.dispatch({
      selection: { anchor: line.from + col },
      scrollIntoView: true,
    });
    editorView.focus();
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
        node.tagName !== "STREAMING-UI-SCRIPT" &&
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
        node.tagName !== "STREAMING-UI-SCRIPT",
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
