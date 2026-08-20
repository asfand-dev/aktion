import { CompiledProgram } from './compiler/runtime.js';
import { DeltaOp } from './tooling/index.js';
import { ComponentSpec, UIProvider } from './library/types.js';
import { PromptOptions } from './prompt/generator.js';
import { ThemeInput } from './theme/index.js';
import { HttpInterceptors, HttpRequest, HttpResponse } from './runtime/http.js';
export type { HttpInterceptors, HttpRequest, HttpResponse };
export declare class AktionElement extends HTMLElement {
    static readonly tagName = "aktion-app";
    static get observedAttributes(): string[];
    private readonly state;
    private readonly router;
    private library;
    private currentUIProvider?;
    private readonly http;
    private readonly effectRunner;
    private renderer;
    private context;
    private root;
    private rootEl;
    private errorEl;
    private currentResponse;
    /**
     * Pre-parsed AST injected by `mountCompiled(...)` (the multi-file linker
     * path). When set, `replan()` consumes it instead of calling
     * `parse(currentResponse)`, then clears it so a later string update
     * (`setResponse` / `appendChunk`) re-parses normally. `null` for the
     * ordinary streamed-string path.
     */
    private pendingCompiled;
    /**
     * Module id of the compiled program currently mounted (from
     * `CompiledProgram.path`), or `null` for the string path. Exposed via the
     * `sourceId` getter so HMR / host tooling can target the right instances.
     */
    private compiledSourceId;
    private renderScheduled;
    /** True when the program text changed and the runtime needs a re-plan. */
    private programDirty;
    /**
     * Set of state paths the most recent render actually read (e.g. `"user.name"`,
     * `"cart"`). The state subscription uses it to gate re-renders: a reactive
     * write only re-renders when its changed path overlaps something the UI
     * read (fine-grained reactivity). `null` means "no baseline yet" — the next
     * change always renders (first paint, post-replan). Explicit `notify()`
     * signals (async/HTTP/timers/effects/hooks) bypass this gate entirely.
     */
    private lastRenderDeps;
    /**
     * Reactive paths changed since the last render, accumulated across flushes
     * (and across gated renders). Drives per-component memoization: the renderer
     * skips a component whose args are unchanged and whose read-paths don't
     * overlap this set.
     */
    private pendingChangedPaths;
    /**
     * Per-path scroll positions saved for `scroll-restoration="auto"`, so
     * back/forward navigation can return the user to where they were.
     */
    private routeScrollPositions;
    /**
     * Set when a re-render was requested via `notify()` (async resolution,
     * timer, HTTP, hook, effect) rather than a tracked `$state` write. The
     * change set isn't fully known in that case, so the next render disables
     * memoization and re-renders everything.
     */
    private forceFullRender;
    private parseErrors;
    /**
     * Diagnostics raised while loading a program from the `src` attribute
     * (fetch / link failures, unresolved imports). Tracked separately from
     * `parseErrors` so they survive the `replan()` that mounting the linked
     * program triggers, and are merged into the error banner + `error` event.
     */
    private srcDiagnostics;
    /**
     * Monotonic token guarding overlapping `src` loads. A rapid `src` change
     * (or a reconnect mid-fetch) bumps the token so a stale in-flight load
     * resolves into a no-op instead of clobbering the current program.
     */
    private srcLoadToken;
    /**
     * True once `connectedCallback` has run at least once. Lets
     * `attributeChangedCallback` distinguish the initial attribute upgrade
     * (handled by `connectedCallback`) from a genuine later `src` change.
     */
    private hasConnected;
    /**
     * Token keys most recently applied by an in-script `$theme({...})`
     * declaration. We remember them so the next render can clear stale
     * overrides — otherwise switching from a `$theme(...)` block to the
     * base theme would leave the previous tokens stuck on the host.
     */
    private scriptThemeKeys;
    /**
     * Strict-mode guard for the "handler-only DOM write" hazard documented in
     * `src/renderer/renderer.ts`: a MutationObserver that queues every attribute
     * an event handler writes on the live DOM, so the next commit can report the
     * ones the reconciler reverted. Armed only when the `strict` attribute is
     * present — always-on it would allocate a record per attribute per commit.
     */
    private morphGuard;
    /** Elements → attribute names written since the last commit (strict only). */
    private imperativeAttrWrites;
    /** One reverted-write report is a bug report; one per commit is a flood. */
    private warnedMorphRevert;
    /**
     * Description of the host-page ancestor that traps `position: fixed` (see
     * {@link detectContainingBlockTrap}), or `null` — the normal case, in which
     * the per-commit overlay check below costs nothing.
     */
    private containingBlockTrap;
    /** Stable DevTools id for this element (`aktion-app-N`). */
    private readonly devtoolsId;
    /** Monotonic commit sequence for the render profiler (0 = initial mount). */
    private devtoolsCommitId;
    /** True once this element has been registered with the DevTools hook. */
    private devtoolsRegistered;
    constructor();
    connectedCallback(): void;
    /**
     * Look for an ancestor in the EMBEDDING page that is the containing block for
     * `position: fixed`, and remember what makes it one.
     *
     * A wrapper with `transform` / `filter` / `perspective` / `contain: paint` /
     * `will-change` — a scaled slide deck, an off-canvas nav, a card grid with a
     * hover lift, a page-transition wrapper — makes every fixed overlay inside
     * the shadow root resolve against that wrapper instead of the viewport: the
     * Modal scrim covers only the embed box, Toasts pin to its corner, the FAB
     * floats mid-page. Anchored popups are immune because `floating.ts` promotes
     * them into the browser top layer, which is laid out against the viewport
     * whatever the ancestor chain says; the remaining overlays cannot be rescued
     * from inside the shadow root, because the offending element belongs to the
     * host page and `position: fixed` has no escape hatch. So the only thing left
     * is to name the culprit — otherwise this is indistinguishable from a library
     * bug. Reported by `reportTrappedOverlay` once an affected overlay actually
     * renders, because a transformed wrapper around an app that never opens one is
     * harmless and does not deserve a warning.
     */
    private detectContainingBlockTrap;
    /** Name the trap the first time an overlay it breaks reaches the DOM. */
    private reportTrappedOverlay;
    /**
     * Arm the strict-mode morph guard (see {@link morphGuard}). Returns whether
     * the guard is running, so the render path can skip the snapshot work
     * entirely in the default (non-strict) case.
     */
    private ensureMorphGuard;
    private queueImperativeWrites;
    /**
     * Snapshot every attribute written since the last commit, with the value the
     * writer left behind. Draining the observer at the END of each commit is what
     * keeps the reconciler's own writes out of this set, so what remains here is
     * exactly the imperative writes an event handler (or a post-paint measure)
     * made between two commits.
     */
    private snapshotImperativeWrites;
    /**
     * Report the first handler-only DOM write this commit undid. A value that
     * survived the commit is fine — either the render reproduced it (the write
     * was a genuine optimisation over real state) or the attribute is one the
     * reconciler treats as element-owned (a promoted floating panel, a
     * `data-rui-preserve` widget, `<details open>`).
     */
    private checkImperativeWrites;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, _old: string | null, value: string | null): void;
    /**
     * Register HTTP interceptors used by the Aktion 0.5 HTTP layer (§22.1 of
     * the spec). Interceptors are invoked by the HTTP runtime around every
     * `query`/`mutation`/`subscription` request. Multiple calls merge
     * incrementally — passing `{ onRequest }` only does not clear an
     * existing `onResponse`.
     */
    registerHttpInterceptors(interceptors: HttpInterceptors): void;
    /** Replace the current program with `text` and re-render from scratch. */
    setResponse(text: string): void;
    /**
     * Aktion 0.5 §26 — serialise the host's current state as
     * a plain JSON-friendly object. Combine with `programText` to round-
     * trip the entire app between turns, between tabs, or between
     * server-rendered HTML and client hydration.
     */
    serializeState(): Record<string, unknown>;
    /**
     * Apply a snapshot to the live state store. Values land in `values`
     * immediately, so any subsequent `$state x = default` declaration
     * preserves the hydrated value (the planner only writes defaults for
     * names that do not yet exist).
     *
     * If a render is in flight, this call schedules a follow-up render so
     * the new values surface in the next paint.
     */
    hydrateState(snapshot: Readonly<Record<string, unknown>>): void;
    /**
     * Write one reactive atom, exactly as an `onClick` handler inside the program
     * would.
     *
     * The difference from `hydrateState` is intent, and it is observable.
     * Hydration says "this value came from OUTSIDE the program" — it survives the
     * planner's reset of literal `$state` defaults on a replan, which is what SSR
     * and snapshot restore need. A plain write does not claim that: the atom stays
     * the program's own, so a replan restores its declared default. Use this to
     * drive an app from a host control or a test; use `hydrateState` to restore a
     * snapshot.
     */
    setState(name: string, value: unknown): void;
    /**
     * Aktion 0.5 §14 — Delta Protocol. Apply a structured
     * sequence of operations to the current program; the runtime mounts
     * the patched program with the user's `$state` preserved across the
     * diff.
     *
     * Op shapes (see `src/tooling/delta.ts` for the full reference):
     *
     *   - `{ kind: "patch",   target: "name", value: any }`
     *   - `{ kind: "replace", binding: "name", source: "Expr" }`
     *   - `{ kind: "append",  binding: "name", item: "Expr" }`
     *   - `{ kind: "new",     source: "binding = Expr  // or full decl" }`
     *   - `{ kind: "delete",  binding: "name" }`
     *
     * Returns the advisory warnings raised by the delta (e.g. for ops
     * that targeted a missing binding). The host can surface them as a
     * banner or ignore them — partial deltas always still mount the
     * remaining patched program.
     */
    applyDelta(ops: readonly DeltaOp[]): string[];
    /**
     * Aktion 0.5 §26 — atomic load of a serialised payload.
     * Sets the program text *and* the state in one shot so the next
     * render plans the program with the hydrated values already in
     * place. Use this for SSR hydration, conversational continuity
     * across turns, and URL-deep-link restoration.
     */
    loadSnapshot(payload: {
        programText: string;
        state: Record<string, unknown>;
    }): void;
    /**
     * Mount a linked / compiled program — the artefact produced by `linkProject`
     * (multi-file modules) or `compileLite`. The pre-parsed AST is rendered
     * directly, skipping the runtime parser; the runtime still re-validates
     * against the active library on `replan()`, so a host that has called
     * `registerComponents(...)` stays correct even if the program was linked
     * against the default library.
     *
     * The string path (`setResponse`, `appendChunk`, `response`) is unaffected.
     * Pass `state` to seed reactive values before the first render (SSR
     * hydration; preserving live `$state` across a re-mount / hot edit).
     */
    mountCompiled(compiled: CompiledProgram, state?: Record<string, unknown>): void;
    /**
     * Module id of the compiled program currently mounted, or `null` when the
     * element is driven by the streamed-string path.
     */
    get sourceId(): string | null;
    /** Current `src` attribute value, or `null` when none is set. */
    get src(): string | null;
    set src(value: string | null);
    /**
     * Load the program from an external `.aktion` file referenced by the `src`
     * attribute. The entry is fetched relative to the document, linked through
     * the in-browser project linker (so an entry that `import`s other modules
     * resolves and fetches its whole graph), and mounted as a compiled program.
     *
     * A monotonic token guards against overlapping loads: a rapid `src` change
     * or a reconnect mid-fetch bumps the token, so a stale in-flight load
     * resolves into a no-op instead of clobbering the current program. Fetch /
     * link failures and unresolved imports surface through the same error banner
     * and `error` event as parse errors.
     */
    loadFromSrc(src: string): Promise<void>;
    /** A `src` load is stale if a newer one started or the element detached. */
    private isStaleSrcLoad;
    /**
     * Surface a `src`-loading failure: record it, refresh the banner, and
     * bubble an `error` event so host pages can react (mirrors how parse
     * errors are reported).
     */
    private reportSrcError;
    /** Append a streaming chunk and re-render. */
    appendChunk(chunk: string): void;
    setTheme(theme: ThemeInput): void;
    /**
     * Completely replaces the built-in component library with an external one (e.g. MUI, Bootstrap).
     * It gives a clear separation of concerns by delegating the UI representation to an implementation package.
     */
    setUIProvider(provider: UIProvider): void;
    registerComponents(components: ComponentSpec[], rootName?: string): void;
    /**
     * Register custom icons (inline SVG markup keyed by name) so authored code
     * can use brand glyphs anywhere a Font Awesome name is accepted. Equivalent
     * to `$theme({ icons: {...} })` from inside a program. Re-renders so any
     * already-rendered icons pick up the new set.
     */
    registerIcons(icons: Record<string, string>): void;
    /**
     * Build a system prompt for the active library. Pass `{ mode: "chat" }`
     * for the compact chat-focused prompt; omit `mode` (or pass `"full"`)
     * for the complete prompt.
     */
    getSystemPrompt(options?: PromptOptions): string;
    /** Programmatic navigation API. */
    navigate(path: string): void;
    /** Current route path (`/`, `/about`, …). */
    get route(): string;
    clear(): void;
    get response(): string;
    set response(value: string);
    get streaming(): boolean;
    set streaming(value: boolean);
    get showErrors(): boolean;
    set showErrors(value: boolean);
    /** Dispatch a custom event from `emit()` calls in effect/action bodies. */
    private emitCustomEvent;
    /**
     * Register this element with the global DevTools hook (idempotent). The
     * exposed record only grants a debugger the operations it legitimately
     * needs — read state, push an edit, read the program, force a render —
     * never the raw runtime internals. A no-op when no hook is installed.
     */
    private registerWithDevtools;
    /**
     * Public DevTools entry point: attach to a hook that was installed *after*
     * this element mounted. The in-page panel calls this on every
     * `<aktion-app>` it finds when it opens, so late-attaching DevTools picks up
     * already-running apps. Idempotent; safe to call repeatedly.
     */
    connectDevtools(): void;
    /**
     * Apply a DevTools-originated edit to a reactive atom. Dotted paths
     * (`user.name`) write through `setPath` so the root is reconstructed
     * immutably and dependents wake; bare names go through `set`. Either way the
     * normal reactive flush → render pipeline runs, so the edit behaves exactly
     * like one an event handler would make.
     */
    private applyDevtoolsStateEdit;
    /**
     * Stamp `appId` + `time` onto an effect-runner payload and forward it to the
     * hook. The runner already gated on `isDevtoolsActive()` before calling, so
     * by the time we're here a frontend is listening.
     */
    private emitDevtoolsEffect;
    private buildInlineStyle;
    /**
     * Start the router so the hash listener is attached and `route` is
     * seeded with the current URL. Idempotent — safe to call from
     * `connectedCallback`.
     */
    private startRouter;
    /**
     * Write `route` only when its content actually changed. Avoids
     * triggering a redundant render-after-replan cascade — see
     * `routesEqual` for the structural comparison.
     */
    private writeRouteState;
    /**
     * React to any path change: write the new value into the route slot (so
     * `route` reads re-evaluate), schedule a re-render, and bubble a
     * `route-change` event so host pages can sync analytics or sidebars.
     */
    private handleRouteChange;
    /**
     * Save / restore window scroll across route changes when the
     * `scroll-restoration` attribute opts in (IV.5). The outgoing page's scroll
     * is captured synchronously (the DOM hasn't morphed yet); the target scroll
     * is applied in a `requestAnimationFrame` so the incoming page has laid out.
     */
    private handleScrollRestoration;
    private applyThemeFromAttribute;
    /**
     * Reflect the host `dir` attribute onto the render root (X.1). Setting
     * `dir` on `rootEl` makes `direction` + CSS logical properties cascade to
     * every rendered component, so an RTL locale flips the whole tree. An
     * absent / empty attribute clears it so the element inherits page direction.
     */
    private applyDir;
    /**
     * Reflect the host `margin` attribute onto the render root as the
     * `--rui-app-margin` custom property. A bare number is treated as pixels
     * (`margin="12"` → `12px`); a full CSS length passes through. An absent or
     * malformed value clears the override so the stylesheet default (`20px`)
     * applies; `margin="0"` lets the app shell touch its container's edges.
     */
    private applyMargin;
    /**
     * Look for the reserved `theme` binding in the active program — set by a
     * bare `$theme({...})` statement or an explicit `theme = $theme({...})`
     * assignment (or any binding returning a `ThemeNode`). If found, write
     * its tokens to the host as CSS custom properties so the in-script
     * declaration layers on top of the attribute / `setTheme()` base. The
     * previous render's keys are cleared first so removing a `$theme(...)`
     * line snaps the renderer back to the underlying theme without a reload.
     */
    private applyScriptThemeOverrides;
    private scheduleRender;
    /**
     * Request a full (non-memoized) re-render. Used for changes the path
     * tracker can't see — async / HTTP resolutions, timers, hook setters,
     * effect bodies, custom events. The whole tree re-evaluates next tick.
     */
    private requestFullRender;
    private renderNow;
    /** Whether the "state write during render" warning has already fired. */
    private warnedStateWriteDuringRender;
    private warnStateWriteDuringRender;
    /**
     * Surface a runtime-budget abort the same way parse errors are
     * surfaced: append it to `parseErrors`, refresh the error banner,
     * and bubble an `error` event so the host page (or playground) can
     * react. The rendered DOM is intentionally left untouched — the
     * partially-rendered output from a previous tick is more useful to
     * the user than a flash of blank UI.
     */
    private handleRuntimeBudgetError;
    private captureFocus;
    private restoreFocus;
    private replan;
    private updateErrorBanner;
}
export declare function defineElement(): void;
