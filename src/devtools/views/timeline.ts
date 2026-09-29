/**
 * Timeline — every kind of event on its own track over one time axis:
 * interactions, commits, state writes, effects, requests, navigation, logs,
 * errors, and long tasks. Zoom and pan the chart, Shift-drag to brush a time
 * range, and the list below narrows to what happened inside it.
 *
 * Debugging "clicking Save does nothing" means correlating a click, a commit,
 * an effect run, a request, and a navigation that all happened within 40ms.
 * Reading five views and interleaving them in your head is the slow way.
 */

import { h, type Child } from "../core/vdom.js";
import type { ViewContext, ViewDefinition, TabId } from "../context.js";
import { urlTail } from "../model.js";
import {
  button, chip, downloadText, emptyState, filterChip, fmtMs, iconButton, searchField, spacer, viewbar, vsep, type Tone,
} from "../ui/kit.js";
import { dataTable, split, type Column } from "../ui/layout.js";
import { timelineChart, timelineHeight, type TimelineItem, type TimelineTrack } from "../ui/charts.js";
import { valueTree } from "../ui/value.js";
import { exportSessionJson } from "../session.js";
import { effectLabel } from "./state.js";
import { paneSize, setPaneSize } from "./common.js";

export interface TimelineEntry {
  id: string;
  kind: string;
  start: number;
  end?: number;
  label: string;
  detail: string;
  color: string;
  tone: Tone;
  alert?: boolean;
  open?: { tab: TabId; apply: (ctx: ViewContext) => void; label: string };
  raw: unknown;
}

const KINDS: ReadonlyArray<{ kind: string; label: string; color: string; tone: Tone }> = [
  { kind: "interaction", label: "Interactions", color: "--dt-k-interaction", tone: "blue" },
  { kind: "commit", label: "Commits", color: "--dt-k-commit", tone: "accent" },
  { kind: "state", label: "State", color: "--dt-k-state", tone: "purple" },
  { kind: "effect", label: "Effects", color: "--dt-k-effect", tone: "green" },
  { kind: "network", label: "Network", color: "--dt-k-network", tone: "cyan" },
  { kind: "route", label: "Routes", color: "--dt-k-route", tone: "pink" },
  { kind: "emit", label: "Events", color: "--dt-k-emit", tone: "amber" },
  { kind: "log", label: "Logs", color: "--dt-k-log", tone: "grey" },
  { kind: "error", label: "Errors", color: "--dt-k-error", tone: "red" },
  { kind: "longtask", label: "Long tasks", color: "--dt-k-longtask", tone: "orange" },
];

/** Every event the model and the vitals monitor hold, as timeline entries. */
/**
 * Console lines are stamped with wall-clock time by the console tap; every
 * other event uses the monotonic `performance.now()` clock. Convert so logs
 * land where they happened on the shared axis.
 */
/** "every 3s · L16" rather than the runtime's `effect @ L16:C1`: what it is for, then where. */
export function effectEventLabel(event: { label: string; triggers?: string }): string {
  const deps = [...(event.triggers ?? "").matchAll(/\$([A-Za-z_][\w.]*)/g)].map((match) => match[1]!);
  const purpose = effectLabel({ label: event.label, triggers: event.triggers, deps });
  const line = /L(\d+)/.exec(event.label)?.[1];
  return purpose === event.label || !line ? purpose : `${purpose} · L${line}`;
}

export function toMonotonic(time: number, epochOffset: number): number {
  return time > 1e11 ? time - epochOffset : time;
}

