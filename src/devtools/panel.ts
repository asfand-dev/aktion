/**
 * `<aktion-devtools>` — the in-page DevTools panel.
 *
 * This file is the shell: the frame (titlebar, section rail, status bar),
 * docking with snap-to-edge, the launcher pill, the command palette, menus,
 * dialogs, toasts, keyboard handling, event ingestion, and the shared services
 * every view uses (highlight overlay, interaction recorder, console tap, vitals
 * monitor). Each section is a pure `(context) → vnodes` function in `views/`.
 *
 * Load-bearing properties:
 *
 *   - **Its own shadow root, its own styles**, starting from `all: initial`,
 *     so the inspector can never be restyled by the app it inspects.
 *   - **Its own renderer.** A small keyed virtual DOM (`core/vdom.ts`), not the
 *     Aktion renderer: the panel must keep working while it debugs a program
 *     whose renderer is broken.
 *   - **A full re-read on every render, minimal DOM work.** Views never cache
 *     what the model says, so the panel cannot lie; the reconciler keeps the
 *     nodes the user is touching, so it does not flicker, lose focus, or reset
 *     scroll either.
 *   - **Dormant when unseen.** Minimised, it keeps ingesting events (so history
 *     is complete when you reopen) but renders only the launcher.
 */

import {
  installDevtoolsHook,
  getDevtoolsHook,
  type AktionDevtoolsHook,
  type DevtoolsAppRecord,
  type DevtoolsEvent,
} from "./hook.js";
import { render, h, autofocus, type Child, type VNode } from "./core/vdom.js";
import { sharedStyles } from "./ui/styles.js";
import { icon, logoMark, type IconName } from "./ui/icons.js";
import { copyText, downloadText, fmtBytes, fmtMs, keys, textarea } from "./ui/kit.js";
import { paletteView, SHORTCUT_GROUPS, type Command } from "./palette.js";
import { bugReportMarkdown, exportSessionJson, importSessionJson, type ImportedSession } from "./session.js";
import {
  defaultUiState,
  loadPersisted,
  savePersisted,
  renderRootElement,
  can,
  type DialogState,
  type DockMode,
  type MenuItem,
  type PersistedUiState,
  type TabId,
  type UiState,
  type ViewContext,
  type ViewDefinition,
} from "./context.js";
import { clearModel, emptyModel, ingest, ingestLog, rootOf, type AppModel } from "./model.js";
import type { CommitRecord, NetworkRule, StateEvent } from "./protocol.js";
import { InspectOverlay, isPanelChrome, type ScanEntry } from "./overlay.js";
import { InteractionRecorder, type RecordedStep } from "./recorder.js";
import { ConsoleCapture } from "./console-capture.js";
import { VitalsMonitor, rate } from "./analysis/vitals.js";
import type { CspViolation } from "./analysis/security.js";
import { PagePush, TooltipController, trackPointer } from "./shell/interactions.js";
import { applySideEffects, releaseSideEffects, THROTTLE_RULES } from "./shell/effects.js";
import { ancestorKeyCandidates, componentNameFromKey } from "./tree.js";
import { VIEWS } from "./views/index.js";

import { DEVTOOLS_UI_VERSION } from "./meta.js";

export { DEVTOOLS_UI_VERSION };

/** Is the event's real target something the user is typing into? */
function isTypingTarget(target: EventTarget | null | undefined): boolean {
  let node = target instanceof Element ? target : null;
  const seen = new Set<Element>();
  while (node && !seen.has(node)) {
    seen.add(node);
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((node as HTMLElement).isContentEditable) return true;
    node = (node as HTMLElement).shadowRoot?.activeElement ?? null;
  }
  return false;
}

const GROUP_LABELS: Record<string, string> = {
  home: "",
  inspect: "Inspect",
  activity: "Activity",
  perf: "Performance",
  quality: "Quality",
  app: "App",
  system: "",
};

const DOCK_ORDER: ReadonlyArray<DockMode> = ["float", "right", "bottom", "left"];
const MIN_W = 380;
const MIN_H = 280;
const SNAP_ZONE = 28;
const TOAST_MS = 2800;

interface Geometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

/* ========================================================================== */
/*  The element                                                                */
/* ========================================================================== */

export class AktionDevtoolsElement extends HTMLElement {
  static readonly tagName = "aktion-devtools";

  private hook: AktionDevtoolsHook | null = null;
  private unsubEvents: (() => void) | null = null;
  private unsubApps: (() => void) | null = null;

  private readonly models = new Map<string, AppModel>();
  private readonly imported = new Map<string, ImportedSession>();
  private selectedAppId: string | null = null;
  private ui: UiState = defaultUiState();

  private readonly overlay = new InspectOverlay();
  private readonly recorder = new InteractionRecorder();
  private readonly consoleCapture = new ConsoleCapture();
  private readonly vitals = new VitalsMonitor();
  private readonly pagePush = new PagePush();
  private tooltips: TooltipController | null = null;

  private root!: ShadowRoot;
  private frameHost!: HTMLElement;
  private layerHost!: HTMLElement;
  private snapEl: HTMLElement | null = null;

  private renderScheduled = false;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly renderTimes: number[] = [];
  private passCache = new Map<string, unknown>();
  private readonly memoCache = new Map<string, { deps: ReadonlyArray<unknown>; value: unknown }>();

  private geometry: Geometry;
  private readonly dockSizes: Record<Exclude<DockMode, "float">, number>;
  private launcherPos: { right: number; bottom: number };
  private restoreGeometry: Geometry | null = null;

