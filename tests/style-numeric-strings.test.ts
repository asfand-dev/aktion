/**
 * The runtime behaviour behind the `SxNumber` type (`number | `${number}``,
 * scripts/dsl-types/style-types.ts): every numeric key of the style channel
 * parses a numeric string like the number it spells, so `opacity: "0.9"` —
 * the form docs/tutorial.html teaches — renders exactly as `opacity: 0.9`.
 * `num()` (src/library/sx.ts) parses only plain decimals, so the forms
 * `${number}` admits beyond that (`"1e3"`, `".5"`, `"+1"`) are dropped; the
 * type's JSDoc says so, and this file is the measurement it cites.
 */
import { describe, expect, it } from "vitest";
import { RESPONSIVE_RESOLVERS, resolveAnimate, serializeSx } from "../src/library/sx.js";
import { getResponsiveSheet } from "../src/library/responsive-style.js";

/** The text of every shared-sheet rule that targets `cls`. */
function rulesFor(cls: string): string {
  const sheet = getResponsiveSheet();
  if (!sheet) throw new Error("this test needs constructable stylesheets");
  return [...sheet.cssRules].map((r) => r.cssText).filter((t) => t.includes(`.${cls}`)).join(" ");
}
const stateClass = (classes: readonly string[]): string => {
  const cls = classes.find((c) => /^ak-s/.test(c));
  if (!cls) throw new Error(`no state class in ${JSON.stringify(classes)}`);
  return cls;
};

describe("sx — a numeric string renders like its number", () => {
  it("on the base keys", () => {
    const fromStrings = serializeSx({ opacity: "0.5", grow: "1", shrink: "0", columns: "3", zIndex: "60" });
    expect(fromStrings).toEqual(serializeSx({ opacity: 0.5, grow: 1, shrink: 0, columns: 3, zIndex: 60 }));
    expect(fromStrings.style).toBe("opacity:0.5;flex-grow:1;flex-shrink:0;grid-template-columns:repeat(3, minmax(0, 1fr));z-index:60");
  });

  it("inside a breakpoint map", () => {
    for (const [key, text, value] of [["opacity", "0.9", 0.9], ["grow", "2", 2], ["shrink", "0", 0], ["columns", "3", 3], ["zIndex", "60", 60]] as const) {
      expect(RESPONSIVE_RESOLVERS[key]!(text), key).toEqual(RESPONSIVE_RESOLVERS[key]!(value));
      expect(RESPONSIVE_RESOLVERS[key]!(text), key).not.toEqual([]);
    }
    expect(serializeSx({ opacity: { base: "1", md: "0.8" }, columns: { base: "1", md: "3" } }))
      .toEqual(serializeSx({ opacity: { base: 1, md: 0.8 }, columns: { base: 1, md: 3 } }));
  });

  it("in a state style — the tutorial's `states: { hover: { opacity: \"0.9\" } }`", () => {
    const tutorial = serializeSx({ p: "l", weight: "800", states: { hover: { opacity: "0.9" } } });
    expect(tutorial).toEqual(serializeSx({ p: "l", weight: "800", states: { hover: { opacity: 0.9 } } }));
    expect(rulesFor(stateClass(tutorial.classes))).toMatch(/:hover[^{]*\{[^}]*opacity: ?0\.9/);

    const transforms = serializeSx({ states: { active: { scale: "0.98", rotate: "-3" } } });
    expect(transforms).toEqual(serializeSx({ states: { active: { scale: 0.98, rotate: -3 } } }));
    expect(rulesFor(stateClass(transforms.classes))).toContain("scale(0.98) rotate(-3deg)");
  });

  it("on `hover.scale`, as the transform alone (only `scale: true` is the effect flag)", () => {
    const { classes } = serializeSx({ hover: { scale: "1.02" } });
    expect(classes).not.toContain("ak-hover-scale");
    expect(rulesFor(stateClass(classes))).toContain("scale(1.02)");
  });

  it("in `animate` timing", () => {
    const fromStrings = resolveAnimate({ preset: "pulse", delay: "50", duration: "300", repeat: "3" });
    expect(fromStrings).toEqual(resolveAnimate({ preset: "pulse", delay: 50, duration: 300, repeat: 3 }));
    expect(fromStrings.style).toBe("animation-delay:50ms;animation-duration:300ms;animation-iteration-count:3");
  });
});

describe("sx — numeric strings that are dropped", () => {
  it("drops the `${number}` forms `num()` does not parse: exponents, a leading dot or plus, hex", () => {
    for (const v of ["1e3", ".5", "+1", "0x10"]) {
      expect(serializeSx({ opacity: v, grow: v, columns: v, zIndex: v }).style, v).toBe("");
      expect(serializeSx({ states: { hover: { opacity: v, scale: v } } }).classes, v).toEqual([]);
      expect(resolveAnimate({ preset: "pulse", repeat: v }).style, v).toBe("");
    }
  });

  it("drops what the negative type fixtures reject", () => {
    expect(serializeSx({ opacity: "50%" }).style).toBe("");
    expect(serializeSx({ states: { hover: { opacity: "90%" } } }).classes).toEqual([]);
    expect(serializeSx({ columns: "3fr" }).style).toBe("");
    expect(serializeSx({ grow: "auto" }).style).toBe("");
  });
});
