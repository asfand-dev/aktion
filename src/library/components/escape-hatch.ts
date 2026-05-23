/**
 * Escape-hatch components — `HTMLTag` renders an arbitrary allow-listed HTML
 * tag (with attributes and children), and `Styles` renders a scoped
 * `<style>` block. Both exist for the rare case where the standard
 * component catalogue cannot express what the author needs (custom layout,
 * embedded SVG, third-party widget container, etc.).
 *
 * Both components run aggressive sanitisation so an LLM-supplied tag name,
 * attribute, or stylesheet cannot smuggle script execution into the page.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, sanitiseHref, sanitiseImageSrc,
} from "../utils.js";

/**
 * Tags `HTMLTag` will render. Anything outside this set falls back to a
 * `<div>` so a hostile / typo'd LLM response never lands a `<script>` or
 * top-level document tag in the DOM. The list is intentionally broad —
 * structural, text, table, media, and form primitives — so authors can
 * compose almost anything HTML supports without raw `innerHTML` access.
 *
 * SVG / MathML are intentionally excluded: their namespaces require a
 * different `createElement` path. Authors who need vector graphics
 * should reach for `Image` / `Icon` instead.
 */
const ALLOWED_TAGS = new Set<string>([
  "div", "span", "p", "section", "article", "header", "footer", "main",
  "nav", "aside", "figure", "figcaption", "details", "summary",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "colgroup", "col",
  "a", "img", "picture", "source", "video", "audio", "track",
  "small", "strong", "em", "b", "i", "u", "s", "mark", "code", "pre",
  "kbd", "samp", "var", "sub", "sup", "abbr", "cite", "blockquote", "q",
  "time", "address", "ins", "del", "ruby", "rt", "rp", "bdi", "bdo",
  "br", "hr", "wbr", "hgroup",
  "label", "fieldset", "legend", "progress", "meter", "output",
]);

/**
 * Attribute name matcher. Accepts standard HTML attributes plus
 * `data-*` / `aria-*`. Forbids `on*` event handlers and any name that
 * contains characters which could break out of the attribute boundary.
 */
const ATTR_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_:-]*$/;

/**
 * Attribute names that may carry URL-shaped values. We funnel them through
 * `sanitiseHref` / `sanitiseImageSrc` so a `javascript:` payload from an
 * LLM response can never land on a clickable / loadable surface.
 */
const URL_ATTRS_HREF = new Set(["href", "ping", "action", "formaction"]);
const URL_ATTRS_SRC = new Set(["src", "poster"]);

/**
 * Inline `style` attribute sanitiser. Mirrors the rules used by `Text`'s
 * `style` prop — block angle brackets, `expression()`, `javascript:`,
 * `behavior:`, and `@import`. Returns the empty string when the value is
 * rejected so the caller can drop the attribute entirely.
 */
function sanitiseInlineStyleAttr(value: unknown): string {
  const raw = asString(value).trim();
  if (!raw) return "";
  if (/[<>]/.test(raw)) return "";
  if (/\bexpression\s*\(|\bjavascript\s*:|\bbehavior\s*:|@import\b/i.test(raw)) return "";
  return raw;
}

/**
 * Coerce a tag name into a safe lower-case token. Falls back to `div` for
 * anything outside the allow-list so the rendered DOM is always
 * predictable.
 */
function resolveTagName(input: unknown): string {
  const name = asString(input).trim().toLowerCase();
  if (!name) return "div";
  if (!ALLOWED_TAGS.has(name)) return "div";
  return name;
}

/**
 * Build the attribute object the DOM should receive. We keep the shape
 * small (string values only) so the existing `el(tag, attrs, children)`
 * helper can apply them via `setAttribute` — bypassing innerHTML and the
 * "boolean attribute" coercion path that would otherwise let a `false`
 * value slip onto the DOM as the literal string `"false"`.
 */
function buildAttrs(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key) continue;
    if (!ATTR_NAME_RE.test(key)) continue;
    const lower = key.toLowerCase();
    if (lower.startsWith("on")) continue;
    if (rawValue === null || rawValue === undefined || rawValue === false) continue;

    if (lower === "style") {
      const style = sanitiseInlineStyleAttr(rawValue);
      if (style) out.style = style;
      continue;
    }
    if (URL_ATTRS_HREF.has(lower)) {
      const safe = sanitiseHref(rawValue, "");
      if (safe) out[key] = safe;
      continue;
    }
    if (URL_ATTRS_SRC.has(lower)) {
      const safe = sanitiseImageSrc(rawValue);
      if (safe) out[key] = safe;
      continue;
    }
    out[key] = rawValue === true ? "" : asString(rawValue);
  }
  return out;
}

