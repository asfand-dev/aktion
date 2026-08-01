/**
 * A size token must resolve to the same size everywhere.
 *
 * Two normalisers had drifted apart. `canonicalSizeToken` (utils.ts) knew the
 * whole legacy dialect — `s`/`m`/`l` plus `small`/`normal`/`large` — while
 * `normaliseSize` (content.ts) handled only the verbose spellings. So `size: "s"`
 * resolved to "sm" in components using the first helper and fell through to the
 * "md" fallback in components using the second. A third group emitted
 * `asString(props.size)` unchanged, producing `data-size="s"`, which matches no
 * CSS rule at all — so the same prop value gave three different results
 * depending on which file the component happened to live in.
 */

import { describe, expect, it } from "vitest";
import { canonicalSizeToken, LEGACY_SIZE_TOKEN_ALIASES } from "../src/library/utils.js";
import { normaliseSize } from "../src/library/components/content.js";

describe("size token resolution is consistent", () => {
  it("both normalisers agree on every legacy alias", () => {
    const disagreements: string[] = [];
    for (const [legacy, canonical] of Object.entries(LEGACY_SIZE_TOKEN_ALIASES)) {
      const viaShared = canonicalSizeToken(legacy);
      const viaContent = normaliseSize(legacy);
      if (viaShared !== viaContent) {
        disagreements.push(`"${legacy}": canonicalSizeToken -> "${viaShared}" but normaliseSize -> "${viaContent}"`);
      }
      expect(viaShared, `"${legacy}" should canonicalise to "${canonical}"`).toBe(canonical);
    }
    expect(disagreements, disagreements.join("\n")).toEqual([]);
  });

  it("the single-letter dialect resolves, not falls back", () => {
    // This is the exact regression: "s" used to become "md" here.
    expect(normaliseSize("s")).toBe("sm");
    expect(normaliseSize("m")).toBe("md");
    expect(normaliseSize("l")).toBe("lg");
  });

  it("canonical spellings pass through untouched", () => {
    for (const s of ["xs", "sm", "md", "lg", "xl"]) {
      expect(normaliseSize(s)).toBe(s);
      expect(canonicalSizeToken(s)).toBe(s);
    }
  });

  it("an unknown value still falls back rather than leaking through", () => {
    // A value no CSS rule matches must not reach `data-size`.
    expect(normaliseSize("enormous", "md")).toBe("md");
    expect(normaliseSize("", "lg")).toBe("lg");
  });
});
