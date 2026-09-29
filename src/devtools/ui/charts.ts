/**
 * Aktion DevTools — charts.
 *
 *   - {@link CommitChart}   one bar per commit, the 16 ms frame budget drawn in,
 *                           selectable by click or arrow keys.
 *   - {@link FlameChart}    one commit's component spans, zoomable and pannable.
 *   - {@link TimelineChart} every event kind on its own track, over time, with
 *                           zoom, pan, brushing, and live follow.
 */

import { h, type VNode } from "../core/vdom.js";
import { CanvasWidget, fitText, heat, roundRect, type CanvasBaseProps } from "../core/canvas.js";
import { niceTicks, packLanes, tickLabel, type FlameNode } from "../analysis/layout.js";
import { fmtMs } from "./kit.js";

const isLight = (el: Element): boolean => ((el.getRootNode() as ShadowRoot).host as HTMLElement | undefined)?.getAttribute("data-theme") === "light";

/* ========================================================================== */
/*  Commit chart                                                               */
/* ========================================================================== */

export interface CommitBar {
  id: number;
  duration: number;
  kind: "initial" | "full" | "incremental";
  rendered: number;
  memoized: number;
  trigger: string;
}

export interface CommitChartProps extends CanvasBaseProps {
  commits: ReadonlyArray<CommitBar>;
  selected: number | null;
  onSelect: (id: number) => void;
  /** Frame budget line, ms. */
  budget?: number;
}

export class CommitChart extends CanvasWidget<CommitChartProps> {
  private hover = -1;
  /** Bars hidden off the right edge (scrolled back in time). */
  private offset = 0;

  override mount(): Element {
    const el = super.mount();
    (el as HTMLElement).tabIndex = 0;
    return el;
  }

  private geometry(): { barW: number; gap: number; visible: number; first: number } {
    const n = this.props.commits.length;
    const gap = n > 120 ? 1 : 2;
    const barW = Math.max(3, Math.min(16, (this.width - 8) / Math.max(1, n) - gap));
    const visible = Math.max(1, Math.floor((this.width - 8) / (barW + gap)));
    const maxOffset = Math.max(0, n - visible);
    this.offset = Math.max(0, Math.min(this.offset, maxOffset));
    const first = Math.max(0, n - visible - this.offset);
    return { barW, gap, visible, first };
  }

  protected override changed(previous: CommitChartProps): void {
    // New commits arriving keep the view pinned to "now" unless scrolled back.
    if (this.props.commits.length > previous.commits.length && this.offset > 0) {
      this.offset += this.props.commits.length - previous.commits.length;
    }
  }

  protected draw(g: CanvasRenderingContext2D): void {
    const { commits, selected } = this.props;
    const budget = this.props.budget ?? 16;
    const top = 6;
    const bottom = this.height - 4;
    const usable = bottom - top;
    const { barW, gap, visible, first } = this.geometry();
    const shown = commits.slice(first, first + visible);
    let max = budget * 1.25;
    for (const c of shown) if (c.duration > max) max = c.duration;
    const y = (ms: number): number => bottom - Math.max(2, (ms / max) * usable);

    // Budget line.
    const by = bottom - (budget / max) * usable;
    g.save();
    g.setLineDash([3, 3]);
    g.strokeStyle = this.color("--dt-red");
    g.globalAlpha = 0.45;
    g.beginPath();
    g.moveTo(0, Math.round(by) + 0.5);
    g.lineTo(this.width, Math.round(by) + 0.5);
    g.stroke();
    g.restore();
    g.font = this.font(9, 600);
    g.fillStyle = this.color("--dt-red");
    g.globalAlpha = 0.75;
    g.fillText(`${budget}ms`, 4, Math.max(9, by - 3));
    g.globalAlpha = 1;

    const colors = {
      initial: this.color("--dt-teal"),
      full: this.color("--dt-amber"),
      incremental: this.color("--dt-accent"),
      over: this.color("--dt-red"),
    };
    shown.forEach((commit, i) => {
      const x = 4 + i * (barW + gap);
      const yy = y(commit.duration);
      const isSel = commit.id === selected;
      const isHover = first + i === this.hover;
      g.globalAlpha = selected === null || isSel || isHover ? 1 : 0.62;
      g.fillStyle = commit.duration > budget ? colors.over : colors[commit.kind];
      roundRect(g, x, yy, barW, bottom - yy, Math.min(2, barW / 2));
      g.fill();
      if (isSel) {
        g.globalAlpha = 1;
        g.strokeStyle = this.color("--dt-text");
        g.lineWidth = 1.5;
        roundRect(g, x - 1, yy - 1, barW + 2, bottom - yy + 2, 2);
        g.stroke();
      }
    });
    g.globalAlpha = 1;
    if (this.offset > 0) {
      g.fillStyle = this.color("--dt-text-3");
      g.font = this.font(9, 600);
      g.fillText(`← ${this.offset} newer`, this.width - 70, 12);
    }
  }

