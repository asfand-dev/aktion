/**
 * Evaluator fixes that make Aktion compute what JavaScript computes — the
 * Phase 0 runtime fixes R1–R6 of the TypeScript/JavaScript authoring guide
 * (`aktion-in-typescript.md` §6.6, implementation item 8.0.6).
 *
 * Every one of these was a bug for `.aktion` authors too, not only for code
 * written in TypeScript. There is one `describe` per fix; the comment above it
 * names the §6.1 divergence row it closes (S18, S20, S21, S22, S34) and the
 * Appendix D probe that measured it, and the tests assert the answer a
 * JavaScript engine gives for the same code. Two smaller blocks at the end pin
 * behaviour the guide relies on: a bare `return` yielding `undefined` (the W3
 * precondition from 8.0.6) and the library-call slot order that the corrected
 * comment on `resolveLibraryCallArgs` describes.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, flush, render, renderCompiled } from "../src/testing/index.js";
import type { AktionApp, Screen } from "../src/testing/index.js";
import { getDevtoolsHook, installDevtoolsHook } from "../src/devtools/hook.js";
import type { DevtoolsEvent, EffectEvent } from "../src/devtools/protocol.js";
import { parse } from "../src/parser/index.js";
import type { ComponentDeclaration, DeclParam, Program } from "../src/parser/types.js";
import type { CompiledProgram } from "../src/compiler/runtime.js";

let devtoolsUnsubscribers: Array<() => void> = [];

afterEach(() => {
  for (const unsubscribe of devtoolsUnsubscribers) unsubscribe();
  devtoolsUnsubscribers = [];
  cleanup();
  const hook = getDevtoolsHook();
  if (hook) {
    hook.apps.clear();
    hook.buffer.length = 0;
  }
  vi.restoreAllMocks();
});

/** The screen's visible text: tags and the theme's `<style>` blocks stripped. */
function visibleText(screen: Screen): string {
  return screen
    .html()
    .replaceAll(/<style[\s\S]*?<\/style>/g, "")
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/** Mount `program`, let it settle, click "Go", and return `$out`. */
async function runGo(program: string, options: Parameters<typeof render>[1] = {}): Promise<unknown> {
  const screen = render(program, options);
  await flush();
  await screen.click("Go");
  await flush();
  return screen.state.get("out");
}

/** The `[aktion] effect "…" failed` lines the effect runner logged. */
function effectFailures(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((line: string) => line.includes("effect") && line.includes("failed"));
}

// ===========================================================================
// R1 — `return` ends an `$effect` body (S18; probes [9af], [9ae])
// ===========================================================================

describe("R1 — `return` inside an `$effect` body ends the body, at any depth", () => {
  it("a top-level `return` stops the body: later statements do not run ([9af])", async () => {
    const screen = render(`
$out = "unset"
$effect(() => {
  $out = "first"
  return
  $out = "after-return"
}, ["mount"])
$app(Text($out))
`);
    await flush();
    expect(screen.state.get("out")).toBe("first");
  });

  it("a `return` in a nested `if` ends the effect and is not logged as a failure ([9ae])", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = render(`
$out = "unset"
$effect(() => {
  $out = "before"
  if (true) {
    return
  }
  $out = "after-if"
}, ["mount"])
$app(Text($out))
`);
    await flush();
    expect(screen.state.get("out")).toBe("before");
    expect(effectFailures(errors)).toEqual([]);
  });

  it("a `return` inside a loop ends the whole body, not just the loop", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = render(`
$out = ""
$effect(() => {
  for (const n of [1, 2, 3]) {
    $out = $out + n
    if (n === 2) {
      return
    }
  }
  $out = $out + "|done"
}, ["mount"])
$app(Text($out))
`);
    await flush();
    expect(screen.state.get("out")).toBe("12");
    expect(effectFailures(errors)).toEqual([]);
  });

  it("evaluates the `return` argument, as JavaScript does, and discards its value", async () => {
    const screen = render(`
$calls = 0
$out = "unset"
function bump() {
  $calls = $calls + 1
  return "ignored"
}
$effect(() => {
  return bump()
  $out = "unreachable"
}, ["mount"])
$app(Text(\`\${$calls}\`))
`);
    await flush();
    expect(screen.state.get("calls")).toBe(1);
    expect(screen.state.get("out")).toBe("unset");
  });

  it("an effect that returned early still counts as having run — and re-runs on its trigger", async () => {
    const hook = installDevtoolsHook();
    const events: DevtoolsEvent[] = [];
    devtoolsUnsubscribers.push(hook.subscribe((event) => events.push(event)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = render(`
$n = 0
$runs = 0
$effect(() => {
  $runs = $runs + 1
  if ($n < 100) {
    return
  }
  $runs = -1
}, [$n])
$app(Column([Text(\`n=\${$n}\`), Button("Go", { onClick: () => $n = $n + 1 })]))
`);
    await flush();
    expect(screen.state.get("runs")).toBe(1);
    await screen.click("Go");
    await flush();
    expect(screen.state.get("runs")).toBe(2);

    const effectEvents = events.filter((e): e is EffectEvent => e.kind === "effect");
    expect(effectEvents.filter((e) => e.phase === "run").length).toBe(2);
    expect(effectEvents.filter((e) => e.phase === "error")).toEqual([]);
    expect(effectFailures(errors)).toEqual([]);
  });

  it("keeps cleanups registered before the `return`, and never registers the ones after it", async () => {
    const screen = render(`
$n = 0
$log = ""
$effect(() => {
  cleanup(() => { $log = $log + "before;" })
  if ($n >= 0) {
    return
  }
  cleanup(() => { $log = $log + "nested-after;" })
}, [$n])
$effect(() => {
  cleanup(() => { $log = $log + "top;" })
  return
  cleanup(() => { $log = $log + "top-after;" })
}, [$n])
$app(Column([Text(\`n=\${$n}\`), Button("Go", { onClick: () => $n = $n + 1 })]))
`);
    await flush();
    expect(screen.state.get("log")).toBe("");
    // Re-running an effect fires the cleanups its previous run registered.
    await screen.click("Go");
    await flush();
    const log = String(screen.state.get("log"));
    expect(log).toContain("before;");
    expect(log).toContain("top;");
    expect(log).not.toContain("after;");
  });

  it("a `return` inside a callback returns from the callback only; `finally` still runs", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = render(`
$out = ""
$effect(() => {
  const kept = [1, 2, 3].filter((n) => {
    if (n === 2) {
      return false
    }
    return true
  })
  $out = "kept=" + kept.join(",")
  try {
    return
  } finally {
    $out = $out + "|finally"
  }
  $out = $out + "|unreachable"
}, ["mount"])
$app(Text($out))
`);
    await flush();
    expect(screen.state.get("out")).toBe("kept=1,3|finally");
    expect(effectFailures(errors)).toEqual([]);
  });

  it("works for a per-instance effect declared in a component body", async () => {
    const screen = render(`
function Box() {
  $count = 0
  $effect(() => {
    $count = 1
    return
    $count = 2
  }, ["mount"])
  return Text(\`count=\${$count}\`)
}
$app(Box())
`);
    await flush();
    expect(visibleText(screen)).toBe("count=1");
  });
});

