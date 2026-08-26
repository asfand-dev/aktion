/**
 * Effects tab — the side-effect timeline and the mounted-effect explorer.
 *
 * Two complementary questions, two views:
 *
 *   - **What happened?** The timeline / log: every mount, run, cleanup,
 *     unmount, and throw, attributed to the trigger that fired it.
 *   - **What exists?** The mounted list: every live effect, what it subscribes
 *     to, which intervals it holds, how many cleanups are registered — the view
 *     you need when the bug is that *nothing* happened, and there is therefore
 *     no event to look at.
 *
 * "Run now" fires an effect's body as if its trigger had fired, prior cleanups
 * first. That turns "does this effect even work?" into one click.
 */

import {
  button, chip, chipGroup, code, emptyState, faint, fmtCount, fmtMs, fmtRel,
  h, section, spacer, stat, statGrid, table, toggle, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { effectAggregates } from "../model.js";
import type { EffectEvent, EffectPhase } from "../protocol.js";

const PHASES: readonly EffectPhase[] = ["mount", "run", "cleanup", "unmount", "error"];

const PHASE_TONE: Record<string, string> = {
  mount: "green",
  run: "blue",
  cleanup: "purple",
  unmount: "grey",
  error: "red",
};

export const effectsTab: TabDefinition = {
  id: "effects",
  label: "Effects",
  icon: "↻",
  hint: "Effect lifecycle timeline, trigger attribution, and run-on-demand",
  badge: (ctx) => {
    const errors = ctx.model.effects.filter((e) => e.phase === "error").length;
    if (errors > 0) return errors;
    return ctx.model.effects.length > 0 ? ctx.model.effects.length : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { model, ui } = ctx;

  const bar = toolbar(
    chipGroup(
      [
        { value: "timeline" as const, label: "Timeline", title: "One lane per effect on a shared time axis" },
        { value: "log" as const, label: "Log", title: "Chronological event log" },
        { value: "mounted" as const, label: "Mounted", title: "Every live effect and what it subscribes to" },
      ],
      ui.effectView,
      (value) => {
        ui.effectView = value;
        ctx.refresh();
      },
    ),
    spacer(),
    ui.effectView !== "mounted"
      ? h("div", { class: "filters" }, ...PHASES.map((phase) =>
          toggle(phase, ui.phaseFilter.has(phase), () => {
            if (ui.phaseFilter.has(phase)) ui.phaseFilter.delete(phase);
            else ui.phaseFilter.add(phase);
            ctx.refresh();
          })))
      : null,
    button("Clear", () => {
      model.effects.length = 0;
      ctx.refresh();
    }, { title: "Drop recorded effect events" }),
  );

  if (ui.effectView === "mounted") {
    return [bar, renderSummary(ctx), renderMounted(ctx)];
  }

  if (model.effects.length === 0) {
    return [bar, emptyState(
      "No effects observed yet.",
      "Effects appear as they mount, run, and clean up. If you expected one and see nothing, check the Mounted view — a dependency list that never matches produces no events at all.",
    )];
  }

  const insights = renderInsights(ctx);
  const out: Node[] = [bar, renderSummary(ctx)];
  if (insights) out.push(insights);
  out.push(ui.effectView === "timeline" ? renderTimeline(ctx) : renderLog(ctx));
  if (ui.selectedEffect) {
    const detail = renderSelected(ctx, ui.selectedEffect);
    if (detail) out.push(detail);
  }
  return out;
}

/* -------------------------------------------------------------------------- */

function renderSummary(ctx: TabContext): HTMLElement {
  const { model } = ctx;
  const keys = new Set<string>();
  let runs = 0, total = 0, cleanups = 0, errors = 0, max = 0;
  for (const event of model.effects) {
    keys.add(event.effectKey);
    if (event.phase === "run") {
      runs += 1;
      total += event.duration ?? 0;
      if ((event.duration ?? 0) > max) max = event.duration ?? 0;
    } else if (event.phase === "cleanup") cleanups += 1;
    else if (event.phase === "error") errors += 1;
  }
  const mounted = can(ctx.app, "getEffects") ? ctx.app.getEffects().length : keys.size;
  return section("Effect summary", statGrid(
    stat("mounted", fmtCount(mounted)),
    stat("seen", fmtCount(keys.size), { title: "Distinct effects observed in the retained window" }),
    stat("runs", fmtCount(runs)),
    stat("total run", fmtMs(total)),
    stat("avg run", fmtMs(runs > 0 ? total / runs : 0), { tone: runs > 0 && total / runs >= 6 ? "warn" : undefined }),
    stat("slowest", fmtMs(max)),
    stat("cleanups", fmtCount(cleanups)),
    stat("errors", fmtCount(errors), { tone: errors > 0 ? "bad" : "good" }),
  ));
}

function renderInsights(ctx: TabContext): HTMLElement | null {
  const aggs = effectAggregates(ctx.model.effects);
  const items: Array<{ tone: string; icon: string; text: string }> = [];
  for (const agg of aggs) {
    if (agg.errors > 0) {
      items.push({ tone: "bad", icon: "✖", text: `${agg.label} threw ${fmtCount(agg.errors)}× — the body is failing, so anything after the throw never runs.` });
    }
    if (agg.runs >= 20) {
      items.push({ tone: "warn", icon: "↻", text: `${agg.label} ran ${fmtCount(agg.runs)}× (${agg.triggers}) — a hot trigger. If that is not intentional, narrow the dependency list or add debounce(N).` });
    } else if (agg.runs >= 1 && agg.total / agg.runs >= 6) {
      items.push({ tone: "warn", icon: "▲", text: `${agg.label} averages ${fmtMs(agg.total / agg.runs)} per run — heavy synchronous work in an effect body blocks the next paint.` });
    }
    if (agg.mounts >= 4) {
      items.push({ tone: "warn", icon: "⇅", text: `${agg.label} mounted ${fmtCount(agg.mounts)}× — its owning component is remounting (a changing key:, or a conditional branch flipping), which tears down and re-wires the effect each time.` });
    }
  }
  if (items.length === 0) return null;
  return section("Insights", h("div", { class: "insights" }, ...items.slice(0, 6).map((item) =>
    h("div", { class: `insight t-${item.tone}` },
      h("span", { class: "insight-ic" }, item.icon),
      h("span", {}, item.text)))));
}

/**
 * One lane per effect, markers placed on a shared time axis.
 *
 * Bursts, overlapping runs, and cleanup→run pairing are shapes; a log makes you
 * reconstruct them from timestamps, and a chart shows them at a glance.
 */
function renderTimeline(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const base = model.firstTime ?? 0;
  const last = model.effects.reduce((max, e) => Math.max(max, e.time), base);
  const span = Math.max(1, last - base);

  const order: string[] = [];
  const lanes = new Map<string, { label: string; instance: boolean; events: EffectEvent[] }>();
  for (const event of model.effects) {
    let lane = lanes.get(event.effectKey);
    if (!lane) {
      lane = { label: event.label, instance: event.instanceKey != null, events: [] };
      lanes.set(event.effectKey, lane);
      order.push(event.effectKey);
    }
    lane.events.push(event);
  }

  const wrap = h("div", {});
  wrap.appendChild(h("div", { class: "tl-head" },
    h("span", { class: "section-title", style: "margin:0" }, `Timeline · ${fmtRel(span)} span`),
    h("span", { class: "tl-axis" }, "0", h("span", { class: "tl-axis-end" }, fmtRel(span)))));

  for (const key of order) {
    const lane = lanes.get(key)!;
    const track = h("div", { class: "tl-track" });
    for (const event of lane.events) {
      if (!ui.phaseFilter.has(event.phase)) continue;
      const left = ((event.time - base) / span) * 100;
      track.appendChild(h("span", {
        class: `tl-dot ${PHASE_TONE[event.phase] ?? "grey"}`,
        style: `left:${Math.min(99, Math.max(0, left))}%`,
        title: `${event.phase} · ${event.reason}${event.duration != null ? ` · ${fmtMs(event.duration)}` : ""} · ${fmtRel(event.time - base)}`,
      }));
    }
    wrap.appendChild(h("div", {
      class: `tl-row ${ui.selectedEffect === key ? "is-selected" : ""}`,
      onclick: () => {
        ui.selectedEffect = ui.selectedEffect === key ? null : key;
        ctx.refresh();
      },
    },
      h("span", { class: "tl-name", title: key },
        lane.label,
        lane.instance ? chip("inst", "purple") : null),
      track));
  }
  return section(null, wrap, { flush: true });
}

function renderLog(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const base = model.firstTime ?? 0;
  const rows = model.effects.filter((e) => ui.phaseFilter.has(e.phase)).slice(-250).reverse();
  const wrap = h("div", {});
  if (rows.length === 0) {
    wrap.appendChild(faint("No events match the active filters."));
  }
  for (const event of rows) {
    wrap.appendChild(h("div", {
      class: "log-row",
      onclick: () => {
        ui.selectedEffect = event.effectKey;
        ctx.refresh();
      },
    },
      h("span", { class: "t" }, fmtRel(event.time - base)),
      h("span", { class: "ph" }, chip(event.phase, PHASE_TONE[event.phase] ?? "grey")),
      h("span", { class: "lbl" }, event.label),
      h("span", { class: "rsn" },
        event.reason,
        event.phase === "run" && event.duration != null ? ` · ${fmtMs(event.duration)}` : "",
        event.phase === "cleanup" && event.cleanups != null ? ` · ${event.cleanups}×` : "",
        event.error ? ` · ${event.error}` : "")));
  }
  return section("Log", wrap, { flush: true });
}

/**
 * Every mounted effect, from the runtime rather than from the event stream.
 *
 * This is the view that answers "why did my effect never run?": if it is listed
 * here with the dependency you expected and no runs, the trigger is wrong; if
 * it is not listed at all, the declaration never mounted.
 */
function renderMounted(ctx: TabContext): HTMLElement {
  const { app, model } = ctx;
  if (!can(app, "getEffects")) {
    return section("Mounted effects", faint("This runtime does not expose its mounted effects."));
  }
  const effects = app.getEffects();
  const aggs = new Map(effectAggregates(model.effects).map((agg) => [agg.effectKey, agg]));

  return section(`Mounted effects (${effects.length})`, table(
    [
      {
        key: "label",
        label: "Effect",
        sort: (row) => row.label,
        render: (row) => h("span", {},
          h("span", { class: "mono" }, row.label),
          row.instanceKey
            ? h("button", {
                class: "chip purple is-link",
                title: `Inspect ${row.instanceKey}`,
                onclick: () => ctx.selectInstance(row.instanceKey),
              }, "instance")
            : null),
      },
      { key: "triggers", label: "Triggers", render: (row) => code(row.triggers) },
      {
        key: "deps",
        label: "Subscribes to",
        render: (row) => row.stateDeps.length > 0
          ? h("span", { class: "chip-row" }, ...row.stateDeps.map((dep) =>
              h("button", {
                class: "chip blue is-link",
                onclick: () => {
                  ctx.ui.stateFilter = dep.split(".")[0] ?? dep;
                  ctx.selectTab("state");
                },
              }, `$${dep}`)))
          : faint("—"),
      },
      {
        key: "intervals",
        label: "Timers",
        render: (row) => row.intervals.length > 0 ? code(row.intervals.map((ms) => `${ms}ms`).join(", ")) : faint("—"),
      },
      { key: "cleanups", label: "Cleanups", numeric: true, sort: (row) => row.cleanups, render: (row) => String(row.cleanups) },
      {
        key: "runs",
        label: "Runs",
        numeric: true,
        sort: (row) => aggs.get(row.effectKey)?.runs ?? 0,
        render: (row) => {
          const agg = aggs.get(row.effectKey);
          return agg ? h("span", {}, fmtCount(agg.runs), agg.errors > 0 ? chip(`${agg.errors} err`, "red") : null) : faint("0");
        },
      },
      {
        key: "run",
        label: "",
        render: (row) => can(app, "runEffect")
          ? button("Run now", () => {
              const ok = app.runEffect(row.effectKey);
              ctx.toast(ok ? `Ran ${row.label}` : `${row.label} is no longer mounted`, ok ? "good" : "warn");
              ctx.refresh();
            }, { title: "Fire this effect's body now (prior cleanups run first)" })
          : null,
      },
    ],
    effects,
    { empty: "No effects are mounted." },
  ));
}

function renderSelected(ctx: TabContext, effectKey: string): HTMLElement | null {
  const { model } = ctx;
  const events = model.effects.filter((e) => e.effectKey === effectKey);
  if (events.length === 0) return null;
  const agg = effectAggregates(events)[0];
  const base = model.firstTime ?? 0;
  const first = events[0]!;

  return section(`Effect — ${first.label}`, [
    h("div", { class: "kv" },
      h("span", {}, "triggers ", h("b", { class: "mono" }, first.triggers)),
      h("span", {}, "runs ", h("b", {}, String(agg?.runs ?? 0))),
      h("span", {}, "total ", h("b", { class: "mono" }, fmtMs(agg?.total ?? 0))),
      agg && agg.errors > 0 ? chip(`${agg.errors} errors`, "red") : null,
      first.instanceKey ? h("span", {}, "owner ", h("b", { class: "mono" }, first.instanceKey)) : null,
    ),
    h("div", {}, ...events.slice(-40).reverse().map((event) =>
      h("div", { class: "log-row" },
        h("span", { class: "t" }, fmtRel(event.time - base)),
        h("span", { class: "ph" }, chip(event.phase, PHASE_TONE[event.phase] ?? "grey")),
        h("span", { class: "rsn" },
          event.reason,
          event.duration != null ? ` · ${fmtMs(event.duration)}` : "",
          event.error ? ` · ${event.error}` : "")))),
  ], {
    actions: [
      first.instanceKey
        ? button("Inspect owner", () => ctx.selectInstance(first.instanceKey), { title: "Select the component that owns this effect" })
        : null,
      button("Close", () => {
        ctx.ui.selectedEffect = null;
        ctx.refresh();
      }),
    ].filter((n): n is HTMLElement => n != null),
  });
}


