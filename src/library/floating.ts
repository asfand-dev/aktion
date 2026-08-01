/**
 * Shared floating layer for anchored popups (audit phase 1).
 *
 * ## The problem this solves
 *
 * Every anchored popup in the library used to render as a `position: absolute`
 * child of its own trigger wrapper. That has two fatal consequences:
 *
 *   1. **Overflow clipping.** Any ancestor with non-visible `overflow` clips the
 *      panel. The stylesheet has ~24 such containers (`.rui-table-wrapper`,
 *      `.rui-modal`, `.rui-sheet-body`, `.rui-accordion-item`, `.rui-input-group`,
 *      `.rui-scroll-area`, …), so a row-actions menu in a table was amputated at
 *      the table's bottom edge. Note `overflow-x: auto` clips *vertically* too —
 *      per CSS Overflow 3 a `visible` axis paired with a non-visible axis
 *      computes to `auto` — which is why the panel was cut off below the row.
 *      For `side: "top"` panels the overflow is in the block-start direction,
 *      which is unreachable overflow: no scrollbar can ever reveal it.
 *   2. **Stacking.** Each popup invented its own z-index (25/30/40/50), so
 *      popups lost to sticky headers, to each other, and to the high-z overlays.
 *
 * ## Why the top layer, and not `position: fixed`
 *
 * `position: fixed` does escape `overflow` clipping — but it is re-trapped by any
 * ancestor that establishes a containing block: `transform`, `will-change`,
 * `filter`, `backdrop-filter`, `contain`, `perspective`. The library creates
 * those itself (`.rui-kanban-card:hover` and `.rui-gallery-tile:hover` apply a
 * transform; the glass theme has 14 `backdrop-filter` rules; the universal
 * `animate` prop can transform *any* component). A `fixed` panel would therefore
 * break intermittently — on hover — which is the worst possible failure mode.
 *
 * The browser **top layer** is the only mechanism that escapes both. Crucially,
 * `showPopover()` promotes an element to the top layer *without reparenting it*,
 * so the DOM tree the morph reconciler diffs against is unchanged. That is what
 * makes this safe to drop into existing components.
 *
 * Style scoping follows the shadow tree, not the paint layer, so the adopted
 * stylesheet still applies to a promoted panel — no CSS duplication needed.
 *
 * We use `popover="manual"`, never `"auto"`, so the library's existing
 * `installDismissListeners` keeps sole ownership of dismissal. `auto` would add
 * native light-dismiss on top of it and make nested Escape handling ambiguous.
 *
 * A reparenting fallback into a single shadow-root-level `.rui-layer` container
 * covers engines without the Popover API. The panel is restored to its original
 * parent on close so morph never sees a moved node while closed.
 *
 * ## What this deliberately does NOT do
 *
 * It does not use CSS anchor positioning (`anchor-name` / `position-area`) as the
 * primary path: Firefox still lacks it, and it degrades to a panel pinned to
 * nothing rather than to a usable fallback. Coordinates are measured in JS.
 */

const DEFAULT_OFFSET = 6;
/** Keep panels this far from the viewport edge when shifting/clamping. */
const VIEWPORT_MARGIN = 8;

export type FloatingSide = "top" | "bottom" | "left" | "right";
export type FloatingAlign = "start" | "center" | "end";

/**
 * Which semantic layer the panel belongs to. Maps to the `--rui-z-*` scale so
 * the fallback path (and any non-promoted panel) stacks predictably. Promoted
 * panels are in the top layer and stack by promotion order, so this only
 * matters for the fallback.
 */
export type FloatingLayer = "dropdown" | "popover" | "tooltip";

const LAYER_Z: Record<FloatingLayer, string> = {
  dropdown: "var(--rui-z-dropdown, 1000)",
  popover: "var(--rui-z-popover, 1350)",
  tooltip: "var(--rui-z-tooltip, 1500)",
};

