/**
 * Web-font loading for `$theme({ fonts: { import: [...] } })`
 * (suggestions-global I.7).
 *
 * Accepts a short Google-Fonts shorthand list and injects a single
 * `<link rel="stylesheet">` into `document.head` (once per unique URL).
 * Font faces loaded into the document are visible to shadow roots, so the
 * renderer can reference them via the `font` theme tokens.
 *
 * Shorthand:
 *   "Inter:400,700"      → family Inter, weights 400 & 700
 *   "JetBrains Mono"     → family JetBrains Mono, default weight
 *   "Inter:400,500i,700" → `i` suffix marks an italic weight
 *
 * Only well-formed family names (letters, digits, spaces) and numeric
 * weights are accepted; anything else is dropped so a hostile value can't
 * smuggle a different origin or CSS payload into the page.
 */

import { builtInThemeFonts, canonicalThemeName } from "./index.js";

const FAMILY_RE = /^[A-Za-z0-9 ]{1,48}$/;
const injectedUrls = new Set<string>();

interface ParsedFamily {
  family: string;
  weights: number[];
  italics: number[];
}

function parseFamilyEntry(entry: unknown): ParsedFamily | null {
  const raw = typeof entry === "string" ? entry.trim() : "";
  if (!raw) return null;
  const [familyPart, weightPart] = raw.split(":");
  const family = (familyPart ?? "").trim();
  if (!FAMILY_RE.test(family)) return null;
  const weights: number[] = [];
  const italics: number[] = [];
  if (weightPart) {
    for (const token of weightPart.split(",")) {
      const t = token.trim();
      const italic = /i$/.test(t);
      const n = Number(italic ? t.slice(0, -1) : t);
      if (Number.isInteger(n) && n >= 100 && n <= 900) {
        (italic ? italics : weights).push(n);
      }
    }
  }
  return { family, weights, italics };
}

/** Build the `family=…` query segment for a parsed family. */
function familyParam(p: ParsedFamily): string {
  const name = p.family.replace(/\s+/g, "+");
  const axes: string[] = [];
  for (const w of p.weights.sort((a, b) => a - b)) axes.push(`0,${w}`);
  for (const w of p.italics.sort((a, b) => a - b)) axes.push(`1,${w}`);
  if (axes.length === 0) return `family=${name}`;
  // ital,wght axes must be listed in ascending order with the axis tuple.
  if (p.italics.length > 0) return `family=${name}:ital,wght@${axes.join(";")}`;
  return `family=${name}:wght@${p.weights.sort((a, b) => a - b).join(";")}`;
}

/**
 * Build a sanitised Google Fonts CSS2 URL from a shorthand list, or "" when
 * no valid family is present.
 */
export function buildFontUrl(list: unknown): string {
  const families = (Array.isArray(list) ? list : [list])
    .map(parseFamilyEntry)
    .filter((p): p is ParsedFamily => p !== null);
  if (families.length === 0) return "";
  const params = families.map(familyParam).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/**
 * Inject the web fonts named in `import` into `document.head` (idempotent).
 * `record` is the `fonts` group from a `$theme({ fonts: {...} })` call; only
 * its `import` array is used here (the `family`/`familyHeading` tokens are
 * applied separately by the normal token flow). Returns the injected URL or "".
 */
export function loadFonts(record: unknown): string {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  const list = (record as Record<string, unknown>).import;
  if (list == null) return "";
  const url = buildFontUrl(list);
  if (!url || injectedUrls.has(url)) return url;
  if (typeof document === "undefined") return url;
  // Skip in headless test DOMs that reject external stylesheet loads.
  const g = globalThis as { happyDOM?: unknown };
  if (typeof g.happyDOM !== "undefined") { injectedUrls.add(url); return url; }
  try {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.setAttribute("data-rui-font", "");
    document.head.appendChild(link);
    injectedUrls.add(url);
  } catch {
    /* some DOMs throw on external sheets — fonts simply won't load */
  }
  return url;
}


/**
 * Load the web fonts a built-in theme needs, if it declares any.
 *
 * Called when a theme is selected by name, so `theme="shadcn"` renders in
 * that framework's typefaces rather than falling back to `system-ui`. Retired
 * aliases are canonicalised first, so `theme="modern"` loads what
 * `shadcn-light` needs. Idempotent — `loadFonts` de-duplicates by URL.
 */
export function loadBuiltInThemeFonts(name: unknown): void {
  const key = typeof name === "string" ? name.trim().toLowerCase() : "";
  if (!key) return;
  const decl = builtInThemeFonts[canonicalThemeName(key)];
  if (decl) loadFonts(decl);
}
