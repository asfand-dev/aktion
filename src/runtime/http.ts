/**
 * HTTP runtime for the language. The language exposes a single
 * `Http({...})` function that returns a reactive resource bag with
 * `data`, `error`, `status`, `loading`, `headers`, `lastUpdated`,
 * `refetch()`, and `cancel()`.
 *
 * Every call takes a self-contained config: an absolute `url`, an
 * optional `method` (defaults to `GET`), a convenience `query` object
 * serialised into the URL, `headers`, `body`, and any other
 * `fetch`-compatible option (`credentials`, `mode`, `cache`, …) passed
 * through verbatim. There are no host-wide defaults — each request
 * fully describes itself.
 *
 * Host integrators may still register cross-cutting interceptors
 * (`onRequest` / `onResponse` / `onError`) on the `HttpRuntime`
 * singleton; they fire around every request.
 */

import type { EvaluationContext } from "./evaluator.js";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type HttpMethod =
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

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
  onResponse?: (
    response: HttpResponse,
    retry: () => Promise<HttpResponse>,
  ) => HttpResponse | Promise<HttpResponse>;
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
  finish(
    id: string,
    outcome: {
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
    },
  ): void;
  /** Optional pre-flight: delay, mock, or fail the request. */
  gate?(request: HttpRequest): HttpGateVerdict | undefined;
}

/** Reactive lifecycle of an `Http({...})` resource. */
export type ResourceState = "idle" | "loading" | "data" | "error" | "stale";

/**
 * Hidden brand stamped on every bag returned by `createHttpResource`.
 * The evaluator uses `isEndpointResource` to recognise a live resource so
 * property writes (`$patch.onDone = …`) mutate it in place instead of
 * cloning it — see the note on `onDone` below.
 */
const HTTP_RESOURCE_BRAND = Symbol("aktion.httpResource");

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
export function isEndpointResource(value: unknown): value is EndpointResource {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[HTTP_RESOURCE_BRAND] === true
  );
}

/* -------------------------------------------------------------------------- */
/*  Runtime                                                                   */
/* -------------------------------------------------------------------------- */

export class HttpRuntime {
  private interceptors: HttpInterceptors = {};
  /**
   * Program-level interceptors registered in-program via
   * `$util.onRequest` / `$util.onResponse` (suggestions-global VI.5). Kept in
   * a separate layer from host interceptors so a replan can wipe them without
   * disturbing host glue. Request interceptors run host→program; response
   * interceptors run program→host (inner-to-outer, the usual convention).
   */
  private programInterceptors: HttpInterceptors = {};

  /**
   * DevTools tap, or `null` in the normal case. See {@link HttpDevtoolsTap} —
   * one null check per request when no debugger is attached.
   */
  private tap: HttpDevtoolsTap | null = null;

  /** Install (or with `null`, remove) the DevTools network tap. */
  setDevtoolsTap(tap: HttpDevtoolsTap | null): void {
    this.tap = tap;
  }

  /** Merge new interceptors on top of any previously-registered ones. */
  registerInterceptors(interceptors: HttpInterceptors): void {
    this.interceptors = { ...this.interceptors, ...interceptors };
  }

  /** Merge in-program interceptors on top of any already registered. */
  registerProgramInterceptors(interceptors: HttpInterceptors): void {
    this.programInterceptors = { ...this.programInterceptors, ...interceptors };
  }

  /** Drop every in-program interceptor (called on replan so they don't leak). */
  clearProgramInterceptors(): void {
    this.programInterceptors = {};
  }

  /** Notify both interceptor layers of a request error. */
  private fireError(error: unknown, request: HttpRequest): void {
    this.interceptors.onError?.(error, request);
    this.programInterceptors.onError?.(error, request);
  }

  /**
   * Resolve a URL. Currently a pass-through — every `Http({ url })` call
   * is expected to supply an absolute URL. Kept as a hook so request
   * interceptors can rely on a stable shape if URL rewriting is added
   * later.
   */
  resolveUrl(url: string): string {
    return url;
  }

