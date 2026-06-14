/**
 * Regex literal support (issue #6 from issues-to-fix.md).
 *
 * `/pattern/flags` used to be a parse error; authors had to fall back to
 * `new RegExp("…")`. The lexer now recognises regex literals in operand
 * position and the parser desugars them to `new RegExp(pattern, flags)`,
 * while a `/` after a value stays division.
 *
 * NB: backslashes are doubled in the source so the Aktion lexer — not the
 * TypeScript compiler — sees the escape.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  createContext,
  planProgram,
  type EvaluationContext,
} from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

function runHarness(src: string): { state: StateStore; ctx: EvaluationContext } {
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error(`Unexpected parse errors:\n${program.errors.map((e) => `  ${e.message}`).join("\n")}`);
  }
  planProgram(program, ctx);
  return { state, ctx };
}

describe("#6 regex literals", () => {
  it("parses `/pattern/` without errors", () => {
    expect(parse("x = /s$/").errors).toEqual([]);
    expect(parse('x = "cats".replace(/s$/, "")').errors).toEqual([]);
  });

  it("desugars a regex literal to a working RegExp", () => {
    const { ctx } = runHarness(`
      $matched = /\\d+/.test("abc123")
      $noMatch = /^\\d+$/.test("abc")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("matched")).toBe(true);
    expect(ctx.state.get("noMatch")).toBe(false);
  });

  it("honours flags (global replace)", () => {
    const { ctx } = runHarness(`
      $out = "cats and dogs".replace(/s/g, "z")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("out")).toBe("catz and dogz");
  });

  it("strips a trailing plural with /s$/", () => {
    const { ctx } = runHarness(`
      $singular = "tokens".replace(/s$/, "")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("singular")).toBe("token");
  });

  it("still treats `/` after a value as division", () => {
    const { ctx } = runHarness(`
      $half = 10 / 2
      $alsoHalf = (8) / 4
      aktion = Text("ok")
    `);
    expect(ctx.state.get("half")).toBe(5);
    expect(ctx.state.get("alsoHalf")).toBe(2);
  });

  it("supports character classes containing `/`", () => {
    const { ctx } = runHarness(`
      $clean = "a/b/c".replace(/[/]/g, "-")
      aktion = Text("ok")
    `);
    expect(ctx.state.get("clean")).toBe("a-b-c");
  });

  it("produces a real RegExp instance", () => {
    const { ctx } = runHarness(`
      $isRegex = /x/ instanceof RegExp
      aktion = Text("ok")
    `);
    expect(ctx.state.get("isRegex")).toBe(true);
  });
});
