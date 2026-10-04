/**
 * The JS-semantics lowering passes W1–W4 (`src/compiler/js-semantics.ts`,
 * `aktion-in-typescript.md` §6.3), tested by BEHAVIOUR: each program is
 * compiled as a `.aktion.js` module, run by the real evaluator, and asserted to
 * produce what a JavaScript engine produces for the same code. The fixtures are
 * the Appendix D probes; every one of them gives a different (Aktion) answer
 * when the same text is linked as `.aktion` — the "control" assertions pin that,
 * so a test cannot pass because the divergence went away on its own.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, renderCompiled, type Screen } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject, type LinkProjectResult } from "../src/compiler/index.js";
import {
  lowerJavaScriptSemantics,
  normalizeComponentForms,
  localBindingBaseName,
} from "../src/compiler/js-semantics.js";
import { parse } from "../src/parser/index.js";
import type { ComponentDeclaration, Program, Statement } from "../src/parser/types.js";

afterEach(() => cleanup());

async function link(files: Record<string, string>, entry: string): Promise<LinkProjectResult> {
  return linkProject({ entry, files });
}

async function mount(files: Record<string, string>, entry: string): Promise<Screen> {
  const res = await link(files, entry);
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
  );
  await flush();
  return screen;
}

/** Mount `src` as module `entry`, click "Go" `clicks` times, return `$out`. */
async function runGo(src: string, entry = "app.aktion.js", clicks = 1): Promise<unknown> {
  const screen = await mount({ [entry]: src }, entry);
  for (let i = 0; i < clicks; i += 1) {
    await screen.click("Go");
    await flush();
  }
  return screen.state.get("out");
}

/** The same program as `.aktion` (control: the divergence the rewrite fixes). */
const runAsAktion = (src: string, clicks = 1): Promise<unknown> => runGo(src, "app.aktion", clicks);

const labels = (screen: Screen): string =>
  [...screen.shadowRoot.querySelectorAll("button")].map((b) => b.textContent?.trim()).join(" , ");

