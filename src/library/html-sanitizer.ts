/**
 * Rich-text HTML sanitiser — allow-list based.
 *
 * Used by the two places in the library that need to turn an HTML *string*
 * into DOM: the Markdown renderer (a string we build ourselves) and
 * `RichTextEditor` (a `value` prop, which is fully untrusted — it comes from
 * the DSL, from a bound `$variable`, and therefore from any HTTP/WebSocket
 * response or storage value the program writes into it).
 *
 * Same strategy as `svg-sanitizer.ts`: parse in an **inert document** (no
 * browsing context, so no script runs and no subresource is fetched), walk the
 * tree against an allow-list, then `importNode` the survivors into the live
 * document. Callers append real nodes, so no `innerHTML` assignment ever
 * touches the live DOM.
 */

import { sanitiseHref, sanitiseImageSrc } from "./utils.js";

/** Elements permitted in rich text. Structure, inline emphasis, lists, tables. */
const ALLOWED_ELEMENTS = new Set<string>([
  "p", "br", "hr", "div", "span",
  "strong", "b", "em", "i", "u", "s", "strike", "mark", "small",
  "sub", "sup", "code", "pre", "kbd", "samp", "var", "abbr", "cite", "q",
  "ul", "ol", "li", "dl", "dt", "dd", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "a", "img", "figure", "figcaption", "time",
]);

/**
 * Attributes permitted on any allowed element. `href`/`src` are handled
 * separately (they are sanitised); `style` is dropped outright — rich text has
 * no need for it and it is a clickjacking / beacon vector.
 *
 * `id` is deliberately absent: an attacker-chosen `id` is a DOM-clobbering
 * primitive and collides with the runtime's own element lookups.
 */
const ALLOWED_ATTRS = new Set<string>([
  "class", "title", "dir", "lang", "alt", "width", "height",
  "colspan", "rowspan", "headers", "scope", "abbr",
  "datetime", "cite", "loading", "decoding",
]);

/** Hard caps so a hostile document cannot make sanitising expensive. */
const MAX_INPUT_LENGTH = 512 * 1024;
const MAX_NODES = 8192;
const MAX_DEPTH = 64;

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

/** Strip disallowed elements and attributes in place. `false` on cap bust. */
function scrub(root: Element): boolean {
  let nodeCount = 0;

  const visit = (element: Element, depth: number): boolean => {
    if (depth > MAX_DEPTH) return false;
    nodeCount += 1;
    if (nodeCount > MAX_NODES) return false;

    for (const child of Array.from(element.children)) {
      if (!ALLOWED_ELEMENTS.has(child.localName)) {
        // Unwrap rather than delete, so a stray <font> or <section> does not
        // silently swallow the user's text along with it.
        const parent = child.parentNode;
        if (parent) {
          while (child.firstChild) parent.insertBefore(child.firstChild, child);
        }
        child.remove();
        continue;
      }
      if (!visit(child, depth + 1)) return false;
    }

    for (const attrName of Array.from(element.getAttributeNames())) {
      const lower = attrName.toLowerCase();
      const value = element.getAttribute(attrName) ?? "";

      if (lower.startsWith("on")) { element.removeAttribute(attrName); continue; }

      if (lower === "href") {
        element.removeAttribute(attrName);
        const safe = sanitiseHref(value, "");
        if (safe) element.setAttribute("href", safe);
        continue;
      }
      if (lower === "src") {
        element.removeAttribute(attrName);
        const safe = sanitiseImageSrc(value);
        if (safe) element.setAttribute("src", safe);
        continue;
      }
      if (lower === "target") {
        // Keep the affordance but never without `noopener` (tabnabbing).
        element.removeAttribute(attrName);
        if (value === "_blank") {
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
        continue;
      }
      if (lower === "rel") continue; // set alongside target above
      if (lower.startsWith("data-") || lower.startsWith("aria-")) continue;
      if (!ALLOWED_ATTRS.has(lower)) element.removeAttribute(attrName);
    }
    return true;
  };

  return visit(root, 0);
}

/**
 * Sanitise an HTML string and return live-document nodes for it. Returns an
 * empty array when the input is empty, oversized, or busts a resource cap.
 */
export function sanitiseHtmlToNodes(raw: unknown): Node[] {
  const source = typeof raw === "string" ? raw : "";
  if (!source || source.length > MAX_INPUT_LENGTH) return [];

  const doc = getInertDocument();
  if (!doc) return [];

  let host: Element;
  try {
    host = doc.createElement("div");
    // Inert document: parsing this cannot execute script or fetch anything.
    host.innerHTML = source;
  } catch {
    return [];
  }

  if (!scrub(host)) return [];

  const out: Node[] = [];
  for (const node of Array.from(host.childNodes)) {
    if (node.nodeType === 1 /* Element */) out.push(document.importNode(node, true));
    else if (node.nodeType === 3 /* Text */) out.push(document.createTextNode(node.textContent ?? ""));
  }
  return out;
}

/**
 * Replace `target`'s children with the sanitised parse of `html`.
 *
 * This is the ONLY way the library turns an HTML string into live DOM. It
 * exists as a named function (rather than a magic `html` attribute key on the
 * generic `el()` helper) so that every such conversion is visible at the call
 * site and to static analysis.
 */
export function setSanitisedHtml(target: Element, html: unknown): void {
  target.replaceChildren(...sanitiseHtmlToNodes(html));
}

/**
 * Serialise an element's children back to an HTML string, sanitised.
 *
 * `RichTextEditor` reads `contenteditable` content back out to store it in a
 * `$variable`. Sanitising on the way out matters as much as on the way in: the
 * user can paste arbitrary markup into a `contenteditable`, and an unsanitised
 * read-back would persist it and re-inject it on the next render.
 */
export function readSanitisedHtml(target: Element): string {
  const doc = getInertDocument();
  if (!doc) return "";
  let host: Element;
  try {
    host = doc.createElement("div");
    host.innerHTML = target.innerHTML;
  } catch {
    return "";
  }
  if (!scrub(host)) return "";
  return host.innerHTML;
}