  private indexAt(x: number): number {
    const { barW, gap, visible, first } = this.geometry();
    const i = Math.floor((x - 4) / (barW + gap));
    if (i < 0 || i >= visible) return -1;
    const index = first + i;
    return index < this.props.commits.length ? index : -1;
  }

  protected override onPointer(kind: "move" | "down" | "up" | "dbl", x: number, y: number): void {
    const index = this.indexAt(x);
    if (kind === "move") {
      if (index !== this.hover) {
        this.hover = index;
        this.redraw();
      }
      const c = index >= 0 ? this.props.commits[index] : undefined;
      if (!c) { this.hideTip(); return; }
      this.showTip(x, y, [
        { text: `Commit #${c.id} · ${fmtMs(c.duration)}`, bold: true },
        `${c.kind === "initial" ? "Initial mount" : c.kind === "full" ? "Full render" : "Incremental"} · ${c.rendered} rendered · ${c.memoized} memoised`,
        { text: c.trigger, tone: this.color("--dt-text-3") },
      ]);
    } else if (kind === "down" && index >= 0) {
      this.props.onSelect(this.props.commits[index]!.id);
    }
  }

  protected override onLeave(): void {
    this.hover = -1;
    this.redraw();
  }

  protected override onWheel(event: WheelEvent): void {
    const n = this.props.commits.length;
    if (n === 0) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    event.preventDefault();
    this.offset = Math.max(0, this.offset + (delta > 0 ? -3 : 3));
    this.redraw();
  }

  protected override onKey(event: KeyboardEvent): void {
    const { commits, selected } = this.props;
    if (commits.length === 0) return;
    const index = selected === null ? commits.length - 1 : commits.findIndex((c) => c.id === selected);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.max(0, Math.min(commits.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
      this.props.onSelect(commits[next]!.id);
    } else if (event.key === "End") {
      event.preventDefault();
      this.offset = 0;
      this.props.onSelect(commits[commits.length - 1]!.id);
    }
  }
}

export function commitChart(props: CommitChartProps): VNode {
  return h(CommitChart, props);
}

/* ========================================================================== */
/*  Flame chart                                                                */
/* ========================================================================== */

export interface FlameChartProps extends CanvasBaseProps {
  nodes: ReadonlyArray<FlameNode>;
  total: number;
  maxSelf: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onHover?: (key: string | null) => void;
  /** Changes when the commit changes, which resets the zoom. */
  version: unknown;
}

const ROW = 20;

export class FlameChart extends CanvasWidget<FlameChartProps> {
  private v0 = 0;
  private v1 = 1;
  private hoverKey: string | null = null;
  private drag: { x: number; v0: number; v1: number; moved: boolean } | null = null;

  override mount(): Element {
    this.v1 = this.props.total || 1;
    const el = super.mount();
    (el as HTMLElement).tabIndex = 0;
    return el;
  }

  protected override changed(previous: FlameChartProps): void {
    if (this.props.version !== previous.version) {
      this.v0 = 0;
      this.v1 = this.props.total || 1;
    }
  }

  resetZoom(): void {
    this.v0 = 0;
    this.v1 = this.props.total || 1;
    this.redraw();
  }

