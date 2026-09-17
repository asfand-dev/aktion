/**
 * `formatProgram` / `printProgram` — configurable indentation (`FormatOptions`)
 * and the idempotency guarantee for desugared operator syntax.
 *
 * Backward compatibility is load-bearing here: `formatProgram(source)` with
 * no options is a real, published, already-depended-on API, so its output
 * must stay bit-for-bit identical to pre-existing behaviour.
 */
import { describe, expect, it } from "vitest";
import { formatProgram, printProgram } from "../src/tooling/formatter.js";
import { parse } from "../src/parser/index.js";

const SAMPLE = [
  "function Counter(initial) {",
  "  const [count, setCount] = $state(initial)",
  "  function inc() {",
  "    setCount(count + 1)",
  "  }",
  "  return Column([",
  '    Text(`Count: ${count}`),',
  '    Button("Increment", { onClick: inc }),',
  "  ])",
  "}",
  "",
  "$app(Counter(0))",
  "",
].join("\n");

describe("formatProgram — default indentation is unchanged", () => {
  it("formats with no options exactly like today's 2-space output (regression snapshot)", () => {
    const { formatted, errors } = formatProgram(SAMPLE);
    expect(errors).toEqual([]);
    // Pinned literal snapshot of current (pre-existing, unchanged-by-this-PR)
    // behaviour — any accidental drift in the default output (not just a
    // missing feature) fails this test. Note `let` (not `const`): the
    // printer's `DestructureStatement` case always re-emits `let` regardless
    // of the original declaration keyword — pre-existing, out of scope here.
    // The `Column([...])` array collapses inline because its printed form
    // is <= 80 chars — also pre-existing `printExpression`/`Array` behaviour.
    expect(formatted).toBe(
      [
        "function Counter(initial) {",
        "  let [count, setCount] = $state(initial)",
        "  function inc() {",
        "    setCount(count + 1)",
        "  }",
        '  return Column([Text(`Count: ${count}`), Button("Increment", { onClick: inc })])',
        "}",
        "",
        "$app(Counter(0))",
        "",
      ].join("\n"),
    );
  });

  it("produces identical output whether options is omitted or explicitly the default shape", () => {
    const withoutOptions = formatProgram(SAMPLE).formatted;
    const withDefaultOptions = formatProgram(SAMPLE, { indentStyle: "space", indentWidth: 2 }).formatted;
    expect(withDefaultOptions).toBe(withoutOptions);
  });
});

describe("formatProgram — FormatOptions.indentStyle: 'tab'", () => {
  it("indents every level with tab characters and no spaces", () => {
    const { formatted, errors } = formatProgram(SAMPLE, { indentStyle: "tab" });
    expect(errors).toEqual([]);
    const indentedLines = formatted.split("\n").filter((line) => /^[ \t]/.test(line));
    expect(indentedLines.length).toBeGreaterThan(0);
    for (const line of indentedLines) {
      const leading = line.match(/^[ \t]+/)![0];
      expect(leading).toMatch(/^\t+$/);
      expect(leading).not.toContain(" ");
    }
    expect(formatted).toContain("\tlet [count, setCount] = $state(initial)");
    expect(formatted).toContain("\t\tsetCount(count + 1)");
  });
});

describe("formatProgram — FormatOptions.indentWidth: 4", () => {
  it("indents each level with 4 spaces", () => {
    const { formatted, errors } = formatProgram(SAMPLE, { indentStyle: "space", indentWidth: 4 });
    expect(errors).toEqual([]);
    expect(formatted).toContain("    let [count, setCount] = $state(initial)");
    expect(formatted).toContain("        setCount(count + 1)");
    // No 2-space-only indentation should remain at the top of a nested line.
    expect(formatted).not.toMatch(/\n {2}[^ ]/);
  });
});

describe("printProgram — same FormatOptions shape as formatProgram", () => {
  it("applies indentStyle/indentWidth identically to a pre-parsed Program", () => {
    const program = parse(SAMPLE);
    expect(program.errors).toEqual([]);

    const viaFormatProgram = formatProgram(SAMPLE, { indentStyle: "tab" }).formatted;
    const viaPrintProgram = printProgram(program, { indentStyle: "tab" });
    expect(viaPrintProgram).toBe(viaFormatProgram);

    const viaFormatProgram4 = formatProgram(SAMPLE, { indentWidth: 4 }).formatted;
    const viaPrintProgram4 = printProgram(program, { indentWidth: 4 });
    expect(viaPrintProgram4).toBe(viaFormatProgram4);
  });

  it("printProgram with no options matches printProgram's historical default", () => {
    const program = parse(SAMPLE);
    expect(printProgram(program)).toBe(formatProgram(SAMPLE).formatted);
  });
});

describe("formatProgram — idempotency for desugared assignment-as-expression syntax", () => {
  it("reproduces the bug: a computed-member assignment inside a function body used to lose its `@` marker on a second format", () => {
    // Real repro (DCD-monorepo issue): `next[field] = value` — a plain
    // assignment statement whose target is a computed member expression —
    // is not a top-level `Assignment` node; the parser desugars it into a
    // `BuiltinCall` named `__rui_assign__`. The printer used to re-emit that
    // node as a literal `@__rui_assign__(next[field], value, "=")` call,
    // which is not valid Aktion surface syntax (the lexer has no `@` token
    // and silently drops it), so re-parsing that text read it back as a
    // *plain call* to an identifier named `__rui_assign__` — the assignment
    // semantics were gone. This test pins the fixed behaviour: the printer
    // must re-emit the actual `target = value` syntax instead.
    const source = [
      "function f(next, field, value) {",
      "  next[field] = value",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");

    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    expect(first.formatted).toContain("next[field] = value");
    expect(first.formatted).not.toContain("__rui_assign__");
    expect(first.formatted).not.toContain("@");

    const second = formatProgram(first.formatted);
    expect(second.errors).toEqual([]);
    expect(second.formatted).toBe(first.formatted);
  });

  it("is stable across compound assignment operators on a computed member", () => {
    const source = [
      "function f(totals, key, amount) {",
      "  totals[key] += amount",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.formatted).toContain("totals[key] += amount");
    const second = formatProgram(first.formatted);
    expect(second.formatted).toBe(first.formatted);
  });

  it("is stable for an assignment used as a bare arrow-function body", () => {
    const source = [
      "function f(rows) {",
      "  return rows.map((row) => row.selected = true)",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    expect(first.formatted).toContain("row.selected = true");
    expect(first.formatted).not.toContain("__rui_assign__");
    const second = formatProgram(first.formatted);
    expect(second.formatted).toBe(first.formatted);
  });

  it("is stable for postfix/prefix increment nested in a larger expression", () => {
    const source = [
      "function f(i, total) {",
      "  return total + i++",
      "}",
      "function g(i) {",
      "  return ++i",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    expect(first.formatted).toContain("total + i++");
    expect(first.formatted).toContain("return ++i");
    expect(first.formatted).not.toContain("__rui_postfix__");
    expect(first.formatted).not.toContain("__rui_prefix__");
    const second = formatProgram(first.formatted);
    expect(second.formatted).toBe(first.formatted);
  });

  it("is stable for `await` used as an expression", () => {
    const source = [
      "async function f() {",
      "  const r = await $http(\"/api\")",
      "  return r",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    expect(first.formatted).not.toContain("__rui_await__");
    const second = formatProgram(first.formatted);
    expect(second.formatted).toBe(first.formatted);
  });
});
