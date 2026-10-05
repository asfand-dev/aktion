/**
 * `printProgram` writes text that parses back to the program it printed.
 *
 * The grammar has no grouping node, and the printer used to print every
 * operand bare: `(a + b) * c` came back as `a + b * c`, `typeof x` as the
 * name `typeofx`, `-(-1)` as `--1`, `m => ({ … })` as a block, a computed key
 * `{ [k]: v }` as `{ "": v }`, and a template's `` \` `` and `\${` unescaped.
 * `formatProgram`'s AST guard hid this for files it formats (it returned them
 * untouched); `printProgram` has no guard, and it is what writes
 * `CompiledProgram.source`.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import { printProgram, structuralFingerprint } from "../src/tooling/formatter.js";

function roundTrips(source: string): { printed: string; same: boolean } {
  const program = parse(source);
  expect(program.errors, source).toEqual([]);
  const printed = printProgram(program);
  const again = parse(printed);
  return {
    printed,
    same: again.errors.length === 0 && structuralFingerprint(again) === structuralFingerprint(program),
  };
}

describe("printProgram groups by precedence", () => {
  it.each([
    ["y = (a + b) * c", "y = (a + b) * c"],
    ["y = a - (b - c)", "y = a - (b - c)"],
    ["y = (a * b) / c", "y = a * b / c"],
    ['x = (html || "").trim()', 'x = (html || "").trim()'],
    ["x = (a ? b : c) + 1", "x = (a ? b : c) + 1"],
    ["x = (a ? b : c) ? d : e", "x = (a ? b : c) ? d : e"],
    ["x = a ? b : c ? d : e", "x = a ? b : c ? d : e"],
    ["x = !(a && b)", "x = !(a && b)"],
    ["x = (!a).b", "x = (!a).b"],
    ["x = (a + b).length", "x = (a + b).length"],
    ["x = (2 ** 3) ** 2", "x = (2 ** 3) ** 2"],
    ["x = 2 ** 3 ** 2", "x = 2 ** 3 ** 2"],
    ["x = -a ** 2", "x = (-a) ** 2"],
    ["x = (-2) ** 2", "x = (-2) ** 2"],
    ["x = a ?? (b || c)", "x = a ?? (b || c)"],
    ["x = (a ?? b) || c", "x = (a ?? b) || c"],
    ["x = a & (b | c)", "x = a & (b | c)"],
    ["x = (a << b) + c", "x = (a << b) + c"],
    ["x = (() => 1)()", "x = (() => 1)()"],
    ["x = (x => x + 1)(2)", "x = (x => x + 1)(2)"],
    ["x = (() => 1) || 2", "x = (() => 1) || 2"],
    ["x = a || (() => 1)", "x = a || (() => 1)"],
    ["x = (b)(1)", "x = (b)(1)"],
    ["x = (o.p)(1)", "x = (o.p)(1)"],
    ["x = (1).toFixed(2)", "x = (1).toFixed(2)"],
    ["x = new (a.b())()", "x = new (a.b())()"],
  ])("%j", (source, expected) => {
    const { printed, same } = roundTrips(source);
    expect(printed).toBe(`${expected}\n`);
    expect(same).toBe(true);
  });
});

describe("printProgram writes operators and literals the lexer reads back", () => {
  it.each([
    ["x = typeof a", "x = typeof a"],
    ["x = void 0", "x = void 0"],
    ["x = delete o.k", "x = delete o.k"],
    ["x = -(-1)", "x = - -1"],
    ["x = +(+a)", "x = + +a"],
    ["x = - 2", "x = - 2"],
    ["x = -0", "x = -0"],
    ["x = typeof (-1)", "x = typeof (-1)"],
    ["function f() { return (-1) }", "function f() {\n  return (-1)\n}"],
    ["x = `a${b}c\\`d\\${e}`", "x = `a${b}c\\`d\\${e}`"],
    ['x = { [k]: 1, ["a" + b]: 2 }', 'x = { [k]: 1, ["a" + b]: 2 }'],
    ['x = { "$a": 1, "a-b": 2, default: 3 }', 'x = { "$a": 1, "a-b": 2, default: 3 }'],
    ["rows = items.map(m => ({ role: m.role }))", "rows = items.map(m => ({ role: m.role }))"],
    ["f = () => ({ a: 1 }).a", "f = () => ({ a: 1 }.a)"],
  ])("%j", (source, expected) => {
    const { printed, same } = roundTrips(source);
    expect(printed).toBe(`${expected}\n`);
    expect(same).toBe(true);
  });
});

describe("printProgram prints a named function expression as one", () => {
  it("so it can still call itself", () => {
    const { printed, same } = roundTrips("const fact = function fact(n) { return n <= 1 ? 1 : n * fact(n - 1) }");
    expect(printed).toBe("const fact = function fact(n) {\n  return n <= 1 ? 1 : n * fact(n - 1)\n}\n");
    expect(same).toBe(true);
  });

  it("groups one that starts a statement, where `function` would declare", () => {
    const { printed, same } = roundTrips("(function f() { return 1 })");
    expect(printed).toBe("(function f() {\n  return 1\n})\n");
    expect(same).toBe(true);
  });
});

describe("printProgram keeps an expression statement an expression", () => {
  it("groups `await` at the start of a statement, which would make it an `await` statement", () => {
    for (const source of ["(await (load()))", "(await (a) + 1)"]) {
      const { printed, same } = roundTrips(source);
      expect(printed.startsWith("(await (")).toBe(true);
      expect(same).toBe(true);
    }
    expect(parse("await (load())").statements[0]!.kind).toBe("Await");
    expect(parse("(await (load()))").statements[0]!.kind).toBe("ExpressionStatement");
  });
});

/**
 * Random programs from a small grammar that reaches every expression form,
 * printed and parsed again. A fixed seed keeps the run deterministic.
 */
