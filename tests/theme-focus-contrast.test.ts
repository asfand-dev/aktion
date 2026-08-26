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
 *     4.38:1 in light / dark / shadcn / mui — passing — and 2.72:1 (soft)
 *     and 2.57:1 (glass) — failing.
 *
 * So it was 2 themes, not 5. Those two tokens were darkened while keeping their
 * hue. This test pins the requirement to the border token, which is where the
 * contrast actually has to hold.
 */

import { describe, expect, it } from "vitest";
import { builtInThemes, privateThemes } from "../src/theme/index.js";

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

describe("the brand hue is usable as text, and as a fill", () => {
  /*
   * The brand hue has two jobs, and they pull in opposite directions.
   *
   * As TEXT it must clear 4.5:1 on the theme's own surface — the sheet paints
   * `color: var(--rui-color-primary)` in well over a hundred rules. As a FILL
   * it carries `colorPrimaryText` as its label, which needs the same 4.5:1 the
   * other way round. On a dark surface those two demands can be mutually
   * exclusive: heroui-dark's HeroUI blue #006fee is 3.80:1 as text on its
   * #18181b card, and every value bright enough to fix that drops white-on-blue
   * below the bar (a brighter #338ef7 would give 5.36:1 as text but only
   * 3.31:1 under its own label).
   *
   * So the requirement is split the way the tokens already are:
   *   - `colorLink` (falling back to `colorPrimary`) is the TEXT-side value and
   *     takes the 4.5:1 bar. That is exactly what the token was introduced for
   *     — see its doc comment in theme/index.ts.
   *   - `colorPrimary` itself keeps the 3:1 non-text bar for its shape role,
   *     and must stay legible under `colorPrimaryText`.
   */
  it("every theme's text-side brand hue clears 4.5:1 on its own surface", () => {
    const failures: string[] = [];
    for (const [name, theme] of Object.entries(builtInThemes)) {
      const t = theme as Record<string, unknown>;
      const text = t.colorLink ?? t.colorPrimary;
      const surface = t.colorSurface ?? t.colorBg;
      if (!isHex(text) || !isHex(surface)) continue;
      const ratio = contrast(text, surface);
      if (ratio < 4.5) failures.push(`${name}: link/primary ${text} on ${surface} = ${ratio.toFixed(2)}:1`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("every theme's colorPrimary still clears the 3:1 shape bar", () => {
    // The floor for the role that cannot move to `colorLink`: the button fill,
    // the progress bar, the checked checkbox, the focus border.
    const failures: string[] = [];
    for (const [name, theme] of Object.entries(builtInThemes)) {
      const t = theme as Record<string, unknown>;
      const surface = t.colorSurface ?? t.colorBg;
      if (!isHex(t.colorPrimary) || !isHex(surface)) continue;
      const ratio = contrast(t.colorPrimary as string, surface);
      if (ratio < 3.0) failures.push(`${name}: primary ${t.colorPrimary} on ${surface} = ${ratio.toFixed(2)}:1`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("every theme's primary label is legible on the primary fill", () => {
    // The other direction, which nothing used to check: `colorPrimaryText` is
    // painted ON `colorPrimary` by every solid button, badge and step marker.
    const failures: string[] = [];
    for (const [name, theme] of Object.entries(builtInThemes)) {
      const t = theme as Record<string, unknown>;
      if (!isHex(t.colorPrimary) || !isHex(t.colorPrimaryText)) continue;
      const ratio = contrast(t.colorPrimaryText as string, t.colorPrimary as string);
      if (ratio < 4.5) failures.push(`${name}: ${t.colorPrimaryText} on primary ${t.colorPrimary} = ${ratio.toFixed(2)}:1`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});

/**
 * The `colorOn<Tone>` family is the ink drawn ON the matching `color<Tone>`
 * fill. Every single usage in `styles.ts` pairs them directly —
 * `background: var(--rui-color-danger); color: var(--rui-color-on-danger)` on
 * the destructive confirm button, the danger `Button` / `IconButton` variant,
 * the toast and callout icon chips, the notification badges and the error step
 * marker. A token that holds the fill's OWN value therefore does not read as
 * "low contrast": it is invisible, at exactly 1.00:1.
 *
 * `vision` shipped that. `colorOnDanger` held the fill's `#c80a00`, so its
 * destructive confirm button was a solid red rectangle with a red label — and
 * every other danger-filled surface went blank with it. The token's own comment
 * already said "#ffffff, not the fill colour", so the note landed without the
 * value. Nothing caught it, because the suites above enumerate `builtInThemes`
 * and `vision` is private — hence the walk over BOTH registries here.
 *
 * KNOWN GAP, deliberately not asserted: several `colorOn<Tone>` pairs are
 * legible but below the WCAG bar — `vision` measures 2.01:1 (success), 2.56:1
 * (warning) and 2.10:1 (info). Those fills are
 * mid-tone, so neither dark nor white ink reaches 4.5:1 on them (white gives
 * `vision` 3.08 / 2.65 / 2.92:1 — worse for warning), and `vision`'s values are
 * pinned to the IONOS Exos palette. Closing them means re-picking the FILLS with
 * that palette in hand, which is a design decision rather than a token typo.
 */
describe("ink on a semantic fill is legible", () => {
  const PAIRS = [
    ["colorOnSuccess", "colorSuccess"],
    ["colorOnWarning", "colorWarning"],
    ["colorOnDanger", "colorDanger"],
    ["colorOnInfo", "colorInfo"],
  ] as const;

  const everyTheme = (): Array<[string, Record<string, unknown>]> =>
    Object.entries({ ...builtInThemes, ...privateThemes }) as Array<[string, Record<string, unknown>]>;

  it("no theme paints an on-<tone> ink in its own fill colour", () => {
    const failures: string[] = [];
    for (const [name, theme] of everyTheme()) {
      for (const [inkToken, fillToken] of PAIRS) {
        const ink = theme[inkToken];
        const fill = theme[fillToken];
        if (typeof ink !== "string" || typeof fill !== "string") continue;
        if (ink.toLowerCase() === fill.toLowerCase()) {
          failures.push(`${name}: ${inkToken} is a copy of ${fillToken} (${ink}) — the surface is invisible`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("keeps vision's destructive surfaces readable at the 4.5:1 text bar", () => {
    // Pinned rather than swept: `.rui-confirm-ok[data-tone="danger"]` and
    // `.rui-button[data-variant="danger"]` render a LABEL on this fill, so the
    // text threshold is the one that applies — and this is the pair that
    // regressed. Both DCD consoles run on `vision`.
    const vision = (privateThemes as unknown as Record<string, Record<string, unknown>>).vision!;
    const ink = vision.colorOnDanger;
    const fill = vision.colorDanger;
    expect(isHex(ink) && isHex(fill)).toBe(true);
    expect(contrast(ink as string, fill as string)).toBeGreaterThanOrEqual(4.5);
  });
});
