/**
 * Layout & motion components (suggestions-global Parts II.2, III.2/5/6/7).
 *
 * Split / Bento layout primitives, Reveal scroll-animation, OnGesture
 * high-level gestures, Sortable/Draggable/DropZone drag-and-drop, and
 * Parallax. All bounded + theme-aware; motion honours prefers-reduced-motion.
 *
 * ## Two rules every component in here follows
 *
 * 1. **Transient visual state (`is-dragging`, `is-over`, a parallax offset, a
 *    progress width) is never *only* in the DOM.** morph rebuilds `class` and
 *    `style` from the freshly-rendered tree and strips attributes that tree
 *    omits, so a `classList.add` / `style.transform` written by an event handler
 *    is erased by the next unrelated re-render — mid-drag, mid-scroll. Every
 *    such value therefore lives in `helpers.useInstanceState` AND is emitted by
 *    `render`; handlers write both the slot and the live node (instance-state
 *    writes do not schedule a render, so the live write is what the user sees).
 * 2. **Anything asynchronous resolves the LIVE node.** Observers, scroll
 *    listeners and timers are installed from `deferToPaint` behind an
 *    `isConnected` guard, so only the committed render wires them up and the
 *    keyed disposer can never tear down the working listener in favour of a
 *    closure over a discarded snapshot.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, classNames,
  sanitiseCssLength, sanitiseCssColor, SPACING_TOKENS, normalizeSpacingToken, spacingCssValue,
  readResponsiveProp, RESPONSIVE_BREAKPOINTS,
} from "../utils.js";
import { deferToPaint } from "../floating.js";

/**
 * Walk up out of the component, hopping shadow boundaries, so scroll-aware
 * components can find the container that actually scrolls them. `parentElement`
 * stops dead at a shadow root, and every Aktion app lives in one.
 */
function ancestorOf(node: HTMLElement): HTMLElement | null {
  const parent = node.parentElement;
  if (parent) return parent;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
}

/**
 * Nearest ancestor that scrolls `node` vertically, or null when the page itself
 * owns the scroll. Used by ReadingProgress (to measure the right thing) and
 * RouteView (to reset the right thing on navigation).
 */
function nearestScrollable(node: HTMLElement): HTMLElement | null {
  if (typeof getComputedStyle !== "function") return null;
  let cur = ancestorOf(node);
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")
      && cur.scrollHeight > cur.clientHeight + 1) return cur;
    cur = ancestorOf(cur);
  }
  return null;
}

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

/**
 * Resolve `ratio` into a `grid-template-columns` value.
 *
 * The named table above only covers nine splits, and the prop's own
 * description ends in "etc." — so `"60/40"`, `"70/30"` and `"1:2"` were all
 * natural guesses that validated cleanly and then silently rendered an even
 * split. Any `a/b` (or `a:b`) pair is therefore parsed into `${a}fr ${b}fr`,
 * which produces exactly the same layout as the named entries for the values
 * they cover.
 */
const RATIO_PAIR = /^(\d{1,3}(?:\.\d{1,2})?)\s*[/:]\s*(\d{1,3}(?:\.\d{1,2})?)$/;
function resolveRatio(raw: unknown): string {
  const key = asString(raw, "1/1").trim();
  const named = RATIO_MAP[key];
  if (named) return named;
  const pair = RATIO_PAIR.exec(key);
  if (pair) {
    const left = Number(pair[1]);
    const right = Number(pair[2]);
    if (left > 0 && right > 0) return `${left}fr ${right}fr`;
  }
  return "1fr 1fr";
}

export const Split: ComponentSpec = {
  name: "Split",
  description:
    "Two-pane layout: a left/primary node and a right/secondary node, with a " +
    "controllable `ratio` (1/1, 3/2, 2/3 — or any `a/b` pair like \"60/40\"), " +
    "optional `divider`, an optional `sticky` pane that pins on scroll " +
    "(`stickyOffset` sets how far below the top it pins), and a `stackAt` " +
    "breakpoint where it collapses to a single column — `reverseOnStack` puts " +
    "the right pane first once stacked, the usual want for 'text + media'. The " +
    "canonical 'text + media' / 'code + preview' / 'content + sidebar' section.",
  props: [
    { name: "left", type: "Node", positional: true, required: true, aliases: ["primary"] },
    { name: "right", type: "Node", required: true, aliases: ["secondary"] },
    { name: "ratio", type: "string", optional: true, description: "Column ratio — a named split (1/1, 3/2, 2/3, 1/3, 2/1…) or any `a/b` pair, e.g. \"60/40\"" },
    { name: "gap", type: "string", optional: true, enum: SPACING_TOKENS },
    { name: "divider", type: "boolean", optional: true },
    { name: "sticky", type: "string", optional: true, enum: ["left", "right"], description: "Pin one pane while the other scrolls" },
    { name: "stickyOffset", type: "string", optional: true, description: "How far below the viewport top the sticky pane pins (CSS length, default 88px) — set it to your header height" },
    { name: "stackAt", type: "string", optional: true, enum: ["sm", "md", "lg"], description: "Breakpoint below which it stacks: sm 640px, md 768px, lg 1024px (default md)" },
    { name: "reverseOnStack", type: "boolean", optional: true, description: "Show the right pane FIRST once stacked (media-above-text on mobile)" },
    { name: "align", type: "string", optional: true, enum: ["start", "center", "stretch"] },
  ],
  render: (_node, props, helpers) => {
    const ratio = resolveRatio(props.ratio);
    const gap = spacingCssValue(asString(props.gap, "lg")) || "var(--rui-spacing-l)";
    const root = el("div", {
      class: "rui-split",
      "data-divider": asBoolean(props.divider) ? "true" : null,
      "data-stack": asString(props.stackAt, "md"),
      "data-reverse-stack": asBoolean(props.reverseOnStack) ? "true" : null,
      "data-align": asString(props.align) || null,
      style: `grid-template-columns:${ratio};gap:${gap}`,
    });
    // The stylesheet's sticky offset is a fixed 88px, which only suits an 88px
    // header; an inline `top` lets any app pin the pane under its own chrome.
    const stickyTop = sanitiseCssLength(props.stickyOffset, "");
    const paneStyle = (sticky: boolean): string | null =>
      (sticky && stickyTop ? `top:${stickyTop}` : null);
    const leftSticky = asString(props.sticky) === "left";
    const rightSticky = asString(props.sticky) === "right";
    const leftPane = el("div", { class: "rui-split-pane", "data-sticky": leftSticky ? "true" : null, style: paneStyle(leftSticky) });
    leftPane.append(renderChild(helpers, props.left));
    const rightPane = el("div", { class: "rui-split-pane", "data-sticky": rightSticky ? "true" : null, style: paneStyle(rightSticky) });
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

/**
 * Reduce any span to one of the four named buckets (plus `full`).
 *
 * `data-span` is what the responsive stylesheet keys off — below 920px every
 * cell collapses to `span 1` except `wide`/`hero`/`full`, which take the whole
 * row. Emitting it only for spans the author happened to spell as a NAME meant
 * `span: "2x1"` and `span: 2` collapsed to a half-width tile while the
 * identical `span: "wide"` went full-width: two documented spellings of the
 * same span, two different mobile layouts.
 */
function canonicalSpanName(col: number, row: number, name: string | null): string {
  if (name === "full") return "full";
  if (col >= 2) return row >= 2 ? "hero" : "wide";
  return row >= 2 ? "tall" : "tile";
}

/**
 * Every `span` spelling the parser accepts, so the validator can reject a typo
 * (`span: "big"`) instead of silently rendering a 1×1 tile. Names first, then
 * the `CxR` grid (columns clamp at 8, rows at 4) and the bare column counts.
 */
const BENTO_SPAN_VALUES: readonly string[] = [
  ...Object.keys(SPAN_NAMES), "full",
  ...Array.from({ length: 8 }, (_, c) =>
    Array.from({ length: 4 }, (_, r) => `${c + 1}x${r + 1}`)).flat(),
  ...Array.from({ length: 8 }, (_, c) => String(c + 1)),
];

export const BentoCell: ComponentSpec = {
  name: "BentoCell",
  description:
    "A single cell in a Bento grid. `span` names a size — `tile` 1×1, " +
    "`wide` 2×1 (2 columns), `tall` 1×2 (2 rows), `hero` 2×2, `full` (a " +
    "whole row) — or use a \"CxR\" string (\"2x1\"), a bare column-span " +
    "number, or `{ col, row }`; `rowSpan` adds rows to a named/numeric " +
    "span. The child stretches to fill the cell, so images/cards crop to " +
    "the cell's shape. Pick spans that tile the parent Bento with no " +
    "leftover tracks.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "span", type: "string | number | object", optional: true, enum: BENTO_SPAN_VALUES, description: "tile (1×1) | wide (2×1) | tall (1×2) | hero (2×2) | full (whole row), \"2x1\", 2, or { col, row }" },
    { name: "rowSpan", type: "number", optional: true, description: "Rows to span (combines with a numeric/named span)" },
  ],
  render: (_node, props, helpers) => {
    let { col, row, name } = parseBentoSpan(props.span);
    if (props.rowSpan !== undefined) {
      row = Math.max(1, Math.min(4, Math.round(asNumber(props.rowSpan, row))));
    }
    // Spans live in custom properties (not grid-column directly) so the
    // stylesheet's responsive rules can collapse the grid without fighting
    // inline styles. `data-span` is always canonical so those rules treat
    // every spelling of the same span identically — see canonicalSpanName.
    const cell = el("div", {
      class: "rui-bento-cell",
      "data-span": canonicalSpanName(col, row, name),
      style: `--rui-cell-col:${col};--rui-cell-row:${row}`,
    });
    cell.append(renderChild(helpers, props.child));
    return cell;
  },
};

