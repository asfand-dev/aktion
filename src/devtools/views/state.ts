/**
 * State — every reactive atom, editable in place; time travel through the
 * commit history (read-only, or live in the app); a structural diff between
 * any two snapshots; each atom's change log; and the reactivity graph that
 * shows who re-evaluates when an atom changes.
 */

import { h, type Child, type VNode } from "../core/vdom.js";
import { can, saveAppData, loadAppData, type Bookmark, type ViewContext, type ViewDefinition } from "../context.js";
import type { HistoryEntry } from "../model.js";
import { rootOf } from "../model.js";
import type { ReactivityGraph, StateAtomMeta } from "../protocol.js";
import { previewOf } from "../serialize.js";
import { icon } from "../ui/icons.js";
import {
  button, chip, downloadText, emptyState, fmtAgo, fmtCount, iconButton, note, searchField, segmented, select, spacer, textarea, viewbar, vsep, filterChip,
} from "../ui/kit.js";
import { split } from "../ui/layout.js";
import { valueTree, type ValueRow } from "../ui/value.js";
import { noApp, paneSize, setPaneSize, unsupported } from "./common.js";

/* -------------------------------------------------------------------------- */
/*  Diff                                                                       */
/* -------------------------------------------------------------------------- */

export interface Change {
  kind: "added" | "removed" | "changed";
  path: string;
  before: string;
  after: string;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Leaf-level diff between two recorded snapshots: recurses into plain objects
 * (arrays compare whole), reports added / removed keys, and caps at 400 changes
 * so a pathological snapshot cannot stall the panel.
 */
export function diffSnapshots(from: HistoryEntry, to: HistoryEntry): Change[] {
  const changes: Change[] = [];
  const walk = (path: string, before: unknown, after: unknown, depth: number): void => {
    if (changes.length > 400) return;
    if (isPlainObject(before) && isPlainObject(after) && depth < 6) {
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
    if (!sameValue(before, after)) changes.push({ kind: "changed", path: path || "(root)", before: previewOf(before), after: previewOf(after) });
  };
  walk("", from.snapshot, to.snapshot, 0);
  return changes;
}

/* -------------------------------------------------------------------------- */
/*  Time travel                                                                */
/* -------------------------------------------------------------------------- */

/** Saved while a live preview is active, so "Back to live" can put it back. */
const livePreview = new WeakMap<object, Record<string, unknown>>();

function travelTo(ctx: ViewContext, commitId: number | null, preview: boolean): void {
  const { ui, model, app } = ctx;
  const entry = commitId === null ? null : model.history.find((h) => h.commitId === commitId) ?? null;
  if (commitId !== null && !entry) return;
  const saved = livePreview.get(model);
  if (commitId === null) {
    ui.timeTravel = null;
    if (saved && can(app, "hydrateState")) {
      model.suspendHistory = true;
      app.hydrateState(saved);
      queueMicrotask(() => { model.suspendHistory = false; });
    }
    livePreview.delete(model);
    model.suspendHistory = false;
    ctx.refresh();
    return;
  }
  ui.timeTravel = commitId;
  if (preview && can(app, "hydrateState") && entry) {
    if (!saved) livePreview.set(model, structuredCloneSafe(model.state));
    model.suspendHistory = true;
    app.hydrateState(entry.snapshot);
  }
  ctx.refresh();
}

function structuredCloneSafe<T>(value: T): T {
  try {
    return typeof structuredClone === "function" ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);
  } catch {
    return value;
  }
}

function timeTravelBar(ctx: ViewContext): VNode | null {
  const { ui, model } = ctx;
  const history = model.history;
  if (history.length < 2) return null;
  const index = ui.timeTravel === null ? history.length - 1 : Math.max(0, history.findIndex((h) => h.commitId === ui.timeTravel));
  const entry = history[index]!;
  const previewing = livePreview.has(model);
  const step = (delta: number): void => {
    const next = Math.max(0, Math.min(history.length - 1, index + delta));
    travelTo(ctx, next === history.length - 1 && !previewing ? null : history[next]!.commitId, previewing);
  };
  return h("div", { class: ["st-travel", ui.timeTravel !== null ? "is-travelling" : ""], "data-dt": "time-travel" },
    iconButton({ icon: "stepBack", label: "Previous commit", size: "sm", disabled: index === 0, onClick: () => step(-1) }),
    h("div", { class: "st-ticks" },
      h("input", {
        type: "range", min: 0, max: history.length - 1, step: 1, value: index,
        "aria-label": "Time travel",
        class: "st-range",
        onInput: (event: Event) => {
          const next = Number((event.target as HTMLInputElement).value);
          travelTo(ctx, next === history.length - 1 && !previewing ? null : history[next]!.commitId, previewing);
        },
      }),
      h("div", { class: "st-tickmarks", "aria-hidden": "true" }, ...history.map((h2, i) => h("span", {
        key: h2.commitId ?? i,
        class: ["st-tick", i === index ? "is-on" : "", h2.changedPaths.length === 0 ? "is-forced" : ""],
        style: { left: `${history.length === 1 ? 0 : (i / (history.length - 1)) * 100}%` },
      })))),
    iconButton({ icon: "stepForward", label: "Next commit", size: "sm", disabled: index === history.length - 1, onClick: () => step(1) }),
    h("span", { class: "st-travel-label" },
      h("b", {}, `#${entry.commitId ?? "?"}`),
      entry.changedPaths.length > 0 ? ` ${entry.changedPaths.slice(0, 3).map((p) => `$${p}`).join(", ")}${entry.changedPaths.length > 3 ? "…" : ""}` : " forced",
      h("span", { class: "t3" }, ` · ${index + 1}/${history.length}`)),
    spacer(),
    filterChip({ label: "Preview in app", on: previewing, tip: "Hydrate the running app to each snapshot as you scrub — true time travel", testid: "travel-preview", onToggle: () => {
      if (previewing) travelTo(ctx, null, false);
      else travelTo(ctx, entry.commitId, true);
    } }),
    button({ label: "Live", size: "sm", active: ui.timeTravel === null, icon: "live", onClick: () => travelTo(ctx, null, false), testid: "travel-live" }));
}

/* -------------------------------------------------------------------------- */
/*  Tree                                                                       */
/* -------------------------------------------------------------------------- */

/** A `$query` / `Http({...})` resource as it appears in a state snapshot. */
function isResourceShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return "state" in record && "loading" in record && "data" in record && typeof record.state === "string";
}

