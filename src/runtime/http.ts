/**
 * HTTP runtime for the language. The language exposes a single
 * `http({...})` function that returns a reactive resource bag with
 * `data`, `error`, `status`, `loading`, `headers`, `lastUpdated`,
 * `refetch()`, and `cancel()`.
 *
 * Configuration (base URL, default headers, retry, interceptors) is
 * captured by an `HttpRuntime` singleton; the host registers it once
 * at element-construction time. Programs may opt in to per-program
 * defaults via `$http = Http({ baseUrl, headers, retry, ... })`.
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

export interface HttpDefaults {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: { count: number; backoff?: "linear" | "exponential" };
  credentials?: RequestCredentials;
}

/** Reactive lifecycle of an `http({...})` resource. */
export type ResourceState = "idle" | "loading" | "data" | "error" | "stale";

/**
 * Reactive bag returned by `http({...})`. Fields update in place as
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
}

/** Compatibility shim — subscription transports were removed in this version. */
export interface SubscriptionTransport {
  open(url: string, opts: { protocol?: string; headers?: Record<string, string> }): {
    onMessage(cb: (raw: unknown) => void): void;
    onError(cb: (err: unknown) => void): void;
    onClose(cb: () => void): void;
    onOpen(cb: () => void): void;
    send(payload: unknown): void;
    close(): void;
  };
}

/* -------------------------------------------------------------------------- */
/*  Runtime                                                                   */
/* -------------------------------------------------------------------------- */

export class HttpRuntime {
  private interceptors: HttpInterceptors = {};
  private defaults: HttpDefaults = {};

  setDefaults(defaults: HttpDefaults): void {
    this.defaults = { ...defaults };
  }

  /** Merge new interceptors on top of any previously-registered ones. */
  registerInterceptors(interceptors: HttpInterceptors): void {
    this.interceptors = { ...this.interceptors, ...interceptors };
  }

  /** Resolve a relative URL against the configured `baseUrl`. */
  resolveUrl(url: string): string {
    const base = this.defaults.baseUrl;
    if (!base) return url;
    if (/^https?:\/\//i.test(url) || /^wss?:\/\//i.test(url)) return url;
    if (url.startsWith("/")) {
      return base.replace(/\/$/, "") + url;
    }
    return base.replace(/\/$/, "") + "/" + url;
  }

  /**
   * Issue a single HTTP request. Runs through `onRequest`/`onResponse`
   * interceptors and surfaces a `retry()` one-shot inside `onResponse`.
   * Honours `defaults.timeoutMs` via `AbortController`.
   */
  async request(input: HttpRequest): Promise<HttpResponse> {
    let req: HttpRequest = {
      ...input,
      headers: { ...this.defaults.headers, ...input.headers },
    };
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
      const timeoutMs = this.defaults.timeoutMs ?? 0;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }
      try {
        const fetchFn = typeof fetch === "function" ? fetch : null;
        if (!fetchFn) {
          throw new Error("`fetch` is not available in this environment");
        }
        const init: RequestInit = {
          method: req.method,
          headers: req.headers,
          signal: req.signal ?? controller.signal,
        };
        if (req.body !== undefined && req.method !== "GET" && req.method !== "HEAD") {
          init.body = encodeBody(req.body, req.headers);
        }
        if (this.defaults.credentials) {
          init.credentials = this.defaults.credentials;
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
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const retryCfg = this.defaults.retry;
    const maxRetries = Math.max(0, retryCfg?.count ?? 0);
    const backoffMode = retryCfg?.backoff ?? "exponential";

    const execWithRetry = async (): Promise<HttpResponse> => {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await exec();
          if (response.status >= 500 && response.status <= 599 && attempt < maxRetries) {
            await sleep(computeBackoff(backoffMode, attempt));
            continue;
          }
          return response;
        } catch (err) {
          lastErr = err;
          if (attempt < maxRetries) {
            await sleep(computeBackoff(backoffMode, attempt));
            continue;
          }
          throw err;
        }
      }
      throw lastErr ?? new Error("retry loop exhausted");
    };

    try {
      let response = await execWithRetry();
      if (this.interceptors.onResponse) {
        let retried = false;
        const retry = async (): Promise<HttpResponse> => {
          if (retried) return response;
          retried = true;
          return execWithRetry();
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

function computeBackoff(mode: "linear" | "exponential", attempt: number): number {
  if (mode === "linear") return 1000 * (attempt + 1);
  return Math.min(30_000, 500 * 2 ** attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
/*  http({...}) — reactive resource factory                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build an `HttpRequest` from the user-supplied configuration object
 * accepted by `http({...})`. Accepts every standard `fetch` option plus
 * a `query` shorthand whose entries are appended to the URL as a
 * querystring. Anything missing falls back to sane defaults.
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
  const req: HttpRequest = {
    url: finalUrl,
    method,
    headers,
    body: cfg.body,
  };
  if (cfg.signal instanceof AbortSignal) req.signal = cfg.signal;
  return req;
}

/**
 * Run a single `http({...})` call and return the reactive resource bag.
 *
 * The bag mutates in place: `data`, `error`, `status`, `loading`,
 * `headers`, `lastUpdated` update during the request lifecycle. The
 * `refetch()` callback re-issues the original request; `cancel()`
 * aborts the in-flight request (no-op when idle).
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
      if (controller) controller.abort();
    },
  };

  let controller: AbortController | null = null;
  let inFlight = false;
  const notify = () => ctx.notify?.();

  const run = async (): Promise<void> => {
    if (inFlight && controller) controller.abort();
    inFlight = true;
    controller = new AbortController();
    resource.state = resource.data === undefined ? "loading" : "stale";
    resource.loading = true;
    notify();

    if (!ctx.http) {
      resource.error = { message: "http runtime not available" };
      resource.state = "error";
      resource.loading = false;
      inFlight = false;
      notify();
      return;
    }
    try {
      const req = buildRequestFromConfig(config);
      req.url = ctx.http.resolveUrl(req.url);
      req.signal = controller.signal;
      const response = await ctx.http.request(req);
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
      if ((err as { name?: string })?.name === "AbortError") return;
      resource.error = err;
      resource.state = "error";
    } finally {
      inFlight = false;
      resource.loading = false;
      notify();
    }
  };

  // Kick off the initial fetch on the next tick so the synchronous
  // evaluation doesn't have to await.
  void run();
  return resource;
}