/**
 * Give a plain (non-BentoCell) child the cell contract the Bento description
 * promises it. `.rui-bento-cell` is what carries `min-width: 0` (so a table or
 * an unbreakable URL cannot push the grid wider than its container), the
 * stretch-to-fill that keeps the mosaic even, and the ≤920px collapse — a bare
 * grid item gets none of it.
 */
function ensureBentoCell(rendered: Node): Node {
  if (rendered instanceof HTMLElement && rendered.classList.contains("rui-bento-cell")) return rendered;
  const cell = el("div", {
    class: "rui-bento-cell",
    "data-span": "tile",
    style: "--rui-cell-col:1;--rui-cell-row:1",
  });
  // Carry any author `key:` up to the wrapper, or the morph reconciler loses
  // the identity it uses to move (rather than rebuild) a reordered child.
  if (rendered instanceof HTMLElement) {
    const key = rendered.getAttribute("data-rui-key");
    if (key != null) cell.setAttribute("data-rui-key", key);
  }
  cell.append(rendered);
  return cell;
}

export const Bento: ComponentSpec = {
  name: "Bento",
  description:
    "Asymmetric 'bento box' grid — the marquee feature-section layout. " +
    "Children must be BentoCell nodes (a plain node becomes a 1×1 tile). " +
    "Two rules make it look right: (1) spans must tile the grid exactly — " +
    "each row's column spans sum to `columns` and row-spans pair up with " +
    "neighbouring cells, never leaving a dangling track (e.g. `columns: 3` " +
    "with 4 cells: hero 2×2 + tall 1×2 fill rows 1–2, wide 2×1 + tile fill " +
    "row 3); (2) set a fixed `rowHeight` (e.g. \"180px\") whenever cells " +
    "hold images or cards — the default auto row stretches to the tallest " +
    "cell and makes the mosaic ragged. Give 1–2 standout cells a big span " +
    "(hero/wide/tall) and keep the rest 1×1 tiles. `dense` (default true) " +
    "backfills gaps. Collapses to 2 columns below 920px and 1 below 640px.",
  props: [
    { name: "items", type: "BentoCell[]", positional: true, required: true, aliases: ["children", "cells"] },
    { name: "columns", type: "number", optional: true, description: "Track count 1–8 (default 6) — pick it so the cell spans in every row can sum to it" },
    { name: "gap", type: "string", optional: true, enum: SPACING_TOKENS },
    { name: "rowHeight", type: "string | object", optional: true, description: "Fixed row track size, e.g. \"180px\" — set it whenever any cell spans rows or holds images (default minmax(110px, auto) stretches rows to content). May be a responsive map like `{base: \"220px\", md: \"180px\"}` since the same track is far too short once the grid collapses to one column" },
    { name: "dense", type: "boolean", optional: true, description: "Backfill holes with later cells (default true)" },
  ],
  render: (_node, props, helpers) => {
    const cols = Math.max(1, Math.min(8, Math.round(asNumber(props.columns, 6))));
    const gapKey = normalizeSpacingToken(props.gap, "md");
    const dense = props.dense === undefined ? true : asBoolean(props.dense);
    const attrs: Record<string, string | null> = {
      class: "rui-bento",
      "data-cols": String(cols),
      "data-gap": gapKey,
      "data-dense": dense ? "true" : null,
    };
    // A row height that reads correctly across six desktop tracks is far too
    // short for the same cell at full mobile width, so `rowHeight` takes the
    // same responsive maps Grid/Stack accept.
    const styleParts: string[] = [];
    const rowHeight = readResponsiveProp<string>(props.rowHeight);
    if (rowHeight.kind === "single") {
      const len = sanitiseCssLength(rowHeight.value, "");
      if (len) styleParts.push(`--rui-bento-row:${len}`);
    } else {
      attrs["data-responsive-row"] = "true";
      for (const bp of RESPONSIVE_BREAKPOINTS) {
        const len = sanitiseCssLength(rowHeight.values[bp], "");
        if (len) styleParts.push(`--rui-bento-row-${bp}:${len}`);
      }
    }
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const item of asArray(props.items)) {
      const rendered = ensureBentoCell(helpers.renderNode(item));
      // Clamp column spans to the track count so a hero/numeric span can
      // never overflow into implicit columns and break the grid.
      if (rendered instanceof HTMLElement) {
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
    "staggers it (ms), `duration` sets the animation length (default 600ms), " +
    "`threshold` how much of it must be visible to trigger (0–1, default " +
    "0.15), `once` (default true) plays a single time. Honours " +
    "prefers-reduced-motion (renders immediately).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "animation", type: "string", optional: true, enum: [...REVEAL_PRESETS] },
    { name: "delay", type: "number", optional: true, description: "Stagger delay in ms" },
    { name: "duration", type: "number", optional: true, description: "Animation duration in ms (default 600) — match it to the rest of the page's motion scale" },
    { name: "threshold", type: "number", optional: true, description: "Fraction of the child that must be visible to trigger, 0–1 (default 0.15). Use a low value for a tall hero, a higher one for a small card" },
    { name: "once", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const preset = asString(props.animation, "fade-up");
    const anim = REVEAL_PRESETS.has(preset) ? preset : "fade-up";
    const delay = Math.max(0, Math.min(5000, asNumber(props.delay, 0)));
    const duration = Math.max(0, Math.min(5000, asNumber(props.duration, 0)));
    const threshold = Math.max(0, Math.min(1, asNumber(props.threshold, 0.15)));
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The revealed flag lives in instance state so EVERY render (including
    // fresh trees the morph syncs onto the live DOM) emits the class.
    // Without it, the first unrelated state change after the reveal strips
    // `is-revealed` during attribute sync and pops the content invisible.
    const revealed = helpers.useInstanceState<boolean>("rui-reveal-shown", false);
    const shownNow = revealed.get() || reduce || typeof IntersectionObserver === "undefined";
    const styleParts: string[] = [];
    if (delay) styleParts.push(`transition-delay:${delay}ms`);
    // The stylesheet's .6s is not tokenised, so the duration is applied as an
    // inline `transition-duration` (it overrides both properties of the sheet's
    // shorthand). Skipped under reduced motion, where there is nothing to time.
    if (duration && !reduce) styleParts.push(`transition-duration:${duration}ms`);
    const wrapper = el("div", {
      class: shownNow ? "rui-reveal is-revealed" : "rui-reveal",
      "data-anim": anim,
      style: styleParts.length > 0 ? styleParts.join(";") : null,
    });
    wrapper.append(renderChild(helpers, props.child));
    if (shownNow && (props.once === undefined ? true : asBoolean(props.once))) return wrapper;
    if (reduce || typeof IntersectionObserver === "undefined") return wrapper;

    const once = props.once === undefined ? true : asBoolean(props.once);
    const show = (node: HTMLElement): void => { revealed.set(true); node.classList.add("is-revealed"); };
    deferToPaint(() => {
      // Only the committed element wires an observer — fresh trees the
      // morph discarded are never connected and skip themselves here (which
      // also keeps the keyed disposer from cancelling the live observer).
      if (!wrapper.isConnected) return;
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            show(e.target as HTMLElement);
            if (once) { io.disconnect(); return; }
          } else if (!once) {
            revealed.set(false);
            (e.target as HTMLElement).classList.remove("is-revealed");
          }
        }
      }, { threshold, rootMargin: "0px" });
      io.observe(wrapper);
      helpers.registerDisposer(() => io.disconnect(), "rui-reveal-io");

      // Safety net. `.rui-reveal` starts at opacity 0, so anything that stops
      // the observer from ever reporting an intersection leaves the content
      // permanently invisible but still occupying layout — a blank gap with no
      // error. That happens for real: a child taller than the viewport can
      // never reach a 0.15 ratio, and some embedded/offscreen panes never
      // deliver the first record at all. If the element is demonstrably on
      // screen a beat after mount, reveal it regardless.
      const net = setTimeout(() => {
        if (!wrapper.isConnected || revealed.get()) return;
        const rect = wrapper.getBoundingClientRect();
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        if (rect.bottom > 0 && rect.top < viewportH) show(wrapper);
      }, 700);
      helpers.registerDisposer(() => clearTimeout(net), "rui-reveal-net");
    });
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
    "`swipe(dir)` (left/right/up/down), `longPress()`, `doubleTap()`, " +
    "`pan({dx, dy})` during a drag and `onPanEnd({dx, dy})` on release — " +
    "`onPanEnd` is what lets a pan snap back or commit, so pull-to-refresh and " +
    "swipe-to-dismiss need it. `disabled` suppresses every gesture. Gestures " +
    "are pointer-only, so the wrapper is also focusable and mirrors them onto " +
    "the keyboard (Enter/Space → doubleTap, arrows → swipe, the context-menu " +
    "key → longPress); pass `ariaLabel` to say what it does, or keep a visible " +
    "control for the same action.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "swipe", type: "callable", optional: true, aliases: ["onSwipe"], description: "(dir) => … — fired on a swipe; dir is left|right|up|down" },
    { name: "longPress", type: "callable", optional: true, aliases: ["onLongPress"] },
    { name: "doubleTap", type: "callable", optional: true, aliases: ["onDoubleTap"] },
    { name: "pan", type: "callable", optional: true, aliases: ["onPan"], description: "({dx, dy}) => … — fired during a drag" },
    { name: "onPanEnd", type: "callable", optional: true, aliases: ["panEnd", "onRelease"], description: "({dx, dy}) => … — fired on release with the FINAL offset, however short the drag was. Use it to snap back or commit a pan" },
    { name: "threshold", type: "number", optional: true, description: "Swipe distance in px (default 40)" },
    { name: "disabled", type: "boolean", optional: true, description: "Ignore every gesture (a sheet is open, the row is in edit mode, a mutation is in flight)" },
    { name: "ariaLabel", type: "string", optional: true, description: "What the gesture does, announced to screen readers (e.g. \"Swipe left to delete\")" },
  ],
  render: (_node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const hasGesture = !disabled && (props.swipe != null || props.longPress != null
      || props.doubleTap != null || props.pan != null || props.onPanEnd != null);
    // `pan` needs the full pointer stream; otherwise leave vertical panning
    // to the browser so the page still scrolls over the surface.
    const wrap = el("div", {
      class: "rui-gesture",
      style: `touch-action:${props.pan != null && !disabled ? "none" : "pan-y"}`,
      "aria-disabled": disabled ? "true" : null,
      "aria-label": asString(props.ariaLabel) || null,
      // A gesture with no keyboard path is unreachable for keyboard and screen
      // reader users, and nothing in the markup hints it exists. Focusable +
      // labelled is the minimum; the key handler below is the equivalent.
      tabindex: hasGesture ? "0" : null,
    });
    wrap.append(renderChild(helpers, props.child));
    if (disabled) return wrap;
    const threshold = Math.max(8, asNumber(props.threshold, 40));
    const liveHost = (e: Event): HTMLElement => (e.currentTarget as HTMLElement | null) ?? wrap;
    // Only pan/swipe need the pointer tracked once it leaves the element.
    // Capturing unconditionally retargets the compatibility mouse events —
    // including `click` — to this wrapper, so an interactive child (a Button
    // inside a long-press card) silently stops receiving them.
    const wantsCapture = props.pan != null || props.swipe != null;
    const releaseCapture = (host: HTMLElement, pointerId: number): void => {
      try {
        if (host.hasPointerCapture?.(pointerId)) host.releasePointerCapture(pointerId);
      } catch { /* never captured, or already released */ }
    };

    wrap.onpointerdown = (e: PointerEvent) => {
      const host = liveHost(e);
      const state = gestureState(host);
      state.x = e.clientX;
      state.y = e.clientY;
      state.longFired = false;
      clearLongPress(state);
      if (wantsCapture) {
        try { host.setPointerCapture(e.pointerId); } catch { /* already released */ }
      }
      if (props.longPress != null) {
        const timer = setTimeout(() => {
          state.longTimer = null;
          // The element may have unmounted while the press was held.
          if (!host.isConnected) return;
          state.longFired = true;
          helpers.invoke(props.longPress);
        }, 500);
        state.longTimer = timer;
        // Unmount must cancel the pending press deterministically rather than
        // leaving a stray timer to expire on its own. The disposer closes over
        // THIS timer, not over `state`: re-registering the same key disposes
        // the previous callback immediately, and a `clearLongPress(state)`
        // closure would then cancel the press we just started.
        helpers.registerDisposer(() => clearTimeout(timer), "rui-gesture-longpress");
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
      const host = liveHost(e);
      const state = gestureState(host);
      clearLongPress(state);
      releaseCapture(host, e.pointerId);
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      // Release always reports the final offset FIRST: a drag that stopped
      // short of `threshold` gets no `swipe`, and without this event the UI
      // would stay stuck wherever the finger left it.
      if (props.onPanEnd != null) helpers.invoke(props.onPanEnd, { dx, dy });
      if (state.longFired) { state.longFired = false; state.lastTap = 0; return; }
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
      const host = liveHost(e);
      const state = gestureState(host);
      clearLongPress(state);
      releaseCapture(host, e.pointerId);
      state.longFired = false;
      // A cancelled gesture is still a release: the UI has to unwind.
      if (props.onPanEnd != null) {
        helpers.invoke(props.onPanEnd, { dx: e.clientX - state.x, dy: e.clientY - state.y });
      }
    };
    if (hasGesture) {
      wrap.onkeydown = (e: KeyboardEvent) => {
        const dir = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right"
          : e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : null;
        if (dir && props.swipe != null) { e.preventDefault(); helpers.invoke(props.swipe, dir); return; }
        if ((e.key === "Enter" || e.key === " ") && props.doubleTap != null) {
          e.preventDefault();
          helpers.invoke(props.doubleTap);
          return;
        }
        // Shift+F10 / the context-menu key is the platform's own "secondary
        // action" chord, which is what a long press means.
        if ((e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) && props.longPress != null) {
          e.preventDefault();
          helpers.invoke(props.longPress);
        }
      };
    }
    return wrap;
  },
};

