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
import { el, asArray, asBoolean, asString } from "../utils.js";
import { deferToPaint } from "../floating.js";

/**
 * The element that actually has focus, drilling through shadow roots — the
 * rendered app lives inside one, so `document.activeElement` only ever reports
 * the host element.
 */
function deepActiveElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let node: Element | null = document.activeElement;
  while (node) {
    const inner = (node as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot?.activeElement;
    if (!inner || inner === node) break;
    node = inner;
  }
  // `<body>` / `<html>` mean "nothing was focused" — not something to restore to.
  if (!node || node === document.body || node === document.documentElement) return null;
  return node as HTMLElement;
}

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
    { name: "children", aliases: ["child"], type: "Node[]", description: "Content exposed only to assistive tech" },
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
      // Always take the click. The app is hash-routed, so letting the native
      // `href="#id"` through on a missed target navigates the whole app to the
      // route `/id` — the one control added for keyboard users would throw
      // away their session state.
      event.preventDefault();
      let target: HTMLElement | null = null;
      try {
        target = (scope.getElementById?.(id) as HTMLElement | null)
          ?? document.getElementById(id);
      } catch { target = null; }
      if (!target) {
        // The id does not exist (typo, or the content is behind a Show/Async
        // branch that has not mounted). Land on the nearest content landmark
        // instead so the user still skips the nav.
        try {
          target = (scope as ParentNode).querySelector?.(
            "main, [role='main'], .rui-root, h1",
          ) as HTMLElement | null;
        } catch { target = null; }
      }
      if (!target) return;
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
      // Keep the role and the live setting in agreement: `role="status"` carries
      // an implicit `aria-live="polite"`, and screen readers are inconsistent
      // when that contradicts an explicit `assertive` — the urgent message ends
      // up queued behind whatever is being read.
      role: politeness === "assertive" ? "alert" : "status",
      "aria-live": politeness,
      "aria-atomic": "true",
    });
    if (props.text != null && typeof props.text !== "object") {
      root.textContent = String(props.text);
    } else {
      // `children` is only an alias of `text`; the evaluator folds aliases into
      // the canonical slot, so there is no `props.children` to fall back to.
      root.append(renderChildren(helpers, props.text));
    }
    return root;
  },
};

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Focus bookkeeping for one FocusTrap instance. Held in instance state and
 * *mutated in place* so the unmount disposer — which runs after the renderer
 * has already dropped the instance-state map — still sees the current values.
 */
interface TrapFocusState {
  /** The trap is currently holding focus, i.e. `active` has been seen true. */
  armed: boolean;
  /**
   * What had focus when the trap armed, for WCAG 2.4.3 restoration. Non-null
   * means a restore is still owed — the deferred restore and the unmount
   * disposer both claim it by clearing this field, so exactly one of them acts.
   */
  prev: HTMLElement | null;
  /** Latest `restoreFocus` value — read by the unmount disposer. */
  restore: boolean;
  /** The unmount disposer is registered exactly once per instance. */
  installed: boolean;
}