export const HTMLTag: ComponentSpec = {
  name: "HTMLTag",
  description:
    "Escape-hatch primitive that renders an allow-listed HTML tag with " +
    "the given attributes and children. Use ONLY when the standard " +
    "component catalogue cannot express the markup (custom semantic " +
    "elements, inline SVG, third-party widget mounts). Tag names outside " +
    "the allow-list collapse to `div`. Attribute names matching `on*` " +
    "(event handlers) are dropped, `href`/`src` are sanitised, and " +
    "`style` is filtered for `expression()` / `javascript:` / `@import`. " +
    "Pass children as an array of components — strings render as text " +
    "nodes.",
  props: [
    { name: "tag", type: "string", positional: true, required: true, description: "HTML tag name (e.g. \"div\", \"section\", \"svg\"). Falls back to `div` when outside the allow-list." },
    { name: "attributes", type: "object", optional: true, aliases: ["attrs", "props"], description: "Plain object of attribute name → value pairs (e.g. `{ class: \"hero\", \"data-id\": 1 }`). `on*` handlers are dropped." },
    { name: "children", type: "Node[]", optional: true, description: "Child components or text nodes to render inside the tag." },
  ],
  render: (_node, props, helpers) => {
    const tag = resolveTagName(props.tag);
    const attrs = buildAttrs(props.attributes);
    const root = el(tag as keyof HTMLElementTagNameMap, attrs);
    for (const child of asArray<unknown>(props.children)) {
      if (child === null || child === undefined) continue;
      if (typeof child === "string") {
        root.append(document.createTextNode(child));
        continue;
      }
      if (typeof child === "number" || typeof child === "boolean") {
        root.append(document.createTextNode(String(child)));
        continue;
      }
      root.append(helpers.renderNode(child));
    }
    return root;
  },
};

/**
 * Strip CSS payloads that would break out of a `<style>` element or
 * execute script in legacy browsers. We do not parse the stylesheet —
 * that would balloon the runtime — so the rules below are a defensive
 * subset:
 *
 *  - Reject anything containing `</style` so a malicious payload cannot
 *    close the tag and inject HTML/JS afterwards.
 *  - Reject `expression(`, `javascript:`, `behavior:`, `@import`, and
 *    `<script` so common XSS shapes never reach the DOM.
 *  - Drop the value when it exceeds a generous safety cap so a runaway
 *    paste cannot block the render thread.
 */
const STYLES_BLOCK_RE = /<\/style|<script|expression\s*\(|javascript\s*:|behavior\s*:|@import\b/i;
const STYLES_MAX_LENGTH = 64 * 1024;

function sanitiseStyleSheet(input: unknown): string {
  const raw = asString(input);
  if (!raw) return "";
  if (raw.length > STYLES_MAX_LENGTH) return "";
  if (STYLES_BLOCK_RE.test(raw)) return "";
  return raw;
}

export const Styles: ComponentSpec = {
  name: "Styles",
  description:
    "Escape-hatch primitive that injects a `<style>` block containing the " +
    "given CSS rules. Use ONLY when a layout cannot be expressed via " +
    "component props or the `Theme(...)` token map. The CSS is rendered " +
    "verbatim into the document so authors can target their own " +
    "`HTMLTag` markup or scope rules to a wrapper class. Payloads " +
    "containing `</style>`, `<script>`, `expression(`, `javascript:`, " +
    "`behavior:`, or `@import` are dropped for safety.",
  props: [
    { name: "css", type: "string", positional: true, required: true, aliases: ["content", "rules"], description: "Raw CSS text (e.g. `\".hero { color: red; }\"`)." },
  ],
  render: (_node, props) => {
    const css = sanitiseStyleSheet(props.css);
    const node = document.createElement("style");
    node.setAttribute("class", "rui-styles");
    if (css) node.textContent = css;
    return node;
  },
};
