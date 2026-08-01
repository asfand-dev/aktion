/**
 * `tone` and `variant` must be interchangeable everywhere.
 *
 * The library uses two names for the same concept and had them inverted between
 * its two most-used components: `Badge` takes `tone`, `Button` takes `variant`.
 * 29 specs used `tone` and 13 used `variant`, with only a handful bridged. Since
 * `src/library/validate.ts` treats an undeclared prop as a FATAL error, guessing
 * the other spelling was a hard build failure rather than a soft inconsistency.
 *
 * Renaming was deliberately rejected: it would break shipped `.aktion` programs
 * and the generated system prompt (exactly what happened earlier in this project
 * when `Brand.logo` was renamed without an alias). Aliasing achieves the same
 * outcome with no breaking change.
 *
 * `Text` and `TextContent` are the only specs that declare BOTH as genuinely
 * distinct props — `variant` is the typographic size/weight, `tone` is the
 * colour — so they are excluded rather than bridged.
 */

import { describe, expect, it } from "vitest";
import { defaultLibrary } from "../src/library/index.js";

const DECLARES_BOTH = new Set(["Text", "TextContent"]);

describe("tone / variant are interchangeable", () => {
  it("every spec with one accepts the other as an alias", () => {
    const unbridged: string[] = [];
    for (const spec of defaultLibrary.components) {
      if (DECLARES_BOTH.has(spec.name)) continue;
      const tone = spec.props.find((p) => p.name === "tone");
      const variant = spec.props.find((p) => p.name === "variant");
      // A spec that legitimately declares both is a distinct-props case.
      if (tone && variant) continue;
      const bridges = (p: typeof tone, name: string): boolean =>
        (p?.aliases ?? []).includes(name);
      if (tone && !bridges(tone, "variant")) unbridged.push(`${spec.name}: tone has no "variant" alias`);
      if (variant && !bridges(variant, "tone")) unbridged.push(`${spec.name}: variant has no "tone" alias`);
    }
    expect(unbridged, `validate.ts hard-errors on an undeclared prop, so each of these is a build failure for an author who guesses the other spelling:\n${unbridged.join("\n")}`)
      .toEqual([]);
  });

  it("the two genuine both-props specs are left alone", () => {
    for (const name of DECLARES_BOTH) {
      const spec = defaultLibrary.components.find((s) => s.name === name);
      expect(spec, `${name} should exist`).toBeTruthy();
      // Both must remain real, separately-declared props — aliasing either onto
      // the other would silently collapse two different things.
      expect(spec!.props.some((p) => p.name === "tone")).toBe(true);
      expect(spec!.props.some((p) => p.name === "variant")).toBe(true);
    }
  });
});