  private droppedWhilePaused = 0;
  private readonly cspViolations: CspViolation[] = [];
  private readonly recentCommands: string[] = [];
  private toastSeq = 0;
  private readonly toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private windowKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private cspHandler: ((event: Event) => void) | null = null;
  private schemeQuery: MediaQueryList | null = null;
  private schemeHandler: (() => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private outsidePointer: ((event: PointerEvent) => void) | null = null;
  private layersTimer: ReturnType<typeof setTimeout> | null = null;
  private a11yTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressLauncherClick = false;
  /** `performance.now()` → epoch offset, for converting model times to clock times. */
  readonly epochOffset = Date.now() - (typeof performance !== "undefined" ? performance.now() : 0);

  constructor() {
    super();
    const persisted = loadPersisted();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const width = clamp(persisted.width ?? Math.round(vw * 0.62), MIN_W, Math.max(MIN_W, vw - 24));
    const height = clamp(persisted.height ?? Math.round(vh * 0.72), MIN_H, Math.max(MIN_H, vh - 24));
    this.geometry = {
      width,
      height,
      left: clamp(persisted.left ?? vw - width - 20, 0, Math.max(0, vw - 80)),
      top: clamp(persisted.top ?? vh - height - 20, 0, Math.max(0, vh - 60)),
    };
    this.dockSizes = {
      right: persisted.dockSize?.right ?? Math.round(clamp(vw * 0.42, 420, 760)),
      left: persisted.dockSize?.left ?? Math.round(clamp(vw * 0.42, 420, 760)),
      bottom: persisted.dockSize?.bottom ?? Math.round(clamp(vh * 0.42, 280, 560)),
    };
    this.launcherPos = persisted.launcher ?? { right: 18, bottom: 18 };
    const ui = this.ui;
    if (persisted.tab && VIEWS.some((view) => view.id === persisted.tab)) ui.tab = persisted.tab;
    if (persisted.dock) ui.dock = persisted.dock;
    if (persisted.theme) ui.theme = persisted.theme;
    else if (persisted.light !== undefined) ui.theme = persisted.light ? "light" : "dark";
    if (persisted.compact !== undefined) ui.compact = persisted.compact;
    if (persisted.motion) ui.motion = persisted.motion;
    if (persisted.captureConsole !== undefined) ui.captureConsole = persisted.captureConsole;
    if (persisted.tipsDismissed !== undefined) ui.tipsDismissed = persisted.tipsDismissed;
    if (Array.isArray(persisted.watches)) ui.watches = persisted.watches.slice(0, 20);
    if (persisted.railWide !== undefined) ui.railWide = persisted.railWide;
    if (persisted.showLauncher !== undefined) ui.showLauncher = persisted.showLauncher;
    if (persisted.pushPage !== undefined) ui.pushPage = persisted.pushPage;
    if (persisted.sizes) ui.sizes = { ...persisted.sizes };
    if (persisted.testFormat) ui.testFormat = persisted.testFormat;
    if (persisted.highlightUpdates !== undefined) ui.highlightUpdates = persisted.highlightUpdates;
    if (persisted.minimized) ui.minimized = true;
    ui.collapsed = ui.minimized;
    // Keep on-page tooltips out from under the docked panel.
    this.overlay.setBounds(() => {
      const area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      if (this.ui.minimized || this.hidden || this.ui.dock === "float") return area;
      const rect = this.getBoundingClientRect();
      if (this.ui.dock === "right") area.right = Math.max(120, rect.left);
      else if (this.ui.dock === "left") area.left = Math.min(window.innerWidth - 120, rect.right);
      else if (this.ui.dock === "bottom") area.bottom = Math.max(80, rect.top);
      return area;
    });
  }

  /* ---------------------------------------------------------------------- */
  /*  Lifecycle                                                              */
  /* ---------------------------------------------------------------------- */

  connectedCallback(): void {
    if (!this.root) this.buildSkeleton();
    this.hook = installDevtoolsHook();
    for (const app of this.hook.apps.values()) this.adopt(app);
    if (!this.selectedAppId && this.hook.apps.size > 0) this.selectedAppId = [...this.hook.apps.keys()][0]!;
    // Backfill from the hook's buffer so the timeline is not empty on open.
    for (const event of this.hook.buffer) ingest(this.ensureModel(event.appId), event, true);
    this.unsubEvents = this.hook.subscribe((event) => this.onEvent(event));
    this.unsubApps = this.hook.subscribeApps((action, app) => this.onApp(action, app));
    this.discoverApps();
    this.syncConsoleCapture();
    this.vitals.start(() => this.onVitals());
    this.vitals.setFrameSampling(!this.ui.minimized);
    this.bindWindow();
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
    this.vitals.stop();
    this.overlay.destroy();
    this.pagePush.release();
    releaseSideEffects(this.effectState, this.currentApp());
    this.tooltips?.destroy();
    this.tooltips = null;
    this.unbindWindow();
    for (const timer of this.toastTimers.values()) clearTimeout(timer);
    this.toastTimers.clear();
    if (this.renderTimer) clearTimeout(this.renderTimer);
    if (this.layersTimer) clearTimeout(this.layersTimer);
    if (this.a11yTimer) clearTimeout(this.a11yTimer);
    this.persist();
  }

  /* ---- public controller surface ---- */

  /** Show the panel (restoring it from the launcher). */
  open(): void {
    this.hidden = false;
    this.setMinimized(false);
  }

  /** Collapse to the launcher (or hide entirely when the launcher is off). */
  close(): void {
    this.overlay.stopPicking();
    this.overlay.clear();
    this.setMinimized(true);
  }

  toggle(): void {
    if (this.ui.minimized || this.hidden) this.open();
    else this.close();
  }

  selectApp(id: string): void {
    if (id === this.selectedAppId) return;
    this.selectedAppId = id;
    this.ui.selectedCommitId = null;
    this.ui.selectedInstance = null;
    this.ui.selectedElement = null;
    this.ui.selectedRequest = null;
    this.ui.timeTravel = null;
    this.ui.flameSelected = null;
    this.memoCache.clear();
    this.overlay.clear();
    const app = this.currentApp();
    if (app && can(app, "getNetworkRules")) {
      try { this.ui.rules = app.getNetworkRules(); } catch { /* older record */ }
    }
    this.scheduleRender();
  }

  selectTab(tab: TabId): void {
    if (!VIEWS.some((view) => view.id === tab)) return;
    this.ui.tab = tab;
    this.ui.menu = null;
    this.persist();
    this.scheduleRender();
  }

  /** Change the dock position. */
  setDock(dock: DockMode): void {
    this.ui.dock = dock;
    this.restoreGeometry = null;
    this.persist();
    this.scheduleRender();
  }

  /** The derived model for an app (or the selected one). */
  getModel(appId?: string): AppModel | null {
    const id = appId ?? this.selectedAppId;
    if (!id) return null;
    return this.imported.get(id)?.model ?? this.models.get(id) ?? null;
  }

  /** The panel's view state (tests and embedders). */
  getUiState(): UiState {
    return this.ui;
  }

  /** Render synchronously now — for tests and embedders that must observe the result immediately. */
  flush(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.renderScheduled = false;
    this.renderNow();
  }

  /** Load an exported session file into the panel for offline inspection. */
  importSession(text: string, fileName?: string): string {
    const session = importSessionJson(text, fileName);
    const id = `import-${this.imported.size + 1}`;
    this.imported.set(id, session);
    if (session.steps.length > 0) this.recorder.load(session.steps);
    this.selectApp(id);
    this.toast(`Imported ${session.label}`, "good");
    return id;
  }

  /* ---------------------------------------------------------------------- */
  /*  Ingestion                                                              */
  /* ---------------------------------------------------------------------- */

  private ensureModel(appId: string): AppModel {
    let model = this.models.get(appId);
    if (!model) {
      model = emptyModel();
      this.models.set(appId, model);
    }
    return model;
  }

  private adopt(app: DevtoolsAppRecord): void {
    const model = this.ensureModel(app.id);
    try {
      model.state = app.getState();
    } catch {
      /* mid-teardown */
    }
    if (app.id === this.selectedAppId || !this.selectedAppId) {
      if (can(app, "getNetworkRules")) {
        try { this.ui.rules = app.getNetworkRules(); } catch { /* older record */ }
      }
    }
  }

  /** Ask every `<aktion-app>` on the page to register (late attach). */
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
      const next = [...(this.hook?.apps.keys() ?? [])].find((id) => id !== app.id) ?? null;
      this.selectedAppId = next;
    }
    this.scheduleRender();
  }

  private onEvent(event: DevtoolsEvent): void {
    if (this.ui.paused) {
      this.droppedWhilePaused += 1;
      if (this.droppedWhilePaused % 25 === 1) this.scheduleRender();
      return;
    }
    const model = this.ensureModel(event.appId);
    ingest(model, event, false);
    const mine = event.appId === this.selectedAppId;
    if (mine && event.kind === "commit") this.afterCommit(event, model);
    if (mine && event.kind === "state") this.checkBreakOnChange(event);
    if (mine && event.kind === "route" && this.recorder.isRecording) {
      this.recorder.addStep({ type: "navigate", value: event.to, label: `navigate to ${event.to}` });
    }
    this.scheduleRender();
  }

  private afterCommit(commit: CommitRecord, model: AppModel): void {
    if (this.ui.flashOnCommit) this.flashApp();
    if (this.ui.highlightUpdates && !this.ui.minimized) this.scanCommit(commit, model);
    if (this.ui.perfMarks) this.markCommit(commit);
    if (this.selectedAppId) this.recordProgramVersion(this.selectedAppId);
    // Overlays pinned to elements (audit markers, tab order) move with layout.
    if (this.layersTimer) clearTimeout(this.layersTimer);
    this.layersTimer = setTimeout(() => {
      this.layersTimer = null;
      this.overlay.refreshLayers();
    }, 120);
    if (this.ui.a11yAuto && this.ui.a11yRun) {
      if (this.a11yTimer) clearTimeout(this.a11yTimer);
      this.a11yTimer = setTimeout(() => {
        this.a11yTimer = null;
        this.ui.a11yRequested = true;
        this.scheduleRender();
      }, 700);
    }
  }

  /**
   * Render scan: outline what actually re-rendered, with a running count, and
   * mark the renders a forced full render caused although nothing the
   * component reads changed — the "unnecessary render" React Scan made famous.
   */
  private scanCommit(commit: CommitRecord, model: AppModel): void {
    const app = this.currentApp();
    if (!can(app, "nodeForInstance")) return;
    const entries: ScanEntry[] = [];
    for (const record of commit.components) {
      if (record.phase === "memo") continue;
      if (entries.length >= 200) break;
      const node = app.nodeForInstance(record.instanceKey);
      if (!node) continue;
      entries.push({
        element: node,
        name: record.name,
        count: model.renderCounts.get(record.instanceKey) ?? 1,
        wasted: record.reason === "full render",
      });
    }
    this.overlay.scanRender(entries);
  }

  private markCommit(commit: CommitRecord): void {
    if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
    try {
      const label = commit.initial
        ? "aktion: initial mount"
        : `aktion: commit #${commit.commitId}${commit.changedPaths.length ? ` (${commit.changedPaths.join(", ")})` : ""}`;
      performance.measure(label, { start: commit.startTime, duration: commit.duration });
    } catch {
      /* the options form of measure is not everywhere */
    }
  }

  /**
   * Break into the debugger when a watched atom changes. The panel cannot pause
   * the runtime, but a `debugger` statement here stops the world inside the
   * state flush, one frame below the write, with the stack that caused it.
   */
  private checkBreakOnChange(event: StateEvent): void {
    if (this.ui.breakOnChange.size === 0) return;
    const hit = event.changedPaths.find((path) => this.ui.breakOnChange.has(path) || this.ui.breakOnChange.has(rootOf(path)));
    if (!hit) return;
    const value = event.snapshot[rootOf(hit)];
    // eslint-disable-next-line no-console
    console.warn(`[aktion-devtools] break on change: $${hit} =`, value);
    // eslint-disable-next-line no-debugger
    debugger;
  }

  /** Remember each distinct program version, so an edit that breaks the app can be undone. */
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
    if (model.programHistory.length > 30) model.programHistory.shift();
  }

  private syncConsoleCapture(): void {
    if (this.ui.captureConsole && !this.consoleCapture.active) {
      this.consoleCapture.start((entry) => {
        const id = this.selectedAppId;
        if (!id || this.imported.has(id)) return;
        ingestLog(this.ensureModel(id), { ...entry, text: entry.args.join(" "), count: 1 });
        this.scheduleRender();
      });
    } else if (!this.ui.captureConsole && this.consoleCapture.active) {
      this.consoleCapture.stop();
    }
  }

  private onVitals(): void {
    // The status bar shows FPS; views that chart vitals re-read on render.
    if (!this.ui.minimized) this.scheduleRender();
  }

  /* ---------------------------------------------------------------------- */
  /*  Rendering                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Coalesce renders. The first render after a quiet period happens on the next
   * microtask (so a test that flushes microtasks sees it, and a click feels
   * instant); a burst — an effect ticking at 60Hz, a stream of log lines — is
   * throttled to about 20 renders a second so the panel never becomes the
   * bottleneck it is there to find.
   */
  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    while (this.renderTimes.length > 0 && now - this.renderTimes[0]! > 500) this.renderTimes.shift();
    if (this.renderTimes.length >= 12) {
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.renderNow();
      }, 50);
    } else {
      queueMicrotask(() => this.renderNow());
    }
  }

  private renderNow(): void {
    this.renderScheduled = false;
    // A render queued just before the panel was removed must not run: it would
    // re-push the page and re-install overlays for a panel that is gone.
    if (!this.root || !this.isConnected) return;
    this.renderTimes.push(typeof performance !== "undefined" ? performance.now() : Date.now());
    this.syncConsoleCapture();
    this.passCache = new Map();
    if (!this.ui.paused) this.droppedWhilePaused = 0;
    this.applyHost();
    const ctx = this.context();
    try {
      render(this.frameHost, this.ui.minimized || this.hidden ? null : this.renderFrame(ctx));
    } catch (err) {
      // A view that throws must not take the panel with it — the panel's whole
      // point is still being there when something is broken.
      // eslint-disable-next-line no-console
      console.error("[aktion-devtools] render failed", err);
      this.renderFallback(err);
    }
    try {
      render(this.layerHost, this.renderLayer(ctx));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion-devtools] overlay render failed", err);
    }
    try {
      applySideEffects(this.effectState, ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion-devtools] side effects failed", err);
    }
    this.applyPagePush();
  }

  private readonly effectState = {};

  private renderFallback(err: unknown): void {
    try {
      render(this.frameHost, h("div", { class: "dt" },
        this.renderTitlebar(this.context()),
        h("div", { class: "empty" },
          h("div", { class: "empty-art" }, icon("bug", { size: 22 })),
          h("div", { class: "empty-title" }, "This view hit an error while rendering."),
          h("div", { class: "empty-body mono" }, String(err instanceof Error ? err.message : err)),
          h("div", { class: "empty-actions" },
            h("button", { class: "btn", type: "button", onClick: () => this.selectTab("overview") }, "Back to Overview")))));
    } catch {
      /* nothing more to do */
    }
  }

  private buildSkeleton(): void {
    this.root = this.attachShadow({ mode: "open" });
    const css = [sharedStyles, ...VIEWS.map((view) => view.css ?? "")].join("\n");
    let adopted = false;
    try {
      if (typeof CSSStyleSheet === "function" && "replaceSync" in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        (this.root as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [sheet];
        adopted = true;
      }
    } catch {
      adopted = false;
    }
    if (!adopted) {
      const style = document.createElement("style");
      style.textContent = css;
      this.root.appendChild(style);
    }
    this.frameHost = document.createElement("div");
    this.frameHost.className = "dt-frame-host";
    this.frameHost.style.cssText = "width:100%;height:100%;pointer-events:auto";
    this.layerHost = document.createElement("div");
    this.layerHost.className = "dt-layer";
    this.root.append(this.frameHost, this.layerHost);
    this.tooltips = new TooltipController(this.root, this.layerHost);
    this.root.addEventListener("keydown", (event) => this.onRootKeyDown(event as KeyboardEvent));
    this.applyHost();
  }

  /** Reflect dock, theme, density, and geometry onto the host element. */
  private applyHost(): void {
    const ui = this.ui;
    const theme = ui.theme === "system"
      ? (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : ui.theme;
    ui.light = theme === "light";
    ui.collapsed = ui.minimized;
    this.setAttr("data-theme", theme);
    this.setAttr("data-dock", ui.dock);
    this.setAttr("data-density", ui.compact ? "compact" : "comfortable");
    this.setAttr("data-motion", ui.motion === "system" ? null : ui.motion);
    this.setAttr("data-minimized", ui.minimized || this.hidden ? "" : null);
    const style = this.style;
    style.pointerEvents = "none";
    if (ui.minimized || this.hidden) {
      style.width = "0px";
      style.height = "0px";
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (ui.dock === "float") {
      const g = this.geometry;
      g.width = clamp(g.width, MIN_W, Math.max(MIN_W, vw - 8));
      g.height = clamp(g.height, MIN_H, Math.max(MIN_H, vh - 8));
      g.left = clamp(g.left, -g.width + 120, vw - 120);
      g.top = clamp(g.top, 0, vh - 40);
      Object.assign(style, { left: `${g.left}px`, top: `${g.top}px`, right: "", bottom: "", width: `${g.width}px`, height: `${g.height}px` });
    } else if (ui.dock === "bottom") {
      const size = clamp(this.dockSizes.bottom, MIN_H - 40, Math.max(MIN_H, vh - 80));
      Object.assign(style, { left: "0px", right: "0px", bottom: "0px", top: "", width: "", height: `${size}px` });
    } else {
      const size = clamp(this.dockSizes[ui.dock], MIN_W - 40, Math.max(MIN_W, vw - 120));
      Object.assign(style, ui.dock === "right"
        ? { right: "0px", top: "0px", bottom: "0px", left: "", width: `${size}px`, height: "" }
        : { left: "0px", top: "0px", bottom: "0px", right: "", width: `${size}px`, height: "" });
    }
  }

  private setAttr(name: string, value: string | null): void {
    if (value === null) {
      if (this.hasAttribute(name)) this.removeAttribute(name);
    } else if (this.getAttribute(name) !== value) {
      this.setAttribute(name, value);
    }
  }

  private applyPagePush(): void {
    const ui = this.ui;
    if (ui.dock === "float" || !ui.pushPage || ui.minimized || this.hidden) {
      this.pagePush.release();
      return;
    }
    this.pagePush.apply(ui.dock, ui.dock === "bottom" ? this.dockSizes.bottom : this.dockSizes[ui.dock]);
  }

  /* ---- the frame ---- */

  private currentApp(): DevtoolsAppRecord | null {
    if (!this.selectedAppId || !this.hook || this.imported.has(this.selectedAppId)) return null;
    return this.hook.apps.get(this.selectedAppId) ?? null;
  }

  private currentView(): ViewDefinition {
    return VIEWS.find((view) => view.id === this.ui.tab) ?? VIEWS[0]!;
  }

  private renderFrame(ctx: ViewContext): VNode {
    const view = this.currentView();
    let body: Child;
    try {
      body = view.render(ctx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[aktion-devtools] the ${view.label} view failed`, err);
      const message = err instanceof Error ? err.message : String(err);
      body = h("div", { class: "empty", "data-dt": "view-error" },
        h("div", { class: "empty-art" }, icon("bug", { size: 22 })),
        h("div", { class: "empty-title" }, `The ${view.label} view hit an error while rendering.`),
        h("div", { class: "empty-body mono" }, message),
        h("div", { class: "empty-actions" },
          view.id !== "overview" ? h("button", { class: "btn", type: "button", onClick: () => this.selectTab("overview") }, "Back to Overview") : null,
          h("button", { class: "btn is-ghost", type: "button", onClick: () => { void copyText(err instanceof Error && err.stack ? err.stack : message).then((ok) => this.toast(ok ? "Copied the error" : "Copy failed", ok ? "good" : "bad")); } }, "Copy error")));
    }
    // Every part of the chrome fails on its own: a status bar that trips over
    // corrupt data must not take the rail (and so the way out) with it.
    const part = (name: string, draw: () => VNode, fallback: () => VNode): VNode => {
      try {
        return draw();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[aktion-devtools] the ${name} failed to render`, err);
        return fallback();
      }
    };
    return h(
      "div",
      { class: "dt", role: "region", "aria-label": "Aktion DevTools", "data-dt": "panel" },
      part("title bar", () => this.renderTitlebar(ctx), () => h("header", { class: "dt-titlebar" }, logoMark(18), h("span", { class: "grow" }))),
      h("div", { class: "dt-main" },
        part("sidebar", () => this.renderRail(ctx), () => h("nav", { class: "dt-rail", "aria-label": "Sections" })),
        h("main", { class: "dt-content", "aria-label": view.label },
          h("div", { class: "dt-view", key: view.id, "data-view": view.id }, body),
          part("notifications", () => this.renderToasts(), () => h("div", { class: "toasts" })))),
      part("status bar", () => this.renderStatusBar(ctx), () => h("footer", { class: "dt-statusbar", "data-dt": "statusbar" })),
      ...this.renderEdges(),
    );
  }

  private renderTitlebar(ctx: ViewContext): VNode {
    const view = this.currentView();
    const app = ctx.app;
    const importedSession = this.selectedAppId ? this.imported.get(this.selectedAppId) : undefined;
    const label = importedSession?.label ?? app?.label ?? "No app";
    const health = this.health(ctx);
    const picking = this.overlay.isPicking;
    return h(
      "header",
      {
        class: "dt-titlebar",
        "data-dt": "titlebar",
        onPointerDown: (event: PointerEvent) => this.beginMove(event),
        onDblClick: (event: MouseEvent) => {
          if ((event.target as Element).closest("button, input, select")) return;
          this.toggleMaximize();
        },
      },
      h("div", { class: "dt-brand" }, logoMark(18), ctx.width() > 640 ? h("span", { class: "dt-brand-name" }, "Aktion ", h("span", {}, "DevTools")) : null),
      h("span", { class: "dt-sep-v", "aria-hidden": "true" }),
      h("button", {
        type: "button",
        class: "dt-appswitch",
        "data-dt": "app-switch",
        "data-tip": "Inspected app — click to switch",
        "aria-haspopup": "menu",
        onClick: (event: MouseEvent) => this.openAppMenu(event),
      },
        h("span", { class: ["dt-status-dot", `t-${health.tone}`, app ? "is-live" : ""] }),
        h("span", { class: "label" }, label),
        icon("chevronDown", { size: 12 })),
      h("div", { class: "dt-crumb" },
        icon(view.icon, { size: 14 }),
        h("span", { class: "dt-crumb-title" }, view.label),
        ctx.width() > 1000 ? h("span", { class: "dt-crumb-hint" }, `· ${view.hint}`) : null),
      h("span", { class: "grow" }),
      h("button", {
        type: "button",
        class: ["ibtn", picking ? "is-on" : ""],
        "aria-label": picking ? "Cancel element picker" : "Pick an element on the page",
        "data-tip": picking ? "Cancel picker" : "Pick an element",
        "data-kbd": "⇧ ⌥ C",
        "data-dt": "pick",
        "aria-pressed": picking,
        onClick: () => this.togglePicker(),
      }, icon("pick", { size: 16 })),
      h("button", {
        type: "button",
        class: ["dt-rec", this.ui.paused ? "is-paused" : ""],
        "data-dt": "record",
        "data-tip": this.ui.paused
          ? `Paused${this.droppedWhilePaused ? ` — ${this.droppedWhilePaused} events ignored` : ""}. Click to resume.`
          : "Recording runtime events — click to pause",
        "aria-pressed": !this.ui.paused,
        onClick: () => this.togglePause(),
      },
        h("span", { class: "rec-dot" }),
        this.ui.paused ? (this.droppedWhilePaused ? `Paused · ${this.droppedWhilePaused}` : "Paused") : "Live"),
      ctx.width() > 720
        ? h("button", {
            type: "button",
            class: "dt-cmdk",
            "data-dt": "open-palette",
            "aria-label": "Open the command palette",
            onClick: () => this.openPalette(),
          }, icon("search", { size: 13 }), h("span", { class: "grow" }, "Search or run a command…"), keys("⌘ K"))
        : h("button", { type: "button", class: "ibtn", "aria-label": "Command palette", "data-tip": "Command palette", "data-kbd": "⌘ K", onClick: () => this.openPalette() }, icon("command", { size: 15 })),
      h("span", { class: "dt-sep-v", "aria-hidden": "true" }),
      h("button", {
        type: "button",
        class: "ibtn",
        "aria-label": "Panel theme",
        "data-tip": `Theme: ${this.ui.theme}`,
        "data-dt": "theme-toggle",
        onClick: () => {
          const next = this.ui.theme === "dark" ? "light" : this.ui.theme === "light" ? "system" : "dark";
          this.ui.theme = next;
          this.persist();
          this.toast(`Panel theme: ${next}`);
          this.scheduleRender();
        },
      }, icon(this.ui.light ? "sun" : "moon", { size: 15 })),
      h("button", {
        type: "button",
        class: "ibtn",
        "aria-label": "Dock position",
        "data-tip": `Dock: ${this.ui.dock}`,
        "data-dt": "dock-menu",
        "aria-haspopup": "menu",
        onClick: (event: MouseEvent) => this.openDockMenu(event),
      }, icon(this.ui.dock === "float" ? "dockFloat" : this.ui.dock === "right" ? "dockRight" : this.ui.dock === "left" ? "dockLeft" : "dockBottom", { size: 15 })),
      h("button", {
        type: "button",
        class: "ibtn",
        "aria-label": "Minimise to the launcher",
        "data-tip": "Minimise",
        "data-kbd": "⇧ ⌥ D",
        "data-dt": "minimize",
        onClick: () => this.close(),
      }, icon("minus", { size: 15 })),
    );
  }

  private renderRail(ctx: ViewContext): VNode {
    const items: Child[] = [];
    let group = "";
    const main = VIEWS.filter((view) => view.group !== "system");
    main.forEach((view, index) => {
      if (view.group !== group) {
        if (group !== "") items.push(h("div", { key: `sep-${view.group}`, class: "dt-rail-sep", role: "separator" }));
        group = view.group;
        const label = GROUP_LABELS[view.group];
        if (label && this.ui.railWide) items.push(h("div", { key: `lbl-${view.group}`, class: "dt-rail-label" }, label));
      }
      items.push(this.railItem(ctx, view, index < 9 ? `⌥ ${index + 1}` : undefined));
    });
    items.push(h("div", { key: "spacer", class: "dt-rail-spacer" }));
    for (const view of VIEWS.filter((v) => v.group === "system")) items.push(this.railItem(ctx, view));
    items.push(h("button", {
      key: "rail-toggle",
      type: "button",
      class: "dt-rail-item",
      "aria-label": this.ui.railWide ? "Collapse the sidebar" : "Expand the sidebar",
      "data-tip": this.ui.railWide ? "Collapse sidebar" : "Show labels",
      onClick: () => {
        this.ui.railWide = !this.ui.railWide;
        this.persist();
        this.scheduleRender();
      },
    }, icon(this.ui.railWide ? "chevronLeft" : "chevronRight", { size: 15 }), h("span", { class: "name" }, "Collapse")));
    return h("nav", { class: ["dt-rail", this.ui.railWide ? "is-wide" : ""], "aria-label": "Sections", role: "tablist", "aria-orientation": "vertical" }, ...items);
  }

  private railItem(ctx: ViewContext, view: ViewDefinition, shortcut?: string): VNode {
    let badge: { value: number | string; tone?: string } | null = null;
    try {
      badge = view.badge?.(ctx) ?? null;
    } catch {
      badge = null;
    }
    const active = this.ui.tab === view.id;
    return h(
      "button",
      {
        key: view.id,
        type: "button",
        role: "tab",
        class: ["dt-rail-item", active ? "is-active" : ""],
        "aria-selected": active,
        "aria-label": `${view.label}${badge ? ` (${badge.value})` : ""}`,
        "data-tip": this.ui.railWide ? undefined : `${view.label} — ${view.hint}`,
        "data-kbd": this.ui.railWide ? undefined : shortcut,
        "data-tab": view.id,
        "data-dt": `rail-${view.id}`,
        onClick: () => this.selectTab(view.id),
      },
      icon(view.icon, { size: 17 }),
      h("span", { class: "name" }, view.label),
      badge && badge.value !== 0 && badge.value !== ""
        ? h("span", { class: ["dt-rail-badge", badge.tone && badge.tone !== "grey" ? `t-${badge.tone}` : ""] }, typeof badge.value === "number" && badge.value > 99 ? "99+" : String(badge.value))
        : null,
    );
  }

  /** Overall health for the status dot and launcher: errors → red, warnings → amber. */
  private health(ctx: ViewContext): { tone: "green" | "amber" | "red" | "grey"; errors: number; warnings: number } {
    const model = ctx.model;
    if (!ctx.app && !this.imported.has(this.selectedAppId ?? "")) return { tone: "grey", errors: 0, warnings: 0 };
    return ctx.cache("health", () => {
      let errors = model.errors.length;
      let warnings = 0;
      for (const log of model.logs) {
        if (log.level === "error") errors += log.count;
        else if (log.level === "warn") warnings += log.count;
      }
      let failed = 0;
      for (const request of model.network) {
        if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 500) failed += 1;
      }
      const diagnostics = can(ctx.app, "getDiagnostics") ? ctx.app.getDiagnostics().filter((d) => d.severity === "error").length : 0;
      errors += diagnostics;
      const tone = errors + failed > 0 ? "red" : warnings > 0 ? "amber" : "green";
      return { tone, errors: errors + failed, warnings };
    });
  }

  private renderStatusBar(ctx: ViewContext): VNode {
    const model = ctx.model;
    const vitals = ctx.vitals;
    const health = this.health(ctx);
    const last = model.commits[model.commits.length - 1];
    const pending = ctx.cache("pending", () => model.network.filter((r) => r.phase === "pending").length);
    const fps = vitals.fps;
    const fpsTone = fps === null ? "" : fps >= 55 ? "t-green" : fps >= 30 ? "t-amber" : "t-red";
    const inp = vitals.inp;
    const inpRating = rate("inp", inp?.value);
    // Narrow panels drop the lowest-value items first (version, then heap)
    // rather than clipping the errors count off the right edge.
    const panelWidth = ctx.width() + (this.ui.railWide ? 176 : 46);
    const roomy = panelWidth >= 680;
    const item = (content: Child[], options: { tip?: string; tone?: string; onClick?: () => void; testid?: string } = {}): VNode =>
      h(options.onClick ? "button" : "span", {
        type: options.onClick ? "button" : undefined,
        class: ["dt-sb-item", options.tone ?? ""],
        "data-tip": options.tip,
        "data-dt": options.testid,
        onClick: options.onClick,
      }, ...content);
    return h(
      "footer",
      { class: "dt-statusbar", "data-dt": "statusbar", role: "status", "aria-live": "off" },
      item([icon("zap", { size: 11 }), h("b", {}, String(model.totals.commits)), h("span", {}, "commits"), last ? [h("span", { class: "t4" }, "·"), h("b", {}, fmtMs(last.duration))] : null], {
        tip: "Commits this session · last commit duration",
        onClick: () => this.selectTab("profiler"),
        testid: "sb-commits",
      }),
      fps !== null ? item([icon("activity", { size: 11 }), h("b", {}, String(fps)), h("span", {}, "fps")], { tip: `Frame rate (${vitals.droppedFrames} long frames)`, tone: fpsTone, onClick: () => { this.ui.profilerView = "vitals"; this.selectTab("profiler"); } }) : null,
      inp ? item([h("span", {}, "INP"), h("b", {}, fmtMs(inp.value))], { tip: `Interaction to Next Paint — ${inpRating.replace("-", " ")}`, tone: inpRating === "good" ? "t-green" : inpRating === "poor" ? "t-red" : "t-amber", onClick: () => { this.ui.profilerView = "vitals"; this.selectTab("profiler"); } }) : null,
      item([icon("network", { size: 11 }), h("b", {}, String(model.totals.network)), pending > 0 ? [h("span", { class: "t4" }, "·"), h("b", {}, String(pending)), h("span", {}, "pending")] : h("span", {}, "requests")], {
        tip: "HTTP requests this session",
        onClick: () => this.selectTab("network"),
      }),
      vitals.heap && panelWidth >= 560 ? item([icon("cpu", { size: 11 }), h("b", {}, fmtBytes(vitals.heap.used))], { tip: "JS heap in use (whole page)" }) : null,
      h("span", { class: "grow" }),
      health.errors > 0
        ? item([icon("error", { size: 11 }), h("b", {}, String(health.errors))], { tip: "Errors — open the Console", tone: "t-red", onClick: () => { this.ui.logLevels = new Set(["error"]); this.selectTab("console"); }, testid: "sb-errors" })
        : null,
      health.warnings > 0
        ? item([icon("warning", { size: 11 }), h("b", {}, String(health.warnings))], { tip: "Warnings — open the Console", tone: "t-amber", onClick: () => { this.ui.logLevels = new Set(["warn"]); this.selectTab("console"); } })
        : null,
      this.recorder.isRecording ? item([h("span", { class: "rec-dot", style: { width: "7px", height: "7px", borderRadius: "50%", background: "var(--dt-red)" } }), h("span", {}, "Recording test")], { tone: "t-red", onClick: () => { this.ui.testPane = "record"; this.selectTab("test"); } }) : null,
      roomy || (health.errors === 0 && health.warnings === 0 && !this.recorder.isRecording)
        ? item(roomy
            ? [h("span", {}, `Aktion ${ctx.hook.libraryVersion}`), h("span", { class: "t4" }, "·"), h("span", {}, `protocol ${ctx.hook.protocolVersion}`)]
            : [h("span", {}, `v${ctx.hook.libraryVersion}`)], { tip: `Aktion ${ctx.hook.libraryVersion} · DevTools protocol ${ctx.hook.protocolVersion}` })
        : null,
    );
  }

  private renderEdges(): VNode[] {
    const dock = this.ui.dock;
    const edges: string[] = dock === "float" ? ["n", "s", "e", "w", "ne", "nw", "se", "sw"] : dock === "right" ? ["w"] : dock === "left" ? ["e"] : ["n"];
    return edges.map((edge) => h("div", {
      key: `edge-${edge}`,
      class: ["dt-edge", edge],
      "aria-hidden": "true",
      onPointerDown: (event: PointerEvent) => this.beginResize(event, edge),
    }));
  }

  private renderToasts(): VNode {
    return h("div", { class: "toasts", role: "status", "aria-live": "polite", "data-dt": "toasts" },
      ...this.ui.toasts.map((toast) => h("div", { key: toast.id, class: ["toast", `t-${toast.tone}`] },
        icon(toast.tone === "good" ? "checkCircle" : toast.tone === "bad" ? "error" : toast.tone === "warn" ? "warning" : "info", { size: 14 }),
        h("span", { class: "grow" }, toast.message),
        toast.action
          ? h("button", { type: "button", class: "btn is-sm toast-action", onClick: () => { toast.action!.run(); this.dismissToast(toast.id); } }, toast.action.label)
          : null,
        h("button", { type: "button", class: "ibtn is-sm", "aria-label": "Dismiss", onClick: () => this.dismissToast(toast.id) }, icon("close", { size: 11 })))));
  }

  /* ---- floating layer: launcher, palette, menus, dialogs ---- */

  private renderLayer(ctx: ViewContext): Child {
    const out: Child[] = [];
    if ((this.ui.minimized || this.hidden) && this.ui.showLauncher) out.push(this.renderLauncher(ctx));
    if (this.ui.paletteOpen && !this.ui.minimized) {
      out.push(h("div", { key: "palette" }, paletteView({
        query: this.ui.paletteQuery,
        index: this.ui.paletteIndex,
        commands: this.paletteCommands(ctx),
        onQuery: (query) => { this.ui.paletteQuery = query; this.ui.paletteIndex = 0; this.scheduleRender(); },
        onIndex: (index) => { this.ui.paletteIndex = index; this.scheduleRender(); },
        onRun: (command) => this.runCommand(command),
        onClose: () => this.closePalette(),
      })));
    }
    if (this.ui.shortcutsOpen && !this.ui.minimized) out.push(this.renderShortcuts());
    if (this.ui.dialog && !this.ui.minimized) out.push(this.renderDialog(this.ui.dialog));
    if (this.ui.menu) out.push(this.renderMenu());
    return out;
  }

  private renderLauncher(ctx: ViewContext): VNode {
    const health = this.health(ctx);
    return h("button", {
      key: "launcher",
      type: "button",
      class: "dt-launcher",
      "data-dt": "launcher",
      "aria-label": "Open Aktion DevTools",
      "data-tip": "Open DevTools",
      "data-kbd": "⇧ ⌥ D",
      style: { right: `${this.launcherPos.right}px`, bottom: `${this.launcherPos.bottom}px` },
      onPointerDown: (event: PointerEvent) => this.beginLauncherDrag(event),
      // `click`, not only pointer tracking: keyboard activation and screen
      // readers dispatch a click, never a pointer sequence.
      onClick: () => {
        if (this.suppressLauncherClick) {
          this.suppressLauncherClick = false;
          return;
        }
        this.open();
      },
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault();
        this.openMenu(event, [
          { label: "Open DevTools", icon: "panel", run: () => this.open() },
          { label: "Pick an element", icon: "pick", kbd: "⇧⌥C", run: () => { this.open(); this.togglePicker(); } },
          { kind: "separator", label: "" },
          { label: "Hide the launcher", icon: "eyeOff", run: () => { this.ui.showLauncher = false; this.persist(); this.toast("Launcher hidden — Shift+Alt+D reopens DevTools"); } },
        ]);
      },
    },
      logoMark(20),
      h("span", {}, "DevTools"),
      health.errors > 0 ? h("span", { class: "count t-red" }, icon("error", { size: 12 }), String(health.errors)) : null,
      health.errors === 0 && health.warnings > 0 ? h("span", { class: "count t-amber" }, icon("warning", { size: 12 }), String(health.warnings)) : null,
      this.recorder.isRecording ? h("span", { class: "count t-red" }, icon("record", { size: 10 }), "REC") : null);
  }

  private renderShortcuts(): VNode {
    return h("div", {
      key: "shortcuts",
      class: "scrim",
      "data-dt": "shortcuts",
      onPointerDown: (event: PointerEvent) => { if (event.target === event.currentTarget) { this.ui.shortcutsOpen = false; this.scheduleRender(); } },
    },
      h("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts", style: { width: "min(640px, calc(100vw - 32px))" } },
        h("div", { class: "dialog-head" }, icon("keyboard", { size: 18 }), h("div", { class: "dialog-title" }, "Keyboard shortcuts"), h("span", { class: "grow" }),
          h("button", { type: "button", class: "ibtn", "aria-label": "Close", ref: autofocus(), onClick: () => { this.ui.shortcutsOpen = false; this.scheduleRender(); } }, icon("close", { size: 15 }))),
        h("div", { class: "dialog-body" },
          h("div", { class: "shortcut-grid" },
            ...SHORTCUT_GROUPS.flatMap((group) => [
              h("div", { class: "shortcut-group" }, group.title),
              ...group.items.flatMap(([combo, what]) => [
                h("span", {}, what),
                h("span", { class: "keys" }, ...combo.split(/\s{2,}/).map((part, i) => [i > 0 ? h("span", { class: "t3" }, " or ") : null, keys(part)])),
              ]),
            ])))));
  }

  private renderDialog(dialog: DialogState): VNode {
    const close = (): void => this.closeDialog();
    return h("div", {
      key: "dialog",
      class: "scrim",
      "data-dt": "dialog",
      onPointerDown: (event: PointerEvent) => { if (event.target === event.currentTarget) close(); },
      onKeyDown: (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); } },
    },
      h("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": dialog.title, style: dialog.width ? { width: `min(${dialog.width}px, calc(100vw - 32px))` } : undefined },
        h("div", { class: "dialog-head" },
          dialog.icon ? icon(dialog.icon, { size: 18 }) : null,
          h("div", { class: "dialog-title" }, dialog.title),
          h("span", { class: "grow" }),
          h("button", { type: "button", class: "ibtn", "aria-label": "Close", onClick: close }, icon("close", { size: 15 }))),
        h("div", { class: "dialog-body" }, dialog.body()),
        dialog.actions ? h("div", { class: "dialog-foot" }, ...dialog.actions()) : null));
  }

  private renderMenu(): VNode {
    const menu = this.ui.menu!;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estimatedHeight = menu.items.length * 29 + 12;
    const left = Math.max(6, Math.min(menu.x, vw - 236));
    const top = menu.y + estimatedHeight > vh - 6 ? Math.max(6, vh - estimatedHeight - 6) : menu.y;
    const actionable = menu.items.filter((item) => (item.kind ?? "item") === "item" && !item.disabled);
    return h("div", {
      key: "menu",
      class: "menu",
      role: "menu",
      "data-dt": "menu",
      style: { left: `${left}px`, top: `${top}px` },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          menu.index = (menu.index + delta + actionable.length) % Math.max(1, actionable.length);
          this.scheduleRender();
        } else if (event.key === "Enter") {
          event.preventDefault();
          const item = actionable[menu.index];
          if (item) { this.closeMenu(); item.run?.(); }
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.closeMenu();
        }
      },
    },
      ...menu.items.map((item, i) => {
        if (item.kind === "separator") return h("div", { key: `sep${i}`, class: "menu-sep", role: "separator" });
        if (item.kind === "label") return h("div", { key: `lbl${i}`, class: "menu-label" }, item.label);
        const index = actionable.indexOf(item);
        return h("button", {
          key: `item${i}`,
          type: "button",
          role: item.checked !== undefined ? "menuitemradio" : "menuitem",
          "aria-checked": item.checked,
          class: ["menu-item", item.danger ? "is-danger" : "", index === menu.index ? "is-active" : "", item.checked ? "is-checked" : ""],
          disabled: item.disabled || undefined,
          ref: index === 0 ? autofocus() : undefined,
          onMouseEnter: () => { if (menu.index !== index) { menu.index = index; this.scheduleRender(); } },
          onClick: () => { this.closeMenu(); item.run?.(); },
        },
          item.icon ? icon(item.icon, { size: 14 }) : h("span", { style: { width: "14px" } }),
          h("span", { class: "grow" }, item.label),
          item.kbd ? h("span", { class: "menu-kbd" }, item.kbd) : null);
      }));
  }

  /* ---------------------------------------------------------------------- */
  /*  Context                                                                */
  /* ---------------------------------------------------------------------- */

  private context(): ViewContext {
    const app = this.currentApp();
    const model = this.getModel() ?? emptyModel();
    const hook = this.hook ?? installDevtoolsHook();
    const self = this;
    return {
      app,
      model,
      hook,
      ui: this.ui,
      overlay: this.overlay,
      recorder: this.recorder,
      vitals: this.vitals.snapshot(),
      cspViolations: this.cspViolations,
      epochOffset: this.epochOffset,
      imported: this.selectedAppId !== null && this.imported.has(this.selectedAppId),
      rowHeight: this.ui.compact ? 22 : 26,
      cache: <T>(key: string, compute: () => T): T => {
        if (this.passCache.has(key)) return this.passCache.get(key) as T;
        const value = compute();
        this.passCache.set(key, value);
        return value;
      },
      memo: <T>(key: string, deps: ReadonlyArray<unknown>, compute: () => T): T => {
        const entry = this.memoCache.get(key);
        if (entry && entry.deps.length === deps.length && entry.deps.every((dep, i) => Object.is(dep, deps[i]))) return entry.value as T;
        const value = compute();
        this.memoCache.set(key, { deps: [...deps], value });
        return value;
      },
      width: () => {
        const rect = this.getBoundingClientRect();
        return rect.width > 0 ? rect.width - (this.ui.railWide ? 176 : 46) : (this.ui.dock === "float" ? this.geometry.width : 900);
      },
      height: () => {
        const rect = this.getBoundingClientRect();
        return rect.height > 0 ? rect.height : this.geometry.height;
      },
      now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
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
      toast: (message, tone = "info", options) => this.toast(message, tone as "info", options),
      highlightInstance: (instanceKey, pin) => this.highlightInstance(instanceKey, pin ?? false),
      highlightElement: (element, label, pin) => {
        if (!element) {
          // `null` drops the hover; `null` + pin drops the selection too.
          if (pin) this.overlay.unpin();
          this.overlay.hideHover();
        } else {
          this.overlay.highlight(element, label ?? {}, pin ?? false);
        }
      },
      togglePicker: () => this.togglePicker(),
      openPalette: (query) => this.openPalette(query),
      openMenu: (at, items) => this.openMenu(at, items),
      openDialog: (dialog) => { this.ui.dialog = dialog; this.scheduleRender(); },
      closeDialog: () => this.closeDialog(),
      editJson: (options) => this.editJson(options),
      copy: (text, what) => {
        void copyText(text).then((ok) => self.toast(ok ? `Copied${what ? ` ${what}` : ""}` : "Copy failed — the page blocked clipboard access", ok ? "good" : "bad"));
      },
      persist: () => this.persist(),
      recordedSteps: (): ReadonlyArray<RecordedStep> => this.recorder.list(),
      pushRules: () => this.pushRules(),
      panel: {
        setDock: (dock) => this.setDock(dock),
        setHighlightUpdates: (on) => this.setHighlightUpdates(on),
        clearSession: () => this.clearSession(),
        exportSession: () => this.exportSession(),
        importSession: () => this.promptImport(),
        copyBugReport: () => this.copyBugReport(),
        showShortcuts: () => { this.ui.shortcutsOpen = true; this.scheduleRender(); },
        resetPreferences: () => this.resetPreferences(),
      },
    };
  }

  /** Forget stored preferences; keep what the session is looking at. */
  private resetPreferences(): void {
    try {
      globalThis.localStorage?.removeItem("aktion-devtools-ui");
    } catch {
      /* storage blocked */
    }
    const fresh = defaultUiState();
    const ui = this.ui;
    for (const key of ["theme", "compact", "motion", "railWide", "showLauncher", "pushPage", "captureConsole", "highlightUpdates", "perfMarks", "flashOnCommit", "tipsDismissed", "testFormat", "sizes"] as const) {
      (ui as unknown as Record<string, unknown>)[key] = (fresh as unknown as Record<string, unknown>)[key];
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.dockSizes.right = Math.round(clamp(vw * 0.42, 420, 760));
    this.dockSizes.left = Math.round(clamp(vw * 0.42, 420, 760));
    this.dockSizes.bottom = Math.round(clamp(vh * 0.42, 280, 560));
    this.setDock(fresh.dock);
    this.persist();
    this.toast("Preferences reset to defaults", "good");
    this.scheduleRender();
  }

  /** Push user rules + the throttling preset to the app. */
  private pushRules(): void {
    const app = this.currentApp();
    if (!can(app, "setNetworkRules")) return;
    const throttle = THROTTLE_RULES[this.ui.throttle] ?? [];
    const rules: NetworkRule[] = [...this.ui.rules, ...throttle];
    app.setNetworkRules(rules);
  }

  private highlightInstance(instanceKey: string | null, pin: boolean): void {
    if (!instanceKey) {
      this.overlay.hideHover();
      return;
    }
    const app = this.currentApp();
    const node = can(app, "nodeForInstance") ? app.nodeForInstance(instanceKey) : null;
    if (!node) {
      this.overlay.hideHover();
      return;
    }
    this.overlay.highlight(node, { component: componentNameFromKey(instanceKey) }, pin);
  }

  /**
   * Open the Inspector on an instance and make sure its row is visible — it may
   * be inside a collapsed branch, excluded by the filter, or a library component
   * while the Library toggle is off. Clear all three and say which were cleared.
   */
  private revealInInspect(instanceKey: string): void {
    this.ui.tab = "inspect";
    for (const ancestor of ancestorKeyCandidates(instanceKey)) this.ui.inspectCollapsed.delete(ancestor);
    const cleared: string[] = [];
    const name = componentNameFromKey(instanceKey);
    const filter = this.ui.inspectFilter.trim().toLowerCase();
    if (filter !== "" && !name.toLowerCase().includes(filter)) {
      this.ui.inspectFilter = "";
      cleared.push("filter");
    }
    if (!this.ui.inspectShowLibrary && instanceKey.lastIndexOf("#") > 0) {
      this.ui.inspectShowLibrary = true;
      cleared.push("library filter");
    }
    if (cleared.length > 0) this.toast(`Cleared the ${cleared.join(" and ")} to show ${name}`);
    this.ui.inspectReveal = instanceKey;
  }

  /* ---------------------------------------------------------------------- */
  /*  Commands, palette, menus, dialogs, toasts                              */
  /* ---------------------------------------------------------------------- */

  private toast(message: string, tone: "info" | "good" | "bad" | "warn" = "info", options: { action?: { label: string; run: () => void }; duration?: number } = {}): void {
    const id = (this.toastSeq += 1);
    const entry = { id, message, tone, action: options.action, at: Date.now() };
    this.ui.toasts = [...this.ui.toasts.slice(-2), entry];
    this.ui.toast = { message, tone, at: entry.at };
    const timer = setTimeout(() => this.dismissToast(id), options.duration ?? (tone === "bad" ? TOAST_MS * 1.6 : options.action ? TOAST_MS * 2 : TOAST_MS));
    this.toastTimers.set(id, timer);
    this.scheduleRender();
  }

  private dismissToast(id: number): void {
    const timer = this.toastTimers.get(id);
    if (timer) clearTimeout(timer);
    this.toastTimers.delete(id);
    this.ui.toasts = this.ui.toasts.filter((toast) => toast.id !== id);
    if (this.ui.toasts.length === 0) this.ui.toast = null;
    this.scheduleRender();
  }

  private openPalette(query = ""): void {
    this.ui.paletteOpen = true;
    this.ui.shortcutsOpen = false;
    this.ui.menu = null;
    this.ui.paletteQuery = query;
    this.ui.paletteIndex = 0;
    if (this.ui.minimized) this.setMinimized(false);
    this.scheduleRender();
  }

  private closePalette(): void {
    this.ui.paletteOpen = false;
    this.ui.paletteQuery = "";
    this.ui.paletteIndex = 0;
    this.scheduleRender();
  }

  private runCommand(command: Command): void {
    this.closePalette();
    const recent = this.recentCommands.indexOf(command.id);
    if (recent >= 0) this.recentCommands.splice(recent, 1);
    this.recentCommands.unshift(command.id);
    this.recentCommands.length = Math.min(this.recentCommands.length, 6);
    try {
      command.run();
    } catch (err) {
      this.toast(`Command failed: ${err instanceof Error ? err.message : String(err)}`, "bad");
    }
    this.scheduleRender();
  }

  /** Every command the palette offers right now. */
  private paletteCommands(ctx: ViewContext): Command[] {
    const commands: Command[] = [];
    const ui = this.ui;
    VIEWS.forEach((view, index) => {
      commands.push({
        id: `go:${view.id}`, group: "Go to", label: view.label, keywords: `${view.hint} ${view.keywords}`, icon: view.icon,
        hint: index < 9 ? `⌥${index + 1}` : undefined,
        run: () => this.selectTab(view.id),
      });
    });
    for (const view of VIEWS) {
      let contributed: ReadonlyArray<{ id: string; label: string; keywords?: string; icon?: IconName; hint?: string; run(): void }> = [];
      try {
        contributed = view.commands?.(ctx) ?? [];
      } catch {
        contributed = [];
      }
      for (const command of contributed) {
        commands.push({ ...command, id: `${view.id}:${command.id}`, group: view.label, icon: command.icon ?? view.icon });
      }
    }
    const panel = (id: string, label: string, run: () => void, options: { keywords?: string; icon?: IconName; hint?: string } = {}): void => {
      commands.push({ id: `panel:${id}`, group: "Panel", label, run, keywords: options.keywords, icon: options.icon ?? "panel", hint: options.hint });
    };
    commands.push({ id: "panel:pick", group: "Inspector", label: this.overlay.isPicking ? "Cancel element picker" : "Pick an element on the page", keywords: "select click crosshair find component inspect", icon: "pick", hint: "⇧⌥C", run: () => this.togglePicker() });
    commands.push({ id: "panel:scan", group: "Performance", label: ui.highlightUpdates ? "Stop highlighting re-renders" : "Highlight re-renders on the page", keywords: "render scan flash outline updates paint why slow", icon: "scan", run: () => this.setHighlightUpdates(!ui.highlightUpdates) });
    panel("pause", ui.paused ? "Resume recording events" : "Pause recording events", () => this.togglePause(), { keywords: "freeze stop capture live", icon: ui.paused ? "play" : "pause" });
    panel("clear", "Clear captured data", () => this.clearSession(), { keywords: "reset empty commits events logs session", icon: "trash" });
    panel("export", "Export the session (JSON)", () => this.exportSession(), { keywords: "download save share bug report attach", icon: "download" });
    panel("import", "Import a session file…", () => this.promptImport(), { keywords: "load open offline replay qa", icon: "upload" });
    panel("bug", "Copy a bug report (Markdown)", () => this.copyBugReport(), { keywords: "ticket jira issue qa reproduce", icon: "bug" });
    for (const dock of DOCK_ORDER) panel(`dock-${dock}`, `Dock ${dock === "float" ? "as a floating window" : `to the ${dock}`}`, () => this.setDock(dock), { keywords: "layout position move", icon: dock === "float" ? "dockFloat" : dock === "right" ? "dockRight" : dock === "left" ? "dockLeft" : "dockBottom" });
    panel("theme-dark", "Use the dark panel theme", () => { ui.theme = "dark"; this.persist(); this.scheduleRender(); }, { keywords: "appearance colour", icon: "moon" });
    panel("theme-light", "Use the light panel theme", () => { ui.theme = "light"; this.persist(); this.scheduleRender(); }, { keywords: "appearance colour", icon: "sun" });
    panel("theme-system", "Follow the system theme", () => { ui.theme = "system"; this.persist(); this.scheduleRender(); }, { keywords: "appearance auto", icon: "contrast" });
    panel("density", ui.compact ? "Use comfortable rows" : "Use compact rows", () => { ui.compact = !ui.compact; this.persist(); this.scheduleRender(); }, { keywords: "density small rows spacing", icon: "list" });
    panel("rail", ui.railWide ? "Collapse the sidebar" : "Show sidebar labels", () => { ui.railWide = !ui.railWide; this.persist(); this.scheduleRender(); }, { keywords: "navigation labels", icon: "panel" });
    panel("shortcuts", "Show keyboard shortcuts", () => { ui.shortcutsOpen = true; this.scheduleRender(); }, { keywords: "keys help bindings", icon: "keyboard", hint: "?" });
    panel("minimize", "Minimise to the launcher", () => this.close(), { keywords: "hide close collapse", icon: "minus", hint: "⇧⌥D" });
    const app = ctx.app;
    if (app) {
      commands.push({ id: "app:force", group: "App", label: "Force a full re-render", keywords: "repaint refresh redraw", icon: "refresh", run: () => { app.forceRender(); this.toast("Full re-render requested"); } });
      if (can(app, "reload")) commands.push({ id: "app:reload", group: "App", label: "Re-plan the program", keywords: "reload hot restart", icon: "replay", run: () => { app.reload(); this.toast("Program re-planned"); } });
      // Components on screen: jump straight to one.
      if (can(app, "getComponentTree")) {
        const tree = ctx.cache("tree", () => app.getComponentTree());
        const seen = new Set<string>();
        for (const node of tree) {
          if (node.kind !== "user" && seen.size > 150) continue;
          if (seen.has(node.name) && node.kind === "library") continue;
          seen.add(node.name);
          commands.push({
            id: `component:${node.instanceKey}`, group: "Components", label: `Inspect ${node.name}`,
            keywords: `${node.kind} component ${node.explicitKey ?? ""}`, icon: node.kind === "user" ? "puzzle" : "box",
            run: () => ctx.selectInstance(node.instanceKey),
          });
          if (commands.length > 700) break;
        }
      }
      for (const name of Object.keys(ctx.model.state).slice(0, 200)) {
        commands.push({ id: `atom:${name}`, group: "State", label: `$${name}`, keywords: "atom state value edit", icon: "state", run: () => { ui.stateFilter = name; ui.stateSelected = name; this.selectTab("state"); } });
      }
      if (can(app, "getRoute") && can(app, "navigate")) {
        try {
          for (const pattern of app.getRoute().declared) {
            if (pattern.includes(":") || pattern.includes("*")) continue;
            commands.push({ id: `route:${pattern}`, group: "Routes", label: `Navigate to ${pattern}`, keywords: "route go path", icon: "routes", run: () => { app.navigate(pattern); this.toast(`Navigated to ${pattern}`); } });
          }
        } catch {
          /* router not ready */
        }
      }
    }
    if (ui.paletteQuery.trim() === "" && this.recentCommands.length > 0) {
      const byId = new Map(commands.map((command) => [command.id, command]));
      const recent = this.recentCommands.map((id) => byId.get(id)).filter((c): c is Command => c !== undefined).map((c) => ({ ...c, id: `recent:${c.id}`, group: "Recent" }));
      return [...recent, ...commands];
    }
    return commands;
  }

  private openMenu(at: { x: number; y: number } | MouseEvent | Element, items: MenuItem[]): void {
    let x = 0;
    let y = 0;
    if (at instanceof Element) {
      const rect = at.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + 4;
    } else if ("currentTarget" in at && at.currentTarget instanceof Element && at.type !== "contextmenu") {
      const rect = at.currentTarget.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + 4;
    } else {
      x = (at as { x: number }).x ?? (at as MouseEvent).clientX;
      y = (at as { y: number }).y ?? (at as MouseEvent).clientY;
      if (at instanceof MouseEvent) { x = at.clientX; y = at.clientY; }
    }
    this.ui.menu = { x, y, items, index: 0 };
    this.scheduleRender();
  }

  private closeMenu(): void {
    if (!this.ui.menu) return;
    this.ui.menu = null;
    this.scheduleRender();
  }

  private closeDialog(): void {
    const dialog = this.ui.dialog;
    this.ui.dialog = null;
    dialog?.onClose?.();
    this.scheduleRender();
  }

  private editJson(options: { title: string; value: unknown; onSave: (value: unknown) => void; hint?: Child }): void {
    let text: string;
    try {
      text = JSON.stringify(options.value, null, 2) ?? "null";
    } catch {
      text = String(options.value);
    }
    const draft = { text, error: null as string | null };
    const validate = (): unknown => {
      try {
        const parsed = JSON.parse(draft.text) as unknown;
        draft.error = null;
        return parsed;
      } catch (err) {
        draft.error = err instanceof Error ? err.message : String(err);
        return undefined;
      }
    };
    const save = (): void => {
      const parsed = validate();
      if (draft.error) {
        this.toast(`Not valid JSON: ${draft.error}`, "bad");
        this.scheduleRender();
        return;
      }
      options.onSave(parsed);
      this.closeDialog();
    };
    this.ui.dialog = {
      title: options.title,
      icon: "brackets",
      width: 640,
      body: () => h("div", { class: "col-flex" },
        options.hint ? h("div", { class: "hint" }, options.hint) : null,
        textarea({
          value: draft.text,
          rows: 16,
          mono: true,
          invalid: draft.error !== null,
          testid: "json-editor",
          label: "JSON",
          onInput: (value) => {
            draft.text = value;
            const before = draft.error;
            validate();
            if ((before === null) !== (draft.error === null)) this.scheduleRender();
          },
          onKeyDown: (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              save();
            }
          },
        }),
        draft.error ? h("div", { class: "note t-error" }, icon("error", { size: 14 }), h("span", {}, draft.error)) : h("div", { class: "hint" }, "Valid JSON. ⌘/Ctrl + Enter saves.")),
      actions: () => [
        h("button", { type: "button", class: "btn", onClick: () => this.closeDialog() }, "Cancel"),
        h("button", { type: "button", class: "btn is-primary", "data-dt": "json-save", disabled: draft.error !== null || undefined, onClick: save }, "Save"),
      ],
    };
    this.scheduleRender();
  }

  private openAppMenu(event: MouseEvent): void {
    const apps = this.hook ? [...this.hook.apps.values()] : [];
    const items: MenuItem[] = [{ kind: "label", label: "Apps on this page" }];
    if (apps.length === 0) items.push({ label: "No <aktion-app> found", disabled: true });
    for (const app of apps) {
      items.push({
        label: app.label,
        icon: "box",
        checked: app.id === this.selectedAppId,
        run: () => {
          this.selectApp(app.id);
          this.flashApp();
        },
      });
    }
    if (this.imported.size > 0) {
      items.push({ kind: "separator", label: "" }, { kind: "label", label: "Imported sessions" });
      for (const [id, session] of this.imported) items.push({ label: session.label, icon: "file", checked: id === this.selectedAppId, run: () => this.selectApp(id) });
    }
    items.push({ kind: "separator", label: "" }, { label: "Import a session file…", icon: "upload", run: () => this.promptImport() });
    this.openMenu(event, items);
  }

  private openDockMenu(event: MouseEvent): void {
    const ui = this.ui;
    this.openMenu(event, [
      { kind: "label", label: "Dock" },
      ...DOCK_ORDER.map((dock): MenuItem => ({
        label: dock === "float" ? "Floating window" : `Dock ${dock}`,
        icon: dock === "float" ? "dockFloat" : dock === "right" ? "dockRight" : dock === "left" ? "dockLeft" : "dockBottom",
        checked: ui.dock === dock,
        run: () => this.setDock(dock),
      })),
      { kind: "separator", label: "" },
      { label: ui.pushPage ? "Overlay the page when docked" : "Shrink the page when docked", icon: "split", run: () => { ui.pushPage = !ui.pushPage; this.persist(); this.scheduleRender(); } },
      { label: ui.showLauncher ? "Hide the launcher when minimised" : "Show the launcher when minimised", icon: "eyeOff", run: () => { ui.showLauncher = !ui.showLauncher; this.persist(); this.scheduleRender(); } },
    ]);
  }

  /* ---------------------------------------------------------------------- */
  /*  Actions                                                                */
  /* ---------------------------------------------------------------------- */

  private setMinimized(minimized: boolean): void {
    this.ui.minimized = minimized;
    this.ui.collapsed = minimized;
    this.ui.menu = null;
    if (minimized) {
      this.ui.paletteOpen = false;
      this.overlay.clearUpdateFlashes();
    }
    this.vitals.setFrameSampling(!minimized);
    this.persist();
    this.scheduleRender();
  }

  private togglePause(): void {
    this.ui.paused = !this.ui.paused;
    this.toast(this.ui.paused ? "Paused — runtime events are ignored until you resume" : "Recording runtime events", this.ui.paused ? "warn" : "good");
    this.scheduleRender();
  }

  setHighlightUpdates(on: boolean): void {
    this.ui.highlightUpdates = on;
    if (!on) this.overlay.clearUpdateFlashes();
    this.persist();
    this.toast(on ? "Highlighting re-renders — interact with the app" : "Render highlighting off");
    this.scheduleRender();
  }

  private clearSession(): void {
    const model = this.getModel();
    if (model) clearModel(model);
    this.hook?.clearBuffer();
    this.ui.selectedCommitId = null;
    this.ui.selectedRequest = null;
    this.ui.timeTravel = null;
    this.ui.timelineSelected = null;
    this.ui.timelineBrush = null;
    this.ui.timelineView = null;
    this.memoCache.clear();
    this.toast("Session data cleared");
    this.scheduleRender();
  }

  private exportSession(): void {
    const ctx = this.context();
    downloadText(`aktion-session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, exportSessionJson(ctx, { steps: this.recorder.list() }));
    this.toast("Session exported", "good");
  }

  private copyBugReport(): void {
    const ctx = this.context();
    const vitals = ctx.vitals;
    const lines: string[] = [];
    if (vitals.inp) lines.push(`INP ${Math.round(vitals.inp.value)}ms (${vitals.inp.interaction.type} on ${vitals.inp.interaction.target || "?"})`);
    if (vitals.lcp) lines.push(`LCP ${Math.round(vitals.lcp.value)}ms`);
    lines.push(`CLS ${vitals.cls.value.toFixed(3)}`);
    const slowest = [...ctx.model.commits].sort((a, b) => b.duration - a.duration)[0];
    if (slowest) lines.push(`Slowest commit #${slowest.commitId}: ${slowest.duration.toFixed(1)}ms`);
    ctx.copy(bugReportMarkdown(ctx, { steps: this.recorder.list(), vitals: lines }), "the bug report");
  }

  private promptImport(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        try {
          this.importSession(text, file.name);
          this.open();
        } catch (err) {
          this.toast(`Could not import: ${err instanceof Error ? err.message : String(err)}`, "bad");
        }
      });
    });
    input.click();
  }

  private togglePicker(): void {
    if (this.overlay.isPicking) {
      this.overlay.stopPicking();
      this.scheduleRender();
      return;
    }
    const app = this.currentApp();
    if (this.ui.minimized) this.setMinimized(false);
    this.ui.tab = "inspect";
    this.overlay.startPicking({
      labelFor: (element) => {
        const key = can(app, "instanceForNode") ? app.instanceForNode(element) : null;
        return key ? { component: componentNameFromKey(key) } : {};
      },
      onPick: (element) => {
        this.ui.selectedElement = element;
        const key = can(app, "instanceForNode") ? app.instanceForNode(element) : null;
        this.ui.selectedInstance = key;
        if (key) {
          this.revealInInspect(key);
          this.highlightInstance(key, true);
        } else {
          this.overlay.highlight(element, {}, true);
        }
        this.ui.inspectPane = key ? "props" : "dom";
        this.scheduleRender();
      },
      onCancel: () => this.scheduleRender(),
    });
    this.scheduleRender();
  }

  private flashApp(): void {
    const element = this.currentApp()?.element;
    if (!element) return;
    const previous = element.style.outline;
    const previousOffset = element.style.outlineOffset;
    element.style.outline = "2px solid rgba(139, 123, 255, 0.9)";
    element.style.outlineOffset = "2px";
    setTimeout(() => {
      element.style.outline = previous;
      element.style.outlineOffset = previousOffset;
    }, 260);
  }

  /* ---------------------------------------------------------------------- */
  /*  Keyboard                                                               */
  /* ---------------------------------------------------------------------- */

  private bindWindow(): void {
    if (typeof window === "undefined") return;
    // Global shortcuts use Shift+Alt so they cannot collide with the app's own
    // bindings (⌘K is how half of all apps open their search).
    this.windowKeyHandler = (event: KeyboardEvent) => {
      // Alt+1…9 and Alt+[ / ] switch views page-wide — you are usually clicking
      // the app you debug, not the panel. Keystrokes inside the panel are left
      // to its own handler (so they are not applied twice), and a host page
      // that is typing keeps its keystroke.
      if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (this.ui.minimized || this.hidden || event.composedPath().includes(this)) return;
        if (isTypingTarget(event.composedPath()[0] ?? event.target)) return;
        if (this.handleViewShortcut(event)) event.preventDefault();
        return;
      }
      if (!(event.shiftKey && event.altKey) || event.ctrlKey || event.metaKey) return;
      if (event.code === "KeyD") {
        event.preventDefault();
        this.toggle();
      } else if (event.code === "KeyC") {
        event.preventDefault();
        this.togglePicker();
      } else if (event.code === "KeyK") {
        event.preventDefault();
        this.openPalette();
      }
    };
    window.addEventListener("keydown", this.windowKeyHandler, true);
    this.cspHandler = (event: Event) => {
      const e = event as SecurityPolicyViolationEvent;
      this.cspViolations.push({
        time: performance.now(),
        directive: e.effectiveDirective || e.violatedDirective || "",
        blocked: e.blockedURI || "",
        source: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : "",
        disposition: e.disposition || "enforce",
        sample: e.sample || undefined,
      });
      if (this.cspViolations.length > 100) this.cspViolations.shift();
      if (this.ui.tab === "security") this.scheduleRender();
    };
    document.addEventListener("securitypolicyviolation", this.cspHandler);
    if (typeof matchMedia === "function") {
      this.schemeQuery = matchMedia("(prefers-color-scheme: light)");
      this.schemeHandler = () => { if (this.ui.theme === "system") this.scheduleRender(); };
      this.schemeQuery.addEventListener?.("change", this.schemeHandler);
    }
    this.resizeHandler = () => this.scheduleRender();
    window.addEventListener("resize", this.resizeHandler);
    // Close an open menu on any press outside it.
    this.outsidePointer = (event: PointerEvent) => {
      if (!this.ui.menu) return;
      const path = event.composedPath();
      if (path.some((node) => node instanceof Element && node.classList?.contains("menu"))) return;
      this.closeMenu();
    };
    window.addEventListener("pointerdown", this.outsidePointer, true);
  }

  private unbindWindow(): void {
    if (typeof window === "undefined") return;
    if (this.windowKeyHandler) window.removeEventListener("keydown", this.windowKeyHandler, true);
    if (this.cspHandler) document.removeEventListener("securitypolicyviolation", this.cspHandler);
    if (this.schemeQuery && this.schemeHandler) this.schemeQuery.removeEventListener?.("change", this.schemeHandler);
    if (this.resizeHandler) window.removeEventListener("resize", this.resizeHandler);
    if (this.outsidePointer) window.removeEventListener("pointerdown", this.outsidePointer, true);
    this.windowKeyHandler = null;
    this.cspHandler = null;
    this.schemeHandler = null;
    this.resizeHandler = null;
    this.outsidePointer = null;
  }

  private onRootKeyDown(event: KeyboardEvent): void {
    const target = event.composedPath()[0] ?? event.target;
    const typing = isTypingTarget(target);
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (this.ui.paletteOpen) this.closePalette();
      else this.openPalette();
      return;
    }
    if (event.key === "Escape") {
      if (this.ui.menu) { event.preventDefault(); this.closeMenu(); return; }
      if (this.ui.dialog) { event.preventDefault(); this.closeDialog(); return; }
      if (this.ui.paletteOpen) { event.preventDefault(); this.closePalette(); return; }
      if (this.ui.shortcutsOpen) { event.preventDefault(); this.ui.shortcutsOpen = false; this.scheduleRender(); return; }
      if (this.overlay.isPicking) { event.preventDefault(); this.overlay.stopPicking(); this.scheduleRender(); return; }
      if (this.ui.edit) { event.preventDefault(); this.ui.edit = null; this.scheduleRender(); }
      return;
    }
    if (typing) return;
    if (event.key === "?" && !mod) {
      event.preventDefault();
      this.ui.shortcutsOpen = !this.ui.shortcutsOpen;
      this.scheduleRender();
      return;
    }
    if (event.key === "/" && !mod) {
      const search = this.frameHost.querySelector<HTMLInputElement>(".dt-view [data-search]");
      if (search) {
        event.preventDefault();
        search.focus();
        search.select();
      }
      return;
    }
    if (event.altKey && !mod && this.handleViewShortcut(event)) event.preventDefault();
  }

  /** Alt+1…9 → the nth section; Alt+[ / Alt+] → previous / next. True when handled. */
  private handleViewShortcut(event: KeyboardEvent): boolean {
    const main = VIEWS.filter((view) => view.group !== "system");
    // `code`, not `key`: on macOS Alt+2 types "™", so `key` never says "2".
    const digit = /^Digit([1-9])$/.exec(event.code) ?? (/^[1-9]$/.test(event.key) ? [event.key, event.key] : null);
    if (digit) {
      const view = main[Number(digit[1]) - 1];
      if (!view) return false;
      this.selectTab(view.id);
      return true;
    }
    const bracket = event.code === "BracketLeft" || event.key === "[" ? -1 : event.code === "BracketRight" || event.key === "]" ? 1 : 0;
    if (bracket === 0) return false;
    const index = VIEWS.findIndex((view) => view.id === this.ui.tab);
    const next = VIEWS[(index + (bracket === 1 ? 1 : VIEWS.length - 1)) % VIEWS.length]!;
    this.selectTab(next.id);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /*  Moving, docking, resizing                                              */
  /* ---------------------------------------------------------------------- */

  private beginMove(event: PointerEvent): void {
    if (event.button !== 0) return;
    if ((event.target as Element).closest("button, input, select, a, [role='menu']")) return;
    const start = { ...this.geometry };
    const titlebar = event.currentTarget as HTMLElement;
    let floating = this.ui.dock === "float";
    /** Torn off a dock edge mid-drag: the window then follows the pointer directly. */
    let torn = false;
    let snap: DockMode | null = null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    trackPointer(event, {
      threshold: 4,
      move: (dx, dy, e) => {
        titlebar.classList.add("is-dragging");
        if (!floating) {
          // Tear a docked panel off its edge by dragging it away from the edge.
          const away = this.ui.dock === "right" ? -dx : this.ui.dock === "left" ? dx : -dy;
          if (away < 36) return;
          floating = true;
          torn = true;
          const width = clamp(Math.round(vw * 0.55), MIN_W, 900);
          const height = clamp(Math.round(vh * 0.62), MIN_H, 720);
          this.geometry = { width, height, left: e.clientX - width / 2, top: Math.max(0, e.clientY - 18) };
          this.ui.dock = "float";
          this.renderNow();
          return;
        }
        if (torn) {
          this.geometry.left = e.clientX - this.geometry.width / 2;
          this.geometry.top = Math.max(0, e.clientY - 18);
        } else {
          this.geometry.left = start.left + dx;
          this.geometry.top = Math.max(0, start.top + dy);
        }
        this.style.left = `${this.geometry.left}px`;
        this.style.top = `${this.geometry.top}px`;
        snap = e.clientX <= SNAP_ZONE ? "left" : e.clientX >= vw - SNAP_ZONE ? "right" : e.clientY >= vh - SNAP_ZONE ? "bottom" : null;
        this.showSnap(snap);
      },
      end: (_dx, _dy, _e, moved) => {
        titlebar.classList.remove("is-dragging");
        this.showSnap(null);
        if (!moved) return;
        if (snap) {
          this.setDock(snap);
          this.toast(`Docked ${snap} — drag the title bar away from the edge to float it again`);
        } else {
          this.persist();
          this.scheduleRender();
        }
      },
    });
  }

  private showSnap(side: DockMode | null): void {
    if (!side || side === "float") {
      this.snapEl?.remove();
      this.snapEl = null;
      return;
    }
    if (!this.snapEl) {
      this.snapEl = document.createElement("div");
      this.snapEl.className = "dt-snap";
      this.layerHost.appendChild(this.snapEl);
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = side === "bottom" ? this.dockSizes.bottom : this.dockSizes[side];
    const rect = side === "right"
      ? { left: vw - size, top: 0, width: size, height: vh }
      : side === "left"
        ? { left: 0, top: 0, width: size, height: vh }
        : { left: 0, top: vh - size, width: vw, height: size };
    Object.assign(this.snapEl.style, { left: `${rect.left + 6}px`, top: `${rect.top + 6}px`, width: `${rect.width - 12}px`, height: `${rect.height - 12}px` });
  }

  private beginResize(event: PointerEvent, edge: string): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const g0 = { ...this.geometry };
    const dock = this.ui.dock;
    const size0 = dock === "bottom" ? this.dockSizes.bottom : dock === "float" ? 0 : this.dockSizes[dock];
    const handle = event.currentTarget as HTMLElement;
    handle.classList.add("is-active");
    trackPointer(event, {
      threshold: 1,
      move: (dx, dy) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (dock === "float") {
          const g = { ...g0 };
          if (edge.includes("e")) g.width = clamp(g0.width + dx, MIN_W, vw);
          if (edge.includes("s")) g.height = clamp(g0.height + dy, MIN_H, vh);
          if (edge.includes("w")) {
            g.width = clamp(g0.width - dx, MIN_W, vw);
            g.left = g0.left + (g0.width - g.width);
          }
          if (edge.includes("n")) {
            g.height = clamp(g0.height - dy, MIN_H, vh);
            g.top = Math.max(0, g0.top + (g0.height - g.height));
          }
          this.geometry = g;
          Object.assign(this.style, { left: `${g.left}px`, top: `${g.top}px`, width: `${g.width}px`, height: `${g.height}px` });
        } else if (dock === "bottom") {
          this.dockSizes.bottom = clamp(size0 - dy, MIN_H - 40, vh - 60);
          this.style.height = `${this.dockSizes.bottom}px`;
          this.applyPagePush();
        } else {
          const size = clamp(dock === "right" ? size0 - dx : size0 + dx, MIN_W - 40, vw - 100);
          this.dockSizes[dock] = size;
          this.style.width = `${size}px`;
          this.applyPagePush();
        }
      },
      end: () => {
        handle.classList.remove("is-active");
        this.persist();
        this.scheduleRender();
      },
    });
  }

  private toggleMaximize(): void {
    if (this.ui.dock !== "float") return;
    if (this.restoreGeometry) {
      this.geometry = this.restoreGeometry;
      this.restoreGeometry = null;
    } else {
      this.restoreGeometry = { ...this.geometry };
      this.geometry = { left: 12, top: 12, width: window.innerWidth - 24, height: window.innerHeight - 24 };
    }
    this.persist();
    this.scheduleRender();
  }

  private beginLauncherDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    const start = { ...this.launcherPos };
    const el = event.currentTarget as HTMLElement;
    trackPointer(event, {
      threshold: 4,
      move: (dx, dy) => {
        el.classList.add("is-dragging");
        this.launcherPos = {
          right: clamp(start.right - dx, 4, window.innerWidth - 120),
          bottom: clamp(start.bottom - dy, 4, window.innerHeight - 44),
        };
        el.style.right = `${this.launcherPos.right}px`;
        el.style.bottom = `${this.launcherPos.bottom}px`;
      },
      end: (_dx, _dy, _e, moved) => {
        el.classList.remove("is-dragging");
        if (moved) {
          this.persist();
          // The click that ends a drag is not a request to open.
          this.suppressLauncherClick = true;
          setTimeout(() => { this.suppressLauncherClick = false; }, 0);
        } else {
          this.open();
        }
      },
    });
  }

  /* ---------------------------------------------------------------------- */

  private persist(): void {
    const ui = this.ui;
    const payload: PersistedUiState = {
      tab: ui.tab,
      dock: ui.dock,
      theme: ui.theme,
      light: ui.light,
      compact: ui.compact,
      motion: ui.motion,
      captureConsole: ui.captureConsole,
      width: this.geometry.width,
      height: this.geometry.height,
      left: this.geometry.left,
      top: this.geometry.top,
      dockSize: { ...this.dockSizes },
      launcher: this.launcherPos,
      tipsDismissed: ui.tipsDismissed,
      watches: ui.watches,
      railWide: ui.railWide,
      showLauncher: ui.showLauncher,
      pushPage: ui.pushPage,
      minimized: ui.minimized,
      sizes: ui.sizes,
      testFormat: ui.testFormat,
      highlightUpdates: ui.highlightUpdates,
    };
    savePersisted(payload);
  }

  /** @internal — lets the Security view read the live CSP violation log. */
  get cspLog(): ReadonlyArray<CspViolation> {
    return this.cspViolations;
  }

  /** @internal — whether an event target belongs to the panel (for the recorder). */
  static isChrome(element: Element | null): boolean {
    return isPanelChrome(element);
  }

  /** @internal */
  get renderRoot(): Element | null {
    return renderRootElement(this.currentApp());
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* ========================================================================== */
/*  Public API                                                                 */
/* ========================================================================== */

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
  /** Start open (default `true`); `false` starts as the launcher pill. */
  open?: boolean;
  /** Open on a specific section. */
  tab?: TabId;
  /** Dock position (default: whatever was last used, else floating). */
  dock?: DockMode;
  /** Panel theme (default: last used, else follow the system). */
  theme?: "system" | "dark" | "light";
  /** Show the launcher pill while minimised (default `true`). */
  launcher?: boolean;
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
  /** Switch to a section by id. */
  selectTab(tab: TabId): void;
  /** Change the dock position. */
  dock(position: DockMode): void;
  /** Load an exported session for offline inspection; returns its app id. */
  importSession(json: string, fileName?: string): string;
  /** Render synchronously (tests). */
  flush(): void;
  /** Remove the panel from the DOM (the hook + event stream stay installed). */
  destroy(): void;
}

