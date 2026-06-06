import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import { StateStore, createContext, planProgram, evaluate } from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

function evalExpr(src: string): unknown {
  const program = parse(`__r = ${src}`);
  expect(program.errors).toEqual([]);
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  planProgram(program, ctx);
  const stmt = program.statements.find((s) => s.kind === "Assignment");
  // @ts-ignore
  return evaluate(stmt!.expression, ctx);
}

describe("JS number literals", () => {
  it("scientific notation", () => {
    expect(evalExpr("1e6")).toBe(1e6);
    expect(evalExpr("1.5e3")).toBe(1500);
    expect(evalExpr("1e-6")).toBe(1e-6);
    expect(evalExpr("2E10")).toBe(2e10);
    expect(evalExpr("1.5e+2")).toBe(150);
  });
  it("the reported failing case", () => {
    expect(evalExpr("Math.round(1234567.891 * 1e6) / 1e6")).toBe(1234567.891);
  });
  it("hex / binary / octal", () => {
    expect(evalExpr("0xFF")).toBe(255);
    expect(evalExpr("0b1010")).toBe(10);
    expect(evalExpr("0o17")).toBe(15);
    expect(evalExpr("0xDEAD_BEEF")).toBe(0xDEADBEEF);
  });
  it("numeric separators", () => {
    expect(evalExpr("1_000_000")).toBe(1000000);
    expect(evalExpr("1_234.567_8")).toBeCloseTo(1234.5678, 5);
  });
  it("leading decimal point", () => {
    expect(evalExpr("(.5)")).toBe(0.5);
  });
  it("still parses plain + negative + decimal", () => {
    expect(evalExpr("42")).toBe(42);
    expect(evalExpr("3.14")).toBe(3.14);
    expect(evalExpr("(-5)")).toBe(-5);
  });
  it("does not break member access or subtraction", () => {
    expect(evalExpr("100 - 1")).toBe(99);
    expect(evalExpr("[1,2,3].length")).toBe(3);
  });
});
