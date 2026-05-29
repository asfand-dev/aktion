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

topbar = TopBar("Acme CMS · Studio", {
  subtitle: "Draft · autosaved 12s ago",
  left: [Badge("v3 release", { tone: "primary", icon: "tag", size: "sm" }), StatusDot("Realtime", { tone: "success", pulse: true })],
  center: [SearchBar("q", { placeholder: "Search posts, drafts, schedules…" })],
  right: [Button("Preview", { variant: "ghost", size: "small", icon: "eye" }),
   Button("Publish", { action: () => { $published = true; emit("assistant-message", { message: "Publish the post" }) }, variant: "primary", size: "small", icon: "rocket" })]
})

header = PageHeader($title, {
  subtitle: "Compose, brand, schedule, and gate the release in one place.",
  breadcrumbs: ["Workspace", "Content", "Drafts"],
  actions: [Button("Save draft", { variant: "ghost", size: "small", icon: "floppy-disk" }),
   Button("Discard", { action: () => { $title = ""; $body = ""; $tags = ""; $snippet = "" }, variant: "danger", size: "small", icon: "trash" })]
})

teammates = [
  {name: "Ada Lovelace",   handle: "ada",     role: "Engineering"},
  {name: "Linus Torvalds", handle: "linus",   role: "Kernel"},
  {name: "Grace Hopper",   handle: "grace",   role: "Compilers"},
  {name: "Margaret Hamilton", handle: "margaret", role: "Apollo"}
]

bodyEditor = Card([
  SectionHeader("Body", { subtitle: "Rich text — drag images, paste markdown, mention people", eyebrow: "EDITOR" }),
  FormSection("Post copy", {
    children: [
      FormControl("Title", { field: Input("title", { placeholder: "Catchy headline…", value: $title }) }),
      FormControl("Body", { field: RichTextEditor("body", { value: $body, placeholder: "Start composing…", height: "260px" }) }),
      FormControl("Tags", { field: TagInput("tags", { value: $tags, placeholder: "Press enter to add a tag", max: 10 }) }),
      FormControl("Mention", { field: MentionInput("mention", { suggestions: teammates, value: $mention, placeholder: "Type @ to ping someone…" }) })
    ],
    description: "All fields stream into the preview pane below."
  })
])

snippetEditor = Card([
  SectionHeader("Code snippet", { subtitle: "Embedded in the release notes", eyebrow: "CODE" }),
  CodeEditor("snippet", { value: $snippet, language: "javascript", placeholder: "// type your code…", height: "200px" })
])

brandSection = Card([
  SectionHeader("Brand", { subtitle: "Choose the accent for this release", eyebrow: "DESIGN" }),
  FieldSet("Visual", {
    children: [
      FormControl("Accent", { field: ColorPicker("brand", { value: $brand, label: "Pick a colour", presets: ["#6366f1","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6"] }) }),
      FormControl("Phone", { field: MaskedInput("phone", { mask: "(999) 999-9999", value: $phone, placeholder: "(415) 555-0114" }) }),
      FormControl("Password", { field: PasswordInput("pwd", { value: $pwd, placeholder: "Choose a strong password", showStrength: true }) })
    ],
    description: "Used for callouts and CTA buttons in the published post."
  })
])

scheduleSection = Card([
  SectionHeader("Schedule", { subtitle: "When should this go live?", eyebrow: "TIMING" }),
  Stack([
    FormControl("Publish at", { field: DateTimePicker("publishAt", { value: $publishAt, label: "Launch window" }) }),
    FormControl("Daily slot", { field: TimePicker("slot", { value: $slot, label: "Newsletter time" }) })
  ], { direction: "row", gap: "m" })
])

gateSection = Card([
  SectionHeader("Two-factor publish", { subtitle: "Confirm with a one-time code", eyebrow: "GATE",
    status: Badge("Required", { tone: "warning", icon: "shield-halved", size: "sm" }) }),
  Stack([
    FormControl("4-digit PIN", { field: PinInput("pin", { length: 4, value: $pin, inputMode: "numeric" }) }),
    FormControl("OTP from authenticator", { field: PinInput("otp", { length: 6, value: $otp }) })
  ], { direction: "column", gap: "m" })
])

formErrors = [
  $title == "" ? {label: "title",   message: "Title is required."} : null,
  $pin.length != 4 ? {label: "pin",     message: "PIN must be 4 digits."} : null,
  $otp.length != 6 ? {label: "otp",     message: "Enter the 6-digit OTP."} : null
]

validationCard = @Count(@Filter(formErrors, "label", "!=", null)) > 0
  ? Card([ValidationSummary(@Filter(formErrors, "label", "!=", null), { title: "Fix these before publishing" })])
  : Card([Callout("Ready to publish", { tone: "success", description: "All gates passed — hit Publish to go live.", icon: "circle-check", compact: true })])

wizardSteps = [
  {title: "Compose",  details: "Title, body, tags", content: [bodyEditor, snippetEditor]},
  {title: "Brand",    details: "Accent + contact",  content: [brandSection]},
  {title: "Schedule", details: "Pick a window",      content: [scheduleSection]},
  {title: "Confirm",  details: "PIN + OTP",          content: [gateSection, validationCard]}
]

wizard = MultiStepForm(wizardSteps, { value: $step, onComplete: () => { $published = true; emit("assistant-message", { message: "Wizard submitted" }) } })

tagBadges = Stack($tags.map(t => Badge(t, { tone: "primary", icon: "tag", size: "sm" })), { direction: "row", gap: "xs" })

