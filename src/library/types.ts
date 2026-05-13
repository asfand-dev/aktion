/**
 * Component library schema types.
 *
 * Components are described by:
 *   - `name`: identifier used in Streaming UI Script (e.g. `Stack`, `Button`).
 *   - `props`: ordered prop list. Order defines positional argument mapping.
 *   - `description`: shown in the generated system prompt.
 *   - `render`: produces a DOM node from resolved prop values.
 */

import type { ComponentNode } from "../runtime/evaluator.js";
import type { Router } from "../runtime/router.js";

export type PrimitiveType =
  | "string"
  | "number"
  | "boolean"
  | "any"
  | "Action"
  | "Node"
  | "Node[]";

export interface PropSpec {
  name: string;
  type: PrimitiveType | string; // accept named types like "Series[]"
  optional?: boolean;
  description?: string;
  /** Accepted enum values, formatted as a comma-separated list in the prompt. */
  enum?: readonly string[];
}

export interface ComponentSpec {
  name: string;
  description: string;
  props: readonly PropSpec[];
  render: ComponentRenderFn;
}

/**
 * Stable, component-local state slot. Returned by
 * `RenderHelpers.useInstanceState`. Keep the reference for the lifetime of
 * a single render — the renderer wires it to a long-lived storage cell so
 * subsequent renders read the value the previous click handler wrote.
 */
export interface InstanceStateSlot<T> {
  get(): T;
  set(value: T): void;
}

export interface RenderHelpers {
  /** Render a child node tree (a ComponentNode or array of nodes). */
  renderNode: (node: unknown) => Node;
  /** Run an Action payload (e.g. when a button is clicked). */
  runAction: (payload: unknown) => void;
  /** Bind a `$variable` to an HTML form element. */
  bindState: (
    element: HTMLElement,
    name: string,
    options?: { event?: string; getValue?: (el: HTMLElement) => unknown },
  ) => void;
  /**
   * Register a JavaScript script declared via `Script("id", "body", deps?)`.
   * The runner reconciles registrations after each render — new scripts run,
   * changed scripts re-run with cleanup, removed scripts dispose.
   */
  registerScript: (declaration: {
    id: string;
    body: string;
    deps?: ReadonlyArray<string>;
  }) => void;
  /**
   * Persist component-local state across re-renders. The slot is keyed by
   * the component's position in the tree (its source location plus its
   * path through `@Each` siblings), so independent instances never share
   * a value. Used by stateful primitives like `Tabs` so user-driven UI
   * state (active tab, expanded row, …) survives a re-render triggered by
   * unrelated state changes.
   */
  useInstanceState: <T>(key: string, initialValue: T) => InstanceStateSlot<T>;
  /**
   * Register a cleanup callback tied to this component instance. The renderer
   * invokes the callback once the instance disappears from the tree (e.g. a
   * Toast finishes auto-dismissing or the parent re-renders without it).
   * Use for `setTimeout` / `setInterval` handles and external resources so we
   * never accumulate work for components the user can no longer see.
   *
   * Calling this multiple times during a single render replaces any previous
   * disposer for the same `key` (cancelling the prior cleanup runs immediately
   * via that callback's caller). If `key` is omitted, each call registers an
   * independent disposer.
   */
  registerDisposer: (cleanup: () => void, key?: string) => void;
  /**
   * Hash-based router instance, always provided. `NavLink(...)` uses this to
   * navigate; `Routes(...)` consults it via the evaluator before rendering.
   */
  router: Router;
}

export type ComponentRenderFn = (
  node: ComponentNode,
  props: Record<string, unknown>,
  helpers: RenderHelpers,
) => Node;

export interface ComponentGroup {
  name: string;
  components: readonly string[];
  notes?: readonly string[];
}

export interface ComponentLibrary {
  root: string;
  components: ReadonlyArray<ComponentSpec>;
  componentGroups?: ReadonlyArray<ComponentGroup>;
}

/** Resolve positional args from Streaming UI Script into named props. */
export function mapPositionalArgs(
  spec: ComponentSpec,
  args: ReadonlyArray<unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  spec.props.forEach((prop, index) => {
    if (index < args.length) out[prop.name] = args[index];
  });
  return out;
}
