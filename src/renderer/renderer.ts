/**
 * Render an evaluated program tree into the shadow DOM.
 *
 * The renderer walks the tree and asks the library for a render function
 * per component. Each component still produces a fresh DOM subtree, but the
 * renderer keeps a stable identity per instance (derived from its path in
 * the tree) so:
 *
 *   - `helpers.useInstanceState(key, initial)` returns the same storage
 *     cell across re-renders. Stateful primitives (`Tabs`, `Accordion`,
 *     custom widgets) use it to keep UI state stable while unrelated
 *     re-renders sweep through.
 *   - `helpers.bindState(...)` attaches its event listener as a DOM
 *     property (`el.oninput = fn`) so the `morph` reconciler can transfer
 *     the closure onto a kept element when the tree is patched in place.
 */

import {
  enterUserComponent,
  evaluateUserComponent,
  isComponentNode,
  isUserComponentNode,
  leaveUserComponent,
  type ComponentNode,
  type EvaluationContext,
  type ScopedEffectDecl,
  type UserComponentNode,
} from "../runtime/evaluator.js";
import type { StateStore } from "../runtime/state.js";
import { pathsOverlap } from "../runtime/state.js";
import type { Router } from "../runtime/router.js";
import { sanitiseHref } from "../library/utils.js";
import { findComponent } from "../library/registry.js";
import { applyUniversal } from "../library/sx.js";
import {
  mapPositionalArgs,
  type ComponentLibrary,
  type InstanceStateSlot,
  type RenderHelpers,
} from "../library/types.js";
import { nowMs } from "../devtools/hook.js";
import type { ComponentRenderRecord, RenderPhase } from "../devtools/protocol.js";

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
  mountInstanceEffects?: (
    instanceKey: string,
    decls: ReadonlyArray<ScopedEffectDecl>,
    getCtx: () => EvaluationContext,
  ) => void;
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

const ROOT_PATH = "$";

/** One memoized user-component instance render (see `memoCache`). */
interface RenderMemoEntry {
  /** Positional args from the last render (shallow-compared). */
  positional: ReadonlyArray<unknown>;
  /** Named args from the last render (shallow-compared). */
  named: Record<string, unknown>;
  /** `$state` paths the body read last render. */
  deps: ReadonlySet<string>;
  /** The body's last return value (the lazy render tree), reused on a hit. */
  value: unknown;
}

/** Shallow `Object.is` equality of two positional arg lists. */
function positionalEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/** Shallow `Object.is` equality of two named-arg records. */
function namedEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !Object.is(a[k], b[k])) return false;
  }
  return true;
}

export class Renderer {
  /**
   * Persistent state cells, keyed by `instancePath::userKey`. Lives as long
   * as the component instance is rendered. Stale entries are garbage-
   * collected at the end of each render (see `endRender`).
   */
  private readonly instanceStates = new Map<string, unknown>();
  /**
   * Cleanup callbacks per instance path. Each entry holds either a single
   * disposer (anonymous registration) or a map keyed by user-provided
   * identifier so callers can register, replace, and (transitively) cancel
   * prior cleanups for the same logical concern.
   */
  private readonly instanceDisposers = new Map<string, Map<string, () => void>>();
  /** Instance paths seen during the current render — used to GC stale state. */
  private aliveInstances = new Set<string>();
  /**
   * User-declared component instances that currently hold per-instance
   * effects (mounted via `mountInstanceEffects`). Tracked separately from
   * `instanceStates` so the renderer can fire `unmountInstanceEffects` on
   * GC even when an instance never registered `useInstanceState`.
   */
  private readonly instancesWithEffects = new Set<string>();
  /**
   * User-declared component instances that currently hold per-instance hook
   * cells (`$state` / `$memo`). Tracked so the renderer can fire
   * `unmountInstanceHooks` when the instance leaves the tree.
   */
  private readonly instancesWithHooks = new Set<string>();
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
  private readonly memoCache = new Map<string, RenderMemoEntry>();
  /**
   * Paths changed since the last render (set by the host before `render`).
   * Drives memoization. `null`/empty + `memoEnabled=false` ⇒ full re-render.
   */
  private changedPaths: ReadonlySet<string> = new Set();
  /** Whether memoization may apply this render (false on mount / replan / notify). */
  private memoEnabled = false;

