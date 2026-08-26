# Application patterns

Complete, validated programs to adapt. Every block below is checked against the
real component library on every `npm run build` — if a signature changes, the
build fails rather than shipping a broken example.

Adapt the structure, not the copy. Each one hits the density target for its page
type; see [`layout.md`](layout.md).

---

## Dashboard

`PageHeader` + `Toolbar` + `Stats` + chart + table + follow-ups — six sections.

```aktion
$app(Column([
  PageHeader("Revenue", { subtitle: "Last 30 days", actions: [Button("Export", { icon: "download", variant: "secondary" })] }),
  kpis,
  charts,
  orders,
  activity,
], { gap: "lg" }))

$range = "30d"
$orders = $http({ url: "https://api.example.com/orders" })

kpis = Stats([
  StatCard("Revenue", { value: "$48,120", trend: "up", delta: "+12%" }),
  StatCard("Orders", { value: "1,204", trend: "up", delta: "+3%" }),
  StatCard("Refunds", { value: "18", trend: "down", delta: "-2%", tone: "warning" }),
  StatCard("Customers", { value: "892", trend: "up", delta: "+8%" }),
], { layout: "grid" })

charts = Grid([
  Card([
    SectionHeader("Revenue over time", { actions: [ToggleGroup("range", { items: ["7d", "30d", "90d"], value: $range })] }),
    LineChart({ labels: ["W1", "W2", "W3", "W4"], series: [Series("Revenue", [12, 18, 15, 22])], filled: true }),
  ]),
  Card([
    SectionHeader("By channel"),
    PieChart({ labels: ["Direct", "Search", "Social"], values: [48, 32, 20] }),
  ]),
], { columns: { base: 1, lg: 2 }, gap: "lg" })

orders = Card([
  SectionHeader("Recent orders", { status: Pill("Live", { tone: "success" }) }),
  Toolbar({ searchable: true, searchPlaceholder: "Search orders…" }),
  Async($orders, {
    loading: Skeleton({ variant: "table-row", lines: 5 }),
    error: ErrorState("Could not load orders", { description: "Retry in a moment." }),
    empty: EmptyState("No orders yet"),
    data: Table([
      Col("Order", $orders.data.id),
      Col("Customer", $orders.data.customer),
      Col("Total", $orders.data.total, { format: "currency", align: "right" }),
    ], { density: "compact", sticky: true }),
  }),
])

activity = Card([
  SectionHeader("Activity"),
  Timeline([
    TimelineItem("Order #1204 shipped", { time: "2h ago", icon: "truck", tone: "success" }),
    TimelineItem("Refund issued", { time: "5h ago", icon: "rotate-left", tone: "warning" }),
    TimelineItem("New customer", { time: "1d ago", icon: "user-plus" }),
  ]),
])
```

---

## Full app surface — shell + nested routing

An `AppShell` keeps navigation visible across route changes.

```aktion
function Dashboard() {
  return Column([
    PageHeader("Dashboard"),
    Stats([StatCard("Open", { value: "12" }), StatCard("Closed", { value: "340" })]),
    Card([SectionHeader("Recent"), List(["Order #1204", "Order #1203"])]),
  ], { gap: "lg" })
}

function Orders() {
  return Column([
    PageHeader("Orders", { breadcrumbs: ["Home", "Orders"] }),
    Card([
      Toolbar({ searchable: true }),
      Table([Col("Order", ["#1204", "#1203"]), Col("Status", ["Shipped", "Paid"])]),
    ]),
  ], { gap: "lg" })
}

function OrderDetail(id) {
  return Column([
    PageHeader(`Order ${id}`, { breadcrumbs: ["Home", "Orders", id] }),
    Card([
      SectionHeader("Summary"),
      DescriptionList([
        DescriptionItem("Status", Pill("Shipped", { tone: "success" })),
        DescriptionItem("Total", "$248.00"),
        DescriptionItem("Placed", "3 Jul 2026"),
      ]),
    ]),
  ], { gap: "lg" })
}

function NotFound() { return EmptyState("Page not found", { icon: "compass" }) }

nav = Sidebar([
  SidebarSection("Main", [
    SidebarItem("Dashboard", { icon: "gauge", active: true }),
    SidebarItem("Orders", { icon: "receipt", badge: "12" }),
  ]),
  SidebarSection("Settings", [SidebarItem("Team", { icon: "users" })]),
], { brand: "Acme", tagline: "Ops console" })

pages = $router({
  "/": Dashboard(),
  "/orders": Orders(),
  "/orders/:id": OrderDetail(params.id),
  default: NotFound(),
})

$app(AppShell(nav, [pages], { collapsible: true }))
```

