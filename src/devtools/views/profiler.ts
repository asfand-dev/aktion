/**
 * Performance — every commit on a chart against the 16ms frame budget; the
 * selected commit as a flame chart; ranked and aggregate component costs;
 * "why did this render"; rule-based insights; and the browser's Core Web
 * Vitals with INP broken into its phases.
 */

import { h, type Child } from "../core/vdom.js";
import type { ViewContext, ViewDefinition } from "../context.js";
import type { CommitRecord, ComponentRenderRecord } from "../protocol.js";
import { componentAggregates, type ComponentAggregate } from "../model.js";
import { layoutFlame, type FlameNode } from "../analysis/layout.js";
import { performanceInsights, type Insight } from "../analysis/insights.js";
import { rate, THRESHOLDS, type InteractionRecord } from "../analysis/vitals.js";
import { icon } from "../ui/icons.js";
import {
  button, chip, emptyState, fmtBytes, fmtMs, fmtPct, filterChip, meter, segmented, sparkline, spacer, stat, statGrid, viewbar, vsep, card, note,
} from "../ui/kit.js";
import { dataTable, split, type Column } from "../ui/layout.js";
import { commitChart, flameChart } from "../ui/charts.js";
import { atomChip, paneSize, setPaneSize } from "./common.js";

function selectedCommit(ctx: ViewContext): CommitRecord | null {
  const commits = ctx.model.commits;
  if (commits.length === 0) return null;
  return commits.find((c) => c.commitId === ctx.ui.selectedCommitId) ?? commits[commits.length - 1]!;
}

function commitKind(commit: CommitRecord): "initial" | "full" | "incremental" {
  return commit.initial ? "initial" : commit.fullRender ? "full" : "incremental";
}

function trigger(commit: CommitRecord): string {
  if (commit.initial) return "initial mount";
  if (commit.changedPaths.length > 0) return commit.changedPaths.map((p) => `$${p}`).join(", ");
  return "forced (an async result, effect, timer, or custom event)";
}

/* -------------------------------------------------------------------------- */

function flameView(ctx: ViewContext, commit: CommitRecord): Child {
  const { ui, model } = ctx;
  const previous = ctx.memo(`pf:prev:${commit.commitId}`, [commit.commitId], () => {
    const map = new Map<string, number>();
    for (const c of model.commits) {
      if (c.commitId >= commit.commitId) break;
      for (const record of c.components) if (record.phase !== "memo") map.set(record.instanceKey, record.selfTime);
    }
    return map;
  });
  const layout = ctx.memo(`pf:flame:${commit.commitId}`, [commit], () => layoutFlame(commit, previous));
  const height = Math.max(120, (layout.maxDepth + 1) * 20 + 10);
  const selected = layout.nodes.find((n) => n.key === ui.flameSelected) ?? null;
  const chart = h("div", { class: "pf-flame" },
    h("div", { class: "pf-flame-bar" },
      h("span", { class: "t3" }, `${layout.nodes.length} spans · ${fmtMs(layout.total)} measured`),
      spacer(),
      h("span", { class: "pf-legend" },
        h("i", { style: { background: "linear-gradient(90deg, rgb(48,196,170), rgb(235,200,70), rgb(255,96,110))" } }), "self time",
        h("i", { class: "is-memo" }), "memoised (skipped)"),
      h("span", { class: "t4" }, "wheel zooms · drag pans · double-click a span to focus")),
    h("div", { class: "pf-flame-scroll" },
      flameChart({
        nodes: layout.nodes,
        total: layout.total,
        maxSelf: layout.maxSelf,
        selected: ui.flameSelected,
        version: commit.commitId,
        height,
        ariaLabel: `Flame chart of commit ${commit.commitId}: ${layout.nodes.length} component spans`,
        testid: "flame-chart",
        onSelect: (key) => { ui.flameSelected = key; ctx.refresh(); },
        onHover: (key) => ctx.highlightInstance(key),
      })));
  const detail = selected ? spanDetail(ctx, commit, selected) : h("div", { class: "pf-side-empty" },
    icon("flame", { size: 20 }), h("div", {}, "Click a span to see why it rendered and what it cost."));
  if (ctx.width() < 760) return h("div", { class: "pf-col" }, chart, selected ? spanDetail(ctx, commit, selected) : null);
  return split({
    size: paneSize(ctx, "perf.flame", Math.round(ctx.width() * 0.66)),
    min: 320,
    onResize: (s) => setPaneSize(ctx, "perf.flame", s),
    first: chart,
    second: detail,
  });
}