  /**
   * Issue a single HTTP request. Runs through `onRequest`/`onResponse`
   * interceptors (host + program layers) and surfaces a `retry()` one-shot
   * inside each `onResponse`.
   */
  async request(input: HttpRequest): Promise<HttpResponse> {
    let req: HttpRequest = { ...input, headers: { ...input.headers } };
    const requestChain = [this.interceptors.onRequest, this.programInterceptors.onRequest];
    for (const onRequest of requestChain) {
      if (!onRequest) continue;
      try {
        req = await onRequest(req);
      } catch (err) {
        this.fireError(err, req);
        throw err;
      }
    }

    const exec = async (): Promise<HttpResponse> => {
      const controller = new AbortController();
      const fetchFn = typeof fetch === "function" ? fetch : null;
      if (!fetchFn) {
        throw new Error("`fetch` is not available in this environment");
      }
      const init: RequestInit = {
        ...(req.init as RequestInit | undefined),
        method: req.method,
        headers: req.headers,
        signal: req.signal ?? controller.signal,
      };
      if (req.body !== undefined && req.method !== "GET" && req.method !== "HEAD") {
        init.body = encodeBody(req.body, req.headers);
      }
      const response = await fetchFn(req.url, init);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const contentType = headers["content-type"] ?? "";
      let body: unknown;
      if (response.status === 204 || req.method === "HEAD") {
        body = null;
      } else if (contentType.includes("application/json")) {
        body = await response.json().catch(() => null);
      } else {
        body = await response.text().catch(() => "");
      }
      return { status: response.status, headers, body };
    };

    // DevTools: observe (and possibly simulate) this request. The tap is only
    // installed while a frontend is attached; `verdict` is undefined unless a
    // rule matched, so the normal path is a null check and a clock read.
    const tap = this.tap;
    const verdict = tap?.gate?.(req);
    const traceId = tap ? tap.start(req) : "";
    const startedAt = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
    const elapsed = (): number => (
      (typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - startedAt
    );
    if (verdict?.delayMs && verdict.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, verdict.delayMs));
    }
    if (tap && verdict?.error !== undefined) {
      // A rule asked for a failure — surface it exactly like a transport error
      // so the program's `error` / `onDone` paths behave identically.
      const failure = new Error(verdict.error);
      tap.finish(traceId, {
        request: req, error: failure, duration: elapsed(),
        rule: verdict.rule, injectedDelay: verdict.delayMs,
      });
      this.fireError(failure, req);
      throw failure;
    }
    if (tap && verdict?.response !== undefined) {
      const mocked = verdict.response;
      tap.finish(traceId, {
        request: req, response: mocked, duration: elapsed(),
        rule: verdict.rule, mocked: true, injectedDelay: verdict.delayMs,
      });
      return mocked;
    }

    try {
      let response = await exec();
      const responseChain = [this.programInterceptors.onResponse, this.interceptors.onResponse];
      for (const onResponse of responseChain) {
        if (!onResponse) continue;
        let retried = false;
        const retry = async (): Promise<HttpResponse> => {
          if (retried) return response;
          retried = true;
          return exec();
        };
        response = await onResponse(response, retry);
      }
      tap?.finish(traceId, {
        request: req, response, duration: elapsed(),
        rule: verdict?.rule, injectedDelay: verdict?.delayMs,
      });
      return response;
    } catch (err) {
      tap?.finish(traceId, {
        request: req, error: err, duration: elapsed(),
        rule: verdict?.rule, injectedDelay: verdict?.delayMs,
      });
      this.fireError(err, req);
      throw err;
    }
  }
}

