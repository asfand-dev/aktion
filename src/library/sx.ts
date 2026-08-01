/**
 * `sx` — bounded, token-aware style-intent layer (suggestions-global Part I).
 *
 * Every component accepts a universal `sx` prop (plus `animate`, `id`,
 * `anchor`, `className`, `style`). These are NOT raw CSS: each value is a
 * design-token reference, a small enum, or a sanitised scalar, so the surface
 * stays theme-safe, XSS-safe, and enumerable by an LLM.
 *
 * The evaluator collects these into `node.universal`; the renderer calls
 * {@link applyUniversal} on the element returned by a component's `render`.
 * One hook styles all 196 components without editing each spec.
 */

import { asString, asNumber, sanitiseCssColor, sanitiseCssLength } from "./utils.js";
import { responsiveClassFor, isResponsiveMap, stateClassFor, type ResponsiveGroup, type StateRuleGroup } from "./responsive-style.js";

/** Spacing scale → CSS variable. Mirrors Tailwind-ish mental model. */
const SPACING: Record<string, string> = {
  none: "0",
  "3xs": "var(--rui-spacing-3xs)",
  "2xs": "var(--rui-spacing-2xs)",
  xs: "var(--rui-spacing-xs)",
  s: "var(--rui-spacing-s)",
  sm: "var(--rui-spacing-s)",
  m: "var(--rui-spacing-m)",
  md: "var(--rui-spacing-m)",
  l: "var(--rui-spacing-l)",
  lg: "var(--rui-spacing-l)",
  xl: "var(--rui-spacing-xl)",
  "2xl": "var(--rui-spacing-2xl)",
  "3xl": "var(--rui-spacing-3xl)",
  auto: "auto",
  // Safe-area insets (II.5) for notches / home indicators on mobile. Use the
  // directional tokens on single sides (`pb: "safe-bottom"`) and `safe` as the
  // 4-value shorthand for all-around padding/margin (`p: "safe"`).
  safe: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
  "safe-top": "env(safe-area-inset-top)",
  "safe-right": "env(safe-area-inset-right)",
  "safe-bottom": "env(safe-area-inset-bottom)",
  "safe-left": "env(safe-area-inset-left)",
};

/** Named colors → CSS variable. */
const COLORS: Record<string, string> = {
  bg: "var(--rui-color-bg)",
  "bg-subtle": "var(--rui-color-bg-subtle)",
  surface: "var(--rui-color-surface)",
  "surface-muted": "var(--rui-color-surface-muted)",
  border: "var(--rui-color-border)",
  "border-subtle": "var(--rui-color-border-subtle)",
  text: "var(--rui-color-text)",
  "text-muted": "var(--rui-color-text-muted)",
  muted: "var(--rui-color-text-muted)",
  primary: "var(--rui-color-primary)",
  "primary-hover": "var(--rui-color-primary-hover)",
  "primary-text": "var(--rui-color-primary-text)",
  accent: "var(--rui-color-accent)",
  success: "var(--rui-color-success)",
  warning: "var(--rui-color-warning)",
  danger: "var(--rui-color-danger)",
  info: "var(--rui-color-info)",
  transparent: "transparent",
  current: "currentColor",
};

const RADIUS: Record<string, string> = {
  none: "0",
  xs: "var(--rui-radius-xs)",
  sm: "var(--rui-radius-sm)",
  md: "var(--rui-radius-md)",
  lg: "var(--rui-radius-lg)",
  pill: "var(--rui-radius-pill)",
  full: "9999px",
  circle: "50%",
};

const SHADOW: Record<string, string> = {
  none: "none",
  sm: "var(--rui-shadow-sm)",
  md: "var(--rui-shadow-md)",
  lg: "var(--rui-shadow-lg)",
};

const SIZE_KEYWORDS: Record<string, string> = {
  full: "100%",
  half: "50%",
  screen: "100vh",
  "screen-w": "100vw",
  "screen-h": "100vh",
  dvh: "100dvh",
  min: "min-content",
  max: "max-content",
  fit: "fit-content",
  auto: "auto",
};

const ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
  stretch: "stretch",
};

// Layer tokens resolve through `--rui-z-*` variables (themeable via
// `$theme({ zIndex: {...} })` — I.2) with the documented defaults as
// fallbacks so they work without any theme override.
const Z_INDEX: Record<string, string> = {
  base: "var(--rui-z-base, 0)",
  raised: "var(--rui-z-raised, 10)",
  dropdown: "var(--rui-z-dropdown, 1000)",
  sticky: "var(--rui-z-sticky, 1100)",
  banner: "var(--rui-z-banner, 1200)",
  overlay: "var(--rui-z-overlay, 1250)",
  modal: "var(--rui-z-modal, 1300)",
  popover: "var(--rui-z-popover, 1350)",
  toast: "var(--rui-z-toast, 1400)",
  tooltip: "var(--rui-z-tooltip, 1500)",
};

