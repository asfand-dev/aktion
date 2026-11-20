import { EvaluationContext } from './evaluator.js';
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
/**
 * `$socket({ url, protocols?, bufferSize?, onMessage?, reconnect? })` — a
 * reactive WebSocket. Reads of `.status` / `.last` / `.messages` re-render on
 * change. `reconnect: true` retries dropped connections with exponential
 * backoff (a number caps the attempts); `close()` always stops for good.
 */
export declare function createSocketResource(config: unknown, ctx: EvaluationContext): SocketResource;
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
export declare function createSseResource(config: unknown, ctx: EvaluationContext): SseResource;
