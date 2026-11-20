import { AktionDevtoolsHook } from './hook.js';
import { DockMode, TabId, UiState } from './context.js';
import { clearModel, AppModel } from './model.js';
import { CspViolation } from './analysis/security.js';
import { DEVTOOLS_UI_VERSION } from './meta.js';
export { DEVTOOLS_UI_VERSION };
export declare class AktionDevtoolsElement extends HTMLElement {
    static readonly tagName = "aktion-devtools";
    private hook;
    private unsubEvents;
    private unsubApps;
    private readonly models;
    private readonly imported;
    private selectedAppId;
    private ui;
    private readonly overlay;
    private readonly recorder;
    private readonly consoleCapture;
    private readonly vitals;
    private readonly pagePush;
    private tooltips;
    private root;
    private frameHost;
    private layerHost;
    private snapEl;
    private renderScheduled;
    private renderTimer;
    private readonly renderTimes;
    private passCache;
    private readonly memoCache;
    private geometry;
    private readonly dockSizes;
    private launcherPos;
    private restoreGeometry;
    private droppedWhilePaused;
    private readonly cspViolations;
    private readonly recentCommands;
    private toastSeq;
    private readonly toastTimers;
    private windowKeyHandler;
    private cspHandler;
    private schemeQuery;
    private schemeHandler;
    private resizeHandler;
    private outsidePointer;
    private layersTimer;
    private a11yTimer;
    private suppressLauncherClick;
    /** `performance.now()` → epoch offset, for converting model times to clock times. */
    readonly epochOffset: number;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** Show the panel (restoring it from the launcher). */
    open(): void;
    /** Collapse to the launcher (or hide entirely when the launcher is off). */
    close(): void;
    toggle(): void;
    selectApp(id: string): void;
    selectTab(tab: TabId): void;
    /** Change the dock position. */
    setDock(dock: DockMode): void;
    /** The derived model for an app (or the selected one). */
    getModel(appId?: string): AppModel | null;
    /** The panel's view state (tests and embedders). */
    getUiState(): UiState;
    /** Render synchronously now — for tests and embedders that must observe the result immediately. */
    flush(): void;
    /** Load an exported session file into the panel for offline inspection. */
    importSession(text: string, fileName?: string): string;
    private ensureModel;
    private adopt;
    /** Ask every `<aktion-app>` on the page to register (late attach). */
    private discoverApps;
    private onApp;
    private onEvent;
    private afterCommit;
    /**
     * Render scan: outline what actually re-rendered, with a running count, and
     * mark the renders a forced full render caused although nothing the
     * component reads changed — the "unnecessary render" React Scan made famous.
     */
    private scanCommit;
    private markCommit;
    /**
     * Break into the debugger when a watched atom changes. The panel cannot pause
     * the runtime, but a `debugger` statement here stops the world inside the
     * state flush, one frame below the write, with the stack that caused it.
     */
    private checkBreakOnChange;
    /** Remember each distinct program version, so an edit that breaks the app can be undone. */
    private recordProgramVersion;
    private syncConsoleCapture;
    private onVitals;
    /**
     * Coalesce renders. The first render after a quiet period happens on the next
     * microtask (so a test that flushes microtasks sees it, and a click feels
     * instant); a burst — an effect ticking at 60Hz, a stream of log lines — is
     * throttled to about 20 renders a second so the panel never becomes the
     * bottleneck it is there to find.
     */
    private scheduleRender;
    private renderNow;
    private readonly effectState;
    private renderFallback;
    private buildSkeleton;
    /** Reflect dock, theme, density, and geometry onto the host element. */
    private applyHost;
    private setAttr;
    private applyPagePush;
    private currentApp;
    private currentView;
    private renderFrame;
    private renderTitlebar;
    private renderRail;
    private railItem;
    /** Overall health for the status dot and launcher: errors → red, warnings → amber. */
    private health;
    private renderStatusBar;
    private renderEdges;
    private renderToasts;
    private renderLayer;
    private renderLauncher;
    private renderShortcuts;
    private renderDialog;
    private renderMenu;
    private context;
    /** Forget stored preferences; keep what the session is looking at. */
    private resetPreferences;
    /** Push user rules + the throttling preset to the app. */
    private pushRules;
    private highlightInstance;
    /**
     * Open the Inspector on an instance and make sure its row is visible — it may
     * be inside a collapsed branch, excluded by the filter, or a library component
     * while the Library toggle is off. Clear all three and say which were cleared.
     */
    private revealInInspect;
    private toast;
    private dismissToast;
    private openPalette;
    private closePalette;
    private runCommand;
    /** Every command the palette offers right now. */
    private paletteCommands;
    private openMenu;
    private closeMenu;
    private closeDialog;
    private editJson;
    private openAppMenu;
    private openDockMenu;
    private setMinimized;
    private togglePause;
    setHighlightUpdates(on: boolean): void;
    private clearSession;
    private exportSession;
    private copyBugReport;
    private promptImport;
    private togglePicker;
    private flashApp;
    private bindWindow;
    private unbindWindow;
    private onRootKeyDown;
    /** Alt+1…9 → the nth section; Alt+[ / Alt+] → previous / next. True when handled. */
    private handleViewShortcut;
    private beginMove;
    private showSnap;
    private beginResize;
    private toggleMaximize;
    private beginLauncherDrag;
    private persist;
    /** @internal — lets the Security view read the live CSP violation log. */
    get cspLog(): ReadonlyArray<CspViolation>;
    /** @internal — whether an event target belongs to the panel (for the recorder). */
    static isChrome(element: Element | null): boolean;
    /** @internal */
    get renderRoot(): Element | null;
}
/** Register the custom element (idempotent). */
export declare function defineDevtoolsElement(): void;
export interface MountDevtoolsOptions {
    /** Where to append the panel (default `document.body`). */
    container?: HTMLElement;
    /** Pre-select an app by id. */
    appId?: string;
    /** Start open (default `true`); `false` starts as the launcher pill. */
    open?: boolean;
    /** Open on a specific section. */
    tab?: TabId;
    /** Dock position (default: whatever was last used, else floating). */
    dock?: DockMode;
    /** Panel theme (default: last used, else follow the system). */
    theme?: "system" | "dark" | "light";
    /** Show the launcher pill while minimised (default `true`). */
    launcher?: boolean;
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
    /** Switch to a section by id. */
    selectTab(tab: TabId): void;
    /** Change the dock position. */
    dock(position: DockMode): void;
    /** Load an exported session for offline inspection; returns its app id. */
    importSession(json: string, fileName?: string): string;
    /** Render synchronously (tests). */
    flush(): void;
    /** Remove the panel from the DOM (the hook + event stream stay installed). */
    destroy(): void;
}
/**
 * Install the DevTools hook and mount an in-page panel. Idempotent at the hook
 * level — multiple panels share one event stream — but each call mounts a new
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
