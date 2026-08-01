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

/** SVG namespace URI. */
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Elements that may appear in sanitised SVG. Shapes, grouping, gradients,
 * text, markers, and filter primitives — everything needed for icons,
 * illustrations, and data-viz overlays.
 *
 * Deliberately absent, and why:
 *   - `script`                     — script execution.
 *   - `a`                          — SVG anchors execute `javascript:` hrefs.
 *   - `foreignObject`              — re-enters the HTML namespace, so any HTML
 *                                    element (including `<script>`) becomes
 *                                    reachable.
 *   - `style`                      — CSS injection (`@import`, background
 *                                    beacons, full-cover overlays).
 *   - `image`                      — fetches an external URL (tracking beacon)
 *                                    and can reference a nested SVG document.
 *   - `iframe`/`embed`/`object`    — nested browsing contexts.
 *   - `handler`/`listener`         — SVG 1.2 / SVG Tiny event binding.
 *   - `set`                        — assigns an arbitrary attribute value,
 *                                    which defeats attribute sanitisation.
 *   - `discard`                    — removes elements at a scheduled time.
 */
const ALLOWED_ELEMENTS = new Set<string>([
  "svg", "g", "defs", "symbol", "use", "title", "desc", "metadata", "switch",
  // Shapes
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  // Text
  "text", "tspan", "textPath",
  // Paint servers / reusable paint
  "linearGradient", "radialGradient", "stop", "pattern", "marker",
  "clipPath", "mask",
  // Animation (attributeName is restricted separately — see SAFE_ANIMATABLE)
  "animate", "animateTransform", "animateMotion", "mpath",
  // Filters
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite",
  "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight",
  "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
  "feGaussianBlur", "feMerge", "feMergeNode", "feMorphology", "feOffset",
  "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
]);

/**
 * Attributes that may survive on an allowed element. Geometry, presentation,
 * and animation timing. `on*` handlers are excluded by construction (they are
 * simply not in the set), as are `xlink:*` / `xml:*` namespaced attributes
 * apart from the `href` handled explicitly below.
 */
const ALLOWED_ATTRS = new Set<string>([
  // Structure / identity
  "id", "class", "viewbox", "preserveaspectratio", "xmlns", "version",
  "width", "height", "x", "y", "dx", "dy", "rx", "ry", "cx", "cy", "r",
  "x1", "y1", "x2", "y2", "d", "points", "transform", "transform-origin",
  "gradienttransform", "patterntransform",
  // Paint
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "stroke-opacity", "stroke-miterlimit", "opacity", "color",
  "stop-color", "stop-opacity", "offset",
  "gradientunits", "patternunits", "patterncontentunits", "spreadmethod",
  "fx", "fy", "fr",
  // Text
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "letter-spacing", "word-spacing", "text-anchor", "dominant-baseline",
  "alignment-baseline", "baseline-shift", "text-decoration", "textlength",
  "lengthadjust", "writing-mode", "direction", "unicode-bidi",
  // Clipping / masking / markers
  "clip-path", "clip-rule", "mask", "maskunits", "maskcontentunits",
  "clippathunits", "marker-start", "marker-mid", "marker-end",
  "markerwidth", "markerheight", "markerunits", "refx", "refy", "orient",
  "overflow", "display", "visibility", "shape-rendering", "vector-effect",
  "paint-order", "mix-blend-mode", "isolation",
  // Filters
  "filter", "filterunits", "primitiveunits", "result", "in", "in2", "mode",
  "type", "values", "tablevalues", "slope", "intercept", "amplitude",
  "exponent", "operator", "radius", "stddeviation", "basefrequency",
  "numoctaves", "seed", "stitchtiles", "scale", "xchannelselector",
  "ychannelselector", "k1", "k2", "k3", "k4", "order", "kernelmatrix",
  "divisor", "bias", "targetx", "targety", "edgemode", "preservealpha",
  "surfacescale", "diffuseconstant", "specularconstant", "specularexponent",
  "azimuth", "elevation", "pointsatx", "pointsaty", "pointsatz",
  "limitingconeangle", "z", "flood-color", "flood-opacity",
  "lighting-color", "color-interpolation-filters",
  // Animation timing (attributeName is validated against SAFE_ANIMATABLE)
  "attributename", "attributetype", "from", "to", "by", "dur", "begin", "end",
  "repeatcount", "repeatdur", "fill-freeze", "calcmode", "keytimes",
  "keysplines", "additive", "accumulate", "restart", "path", "rotate",
  "min", "max",
  // Accessibility
  "role", "aria-label", "aria-labelledby", "aria-describedby", "aria-hidden",
]);

