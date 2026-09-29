/**
 * Aktion DevTools — the inspect overlay and element picker.
 *
 * This is the half of "inspect element" that browser DevTools gets for free by
 * living outside the page. An in-page panel has to build it: a highlight that
 * draws the real box model, a picker that can reach *inside* the app's shadow
 * root, and a measurement read that reports what is actually computed rather
 * than what the program asked for.
 *
 * Three details make it work where a naive version fails:
 *
 *   1. **Shadow piercing.** `document.elementFromPoint` stops at the
 *      `<aktion-app>` host, so every hover would resolve to the same element.
 *      The picker descends through `shadowRoot.elementFromPoint` until it
 *      reaches a leaf.
 *   2. **Its own host.** The overlay lives in a separate element with its own
 *      shadow root, not inside the panel — a panel that is collapsed, dragged,
 *      or `overflow: hidden` must not clip or move the highlight.
 *   3. **Pointer transparency.** Every overlay layer is `pointer-events: none`,
 *      so highlighting an element never intercepts the click you are about to
 *      make on it.
 */

/** Box-model measurements of one element, in CSS pixels. */
export interface BoxModel {
  /** Position and size of the border box, in viewport coordinates. */
  rect: { top: number; left: number; width: number; height: number };
  margin: { top: number; right: number; bottom: number; left: number };
  border: { top: number; right: number; bottom: number; left: number };
  padding: { top: number; right: number; bottom: number; left: number };
  /** Content-box size (border box minus border and padding). */
  content: { width: number; height: number };
}

const ZERO_SIDES = { top: 0, right: 0, bottom: 0, left: 0 };

function px(style: CSSStyleDeclaration, prop: string): number {
  const value = Number.parseFloat(style.getPropertyValue(prop));
  return Number.isFinite(value) ? value : 0;
}

function sides(style: CSSStyleDeclaration, prefix: string, suffix = ""): BoxModel["margin"] {
  return {
    top: px(style, `${prefix}-top${suffix}`),
    right: px(style, `${prefix}-right${suffix}`),
    bottom: px(style, `${prefix}-bottom${suffix}`),
    left: px(style, `${prefix}-left${suffix}`),
  };
}

/** Measure an element's box model, or `null` when it has no layout. */
export function measureBox(element: Element): BoxModel | null {
  if (typeof getComputedStyle !== "function" || typeof element.getBoundingClientRect !== "function") return null;
  const rect = element.getBoundingClientRect();
  let style: CSSStyleDeclaration;
  try {
    style = getComputedStyle(element);
  } catch {
    return {
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      margin: { ...ZERO_SIDES },
      border: { ...ZERO_SIDES },
      padding: { ...ZERO_SIDES },
      content: { width: rect.width, height: rect.height },
    };
  }
  const margin = sides(style, "margin");
  const border = sides(style, "border", "-width");
  const padding = sides(style, "padding");
  return {
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    margin,
    border,
    padding,
    content: {
      width: Math.max(0, rect.width - border.left - border.right - padding.left - padding.right),
      height: Math.max(0, rect.height - border.top - border.bottom - padding.top - padding.bottom),
    },
  };
}

/** `div#main.card.is-open` — the selector-ish label DevTools users expect. */
export function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = typeof element.className === "string" && element.className.trim() !== ""
    ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
    : "";
  return `${tag}${id}${classes}`;
}

/**
 * A stable-ish CSS path to an element, for the "copy selector" action.
 *
 * Uses `nth-of-type` rather than `nth-child` so the path survives a sibling
 * text node appearing, and stops at the shadow root because a selector that
 * crosses one is not usable in `querySelector` anyway.
 */
