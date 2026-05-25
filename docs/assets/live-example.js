/**
 * 
 * The shell page (docs/live-example.html) loads this single module to render
 * any of the bundled live examples on demand via the `?example=<slug>` query
 * parameter. Each example's setup script keeps the original
 * `document.getElementById("rui-<id>")` / `document.getElementById("src-<id>")`
 * references; the bootstrapper builds the matching DOM before the setup runs.
 */

const EXAMPLES = {
  "content-studio": {
    slug: "content-studio",
    docTitle: `Content studio · Aktion`,
    eyebrow: `Live demo · editors + advanced forms`,
    heroTitleHtml: `A CMS-style studio: RichTextEditor, CodeEditor, MultiStepForm, and every advanced input`,
    heroDescriptionHtml: `A complete content authoring surface — write the body in
        <code>RichTextEditor</code>, paste a snippet into
        <code>CodeEditor</code>, pick a brand colour with
        <code>ColorPicker</code>, manage tags with <code>TagInput</code>,
        mention teammates via <code>MentionInput</code>, run a release
        wizard with <code>MultiStepForm</code>, and gate publish with
        <code>PinInput</code>/<code>OtpInput</code>. The whole form is
        validated through <code>ValidationSummary</code>, grouped by
        <code>FormSection</code>/<code>FieldSet</code>, and wrapped in
        the new <code>TopBar</code>+<code>BreadcrumbPageHeader</code>.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · content studio`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Every input writes back into a <code>$variable</code>, so the
        preview card on the right reflects the document in real time.
        Switch wizard steps with the <code>MultiStepForm</code> stepper —
        each step's content is just an array of controls.`,
      codeBlocks: [
      { codeId: "src-studio", content: `$title = "Streaming UI v3 — release notes"
$body = "&lt;h2&gt;What's new&lt;/h2&gt;&lt;p&gt;Thirty new components — &lt;b&gt;DataGrid&lt;/b&gt;, &lt;b&gt;CalendarView&lt;/b&gt;, &lt;b&gt;RichTextEditor&lt;/b&gt;, six charts, and a media stack.&lt;/p&gt;&lt;p&gt;Read on for the highlights.&lt;/p&gt;"
$snippet = "import { defineElement } from 'aktion'\\n\\ndefineElement()\\n"
$tags = ["release", "ui", "v3"]
$mention = "Heads up @"
$brand = "#6366f1"
$pin = ""
$otp = ""
$pwd = ""
$phone = ""
$publishAt = "2026-06-01T09:00"
$slot = "09:30"
$step = 0
$published = false

topbar = TopBar(
  "Acme CMS · Studio",
  "Draft · autosaved 12s ago",
  [Badge("v3 release", "primary", "tag", "sm"), StatusDot("Realtime", "success", true)],
  [SearchBar("q", "Search posts, drafts, schedules…", null, "/")],
  [Button("Preview", null, "ghost",   "button", "small", "eye"),
   Button("Publish", () => { $published = true; emit "assistant-message" { message: "Publish the post" } }, "primary", "button", "small", "rocket")]
)

header = PageHeader(
  ["Workspace", "Content", "Drafts", $title],
  "Compose, brand, schedule, and gate the release in one place.",
  [Button("Save draft", null, "ghost",   "button", "small", "floppy-disk"),
   Button("Discard",    () => { $title = ""; $body = ""; $tags = ""; $snippet = "" },"danger",  "button", "small", "trash")]
)

teammates = [
  {name: "Ada Lovelace",   handle: "ada",     role: "Engineering"},
  {name: "Linus Torvalds", handle: "linus",   role: "Kernel"},
  {name: "Grace Hopper",   handle: "grace",   role: "Compilers"},
  {name: "Margaret Hamilton", handle: "margaret", role: "Apollo"}
]

bodyEditor = Card([
  SectionHeader("Body", "Rich text — drag images, paste markdown, mention people", "EDITOR"),
  FormSection("Post copy",
    [
      FormControl("Title", Input("title", "Catchy headline…", "text", null, $title)),
      FormControl("Body",  RichTextEditor("body", $body, "Start composing…", "260px")),
      FormControl("Tags",  TagInput("tags", $tags, "Press enter to add a tag", 10)),
      FormControl("Mention", MentionInput("mention", teammates, $mention, "Type @ to ping someone…"))
    ],
    "All fields stream into the preview pane below.")
])

snippetEditor = Card([
  SectionHeader("Code snippet", "Embedded in the release notes", "CODE"),
  CodeEditor("snippet", $snippet, "javascript", "// type your code…", "200px")
])

brandSection = Card([
  SectionHeader("Brand", "Choose the accent for this release", "DESIGN"),
  FieldSet("Visual",
    [FormControl("Accent",   ColorPicker("brand", $brand, "Pick a colour", ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6"])),
     FormControl("Phone",    MaskedInput("phone", "(999) 999-9999", $phone, "(415) 555-0114")),
     FormControl("Password", PasswordInput("pwd",  $pwd, "Choose a strong password", null, true))],
    "Used for callouts and CTA buttons in the published post.")
])

scheduleSection = Card([
  SectionHeader("Schedule", "When should this go live?", "TIMING"),
  Stack([
    FormControl("Publish at", DateTimePicker("publishAt", $publishAt, "Launch window")),
    FormControl("Daily slot", TimePicker("slot", $slot, "Newsletter time"))
  ], "row", "m")
])

gateSection = Card([
  SectionHeader("Two-factor publish", "Confirm with a one-time code", "GATE",
    Badge("Required", "warning", "shield-halved", "sm")),
  Stack([
    FormControl("4-digit PIN", PinInput("pin", 4, $pin, "numeric")),
    FormControl("OTP from authenticator", PinInput("otp", $otp, 6))
  ], "column", "m")
])

formErrors = [
  if $title == "" { {label: "title",   message: "Title is required."} } else { null },
  if $pin.length != 4 { {label: "pin",     message: "PIN must be 4 digits."} } else { null },
  if $otp.length != 6 { {label: "otp",     message: "Enter the 6-digit OTP."} } else { null }
]

validationCard = if @Count(@Filter(formErrors, "label", "!=", null)) > 0 { Card([ValidationSummary(@Filter(formErrors, "label", "!=", null), "Fix these before publishing")]) } else { Card([Callout("success", "Ready to publish", "All gates passed — hit Publish to go live.", "circle-check", true)]) }

wizardSteps = [
  {title: "Compose",  details: "Title, body, tags", content: [bodyEditor, snippetEditor]},
  {title: "Brand",    details: "Accent + contact",  content: [brandSection]},
  {title: "Schedule", details: "Pick a window",      content: [scheduleSection]},
  {title: "Confirm",  details: "PIN + OTP",          content: [gateSection, validationCard]}
]

wizard = MultiStepForm(wizardSteps, $step, () => { $published = true; emit "assistant-message" { message: "Wizard submitted" } })

tagBadges = Stack(for t in $tags { Badge(t, "primary", "tag", "sm") }, "row", "xs")

previewCard = Card([
  SectionHeader("Live preview", $title, "OUTPUT",
    Badge(\`Accent \${$brand}\`, "primary", "palette", "sm")),
  tagBadges,
  Separator("horizontal"),
  Text($body, "body")
])

teammateChips = Stack(
  for {name, handle, role} in teammates { PersonChip(name, role, null, "sm") },
  "row", "s"
)

teammatesCard = Card([
  SectionHeader("Available reviewers", "Mention them in the body", "PEOPLE"),
  teammateChips
])

publishedBanner = if $published { Banner("Published!", \`\${$title} went live.\`, Button("View live post", () => { js{ window.open("/blog", "_blank", "noopener,noreferrer") } }, "primary", "button", "small"), "rocket", "success") } else { null }

contentGrid = Grid([wizard, Stack([previewCard, teammatesCard], "column", "l")], {sm: 1, lg: 2}, "l")

followUps = FollowUpBlock([
  FollowUpItem("Generate a summary for social"),
  FollowUpItem("Translate to French"),
  FollowUpItem("Add a hero image")
], "Try next")

_app_ = Stack([
  topbar,
  header,
  publishedBanner,
  contentGrid,
  followUps
], "column", "l")` }
      ],
      render: { elId: "rui-studio", theme: "light" },
      extraHtml: ``,
    },
    {
      id: null,
      heading: `What's powerful here`,
      lede: `<code>MultiStepForm</code> renders the four-step wizard, manages
        previous/next via the <code>$step</code> variable, and submits
        through one <code>Action</code>. <code>ValidationSummary</code>
        derives its messages from a single <code>@Filter</code> chain —
        no manual error wiring. <code>RichTextEditor</code> and
        <code>CodeEditor</code> are real contenteditable/textarea editors
        with the design system's chrome, so they look at home in the same
        page as the inputs. <code>TopBar</code> +
        <code>BreadcrumbPageHeader</code> replace the ad-hoc topbar +
        breadcrumb hand-roll seen in earlier examples.`,
      codeBlocks: [
      ],
      render: null,
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-studio");
    el.setResponse(document.getElementById("src-studio").textContent);
    }
  },
  "data-explorer": {
    slug: "data-explorer",
    docTitle: `Data explorer · Aktion`,
    eyebrow: `Live demo · DataGrid + 6 charts`,
    heroTitleHtml: `A full analytics surface — DataGrid, Heatmap, Radar, Scatter, Histogram, Gauge, Area`,
    heroDescriptionHtml: `One workspace that puts every <em>new</em> data primitive to work:
        a sortable, paginated <code>DataGrid</code> with bulk-action
        toolbar, a <code>Gauge</code> for SLA, an <code>AreaChart</code> for
        trend, a <code>Heatmap</code> for activity-by-hour, a
        <code>RadarChart</code> for vendor comparison, a
        <code>ScatterChart</code> for cohort behaviour, a
        <code>Histogram</code> for response times, plus an
        <code>InfiniteList</code> activity feed and an
        <code>AuditTrail</code>.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · data explorer`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Click a column header to sort. Toggle selection checkboxes — the
        bulk toolbar appears with a live count. Every metric, chart, and
        gauge stays in sync.`,
      codeBlocks: [
      { codeId: "src-explorer", content: `$page = 1
$sort = {key: "Score", direction: "desc"}
$selectedIds = []
$tab = "grid"

contributors = [
  {id: "u01", name: "Ada Lovelace",   team: "Compilers", role: "Staff",    score: 98, commits: 412, latencyMs: 84,  signups: [12, 18, 25, 31, 42, 50, 58]},
  {id: "u02", name: "Linus Torvalds", team: "Kernel",    role: "Principal",score: 96, commits: 380, latencyMs: 112, signups: [10, 14, 20, 28, 36, 44, 52]},
  {id: "u03", name: "Grace Hopper",   team: "Compilers", role: "Director", score: 95, commits: 358, latencyMs: 78,  signups: [ 8, 12, 17, 24, 30, 38, 45]},
  {id: "u04", name: "Margaret Hamilton","team":"Apollo",  role: "Director", score: 94, commits: 340, latencyMs: 95,  signups: [ 9, 13, 19, 26, 32, 40, 48]},
  {id: "u05", name: "Donald Knuth",   team: "Algorithms",role: "Principal",score: 93, commits: 322, latencyMs: 110, signups: [ 7, 11, 16, 22, 28, 35, 42]},
  {id: "u06", name: "Edsger Dijkstra","team":"Algorithms",role: "Principal",score: 92, commits: 310, latencyMs: 102, signups: [ 6, 10, 15, 21, 27, 33, 40]},
  {id: "u07", name: "Anita Borg",     team: "Systems",   role: "Director", score: 91, commits: 296, latencyMs: 88,  signups: [ 5,  9, 14, 20, 26, 32, 38]},
  {id: "u08", name: "Tim Berners-Lee","team": "Web",      role: "Principal",score: 90, commits: 284, latencyMs: 124, signups: [ 4,  8, 13, 19, 25, 31, 37]},
  {id: "u09", name: "Barbara Liskov", team: "Compilers", role: "Distinguished",score: 89, commits: 272, latencyMs: 90,  signups: [ 3,  7, 12, 18, 24, 30, 36]},
  {id: "u10", name: "Vint Cerf",      team: "Network",   role: "Principal", score: 88, commits: 260, latencyMs: 116, signups: [ 2,  6, 11, 17, 23, 29, 35]},
  {id: "u11", name: "Radia Perlman",  team: "Network",   role: "Distinguished",score: 87, commits: 248, latencyMs: 95,  signups: [ 1,  5, 10, 16, 22, 28, 34]},
  {id: "u12", name: "Hedy Lamarr",    team: "RF",        role: "Senior",   score: 86, commits: 236, latencyMs: 130, signups: [ 0,  4,  9, 15, 21, 27, 33]}
]

cols = [
  Col("Id",     contributors.id,        "text",     "left",  false, false),
  Col("Name",   contributors.name,      "text",     "left",  true,  true),
  Col("Team",   contributors.team,      "text",     "left",  true,  true),
  Col("Role",   contributors.role,      "text",     "left",  true,  true),
  Col("Score",  contributors.score,     "number",   "right", true,  false),
  Col("Commits",contributors.commits,   "number",   "right", true,  false)
]

bulkToolbar = if @Count($selectedIds) > 0 { Toolbar(
    [Badge(\`\${@Count($selectedIds)} selected\`, "primary", "check", "sm")],
    [Button("Email selected", null, "ghost",   "button", "small", "envelope"),
     Button("Export CSV",     null,       "secondary","button", "small", "file-csv"),
     Button("Clear",          () => { $selectedIds = "" },                        "ghost",   "button", "small")]
  ) } else { null }

leaderboard = Card([
  SectionHeader("Top contributors", \`\${@Count(contributors)} engineers · sorted by \${$sort.key} \${$sort.direction}\`,
    "DATAGRID",
    Badge("Live", "success", "circle", "sm"),
    [Button("Search",  null,  "ghost", "button", "small", "magnifying-glass"),
     Button("Refresh", null, "ghost", "button", "small", "rotate-right")]),
  bulkToolbar,
  DataGrid(cols, contributors.id, null, $sort, $selectedIds, true, $page, 6, "No contributors match")
])

slaGauge = Card([
  SectionHeader("SLA · uptime", "Rolling 30 days", "RELIABILITY"),
  Gauge(99.3, 95, 100, "Above target", "success", "lg")
])

p95Gauge = Card([
  SectionHeader("P95 response", "Lower is better", "PERFORMANCE"),
  Gauge(112, 0, 250, "ms", "primary", "lg")
])

errorGauge = Card([
  SectionHeader("Error rate", "Last 24h", "QUALITY"),
  Gauge(0.42, 0, 5, "% of requests", "warning", "lg")
])

areaCard = Card([
  SectionHeader("Signups · last 7 days", "Stacked by source", "GROWTH",
    Badge("+18% WoW", "success", "arrow-trend-up", "sm")),
  LineChart(
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    [Series("Organic", [40, 52, 65, 78, 92, 105, 124]),
     Series("Referral",[20, 28, 35, 42, 50, 60,  72]),
     Series("Paid",    [10, 14, 18, 24, 30, 36,  44])],
    null
  )
])

heatmapCard = Card([
  SectionHeader("Office capacity by hour", "Mon–Fri average", "OCCUPANCY"),
  Heatmap(
    ["Mon", "Tue", "Wed", "Thu", "Fri"],
    ["9am", "12pm", "3pm", "6pm"],
    [[ 3,  4,  5,  3,  2],
     [ 8,  9, 11,  7,  5],
     [12, 14, 16, 13, 10],
     [ 6,  7,  9, 10, 12]]
  )
])

radarCard = Card([
  SectionHeader("Vendor scorecard", "Two finalists, five axes", "PROCUREMENT"),
  RadarChart(
    ["Speed", "Quality", "Cost", "Coverage", "Trust"],
    [Series("Atlas Cloud",   [80, 70, 60, 75, 85]),
     Series("Northwind SaaS",[60, 85, 70, 65, 80])]
  )
])

scatterCard = Card([
  SectionHeader("Sessions vs conversions", "By cohort, last 4 weeks", "FUNNEL"),
  ScatterChart(
    [Series("Cohort A", [{x: 1, y: 2}, {x: 2, y: 4}, {x: 3, y: 5}, {x: 4, y: 7}]),
     Series("Cohort B", [{x: 1, y: 3}, {x: 2, y: 2}, {x: 3, y: 6}, {x: 4, y: 5}])],
    "Sessions (k)",
    "Conversions"
  )
])

histogramCard = Card([
  SectionHeader("Response time distribution", "P50–P99 envelope", "LATENCY"),
  Histogram(
    contributors.latencyMs,
    null, 8
  )
])

chartGrid = Grid([areaCard, heatmapCard], {sm: 1, md: 2}, "l")
chartGrid2 = Grid([radarCard, scatterCard, histogramCard], {sm: 1, md: 3}, "l")
gaugeGrid  = Grid([slaGauge, p95Gauge, errorGauge], {sm: 1, md: 3}, "l")

activityCard = Card([
  SectionHeader("Recent activity", "Latest 6 events", "FEED"),
  InfiniteList([
    ListItem("Ada Lovelace merged PR #142", "Streaming UI v2 components.", "code-merge"),
    ListItem("Linus Torvalds opened ticket #2049", "Kernel scheduler regression.", "circle-exclamation"),
    ListItem("Grace Hopper deployed compiler 4.2", "Latency improved 8%.", "rocket"),
    ListItem("Margaret Hamilton reviewed PR #141", "LGTM with one nit.", "circle-check"),
    ListItem("Donald Knuth published article", "On the art of computer programming.", "newspaper"),
    ListItem("Edsger Dijkstra commented", "Beware of bugs in the above code.", "comment")
  ], null, false, true)
])

auditCard = Card([
  SectionHeader("Audit trail", "Privileged actions, last 7 days", "AUDIT",
    Badge("Compliance", "primary", "shield-halved", "sm")),
  ActivityLog([
    {actor: "system",  title: "Rotated signing key",          time: "08:14",      icon: "key",          tone: "primary", meta: "kid=abc123 ip=10.0.0.4"},
    {actor: "admin",   title: "Granted Owner role to Ada",    time: "yesterday",  icon: "user-shield",  tone: "success", meta: "actor=u_8132 ip=82.32.1.7"},
    {actor: "scanner", title: "Blocked suspicious sign-in",   time: "2 days ago", icon: "shield-halved",tone: "danger",  meta: "ua=ChromeHeadless ip=tor"},
    {actor: "system",  title: "Backup completed",             time: "3 days ago", icon: "database",     tone: "success", meta: "size=1.2TB encrypted"}
  ])
])

bottomGrid = Grid([activityCard, auditCard], {sm: 1, md: 2}, "l")

kpiStrip = Stats([
  StatCard("Contributors", \`\${@Count(contributors)}\`,                      "up",   "+2 this week", "users"),
  StatCard("Commits",      \`\${@Format(@Sum(contributors.commits, "number"))}\`, "up",   "+184 today",   "code-commit"),
  StatCard("Avg latency",  \`\${@Round(@Avg(contributors.latencyMs), 0)}ms\`, "down", "-12 ms",       "gauge-high"),
  StatCard("Top score",    \`\${@Max(contributors.score)}\`,                  "flat", "Ada Lovelace", "trophy")
])

pageHeader = PageHeader(
  "Engineering analytics",
  \`\${@Count(contributors)} contributors · \${@Sum(contributors.commits)} commits this month\`,
  ["Workspace", "Engineering", "Analytics"],
  [Button("Export PDF", null, "secondary"),
   Button("Share view", null,             "primary")],
  Badge("Realtime", "success", "circle", "sm")
)

_app_ = Stack([
  pageHeader,
  kpiStrip,
  gaugeGrid,
  leaderboard,
  chartGrid,
  chartGrid2,
  bottomGrid
], "column", "l")` }
      ],
      render: { elId: "rui-explorer", theme: "light" },
      extraHtml: ``,
    },
    {
      id: null,
      heading: `What's powerful here`,
      lede: `<code>DataGrid</code> ships with a sticky header, sortable
        columns, per-column filter chips, row selection (the toolbar
        renders only when <code>@Count($selectedIds) &gt; 0</code>), and
        built-in pagination via <code>$page</code>. The six charts share
        the same <code>Series([...])</code> grammar — swap in a
        <code>$foo.data</code> result from <code>http({...})</code> and they all redraw. The
        <code>Gauge</code>, <code>Heatmap</code>, <code>RadarChart</code>,
        <code>ScatterChart</code>, <code>Histogram</code>, and
        <code>AreaChart</code> are all SVG primitives so they print
        cleanly and stay sharp on retina.`,
      codeBlocks: [
      ],
      render: null,
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-explorer");
    el.setResponse(document.getElementById("src-explorer").textContent);
    }
  },
  "media-gallery": {
    slug: "media-gallery",
    docTitle: `Media gallery · Aktion`,
    eyebrow: `Live demo · media + maps`,
    heroTitleHtml: `Carousel, Gallery, Lightbox, Video, Audio &amp; Map — in one program`,
    heroDescriptionHtml: `A travel-magazine layout that puts every new media primitive to
        work — <code>Carousel</code> hero slides, a thumbnail
        <code>Gallery</code> wired to a click-to-zoom <code>Lightbox</code>,
        a <code>VideoPlayer</code> trailer, an <code>AudioPlayer</code>
        soundtrack, and a Leaflet-backed <code>Map</code> with the
        itinerary pinned. No imperative wiring — every interaction is a
        <code>$variable</code> update.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · media gallery`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Tap a thumbnail to open the lightbox, drag through the carousel,
        or hit play on the trailer — every transition is reactive state.`,
      codeBlocks: [
      { codeId: "src-media", content: `$slide = 0
$lightboxOpen = false
$lightboxIdx = 0

photos = [
  {src: "https://picsum.photos/seed/aurora-cliffs/1200/700",  caption: "Cliff face at dawn"},
  {src: "https://picsum.photos/seed/aurora-village/1200/700", caption: "Fishing village morning"},
  {src: "https://picsum.photos/seed/aurora-forest/1200/700",  caption: "Boreal forest"},
  {src: "https://picsum.photos/seed/aurora-lake/1200/700",    caption: "Glacier lake reflection"},
  {src: "https://picsum.photos/seed/aurora-fjord/1200/700",   caption: "Fjord at golden hour"},
  {src: "https://picsum.photos/seed/aurora-aurora/1200/700",  caption: "Northern lights"}
]

heroCarousel = Carousel(
  for {src, caption} in photos { {src: src, alt: caption, caption: caption} },
  $slide,
  "16:9",
  true
)

galleryGrid = Gallery(
  for {src, caption} in photos { {src: src, alt: caption, caption: caption} },
  3,
  () => { $lightboxIdx = 0; $lightboxOpen = true }
)

zoomBox = Lightbox(
  $lightboxOpen,
  $lightboxIdx,
  photos
)

trailerCard = Card([
  SectionHeader("Trailer · Aurora Expedition", "60-second highlight reel", "WATCH",
    Badge("HD", "primary", "video", "sm")),
  VideoPlayer(
    "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
    null, true, false, false, false,
    "Aurora Expedition · trailer",
    "16:9"
  )
])

soundtrackCard = Card([
  SectionHeader("Trip soundtrack", "Pre-departure playlist", "LISTEN",
    Badge("3 tracks", "info", "music", "sm")),
  AudioPlayer(
    "https://upload.wikimedia.org/wikipedia/commons/b/b4/Bach_-_Cello_Suite_No._5_-_1._Prelude.ogg",
    null, "Northern Skies", "Aurora Strings"
  )
])

mapCard = Card([
  SectionHeader("Itinerary map", "Six stops · 8 days", "ROUTE",
    Badge("Leaflet", "primary", "map-location-dot", "sm")),
  Map(
    65.0, -16.0, 5,
    [
      {lat: 64.1466, lng: -21.9426, label: "Day 1 · Reykjavík"},
      {lat: 64.2538, lng: -21.0186, label: "Day 2 · Þingvellir"},
      {lat: 64.7140, lng: -19.0608, label: "Day 3 · Highlands"},
      {lat: 65.6839, lng: -18.0907, label: "Day 5 · Akureyri"},
      {lat: 66.0410, lng: -23.1247, label: "Day 6 · Westfjords"},
      {lat: 64.9631, lng: -19.0208, label: "Day 8 · Vatnajökull"}
    ],
    "360px",
    "Aurora expedition itinerary"
  )
])

kpis = Stats([
  StatCard("Photos",   \`\${@Count(photos)}\`, "flat", "Curated", "image"),
  StatCard("Duration",  "8 days",            "flat", "Round-trip", "calendar-days"),
  StatCard("Locations", "6 stops",           "up",   "+2 vs last tour", "location-dot"),
  StatCard("Group size", "12 max",           "flat", "Small-group format", "people-group")
])

hero = Hero(
  "Aurora Expedition",
  "Eight days chasing the northern lights across Iceland's most photogenic ridgelines, fjords, and ice caves.",
  null,
  null,
  "FIELD GUIDE · v3",
  null,
  "https://picsum.photos/seed/aurora-cover/1600/600",
  "Aug — Sept 2026 · from $4,890",
  "360px",
  [Button("Reserve a spot",   null, "primary"),
   Button("Download brief",   () => { js{ window.open("/aurora-brief.pdf", "_blank", "noopener,noreferrer") } }, "ghost")],
  "cover",
  "primary"
)

galleryBlock = Card([
  SectionHeader("Photo gallery", "Tap any tile to view full size", "PHOTOS",
    Badge(\`\${@Count(photos)} photos\`, "primary", "image", "sm")),
  galleryGrid
])

mediaRow = Grid([trailerCard, soundtrackCard], {sm: 1, md: 2}, "l")

followUps = FollowUpBlock([
  FollowUpItem("Show me the day-by-day itinerary"),
  FollowUpItem("What gear should I bring?"),
  FollowUpItem("Add a 2-day Reykjavík extension")
], "Plan your trip")

_app_ = Stack([
  hero,
  kpis,
  Card([SectionHeader("Daily highlights", "Aurora · summer 2026", "PREVIEW",
    Badge("Live", "success", "circle", "sm")), heroCarousel]),
  galleryBlock,
  mediaRow,
  mapCard,
  followUps,
  zoomBox
], "column", "l")` }
      ],
      render: { elId: "rui-media", theme: "light" },
      extraHtml: ``,
    },
    {
      id: null,
      heading: `What's powerful here`,
      lede: `<code>Gallery</code> and <code>Lightbox</code> share the same
        <code>photos</code> array — clicking a thumbnail flips
        <code>$lightboxOpen</code> and lifts the same image to full size.
        <code>Map</code> pins are a plain array of
        <code>{lat, lng, label}</code> objects; swap them for a
        <code>$itinerary.data</code> result from <code>http({...})</code> and the route updates
        live. <code>VideoPlayer</code> and <code>AudioPlayer</code> are
        thin wrappers around the native <code>&lt;video&gt;</code> and
        <code>&lt;audio&gt;</code> elements, so they inherit the host
        browser's playback UI while picking up the design system's
        chrome.`,
      codeBlocks: [
      ],
      render: null,
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-media");
    el.setResponse(document.getElementById("src-media").textContent);
    }
  },
  "routing-demo": {
    slug: "routing-demo",
    docTitle: `Live demo · Routing · Aktion`,
    eyebrow: `Live demo · _router_({…}) + NavLink`,
    heroTitleHtml: `A multi-page app, in a single Aktion program`,
    heroDescriptionHtml: `One <code>&lt;aktion-app&gt;</code> tag renders a four-page UI
        synced to the URL hash. Click the nav, use deep links, hit the browser
        back button — it all stays in sync, with zero framework lock-in.`,
    brandHref: "examples.html",
    brandText: `Aktion · routing`,
    backHref: "routing.html",
    backText: `← Routing docs`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Try <a href="#/dashboard">#/dashboard</a>,
        <a href="#/users">#/users</a>, then drill into a user (e.g.
        <a href="#/users/ada">#/users/ada</a>). Browser back / forward and
        bookmarks all work.`,
      codeBlocks: [
      ],
      render: { elId: "rui-routing", theme: "light" },
      extraHtml: ``,
    },
    {
      id: null,
      heading: `UI Script source`,
      lede: `The <code>nav</code> stays visible across every page;
        <code>main</code> is produced by
        <code>_router_({ … })</code>, which swaps in the matching arm.
        Path parameters land in <code>params</code> inside each arm
        body, and the reserved <code>_route_</code> handle exposes the
        reactive surface everywhere else (and the imperative
        <code>_route_.navigate(path)</code> method).`,
      codeBlocks: [
      { codeId: "src-routing", content: `$users = [
  {id: "ada",   name: "Ada Lovelace", role: "Founding engineer",   joined: "2019-04-02"},
  {id: "grace", name: "Grace Hopper", role: "Compiler researcher", joined: "2020-01-15"},
  {id: "lin",   name: "Lin-Manuel",   role: "Product designer",    joined: "2021-08-21"},
  {id: "ken",   name: "Ken Thompson", role: "Platform engineer",   joined: "2018-11-04"}
]

$visits = 0
$lastEdited = "—"

_app_ = Stack([header, nav, main])

header = Card([
  CardHeader("Acme console", \`Routing demo · current path: \${_route_}\`),
  Stack([
    Badge(\`_route_ = \${_route_}\`, "info",    "compass", "sm"),
    Badge(\`visits = \${$visits}\`,  "neutral", "eye",     "sm")
  ], "row", "xs")
])

nav = Card([
  Stack([
    NavLink("Home",      "/",          "ghost", true,  "house"),
    NavLink("Dashboard", "/dashboard", "ghost", false, "chart-pie"),
    NavLink("Users",     "/users",     "ghost", false, "users"),
    NavLink("Settings",  "/settings",  "ghost", false, "gear")
  ], "row", "s")
])

main = _router_({
  "/":           homePage,
  "/dashboard":  dashboardPage,
  "/users":      usersListPage,
  "/users/:id":  userDetailPage(id: params.id),
  "/settings":   settingsHomePage,
  "/settings/*": settingsAreaPage(rest: params._),
  default:       notFoundPage
})

homePage = Card([
  CardHeader("Welcome", "A multi-page UI in one Aktion program"),
  Markdown("Pick a section above, or jump straight in:"),
  Buttons([
    Button("Open dashboard", () => { _route_.navigate("/dashboard") },  "primary"),
    Button("Browse users",   () => { _route_.navigate("/users") },      "secondary"),
    Button("Open Ada",       () => { _route_.navigate("/users/ada") },  "ghost")
  ])
])

dashboardPage = Card([
  CardHeader("Dashboard", "Reactive across routes"),
  Stack([
    StatCard("Users",     \`\${@Count($users)}\`, "up", "+2 this month"),
    StatCard("Visits",    \`\${$visits}\`,        "up", "this session"),
    StatCard("Last edit", $lastEdited)
  ], "row", "m", "stretch", "start", true),
  Buttons([
    Button("Track a visit", () => { $visits = $visits + 1 }, "primary"),
    Button("Back to home",  () => { _route_.navigate("/") },               "ghost")
  ])
])

component UserRow(id, name, role, joined) {
  return Card([
    Stack([
      Stack([
        Text(name, "body-heavy"),
        Text(\`\${role} · joined \${joined}\`, "small", "muted")
      ]),
      Buttons([Button("Open", () => { _route_.navigate(\`/users/\${id}\`) }, "ghost")])
    ], "row", "m", "center", "between")
  ], "outlined")
}

usersListPage = Card([
  CardHeader("Users", "Click a row to deep-link into the detail page"),
  Stack(for {id, name, role, joined} in $users { UserRow(id, name, role, joined) })
])

component userDetailPage(id) {
  return Card([
    CardHeader(\`User \${id}\`, "Deep-linkable detail page"),
    Markdown(\`Path parameter: **\${id}** · open URL: \\\`#/users/\${id}\\\`\`),
    Buttons([
      Button("Back to users", () => { _route_.navigate("/users") },                                "ghost"),
      Button("Mark edited",   () => { $lastEdited = id; _route_.navigate("/dashboard") },           "primary")
    ])
  ])
}

settingsHomePage = Card([
  CardHeader("Settings", "Wildcard nested route below"),
  Stack([
    NavLink("Profile",       "/settings/profile",       "pill"),
    NavLink("Notifications", "/settings/notifications", "pill"),
    NavLink("Security",      "/settings/security",      "pill")
  ], "row", "s"),
  Text("Pick a sub-section above — it's matched by /settings/*.", "small", "muted")
])

# \`params._\` holds whatever comes after \`/settings/\` — captured into \`rest\` above.
component settingsAreaPage(rest) {
  return Card([
    CardHeader(\`Settings · \${rest}\`, "Sub-section captured by wildcard"),
    Text(\`params._ = \${rest}\`),
    Buttons([Button("Back to settings", () => { _route_.navigate("/settings") }, "ghost")])
  ])
}

notFoundPage = Callout("warning", "Not found", \`No page matches \${_route_}. Use the nav above or go back to /.\`)` }
      ],
      render: null,
      extraHtml: ``,
    },
    {
      id: null,
      heading: `How it works`,
      lede: ``,
      codeBlocks: [
      ],
      render: null,
      extraHtml: `<ul>
        <li>
          The renderer always starts the built-in router. The reactive
          <code>_route_</code> handle is exposed everywhere (with
          <code>_route_.path</code>, <code>_route_.params</code>,
          <code>_route_.query</code>) and the routing section is part of
          the generated system prompt by default.
        </li>
        <li>
          <code>nav</code> is rendered once at the top of <code>root</code> so
          it stays visible across every page. <code>NavLink</code>s reflect
          <code>data-active="true"</code> automatically — the home link uses
          <code>exact=true</code> so it doesn't light up on every path.
        </li>
        <li>
          <code>_router_({ … })</code> picks exactly one arm per render
          based on <code>window.location.hash</code>. The
          <code>"/"</code> arm and the <code>default:</code> catch-all
          guarantee something is always rendered.
        </li>
        <li>
          Inside <code>userDetailPage</code> and <code>settingsAreaPage</code>,
          the <code>params</code> loop variable is automatically injected by
          the evaluator — no extra wiring needed. <code>params._</code> holds
          the wildcard remainder.
        </li>
        <li>
          <code>NavLink(label, to: "/path")</code> is the declarative way
          to move; the imperative <code>el.navigate("/path")</code> works
          from JS (see the <code>Open</code> button in the users list,
          which captures <code>u.id</code> per row).
        </li>
        <li>
          A persistent <code>$visits</code> counter shows that the rest of the
          state model keeps working untouched — routing is additive, not
          intrusive.
        </li>
      </ul>`,
    }
    ],
    setup(){
const el = document.getElementById("rui-routing");
    el.setResponse(document.getElementById("src-routing").textContent);

    el.addEventListener("route-change", (event) => {
      console.log("[routing-demo] route-change", event.detail);
    });
    }
  },
  "settings-app": {
    slug: "settings-app",
    docTitle: `Settings app · Aktion`,
    eyebrow: `Live demo · rich patterns + two-way binding`,
    heroTitleHtml: `A full settings & preferences screen, driven by two-way bound primitives`,
    heroDescriptionHtml: `Tabs across the top, a <code>PageHeader</code> with breadcrumbs, a
        usage progress bar, switches and toggle groups for preferences,
        keyboard shortcut chips, and a slide-in <code>Sheet</code> for
        confirming the dangerous "delete workspace" action. Every control
        binds straight to a <code>$variable</code> — no
        <code>js{}</code> block needed.`,
    brandHref: "examples.html",
    brandText: `Aktion · settings app`,
    backHref: "examples.html",
    backText: `← Back to docs`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Flip the switches, change the theme, hit "Save changes" — the save
        progress bar animates and a banner confirms. "Delete workspace"
        opens a confirmation sheet.`,
      codeBlocks: [
      { codeId: "src-settings", content: `$tab = "general"
$theme = "light"
$accent = "indigo"
$density = "comfortable"
$language = "en"
$notifications = true
$autosave = true
$weeklyDigest = true
$mentionEmails = false
$shareUsage = true
$deleting = false
$saveStatus = "idle"

usage          = {storageUsed: 0, storageMax: 100, seatsUsed: 0, seatsMax: 0, planLabel: "", renews: ""}

action saveSettings() {
  $saveStatus = "saving"
  $saved = http({ url: "/api/settings", method: "PUT", body: { theme: $theme, accent: $accent }, headers: { "Content-Type": "application/json" } })
  $saveStatus = "saved"
}

action deleteWorkspace() {
  $deleted = http({ url: "/api/workspace", method: "DELETE" })
  $deleting = false
  emit "assistant-message" { message: "Workspace deleted" }
}

saveBanner = match $saveStatus {
  "saving": Banner("Saving…", "Hang tight while we sync your preferences.", null, "spinner", "info")
  "saved": Banner("Saved",    "Your preferences are up to date.",           null, "circle-check", "success")
}

header = PageHeader(
  "Settings",
  "Personalise your workspace",
  Breadcrumb([BreadcrumbItem("Workspace", "#"), BreadcrumbItem("Settings")]),
  [
    Button("Cancel",       null,           "ghost"),
    Button("Save changes", saveSettings,   "primary")
  ],
  Badge(usage.planLabel, "primary", null, "sm")
)

usageCard = Card([
  CardHeader("Workspace usage", \`Renews \${usage.renews}\`),
  Stats([
    StatCard("Storage", \`\${usage.storageUsed} / \${usage.storageMax} GB\`, "flat", null,             "database"),
    StatCard("Seats",   \`\${usage.seatsUsed} / \${usage.seatsMax}\`,         "up",   "+2 this month", "users"),
    StatCard("Plan",    usage.planLabel,                                   "flat", null,             "id-card")
  ], {sm: 1, md: 3}),
  Progress(usage.storageUsed, usage.storageMax, "Storage used", "primary", false, true)
])

generalCard = Card([
  CardHeader("General"),
  FormControl("Language", Select("language", [
    SelectItem("en", "English"),
    SelectItem("fr", "Français"),
    SelectItem("de", "Deutsch"),
    SelectItem("ja", "日本語")
  ], null, null, $language)),
  Separator("horizontal", true),
  Switch("notifications", "Enable desktop notifications", $notifications, "We'll ping you when a build finishes or someone @mentions you."),
  Switch("autosave",      "Autosave every 30 seconds",     $autosave),
  Switch("shareUsage",    "Share anonymous usage data",    $shareUsage, "Helps us prioritise the right components and themes.")
])

notificationsCard = Card([
  CardHeader("Notifications"),
  Switch("weeklyDigest",  "Weekly digest email",      $weeklyDigest),
  Switch("mentionEmails", "Email me on @mentions",    $mentionEmails, "Beyond just an in-app notification."),
  Separator("horizontal", true),
  Text("Keyboard shortcut to mark all as read:", "small", "muted"),
  Kbd(["⌘", "Shift", "R"])
])

appearanceCard = Card([
  CardHeader("Appearance"),
  FormControl("Theme", ToggleGroup("theme", [
    {value: "light",  label: "Light",  icon: "sun"},
    {value: "dark",   label: "Dark",   icon: "moon"},
    {value: "neon",   label: "Neon",   icon: "wand-magic-sparkles"},
    {value: "pastel", label: "Pastel", icon: "ribbon"}
  ], $theme)),
  FormControl("Accent", ToggleGroup("accent", [
    {value: "indigo",  label: "Indigo"},
    {value: "emerald", label: "Emerald"},
    {value: "rose",    label: "Rose"},
    {value: "amber",   label: "Amber"}
  ], $accent)),
  FormControl("Density", ToggleGroup("density", [
    {value: "compact",     label: "Compact"},
    {value: "comfortable", label: "Comfortable"},
    {value: "spacious",    label: "Spacious"}
  ], $density))
])

shortcutsCard = Card([
  CardHeader("Keyboard shortcuts"),
  List([
    ListItem("Open command palette",     null, "⌘ K"),
    ListItem("Quick search",             null, "⌘ /"),
    ListItem("Toggle theme",             null, "⌘ Shift T"),
    ListItem("Create new doc",           null, "⌘ N"),
    ListItem("Mark all notifs as read",  null, "⌘ Shift R")
  ])
])

dangerCard = Card([
  CardHeader("Danger zone", "Permanent actions — proceed with care"),
  Text("Deleting the workspace removes every project, file, member, and history record. This action cannot be undone.", "small", "muted"),
  Buttons([Button("Delete workspace", () => { $deleting = true }, "danger")])
], "outlined")

tabs = Tabs([
  TabItem("general",       "General",       [generalCard, usageCard]),
  TabItem("appearance",    "Appearance",    [appearanceCard]),
  TabItem("notifications", "Notifications", [notificationsCard]),
  TabItem("shortcuts",     "Shortcuts",     [shortcutsCard]),
  TabItem("danger",        "Danger zone",   [dangerCard])
], $tab)

confirmSheet = Drawer(
  "Delete workspace?",
  $deleting,
  [
    Callout("danger", "This cannot be undone", "Every project, file, and member will be lost."),
    Text("Type DELETE in the box below to confirm.", "small", "muted"),
    FormControl("Confirmation", Input("confirm", "DELETE", "text"))
  ],
  "right",
  [
    Button("Cancel",             () => { $deleting = false },                                                                       "ghost"),
    Button("Permanently delete", deleteWorkspace,                                                                                                                              "danger")
  ]
)

_app_ = Stack([header, saveBanner, tabs, confirmSheet], "column", "l")` }
      ],
      render: { elId: "rui-settings", theme: "light" },
      extraHtml: ``,
    },
    {
      id: null,
      heading: `The mutation tools are trivial`,
      lede: `Most of the UI binds straight to <code>$variables</code>. The only
        thing the host has to do is mirror "Save" into a backend. Try
        flipping a switch, then hitting "Save changes" — the saving banner
        appears, then resolves into a "Saved" banner.`,
      codeBlocks: [
      { codeId: null, content: `el.setTools({
  workspace_usage: () =&gt; ({
    storageUsed: 42, storageMax: 100,
    seatsUsed: 12, seatsMax: 25,
    planLabel: "Pro", renews: "Mar 14",
  }),
  save_settings: async ({ tab, theme, density, language }) =&gt; {
    await sleep(600);
    console.log("[settings] save", { tab, theme, density, language });
    return { ok: true };
  },
  delete_workspace: async () =&gt; {
    await sleep(400);
    console.warn("[settings] delete_workspace would fire here");
    return { ok: true };
  },
});` }
      ],
      render: null,
      extraHtml: ``,
    }
    ],
    setup(){
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const el = document.getElementById("rui-settings");

    el.setTools({
      workspace_usage: () => ({
        storageUsed: 42,
        storageMax: 100,
        seatsUsed: 12,
        seatsMax: 25,
        planLabel: "Pro",
        renews: "Mar 14",
      }),
      save_settings: async ({ tab, theme, density, language }) => {
        await sleep(600);
        console.log("[settings] saved", { tab, theme, density, language });
        return { ok: true };
      },
      delete_workspace: async () => {
        await sleep(400);
        console.warn("[settings] delete_workspace would fire here");
        return { ok: true };
      },
    });

    el.setResponse(document.getElementById("src-settings").textContent);
    }
  },
};

