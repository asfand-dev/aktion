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

/* -------------------------------------------------------------------------- */
/*  Widgets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A node that renders itself.
 *
 * The reconciler creates the widget once (`mount`), passes every later set of
 * props to `update`, and calls `unmount` when the node leaves the tree. What
 * happens inside `el` is the widget's business — typically it calls
 * {@link render} into a child container of its own, which is how a virtual list
 * renders only the rows in view.
 */
export abstract class Widget<P = Record<string, unknown>> {
  props: P;
  /** The root element `mount` returned. */
  el!: Element;

  constructor(props: P) {
    this.props = props;
  }

  /** Build and return the root element. Called exactly once. */
  abstract mount(): Element;

  /** New props arrived; `this.props` already holds them. */
  update(_previous: P): void {
    /* optional */
  }

  /** The node left the tree. Release listeners, observers, and timers here. */
  unmount(): void {
    /* optional */
  }
}

export type WidgetCtor<P> = new (props: P) => Widget<P>;

function isWidgetCtor(value: unknown): value is WidgetCtor<unknown> {
  return typeof value === "function" && (value as { prototype?: unknown }).prototype instanceof Widget;
}

/* -------------------------------------------------------------------------- */
/*  Construction                                                               */
/* -------------------------------------------------------------------------- */

const EMPTY_PROPS: Props = Object.freeze({}) as Props;

/**
 * Build a node. `tag` is an element name, a {@link Widget} subclass, or a
 * function component. Children may be nested arrays; `null`, `undefined`,
 * `false`, and `true` are skipped so conditionals read naturally
 * (`cond && h("span", …)`).
 */
export function h(tag: string, props?: Props | null, ...children: Child[]): VElement;
export function h<P>(tag: WidgetCtor<P>, props: P & { key?: Key }): VWidget<P>;
export function h<P>(tag: Component<P>, props: P, ...children: Child[]): Child;
export function h(tag: unknown, props?: unknown, ...children: Child[]): Child {
  if (typeof tag === "string") {
    const p = (props ?? EMPTY_PROPS) as Props;
    return {
      type: "e",
      tag,
      props: p,
      children: normalize(children),
      key: p.key,
      dom: null,
    };
  }
  if (isWidgetCtor(tag)) {
    const p = (props ?? {}) as { key?: Key };
    return { type: "w", ctor: tag, props: p, key: p.key, dom: null, inst: null };
  }
  if (typeof tag === "function") {
    const p = { ...((props as object | null) ?? {}), children } as Record<string, unknown>;
    return (tag as Component<unknown>)(p);
  }
  throw new TypeError("[aktion-devtools] h(): unsupported tag");
}

/** A text node. Rarely needed — strings are converted automatically. */
export function text(value: string | number): VText {
  return { type: "t", text: String(value), key: undefined, dom: null };
}