previewCard = Card([
  SectionHeader("Live preview", { subtitle: $title, eyebrow: "OUTPUT",
    status: Badge(\`Accent \${$brand}\`, { tone: "primary", icon: "palette", size: "sm" }) }),
  tagBadges,
  Separator("horizontal"),
  Text($body, { variant: "body" })
])

teammateChips = Stack(
  teammates.map(m => PersonChip(m.name, { role: m.role, size: "sm" })),
  { direction: "row", gap: "s" }
)

teammatesCard = Card([
  SectionHeader("Available reviewers", { subtitle: "Mention them in the body", eyebrow: "PEOPLE" }),
  teammateChips
])

publishedBanner = $published
  ? Banner("Published!", { message: \`\${$title} went live.\`, action: Button("View live post", { action: () => { window.open("/blog", "_blank", "noopener,noreferrer") }, variant: "primary" }), icon: "rocket", tone: "success" })
  : null

contentGrid = Grid([wizard, Stack([previewCard, teammatesCard], { direction: "column", gap: "l" })], { columns: {sm: 1, lg: 2}, gap: "l" })

followUps = FollowUpBlock([
  FollowUpItem("Generate a summary for social"),
  FollowUpItem("Translate to French"),
  FollowUpItem("Add a hero image")
], { label: "Try next" })

aktion = Stack([
  topbar,
  header,
  publishedBanner,
  contentGrid,
  followUps
], { direction: "column", gap: "l" })` }
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
      codeBlocks: [],
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
  Col("Id",      { values: contributors.id,      format: "text",   align: "left",  sortable: false, filterable: false }),
  Col("Name",    { values: contributors.name,    format: "text",   align: "left",  sortable: true,  filterable: true }),
  Col("Team",    { values: contributors.team,    format: "text",   align: "left",  sortable: true,  filterable: true }),
  Col("Role",    { values: contributors.role,    format: "text",   align: "left",  sortable: true,  filterable: true }),
  Col("Score",   { values: contributors.score,   format: "number", align: "right", sortable: true,  filterable: false }),
  Col("Commits", { values: contributors.commits, format: "number", align: "right", sortable: true,  filterable: false })
]

bulkToolbar = @Count($selectedIds) > 0
  ? Toolbar({
      left: [Badge(\`\${@Count($selectedIds)} selected\`, { tone: "primary", icon: "check", size: "sm" })],
      right: [Button("Email selected", { variant: "ghost", size: "small", icon: "envelope" }),
       Button("Export CSV", { variant: "secondary", size: "small", icon: "file-csv" }),
       Button("Clear", { action: () => { $selectedIds = "" }, variant: "ghost", size: "small" })]
    })
  : null

leaderboard = Card([
  SectionHeader("Top contributors", { subtitle: \`\${@Count(contributors)} engineers · sorted by \${$sort.key} \${$sort.direction}\`,
    eyebrow: "DATAGRID",
    status: Badge("Live", { tone: "success", icon: "circle", size: "sm" }),
    actions: [Button("Search", { variant: "ghost", size: "small", icon: "magnifying-glass" }),
     Button("Refresh", { variant: "ghost", size: "small", icon: "rotate-right" })]}),
  bulkToolbar,
  DataGrid(cols, { rowIds: contributors.id, sort: $sort, selectedIds: $selectedIds, selectable: true, page: $page, pageSize: 6, emptyMessage: "No contributors match" })
])

slaGauge = Card([
  SectionHeader("SLA · uptime", { subtitle: "Rolling 30 days", eyebrow: "RELIABILITY" }),
  Gauge(99.3, { min: 95, max: 100, caption: "Above target", tone: "success", size: "lg" })
])

p95Gauge = Card([
  SectionHeader("P95 response", { subtitle: "Lower is better", eyebrow: "PERFORMANCE" }),
  Gauge(112, { min: 0, max: 250, caption: "ms", tone: "primary", size: "lg" })
])

errorGauge = Card([
  SectionHeader("Error rate", { subtitle: "Last 24h", eyebrow: "QUALITY" }),
  Gauge(0.42, { min: 0, max: 5, caption: "% of requests", tone: "warning", size: "lg" })
])

areaCard = Card([
  SectionHeader("Signups · last 7 days", { subtitle: "Stacked by source", eyebrow: "GROWTH",
    status: Badge("+18% WoW", { tone: "success", icon: "arrow-trend-up", size: "sm" }) }),
  LineChart(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], {
    series: [Series("Organic", { values: [40, 52, 65, 78, 92, 105, 124] }),
     Series("Referral", { values: [20, 28, 35, 42, 50, 60, 72] }),
     Series("Paid", { values: [10, 14, 18, 24, 30, 36, 44] })]
  })
])

heatmapCard = Card([
  SectionHeader("Office capacity by hour", { subtitle: "Mon–Fri average", eyebrow: "OCCUPANCY" }),
  Heatmap(["Mon", "Tue", "Wed", "Thu", "Fri"], {
    yLabels: ["9am", "12pm", "3pm", "6pm"],
    values: [[ 3,  4,  5,  3,  2],
     [ 8,  9, 11,  7,  5],
     [12, 14, 16, 13, 10],
     [ 6,  7,  9, 10, 12]]
  })
])

radarCard = Card([
  SectionHeader("Vendor scorecard", { subtitle: "Two finalists, five axes", eyebrow: "PROCUREMENT" }),
  RadarChart(["Speed", "Quality", "Cost", "Coverage", "Trust"], {
    series: [Series("Atlas Cloud", { values: [80, 70, 60, 75, 85] }),
     Series("Northwind SaaS", { values: [60, 85, 70, 65, 80] })]
  })
])

scatterCard = Card([
  SectionHeader("Sessions vs conversions", { subtitle: "By cohort, last 4 weeks", eyebrow: "FUNNEL" }),
  ScatterChart({
    series: [Series("Cohort A", { values: [{x: 1, y: 2}, {x: 2, y: 4}, {x: 3, y: 5}, {x: 4, y: 7}] }),
     Series("Cohort B", { values: [{x: 1, y: 3}, {x: 2, y: 2}, {x: 3, y: 6}, {x: 4, y: 5}] })],
    xLabel: "Sessions (k)",
    yLabel: "Conversions"
  })
])

histogramCard = Card([
  SectionHeader("Response time distribution", { subtitle: "P50–P99 envelope", eyebrow: "LATENCY" }),
  Histogram({ values: contributors.latencyMs, bins: null, bucketCount: 8 })
])

chartGrid = Grid([areaCard, heatmapCard], { columns: {sm: 1, md: 2}, gap: "l" })
chartGrid2 = Grid([radarCard, scatterCard, histogramCard], { columns: {sm: 1, md: 3}, gap: "l" })
gaugeGrid  = Grid([slaGauge, p95Gauge, errorGauge], { columns: {sm: 1, md: 3}, gap: "l" })

activityCard = Card([
  SectionHeader("Recent activity", { subtitle: "Latest 6 events", eyebrow: "FEED" }),
  InfiniteList([
    ListItem("Ada Lovelace merged PR #142", { description: "Streaming UI v2 components.", icon: "code-merge" }),
    ListItem("Linus Torvalds opened ticket #2049", { description: "Kernel scheduler regression.", icon: "circle-exclamation" }),
    ListItem("Grace Hopper deployed compiler 4.2", { description: "Latency improved 8%.", icon: "rocket" }),
    ListItem("Margaret Hamilton reviewed PR #141", { description: "LGTM with one nit.", icon: "circle-check" }),
    ListItem("Donald Knuth published article", { description: "On the art of computer programming.", icon: "newspaper" }),
    ListItem("Edsger Dijkstra commented", { description: "Beware of bugs in the above code.", icon: "comment" })
  ], { hasMore: false, loading: true })
])

auditCard = Card([
  SectionHeader("Audit trail", { subtitle: "Privileged actions, last 7 days", eyebrow: "AUDIT",
    status: Badge("Compliance", { tone: "primary", icon: "shield-halved", size: "sm" }) }),
  ActivityLog([
    {actor: "system",  title: "Rotated signing key",          time: "08:14",      icon: "key",          tone: "primary", meta: "kid=abc123 ip=10.0.0.4"},
    {actor: "admin",   title: "Granted Owner role to Ada",    time: "yesterday",  icon: "user-shield",  tone: "success", meta: "actor=u_8132 ip=82.32.1.7"},
    {actor: "scanner", title: "Blocked suspicious sign-in",   time: "2 days ago", icon: "shield-halved",tone: "danger",  meta: "ua=ChromeHeadless ip=tor"},
    {actor: "system",  title: "Backup completed",             time: "3 days ago", icon: "database",     tone: "success", meta: "size=1.2TB encrypted"}
  ])
])

bottomGrid = Grid([activityCard, auditCard], { columns: {sm: 1, md: 2}, gap: "l" })

kpiStrip = Stats([
  StatCard("Contributors", { value: \`\${@Count(contributors)}\`,                      trend: "up",   delta: "+2 this week", icon: "users" }),
  StatCard("Commits",      { value: \`\${@Format(@Sum(contributors.commits, "number"))}\`, trend: "up",   delta: "+184 today",   icon: "code-commit" }),
  StatCard("Avg latency",  { value: \`\${@Round(@Avg(contributors.latencyMs), 0)}ms\`, trend: "down", delta: "-12 ms",       icon: "gauge-high" }),
  StatCard("Top score",    { value: \`\${@Max(contributors.score)}\`,                  trend: "flat", delta: "Ada Lovelace", icon: "trophy" })
])

pageHeader = PageHeader("Engineering analytics", {
  subtitle: \`\${@Count(contributors)} contributors · \${@Sum(contributors.commits)} commits this month\`,
  breadcrumbs: ["Workspace", "Engineering", "Analytics"],
  actions: [Button("Export PDF", { variant: "secondary" }),
   Button("Share view", { variant: "primary" })],
  status: Badge("Realtime", { tone: "success", icon: "circle", size: "sm" })
})

aktion = Stack([
  pageHeader,
  kpiStrip,
  gaugeGrid,
  leaderboard,
  chartGrid,
  chartGrid2,
  bottomGrid
], { direction: "column", gap: "l" })` }
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
      codeBlocks: [],
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
  photos.map(p => ({src: p.src, alt: p.caption, caption: p.caption})),
  { activeIndex: $slide, aspectRatio: "16:9", autoplay: true }
)

galleryGrid = Gallery(
  photos.map(p => ({src: p.src, alt: p.caption, caption: p.caption})),
  { columns: 3, onClick: () => { $lightboxIdx = 0; $lightboxOpen = true } }
)

zoomBox = Lightbox($lightboxOpen, { activeIndex: $lightboxIdx, items: photos })

trailerCard = Card([
  SectionHeader("Trailer · Aurora Expedition", { subtitle: "60-second highlight reel", eyebrow: "WATCH",
    status: Badge("HD", { tone: "primary", icon: "video", size: "sm" }) }),
  VideoPlayer("https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4", {
    poster: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
    controls: true,
    title: "Aurora Expedition · trailer",
    aspectRatio: "16:9"
  })
])

soundtrackCard = Card([
  SectionHeader("Trip soundtrack", { subtitle: "Pre-departure playlist", eyebrow: "LISTEN",
    status: Badge("3 tracks", { tone: "info", icon: "music", size: "sm" }) }),
  AudioPlayer("https://upload.wikimedia.org/wikipedia/commons/b/b4/Bach_-_Cello_Suite_No._5_-_1._Prelude.ogg", {
    title: "Northern Skies", artist: "Aurora Strings"
  })
])

mapCard = Card([
  SectionHeader("Itinerary map", { subtitle: "Six stops · 8 days", eyebrow: "ROUTE",
    status: Badge("Leaflet", { tone: "primary", icon: "map-location-dot", size: "sm" }) }),
  Map(65.0, {
    lng: -16.0, zoom: 5,
    markers: [
      {lat: 64.1466, lng: -21.9426, label: "Day 1 · Reykjavík"},
      {lat: 64.2538, lng: -21.0186, label: "Day 2 · Þingvellir"},
      {lat: 64.7140, lng: -19.0608, label: "Day 3 · Highlands"},
      {lat: 65.6839, lng: -18.0907, label: "Day 5 · Akureyri"},
      {lat: 66.0410, lng: -23.1247, label: "Day 6 · Westfjords"},
      {lat: 64.9631, lng: -19.0208, label: "Day 8 · Vatnajökull"}
    ],
    height: "360px",
    caption: "Aurora expedition itinerary"
  })
])

kpis = Stats([
  StatCard("Photos",    { value: \`\${@Count(photos)}\`, trend: "flat", delta: "Curated",           icon: "image" }),
  StatCard("Duration",  { value: "8 days",            trend: "flat", delta: "Round-trip",         icon: "calendar-days" }),
  StatCard("Locations", { value: "6 stops",           trend: "up",   delta: "+2 vs last tour",   icon: "location-dot" }),
  StatCard("Group size",{ value: "12 max",            trend: "flat", delta: "Small-group format", icon: "people-group" })
])

hero = Hero("Aurora Expedition", {
  subtitle: "Eight days chasing the northern lights across Iceland's most photogenic ridgelines, fjords, and ice caves.",
  eyebrow: "FIELD GUIDE · v3",
  imageSrc: "https://picsum.photos/seed/aurora-cover/1600/600",
  caption: "Aug — Sept 2026 · from $4,890",
  height: "360px",
  actions: [Button("Reserve a spot", { variant: "primary" }),
   Button("Download brief", { action: () => { window.open("/aurora-brief.pdf", "_blank", "noopener,noreferrer") }, variant: "ghost" })],
  layout: "cover",
  tone: "primary"
})

galleryBlock = Card([
  SectionHeader("Photo gallery", { subtitle: "Tap any tile to view full size", eyebrow: "PHOTOS",
    status: Badge(\`\${@Count(photos)} photos\`, { tone: "primary", icon: "image", size: "sm" }) }),
  galleryGrid
])

mediaRow = Grid([trailerCard, soundtrackCard], { columns: {sm: 1, md: 2}, gap: "l" })

followUps = FollowUpBlock([
  FollowUpItem("Show me the day-by-day itinerary"),
  FollowUpItem("What gear should I bring?"),
  FollowUpItem("Add a 2-day Reykjavík extension")
], { label: "Plan your trip" })

aktion = Stack([
  hero,
  kpis,
  Card([SectionHeader("Daily highlights", { subtitle: "Aurora · summer 2026", eyebrow: "PREVIEW",
    status: Badge("Live", { tone: "success", icon: "circle", size: "sm" }) }), heroCarousel]),
  galleryBlock,
  mediaRow,
  mapCard,
  followUps,
  zoomBox
], { direction: "column", gap: "l" })` }
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
      codeBlocks: [],
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
    eyebrow: `Live demo · Router({…}) + NavLink`,
    heroTitleHtml: `A multi-page app, in a single Aktion program`,
    heroDescriptionHtml: `One <code>&lt;aktion-app&gt;</code> tag renders a four-page UI
        synced to the URL hash. Click the nav, use deep links, hit the browser
        back button — it all stays in sync, with zero framework lock-in.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · routing`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Try <a href="#/dashboard">#/dashboard</a>,
        <a href="#/users">#/users</a>, then drill into a user (e.g.
        <a href="#/users/ada">#/users/ada</a>). Browser back / forward and
        bookmarks all work.`,
      codeBlocks: [],
      render: { elId: "rui-routing", theme: "light" },
      extraHtml: ``,
    },
    {
      id: null,
      heading: `UI Script source`,
      lede: `The <code>nav</code> stays visible across every page;
        <code>main</code> is produced by
        <code>Router({ … })</code>, which swaps in the matching arm.
        Path parameters land in <code>params</code> inside each arm
        body, and the reserved <code>route</code> handle exposes the
        reactive surface everywhere else (and the imperative
        <code>route.navigate(path)</code> method).`,
      codeBlocks: [
      { codeId: "src-routing", content: `$users = [
  {id: "ada",   name: "Ada Lovelace", role: "Founding engineer",   joined: "2019-04-02"},
  {id: "grace", name: "Grace Hopper", role: "Compiler researcher", joined: "2020-01-15"},
  {id: "lin",   name: "Lin-Manuel",   role: "Product designer",    joined: "2021-08-21"},
  {id: "ken",   name: "Ken Thompson", role: "Platform engineer",   joined: "2018-11-04"}
]

$visits = 0
$lastEdited = "—"

aktion = Stack([header, nav, main])

header = Card([
  CardHeader("Acme console", { subtitle: \`Routing demo · current path: \${route}\` }),
  Stack([
    Badge(\`route = \${route}\`, { tone: "info", icon: "compass", size: "sm" }),
    Badge(\`visits = \${$visits}\`, { tone: "neutral", icon: "eye", size: "sm" })
  ], { direction: "row", gap: "xs" })
])

nav = Card([
  Stack([
    NavLink("Home",      { to: "/",          variant: "ghost", exact: true,  icon: "house" }),
    NavLink("Dashboard", { to: "/dashboard", variant: "ghost", icon: "chart-pie" }),
    NavLink("Users",     { to: "/users",     variant: "ghost", icon: "users" }),
    NavLink("Settings",  { to: "/settings",  variant: "ghost", icon: "gear" })
  ], { direction: "row", gap: "s" })
])

main = Router({
  "/":           homePage,
  "/dashboard":  dashboardPage,
  "/users":      usersListPage,
  "/users/:id":  userDetailPage({ id: params.id }),
  "/settings":   settingsHomePage,
  "/settings/*": settingsAreaPage({ rest: params._ }),
  default:       notFoundPage
})

homePage = Card([
  CardHeader("Welcome", { subtitle: "A multi-page UI in one Aktion program" }),
  Markdown("Pick a section above, or jump straight in:"),
  Buttons([
    Button("Open dashboard", { action: () => { route.navigate("/dashboard") }, variant: "primary" }),
    Button("Browse users",   { action: () => { route.navigate("/users") },     variant: "secondary" }),
    Button("Open Ada",       { action: () => { route.navigate("/users/ada") }, variant: "ghost" })
  ])
])

dashboardPage = Card([
  CardHeader("Dashboard", { subtitle: "Reactive across routes" }),
  Stack([
    StatCard("Users",     { value: \`\${@Count($users)}\`, trend: "up", delta: "+2 this month" }),
    StatCard("Visits",    { value: \`\${$visits}\`,        trend: "up", delta: "this session" }),
    StatCard("Last edit", { value: $lastEdited })
  ], { direction: "row", gap: "m", align: "stretch", justify: "start", wrap: true }),
  Buttons([
    Button("Track a visit", { action: () => { $visits = $visits + 1 }, variant: "primary" }),
    Button("Back to home",  { action: () => { route.navigate("/") },   variant: "ghost" })
  ])
])

function UserRow(id, name, role, joined) {
  return Card([
    Stack([
      Stack([
        Text(name, { variant: "body-heavy" }),
        Text(\`\${role} · joined \${joined}\`, { variant: "small", color: "muted" })
      ]),
      Buttons([Button("Open", { action: () => { route.navigate(\`/users/\${id}\`) }, variant: "ghost" })])
    ], { direction: "row", gap: "m", align: "center", justify: "between" })
  ], { variant: "outlined" })
}

usersListPage = Card([
  CardHeader("Users", { subtitle: "Click a row to deep-link into the detail page" }),
  Stack($users.map(u => UserRow(u.id, u.name, u.role, u.joined)))
])

function userDetailPage(id) {
  return Card([
    CardHeader(\`User \${id}\`, { subtitle: "Deep-linkable detail page" }),
    Markdown(\`Path parameter: **\${id}** · open URL: \\\`#/users/\${id}\\\`\`),
    Buttons([
      Button("Back to users", { action: () => { route.navigate("/users") },                          variant: "ghost" }),
      Button("Mark edited",   { action: () => { $lastEdited = id; route.navigate("/dashboard") },    variant: "primary" })
    ])
  ])
}

settingsHomePage = Card([
  CardHeader("Settings", { subtitle: "Wildcard nested route below" }),
  Stack([
    NavLink("Profile",       { to: "/settings/profile",       variant: "pill" }),
    NavLink("Notifications", { to: "/settings/notifications", variant: "pill" }),
    NavLink("Security",      { to: "/settings/security",      variant: "pill" })
  ], { direction: "row", gap: "s" }),
  Text("Pick a sub-section above — it's matched by /settings/*.", { variant: "small", color: "muted" })
])

// \`params._\` holds whatever comes after \`/settings/\` — captured into \`rest\` above.
function settingsAreaPage(rest) {
  return Card([
    CardHeader(\`Settings · \${rest}\`, { subtitle: "Sub-section captured by wildcard" }),
    Text(\`params._ = \${rest}\`),
    Buttons([Button("Back to settings", { action: () => { route.navigate("/settings") }, variant: "ghost" })])
  ])
}

notFoundPage = Callout("Not found", { tone: "warning", description: \`No page matches \${route}. Use the nav above or go back to /.\` })` }
      ],
      render: null,
      extraHtml: ``,
    },
    {
      id: null,
      heading: `How it works`,
      lede: ``,
      codeBlocks: [],
      render: null,
      extraHtml: `<ul>
        <li>
          The renderer always starts the built-in router. The reactive
          <code>route</code> handle is exposed everywhere (with
          <code>route.path</code>, <code>route.params</code>,
          <code>route.query</code>) and the routing section is part of
          the generated system prompt by default.
        </li>
        <li>
          <code>nav</code> is rendered once at the top of <code>root</code> so
          it stays visible across every page. <code>NavLink</code>s reflect
          <code>data-active="true"</code> automatically — the home link uses
          <code>exact=true</code> so it doesn't light up on every path.
        </li>
        <li>
          <code>Router({ … })</code> picks exactly one arm per render
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
          <code>NavLink(label, { to: "/path" })</code> is the declarative way
          to move; the imperative <code>route.navigate("/path")</code> works
          from actions.
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
        keyboard shortcut chips, and a slide-in <code>Drawer</code> for
        confirming the dangerous "delete workspace" action. Every control
        binds straight to a <code>$variable</code>.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · settings app`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Flip the switches, change the theme, hit "Save changes" — the save
        progress bar animates and a banner confirms. "Delete workspace"
        opens a confirmation drawer.`,
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

usage = {storageUsed: 0, storageMax: 100, seatsUsed: 0, seatsMax: 0, planLabel: "", renews: ""}

function saveSettings() {
  $saveStatus = "saving"
  $saved = http({ url: "/api/settings", method: "PUT", body: { theme: $theme, accent: $accent }, headers: { "Content-Type": "application/json" } })
  $saveStatus = "saved"
}

function deleteWorkspace() {
  $deleted = http({ url: "/api/workspace", method: "DELETE" })
  $deleting = false
  emit("assistant-message", { message: "Workspace deleted" })
}

function makeSaveBanner(status) {
  switch (status) {
    case "saving": return Banner("Saving…", { message: "Hang tight while we sync your preferences.", icon: "spinner", tone: "info" })
    case "saved":  return Banner("Saved", { message: "Your preferences are up to date.", icon: "circle-check", tone: "success" })
    default:       return null
  }
}
saveBanner = makeSaveBanner($saveStatus)

header = PageHeader("Settings", {
  subtitle: "Personalise your workspace",
  breadcrumbs: Breadcrumb([BreadcrumbItem("Workspace", { href: "#" }), BreadcrumbItem("Settings")]),
  actions: [
    Button("Cancel", { variant: "ghost" }),
    Button("Save changes", { action: saveSettings, variant: "primary" })
  ],
  status: Badge(usage.planLabel, { tone: "primary", size: "sm" })
})

usageCard = Card([
  CardHeader("Workspace usage", { subtitle: \`Renews \${usage.renews}\` }),
  Stats([
    StatCard("Storage", { value: \`\${usage.storageUsed} / \${usage.storageMax} GB\`, trend: "flat", icon: "database" }),
    StatCard("Seats",   { value: \`\${usage.seatsUsed} / \${usage.seatsMax}\`,         trend: "up", delta: "+2 this month", icon: "users" }),
    StatCard("Plan",    { value: usage.planLabel,                                   trend: "flat", icon: "id-card" })
  ]),
  Progress(usage.storageUsed, { max: usage.storageMax, label: "Storage used", tone: "primary" })
])

generalCard = Card([
  CardHeader("General"),
  FormControl("Language", { field: Select("language", {
    items: [
      SelectItem("en", { label: "English" }),
      SelectItem("fr", { label: "Français" }),
      SelectItem("de", { label: "Deutsch" }),
      SelectItem("ja", { label: "日本語" })
    ],
    value: $language
  }) }),
  Separator("horizontal"),
  Switch("notifications", { label: "Enable desktop notifications", value: $notifications, description: "We'll ping you when a build finishes or someone @mentions you." }),
  Switch("autosave",      { label: "Autosave every 30 seconds",    value: $autosave }),
  Switch("shareUsage",    { label: "Share anonymous usage data",   value: $shareUsage, description: "Helps us prioritise the right components and themes." })
])

notificationsCard = Card([
  CardHeader("Notifications"),
  Switch("weeklyDigest",  { label: "Weekly digest email",   value: $weeklyDigest }),
  Switch("mentionEmails", { label: "Email me on @mentions", value: $mentionEmails, description: "Beyond just an in-app notification." }),
  Separator("horizontal"),
  Text("Keyboard shortcut to mark all as read:", { variant: "small", color: "muted" }),
  Kbd(["⌘", "Shift", "R"])
])

appearanceCard = Card([
  CardHeader("Appearance"),
  FormControl("Theme", { field: ToggleGroup("theme", {
    items: [
      {value: "light",  label: "Light",  icon: "sun"},
      {value: "dark",   label: "Dark",   icon: "moon"},
      {value: "neon",   label: "Neon",   icon: "wand-magic-sparkles"},
      {value: "pastel", label: "Pastel", icon: "ribbon"}
    ],
    value: $theme
  }) }),
  FormControl("Accent", { field: ToggleGroup("accent", {
    items: [
      {value: "indigo",  label: "Indigo"},
      {value: "emerald", label: "Emerald"},
      {value: "rose",    label: "Rose"},
      {value: "amber",   label: "Amber"}
    ],
    value: $accent
  }) }),
  FormControl("Density", { field: ToggleGroup("density", {
    items: [
      {value: "compact",     label: "Compact"},
      {value: "comfortable", label: "Comfortable"},
      {value: "spacious",    label: "Spacious"}
    ],
    value: $density
  }) })
])

shortcutsCard = Card([
  CardHeader("Keyboard shortcuts"),
  List([
    ListItem("Open command palette",    { icon: "⌘ K" }),
    ListItem("Quick search",            { icon: "⌘ /" }),
    ListItem("Toggle theme",            { icon: "⌘ Shift T" }),
    ListItem("Create new doc",          { icon: "⌘ N" }),
    ListItem("Mark all notifs as read", { icon: "⌘ Shift R" })
  ])
])

dangerCard = Card([
  CardHeader("Danger zone", { subtitle: "Permanent actions — proceed with care" }),
  Text("Deleting the workspace removes every project, file, member, and history record. This action cannot be undone.", { variant: "small", color: "muted" }),
  Buttons([Button("Delete workspace", { action: () => { $deleting = true }, variant: "danger" })])
], { variant: "outlined" })

tabs = Tabs([
  TabItem("general",       { label: "General",       children: [generalCard, usageCard] }),
  TabItem("appearance",    { label: "Appearance",    children: [appearanceCard] }),
  TabItem("notifications", { label: "Notifications", children: [notificationsCard] }),
  TabItem("shortcuts",     { label: "Shortcuts",     children: [shortcutsCard] }),
  TabItem("danger",        { label: "Danger zone",   children: [dangerCard] })
], { defaultValue: $tab })

confirmSheet = Drawer("Delete workspace?", {
  open: $deleting,
  children: [
    Callout("This cannot be undone", { tone: "danger", description: "Every project, file, and member will be lost." }),
    Text("Type DELETE in the box below to confirm.", { variant: "small", color: "muted" }),
    FormControl("Confirmation", { field: Input("confirm", { placeholder: "DELETE" }) })
  ],
  side: "right",
  footer: [
    Button("Cancel",             { action: () => { $deleting = false }, variant: "ghost" }),
    Button("Permanently delete", { action: deleteWorkspace,             variant: "danger" })
  ]
})

aktion = Stack([header, saveBanner, tabs, confirmSheet], { direction: "column", gap: "l" })` }
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
  "kanban-pro": {
    slug: "kanban-pro",
    docTitle: `Kanban board · Aktion`,
    eyebrow: `Live demo · drag-and-drop board + autosave`,
    heroTitleHtml: `A Kanban board with reactive columns, autosave, and hydration`,
    heroDescriptionHtml: `Board state in a single <code>$columns</code> reactive variable.
        Actions move, add, and archive cards. Effects autosave to
        <code>Storage.local</code> with debounce and hydrate on mount.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · kanban`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Cards live in <code>$columns</code>. Actions mutate the array
        and effects persist to localStorage. Open DevTools → Application →
        Local Storage to see autosave fire after 500ms of inactivity.`,
      codeBlocks: [
      { codeId: "src-kanban", content: `$columns = [
  {id: "todo",    title: "To do",       cards: [{id: "c1", title: "Design API schema",   priority: "high",   assignee: "Ada"},
                                                  {id: "c2", title: "Write unit tests",    priority: "medium", assignee: "Grace"}]},
  {id: "doing",   title: "In progress", cards: [{id: "c3", title: "Build dashboard view", priority: "high",   assignee: "Linus"}]},
  {id: "review",  title: "Review",      cards: [{id: "c4", title: "Update docs",          priority: "low",    assignee: "Margaret"}]},
  {id: "done",    title: "Done",        cards: []}
]
$newTitle = ""

effect(() => {
  $columns = Storage.local.get("kanban") ?? $columns
}, ["mount"])

effect(() => {
  Storage.local.set("kanban", $columns)
}, [$columns, "debounce(500)"])

function addCard() {
  $columns = $columns.map((c) => c.id == "todo" ? {...c, cards: [...c.cards, {id: \`c\${Date.now()}\`, title: $newTitle, priority: "medium", assignee: "Unassigned"}]} : c)
  $newTitle = ""
}

function moveCard(cardId, toColumnId) {
  card = $columns.flatMap((c) => c.cards).filter((cd) => cd.id == cardId)[0]
  $columns = $columns.map((c) => ({...c, cards: c.cards.filter((cd) => cd.id != cardId)}))
  $columns = $columns.map((c) => c.id == toColumnId ? {...c, cards: [...c.cards, card]} : c)
}

function archiveCard(cardId) {
  $columns = $columns.map((c) => ({...c, cards: c.cards.filter((cd) => cd.id != cardId)}))
}

board = KanbanBoard(
  $columns.map(col =>
    KanbanColumn(col.title, {
      items: col.cards.map(card =>
        KanbanCard(card.title, { tags: [card.priority], assignee: card.assignee })
      )
    })
  )
)

addForm = Card([
  SectionHeader("Add card", { subtitle: "Adds to the To do column", eyebrow: "NEW" }),
  Stack([
    Input("newTitle", { placeholder: "Card title…", value: $newTitle }),
    Button("Add", { action: addCard, variant: "primary", icon: "plus" })
  ], { direction: "row", gap: "m" })
])

aktion = Stack([
  PageHeader("Kanban board", { subtitle: "Drag cards between columns — state autosaves", breadcrumbs: ["Workspace", "Board"] }),
  addForm,
  board
], { direction: "column", gap: "l" })` }
      ],
      render: { elId: "rui-kanban", theme: "light" },
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-kanban");
    el.setResponse(document.getElementById("src-kanban").textContent);
    }
  },
  "analytics-pulse": {
    slug: "analytics-pulse",
    docTitle: `Analytics pulse · Aktion`,
    eyebrow: `Live demo · realtime dashboard`,
    heroTitleHtml: `A realtime-feeling dashboard with interval effects and derived stats`,
    heroDescriptionHtml: `A fake live feed driven by <code>effect(() => { … }, ["every(2000)"])</code>,
        with <code>@Sum</code> aggregations, a date-range <code>Select</code>,
        and a <code>Tabs</code> switcher.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · analytics`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `The event feed updates every 2 seconds. The KPI strip and
        chart re-derive automatically because they read <code>$events</code>.`,
      codeBlocks: [
      { codeId: "src-analytics", content: `$events = [
  {ts: "12:00", value: 42, source: "web"},
  {ts: "12:01", value: 18, source: "api"},
  {ts: "12:02", value: 31, source: "web"},
  {ts: "12:03", value: 55, source: "api"}
]
$range = "1h"
$tab = "overview"

effect(() => {
  $events = [...$events, {ts: \`\${new Date().getHours()}:\${String(new Date().getMinutes()).padStart(2, "0")}\`, value: Math.floor(Math.random() * 80 + 10), source: Math.random() > 0.5 ? "web" : "api"}]
}, ["every(2000)"])

totalValue = @Sum($events.value)
webEvents = $events.filter((e) => e.source == "web")
apiEvents = $events.filter((e) => e.source == "api")

kpis = Stats([
  StatCard("Total events", { value: \`\${$events.length}\`,        trend: "up", delta: "live",       icon: "bolt" }),
  StatCard("Sum value",    { value: \`\${totalValue}\`,             trend: "up", delta: "+realtime",  icon: "chart-line" }),
  StatCard("Web events",   { value: \`\${webEvents.length}\`,       trend: "flat", icon: "globe" }),
  StatCard("API events",   { value: \`\${apiEvents.length}\`,       trend: "flat", icon: "server" })
])

chart = Card([
  SectionHeader("Event values over time", { eyebrow: "TREND",
    status: Badge("Live", { tone: "success", icon: "circle", size: "sm" }) }),
  LineChart($events.ts, {
    series: [Series("Value", { values: $events.value })]
  })
])

rangeSelector = Select("range", {
  items: [SelectItem("1h", { label: "Last hour" }), SelectItem("6h", { label: "Last 6 hours" }), SelectItem("24h", { label: "Last 24 hours" })],
  value: $range
})

overviewTab = Stack([kpis, chart], { direction: "column", gap: "l" })

feedTab = Card([
  SectionHeader("Event feed", { subtitle: "Latest 10 events", eyebrow: "FEED" }),
  InfiniteList(
    $events.slice(-10).reverse().map(e =>
      ListItem(\`\${e.ts} — \${e.source}\`, { description: \`Value: \${e.value}\`, icon: e.source == "web" ? "globe" : "server" })
    ),
    { hasMore: false }
  )
])

tabs = Tabs([
  TabItem("overview", { label: "Overview", children: [overviewTab] }),
  TabItem("feed",     { label: "Feed",     children: [feedTab] })
], { defaultValue: $tab })

aktion = Stack([
  PageHeader("Analytics pulse", { subtitle: "Realtime event dashboard", breadcrumbs: ["Workspace", "Analytics"],
    actions: [rangeSelector, Button("Export", { variant: "ghost", icon: "file-csv" })] }),
  tabs
], { direction: "column", gap: "l" })` }
      ],
      render: { elId: "rui-analytics", theme: "light" },
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-analytics");
    el.setResponse(document.getElementById("src-analytics").textContent);
    }
  },
  "recipe-explorer": {
    slug: "recipe-explorer",
    docTitle: `Recipe explorer · Aktion`,
    eyebrow: `Live demo · search + filter + sort`,
    heroTitleHtml: `A search, filter, and sort UX with derived lists`,
    heroDescriptionHtml: `Type a query, pick a cuisine, toggle sort — the card grid
        re-derives instantly from <code>$query</code>, <code>$cuisine</code>,
        and <code>$sort</code>. No manual re-render wiring.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · recipes`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Search is instant. The cuisine filter and sort toggle derive a
        new list from the same <code>$recipes</code> array.`,
      codeBlocks: [
      { codeId: "src-recipes", content: `$query = ""
$cuisine = ""
$sort = "rating"

$recipes = [
  {title: "Pad Thai",         cuisine: "Thai",     rating: 4.8, time: "30 min", image: "https://picsum.photos/seed/padthai/400/260",   tags: ["noodles", "quick"]},
  {title: "Margherita Pizza",  cuisine: "Italian",  rating: 4.6, time: "45 min", image: "https://picsum.photos/seed/pizza/400/260",     tags: ["classic", "vegetarian"]},
  {title: "Chicken Tikka",     cuisine: "Indian",   rating: 4.9, time: "50 min", image: "https://picsum.photos/seed/tikka/400/260",     tags: ["spicy", "grilled"]},
  {title: "Sushi Platter",     cuisine: "Japanese", rating: 4.7, time: "60 min", image: "https://picsum.photos/seed/sushi/400/260",     tags: ["fresh", "seafood"]},
  {title: "Caesar Salad",      cuisine: "American", rating: 4.3, time: "15 min", image: "https://picsum.photos/seed/caesar/400/260",    tags: ["salad", "quick"]},
  {title: "Tom Yum Soup",      cuisine: "Thai",     rating: 4.5, time: "25 min", image: "https://picsum.photos/seed/tomyum/400/260",    tags: ["soup", "spicy"]},
  {title: "Pasta Carbonara",   cuisine: "Italian",  rating: 4.4, time: "20 min", image: "https://picsum.photos/seed/carbonara/400/260", tags: ["pasta", "quick"]},
  {title: "Butter Chicken",    cuisine: "Indian",   rating: 4.8, time: "55 min", image: "https://picsum.photos/seed/butterchk/400/260", tags: ["curry", "creamy"]}
]

filtered = $recipes.filter((r) => r.title.toLowerCase().includes($query.toLowerCase()) && (!$cuisine || r.cuisine == $cuisine)).sort((a, b) => $sort == "rating" ? b.rating - a.rating : a.title.localeCompare(b.title))

toolbar = Card([
  Stack([
    SearchBar("query", { placeholder: "Search recipes…", value: $query }),
    Select("cuisine", {
      items: [SelectItem("", { label: "All cuisines" }), SelectItem("Thai", { label: "Thai" }), SelectItem("Italian", { label: "Italian" }), SelectItem("Indian", { label: "Indian" }), SelectItem("Japanese", { label: "Japanese" }), SelectItem("American", { label: "American" })],
      value: $cuisine
    }),
    ToggleGroup("sort", {
      items: [{value: "rating", label: "Top rated"}, {value: "alpha", label: "A–Z"}],
      value: $sort
    })
  ], { direction: "row", gap: "m", wrap: true })
])

recipeGrid = Grid(
  filtered.map(r => Card([
    Image(r.image, { alt: r.title, aspectRatio: "16:10" }),
    CardHeader(r.title, { subtitle: \`\${r.cuisine} · \${r.time}\` }),
    Stack([
      Badge(\`★ \${r.rating}\`, { tone: r.rating >= 4.7 ? "success" : "primary", size: "sm" }),
      Stack(r.tags.map((t) => Badge(t, { tone: "neutral", size: "sm" })), { direction: "row", gap: "xs" })
    ], { direction: "row", gap: "s" })
  ])),
  { columns: {sm: 1, md: 2, lg: 3}, gap: "l" }
)

emptyState = filtered.length == 0 ? EmptyState("No recipes found", { description: "Try a different search or filter.", icon: "utensils" }) : null

aktion = Stack([
  PageHeader("Recipe explorer", { subtitle: \`\${filtered.length} of \${$recipes.length} recipes\`, breadcrumbs: ["Kitchen", "Browse"] }),
  toolbar,
  recipeGrid,
  emptyState
], { direction: "column", gap: "l" })` }
      ],
      render: { elId: "rui-recipes", theme: "light" },
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-recipes");
    el.setResponse(document.getElementById("src-recipes").textContent);
    }
  },
  "expense-tracker": {
    slug: "expense-tracker",
    docTitle: `Expense tracker · Aktion`,
    eyebrow: `Live demo · budget + switch + storage`,
    heroTitleHtml: `A budget tracker with tabbed views, charts, and local persistence`,
    heroDescriptionHtml: `Three tabs — list, chart, and settings — driven by <code>switch</code>.
        Uses <code>Storage.local</code> for persistence and <code>@Sum</code>
        for running totals.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · expenses`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Add an expense, switch tabs, see the chart update. All data
        persists in localStorage.`,
      codeBlocks: [
      { codeId: "src-expenses", content: `$tab = "list"
$expenses = [
  {id: "e1", label: "Groceries",    amount: 85,  category: "food"},
  {id: "e2", label: "Netflix",      amount: 15,  category: "entertainment"},
  {id: "e3", label: "Gas",          amount: 52,  category: "transport"},
  {id: "e4", label: "Coffee",       amount: 6,   category: "food"},
  {id: "e5", label: "Gym",          amount: 40,  category: "health"}
]
$budget = 500
$newLabel = ""
$newAmount = 0
$newCategory = "food"

effect(() => {
  $expenses = Storage.local.get("expenses") ?? $expenses
  $budget = Storage.local.get("budget") ?? $budget
}, ["mount"])

effect(() => {
  Storage.local.set("expenses", $expenses)
  Storage.local.set("budget", $budget)
}, [$expenses, $budget, "debounce(300)"])

function addExpense() {
  $expenses = [...$expenses, {id: \`e\${Date.now()}\`, label: $newLabel, amount: $newAmount, category: $newCategory}]
  $newLabel = ""
  $newAmount = 0
}

function removeExpense(id) {
  $expenses = $expenses.filter((e) => e.id != id)
}

spent = @Sum($expenses.amount)
remaining = $budget - spent

kpis = Stats([
  StatCard("Budget",    { value: \`$\${$budget}\`,    trend: "flat", icon: "wallet" }),
  StatCard("Spent",     { value: \`$\${spent}\`,      trend: "up",   delta: \`\${$expenses.length} items\`, icon: "receipt" }),
  StatCard("Remaining", { value: \`$\${remaining}\`,  trend: remaining > 0 ? "flat" : "down", delta: remaining > 0 ? "On track" : "Over budget", icon: "piggy-bank" })
])

listView = Card([
  SectionHeader("Expenses", { subtitle: \`\${$expenses.length} entries\`, eyebrow: "LIST" }),
  Stack(
    $expenses.map(e => Stack([
      Stack([Text(e.label, { variant: "body-heavy" }), Badge(e.category, { tone: "neutral", size: "sm" })], { direction: "row", gap: "xs" }),
      Stack([Text(\`$\${e.amount}\`, { variant: "body-heavy" }), Button("Remove", { action: () => { removeExpense(e.id) }, variant: "ghost", size: "small", icon: "trash" })], { direction: "row", gap: "xs" })
    ], { direction: "row", gap: "m", justify: "between", align: "center" })),
    { direction: "column", gap: "s" }
  )
])

chartView = Card([
  SectionHeader("Spending by category", { eyebrow: "CHART" }),
  BarChart(["food", "entertainment", "transport", "health"], {
    series: [Series("Amount", { values: [
      @Sum($expenses.filter((e) => e.category == "food").amount),
      @Sum($expenses.filter((e) => e.category == "entertainment").amount),
      @Sum($expenses.filter((e) => e.category == "transport").amount),
      @Sum($expenses.filter((e) => e.category == "health").amount)
    ] })]
  })
])

addForm = Card([
  SectionHeader("Add expense", { eyebrow: "NEW" }),
  Stack([
    Input("newLabel", { placeholder: "Description…", value: $newLabel }),
    NumberInput("newAmount", { value: $newAmount, min: 0, step: 1 }),
    Select("newCategory", { items: [SelectItem("food", { label: "Food" }), SelectItem("entertainment", { label: "Entertainment" }), SelectItem("transport", { label: "Transport" }), SelectItem("health", { label: "Health" })], value: $newCategory }),
    Button("Add expense", { action: addExpense, variant: "primary", icon: "plus" })
  ], { direction: "row", gap: "m", wrap: true })
])

settingsView = Card([
  SectionHeader("Budget settings", { eyebrow: "CONFIG" }),
  FormControl("Monthly budget ($)", { field: NumberInput("budget", { value: $budget, min: 0, step: 50 }) }),
  Progress(spent, { max: $budget, label: \`\${Math.round(spent / $budget * 100)}% used\`, tone: spent > $budget ? "danger" : "success" })
])

tabs = Tabs([
  TabItem("list",     { label: "List",     children: [addForm, listView] }),
  TabItem("chart",    { label: "Chart",    children: [chartView] }),
  TabItem("settings", { label: "Settings", children: [settingsView] })
], { defaultValue: $tab })

aktion = Stack([
  PageHeader("Expense tracker", { subtitle: \`\${remaining > 0 ? "On track" : "Over budget"} · $\${remaining} remaining\`, breadcrumbs: ["Finance", "Budget"] }),
  kpis,
  tabs
], { direction: "column", gap: "l" })` }
      ],
      render: { elId: "rui-expenses", theme: "light" },
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-expenses");
    el.setResponse(document.getElementById("src-expenses").textContent);
    }
  },
  "chat-search": {
    slug: "chat-search",
    docTitle: `Chat search · Aktion`,
    eyebrow: `Live demo · command palette + debounced search`,
    heroTitleHtml: `A command-palette search bar with debounced results`,
    heroDescriptionHtml: `Type a query — results appear after a debounced pause. Demonstrates
        <code>effect</code> with <code>"debounce(250)"</code> and reactive
        state driving a modal results panel.`,
    brandHref: "live-examples.html",
    brandText: `Aktion · search`,
    backHref: "live-examples.html",
    backText: `← Back to live examples`,
    cards: [
    {
      id: null,
      heading: `Live preview`,
      lede: `Type in the search box — results filter after 250ms of inactivity.
        Click a result to "navigate" (just updates <code>$selected</code>).`,
      codeBlocks: [
      { codeId: "src-search", content: `$query = ""
$open = true
$selected = null
$results = []

allItems = [
  {id: "1", title: "Dashboard",       category: "Pages",    icon: "chart-pie"},
  {id: "2", title: "User settings",   category: "Pages",    icon: "gear"},
  {id: "3", title: "Create project",  category: "Actions",  icon: "plus"},
  {id: "4", title: "Invite teammate", category: "Actions",  icon: "user-plus"},
  {id: "5", title: "Billing",         category: "Pages",    icon: "credit-card"},
  {id: "6", title: "Export data",     category: "Actions",  icon: "file-csv"},
  {id: "7", title: "API keys",        category: "Settings", icon: "key"},
  {id: "8", title: "Webhooks",        category: "Settings", icon: "link"},
  {id: "9", title: "Dark mode",       category: "Settings", icon: "moon"},
  {id: "10", title: "Notifications",  category: "Settings", icon: "bell"}
]

effect(() => {
  $results = $query.length > 0 ? allItems.filter((item) => item.title.toLowerCase().includes($query.toLowerCase())) : allItems
}, [$query, "debounce(250)"])

function selectItem(id) {
  $selected = allItems.filter((i) => i.id == id)[0]
}

searchInput = Card([
  SectionHeader("Command palette", { subtitle: "Search anything", eyebrow: "SEARCH",
    status: Badge("⌘K", { tone: "neutral", size: "sm" }) }),
  SearchBar("query", { placeholder: "Type to search…", value: $query })
])

resultsList = Card([
  SectionHeader("Results", { subtitle: \`\${$results.length} matches\`, eyebrow: "RESULTS" }),
  $results.length > 0
    ? Stack(
        $results.map(item => Stack([
          Icon(item.icon, { size: "sm" }),
          Stack([Text(item.title, { variant: "body-heavy" }), Badge(item.category, { tone: "neutral", size: "sm" })], { direction: "row", gap: "xs" }),
          Button("Go", { action: () => { selectItem(item.id) }, variant: "ghost", size: "small" })
        ], { direction: "row", gap: "m", align: "center", justify: "between" })),
        { direction: "column", gap: "xs" }
      )
    : EmptyState("No results", { description: "Try a different search term.", icon: "magnifying-glass" })
])

selectedCard = $selected != null
  ? Card([
      SectionHeader(\`Selected: \${$selected.title}\`, { eyebrow: "DETAIL",
        status: Badge($selected.category, { tone: "primary", size: "sm" }) }),
      Text(\`You selected "\${$selected.title}" from the \${$selected.category} group.\`, { variant: "body" }),
      Buttons([Button("Clear selection", { action: () => { $selected = null }, variant: "ghost" })])
    ])
  : null

aktion = Stack([
  PageHeader("Chat search", { subtitle: "Command-palette style search with debounce", breadcrumbs: ["Tools", "Search"] }),
  searchInput,
  Grid([resultsList, selectedCard], { columns: {sm: 1, md: 2}, gap: "l" })
], { direction: "column", gap: "l" })` }
      ],
      render: { elId: "rui-search", theme: "light" },
      extraHtml: ``,
    }
    ],
    setup(){
const el = document.getElementById("rui-search");
    el.setResponse(document.getElementById("src-search").textContent);
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
  wireThemeSwitcher();
} else {
  document.title = example.docTitle;
  root.innerHTML = renderShell(example);
  highlightCode();
  wireThemeSwitcher();
  wireCopyButtons();
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
    ${renderTopbar("live-examples.html", "Aktion · live example", "live-examples.html", "← Back to live examples")}
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

function renderTopbar(brandHref, brandText, backHref, backText) {
  const themeButtons = ["light", "dark", "neon", "pastel", "glass", "brutalist", "skyline"].map(
    (t) => `<button data-theme="${t}" aria-pressed="false">${t[0].toUpperCase() + t.slice(1)}</button>`
  ).join("");
  return `
    <header class="example-topbar">
      <div class="example-topbar-left">
        <a class="example-brand" href="${brandHref}"><span class="dot"></span>${brandText}</a>
        <a class="example-back" href="${backHref}">${backText}</a>
      </div>
      <div class="example-topbar-right">
        <nav class="theme-switcher" aria-label="Theme">${themeButtons}</nav>
        <a class="example-playground-link" href="playground.html" target="_blank">Open in playground</a>
      </div>
    </header>`;
}

function renderShell(ex) {
  const cardsHtml = ex.cards.map(renderCard).join("");
  return `
    ${renderTopbar(ex.brandHref, ex.brandText, ex.backHref, ex.backText)}
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
  const hasSource = card.codeBlocks.length > 0;
  const hasOutput = !!card.render;
  const extra = card.extraHtml || "";

  const codeBlocks = card.codeBlocks
    .map((cb) => {
      const codeIdAttr = cb.codeId ? ` id="${cb.codeId}"` : "";
      return `
        <div class="example-source-panel">
          <div class="example-source-header">
            <span class="example-source-label">Aktion source</span>
            <button class="example-copy-btn" data-copy-target="${cb.codeId || ""}">Copy</button>
          </div>
          <pre class="example-source"><code${codeIdAttr}>${cb.content}</code></pre>
        </div>`;
    })
    .join("");

  const output = hasOutput
    ? `<div class="example-output"><aktion-app id="${card.render.elId}" theme="${card.render.theme}"></aktion-app></div>`
    : "";

  if (hasSource && hasOutput) {
    return `<article class="example-card"${idAttr}>${heading}${lede}<div class=""><div>${output}</div><div>${codeBlocks}</div></div>${extra}</article>`;
  }
  return `<article class="example-card"${idAttr}>${heading}${lede}${codeBlocks}${output}${extra}</article>`;
}

function highlightCode() {
  document.querySelectorAll(".example-source code").forEach((el) => {
    if (el.dataset.highlighted) return;
    el.dataset.highlighted = "1";
    el.innerHTML = tokenize(el.textContent);
  });
}

function tokenize(src) {
  return src.replace(
    /(@\w+)|(\$\w+)|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:function|let|const|var|if|else|for|of|switch|case|break|default|return|effect|aktion|true|false|null)\b)|(\b\d+(?:\.\d+)?\b)|([A-Z][A-Za-z0-9]*(?=\s*\())/g,
    (m, builtin, state, comment, str, kw, num, comp) => {
      if (builtin) return `<span class="tk-builtin">${escapeHtml(builtin)}</span>`;
      if (state) return `<span class="tk-state">${escapeHtml(state)}</span>`;
      if (comment) return `<span class="tk-comment">${escapeHtml(comment)}</span>`;
      if (str) return `<span class="tk-string">${escapeHtml(str)}</span>`;
      if (kw) return `<span class="tk-kw">${escapeHtml(kw)}</span>`;
      if (num) return `<span class="tk-number">${escapeHtml(num)}</span>`;
      if (comp) return `<span class="tk-comp">${escapeHtml(comp)}</span>`;
      return m;
    }
  );
}

function wireThemeSwitcher() {
  const switcher = document.querySelector(".theme-switcher");
  if (!switcher) return;
  const buttons = switcher.querySelectorAll("button");
  const aktionEls = () => document.querySelectorAll("aktion-app");

  function setTheme(name) {
    buttons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.theme === name ? "true" : "false"));
    aktionEls().forEach((el) => el.setAttribute("theme", name));
  }

  const initial = document.querySelector("aktion-app")?.getAttribute("theme") || "light";
  setTheme(initial);

  buttons.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
}

function wireCopyButtons() {
  document.querySelectorAll(".example-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.copyTarget;
      const code = target
        ? document.getElementById(target)
        : btn.closest(".example-source-panel")?.querySelector("code");
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(() => {
        btn.classList.add("copied");
        btn.textContent = "Copied!";
        setTimeout(() => { btn.classList.remove("copied"); btn.textContent = "Copy"; }, 1800);
      });
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
