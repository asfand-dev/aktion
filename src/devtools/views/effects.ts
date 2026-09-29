/**
 * Effects — every mounted `$effect` with its triggers, subscriptions, timers,
 * and run statistics; a lane per effect on a time axis; the lifecycle log; and
 * insights for the ways effects go wrong (hot triggers, slow bodies, remount
 * churn, throws).
 */

import { h, type Child } from "../core/vdom.js";
import { can, type ViewContext, type ViewDefinition } from "../context.js";
import type { EffectEvent, EffectInfo, EffectPhase } from "../protocol.js";
import { effectAggregates, type EffectAggregate } from "../model.js";
import { icon } from "../ui/icons.js";
import {
  button, chip, emptyState, filterChip, fmtMs, iconButton, note, searchField, segmented, spacer, stat, statGrid, viewbar, vsep, type Tone,
} from "../ui/kit.js";
import { dataTable, split, type Column } from "../ui/layout.js";
import { timelineChart, timelineHeight, type TimelineItem, type TimelineTrack } from "../ui/charts.js";
import { atomChip, noApp, paneSize, setPaneSize, unsupported } from "./common.js";
import { effectLabel } from "./state.js";

const PHASE_TONE: Record<EffectPhase, Tone> = { mount: "green", run: "blue", cleanup: "purple", unmount: "grey", error: "red" };
const PHASES: EffectPhase[] = ["mount", "run", "cleanup", "unmount", "error"];

interface EffectRow {
  key: string;
  info: EffectInfo | null;
  agg: EffectAggregate | null;
  label: string;
}

function rowsOf(ctx: ViewContext): EffectRow[] {
  const { app, model } = ctx;
  const mounted = can(app, "getEffects") ? ctx.cache("effects", () => app.getEffects()) : [];
  const aggregates = new Map(effectAggregates(model.effects).map((agg) => [agg.effectKey, agg]));
  const keys = new Set([...mounted.map((e) => e.effectKey), ...aggregates.keys()]);
  return [...keys].map((key) => {
    const info = mounted.find((e) => e.effectKey === key) ?? null;
    const agg = aggregates.get(key) ?? null;
    const label = info ? effectLabel({ label: info.label, triggers: info.triggers, deps: info.stateDeps }) : agg?.label ?? key;
    return { key, info, agg, label };
  });
}

function insightsFor(row: EffectRow): Array<{ tone: "bad" | "warn"; text: string }> {
  const out: Array<{ tone: "bad" | "warn"; text: string }> = [];
  const agg = row.agg;
  if (!agg) return out;
  if (agg.errors > 0) out.push({ tone: "bad", text: `Threw ${agg.errors}× — anything after the throw never runs.` });
  if (agg.runs >= 20 && (row.info?.intervals.length ?? 0) === 0) out.push({ tone: "warn", text: `Ran ${agg.runs}× on ${agg.triggers} — a hot trigger. Narrow the dependency list, or add debounce(300).` });
  if (agg.runs >= 1 && agg.total / agg.runs >= 6) out.push({ tone: "warn", text: `Averages ${fmtMs(agg.total / agg.runs)} per run — heavy synchronous work in an effect body delays the next paint.` });
  if (agg.mounts >= 4) out.push({ tone: "warn", text: `Mounted ${agg.mounts}× — its owning component is remounting (a changing key:, or a conditional branch flipping).` });
  return out;
}

