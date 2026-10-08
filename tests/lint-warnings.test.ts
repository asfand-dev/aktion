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

/**
 * `awaited-value` — the highest-consequence lint here, because the wrong value is
 * a Promise, which is always truthy, so the buggy branch is the one that always
 * runs. Both DCD microfrontends shipped `const copied = await $util.copy(v)` and
 * toasted "Copied" on every failed clipboard write.
 */
describe("awaited-value", () => {
  const awaits = (src: string): string[] =>
    getLintWarnings(src)
      .filter((d) => d.message.includes("`await`"))
      .map((d) => d.message);

  it("flags an awaited value bound to a name", () => {
    const src = [
      "function copy(v) {",
      "  const copied = await $util.copy(v)",
      '  if (copied) { $toast.success("Copied") }',
      "}",
      '$app(Button("Copy", { action: () => copy("x") }))',
    ].join("\n");
    expect(awaits(src)).toHaveLength(1);
    expect(awaits(src)[0]).toMatch(/is the PROMISE/);
  });

  it("flags an awaited value used directly in a condition", () => {
    const src = [
      "function f(v) {",
      '  if (await $util.copy(v)) { $toast.success("ok") }',
      "}",
      '$app(Button("Go", { action: () => f("x") }))',
    ].join("\n");
    expect(awaits(src)).toHaveLength(1);
  });

  it("flags an awaited value passed as an argument", () => {
    const src = [
      "function f(v) { $toast.success(await $util.copy(v)) }",
      '$app(Button("Go", { action: () => f("x") }))',
    ].join("\n");
    expect(awaits(src)).toHaveLength(1);
  });

  it("does NOT flag an await whose value is discarded", () => {
    // A bare `await f()` statement is a readability marker with no wrong value
    // attached; warning on it would push authors to delete a harmless annotation.
    const src = [
      'function f(v) { await $util.copy(v) }',
      '$app(Button("Go", { action: () => f("x") }))',
    ].join("\n");
    expect(awaits(src)).toEqual([]);
  });

  it("reports each awaited value once", () => {
    const src = [
      "function f(a, b) {",
      "  const x = await $util.copy(a)",
      "  const y = await $util.copy(b)",
      "  return x && y",
      "}",
      '$app(Button("Go", { action: () => f("a", "b") }))',
    ].join("\n");
    expect(awaits(src)).toHaveLength(2);
  });

  it("says nothing about a program with no await at all", () => {
    const src = '$app(Column([Text("hello")]))';
    expect(awaits(src)).toEqual([]);
  });
});

/**
 * `invalid-regexp` — the runtime catches the engine's SyntaxError and the
 * expression becomes `null`, so a broken pattern is indistinguishable from "no
 * match". The stricter `v` flag is the usual way to hit it: a `/` or a stray `-`
 * inside a class (`[A-Za-z0-9+/]`) is valid under `u` and a SyntaxError under `v`.
 * The verdict is the linting Node's own RegExp engine, so these tests stick to
 * syntax every supported Node accepts or rejects alike.
 */
