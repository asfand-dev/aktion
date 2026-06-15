/**
 * Comprehensive JavaScript-subset semantics for the Aktion runtime.
 *
 * Aktion is pitched as "a strict subset of JavaScript", so a front-end
 * developer reasons about an Aktion program *as JS*. Every divergence from JS
 * is a trap. This file pins down the behaviour an author relies on when
 * building a real app: operators + coercion, the string / array / object /
 * number method surface (dispatched to the host engine), optional chaining,
 * spread + rest, destructuring (incl. nested), and control flow.
 *
 * It also carries explicit REGRESSION tests for the JS-divergence bugs fixed
 * alongside it (loose `==`, lexicographic relational compare, `for (const
 * [k, v] of …)` destructuring, function rest params, spread call args, nested
 * destructuring) — each is annotated so a future change that re-breaks one is
 * obvious.
 *
 * Most cases assert the Aktion result equals the value the SAME expression
 * produces in real JavaScript (`eval`), so the suite is self-documenting:
 * "Aktion matches JS here".
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import { StateStore, createContext, planProgram } from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

// ---------------------------------------------------------------------------
// Harness — evaluate an Aktion expression / statement body and read `$out`.
// ---------------------------------------------------------------------------

function runBody(body: string): unknown {
  const src = [
    "function go(_) {",
    body,
    "}",
    "$out = null",
    "run = go(0)",
    'aktion = Text("ok")',
  ].join("\n");
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error("parse error: " + program.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join("; "));
  }
  planProgram(program, ctx);
  // `run` is a lazy binding that runs the action body synchronously on read.
  void ctx.bindings.get("run")?.();
  return state.get("out");
}

/** Evaluate `expr` as an Aktion expression and return its value. */
function evalExpr(expr: string): unknown {
  return runBody(`  $out = ${expr}`);
}

/** Assert that Aktion produces the SAME value real JavaScript does. */
function expectMatchesJs(expr: string): void {
  // eslint-disable-next-line no-eval
  const jsValue = eval(`(${expr})`);
  expect(evalExpr(expr)).toEqual(jsValue);
}

function parseErrors(src: string): string[] {
  return parse(src).errors.map((e) => e.message);
}

// ===========================================================================
// Operators & coercion
// ===========================================================================