  private x(t: number): number {
    return ((t - this.v0) / Math.max(1e-9, this.v1 - this.v0)) * this.width;
  }

  protected draw(g: CanvasRenderingContext2D): void {
    const { nodes, maxSelf, selected } = this.props;
    const light = isLight(this.el);
    const memoFill = this.color("--dt-bg-active");
    const memoLine = this.color("--dt-border-strong");
    const text = light ? "#0b0f19" : "#0c0e14";
    const textMuted = this.color("--dt-text-3");
    g.font = this.font(10.5, 600);
    g.textBaseline = "middle";
    for (const node of nodes) {
      const x0 = this.x(node.start);
      const x1 = this.x(node.start + node.total);
      if (x1 < 0 || x0 > this.width) continue;
      const w = Math.max(1, x1 - x0 - 1);
      const y = 4 + node.depth * ROW;
      const isSel = node.key === selected;
      const isHover = node.key === this.hoverKey;
      if (node.phase === "memo") {
        g.fillStyle = memoFill;
        roundRect(g, x0, y, w, ROW - 2, 3);
        g.fill();
        g.strokeStyle = memoLine;
        g.lineWidth = 1;
        g.stroke();
      } else {
        g.fillStyle = heat(maxSelf > 0 ? node.self / maxSelf : 0, light);
        g.globalAlpha = isHover || isSel ? 1 : 0.9;
        roundRect(g, x0, y, w, ROW - 2, 3);
        g.fill();
        g.globalAlpha = 1;
      }
      if (isSel || isHover) {
        g.strokeStyle = isSel ? this.color("--dt-text") : this.color("--dt-text-2");
        g.lineWidth = isSel ? 2 : 1;
        roundRect(g, x0 + 0.5, y + 0.5, w - 1, ROW - 3, 3);
        g.stroke();
      }
      if (w > 26) {
        const label = node.phase === "memo" ? `${node.name} (memo)` : `${node.name} ${fmtMs(node.self)}`;
        g.fillStyle = node.phase === "memo" ? textMuted : text;
        g.fillText(fitText(g, label, w - 10), x0 + 5, y + (ROW - 2) / 2 + 0.5);
      }
    }
    if (nodes.length === 0) {
      g.fillStyle = textMuted;
      g.font = this.font(11, 500);
      g.fillText("No component spans in this commit.", 8, 16);
    }
  }

  private nodeAt(x: number, y: number): FlameNode | null {
    const depth = Math.floor((y - 4) / ROW);
    const t = this.v0 + (x / Math.max(1, this.width)) * (this.v1 - this.v0);
    for (const node of this.props.nodes) {
      if (node.depth !== depth) continue;
      if (t >= node.start && t <= node.start + node.total) return node;
    }
    return null;
  }

  protected override onPointer(kind: "move" | "down" | "up" | "dbl", x: number, y: number, event: PointerEvent): void {
    if (kind === "down") {
      this.drag = { x, v0: this.v0, v1: this.v1, moved: false };
      try { (this.el as HTMLElement).setPointerCapture(event.pointerId); } catch { /* ignore */ }
      return;
    }
    if (kind === "move" && this.drag) {
      const dx = x - this.drag.x;
      if (Math.abs(dx) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        const span = this.drag.v1 - this.drag.v0;
        const dt = (dx / Math.max(1, this.width)) * span;
        const total = this.props.total || 1;
        let v0 = this.drag.v0 - dt;
        v0 = Math.max(0, Math.min(total - span, v0));
        this.v0 = v0;
        this.v1 = v0 + span;
        this.hideTip();
        this.redraw();
        return;
      }
    }
    if (kind === "up") {
      const wasDrag = this.drag?.moved;
      this.drag = null;
      if (!wasDrag) this.props.onSelect(this.nodeAt(x, y)?.key ?? null);
      return;
    }
    if (kind === "dbl") {
      const node = this.nodeAt(x, y);
      if (node && node.total > 0) {
        const pad = node.total * 0.04;
        this.v0 = Math.max(0, node.start - pad);
        this.v1 = Math.min(this.props.total || 1, node.start + node.total + pad);
      } else {
        this.resetZoom();
      }
      this.redraw();
      return;
    }
    const node = this.nodeAt(x, y);
    const key = node?.key ?? null;
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.props.onHover?.(key);
      this.redraw();
    }
    if (!node) { this.hideTip(); return; }
    this.showTip(x, y, [
      { text: node.name, bold: true },
      node.phase === "memo"
        ? "Skipped — memoised this commit"
        : `self ${fmtMs(node.self)} · total ${fmtMs(node.total)}${node.phase === "mount" ? " · mounted" : ""}`,
      { text: node.reason, tone: this.color("--dt-text-3") },
      ...(node.deps && node.deps.length > 0 ? [{ text: `reads ${node.deps.slice(0, 6).map((d) => `$${d}`).join(", ")}${node.deps.length > 6 ? "…" : ""}`, tone: this.color("--dt-syn-state") }] : []),
    ]);
  }