describe("invalid-regexp", () => {
  const PREFIX = "This engine rejects this regular expression";
  const regexpWarnings = (src: string): string[] =>
    getLintWarnings(src)
      .filter((d) => d.message.startsWith(PREFIX))
      .map((d) => d.message);

  it.each([
    ["new RegExp, v-flag set operation", 'const r = new RegExp("[a-z&&[", "v")'],
    ["new RegExp, unterminated group", 'const r = new RegExp("(abc")'],
    ["new RegExp, invalid flags", 'const r = new RegExp("a", "gg")'],
    ["new RegExp, unknown flag", 'const r = new RegExp("a", "q")'],
    ["new RegExp, u and v together", 'const r = new RegExp("a", "uv")'],
    ["RegExp called without new", 'const r = RegExp("(", "")'],
    ["literal, unescaped paren in v-mode class", "const r = /[(]/v"],
    ["literal, range in a v-mode intersection", "const r = /[a-z&&b]/v"],
    ["literal, bare pipe in a v-mode class", "const r = /[|]/v"],
    ["literal, invalid flags", "const r = /a/gg"],
    ["literal, lone quantifier", "const r = /+/"],
    ["literal, inside a lambda body", "const f = (s) => /[(]/v.test(s)"],
    ["literal, as a call argument", 'const m = "x".match(/[(]/v)'],
    ["no-substitution template literal pattern", "const r = new RegExp(`(`)"],
    ["a third argument, which JavaScript ignores", 'const r = new RegExp("(", "g", x)'],
    ["an explicit undefined flags argument", 'const r = new RegExp("(", undefined)'],
    ["a regex literal re-wrapped with invalid flags", 'const r = new RegExp(/a/, "gg")'],
  ])("flags %s", (_name, src) => {
    const warnings = regexpWarnings(src);
    expect(warnings).toHaveLength(1);
    // The engine's own reason is carried through, so the message is actionable.
    expect(warnings[0]).toMatch(/^This engine rejects this regular expression: .*(Invalid|Unterminated|Nothing|Unmatched|flags)/i);
    // The engine's `Invalid regular expression: /pattern/flags:` echo is not repeated.
    expect(warnings[0]).not.toMatch(/Invalid regular expression/);
    expect(getLintWarnings(src)[0]!.severity).toBe("warning");
  });

  it.each([
    ["a plain literal", "const r = /^[a-z]+$/"],
    ["a literal with flags", "const r = /a(b)c/gi"],
    ["a v-flag class with an escaped paren", "const r = /[\\(]/v"],
    ["a v-flag set intersection", "const r = /[\\w&&[^\\d]]/v"],
    ["new RegExp with valid pattern and flags", 'const r = new RegExp("^a+$", "gimsuy")'],
    ["new RegExp with no flags", 'const r = new RegExp("a|b")'],
    ["RegExp called without new", 'const r = RegExp("a", "g")'],
    ["an unrelated constructor", 'const d = new Date("not a date")'],
    ["a different function that takes a pattern", 'const r = makeRegExp("(")'],
  ])("does not flag %s", (_name, src) => {
    expect(regexpWarnings(src)).toEqual([]);
  });

  it.each([
    ["dynamic pattern", 'const r = new RegExp(pattern, "v")'],
    ["dynamic flags", 'const r = new RegExp("(", flags)'],
    ["both dynamic", "const r = new RegExp(pattern, flags)"],
    ["template with a substitution", "const r = new RegExp(`(${pattern}`)"],
    ["concatenated pattern", 'const r = new RegExp("(" + tail)'],
    ["spread arguments", "const r = new RegExp(...parts)"],
    ["no arguments", "const r = new RegExp()"],
    ["a spread before literal arguments", 'const r = new RegExp(...parts, "g")'],
    ["null flags", 'const r = new RegExp("a", null)'],
    ["a re-wrapped regex literal with valid flags", 'const r = new RegExp(/a/g, "i")'],
  ])("skips a %s silently", (_name, src) => {
    expect(regexpWarnings(src)).toEqual([]);
  });

  it("reports the position of the expression and one warning per bad regex", () => {
    const src = ["const a = /[(]/v", "const ok = /fine/", 'const b = new RegExp("(")'].join("\n");
    const warnings = getLintWarnings(src).filter((d) => d.message.startsWith(PREFIX));
    expect(warnings.map((d) => d.line)).toEqual([1, 3]);
    expect(warnings[0]!.column).toBe(11);
  });

  it("reports a bad regex literal once when it is re-wrapped", () => {
    expect(regexpWarnings("const r = new RegExp(/[(]/v, \"v\")")).toHaveLength(1);
  });

  it("keeps the message short for a very long pattern", () => {
    const src = `const r = new RegExp("${"a".repeat(5000)}(")`;
    const [warning] = regexpWarnings(src);
    expect(warning).toBeDefined();
    expect(warning!.length).toBeLessThan(400);
    expect(warning).not.toContain("aaaaaaaaaa");
  });

  it("is a warning in getDiagnostics, never an error", () => {
    const diags = getDiagnostics("const r = /[(]/v", defaultLibrary);
    const hit = diags.filter((d) => d.message.startsWith(PREFIX));
    expect(hit).toHaveLength(1);
    expect(hit[0]!.severity).toBe("warning");
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);
  });
});