function atomMeta(ctx: ViewContext): Map<string, StateAtomMeta> {
  const { app } = ctx;
  if (!can(app, "getStateMeta")) return new Map();
  return ctx.cache("stateMeta", () => new Map(app.getStateMeta().map((meta) => [meta.name, meta])));
}

function graphOf(ctx: ViewContext): ReactivityGraph | null {
  const { app } = ctx;
  if (!can(app, "getReactivityGraph")) return null;
  return ctx.cache("reactivity", () => app.getReactivityGraph());
}

function treeView(ctx: ViewContext): Child {
  const { ui, model, app } = ctx;
  const meta = atomMeta(ctx);
  const travelling = ui.timeTravel !== null;
  const entry = travelling ? model.history.find((h) => h.commitId === ui.timeTravel) : undefined;
  const source = entry ? entry.snapshot : model.state;
  const names = Object.keys(source).filter((name) => ui.stateShowReserved || !(meta.get(name)?.reserved ?? name === "route"));
  const maxChanges = Math.max(1, ...[...model.changeCounts.values()]);
  if (ui.stateSort === "activity") names.sort((a, b) => (model.changeCounts.get(b) ?? 0) - (model.changeCounts.get(a) ?? 0) || a.localeCompare(b));
  else names.sort((a, b) => a.localeCompare(b));
  const root: Record<string, unknown> = {};
  for (const name of names) root[name] = source[name];
  const now = ctx.now();

  const decorate = (row: ValueRow): Child => {
    if (row.depth !== 0) return null;
    const m = meta.get(row.key);
    const count = model.changeCounts.get(row.key) ?? 0;
    const resource = isResourceShape(row.value);
    return h("span", { class: "st-deco" },
      resource ? chip("query", "cyan", { tip: "A $query / Http resource — open it in Data to refetch or simulate states", onClick: () => { ui.dataPane = "queries"; ctx.selectTab("data"); } }) : null,
      m?.computed && !resource ? chip("derived", "blue", { tip: "Recomputed from its dependencies — an edit lasts until they change" }) : null,
      m?.reserved ? chip("runtime", "grey") : null,
      m?.module ? chip(m.module.split("/").pop() ?? m.module, "grey", { tip: `Declared in ${m.module}` }) : null,
      count > 0 ? h("span", { class: "st-heat", "data-tip": `${count} change${count === 1 ? "" : "s"}` }, h("span", { style: { width: `${Math.max(8, (count / maxChanges) * 100)}%` } })) : null,
      h("span", { class: "st-count" }, count > 0 ? String(count) : ""),
      h("button", {
        type: "button",
        class: ["ibtn is-sm st-break", ui.breakOnChange.has(row.key) ? "is-on" : ""],
        "aria-label": ui.breakOnChange.has(row.key) ? `Stop breaking on $${row.key}` : `Break into the debugger when $${row.key} changes`,
        "data-tip": ui.breakOnChange.has(row.key) ? "Breakpoint set — click to clear" : "Break on change",
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
          if (ui.breakOnChange.has(row.key)) ui.breakOnChange.delete(row.key);
          else ui.breakOnChange.add(row.key);
          ctx.toast(ui.breakOnChange.has(row.key) ? `Will pause in the debugger when $${row.key} changes (browser DevTools must be open)` : `No longer breaking on $${row.key}`);
          ctx.refresh();
        },
      }, icon("record", { size: 9 })));
  };
  const rowClass = (row: ValueRow): string => {
    if (row.depth !== 0 || travelling) return "";
    const at = model.changed.get(row.key);
    if (at === undefined || now - at > 1100) return "";
    return `flash-${(model.changeCounts.get(row.key) ?? 0) % 2}`;
  };

  const tree = valueTree({
    scope: "state",
    value: root,
    expanded: ui.stateExpanded,
    onToggle: (path) => { if (ui.stateExpanded.has(path)) ui.stateExpanded.delete(path); else ui.stateExpanded.add(path); ctx.refresh(); },
    rowHeight: ctx.rowHeight,
    filter: ui.stateFilter,
    editable: (path) => !travelling && !(meta.get(rootOf(path))?.reserved ?? false),
    editing: ui.edit,
    setEditing: (edit) => { ui.edit = edit; ctx.refresh(); },
    onEdit: (path, value) => {
      if (!app) return;
      app.setState(path, value);
      ctx.toast(`$${path} = ${previewOf(value)}`, "good");
    },
    editJson: (path, value) => ctx.editJson({
      title: `Edit $${path}`,
      value,
      hint: "The whole value is replaced through the reactive pipeline, exactly like an event handler writing it.",
      onSave: (next) => { app?.setState(path, next); ctx.toast(`$${path} replaced`, "good"); },
    }),
    onCopy: (text, what) => ctx.copy(text, `$${what}`),
    selected: ui.stateSelected,
    onSelect: (path) => { ui.stateSelected = path; ctx.refresh(); },
    decorate,
    rowClass,
    pages: ui.statePages,
    onMore: (container) => { ui.statePages.set(container, (ui.statePages.get(container) ?? 1) + 1); ctx.refresh(); },
    testid: "state-tree",
    version: [model.revs.state, ui.timeTravel, ui.stateSort, ui.stateShowReserved, ui.breakOnChange.size, now > (model.lastTime + 1100) ? 0 : Math.floor(now / 200)],
    empty: emptyState({
      icon: "state",
      title: ui.stateFilter ? "No atom matches the filter" : "This program declares no reactive state",
      body: ui.stateFilter ? "Filters match keys and leaf values." : ["Declare one with ", h("code", {}, "$count = 0"), "."],
    }),
  });

  const selected = ui.stateSelected ? rootOf(ui.stateSelected) : null;
  const side = selected && selected in source && ctx.width() >= 760 ? atomDetail(ctx, selected, source[selected]) : null;
  return h("div", { class: "st-main" },
    travelling && entry
      ? note("accent", [
          h("b", {}, `Viewing commit #${entry.commitId}`), ` — ${fmtAgo(entry.time, ctx.now())}. `,
          livePreview.has(model) ? "The app is showing this snapshot." : "Rows are read-only while scrubbing.",
        ], {
          icon: "history",
          actions: h("span", { class: "row-flex" },
            can(app, "hydrateState") && !livePreview.has(model) ? button({ label: "Restore into app", size: "sm", icon: "undo", testid: "travel-restore", onClick: () => { app.hydrateState(entry.snapshot); ui.timeTravel = null; ctx.toast("Snapshot restored into the live store", "good"); ctx.refresh(); } }) : null,
            button({ label: "Back to live", size: "sm", onClick: () => travelTo(ctx, null, false) })),
        })
      : null,
    side
      ? split({ size: paneSize(ctx, "state.tree", Math.round(ctx.width() * 0.58)), min: 260, onResize: (s) => setPaneSize(ctx, "state.tree", s), first: tree, second: side })
      : tree);
}

