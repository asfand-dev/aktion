// Positive fixture for the pattern / chart / wrapper components
// (src/library/components/{new-components,patterns,advanced-patterns,charts,
// scheduling,wrappers}.ts): the call shapes their renderers accept and the
// curated types must therefore accept too. Nothing here is expected to fail.
import {
  Banner, Calendar, Drawer, Gantt, Hero, LineChart, OnFocus, PageHeader, PersonChip, Pill,
  QueryBuilder, ResizablePanels, ScatterChart, SectionHeader, Series, SplitView, StatCard, Stats,
  StatusDot, Sticky, Text, Tour, Truncate,
  type Children,
} from "aktion-runtime/dsl";

export let $rules: { field?: string; op?: string; value?: string | number }[] = [];
export let $step = 0;

export function Patterns(): Children {
  return [
    // `text` is optional: `child` replaces it.
    Truncate({ child: Text("formatted body"), maxLines: 2 }),
    Truncate("plain text", { maxLines: 2 }),
    // `current` is optional: an unbound tour advances itself from step 0.
    Tour(["Welcome", { title: "Filters", description: "Narrow the list" }]),
    Tour(["a", "b"], { current: $step }),
    // `title` is optional (the dialog is then named "Drawer").
    Drawer({ open: true, children: [Text("body")] }),
    // CSS lengths that flow through sanitiseCssLength take a plain number.
    Drawer("Details", { open: true, children: [Text("body")], width: 720 }),
    Hero({ title: "Launch", layout: "cover", height: 320 }),
    SplitView([Text("list")], { detail: [Text("detail")], primaryWidth: 280 }),
    Sticky([Text("toolbar")], { offset: 8 }),
    ResizablePanels([Text("a")], { secondary: [Text("b")], initialPrimaryWidth: "40%", minPrimaryWidth: 200, minSecondaryWidth: 0 }),
    // Legacy t-shirt spellings are canonicalised before render.
    PersonChip("Ada", { size: "large" }),
    PersonChip("Grace", { size: "sm" }),
    // A real status node type (the spec used to name a nonexistent `Tag`).
    SectionHeader("Billing", { status: Pill("Active") }),
    SectionHeader("Health", { badge: StatusDot("Online") }),
    // Objects and StatCard nodes may be mixed.
    Stats([{ label: "MRR", value: "$12k", tone: "success" }, StatCard("Churn", { value: "2%" })]),
    Stats([{ label: "Users", value: 1200, spark: [1, 3, 2] }], { layout: "grid", columns: 3 }),
    // `onClick` fires alongside `href`.
    Banner("Release notes", { href: "/changelog", onClick: () => {} }),
    // `today`: true, an ISO date or an epoch-ms timestamp; `name` / `status` aliases.
    Gantt([{ name: "Build", start: "2026-01-01", end: "2026-01-05", status: "info" }], { today: Date.now() }),
    Gantt([{ label: "Ship", start: "2026-01-06", end: "2026-01-09", tone: "muted" }], { today: true }),
    Gantt([{ label: "QA", start: "2026-01-06", end: "2026-01-09" }], { today: "2026-01-07" }),
    // `title` / `tone` aliases on an event chip.
    Calendar({ events: ["2026-01-02", { date: "2026-01-03", title: "Standup", tone: "info" }] }),
    // A crumb spelt with `title`.
    PageHeader("Orders", { breadcrumbs: ["Home", { title: "Shop", to: "/shop" }, { label: "Orders" }] }),
    // A gap has no point, so the clicked value is always a number.
    LineChart({
      data: [{ x: "Jan", a: 1 }, { x: "Feb", a: null }, { label: "Mar", a: "3", region: "eu" }],
      filled: true,
      stacked: true,
      onPointClick: (label, value, seriesName) => { Text(`${label} ${value.toFixed(1)} ${seriesName}`); },
    }),
    // ScatterChart points as tuples, in `values` or `points`.
    ScatterChart([Series("A", [[1, 2, "p"], [3, 4]]), Series("B", { points: [{ x: 1, y: 2 }, [2, 3]] })]),
    // A bound `value` and `onChange` together.
    QueryBuilder(["name", { name: "price", type: "Currency" }], {
      value: $rules,
      operators: [{ value: "gt", label: "more than", type: "currency" }],
      onChange: (rules) => { $rules = rules; },
    }),
    OnFocus(Text("group"), { onFocus: (event) => event.type, onBlur: (event) => event.relatedTarget }),
  ];
}
