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
 *   events still bubble up to the wrapper element where listeners live.
 *
 * - `Css` is different — class / style cannot be inherited via
 *   `display: contents`. It therefore renders the child first and then
 *   merges the supplied `class` / `style` onto the rendered HTMLElement.
 *   When the child is a non-element node (text, document fragment) it
 *   falls back to a real wrapper `<span>` so the styling has somewhere
 *   to attach.
 *
 * - `OnIntersect` is implemented with a `IntersectionObserver` registered
 *   for the wrapper, and disposed via `helpers.registerDisposer` when the
 *   component leaves the tree. The wrapper uses normal `inline-block`
 *   (rather than `display: contents`) because a transparent wrapper is
 *   skipped by the intersection observer.
 *
 * Every wrapper accepts the child as the canonical positional argument
 * named `child` (with `children` as an alias) so authors can write either
 * `OnClick(Card("Hi"), { onClick: fn })` or
 * `OnClick({ child: Card(...), onClick: fn })`.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asBoolean, asNumber, asString, sanitiseHref } from "../utils.js";

/**
 * Render a child value into a single DOM node. Arrays of children produce
 * a wrapping span (since we can only return one Node). Strings render as
 * text nodes. Nullish values render as an empty text node so the
 * wrapper still has a stable child to attach to.
 */
