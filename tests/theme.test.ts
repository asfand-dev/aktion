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

  it("ships neon and pastel as built-ins", () => {
    expect(builtInThemes.neon).toBeDefined();
    expect(builtInThemes.pastel).toBeDefined();
    // Each one must be visually distinct from light/dark to be useful.
    expect(builtInThemes.neon.colorPrimary).not.toBe(lightTheme.colorPrimary);
    expect(builtInThemes.pastel.colorPrimary).not.toBe(lightTheme.colorPrimary);
    expect(builtInThemes.neon.fontFamily).not.toBe(lightTheme.fontFamily);
    expect(builtInThemes.pastel.fontFamily).not.toBe(lightTheme.fontFamily);
  });

  it("ships glass and brutalist as built-ins with their own identities", () => {
    expect(builtInThemes.glass).toBeDefined();
    expect(builtInThemes.brutalist).toBeDefined();
    // Glass uses translucent surfaces and a dark backdrop.
    expect(builtInThemes.glass.colorSurface.startsWith("rgba")).toBe(true);
    expect(builtInThemes.glass.colorBg).not.toBe(lightTheme.colorBg);
    // Brutalist uses 0px radii and chunky offset shadows.
    expect(builtInThemes.brutalist.radiusMd).toBe("0px");
    expect(builtInThemes.brutalist.shadowMd).toContain("#0a0a0a");
    // Both pick distinct fonts so the look isn't just colors.
    expect(builtInThemes.glass.fontFamily).not.toBe(lightTheme.fontFamily);
    expect(builtInThemes.brutalist.fontFamily).not.toBe(lightTheme.fontFamily);
  });

  it("ships skyline as an enterprise-console built-in", () => {
    const skyline = builtInThemes.skyline;
    expect(skyline).toBeDefined();
    // Deep navy primary + crisp small radii are the cornerstones of the look.
    expect(skyline.colorPrimary).toBe("#003580");
    expect(skyline.radiusSm).toBe("4px");
    expect(skyline.radiusMd).toBe("6px");
    // Distinct from light/dark so the theme actually adds value.
    expect(skyline.colorBg).not.toBe(lightTheme.colorBg);
    expect(skyline.fontFamily).not.toBe(lightTheme.fontFamily);
    // Resolves cleanly through the public resolver.
    expect(resolveTheme("skyline").name).toBe("skyline");
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