export interface FloatingOptions {
  /** The live trigger element to anchor against. Must be in the document. */
  anchor: HTMLElement;
  side?: FloatingSide;
  align?: FloatingAlign;
  /** Gap between anchor and panel, in px (default 6). */
  offset?: number;
  /** Force the panel to the anchor's width — listbox-style pickers want this. */
  matchAnchorWidth?: boolean;
  /** Minimum width, in px. Applied only when `matchAnchorWidth` is set. */
  minWidth?: number;
  /**
   * Cap the panel height. `"viewport"` (the default) fits it to the space
   * available on the chosen side and adds internal scrolling, so a long menu is
   * always reachable instead of running off-screen.
   */
  maxHeight?: number | "viewport" | "none";
  layer?: FloatingLayer;
  /** Flip to the opposite side when there is not enough room (default true). */
  flip?: boolean;
  /** Slide along the anchor edge to stay in the viewport (default true). */
  shift?: boolean;
}

export interface FloatingHandle {
  /** Re-measure and reposition. Safe to call at any time while open. */
  update: () => void;
  /** Close: unpromote, restore inline styles, drop listeners. Idempotent. */
  close: () => void;
}

interface Registration extends FloatingHandle {
  panel: HTMLElement;
}

/**
 * One registration per open panel. A WeakMap keyed by the panel element means a
 * panel removed from the DOM by a re-render cannot leak its listeners: the entry
 * becomes unreachable along with the node. Explicit `close()` is still the
 * normal path, and `closeFloating()` exists for callers that only hold the node.
 */
const OPEN: WeakMap<HTMLElement, Registration> = new WeakMap();

/**
 * Run `fn` once, as soon after the current task as the environment allows.
 *
 * Deliberately races `requestAnimationFrame` against a `setTimeout(0)` instead
 * of trusting rAF alone: rAF only fires for pages the browser is actually
 * painting, so in a background tab, an offscreen/headless pane, or a
 * `content-visibility: hidden` subtree it may never run at all. A panel that is
 * open on first paint would then never be positioned or promoted. Timers still
 * fire in those environments, so the timeout is the safety net; whichever wins,
 * `fn` runs exactly once.
 */
export function deferToPaint(fn: () => void): () => void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    fn();
  };
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : 0;
  const timer = setTimeout(run, 0) as unknown as number;
  return () => {
    done = true;
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(timer);
  };
}

const supportsPopover = (): boolean =>
  typeof HTMLElement !== "undefined" &&
  typeof (HTMLElement.prototype as { showPopover?: unknown }).showPopover === "function";

/**
 * The shadow-root-level fallback container. Created lazily, once per root, as
 * the last child so it paints above the app content. `pointer-events: none` on
 * the layer with `auto` on its children means the layer never swallows clicks
 * aimed at the page beneath it.
 */
function ensureLayer(root: Document | ShadowRoot): HTMLElement {
  const existing = root.querySelector<HTMLElement>(".rui-layer");
  if (existing) return existing;
  const layer = document.createElement("div");
  layer.className = "rui-layer";
  // Inline rather than stylesheet-dependent: the fallback must work even if a
  // consumer strips or overrides the sheet.
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:var(--rui-z-popover,1350)";
  (root as ShadowRoot).appendChild(layer);
  return layer;
}

interface Measured {
  left: number;
  top: number;
  side: FloatingSide;
  maxHeight: number | null;
}

/**
 * Resolve a final viewport position for `panel` against `anchor`.
 *
 * Order of operations matches the established convention (floating-ui et al.):
 * choose a side (flipping if the preferred one does not fit), then align along
 * that edge, then shift back inside the viewport, then cap the height.
 */
