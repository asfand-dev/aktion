/**
 * Aktion — core runtime regression tests.
 *
 * Exercises the evaluator, data builtins, state store, trailing-object merging,
 * `for...of` loop scoping, and HTTP-native `http({...})` resources.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  HttpRuntime,
  createContext,
  planProgram,
  evaluate,
} from "../src/runtime/index.js";
import { dataBuiltins } from "../src/runtime/builtins.js";
import { defaultLibrary } from "../src/library/index.js";

function buildContext(source: string, opts: { http?: HttpRuntime } = {}) {
  const program = parse(source);
  const state = new StateStore();
  const http = opts.http;
  const ctx = createContext(state, {
    library: defaultLibrary,
    http,
    notify: () => {},
  });
  planProgram(program, ctx);
  return { program, ctx, state, http };
}

describe("evaluator", () => {
  it("evaluates a simple component reference graph", () => {
    const { ctx, program } = buildContext(`
aktion = Stack([card])
card = Card([CardHeader("Hi", "There")])
`);
    expect(program.errors).toEqual([]);
    const app = ctx.bindings.get("aktion")?.();
    expect(app).toMatchObject({ name: "Stack" });
  });

  it("evaluates state defaults", () => {
    const { state } = buildContext(`$days = "7"`);
    expect(state.get("days")).toBe("7");
  });

  it("supports state changes and reactivity", () => {
    const { state } = buildContext(`$count = 0`);
    let observed = 0;
    state.subscribe((changed) => {
      if (changed.has("count")) observed += 1;
    });
    state.set("count", 1);
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(observed).toBe(1);
        resolve();
      });
    });
  });
});

describe("data builtins", () => {
  it("counts, sums, and averages", () => {
    expect(dataBuiltins.Count!([[1, 2, 3]])).toBe(3);
    expect(dataBuiltins.Sum!([[1, 2, 3]])).toBe(6);
    expect(dataBuiltins.Avg!([[2, 4, 6]])).toBe(4);
  });

  it("filters arrays of objects", () => {
    const rows = [{ name: "alpha" }, { name: "beta" }, { name: "alphabet" }];
    expect(dataBuiltins.Filter!([rows, "name", "contains", "alpha"])).toEqual([
      { name: "alpha" },
      { name: "alphabet" },
    ]);
  });

  it("sorts ascending and descending", () => {
    const rows = [{ x: 3 }, { x: 1 }, { x: 2 }];
    expect(dataBuiltins.Sort!([rows, "x", "asc"])).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
    expect(dataBuiltins.Sort!([rows, "x", "desc"])).toEqual([{ x: 3 }, { x: 2 }, { x: 1 }]);
  });

  it("@Join concatenates array values", () => {
    expect(dataBuiltins.Join!([[1, 2, 3]])).toBe("1,2,3");
    expect(dataBuiltins.Join!([["a", "b"], "-"])).toBe("a-b");
  });

  it("@Format accepts an options object", () => {
    const usd = dataBuiltins.Format!([1234.5, "currency", { currency: "USD", locale: "en-US" }]);
    expect(String(usd)).toContain("$");
    expect(String(usd)).toMatch(/1,234/);
    const eur = dataBuiltins.Format!([1234.5, "currency", { currency: "EUR", locale: "en-US" }]);
    expect(String(eur)).toContain("€");
    const pct = dataBuiltins.Format!([0.42, "percent", { decimals: 1 }]);
    expect(String(pct)).toBe("42.0%");
    const compact = dataBuiltins.Format!([1_500_000, "compact", { locale: "en-US" }]);
    expect(String(compact)).toMatch(/1\.5M/);
  });

  it("@Format keeps the legacy positional shape working", () => {
    const legacy = dataBuiltins.Format!([1000, "currency", "EUR", "en-US"]);
    expect(String(legacy)).toContain("€");
    const number = dataBuiltins.Format!([1000, "number", "en-US"]);
    expect(String(number)).toBe("1,000");
  });
});

describe("array member shortcuts", () => {
  it("$arr.length returns the length (not array pluck)", () => {
    const { ctx } = buildContext(`$todos = [{id:1}, {id:2}, {id:3}]\nn = $todos.length`);
    const program = parse(`n = $todos.length`);
    const stmt = program.statements[0]!;
    if (stmt.kind !== "Assignment") throw new Error("expected assignment");
    expect(evaluate(stmt.expression, ctx)).toBe(3);
  });

  it("$arr.first / $arr.last return the boundary elements", () => {
    const { ctx } = buildContext(`$rows = [{x:1}, {x:2}, {x:3}]\nfirst = $rows.first\nlast = $rows.last`);
    const firstStmt = parse(`first = $rows.first`).statements[0]!;
    const lastStmt = parse(`last = $rows.last`).statements[0]!;
    if (firstStmt.kind !== "Assignment" || lastStmt.kind !== "Assignment") {
      throw new Error("expected assignments");
    }
    expect(evaluate(firstStmt.expression, ctx)).toEqual({ x: 1 });
    expect(evaluate(lastStmt.expression, ctx)).toEqual({ x: 3 });
  });

  it("array pluck still works for non-shortcut fields", () => {
    const { ctx } = buildContext(`$rows = [{title:"a"}, {title:"b"}]\ntitles = $rows.title`);
    const program = parse(`titles = $rows.title`);
    const stmt = program.statements[0]!;
    if (stmt.kind !== "Assignment") throw new Error("expected assignment");
    expect(evaluate(stmt.expression, ctx)).toEqual(["a", "b"]);
  });

  it("string.length returns the character count", () => {
    const { ctx } = buildContext(`$msg = "hello"\nn = $msg.length`);
    const program = parse(`n = $msg.length`);
    const stmt = program.statements[0]!;
    if (stmt.kind !== "Assignment") throw new Error("expected assignment");
    expect(evaluate(stmt.expression, ctx)).toBe(5);
  });

  it("empty array .first and .last are null", () => {
    const { ctx } = buildContext(`$rows = []\nfirst = $rows.first\nlast = $rows.last`);
    const firstStmt = parse(`first = $rows.first`).statements[0]!;
    const lastStmt = parse(`last = $rows.last`).statements[0]!;
    if (firstStmt.kind !== "Assignment" || lastStmt.kind !== "Assignment") {
      throw new Error("expected assignments");
    }
    expect(evaluate(firstStmt.expression, ctx)).toBeNull();
    expect(evaluate(lastStmt.expression, ctx)).toBeNull();
  });
});

describe("expression evaluation", () => {
  it("string concatenation and ternary", () => {
    const { ctx } = buildContext(`$days = 7\nlabel = "" + $days + " days"`);
    const program = parse(`label = "" + $days + " days"`);
    const stmt = program.statements[0]!;
    if (stmt.kind !== "Assignment") throw new Error("expected assignment");
    const value = evaluate(stmt.expression, ctx);
    expect(value).toBe("7 days");
  });

  it("lazy ternary only evaluates the taken branch", () => {
    const { ctx } = buildContext(
      'taken = true ? "yes" : undefinedReference\n' +
      'skipped = false ? undefinedReference : "no"',
    );
    expect(ctx.bindings.get("taken")?.()).toBe("yes");
    expect(ctx.bindings.get("skipped")?.()).toBe("no");
  });
});

describe("bracket member access", () => {
  it("indexes arrays with numeric and negative indices", () => {
    const { ctx } = buildContext(`$rows = ["a", "b", "c"]\nfirst = $rows[0]\nlast = $rows[-1]`);
    expect(ctx.bindings.get("first")?.()).toBe("a");
    expect(ctx.bindings.get("last")?.()).toBe("c");
  });

  it("reads object keys via bracket notation", () => {
    const { ctx } = buildContext(`$key = "name"\n$user = {name: "Ada"}\nlabel = $user[$key]`);
    expect(ctx.bindings.get("label")?.()).toBe("Ada");
  });

  it("?.[key] optional-chains bracket access", () => {
    const { ctx } = buildContext(
      '$user = null\nmissing = $user?.["name"]\n' +
      '$key = "role"\n$user2 = {role: "Eng"}\nrole = $user2?.[$key]',
    );
    expect(ctx.bindings.get("missing")?.()).toBeUndefined();
    expect(ctx.bindings.get("role")?.()).toBe("Eng");
  });
});

describe("named component arguments", () => {
  it("merges a trailing object literal into the component's named prop slots", () => {
    const { ctx } = buildContext(
      'btn = Button("Hi", {variant: "primary", size: "small"})',
    );
    const node = ctx.bindings.get("btn")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("Button");
    expect(node.args[0]).toBe("Hi");
    expect(node.args[2]).toBe("primary");
    expect(node.args[4]).toBe("small");
  });

  it("merges trailing object keys into the component's prop order", () => {
    const { ctx } = buildContext(
      'btn = Button("Hi", { variant: "primary", size: "small" })',
    );
    const node = ctx.bindings.get("btn")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("Button");
    expect(node.args[0]).toBe("Hi");
    expect(node.args[2]).toBe("primary");
    expect(node.args[4]).toBe("small");
  });

  it("merges trailing object keys with positional props", () => {
    const { ctx } = buildContext(
      'cell = GridItem(Text("Side"), { span: "1/4" })',
    );
    const node = ctx.bindings.get("cell")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("GridItem");
    expect((node.args[0] as { name: string }).name).toBe("Text");
    expect(node.args[1]).toBe("1/4");
  });

  it("merges trailing object after a leading children array", () => {
    const { ctx } = buildContext(
      'layout = Grid([GridItem(Text("A"), { span: "1/4" })], { columns: 12, gap: "l" })',
    );
    const node = ctx.bindings.get("layout")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("Grid");
    expect(node.args[1]).toBe(12);
    expect(node.args[2]).toBe("l");
    expect(Array.isArray(node.args[0])).toBe(true);
  });
});

describe("for...of loop variable scoping", () => {
  it("restores the outer loop binding even when the inner item is undefined", () => {
    const { ctx } = buildContext(
      `$items = [10, 20]\n` +
      `$sub = [null, "x"]\n` +
      `row = $items.map(i => $sub.map(j => j))`,
    );
    const out = ctx.bindings.get("row")?.();
    expect(Array.isArray(out)).toBe(true);
    const flat = (out as unknown[]).flat();
    expect(flat).toEqual([null, "x", null, "x"]);
  });

  it("does not crash when the items source is not an array", () => {
    // Defensive `.map` over a nullable source uses optional chaining to
    // mirror what authors write in the new strict-JS subset.
    const { ctx } = buildContext(`$items = null\nrow = ($items?.map(i => i)) || []`);
    const out = ctx.bindings.get("row")?.();
    expect(out).toEqual([]);
  });
});

describe("Http({...}) reactive resource", () => {
  let originalFetch: typeof fetch | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Flush enough microtasks for an `Http({...})` lifecycle to settle. */
  const settle = async (turns = 12): Promise<void> => {
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  };

  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    }
  });

  it("issues a fetch with the configured url, method, headers and body", async () => {
    const http = new HttpRuntime();
    buildContext(
      `
$id = 5
$response = Http({
  url: "https://api.example.com/items",
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: { id: $id }
})
aktion = Stack()
      `,
      { http },
    );
    await settle();
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/items");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ id: 5 }));
  });

  it("defaults the method to GET when omitted", async () => {
    const http = new HttpRuntime();
    buildContext(
      `$response = Http({ url: "https://api.example.com/todos" })\naktion = Stack()`,
      { http },
    );
    await settle();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("resolves a forward-declared plain binding in the request url (hoisting)", async () => {
    const http = new HttpRuntime();
    buildContext(
      `
$todos = Http({ url: base + "/todos" })
base = "https://api.example.com"
aktion = Stack()
      `,
      { http },
    );
    await settle();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe("https://api.example.com/todos");
  });

  it("exposes the reactive resource bag with data / status / headers / lastUpdated / refetch / cancel", async () => {
    const http = new HttpRuntime();
    const { ctx } = buildContext(
      `
$response = Http({ url: "https://api.example.com/items", method: "GET" })
aktion = Stack()
      `,
      { http },
    );
    await settle();
    const response = ctx.state.get("response") as {
      data: unknown;
      error: unknown;
      loading: boolean;
      status?: number;
      refetch: () => Promise<void>;
      cancel: () => void;
      lastUpdated?: number;
      headers?: Record<string, string>;
    };
    expect(response).toBeDefined();
    expect(response.data).toEqual({ ok: true });
    expect(response.error).toBeUndefined();
    expect(response.loading).toBe(false);
    expect(response.status).toBe(200);
    expect(response.headers?.["content-type"]).toContain("application/json");
    expect(typeof response.lastUpdated).toBe("number");
    expect(typeof response.refetch).toBe("function");
    expect(typeof response.cancel).toBe("function");
  });

  it("encodes a `query` shorthand as querystring params", async () => {
    const http = new HttpRuntime();
    buildContext(
      `
$response = Http({ url: "https://api.example.com/users", method: "GET", query: { limit: 5, slug: "abc" } })
aktion = Stack()
      `,
      { http },
    );
    await settle();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("limit=5");
    expect(url).toContain("slug=abc");
  });

  it("appends query params with `&` when the url already has a querystring", async () => {
    const http = new HttpRuntime();
    buildContext(
      `$response = Http({ url: "https://api.example.com/users?team=core", query: { limit: 5 } })\naktion = Stack()`,
      { http },
    );
    await settle();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe("https://api.example.com/users?team=core&limit=5");
  });

  it("forwards unknown options verbatim as fetch init (`...rest`)", async () => {
    const http = new HttpRuntime();
    buildContext(
      `$response = Http({ url: "https://api.example.com/me", credentials: "include", mode: "cors" })\naktion = Stack()`,
      { http },
    );
    await settle();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(init.mode).toBe("cors");
  });

  it("surfaces non-2xx responses on `.error` and sets state to error", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({ message: "nope" }, 404));
    const http = new HttpRuntime();
    const { ctx } = buildContext(
      `$response = Http({ url: "https://api.example.com/missing" })\naktion = Stack()`,
      { http },
    );
    await settle();
    const response = ctx.state.get("response") as {
      data: unknown;
      error: { status?: number; body?: unknown };
      status?: number;
      state: string;
    };
    expect(response.state).toBe("error");
    expect(response.status).toBe(404);
    expect(response.error).toMatchObject({ status: 404 });
    expect(response.data).toBeUndefined();
  });

  it("treats a 204 No Content response as resolved with null data", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse(null, 204));
    const http = new HttpRuntime();
    const { ctx } = buildContext(
      `$response = Http({ url: "https://api.example.com/todos/1", method: "DELETE" })\naktion = Stack()`,
      { http },
    );
    await settle();
    const response = ctx.state.get("response") as { data: unknown; state: string; status?: number };
    expect(response.status).toBe(204);
    expect(response.state).toBe("data");
    expect(response.data).toBeNull();
  });

  it("re-issues the request when `.refetch()` is called", async () => {
    const http = new HttpRuntime();
    const { ctx } = buildContext(
      `$response = Http({ url: "https://api.example.com/items" })\naktion = Stack()`,
      { http },
    );
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const response = ctx.state.get("response") as { refetch: () => Promise<void> };
    await response.refetch();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("`.cancel()` aborts the in-flight request and clears the loading flag", async () => {
    let abortedSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      abortedSignal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });
    const http = new HttpRuntime();
    const { ctx } = buildContext(
      `$response = Http({ url: "https://api.example.com/slow" })\naktion = Stack()`,
      { http },
    );
    await Promise.resolve();
    const response = ctx.state.get("response") as { loading: boolean; cancel: () => void };
    expect(response.loading).toBe(true);
    response.cancel();
    await settle();
    expect(abortedSignal?.aborted).toBe(true);
    expect(response.loading).toBe(false);
  });

  it("a stale in-flight request cannot clobber a newer refetch result", async () => {
    const deferred: Array<(value: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => { deferred.push(resolve); }),
    );
    const http = new HttpRuntime();
    const { ctx } = buildContext(
      `$response = Http({ url: "https://api.example.com/items" })\naktion = Stack()`,
      { http },
    );
    await Promise.resolve();
    const response = ctx.state.get("response") as { data: unknown; refetch: () => Promise<void> };
    // Start a second request before the first resolves.
    void response.refetch();
    await Promise.resolve();
    expect(deferred.length).toBe(2);
    // Resolve the NEWER request first, then the stale one.
    deferred[1]!(jsonResponse({ which: "new" }));
    await settle();
    deferred[0]!(jsonResponse({ which: "stale" }));
    await settle();
    expect(response.data).toEqual({ which: "new" });
  });
});

