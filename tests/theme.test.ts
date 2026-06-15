/**
 * Theme resolver tests. The element relies on the resolver returning a
 * `name` that matches the requested theme so the host's `data-rui-theme`
 * attribute drives the layout-level overrides in styles.ts.
 */

import { describe, expect, it } from "vitest";
import {
  builtInThemes,
  resolveTheme,
  applyTheme,
  lightTheme,
} from "../src/theme/index.js";
import { componentStyles } from "../src/theme/styles.js";

describe("resolveTheme", () => {
  it("returns the light theme for null/undefined/missing input", () => {
    const a = resolveTheme(null);
    const b = resolveTheme(undefined);
    expect(a.name).toBe("light");
    expect(b.name).toBe("light");
    expect(a.tokens).toEqual(lightTheme);
  });

  it("returns each built-in theme by name", () => {
    for (const name of Object.keys(builtInThemes)) {
      const resolved = resolveTheme(name);
      expect(resolved.name).toBe(name);
      expect(resolved.tokens).toEqual(builtInThemes[name]);
    }
  });

  it("falls back to light for unknown theme names", () => {
    const resolved = resolveTheme("does-not-exist");
    expect(resolved.name).toBe("light");
  });

  it("treats JSON token strings as a custom theme merged on top of light", () => {
    const resolved = resolveTheme('{"colorPrimary":"#ff0000"}');
    expect(resolved.name).toBe("custom");
    expect(resolved.tokens.colorPrimary).toBe("#ff0000");
    // Untouched tokens fall back to light defaults.
    expect(resolved.tokens.colorBg).toBe(lightTheme.colorBg);
  });

  it("treats partial token objects as a custom theme", () => {
    const resolved = resolveTheme({ colorPrimary: "#0066ff" });
    expect(resolved.name).toBe("custom");
    expect(resolved.tokens.colorPrimary).toBe("#0066ff");
  });

  it("falls back to light for malformed JSON input", () => {
    const resolved = resolveTheme("{not json");
    expect(resolved.name).toBe("light");
  });

  it("ships soft and modern as built-ins", () => {
    expect(builtInThemes.soft).toBeDefined();
    expect(builtInThemes.modern).toBeDefined();
    // Each one must be visually distinct from light/dark to be useful.
    expect(builtInThemes.soft.colorPrimary).not.toBe(lightTheme.colorPrimary);
    expect(builtInThemes.modern.colorPrimary).not.toBe(lightTheme.colorPrimary);
    expect(builtInThemes.soft.fontFamily).not.toBe(lightTheme.fontFamily);
    expect(builtInThemes.modern.fontFamily).not.toBe(lightTheme.fontFamily);
  });

  it("drops the retired neon and brutalist themes", () => {
    expect(builtInThemes.neon).toBeUndefined();
    expect(builtInThemes.brutalist).toBeUndefined();
    // Old names fall back to light through the public resolver.
    expect(resolveTheme("neon").name).toBe("light");
    expect(resolveTheme("brutalist").name).toBe("light");
  });

  it("ships glass as a light glassmorphism built-in", () => {
    expect(builtInThemes.glass).toBeDefined();
    // Glass uses translucent white surfaces over a light backdrop.
    expect(builtInThemes.glass.colorSurface.startsWith("rgba")).toBe(true);
    expect(builtInThemes.glass.colorBg).not.toBe(lightTheme.colorBg);
    // Text stays dark for contrast on the frosted surfaces.
    expect(builtInThemes.glass.colorText).not.toBe(lightTheme.colorBg);
    expect(builtInThemes.glass.fontFamily).not.toBe(lightTheme.fontFamily);
  });

  it("ships corporate as an enterprise-console built-in (renamed from skyline)", () => {
    const corporate = builtInThemes.corporate;
    expect(corporate).toBeDefined();
    // Deep navy primary + crisp small radii are the cornerstones of the look.
    expect(corporate.colorPrimary).toBe("#003580");
    expect(corporate.radiusSm).toBe("4px");
    expect(corporate.radiusMd).toBe("6px");
    // Distinct from light/dark so the theme actually adds value.
    expect(corporate.colorBg).not.toBe(lightTheme.colorBg);
    expect(corporate.fontFamily).not.toBe(lightTheme.fontFamily);
    // Resolves cleanly through the public resolver under its new name.
    expect(resolveTheme("corporate").name).toBe("corporate");
    // The old "skyline" alias is gone.
    expect(builtInThemes.skyline).toBeUndefined();
    expect(resolveTheme("skyline").name).toBe("light");
  });

  it("ships modern with an ink primary and pill buttons", () => {
    const modern = builtInThemes.modern;
    expect(modern).toBeDefined();
    // Ink (near-black) primary rendered as pill buttons is the signature look.
    expect(modern.colorPrimary).toBe("#111827");
    expect(modern.radiusButton).toBe("999px");
    expect(modern.colorBg).not.toBe(lightTheme.colorBg);
    expect(resolveTheme("modern").name).toBe("modern");
  });
});

describe("applyTheme", () => {
  it("writes every token as a CSS custom property and sets data-rui-theme", () => {
    const host = document.createElement("div");
    applyTheme(host, resolveTheme("dark"));
    expect(host.getAttribute("data-rui-theme")).toBe("dark");
    expect(host.style.getPropertyValue("--rui-color-bg")).toBe("#0b1220");
    expect(host.style.getPropertyValue("--rui-color-text")).toBe("#f8fafc");
  });

  it("marks naked token objects as 'custom'", () => {
    const host = document.createElement("div");
    applyTheme(host, builtInThemes.light);
    expect(host.getAttribute("data-rui-theme")).toBe("custom");
  });
});

/**
 * The theme stylesheet is loaded through `adoptedStyleSheets`, which the
 * CSSOM spec cascades AFTER stylesheets injected via `<link>`. That means
 * any same-specificity declaration in here will win a tie-break against
 * Font Awesome's `.fa-solid` / `.fa-regular` font-family rule and silently
 * break every element that mashes FA classes onto a styled host.
 *
 * The visible symptom (regression caught in production) was the `Rating`
 * stars rendering as horizontal stripes / boxes — the `::before` glyph
 * inherited the wrong font and the browser drew the missing-glyph fallback.
 *
 * These guards make sure we never silently reintroduce the same bug for
 * any of the components that mix FA classes with their own class.
 */
describe("componentStyles font-family safety", () => {
  /**
   * Extract the body of a CSS rule `selector { … }` from the inline
   * stylesheet. Returns the empty string when the selector is not found so
   * negative assertions are easy to express.
   */
  const ruleBody = (selector: string): string => {
    const idx = componentStyles.indexOf(`${selector} {`);
    if (idx === -1) return "";
    const start = componentStyles.indexOf("{", idx);
    const end = componentStyles.indexOf("}", start);
    return start === -1 || end === -1 ? "" : componentStyles.slice(start + 1, end);
  };

  it("does not declare font-family on .rui-rating-star (FA needs to win the cascade)", () => {
    expect(ruleBody(".rui-rating-star")).not.toMatch(/font-family\s*:/);
  });
});