// ===========================================================================
// R2 — `o.p++`, `++o.p`, `a[i]++` on non-`$` values (S21; probes [18a], [18b])
// ===========================================================================

describe("R2 — increment and decrement of a member of a plain object or array", () => {
  it("postfix returns the old value, prefix the new one ([18a])", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const o = { n: 0 }
  o.n++
  ++o.n
  const r = o.n++
  $out = "o.n=" + o.n + ",r=" + r
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("o.n=3,r=2");
  });

  it("decrements: `o.p--` returns the old value, `--o.p` the new one", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const o = { n: 5 }
  const a = o.n--
  const b = --o.n
  $out = a + "," + b + "," + o.n
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("5,3,3");
  });

  it("computed keys and array elements: `a[i]++`, `++a[0]` ([18b])", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const a = [1, 2]
  const i = 1
  a[i]++
  const p = ++a[0]
  const counts = { x: 1 }
  const key = "x"
  counts[key]++
  $out = JSON.stringify(a) + "," + p + "," + counts.x
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("[2,3],2,2");
  });

  it("nested members, and numeric strings become numbers as in JavaScript", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const s = { c: { n: 1 }, t: "5" }
  s.c.n++
  const old = s.t++
  $out = s.c.n + "," + typeof s.t + ":" + s.t + "," + typeof old + ":" + old
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("2,number:6,number:5");
  });

  it("an increment inside a callback mutates the shared object", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const counter = { n: 0 }
  const items = [1, 2, 3]
  items.forEach((x) => counter.n++)
  $out = "n=" + counter.n
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("n=3");
  });

  it("refuses prototype-reaching keys, like every other in-place write", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const o = { n: 1 }
  o.__proto__.polluted++
  o["__proto__"]++
  const k = "constructor"
  o[k]++
  o.n++
  $out = "n=" + o.n
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("n=2");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
  });

  it("a `$store` field increments reactively, like `s.n += 1` already did", async () => {
    const screen = render(`
counter = $store({
  n: 0,
  inc: (s) => { s.n++ },
})
function go() {
  counter.inc()
  counter.n++
}
$app(Column([Text(\`n=\${counter.n}\`), Button("Go", { onClick: go })]))
`);
    await flush();
    await screen.click("Go");
    await flush();
    expect(visibleText(screen)).toContain("n=2");
  });

  it("keeps the `$` behaviour: a copy-on-write write that re-renders", async () => {
    const screen = render(`
$o = { n: 0 }
$out = ""
function go() {
  $o.n++
  $out = "pre=" + ++$o.n
}
$app(Column([Text(\`n=\${$o.n}\`), Button("Go", { onClick: go })]))
`);
    await flush();
    const before = screen.state.get("o") as { n: number };
    await screen.click("Go");
    await flush();
    expect(screen.state.get("out")).toBe("pre=2");
    expect(screen.state.get("o")).toEqual({ n: 2 });
    // The previous value was replaced, not mutated in place.
    expect(before).toEqual({ n: 0 });
    expect(visibleText(screen)).toContain("n=2");
  });
});

