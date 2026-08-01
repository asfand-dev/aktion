/**
 * Behavioural & styling wrappers.
 *
 * These components wrap an arbitrary child component to attach behaviour
 * (click, mouse, keyboard, focus, intersection) or styling (raw CSS class
 * / inline style) without forcing every primitive to grow another prop.
 *
 * Design notes:
 *
 * - Event wrappers (`OnClick`, `OnMouse`, `OnKeyboard`, `OnFocus`) render
 *   the child wrapped in a `<span class="rui-wrapper" style="display: contents">`.
 *   `display: contents` makes the wrapper transparent in the layout tree
 *   so the child renders exactly as if there were no wrapper, while
 *   events still bubble up to the wrapper element where the handlers live.
 *
 * - **Handlers are DOM properties (`node.onclick = fn`), never
 *   `addEventListener`.** The morph reconciler keeps the LIVE wrapper across
 *   re-renders and throws the freshly-rendered one away, copying only the
 *   `on*` properties over (see renderer/morph.ts). A listener added with
 *   `addEventListener` therefore either leaks one listener per render or —
 *   worse — sits on the discarded node, freezing the handler at the first
 *   render's props and loop variables ("clicking row 3 deletes row 1").
 *   The handful of behaviours that cannot be expressed as a property (a
 *   capture-phase or passive listener, `focusin`/`focusout`, an
 *   IntersectionObserver) are installed exactly ONCE, on the node the
 *   reconciler keeps, and read their callbacks out of a per-instance box
 *   that every render refreshes — see `useLiveBox` / `installOnce`.
 *
 * - `Css` is different — class / style cannot be inherited via
 *   `display: contents`. It therefore renders the child first and then
 *   merges the supplied `class` / `style` onto the rendered element (any
 *   `Element`, so an `<svg>` root is styled directly). Multiple children
 *   are styled individually, since the fragment that holds them is
 *   transparent and could not carry the styling itself.
 *
 * - `OnIntersect` is implemented with an `IntersectionObserver` registered
 *   for the wrapper, and disposed via `helpers.registerDisposer` when the
 *   component leaves the tree. The wrapper uses a real box (rather than
 *   `display: contents`) because a transparent wrapper is skipped by the
 *   intersection observer.
 *
 * Every wrapper accepts the child as the canonical positional argument
 * named `child` (with `children` as an alias) so authors can write either
 * `OnClick(Card("Hi"), { onClick: fn })` or
 * `OnClick({ child: Card(...), onClick: fn })`.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asBoolean, asNumber, asString, sanitiseHref } from "../utils.js";
import { deferToPaint } from "../floating.js";

/**
 * Render a child value into a single DOM node. Arrays of children produce
 * a wrapping span (since we can only return one Node). Strings render as
 * text nodes. Nullish values render as an empty text node so the
 * wrapper still has a stable child to attach to.
 *
 * The fragment span is `display: contents` — without it, wrapping two cards
 * in an event wrapper would collapse them into a single flex / grid item
 * (the wrapper above is transparent, so the fragment becomes the item).
 */
function renderChildAsNode(helpers: RenderHelpers, child: unknown): Node {
  if (child == null) return document.createTextNode("");
  if (Array.isArray(child)) {
    const wrap = el("span", { class: "rui-wrapper-fragment", style: "display: contents;" });
    for (const c of child) {
      if (c == null) continue;
      wrap.append(typeof c === "string" ? document.createTextNode(c) : helpers.renderNode(c));
    }
    return wrap;
  }
  if (typeof child === "string") return document.createTextNode(child);
  return helpers.renderNode(child);
}

/**
 * Universal props the renderer applies to whatever `render` returned — i.e. to
 * the wrapper — that need a box to mean anything.
 *
 * A `display: contents` wrapper generates no box, so `sx: { mb: "md" }` would
 * silently do nothing, and the `hidden` attribute's UA `display: none` loses to
 * the inline `display: contents`. When the author passed one of these the
 * wrapper takes a real box instead; `hidden` is resolved here so it cannot be
 * defeated by our own inline style.
 */
const BOXED_UNIVERSALS = ["sx", "style", "animate", "className", "class"] as const;

function wrapperStyle(universal: Record<string, unknown> | undefined, transparent: string): string {
  if (!universal) return transparent;
  if (universal.hidden === true) return "display: none;";
  const needsBox = BOXED_UNIVERSALS.some((key) => universal[key] != null);
  // `block` rather than `inline-block`: a block child keeps its width and gains
  // no baseline gap under it.
  return needsBox ? "display: block;" : transparent;
}

/**
 * Build a transparent wrapper `<span>` (display: contents) around a
 * rendered child node. The wrapper is the handler anchor — events fire
 * from the child but bubble to the wrapper where the wrapper's handler
 * runs. This keeps the visual tree identical to "no wrapper" while still
 * giving us a stable element to attach handlers to.
 */
function transparentWrapper(
  className: string,
  universal?: Record<string, unknown>,
  extraAttrs?: Record<string, string | null>,
): HTMLElement {
  return el("span", {
    class: `rui-wrapper ${className}`,
    style: wrapperStyle(universal, "display: contents;"),
    ...(extraAttrs ?? {}),
  });
}

/**
 * A per-instance box holding the CURRENT render's props.
 *
 * Anything that survives a re-render (a listener on the kept node, an
 * IntersectionObserver, a disposer) closes over this box instead of over
 * `props`, so it always sees the latest handlers. Handing back the box itself —
 * rather than reading the instance-state slot on every event — also keeps
 * working inside a disposer: the renderer prunes instance state for a dead
 * instance *before* it runs that instance's disposers.
 */
interface LiveBox {
  props: Record<string, unknown>;
}

function useLiveBox<T extends LiveBox>(helpers: RenderHelpers, key: string, initial: T): T {
  const box = helpers.useInstanceState<T>(key, initial).get();
  box.props = initial.props;
  return box;
}