/* ----------------------------------------------------------------------- *
 * Sortable — reorderable list via native HTML drag-and-drop
 * ----------------------------------------------------------------------- */

/** In-flight drag/keyboard-pickup state for one Sortable instance. */
interface SortableDrag {
  /** Index the drag started from, or the row picked up by keyboard. -1 = none. */
  from: number;
  /** Row currently under the pointer. -1 = none. */
  over: number;
  /** True when `from` was picked up with the keyboard rather than a drag. */
  keyboard: boolean;
}

const SORTABLE_IDLE: SortableDrag = { from: -1, over: -1, keyboard: false };

/**
 * Announce the current pickup state. Screen-reader users get no feedback at all
 * from a drag, so the keyboard path narrates itself through a polite live
 * region. The text is derived from `SortableDrag`, which lives in instance
 * state — so the value a handler writes onto the live node is exactly the value
 * the next render emits, and morph cannot contradict it.
 */
function sortableStatus(drag: SortableDrag, count: number): string {
  if (drag.from < 0 || !drag.keyboard) return "";
  return `Item ${drag.from + 1} of ${count} picked up. Use the arrow keys to move it, Enter to drop, Escape to cancel.`;
}

export const Sortable: ComponentSpec = {
  name: "Sortable",
  description:
    "A list whose items can be reordered by dragging a row (or, for keyboard " +
    "users, by focusing one, pressing Space to pick it up and using the arrow " +
    "keys). Pass already-rendered `items`; `onReorder(fromIndex, toIndex)` " +
    "fires after a drop so you can reorder the backing reactive array. " +
    "`horizontal` lays the rows out in a row instead of a column; `disabled` " +
    "freezes it. Dragging uses native HTML5 drag-and-drop, which fires no " +
    "events on touch devices — on mobile, expose the keyboard path (the rows " +
    "are focusable) or move/reorder buttons instead.",
  props: [
    { name: "items", type: "Node[]", positional: true, required: true, aliases: ["children"] },
    { name: "onReorder", type: "callable", optional: true, description: "(fromIndex, toIndex) => …" },
    { name: "handle", type: "boolean", optional: true, description: "Show a drag handle on each row (default true)" },
    { name: "horizontal", type: "boolean", optional: true, description: "Lay the rows out horizontally (chip rows, kanban column headers) — the arrow keys follow the axis" },
    { name: "disabled", type: "boolean", optional: true, description: "Freeze the list: no dragging, no keyboard reordering (read-only, or a reorder mutation is in flight)" },
    { name: "ariaLabel", type: "string", optional: true, description: "Name for the list, announced to screen readers (e.g. \"Task order\")" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const disabled = asBoolean(props.disabled);
    const horizontal = asBoolean(props.horizontal);
    const showHandle = props.handle === undefined ? true : asBoolean(props.handle);
    // The drag origin and the drag feedback live in instance state, never in a
    // DOM attribute or a bare `classList.add`: morph strips attributes the fresh
    // tree omits and rebuilds `class` from it, so one unrelated state write
    // mid-drag used to erase the affordances AND reset `data-drag-from` — after
    // which `Number(null)` read back as index 0 and the drop moved the FIRST
    // row. Everything below is emitted by this render and mirrored onto the
    // live DOM by the handlers (instance-state writes do not re-render).
    const dragSlot = helpers.useInstanceState<SortableDrag>("rui-sortable-drag", SORTABLE_IDLE);
    const drag = dragSlot.get();
    const root = el("div", {
      class: "rui-sortable",
      role: "listbox",
      "aria-label": asString(props.ariaLabel) || null,
      "aria-orientation": horizontal ? "horizontal" : "vertical",
      "aria-disabled": disabled ? "true" : null,
      "data-orientation": horizontal ? "horizontal" : null,
      // Inline so the axis switch needs no extra stylesheet rule.
      style: horizontal ? "flex-direction:row" : null,
    });
    const liveRow = (e: Event): HTMLElement | null =>
      ((e.currentTarget ?? e.target) as HTMLElement | null)?.closest?.(".rui-sortable-item") ?? null;
    const indexOf = (row: HTMLElement | null): number => {
      const raw = row?.getAttribute("data-index");
      if (raw == null) return -1;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 0 ? n : -1;
    };
    const containerOf = (row: HTMLElement | null): HTMLElement | null =>
      (row?.closest(".rui-sortable") as HTMLElement | null) ?? null;
    /**
     * Push `next` onto both the instance slot and the live DOM. The slot keeps
     * the next render honest; the direct writes are what the user actually sees,
     * because an instance-state write schedules no render.
     */
    const setDrag = (container: HTMLElement | null, next: SortableDrag): void => {
      dragSlot.set(next);
      if (!container) return;
      for (const row of Array.from(container.querySelectorAll<HTMLElement>(".rui-sortable-item"))) {
        const i = indexOf(row);
        row.classList.toggle("is-dragging", i >= 0 && i === next.from);
        row.classList.toggle("is-over", i >= 0 && i === next.over);
        row.setAttribute("aria-selected", i >= 0 && i === next.from ? "true" : "false");
      }
      const status = container.querySelector<HTMLElement>(".rui-sortable-status");
      if (status) status.textContent = sortableStatus(next, items.length);
    };
    const move = (container: HTMLElement | null, from: number, to: number): void => {
      setDrag(container, SORTABLE_IDLE);
      if (from < 0 || to < 0 || from === to || to >= items.length) return;
      helpers.invoke(props.onReorder, from, to);
      // Keep the keyboard user with the row they just moved: after the app
      // re-renders the reordered array, the row now living at `to` is theirs.
      deferToPaint(() => {
        const live = container?.isConnected ? container : null;
        live?.querySelector<HTMLElement>(`.rui-sortable-item[data-index="${to}"]`)?.focus();
      });
    };

    items.forEach((item, index) => {
      const row = el("div", {
        class: classNames(
          "rui-sortable-item",
          index === drag.from && "is-dragging",
          index === drag.over && "is-over",
        ),
        draggable: disabled ? "false" : "true",
        "data-index": String(index),
        role: "option",
        "aria-selected": index === drag.from ? "true" : "false",
        tabindex: disabled ? null : "0",
      });
      if (showHandle) {
        const h = el("span", { class: "rui-sortable-handle", "aria-hidden": "true" });
        h.append(el("i", { class: "rui-icon fa-solid fa-grip-vertical" }));
        row.append(h);
      }
      const body = el("div", { class: "rui-sortable-body" });
      body.append(helpers.renderNode(item));
      row.append(body);
      if (!disabled) {
        row.ondragstart = (e: DragEvent) => {
          const live = liveRow(e);
          const from = indexOf(live);
          if (from < 0) return;
          // Firefox treats a dragstart that leaves the data store empty as a
          // cancelled drag, so the list was simply not reorderable there. The
          // index also travels WITH the drag, which is the one place morph can
          // never reach.
          try {
            e.dataTransfer?.setData("text/plain", String(from));
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          } catch { /* some engines lock the store outside a real drag */ }
          setDrag(containerOf(live), { from, over: -1, keyboard: false });
        };
        row.ondragend = (e: DragEvent) => setDrag(containerOf(liveRow(e)), SORTABLE_IDLE);
        row.ondragover = (e: DragEvent) => {
          e.preventDefault();
          const live = liveRow(e);
          const over = indexOf(live);
          const current = dragSlot.get();
          if (current.over === over) return;
          setDrag(containerOf(live), { ...current, over });
        };
        row.ondragleave = (e: DragEvent) => {
          const live = liveRow(e);
          const current = dragSlot.get();
          if (current.over !== indexOf(live)) return;
          setDrag(containerOf(live), { ...current, over: -1 });
        };
        row.ondrop = (e: DragEvent) => {
          e.preventDefault();
          const live = liveRow(e);
          const to = indexOf(live);
          // Prefer the origin the drag itself carries; fall back to the slot.
          // A MISSING origin must stay missing — the old code read it out of an
          // attribute, and `Number(null) === 0` let any foreign drag masquerade
          // as "the user dragged row 0".
          const carried = (e.dataTransfer?.getData("text/plain") ?? "").trim();
          const from = /^\d+$/.test(carried) ? Number(carried) : dragSlot.get().from;
          move(containerOf(live), from, to);
        };
        row.onkeydown = (e: KeyboardEvent) => {
          const live = liveRow(e);
          const index2 = indexOf(live);
          const container = containerOf(live);
          const current = dragSlot.get();
          const back = horizontal ? "ArrowLeft" : "ArrowUp";
          const forward = horizontal ? "ArrowRight" : "ArrowDown";
          if (e.key === " " || (e.key === "Enter" && current.from < 0)) {
            e.preventDefault();
            setDrag(container, current.from === index2
              ? SORTABLE_IDLE
              : { from: index2, over: -1, keyboard: true });
            return;
          }
          if (e.key === "Escape" && current.from >= 0) {
            e.preventDefault();
            setDrag(container, SORTABLE_IDLE);
            return;
          }
          if (e.key === "Enter" && current.from >= 0) {
            e.preventDefault();
            move(container, current.from, index2);
            return;
          }
          if (e.key !== back && e.key !== forward) return;
          e.preventDefault();
          const step = e.key === back ? -1 : 1;
          const target = index2 + step;
          if (target < 0 || target >= items.length) return;
          // Picked up → reorder. Not picked up → just walk the list.
          if (current.from === index2 && current.keyboard) move(container, index2, target);
          else container?.querySelector<HTMLElement>(`.rui-sortable-item[data-index="${target}"]`)?.focus();
        };
      }
      root.append(row);
    });
    // Polite, visually hidden narration for the keyboard reorder path. Keyed so
    // the morph reconciler keeps this exact node and only updates its text — a
    // live region that is itself replaced is treated as new and stays silent.
    root.append(el(
      "span",
      {
        class: "rui-sortable-status rui-visually-hidden",
        "data-rui-key": "rui-sortable-status",
        "aria-live": "polite",
        "aria-atomic": "true",
      },
      [sortableStatus(drag, items.length)],
    ));
    return root;
  },
};

/**
 * A drag `type` travels as a data-transfer *format*, because a DropZone has to
 * decide whether it can accept a drag during `dragover` — and every engine
 * hides the DATA until the drop, exposing only `dataTransfer.types`. Encoding
 * the type in the format name is therefore the only way `accept` can work
 * before the drop has visually succeeded.
 */
const DRAG_TYPE_PREFIX = "application/x-aktion.";
const dragTypeFormat = (type: string): string => `${DRAG_TYPE_PREFIX}${type}`;

/** Types are format names, so keep them to a conservative MIME-safe alphabet. */
function normaliseDragType(raw: unknown): string {
  return asString(raw).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
}

/**
 * Keyboard hand-off between `Draggable` and `DropZone`.
 *
 * HTML5 drag-and-drop is pointer-only, so a keyboard user needs somewhere to
 * park the payload between picking it up and dropping it. Module-level on
 * purpose: this is a hand-off BETWEEN two component instances, not per-instance
 * UI state (which belongs in `useInstanceState`). Exactly one pickup can be in
 * flight, mirroring the platform's single drag.
 */
let KEYBOARD_DRAG: { data: unknown; type: string; owner: object } | null = null;

/**
 * Release the visual grab state of whichever Draggable is picked up. The
 * Draggable never hears that a DropZone consumed its payload, so the zone
 * clears the affordance and the Draggable's next render agrees (its own render
 * derives "grabbed" from `KEYBOARD_DRAG`, which is now empty).
 */
function clearKeyboardGrab(from: Node | null): void {
  const root = from?.getRootNode?.();
  if (!(root instanceof ShadowRoot) && !(root instanceof Document)) return;
  for (const node of Array.from(root.querySelectorAll<HTMLElement>(".rui-draggable[aria-grabbed='true']"))) {
    node.classList.remove("is-dragging");
    node.removeAttribute("aria-grabbed");
  }
}

export const Draggable: ComponentSpec = {
  name: "Draggable",
  description:
    "Makes its child draggable, carrying a `data` payload picked up by a " +
    "DropZone. `type` tags the payload so a DropZone can `accept` (or refuse) " +
    "it before the drop; `disabled` makes it immovable without re-rendering a " +
    "different child. `onDragStart`/`onDragEnd` optional. Keyboard users focus " +
    "it and press Space/Enter to pick up (Escape cancels), then Space/Enter on " +
    "a DropZone to drop — give it an `ariaLabel` so they know what it is.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "data", type: "any", optional: true, description: "Payload (stringified) handed to the DropZone" },
    { name: "type", type: "string", optional: true, description: "Payload kind, e.g. \"card\" / \"file\" / \"tag\" — a DropZone's `accept` matches against it" },
    { name: "disabled", type: "boolean", optional: true, description: "Not draggable (locked, in flight, not the user's to move)" },
    { name: "ariaLabel", type: "string", optional: true, description: "What is being dragged, announced to screen readers" },
    { name: "onDragStart", type: "callable", optional: true },
    { name: "onDragEnd", type: "callable", optional: true },
  ],
  render: (_node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const type = normaliseDragType(props.type);
    // The dragging flag is instance state, not a bare `classList.add`: morph
    // rebuilds `class` from the fresh tree, so the 50%-opacity feedback used to
    // vanish the moment anything else in the app wrote state mid-drag.
    const modeSlot = helpers.useInstanceState<{ mode: "none" | "pointer" | "keyboard" }>(
      "rui-draggable-drag", { mode: "none" },
    );
    // Stable per-instance identity (the initial value is only stored once), so a
    // keyboard pickup can tell whether the in-flight hand-off is this one's.
    const token = helpers.useInstanceState<{ id: object }>("rui-draggable-token", { id: {} }).get().id;
    const mode = modeSlot.get().mode;
    const dragging = !disabled && (mode === "pointer"
      || (mode === "keyboard" && KEYBOARD_DRAG?.owner === token));
    const wrap = el("div", {
      class: classNames("rui-draggable", dragging && "is-dragging"),
      draggable: disabled ? "false" : "true",
      "data-drag-type": type || null,
      "data-disabled": disabled ? "true" : null,
      "aria-disabled": disabled ? "true" : null,
      "aria-label": asString(props.ariaLabel) || null,
      "aria-grabbed": dragging ? "true" : null,
      tabindex: disabled ? null : "0",
    });
    wrap.append(renderChild(helpers, props.child));
    if (disabled) return wrap;
    const payload = (): string =>
      typeof props.data === "string" ? props.data : JSON.stringify(props.data ?? null);
    const setDragging = (node: HTMLElement | null, next: "none" | "pointer" | "keyboard"): void => {
      modeSlot.set({ mode: next });
      if (!node) return;
      node.classList.toggle("is-dragging", next !== "none");
      if (next === "none") node.removeAttribute("aria-grabbed");
      else node.setAttribute("aria-grabbed", "true");
    };
    const liveWrap = (e: Event): HTMLElement | null =>
      ((e.currentTarget ?? e.target) as HTMLElement | null)?.closest?.(".rui-draggable") ?? null;
    // Property handlers (morph contract) + live-node class toggles.
    wrap.ondragstart = (e: DragEvent) => {
      try {
        const text = payload();
        e.dataTransfer?.setData("text/plain", text);
        // Second copy under the typed format so `accept` can match on dragover.
        if (type) e.dataTransfer?.setData(dragTypeFormat(type), text);
      } catch { /* ignore */ }
      setDragging(liveWrap(e), "pointer");
      helpers.invoke(props.onDragStart, props.data);
    };
    wrap.ondragend = (e: DragEvent) => {
      setDragging(liveWrap(e), "none");
      helpers.invoke(props.onDragEnd);
    };
    wrap.onkeydown = (e: KeyboardEvent) => {
      const held = KEYBOARD_DRAG?.owner === token;
      if (e.key === "Escape" && held) {
        e.preventDefault();
        KEYBOARD_DRAG = null;
        setDragging(liveWrap(e), "none");
        helpers.invoke(props.onDragEnd);
        return;
      }
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      if (held) {
        KEYBOARD_DRAG = null;
        setDragging(liveWrap(e), "none");
        helpers.invoke(props.onDragEnd);
        return;
      }
      KEYBOARD_DRAG = { data: props.data, type, owner: token };
      setDragging(liveWrap(e), "keyboard");
      helpers.invoke(props.onDragStart, props.data);
    };
    return wrap;
  },
};

