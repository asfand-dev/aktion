/**
 * Realtime resources (suggestions-global VI.3) — `$socket({...})` (WebSocket)
 * and `$sse({...})` (Server-Sent Events). Both return a reactive bag whose
 * fields mutate in place as messages arrive; the runtime `notify()`s so the
 * next render observes them. Connections are torn down via `ctx.disposers`
 * on replan / disconnect, so a program never leaks a live socket.
 */

import type { EvaluationContext } from "./evaluator.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Try to JSON-parse a string payload, falling back to the raw string. */
function parseMaybeJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export type SocketStatus = "connecting" | "open" | "closed";

export interface SocketResource {
  /** Convenience boolean — true while `status === "open"`. */
  connected: boolean;
  /** Connection lifecycle: "connecting" | "open" | "closed" (spec VI.3). */
  status: SocketStatus;
  /** Most recent messages (capped to `bufferSize`, newest last). */
  messages: unknown[];
  /** The latest message (or null before the first arrives). */
  last: unknown;
  error: unknown;
  /** Reconnect attempts made so far (resets on a successful open). */
  attempts: number;
  /**
   * Send a message; objects are JSON-stringified. While the socket is still
   * connecting (or briefly reconnecting), messages queue (bounded) and flush
   * on open; once closed for good they are dropped.
   */
  send: (data: unknown) => void;
  /** Close the connection (disables auto-reconnect). */
  close: () => void;
}

const SEND_QUEUE_LIMIT = 100;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15_000;

/**
 * `$socket({ url, protocols?, bufferSize?, onMessage?, reconnect? })` — a
 * reactive WebSocket. Reads of `.status` / `.last` / `.messages` re-render on
 * change. `reconnect: true` retries dropped connections with exponential
 * backoff (a number caps the attempts); `close()` always stops for good.
 */