function spanDetail(ctx: ViewContext, commit: CommitRecord, node: FlameNode): Child {
  const record = commit.components.find((c) => c.instanceKey === node.key);
  return h("div", { class: "pf-side", "data-dt": "span-detail" },
    h("div", { class: "pane-head" },
      h("span", { class: "pane-title" }, node.name),
      chip(node.kind, node.kind === "user" ? "accent" : "grey"),
      chip(node.phase, node.phase === "memo" ? "grey" : node.phase === "mount" ? "green" : "blue"),
      spacer(),
      button({ label: "Inspect", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(node.key) })),
    h("div", { class: "pane-body is-pad stack" },
      statGrid(
        stat({ label: "Self", value: node.phase === "memo" ? "—" : fmtMs(node.self), tone: node.self >= 8 ? "amber" : undefined }),
        stat({ label: "Total", value: fmtMs(node.total), foot: node.estimated ? "estimated (skipped)" : undefined }),
        stat({ label: "Depth", value: String(node.depth) })),
      h("div", {},
        h("div", { class: "it-sub" }, "Why it rendered"),
        h("div", { class: "pf-reason" }, icon(node.phase === "memo" ? "layers" : "info", { size: 14 }), h("span", {}, reasonText(node.reason, commit)))),
      node.deps && node.deps.length > 0 ? h("div", {},
        h("div", { class: "it-sub" }, "Reads"),
        h("div", { class: "chips" }, ...node.deps.map((dep) => atomChip(ctx, dep, commit.changedPaths.some((p) => p === dep || dep.startsWith(`${p}.`) || p.startsWith(`${dep}.`)) ? "amber" : "purple")))) : null,
      record?.props && record.props.length > 0 ? h("div", {},
        h("div", { class: "it-sub" }, `Props this commit (${record.props.length})`),
        h("div", { class: "it-attrs" }, ...record.props.slice(0, 20).map((prop) => h("div", { key: prop.name, class: "it-attr" },
          h("span", { class: "it-attr-k" }, prop.name),
          h("span", { class: `v t-${prop.value.type}` }, prop.value.preview))))) : null));
}

function reasonText(reason: string, commit: CommitRecord): string {
  switch (reason) {
    case "initial mount": return "First render of this instance.";
    case "no memo (full render)": return "It had no memoised value yet, so it rendered.";
    case "positional args changed": return "Its positional arguments changed since the last render.";
    case "named args changed": return "Its named arguments (props object) changed — a new object, array, or lambda counts as a change.";
    case "state dependency changed": return `A $state path it reads changed (${commit.changedPaths.map((p) => `$${p}`).join(", ") || "tracked"}).`;
    case "full render": return "Nothing it depends on changed: the whole commit was forced (an async resolution, effect, timer, or custom event), which bypasses memoisation. This render did no useful work.";
    case "memoized (args + deps unchanged)": return "Skipped: arguments and dependencies were unchanged, so the cached output was reused.";
    default: return reason;
  }
}

function rankedView(ctx: ViewContext, commit: CommitRecord): Child {
  const rows = commit.components.filter((c) => c.phase !== "memo").sort((a, b) => b.selfTime - a.selfTime);
  const max = rows[0]?.selfTime ?? 1;
  const columns: Column<ComponentRenderRecord>[] = [
    { key: "name", label: "Component", flex: 2, render: (r) => h("span", { class: "row-flex" }, r.kind === "user" ? icon("puzzle", { size: 12, className: "tone-accent" }) : null, h("span", { class: r.kind === "user" ? "it-name is-user" : "it-name" }, r.name)) },
    { key: "self", label: "Self", width: 180, render: (r) => h("span", { class: "row-flex", style: { width: "100%" } }, meter(r.selfTime / Math.max(1e-6, max), r.selfTime >= 8 ? "red" : r.selfTime >= 3 ? "amber" : undefined), h("span", { class: "num", style: { minWidth: "56px", textAlign: "right" } }, fmtMs(r.selfTime))) },
    { key: "reason", label: "Why", flex: 2, render: (r) => h("span", { class: ["ellipsis", r.reason === "full render" ? "tone-purple" : "t3"] }, r.reason) },
  ];
  return dataTable({
    columns,
    rows,
    rowKey: (r) => r.instanceKey,
    rowHeight: ctx.rowHeight,
    selected: ctx.ui.flameSelected,
    onSelect: (r) => { ctx.ui.flameSelected = r.instanceKey; ctx.highlightInstance(r.instanceKey, true); ctx.refresh(); },
    onActivate: (r) => ctx.selectInstance(r.instanceKey),
    onHover: (r) => ctx.highlightInstance(r?.instanceKey ?? null),
    empty: emptyState({ icon: "layers", title: "Nothing rendered in this commit", body: "Every instance was memoised." }),
    testid: "ranked-table",
    ariaLabel: "Components ranked by self time",
  });
}

