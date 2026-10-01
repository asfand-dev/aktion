/**
 * Statement boundaries and unknown characters.
 *
 * Statement terminators are optional, so input that is not Aktion used to
 * parse as several unrelated statements with an empty `errors` list
 * (`class A {}`, `` tag`x` ``, `x as T`, `1n`, `a$b`, an unknown character
 * dropped by the lexer). These tests pin the contract that replaced that:
 * a statement must be followed by a newline, `;`, `}` or the end of the input
 * (unless it ends in a `}` block), and the lexer reports what it cannot lex.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { computeFrontier, parse, tokenize } from "../src/parser/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const stripLoc = (value: unknown): string =>
  JSON.stringify(value, (key, v) => (key === "loc" ? undefined : v));

const errorsOf = (source: string) => parse(source).errors;

describe("statements need a boundary — previously silent constructs now error", () => {
  const cases: Array<{ name: string; source: string; line: number; column: number; message: string }> = [
    { name: "class declaration", source: "class Foo {}\n", line: 1, column: 1, message: "`class` is not supported in Aktion" },
    { name: "class expression", source: "x = class {}\n", line: 1, column: 5, message: "`class` is not supported in Aktion" },
    { name: "tagged template (no interpolation)", source: "x = String.raw`a`\n", line: 1, column: 15, message: "Tagged template literals are not supported" },
    { name: "tagged template (interpolation)", source: "x = tag`a${b}c`\n", line: 1, column: 8, message: "Tagged template literals are not supported" },
    { name: "tagged template statement", source: "tag`x`\n", line: 1, column: 4, message: "call the function with the string instead" },
    { name: "tagged template after a call", source: "x = f()`a`\n", line: 1, column: 8, message: "Tagged template literals are not supported" },
    { name: "`as` assertion", source: "x = a as any\n", line: 1, column: 7, message: "`as` type assertions are not supported" },
    { name: "`satisfies` assertion", source: "x = a satisfies B\n", line: 1, column: 7, message: "`satisfies` type assertions are not supported" },
    { name: "`interface` declaration", source: "interface A { x: number }\n", line: 1, column: 1, message: "TypeScript `interface` declarations are not supported" },
    { name: "`type` alias", source: "type A = number\n", line: 1, column: 1, message: "TypeScript `type` declarations are not supported" },
    { name: "`enum` declaration", source: "enum E { A }\n", line: 1, column: 1, message: "TypeScript `enum` declarations are not supported" },
    { name: "`yield`", source: "yield 1\n", line: 1, column: 1, message: "`yield` is not supported in Aktion" },
    { name: "BigInt literal", source: "x = 1n\n", line: 1, column: 5, message: "BigInt literals (`1n`) are not supported" },
    { name: "`$` inside a name", source: "a$b = 1\n", line: 1, column: 2, message: "`a$b` is not a valid name" },
    { name: "trailing `$`", source: "price$ = 1\n", line: 1, column: 6, message: "`price$` is not a valid name" },
    { name: "decorator", source: "@dec\nfunction f() {}\n", line: 1, column: 1, message: "Unexpected character '@' — decorators are not supported" },
    { name: "private field", source: "x = o.#p\n", line: 1, column: 7, message: "Unexpected character '#' — private fields" },
    { name: "stray backslash", source: "x = 1 \\ 2\n", line: 1, column: 7, message: "Unexpected character '\\'" },
    { name: "non-ASCII identifier", source: "café = 1\n", line: 1, column: 4, message: "Unexpected character 'é' — names may only use" },
    { name: "emoji outside a string", source: "x = 😀\n", line: 1, column: 5, message: "Unexpected character '😀'" },
    { name: "unterminated string at end of line", source: 'x = "abc\ny = 1\n', line: 1, column: 5, message: "Unterminated string literal" },
    { name: "unterminated string at end of input", source: "x = 'abc", line: 1, column: 5, message: "Unterminated string literal" },
    { name: "unterminated template literal", source: "x = `abc\ny = 1\n", line: 1, column: 5, message: "Unterminated template literal" },
    { name: "two statements on one line", source: "a = 1 b = 2\n", line: 1, column: 7, message: "Expected end of statement after number '1', but found identifier 'b'" },
    { name: "statement after a closing paren", source: "foo(1) bar(2)\n", line: 1, column: 8, message: "Expected end of statement after ')', but found identifier 'bar'" },
    { name: "block after a call", source: "with (a) { b }\n", line: 1, column: 10, message: "Expected end of statement" },
  ];

  it.each(cases)("$name", ({ source, line, column, message }) => {
    const { errors } = parse(source);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line, column });
    expect(errors[0]!.message).toContain(message);
  });

  it("reports the offending statement inside a function body at its own line", () => {
    const { errors } = parse("function f() {\n  x = a as number\n}\n");
    expect(errors[0]).toMatchObject({ line: 2, column: 9 });
    expect(errors[0]!.message).toContain("`as` type assertions");
  });

  it("reports a boundary violation in a brace-less `if` body", () => {
    expect(errorsOf("if (a) b = 1 c = 2\n")[0]).toMatchObject({ line: 1, column: 14 });
  });

  it("reports an unknown character in expression position with the character's own message", () => {
    const { errors } = parse("x = foo(@)\n");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 1, column: 9 });
    expect(errors[0]!.message).toContain("Unexpected character '@'");
  });

  it("reports an unknown character where a property name is expected", () => {
    const { errors } = parse("x = o.@\n");
    expect(errors[0]!.message).toContain("Unexpected character '@'");
  });

  it("reports an unterminated string inside a call", () => {
    const { errors } = parse('x = Text("abc\n');
    expect(errors[0]).toMatchObject({ line: 1, column: 10 });
    expect(errors[0]!.message).toContain("Unterminated string literal");
  });
});

describe("Error tokens are reported with their own message wherever the grammar meets them", () => {
  it.each([
    ["an object key", "x = { #: 1 }\n"],
    ["a parameter", "function f(#) {}\n"],
    ["a declared name", "let # = 1\n"],
    ["an import name", 'import { # } from "./a.aktion"\n'],
    ["an import alias", 'import { a as # } from "./a.aktion"\n'],
    ["after import specifiers", "import { a } #\n"],
    ["a switch body", "function f(x) { switch (x) { # } }\n"],
    ["an effect dependency", "$effect(() => {}, [#])\n"],
    ["a property name", "x = o.#\n"],
    ["an operand", "x = (#)\n"],
  ])("%s", (_where, source) => {
    const { errors } = parse(source);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("Unexpected character '#'");
    expect(errors[0]!.message).not.toContain('got Error');
  });

  it("suggests straight quotes for curly ones", () => {
    const { errors } = parse("x = \u201Cabc\u201D\n");
    expect(errors[0]).toMatchObject({ line: 1, column: 5 });
    expect(errors[0]!.message).toContain("typographic (curly) quote; use a straight quote");
    expect(parse("x = \u2018a\u2019\n").errors[0]!.message).toContain("curly");
  });

  it("prints the code point of an invisible character", () => {
    const { errors } = parse("x = 1\u200B\n");
    expect(errors[0]).toMatchObject({ line: 1, column: 6 });
    expect(errors[0]!.message).toContain("Unexpected invisible character U+200B");
    expect(parse("x = \u00AD1\n").errors[0]!.message).toContain("U+00AD");
    expect(parse("x = 1\u0000\n").errors[0]!.message).toContain("U+0000");
  });
});

describe("statements need a boundary — recovery", () => {
  it("drops only the offending statement and parses the lines around it", () => {
    const program = parse("a = 1\nb = c as T\nd = 2\n");
    expect(program.errors).toHaveLength(1);
    expect(program.errors[0]!.line).toBe(2);
    expect(program.statements.map((s) => (s as { identifier?: string }).identifier)).toEqual(["a", "d"]);
  });

  it("reports every offending line, not just the first", () => {
    const program = parse("a = 1 as T\nb = 2\nc = tag`x`\n");
    expect(program.errors.map((e) => e.line)).toEqual([1, 3]);
    expect(program.statements.map((s) => (s as { identifier?: string }).identifier)).toEqual(["b"]);
  });

  it("recovers after a `;`-terminated offending statement", () => {
    const program = parse("a = 1 as T; b = 2\n");
    expect(program.errors).toHaveLength(1);
    expect(program.statements.map((s) => (s as { identifier?: string }).identifier)).toEqual(["b"]);
  });
});

describe("statements need a boundary — valid programs are unaffected", () => {
  const sameAs = (multiline: string, compact: string) => {
    const a = parse(multiline);
    const b = parse(compact);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(stripLoc(a.statements)).toBe(stripLoc(b.statements));
  };

  it("chained calls continue across lines", () => {
    sameAs("x = items\n  .filter(i => i.on)\n  .map(i => i.id)\n", "x = items.filter(i => i.on).map(i => i.id)\n");
  });

  it("call arguments span lines", () => {
    sameAs('root = Column([\n  Text("a"),\n  Text("b")\n])\n', 'root = Column([Text("a"), Text("b")])\n');
  });

  it("object literals span lines", () => {
    sameAs('cfg = {\n  a: 1,\n  b: { c: 2 }\n}\n', "cfg = { a: 1, b: { c: 2 } }\n");
  });

  it("arrow function bodies span lines", () => {
    sameAs(
      "function f(list) {\n  return list.map(x => {\n    y = x + 1\n    return y\n  })\n}\n",
      "function f(list) { return list.map(x => { y = x + 1; return y }) }\n",
    );
  });

  it("template literals span lines", () => {
    const program = parse("msg = `line one\nline two ${name}\nline three`\nnext = 1\n");
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(2);
  });

  it("`else` and `catch` / `finally` may start the next line", () => {
    const program = parse(
      "function f(a) {\n  if (a) {\n    return 1\n  }\n  else {\n    return 2\n  }\n}\n" +
        "function g() {\n  try {\n    risky()\n  }\n  catch (e) {\n    log(e)\n  }\n  finally {\n    done()\n  }\n}\n",
    );
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(2);
  });

  it("a ternary or logical continuation may start the next line", () => {
    sameAs("x = a\n  ? b\n  : c\ny = p\n  && q\n", "x = a ? b : c\ny = p && q\n");
  });

  it("semicolons separate statements on one line", () => {
    sameAs("a = 1; b = 2; c = 3\n", "a = 1\nb = 2\nc = 3\n");
  });

  it("a trailing semicolon, blank lines and comments are fine", () => {
    const program = parse("a = 1; // one\n\n/* two */\nb = 2;\n\n");
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(2);
  });

  it("the last statement needs no trailing newline", () => {
    expect(errorsOf("a = 1\nb = 2")).toEqual([]);
  });

  it("a statement may be followed by the `}` that closes its block on the same line", () => {
    expect(errorsOf("function f() { return 1 }\nfunction g() { a = 1; b = 2 }\n")).toEqual([]);
    expect(errorsOf("function f(a) { if (a) return 1 }\n")).toEqual([]);
  });

  it("statements that end in a block may be followed by another statement on the same line", () => {
    const program = parse(
      "function a() { return 1 } function b() { return 2 }\n" +
        "function c(x) { if (x) { y = 1 } z = 2 }\n" +
        "function d(x) { for (i of x) { f(i) } while (g()) { h() } switch (x) { case 1: return 1 } try { k() } catch (e) { m() } n() }\n",
    );
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(4);
  });

  it("`do … while (c)` may be followed by a statement on the same line, as in JS", () => {
    expect(errorsOf("function f() { do { a() } while (b()) c() }\n")).toEqual([]);
    expect(errorsOf("function f() { do { a() } while (b())\n c() }\n")).toEqual([]);
  });

  it("a block comment that spans lines counts as a line break", () => {
    const program = parse("a = 1 /* x\n y */ b = 2\n");
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(2);
    expect(errorsOf("a = 1 /* x */ b = 2\n")).toHaveLength(1);
    expect(errorsOf("a = 1 // x\n b = 2\n")).toEqual([]);
  });

  it("U+2028 and U+2029 end a statement like a newline", () => {
    for (const separator of ["\u2028", "\u2029"]) {
      const program = parse(`a = 1${separator}b = 2${separator}`);
      expect(program.errors).toEqual([]);
      expect(program.statements).toHaveLength(2);
    }
  });

  it("switch cases and brace-less bodies keep working", () => {
    const program = parse(
      "function f(x) {\n  switch (x) {\n    case 1: return 'a'\n    case 2:\n      y = 1\n      break\n    default: return 'c'\n  }\n  if (x) y = 1\n  else y = 2\n  while (y) y -= 1\n}\n",
    );
    expect(program.errors).toEqual([]);
  });

  it("imports, exports and hooks are unaffected", () => {
    const program = parse(
      'import { A, B as C } from "./a.aktion"\nexport const X = 1\nexport function Foo() { return Text("x") }\nexport let $count = 0\nfunction $useThing() { return 1 }\n',
    );
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(5);
  });

  it("newline is still a terminator, so a leading `(`, `[` or `-1` starts a new statement", () => {
    const program = parse("a = f\n(b)\nc = 1\n-1\n");
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(4);
  });

  it("names that merely look like the unsupported words are ordinary identifiers", () => {
    const program = parse("type = 1\ninterface = 2\nenum = 3\nclassName = 4\nasync_ = 5\nx = type + interface + enum\nn = 1\n");
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(7);
  });

  it("numeric forms with letters in them are one token", () => {
    expect(errorsOf("a = 0xFF\nb = 1e3\nc = 1_000\nd = -2.5\ne = .5\n")).toEqual([]);
  });

  it("string and template contents may hold any character", () => {
    expect(errorsOf('a = "café 😀 @ # \\\\"\nb = `日本語 ${a} @#`\n// comment with @ # \\ é\n')).toEqual([]);
  });

  it("Unicode spaces are whitespace, not stray characters", () => {
    expect(errorsOf("﻿a = 1 + 2\n b = 3\n")).toEqual([]);
  });
});

