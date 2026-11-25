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
export type FloatingSide = "top" | "bottom" | "left" | "right";
export type FloatingAlign = "start" | "center" | "end";
/**
 * Which semantic layer the panel belongs to. Maps to the `--rui-z-*` scale so
 * the fallback path (and any non-promoted panel) stacks predictably. Promoted
 * panels are in the top layer and stack by promotion order, so this only
 * matters for the fallback.
 */
export type FloatingLayer = "dropdown" | "popover" | "tooltip";
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
export declare function deferToPaint(fn: () => void): () => void;
/**
 * Promote `panel` out of its clipping ancestry, position it against
 * `opts.anchor`, and keep it positioned until the handle is closed.
 *
 * Idempotent per panel: calling it again on an already-open panel updates the
 * existing registration rather than stacking listeners.
 */
export declare function openFloating(panel: HTMLElement, opts: FloatingOptions): FloatingHandle;
/** Close a panel when the caller only has the element. No-op if not open. */
export declare function closeFloating(panel: HTMLElement | null | undefined): void;
/** Reposition an open panel. No-op if not open. */
export declare function updateFloating(panel: HTMLElement | null | undefined): void;
/** Whether this panel is currently promoted by the floating layer. */
export declare function isFloating(panel: HTMLElement | null | undefined): boolean;
/** Full-bleed transparent container (Sheet / BottomSheet / ConfirmDialog roots). */
export declare const OVERLAY_FILL = "inset:0;padding:0;background:transparent;overflow:visible";
/** Full-bleed but clipping, matching `.rui-confetti`'s own `overflow: hidden`. */
export declare const OVERLAY_FILL_CLIP = "inset:0;padding:0;background:transparent;overflow:hidden";
/**
 * Corner-pinned surface (FAB / SpeedDial / Toast stack). The caller appends its
 * own offsets: the UA `inset: 0` would otherwise stretch a `width: auto` surface
 * across the viewport, and only the component knows which corner it wants.
 */
export declare const OVERLAY_CORNER = "padding:0;background:transparent;overflow:visible";
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
export declare function promoteOverlay(surface: HTMLElement, extraStyle?: string): boolean;
/**
 * Take a promoted overlay back out of the top layer and restore its own style.
 *
 * Idempotent, and mandatory on close AND on unmount: an element left showing is
 * orphaned in the top layer, where it keeps painting above the app and keeps
 * `popover`/`style` out of the render's hands for good.
 */
export declare function releaseOverlay(surface: HTMLElement | null | undefined): void;
/**
 * Convenience for the common component shape: a root with `[data-open]`, a
 * trigger, and a panel. Opens or closes the panel to match `open`, reading the
 * side/align the component already stores on its root.
 *
 * Returns the panel so callers can chain, or null when it is missing.
 */
export declare function syncFloatingPanel(liveRoot: HTMLElement, open: boolean, panelSelector: string, triggerSelector: string, opts?: Partial<FloatingOptions>): HTMLElement | null;
