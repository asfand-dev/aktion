/**
 * Layout & motion components (suggestions-global Parts II.2, III.2/5/6/7).
 *
 * Split / Bento layout primitives, Reveal scroll-animation, OnGesture
 * high-level gestures, Sortable/Draggable/DropZone drag-and-drop, and
 * Parallax. All bounded + theme-aware; motion honours prefers-reduced-motion.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asString, asBoolean, asNumber, sanitiseCssLength } from "../utils.js";

function renderChild(helpers: RenderHelpers, child: unknown): Node {
  if (child == null) return document.createTextNode("");
  if (Array.isArray(child)) {
    const frag = document.createDocumentFragment();
    for (const c of child) {
      if (c == null) continue;
      frag.append(typeof c === "string" ? document.createTextNode(c) : helpers.renderNode(c));
    }
    return frag;
  }
  if (typeof child === "string") return document.createTextNode(child);
  return helpers.renderNode(child);
}

/* ----------------------------------------------------------------------- *
 * Split — two-pane layout with ratio, divider, sticky pane, stack point
 * ----------------------------------------------------------------------- */

const RATIO_MAP: Record<string, string> = {
  "1/1": "1fr 1fr",
  "1/2": "1fr 2fr",
  "2/1": "2fr 1fr",
  "2/3": "2fr 3fr",
  "3/2": "3fr 2fr",
  "1/3": "1fr 3fr",
  "3/1": "3fr 1fr",
  "2/5": "2fr 5fr",
  "5/2": "5fr 2fr",
};