function encodeBody(body: unknown, headers: Record<string, string>): BodyInit {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body;
  if (body instanceof Blob || body instanceof ArrayBuffer) return body as BodyInit;
  if (typeof FormData !== "undefined" && body instanceof FormData) return body;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return body;
  if (!headers["content-type"] && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

/* -------------------------------------------------------------------------- */
/*  Http({...}) — reactive resource factory                                   */
/* -------------------------------------------------------------------------- */

/** Keys consumed by the request builder; everything else is passed to `fetch`. */
const RESERVED_CONFIG_KEYS = new Set([
  "url",
  "method",
  "headers",
  "body",
  "query",
  "signal",
  "gql",
  "variables",
  "optimistic",
  "invalidates",
]);

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
export function invalidateQueries(ctx: EvaluationContext, keys: unknown): void {
  const list = Array.isArray(keys) ? keys : keys != null ? [keys] : [];
  const needles = list.map((k) => String(k)).filter(Boolean);
  if (needles.length === 0) return;
  for (const [cacheKey, resource] of ctx.queryCache) {
    if (needles.some((n) => cacheKey.includes(n))) {
      if (!resource.loading) void resource.refetch();
    }
  }
}

/**
 * Build an `HttpRequest` from the user-supplied configuration object
 * accepted by `Http({...})`. Recognises `url`, `method` (default `GET`),
 * `headers`, `body`, and a `query` shorthand whose entries are appended
 * to the URL as a querystring. Every other key is forwarded verbatim as
 * a `fetch` option (`credentials`, `mode`, `cache`, `redirect`, …).
 *
 * GraphQL (VI.6): when `gql` (a query/mutation document string) is present
 * the request becomes a `POST` with a `{ query, variables }` JSON body, so
 * `$query({ url: "/graphql", gql: "{ viewer { login } }" })` just works.
 */
function buildRequestFromConfig(config: unknown): HttpRequest {
  const cfg = (config && typeof config === "object" && !Array.isArray(config))
    ? (config as Record<string, unknown>)
    : {};
  const url = typeof cfg.url === "string" ? cfg.url : "";
  const isGraphQL = typeof cfg.gql === "string" && cfg.gql.trim().length > 0;
  const method = isGraphQL
    ? "POST" as HttpMethod
    : (typeof cfg.method === "string" ? cfg.method.toUpperCase() : "GET") as HttpMethod;
  const headers: Record<string, string> = {};
  if (cfg.headers && typeof cfg.headers === "object" && !Array.isArray(cfg.headers)) {
    for (const [k, v] of Object.entries(cfg.headers as Record<string, unknown>)) {
      if (v == null) continue;
      headers[k] = String(v);
    }
  }
  let finalUrl = url;
  if (cfg.query && typeof cfg.query === "object" && !Array.isArray(cfg.query)) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(cfg.query as Record<string, unknown>)) {
      if (v == null) continue;
      params.append(k, String(v));
    }
    const qs = params.toString();
    if (qs) finalUrl += (finalUrl.includes("?") ? "&" : "?") + qs;
  }
  const init: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (RESERVED_CONFIG_KEYS.has(k)) continue;
    init[k] = v;
  }
  const req: HttpRequest = {
    url: finalUrl,
    method,
    headers,
    body: isGraphQL
      ? { query: cfg.gql, variables: asRecord(cfg.variables) }
      : cfg.body,
  };
  if (Object.keys(init).length > 0) req.init = init;
  if (cfg.signal instanceof AbortSignal) req.signal = cfg.signal;
  return req;
}

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
export function createHttpResource(
  config: unknown,
  ctx: EvaluationContext,
): EndpointResource {
  const resource: EndpointResource = {
    state: "loading",
    data: undefined,
    error: undefined,
    loading: true,
    refetch: async () => { await run(); },
    cancel: () => {
      // Invalidate the in-flight run, abort its fetch, and settle the
      // bag back to a resting state so the UI stops showing a spinner.
      generation += 1;
      if (controller) controller.abort();
      controller = null;
      if (resource.loading) {
        resource.loading = false;
        resource.state = resource.data === undefined ? "idle" : "data";
        notify();
      }
    },
  };

  // Brand the bag (non-enumerable so it never leaks into `{...res}` spreads
  // or JSON) so the evaluator can recognise it as a live resource.
  Object.defineProperty(resource, HTTP_RESOURCE_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
  });

  let controller: AbortController | null = null;
  let generation = 0;
  const notify = () => ctx.notify?.();

  const run = async (): Promise<void> => {
    const runId = (generation += 1);
    if (controller) controller.abort();
    controller = new AbortController();
    const localController = controller;
    resource.state = resource.data === undefined ? "loading" : "stale";
    resource.loading = true;
    notify();

    if (!ctx.http) {
      resource.error = { message: "http runtime not available" };
      resource.state = "error";
      resource.loading = false;
      notify();
      return;
    }
    try {
      const req = buildRequestFromConfig(config);
      req.url = ctx.http.resolveUrl(req.url);
      req.signal = localController.signal;
      const response = await ctx.http.request(req);
      if (runId !== generation) return; // superseded by a newer run / cancel
      const ok = response.status >= 200 && response.status < 300;
      // GraphQL (VI.6): unwrap `{ data, errors }` so `.data` is the payload and
      // a GraphQL-level `errors` array surfaces through `.error` even on a 200.
      const isGraphQL = typeof (asRecord(config).gql) === "string";
      const gqlBody = isGraphQL ? asRecord(response.body) : null;
      const gqlErrors = gqlBody && Array.isArray(gqlBody.errors) && gqlBody.errors.length > 0
        ? gqlBody.errors
        : null;
      if (ok && !gqlErrors) {
        resource.data = isGraphQL ? gqlBody!.data : response.body;
        resource.state = "data";
        resource.error = undefined;
      } else {
        resource.error = gqlErrors
          ? { graphqlErrors: gqlErrors }
          : { status: response.status, body: response.body };
        resource.state = "error";
      }
      resource.status = response.status;
      resource.headers = response.headers;
      resource.lastUpdated = Date.now();
    } catch (err) {
      if (runId !== generation) return; // superseded — swallow late rejection
      if ((err as { name?: string })?.name === "AbortError") return;
      resource.error = err;
      resource.state = "error";
    } finally {
      // Only the latest run settles the bag — a superseded run (a newer
      // refetch / cancel bumped `generation`) leaves everything untouched
      // and, crucially, does not fire `onDone`.
      if (runId === generation) {
        resource.loading = false;
        notify();
        if (typeof resource.onDone === "function") {
          try {
            resource.onDone(resource);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[aktion] Http onDone callback threw", err);
          }
        }
      }
    }
  };

  // Kick off the initial fetch on the next tick so the synchronous
  // evaluation doesn't have to await.
  void run();
  return resource;
}

