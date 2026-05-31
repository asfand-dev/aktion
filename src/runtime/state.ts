/**
 * Lightweight reactive state container.
 *
 * Each `$variable` is tracked here. Components and queries subscribe to a
 * specific set of state names; when any of them changes, their `notify`
 * callback fires. There are no proxies or Symbols on the user-facing API,
 * which keeps the surface small and predictable.
 */

export type StateValue = unknown;

export type Subscriber = (changedNames: ReadonlySet<string>) => void;

/**
 * Pluggable persistent storage adapter for `$$variable` declarations.
 *
 * The default implementation reads/writes JSON-encoded values to the host
 * page's `localStorage`. Hosts (or tests) can swap it out via
 * `StateStore.setPersistenceAdapter(...)` — useful for SSR shims or to
 * scope storage per-element via a custom key prefix.
 */
export interface PersistenceAdapter {
  load(name: string): StateValue | undefined;
  save(name: string, value: StateValue): void;
  remove(name: string): void;
}

export class StateStore {
  private values = new Map<string, StateValue>();
  private defaults = new Map<string, StateValue>();
  /** Persistent variable names — written to the adapter on every change. */
  private persistent = new Set<string>();
  private persistenceAdapter: PersistenceAdapter | null = null;
  private subscribers = new Set<Subscriber>();
  private pendingChanges = new Set<string>();
  private flushScheduled = false;

  setPersistenceAdapter(adapter: PersistenceAdapter | null): void {
    this.persistenceAdapter = adapter;
  }

  declare(name: string, defaultValue: StateValue): void {
    this.defaults.set(name, defaultValue);
    if (!this.values.has(name)) {
      this.values.set(name, defaultValue);
    }
  }

  /**
   * Declare a persistent `$$variable`. The adapter is queried for an
   * existing value; if one is found, it replaces the default. Otherwise
   * the default is written back so the next mount reads the seeded value.
   */
  declarePersistent(name: string, defaultValue: StateValue): void {
    this.persistent.add(name);
    this.defaults.set(name, defaultValue);
    const adapter = this.persistenceAdapter;
    let initial: StateValue = defaultValue;
    if (adapter) {
      const stored = adapter.load(name);
      if (stored !== undefined) initial = stored;
    }
    this.values.set(name, initial);
  }

  isPersistent(name: string): boolean {
    return this.persistent.has(name);
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
    this.pendingChanges.add(name);
    if (this.persistent.has(name)) {
      this.persistenceAdapter?.save(name, value);
    }
    this.scheduleFlush();
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
    this.set(rootName, nextRoot);
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
   *
   * The persistence adapter is *not* consulted — hydration is
   * authoritative. If the caller wants persisted reads to win, they
   * should call `hydrate(snapshot)` before `declare(name, …)`.
   */
  hydrate(snapshot: Readonly<Record<string, StateValue>>): void {
    for (const [name, value] of Object.entries(snapshot)) {
      this.values.set(name, value);
    }
  }

  reset(...names: string[]): void {
    let dirty = false;
    for (const name of names) {
      // Reset is a no-op for names that were never declared — keeps the
      // store free of `undefined` sentinels when the LLM types
      // `Util.reset($typo)` for a variable that doesn't exist.
      if (!this.defaults.has(name)) continue;
      const fallback = this.defaults.get(name);
      if (this.values.get(name) === fallback) continue;
      this.values.set(name, fallback);
      this.pendingChanges.add(name);
      if (this.persistent.has(name)) {
        this.persistenceAdapter?.save(name, fallback);
      }
      dirty = true;
    }
    if (dirty) this.scheduleFlush();
  }

  resetAll(): void {
    let dirty = false;
    for (const [name, value] of this.defaults.entries()) {
      if (this.values.get(name) === value) continue;
      this.values.set(name, value);
      this.pendingChanges.add(name);
      dirty = true;
    }
    if (dirty) this.scheduleFlush();
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
    this.persistent.clear();
    this.pendingChanges.clear();
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
 * Immutably write `value` at `path[index..]` inside `target`. Each level
 * is reconstructed (`{...prev, key: …}` for objects, `[…prev]` for
 * arrays) so the returned root has a fresh identity at every visited
 * level. Missing intermediate slots are materialised as plain objects
 * (or arrays when the segment is numeric).
 */
function updateAtPath(
  target: unknown,
  path: ReadonlyArray<string>,
  index: number,
  value: unknown,
): unknown {
  if (index >= path.length) return value;
  const key = path[index]!;
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
    const next: unknown[] = [];
    next[asIndex] = updateAtPath(undefined, path, index + 1, value);
    return next;
  }
  const base: Record<string, unknown> = {};
  base[key] = updateAtPath(undefined, path, index + 1, value);
  return base;
}

/**
 * Build a `PersistenceAdapter` backed by `window.localStorage` (or
 * `sessionStorage`). The returned adapter namespaces each key by
 * `keyPrefix` so two elements on the same page don't clobber one
 * another's `$$variable` values. Returns `null` when no storage is
 * available (SSR, sandboxed iframes, private mode in some browsers).
 */
export function createLocalStorageAdapter(
  keyPrefix: string,
  storage: Storage | null,
): PersistenceAdapter | null {
  if (!storage) return null;
  const fullKey = (name: string): string => `${keyPrefix}::${name}`;
  return {
    load(name) {
      try {
        const raw = storage.getItem(fullKey(name));
        if (raw === null) return undefined;
        return JSON.parse(raw) as StateValue;
      } catch {
        return undefined;
      }
    },
    save(name, value) {
      try {
        storage.setItem(fullKey(name), JSON.stringify(value));
      } catch {
        // Quota errors or denied storage are swallowed — persistence is a
        // best-effort enhancement, not a correctness requirement.
      }
    },
    remove(name) {
      try {
        storage.removeItem(fullKey(name));
      } catch {/* see save() */}
    },
  };
}