export const Split: ComponentSpec = {
  name: "Split",
  description:
    "Two-pane layout: a left/primary node and a right/secondary node, with a " +
    "controllable `ratio` (1/1, 3/2, 2/3…), optional `divider`, an optional " +
    "`sticky` pane that pins on scroll, and a `stackAt` breakpoint where it " +
    "collapses to a single column. The canonical 'text + media' / 'code + " +
    "preview' / 'content + sidebar' section.",
  props: [
    { name: "left", type: "Node", positional: true, required: true, aliases: ["primary"] },
    { name: "right", type: "Node", required: true, aliases: ["secondary"] },
    { name: "ratio", type: "string", optional: true, description: "Column ratio: 1/1, 3/2, 2/3, 1/3, 2/1, etc." },
    { name: "gap", type: "string", optional: true, enum: ["none", "s", "m", "l", "xl"] },
    { name: "divider", type: "boolean", optional: true },
    { name: "sticky", type: "string", optional: true, enum: ["left", "right"], description: "Pin one pane while the other scrolls" },
    { name: "stackAt", type: "string", optional: true, enum: ["sm", "md", "lg"], description: "Breakpoint below which it stacks (default md)" },
    { name: "align", type: "string", optional: true, enum: ["start", "center", "stretch"] },
  ],
  render: (_node, props, helpers) => {
    const ratio = RATIO_MAP[asString(props.ratio, "1/1")] ?? "1fr 1fr";
    const gapKey = asString(props.gap, "l");
    const gap = gapKey === "none" ? "0" : `var(--rui-spacing-${gapKey === "s" ? "s" : gapKey === "m" ? "m" : gapKey === "xl" ? "xl" : "l"})`;
    const root = el("div", {
      class: "rui-split",
      "data-divider": asBoolean(props.divider) ? "true" : null,
      "data-stack": asString(props.stackAt, "md"),
      "data-align": asString(props.align) || null,
      style: `grid-template-columns:${ratio};gap:${gap}`,
    });
    const leftPane = el("div", { class: "rui-split-pane", "data-sticky": asString(props.sticky) === "left" ? "true" : null });
    leftPane.append(renderChild(helpers, props.left));
    const rightPane = el("div", { class: "rui-split-pane", "data-sticky": asString(props.sticky) === "right" ? "true" : null });
    rightPane.append(renderChild(helpers, props.right));
    root.append(leftPane, rightPane);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Bento — asymmetric grid of varied-size cells
 * ----------------------------------------------------------------------- */

const SPAN_NAMES: Record<string, { col: number; row: number }> = {
  tile: { col: 1, row: 1 },
  wide: { col: 2, row: 1 },
  tall: { col: 1, row: 2 },
  hero: { col: 2, row: 2 },
};

/**
 * Parse the BentoCell `span` value. Accepts a named size (tile|wide|tall|
 * hero|full), a "CxR" string ("2x1", "2x2"), a bare number (column span),
 * or a `{ col, row }` object. `full` stretches across every track
 * (`grid-column: 1 / -1`) regardless of the grid's column count.
 */
function parseBentoSpan(span: unknown): { col: number; row: number; name: string | null } {
  const clampCol = (n: number): number => Math.max(1, Math.min(8, Math.round(n)));
  const clampRow = (n: number): number => Math.max(1, Math.min(4, Math.round(n)));
  if (typeof span === "number") return { col: clampCol(span), row: 1, name: null };
  if (typeof span === "string") {
    const key = span.trim().toLowerCase();
    if (key === "full") return { col: 1, row: 1, name: "full" };
    if (SPAN_NAMES[key]) return { ...SPAN_NAMES[key]!, name: key };
    const grid = /^(\d+)\s*[x×]\s*(\d+)$/.exec(key);
    if (grid) return { col: clampCol(Number(grid[1])), row: clampRow(Number(grid[2])), name: null };
    const num = Number(key);
    if (Number.isFinite(num) && num > 0) return { col: clampCol(num), row: 1, name: null };
    return { col: 1, row: 1, name: null };
  }
  if (span && typeof span === "object") {
    const s = span as { col?: unknown; row?: unknown };
    return { col: clampCol(asNumber(s.col, 1)), row: clampRow(asNumber(s.row, 1)), name: null };
  }
  return { col: 1, row: 1, name: null };
}

export const BentoCell: ComponentSpec = {
  name: "BentoCell",
  description:
    "A single cell in a Bento grid. `span` is a named size (tile|wide|tall|" +
    "hero|full), a \"CxR\" string like \"2x1\", a bare column-span number, " +
    "or `{ col, row }`. The child stretches to fill the cell.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "span", type: "string | number | object", optional: true, description: "tile|wide|tall|hero|full, \"2x1\", 2, or { col, row }" },
    { name: "rowSpan", type: "number", optional: true, description: "Rows to span (combines with a numeric/named span)" },
  ],
  render: (_node, props, helpers) => {
    let { col, row, name } = parseBentoSpan(props.span);
    if (props.rowSpan !== undefined) {
      row = Math.max(1, Math.min(4, Math.round(asNumber(props.rowSpan, row))));
    }
    // Spans live in custom properties (not grid-column directly) so the
    // stylesheet's responsive rules can collapse the grid without fighting
    // inline styles.
    const cell = el("div", {
      class: "rui-bento-cell",
      "data-span": name,
      style: `--rui-cell-col:${col};--rui-cell-row:${row}`,
    });
    cell.append(renderChild(helpers, props.child));
    return cell;
  },
};

