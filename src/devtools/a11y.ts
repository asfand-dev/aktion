/**
 * Aktion DevTools — accessibility audit.
 *
 * A static pass over the app's rendered DOM, run on demand from the Test tab.
 * It is not a substitute for a real audit tool, and it does not pretend to be
 * axe-core; it covers the failures a generated UI actually produces, which are
 * a narrow and very repetitive set: an icon button with no name, an input whose
 * only label is its placeholder, a heading ladder with a hole in it, body text
 * at 2.6:1 on its own surface.
 *
 * Two design rules keep it honest:
 *
 *   - **Every finding names the element and the fix.** A list of rule ids is
 *     not actionable; "Button at [3] has no accessible name — add `label:` or
 *     `aria: { label: … }`" is.
 *   - **Never throw, never guess.** A rule that cannot be evaluated in this
 *     environment (no `getComputedStyle`, a cross-origin font) is skipped, not
 *     reported as a pass and not reported as a failure.
 */

import { accessibleName, implicitRole } from "./overlay.js";

/** How much a finding matters, in the vocabulary audit tools share. */
export type A11yImpact = "critical" | "serious" | "moderate" | "minor";

/** One accessibility problem found in the rendered tree. */
export interface A11yFinding {
  /** Rule id (`image-alt`, `button-name`, `color-contrast`). */
  rule: string;
  impact: A11yImpact;
  /** What is wrong, naming the element. */
  message: string;
  /** How to fix it, in Aktion terms. */
  help: string;
  /** The offending element, for highlighting. */
  element: Element;
  /** Extra measured detail (`2.61:1`, `h2 → h4`). */
  detail?: string;
  /** WCAG 2.2 success criteria this finding fails (`1.1.1`). */
  wcag?: string[];
  /** Grouping for the audit view. */
  category?: A11yCategory;
}

export type A11yCategory = "names" | "structure" | "aria" | "keyboard" | "contrast" | "forms" | "media";

/** Rule metadata the audit view shows next to every finding. */
export const RULE_INFO: Record<string, { wcag: string[]; category: A11yCategory; title: string }> = {
  "image-alt": { wcag: ["1.1.1"], category: "names", title: "Images have alternative text" },
  "button-name": { wcag: ["4.1.2"], category: "names", title: "Buttons have an accessible name" },
  "link-name": { wcag: ["2.4.4", "4.1.2"], category: "names", title: "Links have an accessible name" },
  "form-field-label": { wcag: ["1.3.1", "4.1.2"], category: "forms", title: "Form fields have labels" },
  "label-placeholder-only": { wcag: ["3.3.2"], category: "forms", title: "Labels are not placeholder-only" },
  "label-title-only": { wcag: ["3.3.2"], category: "forms", title: "Labels are not title-only" },
  "heading-order": { wcag: ["1.3.1"], category: "structure", title: "Heading levels increase by one" },
  "empty-heading": { wcag: ["1.3.1", "2.4.6"], category: "structure", title: "Headings have text" },
  "duplicate-id": { wcag: ["4.1.2"], category: "aria", title: "ids are unique" },
  "aria-dangling-reference": { wcag: ["1.3.1", "4.1.2"], category: "aria", title: "ARIA references resolve" },
  "aria-role-unknown": { wcag: ["4.1.2"], category: "aria", title: "Roles are valid" },
  "aria-valid-attr-value": { wcag: ["4.1.2"], category: "aria", title: "ARIA states have valid values" },
  "aria-required-parent": { wcag: ["1.3.1"], category: "aria", title: "Roles sit inside their required parent" },
  "presentation-role-conflict": { wcag: ["4.1.2"], category: "aria", title: "Presentational elements are not interactive" },
  "tabindex-positive": { wcag: ["2.4.3"], category: "keyboard", title: "No positive tabindex" },
  "aria-hidden-focus": { wcag: ["4.1.2"], category: "keyboard", title: "Hidden content is not focusable" },
  "nested-interactive": { wcag: ["4.1.2"], category: "keyboard", title: "Controls are not nested" },
  "scrollable-region-focusable": { wcag: ["2.1.1"], category: "keyboard", title: "Scrollable regions are keyboard-reachable" },
  "target-size": { wcag: ["2.5.8"], category: "keyboard", title: "Targets are at least 24×24px" },
  "color-contrast": { wcag: ["1.4.3"], category: "contrast", title: "Text has enough contrast" },
  "non-text-contrast": { wcag: ["1.4.11"], category: "contrast", title: "Control boundaries have 3:1 contrast" },
  "table-headers": { wcag: ["1.3.1"], category: "structure", title: "Tables have header cells" },
  "link-destination": { wcag: ["2.4.4"], category: "names", title: "Links go somewhere" },
  "list-structure": { wcag: ["1.3.1"], category: "structure", title: "List items are inside lists" },
  "svg-img-alt": { wcag: ["1.1.1"], category: "names", title: "SVG images have a name" },
  "role-img-alt": { wcag: ["1.1.1"], category: "names", title: "role=img elements have a name" },
  "iframe-title": { wcag: ["4.1.2"], category: "names", title: "Frames have a title" },
  "summary-name": { wcag: ["4.1.2"], category: "names", title: "Disclosure summaries have text" },
  "video-caption": { wcag: ["1.2.2"], category: "media", title: "Videos have captions" },
  "autocomplete-valid": { wcag: ["1.3.5"], category: "forms", title: "autocomplete uses valid tokens" },
  "landmark-main": { wcag: ["1.3.1"], category: "structure", title: "Content sits in a main landmark" },
};