/** Typography presets for `sx.fontSize` (tokens) — raw lengths also accepted. */
const FONT_SIZE: Record<string, string> = {
  xs: "0.75rem",
  sm: "var(--rui-font-size-sm)",
  base: "var(--rui-font-size-base)",
  md: "var(--rui-font-size-base)",
  lg: "var(--rui-font-size-lg)",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
};

const FONT_WEIGHT = new Set(["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"]);

const DISPLAY = new Set(["flex", "grid", "block", "inline", "inline-flex", "inline-block", "none", "contents"]);
const DIRECTION = new Set(["row", "column", "row-reverse", "column-reverse"]);
const POSITION = new Set(["relative", "absolute", "fixed", "sticky", "static"]);
const OVERFLOW = new Set(["hidden", "auto", "scroll", "visible", "clip"]);
const CURSOR = new Set(["pointer", "default", "not-allowed", "grab", "grabbing", "text", "move", "wait", "help", "none"]);
const TEXT_ALIGN = new Set(["left", "center", "right", "justify", "start", "end"]);

/** Resolve a spacing token or sanitised length. */
function space(v: unknown): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  if (s in SPACING) return SPACING[s]!;
  return sanitiseCssLength(s, "") || null;
}

/** Resolve a size keyword or sanitised length. */
function size(v: unknown): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  if (s in SIZE_KEYWORDS) return SIZE_KEYWORDS[s]!;
  return sanitiseCssLength(s, "") || null;
}

/** Resolve a color token, a gradient ref (`gradient.brand`), or a raw color. */
function color(v: unknown): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  if (s in COLORS) return COLORS[s]!;
  if (s.startsWith("gradient.")) return `var(--rui-gradient-${cssIdent(s.slice("gradient.".length))})`;
  return sanitiseCssColor(s) || null;
}

/** Background can be a gradient ref, a color token, or a raw color. */
function bg(v: unknown): string | null {
  const s = asString(v).trim();
  if (s.startsWith("gradient.")) return `var(--rui-gradient-${cssIdent(s.slice("gradient.".length))})`;
  return color(v);
}

function cssIdent(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
}

function num(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = asString(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return null;
}

/** Resolve a font-size token or sanitised length. */
function fontSize(v: unknown): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  if (s in FONT_SIZE) return FONT_SIZE[s]!;
  return sanitiseCssLength(s, "") || null;
}

/** Resolve a font weight (numeric 100–900 or normal/bold). */
function fontWeight(v: unknown): string | null {
  const s = asString(v).trim();
  return FONT_WEIGHT.has(s) ? s : null;
}

/**
 * Sanitise a background-image URL. Beyond stripping characters that could
 * break out of the `url("…")` context, reject script-ish schemes outright —
 * only http(s), root/relative paths, and `data:image/*` pass.
 */