export const Bento: ComponentSpec = {
  name: "Bento",
  description:
    "Asymmetric 'bento box' grid where cells span varied widths/heights — " +
    "the marquee feature-section layout. Children should be BentoCell nodes " +
    "(plain nodes are treated as 1×1). `columns` sets the track count " +
    "(default 6), `rowHeight` sizes the implicit rows so `tall`/`hero` " +
    "cells actually grow, and `dense` (default true) backfills gaps. " +
    "Collapses to 2 columns below 920px and 1 below 640px.",
  props: [
    { name: "items", type: "BentoCell[]", positional: true, required: true, aliases: ["children", "cells"] },
    { name: "columns", type: "number", optional: true, description: "Track count 1–8 (default 6)" },
    { name: "gap", type: "string", optional: true, enum: ["s", "m", "l", "xl"] },
    { name: "rowHeight", type: "string", optional: true, description: "grid-auto-rows track size (CSS length, default minmax(110px, auto))" },
    { name: "dense", type: "boolean", optional: true, description: "Backfill holes with later cells (default true)" },
  ],
  render: (_node, props, helpers) => {
    const cols = Math.max(1, Math.min(8, Math.round(asNumber(props.columns, 6))));
    const gapRaw = asString(props.gap, "m");
    const gapKey = ["s", "m", "l", "xl"].includes(gapRaw) ? gapRaw : "m";
    const rowHeight = sanitiseCssLength(props.rowHeight, "");
    const dense = props.dense === undefined ? true : asBoolean(props.dense);
    const root = el("div", {
      class: "rui-bento",
      "data-cols": String(cols),
      "data-gap": gapKey,
      "data-dense": dense ? "true" : null,
      style: rowHeight ? `--rui-bento-row:${rowHeight}` : null,
    });
    for (const item of asArray(props.items)) {
      const rendered = helpers.renderNode(item);
      // Clamp column spans to the track count so a hero/numeric span can
      // never overflow into implicit columns and break the grid.
      if (rendered instanceof HTMLElement && rendered.classList.contains("rui-bento-cell")) {
        const span = Number.parseInt(rendered.style.getPropertyValue("--rui-cell-col"), 10);
        if (Number.isFinite(span) && span > cols) rendered.style.setProperty("--rui-cell-col", String(cols));
      }
      root.append(rendered);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Reveal — animate a child in once it scrolls into view
 * ----------------------------------------------------------------------- */

const REVEAL_PRESETS = new Set(["fade", "fade-up", "fade-down", "fade-left", "fade-right", "zoom", "slide-up"]);

export const Reveal: ComponentSpec = {
  name: "Reveal",
  description:
    "Animates its child in the first time it scrolls into view (scroll " +
    "choreography). `animation` is a preset (fade-up|fade|zoom|…), `delay` " +
    "staggers it (ms), `once` (default true) plays a single time. Honours " +
    "prefers-reduced-motion (renders immediately).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "animation", type: "string", optional: true, enum: [...REVEAL_PRESETS] },
    { name: "delay", type: "number", optional: true, description: "Stagger delay in ms" },
    { name: "once", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const preset = asString(props.animation, "fade-up");
    const anim = REVEAL_PRESETS.has(preset) ? preset : "fade-up";
    const delay = Math.max(0, Math.min(5000, asNumber(props.delay, 0)));
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The revealed flag lives in instance state so EVERY render (including
    // fresh trees the morph syncs onto the live DOM) emits the class.
    // Without it, the first unrelated state change after the reveal strips
    // `is-revealed` during attribute sync and pops the content invisible.
    const revealed = helpers.useInstanceState<boolean>("rui-reveal-shown", false);
    const shownNow = revealed.get() || reduce || typeof IntersectionObserver === "undefined";
    const wrapper = el("div", {
      class: shownNow ? "rui-reveal is-revealed" : "rui-reveal",
      "data-anim": anim,
      style: delay ? `transition-delay:${delay}ms` : null,
    });
    wrapper.append(renderChild(helpers, props.child));
    if (shownNow && (props.once === undefined ? true : asBoolean(props.once))) return wrapper;
    if (reduce || typeof IntersectionObserver === "undefined") return wrapper;

    const once = props.once === undefined ? true : asBoolean(props.once);
    setTimeout(() => {
      // Only the committed element wires an observer — fresh trees the
      // morph discarded are never connected and skip themselves here (which
      // also keeps the keyed disposer from cancelling the live observer).
      if (!wrapper.isConnected) return;
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            revealed.set(true);
            (e.target as HTMLElement).classList.add("is-revealed");
            if (once) { io.disconnect(); return; }
          } else if (!once) {
            revealed.set(false);
            (e.target as HTMLElement).classList.remove("is-revealed");
          }
        }
      }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
      io.observe(wrapper);
      helpers.registerDisposer(() => io.disconnect(), "rui-reveal-io");
    }, 0);
    return wrapper;
  },
};

/* ----------------------------------------------------------------------- *
 * OnGesture — high-level pointer gestures
 * ----------------------------------------------------------------------- */

/**
 * Per-element gesture tracking, keyed by the LIVE wrapper element. Handlers
 * are property-based (`onpointerdown = …`) so the morph reconciler swaps in
 * fresh closures on every re-render — which means closure-local variables
 * would reset mid-gesture (a `pan` that writes state re-renders while the
 * pointer is still down). Keeping the in-flight gesture on the element via
 * a WeakMap survives those handler swaps.
 */
interface GestureTracking {
  x: number;
  y: number;
  lastTap: number;
  longTimer: ReturnType<typeof setTimeout> | null;
  longFired: boolean;
}

const GESTURE_STATE = new WeakMap<HTMLElement, GestureTracking>();

function gestureState(host: HTMLElement): GestureTracking {
  let state = GESTURE_STATE.get(host);
  if (!state) {
    state = { x: 0, y: 0, lastTap: 0, longTimer: null, longFired: false };
    GESTURE_STATE.set(host, state);
  }
  return state;
}

function clearLongPress(state: GestureTracking): void {
  if (state.longTimer) { clearTimeout(state.longTimer); state.longTimer = null; }
}

export const OnGesture: ComponentSpec = {
  name: "OnGesture",
  description:
    "Attach high-level pointer gestures to any component without raw DOM: " +
    "`swipe(dir)` (left/right/up/down), `longPress()`, `doubleTap()`, and " +
    "`pan({dx, dy})`. Powers swipe-to-dismiss, pull-to-refresh, carousels, " +
    "and drag affordances on touch + mouse.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "swipe", type: "callable", optional: true, aliases: ["onSwipe"], description: "(dir) => … — fired on a swipe; dir is left|right|up|down" },
    { name: "longPress", type: "callable", optional: true, aliases: ["onLongPress"] },
    { name: "doubleTap", type: "callable", optional: true, aliases: ["onDoubleTap"] },
    { name: "pan", type: "callable", optional: true, aliases: ["onPan"], description: "({dx, dy}) => … — fired during a drag" },
    { name: "threshold", type: "number", optional: true, description: "Swipe distance in px (default 40)" },
  ],
  render: (_node, props, helpers) => {
    // `pan` needs the full pointer stream; otherwise leave vertical panning
    // to the browser so the page still scrolls over the surface.
    const wrap = el("div", { class: "rui-gesture", style: `touch-action:${props.pan != null ? "none" : "pan-y"}` });
    wrap.append(renderChild(helpers, props.child));
    const threshold = Math.max(8, asNumber(props.threshold, 40));
    const liveHost = (e: PointerEvent): HTMLElement => (e.currentTarget as HTMLElement | null) ?? wrap;

    wrap.onpointerdown = (e: PointerEvent) => {
      const host = liveHost(e);
      const state = gestureState(host);
      state.x = e.clientX;
      state.y = e.clientY;
      state.longFired = false;
      clearLongPress(state);
      // Capture so the gesture completes even when the pointer leaves the
      // element mid-swipe (the common case for fast mouse swipes).
      try { host.setPointerCapture(e.pointerId); } catch { /* already released */ }
      if (props.longPress != null) {
        state.longTimer = setTimeout(() => {
          state.longTimer = null;
          // The element may have unmounted while the press was held.
          if (!host.isConnected) return;
          state.longFired = true;
          helpers.invoke(props.longPress);
        }, 500);
      }
    };
    wrap.onpointermove = (e: PointerEvent) => {
      const state = gestureState(liveHost(e));
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) clearLongPress(state);
      if (props.pan != null && (e.buttons & 1)) helpers.invoke(props.pan, { dx, dy });
    };
    wrap.onpointerup = (e: PointerEvent) => {
      const state = gestureState(liveHost(e));
      clearLongPress(state);
      if (state.longFired) { state.longFired = false; state.lastTap = 0; return; }
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (props.swipe != null && (adx > threshold || ady > threshold)) {
        const dir = adx > ady ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
        state.lastTap = 0;
        helpers.invoke(props.swipe, dir);
        return;
      }
      if (props.doubleTap != null && adx < 8 && ady < 8) {
        const now = Date.now();
        if (now - state.lastTap < 300) { state.lastTap = 0; helpers.invoke(props.doubleTap); }
        else state.lastTap = now;
      }
    };
    wrap.onpointercancel = (e: PointerEvent) => {
      const state = gestureState(liveHost(e));
      clearLongPress(state);
      state.longFired = false;
    };
    return wrap;
  },
};