export function createSocketResource(config: unknown, ctx: EvaluationContext): SocketResource {
  const cfg = asRecord(config);
  const url = typeof cfg.url === "string" ? cfg.url : "";
  const bufferSize = typeof cfg.bufferSize === "number" && cfg.bufferSize > 0 ? Math.floor(cfg.bufferSize) : 50;
  const onMessage = typeof cfg.onMessage === "function" ? (cfg.onMessage as (m: unknown) => void) : null;
  const maxAttempts = cfg.reconnect === true ? Infinity
    : typeof cfg.reconnect === "number" && cfg.reconnect > 0 ? Math.floor(cfg.reconnect)
    : 0;
  const notify = (): void => ctx.notify?.();

  const resource: SocketResource = {
    connected: false,
    status: "closed",
    messages: [],
    last: null,
    error: undefined,
    attempts: 0,
    send: () => { /* replaced once the socket opens */ },
    close: () => { /* replaced once the socket opens */ },
  };
  const setStatus = (status: SocketStatus): void => {
    if (resource.status === status) return;
    resource.status = status;
    resource.connected = status === "open";
    notify();
  };

  if (!url || typeof WebSocket === "undefined") {
    resource.error = { message: "WebSocket not available" };
    return resource;
  }

  let live: WebSocket | null = null;
  let closedByUser = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const sendQueue: string[] = [];

  const flushQueue = (): void => {
    while (sendQueue.length > 0 && live && live.readyState === WebSocket.OPEN) {
      live.send(sendQueue.shift()!);
    }
  };

  const scheduleReconnect = (): void => {
    if (closedByUser || resource.attempts >= maxAttempts) { setStatus("closed"); return; }
    resource.attempts += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (resource.attempts - 1));
    setStatus("connecting");
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  };

  const connect = (): void => {
    let socket: WebSocket;
    try {
      socket = cfg.protocols != null
        ? new WebSocket(url, cfg.protocols as string | string[])
        : new WebSocket(url);
    } catch (err) {
      resource.error = err;
      setStatus("closed");
      return;
    }
    live = socket;
    setStatus("connecting");

    socket.addEventListener("open", () => {
      if (live !== socket) return;
      resource.error = undefined;
      resource.attempts = 0;
      setStatus("open");
      flushQueue();
    });
    socket.addEventListener("close", () => {
      if (live !== socket) return;
      if (!closedByUser && maxAttempts > 0) scheduleReconnect();
      else setStatus("closed");
    });
    socket.addEventListener("error", (ev) => {
      if (live !== socket) return;
      resource.error = ev;
      notify();
    });
    socket.addEventListener("message", (ev: MessageEvent) => {
      if (live !== socket) return;
      const msg = parseMaybeJson(ev.data);
      resource.last = msg;
      resource.messages = [...resource.messages, msg].slice(-bufferSize);
      if (onMessage) { try { onMessage(msg); } catch { /* ignore */ } }
      notify();
    });
  };

  resource.send = (data: unknown): void => {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    if (live && live.readyState === WebSocket.OPEN) { live.send(payload); return; }
    // Queue while (re)connecting so early sends are not silently lost.
    if (resource.status === "connecting" && sendQueue.length < SEND_QUEUE_LIMIT) sendQueue.push(payload);
  };
  resource.close = (): void => {
    closedByUser = true;
    if (reconnectTimer != null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    sendQueue.length = 0;
    try { live?.close(); } catch { /* already closing */ }
    setStatus("closed");
  };

  connect();

  ctx.disposers.push(() => {
    closedByUser = true;
    if (reconnectTimer != null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    try { live?.close(); } catch { /* noop */ }
  });
  return resource;
}

export interface SseResource {
  connected: boolean;
  /** Connection lifecycle: "connecting" | "open" | "closed". */
  status: SocketStatus;
  messages: unknown[];
  last: unknown;
  error: unknown;
  close: () => void;
}

/**
 * `$sse({ url, withCredentials?, bufferSize?, event?, onMessage? })` — a
 * reactive Server-Sent Events stream. `event` names a custom event type to
 * listen for (defaults to the unnamed `message` stream). EventSource
 * reconnects natively; `status` reads "connecting" while it does.
 */
export function createSseResource(config: unknown, ctx: EvaluationContext): SseResource {
  const cfg = asRecord(config);
  const url = typeof cfg.url === "string" ? cfg.url : "";
  const bufferSize = typeof cfg.bufferSize === "number" && cfg.bufferSize > 0 ? Math.floor(cfg.bufferSize) : 50;
  const eventName = typeof cfg.event === "string" && cfg.event ? cfg.event : "message";
  const onMessage = typeof cfg.onMessage === "function" ? (cfg.onMessage as (m: unknown) => void) : null;
  const notify = (): void => ctx.notify?.();

  const resource: SseResource = {
    connected: false,
    status: "closed",
    messages: [],
    last: null,
    error: undefined,
    close: () => { /* replaced once the stream opens */ },
  };

  if (!url || typeof EventSource === "undefined") {
    resource.error = { message: "EventSource not available" };
    return resource;
  }

  let source: EventSource | null = null;
  try {
    source = new EventSource(url, { withCredentials: cfg.withCredentials === true });
  } catch (err) {
    resource.error = err;
    return resource;
  }
  const live = source;
  resource.status = "connecting";
  resource.close = (): void => {
    try { live.close(); } catch { /* noop */ }
    resource.connected = false;
    resource.status = "closed";
    notify();
  };

  live.addEventListener("open", () => { resource.connected = true; resource.status = "open"; resource.error = undefined; notify(); });
  live.addEventListener("error", (ev) => {
    resource.error = ev;
    resource.connected = false;
    // EventSource retries on its own unless it is permanently CLOSED (the
    // spec constant 2 — read as a literal so partial test doubles compare
    // sanely).
    resource.status = live.readyState === 2 ? "closed" : "connecting";
    notify();
  });
  live.addEventListener(eventName, (ev) => {
    const msg = parseMaybeJson((ev as MessageEvent).data);
    resource.last = msg;
    resource.messages = [...resource.messages, msg].slice(-bufferSize);
    if (onMessage) { try { onMessage(msg); } catch { /* ignore */ } }
    notify();
  });

  ctx.disposers.push(() => { try { live.close(); } catch { /* noop */ } });
  return resource;
}