function measure(
  panel: HTMLElement,
  anchor: HTMLElement,
  opts: FloatingOptions,
): Measured {
  const side = opts.side ?? "bottom";
  const align = opts.align ?? "start";
  const offset = opts.offset ?? DEFAULT_OFFSET;
  const flip = opts.flip !== false;
  const shift = opts.shift !== false;

  const a = anchor.getBoundingClientRect();
  // Measure the panel unconstrained so flipping decisions use its natural size.
  const p = panel.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;

  // Some environments report a zero viewport (offscreen/headless panes, certain
  // embedded webviews, a document measured before first layout). Treating 0 as
  // "no room" would flip every panel and then clamp it to an 8px box, so when
  // the viewport is not measurable we place at the author's preferred side and
  // skip collision handling entirely rather than acting on junk numbers.
  if (vw <= 0 || vh <= 0) {
    const fallbackSide = side;
    let fl: number;
    let ft: number;
    if (fallbackSide === "bottom" || fallbackSide === "top") {
      ft = fallbackSide === "bottom" ? a.bottom + offset : a.top - offset - p.height;
      fl = align === "center" ? a.left + a.width / 2 - p.width / 2
        : align === "end" ? a.right - p.width : a.left;
    } else {
      fl = fallbackSide === "right" ? a.right + offset : a.left - offset - p.width;
      ft = align === "center" ? a.top + a.height / 2 - p.height / 2
        : align === "end" ? a.bottom - p.height : a.top;
    }
    return { left: Math.round(fl), top: Math.round(ft), side: fallbackSide, maxHeight: null };
  }

  const room = {
    top: a.top - VIEWPORT_MARGIN,
    bottom: vh - a.bottom - VIEWPORT_MARGIN,
    left: a.left - VIEWPORT_MARGIN,
    right: vw - a.right - VIEWPORT_MARGIN,
  };
  const need = {
    top: p.height + offset,
    bottom: p.height + offset,
    left: p.width + offset,
    right: p.width + offset,
  };

  // --- side, with flip ---
  let chosen: FloatingSide = side;
  if (flip && room[side] < need[side]) {
    const opposite: Record<FloatingSide, FloatingSide> = {
      top: "bottom", bottom: "top", left: "right", right: "left",
    };
    const alt = opposite[side];
    // Only flip if the other side is genuinely roomier — otherwise keep the
    // author's choice and let the height cap + shift handle the overflow.
    if (room[alt] > room[side]) chosen = alt;
  }

  // --- primary axis placement ---
  let left = 0;
  let top = 0;
  if (chosen === "bottom" || chosen === "top") {
    top = chosen === "bottom" ? a.bottom + offset : a.top - offset - p.height;
    if (align === "start") left = a.left;
    else if (align === "center") left = a.left + a.width / 2 - p.width / 2;
    else left = a.right - p.width;
  } else {
    left = chosen === "right" ? a.right + offset : a.left - offset - p.width;
    if (align === "start") top = a.top;
    else if (align === "center") top = a.top + a.height / 2 - p.height / 2;
    else top = a.bottom - p.height;
  }

  // --- shift back inside the viewport ---
  if (shift) {
    const maxLeft = vw - p.width - VIEWPORT_MARGIN;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, maxLeft));
    if (chosen === "left" || chosen === "right") {
      const maxTop = vh - p.height - VIEWPORT_MARGIN;
      top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, maxTop));
    }
  }

  // --- height cap + internal scroll ---
  let maxHeight: number | null = null;
  const cap = opts.maxHeight ?? "viewport";
  if (cap === "viewport") {
    // Space available on the side we actually chose.
    const avail = chosen === "bottom" ? vh - (a.bottom + offset) - VIEWPORT_MARGIN
      : chosen === "top" ? a.top - offset - VIEWPORT_MARGIN
        : vh - 2 * VIEWPORT_MARGIN;
    maxHeight = Math.max(96, Math.floor(avail));
    if (p.height <= maxHeight) maxHeight = null; // no cap needed
    else if (chosen === "top") top = VIEWPORT_MARGIN; // pin to top once capped
  } else if (typeof cap === "number") {
    maxHeight = cap;
  }

  return { left: Math.round(left), top: Math.round(top), side: chosen, maxHeight };
}