function atomDetail(ctx: ViewContext, name: string, value: unknown): Child {
  const { model, app, ui } = ctx;
  const meta = atomMeta(ctx).get(name);
  const log = model.atomLog.get(name) ?? [];
  const graph = graphOf(ctx);
  const readers = graph ? [
    ...graph.components.filter((c) => c.deps.some((d) => rootOf(d) === name)).map((c) => ({ kind: "component" as const, key: c.instanceKey, label: c.name })),
    ...graph.effects.filter((e) => e.deps.some((d) => rootOf(d) === name)).map((e) => ({ kind: "effect" as const, key: e.effectKey, label: e.label })),
    ...graph.atoms.filter((a) => a.computed && a.deps.some((d) => rootOf(d) === name)).map((a) => ({ kind: "derived" as const, key: a.name, label: `$${a.name}` })),
  ] : [];
  const byComponent = new Map<string, { label: string; keys: string[] }>();
  for (const reader of readers.filter((r) => r.kind === "component")) {
    const entry = byComponent.get(reader.label) ?? { label: reader.label, keys: [] };
    entry.keys.push(reader.key);
    byComponent.set(reader.label, entry);
  }
  return h("div", { class: "st-side", "data-dt": "atom-detail" },
    h("div", { class: "pane-head" },
      h("span", { class: "pane-title mono tone-purple" }, `$${name}`),
      meta?.computed ? chip("derived", "blue") : null,
      spacer(),
      can(app, "resetState") && !meta?.reserved ? iconButton({ icon: "undo", label: `Reset $${name} to its declared value`, onClick: () => { app.resetState([name]); ctx.toast(`$${name} reset`); } }) : null,
      iconButton({ icon: "close", label: "Close", onClick: () => { ui.stateSelected = null; ctx.refresh(); } })),
    h("div", { class: "pane-body is-pad stack" },
      h("div", { class: "st-facts" },
        h("div", {}, h("span", { class: "t3" }, "Type"), h("b", {}, Array.isArray(value) ? `array(${(value as unknown[]).length})` : value === null ? "null" : typeof value)),
        h("div", {}, h("span", { class: "t3" }, "Changes"), h("b", {}, fmtCount(model.changeCounts.get(name) ?? 0))),
        h("div", {}, h("span", { class: "t3" }, "Last change"), h("b", {}, model.changed.has(name) ? fmtAgo(model.changed.get(name)!, ctx.now()) : "—")),
        meta?.source ? h("div", {}, h("span", { class: "t3" }, "Declared"), h("button", { type: "button", class: "link mono", onClick: () => { ui.sourceFocusLine = meta.source!.line; ctx.selectTab("source"); } }, `L${meta.source.line}`)) : null),
      graph ? h("div", {},
        h("div", { class: "it-sub" }, `Read by (${readers.length})`),
        readers.length === 0 ? h("div", { class: "hint" }, "Nothing on screen reads this atom right now.") : h("div", { class: "chips" },
          ...[...byComponent.values()].map((c) => chip(`${c.label}${c.keys.length > 1 ? ` ×${c.keys.length}` : ""}`, "accent", { icon: "puzzle", onClick: () => ctx.selectInstance(c.keys[0]!) })),
          ...readers.filter((r) => r.kind === "effect").map((r) => chip(r.label, "green", { icon: "effects", onClick: () => { ui.selectedEffect = r.key; ctx.selectTab("effects"); } })),
          ...readers.filter((r) => r.kind === "derived").map((r) => chip(r.label, "blue", { mono: true, onClick: () => { ui.stateSelected = r.key; ctx.refresh(); } })))) : null,
      h("div", {},
        h("div", { class: "it-sub row-flex" }, `Recent changes (${log.length})`, spacer(), log.length > 0 ? button({ label: "Full log", size: "sm", variant: "ghost", onClick: () => { ui.stateView = "log"; ctx.refresh(); } }) : null),
        log.length === 0 ? h("div", { class: "hint" }, "Unchanged since the panel opened.") : h("div", { class: "st-log" }, ...log.slice(-8).reverse().map((change, i) => h("div", { key: `${change.time}:${i}`, class: "st-log-row" },
          h("span", { class: "st-log-time" }, fmtAgo(change.time, ctx.now())),
          h("span", { class: "v t-string st-before", title: change.before }, change.before),
          icon("arrowRight", { size: 11 }),
          h("span", { class: "v st-after", title: change.after }, change.after)))))));
}

