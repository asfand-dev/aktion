/**
 * Schema + DX tooling (suggestions-global XIV.2 / XIV.3 / XIV.5).
 *
 *   componentSchema(library)  — machine-readable JSON schema of every
 *                               component (props/types/enums) for IntelliSense.
 *   tailwindToSx(classString)  — map a Tailwind class string to an `sx` object.
 *   buildGallery(library, opts) — a static HTML component gallery / "Storybook".
 */

import type { ComponentLibrary, ComponentSpec, PropSpec } from "../library/types.js";

/* -------------------------------------------------------------------------- */
/*  XIV.3 — Component JSON schema (IntelliSense)                              */
/* -------------------------------------------------------------------------- */

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

function propToSchema(p: PropSpec): ComponentPropSchema {
  const out: ComponentPropSchema = {
    name: p.name,
    type: p.type,
    optional: p.optional === true,
    positional: p.positional === true,
    required: p.required === true,
  };
  if (p.enum) out.enum = p.enum;
  if (p.aliases) out.aliases = p.aliases;
  if (p.description) out.description = p.description;
  return out;
}

/**
 * Build a stable, machine-readable JSON schema of every component in a
 * library — names, props, types, enums, positional/required flags. Feed it
 * to an editor for autocomplete / hover docs, or diff it across releases.
 */