function applyPosition(panel: HTMLElement, m: Measured, opts: FloatingOptions): void {
  const s = panel.style;
  s.setProperty("position", "fixed", "important");
  // The UA stylesheet gives `[popover]` `inset: 0; margin: auto`, which would
  // centre the panel. Neutralise both before writing our own coordinates.
  s.setProperty("inset", "auto", "important");
  s.setProperty("margin", "0", "important");
  s.setProperty("left", `${m.left}px`, "important");
  s.setProperty("top", `${m.top}px`, "important");
  s.setProperty("right", "auto", "important");
  s.setProperty("bottom", "auto", "important");
  // Alignment transforms in the base sheet (e.g. `translateX(-50%)` for
  // `align: center`) would double-apply on top of measured coordinates.
  s.setProperty("transform", "none", "important");

  if (m.maxHeight != null) {
    s.setProperty("max-height", `${m.maxHeight}px`, "important");
    s.setProperty("overflow-y", "auto", "important");
  } else {
    s.removeProperty("max-height");
    s.removeProperty("overflow-y");
  }
  // Expose the resolved side so CSS can point an arrow the right way even when
  // flipping changed it out from under the author's `data-side`.
  panel.setAttribute("data-floating-side", m.side);
  if (!supportsPopover()) {
    s.setProperty("z-index", LAYER_Z[opts.layer ?? "dropdown"], "important");
  }
}

/**
 * Promote `panel` out of its clipping ancestry, position it against
 * `opts.anchor`, and keep it positioned until the handle is closed.
 *
 * Idempotent per panel: calling it again on an already-open panel updates the
 * existing registration rather than stacking listeners.
 */
export function openFloating(panel: HTMLElement, opts: FloatingOptions): FloatingHandle {
  const prior = OPEN.get(panel);
  if (prior) {
    prior.update();
    return prior;
  }

  const savedStyle = panel.getAttribute("style");
  const originalParent = panel.parentElement;
  const originalNext = panel.nextSibling;
  let promoted: "popover" | "layer" | "none" = "none";

  // Width has to be settled before measuring, or a listbox that inherits its
  // width from the trigger measures at its natural (wrong) width and flips or
  // shifts on bad numbers.
  if (opts.matchAnchorWidth) {
    const w = Math.round(opts.anchor.getBoundingClientRect().width);
    const min = opts.minWidth ?? 0;
    panel.style.setProperty("width", `${Math.max(w, min)}px`, "important");
  }

  if (supportsPopover()) {
    try {
      panel.setAttribute("popover", "manual");
      // `[popover]` is `display: none` until shown; the library's own
      // `[data-open]` rules set `display: flex`. Showing first, then letting the
      // component's CSS win, keeps both happy.
      (panel as unknown as { showPopover: () => void }).showPopover();
      promoted = "popover";
    } catch {
      // Already-open popover, or a detached node. Fall through to reparenting.
      panel.removeAttribute("popover");
    }
  }
  if (promoted === "none") {
    const root = panel.getRootNode();
    if (root instanceof ShadowRoot || root instanceof Document) {
      // Capture the display the panel had *while still in place*, because the
      // rules that make it visible are usually written as
      // `[data-open="true"] > .panel { display: flex }`. Reparenting breaks that
      // direct-child selector, so the computed value has to be pinned inline
      // before the move or the panel lands in the layer as `display: none`.
      const shown = getComputedStyle(panel).display;
      const layer = ensureLayer(root);
      layer.appendChild(panel);
      panel.style.setProperty("display", shown === "none" ? "flex" : shown, "important");
      panel.style.setProperty("pointer-events", "auto", "important");
      promoted = "layer";
      // The reparenting fallback escapes `overflow` clipping but NOT a containing
      // block: `.rui-layer` is itself `position: fixed`, so a transformed ancestor
      // of the shadow HOST still traps it. Nothing about that is visible in the
      // markup, so name the culprit rather than leaving a panel that is simply in
      // the wrong place. See `warnIfTrapped`.
      warnIfTrapped(panel, "A floating panel");
    }
  }

  const update = (): void => {
    if (!panel.isConnected) return;
    applyPosition(panel, measure(panel, opts.anchor, opts), opts);
  };

  // Position twice: once now, once after a frame. The first pass may measure a
  // panel whose fonts/icons have not settled; the second corrects it without a
  // visible jump because both happen before paint completes.
  update();
  const cancelDeferred = deferToPaint(update);

  // `capture: true` so we also react to scrolling of inner containers, which do
  // not bubble scroll events.
  const onScroll = (): void => update();
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // The panel's own size can change while open (filtering a combobox list), and
  // the anchor can move (a reflow above it). Observe both.
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => update());
    try {
      ro.observe(panel);
      ro.observe(opts.anchor);
    } catch {
      /* observe can throw on detached nodes — positioning still works. */
    }
  }

  const reg: Registration = {
    panel,
    update,
    close: () => {
      if (!OPEN.has(panel)) return;
      OPEN.delete(panel);
      cancelDeferred();
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
      if (promoted === "popover") {
        try {
          (panel as unknown as { hidePopover: () => void }).hidePopover();
        } catch { /* already hidden */ }
        panel.removeAttribute("popover");
      } else if (promoted === "layer" && originalParent) {
        // Put it back exactly where morph expects to find it.
        if (originalNext && originalNext.parentNode === originalParent) {
          originalParent.insertBefore(panel, originalNext);
        } else {
          originalParent.appendChild(panel);
        }
      }
      panel.removeAttribute("data-floating-side");
      if (savedStyle == null) panel.removeAttribute("style");
      else panel.setAttribute("style", savedStyle);
    },
  };
  OPEN.set(panel, reg);
  return reg;
}