const IMPACT_ORDER: Record<A11yImpact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** ARIA roles the audit recognises; anything else is reported as unknown. */
const KNOWN_ROLES = new Set([
  "alert", "alertdialog", "application", "article", "banner", "blockquote", "button", "caption", "cell",
  "checkbox", "code", "columnheader", "combobox", "complementary", "contentinfo", "definition", "deletion",
  "dialog", "directory", "document", "emphasis", "feed", "figure", "form", "generic", "grid", "gridcell",
  "group", "heading", "img", "insertion", "link", "list", "listbox", "listitem", "log", "main", "marquee",
  "math", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "navigation", "none",
  "note", "option", "paragraph", "presentation", "progressbar", "radio", "radiogroup", "region", "row",
  "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton", "status",
  "strong", "subscript", "superscript", "switch", "tab", "table", "tablist", "tabpanel", "term", "textbox",
  "time", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem",
]);

const FOCUSABLE_SELECTOR = [
  "a[href]", "button", "input", "select", "textarea", "summary",
  "[tabindex]", "[contenteditable=\"true\"]",
].join(",");

/* -------------------------------------------------------------------------- */
/*  Colour maths                                                               */
/* -------------------------------------------------------------------------- */

/** Parse a CSS colour into RGBA, or `null` for one we cannot read. */
export function parseColor(css: string): { r: number; g: number; b: number; a: number } | null {
  const text = css.trim().toLowerCase();
  if (text === "" || text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) {
    const parts = rgb[1]!.split(/[,/\s]+/).filter(Boolean).map(Number);
    const [r, g, b, a] = parts;
    if (r === undefined || g === undefined || b === undefined) return null;
    return { r, g, b, a: a === undefined ? 1 : a };
  }
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1]!;
    const expand = (s: string): number => Number.parseInt(s.length === 1 ? s + s : s, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]!), g: expand(digits[1]!), b: expand(digits[2]!),
        a: digits.length === 4 ? expand(digits[3]!) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  return null;
}

/** Relative luminance per WCAG 2.x. */
export function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** Contrast ratio between two opaque colours (1–21). */
export function contrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite `fg` over `bg` using `fg`'s alpha. */
function over(
  fg: { r: number; g: number; b: number; a: number },
  bg: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  return {
    r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
    g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
    b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
  };
}

/**
 * Effective background behind an element: walk up until an opaque colour is
 * found, compositing translucent layers on the way. Crossing shadow boundaries
 * matters here — the app's own surface colour lives on `.rui-root` inside a
 * shadow root, and stopping at the boundary would report white on white.
 */
export function effectiveBackground(element: Element): { r: number; g: number; b: number } | null {
  if (typeof getComputedStyle !== "function") return null;
  const stack: Array<{ r: number; g: number; b: number; a: number }> = [];
  let current: Element | null = element;
  let guard = 0;
  while (current && guard++ < 40) {
    let style: CSSStyleDeclaration | null = null;
    try { style = getComputedStyle(current); } catch { style = null; }
    if (style) {
      const parsed = parseColor(style.backgroundColor || "transparent");
      if (parsed && parsed.a > 0) {
        stack.push(parsed);
        if (parsed.a >= 1) break;
      }
    }
    const parent: Element | null = current.parentElement;
    current = parent ?? ((current.getRootNode() as ShadowRoot).host ?? null);
  }
  if (stack.length === 0) return { r: 255, g: 255, b: 255 };
  // Composite from the bottom layer up.
  let result = { r: 255, g: 255, b: 255 };
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    result = over(stack[i]!, result);
  }
  return result;
}

/** WCAG "large text": ≥24px, or ≥18.66px when bold. */
function isLargeText(style: CSSStyleDeclaration): boolean {
  const size = Number.parseFloat(style.fontSize);
  const weight = Number.parseInt(style.fontWeight, 10);
  if (!Number.isFinite(size)) return false;
  if (size >= 24) return true;
  return size >= 18.66 && Number.isFinite(weight) && weight >= 700;
}

/* -------------------------------------------------------------------------- */
/*  The audit                                                                  */
/* -------------------------------------------------------------------------- */

interface RuleContext {
  root: Element;
  elements: Element[];
  push(finding: A11yFinding): void;
}

/**
 * Run the audit over a rendered subtree.
 *
 * `limit` caps the elements examined so auditing a 20k-node data grid cannot
 * freeze the panel; the caller is told when the cap was hit.
 */
export function auditAccessibility(
  root: Element | null,
  options: { limit?: number } = {},
): { findings: A11yFinding[]; examined: number; truncated: boolean } {
  if (!root) return { findings: [], examined: 0, truncated: false };
  const limit = options.limit ?? 4000;
  const all = [...root.querySelectorAll("*")];
  const elements = all.slice(0, limit);
  const findings: A11yFinding[] = [];
  const ctx: RuleContext = {
    root,
    elements,
    push: (finding) => findings.push(finding),
  };

  for (const rule of RULES) {
    try {
      rule(ctx);
    } catch {
      // A rule that trips over an exotic element must not take the audit with
      // it — the other twelve findings are still worth showing.
    }
  }

  for (const finding of findings) {
    const info = RULE_INFO[finding.rule];
    if (info) {
      finding.wcag ??= info.wcag;
      finding.category ??= info.category;
    }
  }
  findings.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
  return { findings, examined: elements.length, truncated: all.length > elements.length };
}

