/**
 * `<aktion-devtools>` — the in-page DevTools panel.
 *
 * A self-contained, framework-agnostic debugger that attaches to the global
 * hook (see `hook.ts`) and renders three tabs over the live runtime:
 *
 *   - **State** — a live tree of every reactive `$state` atom, with inline
 *     editing (writes flow back through the real reactive pipeline) and a
 *     flash on every change.
 *   - **Profiler** — a per-commit strip + flamegraph of which components
 *     (re)rendered, why, and how long their bodies took, plus a ranked
 *     "most expensive components" table.
 *   - **Effects** — a chronological timeline of every effect's
 *     mount/run/cleanup/unmount, attributed to the trigger that fired it,
 *     with per-effect lanes.
 *
 * The panel lives in its own shadow root with its own styles, so it is fully
 * isolated from the page and from the `<aktion-app>` it inspects. It is built
 * with plain DOM (no dependency on Aktion's own renderer) so it can debug a
 * broken program without sharing its fate.
 */

import {
  installDevtoolsHook,
  getDevtoolsHook,
  type AktionDevtoolsHook,
  type DevtoolsAppRecord,
  type DevtoolsEvent,
} from "./hook.js";
import type {
  CommitRecord,
  ComponentRenderRecord,
  EffectEvent,
  EffectPhase,
  StateEvent,
} from "./protocol.js";
import { devtoolsStyles } from "./styles.js";

const DEVTOOLS_UI_VERSION = "0.5";

/** Atom names the runtime owns — shown but never editable. */
const RESERVED_ATOMS = new Set(["route"]);

/** Caps so a long-running session can't grow the panel's model unbounded. */
const MAX_COMMITS = 200;
const MAX_EFFECT_EVENTS = 400;
const MAX_LOG_ROWS = 250;
/** A state row keeps its "just changed" flash for this long. */
const FLASH_MS = 1100;

type TabId = "state" | "profiler" | "effects";

/** Per-app derived model the panel maintains from the event stream. */
interface AppModel {
  commits: CommitRecord[];
  effects: EffectEvent[];
  state: Record<string, unknown>;
  /** Atom (root) → timestamp of last change, for flash highlighting. */
  changed: Map<string, number>;
  /** Timestamp of the first observed event (timeline zero). */
  firstTime: number | null;
}

function emptyModel(): AppModel {
  return { commits: [], effects: [], state: {}, changed: new Map(), firstTime: null };
}

/* -------------------------------------------------------------------------- */
/*  Tiny DOM builder                                                           */
/* -------------------------------------------------------------------------- */

type Attrs = Record<string, unknown>;
type Child = Node | string | null | undefined | false;

function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k === "style") node.setAttribute("style", String(v));
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/* -------------------------------------------------------------------------- */
/*  Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

function valueType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function isExpandable(v: unknown): boolean {
  const t = valueType(v);
  return (t === "object" || t === "array") && childEntries(v).length > 0;
}

function childEntries(v: unknown): Array<[string, unknown]> {
  if (Array.isArray(v)) return v.map((item, i) => [String(i), item] as [string, unknown]);
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>);
  return [];
}

function previewValue(v: unknown): string {
  switch (valueType(v)) {
    case "string": return JSON.stringify(v);
    case "number":
    case "boolean": return String(v);
    case "null": return "null";
    case "undefined": return "undefined";
    case "function": return "ƒ ()";
    case "array": return `Array(${(v as unknown[]).length})`;
    case "object": {
      const keys = Object.keys(v as object);
      const head = keys.slice(0, 3).join(", ");
      return `{ ${head}${keys.length > 3 ? ", …" : ""} }`;
    }
    default: return String(v);
  }
}

/** Parse an inline edit: JSON first (`42`, `true`, `"x"`, `null`), else a bare string. */
function parseEdit(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

function fmtMs(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 100) return `${n.toFixed(0)} ms`;
  if (n >= 10) return `${n.toFixed(1)} ms`;
  return `${n.toFixed(2)} ms`;
}