describe("W1 — hygienic local names", () => {
  it("S1: a block's `let x` does not leak out of the block ([1a])", async () => {
    const src = [
      'let $out = ""',
      "function go() {",
      "  let x = 1",
      "  if (true) {",
      "    let x = 2",
      "  }",
      '  $out = "x=" + x',
      "}",
      '$app(Button("Go", { onClick: go }))',
    ].join("\n");
    expect(await runGo(src)).toBe("x=1");
    expect(await runAsAktion(src)).toBe("x=2");
  });

  it("S2: a function-local `let total` shadows the module binding instead of overwriting it ([1v])", async () => {
    const src = [
      "const total = 10",
      'let $out = ""',
      "function go() {",
      "  let total = 99",
      '  $out = "inside=" + total',
      "}",
      "function check() {",
      '  $out = $out + ",module=" + total',
      "}",
      '$app(Button("Go", { onClick: () => { go(); check() } }))',
    ].join("\n");
    expect(await runGo(src)).toBe("inside=99,module=10");
    expect(await runAsAktion(src)).toBe("inside=99,module=99");
  });

  it("S3: a helper reads the module binding, not its caller's local ([13a])", async () => {
    const src = [
      'const label = "module"',
      'let $out = ""',
      "function fmt(v) {",
      '  return label + ":" + v',
      "}",
      "function go() {",
      '  const label = "callerLocal"',
      "  $out = fmt(1)",
      "}",
      '$app(Button("Go", { onClick: go }))',
    ].join("\n");
    expect(await runGo(src)).toBe("module:1");
    expect(await runAsAktion(src)).toBe("callerLocal:1");
  });

  it("S4: a parameter wins over a top-level function of the same name in call position ([11f])", async () => {
    const src = [
      'let $out = ""',
      "function save(x) {",
      '  return "top-save:" + x',
      "}",
      "function runIt(save) {",
      "  return save(5)",
      "}",
      "function go() {",
      '  $out = runIt((x) => "param:" + x)',
      "}",
      '$app(Button("Go", { onClick: go }))',
    ].join("\n");
    expect(await runGo(src)).toBe("param:5");
    expect(await runAsAktion(src)).toBe("top-save:5");
  });

  it("renames locals but keeps object shorthand keys and destructured source keys", async () => {
    const src = [
      'let $out = ""',
      "function go() {",
      '  const title = "T"',
      "  const card = { title }",
      '  const { title: t, sub = "S" } = card',
      "  const { title: again } = { title: t }",
      '  $out = card.title + t + sub + again',
      "}",
      '$app(Button("Go", { onClick: go }))',
    ].join("\n");
    expect(await runGo(src)).toBe("TTST");
  });

  it("pins `sourceKey` on a renamed object-pattern slot so it still reads its property", async () => {
    const src = [
      'let $out = ""',
      "function go() {",
      '  const { title, count } = { title: "T", count: 2 }',
      "  for (const { id } of [{ id: 7 }]) {",
      '    $out = title + count + id',
      "  }",
      "}",
      '$app(Button("Go", { onClick: go }))',
    ].join("\n");
    expect(await runGo(src)).toBe("T27");
  });

  it("a renamed component parameter still binds named props and positional arguments (R6)", async () => {
    const files = {
      "app.aktion": [
        'import { Card } from "./card.aktion.js"',
        '$app(Column([Card({ title: "Named" }), Card("Positional", "sub")]))',
      ].join("\n"),
      "card.aktion.js": [
        'export function Card(title, subtitle = "-") {',
        '  return Text(title + "/" + subtitle)',
        "}",
      ].join("\n"),
    };
    const screen = await mount(files, "app.aktion");
    const text = screen.shadowRoot.textContent ?? "";
    expect(text).toContain("Named/-");
    expect(text).toContain("Positional/sub");
  });

  it("a `.aktion.js` component's parameter does not collide with an entry binding of the same name", async () => {
    // Without W1 + R6 the dependency's `Row(format)` call resolved `format` to
    // the ENTRY's action (entry names stay canonical in the linked program).
    const files = {
      "app.aktion": [
        'import { Row } from "./row.aktion.js"',
        'function format(v) { return "entry:" + v }',
        '$app(Row((v) => "param:" + v))',
      ].join("\n"),
      "row.aktion.js": [
        "export function Row(format) {",
        '  return Text(format("x"))',
        "}",
      ].join("\n"),
    };
    const screen = await mount(files, "app.aktion");
    expect(screen.shadowRoot.textContent).toContain("param:x");
  });

  it("does not rename `$` atoms, module-level names or free identifiers", () => {
    const program = lowerJavaScriptSemantics(
      parse(
        [
          "let $count = 0",
          "const limit = 3",
          "function bump(step) {",
          "  const next = $count + step",
          "  if (next <= limit) $count = next",
          "  console.log(Math.max(next, limit))",
          "}",
        ].join("\n"),
      ),
    );
    const json = JSON.stringify(program);
    expect(json).toContain('"identifier":"count","isState":true');
    expect(json).toContain('"name":"limit"');
    expect(json).toContain('"name":"console"');
    expect(json).toContain('"name":"Math"');
    expect(json).toMatch(/"name":"__l\d+_step"/);
    expect(json).toMatch(/"identifier":"__l\d+_next"/);
    expect(json).not.toMatch(/"name":"step"/);
  });

  it("demangles a W1 name", () => {
    expect(localBindingBaseName("__l12_total")).toBe("total");
    expect(localBindingBaseName("__a3_total")).toBeNull();
    expect(localBindingBaseName("total")).toBeNull();
  });
});

describe("W2 — nested functions become `const` lambdas in place", () => {
  it("S8: a nested function called later from `onClick` keeps working ([12ad])", async () => {
    const src = [
      'let $out = ""',
      "function Counter() {",
      "  function inc() {",
      '    $out = $out + "+"',
      "  }",
      '  return Button("Go", { onClick: () => inc() })',
      "}",
      "$app(Counter())",
    ].join("\n");
    expect(await runGo(src, "app.aktion.js", 2)).toBe("++");
    expect(await runAsAktion(src, 2)).not.toBe("++");
  });

  it("sees the locals declared above it (in place, never hoisted)", async () => {
    const src = [
      'let $out = ""',
      "function Counter() {",
      "  const step = 2",
      "  function inc() {",
      "    $out = $out + step",
      "  }",
      '  return Button("Go", { onClick: () => inc() })',
      "}",
      "$app(Counter())",
    ].join("\n");
    expect(await runGo(src)).toBe("2");
  });

  it("rewrites the declaration into a `const` lambda at the same position, keeping its loc", () => {
    const program = lowerJavaScriptSemantics(
      parse(["function Outer() {", "  const a = 1", "  function inner(x) { return x + a }", "  return inner(1)", "}"].join("\n")),
    );
    const body = (program.statements[0] as ComponentDeclaration).body.body;
    expect(body.map((s) => s.kind)).toEqual(["Assignment", "Assignment", "Return"]);
    const lifted = body[1] as Statement & { kind: "Assignment" };
    expect(lifted.declaration).toBe("const");
    expect(lifted.identifier).toMatch(/^__l\d+_inner$/);
    expect(lifted.expression.kind).toBe("Lambda");
    expect(lifted.loc).toEqual({ line: 3, column: 3 });
  });
});

