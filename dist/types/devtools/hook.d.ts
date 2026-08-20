import { DevtoolsEvent, EffectEventPayload } from './protocol.js';
export type { DevtoolsEvent, EffectEventPayload };
/** Property name the hook lives under on `globalThis`. */
export declare const HOOK_KEY = "__AKTION_DEVTOOLS_HOOK__";
/** Protocol version — bumped if the event shapes change incompatibly. */
export declare const DEVTOOLS_PROTOCOL_VERSION = 1;
/**
 * The handle a frontend gets for one live `<aktion-app>`. It deliberately
 * exposes only what a debugger legitimately needs — read the current state,
 * push an edit back, read the program source, force a render, and reach the
 * host element for DOM highlighting — never the raw runtime internals.
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
    emit(event: DevtoolsEvent): void;
    registerApp(app: DevtoolsAppRecord): void;
    unregisterApp(id: string): void;
    subscribe(listener: DevtoolsEventListener): () => void;
    subscribeApps(listener: DevtoolsAppListener): () => void;
}
/** Return the installed hook, or `undefined` when no DevTools is present. */
export declare function getDevtoolsHook(): AktionDevtoolsHook | undefined;
/**
 * Cheap predicate the runtime uses to gate profiling work. Returns `true`
 * only when a hook exists AND a frontend is actually subscribed, so an
 * installed-but-idle hook still costs nothing.
 */
export declare function isDevtoolsActive(): boolean;
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
