/**
 * A line that starts with `(`, `[` or a template literal after a statement
 * without a terminator is continued by JavaScript (`f⏎(1)` is `f(1)`) but is a
 * new statement in Aktion. Both read it without an error, so the validator warns
 * instead. See issue #23.
 */

import { describe, expect, it } from "vitest";
import { defaultLibrary } from "../src/library/index.js";
import { parse } from "../src/parser/index.js";
import { getDiagnostics, getLintWarnings } from "../src/tooling/index.js";

describe("continuation-line: a line that starts with `(`, `[` or a template literal after an unterminated statement is a warning", () => {
  const warn = (source: string) => getLintWarnings(source).filter((w) => w.message.startsWith("This line starts with"));

  const flagged: Array<[string, string, number, number]> = [
    ["a call", "f\n(1)\n", 2, 1],
    ["an index", "f\n[1]\n", 2, 1],
    ["after a blank line", "f\n\n(1)\n", 3, 1],
    ["after a comment line", "f\n// note\n(1)\n", 3, 1],
    ["after a call", "f(a)\n(1)\n", 2, 1],
    ["after an index", "a[0]\n[1].forEach(g)\n", 2, 1],
    ["after a declaration", "const x = foo\n(1)\n", 2, 1],
    ["after a number", "const x = 1\n[1].map(f)\n", 2, 1],
    ["after a state atom", "$count\n(1)\n", 2, 1],
    ["after a string", "const s = 'a'\n[1].map(f)\n", 2, 1],
    ["an IIFE", "const x = 1\n(() => go())()\n", 2, 1],
    ["inside a function body", "function f() {\n  go()\n  (1)\n}\n", 3, 3],
    ["inside a case body", "switch (x) {\n  case 1:\n    go()\n    [a, b].forEach(g)\n}\n", 4, 5],
    ["after a return value", "function f() {\n  return a\n  (x)\n}\n", 3, 3],
    ["after a throw value", "function f() {\n  throw e\n  (x)\n}\n", 3, 3],
    ["after an await", "function f() {\n  await g\n  (x)\n}\n", 3, 3],
    ["after an effect", "$effect(() => go(), [])\n(1)\n", 2, 1],
    ["after a brace-less `if` body", "if (c) x\n(y)\n", 2, 1],
    ["after a brace-less `for` body", "for (const a of b) go(a)\n[1].map(f)\n", 2, 1],
    ["after a function expression (an IIFE in JavaScript)", "x = function () {}\n(g)\n", 2, 1],
    ["after an object literal", "const o = {}\n(1)\n", 2, 1],
    ["a template literal (a tagged template in JavaScript)", "f\n`x`\n", 2, 1],
    ["a template literal with a substitution", "f\n`a${b}`\n", 2, 1],
  ];

  it.each(flagged)("%s", (_name, source, line, column) => {
    const found = warn(source);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line, column, severity: "warning" });
    expect(found[0]!.message).toContain("`;`");
  });

  it("names the tag when the line starts with a template literal", () => {
    expect(warn("f\n`x`\n")[0]!.message).toContain("its tag");
  });

  const clean: Array<[string, string]> = [
    ["a `;` ends the statement", "f;\n(1)\n"],
    ["a `;` on the next line's predecessor", "const x = 1;\n[1].map(f)\n"],
    ["a comment after the `;`", "f; // note\n(1)\n"],
    ["both on one line", "f(1)\n"],
    ["a `(` that continues on the same line", "f(\n  1\n)\n"],
    ["an `if` body on the next line", "if (c)\n  (f)()\n"],
    ["a `while` body on the next line", "while (c)\n  [a].forEach(g)\n"],
    ["a block before the line", "if (c) {\n}\n(1)\n"],
    ["a `for` block before the line", "for (const a of b) {\n}\n[1].map(f)\n"],
    ["a function declaration before the line", "function f() {}\n(1)\n"],
    ["an arrow function's block body before the line", "const f = () => {}\n(g)\n"],
    ["a `do … while` (JavaScript always terminates it)", "do {\n} while (a)\n(1)\n"],
    ["an `import` (a kind that never continues)", 'import { a } from "./x"\n(1)\n'],
    ["an assignment operator before the line", "a +=\n  (1)\n"],
    ["a postfix update before the line", "a++\n(1)\n"],
    ["a keyword before the line", "function f() {\n  return\n  (1)\n}\n"],
    ["a line that starts with another token", "f\ng(1)\n"],
    ["a `(` inside a call's argument list", "f(\n  a,\n  (b)\n)\n"],
    ["a state declaration followed by an assignment", "let $a = 1\n$a = 2\n"],
  ];

  it.each(clean)("does not flag: %s", (_name, source) => {
    expect(warn(source)).toEqual([]);
  });

  it("is reported by getDiagnostics next to the parse and schema findings, as a warning", () => {
    const found = getDiagnostics("f\n(1)\n", defaultLibrary).filter((d) => d.severity === "warning");
    expect(found.map((d) => `${d.line}:${d.column}`)).toEqual(["2:1"]);
  });

  it("does not change how the text parses", () => {
    expect(parse("f\n(1)\n").statements).toHaveLength(2);
    expect(parse("f\n[1]\n").statements).toHaveLength(2);
    expect(parse("f\n`x`\n").statements).toHaveLength(2);
  });

  it("finds every pair in a long file", () => {
    const source = Array.from({ length: 8000 }, (_, i) => `a${i}\n(${i})`).join("\n");
    expect(warn(source)).toHaveLength(8000);
  });
});
