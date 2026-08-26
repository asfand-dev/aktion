import { AktionDevtoolsHook } from './hook.js';
import { DockMode, TabId, UiState } from './context.js';
import { clearModel, AppModel } from './model.js';
export declare class AktionDevtoolsElement extends HTMLElement {
    static readonly tagName = "aktion-devtools";
    private hook;
    private unsubEvents;
    private unsubApps;
    private readonly models;
    private selectedAppId;
    private ui;
    private readonly overlay;
    private readonly recorder;
    private readonly consoleCapture;
    private renderScheduled;
    private flashTimer;
    private toastTimer;
    /** Memo for one render pass — see the comment in `render()`. */
    private renderCache;
    /** Events ignored since the user paused — surfaced on the Rec button. */
    private droppedWhilePaused;
    private recordLabel;
    private windowKeyHandler;
    private longTaskObserver;
    /** Floating-mode geometry, persisted so the panel reopens where you left it. */
    private geometry;
    private root;
    private panelEl;
    private headerEl;
    private controlsEl;
    private tabsEl;
    private bodyEl;
    private toastEl;
    private paletteEl;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    open(): void;
    close(): void;
    toggle(): void;
    selectApp(id: string): void;
    /** Switch tabs programmatically (used by the controller and by tab links). */
    selectTab(tab: TabId): void;
    /** Test/inspection hook: the derived model for an app (or the selected one). */
    getModel(appId?: string): AppModel | null;
    /** Test/inspection hook: the panel's current view state. */
    getUiState(): UiState;
    private ensureModel;
    /** Adopt an app: ensure a model and seed its current state snapshot. */
    private adopt;
    /** Ask every `<aktion-app>` on the page to register with the hook. */
    private discoverApps;
    private onApp;
    private onEvent;
    /**
     * Outline every component that actually rendered in this commit.
     *
     * The most direct answer to "why did that feel slow?" is seeing the whole
     * screen flash when you typed one character. Memoized instances are skipped —
     * outlining them would report the opposite of the truth.
     */
    private highlightRenderedComponents;
    /**
     * Mirror a commit into `performance.measure` so it appears in the browser's
     * own performance timeline next to layout, paint, and long tasks.
     *
     * The panel's profiler can tell you a commit took 12ms; only the browser's
     * timeline can tell you what happened around it.
     */
    private markCommitForBrowserProfiler;
    /**
     * Break into the debugger when a watched atom changes.
     *
     * The panel cannot pause the runtime, but the browser can: a `debugger`
     * statement executed here stops the world inside the state flush, one frame
     * below the write, with the stack that caused it. That is the one thing a
     * state inspector cannot otherwise give you.
     */
    private checkBreakOnChange;
    /**
     * Keep a short history of program versions.
     *
     * A hot-swapped program that fails to parse leaves you with a blank app and no
     * way back — the Source tab can only re-plan what is already broken. Recording
     * each distinct version as it commits makes "undo that edit" possible.
     */
    private recordProgramVersion;
    private ingestEvent;
    /** Route a captured console line into the selected app's model. */
    private syncConsoleCapture;
    private scheduleRender;
    private currentApp;
    private render;
    /**
     * Remember where the caret is before a re-render.
     *
     * The panel re-renders on every runtime event, so a field the user is typing
     * in is rebuilt several times a second. Restoring by POSITION is not enough:
     * running a REPL expression grows the history above the input, so the input is
     * no longer the same child index and focus is lost on exactly the keystroke
     * that mattered. Fields therefore declare a stable key (see `FOCUS_KEY_ATTR`)
     * and the shell restores by key, falling back to the position for anything
     * that has not declared one.
     */
    private captureFocus;
    private restoreFocus;
    private findFocusTarget;
    /**
     * Scroll offsets of every keyed scroll container, so a scrolled component
     * tree does not jump to the top each time an event arrives.
     */
    private captureScroll;
    private restoreScroll;
    private buildSkeleton;
    /** Reflect dock mode, theme, and density onto the host + panel. */
    private applyChrome;
    private applyDock;
    /** Rec / Paused, with a count of what pausing has cost you. */
    private recordText;
    private recordTitle;
    /** Update the button text without a render — see `droppedWhilePaused`. */
    private updateRecordLabel;
    /**
     * Open Inspect on an instance and make sure the row is actually visible.
     *
     * A jump from another tab can land on a row hidden three different ways —
     * inside a collapsed branch, excluded by the tree filter, or a library
     * component while the Library toggle is off. Silently showing the detail of
     * a row you cannot see is the worst of the three outcomes, so clear all of
     * them and say which ones were cleared.
     */
    private revealInInspect;
    /** Show a transient message. Shared by the tabs (via `ctx.toast`) and the shell. */
    private toastMessage;
    private renderControls;
    private renderTabs;
    /** Panel-level operations the palette can trigger. */
    private paletteActions;
    /** Render (or tear down) the palette / shortcut overlay. */
    private renderPalette;
    /** The palette controller, created once so its input survives re-renders. */
    private readonly palette;
    private openPalette;
    private closePalette;
    private cycleDock;
    /** Arm / disarm the element picker from anywhere (palette, shortcut, button). */
    private togglePicker;
    /**
     * Panel-wide keyboard handling.
     *
     * Bound on the panel's own root, not the window: a debugger that swallows the
     * page's keystrokes is worse than one with no shortcuts. The two exceptions
     * are the palette and the picker toggle, which are bound on the window because
     * you reach for them while your hands are in the app.
     */
    private bindKeyboard;
    /** Alt+1..9 selects a tab; Alt+[ / Alt+] cycle. Returns true if handled. */
    private tabShortcut;
    private onKeyDown;
    /**
     * Watch for long tasks while the panel is open.
     *
     * A commit that measures 4ms in the profiler but janks the page is usually a
     * long task the runtime did not cause (an image decode, a third-party script)
     * — and being able to say so is the difference between fixing the right thing
     * and rewriting a component that was never the problem.
     */
    private observeLongTasks;
    private renderBody;
    private renderToast;
    private context;
    /** Highlight the DOM node an instance rendered, labelled with its name. */
    private highlightInstance;
    private flashApp;
    private makeDraggable;
    private makeResizable;
    private persist;
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
    /** Open on a specific tab. */
    tab?: TabId;
    /** Dock position (default: whatever was last used, else floating). */
    dock?: DockMode;
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
    /** Switch to a tab by id. */
    selectTab(tab: TabId): void;
    /** Remove the panel from the DOM (the hook + event stream stay installed). */
    destroy(): void;
}
/**
 * Install the DevTools hook and mount an in-page panel. Idempotent at the hook
 * level — multiple panels share one event stream — but each call mounts a fresh
 * panel element.
 *
 *   import { mountDevtools } from "aktion-runtime/devtools";
 *   mountDevtools();
 */
export declare function mountDevtools(options?: MountDevtoolsOptions): DevtoolsController;
/** Whether a DevTools hook is currently installed on the page. */
export declare function isDevtoolsInstalled(): boolean;
/** Re-exported so a host can clear a panel's captured data programmatically. */
export { clearModel };