---

## Settings page

One Card per concern, each opened by a `SectionHeader`, closing with a danger
zone.

```aktion
$name = "Acme Inc"
$email = "ops@acme.test"
$notifyEmail = true
$notifyPush = false
$plan = "team"

function save() { $toast.success("Settings saved") }

$app(Container(Column([
  PageHeader("Settings", { subtitle: "Manage your workspace" }),
  Card([
    SectionHeader("General"),
    FormSection("Workspace", [
      FormControl("Name", Input("name", { value: $name })),
      FormControl("Billing email", Input("email", { value: $email, type: "email" })),
    ]),
  ]),
  Card([
    SectionHeader("Notifications"),
    FormSection("Channels", [
      FormControl("Email digests", Switch("notify-email", { checked: $notifyEmail })),
      FormControl("Push alerts", Switch("notify-push", { checked: $notifyPush })),
    ], { helper: "We only send what you ask for." }),
  ]),
  Card([
    SectionHeader("Plan", { status: Pill("Active", { tone: "success" }) }),
    ToggleGroup("plan", { items: ["solo", "team", "enterprise"], value: $plan }),
    Text("Team includes 10 seats and priority support.", { tone: "muted" }),
  ]),
  Card([
    SectionHeader("Danger zone"),
    Callout("Delete this workspace", { tone: "danger", description: "This cannot be undone.", actions: [Button("Delete", { variant: "danger", icon: "trash" })] }),
  ]),
  Buttons([Button("Save changes", { variant: "primary", action: save }), Button("Cancel", { variant: "ghost" })]),
], { gap: "lg" }), { size: "md" }))
```

---

## Inbox — master/detail

```aktion
$selected = "1"

messages = [
  { id: "1", from: "Ada Lovelace", subject: "Deploy window", time: "09:12", unread: true },
  { id: "2", from: "Alan Turing", subject: "Test results", time: "08:40", unread: false },
]

list = Column([
  Toolbar({ searchable: true, searchPlaceholder: "Search mail…" }),
  Column(messages.map(m => Notification(m.from, {
    message: m.subject,
    time: m.time,
    unread: m.unread,
    avatarSrc: "",
  })), { gap: "xs" }),
], { gap: "sm" })

thread = Column([
  SectionHeader("Deploy window", { subtitle: "Ada Lovelace · 09:12" }),
  Column([
    ChatBubble("Ada Lovelace", { body: "Can we ship Thursday 14:00?", time: "09:12" }),
    ChatBubble("You", { body: "Works — I'll prep the release notes.", time: "09:15", from: "me" }),
  ], { gap: "sm" }),
  Card([
    TextArea("reply", { placeholder: "Write a reply…", rows: 4 }),
    Buttons([Button("Send", { variant: "primary", icon: "paper-plane" }), Button("Discard", { variant: "ghost" })]),
  ]),
], { gap: "md" })

$app(Column([
  PageHeader("Inbox", { status: Pill("2 unread", { tone: "activating" }) }),
  SplitView([list], [thread], { primaryWidth: "360px" }),
], { gap: "lg" }))
```

---