/**
 * A 0–100 score, Lighthouse-style: each failing RULE costs by impact (a second
 * instance of the same failure costs far less than a new kind of failure,
 * because one fix usually clears every instance).
 */
export function a11yScore(findings: ReadonlyArray<A11yFinding>): number {
  const weight: Record<A11yImpact, number> = { critical: 12, serious: 8, moderate: 4, minor: 1.5 };
  const byRule = new Map<string, { impact: A11yImpact; count: number }>();
  for (const finding of findings) {
    const existing = byRule.get(finding.rule);
    if (!existing) byRule.set(finding.rule, { impact: finding.impact, count: 1 });
    else {
      existing.count += 1;
      if (IMPACT_ORDER[finding.impact] < IMPACT_ORDER[existing.impact]) existing.impact = finding.impact;
    }
  }
  let penalty = 0;
  for (const { impact, count } of byRule.values()) {
    penalty += weight[impact] + Math.min(weight[impact], (count - 1) * weight[impact] * 0.08);
  }
  return Math.max(0, Math.round(100 - penalty));
}

type Rule = (ctx: RuleContext) => void;

const RULES: ReadonlyArray<Rule> = [
  /* ---- names ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.tagName !== "IMG") continue;
      if (element.hasAttribute("alt")) continue;
      if (element.getAttribute("role") === "presentation" || element.getAttribute("role") === "none") continue;
      ctx.push({
        rule: "image-alt",
        impact: "critical",
        message: `<img> has no alt attribute (${shortSrc(element)}).`,
        help: 'Pass `alt:` on Image(...). Use `alt: ""` for a purely decorative image.',
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role") ?? implicitRole(element);
      if (role !== "button" && role !== "link") continue;
      if (accessibleName(element) !== "") continue;
      // An icon-only control is the standard way this happens: the glyph is a
      // background or an <svg> with no title, so there is nothing to announce.
      ctx.push({
        rule: role === "button" ? "button-name" : "link-name",
        impact: "critical",
        message: `${describe(element)} has no accessible name.`,
        help: role === "button"
          ? 'Give the Button a label, or set `aria: { label: "Close" }` for an icon-only button.'
          : 'Give the Link text, or set `aria: { label: … }`.',
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      if (element instanceof HTMLInputElement && (element.type === "hidden" || element.type === "submit" || element.type === "button" || element.type === "reset")) continue;
      const labels = element.labels;
      const hasLabel = (labels && labels.length > 0) || element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
      if (hasLabel) continue;
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) {
        ctx.push({
          rule: "label-placeholder-only",
          impact: "serious",
          message: `${describe(element)} is labelled only by its placeholder ("${placeholder}").`,
          help: "A placeholder disappears on focus and is not a label. Add `label:` to the field.",
          element,
        });
      } else {
        ctx.push({
          rule: "form-field-label",
          impact: "critical",
          message: `${describe(element)} has no label.`,
          help: "Add `label:` to the field, or wire `aria: { labelledby: … }` to visible text.",
          element,
        });
      }
    }
  },

  /* ---- structure ---- */
  (ctx) => {
    const headings = ctx.elements.filter((el) => /^H[1-6]$/.test(el.tagName));
    let previous = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName[1]);
      if (previous !== 0 && level > previous + 1) {
        ctx.push({
          rule: "heading-order",
          impact: "moderate",
          message: `Heading level jumps from h${previous} to h${level} ("${text(heading)}").`,
          help: "Headings form the page outline a screen-reader user navigates by. Use the next level down, or restructure.",
          element: heading,
          detail: `h${previous} → h${level}`,
        });
      }
      previous = level;
    }
  },
  (ctx) => {
    const ids = new Map<string, Element[]>();
    for (const element of ctx.elements) {
      const id = element.id;
      if (!id) continue;
      const bucket = ids.get(id);
      if (bucket) bucket.push(element);
      else ids.set(id, [element]);
    }
    for (const [id, elements] of ids) {
      if (elements.length < 2) continue;
      ctx.push({
        rule: "duplicate-id",
        impact: "serious",
        message: `id "${id}" is used ${elements.length} times.`,
        help: "`aria-labelledby`, `for`, and anchor links all resolve the FIRST match, so duplicates silently mis-wire. Use `key:` or a unique `id:`.",
        element: elements[1]!,
      });
    }
  },
  (ctx) => {
    const rootNode = ctx.root.getRootNode() as Document | ShadowRoot;
    const lookup = (id: string): Element | null => {
      try {
        return (rootNode as Document).getElementById?.(id) ?? ctx.root.querySelector(`[id="${id.replace(/(["\\])/g, "\\$1")}"]`);
      } catch {
        return null;
      }
    };
    for (const element of ctx.elements) {
      for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const missing = value.split(/\s+/).filter((id) => id !== "" && lookup(id) === null);
        if (missing.length === 0) continue;
        ctx.push({
          rule: "aria-dangling-reference",
          impact: "serious",
          message: `${describe(element)} has ${attr}="${value}" but ${missing.join(", ")} does not exist.`,
          help: "A dangling reference makes the whole attribute inert — the name or description is simply not announced.",
          element,
        });
      }
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role");
      if (!role) continue;
      const unknown = role.split(/\s+/).filter((r) => r !== "" && !KNOWN_ROLES.has(r));
      if (unknown.length === 0) continue;
      ctx.push({
        rule: "aria-role-unknown",
        impact: "moderate",
        message: `${describe(element)} has an unrecognised role "${unknown.join(" ")}".`,
        help: "An invalid role is ignored, so the element falls back to its implicit role — usually `generic`.",
        element,
      });
    }
  },

  /* ---- focus ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      const raw = element.getAttribute("tabindex");
      if (raw === null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      ctx.push({
        rule: "tabindex-positive",
        impact: "moderate",
        message: `${describe(element)} has tabindex="${raw}".`,
        help: "A positive tabindex jumps ahead of every natural stop and makes tab order unpredictable. Use DOM order, or tabindex=\"0\".",
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.getAttribute("aria-hidden") !== "true") continue;
      let focusable: Element[] = [];
      try {
        focusable = [...element.querySelectorAll(FOCUSABLE_SELECTOR)];
      } catch {
        focusable = [];
      }
      const reachable = focusable.filter((el) => el.getAttribute("tabindex") !== "-1" && !(el as HTMLButtonElement).disabled);
      if (reachable.length === 0) continue;
      ctx.push({
        rule: "aria-hidden-focus",
        impact: "serious",
        message: `${describe(element)} is aria-hidden but contains ${reachable.length} focusable element(s).`,
        help: "A keyboard user can tab into content a screen reader cannot see. Remove the focusable elements from the tab order, or stop hiding the container.",
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role") ?? implicitRole(element);
      if (role !== "button" && role !== "link" && role !== "checkbox" && role !== "radio" && role !== "switch") continue;
      let nested: Element[] = [];
      try {
        nested = [...element.querySelectorAll("a[href],button,input,select,textarea")];
      } catch {
        nested = [];
      }
      if (nested.length === 0) continue;
      ctx.push({
        rule: "nested-interactive",
        impact: "serious",
        message: `${describe(element)} contains another interactive element (${describe(nested[0]!)}).`,
        help: "Nested controls have no reliable keyboard or screen-reader behaviour. Put them side by side instead.",
        element,
      });
    }
  },
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    for (const element of ctx.elements) {
      const role = element.getAttribute("role") ?? implicitRole(element);
      if (role !== "button" && role !== "link" && role !== "checkbox" && role !== "switch") continue;
      const rect = element.getBoundingClientRect();
      // Zero-size means "not laid out yet" (or display:none), not "too small".
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.width >= 24 && rect.height >= 24) continue;
      ctx.push({
        rule: "target-size",
        impact: "minor",
        message: `${describe(element)} is ${Math.round(rect.width)}×${Math.round(rect.height)}px.`,
        help: "WCAG 2.2 asks for a 24×24 minimum target. Add padding, or increase the icon button's size.",
        element,
        detail: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      });
    }
  },

  /* ---- contrast ---- */
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    let reported = 0;
    for (const element of ctx.elements) {
      if (reported >= 25) return;
      if (!hasOwnText(element)) continue;
      let style: CSSStyleDeclaration;
      try { style = getComputedStyle(element); } catch { continue; }
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
      const fg = parseColor(style.color);
      if (!fg || fg.a === 0) continue;
      const bg = effectiveBackground(element);
      if (!bg) continue;
      const ratio = contrastRatio(over(fg, bg), bg);
      const large = isLargeText(style);
      const required = large ? 3 : 4.5;
      if (ratio >= required) continue;
      reported += 1;
      ctx.push({
        rule: "color-contrast",
        impact: ratio < required - 1.5 ? "serious" : "moderate",
        message: `"${text(element)}" has a contrast of ${ratio.toFixed(2)}:1 (needs ${required}:1).`,
        help: "Adjust the theme token behind this text — `colorText`, `colorTextMuted`, or the status *Text tokens for coloured labels.",
        element,
        detail: `${ratio.toFixed(2)}:1 vs ${required}:1`,
      });
    }
  },

  /* ---- tables + links ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.tagName !== "TABLE") continue;
      if (element.querySelector("th")) continue;
      if (element.getAttribute("role") === "presentation" || element.getAttribute("role") === "none") continue;
      ctx.push({
        rule: "table-headers",
        impact: "moderate",
        message: "A <table> has no header cells.",
        help: "Without <th>, every cell is announced without context. Declare columns so the header row is rendered.",
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.tagName !== "A") continue;
      const href = element.getAttribute("href");
      if (href === null) continue;
      if (href.trim() !== "" && href.trim() !== "#") continue;
      ctx.push({
        rule: "link-destination",
        impact: "minor",
        message: `Link "${text(element)}" has no destination (href="${href}").`,
        help: "A link with no destination is a button. Use Button(...) with `onClick`, or give the link a real `href`.",
        element,
      });
    }
  },

  /* ---- more structure + ARIA ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      if (!/^H[1-6]$/.test(element.tagName) && element.getAttribute("role") !== "heading") continue;
      if (accessibleName(element) !== "") continue;
      ctx.push({
        rule: "empty-heading",
        impact: "serious",
        message: `${describe(element)} is an empty heading.`,
        help: "Screen-reader users jump between headings; an empty one is a stop with nothing to announce. Give it text or remove it.",
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const isItem = element.tagName === "LI" || element.getAttribute("role") === "listitem";
      if (!isItem) continue;
      const parent = element.parentElement;
      const parentRole = parent?.getAttribute("role");
      const ok = parent && (parent.tagName === "UL" || parent.tagName === "OL" || parent.tagName === "MENU" || parentRole === "list" || parentRole === "group");
      if (ok) continue;
      if (parentRole === "none" || parentRole === "presentation") continue;
      ctx.push({
        rule: "list-structure",
        impact: "moderate",
        message: `${describe(element)} is a list item outside a list.`,
        help: "Assistive tech announces \"list, N items\" from the parent. Put the item inside a List, or drop the item role.",
        element,
      });
    }
  },
  (ctx) => {
    const TRISTATE = new Set(["aria-checked", "aria-pressed"]);
    const BOOLEAN = ["aria-expanded", "aria-selected", "aria-hidden", "aria-disabled", "aria-required", "aria-readonly", "aria-busy", "aria-modal", "aria-multiselectable"];
    for (const element of ctx.elements) {
      for (const attr of [...BOOLEAN, ...TRISTATE]) {
        const value = element.getAttribute(attr);
        if (value === null) continue;
        const valid = value === "true" || value === "false" || (TRISTATE.has(attr) && value === "mixed") || (attr === "aria-expanded" && value === "undefined");
        if (valid) continue;
        ctx.push({
          rule: "aria-valid-attr-value",
          impact: "serious",
          message: `${describe(element)} has ${attr}="${value}".`,
          help: `${attr} takes "true" or "false"${TRISTATE.has(attr) ? " (or \"mixed\")" : ""}. Anything else — including an empty string — is ignored or read as the wrong state.`,
          element,
          detail: `${attr}="${value}"`,
        });
      }
      const invalid = element.getAttribute("aria-invalid");
      if (invalid !== null && !["true", "false", "grammar", "spelling"].includes(invalid)) {
        ctx.push({
          rule: "aria-valid-attr-value",
          impact: "moderate",
          message: `${describe(element)} has aria-invalid="${invalid}".`,
          help: 'aria-invalid takes "true", "false", "grammar", or "spelling".',
          element,
        });
      }
    }
  },
  (ctx) => {
    const REQUIRED_PARENT: Record<string, string[]> = {
      tab: ["tablist"],
      option: ["listbox", "combobox", "group"],
      menuitem: ["menu", "menubar", "group"],
      menuitemcheckbox: ["menu", "menubar", "group"],
      menuitemradio: ["menu", "menubar", "group"],
      treeitem: ["tree", "group"],
      row: ["table", "grid", "treegrid", "rowgroup"],
      cell: ["row"],
      gridcell: ["row"],
      columnheader: ["row"],
      rowheader: ["row"],
    };
    for (const element of ctx.elements) {
      const role = element.getAttribute("role");
      if (!role) continue;
      const parents = REQUIRED_PARENT[role];
      if (!parents) continue;
      // Walk up past generic wrappers, like the accessibility tree does.
      let ancestor = element.parentElement;
      let found = false;
      for (let i = 0; ancestor && i < 6; i += 1, ancestor = ancestor.parentElement) {
        const ancestorRole = ancestor.getAttribute("role") ?? implicitRole(ancestor);
        if (ancestorRole && parents.includes(ancestorRole)) { found = true; break; }
        if (ancestorRole && !["generic", "none", "presentation"].includes(ancestorRole) && ancestor.tagName !== "DIV" && ancestor.tagName !== "SPAN") break;
      }
      if (found) continue;
      ctx.push({
        rule: "aria-required-parent",
        impact: "serious",
        message: `${describe(element)} has role="${role}" outside a ${parents.join(" / ")}.`,
        help: `A ${role} only means something inside its container — without it, arrow-key navigation and "1 of N" announcements break.`,
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role");
      if (role !== "presentation" && role !== "none") continue;
      const focusable = element.matches(FOCUSABLE_SELECTOR) && element.getAttribute("tabindex") !== "-1" && !(element as HTMLButtonElement).disabled;
      const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
      if (!focusable && !named) continue;
      ctx.push({
        rule: "presentation-role-conflict",
        impact: "serious",
        message: `${describe(element)} is role="${role}" but is ${focusable ? "focusable" : "named"}.`,
        help: "A presentational element is removed from the accessibility tree; if it is focusable or labelled, the role is ignored and users land on an unexplained stop.",
        element,
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute("role");
      if (tag === "svg" && role === "img") {
        const titled = element.querySelector("title")?.textContent?.trim();
        if (titled || element.getAttribute("aria-label")?.trim() || element.hasAttribute("aria-labelledby")) continue;
        ctx.push({
          rule: "svg-img-alt",
          impact: "serious",
          message: "An <svg role=\"img\"> has no name.",
          help: "Give the icon an aria-label, or mark it decorative with aria-hidden=\"true\" if a visible label is next to it.",
          element,
        });
      } else if (tag !== "svg" && tag !== "img" && role === "img" && accessibleName(element) === "") {
        ctx.push({
          rule: "role-img-alt",
          impact: "serious",
          message: `${describe(element)} has role="img" and no name.`,
          help: "Add aria-label describing the image.",
          element,
        });
      }
      if (tag === "iframe" && !element.getAttribute("title")?.trim() && !element.getAttribute("aria-label")?.trim()) {
        ctx.push({
          rule: "iframe-title",
          impact: "serious",
          message: "An <iframe> has no title.",
          help: "Screen readers announce frames by title — add one that says what the frame contains.",
          element,
        });
      }
      if (tag === "summary" && (element.textContent ?? "").trim() === "" && !element.getAttribute("aria-label")) {
        ctx.push({
          rule: "summary-name",
          impact: "serious",
          message: "A <summary> has no text.",
          help: "The summary is the disclosure's button; give it a label.",
          element,
        });
      }
      if (tag === "video" && !element.querySelector('track[kind="captions"], track[kind="subtitles"]') && !element.hasAttribute("muted")) {
        ctx.push({
          rule: "video-caption",
          impact: "critical",
          message: "A <video> has no captions track.",
          help: "Add <track kind=\"captions\" srclang=\"en\" src=\"…\"> so deaf and hard-of-hearing users get the audio.",
          element,
        });
      }
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      const labels = element.labels;
      if ((labels && labels.length > 0) || element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") || element.getAttribute("placeholder")) continue;
      if (!element.getAttribute("title")) continue;
      ctx.push({
        rule: "label-title-only",
        impact: "moderate",
        message: `${describe(element)} is labelled only by its title attribute.`,
        help: "Tooltips are not shown on touch or to keyboard users. Add `label:` to the field.",
        element,
      });
    }
  },
  (ctx) => {
    const TOKENS = new Set([
      "on", "off", "name", "honorific-prefix", "given-name", "additional-name", "family-name", "honorific-suffix", "nickname",
      "email", "username", "new-password", "current-password", "one-time-code", "organization-title", "organization",
      "street-address", "address-line1", "address-line2", "address-line3", "address-level4", "address-level3",
      "address-level2", "address-level1", "country", "country-name", "postal-code", "cc-name", "cc-given-name",
      "cc-additional-name", "cc-family-name", "cc-number", "cc-exp", "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type",
      "transaction-currency", "transaction-amount", "language", "bday", "bday-day", "bday-month", "bday-year", "sex",
      "tel", "tel-country-code", "tel-national", "tel-area-code", "tel-local", "tel-extension", "impp", "url", "photo",
      "webauthn", "shipping", "billing", "home", "work", "mobile", "fax", "pager",
    ]);
    for (const element of ctx.elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      const value = element.getAttribute("autocomplete");
      if (!value) continue;
      const bad = value.trim().toLowerCase().split(/\s+/).filter((token) => token && !TOKENS.has(token) && !token.startsWith("section-"));
      if (bad.length === 0) continue;
      ctx.push({
        rule: "autocomplete-valid",
        impact: "moderate",
        message: `${describe(element)} has autocomplete="${value}".`,
        help: `"${bad.join(" ")}" is not an autocomplete token, so browsers and assistive tech cannot fill or identify the field.`,
        element,
      });
    }
  },
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    for (const element of ctx.elements) {
      let style: CSSStyleDeclaration;
      try { style = getComputedStyle(element); } catch { continue; }
      const overflowY = style.overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      const el = element as HTMLElement;
      if (!(el.scrollHeight > el.clientHeight + 4) || el.clientHeight === 0) continue;
      if (el.tabIndex >= 0 && el.hasAttribute("tabindex")) continue;
      let hasFocusable = false;
      try { hasFocusable = el.querySelector(FOCUSABLE_SELECTOR) !== null; } catch { hasFocusable = false; }
      if (hasFocusable) continue;
      ctx.push({
        rule: "scrollable-region-focusable",
        impact: "moderate",
        message: `${describe(element)} scrolls but cannot be reached with the keyboard.`,
        help: "Keyboard users scroll with arrow keys on a focused element. Add tabindex=\"0\" and an accessible name (role=\"region\" + aria-label).",
        element,
      });
    }
  },
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    let reported = 0;
    for (const element of ctx.elements) {
      if (reported >= 10) return;
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      if (element instanceof HTMLInputElement && ["hidden", "checkbox", "radio", "range", "color", "file", "submit", "button", "reset", "image"].includes(element.type)) continue;
      let style: CSSStyleDeclaration;
      try { style = getComputedStyle(element); } catch { continue; }
      const width = Number.parseFloat(style.borderBottomWidth);
      if (!(width > 0)) continue;
      const border = parseColor(style.borderBottomColor);
      const fieldBg = parseColor(style.backgroundColor);
      const parent = element.parentElement;
      const outside = parent ? effectiveBackground(parent) : null;
      if (!border || !outside || border.a === 0) continue;
      // The border only matters as a boundary when the field's fill does not
      // already separate it from its surroundings.
      const fillSeparates = fieldBg && fieldBg.a > 0.5 && contrastRatio(over(fieldBg, outside), outside) >= 3;
      if (fillSeparates) continue;
      const ratio = contrastRatio(over(border, outside), outside);
      if (ratio >= 3) continue;
      reported += 1;
      ctx.push({
        rule: "non-text-contrast",
        impact: "moderate",
        message: `${describe(element)}'s border has ${ratio.toFixed(2)}:1 contrast against its background (needs 3:1).`,
        help: "Low-vision users find fields by their outline. Raise the theme's `colorBorderControl` token.",
        element,
        detail: `${ratio.toFixed(2)}:1 vs 3:1`,
      });
    }
  },
  (ctx) => {
    const root = ctx.root;
    const headings = ctx.elements.filter((el) => /^H[1-6]$/.test(el.tagName)).length;
    if (headings < 3 && ctx.elements.length < 150) return;
    const hasMain = ctx.elements.some((el) => el.tagName === "MAIN" || el.getAttribute("role") === "main");
    if (hasMain) return;
    // The host page may provide the landmark around the app.
    let node: Node | null = root;
    for (let i = 0; node && i < 40; i += 1) {
      if (node instanceof Element && (node.tagName === "MAIN" || node.getAttribute("role") === "main")) return;
      node = node.parentNode ?? (node as ShadowRoot).host ?? null;
    }
    ctx.push({
      rule: "landmark-main",
      impact: "minor",
      message: "The app has no main landmark (and is not inside one).",
      help: "Screen-reader users jump to \"main\" to skip navigation. Wrap the primary content in a Main / role=\"main\" region.",
      element: root,
    });
  },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** True when the element has text of its own (not just inside children). */