function componentsView(ctx: ViewContext): Child {
  const { model, ui } = ctx;
  const rows = ctx.memo("pf:aggs", [model.revs.commit], () => componentAggregates(model.commits));
  const maxTotal = Math.max(1e-6, ...rows.map((r) => r.total));
  const columns: Column<ComponentAggregate>[] = [
    { key: "name", label: "Component", flex: 2, sort: (r) => r.name, render: (r) => h("span", { class: r.kind === "user" ? "it-name is-user" : "it-name" }, r.name) },
    { key: "kind", label: "Type", width: 70, sort: (r) => r.kind, render: (r) => chip(r.kind, r.kind === "user" ? "accent" : "grey") },
    { key: "instances", label: "Inst", width: 56, align: "right", sort: (r) => r.instances, render: (r) => h("span", { class: "num" }, String(r.instances)) },
    { key: "renders", label: "Renders", width: 70, align: "right", sort: (r) => r.renders, render: (r) => h("span", { class: "num" }, String(r.renders)) },
    { key: "memo", label: "Memo", width: 64, align: "right", sort: (r) => (r.renders + r.memo > 0 ? r.memo / (r.renders + r.memo) : 0), render: (r) => h("span", { class: "num t3" }, fmtPct(r.renders + r.memo > 0 ? r.memo / (r.renders + r.memo) : 0)) },
    { key: "total", label: "Total", width: 150, align: "right", sort: (r) => r.total, render: (r) => h("span", { class: "row-flex", style: { width: "100%" } }, meter(r.total / maxTotal), h("span", { class: "num", style: { minWidth: "52px", textAlign: "right" } }, fmtMs(r.total))) },
    { key: "avg", label: "Avg", width: 64, align: "right", sort: (r) => (r.renders ? r.total / r.renders : 0), render: (r) => h("span", { class: ["num", r.renders && r.total / r.renders >= 8 ? "tone-amber" : ""] }, r.renders ? fmtMs(r.total / r.renders) : "—") },
    { key: "max", label: "Max", width: 64, align: "right", sort: (r) => r.max, render: (r) => h("span", { class: ["num", r.max >= 16 ? "tone-red" : ""] }, fmtMs(r.max)) },
  ];
  return dataTable({
    columns,
    rows,
    rowKey: (r) => r.name,
    rowHeight: ctx.rowHeight,
    sort: ui.componentSort,
    onSort: (sort) => { ui.componentSort = sort; ctx.refresh(); },
    testid: "components-table",
    ariaLabel: "Components across all retained commits",
    empty: emptyState({ icon: "layers", title: "No component renders captured" }),
  });
}