export function componentSchema(library: ComponentLibrary): LibrarySchema {
  const specs = collectSpecs(library);
  const components = specs
    .map((spec): ComponentSchemaEntry => ({
      name: spec.name,
      description: spec.description,
      props: spec.props.map(propToSchema),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { version: 1, components };
}

/* -------------------------------------------------------------------------- */
/*  XIV.4 — "did you mean" component suggestions                              */
/* -------------------------------------------------------------------------- */

/** Case-insensitive Levenshtein distance (small inputs only). */
function editDistance(a: string, b: string): number {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  const m = al.length, n = bl.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/**
 * Suggest the closest real component name(s) for a misspelling (XIV.4) — the
 * "did you mean `Button`?" experience. Returns up to `limit` names within a
 * small edit distance, best first.
 */
export function suggestComponent(name: unknown, library: ComponentLibrary, limit = 3): string[] {
  const query = String(name ?? "").trim();
  if (!query) return [];
  const names = collectSpecs(library).map((s) => s.name);
  // An exact match short-circuits (the name is already a real component).
  if (names.includes(query)) return [query];
  const threshold = Math.max(2, Math.ceil(query.length / 3));
  return names
    .map((n) => ({ n, d: editDistance(query, n) }))
    .filter((x) => x.d > 0 && x.d <= threshold)
    .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))
    .slice(0, Math.max(1, limit))
    .map((x) => x.n);
}

function collectSpecs(library: ComponentLibrary): ComponentSpec[] {
  // ComponentLibrary exposes components either as a `.components` array or a
  // name→spec map; support both shapes defensively.
  const anyLib = library as unknown as {
    components?: ComponentSpec[];
    list?: () => ComponentSpec[];
    all?: ComponentSpec[];
  };
  if (Array.isArray(anyLib.components)) return anyLib.components;
  if (typeof anyLib.list === "function") return anyLib.list();
  if (Array.isArray(anyLib.all)) return anyLib.all;
  // Fall back to enumerating own values that look like specs.
  const out: ComponentSpec[] = [];
  for (const v of Object.values(library as unknown as Record<string, unknown>)) {
    if (v && typeof v === "object" && typeof (v as ComponentSpec).render === "function" && typeof (v as ComponentSpec).name === "string") {
      out.push(v as ComponentSpec);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  XIV.2 — Tailwind → sx mapping                                             */
/* -------------------------------------------------------------------------- */

const SPACING_SCALE: Record<string, string> = {
  "0": "none", "1": "xs", "2": "s", "3": "s", "4": "m", "5": "m",
  "6": "l", "8": "l", "10": "xl", "12": "xl", "16": "2xl", "20": "3xl", "24": "3xl",
  px: "2px", auto: "auto",
};
const COLOR_WORDS: Record<string, string> = {
  primary: "primary", accent: "accent", success: "success", green: "success",
  danger: "danger", red: "danger", warning: "warning", amber: "warning",
  info: "info", blue: "info", muted: "text-muted", gray: "text-muted",
  slate: "text-muted", white: "surface", black: "text", transparent: "transparent",
};
const RADIUS_MAP: Record<string, string> = {
  none: "none", sm: "sm", "": "md", md: "md", lg: "lg", xl: "lg", "2xl": "lg", "3xl": "lg", full: "full",
};
const SHADOW_MAP: Record<string, string> = { sm: "sm", "": "md", md: "md", lg: "lg", xl: "lg", "2xl": "lg", none: "none" };
const ALIGN_MAP: Record<string, string> = { start: "start", center: "center", end: "end", stretch: "stretch", baseline: "baseline" };
const JUSTIFY_MAP: Record<string, string> = { start: "start", center: "center", end: "end", between: "between", around: "around", evenly: "evenly" };
const TEXT_SIZE_MAP: Record<string, string> = {
  xs: "xs", sm: "sm", base: "base", lg: "lg", xl: "xl", "2xl": "2xl", "3xl": "3xl",
  "4xl": "4xl", "5xl": "4xl", "6xl": "4xl",
};
const FONT_WEIGHT_MAP: Record<string, string> = {
  thin: "100", extralight: "200", light: "300", normal: "400", medium: "500",
  semibold: "600", bold: "700", extrabold: "800", black: "900",
};
const MAX_W_MAP: Record<string, string> = {
  xs: "320px", sm: "384px", md: "448px", lg: "512px", xl: "576px",
  "2xl": "672px", "3xl": "768px", "4xl": "896px", "5xl": "1024px",
  "6xl": "1152px", "7xl": "1280px", full: "full", none: "none", prose: "65ch",
};
/** Tailwind numeric scale → px (n × 4px), for w-/h-/top-/… utilities. */
function scalePx(raw: string): string | null {
  if (raw in SPACING_SCALE) {
    const tok = SPACING_SCALE[raw]!;
    return tok === "none" ? "0" : tok;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 96) return `${n * 4}px`;
  const frac = /^(\d)\/(\d)$/.exec(raw);
  if (frac) {
    const pct = (Number(frac[1]) / Number(frac[2])) * 100;
    if (Number.isFinite(pct) && pct > 0 && pct <= 100) return `${Math.round(pct * 1000) / 1000}%`;
  }
  return null;
}

const BREAKPOINT_PREFIXES: Record<string, string> = { sm: "sm", md: "md", lg: "lg", xl: "xl", "2xl": "xl" };
const STATE_PREFIXES = new Set(["hover", "focus", "focus-visible", "active", "disabled", "group-hover", "checked"]);
/** sx keys that `sx.states` supports (mirror of `resolveStateDecls`). */
const STATEABLE_KEYS = new Set(["bg", "color", "borderColor", "shadow", "radius", "opacity", "cursor", "textDecoration", "scale"]);

/** Map ONE bare Tailwind utility to a partial `sx` object (null = unknown). */
function mapUtility(base: string): Record<string, unknown> | null {
  let m: RegExpMatchArray | null;
  const space = (raw: string): string | null => SPACING_SCALE[raw] ?? null;

  if ((m = base.match(/^p([xytrblse]?)-(.+)$/))) { const v = space(m[2]!) ?? m[2]!; return { [m[1] === "" ? "p" : `p${m[1]}`]: v }; }
  if ((m = base.match(/^m([xytrblse]?)-(.+)$/))) { const v = space(m[2]!) ?? m[2]!; return { [m[1] === "" ? "m" : `m${m[1]}`]: v }; }
  if ((m = base.match(/^gap-(.+)$/))) { const s = space(m[1]!); return s ? { gap: s } : null; }
  // Typography before color: `text-lg` is a size, `text-primary` a color.
  if ((m = base.match(/^text-(.+)$/))) {
    const sizeTok = TEXT_SIZE_MAP[m[1]!];
    if (sizeTok) return { fontSize: sizeTok };
    if (["left", "center", "right", "justify"].includes(m[1]!)) return { textAlign: m[1]! };
    const colorTok = COLOR_WORDS[m[1]!.split("-")[0]!];
    return colorTok ? { color: colorTok } : null;
  }
  if ((m = base.match(/^font-(.+)$/))) { const w = FONT_WEIGHT_MAP[m[1]!]; return w ? { weight: w } : null; }
  if ((m = base.match(/^bg-(.+)$/))) { const tok = COLOR_WORDS[m[1]!.split("-")[0]!]; return tok ? { bg: tok } : null; }
  if (base === "border") return { border: "default" };
  if (base === "border-0" || base === "border-none") return { border: "none" };
  if ((m = base.match(/^border-(.+)$/))) { const tok = COLOR_WORDS[m[1]!.split("-")[0]!]; return tok ? { borderColor: tok } : null; }
  if ((m = base.match(/^rounded(?:-(.+))?$/))) { const r = RADIUS_MAP[m[1] ?? ""]; return r ? { radius: r } : null; }
  if ((m = base.match(/^shadow(?:-(.+))?$/))) { const s = SHADOW_MAP[m[1] ?? ""]; return s ? { shadow: s } : null; }
  if (base === "flex") return { display: "flex" };
  if (base === "inline-flex") return { display: "inline-flex" };
  if (base === "grid") return { display: "grid" };
  if (base === "hidden") return { display: "none" };
  if (base === "block") return { display: "block" };
  if (base === "inline-block") return { display: "inline-block" };
  if (base === "flex-row") return { direction: "row" };
  if (base === "flex-col") return { direction: "column" };
  if (base === "flex-row-reverse") return { direction: "row-reverse" };
  if (base === "flex-col-reverse") return { direction: "column-reverse" };
  if (base === "flex-wrap") return { wrap: true };
  if (base === "flex-nowrap") return { wrap: false };
  if (base === "flex-1") return { grow: 1, basis: "0%" };
  if (base === "grow" || base === "flex-grow") return { grow: 1 };
  if (base === "grow-0") return { grow: 0 };
  if (base === "shrink-0" || base === "flex-shrink-0") return { shrink: 0 };
  if ((m = base.match(/^items-(.+)$/))) { const a = ALIGN_MAP[m[1]!]; return a ? { align: a } : null; }
  if ((m = base.match(/^justify-(.+)$/))) { const j = JUSTIFY_MAP[m[1]!]; return j ? { justify: j } : null; }
  if ((m = base.match(/^grid-cols-(\d+)$/))) return { columns: Number(m[1]) };
  if (base === "w-full") return { w: "full" };
  if (base === "h-full") return { h: "full" };
  if (base === "w-screen") return { w: "screen-w" };
  if (base === "h-screen") return { h: "screen" };
  if (base === "min-h-screen") return { minH: "screen" };
  if (base === "w-auto") return { w: "auto" };
  if (base === "h-auto") return { h: "auto" };
  if ((m = base.match(/^w-(.+)$/))) { const v = scalePx(m[1]!); return v ? { w: v } : null; }
  if ((m = base.match(/^h-(.+)$/))) { const v = scalePx(m[1]!); return v ? { h: v } : null; }
  if ((m = base.match(/^max-w-(.+)$/))) { const v = MAX_W_MAP[m[1]!] ?? scalePx(m[1]!); return v ? { maxW: v } : null; }
  if ((m = base.match(/^min-w-(.+)$/))) { const v = scalePx(m[1]!); return v ? { minW: v } : null; }
  if ((m = base.match(/^max-h-(.+)$/))) { const v = scalePx(m[1]!); return v ? { maxH: v } : null; }
  if ((m = base.match(/^min-h-(.+)$/))) { const v = scalePx(m[1]!); return v ? { minH: v } : null; }
  if ((m = base.match(/^opacity-(\d+)$/))) return { opacity: Math.max(0, Math.min(1, Number(m[1]) / 100)) };
  if (base === "relative" || base === "absolute" || base === "fixed" || base === "sticky") return { position: base };
  if ((m = base.match(/^z-(\d+)$/))) return { zIndex: Number(m[1]) };
  if (base === "inset-0") return { inset: "0" };
  if ((m = base.match(/^(top|right|bottom|left)-(.+)$/))) { const v = scalePx(m[2]!); return v ? { [m[1]!]: v } : null; }
  if (base === "overflow-hidden") return { overflow: "hidden" };
  if (base === "overflow-auto") return { overflow: "auto" };
  if (base === "overflow-scroll") return { overflow: "scroll" };
  if (base === "overflow-visible") return { overflow: "visible" };
  if (base === "cursor-pointer") return { cursor: "pointer" };
  if (base === "cursor-default") return { cursor: "default" };
  if (base === "cursor-not-allowed") return { cursor: "not-allowed" };
  if (base === "underline") return { textDecoration: "underline" };
  if (base === "line-through") return { textDecoration: "line-through" };
  if (base === "no-underline") return { textDecoration: "none" };
  if ((m = base.match(/^scale-(\d+)$/))) return { scale: Number(m[1]) / 100 };
  return null;
}

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
export function tailwindToSx(classString: unknown): Record<string, unknown> {
  const sx: Record<string, unknown> = {};
  const unmapped: string[] = [];
  const classes = String(classString ?? "").split(/\s+/).filter(Boolean);

  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const assignAt = (key: string, value: unknown, bp: string | null): void => {
    if (!bp) {
      const existing = sx[key];
      // A responsive map may already exist from an earlier `md:` class.
      if (isPlainObject(existing) && key !== "states") existing.base = value;
      else sx[key] = value;
      return;
    }
    const existing = sx[key];
    if (isPlainObject(existing) && key !== "states") existing[bp] = value;
    else sx[key] = existing === undefined ? { [bp]: value } : { base: existing, [bp]: value };
  };

  for (const cls of classes) {
    const parts = cls.split(":");
    const base = parts[parts.length - 1]!;
    const prefixes = parts.slice(0, -1);
    let bp: string | null = null;
    let state: string | null = null;
    let unsupportedPrefix = false;
    for (const p of prefixes) {
      if (BREAKPOINT_PREFIXES[p]) bp = BREAKPOINT_PREFIXES[p]!;
      else if (STATE_PREFIXES.has(p)) state = p;
      else unsupportedPrefix = true; // dark:, peer-*, has-*, …
    }
    if (unsupportedPrefix) { unmapped.push(cls); continue; }

    const mapped = mapUtility(base);
    if (!mapped) { unmapped.push(cls); continue; }

    if (state) {
      // Nest into sx.states; drop props the state engine can't style.
      const stateable: Record<string, unknown> = {};
      let any = false;
      for (const [k, v] of Object.entries(mapped)) {
        if (STATEABLE_KEYS.has(k)) { stateable[k] = v; any = true; }
      }
      if (!any) { unmapped.push(cls); continue; }
      const states = isPlainObject(sx.states) ? sx.states as Record<string, unknown> : {};
      const bucket = isPlainObject(states[state]) ? states[state] as Record<string, unknown> : {};
      Object.assign(bucket, stateable);
      states[state] = bucket;
      sx.states = states;
      continue;
    }
    let assignedAny = false;
    for (const [k, v] of Object.entries(mapped)) {
      // `scale` is transform-only — sx supports it inside `states`, not at
      // the base level; surface the class instead of silently dropping it.
      if (k === "scale") continue;
      assignAt(k, v, bp);
      assignedAny = true;
    }
    if (!assignedAny) unmapped.push(cls);
  }
  if (unmapped.length > 0) sx._unmapped = unmapped;
  return sx;
}

/* -------------------------------------------------------------------------- */
/*  XIV.5 — Component gallery ("Storybook")                                   */
/* -------------------------------------------------------------------------- */

export interface GalleryOptions {
  /** Page title (default "Aktion Components"). */
  title?: string;
  /** Only include components whose name matches this filter. */
  include?: (name: string) => boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/**
 * Build a static HTML "Storybook"-style gallery from a library's schema
 * (XIV.5): one card per component listing its description and prop table.
 * Self-contained (inline CSS); write it to a file or serve it for browsing.
 */
export function buildGallery(library: ComponentLibrary, options: GalleryOptions = {}): string {
  const title = options.title ?? "Aktion Components";
  const schema = componentSchema(library);
  const components = options.include
    ? schema.components.filter((c) => options.include!(c.name))
    : schema.components;

  const cards = components.map((c) => {
    const rows = c.props.map((p) => {
      const flags = [
        p.required ? "required" : p.optional ? "optional" : "",
        p.positional ? "positional" : "",
      ].filter(Boolean).join(", ");
      const enumStr = p.enum ? ` <span class="enum">${escapeHtml(p.enum.join(" | "))}</span>` : "";
      return `<tr><td class="pname">${escapeHtml(p.name)}</td><td class="ptype">${escapeHtml(p.type)}${enumStr}</td><td class="pflags">${escapeHtml(flags)}</td><td class="pdesc">${escapeHtml(p.description ?? "")}</td></tr>`;
    }).join("");
    return `<section class="card" id="c-${escapeHtml(c.name)}">
  <h2>${escapeHtml(c.name)}</h2>
  <p class="desc">${escapeHtml(c.description)}</p>
  ${c.props.length ? `<table><thead><tr><th>Prop</th><th>Type</th><th>Flags</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="noprops">No props.</p>'}
</section>`;
  }).join("\n");

  const nav = components.map((c) => `<a href="#c-${escapeHtml(c.name)}">${escapeHtml(c.name)}</a>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font: 15px/1.5 system-ui, sans-serif; margin: 0; display: grid; grid-template-columns: 220px 1fr; }
nav { position: sticky; top: 0; align-self: start; height: 100vh; overflow: auto; padding: 16px; border-right: 1px solid #8884; }
nav a { display: block; padding: 3px 6px; border-radius: 6px; text-decoration: none; color: inherit; font-size: 13px; }
nav a:hover { background: #8882; }
main { padding: 24px 32px; max-width: 920px; }
h1 { margin: 0 0 16px; }
.card { padding: 16px 0; border-bottom: 1px solid #8883; }
.card h2 { margin: 0 0 4px; }
.desc { color: #8889; margin: 0 0 10px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #8882; vertical-align: top; }
.pname { font-weight: 600; } .ptype { font-family: ui-monospace, monospace; color: #4a90d9; }
.enum { color: #999; } .pflags { color: #888; } .noprops { color: #999; font-size: 13px; }
</style></head><body>
<nav>${nav}</nav>
<main><h1>${escapeHtml(title)}</h1><p>${components.length} components.</p>${cards}</main>
</body></html>`;
}