/**
 * Install the DevTools hook and mount an in-page panel. Idempotent at the hook
 * level — multiple panels share one event stream — but each call mounts a new
 * panel element.
 *
 *   import { mountDevtools } from "aktion-runtime/devtools";
 *   mountDevtools();
 */
export function mountDevtools(options: MountDevtoolsOptions = {}): DevtoolsController {
  const hook = installDevtoolsHook();
  defineDevtoolsElement();
  const element = document.createElement(AktionDevtoolsElement.tagName) as AktionDevtoolsElement;
  const ui = element.getUiState();
  if (options.dock) ui.dock = options.dock;
  if (options.theme) ui.theme = options.theme;
  if (options.launcher !== undefined) ui.showLauncher = options.launcher;
  if (options.open !== undefined) ui.minimized = !options.open;
  if (options.tab) ui.tab = options.tab;
  (options.container ?? document.body).appendChild(element);
  if (options.appId) element.selectApp(options.appId);
  return {
    element,
    hook,
    open: () => element.open(),
    close: () => element.close(),
    toggle: () => element.toggle(),
    selectApp: (id) => element.selectApp(id),
    selectTab: (tab) => element.selectTab(tab),
    dock: (position) => element.setDock(position),
    importSession: (json, fileName) => element.importSession(json, fileName),
    flush: () => element.flush(),
    destroy: () => element.remove(),
  };
}

/** Whether a DevTools hook is currently installed on the page. */
export function isDevtoolsInstalled(): boolean {
  return getDevtoolsHook() !== undefined;
}

/** Re-exported so a host can clear a panel's captured data programmatically. */
export { clearModel };
