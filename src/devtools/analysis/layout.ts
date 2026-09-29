/**
 * Aktion DevTools — chart layout.
 *
 * Pure geometry for the canvas charts, kept apart from the drawing code so it
 * can be tested without a canvas: flame-chart spans, timeline lane packing,
 * and axis ticks.
 */

import type { CommitRecord, ComponentRenderRecord } from "../protocol.js";
import { parentKeyOf } from "../tree.js";

/* -------------------------------------------------------------------------- */
/*  Flame chart                                                                */
/* -------------------------------------------------------------------------- */

export interface FlameNode {
  key: string;
  name: string;
  kind: ComponentRenderRecord["kind"];
  phase: ComponentRenderRecord["phase"];
  /** Exclusive time, ms. */
  self: number;
  /** Inclusive time, ms — the span's width. */
  total: number;
  /** Offset from the commit's start of the span, in the same time units. */
  start: number;
  depth: number;
  reason: string;
  deps?: string[];
  /** Width came from a previous commit (a memoised instance, drawn hatched). */
  estimated?: boolean;
}

export interface FlameLayout {
  nodes: FlameNode[];
  /** Sum of the roots' inclusive time. */
  total: number;
  maxDepth: number;
  maxSelf: number;
}

/**
 * Lay out one commit as a flame chart.
 *
 * The profiler's timings are not uniform, and the layout has to respect that
 * rather than paper over it: a USER component's `selfTime` covers its body
 * only (its returned subtree renders afterwards, outside that measurement), so
 * its span is self + children; a LIBRARY component's `selfTime` already
 * includes the children it rendered synchronously, so its span is that time
 * (never less than its children, which absorbs clock jitter).
 *
 * A memoised instance did no work this commit, so it has no measured width.
 * Drawing it at zero would hide exactly the instances memoisation saved; it is
 * drawn at the width it had the last time it rendered (`previous`), marked as
 * estimated, or at a hairline when it has never been seen rendering.
 */
export function layoutFlame(commit: Pick<CommitRecord, "components">, previous?: ReadonlyMap<string, number>): FlameLayout {
  const records = new Map<string, ComponentRenderRecord>();
  for (const record of commit.components) records.set(record.instanceKey, record);
  const keys = new Set(records.keys());
  const children = new Map<string | null, string[]>();
  for (const key of records.keys()) {
    const parent = parentKeyOf(key, keys);
    const bucket = children.get(parent);
    if (bucket) bucket.push(key);
    else children.set(parent, [key]);
  }

  let sumSelf = 0;
  for (const record of records.values()) sumSelf += record.selfTime;
  const epsilon = Math.max(0.001, sumSelf * 0.004);

  const totals = new Map<string, number>();
  const estimated = new Set<string>();
  const inclusive = (key: string, guard: number): number => {
    const cached = totals.get(key);
    if (cached !== undefined) return cached;
    const record = records.get(key)!;
    let childSum = 0;
    if (guard < 400) for (const child of children.get(key) ?? []) childSum += inclusive(child, guard + 1);
    let value: number;
    if (record.phase === "memo") {
      const prior = previous?.get(key);
      value = Math.max(prior ?? epsilon, childSum);
      estimated.add(key);
    } else if (record.kind === "library") {
      value = Math.max(record.selfTime, childSum);
    } else {
      value = record.selfTime + childSum;
    }
    totals.set(key, value);
    return value;
  };

  const nodes: FlameNode[] = [];
  let maxDepth = 0;
  let maxSelf = 0;
  const place = (key: string, start: number, depth: number, guard: number): void => {
    const record = records.get(key)!;
    const total = inclusive(key, 0);
    let childSum = 0;
    for (const child of children.get(key) ?? []) childSum += totals.get(child) ?? inclusive(child, 0);
    const self = record.phase === "memo" ? 0 : Math.max(0, total - childSum);
    if (depth > maxDepth) maxDepth = depth;
    if (self > maxSelf) maxSelf = self;
    nodes.push({
      key, name: record.name, kind: record.kind, phase: record.phase,
      self, total, start, depth, reason: record.reason, deps: record.deps,
      estimated: estimated.has(key) || undefined,
    });
    if (guard > 400) return;
    // User components pay their own body time first, then their children run.
    let cursor = start + (record.kind === "user" && record.phase !== "memo" ? record.selfTime : 0);
    // Library spans may be wider than their children; centre nothing, just pack left.
    for (const child of children.get(key) ?? []) {
      place(child, cursor, depth + 1, guard + 1);
      cursor += totals.get(child) ?? 0;
    }
  };

  let cursor = 0;
  for (const root of children.get(null) ?? []) {
    place(root, cursor, 0, 0);
    cursor += totals.get(root) ?? 0;
  }
  return { nodes, total: cursor, maxDepth, maxSelf };
}

/** Inclusive time of every instance that rendered in `commit`, for estimating memoised widths next time. */
export function inclusiveTimes(layout: FlameLayout): Map<string, number> {
  const out = new Map<string, number>();
  for (const node of layout.nodes) if (!node.estimated) out.set(node.key, node.total);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Timeline lanes                                                             */
/* -------------------------------------------------------------------------- */

export interface Span {
  start: number;
  end: number;
}

/**
 * Greedy interval packing: each span takes the first lane whose last span has
 * already ended. Stable for input sorted by start; returns the lane per index
 * and the lane count. `gap` keeps near-touching spans on separate lanes so two
 * adjacent requests read as two.
 */
export function packLanes(spans: ReadonlyArray<Span>, maxLanes = 8, gap = 0): { lanes: number[]; count: number } {
  const order = spans.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start || a.index - b.index);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(spans.length).fill(0);
  for (const { span, index } of order) {
    let lane = laneEnds.findIndex((end) => end + gap <= span.start);
    if (lane < 0) {
      if (laneEnds.length < maxLanes) {
        lane = laneEnds.length;
        laneEnds.push(span.end);
      } else {
        // Overflow shares the lane that frees up soonest.
        lane = laneEnds.indexOf(Math.min(...laneEnds));
        laneEnds[lane] = Math.max(laneEnds[lane]!, span.end);
      }
    } else {
      laneEnds[lane] = span.end;
    }
    lanes[index] = lane;
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}

/* -------------------------------------------------------------------------- */
/*  Axis ticks                                                                 */
/* -------------------------------------------------------------------------- */

/** Evenly spaced "nice" ticks (1/2/5 × 10ⁿ) covering [start, end]. */
export function niceTicks(start: number, end: number, targetCount = 8): number[] {
  const span = end - start;
  if (!(span > 0) || !Number.isFinite(span)) return [start];
  const raw = span / Math.max(1, targetCount);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const first = Math.ceil(start / step) * step;
  const out: number[] = [];
  for (let t = first; t <= end + step * 1e-9 && out.length < 200; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

/** Axis label for an offset in ms. */
export function tickLabel(ms: number, span: number): string {
  if (span >= 120_000) return `${Math.round(ms / 1000)}s`;
  if (span >= 5_000) return `${(ms / 1000).toFixed(1)}s`;
  if (span >= 200) return `${Math.round(ms)}ms`;
  if (span >= 10) return `${ms.toFixed(1)}ms`;
  return `${ms.toFixed(2)}ms`;
}
