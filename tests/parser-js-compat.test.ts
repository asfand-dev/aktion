/**
 * Parser widening for JavaScript idioms and the line layouts TypeScript,
 * Prettier and XO produce (design: `aktion-in-typescript.md` §8.0.2, §8.0.5,
 * Appendix A).
 *
 * `*.aktion.ts` / `*.aktion.js` modules reach this parser after their types are
 * blanked out with spaces, so it has to accept what idiomatic, formatter-wrapped
 * JavaScript looks like — and reject what it cannot support with a message that
 * says what to write instead. The Appendix A battery below pins the outcome of
 * every construct the design measured; rows the widening changed carry the new
 * outcome.
 */

import { describe, expect, it } from "vitest";
import {
  computeFrontier,
  MODULE_LOCAL_SYMBOL,
  parse,
  tokenize,
  type Program,
  type Statement,
} from "../src/parser/index.js";
import {
  moduleLocalBaseName as parserModuleLocalBaseName,
  moduleLocalSymbol as parserModuleLocalSymbol,
} from "../src/parser/module-symbols.js";
import {
  createMemoryResolver,
  linkProgram,
  moduleLocalBaseName,
  moduleLocalSymbol,
} from "../src/compiler/index.js";
import { formatProgram, printProgram, structuralFingerprint } from "../src/tooling/formatter.js";

/** The AST without positions or comments. */
const shape = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, v) =>
    key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments" ? undefined : v));

const statementsOf = (source: string): unknown => shape(parse(source).statements);

const errorsOf = (source: string) => parse(source).errors;

/** True when `program` prints to text that parses back to the same tree. */
const roundTrips = (program: Program): boolean =>
  structuralFingerprint(parse(printProgram(program))) === structuralFingerprint(program);

const VOID_0 = { kind: "Unary", operator: "void", argument: { kind: "Literal", value: 0 } };

// ---------------------------------------------------------------------------
// Appendix A battery
// ---------------------------------------------------------------------------

type Outcome = { ok: true } | { error: string; line?: number; column?: number };

interface Row {
  construct: string;
  source: string;
  outcome: Outcome;
  /** Optional extra check on a program that parsed. */
  check?: (program: Program) => void;
}

const ok: Outcome = { ok: true };
const err = (error: string, line?: number, column?: number): Outcome => ({ error, line, column });