describe("printProgram round-trips random programs", () => {
  const BINARY = ["||", "??", "&&", "|", "^", "&", "==", "!=", "===", "<", "<=", ">", "in", "instanceof", "<<", ">>", "+", "-", "*", "/", "%", "**"];
  const UNARY = ["!", "-", "+", "~", "typeof ", "void "];
  const LEAVES = [
    "a", "1", "-2", "0.5", '"s"', "$x", "null", "true", "`t${a}`", "[1]", "{ k: 1 }", "o.p", "f()", "-0",
    "`a\\`b\\${c}`", '"x\\ny"', "o?.p", "o?.[k]", "new D()", "new n.C(1)", 'o["$k"]', '{ "$a": 1, "b-c": 2, default: 3 }',
    "/re+/g", "x?.()",
  ];

  function generator(seed: number): () => string {
    let state = seed;
    const rand = (n: number): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state % n;
    };
    const pick = <T,>(items: readonly T[]): T => items[rand(items.length)]!;
    const gen = (depth: number): string => {
      if (depth <= 0) return pick(LEAVES);
      const d = depth - 1;
      switch (rand(22)) {
        case 0: case 1: case 2: return `(${gen(d)} ${pick(BINARY)} ${gen(d)})`;
        case 3: return `${pick(UNARY)}(${gen(d)})`;
        case 4: return `(${gen(d)} ? ${gen(d)} : ${gen(d)})`;
        case 5: return `(${gen(d)}).m(${gen(d)})`;
        case 6: return `(${gen(d)})?.p`;
        case 7: return `(${gen(d)})[${gen(d)}]`;
        case 8: return `((x, y = ${gen(d)}) => (${gen(d)}))`;
        case 9: return `(({ a, b: [c] }, ...r) => { return ${gen(d)} })`;
        case 10: return `(${gen(d)})(${gen(d)})`;
        case 11: return `g(${gen(d)}, ...${gen(d)})`;
        case 12: return `[${gen(d)}, ...${gen(d)}]`;
        case 13: return `{ a: ${gen(d)}, [${gen(d)}]: 1, ...${gen(d)}, m(z) { return ${gen(d)} } }`;
        case 14: return `(function fn(n) { return n ? ${gen(d)} : fn(n - 1) })`;
        case 15: return `\`p\${${gen(d)}}q\${\`in\${${gen(d)}}\`}\``;
        case 16: return `(() => (${gen(d)}))()`;
        case 17: return `new (${gen(d)}).K(${gen(d)})`;
        case 18: return `(x => x.v = ${gen(d)})`;
        case 19: return `(x => x.n++)`;
        case 20: return `(await (${gen(d)}))`;
        default: return `delete (${gen(d)}).p`;
      }
    };
    return () =>
      [
        `x = ${gen(1 + rand(4))}`,
        `function h(p = ${gen(1)}) { if (${gen(2)}) { return ${gen(2)} } else { throw ${gen(2)} } }`,
        `function k() { for (const v of ${gen(2)}) { y = ${gen(2)} } switch (${gen(1)}) { case ${gen(1)}: return ${gen(2)} } }`,
        `$effect(() => { o.q = ${gen(2)} }, [$x])`,
        gen(2),
        `let { a: aa, ...rest } = ${gen(2)}`,
      ].join("\n");
  }

  for (const seed of [7, 2024]) {
    it(`seed ${seed}`, () => {
      const next = generator(seed);
      const failures: string[] = [];
      for (let i = 0; i < 1500; i += 1) {
        const source = next();
        const program = parse(source);
        expect(program.errors, source).toEqual([]);
        const printed = printProgram(program);
        const again = parse(printed);
        const same = again.errors.length === 0 && structuralFingerprint(again) === structuralFingerprint(program);
        if (!same && failures.length < 3) failures.push(`${source}\n=> ${printed}`);
      }
      expect(failures).toEqual([]);
    });
  }
});
