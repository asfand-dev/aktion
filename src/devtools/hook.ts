/**
 * Aktion DevTools — the global hook.
 *
 * Mirrors the architecture of `__REACT_DEVTOOLS_GLOBAL_HOOK__`: the runtime
 * always *attempts* to talk to a hook on `globalThis`, but the calls are
 * cheap no-ops unless something has installed one. Two things can install it:
 *
 *   - the in-page DevTools UI (`mountDevtools()` from `aktion/devtools`), or
 *   - a browser-extension content script (future) that wants to relay events
 *     to a separate panel realm.
 *
 * Because the runtime only ever depends on THIS file (plus `protocol.ts` and
 * `serialize.ts`), shipping the hook adds a few hundred bytes to the main
 * bundle and zero cost at runtime until a frontend subscribes — see
 * {@link isDevtoolsActive}.
 *
 * ## Two levels of "on"
 *
 * `active` (a frontend is subscribed) gates the cheap instrumentation: commit
 * timing, state snapshots, effect lifecycle. The heavier work — per-instance
 * prop capture, `data-aktion-instance` tagging for the element picker,
 * per-commit state snapshots for time travel — is gated *separately* through
 * {@link DevtoolsHookOptions}, so a frontend can profile a heavy app without
 * paying for the inspector, and an idle-but-open panel costs less than an
 * actively-inspecting one.
 */

import type {
  AppStats,
  Diagnostic,
  DevtoolsEvent,
  EffectEventPayload,
  EffectInfo,
  EvalResult,
  InstanceDetail,
  InstanceNode,
  NetworkRule,
  ProgramAnalysis,
  QueryInfo,
  RouteInfo,
  StateAtomMeta,
  StoreInfo,
  ThemeInfo,
} from "./protocol.js";

export type { DevtoolsEvent, EffectEventPayload };

/** Property name the hook lives under on `globalThis`. */
export const HOOK_KEY = "__AKTION_DEVTOOLS_HOOK__";

/**
 * Protocol version — bumped when the event shapes change.
 *
 * `2` added the network / route / emit / log / error event kinds, per-instance
 * props + source on component records, and the inspector half of
 * {@link DevtoolsAppRecord}. Every addition is optional or additive, so a v1
 * frontend still works against a v2 backend (it just sees less).
 */
export const DEVTOOLS_PROTOCOL_VERSION = 2;

/* -------------------------------------------------------------------------- */
/*  Instrumentation switches                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Frontend-controlled instrumentation levels. The runtime reads these on the
 * render path, so each one is a plain boolean — no allocation, no lookup
 * chain. Defaults are "everything a debugger needs", because the hook only
 * exists once someone opened a debugger.
 */
export interface DevtoolsHookOptions {
  /** Collect per-instance props/arguments in every commit (Inspect tab). */
  captureProps: boolean;
  /** Stamp `data-aktion-instance` on rendered elements (element picker). */
  tagDom: boolean;
  /** Attach a `$state` snapshot to every commit (time-travel debugging). */
  captureSnapshots: boolean;
  /** Emit `network` events from the HTTP layer, and honour mock rules. */
  captureNetwork: boolean;
  /** Count DOM nodes after each commit (cheap, but a full-tree walk). */
  measureDom: boolean;
}

const DEFAULT_OPTIONS: DevtoolsHookOptions = {
  captureProps: true,
  tagDom: true,
  captureSnapshots: true,
  captureNetwork: true,
  measureDom: true,
};

/* -------------------------------------------------------------------------- */
/*  App registry                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The handle a frontend gets for one live `<aktion-app>`.
 *
 * The first five members are the v1 contract and are always present. Everything
 * below them is **optional**: a frontend must feature-detect (the panel's
 * `can()` helper does), so an older runtime, a partially-implemented host, or a
 * relay that can only forward a subset all keep working instead of throwing
 * halfway through rendering a tab.
 *
 * Every capability here is something a debugger legitimately needs. None of
 * them hand out raw runtime internals: the tree is a snapshot, values are
 * serialised (see `serialize.ts`), and every write goes through the same
 * reactive pipeline a real event handler uses.
 */