  protected override onLeave(): void {
    if (this.hoverKey !== null) {
      this.hoverKey = null;
      this.props.onHover?.(null);
      this.redraw();
    }
  }

  protected override onWheel(event: WheelEvent): void {
    const total = this.props.total || 1;
    event.preventDefault();
    const rect = (this.el as HTMLElement).getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(1, this.width);
    const span = this.v1 - this.v0;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
      const dt = ((event.shiftKey ? event.deltaY : event.deltaX) / Math.max(1, this.width)) * span;
      const v0 = Math.max(0, Math.min(total - span, this.v0 + dt));
      this.v0 = v0;
      this.v1 = v0 + span;
    } else {
      const factor = Math.exp(event.deltaY * 0.0022);
      const nextSpan = Math.max(total / 2000, Math.min(total, span * factor));
      const anchor = this.v0 + px * span;
      let v0 = anchor - px * nextSpan;
      v0 = Math.max(0, Math.min(total - nextSpan, v0));
      this.v0 = v0;
      this.v1 = v0 + nextSpan;
    }
    this.hideTip();
    this.redraw();
  }

  protected override onKey(event: KeyboardEvent): void {
    if (event.key === "Escape" || event.key === "0") {
      this.resetZoom();
    }
  }
}

export function flameChart(props: FlameChartProps): VNode {
  return h(FlameChart, props);
}

/* ========================================================================== */
/*  Timeline chart                                                             */
/* ========================================================================== */

export interface TimelineItem {
  id: string;
  track: string;
  start: number;
  /** Omit for an instant event. */
  end?: number;
  /** Theme token for the fill (`--dt-k-network`). */
  color: string;
  label: string;
  detail?: string;
  /** Emphasise (errors, slow commits). */
  alert?: boolean;
}

export interface TimelineTrack {
  id: string;
  label: string;
  color: string;
}

export interface TimelineChartProps extends CanvasBaseProps {
  tracks: ReadonlyArray<TimelineTrack>;
  items: ReadonlyArray<TimelineItem>;
  /** Data extent, in the model clock. */
  start: number;
  end: number;
  /** Zoom window; null follows the most recent `window` ms live. */
  view: { start: number; end: number } | null;
  onView: (view: { start: number; end: number } | null) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  brush: { start: number; end: number } | null;
  onBrush: (range: { start: number; end: number } | null) => void;
  /** Live window length when following. */
  window?: number;
  /** Optional FPS samples [time, fps], drawn as a line over the first track. */
  fps?: ReadonlyArray<readonly [number, number]>;
}

const GUTTER = 92;
const AXIS = 22;
const LANE = 12;
const TRACK_PAD = 6;

interface TrackBox {
  track: TimelineTrack;
  top: number;
  height: number;
  lanes: number;
}

export class TimelineChart extends CanvasWidget<TimelineChartProps> {
  private boxes: TrackBox[] = [];
  private laneOf = new Map<string, number>();
  private hoverId: string | null = null;
  private drag: { mode: "pan" | "brush"; x: number; t: number; view: { start: number; end: number }; moved: boolean } | null = null;
  private liveView: { start: number; end: number } | null = null;

