/**
 * Extra components (suggestions-global Parts VIII.2/3/4/8/9, IX.2).
 *
 * SVG escape, overlay sheets, social/content widgets, e-commerce extras,
 * and small utilities — all bounded + theme-aware.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseImageSrc, sanitiseHref,
  sanitiseCssColor, sanitiseCssLength, canonicalSizeToken,
} from "../utils.js";
import { sanitiseSvgMarkup } from "../svg-sanitizer.js";
import {
  deferToPaint, promoteOverlay, releaseOverlay,
  OVERLAY_FILL, OVERLAY_FILL_CLIP, OVERLAY_CORNER,
} from "../floating.js";
import {
  dialogKeydownHandler, wireDialogFocus, initialsFor, pickIconForTone,
  installDismissListeners, disposeDismissListeners,
} from "./_internal.js";

/* ----------------------------------------------------------------------- *
 * Shared plumbing
 * ----------------------------------------------------------------------- */

let idSeq = 0;

/**
 * A per-instance element id.
 *
 * These components used to hardcode `id="rui-sheet-label"` /
 * `id="rui-confirm-label"`, so every dialog in the app shared one
 * `aria-labelledby` target and they all announced the FIRST dialog's title —
 * actively dangerous on an `alertdialog` ("Sign out?" announced as "Delete
 * account?"). Duplicate ids also collide in the morph reconciler, which keys
 * children by id.
 */
function instanceId(helpers: RenderHelpers, key: string, prefix: string): string {
  const slot = helpers.useInstanceState<string>(key, "");
  if (!slot.get()) slot.set(`${prefix}-${(idSeq += 1)}`);
  return slot.get();
}

/**
 * Run `install` exactly once per component instance, against the LIVE root.
 *
 * Deferred work (observers, players, drag wiring) must only run for the render
 * whose node is actually mounted: morph keeps the live node and discards the
 * fresh one, so a snapshot that attaches an observer to its own detached div
 * loses it — and a keyed disposer registered from that snapshot tears down the
 * working one instead. The `isConnected` check is the discriminator; the `wired`
 * slot makes sure a second render in the same tick cannot cancel the pending
 * install through the shared timer key.
 */
function onceMounted(
  root: HTMLElement,
  helpers: RenderHelpers,
  key: string,
  install: (live: HTMLElement) => void,
): void {
  const wired = helpers.useInstanceState<boolean>(`${key}-wired`, false);
  if (wired.get()) return;
  wired.set(true);
  const cancel = deferToPaint(() => {
    if (!root.isConnected) return; // discarded snapshot — the mounted render owns it
    install(root);
  });
  // The install is inert once the instance is gone (the node is detached), but
  // cancelling the pending callback outright keeps an unmount in the same tick
  // from doing any work at all.
  helpers.registerDisposer(cancel, `${key}-timer`);
}

/* --- viewport overlays: top layer + scroll lock ------------------------- */

/*
 * Promotion itself lives in `../floating.js` (`promoteOverlay` /
 * `releaseOverlay` + the `OVERLAY_*` resets): a Sheet declared inside a Card
 * dimmed only the card, and a ConfirmDialog inside a table wrapper centred
 * inside the wrapper, because `position: fixed` is re-trapped by any ancestor
 * that establishes a containing block. Every overlay surface in the library uses
 * the same pair, so the UA `[popover]` neutralisation and the
 * `data-floating-side` morph sentinel are written once. What stays here is the
 * per-component wiring: which reset a surface needs, and the scroll lock.
 */

let scrollLocks = 0;
let savedRootOverflow: string | null = null;

/**
 * Freeze the page behind an `aria-modal` overlay. Without this the content
 * scrolls under the panel and, once the panel's own body hits its end, the
 * gesture chains to the document — the classic "modal scrolls the page away"
 * bug on iOS. Reference-counted so nested overlays restore exactly once.
 */
function lockPageScroll(lock: boolean): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  if (lock) {
    if (scrollLocks === 0) {
      savedRootOverflow = root.style.overflow;
      root.style.overflow = "hidden";
    }
    scrollLocks += 1;
    return;
  }
  if (scrollLocks === 0) return;
  scrollLocks -= 1;
  if (scrollLocks === 0) {
    root.style.overflow = savedRootOverflow ?? "";
    savedRootOverflow = null;
  }
}

/**
 * Watch a state-bound overlay's `data-open` on the LIVE node: promote it to the
 * top layer and lock page scroll while open, undo both on close and on unmount.
 * Same shape as `wireDialogFocus`, which owns focus for the same components.
 */
function wireOverlayLayer(
  root: HTMLElement,
  helpers: RenderHelpers,
  reset: string,
  key: string,
): void {
  if (typeof MutationObserver === "undefined") return;
  onceMounted(root, helpers, key, (live) => {
    let locked = false;
    const sync = (): void => {
      const open = live.getAttribute("data-open") === "true";
      if (open) promoteOverlay(live, reset);
      else releaseOverlay(live);
      if (open !== locked) { locked = open; lockPageScroll(open); }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(live, { attributes: true, attributeFilter: ["data-open"] });
    helpers.registerDisposer(() => {
      observer.disconnect();
      releaseOverlay(live);
      if (locked) { locked = false; lockPageScroll(false); }
    }, key);
  });
}

/* ----------------------------------------------------------------------- *
 * Inline SVG (Part IX.2)
 * ----------------------------------------------------------------------- */

const VIEWBOX_RE = /^[\d.\s-]+$/;
const SVG_PAINT_RE = /^[a-zA-Z#()0-9,.\s-]+$/;
const PRESERVE_AR_RE = /^[a-zA-Z\s]+$/;

export const Svg: ComponentSpec = {
  name: "Svg",
  description:
    "Render inline SVG markup safely (paths, shapes, gradients) — for brand " +
    "illustrations, custom icons, and data-viz overlays without the HTMLTag " +
    "escape hatch. Pass the inner markup (everything inside <svg>) plus a " +
    "`viewBox`, or paste a whole `<svg …>` element and its viewBox/fill/stroke " +
    "are picked up. `label` names the graphic for assistive tech (unlabelled " +
    "graphics are hidden as decorative). Script/event-handler payloads are " +
    "stripped.",
  props: [
    { name: "content", type: "string", positional: true, required: true, aliases: ["paths", "markup"] },
    { name: "viewBox", type: "string", optional: true, description: "e.g. \"0 0 24 24\" (default)" },
    { name: "width", type: "string", optional: true },
    { name: "height", type: "string", optional: true },
    { name: "fill", type: "string", optional: true, description: "currentColor (default), none, or a token color" },
    { name: "stroke", type: "string", optional: true, description: "Stroke colour — for outline icon sets (Lucide, Feather)" },
    { name: "strokeWidth", type: "string | number", optional: true, aliases: ["stroke-width"] },
    { name: "preserveAspectRatio", type: "string", optional: true, description: "e.g. \"none\" to stretch to the box" },
    { name: "label", type: "string", optional: true, description: "Accessible name; omit for a decorative graphic" },
  ],
  render: (_node, props) => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "rui-svg");
    // Allow-list sanitisation returns real nodes, so no `innerHTML` assignment
    // ever touches the live document. Rejected markup renders as an empty
    // (but still correctly sized) `<svg>`.
    const safe = sanitiseSvgMarkup(asString(props.content));
    // A pasted `<svg …>` payload is unwrapped by the sanitiser, which vets its
    // root attributes for exactly this purpose. Ignoring them rendered 48-unit
    // artwork into a 24-unit viewBox (three quarters clipped) and painted
    // `fill="none" stroke="currentColor"` icons as solid blobs.
    const rootAttrs = safe?.rootAttrs ?? {};
    const vb = asString(props.viewBox) || rootAttrs.viewbox || "0 0 24 24";
    svg.setAttribute("viewBox", VIEWBOX_RE.test(vb) ? vb : "0 0 24 24");
    const fill = asString(props.fill) || rootAttrs.fill || "currentColor";
    svg.setAttribute("fill", SVG_PAINT_RE.test(fill) ? fill : "currentColor");
    const stroke = asString(props.stroke) || rootAttrs.stroke || "";
    if (stroke && SVG_PAINT_RE.test(stroke)) svg.setAttribute("stroke", stroke);
    const strokeWidth = asString(props.strokeWidth) || rootAttrs["stroke-width"] || "";
    if (strokeWidth && SVG_PAINT_RE.test(strokeWidth)) svg.setAttribute("stroke-width", strokeWidth);
    const par = asString(props.preserveAspectRatio) || rootAttrs.preserveaspectratio || "";
    if (par && PRESERVE_AR_RE.test(par)) svg.setAttribute("preserveAspectRatio", par);
    // `sanitiseCssLength` accepts the whole CSS length vocabulary, including
    // `calc()`/`clamp()` — the previous character strip turned
    // `calc(100% - 20px)` into the unparseable `calc10020px`.
    const width = sanitiseCssLength(props.width, "");
    if (width) svg.setAttribute("width", width);
    const height = sanitiseCssLength(props.height, "");
    if (height) svg.setAttribute("height", height);
    const label = asString(props.label);
    if (label) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", label);
    } else {
      svg.setAttribute("aria-hidden", "true");
    }
    if (safe) for (const child of safe.children) svg.appendChild(child);
    return svg as unknown as HTMLElement;
  },
};