import "../../dist/aktion.js";

const root = document.getElementById("example-root");
const params = new URLSearchParams(window.location.search);
const slug = params.get("example") || "settings-app";
const example = EXAMPLES[slug];

if (!example) {
  document.title = "Example not found · Aktion";
  root.innerHTML = renderNotFound(slug);
} else {
  document.title = example.docTitle;
  root.innerHTML = renderShell(example);
  customElements
    .whenDefined("aktion-app")
    .then(() => {
      try {
        example.setup();
      } catch (err) {
        console.error("Live example setup failed:", err);
      }
    });
}

function renderNotFound(badSlug) {
  const known = Object.keys(EXAMPLES).sort().map((k) => `<li><a href="?example=${k}">${k}</a></li>`).join("");
  return `
    <header class="example-topbar">
      <a class="example-brand" href="live-examples.html">
        <span class="dot"></span>
        Aktion · live example
      </a>
      <a class="example-back" href="live-examples.html">← Back to live examples</a>
    </header>
    <section class="example-hero">
      <span class="tag-pill">Not found</span>
      <h1 style="margin-top:10px">No example named "${escapeHtml(badSlug)}"</h1>
      <p>Pick one of the bundled examples below, or head back to the catalog.</p>
    </section>
    <article class="example-card">
      <h2>Bundled examples</h2>
      <ul>${known}</ul>
    </article>
  `;
}