describe("lexer — Error tokens", () => {
  it("emits one Error token per unknown code point, with its position and message", () => {
    const tokens = tokenize("a = 😀 @");
    const errors = tokens.filter((t) => t.type === "Error");
    expect(errors.map((t) => [t.value, t.line, t.column])).toEqual([
      ["😀", 1, 5],
      ["@", 1, 8],
    ]);
    expect(errors[0]!.message).toContain("Unexpected character");
  });

  it("emits an Error token (not a String) for an unterminated string", () => {
    const tokens = tokenize('x = "abc');
    expect(tokens.map((t) => t.type)).toEqual(["Identifier", "Operator", "Error", "EOF"]);
    expect(tokens[2]).toMatchObject({ value: "abc", line: 1, column: 5 });
  });

  it("marks the token that was accepted while still open", () => {
    expect(tokenize('x = "abc', undefined, { streaming: true })[2]).toMatchObject({ type: "String", open: true });
    expect(tokenize("x = `a${b}", undefined, { streaming: true })[2]).toMatchObject({ type: "TemplateString", open: true });
    expect(tokenize('x = "abc"', undefined, { streaming: true })[2]!.open).toBeUndefined();
  });

  it("marks an interpolation-free backtick string so a tagged template can be told apart", () => {
    expect(tokenize("`a`")[0]).toMatchObject({ type: "String", value: "a", template: true });
    expect(tokenize('"a"')[0]!.template).toBeUndefined();
  });
});