## Landing page — Navbar, not AppShell

```aktion
$app(Column([
  Navbar({
    brand: "Aktion",
    items: [NavbarItem("Features"), NavbarItem("Pricing"), NavbarItem("Docs")],
    actions: [Button("Get started", { variant: "primary" })],
    sticky: true,
  }),
  Hero("Generative UI, in one web component", {
    eyebrow: "Now in 0.5",
    subtitle: "Turn a compact DSL into a rich, interactive interface — in any framework, or none.",
    primary: Button("Start building", { variant: "primary", icon: "rocket" }),
    secondary: Button("Read the docs", { variant: "secondary" }),
    highlights: ["282 components", "6 themes", "Zero dependencies"],
  }),
  Container(Column([
    Section([
      SectionHeader("Why Aktion", { eyebrow: "Features" }),
      FeatureGrid([
        FeatureItem("Streaming-first", { description: "Statements commit as they arrive.", icon: "bolt" }),
        FeatureItem("Schema-as-truth", { description: "Unknown props are errors, not silent no-ops.", icon: "shield-check" }),
        FeatureItem("Themeable", { description: "Six built-in themes, 86 tokens.", icon: "palette" }),
      ]),
    ]),
    Section([
      SectionHeader("Loved by teams", { eyebrow: "Testimonials" }),
      Grid([
        Testimonial("It replaced three internal UI kits.", { author: "Grace H.", role: "Staff Engineer", rating: 5 }),
        Testimonial("Our LLM output finally looks designed.", { author: "Ken T.", role: "Product Lead", rating: 5 }),
      ], { columns: { base: 1, md: 2 }, gap: "lg" }),
    ]),
    Section([
      SectionHeader("Pricing", { eyebrow: "Plans" }),
      PricingTable([
        PricingCard("Solo", { price: "$0", period: "forever", features: ["1 project", "Community support"], action: Button("Start", { variant: "secondary" }) }),
        PricingCard("Team", { price: "$29", period: "per month", features: ["Unlimited projects", "Priority support"], action: Button("Choose Team", { variant: "primary" }), featured: true }),
      ]),
    ]),
  ], { gap: "2xl" }), { size: "lg" }),
  Banner("Ready to try it?", { message: "Scaffold a project in one command.", tone: "primary", action: Button("npm create aktion", { variant: "primary", icon: "terminal" }) }),
  Footer("Aktion", {
    tagline: "Generative UI in one web component.",
    columns: [
      FooterColumn("Product", { links: [Link("Features"), Link("Pricing"), Link("Changelog")] }),
      FooterColumn("Docs", { links: [Link("Get started"), Link("Components"), Link("Playground")] }),
    ],
  }),
], { gap: "none" }))
```

---

## Form with validation and a write

`$form` owns values, rules, and submission; `$mutation` performs the write.

```aktion
function onSubmit(values) {
  $save.mutate({ body: values })
}

$save = $mutation({ url: "https://api.example.com/signup", method: "POST" })

signup = $form({
  values: { name: "", email: "", plan: "team" },
  rules: {
    name: [$util.rules.required()],
    email: [$util.rules.required(), $util.rules.email()],
  },
  onSubmit: onSubmit,
})

$app(Container(Column([
  PageHeader("Create your workspace", { subtitle: "Two minutes, no card required" }),
  Card([
    SectionHeader("Details"),
    ValidationSummary(signup.errors),
    FormSection("About you", [
      FormControl("Name", Input("name", { value: signup.values.name, error: signup.errors.name })),
      FormControl("Work email", Input("email", { type: "email", value: signup.values.email, error: signup.errors.email })),
    ]),
    FormSection("Plan", [
      FormControl("Choose a plan", SegmentedControl("plan", { items: ["solo", "team", "enterprise"], value: signup.values.plan })),
    ]),
    Buttons([
      Button("Create workspace", { variant: "primary", loading: $save.loading, action: () => signup.handleSubmit() }),
      Button("Cancel", { variant: "ghost" }),
    ]),
  ]),
], { gap: "lg" }), { size: "sm" }))
```

