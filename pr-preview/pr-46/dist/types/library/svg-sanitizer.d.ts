/**
 * SVG sanitiser — allow-list based.
 *
 * Two features let an Aktion program supply raw SVG markup: the `Svg`
 * component (`Svg("<path …/>")`) and custom icons
 * (`$theme({ icons: { logo: "<svg …>" } })`). Both are reachable from
 * untrusted DSL, so the markup is treated as hostile.
 *
 * The previous implementation was a regex *blocklist* run against the raw
 * string, which is the wrong shape for this job — the HTML parser decodes
 * entities and normalises whitespace after the check, so
 * `<a href="&#106;avascript:alert(1)">` sailed straight past a
 * `/javascript\s*:/` test and became a live `javascript:` URL. A blocklist
 * also has to enumerate every dangerous construct, and SVG has many
 * (`<a>`, SMIL `<animate attributeName="href">`, `<style>`, `<use>` pointing
 * at an external document, …).
 *
 * Instead we:
 *   1. Parse the markup in an **inert document** (`createHTMLDocument`), which
 *      has no browsing context — scripts never run and no resource is
 *      fetched, so parsing itself is side-effect free.
 *   2. Walk the resulting tree and drop every element and attribute that is
 *      not explicitly allowed.
 *   3. `importNode` the surviving nodes into the live document.
 *
 * The live DOM therefore never sees an `innerHTML` assignment, which also
 * clears the `js/xss-through-dom` class of static-analysis findings.
 */
/** The sanitised result: children to append, plus vetted root attributes. */
export interface SafeSvg {
    /** Sanitised child nodes, already imported into the live document. */
    children: Node[];
    /** Attributes taken from a wrapping `<svg>` root, if the input had one. */
    rootAttrs: Record<string, string>;
}
/**
 * Parse and sanitise SVG markup. Accepts either a full `<svg>…</svg>` element
 * or bare inner markup (`<path …/><circle …/>`). Returns `null` when the
 * input is empty, oversized, unparseable, or sanitises down to nothing.
 */
export declare function sanitiseSvgMarkup(raw: unknown): SafeSvg | null;
/**
 * Cheap validity gate for registration-time checks (`registerIcons`). Returns
 * `true` when the markup yields at least one node after sanitisation. The
 * markup is still re-sanitised at render time — this only rejects values that
 * could never render anything.
 */
export declare function isRenderableSvgMarkup(raw: unknown): boolean;
