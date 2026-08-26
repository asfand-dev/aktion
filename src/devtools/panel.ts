/**
 * `<aktion-devtools>` — the in-page DevTools panel.
 *
 * A self-contained, framework-agnostic debugger that attaches to the global
 * hook (see `hook.ts`) and renders fourteen tabs over the live runtime:
 * Overview, Inspect, State, Profiler, Effects, Network, Console, Routes, Data,
 * Theme, Source, Test, Timeline, and Settings.
 *
 * This file is the *shell*: chrome, docking, event ingestion, and the shared
 * services (highlight overlay, interaction recorder, console tap). Each tab is
 * a pure `(context) → Node[]` function in `tabs/`, so adding a tool never means
 * touching the shell.
 *
 * Three properties are load-bearing:
 *
 *   - **Its own shadow root, its own styles.** The inspector can never be
 *     restyled by the app it inspects, or vice versa.
 *   - **Plain DOM, no Aktion renderer.** It can debug a program whose renderer
 *     is broken without sharing its fate.
 *   - **A full re-read on every render.** There is no local state inside a tab,
 *     so what you see is always the current model — a panel that caches is a
 *     panel that lies.
 */

import {
  installDevtoolsHook,
  getDevtoolsHook,
  type AktionDevtoolsHook,
  type DevtoolsAppRecord,
  type DevtoolsEvent,
} from "./hook.js";
import { devtoolsStyles } from "./styles.js";
import { FOCUS_KEY_ATTR, SCROLL_KEY_ATTR, downloadText, h, spacer } from "./ui.js";
import { PaletteController, SHORTCUTS, buildPalette, type PaletteActions } from "./palette.js";
import { exportSessionJson } from "./session.js";
import {
  defaultUiState, loadPersisted, renderRootElement, savePersisted,
  type DockMode, type PersistedUiState, type TabContext, type TabDefinition, type TabId, type UiState,
} from "./context.js";
import {
  clearModel, emptyModel, ingest, ingestLog, rootOf, type AppModel,
} from "./model.js";
import type { CommitRecord, StateEvent } from "./protocol.js";
import { InspectOverlay } from "./overlay.js";
import { InteractionRecorder, type RecordedStep } from "./recorder.js";
import { ConsoleCapture } from "./console-capture.js";
import { ancestorKeyCandidates, componentNameFromKey } from "./tree.js";

import { overviewTab } from "./tabs/overview.js";
import { inspectTab } from "./tabs/inspect.js";
import { stateTab } from "./tabs/state.js";
import { profilerTab } from "./tabs/profiler.js";
import { effectsTab } from "./tabs/effects.js";
import { networkTab } from "./tabs/network.js";
import { consoleTab } from "./tabs/console.js";
import { routesTab } from "./tabs/routes.js";
import { dataTab } from "./tabs/data.js";
import { themeTab } from "./tabs/theme.js";
import { sourceTab } from "./tabs/source.js";
import { testTab } from "./tabs/test.js";
import { timelineTab } from "./tabs/timeline.js";
import { settingsTab } from "./tabs/settings.js";

const DEVTOOLS_UI_VERSION = "0.6";

/** Every tab, in strip order. */
const TABS: ReadonlyArray<TabDefinition> = [
  overviewTab,
  inspectTab,
  stateTab,
  profilerTab,
  effectsTab,
  networkTab,
  consoleTab,
  routesTab,
  dataTab,
  themeTab,
  sourceTab,
  testTab,
  timelineTab,
  settingsTab,
];

/**
 * Is the keystroke going into something the HOST page is typing in?
 *
 * The page-wide shortcuts must never eat a character from the app under test,
 * and `event.target` for a keystroke inside another shadow root is that root's
 * host element, so check `activeElement` on the way down as well.
 */
function isEditable(target: EventTarget | null): boolean {
  const seen = new Set<Element>();
  let node: Element | null = target instanceof Element ? target : null;
  while (node && !seen.has(node)) {
    seen.add(node);
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((node as HTMLElement).isContentEditable) return true;
    node = (node as HTMLElement).shadowRoot?.activeElement ?? null;
  }
  return false;
}

/** How long a toast stays up. */
const TOAST_MS = 2600;

/** What `captureFocus` records so `restoreFocus` can put the caret back. */
interface FocusSnapshot {
  /** Declared stable key, when the field has one. */
  key: string | null;
  /** Child-index path from the body, as a fallback for unkeyed fields. */
  path: number[];
  start: number | null;
  end: number | null;
  className: string;
  value: string;
}