function whyView(ctx: ViewContext, commit: CommitRecord): Child {
  const groups = new Map<string, ComponentRenderRecord[]>();
  for (const record of commit.components) {
    const list = groups.get(record.reason) ?? [];
    list.push(record);
    groups.set(record.reason, list);
  }
  const order = ["state dependency changed", "named args changed", "positional args changed", "full render", "no memo (full render)", "initial mount", "memoized (args + deps unchanged)"];
  const sorted = [...groups.entries()].sort((a, b) => (order.indexOf(a[0]) + 100 * Number(order.indexOf(a[0]) < 0)) - (order.indexOf(b[0]) + 100 * Number(order.indexOf(b[0]) < 0)));
  const wasted = groups.get("full render")?.length ?? 0;
  const rendered = commit.components.filter((c) => c.phase !== "memo").length;
  return h("div", { class: "dt-scroll", "data-dt": "why-render" },
    h("div", { class: "dt-pad stack" },
      card({
        title: `Commit #${commit.commitId}`,
        icon: "zap",
        sub: `${fmtMs(commit.duration)} · ${rendered} rendered · ${commit.memoized} skipped`,
        body: h("div", { class: "stack" },
          h("div", { class: "row-flex wrap" }, h("span", { class: "t3" }, "Triggered by"),
            commit.changedPaths.length > 0 ? commit.changedPaths.map((p) => atomChip(ctx, p, "amber")) : chip(commit.initial ? "initial mount" : "forced render", commit.initial ? "green" : "purple")),
          commit.fullRender && !commit.initial
            ? note("warn", ["This was a ", h("b", {}, "full render"), ": memoisation was bypassed because the change came from outside the tracked state (an async resolution, an effect body, a timer, or a custom event). ", wasted > 0 ? `${wasted} of ${rendered} renders changed nothing.` : ""])
            : wasted === 0 ? note("good", "Every render in this commit had a reason: a changed argument or a changed dependency.") : null),
      }),
      ...sorted.map(([reason, records]) => card({
        title: reasonTitle(reason),
        icon: reason.startsWith("memo") ? "layers" : reason === "full render" ? "warning" : reason.includes("state") ? "state" : reason.includes("args") ? "arrowRight" : "plus",
        sub: `${records.length} instance${records.length === 1 ? "" : "s"}`,
        body: h("div", { class: "chips" }, ...records.slice(0, 80).map((record) => chip(record.name, record.kind === "user" ? (reason === "full render" ? "purple" : "accent") : "grey", {
          onClick: () => ctx.selectInstance(record.instanceKey),
          tip: record.deps && record.deps.length > 0 ? `reads ${record.deps.map((d) => `$${d}`).join(", ")}` : undefined,
        })), records.length > 80 ? chip(`+${records.length - 80} more`) : null),
      }))));
}

function reasonTitle(reason: string): string {
  switch (reason) {
    case "state dependency changed": return "A state dependency changed";
    case "named args changed": return "Props changed";
    case "positional args changed": return "Arguments changed";
    case "full render": return "Rendered for nothing (forced commit)";
    case "no memo (full render)": return "No memoised value yet";
    case "initial mount": return "Mounted";
    case "memoized (args + deps unchanged)": return "Skipped (memoised)";
    default: return reason;
  }
}

const TONE_ICON = { bad: "error", warn: "warning", info: "info", good: "checkCircle" } as const;

function insightsView(ctx: ViewContext): Child {
  const insights = ctx.memo("pf:insights", [ctx.model.rev, ctx.vitals.interactions.length, ctx.vitals.longTasks.length], () => performanceInsights(ctx.model, ctx.vitals));
  return h("div", { class: "dt-scroll", "data-dt": "insights" },
    h("div", { class: "dt-pad stack" }, ...insights.map((insight: Insight) => h("div", { key: insight.id, class: ["pf-insight", `t-${insight.tone}`] },
      h("span", { class: "pf-insight-ic" }, icon(TONE_ICON[insight.tone], { size: 16 })),
      h("div", { class: "grow" },
        h("div", { class: "pf-insight-title" }, insight.title),
        h("div", { class: "pf-insight-detail" }, insight.detail),
        insight.fix ? h("div", { class: "pf-insight-fix" }, icon("wand", { size: 12 }), insight.fix) : null),
      insight.component ? button({ label: "Show", size: "sm", variant: "ghost", onClick: () => { ctx.ui.profilerView = "components"; ctx.refresh(); } }) : null))));
}

