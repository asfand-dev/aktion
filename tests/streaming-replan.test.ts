/**
 * Ending a stream, and streaming without the `streaming` attribute.
 *
 * Strict parsing rejects a string or template literal that is still open at the
 * end of the text, so `<aktion-app>` parses leniently while text arrives
 * (`streaming` attribute, or anything fed through `appendChunk`) and parses the
 * finished text again only when that could report something new. A re-plan
 * resets effects and refires top-level `$http` requests, so it must not happen
 * for a stream that ended with nothing open.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { linkProgram } from "../src/compiler/linker.js";
import { defineCompiledProgram } from "../src/compiler/runtime.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (turns = 6) => {
  for (let i = 0; i < turns; i += 1) {
    await flush();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

type App = HTMLElement & {
  setResponse(text: string): void;
  appendChunk(text: string): void;
  mountCompiled(compiled: unknown): void;
  streaming: boolean;
  showErrors: boolean;
  state: { get(name: string): unknown };
};

const PROGRAM = [
  '$orders = $http({ url: "https://api.example.com/orders", method: "GET" })',
  '$sent = $http({ url: "https://api.example.com/send", method: "POST", body: { id: 1 } })',
  "$mounts = 0",
  '$effect(() => { $mounts += 1 }, ["mount"])',
  'aktion = Text("ready")',
].join("\n");

describe("ending a stream", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  const create = (): App => {
    const el = document.createElement("aktion-app") as App;
    document.body.appendChild(el);
    return el;
  };
  const requests = (method: string) =>
    fetchMock.mock.calls.filter(([, init]) => ((init as RequestInit | undefined)?.method ?? "GET") === method).length;

  it("fires the program's requests and mount effect exactly once", async () => {
    const el = create();
    el.setResponse(PROGRAM);
    await settle();
    expect([requests("GET"), requests("POST"), el.state.get("mounts")]).toEqual([1, 1, 1]);
  });

  it("does not re-plan when a streamed program finishes with nothing open", async () => {
    const el = create();
    el.streaming = true;
    el.setResponse(PROGRAM);
    await settle();
    const before = [requests("GET"), requests("POST"), el.state.get("mounts")];
    expect(before).toEqual([1, 1, 1]);

    el.streaming = false;
    await settle();
    expect([requests("GET"), requests("POST"), el.state.get("mounts")]).toEqual(before);
  });

  it("does not re-plan when the program arrived through appendChunk", async () => {
    const el = create();
    el.streaming = true;
    for (let i = 0; i < PROGRAM.length; i += 11) el.appendChunk(PROGRAM.slice(i, i + 11));
    await settle();
    const before = [requests("GET"), requests("POST")];
    const mounts = el.state.get("mounts");

    el.streaming = false;
    await settle();
    expect([requests("GET"), requests("POST")]).toEqual(before);
    expect(el.state.get("mounts")).toBe(mounts);
  });

  it("does not re-plan when the finished text is handed back to setResponse", async () => {
    const el = create();
    for (let i = 0; i < PROGRAM.length; i += 11) el.appendChunk(PROGRAM.slice(i, i + 11));
    await settle();
    el.setResponse(PROGRAM);
    await settle();
    expect([requests("GET"), requests("POST"), el.state.get("mounts")]).toEqual([1, 1, 1]);
  });

  it("does not re-plan when `streaming` is switched off on an element that never streamed", async () => {
    const el = create();
    el.setResponse(PROGRAM);
    await settle();
    el.setAttribute("streaming", "false");
    el.removeAttribute("streaming");
    await settle();
    expect([requests("GET"), requests("POST"), el.state.get("mounts")]).toEqual([1, 1, 1]);
  });

  it("does not re-plan a mounted compiled program when `streaming` toggles", async () => {
    const { program } = linkProgram(PROGRAM, "/app.aktion", {
      resolve: () => null,
      load: () => {
        throw new Error("no imports expected");
      },
    });
    const el = create();
    el.mountCompiled(defineCompiledProgram({ __aktionCompiled: 1, program, source: PROGRAM, path: "/app.aktion" }));
    await settle();
    expect([requests("GET"), requests("POST"), el.state.get("mounts")]).toEqual([1, 1, 1]);

    el.streaming = true;
    await settle();
    el.streaming = false;
    await settle();
    expect([requests("GET"), requests("POST"), el.state.get("mounts")]).toEqual([1, 1, 1]);
  });

  it("does re-plan, once, when the finished text ends inside a literal that never closed", async () => {
    const el = create();
    el.showErrors = true;
    el.streaming = true;
    el.setResponse(`aktion = Text(msg)\nmsg = "never closed`);
    await settle();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);
    expect(el.shadowRoot!.textContent).toContain("never closed");

    el.streaming = false;
    await settle();
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("Unterminated string literal");
  });
});

describe("appendChunk without the `streaming` attribute", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const create = (): App => {
    const el = document.createElement("aktion-app") as App;
    document.body.appendChild(el);
    return el;
  };
  const visibleText = (el: HTMLElement) => {
    const clone = el.shadowRoot!.cloneNode(true) as ShadowRoot;
    clone.querySelectorAll("style").forEach((node) => node.remove());
    return clone.textContent ?? "";
  };

  const BODY = "The quick brown fox jumps over the lazy dog, again and again, until the stream is done.";

  it("renders a string as it arrives, one frame per chunk, with no error events", async () => {
    const el = create();
    const errorEvents: Event[] = [];
    el.addEventListener("error", (event) => errorEvents.push(event));
    el.setResponse("aktion = Text(msg)\nmsg = ");
    await settle(3);
    errorEvents.length = 0;

    const chunks: string[] = [];
    const text = `"${BODY}"`;
    for (let i = 0; i < text.length; i += 9) chunks.push(text.slice(i, i + 9));
    const frames = new Set<string>();
    for (const chunk of chunks) {
      el.appendChunk(chunk);
      await settle(3);
      frames.add(visibleText(el));
    }

    expect(errorEvents).toHaveLength(0);
    expect(frames.size).toBe(chunks.length);
    expect(visibleText(el)).toContain(BODY);
  });

  it("renders a template literal as it arrives", async () => {
    const el = create();
    el.setResponse("aktion = Text(msg)\n");
    el.appendChunk("msg = `first line\nsecond ");
    await settle(3);
    expect(visibleText(el)).toContain("second");
    el.appendChunk("line");
    await settle(3);
    expect(visibleText(el)).toContain("second line");
  });

  it("setResponse is strict again, so a literal left open is reported", async () => {
    const el = create();
    el.appendChunk('aktion = Text(msg)\nmsg = "abc');
    await settle(3);
    expect(visibleText(el)).toContain("abc");

    const errorEvents: Event[] = [];
    el.addEventListener("error", (event) => errorEvents.push(event));
    el.setResponse('aktion = Text(msg)\nmsg = "abc');
    await settle(3);
    expect(errorEvents.length).toBeGreaterThan(0);
  });
});
