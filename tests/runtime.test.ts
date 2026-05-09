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