/* ----------------------------------------------------------------------- *
 * Overlay sheets / confirm (Part VIII.9)
 * ----------------------------------------------------------------------- */

export const Sheet: ComponentSpec = {
  name: "Sheet",
  description:
    "A panel that slides in from an edge over a dimmed backdrop. `side` is " +
    "left|right|top|bottom. Bind `open` to a $variable; `onClose` fires on " +
    "backdrop click / Escape (set `dismissible: false` to require an explicit " +
    "action). `footer` pins an action row below the scrolling body. Use " +
    "BottomSheet for the mobile bottom variant.",
  props: [
    { name: "children", type: "Node[]", positional: true, required: true, aliases: ["child", "content"] },
    { name: "open", type: "boolean", optional: true },
    { name: "side", type: "string", optional: true, enum: ["left", "right", "top", "bottom"] },
    { name: "title", type: "string", optional: true },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"] },
    { name: "label", type: "string", optional: true, description: "Accessible name when there is no visible `title`" },
    { name: "width", type: "string", optional: true, description: "Panel width for left/right sides (default min(420px, 90vw))" },
    { name: "footer", type: "Node[]", optional: true, description: "Pinned action row (Cancel / Apply)" },
    { name: "dismissible", type: "boolean", optional: true, description: "Backdrop click + Escape close it (default true)" },
  ],
  render: (node, props, helpers) => {
    const open = asBoolean(props.open);
    const side = asString(props.side, "right");
    const root = el("div", { class: "rui-sheet-root", "data-open": open ? "true" : "false", "data-side": side });
    // The `open` slot, by declaration order. `.find((m) => m?.stateRef)` used to
    // return the FIRST bound prop — `children` — so dismissing a
    // `Sheet($rows, open: $sheetOpen)` wrote `false` over the author's row
    // array and left the sheet open.
    const ref = node.argMeta?.[1]?.stateRef;
    const dismissible = props.dismissible === undefined ? true : asBoolean(props.dismissible);
    const close = () => { if (ref) helpers.setState(ref, false); helpers.invoke(props.onClose); };
    const backdrop = el("div", { class: "rui-sheet-backdrop" });
    if (dismissible) backdrop.onclick = close;
    const panelWidth = (side === "left" || side === "right") ? sanitiseCssLength(props.width, "") : "";
    const panel = el("div", {
      class: "rui-sheet-panel",
      role: "dialog",
      "aria-modal": "true",
      tabindex: "-1",
      style: panelWidth ? `width:min(${panelWidth}, 100vw)` : null,
    });
    const title = asString(props.title);
    const label = asString(props.label);
    const titleId = instanceId(helpers, "rui-sheet-label-id", "rui-sheet-label");
    if (title) panel.setAttribute("aria-labelledby", titleId);
    else if (label) panel.setAttribute("aria-label", label);
    // The head (and its × ) renders even without a title: an `aria-modal`
    // dialog whose only exits are Escape and the backdrop is unusable on touch.
    const head = el("div", { class: "rui-sheet-head" });
    if (title) head.append(el("h3", { class: "rui-sheet-title", id: titleId }, [title]));
    const x = el("button", { class: "rui-sheet-close", type: "button", "aria-label": "Close" }) as HTMLButtonElement;
    const ic = renderIcon("xmark"); if (ic) x.append(ic);
    x.onclick = close;
    head.append(x);
    panel.append(head);
    const body = el("div", { class: "rui-sheet-body" });
    for (const c of asArray(props.children)) body.append(helpers.renderNode(c));
    panel.append(body);
    const footer = asArray<unknown>(props.footer);
    if (footer.length > 0) {
      const foot = el("div", { class: "rui-sheet-footer" });
      for (const c of footer) foot.append(helpers.renderNode(c));
      panel.append(foot);
    }
    root.append(backdrop, panel);
    // Escape-to-close + Tab focus trap + focus restore (VIII.9 / X.3).
    root.onkeydown = dialogKeydownHandler(".rui-sheet-panel", () => { if (dismissible) close(); });
    wireDialogFocus(root, ".rui-sheet-panel", helpers);
    wireOverlayLayer(root, helpers, OVERLAY_FILL, "rui-sheet-layer");
    return root;
  },
};

/** Pointer-drag bookkeeping for a BottomSheet grip. */
interface GripDrag { y: number; t: number; active: boolean }

