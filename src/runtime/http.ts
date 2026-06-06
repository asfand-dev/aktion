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

  /** Merge new interceptors on top of any previously-registered ones. */
  registerInterceptors(interceptors: HttpInterceptors): void {
    this.interceptors = { ...this.interceptors, ...interceptors };
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
   * interceptors and surfaces a `retry()` one-shot inside `onResponse`.
   */
  async request(input: HttpRequest): Promise<HttpResponse> {
    let req: HttpRequest = { ...input, headers: { ...input.headers } };
    if (this.interceptors.onRequest) {
      try {
        req = await this.interceptors.onRequest(req);
      } catch (err) {
        this.interceptors.onError?.(err, req);
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

    try {
      let response = await exec();
      if (this.interceptors.onResponse) {
        let retried = false;
        const retry = async (): Promise<HttpResponse> => {
          if (retried) return response;
          retried = true;
          return exec();
        };
        response = await this.interceptors.onResponse(response, retry);
      }
      return response;
    } catch (err) {
      this.interceptors.onError?.(err, req);
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
]);

/**
 * Build an `HttpRequest` from the user-supplied configuration object
 * accepted by `Http({...})`. Recognises `url`, `method` (default `GET`),
 * `headers`, `body`, and a `query` shorthand whose entries are appended
 * to the URL as a querystring. Every other key is forwarded verbatim as
 * a `fetch` option (`credentials`, `mode`, `cache`, `redirect`, …).
 */
function buildRequestFromConfig(config: unknown): HttpRequest {
  const cfg = (config && typeof config === "object" && !Array.isArray(config))
    ? (config as Record<string, unknown>)
    : {};
  const url = typeof cfg.url === "string" ? cfg.url : "";
  const method = (typeof cfg.method === "string" ? cfg.method.toUpperCase() : "GET") as HttpMethod;
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
    body: cfg.body,
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
      if (ok) {
        resource.data = response.body;
        resource.state = "data";
        resource.error = undefined;
      } else {
        resource.error = { status: response.status, body: response.body };
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

/** Stable cache key for a query config (used when no explicit `key` given). */
function deriveQueryKey(cfg: Record<string, unknown>): string {
  const method = typeof cfg.method === "string" ? cfg.method.toUpperCase() : "GET";
  const url = typeof cfg.url === "string" ? cfg.url : "";
  let q = "null";
  let b = "null";
  try { q = JSON.stringify(cfg.query ?? null); } catch { /* keep default */ }
  try { b = JSON.stringify(cfg.body ?? null); } catch { /* keep default */ }
  return `${method} ${url} ${q} ${b}`;
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
    if (k === "key" || k === "ttl") continue;
    httpConfig[k] = v;
  }
  const resource = createHttpResource(httpConfig, ctx);
  cache.set(key, resource);
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
      notify();

      if (!ctx.http) {
        resource.error = { message: "http runtime not available" };
        resource.loading = false;
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
        } else {
          resource.error = { status: response.status, body: response.body };
        }
        resource.status = response.status;
        return ok ? response.body : undefined;
      } catch (err) {
        if (runId !== generation) return undefined;
        if ((err as { name?: string })?.name === "AbortError") return undefined;
        resource.error = err;
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
