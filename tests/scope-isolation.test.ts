/**
 * Per-call scope isolation for non-`$` locals (issues #1, #10, #4 from
 * issues-to-fix.md).
 *
 * Before the fix, function-local `const`/`let`/`var` shared one flat namespace
 * by name across the whole call stack: a callee's local overwrote a caller's
 * local of the same name once the callee returned, producing silent wrong
 * values. These guards pin the JavaScript-correct behaviour — each call frame
 * owns its locals.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";

describe("#1 function-local const/let are call-frame isolated", () => {
  it("a callee's local does not clobber a caller's same-named local", () => {
    const program = [
      "function inner() { const x = 99; return x }",
      "function outer() { let x = 1; inner(); return x }",
      "$app(Text(`result=${outer()}`))",
    ].join("\n");
    const html = renderToStaticMarkup(program);
    expect(html).toContain("result=1");
    expect(html).not.toContain("result=99");
  });

  it("a stats aggregator keeps its count when a helper reuses the name", () => {
    // The real-world bite: `tokenMeta` declares `const expired = <bool>`; the
    // aggregator's `let expired = 0` must survive the helper call.
    const program = [
      'rows = [{ statusKey: "expired" }, { statusKey: "active" }, { statusKey: "expired" }]',
      "function tokenMeta(token) {",
      '  const expired = token.statusKey === "expired"',
      "  return { expired: expired, statusKey: token.statusKey }",
      "}",
      "function counts() {",
      "  let expired = 0",
      "  for (const t of rows) {",
      "    const m = tokenMeta(t)",
      '    if (m.statusKey === "expired") expired += 1',
      "  }",
      "  return { expired: expired }",
      "}",
      "$app(Text(`count=${counts().expired}`))",
    ].join("\n");
    const html = renderToStaticMarkup(program);
    expect(html).toContain("count=2");
    expect(html).not.toContain("count=false");
  });

  it("#10 object shorthand in a return captures the local just computed", () => {
    const program = [
      "function meta(flag) { const active = flag; return { active: active } }",
      "function summary() {",
      "  let active = 0",
      "  meta(true)",
      "  active = active + 5",
      "  return { active }",
      "}",
      "$app(Text(`active=${summary().active}`))",
    ].join("\n");
    const html = renderToStaticMarkup(program);
    expect(html).toContain("active=5");
  });

  it("nested calls restore through multiple frames", () => {
    const program = [
      "function leaf() { const v = 7; return v }",
      "function mid() { const v = 3; leaf(); return v }",
      "function top() { let v = 1; const a = mid(); return v + a }",
      "$app(Text(`v=${top()}`))",
    ].join("\n");
    // top.v stays 1; mid returns 3 → 1 + 3 = 4.
    expect(renderToStaticMarkup(program)).toContain("v=4");
  });
});

describe("#4 a pre-built props object variable renders by value", () => {
  it("StatCard receives the same value whether props are inline or a variable", () => {
    const program = [
      "function StatCard(label, opts) {",
      "  return Column([Text(label), Text(opts.value, { size: \"xl\" })])",
      "}",
      "function Inline() { return StatCard(\"A\", { value: \"42 EUR\" }) }",
      "function ViaVariable() {",
      "  const props = { value: \"42 EUR\" }",
      "  return StatCard(\"B\", props)",
      "}",
      "$app(Column([Inline(), ViaVariable()]))",
    ].join("\n");
    const html = renderToStaticMarkup(program);
    expect(html).toContain("42 EUR");
    expect(html).not.toContain("[object Object]");
  });
});
