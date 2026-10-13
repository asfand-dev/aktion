import { VNode } from '../core/vdom.js';
import { CanvasWidget, CanvasBaseProps } from '../core/canvas.js';
import { FlameNode } from '../analysis/layout.js';
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
export declare class CommitChart extends CanvasWidget<CommitChartProps> {
    private hover;
    /** Bars hidden off the right edge (scrolled back in time). */
    private offset;
    mount(): Element;
    private geometry;
    protected changed(previous: CommitChartProps): void;
    protected draw(g: CanvasRenderingContext2D): void;
    private indexAt;
    protected onPointer(kind: "move" | "down" | "up" | "dbl", x: number, y: number): void;
    protected onLeave(): void;
    protected onWheel(event: WheelEvent): void;
    protected onKey(event: KeyboardEvent): void;
}
export declare function commitChart(props: CommitChartProps): VNode;
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
export declare class FlameChart extends CanvasWidget<FlameChartProps> {
    private v0;
    private v1;
    private hoverKey;
    private drag;
    mount(): Element;
    protected changed(previous: FlameChartProps): void;
    resetZoom(): void;
    private x;
    protected draw(g: CanvasRenderingContext2D): void;
    private nodeAt;
    protected onPointer(kind: "move" | "down" | "up" | "dbl", x: number, y: number, event: PointerEvent): void;
    protected onLeave(): void;
    protected onWheel(event: WheelEvent): void;
    protected onKey(event: KeyboardEvent): void;
}
export declare function flameChart(props: FlameChartProps): VNode;
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
    view: {
        start: number;
        end: number;
    } | null;
    onView: (view: {
        start: number;
        end: number;
    } | null) => void;
    selected: string | null;
    onSelect: (id: string | null) => void;
    brush: {
        start: number;
        end: number;
    } | null;
    onBrush: (range: {
        start: number;
        end: number;
    } | null) => void;
    /** Live window length when following. */
    window?: number;
    /** Optional FPS samples [time, fps], drawn as a line over the first track. */
    fps?: ReadonlyArray<readonly [number, number]>;
}
export declare class TimelineChart extends CanvasWidget<TimelineChartProps> {
    private boxes;
    private laneOf;
    private hoverId;
    private drag;
    private liveView;
    mount(): Element;
    protected changed(previous: TimelineChartProps): void;
    /** Assign lanes per track and compute the vertical layout. */
    private layout;
    /** The height this chart wants for its tracks (the view sizes the widget with it). */
    static heightFor(tracks: number, laneCounts?: number): number;
    private window;
    private xOf;
    private tOf;
    protected draw(g: CanvasRenderingContext2D): void;
    private itemAt;
    protected onPointer(kind: "move" | "down" | "up" | "dbl", x: number, y: number, event: PointerEvent): void;
    protected onWheel(event: WheelEvent): void;
    protected onKey(event: KeyboardEvent): void;
}
export declare function timelineChart(props: TimelineChartProps): VNode;
/**
 * The height a {@link TimelineChart} needs for `tracks`, computed with the SAME
 * lane packing the widget uses — so the view can size the widget without the
 * two ever disagreeing about how many lanes a busy track takes.
 */
export declare function timelineHeight(tracks: ReadonlyArray<TimelineTrack>, items: ReadonlyArray<TimelineItem>, start: number, end: number): number;