/* ----------------------------------------------------------------------- *
 * Sortable — reorderable list via native HTML drag-and-drop
 * ----------------------------------------------------------------------- */

export const Sortable: ComponentSpec = {
  name: "Sortable",
  description:
    "A vertical list whose items can be drag-reordered. Pass already-rendered " +
    "`items`; `onReorder(fromIndex, toIndex)` fires after a drop so you can " +
    "reorder the backing reactive array. Works with mouse + touch.",
  props: [
    { name: "items", type: "Node[]", positional: true, required: true, aliases: ["children"] },
    { name: "onReorder", type: "callable", optional: true, description: "(fromIndex, toIndex) => …" },
    { name: "handle", type: "boolean", optional: true, description: "Show a drag handle on each row (default true)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-sortable" });
    const showHandle = props.handle === undefined ? true : asBoolean(props.handle);
    // Property-based handlers (NOT addEventListener) so the morph copies the
    // fresh closures onto kept rows — and indices are read from the LIVE DOM
    // at event time, so a reorder + re-render can never fire with stale ones.
    const liveRow = (e: Event): HTMLElement | null =>
      ((e.currentTarget ?? e.target) as HTMLElement | null)?.closest?.(".rui-sortable-item") ?? null;
    const indexOf = (row: HTMLElement | null): number => {
      const n = Number(row?.getAttribute("data-index"));
      return Number.isFinite(n) ? n : -1;
    };
    asArray<unknown>(props.items).forEach((item, index) => {
      const row = el("div", { class: "rui-sortable-item", draggable: "true", "data-index": String(index) });
      if (showHandle) {
        const h = el("span", { class: "rui-sortable-handle", "aria-hidden": "true" });
        h.append(el("i", { class: "rui-icon fa-solid fa-grip-vertical" }));
        row.append(h);
      }
      const body = el("div", { class: "rui-sortable-body" });
      body.append(helpers.renderNode(item));
      row.append(body);
      row.ondragstart = (e: DragEvent) => {
        const live = liveRow(e);
        live?.classList.add("is-dragging");
        const container = live?.closest(".rui-sortable") as HTMLElement | null;
        container?.setAttribute("data-drag-from", String(indexOf(live)));
      };
      row.ondragend = (e: DragEvent) => {
        const live = liveRow(e);
        live?.classList.remove("is-dragging");
        (live?.closest(".rui-sortable") as HTMLElement | null)?.removeAttribute("data-drag-from");
      };
      row.ondragover = (e: DragEvent) => { e.preventDefault(); liveRow(e)?.classList.add("is-over"); };
      row.ondragleave = (e: DragEvent) => liveRow(e)?.classList.remove("is-over");
      row.ondrop = (e: DragEvent) => {
        e.preventDefault();
        const live = liveRow(e);
        live?.classList.remove("is-over");
        const container = live?.closest(".rui-sortable") as HTMLElement | null;
        const from = Number(container?.getAttribute("data-drag-from"));
        const to = indexOf(live);
        container?.removeAttribute("data-drag-from");
        if (Number.isFinite(from) && from >= 0 && to >= 0 && from !== to) helpers.invoke(props.onReorder, from, to);
      };
      root.append(row);
    });
    return root;
  },
};

