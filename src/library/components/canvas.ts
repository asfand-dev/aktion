/**
 * Interactive canvas / editor components (suggestions-global VIII.7):
 *
 *   DrawingCanvas — freehand drawing surface (pointer, touch, stylus)
 *   SignaturePad  — a DrawingCanvas tuned for signatures (clear + value out)
 *
 * All render real DOM/canvas, bounded + theme-aware, no dependencies. Bitmap
 * data leaves through callables (`onChange`/`onEnd`) and comes back in through
 * `value` (a PNG data URL), so a signature survives a remount, a wizard step,
 * or a server-side validation error.
 *
 * Morph-reconciler contract: every handler is a property assignment
 * (`el.onpointerdown = fn`) and resolves the live element through
 * `event.currentTarget`. The stroke state lives in a WeakMap keyed by the
 * live <canvas> — NOT in render-scope closures — so an `onChange` that
 * writes reactive state (triggering a re-render mid-stroke) can no longer
 * orphan the pad: fresh closures keep finding the same live state, and the
 * Clear button keeps clearing the canvas the user actually sees.
 *
 * The reconciler also keeps the MOUNTED canvas and discards the freshly
 * rendered one — while still pushing changed `width`/`height` attributes onto
 * it, which resets the drawing buffer AND the context transform. Every render
 * therefore re-fits the LIVE element after paint (`syncPad`), which is also
 * where a changed `value` is imported and where the size observer is attached.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asString, asNumber, asBoolean, sanitiseCssColor, valueAttr } from "../utils.js";
import { FIELD_SHELL_PROPS, withFieldShell, attachFocusHandlers } from "./forms-shared.js";
import { deferToPaint } from "../floating.js";

interface Point { x: number; y: number }

interface PadState {
  strokes: Point[][];
  current: Point[];
  drawing: boolean;
  ctx: CanvasRenderingContext2D | null;
  /** Logical (CSS-pixel) size of the buffer — the space stroke coords live in. */
  width: number;
  height: number;
  /** Size the last render's props asked for, so a re-fit to the rendered box
   *  (see `refitPad`) is not undone by the next unrelated re-render. */
  propWidth: number;
  propHeight: number;
  /** The `value` data URL this pad has already imported or emitted. */
  value: string;
  /** Imported `value` bitmap, re-drawn underneath the live strokes. */
  base: HTMLImageElement | null;
  /** False until the first paint on a CONNECTED node (computed style needs it). */
  painted: boolean;
}

/** Live pad state, keyed by the on-page canvas element. */
const PADS = new WeakMap<HTMLCanvasElement, PadState>();

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const devicePixels = (): number => (typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1);

/**
 * Point the 2D context at a `width`×`height` logical coordinate space backed by
 * a device-pixel buffer. Assigning `width`/`height` resets the bitmap and the
 * transform, so the transform is reset explicitly first — that keeps the call
 * idempotent on engines that skip the reset for an unchanged value, instead of
 * compounding `scale(dpr, dpr)` a second time.
 */
function sizeCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  applyCssSize: boolean,
): CanvasRenderingContext2D | null {
  const dpr = devicePixels();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  if (applyCssSize) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    // Never overflow a narrow column: the pad shrinks and the pointer mapping
    // below scales input back into buffer space.
    canvas.style.maxWidth = "100%";
  }
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  return ctx;
}

/** `true` for values that paint nothing (so the export keeps its alpha). */
const isTransparent = (color: string): boolean =>
  !color || color === "transparent" || /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color);

/** Ink/background config read off the live canvas (morph keeps it synced). */
function padConfig(canvas: HTMLCanvasElement): { stroke: string; lineWidth: number; background: string } {
  let stroke = canvas.dataset.stroke ?? "";
  if (!stroke) {
    // Theme-aware default: the stylesheet sets `color` on the surface.
    try { stroke = getComputedStyle(canvas).color || "#1a1a1a"; } catch { stroke = "#1a1a1a"; }
  }
  let background = canvas.dataset.bg ?? "";
  if (!background) {
    // Mirror `stroke`: with no author background the export would be light ink
    // on full transparency in a dark theme — invisible everywhere it is later
    // displayed. Fall back to the surface colour the user actually saw.
    try { background = getComputedStyle(canvas).backgroundColor || ""; } catch { background = ""; }
  }
  return {
    stroke,
    lineWidth: clamp(Number(canvas.dataset.lineWidth) || 2, 1, 40),
    background,
  };
}

