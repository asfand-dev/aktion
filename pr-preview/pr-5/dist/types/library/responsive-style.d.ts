/**
 * Responsive `sx` support (suggestions-global I.5).
 *
 * Emits atomic, deduped CSS classes with `@media (min-width: …)` rules into a
 * single shared constructable stylesheet that every shadow root adopts
 * alongside the main component stylesheet. This lets `sx` values be breakpoint
 * maps (`{ base, sm, md, lg, xl }`) that emit real media queries — not just
 * the resolved base value — while staying bounded (the caller only passes
 * already-sanitised CSS prop/value pairs).
 *
 * In environments without constructable stylesheets (some headless DOMs),
 * `responsiveClassFor` returns null and the caller falls back to emitting the
 * base value inline.
 */
/** Breakpoint → min-width (px). `base` is the 0-width default (no media query). */
export declare const BREAKPOINT_MIN: Record<string, number>;
/**
 * Lazily create (once) the shared dynamic stylesheet used for responsive
 * atomic rules. Returns null when constructable stylesheets are unavailable.
 */
export declare function getResponsiveSheet(): CSSStyleSheet | null;
export interface ResponsiveGroup {
    /** Breakpoint key (`base` | `sm` | `md` | `lg` | `xl`). */
    bp: string;
    /** Already-resolved + sanitised `[cssProperty, cssValue]` pairs. */
    decls: Array<[string, string]>;
}
/**
 * Build (or reuse) a deduped atomic class for a set of per-breakpoint
 * declarations. Rules are inserted in ascending breakpoint order so the
 * cascade resolves correctly at any viewport width. Returns the class name,
 * or null when responsive emission is unavailable (caller emits base inline).
 */
export declare function responsiveClassFor(groups: ResponsiveGroup[]): string | null;
/** True when a value is a responsive breakpoint map (`{ base|sm|md|lg|xl: … }`). */
export declare function isResponsiveMap(v: unknown): v is Record<string, unknown>;
export interface StateRuleGroup {
    /** State key (`hover` | `focus` | `active` | `disabled` | …). */
    state: string;
    /** Already-resolved + sanitised `[cssProperty, cssValue]` pairs. */
    decls: Array<[string, string]>;
}
/**
 * Build (or reuse) a deduped atomic class for arbitrary interaction-state CSS
 * (suggestions-global I.4) — `:hover` / `:focus` / `:active` / `:disabled` /
 * `:focus-visible` / `:checked`, plus `group-hover` (fires when an ancestor
 * `.ak-group` is hovered). The declarations are caller-sanitised
 * `[property, value]` pairs, so the surface stays bounded. Returns the class
 * name, or null when the shared stylesheet is unavailable.
 */
export declare function stateClassFor(groups: StateRuleGroup[]): string | null;