/* -------------------------------------------------------------------------- */
/*  Diff view                                                                  */
/* -------------------------------------------------------------------------- */

function diffView(ctx: ViewContext): Child {
  const { ui, model, app } = ctx;
  const history = model.history;
  if (history.length < 2) {
    return emptyState({ icon: "diff", title: "Not enough snapshots to compare", body: "Snapshots are recorded per commit (Settings → State snapshots). Interact with the app to create some." });
  }
  const ids = history.map((h2) => h2.commitId ?? -1);
  const toId = ui.diffTo !== null && ids.includes(ui.diffTo) ? ui.diffTo : ids[ids.length - 1]!;
  const fromId = ui.diffFrom !== null && ids.includes(ui.diffFrom) ? ui.diffFrom : ids[Math.max(0, ids.indexOf(toId) - 1)]!;
  const from = history.find((h2) => h2.commitId === fromId)!;
  const to = history.find((h2) => h2.commitId === toId)!;
  const changes = ctx.memo("st:diff", [from, to], () => diffSnapshots(from, to));
  const options = history.map((h2) => ({ value: String(h2.commitId), label: `#${h2.commitId} · ${fmtAgo(h2.time, ctx.now())}${h2.changedPaths.length ? ` · ${h2.changedPaths.slice(0, 2).join(", ")}` : ""}` }));
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of changes) counts[change.kind] += 1;
  return h("div", { class: "st-diff", "data-dt": "state-diff" },
    h("div", { class: "st-diff-bar" },
      h("span", { class: "t3" }, "From"),
      select({ value: String(fromId), options, label: "From snapshot", onChange: (v) => { ui.diffFrom = Number(v); ctx.refresh(); } }),
      icon("arrowRight", { size: 13 }),
      h("span", { class: "t3" }, "to"),
      select({ value: String(toId), options, label: "To snapshot", onChange: (v) => { ui.diffTo = Number(v); ctx.refresh(); } }),
      button({ label: "Latest vs previous", size: "sm", variant: "ghost", onClick: () => { ui.diffFrom = null; ui.diffTo = null; ctx.refresh(); } }),
      spacer(),
      chip(`${counts.changed} changed`, "amber"), chip(`${counts.added} added`, "green"), chip(`${counts.removed} removed`, "red"),
      button({ label: "Copy", size: "sm", icon: "copy", onClick: () => ctx.copy(changes.map((c) => `${c.kind === "added" ? "+" : c.kind === "removed" ? "-" : "~"} ${c.path}: ${c.before} -> ${c.after}`).join("\n"), "the diff") }),
      can(app, "hydrateState") ? button({ label: "Restore “from”", size: "sm", icon: "undo", onClick: () => { app.hydrateState(from.snapshot); ctx.toast(`Restored commit #${from.commitId}`, "good"); } }) : null),
    changes.length === 0
      ? note("good", "These two snapshots are identical.")
      : h("div", { class: "st-changes" }, ...changes.map((change, i) => h("div", { key: `${change.path}${i}`, class: ["st-change", `is-${change.kind}`] },
          h("span", { class: "st-change-mark" }, change.kind === "added" ? "+" : change.kind === "removed" ? "−" : "~"),
          h("span", { class: "st-change-path mono" }, change.path),
          change.kind !== "added" ? h("span", { class: "v st-before", title: change.before }, change.before) : null,
          change.kind === "changed" ? icon("arrowRight", { size: 11 }) : null,
          change.kind !== "removed" ? h("span", { class: "v st-after", title: change.after }, change.after) : null))),
    bookmarksPanel(ctx));
}