  override mount(): Element {
    this.layout();
    const el = super.mount();
    (el as HTMLElement).tabIndex = 0;
    return el;
  }

  protected override changed(previous: TimelineChartProps): void {
    if (this.props.items !== previous.items || this.props.tracks !== previous.tracks) this.layout();
  }

  /** Assign lanes per track and compute the vertical layout. */
  private layout(): void {
    this.laneOf.clear();
    const byTrack = new Map<string, TimelineItem[]>();
    for (const item of this.props.items) {
      const bucket = byTrack.get(item.track);
      if (bucket) bucket.push(item);
      else byTrack.set(item.track, [item]);
    }
    let top = AXIS;
    this.boxes = [];
    for (const track of this.props.tracks) {
      const items = byTrack.get(track.id) ?? [];
      const span = Math.max(1, (this.props.end - this.props.start) / 400);
      const { lanes, count } = packLanes(items.map((it) => ({ start: it.start, end: Math.max(it.end ?? it.start, it.start) + span })), 4);
      items.forEach((item, i) => this.laneOf.set(item.id, lanes[i]!));
      const height = TRACK_PAD * 2 + count * LANE;
      this.boxes.push({ track, top, height, lanes: count });
      top += height;
    }
  }

  /** The height this chart wants for its tracks (the view sizes the widget with it). */
  static heightFor(tracks: number, laneCounts: number = tracks): number {
    return AXIS + tracks * TRACK_PAD * 2 + laneCounts * LANE + 2;
  }

  private window(): { start: number; end: number } {
    if (this.props.view) return this.props.view;
    const span = this.props.window ?? 10_000;
    const end = Math.max(this.props.end, this.props.start + 1);
    const start = Math.max(this.props.start, end - span);
    this.liveView = { start, end: Math.max(end, start + 1) };
    return this.liveView;
  }

  private xOf(t: number, view: { start: number; end: number }): number {
    return GUTTER + ((t - view.start) / Math.max(1e-9, view.end - view.start)) * (this.width - GUTTER - 6);
  }

  private tOf(x: number, view: { start: number; end: number }): number {
    return view.start + ((x - GUTTER) / Math.max(1, this.width - GUTTER - 6)) * (view.end - view.start);
  }

  protected draw(g: CanvasRenderingContext2D): void {
    const view = this.window();
    const span = view.end - view.start;
    const text2 = this.color("--dt-text-2");
    const text3 = this.color("--dt-text-3");
    const border = this.color("--dt-border");
    const bgElev = this.color("--dt-bg-elev");

    // Track backgrounds + labels.
    g.textBaseline = "middle";
    this.boxes.forEach((box, i) => {
      if (i % 2 === 1) {
        g.fillStyle = bgElev;
        g.fillRect(0, box.top, this.width, box.height);
      }
      g.fillStyle = this.color(box.track.color);
      roundRect(g, 10, box.top + box.height / 2 - 4, 8, 8, 2);
      g.fill();
      g.fillStyle = text2;
      g.font = this.font(10.5, 600);
      g.fillText(fitText(g, box.track.label, GUTTER - 30), 24, box.top + box.height / 2);
      g.strokeStyle = border;
      g.beginPath();
      g.moveTo(0, box.top + box.height + 0.5);
      g.lineTo(this.width, box.top + box.height + 0.5);
      g.stroke();
    });
    g.strokeStyle = border;
    g.beginPath();
    g.moveTo(GUTTER + 0.5, 0);
    g.lineTo(GUTTER + 0.5, this.height);
    g.stroke();

    // Axis + grid.
    const ticks = niceTicks(view.start - this.props.start, view.end - this.props.start, Math.max(3, Math.floor((this.width - GUTTER) / 90)));
    g.font = this.font(9.5, 500);
    for (const offset of ticks) {
      const x = this.xOf(this.props.start + offset, view);
      if (x < GUTTER || x > this.width) continue;
      g.strokeStyle = border;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, AXIS - 4);
      g.lineTo(Math.round(x) + 0.5, this.height);
      g.stroke();
      g.fillStyle = text3;
      g.fillText(tickLabel(offset, span), x + 3, AXIS / 2);
    }