/**
 * Attribute names a SMIL animation element may target. Animating `href`,
 * `style`, or an event handler would let markup assign a value that the
 * attribute sanitiser has already vetted the *static* version of — so the
 * animation targets are restricted to inert presentation attributes.
 */
const SAFE_ANIMATABLE = new Set<string>([
  "x", "y", "cx", "cy", "r", "rx", "ry", "width", "height", "d", "points",
  "opacity", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
  "stroke-dasharray", "stroke-dashoffset", "transform", "offset",
  "stop-color", "stop-opacity", "visibility", "display", "font-size",
  "x1", "y1", "x2", "y2", "gradientTransform", "patternTransform",
]);

/** Elements whose `href` may only ever be a same-document fragment. */
const FRAGMENT_ONLY_HREF = new Set<string>(["use", "mpath", "textPath"]);

/** Hard caps so a hostile document cannot make sanitising expensive. */
const MAX_INPUT_LENGTH = 64 * 1024;
const MAX_NODES = 4096;
const MAX_DEPTH = 32;

/** The sanitised result: children to append, plus vetted root attributes. */
export interface SafeSvg {
  /** Sanitised child nodes, already imported into the live document. */
  children: Node[];
  /** Attributes taken from a wrapping `<svg>` root, if the input had one. */
  rootAttrs: Record<string, string>;
}

/**
 * Build an inert document to parse in. Cached — creating one per call would
 * be wasteful when a list renders many icons.
 */
let inertDoc: Document | null = null;
function getInertDocument(): Document | null {
  if (inertDoc) return inertDoc;
  try {
    if (typeof document === "undefined" || !document.implementation?.createHTMLDocument) return null;
    inertDoc = document.implementation.createHTMLDocument("");
    return inertDoc;
  } catch {
    return null;
  }
}

/**
 * Validate an `href` / `xlink:href` value. Same-document fragments (`#id`) are
 * always fine. For elements that may legitimately point elsewhere we allow
 * nothing at all — every allowed element here either references a fragment or
 * has no business fetching a URL.
 */