export const FocusTrap: ComponentSpec = {
  name: "FocusTrap",
  description:
    "Confines keyboard focus to its subtree while `active` (default true) — " +
    "Tab from the last focusable wraps to the first and vice-versa. Use inside " +
    "modals, drawers, and command palettes. Auto-focuses the first focusable " +
    "when it opens (`autoFocus: false` to opt out, or a CSS selector to pick " +
    "the control), returns focus to whatever opened it on close " +
    "(`restoreFocus: false` to opt out), and calls `onEscape` on the Escape key.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "active", type: "boolean", optional: true },
    { name: "restoreFocus", type: "boolean", optional: true, description: "Return focus to the element that opened the trap when it closes (default true)" },
    { name: "onEscape", type: "callable", optional: true, description: "Called when Escape is pressed inside the trap — wire it to close the dialog/drawer" },
    { name: "autoFocus", type: "boolean | string", optional: true, description: "`false` to skip the initial focus, or a CSS selector inside the trap to focus instead of the first control (e.g. \"[data-cancel]\")" },
  ],
  render: (_node, props, helpers) => {
    const active = props.active === undefined ? true : (props.active === true || props.active === "true");
    const root = el("div", { class: "rui-focus-trap" });
    // `children` is an alias of `child`, resolved to this slot by the
    // evaluator — reading `props.children` here would always be undefined.
    root.append(renderChildren(helpers, props.child));

    const focusState = helpers.useInstanceState<TrapFocusState>("rui-focus-trap-focus", {
      armed: false,
      prev: null,
      restore: true,
      installed: false,
    }).get();
    const restoreFocus = props.restoreFocus === undefined ? true : asBoolean(props.restoreFocus, true);
    focusState.restore = restoreFocus;

    const restorePreviousFocus = (): void => {
      const target = focusState.prev;
      focusState.armed = false;
      if (!focusState.restore || !target || typeof target.focus !== "function") {
        focusState.prev = null;
        return;
      }
      // One paint later: the commit that closed the trap has not landed yet, so
      // the element we hand focus to may still be behind the closing surface.
      // `prev` stays set until the focus actually lands — it is what tells the
      // unmount disposer below that a restore is still owed, so a trap removed
      // from the tree in the same tick still returns focus (WCAG 2.4.3) instead
      // of losing it to a cancelled timer.
      deferToPaint(() => {
        if (focusState.prev !== target) return; // already restored, or re-armed
        focusState.prev = null;
        if (target.isConnected) target.focus();
      });
    };

    // Registered once per instance, so it never trips the keyed-disposer trap
    // (re-registering a key runs the previous cleanup immediately).
    if (!focusState.installed) {
      focusState.installed = true;
      helpers.registerDisposer(() => {
        // `prev` is null once the restore has happened (or was never owed), so
        // this covers both "unmounted while trapping" and "unmounted with a
        // deferred restore still pending".
        const target = focusState.prev;
        focusState.armed = false;
        focusState.prev = null;
        if (focusState.restore && target?.isConnected && typeof target.focus === "function") {
          target.focus();
        }
      }, "rui-focus-trap-unmount");
    }

    if (!active) {
      if (focusState.armed) restorePreviousFocus();
      return root;
    }

    // Property handler, NOT addEventListener: the reconciler keeps the live node
    // and copies `onkeydown` onto it. A registered listener would land on the
    // node morph discards, and its keyed disposer would tear down the previous
    // render's working listener — leaving the dialog with no trap at all.
    root.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      // Resolve the live subtree from the event; the closure-captured `root`
      // is a discarded snapshot on every render after the first.
      const live = ((e.currentTarget ?? e.target) as HTMLElement | null) ?? root;
      const scopeRoot = (live.getRootNode() as Document | ShadowRoot);
      if (e.key === "Escape") {
        if (typeof props.onEscape !== "function") return;
        e.preventDefault();
        // Handled here, so an outer surface does not also act on it.
        e.stopPropagation();
        helpers.invoke(props.onEscape);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(live.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === scopeRoot.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const activeEl = scopeRoot.activeElement;
      if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus(); }
    };

    // Initial focus fires on the closed→open transition only. Running it on
    // every commit (library components are never memoized) yanked focus back to
    // the first control after every keystroke in the trapped form.
    if (!focusState.armed) {
      focusState.armed = true;
      focusState.prev = deepActiveElement();
      const autoFocusRaw = props.autoFocus;
      const selector = typeof autoFocusRaw === "string" && autoFocusRaw !== "true" && autoFocusRaw !== "false"
        ? autoFocusRaw.trim()
        : "";
      const autoFocus = autoFocusRaw === undefined || !!selector || asBoolean(autoFocusRaw, true);
      if (autoFocus) {
        const cancel = deferToPaint(() => {
          // Only touch the node if it is the one that got mounted: when `active`
          // flips on an already-mounted trap the reconciler keeps the previous
          // node and this tree is thrown away, and focusing inside a detached
          // subtree would silently blur the user.
          if (!root.isConnected) return;
          let target: HTMLElement | null = null;
          if (selector) {
            try { target = root.querySelector<HTMLElement>(selector); } catch { target = null; }
          }
          // `querySelectorAll` rather than `querySelector`: for a selector list
          // the former is reliably in document order, so "the first focusable"
          // means the first control the user sees, not the first matching
          // *selector* in FOCUSABLE.
          target ??= root.querySelectorAll<HTMLElement>(FOCUSABLE)[0] ?? null;
          if (target && typeof target.focus === "function") target.focus();
        });
        // Disposed with the instance so a pending focus() cannot fire into a
        // subtree the user has already closed.
        helpers.registerDisposer(cancel, "rui-focus-trap-autofocus");
      }
    }
    return root;
  },
};
