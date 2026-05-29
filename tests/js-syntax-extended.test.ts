/**
 * Extended JavaScript-subset coverage added in v0.7:
 *   - Bitwise / shift operators (`& | ^ ~ << >> >>>`) and every compound
 *     assignment (`&= |= ^= <<= >>= >>>= %= **= &&= ||= ??=`).
 *   - The `in` operator and `instanceof`.
 *   - Safe JS globals (`Math`, `JSON`, `Object`, `Array`, `Number`,
 *     `String`, `parseInt`, `new Date()`, `new Map()`, …).
 *   - Destructured function / lambda parameters.
 *   - The four reported runtime bugs (top-level `let` containers mutated
 *     in a loop, `.push`, a top-level `while`, and destructured params)
 *     rendered end-to-end through `<aktion-app>`.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  createContext,
  planProgram,
  type EvaluationContext,
} from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

// ---------------------------------------------------------------------------
// Pure-evaluation harness — run an action body, read the `$state` it writes.
// ---------------------------------------------------------------------------

function runHarness(src: string): { state: StateStore; ctx: EvaluationContext } {
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error(
      `Unexpected parse errors:\n${program.errors.map((e) => `  ${e.line}:${e.column} ${e.message}`).join("\n")}`,
    );
  }
  planProgram(program, ctx);
  return { state, ctx };
}

/** Evaluate `expr` by binding `$out = expr` inside an action and reading it. */
async function evalExpr(expr: string): Promise<unknown> {
  const { state, ctx } = runHarness(`
function go(_) {
  $out = ${expr}
}
$out = null
run = go(0)
aktion = Text("ok")`);
  await ctx.bindings.get("run")?.();
  return state.get("out");
}

// ---------------------------------------------------------------------------
// DOM harness — mount `<aktion-app>` and read its rendered text.
// ---------------------------------------------------------------------------

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const waitForRenders = async (n = 10): Promise<void> => {
  for (let i = 0; i < n; i += 1) await flush();
};

interface El extends HTMLElement {
  setResponse(text: string): void;
  state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
}
const mount = (): El => {
  const el = document.createElement("aktion-app") as unknown as El;
  document.body.appendChild(el);
  return el;
};
const badgeMatches = (el: El): string[] =>
  (el.shadowRoot?.textContent ?? "").match(/Badge \d+/g) ?? [];

// ===========================================================================

describe("Bitwise & shift operators", () => {
  it("evaluates bitwise AND / OR / XOR", async () => {
    expect(await evalExpr("12 & 10")).toBe(8);
    expect(await evalExpr("12 | 10")).toBe(14);
    expect(await evalExpr("12 ^ 10")).toBe(6);
  });

  it("evaluates the bitwise complement `~`", async () => {
    expect(await evalExpr("~5")).toBe(-6);
    expect(await evalExpr("~0")).toBe(-1);
  });

  it("evaluates left / signed-right / unsigned-right shifts", async () => {
    expect(await evalExpr("1 << 4")).toBe(16);
    expect(await evalExpr("-8 >> 1")).toBe(-4);
    expect(await evalExpr("-1 >>> 28")).toBe(15);
  });

  it("honours operator precedence (| below ^ below & below shifts)", async () => {
    // 1 | 2 & 3  ===  1 | (2 & 3)  === 1 | 2 === 3
    expect(await evalExpr("1 | 2 & 3")).toBe(3);
    // 1 << 2 + 1 === 1 << 3 === 8 (shift below additive)
    expect(await evalExpr("1 << 2 + 1")).toBe(8);
  });
});

describe("Compound assignment operators", () => {
  const cases: Array<[string, string, unknown]> = [
    ["%=", "let x = 17\n  x %= 5\n  $out = x", 2],
    ["**=", "let x = 2\n  x **= 5\n  $out = x", 32],
    ["&=", "let x = 12\n  x &= 10\n  $out = x", 8],
    ["|=", "let x = 12\n  x |= 10\n  $out = x", 14],
    ["^=", "let x = 12\n  x ^= 10\n  $out = x", 6],
    ["<<=", "let x = 1\n  x <<= 4\n  $out = x", 16],
    [">>=", "let x = -8\n  x >>= 1\n  $out = x", -4],
    [">>>=", "let x = -1\n  x >>>= 28\n  $out = x", 15],
    ["&&= (truthy)", "let x = 1\n  x &&= 9\n  $out = x", 9],
    ["||= (falsy)", "let x = 0\n  x ||= 9\n  $out = x", 9],
    ["??= (null)", "let x = null\n  x ??= 9\n  $out = x", 9],
  ];
  for (const [name, body, expected] of cases) {
    it(`applies ${name}`, async () => {
      const { state, ctx } = runHarness(`
function go(_) {
  ${body}
}
$out = null
run = go(0)
aktion = Text("ok")`);
      await ctx.bindings.get("run")?.();
      expect(state.get("out")).toBe(expected);
    });
  }
});

