/**
 * Permanent regression coverage for the Aktion LANGUAGE CORE — the parser
 * (`src/parser/`) and the evaluator (`src/runtime/evaluator.ts`).
 *
 * This file deliberately EXTENDS the existing language suites rather than
 * repeating them. Already pinned elsewhere (and therefore only referenced
 * here, never re-asserted):
 *
 *   - `tests/parser.test.ts`          — AST shapes for assignments, state refs,
 *                                       member access, ternaries, backtick
 *                                       strings, `//` comments, `function`
 *                                       declaration kinds.
 *   - `tests/js-semantics-comprehensive.test.ts` — the big JS-parity tables for
 *                                       arithmetic, loose/strict equality,
 *                                       bitwise, the String/Array/Object/Math
 *                                       method surface, destructuring, control
 *                                       flow, template literals, `new`.
 *   - `tests/number-literals.test.ts`, `tests/string-escapes.test.ts`,
 *     `tests/regex-literals.test.ts`, `tests/relational-coercion.test.ts`,
 *     `tests/array-callbacks.test.ts`, `tests/util-extended.test.ts`,
 *     `tests/language-concepts.test.ts`, `tests/suis2-one-positional.test.ts`.
 *
 * What this file adds:
 *
 *   1. Literal coverage the other suites skip: the documented template-literal
 *      `quasis.length === expressions.length + 1` invariant (incl. boundary
 *      interpolations), quoted / numeric / duplicate object keys, trailing
 *      commas, and value-level checks for exponent / radix / separator numbers.
 *   2. The full precedence ladder and every associativity rule as ONE
 *      JS-parity assertion per rule.
 *   3. Short-circuiting as an OBSERVABLE EFFECT — `&&`, `||`, `??`, `?:` and
 *      `?.()` must not merely return the right value, they must not RUN the
 *      skipped side. Each has a positive control so the probe itself is proven
 *      able to observe an evaluation.
 *   4. The evaluator's total-function safety contracts: reading through
 *      null, calling a missing method, and spreading a non-iterable degrade to
 *      a nullish value instead of throwing (JS would throw — an Aktion program
 *      is streamed half-written, so it must never explode).
 *   5. Closures: currying, independent instances, captured-container mutation.
 *   6. Block comments through `parse()` (previously only tokenizer-level).
 *   7. A DSL-level `$util.*` behaviour table (existing coverage goes through the
 *      legacy `@Name` builtins or imports `Util` directly).
 *   8. Aktion 0.5 §19.1 one-positional-argument rule through
 *      `validateProgram(source, library)` — the combined parse+schema entry
 *      point that no other test exercises — with valid AND invalid call shapes,
 *      plus a render-level proof that the three legal call shapes are
 *      equivalent.
 *   9. Error paths: a malformed program yields a diagnostic (never a throw,
 *      never a hang) AND keeps the statements it could recover, so the host can
 *      still render the committed prefix.
 *
 * Assertions are deliberately about what an AUTHOR observes (values, emitted
 * diagnostics, DOM equivalence) — never a hex colour, class string, or message
 * verbatim. Diagnostic assertions match the author-facing nouns (the component
 * name, the offending prop / token) and a plausible line number, so re-wording
 * a message does not break the suite.
 */

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import type { ParseError } from "../src/parser/types.js";
import { StateStore, createContext, planProgram } from "../src/runtime/index.js";
import { defaultLibrary, validateProgram } from "../src/library/index.js";
import "../src/index.js";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Run `body` as the body of an action and return whatever it wrote to `$out`.
 * Mirrors the harness in `js-semantics-comprehensive.test.ts` so the two files
 * describe the same execution model.
 */
function runBody(body: string): unknown {
  const src = [
    "function go(_) {",
    body,
    "}",
    "$out = null",
    "run = go(0)",
    'aktion = Text("ok")',
  ].join("\n");
  const program = parse(src);
  if (program.errors.length > 0) {
    throw new Error(
      "unexpected parse error: " +
        program.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join("; "),
    );
  }
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary });
  planProgram(program, ctx);
  void ctx.bindings.get("run")?.();
  return state.get("out");
}

/** Evaluate a single Aktion expression. */
function ev(expr: string): unknown {
  return runBody(`  $out = ${expr}`);
}

/** Assert Aktion produces the SAME value real JavaScript does. */
function expectMatchesJs(expr: string): void {
  // eslint-disable-next-line no-eval
  const jsValue = eval(`(${expr})`);
  expect(ev(expr), `Aktion must match JS for \`${expr}\``).toEqual(jsValue);
}

/** Parse + schema-validate a whole program the way a host does. */
function diagnose(src: string): { errors: ParseError[]; statementCount: number } {
  const program = validateProgram(src, defaultLibrary);
  return { errors: program.errors, statementCount: program.statements.length };
}

const messagesOf = (errors: ParseError[]): string => errors.map((e) => e.message).join(" | ");

/**
 * Count how many times a side effect ran while evaluating `body`. The counter
 * is an array because pushing into a captured container is the reliable way to
 * observe an effect from inside a lambda.
 */
function sideEffectCount(setupAndExpr: string): number {
  const value = runBody(
    ["  let calls = []", "  let side = () => { calls.push(1); return 'ran' }", setupAndExpr, "  $out = calls.length"].join("\n"),
  );
  return value as number;
}

/* -------------------------------------------------------------------------- */
/*  1. Literals                                                               */
/* -------------------------------------------------------------------------- */

describe("Literals — strings", () => {
  it("decodes escapes in both quote styles identically", () => {
    expect(ev(`"a\\tb"`)).toBe("a\tb");
    expect(ev(`'a\\tb'`)).toBe("a\tb");
    expect(ev(`"a\\nb"`)).toBe("a\nb");
    expect(ev(`"a\\\\b"`)).toBe("a\\b");
  });

  it("lets each quote style carry the other quote unescaped", () => {
    expect(ev(`"it's"`)).toBe("it's");
    expect(ev(`'say "hi"'`)).toBe('say "hi"');
  });

  it("decodes the escaped delimiter of its own quote style", () => {
    expect(ev(`"say \\"hi\\""`)).toBe('say "hi"');
    expect(ev(`'it\\'s'`)).toBe("it's");
  });

  it("decodes \\uXXXX, \\u{...} and \\xXX to real characters", () => {
    expect(ev(`"caf\\u00e9"`)).toBe("café");
    expect(ev(`"\\x41BC"`)).toBe("ABC");
    expect(ev(`"\\u{1F600}"`)).toBe("\u{1F600}");
  });

  it("keeps comment markers inside a string literal as data", () => {
    expect(ev(`"a // b"`)).toBe("a // b");
    expect(ev(`"a /* b */ c"`)).toBe("a /* b */ c");
    expect(ev(`"https://example.com/path"`)).toBe("https://example.com/path");
  });

  it("an empty string is a real value, not a missing one", () => {
    expect(ev(`""`)).toBe("");
    expect(ev(`"" === ""`)).toBe(true);
    expect(ev(`"" ?? "fallback"`)).toBe("");
  });
});