/**
 * Resolve the element the reconciler actually keeps in the document for this
 * instance. The first render's wrapper is the node morph inserts, so it stays
 * the live node for the instance's whole life — every later render's wrapper is
 * discarded. Only if the remembered node never made it into the document (morph
 * reused a same-tag element from the previous tree) do we adopt the current one.
 */
function useLiveWrapper(helpers: RenderHelpers, wrapper: HTMLElement, key: string): HTMLElement {
  const slot = helpers.useInstanceState<HTMLElement>(key, wrapper);
  const remembered = slot.get();
  if (remembered === wrapper || remembered.isConnected) return remembered;
  slot.set(wrapper);
  return wrapper;
}

/**
 * Run `install(target)` once per live node. Re-running it for a NEW live node
 * covers a re-mount; listeners left on the old, detached node die with it.
 */
function installOnce(
  helpers: RenderHelpers,
  key: string,
  target: HTMLElement,
  install: (target: HTMLElement) => void,
): void {
  const slot = helpers.useInstanceState<HTMLElement | null>(key, null);
  if (slot.get() === target) return;
  slot.set(target);
  install(target);
}

/**
 * Elements that own their own activation. A click (or Enter / Space) landing on
 * one of these inside a wrapper belongs to it, not to the wrapper: firing both
 * would delete a row AND open it, or swallow the space bar the user is typing
 * into an input. Mirrors the guarded cell handler in utils.ts.
 */
const SELF_ACTING_CHILD = [
  "a", "button", "input", "select", "textarea", "label", "summary",
  "[contenteditable=\"true\"]",
  "[role=\"button\"]", "[role=\"link\"]", "[role=\"checkbox\"]", "[role=\"switch\"]",
  "[role=\"menuitem\"]", "[role=\"option\"]", "[role=\"tab\"]", "[role=\"textbox\"]",
].join(",");

/**
 * True when `event` originated inside a self-acting descendant of `wrapper`.
 * `wrapper` must be resolved from `event.currentTarget` — a render-time variable
 * is a discarded snapshot after the first reconcile.
 */
function fromSelfActingChild(wrapper: Element, event: Event): boolean {
  const target = event.target as Element | null;
  if (!target || target === wrapper || typeof target.closest !== "function") return false;
  const owner = target.closest(SELF_ACTING_CHILD);
  return owner != null && owner !== wrapper && wrapper.contains(owner);
}

/**
 * Strip characters that could break out of a `style="..."` attribute or
 * smuggle a `javascript:` URL into an inline declaration. Mirrors the
 * filter used by `Text` and `HTMLTag`. Returns the empty string when the
 * value is rejected so callers can drop the attribute.
 */
function sanitiseInlineStyle(input: unknown): string {
  const raw = asString(input).trim();
  if (!raw) return "";
  if (/[<>]/.test(raw)) return "";
  if (/\bexpression\s*\(|\bjavascript\s*:|\bbehavior\s*:|@import\b/i.test(raw)) return "";
  return raw;
}

/**
 * Accept a class string ("rounded shadow") or an array (["rounded", "shadow"])
 * and return the safe set of class tokens. Anything that does not match a
 * conservative CSS-identifier shape is dropped so authors cannot smuggle
 * attribute-breaking characters into the rendered class list.
 */
const CLASS_TOKEN_RE = /^[A-Za-z_][A-Za-z0-9_\-:/]*$/;

function sanitiseClassList(input: unknown): string[] {
  const tokens = Array.isArray(input)
    ? input.map((value) => asString(value))
    : asString(input).split(/\s+/);
  return tokens
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token.length <= 64 && CLASS_TOKEN_RE.test(token));
}

/* ------------------------------------------------------------------------ *
 * OnClick — single click / tap wrapper.
 *
 * Browsers fire a synthetic `click` event for taps on touch devices, so
 * one `click` handler covers both interaction models. The handler lives on
 * the wrapper element (transparent via `display: contents`) and skips clicks
 * that a self-acting child (Button / Link / form control, including a nested
 * OnClick wrapper) has already handled, so wrappers can be safely nested.
 * ------------------------------------------------------------------------ */
