/**
 * Render-time lint warnings in the language service (issue #8 from
 * issues-to-fix.md). The worst silent bugs (#1/#2/#3/#5/#7) are now fixed in
 * the runtime or surfaced as schema errors, so the remaining lint targets a
 * footgun that's still real: shadowing the i18n `t` (or any `$i18n`-destructured
 * binding) with a nested parameter / loop variable.
 */

import { describe, expect, it } from "vitest";
import { getDiagnostics, getLintWarnings } from "../src/tooling/language-service.js";
import { defaultLibrary } from "../src/library/index.js";

function lintMessages(src: string): string[] {
  return getLintWarnings(src).map((d) => d.message);
}

describe("#8 lint warnings — shadowed i18n binding", () => {
  it("warns when a loop variable shadows the i18n `t`", () => {
    const src = [
      'const { t } = $i18n({ defaultLanguage: "en", translations: {} })',
      "items = []",
      "function List() {",
      "  for (const t of items) { Text(t.name) }",
      "  return Text(t(\"title\"))",
      "}",
      '$app(List())',
    ].join("\n");
    const warnings = getLintWarnings(src);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.severity).toBe("warning");
    expect(warnings[0]!.message).toContain("shadows the i18n binding");
  });

  it("warns when a function parameter shadows the i18n `t`", () => {
    const src = [
      'const { t } = $i18n({ defaultLanguage: "en", translations: {} })',
      "function Row(t) { return Text(t) }",
      '$app(Row("x"))',
    ].join("\n");
    expect(lintMessages(src).some((m) => m.includes('parameter "t"'))).toBe(true);
  });

  it("does NOT warn when there is no $i18n in the program", () => {
    // A plain `t => …` is the most common lambda param name — never flag it.
    const src = [
      "items = []",
      '$app(Column(items.map(t => Text(t.name))))',
    ].join("\n");
    expect(getLintWarnings(src)).toEqual([]);
  });

  it("does NOT warn for unrelated names", () => {
    const src = [
      'const { t } = $i18n({ defaultLanguage: "en", translations: {} })',
      "items = []",
      '$app(Column(items.map(item => Text(t("label")))))',
    ].join("\n");
    expect(getLintWarnings(src)).toEqual([]);
  });

  it("getDiagnostics surfaces lint warnings alongside errors", () => {
    const src = [
      'const { t } = $i18n({ defaultLanguage: "en", translations: {} })',
      "items = []",
      "function List() {",
      "  for (const t of items) { Text(t.name) }",
      '  return Text("ok")',
      "}",
      "$app(List())",
    ].join("\n");
    const diags = getDiagnostics(src, defaultLibrary);
    expect(diags.some((d) => d.severity === "warning" && d.message.includes("shadows the i18n"))).toBe(true);
  });
});

/**
 * `unknown-component` — the highest-value lint for LLM-authored programs, since
 * a hallucinated component name is the single most common defect and the schema
 * validator structurally cannot see it (it cannot distinguish a typo from the
 * author's own `function Panel(...)`).
 *
 * Every "does NOT warn" case below is a false positive that would put a squiggle
 * on working code, so they matter more than the positive cases.
 */
describe("lint warnings — unknown component", () => {
  const unknowns = (src: string): string[] =>
    getDiagnostics(src, defaultLibrary)
      .filter((d) => d.message.startsWith("Unknown component"))
      .map((d) => d.message);

  it("flags a misspelled library component and suggests the real one", () => {
    const diags = getDiagnostics('$app(Column([Cardd([Text("x")])]))', defaultLibrary);
    const warning = diags.find((d) => d.message.startsWith("Unknown component"));
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
    expect(warning!.message).toContain("<Cardd>");
    expect(warning!.message).toContain('"Card"');
  });

  it("flags a component that does not exist at all", () => {
    expect(unknowns('$app(Column([FlorbWidget("x")]))')).toHaveLength(1);
  });

  it("reports the offending line/column", () => {
    const src = ['$title = "x"', "$app(Column([", "  Buton(\"go\"),", "]))"].join("\n");
    const warning = getDiagnostics(src, defaultLibrary).find((d) =>
      d.message.startsWith("Unknown component"),
    );
    expect(warning?.line).toBe(3);
  });

  it("does NOT flag the author's own component declaration", () => {
    const src = [
      "function Panel(label) { return Card([CardHeader(label)]) }",
      '$app(Column([Panel("a")]))',
    ].join("\n");
    expect(unknowns(src)).toEqual([]);
  });

  it("does NOT flag an imported component", () => {
    const src = [
      'import { PrimaryButton } from "./buttons.aktion"',
      '$app(Column([PrimaryButton("go")]))',
    ].join("\n");
    expect(unknowns(src)).toEqual([]);
  });

  it("does NOT flag a component received as a parameter", () => {
    const src = [
      "function Wrap(Inner) { return Column([Inner()]) }",
      "$app(Wrap(Text))",
    ].join("\n");
    expect(unknowns(src)).toEqual([]);
  });

  it("does NOT flag a destructured or loop-bound PascalCase name", () => {
    const src = [
      "mods = {}",
      "rows = []",
      "let { Header } = mods",
      "function Go() { for (let Row of rows) { Row() } }",
      "$app(Column([Header()]))",
    ].join("\n");
    expect(unknowns(src)).toEqual([]);
  });

  it("does NOT flag JavaScript global callables", () => {
    const src = [
      "function f() {",
      '  let n = Number("1")',
      "  let s = String(n)",
      "  let b = Boolean(n)",
      "  let arr = Array(3)",
      "  return s + b + arr.length",
      "}",
      '$app(Column([Text("x")]))',
    ].join("\n");
    expect(unknowns(src)).toEqual([]);
  });

  it("does NOT flag member calls, `new`, or postfix invocations", () => {
    const src = [
      "function f() { let d = new Date(); return d.toISOString() }",
      "$app(Column([Text($util.format(1))]))",
    ].join("\n");
    expect(unknowns(src)).toEqual([]);
  });

  it("does NOT flag lowercase action calls", () => {
    const src = [
      "function refresh() { $n = 1 }",
      '$app(Column([Button("Go", { action: refresh })]))',
    ].join("\n");
    expect(unknowns(src)).toEqual([]);
  });

  it("is skipped when getLintWarnings is called without a library", () => {
    const src = '$app(Column([Cardd([])]))';
    expect(getLintWarnings(src)).toEqual([]);
    expect(getLintWarnings(src, defaultLibrary).length).toBe(1);
  });

  it("does not double-report the same call site", () => {
    const src = '$app(Column([Cardd([]), Cardd([])]))';
    expect(unknowns(src)).toHaveLength(2); // two distinct sites, one warning each
  });
});
