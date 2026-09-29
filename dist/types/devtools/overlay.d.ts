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
 * including anything inside their shadow roots. Walks parents AND shadow hosts:
 * a hover over the panel resolves to a plain `div` several shadow boundaries
 * deep, and a picker that only checked the returned element's tag would let you
 * inspect the inspector.
 */
export declare function isPanelChrome(element: Element | null): boolean;
/** What the overlay draws around a hovered / selected element. */
export interface HighlightLabel {
    /** Component name, when the node maps to one. */
    component?: string;
    /** `user` / `library`, shown as a badge. */
    kind?: string;
}
/** One element to outline in the render-scan layer. */
/** The visible page area in viewport pixels. */
export interface ViewportBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
export interface ScanEntry {
    element: Element;
    name: string;
    /** Renders so far this session — drives the heat colour. */
    count: number;
    /** Rendered although nothing it reads changed (a forced full render). */
    wasted?: boolean;
}
export interface OverlayMarker {
    element: Element;
    label: string;
    tone: "red" | "amber" | "blue" | "grey" | "purple" | "green";
}
/**
 * The highlight + picker surface, and every on-page layer the panel draws.
 *
 * One instance is shared by every view (the panel creates it and hands it down
 * through the view context), so a hover in the component tree and a hover in
 * the accessibility audit draw the same rectangles.
 */
export declare class InspectOverlay {
    private host;
    private root;
    private readonly layers;
    private frame;
    private tip;
    private crosshair;
    private hint;
    /** Element currently drawn, so scroll / resize can re-measure it. */
    private tracked;
    private trackedLabel;
    private trackedPinned;
    /**
     * The SELECTED element, kept separately from the hovered one: hovering a
     * second row must not overwrite the pin, and leaving the hover must return to
     * the selection rather than leaving the hovered element highlighted.
     */
    private pinnedElement;
    private pinnedLabel;
    private reflowBound;
    private reflowPending;
    private updateFlashes;
    private updateFlashTimer;
    private scanCanvas;
    private scanFlashes;
    private scanAnimating;
    private markerNodes;
    private markers;
    private tabOrder;
    private tabNodes;
    private tabSvg;
    private landmarks;
    private landmarkNodes;
    private badges;
    private badgeNodes;
    private picking;
    private onPick;
    private onHover;
    private onCancel;
    private labelFor;
    private boundsFn;
    private moveHandler;
    private clickHandler;
    private keyHandler;
    private wheelHandler;
    private pickTargetEl;
    /** Ancestor steps taken with Alt+wheel / ↑ while picking. */
    private pickDepth;
    private pickBase;
    /** True while the element picker is armed. */
    get isPicking(): boolean;
    private ensureHost;
    /**
     * Draw the box model around `element`.
     *
     * `pin` marks the highlight as a selection rather than a hover: a pinned
     * highlight survives `hideHover()` and follows the element through scrolling.
     */
    highlight(element: Element | null, label?: HighlightLabel, pin?: boolean): void;
    /** Remove a transient hover highlight, restoring the selection if there is one. */
    hideHover(): void;
    /**
     * Briefly outline every element that just re-rendered — the first-generation
     * "highlight updates", kept for callers of that API. The panel itself uses the
     * richer {@link scanRender}.
     */
    flashUpdated(elements: ReadonlyArray<Element>): void;
    /** Remove any update flashes and render-scan outlines without touching the highlight. */
    clearUpdateFlashes(): void;
    /**
     * Render scan: outline what re-rendered in this commit, labelled with a
     * running render count and coloured by it (green → amber → red), fading out
     * over a second. Drawn on one canvas, so a 200-component commit costs one
     * draw per frame instead of 200 DOM nodes.
     */
    scanRender(entries: ReadonlyArray<ScanEntry>): void;
    private animateScan;
    private paintScan;
    /** Numbered outlines over elements (audit findings). `[]` clears. */
    setMarkers(markers: ReadonlyArray<OverlayMarker>): void;
    /** Visualise keyboard focus order: numbered stops joined by a path. `null` clears. */
    setTabOrder(elements: ReadonlyArray<Element> | null): void;
    /** Outline landmark regions with their role. `null` clears. */
    setLandmarks(items: ReadonlyArray<{
        element: Element;
        label: string;
    }> | null): void;
    /** Small labels pinned to elements (test ids). `null` clears. */
    setBadges(items: ReadonlyArray<{
        element: Element;
        text: string;
    }> | null): void;
    private hasLayers;
    private drawLayers;
    /** Remove every highlight and stop tracking. Persistent layers stay. */
    clear(): void;
    private clearBox;
    /** Drop the selection, so the next `hideHover()` clears the highlight. */
    unpin(): void;
    private drawTarget;
    private draw;
    private bindReflow;
    private unbindReflow;
    /** Redraw every persistent layer (after a commit moved things). */
    refreshLayers(): void;
    /**
     * Arm the element picker. Hovering highlights, clicking selects, Escape
     * cancels; Alt + wheel (or ↑ / ↓) walks to the parent / back down. A
     * full-viewport crosshair layer takes the pointer events so the app under it
     * never sees the picking click — you can safely pick a "Delete" button.
     */
    /**
     * The part of the viewport the page is actually visible in. A docked panel
     * covers one edge, and a tooltip placed under it is a tooltip nobody sees.
     */
    setBounds(fn: (() => ViewportBounds) | null): void;
    private bounds;
    startPicking(handlers: {
        onPick(element: Element): void;
        onHover?(element: Element): void;
        onCancel?(): void;
        /** Resolve a label (component name + kind) for the hovered element. */
        labelFor?(element: Element): HighlightLabel;
    }): void;
    /** `depth` steps up from `element`, crossing shadow boundaries, never past the app host. */
    private ancestorAt;
    /** Disarm the picker, leaving any pinned highlight in place. */
    stopPicking(): void;
    /**
     * Element under a picking event. The crosshair layer is on top, so it is
     * hidden for the hit test instead of reading `event.target` (always itself).
     */
    private pickTarget;
    /** Remove the overlay host from the page. */
    destroy(): void;
}