/** Escape a value for use inside a quoted attribute selector. */
function cssAttrValue(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}

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
  private ui: UiState = defaultUiState();

  private readonly overlay = new InspectOverlay();
  private readonly recorder = new InteractionRecorder();
  private readonly consoleCapture = new ConsoleCapture();

  private renderScheduled = false;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Memo for one render pass — see the comment in `render()`. */
  private renderCache = new Map<string, unknown>();

  /** Events ignored since the user paused — surfaced on the Rec button. */
  private droppedWhilePaused = 0;
  private recordLabel: HTMLElement | null = null;
  private windowKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private longTaskObserver: PerformanceObserver | null = null;
  /** Floating-mode geometry, persisted so the panel reopens where you left it. */
  private geometry: { left: number; top: number; width: number; height: number };

  // skeleton refs
  private root!: ShadowRoot;
  private panelEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private controlsEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private paletteEl!: HTMLElement;

  constructor() {
    super();
    const persisted = loadPersisted();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    // Wide enough that the Inspect tab opens in its split layout (tree beside
    // detail) on a normal screen, and clamped so it still fits a laptop.
    const width = persisted.width ?? Math.min(760, Math.max(420, Math.round(vw * 0.55)));
    const height = persisted.height ?? Math.min(680, Math.max(360, Math.round(vh * 0.8)));
    this.geometry = {
      width,
      height,
      left: persisted.left ?? Math.max(8, vw - width - 16),
      top: persisted.top ?? Math.max(8, vh - height - 16),
    };
    if (persisted.tab && TABS.some((tab) => tab.id === persisted.tab)) this.ui.tab = persisted.tab;
    if (persisted.dock) this.ui.dock = persisted.dock;
    if (persisted.light !== undefined) this.ui.light = persisted.light;
    if (persisted.compact !== undefined) this.ui.compact = persisted.compact;
    if (persisted.captureConsole !== undefined) this.ui.captureConsole = persisted.captureConsole;
    if (persisted.tipsDismissed !== undefined) this.ui.tipsDismissed = persisted.tipsDismissed;
    // Watch expressions are the setup work of a debugging session; losing them
    // on a page reload would mean re-typing them every time.
    if (Array.isArray(persisted.watches)) this.ui.watches = persisted.watches.slice(0, 20);
  }

  connectedCallback(): void {
    if (!this.root) this.buildSkeleton();
    this.hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);

    // Adopt any apps that registered before the panel opened, seed their state
    // immediately, and backfill from the hook's event buffer so the timeline
    // isn't empty on open.
    for (const app of this.hook.apps.values()) this.adopt(app);
    if (!this.selectedAppId && this.hook.apps.size > 0) {
      this.selectedAppId = [...this.hook.apps.keys()][0]!;
    }
    for (const event of this.hook.buffer) this.ingestEvent(event, true);

    this.unsubEvents = this.hook.subscribe((event) => this.onEvent(event));
    this.unsubApps = this.hook.subscribeApps((action, app) => this.onApp(action, app));

    // Late attach: ask every `<aktion-app>` already on the page to register with
    // the (now-installed) hook. Apps that mounted before DevTools opened would
    // otherwise never appear.
    this.discoverApps();
    this.syncConsoleCapture();
    this.observeLongTasks();
    this.applyDock();
    // Seed the program history with what is running now, so "revert" works even
    // for an edit made in the first seconds after opening.
    if (this.selectedAppId) this.recordProgramVersion(this.selectedAppId);
    this.scheduleRender();
  }

  disconnectedCallback(): void {
    this.unsubEvents?.();
    this.unsubApps?.();
    this.unsubEvents = null;
    this.unsubApps = null;
    this.consoleCapture.stop();
    this.recorder.stop();
    this.overlay.destroy();
    if (this.flashTimer) clearTimeout(this.flashTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.windowKeyHandler && typeof window !== "undefined") {
      window.removeEventListener("keydown", this.windowKeyHandler, true);
    }
    this.windowKeyHandler = null;
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.persist();
  }

  /* ---- public controller surface ---- */

  open(): void { this.hidden = false; this.scheduleRender(); }
  close(): void { this.hidden = true; this.overlay.clear(); this.overlay.stopPicking(); }
  toggle(): void { if (this.hidden) this.open(); else this.close(); }

  selectApp(id: string): void {
    this.selectedAppId = id;
    this.ui.selectedCommitId = null;
    this.ui.selectedInstance = null;
    this.ui.selectedRequest = null;
    this.ui.timeTravel = null;
    this.scheduleRender();
  }

  /** Switch tabs programmatically (used by the controller and by tab links). */
  selectTab(tab: TabId): void {
    this.ui.tab = tab;
    this.persist();
    this.scheduleRender();
  }

  /** Test/inspection hook: the derived model for an app (or the selected one). */
  getModel(appId?: string): AppModel | null {
    const id = appId ?? this.selectedAppId;
    return id ? this.models.get(id) ?? null : null;
  }

  /** Test/inspection hook: the panel's current view state. */
  getUiState(): UiState {
    return this.ui;
  }

  /* ---- event ingestion ---- */

  private ensureModel(appId: string): AppModel {
    let model = this.models.get(appId);
    if (!model) {
      model = emptyModel();
      this.models.set(appId, model);
    }
    return model;
  }

  /** Adopt an app: ensure a model and seed its current state snapshot. */
  private adopt(app: DevtoolsAppRecord): AppModel {
    const model = this.ensureModel(app.id);
    try {
      model.state = app.getState();
    } catch {
      /* app mid-teardown */
    }
    if (typeof app.getNetworkRules === "function") {
      try {
        this.ui.rules = app.getNetworkRules();
      } catch {
        /* older record */
      }
    }
    return model;
  }

  /** Ask every `<aktion-app>` on the page to register with the hook. */
  private discoverApps(): void {
    if (typeof document === "undefined") return;
    document.querySelectorAll("aktion-app").forEach((el) => {
      try {
        (el as unknown as { connectDevtools?: () => void }).connectDevtools?.();
      } catch {
        /* not an Aktion element, or a pre-DevTools build */
      }
    });
  }

  private onApp(action: "register" | "unregister", app: DevtoolsAppRecord): void {
    if (action === "register") {
      this.adopt(app);
      if (!this.selectedAppId) this.selectedAppId = app.id;
    } else if (this.selectedAppId === app.id) {
      // Keep the model (history is still useful) but re-point the selection.
      const next = [...(this.hook?.apps.keys() ?? [])].find((id) => id !== app.id) ?? null;
      this.selectedAppId = next;
    }
    this.scheduleRender();
  }

  private onEvent(event: DevtoolsEvent): void {
    if (this.ui.paused) {
      // Say how much was missed, in place, without re-rendering the panel.
      this.droppedWhilePaused += 1;
      this.updateRecordLabel();
      return;
    }
    this.ingestEvent(event, false);
    const mine = event.appId === this.selectedAppId;
    if (event.kind === "commit" && mine) {
      if (this.ui.flashOnCommit) this.flashApp(event.appId);
      if (this.ui.highlightUpdates) this.highlightRenderedComponents(event);
      if (this.ui.perfMarks) this.markCommitForBrowserProfiler(event);
      this.recordProgramVersion(event.appId);
    }
    if (event.kind === "state" && mine) this.checkBreakOnChange(event);
    // A navigation that happens while recording belongs in the generated test:
    // the DOM cannot report it, so the shell forwards it.
    if (event.kind === "route" && this.recorder.isRecording && mine) {
      this.recorder.addStep({ type: "navigate", value: event.to, label: `navigate to ${event.to}` });
    }
    this.scheduleRender();
  }

  /**
   * Outline every component that actually rendered in this commit.
   *
   * The most direct answer to "why did that feel slow?" is seeing the whole
   * screen flash when you typed one character. Memoized instances are skipped —
   * outlining them would report the opposite of the truth.
   */
  private highlightRenderedComponents(commit: CommitRecord): void {
    const app = this.currentApp();
    if (typeof app?.nodeForInstance !== "function") return;
    const keys = commit.components
      .filter((record) => record.phase !== "memo")
      .map((record) => record.instanceKey);
    const nodes: Element[] = [];
    for (const key of keys.slice(0, 60)) {
      const node = app.nodeForInstance(key);
      if (node) nodes.push(node);
    }
    this.overlay.flashUpdated(nodes);
  }

  /**
   * Mirror a commit into `performance.measure` so it appears in the browser's
   * own performance timeline next to layout, paint, and long tasks.
   *
   * The panel's profiler can tell you a commit took 12ms; only the browser's
   * timeline can tell you what happened around it.
   */
  private markCommitForBrowserProfiler(commit: CommitRecord): void {
    if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
    try {
      const label = commit.initial
        ? "aktion: initial mount"
        : `aktion: commit #${commit.commitId}${commit.changedPaths.length ? ` (${commit.changedPaths.join(", ")})` : ""}`;
      performance.measure(label, { start: commit.startTime, duration: commit.duration });
    } catch {
      // A browser without the options form of `measure`, or a start time older
      // than the buffer allows. Losing a mark is not worth a broken panel.
    }
  }

  /**
   * Break into the debugger when a watched atom changes.
   *
   * The panel cannot pause the runtime, but the browser can: a `debugger`
   * statement executed here stops the world inside the state flush, one frame
   * below the write, with the stack that caused it. That is the one thing a
   * state inspector cannot otherwise give you.
   */
  private checkBreakOnChange(event: StateEvent): void {
    if (this.ui.breakOnChange.size === 0) return;
    const hit = event.changedPaths.find((path) =>
      this.ui.breakOnChange.has(path) || this.ui.breakOnChange.has(rootOf(path)));
    if (!hit) return;
    const value = event.snapshot[rootOf(hit)];
    // eslint-disable-next-line no-console
    console.warn(`[aktion-devtools] break on change: $${hit} =`, value);
    // eslint-disable-next-line no-debugger
    debugger;
  }

  /**
   * Keep a short history of program versions.
   *
   * A hot-swapped program that fails to parse leaves you with a blank app and no
   * way back — the Source tab can only re-plan what is already broken. Recording
   * each distinct version as it commits makes "undo that edit" possible.
   */
  private recordProgramVersion(appId: string): void {
    const app = this.hook?.apps.get(appId);
    if (!app) return;
    let text: string;
    try {
      text = app.getProgram();
    } catch {
      return;
    }
    if (text === "") return;
    const model = this.ensureModel(appId);
    const last = model.programHistory[model.programHistory.length - 1];
    if (last?.text === text) return;
    model.programHistory.push({ text, at: Date.now(), lines: text.split("\n").length });
    if (model.programHistory.length > 20) model.programHistory.shift();
  }

  private ingestEvent(event: DevtoolsEvent, fromBuffer: boolean): void {
    ingest(this.ensureModel(event.appId), event, fromBuffer);
  }

  /** Route a captured console line into the selected app's model. */
  private syncConsoleCapture(): void {
    if (this.ui.captureConsole && !this.consoleCapture.active) {
      this.consoleCapture.start((entry) => {
        const id = this.selectedAppId;
        if (!id) return;
        ingestLog(this.ensureModel(id), { ...entry, text: entry.args.join(" "), count: 1 });
        this.scheduleRender();
      });
    } else if (!this.ui.captureConsole && this.consoleCapture.active) {
      this.consoleCapture.stop();
    }
  }

  /* ---- render scheduling ---- */

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    const run = (): void => {
      this.renderScheduled = false;
      try {
        this.render();
      } catch (err) {
        // A tab that throws must not take the panel with it — the whole point of
        // the panel is to still be there when something is broken.
        // eslint-disable-next-line no-console
        console.error("[aktion-devtools] render failed", err);
        this.bodyEl?.replaceChildren(h("div", { class: "empty" },
          h("p", {}, "The panel hit an error while rendering this tab."),
          h("p", { class: "faint" }, String(err))));
      }
    };
    // A microtask, matching the runtime's own render scheduling: every event a
    // single task produces (a state flush, its commit, the effects it triggers)
    // collapses into ONE panel render, and the panel is up to date by the time
    // the task's promise chain settles — which is what makes it observable from
    // a test without waiting on frames.
    queueMicrotask(run);
  }

  private currentApp(): DevtoolsAppRecord | null {
    if (!this.selectedAppId || !this.hook) return null;
    return this.hook.apps.get(this.selectedAppId) ?? null;
  }

  private render(): void {
    if (this.hidden || !this.root) return;
    this.syncConsoleCapture();
    // One cache per render pass. Several tabs (and the badge of every tab) ask
    // the runtime the same questions — the component tree, the program analysis,
    // the per-instance aggregates — and those are the expensive calls. Computing
    // each at most once per pass is the difference between a panel that costs
    // microseconds per event and one that costs milliseconds.
    this.renderCache = new Map();
    if (!this.ui.paused) this.droppedWhilePaused = 0;
    this.applyChrome();
    this.renderControls();
    this.renderTabs();
    const focus = this.captureFocus();
    const scroll = this.captureScroll();
    this.renderBody();
    this.restoreScroll(scroll);
    this.restoreFocus(focus);
    this.renderToast();
    this.renderPalette();
  }

  /* ---- focus + scroll preservation ---- */

  /**
   * Remember where the caret is before a re-render.
   *
   * The panel re-renders on every runtime event, so a field the user is typing
   * in is rebuilt several times a second. Restoring by POSITION is not enough:
   * running a REPL expression grows the history above the input, so the input is
   * no longer the same child index and focus is lost on exactly the keystroke
   * that mattered. Fields therefore declare a stable key (see `FOCUS_KEY_ATTR`)
   * and the shell restores by key, falling back to the position for anything
   * that has not declared one.
   */
  private captureFocus(): FocusSnapshot | null {
    // Reading `activeElement` on a shadow root can throw in some DOM
    // implementations while focus lives in another shadow root (the inspected
    // app has one too). A lost caret restore is cosmetic; a throw here would
    // take the whole panel render with it.
    let active: Element | null = null;
    try {
      active = this.root.activeElement;
    } catch {
      return null;
    }
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return null;
    if (!this.bodyEl.contains(active)) return null;

    const path: number[] = [];
    let node: Element | null = active;
    while (node && node !== this.bodyEl) {
      const parent: Element | null = node.parentElement;
      if (!parent) break;
      path.unshift([...parent.children].indexOf(node));
      node = parent;
    }
    let start: number | null = null;
    let end: number | null = null;
    try {
      start = active.selectionStart;
      end = active.selectionEnd;
    } catch {
      /* an input type that forbids selection reads */
    }
    return {
      key: active.getAttribute(FOCUS_KEY_ATTR),
      path,
      start,
      end,
      className: active.className,
      value: active.value,
    };
  }

  private restoreFocus(focus: FocusSnapshot | null): void {
    if (!focus) return;
    const target = this.findFocusTarget(focus);
    if (!target) return;
    target.focus();
    // A keyed field can legitimately come back with a different value (the tab
    // re-read it from state). Only restore the caret when the text is the same,
    // or the offsets would land in the wrong place.
    if (focus.start !== null && focus.end !== null && target.value === focus.value) {
      try {
        target.setSelectionRange(focus.start, focus.end);
      } catch {
        /* not supported for this input type */
      }
    }
  }

  private findFocusTarget(focus: FocusSnapshot): HTMLInputElement | HTMLTextAreaElement | null {
    if (focus.key) {
      const byKey = this.bodyEl.querySelector(`[${FOCUS_KEY_ATTR}="${cssAttrValue(focus.key)}"]`);
      if (byKey instanceof HTMLInputElement || byKey instanceof HTMLTextAreaElement) return byKey;
      // A keyed field that is gone is gone: falling back to the position would
      // put the caret in an unrelated field.
      return null;
    }
    let node: Element | null = this.bodyEl;
    for (const index of focus.path) {
      node = node?.children[index] ?? null;
      if (!node) return null;
    }
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return null;
    // The path is only meaningful if the tree came back the same shape. When it
    // did not (a banner appeared, a section collapsed) the same position can be
    // a different field, and stealing focus into it would be worse than losing
    // the caret — so require the class to match too.
    return node.className === focus.className ? node : null;
  }

  /**
   * Scroll offsets of every keyed scroll container, so a scrolled component
   * tree does not jump to the top each time an event arrives.
   */
  private captureScroll(): Map<string, number> {
    const out = new Map<string, number>();
    out.set("__body", this.bodyEl.scrollTop);
    for (const el of this.bodyEl.querySelectorAll(`[${SCROLL_KEY_ATTR}]`)) {
      const key = el.getAttribute(SCROLL_KEY_ATTR);
      if (key) out.set(key, el.scrollTop);
    }
    return out;
  }

  private restoreScroll(offsets: Map<string, number>): void {
    const body = offsets.get("__body");
    if (body !== undefined) this.bodyEl.scrollTop = body;
    for (const el of this.bodyEl.querySelectorAll(`[${SCROLL_KEY_ATTR}]`)) {
      const key = el.getAttribute(SCROLL_KEY_ATTR);
      const value = key ? offsets.get(key) : undefined;
      if (value !== undefined) el.scrollTop = value;
    }
  }

  /* ---- chrome ---- */

  private buildSkeleton(): void {
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = devtoolsStyles;

    this.controlsEl = h("div", { class: "controls" });
    this.toastEl = h("div", { class: "toast", hidden: true });
    this.headerEl = h(
      "div",
      { class: "header" },
      h("div", { class: "brand" },
        h("span", { class: "bolt" }, "⚡"),
        h("span", {}, "Aktion DevTools"),
        h("span", { class: "ver" }, `v${DEVTOOLS_UI_VERSION}`)),
      this.toastEl,
      spacer(),
      this.controlsEl,
    );
    this.makeDraggable(this.headerEl);

    this.tabsEl = h("div", { class: "tabs" });
    this.bodyEl = h("div", { class: "panel-body" });
    const grip = h("div", { class: "resize", title: "Drag to resize" });
    this.makeResizable(grip);

    // The palette lives OUTSIDE the panel box so it is not clipped by the
    // panel's `overflow: hidden`, and stays usable while the panel is collapsed.
    this.paletteEl = h("div", { class: "pal-host", hidden: true });
    this.panelEl = h("div", { class: "panel" }, this.headerEl, this.tabsEl, this.bodyEl, grip);
    this.root.append(style, this.panelEl, this.paletteEl);
    this.bindKeyboard();
    this.applyChrome();
  }

  /** Reflect dock mode, theme, and density onto the host + panel. */
  private applyChrome(): void {
    this.classList.toggle("is-light", this.ui.light);
    this.classList.toggle("is-compact", this.ui.compact);
    this.panelEl.classList.toggle("is-collapsed", this.ui.collapsed);
    this.applyDock();
  }

  private applyDock(): void {
    const dock = this.ui.dock;
    for (const mode of ["float", "right", "bottom", "left"] as DockMode[]) {
      this.classList.toggle(`dock-${mode}`, dock === mode);
    }
    if (dock === "float") {
      this.style.left = `${this.geometry.left}px`;
      this.style.top = `${this.geometry.top}px`;
      this.style.right = "";
      this.style.bottom = "";
      this.panelEl.style.width = `${this.geometry.width}px`;
      this.panelEl.style.height = `${this.geometry.height}px`;
      return;
    }
    // Docked: the host spans an edge and the panel fills it, so the geometry
    // above is irrelevant until you float again (where it is restored).
    this.style.left = "";
    this.style.top = "";
    this.style.right = "";
    this.style.bottom = "";
    this.panelEl.style.width = "";
    this.panelEl.style.height = "";
  }

  /** Rec / Paused, with a count of what pausing has cost you. */
  private recordText(): string {
    if (!this.ui.paused) return "Rec";
    return this.droppedWhilePaused > 0 ? `Paused · ${this.droppedWhilePaused}` : "Paused";
  }

  private recordTitle(): string {
    if (!this.ui.paused) return "Recording — click to pause";
    return this.droppedWhilePaused > 0
      ? `Paused — ${this.droppedWhilePaused} event${this.droppedWhilePaused === 1 ? "" : "s"} ignored since you paused. Click to resume (they are not recovered).`
      : "Paused — click to resume recording";
  }

  /** Update the button text without a render — see `droppedWhilePaused`. */
  private updateRecordLabel(): void {
    if (!this.recordLabel) return;
    this.recordLabel.textContent = this.recordText();
    const button = this.recordLabel.parentElement;
    if (button) button.title = this.recordTitle();
  }

  /**
   * Open Inspect on an instance and make sure the row is actually visible.
   *
   * A jump from another tab can land on a row hidden three different ways —
   * inside a collapsed branch, excluded by the tree filter, or a library
   * component while the Library toggle is off. Silently showing the detail of
   * a row you cannot see is the worst of the three outcomes, so clear all of
   * them and say which ones were cleared.
   */
  private revealInInspect(instanceKey: string): void {
    this.ui.tab = "inspect";
    for (const ancestor of ancestorKeyCandidates(instanceKey)) {
      this.ui.inspectCollapsed.delete(ancestor);
    }
    const cleared: string[] = [];
    const name = componentNameFromKey(instanceKey);
    const filter = this.ui.inspectFilter.trim().toLowerCase();
    if (filter !== "" && !name.toLowerCase().includes(filter)) {
      this.ui.inspectFilter = "";
      cleared.push("filter");
    }
    // Library instances are the ones addressed with `#Name`; a user component
    // is addressed by position, so it is never hidden by this toggle.
    if (!this.ui.inspectShowLibrary && instanceKey.lastIndexOf("#") > 0) {
      this.ui.inspectShowLibrary = true;
      cleared.push("library filter");
    }
    if (cleared.length > 0) this.toastMessage(`Cleared the ${cleared.join(" and ")} to show ${name}`);
    this.ui.inspectReveal = instanceKey;
  }

  /** Show a transient message. Shared by the tabs (via `ctx.toast`) and the shell. */
  private toastMessage(message: string, tone = "info"): void {
    this.ui.toast = { message, tone, at: Date.now() };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.ui.toast = null;
      this.scheduleRender();
    }, TOAST_MS);
    this.renderToast();
  }

  private renderControls(): void {
    const apps = this.hook ? [...this.hook.apps.values()] : [];
    const select = h("select", {
      class: "app-select",
      title: "Inspected app",
      onchange: (event: Event) => this.selectApp((event.target as HTMLSelectElement).value),
    }) as HTMLSelectElement;
    if (apps.length === 0) {
      select.appendChild(h("option", {}, "no app detected"));
      select.disabled = true;
    } else {
      for (const app of apps) {
        const option = h("option", { value: app.id }, app.label) as HTMLOptionElement;
        if (app.id === this.selectedAppId) option.selected = true;
        select.appendChild(option);
      }
    }

    this.recordLabel = h("span", { class: "rec-label" }, this.recordText());
    const record = h("button", {
      class: `icon-btn ${this.ui.paused ? "" : "is-on"}`,
      title: this.recordTitle(),
      onclick: () => {
        this.ui.paused = !this.ui.paused;
        this.scheduleRender();
      },
    }, h("span", { class: `rec-dot ${this.ui.paused ? "is-paused" : ""}` }), this.recordLabel);

    const dockButton = h("button", {
      class: "icon-btn",
      title: `Dock: ${this.ui.dock} — click to cycle`,
      onclick: () => {
        const order: DockMode[] = ["float", "right", "bottom", "left"];
        const next = order[(order.indexOf(this.ui.dock) + 1) % order.length]!;
        this.ui.dock = next;
        this.persist();
        this.scheduleRender();
      },
    }, dockGlyph(this.ui.dock));

    const collapse = h("button", {
      class: "icon-btn",
      title: this.ui.collapsed ? "Expand" : "Collapse",
      onclick: () => {
        this.ui.collapsed = !this.ui.collapsed;
        this.scheduleRender();
      },
    }, this.ui.collapsed ? "▢" : "—");

    const close = h("button", { class: "icon-btn", title: "Close", onclick: () => this.close() }, "✕");

    this.controlsEl.replaceChildren(select, record, dockButton, collapse, close);
  }

  private renderTabs(): void {
    const ctx = this.context();
    this.tabsEl.replaceChildren(...TABS.map((tab) => {
      // A badge must never be able to break the strip: a tab whose count throws
      // would otherwise take out navigation to every other tab.
      let badge: number | null = null;
      try {
        badge = tab.badge?.(ctx) ?? null;
      } catch {
        badge = null;
      }
      return h("button", {
        class: `tab ${this.ui.tab === tab.id ? "is-active" : ""}`,
        title: `${tab.label} — ${tab.hint}`,
        "data-tab": tab.id,
        onclick: () => this.selectTab(tab.id),
      },
        h("span", { class: "tab-icon" }, tab.icon),
        h("span", { class: "tab-label" }, tab.label),
        badge !== null ? h("span", { class: "count" }, badge > 999 ? "999+" : String(badge)) : null);
    }));
    // The strip scrolls horizontally, so a tab selected from the palette or a
    // keyboard shortcut can be off-screen — which reads as "nothing happened".
    const active = this.tabsEl.querySelector(".tab.is-active");
    if (active) {
      const stripBox = this.tabsEl.getBoundingClientRect();
      const tabBox = active.getBoundingClientRect();
      if (tabBox.left < stripBox.left || tabBox.right > stripBox.right) {
        active.scrollIntoView({ block: "nearest", inline: "center" });
      }
    }
  }

  /* ---- command palette + shortcuts ---- */

  /** Panel-level operations the palette can trigger. */
  private paletteActions(): PaletteActions {
    const ctx = this.context();
    return {
      togglePicker: () => this.togglePicker(),
      clearOverrides: () => {
        const app = this.currentApp();
        if (typeof app?.listPropOverrides !== "function" || typeof app.clearPropOverride !== "function") return;
        for (const entry of app.listPropOverrides()) app.clearPropOverride(entry.instanceKey, entry.prop);
        ctx.toast("Prop overrides cleared");
        this.scheduleRender();
      },
      runAudit: () => {
        this.ui.tab = "test";
        this.ui.testPane = "a11y";
        this.ui.a11yRequested = true;
        this.scheduleRender();
      },
      toggleRecording: () => {
        this.ui.tab = "test";
        this.ui.testPane = "record";
        if (this.recorder.isRecording) {
          this.recorder.stop();
          ctx.toast(`Recorded ${this.recorder.list().length} step(s)`);
        } else {
          const root = renderRootElement(this.currentApp());
          const started = this.recorder.start(root, () => this.scheduleRender());
          ctx.toast(started ? "Recording — interact with the app" : "Could not attach to the app", started ? "good" : "bad");
        }
        this.scheduleRender();
      },
      exportSession: () => {
        downloadText("aktion-session.json", exportSessionJson(this.context()));
        ctx.toast("Session exported");
      },
      clearSession: () => {
        const model = this.getModel();
        if (model) clearModel(model);
        this.hook?.clearBuffer();
        this.ui.selectedCommitId = null;
        this.ui.selectedRequest = null;
        this.ui.timeTravel = null;
        ctx.toast("Session data cleared");
        this.scheduleRender();
      },
      cycleDock: () => this.cycleDock(),
      showShortcuts: () => {
        this.ui.shortcutsOpen = true;
        this.scheduleRender();
      },
    };
  }

  /** Render (or tear down) the palette / shortcut overlay. */
  private renderPalette(): void {
    if (this.ui.shortcutsOpen) {
      this.paletteEl.hidden = false;
      this.paletteEl.replaceChildren(h(
        "div",
        { class: "pal-scrim", onclick: () => { this.ui.shortcutsOpen = false; this.scheduleRender(); } },
        h("div", { class: "pal-box is-help", onclick: (event: Event) => event.stopPropagation() },
          h("div", { class: "pal-title" }, "Keyboard shortcuts"),
          h("div", { class: "deflist" }, ...SHORTCUTS.flatMap(([keys, what]) => [
            h("div", { class: "dt" }, keys),
            h("div", { class: "dd" }, what),
          ])),
          h("div", { class: "pal-foot" }, h("span", {}, "Esc to close"))),
      ));
      return;
    }
    if (!this.ui.paletteOpen) {
      if (!this.paletteEl.hidden) {
        this.paletteEl.hidden = true;
        this.paletteEl.replaceChildren();
      }
      return;
    }
    this.paletteEl.hidden = false;
    const ctx = this.context();
    const count = this.palette.update(this.paletteEl, {
      query: this.ui.paletteQuery,
      selected: this.ui.paletteIndex,
      commands: buildPalette(ctx, this.paletteActions()),
    });
    if (this.ui.paletteIndex >= count) this.ui.paletteIndex = Math.max(0, count - 1);
  }

  /** The palette controller, created once so its input survives re-renders. */
  private readonly palette = new PaletteController({
    onQuery: (value) => {
      this.ui.paletteQuery = value;
      this.ui.paletteIndex = 0;
      this.scheduleRender();
    },
    onMove: (delta) => {
      this.ui.paletteIndex = Math.max(0, this.ui.paletteIndex + delta);
      this.scheduleRender();
    },
    onRun: (command) => {
      this.closePalette();
      command.run();
      this.scheduleRender();
    },
    onClose: () => {
      this.closePalette();
      this.scheduleRender();
    },
  });

  private openPalette(): void {
    this.ui.paletteOpen = true;
    this.ui.shortcutsOpen = false;
    this.ui.paletteQuery = "";
    this.ui.paletteIndex = 0;
    this.palette.reset();
    this.scheduleRender();
    // Focus after the overlay is in the tree.
    queueMicrotask(() => {
      if (this.ui.paletteOpen) this.palette.focus();
    });
  }

  private closePalette(): void {
    this.ui.paletteOpen = false;
    this.ui.paletteQuery = "";
    this.ui.paletteIndex = 0;
    this.palette.reset();
  }

  private cycleDock(): void {
    const order: DockMode[] = ["float", "right", "bottom", "left"];
    this.ui.dock = order[(order.indexOf(this.ui.dock) + 1) % order.length]!;
    this.persist();
    this.scheduleRender();
  }

  /** Arm / disarm the element picker from anywhere (palette, shortcut, button). */
  private togglePicker(): void {
    if (this.overlay.isPicking) {
      this.overlay.stopPicking();
      this.scheduleRender();
      return;
    }
    const app = this.currentApp();
    this.ui.tab = "inspect";
    this.overlay.startPicking({
      onPick: (element) => {
        this.ui.selectedElement = element;
        const key = typeof app?.instanceForNode === "function" ? app.instanceForNode(element) : null;
        this.ui.selectedInstance = key;
        if (key) this.highlightInstance(key, true);
        else this.overlay.highlight(element, {}, true);
        this.ui.inspectPane = key ? "props" : "dom";
        this.scheduleRender();
      },
      onCancel: () => this.scheduleRender(),
    });
    this.scheduleRender();
  }

  /**
   * Panel-wide keyboard handling.
   *
   * Bound on the panel's own root, not the window: a debugger that swallows the
   * page's keystrokes is worse than one with no shortcuts. The two exceptions
   * are the palette and the picker toggle, which are bound on the window because
   * you reach for them while your hands are in the app.
   */
  private bindKeyboard(): void {
    this.root.addEventListener("keydown", (event: Event) => this.onKeyDown(event as KeyboardEvent));
    if (typeof window === "undefined") return;
    this.windowKeyHandler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (this.hidden) this.open();
        this.openPalette();
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (this.hidden) this.open();
        this.togglePicker();
      } else if (event.altKey && !this.hidden && !isEditable(event.target)) {
        // Tab shortcuts from anywhere: you are usually clicking the APP, not
        // the panel, when you want to change what the panel is showing.
        this.tabShortcut(event);
      }
    };
    window.addEventListener("keydown", this.windowKeyHandler, true);
  }

  /** Alt+1..9 selects a tab; Alt+[ / Alt+] cycle. Returns true if handled. */
  private tabShortcut(event: KeyboardEvent): boolean {
    if (event.key >= "1" && event.key <= "9") {
      const tab = TABS[Number(event.key) - 1];
      if (!tab) return false;
      event.preventDefault();
      this.selectTab(tab.id);
      return true;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const index = TABS.findIndex((tab) => tab.id === this.ui.tab);
      const next = TABS[(index + (event.key === "]" ? 1 : TABS.length - 1)) % TABS.length]!;
      this.selectTab(next.id);
      return true;
    }
    return false;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

    if (event.key === "Escape") {
      if (this.ui.paletteOpen || this.ui.shortcutsOpen) {
        event.preventDefault();
        this.closePalette();
        this.ui.shortcutsOpen = false;
        this.scheduleRender();
      }
      return;
    }
    if (event.key === "?" && !typing) {
      event.preventDefault();
      this.ui.shortcutsOpen = !this.ui.shortcutsOpen;
      this.scheduleRender();
      return;
    }
    if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f")) {
      const search = this.bodyEl.querySelector("input.search") as HTMLInputElement | null;
      if (search) {
        event.preventDefault();
        search.focus();
        search.select();
      }
      return;
    }
    if (event.altKey && !typing) this.tabShortcut(event);
  }

  /**
   * Watch for long tasks while the panel is open.
   *
   * A commit that measures 4ms in the profiler but janks the page is usually a
   * long task the runtime did not cause (an image decode, a third-party script)
   * — and being able to say so is the difference between fixing the right thing
   * and rewriting a component that was never the problem.
   */
  private observeLongTasks(): void {
    if (typeof PerformanceObserver !== "function" || this.longTaskObserver) return;
    try {
      const observer = new PerformanceObserver((list) => {
        const model = this.getModel();
        if (!model) return;
        for (const entry of list.getEntries()) {
          model.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
        if (model.longTasks.length > 100) model.longTasks.splice(0, model.longTasks.length - 100);
        this.scheduleRender();
      });
      observer.observe({ entryTypes: ["longtask"] });
      this.longTaskObserver = observer;
    } catch {
      // Not every browser supports the entry type; the panel simply reports no
      // long tasks rather than pretending there were none.
    }
  }

  private renderBody(): void {
    const ctx = this.context();
    const definition = TABS.find((tab) => tab.id === this.ui.tab) ?? TABS[0]!;
    this.bodyEl.replaceChildren(...definition.render(ctx));
  }

  private renderToast(): void {
    const toast = this.ui.toast;
    if (!toast) {
      this.toastEl.hidden = true;
      this.toastEl.replaceChildren();
      return;
    }
    this.toastEl.hidden = false;
    this.toastEl.className = `toast t-${toast.tone}`;
    this.toastEl.textContent = toast.message;
  }

  /* ---- tab context ---- */

  private context(): TabContext {
    const app = this.currentApp();
    const model = this.getModel() ?? emptyModel();
    const hook = this.hook ?? installDevtoolsHook(DEVTOOLS_UI_VERSION);
    return {
      app,
      model,
      hook,
      ui: this.ui,
      overlay: this.overlay,
      recorder: this.recorder,
      cache: <T>(key: string, compute: () => T): T => {
        if (this.renderCache.has(key)) return this.renderCache.get(key) as T;
        const value = compute();
        this.renderCache.set(key, value);
        return value;
      },
      width: () => this.panelEl?.getBoundingClientRect().width ?? this.geometry.width,
      refresh: () => this.scheduleRender(),
      selectTab: (tab) => this.selectTab(tab),
      selectInstance: (instanceKey, options) => {
        this.ui.selectedInstance = instanceKey;
        this.ui.selectedElement = null;
        if (instanceKey) {
          this.highlightInstance(instanceKey, true);
          if (options?.reveal !== false) this.revealInInspect(instanceKey);
        }
        this.scheduleRender();
      },
      toast: (message, tone = "info") => this.toastMessage(message, tone),
      highlightInstance: (instanceKey, pin) => this.highlightInstance(instanceKey, pin ?? false),
      togglePicker: () => this.togglePicker(),
      openPalette: () => this.openPalette(),
      persist: () => this.persist(),
      recordedSteps: (): ReadonlyArray<RecordedStep> => this.recorder.list(),
    };
  }

  /** Highlight the DOM node an instance rendered, labelled with its name. */
  private highlightInstance(instanceKey: string | null, pin: boolean): void {
    if (!instanceKey) {
      this.overlay.hideHover();
      return;
    }
    const app = this.currentApp();
    const node = typeof app?.nodeForInstance === "function" ? app.nodeForInstance(instanceKey) : null;
    if (!node) {
      this.overlay.hideHover();
      return;
    }
    this.overlay.highlight(node, { component: componentNameFromKey(instanceKey) }, pin);
  }

  /* ---- highlight + drag/resize ---- */

  private flashApp(appId: string): void {
    const app = this.hook?.apps.get(appId);
    if (!app) return;
    const element = app.element;
    const previous = element.style.outline;
    element.style.outline = "2px solid rgba(124,156,255,0.9)";
    element.style.outlineOffset = "1px";
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      element.style.outline = previous;
      element.style.outlineOffset = "";
    }, 140);
  }

  private makeDraggable(handle: HTMLElement): void {
    let startX = 0, startY = 0, originLeft = 0, originTop = 0, dragging = false;
    const onMove = (event: MouseEvent): void => {
      if (!dragging) return;
      this.geometry.left = Math.max(0, originLeft + (event.clientX - startX));
      this.geometry.top = Math.max(0, originTop + (event.clientY - startY));
      this.style.left = `${this.geometry.left}px`;
      this.style.top = `${this.geometry.top}px`;
    };
    const onUp = (): void => {
      dragging = false;
      handle.classList.remove("is-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this.persist();
    };
    handle.addEventListener("mousedown", (event: MouseEvent) => {
      // Dragging only applies while floating, and never from a control.
      if (this.ui.dock !== "float") return;
      if ((event.target as HTMLElement).closest("button, select, input")) return;
      dragging = true;
      handle.classList.add("is-dragging");
      startX = event.clientX;
      startY = event.clientY;
      const rect = this.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      event.preventDefault();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  private makeResizable(grip: HTMLElement): void {
    let startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
    const onMove = (event: MouseEvent): void => {
      if (!resizing) return;
      this.geometry.width = Math.max(360, startW + (event.clientX - startX));
      this.geometry.height = Math.max(260, startH + (event.clientY - startY));
      this.panelEl.style.width = `${this.geometry.width}px`;
      this.panelEl.style.height = `${this.geometry.height}px`;
    };
    const onUp = (): void => {
      resizing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this.persist();
    };
    grip.addEventListener("mousedown", (event: MouseEvent) => {
      if (this.ui.dock !== "float") return;
      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = this.panelEl.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
      event.preventDefault();
      event.stopPropagation();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  private persist(): void {
    const payload: PersistedUiState = {
      tab: this.ui.tab,
      dock: this.ui.dock,
      light: this.ui.light,
      compact: this.ui.compact,
      captureConsole: this.ui.captureConsole,
      width: this.geometry.width,
      height: this.geometry.height,
      left: this.geometry.left,
      top: this.geometry.top,
      tipsDismissed: this.ui.tipsDismissed,
      watches: this.ui.watches,
    };
    savePersisted(payload);
  }
}

function dockGlyph(dock: DockMode): string {
  switch (dock) {
    case "right": return "▐";
    case "left": return "▌";
    case "bottom": return "▄";
    default: return "❐";
  }
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

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
  /** Open on a specific tab. */
  tab?: TabId;
  /** Dock position (default: whatever was last used, else floating). */
  dock?: DockMode;
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
  /** Switch to a tab by id. */
  selectTab(tab: TabId): void;
  /** Remove the panel from the DOM (the hook + event stream stay installed). */
  destroy(): void;
}

/**
 * Install the DevTools hook and mount an in-page panel. Idempotent at the hook
 * level — multiple panels share one event stream — but each call mounts a fresh
 * panel element.
 *
 *   import { mountDevtools } from "aktion-runtime/devtools";
 *   mountDevtools();
 */
export function mountDevtools(options: MountDevtoolsOptions = {}): DevtoolsController {
  const hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);
  defineDevtoolsElement();
  const element = document.createElement(AktionDevtoolsElement.tagName) as AktionDevtoolsElement;
  (options.container ?? document.body).appendChild(element);
  if (options.appId) element.selectApp(options.appId);
  if (options.tab) element.selectTab(options.tab);
  if (options.dock) {
    element.getUiState().dock = options.dock;
    element.selectTab(element.getUiState().tab);
  }
  if (options.open === false) element.close();
  return {
    element,
    hook,
    open: () => element.open(),
    close: () => element.close(),
    toggle: () => element.toggle(),
    selectApp: (id) => element.selectApp(id),
    selectTab: (tab) => element.selectTab(tab),
    destroy: () => element.remove(),
  };
}

/** Whether a DevTools hook is currently installed on the page. */
export function isDevtoolsInstalled(): boolean {
  return getDevtoolsHook() !== undefined;
}

/** Re-exported so a host can clear a panel's captured data programmatically. */
export { clearModel };
