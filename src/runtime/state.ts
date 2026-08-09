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
export function joinStatePath(rootName: string, path: ReadonlyArray<string>): string {
  return path.length === 0 ? rootName : `${rootName}.${path.join(".")}`;
}

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
export function pathAffects(changed: string, dep: string): boolean {
  if (changed === dep) return true;
  if (dep.startsWith(changed + ".")) return true; // an ancestor of the dep changed
  if (changed.startsWith(dep + ".")) return true; // a descendant of the dep changed
  return false;
}

/** True when any path in `changed` affects the single dependency `dep`. */
export function anyPathAffects(changed: ReadonlySet<string>, dep: string): boolean {
  // Fast path: an exact hit is the common case (`$count` ↔ `count`).
  if (changed.has(dep)) return true;
  for (const c of changed) {
    if (pathAffects(c, dep)) return true;
  }
  return false;
}

/** True when any path in `changed` affects any dependency in `deps`. */
export function pathsOverlap(changed: ReadonlySet<string>, deps: Iterable<string>): boolean {
  for (const dep of deps) {
    if (anyPathAffects(changed, dep)) return true;
  }
  return false;
}

export class StateStore {
  private values = new Map<string, StateValue>();
  private defaults = new Map<string, StateValue>();
  private subscribers = new Set<Subscriber>();
  private pendingChanges = new Set<string>();
  private flushScheduled = false;
  /**
   * True while the host is evaluating a render. Writes that land in this
   * window still update the value, but are NOT broadcast as changes — so a
   * `$x = …` assignment running in render position can't schedule a re-render
   * that re-runs the same write and loops forever. Writing reactive state
   * during render is an anti-pattern (React/Vue/Solid all guard against it);
   * we degrade gracefully instead of freezing the tab.
   */
  private rendering = false;
  /** Set when a write was suppressed during the render pass (for diagnostics). */
  private renderWriteOccurred = false;
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
  private hydratedNames = new Set<string>();