export function cssPath(element: Element, root?: Node | null): string {
  const parts: string[] = [];
  let current: Element | null = element;
  let guard = 0;
  while (current && current !== root && guard++ < 30) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((c) => c.tagName === current!.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

/** Computed-style summary — the properties that explain most layout surprises. */
export const COMPUTED_GROUPS: ReadonlyArray<{ title: string; props: readonly string[] }> = [
  { title: "Layout", props: ["display", "position", "top", "right", "bottom", "left", "z-index", "float", "clear", "overflow", "box-sizing"] },
  { title: "Flex / Grid", props: ["flex-direction", "flex-wrap", "flex", "align-items", "justify-content", "gap", "grid-template-columns", "grid-template-rows", "grid-area"] },
  { title: "Box", props: ["width", "height", "min-width", "min-height", "max-width", "max-height", "margin", "padding", "border", "border-radius"] },
  { title: "Type", props: ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "white-space", "color"] },
  { title: "Paint", props: ["background-color", "background-image", "opacity", "box-shadow", "filter", "mix-blend-mode", "visibility"] },
  { title: "Interaction", props: ["cursor", "pointer-events", "user-select", "touch-action", "transition", "transform", "animation"] },
];

/** Read one group of computed properties, skipping empty / default-ish values. */
export function computedGroup(element: Element, props: readonly string[]): Array<[string, string]> {
  if (typeof getComputedStyle !== "function") return [];
  let style: CSSStyleDeclaration;
  try {
    style = getComputedStyle(element);
  } catch {
    return [];
  }
  const out: Array<[string, string]> = [];
  for (const prop of props) {
    const value = style.getPropertyValue(prop).trim();
    if (value === "" || value === "none" || value === "normal" || value === "auto" || value === "0px") continue;
    out.push([prop, value]);
  }
  return out;
}

/**
 * Every CSS custom property in effect on an element, with its value.
 *
 * Aktion themes ARE custom properties, so "why is this button the wrong
 * colour?" almost always resolves to a `--rui-*` value — which no other view
 * shows. Walks the ancestor chain because inheritance is where they come from.
 */
export function cssVariables(element: Element, prefix = "--rui-"): Array<[string, string]> {
  if (typeof getComputedStyle !== "function") return [];
  const seen = new Map<string, string>();
  let current: Element | null = element;
  let guard = 0;
  while (current && guard++ < 40) {
    let style: CSSStyleDeclaration | null = null;
    try { style = getComputedStyle(current); } catch { style = null; }
    if (style) {
      // `CSSStyleDeclaration` only enumerates custom properties set on THIS
      // element, which is exactly what we want per hop — inherited ones show up
      // when we reach the ancestor that declared them.
      for (let i = 0; i < style.length; i += 1) {
        const name = style.item(i);
        if (!name.startsWith(prefix)) continue;
        if (!seen.has(name)) seen.set(name, style.getPropertyValue(name).trim());
      }
    }
    const parent: Element | null = current.parentElement;
    current = parent ?? ((current.getRootNode() as ShadowRoot).host ?? null);
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Accessibility summary for one element: the role and name a screen reader
 * would announce, plus the attributes that decide them.
 */
export function a11ySummary(element: Element): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const role = element.getAttribute("role") ?? implicitRole(element);
  if (role) out.push(["role", role]);
  const name = accessibleName(element);
  if (name) out.push(["name", name]);
  for (const attr of ["aria-label", "aria-labelledby", "aria-describedby", "aria-expanded", "aria-selected", "aria-checked", "aria-disabled", "aria-hidden", "aria-live", "aria-current", "tabindex", "title", "alt", "for", "id"]) {
    const value = element.getAttribute(attr);
    if (value !== null) out.push([attr, value]);
  }
  if (element instanceof HTMLElement && element.tagName === "INPUT") {
    const input = element as HTMLInputElement;
    out.push(["type", input.type]);
    if (input.required) out.push(["required", "true"]);
    if (input.disabled) out.push(["disabled", "true"]);
  }
  return out;
}

/** Implicit ARIA role for the handful of elements that carry one. */
export function implicitRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "a": return element.hasAttribute("href") ? "link" : null;
    case "button": return "button";
    case "input": {
      const type = (element as HTMLInputElement).type;
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "search") return "searchbox";
      if (type === "submit" || type === "button" || type === "reset") return "button";
      return "textbox";
    }
    case "select": return (element as HTMLSelectElement).multiple ? "listbox" : "combobox";
    case "textarea": return "textbox";
    case "img": return element.getAttribute("alt") === "" ? "presentation" : "img";
    case "nav": return "navigation";
    case "main": return "main";
    case "header": return "banner";
    case "footer": return "contentinfo";
    case "aside": return "complementary";
    case "form": return "form";
    case "table": return "table";
    case "ul":
    case "ol": return "list";
    case "li": return "listitem";
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": return "heading";
    case "dialog": return "dialog";
    case "progress": return "progressbar";
    default: return null;
  }
}

/**
 * Best-effort accessible name, following the practical part of the accname
 * algorithm: `aria-labelledby`, `aria-label`, a native label, `alt`, `title`,
 * then text content.
 */
export function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const root = element.getRootNode() as Document | ShadowRoot;
    const parts = labelledBy.split(/\s+/)
      .map((id) => {
        try { return (root as Document).getElementById?.(id)?.textContent ?? ""; }
        catch { return ""; }
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" ").trim();
  }
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const labels = (element as HTMLInputElement).labels;
    if (labels && labels.length > 0) {
      const text = [...labels].map((l) => l.textContent ?? "").join(" ").trim();
      if (text) return text;
    }
    if (element instanceof HTMLInputElement && element.placeholder) return element.placeholder;
  }
  const alt = element.getAttribute("alt");
  if (alt?.trim()) return alt.trim();
  const title = element.getAttribute("title");
  if (title?.trim()) return title.trim();
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * Resolve the deepest element at a viewport point, descending through shadow
 * roots. Without this the picker can only ever select the `<aktion-app>` host.
 */