/* -------------------------------------------------------------------------- */
/*  $query({...}) — cached + deduplicated read                                */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Coerce a config flag to boolean (accepts `true` / `"true"`). */
function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

/** Stable cache key for a query config (used when no explicit `key` given). */
function deriveQueryKey(cfg: Record<string, unknown>): string {
  const method = typeof cfg.method === "string" ? cfg.method.toUpperCase() : "GET";
  const url = typeof cfg.url === "string" ? cfg.url : "";
  let q = "null";
  let b = "null";
  try { q = JSON.stringify(cfg.query ?? null); } catch { /* keep default */ }
  try { b = JSON.stringify(cfg.body ?? null); } catch { /* keep default */ }
  // GraphQL documents + variables participate in the key so two different
  // queries against the same endpoint cache separately.
  let g = "null";
  if (typeof cfg.gql === "string") {
    let v = "null";
    try { v = JSON.stringify(cfg.variables ?? null); } catch { /* keep default */ }
    g = `${cfg.gql}|${v}`;
  }
  return `${method} ${url} ${q} ${b} ${g}`;
}

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
export function createQueryResource(
  config: unknown,
  ctx: EvaluationContext,
): EndpointResource {
  const cfg = asRecord(config);
  // Infinite / paginated query (VI.1): a dedicated bag that accumulates pages.
  if (cfg.infinite && typeof cfg.infinite === "object") {
    const key = cfg.key != null ? String(cfg.key) : deriveQueryKey(cfg);
    const cached = ctx.queryCache.get(key);
    if (cached) return cached;
    const resource = createInfiniteQueryResource(cfg, ctx);
    ctx.queryCache.set(key, resource);
    return resource;
  }
  const ttl = typeof cfg.ttl === "number" ? cfg.ttl : 0;
  const key = cfg.key != null ? String(cfg.key) : deriveQueryKey(cfg);
  const cache = ctx.queryCache;
  const existing = cache.get(key);
  if (existing) {
    if (
      ttl > 0 &&
      existing.lastUpdated != null &&
      Date.now() - existing.lastUpdated > ttl &&
      !existing.loading
    ) {
      void existing.refetch();
    }
    return existing;
  }
  // Strip query-layer-only keys so they aren't forwarded to `fetch`.
  const httpConfig: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (k === "key" || k === "ttl" || k === "refetchInterval" || k === "refetchOnFocus" || k === "refetchOnReconnect") continue;
    httpConfig[k] = v;
  }
  const resource = createHttpResource(httpConfig, ctx);
  cache.set(key, resource);

  // Background refetch (suggestions-global VI.4). Set up ONCE per resource
  // (it's cached across renders) and torn down via ctx.disposers on replan.
  const interval = typeof cfg.refetchInterval === "number" ? cfg.refetchInterval : 0;
  if (interval > 0) {
    const id = setInterval(() => { if (!resource.loading) void resource.refetch(); }, Math.max(250, interval));
    ctx.disposers.push(() => clearInterval(id));
  }
  if (asBoolean(cfg.refetchOnFocus) && typeof window !== "undefined") {
    const onFocus = (): void => { if (!resource.loading) void resource.refetch(); };
    window.addEventListener("focus", onFocus);
    ctx.disposers.push(() => window.removeEventListener("focus", onFocus));
  }
  if (asBoolean(cfg.refetchOnReconnect) && typeof window !== "undefined") {
    const onOnline = (): void => { if (!resource.loading) void resource.refetch(); };
    window.addEventListener("online", onOnline);
    ctx.disposers.push(() => window.removeEventListener("online", onOnline));
  }
  return resource;
}