describe("Literals — template interpolation", () => {
  /** The Template AST node for `x = <template>`. */
  function templateNode(source: string): { kind: string; quasis?: string[]; expressions?: unknown[] } {
    const program = parse(`x = ${source}\naktion = Text("y")`);
    expect(program.errors, `parse errors for ${source}`).toEqual([]);
    return program.statements[0]!.expression as { kind: string; quasis?: string[]; expressions?: unknown[] };
  }

  it("holds the documented invariant quasis.length === expressions.length + 1", () => {
    for (const source of ["`a${1}b`", "`${1}`", "`${1}${2}`", "`a${1}b${2}`", "`${1}tail`"]) {
      const node = templateNode(source);
      expect(node.kind, source).toBe("Template");
      expect(node.quasis!.length, `quasis for ${source}`).toBe(node.expressions!.length + 1);
    }
  });

  it("keeps an empty boundary chunk when the template starts or ends with an interpolation", () => {
    expect(templateNode("`${1}`").quasis).toEqual(["", ""]);
    expect(templateNode("`${1}${2}`").quasis).toEqual(["", "", ""]);
    expect(templateNode("`lead${1}`").quasis).toEqual(["lead", ""]);
  });

  it("a backtick string with no interpolation collapses to a plain string literal", () => {
    const node = templateNode("`plain`");
    expect(node.kind).toBe("Literal");
    expect(ev("`plain`")).toBe("plain");
  });

  it("interpolates expressions, member chains, and method calls", () => {
    expect(runBody('  let u = { name: "ada" }\n  $out = `Hi ${u.name.toUpperCase()}!`')).toBe("Hi ADA!");
    expect(ev("`sum=${1 + 2 * 3}`")).toBe("sum=7");
    expect(ev("`${[1,2,3].filter(n => n > 1).join('+')}`")).toBe("2+3");
  });

  it("supports a nested template inside an interpolation", () => {
    expect(ev("`a${`n${2}`}b`")).toBe("an2b");
  });

  it("preserves literal newlines and decodes escapes in the chunks", () => {
    expect(ev("`one\ntwo`")).toBe("one\ntwo");
    expect(ev("`tab\\there`")).toBe("tab\there");
  });

  it("keeps `//` inside a template chunk as data", () => {
    expect(ev("`http://x // y`")).toBe("http://x // y");
  });

  it("interpolates a nullish value as EMPTY text, so the UI never shows \"null\"", () => {
    // A deliberate Aktion divergence from JS (`${null}` would print "null"):
    // a half-loaded value must not leak the word "null" into rendered copy.
    expect(ev("`v=${null}`")).toBe("v=");
    expect(runBody("  let o = {}\n  $out = `v=${o.missing}`")).toBe("v=");
  });

  it("interpolates booleans and numbers as their text, and structures as JSON", () => {
    expect(ev("`v=${1 == 2}`")).toBe("v=false");
    expect(ev("`v=${3 * 4}`")).toBe("v=12");
    // An array interpolates through its own toString (JS parity)…
    expect(ev("`v=${[1,2]}`")).toBe("v=1,2");
    // …and a plain object as JSON rather than JS's useless "[object Object]".
    expect(ev("`v=${({ a: 1 })}`")).toBe('v={"a":1}');
  });
});

describe("Literals — numbers", () => {
  it("evaluates float, exponent, and signed-exponent forms to their JS values", () => {
    for (const expr of ["1.5", "-1.5", "2e3", "2E3", "1.5e-3", "-1.5e-3", "1e+2", ".5 + .5"]) {
      expectMatchesJs(expr);
    }
  });

  it("evaluates radix literals and digit separators as numbers, not strings", () => {
    expect(ev("0xff")).toBe(255);
    expect(ev("0b101")).toBe(5);
    expect(ev("0o17")).toBe(15);
    expect(ev("1_000_000 / 1_000")).toBe(1000);
    expect(ev("0xff + 1")).toBe(256);
  });

  it("keeps a negative literal negative through arithmetic and member position", () => {
    expect(ev("-3 + 1")).toBe(-2);
    expect(ev("[1, -2, 3][1]")).toBe(-2);
    expect(ev("({ n: -2 }).n")).toBe(-2);
  });

  it("keeps float arithmetic IEEE-identical to JS (no silent rounding)", () => {
    for (const expr of ["0.1 + 0.2", "1 / 3", "(0.1 + 0.2).toFixed(2)"]) expectMatchesJs(expr);
  });
});

describe("Literals — booleans, null, and the null/undefined split", () => {
  it("true / false are boolean values, not strings", () => {
    expect(ev("true")).toBe(true);
    expect(ev("false")).toBe(false);
    expect(ev("typeof true")).toBe("boolean");
  });

  it("null is distinguishable from undefined by === and by ??", () => {
    expect(ev("null === null")).toBe(true);
    expect(ev("null == undefined")).toBe(true);
    expect(ev("null === undefined")).toBe(false);
    expect(ev("null ?? 'x'")).toBe("x");
    expect(ev("undefined ?? 'x'")).toBe("x");
  });

  it("null is falsy but not equal to false", () => {
    expect(ev("!null")).toBe(true);
    expectMatchesJs("null == false");
  });
});

describe("Literals — arrays and objects", () => {
  it("accepts a trailing comma in arrays, objects, and argument lists", () => {
    expect(ev("[1, 2, 3,].length")).toBe(3);
    expect(ev("({ a: 1, b: 2, }).b")).toBe(2);
    expect(parse(`aktion = Text("x",)`).errors).toEqual([]);
  });

  it("nests arrays and objects to arbitrary depth", () => {
    expect(ev("[[1, [2, [3]]]][0][1][1][0]")).toBe(3);
    expect(ev("({ a: { b: { c: [1, { d: 4 }] } } }).a.b.c[1].d")).toBe(4);
  });

  it("supports quoted and numeric object keys", () => {
    expect(ev(`({ "a-b": 1 })["a-b"]`)).toBe(1);
    expect(ev(`({ 1: "x" })["1"]`)).toBe("x");
  });

  it("resolves a duplicate key to the last one written (JS object semantics)", () => {
    expect(ev("({ a: 1, a: 2 }).a")).toBe(2);
  });

  it("an explicit key after a spread overrides the spread value", () => {
    expect(ev("({ ...{ a: 1, b: 1 }, b: 2 }).b")).toBe(2);
    expect(ev("({ b: 2, ...{ a: 1, b: 1 } }).b")).toBe(1);
  });

  it("evaluates a computed key at runtime", () => {
    expect(runBody("  let k = 'dyn' + 'amic'\n  $out = ({ [k]: 42 }).dynamic")).toBe(42);
  });

  it("array literals are independent values, not shared references", () => {
    expect(runBody("  let a = [1]\n  let b = [1]\n  a.push(2)\n  $out = a.length + ':' + b.length")).toBe("2:1");
  });
});

