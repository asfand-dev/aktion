/**
 * Relational operators coerce operands via `valueOf` / `Symbol.toPrimitive`
 * like JavaScript (issue #3 from issues-to-fix.md).
 *
 * Before the fix, `<`/`>`/`<=`/`>=` ran both operands through a numeric coerce
 * that returned 0 for any object, so `new Date(future) > new Date()` was always
 * `false`. These guards pin the JS-correct behaviour.
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

describe("#3 relational operators coerce Date via valueOf", () => {
  it("compares two Date objects by their timestamp", () => {
    const { ctx } = runHarness(`
      $past   = new Date("2000-01-01T00:00:00Z")
      $future = new Date("2030-01-01T00:00:00Z")
      $isFutureAfter = $future > $past
      $isPastBefore  = $past < $future
      $futureNotBefore = $future <= $past
      aktion = Text("ok")
    `);
    expect(ctx.state.get("isFutureAfter")).toBe(true);
    expect(ctx.state.get("isPastBefore")).toBe(true);
    expect(ctx.state.get("futureNotBefore")).toBe(false);
  });

  it("an 'is it expired' check evaluates correctly", () => {
    const { ctx } = runHarness(`
      $expiry = new Date("2000-06-01T00:00:00Z")
      $reference = new Date("2020-01-01T00:00:00Z")
      $expired = $expiry < $reference
      aktion = Text("ok")
    `);
    expect(ctx.state.get("expired")).toBe(true);
  });

  it("preserves the runtime's numeric-coercion rule for strings", () => {
    // The runtime intentionally coerces comparison operands numerically, so
    // numeric strings still compare by value (not lexicographically).
    const { ctx } = runHarness(`
      $a = "5" < "10"
      $b = "20" > "9"
      aktion = Text("ok")
    `);
    expect(ctx.state.get("a")).toBe(true);
    expect(ctx.state.get("b")).toBe(true);
  });

  it("still compares numbers numerically", () => {
    const { ctx } = runHarness(`
      $a = 10 > 9
      $b = 2 >= 2
      $c = 1 < 0
      aktion = Text("ok")
    `);
    expect(ctx.state.get("a")).toBe(true);
    expect(ctx.state.get("b")).toBe(true);
    expect(ctx.state.get("c")).toBe(false);
  });
});
