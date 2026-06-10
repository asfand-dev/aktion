/**
 * DOM helpers shared by built-in components.
 */

import { resolveIconClasses, getCustomIcon, type IconSize } from "../icons/index.js";

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
 * Breakpoint keys honoured by responsive prop maps (Grid columns, Stack
 * direction, etc.). Ordered from narrow → wide so CSS only needs to chain
 * one `min-width` per breakpoint and naturally cascades.
 */
export const RESPONSIVE_BREAKPOINTS = ["base", "sm", "md", "lg", "xl"] as const;
export type Breakpoint = typeof RESPONSIVE_BREAKPOINTS[number];

/**
 * Normalise a prop value that may be a single value or a responsive map
 * like `{sm: 1, md: 2, lg: 4}`. Returns either:
 *   - `{kind: "single", value}` — caller should use the value directly
 *   - `{kind: "responsive", values}` — caller should emit CSS variables /
 *     data attributes for each breakpoint
 *
 * A bare key without a breakpoint prefix (e.g. `{value: 2}`) collapses to
 * a single-value result. Unknown breakpoint keys are ignored so typos
 * don't crash the page.
 */
export type ResponsiveProp<T> =
  | { kind: "single"; value: T | null }
  | { kind: "responsive"; values: Partial<Record<Breakpoint, T>> };

export function readResponsiveProp<T>(value: unknown): ResponsiveProp<T> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "single", value: (value ?? null) as T | null };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const values: Partial<Record<Breakpoint, T>> = {};
  let matched = false;
  for (const [key, raw] of entries) {
    if ((RESPONSIVE_BREAKPOINTS as readonly string[]).includes(key)) {
      values[key as Breakpoint] = raw as T;
      matched = true;
    }
  }
  if (!matched) {
    // Caller passed a non-responsive object — treat as a single value
    // (probably a component-config object the caller passes through).
    return { kind: "single", value: value as T };
  }
  return { kind: "responsive", values };
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
 * Validate an LLM-supplied CSS colour value before it lands on an inline
 * `color: …` declaration. Accepts the full standard colour vocabulary —
 * hex (`#00ff00`), named colours (`tomato`), functional notations
 * (`rgb(...)`, `hsl(...)`, `color-mix(...)`), and `var(--token)` — while
 * rejecting anything that could break out of the single declaration:
 * `;`/`{`/`}` (declaration separators), quotes/backslash/angle-brackets,
 * and the `url()` / `expression()` / `javascript:` / `@import` attack
 * vectors. Returns an empty string for blank or rejected input so callers
 * can drop the style entirely.
 */