function paintBackground(canvas: HTMLCanvasElement, pad: PadState): void {
  if (!pad.ctx) return;
  const { background } = padConfig(canvas);
  if (isTransparent(background)) return;
  pad.ctx.fillStyle = background;
  pad.ctx.fillRect(0, 0, pad.width, pad.height);
}

/** Apply the ink config to the context before any painting. */
function applyInk(canvas: HTMLCanvasElement, pad: PadState): number {
  const { stroke, lineWidth } = padConfig(canvas);
  if (pad.ctx) {
    pad.ctx.strokeStyle = stroke;
    pad.ctx.fillStyle = stroke;
    pad.ctx.lineWidth = lineWidth;
  }
  return lineWidth;
}

/**
 * Draw one subpath. A single point is painted as a filled dot: a 1-point path
 * emits no line segment, so a tap (dotting an 'i', a full stop, an accidental
 * touch) used to leave no ink at all whatever `lineCap` said.
 */
function drawPath(ctx: CanvasRenderingContext2D, path: Point[], lineWidth: number): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    const p = path[0]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, lineWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(path[0]!.x, path[0]!.y);
  for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i]!.x, path[i]!.y);
  ctx.stroke();
}

/**
 * Paint only what the latest sample added — a dot for a new stroke, one segment
 * for a continuation. Replaying the whole history per pointer event is
 * O(points) at 60–120 Hz and made long drawings lag the stylus.
 */
function drawIncremental(canvas: HTMLCanvasElement, pad: PadState, prev: Point | null, next: Point): void {
  if (!pad.ctx) return;
  const lineWidth = applyInk(canvas, pad);
  if (!prev) {
    drawPath(pad.ctx, [next], lineWidth);
    return;
  }
  pad.ctx.beginPath();
  pad.ctx.moveTo(prev.x, prev.y);
  pad.ctx.lineTo(next.x, next.y);
  pad.ctx.stroke();
}

/** Full repaint — background, imported `value`, then every stroke. */
function redrawPad(canvas: HTMLCanvasElement): void {
  const pad = PADS.get(canvas);
  if (!pad?.ctx) return;
  pad.ctx.clearRect(0, 0, pad.width, pad.height);
  paintBackground(canvas, pad);
  if (pad.base) {
    try { pad.ctx.drawImage(pad.base, 0, 0, pad.width, pad.height); } catch { /* undecodable */ }
  }
  const lineWidth = applyInk(canvas, pad);
  for (const path of pad.strokes) drawPath(pad.ctx, path, lineWidth);
}

function clearPad(canvas: HTMLCanvasElement): void {
  const pad = PADS.get(canvas);
  if (!pad) return;
  pad.strokes = [];
  pad.current = [];
  pad.base = null;
  // Remember that the pad is now empty so the `value: ""` echo of the clear
  // does not re-import anything.
  pad.value = "";
  redrawPad(canvas);
}

function padDataUrl(canvas: HTMLCanvasElement): string {
  try { return canvas.toDataURL("image/png"); } catch { return ""; /* tainted / unsupported */ }
}

/** What a finished stroke reports back to the component. */
interface PadResult {
  strokes: number;
  /** True once at least one stroke is a real line — taps alone are not ink. */
  inked: boolean;
}

const padResult = (pad: PadState): PadResult => ({
  strokes: pad.strokes.length,
  inked: pad.strokes.some((path) => path.length >= 2),
});

/** Resize the buffer, rescaling existing strokes so the artwork keeps its place. */
function resizePad(
  canvas: HTMLCanvasElement,
  pad: PadState,
  width: number,
  height: number,
  applyCssSize: boolean,
): void {
  const sx = pad.width > 0 ? width / pad.width : 1;
  const sy = pad.height > 0 ? height / pad.height : 1;
  if (sx !== 1 || sy !== 1) {
    for (const path of pad.strokes) {
      for (const point of path) {
        point.x *= sx;
        point.y *= sy;
      }
    }
  }
  pad.ctx = sizeCanvas(canvas, width, height, applyCssSize);
  pad.width = width;
  pad.height = height;
  pad.painted = true;
  redrawPad(canvas);
}

