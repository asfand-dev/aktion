/**
 * Aktion DevTools — request export: cURL, fetch, and HAR.
 *
 * "Copy as cURL" is how a front-end bug becomes a back-end ticket; a HAR file is
 * how a whole session's traffic gets attached to one. Both are built from the
 * panel's merged request rows, which carry the headers as sent (after
 * interceptors) and the bodies as previews.
 */

import type { NetworkRequest } from "../model.js";
import { jsLiteral, jsString } from "../codegen.js";

/** Quote for a POSIX shell: single quotes, with embedded ones escaped. */
export function shellQuote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A copy-pasteable cURL command, one flag (with its value) per continued line. */
export function toCurl(request: Pick<NetworkRequest, "method" | "url" | "requestHeaders" | "requestBody">): string {
  const lines = [`curl ${shellQuote(request.url)}`];
  const method = request.method.toUpperCase();
  if (method !== "GET" || request.requestBody) lines.push(`-X ${method}`);
  for (const [name, value] of Object.entries(request.requestHeaders ?? {})) {
    lines.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  }
  if (request.requestBody) lines.push(`--data-raw ${shellQuote(request.requestBody)}`);
  return lines.join(" \\\n  ");
}

export function toFetch(request: Pick<NetworkRequest, "method" | "url" | "requestHeaders" | "requestBody">): string {
  const init: Record<string, unknown> = { method: request.method.toUpperCase() };
  const headers = request.requestHeaders ?? {};
  if (Object.keys(headers).length > 0) init.headers = headers;
  if (request.requestBody) init.body = request.requestBody;
  return `await fetch(${jsString(request.url)}, ${jsLiteral(init, 2)});`;
}

interface HarNameValue {
  name: string;
  value: string;
}

function pairs(record: Record<string, string> | undefined): HarNameValue[] {
  return Object.entries(record ?? {}).map(([name, value]) => ({ name, value }));
}

function queryPairs(url: string): HarNameValue[] {
  try {
    return [...new URL(url, "http://localhost").searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function header(record: Record<string, string> | undefined, name: string): string | undefined {
  const key = Object.keys(record ?? {}).find((k) => k.toLowerCase() === name);
  return key ? record![key] : undefined;
}

/**
 * A HAR 1.2 document. `epochOffset` converts the model's monotonic clock
 * (`performance.now()`) into wall-clock time for `startedDateTime`.
 */
export function toHar(requests: ReadonlyArray<NetworkRequest>, options: { epochOffset: number; creator?: string; version?: string; pageTitle?: string }): string {
  const started = requests.length > 0 ? Math.min(...requests.map((r) => r.startTime)) : 0;
  const pageId = "page_1";
  const doc = {
    log: {
      version: "1.2",
      creator: { name: options.creator ?? "Aktion DevTools", version: options.version ?? "3" },
      pages: [{
        startedDateTime: new Date(options.epochOffset + started).toISOString(),
        id: pageId,
        title: options.pageTitle ?? (typeof document !== "undefined" ? document.title : ""),
        pageTimings: {},
      }],
      entries: requests.map((request) => {
        const duration = Math.max(0, request.duration ?? 0);
        const contentType = header(request.responseHeaders, "content-type") ?? "";
        return {
          pageref: pageId,
          startedDateTime: new Date(options.epochOffset + request.startTime).toISOString(),
          time: duration,
          request: {
            method: request.method.toUpperCase(),
            url: request.url,
            httpVersion: "HTTP/1.1",
            headers: pairs(request.requestHeaders),
            queryString: queryPairs(request.url),
            cookies: [],
            headersSize: -1,
            bodySize: request.requestBody ? request.requestBody.length : 0,
            ...(request.requestBody
              ? { postData: { mimeType: header(request.requestHeaders, "content-type") ?? "application/json", text: request.requestBody } }
              : {}),
          },
          response: {
            status: request.status ?? 0,
            statusText: request.phase === "error" || request.phase === "blocked" ? (request.error ?? "failed") : "",
            httpVersion: "HTTP/1.1",
            headers: pairs(request.responseHeaders),
            cookies: [],
            content: { size: request.responseSize ?? 0, mimeType: contentType, text: request.responseBody ?? "" },
            redirectURL: "",
            headersSize: -1,
            bodySize: request.responseSize ?? -1,
            ...(request.error ? { _error: request.error } : {}),
          },
          cache: {},
          timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 0, wait: duration, receive: 0 },
          ...(request.rule ? { _aktionRule: request.rule } : {}),
          ...(request.phase === "mock" ? { _aktionMocked: true } : {}),
        };
      }),
    },
  };
  return JSON.stringify(doc, null, 2);
}