  /* ---- DevTools render profiler (dormant unless enabled) ---------------- */

  /**
   * When `true`, each render appends a {@link ComponentRenderRecord} per
   * visited instance to {@link profilerRecords}. Toggled by the host element
   * once a DevTools frontend is actually listening, so a closed inspector
   * costs nothing. See `setProfiling`.
   */
  private profiling = false;
  /** Per-commit profiler records, drained by the host after each render. */
  private profilerRecords: ComponentRenderRecord[] = [];
  /**
   * Every instance key seen in a *previous* render, so the profiler can label
   * a record `mount` (first sighting) vs `update`. Pruned in `endRender` so it
   * tracks exactly the live tree. Only maintained while profiling.
   */
  private profiledInstances = new Set<string>();

  constructor(private options: RenderOptions) {}

  /**
   * Enable/disable the render profiler. The host element flips this on when a
   * DevTools frontend subscribes and off when it disconnects, so the common
   * (no-DevTools) path never allocates a record or reads the clock.
   */
  setProfiling(enabled: boolean): void {
    this.profiling = enabled;
    if (!enabled) {
      this.profilerRecords = [];
      this.profiledInstances.clear();
    }
  }

  /** Hand the current commit's component records to the host, then clear. */
  drainProfilerRecords(): ComponentRenderRecord[] {
    const records = this.profilerRecords;
    this.profilerRecords = [];
    return records;
  }

  /** Tree depth for flamegraph indentation — one level per `#instance` segment. */
  private depthOf(instancePath: string): number {
    let depth = 0;
    for (let i = 0; i < instancePath.length; i += 1) {
      if (instancePath[i] === "#") depth += 1;
    }
    return depth;
  }

  /**
   * Swap the component library backing this renderer. Used when the host
   * element calls `registerComponents(...)` after first paint — preserves
   * any `useInstanceState` slots so stateful primitives (Tabs, Popover,
   * DropdownMenu, …) don't snap back to their initial values mid-session.
   */
  setLibrary(library: ComponentLibrary): void {
    this.options = { ...this.options, library };
  }

