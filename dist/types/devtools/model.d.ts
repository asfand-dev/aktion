import { CommitRecord, ComponentRenderRecord, DevtoolsEvent, EffectEvent, EmitEvent, ErrorEvent, LogEvent, RouteEvent } from './protocol.js';
/**
 * Retention caps. A DevTools session that quietly grows without bound is a
 * memory leak with a UI, and — worse for debugging — it changes the timings of
 * the very app it is measuring. Every list here is a ring.
 */
export declare const CAPS: {
    readonly commits: 300;
    readonly effects: 600;
    readonly network: 300;
    readonly routes: 200;
    readonly emits: 200;
    readonly logs: 500;
    readonly errors: 200;
    /** State snapshots retained for time travel. */
    readonly history: 60;
};
/**
 * One HTTP request, merged from its `start` event and its terminal event.
 *
 * The protocol reports the two halves separately (a request in flight is a
 * thing you need to see), but every view wants one row, so the merge happens
 * once here rather than in each tab.
 */
export interface NetworkRequest {
    requestId: string;
    method: string;
    url: string;
    /** `pending` until a terminal event arrives. */
    phase: "pending" | "success" | "error" | "mock" | "blocked";
    startTime: number;
    endTime?: number;
    duration?: number;
    status?: number;
    requestHeaders?: Record<string, string>;
    requestBody?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    responseSize?: number;
    error?: string;
    rule?: string;
    injectedDelay?: number;
}
/** One console line, as captured by the panel's console tap. */
export interface LogEntry {
    level: LogEvent["level"];
    /** Rendered arguments, joined for display. */
    text: string;
    /** Individual arguments, for the expanded view. */
    args: string[];
    origin: string;
    time: number;
    /** Consecutive duplicates are collapsed into one row with a count. */
    count: number;
    /** Capture-site stack, when the environment provides one. */
    stack?: string;
}
/** A state snapshot kept for time travel, tagged with what produced it. */
export interface HistoryEntry {
    /** Commit id when the snapshot came from a commit, else `null`. */
    commitId: number | null;
    time: number;
    changedPaths: string[];
    snapshot: Record<string, unknown>;
}
/** One version of the program text, for the Source tab's undo. */
export interface ProgramVersion {
    text: string;
    /** Wall-clock time (epoch ms) the version was first seen. */
    at: number;
    lines: number;
}
/** A long task the browser reported while the session was recording. */
export interface LongTask {
    /** `performance.now()` start. */
    start: number;
    duration: number;
}
/** Per-app derived model the panel maintains from the event stream. */
export interface AppModel {
    commits: CommitRecord[];
    effects: EffectEvent[];
    network: NetworkRequest[];
    routes: RouteEvent[];
    emits: EmitEvent[];
    logs: LogEntry[];
    errors: ErrorEvent[];
    /** Latest full `$state` snapshot. */
    state: Record<string, unknown>;
    /** Atom (root) → timestamp of last change, for flash highlighting. */
    changed: Map<string, number>;
    /** Atom (root) → number of flushes that changed it (reactivity heat). */
    changeCounts: Map<string, number>;
    /** Bounded snapshot history for time travel. */
    history: HistoryEntry[];
    /** Distinct program versions seen this session, oldest first. */
    programHistory: ProgramVersion[];
    /** Long tasks (>50ms) the browser reported, when it supports the observer. */
    longTasks: LongTask[];
    /** Timestamp of the first observed event (timeline zero). */
    firstTime: number | null;
    /** Timestamp of the most recent observed event. */
    lastTime: number;
    /** Totals since the session began, including events already trimmed away. */
    totals: {
        commits: number;
        effects: number;
        network: number;
        routes: number;
        emits: number;
        logs: number;
        errors: number;
        stateFlushes: number;
    };
}
export declare function emptyModel(): AppModel;
/** Root atom name of a dotted path (`user.name` → `user`). */
export declare function rootOf(path: string): string;
/** Timestamp of any protocol event, whatever its kind calls the field. */
export declare function eventTime(event: DevtoolsEvent): number;
/**
 * Fold one event into the model.
 *
 * `fromBuffer` marks events replayed from the hook's backfill buffer when the
 * panel opens: those must not steal the user's pinned commit selection or
 * flash rows as if they had just happened.
 */
export declare function ingest(model: AppModel, event: DevtoolsEvent, fromBuffer?: boolean): void;
/**
 * Add a console line, collapsing an immediate repeat into a count.
 *
 * A render loop logging the same line 400 times should read as
 * `"tick" ×400`, not scroll the one message you were looking for off the top.
 */
export declare function ingestLog(model: AppModel, entry: LogEntry): void;
/** Drop every recorded event, keeping the current state snapshot. */
export declare function clearModel(model: AppModel): void;
/** Per-component-name totals across a commit range. */
export interface ComponentAggregate {
    name: string;
    kind: string;
    /** Renders where the body actually ran. */
    renders: number;
    /** Renders skipped by memoization. */
    memo: number;
    /** Total self time in ms. */
    total: number;
    /** Slowest single render, in ms. */
    max: number;
    /** Distinct instances observed. */
    instances: number;
}
export declare function componentAggregates(commits: ReadonlyArray<CommitRecord>): ComponentAggregate[];
/** Per-instance totals, for the inspector's "why is this slow?" column. */
export declare function instanceAggregates(commits: ReadonlyArray<CommitRecord>): Map<string, {
    renders: number;
    memo: number;
    total: number;
    max: number;
    last?: ComponentRenderRecord;
}>;
/** State paths that triggered the most commits, most first. */
export declare function hotAtoms(commits: ReadonlyArray<CommitRecord>, limit?: number): Array<[string, number]>;
/** Per-effect totals across the retained event window. */
export interface EffectAggregate {
    effectKey: string;
    label: string;
    triggers: string;
    instanceKey: string | null;
    mounts: number;
    runs: number;
    cleanups: number;
    errors: number;
    total: number;
    max: number;
    lastReason: string;
    lastTime: number;
}
export declare function effectAggregates(events: ReadonlyArray<EffectEvent>): EffectAggregate[];
/** Headline network numbers. */
export declare function networkStats(requests: ReadonlyArray<NetworkRequest>): {
    total: number;
    pending: number;
    failed: number;
    mocked: number;
    bytes: number;
    avgDuration: number;
    slowest: NetworkRequest | null;
};
/**
 * A merged, chronological view of everything that happened — the Timeline tab.
 *
 * Debugging a "clicking Save does nothing" report means correlating a commit,
 * an effect run, a request, and a route change that all happened inside 40ms.
 * Reading four tabs and mentally interleaving them is the slow way to do it.
 */
export interface TimelineEntry {
    kind: DevtoolsEvent["kind"];
    time: number;
    /** Short label (`commit #12`, `GET /api/todos`). */
    label: string;
    /** Secondary detail (`count`, `304 · 12ms`). */
    detail: string;
    /** Colour tone for the marker. */
    tone: string;
    /** Duration in ms when the entry represents a span. */
    duration?: number;
    /** Instance / effect / request id this entry points at, for click-through. */
    ref?: string;
}
export declare function buildTimeline(model: AppModel, kinds: ReadonlySet<string>): TimelineEntry[];
/** Last path segment of a URL, for compact labels. */
export declare function urlTail(url: string): string;
