/**
 * Coverage for JavaScript patterns that the parser learned to accept
 * in v0.6: line-continuation expressions, single-statement loop bodies,
 * `do…while`, `for…in`, destructuring declarations, computed property
 * keys, prefix `++` / `--`, and the `async` / `await` cosmetics.
 *
 * These tests focus on PARSE acceptance + the small number of runtime
 * behaviours that are user-visible. Heavier integration coverage lives
 * in `language-concepts.test.ts` / `runtime.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  createContext,
  disposeContext,
  planProgram,
  type EvaluationContext,
} from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

function expectParses(src: string): void {
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error(
      `Unexpected parse errors:\n${program.errors.map((e) => `  ${e.line}:${e.column} ${e.message}`).join("\n")}`,
    );
  }
}

function runHarness(src: string): { state: StateStore; ctx: EvaluationContext } {
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error(
      `Unexpected parse errors:\n${program.errors.map((e) => `  ${e.message}`).join("\n")}`,
    );
  }
  planProgram(program, ctx);
  return { state, ctx };
}

describe("Line-continuation across newlines", () => {
  it("ternary `?` and `:` on subsequent lines", () => {
    expectParses(`aktion = Text("ok")
filteredTodos = []
tabUI = @Count(filteredTodos) == 0
      ? Text("empty")
      : Text("ok")`);
  });

  it("logical operators on the next line inside an arrow body", () => {
    expectParses(`aktion = filtered
attractions = []
filtered = attractions.filter(a =>
  ($selectedDistrict == "All") &&
  (a.name.includes($searchQuery))
)`);
  });

  it("method chain split across lines", () => {
    expectParses(`aktion = filteredTodos
$todos = []
filteredTodos = $todos
  .filter(t => $filter == t.category)
  .filter(t => t.title.includes($searchQuery))`);
  });

  it("optional chaining (`?.`) across lines", () => {
    expectParses(`aktion = out
api = {}
out = api
  .users
  ?.find(u => u.id == 1)
  ?.profile?.name`);
  });

  it("additive / multiplicative operators on the next line", () => {
    expectParses(`total = 1
  + 2
  * 3
aktion = Text(\`\${total}\`)`);
  });

  it("nested ternary chain across lines", () => {
    expectParses(`x = 1
status = x > 0
  ? "pos"
  : x < 0
    ? "neg"
    : "zero"
aktion = Text(status)`);
  });
});

describe("Single-statement clause bodies (no braces)", () => {
  it("`if (cond) return` inside a function", () => {
    expectParses(`function subscribe(_) {
  if (!$email) return
  $showNewsletter = false
}
aktion = Text("ok")`);
  });

  it("`if (cond) STATEMENT else STATEMENT`", () => {
    expectParses(`function pick(x) {
  if (x > 0) return "pos"
  else return "neg"
}
aktion = Text("ok")`);
  });

  it("`while (cond) STATEMENT`", () => {
    expectParses(`function drain(arr) {
  while (arr.length > 0) arr.pop()
}
aktion = Text("ok")`);
  });

  it("`for (...) STATEMENT` (both shapes)", () => {
    expectParses(`function each(arr) {
  for (let x of arr) console.log(x)
  for (let i = 0; i < 3; i += 1) console.log(i)
}
aktion = Text("ok")`);
  });
});

describe("Additional JS control-flow constructs", () => {
  it("`do { … } while (cond)` runs the body at least once", async () => {
    const { state, ctx } = runHarness(`
function fill(_) {
  let i = 0
  let arr = []
  do {
    arr.push(i)
    i = i + 1
  } while (i < 3)
  $items = arr
}
$items = []
run = fill(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("items")).toEqual([0, 1, 2]);
  });

  it("`for (let key in obj)` iterates enumerable string keys", async () => {
    const { state, ctx } = runHarness(`
function collect(_) {
  let out = []
  let obj = { a: 1, b: 2, c: 3 }
  for (let k in obj) out.push(k)
  $keys = out
}
$keys = []
run = collect(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("keys")).toEqual(["a", "b", "c"]);
  });
});

describe("Destructuring declarations", () => {
  it("array destructuring with rest", async () => {
    const { state, ctx } = runHarness(`
function go(_) {
  let [first, second, ...rest] = [10, 20, 30, 40, 50]
  $first = first
  $second = second
  $rest = rest
}
$first = 0
$second = 0
$rest = []
run = go(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("first")).toBe(10);
    expect(state.get("second")).toBe(20);
    expect(state.get("rest")).toEqual([30, 40, 50]);
  });

  it("object destructuring with aliases, defaults, and rest", async () => {
    const { state, ctx } = runHarness(`
function go(_) {
  let user = { name: "Alice", age: 30, city: "Berlin" }
  let { name: who, role = "guest", ...other } = user
  $who = who
  $role = role
  $other = other
}
$who = ""
$role = ""
$other = {}
run = go(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("who")).toBe("Alice");
    expect(state.get("role")).toBe("guest");
    expect(state.get("other")).toEqual({ age: 30, city: "Berlin" });
  });
});

describe("Object literal extras", () => {
  it("computed property keys `{[expr]: value}`", () => {
    const { state } = runHarness(`
$key = "answer"
$obj = { [$key]: 42, fixed: "ok" }
aktion = Text("ok")`);
    expect(state.get("obj")).toEqual({ answer: 42, fixed: "ok" });
  });
});

describe("Prefix increment / decrement", () => {
  it("`++x` returns the NEW value; `x++` returns the OLD value (JS semantics)", async () => {
    const { state, ctx } = runHarness(`
function bump(_) {
  let i = 5
  $afterPrefix = ++i
  $afterPostfix = i++
  $final = i
}
$afterPrefix = 0
$afterPostfix = 0
$final = 0
run = bump(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("afterPrefix")).toBe(6);
    expect(state.get("afterPostfix")).toBe(6);
    expect(state.get("final")).toBe(7);
  });
});

describe("Function shape extras", () => {
  it("trailing comma in function params", () => {
    expectParses(`function many(
  a,
  b,
  c,
) {
  return a + b + c
}
aktion = Text("ok")`);
  });

  it("`async function` modifier is accepted (no-op marker)", () => {
    expectParses(`async function fetchUser(id) {
  let res = await fetch("/u/" + id)
  return res
}
aktion = Text("ok")`);
  });
});

describe("Rejection of strict-JS-subset violations", () => {
  it("`x = for (...) { … }` is still a parse error", () => {
    const program = parse(`aktion = Text("ok")
rows = []
x = for (let r of rows) { Button(r.name) }`);
    expect(program.errors.length).toBeGreaterThan(0);
  });

  it("`x = if (cond) { … } else { … }` is still a parse error", () => {
    const program = parse(`aktion = Text("ok")
x = if (true) { 1 } else { 2 }`);
    expect(program.errors.length).toBeGreaterThan(0);
  });
});

describe("Cleanup", () => {
  it("disposes a sample context cleanly", () => {
    const { ctx } = runHarness(`aktion = Text("ok")`);
    disposeContext(ctx);
  });
});