/**
 * Re-fit the buffer to the element's RENDERED box. The responsive rule caps the
 * surface at `max-width: 100%`, so on a narrow screen (or in a narrow column)
 * the box is smaller than the `width` prop — leaving the buffer, the CSS box
 * and the context transform disagreeing about how big a logical pixel is.
 */
function refitPad(canvas: HTMLCanvasElement): void {
  const pad = PADS.get(canvas);
  if (!pad || pad.drawing) return; // never re-fit mid-stroke
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width < 1 || height < 1) return;
  if (Math.abs(width - pad.width) <= 1 && Math.abs(height - pad.height) <= 1) return;
  // `applyCssSize: false` — writing the measured size back into `style` would
  // change the box the observer just reported and spin the observer.
  resizePad(canvas, pad, width, height, false);
}

/**
 * Bring the LIVE pad back in line with this render's props. Called after paint
 * because that is the only moment the mounted element is reachable and its
 * computed style resolvable.
 */
function syncPad(canvas: HTMLCanvasElement, cfg: { width: number; height: number; value: string }): void {
  const pad = PADS.get(canvas);
  if (!pad) return;
  const dpr = devicePixels();
  if (pad.propWidth !== cfg.width || pad.propHeight !== cfg.height) {
    // A `width`/`height` change reaches the live element as a bare attribute
    // write from the reconciler: the bitmap is gone and the transform is back
    // to 1:1 while `pad` still holds the previous ctx and dimensions.
    pad.propWidth = cfg.width;
    pad.propHeight = cfg.height;
    resizePad(canvas, pad, cfg.width, cfg.height, true);
  } else if (
    canvas.width !== Math.round(pad.width * dpr) ||
    canvas.height !== Math.round(pad.height * dpr)
  ) {
    // Same cause, no prop change: this render re-asserted the declared size on
    // a pad that had been re-fitted to a narrower box (or the display's dpr
    // changed). Restore the size the pad is using and repaint from history —
    // `applyCssSize: false` leaves the CSS box to the stylesheet.
    resizePad(canvas, pad, pad.width, pad.height, false);
  } else if (!pad.painted) {
    pad.painted = true;
    redrawPad(canvas);
  }
  if (cfg.value !== pad.value) {
    pad.value = cfg.value;
    importValue(canvas, cfg.value);
  }
}

/** Restore a PNG data URL as the pad's base layer (the `value` prop). */
function importValue(canvas: HTMLCanvasElement, url: string): void {
  const pad = PADS.get(canvas);
  if (!pad) return;
  if (!url) {
    pad.base = null;
    pad.strokes = [];
    pad.current = [];
    redrawPad(canvas);
    return;
  }
  if (typeof Image === "undefined") return;
  const img = new Image();
  img.onload = () => {
    // A newer value (or a fresh stroke) may have superseded this load.
    if (PADS.get(canvas) !== pad || pad.value !== url) return;
    pad.base = img;
    pad.strokes = [];
    pad.current = [];
    redrawPad(canvas);
  };
  img.onerror = () => { /* keep whatever is on the pad */ };
  img.src = url;
}

interface SurfaceSpec {
  width: number;
  height: number;
  stroke: string;
  lineWidth: number;
  /** "" resolves from computed style (see `padConfig`). */
  background: string;
  rootClass: string;
  ariaLabel: string;
  disabled: boolean;
  value: string;
  /** Fires only when the stroke COUNT changes (stroke start, Clear). */
  onCount?: (count: number) => void;
  onEnd?: (url: string, info: PadResult) => void;
  helpers: RenderHelpers;
}

