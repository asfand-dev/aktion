import { AppStats, Diagnostic, DevtoolsEvent, EffectEventPayload, EffectInfo, EvalResult, InstanceDetail, InstanceNode, NetworkRule, ProgramAnalysis, QueryInfo, RouteInfo, StateAtomMeta, StoreInfo, ThemeInfo } from './protocol.js';
export type { DevtoolsEvent, EffectEventPayload };
/** Property name the hook lives under on `globalThis`. */
export declare const HOOK_KEY = "__AKTION_DEVTOOLS_HOOK__";
/**
 * Protocol version — bumped when the event shapes change.
 *
 * `2` added the network / route / emit / log / error event kinds, per-instance
 * props + source on component records, and the inspector half of
 * {@link DevtoolsAppRecord}. Every addition is optional or additive, so a v1
 * frontend still works against a v2 backend (it just sees less).
 */
export declare const DEVTOOLS_PROTOCOL_VERSION = 2;
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
    /** Replace the running program (hot swap from the Source tab). */
    setProgram?(text: string): void;
    /** Per-module sources for a linked multi-file program. */
    getSources?(): Array<{
        path: string;
        text: string;
    }>;
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
    listPropOverrides?(): Array<{
        instanceKey: string;
        prop: string;
        preview: string;
    }>;
    /** Drop an instance's memo + hook cells so it re-mounts from scratch. */
    remountInstance?(instanceKey: string): void;
    /** Declaration metadata for every atom (reserved / computed / source). */
    getStateMeta?(): StateAtomMeta[];
    /** Reset the named atoms (or all of them) to their declared initial value. */
    resetState?(names?: string[]): void;
    /** Replace the whole store — the write half of time-travel debugging. */
    hydrateState?(snapshot: Record<string, unknown>): void;
    /** Evaluate an Aktion expression against the live program scope. */
    evaluateExpression?(source: string): EvalResult;
    /** Every mounted effect, with its triggers and subscriptions. */
    getEffects?(): EffectInfo[];
    /** Run one effect's body now, as if its trigger had fired. */
    runEffect?(effectKey: string): boolean;
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
    /** Current path, params, mode, and the patterns the program declares. */
    getRoute?(): RouteInfo;
    /** Navigate the app's router (respects its guard). */
    navigate?(path: string): void;
    /** Resolved theme tokens plus which ones are currently overridden. */
    getTheme?(): ThemeInfo;
    /** Apply DevTools token overrides on top of the resolved theme. */
    setThemeTokens?(tokens: Record<string, string>): void;
    /** Drop every DevTools token override. */
    clearThemeTokens?(): void;
    /** Switch the whole theme by built-in name. */
    setThemeName?(name: string): void;
    /** Install DevTools request rules (delay / mock / fail / offline). */
    setNetworkRules?(rules: NetworkRule[]): void;
    /** Read back the installed rules. */
    getNetworkRules?(): NetworkRule[];
    /** Cheap runtime counters for the overview + perf tabs. */
    getStats?(): AppStats;
}
export type DevtoolsEventListener = (event: DevtoolsEvent) => void;
export type DevtoolsAppListener = (action: "register" | "unregister", app: DevtoolsAppRecord) => void;
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
    emit(event: DevtoolsEvent): void;
    registerApp(app: DevtoolsAppRecord): void;
    unregisterApp(id: string): void;
    subscribe(listener: DevtoolsEventListener): () => void;
    subscribeApps(listener: DevtoolsAppListener): () => void;
    /** Drop the backfill buffer (the panel's "clear all" does this). */
    clearBuffer(): void;
}
/** Return the installed hook, or `undefined` when no DevTools is present. */
export declare function getDevtoolsHook(): AktionDevtoolsHook | undefined;
/**
 * Cheap predicate the runtime uses to gate profiling work. Returns `true`
 * only when a hook exists AND a frontend is actually subscribed, so an
 * installed-but-idle hook still costs nothing.
 */
export declare function isDevtoolsActive(): boolean;
/**
 * Read one instrumentation switch, defaulting to `false` when no frontend is
 * attached. Call sites read like a feature flag:
 * `if (devtoolsOption("tagDom")) …`.
 */
export declare function devtoolsOption(key: keyof DevtoolsHookOptions): boolean;
/** Emit one event to the hook if present. */
export declare function emitDevtoolsEvent(event: DevtoolsEvent): void;
/** Register a live app with the hook if present. */
export declare function registerDevtoolsApp(app: DevtoolsAppRecord): void;
/** Remove an app from the hook if present. */
export declare function unregisterDevtoolsApp(id: string): void;
/**
 * Install (idempotently) the reference hub implementation and return it. The
 * in-page UI calls this; a browser extension could install its own
 * conforming object instead. Calling it twice returns the same instance, so
 * multiple `mountDevtools()` panels share one event stream.
 */
export declare function installDevtoolsHook(libraryVersion?: string): AktionDevtoolsHook;
/**
 * High-resolution monotonic clock in milliseconds, with a `Date.now()`
 * fallback for environments without `performance` (some headless DOMs).
 */
export declare function nowMs(): number;