describe("Literals — regex", () => {
  it("honours flags and capture groups through the String methods", () => {
    expect(ev("/ab/i.test('AB')")).toBe(true);
    expect(ev("/ab/.test('AB')")).toBe(false);
    expect(ev("'a1b2'.match(/[0-9]/g).join(',')")).toBe("1,2");
    expect(ev("'2024-01-02'.replace(/([0-9]+)-([0-9]+)-([0-9]+)/, '$3/$2/$1')")).toBe("02/01/2024");
    expect(ev("'a,b;c'.split(/[,;]/).join('|')")).toBe("a|b|c");
  });

  it("a regex bound to a variable keeps working when reused", () => {
    expect(runBody("  let re = /a/g\n  $out = 'aa'.replace(re, 'b')")).toBe("bb");
  });

  it("still reads `/` after a value as division", () => {
    expect(ev("10 / 2 / 5")).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  2. Operator precedence & associativity                                    */
/* -------------------------------------------------------------------------- */

describe("Operator precedence — the whole ladder matches JS", () => {
  // One expression per adjacent pair in the ladder, so a mis-ordered parser
  // level fails a specific test rather than a vague one.
  const LADDER: Array<[string, string]> = [
    ["unary binds tighter than multiplicative", "-2 * 3"],
    ["multiplicative binds tighter than additive", "2 + 3 * 4"],
    ["additive binds tighter than shift", "1 + 2 << 3"],
    ["shift binds tighter than relational", "1 << 2 > 3"],
    ["relational binds tighter than equality", "1 < 2 == true"],
    ["equality binds tighter than bitwise AND", "1 & 1 == 1"],
    ["bitwise AND binds tighter than XOR", "1 ^ 3 & 2"],
    ["bitwise XOR binds tighter than OR", "1 | 2 ^ 3"],
    ["bitwise OR binds tighter than logical AND", "0 | 1 && 2"],
    ["logical AND binds tighter than logical OR", "false || true && false"],
    ["logical OR binds tighter than the ternary", "false || true ? 'y' : 'n'"],
    ["parentheses override every level", "(2 + 3) * 4"],
    ["a long mixed expression", "1 + 2 * 3 - 4 / 2 + (5 % 3)"],
  ];
  for (const [name, expr] of LADDER) {
    it(`${name} (\`${expr}\`)`, () => expectMatchesJs(expr));
  }
});

describe("Associativity", () => {
  it("additive and multiplicative operators are left-associative", () => {
    expectMatchesJs("10 - 4 - 3");
    expectMatchesJs("100 / 5 / 2");
    expectMatchesJs("2 - 3 + 4");
  });

  it("exponentiation is RIGHT-associative", () => {
    expect(ev("2 ** 3 ** 2")).toBe(512);
    expect(ev("(2 ** 3) ** 2")).toBe(64);
  });

  it("the ternary is right-associative so an `a ? … : b ? … : c` chain reads top-down", () => {
    expect(ev("false ? 'a' : false ? 'b' : 'c'")).toBe("c");
    expect(ev("false ? 'a' : true ? 'b' : 'c'")).toBe("b");
    expect(ev("true ? 'a' : true ? 'b' : 'c'")).toBe("a");
  });

  it("a ternary nested in the consequent still picks the right branch", () => {
    expect(ev("true ? (false ? 'a' : 'b') : 'c'")).toBe("b");
  });

  it("`+` chains left-to-right, so an early string makes the whole chain concatenate", () => {
    expect(ev("'a' + 1 + 2")).toBe("a12");
    expect(ev("1 + 2 + 'a'")).toBe("3a");
  });

  it("unary `!` binds tighter than comparison", () => {
    expectMatchesJs("!false === true");
    expectMatchesJs("!0 + 1");
  });
});

/* -------------------------------------------------------------------------- */
/*  3. Comparison & equality                                                  */
/* -------------------------------------------------------------------------- */

describe("Equality semantics", () => {
  it("`==` performs JS abstract equality across types, including object coercion", () => {
    for (const expr of ["1 == '1'", "'0' == false", "[] == false", "[1] == 1", "undefined == false", "null == 0"]) {
      expectMatchesJs(expr);
    }
  });

  it("`===` never coerces", () => {
    expect(ev("1 === '1'")).toBe(false);
    expect(ev("0 === false")).toBe(false);
    expect(ev("'' === false")).toBe(false);
  });

  it("NaN is not equal to itself under either operator", () => {
    expect(ev("NaN === NaN")).toBe(false);
    expect(ev("NaN == NaN")).toBe(false);
    expect(ev("Number.isNaN(NaN)")).toBe(true);
  });

  it("two structurally-identical objects are different values", () => {
    expect(ev("({ a: 1 }) === ({ a: 1 })")).toBe(false);
    expect(runBody("  let o = { a: 1 }\n  let p = o\n  $out = o === p")).toBe(true);
  });

  it("`!=` and `!==` are the exact negations of their positive forms", () => {
    for (const expr of ["1 != '1'", "1 !== '1'", "null != undefined", "null !== undefined"]) {
      expectMatchesJs(expr);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  4. Short-circuiting is an observable effect, not just a returned value    */
/* -------------------------------------------------------------------------- */

describe("Short-circuiting skips EVALUATION, not just the result", () => {
  it("positive control: the probe can observe an evaluation", () => {
    expect(sideEffectCount("  let r = side()")).toBe(1);
    expect(sideEffectCount("  let r = true && side()")).toBe(1);
    expect(sideEffectCount("  let r = false || side()")).toBe(1);
  });

  it("`&&` does not run its right side when the left is falsy", () => {
    expect(sideEffectCount("  let r = false && side()")).toBe(0);
    expect(sideEffectCount("  let r = 0 && side()")).toBe(0);
    expect(sideEffectCount("  let r = null && side()")).toBe(0);
  });

  it("`||` does not run its right side when the left is truthy", () => {
    expect(sideEffectCount("  let r = true || side()")).toBe(0);
    expect(sideEffectCount("  let r = 'x' || side()")).toBe(0);
  });

  it("`??` does not run its right side for a falsy-but-present left (unlike `||`)", () => {
    expect(sideEffectCount("  let r = 0 ?? side()")).toBe(0);
    expect(sideEffectCount("  let r = '' ?? side()")).toBe(0);
    expect(sideEffectCount("  let r = false ?? side()")).toBe(0);
    // …but it DOES run for null / undefined.
    expect(sideEffectCount("  let r = null ?? side()")).toBe(1);
  });

  it("`??` and `||` disagree exactly on the falsy-but-present values", () => {
    expect(ev("0 ?? 'fallback'")).toBe(0);
    expect(ev("0 || 'fallback'")).toBe("fallback");
    expect(ev("'' ?? 'fallback'")).toBe("");
    expect(ev("'' || 'fallback'")).toBe("fallback");
    expect(ev("false ?? 'fallback'")).toBe(false);
    expect(ev("false || 'fallback'")).toBe("fallback");
  });

  it("logical operators return the deciding OPERAND, not a coerced boolean", () => {
    for (const expr of ["1 && 2 && 3", "0 || '' || 'last'", "'a' && 0", "null ?? undefined ?? 'z'"]) {
      expectMatchesJs(expr);
    }
  });

  it("a ternary runs only the branch it selects", () => {
    expect(sideEffectCount("  let r = true ? 1 : side()")).toBe(0);
    expect(sideEffectCount("  let r = false ? side() : 1")).toBe(0);
    expect(sideEffectCount("  let r = false ? 1 : side()")).toBe(1);
  });

  it("an optional call on a nullish target does not evaluate its arguments", () => {
    expect(sideEffectCount("  let o = null\n  let r = o?.method(side())")).toBe(0);
    expect(sideEffectCount("  let o = { method: (x) => x }\n  let r = o?.method(side())")).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  5. Member access, computed access, optional chaining                      */
/* -------------------------------------------------------------------------- */

describe("Member and computed access", () => {
  it("reads a dotted chain and a computed key equivalently", () => {
    expect(runBody("  let o = { a: { b: 7 } }\n  $out = o.a.b")).toBe(7);
    expect(runBody("  let o = { a: { b: 7 } }\n  let k = 'b'\n  $out = o.a[k]")).toBe(7);
  });

  it("indexes arrays and strings by number", () => {
    expect(ev("[10, 20, 30][1]")).toBe(20);
    expect(ev("'abc'[1]")).toBe("b");
  });

  it("a NEGATIVE array index counts back from the end (an Aktion convenience)", () => {
    expect(ev("[1, 2, 3][-1]")).toBe(3);
    expect(ev("[1, 2, 3][-3]")).toBe(1);
    expect(ev("'abc'[-1]")).toBe("c");
  });

  it("an out-of-range index yields undefined rather than throwing", () => {
    expect(ev("[1, 2, 3][10]")).toBeUndefined();
    expect(ev("[1, 2, 3][-10]")).toBeUndefined();
  });

  it("a missing object property is undefined, and a computed string key reads it", () => {
    expect(ev("({ a: 1 }).missing")).toBeUndefined();
    expect(ev("({ 'a-b': 1 })['a-b']")).toBe(1);
  });

  it("member reads chain through call results and array methods", () => {
    expect(ev("[{ n: 1 }, { n: 2 }].filter(r => r.n > 1)[0].n")).toBe(2);
  });
});

describe("Optional chaining & nullish access", () => {
  it("`?.` short-circuits the WHOLE remaining chain, not just one hop", () => {
    expect(runBody("  let o = null\n  $out = o?.a.b.c")).toBeUndefined();
    expect(runBody("  let o = { a: null }\n  $out = o.a?.b.c")).toBeUndefined();
  });

  it("`?.[key]` and `?.()` short-circuit the same way", () => {
    expect(runBody("  let o = null\n  $out = o?.['a']")).toBeUndefined();
    expect(runBody("  let o = null\n  $out = o?.fn()")).toBeUndefined();
    expect(runBody("  let f = null\n  $out = f?.()")).toBeUndefined();
  });

  it("`?.` is transparent when the value IS present", () => {
    expect(runBody("  let o = { a: { b: 1 } }\n  $out = o?.a?.b")).toBe(1);
    expect(runBody("  let o = { a: [9] }\n  $out = o?.a?.[0]")).toBe(9);
    expect(runBody("  let o = { fn: () => 5 }\n  $out = o?.fn()")).toBe(5);
  });

  it("`?.` combined with `??` gives the documented safe-default idiom", () => {
    expect(runBody("  let api = { data: null }\n  $out = api?.data?.rows?.length ?? 0")).toBe(0);
    expect(runBody("  let api = { data: { rows: [1, 2] } }\n  $out = api?.data?.rows?.length ?? 0")).toBe(2);
  });
});

describe("Evaluator safety contracts — a half-written program must not explode", () => {
  it("reading a property through null / undefined yields undefined instead of throwing", () => {
    expect(() => ev("(null).a")).not.toThrow();
    expect(ev("(null).a")).toBeUndefined();
    expect(runBody("  let o = { a: null }\n  $out = o.a")).toBeNull();
  });

  it("calling a method that does not exist yields a nullish value instead of throwing", () => {
    for (const expr of ["'abc'.definitelyNotAMethod()", "[1].definitelyNotAMethod()", "({}).definitelyNotAMethod()"]) {
      expect(() => ev(expr), expr).not.toThrow();
      expect(ev(expr), expr).toBeNull();
    }
  });

  it("an unknown identifier is nullish rather than a thrown ReferenceError", () => {
    expect(() => ev("neverDeclaredAnywhere")).not.toThrow();
    expect(ev("neverDeclaredAnywhere == null")).toBe(true);
  });

  it("spreading a non-iterable is ignored instead of throwing", () => {
    for (const expr of ["[...5].length", "[...true].length", "[...({ a: 1 })].length"]) {
      expect(() => ev(expr), expr).not.toThrow();
      expect(ev(expr), expr).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  6. Spread                                                                 */
/* -------------------------------------------------------------------------- */

describe("Spread", () => {
  it("spreads a string into its characters (JS iterable semantics)", () => {
    expect(ev("[...'ab'].join('|')")).toBe("a|b");
  });

  it("spreads arrays into array literals, keeping order around fixed elements", () => {
    expect(ev("[0, ...[1, 2], 3].join(',')")).toBe("0,1,2,3");
  });

  it("spreads into a host call and into a user function", () => {
    expect(ev("Math.max(...[1, 9, 3])")).toBe(9);
    expect(runBody("  function s(a, b, c) { return a + b + c }\n  $out = s(...[1, 2, 3])")).toBe(6);
  });

  it("spreads a computed array — the value need not be a literal", () => {
    expect(runBody("  let xs = [1, 2].map(n => n * 5)\n  $out = Math.max(...xs)")).toBe(10);
    expect(runBody("  let xs = [1, 2]\n  let ys = [0, ...xs, 3]\n  $out = ys.join(',')")).toBe("0,1,2,3");
  });

  it("spreads twice in the same literal, preserving order", () => {
    expect(ev("[...[1,2], ...[3,4]].join(',')")).toBe("1,2,3,4");
    expect(ev("({ ...{ a: 1 }, ...{ a: 2, b: 3 } }).a")).toBe(2);
  });

  it("object spread copies own enumerable keys and is a shallow copy", () => {
    expect(runBody("  let src = { a: { deep: 1 } }\n  let copy = { ...src }\n  $out = copy.a === src.a")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  7. Arrow functions & closures                                             */
/* -------------------------------------------------------------------------- */

describe("Arrow functions & closures", () => {
  it("supports the bare-parameter, parenthesised, default, and rest forms", () => {
    expect(runBody("  let f = a => a + 1\n  $out = f(1)")).toBe(2);
    expect(runBody("  let f = (a, b) => a + b\n  $out = f(1, 2)")).toBe(3);
    expect(runBody("  let f = (a = 5) => a\n  $out = f()")).toBe(5);
    expect(runBody("  let f = (...xs) => xs.length\n  $out = f(1, 2, 3)")).toBe(3);
  });

  it("a block-bodied arrow needs `return`; an expression-bodied one does not", () => {
    expect(runBody("  let f = (a) => { return a * 2 }\n  $out = f(3)")).toBe(6);
    expect(runBody("  let f = (a) => a * 2\n  $out = f(3)")).toBe(6);
  });

  it("curries — an arrow returning an arrow closes over the outer parameter", () => {
    expect(runBody("  let add = a => b => a + b\n  $out = add(2)(3)")).toBe(5);
    expect(runBody("  let scale = n => xs => xs.map(x => x * n)\n  $out = scale(3)([1, 2]).join(',')")).toBe("3,6");
  });

  it("each closure instance captures its OWN parameter value", () => {
    expect(runBody("  function mk(n) { return () => n }\n  let a = mk(1)\n  let b = mk(2)\n  $out = a() + ':' + b()")).toBe("1:2");
  });

  it("mutations to a captured container persist across calls", () => {
    expect(
      runBody("  let acc = []\n  let add = (x) => { acc.push(x) }\n  add(1)\n  add(2)\n  $out = acc.join(',')"),
    ).toBe("1,2");
    expect(
      runBody("  function mk() { let s = { c: 0 }\n    return () => { s.c = s.c + 1\n      return s.c } }\n  let inc = mk()\n  inc()\n  inc()\n  $out = inc()"),
    ).toBe(3);
  });

  it("a closure reads an outer binding declared before it", () => {
    expect(runBody("  let base = 10\n  function add(n) { return base + n }\n  $out = add(5)")).toBe(15);
  });

  it("a `for (let i …)` body captures i per iteration (JS `let` semantics)", () => {
    expect(
      runBody("  let fns = []\n  for (let i = 0; i < 3; i = i + 1) { fns.push(() => i) }\n  $out = fns.map(f => f()).join(',')"),
    ).toBe("0,1,2");
  });

  it("arrows compose as higher-order callbacks over real data", () => {
    expect(
      runBody(
        [
          "  let rows = [{ n: 'a', v: 3 }, { n: 'b', v: 1 }, { n: 'c', v: 2 }]",
          "  let by = key => (x, y) => x[key] - y[key]",
          "  $out = rows.slice(0).sort(by('v')).map(r => r.n).join('')",
        ].join("\n"),
      ),
    ).toBe("bca");
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Array methods the DSL relies on                                        */
/* -------------------------------------------------------------------------- */

describe("Array methods — pipeline behaviour", () => {
  it("map/filter/reduce compose into a data pipeline", () => {
    expect(ev("[1,2,3,4,5].filter(x => x % 2 === 1).map(x => x * 10).reduce((a, b) => a + b, 0)")).toBe(90);
  });

  it("reduce works with and without an initial value", () => {
    expect(ev("[1,2,3].reduce((a, b) => a + b)")).toBe(6);
    expect(ev("[1,2,3].reduce((a, b) => a + b, 10)")).toBe(16);
    expect(ev("[].reduce((a, b) => a + b, 0)")).toBe(0);
  });

  it("reduce can build an object index (the group-rows idiom)", () => {
    expect(runBody("  let o = ['a','b'].reduce((acc, k, i) => { acc[k] = i; return acc }, {})\n  $out = o.a + ':' + o.b")).toBe("0:1");
  });

  it("find/findIndex report a miss as undefined / -1, not as a throw", () => {
    expect(ev("[1,2].find(x => x > 9)")).toBeUndefined();
    expect(ev("[1,2].findIndex(x => x > 9)")).toBe(-1);
  });

  it("some/every use the JS vacuous-truth convention on an empty array", () => {
    expect(ev("[].every(x => false)")).toBe(true);
    expect(ev("[].some(x => true)")).toBe(false);
  });

  it("sort with a comparator orders numbers and object fields", () => {
    expect(ev("[3,1,2].sort((a, b) => a - b).join(',')")).toBe("1,2,3");
    expect(ev("[{n:2},{n:1}].sort((a, b) => a.n - b.n).map(r => r.n).join(',')")).toBe("1,2");
    expect(ev("['b','a','c'].sort((a, b) => a > b ? 1 : -1).join('')")).toBe("abc");
  });

  it("sort WITHOUT a comparator compares stringified values, exactly like JS", () => {
    expectMatchesJs("[10, 9, 1].sort().join(',')");
    expectMatchesJs("['b', 'a'].sort().join(',')");
  });

  it("sort mutates the receiver and returns it (so callers must copy first)", () => {
    expect(runBody("  let a = [3,1,2]\n  let b = a.sort((x, y) => x - y)\n  $out = a.join(',') + '|' + b.join(',')")).toBe("1,2,3|1,2,3");
    expect(runBody("  let a = [3,1,2]\n  let b = a.slice(0).sort((x, y) => x - y)\n  $out = a.join(',') + '|' + b.join(',')")).toBe("3,1,2|1,2,3");
  });

  it("slice accepts negative bounds and never mutates", () => {
    expect(ev("[1,2,3,4].slice(-2).join(',')")).toBe("3,4");
    expect(ev("[1,2,3,4].slice(1, 3).join(',')")).toBe("2,3");
    expect(runBody("  let a = [1,2,3]\n  a.slice(0, 1)\n  $out = a.length")).toBe(3);
  });

  it("join defaults to a comma and stringifies nullish holes like JS", () => {
    expectMatchesJs("[1,2,3].join()");
    expectMatchesJs("[1, null, 3].join('-')");
  });

  it("a six-call chain evaluates left-to-right", () => {
    expect(ev("[3,1,2].slice(0).sort((a,b) => a-b).map(x => x*2).filter(x => x > 2).reverse().join('-')")).toBe("6-4");
  });

  it("callbacks receive the (item, index) pair", () => {
    expect(ev("['a','b'].map((it, i) => i + it).join(',')")).toBe("0a,1b");
  });
});

/* -------------------------------------------------------------------------- */
/*  9. String methods                                                         */
/* -------------------------------------------------------------------------- */

describe("String methods", () => {
  it("case, trim, split, join round-trip through a chain", () => {
    expect(ev("'  Hello World  '.trim().toLowerCase().split(' ').join('-')")).toBe("hello-world");
  });

  it("padStart / padEnd / repeat / at behave like JS", () => {
    for (const expr of ["'7'.padStart(3, '0')", "'7'.padEnd(3, '-')", "'ab'.repeat(3)", "'abc'.at(-1)"]) {
      expectMatchesJs(expr);
    }
  });

  it("replace replaces the first match; replaceAll replaces every match", () => {
    expect(ev("'a-b-c'.replace('-', '+')")).toBe("a+b-c");
    expect(ev("'a-b-c'.replaceAll('-', '+')")).toBe("a+b+c");
    expect(ev("'a-b-c'.replace(/-/g, '+')")).toBe("a+b+c");
  });

  it("slice/substring/indexOf/includes agree with JS on boundaries", () => {
    for (const expr of [
      "'hello'.slice(1, 3)",
      "'hello'.slice(-2)",
      "'hello'.substring(0, 2)",
      "'hello'.indexOf('l')",
      "'hello'.indexOf('z')",
      "'hello'.includes('ell')",
    ]) {
      expectMatchesJs(expr);
    }
  });

  it("String coercion of non-strings matches JS", () => {
    for (const expr of ["String(42)", "String(null)", "String([1,2])", "(42).toString()"]) expectMatchesJs(expr);
  });
});

/* -------------------------------------------------------------------------- */
/*  10. $util helpers, reached through the DSL                                */
/* -------------------------------------------------------------------------- */

describe("$util — aggregate & array helpers via the DSL", () => {
  const CASES: Array<[string, unknown]> = [
    ["$util.count([1,2,3])", 3],
    ["$util.count(null)", 0],
    ["$util.sum([1,2,3])", 6],
    ["$util.sum(['1','2'])", 3],
    ["$util.avg([1,2,3,4])", 2.5],
    ["$util.min([3,1,2])", 1],
    ["$util.max([3,1,2])", 3],
    ["$util.first([9,8])", 9],
    ["$util.last([9,8])", 8],
    ["$util.unique([1,1,2]).join(',')", "1,2"],
    ["$util.reverse([1,2,3]).join(',')", "3,2,1"],
    ["$util.slice([1,2,3,4], 1, 3).join(',')", "2,3"],
    ["$util.sort([3,1,2]).join(',')", "1,2,3"],
    ["$util.sort([{n:2},{n:1}], 'n').map(r => r.n).join(',')", "1,2"],
    ["$util.sort([{n:1},{n:2}], 'n', 'desc').map(r => r.n).join(',')", "2,1"],
    ["$util.groupBy([{t:'a'},{t:'b'},{t:'a'}], 't').a.length", 2],
    ["$util.filter([{a:1},{a:2}], 'a', '>', 1).length", 1],
    ["$util.find([{a:1},{a:2}], 'a', '==', 2).a", 2],
    ["$util.range(1, 5).join(',')", "1,2,3,4,5"],
    ["$util.range(1, 9, 3).join(',')", "1,4,7"],
    ["$util.repeat('x', 3).join('')", "xxx"],
    ["$util.chunk([1,2,3,4,5], 2).length", 3],
    ["$util.join(['a','b'], '-')", "a-b"],
  ];
  for (const [expr, expected] of CASES) {
    it(`${expr} → ${JSON.stringify(expected)}`, () => expect(ev(expr)).toEqual(expected));
  }
});

describe("$util — object, string, and number helpers via the DSL", () => {
  const CASES: Array<[string, unknown]> = [
    ["$util.pick({a:1,b:2}, ['a']).b", undefined],
    ["$util.pick({a:1,b:2}, ['a']).a", 1],
    ["$util.omit({a:1,b:2}, ['a']).b", 2],
    ["$util.keyBy([{id:'x'}], 'id').x.id", "x"],
    ["$util.cloneDeep({a:{b:1}}).a.b", 1],
    ["$util.merge({a:{b:1}}, {a:{c:2}}).a.c", 2],
    ["$util.capitalize('hello')", "Hello"],
    ["$util.uppercase('ab')", "AB"],
    ["$util.lowercase('AB')", "ab"],
    ["$util.titlecase('hello world')", "Hello World"],
    ["$util.case('hello world', 'camel')", "helloWorld"],
    ["$util.case('hello world', 'pascal')", "HelloWorld"],
    ["$util.case('hello world', 'snake')", "hello_world"],
    ["$util.case('hello world', 'kebab')", "hello-world"],
    ["$util.slugify('Hello World!')", "hello-world"],
    ["$util.initials('Ada Lovelace')", "AL"],
    ["$util.plural(1, 'item')", "1 item"],
    ["$util.plural(2, 'item')", "2 items"],
    ["$util.plural(2, 'person', 'people')", "2 people"],
    ["$util.trim('  x  ')", "x"],
    ["$util.split('a,b').join('|')", "a|b"],
    ["$util.replace('a-b', '-', '+')", "a+b"],
    ["$util.substring('hello', 1, 3)", "el"],
    ["$util.startsWith('hello', 'he')", true],
    ["$util.endsWith('hello', 'lo')", true],
    ["$util.contains('hello', 'ell')", true],
    ["$util.match('hello', '^he')", true],
    ["$util.match('hello', '^zz')", false],
    ["$util.round(3.14159, 2)", 3.14],
    ["$util.round(3.6)", 4],
    ["$util.floor(1.9)", 1],
    ["$util.ceil(1.1)", 2],
    ["$util.abs(-3)", 3],
    ["$util.clamp(15, 0, 10)", 10],
    ["$util.clamp(-5, 0, 10)", 0],
    ["$util.pow(2, 5)", 32],
    ["$util.sqrt(9)", 3],
    ["$util.percent(0.256, 1)", "25.6%"],
    ["$util.bytes(1536)", "1.5 KB"],
    ["$util.truncate('abcdefghij', 5)", "abcd…"],
    ["$util.truncate('abc', 5)", "abc"],
  ];
  for (const [expr, expected] of CASES) {
    it(`${expr} → ${JSON.stringify(expected)}`, () => expect(ev(expr)).toEqual(expected));
  }

  it("date helpers agree with each other (timezone-independent round-trip)", () => {
    expect(ev("$util.diffDays('2024-01-01', $util.addDays('2024-01-01', 5))")).toBe(5);
    expect(ev("$util.diffDays('2024-01-01', '2024-01-11')")).toBe(10);
  });

  it("$util.currency formats through Intl for an explicit locale", () => {
    expect(String(ev("$util.currency(12.5, 'USD', 'en-US')"))).toMatch(/12\.50/);
  });

  it("an unknown $util helper is nullish instead of a thrown TypeError", () => {
    expect(() => ev("$util.definitelyNotAHelper(1)")).not.toThrow();
    expect(ev("$util.definitelyNotAHelper(1)")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  11. Comments                                                              */
/* -------------------------------------------------------------------------- */

describe("Comments", () => {
  const ids = (src: string): string[] =>
    parse(src)
      .statements.map((s) => (s as { identifier?: string }).identifier)
      .filter((v): v is string => Boolean(v));

  it("strips a `/* … */` block comment inline inside an expression", () => {
    const program = parse(`aktion = /* why not */ Text("x")`);
    expect(program.errors).toEqual([]);
    expect(program.statements[0]?.expression).toMatchObject({ kind: "Call", callee: "Text" });
  });

  it("strips a block comment spanning multiple lines without eating the next statement", () => {
    const src = `/* line one\n   line two */\na = 1\naktion = Text("x")`;
    expect(parse(src).errors, messagesOf(parse(src).errors)).toEqual([]);
    expect(ids(src)).toEqual(["a", "aktion"]);
  });

  it("strips a block comment that sits BETWEEN two statements", () => {
    const src = `a = 1\n/* a note about b */\nb = 2\naktion = Text("x")`;
    expect(parse(src).errors, messagesOf(parse(src).errors)).toEqual([]);
    expect(ids(src)).toEqual(["a", "b", "aktion"]);
  });

  it("strips a block comment sitting between call arguments", () => {
    const program = parse(`aktion = Text(/* the label */ "x")`);
    expect(program.errors).toEqual([]);
    expect(ev("/* c */ 1 + /* c */ 2")).toBe(3);
  });

  it("a comment-only program parses to zero statements and zero diagnostics", () => {
    for (const src of ["// nothing here", "/* nothing here */", ""]) {
      const program = parse(src);
      expect(program.errors, src).toEqual([]);
      expect(program.statements, src).toHaveLength(0);
    }
  });

  it("an unterminated block comment neither throws nor hangs", () => {
    const program = parse(`a = 1\n/* never closed`);
    expect(ids(`a = 1\n/* never closed`)).toContain("a");
    expect(program.errors.length).toBeLessThanOrEqual(1);
  });

  it("comment markers inside string and template literals stay data", () => {
    expect(ev(`"/* not a comment */"`)).toBe("/* not a comment */");
    expect(ev("`// not a comment`")).toBe("// not a comment");
  });

  it("`#` is not a comment marker in 0.5 — it does not silently delete a line", () => {
    // The lexer skips unknown characters, so the assignment on the line still
    // parses; what must NOT happen is the whole statement disappearing.
    expect(ids(`a = 1 # trailing\naktion = Text("x")`)).toContain("a");
  });

  it("semicolons separate statements on one line, alongside comments", () => {
    expect(ids(`a = 1; b = 2 // both\naktion = Text("x")`)).toEqual(["a", "b", "aktion"]);
  });
});

/* -------------------------------------------------------------------------- */
/*  12. §19.1 — the one-positional-argument rule                              */
/* -------------------------------------------------------------------------- */

describe("Aktion 0.5 §19.1 — VALID call shapes validate clean", () => {
  // `Badge(label (positional), tone?, icon?, size?)` — a 4-prop spec whose
  // positional prop is slot 0. `Callout(tone?, title (positional), …)` — a spec
  // whose positional prop is NOT slot 0.
  const VALID: Array<[string, string]> = [
    ["canonical: one positional + a trailing named object", `aktion = Badge("New", { tone: "success" })`],
    ["all-positional in declaration order", `aktion = Badge("New", "success", "check", "sm")`],
    ["all-named as a single object", `aktion = Badge({ label: "New", tone: "success" })`],
    ["a single positional alone", `aktion = Badge("New")`],
    ["a single positional routed to a NON-slot-0 positional prop", `aktion = Callout("Heads up")`],
    ["a prop alias in the named object", `aktion = Badge("New", { variant: "success" })`],
    ["a leading named object plus a positional child list", `aktion = Stack([Text("a")], { gap: "md" })`],
    ["the universal style channel on any component", `aktion = Text("hi", { sx: { color: "red" } })`],
    ["`key:` alongside the canonical positional", `aktion = Badge("New", { key: "b1" })`],
  ];
  for (const [name, src] of VALID) {
    it(name, () => {
      const { errors } = diagnose(src);
      expect(errors, messagesOf(errors)).toEqual([]);
    });
  }
});

describe("Aktion 0.5 §19.1 — INVALID call shapes produce an actionable diagnostic", () => {
  function expectDiagnostic(src: string, mentions: RegExp[]): void {
    const { errors, statementCount } = diagnose(src);
    expect(errors.length, `expected a diagnostic for: ${src}`).toBeGreaterThan(0);
    const text = messagesOf(errors);
    for (const re of mentions) expect(text, `diagnostic should mention ${re}`).toMatch(re);
    // The host must still be able to render the committed prefix.
    expect(statementCount).toBeGreaterThan(0);
  }

  it("more positionals than the spec has prop slots", () => {
    expectDiagnostic(`aktion = Badge("New", "success", "check", "sm", "overflow")`, [/Badge/, /positional/i]);
  });

  it("an unknown prop in the named object, with a did-you-mean hint for a typo", () => {
    expectDiagnostic(`aktion = Badge("New", { tonee: "success" })`, [/Badge/, /tonee/, /tone/]);
  });

  it("a value outside a closed enum, named", () => {
    expectDiagnostic(`aktion = Badge("New", { tone: "sparkle" })`, [/Badge/, /sparkle/, /success/]);
  });

  it("a value outside a closed enum, positional", () => {
    expectDiagnostic(`aktion = Badge("New", "sparkle")`, [/Badge/, /sparkle/]);
  });

  it("an enum violation reached through a prop ALIAS", () => {
    expectDiagnostic(`aktion = Callout("Title", { variant: "sparkle" })`, [/Callout/, /sparkle/]);
  });

  it("an object literal passed positionally into a slot that cannot hold one", () => {
    expectDiagnostic(`aktion = Badge({ notAProp: 1 }, "success")`, [/Badge/]);
  });

  it("a bare value as the UI root (renders a blank page otherwise)", () => {
    for (const root of [`aktion = 42`, `aktion = "hello"`, `aktion = true`]) {
      expectDiagnostic(root, [/root/i]);
    }
  });

  it("every diagnostic carries a line number inside the source", () => {
    const src = `$n = 1\naktion = Badge("New", { tone: "sparkle" })`;
    const { errors } = diagnose(src);
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e.line).toBeGreaterThanOrEqual(1);
      expect(e.line).toBeLessThanOrEqual(src.split("\n").length);
    }
  });

  it("the legacy `name=value` named-argument form is still rejected", () => {
    const { errors } = diagnose(`aktion = Badge("New", tone="success")`);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("Aktion 0.5 §19.1 — the three legal call shapes are EQUIVALENT at render time", () => {
  interface AktionEl extends HTMLElement {
    setResponse(text: string): void;
  }
  const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
  async function settle(times = 6): Promise<void> {
    for (let i = 0; i < times; i += 1) await flush();
  }
  async function renderProgram(src: string): Promise<{ text: string; shape: string }> {
    const el = document.createElement("aktion-app") as AktionEl;
    document.body.appendChild(el);
    el.setResponse(src);
    await settle();
    const root = el.shadowRoot!;
    // Describe the rendered subtree structurally (tag + every attribute)
    // without hard-coding any literal — the point is that the shapes AGREE
    // with each other, whatever the renderer happens to emit.
    const shape = [...root.querySelectorAll("*")]
      .map((n) => {
        const attrs = [...n.attributes]
          .map((a) => `${a.name}=${a.value}`)
          .sort()
          .join(" ");
        return `${n.tagName}(${attrs})`;
      })
      .join(">");
    return { text: root.textContent ?? "", shape };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("canonical, all-positional, and all-named forms render the same DOM", async () => {
    const canonical = await renderProgram(`aktion = Badge("New", { tone: "success" })`);
    const allPositional = await renderProgram(`aktion = Badge("New", "success")`);
    const allNamed = await renderProgram(`aktion = Badge({ label: "New", tone: "success" })`);

    expect(canonical.text).toContain("New");
    expect(allPositional.text).toBe(canonical.text);
    expect(allNamed.text).toBe(canonical.text);
    expect(allPositional.shape).toBe(canonical.shape);
    expect(allNamed.shape).toBe(canonical.shape);
  });

  it("a differing prop value DOES change the rendered DOM (control for the test above)", async () => {
    const success = await renderProgram(`aktion = Badge("New", { tone: "success" })`);
    const danger = await renderProgram(`aktion = Badge("New", { tone: "danger" })`);
    expect(danger.shape).not.toBe(success.shape);
  });
});

/* -------------------------------------------------------------------------- */
/*  13. Error paths — malformed programs diagnose, never throw or vanish      */
/* -------------------------------------------------------------------------- */

describe("Malformed programs produce a diagnostic (never a throw, never silence)", () => {
  const MALFORMED: Array<[string, string]> = [
    ["an unclosed call argument list", `aktion = Text("x"\nb = 2`],
    ["an unclosed object literal", `o = { a: 1\naktion = Text("x")`],
    ["an assignment with no right-hand side", `x =\naktion = Text("x")`],
    ["a dangling binary operator", `x = 1 +\naktion = Text("x")`],
    ["`let` with no binding name", `let = 5\naktion = Text("x")`],
    ["a statement-only construct used as a value", `x = if (true) { 1 }\naktion = Text("x")`],
  ];

  for (const [name, src] of MALFORMED) {
    it(`${name} → at least one diagnostic with a real line number`, () => {
      let errors: ParseError[] = [];
      expect(() => {
        errors = parse(src).errors;
      }).not.toThrow();
      expect(errors.length, `no diagnostic for: ${src}`).toBeGreaterThan(0);
      for (const e of errors) {
        expect(e.message.length, "a diagnostic must say something").toBeGreaterThan(0);
        expect(e.line).toBeGreaterThanOrEqual(1);
        expect(e.line).toBeLessThanOrEqual(src.split("\n").length);
      }
    });

    it(`${name} → the same diagnostics survive validateProgram()`, () => {
      const { errors } = diagnose(src);
      expect(errors.length).toBeGreaterThan(0);
    });
  }

  it("recovers at the line boundary and keeps the statements it could parse", () => {
    const program = parse(`good1 = 1\nbroken =\ngood2 = 2\naktion = Text("x")`);
    expect(program.errors.length).toBeGreaterThan(0);
    const names = program.statements.map((s) => (s as { identifier?: string }).identifier);
    expect(names).toContain("good1");
    expect(names).toContain("good2");
    expect(names).toContain("aktion");
  });

  it("validateProgram merges schema diagnostics WITHOUT discarding the statements", () => {
    const { errors, statementCount } = diagnose(`$n = 1\naktion = Badge("New", { junk: 1 })`);
    expect(errors.length).toBeGreaterThan(0);
    expect(statementCount).toBe(2);
  });

  it("a clean program produces no diagnostics at all", () => {
    const { errors } = diagnose(`$n = 1\naktion = Stack([Text("hi"), Badge("New")])`);
    expect(errors, messagesOf(errors)).toEqual([]);
  });

  it("adversarial input is tolerated without throwing or hanging", () => {
    const ADVERSARIAL = [
      `s = "unterminated\naktion = Text("x")`,
      `aktion = Text("x") ✓ ✗ €`,
      `x = ${"(".repeat(200)}1${")".repeat(200)}\naktion = Text("y")`,
      `x = ${"[".repeat(200)}1${"]".repeat(200)}\naktion = Text("y")`,
      `x = ${"f(".repeat(150)}1${")".repeat(150)}\naktion = Text("y")`,
      `aktion = Text(${'"a",'.repeat(200)})`,
      `\n\n\n`,
      `,,,,`,
      `)))`,
    ];
    for (const src of ADVERSARIAL) {
      expect(() => parse(src), src.slice(0, 40)).not.toThrow();
      expect(() => validateProgram(src, defaultLibrary), src.slice(0, 40)).not.toThrow();
    }
  });

  it("a runtime-shaped mistake inside a body does not throw out of the evaluator", () => {
    // Reading through a missing chain, calling a non-function, and indexing a
    // number are all things a half-written program does. None may throw.
    expect(() => runBody("  let o = {}\n  $out = o.a?.b?.c")).not.toThrow();
    expect(() => runBody("  let n = 5\n  $out = n.notAMethod()")).not.toThrow();
    expect(() => runBody("  $out = (42)[0]")).not.toThrow();
  });
});
