/**
 * Realtime resources — `$socket` (WebSocket) and `$sse` (EventSource), VI.3.
 * Both globals are mocked so the reactive bag's lifecycle can be asserted
 * without a real server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "../src/parser/index.js";
import { StateStore, createContext, planProgram } from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

function buildContext(source: string) {
  const program = parse(source);
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary, notify: () => {} });
  planProgram(program, ctx);
  return { ctx, state };
}
const settle = async (turns = 6): Promise<void> => { for (let i = 0; i < turns; i += 1) await Promise.resolve(); };

// ── Mock WebSocket ──────────────────────────────────────────────────────
class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  send(data: unknown): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.emit("close", {}); }
  emit(type: string, ev: unknown): void { for (const cb of this.listeners[type] ?? []) cb(ev); }
  open(): void { this.readyState = 1; this.emit("open", {}); }
  message(data: unknown): void { this.emit("message", { data }); }
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};
  constructor(public url: string) { MockEventSource.instances.push(this); }
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  close(): void { /* noop */ }
  emit(type: string, ev: unknown): void { for (const cb of this.listeners[type] ?? []) cb(ev); }
  open(): void { this.emit("open", {}); }
  message(data: unknown): void { this.emit("message", { data }); }
}

describe("$socket (VI.3)", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("connects, receives JSON messages, and sends", async () => {
    const { ctx } = buildContext(
      `$chat = $socket({ url: "wss://example.com/ws" })\naktion = Stack()`,
    );
    await settle();
    const sock = () => ctx.state.get("chat") as {
      connected: boolean; last: unknown; messages: unknown[]; send: (d: unknown) => void;
    };
    expect(sock().connected).toBe(false);
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    expect(sock().connected).toBe(true);

    ws.message(JSON.stringify({ text: "hi" }));
    expect(sock().last).toEqual({ text: "hi" });
    expect(sock().messages).toHaveLength(1);

    sock().send({ text: "yo" });
    expect(ws.sent[0]).toBe(JSON.stringify({ text: "yo" }));
  });

  it("keeps raw strings when the payload isn't JSON", async () => {
    const { ctx } = buildContext(`$chat = $socket({ url: "wss://x" })\naktion = Stack()`);
    await settle();
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    ws.message("ping");
    expect((ctx.state.get("chat") as { last: unknown }).last).toBe("ping");
  });
});

describe("$sse (VI.3)", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("connects and accumulates messages", async () => {
    const { ctx } = buildContext(`$feed = $sse({ url: "https://example.com/stream" })\naktion = Stack()`);
    await settle();
    const feed = () => ctx.state.get("feed") as { connected: boolean; last: unknown; messages: unknown[] };
    const es = MockEventSource.instances[0]!;
    es.open();
    expect(feed().connected).toBe(true);
    es.message(JSON.stringify({ n: 1 }));
    es.message(JSON.stringify({ n: 2 }));
    expect(feed().messages).toHaveLength(2);
    expect(feed().last).toEqual({ n: 2 });
  });
});