/** Flatten children into real nodes, dropping the falsy ones. */
export function normalize(children: Child | ReadonlyArray<Child>): VNode[] {
  const out: VNode[] = [];
  const visit = (child: Child | ReadonlyArray<Child>): void => {
    // A falsy child keeps its SLOT as an empty text node. Dropping it would
    // shift every later sibling by one whenever a conditional (`cond ? x :
    // null`) flips, and the reconciler would then rebuild those siblings —
    // losing their focus, scroll offset, and widget state. Empty text nodes
    // generate no layout box and do not affect `:empty` or `textContent`.
    if (child === null || child === undefined || child === false || child === true) {
      out.push(text(""));
      return;
    }
    if (Array.isArray(child)) {
      for (const inner of child) visit(inner);
      return;
    }
    if (typeof child === "string" || typeof child === "number") {
      out.push(text(child));
      return;
    }
    out.push(child as VNode);
  };
  visit(children as Child);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                  */
/* -------------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const ROOT_KEY = "__dtVNodes";
const LISTENERS_KEY = "__dtListeners";

type Container = Element | ShadowRoot | DocumentFragment;

interface ContainerWithState {
  [ROOT_KEY]?: VNode[];
}

/**
 * Reconcile `children` into `container`. The container is owned from here on:
 * nodes it holds that `render` did not create are left alone only if they were
 * never part of a previous render — mixing managed and unmanaged children in
 * one container is not supported.
 */
export function render(container: Container, children: Child): void {
  const next = normalize(children);
  const state = container as unknown as ContainerWithState;
  const previous = state[ROOT_KEY] ?? [];
  patchChildren(container, previous, next, namespaceOf(container));
  state[ROOT_KEY] = next;
}

/** Tear down everything `render` put into `container`. */
export function unmountAll(container: Container): void {
  const state = container as unknown as ContainerWithState;
  const previous = state[ROOT_KEY];
  if (!previous) return;
  for (const node of previous) {
    destroy(node);
    if (node.dom && node.dom.parentNode === container) container.removeChild(node.dom);
  }
  state[ROOT_KEY] = [];
}

function namespaceOf(container: Container): string | null {
  if (container instanceof Element && container.namespaceURI === SVG_NS && container.tagName.toLowerCase() !== "foreignobject") {
    return SVG_NS;
  }
  return null;
}

function childNamespace(tag: string, ns: string | null): string | null {
  if (tag === "svg") return SVG_NS;
  if (ns === SVG_NS && tag === "foreignObject") return null;
  return ns;
}

function create(node: VNode, ns: string | null): Node {
  switch (node.type) {
    case "t": {
      const dom = document.createTextNode(node.text);
      node.dom = dom;
      return dom;
    }
    case "w": {
      const inst = new (node.ctor as unknown as new (props: unknown) => WidgetInstance)(node.props);
      let dom: Element;
      try {
        dom = inst.mount();
      } catch (err) {
        // A widget that cannot mount must not take the rest of the view with it:
        // the reconciler needs SOME node in this slot to keep positions aligned.
        // eslint-disable-next-line no-console
        console.error("[aktion-devtools] widget mount threw", err);
        dom = document.createElement("div");
        dom.className = "dt-widget-error";
        dom.textContent = `This view failed to load: ${err instanceof Error ? err.message : String(err)}`;
      }
      inst.el = dom;
      node.inst = inst;
      node.dom = dom;
      return dom;
    }
    case "e": {
      const elementNs = childNamespace(node.tag, ns);
      const dom = elementNs ? document.createElementNS(elementNs, node.tag) : document.createElement(node.tag);
      node.dom = dom;
      const inner = elementNs === SVG_NS && node.tag === "foreignObject" ? null : elementNs;
      for (const child of node.children) dom.appendChild(create(child, inner));
      // Props AFTER children: a <select>'s `value` only sticks once its options exist.
      const isSvg = elementNs === SVG_NS;
      for (const name in node.props) setProp(dom, name, undefined, node.props[name], isSvg);
      const ref = node.props.ref;
      if (typeof ref === "function") ref(dom);
      return dom;
    }
  }
}

function sameShape(a: VNode, b: VNode): boolean {
  if (a.type !== b.type || a.key !== b.key) return false;
  if (a.type === "e") return a.tag === (b as VElement).tag;
  if (a.type === "w") return a.ctor === (b as AnyVWidget).ctor;
  return true;
}

function patch(parent: Container, previous: VNode, next: VNode, ns: string | null): void {
  if (previous === next) return;
  if (!sameShape(previous, next)) {
    const dom = create(next, ns);
    if (previous.dom && previous.dom.parentNode === parent) parent.replaceChild(dom, previous.dom);
    else parent.appendChild(dom);
    destroy(previous);
    return;
  }
  switch (next.type) {
    case "t": {
      const old = previous as VText;
      const dom = old.dom!;
      if (old.text !== next.text) dom.data = next.text;
      next.dom = dom;
      return;
    }
    case "w": {
      const old = previous as AnyVWidget;
      const inst = old.inst!;
      const before = inst.props;
      inst.props = next.props;
      next.inst = inst;
      next.dom = old.dom;
      try {
        inst.update(before);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[aktion-devtools] widget update threw", err);
      }
      return;
    }
    case "e": {
      const old = previous as VElement;
      const dom = old.dom!;
      next.dom = dom;
      const elementNs = childNamespace(next.tag, ns);
      const inner = elementNs === SVG_NS && next.tag === "foreignObject" ? null : elementNs;
      patchChildren(dom, old.children, next.children, inner);
      patchProps(dom, old.props, next.props, elementNs === SVG_NS);
      return;
    }
  }
}

/**
 * Reconcile two child lists.
 *
 * Keyed children are matched by key wherever they moved; unkeyed children are
 * matched in order against unkeyed old children of the same shape. The final
 * pass walks the new list from the end and only moves a node when it is not
 * already in front of its successor, so an unchanged list performs zero DOM
 * operations and an append performs exactly one.
 */
function patchChildren(parent: Container, previous: ReadonlyArray<VNode>, next: ReadonlyArray<VNode>, ns: string | null): void {
  if (previous.length === 0 && next.length === 0) return;
  if (previous.length === 0) {
    for (const child of next) parent.appendChild(create(child, ns));
    return;
  }
  if (next.length === 0) {
    for (const child of previous) removeNode(parent, child);
    return;
  }

  // Fast path: identical shapes position by position (the overwhelmingly common
  // case of a re-render where only values changed).
  if (previous.length === next.length) {
    let aligned = true;
    for (let i = 0; i < next.length; i += 1) {
      if (!sameShape(previous[i]!, next[i]!)) {
        aligned = false;
        break;
      }
    }
    if (aligned) {
      for (let i = 0; i < next.length; i += 1) patch(parent, previous[i]!, next[i]!, ns);
      return;
    }
  }

  const keyed = new Map<Key, VNode>();
  const unkeyed: VNode[] = [];
  for (const child of previous) {
    if (child.key !== undefined) keyed.set(child.key, child);
    else unkeyed.push(child);
  }
  const used = new Set<VNode>();
  let ordinal = 0;

  for (const child of next) {
    let match: VNode | undefined;
    if (child.key !== undefined) {
      const candidate = keyed.get(child.key);
      if (candidate && !used.has(candidate) && sameShape(candidate, child)) match = candidate;
    } else {
      // Unkeyed children match by their position AMONG UNKEYED SIBLINGS (keyed
      // rows between them do not shift it, and falsy children hold their slot
      // — see `normalize`). A greedy "next node with the same tag" scan made a
      // newly shown <div> steal the following <div>'s DOM, rebuilding it.
      const candidate = unkeyed[ordinal];
      ordinal += 1;
      if (candidate && !used.has(candidate) && sameShape(candidate, child)) match = candidate;
    }
    if (match) {
      used.add(match);
      patch(parent, match, child, ns);
    } else {
      create(child, ns);
    }
  }

  for (const child of previous) {
    if (!used.has(child)) removeNode(parent, child);
  }

  let ref: Node | null = null;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const dom = next[i]!.dom!;
    if (dom.parentNode !== parent || dom.nextSibling !== ref) parent.insertBefore(dom, ref);
    ref = dom;
  }
}

