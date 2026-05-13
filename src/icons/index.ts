/**
 * Font Awesome integration for `<streaming-ui-script>`.
 *
 * Icons across the library are referenced by Font Awesome name (without the
 * `fa-` prefix). The optional `variant:` prefix (`solid:`, `regular:`,
 * `brands:`) picks the FA style — when omitted, it defaults to `solid`.
 *
 * The custom element auto-loads the CDN stylesheet on connect (once per
 * page and once per shadow root) so host apps do not have to add anything
 * to make icons render.
 */

export const FONT_AWESOME_CDN_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";

export const FONT_AWESOME_VERSION = "6.7.2";

const LINK_MARKER_ATTR = "data-rui-font-awesome";

const SUPPORTED_VARIANTS = new Set(["solid", "regular", "brands"]);

const DEFAULT_VARIANT = "solid";

/**
 * Inject the Font Awesome stylesheet into `document.head` (once per page)
 * and into the given shadow root (once per instance) so icon classes
 * resolve both outside and inside the custom element.
 *
 * Safe to call from every `connectedCallback`.
 */
export function ensureFontAwesomeLoaded(shadow: ShadowRoot): void {
  if (typeof document !== "undefined") {
    injectLink(document.head, document);
  }
  injectLink(shadow, shadow.ownerDocument ?? document);
}

function injectLink(root: ParentNode, doc: Document): void {
  // happy-dom logs disallowed external stylesheet loads to stderr before
  // throwing, so a plain try/catch isn't enough to keep the test output
  // clean. Detect the test environment and skip — there is no browser to
  // render icons into anyway.
  if (isHappyDomEnvironment()) return;

  const existing = root.querySelector(
    `link[${LINK_MARKER_ATTR}="${FONT_AWESOME_VERSION}"]`,
  );
  if (existing) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT_AWESOME_CDN_URL;
  link.setAttribute(LINK_MARKER_ATTR, FONT_AWESOME_VERSION);
  try {
    root.appendChild(link);
  } catch {
    // Defensive: some DOM implementations may still throw when appending an
    // external stylesheet. Production browsers never throw here.
  }
}

function isHappyDomEnvironment(): boolean {
  const g = globalThis as { happyDOM?: unknown };
  return typeof g.happyDOM !== "undefined";
}

/**
 * Resolve a Streaming UI Script icon string into Font Awesome class tokens.
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
export function resolveIconClasses(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const sanitized = stripInvisibleModifiers(value).trim();
  if (!sanitized) return [];
  if (!isAsciiIconName(sanitized)) return [];

  const [variant, name] = splitVariant(sanitized);
  if (!name) return [];
  return [`fa-${variant}`, `fa-${name}`];
}

const INVISIBLE_MODIFIER_RE = /[\uFE0E\uFE0F\u200D\u200C\uFEFF]/g;

function stripInvisibleModifiers(input: string): string {
  return input.replace(INVISIBLE_MODIFIER_RE, "");
}

/**
 * True when the value should be treated as a Font Awesome name (vs legacy
 * emoji text that the renderer should print inline).
 */
export function isIconName(value: unknown): value is string {
  return resolveIconClasses(value).length > 0;
}

function splitVariant(input: string): [string, string] {
  const idx = input.indexOf(":");
  if (idx === -1) return [DEFAULT_VARIANT, input];
  const variant = input.slice(0, idx).trim().toLowerCase();
  const name = input.slice(idx + 1).trim();
  if (!SUPPORTED_VARIANTS.has(variant)) return [DEFAULT_VARIANT, name || input];
  return [variant, name];
}

function isAsciiIconName(value: string): boolean {
  // FA names are kebab-case ASCII (letters, digits, dashes). Allow the
  // optional `variant:` prefix. Anything else (emoji, accented text)
  // falls back to inline text rendering.
  return /^[a-zA-Z0-9:_-]+$/.test(value);
}

export const ICON_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export function isIconSize(value: unknown): value is IconSize {
  return typeof value === "string" && (ICON_SIZES as readonly string[]).includes(value);
}
