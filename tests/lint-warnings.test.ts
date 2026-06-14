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
