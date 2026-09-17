import { EvaluationContext } from './evaluator.js';
export type HttpMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface HttpRequest {
    url: string;
    method: HttpMethod;
    headers: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
    /** Extra `fetch`-compatible options passed through verbatim. */
    init?: Record<string, unknown>;
}
export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}
export interface HttpInterceptors {
    onRequest?: (request: HttpRequest) => HttpRequest | Promise<HttpRequest>;
    onResponse?: (response: HttpResponse, retry: () => Promise<HttpResponse>) => HttpResponse | Promise<HttpResponse>;
    onError?: (error: unknown, request: HttpRequest) => void;
}
/**
 * How a DevTools frontend interfered with one request. Reported back on
 * {@link HttpDevtoolsTap.finish} so the network inspector can label the row
 * instead of showing a mocked 500 as if the server had really sent one.
 */
export interface HttpGateVerdict {
    /** Respond with this instead of hitting the network. */
    response?: HttpResponse;
    /** Fail the request with this message instead of hitting the network. */
    error?: string;
    /** Label of the rule that matched, for the inspector. */
    rule?: string;
    /** Latency to inject before the request proceeds (or before the mock resolves). */
    delayMs?: number;
}
/**
 * DevTools instrumentation for the HTTP layer.
 *
 * The runtime owns *transport*; a debugger owns *observation and simulation*.
 * This is the seam between them: the host element installs a tap while a
 * DevTools frontend is attached, and removes it when the panel closes. With no
 * tap installed the request path is byte-for-byte what it was before — one
 * `null` check per request.
 *
 * `gate` is what makes the network half a genuine testing tool: it can delay a
 * request, answer it with a canned response, or fail it outright, so an author
 * can reproduce a 500, a 3-second endpoint, or an offline device without
 * editing the program or standing up a server.
 */
export interface HttpDevtoolsTap {
    /** A request is leaving the interceptor chain; returns a correlation id. */
    start(request: HttpRequest): string;
    /** The request settled (or was mocked / failed by a rule). */
    finish(id: string, outcome: {
        request: HttpRequest;
        response?: HttpResponse;
        error?: unknown;
        duration: number;
        /** Label of the DevTools rule that produced this outcome, if any. */
        rule?: string;
        /** True when `response` came from a rule rather than the network. */
        mocked?: boolean;
        /** Latency injected by a rule, in ms. */
        injectedDelay?: number;
    }): void;
    /** Optional pre-flight: delay, mock, or fail the request. */
    gate?(request: HttpRequest): HttpGateVerdict | undefined;
}
/** Reactive lifecycle of an `Http({...})` resource. */
export type ResourceState = "idle" | "loading" | "data" | "error" | "stale";
/**
 * Reactive bag returned by `Http({...})`. Fields update in place as
 * the request progresses; the runtime calls `notify()` so the next
 * render observes the new values.
 */
export interface EndpointResource {
    state: ResourceState;
    data: unknown;
    error: unknown;
    loading: boolean;
    status?: number;
    headers?: Record<string, string>;
    lastUpdated?: number;
    refetch: () => Promise<void>;
    cancel: () => void;
    /**
     * Infinite/paginated query extras (VI.1), present only when the resource was
     * created with `$query({ infinite: {...} })`. `data` holds the flattened
     * items across every loaded page.
     */
    loadMore?: () => Promise<void>;
    hasMore?: boolean;
    loadingMore?: boolean;
    page?: number;
    pages?: unknown[];
    /**
     * Optional completion callback. Fires once each time a request settles
     * (success *or* error) — the initial load and every `refetch()`. It does
     * NOT fire when a request is superseded or `cancel()`led. Authors assign
     * it after creation:
     *
     *   $patch = Http({ url, method: "PATCH", body })
     *   $patch.onDone = () => { $todos.refetch() }
     *
     * The resource bag itself is passed as the sole argument so the callback
     * can branch on `res.error` / `res.data` without closing over `$patch`.
     */
    onDone?: (resource: EndpointResource) => void;
}
/** `true` when `value` is a live `Http({...})` resource bag. Used by the
 * evaluator to mutate property writes in place rather than cloning, which
 * would detach the running request's async continuations from the value
 * the program reads.
 */
