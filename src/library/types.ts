/**
 * Component library schema types.
 *
 * Components are described by:
 *   - `name`: identifier used in Aktion (e.g. `Stack`, `Button`).
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
  | "callable"
  | "Node"
  | "Node[]";

export interface PropSpec {
  name: string;
  type: PrimitiveType | string; // accept named types like "Series[]"
  optional?: boolean;
  /**
   * Aktion 0.5 §19.1 — at most one prop per spec may be marked
   * positional. Authors may pass exactly one positional argument at the
   * call site; it lands in this prop's slot regardless of its position in
   * the `props` array. Every other prop must be provided as a named
   * argument (`prop: value`). Specs without any `positional: true` flag
   * reject every positional argument at evaluation time.
   */
  positional?: boolean;
  /**
   * Marker only — recorded so the schema-driven prompt generator can render
   * required props without an `?` suffix. Not enforced by the runtime.
   */
  required?: boolean;
  description?: string;
  /** Accepted enum values, formatted as a comma-separated list in the prompt. */
  enum?: readonly string[];
  /**
   * Optional alternative names that route to this prop when used as a
   * `name: value` named argument at the call site. Lets the same prop be
   * called by its canonical name *and* a synonym so authors writing
   * `Badge("Live", tone: "success")` and `Badge("Live", variant: "success")`
   * both land in the same slot. Aliases never change the runtime prop name
   * — renderers continue to read `props[spec.name]`.
   */
  aliases?: readonly string[];
}

export interface ComponentSpec {
  name: string;
  description: string;
  props: readonly PropSpec[];
  render: ComponentRenderFn;
}

/**
 * Aktion 0.5 §19.1 — locate the canonical positional prop
 * for a spec. A spec opts in by marking exactly one prop with
 * `positional: true`. Specs that omit the marker fall back to "first prop
 * is positional", which is the convention every legacy library component
 * was authored with.
 *
 * `findPositionalIndex` is consumed by the evaluator (to route the single
 * positional argument to the right slot regardless of where in `props`
 * the positional prop lives — e.g. `Portal(target?, children)` keeps
 * `children` as the positional but it lives at index 1).
 *
 * `findPositionalProp` returns the resolved prop or `undefined` for void
 * components (zero props).
 */
export function findPositionalIndex(spec: ComponentSpec): number {
  const explicit = spec.props.findIndex((p) => p.positional === true);
  if (explicit >= 0) return explicit;
  return spec.props.length > 0 ? 0 : -1;
}

export function findPositionalProp(spec: ComponentSpec): PropSpec | undefined {
  const idx = findPositionalIndex(spec);
  return idx >= 0 ? spec.props[idx] : undefined;
}

/**
 * Asserts that every spec in the library declares at most one positional
 * prop. Surfaces inconsistencies as a `SyntaxError` at module load so the
 * library never ships a contradictory spec.
 */
export function assertOnePositionalMax(specs: ReadonlyArray<ComponentSpec>): void {
  for (const spec of specs) {
    const positional = spec.props.filter((p) => p.positional === true);
    if (positional.length > 1) {
      const names = positional.map((p) => p.name).join(", ");
      throw new SyntaxError(
        `Component "${spec.name}" declares ${positional.length} positional ` +
          `props (${names}). Aktion 0.5 §19.1 allows at most one.`,
      );
    }
  }
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
  /**
   * Invoke a user-supplied callable (e.g. a lambda passed as an `onClick`
   * prop, or a bare `action` declaration reference). Safe to call with
   * `undefined` / `null` — silently no-ops. Returned values are ignored.
   *
   * This is the single dispatch path for user-authored event handlers in
   * Aktion 0.5. The legacy `Action([@Set, @Run, ...])` payload
   * is no longer accepted.
   */
  invoke: (callable: unknown, ...args: unknown[]) => void;
  /** Set a state value. Used by library primitives for their own internal state writes. */
  setState: (name: string, value: unknown) => void;
  /** Reset state values back to their initial declared value. */
  resetState: (...names: string[]) => void;
  /** Dispatch an `assistant-message` CustomEvent on the host element. */
  sendToAssistant: (message: string) => void;
  /** Open a URL (sanitised against `javascript:` payloads). */
  openUrl: (url: string) => void;
  /** Bind a `$variable` to an HTML form element. */
  bindState: (
    element: HTMLElement,
    name: string,
    options?: { event?: string; getValue?: (el: HTMLElement) => unknown },
  ) => void;
  /**
   * Persist component-local state across re-renders. The slot is keyed by
   * the component's position in the tree (its source location plus its
   * path through sibling iterations), so independent instances never share
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
   * Hash-based router instance, always provided. Components such as `NavLink`
   * call `router.navigate(path)` directly to change the active route.
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

/** Resolve positional args from Aktion into named props. */
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
