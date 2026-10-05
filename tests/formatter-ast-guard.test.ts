/**
 * `formatProgram` only returns formatted text when it re-parses to the same
 * program as the input and keeps every comment where it was. The grammar has
 * no grouping node, so the printer restores the parentheses an expression
 * needs from a precedence table; before it did, `($a * $r) / (1 - x)` printed
 * as `$a * $r / 1 - x` and only this guard kept the program intact. The guard
 * stays as a safety net; the comment half is what still triggers on parsed
 * input, for a comment written inside an expression.
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
  it("keeps the parentheses a program needs, and drops the ones it does not", () => {
    const source = "payment = ($amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))\n";
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    expect(result.formatted).toBe("payment = $amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months))\n");
    expect(fingerprint(result.formatted)).toBe(fingerprint(source));
  });

  it.each([
    "y = (a + b) * c\n",
    'x = (html || "").trim()\n',
    "x = (a ? b : c) + 1\n",
    "x = a - (b - c)\n",
    "x = !(a && b)\n",
    "x = a || (b ? c : d)\n",
    "x = (-a) ** 2\n",
  ])("formats %j with its parentheses", (source) => {
    expect(formatProgram(source)).toEqual({ formatted: source, errors: [] });
  });

  it("groups an object literal returned from an arrow function", () => {
    const source = "rows = items.map(m => ({ role: m.role, content: m.content }))\n";
    expect(formatProgram(source)).toEqual({ formatted: source, errors: [] });
  });

  it("prints a double negation as `- -1`, not the `--` operator", () => {
    expect(printProgram(parse("x = -(-1)\n"))).toBe("x = - -1\n");
    expect(formatProgram("x = -(-1)\n")).toEqual({ formatted: "x = - -1\n", errors: [] });
  });

  it("returns the source with a warning when printing would drop or move a comment", () => {
    // Comments attach to statements; one between the properties of an object
    // literal (or the elements of an array) has none, and the printer drops it.
    for (const source of [
      "x = {\n  a: 1,\n  // between properties\n  b: 2\n}\n",
      "x = f([\n  1,\n  // between elements\n  2\n])\n",
    ]) {
      expect(printProgram(parse(source))).not.toContain("// between");
      expectSkipped(source);
      expect(formatProgram(source).warnings![0]!.message).toMatch(/drop or move a comment/);
    }
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
  it("prints `-0` as `-0`, not `0`", () => {
    for (const source of ["x = 1 / -0\n", "x = Object.is(-0, 0)\n"]) {
      expect(printProgram(parse(source))).toBe(source);
      expect(formatProgram(source)).toEqual({ formatted: source, errors: [] });
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
