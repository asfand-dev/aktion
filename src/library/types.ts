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
import { UNIVERSAL_PROP_NAMES } from "./sx.js";

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

/* ----------------------------------------------------------------------- *
 * Flexible call binding (§19) — shared between the runtime evaluator and
 * the schema validator so both agree on how a call's arguments map onto a
 * spec's props. Library calls accept:
 *   - positional arguments in slot order (first one lands in the
 *     `positional: true` slot, the rest fill the remaining slots in
 *     declaration order),
 *   - a named-props object (the trailing `{ prop: value }` form, the legacy
 *     leading-object form, or a single all-named object argument), and
 *   - the combination of one-or-more positionals plus the named object.
 * `chooseNamedBagIndex` decides which argument (if any) plays the
 * named-props role; everything else is positional.
 * ----------------------------------------------------------------------- */

/**
 * Minimal shape of one call argument for binding decisions: `objectKeys`
 * is the list of non-spread literal keys when the argument is an object
 * literal, `null` for every other expression kind.
 */
export interface CallArgShape {
  objectKeys: ReadonlyArray<string> | null;
}

/** True when a prop's declared type can accept a plain-object payload. */
export function propExpectsObject(prop: PropSpec): boolean {
  return /\bobject\b|\bRecord\b|\{|\bany\b/i.test(prop.type);
}

/** Prop names + aliases (the names a named-props object may use), plus `key`. */
export function knownPropNames(spec: ComponentSpec): Set<string> {
  const names = new Set<string>();
  for (const p of spec.props) {
    names.add(p.name);
    if (p.aliases) for (const alias of p.aliases) names.add(alias);
  }
  names.add("key");
  return names;
}

/**
 * The slot the `n`-th (0-based) positional argument binds to, mirroring the
 * runtime: positional #0 → the `positional: true` slot (or slot 0), every
 * later positional → the next unfilled slot in declaration order. `null`
 * when the call has more positionals than the spec has props.
 */
export function slotForNthPositional(spec: ComponentSpec, n: number): PropSpec | null {
  const positionalIndex = findPositionalIndex(spec);
  if (positionalIndex < 0) return null;
  const filled = new Set<number>();
  let target = -1;
  for (let i = 0; i <= n; i += 1) {
    if (i === 0) {
      target = positionalIndex;
    } else {
      let cursor = 0;
      while (cursor < spec.props.length && filled.has(cursor)) cursor += 1;
      if (cursor >= spec.props.length) return null;
      target = cursor;
    }
    filled.add(target);
  }
  return spec.props[target] ?? null;
}

/**
 * Decide which argument of a library-component call is the named-props
 * object. Returns the argument index, or `-1` when every argument is
 * positional. The rules, in order:
 *
 *   1. Single object argument, one-prop component → the object is the
 *      prop's payload when that prop accepts an object; otherwise it is
 *      named props exactly when all keys are known prop names.
 *   2. Single object argument, multi-prop component → named props when all
 *      keys are known; a payload for an object-typed positional slot when
 *      none are; otherwise assume named props so validation can flag the
 *      unknown keys.
 *   3. Multiple arguments — the LAST object literal is the candidate:
 *      in trailing position it is the named-props object (the canonical
 *      form) unless none of its keys are known and the slot it would fill
 *      expects an object; in leading/middle position (legacy
 *      `Grid({cols: 12}, [...])`) it is named props only when at least one
 *      key is a known prop name.
 *
 * A single object is never split between roles — it is wholly named props
 * or wholly a positional payload.
 */
export function chooseNamedBagIndex(
  args: ReadonlyArray<CallArgShape>,
  spec: ComponentSpec,
): number {
  let lastObj = -1;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (args[i]!.objectKeys !== null) {
      lastObj = i;
      break;
    }
  }
  if (lastObj < 0) return -1;
  const keys = args[lastObj]!.objectKeys!;
  const known = knownPropNames(spec);
  const knownCount = keys.reduce(
    (count, k) => count + (known.has(k) || UNIVERSAL_PROP_NAMES.has(k) ? 1 : 0),
    0,
  );
  const allKnown = keys.length > 0 && knownCount === keys.length;
  const anyKnown = knownCount > 0;
  const positionalProp = findPositionalProp(spec);

  if (args.length === 1) {
    if (spec.props.length === 1) {
      return propExpectsObject(spec.props[0]!) ? -1 : (allKnown ? 0 : -1);
    }
    if (allKnown) return 0;
    if (!anyKnown && positionalProp && propExpectsObject(positionalProp)) return -1;
    return 0;
  }

  if (lastObj !== args.length - 1) {
    return anyKnown ? lastObj : -1;
  }

  if (anyKnown || keys.length === 0) return lastObj;
  const slot = slotForNthPositional(spec, args.length - 1);
  if (slot && propExpectsObject(slot)) return -1;
  return lastObj;
}

/** Build `CallArgShape`s from AST call arguments (parser `Expression`s). */
export function callArgShapes(
  args: ReadonlyArray<{ kind: string; properties?: ReadonlyArray<{ spread?: unknown; key: string }> }>,
): CallArgShape[] {
  return args.map((arg) => ({
    objectKeys: arg.kind === "Object" && arg.properties
      ? arg.properties.filter((p) => !p.spread).map((p) => p.key)
      : null,
  }));
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

/**
 * Interoperability layer for third-party UI libraries (MUI, Bootstrap, ShadCN, etc.).
 *
 * Implement this interface in external adapter packages to replace Aktion's default
 * component set with mapped components from another design system.
 */
export interface UIProvider {
  /** Name of the provider (e.g. "mui", "bootstrap") */
  name: string;
  /** The component library mapping Aktion elements to the provider's implementation */
  library: ComponentLibrary;
  /** Optional setup hook to inject global styles, fonts, or provider contexts */
  setup?: (root: ShadowRoot | Document | HTMLElement) => void;
  /** Optional teardown hook when the provider is swapped out */
  teardown?: () => void;
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
