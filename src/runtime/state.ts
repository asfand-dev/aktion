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

export class StateStore {
  private values = new Map<string, StateValue>();
  private defaults = new Map<string, StateValue>();
  private subscribers = new Set<Subscriber>();
  private pendingChanges = new Set<string>();
  private flushScheduled = false;

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
    this.pendingChanges.add(name);
    this.scheduleFlush();
  }

  reset(...names: string[]): void {
    for (const name of names) {
      const fallback = this.defaults.get(name);
      this.values.set(name, fallback);
      this.pendingChanges.add(name);
    }
    this.scheduleFlush();
  }

  resetAll(): void {
    for (const [name, value] of this.defaults.entries()) {
      this.values.set(name, value);
      this.pendingChanges.add(name);
    }
    this.scheduleFlush();
  }

  /** Replace all state entries. Called when a fresh program is loaded. */
  rebind(declarations: Iterable<[string, StateValue]>): void {
    this.values.clear();
    this.defaults.clear();
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