function safeBgUrl(raw: string): string | null {
  const safe = raw.replace(/["'\\\n\r<>;{})(]/g, "").trim();
  if (!safe || safe.length > 512) return null;
  if (/^(https?:)?\/\//i.test(safe)) return safe;       // absolute / protocol-relative
  if (/^data:image\//i.test(safe)) return safe;          // inline image payloads only
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(safe)) return null; // any other scheme (javascript:, blob:, …)
  return safe;                                           // relative path
}

/** Resolve a `bgOverlay` value to a background-image layer (gradient or wash). */
function overlayLayer(v: unknown): string | null {
  const s = asString(v).trim();
  if (!s) return null;
  if (s.startsWith("gradient.")) return `var(--rui-gradient-${cssIdent(s.slice("gradient.".length))})`;
  const c = color(s);
  return c ? `linear-gradient(${c}, ${c})` : null;
}

/** A single `sx` value may be a responsive map; we resolve the base value. */
function resolveResponsive(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const map = v as Record<string, unknown>;
    if ("base" in map || "sm" in map || "md" in map || "lg" in map || "xl" in map) {
      return map.base ?? map.sm ?? map.md ?? map.lg ?? map.xl;
    }
  }
  return v;
}

/**
 * Per-key resolvers for the responsive pass: each maps a raw value to the
 * `[cssProperty, cssValue]` pairs it produces (empty when invalid). Mirrors
 * the base inline logic below so a breakpoint map and a single value resolve
 * identically.
 */
const RESPONSIVE_RESOLVERS: Record<string, (v: unknown) => Array<[string, string]>> = {
  p: (v) => pair("padding", space(v)),
  // `px`/`mx` use logical inline properties so RTL documents mirror (X.1) —
  // identical rendering in LTR, correct mirroring under `dir="rtl"`.
  px: (v) => pair("padding-inline", space(v)),
  py: (v) => { const s = space(v); return s ? [["padding-top", s], ["padding-bottom", s]] : []; },
  pt: (v) => pair("padding-top", space(v)),
  pr: (v) => pair("padding-right", space(v)),
  pb: (v) => pair("padding-bottom", space(v)),
  pl: (v) => pair("padding-left", space(v)),
  // Logical single-side spacing (X.1): `ps`/`pe` = inline start/end.
  ps: (v) => pair("padding-inline-start", space(v)),
  pe: (v) => pair("padding-inline-end", space(v)),
  m: (v) => pair("margin", space(v)),
  mx: (v) => pair("margin-inline", space(v)),
  my: (v) => { const s = space(v); return s ? [["margin-top", s], ["margin-bottom", s]] : []; },
  mt: (v) => pair("margin-top", space(v)),
  mr: (v) => pair("margin-right", space(v)),
  mb: (v) => pair("margin-bottom", space(v)),
  ml: (v) => pair("margin-left", space(v)),
  ms: (v) => pair("margin-inline-start", space(v)),
  me: (v) => pair("margin-inline-end", space(v)),
  gap: (v) => pair("gap", space(v)),
  w: (v) => pair("width", size(v)),
  h: (v) => pair("height", size(v)),
  minW: (v) => pair("min-width", size(v)),
  maxW: (v) => pair("max-width", size(v)),
  minH: (v) => pair("min-height", size(v)),
  maxH: (v) => pair("max-height", size(v)),
  bg: (v) => pair("background", bg(v)),
  color: (v) => pair("color", color(v)),
  radius: (v) => { const r = asString(v).trim(); return pair("border-radius", r in RADIUS ? RADIUS[r]! : (sanitiseCssLength(r, "") || null)); },
  shadow: (v) => { const s = asString(v).trim(); return s in SHADOW ? [["box-shadow", SHADOW[s]!]] : []; },
  display: (v) => { const d = asString(v).trim(); return DISPLAY.has(d) ? [["display", d]] : []; },
  direction: (v) => { const d = asString(v).trim(); return DIRECTION.has(d) ? [["flex-direction", d]] : []; },
  align: (v) => { const a = asString(v).trim(); return a in ALIGN ? [["align-items", ALIGN[a]!]] : []; },
  justify: (v) => { const j = asString(v).trim(); return j in JUSTIFY ? [["justify-content", JUSTIFY[j]!]] : []; },
  textAlign: (v) => { const t = asString(v).trim(); return TEXT_ALIGN.has(t) ? [["text-align", t]] : []; },
  columns: (v) => { const c = num(v); return c ? [["grid-template-columns", `repeat(${c}, minmax(0, 1fr))`]] : []; },
  // Spec I.5 says EVERY sx value accepts a breakpoint map — cover the rest of
  // the bounded surface so responsive maps never silently no-op.
  border: (v) => resolveBorder(v),
  borderColor: (v) => pair("border-color", color(v)),
  opacity: (v) => pair("opacity", num(v)),
  zIndex: (v) => { const zs = asString(v).trim(); return pair("z-index", zs in Z_INDEX ? Z_INDEX[zs]! : num(zs)); },
  overflow: (v) => { const o = asString(v).trim(); return OVERFLOW.has(o) ? [["overflow", o]] : []; },
  grow: (v) => pair("flex-grow", num(v)),
  shrink: (v) => pair("flex-shrink", num(v)),
  basis: (v) => pair("flex-basis", size(v)),
  wrap: (v) => (v === true || asString(v) === "true" ? [["flex-wrap", "wrap"]] : v === false || asString(v) === "false" ? [["flex-wrap", "nowrap"]] : []),
  position: (v) => { const p = asString(v).trim(); return POSITION.has(p) ? [["position", p]] : []; },
  top: (v) => pair("top", size(v)),
  right: (v) => pair("right", size(v)),
  bottom: (v) => pair("bottom", size(v)),
  left: (v) => pair("left", size(v)),
  inset: (v) => { const i = asString(v).trim(); return pair("inset", i === "0" ? "0" : sanitiseCssLength(i, "") || null); },
  fontSize: (v) => pair("font-size", fontSize(v)),
  weight: (v) => pair("font-weight", fontWeight(v)),
  textDecoration: (v) => { const t = asString(v).trim(); return TEXT_DECORATION.has(t) ? [["text-decoration", t]] : []; },
};

const TEXT_DECORATION = new Set(["underline", "none", "line-through", "overline"]);

/** Shared border shorthand resolution (base + responsive passes). */
function resolveBorder(v: unknown): Array<[string, string]> {
  const b = asString(v).trim();
  if (!b) return [];
  if (b === "none") return [["border", "none"]];
  if (b === "subtle") return [["border", "1px solid var(--rui-color-border-subtle)"]];
  if (b === "strong") return [["border", "1px solid var(--rui-color-text)"]];
  if (b === "true" || b === "default") return [["border", "1px solid var(--rui-color-border)"]];
  const c = color(b);
  return c ? [["border", `1px solid ${c}`]] : [];
}

function pair(prop: string, value: string | null): Array<[string, string]> {
  return value ? [[prop, value]] : [];
}

/**
 * For each `sx` key whose value is a responsive map, emit a deduped atomic
 * class with `@media` rules and mark the key handled (so the base pass skips
 * it). Returns the set of handled keys. When responsive emission is
 * unavailable (e.g. no constructable stylesheets), keys are left unhandled so
 * the base pass emits the resolved base value inline.
 */
function applyResponsive(sx: Record<string, unknown>, classes: string[]): Set<string> {
  const handled = new Set<string>();
  for (const [key, resolver] of Object.entries(RESPONSIVE_RESOLVERS)) {
    const value = sx[key];
    if (!isResponsiveMap(value)) continue;
    const groups: ResponsiveGroup[] = [];
    for (const bp of ["base", "sm", "md", "lg", "xl"]) {
      if (!(bp in value)) continue;
      const decls = resolver(value[bp]);
      if (decls.length > 0) groups.push({ bp, decls });
    }
    if (groups.length === 0) continue;
    const cls = responsiveClassFor(groups);
    if (cls) { classes.push(cls); handled.add(key); }
  }
  return handled;
}

type Decl = [string, string | null];

/**
 * Serialize an `sx` object into a safe inline-style string + utility classes.
 * Unknown keys are ignored. Hover/focus map to predefined utility classes
 * (no dynamic CSS injection) so the surface stays bounded. Responsive map
 * values (`{ base, md, … }`) emit real `@media` rules via atomic classes.
 */
export function serializeSx(sxRaw: unknown): { style: string; classes: string[] } {
  const classes: string[] = [];
  if (!sxRaw || typeof sxRaw !== "object" || Array.isArray(sxRaw)) return { style: "", classes };
  const sx = sxRaw as Record<string, unknown>;
  const handledResponsive = applyResponsive(sx, classes);
  const decls: Decl[] = [];
  const get = (k: string) => (handledResponsive.has(k) ? undefined : resolveResponsive(sx[k]));

  // Box model — padding. `px`/`mx` and `ps/pe/ms/me` use logical inline
  // properties so RTL documents mirror correctly (X.1).
  decls.push(["padding", space(get("p"))]);
  decls.push(["padding-inline", space(get("px"))]);
  decls.push(["padding-top", space(get("py"))], ["padding-bottom", space(get("py"))]);
  decls.push(["padding-top", space(get("pt"))]);
  decls.push(["padding-right", space(get("pr"))]);
  decls.push(["padding-bottom", space(get("pb"))]);
  decls.push(["padding-left", space(get("pl"))]);
  decls.push(["padding-inline-start", space(get("ps"))]);
  decls.push(["padding-inline-end", space(get("pe"))]);
  // Box model — margin
  decls.push(["margin", space(get("m"))]);
  decls.push(["margin-inline", space(get("mx"))]);
  decls.push(["margin-top", space(get("my"))], ["margin-bottom", space(get("my"))]);
  decls.push(["margin-top", space(get("mt"))]);
  decls.push(["margin-right", space(get("mr"))]);
  decls.push(["margin-bottom", space(get("mb"))]);
  decls.push(["margin-left", space(get("ml"))]);
  decls.push(["margin-inline-start", space(get("ms"))]);
  decls.push(["margin-inline-end", space(get("me"))]);
  decls.push(["gap", space(get("gap"))]);

  // Sizing
  decls.push(["width", size(get("w"))]);
  decls.push(["height", size(get("h"))]);
  decls.push(["min-width", size(get("minW"))]);
  decls.push(["max-width", size(get("maxW"))]);
  decls.push(["min-height", size(get("minH"))]);
  decls.push(["max-height", size(get("maxH"))]);

  // Color & surface
  const bgVal = bg(get("bg"));
  if (bgVal) decls.push(["background", bgVal]);
  decls.push(["color", color(get("color"))]);

  // Border
  const border = get("border");
  if (border != null) for (const d of resolveBorder(border)) decls.push(d);
  const bc = color(get("borderColor"));
  if (bc) decls.push(["border-color", bc]);

  // Radius / shadow / opacity
  const rad = get("radius");
  if (rad != null) {
    const r = asString(rad).trim();
    decls.push(["border-radius", r in RADIUS ? RADIUS[r]! : sanitiseCssLength(r, "") || null]);
  }
  const sh = get("shadow");
  if (sh != null) {
    const s = asString(sh).trim();
    if (s in SHADOW) decls.push(["box-shadow", SHADOW[s]!]);
  }
  const op = num(get("opacity"));
  if (op) decls.push(["opacity", op]);

  // Flex / grid
  const disp = asString(get("display")).trim();
  if (DISPLAY.has(disp)) decls.push(["display", disp]);
  const dir = asString(get("direction")).trim();
  if (DIRECTION.has(dir)) decls.push(["flex-direction", dir]);
  const al = asString(get("align")).trim();
  if (al in ALIGN) decls.push(["align-items", ALIGN[al]!]);
  const ju = asString(get("justify")).trim();
  if (ju in JUSTIFY) decls.push(["justify-content", JUSTIFY[ju]!]);
  if (get("wrap") === true || asString(get("wrap")) === "true") decls.push(["flex-wrap", "wrap"]);
  const grow = num(get("grow"));
  if (grow) decls.push(["flex-grow", grow]);
  const shrink = num(get("shrink"));
  if (shrink) decls.push(["flex-shrink", shrink]);
  const flexBasis = size(get("basis"));
  if (flexBasis) decls.push(["flex-basis", flexBasis]);
  const cols = num(get("columns"));
  if (cols) decls.push(["grid-template-columns", `repeat(${cols}, minmax(0, 1fr))`]);

  // Position & layering
  const pos = asString(get("position")).trim();
  if (POSITION.has(pos)) decls.push(["position", pos]);
  decls.push(["top", size(get("top"))]);
  decls.push(["right", size(get("right"))]);
  decls.push(["bottom", size(get("bottom"))]);
  decls.push(["left", size(get("left"))]);
  const inset = get("inset");
  if (inset != null) {
    const i = asString(inset).trim();
    decls.push(["inset", i === "0" ? "0" : sanitiseCssLength(i, "") || null]);
  }
  const z = get("zIndex");
  if (z != null) {
    const zs = asString(z).trim();
    decls.push(["z-index", zs in Z_INDEX ? Z_INDEX[zs]! : num(zs)]);
  }

  // Typography
  decls.push(["font-size", fontSize(get("fontSize"))]);
  decls.push(["font-weight", fontWeight(get("weight"))]);
  const deco = asString(get("textDecoration")).trim();
  if (TEXT_DECORATION.has(deco)) decls.push(["text-decoration", deco]);

  // Effects
  const ov = asString(get("overflow")).trim();
  if (OVERFLOW.has(ov)) decls.push(["overflow", ov]);
  const cur = asString(get("cursor")).trim();
  if (CURSOR.has(cur)) decls.push(["cursor", cur]);
  const ta = asString(get("textAlign")).trim();
  if (TEXT_ALIGN.has(ta)) decls.push(["text-align", ta]);
  const backdrop = asString(get("backdrop")).trim();
  if (backdrop === "blur") {
    decls.push(["backdrop-filter", "blur(12px)"]);
    decls.push(["-webkit-backdrop-filter", "blur(12px)"]);
  }
  // Background image (scheme-whitelisted url) + optional overlay wash (IX.3).
  const bgImage = asString(get("bgImage")).trim();
  const overlay = overlayLayer(get("bgOverlay"));
  if (bgImage) {
    const safe = safeBgUrl(bgImage);
    if (safe) {
      const url = `url("${safe}")`;
      decls.push(["background-image", overlay ? `${overlay}, ${url}` : url]);
      decls.push(["background-size", asString(get("bgSize")).trim() === "contain" ? "contain" : "cover"]);
      decls.push(["background-position", "center"]);
    }
  } else if (overlay) {
    // `bgOverlay` without an image is still a useful tint layer.
    decls.push(["background-image", overlay]);
  }

  // Interaction states → bounded utility classes (no dynamic CSS)
  collectStateClasses(get("hover"), "hover", classes);
  collectStateClasses(get("focus"), "focus", classes);
  // Arbitrary interaction-state CSS (I.4): `sx.states` (or rich `sx.hover` /
  // `sx.focus` objects) compile to atomic `:hover`/`:focus`/`:active`/… rules
  // in the shared adopted stylesheet. Bounded to the same token-resolved props.
  collectArbitraryStateClasses(sx, classes);

  const style = decls
    .filter((d): d is [string, string] => d[1] != null && d[1] !== "")
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return { style, classes };
}

const STATE_EFFECTS = new Set(["lift", "grow", "glow", "bright", "border", "underline", "scale"]);

function collectStateClasses(raw: unknown, state: "hover" | "focus", classes: string[]): void {
  if (raw == null) return;
  if (typeof raw === "string") {
    if (STATE_EFFECTS.has(raw)) classes.push(`ak-${state}-${raw}`);
    return;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v && STATE_EFFECTS.has(k)) classes.push(`ak-${state}-${k}`);
    }
  }
}