export const DropZone: ComponentSpec = {
  name: "DropZone",
  description:
    "A target that accepts a Draggable. `onDrop(data)` receives the dropped " +
    "payload (parsed JSON when possible). `accept` lists the Draggable `type`s " +
    "this zone can take (comma-separated) — anything else is refused before it " +
    "is dropped, so a 'To do' / 'Done' / 'Archive' board can express what goes " +
    "where; `disabled` makes the zone inert. Pass `child` for the zone's " +
    "content, or just `label` for a bare labelled target. Keyboard users focus " +
    "the zone and press Space/Enter to drop what a Draggable picked up.",
  props: [
    { name: "child", type: "Node", positional: true, optional: true, aliases: ["children"], description: "Zone content. Omit it and pass `label` for a plain labelled target" },
    { name: "onDrop", type: "callable", optional: true },
    { name: "label", type: "string", optional: true, description: "Text shown when no `child` is given" },
    { name: "accept", type: "string", optional: true, description: "Draggable `type`s this zone accepts, e.g. \"card\" or \"card, file\". Omit to accept anything" },
    { name: "disabled", type: "boolean", optional: true, description: "Inert: no highlight, no drop (the zone is full, locked, or read-only)" },
    { name: "ariaLabel", type: "string", optional: true, description: "Name for the zone, announced to screen readers" },
  ],
  render: (_node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const accept = asString(props.accept).split(/[,\s]+/).map(normaliseDragType).filter(Boolean);
    // Hover feedback is instance state for the same reason as everywhere else in
    // this file: morph rebuilds `class`, so a `classList.add("is-over")` alone
    // disappears the instant an unrelated state write lands mid-drag.
    const overSlot = helpers.useInstanceState<boolean>("rui-dropzone-over", false);
    const isOver = overSlot.get() && !disabled;
    const zone = el("div", {
      class: classNames("rui-dropzone", isOver && "is-over"),
      "data-accept": accept.length > 0 ? accept.join(",") : null,
      "data-disabled": disabled ? "true" : null,
      "aria-disabled": disabled ? "true" : null,
      "aria-label": asString(props.ariaLabel) || null,
      tabindex: disabled ? null : "0",
    });
    if (props.child != null) zone.append(renderChild(helpers, props.child));
    else if (asString(props.label)) zone.append(el("span", { class: "rui-dropzone-label" }, [asString(props.label)]));
    if (disabled) return zone;
    const liveZone = (e: Event): HTMLElement | null => ((e.currentTarget ?? e.target) as HTMLElement | null)?.closest?.(".rui-dropzone") ?? null;
    const setOver = (node: HTMLElement | null, next: boolean): void => {
      overSlot.set(next);
      node?.classList.toggle("is-over", next);
    };
    /** Whether this zone can take the drag currently in flight. */
    const accepts = (transfer: DataTransfer | null | undefined): boolean => {
      if (accept.length === 0) return true;
      const types = Array.from(transfer?.types ?? []);
      return accept.some((t) => types.includes(dragTypeFormat(t)));
    };
    const drop = (node: HTMLElement | null, data: unknown): void => {
      setOver(node, false);
      helpers.invoke(props.onDrop, data);
    };
    zone.ondragover = (e: DragEvent) => {
      const node = liveZone(e);
      if (!accepts(e.dataTransfer)) {
        // No preventDefault: the browser keeps showing "no drop" and refuses
        // the drop outright, instead of letting it land and be rejected after
        // the fact.
        if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
        return;
      }
      e.preventDefault();
      setOver(node, true);
    };
    zone.ondragleave = (e: DragEvent) => {
      const node = liveZone(e);
      // `dragleave` bubbles up from descendants, so moving the pointer between
      // the zone's own children fires it constantly. Only a leave that lands
      // OUTSIDE the zone (or outside the window, relatedTarget === null) counts;
      // otherwise the highlight strobes while the pointer is still inside.
      const to = e.relatedTarget;
      if (to instanceof Node && node?.contains(to)) return;
      setOver(node, false);
    };
    zone.ondrop = (e: DragEvent) => {
      const node = liveZone(e);
      if (!accepts(e.dataTransfer)) { setOver(node, false); return; }
      e.preventDefault();
      const raw = e.dataTransfer?.getData("text/plain") ?? "";
      let data: unknown = raw;
      try { data = JSON.parse(raw); } catch { /* keep raw string */ }
      drop(node, data);
    };
    zone.onkeydown = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      const pending = KEYBOARD_DRAG;
      if (!pending) return;
      if (accept.length > 0 && !accept.includes(pending.type)) return;
      e.preventDefault();
      KEYBOARD_DRAG = null;
      const node = liveZone(e);
      clearKeyboardGrab(node);
      drop(node, pending.data);
    };
    return zone;
  },
};

