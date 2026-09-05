/**
 * Reading a property off a FUNCTION — `Number.MAX_SAFE_INTEGER`, `Date.UTC`,
 * `Array.isArray` as a value.
 *
 * This used to answer `undefined` for every one of them, and it answered it
 * SILENTLY: `undefined` is a legal value, so nothing threw and nothing logged;
 * only the comparison downstream went wrong.
 *
 *     n <= Number.MAX_SAFE_INTEGER   →   n <= undefined   →   false
 *
 * A bounds check written the obvious way therefore rejected every value it was
 * meant to accept. It was found that way: a LAN-id field in DCD's VM Auto
 * Scaling console, whose upper bound was written `Number.MAX_SAFE_INTEGER`,
 * refused the value `2`.
 *
 * What made it hard to see is that `Number.isInteger(2)` worked the whole time.
 * A method CALL resolves through `evaluateMethodCall`, a different path that
 * never reached `memberAccess` — so the same object appeared to work for its
 * functions and to be empty for its constants.
 *
 * The last describe block is the one that must never be deleted: the fix widens
 * a read path, and `FORBIDDEN_PROPERTY_NAMES` is the only thing standing between
 * that and `(() => {}).constructor("…")`.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";

/**
 * Render one expression and hand back what it produced.
 *
 * `renderToStaticMarkup` rather than reaching into the evaluator: it is the path a
 * real program takes, so a fix that only worked through a hand-built context would
 * not pass here.
 */
function evalExpr(source: string): string {
  // A distinctive marker, not `r=`: the rendered markup carries attributes of its
  // own, and a two-character prefix matched inside one of them before it reached
  // the text node.
  const markup = renderToStaticMarkup(`$app(Text(\`AKTIONRESULT:\${String(${source})}\`))`);
  const match = /AKTIONRESULT:([^<]*)/.exec(markup);
  return match ? match[1]! : "";
}

describe("static properties on a built-in constructor", () => {
  it("reads Number's numeric constants", () => {
    expect(evalExpr("Number.MAX_SAFE_INTEGER")).toBe(String(Number.MAX_SAFE_INTEGER));
    expect(evalExpr("Number.MIN_SAFE_INTEGER")).toBe(String(Number.MIN_SAFE_INTEGER));
    expect(evalExpr("Number.EPSILON")).toBe(String(Number.EPSILON));
    expect(evalExpr("Number.POSITIVE_INFINITY")).toBe("Infinity");
    expect(evalExpr("Number.MAX_VALUE")).toBe(String(Number.MAX_VALUE));
  });

  it("reads a static METHOD as a value, not only as a call", () => {
    // `Number.isInteger(2)` always worked — the call path is a different one.
    // What did not work was naming the function without calling it.
    expect(evalExpr("typeof Number.isInteger")).toBe("function");
    expect(evalExpr("typeof Array.isArray")).toBe("function");
    expect(evalExpr("typeof Date.UTC")).toBe("function");
  });

  it("answers the same for the computed spelling", () => {
    // Two spellings of one read must not disagree.
    expect(evalExpr('Number["MAX_SAFE_INTEGER"]')).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  it("makes the bounds check that found this actually work", () => {
    expect(evalExpr("2 <= Number.MAX_SAFE_INTEGER")).toBe("true");
    expect(evalExpr("Number.isInteger(2) && 2 >= 1 && 2 <= Number.MAX_SAFE_INTEGER")).toBe("true");
  });

  it("still answers undefined for a property that genuinely is not there", () => {
    expect(evalExpr("Number.NOT_A_REAL_CONSTANT")).toBe("undefined");
  });
});

describe("the escape hatch stays shut", () => {
  // Widening a read path is only safe while `FORBIDDEN_PROPERTY_NAMES` holds, so
  // these four assertions are the ones that make the change above defensible
  // rather than merely convenient.
  it("refuses `constructor` on a function", () => {
    expect(evalExpr("Number.constructor")).toBe("undefined");
    expect(evalExpr('Number["constructor"]')).toBe("undefined");
  });

  it("refuses `prototype` and `__proto__` on a function", () => {
    expect(evalExpr("Number.prototype")).toBe("undefined");
    expect(evalExpr("Number.__proto__")).toBe("undefined");
  });

  it("refuses the same names through a user lambda", () => {
    // `(() => {}).constructor("code")()` is the classic route to `Function`, and
    // it is the reason the guard exists at all.
    expect(evalExpr("(() => 1).constructor")).toBe("undefined");
    expect(evalExpr('(() => 1)["constructor"]')).toBe("undefined");
  });
});