/** States that accept an arbitrary bounded sx-object (I.4). */
const ARBITRARY_STATES = new Set([
  "hover", "focus", "focus-visible", "focus-within", "active",
  "disabled", "checked", "group-hover",
]);

/**
 * Compile `sx.states` (and rich object forms of `sx.hover` / `sx.focus`) into
 * an atomic interaction-state class (I.4). Each state value is a small bounded
 * style object (`{ bg, color, borderColor, shadow, opacity, radius, scale,
 * translateY, translateX, rotate, cursor, textDecoration }`) resolved to safe
 * CSS via {@link resolveStateDecls}. Anything that doesn't resolve is dropped.
 */
function collectArbitraryStateClasses(sx: Record<string, unknown>, classes: string[]): void {
  const groups: StateRuleGroup[] = [];
  const consider = (state: string, value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    // Ignore the bounded-effect keys (lift/grow/…) — those go through the
    // utility-class path; only treat CSS-prop keys as arbitrary state CSS.
    const decls = resolveStateDecls(value as Record<string, unknown>);
    if (decls.length > 0) groups.push({ state, decls });
  };
  const states = sx.states;
  if (states && typeof states === "object" && !Array.isArray(states)) {
    for (const [state, value] of Object.entries(states as Record<string, unknown>)) {
      if (ARBITRARY_STATES.has(state)) consider(state, value);
    }
  }
  // Rich `sx.hover` / `sx.focus` objects may ALSO carry CSS props (e.g.
  // `hover: { bg: "primary-hover", scale: 1.04 }`) — compile those too.
  consider("hover", sx.hover);
  consider("focus", sx.focus);
  if (groups.length === 0) return;
  const cls = stateClassFor(groups);
  if (cls) classes.push(cls);
}

