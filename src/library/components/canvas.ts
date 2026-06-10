/**
 * Interactive canvas / editor components (suggestions-global VIII.7):
 *
 *   DrawingCanvas — freehand drawing surface (pointer, touch, stylus)
 *   SignaturePad  — a DrawingCanvas tuned for signatures (clear + value out)
 *
 * All render real DOM/canvas, bounded + theme-aware, no dependencies. They
 * expose results through callables (`onChange`/`onEnd`) since canvas bitmap
 * data can't round-trip through a `$variable`.
 *
 * Morph-reconciler contract: every handler is a property assignment
 * (`el.onpointerdown = fn`) and resolves the live element through
 * `event.currentTarget`. The stroke state lives in a WeakMap keyed by the
 * live <canvas> — NOT in render-scope closures — so an `onChange` that
 * writes reactive state (triggering a re-render mid-stroke) can no longer
 * orphan the pad: fresh closures keep finding the same live state, and the
 * Clear button keeps clearing the canvas the user actually sees.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asNumber, asBoolean, sanitiseCssColor } from "../utils.js";

interface PadState {
  strokes: Array<Array<{ x: number; y: number }>>;
  current: Array<{ x: number; y: number }>;
  drawing: boolean;
  ctx: CanvasRenderingContext2D | null;
  width: number;
  height: number;
}

/** Live pad state, keyed by the on-page canvas element. */
const PADS = new WeakMap<HTMLCanvasElement, PadState>();

function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  return ctx;
}

/** Ink/background config read off the live canvas (morph keeps it synced). */
function padConfig(canvas: HTMLCanvasElement): { stroke: string; lineWidth: number; background: string } {
  let stroke = canvas.dataset.stroke ?? "";
  if (!stroke) {
    // Theme-aware default: the stylesheet sets `color` on the surface.
    try { stroke = getComputedStyle(canvas).color || "#1a1a1a"; } catch { stroke = "#1a1a1a"; }
  }
  return {
    stroke,
    lineWidth: Math.max(1, Math.min(40, Number(canvas.dataset.lineWidth) || 2)),
    background: canvas.dataset.bg ?? "transparent",
  };
}

function paintBackground(canvas: HTMLCanvasElement, pad: PadState): void {
  if (!pad.ctx) return;
  const { background } = padConfig(canvas);
  if (background && background !== "transparent") {
    pad.ctx.fillStyle = background;
    pad.ctx.fillRect(0, 0, pad.width, pad.height);
  }
}

function redrawPad(canvas: HTMLCanvasElement): void {
  const pad = PADS.get(canvas);
  if (!pad?.ctx) return;
  const { stroke, lineWidth } = padConfig(canvas);
  pad.ctx.clearRect(0, 0, pad.width, pad.height);
  paintBackground(canvas, pad);
  pad.ctx.strokeStyle = stroke;
  pad.ctx.lineWidth = lineWidth;
  for (const path of pad.strokes) {
    if (path.length < 1) continue;
    pad.ctx.beginPath();
    pad.ctx.moveTo(path[0]!.x, path[0]!.y);
    for (let i = 1; i < path.length; i += 1) pad.ctx.lineTo(path[i]!.x, path[i]!.y);
    pad.ctx.stroke();
  }
}

function clearPad(canvas: HTMLCanvasElement): void {
  const pad = PADS.get(canvas);
  if (!pad) return;
  pad.strokes = [];
  pad.current = [];
  redrawPad(canvas);
}