export const BottomSheet: ComponentSpec = {
  name: "BottomSheet",
  description:
    "A mobile bottom sheet — Sheet pinned to the bottom edge. The grip is " +
    "draggable: swiping it down dismisses the sheet. Bind `open`; `onClose` on " +
    "dismiss. `height` fixes the panel size so a filtering list scrolls " +
    "instead of resizing the sheet; `footer` pins a primary action.",
  props: [
    { name: "children", type: "Node[]", positional: true, required: true, aliases: ["child", "content"] },
    { name: "open", type: "boolean", optional: true },
    { name: "title", type: "string", optional: true },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"] },
    { name: "label", type: "string", optional: true, description: "Accessible name when there is no visible `title`" },
    { name: "height", type: "string", optional: true, description: "Fixed panel height, e.g. \"50vh\" (default: hugs content, max 85vh)" },
    { name: "showClose", type: "boolean", optional: true, description: "Render the × button (default true)" },
    { name: "footer", type: "Node[]", optional: true, description: "Pinned action row" },
  ],
  render: (node, props, helpers) => {
    const open = asBoolean(props.open);
    const root = el("div", { class: "rui-sheet-root rui-bottomsheet", "data-open": open ? "true" : "false", "data-side": "bottom" });
    const ref = node.argMeta?.[1]?.stateRef; // `open`, by declaration order
    const close = () => { if (ref) helpers.setState(ref, false); helpers.invoke(props.onClose); };
    const backdrop = el("div", { class: "rui-sheet-backdrop" });
    backdrop.onclick = close;
    const height = sanitiseCssLength(props.height, "");
    const panel = el("div", {
      class: "rui-sheet-panel",
      role: "dialog",
      "aria-modal": "true",
      tabindex: "-1",
      style: height ? `height:${height};max-height:100vh` : null,
    });
    const title = asString(props.title);
    const label = asString(props.label);
    const titleId = instanceId(helpers, "rui-bottomsheet-label-id", "rui-bottomsheet-label");
    if (title) panel.setAttribute("aria-labelledby", titleId);
    else if (label) panel.setAttribute("aria-label", label);

    // Drag-to-dismiss. The grip used to be pure decoration while the
    // description promised a drag handle, so the obvious swipe did nothing.
    // Drag state lives in instance state, not the closure, so a re-render
    // mid-gesture does not reset it.
    const drag = helpers.useInstanceState<GripDrag>("rui-bottomsheet-drag", { y: 0, t: 0, active: false });
    // Decorative for assistive tech: dragging is a pointer-only gesture and the
    // × is its keyboard/screen-reader equivalent.
    const grip = el("div", { class: "rui-bottomsheet-grip", "aria-hidden": "true" });
    const panelOf = (event: Event): HTMLElement | null => {
      const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
      return (origin?.closest(".rui-sheet-panel") as HTMLElement | null) ?? null;
    };
    grip.onpointerdown = (event: Event) => {
      const ev = event as PointerEvent;
      const live = panelOf(ev);
      if (!live) return;
      drag.set({ y: ev.clientY, t: Date.now(), active: true });
      try { ((ev.currentTarget ?? ev.target) as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(ev.pointerId); } catch { /* unsupported */ }
      live.style.transition = "none";
    };
    grip.onpointermove = (event: Event) => {
      const ev = event as PointerEvent;
      const state = drag.get();
      if (!state.active) return;
      const live = panelOf(ev);
      if (!live) return;
      live.style.transform = `translateY(${Math.max(0, ev.clientY - state.y)}px)`;
    };
    const endDrag = (event: Event, commit: boolean): void => {
      const ev = event as PointerEvent;
      const state = drag.get();
      if (!state.active) return;
      drag.set({ y: 0, t: 0, active: false });
      const live = panelOf(ev);
      if (live) { live.style.transition = ""; live.style.transform = ""; }
      if (!commit) return;
      const dy = ev.clientY - state.y;
      const elapsed = Math.max(1, Date.now() - state.t);
      // Either a decisive distance or a fast flick dismisses, matching the
      // platform bottom-sheet feel.
      if (dy > 90 || dy / elapsed > 0.6) close();
    };
    grip.onpointerup = (event: Event) => endDrag(event, true);
    grip.onpointercancel = (event: Event) => endDrag(event, false);
    panel.append(grip);

    const showClose = props.showClose === undefined ? true : asBoolean(props.showClose);
    if (title || showClose) {
      const head = el("div", { class: "rui-sheet-head" });
      if (title) head.append(el("h3", { class: "rui-sheet-title", id: titleId }, [title]));
      if (showClose) {
        const x = el("button", { class: "rui-sheet-close", type: "button", "aria-label": "Close" }) as HTMLButtonElement;
        const ic = renderIcon("xmark"); if (ic) x.append(ic);
        x.onclick = close;
        head.append(x);
      }
      panel.append(head);
    }
    const body = el("div", { class: "rui-sheet-body" });
    for (const c of asArray(props.children)) body.append(helpers.renderNode(c));
    panel.append(body);
    const footer = asArray<unknown>(props.footer);
    if (footer.length > 0) {
      const foot = el("div", { class: "rui-sheet-footer" });
      for (const c of footer) foot.append(helpers.renderNode(c));
      panel.append(foot);
    }
    root.append(backdrop, panel);
    root.onkeydown = dialogKeydownHandler(".rui-sheet-panel", () => close());
    wireDialogFocus(root, ".rui-sheet-panel", helpers);
    wireOverlayLayer(root, helpers, OVERLAY_FILL, "rui-bottomsheet-layer");
    return root;
  },
};

export const ConfirmDialog: ComponentSpec = {
  name: "ConfirmDialog",
  description:
    "A confirm/cancel modal dialog. Bind `open` to a $variable; `onConfirm` " +
    "fires on accept, `onCancel`/backdrop on dismiss. `tone` colors the " +
    "confirm button (danger for destructive actions) and picks a matching " +
    "icon. Binding `loading` keeps the dialog open on confirm and disables " +
    "both buttons so an async action can report progress — write `false` to " +
    "`open` yourself once it resolves.",
  props: [
    { name: "title", type: "string", positional: true, required: true },
    { name: "open", type: "boolean", optional: true },
    { name: "message", type: "string", optional: true, aliases: ["body"] },
    { name: "confirmLabel", type: "string", optional: true },
    { name: "cancelLabel", type: "string", optional: true },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["primary", "danger", "warning"] },
    { name: "onConfirm", type: "callable", optional: true },
    { name: "onCancel", type: "callable", optional: true },
    { name: "loading", type: "boolean", optional: true, description: "Async confirm in flight — keeps the dialog open, disables both buttons" },
    { name: "confirmDisabled", type: "boolean", optional: true, description: "Guard the primary action until a condition is met" },
    { name: "icon", type: "string", optional: true, description: "Glyph beside the title (defaults from `tone`)" },
  ],
  render: (node, props, helpers) => {
    const open = asBoolean(props.open);
    const tone = asString(props.tone, "primary");
    const root = el("div", { class: "rui-confirm-root", "data-open": open ? "true" : "false" });
    const ref = node.argMeta?.[1]?.stateRef; // `open`, by declaration order
    const dismiss = () => { if (ref) helpers.setState(ref, false); };
    const backdrop = el("div", { class: "rui-confirm-backdrop" });
    const titleId = instanceId(helpers, "rui-confirm-label-id", "rui-confirm-label");
    const msgId = `${titleId}-desc`;
    const msg = asString(props.message);
    // `loading` opts the author into owning the dialog's lifetime; without it we
    // keep the historical dismiss-on-confirm behaviour.
    const managed = props.loading !== undefined;
    const loading = asBoolean(props.loading);
    const confirmBlocked = loading || asBoolean(props.confirmDisabled);
    const cancelAndDismiss = () => {
      if (loading) return;
      helpers.invoke(props.onCancel);
      dismiss();
    };
    backdrop.onclick = cancelAndDismiss;
    const card = el("div", {
      class: "rui-confirm-card",
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      // The consequence text is the entire reason the dialog exists, so it has
      // to be part of the announcement, not a loose paragraph.
      "aria-describedby": msg ? msgId : null,
      "data-tone": tone,
      tabindex: "-1",
    });
    const heading = el("h3", { class: "rui-confirm-title", id: titleId });
    const iconName = props.icon !== undefined ? asString(props.icon) : (pickIconForTone(tone) ?? "");
    const toneIcon = tone === "primary" && props.icon === undefined ? null : renderIcon(iconName, { className: "rui-confirm-icon" });
    if (toneIcon) heading.append(toneIcon);
    heading.append(document.createTextNode(asString(props.title)));
    card.append(heading);
    if (msg) card.append(el("p", { class: "rui-confirm-message", id: msgId }, [msg]));
    const actions = el("div", { class: "rui-confirm-actions" });
    const cancel = el("button", { class: "rui-confirm-cancel", type: "button", disabled: loading }, [asString(props.cancelLabel, "Cancel")]) as HTMLButtonElement;
    cancel.onclick = cancelAndDismiss;
    const confirm = el("button", {
      class: "rui-confirm-ok",
      type: "button",
      "data-tone": tone,
      disabled: confirmBlocked,
      "aria-busy": loading ? "true" : null,
    }) as HTMLButtonElement;
    if (loading) {
      confirm.append(el("span", { class: "rui-spinner", "data-size": "sm", "aria-hidden": "true" }, [
        el("span", { class: "rui-spinner-ring" }),
      ]));
    }
    confirm.append(el("span", {}, [asString(props.confirmLabel, "Confirm")]));
    confirm.onclick = () => {
      if (confirmBlocked) return;
      helpers.invoke(props.onConfirm);
      if (!managed) dismiss();
    };
    actions.append(cancel, confirm);
    card.append(actions);
    root.append(backdrop, card);
    // Escape = cancel; Tab cycles between Cancel/Confirm; focus restores on close.
    root.onkeydown = dialogKeydownHandler(".rui-confirm-card", () => cancelAndDismiss());
    wireDialogFocus(root, ".rui-confirm-card", helpers);
    wireOverlayLayer(root, helpers, OVERLAY_FILL, "rui-confirm-layer");
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Social / content (Part VIII.3/4)
 * ----------------------------------------------------------------------- */

/**
 * Swap a dead avatar image for initials. `<img onerror>` is the only signal a
 * 404 gives us, and the live element has to come from the event — the closure's
 * node is a discarded snapshot after the first reconcile.
 */
function wireAvatarFallback(img: HTMLElement, name: string, fallbackClass: string): void {
  // (`onerror`'s first argument is typed `Event | string` because the
  // window-level handler also fires from script errors — for an `<img>` it is
  // always an Event.)
  img.onerror = (event) => {
    const ev = event as Event;
    const live = (ev.currentTarget ?? ev.target) as Element | null;
    live?.replaceWith(el("span", { class: fallbackClass }, [initialsFor(name)]));
  };
}

export const PresenceAvatars: ComponentSpec = {
  name: "PresenceAvatars",
  description:
    "An overlapping stack of avatars with online status dots — 'who's here' " +
    "for collab/social. Pass `people` as {name, src?, online?}. `onClick` " +
    "makes each avatar activatable (receives the person object).",
  props: [
    { name: "people", type: "object[]", positional: true, required: true, aliases: ["users", "children"] },
    { name: "max", type: "number", optional: true, description: "Max avatars before a +N chip (default 5)" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "onClick", type: "callable", optional: true, aliases: ["onPersonClick", "onclick"], description: "Fires with the clicked person object" },
  ],
  render: (_node, props, helpers) => {
    const people = asArray<unknown>(props.people);
    const max = Math.max(1, Math.round(asNumber(props.max, 5)));
    const size = asString(props.size, "md");
    const shown = people.slice(0, max);
    const online = people.filter((raw) => asBoolean((raw as { online?: unknown } | null)?.online)).length;
    // Without a name and a role the roster — the component's entire purpose —
    // is conveyed to sighted users only: the status dot is a CSS pseudo-element
    // carrying no text.
    const root = el("div", {
      class: "rui-presence",
      "data-size": size,
      role: "group",
      "aria-label": `${online} of ${people.length} people online`,
    });
    const clickable = props.onClick != null;
    shown.forEach((raw) => {
      const p = (raw ?? {}) as { name?: unknown; src?: unknown; online?: unknown };
      const name = asString(p.name);
      const isOnline = asBoolean(p.online);
      const status = isOnline ? "online" : "offline";
      const av = el(clickable ? "button" : "div", {
        class: "rui-presence-avatar",
        type: clickable ? "button" : null,
        "data-online": isOnline ? "true" : null,
        title: name,
        role: clickable ? null : "img",
        "aria-label": name ? `${name} (${status})` : status,
      });
      if (clickable) (av as HTMLButtonElement).onclick = () => helpers.invoke(props.onClick, raw);
      const src = sanitiseImageSrc(p.src);
      if (src) {
        const img = el("img", { src, alt: "" });
        wireAvatarFallback(img, name, "rui-presence-initials");
        av.append(img);
      } else {
        av.append(el("span", { class: "rui-presence-initials" }, [initialsFor(name)]));
      }
      root.append(av);
    });
    if (people.length > max) {
      const rest = people.length - max;
      root.append(el("div", {
        class: "rui-presence-more",
        role: "img",
        "aria-label": `${rest} more`,
      }, [`+${rest}`]));
    }
    return root;
  },
};

const SHARE_NETWORKS = ["twitter", "facebook", "linkedin", "reddit", "email", "whatsapp", "telegram", "mastodon", "copy"] as const;

/** Pending "Copied" revert timers, keyed by the live button. */
const SHARE_COPY_TIMERS: WeakMap<HTMLElement, ReturnType<typeof setTimeout>> = new WeakMap();

/** The copy button's transient result state; `null` is the idle glyph. */
type ShareCopyState = "copied" | "failed" | null;

const shareCopyLabel = (state: ShareCopyState): string =>
  state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy link";

const shareCopyStatus = (state: ShareCopyState): string =>
  state === "copied" ? "Link copied" : state === "failed" ? "Could not copy link" : "";

let warnedShareUrl = false;
let warnedShareNetwork = false;

export const ShareButtons: ComponentSpec = {
  name: "ShareButtons",
  description:
    "A row of social share buttons (twitter|facebook|linkedin|reddit|email|" +
    "whatsapp|telegram|mastodon) plus a copy-link button, for the given " +
    "`url`/`title`. `showLabels` renders text beside each icon.",
  props: [
    { name: "url", type: "string", positional: true, required: true },
    { name: "title", type: "string", optional: true },
    {
      name: "networks",
      type: "string[]",
      optional: true,
      enum: SHARE_NETWORKS,
      description: "Which to show (default twitter, facebook, linkedin, copy)",
    },
    { name: "showLabels", type: "boolean", optional: true, description: "Show a visible label beside each icon" },
  ],
  render: (_node, props, helpers) => {
    const url = sanitiseHref(props.url, "");
    const title = asString(props.title);
    const showLabels = asBoolean(props.showLabels);
    const root = el("div", { class: "rui-share", "data-labels": showLabels ? "true" : null });
    // An unsafe url (`javascript:`, `data:`, protocol-relative) collapses to "",
    // and rendering live share links that share nothing is worse than
    // rendering nothing at all.
    if (!url) {
      if (!warnedShareUrl && asString(props.url)) {
        warnedShareUrl = true;
        // eslint-disable-next-line no-console
        console.warn("[aktion] ShareButtons: unsafe `url` rejected — nothing to share.");
      }
      return root;
    }
    const eu = encodeURIComponent(url), et = encodeURIComponent(title);
    const requested = asArray<unknown>(props.networks).map((n) => asString(n).toLowerCase());
    const targets: Record<string, { icon: string; href: string; label: string }> = {
      twitter: { icon: "brands:x-twitter", href: `https://twitter.com/intent/tweet?url=${eu}&text=${et}`, label: "X" },
      facebook: { icon: "brands:facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${eu}`, label: "Facebook" },
      linkedin: { icon: "brands:linkedin", href: `https://www.linkedin.com/sharing/share-offsite/?url=${eu}`, label: "LinkedIn" },
      reddit: { icon: "brands:reddit", href: `https://www.reddit.com/submit?url=${eu}&title=${et}`, label: "Reddit" },
      email: { icon: "envelope", href: `mailto:?subject=${et}&body=${eu}`, label: "Email" },
      whatsapp: { icon: "brands:whatsapp", href: `https://api.whatsapp.com/send?text=${et}%20${eu}`, label: "WhatsApp" },
      telegram: { icon: "brands:telegram", href: `https://t.me/share/url?url=${eu}&text=${et}`, label: "Telegram" },
      mastodon: { icon: "brands:mastodon", href: `https://mastodon.social/share?text=${et}%20${eu}`, label: "Mastodon" },
    };
    const known = requested.filter((n) => n === "copy" || targets[n]);
    if (requested.length > 0 && known.length < requested.length && !warnedShareNetwork) {
      warnedShareNetwork = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[aktion] ShareButtons: unknown network(s) ${requested.filter((n) => !known.includes(n)).join(", ")}. ` +
        `Known: ${SHARE_NETWORKS.join(", ")}.`,
      );
    }
    const list = known.length > 0 ? known : ["twitter", "facebook", "linkedin", "copy"];
    // The copy result lives in instance state so the RENDER can re-assert it:
    // `syncAttributes` strips a `data-state` the fresh tree omits and restores
    // the link glyph, so any unrelated re-render inside the 2s window used to
    // wipe the confirmation. The imperative paint below is now only the
    // optimisation that skips waiting for a commit.
    const copySlot = helpers.useInstanceState<ShareCopyState>("rui-share-copy", null);
    const copyState = copySlot.get();
    // Announce the copy result — the previous handler gave no feedback at all
    // and its synchronous `try` could not catch `writeText`'s rejection, so a
    // denied clipboard surfaced as an unhandled rejection.
    const live = el("span", { class: "rui-visually-hidden", role: "status", "aria-live": "polite" }, [
      shareCopyStatus(copyState),
    ]);
    for (const net of list) {
      if (net === "copy") {
        const btn = el("button", {
          class: "rui-share-btn",
          type: "button",
          "aria-label": "Copy link",
          title: "Copy link",
          "data-state": copyState,
        }) as HTMLButtonElement;
        const ic = renderIcon(copyState === "copied" ? "check" : "link"); if (ic) btn.append(ic);
        if (showLabels) btn.append(el("span", { class: "rui-share-label" }, [shareCopyLabel(copyState)]));
        btn.onclick = (event: Event) => {
          const target = ((event.currentTarget ?? event.target) as HTMLElement | null) ?? btn;
          const status = target.closest(".rui-share")?.querySelector("[role='status']") ?? null;
          const paint = (state: ShareCopyState): void => {
            copySlot.set(state);
            if (state) target.setAttribute("data-state", state);
            else target.removeAttribute("data-state");
            const next = renderIcon(state === "copied" ? "check" : "link");
            const current = target.querySelector(".rui-icon");
            if (next && current) current.replaceWith(next);
            const labelEl = target.querySelector(".rui-share-label");
            if (labelEl) labelEl.textContent = shareCopyLabel(state);
            if (status) status.textContent = shareCopyStatus(state);
          };
          const settle = (state: "copied" | "failed"): void => {
            paint(state);
            const prior = SHARE_COPY_TIMERS.get(target);
            if (prior) clearTimeout(prior);
            SHARE_COPY_TIMERS.set(target, setTimeout(() => {
              SHARE_COPY_TIMERS.delete(target);
              paint(null);
            }, 2000));
          };
          try {
            const written = navigator.clipboard?.writeText(url);
            if (written && typeof written.then === "function") {
              written.then(() => settle("copied")).catch(() => settle("failed"));
            } else {
              settle(navigator.clipboard ? "copied" : "failed");
            }
          } catch { settle("failed"); }
        };
        root.append(btn);
        continue;
      }
      const t = targets[net]!;
      const a = el("a", { class: "rui-share-btn", href: t.href, target: "_blank", rel: "noopener noreferrer", "aria-label": `Share on ${t.label}` });
      const ic = renderIcon(t.icon); if (ic) a.append(ic);
      if (showLabels) a.append(el("span", { class: "rui-share-label" }, [`Share on ${t.label}`]));
      root.append(a);
    }
    if (list.includes("copy")) root.append(live);
    return root;
  },
};

export const AuthorByline: ComponentSpec = {
  name: "AuthorByline",
  description:
    "An author byline: avatar, name, optional role, date and reading time — " +
    "for articles/blog posts. `href` links the name to the author's page; " +
    "`date` is emitted as a machine-readable <time>.",
  props: [
    { name: "name", type: "string", positional: true, required: true },
    { name: "avatar", type: "string", optional: true, aliases: ["src"] },
    { name: "role", type: "string", optional: true },
    { name: "date", type: "string", optional: true, description: "Display string or ISO date" },
    { name: "href", type: "string", optional: true, description: "Link target for the author name" },
    { name: "readingTime", type: "string", optional: true, description: "e.g. \"8 min read\"" },
  ],
  render: (_node, props) => {
    const name = asString(props.name);
    const root = el("div", { class: "rui-byline" });
    const src = sanitiseImageSrc(props.avatar);
    const av = el("div", { class: "rui-byline-avatar" });
    if (src) {
      const img = el("img", { src, alt: "" });
      wireAvatarFallback(img, name, "rui-byline-initials");
      av.append(img);
    } else {
      av.append(el("span", { class: "rui-byline-initials" }, [initialsFor(name)]));
    }
    root.append(av);
    const meta = el("div", { class: "rui-byline-meta" });
    const href = sanitiseHref(props.href, "");
    const nameRow = el("div", { class: "rui-byline-name" });
    nameRow.append(href ? el("a", { href, rel: "author" }, [name]) : document.createTextNode(name));
    meta.append(nameRow);
    const dateText = asString(props.date);
    const parsed = dateText ? new Date(dateText) : null;
    const iso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
    const bits: Node[] = [];
    const role = asString(props.role);
    if (role) bits.push(el("span", { class: "rui-byline-role" }, [role]));
    // `<time datetime>` is what article tooling reads; a joined string told
    // assistive tech nothing about which half was the publication date.
    if (dateText) bits.push(el("time", { datetime: iso || null }, [dateText]));
    const reading = asString(props.readingTime);
    if (reading) bits.push(el("span", { class: "rui-byline-reading" }, [reading]));
    if (bits.length > 0) {
      const sub = el("div", { class: "rui-byline-sub" });
      bits.forEach((bit, i) => {
        if (i > 0) sub.append(el("span", { class: "rui-byline-dot", "aria-hidden": "true" }, [" · "]));
        sub.append(bit);
      });
      meta.append(sub);
    }
    root.append(meta);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * E-commerce extras (Part VIII.2)
 * ----------------------------------------------------------------------- */

export const VariantSelector: ComponentSpec = {
  name: "VariantSelector",
  description:
    "Product variant picker — color swatches or size pills. `options` is an " +
    "array of strings or {label, value, color?, disabled?}. Bind `value` to a " +
    "$variable; `onChange(value)` fires on select. `multiple: true` toggles a " +
    "set and binds an array. Arrow keys move between options.",
  props: [
    { name: "options", type: "any[]", positional: true, required: true, aliases: ["items"] },
    { name: "value", type: "string | string[]", optional: true },
    { name: "kind", type: "string", optional: true, enum: ["pill", "swatch"] },
    { name: "label", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"] },
    { name: "disabled", type: "boolean", optional: true, description: "Disable the whole group" },
    { name: "multiple", type: "boolean", optional: true, description: "Multi-select (binds an array of values)" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md"] },
  ],
  render: (node, props, helpers) => {
    const kind = asString(props.kind, "pill");
    const multiple = asBoolean(props.multiple);
    const groupDisabled = asBoolean(props.disabled);
    const label = asString(props.label);
    const labelId = instanceId(helpers, "rui-variants-label-id", "rui-variants-label");
    const root = el("div", {
      class: "rui-variants",
      "data-kind": kind,
      "data-size": canonicalSizeToken(asString(props.size, "md")),
      // A bare row of toggle buttons announces N isolated "pressed" states with
      // no group name and no position; a radiogroup announces "3 of 12, Colour".
      role: multiple ? "group" : "radiogroup",
      "aria-labelledby": label ? labelId : null,
      "aria-disabled": groupDisabled ? "true" : null,
    });
    if (label) root.append(el("div", { class: "rui-variants-label", id: labelId }, [label]));
    const row = el("div", { class: "rui-variants-row" });
    const selection = multiple
      ? asArray<unknown>(props.value).map((v) => asString(v))
      : [asString(props.value)];
    // The `value` slot, by declaration order — `.find((m) => m?.stateRef)`
    // returned `options` and replaced the author's array with the picked string.
    const ref = node.argMeta?.[1]?.stateRef;
    let firstEnabled: HTMLButtonElement | null = null;
    let hasSelected = false;
    for (const raw of asArray<unknown>(props.options)) {
      const opt = (raw && typeof raw === "object")
        ? raw as { label?: unknown; value?: unknown; color?: unknown; disabled?: unknown }
        : { label: raw, value: raw };
      const value = asString(opt.value ?? opt.label);
      const text = asString(opt.label ?? opt.value);
      const selected = selection.includes(value);
      const disabled = groupDisabled || asBoolean(opt.disabled);
      if (selected) hasSelected = true;
      const btn = el("button", {
        class: "rui-variant",
        type: "button",
        role: multiple ? null : "radio",
        "aria-pressed": multiple ? (selected ? "true" : "false") : null,
        "aria-checked": multiple ? null : (selected ? "true" : "false"),
        "data-selected": selected ? "true" : null,
        disabled,
        "aria-label": kind === "swatch" ? text : null,
        // Roving tabindex: one tab stop for the whole group.
        tabindex: disabled ? null : (selected ? "0" : "-1"),
      }) as HTMLButtonElement;
      if (kind === "swatch") {
        const colour = sanitiseCssColor(opt.color ?? opt.value);
        btn.style.background = colour || "var(--rui-color-surface-muted)";
        btn.title = text;
        // Selection must not be colour-only: two similar swatches are
        // indistinguishable by ring alone.
        if (selected) {
          const tick = renderIcon("check", { className: "rui-variant-check" });
          if (tick) btn.append(tick);
        }
      } else {
        btn.textContent = text;
      }
      if (!disabled && !firstEnabled) firstEnabled = btn;
      btn.onclick = () => {
        if (disabled) return;
        const next = multiple
          ? (selection.includes(value) ? selection.filter((v) => v !== value) : [...selection, value])
          : value;
        if (ref) helpers.setState(ref, next);
        helpers.invoke(props.onChange, next);
      };
      row.append(btn);
    }
    // Nothing selected yet: the group still needs exactly one tab stop.
    if (!hasSelected && firstEnabled) firstEnabled.setAttribute("tabindex", "0");
    row.onkeydown = (event: KeyboardEvent) => {
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
      const items = Array.from(origin?.querySelectorAll<HTMLButtonElement>(".rui-variant:not([disabled])") ?? []);
      if (items.length === 0) return;
      const active = (origin?.getRootNode() as ShadowRoot | Document | null)?.activeElement ?? null;
      const at = items.findIndex((b) => b === active);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? (at <= 0 ? items.length - 1 : at - 1)
            : (at < 0 || at === items.length - 1 ? 0 : at + 1);
      event.preventDefault();
      items.forEach((b) => b.setAttribute("tabindex", "-1"));
      const target = items[next]!;
      target.setAttribute("tabindex", "0");
      target.focus();
    };
    root.append(row);
    return root;
  },
};

/**
 * Format a money value.
 *
 * A three-letter code goes through `Intl.NumberFormat` currency formatting
 * (grouping, minor units, and the locale's symbol placement — `1.234,50 €`);
 * anything else is treated as a prefix symbol over a plain 2-decimal number.
 * Values that are not numbers at all ("Free", "TBD", an already-formatted
 * string) pass through untouched.
 */
function moneyFormatter(currency: string, locale: string): (value: unknown) => string {
  const iso = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "";
  let fmt: Intl.NumberFormat | null = null;
  try {
    fmt = new Intl.NumberFormat(locale || undefined, iso
      ? { style: "currency", currency: iso }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch { fmt = null; }
  return (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const raw = asString(value).trim();
    if (!raw) return "";
    const n = typeof value === "number" ? value : Number(raw);
    if (!Number.isFinite(n)) return raw;
    if (!fmt) return iso ? `${iso} ${n.toFixed(2)}` : `${currency}${n.toFixed(2)}`;
    return iso ? fmt.format(n) : `${currency}${fmt.format(n)}`;
  };
}

export const OrderSummary: ComponentSpec = {
  name: "OrderSummary",
  description:
    "An order/cart summary: line items, subtotal, discount, shipping, tax, " +
    "and a bold total. Pass `items` as {label, amount, qty?} and the named " +
    "totals. `currency` takes an ISO code (\"EUR\" — properly localised via " +
    "`locale`) or a bare symbol prefix. `loading` shows placeholders while an " +
    "async shipping/tax quote resolves.",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, aliases: ["lines"] },
    { name: "subtotal", type: "string | number", optional: true },
    { name: "shipping", type: "string | number", optional: true },
    { name: "tax", type: "string | number", optional: true },
    { name: "total", type: "string | number", optional: true },
    { name: "currency", type: "string", optional: true, description: "ISO code (\"USD\") or a symbol prefix (default \"$\")" },
    { name: "discount", type: "string | number", optional: true, description: "Coupon/promo line, shown after the subtotal" },
    { name: "locale", type: "string", optional: true, description: "BCP-47 tag for number formatting (default: the browser's)" },
    { name: "loading", type: "boolean", optional: true, description: "Show placeholders for the named totals" },
    { name: "note", type: "string", optional: true, description: "Fine print under the total ('Taxes calculated at checkout')" },
    { name: "empty", type: "string", optional: true, description: "Message when `items` is empty" },
  ],
  render: (_node, props) => {
    const cur = asString(props.currency, "$");
    const money = moneyFormatter(cur, asString(props.locale));
    const loading = asBoolean(props.loading);
    const root = el("div", { class: "rui-order-summary", "data-loading": loading ? "true" : null });
    const items = asArray<unknown>(props.items);
    if (items.length > 0) {
      const lines = el("div", { class: "rui-order-lines" });
      for (const raw of items) {
        const it = (raw ?? {}) as { label?: unknown; amount?: unknown; qty?: unknown; quantity?: unknown };
        const line = el("div", { class: "rui-order-line" });
        const labelCell = el("span", {}, [asString(it.label)]);
        const qty = asNumber(it.qty ?? it.quantity, 0);
        if (qty > 0) labelCell.append(el("span", { class: "rui-order-qty" }, [` ×${qty}`]));
        line.append(labelCell, el("span", {}, [money(it.amount)]));
        lines.append(line);
      }
      root.append(lines);
    } else {
      // The `.rui-order-lines` wrapper carries a permanent bottom rule, so an
      // empty cart used to render a bordered box containing one orphaned line.
      const empty = asString(props.empty, "Your cart is empty");
      if (empty) root.append(el("div", { class: "rui-order-empty" }, [empty]));
    }
    // `quote` rows are the ones an async shipping/tax quote fills in, so while
    // `loading` they render a placeholder instead of silently popping into
    // existence later with no hint that the total was provisional.
    const row = (label: string, v: unknown, opts: { strong?: boolean; quote?: boolean } = {}) => {
      const missing = v === null || v === undefined || asString(v) === "";
      if (missing && !(loading && opts.quote !== false)) return;
      const r = el("div", { class: opts.strong ? "rui-order-total" : "rui-order-sub" });
      const amount = missing
        // `.rui-skeleton-line` is a gradient with no intrinsic box, so the
        // placeholder has to carry its own dimensions (as every other skeleton
        // in the library does) or it collapses to 0×0 and shows nothing.
        ? el("span", {
          class: "rui-skeleton-line rui-order-skeleton",
          style: "width:64px;height:12px;flex:none",
          "aria-hidden": "true",
        })
        : el("span", {}, [money(v)]);
      r.append(el("span", {}, [label]), amount);
      root.append(r);
    };
    row("Subtotal", props.subtotal);
    row("Discount", props.discount, { quote: false });
    row("Shipping", props.shipping);
    row("Tax", props.tax);
    row("Total", props.total, { strong: true });
    const note = asString(props.note);
    if (note) root.append(el("div", { class: "rui-order-note" }, [note]));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Utility (Part VIII.8)
 * ----------------------------------------------------------------------- */

export const ScrollSpy: ComponentSpec = {
  name: "ScrollSpy",
  description:
    "A sticky in-page nav that highlights the section currently in view. " +
    "`sections` is an array of {label, id} matching element ids on the page " +
    "(set via the universal `id` prop). Clicking smooth-scrolls to a section; " +
    "`offset` clears a sticky header and `top` sets the sticky offset.",
  props: [
    { name: "sections", type: "object[]", positional: true, required: true, aliases: ["items"] },
    { name: "title", type: "string", optional: true },
    { name: "offset", type: "number", optional: true, description: "Pixels to leave above the target (sticky header height)" },
    { name: "top", type: "string", optional: true, description: "Sticky offset from the viewport top (default 16px)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Fires with the id of the section entering view" },
  ],
  render: (_node, props, helpers) => {
    const offset = Math.max(0, Math.round(asNumber(props.offset, 0)));
    const top = sanitiseCssLength(props.top, "");
    // The highlight lives in instance state, not in a `classList` mutation the
    // next reconcile strips — an unrelated re-render used to blank it until the
    // user crossed another section boundary.
    const activeSlot = helpers.useInstanceState<string>("rui-scrollspy-active", "");
    const root = el("nav", {
      class: "rui-scrollspy",
      "aria-label": "On this page",
      style: top ? `--rui-scrollspy-top:${top}` : null,
    });
    const title = asString(props.title);
    if (title) root.append(el("div", { class: "rui-scrollspy-title" }, [title]));
    const list = el("ul", { class: "rui-scrollspy-list" });
    const sections = asArray<unknown>(props.sections).map((raw) => {
      const s = (raw ?? {}) as { label?: unknown; id?: unknown };
      return { label: asString(s.label), id: asString(s.id).replace(/[^A-Za-z0-9_-]/g, "") };
    }).filter((s) => s.id);
    const active = activeSlot.get();
    for (const s of sections) {
      const li = el("li", { class: "rui-scrollspy-item" });
      const isActive = s.id === active;
      const a = el("a", {
        href: `#${s.id}`,
        class: isActive ? "is-active" : null,
        "aria-current": isActive ? "location" : null,
      }, [s.label]);
      a.onclick = (event) => {
        event.preventDefault();
        const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
        const sr = origin?.getRootNode() as ShadowRoot | Document | null;
        const target = (sr as ShadowRoot | null)?.getElementById?.(s.id) ?? document.getElementById(s.id);
        if (!target) return;
        // `scrollIntoView({block: "start"})` parks the heading underneath any
        // sticky header, and we cannot set `scroll-margin-top` on an element we
        // do not own — so scroll by measurement when an offset is given.
        if (offset > 0 && typeof window !== "undefined" && typeof window.scrollTo === "function") {
          const y = target.getBoundingClientRect().top + (window.scrollY || 0) - offset;
          window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
        } else {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      li.append(a);
      list.append(li);
    }
    root.append(list);
    if (typeof IntersectionObserver !== "undefined" && sections.length > 0) {
      onceMounted(root, helpers, "rui-scrollspy-io", (live) => {
        const sr = live.getRootNode() as ShadowRoot | Document;
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const id = (e.target as HTMLElement).id;
            if (id === activeSlot.get()) continue;
            activeSlot.set(id);
            // Paint the live anchors now; the render emits the same class and
            // `aria-current` from the slot, so the next reconcile keeps it.
            for (const link of live.querySelectorAll<HTMLElement>(".rui-scrollspy-item a")) {
              const on = link.getAttribute("href") === `#${id}`;
              link.classList.toggle("is-active", on);
              if (on) link.setAttribute("aria-current", "location");
              else link.removeAttribute("aria-current");
            }
            helpers.invoke(props.onChange, id);
          }
        }, { rootMargin: `-${offset}px 0px -70% 0px`, threshold: 0 });
        for (const s of sections) {
          const target = (sr as ShadowRoot).getElementById?.(s.id) ?? document.getElementById(s.id);
          if (target) io.observe(target);
        }
        helpers.registerDisposer(() => io.disconnect(), "rui-scrollspy-io");
      });
    }
    return root;
  },
};