describe("streaming — partial programs still parse progressively", () => {
  const PROGRAM = [
    "$count = 0",
    "label = `Count: ${$count}`",
    "function Counter() {",
    "  inc = () => { $count += 1 }",
    "  return Column([",
    '    Text("Hello, it\'s a counter"),',
    "    Button(label, { onClick: inc })",
    "  ])",
    "}",
    "aktion = Counter()",
    "",
  ].join("\n");

  it("the full program parses cleanly", () => {
    expect(errorsOf(PROGRAM)).toEqual([]);
  });

  it("every prefix ending at a top-level statement boundary is error-free", () => {
    const lines = PROGRAM.split("\n");
    const boundaries = [1, 2, 9, 10];
    for (const count of boundaries) {
      const prefix = lines.slice(0, count).join("\n");
      expect(parse(prefix).errors, prefix).toEqual([]);
    }
  });

  it("an unfinished last line never errors on an earlier, complete one", () => {
    for (let cut = 1; cut < PROGRAM.length; cut += 1) {
      const prefix = PROGRAM.slice(0, cut);
      const completeLines = prefix.split("\n").length - 1;
      const insideBlock = prefix.lastIndexOf("function Counter") !== -1 && !prefix.includes("\n}\n");
      if (insideBlock) continue;
      for (const error of parse(prefix, { streaming: true }).errors) {
        expect(error.line, `cut ${cut}: ${JSON.stringify(prefix.slice(-30))}`).toBeGreaterThan(completeLines);
      }
    }
  });

  it("the committed bindings grow as complete lines arrive", () => {
    const lines = PROGRAM.split("\n");
    const committedAfter = (count: number) => computeFrontier(lines.slice(0, count).join("\n")).committedBindings;
    expect(committedAfter(1)).toEqual(["count"]);
    expect(committedAfter(2)).toEqual(["count", "label"]);
    expect(committedAfter(9)).toEqual(["count", "label", "Counter"]);
    expect(committedAfter(10)).toEqual(["count", "label", "Counter", "aktion"]);
  });

  it("a string or template literal still open at the end of the input is accepted in streaming mode only", () => {
    for (const source of ['$title = "Hel', "$title = 'Hel", "$title = `Hel", "$body = `line one\nline two"]) {
      expect(parse(source).errors, source).toHaveLength(1);
      const streamed = parse(source, { streaming: true });
      expect(streamed.errors, source).toEqual([]);
      expect(streamed.statements, source).toHaveLength(1);
    }
    const program = parse("$body = `line one\nline ${$n} two", { streaming: true });
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(1);
  });

  it("flags a program whose open literal was accepted, and only then", () => {
    expect(parse('x = "abc', { streaming: true }).openLiteral).toBe(true);
    expect(parse("x = `a\nb", { streaming: true }).openLiteral).toBe(true);
    expect(parse('x = "abc"', { streaming: true }).openLiteral).toBeUndefined();
    expect(parse('x = "abc').openLiteral).toBeUndefined();
    expect(parse('x = "abc\ny = 1', { streaming: true }).openLiteral).toBeUndefined();
  });

  it("a string cut off by a newline is an error even in streaming mode", () => {
    const { errors } = parse('$a = "abc\n$b = 1', { streaming: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 1, column: 6 });
    expect(errors[0]!.message).toContain("Unterminated string literal");
  });

  it("every prefix of a multi-line template literal parses cleanly in streaming mode", () => {
    const source = "$n = 1\nnotes = `first line\nsecond ${$n} line\n\nlast line`\naktion = Text(notes)\n";
    for (let cut = 0; cut <= source.length; cut += 1) {
      const prefix = source.slice(0, cut);
      const inTemplate = prefix.includes("`") && !prefix.includes("last line`");
      if (!inTemplate) continue;
      expect(parse(prefix, { streaming: true }).errors, JSON.stringify(prefix)).toEqual([]);
    }
    expect(parse(source).errors).toEqual([]);
  });

  it("the frontier treats a literal still open at the end as in flight input, as it always has", () => {
    const frontier = computeFrontier('$a = 1\n$title = "Hel');
    expect(frontier.errors).toEqual([]);
    expect(frontier.committedBindings).toEqual(["a", "title"]);
  });

  it("a cut in the middle of a keyword-led statement stays a plain expression, never a hard failure", () => {
    for (const prefix of ["fun", "function", "function F", "function F(", "function F() {", "$x = tr", "$x = 1 +", "$x = a ?", "$x = `ab", "$x = 0x"]) {
      expect(() => parse(prefix), prefix).not.toThrow();
    }
  });
});