export function deepElementFromPoint(x: number, y: number): Element | null {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return null;
  let element = document.elementFromPoint(x, y);
  let guard = 0;
  while (element && guard++ < 20) {
    const shadow = (element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (!shadow || typeof shadow.elementFromPoint !== "function") break;
    const inner = shadow.elementFromPoint(x, y);
    if (!inner || inner === element) break;
    element = inner;
  }
  return element;
}


/* -------------------------------------------------------------------------- */
/*  The overlay                                                                */
/* -------------------------------------------------------------------------- */

const OVERLAY_TAG = "aktion-devtools-overlay";

const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147482000;
  font: 500 11px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
}
.layer { position: fixed; pointer-events: none; box-sizing: border-box; transition: none; }
.margin { background: rgba(255, 155, 90, 0.22); }
.border { background: rgba(255, 206, 102, 0.30); }
.padding { background: rgba(92, 206, 148, 0.26); }
.content { background: rgba(98, 160, 255, 0.30); }
.frame { position: fixed; pointer-events: none; box-sizing: border-box; border: 1.5px solid #8b7bff; border-radius: 2px; box-shadow: 0 0 0 1px rgba(139, 123, 255, 0.25), 0 0 18px rgba(139, 123, 255, 0.25); }
.frame.is-pinned { border-style: solid; border-color: #a99dff; }
.tip {
  position: fixed; pointer-events: none;
  max-width: 380px; padding: 8px 10px 8px; border-radius: 10px;
  background: rgba(16, 18, 26, 0.94); color: #e9ebf2;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.6);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  white-space: nowrap;
}
.tip-row { display: flex; align-items: center; gap: 8px; overflow: hidden; }
.tip-row + .tip-row { margin-top: 3px; }
.tip .name { color: #b6adff; font-weight: 700; font-size: 12px; }
.tip .el { color: #e3b3ff; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; }
.tip .dim { color: #9aa2b6; font-variant-numeric: tabular-nums; }
.tip .chip { padding: 1px 6px; border-radius: 5px; font-size: 9.5px; font-weight: 700; background: rgba(139, 123, 255, 0.2); color: #c8c1ff; }
.tip .chip.lib { background: rgba(154, 162, 182, 0.18); color: #c5cad6; }
.tip .chip.bad { background: rgba(255, 107, 118, 0.2); color: #ff9aa2; }
.tip .chip.good { background: rgba(61, 220, 151, 0.18); color: #7ff0bd; }
.tip .a11y { color: #c5cad6; overflow: hidden; text-overflow: ellipsis; }
.tip .a11y b { color: #7fd8ff; font-weight: 650; }
.crosshair { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: transparent; }
.hint {
  position: fixed; left: 50%; top: 14px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px 7px 10px; border-radius: 999px;
  background: rgba(16, 18, 26, 0.92); color: #e9ebf2;
  border: 1px solid rgba(139, 123, 255, 0.45);
  box-shadow: 0 12px 30px -8px rgba(0, 0, 0, 0.55), 0 0 0 4px rgba(139, 123, 255, 0.14);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  font-weight: 600; font-size: 12px; pointer-events: none;
  animation: hint-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.hint .dot { width: 8px; height: 8px; border-radius: 50%; background: #8b7bff; box-shadow: 0 0 0 4px rgba(139, 123, 255, 0.25); animation: pulse 1.4s ease-in-out infinite; }
.hint kbd { font: 700 10px/1 inherit; padding: 2px 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.16); }
.hint .sub { color: #9aa2b6; font-weight: 500; }
@keyframes hint-in { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.scan { position: fixed; inset: 0; pointer-events: none; }
.marker {
  position: fixed; pointer-events: none; box-sizing: border-box;
  border: 2px solid var(--c); border-radius: 4px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent);
}
.marker-badge {
  position: fixed; pointer-events: none;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  background: var(--c); color: #fff; font-size: 10px; font-weight: 800;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 0 2px rgba(255, 255, 255, 0.9);
  font-variant-numeric: tabular-nums;
}
.tabpath { position: fixed; inset: 0; pointer-events: none; overflow: visible; }
.landmark {
  position: fixed; pointer-events: none; box-sizing: border-box;
  border: 2px dashed var(--c); border-radius: 6px; background: color-mix(in srgb, var(--c) 7%, transparent);
}
.landmark-label {
  position: fixed; pointer-events: none; padding: 2px 7px; border-radius: 0 0 6px 0;
  background: var(--c); color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.02em;
}
.testid {
  position: fixed; pointer-events: none; padding: 1px 6px; border-radius: 5px;
  background: rgba(14, 165, 233, 0.92); color: #fff;
  font: 700 10px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.update-flash {
  position: fixed; pointer-events: none; border: 1px solid rgba(90, 209, 155, 0.9); border-radius: 2px;
  animation: dt-update-fade 320ms ease-out forwards;
}
@keyframes dt-update-fade { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .hint, .hint .dot { animation: none; } }
`;

/** Tag names that belong to DevTools itself and must never be inspected. */
const CHROME_TAGS = new Set([OVERLAY_TAG, "aktion-devtools"]);

/**
 * True when `element` is part of the DevTools UI (the panel or the overlay),
 * including anything inside their shadow roots. Walks parents AND shadow hosts:
 * a hover over the panel resolves to a plain `div` several shadow boundaries
 * deep, and a picker that only checked the returned element's tag would let you
 * inspect the inspector.
 */
export function isPanelChrome(element: Element | null): boolean {
  let current: Node | null = element;
  let guard = 0;
  while (current && guard++ < 60) {
    if (current instanceof Element && CHROME_TAGS.has(current.tagName.toLowerCase())) return true;
    const parent: Node | null = current.parentNode;
    current = parent ?? (current as { host?: Node }).host ?? null;
  }
  return false;
}

/** What the overlay draws around a hovered / selected element. */
export interface HighlightLabel {
  /** Component name, when the node maps to one. */
  component?: string;
  /** `user` / `library`, shown as a badge. */
  kind?: string;
}

/** One element to outline in the render-scan layer. */
/** The visible page area in viewport pixels. */
export interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ScanEntry {
  element: Element;
  name: string;
  /** Renders so far this session — drives the heat colour. */
  count: number;
  /** Rendered although nothing it reads changed (a forced full render). */
  wasted?: boolean;
}

export interface OverlayMarker {
  element: Element;
  label: string;
  tone: "red" | "amber" | "blue" | "grey" | "purple" | "green";
}

const TONE: Record<OverlayMarker["tone"], string> = {
  red: "#ff5d6c",
  amber: "#f2a93b",
  blue: "#4f8cff",
  grey: "#8a93a7",
  purple: "#9b6bff",
  green: "#22c55e",
};

const LANDMARK_TONES = ["#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#6366f1"];

/** Heat for a render count: green (1) → amber (~6) → red (15+). */
function scanColor(count: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (count - 1) / 14));
  const stops: Array<[number, number, number]> = [[61, 220, 151], [247, 185, 85], [255, 107, 118]];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

const raf: (fn: (t: number) => void) => number =
  typeof requestAnimationFrame === "function"
    ? (fn) => requestAnimationFrame(fn)
    : (fn) => setTimeout(() => fn(Date.now()), 16) as unknown as number;

interface ScanFlash {
  rect: DOMRect;
  name: string;
  count: number;
  wasted: boolean;
  born: number;
}

/**
 * The highlight + picker surface, and every on-page layer the panel draws.
 *
 * One instance is shared by every view (the panel creates it and hands it down
 * through the view context), so a hover in the component tree and a hover in
 * the accessibility audit draw the same rectangles.
 */
export class InspectOverlay {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private readonly layers = new Map<string, HTMLElement>();
  private frame: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private crosshair: HTMLElement | null = null;
  private hint: HTMLElement | null = null;

  /** Element currently drawn, so scroll / resize can re-measure it. */
  private tracked: Element | null = null;
  private trackedLabel: HighlightLabel = {};
  private trackedPinned = false;
  /**
   * The SELECTED element, kept separately from the hovered one: hovering a
   * second row must not overwrite the pin, and leaving the hover must return to
   * the selection rather than leaving the hovered element highlighted.
   */
  private pinnedElement: Element | null = null;
  private pinnedLabel: HighlightLabel = {};
  private reflowBound: (() => void) | null = null;
  private reflowPending = false;

  /* ---- highlight-updates (the first-generation flash) ---- */
  private updateFlashes: HTMLElement[] = [];
  private updateFlashTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---- render scan ---- */
  private scanCanvas: HTMLCanvasElement | null = null;
  private scanFlashes: ScanFlash[] = [];
  private scanAnimating = false;

  /* ---- persistent layers ---- */
  private markerNodes: HTMLElement[] = [];
  private markers: OverlayMarker[] = [];
  private tabOrder: Element[] | null = null;
  private tabNodes: HTMLElement[] = [];
  private tabSvg: SVGSVGElement | null = null;
  private landmarks: Array<{ element: Element; label: string }> | null = null;
  private landmarkNodes: HTMLElement[] = [];
  private badges: Array<{ element: Element; text: string }> | null = null;
  private badgeNodes: HTMLElement[] = [];

  /* ---- picking ---- */
  private picking = false;
  private onPick: ((element: Element) => void) | null = null;
  private onHover: ((element: Element) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private labelFor: ((element: Element) => HighlightLabel) | null = null;
  private boundsFn: (() => ViewportBounds) | null = null;
  private moveHandler: ((e: MouseEvent) => void) | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  private pickTargetEl: Element | null = null;
  /** Ancestor steps taken with Alt+wheel / ↑ while picking. */
  private pickDepth = 0;
  private pickBase: Element | null = null;

  /** True while the element picker is armed. */
  get isPicking(): boolean {
    return this.picking;
  }

  private ensureHost(): ShadowRoot | null {
    if (this.root) return this.root;
    if (typeof document === "undefined" || typeof document.createElement !== "function" || !document.body) return null;
    const host = document.createElement(OVERLAY_TAG);
    host.setAttribute("aria-hidden", "true");
    let root: ShadowRoot;
    try {
      root = host.attachShadow({ mode: "open" });
    } catch {
      return null;
    }
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;
    root.appendChild(style);
    for (const name of ["margin", "border", "padding", "content"]) {
      const layer = document.createElement("div");
      layer.className = `layer ${name}`;
      layer.style.display = "none";
      root.appendChild(layer);
      this.layers.set(name, layer);
    }
    this.frame = document.createElement("div");
    this.frame.className = "frame";
    this.frame.style.display = "none";
    root.appendChild(this.frame);
    this.tip = document.createElement("div");
    this.tip.className = "tip";
    this.tip.style.display = "none";
    root.appendChild(this.tip);
    document.body.appendChild(host);
    this.host = host;
    this.root = root;
    return root;
  }

  /**
   * Draw the box model around `element`.
   *
   * `pin` marks the highlight as a selection rather than a hover: a pinned
   * highlight survives `hideHover()` and follows the element through scrolling.
   */
  highlight(element: Element | null, label: HighlightLabel = {}, pin = false): void {
    if (pin) {
      this.pinnedElement = element && element.isConnected ? element : null;
      this.pinnedLabel = label;
    }
    if (!element || !element.isConnected) {
      if (this.pinnedElement) this.drawTarget(this.pinnedElement, this.pinnedLabel, true);
      else this.clear();
      return;
    }
    if (!this.ensureHost()) return;
    this.drawTarget(element, label, pin || element === this.pinnedElement);
  }

  /** Remove a transient hover highlight, restoring the selection if there is one. */
  hideHover(): void {
    if (this.pinnedElement?.isConnected) {
      this.drawTarget(this.pinnedElement, this.pinnedLabel, true);
      return;
    }
    this.clearBox();
  }

  /**
   * Briefly outline every element that just re-rendered — the first-generation
   * "highlight updates", kept for callers of that API. The panel itself uses the
   * richer {@link scanRender}.
   */
  flashUpdated(elements: ReadonlyArray<Element>): void {
    const root = this.ensureHost();
    if (!root) return;
    for (const stale of this.updateFlashes) stale.remove();
    this.updateFlashes = [];
    if (this.updateFlashTimer !== null) clearTimeout(this.updateFlashTimer);
    for (const element of elements) {
      if (!element.isConnected) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const box = document.createElement("div");
      box.className = "update-flash";
      box.style.top = `${rect.top}px`;
      box.style.left = `${rect.left}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      root.appendChild(box);
      this.updateFlashes.push(box);
    }
    if (this.updateFlashes.length === 0) return;
    this.updateFlashTimer = setTimeout(() => {
      for (const box of this.updateFlashes) box.remove();
      this.updateFlashes = [];
      this.updateFlashTimer = null;
    }, 320);
  }

  /** Remove any update flashes and render-scan outlines without touching the highlight. */
  clearUpdateFlashes(): void {
    if (this.updateFlashTimer !== null) clearTimeout(this.updateFlashTimer);
    this.updateFlashTimer = null;
    for (const box of this.updateFlashes) box.remove();
    this.updateFlashes = [];
    this.scanFlashes = [];
    this.paintScan();
  }

  /**
   * Render scan: outline what re-rendered in this commit, labelled with a
   * running render count and coloured by it (green → amber → red), fading out
   * over a second. Drawn on one canvas, so a 200-component commit costs one
   * draw per frame instead of 200 DOM nodes.
   */
  scanRender(entries: ReadonlyArray<ScanEntry>): void {
    const root = this.ensureHost();
    if (!root || entries.length === 0) return;
    if (!this.scanCanvas) {
      this.scanCanvas = document.createElement("canvas");
      this.scanCanvas.className = "scan";
      root.insertBefore(this.scanCanvas, root.firstChild?.nextSibling ?? null);
    }
    const now = performance.now();
    for (const entry of entries) {
      if (!entry.element.isConnected) continue;
      const rect = entry.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      // A newer flash of the same box replaces the older one.
      this.scanFlashes = this.scanFlashes.filter((f) => !(f.rect.left === rect.left && f.rect.top === rect.top && f.rect.width === rect.width && f.rect.height === rect.height));
      this.scanFlashes.push({ rect, name: entry.name, count: entry.count, wasted: entry.wasted === true, born: now });
    }
    if (this.scanFlashes.length > 400) this.scanFlashes.splice(0, this.scanFlashes.length - 400);
    if (!this.scanAnimating) {
      this.scanAnimating = true;
      raf(() => this.animateScan());
    }
  }

  private animateScan(): void {
    this.paintScan();
    if (this.scanFlashes.length === 0) {
      this.scanAnimating = false;
      return;
    }
    raf(() => this.animateScan());
  }

  private paintScan(): void {
    const canvas = this.scanCanvas;
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    let g: CanvasRenderingContext2D | null = null;
    try {
      g = canvas.getContext("2d");
    } catch {
      g = null;
    }
    if (!g) {
      this.scanFlashes = [];
      return;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const now = performance.now();
    const LIFE = 1100;
    this.scanFlashes = this.scanFlashes.filter((f) => now - f.born < LIFE);
    g.font = "700 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif";
    g.textBaseline = "middle";
    for (const flash of this.scanFlashes) {
      const age = (now - flash.born) / LIFE;
      const alpha = age < 0.15 ? 1 : 1 - (age - 0.15) / 0.85;
      const [r, gg, b] = flash.wasted ? [187, 143, 255] : scanColor(flash.count);
      const { left, top, width, height } = flash.rect;
      g.strokeStyle = `rgba(${r}, ${gg}, ${b}, ${0.95 * alpha})`;
      g.fillStyle = `rgba(${r}, ${gg}, ${b}, ${0.08 * alpha})`;
      g.lineWidth = 1.5;
      g.fillRect(left, top, width, height);
      g.strokeRect(left + 0.75, top + 0.75, Math.max(0, width - 1.5), Math.max(0, height - 1.5));
      if (width > 40 && height > 14) {
        const label = `${flash.name} ×${flash.count}${flash.wasted ? " · forced" : ""}`;
        const tw = g.measureText(label).width + 10;
        const ly = top >= 16 ? top - 15 : top + 1;
        g.fillStyle = `rgba(${r}, ${gg}, ${b}, ${0.95 * alpha})`;
        g.fillRect(left, ly, Math.min(tw, Math.max(40, width)), 14);
        g.fillStyle = `rgba(12, 14, 20, ${alpha})`;
        g.fillText(label, left + 5, ly + 7, Math.max(30, width - 10));
      }
    }
  }

  /* ---- persistent layers ------------------------------------------------ */

  /** Numbered outlines over elements (audit findings). `[]` clears. */
  setMarkers(markers: ReadonlyArray<OverlayMarker>): void {
    this.markers = [...markers];
    this.drawLayers();
  }

  /** Visualise keyboard focus order: numbered stops joined by a path. `null` clears. */
  setTabOrder(elements: ReadonlyArray<Element> | null): void {
    this.tabOrder = elements ? [...elements] : null;
    this.drawLayers();
  }

  /** Outline landmark regions with their role. `null` clears. */
  setLandmarks(items: ReadonlyArray<{ element: Element; label: string }> | null): void {
    this.landmarks = items ? [...items] : null;
    this.drawLayers();
  }

  /** Small labels pinned to elements (test ids). `null` clears. */
  setBadges(items: ReadonlyArray<{ element: Element; text: string }> | null): void {
    this.badges = items ? [...items] : null;
    this.drawLayers();
  }

  private hasLayers(): boolean {
    return this.markers.length > 0 || this.tabOrder !== null || this.landmarks !== null || this.badges !== null;
  }

  private drawLayers(): void {
    for (const node of [...this.markerNodes, ...this.tabNodes, ...this.landmarkNodes, ...this.badgeNodes]) node.remove();
    this.markerNodes = [];
    this.tabNodes = [];
    this.landmarkNodes = [];
    this.badgeNodes = [];
    this.tabSvg?.remove();
    this.tabSvg = null;
    if (!this.hasLayers()) {
      if (!this.tracked) this.unbindReflow();
      return;
    }
    const root = this.ensureHost();
    if (!root) return;
    this.bindReflow();
    const place = (el: HTMLElement, rect: { left: number; top: number; width?: number; height?: number }): void => {
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      if (rect.width !== undefined) el.style.width = `${rect.width}px`;
      if (rect.height !== undefined) el.style.height = `${rect.height}px`;
    };

    (this.landmarks ?? []).forEach((item, i) => {
      if (!item.element.isConnected) return;
      const rect = item.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const tone = LANDMARK_TONES[i % LANDMARK_TONES.length]!;
      const box = document.createElement("div");
      box.className = "landmark";
      box.style.setProperty("--c", tone);
      place(box, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      const label = document.createElement("div");
      label.className = "landmark-label";
      label.style.setProperty("--c", tone);
      label.textContent = item.label;
      place(label, { left: rect.left, top: rect.top });
      root.append(box, label);
      this.landmarkNodes.push(box, label);
    });

    this.markers.forEach((marker, i) => {
      if (!marker.element.isConnected) return;
      const rect = marker.element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return;
      const color = TONE[marker.tone];
      const box = document.createElement("div");
      box.className = "marker";
      box.style.setProperty("--c", color);
      place(box, { left: rect.left - 2, top: rect.top - 2, width: rect.width + 4, height: rect.height + 4 });
      const badge = document.createElement("div");
      badge.className = "marker-badge";
      badge.style.setProperty("--c", color);
      badge.textContent = marker.label || String(i + 1);
      place(badge, { left: Math.max(2, rect.left - 9), top: Math.max(2, rect.top - 9) });
      root.append(box, badge);
      this.markerNodes.push(box, badge);
    });

    if (this.tabOrder) {
      const points: Array<[number, number]> = [];
      this.tabOrder.forEach((element, i) => {
        if (!element.isConnected) return;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) return;
        const cx = rect.left + Math.min(rect.width / 2, 14);
        const cy = rect.top + Math.min(rect.height / 2, 14);
        points.push([cx, cy]);
        const badge = document.createElement("div");
        badge.className = "marker-badge";
        badge.style.setProperty("--c", "#6d5dfc");
        badge.textContent = String(i + 1);
        place(badge, { left: cx - 9, top: cy - 9 });
        this.tabNodes.push(badge);
      });
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "tabpath");
      svg.setAttribute("width", String(window.innerWidth));
      svg.setAttribute("height", String(window.innerHeight));
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(109, 93, 252, 0.75)");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-dasharray", "5 4");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      root.appendChild(svg);
      this.tabSvg = svg;
      for (const node of this.tabNodes) root.appendChild(node);
    }

    for (const item of this.badges ?? []) {
      if (!item.element.isConnected) continue;
      const rect = item.element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const badge = document.createElement("div");
      badge.className = "testid";
      badge.textContent = item.text;
      place(badge, { left: rect.left, top: Math.max(0, rect.top - 17) });
      root.appendChild(badge);
      this.badgeNodes.push(badge);
    }
  }

  /** Remove every highlight and stop tracking. Persistent layers stay. */
  clear(): void {
    this.tracked = null;
    this.pinnedElement = null;
    this.pinnedLabel = {};
    this.clearBox();
  }

  private clearBox(): void {
    this.tracked = null;
    for (const layer of this.layers.values()) layer.style.display = "none";
    if (this.frame) this.frame.style.display = "none";
    if (this.tip) this.tip.style.display = "none";
    if (!this.hasLayers()) this.unbindReflow();
  }

  /** Drop the selection, so the next `hideHover()` clears the highlight. */
  unpin(): void {
    this.pinnedElement = null;
    this.pinnedLabel = {};
  }

  private drawTarget(element: Element, label: HighlightLabel, pinned: boolean): void {
    if (!this.ensureHost()) return;
    this.tracked = element;
    this.trackedLabel = label;
    this.trackedPinned = pinned;
    this.draw();
    this.bindReflow();
  }

  private draw(): void {
    const element = this.tracked;
    if (!element) return;
    const box = measureBox(element);
    if (!box) return;
    const { rect, margin, border, padding } = box;
    const place = (name: string, top: number, left: number, width: number, height: number): void => {
      const layer = this.layers.get(name);
      if (!layer) return;
      if (width <= 0 || height <= 0) {
        layer.style.display = "none";
        return;
      }
      layer.style.display = "block";
      layer.style.top = `${top}px`;
      layer.style.left = `${left}px`;
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
    };
    place("margin",
      rect.top - margin.top, rect.left - margin.left,
      rect.width + margin.left + margin.right, rect.height + margin.top + margin.bottom);
    place("border", rect.top, rect.left, rect.width, rect.height);
    place("padding",
      rect.top + border.top, rect.left + border.left,
      rect.width - border.left - border.right, rect.height - border.top - border.bottom);
    place("content",
      rect.top + border.top + padding.top, rect.left + border.left + padding.left,
      box.content.width, box.content.height);
    if (this.frame) {
      this.frame.style.display = rect.width > 0 && rect.height > 0 ? "block" : "none";
      this.frame.className = `frame ${this.trackedPinned ? "is-pinned" : ""}`;
      this.frame.style.top = `${rect.top}px`;
      this.frame.style.left = `${rect.left}px`;
      this.frame.style.width = `${rect.width}px`;
      this.frame.style.height = `${rect.height}px`;
    }

    const tip = this.tip;
    if (!tip) return;
    tip.replaceChildren();
    const row = (): HTMLElement => {
      const r = document.createElement("div");
      r.className = "tip-row";
      tip.appendChild(r);
      return r;
    };
    const span = (parent: HTMLElement, cls: string, text: string): HTMLElement => {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text;
      parent.appendChild(s);
      return s;
    };
    const first = row();
    span(first, "name", this.trackedLabel.component ?? describeElement(element));
    if (this.trackedLabel.kind) span(first, `chip ${this.trackedLabel.kind === "library" ? "lib" : ""}`, this.trackedLabel.kind);
    span(first, "dim", `${round(rect.width)} × ${round(rect.height)}`);
    if (this.trackedLabel.component) {
      const second = row();
      span(second, "el", describeElement(element));
    }
    const role = element.getAttribute("role") ?? implicitRole(element);
    // Name only means something for an element with a role; a generic <div>'s
    // "name" is just its concatenated text.
    const name = role ? accessibleName(element) : "";
    if (role) {
      const a11y = row();
      const text = document.createElement("span");
      text.className = "a11y";
      if (role) {
        const b = document.createElement("b");
        b.textContent = role;
        text.appendChild(b);
      }
      if (name) text.appendChild(document.createTextNode(`${role ? " · " : ""}"${name.length > 48 ? `${name.slice(0, 48)}…` : name}"`));
      a11y.appendChild(text);
    }
    const contrast = textContrast(element);
    if (contrast) {
      const c = row();
      span(c, "dim", "Contrast");
      span(c, `chip ${contrast.ok ? "good" : "bad"}`, `${contrast.ratio.toFixed(2)}:1 ${contrast.ok ? "✓" : "✗"}`);
      span(c, "dim", contrast.large ? "large text · needs 3:1" : "needs 4.5:1");
    }
    tip.style.display = "block";
    const tipHeight = tip.offsetHeight || 44;
    const tipWidth = tip.offsetWidth || 220;
    const area = this.bounds();
    const above = rect.top - margin.top - tipHeight - 8;
    const top = above > area.top + 6 ? above : Math.min(area.bottom - tipHeight - 6, rect.top + rect.height + margin.bottom + 8);
    tip.style.top = `${Math.max(area.top + 6, top)}px`;
    tip.style.left = `${Math.max(area.left + 6, Math.min(area.right - tipWidth - 6, rect.left - margin.left))}px`;
  }

  private bindReflow(): void {
    if (this.reflowBound || typeof window === "undefined") return;
    const handler = (): void => {
      if (this.reflowPending) return;
      this.reflowPending = true;
      raf(() => {
        this.reflowPending = false;
        if (this.tracked) {
          if (!this.tracked.isConnected) this.clearBox();
          else this.draw();
        }
        if (this.hasLayers()) this.drawLayers();
      });
    };
    this.reflowBound = handler;
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
  }

  private unbindReflow(): void {
    if (!this.reflowBound || typeof window === "undefined") return;
    window.removeEventListener("scroll", this.reflowBound, true);
    window.removeEventListener("resize", this.reflowBound);
    this.reflowBound = null;
  }

  /** Redraw every persistent layer (after a commit moved things). */
  refreshLayers(): void {
    if (this.hasLayers()) this.drawLayers();
    if (this.tracked?.isConnected) this.draw();
  }

  /* ---- picker ---------------------------------------------------------- */

  /**
   * Arm the element picker. Hovering highlights, clicking selects, Escape
   * cancels; Alt + wheel (or ↑ / ↓) walks to the parent / back down. A
   * full-viewport crosshair layer takes the pointer events so the app under it
   * never sees the picking click — you can safely pick a "Delete" button.
   */
  /**
   * The part of the viewport the page is actually visible in. A docked panel
   * covers one edge, and a tooltip placed under it is a tooltip nobody sees.
   */
  setBounds(fn: (() => ViewportBounds) | null): void {
    this.boundsFn = fn;
  }

  private bounds(): ViewportBounds {
    const fallback = { left: 0, top: 0, right: typeof window !== "undefined" ? window.innerWidth : 1280, bottom: typeof window !== "undefined" ? window.innerHeight : 800 };
    try {
      return this.boundsFn?.() ?? fallback;
    } catch {
      return fallback;
    }
  }

  startPicking(handlers: {
    onPick(element: Element): void;
    onHover?(element: Element): void;
    onCancel?(): void;
    /** Resolve a label (component name + kind) for the hovered element. */
    labelFor?(element: Element): HighlightLabel;
  }): void {
    const root = this.ensureHost();
    if (!root || this.picking) return;
    this.picking = true;
    this.onPick = handlers.onPick;
    this.onHover = handlers.onHover ?? null;
    this.onCancel = handlers.onCancel ?? null;
    this.labelFor = handlers.labelFor ?? null;
    this.pickDepth = 0;
    this.pickBase = null;

    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    root.appendChild(crosshair);
    this.crosshair = crosshair;

    const hint = document.createElement("div");
    hint.className = "hint";
    const dot = document.createElement("span");
    dot.className = "dot";
    const text = document.createElement("span");
    text.textContent = "Click an element to inspect it";
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.append("Esc cancels · ");
    const kbdEl = document.createElement("kbd");
    kbdEl.textContent = "↑";
    sub.append(kbdEl, " parent");
    hint.append(dot, text, sub);
    root.appendChild(hint);
    this.hint = hint;

    const show = (element: Element): void => {
      this.pickTargetEl = element;
      this.highlight(element, this.labelFor?.(element) ?? {}, false);
      this.onHover?.(element);
    };
    this.moveHandler = (event: MouseEvent) => {
      const element = this.pickTarget(event);
      if (!element) {
        this.hideHover();
        return;
      }
      if (element !== this.pickBase) {
        this.pickBase = element;
        this.pickDepth = 0;
      }
      show(this.ancestorAt(element, this.pickDepth));
    };
    this.clickHandler = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const element = this.pickTargetEl ?? this.pickTarget(event);
      if (!element) return;
      const pick = this.onPick;
      this.stopPicking();
      pick?.(element);
    };
    this.wheelHandler = (event: WheelEvent) => {
      if (!event.altKey || !this.pickBase) return;
      event.preventDefault();
      this.pickDepth = Math.max(0, this.pickDepth + (event.deltaY < 0 ? 1 : -1));
      show(this.ancestorAt(this.pickBase, this.pickDepth));
    };
    this.keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const cancel = this.onCancel;
        this.stopPicking();
        cancel?.();
      } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && this.pickBase) {
        event.preventDefault();
        event.stopPropagation();
        this.pickDepth = Math.max(0, this.pickDepth + (event.key === "ArrowUp" ? 1 : -1));
        show(this.ancestorAt(this.pickBase, this.pickDepth));
      } else if (event.key === "Enter" && this.pickTargetEl) {
        event.preventDefault();
        const element = this.pickTargetEl;
        const pick = this.onPick;
        this.stopPicking();
        pick?.(element);
      }
    };
    crosshair.addEventListener("mousemove", this.moveHandler);
    crosshair.addEventListener("click", this.clickHandler);
    crosshair.addEventListener("wheel", this.wheelHandler, { passive: false });
    if (typeof window !== "undefined") window.addEventListener("keydown", this.keyHandler, true);
  }

  /** `depth` steps up from `element`, crossing shadow boundaries, never past the app host. */
  private ancestorAt(element: Element, depth: number): Element {
    let current: Element = element;
    for (let i = 0; i < depth; i += 1) {
      const parent: Element | null = current.parentElement ?? ((current.getRootNode() as ShadowRoot).host ?? null);
      if (!parent || parent === document.body || parent === document.documentElement) {
        this.pickDepth = i;
        break;
      }
      current = parent;
    }
    return current;
  }

  /** Disarm the picker, leaving any pinned highlight in place. */
  stopPicking(): void {
    if (!this.picking) return;
    this.picking = false;
    if (this.crosshair) {
      if (this.moveHandler) this.crosshair.removeEventListener("mousemove", this.moveHandler);
      if (this.clickHandler) this.crosshair.removeEventListener("click", this.clickHandler);
      if (this.wheelHandler) this.crosshair.removeEventListener("wheel", this.wheelHandler);
      this.crosshair.remove();
      this.crosshair = null;
    }
    this.hint?.remove();
    this.hint = null;
    if (this.keyHandler && typeof window !== "undefined") window.removeEventListener("keydown", this.keyHandler, true);
    this.moveHandler = null;
    this.clickHandler = null;
    this.keyHandler = null;
    this.wheelHandler = null;
    this.onPick = null;
    this.onHover = null;
    this.onCancel = null;
    this.labelFor = null;
    this.pickTargetEl = null;
    this.pickBase = null;
    this.hideHover();
  }

  /**
   * Element under a picking event. The crosshair layer is on top, so it is
   * hidden for the hit test instead of reading `event.target` (always itself).
   */
  private pickTarget(event: MouseEvent): Element | null {
    const crosshair = this.crosshair;
    if (crosshair) crosshair.style.display = "none";
    let element: Element | null = null;
    try {
      element = deepElementFromPoint(event.clientX, event.clientY);
    } finally {
      if (crosshair) crosshair.style.display = "";
    }
    return isPanelChrome(element) ? null : element;
  }

  /** Remove the overlay host from the page. */
  destroy(): void {
    this.stopPicking();
    this.clearUpdateFlashes();
    this.clear();
    this.markers = [];
    this.tabOrder = null;
    this.landmarks = null;
    this.badges = null;
    this.drawLayers();
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.layers.clear();
    this.tip = null;
    this.frame = null;
    this.scanCanvas = null;
  }
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Contrast of an element's own text against its effective background, when it has text. */
function textContrast(element: Element): { ratio: number; ok: boolean; large: boolean } | null {
  if (typeof getComputedStyle !== "function") return null;
  let hasText = false;
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") {
      hasText = true;
      break;
    }
  }
  if (!hasText) return null;
  try {
    const style = getComputedStyle(element);
    const fg = parseCssColor(style.color);
    const bg = backgroundBehind(element);
    if (!fg || !bg) return null;
    const composite = {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
    };
    const ratio = contrast(composite, bg);
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    return { ratio, ok: ratio >= (large ? 3 : 4.5), large };
  } catch {
    return null;
  }
}

function parseCssColor(css: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^rgba?\(([^)]+)\)$/.exec(css.trim());
  if (!m) return null;
  const parts = m[1]!.split(/[,/\s]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
}

function backgroundBehind(element: Element): { r: number; g: number; b: number } | null {
  const layers: Array<{ r: number; g: number; b: number; a: number }> = [];
  let current: Element | null = element;
  let guard = 0;
  while (current && guard++ < 40) {
    const color = parseCssColor(getComputedStyle(current).backgroundColor || "");
    if (color && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) break;
    }
    current = current.parentElement ?? ((current.getRootNode() as ShadowRoot).host ?? null);
  }
  let result = { r: 255, g: 255, b: 255 };
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i]!;
    result = {
      r: layer.r * layer.a + result.r * (1 - layer.a),
      g: layer.g * layer.a + result.g * (1 - layer.a),
      b: layer.b * layer.a + result.b * (1 - layer.a),
    };
  }
  return result;
}

function contrast(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const lum = (c: { r: number; g: number; b: number }): number => {
    const ch = (v: number): number => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