const DIAL_POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;

/** Corner offsets mirroring `.rui-speeddial`'s CSS, for the promoted overlay. */
const DIAL_INSETS: Record<string, string> = {
  "bottom-right": "top:auto;left:auto;bottom:24px;right:24px",
  "bottom-left": "top:auto;right:auto;bottom:24px;left:24px",
  "top-right": "bottom:auto;left:auto;top:24px;right:24px",
  "top-left": "bottom:auto;right:auto;top:24px;left:24px",
};

export const SpeedDial: ComponentSpec = {
  name: "SpeedDial",
  description:
    "A floating action button that expands a stack of mini-actions on click. " +
    "Pass `actions` as {icon, label, onClick} (`action` is accepted as a " +
    "synonym for `onClick`). Bind `open` to control it from outside; " +
    "`position` picks the corner. Outside-click and Escape close it.",
  props: [
    { name: "actions", type: "object[]", positional: true, required: true, aliases: ["items"] },
    { name: "icon", type: "string", optional: true, description: "Main FAB icon (default 'plus')" },
    { name: "open", type: "boolean", optional: true, description: "Expanded state — usually a $variable" },
    { name: "onOpenChange", type: "callable", optional: true, description: "Fires with the new expanded state" },
    { name: "position", type: "string", optional: true, enum: DIAL_POSITIONS },
    { name: "label", type: "string", optional: true, description: "Accessible name for the FAB (default 'Actions')" },
  ],
  render: (node, props, helpers) => {
    // Open state used to live in a `classList` mutation, which `syncAttributes`
    // overwrites from the fresh render — the dial snapped shut under the cursor
    // on any unrelated re-render.
    const openSlot = helpers.useInstanceState<boolean>("rui-speeddial-open", false);
    const stateRef = node.argMeta?.[2]?.stateRef; // `open`, by declaration order
    const open = props.open === undefined ? openSlot.get() : asBoolean(props.open);
    const iconName = asString(props.icon, "plus");
    const position = DIAL_POSITIONS.includes(asString(props.position) as typeof DIAL_POSITIONS[number])
      ? asString(props.position)
      : "bottom-right";
    const root = el("div", {
      class: open ? "rui-speeddial is-open" : "rui-speeddial",
      "data-position": position,
      // Lets the theme restrict the 45° FAB rotation to the default plus glyph.
      "data-icon": iconName,
    });
    const menu = el("div", {
      class: "rui-speeddial-menu",
      role: "menu",
      // `opacity: 0; pointer-events: none` hides the closed menu from the mouse
      // only: the actions stayed in the tab order and a keyboard user could fire
      // 'Delete all' on an invisible button.
      inert: open ? null : true,
      "aria-hidden": open ? null : "true",
    });
    const paint = (live: HTMLElement, next: boolean): void => {
      live.classList.toggle("is-open", next);
      live.querySelector(".rui-speeddial-fab")?.setAttribute("aria-expanded", next ? "true" : "false");
      const m = live.querySelector<HTMLElement>(".rui-speeddial-menu");
      if (!m) return;
      if (next) { m.removeAttribute("inert"); m.removeAttribute("aria-hidden"); }
      else { m.setAttribute("inert", ""); m.setAttribute("aria-hidden", "true"); }
      m.querySelectorAll<HTMLElement>(".rui-speeddial-action")
        .forEach((b) => b.setAttribute("tabindex", next ? "0" : "-1"));
    };
    const setOpen = (live: HTMLElement, next: boolean): void => {
      openSlot.set(next);
      paint(live, next);
      if (next) {
        installDismissListeners({ liveRoot: live, onDismiss: () => setOpen(live, false), key: "rui-speeddial" });
      } else {
        disposeDismissListeners(live);
      }
      if (stateRef) helpers.setState(stateRef, next);
      helpers.invoke(props.onOpenChange, next);
    };
    for (const raw of asArray<unknown>(props.actions)) {
      const a = (raw ?? {}) as { icon?: unknown; label?: unknown; onClick?: unknown; action?: unknown };
      const btn = el("button", {
        class: "rui-speeddial-action",
        type: "button",
        role: "menuitem",
        title: asString(a.label),
        "aria-label": asString(a.label),
        tabindex: open ? "0" : "-1",
      }) as HTMLButtonElement;
      const ic = renderIcon(a.icon ?? "circle"); if (ic) btn.append(ic);
      // Resolve the live root via `currentTarget` — the closure's `root` is
      // detached once the morph reconciler keeps a prior render's DOM.
      btn.onclick = (event: Event) => {
        helpers.invoke(a.onClick ?? a.action);
        const live = ((event.currentTarget ?? event.target) as HTMLElement | null)?.closest(".rui-speeddial") as HTMLElement | null;
        if (live) setOpen(live, false);
      };
      menu.append(btn);
    }
    root.append(menu);
    const fab = el("button", {
      class: "rui-speeddial-fab",
      type: "button",
      "aria-label": asString(props.label, "Actions"),
      "aria-haspopup": "true",
      "aria-expanded": open ? "true" : "false",
    }) as HTMLButtonElement;
    const ic = renderIcon(iconName, { size: "lg" }); if (ic) fab.append(ic);
    fab.onclick = (event: Event) => {
      const liveFab = ((event.currentTarget ?? event.target) as HTMLElement | null) ?? fab;
      const live = (liveFab.closest(".rui-speeddial") as HTMLElement | null) ?? root;
      setOpen(live, !live.classList.contains("is-open"));
    };
    root.append(fab);
    root.onkeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const live = (event.currentTarget ?? event.target) as HTMLElement | null;
      if (!live || !live.classList.contains("is-open")) return;
      event.stopPropagation();
      setOpen(live, false);
      live.querySelector<HTMLElement>(".rui-speeddial-fab")?.focus();
    };
    // A corner-pinned `fixed` FAB is un-fixed by any transformed / glass
    // ancestor, so it lands mid-page instead of in the viewport corner.
    onceMounted(root, helpers, "rui-speeddial-layer", (live) => {
      promoteOverlay(live, `${OVERLAY_CORNER};${DIAL_INSETS[position] ?? DIAL_INSETS["bottom-right"]!}`);
      helpers.registerDisposer(() => {
        disposeDismissListeners(live);
        releaseOverlay(live);
      }, "rui-speeddial-layer");
    });
    return root;
  },
};

