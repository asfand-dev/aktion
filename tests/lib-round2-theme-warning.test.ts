/**
 * `resolveTheme` keeps falling back to the light theme for a name it does not
 * know — a page naming a theme this build lacks must still render — but no
 * longer silently: a typo (`theme="midnite"`) or a ThemeToggle side naming a
 * missing theme looked like a styling bug in the light theme.
 *
 * The warned set is module state, so every case uses a name of its own.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTheme } from "../src/theme/index.js";

afterEach(() => vi.restoreAllMocks());

const warnings = (run: () => void): string[] => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  run();
  return warn.mock.calls.map((args) => String(args[0]));
};

describe("resolveTheme warns once about a theme it cannot resolve", () => {
  it("names an unknown theme, lists the built-in ones, and still resolves to light", () => {
    let resolved: ReturnType<typeof resolveTheme> | undefined;
    const said = warnings(() => { resolved = resolveTheme("Midnight-R2B"); });
    expect(resolved?.name).toBe("light");
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("\"Midnight-R2B\" is not a theme");
    expect(said[0]).toContain("dark");
    expect(said[0]).toContain("using the light theme");
  });

  it("says it once per name, however often the theme is re-resolved", () => {
    const said = warnings(() => {
      resolveTheme("dusk-r2b");
      resolveTheme("dusk-r2b");
      resolveTheme("  DUSK-R2B ");
    });
    expect(said).toHaveLength(1);
  });

  it("reports a theme string that is not valid JSON", () => {
    const said = warnings(() => { expect(resolveTheme("{not json r2b").name).toBe("light"); });
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("not valid JSON");
  });

  it("stays quiet for every theme that does resolve, and for no theme at all", () => {
    const said = warnings(() => {
      for (const name of ["dark", " DARK ", "modern", "vision", "shadcn-dark", "{\"colorPrimary\":\"#f00\"}", "", "   "]) resolveTheme(name);
      resolveTheme(null);
      resolveTheme({ colorPrimary: "#00f" });
    });
    expect(said).toEqual([]);
  });
});
