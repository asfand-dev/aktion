/**
 * Every theme's focus indicator must clear the 3:1 non-text contrast minimum
 * (WCAG 1.4.11 / 2.4.11).
 *
 * The audit reported the default focus indicator as a 22%-alpha box-shadow at
 * 1.22:1–1.83:1 and called it a failure in 5 of 6 themes. Computing it showed
 * that is only half right, and the correction matters:
 *
 *   - the 22% glow really is ~1.2–1.4:1 in every theme, so it cannot carry the
 *     indicator on its own;
 *   - but the same rule also changes `border-color` to the full-strength focus
 *     token, and THAT is the real indicator. It measured 4.47 / 5.98 / 4.86 /
 *     4.38:1 in light / dark / corporate / modern — passing — and 2.72:1 (soft)
 *     and 2.57:1 (glass) — failing.
 *
 * So it was 2 themes, not 5. Those two tokens were darkened while keeping their
 * hue. This test pins the requirement to the border token, which is where the
 * contrast actually has to hold.
 */

import { describe, expect, it } from "vitest";
import { builtInThemes } from "../src/theme/index.js";

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

describe("focus indicator contrast", () => {
  it("every theme's focus ring clears 3:1 against its own surface", () => {
    const failures: string[] = [];
    for (const [name, theme] of Object.entries(builtInThemes)) {
      const ring = (theme as Record<string, unknown>).colorFocusRing;
      const surface = (theme as Record<string, unknown>).colorSurface
        ?? (theme as Record<string, unknown>).colorBg;
      if (!isHex(ring) || !isHex(surface)) continue;
      const ratio = contrast(ring, surface);
      if (ratio < 3.0) {
        failures.push(`${name}: focus ring ${ring} on ${surface} = ${ratio.toFixed(2)}:1 (needs >= 3.0)`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("every theme's interactive control boundary clears 3:1", () => {
    // `colorBorder` itself is deliberately faint (1.17-1.70:1) because it also
    // draws hairlines, dividers and table row separators. `colorBorderControl`
    // is the accessible boundary for controls the user has to locate, so the
    // 3:1 requirement is pinned to that token, not to colorBorder.
    const failures: string[] = [];
    for (const [name, theme] of Object.entries(builtInThemes)) {
      const border = (theme as Record<string, unknown>).colorBorderControl;
      const surface = (theme as Record<string, unknown>).colorSurface
        ?? (theme as Record<string, unknown>).colorBg;
      // Translucent values (the glass theme) cannot be evaluated without
      // compositing, so they are checked by review rather than here.
      if (!isHex(border) || !isHex(surface)) continue;
      const ratio = contrast(border, surface);
      if (ratio < 3.0) {
        failures.push(`${name}: control border ${border} on ${surface} = ${ratio.toFixed(2)}:1 (needs >= 3.0)`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("pins the two themes that were fixed, so they cannot drift back", () => {
    const soft = (builtInThemes as unknown as Record<string, Record<string, unknown>>).soft;
    const glass = (builtInThemes as unknown as Record<string, Record<string, unknown>>).glass;
    for (const [name, theme] of [["soft", soft], ["glass", glass]] as const) {
      if (!theme) continue;
      const ring = theme.colorFocusRing;
      expect(isHex(ring), `${name} should define a hex focus ring`).toBe(true);
      expect(contrast(ring as string, "#ffffff")).toBeGreaterThanOrEqual(3.0);
    }
  });
});

describe("primary colour is usable as text", () => {
  it("every theme's colorPrimary clears 4.5:1 on its own surface", () => {
    // 124 rules paint `color: var(--rui-color-primary)` as body text, and the
    // same token is the fill behind the primary button's label, so it has to meet
    // the TEXT threshold in both directions — not just the 3:1 graphics one.
    const failures: string[] = [];
    for (const [name, theme] of Object.entries(builtInThemes)) {
      const primary = (theme as Record<string, unknown>).colorPrimary;
      const surface = (theme as Record<string, unknown>).colorSurface
        ?? (theme as Record<string, unknown>).colorBg;
      if (!isHex(primary) || !isHex(surface)) continue;
      const ratio = contrast(primary, surface);
      if (ratio < 4.5) failures.push(`${name}: primary ${primary} on ${surface} = ${ratio.toFixed(2)}:1`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
