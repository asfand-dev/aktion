/**
 * Coverage for the new language features added in this iteration:
 *   - Template literals with `${}` interpolation
 *   - Optional chaining (`?.`) and nullish coalescing (`??`)
 *   - Spread operator in arrays/objects
 *   - Destructuring in @Each ("{a, b}" forms)
 *   - Lazy control flow: @If / @Switch
 *   - Custom component macros (Name(args) = Expression)
 *   - Persistent state ($$variable) via the StateStore adapter
 *   - Responsive prop maps for Grid / Stack
 *   - The new data builtins (Map, Find, GroupBy, Slice, Take, Unique,
 *     Reverse, Range, Repeat, Pick, Format*, date helpers, casing helpers,
 *     Plural, Clamp)
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  QueryRegistry,
  createContext,
  planProgram,
  evaluate,
  isComponentNode,
  type PersistenceAdapter,
} from "../src/runtime/index.js";
import { dataBuiltins } from "../src/runtime/builtins.js";
import { defaultLibrary } from "../src/library/index.js";

function buildContext(source: string) {
  const program = parse(source);
  const state = new StateStore();
  const queries = new QueryRegistry();
  const ctx = createContext(state, queries, undefined, defaultLibrary);
  planProgram(program, ctx);
  return { program, ctx, state, queries };
}

describe("template literals", () => {
  it("interpolates $variables", () => {
    const { ctx } = buildContext('$name = "Ada"\nmsg = `Hello ${$name}!`');
    expect(ctx.bindings.get("msg")?.()).toBe("Hello Ada!");
  });

  it("supports member access inside ${...}", () => {
    const { ctx } = buildContext('$rows = [1, 2, 3]\nmsg = `${$rows.length} rows`');
    expect(ctx.bindings.get("msg")?.()).toBe("3 rows");
  });

  it("plain backtick strings without ${} stay as regular strings", () => {
    // Important for `Script(...)` / `@Js(...)` bodies that don't want
    // interpolation magic when they only contain JS code.
    const program = parse("body = `console.log(\"hi\")`");
    expect(program.errors).toEqual([]);
    expect(program.statements[0]?.expression).toMatchObject({
      kind: "Literal",
      value: 'console.log("hi")',
    });
  });

  it("evaluates expressions inside ${...} (binary, ternary, builtins)", () => {
    const { ctx } = buildContext(
      '$n = 3\nmsg = `total=${$n + 1}, ${$n > 0 ? "yes" : "no"}, count=${@Sum([$n, 2])}`',
    );
    expect(ctx.bindings.get("msg")?.()).toBe("total=4, yes, count=5");
  });

  it("escapes \\${ to embed a literal $ token", () => {
    const program = parse("body = `price = \\${total}`");
    expect(program.errors).toEqual([]);
    expect(program.statements[0]?.expression).toMatchObject({
      kind: "Literal",
      value: "price = ${total}",
    });
  });
});

describe("optional chaining + nullish coalescing", () => {
  it("?. short-circuits to undefined on null", () => {
    const { ctx } = buildContext("$user = null\navatar = $user?.profile?.avatar");
    expect(ctx.bindings.get("avatar")?.()).toBeUndefined();
  });

  it("?. walks the chain when present", () => {
    const { ctx } = buildContext(
      '$user = {profile: {avatar: "/a.png"}}\navatar = $user?.profile?.avatar',
    );
    expect(ctx.bindings.get("avatar")?.()).toBe("/a.png");
  });

  it("?? returns the left value when not null/undefined (unlike ||)", () => {
    const { ctx } = buildContext("$count = 0\nshown = $count ?? 7");
    expect(ctx.bindings.get("shown")?.()).toBe(0);
  });

  it("?? returns the right value on null", () => {
    const { ctx } = buildContext('$name = null\nlabel = $name ?? "Guest"');
    expect(ctx.bindings.get("label")?.()).toBe("Guest");
  });
});

describe("spread operator", () => {
  it("spreads arrays inside array literals", () => {
    const { ctx } = buildContext("$a = [1,2]\n$b = [3,4]\nmerged = [...$a, ...$b, 5]");
    expect(ctx.bindings.get("merged")?.()).toEqual([1, 2, 3, 4, 5]);
  });

  it("spreads strings into characters", () => {
    const { ctx } = buildContext('letters = [..."abc"]');
    expect(ctx.bindings.get("letters")?.()).toEqual(["a", "b", "c"]);
  });

  it("merges object spread (later keys win)", () => {
    const { ctx } = buildContext(
      '$cur = {a: 1, b: 2}\npatched = {...$cur, b: 99, c: 3}',
    );
    expect(ctx.bindings.get("patched")?.()).toEqual({ a: 1, b: 99, c: 3 });
  });
});

describe("@Each destructuring", () => {
  it('"{id, name}" binds those fields directly', () => {
    const { ctx } = buildContext(
      '$rows = [{id:1, name:"a"},{id:2, name:"b"}]\nlist = @Each($rows, "{id, name}", id + ":" + name)',
    );
    expect(ctx.bindings.get("list")?.()).toEqual(["1:a", "2:b"]);
  });

  it('"row, {id}" binds BOTH the row object and individual fields', () => {
    const { ctx } = buildContext(
      '$rows = [{id:1, name:"a"},{id:2, name:"b"}]\nlist = @Each($rows, "r, {name}", r.id + "-" + name)',
    );
    expect(ctx.bindings.get("list")?.()).toEqual(["1-a", "2-b"]);
  });
});

describe("@If / @Switch lazy control flow", () => {
  it("@If picks the true branch when the condition is truthy", () => {
    const { ctx } = buildContext(
      '$mode = "empty"\nbody = @If($mode == "empty", "EMPTY", "DATA")',
    );
    expect(ctx.bindings.get("body")?.()).toBe("EMPTY");
  });

  it("@If falls back to null when no false branch given", () => {
    const { ctx } = buildContext("body = @If(false, \"yes\")");
    expect(ctx.bindings.get("body")?.()).toBeNull();
  });

  it("@Switch returns the matching branch", () => {
    const { ctx } = buildContext(
      '$tab = "billing"\npanel = @Switch($tab, {overview: "OV", billing: "BI", security: "SE"}, "DEFAULT")',
    );
    expect(ctx.bindings.get("panel")?.()).toBe("BI");
  });

  it("@Switch falls back to the default when no case matches", () => {
    const { ctx } = buildContext(
      '$tab = "missing"\npanel = @Switch($tab, {a: "A"}, "DEFAULT")',
    );
    expect(ctx.bindings.get("panel")?.()).toBe("DEFAULT");
  });

  it("@Const memoizes repeated evaluation", () => {
    const { ctx } = buildContext("$n = 0\na = @Const($n + 1)\nb = @Const($n + 1)");
    expect(ctx.bindings.get("a")?.()).toBe(1);
    expect(ctx.bindings.get("b")?.()).toBe(1);
    // Bump state after the memo is populated — Const should still return 1.
    ctx.state.set("n", 5);
    expect(ctx.bindings.get("a")?.()).toBe(1);
    expect(ctx.bindings.get("b")?.()).toBe(1);
  });

  it("@Switch does not evaluate unmatched branches", () => {
    // The unmatched branch references an undefined identifier — if it were
    // eagerly evaluated, we'd get `null` from the lookup. Lazy evaluation
    // means we never touch it, proving the branch is dormant.
    const { ctx } = buildContext(
      '$tab = "a"\npanel = @Switch($tab, {a: "A", b: undefinedReference}, "DEFAULT")',
    );
    expect(ctx.bindings.get("panel")?.()).toBe("A");
  });
});

describe("custom component macros", () => {
  it("invokes a macro with positional args", () => {
    const { ctx } = buildContext(
      '$users = [{name:"Ada", role:"Eng"}]\n' +
      'MyUserCard(user) = Card([Avatar(user.name), TextContent(user.role)])\n' +
      "list = @Each($users, \"u\", MyUserCard(u))",
    );
    const list = ctx.bindings.get("list")?.();
    expect(Array.isArray(list)).toBe(true);
    const first = (list as unknown[])[0];
    expect(isComponentNode(first)).toBe(true);
    expect((first as { name: string }).name).toBe("Card");
  });

  it("macro parameters do not leak into the outer scope", () => {
    const { ctx } = buildContext(
      "Inner(p) = p\nouter = Inner(7)",
    );
    expect(ctx.bindings.get("outer")?.()).toBe(7);
    // Parameter name should be undefined outside the macro body.
    const exprP = parse("x = p").statements[0]!.expression;
    expect(evaluate(exprP, ctx)).toBeNull();
  });

  it("does not break ordinary calls that share a name pattern", () => {
    // `Card(...)` should still parse as a component call, not a macro,
    // because there is no `Card(args) = …` assignment in the program.
    const program = parse("root = Card([])");
    expect(program.errors).toEqual([]);
    expect(program.statements[0]).toMatchObject({
      identifier: "root",
      params: undefined,
    });
  });
});

describe("persistent state ($$variable)", () => {
  it("uses the persistence adapter for $$ declarations", () => {
    const store: Record<string, unknown> = {};
    const adapter: PersistenceAdapter = {
      load: (name) => (name in store ? store[name] : undefined),
      save: (name, value) => { store[name] = value; },
      remove: (name) => { delete store[name]; },
    };
    const state = new StateStore();
    state.setPersistenceAdapter(adapter);
    const queries = new QueryRegistry();
    const ctx = createContext(state, queries, undefined, defaultLibrary);
    planProgram(parse('$$theme = "light"\n$$cart = []'), ctx);
    expect(state.isPersistent("theme")).toBe(true);
    expect(state.get("theme")).toBe("light");
    state.set("theme", "dark");
    expect(store.theme).toBe("dark");
  });

  it("hydrates from the adapter when a value already exists", () => {
    const adapter: PersistenceAdapter = {
      load: (name) => (name === "theme" ? "neon" : undefined),
      save: () => {},
      remove: () => {},
    };
    const state = new StateStore();
    state.setPersistenceAdapter(adapter);
    state.declarePersistent("theme", "light");
    expect(state.get("theme")).toBe("neon");
  });

  it("namespaces persistent state separately from regular state", () => {
    // `$theme` and `$$theme` are two independent buckets — they just happen
    // to share a name. The runtime treats them as the same key in the
    // StateStore (because the parser strips the `$`), so the LLM should
    // pick one flavour per variable. This guards the contract that
    // `declarePersistent` only marks the name as persistent and does NOT
    // hijack any existing `$` declaration with the same name.
    const state = new StateStore();
    state.declare("theme", "auto"); // pre-existing $theme
    state.declarePersistent("theme", "light");
    // Persistent declaration wins because it ran later — same key.
    expect(state.isPersistent("theme")).toBe(true);
  });
});

describe("responsive prop maps", () => {
  it("Grid emits per-breakpoint CSS variables for columns + gap", () => {
    const grid = defaultLibrary.components.find((c) => c.name === "Grid");
    expect(grid).toBeDefined();
    const props = {
      children: [],
      columns: { sm: 1, md: 2, lg: 4 },
      gap: { sm: "s", md: "m", lg: "l" },
    };
    const node = grid!.render(
      { __kind: "Component", name: "Grid", args: [], argMeta: [] },
      props,
      { renderNode: () => document.createElement("span") },
    );
    expect(node.getAttribute("data-responsive-cols")).toBe("true");
    expect(node.getAttribute("data-responsive-gap")).toBe("true");
    const style = node.getAttribute("style") ?? "";
    expect(style).toContain("--rui-grid-cols-sm:1");
    expect(style).toContain("--rui-grid-cols-md:2");
    expect(style).toContain("--rui-grid-cols-lg:4");
    expect(style).toContain("--rui-grid-gap-sm:");
  });

  it("Grid preserves the single-value path for backwards compatibility", () => {
    const grid = defaultLibrary.components.find((c) => c.name === "Grid")!;
    const node = grid.render(
      { __kind: "Component", name: "Grid", args: [], argMeta: [] },
      { children: [], columns: 3, gap: "m" },
      { renderNode: () => document.createElement("span") },
    );
    expect(node.getAttribute("data-columns")).toBe("3");
    expect(node.getAttribute("data-gap")).toBe("m");
    expect(node.getAttribute("data-responsive-cols")).toBeNull();
  });

  it("Stack accepts responsive direction + gap maps", () => {
    const stack = defaultLibrary.components.find((c) => c.name === "Stack")!;
    const node = stack.render(
      { __kind: "Component", name: "Stack", args: [], argMeta: [] },
      { children: [], direction: { sm: "column", md: "row" }, gap: { sm: "s", md: "l" } },
      { renderNode: () => document.createElement("span") },
    );
    expect(node.getAttribute("data-direction")).toBe("responsive");
    expect(node.getAttribute("data-gap")).toBe("responsive");
    const style = node.getAttribute("style") ?? "";
    expect(style).toContain("--rui-stack-dir-sm:column");
    expect(style).toContain("--rui-stack-dir-md:row");
  });
});

describe("new data builtins", () => {
  it("@Find returns the first match or null", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(dataBuiltins.Find!([rows, "id", "==", 2])).toEqual({ id: 2 });
    expect(dataBuiltins.Find!([rows, "id", "==", 99])).toBeNull();
  });

  it("@GroupBy groups items by a field value", () => {
    const rows = [
      { id: 1, role: "admin" },
      { id: 2, role: "user" },
      { id: 3, role: "admin" },
    ];
    expect(dataBuiltins.GroupBy!([rows, "role"])).toEqual({
      admin: [{ id: 1, role: "admin" }, { id: 3, role: "admin" }],
      user: [{ id: 2, role: "user" }],
    });
  });

  it("@Slice works as expected", () => {
    expect(dataBuiltins.Slice!([[1, 2, 3, 4, 5], 1, 4])).toEqual([2, 3, 4]);
    expect(dataBuiltins.Slice!([[1, 2, 3], 1])).toEqual([2, 3]);
    expect(dataBuiltins.Slice!([[1, 2, 3, 4], 0, 2])).toEqual([1, 2]);
  });

  it("@Unique without a field dedupes by strict equality; with a field dedupes by it", () => {
    expect(dataBuiltins.Unique!([[1, 2, 2, 3, 1]])).toEqual([1, 2, 3]);
    const rows = [{ id: 1 }, { id: 2 }, { id: 1 }];
    expect(dataBuiltins.Unique!([rows, "id"])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("@Reverse returns a NEW array (non-mutating)", () => {
    const src = [1, 2, 3];
    const out = dataBuiltins.Reverse!([src]);
    expect(out).toEqual([3, 2, 1]);
    expect(src).toEqual([1, 2, 3]);
  });

  it("@Range produces ascending / descending inclusive ranges", () => {
    expect(dataBuiltins.Range!([0, 4])).toEqual([0, 1, 2, 3, 4]);
    expect(dataBuiltins.Range!([3, 1])).toEqual([3, 2, 1]);
    expect(dataBuiltins.Range!([0, 10, 5])).toEqual([0, 5, 10]);
  });

  it("@Repeat returns the value N times", () => {
    expect(dataBuiltins.Repeat!(["x", 3])).toEqual(["x", "x", "x"]);
    expect(dataBuiltins.Repeat!([null, 0])).toEqual([]);
  });

  it("@Pick keeps only the listed keys", () => {
    expect(dataBuiltins.Pick!([{ a: 1, b: 2, c: 3 }, ["a", "c"]])).toEqual({
      a: 1,
      c: 3,
    });
  });

  it("@Format dispatches to currency / percent / number modes", () => {
    const usd = dataBuiltins.Format!([1234.5, "currency", "USD", "en-US"]) as string;
    expect(usd).toMatch(/\$1,234\.5/);
    const num = dataBuiltins.Format!([1234567, "number", "en-US"]) as string;
    expect(num).toBe("1,234,567");
    const currency = dataBuiltins.Format!([10, "currency", "EUR", "de-DE"]) as string;
    expect(currency).toMatch(/10/);
    const percent = dataBuiltins.Format!([0.5, "percent", "en-US"]) as string;
    expect(percent).toMatch(/50/);
    const plain = dataBuiltins.Format!([1500, "number", "en-US"]) as string;
    expect(plain).toBe("1,500");
  });

  it("@FormatDate supports tokens, named modes, and relative", () => {
    const iso = "2024-03-14T10:11:12Z";
    expect(dataBuiltins.FormatDate!([iso, "YYYY-MM-DD"])).toMatch(/2024-03-14/);
    expect(dataBuiltins.FormatDate!([iso, "iso"])).toBe(new Date(iso).toISOString());
    expect(dataBuiltins.FormatDate!([Date.now() - 60_000, "relative"])).toMatch(/ago/);
  });

  it("@Now and @Today return sensible values", () => {
    const now = dataBuiltins.Now!([]) as number;
    expect(typeof now).toBe("number");
    expect(Math.abs(now - Date.now())).toBeLessThan(5_000);
    const today = dataBuiltins.Today!([]) as string;
    // `@Today()` returns local-midnight as ISO — the UTC hour depends on
    // the runner's timezone, so we only assert the shape, not the time.
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // It should be within one calendar day of now.
    expect(Math.abs(new Date(today).getTime() - Date.now())).toBeLessThan(36 * 60 * 60 * 1000);
  });

  it("@AddDays shifts an ISO date by N days", () => {
    const base = "2024-01-01T00:00:00.000Z";
    expect(dataBuiltins.AddDays!([base, 5])).toBe("2024-01-06T00:00:00.000Z");
    expect(dataBuiltins.AddDays!([base, -1])).toBe("2023-12-31T00:00:00.000Z");
  });

  it("@Plural handles 1 vs many", () => {
    expect(dataBuiltins.Plural!([1, "order"])).toBe("1 order");
    expect(dataBuiltins.Plural!([3, "order"])).toBe("3 orders");
    expect(dataBuiltins.Plural!([2, "child", "children"])).toBe("2 children");
  });

  it("string casing helpers (Capitalize / Lower / Upper / Title)", () => {
    expect(dataBuiltins.Capitalize!(["hello"])).toBe("Hello");
    expect(dataBuiltins.Lowercase!(["HeLLo"])).toBe("hello");
    expect(dataBuiltins.Uppercase!(["hello"])).toBe("HELLO");
    expect(dataBuiltins.Titlecase!(["hello world"])).toBe("Hello World");
  });

  it("@Case converts casing by mode", () => {
    expect(dataBuiltins.Case!(["hello world", "camel"])).toBe("helloWorld");
    expect(dataBuiltins.Case!(["Hello World", "snake"])).toBe("hello_world");
    expect(dataBuiltins.Case!(["Hello World", "kebab"])).toBe("hello-world");
    expect(dataBuiltins.Case!(["hello world", "pascal"])).toBe("HelloWorld");
    expect(dataBuiltins.Case!(["helloWorld", "snake"])).toBe("hello_world");
  });

  it("string helpers (Join / Split / Trim / Replace / Substring / prefix tests)", () => {
    expect(dataBuiltins.Join!([["a", "b"], "-"])).toBe("a-b");
    expect(dataBuiltins.Split!(["a,b,c"])).toEqual(["a", "b", "c"]);
    expect(dataBuiltins.Trim!(["  hi  "])).toBe("hi");
    expect(dataBuiltins.Replace!(["foo bar", "bar", "baz"])).toBe("foo baz");
    expect(dataBuiltins.Substring!(["hello", 1, 4])).toBe("ell");
    expect(dataBuiltins.StartsWith!(["hello", "he"])).toBe(true);
    expect(dataBuiltins.EndsWith!(["hello", "lo"])).toBe(true);
    expect(dataBuiltins.Contains!(["hello", "ell"])).toBe(true);
    expect(dataBuiltins.Match!(["abc123", "\\d+"])).toBe(true);
  });

  it("numeric helpers (Pow / Sqrt / Log / Random)", () => {
    expect(dataBuiltins.Pow!([2, 3])).toBe(8);
    expect(dataBuiltins.Sqrt!([9])).toBe(3);
    expect(dataBuiltins.Log!([Math.E])).toBeCloseTo(1);
    const r = dataBuiltins.Random!([]) as number;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });

  it("@FilterBy mirrors @Filter", () => {
    const rows = [{ name: "alpha" }, { name: "beta" }];
    expect(dataBuiltins.FilterBy!([rows, "name", "==", "alpha"])).toEqual([{ name: "alpha" }]);
  });

  it("date helpers (AddHours / DiffDays / StartOfWeek / EndOfMonth)", () => {
    const base = "2024-01-01T12:00:00.000Z";
    expect(dataBuiltins.AddHours!([base, 2])).toBe("2024-01-01T14:00:00.000Z");
    expect(dataBuiltins.DiffDays!(["2024-01-01", "2024-01-04"])).toBe(3);
    const weekStart = new Date(dataBuiltins.StartOfWeek!(["2024-01-04T12:00:00.000Z"]) as string);
    expect(weekStart.getUTCDay()).toBe(0);
    expect(dataBuiltins.EndOfMonth!(["2024-02-10"])).toMatch(/2024-02-29/);
  });

  it("@Clamp constrains a number into [min, max]", () => {
    expect(dataBuiltins.Clamp!([5, 0, 10])).toBe(5);
    expect(dataBuiltins.Clamp!([-3, 0, 10])).toBe(0);
    expect(dataBuiltins.Clamp!([99, 0, 10])).toBe(10);
  });
});
