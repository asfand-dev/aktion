/**
 * Live example shell.
 *
 * Renders any bundled live example on demand via the `?example=<slug>`
 * query parameter. Each entry in EXAMPLES is a self-contained Aktion
 * program: { name, slug, code }.
 */

export const EXAMPLES = [
  {
    name: "Data explorer",
    slug: "data-explorer",
    code: `$page = 1
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
], { direction: "column", gap: "l" })`,
  },
  {
    name: "Media gallery",
    slug: "media-gallery",
    code: `$slide = 0
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
], { direction: "column", gap: "l" })`,
  },
  {
    name: "Multi-page routing",
    slug: "routing-demo",
    code: `$users = [
  {id: "ada",   name: "Ada Lovelace", role: "Founding engineer",   joined: "2019-04-02"},
  {id: "grace", name: "Grace Hopper", role: "Compiler researcher", joined: "2020-01-15"},
  {id: "lin",   name: "Lin-Manuel",   role: "Product designer",    joined: "2021-08-21"},
  {id: "ken",   name: "Ken Thompson", role: "Platform engineer",   joined: "2018-11-04"}
]

$visits = 0
$lastEdited = "—"

aktion = Stack([nav, main])

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

notFoundPage = Callout("Not found", { tone: "warning", description: \`No page matches \${route}. Use the nav above or go back to /.\` })`,
  },
  {
    name: "Settings app",
    slug: "settings-app",
    code: `$tab = "general"
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

aktion = Stack([header, saveBanner, tabs, confirmSheet], { direction: "column", gap: "l" })`,
  },
  {
    name: "Kanban board",
    slug: "kanban-pro",
    code: `$columns = [
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
], { direction: "column", gap: "l" })`,
  },
  {
    name: "Analytics pulse",
    slug: "analytics-pulse",
    code: `$events = [
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
], { direction: "column", gap: "l" })`,
  },
  {
    name: "Recipe explorer",
    slug: "recipe-explorer",
    code: `$query = ""
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
], { direction: "column", gap: "l" })`,
  },
  {
    name: "Expense tracker",
    slug: "expense-tracker",
    code: `$tab = "list"
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
], { direction: "column", gap: "l" })`,
  },
  {
    name: "Todos CRUD",
    slug: "todos-crud",
    code: `base = "https://mock-api-one-chi.vercel.app/api/mock/todo"

$todos     = Http({ url: base + "/todos" })
$draft     = ""
$editingId = null
$editTitle = ""

function addTodo() {
  if (!$draft) { return }
  $create = Http({ url: base + "/todos", method: "POST", body: { title: $draft } })
  $draft  = ""
  $create.onDone = () =&gt; {
    $todos.refetch()  
  }
}

function toggleTodo(todo) {
  $patch = Http({
    url:    base + "/todos/" + todo.id,
    method: "PATCH",
    body:   { isCompleted: !todo.isCompleted }
  })
  $patch.onDone = () =&gt; {
    $todos.refetch()
  }
}

function startEdit(todo) {
  $editingId = todo.id
  $editTitle = todo.title
}

function saveEdit(todo) {
  $update = Http({
    url:    base + "/todos/" + todo.id,
    method: "PUT",
    body:   { title: $editTitle, isCompleted: todo.isCompleted }
  })
  $editingId = null
  $editTitle = ""
  $update.onDone = () =&gt; {
    $todos.refetch()
  }
}

function deleteTodo(todo) {
  $del = Http({ url: base + "/todos/" + todo.id, method: "DELETE" })
  $del.onDone = () =&gt; {
    $todos.refetch()
  }
}

todoRow = todo =&gt; $editingId == todo.id
  ? Stack([
      Input("edit-" + todo.id, { value: $editTitle, placeholder: "Todo title" }),
      Button("Save",   { action: () =&gt; saveEdit(todo), variant: "primary", size: "small", icon: "check" }),
      Button("Cancel", { action: () =&gt; { $editingId = null }, variant: "ghost", size: "small" })
    ], { direction: "row", gap: "s", align: "center" })
  : Stack([
      Checkbox("done-" + todo.id, { value: todo.isCompleted, onChange: () =&gt; toggleTodo(todo) }),
      Text(todo.title, { tone: todo.isCompleted ? "muted" : "default" }),
      Button("Edit",   { action: () =&gt; startEdit(todo),  variant: "ghost", size: "small", icon: "pen" }),
      Button("Delete", { action: () =&gt; deleteTodo(todo), variant: "ghost", tone: "danger", size: "small", icon: "trash" })
    ], { direction: "row", gap: "s", align: "center", justify: "between" })

composer = Card([
  SectionHeader("New todo", { eyebrow: "CREATE" }),
  Stack([
    Input("draft", { placeholder: "What needs doing?", value: $draft }),
    Button("Add", { action: addTodo, variant: "primary", icon: "plus" })
  ], { direction: "row", gap: "s" })
])

list = Card([
  SectionHeader("Todos", {
    eyebrow: "LIST",
    subtitle: "Backed by a live REST API",
    status: Button("Refresh", { action: $todos.refetch, variant: "ghost", size: "small", icon: "rotate" })
  }),
  Async($todos, {
    loading: LoadingState("Loading todos…"),
    error:   ErrorState("Couldn't load todos", { description: "The mock API may be waking up — hit Refresh." }),
    empty:   EmptyState("No todos yet", { description: "Add your first todo above.", icon: "list-check" }),
    data:    Stack($todos.data.map(todoRow), { direction: "column", gap: "s" })
  })
])

aktion = Stack([
  PageHeader("Todos", {
    subtitle: "Create, toggle, edit and delete — every action is a real Http({...}) call",
    breadcrumbs: ["Demos", "Todos CRUD"]
  }),
  composer,
  list
], { direction: "column", gap: "l" })`,
  },
];

