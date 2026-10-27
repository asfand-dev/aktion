/**
 * Aktion DevTools — web vitals, frame rate, and interactions.
 *
 * The render profiler measures the runtime's own work. Users experience
 * something else: how long a click takes to paint (INP), whether the largest
 * element arrived quickly (LCP), whether things jumped around (CLS), and
 * whether scrolling stayed at 60fps. Those come from the browser's own
 * performance timeline, observed here for as long as the panel is open.
 *
 * Every observer is optional — Safari and Firefox support a subset — and a
 * missing entry type is reported as "not supported", never as a zero.
 */
export interface InteractionRecord {
    id: number;
    type: string;
    target: string;
    /** `performance.now()` timestamp of the input event. */
    start: number;
    duration: number;
    /** Time from input to the first event handler starting. */
    inputDelay: number;
    /** Time spent running event handlers. */
    processing: number;
    /** Time from the handlers finishing to the next paint. */
    presentation: number;
}
export interface LongTaskRecord {
    start: number;
    duration: number;
    /** Long-animation-frame attribution, when supported. */
    scripts?: Array<{
        source: string;
        invoker: string;
        duration: number;
    }>;
    blocking?: number;
}
export interface LayoutShiftRecord {
    time: number;
    value: number;
    sources: string[];
}
export interface VitalsSnapshot {
    supported: {
        eventTiming: boolean;
        lcp: boolean;
        cls: boolean;
        longTasks: boolean;
        loaf: boolean;
        memory: boolean;
    };
    fps: number | null;
    /** `[performance.now(), fps]`, oldest first. */
    fpsSamples: ReadonlyArray<readonly [number, number]>;
    /** Frames longer than 50ms since the monitor started. */
    droppedFrames: number;
    lcp: {
        value: number;
        element: string;
        size: number;
    } | null;
    cls: {
        value: number;
        shifts: ReadonlyArray<LayoutShiftRecord>;
    };
    inp: {
        value: number;
        interaction: InteractionRecord;
    } | null;
    interactions: ReadonlyArray<InteractionRecord>;
    longTasks: ReadonlyArray<LongTaskRecord>;
    fcp: number | null;
    ttfb: number | null;
    heap: {
        used: number;
        total: number;
        limit: number;
    } | null;
    heapSamples: ReadonlyArray<readonly [number, number]>;
}
export declare function emptyVitals(): VitalsSnapshot;
/** Core Web Vitals thresholds: [good, needs-improvement] upper bounds. */
export declare const THRESHOLDS: {
    readonly lcp: readonly [2500, 4000];
    readonly inp: readonly [200, 500];
    readonly cls: readonly [0.1, 0.25];
    readonly fcp: readonly [1800, 3000];
    readonly ttfb: readonly [800, 1800];
};
export declare function rate(metric: keyof typeof THRESHOLDS, value: number | null | undefined): "good" | "needs-improvement" | "poor" | "unknown";
/**
 * INP per the web-vitals definition: the worst interaction, ignoring one
 * outlier for every 50 interactions (so one GC pause in a long session does
 * not define the page).
 */
export declare function computeInp(interactions: ReadonlyArray<InteractionRecord>): {
    value: number;
    interaction: InteractionRecord;
} | null;
/** CLS: the largest session window (gaps < 1s, windows ≤ 5s). */
export declare function computeCls(shifts: ReadonlyArray<LayoutShiftRecord>): number;
/**
 * True for a node inside the DevTools panel or its page overlay. Clicking the
 * debugger is not an interaction with the app, and counting it would make the
 * panel's own work show up as the app's INP.
 */
export declare function isDevtoolsNode(node: Node | null | undefined): boolean;
/**
 * Observes the page while the panel is open. `onChange` is throttled to the
 * rate a status bar can usefully show; the panel decides whether to repaint.
 */
export declare class VitalsMonitor {
    private data;
    private observers;
    private frameHandle;
    private heapTimer;
    private frames;
    private windowStart;
    private lastFrame;
    private onChange;
    private notifyPending;
    private running;
    private readonly interactions;
    get isRunning(): boolean;
    snapshot(): VitalsSnapshot;
    start(onChange: () => void): void;
    stop(): void;
    /** Pause the frame loop while the panel is hidden — sampling FPS is not free. */
    setFrameSampling(enabled: boolean): void;
    private notify;
    private mutate;
    private observe;
    private observeAll;
    private readNavigation;
    private startFrames;
    private startHeap;
}