export function timelineEntries(ctx: Pick<ViewContext, "model" | "vitals" | "now" | "epochOffset">): TimelineEntry[] {
  const { model, vitals } = ctx;
  const out: TimelineEntry[] = [];
  const now = ctx.now();
  for (const c of model.commits) {
    out.push({
      id: `commit:${c.commitId}`, kind: "commit", start: c.startTime, end: c.startTime + Math.max(0.01, c.duration),
      label: `Commit #${c.commitId}`,
      detail: `${fmtMs(c.duration)} · ${c.initial ? "initial mount" : c.changedPaths.length > 0 ? c.changedPaths.map((p) => `$${p}`).join(", ") : "forced"} · ${c.rendered} rendered`,
      color: c.duration > 16 ? "--dt-red" : "--dt-k-commit", tone: "accent", alert: c.duration > 16,
      open: { tab: "profiler", label: "Open in Performance", apply: (x) => { x.ui.selectedCommitId = c.commitId; x.ui.profilerView = "flame"; } },
      raw: { ...c, components: `${c.components.length} records`, snapshot: c.snapshot ? "(snapshot)" : undefined },
    });
  }
  for (const [atom, changes] of model.atomLog) {
    changes.forEach((change, i) => out.push({
      id: `state:${atom}:${change.time}:${i}`, kind: "state", start: change.time,
      label: `$${atom}`, detail: `${change.before} → ${change.after}`, color: "--dt-k-state", tone: "purple",
      open: { tab: "state", label: "Open in State", apply: (x) => { x.ui.stateSelected = atom; x.ui.stateView = "tree"; x.ui.stateFilter = ""; } },
      raw: change,
    }));
  }
  model.effects.forEach((e, i) => out.push({
    id: `effect:${e.effectKey}:${e.time}:${i}`, kind: "effect",
    start: e.phase === "run" && e.duration ? e.time - e.duration : e.time, end: e.phase === "run" && e.duration ? e.time : undefined,
    label: effectEventLabel(e), detail: `${e.phase} · ${e.reason}${e.duration !== undefined ? ` · ${fmtMs(e.duration)}` : ""}${e.error ? ` · ${e.error}` : ""}`,
    color: e.phase === "error" ? "--dt-red" : "--dt-k-effect", tone: e.phase === "error" ? "red" : "green", alert: e.phase === "error",
    open: { tab: "effects", label: "Open in Effects", apply: (x) => { x.ui.selectedEffect = e.effectKey; } },
    raw: e,
  }));
  for (const r of model.network) {
    const failed = r.phase === "error" || r.phase === "blocked" || (r.status ?? 0) >= 400;
    out.push({
      id: `network:${r.requestId}`, kind: "network", start: r.startTime, end: r.endTime ?? Math.max(r.startTime + 1, now),
      label: `${r.method} ${urlTail(r.url)}`,
      detail: `${r.phase === "pending" ? "pending" : r.status ?? r.phase}${r.duration !== undefined ? ` · ${fmtMs(r.duration)}` : ""}${r.rule ? ` · rule: ${r.rule}` : ""}`,
      color: failed ? "--dt-red" : r.phase === "mock" ? "--dt-purple" : "--dt-k-network", tone: failed ? "red" : "cyan", alert: failed,
      open: { tab: "network", label: "Open in Network", apply: (x) => { x.ui.selectedRequest = r.requestId; } },
      raw: r,
    });
  }
  model.routes.forEach((r, i) => out.push({
    id: `route:${r.time}:${i}`, kind: "route", start: r.time, label: `→ ${r.to}`,
    detail: `${r.pattern ? `matched ${r.pattern}` : "no route matched"}${r.source ? ` · ${r.source}` : ""}`,
    color: r.pattern ? "--dt-k-route" : "--dt-amber", tone: "pink", alert: !r.pattern,
    open: { tab: "routes", label: "Open in Routes", apply: () => undefined },
    raw: r,
  }));
  model.emits.forEach((e, i) => out.push({
    id: `emit:${e.time}:${i}`, kind: "emit", start: e.time, label: `emit("${e.name}")`, detail: e.detail.preview,
    color: "--dt-k-emit", tone: "amber", raw: e,
  }));
  model.logs.forEach((log, i) => out.push({
    id: `log:${log.time}:${i}`, kind: "log", start: toMonotonic(log.time, ctx.epochOffset),
    label: log.level, detail: log.count > 1 ? `${log.text} (×${log.count})` : log.text,
    color: log.level === "error" ? "--dt-red" : log.level === "warn" ? "--dt-amber" : "--dt-k-log", tone: log.level === "error" ? "red" : log.level === "warn" ? "amber" : "grey",
    alert: log.level === "error",
    open: { tab: "console", label: "Open in Console", apply: () => undefined },
    raw: log,
  }));
  model.errors.forEach((e, i) => out.push({
    id: `error:${e.time}:${i}`, kind: "error", start: e.time, label: `${e.phase} error`, detail: `${e.subject ? `${e.subject}: ` : ""}${e.message}`,
    color: "--dt-k-error", tone: "red", alert: true,
    open: { tab: "console", label: "Open in Console", apply: (x) => { x.ui.logLevels = new Set(["error"]); } },
    raw: e,
  }));
  vitals.interactions.forEach((i) => out.push({
    id: `interaction:${i.id}`, kind: "interaction", start: i.start, end: i.start + i.duration,
    label: i.type, detail: `${i.target || "?"} · ${fmtMs(i.duration)} (input ${fmtMs(i.inputDelay)} · processing ${fmtMs(i.processing)} · paint ${fmtMs(i.presentation)})`,
    color: i.duration > 200 ? "--dt-red" : "--dt-k-interaction", tone: "blue", alert: i.duration > 200,
    open: { tab: "profiler", label: "Open in Vitals", apply: (x) => { x.ui.profilerView = "vitals"; } },
    raw: i,
  }));
  vitals.longTasks.forEach((t, i) => out.push({
    id: `longtask:${t.start}:${i}`, kind: "longtask", start: t.start, end: t.start + t.duration,
    label: "Long task", detail: `${fmtMs(t.duration)}${t.scripts?.[0] ? ` · ${t.scripts[0].source}` : ""}`,
    color: "--dt-k-longtask", tone: "orange", alert: t.duration > 200, raw: t,
  }));
  return out.sort((a, b) => a.start - b.start);
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { ui, model } = ctx;
  const all = ctx.memo("tl:entries", [model.rev, ctx.vitals.interactions.length, ctx.vitals.longTasks.length, Math.floor(ctx.now() / 1000)], () => timelineEntries(ctx));
  const counts = new Map<string, number>();
  for (const entry of all) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  const enabled = all.filter((entry) => ui.timelineKinds.has(entry.kind));
  const needle = ui.timelineFilter.trim().toLowerCase();
  const brush = ui.timelineBrush;
  const listed = enabled.filter((entry) => {
    if (needle && !`${entry.label} ${entry.detail}`.toLowerCase().includes(needle)) return false;
    if (brush && ((entry.end ?? entry.start) < brush.start || entry.start > brush.end)) return false;
    return true;
  });
  const start = model.firstTime ?? (all[0]?.start ?? ctx.now());
  const end = Math.max(ctx.now(), start + 1000);
  const tracks: TimelineTrack[] = KINDS.filter((k) => ui.timelineKinds.has(k.kind) && (counts.get(k.kind) ?? 0) > 0).map((k) => ({ id: k.kind, label: k.label, color: k.color }));
  const items: TimelineItem[] = enabled.map((entry) => ({ id: entry.id, track: entry.kind, start: entry.start, end: entry.end, color: entry.color, label: entry.label, detail: entry.detail, alert: entry.alert }));
  const height = Math.min(360, timelineHeight(tracks, items, start, end));
  const selected = all.find((entry) => entry.id === ui.timelineSelected) ?? null;

  const bar = viewbar(
    ...KINDS.map((k) => filterChip({
      label: k.label, on: ui.timelineKinds.has(k.kind), count: counts.get(k.kind) ?? 0,
      swatch: `var(${k.color})`, testid: `tl-kind-${k.kind}`,
      onToggle: () => { if (ui.timelineKinds.has(k.kind)) ui.timelineKinds.delete(k.kind); else ui.timelineKinds.add(k.kind); ctx.refresh(); },
    })),
    spacer(),
    searchField({ value: ui.timelineFilter, placeholder: "Filter events…", onInput: (v) => { ui.timelineFilter = v; ctx.refresh(); }, width: "180px" }),
    vsep(),
    button({ label: ui.timelineView ? "Follow live" : "Live", size: "sm", icon: "live", active: ui.timelineView === null, tip: "Keep the newest events in view", onClick: () => { ui.timelineView = null; ctx.refresh(); } }),
    iconButton({ icon: "download", label: "Export the session", onClick: () => { downloadText("aktion-session.json", exportSessionJson(ctx, { steps: ctx.recordedSteps() })); ctx.toast("Session exported", "good"); } }));

  if (all.length === 0) {
    return h("div", { class: "tl", "data-dt": "timeline" }, bar, emptyState({ icon: "timeline", title: "Nothing captured yet", body: "Interact with the app — every commit, request, effect, and navigation lands on this axis." }));
  }

  const columns: Column<TimelineEntry>[] = [
    { key: "time", label: "Time", width: 78, align: "right", render: (e) => h("span", { class: "num t3" }, `+${fmtMs(e.start - start)}`) },
    { key: "kind", label: "Kind", width: 96, render: (e) => chip(KINDS.find((k) => k.kind === e.kind)?.label ?? e.kind, e.tone) },
    { key: "label", label: "Event", flex: 1.4, render: (e) => h("span", { class: ["ellipsis", e.alert ? "tone-red" : ""] }, e.label) },
    { key: "detail", label: "Detail", flex: 2.6, render: (e) => h("span", { class: "ellipsis t2" }, e.detail) },
    { key: "dur", label: "Duration", width: 76, align: "right", render: (e) => h("span", { class: "num t3" }, e.end !== undefined ? fmtMs(e.end - e.start) : "") },
  ];
  const list = dataTable({
    columns, rows: listed, rowKey: (e) => e.id, rowHeight: ctx.rowHeight,
    selected: ui.timelineSelected,
    onSelect: (e) => { ui.timelineSelected = e.id; ctx.refresh(); },
    onActivate: (e) => openEntry(ctx, e),
    stickToBottom: !brush && !needle,
    testid: "timeline-list",
    ariaLabel: "Events",
    empty: emptyState({ icon: "filter", title: brush ? "Nothing in the selected range" : "No events match", body: brush ? "Double-click the chart to clear the selection." : undefined }),
  });
  const detail = selected ? h("div", { class: "tl-detail", "data-dt": "timeline-detail" },
    h("div", { class: "pane-head" },
      chip(KINDS.find((k) => k.kind === selected.kind)?.label ?? selected.kind, selected.tone),
      h("span", { class: "pane-title" }, selected.label),
      spacer(),
      selected.open ? button({ label: selected.open.label, size: "sm", icon: "arrowRight", onClick: () => openEntry(ctx, selected) }) : null,
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.timelineSelected = null; ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      h("div", { class: "hint" }, `+${fmtMs(selected.start - start)}${selected.end !== undefined ? ` · ${fmtMs(selected.end - selected.start)}` : ""}`),
      h("div", { class: "t2", style: { fontSize: "var(--dt-fs-sm)" } }, selected.detail),
      valueTree({
        scope: "timeline", value: selected.raw as object, expanded: ui.networkExpanded, rowHeight: ctx.rowHeight, inline: true,
        onToggle: (p) => { if (ui.networkExpanded.has(p)) ui.networkExpanded.delete(p); else ui.networkExpanded.add(p); ctx.refresh(); },
        editing: null, setEditing: () => undefined, onCopy: (t, w) => ctx.copy(t, w),
      }))) : null;

  return h("div", { class: "tl", "data-dt": "timeline" },
    bar,
    h("div", { class: "tl-chart" },
      timelineChart({
        tracks, items, start, end,
        view: ui.timelineView,
        onView: (view) => { ui.timelineView = view; ctx.refresh(); },
        selected: ui.timelineSelected,
        onSelect: (id) => { ui.timelineSelected = id; ctx.refresh(); },
        brush,
        onBrush: (range) => { ui.timelineBrush = range; ctx.refresh(); },
        window: 15_000,
        fps: ui.timelineKinds.has("interaction") ? ctx.vitals.fpsSamples : undefined,
        height,
        ariaLabel: `Timeline of ${enabled.length} events across ${tracks.length} tracks`,
        testid: "timeline-chart",
      }),
      h("div", { class: "tl-hint" },
        brush ? [chip(`${fmtMs(brush.end - brush.start)} selected`, "accent"), button({ label: "Clear selection", size: "sm", variant: "ghost", onClick: () => { ui.timelineBrush = null; ctx.refresh(); } })] : h("span", { class: "t4" }, "Wheel to zoom · drag to pan · Shift+drag to select a range · double-click to reset"),
        spacer(),
        h("span", { class: "t3" }, `${listed.length} of ${all.length} events`))),
    detail && ctx.width() >= 820
      ? split({ size: paneSize(ctx, "timeline.list", Math.round(ctx.width() * 0.62)), min: 320, onResize: (s) => setPaneSize(ctx, "timeline.list", s), first: list, second: detail })
      : h("div", { class: "tl-body" }, list, detail));
}