describe("StateStore snapshot", () => {
  it("exposes entries() and snapshot()", () => {
    const { state } = buildContext(`$count = 1\n$name = "ada"`);
    expect(state.snapshot()).toEqual({ count: 1, name: "ada" });
    const fromEntries = Object.fromEntries(state.entries());
    expect(fromEntries).toEqual({ count: 1, name: "ada" });
  });
});

describe("StateStore behaviour", () => {
  it("reset() is a no-op for undeclared names", async () => {
    const { state } = buildContext(`$count = 1`);
    let notifications = 0;
    state.subscribe(() => { notifications += 1; });
    state.reset("undeclared");
    await Promise.resolve();
    await Promise.resolve();
    expect(notifications).toBe(0);
    expect(state.has("undeclared")).toBe(false);
  });

  it("reset() restores the default value and notifies once", async () => {
    const { state } = buildContext(`$count = 7`);
    state.set("count", 42);
    await Promise.resolve();
    const changedSets: Set<string>[] = [];
    state.subscribe((changed) => { changedSets.push(new Set(changed)); });
    state.reset("count");
    await Promise.resolve();
    expect(state.get("count")).toBe(7);
    expect(changedSets).toHaveLength(1);
    expect(changedSets[0]!.has("count")).toBe(true);
  });

  it("rebind() drops pending notifications from the previous program", async () => {
    const { state } = buildContext(`$count = 0`);
    let notifications = 0;
    state.subscribe(() => { notifications += 1; });
    state.set("count", 5);
    state.rebind([["other", "hello"]]);
    await Promise.resolve();
    expect(notifications).toBe(0);
    expect(state.get("other")).toBe("hello");
    expect(state.has("count")).toBe(false);
  });

  it("non-literal state initializers are computed against the current store", () => {
    const { state } = buildContext(`$total = @Count($rows)\n$rows = [1, 2]`);
    expect(state.get("total")).toBe(2);
  });
});

describe("lambda expressions", () => {
  it("`name = (args) => expr` declares a callable helper", () => {
    const { ctx } = buildContext(`
      double = (n) => n * 2
      result = double(7)
    `);
    expect(ctx.bindings.get("result")?.()).toBe(14);
  });
});

describe("parser source locations", () => {
  it("attaches loc to Call expressions for stable component identity", () => {
    const program = parse(`a = Card([])\nb = Card([])`);
    expect(program.errors).toEqual([]);
    const first = program.statements[0]?.kind === "Assignment"
      ? program.statements[0].expression
      : undefined;
    const second = program.statements[1]?.kind === "Assignment"
      ? program.statements[1].expression
      : undefined;
    expect(first?.kind).toBe("Call");
    expect(second?.kind).toBe("Call");
    if (first?.kind !== "Call" || second?.kind !== "Call") return;
    expect(first.loc).toBeDefined();
    expect(second.loc).toBeDefined();
    expect(first.loc?.line).not.toBe(second.loc?.line);
  });
});
