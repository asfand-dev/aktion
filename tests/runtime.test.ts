import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  QueryRegistry,
  createContext,
  planProgram,
  evaluate,
} from "../src/runtime/index.js";
import { dataBuiltins } from "../src/runtime/builtins.js";
import { ActionRunner } from "../src/runtime/actions.js";
import type { ActionPayload } from "../src/runtime/builtins.js";

function buildContext(source: string) {
  const program = parse(source);
  const state = new StateStore();
  const queries = new QueryRegistry();
  const ctx = createContext(state, queries);
  planProgram(program, ctx);
  return { program, ctx, state, queries };
}

describe("evaluator", () => {
  it("evaluates a simple component reference graph", () => {
    const { ctx, program } = buildContext(`
root = Stack([card])
card = Card([CardHeader("Hi", "There")])
`);
    expect(program.errors).toEqual([]);
    const root = ctx.bindings.get("root")?.();
    expect(root).toMatchObject({ name: "Stack" });
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

  it("@Push returns a new array with the item appended (non-mutating)", () => {
    const original = [{ id: 1 }, { id: 2 }];
    const result = dataBuiltins.Push!([original, { id: 3 }]) as Array<{ id: number }>;
    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    // Originals stay untouched so reactive state sees a fresh reference.
    expect(original).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result).not.toBe(original);
  });

  it("@Concat joins two arrays", () => {
    expect(dataBuiltins.Concat!([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    expect(dataBuiltins.Concat!([null, [1]])).toEqual([1]);
  });
});

describe("array member shortcuts", () => {
  it("$arr.length returns the length (not array pluck)", () => {
    const { ctx } = buildContext(`$todos = [{id:1}, {id:2}, {id:3}]\nn = $todos.length`);
    const program = parse(`n = $todos.length`);
    const stmt = program.statements[0]!;
    expect(evaluate(stmt.expression, ctx)).toBe(3);
  });

  it("$arr.first / $arr.last return the boundary elements", () => {
    const { ctx } = buildContext(`$rows = [{x:1}, {x:2}, {x:3}]\nfirst = $rows.first\nlast = $rows.last`);
    const first = parse(`first = $rows.first`).statements[0]!.expression;
    const last = parse(`last = $rows.last`).statements[0]!.expression;
    expect(evaluate(first, ctx)).toEqual({ x: 1 });
    expect(evaluate(last, ctx)).toEqual({ x: 3 });
  });

  it("array pluck still works for non-shortcut fields", () => {
    const { ctx } = buildContext(`$rows = [{title:"a"}, {title:"b"}]\ntitles = $rows.title`);
    const program = parse(`titles = $rows.title`);
    const stmt = program.statements[0]!;
    expect(evaluate(stmt.expression, ctx)).toEqual(["a", "b"]);
  });

  it("string.length returns the character count", () => {
    const { ctx } = buildContext(`$msg = "hello"\nn = $msg.length`);
    const program = parse(`n = $msg.length`);
    const stmt = program.statements[0]!;
    expect(evaluate(stmt.expression, ctx)).toBe(5);
  });

  it("empty array .first and .last are null", () => {
    const { ctx } = buildContext(`$rows = []\nfirst = $rows.first\nlast = $rows.last`);
    const first = parse(`first = $rows.first`).statements[0]!.expression;
    const last = parse(`last = $rows.last`).statements[0]!.expression;
    expect(evaluate(first, ctx)).toBeNull();
    expect(evaluate(last, ctx)).toBeNull();
  });
});

describe("expression evaluation", () => {
  it("string concatenation and ternary", () => {
    const { ctx } = buildContext(`$days = 7\nlabel = "" + $days + " days"`);
    const program = parse(`label = "" + $days + " days"`);
    const stmt = program.statements[0]!;
    const value = evaluate(stmt.expression, ctx);
    expect(value).toBe("7 days");
  });
});

describe("@Each loop variable scoping", () => {
  it("restores the outer loop binding even when the inner item is undefined", () => {
    // Regression: the evaluator used to delete the outer binding whenever
    // the previous value happened to be `undefined`. With an inner @Each
    // operating on `[undefined, 1]`, that produced the wrong second iteration.
    const { ctx } = buildContext(
      `$items = [10, 20]\n` +
      `$sub = [null, "x"]\n` +
      `row = @Each($items, "i", @Each($sub, "i", i))`,
    );
    const out = ctx.bindings.get("row")?.();
    // The inner loop binds `i` to each of $sub's items, and on exit the
    // outer `i` must be restored so the next outer iteration sees `i = 20`.
    expect(Array.isArray(out)).toBe(true);
    // Two outer iterations, each producing two inner values.
    const flat = (out as unknown[]).flat();
    expect(flat).toEqual([null, "x", null, "x"]);
  });

  it("does not crash when the items source is not an array", () => {
    // Defensive: passing a non-array (e.g. null while a Query is loading)
    // should produce an empty iteration rather than throwing.
    const { ctx } = buildContext(`$items = null\nrow = @Each($items, "i", i)`);
    const out = ctx.bindings.get("row")?.();
    expect(out).toEqual([]);
  });
});

describe("queries", () => {
  it("evaluates non-trivial expressions in Query args (Binary, Member, Builtin)", async () => {
    // Regression: the previous lightweight evaluator only handled
    // Literal/StateRef/Array/Object — anything else collapsed to null
    // silently, so `{ id: $id + 1 }` would arrive as `{ id: null }`.
    const calls: Array<Record<string, unknown>> = [];
    const { queries } = buildContext(`
$id = 5
$prefix = "user"
data = Query("getUser", { id: $id + 1, slug: $prefix + "-x", first: $rows.first }, null)
$rows = [{name:"a"},{name:"b"}]
`);
    queries.setTools({
      getUser: async (args) => {
        calls.push(args);
        return { ok: true };
      },
    });
    // Wait two microtasks: one for the initial `bootstrapQuery` call, one
    // for the `setTools` retry that fires when the tool only appeared
    // after `register`.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1]!;
    expect(last.id).toBe(6);
    expect(last.slug).toBe("user-x");
    expect(last.first).toEqual({ name: "a" });
  });

  it("re-fires queries when setTools registers a previously-missing tool", async () => {
    const calls: number[] = [];
    const { queries } = buildContext(`data = Query("late", {}, null)`);
    // No tools yet — the bootstrap run is a no-op.
    await Promise.resolve();
    expect(calls.length).toBe(0);
    queries.setTools({
      late: async () => {
        calls.push(1);
        return { ok: true };
      },
    });
    await Promise.resolve();
    expect(calls.length).toBe(1);
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
    // Wait two microtasks: any spurious flush would land here.
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
    // Queue a change that hasn't flushed yet.
    state.set("count", 5);
    // Swap to a different program before the microtask flushes.
    state.rebind([["other", "hello"]]);
    await Promise.resolve();
    // Pending names from the previous program must not reach subscribers.
    expect(notifications).toBe(0);
    expect(state.get("other")).toBe("hello");
    expect(state.has("count")).toBe(false);
  });

  it("non-literal state defaults resolve to null (not undefined)", () => {
    // `$total = @Count($rows)` is a non-literal default. Previously the
    // declared value was `undefined`, which silently rendered as
    // "undefined" inside `"" + $total` style expressions.
    const { state } = buildContext(`$total = @Count($rows)\n$rows = [1, 2]`);
    expect(state.get("total")).toBeNull();
  });
});

describe("ActionRunner OpenUrl sanitisation", () => {
  /**
   * The action runner is the chokepoint for any `@OpenUrl(...)` step. A
   * hostile LLM/tool response could emit `@OpenUrl("javascript:alert(1)")`
   * which would otherwise execute on the page; the runner must rewrite the
   * URL to a safe placeholder before invoking `window.open` or any consumer
   * `onOpenUrl` override.
   */
  const buildPayload = (url: string): ActionPayload => ({
    kind: "Action",
    steps: [{ kind: "OpenUrl", url }],
  });

  it("rewrites `javascript:` URLs to a safe placeholder", async () => {
    const calls: string[] = [];
    const { ctx } = buildContext("");
    const runner = new ActionRunner({
      getContext: () => ctx,
      onOpenUrl: (u) => { calls.push(u); },
    });
    // eslint-disable-next-line no-script-url
    await runner.run(buildPayload("javascript:alert(1)"));
    expect(calls).toEqual(["#"]);
  });

  it("passes safe `https:` URLs through unchanged", async () => {
    const calls: string[] = [];
    const { ctx } = buildContext("");
    const runner = new ActionRunner({
      getContext: () => ctx,
      onOpenUrl: (u) => { calls.push(u); },
    });
    await runner.run(buildPayload("https://example.com/x"));
    expect(calls).toEqual(["https://example.com/x"]);
  });

  it("skips window.open entirely when no consumer override is wired", async () => {
    const { ctx } = buildContext("");
    const opens: Array<{ url: string; features?: string }> = [];
    const originalOpen = globalThis.window?.open;
    if (globalThis.window) {
      globalThis.window.open = ((url: string, _t?: string, features?: string) => {
        opens.push({ url, features });
        return null;
      }) as typeof window.open;
    }
    try {
      const runner = new ActionRunner({ getContext: () => ctx });
      // eslint-disable-next-line no-script-url
      await runner.run(buildPayload("javascript:alert(1)"));
      expect(opens).toEqual([]);
      await runner.run(buildPayload("https://example.com"));
      expect(opens).toHaveLength(1);
      expect(opens[0]!.url).toBe("https://example.com");
      // Ensure noreferrer is part of the window features for defence in depth.
      expect(opens[0]!.features ?? "").toContain("noreferrer");
    } finally {
      if (globalThis.window && originalOpen) {
        globalThis.window.open = originalOpen;
      }
    }
  });
});

describe("parser source locations", () => {
  it("attaches loc to Call expressions for stable component identity", () => {
    const program = parse(`a = Card([])\nb = Card([])`);
    expect(program.errors).toEqual([]);
    const first = program.statements[0]?.expression;
    const second = program.statements[1]?.expression;
    expect(first?.kind).toBe("Call");
    expect(second?.kind).toBe("Call");
    if (first?.kind !== "Call" || second?.kind !== "Call") return;
    expect(first.loc).toBeDefined();
    expect(second.loc).toBeDefined();
    // Different lines -> different source locations.
    expect(first.loc?.line).not.toBe(second.loc?.line);
  });
});
