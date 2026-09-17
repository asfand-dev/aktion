/**
 * `formatProgram` / `printProgram` — configurable indentation (`FormatOptions`).
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
