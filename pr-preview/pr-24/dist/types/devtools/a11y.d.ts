/**
 * Aktion DevTools — accessibility audit.
 *
 * A static pass over the app's rendered DOM, run on demand from the Test tab.
 * It is not a substitute for a real audit tool, and it does not pretend to be
 * axe-core; it covers the failures a generated UI actually produces, which are
 * a narrow and very repetitive set: an icon button with no name, an input whose
 * only label is its placeholder, a heading ladder with a hole in it, body text
 * at 2.6:1 on its own surface.
 *
 * Two design rules keep it honest:
 *
 *   - **Every finding names the element and the fix.** A list of rule ids is
 *     not actionable; "Button at [3] has no accessible name — add `label:` or
 *     `aria: { label: … }`" is.
 *   - **Never throw, never guess.** A rule that cannot be evaluated in this
 *     environment (no `getComputedStyle`, a cross-origin font) is skipped, not
 *     reported as a pass and not reported as a failure.
 */
/** How much a finding matters, in the vocabulary audit tools share. */
export type A11yImpact = "critical" | "serious" | "moderate" | "minor";
/** One accessibility problem found in the rendered tree. */
export interface A11yFinding {
    /** Rule id (`image-alt`, `button-name`, `color-contrast`). */
    rule: string;
    impact: A11yImpact;
    /** What is wrong, naming the element. */
    message: string;
    /** How to fix it, in Aktion terms. */
    help: string;
    /** The offending element, for highlighting. */
    element: Element;
    /** Extra measured detail (`2.61:1`, `h2 → h4`). */
    detail?: string;
    /** WCAG 2.2 success criteria this finding fails (`1.1.1`). */
    wcag?: string[];
    /** Grouping for the audit view. */
    category?: A11yCategory;
}
export type A11yCategory = "names" | "structure" | "aria" | "keyboard" | "contrast" | "forms" | "media";
/** Rule metadata the audit view shows next to every finding. */
export declare const RULE_INFO: Record<string, {
    wcag: string[];
    category: A11yCategory;
    title: string;
}>;
/** Parse a CSS colour into RGBA, or `null` for one we cannot read. */
export declare function parseColor(css: string): {
    r: number;
    g: number;
    b: number;
    a: number;
} | null;
/** Relative luminance per WCAG 2.x. */
export declare function relativeLuminance(color: {
    r: number;
    g: number;
    b: number;
}): number;
/** Contrast ratio between two opaque colours (1–21). */
export declare function contrastRatio(fg: {
    r: number;
    g: number;
    b: number;
}, bg: {
    r: number;
    g: number;
    b: number;
}): number;
/**
 * Effective background behind an element: walk up until an opaque colour is
 * found, compositing translucent layers on the way. Crossing shadow boundaries
 * matters here — the app's own surface colour lives on `.rui-root` inside a
 * shadow root, and stopping at the boundary would report white on white.
 */
export declare function effectiveBackground(element: Element): {
    r: number;
    g: number;
    b: number;
} | null;
/**
 * Run the audit over a rendered subtree.
 *
 * `limit` caps the elements examined so auditing a 20k-node data grid cannot
 * freeze the panel; the caller is told when the cap was hit.
 */
export declare function auditAccessibility(root: Element | null, options?: {
    limit?: number;
}): {
    findings: A11yFinding[];
    examined: number;
    truncated: boolean;
};
/**
 * A 0–100 score, Lighthouse-style: each failing RULE costs by impact (a second
 * instance of the same failure costs far less than a new kind of failure,
 * because one fix usually clears every instance).
 */
export declare function a11yScore(findings: ReadonlyArray<A11yFinding>): number;
/** Group findings by rule, for the summary table. */
export declare function groupFindings(findings: ReadonlyArray<A11yFinding>): Array<{
    rule: string;
    impact: A11yImpact;
    count: number;
    first: A11yFinding;
}>;
/**
 * Sequential keyboard focus order, the way Tab walks it: positive tabindex
 * first (ascending, then document order), then everything else focusable in
 * document order. Disabled, hidden, inert, and tabindex=-1 elements are
 * skipped.
 */
export declare function tabOrder(root: Element | null, limit?: number): Element[];
export interface Landmark {
    element: Element;
    role: string;
    label: string;
}
export declare function landmarks(root: Element | null): Landmark[];
export interface HeadingEntry {
    element: Element;
    level: number;
    text: string;
    /** Skipped a level relative to the previous heading. */
    skipped: boolean;
}
export declare function headingOutline(root: Element | null): HeadingEntry[];
export interface AxNode {
    id: string;
    role: string;
    name: string;
    element: Element;
    states: string[];
    focusable: boolean;
    children: AxNode[];
}
/**
 * The accessibility tree as assistive tech sees it: elements with a role or a
 * name become nodes; generic wrappers are flattened away; aria-hidden and
 * display:none subtrees are removed.
 */
export declare function accessibilityTree(root: Element | null, limit?: number): AxNode[];
/** What a screen reader would announce on focusing `element`: `"Save", button, disabled`. */
export declare function announce(element: Element): string;
