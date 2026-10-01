/**
 * `formatProgram` only returns formatted text when it re-parses to the same
 * program as the input. The printer is not precedence-aware, so without this
 * guard it could silently change what a program means — e.g.
 * `($a * $r) / (1 - x)` printed as `$a * $r / 1 - x`.
 */
import { describe, expect, it } from "vitest";
import { formatProgram, printProgram, structuralFingerprint } from "../src/tooling/formatter.js";
import { parse } from "../src/parser/index.js";

const fingerprint = (source: string): string => {
  const program = parse(source);
  expect(program.errors).toEqual([]);
  return structuralFingerprint(program);
};

function expectSkipped(source: string): void {
  const result = formatProgram(source);
  expect(result.errors).toEqual([]);
  expect(result.formatted).toBe(source);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings![0]).toEqual({
    message: expect.stringMatching(/^Formatting skipped: /),
    line: 1,
    column: 1,
  });
}

describe("formatProgram — AST-equality guard", () => {
  it("returns the source unchanged, with a warning, when printing would drop needed parentheses", () => {
    const source = "payment = ($amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))\n";
    const printed = printProgram(parse(source));
    expect(parse(printed).errors).toEqual([]);
    expect(printed).not.toBe(source);
    expectSkipped(source);
    expect(formatProgram(source).warnings![0]!.message).toMatch(/not parse to the same program/);
  });

  it.each([
    "y = (a + b) * c\n",
    'x = (html || "").trim()\n',
    "x = (a ? b : c) + 1\n",
    "x = a - (b - c)\n",
  ])("keeps %j untouched because the printer would drop its parentheses", (source) => {
    expectSkipped(source);
  });

  it("returns the source with a warning when the printed text does not re-parse", () => {
    // The printer drops the parentheses around an object literal returned from an arrow function.
    const source = "rows = items.map(m => ({ role: m.role, content: m.content }))\n";
    expect(parse(printProgram(parse(source))).errors.length).toBeGreaterThan(0);
    expectSkipped(source);
    expect(formatProgram(source).warnings![0]!.message).toMatch(/did not re-parse/);
  });

  it("returns the source with a warning when a double negation prints as `--`", () => {
    const source = "x = -(-1)\n";
    expect(printProgram(parse(source))).toBe("x = --1\n");
    expectSkipped(source);
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
    const source = '$n = 0\n\n\n\n$effect(() => {\n  $n = $n + 1\n}, ["mount"])\n';
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

  it("reports no warning for parse errors, which keep their own channel", () => {
    const result = formatProgram("x = = 1\n");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings).toBeUndefined();
  });
});

describe("formatProgram — numbers that JSON cannot tell apart", () => {
  it("refuses to print `-0` as `0`", () => {
    for (const source of ["x = 1 / -0\n", "x = Object.is(-0, 0)\n"]) {
      expect(printProgram(parse(source))).not.toContain("-0");
      expectSkipped(source);
    }
  });

  it("fingerprints -0 and 0 differently", () => {
    expect(fingerprint("x = -0\n")).not.toBe(fingerprint("x = 0\n"));
  });

  it("fingerprints an Infinity literal apart from null", () => {
    expect(fingerprint("x = 1e999\n")).not.toBe(fingerprint("x = null\n"));
  });
});

describe("structuralFingerprint", () => {
  it("tells apart let, const, var and no keyword on a declaration", () => {
    const prints = ["let x = 1", "const x = 1", "var x = 1", "x = 1"].map(fingerprint);
    expect(new Set(prints).size).toBe(4);
  });

  it("tells apart the keyword on a destructuring declaration", () => {
    expect(fingerprint("let [a, b] = [1, 2]")).not.toBe(fingerprint("const [a, b] = [1, 2]"));
  });

  it("tells apart const from let on a for-of / for-in head, and counts a missing keyword as let", () => {
    expect(fingerprint("for (const x of [1]) {\n  x\n}")).not.toBe(fingerprint("for (let x of [1]) {\n  x\n}"));
    expect(fingerprint("for (const k in {}) {\n  k\n}")).not.toBe(fingerprint("for (let k in {}) {\n  k\n}"));
    expect(fingerprint("for (x of [1]) {\n  x\n}")).toBe(fingerprint("for (let x of [1]) {\n  x\n}"));
  });

  it("ignores positions and comments", () => {
    expect(fingerprint("x = 1\n// note\ny = 2\n")).toBe(fingerprint("\n\n   x = 1\n\n\ny =    2 // later\n"));
  });

  it("normalises the position-derived effect name, and only that", () => {
    const effect = (pad: string) => `${pad}$effect(() => {\n  $n = 1\n}, ["mount"])\n`;
    expect(fingerprint(effect(""))).toBe(fingerprint(effect("\n\n\n")));
    expect(fingerprint('x = "__effect_L1_C1"\n')).not.toBe(fingerprint('x = "__effect_L2_C2"\n'));
  });

  it("is sensitive to operand order and to grouping", () => {
    expect(fingerprint("x = a - b")).not.toBe(fingerprint("x = b - a"));
    expect(fingerprint("x = (a + b) * c")).not.toBe(fingerprint("x = a + b * c"));
  });
});

describe("printProgram — switch cases keep exactly the `break`s they had", () => {
  it("does not append `break` to a case that ends in `return`", () => {
    const source = 'switch (n) {\n  case 1:\n    return "one"\n  default:\n    return "many"\n}\n';
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe(source);
  });

  it("does not turn an empty fall-through case into a separate one", () => {
    const source = 'switch (n) {\n  case 1:\n  case 2:\n    log("small")\n    break\n  default:\n    log("big")\n}\n';
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe(source);
  });

  it("does not turn a non-empty fall-through case into a separate one", () => {
    const source = 'switch (n) {\n  case 1:\n    log("one")\n  case 2:\n    log("one or two")\n    break\n}\n';
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe(source);
  });

  it("keeps `break`, `continue` and `throw` where they were written", () => {
    const source = 'for (const n of [1]) {\n  switch (n) {\n    case 1:\n      continue\n    case 2:\n      throw "two"\n    case 3:\n      break\n  }\n}\n';
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe(source);
  });
});
