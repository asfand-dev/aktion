/**
 * Block statements in `.aktion.js` / `.aktion.ts` modules get one E113 at the
 * `{`. Aktion reads a statement-position `{` as an object literal, so a real
 * block (`{ const x = 1 }`, ESLint's `case 2: { … }`) used to fail inside the
 * object-literal grammar: an "Expected ':'" at some inner token followed by a
 * cascade of "Unexpected token }". The JavaScript frontends now parse such a
 * `{` as a block (`ParseOptions.statementBlocks`) and the checker rejects it;
 * `.aktion` keeps its own reading.
 */

import { describe, expect, it } from "vitest";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";
import { parse } from "../src/parser/index.js";
import type { ExpressionStatement } from "../src/parser/types.js";

const typescript = createTypeScriptFrontend();
const lines = (...l: string[]): string => l.join("\n");

/** `code@line:column` for every problem, in `.aktion.js` and `.aktion.ts` (they must agree). */
function problems(src: string): string[] {
  const collect = (out: ReturnType<typeof javascriptFrontend.compile>): string[] => [
    ...out.program.errors.map((e) => `PARSE@${e.line}:${e.column}`),
    ...out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`),
  ];
  const js = collect(javascriptFrontend.compile(src, "/src/m.aktion.js"));
  expect(collect(typescript.compile(src, "/src/m.aktion.ts"))).toEqual(js);
  return js;
}

describe("E113 — block statements", () => {
  it("a bare block with a declaration", () => {
    expect(problems(lines("let $out = 0", "function go() {", "  {", "    const x = 1", "    $out = x", "  }", "}"))).toEqual([
      "E113@3:3",
    ]);
  });

  it("`case X: { … }`, the form ESLint's no-case-declarations asks for", () => {
    const src = lines(
      "let $out = 0",
      "function go(x) {",
      "  switch (x) {",
      "    case 2: {",
      "      const y = x * 2",
      "      $out = y",
      "      break",
      "    }",
      "    default:",
      "      $out = 0",
      "  }",
      "}",
    );
    expect(problems(src)).toEqual(["E113@4:13"]);
  });

  it("a block holding a call, a state write only, and a top-level block", () => {
    expect(problems(lines("function go() {", "  {", "    console.log(1)", "  }", "}"))).toEqual(["E113@2:3"]);
    expect(problems(lines("let $out = 0", "function go() {", "  { $out = 1 }", "}"))).toEqual(["E113@3:3"]);
    expect(problems(lines("{", "  const x = 1", "}"))).toEqual(["E113@1:1"]);
  });

  it("an object literal in statement position is still E113 (unchanged)", () => {
    expect(problems(lines("function go() {", "  { a }", "}"))).toEqual(["E113@2:3"]);
  });

  it("an error inside a block is reported where it is, not as E113", () => {
    const out = javascriptFrontend.compile(lines("function go() {", "  {", "    const x = ", "  }", "}"), "/src/m.aktion.js");
    expect(out.program.errors[0]).toMatchObject({ line: 3, column: 15 });
    expect(out.diagnostics.map((d) => d.code)).not.toContain("E113");
  });

  it("`statementBlocks` parses the block as an ExpressionStatement holding a Block", () => {
    const program = parse(lines("{", "  const x = 1", "}"), { statementBlocks: true });
    expect(program.errors).toEqual([]);
    const stmt = program.statements[0] as ExpressionStatement;
    expect(stmt.kind).toBe("ExpressionStatement");
    expect(stmt.expression.kind).toBe("Block");
    expect(stmt.loc).toEqual({ line: 1, column: 1 });
  });

  it("`.aktion` keeps reading a statement-position `{` as an object literal, and says why a block is not one", () => {
    const program = parse(lines("function go() {", "  {", "    const x = 1", "  }", "}"));
    expect(program.errors[0]).toMatchObject({ line: 2, column: 3 });
    expect(program.errors[0]!.message).toMatch(/^Aktion has no block statements or block scoping/);
  });
});