/** Theme-token palette with literal fallbacks so a missing token still paints. */
const CONFETTI_COLORS = [
  "var(--rui-color-primary, #6366f1)",
  "var(--rui-color-accent, #8b5cf6)",
  "var(--rui-color-danger, #ec4899)",
  "var(--rui-color-info, #22d3ee)",
  "var(--rui-color-success, #10b981)",
  "var(--rui-color-warning, #f59e0b)",
];

interface BurstOptions { count: number; colors: string[]; duration: number }

/** Build one burst of pieces into `target`. Returns the burst's total run time. */
function burst(target: HTMLElement, opts: BurstOptions): number {
  let longest = 0;
  for (let i = 0; i < opts.count; i += 1) {
    const left = Math.round((i * 53 + 7) % 100);
    const delay = ((i * 17) % 50) / 100;
    const dur = opts.duration * (0.7 + ((i * 7) % 10) / 30);
    const color = opts.colors[i % opts.colors.length]!;
    const rot = (i * 47) % 360;
    longest = Math.max(longest, delay + dur);
    const piece = el("span", {
      class: "rui-confetti-piece",
      // The rotation goes through a custom property: an inline `transform` is
      // dead code against keyframes that declare `transform` at 0% and 100%,
      // so every piece span in lockstep.
      style: `left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;--rot:${rot}deg`,
    });
    // Each piece removes itself when its fall finishes, so a replayed burst
    // never accumulates DOM (morph-safe — the handler resolves the live node
    // from the event, and the root is `data-rui-preserve` so the reconciler
    // never re-adds the removed pieces).
    piece.onanimationend = (event: Event) => {
      ((event.currentTarget ?? event.target) as HTMLElement | null)?.remove();
    };
    target.append(piece);
  }
  return longest;
}

