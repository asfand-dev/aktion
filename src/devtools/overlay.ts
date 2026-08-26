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
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147482000;
  contain: layout style;
}
.layer { position: fixed; pointer-events: none; box-sizing: border-box; }
.margin { background: rgba(246, 178, 107, 0.30); }
.border { background: rgba(255, 229, 153, 0.38); }
.padding { background: rgba(147, 196, 125, 0.36); }
.content { background: rgba(111, 168, 220, 0.42); }
.outline {
  outline: 1px solid rgba(124, 156, 255, 0.95);
  outline-offset: -1px;
}
.tip {
  position: fixed;
  pointer-events: none;
  max-width: 340px;
  padding: 4px 7px;
  border-radius: 5px;
  background: #16181d;
  color: #e6e8ec;
  border: 1px solid #3a3f4b;
  box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  font: 500 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tip .name { color: #7c9cff; font-weight: 700; }
.tip .dim { color: #9aa0ab; }
.tip .badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(192,140,240,0.18);
  color: #c08cf0;
}
.crosshair {
  position: fixed;
  inset: 0;
  cursor: crosshair;
  pointer-events: auto;
  background: transparent;
}
.hint {
  position: fixed;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  padding: 5px 10px;
  border-radius: 999px;
  background: #7c9cff;
  color: #10121a;
  font: 700 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 8px 20px rgba(0,0,0,0.4);
  pointer-events: none;
}
`;

/** Tag names that belong to DevTools itself and must never be inspected. */
const CHROME_TAGS = new Set([OVERLAY_TAG, "aktion-devtools"]);

/**
 * True when `element` is part of the DevTools UI (the panel or the overlay),
 * including anything inside their shadow roots.
 *
 * Walks parents *and* shadow hosts: a hover over the panel resolves to a plain
 * `div` several shadow boundaries deep, and a picker that only checked the
 * returned element's tag would happily let you inspect the inspector.
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

/**
 * The highlight + picker surface.
 *
 * One instance is shared by every tab (it is created by the panel and passed
 * down through the tab context), so a hover in the component tree and a hover
 * in the a11y audit draw the same rectangles.
 */
export class InspectOverlay {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private readonly layers = new Map<string, HTMLElement>();
  private tip: HTMLElement | null = null;
  private crosshair: HTMLElement | null = null;
  private hint: HTMLElement | null = null;

  /** Element currently drawn, so scroll / resize can re-measure it. */
  private tracked: Element | null = null;
  private trackedLabel: HighlightLabel = {};
  /**
   * The SELECTED element, kept separately from the hovered one.
   *
   * A single "tracked + pinned" pair looks equivalent and is not: hovering a
   * second row would overwrite the pin, and leaving the hover would then keep
   * the hovered element highlighted instead of returning to the selection.
   */
  private pinnedElement: Element | null = null;
  private pinnedLabel: HighlightLabel = {};
  private reflowBound: (() => void) | null = null;

  /* ---- picking ---- */
  private picking = false;
  private onPick: ((element: Element) => void) | null = null;
  private onHover: ((element: Element) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private moveHandler: ((e: MouseEvent) => void) | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /** True while the element picker is armed. */
  get isPicking(): boolean {
    return this.picking;
  }

  private ensureHost(): ShadowRoot | null {
    if (this.root) return this.root;
    if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
    const host = document.createElement(OVERLAY_TAG);
    // A host that participates in layout would shift the page it is measuring.
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
   * highlight survives `hideHover()` and follows the element through scrolling,
   * which is what makes "select it in the tree, then scroll to it" work.
   */
  highlight(element: Element | null, label: HighlightLabel = {}, pin = false): void {
    if (pin) {
      this.pinnedElement = element && element.isConnected ? element : null;
      this.pinnedLabel = label;
    }
    if (!element || !element.isConnected) {
      // Nothing to draw for this call: fall back to the selection if there is
      // one, otherwise clear.
      if (this.pinnedElement) this.drawTarget(this.pinnedElement, this.pinnedLabel);
      else this.clear();
      return;
    }
    if (!this.ensureHost()) return;
    this.drawTarget(element, label);
  }

  /** Remove a transient hover highlight, restoring the selection if there is one. */
  hideHover(): void {
    if (this.pinnedElement?.isConnected) {
      this.drawTarget(this.pinnedElement, this.pinnedLabel);
      return;
    }
    this.clear();
  }

  /** Remove every highlight and stop tracking. */
  clear(): void {
    this.tracked = null;
    this.pinnedElement = null;
    this.pinnedLabel = {};
    for (const layer of this.layers.values()) layer.style.display = "none";
    if (this.tip) this.tip.style.display = "none";
    this.unbindReflow();
  }

  /** Drop the selection, so the next `hideHover()` clears the highlight. */
  unpin(): void {
    this.pinnedElement = null;
    this.pinnedLabel = {};
  }

  private drawTarget(element: Element, label: HighlightLabel): void {
    if (!this.ensureHost()) return;
    this.tracked = element;
    this.trackedLabel = label;
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

    const tip = this.tip;
    if (!tip) return;
    tip.replaceChildren();
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = this.trackedLabel.component ?? describeElement(element);
    tip.appendChild(name);
    const dim = document.createElement("span");
    dim.className = "dim";
    dim.textContent = `  ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    tip.appendChild(dim);
    if (this.trackedLabel.component) {
      const el = document.createElement("span");
      el.className = "dim";
      el.textContent = `  ${describeElement(element)}`;
      tip.appendChild(el);
    }
    if (this.trackedLabel.kind) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = this.trackedLabel.kind;
      tip.appendChild(badge);
    }
    tip.style.display = "block";
    // Prefer above the element; flip below when there is no room, so the label
    // never covers the thing it labels.
    const tipHeight = 22;
    const above = rect.top - margin.top - tipHeight - 4;
    tip.style.top = `${above > 4 ? above : rect.top + rect.height + margin.bottom + 4}px`;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
    tip.style.left = `${Math.max(4, Math.min(viewportWidth - 200, rect.left - margin.left))}px`;
  }

  private bindReflow(): void {
    if (this.reflowBound || typeof window === "undefined") return;
    const handler = (): void => {
      if (!this.tracked) return;
      if (!this.tracked.isConnected) {
        this.clear();
        return;
      }
      this.draw();
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

  /* ---- picker ---- */

  /**
   * Arm the element picker. Hovering highlights, clicking selects, Escape
   * cancels.
   *
   * A full-viewport crosshair layer takes the pointer events so the app under
   * it never sees the picking click — you can safely pick a "Delete" button.
   */
  startPicking(handlers: {
    onPick(element: Element): void;
    onHover?(element: Element): void;
    onCancel?(): void;
  }): void {
    const root = this.ensureHost();
    if (!root || this.picking) return;
    this.picking = true;
    this.onPick = handlers.onPick;
    this.onHover = handlers.onHover ?? null;
    this.onCancel = handlers.onCancel ?? null;

    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    root.appendChild(crosshair);
    this.crosshair = crosshair;

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Click an element to inspect it · Esc to cancel";
    root.appendChild(hint);
    this.hint = hint;

    this.moveHandler = (event: MouseEvent) => {
      const element = this.pickTarget(event);
      if (!element) {
        // Over the panel itself: drop the transient highlight so the rectangles
        // don't stay stranded on whatever was under the cursor last.
        this.hideHover();
        return;
      }
      this.highlight(element, {}, false);
      this.onHover?.(element);
    };
    this.clickHandler = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const element = this.pickTarget(event);
      // A click on the panel's own UI is not a selection; stay armed rather
      // than cancelling the pick the user is halfway through.
      if (!element) return;
      const pick = this.onPick;
      this.stopPicking();
      pick?.(element);
    };
    this.keyHandler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const cancel = this.onCancel;
      this.stopPicking();
      cancel?.();
    };
    crosshair.addEventListener("mousemove", this.moveHandler);
    crosshair.addEventListener("click", this.clickHandler);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }

  /** Disarm the picker, leaving any pinned highlight in place. */
  stopPicking(): void {
    if (!this.picking) return;
    this.picking = false;
    if (this.crosshair) {
      if (this.moveHandler) this.crosshair.removeEventListener("mousemove", this.moveHandler);
      if (this.clickHandler) this.crosshair.removeEventListener("click", this.clickHandler);
      this.crosshair.remove();
      this.crosshair = null;
    }
    this.hint?.remove();
    this.hint = null;
    if (this.keyHandler && typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler, true);
    }
    this.moveHandler = null;
    this.clickHandler = null;
    this.keyHandler = null;
    this.onPick = null;
    this.onHover = null;
    this.onCancel = null;
    // Leave a selection in place; drop a hover-only highlight.
    this.hideHover();
  }

  /**
   * Element under a picking event. The crosshair layer is on top, so we hide it
   * for the duration of the hit test rather than reading `event.target` (which
   * would always be the crosshair itself).
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
    // Never let the picker select the panel's own UI. The hit test resolves the
    // DEEPEST element, which for a hover over the panel is a `div` inside its
    // shadow root — so checking the returned tag is not enough; the whole
    // composed ancestor chain (crossing shadow boundaries) has to be walked.
    return isPanelChrome(element) ? null : element;
  }

  /** Remove the overlay host from the page. */
  destroy(): void {
    this.stopPicking();
    this.clear();
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.layers.clear();
    this.tip = null;
  }
}