export const OnClick: ComponentSpec = {
  name: "OnClick",
  description:
    "Make any component clickable. Wraps the child in a transparent " +
    "span and dispatches `onClick(event)` when the user clicks or taps " +
    "it. Clicks that land on a self-acting child (a Button, Link, or form " +
    "control) are left to that child, so nesting is safe. Enter / Space " +
    "activate it too unless `keyboard: false`. Use to attach click behaviour " +
    "to components that do not expose an `action` / `onClick` prop (cards, " +
    "list rows, media tiles, custom layouts).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"], description: "Component (or array of components) to wrap" },
    { name: "onClick", type: "callable", required: true, aliases: ["action", "onclick"], description: "Callable invoked on click / tap. Receives the native MouseEvent." },
    { name: "disabled", type: "boolean", optional: true, description: "Skip firing the handler while truthy (also sets aria-disabled and leaves the tab order)" },
    { name: "stopPropagation", type: "boolean", optional: true, description: "Call event.stopPropagation() after invoking the handler (default false)" },
    { name: "role", type: "string", optional: true, description: "ARIA role for the wrapper (default \"button\"). Pass \"none\" when the wrapped element is a list row / table cell whose container owns the semantics." },
    { name: "keyboard", type: "boolean", optional: true, description: "Activate on Enter / Space and expose a tab stop (default true). Pass false when the child is already focusable — e.g. a card containing inputs." },
  ],
  render: (node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const keyboard = props.keyboard === undefined ? true : asBoolean(props.keyboard);
    const role = asString(props.role, keyboard ? "button" : "");
    const wrapper = transparentWrapper("rui-on-click", node.universal, {
      role: role || null,
      // Only claim a tab stop while we actually handle keys. A disabled wrapper
      // leaves the tab order but stays announced as a disabled control.
      tabindex: keyboard ? (disabled ? "-1" : "0") : null,
      "aria-disabled": disabled ? "true" : null,
      "data-disabled": disabled ? "true" : null,
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    // `cursor` is inherited, so it reaches the child even though a
    // `display: contents` wrapper generates no box of its own to hover.
    if (!disabled) wrapper.style.cursor = "pointer";
    const stopProp = asBoolean(props.stopPropagation);
    /** Returns true when the activation was ours to handle. */
    const fire = (event: Event): boolean => {
      if (disabled) return false;
      const self = (event.currentTarget ?? event.target) as Element;
      if (fromSelfActingChild(self, event)) return false;
      if (stopProp) event.stopPropagation();
      helpers.invoke(props.onClick, event);
      return true;
    };
    // Property handlers, so morph copies THIS render's closure onto the node it
    // keeps — the handler always sees the current `disabled` and loop variable.
    wrapper.onclick = (event) => { fire(event); };
    wrapper.onkeydown = keyboard
      ? (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          // preventDefault only once we know the key is ours, so Space still
          // reaches an input or textarea inside the wrapper.
          if (fire(event)) event.preventDefault();
        }
      : null;
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnMouse — every mouse / pointer event in one wrapper.
 *
 * Each event prop is optional. We only assign handlers for props the
 * caller actually supplied so unused events cost nothing.
 *
 * Aliases (`hover` → `mouseover`) match the names common in CSS / web
 * docs so the LLM can pick whichever name they remember.
 * ------------------------------------------------------------------------ */

/**
 * Mapping from the prop name authors use → the DOM handler PROPERTY the
 * wrapper assigns. Property handlers (not addEventListener) are what the morph
 * reconciler transfers onto the node it keeps. Every entry here appears in
 * morph.ts's EVENT_PROPS list, which is what makes the transfer happen.
 *
 * `scroll` is deliberately absent: it does not bubble, so a property handler on
 * a transparent wrapper could never fire. It is handled below with a
 * capture-phase listener.
 */
const MOUSE_EVENT_MAP: ReadonlyArray<{ prop: string; handler: string }> = [
  { prop: "enter", handler: "onmouseenter" },
  { prop: "leave", handler: "onmouseleave" },
  { prop: "hover", handler: "onmouseover" },
  { prop: "move", handler: "onmousemove" },
  { prop: "down", handler: "onmousedown" },
  { prop: "up", handler: "onmouseup" },
  { prop: "click", handler: "onclick" },
  { prop: "doubleClick", handler: "ondblclick" },
  { prop: "contextMenu", handler: "oncontextmenu" },
  { prop: "wheel", handler: "onwheel" },
  { prop: "pointerDown", handler: "onpointerdown" },
  { prop: "pointerMove", handler: "onpointermove" },
  { prop: "pointerUp", handler: "onpointerup" },
  { prop: "drag", handler: "ondrag" },
  { prop: "drop", handler: "ondrop" },
  { prop: "dragStart", handler: "ondragstart" },
  { prop: "dragEnd", handler: "ondragend" },
  { prop: "dragEnter", handler: "ondragenter" },
  { prop: "dragLeave", handler: "ondragleave" },
  { prop: "dragOver", handler: "ondragover" },
];

interface MouseBox extends LiveBox {
  /** Whether `scroll` has ever been supplied, so the capture listener installs. */
  wantsScroll: boolean;
}

export const OnMouse: ComponentSpec = {
  name: "OnMouse",
  description:
    "Attach any combination of mouse / pointer / drag listeners to a " +
    "component. Pass only the props you need — unused events install no " +
    "handler so the wrapper is essentially free. Each handler receives " +
    "the native MouseEvent / PointerEvent / DragEvent / WheelEvent. Use for " +
    "hover tracking, custom drag-and-drop, context menus, scroll-aware UIs.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"], description: "Component to wrap" },
    { name: "enter", type: "callable", optional: true, description: "Fired when the pointer enters the element (mouseenter)" },
    { name: "leave", type: "callable", optional: true, description: "Fired when the pointer leaves the element (mouseleave)" },
    { name: "hover", type: "callable", optional: true, description: "Fired on every mouseover inside the element" },
    { name: "move", type: "callable", optional: true, description: "Fired on every mousemove inside the element" },
    { name: "down", type: "callable", optional: true, description: "Fired on mousedown" },
    { name: "up", type: "callable", optional: true, description: "Fired on mouseup" },
    { name: "click", type: "callable", optional: true, description: "Fired on click / tap" },
    { name: "doubleClick", type: "callable", optional: true, description: "Fired on double-click" },
    { name: "contextMenu", type: "callable", optional: true, description: "Fired on right-click (contextmenu)" },
    { name: "scroll", type: "callable", optional: true, description: "Fired when an inner element scrolls (observed on the capture phase, since scroll does not bubble)" },
    { name: "wheel", type: "callable", optional: true, description: "Fired on mouse-wheel / trackpad scroll. Not passive, so `event.preventDefault()` works (custom zoom)." },
    { name: "pointerDown", type: "callable", optional: true, description: "Fired on pointerdown — use instead of `down` for touch / pen drags (gives `pointerId`, pressure, setPointerCapture)" },
    { name: "pointerMove", type: "callable", optional: true, description: "Fired on pointermove" },
    { name: "pointerUp", type: "callable", optional: true, description: "Fired on pointerup" },
    { name: "drag", type: "callable", optional: true, description: "Fired while the element is being dragged" },
    { name: "drop", type: "callable", optional: true, description: "Fired when something is dropped onto the element" },
    { name: "dragStart", type: "callable", optional: true, description: "Fired when a drag begins" },
    { name: "dragEnd", type: "callable", optional: true, description: "Fired when a drag ends" },
    { name: "dragEnter", type: "callable", optional: true, description: "Fired when a drag enters the element" },
    { name: "dragLeave", type: "callable", optional: true, description: "Fired when a drag leaves the element" },
    { name: "dragOver", type: "callable", optional: true, description: "Fired while something is dragged over the element. Call `event.preventDefault()` to make the element a valid drop target." },
    { name: "draggable", type: "boolean", optional: true, description: "Make the wrapper itself draggable (sets `draggable=\"true\"`)" },
    { name: "passiveScroll", type: "boolean", optional: true, description: "Register the `scroll` listener as passive (default true, for scroll performance). Read on the first render." },
  ],
  render: (node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-mouse", node.universal, {
      draggable: asBoolean(props.draggable) ? "true" : null,
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    for (const { prop, handler } of MOUSE_EVENT_MAP) {
      const callback = props[prop];
      if (callback == null) continue;
      (wrapper as unknown as Record<string, unknown>)[handler] = (event: Event) => {
        helpers.invoke(callback, event);
      };
    }
    // `scroll` does not bubble and a transparent wrapper cannot scroll itself,
    // so the only way to observe a descendant scrolling is the capture phase —
    // which only addEventListener can express. Install it once, on the node the
    // reconciler keeps, reading the callback from the live box so it never
    // freezes at the installing render's closure.
    const box = useLiveBox<MouseBox>(helpers, "rui-on-mouse", { props, wantsScroll: false });
    if (props.scroll != null) box.wantsScroll = true;
    if (box.wantsScroll) {
      const passive = props.passiveScroll === undefined ? true : asBoolean(props.passiveScroll);
      const live = useLiveWrapper(helpers, wrapper, "rui-on-mouse-node");
      installOnce(helpers, "rui-on-mouse-scroll", live, (target) => {
        target.addEventListener("scroll", (event) => {
          helpers.invoke(box.props.scroll, event);
        }, { capture: true, passive });
      });
    }
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnKeyboard — keyboard event wrapper.
 *
 * The wrapper gets `tabindex="0"` so it can receive keyboard focus by
 * default; pass `focusable=false` to opt out (useful when the child is
 * already focusable like an input). `global: true` moves the listeners to
 * `window` so the shortcut fires wherever focus is.
 * ------------------------------------------------------------------------ */
const KEYBOARD_EVENT_MAP: ReadonlyArray<{ prop: string; event: string; handler: string }> = [
  { prop: "onKeyDown", event: "keydown", handler: "onkeydown" },
  { prop: "onKeyUp", event: "keyup", handler: "onkeyup" },
  { prop: "onKeyPress", event: "keypress", handler: "onkeypress" },
];

interface KeyboardBox extends LiveBox {
  /** Removes the window listeners installed for `global: true`. */
  detachGlobal: (() => void) | null;
  /** The unmount disposer is registered exactly once per instance. */
  disposerInstalled: boolean;
}

export const OnKeyboard: ComponentSpec = {
  name: "OnKeyboard",
  description:
    "Attach keyboard listeners to a component. Pass any combination of " +
    "`onKeyDown`, `onKeyUp`, and `onKeyPress`; each handler receives the " +
    "native KeyboardEvent. Use for navigation and custom focusable widgets. " +
    "The wrapper is focusable by default (tabindex=\"0\") so it can be reached " +
    "via Tab; pass `focusable=false` when the child is already focusable. " +
    "For an app-wide shortcut (Cmd+K, `?`) pass `global: true`, which listens " +
    "on the window instead so the keys fire wherever focus is.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onKeyDown", type: "callable", optional: true, aliases: ["onkeydown"], description: "Fired on keydown" },
    { name: "onKeyUp", type: "callable", optional: true, aliases: ["onkeyup"], description: "Fired on keyup" },
    { name: "onKeyPress", type: "callable", optional: true, aliases: ["onkeypress"], description: "Fired on keypress" },
    { name: "focusable", type: "boolean", optional: true, description: "Make the wrapper focusable via Tab (default true, or false when `global`)" },
    { name: "global", type: "boolean", optional: true, description: "Listen on the window rather than the wrapper, so the shortcut fires regardless of focus (command palettes, help overlays). Removed when the component leaves the tree." },
  ],
  render: (node, props, helpers) => {
    const isGlobal = asBoolean(props.global);
    // A global shortcut needs no tab stop of its own.
    const focusable = props.focusable === undefined ? !isGlobal : asBoolean(props.focusable);
    const wrapper = transparentWrapper(
      "rui-on-keyboard",
      node.universal,
      focusable ? { tabindex: "0" } : {},
    );
    wrapper.append(renderChildAsNode(helpers, props.child));
    const box = useLiveBox<KeyboardBox>(helpers, "rui-on-keyboard", {
      props, detachGlobal: null, disposerInstalled: false,
    });
    if (!isGlobal) {
      // Property handlers: morph transfers them onto the kept node, so an arrow
      // key still reads the CURRENT cursor rather than the first render's.
      for (const { prop, handler } of KEYBOARD_EVENT_MAP) {
        const callback = props[prop];
        if (callback == null) continue;
        (wrapper as unknown as Record<string, unknown>)[handler] = (event: Event) => {
          helpers.invoke(callback, event);
        };
      }
    }
    if (isGlobal && box.detachGlobal == null && typeof window !== "undefined") {
      // `window` outlives every re-render, so bind once and read the handlers
      // from the live box. The disposer is keyed to this instance so the
      // shortcut dies with the component that declared it.
      const bound = KEYBOARD_EVENT_MAP.map(({ prop, event }) => {
        const listener = (ev: Event): void => { helpers.invoke(box.props[prop], ev); };
        window.addEventListener(event, listener);
        return { event, listener };
      });
      box.detachGlobal = () => {
        for (const { event, listener } of bound) window.removeEventListener(event, listener);
      };
      // Registered once per instance. Re-registering a NEW function under the
      // same key would run the previous cleanup immediately — which reads
      // `box.detachGlobal` and would therefore tear down the listeners we just
      // installed, so toggling `global` off and back on would kill the shortcut.
      if (!box.disposerInstalled) {
        box.disposerInstalled = true;
        helpers.registerDisposer(() => {
          box.detachGlobal?.();
          box.detachGlobal = null;
        }, "rui-on-keyboard-global");
      }
    } else if (!isGlobal && box.detachGlobal != null) {
      box.detachGlobal();
      box.detachGlobal = null;
    }
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnFocus — focus / blur wrapper.
 * ------------------------------------------------------------------------ */
export const OnFocus: ComponentSpec = {
  name: "OnFocus",
  description:
    "Attach focus / blur listeners to a component. Use to track input " +
    "focus rings, custom focus indicators, or autosave-on-blur flows. " +
    "Listens for the bubbling `focusin` / `focusout` events, so focus " +
    "entering or leaving any descendant is observed.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Fired when focus enters the element or any descendant" },
    { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Fired when focus leaves the element and all descendants" },
  ],
  render: (node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-focus", node.universal);
    wrapper.append(renderChildAsNode(helpers, props.child));
    const box = useLiveBox(helpers, "rui-on-focus", { props });
    // focusin / focusout bubble (unlike focus / blur), so a single wrapper
    // listener observes focus changes anywhere in the subtree. Neither has a
    // transferable `on*` property, so the listeners are installed once — on the
    // node morph keeps — and read the handlers from the live box. Bound
    // unconditionally: a handler first supplied on a later render still fires.
    const live = useLiveWrapper(helpers, wrapper, "rui-on-focus-node");
    installOnce(helpers, "rui-on-focus-listeners", live, (target) => {
      target.addEventListener("focusin", (event) => { helpers.invoke(box.props.onFocus, event); });
      target.addEventListener("focusout", (event) => { helpers.invoke(box.props.onBlur, event); });
    });
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnIntersect — IntersectionObserver wrapper.
 *
 * The wrapper element is the observed target. `onEnter` fires once when
 * the element starts intersecting the viewport (or the supplied root);
 * `onLeave` fires when it stops. `onChange` fires for every state
 * transition with `{visible: boolean, ratio: number}`. Use for lazy-load,
 * infinite-scroll sentinels, impression tracking, and reveal animations.
 *
 * The observer is created ONCE per live node and reads its callbacks from the
 * live box. Creating one per render (and disposing the previous one under the
 * same key) would leave the only surviving observer watching the freshly
 * rendered span that morph discards — so the sentinel would fire exactly once
 * and then die.
 * ------------------------------------------------------------------------ */

/**
 * `rootMargin` is handed straight to the engine, which throws a `SyntaxError`
 * for anything that is not 1–4 px / % lengths ("64" instead of "64px" is an
 * easy slip). A throw inside render replaces the whole component with an error
 * stub, so reject what we are unsure of and observe with the default margin.
 */
const ROOT_MARGIN_TOKEN = /^[+-]?(?:\d+|\d*\.\d+)(?:px|%)$|^[+-]?0$/;

function sanitiseRootMargin(raw: unknown): string {
  const value = asString(raw).trim();
  if (!value) return "";
  const tokens = value.split(/\s+/);
  if (tokens.length > 4) return "";
  return tokens.every((token) => ROOT_MARGIN_TOKEN.test(token)) ? value : "";
}

/**
 * Resolve a `root` selector against the tree the wrapper actually lives in —
 * the shadow root, not `document`, since Aktion renders inside one. The nearest
 * matching ancestor wins (a scroll container almost always is one). Returns null
 * when nothing matches, which is the observer's viewport default.
 */
function resolveObserverRoot(target: HTMLElement, selector: string): Element | null {
  try {
    const ancestor = target.closest(selector);
    if (ancestor && ancestor !== target) return ancestor;
    const root = target.getRootNode();
    if (root instanceof Document || root instanceof ShadowRoot) {
      return root.querySelector(selector);
    }
  } catch {
    // An invalid selector must not take the wrapped content down with it.
  }
  return null;
}

interface IntersectBox extends LiveBox {
  observer: IntersectionObserver | null;
  node: HTMLElement | null;
  optionsKey: string;
  /** Enter / leave transition tracking, kept across renders. */
  lastVisible: boolean | null;
}

export const OnIntersect: ComponentSpec = {
  name: "OnIntersect",
  description:
    "Observe whether a component is visible in the viewport (or a scroll " +
    "container passed as `root`) using IntersectionObserver. Fires `onEnter` " +
    "the first time the wrapped element becomes visible, `onLeave` when it " +
    "leaves, and `onChange({visible, ratio})` for every transition. Use for " +
    "lazy-load sentinels, infinite-scroll triggers, impression analytics, " +
    "and reveal-on-scroll animations. Set `disabled: true` once there is " +
    "nothing left to load.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onEnter", type: "callable", optional: true, description: "Fired when the element enters the viewport" },
    { name: "onLeave", type: "callable", optional: true, description: "Fired when the element leaves the viewport" },
    { name: "onChange", type: "callable", optional: true, description: "Fired with `{visible, ratio}` on every transition" },
    { name: "threshold", type: "number", optional: true, description: "Visible-ratio threshold 0–1 (default 0.05)" },
    { name: "rootMargin", type: "string", optional: true, description: "Root margin as 1–4 px / % lengths (e.g. \"0px 0px -64px 0px\"). Unit-less values are ignored." },
    { name: "root", type: "string", optional: true, description: "CSS selector for the scroll container to observe inside (e.g. \".rui-scroll-area\"). Defaults to the viewport." },
    { name: "once", type: "boolean", optional: true, description: "Disconnect after the first entry (default false)" },
    { name: "disabled", type: "boolean", optional: true, description: "Stop firing the callbacks while truthy — use it when the last page of an infinite list has loaded" },
  ],
  render: (node, props, helpers) => {
    // A real box, not `display: contents`: the observer skips boxless elements.
    // `block` (not `inline-block`) so a block child keeps its width and gains no
    // baseline gap; override with `sx: { display: "inline-block" }`.
    const wrapper = el("span", {
      class: "rui-wrapper rui-on-intersect",
      style: wrapperStyle(node.universal, "display: block;"),
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    // IntersectionObserver only exists in browser environments; bail
    // gracefully in SSR / test environments.
    const ObserverCtor: typeof IntersectionObserver | undefined =
      typeof IntersectionObserver !== "undefined" ? IntersectionObserver : undefined;
    if (!ObserverCtor) return wrapper;
    const box = useLiveBox<IntersectBox>(helpers, "rui-on-intersect", {
      props, observer: null, node: null, optionsKey: "", lastVisible: null,
    });
    const rawThreshold = asNumber(props.threshold, 0.05);
    const threshold = Number.isFinite(rawThreshold)
      ? Math.max(0, Math.min(1, rawThreshold))
      : 0.05;
    const rootMargin = sanitiseRootMargin(props.rootMargin);
    const rootSelector = asString(props.root).trim();
    const optionsKey = `${threshold}|${rootMargin}|${rootSelector}`;

    const install = (target: HTMLElement): void => {
      if (box.observer && box.node === target && box.optionsKey === optionsKey) return;
      box.observer?.disconnect();
      box.observer = null;
      const root = rootSelector ? resolveObserverRoot(target, rootSelector) : null;
      let observer: IntersectionObserver;
      try {
        observer = new ObserverCtor((entries) => {
          const current = box.props;
          if (asBoolean(current.disabled)) return;
          for (const entry of entries) {
            const visible = entry.isIntersecting;
            if (visible !== box.lastVisible) {
              if (visible && current.onEnter != null) helpers.invoke(current.onEnter, entry);
              if (!visible && box.lastVisible === true && current.onLeave != null) {
                helpers.invoke(current.onLeave, entry);
              }
              box.lastVisible = visible;
            }
            if (current.onChange != null) {
              helpers.invoke(current.onChange, { visible, ratio: entry.intersectionRatio });
            }
            if (asBoolean(current.once) && visible) {
              box.observer?.disconnect();
              return;
            }
          }
        }, {
          threshold,
          ...(rootMargin ? { rootMargin } : {}),
          ...(root ? { root } : {}),
        });
      } catch {
        // An option the engine rejects costs us the observer, not the content.
        return;
      }
      observer.observe(target);
      box.observer = observer;
      box.node = target;
      box.optionsKey = optionsKey;
      // Keyed: re-creating the observer (options changed, or the live node was
      // replaced) replaces the previous disposer instead of stacking one per
      // render. We disconnect the old observer ourselves above, so the
      // immediate dispose of the prior entry is a no-op.
      helpers.registerDisposer(() => observer.disconnect(), "rui-onintersect-io");
    };

    const live = useLiveWrapper(helpers, wrapper, "rui-on-intersect-node");
    if (rootSelector && !live.isConnected) {
      // Resolving a `root` selector needs the wrapper to be in the document.
      deferToPaint(() => { if (live.isConnected) install(live); });
    } else {
      install(live);
    }
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnMount — lifecycle / DOM-ref wrapper.
 *
 * The Aktion-native way to get a reference to a rendered DOM node and run
 * imperative code against it. `onMount(node)` fires once, on a microtask after
 * the wrapped child is attached to the DOM; `onUnmount(node)` fires when the
 * component leaves the tree. This is the escape hatch for the things a
 * declarative tree can't express on its own: measuring an element,
 * imperatively focusing it, or handing it to a third-party library (a chart,
 * a map, a rich-text engine). Pair it with `$ref(...)` to stash the node:
 *
 *   function Chart() {
 *     const box = $ref(null)
 *     return OnMount(Box({ height: "240px" }), {
 *       onMount: node => { box.current = node; drawChart(node) },
 *       onUnmount: () => destroyChart(box.current)
 *     })
 *   }
 *
 * The wrapper is transparent (`display: contents`) so layout is unchanged;
 * `node` is the rendered child element itself. Pass `deps` to re-run the pair
 * when the data the widget was built from changes.
 * ------------------------------------------------------------------------ */

interface MountBox extends LiveBox {
  /** The node last handed to `onMount`. Kept after unmount so `deps` can re-run. */
  live: Element | null;
  mounted: boolean;
  depsKey: string | null;
  /** Stable disposer identity — see the registerDisposer call below. */
  disposer: (() => void) | null;
}

/** Stable key for `deps` so a change can be detected without holding values. */
function serialiseDeps(deps: unknown): string | null {
  if (deps == null) return null;
  const list = Array.isArray(deps) ? deps : [deps];
  return list
    .map((value) => {
      if (value == null) return String(value);
      const kind = typeof value;
      if (kind === "object" || kind === "function") {
        try {
          return JSON.stringify(value) ?? "[unserialisable]";
        } catch {
          return "[unserialisable]";
        }
      }
      return `${kind}:${String(value)}`;
    })
    .join("|");
}

const runSoon = (fn: () => void): void => {
  if (typeof queueMicrotask === "function") queueMicrotask(fn);
  else void Promise.resolve().then(fn);
};

/**
 * Fire `onUnmount` for whatever node is currently mounted, reading the callback
 * out of the live box so a teardown first supplied on a later render still runs.
 * Deferred to a microtask so a state write inside the callback lands after the
 * reconcile pass instead of tripping the render guard.
 */
function runUnmount(box: MountBox, helpers: RenderHelpers): void {
  if (!box.mounted) return;
  box.mounted = false;
  const target = box.live;
  const callback = box.props.onUnmount;
  if (target == null || callback == null) return;
  runSoon(() => helpers.invoke(callback, target));
}

export const OnMount: ComponentSpec = {
  name: "OnMount",
  description:
    "Run imperative code against the wrapped component's rendered DOM node. " +
    "`onMount(node)` fires once, on a microtask after the child is attached " +
    "to the DOM — the Aktion way to get a DOM ref (measure an element, focus " +
    "it, or hand it to an imperative library such as a chart / map / editor). " +
    "`onUnmount(node)` fires when the component leaves the tree. Pass `deps` " +
    "to tear down and re-run the pair when the values in it change. Pair with " +
    "`$ref(...)` to stash the node across renders.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onMount", type: "callable", optional: true, description: "`(node) => void` — fired once after the wrapped element is attached." },
    { name: "onUnmount", type: "callable", optional: true, description: "`(node) => void` — fired when the wrapped element leaves the tree." },
    { name: "deps", type: "any[]", optional: true, description: "Re-run `onUnmount` + `onMount` whenever a value in this list changes (e.g. `deps: [$docId]` to rebind an editor to another document)." },
  ],
  render: (node, props, helpers) => {
    const wrapper = el("span", {
      class: "rui-wrapper rui-on-mount",
      style: wrapperStyle(node.universal, "display: contents;"),
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    const box = useLiveBox<MountBox>(helpers, "rui-on-mount", {
      props, live: null, mounted: false, depsKey: null, disposer: null,
    });
    const depsKey = serialiseDeps(props.deps);
    // `deps` changed: tear the previous instance down before re-mounting, so an
    // imperative widget can rebind to the new data.
    if (box.mounted && depsKey !== box.depsKey) runUnmount(box, helpers);
    if (!box.mounted) {
      box.depsKey = depsKey;
      const fire = (): void => {
        if (box.mounted) return;
        const fresh = wrapper.firstElementChild ?? wrapper;
        // Hand over a node that is actually IN the document. Morph may have kept
        // a live same-tag element and discarded this wrapper, and measuring or
        // drawing into a detached node silently produces nothing. Falling back
        // to the node we mounted before covers a `deps` re-run, where this
        // render's tree is the discarded one; if neither is connected we leave
        // `mounted` false so the next render tries again.
        const target = fresh.isConnected
          ? fresh
          : (box.live?.isConnected ? box.live : null);
        if (!target) return;
        box.mounted = true;
        box.live = target;
        helpers.invoke(box.props.onMount, target);
      };
      runSoon(fire);
    }
    // Registered on every render but with a STABLE identity: re-registering a
    // different function under the same key runs the previous cleanup
    // immediately, which would fire `onUnmount` on every re-render.
    if (!box.disposer) box.disposer = () => { runUnmount(box, helpers); };
    helpers.registerDisposer(box.disposer, "rui-on-mount-unmount");
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * Link — anchor that wraps either a label string or any component.
 *
 * Aktion 0.5 supports two link shapes via the same `Link` call:
 *
 *   Link("Docs", "/docs")                                  // legacy: label + href
 *   Link("Docs", { to: "/docs" })                          // new: router-aware
 *   Link(IconButton("home"), { to: "/" })                  // new: wrap a component
 *   Link(Card("Read more"), { href: "https://x.com", external: true })
 *
 * If `to` is provided, the click navigates via the runtime router. If
 * only `href` is provided, the anchor behaves like a plain `<a href>`.
 * If both are given, `to` wins. External links open in a new tab with
 * `noopener noreferrer`.
 * ------------------------------------------------------------------------ */

/**
 * Render the positional argument — accepts either a string label (rendered
 * as the anchor's text) or any component / array of components (rendered
 * as children of the anchor). Identical semantics to `renderChildAsNode`
 * but returns an array so callers can `anchor.append(...nodes)`.
 */
function renderLinkChildren(helpers: RenderHelpers, child: unknown): Node[] {
  if (child == null) return [];
  if (typeof child === "string") return [document.createTextNode(child)];
  if (Array.isArray(child)) {
    return child
      .filter((c) => c != null)
      .map((c) => (typeof c === "string" ? document.createTextNode(c) : helpers.renderNode(c)));
  }
  return [helpers.renderNode(child)];
}

/** Anything with a scheme (or protocol-relative) is not a router path. */
const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\//;

/** Filename shape safe to echo back into a `download` attribute. */
const DOWNLOAD_NAME_RE = /^[A-Za-z0-9._ ()-]{1,128}$/;

/**
 * Build the address-bar URL for a router path.
 *
 * The router defaults to hash mode, so emitting a bare `/docs` produces a URL
 * the server has to serve — a 404 in a hash-routed app. Middle-click,
 * cmd-click, "copy link address" and `external: true` all use the href rather
 * than the click handler, so it has to be the real thing. Mirrors NavLink.
 */
function routerHref(helpers: RenderHelpers, to: string): string {
  if (to.startsWith("#")) return to;
  const path = to.startsWith("/") ? to : `/${to}`;
  const mode = typeof helpers.router?.getMode === "function" ? helpers.router.getMode() : "hash";
  return mode === "history" ? path : `#${path}`;
}

export const Link: ComponentSpec = {
  name: "Link",
  description:
    "Anchor link. Accepts either a plain string label or a wrapped " +
    "component as its positional child. Pass `to` for client-side " +
    "router navigation (no page reload) or `href` for a regular " +
    "anchor. `external: true` opens the link in a new tab with " +
    "`rel=\"noopener noreferrer\"`. `disabled: true` renders a non-navigating " +
    "link (pagination edges, gated steps). Use to make any component " +
    "clickable as a link — cards, icons, badges, list rows.",
  props: [
    { name: "label", type: "string | Node", positional: true, required: true, aliases: ["child", "children"], description: "Visible text OR a wrapped component" },
    { name: "to", type: "string", optional: true, description: "Router path (preferred). Navigates via the runtime router on click." },
    { name: "href", type: "string", optional: true, description: "Standard anchor href. Used when `to` is omitted." },
    { name: "external", type: "boolean", optional: true, description: "Open in a new tab (`target=\"_blank\"`, `rel=\"noopener noreferrer\"`)" },
    { name: "variant", aliases: ["tone"], type: "string", optional: true, enum: ["default", "subtle"] },
    { name: "disabled", type: "boolean", optional: true, description: "Render as a non-navigating link: no href, out of the tab order, announced as disabled" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick"], description: "Ran before navigation (analytics, closing a drawer). Call `event.preventDefault()` inside it to cancel the navigation." },
    { name: "download", type: "boolean | string", optional: true, description: "Download the target instead of navigating. Pass a string to suggest a filename." },
  ],
  render: (_node, props, helpers) => {
    const to = asString(props.to).trim();
    const external = asBoolean(props.external);
    const disabled = asBoolean(props.disabled);
    // A router path is anything that is not an absolute URL; those stay plain
    // anchors (mailto:, tel:, https://…) and are sanitised as before.
    const isRoute = to !== "" && !ABSOLUTE_URL_RE.test(to);
    const safeHref = disabled
      ? null
      : isRoute
        ? routerHref(helpers, to)
        : sanitiseHref(to || props.href, "#");
    // `download: true` (the DSL may hand it over stringified) means "download
    // under the server's filename"; a string is a filename suggestion, filtered
    // so it cannot break out of the attribute.
    const download = props.download;
    const downloadName = typeof download === "string" ? download.trim() : "";
    const downloadAttr = download === true || downloadName === "true"
      ? ""
      : (downloadName !== "" && downloadName !== "false" && DOWNLOAD_NAME_RE.test(downloadName)
          ? downloadName
          : null);
    const variant = asString(props.variant, "default");
    const anchor = el("a", {
      class: "rui-link",
      "data-variant": variant,
      href: safeHref,
      // A disabled link keeps its place in the layout but is not activatable:
      // no href (so Enter does nothing), no tab stop, announced as disabled.
      role: disabled ? "link" : null,
      "aria-disabled": disabled ? "true" : null,
      "data-disabled": disabled ? "true" : null,
      tabindex: disabled ? "-1" : null,
      target: external && !disabled ? "_blank" : null,
      rel: external && !disabled ? "noopener noreferrer" : null,
      download: downloadAttr,
    });
    for (const node of renderLinkChildren(helpers, props.label)) anchor.append(node);
    // WCAG 3.2.5 — say that activating this link moves the user to a new tab.
    if (external && !disabled) {
      anchor.append(el("span", { class: "rui-visually-hidden" }, [" (opens in new tab)"]));
    }
    // Property handler, exactly as NavLink does: morph copies it onto the kept
    // anchor, so the destination always matches the rendered `href` instead of
    // freezing at the first render's `to`.
    anchor.onclick = (event) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      helpers.invoke(props.onClick, event);
      // Router navigation for `to` only — `href` keeps native behaviour (full
      // reload, mailto:, tel:, external URL), and so does `download`.
      if (!isRoute || external || downloadAttr != null) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      helpers.router.navigate(to);
    };
    return anchor;
  },
};

/* ------------------------------------------------------------------------ *
 * Css — class / style wrapper.
 *
 * Merges the supplied `class` tokens and `style` declarations onto the
 * rendered child element. This is the "escape hatch for layout / styling"
 * — prefer the dedicated component props (Box padding, Stack gap, etc.)
 * whenever they cover the case.
 *
 * Unlike the event wrappers, Css MUST forward styling onto the child:
 * `display: contents` does not transmit class / style to children, so
 * wrapping in a transparent span would render the styling invisible. Several
 * children are therefore styled individually (the fragment that holds them is
 * transparent, so it could not carry the styling itself), and a plain text
 * child gets a real `<span>` box to attach the styling to.
 * ------------------------------------------------------------------------ */

/** Merge the sanitised class / style props onto one rendered element. */
function applyCss(target: Element, classes: readonly string[], style: string): void {
  for (const token of classes) target.classList.add(token);
  if (!style) return;
  const existing = target.getAttribute("style");
  target.setAttribute("style", existing ? `${existing};${style}` : style);
}

export const Css: ComponentSpec = {
  name: "Css",
  description:
    "Apply raw CSS class names and / or an inline style string to a " +
    "wrapped component. The styling is merged onto the rendered child's " +
    "DOM element — no extra wrapper element is added when the child renders " +
    "as one element (including an `Svg` root). Several children are each " +
    "styled individually; a plain-text child gets a wrapping span to carry " +
    "the styling. Reach for `Css` only when the component's own props cannot " +
    "express the styling (use `Box`/`Stack`/`Grid` props for layout, `Theme` " +
    "for tokens, `Styles` + selector classes for sweeping changes).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "style", type: "string", optional: true, description: "Inline CSS declarations (e.g. \"padding: 16px; background: #eef;\")" },
    { name: "class", type: "string | string[]", optional: true, aliases: ["className", "classes"], description: "Class name (space-separated string or array). Tokens must match `[A-Za-z_][A-Za-z0-9_-:/]*`." },
  ],
  render: (_node, props, helpers) => {
    const safeClasses = sanitiseClassList(props.class);
    const safeStyle = sanitiseInlineStyle(props.style);
    // Several children: style each one. The fragment they live in is
    // `display: contents` so the layout is identical to no wrapper at all —
    // which also means the fragment itself could not carry the styling.
    if (Array.isArray(props.child)) {
      const fragment = renderChildAsNode(helpers, props.child) as HTMLElement;
      for (const child of Array.from(fragment.children)) applyCss(child, safeClasses, safeStyle);
      return fragment;
    }
    const rendered = renderChildAsNode(helpers, props.child);
    // Any Element can carry the styling — including an `<svg>` root, which is an
    // SVGElement rather than an HTMLElement. Only a non-element (a text node)
    // needs a real span to attach it to.
    if (rendered instanceof Element) {
      applyCss(rendered, safeClasses, safeStyle);
      return rendered;
    }
    const span = el("span", { class: "rui-css" });
    span.append(rendered);
    applyCss(span, safeClasses, safeStyle);
    return span;
  },
};

/* ------------------------------------------------------------------------ *
 * Shared helpers re-exported for sibling input components.
 *
 * Inputs (Input, Checkbox, Switch, etc.) accept an `onChange(value)` prop
 * that fires with the freshly-read value. We expose a tiny helper so the
 * dozen input renderers can hook into the same event in one line:
 *
 *   attachOnChange(input, props.onChange, helpers, {
 *     event: "change",
 *     getValue: (el) => (el as HTMLInputElement).value,
 *   });
 *
 * The helper uses `addEventListener` so it composes cleanly with the
 * property-based `oninput` / `onchange` set by `bindState` — both run
 * on the same DOM event.
 * ------------------------------------------------------------------------ */
export function attachOnChange(
  element: HTMLElement,
  callback: unknown,
  helpers: RenderHelpers,
  options: { event?: string; getValue: (el: HTMLElement) => unknown },
): void {
  if (callback === null || callback === undefined) return;
  const eventName = options.event ?? "change";
  element.addEventListener(eventName, () => {
    helpers.invoke(callback, options.getValue(element));
  });
}
