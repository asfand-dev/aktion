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

/** Cap on consecutive guard redirects, so an A→B→A guard can't loop forever. */
const MAX_GUARD_REDIRECTS = 8;

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
export function normalisePath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let value = String(raw);
  if (value.startsWith("#")) value = value.slice(1);
  // Strip query string and inner fragment.
  const queryAt = value.indexOf("?");
  if (queryAt >= 0) value = value.slice(0, queryAt);
  // Collapse repeated slashes, then strip trailing slash (but keep "/").
  value = value.replace(/\/{2,}/g, "/");
  if (!value || value === "/") return "/";
  if (!value.startsWith("/")) value = "/" + value;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

/**
 * Match a route pattern against a concrete path. Patterns support:
 *   - literal segments: `/about`
 *   - parameter segments: `/users/:id`
 *   - wildcard catch-all: `*` (matches any path, params empty unless mixed)
 *   - mixed wildcard: `/docs/*` (matches everything under `/docs/`)
 */
export function matchRoute(pattern: string, path: string): RouteMatch {
  if (!pattern) return { matched: false, params: {} };
  // Pure wildcard catches everything.
  if (pattern === "*") return { matched: true, params: {}, wildcard: true };

  const normPattern = normalisePath(pattern);
  const normPath = normalisePath(path);

  const patternSegments = normPattern === "/" ? [] : normPattern.slice(1).split("/");
  const pathSegments = normPath === "/" ? [] : normPath.slice(1).split("/");

  const params: RouteParams = {};
  let wildcard = false;

  for (let i = 0; i < patternSegments.length; i += 1) {
    const patternSegment = patternSegments[i]!;

    if (patternSegment === "*") {
      // Trailing wildcard — consumes the rest of the path.
      wildcard = true;
      const rest = pathSegments.slice(i).join("/");
      params._ = rest;
      return { matched: true, params, wildcard };
    }

    const pathSegment = pathSegments[i];
    if (pathSegment === undefined) return { matched: false, params: {} };

    if (patternSegment.startsWith(":")) {
      const name = patternSegment.slice(1);
      if (!name) return { matched: false, params: {} };
      params[name] = decodeURIComponent(pathSegment);
      continue;
    }

    if (patternSegment !== pathSegment) return { matched: false, params: {} };
  }

  // No wildcard, and path has more segments than pattern → no match.
  if (!wildcard && pathSegments.length > patternSegments.length) {
    return { matched: false, params: {} };
  }

  return wildcard ? { matched: true, params, wildcard: true } : { matched: true, params };
}

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
export function matchRoutePrefix(pattern: string, path: string): PrefixMatch {
  if (!pattern || pattern === "*") return { matched: true, params: {}, rest: normalisePath(path) };
  const normPattern = normalisePath(pattern);
  const normPath = normalisePath(path);
  const patternSegments = normPattern === "/" ? [] : normPattern.slice(1).split("/");
  const pathSegments = normPath === "/" ? [] : normPath.slice(1).split("/");
  if (pathSegments.length < patternSegments.length) return { matched: false, params: {}, rest: "/" };

  const params: RouteParams = {};
  for (let i = 0; i < patternSegments.length; i += 1) {
    const ps = patternSegments[i]!;
    const seg = pathSegments[i]!;
    if (ps.startsWith(":")) { params[ps.slice(1)] = decodeURIComponent(seg); continue; }
    if (ps !== seg) return { matched: false, params: {}, rest: "/" };
  }
  const restSegments = pathSegments.slice(patternSegments.length);
  const rest = restSegments.length === 0 ? "/" : "/" + restSegments.join("/");
  return { matched: true, params, rest };
}
export class Router {
  private currentPath: string;
  private currentParams: RouteParams = {};
  private currentPattern: string | null = null;
  private enabled = false;
  private hashListener: (() => void) | null = null;
  private listeners = new Set<RouteListener>();
  private readonly defaultPath: string;
  private mode: "hash" | "history";
  private basePath: string;
  /** True while we're updating `window.location` ourselves — used to
   * filter out the resulting `hashchange` / `popstate` echo. */
  private settingHash = false;
  /** Optional navigation guard registered via `$util.onNavigate(fn)`. */
  private guard: NavigationGuard | null = null;