    // Brush.
    const brush = this.props.brush;
    if (brush) {
      const bx0 = Math.max(GUTTER, this.xOf(brush.start, view));
      const bx1 = Math.min(this.width, this.xOf(brush.end, view));
      if (bx1 > bx0) {
        g.fillStyle = this.color("--dt-accent-soft");
        g.fillRect(bx0, AXIS - 4, bx1 - bx0, this.height - AXIS + 4);
        g.strokeStyle = this.color("--dt-accent");
        g.lineWidth = 1;
        g.strokeRect(bx0 + 0.5, AXIS - 3.5, bx1 - bx0 - 1, this.height - AXIS + 3);
      }
    }

    // Items.
    const boxOf = new Map(this.boxes.map((box) => [box.track.id, box]));
    g.save();
    g.beginPath();
    g.rect(GUTTER + 1, AXIS - 4, this.width - GUTTER - 1, this.height - AXIS + 4);
    g.clip();
    for (const item of this.props.items) {
      const box = boxOf.get(item.track);
      if (!box) continue;
      const end = item.end ?? item.start;
      if (end < view.start || item.start > view.end) continue;
      const lane = this.laneOf.get(item.id) ?? 0;
      const y = box.top + TRACK_PAD + lane * LANE;
      const x0 = this.xOf(item.start, view);
      const x1 = this.xOf(end, view);
      const isSel = item.id === this.props.selected;
      const isHover = item.id === this.hoverId;
      g.fillStyle = this.color(item.color);
      g.globalAlpha = isSel || isHover ? 1 : item.alert ? 0.95 : 0.78;
      if (item.end !== undefined && x1 - x0 >= 2) {
        roundRect(g, x0, y + 1, Math.max(2, x1 - x0), LANE - 3, 2.5);
        g.fill();
      } else {
        // Instant: a diamond.
        const cx = x0;
        const cy = y + (LANE - 1) / 2;
        const r = item.alert ? 4.2 : 3.4;
        g.beginPath();
        g.moveTo(cx, cy - r);
        g.lineTo(cx + r, cy);
        g.lineTo(cx, cy + r);
        g.lineTo(cx - r, cy);
        g.closePath();
        g.fill();
      }
      if (isSel) {
        g.globalAlpha = 1;
        g.strokeStyle = this.color("--dt-text");
        g.lineWidth = 1.5;
        g.strokeRect(Math.round(x0) - 1.5, y - 0.5, Math.max(4, x1 - x0) + 3, LANE);
      }
    }
    g.globalAlpha = 1;

