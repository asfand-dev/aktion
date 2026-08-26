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
 *
 * ## The rule a component author breaks most often
 *
 * Every commit re-renders the whole tree and hands it to `morphChildren`,
 * which keeps the live node and makes its attributes match the freshly
 * rendered one — attributes the fresh tree omits are REMOVED. So an event
 * handler that writes `class` / `style` / `data-*` straight onto the live DOM
 * without a matching source of truth is describing a UI state the next render
 * cannot reproduce, and the next commit (triggered by anything, anywhere)
 * silently undoes it: the mobile drawer closes itself, the dragged divider
 * snaps back, the "Copied!" label reverts mid-timeout.
 *
 * An imperative write is a paint-time OPTIMISATION, never the state. Put the
 * bit somewhere the render reads:
 *
 *   - the prop is `$`-bound (`node.argMeta[i].stateRef`) → `helpers.setState`
 *   - otherwise → `helpers.useInstanceState(key, initial)`
 *
 * …then emit the attribute/style from that value during render. Only a handful
 * of attributes are exempt because something other than the render owns them
 * (the floating layer's `popover` / measured `style`, a `data-rui-preserve`
 * widget's own attributes, `<details open>`); `morph.ts` lists them.
 *
 * `<aktion-app strict>` arms a MutationObserver that reports the first
 * handler-only write a commit reverts, naming the element and attribute.
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
import type {
  ComponentPropRecord,
  ComponentRenderRecord,
  RenderPhase,
} from "../devtools/protocol.js";
import { toDevtoolsValue } from "../devtools/serialize.js";

/**
 * DOM attribute carrying the instance key of the library component that
 * produced an element. This is the whole basis of the DevTools element picker:
 * a click anywhere in the app resolves to the nearest tagged ancestor, which
 * resolves to a row in the component tree. Written only while a DevTools
 * frontend has `tagDom` enabled, so production renders never see it.
 */
export const INSTANCE_ATTR = "data-aktion-instance";
/** Same idea, but naming the nearest enclosing user `function Foo()` instance. */
export const OWNER_ATTR = "data-aktion-owner";

/** Most props we record per instance — a 200-column DataGrid is not a payload. */
const MAX_PROP_RECORDS = 40;

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

/**
 * Close an out-of-band paint "burst" once the current callback has finished.
 *
 * A microtask is exactly the right granularity: every `renderNode` call a
 * settled promise (or a deferred callback) makes happens synchronously inside
 * that callback, and the next paint arrives in a later turn.
 */
function endOfBurst(fn: () => void): void {
  if (typeof queueMicrotask === "function") queueMicrotask(fn);
  else void Promise.resolve().then(fn);
}

/** An output the universal channel has nothing to attach to (no content). */
function isEmptyOutput(node: Node): boolean {
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return node.childNodes.length === 0;
  return node.nodeType === Node.TEXT_NODE && (node.textContent ?? "") === "";
}

/**
 * Give the universal channel (`sx`, `class`, `aria`, `id`, `animate`, …) an
 * element to land on, then apply it.
 *
 * `applyUniversal` needs an Element, and `Show` / `Async` / `Lazy` return a
 * DocumentFragment (or a bare text node for the empty branch) — so everything
 * the author wrote on the universal channel used to be dropped without a word.
 * `validate.ts` accepts `sx` on every component, so the styling read as
 * correct and simply never rendered.
 *
 * The host is a plain `<span>`, deliberately NOT `display: contents`: a
 * transparent host keeps the fragment's layout neutrality but is unreliable in
 * the accessibility tree, and it would leave every box-model token inert —
 * which is the defect, not the fix. `sx.ts` promotes the span to a block box
 * when the channel carries a declaration that needs one.
 *
 * An empty output is left alone: hosting a false `Show` with no fallback would
 * paint an empty padded box where the author expects nothing at all.
 */
function hostUniversal(out: Node, universal: Record<string, unknown>): Node {
  if (out instanceof Element) {
    applyUniversal(out, universal);
    return out;
  }
  const carries = Object.values(universal).some((v) => v != null);
  if (!carries || isEmptyOutput(out)) return out;
  const host = document.createElement("span");
  host.className = "rui-universal-host";
  host.append(out);
  applyUniversal(host, universal);
  return host;
}

/**
 * Rebuild a library-component node with DevTools overrides applied.
 *
 * A copy, never a mutation: the original node may be sitting in a memo entry
 * (it is the cached return value of the enclosing user component), so writing
 * through it would make the override outlive the moment it is cleared — the
 * exact "why is my UI still wrong?" bug an inspector must not create.
 *
 * A name matching a declared prop position rewrites that positional argument;
 * anything else lands on the universal channel (`sx`, `class`, `aria`, …),
 * which is where those props come from in the first place.
 */
function applyLibraryOverrides(
  node: ComponentNode,
  spec: { props: ReadonlyArray<{ name: string }> },
  overrides: ReadonlyMap<string, unknown>,
): ComponentNode {
  const args = [...node.args];
  let universal: Record<string, unknown> | undefined = node.universal;
  let touchedUniversal = false;
  for (const [name, value] of overrides) {
    const index = spec.props.findIndex((p) => p.name === name);
    if (index >= 0) {
      // Pad so an override on an un-passed trailing prop still lands.
      while (args.length <= index) args.push(undefined);
      args[index] = value;
    } else {
      if (!touchedUniversal) {
        universal = { ...(node.universal ?? {}) };
        touchedUniversal = true;
      }
      (universal as Record<string, unknown>)[name] = value;
    }
  }
  return { ...node, args, universal };
}

/** The same, for a user-declared `function Foo(a, b)` invocation. */
function applyUserOverrides(
  node: UserComponentNode,
  overrides: ReadonlyMap<string, unknown>,
): UserComponentNode {
  const positional = [...node.positional];
  const named = { ...node.named };
  for (const [name, value] of overrides) {
    const index = node.decl.params.findIndex((p) => p.name === name);
    if (index >= 0) {
      while (positional.length <= index) positional.push(undefined);
      positional[index] = value;
    } else {
      named[name] = value;
    }
  }
  return { ...node, positional, named };
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
  private readonly externalInstances = new Map<string, string>();
  /** The instance whose `renderNode` is currently painting out of band. */
  private externalOwner: string | null = null;
  /** >0 while a render pass is on the stack (`render` → `renderAt` → …). */
  private passDepth = 0;
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
  /**
   * Record each instance's props/arguments alongside its timing. Separate from
   * {@link profiling} because serialising a prop bag per instance per commit is
   * the expensive half — a profiler session on a heavy app wants the timings
   * without it, an inspector session needs it.
   */
  private captureProps = false;
  /** Stamp {@link INSTANCE_ATTR} / {@link OWNER_ATTR} on rendered elements. */
  private tagDom = false;
  /** Per-commit profiler records, drained by the host after each render. */
  private profilerRecords: ComponentRenderRecord[] = [];
  /**
   * Every instance key seen in a *previous* render, so the profiler can label
   * a record `mount` (first sighting) vs `update`. Pruned in `endRender` so it
   * tracks exactly the live tree. Only maintained while profiling.
   */
  private profiledInstances = new Set<string>();
  /**
   * DevTools prop overrides: instance key → prop name → forced value.
   *
   * An override is applied where the value enters the component — before
   * memoization compares args, so changing one re-renders the instance, and
   * before `render` sees the prop bag, so a component that reads `node.args`
   * directly observes the same value the props record shows. The program is
   * never edited: clearing the override restores the authored value on the
   * next commit.
   */
  private readonly propOverrides = new Map<string, Map<string, unknown>>();

  constructor(private options: RenderOptions) {}

  /**
   * Enable/disable the render profiler. The host element flips this on when a
   * DevTools frontend subscribes and off when it disconnects, so the common
   * (no-DevTools) path never allocates a record or reads the clock.
   *
   * `detail` carries the frontend's instrumentation switches (see
   * `DevtoolsHookOptions`); omitted keys default to off so a caller that only
   * wants timings gets only timings.
   */
  setProfiling(enabled: boolean, detail?: { captureProps?: boolean; tagDom?: boolean }): void {
    this.profiling = enabled;
    this.captureProps = enabled && detail?.captureProps === true;
    this.tagDom = enabled && detail?.tagDom === true;
    if (!enabled) {
      this.profilerRecords = [];
      this.profiledInstances.clear();
    }
  }

  /* ---- DevTools inspector surface --------------------------------------- */

  /**
   * Force `prop` to `value` for one instance until the override is cleared.
   * Returns `true` when the instance is one the renderer has actually seen, so
   * the caller can report a stale key instead of silently doing nothing.
   */
  setPropOverride(instanceKey: string, prop: string, value: unknown): boolean {
    let bucket = this.propOverrides.get(instanceKey);
    if (!bucket) {
      bucket = new Map();
      this.propOverrides.set(instanceKey, bucket);
    }
    bucket.set(prop, value);
    // Drop the memo so the next commit re-evaluates with the new value.
    this.memoCache.delete(instanceKey);
    return this.profiledInstances.has(instanceKey) || this.aliveInstances.has(instanceKey);
  }

  /** Drop one override, or every override on the instance when `prop` is omitted. */
  clearPropOverride(instanceKey: string, prop?: string): void {
    if (prop === undefined) {
      this.propOverrides.delete(instanceKey);
    } else {
      const bucket = this.propOverrides.get(instanceKey);
      bucket?.delete(prop);
      if (bucket && bucket.size === 0) this.propOverrides.delete(instanceKey);
    }
    this.memoCache.delete(instanceKey);
  }

  /**
   * Drop every override.
   *
   * The host calls this on replan and on `clear()`: an instance key encodes a
   * render path, and a NEW program can produce the same path for a different
   * component — so a surviving override would silently apply to something the
   * user never touched.
   */
  clearAllPropOverrides(): void {
    this.propOverrides.clear();
  }

  /** Every active override, flattened for the inspector's override banner. */
  listPropOverrides(): Array<{ instanceKey: string; prop: string; value: unknown }> {
    const out: Array<{ instanceKey: string; prop: string; value: unknown }> = [];
    for (const [instanceKey, bucket] of this.propOverrides) {
      for (const [prop, value] of bucket) out.push({ instanceKey, prop, value });
    }
    return out;
  }

  /** Overrides in force for one instance (used to flag props in the tree). */
  propOverridesFor(instanceKey: string): ReadonlyMap<string, unknown> | undefined {
    return this.propOverrides.get(instanceKey);
  }

  /**
   * `useInstanceState` slots held by one instance — a library component's own
   * UI state (a Tabs' active pane, a Popover's open flag, a DataGrid's sort).
   * These never appear in `$state`, which is exactly why an inspector that
   * cannot show them leaves the most common "why is it showing that?" question
   * unanswerable.
   */
  listInstanceUiState(instanceKey: string): Array<{ key: string; value: unknown }> {
    const prefix = `${instanceKey}::`;
    const out: Array<{ key: string; value: unknown }> = [];
    for (const [storageKey, value] of this.instanceStates) {
      if (storageKey.startsWith(prefix)) {
        out.push({ key: storageKey.slice(prefix.length), value });
      }
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Write one `useInstanceState` slot. Returns `false` for an unknown slot. */
  setInstanceUiState(instanceKey: string, key: string, value: unknown): boolean {
    const storageKey = `${instanceKey}::${key}`;
    if (!this.instanceStates.has(storageKey)) return false;
    this.instanceStates.set(storageKey, value);
    return true;
  }

  /**
   * Drop everything the renderer holds for one instance so the next commit
   * treats it as a fresh mount: memo, UI-state slots, and disposers. The
   * host pairs this with `clearInstanceHooks` to remount a component without
   * reloading the program.
   */
  dropInstance(instanceKey: string): void {
    this.memoCache.delete(instanceKey);
    this.profiledInstances.delete(instanceKey);
    const prefix = `${instanceKey}::`;
    for (const key of [...this.instanceStates.keys()]) {
      if (key === instanceKey || key.startsWith(prefix)) this.instanceStates.delete(key);
    }
    const disposers = this.instanceDisposers.get(instanceKey);
    if (disposers) {
      for (const dispose of disposers.values()) this.safeDispose(dispose);
      this.instanceDisposers.delete(instanceKey);
    }
  }

  /** Instance keys currently in the rendered tree. */
  liveInstanceKeys(): string[] {
    return [...this.aliveInstances];
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
    this.propOverrides.clear();
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
    this.externalInstances.clear();
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
    // Instances painted out of band are alive as long as the instance that
    // painted them is; once that one leaves the tree the record goes with it
    // and the sweeps below reclaim the subtree normally.
    for (const [instancePath, owner] of [...this.externalInstances]) {
      if (alive.has(owner)) alive.add(instancePath);
      else this.externalInstances.delete(instancePath);
    }
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
    extra?: {
      source?: { line: number; column: number };
      explicitKey?: unknown;
      props?: ComponentPropRecord[];
    },
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
      source: extra?.source,
      explicitKey: extra?.explicitKey != null ? String(extra.explicitKey) : undefined,
      props: extra?.props,
    });
    this.profiledInstances.add(instanceKey);
  }

  /**
   * Turn one component instance's arguments into inspector-ready prop records.
   *
   * `names` supplies the declared order (a library spec's `props`, or a user
   * declaration's `params`); anything past the declared arity is reported under
   * its index so an over-supplied call is visible rather than hidden. `stateRefs`
   * carries the `$`-binding per position, which is what tells the inspector to
   * edit the ATOM rather than install an override — editing `value: $name` has
   * to write `$name`, or the next commit would overwrite the edit.
   */
  private buildPropRecords(
    names: ReadonlyArray<string>,
    values: ReadonlyArray<unknown>,
    stateRefs: ReadonlyArray<string | undefined>,
    named: Record<string, unknown> | undefined,
    universal: Record<string, unknown> | undefined,
    overrides: ReadonlyMap<string, unknown> | undefined,
  ): ComponentPropRecord[] {
    const out: ComponentPropRecord[] = [];
    const push = (name: string, value: unknown, stateRef?: string): void => {
      if (out.length >= MAX_PROP_RECORDS) return;
      const record: ComponentPropRecord = { name, value: toDevtoolsValue(value) };
      if (stateRef) record.stateRef = stateRef;
      if (overrides?.has(name)) record.overridden = true;
      out.push(record);
    };
    for (let i = 0; i < values.length; i += 1) {
      // `undefined` in a positional slot is "not passed" — listing it would
      // bury the props that were.
      if (values[i] === undefined) continue;
      push(names[i] ?? `#${i}`, values[i], stateRefs[i]);
    }
    if (named) {
      for (const [key, value] of Object.entries(named)) {
        if (value === undefined) continue;
        push(key, value);
      }
    }
    if (universal) {
      for (const [key, value] of Object.entries(universal)) {
        if (value == null) continue;
        push(key, value);
      }
    }
    return out;
  }

  /**
   * Stamp the instance key onto a rendered element so a DOM node can be traced
   * back to the component that produced it. `owner` writes the enclosing user
   * component instead, and only when nothing closer already claimed the node —
   * so the nearest owner wins and `Page > Card > Button` attributes the button
   * to `Card`, not `Page`.
   */
  private tagInstance(node: Node, instanceKey: string, attr: string): void {
    if (!(node instanceof Element)) return;
    try {
      if (attr === OWNER_ATTR && node.hasAttribute(OWNER_ATTR)) return;
      node.setAttribute(attr, instanceKey);
    } catch {
      /* exotic element (SVG in an old DOM impl) — tagging is best-effort */
    }
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
  render(value: unknown): Node {
    this.passDepth += 1;
    try {
      return this.renderAt(Array.isArray(value) ? value : [value], ROOT_PATH);
    } finally {
      this.passDepth -= 1;
    }
  }

  /**
   * Record that `instancePath` is part of the tree the user can see.
   *
   * Inside a pass that is just the pass's own alive-set. Outside one (a
   * deferred `helpers.renderNode`) the pass's set is already closed, so the
   * instance is remembered against the component that painted it — see
   * {@link externalInstances}.
   */
  private markAlive(instancePath: string): void {
    this.aliveInstances.add(instancePath);
    const owner = this.externalOwner;
    if (this.passDepth === 0 && owner !== null && owner !== instancePath) {
      this.externalInstances.set(instancePath, owner);
    }
  }

  /**
   * Render a subtree painted outside a render pass, attributed to `owner` (the
   * instance whose `helpers.renderNode` is doing the painting).
   */
  private renderExternal(value: unknown, path: string, owner: string): Node {
    const prev = this.externalOwner;
    this.externalOwner = owner;
    try {
      return this.renderAt(value, path);
    } finally {
      this.externalOwner = prev;
    }
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
    this.markAlive(instancePath);

    // DevTools prop override: substitute the forced values BEFORE the memo
    // comparison below, so flipping an override is observed as an arg change
    // and re-renders the instance (rather than being masked by a memo hit).
    const overrides = this.propOverrides.get(instancePath);
    if (overrides && overrides.size > 0) {
      node = applyUserOverrides(node, overrides);
    }

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
        this.profile(
          instancePath, node.decl.name, "user", "memo", 0,
          "memoized (args + deps unchanged)", memo.deps,
          { source: node.source, explicitKey: node.explicitKey, props: this.userProps(node, overrides) },
        );
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
        this.profile(
          instancePath, node.decl.name, "user", profilePhase, nowMs() - profileStart,
          profileReason, instanceDeps,
          { source: node.source, explicitKey: node.explicitKey, props: this.userProps(node, overrides) },
        );
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
      // Attribute the painted node to the nearest user component so the
      // element picker can answer "which of MY components rendered this?"
      // (the `data-aktion-instance` tag names the library primitive).
      if (this.tagDom) this.tagInstance(rendered, instancePath, OWNER_ATTR);
      return rendered;
    } finally {
      leaveUserComponent(ctx);
    }
  }

  /** Prop records for a user component instance, or `undefined` when off. */
  private userProps(
    node: UserComponentNode,
    overrides: ReadonlyMap<string, unknown> | undefined,
  ): ComponentPropRecord[] | undefined {
    if (!this.captureProps) return undefined;
    const names = node.decl.params.map((p, i) => p.name || (p.pattern ? `{pattern ${i}}` : `#${i}`));
    return this.buildPropRecords(names, node.positional, [], node.named, undefined, overrides);
  }

  private renderComponent(node: ComponentNode, path: string): Node {
    const spec = findComponent(this.options.library, node.name);
    if (!spec) {
      const placeholder = document.createElement("div");
      placeholder.className = "rui-unknown-component";
      placeholder.textContent = `[unknown component: ${node.name}]`;
      return placeholder;
    }
    // §13 — when the author passes `key:`, use it as the instance suffix
    // so reordering siblings keeps per-instance state attached to the
    // right node. Otherwise fall back to the source location which is
    // stable for non-reordered trees.
    const keySuffix = node.explicitKey != null
      ? `=${String(node.explicitKey)}`
      : `@${node.source?.line ?? 0}:${node.source?.column ?? 0}`;
    const instancePath = `${path}#${node.name}${keySuffix}`;
    this.markAlive(instancePath);

    // DevTools prop override: rebuild the node's args (and universal channel)
    // with the forced values so BOTH the mapped prop bag and any component that
    // reads `node.args` directly observe the same value the inspector shows.
    const overrides = this.propOverrides.get(instancePath);
    if (overrides && overrides.size > 0) {
      node = applyLibraryOverrides(node, spec, overrides);
    }
    const props = mapPositionalArgs(spec, node.args);

    // Track an auto-increment counter so `helpers.renderNode(child)` calls
    // get a stable sibling index even when a component renders several
    // children in a row.
    let childCounter = 0;
    /** True while an out-of-band burst is still numbering children. */
    let outOfBand = false;
    /** Anonymous disposer slots, numbered per render generation (see below). */
    let anonSlot = 0;
    const helpers: RenderHelpers = {
      renderNode: (childValue) => {
        if (this.passDepth > 0) return this.renderAt(childValue, `${instancePath}>${childCounter++}`);
        // Painting outside a render pass — `Lazy` swapping its resolved subtree
        // in from a promise callback. These `helpers` belong to a pass that has
        // closed, so `childCounter` is wherever that pass left it: the subtree
        // would land on a path no future pass ever produces, its state cells
        // would be orphaned (and GC'd) and the next in-pass render would build
        // it again from scratch. Restarting the numbering once per burst puts it
        // on the same path the next in-pass render will use, so the instance
        // state a lazily-painted `Tabs` holds survives the hand-over.
        if (!outOfBand) {
          outOfBand = true;
          childCounter = 0;
          endOfBurst(() => { outOfBand = false; });
        }
        return this.renderExternal(childValue, `${instancePath}>${childCounter++}`, instancePath);
      },
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
        // Anonymous registrations get their own slot within one render — the
        // documented contract — but the numbering restarts every render (these
        // `helpers` are rebuilt per render), so the next generation REPLACES the
        // previous one instead of adding an entry. Keying off `bucket.size`
        // grew the bucket by one live closure per render, each pinning whatever
        // it captured until the instance unmounted: the opposite of the "never
        // accumulate work for components the user can no longer see" promise.
        const slot = key ?? `__anon::${anonSlot++}`;
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
      const rawOut = spec.render(node, props, helpers);
      // A fragment-returning component (Show / Async / Lazy) gets a host span
      // so the universal channel is not silently discarded — see hostUniversal.
      const out = node.universal ? hostUniversal(rawOut, node.universal) : rawOut;
      // Stamp the author `key:` so the morph reconciler moves this node on a
      // sibling reorder (preserves DOM identity + enables FLIP — III.4).
      if (node.explicitKey != null && out instanceof Element && !(out as Element).hasAttribute("data-rui-key")) {
        (out as Element).setAttribute("data-rui-key", String(node.explicitKey));
      }
      // The element picker's anchor: this node now traces back to this instance.
      if (this.tagDom) this.tagInstance(out, instancePath, INSTANCE_ATTR);
      if (this.profiling) {
        this.profile(
          instancePath, node.name, "library", libPhase, nowMs() - libStart,
          libPhase === "mount" ? "mounted" : "re-rendered", undefined,
          { source: node.source, explicitKey: node.explicitKey, props: this.libraryProps(spec, node, overrides) },
        );
      }
      return out;
    } catch (err) {
      if (this.profiling) {
        this.profile(
          instancePath, node.name, "library", libPhase, nowMs() - libStart, "render threw", undefined,
          { source: node.source, explicitKey: node.explicitKey, props: this.libraryProps(spec, node, overrides) },
        );
      }
      // eslint-disable-next-line no-console
      console.error(`[aktion] failed to render ${spec.name}`, err);
      const fallback = document.createElement("div");
      fallback.className = "rui-render-error";
      fallback.textContent = `[render error in ${spec.name}]`;
      return fallback;
    }
  }

  /** Prop records for a library component instance, or `undefined` when off. */
  private libraryProps(
    spec: { props: ReadonlyArray<{ name: string }> },
    node: ComponentNode,
    overrides: ReadonlyMap<string, unknown> | undefined,
  ): ComponentPropRecord[] | undefined {
    if (!this.captureProps) return undefined;
    const names = spec.props.map((p) => p.name);
    const stateRefs = node.args.map((_, i) => node.argMeta[i]?.stateRef);
    return this.buildPropRecords(names, node.args, stateRefs, undefined, node.universal, overrides);
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
