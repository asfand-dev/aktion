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
    /** Floating-mode geometry, persisted so the panel reopens where you left it. */
    private geometry;
    private root;
    private panelEl;
    private headerEl;
    private controlsEl;
    private tabsEl;
    private bodyEl;
    private toastEl;
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
    private ingestEvent;
    /** Route a captured console line into the selected app's model. */
    private syncConsoleCapture;
    private scheduleRender;
    private currentApp;
    private render;
    /**
     * Remember where the caret is before a re-render.
     *
     * The panel re-renders on every event, and a filter box that loses focus (or
     * its caret) after one keystroke is unusable. Rather than making each tab
     * patch its own DOM in place, the shell records the focused field's position
     * in the tree and puts the caret back afterwards — which works for every tab
     * without any of them knowing about it.
     */
    private captureFocus;
    private restoreFocus;
    private buildSkeleton;
    /** Reflect dock mode, theme, and density onto the host + panel. */
    private applyChrome;
    private applyDock;
    private renderControls;
    private renderTabs;
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