---

## Data explorer — DataGrid with sort, filter, selection, paging

```aktion
$sort = { key: "total", direction: "desc" }
$selectedIds = []
$page = 1

rows = [
  { id: "1204", customer: "Ada Lovelace", total: 248, status: "Shipped" },
  { id: "1203", customer: "Alan Turing", total: 132, status: "Paid" },
  { id: "1202", customer: "Grace Hopper", total: 99, status: "Refunded" },
]

function exportSelected() { $toast.info(`Exporting ${$selectedIds.length} rows`) }

$app(Column([
  PageHeader("Orders", { subtitle: "Sort, filter, and export" }),
  Stats([
    { label: "Total", value: "$479" },
    { label: "Orders", value: "3" },
    { label: "Refunds", value: "1", tone: "warning" },
  ], { layout: "strip" }),
  Card([
    SectionHeader("All orders"),
    DataGrid([
      Col("Order", rows.id, { sortable: true }),
      Col("Customer", rows.customer, { sortable: true, filterable: true }),
      Col("Total", rows.total, { format: "currency", align: "right", sortable: true }),
      Col("Status", rows.status, { filterable: true }),
    ], {
      rowIds: rows.id,
      sort: $sort,
      selectable: true,
      selectedIds: $selectedIds,
      page: $page,
      perPage: 25,
      stickyHeader: true,
      toolbar: Toolbar({ right: [Button("Export", { icon: "download", action: exportSelected })] }),
    }),
  ]),
], { gap: "lg" }))
```

---

## Kanban board

```aktion
$app(Column([
  PageHeader("Sprint 24", { subtitle: "12 issues in flight" }),
  Toolbar({ left: [FilterChips(["Assigned to me", "High priority"])], right: [Button("New issue", { variant: "primary", icon: "plus" })] }),
  KanbanBoard([
    KanbanColumn("Backlog", {
      items: [
        KanbanCard("Audit component props", { tags: ["chore"], assignee: "Ada" }),
        KanbanCard("Ship dark theme fixes", { tags: ["bug"], assignee: "Alan" }),
      ],
    }),
    KanbanColumn("In progress", {
      items: [KanbanCard("Rewrite the prompt generator", { tags: ["feature"], assignee: "Grace" })],
      tone: "primary",
    }),
    KanbanColumn("Done", {
      items: [KanbanCard("Fix the validators", { tags: ["chore"], assignee: "Ken" })],
      tone: "success",
    }),
  ]),
], { gap: "lg" }))
```

---

## Polling and cleanup

An `$effect` with an interval token, plus explicit teardown.

```aktion
$health = $http({ url: "https://api.example.com/health" })
$ticks = 0

$effect(() => { $health.refetch(); $ticks += 1 }, ["every(10000)"])

$effect(() => {
  const id = setInterval(() => { $ticks += 1 }, 1000)
  cleanup(() => clearInterval(id))
}, ["mount"])

$app(Column([
  PageHeader("Service health", { status: StatusDot("Polling", { tone: "success", pulse: true }) }),
  Card([
    SectionHeader("Status", { subtitle: `Checked ${$ticks} times` }),
    Async($health, {
      loading: LoadingState("Checking services…"),
      error: ErrorState("Health check failed"),
      empty: EmptyState("No services registered"),
      data: DescriptionList([
        DescriptionItem("API", Pill("Operational", { tone: "success" })),
        DescriptionItem("Workers", Pill("Degraded", { tone: "warning" })),
      ]),
    }),
  ]),
], { gap: "lg" }))
```

---

## Persisted store with undo/redo