function bookmarksPanel(ctx: ViewContext): Child {
  const { ui, app, model } = ctx;
  const label = app?.label ?? "imported";
  if (ui.bookmarks.length === 0) ui.bookmarks = loadAppData<Bookmark[]>(label, "bookmarks", []);
  return h("div", { class: "st-bookmarks" },
    h("div", { class: "it-sub row-flex" }, `Saved snapshots (${ui.bookmarks.length})`, spacer(),
      button({ label: "Save current", size: "sm", icon: "bookmark", testid: "bookmark-save", onClick: () => {
        const name = `Snapshot ${ui.bookmarks.length + 1}`;
        ui.bookmarks = [...ui.bookmarks, { id: `bm-${Date.now()}`, name, at: Date.now(), state: structuredCloneSafe(model.state) }];
        saveAppData(label, "bookmarks", ui.bookmarks);
        ctx.toast(`${name} saved — it survives reloads`, "good");
        ctx.refresh();
      } })),
    ui.bookmarks.length === 0
      ? h("div", { class: "hint" }, "Save a state to come back to it later — perfect for reproducing a bug in exactly the state it needs.")
      : h("div", { class: "st-bm-list" }, ...ui.bookmarks.map((bookmark) => h("div", { key: bookmark.id, class: "st-bm" },
          icon("bookmark", { size: 13 }),
          h("span", { class: "grow ellipsis" }, bookmark.name, h("span", { class: "t3" }, ` · ${new Date(bookmark.at).toLocaleString()} · ${Object.keys(bookmark.state).length} atoms`)),
          can(app, "hydrateState") ? button({ label: "Restore", size: "sm", onClick: () => { app.hydrateState(bookmark.state); ctx.toast(`${bookmark.name} restored`, "good"); } }) : null,
          iconButton({ icon: "download", label: "Download", size: "sm", onClick: () => downloadText(`${bookmark.name.replace(/\W+/g, "-")}.json`, JSON.stringify(bookmark.state, null, 2)) }),
          iconButton({ icon: "trash", label: "Delete", size: "sm", danger: true, onClick: () => { ui.bookmarks = ui.bookmarks.filter((b) => b.id !== bookmark.id); saveAppData(label, "bookmarks", ui.bookmarks); ctx.refresh(); } })))));
}

/* -------------------------------------------------------------------------- */
/*  Change log                                                                 */
/* -------------------------------------------------------------------------- */

function logView(ctx: ViewContext): Child {
  const { ui, model } = ctx;
  const atoms = [...model.atomLog.entries()].sort((a, b) => (b[1][b[1].length - 1]?.time ?? 0) - (a[1][a[1].length - 1]?.time ?? 0));
  if (atoms.length === 0) return emptyState({ icon: "history", title: "No changes recorded yet", body: "Every write to an atom lands here with its before and after value." });
  const selected = ui.stateSelected && model.atomLog.has(rootOf(ui.stateSelected)) ? rootOf(ui.stateSelected) : atoms[0]![0];
  const log = model.atomLog.get(selected) ?? [];
  return split({
    size: paneSize(ctx, "state.log", 220),
    min: 160,
    onResize: (s) => setPaneSize(ctx, "state.log", s),
    first: h("div", { class: "pane-body st-log-atoms" }, ...atoms.map(([name, changes]) => h("button", {
      key: name, type: "button", class: ["row", name === selected ? "is-selected" : ""],
      onClick: () => { ui.stateSelected = name; ctx.refresh(); },
    }, h("span", { class: "vk" }, `$${name}`), spacer(), h("span", { class: "badge" }, String(changes.length))))),
    second: h("div", { class: "pane-body is-pad", "data-dt": "state-log" },
      h("div", { class: "it-sub" }, `$${selected} — ${log.length} change${log.length === 1 ? "" : "s"}, newest first`),
      h("div", { class: "st-log is-full" }, ...[...log].reverse().map((change, i) => h("div", { key: `${change.time}:${i}`, class: "st-log-row" },
        h("span", { class: "st-log-time" }, fmtAgo(change.time, ctx.now())),
        h("span", { class: "chips" }, ...change.paths.slice(0, 3).map((p) => chip(p, "grey", { mono: true }))),
        h("span", { class: "v st-before", title: change.before }, change.before),
        icon("arrowRight", { size: 11 }),
        h("span", { class: "v st-after", title: change.after }, change.after))))),
  });
}

/* -------------------------------------------------------------------------- */
/*  Reactivity graph                                                           */
/* -------------------------------------------------------------------------- */