export interface DevtoolsAppRecord {
  /** Stable per-element id (`aktion-app-1`). */
  id: string;
  /** Human label shown in the app picker. */
  label: string;
  /** The live custom element (used for highlight flashes / scroll-into-view). */
  element: HTMLElement;
  /** Current reactive `$state` snapshot. */
  getState(): Record<string, unknown>;
  /**
   * Apply an edit to a reactive atom. `path` may be dotted (`user.name`);
   * the write goes through the normal reactive pipeline so dependents
   * re-render and computed atoms re-derive.
   */
  setState(path: string, value: unknown): void;
  /** The current program source text. */
  getProgram(): string;
  /** Force a full (non-memoized) re-render — handy after a manual edit. */
  forceRender(): void;

  /* ---- Program & diagnostics ---------------------------------------- */

  /** Replace the running program (hot swap from the Source tab). */
  setProgram?(text: string): void;
  /** Per-module sources for a linked multi-file program. */
  getSources?(): Array<{ path: string; text: string }>;
  /** Structured parse + schema diagnostics from the last plan. */
  getDiagnostics?(): Diagnostic[];
  /**
   * Parse + validate a program without mounting it, and outline its
   * declarations. Omit `text` to analyse the running program.
   *
   * The frontend delegates rather than bundling a parser of its own: an
   * inspector that parsed independently could disagree with the runtime about
   * whether a program is valid, which is the one thing it must never do.
   */
  analyzeProgram?(text?: string): ProgramAnalysis;
  /** Re-plan and re-render from the current source (hot reload). */
  reload?(): void;

  /* ---- Inspector ---------------------------------------------------- */

  /** The root the app paints into — the anchor for all DOM inspection. */
  getRenderRoot?(): ShadowRoot | HTMLElement | null;
  /** Component-instance tree as of the last commit. */
  getComponentTree?(): InstanceNode[];
  /** Deep detail for one instance: props, hooks, UI state, deps, DOM. */
  getInstance?(instanceKey: string): InstanceDetail | null;
  /** The instance key a DOM node belongs to (element picker → tree). */
  instanceForNode?(node: Node): string | null;
  /** The DOM node an instance rendered, for highlighting and measuring. */
  nodeForInstance?(instanceKey: string): Element | null;
  /** Overwrite one per-instance hook cell (`$state` / `$memo` / `$ref`). */
  setInstanceHook?(instanceKey: string, slot: number, value: unknown): boolean;
  /** Overwrite one `useInstanceState` slot (a Tabs' active pane, …). */
  setInstanceUiState?(instanceKey: string, key: string, value: unknown): boolean;
  /** Override a prop for one instance until the override is cleared. */
  setPropOverride?(instanceKey: string, prop: string, value: unknown): void;
  /** Drop one prop override, or every override on the instance. */
  clearPropOverride?(instanceKey: string, prop?: string): void;
  /** Every active override, for the Inspect tab's "overrides" banner. */
  listPropOverrides?(): Array<{ instanceKey: string; prop: string; preview: string }>;
  /** Drop an instance's memo + hook cells so it re-mounts from scratch. */
  remountInstance?(instanceKey: string): void;

  /* ---- Reactive state ---------------------------------------------- */

  /** Declaration metadata for every atom (reserved / computed / source). */
  getStateMeta?(): StateAtomMeta[];
  /** Reset the named atoms (or all of them) to their declared initial value. */
  resetState?(names?: string[]): void;
  /** Replace the whole store — the write half of time-travel debugging. */
  hydrateState?(snapshot: Record<string, unknown>): void;
  /** Evaluate an Aktion expression against the live program scope. */
  evaluateExpression?(source: string): EvalResult;

  /* ---- Effects ----------------------------------------------------- */

  /** Every mounted effect, with its triggers and subscriptions. */
  getEffects?(): EffectInfo[];
  /** Run one effect's body now, as if its trigger had fired. */
  runEffect?(effectKey: string): boolean;

  /* ---- Data layer -------------------------------------------------- */

