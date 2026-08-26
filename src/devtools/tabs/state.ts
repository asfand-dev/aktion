/**
 * State tab — the live reactive store, plus time travel and a diff.
 *
 * Every row is editable and every edit goes through the real reactive pipeline,
 * so changing a value here re-renders the app and re-derives computed atoms
 * exactly as an event handler would. That is the point: it turns "I think the
 * bug happens when `status` is `archived`" into a two-second experiment.
 *
 * Three tools sit on top of that:
 *
 *   - **Time travel** — the runtime attaches a `$state` snapshot to every
 *     commit, so the history holds *recognisable* moments ("two clicks ago")
 *     rather than raw flushes. Scrub to preview, restore to apply.
 *   - **Diff** — pick two of those snapshots and see exactly which paths
 *     changed. "What did that click actually do?" in one screen.
 *   - **Break on change** — mark an atom, and the panel executes `debugger` the
 *     moment it changes. The panel cannot pause the runtime; the browser can,
 *     and this puts you one frame below the write with the stack intact.
 */

import {
  FOCUS_KEY_ATTR, SCROLL_KEY_ATTR, button, chip, chipGroup, code, copyButton,
  downloadText, emptyState, faint, fmtCount, fmtRel, h, jsonTree, muted,
  searchInput, section, spacer, stat, statGrid, toggle, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { rootOf, type HistoryEntry } from "../model.js";
import { previewOf } from "../serialize.js";
import type { StateAtomMeta } from "../protocol.js";

/** How long a changed row keeps its flash. */
const FLASH_MS = 1100;

export const stateTab: TabDefinition = {
  id: "state",
  label: "State",
  icon: "◆",
  hint: "Live reactive state, editable, with change counts, time travel, and a diff",
  badge: (ctx) => {
    const count = Object.keys(ctx.model.state).length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, model, ui } = ctx;
  if (!app) return [emptyState("No app selected.")];

  const meta = ctx.cache("stateMeta", () => (can(app, "getStateMeta") ? app.getStateMeta() : []));
  const metaByName = new Map(meta.map((entry) => [entry.name, entry]));

  const views: Array<{ value: typeof ui.stateView; label: string; title: string }> = [
    { value: "tree", label: "Tree", title: "The live store, editable" },
    { value: "diff", label: "Diff", title: "Compare two recorded snapshots" },
  ];

  const bar = toolbar(
    chipGroup(views, ui.stateView, (value) => {
      ui.stateView = value;
      ctx.refresh();
    }),
    ui.stateView === "tree"
      ? searchInput(ui.stateFilter, (value) => {
          ui.stateFilter = value;
          ctx.refresh();
        }, "Filter atoms…", { focusKey: "state-filter" })
      : null,
    spacer(),
    ui.stateView === "tree" ? renderTreeActions(ctx, meta) : null,
  );

  if (ui.stateView === "diff") {
    return [bar, ...renderDiffView(ctx)];
  }

  // While scrubbing, the tree shows a historical snapshot. It must be obvious
  // that you are looking at the past and that edits are not accepted there —
  // a silently read-only editor is worse than a disabled one.
  const travelling = ui.timeTravel !== null && model.history[ui.timeTravel] !== undefined;
  const entry = travelling ? model.history[ui.timeTravel!]! : null;
  const snapshot = entry ? entry.snapshot : model.state;

  const out: Node[] = [bar, renderSummary(ctx, meta)];

  if (model.history.length > 1) out.push(renderTimeTravel(ctx));
  if (ui.importDraft !== null) out.push(renderImport(ctx));

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
          ctx.toast(`$${path} = ${previewOf(value)}`);
          ctx.refresh();
        },
    readOnly: (path) => {
      if (travelling) return true;
      const info = metaByName.get(rootOf(path));
      // A runtime-owned atom (`route`, a Store's backing atom) has an owner that
      // will overwrite anything written here on the next flush.
      return info?.reserved ?? false;
    },
    highlight: changedRoots,
    decorate: (path, depth) => (depth === 0 ? renderAtomTail(ctx, path, metaByName.get(path), maxChanges) : null),
  });

  out.push(section(null, h("div", { class: "tree-wrap", [SCROLL_KEY_ATTR]: "state-tree" }, tree), { flush: true }));

  if (names.length === 0) {
    out.push(section(null, faint(
      ui.stateShowReserved
        ? "This program declares no reactive state."
        : "No author-declared atoms. Turn on “Runtime” above to see the atoms the runtime owns (route, store and form backing atoms).",
    ), { flush: true }));
  }

  const lastFlush = model.commits[model.commits.length - 1];
  if (lastFlush && lastFlush.changedPaths.length > 0) {
    out.push(section("Last commit changed", h("div", { class: "chip-row" },
      ...lastFlush.changedPaths.map((path) => h("button", {
        class: "chip blue is-link",
        title: `Filter to $${rootOf(path)}`,
        onclick: () => {
          ui.stateFilter = rootOf(path);
          ctx.refresh();
        },
      }, path)))));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Toolbar + summary                                                          */
/* -------------------------------------------------------------------------- */

function renderTreeActions(ctx: TabContext, meta: ReadonlyArray<StateAtomMeta>): HTMLElement {
  const { app, model, ui } = ctx;
  const reservedCount = meta.filter((entry) => entry.reserved).length;
  return h("div", { class: "chip-row", style: "margin:0" },
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
    button("Expand", () => {
      // Expand every top-level atom that has children — the useful default when
      // you are hunting for a value and do not know which atom holds it.
      for (const [name, value] of Object.entries(model.state)) {
        if (value && typeof value === "object") ui.stateExpanded.add(name);
      }
      ctx.refresh();
    }, { title: "Expand every object atom" }),
    ui.stateExpanded.size > 0
      ? button("Collapse", () => {
          ui.stateExpanded.clear();
          ctx.refresh();
        }, { title: "Collapse everything" })
      : null,
    copyButton(() => safeJson(model.state), "Copy"),
    button("Export", () => downloadText("aktion-state.json", safeJson(model.state)), {
      title: "Download this snapshot as JSON",
    }),
    can(app, "hydrateState")
      ? button("Import", () => {
          ui.importDraft = safeJson(model.state);
          ctx.refresh();
        }, { title: "Paste a snapshot to restore" })
      : null,
    can(app, "resetState")
      ? button("Reset", () => {
          app.resetState();
          ctx.toast("State reset to declared defaults");
          ctx.refresh();
        }, { title: "Reset every atom to its declared initial value", tone: "warn" })
      : null,
  );
}

function renderSummary(ctx: TabContext, meta: ReadonlyArray<StateAtomMeta>): HTMLElement {
  const { model, ui } = ctx;
  const derived = meta.filter((entry) => entry.computed).length;
  const modules = new Set(meta.map((entry) => entry.module).filter(Boolean)).size;
  const busiest = [...model.changeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const totalChanges = [...model.changeCounts.values()].reduce((a, b) => a + b, 0);
  return section(null, statGrid(
    stat("atoms", String(Object.keys(model.state).length)),
    stat("changes", fmtCount(totalChanges), {
      title: "Individual atom changes observed this session",
    }),
    stat("flushes", fmtCount(model.totals.stateFlushes), {
      title: "Reactive flushes — one per batch of writes, however many atoms it touched",
    }),
    derived > 0 ? stat("derived", String(derived), { title: "Atoms with a `$x = expr` initialiser — re-derived, so an edit is temporary" }) : null,
    modules > 0 ? stat("modules", String(modules), { title: "Modules contributing atoms" }) : null,
    busiest
      ? stat("busiest", `$${busiest[0]}`, {
          title: `${busiest[1]} changes — click to filter`,
          onClick: () => {
            ui.stateFilter = busiest[0];
            ctx.refresh();
          },
        })
      : null,
    stat("snapshots", String(model.history.length), {
      title: "Commits retained for time travel and diffing",
      onClick: model.history.length > 1
        ? () => {
            ui.stateView = "diff";
            ctx.refresh();
          }
        : undefined,
    }),
    ui.breakOnChange.size > 0
      ? stat("breakpoints", String(ui.breakOnChange.size), { tone: "bad", title: [...ui.breakOnChange].join(", ") })
      : null,
  ), { flush: true });
}

/**
 * The trailing controls on an atom row: heat, provenance, and the breakpoint.
 *
 * All three answer questions you have *while looking at a value*: how often does
 * this change, where was it declared, and can I catch the next write.
 */
function renderAtomTail(
  ctx: TabContext,
  name: string,
  info: StateAtomMeta | undefined,
  maxChanges: number,
): Node {
  const { model, ui } = ctx;
  const count = model.changeCounts.get(name) ?? 0;
  const armed = ui.breakOnChange.has(name);
  return h("span", { class: "row-tail" },
    info?.computed ? chip("derived", "blue", "Recomputed from its initialiser — a manual edit lasts until the next flush") : null,
    info?.module ? chip(shortModule(info.module), "grey", `Declared in ${info.module}`) : null,
    info?.authored && info.authored !== name ? code(`$${info.authored}`, "The name the author wrote") : null,
    count > 0
      ? h("span", { class: "heat", title: `${count} change${count === 1 ? "" : "s"} this session` },
          h("span", { class: "heat-bar" },
            h("span", { class: "heat-fill", style: `width:${Math.max(8, Math.round((count / maxChanges) * 100))}%` })),
          h("span", { class: "heat-num" }, fmtCount(count)))
      : null,
    h("button", {
      class: `brk ${armed ? "is-on" : ""}`,
      title: armed
        ? `Stop breaking on changes to $${name}`
        : `Break into the debugger when $${name} changes (needs the browser's DevTools open)`,
      onclick: (event: Event) => {
        event.stopPropagation();
        if (armed) ui.breakOnChange.delete(name);
        else ui.breakOnChange.add(name);
        ctx.toast(armed ? `No longer breaking on $${name}` : `Will break when $${name} changes`);
        ctx.refresh();
      },
    }, armed ? "●" : "○"),
  );
}

/* -------------------------------------------------------------------------- */
/*  Time travel                                                                */
/* -------------------------------------------------------------------------- */

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
    [FOCUS_KEY_ATTR]: "travel",
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
      button("Diff", () => {
        // Comparing the scrubbed snapshot with the newest one is the comparison
        // you almost always want next.
        ui.stateView = "diff";
        ui.diffFrom = index;
        ui.diffTo = last;
        ctx.refresh();
      }, { title: "Compare this snapshot with the latest" }),
    ),
    entry
      ? faint(
          `commit #${entry.commitId ?? "?"} · ${entry.changedPaths.length > 0 ? entry.changedPaths.join(", ") : "no state change"} · ${index + 1} of ${last + 1}`,
        )
      : null,
  ]);
}