const CSS_COLOR_ALLOWED = /^[a-zA-Z0-9#%.,()\s+\-]+$/;
export function sanitiseCssColor(raw: unknown): string {
  const trimmed = asString(raw).trim();
  if (!trimmed) return "";
  if (trimmed.length > 64) return "";
  if (!CSS_COLOR_ALLOWED.test(trimmed)) return "";
  if (/\burl\s*\(|\bexpression\s*\(|javascript\s*:|@import\b/i.test(trimmed)) return "";
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

/** `true` when a value is a renderable component node produced by the runtime. */
export function isComponentNode(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const kind = (value as { __kind?: string }).__kind;
  return kind === "Component" || kind === "UserComponent";
}

/** Subset of `RenderHelpers` the table cell builder needs. */
export interface CellRenderHelpers {
  renderNode: (node: unknown) => Node;
  invoke: (callable: unknown, ...args: unknown[]) => void;
}

/** A column's cell-rendering configuration, shared by Table and DataGrid. */
export interface TableCellCol {
  /** Cell value formatting hint (`text|number|currency|date`). */
  format?: string;
  /**
   * Optional `(value, rowIndex) => Component | string | (Component|string)[]`
   * mapper. Lets a column render arbitrary components — action buttons,
   * badges, avatars, links — instead of plain text. When omitted, a cell
   * value that is itself a component node still renders directly.
   */
  render?: unknown;
  /**
   * Optional `(value, rowIndex) => void` fired when the cell is clicked or
   * activated via keyboard. Clicks originating on an interactive child
   * (a rendered Button / link / input) are ignored so nested actions keep
   * their own handlers.
   */
  onClick?: unknown;
}

/**
 * Populate a `<td>` for one Table / DataGrid cell. Content resolution order:
 *
 *   1. `col.render(value, rowIndex)` — when provided, its result (a
 *      component, string, or array of either) is rendered. This is the
 *      idiomatic way to put buttons / badges / links in a column.
 *   2. a component-node `value` — rendered directly (so authors can also
 *      pass a pre-built array of component cells as the column `values`).
 *   3. otherwise the value is formatted as text via `formatValue`.
 *
 * When `col.onClick` is a callable the whole cell becomes an accessible
 * button (pointer + Enter/Space), firing `onClick(value, rowIndex)`.
 */
export function fillTableCell(
  td: HTMLElement,
  col: TableCellCol,
  value: unknown,
  rowIndex: number,
  helpers: CellRenderHelpers,
  formatValue: (value: unknown, format: string) => string,
): void {
  const format = col.format ?? "text";

  let content: unknown = value;
  if (typeof col.render === "function") {
    try {
      content = (col.render as (...a: unknown[]) => unknown)(value, rowIndex);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion] Col render() threw", err);
      content = null;
    }
  }

  const appendOne = (item: unknown): void => {
    if (isComponentNode(item)) {
      td.append(helpers.renderNode(item));
    } else if (item !== null && item !== undefined) {
      td.append(document.createTextNode(formatValue(item, format)));
    }
  };
  if (Array.isArray(content)) {
    for (const item of content) appendOne(item);
  } else {
    appendOne(content);
  }

  if (typeof col.onClick === "function") {
    td.setAttribute("data-clickable", "true");
    td.setAttribute("role", "button");
    td.tabIndex = 0;
    const guardedFire = (event: Event): boolean => {
      const target = event.target as Element | null;
      // Let interactive children (rendered buttons / links / inputs) handle
      // their own clicks without also firing the cell handler.
      if (target?.closest("input,button,a,label,select,textarea")) return false;
      // Stop the event bubbling to an enclosing clickable row (DataGrid's
      // `onRowClick`) so a cell action doesn't double-fire.
      event.stopPropagation();
      helpers.invoke(col.onClick, value, rowIndex);
      return true;
    };
    td.onclick = (event) => { guardedFire(event); };
    td.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (guardedFire(event)) event.preventDefault();
    };
  }
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
  options: { className?: string; size?: IconSize | string; color?: string } = {},
): HTMLElement | null {
  const text = asString(value);
  if (!text) return null;
  const color = options.color ? sanitiseCssColor(options.color) : "";
  const style = color ? `color:${color};` : null;
  const wrapperClass = ["rui-icon", options.className].filter(Boolean).join(" ");

  // Registered custom icon (inline SVG) wins over the Font Awesome lookup.
  const custom = getCustomIcon(text);
  if (custom) {
    const span = el("span", {
      class: `${wrapperClass} rui-icon-custom`,
      "data-icon-size": options.size ?? null,
      style,
      "aria-hidden": "true",
    });
    if (/^\s*<svg[\s>]/i.test(custom)) {
      span.innerHTML = custom;
    } else {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "currentColor");
      svg.innerHTML = custom;
      span.appendChild(svg as unknown as Node);
    }
    return span;
  }

  const classes = resolveIconClasses(text);
  if (classes.length === 0) {
    return el("span", {
      class: wrapperClass,
      "data-icon-size": options.size ?? null,
      style,
    }, [text]);
  }
  return el("i", {
    class: `${wrapperClass} ${classes.join(" ")}`,
    "data-icon-size": options.size ?? null,
    style,
    "aria-hidden": "true",
  });
}