  /** Live `$query` / `Http({...})` resources in the shared cache. */
  getQueries?(): QueryInfo[];
  /** Refetch one cached query by key. */
  refetchQuery?(key: string): void;
  /** Cancel one in-flight query by key. */
  cancelQuery?(key: string): void;
  /** Invalidate every query whose key contains `pattern`. */
  invalidateQueries?(pattern: string): void;
  /** Live `Store({...})` / `$form({...})` handles. */
  getStores?(): StoreInfo[];
  /** Call a method on a store handle (`store.reset()`). */
  callStoreMethod?(atom: string, method: string, args?: unknown[]): EvalResult;

  /* ---- Router ------------------------------------------------------ */

  /** Current path, params, mode, and the patterns the program declares. */
  getRoute?(): RouteInfo;
  /** Navigate the app's router (respects its guard). */
  navigate?(path: string): void;

  /* ---- Theme ------------------------------------------------------- */

  /** Resolved theme tokens plus which ones are currently overridden. */
  getTheme?(): ThemeInfo;
  /** Apply DevTools token overrides on top of the resolved theme. */
  setThemeTokens?(tokens: Record<string, string>): void;
  /** Drop every DevTools token override. */
  clearThemeTokens?(): void;
  /** Switch the whole theme by built-in name. */
  setThemeName?(name: string): void;

  /* ---- Network rules ----------------------------------------------- */

  /** Install DevTools request rules (delay / mock / fail / offline). */
  setNetworkRules?(rules: NetworkRule[]): void;
  /** Read back the installed rules. */
  getNetworkRules?(): NetworkRule[];

  /* ---- Stats ------------------------------------------------------- */

  /** Cheap runtime counters for the overview + perf tabs. */
  getStats?(): AppStats;
}

export type DevtoolsEventListener = (event: DevtoolsEvent) => void;
export type DevtoolsAppListener = (
  action: "register" | "unregister",
  app: DevtoolsAppRecord,
) => void;

/* -------------------------------------------------------------------------- */
/*  Hook contract                                                              */
/* -------------------------------------------------------------------------- */

export interface AktionDevtoolsHook {
  /** Marker so a frontend can be sure it found the genuine hub. */
  readonly aktion: true;
  /** Protocol version of the installed hub. */
  readonly protocolVersion: number;
  /** Runtime library version that last touched the hook (best-effort). */
  libraryVersion: string;
  /** Apps currently mounted on the page, keyed by id. */
  readonly apps: Map<string, DevtoolsAppRecord>;
  /**
   * Ring buffer of recent events so a frontend that attaches *after* an app
   * has already rendered can backfill its timeline. Capped to `bufferLimit`.
   */
  readonly buffer: DevtoolsEvent[];
  /** Max events retained in {@link buffer}. */
  bufferLimit: number;
  /**
   * True once at least one frontend is listening. The runtime checks this to
   * decide whether to pay for profiler bookkeeping — when no DevTools is open
   * the answer is `false` and the instrumentation stays dormant.
   */
  readonly active: boolean;
  /** Instrumentation switches the runtime reads (see {@link DevtoolsHookOptions}). */
  readonly options: DevtoolsHookOptions;
  /** Merge new instrumentation switches; unspecified keys keep their value. */
  setOptions(patch: Partial<DevtoolsHookOptions>): void;

  /* runtime → hook */
  emit(event: DevtoolsEvent): void;
  registerApp(app: DevtoolsAppRecord): void;
  unregisterApp(id: string): void;

  /* hook → frontend */
  subscribe(listener: DevtoolsEventListener): () => void;
  subscribeApps(listener: DevtoolsAppListener): () => void;
  /** Drop the backfill buffer (the panel's "clear all" does this). */
  clearBuffer(): void;
}

/* -------------------------------------------------------------------------- */
/*  Global accessors                                                           */
/* -------------------------------------------------------------------------- */

interface HookGlobal {
  [HOOK_KEY]?: AktionDevtoolsHook;
}

function hookGlobal(): HookGlobal {
  // `globalThis` is universal across browsers, workers, and the test DOM.
  return globalThis as unknown as HookGlobal;
}

/** Return the installed hook, or `undefined` when no DevTools is present. */
export function getDevtoolsHook(): AktionDevtoolsHook | undefined {
  return hookGlobal()[HOOK_KEY];
}

