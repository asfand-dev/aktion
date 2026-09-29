/**
 * `sx` — bounded, token-aware style-intent layer (suggestions-global Part I).
 *
 * Every component accepts a universal `sx` prop (plus `animate`, `id`,
 * `anchor`, `className`, `style`, `testId`). These are NOT raw CSS: each value is a
 * design-token reference, a small enum, or a sanitised scalar, so the surface
 * stays theme-safe, XSS-safe, and enumerable by an LLM.
 *
 * The evaluator collects these into `node.universal`; the renderer calls
 * {@link applyUniversal} on the element returned by a component's `render`.
 * One hook styles all 196 components without editing each spec.
 */
/**
 * Serialize an `sx` object into a safe inline-style string + utility classes.
 * Unknown keys are ignored. Hover/focus map to predefined utility classes
 * (no dynamic CSS injection) so the surface stays bounded. Responsive map
 * values (`{ base, md, … }`) emit real `@media` rules via atomic classes.
 */
export declare function serializeSx(sxRaw: unknown): {
    style: string;
    classes: string[];
};
/**
 * Resolve the `animate` universal prop → class + inline timing overrides.
 * Accepts a preset string or `{ preset, delay, duration, repeat }`.
 */
export declare function resolveAnimate(raw: unknown): {
    classes: string[];
    style: string;
};
export declare const UNIVERSAL_PROP_NAMES: Set<string>;
export interface UniversalProps {
    sx?: unknown;
    animate?: unknown;
    id?: unknown;
    anchor?: unknown;
    className?: unknown;
    class?: unknown;
    style?: unknown;
    aria?: unknown;
    data?: unknown;
    dataAttrs?: unknown;
    role?: unknown;
    tooltip?: unknown;
    hidden?: unknown;
    testId?: unknown;
    testid?: unknown;
}
/**
 * Apply the universal-prop channel to a rendered element. Merges with any
 * inline style/classes the component already set. Safe to call with a
 * non-Element (no-ops) and with an empty `universal` (no-ops).
 */
export declare function applyUniversal(node: Node, universal: UniversalProps | null | undefined): void;