/** "on $count", "every 3s", "on mount" — what an effect is FOR, not where it is. */
export function effectLabel(effect: { label: string; triggers?: string; deps: string[] }): string {
  const every = /every\((\d+)\)/.exec(effect.triggers ?? "");
  if (every) {
    const ms = Number(every[1]);
    return `every ${ms >= 1000 && ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`}`;
  }
  if (effect.deps.length > 0) return `on ${effect.deps.slice(0, 2).map((d) => `$${d}`).join(", ")}${effect.deps.length > 2 ? "…" : ""}`;
  if (/mount/.test(effect.triggers ?? "")) return "on mount";
  return effect.label;
}

interface GraphNode {
  id: string;
  label: string;
  column: number;
  kind: "atom" | "derived" | "component" | "effect";
  count?: number;
  target: string;
}

function graphView(ctx: ViewContext): Child {
  const graph = graphOf(ctx);
  if (!graph) return h("div", { class: "dt-pad" }, unsupported("its reactivity graph"));
  const { ui } = ctx;
  const nodes: GraphNode[] = [];
  const edges: Array<[string, string]> = [];
  const atoms = graph.atoms.filter((a) => ui.stateShowReserved || !a.reserved);
  const atomNames = new Set(atoms.map((a) => a.name));
  for (const atom of atoms) nodes.push({ id: `a:${atom.name}`, label: `$${atom.name}`, column: atom.computed ? 1 : 0, kind: atom.computed ? "derived" : "atom", target: atom.name });
  for (const atom of atoms) {
    if (!atom.computed) continue;
    for (const dep of new Set(atom.deps.map(rootOf))) if (atomNames.has(dep) && dep !== atom.name) edges.push([`a:${dep}`, `a:${atom.name}`]);
  }
  const components = new Map<string, { keys: string[]; deps: Set<string> }>();
  for (const component of graph.components) {
    const entry = components.get(component.name) ?? { keys: [], deps: new Set<string>() };
    entry.keys.push(component.instanceKey);
    for (const dep of component.deps) entry.deps.add(rootOf(dep));
    components.set(component.name, entry);
  }
  for (const [name, entry] of components) {
    nodes.push({ id: `c:${name}`, label: name, column: 2, kind: "component", count: entry.keys.length, target: entry.keys[0]! });
    for (const dep of entry.deps) if (atomNames.has(dep)) edges.push([`a:${dep}`, `c:${name}`]);
  }
  for (const effect of graph.effects) {
    nodes.push({ id: `e:${effect.effectKey}`, label: effectLabel(effect), column: 3, kind: "effect", target: effect.effectKey });
    for (const dep of new Set(effect.deps.map(rootOf))) if (atomNames.has(dep)) edges.push([`a:${dep}`, `e:${effect.effectKey}`]);
  }
  if (nodes.length === 0) return emptyState({ icon: "graph", title: "Nothing reactive yet", body: "Atoms, derived atoms, components, and effects appear here once the program renders." });

  const columns = [0, 1, 2, 3].map((c) => nodes.filter((n) => n.column === c));
  const used = columns.map((c, i) => (c.length > 0 ? i : -1)).filter((i) => i >= 0);
  const width = Math.max(560, ctx.width() - 24);
  const colWidth = width / used.length;
  const ROW = 34;
  const nodeWidth = Math.min(200, colWidth - 40);
  const position = new Map<string, { x: number; y: number }>();
  used.forEach((col, i) => {
    columns[col]!.forEach((node, row) => position.set(node.id, { x: i * colWidth + 12, y: 38 + row * ROW }));
  });
  const height = 38 + Math.max(...used.map((c) => columns[c]!.length)) * ROW + 12;
  const hovered = ui.graphHover;
  const connected = new Set<string>();
  if (hovered) {
    connected.add(hovered);
    // Walk both directions so a hovered atom lights up everything it feeds.
    const forward = (id: string, guard = 0): void => { for (const [a, b] of edges) if (a === id && !connected.has(b) && guard < 50) { connected.add(b); forward(b, guard + 1); } };
    const backward = (id: string, guard = 0): void => { for (const [a, b] of edges) if (b === id && !connected.has(a) && guard < 50) { connected.add(a); backward(a, guard + 1); } };
    forward(hovered);
    backward(hovered);
  }
  const headings = ["Atoms", "Derived", "Components", "Effects"];
  const setHover = (id: string | null): void => {
    ui.graphHover = id;
    ctx.refresh();
  };
  return h("div", { class: "dt-scroll" },
    h("div", { class: "rg", style: { width: `${width}px`, height: `${height}px` }, "data-dt": "reactivity-graph" },
      ...used.map((col, i) => h("div", { key: `h${col}`, class: "rg-heading", style: { left: `${i * colWidth + 12}px` } }, headings[col], h("span", { class: "t4" }, ` ${columns[col]!.length}`))),
      h("svg", { class: "rg-edges", width, height, viewBox: `0 0 ${width} ${height}` },
        ...edges.map(([a, b], i) => {
          const p1 = position.get(a);
          const p2 = position.get(b);
          if (!p1 || !p2) return null;
          const x1 = p1.x + nodeWidth;
          const y1 = p1.y + 13;
          const x2 = p2.x;
          const y2 = p2.y + 13;
          const mid = (x1 + x2) / 2;
          const lit = hovered !== null && connected.has(a) && connected.has(b);
          return h("path", {
            key: `${a}>${b}:${i}`,
            d: `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
            class: ["rg-edge", lit ? "is-lit" : "", hovered !== null && !lit ? "is-dim" : ""],
          });
        })),
      ...nodes.map((node) => {
        const p = position.get(node.id)!;
        const dim = hovered !== null && !connected.has(node.id);
        return h("button", {
          key: node.id,
          type: "button",
          class: ["rg-node", `is-${node.kind}`, dim ? "is-dim" : "", hovered === node.id ? "is-hover" : ""],
          style: { left: `${p.x}px`, top: `${p.y}px`, width: `${nodeWidth}px` },
          onMouseEnter: () => setHover(node.id),
          onMouseLeave: () => setHover(null),
          onClick: () => {
            if (node.kind === "atom" || node.kind === "derived") { ui.stateSelected = node.target; ui.stateView = "tree"; ctx.refresh(); }
            else if (node.kind === "component") ctx.selectInstance(node.target);
            else { ui.selectedEffect = node.target; ctx.selectTab("effects"); }
          },
          "data-tip": node.kind === "component" ? `${node.count} instance${node.count === 1 ? "" : "s"} — click to inspect` : undefined,
        },
          icon(node.kind === "component" ? "puzzle" : node.kind === "effect" ? "effects" : node.kind === "derived" ? "refresh" : "state", { size: 12 }),
          h("span", { class: "ellipsis" }, node.label),
          node.count && node.count > 1 ? h("span", { class: "badge" }, `×${node.count}`) : null);
      })));
}