describe("streaming — <aktion-app> fed in awkward chunks", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  type StreamingApp = HTMLElement & {
    appendChunk(text: string): void;
    streaming: boolean;
    showErrors: boolean;
  };

  const SOURCE = [
    'title = "Streaming, \'quoted\' & `templated`"',
    "$n = 1",
    'body = Card([CardHeader(title), Text(`n is ${$n}`)])',
    "aktion = Stack([body])",
  ].join("\n");

  it("renders the same result as one shot, with no banner and no error event while chunks split tokens and strings", async () => {
    const el = document.createElement("aktion-app") as StreamingApp;
    document.body.appendChild(el);
    const errorEvents: Event[] = [];
    el.addEventListener("error", (event) => errorEvents.push(event));
    el.showErrors = true;
    el.streaming = true;

    for (let i = 0; i < SOURCE.length; i += 7) {
      el.appendChunk(SOURCE.slice(i, i + 7));
      for (let k = 0; k < 3; k += 1) await flush();
      const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement | null;
      expect(banner?.hidden ?? true).toBe(true);
    }
    el.streaming = false;
    for (let k = 0; k < 5; k += 1) await flush();

    expect(errorEvents).toEqual([]);
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("Streaming, 'quoted' & `templated`");

    const oneShot = document.createElement("aktion-app") as StreamingApp & { setResponse(text: string): void };
    document.body.appendChild(oneShot);
    oneShot.setResponse(SOURCE);
    for (let k = 0; k < 5; k += 1) await flush();
    const strip = (node: HTMLElement) => node.shadowRoot!.querySelector(".rui-stack")?.innerHTML;
    expect(strip(el)).toBeDefined();
    expect(strip(el)).toBe(strip(oneShot));
  });

  it("shows a multi-line template literal growing while it streams, then reports one that never closes", async () => {
    const el = document.createElement("aktion-app") as StreamingApp & { setResponse(text: string): void };
    document.body.appendChild(el);
    el.showErrors = true;
    el.streaming = true;
    el.appendChunk("aktion = Text(notes)\nnotes = `first line\nsecond");
    for (let k = 0; k < 5; k += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);
    expect(el.shadowRoot!.textContent).toContain("second");
    el.appendChunk(" line and more");
    for (let k = 0; k < 5; k += 1) await flush();
    expect(el.shadowRoot!.textContent).toContain("second line and more");

    el.streaming = false;
    for (let k = 0; k < 5; k += 1) await flush();
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("Unterminated template literal");
  });

  it("surfaces a boundary violation once streaming ends", async () => {
    const el = document.createElement("aktion-app") as StreamingApp & { setResponse(text: string): void };
    document.body.appendChild(el);
    el.showErrors = true;
    el.streaming = true;
    el.setResponse("aktion = Text(x) as T");
    for (let k = 0; k < 5; k += 1) await flush();
    const banner = el.shadowRoot!.querySelector(".rui-error-banner") as HTMLElement;
    expect(banner.hidden).toBe(true);
    el.streaming = false;
    for (let k = 0; k < 5; k += 1) await flush();
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("`as` type assertions are not supported");
  });
});
