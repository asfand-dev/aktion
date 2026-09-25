/**
 * Font Awesome integration for `<aktion-app>`.
 *
 * Icons across the library are referenced by Font Awesome name (without the
 * `fa-` prefix). The optional `variant:` prefix (`solid:`, `regular:`,
 * `brands:`) picks the FA style — when omitted, it defaults to `solid`.
 *
 * The custom element auto-loads the CDN stylesheet on connect (once per
 * page and once per shadow root) so host apps do not have to add anything
 * to make icons render.
 */
export declare const FONT_AWESOME_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";
export declare const FONT_AWESOME_VERSION = "6.7.2";
/**
 * Subresource-integrity hash for {@link FONT_AWESOME_CDN_URL}.
 *
 * Empty by default: publishing a wrong hash would silently break icon
 * rendering for every consumer, and the digest must be verified against the
 * exact file the pinned version serves before it can be asserted here. Set it
 * (`sha384-…`) to have the browser reject a tampered stylesheet, or self-host
 * the CSS and never call `ensureFontAwesomeLoaded`.
 */
export declare const FONT_AWESOME_CDN_INTEGRITY = "";
/**
 * Inject the Font Awesome stylesheet into `document.head` (once per page)
 * and into the given shadow root (once per instance) so icon classes
 * resolve both outside and inside the custom element.
 *
 * Safe to call from every `connectedCallback`.
 */
export declare function ensureFontAwesomeLoaded(shadow: ShadowRoot): void;
/**
 * Resolve a Aktion icon string into Font Awesome class tokens.
 *
 * - `"house"` → `["fa-solid", "fa-house"]`
 * - `"regular:star"` → `["fa-regular", "fa-star"]`
 * - `"brands:github"` → `["fa-brands", "fa-github"]`
 *
 * Invisible Unicode glyph modifiers (variation selectors U+FE0E/U+FE0F and
 * the zero-width joiner U+200D) are stripped before validation — they often
 * sneak in when an LLM copies an FA name out of a doc that previously used
 * an emoji glyph, and would otherwise break ASCII-only validation.
 *
 * Returns an empty array for blank input or names that contain non-ASCII
 * characters (legacy emoji input — the caller renders those inline as text).
 */
export declare function resolveIconClasses(value: unknown): string[];
/**
 * True when the value should be treated as a Font Awesome name (vs legacy
 * emoji text that the renderer should print inline).
 */
export declare function isIconName(value: unknown): value is string;
export declare const ICON_SIZES: readonly ["xs", "sm", "md", "lg", "xl"];
export type IconSize = (typeof ICON_SIZES)[number];
export declare function isIconSize(value: unknown): value is IconSize;
/**
 * Register one or more custom icons. Each value is inline SVG markup — either
 * a full `<svg>…</svg>` element or just its inner shapes (wrapped in a
 * 24×24 `viewBox` svg automatically). Returns the names successfully added.
 */
export declare function registerIcons(record: unknown): string[];
/** Look up a registered custom icon's sanitised SVG markup, or null. */
export declare function getCustomIcon(name: unknown): string | null;
/** True when `name` resolves to a registered custom icon. */
export declare function hasCustomIcon(name: unknown): boolean;
