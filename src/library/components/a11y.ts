/**
 * Accessibility primitives (suggestions-global X.3).
 *
 *   VisuallyHidden(child)              — screen-reader-only content
 *   SkipLink({ to, label })            — keyboard skip-to-content link
 *   FocusTrap(child, { active })       — confines Tab focus within a subtree
 *   LiveRegion(text, { politeness })   — aria-live announcer for dynamic text
 *
 * All bounded + theme-aware. They lean on native ARIA so they compose with the
 * universal `aria`/`id` channel every component already accepts.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asString } from "../utils.js";

function renderChildren(helpers: RenderHelpers, children: unknown): Node {
  const frag = document.createDocumentFragment();
  for (const child of asArray(children)) {
    if (child == null) continue;
    frag.append(typeof child === "string" ? document.createTextNode(child) : helpers.renderNode(child));
  }
  return frag;
}

export const VisuallyHidden: ComponentSpec = {
  name: "VisuallyHidden",
  description:
    "Renders content that is invisible on screen but available to screen " +
    "readers (the `sr-only` pattern). Use for icon-button labels, form hints, " +
    "and context that sighted users get from layout but assistive tech needs.",
  props: [
    { name: "children", type: "Node[]", description: "Content exposed only to assistive tech" },
  ],
  render: (_node, props, helpers) => {
    const root = el("span", { class: "rui-visually-hidden" });
    root.append(renderChildren(helpers, props.children));
    return root;
  },
};

export const SkipLink: ComponentSpec = {
  name: "SkipLink",
  description:
    "A keyboard-only 'skip to content' link that is hidden until focused, " +
    "then jumps to the element with the given id. Place it as the first node " +
    "in a page so keyboard users can bypass the nav.",
  props: [
    { name: "to", type: "string", positional: true, required: true, description: "Target element id (with or without #)" },
    { name: "label", type: "string", optional: true, description: "Link text (default 'Skip to content')" },
  ],
  render: (_node, props) => {
    const to = asString(props.to, "main");
    const id = to.replace(/^#/, "");
    const link = el("a", { class: "rui-skip-link", href: `#${id}` });
    link.textContent = asString(props.label, "Skip to content");
    // The rendered app lives inside a shadow root, so the browser's native
    // fragment navigation can't see the target — `#id` only searches the
    // document. Resolve the target in the link's own root (falling back to
    // the document) and move focus there ourselves.
    link.onclick = (event: Event) => {
      const live = ((event.currentTarget ?? event.target) as HTMLElement | null) ?? link;
      const scope = live.getRootNode() as Document | ShadowRoot;
      let target: HTMLElement | null = null;
      try {
        target = (scope.getElementById?.(id) as HTMLElement | null)
          ?? document.getElementById(id);
      } catch { target = null; }
      if (!target) return; // keep native behaviour as the last resort
      event.preventDefault();
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      try { target.focus({ preventScroll: true }); } catch { target.focus(); }
      try { target.scrollIntoView?.({ behavior: "smooth", block: "start" }); } catch { /* no scrolling support */ }
    };
    return link;
  },
};

export const LiveRegion: ComponentSpec = {
  name: "LiveRegion",
  description:
    "An aria-live region that announces its text to screen readers whenever " +
    "it changes — toasts, validation summaries, async status. `politeness` is " +
    "`polite` (default) or `assertive`. Visually hidden by default; set " +
    "`visible` to also show it.",
  props: [
    { name: "text", type: "string", positional: true, aliases: ["children"] },
    { name: "politeness", type: "string", optional: true, enum: ["polite", "assertive"] },
    { name: "visible", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const politeness = asString(props.politeness, "polite") === "assertive" ? "assertive" : "polite";
    const visible = props.visible === true || props.visible === "true";
    const root = el("div", {
      class: visible ? "rui-live-region" : "rui-live-region rui-visually-hidden",
      role: "status",
      "aria-live": politeness,
      "aria-atomic": "true",
    });
    if (props.text != null && typeof props.text !== "object") {
      root.textContent = String(props.text);
    } else {
      root.append(renderChildren(helpers, props.text ?? props.children));
    }
    return root;
  },
};

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

export const FocusTrap: ComponentSpec = {
  name: "FocusTrap",
  description:
    "Confines keyboard focus to its subtree while `active` (default true) — " +
    "Tab from the last focusable wraps to the first and vice-versa. Use inside " +
    "modals, drawers, and command palettes. Auto-focuses the first focusable " +
    "on mount.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "active", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const active = props.active === undefined ? true : (props.active === true || props.active === "true");
    const root = el("div", { class: "rui-focus-trap" });
    root.append(renderChildren(helpers, props.child ?? props.children));
    if (!active) return root;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const activeEl = (root.getRootNode() as Document | ShadowRoot).activeElement;
      if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", onKeyDown);
    // Auto-focus the first focusable once attached.
    setTimeout(() => {
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      if (first && typeof first.focus === "function") first.focus();
    }, 0);
    helpers.registerDisposer(() => root.removeEventListener("keydown", onKeyDown), "rui-focus-trap");
    return root;
  },
};