/* ----------------------------------------------------------------------- *
 * Parallax — translate a child as the page scrolls
 * ----------------------------------------------------------------------- */

/** Travel cap: an explicit `maxOffset`, else half the layer's own height. */
function parallaxLimit(raw: unknown, height: number): number {
  const value = sanitiseCssLength(raw, "");
  const px = /^(\d+(?:\.\d+)?)(px)?$/.exec(value);
  if (px) return Number(px[1]);
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (pct) return (Number(pct[1]) / 100) * height;
  return height / 2;
}

export const Parallax: ComponentSpec = {
  name: "Parallax",
  description:
    "Translates its child vertically as the page scrolls for a depth effect. " +
    "`speed` (−1…1) sets intensity/direction. Travel is capped by `maxOffset` " +
    "(default: half the layer's own height) so the layer cannot slide out of " +
    "its section and over the content above or below it. Honours " +
    "prefers-reduced-motion.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "speed", type: "number", optional: true, description: "−1…1 (default 0.3)" },
    { name: "maxOffset", type: "string", optional: true, description: "Maximum travel in either direction — a length (\"120px\") or a percentage of the layer's height (\"40%\"). Default 50%" },
  ],
  render: (_node, props, helpers) => {
    // The offset is instance state and is emitted by every render: morph copies
    // `style` verbatim from the fresh tree, so a transform written only onto the
    // live node was wiped by the next unrelated re-render — and the scroll
    // handler could never restore it, because the node it captured at render
    // time had been discarded.
    const offsetSlot = helpers.useInstanceState<number>("rui-parallax-y", 0);
    const offset = offsetSlot.get();
    const wrap = el("div", {
      class: "rui-parallax",
      style: `will-change:transform;transform:translateY(${offset.toFixed(1)}px)`,
    });
    wrap.append(renderChild(helpers, props.child));
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof window === "undefined") return wrap;
    // Written on every render, read inside the handler: the listeners are wired
    // once, so anything the handler closed over would be frozen at the first
    // render's props and a later `speed` change would silently do nothing.
    const cfgSlot = helpers.useInstanceState<{ speed: number; maxOffset: unknown }>(
      "rui-parallax-cfg", { speed: 0.3, maxOffset: null },
    );
    cfgSlot.set({
      speed: Math.max(-1, Math.min(1, asNumber(props.speed, 0.3))),
      maxOffset: props.maxOffset,
    });
    deferToPaint(() => {
      // Only the committed node wires listeners, so `wrap` below IS the live
      // node for the rest of the instance's life (morph keeps it and discards
      // every later render's copy, which never gets here).
      if (!wrap.isConnected) return;
      let raf = 0;
      const update = (): void => {
        raf = 0;
        const rect = wrap.getBoundingClientRect();
        const viewportH = window.innerHeight || 800;
        const center = rect.top + rect.height / 2 - viewportH / 2;
        const cfg = cfgSlot.get();
        // Unclamped, `speed: 1` in a 400px hero on a 900px viewport travels
        // ±650px — half a viewport out of its own box and over its neighbours.
        const limit = parallaxLimit(cfg.maxOffset, rect.height);
        const y = Math.max(-limit, Math.min(limit, -center * cfg.speed));
        offsetSlot.set(y);
        wrap.style.transform = `translateY(${y.toFixed(1)}px)`;
      };
      const onScroll = (): void => { if (!raf) raf = requestAnimationFrame(update); };
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      // Keyed: re-renders swap the window listeners instead of accumulating
      // a fresh pair per render (anonymous disposers only run on unmount).
      helpers.registerDisposer(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (raf) cancelAnimationFrame(raf);
      }, "rui-parallax");
    });
    return wrap;
  },
};