// ===========================================================================
// R3 — `||=`, `&&=`, `??=` short-circuit (S22; probe [6q])
// ===========================================================================

describe("R3 — logical assignment short-circuits like JavaScript", () => {
  const CALLS = `
$out = ""
$calls = 0
function f() {
  $calls = $calls + 1
  return "rhs"
}
`;

  it("identifier targets: the right-hand side runs only when the target does not decide ([6q])", async () => {
    const out = await runGo(`${CALLS}
function go() {
  let a = "truthy"
  a ||= f()
  let b = 0
  b &&= f()
  let c = "set"
  c ??= f()
  let d = ""
  d ||= f()
  let e = 1
  e &&= f()
  let g = null
  g ??= f()
  $out = [a, b, c, d, e, g].join("|") + "|calls=" + $calls
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("truthy|0|set|rhs|rhs|rhs|calls=3");
  });

  it("`$state` targets", async () => {
    const screen = render(`${CALLS}
$s = "kept"
$t = null
$u = 0
function go() {
  $s ||= f()
  $t ??= f()
  $u &&= f()
}
$app(Button("Go", { onClick: go }))
`);
    await flush();
    await screen.click("Go");
    await flush();
    expect(screen.state.get("s")).toBe("kept");
    expect(screen.state.get("t")).toBe("rhs");
    expect(screen.state.get("u")).toBe(0);
    expect(screen.state.get("calls")).toBe(1);
  });

  it("member targets on a plain object: no write at all when the target decides", async () => {
    const out = await runGo(`${CALLS}
function go() {
  const o = { a: 1, b: null }
  o.a ||= f()
  o.b ??= f()
  o.c &&= f()
  $out = JSON.stringify(o) + "|has-c=" + ("c" in o) + "|calls=" + $calls
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe('{"a":1,"b":"rhs"}|has-c=false|calls=1');
  });

  it("member targets on a `$` atom: a short-circuit leaves the atom untouched", async () => {
    const screen = render(`${CALLS}
$o = { a: 1, b: null }
function go() {
  $o.a ||= f()
  $o.b &&= f()
}
$app(Button("Go", { onClick: go }))
`);
    await flush();
    const before = screen.state.get("o");
    await screen.click("Go");
    await flush();
    expect(screen.state.get("calls")).toBe(0);
    expect(screen.state.get("o")).toBe(before);
  });

  it("member targets on a `$` atom: the assignment still happens when it should", async () => {
    const screen = render(`${CALLS}
$o = { a: 1, b: null }
function go() {
  $o.b ??= f()
}
$app(Column([Text(\`b=\${$o.b}\`), Button("Go", { onClick: go })]))
`);
    await flush();
    await screen.click("Go");
    await flush();
    expect(screen.state.get("o")).toEqual({ a: 1, b: "rhs" });
    expect(screen.state.get("calls")).toBe(1);
    expect(visibleText(screen)).toContain("b=rhs");
  });

  it("the expression's value is the target when it decides, else the right-hand side", async () => {
    const out = await runGo(`${CALLS}
$s = "kept"
$t = 0
function go() {
  const keep = () => $s ||= f()
  const take = () => $t ||= f()
  $out = keep() + "," + take() + "|calls=" + $calls
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("kept,rhs|calls=1");
  });
});

// ===========================================================================
// R4 — spread of any iterable (S34; probes [12ab], [14h])
// ===========================================================================

describe("R4 — spread accepts every iterable, not only arrays and strings", () => {
  it("array literals spread Sets, Maps, their iterators and strings ([12ab])", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const s = new Set([1, 1, 2])
  const m = new Map([["a", 1], ["b", 2]])
  $out = JSON.stringify({
    set: [...s],
    mixed: [0, ...s, 3],
    map: [...m],
    entries: [...m.entries()],
    keys: [...m.keys()],
    values: [...s.values()],
    str: [..."hé"],
  })
}
$app(Button("Go", { onClick: go }))
`);
    expect(JSON.parse(String(out))).toEqual({
      set: [1, 2],
      mixed: [0, 1, 2, 3],
      map: [["a", 1], ["b", 2]],
      entries: [["a", 1], ["b", 2]],
      keys: ["a", "b"],
      values: [1, 2],
      str: ["h", "é"],
    });
  });

  it("method-call arguments ([14h])", async () => {
    const out = await runGo(`
$out = ""
function go() {
  $out = Math.max(...new Set([4, 9])) + "," + "ab".concat(...new Set(["c", "d"]))
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("9,abcd");
  });

  it("`new` arguments", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const made = new Array(...new Set(["x", "y"]))
  $out = JSON.stringify(made)
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe('["x","y"]');
  });

  it("invoke arguments: an IIFE and a function held in state", async () => {
    const out = await runGo(
      `
$out = ""
function go() {
  const sum = ((a, b) => a + b)(...new Set([1, 2]))
  $out = sum + "," + $join(...new Set(["p", "q"]))
}
$app(Button("Go", { onClick: go }))
`,
      { state: { join: (...parts: unknown[]) => parts.join("+") } },
    );
    expect(out).toBe("3,p+q");
  });

  it("generators returned by host code, in every position", async () => {
    const out = await runGo(
      `
$out = ""
function go() {
  const arr = [...$gen()]
  const max = Math.max(...$gen())
  $out = JSON.stringify(arr) + "," + max
}
$app(Button("Go", { onClick: go }))
`,
      {
        state: {
          gen: () =>
            (function* () {
              yield 3;
              yield 1;
              yield 2;
            })(),
        },
      },
    );
    expect(out).toBe("[3,1,2],3");
  });

  it("named calls also spread strings now, like every other iterable", async () => {
    const out = await runGo(`
$out = ""
function join3(a, b, c) {
  return a + "-" + b + "-" + c
}
function go() {
  $out = join3(..."xyz")
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("x-y-z");
  });

  it("global functions and hooks spread iterables too", async () => {
    const out = await runGo(`
$out = ""
function $usePair(a, b) {
  return a + "&" + b
}
function go() {
  $out = parseInt(...new Set(["42"])) + "," + $usePair(...new Set(["l", "r"]))
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("42,l&r");
  });

  it("user-component calls spread iterables; a non-iterable operand still passes through whole", async () => {
    const screen = render(`
function Pair(a, b) {
  return Text(\`pair=\${a}+\${b}\`)
}
function Card({ title }) {
  return Text(\`card=\${title}\`)
}
props = { title: "T" }
$app(Column([Pair(...new Set(["x", "y"])), Card(...props)]))
`);
    await flush();
    const text = visibleText(screen);
    expect(text).toContain("pair=x+y");
    // \`Card(...props)\` (the React \`{...props}\` habit) hands \`props\` to the
    // first parameter, exactly as before.
    expect(text).toContain("card=T");
  });

  it("still ignores a non-iterable spread operand instead of throwing (unchanged)", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const o = { a: 1 }
  $out = JSON.stringify([1, ...o, 2]) + "," + Math.max(...o, 5)
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("[1,2],5");
  });
});

// ===========================================================================
// R5 — `$arr.length = n` on an array atom (S20; probe [12aa])
// ===========================================================================

describe("R5 — assigning `length` on an array atom truncates or extends it", () => {
  function program(action: string, initial = "[1, 2, 3]"): string {
    return `
$arr = ${initial}
function go() {
  ${action}
}
$app(Column([Text(\`len=\${$arr.length}\`), Button("Go", { onClick: go })]))
`;
  }

  async function clickGo(src: string): Promise<{ screen: Screen; before: unknown }> {
    const screen = render(src);
    await flush();
    const before = screen.state.get("arr");
    await screen.click("Go");
    await flush();
    return { screen, before };
  }

  it("`$arr.length = 0` empties the array — it stays an array and the view re-renders ([12aa])", async () => {
    const { screen, before } = await clickGo(program("$arr.length = 0"));
    const after = screen.state.get("arr");
    expect(Array.isArray(after)).toBe(true);
    expect(after).toEqual([]);
    expect(visibleText(screen)).toContain("len=0");
    // Copy-on-write, like every other `$` write: the old array is untouched.
    expect(before).toEqual([1, 2, 3]);
    expect(after).not.toBe(before);
  });

  it("truncates to a shorter length", async () => {
    const { screen } = await clickGo(program("$arr.length = 1"));
    expect(screen.state.get("arr")).toEqual([1]);
    expect(visibleText(screen)).toContain("len=1");
  });

  it("extends with holes, as JavaScript does", async () => {
    const { screen } = await clickGo(program("$arr.length = 4", "[1, 2]"));
    const after = screen.state.get("arr") as unknown[];
    expect(Array.isArray(after)).toBe(true);
    expect(after.length).toBe(4);
    expect(1 in after).toBe(true);
    expect(2 in after).toBe(false);
    expect(visibleText(screen)).toContain("len=4");
  });

  it("compound assignment reads the current length", async () => {
    const { screen } = await clickGo(program("$arr.length -= 1"));
    expect(screen.state.get("arr")).toEqual([1, 2]);
  });

  it("`$arr.length++` extends the array by one", async () => {
    const { screen } = await clickGo(program("$arr.length++"));
    const after = screen.state.get("arr") as unknown[];
    expect(Array.isArray(after)).toBe(true);
    expect(after.length).toBe(4);
  });

  it("works on an array nested inside an object atom", async () => {
    const screen = render(`
$o = { items: [1, 2], label: "L" }
function go() {
  $o.items.length = 0
}
$app(Column([Text(\`items=\${$o.items.length}\`), Button("Go", { onClick: go })]))
`);
    await flush();
    await screen.click("Go");
    await flush();
    const after = screen.state.get("o") as { items: unknown; label: string };
    expect(Array.isArray(after.items)).toBe(true);
    expect(after).toEqual({ items: [], label: "L" });
    expect(visibleText(screen)).toContain("items=0");
  });

  it("refuses a length JavaScript would reject with a RangeError, leaving the array as it was", async () => {
    const { screen } = await clickGo(program("$arr.length = -1"));
    expect(screen.state.get("arr")).toEqual([1, 2, 3]);
  });
});

// ===========================================================================
// R6 — `DeclParam.publicName` (§6.3 W1, component parameters)
// ===========================================================================

describe("R6 — a renamed component parameter keeps its public name", () => {
  /** Rename every `Identifier` reference to `from` inside `node`, in place. */
  function renameIdentifiers(node: unknown, from: string, to: string): void {
    if (Array.isArray(node)) {
      for (const child of node) renameIdentifiers(child, from, to);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.kind === "Identifier" && record.name === from) record.name = to;
    for (const value of Object.values(record)) renameIdentifiers(value, from, to);
  }

  /**
   * Parse `source`, then do what the TS/JS frontend's hygienic renaming (W1)
   * will do: rename component `component`'s parameter `param` to `__l1_<param>`
   * — the declaration and every reference in its body — and record the name
   * callers use in `publicName`.
   */
  function compileRenamed(source: string, component: string, param: string): CompiledProgram {
    const program: Program = parse(source);
    expect(program.errors).toEqual([]);
    const decl = program.statements.find(
      (stmt): stmt is ComponentDeclaration => stmt.kind === "ComponentDeclaration" && stmt.name === component,
    );
    if (!decl) throw new Error(`no component ${component}`);
    const local = `__l1_${param}`;
    const params: DeclParam[] = decl.params.map((p) =>
      p.name === param ? { ...p, name: local, publicName: param } : p,
    );
    (decl as { params: ReadonlyArray<DeclParam> }).params = params;
    renameIdentifiers(decl.body, param, local);
    return { __aktionCompiled: 1, program, source: "", path: "x.aktion" };
  }

  const CARD = `
function Card(children, title) {
  return Column([Text(\`title=\${title}\`), children, Text(\`slots=\${Object.keys(slots ?? {}).join(",")}\`)])
}
$app(Column([
  Card({ title: "T" }),
  Card(Text("child"), { title: "U", footer: Text("F") }),
]))
`;

  it("binds `Card({ title })` and `Card(child, { title })` by the public name", async () => {
    const screen = renderCompiled(compileRenamed(CARD, "Card", "title"));
    await flush();
    const text = visibleText(screen);
    expect(text).toContain("title=T");
    expect(text).toContain("title=U");
    expect(text).toContain("child");
  });

  it("a named prop that matched a parameter is not also exposed as a slot", async () => {
    const screen = renderCompiled(compileRenamed(CARD, "Card", "title"));
    await flush();
    const text = visibleText(screen);
    // `footer` matched no parameter, so it is a slot; `title` bound to one.
    expect(text).toContain("slots=footer");
    expect(text).not.toMatch(/slots=[^ ]*title/);
  });

  it("does not bind the public name as a local, so it cannot leak into callees", async () => {
    // `seenTitle` reads the module-level `title`. Without `publicName` in the
    // slot logic, the named prop would ALSO be bound as a local called
    // `title`, which the dynamically-scoped call below would then see (S3).
    const screen = renderCompiled(
      compileRenamed(
        `
const title = "module"
function seenTitle() {
  return "seen=" + title
}
function Card(children, title) {
  return Column([Text(\`title=\${title}\`), Text(seenTitle())])
}
$app(Card(Text("c"), { title: "T" }))
`,
        "Card",
        "title",
      ),
    );
    await flush();
    const text = visibleText(screen);
    expect(text).toContain("title=T");
    expect(text).toContain("seen=module");
  });

  it("a named slot never overwrites a renamed parameter's local binding", async () => {
    const screen = renderCompiled(
      compileRenamed(
        `
function Card(children, title) {
  return Text(\`title=\${title}\`)
}
$app(Card(Text("c"), { title: "T", __l1_title: "slot" }))
`,
        "Card",
        "title",
      ),
    );
    await flush();
    expect(visibleText(screen)).toBe("title=T");
  });

  it("names public parameter names in the strict-mode named-props warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = document.createElement("aktion-app") as AktionApp;
    el.setAttribute("strict", "");
    document.body.appendChild(el);
    try {
      el.mountCompiled(
        compileRenamed(
          `
function Card(title) {
  return Text(\`title=\${title}\`)
}
$app(Card({ subtitle: "S" }))
`,
          "Card",
          "title",
        ),
      );
      await flush();
      const lines = warn.mock.calls.map((call) => String(call[0]));
      const line = lines.find((l) => l.includes("forwarded as a positional argument"));
      expect(line).toBeDefined();
      expect(line).toContain("parameter (title)");
      expect(line).not.toContain("__l1_");
    } finally {
      el.remove();
    }
  });

  it("the parser never sets `publicName`", () => {
    const program = parse(`function Card(title, { tone }) { return Text(title) }`);
    const decl = program.statements[0] as ComponentDeclaration;
    expect(decl.params.map((p) => "publicName" in p)).toEqual([false, false]);
  });
});

// ===========================================================================
// 8.0.6 — W3's precondition, already true: a bare `return` yields undefined
// ===========================================================================

describe("bare `return` (precondition of the W3 lowering, design doc 8.0.6)", () => {
  it("makes an action evaluate to undefined", async () => {
    const out = await runGo(`
$out = ""
function f() {
  const y = 5
  return
}
function go() {
  $out = typeof f()
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("undefined");
  });

  it("makes a lambda evaluate to undefined", async () => {
    const out = await runGo(`
$out = ""
function go() {
  const doubled = [1, 2].map((x) => {
    x * 2
    return
  })
  $out = JSON.stringify(doubled) + "," + typeof doubled[0]
}
$app(Button("Go", { onClick: go }))
`);
    expect(out).toBe("[null,null],undefined");
  });

  it("makes a component render nothing", async () => {
    const screen = render(`
function Bar() {
  const x = 5
  return
}
$app(Column([Text("a"), Bar(), Text("b")]))
`);
    await flush();
    expect(visibleText(screen)).toBe("a b");
  });
});

// ===========================================================================
// Library-component calling convention (documents the corrected comment on
// `resolveLibraryCallArgs`): extra positionals fill the next unfilled slot in
// declaration order — for Button that is `onClick`, not `variant` (V9).
// ===========================================================================

describe("library calls: a second positional fills the next slot in declaration order", () => {
  it("`Button(\"Save\", \"danger\")` does not set the variant", async () => {
    const screen = render(`$app(Button("Save", "danger"))`);
    await flush();
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-variant")).toBe("primary");
  });
});