```aktion
doc = $store({
  persist: "editor-doc",
  history: true,
  title: "Untitled",
  tags: [],
  setTitle: (s, value) => { s.title = value },
  addTag: (s, tag) => { s.tags = [...s.tags, tag] },
})

$draft = ""

function addTag() {
  if ($draft.length > 0) { doc.addTag($draft); $draft = "" }
}

$app(Container(Column([
  PageHeader("Editor", { subtitle: "Saved to local storage, with full undo history" }),
  Card([
    SectionHeader("Document", {
      actions: [
        Button("Undo", { icon: "rotate-left", variant: "ghost", disabled: !doc.canUndo, action: () => doc.undo() }),
        Button("Redo", { icon: "rotate-right", variant: "ghost", disabled: !doc.canRedo, action: () => doc.redo() }),
      ],
    }),
    FormSection("Title", [FormControl("Title", Input("title", { value: doc.title, onChange: doc.setTitle }))]),
    FormSection("Tags", [
      FormControl("Add a tag", InputGroup(Input("tag", { value: $draft, placeholder: "release" }), { action: Button("Add", { action: addTag }) })),
      BadgeList(doc.tags, { variant: "info" }),
    ]),
  ]),
], { gap: "lg" }), { size: "md" }))
```

## Testing a multi-file app

`render(source)` takes a program **string**, which cannot express an app whose
entry `import`s other modules — the linker resolves those at build time, so the
entry's text is not a runnable program. Mount the compiled artefact instead.

```ts
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { renderCompiled, cleanup, coverage, json } from "aktion-runtime/test";
import app from "../src/app.aktion";        // a CompiledProgram (Vite plugin)

beforeAll(() => { coverage.start(); });
afterEach(cleanup);
afterAll(() => { writeFileSync("coverage/aktion.lcov", coverage.toLcov()); });

it("lists the rows the API returned", async () => {
  const screen = renderCompiled(app, {
    route: "/clusters",
    fetch: (url) => json({ items: [{ id: "1", properties: { name: "alpha" } }] }),
  });

  expect(await screen.findByRole("link", { name: "alpha" })).toBeDefined();
  expect(screen.requests[0].url).toContain("/k8s?depth=3");
});
```

Four things to get right, each of which silently produces a passing test that
proves nothing otherwise:

1. **`$state` names are mangled in a linked program.** The linker gives every
   non-entry module private scope by renaming its atoms — `$filter` declared in
   `lib/store.aktion` is `__a4_filter` in `serializeState()`, and the number comes
   from import traversal order, so an added import renumbers it.
   `screen.state.get("filter")` resolves the bare name for you; never hard-code
   the prefix.
2. **`getByRole(role, { name })` matches the accessible name EXACTLY.** Pass a
   regex or `{ exact: false }` for a substring. Remember the name includes
   visually-hidden text: an external `Link` is `"Learn more (opens in new tab)"`.
3. **`state.set` is a reactive write; `state.hydrate` restores a host snapshot.**
   Use `set` to simulate an interaction (derived atoms recompute, and the value is
   still the program's own on a replan); use `hydrate` for SSR / resume tests.
4. **Coverage of a `.aktion` file is interpreter-level, not V8.** The plugin emits
   `JSON.parse("<AST>")`, so V8 reports ~100% for any DSL file. Exclude
   `**/*.aktion` from the V8 report and gate on `coverage.report()` instead.
   Outside a DOM — a Vitest `globalSetup`, a CI script — import the identical API
   from `aktion-runtime/coverage`, which has no DOM dependency.

To unit-test a helper module directly (rather than through the UI), compile an
inline program that imports the real file. Coverage is keyed by path, so the hits
land on that file:

```ts
import { compileAktionSource } from "aktion-runtime/vite";

const probe = compileAktionSource(
  `import { formatBytes } from "./src/lib/format.aktion"\n` +
  `$app(Text(formatBytes(2048)))`,
  "tests/probe.aktion",
  { root: process.cwd() },
);
const screen = renderCompiled(probe);
```
