/**
 * Theme resolver tests. The element relies on the resolver returning a
 * `name` that matches the requested theme so the host's `data-rui-theme`
 * attribute drives the layout-level overrides in styles.ts.
 */

import { describe, expect, it } from "vitest";
import {
  builtInThemes,
  privateThemes,
  deprecatedThemeAliases,
  findThemeByName,
  resolveTheme,
  applyTheme,
  lightTheme,
  visionTheme,
  shadcnLightTheme,
  shadcnDarkTheme,
  muiLightTheme,
  muiDarkTheme,
  herouiLightTheme,
  herouiDarkTheme,
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

  it("ships soft and the three framework families as built-ins", () => {
    expect(builtInThemes.soft).toBeDefined();
    // Each one must be visually distinct from light/dark to be useful.
    expect(builtInThemes.soft.colorPrimary).not.toBe(lightTheme.colorPrimary);
    expect(builtInThemes.soft.fontFamily).not.toBe(lightTheme.fontFamily);
    for (const name of ["shadcn", "mui", "heroui"] as const) {
      expect(builtInThemes[name], name).toBeDefined();
      expect(builtInThemes[name].fontFamily, name).not.toBe(lightTheme.fontFamily);
    }
  });

  it("makes each family's bare name an alias of its light variant", () => {
    // The user-facing promise: theme="shadcn" is theme="shadcn-light".
    expect(builtInThemes.shadcn).toBe(shadcnLightTheme);
    expect(builtInThemes["shadcn-light"]).toBe(shadcnLightTheme);
    expect(builtInThemes.mui).toBe(muiLightTheme);
    expect(builtInThemes["mui-light"]).toBe(muiLightTheme);
    expect(builtInThemes.heroui).toBe(herouiLightTheme);
    expect(builtInThemes["heroui-light"]).toBe(herouiLightTheme);
    // …and the shorthand keeps its own spelling on the host, so the CSS block
    // (which prefix-matches the family) has to cover all three names.
    expect(resolveTheme("shadcn").name).toBe("shadcn");
    expect(resolveTheme("mui").name).toBe("mui");
    expect(resolveTheme("heroui").name).toBe("heroui");
  });

  it("pairs every family with a genuinely darker dark variant", () => {
    const pairs = [
      ["shadcn", shadcnLightTheme, shadcnDarkTheme],
      ["mui", muiLightTheme, muiDarkTheme],
      ["heroui", herouiLightTheme, herouiDarkTheme],
    ] as const;
    for (const [family, light, dark] of pairs) {
      expect(builtInThemes[family + "-dark"], family).toBe(dark);
      // A dark variant that forgot to invert is the failure worth catching.
      expect(dark.colorBg, family).not.toBe(light.colorBg);
      expect(dark.colorText, family).not.toBe(light.colorText);
      expect(dark.colorSurface, family).not.toBe(light.colorSurface);
      // …while staying the same DESIGN: type and shape are shared.
      expect(dark.fontFamily, family).toBe(light.fontFamily);
      expect(dark.radiusButton, family).toBe(light.radiusButton);
      expect(dark.buttonTextTransform, family).toBe(light.buttonTextTransform);
    }
  });

  it("keeps the three families visually distinct from each other", () => {
    // The whole point of the rename is that each one reads as its framework.
    // Sharing a primary, a button radius or a type stack would undo that.
    const primaries = [shadcnLightTheme, muiLightTheme, herouiLightTheme]
      .map((t) => t.colorPrimary);
    expect(new Set(primaries).size).toBe(3);
    const radii = [shadcnLightTheme, muiLightTheme, herouiLightTheme]
      .map((t) => t.radiusButton);
    expect(new Set(radii).size).toBe(3);
    const fonts = [shadcnLightTheme, muiLightTheme, herouiLightTheme]
      .map((t) => t.fontFamily);
    expect(new Set(fonts).size).toBe(3);
  });

  it("drops the retired neon and brutalist themes", () => {
    expect(builtInThemes.neon).toBeUndefined();
    expect(builtInThemes.brutalist).toBeUndefined();
    // Old names fall back to light through the public resolver.
    expect(resolveTheme("neon").name).toBe("light");
    expect(resolveTheme("brutalist").name).toBe("light");
  });

  it("keeps the retired modern / glass / corporate names resolving", () => {
    // They are gone from every ENUMERATING surface…
    expect(builtInThemes.modern).toBeUndefined();
    expect(builtInThemes.glass).toBeUndefined();
    expect(builtInThemes.corporate).toBeUndefined();
    expect(privateThemes.modern).toBeUndefined();
    // …but a page that still names one gets the theme that replaced it, not a
    // silent fall back to light, which is what an unknown name does.
    expect(deprecatedThemeAliases).toEqual({
      modern: "shadcn-light",
      glass: "mui-light",
      corporate: "heroui-light",
    });
    expect(findThemeByName("modern")).toBe(shadcnLightTheme);
    expect(findThemeByName("glass")).toBe(muiLightTheme);
    expect(findThemeByName("corporate")).toBe(herouiLightTheme);
    // The resolver reports the CANONICAL name, so the host's data-rui-theme
    // matches the marker the replacement's CSS block is keyed on.
    expect(resolveTheme("modern").name).toBe("shadcn-light");
    expect(resolveTheme("  CORPORATE ").name).toBe("heroui-light");
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
      "light", "dark",
      "shadcn", "shadcn-light", "shadcn-dark",
      "mui", "mui-light", "mui-dark",
      "heroui", "heroui-light", "heroui-dark",
      "soft",
    ]);
    expect(privateThemes.vision).toBe(visionTheme);
    // …while a lookup still finds it.
    expect(findThemeByName("vision")).toBe(visionTheme);
    expect(findThemeByName("shadcn")).toBe(builtInThemes.shadcn);
    expect(findThemeByName("nope")).toBeNull();
  });

  /*
   * The three blocks below pin the values that make each theme a RE-CREATION
   * rather than "something in the same mood". Each one is a load-bearing token
   * copied out of the framework's own source; if one drifts, the theme stops
   * being the thing it claims to be and nothing else in the suite would notice.
   */
  it("re-creates shadcn/ui's default neutral theme", () => {
    // globals.css: --primary oklch(0.205 0 0), --primary-foreground
    // oklch(0.985 0 0), --muted oklch(0.97 0 0), --border #e5e5e5…
    expect(shadcnLightTheme.colorPrimary).toBe("#171717");
    expect(shadcnLightTheme.colorPrimaryText).toBe("#fafafa");
    expect(shadcnLightTheme.colorSurfaceMuted).toBe("#f5f5f5");
    expect(shadcnLightTheme.colorBorder).toBe("#e5e5e5");
    // --radius 0.625rem, with rounded-md (8px) controls and rounded-xl cards.
    expect(shadcnLightTheme.radiusButton).toBe("8px");
    expect(shadcnLightTheme.radiusLg).toBe("14px");
    // text-sm components and font-medium buttons.
    expect(shadcnLightTheme.fontSizeBase).toBe("14px");
    expect(shadcnLightTheme.buttonFontWeight).toBe("500");
    expect(shadcnLightTheme.buttonTextTransform).toBe("none");
    expect(shadcnLightTheme.fontFamily).toContain("Geist");
    // The .dark block inverts the primary to near-white ink.
    expect(shadcnDarkTheme.colorBg).toBe("#0a0a0a");
    expect(shadcnDarkTheme.colorSurface).toBe("#171717");
    expect(shadcnDarkTheme.colorPrimary).toBe("#e5e5e5");
    expect(shadcnDarkTheme.colorPrimaryText).toBe("#171717");
  });

  it("re-creates Material UI's default theme", () => {
    expect(muiLightTheme.colorPrimary).toBe("#1976d2");
    expect(muiLightTheme.colorPrimaryHover).toBe("#1565c0");
    expect(muiLightTheme.colorAccent).toBe("#9c27b0");
    expect(muiLightTheme.colorDanger).toBe("#d32f2f");
    expect(muiLightTheme.colorText).toBe("rgba(0, 0, 0, 0.87)");
    expect(muiLightTheme.colorBorder).toBe("rgba(0, 0, 0, 0.12)");
    // shape.borderRadius: 4 really is the whole scale.
    expect(muiLightTheme.radiusButton).toBe("4px");
    expect(muiLightTheme.radiusMd).toBe("4px");
    // The single loudest Material tell.
    expect(muiLightTheme.buttonTextTransform).toBe("uppercase");
    expect(muiLightTheme.buttonLetterSpacing).toBe("0.02857em");
    expect(muiLightTheme.fontFamily).toContain("Roboto");
    // Elevation 1, verbatim — three stacked layers, not one soft drop.
    expect(muiLightTheme.shadowSm).toContain("0px 2px 1px -1px rgba(0, 0, 0, 0.2)");
    expect(muiLightTheme.shadowSm.split(",").length).toBeGreaterThan(6);
    // Dark mode: the lighter primary, and Paper at its elevation-1 overlay.
    expect(muiDarkTheme.colorPrimary).toBe("#90caf9");
    expect(muiDarkTheme.colorBg).toBe("#121212");
    expect(muiDarkTheme.colorSurface).toBe("#1e1e1e");
  });

  it("re-creates HeroUI's default theme", () => {
    expect(herouiLightTheme.colorPrimary).toBe("#006fee");
    expect(herouiLightTheme.colorAccent).toBe("#7828c8");
    expect(herouiLightTheme.colorSuccess).toBe("#17c964");
    expect(herouiLightTheme.colorWarning).toBe("#f5a524");
    expect(herouiLightTheme.colorDanger).toBe("#f31260");
    expect(herouiLightTheme.colorText).toBe("#11181c");
    // --heroui-radius-small / -medium / -large.
    expect(herouiLightTheme.radiusSm).toBe("8px");
    expect(herouiLightTheme.radiusButton).toBe("12px");
    expect(herouiLightTheme.radiusLg).toBe("14px");
    expect(herouiLightTheme.fontFamily).toContain("Inter");
    // shadow-medium, verbatim — including the 1px hairline layer that does the
    // work a border does in the other two themes.
    expect(herouiLightTheme.shadowMd).toContain("0px 0px 1px 0px rgba(0, 0, 0, 0.3)");
    // Dark mode is pure black behind #18181b content1 surfaces, with the
    // inset white rim-light HeroUI uses instead of a darker drop shadow.
    expect(herouiDarkTheme.colorBg).toBe("#000000");
    expect(herouiDarkTheme.colorSurface).toBe("#18181b");
    expect(herouiDarkTheme.shadowMd).toContain("inset");
    // Its primary stays HeroUI blue as a FILL; the text-side value steps up so
    // links clear 4.5:1 on content1 (see theme-focus-contrast.test.ts).
    expect(herouiDarkTheme.colorPrimary).toBe("#006fee");
    expect(herouiDarkTheme.colorLink).toBe("#66aaf9");
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