function makeDrawingSurface(spec: {
  width: number;
  height: number;
  stroke: string;
  lineWidth: number;
  background: string;
  rootClass: string;
  onChange?: unknown;
  onEnd?: unknown;
  helpers: RenderHelpers;
}): { root: HTMLElement; canvas: HTMLCanvasElement } {
  const { width, height, stroke, lineWidth, background, rootClass, helpers } = spec;
  const root = el("div", { class: rootClass, style: `width:${width}px` });
  const canvas = el("canvas", {
    class: "rui-canvas-surface",
    style: "touch-action:none",
    "data-stroke": stroke || null,
    "data-line-width": String(lineWidth),
    "data-bg": background,
  }) as HTMLCanvasElement;
  root.append(canvas);

  const ctx = setupCanvas(canvas, width, height);
  PADS.set(canvas, { strokes: [], current: [], drawing: false, ctx, width, height });
  paintBackground(canvas, PADS.get(canvas)!);

  const liveCanvas = (e: PointerEvent): HTMLCanvasElement => (e.currentTarget as HTMLCanvasElement | null) ?? canvas;
  const pointFrom = (cv: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } => {
    const rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  canvas.onpointerdown = (e: PointerEvent) => {
    const cv = liveCanvas(e);
    const pad = PADS.get(cv);
    if (!pad) return;
    pad.drawing = true;
    try { cv.setPointerCapture(e.pointerId); } catch { /* already released */ }
    pad.current = [pointFrom(cv, e)];
    pad.strokes.push(pad.current);
  };
  canvas.onpointermove = (e: PointerEvent) => {
    const cv = liveCanvas(e);
    const pad = PADS.get(cv);
    if (!pad?.drawing) return;
    pad.current.push(pointFrom(cv, e));
    redrawPad(cv);
    helpers.invoke(spec.onChange, pad.strokes.length);
  };
  const end = (e: PointerEvent): void => {
    const cv = liveCanvas(e);
    const pad = PADS.get(cv);
    if (!pad?.drawing) return;
    pad.drawing = false;
    let url = "";
    try { url = cv.toDataURL("image/png"); } catch { /* tainted / unsupported */ }
    helpers.invoke(spec.onEnd, url);
  };
  canvas.onpointerup = end;
  canvas.onpointercancel = end;

  return { root, canvas };
}

/** Resolve the live canvas for a toolbar button across morph re-renders. */
function liveSurfaceCanvas(event: Event, rootClass: string, fallback: HTMLCanvasElement): HTMLCanvasElement {
  const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
  const liveRoot = origin?.closest?.(`.${rootClass}`);
  return (liveRoot?.querySelector("canvas.rui-canvas-surface") as HTMLCanvasElement | null) ?? fallback;
}

export const DrawingCanvas: ComponentSpec = {
  name: "DrawingCanvas",
  description:
    "A freehand drawing surface (pointer / touch / stylus). `onChange(count)` " +
    "fires while drawing; `onEnd(dataUrl)` fires when a stroke finishes with a " +
    "PNG data URL. `color`/`lineWidth`/`background` style the ink. Includes a " +
    "Clear button unless `clearable=false`.",
  props: [
    { name: "width", type: "number", optional: true, description: "px (default 360)" },
    { name: "height", type: "number", optional: true, description: "px (default 220)" },
    { name: "color", type: "string", optional: true, description: "Ink color" },
    { name: "lineWidth", type: "number", optional: true },
    { name: "background", type: "string", optional: true },
    { name: "clearable", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, description: "(strokeCount) => …" },
    { name: "onEnd", type: "callable", optional: true, description: "(pngDataUrl) => …" },
  ],
  render: (_node, props, helpers) => {
    const width = Math.max(80, Math.min(2000, asNumber(props.width, 360)));
    const height = Math.max(80, Math.min(2000, asNumber(props.height, 220)));
    const stroke = sanitiseCssColor(props.color) || "";
    const lineWidth = Math.max(1, Math.min(40, asNumber(props.lineWidth, 2)));
    const background = sanitiseCssColor(props.background) || "transparent";
    const surface = makeDrawingSurface({
      width, height, stroke, lineWidth, background,
      rootClass: "rui-drawing-canvas", onChange: props.onChange, onEnd: props.onEnd, helpers,
    });
    if (props.clearable === undefined ? true : asBoolean(props.clearable)) {
      const bar = el("div", { class: "rui-canvas-toolbar" });
      const clearBtn = el("button", { type: "button", class: "rui-canvas-clear" }, ["Clear"]);
      clearBtn.onclick = (event: Event) => {
        clearPad(liveSurfaceCanvas(event, "rui-drawing-canvas", surface.canvas));
        helpers.invoke(props.onChange, 0);
      };
      bar.append(clearBtn);
      surface.root.append(bar);
    }
    return surface.root;
  },
};

export const SignaturePad: ComponentSpec = {
  name: "SignaturePad",
  description:
    "A signature capture pad — a DrawingCanvas tuned for signing, with a " +
    "baseline and a Clear button. `onChange(pngDataUrl)` fires when the " +
    "signature changes (empty string when cleared). Use in contracts, " +
    "delivery confirmation, and consent flows.",
  props: [
    { name: "width", type: "number", optional: true, description: "px (default 400)" },
    { name: "height", type: "number", optional: true, description: "px (default 160)" },
    { name: "color", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, description: "(pngDataUrl|\"\") => …" },
  ],
  render: (_node, props, helpers) => {
    const width = Math.max(120, Math.min(1200, asNumber(props.width, 400)));
    const height = Math.max(80, Math.min(600, asNumber(props.height, 160)));
    const stroke = sanitiseCssColor(props.color) || "#1a1a1a";
    const surface = makeDrawingSurface({
      width, height, stroke, lineWidth: 2.5, background: "#ffffff",
      rootClass: "rui-signature-pad",
      onEnd: (url: unknown) => helpers.invoke(props.onChange, url),
      helpers,
    });
    const baseline = el("div", { class: "rui-signature-baseline" });
    surface.root.append(baseline);
    const bar = el("div", { class: "rui-canvas-toolbar" });
    const clearBtn = el("button", { type: "button", class: "rui-canvas-clear" }, ["Clear"]);
    clearBtn.onclick = (event: Event) => {
      clearPad(liveSurfaceCanvas(event, "rui-signature-pad", surface.canvas));
      helpers.invoke(props.onChange, "");
    };
    bar.append(clearBtn);
    surface.root.append(bar);
    return surface.root;
  },
};