/** Resolve a bounded state-style object into sanitised `[prop, value]` pairs. */
function resolveStateDecls(obj: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const push = (prop: string, value: string | null): void => { if (value) out.push([prop, value]); };
  const transforms: string[] = [];

  push("background", bg(obj.bg));
  push("color", color(obj.color));
  push("border-color", color(obj.borderColor));
  if (obj.shadow != null) {
    const s = asString(obj.shadow).trim();
    if (s in SHADOW) push("box-shadow", SHADOW[s]!);
  }
  if (obj.radius != null) {
    const r = asString(obj.radius).trim();
    push("border-radius", r in RADIUS ? RADIUS[r]! : sanitiseCssLength(r, "") || null);
  }
  const op = num(obj.opacity);
  if (op) push("opacity", op);
  const cur = asString(obj.cursor).trim();
  if (CURSOR.has(cur)) push("cursor", cur);
  if (obj.textDecoration != null) {
    const td = asString(obj.textDecoration).trim();
    if (["underline", "none", "line-through", "overline"].includes(td)) push("text-decoration", td);
  }
  // Bounded transforms.
  const scale = num(obj.scale);
  if (scale) transforms.push(`scale(${scale})`);
  const ty = sanitiseCssLength(asString(obj.translateY), "");
  if (ty) transforms.push(`translateY(${ty})`);
  const tx = sanitiseCssLength(asString(obj.translateX), "");
  if (tx) transforms.push(`translateX(${tx})`);
  if (obj.rotate != null) {
    const deg = asNumber(obj.rotate);
    if (Number.isFinite(deg) && Math.abs(deg) <= 360) transforms.push(`rotate(${deg}deg)`);
  }
  if (transforms.length > 0) push("transform", transforms.join(" "));
  return out;
}