const BATTERY: Row[] = [
  // --- unchanged: already parsed ---------------------------------------------
  { construct: "export let/const, `$` atoms", source: "export let $count = 0\nexport const total = 1\nconst $local = 0\n", outcome: ok },
  { construct: "member / computed / compound assignment", source: "$obj.x = 2\na[0] = 1\nf().x = 1\n$count += 1\nx ??= 1\nx **= 2\n", outcome: ok },
  { construct: "postfix / prefix update", source: "$count++\n++x\n", outcome: ok },
  {
    construct: "export async function (async dropped)",
    source: "export async function load() {}\n",
    outcome: ok,
    check: (p) => expect(p.statements[0]).toMatchObject({ kind: "ActionDeclaration", name: "load", exported: true }),
  },
  {
    construct: "hook / component / action by first character",
    source: "function $useX() {}\nfunction App() {}\nfunction go() {}\n",
    outcome: ok,
    check: (p) => expect(p.statements.map((s) => s.kind)).toEqual(["HookDeclaration", "ComponentDeclaration", "ActionDeclaration"]),
  },
  { construct: "$effect with deps", source: '$effect(() => {}, [$a, "mount"])\n', outcome: ok },
  { construct: "arrows, function expressions, IIFE, defaults, rest, patterns", source: "f = (a = 1, ...r) => a\ng = function (x) { return x }\n(() => 1)()\nh = ({ a }, [b]) => a\n", outcome: ok },
  { construct: "regex literal", source: "r = /ab+c/gi\n", outcome: ok },
  { construct: "optional chaining, ??, **, bitwise, in, instanceof, typeof, void, delete", source: "v = a?.b?.(c) ?? d ** 2 | 1 & 3\nw = typeof a\nu = void 0\ndelete o.k\nq = \"k\" in o\n", outcome: ok },
  { construct: "templates, spread, trailing commas, numeric separators, hex", source: "t = `a${`b${c}`}`\ns = [...a, { ...o }, f(...xs)]\nn = [1_000, 0xff,]\n", outcome: ok },
  { construct: "for…of / for…in / classic / while / do…while / switch / try", source: "for (const [k, v] of es) {}\nfor (const k in o) {}\nfor (let i = 0; i < 3; i++) {}\nwhile (a) {}\ndo {} while (a)\nswitch (x) { case 1: break\n default: y() }\ntry {} catch {}\n", outcome: ok },
  { construct: "nested destructuring, array holes", source: "const { a: { b } } = o\nconst [, second] = arr\n", outcome: ok },
  { construct: "`arguments.length` (parse only; E103 in a JS module)", source: "b = arguments.length\n", outcome: ok },
  { construct: "leading-operator continuation", source: "const v = (a\n  + b)\n", outcome: ok },
  { construct: "multi-line call arguments", source: "f(\n  a,\n  b\n)\n", outcome: ok },

  // --- changed: now parse ------------------------------------------------------
  {
    construct: "`let x` / `let x;` (no initializer)",
    source: "let x\nlet y;\nvar z\n",
    outcome: ok,
    check: (p) => expect(shape(p.statements)).toEqual([
      { kind: "Assignment", identifier: "x", isState: false, expression: VOID_0, uninitialized: true, declaration: "let" },
      { kind: "Assignment", identifier: "y", isState: false, expression: VOID_0, uninitialized: true, declaration: "let" },
      { kind: "Assignment", identifier: "z", isState: false, expression: VOID_0, uninitialized: true, declaration: "var" },
    ]),
  },
  {
    construct: "`let a = 1, b = 2` (several declarators)",
    source: "let a = 1, b = 2\n",
    outcome: ok,
    check: (p) => expect(shape(p.statements)).toEqual([
      { kind: "Assignment", identifier: "a", isState: false, expression: { kind: "Literal", value: 1 }, declaration: "let" },
      { kind: "Assignment", identifier: "b", isState: false, expression: { kind: "Literal", value: 2 }, declaration: "let" },
    ]),
  },
  {
    construct: "`{ m() {} }` (method shorthand)",
    source: "o = { m(a) { return a } }\n",
    outcome: ok,
    check: (p) => expect(shape(p.statements[0])).toMatchObject({
      expression: {
        kind: "Object",
        properties: [{
          key: "m",
          method: true,
          value: { kind: "Lambda", params: [{ name: "a" }], body: { kind: "Block", body: [{ kind: "Return" }] } },
        }],
      },
    }),
  },
  {
    construct: '`const { "a-b": c } = o`, `const { default: d } = o`',
    source: 'const { "a-b": c, default: d } = o\n',
    outcome: ok,
    check: (p) => expect(shape(p.statements[0])).toMatchObject({
      kind: "DestructureStatement",
      bindings: [{ name: "c", sourceKey: "a-b" }, { name: "d", sourceKey: "default" }],
    }),
  },
  {
    construct: "`export default $app(…)`",
    source: "export default $app(App())\n",
    outcome: ok,
    check: (p) => expect(shape(p.statements)).toEqual([{
      kind: "ExpressionStatement",
      expression: { kind: "Invoke", callee: { kind: "StateRef", name: "app" }, arguments: [{ kind: "Call", callee: "App", arguments: [] }] },
      exportDefault: true,
    }]),
  },
  { construct: "`const x =⏎  v`", source: "const x =\n  v\n", outcome: ok },
  { construct: "`if (⏎  a &&⏎  b⏎) { … }`", source: "if (\n  a &&\n  b\n) {\n  c()\n}\n", outcome: ok },
  { construct: "`return (⏎  Text(\"x\")⏎ )`", source: 'function F() {\n  return (\n    Text("x")\n  )\n}\n', outcome: ok },
  {
    construct: "erased multi-line annotation `const o: {⏎ a: number⏎} = …` (even without soft newlines)",
    source: "const o   \n           \n  = { a: 1 }\n",
    outcome: ok,
    check: (p) => expect(p.statements).toHaveLength(1),
  },

  // --- changed: still errors, now with a message that says what to write -------
  { construct: "`async () => {}`", source: "async () => {}\n", outcome: err("`async` arrow functions are not supported in Aktion", 1, 1) },
  { construct: "`async x => x`", source: "f = async x => x\n", outcome: err("`async` arrow functions are not supported in Aktion", 1, 5) },
  { construct: "`async function () {}` (expression)", source: "f = async function () {}\n", outcome: err("`async` function expressions are not supported in Aktion", 1, 5) },
  { construct: "`{ async m() {} }`", source: "o = { async m() {} }\n", outcome: err("`async` methods are not supported in Aktion", 1, 7) },
  { construct: "`{ get x() {} }`", source: "o = { get x() { return 1 } }\n", outcome: err("getters and setters are not supported — use a plain property or a function", 1, 7) },
  { construct: "`{ set x(v) {} }`", source: "o = { set x(v) {} }\n", outcome: err("getters and setters are not supported", 1, 7) },
  { construct: "`export default …` (not `$app`)", source: "export default App\n", outcome: err("`export default` is only supported for the entry's `$app(…)` call", 1, 8) },
  { construct: "`export * from`", source: 'export * from "./x"\n', outcome: err("`export * from …` is not supported", 1, 8) },
  { construct: "`import App from`", source: 'import App from "./x"\n', outcome: err("Default imports are not supported in Aktion", 1, 8) },
  { construct: "`import * as ui from`", source: 'import * as ui from "./x"\n', outcome: err("Namespace imports (`import * as name`) are not supported", 1, 8) },
  { construct: '`import "./x"`', source: 'import "./x"\n', outcome: err("Side-effect imports", 1, 1) },
  { construct: "`import type {…}`", source: 'import type { A } from "./x"\n', outcome: err("`import type` is not supported in a `.aktion` file", 1, 8) },
  { construct: '`import("./x")`', source: 'import("./x")\n', outcome: err("Dynamic `import()` is not supported in Aktion", 1, 1) },
  { construct: "`import.meta`", source: "u = import.meta.url\n", outcome: err("`import.meta` is not supported in Aktion", 1, 5) },
  { construct: "`outer: for (…)` (label)", source: "outer: for (const x of xs) {}\n", outcome: err("Labels (`outer:`) are not supported in Aktion", 1, 1) },
  { construct: "`for (let i = 0, j = 1; …)`", source: "for (let i = 0, j = 1; i < 2; i++) {}\n", outcome: err("Declaring several variables in a `for (…)` head is not supported", 1, 15) },
  { construct: "`for (…; …; i++, j++)`", source: "for (let i = 0; i < 2; i++, j++) {}\n", outcome: err("The comma operator is not supported in Aktion — a `for (…)` update", 1, 27) },
  { construct: "`catch ({ message })`", source: "try { a() } catch ({ message }) {}\n", outcome: err("Destructuring the `catch` parameter is not supported", 1, 20) },
  { construct: "`[a, b] = [b, a]`", source: "[a, b] = [b, a]\n", outcome: err("Destructuring assignment", 1, 1) },
  { construct: "`({ a } = o)`", source: "({ a } = o)\n", outcome: err("Destructuring assignment", 1, 1) },
  { construct: "`a = b = 1`", source: "a = b = 1\n", outcome: err("Chained assignment (`a = b = 1`) is not supported", 1, 7) },
  { construct: "`if ((m = r.exec(s)))`", source: "if ((m = r.exec(s))) {}\n", outcome: err("Assignment inside an expression is not supported", 1, 8) },

  // --- changed: was accepted without an error, or the message changed ---------------
  { construct: "`this.x`", source: "a = this.x\n", outcome: err("`this` is not supported in Aktion", 1, 5) },
  { construct: "`export { a, b }`", source: "export { a, b }\n", outcome: err("`export { … }` lists (and re-export lists) are not supported") },

  // --- unchanged errors ----------------------------------------------------------
  { construct: "`class A {}`", source: "class A {}\n", outcome: err("`class` is not supported in Aktion") },
  { construct: "`const café = 1`", source: "const café = 1\n", outcome: err("names may only use a-z") },
  { construct: "`o.#x`", source: "x = o.#x\n", outcome: err("private fields") },
  { construct: "`10n`", source: "x = 10n\n", outcome: err("BigInt literals") },
  { construct: "TS: `x as T`", source: "x = a as T\n", outcome: err("`as` type assertions are not supported") },
  { construct: "TS: `{} satisfies T`", source: "x = {} satisfies T\n", outcome: err("`satisfies` type assertions are not supported") },
  { construct: "TS: `enum E {}`", source: "enum E { A }\n", outcome: err("TypeScript `enum` declarations are not supported") },
  { construct: "TS: `x!`", source: "y = x!\n", outcome: err("") },
  { construct: "TS: `function f(a: number)`", source: "function f(a: number) {}\n", outcome: err("") },
  { construct: "TS: `<T,>(x: T) => x`", source: "f = <T,>(x: T) => x\n", outcome: err("") },
  { construct: "TS: `declare const x`", source: "declare const x: number\n", outcome: err("") },
];

