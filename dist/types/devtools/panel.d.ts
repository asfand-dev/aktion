import { AktionDevtoolsHook } from './hook.js';
import { CommitRecord, EffectEvent } from './protocol.js';
/** Per-app derived model the panel maintains from the event stream. */
interface AppModel {
    commits: CommitRecord[];
    effects: EffectEvent[];
    state: Record<string, unknown>;
    /** Atom (root) → timestamp of last change, for flash highlighting. */
    changed: Map<string, number>;
    /** Atom (root) → number of flushes that changed it (reactivity heat). */
    changeCounts: Map<string, number>;
    /** Timestamp of the first observed event (timeline zero). */
    firstTime: number | null;
}
export declare class AktionDevtoolsElement extends HTMLElement {
    static readonly tagName = "aktion-devtools";
    private hook;
    private unsubEvents;
    private unsubApps;
    private readonly models;
    private selectedAppId;
    private tab;
    private paused;
    private stateFilter;
    private expanded;
    private editingPath;
    /** Sort atoms by change frequency (reactivity heat) instead of name. */
    private stateSortByActivity;
    private selectedCommitId;
    private flashOnCommit;
    /** Sort key + direction for the ranked-components table. */
    private rankedSort;
    private phaseFilter;
    /** Group the effect timeline into per-effect lanes vs. a flat log. */
    private effectView;
    private collapsed;
    private renderScheduled;
    private flashTimer;
    private root;
    private panelEl;
    private controlsEl;
    private tabsEl;
    private bodyEl;
    connectedCallback(): void;
    disconnectedCallback(): void;
    open(): void;
    close(): void;
    toggle(): void;
    selectApp(id: string): void;
    /** Test/inspection hook: the derived model for an app (or the selected one). */
    getModel(appId?: string): AppModel | null;
    private ensureModel;
    /** Adopt an app: ensure a model and seed its current state snapshot. */
    private adopt;
    /** Ask every `<aktion-app>` on the page to register with the hook. */
    private discoverApps;
    private onApp;
    private onEvent;
    private ingest;
    private scheduleRender;
    private currentApp;
    private render;
    private buildSkeleton;
    private renderControls;
    private renderTabs;
    private renderBody;
    private renderStateTab;
    /** Re-render only the tree (used by the filter box to keep its focus). */
    private renderTreeOnly;
    private fillTree;
    private appendRow;
    private beginEdit;
    private renderProfilerTab;
    /** A compact grid of headline performance numbers for the session. */
    private renderPerfSummary;
    /**
     * Reactivity insight: which `$state` paths triggered the most commits.
     * Surfaces the "hot" atoms driving re-renders so an author can see what
     * their UI actually reacts to.
     */
    private renderHotAtoms;
    /**
     * Heuristic insights: surface likely performance problems derived from the
     * captured commits (frequent re-renders, heavy bodies, low memoization).
     */
    private renderProfilerInsights;
    private renderCommitDetail;
    private renderFlameRow;
    private renderRankedComponents;
    private renderEffectsTab;
    /** Headline counters for the effect session. */
    private renderEffectSummary;
    /** Re-run thrash + error detection for effects. */
    private renderEffectInsights;
    /**
     * A visual, time-positioned timeline: one lane per effect, with a marker
     * for every event placed along a shared time axis and coloured by phase.
     * Makes overlapping runs, cleanup→run pairing, and bursts obvious at a
     * glance in a way the chronological log can't.
     */
    private renderEffectTimeline;
    private renderEffectLanes;
    private renderEffectLog;
    private flashApp;
    private makeDraggable;
    private makeResizable;
}
/** Register the custom element (idempotent). */
export declare function defineDevtoolsElement(): void;
export interface MountDevtoolsOptions {
    /** Where to append the panel (default `document.body`). */
    container?: HTMLElement;
    /** Pre-select an app by id. */
    appId?: string;
    /** Start open (default `true`). */
    open?: boolean;
}
export interface DevtoolsController {
    /** The live panel element. */
    element: AktionDevtoolsElement;
    /** The installed hook (shared across panels). */
    hook: AktionDevtoolsHook;
    open(): void;
    close(): void;
    toggle(): void;
    selectApp(id: string): void;
    /** Remove the panel from the DOM (the hook + event stream stay installed). */
    destroy(): void;
}
/**
 * Install the DevTools hook and mount an in-page panel. Idempotent at the
 * hook level — multiple panels share one event stream — but each call mounts
 * a fresh panel element.
 *
 *   import { mountDevtools } from "aktion/devtools";
 *   mountDevtools();
 */
export declare function mountDevtools(options?: MountDevtoolsOptions): DevtoolsController;
/** Whether a DevTools hook is currently installed on the page. */
export declare function isDevtoolsInstalled(): boolean;
export {};
