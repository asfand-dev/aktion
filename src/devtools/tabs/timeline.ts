/**
 * Timeline tab — every event, in one column, in order.
 *
 * The per-subsystem tabs each answer their own question well and none of them
 * answers the most common one: *what happened when I clicked that?* A real
 * interaction is a commit, two effect runs, a request, and a route change inside
 * forty milliseconds, spread across four tabs. Reading them interleaved is the
 * difference between a guess and a cause.
 *
 * Rows are clickable: a commit opens in the profiler, an effect in the effects
 * tab, a request in the network tab.
 */

import {
  button, chip, downloadText, emptyState, fmtCount, fmtMs, fmtRel,
  h, section, spacer, stat, statGrid, toggle, toolbar,
} from "../ui.js";
import type { TabContext, TabDefinition } from "../context.js";
import { buildTimeline, type TimelineEntry } from "../model.js";

const KINDS: ReadonlyArray<{ id: string; label: string; title: string }> = [
  { id: "commit", label: "commits", title: "Render commits" },
  { id: "effect", label: "effects", title: "Effect lifecycle events" },
  { id: "network", label: "network", title: "HTTP requests" },
  { id: "route", label: "routes", title: "Navigations" },
  { id: "emit", label: "emits", title: "Custom events the program dispatched" },
  { id: "log", label: "logs", title: "Console output" },
  { id: "error", label: "errors", title: "Runtime errors" },
];

export const timelineTab: TabDefinition = {
  id: "timeline",
  label: "Timeline",
  icon: "≡",
  hint: "Every commit, effect, request, navigation, and error in one ordered stream",
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { model, ui } = ctx;

  const bar = toolbar(
    h("div", { class: "filters" }, ...KINDS.map((kind) =>
      toggle(kind.label, ui.timelineKinds.has(kind.id), () => {
        if (ui.timelineKinds.has(kind.id)) ui.timelineKinds.delete(kind.id);
        else ui.timelineKinds.add(kind.id);
        ctx.refresh();
      }, kind.title))),
    spacer(),
    button("Export session", () => downloadText("aktion-session.json", exportSession(ctx)), {
      title: "Download every captured event as JSON",
    }),
  );

  const entries = buildTimeline(model, ui.timelineKinds);
  if (entries.length === 0) {
    return [bar, emptyState(
      "Nothing captured yet.",
      "Interact with the app — every commit, effect, request, and navigation lands here.",
    )];
  }

  const base = model.firstTime ?? 0;
  const span = Math.max(1, model.lastTime - base);

  const summary = section(null, statGrid(
    stat("events", fmtCount(entries.length)),
    stat("span", fmtRel(span)),
    stat("commits", fmtCount(model.totals.commits)),
    stat("requests", fmtCount(model.totals.network)),
    stat("errors", fmtCount(model.totals.errors), { tone: model.totals.errors > 0 ? "bad" : "good" }),
  ), { flush: true });

  const rows = h("div", { class: "tlist" });
  let previous: number | null = null;
  for (const entry of entries.slice(-400).reverse()) {
    rows.appendChild(renderRow(ctx, entry, base, previous));
    previous = entry.time;
  }

  return [bar, summary, section(null, rows, { flush: true })];
}

/**
 * One row. The gap column is the useful part: a 900ms hole between a click and
 * the commit that answered it is the finding, and it is invisible in a list of
 * absolute timestamps.
 */
function renderRow(ctx: TabContext, entry: TimelineEntry, base: number, next: number | null): HTMLElement {
  const gap = next !== null ? next - entry.time : 0;
  return h("div", {
    class: `tlist-row t-${entry.tone} ${entry.ref ? "is-link" : ""}`,
    onclick: entry.ref ? () => jump(ctx, entry) : undefined,
  },
    h("span", { class: "tlist-time" }, fmtRel(entry.time - base)),
    h("span", { class: "tlist-kind" }, chip(entry.kind, entry.tone)),
    h("span", { class: "tlist-label" }, entry.label),
    h("span", { class: "tlist-detail" }, entry.detail),
    entry.duration !== undefined ? h("span", { class: "tlist-dur" }, fmtMs(entry.duration)) : null,
    gap > 50 ? h("span", { class: "tlist-gap", title: "Idle gap before the next event" }, `+${fmtRel(gap)}`) : null,
  );
}

function jump(ctx: TabContext, entry: TimelineEntry): void {
  switch (entry.kind) {
    case "commit":
      ctx.ui.selectedCommitId = Number(entry.ref);
      ctx.ui.profilerView = "commit";
      ctx.selectTab("profiler");
      break;
    case "effect":
      ctx.ui.selectedEffect = entry.ref ?? null;
      ctx.selectTab("effects");
      break;
    case "network":
      ctx.ui.selectedRequest = entry.ref ?? null;
      ctx.selectTab("network");
      break;
    case "route":
      ctx.selectTab("routes");
      break;
    case "error":
    case "log":
      ctx.selectTab("console");
      break;
    default:
      break;
  }
}

/**
 * The whole session as JSON: events, state, and the derived model's totals.
 *
 * This is what you attach to a bug report. It is also what a future replay tool
 * would consume, which is why it carries the raw hook buffer rather than the
 * panel's formatted rows.
 */
function exportSession(ctx: TabContext): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    protocolVersion: ctx.hook.protocolVersion,
    libraryVersion: ctx.hook.libraryVersion,
    app: ctx.app ? { id: ctx.app.id, label: ctx.app.label } : null,
    program: ctx.app?.getProgram() ?? null,
    state: ctx.model.state,
    totals: ctx.model.totals,
    commits: ctx.model.commits,
    effects: ctx.model.effects,
    network: ctx.model.network,
    routes: ctx.model.routes,
    emits: ctx.model.emits,
    errors: ctx.model.errors,
    logs: ctx.model.logs,
  };
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    // A snapshot holding something unserialisable should still produce a usable
    // export of everything else.
    return JSON.stringify({ ...payload, state: "<unserialisable>" }, null, 2);
  }
}


