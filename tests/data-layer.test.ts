/**
 * Data layer — `$query({...})` (cached + deduplicated reads) and
 * `$mutation({...})` (deferred-fire writes). Both build on the same HTTP
 * runtime as `$http` but address the two gaps it leaves open: repeated reads
 * re-fetching on every call, and the lack of a write that fires on demand.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  HttpRuntime,
  createContext,
  planProgram,
} from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

function buildContext(source: string, http: HttpRuntime) {
  const program = parse(source);
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary, http, notify: () => {} });
  planProgram(program, ctx);
  return { program, ctx, state };
}

const settle = async (turns = 12): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let originalFetch: typeof fetch | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
  fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
  (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  if (originalFetch) (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
});

describe("$query — cached + deduplicated reads", () => {
  it("exposes the same reactive bag shape as $http", async () => {
    const { ctx } = buildContext(
      `$users = $query({ url: "https://api.example.com/users" })\naktion = Stack()`,
      new HttpRuntime(),
    );
    await settle();
    const users = ctx.state.get("users") as { data: unknown; loading: boolean; refetch: unknown };
    expect(users.data).toEqual({ ok: true });
    expect(users.loading).toBe(false);
    expect(typeof users.refetch).toBe("function");
  });

  it("deduplicates two queries with the same derived key into one request", async () => {
    const { ctx } = buildContext(
      `
$a = $query({ url: "https://api.example.com/shared" })
$b = $query({ url: "https://api.example.com/shared" })
aktion = Stack()
      `,
      new HttpRuntime(),
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ctx.state.get("a")).toBe(ctx.state.get("b"));
  });

  it("issues separate requests for different urls / keys", async () => {
    buildContext(
      `
$a = $query({ url: "https://api.example.com/one" })
$b = $query({ url: "https://api.example.com/two" })
aktion = Stack()
      `,
      new HttpRuntime(),
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not forward `key` / `ttl` to fetch as request options", async () => {
    buildContext(
      `$users = $query({ url: "https://api.example.com/users", key: "users", ttl: 1000 })\naktion = Stack()`,
      new HttpRuntime(),
    );
    await settle();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & Record<string, unknown>];
    expect(url).toBe("https://api.example.com/users");
    expect(init).not.toHaveProperty("key");
    expect(init).not.toHaveProperty("ttl");
  });
});

describe("$mutation — deferred-fire writes", () => {
  it("does not fire on creation, only when mutate() is called", async () => {
    const { ctx } = buildContext(
      `$save = $mutation({ url: "https://api.example.com/todos" })\naktion = Stack()`,
      new HttpRuntime(),
    );
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    const save = ctx.state.get("save") as {
      mutate: (o?: unknown) => Promise<unknown>;
      data: unknown;
      loading: boolean;
    };
    await save.mutate({ body: { title: "Buy milk" } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(save.data).toEqual({ ok: true });
    expect(save.loading).toBe(false);
  });

  it("defaults the method to POST and merges mutate() overrides", async () => {
    const { ctx } = buildContext(
      `$save = $mutation({ url: "https://api.example.com/todos" })\naktion = Stack()`,
      new HttpRuntime(),
    );
    const save = ctx.state.get("save") as { mutate: (o?: unknown) => Promise<unknown> };
    await save.mutate({ body: { title: "x" } });
    await settle();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/todos");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("surfaces a non-2xx response as error and clears loading", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({ message: "nope" }, 422));
    const { ctx } = buildContext(
      `$save = $mutation({ url: "https://api.example.com/todos" })\naktion = Stack()`,
      new HttpRuntime(),
    );
    const save = ctx.state.get("save") as {
      mutate: (o?: unknown) => Promise<unknown>;
      error: { status?: number };
      loading: boolean;
    };
    await save.mutate({ body: {} });
    await settle();
    expect(save.error?.status).toBe(422);
    expect(save.loading).toBe(false);
  });

  it("reset() returns the bag to its resting state", async () => {
    const { ctx } = buildContext(
      `$save = $mutation({ url: "https://api.example.com/todos" })\naktion = Stack()`,
      new HttpRuntime(),
    );
    const save = ctx.state.get("save") as {
      mutate: (o?: unknown) => Promise<unknown>;
      reset: () => void;
      data: unknown;
    };
    await save.mutate({ body: {} });
    await settle();
    expect(save.data).toEqual({ ok: true });
    save.reset();
    expect(save.data).toBeUndefined();
  });
});
