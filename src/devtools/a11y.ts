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
}

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

  findings.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
  return { findings, examined: elements.length, truncated: all.length > elements.length };
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