/* -------------------------------------------------------------------------- */
/*  Diff                                                                       */
/* -------------------------------------------------------------------------- */

function renderDiffView(ctx: TabContext): Node[] {
  const { model, ui } = ctx;
  const history = model.history;
  if (history.length < 2) {
    return [emptyState(
      "Not enough snapshots to compare yet.",
      "A snapshot is captured on every commit — interact with the app a couple of times.",
    )];
  }
  const last = history.length - 1;
  const from = clamp(ui.diffFrom ?? Math.max(0, last - 1), 0, last);
  const to = clamp(ui.diffTo ?? last, 0, last);

  const picker = (label: string, value: number, onPick: (next: number) => void): HTMLElement => {
    const select = h("select", {
      class: "app-select",
      title: label,
      onchange: (event: Event) => onPick(Number((event.target as HTMLSelectElement).value)),
    }) as HTMLSelectElement;
    history.forEach((entry, index) => {
      const option = h("option", { value: String(index) },
        `#${entry.commitId ?? index} · ${fmtRel(model.lastTime - entry.time)} ago`) as HTMLOptionElement;
      if (index === value) option.selected = true;
      select.appendChild(option);
    });
    return h("span", { class: "chip-row", style: "margin:0" }, muted(label), select);
  };

  const changes = diffSnapshots(history[from]!, history[to]!);
  const rows = changes.map((change) => h("div", { class: `diff-row is-${change.kind}` },
    h("span", { class: "diff-mark" }, change.kind === "added" ? "+" : change.kind === "removed" ? "−" : "~"),
    h("span", { class: "diff-path", title: change.path }, change.path),
    change.kind !== "added" ? h("span", { class: "diff-old" }, change.before) : null,
    change.kind === "changed" ? h("span", { class: "diff-arrow" }, "→") : null,
    change.kind !== "removed" ? h("span", { class: "diff-new" }, change.after) : null,
  ));

  return [
    section(null, [
      h("div", { class: "detail-head" },
        picker("from", from, (next) => {
          ui.diffFrom = next;
          ctx.refresh();
        }),
        picker("to", to, (next) => {
          ui.diffTo = next;
          ctx.refresh();
        }),
        spacer(),
        button("Latest ↔ previous", () => {
          ui.diffFrom = Math.max(0, last - 1);
          ui.diffTo = last;
          ctx.refresh();
        }, { title: "Compare the two most recent snapshots" })),
      statGrid(
        stat("changed", String(changes.filter((c) => c.kind === "changed").length)),
        stat("added", String(changes.filter((c) => c.kind === "added").length)),
        stat("removed", String(changes.filter((c) => c.kind === "removed").length)),
        stat("apart", fmtRel(Math.abs(history[to]!.time - history[from]!.time))),
      ),
    ], { flush: true }),
    section(`Changes (${changes.length})`, changes.length === 0
      ? h("div", { class: "diff-empty" }, "These two snapshots are identical.")
      : h("div", { [SCROLL_KEY_ATTR]: "diff-list" }, ...rows)),
    section(null, [
      h("div", { class: "detail-head" },
        spacer(),
        copyButton(() => changes.map((c) => `${c.kind === "added" ? "+" : c.kind === "removed" ? "-" : "~"} ${c.path}: ${c.before} -> ${c.after}`).join("\n"), "Copy diff"),
        can(ctx.app, "hydrateState")
          ? button("Restore “from”", () => {
              ctx.app!.hydrateState!(history[from]!.snapshot);
              ctx.toast("Restored the earlier snapshot");
              ctx.refresh();
            }, { tone: "purple", title: "Hydrate the earlier of the two snapshots" })
          : null),
      faint("Paths are compared leaf by leaf, so an object that gained one field reports that field rather than the whole object."),
    ], { flush: true }),
  ];
}

