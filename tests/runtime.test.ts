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