/** Close a panel when the caller only has the element. No-op if not open. */
export function closeFloating(panel: HTMLElement | null | undefined): void {
  if (!panel) return;
  OPEN.get(panel)?.close();
}

/** Reposition an open panel. No-op if not open. */
export function updateFloating(panel: HTMLElement | null | undefined): void {
  if (!panel) return;
  OPEN.get(panel)?.update();
}

/** Whether this panel is currently promoted by the floating layer. */
export function isFloating(panel: HTMLElement | null | undefined): boolean {
  return !!panel && OPEN.has(panel);
}

/* ----------------------------------------------------------------------- *
 * Viewport overlays — promotion without anchoring
 * ----------------------------------------------------------------------- */

/*
 * The ~16 full-screen / corner-pinned overlay surfaces (Modal, Sheet,
 * BottomSheet, ConfirmDialog, Drawer, Toast(s), Lightbox, Tour, Spotlight,
 * CommandPalette, FAB, SpeedDial, Confetti, ReadingProgress, the AppShell scrim)
 * position themselves with `position: fixed` and need no anchor and no
 * measuring — but `fixed` resolves against the nearest ancestor that
 * establishes a containing block, and this library manufactures those itself:
 * the universal `animate` prop can put a permanent `transform` on ANY component
 * (`float`/`bounce`/`spin`/`ping`/`wiggle` are infinite), the glass theme has 14
 * `backdrop-filter` rules, `Parallax` rewrites an inline `transform` on every
 * scroll frame, and `FlipList`/`Carousel` set `will-change: transform`. A
 * "full-screen" scrim inside any of those collapses into that ancestor's box and
 * drifts with it.
 *
 * So overlays need exactly the half of `openFloating` that is not about
 * anchoring: top-layer promotion. `showPopover()` promotes WITHOUT reparenting,
 * so the tree the morph reconciler diffs is unchanged.
 *
 * Deliberately NO `.rui-layer` fallback here, unlike `openFloating`. An overlay
 * surface is the component's ROOT node; reparenting a root moves it out from
 * under the parent morph diffs against, and the next commit re-creates it there
 * — two overlays, one of them orphaned in the layer. When the Popover API is
 * missing the surface simply stays where it is, which is exactly today's
 * behaviour, and `warnIfTrapped` says so out loud if an ancestor is in fact
 * trapping it.
 */

/**
 * What the UA `[popover]` rules impose that EVERY promoted overlay must undo.
 *
 * The UA sheet gives `[popover]` `width/height: fit-content`, `margin: auto`,
 * `border: solid`, `padding: .25em`, `overflow: auto`, `color: CanvasText` and
 * `background-color: Canvas`. Author rules outrank the UA sheet, so only the
 * properties a surface's own CSS does not already assert leak through — but
 * `width`/`height`/`margin` are asserted by almost none of them, and
 * `fit-content` + `margin: auto` turns a full-bleed scrim into a shrink-wrapped
 * box centred in the viewport. `border` and `color` are the same story.
 *
 * `padding`, `background` and `overflow` are NOT in here because they differ per
 * surface: `.rui-modal-overlay` is itself the scrim (it owns a background and a
 * padding the promotion must not flatten), while `.rui-sheet-root` is a
 * transparent container whose backdrop is a child — and would be painted as an
 * opaque `Canvas` rectangle over the whole app without an explicit override.
 * Those go in the caller's `extraStyle`; the presets below cover the two shapes.
 */
