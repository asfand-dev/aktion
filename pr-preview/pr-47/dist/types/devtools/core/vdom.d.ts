/**
 * Aktion DevTools — a small keyed virtual DOM.
 *
 * The first-generation panel rebuilt every tab with `replaceChildren` on every
 * runtime event. That is simple and always truthful, but it destroys exactly
 * the things a debugger's user is holding on to: the hovered row, the text
 * selection, the scroll offset, the caret in a half-typed field, and every CSS
 * transition. The panel tried to paper over it by snapshotting focus and scroll
 * around each rebuild, which worked most of the time and failed in the moments
 * that mattered most (an event arriving mid-keystroke).
 *
 * This module keeps the good half of that design — a view is still a pure
 * function of the model, re-evaluated in full, so it can never drift from the
 * truth — and replaces the destructive half with a reconciler: the view returns
 * a lightweight tree, and only the differences reach the DOM. Nodes the user is
 * interacting with are never recreated, so there is nothing to restore.
 *
 * Deliberately NOT the Aktion renderer: the panel must keep working while it
 * debugs a program whose renderer is broken, so it cannot share that code path.
 *
 * Three escape hatches keep it small:
 *
 *   - **Widgets** (`class extends Widget`) own their subtree imperatively —
 *     virtual lists, canvases, the code editor. The reconciler hands them new
 *     props and never looks inside.
 *   - **Referential skip.** Handing back the *same* node object as last time
 *     (see `memo` in the view context) skips that subtree entirely, which is
 *     how an unchanged 2,000-row tree costs nothing to "re-render".
 *   - **No `innerHTML`.** There is no way to inject markup through a prop. The
 *     panel renders untrusted strings (response bodies, program text, console
 *     output); every one of them becomes a text node.
 */
export type Key = string | number;
/** Attributes, properties, listeners, `class`, `style`, `key`, and `ref`. */
export interface Props {
    [name: string]: unknown;
    key?: Key;
    ref?: ((element: Element | null) => void) | null;
}
export interface VElement {
    readonly type: "e";
    readonly tag: string;
    readonly props: Props;
    readonly children: VNode[];
    readonly key: Key | undefined;
    dom: Element | null;
}
export interface VText {
    readonly type: "t";
    readonly text: string;
    readonly key: undefined;
    dom: Text | null;
}
export interface VWidget<P = unknown> {
    readonly type: "w";
    readonly ctor: WidgetCtor<P>;
    readonly props: P;
    readonly key: Key | undefined;
    dom: Element | null;
    inst: Widget<P> | null;
}
/** What the reconciler needs from a widget instance, with its props erased. */
interface WidgetInstance {
    props: unknown;
    el: Element;
    mount(): Element;
    update(previous: unknown): void;
    unmount(): void;
}
/**
 * A widget node with its props type erased. Any `VWidget<P>` is assignable to
 * it (methods are bivariant), which is what lets one `VNode` union hold
 * widgets of every props type without falling back to `any`.
 */
export interface AnyVWidget {
    readonly type: "w";
    readonly ctor: new (props: never) => WidgetInstance;
    readonly props: unknown;
    readonly key: Key | undefined;
    dom: Element | null;
    inst: WidgetInstance | null;
}
export type VNode = VElement | VText | AnyVWidget;
/** Anything a view may return as a child. Falsy values render nothing. */
export type Child = VNode | string | number | boolean | null | undefined | Child[];
/** A function component: pure, stateless, called inline. */
export type Component<P> = (props: P) => Child;
/**
 * A node that renders itself.
 *
 * The reconciler creates the widget once (`mount`), passes every later set of
 * props to `update`, and calls `unmount` when the node leaves the tree. What
 * happens inside `el` is the widget's business — typically it calls
 * {@link render} into a child container of its own, which is how a virtual list
 * renders only the rows in view.
 */
export declare abstract class Widget<P = Record<string, unknown>> {
    props: P;
    /** The root element `mount` returned. */
    el: Element;
    constructor(props: P);
    /** Build and return the root element. Called exactly once. */
    abstract mount(): Element;
    /** New props arrived; `this.props` already holds them. */
    update(_previous: P): void;
    /** The node left the tree. Release listeners, observers, and timers here. */
    unmount(): void;
}
export type WidgetCtor<P> = new (props: P) => Widget<P>;
/**
 * Build a node. `tag` is an element name, a {@link Widget} subclass, or a
 * function component. Children may be nested arrays; `null`, `undefined`,
 * `false`, and `true` are skipped so conditionals read naturally
 * (`cond && h("span", …)`).
 */
export declare function h(tag: string, props?: Props | null, ...children: Child[]): VElement;
export declare function h<P>(tag: WidgetCtor<P>, props: P & {
    key?: Key;
}): VWidget<P>;
export declare function h<P>(tag: Component<P>, props: P, ...children: Child[]): Child;
/** A text node. Rarely needed — strings are converted automatically. */
export declare function text(value: string | number): VText;
/** Flatten children into real nodes, dropping the falsy ones. */
export declare function normalize(children: Child | ReadonlyArray<Child>): VNode[];
type Container = Element | ShadowRoot | DocumentFragment;
/**
 * Reconcile `children` into `container`. The container is owned from here on:
 * nodes it holds that `render` did not create are left alone only if they were
 * never part of a previous render — mixing managed and unmanaged children in
 * one container is not supported.
 */
export declare function render(container: Container, children: Child): void;
/** Tear down everything `render` put into `container`. */
export declare function unmountAll(container: Container): void;
/**
 * A `ref` that focuses its element once, after it is in the document.
 *
 * Refs run during creation, before the node is attached, so focusing there
 * silently does nothing; a microtask later the render has finished and the
 * element is live. The WeakSet makes it once-per-element, so a re-render never
 * drags focus back to a field the user has left.
 */
export declare function autofocus(options?: {
    select?: boolean;
}): (element: Element | null) => void;
/** `class` may be a string, an array, or a `{ name: boolean }` map. */
export declare function classString(value: unknown): string;
export {};