function hasOwnText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") return true;
  }
  return false;
}

/** Short label for a finding message. */
function describe(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const label = text(element);
  const bits = [`<${tag}${role ? ` role="${role}"` : ""}>`];
  if (label) bits.push(`"${label}"`);
  return bits.join(" ");
}

/** First 40 characters of an element's text. */
function text(element: Element): string {
  const raw = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
}

/** Tail of an image's src, for the alt-text finding. */
function shortSrc(element: Element): string {
  const src = element.getAttribute("src") ?? "";
  const parts = src.split("/");
  return parts[parts.length - 1] || "no src";
}

/** Group findings by rule, for the summary table. */
export function groupFindings(findings: ReadonlyArray<A11yFinding>): Array<{
  rule: string;
  impact: A11yImpact;
  count: number;
  first: A11yFinding;
}> {
  const groups = new Map<string, { rule: string; impact: A11yImpact; count: number; first: A11yFinding }>();
  for (const finding of findings) {
    const existing = groups.get(finding.rule);
    if (existing) existing.count += 1;
    else groups.set(finding.rule, { rule: finding.rule, impact: finding.impact, count: 1, first: finding });
  }
  return [...groups.values()].sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
}

/* -------------------------------------------------------------------------- */
/*  Structure: tab order, landmarks, headings, the accessibility tree          */
/* -------------------------------------------------------------------------- */