export declare function isEndpointResource(value: unknown): value is EndpointResource;
export declare class HttpRuntime {
    private interceptors;
    /**
     * Program-level interceptors registered in-program via
     * `$util.onRequest` / `$util.onResponse` (suggestions-global VI.5). Kept in
     * a separate layer from host interceptors so a replan can wipe them without
     * disturbing host glue. Request interceptors run host→program; response
     * interceptors run program→host (inner-to-outer, the usual convention).
     */
    private programInterceptors;
    /**
     * DevTools tap, or `null` in the normal case. See {@link HttpDevtoolsTap} —
     * one null check per request when no debugger is attached.
     */
    private tap;
    /** Install (or with `null`, remove) the DevTools network tap. */
    setDevtoolsTap(tap: HttpDevtoolsTap | null): void;
    /** Merge new interceptors on top of any previously-registered ones. */
    registerInterceptors(interceptors: HttpInterceptors): void;
    /** Merge in-program interceptors on top of any already registered. */
    registerProgramInterceptors(interceptors: HttpInterceptors): void;
    /** Drop every in-program interceptor (called on replan so they don't leak). */
    clearProgramInterceptors(): void;
    /** Notify both interceptor layers of a request error. */
    private fireError;
    /**
     * Resolve a URL. Currently a pass-through — every `Http({ url })` call
     * is expected to supply an absolute URL. Kept as a hook so request
     * interceptors can rely on a stable shape if URL rewriting is added
     * later.
     */
    resolveUrl(url: string): string;
    /**
     * Issue a single HTTP request. Runs through `onRequest`/`onResponse`
     * interceptors (host + program layers) and surfaces a `retry()` one-shot
     * inside each `onResponse`.
     */
    request(input: HttpRequest): Promise<HttpResponse>;
}
/**
 * Refetch every cached query whose key contains any of the given substrings
 * (VI.2). Used by `$mutation({ invalidates: [...] })` and `$util.invalidate`.
 *
 * Matching is deliberately SUBSTRING-based: cache keys are derived from the
 * request (url + params), so `invalidates: ["/api/posts"]` refreshes the
 * list, every page of it, and any filtered variant in one go. The trade-off
 * is that a short needle ("post") can over-invalidate ("composting") — use
 * a path-ish needle ("/posts") when precision matters.
 */
export declare function invalidateQueries(ctx: EvaluationContext, keys: unknown): void;
/**
 * Run a single `Http({...})` call and return the reactive resource bag.
 *
 * The bag mutates in place: `data`, `error`, `status`, `loading`,
 * `headers`, `lastUpdated` update during the request lifecycle. The
 * `refetch()` callback re-issues the original request; `cancel()`
 * aborts the in-flight request (no-op when idle).
 *
 * A monotonic `generation` token guards every async continuation so a
 * superseded request (because `refetch()` or `cancel()` ran while it
 * was in flight) can never clobber the resource with stale data. This
 * is what makes back-to-back refetches and cancels deterministic.
 */
export declare function createHttpResource(config: unknown, ctx: EvaluationContext): EndpointResource;
/**
 * `$query({ url, key?, ttl?, ... })` — a cached, deduplicated `$http` read.
 *
 * Unlike `$http`, which fires a fresh request on every call, `$query` keys
 * the resource by `key` (or a value derived from method + url + query + body)
 * and reuses the same reactive bag across renders and across components. The
 * first caller creates the request; everyone else with the same key shares
 * the in-flight result (deduplication). Pass `ttl` (ms) to auto-refetch when
 * the cached data is older than the TTL.
 */
export declare function createQueryResource(config: unknown, ctx: EvaluationContext): EndpointResource;
/** Reactive bag returned by `$mutation({...})`. Fires only on `mutate()`. */
export interface MutationResource {
    data: unknown;
    error: unknown;
    loading: boolean;
    status?: number;
    /**
     * Fire the request. Optionally pass an overrides object (shallow-merged
     * over the base config) to set the `body` / `query` / `url` for this call:
     *   $save.mutate({ body: { title: $title } })
     * Resolves with the response body (or `undefined` on error / supersede).
     */
    mutate: (overrides?: unknown) => Promise<unknown>;
    /** Clear `data` / `error` / `loading` back to the resting state. */
    reset: () => void;
    /** Optional completion callback; fires once each time a mutation settles. */
    onDone?: (resource: MutationResource) => void;
}
/**
 * `$mutation({ url, method?, ... })` — a write that fires only when you call
 * `.mutate(...)`, not on render. The canonical create/update/delete pattern:
 *
 *   $save = $mutation({ url: "/todos", method: "POST" })
 *   ...
 *   Button("Add", { onClick: () => $save.mutate({ body: { title: $title } }) })
 *
 * Method defaults to `POST` when unspecified. The bag exposes reactive
 * `loading` / `error` / `data` plus `reset()` and an `onDone` hook.
 */
export declare function createMutationResource(baseConfig: unknown, ctx: EvaluationContext): MutationResource;