export const Draggable: ComponentSpec = {
  name: "Draggable",
  description: "Makes its child draggable, carrying a `data` payload picked up by a DropZone. `onDragStart`/`onDragEnd` optional.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "data", type: "any", optional: true, description: "Payload (stringified) handed to the DropZone" },
    { name: "onDragStart", type: "callable", optional: true },
    { name: "onDragEnd", type: "callable", optional: true },
  ],
  render: (_node, props, helpers) => {
    const wrap = el("div", { class: "rui-draggable", draggable: "true" });
    wrap.append(renderChild(helpers, props.child));
    // Property handlers (morph contract) + live-node class toggles.
    wrap.ondragstart = (e: DragEvent) => {
      try { e.dataTransfer?.setData("text/plain", typeof props.data === "string" ? props.data : JSON.stringify(props.data ?? null)); } catch { /* ignore */ }
      ((e.currentTarget ?? e.target) as HTMLElement | null)?.classList.add("is-dragging");
      helpers.invoke(props.onDragStart, props.data);
    };
    wrap.ondragend = (e: DragEvent) => {
      ((e.currentTarget ?? e.target) as HTMLElement | null)?.classList.remove("is-dragging");
      helpers.invoke(props.onDragEnd);
    };
    return wrap;
  },
};

export const DropZone: ComponentSpec = {
  name: "DropZone",
  description: "A target that accepts a Draggable. `onDrop(data)` receives the dropped payload (parsed JSON when possible).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onDrop", type: "callable", optional: true },
    { name: "label", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const zone = el("div", { class: "rui-dropzone" });
    if (props.child != null) zone.append(renderChild(helpers, props.child));
    else if (asString(props.label)) zone.append(el("span", { class: "rui-dropzone-label" }, [asString(props.label)]));
    const liveZone = (e: Event): HTMLElement | null => ((e.currentTarget ?? e.target) as HTMLElement | null)?.closest?.(".rui-dropzone") ?? null;
    zone.ondragover = (e: DragEvent) => { e.preventDefault(); liveZone(e)?.classList.add("is-over"); };
    zone.ondragleave = (e: DragEvent) => liveZone(e)?.classList.remove("is-over");
    zone.ondrop = (e: DragEvent) => {
      e.preventDefault();
      liveZone(e)?.classList.remove("is-over");
      const raw = e.dataTransfer?.getData("text/plain") ?? "";
      let data: unknown = raw;
      try { data = JSON.parse(raw); } catch { /* keep raw string */ }
      helpers.invoke(props.onDrop, data);
    };
    return zone;
  },
};