  declare(name: string, defaultValue: StateValue): void {
    this.defaults.set(name, defaultValue);
    if (!this.values.has(name)) {
      this.values.set(name, defaultValue);
    }
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  get(name: string): StateValue {
    return this.values.get(name);
  }

  set(name: string, value: StateValue): void {
    if (this.values.get(name) === value) return;
    this.values.set(name, value);
    this.enqueueChange(name);
  }

  /**
   * Record a changed path and schedule a flush — unless a render is in
   * progress, in which case the value is kept but no notification fires.
   * This is the loop-breaker for state writes during render.
   */
  private enqueueChange(path: string): void {
    if (this.rendering) {
      this.renderWriteOccurred = true;
      return;
    }
    this.pendingChanges.add(path);
    this.scheduleFlush();
  }

  /**
   * Open a render guard. Writes between this and `endRenderPass` update
   * values without scheduling re-renders. Returns nothing; pair with
   * `endRenderPass` in a `finally`.
   */
  beginRenderPass(): void {
    this.rendering = true;
    this.renderWriteOccurred = false;
  }

  /**
   * Whether a render is currently in progress. Used by the evaluator to give
   * a function body's top-level `$x = expr` *set-once* (declaration)
   * semantics while rendering — so a function used to build the UI seeds its
   * state once and preserves later mutations, regardless of name case.
   */
  isRendering(): boolean {
    return this.rendering;
  }

  /**
   * Close the render guard. Returns `true` when at least one write was
   * suppressed during the pass, so the host can surface a one-time warning
   * pointing at the "state write during render" anti-pattern.
   */
  endRenderPass(): boolean {
    this.rendering = false;
    const occurred = this.renderWriteOccurred;
    this.renderWriteOccurred = false;
    return occurred;
  }

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
  setPath(rootName: string, path: ReadonlyArray<string>, value: StateValue): void {
    if (path.length === 0) {
      this.set(rootName, value);
      return;
    }
    const current = this.values.get(rootName);
    const nextRoot = updateAtPath(current, path, 0, value);
    // Write the new root reference, but notify with the *precise* path
    // (`user.name`) rather than the bare atom (`user`). Subscribers that only
    // depend on a sibling field (`user.role`) are left untouched — this is
    // the write half of fine-grained reactivity. Reads of the whole atom or
    // an ancestor still wake up via `pathAffects` (the changed path is a
    // descendant of their dependency).
    this.values.set(rootName, nextRoot);
    this.enqueueChange(joinStatePath(rootName, path));
  }

  /** Iterate over every (name, value) pair. Order is insertion order. */
  entries(): IterableIterator<[string, StateValue]> {
    return this.values.entries();
  }

  /** Snapshot every (name, value) pair into a plain object. */
  snapshot(): Record<string, StateValue> {
    const out: Record<string, StateValue> = {};
    this.values.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

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
  hydrate(snapshot: Readonly<Record<string, StateValue>>): void {
    for (const [name, value] of Object.entries(snapshot)) {
      this.hydratedNames.add(name);
      if (this.values.has(name) && this.values.get(name) === value) continue;
      this.values.set(name, value);
      this.enqueueChange(name);
    }
  }

  /**
   * Whether `name` was supplied by the host rather than the program — see
   * {@link hydratedNames}. Consulted by the planner before it resets a literal
   * `$state` back to its declared default.
   */
  wasHydrated(name: string): boolean {
    return this.hydratedNames.has(name);
  }

  reset(...names: string[]): void {
    for (const name of names) {
      // Reset is a no-op for names that were never declared — keeps the
      // store free of `undefined` sentinels when the LLM types
      // `Util.reset($typo)` for a variable that doesn't exist.
      if (!this.defaults.has(name)) continue;
      const fallback = this.defaults.get(name);
      if (this.values.get(name) === fallback) continue;
      this.values.set(name, fallback);
      this.enqueueChange(name);
    }
  }

  resetAll(): void {
    for (const [name, value] of this.defaults.entries()) {
      if (this.values.get(name) === value) continue;
      this.values.set(name, value);
      this.enqueueChange(name);
    }
  }

  /**
   * Replace all state entries. Called when a fresh program is loaded.
   *
   * Also drops any pending change notifications: their names refer to the
   * previous program's bindings, which no longer exist, and forwarding them
   * to subscribers can fire queries / scripts that race against the new
   * program's planning step.
   */
  rebind(declarations: Iterable<[string, StateValue]>): void {
    this.values.clear();
    this.defaults.clear();
    this.pendingChanges.clear();
    this.hydratedNames.clear();
    for (const [name, value] of declarations) {
      this.defaults.set(name, value);
      this.values.set(name, value);
    }
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => this.flush());
  }

  private flush(): void {
    this.flushScheduled = false;
    if (this.pendingChanges.size === 0) return;
    const changes = new Set(this.pendingChanges);
    this.pendingChanges.clear();
    for (const subscriber of [...this.subscribers]) {
      subscriber(changes);
    }
  }
}

/**
 * Path segments that must never be written through. State paths come from the
 * DSL (`$user.profile.name = …`, including computed `$user[key] = …` where
 * `key` may itself derive from an HTTP or WebSocket payload), so an unguarded
 * write reaches `Object.prototype` and every `{}` in the *host* application.
 *
 * The immutable reconstruction below already blunts the classic payload — each
 * level is rebuilt as a fresh object rather than mutated in place, so
 * `$s.x.__proto__.polluted = 1` retargets the copy instead of the shared
 * prototype. That is an accident of the algorithm, not a guarantee: it would
 * silently stop holding the moment a level is mutated in place for performance.
 * The explicit check makes the property a stated invariant (and clears
 * `js/prototype-polluting-assignment` in static analysis).
 */
const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Largest array index a state write may materialise. Writing `$rows[5]` on an
 * absent atom legitimately creates a 6-slot array; writing `$rows[1e9]` would
 * allocate a billion slots and exhaust the tab's memory.
 */
const MAX_MATERIALISED_INDEX = 1_000_000;

/**
 * Immutably write `value` at `path[index..]` inside `target`. Each level
 * is reconstructed (`{...prev, key: …}` for objects, `[…prev]` for
 * arrays) so the returned root has a fresh identity at every visited
 * level. Missing intermediate slots are materialised as plain objects
 * (or arrays when the segment is numeric).
 *
 * A path containing a prototype-reaching segment is refused outright: the
 * original `target` is returned unchanged, so the write is a no-op.
 */
function updateAtPath(
  target: unknown,
  path: ReadonlyArray<string>,
  index: number,
  value: unknown,
): unknown {
  if (index >= path.length) return value;
  const key = path[index]!;
  if (FORBIDDEN_PATH_SEGMENTS.has(key)) return target;
  const asIndex = key !== "" && !Number.isNaN(Number(key)) ? Number(key) : null;
  if (Array.isArray(target) && asIndex !== null) {
    const next = target.slice();
    next[asIndex] = updateAtPath(target[asIndex], path, index + 1, value);
    return next;
  }
  if (target && typeof target === "object" && !Array.isArray(target)) {
    const base = { ...(target as Record<string, unknown>) };
    base[key] = updateAtPath(
      (target as Record<string, unknown>)[key],
      path,
      index + 1,
      value,
    );
    return base;
  }
  if (asIndex !== null) {
    // A numeric path segment materialises a fresh array of that length, so an
    // untrusted index (`$rows[1e9] = 1`) would allocate a billion-slot array.
    if (asIndex > MAX_MATERIALISED_INDEX) return target;
    const next: unknown[] = [];
    next[asIndex] = updateAtPath(undefined, path, index + 1, value);
    return next;
  }
  const base: Record<string, unknown> = {};
  base[key] = updateAtPath(undefined, path, index + 1, value);
  return base;
}
