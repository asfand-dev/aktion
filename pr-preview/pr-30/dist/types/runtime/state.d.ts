/**
 * Lightweight reactive state container.
 *
 * Each `$variable` is tracked here. Components and queries subscribe to a
 * specific set of state names; when any of them changes, their `notify`
 * callback fires. There are no proxies or Symbols on the user-facing API,
 * which keeps the surface small and predictable.
 */
export type StateValue = unknown;
/**
 * Subscribers receive the set of **changed paths** since the last flush, not
 * just atom names. A whole-atom write (`set("user", …)`) reports the root
 * path `"user"`; a nested write (`setPath("user", ["name"], …)`) reports the
 * precise path `"user.name"`. Consumers decide whether a change is relevant
 * to them with `pathAffects` / `anyPathAffects` (the prefix-overlap rule),
 * which is what gives Aktion fine-grained reactivity: a dependency on
 * `user.name` ignores a `user.role` write but still wakes for a `user`
 * (ancestor) replacement.
 */
export type Subscriber = (changedPaths: ReadonlySet<string>) => void;
/**
 * Join an atom name and a nested path into the canonical dotted dependency
 * key (`"user"`, `"user.name"`, `"cart.items.0.qty"`).
 */
export declare function joinStatePath(rootName: string, path: ReadonlyArray<string>): string;
/**
 * The core fine-grained-reactivity predicate: does a change to path
 * `changed` affect a dependency on path `dep`?
 *
 * True when the two paths lie on the same root-to-leaf line — i.e. they are
 * equal, `changed` is an ancestor of `dep` (the whole subtree the dep lives
 * in was replaced), or `dep` is an ancestor of `changed` (a field inside the
 * value the dep reads changed). Sibling paths (`user.name` vs `user.role`)
 * never affect each other. Boundaries are matched at dot separators so
 * `user` does not spuriously match `username`.
 */
export declare function pathAffects(changed: string, dep: string): boolean;
/** True when any path in `changed` affects the single dependency `dep`. */
export declare function anyPathAffects(changed: ReadonlySet<string>, dep: string): boolean;
/** True when any path in `changed` affects any dependency in `deps`. */
export declare function pathsOverlap(changed: ReadonlySet<string>, deps: Iterable<string>): boolean;
export declare class StateStore {
    private values;
    private defaults;
    private subscribers;
    private pendingChanges;
    private flushScheduled;
    /**
     * True while the host is evaluating a render. Writes that land in this
     * window still update the value, but are NOT broadcast as changes — so a
     * `$x = …` assignment running in render position can't schedule a re-render
     * that re-runs the same write and loops forever. Writing reactive state
     * during render is an anti-pattern (React/Vue/Solid all guard against it);
     * we degrade gracefully instead of freezing the tab.
     */
    private rendering;
    /** Set when a write was suppressed during the render pass (for diagnostics). */
    private renderWriteOccurred;
    /**
     * Atoms the HOST supplied rather than the program — via `hydrateState`,
     * `loadSnapshot`, SSR hydration, or a test's seeded state.
     *
     * The plan needs to tell the two apart. A program whose top level is
     * imperative is re-planned by resetting its literal `$state` to the declared
     * default, so that a `while` loop appending to `$items` produces the same
     * result on every plan instead of accumulating. That reset must not reach a
     * value the host injected on purpose — doing so silently discarded seeded
     * state for any program containing a top-level `if`/`for`/`while`. Cleared by
     * `rebind`, since a new program's seeding is a new question.
     */
    private hydratedNames;
    declare(name: string, defaultValue: StateValue): void;
    has(name: string): boolean;
    get(name: string): StateValue;
    set(name: string, value: StateValue): void;
    /**
     * Record a changed path and schedule a flush — unless a render is in
     * progress, in which case the value is kept but no notification fires.
     * This is the loop-breaker for state writes during render.
     */
    private enqueueChange;
    /**
     * Open a render guard. Writes between this and `endRenderPass` update
     * values without scheduling re-renders. Returns nothing; pair with
     * `endRenderPass` in a `finally`.
     */
    beginRenderPass(): void;
    /**
     * Whether a render is currently in progress. Used by the evaluator to give
     * a function body's top-level `$x = expr` *set-once* (declaration)
     * semantics while rendering — so a function used to build the UI seeds its
     * state once and preserves later mutations, regardless of name case.
     */
    isRendering(): boolean;
    /**
     * Close the render guard. Returns `true` when at least one write was
     * suppressed during the pass, so the host can surface a one-time warning
     * pointing at the "state write during render" anti-pattern.
     */
    endRenderPass(): boolean;
    /**
     * Write `value` to a nested path inside the atom named `rootName`,
     * producing a *new* root object so the standard identity-based change
     * detection fires. Used by deep-binding sites such as
     * `Checkbox(value: $form.done)` and lambda assignments like
     * `() => $form.done = true`. Empty paths fall back to `set`.
     *
     * Objects along the path are reconstructed immutably (`{...prev, key: …}`)
     * — sibling keys are preserved and downstream subscribers always see a
     * fresh top-level reference. Numeric segments target array indices and
     * preserve the surrounding array shape.
     */
    setPath(rootName: string, path: ReadonlyArray<string>, value: StateValue): void;
    /** Iterate over every (name, value) pair. Order is insertion order. */
    entries(): IterableIterator<[string, StateValue]>;
    /** Snapshot every (name, value) pair into a plain object. */
    snapshot(): Record<string, StateValue>;
    /**
     * Aktion 0.5 §26 — resumability primitive. Restores
     * every atom in `snapshot` *without* notifying subscribers, so the
     * host can seed values before the runtime mounts (SSR hydration,
     * URL-backed deep links, conversational continuity). Atoms that have
     * not yet been `declare`d are still written so they show up the
     * moment the program declares them.
     */
    /**
     * Write host-supplied values into the store and announce them as changes.
     *
     * Announcing matters: a host that calls `hydrateState` after the first render
     * — restoring a snapshot, or a test driving a screen into a state — is making
     * a state change like any other, and subscribers (the computed-state
     * derivations, the renderer's dependency gate) have to see it or the new value
     * sits in the store while the UI keeps showing the old one. Only genuinely
     * changed names are announced, so re-hydrating an identical snapshot is free.
     */
    hydrate(snapshot: Readonly<Record<string, StateValue>>): void;
    /**
     * Whether `name` was supplied by the host rather than the program — see
     * {@link hydratedNames}. Consulted by the planner before it resets a literal
     * `$state` back to its declared default.
     */
    wasHydrated(name: string): boolean;
    reset(...names: string[]): void;
    resetAll(): void;
    /**
     * Replace all state entries. Called when a fresh program is loaded.
     *
     * Also drops any pending change notifications: their names refer to the
     * previous program's bindings, which no longer exist, and forwarding them
     * to subscribers can fire queries / scripts that race against the new
     * program's planning step.
     */
    rebind(declarations: Iterable<[string, StateValue]>): void;
    subscribe(subscriber: Subscriber): () => void;
    private scheduleFlush;
    private flush;
}