function isHiddenFromAll(element: Element): boolean {
  if ((element as HTMLElement).hidden) return true;
  if (element.closest("[inert]")) return true;
  if (typeof getComputedStyle !== "function") return false;
  try {
    const style = getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  } catch {
    return false;
  }
}

/**
 * Sequential keyboard focus order, the way Tab walks it: positive tabindex
 * first (ascending, then document order), then everything else focusable in
 * document order. Disabled, hidden, inert, and tabindex=-1 elements are
 * skipped.
 */
export function tabOrder(root: Element | null, limit = 400): Element[] {
  if (!root) return [];
  let candidates: Element[] = [];
  try {
    candidates = [...root.querySelectorAll(FOCUSABLE_SELECTOR)];
  } catch {
    return [];
  }
  const positive: Array<{ element: Element; index: number; tab: number }> = [];
  const natural: Element[] = [];
  candidates.forEach((element, index) => {
    const raw = element.getAttribute("tabindex");
    const tab = raw === null ? 0 : Number(raw);
    if (!Number.isFinite(tab) || tab < 0) return;
    if ((element as HTMLButtonElement).disabled) return;
    if (element instanceof HTMLInputElement && element.type === "hidden") return;
    if (element.tagName === "A" && !element.hasAttribute("href") && raw === null) return;
    if (isHiddenFromAll(element)) return;
    if (tab > 0) positive.push({ element, index, tab });
    else natural.push(element);
  });
  positive.sort((a, b) => a.tab - b.tab || a.index - b.index);
  return [...positive.map((p) => p.element), ...natural].slice(0, limit);
}

