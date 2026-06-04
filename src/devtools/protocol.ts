/**
 * Aktion DevTools — wire protocol.
 *
 * The runtime ("backend") and the DevTools UI ("frontend") only ever talk
 * through the structured events declared here, exactly like the
 * React/Vue DevTools split. Keeping the protocol in its own dependency-free
 * module means:
 *
 *   - the runtime can emit events without pulling in any UI code, and
 *   - a future *browser-extension* frontend (running in a different realm,
 *     behind `postMessage`) can re-use the identical, JSON-serialisable
 *     shapes without importing the runtime.
 *
 * Every payload is plain data — no class instances, no DOM nodes, no
 * functions — so an event survives `structuredClone` / `JSON` transport.
 */

/** Discriminator shared by every event flowing over the hook. */
export type DevtoolsEventKind = "commit" | "state" | "effect";

/* -------------------------------------------------------------------------- */
/*  Render profiler                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What happened to one component instance during a commit.
 *   - `mount`  — first time this instance appeared in the tree.
 *   - `update` — re-evaluated (its args or a `$state` dep it reads changed,
 *                or the commit was a forced full render).
 *   - `memo`   — skipped via per-instance memoization; its cached value was
 *                reused and its body did NOT run.
 */
export type RenderPhase = "mount" | "update" | "memo";

/** Whether a component is a user `function Foo()` or a built-in library one. */
export type ComponentKind = "user" | "library";

/** One component instance's contribution to a single commit. */
export interface ComponentRenderRecord {
  /** Stable per-instance key derived from the render path. */
  instanceKey: string;
  /** Display name (`Counter`, `Button`, …). */
  name: string;
  /** `user` (`function Foo()`) or `library` (built-in primitive). */
  kind: ComponentKind;
  /** Render phase for this commit. */
  phase: RenderPhase;
  /**
   * Self time in milliseconds.
   *   - user components: body-evaluation time only (children excluded).
   *   - library components: inclusive of synchronously-rendered children
   *     (their render function builds the subtree in one call).
   * Zero for `memo` (skipped) records.
   */
  selfTime: number;
  /** Nesting depth in the render tree — drives flamegraph indentation. */
  depth: number;
  /** For user components: the `$state` paths this body read (its memo deps). */
  deps?: string[];
  /** Human-readable reason the instance rendered (or was skipped). */
  reason: string;
}

/** A single committed render pass over the whole program tree. */
export interface CommitRecord {
  kind: "commit";
  appId: string;
  /** Monotonic sequence number within the app (0 = initial mount). */
  commitId: number;
  /** Timestamp (ms, from `nowMs()`) when the commit started. */
  startTime: number;
  /** Total wall-clock time of the commit (evaluate → render → morph), in ms. */
  duration: number;
  /** Reactive `$state` paths that triggered this commit (empty if forced). */
  changedPaths: string[];
  /** True when memoization was disabled and the whole tree re-evaluated. */
  fullRender: boolean;
  /** True for the very first commit of the program (initial mount). */
  initial: boolean;
  /** Per-instance records (both rendered and memoized), in render order. */
  components: ComponentRenderRecord[];
  /** Number of instances that actually rendered (phase !== "memo"). */
  rendered: number;
  /** Number of instances skipped via memoization. */
  memoized: number;
}

/* -------------------------------------------------------------------------- */
/*  State inspector                                                            */
/* -------------------------------------------------------------------------- */

/** A reactive-state change notification (one per state-store flush). */
export interface StateEvent {
  kind: "state";
  appId: string;
  /** Full reactive `$state` snapshot after the change. */
  snapshot: Record<string, unknown>;
  /** Dotted paths changed in this flush (`count`, `user.name`, …). */
  changedPaths: string[];
  /** Timestamp (ms, from `nowMs()`). */
  time: number;
}

/* -------------------------------------------------------------------------- */
/*  Effect timeline                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Effect lifecycle phases.
 *   - `mount`   — the declaration was registered (subscriptions/intervals wired).
 *   - `run`     — the effect body executed.
 *   - `cleanup` — registered `cleanup(fn)` handlers fired (before a re-run or teardown).
 *   - `unmount` — the declaration was torn down (instance left the tree / replan).
 *   - `error`   — the body threw.
 */
export type EffectPhase = "mount" | "run" | "cleanup" | "unmount" | "error";

/**
 * The runtime-facing half of an effect event — everything the
 * {@link EffectRunner} can compute on its own. The host element stamps on
 * `appId` + `time` to produce the full {@link EffectEvent}.
 */
export interface EffectEventPayload {
  /** Mounted-effect key (`__effect_L3_C1`, or `<instanceKey>::<name>`). */
  effectKey: string;
  /** Friendly label (`effect @ L3:C1`). */
  label: string;
  /** Owning component instance key, or `null` for a top-level effect. */
  instanceKey: string | null;
  phase: EffectPhase;
  /** Why this happened: `mount`, `state:count`, `every(1000)`, `cleanup`, `unmount`. */
  reason: string;
  /** Declared trigger summary (`["mount", $count]`). */
  triggers: string;
  /** Body run time in ms (only for `run`). */
  duration?: number;
  /** Number of cleanup handlers fired (only for `cleanup`). */
  cleanups?: number;
  /** Error message (only for `error`). */
  error?: string;
}

/** A timeline-ready effect event. */
export interface EffectEvent extends EffectEventPayload {
  kind: "effect";
  appId: string;
  /** Timestamp (ms, from `nowMs()`). */
  time: number;
}

/* -------------------------------------------------------------------------- */

/** The full union of events the hook fans out to DevTools frontends. */
export type DevtoolsEvent = CommitRecord | StateEvent | EffectEvent;
