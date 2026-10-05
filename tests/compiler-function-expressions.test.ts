/**
 * A named function expression (`const f = function fact(n) { … fact(n - 1) }`)
 * binds its own name inside its body, as in JavaScript. The parser used to
 * drop the name, so the self-call resolved to nothing and rendered a
 * placeholder: `f(4)` was `0`, with no diagnostic, in every module language.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultFrontends } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";
import { parse } from "../src/parser/index.js";
import type { AssignmentStatement, LambdaExpr } from "../src/parser/types.js";

afterEach(() => cleanup());

const frontends = { ...defaultFrontends, typescript: createTypeScriptFrontend() };
const lines = (...l: string[]): string => l.join("\n");

/** Link `files`, click "Go", return `$out`. */
async function runGo(files: Record<string, string>, entry: string): Promise<unknown> {
  const res = await linkProject({ entry, files, frontends });
  expect(res.diagnostics.filter((d) => d.severity === "error"), entry).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
  );
  await flush();
  await screen.click("Go");
  await flush();
  return screen.state.get("out");
}

const inGo = (...body: string[]): string =>
  lines("let $out = null", "function go() {", ...body.map((l) => `  ${l}`), "}", '$app(Button("Go", { onClick: go }))');

const ENTRIES = ["app.aktion", "app.aktion.js", "app.aktion.ts"] as const;

describe("named function expressions", () => {
  it("the parser keeps the name as `selfName`", () => {
    const program = parse("const f = function fact(n) { return n }\nconst g = function (n) { return n }");
    const [f, g] = program.statements as AssignmentStatement[];
    expect((f!.expression as LambdaExpr).selfName).toBe("fact");
    expect((g!.expression as LambdaExpr).selfName).toBeUndefined();
  });

  it("can call itself", async () => {
    const src = inGo("const f = function fact(n) { return n <= 1 ? 1 : n * fact(n - 1) }", "$out = f(4)");
    for (const entry of ENTRIES) expect(await runGo({ [entry]: src }, entry), entry).toBe(24);
  });

  it("can call itself from a closure inside its body", async () => {
    const src = inGo(
      "const sum = function total(xs) {",
      "  return xs.length === 0 ? 0 : xs[0] + [xs.slice(1)].map((rest) => total(rest))[0]",
      "}",
      "$out = sum([1, 2, 3])",
    );
    for (const entry of ENTRIES) expect(await runGo({ [entry]: src }, entry), entry).toBe(6);
  });

  it("works at module level", async () => {
    const src = lines(
      "const fib = function f(n) { return n < 2 ? n : f(n - 1) + f(n - 2) }",
      "let $out = null",
      "function go() { $out = fib(10) }",
      '$app(Button("Go", { onClick: go }))',
    );
    for (const entry of ENTRIES) expect(await runGo({ [entry]: src }, entry), entry).toBe(55);
  });

  it("a parameter of the same name wins over the function's own name", async () => {
    const src = inGo("const f = function g(g) { return g }", "$out = f(7)");
    for (const entry of ENTRIES) expect(await runGo({ [entry]: src }, entry), entry).toBe(7);
  });

  it("the name is not visible outside the function (.aktion.js, .aktion.ts)", async () => {
    const src = inGo("const f = function inner() { return 1 }", "$out = [f(), typeof inner === \"function\"]");
    for (const entry of ["app.aktion.js", "app.aktion.ts"]) {
      expect(await runGo({ [entry]: src }, entry), entry).toEqual([1, false]);
    }
  });

  it("does not collide with a module-level function of the same name (.aktion.js, .aktion.ts)", async () => {
    const src = lines(
      "function fact(n) { return -1 }",
      "let $out = null",
      "function go() {",
      "  const f = function fact(n) { return n <= 1 ? 1 : n * fact(n - 1) }",
      "  $out = [f(4), fact(4)]",
      "}",
      '$app(Button("Go", { onClick: go }))',
    );
    for (const entry of ["app.aktion.js", "app.aktion.ts"]) {
      expect(await runGo({ [entry]: src }, entry), entry).toEqual([24, -1]);
    }
  });

  it("the linker does not rename the self-call to a module-level binding of the same name", async () => {
    const files = {
      "app.aktion": lines(
        'import { compute } from "./math.aktion"',
        "let $out = null",
        "function go() { $out = compute() }",
        '$app(Button("Go", { onClick: go }))',
      ),
      "math.aktion": lines(
        "function step(n) { return 100 }",
        "export function compute() {",
        "  const f = function step(n) { return n <= 0 ? 0 : n + step(n - 1) }",
        "  return f(3)",
        "}",
      ),
    };
    expect(await runGo(files, "app.aktion")).toBe(6);
  });
});
