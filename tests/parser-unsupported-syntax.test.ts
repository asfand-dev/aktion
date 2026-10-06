/**
 * Input that is not Aktion must either parse or fail with a message that names
 * the replacement. These tables pin the cases that used to be accepted in
 * silence (`this`, `super`, `debugger`) or to fail with a misleading message
 * (block statements, `export { … }`). See issue #23.
 */

import { describe, expect, it } from "vitest";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { parse } from "../src/parser/index.js";

const lines = (...l: string[]): string => l.join("\n");

interface ErrorRow {
  name: string;
  source: string;
  line: number;
  column: number;
  message: RegExp;
}

describe("`this`, `super` and `debugger` are parse errors that say what to do", () => {
  const rows: ErrorRow[] = [
    { name: "this.x", source: "a = this.x\n", line: 1, column: 5, message: /^`this` is not supported in Aktion.*Pass the value as a parameter/ },
    { name: "const a = this", source: "const a = this\n", line: 1, column: 11, message: /^`this` is not supported/ },
    { name: "this in a function body", source: lines("function f() {", "  return this.x", "}"), line: 2, column: 10, message: /^`this` is not supported/ },
    { name: "this as a call argument", source: "f(this)\n", line: 1, column: 3, message: /^`this` is not supported/ },
    { name: "this in a template interpolation", source: "t = `a${this.x}`\n", line: 1, column: 9, message: /^`this` is not supported/ },
    { name: "this as a statement", source: "this.x = 1\n", line: 1, column: 1, message: /^`this` is not supported/ },
    { name: "this in an arrow body", source: "f = () => this.x\n", line: 1, column: 11, message: /^`this` is not supported/ },
    { name: "super.foo()", source: lines("function f() {", "  super.foo()", "}"), line: 2, column: 3, message: /^`super` is not supported in Aktion.*no classes/ },
    { name: "super(1)", source: "super(1)\n", line: 1, column: 1, message: /^`super` is not supported/ },
    { name: "debugger", source: "debugger\n", line: 1, column: 1, message: /^`debugger` is not supported in Aktion.*\$console\.log/ },
    { name: "debugger in a function body", source: lines("function f() {", "  debugger", "}"), line: 2, column: 3, message: /^`debugger` is not supported/ },
    { name: "debugger;", source: "debugger;\n", line: 1, column: 1, message: /^`debugger` is not supported/ },
  ];

  it.each(rows)("$name", ({ source, line, column, message }) => {
    const [first] = parse(source).errors;
    expect(first).toBeDefined();
    expect(first).toMatchObject({ line, column });
    expect(first!.message).toMatch(message);
  });

  const accepted: Array<[string, string]> = [
    ["a property named this", "a = o.this\n"],
    ["a property named super", "a = o.super\n"],
    ["a property named debugger", "a = o.debugger\n"],
    ["an object key named this", "o = { this: 1, super: 2, debugger: 3 }\n"],
    ["a destructured key named this", "const { this: x } = o\n"],
    ["a longer name that starts with this", "thisValue = 1\nsuperb = thisValue\ndebuggerOn = true\n"],
    ["a state atom named $this", "let $this = 1\n"],
    ["the words inside strings", "a = 'this super debugger'\nb = `this ${a}`\n"],
    ["Object.prototype member names", "a = constructor\nb = toString\nc = hasOwnProperty\n"],
  ];

  it.each(accepted)("still parses %s", (_name, source) => {
    expect(parse(source).errors).toEqual([]);
  });

  it("`allowThis` parses `this` as an identifier but still rejects `super` and `debugger`", () => {
    expect(parse("a = this.x\nb = `${this.y}`\n", { allowThis: true }).errors).toEqual([]);
    expect(parse("super.foo()\n", { allowThis: true }).errors[0]!.message).toMatch(/^`super`/);
    expect(parse("debugger\n", { allowThis: true }).errors[0]!.message).toMatch(/^`debugger`/);
  });

  it("a `.aktion.js` module still reports `this` as E103, without losing the enclosing function", () => {
    const out = javascriptFrontend.compile(
      lines("function f() {", "  var x = 1", "  return this.x", "}"),
      "/src/m.aktion.js",
    );
    expect(out.program.errors).toEqual([]);
    expect(out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["E104@2:3", "E103@3:10"]);
  });
});