/**
 * `$query({ url, infinite: { param?, start?, limit? } })` — an infinite /
 * paginated read (VI.1). `data` holds the flattened items across every loaded
 * page; `loadMore()` fetches and appends the next page; `hasMore` is true while
 * the last page came back full (`length === limit`). `param` is the page/offset
 * query key (default `"page"`); `mode` is `"page"` (1,2,3…) or `"offset"`
 * (0, limit, 2·limit…). An optional `select(body)` maps a page body to its item
 * array when the items are nested (e.g. `body => body.results`).
 */
function createInfiniteQueryResource(
  cfg: Record<string, unknown>,
  ctx: EvaluationContext,
): EndpointResource {
  const opts = asRecord(cfg.infinite);
  const param = typeof opts.param === "string" ? opts.param : "page";
  const limit = typeof opts.limit === "number" && opts.limit > 0 ? opts.limit : 20;
  const start = typeof opts.start === "number" ? opts.start : (opts.mode === "offset" ? 0 : 1);
  const mode = opts.mode === "offset" ? "offset" : "page";
  const select = typeof opts.select === "function" ? (opts.select as (b: unknown) => unknown) : null;
  const notify = () => ctx.notify?.();
  const pages: unknown[] = [];
  let pageIndex = start;
  let inFlight = false;

  const baseConfig: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (k === "key" || k === "ttl" || k === "infinite") continue;
    baseConfig[k] = v;
  }

  const toItems = (body: unknown): unknown[] => {
    const picked = select ? select(body) : body;
    return Array.isArray(picked) ? picked : [];
  };
  const flatten = (): unknown[] => {
    const out: unknown[] = [];
    for (const p of pages) for (const item of toItems(p)) out.push(item);
    return out;
  };

  const resource: EndpointResource = {
    state: "loading",
    data: [],
    error: undefined,
    loading: true,
    hasMore: true,
    loadingMore: false,
    page: start,
    pages,
    refetch: async () => {
      if (inFlight) return; // a reset mid-flight would interleave page writes
      pages.length = 0;
      pageIndex = start;
      resource.hasMore = true;
      await fetchPage(true);
    },
    cancel: () => { /* infinite query has no single in-flight controller to expose */ },
    loadMore: async () => {
      if (inFlight || !resource.hasMore) return;
      await fetchPage(false);
    },
  };
  Object.defineProperty(resource, HTTP_RESOURCE_BRAND, { value: true, enumerable: false, writable: false });

  const fetchPage = async (isReset: boolean): Promise<void> => {
    if (!ctx.http) {
      resource.error = { message: "http runtime not available" };
      resource.state = "error";
      resource.loading = false;
      notify();
      return;
    }
    inFlight = true;
    if (isReset || pages.length === 0) { resource.loading = true; resource.state = pages.length ? "stale" : "loading"; }
    else { resource.loadingMore = true; }
    notify();
    try {
      // `pageIndex` already advances by `limit` in offset mode and by 1 in
      // page mode (see below), so it IS the wire value for both.
      const pageValue = pageIndex;
      const merged: Record<string, unknown> = {
        ...baseConfig,
        query: { ...asRecord(baseConfig.query), [param]: pageValue, limit },
      };
      const req = buildRequestFromConfig(merged);
      req.url = ctx.http.resolveUrl(req.url);
      const response = await ctx.http.request(req);
      const ok = response.status >= 200 && response.status < 300;
      if (!ok) {
        resource.error = { status: response.status, body: response.body };
        resource.state = "error";
        return;
      }
      const items = toItems(response.body);
      pages.push(response.body);
      resource.hasMore = items.length >= limit;
      pageIndex = mode === "offset" ? pageIndex + limit : pageIndex + 1;
      resource.page = mode === "offset" ? pages.length : pageIndex - 1;
      resource.data = flatten();
      resource.error = undefined;
      resource.state = "data";
      resource.lastUpdated = Date.now();
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      resource.error = err;
      resource.state = "error";
    } finally {
      inFlight = false;
      resource.loading = false;
      resource.loadingMore = false;
      notify();
    }
  };

  void fetchPage(true);
  return resource;
}

