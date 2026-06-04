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
 * Because the runtime only ever depends on THIS file (and `protocol.ts`),
 * shipping the hook adds a few hundred bytes to the main bundle and zero
 * cost at runtime until a frontend subscribes — see {@link isDevtoolsActive}.
 */

import type {
  DevtoolsEvent,
  EffectEventPayload,
} from "./protocol.js";

export type { DevtoolsEvent, EffectEventPayload };

/** Property name the hook lives under on `globalThis`. */
export const HOOK_KEY = "__AKTION_DEVTOOLS_HOOK__";

/** Protocol version — bumped if the event shapes change incompatibly. */
export const DEVTOOLS_PROTOCOL_VERSION = 1;

/* -------------------------------------------------------------------------- */
/*  App registry                                                               */
/* -------------------------------------------------------------------------- */

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

  /* runtime → hook */
  emit(event: DevtoolsEvent): void;
  registerApp(app: DevtoolsAppRecord): void;
  unregisterApp(id: string): void;

  /* hook → frontend */
  subscribe(listener: DevtoolsEventListener): () => void;
  subscribeApps(listener: DevtoolsAppListener): () => void;
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
export function installDevtoolsHook(libraryVersion = "0.5.x"): AktionDevtoolsHook {
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

  const hook: AktionDevtoolsHook = {
    aktion: true,
    protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    libraryVersion,
    apps,
    buffer,
    bufferLimit: 500,
    get active() {
      return eventListeners.size > 0 || appListeners.size > 0;
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