describe("a block statement is rejected for what it is", () => {
  const BLOCK = /^Aktion has no block statements or block scoping.*(Hoist the body|a `case X:` body needs none)/;

  const rows: Array<Omit<ErrorRow, "message">> = [
    { name: "a bare block at the top level", source: lines("{", "  const y = 2", "}"), line: 1, column: 1 },
    { name: "a bare block in a function", source: lines("function g() {", "  {", "    const y = 2", "  }", "}"), line: 2, column: 3 },
    {
      name: "`case X: { … }` (no-case-declarations' fix)",
      source: lines("function g(x) {", "  switch (x) {", "    case 1: {", "      const y = 2", "      return y", "    }", "  }", "}"),
      line: 3,
      column: 13,
    },
    { name: "`case X: { return 1 }` on one line", source: lines("function g(x) {", "  switch (x) {", "    case 1: { return 1 }", "  }", "}"), line: 3, column: 13 },
    { name: "`default: { … }`", source: lines("function g(x) {", "  switch (x) {", "    default: {", "      go()", "    }", "  }", "}"), line: 3, column: 14 },
    { name: "a block inside an `if` body", source: lines("if (a) {", "  { let z = 1 }", "}"), line: 2, column: 3 },
    { name: "a block of calls", source: lines("function g() {", "  { a(); b() }", "}"), line: 2, column: 3 },
  ];

  it.each(rows)("$name", ({ source, line, column }) => {
    const [first] = parse(source).errors;
    expect(first).toMatchObject({ line, column });
    expect(first!.message).toMatch(BLOCK);
    expect(first!.message).not.toContain("Expected Punctuation");
  });

  it("reports the block once: its own closing brace is not a second error", () => {
    const errors = parse(lines("{", "  const y = 2", "}", "z = 1")).errors;
    expect(errors).toHaveLength(1);
  });

  it.each([
    ["an object literal with a shorthand key", "function g() {\n  { a }\n}\n"],
    ["an object literal with entries", "{ a: 1, b: 2 }\n"],
    ["a parenthesised object", "({ a: 1 })\n"],
    ["an arrow function body", "f = () => {\n  const x = 1\n  return x\n}\n"],
    ["an if / else body", "if (a) {\n  const x = 1\n} else {\n  const y = 2\n}\n"],
    ["a switch with plain case bodies", "switch (x) {\n  case 1:\n    const y = 2\n    break\n  default:\n    go()\n}\n"],
  ])("still parses %s", (_name, source) => {
    expect(parse(source).errors).toEqual([]);
  });

  it("`statementBlocks` still reads the block, for the JS frontends' E113", () => {
    const program = parse(lines("function g() {", "  {", "    const y = 2", "  }", "}"), { statementBlocks: true });
    expect(program.errors).toEqual([]);
  });
});

describe("`export { … }` names the declared form", () => {
  const rows: Array<[string, string]> = [
    ["a list", "export { a, b }\n"],
    ["a list with a source", 'export { a } from "./x"\n'],
    ["an aliased list", "export { a as b }\n"],
  ];

  it.each(rows)("%s", (_name, source) => {
    const [first] = parse(source).errors;
    expect(first).toMatchObject({ line: 1, column: 8 });
    expect(first!.message).toContain("re-export lists");
    expect(first!.message).toContain("export let $count = 0");
    expect(first!.message).toContain("export const NAME = …");
    expect(first!.message).not.toContain("export $count = 0");
  });

  it("`export * from` keeps its own message", () => {
    expect(parse('export * from "./x"\n').errors[0]!.message).toContain("`export * from …` is not supported");
  });
});