    // FPS overlay on the first track.
    const fps = this.props.fps;
    const first = this.boxes[0];
    if (fps && fps.length > 1 && first) {
      g.strokeStyle = this.color("--dt-green");
      g.globalAlpha = 0.8;
      g.lineWidth = 1.25;
      g.beginPath();
      let started = false;
      for (const [t, value] of fps) {
        if (t < view.start - 1000 || t > view.end + 1000) continue;
        const x = this.xOf(t, view);
        const y = first.top + first.height - 2 - Math.min(1, value / 60) * (first.height - 4);
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();

    // Live head.
    if (!this.props.view) {
      const x = this.xOf(this.props.end, view);
      g.strokeStyle = this.color("--dt-accent");
      g.globalAlpha = 0.7;
      g.beginPath();
      g.moveTo(Math.round(x) - 0.5, AXIS - 4);
      g.lineTo(Math.round(x) - 0.5, this.height);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  private itemAt(x: number, y: number): TimelineItem | null {
    if (x < GUTTER) return null;
    const view = this.window();
    const box = this.boxes.find((b) => y >= b.top && y < b.top + b.height);
    if (!box) return null;
    const lane = Math.floor((y - box.top - TRACK_PAD) / LANE);
    const tolerance = ((view.end - view.start) / Math.max(1, this.width - GUTTER)) * 5;
    let best: TimelineItem | null = null;
    let bestDist = Infinity;
    for (const item of this.props.items) {
      if (item.track !== box.track.id) continue;
      if ((this.laneOf.get(item.id) ?? 0) !== lane) continue;
      const t = this.tOf(x, view);
      const end = item.end ?? item.start;
      const dist = t < item.start ? item.start - t : t > end ? t - end : 0;
      if (dist <= tolerance && dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    return best;
  }

  protected override onPointer(kind: "move" | "down" | "up" | "dbl", x: number, y: number, event: PointerEvent): void {
    const view = this.window();
    if (kind === "down") {
      if (x < GUTTER) return;
      this.drag = { mode: event.shiftKey ? "brush" : "pan", x, t: this.tOf(x, view), view: { ...view }, moved: false };
      try { (this.el as HTMLElement).setPointerCapture(event.pointerId); } catch { /* ignore */ }
      return;
    }
    if (kind === "move" && this.drag) {
      if (Math.abs(x - this.drag.x) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        this.hideTip();
        if (this.drag.mode === "pan") {
          const span = this.drag.view.end - this.drag.view.start;
          const dt = ((x - this.drag.x) / Math.max(1, this.width - GUTTER)) * span;
          const start = this.drag.view.start - dt;
          this.props.onView({ start, end: start + span });
        } else {
          const t = this.tOf(x, this.drag.view);
          this.props.onBrush({ start: Math.min(t, this.drag.t), end: Math.max(t, this.drag.t) });
        }
        return;
      }
    }
    if (kind === "up") {
      const drag = this.drag;
      this.drag = null;
      if (drag && !drag.moved) {
        const item = this.itemAt(x, y);
        this.props.onSelect(item?.id ?? null);
      }
      return;
    }
    if (kind === "dbl") {
      this.props.onView(null);
      this.props.onBrush(null);
      return;
    }
    const item = this.itemAt(x, y);
    const id = item?.id ?? null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.redraw();
    }
    if (!item) { this.hideTip(); return; }
    const offset = item.start - this.props.start;
    this.showTip(x, y, [
      { text: item.label, bold: true },
      ...(item.detail ? [item.detail] : []),
      { text: `+${fmtMs(offset)}${item.end !== undefined ? ` · ${fmtMs(item.end - item.start)}` : ""}`, tone: this.color("--dt-text-3") },
    ]);
  }

  protected override onWheel(event: WheelEvent): void {
    event.preventDefault();
    const view = this.window();
    const rect = (this.el as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const span = view.end - view.start;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
      const dt = ((event.shiftKey ? event.deltaY : event.deltaX) / Math.max(1, this.width - GUTTER)) * span;
      this.props.onView({ start: view.start + dt, end: view.end + dt });
      return;
    }
    const factor = Math.exp(event.deltaY * 0.002);
    const nextSpan = Math.max(2, Math.min((this.props.end - this.props.start) * 1.5 + 1000, span * factor));
    const anchor = this.tOf(Math.max(GUTTER, x), view);
    const px = (anchor - view.start) / Math.max(1e-9, span);
    const start = anchor - px * nextSpan;
    this.props.onView({ start, end: start + nextSpan });
  }

  protected override onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.props.onBrush(null);
      this.props.onView(null);
    }
  }
}

export function timelineChart(props: TimelineChartProps): VNode {
  return h(TimelineChart, props);
}

/**
 * The height a {@link TimelineChart} needs for `tracks`, computed with the SAME
 * lane packing the widget uses — so the view can size the widget without the
 * two ever disagreeing about how many lanes a busy track takes.
 */
export function timelineHeight(tracks: ReadonlyArray<TimelineTrack>, items: ReadonlyArray<TimelineItem>, start: number, end: number): number {
  const span = Math.max(1, (end - start) / 400);
  let height = AXIS;
  for (const track of tracks) {
    const own = items.filter((item) => item.track === track.id);
    const { count } = packLanes(own.map((it) => ({ start: it.start, end: Math.max(it.end ?? it.start, it.start) + span })), 4);
    height += TRACK_PAD * 2 + count * LANE;
  }
  return height + 2;
}
