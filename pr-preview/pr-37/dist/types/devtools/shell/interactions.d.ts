/**
 * Aktion DevTools — shell interactions: tooltips, pointer drags, page push.
 *
 * Each of these touches something outside the reconciler's tree — the page's
 * `<html>` element, window-level pointer capture, a floating tooltip that must
 * never be torn down by a re-render — so they live here as small imperative
 * controllers instead of inside a view.
 */
/**
 * One tooltip for the whole panel, driven by `data-tip` (+ optional
 * `data-kbd`) attributes. Delegated on the shadow root, so a tooltip survives
 * the element under it being patched, and disappears with it when removed.
 *
 * "Warm" mode: after one tooltip has shown, moving to a neighbouring control
 * shows its tooltip immediately — scanning a toolbar should not cost half a
 * second per icon.
 */
export declare class TooltipController {
    private readonly root;
    private el;
    private target;
    private timer;
    private lastHidden;
    private visible;
    constructor(root: ShadowRoot, layer: HTMLElement);
    destroy(): void;
    private readonly onOver;
    private readonly onFocus;
    private readonly onOut;
    private readonly hideNow;
    private schedule;
    private show;
}
export interface DragHandlers {
    move(dx: number, dy: number, event: PointerEvent): void;
    end?(dx: number, dy: number, event: PointerEvent, moved: boolean): void;
    /** Movement below this (px) is a click, not a drag. */
    threshold?: number;
}
/**
 * Track a pointer from `pointerdown` until release, on the window (so a drag
 * that leaves the panel keeps working), with the page's text selection and
 * iframes kept out of the way for its duration.
 */
export declare function trackPointer(start: PointerEvent, handlers: DragHandlers): void;
type Side = "right" | "left" | "bottom";
/**
 * Make room for a docked panel by padding the page, the way browser DevTools
 * shrink the viewport — so the app stays fully visible beside the panel
 * instead of being covered by it.
 *
 * It writes one inline property on `<html>` and remembers the exact value it
 * replaced, so `release()` puts the page back precisely as it was, including a
 * value the host itself had set.
 */
export declare class PagePush {
    private side;
    private saved;
    apply(side: Side | null, size: number): void;
    release(): void;
}
export {};