/* -------------------------------------------------------------------------- */
/*  $mutation({...}) — deferred-fire write                                    */
/* -------------------------------------------------------------------------- */

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
export function createMutationResource(
  baseConfig: unknown,
  ctx: EvaluationContext,
): MutationResource {
  const base = asRecord(baseConfig);
  let generation = 0;
  let controller: AbortController | null = null;
  const notify = () => ctx.notify?.();

  const resource: MutationResource = {
    data: undefined,
    error: undefined,
    loading: false,
    reset: () => {
      generation += 1;
      if (controller) controller.abort();
      controller = null;
      resource.data = undefined;
      resource.error = undefined;
      resource.status = undefined;
      resource.loading = false;
      notify();
    },
    mutate: async (overrides?: unknown): Promise<unknown> => {
      const runId = (generation += 1);
      if (controller) controller.abort();
      controller = new AbortController();
      const localController = controller;
      resource.loading = true;
      resource.error = undefined;

      // Optimistic update (VI.2): snapshot state, then run the optimistic fn so
      // the UI reflects the change instantly. Roll back if the request fails.
      const optimistic = base.optimistic;
      let rollback: (() => void) | null = null;
      if (typeof optimistic === "function") {
        const snapshot = new Map<string, unknown>();
        for (const [name, value] of ctx.state.entries()) snapshot.set(name, value);
        rollback = (): void => {
          for (const [name] of ctx.state.entries()) {
            if (!snapshot.has(name)) ctx.state.set(name, undefined as never);
          }
          for (const [name, value] of snapshot) ctx.state.set(name, value as never);
          ctx.notify?.();
        };
        try { (optimistic as (o: unknown) => void)(asRecord(overrides)); } catch { /* ignore */ }
      }
      notify();

      if (!ctx.http) {
        resource.error = { message: "http runtime not available" };
        resource.loading = false;
        if (rollback) rollback();
        notify();
        return undefined;
      }
      try {
        const merged: Record<string, unknown> = { method: "POST", ...base, ...asRecord(overrides) };
        const req = buildRequestFromConfig(merged);
        req.url = ctx.http.resolveUrl(req.url);
        req.signal = localController.signal;
        const response = await ctx.http.request(req);
        if (runId !== generation) return undefined;
        const ok = response.status >= 200 && response.status < 300;
        if (ok) {
          resource.data = response.body;
          resource.error = undefined;
          // Invalidate dependent queries so they refetch fresh server state.
          if (base.invalidates != null) invalidateQueries(ctx, base.invalidates);
        } else {
          resource.error = { status: response.status, body: response.body };
          if (rollback) rollback();
        }
        resource.status = response.status;
        return ok ? response.body : undefined;
      } catch (err) {
        if (runId !== generation) return undefined;
        if ((err as { name?: string })?.name === "AbortError") return undefined;
        resource.error = err;
        if (rollback) rollback();
        return undefined;
      } finally {
        if (runId === generation) {
          resource.loading = false;
          notify();
          if (typeof resource.onDone === "function") {
            try {
              resource.onDone(resource);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error("[aktion] $mutation onDone callback threw", err);
            }
          }
        }
      }
    },
  };

  // Brand so the evaluator mutates property writes (`$save.onDone = …`) in
  // place rather than cloning the bag and detaching the running request.
  Object.defineProperty(resource, HTTP_RESOURCE_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
  });
  return resource;
}