import "../../dist/aktion.js";

const THEMES = ["light", "dark", "neon", "pastel", "glass", "brutalist", "skyline"];

const root = document.getElementById("example-root");
if (root) {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("example") || EXAMPLES[0].slug;
  const example = EXAMPLES.find((e) => e.slug === slug);

  if (!example) {
    document.title = "Example not found · Aktion";
    root.innerHTML = renderNotFound(slug);
    wireThemeSwitcher();
  } else {
    document.title = `${example.name} · Aktion`;
    root.innerHTML = renderShell(example);
    highlightCode();
    wireThemeSwitcher();
    wireCopyButton();
    customElements.whenDefined("aktion-app").then(() => {
      const el = document.getElementById("rui-app");
      const codeEl = document.getElementById("src-app");
      if (el && codeEl) el.setResponse(codeEl.textContent);
    });
  }
}

function renderShell(ex) {
  return `
    ${renderTopbar(ex)}
    <section class="example-preview">
      <div class="example-output">
        <aktion-app id="rui-app" theme="light"></aktion-app>
      </div>
      <div class="example-source-panel">
        <div class="example-source-header">
          <span class="example-source-label">Aktion source</span>
          <button class="example-copy-btn">Copy</button>
        </div>
        <pre class="example-source"><code id="src-app">${ex.code}</code></pre>
      </div>
    </section>
  `;
}

function renderTopbar(ex) {
  const themeButtons = THEMES.map(
    (t) => `<button data-theme="${t}" aria-pressed="false">${t[0].toUpperCase() + t.slice(1)}</button>`
  ).join("");
  return `
    <header class="example-topbar">
      <div class="example-topbar-left">
        <a class="example-back" href="live-examples.html">\u2190 All examples</a>
        <h1 class="example-title">${ex.name}</h1>
      </div>
      <div class="example-topbar-right">
        <nav class="theme-switcher" aria-label="Theme">${themeButtons}</nav>
        <a class="example-playground-link" href="playground.html" target="_blank" rel="noopener">Open in playground</a>
      </div>
    </header>`;
}

function renderNotFound(badSlug) {
  const known = EXAMPLES
    .map((e) => `<li><a href="?example=${e.slug}">${e.name}</a></li>`)
    .join("");
  return `
    <header class="example-topbar">
      <div class="example-topbar-left">
        <a class="example-back" href="live-examples.html">\u2190 All examples</a>
        <h1 class="example-title">Example not found</h1>
      </div>
    </header>
    <section class="example-preview">
      <article class="example-source-panel" style="padding:20px">
        <p>No example named "${escapeHtml(badSlug)}". Pick one:</p>
        <ul>${known}</ul>
      </article>
    </section>
  `;
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
      if (state)   return `<span class="tk-state">${escapeHtml(state)}</span>`;
      if (comment) return `<span class="tk-comment">${escapeHtml(comment)}</span>`;
      if (str)     return `<span class="tk-string">${escapeHtml(str)}</span>`;
      if (kw)      return `<span class="tk-kw">${escapeHtml(kw)}</span>`;
      if (num)     return `<span class="tk-number">${escapeHtml(num)}</span>`;
      if (comp)    return `<span class="tk-comp">${escapeHtml(comp)}</span>`;
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

function wireCopyButton() {
  const btn = document.querySelector(".example-copy-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const code = document.getElementById("src-app");
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).then(() => {
      btn.classList.add("copied");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.classList.remove("copied"); btn.textContent = "Copy"; }, 1800);
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