/* ------------------------------------------------------------------------ *
 * Animation presets (Part III.1)
 * ------------------------------------------------------------------------ */

const ANIMATE_PRESETS = new Set([
  "fade", "fade-up", "fade-down", "fade-left", "fade-right",
  "zoom", "zoom-in", "slide-up", "slide-down", "slide-left", "slide-right",
  "pulse", "float", "shimmer", "bounce", "spin", "ping", "wiggle",
]);

/**
 * Resolve the `animate` universal prop → class + inline timing overrides.
 * Accepts a preset string or `{ preset, delay, duration, repeat }`.
 */
export function resolveAnimate(raw: unknown): { classes: string[]; style: string } {
  const classes: string[] = [];
  const decls: string[] = [];
  if (!raw) return { classes, style: "" };
  let preset = "";
  let delay: number | null = null;
  let duration: number | null = null;
  let repeat: unknown = null;
  if (typeof raw === "string") {
    preset = raw.trim();
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    preset = asString(o.preset ?? o.name).trim();
    if (o.delay != null) delay = asNumber(o.delay);
    if (o.duration != null) duration = asNumber(o.duration);
    repeat = o.repeat;
  }
  if (!ANIMATE_PRESETS.has(preset)) return { classes, style: "" };
  classes.push("ak-anim", `ak-anim-${preset}`);
  if (delay != null && delay >= 0 && delay <= 20000) decls.push(`animation-delay:${Math.round(delay)}ms`);
  if (duration != null && duration > 0 && duration <= 20000) decls.push(`animation-duration:${Math.round(duration)}ms`);
  if (repeat === "infinite" || repeat === true) decls.push("animation-iteration-count:infinite");
  else {
    const n = num(repeat);
    if (n) decls.push(`animation-iteration-count:${n}`);
  }
  return { classes, style: decls.join(";") };
}