/* ----------------------------------------------------------------------- *
 * ReadingProgress — top-of-page scroll progress bar
 * ----------------------------------------------------------------------- */

export const ReadingProgress: ComponentSpec = {
  name: "ReadingProgress",
  description:
    "A thin progress bar that fills as the reader scrolls — article/docs " +
    "reading affordance. Optional `gradient` fill or a `color` override. By " +
    "default it measures whichever container actually scrolls the app (the page " +
    "when the app owns the page scroll, otherwise the nearest scrolling " +
    "ancestor — a chat pane, a dashboard panel, a modal body), and pins itself " +
    "inside that container instead of the browser viewport. `target` overrides " +
    "the choice with a CSS selector, or \"page\" to force the document.",
  props: [
    { name: "gradient", type: "boolean", optional: true },
    { name: "height", type: "string", optional: true, description: "Bar thickness (CSS length, default 3px)" },
    { name: "target", type: "string", optional: true, aliases: ["scrollContainer"], description: "What to measure: a CSS selector for the scrolling element, or \"page\" for the document. Default: auto-detect" },
    { name: "color", type: "string", optional: true, description: "Fill colour (CSS colour or var(--token)) — overrides `gradient`" },
  ],
  render: (_node, props, helpers) => {
    // Both the fill width and the sticky/fixed decision are instance state and
    // are emitted by every render. morph removes attributes the fresh tree
    // omits, so a `bar.style.width` written only onto the live node was erased
    // by the first unrelated state write — and the old scroll listener then held
    // a detached node it could never fill again.
    const pctSlot = helpers.useInstanceState<number>("rui-reading-progress-pct", 0);
    const embeddedSlot = helpers.useInstanceState<boolean>("rui-reading-progress-embedded", false);
    const target = asString(props.target).trim();
    const rootStyle = [`height:${sanitiseCssLength(props.height, "3px")}`];
    // `position: fixed` pins to the browser viewport, which is wrong (and
    // escapes the panel) when an inner container owns the scroll.
    if (embeddedSlot.get()) rootStyle.push("position:sticky", "left:auto", "right:auto");
    const root = el("div", { class: "rui-reading-progress", style: rootStyle.join(";") });
    const color = sanitiseCssColor(props.color);
    const bar = el("div", {
      class: "rui-reading-progress-bar",
      "data-gradient": asBoolean(props.gradient) ? "true" : null,
      style: `width:${pctSlot.get().toFixed(2)}%${color ? `;background:${color}` : ""}`,
    });
    root.append(bar);
    if (typeof window === "undefined") return root;
    deferToPaint(() => {
      // Only the committed node installs the listener — see the module header.
      if (!root.isConnected) return;
      let selected: HTMLElement | null = null;
      if (target && target !== "page") {
        const scope = root.getRootNode();
        try {
          selected = (scope as ShadowRoot | Document).querySelector<HTMLElement>(target)
            ?? document.querySelector<HTMLElement>(target);
        } catch { /* an unparseable selector falls through to auto-detect */ }
      }
      // Auto-detect is the default because the canonical host for this runtime
      // is an app embedded in a scrolling panel, where the document never
      // scrolls at all: `documentElement.scrollTop` stays 0 and the bar reads
      // as a permanently empty 3px strip.
      const scroller = selected ?? (target === "page" ? null : nearestScrollable(root));
      if (scroller) {
        embeddedSlot.set(true);
        root.style.setProperty("position", "sticky");
        root.style.setProperty("left", "auto");
        root.style.setProperty("right", "auto");
      }
      const measured = (): HTMLElement =>
        scroller ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
      let raf = 0;
      const update = (): void => {
        raf = 0;
        const box = measured();
        const max = (box.scrollHeight - box.clientHeight) || 1;
        const pct = Math.max(0, Math.min(100, (box.scrollTop / max) * 100));
        pctSlot.set(pct);
        bar.style.width = `${pct.toFixed(2)}%`;
      };
      const onScroll = (): void => { if (!raf) raf = requestAnimationFrame(update); };
      update();
      const source: EventTarget = scroller ?? window;
      source.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      helpers.registerDisposer(() => {
        source.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (raf) cancelAnimationFrame(raf);
      }, "rui-reading-progress");
    });
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Transition — enter/exit animation gated by a `show` boolean (III.3)
 * ----------------------------------------------------------------------- */

const TRANSITION_PRESETS = new Set(["fade", "scale", "slide-up", "slide-down", "slide-left", "slide-right"]);

/**
 * `hidden` — no child in the tree. `shown` — child mounted at the enter state.
 * `exiting` — child still mounted, playing the exit animation, removal pending.
 *
 * `ever` records that this instance has already committed a render, which is
 * how the render below knows whether the node it is building will BE the live
 * element (first render) or will be thrown away by morph in favour of the one
 * it already keeps (every later render).
 */
interface TransitionState { phase: "hidden" | "shown" | "exiting"; ever: boolean }

export const Transition: ComponentSpec = {
  name: "Transition",
  description:
    "Animates its child IN when `show` becomes true and OUT when it becomes " +
    "false (mount/unmount choreography) — modals, toasts, dropdowns, list " +
    "rows. `preset` is fade|scale|slide-up|slide-down|slide-left|slide-right, " +
    "`duration` is ms. The child stays mounted through the exit animation, " +
    "then is removed and `onExited` fires — use it to drop the row from the " +
    "backing array, release a lock, or restore focus. Honours " +
    "prefers-reduced-motion (instant swap).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "show", type: "boolean", description: "Whether the child is visible" },
    { name: "preset", type: "string", optional: true, enum: [...TRANSITION_PRESETS] },
    { name: "duration", type: "number", optional: true, description: "Animation duration in ms (default 280)" },
    { name: "onExited", type: "callable", optional: true, description: "Fired once the exit animation has finished and the child has been removed" },
  ],
  render: (_node, props, helpers) => {
    const show = asBoolean(props.show);
    const presetRaw = asString(props.preset, "fade");
    const preset = TRANSITION_PRESETS.has(presetRaw) ? presetRaw : "fade";
    const duration = Math.max(0, Math.min(5000, asNumber(props.duration, 280)));
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const slot = helpers.useInstanceState<TransitionState>("rui-transition", { phase: "hidden", ever: false });
    const prev = slot.get();
    const first = !prev.ever;

    const wrapper = el("div", {
      class: "rui-transition",
      "data-preset": preset,
      style: `--rui-transition-ms:${duration}ms`,
    });
    // Render #1's node is the one morph keeps for the instance's lifetime, so
    // it is the only handle to the LIVE element that a later render can get.
    // Everything asynchronous below goes through it; mutating the render-time
    // node instead is what left a closed modal stuck fully visible and
    // interactive (morph had already discarded the node the timer wrote to).
    const nodeSlot = helpers.useInstanceState<HTMLElement | null>("rui-transition-node", null);
    if (first) nodeSlot.set(wrapper);
    /**
     * The live wrapper, or null once this instance no longer has one. Normally
     * that is render #1's node, but a fresh node that turns out to be CONNECTED
     * is the live one too (morph replaces rather than patches when it cannot
     * match the element), so re-storing it here keeps the handle self-healing
     * instead of pointing at a detached snapshot forever.
     */
    const live = (): HTMLElement | null => {
      if (wrapper.isConnected) { nodeSlot.set(wrapper); return wrapper; }
      const node = nodeSlot.get();
      return node && node.isConnected ? node : null;
    };

    let phase: TransitionState["phase"];
    let mountChild: boolean;
    let state: "enter" | "exit";

    if (show) {
      phase = "shown";
      mountChild = true;
      // Every mount needs the two-pass flip, not just the first one. morph syncs
      // attributes BEFORE children (renderer/morph.ts patchElement), so emitting
      // `enter` in the same render that mounts the child means the child's very
      // first computed style is already the end state and no transition runs at
      // all. Emitting `exit`, forcing the style flush, then flipping the LIVE
      // node is what actually animates it in — and the flip lands on the live
      // node precisely because it is deferred past the commit. Scheduling it two
      // frames out against the render-time node is what used to leave the child
      // mounted at opacity 0 for good (an invisible click-blocker for a
      // full-screen overlay) until some unrelated render happened along.
      const needsFlip = !reduce && duration > 0 && prev.phase === "hidden";
      state = needsFlip ? "exit" : "enter";
      if (needsFlip) {
        deferToPaint(() => {
          // `show` can flip back off inside the same frame; from that render on,
          // the exit branch owns `data-state` and must not be overwritten here.
          if (slot.get().phase !== "shown") return;
          const node = live();
          if (!node) return;
          void node.offsetHeight;
          node.setAttribute("data-state", "enter");
        });
      }
      // Re-shown mid-exit: cancel the pending removal. Re-registering the key
      // runs the previous disposer (its `clearTimeout`) immediately.
      if (prev.phase === "exiting") helpers.registerDisposer(() => { /* cancelled */ }, "rui-transition-exit");
    } else if (prev.phase === "exiting") {
      // Mid-exit re-render: hold the child and the exit state so an unrelated
      // state write cannot cut the animation short. The pending timer still
      // owns the removal (nothing re-registers its key here).
      phase = "exiting";
      mountChild = true;
      state = "exit";
    } else if (prev.phase === "shown" && duration > 0 && !reduce) {
      phase = "exiting";
      mountChild = true;
      state = "exit";
      const timer = setTimeout(() => {
        live()?.replaceChildren();
        slot.set({ phase: "hidden", ever: true });
        helpers.invoke(props.onExited);
      }, duration);
      helpers.registerDisposer(() => clearTimeout(timer), "rui-transition-exit");
    } else {
      phase = "hidden";
      mountChild = false;
      state = "exit";
      if (prev.phase !== "hidden") {
        // Instant removal (duration 0 / reduced motion) still reports the exit,
        // but out of the render pass: a handler that writes state must not
        // re-enter rendering from inside a render.
        const timer = setTimeout(() => helpers.invoke(props.onExited), 0);
        helpers.registerDisposer(() => clearTimeout(timer), "rui-transition-exit");
      }
    }

    wrapper.setAttribute("data-state", state);
    if (mountChild) wrapper.append(renderChild(helpers, props.child));
    slot.set({ phase, ever: true });
    return wrapper;
  },
};

/* ----------------------------------------------------------------------- *
 * FlipList — animate list reordering with the FLIP technique (III.4)
 * ----------------------------------------------------------------------- */

const FLIP_EASING = "cubic-bezier(.22,1,.36,1)";

export const FlipList: ComponentSpec = {
  name: "FlipList",
  description:
    "Smoothly animates its children when they reorder or are added (the FLIP " +
    "technique — First/Last/Invert/Play). Wrap a keyed list whose order changes " +
    "(drag-sort, filter, sort toggle) so items glide to their new positions " +
    "instead of jumping, and new items fade in rather than popping. Removed " +
    "items are dropped straight away — wrap a row in `Transition` if it needs " +
    "to animate out. `horizontal` lays the items out in a row; `duration` is " +
    "ms. Honours prefers-reduced-motion (no animation). Use stable `key:`s on " +
    "the items so their DOM nodes persist across the reorder.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "The list items (use stable keys)" },
    { name: "duration", type: "number", optional: true, description: "Animation duration in ms (default 300)" },
    { name: "horizontal", type: "boolean", optional: true, description: "Lay the items out horizontally (tag chips, a filter bar, kanban columns)" },
  ],
  render: (_node, props, helpers) => {
    const duration = Math.max(0, Math.min(2000, asNumber(props.duration, 300)));
    const horizontal = asBoolean(props.horizontal);
    const root = el("div", {
      class: "rui-flip-list",
      "data-orientation": horizontal ? "horizontal" : null,
      // Inline so the axis switch needs no extra stylesheet rule.
      style: horizontal ? "flex-direction:row" : null,
    });
    for (const child of asArray(props.children)) root.append(renderChild(helpers, child));

    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof requestAnimationFrame === "undefined" || typeof MutationObserver === "undefined") return root;

    // Read every render, consumed inside the observer callback: the observer is
    // installed once, so a duration captured in its closure would freeze at the
    // first render's value and a later `duration: $animSpeed` change would
    // silently do nothing.
    const durationSlot = helpers.useInstanceState<number>("rui-flip-duration", duration);
    durationSlot.set(duration);

    // The morph reconciler keeps the FIRST render's root element and patches
    // later renders onto it (including keyed reorders, which fire childList
    // mutations). So the FLIP observer must attach exactly ONCE — to this
    // first root — and stay live across re-renders. A per-instance flag guards
    // re-setup; later renders return their root without re-observing (morph
    // discards them anyway).
    const setup = helpers.useInstanceState<{ done: boolean }>("rui-flip-setup", { done: false });
    if (setup.get().done) return root;

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
      const ms = durationSlot.get();
      const kids = Array.from(root.children) as HTMLElement[];
      const rects = kids.map((k) => k.getBoundingClientRect());
      kids.forEach((child, i) => {
        const prev = positions.get(child);
        const rect = rects[i]!;
        // The invert runs through the Web Animations API, NOT inline
        // `transition`/`transform`: an inline style is part of the `style`
        // attribute, which morph rewrites from the fresh tree — so a state write
        // a few ms into the animation used to strip the transform and teleport
        // every row to its final slot. A WAAPI animation is not in the attribute
        // and survives untouched.
        if (typeof child.animate !== "function" || ms <= 0) return;
        if (prev) {
          const dx = prev.left - rect.left;
          const dy = prev.top - rect.top;
          if (dx !== 0 || dy !== 0) {
            child.animate(
              [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
              { duration: ms, easing: FLIP_EASING },
            );
          }
          return;
        }
        // No cached position → the node is new. Without this it simply popped
        // into place, which is exactly the jump this component exists to smooth.
        child.animate(
          [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }],
          { duration: ms, easing: FLIP_EASING },
        );
      });
      // Cache the new resting positions (measured before the invert transform).
      kids.forEach((child, i) => positions.set(child, { left: rects[i]!.left, top: rects[i]!.top }));
    };

    let raf = 0;
    const observer = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; runFlip(); });
    });
    deferToPaint(() => {
      // Only the committed root is observed — a fresh tree morph discarded is
      // never connected, so it cannot steal the keyed disposer from the live
      // observer and silently kill the animation for good.
      if (!root.isConnected) return;
      setup.set({ done: true });
      seed();
      observer.observe(root, { childList: true });
      helpers.registerDisposer(
        () => { observer.disconnect(); if (raf) cancelAnimationFrame(raf); },
        "rui-flip-list",
      );
    });
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
    "entrance on mount. On every route change it also does what a real " +
    "navigation does: scrolls back to the top (`scrollToTop`, default true), " +
    "moves focus to the new page so keyboard users continue from there, and " +
    "announces the new route politely (`announce` overrides the announced " +
    "text). Honours prefers-reduced-motion.",
  props: [
    { name: "children", aliases: ["child"], type: "Node", positional: true, required: true, description: "The $router(...) result" },
    { name: "routeKey", type: "string", description: "Pass route.path so the view animates on change" },
    { name: "animation", type: "string", optional: true, enum: [...ROUTE_ANIMS] },
    { name: "duration", type: "number", optional: true, description: "Animation duration in ms (default 300)" },
    { name: "scrollToTop", type: "boolean", optional: true, description: "Reset the scroll position on every route change (default true) — without it a link clicked deep in a long page lands the reader mid-document" },
    { name: "announce", type: "string", optional: true, description: "Text read out on a route change (default: the routeKey). Pass the page title" },
  ],
  render: (_node, props, helpers) => {
    const animRaw = asString(props.animation, "fade");
    const animation = ROUTE_ANIMS.has(animRaw) ? animRaw : "fade";
    const duration = Math.max(0, Math.min(2000, asNumber(props.duration, 300)));
    const routeKey = asString(props.routeKey, "page") || "page";
    const scrollToTop = props.scrollToTop === undefined ? true : asBoolean(props.scrollToTop);
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = el("div", { class: "rui-route-view" });
    // A route change swaps the page element out from under the user: their focus
    // is destroyed with the old element and reverts to the document body, so the
    // next Tab starts from the very top of the app.
    const seen = helpers.useInstanceState<string | null>("rui-route-seen", null);
    const changed = seen.get() != null && seen.get() !== routeKey;
    seen.set(routeKey);
    // The keyed inner wrapper: when `routeKey` changes the morph reconciler
    // swaps in a FRESH element (different data-rui-key), which replays the CSS
    // entrance animation automatically on mount — no JS timing needed. Because
    // the fresh element is the one morph INSERTS, it is also the live node, so
    // the post-commit focus/scroll below can safely act on it.
    const page = el("div", {
      class: "rui-route-page",
      "data-rui-key": routeKey,
      "data-anim": reduce ? null : animation,
      style: reduce ? null : `--rui-route-ms:${duration}ms`,
      tabindex: "-1",
    });
    page.append(renderChild(helpers, props.children));
    root.append(page);
    // Announced text is derived from the route, so it is stable across unrelated
    // re-renders (a live region only speaks when its content actually changes).
    // Keyed so morph keeps the region itself and swaps only the text — the page
    // element beside it is keyed too, and a replaced live region stays silent.
    root.append(el(
      "span",
      {
        class: "rui-visually-hidden",
        "data-rui-key": "rui-route-announce",
        "aria-live": "polite",
        "aria-atomic": "true",
      },
      [asString(props.announce) || routeKey],
    ));
    if (changed) {
      deferToPaint(() => {
        if (!page.isConnected) return;
        try { page.focus({ preventScroll: true }); } catch { page.focus(); }
        if (!scrollToTop) return;
        // Reset whatever actually scrolls: an embedded app scrolls an inner
        // container, a standalone one scrolls the document.
        const scroller = nearestScrollable(page);
        if (scroller) { scroller.scrollTop = 0; return; }
        const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
        if (doc) doc.scrollTop = 0;
      });
    }
    return root;
  },
};
