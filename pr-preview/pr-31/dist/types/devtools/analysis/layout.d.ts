import { CommitRecord, ComponentRenderRecord } from '../protocol.js';
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
export declare function layoutFlame(commit: Pick<CommitRecord, "components">, previous?: ReadonlyMap<string, number>): FlameLayout;
/** Inclusive time of every instance that rendered in `commit`, for estimating memoised widths next time. */
export declare function inclusiveTimes(layout: FlameLayout): Map<string, number>;
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
export declare function packLanes(spans: ReadonlyArray<Span>, maxLanes?: number, gap?: number): {
    lanes: number[];
    count: number;
};
/** Evenly spaced "nice" ticks (1/2/5 × 10ⁿ) covering [start, end]. */
export declare function niceTicks(start: number, end: number, targetCount?: number): number[];
/** Axis label for an offset in ms. */
export declare function tickLabel(ms: number, span: number): string;