function renderShell(ex) {
  const cardsHtml = ex.cards.map(renderCard).join("");
  return `
    <header class="example-topbar">
      <a class="example-brand" href="${ex.brandHref}">
        <span class="dot"></span>${ex.brandText}
      </a>
      <a class="example-back" href="${ex.backHref}">${ex.backText}</a>
    </header>

    <section class="example-hero">
      <span class="tag-pill">${ex.eyebrow}</span>
      <h1 style="margin-top:10px">${ex.heroTitleHtml}</h1>
      <p>${ex.heroDescriptionHtml}</p>
    </section>

    ${cardsHtml}
  `;
}

function renderCard(card) {
  const idAttr = card.id ? ` id="${card.id}"` : "";
  const heading = card.heading ? `<h2>${card.heading}</h2>` : "";
  const lede = card.lede ? `<p class="lede">${card.lede}</p>` : "";
  const codeBlocks = card.codeBlocks
    .map((cb) => {
      const idAttr = cb.codeId ? ` id="${cb.codeId}"` : "";
      return `<pre class="example-source"><code${idAttr}>${cb.content}</code></pre>`;
    })
    .join("");
  const output = card.render
    ? `<div class="example-output"><aktion-app id="${card.render.elId}" theme="${card.render.theme}"></aktion-app></div>`
    : "";
  const extra = card.extraHtml || "";
  return `<article class="example-card"${idAttr}>${heading}${lede}${codeBlocks}${output}${extra}</article>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