function vitalCard(label: string, metric: keyof typeof THRESHOLDS, value: number | null, format: (v: number) => string, sub?: Child): Child {
  const rating = rate(metric, value);
  const [good, poor] = THRESHOLDS[metric];
  const max = poor * 1.5;
  const pos = value === null ? 0 : Math.min(1, value / max);
  return h("div", { class: ["pf-vital", `r-${rating}`], "data-dt": `vital-${metric}` },
    h("div", { class: "pf-vital-label" }, label, h("span", { class: "pf-vital-rating" }, rating === "unknown" ? "no data" : rating.replace("-", " "))),
    h("div", { class: "pf-vital-value" }, value === null ? "—" : format(value)),
    h("div", { class: "pf-vital-scale" },
      h("span", { class: "g", style: { width: `${(good / max) * 100}%` } }),
      h("span", { class: "n", style: { width: `${((poor - good) / max) * 100}%` } }),
      h("span", { class: "p" }),
      value !== null ? h("i", { style: { left: `${pos * 100}%` } }) : null),
    sub ? h("div", { class: "pf-vital-sub" }, sub) : null);
}

function vitalsView(ctx: ViewContext): Child {
  const v = ctx.vitals;
  const inp = v.inp;
  const interactions = [...v.interactions].sort((a, b) => b.start - a.start).slice(0, 40);
  const phases = (i: InteractionRecord): Child => {
    const total = Math.max(1, i.inputDelay + i.processing + i.presentation);
    return h("span", { class: "pf-phases", "data-tip": `input delay ${fmtMs(i.inputDelay)} · processing ${fmtMs(i.processing)} · presentation ${fmtMs(i.presentation)}` },
      h("span", { class: "ph-input", style: { width: `${(i.inputDelay / total) * 100}%` } }),
      h("span", { class: "ph-proc", style: { width: `${(i.processing / total) * 100}%` } }),
      h("span", { class: "ph-pres", style: { width: `${(i.presentation / total) * 100}%` } }));
  };
  const commitsDuring = (i: InteractionRecord): number => ctx.model.commits.filter((c) => c.startTime >= i.start - 2 && c.startTime <= i.start + i.duration).length;
  return h("div", { class: "dt-scroll", "data-dt": "vitals" },
    h("div", { class: "dt-pad stack" },
      h("div", { class: "pf-vitals" },
        vitalCard("Interaction to Next Paint", "inp", inp?.value ?? null, (x) => fmtMs(x), inp ? `${inp.interaction.type} on ${inp.interaction.target || "an element"}` : v.supported.eventTiming ? "Click, tap, or type in the app to measure." : "Not supported in this browser."),
        vitalCard("Largest Contentful Paint", "lcp", v.lcp?.value ?? null, (x) => fmtMs(x), v.lcp ? v.lcp.element || "an element" : v.supported.lcp ? "Measured from page load." : "Not supported in this browser."),
        vitalCard("Cumulative Layout Shift", "cls", v.supported.cls ? v.cls.value : null, (x) => x.toFixed(3), v.supported.cls ? `${v.cls.shifts.length} shift${v.cls.shifts.length === 1 ? "" : "s"}` : "Not supported in this browser."),
        vitalCard("First Contentful Paint", "fcp", v.fcp, (x) => fmtMs(x)),
        vitalCard("Time to First Byte", "ttfb", v.ttfb, (x) => fmtMs(x))),
      h("div", { class: "grid-cards" },
        card({
          title: "Frame rate", icon: "activity",
          sub: v.fps !== null ? `${v.fps} fps now · ${v.droppedFrames} long frames` : "sampling…",
          body: v.fpsSamples.length > 1 ? sparkline(v.fpsSamples.map(([, f]) => f), { width: 320, height: 56, color: "var(--dt-green)", max: 120 }) : h("div", { class: "hint" }, "Collecting samples…"),
        }),
        card({
          title: "JS heap", icon: "cpu",
          sub: v.heap ? `${fmtBytes(v.heap.used)} of ${fmtBytes(v.heap.limit)}` : "Chromium only",
          body: v.heapSamples.length > 1 ? sparkline(v.heapSamples.map(([, b]) => b), { width: 320, height: 56, color: "var(--dt-cyan)" }) : h("div", { class: "hint" }, v.supported.memory ? "Collecting samples…" : "This browser does not expose memory usage."),
        })),
      card({
        title: "Interactions", icon: "cursor", flush: true,
        sub: `${v.interactions.length} measured · phases: input delay, processing, presentation`,
        body: interactions.length === 0
          ? h("div", { class: "pad-sm hint" }, "No interactions measured yet — use the app.")
          : h("div", { class: "pf-interactions" }, ...interactions.map((i) => h("div", { key: i.id, class: ["pf-int", i.duration > 200 ? "is-slow" : ""] },
              h("span", { class: "pf-int-type" }, i.type),
              h("span", { class: "pf-int-target mono ellipsis" }, i.target || "—"),
              phases(i),
              h("span", { class: ["num pf-int-dur", i.duration > 500 ? "tone-red" : i.duration > 200 ? "tone-amber" : ""] }, fmtMs(i.duration)),
              h("span", { class: "t3 pf-int-commits", "data-tip": "Commits that started during this interaction" }, `${commitsDuring(i)} commit${commitsDuring(i) === 1 ? "" : "s"}`)))),
      }),
      card({
        title: "Long tasks", icon: "clock", flush: true,
        sub: v.supported.loaf ? "long animation frames, with script attribution" : v.supported.longTasks ? "tasks over 50ms" : "not supported in this browser",
        body: v.longTasks.length === 0
          ? h("div", { class: "pad-sm hint" }, "No long tasks — the main thread stayed responsive.")
          : h("div", { class: "pf-interactions" }, ...[...v.longTasks].reverse().slice(0, 30).map((t, i) => h("div", { key: `${t.start}:${i}`, class: "pf-int" },
              h("span", { class: "pf-int-type" }, `+${fmtMs(t.start)}`),
              h("span", { class: "pf-int-target mono ellipsis" }, t.scripts && t.scripts.length > 0 ? t.scripts.map((s) => `${s.source} (${Math.round(s.duration)}ms)`).join(" · ") : "unattributed"),
              h("span", { class: ["num pf-int-dur", t.duration > 200 ? "tone-red" : "tone-amber"] }, fmtMs(t.duration))))),
      })));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { model, ui } = ctx;
  const commits = model.commits;
  const view = ui.profilerView;
  const bar = viewbar(
    segmented([
      { value: "flame", label: "Flame", icon: "flame" },
      { value: "ranked", label: "Ranked", icon: "list" },
      { value: "components", label: "Components", icon: "layers" },
      { value: "why", label: "Why", icon: "info" },
      { value: "insights", label: "Insights", icon: "sparkles" },
      { value: "vitals", label: "Vitals", icon: "gauge" },
    ], view, (value) => { ui.profilerView = value; ctx.refresh(); }, { label: "Performance view" }),
    spacer(),
    filterChip({ label: "Highlight renders", on: ui.highlightUpdates, tip: "Outline components on the page as they re-render, with counts", testid: "perf-scan", onToggle: () => { ui.highlightUpdates = !ui.highlightUpdates; if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes(); ctx.persist(); ctx.refresh(); } }),
    filterChip({ label: "Browser marks", on: ui.perfMarks, tip: "Mirror commits into performance.measure for Chrome's Performance panel", onToggle: () => { ui.perfMarks = !ui.perfMarks; ctx.refresh(); } }),
    vsep(),
    button({ label: "Clear", size: "sm", variant: "ghost", icon: "trash", onClick: () => { model.commits.length = 0; model.history.length = 0; model.renderCounts.clear(); model.rev += 1; model.revs.commit += 1; ui.selectedCommitId = null; ui.flameSelected = null; ctx.refresh(); } }));

  if (view === "vitals") return h("div", { class: "pf", "data-dt": "profiler" }, bar, vitalsView(ctx));
  if (view === "insights") return h("div", { class: "pf", "data-dt": "profiler" }, bar, insightsView(ctx));
  if (commits.length === 0) {
    return h("div", { class: "pf", "data-dt": "profiler" }, bar, emptyState({ icon: "flame", title: "No commits recorded yet", body: "Interact with the app — every render is captured while the panel is open." }));
  }
  const commit = selectedCommit(ctx)!;
  const bars = ctx.memo("pf:bars", [model.revs.commit], () => commits.map((c) => ({
    id: c.commitId, duration: c.duration, kind: commitKind(c), rendered: c.rendered, memoized: c.memoized, trigger: trigger(c),
  })));
  const nonInitial = commits.filter((c) => !c.initial);
  const avg = nonInitial.length ? nonInitial.reduce((sum, c) => sum + c.duration, 0) / nonInitial.length : 0;
  const slowest = commits.reduce((a, b) => (b.duration > a.duration ? b : a));
  const header = h("div", { class: "pf-head" },
    h("div", { class: "pf-chart" },
      commitChart({
        commits: bars, selected: commit.commitId, height: 64,
        ariaLabel: `${commits.length} commits; selected #${commit.commitId}, ${fmtMs(commit.duration)}. Use the arrow keys to move.`,
        testid: "commit-chart",
        onSelect: (id) => { ui.selectedCommitId = id; ui.flameSelected = null; ctx.refresh(); },
      })),
    h("div", { class: "pf-summary" },
      h("span", { class: "pf-commit-id" }, `#${commit.commitId}`),
      h("b", {}, fmtMs(commit.duration)),
      commit.morphTime ? h("span", { class: "t3" }, `render ${fmtMs(Math.max(0, commit.duration - commit.morphTime))} · DOM ${fmtMs(commit.morphTime)}`) : null,
      h("span", { class: "t3" }, `${commit.rendered} rendered · ${commit.memoized} skipped`),
      chip(commitKind(commit) === "full" ? "full render" : commitKind(commit), commitKind(commit) === "full" ? "amber" : commitKind(commit) === "initial" ? "teal" : "accent"),
      h("span", { class: "pf-trigger ellipsis" }, trigger(commit)),
      spacer(),
      h("span", { class: "t3" }, `avg ${fmtMs(avg)} · slowest `),
      h("button", { type: "button", class: "link", onClick: () => { ui.selectedCommitId = slowest.commitId; ctx.refresh(); } }, `#${slowest.commitId} ${fmtMs(slowest.duration)}`)));
  let body: Child;
  switch (view) {
    case "ranked": body = rankedView(ctx, commit); break;
    case "components": body = componentsView(ctx); break;
    case "why": body = whyView(ctx, commit); break;
    default: body = flameView(ctx, commit);
  }
  return h("div", { class: "pf", "data-dt": "profiler" }, bar, header, body);
}

