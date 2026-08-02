/**
 * Theme resolver tests. The element relies on the resolver returning a
 * `name` that matches the requested theme so the host's `data-rui-theme`
 * attribute drives the layout-level overrides in styles.ts.
 */

import { describe, expect, it } from "vitest";
import {
  builtInThemes,
  privateThemes,
  findThemeByName,
  resolveTheme,
  applyTheme,
  lightTheme,
  visionTheme,
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

  it("keeps the UI block re-creation alive as the PRIVATE vision theme", () => {
    // The UI block re-creation used to be called `corporate` (and `skyline`
    // before that). It now answers to `vision` and lives in `privateThemes`, so
    // every token below is still an UI block value rather than a hand-picked one:
    //   primary  = corporate-7 navy (--primary-button-background-color)
    //   radii    = UI block small / medium / default border-radius scale
    //   button   = --button-border-radius (the 24px pill)
    expect(visionTheme.colorPrimary).toBe("#0b2a63");
    expect(visionTheme.radiusSm).toBe("8px");
    expect(visionTheme.radiusMd).toBe("12px");
    expect(visionTheme.radiusLg).toBe("16px");
    expect(visionTheme.radiusButton).toBe("24px");
    // Primary brightens (not darkens) on hover — an UI block signature.
    expect(visionTheme.colorPrimaryHover).toBe("#1474c4");
    // Distinct from light/dark so the theme actually adds value.
    expect(visionTheme.colorBg).not.toBe(lightTheme.colorBg);
    expect(visionTheme.fontFamily).not.toBe(lightTheme.fontFamily);
    // Resolves like any built-in — privacy is about enumeration, not lookup.
    const resolved = resolveTheme("vision");
    expect(resolved.name).toBe("vision");
    expect(resolved.tokens).toEqual(visionTheme);
    // Case/whitespace are normalised on the way in, same as a public name.
    expect(resolveTheme("  VISION ").name).toBe("vision");
    // The old "skyline" alias is gone.
    expect(builtInThemes.skyline).toBeUndefined();
    expect(resolveTheme("skyline").name).toBe("light");
  });

  it("keeps vision out of every surface that ENUMERATES themes", () => {
    // The point of the private registry: `builtInThemes` is what the playground
    // theme picker, the editor autocomplete, the VS Code metadata and the docs
    // all read. If `vision` ever leaks into it, it becomes publicly listed
    // everywhere at once.
    expect(builtInThemes.vision).toBeUndefined();
    expect(Object.keys(builtInThemes)).toEqual([
      "light", "dark", "corporate", "soft", "glass", "modern",
    ]);
    expect(privateThemes.vision).toBe(visionTheme);
    // …while a lookup still finds it.
    expect(findThemeByName("vision")).toBe(visionTheme);
    expect(findThemeByName("corporate")).toBe(builtInThemes.corporate);
    expect(findThemeByName("nope")).toBeNull();
  });

  it("ships corporate as a teal-on-graphite enterprise workspace", () => {
    const corporate = builtInThemes.corporate;
    expect(corporate).toBeDefined();
    // Its signature: one deep-teal brand hue on square-shouldered 8px controls.
    expect(corporate.colorPrimary).toBe("#0f766e");
    expect(corporate.radiusButton).toBe("8px");
    expect(corporate.radiusInput).toBe("8px");
    // Primary DARKENS on hover — the opposite of vision's brighten.
    expect(corporate.colorPrimaryHover).toBe("#0b5f58");
    // Distinct from light/dark, and from the theme that used to own the name.
    expect(corporate.colorBg).not.toBe(lightTheme.colorBg);
    expect(corporate.colorPrimary).not.toBe(visionTheme.colorPrimary);
    expect(corporate.fontFamily).not.toBe(visionTheme.fontFamily);
    expect(corporate.radiusButton).not.toBe(visionTheme.radiusButton);
    // Still public, still resolvable under the name it always had.
    expect(resolveTheme("corporate").name).toBe("corporate");
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
