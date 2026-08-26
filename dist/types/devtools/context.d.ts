import { AktionDevtoolsHook, DevtoolsAppRecord } from './hook.js';
import { EffectPhase, LogLevel, NetworkRule } from './protocol.js';
import { AppModel } from './model.js';
import { A11yFinding } from './a11y.js';
import { InspectOverlay } from './overlay.js';
import { InteractionRecorder, RecordedStep } from './recorder.js';
import { SortState } from './ui.js';
/** Every tab in the panel. */
export type TabId = "overview" | "inspect" | "state" | "profiler" | "effects" | "network" | "console" | "routes" | "data" | "theme" | "source" | "test" | "timeline" | "settings";
/** Where the panel is anchored. */
export type DockMode = "float" | "right" | "bottom" | "left";
/** Result of one accessibility audit run. */
export interface A11yRun {
    findings: A11yFinding[];
    examined: number;
    truncated: boolean;
    at: number;
}
/** Result of one chaos / fuzz run. */
export interface FuzzRun {
    clicks: number;
    errors: string[];
    atoms: string[];
    durationMs: number;
    at: number;
}
/** One evaluated console expression. */
export interface ReplEntry {
    input: string;
    ok: boolean;
    output: string;
    time: number;
}
/**
 * The panel's whole view state.
 *
 * One flat object rather than per-tab classes: it is serialisable (which is how
 * the persisted subset and the session export work), and every tab can read
 * another tab's selection — clicking a component in the profiler selects it in
 * the inspector because they share `selectedInstance`, not because they talk.
 */
export interface UiState {
    tab: TabId;
    paused: boolean;
    dock: DockMode;
    /** Light panel chrome, for a light-themed host page. */
    light: boolean;
    /** Denser rows, for a small dock. */
    compact: boolean;
    collapsed: boolean;
    toast: {
        message: string;
        tone: string;
        at: number;
    } | null;
    stateFilter: string;
    stateExpanded: Set<string>;
    stateSort: "name" | "activity";
    stateShowReserved: boolean;
    /** Index into `model.history` while scrubbing, or `null` when live. */
    timeTravel: number | null;
    inspectFilter: string;
    /** Collapsed subtrees (expanded is the default — a tree you must open is a tree you do not read). */
    inspectCollapsed: Set<string>;
    selectedInstance: string | null;
    /** A picked DOM node that may not map to any instance. */
    selectedElement: Element | null;
    inspectPane: "props" | "hooks" | "dom" | "styles" | "a11y" | "source";
    inspectShowLibrary: boolean;
    propsExpanded: Set<string>;
    computedFilter: string;
    selectedCommitId: number | null;
    flashOnCommit: boolean;
    rankedSort: SortState;
    profilerView: "commit" | "ranked" | "insights";
    phaseFilter: Set<EffectPhase>;
    effectView: "timeline" | "log" | "mounted";
    selectedEffect: string | null;
    networkFilter: string;
    networkOnlyProblems: boolean;
    selectedRequest: string | null;
    networkPane: "response" | "request" | "headers" | "timing";
    showRules: boolean;
    rules: NetworkRule[];
    logFilter: string;
    logLevels: Set<LogLevel>;
    captureConsole: boolean;
    repl: ReplEntry[];
    replDraft: string;
    replHistory: string[];
    replCursor: number;
    routeDraft: string;
    dataPane: "queries" | "stores" | "storage";
    storageKind: "local" | "session" | "cookies";
    dataExpanded: Set<string>;
    themeFilter: string;
    sourceIndex: number;
    sourceFocusLine: number | null;
    /** Unsaved edit buffer, or `null` when showing the live program. */
    sourceDraft: string | null;
    sourceOutline: boolean;
    testPane: "record" | "a11y" | "coverage" | "queries" | "chaos";
    a11yRun: A11yRun | null;
    a11ySelected: number | null;
    queryProbe: string;
    queryProbeKind: "role" | "text" | "label" | "testid" | "css";
    fuzzRun: FuzzRun | null;
    fuzzRunning: boolean;
    generatedTest: string | null;
    timelineKinds: Set<string>;
}
/** Fresh view state — the defaults a first-time panel opens with. */
export declare function defaultUiState(): UiState;
/** The subset of view state worth remembering between sessions. */
export interface PersistedUiState {
    tab?: TabId;
    dock?: DockMode;
    light?: boolean;
    compact?: boolean;
    captureConsole?: boolean;
    width?: number;
    height?: number;
    left?: number;
    top?: number;
}
/**
 * Read the persisted chrome preferences.
 *
 * Storage can throw (private mode, a host page with a blocked origin), and a
 * debugger that fails to open because it could not read a preference is a bad
 * trade — every failure path here returns defaults.
 */
export declare function loadPersisted(): PersistedUiState;
/** Persist the chrome preferences, ignoring any storage failure. */
export declare function savePersisted(state: PersistedUiState): void;
/** What a tab renderer gets. */
export interface TabContext {
    /** The inspected app, or `null` when nothing is mounted. */
    app: DevtoolsAppRecord | null;
    /** Derived model for the inspected app (always present, possibly empty). */
    model: AppModel;
    hook: AktionDevtoolsHook;
    ui: UiState;
    /** Shared highlight + element picker. */
    overlay: InspectOverlay;
    /** Shared interaction recorder (Test tab, but the panel owns its lifetime). */
    recorder: InteractionRecorder;
    /** Queue a full re-render of the panel body. */
    refresh(): void;
    /** Switch tabs. */
    selectTab(tab: TabId): void;
    /** Select a component instance and switch to the Inspect tab. */
    selectInstance(instanceKey: string | null, options?: {
        reveal?: boolean;
    }): void;
    /** Flash a transient message in the panel header. */
    toast(message: string, tone?: string): void;
    /** Highlight an instance's DOM node (hover feedback from any tab). */
    highlightInstance(instanceKey: string | null, pin?: boolean): void;
    /** Steps recorded so far (the recorder's list, for codegen). */
    recordedSteps(): ReadonlyArray<RecordedStep>;
}
/** One tab's definition. */
export interface TabDefinition {
    id: TabId;
    /** Label in the tab strip. */
    label: string;
    /** Single-glyph icon. */
    icon: string;
    /** Tooltip / help line. */
    hint: string;
    /** Badge number, or `null` for no badge. */
    badge?(ctx: TabContext): number | null;
    /** Render the tab body. */
    render(ctx: TabContext): Node[];
}
/**
 * True when the app record implements an optional capability.
 *
 * The record is versioned by *presence*, not by a version number (see
 * `DevtoolsAppRecord`), so every tab that reaches past the v1 core asks this
 * first and degrades to an explanatory message rather than throwing.
 */
export declare function can<K extends keyof DevtoolsAppRecord>(app: DevtoolsAppRecord | null, capability: K): app is DevtoolsAppRecord & Required<Pick<DevtoolsAppRecord, K>>;
/**
 * The app's render root as an `Element`.
 *
 * `getRenderRoot` may hand back a `ShadowRoot` (a host is free to paint
 * straight into one), but every DOM tool here — the audit, the recorder, the
 * query probe — needs an element to walk from. Falling back to the shadow
 * root's first element keeps those tools working instead of silently disabling
 * them for such a host.
 */
export declare function renderRootElement(app: DevtoolsAppRecord | null): Element | null;