export const Confetti: ComponentSpec = {
  name: "Confetti",
  description:
    "A one-shot confetti burst — celebration affordance after a success " +
    "(checkout, completion). Renders a short CSS particle animation each time " +
    "`fire` becomes true, once per transition. `colors`/`duration` tune the " +
    "look; `onDone` fires when the burst finishes. Honours " +
    "prefers-reduced-motion.",
  props: [
    { name: "fire", type: "boolean", optional: true, description: "Trigger the burst (default true)" },
    { name: "count", type: "number", optional: true, description: "Particle count (default 40, max 120)" },
    { name: "colors", type: "string[]", optional: true, description: "Piece colours (default: theme tokens)" },
    { name: "duration", type: "number", optional: true, description: "Fall time in seconds (default 1.5, max 10)" },
    { name: "onDone", type: "callable", optional: true, description: "Fires once the burst has finished" },
  ],
  render: (_node, props, helpers) => {
    const fire = props.fire === undefined ? true : asBoolean(props.fire);
    // `data-rui-preserve` hands the pieces to this component: the reconciler
    // would otherwise re-append a full set on every re-render (the pieces having
    // removed themselves), replaying the "one-shot" burst indefinitely.
    const root = el("div", {
      class: "rui-confetti",
      "aria-hidden": "true",
      "data-rui-preserve": "true",
      "data-fire": fire ? "true" : "false",
    });
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = (() => {
      const raw = asArray<unknown>(props.colors).map((c) => sanitiseCssColor(c)).filter(Boolean);
      return raw.length > 0 ? raw : CONFETTI_COLORS;
    })();
    const opts: BurstOptions = {
      count: Math.max(1, Math.min(120, Math.round(asNumber(props.count, 40)))),
      colors,
      duration: Math.max(0.2, Math.min(10, asNumber(props.duration, 1.5))),
    };
    const finish = (runtime: number): void => {
      if (props.onDone == null) return;
      const t = setTimeout(() => helpers.invoke(props.onDone), Math.round(runtime * 1000) + 50);
      helpers.registerDisposer(() => clearTimeout(t), "rui-confetti-done");
    };
    // Only the first render may burst from the render path — its node is the one
    // that mounts. Every later `fire` transition is driven from the live node,
    // because the reconciler discards the snapshot that would carry the pieces.
    // `fired` is "a burst has played for the current fire=true", so a transition
    // that lands before the watcher installs is still picked up.
    const primed = helpers.useInstanceState<boolean>("rui-confetti-primed", false);
    const fired = helpers.useInstanceState<boolean>("rui-confetti-fired", false);
    // Reduced motion skips the particles but still has to honour the
    // `fire` → `onDone` contract, or an author sequencing on it never advances.
    // It runs through the same state machine: gating it on a bare `if (fire)`
    // re-fired `onDone` on every unrelated re-render.
    const play = (target: HTMLElement): void => finish(reduce ? 0 : burst(target, opts));
    if (!primed.get()) {
      primed.set(true);
      if (fire) { fired.set(true); play(root); }
    }
    // `inset: 0` resolves against the nearest containing block, so a Confetti
    // inside a glass Card rained inside a ~300px box (and `translateY(105vh)`
    // clipped most pieces away immediately). The top layer restores the viewport.
    if (!reduce) {
      onceMounted(root, helpers, "rui-confetti-layer", (live) => {
        promoteOverlay(live, OVERLAY_FILL_CLIP);
        helpers.registerDisposer(() => releaseOverlay(live), "rui-confetti-layer");
      });
    }
    if (typeof MutationObserver !== "undefined") {
      onceMounted(root, helpers, "rui-confetti-watch", (live) => {
        const sync = (): void => {
          const now = live.getAttribute("data-fire") === "true";
          if (now === fired.get()) return;
          fired.set(now);
          live.replaceChildren();
          if (now) play(live);
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(live, { attributes: true, attributeFilter: ["data-fire"] });
        helpers.registerDisposer(() => observer.disconnect(), "rui-confetti-watch");
      });
    }
    return root;
  },
};

/**
 * Split a `'+'`-joined chord without eating a literal `+` key.
 *
 * `"Ctrl++"` (zoom in) used to split to `["Ctrl", "", ""]`, and `filter(Boolean)`
 * left a lone `Ctrl` cap. A `+` only separates when there is a token pending;
 * otherwise it is the key itself.
 */
function splitChord(raw: string, separator: string): string[] {
  if (separator !== "+") {
    return raw.split(separator).map((k) => k.trim()).filter(Boolean);
  }
  const out: string[] = [];
  let buf = "";
  for (const ch of raw) {
    if (ch !== "+") { buf += ch; continue; }
    if (buf.trim()) { out.push(buf.trim()); buf = ""; continue; }
    out.push("+");
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export const KbdShortcut: ComponentSpec = {
  name: "KbdShortcut",
  description:
    "Render a keyboard shortcut as styled key caps — the multi-key form of " +
    "`Kbd`, sharing its markup and size scale. Pass `keys` as an array (e.g. " +
    "[\"Cmd\", \"K\"]) or a '+'-joined string; `separator` changes the joiner " +
    "(\"\" for the compact ⌘K style, \" then \" for sequential chords).",
  props: [
    { name: "keys", type: "string | string[]", positional: true, required: true },
    { name: "size", type: "string", optional: true, enum: ["sm", "md"] },
    { name: "separator", type: "string", optional: true, description: "Joiner between caps (default \"+\")" },
  ],
  render: (_node, props) => {
    const raw = props.keys;
    const separator = props.separator === undefined ? "+" : asString(props.separator);
    const keys = Array.isArray(raw)
      ? raw.map((k) => asString(k)).filter(Boolean)
      : splitChord(asString(raw), separator || "+");
    // Same class set as `Kbd` so one shortcut cannot render two different ways
    // depending on which component the author reached for.
    const root = el("span", {
      class: "rui-kbd-group rui-kbd-shortcut",
      "data-size": canonicalSizeToken(asString(props.size, "md")),
    });
    keys.forEach((k, i) => {
      if (i > 0 && separator) root.append(el("span", { class: "rui-kbd-sep rui-kbd-plus" }, [separator]));
      root.append(el("kbd", { class: "rui-kbd rui-kbd-key" }, [k]));
    });
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Lottie — vector animation player (III.8)
 * ----------------------------------------------------------------------- */

interface LottieAnimation {
  destroy?: () => void;
  setSpeed?: (n: number) => void;
  play?: () => void;
  pause?: () => void;
  addEventListener?: (name: string, cb: () => void) => void;
}

interface LottieGlobal {
  loadAnimation: (params: Record<string, unknown>) => LottieAnimation;
}

const readLottie = (): LottieGlobal | null =>
  (typeof window !== "undefined" ? (window as unknown as { lottie?: LottieGlobal }).lottie ?? null : null);

export const Lottie: ComponentSpec = {
  name: "Lottie",
  description:
    "Plays a Lottie/Bodymovin vector animation from `src` (a .json URL) or " +
    "inline `data`. Uses the `lottie-web` library when it is present on the " +
    "page (`window.lottie`), waiting briefly for a deferred script; otherwise " +
    "shows the `fallback` (or a poster image) so the layout never breaks. " +
    "`loop`/`autoplay` default true; `playing` pauses/resumes, `speed` scales " +
    "playback, `onComplete`/`onError` report the outcome. No dependency is " +
    "bundled.",
  props: [
    { name: "src", type: "string", optional: true, description: "URL to a Lottie JSON file" },
    { name: "data", type: "object", optional: true, description: "Inline Lottie animation data" },
    { name: "loop", type: "boolean", optional: true },
    { name: "autoplay", type: "boolean", optional: true },
    { name: "speed", type: "number", optional: true, description: "Playback rate, clamped to 0.1–10" },
    { name: "width", type: "string", optional: true },
    { name: "height", type: "string", optional: true },
    { name: "poster", type: "string", optional: true, description: "Image shown when lottie-web is unavailable" },
    { name: "fallback", type: "Node", optional: true, description: "Node shown when lottie-web is unavailable and no poster" },
    { name: "label", type: "string", optional: true, description: "Accessible name; omit for a decorative animation" },
    { name: "playing", type: "boolean", optional: true, description: "Pause (false) / resume (true) an already-loaded animation" },
    { name: "onComplete", type: "callable", optional: true, description: "Fires when a non-looping animation ends" },
    { name: "onError", type: "callable", optional: true, description: "Fires with \"missing-library\" or \"load-failed\"" },
  ],
  render: (_node, props, helpers) => {
    // `asString` performs no validation, so the previous `width:${width}` let an
    // LLM-supplied value close the declaration and inject a full-viewport
    // overlay. `sanitiseCssLength` is the library's guard for exactly this.
    const width = sanitiseCssLength(props.width, "200px");
    const height = sanitiseCssLength(props.height, "200px");
    const label = asString(props.label);
    const playing = props.playing === undefined ? null : asBoolean(props.playing);
    const root = el("div", {
      class: "rui-lottie",
      style: `width:${width};height:${height}`,
      role: label ? "img" : null,
      "aria-label": label || null,
      "aria-hidden": label ? null : "true",
      "data-playing": playing === null ? null : (playing ? "true" : "false"),
    });
    const data = props.data && typeof props.data === "object" ? props.data : null;
    const src = sanitiseImageSrc(props.src);

    if (!data && !src) {
      renderLottieFallback(root, props, helpers, label);
      return root;
    }
    // Graceful fallback first, so the layout never breaks and nothing depends on
    // deferred work having run; the player replaces it once lottie-web is there.
    if (!readLottie()) renderLottieFallback(root, props, helpers, label);

    const speed = Math.max(0.1, Math.min(10, asNumber(props.speed, 1)));
    const mount = (live: HTMLElement, lottie: LottieGlobal): boolean => {
      try {
        // Hand the container to lottie-web: the reconciler would otherwise
        // delete the injected <svg>, since the fresh render has no children.
        live.setAttribute("data-rui-preserve", "true");
        live.replaceChildren();
        live.classList.remove("rui-lottie-empty");
        const anim = lottie.loadAnimation({
          container: live,
          renderer: "svg",
          loop: props.loop === undefined ? true : asBoolean(props.loop),
          autoplay: props.autoplay === undefined ? true : asBoolean(props.autoplay),
          ...(data ? { animationData: data } : { path: src }),
        });
        if (speed !== 1) anim.setSpeed?.(speed);
        if (playing === false) anim.pause?.();
        if (props.onComplete != null) anim.addEventListener?.("complete", () => helpers.invoke(props.onComplete));
        helpers.registerDisposer(() => { try { anim.destroy?.(); } catch { /* noop */ } }, "rui-lottie");
        if (playing !== null && typeof MutationObserver !== "undefined") {
          const observer = new MutationObserver(() => {
            if (live.getAttribute("data-playing") === "false") anim.pause?.();
            else anim.play?.();
          });
          observer.observe(live, { attributes: true, attributeFilter: ["data-playing"] });
          helpers.registerDisposer(() => observer.disconnect(), "rui-lottie-playing");
        }
        return true;
      } catch {
        live.classList.add("rui-lottie-empty");
        helpers.invoke(props.onError, "load-failed");
        return false;
      }
    };

    // The player is mounted from the LIVE node only. Mounting into this render's
    // node while a keyed disposer destroyed the previously-mounted player left a
    // blank box for the rest of the session.
    onceMounted(root, helpers, "rui-lottie-mount", (live) => {
      const ready = readLottie();
      if (ready) { mount(live, ready); return; }
      // lottie-web normally arrives from a `<script defer>`, i.e. after the
      // first render — probing once and locking in the poster forever meant the
      // animation never appeared.
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        const late = readLottie();
        if (late) { clearInterval(timer); mount(live, late); return; }
        if (tries >= 25) { // ~5s
          clearInterval(timer);
          helpers.invoke(props.onError, "missing-library");
        }
      }, 200);
      helpers.registerDisposer(() => clearInterval(timer), "rui-lottie-wait");
    });
    return root;
  },
};

/** Poster image / fallback slot / empty placeholder, in that order. */
function renderLottieFallback(
  target: HTMLElement,
  props: Record<string, unknown>,
  helpers: RenderHelpers,
  label: string,
): void {
  const poster = sanitiseImageSrc(props.poster);
  if (poster) {
    target.append(el("img", {
      src: poster,
      alt: label,
      class: "rui-lottie-poster",
      style: "width:100%;height:100%;object-fit:contain",
    }));
  } else if (props.fallback != null) {
    target.append(helpers.renderNode(props.fallback));
  } else {
    target.classList.add("rui-lottie-empty");
  }
}