describe("Appendix A battery: JS/TS idioms through parse()", () => {
  it.each(BATTERY)("$construct", ({ source, outcome, check }) => {
    const program = parse(source);
    if ("ok" in outcome) {
      expect(program.errors).toEqual([]);
      check?.(program);
      return;
    }
    expect(program.errors.length).toBeGreaterThan(0);
    const first = program.errors[0]!;
    expect(first.message).toContain(outcome.error);
    if (outcome.line !== undefined) expect(first).toMatchObject({ line: outcome.line, column: outcome.column });
  });

  it("TS: `f<string>(x)` still parses as two comparisons — TypeScript text must be erased first", () => {
    const program = parse("y = f<string>(x)\n");
    expect(program.errors).toEqual([]);
    expect(shape(program.statements[0])).toMatchObject({
      expression: { kind: "Binary", operator: ">", left: { kind: "Binary", operator: "<" } },
    });
  });

  it("an erased `foo<⏎ Bar⏎>(1)` is still two statements WITHOUT soft newlines (the silent miscompile soft newlines fix)", () => {
    expect(parse("const x = foo \n     \n (1)\n").statements).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

describe("declarations without an initializer", () => {
  it("evaluate to `void 0` and record `uninitialized` (state atoms and exports too)", () => {
    expect(statementsOf("let $draft\nexport let total\n")).toEqual([
      { kind: "Assignment", identifier: "draft", isState: true, expression: VOID_0, uninitialized: true, declaration: "let" },
      { kind: "Assignment", identifier: "total", isState: false, expression: VOID_0, uninitialized: true, declaration: "let", exported: true },
    ]);
  });

  it("`let x = void 0` is NOT flagged — the flag records what the author wrote", () => {
    expect(statementsOf("let x = void 0\n")).toEqual([
      { kind: "Assignment", identifier: "x", isState: false, expression: VOID_0, declaration: "let" },
    ]);
  });

  it("`const x` stays an error, as in JavaScript", () => {
    const [error] = errorsOf("const x\n");
    expect(error).toMatchObject({ line: 1, column: 7 });
    expect(error!.message).toBe(
      "Missing initializer in `const x` — a `const` needs a value (`const x = …`); use `let x` to declare it without one.");
    expect(errorsOf("const $x\n")[0]!.message).toContain("`const $x`");
  });

  it("a destructuring declaration needs a value", () => {
    expect(errorsOf("let { a }\n")[0]!.message).toContain("Missing initializer in a destructuring declaration");
  });

  it("a type annotation gets its own message", () => {
    const [error] = errorsOf("let total: number = 0\n");
    expect(error).toMatchObject({ line: 1, column: 10 });
    expect(error!.message).toContain("Type annotations (`total: …`) are not supported in Aktion");
  });

  it("`let x⏎= 1` continues the declarator (a statement cannot start with `=`)", () => {
    expect(statementsOf("let x\n  = 1\n")).toEqual(statementsOf("let x = 1\n"));
  });

  it("works as a classic `for` init", () => {
    expect(parse("for (let i; i < 3; i++) {}\n").errors).toEqual([]);
  });
});

describe("several declarators", () => {
  it("become separate statements, each located at its own declarator", () => {
    const program = parse("let a = 1, b, [c] = arr, { d } = o\n");
    expect(program.errors).toEqual([]);
    expect(program.statements.map((s) => [s.kind, s.loc?.line, s.loc?.column])).toEqual([
      ["Assignment", 1, 1],
      ["Assignment", 1, 12],
      ["DestructureStatement", 1, 15],
      ["DestructureStatement", 1, 26],
    ]);
    expect(program.statements.every((s) => (s as { declaration?: string }).declaration === "let")).toBe(true);
  });

  it("may continue on the next line after the comma (Prettier's layout)", () => {
    const program = parse("const a = 1,\n  b = 2;\nconst c = 3\n");
    expect(program.errors).toEqual([]);
    expect(program.statements.map((s) => [(s as { identifier: string }).identifier, s.loc?.line, s.loc?.column]))
      .toEqual([["a", 1, 1], ["b", 2, 3], ["c", 3, 1]]);
  });

  it("are spliced into every statement list: blocks, switch cases and brace-less bodies", () => {
    const body = (s: Statement | undefined) => (s as { body: { body: Statement[] } }).body.body;
    const fn = parse("function f() {\n  let a = 1, b = 2\n  return a\n}\n").statements[0];
    expect(body(fn).map((s) => s.kind)).toEqual(["Assignment", "Assignment", "Return"]);

    const sw = parse("switch (x) {\n  case 1:\n    let a = 1, b = 2\n    go(a, b)\n}\n").statements[0] as {
      cases: Array<{ body: Statement[] }>;
    };
    expect(sw.cases[0]!.body.map((s) => s.kind)).toEqual(["Assignment", "Assignment", "ExpressionStatement"]);

    const iff = parse("if (c) let a = 1, b = 2\nx = 1\n");
    expect(iff.errors).toEqual([]);
    expect((iff.statements[0] as { consequent: { body: Statement[] } }).consequent.body).toHaveLength(2);
    expect(iff.statements).toHaveLength(2);
  });

  it("`export let a = 1, b = 2` exports every name", () => {
    expect(parse("export let a = 1, b = 2\n").statements.map((s) => (s as { exported?: boolean }).exported))
      .toEqual([true, true]);
    expect(errorsOf("export let a = 1, { b } = o\n")[0]!.message).toContain("`export` of a destructuring declaration");
  });

  it("a declarator that fails drops the whole declaration and nothing leaks into the next statement", () => {
    const program = parse("let a = 1, b = )\nlet c = 3\n");
    expect(program.errors).toHaveLength(1);
    expect(program.statements.map((s) => (s as { identifier: string }).identifier)).toEqual(["c"]);
  });

  it("keep a same-line trailing comment on the declarator it follows", () => {
    const program = parse("let a = 1, b = 2 // note\n");
    expect(program.statements[0]!.trailingComments).toBeUndefined();
    expect(program.statements[1]!.trailingComments?.map((c) => c.text)).toEqual(["// note"]);
    const split = parse("let a = 1, // first\n  b = 2 // second\n");
    expect(split.statements.map((s) => s.trailingComments?.map((c) => c.text))).toEqual([["// first"], ["// second"]]);
  });
});

// ---------------------------------------------------------------------------
// Objects and patterns
// ---------------------------------------------------------------------------

describe("method shorthand", () => {
  it("is a property whose value is a function — the same Lambda `key: function () {…}` gives", () => {
    const method = parse("o = { save(item, ...rest) { return item } }\n");
    const fnExpr = parse("o = { save: function (item, ...rest) { return item } }\n");
    expect(method.errors).toEqual([]);
    const strip = (p: Program) => JSON.stringify(shape(p.statements), (k, v) => (k === "method" ? undefined : v));
    expect(strip(method)).toBe(strip(fnExpr));
  });

  it("accepts quoted, numeric, keyword and computed keys, and multi-line bodies", () => {
    const program = parse('o = {\n  "on-click"() {},\n  1() {},\n  default() {},\n  [name](x) {\n    a()\n    b()\n  },\n}\n');
    expect(program.errors).toEqual([]);
    const props = (shape(program.statements[0]) as { expression: { properties: Array<{ key: string; method?: boolean; computedKey?: unknown }> } })
      .expression.properties;
    expect(props.map((p) => [p.key, p.method, p.computedKey !== undefined])).toEqual([
      ["on-click", true, false], ["1", true, false], ["default", true, false], ["", true, true],
    ]);
  });

  it("keeps properties merely NAMED get / set / async working", () => {
    expect(parse("o = { get: 1, set, async: true, get() { return 1 } }\nset = 2\n").errors).toEqual([]);
  });

  it("rejects generator methods", () => {
    expect(errorsOf("o = { *gen() {} }\n")[0]!.message).toContain("Generator methods (`*name() {}`) are not supported");
  });
});

describe("destructuring keys", () => {
  it("accept strings, reserved words and numbers when renamed — in declarations, params, arrows and for-of", () => {
    const expected = [{ name: "x", sourceKey: "a-b" }, { name: "d", sourceKey: "default" }, { name: "z", sourceKey: "0" }];
    const decl = parse('const { "a-b": x, default: d, 0: z } = o\n');
    expect(decl.errors).toEqual([]);
    expect(shape(decl.statements[0])).toMatchObject({ bindings: expected });

    const fn = parse('function f({ "a-b": x, default: d, 0: z }) {}\n');
    expect(shape(fn.statements[0])).toMatchObject({ params: [{ name: "", pattern: { kind: "object", bindings: expected } }] });

    const arrow = parse('g = ({ "a-b": x, default: d, 0: z }) => x\n');
    expect(shape(arrow.statements[0])).toMatchObject({ expression: { kind: "Lambda", params: [{ pattern: { bindings: expected } }] } });

    expect(parse('for (const { "a-b": x } of rows) {}\n').errors).toEqual([]);
  });

  it("normalise numeric keys the way JavaScript does", () => {
    expect(shape(parse("const { 0x10: a, 1e3: b } = o\n").statements[0])).toMatchObject({
      bindings: [{ name: "a", sourceKey: "16" }, { name: "b", sourceKey: "1000" }],
    });
  });

  it("need a name when the key is not one", () => {
    expect(errorsOf("const { default } = o\n")[0]!.message)
      .toBe("`default` is a reserved word, so it cannot be a binding name — rename it: `{ default: name }`.");
    expect(errorsOf('const { "a-b" } = o\n')[0]!.message).toContain('rename it: `{ "a-b": name }`');
    expect(errorsOf("f = ({ default }) => 1\n")[0]!.message).toContain("reserved word");
  });

  it("may span lines, defaults included", () => {
    expect(statementsOf("const {\n  a,\n  b =\n    1,\n} = o\n")).toEqual(statementsOf("const { a, b = 1 } = o\n"));
  });
});

describe("lexer errors keep their own message in the new productions", () => {
  it.each([
    ["a const declarator", "const café = 1\n"],
    ["a let declarator", "let café = 1\n"],
    ["after `export default`", "export default é\n"],
    ["a pattern key", "const { é: a } = o\n"],
    ["a catch parameter", "try {} catch (é) {}\n"],
    ["an operand after a line break", "x =\n  é\n"],
    ["a grouped expression", "x = (a é)\n"],
    ["an import", "import é from \"./x\"\n"],
  ])("%s", (_where, source) => {
    expect(errorsOf(source)[0]!.message).toContain("Unexpected character 'é'");
  });
});

describe("`export default`", () => {
  it("is exactly `$app(…)` plus the flag", () => {
    const flagged = shape(parse("export default $app(App())\n").statements[0]) as Record<string, unknown>;
    const plain = shape(parse("$app(App())\n").statements[0]) as Record<string, unknown>;
    expect(flagged.exportDefault).toBe(true);
    delete flagged.exportDefault;
    expect(flagged).toEqual(plain);
  });

  it("rejects anything that is not exactly an `$app(…)` call", () => {
    for (const source of ["export default $app\n", "export default $app(App()).x\n", "export default function App() {}\n", "export default 1\n"]) {
      expect(errorsOf(source)[0]!.message, source).toContain("`export default` is only supported for the entry's `$app(…)` call");
    }
  });
});

// ---------------------------------------------------------------------------
// Newline layouts (F18)
// ---------------------------------------------------------------------------

describe("newline layouts from TypeScript / Prettier / XO", () => {
  it.each([
    ["`=` at the end of a line", "const total =\n  items.length\n", "const total = items.length\n"],
    ["a state assignment", "$x =\n  1\n", "$x = 1\n"],
    ["a compound assignment", "x +=\n  step\n", "x += step\n"],
    ["a member assignment", "$form.value =\n  next\n", "$form.value = next\n"],
    ["an export", "export const label =\n  \"x\"\n", "export const label = \"x\"\n"],
    ["a destructuring declaration", "const { a } =\n  o\n", "const { a } = o\n"],
    ["an arrow body assignment", "f = () => x =\n  1\n", "f = () => x = 1\n"],
    ["an `if` head", "if (\n  a &&\n  b\n) {\n  c()\n}\n", "if (a && b) {\n  c()\n}\n"],
    ["a `while` head", "while (\n  a\n) {\n  c()\n}\n", "while (a) {\n  c()\n}\n"],
    ["a `switch` head", "switch (\n  x\n) {\n  case 1: y()\n}\n", "switch (x) {\n  case 1: y()\n}\n"],
    ["a `do … while` head", "do {\n  c()\n} while (\n  a\n)\n", "do {\n  c()\n} while (a)\n"],
    ["a classic `for` head", "for (\n  let i = 0;\n  i < 3;\n  i++\n) {\n  log(i)\n}\n", "for (let i = 0; i < 3; i++) {\n  log(i)\n}\n"],
    ["a `for…of` head", "for (\n  const x of\n  xs\n) {\n  log(x)\n}\n", "for (const x of xs) {\n  log(x)\n}\n"],
    ["`return (⏎ … ⏎)`", 'function F() {\n  return (\n    Text("x")\n  )\n}\n', 'function F() {\n  return Text("x")\n}\n'],
    ["a grouped operand split anywhere", "v = (\n  a\n  &&\n  b\n)\n", "v = (a && b)\n"],
    ["a call whose argument continues on the next line", "f(a\n  (b))\n", "f(a(b))\n"],
    ["an object value after its colon", 'Button("Save", {\n  disabled:\n    $busy,\n})\n', 'Button("Save", { disabled: $busy })\n'],
    ["a multi-line shorthand object without a trailing comma", "x = {\n  a,\n  b\n}\n", "x = { a, b }\n"],
    ["an index split across lines", "v = a[\n  i\n]\n", "v = a[i]\n"],
    ["a multi-line arrow parameter list", "f = (\n  a,\n  b =\n    1\n) => a\n", "f = (a, b = 1) => a\n"],
    ["a trailing comma in arrow parameters (Prettier 3)", "f = (\n  a,\n  { b },\n) => a\n", "f = (a, { b }) => a\n"],
    ["a multi-line `catch` parameter", "try {\n  a()\n} catch (\n  e\n) {\n  b()\n}\n", "try {\n  a()\n} catch (e) {\n  b()\n}\n"],
  ])("%s", (_name, multiline, oneLine) => {
    const a = parse(multiline);
    expect(a.errors).toEqual([]);
    expect(shape(a.statements)).toEqual(shape(parse(oneLine).statements));
  });

  it("a `{ … }` block inside parentheses is statement level again", () => {
    const program = parse("f(() => {\n  a()\n  b()\n})\n");
    expect(program.errors).toEqual([]);
    expect(shape(program.statements[0])).toMatchObject({
      expression: { arguments: [{ kind: "Lambda", body: { kind: "Block", body: [{ kind: "ExpressionStatement" }, { kind: "ExpressionStatement" }] } }] },
    });
    // …and inside it a newline still ends `return` and splits `a⏎(b)`, as in JS.
    const nested = parse("f(() => {\n  return\n  a\n  (b)\n})\n");
    expect(nested.errors).toEqual([]);
    const body = (shape(nested.statements[0]) as { expression: { arguments: Array<{ body: { body: unknown[] } }> } })
      .expression.arguments[0]!.body.body;
    expect(body).toEqual([{ kind: "Return" }, { kind: "ExpressionStatement", expression: { kind: "Identifier", name: "a" } }, { kind: "ExpressionStatement", expression: { kind: "Identifier", name: "b" } }]);
  });

  it("a trailing comma after a rest parameter stays an error, as in JS", () => {
    expect(errorsOf("f = (...a,) => a\n").length).toBeGreaterThan(0);
  });

  it("statement level keeps ending statements at newlines", () => {
    expect(parse("a\n(b)\n").statements).toHaveLength(2);
    expect(parse("return\nx\n").statements).toHaveLength(2);
  });

  it("does not swallow the next statement after a dangling `=`", () => {
    // `broken =` stops at its own line; `b = …` on the next line is a statement
    // of its own (joining them would be a chained assignment, unsupported).
    const program = parse("broken =\nb = Card([])\n");
    expect(program.errors).toHaveLength(1);
    expect(program.errors[0]).toMatchObject({ line: 1 });
    expect(program.statements.map((s) => (s as { identifier?: string }).identifier)).toEqual(["b"]);
    // Same for a statement keyword on the next line.
    const kw = parse("let total =\nlet other = 1\n");
    expect(kw.errors[0]).toMatchObject({ line: 1 });
    expect(kw.statements.map((s) => (s as { identifier?: string }).identifier)).toEqual(["other"]);
  });

  it("keeps empty classic-`for` parts (`for (;;)`) — the newline handling no longer skips `;` there", () => {
    expect(shape(parse("for (;;) { break }\n").statements[0])).toMatchObject({ kind: "ForClassicStatement", body: { body: [{ kind: "BreakStatement" }] } });
    const head = shape(parse("for (let i = 0;; i++) { break }\n").statements[0]) as Record<string, unknown>;
    expect(head.init).toBeDefined();
    expect(head.test).toBeUndefined();
    expect(head.update).toBeDefined();
    expect(formatProgram("for (;;) {\n  break\n}\n").formatted).toBe("for (; ; ) {\n  break\n}\n");
    // A declaration init still needs its `;` (the old parser also took a newline, or nothing).
    expect(errorsOf("for (let i = 0\n  i < 3; i++) {}\n")[0]!.message).toContain("Expected Semicolon");
  });

  it("keeps exact positions inside a multi-line head", () => {
    const program = parse("if (\n  a &&\n  b\n) {}\n");
    expect(program.statements[0]).toMatchObject({ test: { kind: "Binary", loc: { line: 2, column: 5 }, right: { loc: { line: 3, column: 3 } } } });
  });
});

// ---------------------------------------------------------------------------
// Soft newlines (TypeScript frontend input)
// ---------------------------------------------------------------------------

/**
 * Blank the `[[…]]`-marked ranges of `ts` with spaces (newlines kept), the way
 * the TypeScript frontend's eraser does, and compute the soft newlines exactly
 * as §7.4 specifies: a newline whose nearest non-whitespace neighbours on both
 * sides were erased.
 */
function erase(ts: string): { code: string; softNewlines: Set<number> } {
  let text = "";
  const erased: boolean[] = [];
  let inside = false;
  for (let i = 0; i < ts.length; i += 1) {
    if (ts.startsWith("[[", i)) { inside = true; i += 1; continue; }
    if (ts.startsWith("]]", i)) { inside = false; i += 1; continue; }
    text += ts[i];
    erased.push(inside && !/\s/.test(ts[i]!));
  }
  const code = [...text].map((ch, i) => (erased[i] ? " " : ch)).join("");
  const softNewlines = new Set<number>();
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "\n") continue;
    let before = i - 1;
    while (before >= 0 && /\s/.test(text[before]!)) before -= 1;
    let after = i + 1;
    while (after < text.length && /\s/.test(text[after]!)) after += 1;
    if (before >= 0 && after < text.length && erased[before] && erased[after]) softNewlines.add(i);
  }
  expect(code).toHaveLength(text.length);
  return { code, softNewlines };
}

describe("softNewlines", () => {
  it("the lexer emits no Newline token for a soft newline but keeps counting lines", () => {
    const tokens = tokenize("a\nb\nc", undefined, { softNewlines: new Set([1]) });
    expect(tokens.map((t) => [t.type, t.value, t.line, t.column])).toEqual([
      ["Identifier", "a", 1, 1],
      ["Identifier", "b", 2, 1],
      ["Newline", "\n", 2, 2],
      ["Identifier", "c", 3, 1],
      ["EOF", "", 3, 2],
    ]);
  });

  it("ignores offsets that are not line breaks", () => {
    expect(statementsOf("x = 1\ny = 2\n")).toEqual(shape(parse("x = 1\ny = 2\n", { softNewlines: new Set([0, 2, 4, 99]) }).statements));
  });

  it("an erased multi-line generic call stays one call, with exact positions after it", () => {
    const { code, softNewlines } = erase("const x = foo[[<\n  Bar\n>]](1)\nconst y = 2\n");
    expect(code).toBe("const x = foo \n     \n (1)\nconst y = 2\n");
    expect([...softNewlines]).toEqual([14, 20]);
    const program = parse(code, { softNewlines });
    expect(program.errors).toEqual([]);
    expect(shape(program.statements)).toEqual(shape(parse("const x = foo(1)\nconst y = 2\n").statements));
    expect(program.statements[1]!.loc).toEqual({ line: 4, column: 1 });
  });

  it.each([
    ["a multi-line object annotation", "const o[[: {\n  a: number\n}]] = { a: 1 }\n", "const o = { a: 1 }\n"],
    ["a multi-line union annotation", 'let m[[:\n  | "a"\n  | "b"]] = "a"\n', 'let m = "a"\n'],
    ["a multi-line return type", "function f()[[: {\n  a: number\n}]] {\n  return 1\n}\n", "function f() {\n  return 1\n}\n"],
    ["an arrow's multi-line return type", "const f = (a[[: number]])[[: {\n  b: number\n}]] => a\n", "const f = (a) => a\n"],
    ["a multi-line `as` cast", "const v = (x [[as\n  Foo]]).y\n", "const v = (x).y\n"],
  ])("%s", (_name, ts, plain) => {
    const { code, softNewlines } = erase(ts);
    const program = parse(code, { softNewlines });
    expect(program.errors).toEqual([]);
    expect(shape(program.statements)).toEqual(shape(parse(plain).statements));
  });

  it("carries into a template interpolation's own sub-parse", () => {
    const { code, softNewlines } = erase("const s = `${foo[[<\n  Bar\n>]](x)}!`\nconst t = 1\n");
    const program = parse(code, { softNewlines });
    expect(program.errors).toEqual([]);
    expect(shape(program.statements)).toEqual(shape(parse("const s = `${foo(x)}!`\nconst t = 1\n").statements));
    // Positions inside the interpolation are still the ones in the source.
    expect(program.statements[0]).toMatchObject({
      expression: { expressions: [{ kind: "Call", loc: { line: 1, column: 14 }, arguments: [{ loc: { line: 3, column: 3 } }] }] },
    });
    // Without the set the interpolation splits at the newline into two
    // statements — reported (it used to lose its argument list silently).
    expect(parse(code).errors.map((e) => e.message)).toEqual([expect.stringContaining("holds a single expression")]);
  });

  it("the newline after a fully erased declaration stays hard", () => {
    const { code, softNewlines } = erase("[[type A = {\n  a: 1\n}]]\nconst x = 1\n");
    expect(softNewlines.size).toBe(2);
    const program = parse(code, { softNewlines });
    expect(program.errors).toEqual([]);
    expect(program.statements.map((s) => s.loc)).toEqual([{ line: 4, column: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Streaming (`parse(…, { streaming: true })`, the frontier)
// ---------------------------------------------------------------------------

describe("streaming prefixes", () => {
  it("a chunk ending in `const x =` keeps the error on that line and the earlier statements committed", () => {
    for (const chunk of ["$a = 1\nconst x =", "$a = 1\nconst x =\n", "$a = 1\nconst x =\n  "]) {
      const program = parse(chunk, { streaming: true });
      expect(program.statements.map((s) => (s as { identifier: string }).identifier), JSON.stringify(chunk)).toEqual(["a"]);
      expect(program.errors.map((e) => e.line)).toEqual([2]);
      const frontier = computeFrontier(chunk);
      expect(frontier.committedSource).toBe("$a = 1\n");
      expect(frontier.committedBindings).toEqual(["a"]);
    }
  });

  it("the next chunk completes the statement", () => {
    const program = parse("$a = 1\nconst x =\n  $a + 1\n", { streaming: true });
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(2);
  });

  it("every prefix of a Prettier-style program parses without throwing and never loses a finished statement", () => {
    const source = [
      "const total =",
      "  items.length",
      "if (",
      "  total > 0 &&",
      "  ready",
      ") {",
      "  go()",
      "}",
      "let a = 1,",
      "  b = 2",
      "o = { save(x) { return x } }",
      "export default $app(App())",
      "",
    ].join("\n");
    const complete = parse(source);
    expect(complete.errors).toEqual([]);
    expect(complete.statements).toHaveLength(6);
    const ends = [2, 8, 10, 11, 12].map((line) => source.split("\n").slice(0, line).join("\n").length + 1);
    for (let cut = 0; cut <= source.length; cut += 1) {
      const program = parse(source.slice(0, cut), { streaming: true });
      const finished = ends.filter((end) => end <= cut).length;
      // Statements whose last line arrived are all there (`let a, b` is two).
      expect(program.statements.length).toBeGreaterThanOrEqual(finished);
    }
  });
});

// ---------------------------------------------------------------------------
// Printer: every new form round-trips and formats idempotently
// ---------------------------------------------------------------------------

describe("printer round-trips for the widened forms", () => {
  it.each([
    ["uninitialized declarations", "let x\nvar $y\nexport let z\n", "let x\nvar $y\nexport let z\n"],
    ["several declarators (printed one per line)", "let a = 1, b\n", "let a = 1\nlet b\n"],
    ["method shorthand", "o = { save(item) { return item } }\n", "o = {\n  save(item) {\n    return item\n  }\n}\n"],
    ["method shorthand with odd keys and params", 'o = { "a-b"(x = 1, ...r) {}, [k]({ a }) {} }\n', 'o = {\n  "a-b"(x = 1, ...r) {\n\n  },\n  [k]({a}) {\n\n  }\n}\n'],
    ["quoted, reserved and numeric pattern keys", 'const { "a-b": x, default: d, 0: z } = o\n', 'const {"a-b": x, default: d, "0": z} = o\n'],
    ["pattern parameters", 'function Card(label, { icon, "a-b": ab } = {}) {}\nf = ({ a }) => a\ng = (...xs) => xs\n', 'function Card(label, {icon, "a-b": ab} = {}) {\n}\n\nf = ({a}) => a\ng = (...xs) => xs\n'],
    ["`export default $app(…)`", "export default $app(App())\n", "export default $app(App())\n"],
    ["multi-line layouts collapse", "const x =\n  v\nif (\n  a\n) {\n  b()\n}\n", "const x = v\nif (a) {\n  b()\n}\n"],
  ])("%s", (_name, source, expected) => {
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    expect(first.warnings).toBeUndefined();
    expect(first.formatted).toBe(expected);
    expect(formatProgram(first.formatted).formatted).toBe(first.formatted);
    expect(roundTrips(parse(source))).toBe(true);
  });

  it("`let x = void 0` and `let x` stay distinct", () => {
    expect(formatProgram("let x = void 0\n").formatted).not.toBe("let x\n");
  });
});

// ---------------------------------------------------------------------------
// §8.0.2 — function kind survives the linker's renaming
// ---------------------------------------------------------------------------

describe("function kind survives the linker's renaming (§8.0.2)", () => {
  it("the parser's module-symbol helpers are the linker's", () => {
    for (const [id, name] of [[1, "Counter"], [3, "total"], [12, "my_atom"]] as const) {
      expect(parserModuleLocalSymbol(id, name)).toBe(moduleLocalSymbol(id, name));
      expect(parserModuleLocalBaseName(moduleLocalSymbol(id, name))).toBe(name);
    }
    for (const symbol of ["total", "__aX_total", "__a3_", "a__a3_x"]) {
      expect(parserModuleLocalBaseName(symbol)).toBe(moduleLocalBaseName(symbol));
    }
    expect(MODULE_LOCAL_SYMBOL.exec("__a3_total")?.slice(1)).toEqual(["3", "total"]);
  });

  it("classifies a renamed function by the name the author wrote", () => {
    expect(parse("function __a3_Counter() {}\nfunction __a3_count() {}\nfunction __aX_Counter() {}\nfunction $__a3_useX() {}\n")
      .statements.map((s) => s.kind))
      .toEqual(["ComponentDeclaration", "ActionDeclaration", "ActionDeclaration", "HookDeclaration"]);
  });

  it("a printed linked program re-parses to the same tree (component, hook, action, `$state` atom)", () => {
    const files = {
      "app.aktion": [
        'import { Counter, $count, $useToggle, increment } from "./counter.aktion"',
        "function App() {",
        "  const t = $useToggle(false)",
        '  return Column([Counter("A"), Counter("B"), Text(`${$count} ${t.on}`), Button("+", { onClick: increment })])',
        "}",
        "$app(App())",
      ].join("\n"),
      "counter.aktion": [
        "export $count = 0",
        "export function $useToggle(initial) {",
        "  const [on, setOn] = $state(initial)",
        "  return { on, toggle: () => setOn(!on) }",
        "}",
        "export function increment() {",
        "  $count += 1",
        "}",
        "export function Counter(label) {",
        "  const [n, setN] = $state(0)",
        "  return Button(`${label}: ${n}`, { onClick: () => setN(n + 1) })",
        "}",
      ].join("\n"),
    };
    const linked = linkProgram(files["app.aktion"], "app.aktion", createMemoryResolver(files));
    expect(linked.diagnostics).toEqual([]);
    expect(linked.program.statements.map((s) => [s.kind, (s as { name?: string }).name])).toEqual([
      ["Assignment", undefined],
      ["HookDeclaration", "__a1_useToggle"],
      ["ActionDeclaration", "__a1_increment"],
      ["ComponentDeclaration", "__a1_Counter"],
      ["ComponentDeclaration", "App"],
      ["ExpressionStatement", undefined],
    ]);
    const reparsed = parse(printProgram(linked.program));
    expect(reparsed.errors).toEqual([]);
    // Before the fix `function __a1_Counter` re-parsed as an ActionDeclaration.
    expect(reparsed.statements[3]!.kind).toBe("ComponentDeclaration");
    expect(structuralFingerprint(reparsed)).toBe(structuralFingerprint(linked.program));
  });
});
