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

describe("componentStyles integrity", () => {
  it("is one non-trivial CSS string", () => {
    expect(typeof componentStyles).toBe("string");
    // The real sheet is well over 100k chars; a truncated literal would be tiny.
    expect(componentStyles.length).toBeGreaterThan(100_000);
  });

  it("still declares every theme that has an override block", () => {
    // `light` and `dark` are purely token-driven and intentionally have no
    // `:host([data-rui-theme=...])` block; the other four reshape components.
    for (const theme of ["soft", "glass", "corporate", "modern"]) {
      expect(componentStyles).toContain(`:host([data-rui-theme="${theme}"])`);
    }
  });

  it("reaches the end of the sheet — the last theme block is intact", () => {
    // `modern` is authored last; if the literal closed early it would be absent.
    const corporate = componentStyles.indexOf(':host([data-rui-theme="corporate"])');
    const modern = componentStyles.indexOf(':host([data-rui-theme="modern"])');
    expect(corporate).toBeGreaterThan(-1);
    expect(modern).toBeGreaterThan(corporate);
  });

  it("keeps the corporate block's UI block-anchored anchor values", () => {
    // A few load-bearing values from the UI block. If any of these
    // vanish the corporate theme has silently drifted off the framework.
    const corporateBlock = componentStyles.slice(
      componentStyles.indexOf(':host([data-rui-theme="corporate"])'),
      componentStyles.indexOf(':host([data-rui-theme="modern"])'),
    );
    expect(corporateBlock).toContain("line-height: 24px");   // 36px button box
    expect(corporateBlock).toContain("#dbedf8");             // corporate-1 hover wash
    expect(corporateBlock).toContain("#718095");             // neutral-5 input border
    expect(corporateBlock).toContain("opacity: 0.62");       // UI block disabled button
    expect(corporateBlock).toContain("text-transform: uppercase"); // table header
  });
});


describe("corporate theme web fonts", () => {
  it("declares the UI block typefaces so a page does not fall back to system-ui", async () => {
    const { builtInThemeFonts } = await import("../src/theme/index.js");
    const decl = builtInThemeFonts.corporate;
    expect(decl).toBeTruthy();
    // UI block self-hosts one file per weight and always asks for 400; the closest
    // equivalent here is the same two families at 400 and 600.
    expect(decl.import).toEqual(
      expect.arrayContaining(["Open Sans:400,600", "Overpass:400,600"]),
    );
  });

  it("keeps corporate on UI block's weight ladder — no 700/800 title roles", () => {
    const block = componentStyles.slice(
      componentStyles.indexOf(':host([data-rui-theme="corporate"])'),
      componentStyles.indexOf(':host([data-rui-theme="modern"])'),
    );
    // UI block has no component text above SemiBold; a 700 or 800 here means a title
    // role slipped back onto the UA bold rung.
    expect(block).not.toMatch(/font-weight:\s*(700|800)\b/);
    // and the systemic heading reset must stay in place
    expect(block).toMatch(/font-weight:\s*inherit/);
  });
});