function fmtRel(ms: number): string {
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms.toFixed(0)} ms`;
}

const PHASE_CHIP: Record<string, string> = {
  mount: "green",
  update: "blue",
  memo: "grey",
  run: "blue",
  cleanup: "purple",
  unmount: "grey",
  error: "red",
};

/* -------------------------------------------------------------------------- */
/*  The element                                                                */
/* -------------------------------------------------------------------------- */

export class AktionDevtoolsElement extends HTMLElement {
  static readonly tagName = "aktion-devtools";

  private hook: AktionDevtoolsHook | null = null;
  private unsubEvents: (() => void) | null = null;
  private unsubApps: (() => void) | null = null;

  private readonly models = new Map<string, AppModel>();
  private selectedAppId: string | null = null;
  private tab: TabId = "state";
  private paused = false;

  // State tab
  private stateFilter = "";
  private expanded = new Set<string>();
  private editingPath: string | null = null;

  // Profiler tab
  private selectedCommitId: number | null = null;
  private flashOnCommit = false;

  // Effects tab
  private phaseFilter: Set<EffectPhase> = new Set(["mount", "run", "cleanup", "unmount", "error"]);

  // chrome
  private collapsed = false;
  private renderScheduled = false;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  // skeleton refs
  private root!: ShadowRoot;
  private panelEl!: HTMLElement;
  private controlsEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private bodyEl!: HTMLElement;

  connectedCallback(): void {
    if (!this.root) this.buildSkeleton();
    this.hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);

    // Adopt any apps that registered before the panel opened, seed their state
    // immediately, and backfill the model from the hook's event buffer so the
    // timeline isn't empty on open.
    for (const app of this.hook.apps.values()) this.adopt(app);
    if (!this.selectedAppId && this.hook.apps.size > 0) {
      this.selectedAppId = [...this.hook.apps.keys()][0]!;
    }
    for (const event of this.hook.buffer) this.ingest(event, /* fromBuffer */ true);

    this.unsubEvents = this.hook.subscribe((event) => this.onEvent(event));
    this.unsubApps = this.hook.subscribeApps((action, app) => this.onApp(action, app));

    // Late attach: ask every `<aktion-app>` already on the page to register
    // with the (now-installed) hook. Apps that mounted before DevTools opened
    // would otherwise never appear.
    this.discoverApps();
    this.scheduleRender();
  }

  disconnectedCallback(): void {
    this.unsubEvents?.();
    this.unsubApps?.();
    this.unsubEvents = null;
    this.unsubApps = null;
    if (this.flashTimer) clearTimeout(this.flashTimer);
  }

  /* ---- public controller surface ---- */

  open(): void { this.hidden = false; }
  close(): void { this.hidden = true; }
  toggle(): void { this.hidden = !this.hidden; }
  selectApp(id: string): void {
    this.selectedAppId = id;
    this.selectedCommitId = null;
    this.scheduleRender();
  }

  /** Test/inspection hook: the derived model for an app (or the selected one). */
  getModel(appId?: string): AppModel | null {
    const id = appId ?? this.selectedAppId;
    return id ? this.models.get(id) ?? null : null;
  }

  /* ---- event ingestion ---- */

  private ensureModel(appId: string): AppModel {
    let m = this.models.get(appId);
    if (!m) { m = emptyModel(); this.models.set(appId, m); }
    return m;
  }

  /** Adopt an app: ensure a model and seed its current state snapshot. */
  private adopt(app: DevtoolsAppRecord): AppModel {
    const m = this.ensureModel(app.id);
    try { m.state = app.getState(); } catch { /* app mid-teardown */ }
    return m;
  }

  /** Ask every `<aktion-app>` on the page to register with the hook. */
  private discoverApps(): void {
    if (typeof document === "undefined") return;
    document.querySelectorAll("aktion-app").forEach((el) => {
      try { (el as unknown as { connectDevtools?: () => void }).connectDevtools?.(); }
      catch { /* not an Aktion element, or pre-DevTools build */ }
    });
  }

  private onApp(action: "register" | "unregister", app: DevtoolsAppRecord): void {
    if (action === "register") {
      this.adopt(app);
      if (!this.selectedAppId) this.selectedAppId = app.id;
    } else if (this.selectedAppId === app.id) {
      // Keep the model around (history is still useful) but re-point selection.
      const next = [...this.hook!.apps.keys()].find((id) => id !== app.id) ?? null;
      this.selectedAppId = next;
    }
    this.scheduleRender();
  }

  private onEvent(event: DevtoolsEvent): void {
    if (this.paused) return;
    this.ingest(event, false);
    // "Flash on commit" — briefly outline the inspected element so you can see
    // which app on the page just re-rendered.
    if (event.kind === "commit" && this.flashOnCommit && event.appId === this.selectedAppId) {
      this.flashApp(event.appId);
    }
    this.scheduleRender();
  }

  private ingest(event: DevtoolsEvent, fromBuffer: boolean): void {
    const model = this.ensureModel(event.appId);
    const t = eventTime(event);
    if (model.firstTime === null || t < model.firstTime) model.firstTime = t;
    switch (event.kind) {
      case "commit": {
        model.commits.push(event);
        if (model.commits.length > MAX_COMMITS) model.commits.shift();
        // Auto-follow the latest commit unless the user pinned one.
        if (!fromBuffer || this.selectedCommitId === null) this.selectedCommitId = event.commitId;
        break;
      }
      case "state": {
        model.state = event.snapshot;
        for (const p of event.changedPaths) {
          model.changed.set(rootOf(p), event.time);
        }
        break;
      }
      case "effect": {
        model.effects.push(event);
        if (model.effects.length > MAX_EFFECT_EVENTS) model.effects.shift();
        break;
      }
    }
  }

  /* ---- render scheduling ---- */

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      try { this.render(); }
      catch (err) { /* eslint-disable-next-line no-console */ console.error("[aktion-devtools] render failed", err); }
    });
  }

  private currentApp(): DevtoolsAppRecord | null {
    if (!this.selectedAppId || !this.hook) return null;
    return this.hook.apps.get(this.selectedAppId) ?? null;
  }

  private render(): void {
    if (this.hidden) return;
    // Don't tear down the tree out from under an open inline editor.
    if (this.tab === "state" && this.editingPath) {
      this.renderControls();
      this.renderTabs();
      return;
    }
    this.renderControls();
    this.renderTabs();
    this.renderBody();
  }

  /* ---- skeleton ---- */

  private buildSkeleton(): void {
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = devtoolsStyles;

    this.controlsEl = h("div", { class: "controls", style: "display:flex;gap:6px;align-items:center;" });
    const header = h(
      "div",
      { class: "header" },
      h("div", { class: "brand" },
        h("span", { class: "bolt" }, "⚡"),
        h("span", {}, "Aktion DevTools"),
        h("span", { class: "ver" }, `v${DEVTOOLS_UI_VERSION}`),
      ),
      h("div", { class: "spacer" }),
      this.controlsEl,
    );
    this.makeDraggable(header);

    this.tabsEl = h("div", { class: "tabs" });
    this.bodyEl = h("div", { class: "panel-body" });
    const grip = h("div", { class: "resize", title: "Drag to resize" });
    this.makeResizable(grip);

    this.panelEl = h("div", { class: "panel" }, header, this.tabsEl, this.bodyEl, grip);
    this.root.append(style, this.panelEl);

    // Default placement: lower-right, computed once so drag/resize can take over.
    const w = 480, hgt = 560;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    this.style.left = `${Math.max(8, vw - w - 16)}px`;
    this.style.top = `${Math.max(8, vh - hgt - 16)}px`;
  }

  private renderControls(): void {
    const apps = this.hook ? [...this.hook.apps.values()] : [];
    const select = h("select", {
      class: "app-select",
      title: "Inspected app",
      onchange: (e: Event) => this.selectApp((e.target as HTMLSelectElement).value),
    }) as HTMLSelectElement;
    if (apps.length === 0) {
      select.appendChild(h("option", {}, "no app detected"));
      select.disabled = true;
    } else {
      for (const app of apps) {
        const opt = h("option", { value: app.id }, app.label) as HTMLOptionElement;
        if (app.id === this.selectedAppId) opt.selected = true;
        select.appendChild(opt);
      }
    }

    const rec = h(
      "button",
      {
        class: `icon-btn ${this.paused ? "" : "is-on"}`,
        title: this.paused ? "Paused — click to resume recording" : "Recording — click to pause",
        onclick: () => { this.paused = !this.paused; this.scheduleRender(); },
      },
      h("span", { class: `rec-dot ${this.paused ? "is-paused" : ""}` }),
      this.paused ? "Paused" : "Rec",
    );

    const collapse = h("button", {
      class: "icon-btn",
      title: this.collapsed ? "Expand" : "Collapse",
      onclick: () => { this.collapsed = !this.collapsed; this.panelEl.classList.toggle("is-collapsed", this.collapsed); },
    }, this.collapsed ? "▢" : "—");

    const close = h("button", { class: "icon-btn", title: "Close", onclick: () => this.close() }, "✕");

    this.controlsEl.replaceChildren(select, rec, collapse, close);
  }

  private renderTabs(): void {
    const model = this.getModel();
    const defs: Array<[TabId, string, number]> = [
      ["state", "State", model ? Object.keys(model.state).length : 0],
      ["profiler", "Profiler", model ? model.commits.length : 0],
      ["effects", "Effects", model ? model.effects.length : 0],
    ];
    this.tabsEl.replaceChildren(
      ...defs.map(([id, label, count]) =>
        h(
          "button",
          {
            class: `tab ${this.tab === id ? "is-active" : ""}`,
            onclick: () => { this.tab = id; this.scheduleRender(); },
          },
          label,
          h("span", { class: "count" }, String(count)),
        ),
      ),
    );
  }

  private renderBody(): void {
    const app = this.currentApp();
    const model = this.getModel();
    if (!app || !model) {
      this.bodyEl.replaceChildren(
        h("div", { class: "empty" },
          h("p", {}, "No Aktion app detected on this page."),
          h("p", { class: "faint" }, "Mount an ", h("code", {}, "<aktion-app>"), " and it will appear here."),
        ),
      );
      return;
    }
    if (this.tab === "state") this.renderStateTab(app, model);
    else if (this.tab === "profiler") this.renderProfilerTab(model);
    else this.renderEffectsTab(model);
  }

  /* ---------------------------------------------------------------------- */
  /*  State inspector                                                        */
  /* ---------------------------------------------------------------------- */

  private renderStateTab(app: DevtoolsAppRecord, model: AppModel): void {
    const toolbar = h(
      "div",
      { class: "toolbar" },
      h("input", {
        class: "search",
        placeholder: "Filter atoms…",
        value: this.stateFilter,
        oninput: (e: Event) => {
          this.stateFilter = (e.target as HTMLInputElement).value;
          this.renderTreeOnly(app, model);
        },
      }),
      h("span", { class: "muted" }, `${Object.keys(model.state).length} atoms`),
    );

    const tree = h("div", { class: "tree" });
    this.fillTree(tree, app, model);
    this.bodyEl.replaceChildren(toolbar, tree);
  }

  /** Re-render only the tree (used by the filter box to keep its focus). */
  private renderTreeOnly(app: DevtoolsAppRecord, model: AppModel): void {
    const tree = this.bodyEl.querySelector(".tree");
    if (!tree) return;
    tree.replaceChildren();
    this.fillTree(tree as HTMLElement, app, model);
  }

  private fillTree(tree: HTMLElement, app: DevtoolsAppRecord, model: AppModel): void {
    const filter = this.stateFilter.trim().toLowerCase();
    const names = Object.keys(model.state).sort((a, b) => a.localeCompare(b));
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let shown = 0;
    for (const name of names) {
      if (filter && !name.toLowerCase().includes(filter)) continue;
      shown += 1;
      this.appendRow(tree, app, model, name, name, model.state[name], 0, now);
    }
    if (shown === 0) {
      tree.appendChild(h("div", { class: "empty" }, filter ? "No atoms match the filter." : "No reactive state yet."));
    }
  }

  private appendRow(
    container: HTMLElement,
    app: DevtoolsAppRecord,
    model: AppModel,
    path: string,
    key: string,
    value: unknown,
    depth: number,
    now: number,
  ): void {
    const type = valueType(value);
    const expandable = isExpandable(value);
    const isOpen = this.expanded.has(path);
    const reserved = depth === 0 && RESERVED_ATOMS.has(key);
    const changedAt = model.changed.get(rootOf(path));
    const justChanged = changedAt != null && now - changedAt < FLASH_MS;

    const twist = h("span", {
      class: `twist ${expandable ? "" : "is-leaf"}`,
      onclick: expandable
        ? () => {
            if (this.expanded.has(path)) this.expanded.delete(path);
            else this.expanded.add(path);
            this.renderTreeOnly(app, model);
          }
        : undefined,
    }, expandable ? (isOpen ? "▾" : "▸") : "•");

    const valueSpan = h("span", { class: `v t-${type}` }, expandable ? previewValue(value) : previewValue(value));
    const editable = !reserved && !expandable && type !== "function";
    if (editable) {
      valueSpan.title = "Click to edit";
      valueSpan.addEventListener("click", () => this.beginEdit(app, path, value, valueSpan));
    }

    const row = h(
      "div",
      { class: `row ${justChanged ? "is-changed" : ""}`, style: `padding-left:${8 + depth * 14}px` },
      twist,
      h("span", { class: "k" }, key),
      h("span", { class: "sep" }, ": "),
      valueSpan,
      reserved ? h("span", { class: "tag" }, "reserved") : null,
    );
    container.appendChild(row);

    if (expandable && isOpen) {
      for (const [childKey, childValue] of childEntries(value)) {
        this.appendRow(container, app, model, `${path}.${childKey}`, childKey, childValue, depth + 1, now);
      }
    }
  }

  private beginEdit(
    app: DevtoolsAppRecord,
    path: string,
    value: unknown,
    valueSpan: HTMLElement,
  ): void {
    if (this.editingPath) return;
    this.editingPath = path;
    const initial = valueType(value) === "string" ? String(value) : previewValue(value);
    const input = h("input", { class: "edit-input", value: initial }) as HTMLInputElement;

    const commit = (apply: boolean) => {
      if (this.editingPath !== path) return;
      this.editingPath = null;
      if (apply) {
        try { app.setState(path, parseEdit(input.value)); }
        catch (err) { /* eslint-disable-next-line no-console */ console.error("[aktion-devtools] edit failed", err); }
      }
      // Re-render the whole tab now that editing is done.
      this.scheduleRender();
    };

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); commit(true); }
      else if (e.key === "Escape") { e.preventDefault(); commit(false); }
    });
    input.addEventListener("blur", () => commit(true));

    valueSpan.replaceWith(input);
    input.focus();
    input.select();
  }

  /* ---------------------------------------------------------------------- */
  /*  Render profiler                                                        */
  /* ---------------------------------------------------------------------- */

  private renderProfilerTab(model: AppModel): void {
    const app = this.currentApp();
    const last = model.commits[model.commits.length - 1];
    const toolbar = h(
      "div",
      { class: "toolbar" },
      h("span", { class: "muted" },
        `${model.commits.length} commit${model.commits.length === 1 ? "" : "s"}`,
        last ? ` · last ${fmtMs(last.duration)}` : "",
      ),
      h("div", { class: "grow" }),
      h("button", {
        class: `filter-chip ${this.flashOnCommit ? "is-on" : ""}`,
        title: "Outline the app element on every commit",
        onclick: () => { this.flashOnCommit = !this.flashOnCommit; this.scheduleRender(); },
      }, "Flash on commit"),
      h("button", {
        class: "icon-btn",
        title: "Clear commits",
        onclick: () => { model.commits.length = 0; this.selectedCommitId = null; this.scheduleRender(); },
      }, "Clear"),
    );

    if (model.commits.length === 0) {
      this.bodyEl.replaceChildren(toolbar, h("div", { class: "empty" },
        h("p", {}, "No commits recorded yet."),
        h("p", { class: "faint" }, "Interact with the app to capture renders."),
      ));
      return;
    }

    // Commit strip
    const maxDur = Math.max(...model.commits.map((c) => c.duration), 0.001);
    const strip = h("div", { class: "commit-strip" });
    for (const c of model.commits) {
      const height = Math.max(3, Math.round((c.duration / maxDur) * 52));
      strip.appendChild(h("div", {
        class: `commit-bar ${c.initial ? "is-initial" : c.fullRender ? "is-full" : ""} ${c.commitId === this.selectedCommitId ? "is-selected" : ""}`,
        style: `height:${height}px`,
        title: `#${c.commitId} · ${fmtMs(c.duration)} · ${c.rendered} rendered / ${c.memoized} memoized`,
        onclick: () => { this.selectedCommitId = c.commitId; this.scheduleRender(); },
      }));
    }

    const selected = model.commits.find((c) => c.commitId === this.selectedCommitId) ?? last!;
    const detail = this.renderCommitDetail(selected);
    const ranked = this.renderRankedComponents(model);

    this.bodyEl.replaceChildren(toolbar, strip, detail, ranked);
    void app;
  }

  private renderCommitDetail(commit: CommitRecord): HTMLElement {
    const trigger = commit.initial
      ? "initial mount"
      : commit.changedPaths.length > 0
        ? commit.changedPaths.join(", ")
        : "forced (async / effect / timer)";

    const meta = h(
      "div",
      { class: "kv" },
      h("span", {}, "commit ", h("b", {}, `#${commit.commitId}`)),
      h("span", {}, "duration ", h("b", { class: "mono" }, fmtMs(commit.duration))),
      h("span", {}, "rendered ", h("b", {}, String(commit.rendered))),
      h("span", {}, "memoized ", h("b", {}, String(commit.memoized))),
      h("span", {}, commit.fullRender
        ? h("span", { class: "chip amber" }, "full render")
        : h("span", { class: "chip blue" }, "incremental")),
    );
    const triggerLine = h("div", { class: "kv" },
      h("span", {}, "trigger ", h("b", { class: "mono" }, trigger)));

    const flame = h("div", {});
    if (commit.components.length === 0) {
      flame.appendChild(h("div", { class: "faint", style: "font-size:11px" }, "No component instances in this commit (primitive root)."));
    } else {
      const maxSelf = Math.max(...commit.components.map((c) => c.selfTime), 0.001);
      const minDepth = Math.min(...commit.components.map((c) => c.depth));
      for (const c of commit.components) {
        flame.appendChild(this.renderFlameRow(c, maxSelf, minDepth));
      }
    }

    return h(
      "div",
      { class: "section" },
      h("p", { class: "section-title" }, "Commit detail"),
      meta,
      triggerLine,
      flame,
    );
  }

  private renderFlameRow(c: ComponentRenderRecord, maxSelf: number, minDepth: number): HTMLElement {
    const indent = (c.depth - minDepth) * 12;
    const widthPct = c.phase === "memo" ? 22 : Math.max(6, Math.round((c.selfTime / maxSelf) * 100));
    const label = `${c.kind === "user" ? "" : "▪ "}${c.name}`;
    const bar = h("div", {
      class: `flame-bar p-${c.phase}`,
      style: `width:${widthPct}%`,
      title: `${c.name} — ${c.phase} — ${fmtMs(c.selfTime)}\n${c.reason}${c.deps && c.deps.length ? `\ndeps: ${c.deps.join(", ")}` : ""}`,
    }, label);
    return h(
      "div",
      { class: "flame-row", style: `padding-left:${indent}px` },
      h("div", { class: "flame-bar-wrap" }, bar),
      h("span", { class: "flame-time" }, c.phase === "memo" ? "memo" : fmtMs(c.selfTime)),
    );
  }

  private renderRankedComponents(model: AppModel): HTMLElement {
    interface Agg { name: string; kind: string; renders: number; memo: number; total: number; }
    const aggs = new Map<string, Agg>();
    for (const commit of model.commits) {
      for (const c of commit.components) {
        let a = aggs.get(c.name);
        if (!a) { a = { name: c.name, kind: c.kind, renders: 0, memo: 0, total: 0 }; aggs.set(c.name, a); }
        if (c.phase === "memo") a.memo += 1;
        else { a.renders += 1; a.total += c.selfTime; }
      }
    }
    const rows = [...aggs.values()].sort((a, b) => b.total - a.total);
    const maxTotal = Math.max(...rows.map((r) => r.total), 0.001);

    const table = h("table", { class: "dt-table" },
      h("thead", {}, h("tr", {},
        h("th", {}, "Component"),
        h("th", {}, "Type"),
        h("th", { style: "text-align:right" }, "Renders"),
        h("th", { style: "text-align:right" }, "Memo"),
        h("th", { style: "text-align:right" }, "Total"),
        h("th", { style: "text-align:right" }, "Avg"),
      )),
      h("tbody", {}, ...rows.map((r) =>
        h("tr", {},
          h("td", { class: "name" }, r.name),
          h("td", {}, h("span", { class: `chip ${r.kind === "user" ? "purple" : "grey"}` }, r.kind)),
          h("td", { class: "num" }, String(r.renders)),
          h("td", { class: "num" }, String(r.memo)),
          h("td", { class: "num bar-cell" },
            h("span", { class: "barfill", style: `width:${Math.round((r.total / maxTotal) * 100)}%` }),
            h("span", {}, fmtMs(r.total)),
          ),
          h("td", { class: "num" }, r.renders ? fmtMs(r.total / r.renders) : "—"),
        ),
      )),
    );

    return h("div", { class: "section" },
      h("p", { class: "section-title" }, "Components — ranked by total self time"),
      rows.length ? table : h("div", { class: "faint", style: "font-size:11px" }, "No component renders captured."),
    );
  }

  /* ---------------------------------------------------------------------- */
  /*  Effect timeline                                                        */
  /* ---------------------------------------------------------------------- */

  private renderEffectsTab(model: AppModel): void {
    const phases: EffectPhase[] = ["mount", "run", "cleanup", "unmount", "error"];
    const toolbar = h(
      "div",
      { class: "toolbar" },
      h("div", { class: "filters" }, ...phases.map((p) =>
        h("button", {
          class: `filter-chip ${this.phaseFilter.has(p) ? "is-on" : ""}`,
          onclick: () => {
            if (this.phaseFilter.has(p)) this.phaseFilter.delete(p);
            else this.phaseFilter.add(p);
            this.scheduleRender();
          },
        }, p),
      )),
      h("div", { class: "grow" }),
      h("button", {
        class: "icon-btn",
        title: "Clear effect events",
        onclick: () => { model.effects.length = 0; this.scheduleRender(); },
      }, "Clear"),
    );

    if (model.effects.length === 0) {
      this.bodyEl.replaceChildren(toolbar, h("div", { class: "empty" },
        h("p", {}, "No effects observed yet."),
        h("p", { class: "faint" }, "Effects appear as they mount, run, and clean up."),
      ));
      return;
    }

    this.bodyEl.replaceChildren(toolbar, this.renderEffectLanes(model), this.renderEffectLog(model));
  }

  private renderEffectLanes(model: AppModel): HTMLElement {
    interface Lane { key: string; label: string; triggers: string; runs: number; total: number; lastReason: string; instance: boolean; }
    const lanes = new Map<string, Lane>();
    for (const e of model.effects) {
      let lane = lanes.get(e.effectKey);
      if (!lane) {
        lane = { key: e.effectKey, label: e.label, triggers: e.triggers, runs: 0, total: 0, lastReason: e.reason, instance: e.instanceKey != null };
        lanes.set(e.effectKey, lane);
      }
      if (e.phase === "run") { lane.runs += 1; lane.total += e.duration ?? 0; lane.lastReason = e.reason; }
    }
    const list = [...lanes.values()].sort((a, b) => b.runs - a.runs);
    const wrap = h("div", { class: "section", style: "padding:0" });
    wrap.appendChild(h("p", { class: "section-title", style: "padding:8px 10px 0" }, `Effects (${list.length})`));
    for (const lane of list) {
      wrap.appendChild(h("div", { class: "lane" },
        h("span", { class: "lane-name" }, lane.label),
        lane.instance ? h("span", { class: "chip purple", style: "flex:0 0 auto" }, "instance") : null,
        h("span", { class: "lane-trig" }, lane.triggers),
        h("span", { class: "lane-stat" }, `${lane.runs} run${lane.runs === 1 ? "" : "s"} · ${fmtMs(lane.total)}`),
      ));
    }
    return wrap;
  }

  private renderEffectLog(model: AppModel): HTMLElement {
    const base = model.firstTime ?? 0;
    const filtered = model.effects.filter((e) => this.phaseFilter.has(e.phase));
    const rows = filtered.slice(-MAX_LOG_ROWS).reverse();
    const wrap = h("div", { class: "section", style: "padding:0;border-bottom:none" });
    wrap.appendChild(h("p", { class: "section-title", style: "padding:8px 10px 0" }, "Timeline"));
    if (rows.length === 0) {
      wrap.appendChild(h("div", { class: "faint", style: "font-size:11px;padding:0 10px 10px" }, "No events match the active filters."));
      return wrap;
    }
    for (const e of rows) {
      wrap.appendChild(h("div", { class: "log-row" },
        h("span", { class: "t" }, fmtRel(e.time - base)),
        h("span", { class: "ph" }, h("span", { class: `chip ${PHASE_CHIP[e.phase] ?? "grey"}` }, e.phase)),
        h("span", { class: "lbl" }, e.label),
        h("span", { class: "rsn" },
          e.reason,
          e.phase === "run" && e.duration != null ? ` · ${fmtMs(e.duration)}` : "",
          e.phase === "cleanup" && e.cleanups != null ? ` · ${e.cleanups}×` : "",
          e.error ? ` · ${e.error}` : "",
        ),
      ));
    }
    return wrap;
  }

  /* ---------------------------------------------------------------------- */
  /*  Highlight + drag/resize                                                */
  /* ---------------------------------------------------------------------- */

  private flashApp(appId: string): void {
    const app = this.hook?.apps.get(appId);
    if (!app) return;
    const el = app.element as HTMLElement;
    const prev = el.style.outline;
    el.style.outline = "2px solid rgba(124,156,255,0.9)";
    el.style.outlineOffset = "1px";
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      el.style.outline = prev;
      el.style.outlineOffset = "";
    }, 140);
  }

  private makeDraggable(handle: HTMLElement): void {
    let startX = 0, startY = 0, originLeft = 0, originTop = 0, dragging = false;
    const onDown = (e: MouseEvent) => {
      // Ignore drags that start on an interactive control in the header.
      if ((e.target as HTMLElement).closest("button, select, input")) return;
      dragging = true;
      handle.classList.add("is-dragging");
      startX = e.clientX; startY = e.clientY;
      const rect = this.getBoundingClientRect();
      originLeft = rect.left; originTop = rect.top;
      e.preventDefault();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      this.style.left = `${Math.max(0, originLeft + (e.clientX - startX))}px`;
      this.style.top = `${Math.max(0, originTop + (e.clientY - startY))}px`;
    };
    const onUp = () => {
      dragging = false;
      handle.classList.remove("is-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    handle.addEventListener("mousedown", onDown);
  }

  private makeResizable(grip: HTMLElement): void {
    let startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
    const onDown = (e: MouseEvent) => {
      resizing = true;
      startX = e.clientX; startY = e.clientY;
      const rect = this.panelEl.getBoundingClientRect();
      startW = rect.width; startH = rect.height;
      e.preventDefault();
      e.stopPropagation();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    const onMove = (e: MouseEvent) => {
      if (!resizing) return;
      this.panelEl.style.width = `${Math.max(320, startW + (e.clientX - startX))}px`;
      this.panelEl.style.height = `${Math.max(240, startH + (e.clientY - startY))}px`;
    };
    const onUp = () => {
      resizing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    grip.addEventListener("mousedown", onDown);
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers + public API                                                       */
/* -------------------------------------------------------------------------- */

function eventTime(event: DevtoolsEvent): number {
  if (event.kind === "commit") return (event as CommitRecord).startTime;
  if (event.kind === "state") return (event as StateEvent).time;
  return (event as EffectEvent).time;
}

/** Root atom name of a dotted path (`user.name` → `user`). */
function rootOf(path: string): string {
  const dot = path.indexOf(".");
  return dot < 0 ? path : path.slice(0, dot);
}

/** Register the custom element (idempotent). */
export function defineDevtoolsElement(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(AktionDevtoolsElement.tagName)) {
    customElements.define(AktionDevtoolsElement.tagName, AktionDevtoolsElement);
  }
}

export interface MountDevtoolsOptions {
  /** Where to append the panel (default `document.body`). */
  container?: HTMLElement;
  /** Pre-select an app by id. */
  appId?: string;
  /** Start open (default `true`). */
  open?: boolean;
}

export interface DevtoolsController {
  /** The live panel element. */
  element: AktionDevtoolsElement;
  /** The installed hook (shared across panels). */
  hook: AktionDevtoolsHook;
  open(): void;
  close(): void;
  toggle(): void;
  selectApp(id: string): void;
  /** Remove the panel from the DOM (the hook + event stream stay installed). */
  destroy(): void;
}

/**
 * Install the DevTools hook and mount an in-page panel. Idempotent at the
 * hook level — multiple panels share one event stream — but each call mounts
 * a fresh panel element.
 *
 *   import { mountDevtools } from "aktion/devtools";
 *   mountDevtools();
 */
export function mountDevtools(options: MountDevtoolsOptions = {}): DevtoolsController {
  const hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);
  defineDevtoolsElement();
  const element = document.createElement(AktionDevtoolsElement.tagName) as AktionDevtoolsElement;
  (options.container ?? document.body).appendChild(element);
  if (options.appId) element.selectApp(options.appId);
  if (options.open === false) element.close();
  return {
    element,
    hook,
    open: () => element.open(),
    close: () => element.close(),
    toggle: () => element.toggle(),
    selectApp: (id) => element.selectApp(id),
    destroy: () => element.remove(),
  };
}

/** Whether a DevTools hook is currently installed on the page. */
export function isDevtoolsInstalled(): boolean {
  return getDevtoolsHook() !== undefined;
}