describe("Arithmetic & operator precedence", () => {
  for (const expr of [
    "2 + 3 * 4",
    "(2 + 3) * 4",
    "100 - 50 - 25",
    "2 ** 3 ** 2",        // right-associative → 512
    "10 % 3",
    "-5 + 8",
    "7 / 2",
    "1 + 2 * 3 - 4 / 2",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }

  it("clamps division / modulo by zero to 0 (Aktion safety divergence)", () => {
    expect(evalExpr("10 / 0")).toBe(0);
    expect(evalExpr("10 % 0")).toBe(0);
  });

  it("`+` concatenates when either operand is a string", () => {
    expect(evalExpr('"Days: " + 5')).toBe("Days: 5");
    expect(evalExpr('1 + "px"')).toBe("1px");
    expect(evalExpr("1 + 2 + 3")).toBe(6);
  });
});

describe("Loose equality (==/!=) follows JS abstract equality — REGRESSION", () => {
  // Previously `==` was treated as strict `===`, breaking the pervasive
  // `x == null` guard. These must coerce exactly like JavaScript.
  for (const expr of [
    "null == undefined",
    "undefined == null",
    "1 == '1'",
    "0 == false",
    "'' == false",
    "null == 0",
    "1 != '2'",
    "null != undefined",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }

  it("the `x == null` idiom matches both null and undefined", () => {
    expect(runBody("  let a = null\n  let b = undefined\n  $out = (a == null) && (b == null)")).toBe(true);
    expect(evalExpr("0 == null")).toBe(false);
  });

  it("strict equality still distinguishes type", () => {
    expect(evalExpr("1 === '1'")).toBe(false);
    expect(evalExpr("null === undefined")).toBe(false);
    expect(evalExpr("0 === false")).toBe(false);
  });
});

describe("Relational compare — numeric AND lexicographic — REGRESSION", () => {
  // Previously `<`/`>` always coerced numerically, so string comparison
  // (and therefore alphabetical sorting) silently returned false.
  it("compares alphabetic strings lexicographically (like JS)", () => {
    expect(evalExpr("'b' > 'a'")).toBe(true);
    expect(evalExpr("'apple' < 'banana'")).toBe(true);
    expect(evalExpr("'Z' < 'a'")).toBe(true);
    expect(evalExpr("'abc' <= 'abc'")).toBe(true);
  });

  it("sorts an array of strings with a `a > b ? 1 : -1` comparator", () => {
    expect(evalExpr("['banana','apple','cherry'].sort((a,b) => a > b ? 1 : -1).join(',')"))
      .toBe("apple,banana,cherry");
  });

  it("keeps numeric-string comparison numeric (`\"5\" < \"10\"`)", () => {
    // Documented Aktion convenience: two numeric strings compare by value.
    expect(evalExpr("'5' < '10'")).toBe(true);
    expect(evalExpr("'100' > '99'")).toBe(true);
  });

  it("coerces Dates via valueOf (issue #3)", () => {
    expect(runBody("  let a = new Date(2020,0,1)\n  let b = new Date(2021,0,1)\n  $out = a < b")).toBe(true);
  });

  it("mixed number/string falls back to numeric coercion", () => {
    expect(evalExpr("5 > '3'")).toBe(true);
    expect(evalExpr("'10' >= 10")).toBe(true);
  });
});

describe("Logical & nullish operators short-circuit and return operands", () => {
  for (const expr of [
    "null || 'fallback'",
    "'primary' || 'fallback'",
    "0 && 'skipped'",
    "'ok' && 'result'",
    "0 ?? 'fallback'",
    "null ?? 'fallback'",
    "undefined ?? 0",
    "false || 0 || '' || 'last'",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }
});

describe("Bitwise, shift, typeof, unary", () => {
  for (const expr of [
    "12 & 10", "12 | 10", "12 ^ 10", "~5",
    "1 << 4", "-8 >> 1", "-1 >>> 28",
    "typeof 'x'", "typeof 5", "typeof true", "typeof undefined", "typeof {}", "typeof []",
    "!true", "!0", "!!'x'", "-(-5)", "+'42'", "void 0",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }
});

describe("Ternary & nested conditionals", () => {
  it("nested ternary chooses the right branch", () => {
    expect(runBody("  let n = 5\n  $out = n < 0 ? 'neg' : n == 0 ? 'zero' : 'pos'")).toBe("pos");
    expect(runBody("  let n = 0\n  $out = n < 0 ? 'neg' : n == 0 ? 'zero' : 'pos'")).toBe("zero");
  });
});

// ===========================================================================
// String method surface (dispatched to the host String.prototype)
// ===========================================================================

describe("String methods", () => {
  for (const expr of [
    "'hello'.toUpperCase()",
    "'HELLO'.toLowerCase()",
    "'  x  '.trim()",
    "'a,b,c'.split(',').length",
    "'hello world'.includes('o w')",
    "'hello'.startsWith('he')",
    "'hello'.endsWith('lo')",
    "'hello'.indexOf('l')",
    "'hello'.slice(1, 3)",
    "'hello'.substring(0, 2)",
    "'hello'.charAt(1)",
    "'hello'.charCodeAt(0)",
    "'5'.padStart(3, '0')",
    "'5'.padEnd(3, '-')",
    "'ab'.repeat(3)",
    "'a-b-c'.replace('-', '_')",
    "'a-b-c'.replaceAll('-', '_')",
    "'Hello'.at(-1)",
    "'café'.normalize().length",
    "'a'.localeCompare('b') < 0",
    "'  trim me  '.trimStart()",
    "'  trim me  '.trimEnd()",
    "'%20'.length",
    "String.fromCharCode(72, 105)",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }

  it("chains string methods", () => {
    expect(evalExpr("'  Hello World  '.trim().toLowerCase().split(' ').join('-')")).toBe("hello-world");
  });
});

// ===========================================================================
// Array method surface
// ===========================================================================

describe("Array methods", () => {
  for (const expr of [
    "[1,2,3].map(x => x * 2).join(',')",
    "[1,2,3,4].filter(x => x % 2 === 0).join(',')",
    "[1,2,3,4].reduce((a, b) => a + b, 0)",
    "[1,2,3,4].reduceRight((a, b) => a + '' + b, '')",
    "[1,2,3].find(x => x > 1)",
    "[1,2,3].findIndex(x => x > 1)",
    "[1,2,3,4].findLast(x => x < 3)",
    "[1,2,3].some(x => x > 2)",
    "[1,2,3].every(x => x > 0)",
    "[1,2,3].includes(2)",
    "[1,2,3].indexOf(2)",
    "[3,1,2].sort((a, b) => a - b).join(',')",
    "[1,2,3].reverse().join(',')",
    "[1,2,3].slice(1).join(',')",
    "[1,2,3].concat([4,5]).join(',')",
    "[[1],[2,3]].flat().join(',')",
    "[1,2,3].flatMap(x => [x, x]).join(',')",
    "[1,2,3].at(-1)",
    "[1,2,3].fill(0).join(',')",
    "['a','b','c'].entries().next().value.join(':')",
    "Array.from('abc').join(',')",
    "Array.of(1, 2, 3).length",
    "Array.isArray([1])",
    "[1,2,3].length",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }

  it("chains filter → map → reduce (a real data pipeline)", () => {
    expect(evalExpr("[1,2,3,4,5].filter(x => x % 2).map(x => x * 10).reduce((a, b) => a + b, 0)")).toBe(90);
  });

  it("builds an index object with reduce + destructured entry", () => {
    expect(evalExpr("[['a',1],['b',2]].reduce((o, [k, v]) => { o[k] = v; return o }, {}).b")).toBe(2);
  });

  it("forEach mutates a captured array", () => {
    expect(runBody("  let r = []\n  [1,2,3].forEach(x => r.push(x * 2))\n  $out = r.join(',')")).toBe("2,4,6");
  });
});

// ===========================================================================
// Object & JSON
// ===========================================================================

describe("Object & JSON helpers", () => {
  for (const expr of [
    "Object.keys({ a: 1, b: 2 }).join(',')",
    "Object.values({ a: 1, b: 2 }).join(',')",
    "Object.entries({ a: 1 }).length",
    "Object.fromEntries([['a', 1]]).a",
    "Object.assign({}, { a: 1 }, { b: 2 }).b",
    "JSON.stringify({ a: 1, b: [2, 3] })",
    "JSON.parse('[1,2,3]').length",
    "JSON.parse(JSON.stringify({ a: [1, { b: 2 }] })).a[1].b",
    "'a' in { a: 1 }",
    "'z' in { a: 1 }",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }

  it("spreads objects with later keys winning", () => {
    expect(evalExpr("({ ...{ a: 1, b: 1 }, ...{ b: 2 } }).b")).toBe(2);
  });

  it("supports computed property keys", () => {
    expect(runBody("  let k = 'dynamic'\n  let o = { [k]: 42 }\n  $out = o.dynamic")).toBe(42);
  });

  it("supports shorthand properties", () => {
    expect(runBody("  let a = 1\n  let b = 2\n  let o = { a, b }\n  $out = o.a + o.b")).toBe(3);
  });
});

// ===========================================================================
// Number & Math
// ===========================================================================

describe("Number & Math", () => {
  for (const expr of [
    "(3.14159).toFixed(2)",
    "(255).toString(16)",
    "(255).toString(2)",
    "Number('42')",
    "Number.isInteger(5)",
    "Number.isInteger(5.5)",
    "Number.isNaN(NaN)",
    "Number.parseFloat('3.5')",
    "Number.parseInt('0xFF', 16)",
    "parseInt('42px', 10)",
    "parseFloat('3.14abc')",
    "isNaN(parseInt('abc'))",
    "isFinite(42)",
    "Math.max(3, 7, 2)",
    "Math.min(3, 7, 2)",
    "Math.round(2.5)",
    "Math.floor(3.9)",
    "Math.ceil(3.1)",
    "Math.abs(-5)",
    "Math.trunc(4.7)",
    "Math.sign(-3)",
    "Math.pow(2, 10)",
    "Math.sqrt(81)",
    "Math.PI > 3.14",
  ]) {
    it(`matches JS: ${expr}`, () => expectMatchesJs(expr));
  }
});

// ===========================================================================
// Optional chaining & nullish access
// ===========================================================================

describe("Optional chaining & nullish access", () => {
  it("reads nested members safely", () => {
    expect(evalExpr("({ a: { b: 1 } })?.a?.b")).toBe(1);
    expect(evalExpr("({ a: null })?.a?.b ?? 'x'")).toBe("x");
    expect(evalExpr("[1,2,3]?.[1]")).toBe(2);
  });

  it("short-circuits optional method calls", () => {
    expect(runBody("  let o = { f: () => 7 }\n  $out = o.f?.()")).toBe(7);
    expect(runBody("  let o = {}\n  $out = (o.f?.() ?? 'none')")).toBe("none");
  });

  it("guards an undefined deep path used by real API-shaped data", () => {
    expect(runBody("  let resp = { data: undefined }\n  $out = resp.data?.items?.length ?? 0")).toBe(0);
  });
});

// ===========================================================================
// Spread & rest — REGRESSION (spread into user-function calls; rest params)
// ===========================================================================

describe("Spread in array / object / call positions", () => {
  it("spreads into array literals", () => {
    expect(evalExpr("[...[1,2], ...[3,4]].join(',')")).toBe("1,2,3,4");
  });

  it("spreads into object literals", () => {
    expect(evalExpr("({ ...{ a: 1 }, ...{ b: 2 } }).b")).toBe(2);
  });

  it("REGRESSION: spreads array args into a user function call", () => {
    expect(runBody("  function add3(a, b, c) { return a + b + c }\n  $out = add3(...[1, 2, 3])")).toBe(6);
  });

  it("mixes fixed + spread call args", () => {
    expect(runBody("  function add4(a, b, c, d) { return a + b + c + d }\n  $out = add4(1, ...[2, 3], 4)")).toBe(10);
  });

  it("spreads a Set into a call", () => {
    expect(runBody("  function count(...xs) { return xs.length }\n  $out = count(...new Set([1, 1, 2, 3]))")).toBe(3);
  });
});

describe("Rest parameters — REGRESSION", () => {
  it("gathers trailing args into an array (function)", () => {
    expect(runBody("  function sum(...ns) { return ns.reduce((a, b) => a + b, 0) }\n  $out = sum(1, 2, 3, 4)")).toBe(10);
  });

  it("gathers args after fixed params", () => {
    expect(runBody("  function tag(label, ...rest) { return label + ':' + rest.join(',') }\n  $out = tag('x', 1, 2, 3)")).toBe("x:1,2,3");
  });

  it("rest param in a lambda", () => {
    expect(runBody("  let join = (...xs) => xs.join('-')\n  $out = join('a', 'b', 'c')")).toBe("a-b-c");
  });

  it("empty rest is an empty array", () => {
    expect(runBody("  function f(...xs) { return xs.length }\n  $out = f()")).toBe(0);
  });
});

// ===========================================================================
// Destructuring — declarations, defaults, rename, holes, rest, NESTED
// ===========================================================================

describe("Destructuring declarations", () => {
  it("array destructuring", () => {
    expect(runBody("  let [a, b] = [1, 2]\n  $out = a + b")).toBe(3);
  });

  it("array destructuring with holes and rest", () => {
    expect(runBody("  let [, second, ...rest] = [1, 2, 3, 4]\n  $out = second + '|' + rest.join(',')")).toBe("2|3,4");
  });

  it("array element default", () => {
    expect(runBody("  let [a = 10, b = 20] = [1]\n  $out = a + ',' + b")).toBe("1,20");
  });

  it("object destructuring with rename + default", () => {
    expect(runBody("  let { x: localX, y = 5 } = { x: 1 }\n  $out = localX + ',' + y")).toBe("1,5");
  });

  it("object rest collects remaining keys", () => {
    expect(runBody("  let { a, ...rest } = { a: 1, b: 2, c: 3 }\n  $out = a + '|' + Object.keys(rest).join(',')")).toBe("1|b,c");
  });

  it("REGRESSION: nested object destructuring (`{ user: { name } }`)", () => {
    expect(runBody("  let { user: { name } } = { user: { name: 'Ada' } }\n  $out = name")).toBe("Ada");
  });

  it("REGRESSION: nested array destructuring (`[[a, b]]`)", () => {
    expect(runBody("  let [[a, b], [c]] = [[1, 2], [3]]\n  $out = a + ',' + b + ',' + c")).toBe("1,2,3");
  });

  it("mixed nested array + object destructuring of API-shaped data", () => {
    const r = runBody([
      "  let resp = { data: { items: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }] } }",
      "  let { data: { items: [first, second] } } = resp",
      "  $out = first.label + second.id",
    ].join("\n"));
    expect(r).toBe("A2");
  });
});

describe("Destructuring in function / lambda params", () => {
  it("object param with default", () => {
    expect(runBody("  function label({ text, tone = 'info' }) { return text + ':' + tone }\n  $out = label({ text: 'Hi' })")).toBe("Hi:info");
  });

  it("array param with rest", () => {
    expect(runBody("  function head([first, ...rest]) { return first + '|' + rest.length }\n  $out = head([10, 20, 30])")).toBe("10|2");
  });

  it("destructured lambda param", () => {
    expect(runBody("  let pick = ({ a, b }) => a + b\n  $out = pick({ a: 3, b: 4 })")).toBe(7);
  });
});

// ===========================================================================
// Control flow — for / while / do-while / switch / try-catch
// ===========================================================================

describe("Control flow statements", () => {
  it("classic for with break", () => {
    expect(runBody("  let s = 0\n  for (let i = 0; i < 10; i++) { if (i == 5) break\n s += i }\n  $out = s")).toBe(10);
  });

  it("classic for with continue", () => {
    expect(runBody("  let s = 0\n  for (let i = 0; i < 5; i++) { if (i % 2 == 0) continue\n s += i }\n  $out = s")).toBe(4);
  });

  it("for-of over an array", () => {
    expect(runBody("  let s = 0\n  for (const x of [1, 2, 3]) { s += x }\n  $out = s")).toBe(6);
  });

  it("REGRESSION: for-of with array destructuring over `.entries()`", () => {
    expect(runBody("  let r = []\n  for (const [i, v] of ['a', 'b'].entries()) { r.push(i + v) }\n  $out = r.join(',')")).toBe("0a,1b");
  });

  it("REGRESSION: for-of with destructuring over `Object.entries`", () => {
    expect(runBody("  let r = []\n  for (const [k, v] of Object.entries({ a: 1, b: 2 })) { r.push(k + '=' + v) }\n  $out = r.join(',')")).toBe("a=1,b=2");
  });

  it("REGRESSION: for-of with destructuring over a Map", () => {
    expect(runBody("  let m = new Map([['a', 1], ['b', 2]])\n  let s = 0\n  for (const [k, v] of m) { s += v }\n  $out = s")).toBe(3);
  });

  it("for-of with object destructuring over rows", () => {
    expect(runBody("  let rows = [{ id: 1, n: 'A' }, { id: 2, n: 'B' }]\n  let r = []\n  for (const { id, n } of rows) { r.push(id + n) }\n  $out = r.join(',')")).toBe("1A,2B");
  });

  it("for-in iterates object keys", () => {
    expect(runBody("  let r = []\n  for (const k in { a: 1, b: 2 }) { r.push(k) }\n  $out = r.join(',')")).toBe("a,b");
  });

  it("while loop with break / continue", () => {
    expect(runBody("  let i = 0\n  let s = 0\n  while (i < 5) { i++\n if (i % 2 == 0) continue\n s += i }\n  $out = s")).toBe(9);
  });

  it("do-while runs the body at least once", () => {
    expect(runBody("  let i = 0\n  let r = 0\n  do { r += i\n i++ } while (i < 3)\n  $out = r")).toBe(3);
  });

  it("nested loops accumulate", () => {
    expect(runBody("  let g = []\n  for (let r of [1, 2]) { for (let c of [10, 20]) { g.push(r * c) } }\n  $out = g.join(',')")).toBe("10,20,20,40");
  });
});

describe("switch statement", () => {
  it("matches a case and breaks", () => {
    expect(runBody("  switch (2) { case 1: $out = 'a'\n break\n case 2: $out = 'b'\n break\n default: $out = 'c' }")).toBe("b");
  });

  it("falls through without break", () => {
    expect(runBody("  let r = ''\n  switch (1) { case 1: r += 'a'\n case 2: r += 'b'\n break\n default: r += 'c' }\n  $out = r")).toBe("ab");
  });

  it("hits default when no case matches", () => {
    expect(runBody("  switch (99) { case 1: $out = 'a'\n break\n default: $out = 'd' }")).toBe("d");
  });

  it("matches with strict equality (string discriminant)", () => {
    expect(runBody("  let k = 'warn'\n  switch (k) { case 'ok': $out = 1\n break\n case 'warn': $out = 2\n break }")).toBe(2);
  });
});

describe("try / catch / finally", () => {
  it("catches a thrown Error and reads .message", () => {
    expect(runBody("  try { throw new Error('boom') } catch (e) { $out = e.message }")).toBe("boom");
  });

  it("catches a thrown plain value", () => {
    expect(runBody("  try { throw { code: 42 } } catch (e) { $out = e.code }")).toBe(42);
  });

  it("runs finally on both paths", () => {
    expect(runBody("  let r = ''\n  try { r += 't'\n throw 1 } catch (e) { r += 'c' } finally { r += 'f' }\n  $out = r")).toBe("tcf");
    expect(runBody("  let r = ''\n  try { r += 't' } catch (e) { r += 'c' } finally { r += 'f' }\n  $out = r")).toBe("tf");
  });

  it("does not enter catch when nothing throws", () => {
    expect(runBody("  try { $out = 'ok' } catch (e) { $out = 'caught' }")).toBe("ok");
  });
});

// ===========================================================================
// Functions — closures, recursion, defaults, hoisting
// ===========================================================================

describe("Functions, closures & recursion", () => {
  it("a nested function closes over its argument", () => {
    expect(runBody("  function add(a) { return (b) => a + b }\n  $out = add(3)(4)")).toBe(7);
  });

  it("recursion (factorial)", () => {
    expect(runBody("  function f(n) { return n <= 1 ? 1 : n * f(n - 1) }\n  $out = f(5)")).toBe(120);
  });

  it("recursion (fibonacci)", () => {
    expect(runBody("  function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) }\n  $out = fib(10)")).toBe(55);
  });

  it("default parameters", () => {
    expect(runBody("  function greet(name, prefix = 'Hello') { return prefix + ', ' + name }\n  $out = greet('Ada')")).toBe("Hello, Ada");
  });

  it("early return", () => {
    expect(runBody("  function g(x) { if (x > 0) return 'pos'\n return 'neg' }\n  $out = g(-1)")).toBe("neg");
  });

  it("higher-order: passing a named helper as a callback", () => {
    expect(runBody("  function dbl(x) { return x * 2 }\n  $out = [1, 2, 3].map(dbl).join(',')")).toBe("2,4,6");
  });
});

// ===========================================================================
// Template literals
// ===========================================================================

describe("Template literals", () => {
  it("interpolates and nests", () => {
    expect(evalExpr("`a${1 + 1}b${`c${2}`}`")).toBe("a2bc2");
  });

  it("interpolates expressions and method calls", () => {
    expect(runBody("  let user = { name: 'ada' }\n  $out = `Hi ${user.name.toUpperCase()}!`")).toBe("Hi ADA!");
  });

  it("preserves a literal newline", () => {
    expect(evalExpr("`a\nb`")).toBe("a\nb");
  });
});

// ===========================================================================
// Built-in constructors (Date, Map, Set)
// ===========================================================================

describe("Built-in constructors via new", () => {
  it("Date", () => {
    expect(evalExpr("new Date(0).getTime()")).toBe(0);
    expect(runBody("  let d = new Date(2020, 0, 15)\n  $out = d.getFullYear()")).toBe(2020);
  });

  it("Map", () => {
    expect(evalExpr("new Map([[1, 2]]).get(1)")).toBe(2);
    expect(runBody("  let m = new Map()\n  m.set('k', 9)\n  $out = m.get('k')")).toBe(9);
  });

  it("Set", () => {
    expect(evalExpr("new Set([1, 1, 2, 3]).size")).toBe(3);
    expect(runBody("  let s = new Set()\n  s.add(1)\n  s.add(1)\n  $out = s.has(1) && s.size === 1")).toBe(true);
  });

  it("instanceof works on host constructors", () => {
    expect(evalExpr("new Date() instanceof Date")).toBe(true);
    expect(evalExpr("[] instanceof Array")).toBe(true);
  });
});

// ===========================================================================
// Documented limitations — tracked so a future change that lifts them is
// noticed. These are NOT valid Aktion today (clear parse errors).
// ===========================================================================

describe("Known parser limitations (tracked, not yet supported)", () => {
  it("destructuring ASSIGNMENT to existing bindings is unsupported", () => {
    // `let [a, b] = …` (declaration) works; reassigning existing vars via a
    // pattern does not. Workaround: use a temp or assign individually.
    expect(parseErrors("function f(_){ let a=1\n let b=2\n [a,b]=[b,a] }\naktion = Text(\"ok\")").length)
      .toBeGreaterThan(0);
  });

  it("labeled statements (`outer:` + labeled break/continue) are unsupported", () => {
    expect(parseErrors("function f(_){ outer: for(let i=0;i<2;i++){ continue outer } }\naktion = Text(\"ok\")").length)
      .toBeGreaterThan(0);
  });
});