function renderChildAsNode(helpers: RenderHelpers, child: unknown): Node {
  if (child == null) return document.createTextNode("");
  if (Array.isArray(child)) {
    const wrap = el("span", { class: "rui-wrapper-fragment" });
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
 * Build a transparent wrapper `<span>` (display: contents) around a
 * rendered child node. The wrapper is the listener anchor — events fire
 * from the child but bubble to the wrapper where the wrapper's listener
 * runs. This keeps the visual tree identical to "no wrapper" while still
 * giving us a stable element to attach handlers to.
 */
function transparentWrapper(className: string, extraAttrs?: Record<string, string | null>): HTMLElement {
  return el("span", {
    class: `rui-wrapper ${className}`,
    style: "display: contents;",
    ...(extraAttrs ?? {}),
  });
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
 * registering a single `click` listener covers both interaction models.
 * We attach to the wrapper element (transparent via `display: contents`)
 * and stop event propagation at the wrapper so OnClick wrappers can be
 * safely nested without one outer wrapper swallowing inner clicks.
 * ------------------------------------------------------------------------ */
export const OnClick: ComponentSpec = {
  name: "OnClick",
  description:
    "Make any component clickable. Wraps the child in a transparent " +
    "span and dispatches `onClick(event)` when the user clicks or taps " +
    "anywhere inside it. Use to attach click behaviour to components " +
    "that do not expose an `action` / `onClick` prop (cards, list rows, " +
    "media tiles, custom layouts).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"], description: "Component (or array of components) to wrap" },
    { name: "onClick", type: "callable", required: true, aliases: ["action", "onclick"], description: "Callable invoked on click / tap. Receives the native MouseEvent." },
    { name: "disabled", type: "boolean", optional: true, description: "Skip firing the handler while truthy" },
    { name: "stopPropagation", type: "boolean", optional: true, description: "Call event.stopPropagation() after invoking the handler (default false)" },
  ],
  render: (_node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-click", { role: "button", tabindex: "0" });
    wrapper.append(renderChildAsNode(helpers, props.child));
    const disabled = asBoolean(props.disabled);
    const stopProp = asBoolean(props.stopPropagation);
    const handle = (event: Event) => {
      if (disabled) return;
      if (stopProp) event.stopPropagation();
      helpers.invoke(props.onClick, event);
    };
    wrapper.addEventListener("click", handle);
    // Keyboard accessibility: Enter / Space activate the wrapper too.
    wrapper.addEventListener("keydown", (event) => {
      const e = event as KeyboardEvent;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handle(e);
      }
    });
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnMouse — every mouse / pointer event in one wrapper.
 *
 * Each event prop is optional. We only attach listeners for props the
 * caller actually supplied so unused events do not pay any cost — no
 * extra event handlers, no extra capture-phase listeners.
 *
 * Aliases (`hover` → `mouseover`) match the names common in CSS / web
 * docs so the LLM can pick whichever name they remember.
 * ------------------------------------------------------------------------ */

/**
 * Mapping from the prop name authors use → the native DOM event name
 * the listener should subscribe to. Ordered so the table stays readable.
 */
const MOUSE_EVENT_MAP: ReadonlyArray<{ prop: string; event: string }> = [
  { prop: "enter", event: "mouseenter" },
  { prop: "leave", event: "mouseleave" },
  { prop: "hover", event: "mouseover" },
  { prop: "move", event: "mousemove" },
  { prop: "down", event: "mousedown" },
  { prop: "up", event: "mouseup" },
  { prop: "click", event: "click" },
  { prop: "doubleClick", event: "dblclick" },
  { prop: "contextMenu", event: "contextmenu" },
  { prop: "scroll", event: "scroll" },
  { prop: "wheel", event: "wheel" },
  { prop: "drag", event: "drag" },
  { prop: "drop", event: "drop" },
  { prop: "dragStart", event: "dragstart" },
  { prop: "dragEnd", event: "dragend" },
  { prop: "dragEnter", event: "dragenter" },
  { prop: "dragLeave", event: "dragleave" },
  { prop: "dragOver", event: "dragover" },
];

export const OnMouse: ComponentSpec = {
  name: "OnMouse",
  description:
    "Attach any combination of mouse / pointer / drag listeners to a " +
    "component. Pass only the props you need — unused events install no " +
    "listener so the wrapper is essentially free. Each handler receives " +
    "the native MouseEvent / DragEvent / WheelEvent. Use for hover " +
    "tracking, custom drag-and-drop, context menus, scroll-aware UIs.",
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
    { name: "scroll", type: "callable", optional: true, description: "Fired when an inner element scrolls" },
    { name: "wheel", type: "callable", optional: true, description: "Fired on mouse-wheel / trackpad scroll" },
    { name: "drag", type: "callable", optional: true, description: "Fired while the element is being dragged" },
    { name: "drop", type: "callable", optional: true, description: "Fired when something is dropped onto the element" },
    { name: "dragStart", type: "callable", optional: true, description: "Fired when a drag begins" },
    { name: "dragEnd", type: "callable", optional: true, description: "Fired when a drag ends" },
    { name: "dragEnter", type: "callable", optional: true, description: "Fired when a drag enters the element" },
    { name: "dragLeave", type: "callable", optional: true, description: "Fired when a drag leaves the element" },
    { name: "dragOver", type: "callable", optional: true, description: "Fired while something is dragged over the element. Call `event.preventDefault()` to make the element a valid drop target." },
    { name: "draggable", type: "boolean", optional: true, description: "Make the wrapper itself draggable (sets `draggable=\"true\"`)" },
    { name: "passiveScroll", type: "boolean", optional: true, description: "Register scroll/wheel listeners as passive (default true for better scroll performance)" },
  ],
  render: (_node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-mouse");
    if (asBoolean(props.draggable)) wrapper.setAttribute("draggable", "true");
    wrapper.append(renderChildAsNode(helpers, props.child));
    const passive = props.passiveScroll === undefined ? true : asBoolean(props.passiveScroll);
    for (const { prop, event } of MOUSE_EVENT_MAP) {
      const handler = (props as Record<string, unknown>)[prop];
      if (handler == null) continue;
      const isScrollEvent = event === "scroll" || event === "wheel";
      const options: AddEventListenerOptions = isScrollEvent ? { passive } : {};
      wrapper.addEventListener(event, (ev) => {
        helpers.invoke(handler, ev);
      }, options);
    }
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnKeyboard — keyboard event wrapper.
 *
 * The wrapper gets `tabindex="0"` so it can receive keyboard focus by
 * default; pass `focusable=false` to opt out (useful when the child is
 * already focusable like an input).
 * ------------------------------------------------------------------------ */
const KEYBOARD_EVENT_MAP: ReadonlyArray<{ prop: string; event: string }> = [
  { prop: "onKeyDown", event: "keydown" },
  { prop: "onKeyUp", event: "keyup" },
  { prop: "onKeyPress", event: "keypress" },
];

export const OnKeyboard: ComponentSpec = {
  name: "OnKeyboard",
  description:
    "Attach keyboard listeners to a component. Pass any combination of " +
    "`onKeyDown`, `onKeyUp`, and `onKeyPress`; each handler receives the " +
    "native KeyboardEvent. Use for keyboard shortcuts, navigation, and " +
    "custom focusable widgets. The wrapper is focusable by default " +
    "(tabindex=\"0\") so it can be reached via Tab; pass `focusable=false` " +
    "to disable when the child is already focusable.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onKeyDown", type: "callable", optional: true, aliases: ["onkeydown"], description: "Fired on keydown" },
    { name: "onKeyUp", type: "callable", optional: true, aliases: ["onkeyup"], description: "Fired on keyup" },
    { name: "onKeyPress", type: "callable", optional: true, aliases: ["onkeypress"], description: "Fired on keypress" },
    { name: "focusable", type: "boolean", optional: true, description: "Make the wrapper focusable via Tab (default true)" },
  ],
  render: (_node, props, helpers) => {
    const focusable = props.focusable === undefined ? true : asBoolean(props.focusable);
    const wrapper = transparentWrapper("rui-on-keyboard", focusable ? { tabindex: "0" } : {});
    wrapper.append(renderChildAsNode(helpers, props.child));
    for (const { prop, event } of KEYBOARD_EVENT_MAP) {
      const handler = (props as Record<string, unknown>)[prop];
      if (handler == null) continue;
      wrapper.addEventListener(event, (ev) => {
        helpers.invoke(handler, ev);
      });
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
    "Listens on the capture phase so blur from descendants is observed.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Fired when focus enters the element or any descendant" },
    { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Fired when focus leaves the element and all descendants" },
  ],
  render: (_node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-focus");
    wrapper.append(renderChildAsNode(helpers, props.child));
    // focusin / focusout bubble (unlike focus / blur), so a single wrapper
    // listener observes focus changes anywhere in the subtree.
    if (props.onFocus != null) {
      wrapper.addEventListener("focusin", (ev) => helpers.invoke(props.onFocus, ev));
    }
    if (props.onBlur != null) {
      wrapper.addEventListener("focusout", (ev) => helpers.invoke(props.onBlur, ev));
    }
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
 * The observer is registered against the wrapper element itself. We use
 * a real `inline-block` wrapper (NOT `display: contents`) because the
 * IntersectionObserver skips boxless wrappers.
 * ------------------------------------------------------------------------ */
export const OnIntersect: ComponentSpec = {
  name: "OnIntersect",
  description:
    "Observe whether a component is visible in the viewport (or a scroll " +
    "container) using IntersectionObserver. Fires `onEnter` the first " +
    "time the wrapped element becomes visible, `onLeave` when it leaves, " +
    "and `onChange({visible, ratio})` for every transition. Use for " +
    "lazy-load sentinels, infinite-scroll triggers, impression analytics, " +
    "and reveal-on-scroll animations.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onEnter", type: "callable", optional: true, description: "Fired when the element enters the viewport" },
    { name: "onLeave", type: "callable", optional: true, description: "Fired when the element leaves the viewport" },
    { name: "onChange", type: "callable", optional: true, description: "Fired with `{visible, ratio}` on every transition" },
    { name: "threshold", type: "number", optional: true, description: "Visible-ratio threshold 0–1 (default 0.05)" },
    { name: "rootMargin", type: "string", optional: true, description: "CSS-length root margin (e.g. \"0px 0px -64px 0px\")" },
    { name: "once", type: "boolean", optional: true, description: "Disconnect after the first entry (default false)" },
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("span", {
      class: "rui-wrapper rui-on-intersect",
      style: "display: inline-block;",
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    // IntersectionObserver only exists in browser environments; bail
    // gracefully in SSR / test environments.
    const ObserverCtor: typeof IntersectionObserver | undefined =
      typeof IntersectionObserver !== "undefined" ? IntersectionObserver : undefined;
    if (!ObserverCtor) return wrapper;
    const threshold = Math.max(0, Math.min(1, asNumber(props.threshold, 0.05)));
    const rootMargin = asString(props.rootMargin);
    const once = asBoolean(props.once);
    let lastVisible: boolean | null = null;
    const observer = new ObserverCtor((entries) => {
      for (const entry of entries) {
        const visible = entry.isIntersecting;
        if (visible !== lastVisible) {
          if (visible && props.onEnter != null) helpers.invoke(props.onEnter, entry);
          if (!visible && lastVisible === true && props.onLeave != null) {
            helpers.invoke(props.onLeave, entry);
          }
          lastVisible = visible;
        }
        if (props.onChange != null) {
          helpers.invoke(props.onChange, { visible, ratio: entry.intersectionRatio });
        }
        if (once && visible) {
          observer.disconnect();
          return;
        }
      }
    }, {
      threshold,
      ...(rootMargin ? { rootMargin } : {}),
    });
    observer.observe(wrapper);
    // Keyed: a re-render replaces the previous observer instead of stacking
    // one per render (anonymous disposers only run on unmount).
    helpers.registerDisposer(() => observer.disconnect(), "rui-onintersect-io");
    return wrapper;
  },
};

/* ------------------------------------------------------------------------ *
 * OnMount — lifecycle / DOM-ref wrapper.
 *
 * The Aktion-native way to get a reference to a rendered DOM node and run
 * imperative code against it. `onMount(node)` fires exactly once, on a
 * microtask after the wrapped child is attached to the DOM; `onUnmount(node)`
 * fires when the component leaves the tree. This is the escape hatch for the
 * things a declarative tree can't express on its own: measuring an element,
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
 * `node` is the rendered child element itself.
 * ------------------------------------------------------------------------ */
export const OnMount: ComponentSpec = {
  name: "OnMount",
  description:
    "Run imperative code against the wrapped component's rendered DOM node. " +
    "`onMount(node)` fires once, on a microtask after the child is attached " +
    "to the DOM — the Aktion way to get a DOM ref (measure an element, focus " +
    "it, or hand it to an imperative library such as a chart / map / editor). " +
    "`onUnmount(node)` fires when the component leaves the tree. Pair with " +
    "`$ref(...)` to stash the node across renders.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onMount", type: "callable", optional: true, description: "`(node) => void` — fired once after the wrapped element is attached." },
    { name: "onUnmount", type: "callable", optional: true, description: "`(node) => void` — fired when the wrapped element leaves the tree." },
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("span", {
      class: "rui-wrapper rui-on-mount",
      style: "display: contents;",
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    const mounted = helpers.useInstanceState("rui-on-mount", false);
    if (!mounted.get()) {
      mounted.set(true);
      const fire = (): void => {
        const node = wrapper.firstElementChild ?? wrapper;
        if (props.onMount != null) helpers.invoke(props.onMount, node);
        if (props.onUnmount != null) {
          helpers.registerDisposer(() => {
            // Defer to a microtask so the callback runs after the reconcile
            // pass completes — a state write inside `onUnmount` then schedules
            // a clean re-render instead of tripping the render guard.
            const run = (): void => helpers.invoke(props.onUnmount, node);
            if (typeof queueMicrotask === "function") queueMicrotask(run);
            else void Promise.resolve().then(run);
          }, "rui-on-mount-unmount");
        }
      };
      if (typeof queueMicrotask === "function") queueMicrotask(fire);
      else void Promise.resolve().then(fire);
    }
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

export const Link: ComponentSpec = {
  name: "Link",
  description:
    "Anchor link. Accepts either a plain string label or a wrapped " +
    "component as its positional child. Pass `to` for client-side " +
    "router navigation (no page reload) or `href` for a regular " +
    "anchor. `external: true` opens the link in a new tab with " +
    "`rel=\"noopener noreferrer\"`. Use to make any component clickable " +
    "as a link — cards, icons, badges, list rows.",
  props: [
    { name: "label", type: "string | Node", positional: true, required: true, aliases: ["child", "children"], description: "Visible text OR a wrapped component" },
    { name: "to", type: "string", optional: true, description: "Router path (preferred). Navigates via the runtime router on click." },
    { name: "href", type: "string", optional: true, description: "Standard anchor href. Used when `to` is omitted." },
    { name: "external", type: "boolean", optional: true, description: "Open in a new tab (`target=\"_blank\"`, `rel=\"noopener noreferrer\"`)" },
    { name: "variant", type: "string", optional: true, enum: ["default", "subtle"] },
  ],
  render: (_node, props, helpers) => {
    const to = asString(props.to);
    const external = asBoolean(props.external);
    // `to` wins over `href`. Both are sanitised against `javascript:` URLs.
    const target = to || asString(props.href);
    const safeHref = to
      ? (target.startsWith("/") || target.startsWith("#") ? target : sanitiseHref(target, "#"))
      : sanitiseHref(props.href, "#");
    const variant = asString(props.variant, "default");
    const anchor = el("a", {
      class: "rui-link",
      "data-variant": variant,
      href: safeHref,
      target: external ? "_blank" : null,
      rel: external ? "noopener noreferrer" : null,
    });
    for (const node of renderLinkChildren(helpers, props.label)) anchor.append(node);
    // Wire router navigation for `to` only — `href` keeps native behaviour
    // (full reload, mailto:, tel:, external URL).
    if (to && !external) {
      anchor.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        helpers.router.navigate(to);
      });
    }
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
 * wrapping in a transparent span would render the styling invisible.
 * When the child is a plain text node (or fragment) we still wrap it in
 * a `<span>` so there is a single anchor to attach the styling to.
 * ------------------------------------------------------------------------ */
export const Css: ComponentSpec = {
  name: "Css",
  description:
    "Apply raw CSS class names and / or an inline style string to a " +
    "wrapped component. The styling is merged onto the rendered child's " +
    "DOM element — no extra wrapper element is added unless the child " +
    "is plain text (in which case the styling lands on a wrapping span). " +
    "Reach for `Css` only when the component's own props cannot express " +
    "the styling (use `Box`/`Stack`/`Grid` props for layout, `Theme` for " +
    "tokens, `Styles` + selector classes for sweeping changes).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "style", type: "string", optional: true, description: "Inline CSS declarations (e.g. \"padding: 16px; background: #eef;\")" },
    { name: "class", type: "string | string[]", optional: true, aliases: ["className", "classes"], description: "Class name (space-separated string or array). Tokens must match `[A-Za-z_][A-Za-z0-9_-:/]*`." },
  ],
  render: (_node, props, helpers) => {
    const rendered = renderChildAsNode(helpers, props.child);
    // If the rendered child is not an element (e.g. a text node), wrap it
    // in a span so the class / style attribute has somewhere to live.
    const target: HTMLElement = rendered instanceof HTMLElement
      ? rendered
      : (() => {
          const span = el("span", { class: "rui-css" });
          span.append(rendered);
          return span;
        })();
    const safeClasses = sanitiseClassList(props.class);
    for (const token of safeClasses) target.classList.add(token);
    const safeStyle = sanitiseInlineStyle(props.style);
    if (safeStyle) {
      const existing = target.getAttribute("style");
      target.setAttribute("style", existing ? `${existing};${safeStyle}` : safeStyle);
    }
    return target;
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