const OVERLAY_UA_RESET =
  "width:auto;height:auto;max-width:none;max-height:none;margin:0;border:0;color:inherit";

/** Full-bleed transparent container (Sheet / BottomSheet / ConfirmDialog roots). */
export const OVERLAY_FILL = "inset:0;padding:0;background:transparent;overflow:visible";
/** Full-bleed but clipping, matching `.rui-confetti`'s own `overflow: hidden`. */
export const OVERLAY_FILL_CLIP = "inset:0;padding:0;background:transparent;overflow:hidden";
/**
 * Corner-pinned surface (FAB / SpeedDial / Toast stack). The caller appends its
 * own offsets: the UA `inset: 0` would otherwise stretch a `width: auto` surface
 * across the viewport, and only the component knows which corner it wants.
 */
export const OVERLAY_CORNER = "padding:0;background:transparent;overflow:visible";

/**
 * Style attribute each promoted surface had before promotion, so release can put
 * it back verbatim. Keyed by element, so a surface removed by a re-render cannot
 * leak the entry.
 */
const PROMOTED_OVERLAYS: WeakMap<HTMLElement, string | null> = new WeakMap();

/** Ancestor chain walk that also steps out of shadow trees. */
function parentOrHost(node: HTMLElement): HTMLElement | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  // A shadow host's own ancestors trap `fixed` descendants inside the tree too.
  return typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot
    ? (root.host as HTMLElement)
    : null;
}

/**
 * Does this computed style make the element a containing block for its
 * `position: fixed` descendants? `contain: size` alone does not, so the test is
 * narrower than "any containment".
 */
function trapsFixed(cs: CSSStyleDeclaration): boolean {
  const get = (p: string): string => cs.getPropertyValue(p) || "";
  const notNone = (p: string): boolean => {
    const v = get(p).trim();
    return v !== "" && v !== "none";
  };
  return notNone("transform") || notNone("filter") || notNone("backdrop-filter")
    || notNone("perspective") || /transform|filter|perspective/.test(get("will-change"))
    || /\b(paint|layout|strict|content)\b/.test(get("contain"));
}

const TRAP_WARNED: WeakSet<HTMLElement> = new WeakSet();

/**
 * When promotion is unavailable, a trapping ancestor is a silent visual failure:
 * the surface renders, just in the wrong box. Name the culprit once so it is an
 * actionable message instead of "the modal is in the middle of my card".
 *
 * Only warns when a trap actually exists, and at most once per element — this is
 * on the failure path of a user-visible interaction, not a render loop.
 */
function warnIfTrapped(surface: HTMLElement, what: string): void {
  if (TRAP_WARNED.has(surface) || typeof getComputedStyle !== "function") return;
  let node = parentOrHost(surface);
  // Bounded: a malformed tree must not turn a diagnostic into a hang.
  for (let hops = 0; node && hops < 64; hops += 1) {
    let trapped = false;
    try {
      trapped = trapsFixed(getComputedStyle(node));
    } catch {
      return; // no usable computed style in this environment
    }
    if (trapped) {
      TRAP_WARNED.add(surface);
      const cls = node.getAttribute("class");
      console.warn(
        `[aktion] ${what} could not be promoted to the browser top layer, and the ancestor `
        + `<${node.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}> establishes a containing `
        + "block (transform / filter / backdrop-filter / will-change / contain), so the overlay's "
        + "`position: fixed` resolves against that element instead of the viewport. Remove the "
        + "`animate`/`sx` transform from that ancestor, or move the overlay out of it.",
      );
      return;
    }
    node = parentOrHost(node);
  }
}