/* -------------------------------------------------------------------------- */

function importDialog(ctx: ViewContext): void {
  const { app } = ctx;
  if (!can(app, "hydrateState")) return;
  let draft = JSON.stringify(ctx.model.state, null, 2);
  let error: string | null = null;
  const parse = (): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(draft) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) { error = "Must be a JSON object of atom names."; return null; }
      error = null;
      return value as Record<string, unknown>;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return null;
    }
  };
  ctx.openDialog({
    title: "Import state",
    icon: "upload",
    width: 640,
    body: () => h("div", { class: "stack" },
      h("div", { class: "hint" }, "Paste an exported state (or edit this one). It is hydrated the way SSR restores state: every atom is replaced and the app re-renders."),
      textarea({ value: draft, rows: 14, mono: true, invalid: error !== null, label: "State JSON", testid: "state-import", onInput: (v) => { draft = v; const had = error; parse(); if ((had === null) !== (error === null)) ctx.refresh(); } }),
      error ? note("error", error) : null),
    actions: () => [
      button({ label: "Cancel", onClick: () => ctx.closeDialog() }),
      button({ label: "Hydrate app", variant: "primary", icon: "upload", disabled: error !== null, onClick: () => {
        const value = parse();
        if (!value) { ctx.refresh(); return; }
        app.hydrateState(value);
        ctx.closeDialog();
        ctx.toast("State imported", "good");
      } }),
    ],
  });
}

function render(ctx: ViewContext): Child {
  const { app, ui, model } = ctx;
  if (!app && !ctx.imported) return noApp(ctx, "State", "state");
  const reservedCount = [...atomMeta(ctx).values()].filter((m) => m.reserved).length;
  const view = ui.stateView;
  let body: Child;
  switch (view) {
    case "diff": body = diffView(ctx); break;
    case "log": body = logView(ctx); break;
    case "graph": body = graphView(ctx); break;
    default: body = treeView(ctx);
  }
  return h("div", { class: "st", "data-dt": "state" },
    viewbar(
      segmented([
        { value: "tree", label: "Tree", icon: "tree" },
        { value: "diff", label: "Diff", icon: "diff", count: model.history.length > 1 ? model.history.length : null },
        { value: "log", label: "Changes", icon: "history", count: model.totals.stateFlushes || null },
        { value: "graph", label: "Graph", icon: "graph" },
      ], view, (value) => { ui.stateView = value; ctx.refresh(); }, { label: "State view" }),
      view === "tree" ? searchField({ value: ui.stateFilter, placeholder: "Filter atoms and values…", onInput: (v) => { ui.stateFilter = v; ctx.refresh(); }, testid: "state-filter" }) : null,
      spacer(),
      view === "tree" || view === "graph" ? filterChip({ label: "Activity", on: ui.stateSort === "activity", tip: "Sort by how often each atom changes", onToggle: () => { ui.stateSort = ui.stateSort === "activity" ? "name" : "activity"; ctx.refresh(); } }) : null,
      reservedCount > 0 ? filterChip({ label: "Runtime", count: reservedCount, on: ui.stateShowReserved, tip: "Show runtime-owned atoms (route, stores, forms)", onToggle: () => { ui.stateShowReserved = !ui.stateShowReserved; ctx.refresh(); } }) : null,
      vsep(),
      iconButton({ icon: "copy", label: "Copy state as JSON", onClick: () => ctx.copy(JSON.stringify(model.state, null, 2), "the state") }),
      iconButton({ icon: "download", label: "Export state", onClick: () => downloadText("aktion-state.json", JSON.stringify(model.state, null, 2)) }),
      can(app, "hydrateState") ? iconButton({ icon: "upload", label: "Import state", onClick: () => importDialog(ctx), testid: "state-import-open" }) : null,
      can(app, "resetState") ? iconButton({ icon: "undo", label: "Reset every atom to its declared value", danger: true, onClick: () => {
        const snapshot = structuredCloneSafe(model.state);
        app.resetState();
        ctx.toast("State reset to declared defaults", "warn", { action: can(app, "hydrateState") ? { label: "Undo", run: () => app.hydrateState(snapshot) } : undefined });
      } }) : null),
    view === "tree" ? timeTravelBar(ctx) : null,
    body);
}

