/**
 * Aktion DevTools — the tab contract.
 *
 * Every tab is a pure function from `(context) → Node[]`. The context carries
 * the live app record, the derived model, and one mutable bag of view state; a
 * tab mutates that bag and calls `refresh()`. There is no component framework
 * and no local state inside a tab, which is what makes a panel with fourteen
 * tabs stay predictable: a re-render is always a full re-read of the same data,
 * so a tab can never disagree with the model about what is true.
 *
 * View state lives here (rather than inside each tab) for one concrete reason:
 * a tab is torn down and rebuilt on every event, so anything it held privately
 * — a filter string, an expanded row, a pinned commit — would reset several
 * times a second in a busy app.
 */

import type { AktionDevtoolsHook, DevtoolsAppRecord } from "./hook.js";
import type { EffectPhase, LogLevel, NetworkRule } from "./protocol.js";
import type { AppModel } from "./model.js";
import type { A11yFinding } from "./a11y.js";
import type { InspectOverlay } from "./overlay.js";
import type { InteractionRecorder, RecordedStep } from "./recorder.js";
import type { SortState } from "./ui.js";

/** Every tab in the panel. */
export type TabId =
  | "overview"
  | "inspect"
  | "state"
  | "profiler"
  | "effects"
  | "network"
  | "console"
  | "routes"
  | "data"
  | "theme"
  | "source"
  | "test"
  | "timeline"
  | "settings";

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
  /* chrome */
  tab: TabId;
  paused: boolean;
  dock: DockMode;
  /** Light panel chrome, for a light-themed host page. */
  light: boolean;
  /** Denser rows, for a small dock. */
  compact: boolean;
  collapsed: boolean;
  toast: { message: string; tone: string; at: number } | null;

  /* state tab */
  stateFilter: string;
  stateExpanded: Set<string>;
  stateSort: "name" | "activity";
  stateShowReserved: boolean;
  /** Index into `model.history` while scrubbing, or `null` when live. */
  timeTravel: number | null;

  /* inspect tab */
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

  /* profiler tab */
  selectedCommitId: number | null;
  flashOnCommit: boolean;
  rankedSort: SortState;
  profilerView: "commit" | "ranked" | "insights";

  /* effects tab */
  phaseFilter: Set<EffectPhase>;
  effectView: "timeline" | "log" | "mounted";
  selectedEffect: string | null;

  /* network tab */
  networkFilter: string;
  networkOnlyProblems: boolean;
  selectedRequest: string | null;
  networkPane: "response" | "request" | "headers" | "timing";
  showRules: boolean;
  rules: NetworkRule[];

  /* console tab */
  logFilter: string;
  logLevels: Set<LogLevel>;
  captureConsole: boolean;
  repl: ReplEntry[];
  replDraft: string;
  replHistory: string[];
  replCursor: number;

  /* routes tab */
  routeDraft: string;

  /* data tab */
  dataPane: "queries" | "stores" | "storage";
  storageKind: "local" | "session" | "cookies";
  dataExpanded: Set<string>;

  /* theme tab */
  themeFilter: string;

  /* source tab */
  sourceIndex: number;
  sourceFocusLine: number | null;
  /** Unsaved edit buffer, or `null` when showing the live program. */
  sourceDraft: string | null;
  sourceOutline: boolean;

  /* test tab */
  testPane: "record" | "a11y" | "coverage" | "queries" | "chaos";
  a11yRun: A11yRun | null;
  a11ySelected: number | null;
  queryProbe: string;
  queryProbeKind: "role" | "text" | "label" | "testid" | "css";
  fuzzRun: FuzzRun | null;
  fuzzRunning: boolean;
  generatedTest: string | null;

  /* timeline tab */
  timelineKinds: Set<string>;
}

/** Fresh view state — the defaults a first-time panel opens with. */
export function defaultUiState(): UiState {
  return {
    tab: "overview",
    paused: false,
    dock: "float",
    light: false,
    compact: false,
    collapsed: false,
    toast: null,

    stateFilter: "",
    stateExpanded: new Set<string>(),
    stateSort: "name",
    stateShowReserved: false,
    timeTravel: null,

    inspectFilter: "",
    inspectCollapsed: new Set<string>(),
    selectedInstance: null,
    selectedElement: null,
    inspectPane: "props",
    inspectShowLibrary: true,
    propsExpanded: new Set<string>(),
    computedFilter: "",

    selectedCommitId: null,
    flashOnCommit: false,
    rankedSort: { key: "total", dir: -1 },
    profilerView: "commit",

    phaseFilter: new Set<EffectPhase>(["mount", "run", "cleanup", "unmount", "error"]),
    effectView: "timeline",
    selectedEffect: null,

    networkFilter: "",
    networkOnlyProblems: false,
    selectedRequest: null,
    networkPane: "response",
    showRules: false,
    rules: [],

    logFilter: "",
    logLevels: new Set<LogLevel>(["log", "info", "warn", "error", "debug"]),
    captureConsole: true,
    repl: [],
    replDraft: "",
    replHistory: [],
    replCursor: -1,

    routeDraft: "",

    dataPane: "queries",
    storageKind: "local",
    dataExpanded: new Set<string>(),

    themeFilter: "",

    sourceIndex: 0,
    sourceFocusLine: null,
    sourceDraft: null,
    sourceOutline: true,

    testPane: "record",
    a11yRun: null,
    a11ySelected: null,
    queryProbe: "",
    queryProbeKind: "role",
    fuzzRun: null,
    fuzzRunning: false,
    generatedTest: null,

    timelineKinds: new Set<string>(["commit", "effect", "network", "route", "emit", "error"]),
  };
}

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

const STORAGE_KEY = "aktion-devtools-ui";

/**
 * Read the persisted chrome preferences.
 *
 * Storage can throw (private mode, a host page with a blocked origin), and a
 * debugger that fails to open because it could not read a preference is a bad
 * trade — every failure path here returns defaults.
 */
export function loadPersisted(): PersistedUiState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedUiState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Persist the chrome preferences, ignoring any storage failure. */
export function savePersisted(state: PersistedUiState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* preference persistence is a nicety, never a requirement */
  }
}

/* -------------------------------------------------------------------------- */
/*  Tab contract                                                               */
/* -------------------------------------------------------------------------- */

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
  selectInstance(instanceKey: string | null, options?: { reveal?: boolean }): void;
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
export function can<K extends keyof DevtoolsAppRecord>(
  app: DevtoolsAppRecord | null,
  capability: K,
): app is DevtoolsAppRecord & Required<Pick<DevtoolsAppRecord, K>> {
  return app !== null && typeof app[capability] === "function";
}

/**
 * The app's render root as an `Element`.
 *
 * `getRenderRoot` may hand back a `ShadowRoot` (a host is free to paint
 * straight into one), but every DOM tool here — the audit, the recorder, the
 * query probe — needs an element to walk from. Falling back to the shadow
 * root's first element keeps those tools working instead of silently disabling
 * them for such a host.
 */
export function renderRootElement(app: DevtoolsAppRecord | null): Element | null {
  if (!can(app, "getRenderRoot")) return null;
  const root = app.getRenderRoot();
  if (root === null) return null;
  if (root instanceof Element) return root;
  return root.firstElementChild ?? null;
}
