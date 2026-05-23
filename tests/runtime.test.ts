/**
 * Aktion — core runtime regression tests.
 *
 * Exercises the evaluator, data builtins, state store, named-arg merging,
 * `@Each` loop scoping, and HTTP-native `http({...})` resources.
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
_app_ = Stack([card])
card = Card([CardHeader("Hi", "There")])
`);
    expect(program.errors).toEqual([]);
    const app = ctx.bindings.get("_app_")?.();
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
  it("treats a trailing object literal as an opaque positional arg (no implicit named-arg expansion)", () => {
    const { ctx } = buildContext(
      'btn = Button("Hi", {variant: "primary", size: "small"})',
    );
    const node = ctx.bindings.get("btn")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("Button");
    expect(node.args[0]).toBe("Hi");
    expect(node.args[1]).toEqual({ variant: "primary", size: "small" });
  });

  it("merges inline `name: value` args into the component's prop order", () => {
    const { ctx } = buildContext(
      'btn = Button("Hi", variant: "primary", size: "small")',
    );
    const node = ctx.bindings.get("btn")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("Button");
    expect(node.args[0]).toBe("Hi");
    expect(node.args[2]).toBe("primary");
    expect(node.args[4]).toBe("small");
  });

  it("merges inline `name: value` args with positional props", () => {
    const { ctx } = buildContext(
      'cell = GridItem(Text("Side"), span: "1/4")',
    );
    const node = ctx.bindings.get("cell")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("GridItem");
    expect((node.args[0] as { name: string }).name).toBe("Text");
    expect(node.args[1]).toBe("1/4");
  });

  it("merges named args before a trailing children array", () => {
    const { ctx } = buildContext(
      'layout = Grid(columns: 12, gap: "l", [GridItem(Text("A"), span: "1/4")])',
    );
    const node = ctx.bindings.get("layout")?.() as { name: string; args: unknown[] };
    expect(node.name).toBe("Grid");
    expect(node.args[1]).toBe(12);
    expect(node.args[2]).toBe("l");
    expect(Array.isArray(node.args[0])).toBe(true);
  });
});

describe("@Each loop variable scoping", () => {
  it("restores the outer loop binding even when the inner item is undefined", () => {
    const { ctx } = buildContext(
      `$items = [10, 20]\n` +
      `$sub = [null, "x"]\n` +
      `row = @Each($items, "i", @Each($sub, "i", i))`,
    );
    const out = ctx.bindings.get("row")?.();
    expect(Array.isArray(out)).toBe(true);
    const flat = (out as unknown[]).flat();
    expect(flat).toEqual([null, "x", null, "x"]);
  });

  it("does not crash when the items source is not an array", () => {
    const { ctx } = buildContext(`$items = null\nrow = @Each($items, "i", i)`);
    const out = ctx.bindings.get("row")?.();
    expect(out).toEqual([]);
  });
});

describe("http({...}) reactive resource", () => {
  let originalFetch: typeof fetch | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
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
$response = http({
  url: "/api/items",
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: { id: $id }
})
_app_ = Stack()
      `,
      { http },
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/items");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ id: 5 }));
  });

  it("exposes the reactive resource bag with data / status / refetch / cancel", async () => {
    const http = new HttpRuntime();
    const { ctx } = buildContext(
      `
$response = http({ url: "/api/items", method: "GET" })
_app_ = Stack()
      `,
      { http },
    );
    // Flush enough microtasks for: void run() → fetch → response.json() → resource bag mutation.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    const response = ctx.state.get("response") as {
      data: unknown;
      loading: boolean;
      status?: number;
      refetch: () => Promise<void>;
      cancel: () => void;
      lastUpdated?: number;
      headers?: Record<string, string>;
    };
    expect(response).toBeDefined();
    expect(response.data).toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(typeof response.refetch).toBe("function");
    expect(typeof response.cancel).toBe("function");
  });

  it("encodes a `query` shorthand as querystring params", async () => {
    const http = new HttpRuntime();
    buildContext(
      `
$response = http({ url: "/api/users", method: "GET", query: { limit: 5, slug: "abc" } })
_app_ = Stack()
      `,
      { http },
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("limit=5");
    expect(url).toContain("slug=abc");
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

  it("non-literal state defaults resolve to null (not undefined)", () => {
    const { state } = buildContext(`$total = @Count($rows)\n$rows = [1, 2]`);
    expect(state.get("total")).toBeNull();
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
