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
import { h, spacer } from "./ui.js";
import {
  defaultUiState, loadPersisted, savePersisted,
  type DockMode, type PersistedUiState, type TabContext, type TabDefinition, type TabId, type UiState,
} from "./context.js";
import {
  clearModel, emptyModel, ingest, ingestLog, type AppModel,
} from "./model.js";
import { InspectOverlay } from "./overlay.js";
import { InteractionRecorder, type RecordedStep } from "./recorder.js";
import { ConsoleCapture } from "./console-capture.js";
import { componentNameFromKey } from "./tree.js";

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

/** How long a toast stays up. */
const TOAST_MS = 2600;

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

  constructor() {
    super();
    const persisted = loadPersisted();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const width = persisted.width ?? 560;
    const height = persisted.height ?? 620;
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
    this.applyDock();
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
    if (this.ui.paused) return;
    this.ingestEvent(event, false);
    if (event.kind === "commit" && this.ui.flashOnCommit && event.appId === this.selectedAppId) {
      this.flashApp(event.appId);
    }
    // A navigation that happens while recording belongs in the generated test:
    // the DOM cannot report it, so the shell forwards it.
    if (event.kind === "route" && this.recorder.isRecording && event.appId === this.selectedAppId) {
      this.recorder.addStep({ type: "navigate", value: event.to, label: `navigate to ${event.to}` });
    }
    this.scheduleRender();
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
    this.applyChrome();
    this.renderControls();
    this.renderTabs();
    const focus = this.captureFocus();
    const scroll = this.bodyEl.scrollTop;
    this.renderBody();
    this.bodyEl.scrollTop = scroll;
    this.restoreFocus(focus);
    this.renderToast();
  }

  /* ---- focus preservation ---- */

  /**
   * Remember where the caret is before a re-render.
   *
   * The panel re-renders on every event, and a filter box that loses focus (or
   * its caret) after one keystroke is unusable. Rather than making each tab
   * patch its own DOM in place, the shell records the focused field's position
   * in the tree and puts the caret back afterwards — which works for every tab
   * without any of them knowing about it.
   */
  private captureFocus(): { path: number[]; start: number | null; end: number | null; className: string } | null {
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
    return { path, start, end, className: active.className };
  }

  private restoreFocus(
    focus: { path: number[]; start: number | null; end: number | null; className: string } | null,
  ): void {
    if (!focus) return;
    let node: Element | null = this.bodyEl;
    for (const index of focus.path) {
      node = node?.children[index] ?? null;
      if (!node) return;
    }
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return;
    // The path is only meaningful if the tree came back the same shape. When it
    // did not (a banner appeared, a section collapsed) the same position can be
    // a different field, and stealing focus into it would be worse than losing
    // the caret — so require the class to match too.
    if (node.className !== focus.className) return;
    node.focus();
    if (focus.start !== null && focus.end !== null) {
      try {
        node.setSelectionRange(focus.start, focus.end);
      } catch {
        /* not supported for this input type */
      }
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

    this.panelEl = h("div", { class: "panel" }, this.headerEl, this.tabsEl, this.bodyEl, grip);
    this.root.append(style, this.panelEl);
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

    const record = h("button", {
      class: `icon-btn ${this.ui.paused ? "" : "is-on"}`,
      title: this.ui.paused ? "Paused — click to resume recording" : "Recording — click to pause",
      onclick: () => {
        this.ui.paused = !this.ui.paused;
        this.scheduleRender();
      },
    }, h("span", { class: `rec-dot ${this.ui.paused ? "is-paused" : ""}` }), this.ui.paused ? "Paused" : "Rec");

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
      const badge = tab.badge?.(ctx) ?? null;
      return h("button", {
        class: `tab ${this.ui.tab === tab.id ? "is-active" : ""}`,
        title: tab.hint,
        onclick: () => this.selectTab(tab.id),
      },
        h("span", { class: "tab-icon" }, tab.icon),
        h("span", { class: "tab-label" }, tab.label),
        badge !== null ? h("span", { class: "count" }, badge > 999 ? "999+" : String(badge)) : null);
    }));
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
      refresh: () => this.scheduleRender(),
      selectTab: (tab) => this.selectTab(tab),
      selectInstance: (instanceKey, options) => {
        this.ui.selectedInstance = instanceKey;
        this.ui.selectedElement = null;
        if (instanceKey) {
          this.highlightInstance(instanceKey, true);
          if (options?.reveal !== false) this.ui.tab = "inspect";
        }
        this.scheduleRender();
      },
      toast: (message, tone = "info") => {
        this.ui.toast = { message, tone, at: Date.now() };
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
          this.ui.toast = null;
          this.scheduleRender();
        }, TOAST_MS);
        this.renderToast();
      },
      highlightInstance: (instanceKey, pin) => this.highlightInstance(instanceKey, pin ?? false),
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