function safeSvgHref(value: string, localName: string): string | null {
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned.startsWith("#")) return null;
  if (!FRAGMENT_ONLY_HREF.has(localName)) return null;
  // A fragment identifier, so only the local id syntax is permitted.
  if (!/^#[A-Za-z_][\w.:-]*$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Sanitise an inline `style` attribute on an SVG element. Only simple
 * `prop: value` declarations from a conservative charset survive — no
 * `url(...)` (request beacons), no `@` rules, no escapes, no braces.
 */
function safeSvgStyle(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 512) return null;
  // Reject the structural characters that would let a declaration escape its
  // own scope, then require the whole value to match a conservative charset.
  if (/[<>{}@\\"']/.test(raw)) return null;
  if (/url\s*\(|expression\s*\(|behavior\s*:|image-set\s*\(|element\s*\(|--/i.test(raw)) return null;
  if (!/^[a-zA-Z0-9#%.,()\s:;+/*_-]+$/.test(raw)) return null;
  return raw;
}

/**
 * Strip every element and attribute outside the allow-list, in place.
 * Returns `false` when the tree busts a resource cap.
 */
function scrub(root: Element): boolean {
  let nodeCount = 0;

  const visit = (element: Element, depth: number): boolean => {
    if (depth > MAX_DEPTH) return false;
    nodeCount += 1;
    if (nodeCount > MAX_NODES) return false;

    // Recurse first, snapshotting children — `remove()` mutates the list.
    for (const child of Array.from(element.children)) {
      const name = child.localName;
      // Namespace check: an element that is not in the SVG namespace got
      // there via foreign content and is never wanted.
      if (child.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(name)) {
        child.remove();
        continue;
      }
      if (!visit(child, depth + 1)) return false;
    }

    for (const attrName of Array.from(element.getAttributeNames())) {
      const lower = attrName.toLowerCase();
      const value = element.getAttribute(attrName) ?? "";

      // Event handlers, and anything namespaced that we did not opt into.
      if (lower.startsWith("on")) { element.removeAttribute(attrName); continue; }

      if (lower === "href" || lower === "xlink:href") {
        const safe = safeSvgHref(value, element.localName);
        element.removeAttribute(attrName);
        if (safe) element.setAttribute("href", safe);
        continue;
      }
      if (lower === "style") {
        const safe = safeSvgStyle(value);
        element.removeAttribute(attrName);
        if (safe) element.setAttribute("style", safe);
        continue;
      }
      if (lower === "attributename") {
        // Only meaningful on animation elements, and only for inert targets.
        if (!SAFE_ANIMATABLE.has(value.trim())) {
          // Drop the whole animation rather than leave it half-configured.
          element.remove();
          return true;
        }
        continue;
      }
      if (lower.startsWith("data-") || lower.startsWith("aria-")) continue;
      if (!ALLOWED_ATTRS.has(lower)) element.removeAttribute(attrName);
    }
    return true;
  };

  return visit(root, 0);
}

/**
 * Parse and sanitise SVG markup. Accepts either a full `<svg>…</svg>` element
 * or bare inner markup (`<path …/><circle …/>`). Returns `null` when the
 * input is empty, oversized, unparseable, or sanitises down to nothing.
 */
export function sanitiseSvgMarkup(raw: unknown): SafeSvg | null {
  const source = typeof raw === "string" ? raw : "";
  if (!source || source.length > MAX_INPUT_LENGTH) return null;

  const doc = getInertDocument();
  if (!doc) return null;

  let host: Element;
  try {
    host = doc.createElementNS(SVG_NS, "svg");
    // Parsing happens inside an inert document: no browsing context, so no
    // script runs and no subresource is fetched regardless of the payload.
    host.innerHTML = source;
  } catch {
    return null;
  }

  // A single wrapping <svg> root means the author passed a whole element —
  // unwrap it so its children become ours and its attributes are vetted as
  // root attributes.
  let container: Element = host;
  const rootAttrs: Record<string, string> = {};
  const onlyChild = host.children.length === 1 ? host.firstElementChild : null;
  if (onlyChild && onlyChild.localName === "svg" && onlyChild.namespaceURI === SVG_NS) {
    container = onlyChild;
  }

  if (!scrub(container)) return null;

  if (container !== host) {
    for (const name of container.getAttributeNames()) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) continue;
      if (!ALLOWED_ATTRS.has(lower) && !lower.startsWith("data-") && !lower.startsWith("aria-")) continue;
      rootAttrs[lower] = container.getAttribute(name) ?? "";
    }
  }

  const children: Node[] = [];
  for (const node of Array.from(container.childNodes)) {
    // Only elements and text survive — comments and CDATA carry no value here
    // and processing instructions are dropped outright.
    if (node.nodeType === 1 /* Element */) {
      children.push(document.importNode(node, true));
    } else if (node.nodeType === 3 /* Text */) {
      children.push(document.createTextNode(node.textContent ?? ""));
    }
  }
  if (children.length === 0) return null;
  return { children, rootAttrs };
}

/**
 * Cheap validity gate for registration-time checks (`registerIcons`). Returns
 * `true` when the markup yields at least one node after sanitisation. The
 * markup is still re-sanitised at render time — this only rejects values that
 * could never render anything.
 */
export function isRenderableSvgMarkup(raw: unknown): boolean {
  return sanitiseSvgMarkup(raw) !== null;
}