  constructor(options: RouterOptions = {}) {
    this.defaultPath = normalisePath(options.defaultPath ?? "/");
    this.currentPath = this.defaultPath;
    this.mode = options.mode === "history" ? "history" : "hash";
    this.basePath = normaliseBase(options.basePath);
  }

  /**
   * Re-configure the URL strategy before `start()` is called. The host
   * element uses this to apply the `router-mode` / `router-base` attributes
   * it reads at connect time. No-op once the router is already enabled.
   */
  configure(options: { mode?: "hash" | "history"; basePath?: string }): void {
    if (this.enabled) return;
    if (options.mode) this.mode = options.mode === "history" ? "history" : "hash";
    if (options.basePath !== undefined) this.basePath = normaliseBase(options.basePath);
  }

  getMode(): "hash" | "history" {
    return this.mode;
  }

  /**
   * Attach the `hashchange` listener and synchronise from the current URL.
   * Safe to call multiple times — it's idempotent.
   */
  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    if (typeof window === "undefined") return;

    const sync = (source: RouteChangeDetail["source"]): void => {
      if (this.settingHash) return;
      const next = normalisePath(this.readLocation());
      if (next === this.currentPath) return;
      // Consult the guard for URL-driven navigations (back/forward, manual
      // edits). A block reverts the URL; a redirect rewinds then re-navigates.
      const decision = this.runGuard(next);
      if (decision === false) {
        this.restoreUrl();
        return;
      }
      if (typeof decision === "string") {
        this.restoreUrl();
        this.navigateInternal(normalisePath(decision), 0);
        return;
      }
      this.setPath(next, source);
    };