  /**
   * Drop all persistent per-instance state. Called when the host element
   * is `clear()`ed so a fresh program starts with a clean slate.
   */
  reset(): void {
    // Run every registered disposer before dropping references so timers /
    // listeners installed by primitives don't outlive a `clear()` call.
    for (const disposers of this.instanceDisposers.values()) {
      for (const dispose of disposers.values()) {
        this.safeDispose(dispose);
      }
    }
    this.instanceDisposers.clear();
    this.instanceStates.clear();
    this.memoCache.clear();
    // Tear down any per-instance effects so they don't outlive the
    // program. The host's `EffectRunner.reset()` clears top-level effects
    // separately, but instance effects need an explicit per-key unmount.
    if (this.options.unmountInstanceEffects) {
      for (const instanceKey of this.instancesWithEffects) {
        try {
          this.options.unmountInstanceEffects(instanceKey);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[aktion] unmountInstanceEffects threw for ${instanceKey}`, err);
        }
      }
    }
    this.instancesWithEffects.clear();
    // Drop any per-instance hook state so a fresh program starts clean.
    if (this.options.unmountInstanceHooks) {
      for (const instanceKey of this.instancesWithHooks) {
        try {
          this.options.unmountInstanceHooks(instanceKey);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[aktion] unmountInstanceHooks threw for ${instanceKey}`, err);
        }
      }
    }
    this.instancesWithHooks.clear();
    this.aliveInstances = new Set<string>();
    this.profilerRecords = [];
    this.profiledInstances.clear();
  }

  /**
   * Begin a fresh render pass; tracks which instances are still alive.
   *
   * `changedPaths` is the set of `$state` paths that changed since the last
   * render and `memoize` says whether per-component memoization may apply
   * (false on first paint, replan, or a `notify()`-driven render where the
   * change set isn't fully known — those re-render everything).
   */
  beginRender(opts: { changedPaths?: ReadonlySet<string>; memoize?: boolean } = {}): void {
    this.aliveInstances = new Set<string>();
    this.changedPaths = opts.changedPaths ?? new Set();
    this.memoEnabled = opts.memoize ?? false;
    if (this.profiling) this.profilerRecords = [];
  }

  /**
   * End the current render pass. Drops instance state for components that
   * disappeared from the tree so the map doesn't grow unbounded.
   */
  endRender(): void {
    const alive = this.aliveInstances;
    for (const key of [...this.instanceStates.keys()]) {
      // `key` has the form `${instancePath}::${userKey}`. Walk back to the
      // instance prefix and check liveness in one go.
      const sepIdx = key.lastIndexOf("::");
      const instancePath = sepIdx === -1 ? key : key.slice(0, sepIdx);
      if (!alive.has(instancePath)) {
        this.instanceStates.delete(key);
      }
    }
    // Run disposers for any instance that disappeared from the tree so
    // background work (setTimeout handles, listener installs) does not
    // outlive the component the user can see.
    for (const [instancePath, disposers] of [...this.instanceDisposers.entries()]) {
      if (alive.has(instancePath)) continue;
      for (const dispose of disposers.values()) this.safeDispose(dispose);
      this.instanceDisposers.delete(instancePath);
    }
    // Tear down per-instance effects (`effect(() => { … }, [deps])` declared
    // inside a `component { … }` body) for instances that vanished. The
    // host's EffectRunner clears timers / state subscriptions / cleanup
    // callbacks owned by that instance.
    if (this.options.unmountInstanceEffects) {
      for (const instanceKey of [...this.instancesWithEffects]) {
        if (alive.has(instanceKey)) continue;
        try {
          this.options.unmountInstanceEffects(instanceKey);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[aktion] unmountInstanceEffects threw for ${instanceKey}`, err);
        }
        this.instancesWithEffects.delete(instanceKey);
      }
    }
    // Reset per-instance hook state (`$state` / `$memo`) for instances that
    // vanished, so a future remount starts fresh from the initial value.
    if (this.options.unmountInstanceHooks) {
      for (const instanceKey of [...this.instancesWithHooks]) {
        if (alive.has(instanceKey)) continue;
        try {
          this.options.unmountInstanceHooks(instanceKey);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[aktion] unmountInstanceHooks threw for ${instanceKey}`, err);
        }
        this.instancesWithHooks.delete(instanceKey);
      }
    }
    // Drop memo entries for instances that left the tree so the cache can't
    // grow unbounded (and a remounted instance re-renders fresh).
    for (const instanceKey of [...this.memoCache.keys()]) {
      if (!alive.has(instanceKey)) this.memoCache.delete(instanceKey);
    }
    // Prune the profiler's mount/update tracker so a remounted instance is
    // correctly reported as a fresh `mount`.
    if (this.profiling) {
      for (const instanceKey of [...this.profiledInstances]) {
        if (!alive.has(instanceKey)) this.profiledInstances.delete(instanceKey);
      }
    }
  }

  /** Record one component instance's contribution to the current commit. */
  private profile(
    instanceKey: string,
    name: string,
    kind: "user" | "library",
    phase: RenderPhase,
    selfTime: number,
    reason: string,
    deps?: ReadonlySet<string>,
  ): void {
    this.profilerRecords.push({
      instanceKey,
      name,
      kind,
      phase,
      selfTime,
      depth: this.depthOf(instanceKey),
      reason,
      deps: deps ? [...deps] : undefined,
    });
    this.profiledInstances.add(instanceKey);
  }

  private safeDispose(dispose: () => void): void {
    try {
      dispose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion] disposer threw", err);
    }
  }

  /**
   * Apply a state write addressed by either a plain atom name
   * (`$count` → `"count"`) or a dotted path (`$form.email` →
   * `"form.email"`). Dotted writes go through `state.setPath` so the
   * root object is reconstructed immutably and subscribers wake up.
   */
  private writeState(name: string, value: unknown): void {
    const dot = name.indexOf(".");
    if (dot < 0) {
      this.options.state.set(name, value);
      return;
    }
    const root = name.slice(0, dot);
    const path = name.slice(dot + 1).split(".");
    this.options.state.setPath(root, path, value);
  }

  render(value: unknown): Node {
    return this.renderAt(value, ROOT_PATH);
  }

  private renderAt(value: unknown, path: string): Node {
    if (value === null || value === undefined) return document.createTextNode("");
    if (Array.isArray(value)) {
      const fragment = document.createDocumentFragment();
      value.forEach((item, idx) => {
        fragment.append(this.renderAt(item, `${path}/${idx}`));
      });
      return fragment;
    }
    if (isUserComponentNode(value)) return this.renderUserComponent(value, path);
    if (isComponentNode(value)) return this.renderComponent(value, path);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return document.createTextNode(String(value));
    }
    return document.createTextNode("");
  }

  /**
   * Expand a user-declared `function Foo(p) { return ... }` invocation. Each
   * instance gets a stable instance key derived from its render path (or
   * the caller's explicit `key:` override); the evaluator then evaluates
   * the component's body with a fresh per-instance state-alias scope so
   * two `Counter()` instances hold independent atoms (§7).
   */
  private renderUserComponent(node: UserComponentNode, path: string): Node {
    const ctxRef = this.options.evaluationContext;
    if (!ctxRef) {
      const placeholder = document.createElement("div");
      placeholder.className = "rui-unknown-component";
      placeholder.textContent = `[unknown component: ${node.decl.name}]`;
      return placeholder;
    }
    const ctx = ctxRef();
    // Instance key combines the structural render path with the
    // declaration name and source location so reordering siblings doesn't
    // accidentally reuse another instance's state. An explicit `key:` arg
    // takes precedence (§13 — content-addressed identity).
    const keyPart = node.explicitKey != null
      ? `=${String(node.explicitKey)}`
      : `@${node.source?.line ?? 0}:${node.source?.column ?? 0}`;
    const instancePath = `${path}#${node.decl.name}${keyPart}`;
    this.aliveInstances.add(instancePath);

    // Per-component memoization: when the change set is fully known and this
    // instance's args are unchanged AND none of the `$state` paths it read
    // last render changed, skip re-executing its body and reuse the cached
    // return value. We still descend into the reused value (below), so a
    // child that reads a changed path re-renders independently — only THIS
    // body's work (and its `console.log`s) is skipped.
    const memo = this.memoCache.get(instancePath);
    if (
      this.memoEnabled && memo &&
      positionalEqual(node.positional, memo.positional) &&
      namedEqual(node.named, memo.named) &&
      !pathsOverlap(this.changedPaths, memo.deps)
    ) {
      // Keep the instance's tracked deps in the render's read-set so the host
      // render-gate stays complete, then re-render the cached value tree.
      const tracker = ctx.trackedState;
      for (const dep of memo.deps) tracker.add(dep);
      if (this.profiling) {
        this.profile(instancePath, node.decl.name, "user", "memo", 0, "memoized (args + deps unchanged)", memo.deps);
      }
      enterUserComponent(ctx, node.decl.name);
      try {
        return this.renderAt(memo.value, instancePath);
      } finally {
        leaveUserComponent(ctx);
      }
    }
    // Profiler: classify why this instance is (re)rendering for the timeline.
    const profilePhase: RenderPhase = this.profiledInstances.has(instancePath) ? "update" : "mount";
    const profileReason = !memo
      ? (profilePhase === "mount" ? "initial mount" : "no memo (full render)")
      : !positionalEqual(node.positional, memo.positional)
        ? "positional args changed"
        : !namedEqual(node.named, memo.named)
          ? "named args changed"
          : pathsOverlap(this.changedPaths, memo.deps)
            ? "state dependency changed"
            : "full render";
    const profileStart = this.profiling ? nowMs() : 0;

    // Reserve a budget slot before walking the body. The matching
    // `leaveUserComponent` MUST run in a finally that wraps the
    // recursive `renderAt(value)` call — that's the chain that grows
    // the depth counter for accidentally-recursive components like
    // `function Foo() { return Foo() }`. Putting the bracket inside
    // `evaluateUserComponent` instead would only bound a single body
    // walk and miss the actual recursion (which happens in the renderer).
    enterUserComponent(ctx, node.decl.name);
    try {
      // Capture exactly which `$state` paths THIS body reads (its memo deps)
      // by scoping a fresh tracker around the body walk, then folding those
      // reads back into the surrounding render tracker so the parent's
      // read-set (and the host gate) stay complete.
      const outerTracker = ctx.trackedState;
      const instanceDeps = new Set<string>();
      ctx.trackedState = instanceDeps;
      let evaluated;
      try {
        evaluated = evaluateUserComponent(node, ctx, instancePath);
      } finally {
        ctx.trackedState = outerTracker;
        for (const dep of instanceDeps) outerTracker.add(dep);
      }
      const { value, effects, hooks } = evaluated;
      // Profiler: the body just ran — record its self time (children render
      // lazily below, so this measures only this component's own work).
      if (this.profiling) {
        this.profile(instancePath, node.decl.name, "user", profilePhase, nowMs() - profileStart, profileReason, instanceDeps);
      }
      // Hand any `effect(() => { … }, [deps])` declarations discovered
      // inside this component's body to the host's effect runner under
      // the stable instance key. The runner is idempotent across re-
      // renders — it only mounts effects new to this instance — and
      // `endRender` tears them down when the instance disappears.
      if (this.options.mountInstanceEffects) {
        this.options.mountInstanceEffects(instancePath, effects, ctxRef);
        if (effects.length > 0) this.instancesWithEffects.add(instancePath);
      }
      // Track instances that used hooks so `endRender` can reset their
      // `$state` / `$memo` cells when they leave the tree.
      if (hooks > 0) this.instancesWithHooks.add(instancePath);
      // Record the memo for next render.
      this.memoCache.set(instancePath, {
        positional: node.positional,
        named: node.named,
        deps: instanceDeps,
        value,
      });
      const rendered = this.renderAt(value, instancePath);
      // Stamp the author `key:` onto the rendered root so the morph reconciler
      // MOVES the same DOM node when siblings reorder (not just patches it in
      // place) — preserving focus / media / animation state and enabling
      // FLIP-style reorder animations (III.4).
      if (node.explicitKey != null && rendered instanceof Element && !(rendered as Element).hasAttribute("data-rui-key")) {
        (rendered as Element).setAttribute("data-rui-key", String(node.explicitKey));
      }
      return rendered;
    } finally {
      leaveUserComponent(ctx);
    }
  }

  private renderComponent(node: ComponentNode, path: string): Node {
    const spec = findComponent(this.options.library, node.name);
    if (!spec) {
      const placeholder = document.createElement("div");
      placeholder.className = "rui-unknown-component";
      placeholder.textContent = `[unknown component: ${node.name}]`;
      return placeholder;
    }
    const props = mapPositionalArgs(spec, node.args);
    // §13 — when the author passes `key:`, use it as the instance suffix
    // so reordering siblings keeps per-instance state attached to the
    // right node. Otherwise fall back to the source location which is
    // stable for non-reordered trees.
    const keySuffix = node.explicitKey != null
      ? `=${String(node.explicitKey)}`
      : `@${node.source?.line ?? 0}:${node.source?.column ?? 0}`;
    const instancePath = `${path}#${node.name}${keySuffix}`;
    this.aliveInstances.add(instancePath);

    // Track an auto-increment counter so `helpers.renderNode(child)` calls
    // get a stable sibling index even when a component renders several
    // children in a row.
    let childCounter = 0;
    const helpers: RenderHelpers = {
      renderNode: (childValue) => this.renderAt(childValue, `${instancePath}>${childCounter++}`),
      invoke: (callable, ...args) => {
        if (typeof callable !== "function") return;
        try {
          const result = callable(...args);
          if (result && typeof (result as Promise<unknown>).then === "function") {
            (result as Promise<unknown>).catch((err) => {
              // eslint-disable-next-line no-console
              console.error("[aktion] handler rejected", err);
            });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[aktion] handler threw", err);
        }
      },
      setState: (name, value) => {
        this.writeState(name, value);
      },
      resetState: (...names) => {
        this.options.state.reset(...names);
      },
      sendToAssistant: (message) => {
        this.options.onAssistantMessage?.(message);
      },
      openUrl: (url) => {
        const safeUrl = sanitiseHref(url, "#");
        const opener = this.options.onOpenUrl;
        if (opener) opener(safeUrl);
        else if (safeUrl !== "#" && typeof window !== "undefined") {
          window.open(safeUrl, "_blank", "noopener,noreferrer");
        }
      },
      bindState: (element, name, options) => {
        const eventName = options?.event ?? this.eventFor(element);
        const propKey = `on${eventName}`;
        const getter = options?.getValue ?? this.defaultValueGetter(element);
        // Property-based assignment so the morph reconciler can transfer
        // this handler onto a kept element. CRITICAL: read the value off
        // `event.currentTarget` (the element the listener fires on, which
        // is always the *live* DOM node) rather than the closure-captured
        // `element` — the fresh render's element becomes detached the
        // moment morph reuses the previous DOM node, and its `.value`
        // never sees the user's keystroke.
        //
        // `name` may carry a dotted state path (`form.email`) so that
        // bindings to nested members (`value: $form.email`) write back
        // into the right slot — see `writeState`.
        (element as unknown as Record<string, unknown>)[propKey] = (event: Event) => {
          const target = (event.currentTarget ?? event.target ?? element) as HTMLElement;
          this.writeState(name, getter(target));
        };
      },
      useInstanceState: <T>(key: string, initialValue: T): InstanceStateSlot<T> => {
        const storageKey = `${instancePath}::${key}`;
        if (!this.instanceStates.has(storageKey)) {
          this.instanceStates.set(storageKey, initialValue);
        }
        return {
          get: () => this.instanceStates.get(storageKey) as T,
          set: (value: T) => {
            this.instanceStates.set(storageKey, value);
          },
        };
      },
      registerDisposer: (cleanup: () => void, key?: string): void => {
        let bucket = this.instanceDisposers.get(instancePath);
        if (!bucket) {
          bucket = new Map();
          this.instanceDisposers.set(instancePath, bucket);
        }
        // Generate a stable key when the caller didn't provide one so each
        // anonymous registration gets its own slot (and never replaces a
        // previous one by accident).
        const slot = key ?? `__anon::${bucket.size}`;
        const prior = bucket.get(slot);
        if (prior && prior !== cleanup) this.safeDispose(prior);
        bucket.set(slot, cleanup);
      },
      router: this.options.router,
    };
    // Profiler: library components have no memoization — they re-render on
    // every commit. Classify mount vs update by first sighting. Their self
    // time is inclusive of children rendered synchronously inside `render`.
    const libPhase: RenderPhase = this.profiledInstances.has(instancePath) ? "update" : "mount";
    const libStart = this.profiling ? nowMs() : 0;
    try {
      const out = spec.render(node, props, helpers);
      if (node.universal) applyUniversal(out, node.universal);
      // Stamp the author `key:` so the morph reconciler moves this node on a
      // sibling reorder (preserves DOM identity + enables FLIP — III.4).
      if (node.explicitKey != null && out instanceof Element && !(out as Element).hasAttribute("data-rui-key")) {
        (out as Element).setAttribute("data-rui-key", String(node.explicitKey));
      }
      if (this.profiling) {
        this.profile(instancePath, node.name, "library", libPhase, nowMs() - libStart, libPhase === "mount" ? "mounted" : "re-rendered");
      }
      return out;
    } catch (err) {
      if (this.profiling) {
        this.profile(instancePath, node.name, "library", libPhase, nowMs() - libStart, "render threw");
      }
      // eslint-disable-next-line no-console
      console.error(`[aktion] failed to render ${spec.name}`, err);
      const fallback = document.createElement("div");
      fallback.className = "rui-render-error";
      fallback.textContent = `[render error in ${spec.name}]`;
      return fallback;
    }
  }

  private eventFor(element: HTMLElement): string {
    if (element instanceof HTMLSelectElement) return "change";
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) return "change";
    return "input";
  }

  private defaultValueGetter(element: HTMLElement): (el: HTMLElement) => unknown {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      return (el) => (el as HTMLInputElement).checked;
    }
    if (element instanceof HTMLInputElement && element.type === "radio") {
      return (el) => (el as HTMLInputElement).value;
    }
    if (element instanceof HTMLInputElement && element.type === "number") {
      // Empty input → null (Number("") would coerce to 0 and silently
      // overwrite a cleared field with a sentinel value). Invalid input
      // also returns null so $variables see a typed value or "no value".
      return (el) => {
        const raw = (el as HTMLInputElement).value;
        if (raw === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };
    }
    if (element instanceof HTMLInputElement && element.type === "range") {
      return (el) => Number((el as HTMLInputElement).value);
    }
    return (el) => (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }
}