describe("`in` and `instanceof` operators", () => {
  it("`in` tests object key membership", async () => {
    expect(await evalExpr('"name" in { name: "Ada" }')).toBe(true);
    expect(await evalExpr('"age" in { name: "Ada" }')).toBe(false);
  });

  it("`instanceof` tests host constructors", async () => {
    expect(await evalExpr("new Date() instanceof Date")).toBe(true);
    expect(await evalExpr("[] instanceof Array")).toBe(true);
  });
});

describe("Safe JS globals", () => {
  it("Math namespace", async () => {
    expect(await evalExpr("Math.max(3, 7, 2)")).toBe(7);
    expect(await evalExpr("Math.floor(3.9)")).toBe(3);
    expect(await evalExpr("Math.abs(-5)")).toBe(5);
  });

  it("JSON round-trips", async () => {
    expect(await evalExpr('JSON.stringify({ a: 1 })')).toBe('{"a":1}');
    expect(await evalExpr('JSON.parse("[1,2,3]")')).toEqual([1, 2, 3]);
  });

  it("Object helpers", async () => {
    expect(await evalExpr('Object.keys({ a: 1, b: 2 })')).toEqual(["a", "b"]);
    expect(await evalExpr('Object.values({ a: 1, b: 2 })')).toEqual([1, 2]);
  });

  it("Number / String / parseInt / parseFloat / isNaN", async () => {
    expect(await evalExpr('Number("42")')).toBe(42);
    expect(await evalExpr("String(42)")).toBe("42");
    expect(await evalExpr('parseInt("0xFF", 16)')).toBe(255);
    expect(await evalExpr('parseFloat("3.14abc")')).toBe(3.14);
    expect(await evalExpr('isNaN(parseInt("abc"))')).toBe(true);
    expect(await evalExpr("isFinite(42)")).toBe(true);
  });

  it("constructors via `new` (Date, Map, Set)", async () => {
    expect(await evalExpr("new Date(0).getTime()")).toBe(0);
    expect(await evalExpr("new Map([[1, 2]]).get(1)")).toBe(2);
    expect(await evalExpr("new Set([1, 1, 2, 3]).size")).toBe(3);
  });
});

describe("Destructured function & lambda parameters", () => {
  it("object destructuring param with default", async () => {
    const { state, ctx } = runHarness(`
function go(_) {
  $out = label({ text: "Hi" })
}
function label({ text, tone = "info" }) {
  $tone = tone
  return text
}
$out = null
$tone = null
run = go(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("out")).toBe("Hi");
    expect(state.get("tone")).toBe("info");
  });

  it("array destructuring param with rest", async () => {
    const { state, ctx } = runHarness(`
function go(_) {
  $out = head([10, 20, 30])
}
function head([first, ...rest]) {
  $rest = rest
  return first
}
$out = null
$rest = []
run = go(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("out")).toBe(10);
    expect(state.get("rest")).toEqual([20, 30]);
  });

  it("destructured lambda parameter", async () => {
    const { state, ctx } = runHarness(`
function go(_) {
  let pick = ({ a, b }) => a + b
  $out = pick({ a: 3, b: 4 })
}
$out = 0
run = go(0)
aktion = Text("ok")`);
    await ctx.bindings.get("run")?.();
    expect(state.get("out")).toBe(7);
  });
});

// ===========================================================================
// End-to-end rendering of the four reported bugs.
// ===========================================================================

describe("Reported runtime bugs (rendered end-to-end)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("bug 1: `let` container reassigned via spread renders badges ONCE", async () => {
    const el = mount();
    el.setResponse(`aktion = Stack(Test())
let badges = []
function Test() {
  for (let j = 10; j > 0; j--) {
    badges = [...badges, Badge(\`Badge \${j}\`)]
  }
  return badges
}`);
    await waitForRenders();
    expect(badgeMatches(el)).toHaveLength(10);
  });

  it("bug 2: `let` container mutated via `.push` shows the badges", async () => {
    const el = mount();
    el.setResponse(`aktion = Stack(Test())
let badges = []
function Test() {
  for (let j = 10; j > 0; j--) {
    badges.push(Badge(\`Badge \${j}\`))
  }
  return badges
}`);
    await waitForRenders();
    expect(badgeMatches(el)).toHaveLength(10);
  });

  it("bug 3: top-level `while` loop populates state and renders", async () => {
    const el = mount();
    el.setResponse(`aktion = Stack($badges)
i = 10
while (i > 0) {
  $badges = [...$badges, Badge(\`Badge \${i}\`)]
  i = i - 1
}
$badges = []`);
    await waitForRenders();
    expect(badgeMatches(el)).toHaveLength(10);
  });

  it("bug 4: destructured component parameter resolves the prop", async () => {
    const el = mount();
    el.setResponse(`aktion = Stack(Test({ name: "Hello" }))
function Test({ name }) {
  return (Button(name))
}`);
    await waitForRenders();
    expect(el.shadowRoot?.textContent ?? "").toContain("Hello");
  });
});
