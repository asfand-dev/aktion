/**
 * Hash-based router for `<aktion-app>`.
 *
 * The router is owned by the host element and exposed to:
 *   - The evaluator (which special-cases `Router({...})` to pick the matching
 *     route arm and inject path params as the `params` scope).
 *   - The renderer's helpers (so `NavLink(...)` can wire click handlers).
 *   - Action functions (via `route.navigate("/path")`).
 *
 * The wire format is hash-based — `#/page-name`. The router strips the leading
 * `#` and any trailing `?…` query string before exposing the path. Navigating
 * inside the component updates `window.location.hash`, and external hash
 * changes (browser back/forward, direct URL edits) are picked up by the
 * `hashchange` listener.
 *
 * The router is always started by the host element when it connects so that
 * navigation works out of the box. In environments without a `window`
 * (server-side rendering, tests) the router stays in "memory" mode:
 * `navigate(...)` records the new path internally without touching the URL.
 */
export type RouteParams = Record<string, string>;
export interface RouteMatch {
    matched: boolean;
    params: RouteParams;
    /** True when the matched route is a wildcard (`*`) catch-all. */
    wildcard?: boolean;
}
export interface RouteChangeDetail {
    path: string;
    previousPath: string | null;
    source: "init" | "hashchange" | "navigate" | "external";
}
export type RouteListener = (detail: RouteChangeDetail) => void;
/** Payload handed to a navigation guard before a path change commits. */
export interface NavigationInfo {
    /** The path the user is trying to reach (normalised). */
    to: string;
    /** The path being left (null on the very first navigation). */
    from: string | null;
}
/**
 * A navigation guard decides whether a pending navigation may proceed.
 * Return `false` to block it, a path string to redirect, or `true` /
 * `undefined` to allow it.
 */
export type NavigationGuard = (info: NavigationInfo) => boolean | string | void;
export interface RouterOptions {
    /** Initial path when no hash is set. Defaults to `/`. */
    defaultPath?: string;
    /**
     * URL strategy. `"hash"` (default) keeps everything after `#/…` and works
     * on any static host. `"history"` uses the HTML5 History API (clean
     * `/about` URLs) and requires the server to fall back to `index.html` for
     * unknown paths.
     */
    mode?: "hash" | "history";
    /**
     * Optional base path stripped from / prepended to URLs in `"history"` mode
     * (e.g. `"/app"` when the SPA is served under a sub-directory).
     */
    basePath?: string;
}
/**
 * Normalise an arbitrary string into a clean route path.
 *
 *   readHashPath("")                 → "/"
 *   readHashPath("#")                → "/"
 *   readHashPath("#/")               → "/"
 *   readHashPath("#/about")          → "/about"
 *   readHashPath("#about")           → "/about"
 *   readHashPath("/foo/bar?x=1")     → "/foo/bar"
 *   readHashPath("//foo///bar//")    → "/foo/bar"
 */
export declare function normalisePath(raw: string | null | undefined): string;
/**
 * Match a route pattern against a concrete path. Patterns support:
 *   - literal segments: `/about`
 *   - parameter segments: `/users/:id`
 *   - wildcard catch-all: `*` (matches any path, params empty unless mixed)
 *   - mixed wildcard: `/docs/*` (matches everything under `/docs/`)
 */
export declare function matchRoute(pattern: string, path: string): RouteMatch;
/** Result of a prefix match — the captured params plus the unmatched tail. */
export interface PrefixMatch {
    matched: boolean;
    params: RouteParams;
    /** The remaining path after the matched prefix, normalised (e.g. `/settings`). */
    rest: string;
}
/**
 * Match a route pattern as a PREFIX of `path` (suggestions-global IV.1 — nested
 * routes / layout routes). `/app` prefix-matches `/app`, `/app/x`, `/app/x/y`.
 * Returns the captured `:params` plus the unmatched tail (`rest`) so a nested
 * router can resolve the child route. A pure-segment pattern only matches on
 * segment boundaries (so `/app` does not match `/application`).
 */
export declare function matchRoutePrefix(pattern: string, path: string): PrefixMatch;
export declare class Router {
    private currentPath;
    private currentParams;
    private currentPattern;
    private enabled;
    private hashListener;
    private listeners;
    private readonly defaultPath;
    private mode;
    private basePath;
    /** True while we're updating `window.location` ourselves — used to
     * filter out the resulting `hashchange` / `popstate` echo. */
    private settingHash;
    /** Optional navigation guard registered via `$util.onNavigate(fn)`. */
    private guard;
    constructor(options?: RouterOptions);
    /**
     * Re-configure the URL strategy before `start()` is called. The host
     * element uses this to apply the `router-mode` / `router-base` attributes
     * it reads at connect time. No-op once the router is already enabled.
     */
    configure(options: {
        mode?: "hash" | "history";
        basePath?: string;
    }): void;
    getMode(): "hash" | "history";
    /**
     * Attach the `hashchange` listener and synchronise from the current URL.
     * Safe to call multiple times — it's idempotent.
     */
    start(): void;
    /** Read the active path from `window.location` per the current mode. */
    private readLocation;
    /**
     * Detach the `hashchange` listener. The current path stays as the last
     * observed value so a follow-up `start()` resumes cleanly.
     */
    stop(): void;
    getPath(): string;
    getParams(): RouteParams;
    /** Path pattern of the most recently matched route arm (or null). */
    getActivePattern(): string | null;
    /**
     * Called by `Router({...})` after each render so we have the canonical
     * pattern + params for the active page (used by `NavLink` to highlight the
     * active link). The state store is NOT touched here.
     */
    setActiveMatch(pattern: string | null, params: RouteParams): void;
    /**
     * Navigate to the given path. When enabled, this updates the URL hash and
     * relies on `hashchange` to notify listeners (so browser history works).
     * When disabled, the navigation stays in-memory. A registered navigation
     * guard may block (`false`) or redirect (path string) the change.
     */
    navigate(path: string): void;
    /**
     * Register (or clear, with `null`) the navigation guard. The guard runs
     * before every in-app `navigate(...)` and every URL-driven change once the
     * router is started. Set via `$util.onNavigate(fn)`.
     */
    /** True when the program installed a navigation guard (`$router.guard = …`). */
    hasGuard(): boolean;
    setGuard(guard: NavigationGuard | null): void;
    /** Run the guard for a pending navigation, failing open on error. */
    private runGuard;
    /** Rewind `window.location` to the current path (used when a guard blocks). */
    private restoreUrl;
    /** Commit a navigation after the guard has approved it (with redirect cap). */
    private navigateInternal;
    subscribe(listener: RouteListener): () => void;
    /** Replace the current path without going through `window.location`. */
    private setPath;
}
