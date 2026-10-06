/**
 * Destructuring reads what JavaScript reads (`resolvePatternBindings`): an
 * array pattern takes any iterable, an object pattern reads properties of any
 * non-null value (arrays and boxed primitives included), and a default sees
 * the leaves bound before it. Each case runs as `.aktion`, `.aktion.js` and
 * `.aktion.ts` — the evaluator is shared, so all three must agree with
 * JavaScript. The names no DSL read may reach (`constructor`, `__proto__`,
 * `prototype`) stay unreachable through a pattern too.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultFrontends } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

afterEach(() => cleanup());

const frontends = { ...defaultFrontends, typescript: createTypeScriptFrontend() };
const ENTRIES = ["app.aktion", "app.aktion.js", "app.aktion.ts"] as const;

/** Run `body` inside `go()` (with `pre` above it) as `entry`, click "Go", return `$out`. */
async function run(entry: string, body: string, pre = ""): Promise<unknown> {
  const src = [`let $out = ""`, pre, "function go() {", body, "}", '$app(Button("Go", { onClick: go }))'].join("\n");
  const res = await linkProject({ entry, files: { [entry]: src }, frontends });
  expect(res.diagnostics.filter((d) => d.severity === "error"), entry).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
  );
  await flush();
  await screen.click("Go");
  await flush();
  return screen.state.get("out");
}

async function expectEverywhere(body: string, expected: unknown, pre = ""): Promise<void> {
  for (const entry of ENTRIES) expect(await run(entry, body, pre), entry).toEqual(expected);
}

describe("object patterns read any non-null value", () => {
  it("`length` of an array and of a string", async () => {
    await expectEverywhere("  const { length } = [1, 2, 3]\n  $out = length", 3);
    await expectEverywhere('  const { length } = "abcd"\n  $out = length', 4);
  });

  it("a numeric key of an array", async () => {
    await expectEverywhere("  const { 0: first, 1: second } = [9, 8]\n  $out = [first, second]", [9, 8]);
  });

  it("a destructured parameter that receives an array", async () => {
    await expectEverywhere("  $out = count([1, 2])", 2, "function count({ length }) { return length }");
  });

  it("object rest of an array keeps its indices", async () => {
    await expectEverywhere('  const { 0: a, ...rest } = ["x", "y"]\n  $out = rest', { 1: "y" });
  });
});

describe("array patterns read any iterable", () => {
  it("a string", async () => {
    await expectEverywhere('  const [a, b] = "xy"\n  $out = [a, b]', ["x", "y"]);
    await expectEverywhere('  const [h, ...t] = "abc"\n  $out = [h, t]', ["a", ["b", "c"]]);
  });

  it("a Set and a Map", async () => {
    await expectEverywhere("  const [first] = new Set([7, 8])\n  $out = first", 7);
    await expectEverywhere('  const [[k, v]] = new Map([["a", 1]])\n  $out = [k, v]', ["a", 1]);
  });

  it("a loop head over Map entries", async () => {
    await expectEverywhere(
      '  const seen = []\n  for (const [k, v] of new Map([["a", 1], ["b", 2]])) seen.push(k + v)\n  $out = seen',
      ["a1", "b2"],
    );
  });
});

describe("defaults see the leaves bound before them", () => {
  it("in an object pattern and an array pattern", async () => {
    await expectEverywhere("  const { a, b = a + 1 } = { a: 1 }\n  $out = [a, b]", [1, 2]);
    await expectEverywhere("  const [x, y = x * 2] = [3]\n  $out = [x, y]", [3, 6]);
  });

  it("across a nested pattern", async () => {
    await expectEverywhere("  const { a, inner: { c = a } } = { a: 5, inner: {} }\n  $out = [a, c]", [5, 5]);
  });

  it("in a destructured function parameter, and after an earlier parameter", async () => {
    await expectEverywhere("  $out = f({ a: 1 })", [1, 2], "function f({ a, b = a + 1 }) { return [a, b] }");
    await expectEverywhere("  const g = (a, { b = a }) => [a, b]\n  $out = g(4, {})", [4, 4]);
  });

  it("in a loop head", async () => {
    await expectEverywhere('  const out = []\n  for (const [k, v = k] of [["x"]]) out.push([k, v])\n  $out = out', [["x", "x"]]);
  });

  it("a default does not leak its sibling into the enclosing scope", async () => {
    await expectEverywhere(
      '  const a = "outer"\n  const r = (() => { const { a: inner, b = inner } = { a: "in" }; return b })()\n  $out = [a, r]',
      ["outer", "in"],
    );
  });

  it("in a destructured component parameter", async () => {
    const src = [
      'function Card({ title, sub = title + "!" }) {',
      "  return Text(sub)",
      "}",
      '$app(Column([Card({ title: "T" })]))',
    ].join("\n");
    for (const entry of ENTRIES) {
      const res = await linkProject({ entry, files: { [entry]: src }, frontends });
      const screen = renderCompiled(
        defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
      );
      await flush();
      expect(screen.shadowRoot.querySelector(".rui-text")?.textContent, entry).toBe("T!");
    }
  });
});

describe("patterns never reach the forbidden property names", () => {
  it("`constructor` of a function, a string and an object reads undefined", async () => {
    await expectEverywhere("  const { constructor: C } = () => 1\n  $out = typeof C", "undefined");
    await expectEverywhere('  const { constructor: C } = "x"\n  $out = typeof C', "undefined");
    await expectEverywhere("  const { constructor: { constructor: F } = {} } = {}\n  $out = typeof F", "undefined");
  });

  it("`__proto__` and `prototype` read undefined", async () => {
    await expectEverywhere("  const { __proto__: p } = {}\n  $out = typeof p", "undefined");
    await expectEverywhere("  const { prototype: p } = Object\n  $out = typeof p", "undefined");
  });

  it("object rest skips them", async () => {
    await expectEverywhere(
      '  const { ...rest } = JSON.parse(\'{"__proto__": {"polluted": 1}, "a": 1}\')\n  $out = [Object.keys(rest), rest.polluted === undefined]',
      [["a"], true],
    );
  });
});
