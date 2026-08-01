/**
 * Responsive `sx` support (suggestions-global I.5).
 *
 * Emits atomic, deduped CSS classes with `@media (min-width: …)` rules into a
 * single shared constructable stylesheet that every shadow root adopts
 * alongside the main component stylesheet. This lets `sx` values be breakpoint
 * maps (`{ base, sm, md, lg, xl }`) that emit real media queries — not just
 * the resolved base value — while staying bounded (the caller only passes
 * already-sanitised CSS prop/value pairs).
 *
 * In environments without constructable stylesheets (some headless DOMs),
 * `responsiveClassFor` returns null and the caller falls back to emitting the
 * base value inline.
 */

/** Breakpoint → min-width (px). `base` is the 0-width default (no media query). */
export const BREAKPOINT_MIN: Record<string, number> = {
  base: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

const BP_ORDER: Record<string, number> = { base: 0, sm: 1, md: 2, lg: 3, xl: 4 };

let dynSheet: CSSStyleSheet | null | undefined;
const ruleCache = new Map<string, string>();
let classCounter = 0;

/**
 * Lazily create (once) the shared dynamic stylesheet used for responsive
 * atomic rules. Returns null when constructable stylesheets are unavailable.
 */
export function getResponsiveSheet(): CSSStyleSheet | null {
  if (dynSheet !== undefined) return dynSheet;
  try {
    if (
      typeof CSSStyleSheet === "undefined" ||
      !("replaceSync" in CSSStyleSheet.prototype) ||
      typeof document === "undefined" ||
      !("adoptedStyleSheets" in Document.prototype)
    ) {
      dynSheet = null;
      return null;
    }
    dynSheet = new CSSStyleSheet();
    return dynSheet;
  } catch {
    dynSheet = null;
    return null;
  }
}

export interface ResponsiveGroup {
  /** Breakpoint key (`base` | `sm` | `md` | `lg` | `xl`). */
  bp: string;
  /** Already-resolved + sanitised `[cssProperty, cssValue]` pairs. */
  decls: Array<[string, string]>;
}

/**
 * Build (or reuse) a deduped atomic class for a set of per-breakpoint
 * declarations. Rules are inserted in ascending breakpoint order so the
 * cascade resolves correctly at any viewport width. Returns the class name,
 * or null when responsive emission is unavailable (caller emits base inline).
 */
export function responsiveClassFor(groups: ResponsiveGroup[]): string | null {
  const sheet = getResponsiveSheet();
  if (!sheet) return null;
  const ordered = [...groups]
    .filter((g) => g.decls.length > 0)
    .sort((a, b) => (BP_ORDER[a.bp] ?? 0) - (BP_ORDER[b.bp] ?? 0));
  if (ordered.length === 0) return null;

  const cacheKey = ordered
    .map((g) => `${g.bp}{${g.decls.map(([p, v]) => `${p}:${v}`).join(";")}}`)
    .join("|");
  const cached = ruleCache.get(cacheKey);
  if (cached) return cached;

  const cls = `ak-r${(classCounter++).toString(36)}`;
  // The selector repeats the class three times on purpose.
  //
  // A single `.ak-rX` is specificity (0,1,0), but almost every component styles
  // itself with an attribute selector — `.rui-stack[data-gap="md"]`, (0,2,0) —
  // so the component's own default beat the author's `sx` value and every
  // responsive map was silently ignored. (Non-responsive `sx` values were never
  // affected: those are emitted as an inline style, which already wins.)
  //
  // Repeating the class lifts it to (0,3,0), which beats the component rules
  // outright rather than relying on source order between two stylesheets. It
  // still loses to `!important` and to inline styles, which is correct — an
  // explicit non-responsive `sx` value on the same element should win.
  const sel = `.${cls}.${cls}.${cls}`;
  for (const g of ordered) {
    const body = g.decls.map(([p, v]) => `${p}:${v}`).join(";");
    const min = BREAKPOINT_MIN[g.bp] ?? 0;
    const rule = min > 0
      ? `@media (min-width:${min}px){${sel}{${body}}}`
      : `${sel}{${body}}`;
    try {
      sheet.insertRule(rule, sheet.cssRules.length);
    } catch {
      /* malformed rule — skip; base inline already covers it */
    }
  }
  ruleCache.set(cacheKey, cls);
  return cls;
}

/** True when a value is a responsive breakpoint map (`{ base|sm|md|lg|xl: … }`). */
export function isResponsiveMap(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const map = v as Record<string, unknown>;
  return "base" in map || "sm" in map || "md" in map || "lg" in map || "xl" in map;
}

/** One CSS state pseudo-selector → its `:selector` suffix. */
const STATE_SELECTOR: Record<string, string> = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  "focus-within": ":focus-within",
  active: ":active",
  disabled: ":disabled, &[disabled], &[data-disabled='true']",
  checked: ":checked, &[aria-checked='true']",
  "group-hover": "", // handled specially below
};

export interface StateRuleGroup {
  /** State key (`hover` | `focus` | `active` | `disabled` | …). */
  state: string;
  /** Already-resolved + sanitised `[cssProperty, cssValue]` pairs. */
  decls: Array<[string, string]>;
}

/**
 * Build (or reuse) a deduped atomic class for arbitrary interaction-state CSS
 * (suggestions-global I.4) — `:hover` / `:focus` / `:active` / `:disabled` /
 * `:focus-visible` / `:checked`, plus `group-hover` (fires when an ancestor
 * `.ak-group` is hovered). The declarations are caller-sanitised
 * `[property, value]` pairs, so the surface stays bounded. Returns the class
 * name, or null when the shared stylesheet is unavailable.
 */
export function stateClassFor(groups: StateRuleGroup[]): string | null {
  const sheet = getResponsiveSheet();
  if (!sheet) return null;
  const valid = groups.filter((g) => g.decls.length > 0 && (g.state in STATE_SELECTOR));
  if (valid.length === 0) return null;

  const cacheKey = "S|" + valid
    .map((g) => `${g.state}{${g.decls.map(([p, v]) => `${p}:${v}`).join(";")}}`)
    .join("|");
  const cached = ruleCache.get(cacheKey);
  if (cached) return cached;

  const cls = `ak-s${(classCounter++).toString(36)}`;
  // Base transition so state changes animate smoothly (matches the bounded
  // hover utilities). Reduced-motion users get instant changes via the global
  // `@media (prefers-reduced-motion)` rule in the main stylesheet.
  try {
    sheet.insertRule(
      `.${cls}{transition:background .15s ease,color .15s ease,box-shadow .15s ease,transform .15s ease,opacity .15s ease,border-color .15s ease;}`,
      sheet.cssRules.length,
    );
  } catch { /* skip */ }
  for (const g of valid) {
    const body = g.decls.map(([p, v]) => `${p}:${v}`).join(";");
    let rule: string;
    if (g.state === "group-hover") {
      rule = `.ak-group:hover .${cls}{${body}}`;
    } else if (g.state === "disabled") {
      rule = `.${cls}:disabled,.${cls}[disabled],.${cls}[data-disabled="true"]{${body}}`;
    } else if (g.state === "checked") {
      rule = `.${cls}:checked,.${cls}[aria-checked="true"]{${body}}`;
    } else {
      rule = `.${cls}${STATE_SELECTOR[g.state]}{${body}}`;
    }
    try {
      sheet.insertRule(rule, sheet.cssRules.length);
    } catch {
      /* malformed rule — skip */
    }
  }
  ruleCache.set(cacheKey, cls);
  return cls;
}