export const profilerView: ViewDefinition = {
  id: "profiler",
  label: "Performance",
  icon: "profiler",
  group: "perf",
  hint: "Flame charts, re-renders, insights, Core Web Vitals",
  keywords: "profiler flame chart commits renders memo slow why did this render inp lcp cls fps long tasks vitals",
  badge: (ctx) => {
    const slow = ctx.model.commits.filter((c) => !c.initial && c.duration > 16).length;
    return slow > 0 ? { value: slow, tone: "amber" } : null;
  },
  render,
  commands: (ctx) => [
    { id: "vitals", label: "Show Core Web Vitals", icon: "gauge", run: () => { ctx.ui.profilerView = "vitals"; ctx.selectTab("profiler"); } },
    { id: "why", label: "Why did this render?", icon: "info", run: () => { ctx.ui.profilerView = "why"; ctx.selectTab("profiler"); } },
    { id: "slowest", label: "Jump to the slowest commit", icon: "flame", run: () => {
      const commits = ctx.model.commits;
      if (commits.length === 0) return;
      ctx.ui.selectedCommitId = commits.reduce((a, b) => (b.duration > a.duration ? b : a)).commitId;
      ctx.ui.profilerView = "flame";
      ctx.selectTab("profiler");
    } },
  ],
  css: /* css */ `
.pf { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf-head { flex: none; border-bottom: 1px solid var(--dt-border); }
.pf-chart { padding: 8px 10px 2px; }
.pf-summary { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; padding: 4px 12px 8px; font-size: var(--dt-fs-sm); min-width: 0; white-space: nowrap; }
.pf-summary > .pf-trigger { flex: 0 1 auto; min-width: 60px; max-width: 40%; }
.pf-commit-id { font-family: var(--dt-mono); color: var(--dt-accent-text); font-weight: 700; }
.pf-trigger { color: var(--dt-syn-state); font-family: var(--dt-mono); font-size: var(--dt-fs-mono); min-width: 40px; }
.pf-flame { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf-flame-bar { flex: none; display: flex; align-items: center; gap: 12px; padding: 6px 12px; font-size: var(--dt-fs-xs); }
.pf-legend { display: inline-flex; align-items: center; gap: 6px; color: var(--dt-text-3); }
.pf-legend i { width: 18px; height: 8px; border-radius: 2px; display: inline-block; }
.pf-legend i.is-memo { width: 10px; background: var(--dt-bg-active); box-shadow: inset 0 0 0 1px var(--dt-border-strong); margin-left: 6px; }
.pf-flame-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 8px 8px; }
.pf-col { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
.pf-side { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf-side-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--dt-text-3); padding: 20px; text-align: center; }
.pf-reason { display: flex; gap: 8px; align-items: flex-start; padding: 9px 11px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); line-height: 1.5; }
.pf-reason .ic { margin-top: 2px; color: var(--dt-accent-text); flex: none; }
.pf-insight { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: var(--dt-r-lg); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); }
.pf-insight.t-bad { border-left: 3px solid var(--dt-red); }
.pf-insight.t-warn { border-left: 3px solid var(--dt-amber); }
.pf-insight.t-info { border-left: 3px solid var(--dt-blue); }
.pf-insight.t-good { border-left: 3px solid var(--dt-green); }
.pf-insight-ic { margin-top: 1px; flex: none; }
.pf-insight.t-bad .pf-insight-ic { color: var(--dt-red); }
.pf-insight.t-warn .pf-insight-ic { color: var(--dt-amber); }
.pf-insight.t-info .pf-insight-ic { color: var(--dt-blue); }
.pf-insight.t-good .pf-insight-ic { color: var(--dt-green); }
.pf-insight-title { font-weight: 650; }
.pf-insight-detail { color: var(--dt-text-2); font-size: var(--dt-fs-sm); margin-top: 3px; line-height: 1.5; }
.pf-insight-fix { display: flex; gap: 6px; align-items: flex-start; color: var(--dt-text-3); font-size: var(--dt-fs-sm); margin-top: 6px; }
.pf-insight-fix .ic { margin-top: 2px; color: var(--dt-accent-text); flex: none; }
.pf-vitals { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.pf-vital { padding: 12px; border-radius: var(--dt-r-lg); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 6px; }
.pf-vital-label { display: flex; justify-content: space-between; gap: 6px; font-size: var(--dt-fs-xs); font-weight: 650; color: var(--dt-text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.pf-vital-rating { text-transform: none; letter-spacing: 0; font-weight: 700; }
.pf-vital.r-good .pf-vital-rating, .pf-vital.r-good .pf-vital-value { color: var(--dt-green); }
.pf-vital.r-needs-improvement .pf-vital-rating, .pf-vital.r-needs-improvement .pf-vital-value { color: var(--dt-amber); }
.pf-vital.r-poor .pf-vital-rating, .pf-vital.r-poor .pf-vital-value { color: var(--dt-red); }
.pf-vital-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.pf-vital-scale { position: relative; display: flex; height: 5px; border-radius: 3px; overflow: visible; }
.pf-vital-scale > span { height: 100%; }
.pf-vital-scale .g { background: var(--dt-green); border-radius: 3px 0 0 3px; opacity: 0.75; }
.pf-vital-scale .n { background: var(--dt-amber); opacity: 0.75; }
.pf-vital-scale .p { flex: 1; background: var(--dt-red); border-radius: 0 3px 3px 0; opacity: 0.75; }
.pf-vital-scale i { position: absolute; top: -4px; width: 3px; height: 13px; margin-left: -1.5px; border-radius: 2px; background: var(--dt-text); box-shadow: 0 0 0 2px var(--dt-bg-elev); }
.pf-vital-sub { font-size: var(--dt-fs-xs); color: var(--dt-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-interactions { display: flex; flex-direction: column; }
.pf-int { display: grid; grid-template-columns: 90px minmax(80px, 1fr) minmax(120px, 2fr) 64px 70px; align-items: center; gap: 10px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); }
.pf-int:last-child { border-bottom: 0; }
.pf-int.is-slow { background: var(--dt-amber-soft); }
.pf-int-type { font-weight: 600; }
.pf-int-dur { text-align: right; font-weight: 650; }
.pf-phases { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--dt-bg-active); }
.pf-phases span { height: 100%; }
.ph-input { background: var(--dt-amber); }
.ph-proc { background: var(--dt-accent); }
.ph-pres { background: var(--dt-cyan); }
`,
};
