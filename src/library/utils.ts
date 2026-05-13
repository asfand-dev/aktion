/**
 * DOM helpers shared by built-in components.
 */

import { resolveIconClasses, type IconSize } from "../icons/index.js";

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | boolean | null | undefined>,
  children?: ReadonlyArray<Node | string | null | undefined>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.setAttribute("class", String(value));
      else if (key === "html") node.innerHTML = String(value);
      else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, String(value));
    }
  }
  if (children) {
    for (const child of children) {
      if (child === null || child === undefined) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}

export function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value);
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined) return [];
  return [value as T];
}

export function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  return String(value);
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === null || value === undefined) return fallback;
  return Boolean(value);
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

/**
 * Strip characters that would let an LLM-supplied string break out of a
 * `url("...")` literal embedded in an inline `style` attribute. We keep the
 * common allowed URL characters and drop anything that could close the
 * literal, terminate the declaration, or introduce another rule. Returns an
 * empty string for non-string / blank input so callers can render a tasteful
 * fallback rather than a malformed `url("")`.
 */
const CSS_URL_FORBIDDEN = /["'\\\n\r<>;{}]/g;
export function sanitiseCssUrl(raw: string): string {
  if (!raw) return "";
  return raw.replace(CSS_URL_FORBIDDEN, "").trim();
}

/**
 * Validate a CSS length / dimension value (`280px`, `40vh`, `clamp(...)`,
 * `calc(...)`) so an LLM-supplied string cannot inject extra declarations
 * through an inline `style` attribute. We accept a small alphabet that covers
 * every standard CSS length token; anything outside that — or values that
 * are unreasonably long — falls back to `fallback`.
 */
const CSS_LENGTH_ALLOWED = /^[a-zA-Z0-9.%+\-*/\s(),]+$/;
export function sanitiseCssLength(raw: unknown, fallback: string): string {
  const trimmed = (asString(raw) ?? "").trim();
  if (!trimmed) return fallback;
  if (trimmed.length > 64) return fallback;
  if (!CSS_LENGTH_ALLOWED.test(trimmed)) return fallback;
  return trimmed;
}

/**
 * URL schemes that are allowed in anchor `href` and `window.open` targets.
 * Anything outside this allow-list (notably `javascript:`, `vbscript:`,
 * `data:` text payloads, `file:`) is rewritten to a safe placeholder so a
 * hostile LLM/tool response cannot smuggle script execution into a click.
 */
const SAFE_HREF_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * Sanitise an LLM-supplied `href` value before it lands on an anchor.
 *
 * - Fragments (`#anchor`), root-relative paths (`/about`), and pure query
 *   strings (`?q=foo`) are kept verbatim.
 * - Absolute URLs with an allow-listed scheme (`http`, `https`, `mailto`,
 *   `tel`) are kept verbatim.
 * - Anything else — `javascript:`, `vbscript:`, `data:text/html`,
 *   `file:`, protocol-relative `//host/path`, control characters — collapses
 *   to `fallback` (default `"#"`) so the click never navigates anywhere
 *   dangerous.
 *
 * This is the single chokepoint every component should call before assigning
 * `href`. The Markdown renderer has its own (stricter, HTML-escaping)
 * sibling, but the validation rules match so behaviour stays consistent.
 */
export function sanitiseHref(raw: unknown, fallback = "#"): string {
  const value = asString(raw).trim();
  if (!value) return fallback;
  // Strip control characters (including TAB / LF / CR) before scheme
  // detection — `java\tscript:` is a well-known browser-tolerated bypass.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!cleaned) return fallback;
  // Protocol-relative URLs (`//host/path`) inherit the page scheme and can
  // navigate to a hostile origin, so they are treated as unsafe.
  if (cleaned.startsWith("//")) return fallback;
  // Same-origin shapes — fragments, root-relative, query-only — are safe.
  if (
    cleaned.startsWith("#") ||
    cleaned.startsWith("/") ||
    cleaned.startsWith("?") ||
    cleaned.startsWith(".")
  ) {
    return cleaned;
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(cleaned);
  if (!schemeMatch) {
    // No scheme = a relative path like `about.html` or `page#foo`.
    return cleaned;
  }
  const scheme = schemeMatch[1]!.toLowerCase();
  if (!SAFE_HREF_SCHEMES.has(scheme)) return fallback;
  return cleaned;
}

/**
 * URL schemes that are safe to render inside an `<img src>`. Browsers do not
 * execute JavaScript from `img.src`, but a hostile `data:text/html` (in
 * theory ignored by image decoders), `javascript:`, or `vbscript:` is still
 * worth rejecting to keep the surface predictable for downstream consumers
 * that may copy `src` into other attribute slots.
 */
const SAFE_IMAGE_SCHEMES = new Set(["http", "https", "data", "blob"]);

/**
 * Sanitise an LLM-supplied image `src` before it lands on an `<img>`.
 *
 * Relative paths and same-origin shapes are kept as-is. Absolute URLs with
 * an allow-listed scheme (`http`, `https`, `data`, `blob`) are kept. Anything
 * else (`javascript:`, `vbscript:`, `file:`, …) returns the empty string so
 * callers can render their own placeholder.
 */
export function sanitiseImageSrc(raw: unknown): string {
  const value = asString(raw).trim();
  if (!value) return "";
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!cleaned) return "";
  // Protocol-relative is fine for images (browsers resolve to current scheme)
  // but we still bail because it leaks the host scheme into a foreign origin.
  if (cleaned.startsWith("//")) return "";
  if (
    cleaned.startsWith("/") ||
    cleaned.startsWith(".") ||
    cleaned.startsWith("?") ||
    cleaned.startsWith("#")
  ) {
    return cleaned;
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(cleaned);
  if (!schemeMatch) return cleaned;
  const scheme = schemeMatch[1]!.toLowerCase();
  if (!SAFE_IMAGE_SCHEMES.has(scheme)) return "";
  // For `data:` URLs, only allow `image/*` payloads — `data:text/html` would
  // render markup if a host accidentally copies the src into another sink.
  if (scheme === "data" && !/^data:image\//i.test(cleaned)) return "";
  return cleaned;
}

/**
 * Render an icon-typed prop into an `<i class="rui-icon fa-...">` element.
 *
 * Falls back to a `<span>` containing the raw string when the value is not
 * a Font Awesome name (legacy emoji input). Returns `null` when the value
 * is empty / nullish so callers can short-circuit.
 */
export function renderIcon(
  value: unknown,
  options: { className?: string; size?: IconSize | string } = {},
): HTMLElement | null {
  const text = asString(value);
  if (!text) return null;
  const classes = resolveIconClasses(text);
  const wrapperClass = ["rui-icon", options.className].filter(Boolean).join(" ");
  if (classes.length === 0) {
    return el("span", {
      class: wrapperClass,
      "data-icon-size": options.size ?? null,
    }, [text]);
  }
  return el("i", {
    class: `${wrapperClass} ${classes.join(" ")}`,
    "data-icon-size": options.size ?? null,
    "aria-hidden": "true",
  });
}
