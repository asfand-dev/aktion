/**
 * Aktion DevTools — the inspect overlay and element picker.
 *
 * This is the half of "inspect element" that browser DevTools gets for free by
 * living outside the page. An in-page panel has to build it: a highlight that
 * draws the real box model, a picker that can reach *inside* the app's shadow
 * root, and a measurement read that reports what is actually computed rather
 * than what the program asked for.
 *
 * Three details make it work where a naive version fails:
 *
 *   1. **Shadow piercing.** `document.elementFromPoint` stops at the
 *      `<aktion-app>` host, so every hover would resolve to the same element.
 *      The picker descends through `shadowRoot.elementFromPoint` until it
 *      reaches a leaf.
 *   2. **Its own host.** The overlay lives in a separate element with its own
 *      shadow root, not inside the panel — a panel that is collapsed, dragged,
 *      or `overflow: hidden` must not clip or move the highlight.
 *   3. **Pointer transparency.** Every overlay layer is `pointer-events: none`,
 *      so highlighting an element never intercepts the click you are about to
 *      make on it.
 */
/** Box-model measurements of one element, in CSS pixels. */
export interface BoxModel {
    /** Position and size of the border box, in viewport coordinates. */
    rect: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    margin: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    border: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    padding: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    /** Content-box size (border box minus border and padding). */
    content: {
        width: number;
        height: number;
    };
}
/** Measure an element's box model, or `null` when it has no layout. */
export declare function measureBox(element: Element): BoxModel | null;
/** `div#main.card.is-open` — the selector-ish label DevTools users expect. */
export declare function describeElement(element: Element): string;
/**
 * A stable-ish CSS path to an element, for the "copy selector" action.
 *
 * Uses `nth-of-type` rather than `nth-child` so the path survives a sibling
 * text node appearing, and stops at the shadow root because a selector that
 * crosses one is not usable in `querySelector` anyway.
 */
export declare function cssPath(element: Element, root?: Node | null): string;
/** Computed-style summary — the properties that explain most layout surprises. */
export declare const COMPUTED_GROUPS: ReadonlyArray<{
    title: string;
    props: readonly string[];
}>;
/** Read one group of computed properties, skipping empty / default-ish values. */
export declare function computedGroup(element: Element, props: readonly string[]): Array<[string, string]>;
/**
 * Every CSS custom property in effect on an element, with its value.
 *
 * Aktion themes ARE custom properties, so "why is this button the wrong
 * colour?" almost always resolves to a `--rui-*` value — which no other view
 * shows. Walks the ancestor chain because inheritance is where they come from.
 */
export declare function cssVariables(element: Element, prefix?: string): Array<[string, string]>;
/**
 * Accessibility summary for one element: the role and name a screen reader
 * would announce, plus the attributes that decide them.
 */
export declare function a11ySummary(element: Element): Array<[string, string]>;
/** Implicit ARIA role for the handful of elements that carry one. */
export declare function implicitRole(element: Element): string | null;
/**
 * Best-effort accessible name, following the practical part of the accname
 * algorithm: `aria-labelledby`, `aria-label`, a native label, `alt`, `title`,
 * then text content.
 */
export declare function accessibleName(element: Element): string;
/**
 * Resolve the deepest element at a viewport point, descending through shadow
 * roots. Without this the picker can only ever select the `<aktion-app>` host.
 */
export declare function deepElementFromPoint(x: number, y: number): Element | null;
/**
 * True when `element` is part of the DevTools UI (the panel or the overlay),
 * including anything inside their shadow roots.
 *
 * Walks parents *and* shadow hosts: a hover over the panel resolves to a plain
 * `div` several shadow boundaries deep, and a picker that only checked the
 * returned element's tag would happily let you inspect the inspector.
 */
export declare function isPanelChrome(element: Element | null): boolean;
/** What the overlay draws around a hovered / selected element. */
export interface HighlightLabel {
    /** Component name, when the node maps to one. */
    component?: string;
    /** `user` / `library`, shown as a badge. */
    kind?: string;
}
/**
 * The highlight + picker surface.
 *
 * One instance is shared by every tab (it is created by the panel and passed
 * down through the tab context), so a hover in the component tree and a hover
 * in the a11y audit draw the same rectangles.
 */
export declare class InspectOverlay {
    private host;
    private root;
    private readonly layers;
    private tip;
    private crosshair;
    private hint;
    /** Element currently drawn, so scroll / resize can re-measure it. */
    private tracked;
    private trackedLabel;
    /**
     * The SELECTED element, kept separately from the hovered one.
     *
     * A single "tracked + pinned" pair looks equivalent and is not: hovering a
     * second row would overwrite the pin, and leaving the hover would then keep
     * the hovered element highlighted instead of returning to the selection.
     */
    private pinnedElement;
    private pinnedLabel;
    private reflowBound;
    /** Transient "this re-rendered" outlines — see {@link flashUpdated}. */
    private updateFlashes;
    private updateFlashTimer;
    private picking;
    private onPick;
    private onHover;
    private onCancel;
    private moveHandler;
    private clickHandler;
    private keyHandler;
    /** True while the element picker is armed. */
    get isPicking(): boolean;
    private ensureHost;
    /**
     * Draw the box model around `element`.
     *
     * `pin` marks the highlight as a selection rather than a hover: a pinned
     * highlight survives `hideHover()` and follows the element through scrolling,
     * which is what makes "select it in the tree, then scroll to it" work.
     */
    highlight(element: Element | null, label?: HighlightLabel, pin?: boolean): void;
    /** Remove a transient hover highlight, restoring the selection if there is one. */
    hideHover(): void;
    /**
     * Briefly outline every element that just re-rendered ("highlight updates").
     *
     * Drawn as its own cheap layer rather than through the box-model highlight:
     * this fires on every commit, so it has to cost one absolutely-positioned div
     * per element and nothing else. Overlapping flashes replace each other, which
     * is what makes a repeated re-render read as a pulse.
     */
    flashUpdated(elements: ReadonlyArray<Element>): void;
    /** Remove any update flashes without touching the highlight. */
    clearUpdateFlashes(): void;
    /** Remove every highlight and stop tracking. */
    clear(): void;
    /** Drop the selection, so the next `hideHover()` clears the highlight. */
    unpin(): void;
    private drawTarget;
    private draw;
    private bindReflow;
    private unbindReflow;
    /**
     * Arm the element picker. Hovering highlights, clicking selects, Escape
     * cancels.
     *
     * A full-viewport crosshair layer takes the pointer events so the app under
     * it never sees the picking click — you can safely pick a "Delete" button.
     */
    startPicking(handlers: {
        onPick(element: Element): void;
        onHover?(element: Element): void;
        onCancel?(): void;
    }): void;
    /** Disarm the picker, leaving any pinned highlight in place. */
    stopPicking(): void;
    /**
     * Element under a picking event. The crosshair layer is on top, so we hide it
     * for the duration of the hit test rather than reading `event.target` (which
     * would always be the crosshair itself).
     */
    private pickTarget;
    /** Remove the overlay host from the page. */
    destroy(): void;
}
