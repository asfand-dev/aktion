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
  isComponentNode,
  isUserComponentNode,
  evaluateUserComponent,
  type ComponentNode,
  type EvaluationContext,
  type UserComponentNode,
} from "../runtime/evaluator.js";
import type { EffectDeclaration } from "../parser/types.js";
import type { StateStore } from "../runtime/state.js";
import type { Router } from "../runtime/router.js";
import { sanitiseHref } from "../library/utils.js";
import { findComponent } from "../library/registry.js";
import {
  mapPositionalArgs,
  type ComponentLibrary,
  type InstanceStateSlot,
  type RenderHelpers,
} from "../library/types.js";

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
   * Mount `effect [ ...deps ] { … }` declarations discovered inside a
   * `component { … }` body. Called by the renderer after every render of
   * the instance; the implementation is expected to be idempotent so
   * re-renders are no-ops once the effects are mounted. The host wires
   * this to the same `EffectRunner` that handles top-level effects.
   */
  mountInstanceEffects?: (
    instanceKey: string,
    decls: ReadonlyArray<EffectDeclaration>,
    getCtx: () => EvaluationContext,
  ) => void;
  /**
   * Tear down every per-instance effect mounted under `instanceKey`.
   * Invoked when the component instance disappears from the render tree
   * (between two `beginRender`/`endRender` passes).
   */
  unmountInstanceEffects?: (instanceKey: string) => void;
}

const ROOT_PATH = "$";

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

  constructor(private options: RenderOptions) {}

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
    this.aliveInstances = new Set<string>();
  }

  /** Begin a fresh render pass; tracks which instances are still alive. */
  beginRender(): void {
    this.aliveInstances = new Set<string>();
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
    // Tear down per-instance effects (`effect [ … ] { … }` blocks declared
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
  }

  private safeDispose(dispose: () => void): void {
    try {
      dispose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion] disposer threw", err);
    }
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
   * Expand a user-declared `component Foo(p) { ... }` invocation. Each
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
    const { value, effects } = evaluateUserComponent(node, ctx, instancePath);
    // Hand any `effect [ ...deps ] { … }` declarations discovered inside
    // this component's body to the host's effect runner under the stable
    // instance key. The runner is idempotent across re-renders — it only
    // mounts effects new to this instance — and `endRender` tears them
    // down when the instance disappears from the tree.
    if (this.options.mountInstanceEffects) {
      this.options.mountInstanceEffects(instancePath, effects, ctxRef);
      if (effects.length > 0) this.instancesWithEffects.add(instancePath);
    }
    return this.renderAt(value, instancePath);
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
        this.options.state.set(name, value);
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
        (element as unknown as Record<string, unknown>)[propKey] = (event: Event) => {
          const target = (event.currentTarget ?? event.target ?? element) as HTMLElement;
          this.options.state.set(name, getter(target));
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
    try {
      return spec.render(node, props, helpers);
    } catch (err) {
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