/* ------------------------------------------------------------------------ *
 * The universal channel
 * ------------------------------------------------------------------------ */

/** Named props that every component implicitly accepts (the universal channel). */
/**
 * Roles an app author may set through the universal `role` channel.
 *
 * Deliberately a closed list: an unrecognised role is dropped by assistive tech
 * anyway, and a plausible-but-wrong one (say `button` on a container) is worse
 * than the original defect. Landmarks, common widget roles, and the two
 * "remove me from the tree" values are covered; anything requiring a matching
 * set of owned children or ARIA state is not, because a bare role override
 * cannot supply those.
 */
const ALLOWED_ROLES = new Set([
  // Landmarks and document structure
  "banner", "complementary", "contentinfo", "form", "main", "navigation",
  "region", "search", "article", "group", "list", "listitem", "separator",
  "heading", "figure", "note", "definition", "term",
  // Live regions and status
  "status", "alert", "log", "timer", "marquee", "progressbar", "meter",
  // Common widgets
  "button", "link", "img", "toolbar", "tooltip", "dialog", "tab", "tabpanel",
  "tablist", "menuitem", "option", "checkbox", "radio", "switch",
  // Explicitly neutral
  "none", "presentation",
]);

export const UNIVERSAL_PROP_NAMES = new Set([
  "sx", "animate", "id", "anchor", "className", "class", "style", "aria", "data", "tooltip", "hidden",
  // Escape valve for ARIA defects that cannot be fixed from outside the library:
  // without it an app author has no way to correct a component's role.
  "role",
  // Second spelling of the `data` channel, for the components that declare a
  // `data` prop of their own (LineChart, JsonTree, Async, Draggable, Lottie,
  // QRCode). On those, the component prop wins and the universal channel was
  // unreachable, so `data-*` attributes could not be set at all.
  "dataAttrs",
]);

export interface UniversalProps {
  sx?: unknown;
  animate?: unknown;
  id?: unknown;
  anchor?: unknown;
  className?: unknown;
  class?: unknown;
  style?: unknown;
  aria?: unknown;
  data?: unknown;
  dataAttrs?: unknown;
  role?: unknown;
  tooltip?: unknown;
  hidden?: unknown;
}

const CLASS_TOKEN = /^[A-Za-z_][\w-]*$/;

function sanitiseClasses(raw: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = asString(v).trim();
    for (const tok of s.split(/\s+/)) {
      if (tok && CLASS_TOKEN.test(tok)) out.push(tok);
    }
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else push(raw);
  return out;
}

