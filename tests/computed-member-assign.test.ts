/**
 * Computed-member assignment `obj[key] = value` where `key` is a non-literal
 * expression (a variable / member / arithmetic). The scope-isolation rewrite
 * had only resolved `Literal` computed keys for the write target; every other
 * key expression silently became `null`, dropping the write. This broke any
 * dictionary/map keyed by a dynamic value (`prodMap[meterId] = …`,
 * `cats[category] = …`, accumulators built in a loop).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";

describe("computed-member assignment with a dynamic key", () => {
  it("persists a dynamic-key write outside a loop", () => {
    const p = ['function f(){ const o = {}; const k = "z"; o[k] = "Z"; return o.z }', "$app(Text(`r=${f()}`))"].join("\n");
    expect(renderToStaticMarkup(p)).toContain("r=Z");
  });

  it("builds a map in a for-of loop", () => {
    const p = ['function f(){ const o = {}; for (const k of ["a", "b"]) { o[k] = k } return Object.keys(o).join(",") }', "$app(Text(`r=${f()}`))"].join("\n");
    expect(renderToStaticMarkup(p)).toContain("r=a,b");
  });

  it("keys by a property value and supports compound ops", () => {
    const p = [
      'function f(){',
      '  const rows = [{ id: "C1", n: 5 }, { id: "C2", n: 9 }, { id: "C1", n: 1 }]',
      "  const tot = {}",
      "  for (const r of rows) { tot[r.id] = (tot[r.id] || 0) + r.n }",
      "  return tot.C1 + \",\" + tot.C2",
      "}",
      "$app(Text(`r=${f()}`))",
    ].join("\n");
    expect(renderToStaticMarkup(p)).toContain("r=6,9");
  });

  it("supports arithmetic-expression keys", () => {
    const p = ['function f(){ const o = {}; const i = 2; o[i + 1] = "X"; return o[3] }', "$app(Text(`r=${f()}`))"].join("\n");
    expect(renderToStaticMarkup(p)).toContain("r=X");
  });
});
