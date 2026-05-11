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
   *
   * No-op when the host element has `enable-javascript="false"` (the default).
   */
  registerScript: (declaration: {
    id: string;
    body: string;
    deps?: ReadonlyArray<string>;
  }) => void;
  /** True when the host element has opted in to JavaScript interactions. */
  javascriptEnabled: boolean;
  /**
   * Hash-based router instance, or `null` when routing isn't enabled on the
   * host. `NavLink(...)` uses this to navigate; `Routes(...)` consults it
   * via the evaluator before rendering.
   */
  router: Router | null;
  /** True when the host has `enable-routes="true"`. */
  routesEnabled: boolean;
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