function makeDrawingSurface(spec: SurfaceSpec): { root: HTMLElement; canvas: HTMLCanvasElement } {
  const { width, height, stroke, lineWidth, background, rootClass, disabled, helpers } = spec;
  const root = el("div", {
    class: rootClass,
    style: `width:${width}px;max-width:100%`,
    "data-disabled": disabled ? "true" : null,
  });
  const canvas = el("canvas", {
    class: "rui-canvas-surface",
    style: "touch-action:none",
    // Focusable + named so the surface is discoverable by a screen reader and
    // has something for a field error to be associated with.
    tabindex: disabled ? null : "0",
    "aria-label": spec.ariaLabel || null,
    "aria-disabled": disabled ? "true" : null,
    "data-stroke": stroke || null,
    "data-line-width": String(lineWidth),
    "data-bg": background || null,
  }) as HTMLCanvasElement;
  root.append(canvas);

  const ctx = sizeCanvas(canvas, width, height, true);
  const pad: PadState = {
    strokes: [], current: [], drawing: false, ctx,
    width, height, propWidth: width, propHeight: height,
    value: "", base: null, painted: false,
  };
  PADS.set(canvas, pad);
  paintBackground(canvas, pad);

  const liveCanvas = (e: PointerEvent): HTMLCanvasElement =>
    (e.currentTarget as HTMLCanvasElement | null) ?? canvas;
  const pointFrom = (cv: HTMLCanvasElement, e: PointerEvent): Point => {
    const live = PADS.get(cv);
    const rect = cv.getBoundingClientRect();
    const logicalW = live?.width ?? 0;
    const logicalH = live?.height ?? 0;
    // Input arrives in CSS pixels of the RENDERED box, which can be narrower
    // than the buffer's logical size — scale it or the ink drifts away from the
    // pointer, worsening toward the right edge.
    const sx = rect.width > 0 && logicalW > 0 ? logicalW / rect.width : 1;
    const sy = rect.height > 0 && logicalH > 0 ? logicalH / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const finish = (cv: HTMLCanvasElement, live: PadState): void => {
    live.drawing = false;
    const url = padDataUrl(cv);
    // Remember what we emitted: the `value` echo of a bound `onEnd`/`onChange`
    // must not re-import the PNG we just produced.
    live.value = url;
    const hidden = cv.closest(`.${rootClass}`)?.querySelector<HTMLInputElement>("input.rui-canvas-value");
    if (hidden) hidden.value = url;
    spec.onEnd?.(url, padResult(live));
  };

  // Handlers are omitted entirely while disabled — the reconciler then clears
  // the live node's handler properties, so the surface really is locked.
  if (!disabled) {
    canvas.onpointerdown = (e: PointerEvent) => {
      const cv = liveCanvas(e);
      const live = PADS.get(cv);
      if (!live) return;
      live.drawing = true;
      try { cv.setPointerCapture(e.pointerId); } catch { /* already released */ }
      const first = pointFrom(cv, e);
      live.current = [first];
      live.strokes.push(live.current);
      // Paint and report immediately: a tap is a visible dot and it is the only
      // moment the stroke count actually changes.
      drawIncremental(cv, live, null, first);
      spec.onCount?.(live.strokes.length);
    };
    canvas.onpointermove = (e: PointerEvent) => {
      const cv = liveCanvas(e);
      const live = PADS.get(cv);
      if (!live?.drawing) return;
      // Pointer capture can be lost silently (an implicit release, a failed
      // `setPointerCapture`), and `onlostpointercapture` is not on the morph
      // reconciler's handler whitelist — so a buttonless mouse move is the only
      // signal left that the stroke is over. Without this the pad "latches" and
      // keeps drawing with no button held.
      if (e.buttons === 0 && e.pointerType === "mouse") {
        finish(cv, live);
        return;
      }
      const prev = live.current[live.current.length - 1] ?? null;
      const next = pointFrom(cv, e);
      live.current.push(next);
      drawIncremental(cv, live, prev, next);
    };
    const end = (e: PointerEvent): void => {
      const cv = liveCanvas(e);
      const live = PADS.get(cv);
      if (!live?.drawing) return;
      try { cv.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      finish(cv, live);
    };
    canvas.onpointerup = end;
    canvas.onpointercancel = end;
  }

  // The mounted canvas is only reachable after paint: on the first render this
  // very node is mounted, on every later one the reconciler kept the previous
  // node and discarded this one — hence the instance slot.
  const liveSlot = helpers.useInstanceState<HTMLCanvasElement | null>("rui-canvas-live", null);
  const obsSlot = helpers.useInstanceState<{ ro: ResizeObserver; node: HTMLCanvasElement } | null>("rui-canvas-observer", null);
  deferToPaint(() => {
    const live = canvas.isConnected ? canvas : liveSlot.get();
    if (!live?.isConnected) return;
    liveSlot.set(live);
    syncPad(live, spec);
    const existing = obsSlot.get();
    if (existing && existing.node !== live) {
      existing.ro.disconnect();
      obsSlot.set(null);
    }
    if (!obsSlot.get() && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => refitPad(live));
      try { ro.observe(live); } catch { /* detached — the prop size still applies */ }
      obsSlot.set({ ro, node: live });
      helpers.registerDisposer(() => {
        ro.disconnect();
        obsSlot.set(null);
      }, "rui-canvas-observer");
    }
  });

  return { root, canvas };
}

/** Resolve the live canvas for a toolbar button across morph re-renders. */
function liveSurfaceCanvas(event: Event, rootClass: string, fallback: HTMLCanvasElement): HTMLCanvasElement {
  const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
  const liveRoot = origin?.closest?.(`.${rootClass}`);
  return (liveRoot?.querySelector("canvas.rui-canvas-surface") as HTMLCanvasElement | null) ?? fallback;
}

/** Optional hidden field so a pad inside a `Form` submits its PNG. */
function valueField(name: string, value: unknown): HTMLElement | null {
  if (!name) return null;
  return el("input", { type: "hidden", class: "rui-canvas-value", name, value: valueAttr(value) });
}

export const DrawingCanvas: ComponentSpec = {
  name: "DrawingCanvas",
  description:
    "A freehand drawing surface (pointer / touch / stylus). `onChange(count)` " +
    "fires when a stroke starts or the pad is cleared; `onEnd(dataUrl, count)` " +
    "fires when a stroke finishes with a PNG data URL. Pass that URL back as " +
    "`value` to restore the drawing after a re-render or route change. " +
    "`color`/`lineWidth`/`background` style the ink (`background` defaults to " +
    "the surface colour so the export is never ink-on-transparency). Includes " +
    "a Clear button unless `clearable=false`; `disabled` locks the surface.",
  props: [
    { name: "width", type: "number", optional: true, description: "px (default 360)" },
    { name: "height", type: "number", optional: true, description: "px (default 220)" },
    { name: "color", type: "string", optional: true, description: "Ink color" },
    { name: "lineWidth", type: "number", optional: true },
    { name: "background", type: "string", optional: true, description: "Exported background color (`transparent` keeps the alpha)" },
    { name: "clearable", type: "boolean", optional: true },
    { name: "value", type: "string", optional: true, description: "PNG data URL to restore (the value `onEnd` hands you)" },
    { name: "onChange", type: "callable", optional: true, description: "(strokeCount) => …" },
    { name: "onEnd", type: "callable", optional: true, description: "(pngDataUrl, strokeCount) => …" },
    ...FIELD_SHELL_PROPS,
    { name: "ariaLabel", type: "string", optional: true, aliases: ["arialabel"], description: "Accessible name for the surface (defaults to `label`)" },
  ],
  render: (_node, props, helpers) => {
    const width = clamp(asNumber(props.width, 360), 80, 2000);
    const height = clamp(asNumber(props.height, 220), 80, 2000);
    const disabled = asBoolean(props.disabled);
    const label = asString(props.label);
    const surface = makeDrawingSurface({
      width,
      height,
      stroke: sanitiseCssColor(props.color) || "",
      lineWidth: clamp(asNumber(props.lineWidth, 2), 1, 40),
      background: sanitiseCssColor(props.background),
      rootClass: "rui-drawing-canvas",
      ariaLabel: asString(props.ariaLabel) || label || "Drawing canvas",
      disabled,
      value: asString(props.value),
      onCount: (count) => helpers.invoke(props.onChange, count),
      onEnd: (url, info) => helpers.invoke(props.onEnd, url, info.strokes),
      helpers,
    });
    attachFocusHandlers(surface.canvas, props, helpers, (node) => padDataUrl(node as HTMLCanvasElement));
    const hidden = valueField(asString(props.name), props.value);
    if (hidden) surface.root.append(hidden);
    if (props.clearable === undefined ? true : asBoolean(props.clearable)) {
      const bar = el("div", { class: "rui-canvas-toolbar" });
      const clearBtn = el("button", {
        type: "button",
        class: "rui-canvas-clear",
        disabled: disabled ? "" : null,
      }, ["Clear"]);
      clearBtn.onclick = (event: Event) => {
        clearPad(liveSurfaceCanvas(event, "rui-drawing-canvas", surface.canvas));
        helpers.invoke(props.onChange, 0);
      };
      bar.append(clearBtn);
      surface.root.append(bar);
    }
    return withFieldShell(surface.root, props);
  },
};

export const SignaturePad: ComponentSpec = {
  name: "SignaturePad",
  description:
    "A signature capture pad — a DrawingCanvas tuned for signing, with a " +
    "baseline and a Clear button. `onChange(pngDataUrl, strokeCount)` fires " +
    "when the signature changes (empty string when cleared, and also when the " +
    "pad only received taps — so a stray tap cannot pass a truthiness check). " +
    "Pass the URL back as `value` to restore a signature after a re-render, " +
    "and `disabled` to lock the pad once it is submitted. `label`/`error`/" +
    "`required` render the usual field shell. Use in contracts, delivery " +
    "confirmation, and consent flows.",
  props: [
    { name: "width", type: "number", optional: true, description: "px (default 400)" },
    { name: "height", type: "number", optional: true, description: "px (default 160)" },
    { name: "color", type: "string", optional: true },
    { name: "lineWidth", type: "number", optional: true, description: "Pen width (default 2.5 — widen it for finger signing)" },
    { name: "background", type: "string", optional: true, description: "Exported background (default `#ffffff`; `transparent` composites onto a PDF/letterhead)" },
    { name: "clearable", type: "boolean", optional: true, description: "Show the Clear button (default true)" },
    { name: "value", type: "string", optional: true, description: "PNG data URL to restore a captured signature" },
    { name: "onChange", type: "callable", optional: true, description: "(pngDataUrl|\"\", strokeCount) => …" },
    ...FIELD_SHELL_PROPS,
    { name: "ariaLabel", type: "string", optional: true, aliases: ["arialabel"], description: "Accessible name for the pad (defaults to `label`)" },
  ],
  render: (_node, props, helpers) => {
    const width = clamp(asNumber(props.width, 400), 120, 1200);
    const height = clamp(asNumber(props.height, 160), 80, 600);
    const disabled = asBoolean(props.disabled);
    const label = asString(props.label);
    const surface = makeDrawingSurface({
      width,
      height,
      stroke: sanitiseCssColor(props.color) || "#1a1a1a",
      lineWidth: clamp(asNumber(props.lineWidth, 2.5), 1, 40),
      background: sanitiseCssColor(props.background) || "#ffffff",
      rootClass: "rui-signature-pad",
      ariaLabel: asString(props.ariaLabel) || label || "Signature pad",
      disabled,
      value: asString(props.value),
      // Taps alone are not a signature: reporting "" keeps a blank-but-truthy
      // data URL from satisfying `$signature != ""` after an accidental touch.
      onEnd: (url, info) => helpers.invoke(props.onChange, info.inked ? url : "", info.strokes),
      helpers,
    });
    attachFocusHandlers(surface.canvas, props, helpers, (node) => padDataUrl(node as HTMLCanvasElement));
    // The baseline hangs off its own box around the canvas, not off the root:
    // anchored to the root it was offset past a toolbar whose height is
    // font-relative, so a larger root font pushed the guide below the pad.
    const surfaceBox = el("div", { class: "rui-signature-surface", style: "position:relative;display:block" });
    surfaceBox.append(surface.canvas, el("div", { class: "rui-signature-baseline", style: "bottom:14px" }));
    surface.root.append(surfaceBox);
    const hidden = valueField(asString(props.name), props.value);
    if (hidden) surface.root.append(hidden);
    if (props.clearable === undefined ? true : asBoolean(props.clearable)) {
      const bar = el("div", { class: "rui-canvas-toolbar" });
      const clearBtn = el("button", {
        type: "button",
        class: "rui-canvas-clear",
        disabled: disabled ? "" : null,
      }, ["Clear"]);
      clearBtn.onclick = (event: Event) => {
        clearPad(liveSurfaceCanvas(event, "rui-signature-pad", surface.canvas));
        helpers.invoke(props.onChange, "", 0);
      };
      bar.append(clearBtn);
      surface.root.append(bar);
    }
    return withFieldShell(surface.root, props);
  },
};