/* ----------------------------------------------------------------------- *
 * Parallax — translate a child as the page scrolls
 * ----------------------------------------------------------------------- */

export const Parallax: ComponentSpec = {
  name: "Parallax",
  description:
    "Translates its child vertically as the page scrolls for a depth effect. " +
    "`speed` (−1…1) sets intensity/direction. Honours prefers-reduced-motion.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "speed", type: "number", optional: true, description: "−1…1 (default 0.3)" },
  ],
  render: (_node, props, helpers) => {
    const wrap = el("div", { class: "rui-parallax", style: "will-change:transform" });
    wrap.append(renderChild(helpers, props.child));
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof window === "undefined") return wrap;
    const speed = Math.max(-1, Math.min(1, asNumber(props.speed, 0.3)));
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = wrap.getBoundingClientRect();
      const viewportH = window.innerHeight || 800;
      const center = rect.top + rect.height / 2 - viewportH / 2;
      wrap.style.transform = `translateY(${(-center * speed).toFixed(1)}px)`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    setTimeout(update, 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Keyed: re-renders swap the window listeners instead of accumulating
    // a fresh pair per render (anonymous disposers only run on unmount).
    helpers.registerDisposer(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    }, "rui-parallax");
    return wrap;
  },
};

/* ----------------------------------------------------------------------- *
 * ReadingProgress — top-of-page scroll progress bar
 * ----------------------------------------------------------------------- */