function detailPane(ctx: ViewContext, row: EffectRow): Child {
  const { app, model, ui } = ctx;
  const events = model.effects.filter((e) => e.effectKey === row.key).slice(-40).reverse();
  const insights = insightsFor(row);
  const agg = row.agg;
  return h("div", { class: "fx-detail", "data-dt": "effect-detail" },
    h("div", { class: "pane-head" },
      icon("effects", { size: 15 }),
      h("span", { class: "pane-title" }, row.label),
      row.info?.source ? h("button", { type: "button", class: "link mono", onClick: () => { ui.sourceFocusLine = row.info!.source!.line; ctx.selectTab("source"); } }, `L${row.info.source.line}`) : null,
      spacer(),
      row.info && can(app, "runEffect") ? button({ label: "Run now", size: "sm", icon: "play", variant: "primary", onClick: () => { const ok = app.runEffect(row.key); ctx.toast(ok ? `Ran ${row.label}` : "No longer mounted", ok ? "good" : "warn"); } }) : null,
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => { ui.selectedEffect = null; ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      statGrid(
        stat({ label: "Runs", value: String(agg?.runs ?? 0) }),
        stat({ label: "Avg", value: agg && agg.runs ? fmtMs(agg.total / agg.runs) : "—", tone: agg && agg.runs && agg.total / agg.runs >= 6 ? "amber" : undefined }),
        stat({ label: "Slowest", value: agg ? fmtMs(agg.max) : "—" }),
        stat({ label: "Errors", value: String(agg?.errors ?? 0), tone: agg && agg.errors > 0 ? "red" : undefined }),
        stat({ label: "Mounts", value: String(agg?.mounts ?? 0) })),
      ...insights.map((insight) => note(insight.tone === "bad" ? "error" : "warn", insight.text)),
      row.info ? h("div", { class: "stack" },
        h("div", {}, h("div", { class: "it-sub" }, "Triggers"), h("code", { class: "fx-code" }, row.info.triggers)),
        row.info.stateDeps.length > 0 ? h("div", {}, h("div", { class: "it-sub" }, "Subscribes to"), h("div", { class: "chips" }, ...row.info.stateDeps.map((dep) => atomChip(ctx, dep, "green")))) : null,
        row.info.intervals.length > 0 ? h("div", {}, h("div", { class: "it-sub" }, "Timers"), h("div", { class: "chips" }, ...row.info.intervals.map((ms) => chip(`every ${ms}ms`, "cyan")))) : null,
        row.info.instanceKey ? h("div", {}, h("div", { class: "it-sub" }, "Owner"), button({ label: row.info.instanceKey.split("#").pop()?.split("@")[0] ?? row.info.instanceKey, size: "sm", icon: "puzzle", onClick: () => ctx.selectInstance(row.info!.instanceKey!) })) : h("div", { class: "hint" }, "Top-level effect (not owned by a component)."),
        h("div", { class: "hint" }, `${row.info.cleanups} cleanup handler${row.info.cleanups === 1 ? "" : "s"} registered.`)) : note("plain", "This effect is no longer mounted; its history is shown below."),
      h("div", {},
        h("div", { class: "it-sub" }, `Recent lifecycle (${events.length})`),
        events.length === 0 ? h("div", { class: "hint" }, "No events recorded.") : h("div", { class: "fx-events" }, ...events.map((event, i) => h("div", { key: `${event.time}:${i}`, class: "fx-event" },
          chip(event.phase, PHASE_TONE[event.phase]),
          h("span", { class: "t2 ellipsis grow" }, event.reason),
          event.duration !== undefined ? h("span", { class: "num t3" }, fmtMs(event.duration)) : null,
          event.error ? h("span", { class: "tone-red ellipsis" }, event.error) : null))))));
}

function render(ctx: ViewContext): Child {
  const { app, ui, model } = ctx;
  if (!app && !ctx.imported) return noApp(ctx, "Effects", "effects");
  if (app && !can(app, "getEffects") && model.effects.length === 0) return h("div", { class: "dt-pad" }, unsupported("its mounted effects"));
  const view = ui.effectView;
  const needle = ui.effectFilter.trim().toLowerCase();
  const rows = rowsOf(ctx).filter((row) => !needle || `${row.label} ${row.key} ${row.info?.triggers ?? ""}`.toLowerCase().includes(needle));
  const selected = rows.find((row) => row.key === ui.selectedEffect) ?? null;
  const events = model.effects.filter((e) => ui.phaseFilter.has(e.phase) && (!needle || `${e.label} ${e.reason}`.toLowerCase().includes(needle)));

  const bar = viewbar(
    segmented([
      { value: "mounted", label: "Mounted", icon: "effects", count: rows.filter((r) => r.info).length || null },
      { value: "timeline", label: "Timeline", icon: "timeline" },
      { value: "log", label: "Log", icon: "list", count: model.effects.length || null },
    ], view, (value) => { ui.effectView = value; ctx.refresh(); }, { label: "Effects view" }),
    searchField({ value: ui.effectFilter, placeholder: "Filter effects…", onInput: (v) => { ui.effectFilter = v; ctx.refresh(); } }),
    spacer(),
    ...(view !== "mounted" ? PHASES.map((phase) => filterChip({
      label: phase, on: ui.phaseFilter.has(phase), count: model.effects.filter((e) => e.phase === phase).length,
      onToggle: () => { if (ui.phaseFilter.has(phase)) ui.phaseFilter.delete(phase); else ui.phaseFilter.add(phase); ctx.refresh(); },
    })) : []),
    vsep(),
    iconButton({ icon: "trash", label: "Clear the effect log", onClick: () => { model.effects.length = 0; model.revs.effect += 1; model.rev += 1; ctx.refresh(); } }));

  let body: Child;
  if (view === "timeline") {
    const top = rows.filter((r) => r.agg).sort((a, b) => (b.agg!.runs + b.agg!.mounts) - (a.agg!.runs + a.agg!.mounts)).slice(0, 24);
    const tracks: TimelineTrack[] = top.map((row) => ({ id: row.key, label: row.label, color: "--dt-k-effect" }));
    const trackIds = new Set(tracks.map((t) => t.id));
    const items: TimelineItem[] = events.filter((e) => trackIds.has(e.effectKey)).map((e: EffectEvent, i) => ({
      id: `${e.effectKey}:${e.time}:${i}`, track: e.effectKey,
      start: e.phase === "run" && e.duration ? e.time - e.duration : e.time,
      end: e.phase === "run" && e.duration ? e.time : undefined,
      color: e.phase === "error" ? "--dt-red" : e.phase === "run" ? "--dt-k-effect" : e.phase === "cleanup" ? "--dt-purple" : "--dt-text-4",
      label: `${e.label} · ${e.phase}`, detail: e.reason, alert: e.phase === "error",
    }));
    const start = model.firstTime ?? ctx.now();
    const end = Math.max(ctx.now(), start + 1000);
    body = tracks.length === 0
      ? emptyState({ icon: "effects", title: "No effect activity yet" })
      : h("div", { class: "dt-scroll dt-pad" }, timelineChart({
          tracks, items, start, end, view: ui.timelineView, onView: (v) => { ui.timelineView = v; ctx.refresh(); },
          selected: null, onSelect: (id) => { if (id) { ui.selectedEffect = id.split(":")[0] ?? null; ui.effectView = "mounted"; ctx.refresh(); } },
          brush: null, onBrush: () => undefined, window: 20_000,
          height: timelineHeight(tracks, items, start, end), ariaLabel: `Effect lifecycle for ${tracks.length} effects`, testid: "effects-timeline",
        }));
  } else if (view === "log") {
    const columns: Column<EffectEvent>[] = [
      { key: "time", label: "Time", width: 80, align: "right", render: (e) => h("span", { class: "num t3" }, `+${fmtMs(e.time - (model.firstTime ?? e.time))}`) },
      { key: "phase", label: "Phase", width: 84, render: (e) => chip(e.phase, PHASE_TONE[e.phase]) },
      { key: "label", label: "Effect", flex: 1.4, render: (e) => h("span", { class: "ellipsis" }, e.label) },
      { key: "reason", label: "Why", flex: 2, render: (e) => h("span", { class: ["ellipsis", e.phase === "error" ? "tone-red" : "t2"] }, e.error ?? e.reason) },
      { key: "dur", label: "Time", width: 70, align: "right", render: (e) => h("span", { class: "num t3" }, e.duration !== undefined ? fmtMs(e.duration) : "") },
    ];
    body = dataTable({
      columns, rows: events, rowKey: (e) => `${e.effectKey}:${e.time}:${e.phase}`, rowHeight: ctx.rowHeight, stickToBottom: true,
      onSelect: (e) => { ui.selectedEffect = e.effectKey; ui.effectView = "mounted"; ctx.refresh(); },
      rowClass: (e) => (e.phase === "error" ? "is-error" : ""),
      testid: "effects-log", ariaLabel: "Effect lifecycle log",
      empty: emptyState({ icon: "effects", title: "No events match the filters" }),
    });
  } else {
    const columns: Column<EffectRow>[] = [
      { key: "label", label: "Effect", flex: 1.6, sort: (r) => r.label, render: (r) => h("span", { class: "row-flex" }, icon("effects", { size: 12, className: r.info ? "tone-green" : "t4" }), h("span", { class: "ellipsis" }, r.label), !r.info ? chip("unmounted", "grey") : null) },
      { key: "owner", label: "Owner", width: 120, render: (r) => r.info?.instanceKey ? h("span", { class: "ellipsis t2" }, r.info.instanceKey.split("#").pop()?.split("@")[0] ?? "") : h("span", { class: "t4" }, "top level") },
      { key: "triggers", label: "Triggers", flex: 1.2, render: (r) => h("code", { class: "ellipsis fx-code" }, r.info?.triggers ?? r.agg?.triggers ?? "") },
      { key: "runs", label: "Runs", width: 60, align: "right", sort: (r) => r.agg?.runs ?? 0, render: (r) => h("span", { class: "num" }, String(r.agg?.runs ?? 0)) },
      { key: "avg", label: "Avg", width: 66, align: "right", sort: (r) => (r.agg && r.agg.runs ? r.agg.total / r.agg.runs : 0), render: (r) => h("span", { class: "num t2" }, r.agg && r.agg.runs ? fmtMs(r.agg.total / r.agg.runs) : "—") },
      { key: "errors", label: "Errors", width: 60, align: "right", sort: (r) => r.agg?.errors ?? 0, render: (r) => (r.agg && r.agg.errors > 0 ? chip(String(r.agg.errors), "red") : h("span", { class: "t4" }, "0")) },
    ];
    const table = dataTable({
      columns, rows, rowKey: (r) => r.key, rowHeight: ctx.rowHeight,
      selected: ui.selectedEffect,
      onSelect: (r) => { ui.selectedEffect = r.key; ctx.refresh(); },
      onActivate: (r) => { if (r.info && can(app, "runEffect")) app.runEffect(r.key); },
      rowClass: (r) => (r.agg && r.agg.errors > 0 ? "is-error" : ""),
      testid: "effects-table", ariaLabel: "Mounted effects",
      empty: emptyState({ icon: "effects", title: "No effects are mounted", body: ["Declare one with ", h("code", {}, "$effect(() => { … }, [$dep])"), "."] }),
    });
    body = selected
      ? (ctx.width() >= 780
          ? split({ size: paneSize(ctx, "effects.table", Math.round(ctx.width() * 0.55)), min: 300, onResize: (s) => setPaneSize(ctx, "effects.table", s), first: table, second: detailPane(ctx, selected) })
          : split({ direction: "col", size: paneSize(ctx, "effects.table.col", 200), min: 110, onResize: (s) => setPaneSize(ctx, "effects.table.col", s), first: table, second: detailPane(ctx, selected) }))
      : table;
  }
  return h("div", { class: "fx", "data-dt": "effects" }, bar, body);
}

export const effectsView: ViewDefinition = {
  id: "effects",
  label: "Effects",
  icon: "effects",
  group: "activity",
  hint: "Mounted effects, triggers, and lifecycle",
  keywords: "side effects timeline triggers intervals cleanup mounted run",
  badge: (ctx) => {
    const errors = ctx.model.effects.filter((e) => e.phase === "error").length;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render,
  css: /* css */ `
.fx { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.fx-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.fx-code { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); }
.fx-events { display: flex; flex-direction: column; gap: 3px; }
.fx-event { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 6px; background: var(--dt-bg-elev); font-size: var(--dt-fs-sm); min-width: 0; }
`,
};