export const stateView: ViewDefinition = {
  id: "state",
  label: "State",
  icon: "state",
  group: "inspect",
  hint: "Reactive state, time travel, diffs, the reactivity graph",
  keywords: "atoms reactive edit time travel snapshot diff history graph dependencies",
  badge: (ctx) => (ctx.ui.timeTravel !== null ? { value: "⏱", tone: "accent" } : null),
  render,
  commands: (ctx) => [
    { id: "live", label: "Return to live state", icon: "live", run: () => travelTo(ctx, null, false) },
    { id: "graph", label: "Show the reactivity graph", icon: "graph", run: () => { ctx.ui.stateView = "graph"; ctx.selectTab("state"); } },
    { id: "diff", label: "Diff state snapshots", icon: "diff", run: () => { ctx.ui.stateView = "diff"; ctx.selectTab("state"); } },
    ...(can(ctx.app, "resetState") ? [{ id: "reset", label: "Reset all state to declared defaults", icon: "undo" as const, run: () => { ctx.app?.resetState?.(); ctx.toast("State reset"); } }] : []),
  ],
  css: /* css */ `
.st { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.st-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.st-main > .note { margin: 8px 10px 0; }
.st-travel { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--dt-border); background: var(--dt-bg-elev); }
.st-travel.is-travelling { background: linear-gradient(90deg, var(--dt-accent-soft), transparent 60%), var(--dt-bg-elev); }
.st-ticks { position: relative; flex: 1 1 auto; min-width: 120px; height: 22px; display: flex; align-items: center; }
.st-range { width: 100%; margin: 0; accent-color: var(--dt-accent); position: relative; z-index: 1; background: transparent; }
.st-tickmarks { position: absolute; left: 8px; right: 8px; top: 50%; height: 0; pointer-events: none; }
.st-tick { position: absolute; top: 5px; width: 2px; height: 5px; margin-left: -1px; border-radius: 1px; background: var(--dt-text-4); }
.st-tick.is-forced { background: var(--dt-amber); }
.st-tick.is-on { background: var(--dt-accent); height: 7px; }
.st-travel-label { font-size: var(--dt-fs-sm); color: var(--dt-text-2); white-space: nowrap; font-family: var(--dt-mono); }
.st-deco { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; }
.st-heat { width: 42px; height: 4px; border-radius: 2px; background: var(--dt-bg-active); overflow: hidden; display: inline-block; }
.st-heat > span { display: block; height: 100%; background: linear-gradient(90deg, var(--dt-purple), var(--dt-pink)); border-radius: 2px; }
.st-count { min-width: 18px; text-align: right; font-size: var(--dt-fs-xs); color: var(--dt-text-3); font-variant-numeric: tabular-nums; }
.st-break { color: var(--dt-text-4); opacity: 0; transition: opacity var(--dt-fast); }
.row:hover .st-break, .row.is-selected .st-break, .st-break:focus-visible { opacity: 1; }
.st-break.is-on { color: var(--dt-red); background: var(--dt-red-soft); opacity: 1; }
.st-side { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; border-left: 0; }
.st-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
.st-facts > div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); }
.st-log { display: flex; flex-direction: column; gap: 2px; }
.st-log-row { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 8px; border-radius: 6px; font-size: var(--dt-fs-sm); }
.st-log-row:nth-child(odd) { background: var(--dt-bg-elev); }
.st-log-row .ic { color: var(--dt-text-4); flex: none; }
.st-log-time { flex: none; width: 64px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); font-variant-numeric: tabular-nums; }
.st-before { color: var(--dt-red); text-decoration: line-through; text-decoration-color: rgba(255, 107, 118, 0.4); max-width: 40%; }
.st-after { color: var(--dt-green); max-width: 45%; }
.st-log-atoms { padding: 4px 0; }
.st-log-atoms .row { width: calc(100% - 8px); border: 0; background: none; text-align: left; }
.st-diff { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.st-diff-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-changes { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r); overflow: hidden; }
.st-change { display: flex; align-items: center; gap: 10px; padding: 5px 10px; border-bottom: 1px solid var(--dt-border); min-width: 0; font-size: var(--dt-fs-sm); }
.st-change:last-child { border-bottom: 0; }
.st-change .ic { color: var(--dt-text-4); flex: none; }
.st-change-mark { width: 14px; text-align: center; font-weight: 800; font-family: var(--dt-mono); flex: none; }
.st-change.is-added { background: var(--dt-green-soft); }
.st-change.is-added .st-change-mark { color: var(--dt-green); }
.st-change.is-removed { background: var(--dt-red-soft); }
.st-change.is-removed .st-change-mark { color: var(--dt-red); }
.st-change.is-changed .st-change-mark { color: var(--dt-amber); }
.st-change-path { color: var(--dt-syn-prop); flex: none; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-bookmarks { margin-top: 6px; }
.st-bm-list { display: flex; flex-direction: column; gap: 6px; }
.st-bm { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); color: var(--dt-text-2); }
.rg { position: relative; margin: 12px; }
.rg-heading { position: absolute; top: 4px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-3); }
.rg-edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.rg-edge { fill: none; stroke: var(--dt-border-strong); stroke-width: 1.4; transition: stroke var(--dt-fast), opacity var(--dt-fast); }
.rg-edge.is-lit { stroke: var(--dt-accent); stroke-width: 2; }
.rg-edge.is-dim { opacity: 0.25; }
.rg-node {
  position: absolute; height: 26px; display: flex; align-items: center; gap: 6px; padding: 0 9px;
  border-radius: 8px; border: 1px solid var(--dt-border-strong); background: var(--dt-bg-elev); color: var(--dt-text);
  font-size: var(--dt-fs-sm); font-weight: 550; text-align: left;
  transition: opacity var(--dt-fast), border-color var(--dt-fast), transform var(--dt-fast);
}
.rg-node .ic { flex: none; }
.rg-node.is-atom .ic { color: var(--dt-purple); }
.rg-node.is-atom { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.rg-node.is-derived .ic { color: var(--dt-blue); }
.rg-node.is-derived { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.rg-node.is-component .ic { color: var(--dt-accent-text); }
.rg-node.is-effect .ic { color: var(--dt-green); }
.rg-node:hover, .rg-node.is-hover { border-color: var(--dt-accent); transform: translateX(2px); }
.rg-node.is-dim { opacity: 0.32; }
.rg-node .badge { margin-left: auto; }
`,
};
