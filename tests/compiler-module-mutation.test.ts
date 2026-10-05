/**
 * E107 at module top level: changing a module-level binding IN PLACE after it
 * was built (`xs.push(2)`, `byId[k] = v` in a top-level loop, `cfg.mode = …`,
 * `m.set(…)`, `Object.assign(o, …)`). Aktion rebuilds a module-level binding
 * from its initializer on every render, so the change never reaches the
 * program — the behaviour tests below measure that on the `.aktion` control,
 * which keeps the DSL meaning. In `.aktion.js` / `.aktion.ts` it is rejected,
 * exactly like the top-level reassignment `n = 1` already was.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultFrontends, javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

afterEach(() => cleanup());

const lines = (...l: string[]): string => l.join("\n");
const typescript = createTypeScriptFrontend();

/** `code@line:column` for every diagnostic of the `.aktion.js` frontend. */
function diagnose(src: string): string[] {
  const out = javascriptFrontend.compile(src, "/app/m.aktion.js");
  return [
    ...out.program.errors.map((e) => `PARSE@${e.line}:${e.column}`),
    ...out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`),
  ];
}

/** The same for `.aktion.ts`. */
function diagnoseTs(src: string): string[] {
  const out = typescript.compile(src, "/app/m.aktion.ts");
  return [
    ...out.program.errors.map((e) => `PARSE@${e.line}:${e.column}`),
    ...out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`),
  ];
}

/** Wrap a top-level preamble so a click on "Go" stores `expr` in `$out`. */
const program = (pre: string, expr: string): string =>
  lines('let $out = ""', pre, `function go() { $out = ${expr} }`, '$app(Button("Go", { onClick: go }))');

async function runAsAktion(src: string): Promise<unknown> {
  const res = await linkProject({ entry: "app.aktion", files: { "app.aktion": src }, frontends: defaultFrontends });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion" }),
  );
  await flush();
  await screen.click("Go");
  await flush();
  return screen.state.get("out");
}

const CASES: Array<{ name: string; pre: string; expr: string; at: string; dropped: unknown }> = [
  { name: "a mutating array method", pre: "const xs = [1]\nxs.push(2)", expr: "xs", at: "E107@3:4", dropped: [1] },
  {
    name: "a computed-key write in a top-level loop",
    pre: 'const items = [{ id: "a", v: 1 }]\nconst byId = {}\nfor (const it of items) byId[it.id] = it.v',
    expr: "byId",
    at: "E107@4:37",
    dropped: {},
  },
  { name: "a property write", pre: 'const cfg = {}\ncfg.mode = "dark"', expr: "cfg", at: "E107@3:10", dropped: {} },
  { name: "a collection method on a `new` value", pre: 'const m = new Map()\nm.set("a", 1)', expr: 'm.get("a")', at: "E107@3:3", dropped: undefined },
  { name: "`Object.assign` on the binding", pre: "const o = {}\nObject.assign(o, { a: 1 })", expr: "o", at: "E107@3:8", dropped: {} },
  { name: "`delete` through a path", pre: "const o = { a: 1 }\ndelete o.a", expr: "o", at: "E107@3:1", dropped: { a: 1 } },
];

describe("E107 — a module-level binding changed in place at module top level", () => {
  for (const c of CASES) {
    it(`${c.name}: is rejected in .aktion.js and .aktion.ts`, () => {
      const src = program(c.pre, c.expr);
      expect(diagnose(src)).toEqual([c.at]);
      expect(diagnoseTs(src)).toEqual([c.at]);
    });

    it(`${c.name}: is really lost at runtime (the .aktion control)`, async () => {
      expect(await runAsAktion(program(c.pre, c.expr))).toEqual(c.dropped);
    });
  }

  it("says to build the value in its initializer", () => {
    const out = javascriptFrontend.compile(program("const xs = [1]\nxs.push(2)", "xs"), "/app/m.aktion.js");
    expect(out.diagnostics[0]!.message).toBe(
      "Module-level `xs` is changed in place after it was built, but Aktion rebuilds module-level bindings from " +
        "their initializer on every render, so the change is lost. Build the whole value in the initializer " +
        "(`const xs = [1, 2]`, `Object.fromEntries(items.map((it) => [it.id, it]))`, `new Map([[key, value]])`), " +
        "or keep data that changes in a state atom (`let $xs = …`).",
    );
  });

  it("an imported binding changed in place at module top level", () => {
    expect(diagnose(lines('import { list } from "./data.aktion"', "list.push(1)"))).toEqual(["E107@2:6"]);
  });

  it("accepts building the value in its initializer, and changes of local values", () => {
    const src = lines(
      'const items = [{ id: "a", v: 1 }]',
      "const xs = [1, 2]",
      "const byId = Object.fromEntries(items.map((it) => [it.id, it.v]))",
      'const m = new Map([["a", 1]])',
      "const api = makeApi()",
      "api.delete(1)",
      "const copy = Object.assign({}, byId, { b: 2 })",
      "function build() {",
      "  const local = []",
      "  local.push(1)",
      "  Object.assign(local, { extra: true })",
      "  return local",
      "}",
    );
    expect(diagnose(src)).toEqual([]);
  });

  it("a shadowed `Object` is not `Object.assign`", () => {
    const src = lines("const Object = { assign: (a, b) => b }", "const o = {}", "Object.assign(o, { a: 1 })");
    expect(diagnose(src).filter((d) => d.startsWith("E107"))).toEqual([]);
  });

  it("`Object.assign` on a data atom is E108", () => {
    const src = lines("let $cfg = {}", "function set() {", "  Object.assign($cfg, { a: 1 })", "}");
    expect(diagnose(src)).toEqual(["E108@3:10"]);
  });
});