function removeNode(parent: Container, node: VNode): void {
  destroy(node);
  if (node.dom && node.dom.parentNode === parent) parent.removeChild(node.dom);
}

function destroy(node: VNode): void {
  if (node.type === "w") {
    try {
      node.inst?.unmount();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion-devtools] widget unmount threw", err);
    }
    return;
  }
  if (node.type === "e") {
    for (const child of node.children) destroy(child);
    const ref = node.props.ref;
    if (typeof ref === "function") ref(null);
  }
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                      */
/* -------------------------------------------------------------------------- */

function patchProps(dom: Element, previous: Props, next: Props, isSvg: boolean): void {
  if (previous === next) return;
  for (const name in previous) {
    if (!(name in next)) setProp(dom, name, previous[name], undefined, isSvg);
  }
  // A field with an input listener is CONTROLLED: its `value` is compared
  // against the LIVE element, because the user may have typed since the last
  // render and the view's state is the truth. A field WITHOUT one is
  // uncontrolled — `value` is its default, re-applied only when the prop itself
  // changes — so an unrelated re-render (the panel repaints on every runtime
  // event) never wipes what someone is halfway through typing.
  const controlled = typeof next.onInput === "function";
  for (const name in next) {
    const value = next[name];
    const old = previous[name];
    if (value !== old || (name === "value" && controlled) || name === "checked") setProp(dom, name, old, value, isSvg);
  }
  // `ref` is a mount/unmount callback, deliberately NOT re-invoked when its
  // identity changes: views pass inline closures, and calling them on every
  // render would make "focus this on mount" steal focus back forever.
}

const autofocused = new WeakSet<Element>();

/**
 * A `ref` that focuses its element once, after it is in the document.
 *
 * Refs run during creation, before the node is attached, so focusing there
 * silently does nothing; a microtask later the render has finished and the
 * element is live. The WeakSet makes it once-per-element, so a re-render never
 * drags focus back to a field the user has left.
 */
