import { ComponentLibrary } from '../library/types.js';
export interface ComponentPropSchema {
    name: string;
    type: string;
    optional: boolean;
    positional: boolean;
    required: boolean;
    enum?: readonly string[];
    aliases?: readonly string[];
    description?: string;
}
export interface ComponentSchemaEntry {
    name: string;
    description: string;
    props: ComponentPropSchema[];
}
export interface LibrarySchema {
    version: 1;
    components: ComponentSchemaEntry[];
}
/**
 * Build a stable, machine-readable JSON schema of every component in a
 * library — names, props, types, enums, positional/required flags. Feed it
 * to an editor for autocomplete / hover docs, or diff it across releases.
 */
export declare function componentSchema(library: ComponentLibrary): LibrarySchema;
/**
 * Suggest the closest real component name(s) for a misspelling (XIV.4) — the
 * "did you mean `Button`?" experience. Returns up to `limit` names within a
 * small edit distance, best first.
 */
export declare function suggestComponent(name: unknown, library: ComponentLibrary, limit?: number): string[];
/**
 * Map a Tailwind-style class string to the closest Aktion `sx` object (XIV.2).
 * A pragmatic migration aid:
 *
 *  - spacing / color / typography / flex / grid / radius / shadow / sizing /
 *    position / z-index / overflow utilities map onto sx tokens;
 *  - responsive prefixes (`md:p-8`) become sx breakpoint maps
 *    (`{ p: { base: "m", md: "l" } }`, 2xl folds onto xl);
 *  - state prefixes (`hover:bg-primary`) become `sx.states` entries for the
 *    props the bounded state engine supports;
 *  - anything unrecognised is returned under `_unmapped` so callers can
 *    surface a warning instead of silently dropping intent.
 */
export declare function tailwindToSx(classString: unknown): Record<string, unknown>;
/**
 * Map a raw CSS declaration string to the closest Aktion `sx` object. The
 * complement of `tailwindToSx` for migrations from inline `style="..."`,
 * CSS Modules, or any hand-written rule body:
 *
 *   cssToSx("display:flex; gap:12px; padding:0 16px; color:#1a1a1a")
 *   // → { display: "flex", gap: "12px", px: "16px", py: "0", color: "#1a1a1a" }
 *
 * Pass a full rule (`.btn { … }`) and the first rule body is used. Anything
 * the bounded `sx` surface can't express (transforms, transitions, raw
 * gradients, `box-shadow`, …) is returned verbatim under `_unmapped` so the
 * caller can drop it into a `Css(...)` / `Styles(...)` escape hatch instead of
 * losing it silently.
 */
export declare function cssToSx(cssText: unknown): Record<string, unknown>;
/**
 * Extract the static declarations from a styled-components / emotion template
 * into an `sx` object. Accepts the template string (or the raw strings array
 * of a tagged template) — `${…}` interpolations are stripped, and nested
 * blocks (`&:hover { … }`, `@media { … }`, child selectors) are dropped into
 * `_unmapped` since the bounded `sx` base layer can't host them (use
 * `sx.hover` / `Styles(...)` for those):
 *
 *   styledToSx(`
 *     display: flex;
 *     padding: 12px 16px;
 *     color: ${p => p.color};
 *     &:hover { opacity: 0.8; }
 *   `)
 *   // → { display: "flex", px: "16px", py: "12px", _unmapped: ["&:hover { … }"] }
 */
export declare function styledToSx(template: unknown): Record<string, unknown>;
export interface GalleryOptions {
    /** Page title (default "Aktion Components"). */
    title?: string;
    /** Only include components whose name matches this filter. */
    include?: (name: string) => boolean;
}
/**
 * Build a static HTML "Storybook"-style gallery from a library's schema
 * (XIV.5): one card per component listing its description and prop table.
 * Self-contained (inline CSS); write it to a file or serve it for browsing.
 */
export declare function buildGallery(library: ComponentLibrary, options?: GalleryOptions): string;
