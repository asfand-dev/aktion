import { EvaluationContext, ScopedEffectDecl } from '../runtime/evaluator.js';
import { StateStore } from '../runtime/state.js';
import { Router } from '../runtime/router.js';
import { ComponentLibrary } from '../library/types.js';
import { ComponentRenderRecord } from '../devtools/protocol.js';
export interface RenderOptions {
    library: ComponentLibrary;
    state: StateStore;
    /** Hash-based router. Required: components read the active path through it. */
    router: Router;
    /** Optional callback for `helpers.sendToAssistant(message)` dispatch. */
    onAssistantMessage?: (message: string) => void;
    /** Optional override for `helpers.openUrl(url)` (defaults to `window.open`). */
    onOpenUrl?: (url: string) => void;
    /**
     * Evaluation context used to expand user-declared `component` calls
     * (per-instance state isolation, lazy body evaluation, §7). The host
     * element passes its program context here; if absent, user components
     * render as `[unknown component: <Name>]` so the failure is visible.
     */
    evaluationContext?: () => EvaluationContext;
    /**
     * Mount `effect(() => { … }, [deps])` declarations discovered inside a
     * `component { … }` body. Called by the renderer after every render of
     * the instance; the implementation is expected to be idempotent so
     * re-renders are no-ops once the effects are mounted. The host wires
     * this to the same `EffectRunner` that handles top-level effects.
     *
     * Each entry pairs the declaration with the per-instance alias frames
     * captured when the body was walked, so writes inside the effect body
     * resolve to the same per-instance state slots the component itself
     * uses.
     */
    mountInstanceEffects?: (instanceKey: string, decls: ReadonlyArray<ScopedEffectDecl>, getCtx: () => EvaluationContext) => void;
    /**
     * Tear down every per-instance effect mounted under `instanceKey`.
     * Invoked when the component instance disappears from the render tree
     * (between two `beginRender`/`endRender` passes).
     */
    unmountInstanceEffects?: (instanceKey: string) => void;
    /**
     * Drop the per-instance hook cells (`$state` / `$memo`) held under
     * `instanceKey`. Invoked when a component that used hooks disappears from
     * the render tree, giving React-like reset-on-unmount: a future remount
     * starts its `$state` from the initial value again. The host wires this to
     * `clearInstanceHooks(ctx, key)`.
     */
    unmountInstanceHooks?: (instanceKey: string) => void;
}
export declare class Renderer {
    private options;
    /**
     * Persistent state cells, keyed by `instancePath::userKey`. Lives as long
     * as the component instance is rendered. Stale entries are garbage-
     * collected at the end of each render (see `endRender`).
     */
    private readonly instanceStates;
    /**
     * Cleanup callbacks per instance path. Each entry holds either a single
     * disposer (anonymous registration) or a map keyed by user-provided
     * identifier so callers can register, replace, and (transitively) cancel
     * prior cleanups for the same logical concern.
     */
    private readonly instanceDisposers;
    /** Instance paths seen during the current render — used to GC stale state. */
    private aliveInstances;
    /**
     * Instances painted OUTSIDE a render pass — `helpers.renderNode` called from
     * a deferred callback, i.e. `Lazy` swapping in its resolved subtree — mapped
     * to the instance that painted them.
     *
     * Such a subtree registers its liveness against a pass that has already
     * closed, so `endRender` used to find those paths missing from the NEXT
     * pass's set and GC their state cells / run their disposers underneath a
     * subtree the user can still see (a `Tabs` inside a lazily-painted panel lost
     * its active tab and its observers). They stay alive here for as long as the
     * instance that painted them does.
     */
    private readonly externalInstances;
    /** The instance whose `renderNode` is currently painting out of band. */
    private externalOwner;
    /** >0 while a render pass is on the stack (`render` → `renderAt` → …). */
    private passDepth;
    /**
     * User-declared component instances that currently hold per-instance
     * effects (mounted via `mountInstanceEffects`). Tracked separately from
     * `instanceStates` so the renderer can fire `unmountInstanceEffects` on
     * GC even when an instance never registered `useInstanceState`.
     */
    private readonly instancesWithEffects;
    /**
     * User-declared component instances that currently hold per-instance hook
     * cells (`$state` / `$memo`). Tracked so the renderer can fire
     * `unmountInstanceHooks` when the instance leaves the tree.
     */
    private readonly instancesWithHooks;
    /**
     * Per-instance render memo (React.memo / Solid-style granularity). Keyed by
     * instance path; holds the args + the `$state` paths the body read + the
     * body's last return value. On a re-render where the change paths are fully
     * known, an instance whose args are unchanged AND whose read-paths don't
     * overlap the change set reuses its cached value — its body (and its
     * `console.log`s / work) is skipped. Reusing the *value* (not the DOM) means
     * children are still visited and re-checked against their own memo, so a
     * descendant that reads a changed path still re-renders. GC'd in `endRender`.
     */
    private readonly memoCache;
    /**
     * Paths changed since the last render (set by the host before `render`).
     * Drives memoization. `null`/empty + `memoEnabled=false` ⇒ full re-render.
     */
    private changedPaths;
    /** Whether memoization may apply this render (false on mount / replan / notify). */
    private memoEnabled;
    /**
     * When `true`, each render appends a {@link ComponentRenderRecord} per
     * visited instance to {@link profilerRecords}. Toggled by the host element
     * once a DevTools frontend is actually listening, so a closed inspector
     * costs nothing. See `setProfiling`.
     */
    private profiling;
    /** Per-commit profiler records, drained by the host after each render. */
    private profilerRecords;
    /**
     * Every instance key seen in a *previous* render, so the profiler can label
     * a record `mount` (first sighting) vs `update`. Pruned in `endRender` so it
     * tracks exactly the live tree. Only maintained while profiling.
     */
    private profiledInstances;
    constructor(options: RenderOptions);
    /**
     * Enable/disable the render profiler. The host element flips this on when a
     * DevTools frontend subscribes and off when it disconnects, so the common
     * (no-DevTools) path never allocates a record or reads the clock.
     */
    setProfiling(enabled: boolean): void;
    /** Hand the current commit's component records to the host, then clear. */
    drainProfilerRecords(): ComponentRenderRecord[];
    /** Tree depth for flamegraph indentation — one level per `#instance` segment. */
    private depthOf;
    /**
     * Swap the component library backing this renderer. Used when the host
     * element calls `registerComponents(...)` after first paint — preserves
     * any `useInstanceState` slots so stateful primitives (Tabs, Popover,
     * DropdownMenu, …) don't snap back to their initial values mid-session.
     */
    setLibrary(library: ComponentLibrary): void;
    /**
     * Drop all persistent per-instance state. Called when the host element
     * is `clear()`ed so a fresh program starts with a clean slate.
     */
    reset(): void;
    /**
     * Begin a fresh render pass; tracks which instances are still alive.
     *
     * `changedPaths` is the set of `$state` paths that changed since the last
     * render and `memoize` says whether per-component memoization may apply
     * (false on first paint, replan, or a `notify()`-driven render where the
     * change set isn't fully known — those re-render everything).
     */
    beginRender(opts?: {
        changedPaths?: ReadonlySet<string>;
        memoize?: boolean;
    }): void;
    /**
     * End the current render pass. Drops instance state for components that
     * disappeared from the tree so the map doesn't grow unbounded.
     */
    endRender(): void;
    /** Record one component instance's contribution to the current commit. */
    private profile;
    private safeDispose;
    /**
     * Apply a state write addressed by either a plain atom name
     * (`$count` → `"count"`) or a dotted path (`$form.email` →
     * `"form.email"`). Dotted writes go through `state.setPath` so the
     * root object is reconstructed immutably and subscribers wake up.
     */
    private writeState;
    /**
     * Render a program's UI root.
     *
     * A non-array root is normalised to a one-slot list so the author's tree
     * ALWAYS hangs off `$/0`, never off `$` itself. That single `/0` is load-
     * bearing: `useInstanceState` is keyed by `instancePath`, and an instance
     * path is the chain of positions from the root down (`$/0#Tabs@42:6`). A root
     * that is bare one render and wrapped in a list the next therefore re-keys
     * every component in the program at once, and `endRender` reclaims the old
     * keys as dead — so component-local UI state (the active `Tabs` pane, an open
     * `Popover`, a `DataGrid`'s sort / page / column layout) resets for reasons
     * the author cannot see.
     *
     * The runtime does exactly that whenever it has a sibling layer to add beside
     * the author's root: the auto-injected `$toast` stack turns `root` into
     * `[root, layer]` for as long as a toast is on screen (see
     * `installAppRootBinding`), so a single `$toast.success("Saved")` used to snap
     * the active tab back to its `defaultValue` three components away. Normalising
     * here fixes that for every present and future root-level layer rather than
     * for one caller.
     */
    render(value: unknown): Node;
    /**
     * Record that `instancePath` is part of the tree the user can see.
     *
     * Inside a pass that is just the pass's own alive-set. Outside one (a
     * deferred `helpers.renderNode`) the pass's set is already closed, so the
     * instance is remembered against the component that painted it — see
     * {@link externalInstances}.
     */
    private markAlive;
    /**
     * Render a subtree painted outside a render pass, attributed to `owner` (the
     * instance whose `helpers.renderNode` is doing the painting).
     */
    private renderExternal;
    private renderAt;
    /**
     * Expand a user-declared `function Foo(p) { return ... }` invocation. Each
     * instance gets a stable instance key derived from its render path (or
     * the caller's explicit `key:` override); the evaluator then evaluates
     * the component's body with a fresh per-instance state-alias scope so
     * two `Counter()` instances hold independent atoms (§7).
     */
    private renderUserComponent;
    private renderComponent;
    private eventFor;
    private defaultValueGetter;
}
