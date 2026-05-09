/**
 * Component library schema types.
 *
 * Components are described by:
 *   - `name`: identifier used in LLM Response UI Lang (e.g. `Stack`, `Button`).
 *   - `props`: ordered prop list. Order defines positional argument mapping.
 *   - `description`: shown in the generated system prompt.
 *   - `render`: produces a DOM node from resolved prop values.
 */

import type { ComponentNode } from "../runtime/evaluator.js";

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

/** Resolve positional args from LLM Response UI Lang into named props. */
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