export const ReadingProgress: ComponentSpec = {
  name: "ReadingProgress",
  description: "A thin progress bar that fills as the page scrolls — article/docs reading affordance. Optional gradient fill.",
  props: [
    { name: "gradient", type: "boolean", optional: true },
    { name: "height", type: "string", optional: true, description: "Bar thickness (CSS length, default 3px)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-reading-progress", style: `height:${sanitiseCssLength(props.height, "3px")}` });
    const bar = el("div", { class: "rui-reading-progress-bar", "data-gradient": asBoolean(props.gradient) ? "true" : null });
    root.append(bar);
    if (typeof window === "undefined") return root;
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = (doc.scrollHeight - doc.clientHeight) || 1;
      const pct = Math.max(0, Math.min(100, (doc.scrollTop / max) * 100));
      bar.style.width = `${pct}%`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    setTimeout(update, 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    helpers.registerDisposer(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    }, "rui-reading-progress");
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Transition — enter/exit animation gated by a `show` boolean (III.3)
 * ----------------------------------------------------------------------- */

const TRANSITION_PRESETS = new Set(["fade", "scale", "slide-up", "slide-down", "slide-left", "slide-right"]);

interface TransitionState { mounted: boolean }

export const Transition: ComponentSpec = {
  name: "Transition",
  description:
    "Animates its child IN when `show` becomes true and OUT when it becomes " +
    "false (mount/unmount choreography) — modals, toasts, dropdowns, list " +
    "rows. `preset` is fade|scale|slide-up|slide-down|slide-left|slide-right, " +
    "`duration` is ms. The child stays mounted through the exit animation, " +
    "then is removed. Honours prefers-reduced-motion (instant swap).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "show", type: "boolean", description: "Whether the child is visible" },
    { name: "preset", type: "string", optional: true, enum: [...TRANSITION_PRESETS] },
    { name: "duration", type: "number", optional: true, description: "Animation duration in ms (default 280)" },
  ],
  render: (_node, props, helpers) => {
    const show = asBoolean(props.show);
    const presetRaw = asString(props.preset, "fade");
    const preset = TRANSITION_PRESETS.has(presetRaw) ? presetRaw : "fade";
    const duration = Math.max(0, Math.min(5000, asNumber(props.duration, 280)));
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const slot = helpers.useInstanceState<TransitionState>("rui-transition", { mounted: false });
    const wasMounted = slot.get().mounted;

    const wrapper = el("div", {
      class: "rui-transition",
      "data-preset": preset,
      style: `--rui-transition-ms:${duration}ms`,
    });
    const setState = (s: "enter" | "exit"): void => wrapper.setAttribute("data-state", s);
    const flip = (to: "enter" | "exit"): void => {
      if (reduce || typeof requestAnimationFrame === "undefined") { setState(to); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => setState(to)));
    };

    if (show) {
      wrapper.append(renderChild(helpers, props.child));
      setState(wasMounted ? "enter" : "exit");
      if (!wasMounted) flip("enter");
      slot.set({ mounted: true });
      return wrapper;
    }

    // show === false
    if (wasMounted && duration > 0 && !reduce) {
      // Keep the child mounted, animate it out, then remove it.
      wrapper.append(renderChild(helpers, props.child));
      setState("enter");
      flip("exit");
      const t = setTimeout(() => wrapper.replaceChildren(), duration);
      helpers.registerDisposer(() => clearTimeout(t), "rui-transition-exit");
    } else {
      setState("exit");
    }
    slot.set({ mounted: false });
    return wrapper;
  },
};

/* ----------------------------------------------------------------------- *
 * FlipList — animate list reordering with the FLIP technique (III.4)
 * ----------------------------------------------------------------------- */