export function autofocus(options: { select?: boolean } = {}): (element: Element | null) => void {
  return (element) => {
    if (!element || autofocused.has(element)) return;
    autofocused.add(element);
    queueMicrotask(() => {
      if (!element.isConnected) return;
      (element as HTMLElement).focus({ preventScroll: true });
      if (options.select) (element as HTMLInputElement).select?.();
    });
  };
}

type ListenerMap = Record<string, ((event: Event) => void) | undefined>;

function dispatchEvent(this: Element, event: Event): void {
  const map = (this as unknown as { [LISTENERS_KEY]?: ListenerMap })[LISTENERS_KEY];
  const handler = map?.[event.type];
  if (handler) handler(event);
}

function setListener(dom: Element, name: string, handler: unknown): void {
  const type = name.slice(2).toLowerCase();
  const holder = dom as unknown as { [LISTENERS_KEY]?: ListenerMap };
  let map = holder[LISTENERS_KEY];
  if (!map) {
    map = {};
    holder[LISTENERS_KEY] = map;
  }
  const fn = typeof handler === "function" ? (handler as (event: Event) => void) : undefined;
  if (!(type in map)) {
    if (!fn) return;
    // One stable listener per event type; swapping the handler is a property
    // write, so a closure recreated on every render costs nothing.
    dom.addEventListener(type, dispatchEvent as EventListener, type === "wheel" || type === "touchmove" ? { passive: false } : undefined);
  }
  map[type] = fn;
}

/** `class` may be a string, an array, or a `{ name: boolean }` map. */
export function classString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(classString).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const out: string[] = [];
    for (const [name, on] of Object.entries(value as Record<string, unknown>)) if (on) out.push(name);
    return out.join(" ");
  }
  return String(value);
}

function kebab(name: string): string {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function setStyle(dom: Element, previous: unknown, value: unknown): void {
  const style = (dom as HTMLElement).style;
  if (!style) return;
  if (value == null || value === false) {
    dom.removeAttribute("style");
    return;
  }
  if (typeof value === "string") {
    if (style.cssText !== value) style.cssText = value;
    return;
  }
  const next = value as Record<string, unknown>;
  const old = (typeof previous === "object" && previous !== null ? previous : {}) as Record<string, unknown>;
  if (typeof previous === "string") style.cssText = "";
  for (const name in old) {
    if (!(name in next)) style.removeProperty(kebab(name));
  }
  for (const name in next) {
    const v = next[name];
    if (v === old[name] && typeof previous !== "string") continue;
    if (v == null || v === false || v === "") style.removeProperty(kebab(name));
    else style.setProperty(kebab(name), String(v));
  }
}

/** Properties that must be written as DOM properties rather than attributes. */
const DOM_PROPERTIES = new Set(["checked", "indeterminate", "selected", "muted"]);

function setProp(dom: Element, name: string, previous: unknown, value: unknown, isSvg: boolean): void {
  if (name === "key" || name === "children" || name === "ref") return;
  if (name.length > 2 && name[0] === "o" && name[1] === "n") {
    setListener(dom, name, value);
    return;
  }
  if (name === "class" || name === "className") {
    const cls = classString(value);
    if (isSvg) {
      if (cls) dom.setAttribute("class", cls);
      else dom.removeAttribute("class");
    } else if ((dom as HTMLElement).className !== cls) {
      (dom as HTMLElement).className = cls;
    }
    return;
  }
  if (name === "style") {
    setStyle(dom, previous, value);
    return;
  }
  if (name === "value" && !isSvg) {
    const field = dom as HTMLInputElement;
    const next = value == null ? "" : String(value);
    if (field.value !== next) field.value = next;
    return;
  }
  if (DOM_PROPERTIES.has(name) && !isSvg) {
    (dom as unknown as Record<string, boolean>)[name] = Boolean(value);
    return;
  }
  // ARIA states are enumerated strings, not boolean attributes: an empty
  // `aria-expanded=""` is NOT "true", so booleans are spelled out here rather
  // than trusting every call site to remember `String(open)`.
  if (typeof value === "boolean" && name.startsWith("aria-")) {
    const spelled = value ? "true" : "false";
    if (dom.getAttribute(name) !== spelled) dom.setAttribute(name, spelled);
    return;
  }
  if (value == null || value === false) {
    dom.removeAttribute(name);
    return;
  }
  const attr = value === true ? "" : String(value);
  if (dom.getAttribute(name) !== attr) dom.setAttribute(name, attr);
}
