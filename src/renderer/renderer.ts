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

import { isComponentNode, type ComponentNode } from "../runtime/evaluator.js";
import { isActionPayload } from "../runtime/builtins.js";
import type { ActionRunner } from "../runtime/actions.js";
import type { StateStore } from "../runtime/state.js";
import type { ScriptRunner } from "../runtime/scripts.js";
import type { Router } from "../runtime/router.js";
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
  actionRunner: ActionRunner;
  /** Optional script runner — when omitted, Script() and @Js are no-ops. */
  scriptRunner?: ScriptRunner;
  /**
   * Hash-based router. Required: components read the active path through
   * it (e.g. `NavLink` to highlight the active link).
   */
  router: Router;
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
  }

  private safeDispose(dispose: () => void): void {
    try {
      dispose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[streaming-ui-script] disposer threw", err);
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
    if (isComponentNode(value)) return this.renderComponent(value, path);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return document.createTextNode(String(value));
    }
    return document.createTextNode("");
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
    const scriptRunner = this.options.scriptRunner;
    const instancePath = `${path}#${node.name}@${node.source?.line ?? 0}:${node.source?.column ?? 0}`;
    this.aliveInstances.add(instancePath);

    // Track an auto-increment counter so `helpers.renderNode(child)` calls
    // get a stable sibling index even when a component renders several
    // children in a row.
    let childCounter = 0;
    const helpers: RenderHelpers = {
      renderNode: (childValue) => this.renderAt(childValue, `${instancePath}>${childCounter++}`),
      runAction: (payload) => {
        if (isActionPayload(payload)) void this.options.actionRunner.run(payload);
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
      registerScript: (declaration) => {
        scriptRunner?.declare(declaration);
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
      console.error(`[streaming-ui-script] failed to render ${spec.name}`, err);
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