/**
 * Cheap predicate the runtime uses to gate profiling work. Returns `true`
 * only when a hook exists AND a frontend is actually subscribed, so an
 * installed-but-idle hook still costs nothing.
 */
export function isDevtoolsActive(): boolean {
  const hook = getDevtoolsHook();
  return hook !== undefined && hook.active;
}

/**
 * Read one instrumentation switch, defaulting to `false` when no frontend is
 * attached. Call sites read like a feature flag:
 * `if (devtoolsOption("tagDom")) …`.
 */
export function devtoolsOption(key: keyof DevtoolsHookOptions): boolean {
  const hook = getDevtoolsHook();
  if (hook === undefined || !hook.active) return false;
  return hook.options[key];
}

/* ---- runtime-facing emit helpers (all no-op without a hook) ------------- */

/** Emit one event to the hook if present. */
export function emitDevtoolsEvent(event: DevtoolsEvent): void {
  getDevtoolsHook()?.emit(event);
}

/** Register a live app with the hook if present. */
export function registerDevtoolsApp(app: DevtoolsAppRecord): void {
  getDevtoolsHook()?.registerApp(app);
}

/** Remove an app from the hook if present. */
export function unregisterDevtoolsApp(id: string): void {
  getDevtoolsHook()?.unregisterApp(id);
}

/* -------------------------------------------------------------------------- */
/*  Default hub                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Install (idempotently) the reference hub implementation and return it. The
 * in-page UI calls this; a browser extension could install its own
 * conforming object instead. Calling it twice returns the same instance, so
 * multiple `mountDevtools()` panels share one event stream.
 */
export function installDevtoolsHook(libraryVersion = "0.6.x"): AktionDevtoolsHook {
  const existing = getDevtoolsHook();
  if (existing) {
    // Refresh the recorded library version but keep the live registry +
    // subscribers intact so a second panel attaches to the same hub.
    existing.libraryVersion = libraryVersion;
    return existing;
  }

  const eventListeners = new Set<DevtoolsEventListener>();
  const appListeners = new Set<DevtoolsAppListener>();
  const apps = new Map<string, DevtoolsAppRecord>();
  const buffer: DevtoolsEvent[] = [];
  const options: DevtoolsHookOptions = { ...DEFAULT_OPTIONS };

  const hook: AktionDevtoolsHook = {
    aktion: true,
    protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    libraryVersion,
    apps,
    buffer,
    bufferLimit: 2000,
    options,
    get active() {
      return eventListeners.size > 0 || appListeners.size > 0;
    },

    setOptions(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value === "boolean" && key in options) {
          (options as unknown as Record<string, boolean>)[key] = value;
        }
      }
    },

    emit(event) {
      buffer.push(event);
      // Trim from the front so the buffer stays bounded for long sessions.
      if (buffer.length > hook.bufferLimit) {
        buffer.splice(0, buffer.length - hook.bufferLimit);
      }
      for (const listener of [...eventListeners]) {
        try {
          listener(event);
        } catch (err) {
          // A misbehaving frontend must never break the app it inspects.
          // eslint-disable-next-line no-console
          console.error("[aktion-devtools] event listener threw", err);
        }
      }
    },

    registerApp(app) {
      apps.set(app.id, app);
      for (const listener of [...appListeners]) {
        try {
          listener("register", app);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[aktion-devtools] app listener threw", err);
        }
      }
    },

    unregisterApp(id) {
      const app = apps.get(id);
      if (!app) return;
      apps.delete(id);
      for (const listener of [...appListeners]) {
        try {
          listener("unregister", app);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[aktion-devtools] app listener threw", err);
        }
      }
    },

    subscribe(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },

    subscribeApps(listener) {
      appListeners.add(listener);
      return () => appListeners.delete(listener);
    },

    clearBuffer() {
      buffer.length = 0;
    },
  };

  hookGlobal()[HOOK_KEY] = hook;
  return hook;
}

/* -------------------------------------------------------------------------- */
/*  Timing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * High-resolution monotonic clock in milliseconds, with a `Date.now()`
 * fallback for environments without `performance` (some headless DOMs).
 */
export function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
