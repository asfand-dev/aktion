import { AktionDevtoolsHook, DevtoolsAppRecord } from './hook.js';
import { EffectPhase, LogLevel, NetworkRule } from './protocol.js';
import { AppModel } from './model.js';
import { A11yFinding } from './a11y.js';
import { InspectOverlay } from './overlay.js';
import { InteractionRecorder, RecordedStep } from './recorder.js';
import { Child } from './core/vdom.js';
import { EditState } from './ui/value.js';
import { IconName } from './ui/icons.js';
import { SortState } from './ui/layout.js';
import { CspViolation, SecurityReport } from './analysis/security.js';
import { VitalsSnapshot } from './analysis/vitals.js';
/** Every section of the panel. The first fourteen ids are the protocol-2 tab ids, kept for compatibility. */
export type TabId = "overview" | "inspect" | "state" | "profiler" | "effects" | "network" | "console" | "routes" | "data" | "theme" | "source" | "test" | "timeline" | "settings" | "a11y" | "security";
/** Where the panel is anchored. */
export type DockMode = "float" | "right" | "bottom" | "left";
export type PanelTheme = "system" | "dark" | "light";
export interface A11yRun {
    findings: A11yFinding[];
    examined: number;
    truncated: boolean;
    at: number;
    /** 0–100, weighted by impact. */
    score: number;
}
export interface FuzzRun {
    clicks: number;
    errors: string[];
    atoms: string[];
    durationMs: number;
    at: number;
    /** The clicks performed, in order, so a failure is reproducible. */
    trail: string[];
    /** The same actions as replayable recorder steps. */
    steps?: RecordedStep[];
    /** PRNG seed: re-running with it repeats the exact sequence (same UI, same data). */
    seed?: number;
    /** Side effects the run neutralised (links leaving the page, popups, dialogs). */
    blocked?: string[];
}
export interface ReplEntry {
    input: string;
    ok: boolean;
    output: string;
    /** Parsed result for the value explorer, when it round-trips. */
    value?: unknown;
    hasValue?: boolean;
    time: number;
}
export interface ToastEntry {
    id: number;
    message: string;
    tone: "info" | "good" | "bad" | "warn";
    action?: {
        label: string;
        run: () => void;
    };
    at: number;
}
export interface MenuItem {
    label: string;
    icon?: IconName;
    run?: () => void;
    kbd?: string;
    danger?: boolean;
    checked?: boolean;
    disabled?: boolean;
    /** `separator` draws a rule; `label` draws a group heading. */
    kind?: "item" | "separator" | "label";
}
export interface MenuState {
    x: number;
    y: number;
    items: MenuItem[];
    index: number;
}
export interface DialogState {
    title: string;
    icon?: IconName;
    width?: number;
    body: () => Child;
    actions?: () => Child[];
    onClose?: () => void;
}
/** A named, restorable fixture: state + network rules + route. */
export interface Scenario {
    id: string;
    name: string;
    createdAt: number;
    state?: Record<string, unknown>;
    rules?: NetworkRule[];
    route?: string;
}
/** A named state snapshot the user saved. */
export interface Bookmark {
    id: string;
    name: string;
    at: number;
    state: Record<string, unknown>;
}
export interface UiState {
    tab: TabId;
    paused: boolean;
    dock: DockMode;
    theme: PanelTheme;
    /** Kept for protocol-2 callers: `true` means the light theme. */
    light: boolean;
    compact: boolean;
    motion: "system" | "reduced" | "full";
    /** Collapsed to the launcher pill. */
    minimized: boolean;
    /** Kept for protocol-2 callers; the same as `minimized`. */
    collapsed: boolean;
    railWide: boolean;
    showLauncher: boolean;
    /** Docked panels shrink the page instead of covering it. */
    pushPage: boolean;
    toasts: ToastEntry[];
    /** Kept for protocol-2 callers: the most recent toast. */
    toast: {
        message: string;
        tone: string;
        at: number;
    } | null;
    paletteOpen: boolean;
    paletteQuery: string;
    paletteIndex: number;
    shortcutsOpen: boolean;
    menu: MenuState | null;
    dialog: DialogState | null;
    tipsDismissed: boolean;
    /** Outline components as they re-render, with render counts (render scan). */
    highlightUpdates: boolean;
    perfMarks: boolean;
    flashOnCommit: boolean;
    /** The one inline value edit in progress. */
    edit: EditState | null;
    /** Split-pane sizes by id, persisted. */
    sizes: Record<string, number>;
    inspectFilter: string;
    inspectCollapsed: Set<string>;
    selectedInstance: string | null;
    selectedElement: Element | null;
    inspectPane: "props" | "hooks" | "effects" | "dom" | "styles" | "a11y" | "source";
    inspectShowLibrary: boolean;
    inspectReveal: string | null;
    propsExpanded: Set<string>;
    computedFilter: string;
    overrideDraft: {
        name: string;
        value: string;
    };
    stateFilter: string;
    stateExpanded: Set<string>;
    stateSort: "name" | "activity";
    stateShowReserved: boolean;
    /**
     * The commit being viewed while time travelling, or `null` when live.
     *
     * An id, not a ring index: the history ring shifts under an index as new
     * commits arrive, so an index pointed at a different snapshot a moment later.
     */
    timeTravel: number | null;
    stateView: "tree" | "diff" | "log" | "graph";
    diffFrom: number | null;
    diffTo: number | null;
    breakOnChange: Set<string>;
    importDraft: string | null;
    stateSelected: string | null;
    statePages: Map<string, number>;
    bookmarks: Bookmark[];
    /** Node hovered in the reactivity graph. */
    graphHover: string | null;
    dataPane: "queries" | "stores" | "storage";
    storageKind: "local" | "session" | "cookies";
    dataExpanded: Set<string>;
    selectedQuery: string | null;
    selectedStore: string | null;
    storageFilter: string;
    storageSelected: string | null;
    invalidateDraft: string;
    storageDraft: {
        key: string;
        value: string;
    };
    /** Draft arguments per `store.method`, typed in the Stores pane. */
    storeArgs: Record<string, string>;
    /** Unsaved edit of one storage value. */
    storageEdit: {
        key: string;
        value: string;
    } | null;
    routeDraft: string;
    /** Param values typed into a declared route's form, keyed by pattern. */
    routeParams: Record<string, Record<string, string>>;
    routeFilter: string;
    timelineKinds: Set<string>;
    timelineView: {
        start: number;
        end: number;
    } | null;
    timelineBrush: {
        start: number;
        end: number;
    } | null;
    timelineSelected: string | null;
    timelineFilter: string;
    networkFilter: string;
    networkOnlyProblems: boolean;
    networkStatus: "all" | "ok" | "redirect" | "client" | "server" | "failed" | "mocked" | "pending";
    selectedRequest: string | null;
    networkPane: "headers" | "payload" | "response" | "timing";
    networkResponseView: "tree" | "raw";
    networkSort: SortState | null;
    showRules: boolean;
    rules: NetworkRule[];
    throttle: "none" | "fast3g" | "slow3g" | "offline" | "flaky";
    networkExpanded: Set<string>;
    logFilter: string;
    logLevels: Set<LogLevel>;
    logOrigin: "all" | "program" | "runtime";
    captureConsole: boolean;
    repl: ReplEntry[];
    replDraft: string;
    replHistory: string[];
    replCursor: number;
    watches: string[];
    consoleSelected: string | null;
    replExpanded: Set<string>;
    phaseFilter: Set<EffectPhase>;
    effectView: "mounted" | "timeline" | "log";
    selectedEffect: string | null;
    effectFilter: string;
    selectedCommitId: number | null;
    profilerView: "flame" | "ranked" | "components" | "why" | "insights" | "vitals";
    rankedSort: SortState;
    componentSort: SortState;
    perfFilter: string;
    flameSelected: string | null;
    a11yRun: A11yRun | null;
    a11yRequested: boolean;
    a11ySelected: number | null;
    a11yPane: "issues" | "tree" | "structure" | "vision";
    a11yImpacts: Set<string>;
    a11yShowOnPage: boolean;
    a11yTabOrder: boolean;
    a11yLandmarks: boolean;
    a11yVision: "none" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia" | "blur" | "low-contrast";
    a11yAuto: boolean;
    /** Collapsed accessibility-tree paths (everything starts expanded). */
    a11yTreeCollapsed: Set<string>;
    a11yTreeSelected: string | null;
    a11yTreeFilter: string;
    a11yCategory: "all" | "names" | "structure" | "aria" | "keyboard" | "contrast" | "forms" | "media";
    a11yFilter: string;
    /** Rule groups folded in the issues list. */
    a11yCollapsed: Set<string>;
    /** Score of the run before the current one, for the trend arrow. */
    a11yPrevScore: number | null;
    /** Position in the keyboard walkthrough (-1 = not started). */
    a11yWalk: number;
    contrastFg: string;
    contrastBg: string;
    securityRun: SecurityReport | null;
    securityRequested: boolean;
    securityPane: "findings" | "network" | "storage" | "program" | "headers";
    securitySelected: string | null;
    securitySeverities: Set<string>;
    securityCategory: "all" | "program" | "dom" | "transport" | "storage" | "headers" | "csp";
    /** Response headers of the page, fetched on request (HEAD, same origin). */
    securityHeaders: Record<string, string> | null;
    securityHeadersState: "idle" | "loading" | "error";
    securityHeadersError: string | null;
    testPane: "record" | "scenarios" | "coverage" | "queries" | "chaos" | "emulate";
    testFormat: "aktion" | "playwright";
    queryProbe: string;
    queryProbeKind: "role" | "text" | "label" | "testid" | "css";
    queryProbeName: string;
    fuzzRun: FuzzRun | null;
    fuzzRunning: boolean;
    generatedTest: string | null;
    replaying: number | null;
    scenarios: Scenario[];
    showTestIds: boolean;
    emulateDir: "auto" | "ltr" | "rtl";
    emulateTextScale: number;
    /** Per-step outcome of the last replay (index-aligned with the recorder). */
    replayResults: Array<{
        ok: boolean;
        message: string;
    } | null>;
    /** App label the scenarios were loaded for (they persist per app). */
    scenariosFor: string | null;
    scenarioDraft: string;
    testIncludeState: boolean;
    chaosClicks: number;
    chaosTyping: boolean;
    chaosSeed: string;
    sourceIndex: number;
    sourceFocusLine: number | null;
    sourceDraft: string | null;
    sourceOutline: boolean;
    sourceFilter: string;
    sourceHistoryOpen: boolean;
    sourceDiff: number | null;
    /** Sidebar tab; `null` picks Problems when there are any, else Outline. */
    sourceSidebar: "outline" | "problems" | "history" | null;
    /** While editing: show the draft as a diff instead of the editor. */
    sourceShowDraftDiff: boolean;
    themeFilter: string;
    themeEditedOnly: boolean;
}
/** Fresh view state — what a first-time panel opens with. */
export declare function defaultUiState(): UiState;
/** The subset of view state worth remembering between sessions. */
export interface PersistedUiState {
    tab?: TabId;
    dock?: DockMode;
    theme?: PanelTheme;
    light?: boolean;
    compact?: boolean;
    motion?: UiState["motion"];
    captureConsole?: boolean;
    width?: number;
    height?: number;
    left?: number;
    top?: number;
    dockSize?: Partial<Record<Exclude<DockMode, "float">, number>>;
    launcher?: {
        right: number;
        bottom: number;
    };
    tipsDismissed?: boolean;
    watches?: string[];
    railWide?: boolean;
    showLauncher?: boolean;
    pushPage?: boolean;
    minimized?: boolean;
    sizes?: Record<string, number>;
    testFormat?: UiState["testFormat"];
    highlightUpdates?: boolean;
}
/**
 * Read the persisted preferences. Storage can throw (private mode, a blocked
 * origin), and a debugger that fails to open over a preference is a bad trade —
 * every failure path returns defaults.
 */