/**
 * Promote a viewport overlay into the browser top layer.
 *
 * `extraStyle` is appended after the shared UA reset — pass one of
 * `OVERLAY_FILL` / `OVERLAY_FILL_CLIP` / `OVERLAY_CORNER` (plus the corner
 * offsets, for the last). The surface's existing `style` is preserved in front of
 * both, so an author's `sx` survives promotion.
 *
 * Returns whether the surface is in the top layer — `true` also for a surface
 * that was already promoted, so this doubles as the "am I promoted?" query and a
 * caller with a stylesheet-only fallback path can branch on it without keeping
 * its own bookkeeping.
 *
 * Two details that are load-bearing:
 *
 *  - `popover` is written ONLY once `showPopover()` has succeeded. The UA rule
 *    `[popover]:not(:popover-open) { display: none }` means an overlay carrying
 *    the attribute without actually being shown is *invisible* — the worst
 *    failure mode available. Which also rules out emitting `popover` from a
 *    render: promotion is a live-DOM fact, not render output.
 *  - `data-floating-side` is the sentinel `syncAttributes` (renderer/morph.ts)
 *    honours to stop stripping `popover`/`style` off a promoted element, which is
 *    what keeps the promotion alive across re-renders. While it is set, the
 *    render no longer owns those two attributes — a re-render cannot restyle the
 *    surface's root until it closes, which is the trade the reconciler needs.
 */
export function promoteOverlay(surface: HTMLElement, extraStyle?: string): boolean {
  // Already promoted — by us, or as an anchored panel, which must not be touched.
  if (PROMOTED_OVERLAYS.has(surface) || surface.hasAttribute("data-floating-side")) return true;
  const label = `<${surface.tagName.toLowerCase()}> overlay`;
  if (!supportsPopover()) {
    warnIfTrapped(surface, label);
    return false;
  }
  const saved = surface.getAttribute("style");
  try {
    surface.setAttribute("popover", "manual");
    (surface as unknown as { showPopover: () => void }).showPopover();
  } catch {
    // Detached, or a popover state the browser refuses. Leaving the attribute
    // behind would hide the surface outright (see above).
    surface.removeAttribute("popover");
    warnIfTrapped(surface, label);
    return false;
  }
  PROMOTED_OVERLAYS.set(surface, saved);
  const reset = extraStyle ? `${OVERLAY_UA_RESET};${extraStyle}` : OVERLAY_UA_RESET;
  surface.setAttribute("style", saved ? `${saved};${reset}` : reset);
  surface.setAttribute("data-floating-side", "overlay");
  return true;
}

/**
 * Take a promoted overlay back out of the top layer and restore its own style.
 *
 * Idempotent, and mandatory on close AND on unmount: an element left showing is
 * orphaned in the top layer, where it keeps painting above the app and keeps
 * `popover`/`style` out of the render's hands for good.
 */
export function releaseOverlay(surface: HTMLElement | null | undefined): void {
  if (!surface || !PROMOTED_OVERLAYS.has(surface)) return;
  const saved = PROMOTED_OVERLAYS.get(surface) ?? null;
  PROMOTED_OVERLAYS.delete(surface);
  try {
    (surface as unknown as { hidePopover: () => void }).hidePopover();
  } catch { /* already hidden, or detached — removing the attribute finishes it */ }
  surface.removeAttribute("popover");
  surface.removeAttribute("data-floating-side");
  if (saved == null) surface.removeAttribute("style");
  else surface.setAttribute("style", saved);
}

/**
 * Convenience for the common component shape: a root with `[data-open]`, a
 * trigger, and a panel. Opens or closes the panel to match `open`, reading the
 * side/align the component already stores on its root.
 *
 * Returns the panel so callers can chain, or null when it is missing.
 */
export function syncFloatingPanel(
  liveRoot: HTMLElement,
  open: boolean,
  panelSelector: string,
  triggerSelector: string,
  opts: Partial<FloatingOptions> = {},
): HTMLElement | null {
  const panel = liveRoot.querySelector<HTMLElement>(panelSelector);
  const anchor = liveRoot.querySelector<HTMLElement>(triggerSelector) ?? liveRoot;
  if (!panel) return null;
  if (!open) {
    closeFloating(panel);
    return panel;
  }
  const side = (liveRoot.getAttribute("data-side") as FloatingSide | null) ?? undefined;
  const align = (liveRoot.getAttribute("data-align") as FloatingAlign | null) ?? undefined;
  openFloating(panel, { anchor, side, align, ...opts });
  return panel;
}