describe("W3 — an explicit `return` ends every function body", () => {
  it("S24: a block-bodied arrow without `return` yields undefined ([8a])", async () => {
    const src = [
      'let $out = ""',
      "function go() {",
      "  $out = JSON.stringify([1, 2].map((x) => { x * 2 }))",
      "}",
      '$app(Button("Go", { onClick: go }))',
    ].join("\n");
    expect(await runGo(src)).toBe("[null,null]");
    expect(await runAsAktion(src)).toBe("[2,4]");
  });

  it("a function without `return` evaluates to undefined", async () => {
    const src = [
      'let $out = ""',
      "function f() {",
      "  const y = 5",
      "}",
      "function go() {",
      "  $out = typeof f()",
      "}",
      '$app(Button("Go", { onClick: go }))',
    ].join("\n");
    expect(await runGo(src)).toBe("undefined");
  });

  it("a component without `return` renders nothing", async () => {
    const src = ["function Bar() {", "  const x = 5", "}", '$app(Column([Text("a"), Bar(), Text("b")]))'].join("\n");
    const screen = await mount({ "app.aktion.js": src }, "app.aktion.js");
    expect(screen.shadowRoot.textContent).not.toContain("5");
  });

  it("the synthetic `return` has no loc, and effect bodies are left alone", () => {
    const program = lowerJavaScriptSemantics(
      parse(["function f() {", "  const y = 5", "}", '$effect(() => { console.log("x") }, ["mount"])'].join("\n")),
    );
    const fn = program.statements[0] as Statement & { kind: "ActionDeclaration" };
    const last = fn.body.body[fn.body.body.length - 1]!;
    expect(last).toEqual({ kind: "Return" });
    const effect = program.statements[1] as Statement & { kind: "EffectDeclaration" };
    expect(effect.body.body.map((s) => s.kind)).toEqual(["ExpressionStatement"]);
  });
});

describe("W4 — PascalCase arrow constants are components", () => {
  it("S25: an arrow component's hooks keep per-instance state ([4e,4f])", async () => {
    const src = [
      "const Counter = (label) => {",
      "  const [n, setN] = $state(0)",
      '  return Button(label + ":" + n, { onClick: () => setN(n + 1) })',
      "}",
      '$app(Column([Counter("A"), Counter("B")]))',
    ].join("\n");
    const screen = await mount({ "app.aktion.js": src }, "app.aktion.js");
    (screen.shadowRoot.querySelector("button") as HTMLButtonElement).click();
    await flush();
    expect(labels(screen)).toBe("A:1 , B:0");
  });

  it("an expression-bodied arrow becomes `{ return expr }`, keeping export and loc", () => {
    const program: Program = normalizeComponentForms(parse("export const Badge = (t) => Text(t)"));
    const decl = program.statements[0] as ComponentDeclaration;
    expect(decl.kind).toBe("ComponentDeclaration");
    expect(decl.name).toBe("Badge");
    expect(decl.exported).toBe(true);
    expect(decl.loc).toEqual({ line: 1, column: 8 });
    expect(decl.body.body.map((s) => s.kind)).toEqual(["Return"]);
  });

  it("leaves camelCase arrows, `let` and nested arrows alone", () => {
    const src = "const helper = (x) => x\nlet Later = (x) => x\nfunction Outer() { const Inner = () => 1; return Inner() }";
    const program = normalizeComponentForms(parse(src));
    expect(program.statements.map((s) => s.kind)).toEqual(["Assignment", "Assignment", "ComponentDeclaration"]);
  });

  it("returns the same program object when nothing converts", () => {
    const program = parse("const x = 1");
    expect(normalizeComponentForms(program)).toBe(program);
  });
});
