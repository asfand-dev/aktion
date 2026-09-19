import { ComponentNode } from '../runtime/evaluator.js';
import { Router } from '../runtime/router.js';
export type PrimitiveType = "string" | "number" | "boolean" | "any" | "callable" | "Node" | "Node[]";
export interface PropSpec {
    name: string;
    type: PrimitiveType | string;
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
export declare function findPositionalIndex(spec: ComponentSpec): number;
export declare function findPositionalProp(spec: ComponentSpec): PropSpec | undefined;
/**
 * Asserts that every spec in the library declares at most one positional
 * prop. Surfaces inconsistencies as a `SyntaxError` at module load so the
 * library never ships a contradictory spec.
 */
export declare function assertOnePositionalMax(specs: ReadonlyArray<ComponentSpec>): void;
/**
 * Minimal shape of one call argument for binding decisions: `objectKeys`
 * is the list of non-spread literal keys when the argument is an object
 * literal, `null` for every other expression kind.
 */
export interface CallArgShape {
    objectKeys: ReadonlyArray<string> | null;
}
/** True when a prop's declared type can accept a plain-object payload. */
export declare function propExpectsObject(prop: PropSpec): boolean;
/** Prop names + aliases (the names a named-props object may use), plus `key`. */
export declare function knownPropNames(spec: ComponentSpec): Set<string>;
/**
 * The slot the `n`-th (0-based) positional argument binds to, mirroring the
 * runtime: positional #0 → the `positional: true` slot (or slot 0), every
 * later positional → the next unfilled slot in declaration order. `null`
 * when the call has more positionals than the spec has props.
 */
export declare function slotForNthPositional(spec: ComponentSpec, n: number): PropSpec | null;
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
export declare function chooseNamedBagIndex(args: ReadonlyArray<CallArgShape>, spec: ComponentSpec): number;
/** Build `CallArgShape`s from AST call arguments (parser `Expression`s). */
export declare function callArgShapes(args: ReadonlyArray<{
    kind: string;
    properties?: ReadonlyArray<{
        spread?: unknown;
        key: string;
    }>;
}>): CallArgShape[];
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
    bindState: (element: HTMLElement, name: string, options?: {
        event?: string;
        getValue?: (el: HTMLElement) => unknown;
    }) => void;
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
export type ComponentRenderFn = (node: ComponentNode, props: Record<string, unknown>, helpers: RenderHelpers) => Node;
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
export declare function mapPositionalArgs(spec: ComponentSpec, args: ReadonlyArray<unknown>): Record<string, unknown>;