export declare function loadPersisted(): PersistedUiState;
export declare function savePersisted(state: PersistedUiState): void;
/** Per-app data (scenarios, bookmarks) keyed by the app's label, which survives reloads. */
export declare function loadAppData<T>(appLabel: string, kind: string, fallback: T): T;
export declare function saveAppData(appLabel: string, kind: string, value: unknown): boolean;
export interface ToastOptions {
    action?: {
        label: string;
        run: () => void;
    };
    duration?: number;
}
/** Panel-level actions a view may trigger (Settings, Overview). */
export interface PanelActions {
    setDock(dock: DockMode): void;
    setHighlightUpdates(on: boolean): void;
    /** Drop captured commits, events, logs, and requests. */
    clearSession(): void;
    /** Download the session as a JSON file. */
    exportSession(): void;
    /** Ask for a session file and open it. */
    importSession(): void;
    copyBugReport(): void;
    showShortcuts(): void;
    /** Forget every stored panel preference and return to defaults. */
    resetPreferences(): void;
}
/** What a view renderer gets. */
export interface ViewContext {
    /** The inspected app, or `null` when nothing is mounted. */
    app: DevtoolsAppRecord | null;
    /** Derived model for the inspected app (always present, possibly empty). */
    model: AppModel;
    hook: AktionDevtoolsHook;
    ui: UiState;
    overlay: InspectOverlay;
    recorder: InteractionRecorder;
    /** Web vitals, FPS, interactions, and long tasks observed while open. */
    vitals: VitalsSnapshot;
    /** Content-Security-Policy violations reported while the panel was open. */
    cspViolations: ReadonlyArray<CspViolation>;
    /** `performance.now()` + this = epoch ms (for wall-clock times and HAR). */
    epochOffset: number;
    /** True when the selected "app" is an imported session file (no live runtime). */
    imported: boolean;
    /** Memoise for the duration of one render pass. */
    cache<T>(key: string, compute: () => T): T;
    /** Memoise across renders until `deps` change (shallow, `Object.is`). */
    memo<T>(key: string, deps: ReadonlyArray<unknown>, compute: () => T): T;
    /** Panel content width / height in px. */
    width(): number;
    height(): number;
    /** Row height for the current density. */
    rowHeight: number;
    /** Monotonic clock matching the model's timestamps. */
    now(): number;
    refresh(): void;
    selectTab(tab: TabId): void;
    selectInstance(instanceKey: string | null, options?: {
        reveal?: boolean;
    }): void;
    toast(message: string, tone?: string, options?: ToastOptions): void;
    highlightInstance(instanceKey: string | null, pin?: boolean): void;
    /** Highlight an element; `pin` makes it the selection. `null` clears the hover — and, with `pin`, the selection. */
    highlightElement(element: Element | null, label?: {
        component?: string;
        kind?: string;
    }, pin?: boolean): void;
    togglePicker(): void;
    openPalette(query?: string): void;
    openMenu(at: {
        x: number;
        y: number;
    } | MouseEvent | Element, items: MenuItem[]): void;
    openDialog(dialog: DialogState): void;
    closeDialog(): void;
    /** Edit any value as JSON in a validated dialog. */
    editJson(options: {
        title: string;
        value: unknown;
        onSave: (value: unknown) => void;
        hint?: Child;
    }): void;
    copy(text: string, what?: string): void;
    persist(): void;
    recordedSteps(): ReadonlyArray<RecordedStep>;
    /** Push the current network rules (plus throttling) to the app. */
    pushRules(): void;
    panel: PanelActions;
}
/** @deprecated Protocol-2 name for {@link ViewContext}. */
export type TabContext = ViewContext;
export type ViewGroup = "home" | "inspect" | "activity" | "perf" | "quality" | "app" | "system";
/** One section's definition. */
export interface ViewDefinition {
    id: TabId;
    label: string;
    icon: IconName;
    group: ViewGroup;
    /** One line: what this section answers. */
    hint: string;
    /** Extra palette search words. */
    keywords: string;
    badge?(ctx: ViewContext): {
        value: number | string;
        tone?: "red" | "amber" | "accent" | "grey";
    } | null;
    render(ctx: ViewContext): Child;
    /** View-specific CSS, appended to the shared sheet. */
    css?: string;
    /** Palette commands this view contributes. */
    commands?(ctx: ViewContext): ReadonlyArray<ViewCommand>;
}
/** @deprecated Protocol-2 name for {@link ViewDefinition}. */
export type TabDefinition = ViewDefinition;
export interface ViewCommand {
    id: string;
    label: string;
    keywords?: string;
    icon?: IconName;
    hint?: string;
    run(): void;
}
/**
 * True when the app record implements an optional capability. The record is
 * versioned by presence, so every view that reaches past the v1 core asks this
 * first and degrades to an explanation rather than throwing.
 */
export declare function can<K extends keyof DevtoolsAppRecord>(app: DevtoolsAppRecord | null, capability: K): app is DevtoolsAppRecord & Required<Pick<DevtoolsAppRecord, K>>;
/**
 * The app's render root as an `Element`. `getRenderRoot` may hand back a
 * `ShadowRoot`; every DOM tool here needs an element to walk from.
 */
export declare function renderRootElement(app: DevtoolsAppRecord | null): Element | null;