const LANDMARK_ROLES = new Set(["banner", "navigation", "main", "complementary", "contentinfo", "region", "search", "form"]);

export interface Landmark {
  element: Element;
  role: string;
  label: string;
}

export function landmarks(root: Element | null): Landmark[] {
  if (!root) return [];
  const out: Landmark[] = [];
  let all: Element[] = [];
  try {
    all = [root, ...root.querySelectorAll("*")];
  } catch {
    return [];
  }
  for (const element of all) {
    let role = element.getAttribute("role") ?? implicitRole(element);
    const tag = element.tagName;
    if (!role && tag === "SECTION" && (element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby"))) role = "region";
    if (!role || !LANDMARK_ROLES.has(role)) continue;
    if ((role === "region" || role === "form") && !element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby")) continue;
    const name = element.getAttribute("aria-label") ?? (element.hasAttribute("aria-labelledby") ? accessibleName(element) : "");
    out.push({ element, role, label: name ? `${role} “${name}”` : role });
  }
  return out;
}

export interface HeadingEntry {
  element: Element;
  level: number;
  text: string;
  /** Skipped a level relative to the previous heading. */
  skipped: boolean;
}

export function headingOutline(root: Element | null): HeadingEntry[] {
  if (!root) return [];
  const out: HeadingEntry[] = [];
  let previous = 0;
  let nodes: Element[] = [];
  try {
    nodes = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')];
  } catch {
    return [];
  }
  for (const element of nodes) {
    const level = /^H[1-6]$/.test(element.tagName) ? Number(element.tagName[1]) : Number(element.getAttribute("aria-level") ?? 2) || 2;
    out.push({ element, level, text: accessibleName(element), skipped: previous !== 0 && level > previous + 1 });
    previous = level;
  }
  return out;
}

export interface AxNode {
  id: string;
  role: string;
  name: string;
  element: Element;
  states: string[];
  focusable: boolean;
  children: AxNode[];
}

const STATE_ATTRS: ReadonlyArray<[string, (v: string) => string | null]> = [
  ["aria-expanded", (v) => (v === "true" ? "expanded" : v === "false" ? "collapsed" : null)],
  ["aria-checked", (v) => (v === "true" ? "checked" : v === "mixed" ? "mixed" : v === "false" ? "not checked" : null)],
  ["aria-pressed", (v) => (v === "true" ? "pressed" : v === "false" ? "not pressed" : null)],
  ["aria-selected", (v) => (v === "true" ? "selected" : null)],
  ["aria-disabled", (v) => (v === "true" ? "disabled" : null)],
  ["aria-required", (v) => (v === "true" ? "required" : null)],
  ["aria-invalid", (v) => (v && v !== "false" ? "invalid entry" : null)],
  ["aria-current", (v) => (v && v !== "false" ? "current" : null)],
];

/** Roles a screen reader reads out, spelled the way VoiceOver/NVDA say them. */
const SPOKEN_ROLE: Record<string, string> = {
  textbox: "edit text",
  searchbox: "search text field",
  combobox: "combo box",
  listbox: "list box",
  checkbox: "checkbox",
  radio: "radio button",
  switch: "switch",
  link: "link",
  button: "button",
  heading: "heading",
  img: "image",
  slider: "slider",
  spinbutton: "stepper",
  tab: "tab",
  tablist: "tab list",
  tabpanel: "tab panel",
  dialog: "dialog",
  alertdialog: "alert dialog",
  navigation: "navigation",
  main: "main",
  banner: "banner",
  contentinfo: "content information",
  complementary: "complementary",
  region: "region",
  list: "list",
  listitem: "list item",
  menu: "menu",
  menuitem: "menu item",
  progressbar: "progress indicator",
  table: "table",
  row: "row",
  cell: "cell",
  columnheader: "column header",
  option: "option",
  tree: "tree",
  treeitem: "tree item",
  alert: "alert",
  status: "status",
};

function statesOf(element: Element): string[] {
  const out: string[] = [];
  for (const [attr, read] of STATE_ATTRS) {
    const value = element.getAttribute(attr);
    if (value === null) continue;
    const spoken = read(value);
    if (spoken) out.push(spoken);
  }
  if ((element as HTMLButtonElement).disabled && !out.includes("disabled")) out.push("disabled");
  if (element instanceof HTMLInputElement) {
    if ((element.type === "checkbox" || element.type === "radio") && !element.hasAttribute("aria-checked")) out.push(element.checked ? "checked" : "not checked");
    if (element.required && !out.includes("required")) out.push("required");
  }
  if (/^H[1-6]$/.test(element.tagName)) out.unshift(`level ${element.tagName[1]}`);
  return out;
}

/**
 * The accessibility tree as assistive tech sees it: elements with a role or a
 * name become nodes; generic wrappers are flattened away; aria-hidden and
 * display:none subtrees are removed.
 */
export function accessibilityTree(root: Element | null, limit = 3000): AxNode[] {
  if (!root) return [];
  let count = 0;
  let seq = 0;
  const visit = (element: Element): AxNode[] => {
    if (count >= limit) return [];
    if (element.getAttribute("aria-hidden") === "true" || isHiddenFromAll(element)) return [];
    const tag = element.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") return [];
    const explicit = element.getAttribute("role");
    const role = explicit === "none" || explicit === "presentation" ? null : explicit ?? implicitRole(element);
    const children: AxNode[] = [];
    for (const child of element.children) children.push(...visit(child));
    const hasOwnText = [...element.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
    const focusable = element.matches(FOCUSABLE_SELECTOR) && element.getAttribute("tabindex") !== "-1" && !(element as HTMLButtonElement).disabled;
    if (!role && !hasOwnText && !focusable) return children;
    count += 1;
    const effectiveRole = role ?? (hasOwnText ? "text" : "generic");
    return [{
      id: `ax${(seq += 1)}`,
      role: effectiveRole,
      name: effectiveRole === "text" ? ((element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120)) : accessibleName(element),
      element,
      states: statesOf(element),
      focusable,
      children: effectiveRole === "text" ? [] : children,
    }];
  };
  return visit(root);
}

/** What a screen reader would announce on focusing `element`: `"Save", button, disabled`. */
export function announce(element: Element): string {
  const role = element.getAttribute("role") ?? implicitRole(element) ?? "";
  const name = accessibleName(element);
  const spoken = SPOKEN_ROLE[role] ?? role;
  const parts = [name ? `“${name}”` : "(unnamed)", spoken, ...statesOf(element)].filter(Boolean);
  const description = element.getAttribute("aria-describedby");
  if (description) {
    const rootNode = element.getRootNode() as Document | ShadowRoot;
    const text = description.split(/\s+/).map((id) => {
      try { return (rootNode as Document).getElementById?.(id)?.textContent?.trim() ?? ""; } catch { return ""; }
    }).filter(Boolean).join(" ");
    if (text) parts.push(text);
  }
  return parts.join(", ");
}
