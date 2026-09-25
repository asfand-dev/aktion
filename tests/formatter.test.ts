/**
 * `formatProgram` / `printProgram` — configurable indentation, quote style,
 * trailing commas and object curly spacing (`FormatOptions`), and the
 * idempotency guarantee for desugared operator syntax.
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

describe("formatProgram — FormatOptions.indentWidth validation", () => {
  it.each([-1, Infinity, -Infinity, Number.NaN, 1.5])(
    "rejects a non-integer or negative indentWidth (%s)",
    (indentWidth) => {
      expect(() => formatProgram(SAMPLE, { indentWidth })).toThrow(RangeError);
    },
  );

  it("accepts 0 (no indentation at all)", () => {
    const { formatted, errors } = formatProgram(SAMPLE, { indentWidth: 0 });
    expect(errors).toEqual([]);
    expect(formatted).toContain("let [count, setCount] = $state(initial)");
    expect(formatted).not.toMatch(/\n +\S/);
  });
});

describe("formatProgram — FormatOptions.quoteStyle: 'single'", () => {
  const QUOTE_SAMPLE = [
    "function Greeting(name) {",
    '  const message = "hello world"',
    "  return Text(message)",
    "}",
    "",
    '$app(Greeting("friend"))',
    "",
  ].join("\n");

  it("emits single-quoted strings instead of double", () => {
    const { formatted, errors } = formatProgram(QUOTE_SAMPLE, { quoteStyle: "single" });
    expect(errors).toEqual([]);
    expect(formatted).toContain("'hello world'");
    expect(formatted).toContain("Greeting('friend')");
    // No double-quoted string literals should remain (import/effect/literal
    // paths all route through the same quote choice).
    expect(formatted).not.toMatch(/"[^`]*"/);
  });

  it("falls back to double quotes for a string containing a single quote but no double quote (avoidEscape)", () => {
    const source = [
      "function f() {",
      `  return Text("it's ready")`,
      "}",
      "",
      "$app(f())",
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source, { quoteStyle: "single" });
    expect(errors).toEqual([]);
    // Falling back to double quotes here avoids an ugly `'it\'s ready'`.
    expect(formatted).toContain(`"it's ready"`);
  });

  it("escapes the single quote when the string contains both quote characters", () => {
    const source = [
      "function f() {",
      `  return Text("she said \\"hi\\", it's great")`,
      "}",
      "",
      "$app(f())",
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source, { quoteStyle: "single" });
    expect(errors).toEqual([]);
    // Both quote chars are present in the decoded value, so the avoidEscape
    // fallback doesn't apply — single quotes win and the apostrophe is
    // escaped, while the (now unnecessary) `"` escape is dropped.
    expect(formatted).toContain(`'she said "hi", it\\'s great'`);
  });

  it("defaults to double quotes when quoteStyle is omitted", () => {
    const { formatted } = formatProgram(QUOTE_SAMPLE);
    expect(formatted).toContain('"hello world"');
  });
});

describe("formatProgram — FormatOptions.trailingComma", () => {
  const WRAPPED_ARRAY_SAMPLE = [
    "function Menu() {",
    '  const items = ["breakfast special with scrambled eggs and toasted sourdough bread", "lunch combo with crispy fries and a chilled beverage"]',
    "  return Column(items)",
    "}",
    "",
    "$app(Menu())",
    "",
  ].join("\n");

  const WRAPPED_OBJECT_SAMPLE = [
    "function Profile() {",
    '  const config = { firstName: "Alexandria", lastName: "Constantinopoulos-Whitfield", roleTitle: "Senior Administrator" }',
    "  return Text(config.firstName)",
    "}",
    "",
    "$app(Profile())",
    "",
  ].join("\n");

  it("adds no trailing comma by default on a wrapped array/object (unchanged behaviour)", () => {
    const array = formatProgram(WRAPPED_ARRAY_SAMPLE);
    expect(array.errors).toEqual([]);
    expect(array.formatted).toMatch(/beverage"\n\s*\]/);
    const object = formatProgram(WRAPPED_OBJECT_SAMPLE);
    expect(object.errors).toEqual([]);
    expect(object.formatted).toMatch(/Senior Administrator"\n\s*\}/);
  });

  it("adds a trailing comma after the last element of a wrapped array", () => {
    const { formatted, errors } = formatProgram(WRAPPED_ARRAY_SAMPLE, { trailingComma: true });
    expect(errors).toEqual([]);
    expect(formatted).toMatch(/beverage",\n\s*\]/);
  });

  it("adds a trailing comma after the last property of a wrapped object", () => {
    const { formatted, errors } = formatProgram(WRAPPED_OBJECT_SAMPLE, { trailingComma: true });
    expect(errors).toEqual([]);
    expect(formatted).toMatch(/Senior Administrator",\n\s*\}/);
  });

  it("never adds a trailing comma to an array/object that fits on one line", () => {
    const { formatted, errors } = formatProgram(SAMPLE, { trailingComma: true });
    expect(errors).toEqual([]);
    expect(formatted).toContain('Button("Increment", { onClick: inc })])');
  });
});

describe("formatProgram — FormatOptions.objectCurlySpacing: false", () => {
  it("removes the space just inside a single-line object literal's braces", () => {
    const { formatted, errors } = formatProgram(SAMPLE, { objectCurlySpacing: false });
    expect(errors).toEqual([]);
    expect(formatted).toContain("{onClick: inc}");
    expect(formatted).not.toContain("{ onClick: inc }");
  });

  it("does not affect array literals, which never had inner-bracket spacing", () => {
    const { formatted, errors } = formatProgram(SAMPLE, { objectCurlySpacing: false });
    expect(errors).toEqual([]);
    expect(formatted).toContain("Column([Text(");
  });

  it("defaults to spaced braces when omitted", () => {
    const { formatted } = formatProgram(SAMPLE);
    expect(formatted).toContain("{ onClick: inc }");
  });
});

describe("formatProgram — all new FormatOptions compose together with indentStyle: 'tab'", () => {
  it("applies tabs, single quotes, trailing commas and no object curly spacing without interference", () => {
    const source = [
      "function Profile() {",
      '  const config = { firstName: "Alexandria", lastName: "Constantinopoulos-Whitfield", roleTitle: "Senior Administrator" }',
      "  return Text(config.firstName)",
      "}",
      "",
      "$app(Profile())",
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source, {
      indentStyle: "tab",
      quoteStyle: "single",
      trailingComma: true,
      objectCurlySpacing: false,
    });
    expect(errors).toEqual([]);
    // Tabs, not spaces, for indentation. (A plain `Assignment` node prints
    // as bare `x = value` with no `const`/`let` keyword — only destructuring
    // gets `let`, per the printer's existing `Assignment`/`DestructureStatement`
    // cases.)
    expect(formatted).toContain("\tconfig = {");
    expect(formatted).not.toMatch(/\n {2,}\S/);
    // Single-quoted strings.
    expect(formatted).toContain("'Alexandria'");
    expect(formatted).not.toMatch(/"[^`]*"/);
    // Trailing comma on the wrapped object.
    expect(formatted).toMatch(/'Senior Administrator',\n\t\}/);
    // No inner brace spacing (multi-line object braces don't carry spacing
    // regardless of this option, but the option must still not add any).
    expect(formatted).not.toContain("{ firstName");

    // And the composed output must still be idempotent.
    const second = formatProgram(formatted, {
      indentStyle: "tab",
      quoteStyle: "single",
      trailingComma: true,
      objectCurlySpacing: false,
    });
    expect(second.errors).toEqual([]);
    expect(second.formatted).toBe(formatted);
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

describe("formatProgram — `await` preserves grouping around its argument", () => {
  it("parenthesizes a ternary argument so precedence against `?:` is preserved", () => {
    const source = [
      "async function f(ready, value, fallback) {",
      "  const r = await (ready ? value : fallback)",
      "  return r",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    expect(first.formatted).toContain("await (ready ? value : fallback)");
    // Idempotent, and re-parsing must keep the ternary as the awaited
    // value rather than reinterpreting it as `(await ready) ? value :
    // fallback` — if grouping were lost, the SECOND format would drift.
    const second = formatProgram(first.formatted);
    expect(second.errors).toEqual([]);
    expect(second.formatted).toBe(first.formatted);
  });

  it("parenthesizes a lambda argument so the result is re-parseable at all", () => {
    const source = [
      "async function f(x) {",
      "  const r = await (v => v)",
      "  return r",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    expect(first.formatted).toContain("await (v => v)");
    const second = formatProgram(first.formatted);
    expect(second.errors).toEqual([]);
    expect(second.formatted).toBe(first.formatted);
  });
});

