/**
 * State tab — the live reactive store, plus time travel.
 *
 * Every row is editable and every edit goes through the real reactive pipeline,
 * so changing a value here re-renders the app and re-derives computed atoms
 * exactly as an event handler would. That is the point: it turns "I think the
 * bug happens when `status` is `archived`" into a two-second experiment.
 *
 * Time travel is the other half. The runtime attaches a `$state` snapshot to
 * every commit, so the panel holds a bounded history of *recognisable* moments
 * ("two clicks ago") rather than raw flushes. Scrubbing previews a snapshot;
 * restoring hydrates it back into the store.
 */

import {
  button, chip, code, copyButton, downloadText, emptyState, faint, fmtCount,
  fmtRel, h, jsonTree, muted, searchInput, section, spacer, stat, statGrid,
  toggle, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { rootOf } from "../model.js";
import type { StateAtomMeta } from "../protocol.js";

/** How long a changed row keeps its flash. */
const FLASH_MS = 1100;

export const stateTab: TabDefinition = {
  id: "state",
  label: "State",
  icon: "◆",
  hint: "Live reactive state, editable, with per-atom change counts and time travel",
  badge: (ctx) => {
    const count = Object.keys(ctx.model.state).length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, model, ui } = ctx;
  if (!app) return [emptyState("No app selected.")];

  const meta = can(app, "getStateMeta") ? app.getStateMeta() : [];
  const metaByName = new Map(meta.map((entry) => [entry.name, entry]));

  // While scrubbing, the tree shows a historical snapshot. It must be obvious
  // that you are looking at the past and that edits are not accepted there —
  // a silently-read-only editor is worse than a disabled one.
  const travelling = ui.timeTravel !== null && model.history[ui.timeTravel] !== undefined;
  const entry = travelling ? model.history[ui.timeTravel!]! : null;
  const snapshot = entry ? entry.snapshot : model.state;

  const totalChanges = [...model.changeCounts.values()].reduce((a, b) => a + b, 0);
  const reservedCount = meta.filter((m) => m.reserved).length;

  const bar = toolbar(
    searchInput(ui.stateFilter, (value) => {
      ui.stateFilter = value;
      ctx.refresh();
    }, "Filter atoms…"),
    toggle("Activity", ui.stateSort === "activity", () => {
      ui.stateSort = ui.stateSort === "activity" ? "name" : "activity";
      ctx.refresh();
    }, "Sort by how often each atom changes"),
    reservedCount > 0
      ? toggle(`Runtime (${reservedCount})`, ui.stateShowReserved, () => {
          ui.stateShowReserved = !ui.stateShowReserved;
          ctx.refresh();
        }, "Show runtime-owned atoms: route, Store / $form backing atoms")
      : null,
    spacer(),
    muted(`${Object.keys(snapshot).length} atoms · ${fmtCount(totalChanges)} changes`),
    copyButton(() => safeJson(snapshot), "Copy"),
    button("Export", () => downloadText("aktion-state.json", safeJson(snapshot)), {
      title: "Download this snapshot as JSON",
    }),
    can(app, "resetState")
      ? button("Reset", () => {
          app.resetState();
          ctx.toast("State reset to declared defaults");
          ctx.refresh();
        }, { title: "Reset every atom to its declared initial value", tone: "warn" })
      : null,
  );

  const out: Node[] = [bar, renderSummary(ctx, meta)];

  if (model.history.length > 1) out.push(renderTimeTravel(ctx));

  if (travelling && entry) {
    out.push(section(null, h("div", { class: "banner t-purple" },
      h("span", {},
        `Viewing commit #${entry.commitId ?? "?"} — ${fmtRel(model.lastTime - entry.time)} ago. Rows are read-only while scrubbing.`),
      spacer(),
      can(app, "hydrateState")
        ? button("Restore this snapshot", () => {
            app.hydrateState(entry.snapshot);
            ui.timeTravel = null;
            ctx.toast("Snapshot restored into the live store");
            ctx.refresh();
          }, { tone: "purple" })
        : null,
      button("Back to live", () => {
        ui.timeTravel = null;
        ctx.refresh();
      }),
    ), { flush: true }));
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const maxChanges = Math.max(1, ...model.changeCounts.values());
  const names = Object.keys(snapshot)
    .filter((name) => ui.stateShowReserved || !(metaByName.get(name)?.reserved ?? false))
    .sort((a, b) => {
      if (ui.stateSort === "activity") {
        const diff = (model.changeCounts.get(b) ?? 0) - (model.changeCounts.get(a) ?? 0);
        if (diff !== 0) return diff;
      }
      return a.localeCompare(b);
    });

  // `jsonTree` walks a whole object, so hand it one that only holds the atoms
  // that survived the filters, in the order we want them.
  const ordered: Record<string, unknown> = {};
  for (const name of names) ordered[name] = snapshot[name];

  const changedRoots = new Set<string>();
  for (const [root, at] of model.changed) {
    if (now - at < FLASH_MS) changedRoots.add(root);
  }

  const tree = jsonTree(ordered, {
    expanded: ui.stateExpanded,
    filter: ui.stateFilter,
    onToggle: () => ctx.refresh(),
    onEdit: travelling
      ? undefined
      : (path, value) => {
          app.setState(path, value);
          ctx.toast(`$${path} = ${JSON.stringify(value)}`);
          ctx.refresh();
        },
    readOnly: (path, depth) => {
      if (travelling) return true;
      const atom = rootOf(path);
      const info = metaByName.get(atom);
      // A runtime-owned atom (`route`, a Store's backing atom) has an owner that
      // will overwrite anything written here on the next flush.
      return depth === 0 ? (info?.reserved ?? false) : (info?.reserved ?? false);
    },
    highlight: changedRoots,
    decorate: (path, depth) => {
      if (depth !== 0) return null;
      const info = metaByName.get(path);
      const count = model.changeCounts.get(path) ?? 0;
      return h("span", { class: "row-tail" },
        info?.computed ? chip("derived", "blue", "Recomputed from its initialiser — a manual edit lasts until the next replan") : null,
        info?.module ? chip(shortModule(info.module), "grey", `Declared in ${info.module}`) : null,
        info?.authored && info.authored !== path ? code(`$${info.authored}`, "The name the author wrote") : null,
        count > 0
          ? h("span", { class: "heat", title: `${count} change${count === 1 ? "" : "s"} this session` },
              h("span", { class: "heat-bar" },
                h("span", { class: "heat-fill", style: `width:${Math.max(8, Math.round((count / maxChanges) * 100))}%` })),
              h("span", { class: "heat-num" }, fmtCount(count)))
          : null,
      );
    },
  });

  out.push(section(null, tree, { flush: true }));

  const lastFlush = model.commits[model.commits.length - 1];
  if (lastFlush && lastFlush.changedPaths.length > 0) {
    out.push(section("Last commit changed", h("div", { class: "chip-row" },
      ...lastFlush.changedPaths.map((path) => chip(path, "blue")))));
  }
  return out;
}

function renderSummary(ctx: TabContext, meta: ReadonlyArray<StateAtomMeta>): HTMLElement {
  const { model } = ctx;
  const derived = meta.filter((m) => m.computed).length;
  const modules = new Set(meta.map((m) => m.module).filter(Boolean)).size;
  const busiest = [...model.changeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return section(null, statGrid(
    stat("atoms", String(Object.keys(model.state).length)),
    stat("flushes", fmtCount(model.totals.stateFlushes)),
    derived > 0 ? stat("derived", String(derived), { title: "Atoms with a `$x = expr` initialiser" }) : null,
    modules > 0 ? stat("modules", String(modules), { title: "Modules contributing atoms" }) : null,
    busiest
      ? stat("busiest", `$${busiest[0]}`, {
          title: `${busiest[1]} changes`,
          onClick: () => {
            ctx.ui.stateFilter = busiest[0];
            ctx.refresh();
          },
        })
      : null,
    stat("history", String(model.history.length), { title: "Snapshots retained for time travel" }),
  ), { flush: true });
}

/**
 * The time-travel scrubber.
 *
 * A range input rather than a list: the useful gesture is "drag backwards until
 * the UI looks wrong", which needs continuous movement, not clicking rows.
 */
function renderTimeTravel(ctx: TabContext): HTMLElement {
  const { model, ui } = ctx;
  const last = model.history.length - 1;
  const index = ui.timeTravel ?? last;
  const entry = model.history[index];

  const slider = h("input", {
    class: "slider",
    type: "range",
    min: "0",
    max: String(last),
    value: String(index),
    oninput: (event: Event) => {
      const next = Number((event.target as HTMLInputElement).value);
      ui.timeTravel = next >= last ? null : next;
      ctx.refresh();
    },
  }) as HTMLInputElement;

  return section("Time travel", [
    h("div", { class: "travel-row" },
      button("◀", () => {
        ui.timeTravel = Math.max(0, index - 1);
        ctx.refresh();
      }, { title: "Previous snapshot" }),
      slider,
      button("▶", () => {
        const next = Math.min(last, index + 1);
        ui.timeTravel = next >= last ? null : next;
        ctx.refresh();
      }, { title: "Next snapshot" }),
      button("Live", () => {
        ui.timeTravel = null;
        ctx.refresh();
      }, { active: ui.timeTravel === null, title: "Follow the live store" }),
    ),
    entry
      ? faint(
          `commit #${entry.commitId ?? "?"} · ${entry.changedPaths.length > 0 ? entry.changedPaths.join(", ") : "no state change"} · ${index + 1} of ${last + 1}`,
        )
      : null,
  ]);
}

/** Shorten a module path to its file name. */
function shortModule(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** JSON text of a snapshot, degrading to a note rather than throwing. */
function safeJson(snapshot: Record<string, unknown>): string {
  try {
    return JSON.stringify(snapshot, null, 2);
  } catch {
    return "/* this snapshot holds a value that cannot be serialised */";
  }
}
