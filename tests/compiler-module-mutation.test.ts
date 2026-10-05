/**
 * E107 at module top level: changing a module-level binding IN PLACE after it
 * was built (`xs.push(2)`, `byId[k] = v` in a top-level loop, `cfg.mode = …`,
 * `m.set(…)`, `Object.assign(o, …)`). Aktion rebuilds a module-level binding
 * from its initializer on every render, so when the initializer builds a fresh
 * value the change never reaches the program — the behaviour tests below
 * measure that on the `.aktion` control, which keeps the DSL meaning. In
 * `.aktion.js` / `.aktion.ts` it is rejected, exactly like the top-level
 * reassignment `n = 1` already was.
 *
 * An initializer that hands back the same object on every render — a
 * `$store` / `$form` / `$query` handle, or a host object read through a global
 * (`document.documentElement`) — keeps the change, at top level and inside a
 * function alike, so neither is E107 (measured on the same control).
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

/**
 * Run `src` as `.aktion` and return `$out` after clicking each button in
 * `clicks`, then "Go" twice — so at least one render has rebuilt every
 * module-level binding before the value is read. `fetch` answers `$query`.
 */
async function runAsAktion(src: string, clicks: string[] = []): Promise<unknown> {
  const res = await linkProject({ entry: "app.aktion", files: { "app.aktion": src }, frontends: defaultFrontends });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: "app.aktion" }),
    { fetch: () => ({ json: [] }) },
  );
  await flush();
  for (const label of [...clicks, "Go", "Go"]) {
    await screen.click(label);
    await flush();
  }
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

/**
 * `pre` declares `function bump()`; a "Bump" click runs it and re-renders
 * (`$n` changes) before "Go" stores `expr` in `$out`.
 */
const inAction = (pre: string, expr: string): string =>
  lines(
    'let $out = ""',
    "let $n = 0",
    pre,
    `function go() { $out = ${expr} }`,
    '$app(Column([Text(String($n)), Button("Bump", { onClick: () => { bump(); $n = $n + 1 } }), Button("Go", { onClick: go })]))',
  );

const KEPT: Array<{ name: string; pre: string; expr: string; kept: unknown }> = [
  { name: "a `$store` handle", pre: "const s = $store({ count: 1 })\ns.count = 5", expr: "s.count", kept: 5 },
  { name: "a `$store` handle's list", pre: "const s = $store({ items: [] })\ns.items = [1, 2]", expr: "s.items.length", kept: 2 },
  { name: "a `$form` handle", pre: 'const f = $form({ values: { name: "" } })\nf.values.name = "x"', expr: "f.values.name", kept: "x" },
  { name: "a `$query` handle", pre: 'const q = $query({ url: "/items" })\nq.tag = "t"', expr: "q.tag", kept: "t" },
  {
    name: "a `document.documentElement` alias",
    pre: 'const root = document.documentElement\nroot.dataset.rcx = "1"',
    expr: "root.dataset.rcx",
    kept: "1",
  },
];

const KEPT_IN_ACTION: Array<{ name: string; pre: string; expr: string; kept: unknown }> = [
  { name: "a `$store` handle", pre: "const s = $store({ count: 1 })\nfunction bump() { s.count = 5 }", expr: "s.count", kept: 5 },
  {
    name: "a `$form` handle",
    pre: 'const f = $form({ values: { name: "" } })\nfunction bump() { f.values.name = "y" }',
    expr: "f.values.name",
    kept: "y",
  },
  {
    name: "a `document.documentElement` alias",
    pre: 'const root = document.documentElement\nfunction bump() { root.dataset.rcy = "2" }',
    expr: "root.dataset.rcy",
    kept: "2",
  },
];

describe("E107 — not for a binding whose initializer hands back the same object", () => {
  for (const c of KEPT) {
    it(`${c.name} changed at module top level: is accepted in .aktion.js and .aktion.ts`, () => {
      const src = program(c.pre, c.expr);
      expect(diagnose(src)).toEqual([]);
      expect(diagnoseTs(src)).toEqual([]);
    });

    it(`${c.name} changed at module top level: the change persists (the .aktion control)`, async () => {
      expect(await runAsAktion(program(c.pre, c.expr))).toEqual(c.kept);
    });
  }

  for (const c of KEPT_IN_ACTION) {
    it(`${c.name} changed in an action: is accepted in .aktion.js and .aktion.ts`, () => {
      const src = inAction(c.pre, c.expr);
      expect(diagnose(src)).toEqual([]);
      expect(diagnoseTs(src)).toEqual([]);
    });

    it(`${c.name} changed in an action: the change persists across a render (the .aktion control)`, async () => {
      expect(await runAsAktion(inAction(c.pre, c.expr), ["Bump"])).toEqual(c.kept);
    });
  }

  it("a `$http` handle is rebuilt on every render, so changing it stays E107", async () => {
    const top = program('const r = $http({ url: "/items" })\nr.tag = "t"', "r.tag");
    expect(diagnose(top)).toEqual(["E107@3:7"]);
    expect(await runAsAktion(top)).toBe(undefined);
    const action = inAction('const r = $http({ url: "/items" })\nfunction bump() { r.tag = "z" }', "r.tag");
    expect(diagnose(action)).toEqual(["E107@4:25"]);
    expect(await runAsAktion(action, ["Bump"])).toBe(undefined);
  });

  it("control: a fresh object changed in an action is lost across a render", async () => {
    const src = inAction("const o = {}\nfunction bump() { o.k = 3 }", "o.k");
    expect(diagnose(src)).toEqual(["E107@4:23"]);
    expect(await runAsAktion(src, ["Bump"])).toBe(undefined);
  });

  it("a global shadowed by a module binding, a computed key and an injected name are still E107", () => {
    expect(diagnose(lines("const document = {}", "const root = document", 'root.tag = "t"'))).toEqual(["E107@3:10"]);
    expect(diagnose(lines("const key = \"app\"", "const w = window[key]", 'w.tag = "t"'))).toEqual(["E107@3:7"]);
    expect(diagnose(lines("const r = route", 'r.tag = "t"'))).toEqual(["E107@2:7"]);
  });

  it("a user `$store` that shadows the runtime's is not a cached handle", () => {
    const src = lines('import { $store } from "./mine.aktion"', "const s = $store({})", "s.x = 1");
    expect(diagnose(src)).toEqual(["E107@3:5"]);
  });

  it("a parameter named like the global does not change what the module binding reads", () => {
    const src = lines("const root = document.documentElement", "function f(document) {", '  root.tag = "t"', "}");
    expect(diagnose(src)).toEqual([]);
  });
});