function openEntry(ctx: ViewContext, entry: TimelineEntry): void {
  if (!entry.open) return;
  entry.open.apply(ctx);
  ctx.selectTab(entry.open.tab);
}

export const timelineView: ViewDefinition = {
  id: "timeline",
  label: "Timeline",
  icon: "timeline",
  group: "activity",
  hint: "Every event on one zoomable time axis",
  keywords: "events stream history trace correlate interactions commits requests",
  render,
  commands: (ctx) => [
    { id: "live", label: "Follow the live timeline", icon: "live", run: () => { ctx.ui.timelineView = null; ctx.ui.timelineBrush = null; ctx.selectTab("timeline"); } },
    { id: "errors", label: "Show only errors on the timeline", icon: "error", run: () => { ctx.ui.timelineKinds = new Set(["error", "log"]); ctx.selectTab("timeline"); } },
  ],
  css: /* css */ `
.tl { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.tl-chart { flex: none; padding: 8px 10px 4px; border-bottom: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 4px; }
.tl-hint { display: flex; align-items: center; gap: 8px; min-height: 22px; font-size: var(--dt-fs-xs); }
.tl-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.tl-body > .table { flex: 1 1 auto; }
.tl-body > .tl-detail { flex: none; max-height: 45%; border-top: 1px solid var(--dt-border); }
.tl-detail { display: flex; flex-direction: column; min-height: 0; }
`,
};
