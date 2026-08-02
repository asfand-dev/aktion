/**
 * Guard for `src/theme/styles.ts`.
 *
 * The whole stylesheet is a single JS template literal, so a stray backtick or
 * `${` inside a CSS comment silently terminates the literal and the rest of the
 * file is parsed as code. That failure mode surfaces as confusing type errors
 * (sometimes in unrelated files like `element.ts`), so it is worth asserting
 * directly: the exported CSS must be one intact string containing the theme
 * blocks we expect.
 */

import { describe, expect, it } from "vitest";
import { componentStyles } from "../src/theme/styles.js";

/** Source order of the per-theme blocks, which the slices below rely on. */
const VISION = ':host([data-rui-theme="vision"])';
const CORPORATE = ':host([data-rui-theme="corporate"])';
const MODERN = ':host([data-rui-theme="modern"])';

const blockBetween = (from: string, to: string): string =>
  componentStyles.slice(componentStyles.indexOf(from), componentStyles.indexOf(to));

describe("componentStyles integrity", () => {
  it("is one non-trivial CSS string", () => {
    expect(typeof componentStyles).toBe("string");
    // The real sheet is well over 100k chars; a truncated literal would be tiny.
    expect(componentStyles.length).toBeGreaterThan(100_000);
  });

  it("still declares every theme that has an override block", () => {
    // `light` and `dark` are purely token-driven and intentionally have no
    // `:host([data-rui-theme=...])` block; the rest reshape components.
    // `vision` is private — absent from `builtInThemes`, but its CSS block is
    // what makes the name work at all, so it is asserted here like the others.
    for (const theme of ["soft", "glass", "vision", "corporate", "modern"]) {
      expect(componentStyles).toContain(`:host([data-rui-theme="${theme}"])`);
    }
  });

  it("reaches the end of the sheet — the last theme block is intact", () => {
    // `modern` is authored last; if the literal closed early it would be absent.
    const vision = componentStyles.indexOf(VISION);
    const corporate = componentStyles.indexOf(CORPORATE);
    const modern = componentStyles.indexOf(MODERN);
    expect(vision).toBeGreaterThan(-1);
    expect(corporate).toBeGreaterThan(vision);
    expect(modern).toBeGreaterThan(corporate);
  });

  it("keeps the vision block's UI block-anchored anchor values", () => {
    // A few load-bearing values from the UI block. If any of these
    // vanish the vision theme has silently drifted off the framework.
    const visionBlock = blockBetween(VISION, CORPORATE);
    expect(visionBlock).toContain("line-height: 24px");   // 36px button box
    expect(visionBlock).toContain("#dbedf8");             // corporate-1 hover wash
    expect(visionBlock).toContain("#718095");             // neutral-5 input border
    expect(visionBlock).toContain("opacity: 0.62");       // UI block disabled button
    expect(visionBlock).toContain("text-transform: uppercase"); // table header
  });

  it("keeps the corporate block's own signatures", () => {
    // The corporate theme is a fresh design, not a re-creation of an external
    // framework, so what is pinned here is what makes it recognisably itself.
    const corporateBlock = blockBetween(CORPORATE, MODERN);
    // Square-shouldered controls (the radius token, not a pill).
    expect(corporateBlock).toContain("border-radius: var(--rui-radius-button)");
    // The 2px teal rail that marks the selected tab.
    expect(corporateBlock).toContain("border-bottom-color: var(--rui-color-primary)");
    // Flat cards: no resting shadow, hairline first.
    expect(corporateBlock).toContain("box-shadow: none");
    // Sentence-case table headers — deliberately NOT vision's/modern's uppercase.
    expect(corporateBlock).toContain("text-transform: none");
  });
});


describe("vision theme web fonts", () => {
  it("declares the UI block typefaces so a page does not fall back to system-ui", async () => {
    const { builtInThemeFonts } = await import("../src/theme/index.js");
    const decl = builtInThemeFonts.vision;
    expect(decl).toBeTruthy();
    // UI block self-hosts one file per weight and always asks for 400; the closest
    // equivalent here is the same two families at 400 and 600.
    expect(decl.import).toEqual(
      expect.arrayContaining(["Open Sans:400,600", "Overpass:400,600"]),
    );
  });

  it("keeps vision on UI block's weight ladder — no 700/800 title roles", () => {
    const block = blockBetween(VISION, CORPORATE);
    // UI block has no component text above SemiBold; a 700 or 800 here means a title
    // role slipped back onto the UA bold rung.
    expect(block).not.toMatch(/font-weight:\s*(700|800)\b/);
    // and the systemic heading reset must stay in place
    expect(block).toMatch(/font-weight:\s*inherit/);
  });
});

describe("corporate theme web fonts", () => {
  it("declares its own typefaces rather than inheriting vision's", async () => {
    const { builtInThemeFonts } = await import("../src/theme/index.js");
    const decl = builtInThemeFonts.corporate;
    expect(decl).toBeTruthy();
    expect(decl.import).toEqual(
      expect.arrayContaining(["Inter:400,500,600,700", "Space Grotesk:500,600,700"]),
    );
    // The two themes must not share a font declaration — that was the symptom
    // to avoid when the `corporate` key was handed to a different design.
    expect(decl.import).not.toEqual(builtInThemeFonts.vision.import);
  });
});
