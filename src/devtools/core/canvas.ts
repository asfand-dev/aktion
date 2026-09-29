/**
 * Aktion DevTools — canvas widget base.
 *
 * Flame charts and multi-track timelines draw thousands of rectangles and are
 * redrawn on hover, on zoom, and on every commit. As DOM they would cost more
 * layout than the app being profiled; as a canvas they cost one draw call per
 * frame. This base owns the parts every chart gets wrong at least once:
 * device-pixel-ratio scaling, resize tracking, reading the theme's colours
 * (so a canvas follows light/dark like the rest of the panel), a DOM tooltip
 * that is readable and selectable, and coalescing redraws into one per frame.
 */

import { Widget } from "./vdom.js";

const raf: (fn: () => void) => void =
  typeof requestAnimationFrame === "function"
    ? (fn) => { requestAnimationFrame(() => fn()); }
    : (fn) => { setTimeout(fn, 16); };

export interface CanvasBaseProps {
  height: number;
  ariaLabel: string;
  testid?: string;
}

export abstract class CanvasWidget<P extends CanvasBaseProps> extends Widget<P> {
  protected canvas!: HTMLCanvasElement;
  protected g: CanvasRenderingContext2D | null = null;
  protected width = 0;
  protected height = 0;
  protected dpr = 1;
  protected tip!: HTMLElement;
  private framePending = false;
  private resizeObserver: ResizeObserver | null = null;
  private colorCache = new Map<string, string>();
  private colorEpoch = "";

  mount(): Element {
    const root = document.createElement("div");
    root.className = "cv";
    root.style.height = `${this.props.height}px`;
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", this.props.ariaLabel);
    if (this.props.testid) root.setAttribute("data-dt", this.props.testid);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cv-canvas";
    this.tip = document.createElement("div");
    this.tip.className = "cv-tip";
    this.tip.hidden = true;
    root.append(this.canvas, this.tip);
    this.el = root;
    try {
      this.g = this.canvas.getContext("2d");
    } catch {
      this.g = null;
    }
    root.addEventListener("pointermove", (e) => this.handlePointer("move", e));
    root.addEventListener("pointerdown", (e) => this.handlePointer("down", e));
    root.addEventListener("pointerup", (e) => this.handlePointer("up", e));
    root.addEventListener("pointerleave", () => {
      this.hideTip();
      this.onLeave();
    });
    root.addEventListener("dblclick", (e) => this.handlePointer("dbl", e as PointerEvent));
    root.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    root.addEventListener("keydown", (e) => this.onKey(e));
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(root);
    }
    this.resize();
    return root;
  }

  override update(previous: P): void {
    if (this.props.height !== previous.height) {
      (this.el as HTMLElement).style.height = `${this.props.height}px`;
      this.resize();
      return;
    }
    if (this.props.ariaLabel !== previous.ariaLabel) this.el.setAttribute("aria-label", this.props.ariaLabel);
    this.changed(previous);
    this.redraw();
  }

  override unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  /** Props changed; recompute derived layout before the redraw. */
  protected changed(_previous: P): void {
    /* optional */
  }

  protected abstract draw(g: CanvasRenderingContext2D): void;

  protected onPointer(_kind: "move" | "down" | "up" | "dbl", _x: number, _y: number, _event: PointerEvent): void {
    /* optional */
  }

  protected onWheel(_event: WheelEvent): void {
    /* optional */
  }

  protected onKey(_event: KeyboardEvent): void {
    /* optional */
  }

  protected onLeave(): void {
    /* optional */
  }

  /** Coalesce redraws into the next frame. */
  redraw(): void {
    if (this.framePending) return;
    this.framePending = true;
    raf(() => {
      this.framePending = false;
      this.paint();
    });
  }

  protected resize(): void {
    const el = this.el as HTMLElement;
    const rect = el.getBoundingClientRect();
    this.width = Math.max(0, Math.floor(rect.width));
    this.height = this.props.height;
    this.dpr = Math.max(1, Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
    this.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.paint();
  }

  private paint(): void {
    const g = this.g;
    if (!g || this.width === 0) return;
    // Colours are read once per theme change, not per rectangle.
    const host = (this.el.getRootNode() as ShadowRoot).host as HTMLElement | undefined;
    const epoch = host?.getAttribute("data-theme") ?? "";
    if (epoch !== this.colorEpoch) {
      this.colorEpoch = epoch;
      this.colorCache.clear();
    }
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.width, this.height);
    try {
      this.draw(g);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion-devtools] chart draw failed", err);
    }
  }

  /** A theme token's value (`--dt-accent`), cached per theme. */
  protected color(token: string, fallback = "#888"): string {
    const cached = this.colorCache.get(token);
    if (cached) return cached;
    let value = "";
    try {
      value = getComputedStyle(this.el).getPropertyValue(token).trim();
    } catch {
      value = "";
    }
    const resolved = value || fallback;
    this.colorCache.set(token, resolved);
    return resolved;
  }

  protected font(size = 11, weight = 500, mono = false): string {
    return `${weight} ${size}px ${mono ? 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' : '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif'}`;
  }

  protected showTip(x: number, y: number, lines: ReadonlyArray<string | { text: string; tone?: string; bold?: boolean }>): void {
    const tip = this.tip;
    tip.replaceChildren();
    for (const line of lines) {
      const row = document.createElement("div");
      if (typeof line === "string") row.textContent = line;
      else {
        row.textContent = line.text;
        if (line.tone) row.style.color = line.tone;
        if (line.bold) row.style.fontWeight = "650";
      }
      tip.appendChild(row);
    }
    tip.hidden = false;
    // Flip to the left of the pointer near the right edge; below near the top.
    const tw = tip.offsetWidth || 220;
    const th = tip.offsetHeight || 60;
    const left = x + 14 + tw > this.width ? Math.max(4, x - tw - 10) : x + 14;
    const top = Math.max(4, Math.min(y + 12, this.height - th - 4));
    tip.style.transform = `translate(${left}px, ${top}px)`;
  }

  protected hideTip(): void {
    if (this.tip) this.tip.hidden = true;
  }

  private handlePointer(kind: "move" | "down" | "up" | "dbl", event: PointerEvent): void {
    const rect = (this.el as HTMLElement).getBoundingClientRect();
    this.onPointer(kind, event.clientX - rect.left, event.clientY - rect.top, event);
  }
}

/** Round-rect path helper (Canvas `roundRect` is not universal yet). */
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + radius, y);
  g.lineTo(x + w - radius, y);
  g.quadraticCurveTo(x + w, y, x + w, y + radius);
  g.lineTo(x + w, y + h - radius);
  g.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  g.lineTo(x + radius, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - radius);
  g.lineTo(x, y + radius);
  g.quadraticCurveTo(x, y, x + radius, y);
  g.closePath();
}

/** Truncate text to fit `maxWidth`, measuring with the context's current font. */
export function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 8) return "";
  if (g.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (g.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? "" : `${text.slice(0, lo)}…`;
}

/** Heat colour for a 0–1 intensity: teal → yellow → orange → red. */
export function heat(t: number, light = false): string {
  const clamped = Math.max(0, Math.min(1, t));
  const stops = light
    ? [[20, 160, 140], [202, 160, 20], [230, 110, 30], [214, 50, 60]]
    : [[48, 196, 170], [235, 200, 70], [255, 146, 72], [255, 96, 110]];
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const mix = (k: number): number => Math.round(a[k]! + (b[k]! - a[k]!) * f);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