/** A defensive subset matching the inline-style sanitiser used elsewhere. */
const STYLE_BLOCK_RE = /<\/?\w|expression\s*\(|javascript\s*:|@import\b|url\s*\(\s*['"]?\s*(javascript|data:text)/i;
function sanitiseStyleString(raw: unknown): string {
  const s = asString(raw).trim();
  if (!s || s.length > 2048) return "";
  if (STYLE_BLOCK_RE.test(s)) return "";
  return s;
}

const ARIA_KEY = /^[a-z][a-z-]{1,32}$/;

/**
 * Declarations that only mean something when the element generates a box.
 * On a `display: contents` host every one of them is inert — the style
 * attribute really is written, it just cannot render.
 */
const NEEDS_BOX_DECL =
  /(?:^|;)\s*(?:padding|margin|width|height|min-width|max-width|min-height|max-height|background|border|box-shadow|outline|overflow|gap|position|inset|top|right|bottom|left|aspect-ratio)\b/i;

/** True when the merged `sx` / `style` decides the element's `display` itself. */
const DECLARES_DISPLAY = /(?:^|;)\s*display\s*:/i;

/** An inline `display: contents` the component put on its own root. */
const INLINE_CONTENTS = /(?:^|;)\s*display\s*:\s*contents\s*(?:;|$)/i;

/**
 * Boxless component roots whose `display: contents` comes from the theme
 * stylesheet rather than an inline style, plus the renderer's own host span for
 * fragment-returning components (an inline `<span>` cannot carry a box either).
 *
 * An inline `padding` does not rescue these: the inline style only wins per
 * property, so an author `display: contents` rule keeps beating it. Keep in
 * sync with the `display: contents` rules in `src/theme/styles.ts`.
 */
const BOXLESS_HOST_CLASSES = ["rui-universal-host", "rui-route", "rui-transition", "rui-focus-trap"];

/** Drop inline `display` declarations so a promoted host's own display wins. */
function stripDisplay(style: string): string {
  return style
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl !== "" && !/^display\s*:/i.test(decl))
    .join(";");
}

/**
 * Apply the universal-prop channel to a rendered element. Merges with any
 * inline style/classes the component already set. Safe to call with a
 * non-Element (no-ops) and with an empty `universal` (no-ops).
 */
export function applyUniversal(node: Node, universal: UniversalProps | null | undefined): void {
  if (!universal || !(node instanceof Element)) return;
  const elNode = node as HTMLElement;
  const styleParts: string[] = [];
  const classes: string[] = [];

  if (universal.sx != null) {
    const { style, classes: sxClasses } = serializeSx(universal.sx);
    if (style) styleParts.push(style);
    classes.push(...sxClasses);
  }
  /** Set when the channel carries something that a boxless host cannot show. */
  let needsBox = false;
  if (universal.animate != null) {
    const { classes: aClasses, style } = resolveAnimate(universal.animate);
    classes.push(...aClasses);
    if (style) styleParts.push(style);
    // An animation on a boxless element animates nothing.
    if (aClasses.length > 0) needsBox = true;
  }
  const rawStyle = sanitiseStyleString(universal.style);
  if (rawStyle) styleParts.push(rawStyle);

  const sxStyle = styleParts.join(";");
  const existing = elNode.getAttribute("style") ?? "";
  // A boxless root (`display: contents`, or the renderer's host span) adds no
  // box to the layout — which also means padding / background / sizing /
  // animation from the universal channel provably cannot render on it, with no
  // warning anywhere. When the author asks for a box, give the host one.
  // `hidden` needs the same treatment: the UA's `[hidden] { display: none }`
  // loses to an author `display: contents`.
  const boxless = INLINE_CONTENTS.test(existing)
    || BOXLESS_HOST_CLASSES.some((c) => elNode.classList.contains(c));
  let promoted: string | null = null;
  if (boxless) {
    if (universal.hidden === true) promoted = "none";
    // `block`, matching the wrapper components (`wrapperStyle`): a block child
    // keeps its width and gains no baseline gap underneath it.
    else if (!DECLARES_DISPLAY.test(sxStyle) && (needsBox || NEEDS_BOX_DECL.test(sxStyle))) promoted = "block";
  }
  if (sxStyle || promoted) {
    const base = promoted ? stripDisplay(existing) : existing;
    const merged = [base, promoted ? `display:${promoted}` : "", sxStyle].filter(Boolean).join(";");
    elNode.setAttribute("style", merged);
  }

  classes.push(...sanitiseClasses(universal.className));
  classes.push(...sanitiseClasses(universal.class));
  for (const c of classes) elNode.classList.add(c);

  const id = asString(universal.id ?? universal.anchor).trim();
  if (id && /^[A-Za-z][\w-]*$/.test(id)) elNode.setAttribute("id", id);

  if (universal.hidden === true) elNode.setAttribute("hidden", "");

  const tooltip = asString(universal.tooltip).trim();
  if (tooltip) elNode.setAttribute("title", tooltip);

  // `role` is allow-listed rather than passed through. An arbitrary value can
  // make a component WORSE than the defect it was meant to work around — an
  // unknown role is ignored by AT, and a wrong landmark or widget role silently
  // breaks the accessibility tree. These are the roles that are meaningful to
  // override on a component root.
  const roleRaw = asString(universal.role).trim().toLowerCase();
  if (roleRaw && ALLOWED_ROLES.has(roleRaw)) elNode.setAttribute("role", roleRaw);

  if (universal.aria && typeof universal.aria === "object") {
    for (const [k, v] of Object.entries(universal.aria as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (ARIA_KEY.test(key) && v != null) {
        elNode.setAttribute(key.startsWith("aria-") ? key : `aria-${key}`, asString(v));
      }
    }
  }
  // `dataAttrs` is the escape hatch for components whose own `data` prop shadows
  // this channel; when both are present the explicit spelling wins.
  const dataBag = (universal.dataAttrs && typeof universal.dataAttrs === "object")
    ? universal.dataAttrs
    : (universal.data && typeof universal.data === "object" ? universal.data : null);
  if (dataBag) {
    for (const [k, v] of Object.entries(dataBag as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (key && v != null) elNode.setAttribute(`data-${key}`, asString(v));
    }
  }
}