    if (this.mode === "history") {
      const listener = (): void => sync("hashchange");
      window.addEventListener("popstate", listener);
      this.hashListener = listener;
    } else {
      const listener = (): void => sync("hashchange");
      window.addEventListener("hashchange", listener);
      this.hashListener = listener;
    }
    sync("init");
  }

  /** Read the active path from `window.location` per the current mode. */
  private readLocation(): string {
    if (typeof window === "undefined") return this.currentPath;
    if (this.mode === "history") {
      let path = window.location.pathname || "/";
      if (this.basePath && path.startsWith(this.basePath)) {
        path = path.slice(this.basePath.length) || "/";
      }
      return normalisePath(path);
    }
    return normalisePath(window.location.hash);
  }

  /**
   * Detach the `hashchange` listener. The current path stays as the last
   * observed value so a follow-up `start()` resumes cleanly.
   */
  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    if (typeof window !== "undefined" && this.hashListener) {
      window.removeEventListener("hashchange", this.hashListener);
      window.removeEventListener("popstate", this.hashListener);
    }
    this.hashListener = null;
  }

  getPath(): string {
    return this.currentPath;
  }

  getParams(): RouteParams {
    return this.currentParams;
  }

  /** Path pattern of the most recently matched route arm (or null). */
  getActivePattern(): string | null {
    return this.currentPattern;
  }

  /**
   * Called by `Router({...})` after each render so we have the canonical
   * pattern + params for the active page (used by `NavLink` to highlight the
   * active link). The state store is NOT touched here.
   */
  setActiveMatch(pattern: string | null, params: RouteParams): void {
    this.currentPattern = pattern;
    // Reference equality short-circuits work for the most common case
    // (route hasn't changed since the last render).
    if (!shallowEqual(this.currentParams, params)) {
      this.currentParams = params;
    }
  }

  /**
   * Navigate to the given path. When enabled, this updates the URL hash and
   * relies on `hashchange` to notify listeners (so browser history works).
   * When disabled, the navigation stays in-memory. A registered navigation
   * guard may block (`false`) or redirect (path string) the change.
   */
  navigate(path: string): void {
    this.navigateInternal(normalisePath(path), 0);
  }

  /**
   * Register (or clear, with `null`) the navigation guard. The guard runs
   * before every in-app `navigate(...)` and every URL-driven change once the
   * router is started. Set via `$util.onNavigate(fn)`.
   */
  /** True when the program installed a navigation guard (`$router.guard = …`). */
  hasGuard(): boolean {
    return this.guard !== null;
  }

  setGuard(guard: NavigationGuard | null): void {
    this.guard = guard;
  }

  /** Run the guard for a pending navigation, failing open on error. */
  private runGuard(to: string): boolean | string | void {
    if (!this.guard) return true;
    try {
      return this.guard({ to, from: this.currentPath });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion] navigation guard threw", err);
      return true; // fail open — never trap the user on a broken guard
    }
  }

  /** Rewind `window.location` to the current path (used when a guard blocks). */
  private restoreUrl(): void {
    if (typeof window === "undefined") return;
    this.settingHash = true;
    try {
      if (this.mode === "history" && typeof window.history?.replaceState === "function") {
        window.history.replaceState({}, "", (this.basePath || "") + this.currentPath);
      } else {
        window.location.hash = "#" + this.currentPath;
      }
    } finally {
      queueMicrotask(() => { this.settingHash = false; });
    }
  }

  /** Commit a navigation after the guard has approved it (with redirect cap). */
  private navigateInternal(path: string, redirectDepth: number): void {
    const next = normalisePath(path);
    if (next === this.currentPath) return;

    const decision = this.runGuard(next);
    if (decision === false) return;
    if (typeof decision === "string" && redirectDepth < MAX_GUARD_REDIRECTS) {
      this.navigateInternal(normalisePath(decision), redirectDepth + 1);
      return;
    }

    if (this.enabled && typeof window !== "undefined") {
      this.settingHash = true;
      try {
        if (this.mode === "history" && typeof window.history?.pushState === "function") {
          window.history.pushState({}, "", (this.basePath || "") + next);
        } else {
          window.location.hash = "#" + next;
        }
      } finally {
        // The `hashchange` listener fires asynchronously, but some browsers
        // (and happy-dom) fire it synchronously. Either way we reset the
        // flag after the next microtask so the event we triggered doesn't
        // come back through.
        queueMicrotask(() => {
          this.settingHash = false;
        });
      }
      // Some test environments (happy-dom) don't always fire hashchange.
      // Update state eagerly so subscribers don't have to depend on the
      // event being delivered.
      this.setPath(next, "navigate");
      return;
    }

    this.setPath(next, "navigate");
  }

  subscribe(listener: RouteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replace the current path without going through `window.location`. */
  private setPath(path: string, source: RouteChangeDetail["source"]): void {
    const next = normalisePath(path);
    if (next === this.currentPath) return;
    const previousPath = this.currentPath;
    this.currentPath = next;
    // Params and pattern are recomputed by the next render — clear them so
    // a stale match from the previous page doesn't leak into the new one.
    this.currentParams = {};
    this.currentPattern = null;
    for (const listener of [...this.listeners]) {
      try {
        listener({ path: next, previousPath, source });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[aktion] router listener failed", err);
      }
    }
  }
}

/**
 * Normalise a base path for history mode: ensure a single leading slash and
 * no trailing slash. Empty / "/" collapse to "" so concatenation is a no-op.
 *
 *   normaliseBase(undefined) → ""
 *   normaliseBase("/")       → ""
 *   normaliseBase("app")     → "/app"
 *   normaliseBase("/app/")   → "/app"
 */
function normaliseBase(raw: string | null | undefined): string {
  if (!raw) return "";
  let value = String(raw).trim();
  if (value === "" || value === "/") return "";
  if (!value.startsWith("/")) value = "/" + value;
  if (value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
