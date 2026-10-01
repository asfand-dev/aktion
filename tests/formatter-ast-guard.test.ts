/**
 * `formatProgram` only returns formatted text when it re-parses to the same
 * program as the input. The printer is not precedence-aware, so without this
 * guard it could silently change what a program means — e.g.
 * `($a * $r) / (1 - x)` printed as `$a * $r / 1 - x`.
 */
import { describe, expect, it } from "vitest";
import { formatProgram, printProgram } from "../src/tooling/formatter.js";
import { parse } from "../src/parser/index.js";

describe("formatProgram — AST-equality guard", () => {
  it("returns the source unchanged, with a warning, when printing would drop needed parentheses", () => {
    const source = "payment = ($amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))\n";
    expect(parse(printProgram(parse(source))).errors).toEqual([]);
    expect(printProgram(parse(source))).not.toBe(source);

    const result = formatProgram(source);
    expect(result.formatted).toBe(source);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(/not parse to the same program/);
  });

  it("keeps a source untouched when a sum is grouped under a product", () => {
    const source = "y = (a + b) * c\n";
    const result = formatProgram(source);
    expect(result.formatted).toBe(source);
    expect(result.warnings).toHaveLength(1);
  });

  it("keeps a source untouched when a grouped `||` is the target of a member call", () => {
    const source = 'x = (html || "").trim()\n';
    const result = formatProgram(source);
    expect(result.formatted).toBe(source);
    expect(result.warnings).toHaveLength(1);
  });

  it("keeps a source untouched when a ternary is the left operand of a binary operator", () => {
    const source = "x = (a ? b : c) + 1\n";
    const result = formatProgram(source);
    expect(result.formatted).toBe(source);
    expect(result.warnings).toHaveLength(1);
  });

  it("does not let the printer's forced `break` turn an empty fall-through case into a separate one", () => {
    const source = 'switch (n) {\n  case 1:\n  case 2:\n    log("small")\n    break\n}\n';
    const result = formatProgram(source);
    expect(result.formatted).toBe(source);
    expect(result.warnings).toHaveLength(1);
  });

  it("still formats a pure reformat", () => {
    const messy = "function  f( a,b ){const  x=a+b\nreturn   x*2}\n";
    const result = formatProgram(messy);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe("function f(a, b) {\n  const x = a + b\n  return x * 2\n}\n");
  });

  it("still formats when explicit parentheses are redundant", () => {
    const result = formatProgram("x = (a * b) + c\n");
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe("x = a * b + c\n");
  });

  it("is not thrown off by position-derived effect names when lines move", () => {
    const source = "$n = 0\n\n\n\n$effect(() => {\n  $n = $n + 1\n}, [\"mount\"])\n";
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).not.toBe(source);
    expect(result.formatted).toContain("$effect(");
  });

  it("is not thrown off by comments moving or being re-indented", () => {
    const source = "function f() {\n        // note\n  return 1 // trailing\n}\n";
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe("function f() {\n  // note\n  return 1 // trailing\n}\n");
  });

  it("formats a for-of head written without a keyword (printed with `let`) without a warning", () => {
    const result = formatProgram("for (x of [1, 2]) {\n  x\n}\n");
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe("for (let x of [1, 2]) {\n  x\n}\n");
  });

  it("does not forgive a changed declaration keyword on an assignment", () => {
    const withKeyword = parse("const x = 1\n");
    const withoutKeyword = parse("x = 1\n");
    expect(printProgram(withKeyword)).toBe("const x = 1\n");
    expect(printProgram(withoutKeyword)).toBe("x = 1\n");
  });

  it("reports no warning for parse errors, which keep their own channel", () => {
    const result = formatProgram("x = = 1\n");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings).toBeUndefined();
  });
});