export const FlipList: ComponentSpec = {
  name: "FlipList",
  description:
    "Smoothly animates its children when they reorder, are added, or removed " +
    "(the FLIP technique — First/Last/Invert/Play). Wrap a keyed list whose " +
    "order changes (drag-sort, filter, sort toggle) so items glide to their " +
    "new positions instead of jumping. `duration` is ms. Honours " +
    "prefers-reduced-motion (no animation). Use stable `key:`s on the items so " +
    "their DOM nodes persist across the reorder.",
  props: [
    { name: "children", type: "Node[]", description: "The list items (use stable keys)" },
    { name: "duration", type: "number", optional: true, description: "Animation duration in ms (default 300)" },
  ],
  render: (_node, props, helpers) => {
    const duration = Math.max(0, Math.min(2000, asNumber(props.duration, 300)));
    const root = el("div", { class: "rui-flip-list" });
    for (const child of asArray(props.children)) root.append(renderChild(helpers, child));

    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof requestAnimationFrame === "undefined" || typeof MutationObserver === "undefined") return root;

    // The morph reconciler keeps the FIRST render's root element and patches
    // later renders onto it (including keyed reorders, which fire childList
    // mutations). So the FLIP observer must attach exactly ONCE — to this
    // first root — and stay live across re-renders. A per-instance flag guards
    // re-setup; later renders return their root without re-observing (morph
    // discards them anyway).
    const setup = helpers.useInstanceState<{ done: boolean }>("rui-flip-setup", { done: false });
    if (setup.get().done) return root;
    setup.set({ done: true });

    // Cache each live child node's resting position. Keyed by DOM identity, so
    // it relies on the morph reconciler preserving nodes for keyed items.
    const positions = new WeakMap<Element, { left: number; top: number }>();
    const seed = (): void => {
      for (const child of Array.from(root.children)) {
        const r = (child as HTMLElement).getBoundingClientRect();
        positions.set(child, { left: r.left, top: r.top });
      }
    };
    const runFlip = (): void => {
      const kids = Array.from(root.children) as HTMLElement[];
      const rects = kids.map((k) => k.getBoundingClientRect());
      kids.forEach((child, i) => {
        const prev = positions.get(child);
        const rect = rects[i]!;
        if (prev) {
          const dx = prev.left - rect.left;
          const dy = prev.top - rect.top;
          if (dx !== 0 || dy !== 0) {
            child.style.transition = "none";
            child.style.transform = `translate(${dx}px, ${dy}px)`;
            requestAnimationFrame(() => {
              child.style.transition = `transform ${duration}ms cubic-bezier(.22,1,.36,1)`;
              child.style.transform = "";
            });
          }
        }
      });
      // Cache the new resting positions (measured before the invert transform).
      kids.forEach((child, i) => positions.set(child, { left: rects[i]!.left, top: rects[i]!.top }));
    };

    let raf = 0;
    const observer = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; runFlip(); });
    });
    setTimeout(() => { seed(); observer.observe(root, { childList: true }); }, 0);
    helpers.registerDisposer(() => { observer.disconnect(); if (raf) cancelAnimationFrame(raf); }, "rui-flip-list");
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * RouteView — animate page changes inside a router (IV.4)
 * ----------------------------------------------------------------------- */

const ROUTE_ANIMS = new Set(["fade", "fade-up", "fade-down", "fade-left", "fade-right", "zoom", "slide-up"]);

export const RouteView: ComponentSpec = {
  name: "RouteView",
  description:
    "Wraps a router's output so the page animates whenever the route changes. " +
    "Pass `routeKey: route.path` so it knows when to replay the entrance " +
    "animation; `animation` is fade|fade-up|zoom|… and `duration` is ms. Works " +
    "by swapping a keyed inner wrapper, so the fresh page element plays its CSS " +
    "entrance on mount. Honours prefers-reduced-motion.",
  props: [
    { name: "children", type: "Node", positional: true, required: true, description: "The $router(...) result" },
    { name: "routeKey", type: "string", description: "Pass route.path so the view animates on change" },
    { name: "animation", type: "string", optional: true, enum: [...ROUTE_ANIMS] },
    { name: "duration", type: "number", optional: true, description: "Animation duration in ms (default 300)" },
  ],
  render: (_node, props, helpers) => {
    const animRaw = asString(props.animation, "fade");
    const animation = ROUTE_ANIMS.has(animRaw) ? animRaw : "fade";
    const duration = Math.max(0, Math.min(2000, asNumber(props.duration, 300)));
    const routeKey = asString(props.routeKey, "page") || "page";
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = el("div", { class: "rui-route-view" });
    // The keyed inner wrapper: when `routeKey` changes the morph reconciler
    // swaps in a FRESH element (different data-rui-key), which replays the CSS
    // entrance animation automatically on mount — no JS timing needed.
    const page = el("div", {
      class: "rui-route-page",
      "data-rui-key": routeKey,
      "data-anim": reduce ? null : animation,
      style: reduce ? null : `--rui-route-ms:${duration}ms`,
    });
    page.append(renderChild(helpers, props.children));
    root.append(page);
    return root;
  },
};