export interface Change {
  kind: "added" | "removed" | "changed";
  path: string;
  before: string;
  after: string;
}

/**
 * Leaf-level diff of two snapshots.
 *
 * Comparing whole atoms would report `user` as "changed" and leave you to find
 * out what inside it moved — which is the work you wanted done. Walking to the
 * leaves means the answer is `user.prefs.notify: true → false`.
 */
export function diffSnapshots(from: HistoryEntry, to: HistoryEntry): Change[] {
  const changes: Change[] = [];
  const walk = (path: string, before: unknown, after: unknown, depth: number): void => {
    if (changes.length > 400) return;
    const bothObjects = isPlainObject(before) && isPlainObject(after);
    if (bothObjects && depth < 6) {
      const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
      for (const key of keys) {
        const nextPath = path === "" ? key : `${path}.${key}`;
        const b = (before as Record<string, unknown>)[key];
        const a = (after as Record<string, unknown>)[key];
        if (!(key in (before as object))) changes.push({ kind: "added", path: nextPath, before: "", after: previewOf(a) });
        else if (!(key in (after as object))) changes.push({ kind: "removed", path: nextPath, before: previewOf(b), after: "" });
        else walk(nextPath, b, a, depth + 1);
      }
      return;
    }
    if (!sameValue(before, after)) {
      changes.push({ kind: "changed", path: path || "(root)", before: previewOf(before), after: previewOf(after) });
    }
  };
  walk("", from.snapshot, to.snapshot, 0);
  return changes;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural equality via JSON, falling back to reference equality. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* -------------------------------------------------------------------------- */
/*  Import                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Paste a snapshot back in.
 *
 * The mirror of Export, and the thing that makes an exported state useful: a
 * teammate's `aktion-state.json` from a bug report can be dropped straight into
 * your running app.
 */
function renderImport(ctx: TabContext): HTMLElement {
  const { app, ui } = ctx;
  const area = h("textarea", {
    class: "source-editor",
    style: "min-height:120px",
    spellcheck: "false",
    [FOCUS_KEY_ATTR]: "state-import",
  }) as HTMLTextAreaElement;
  area.value = ui.importDraft ?? "";
  const status = h("span", {});
  const check = (): { ok: boolean; message: string; value?: Record<string, unknown> } => {
    try {
      const parsed = JSON.parse(area.value) as unknown;
      if (!isPlainObject(parsed)) return { ok: false, message: "must be a JSON object of atom names" };
      const keys = Object.keys(parsed as object);
      return { ok: true, message: `${keys.length} atom${keys.length === 1 ? "" : "s"}`, value: parsed as Record<string, unknown> };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "invalid JSON" };
    }
  };
  const showStatus = (): void => {
    const result = check();
    status.replaceChildren(chip(result.message, result.ok ? "green" : "red"));
  };
  area.addEventListener("input", () => {
    ui.importDraft = area.value;
    showStatus();
  });
  showStatus();

  return section("Import a snapshot", [
    area,
    h("div", { class: "detail-head" },
      status,
      faint("Hydrated the way SSR restores state, so the values survive the next replan."),
      spacer(),
      button("Cancel", () => {
        ui.importDraft = null;
        ctx.refresh();
      }),
      button("Restore", () => {
        const result = check();
        if (!result.ok || !result.value || !can(app, "hydrateState")) {
          ctx.toast(result.message, "bad");
          return;
        }
        app.hydrateState(result.value);
        ui.importDraft = null;
        ctx.toast("Snapshot restored");
        ctx.refresh();
      }, { tone: "good" })),
  ]);
}

/* -------------------------------------------------------------------------- */

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
