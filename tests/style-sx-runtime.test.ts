/**
 * Runtime fixes in the `sx` resolver (src/library/sx.ts) that the typed `sx`
 * surface relies on. Each `it` is a defect that rendered silently wrong CSS:
 *
 *   - a bare number on a length key was emitted unitless (`padding:8`), which
 *     the browser drops — numbers are now pixels;
 *   - `focus: "lift"` (and grow / bright / underline / scale) emitted an
 *     `ak-focus-*` class that no rule styles;
 *   - `hover: { scale: 1.04 }` added the `ak-hover-scale` utility (`scale(1.05)`)
 *     next to the custom `scale(1.04)` rule;
 *   - the base pass ignored `wrap: false` while the responsive pass honoured it;
 *   - `gradient.*` refs were written into colour sinks (`color`, `border-color`,
 *     the `border` shorthand), where a gradient is invalid;
 *   - `border: false` emitted `1px solid false`;
 *   - a table lookup matched `Object.prototype` keys (`p: "constructor"`).
 */
import { describe, expect, it } from "vitest";
import {
  ANIMATE_NONE, FOCUS_EFFECTS, HOVER_EFFECTS, RESPONSIVE_RESOLVERS, resolveAnimate, serializeSx,
} from "../src/library/sx.js";
import { BREAKPOINT_MIN, INTERACTION_STATES, getResponsiveSheet } from "../src/library/responsive-style.js";
import { RESPONSIVE_BREAKPOINTS } from "../src/library/utils.js";
import { componentStyles } from "../src/theme/styles.js";

/** The `prop:value` declarations of an inline style string. */
const declsOf = (style: string): Record<string, string> =>
  Object.fromEntries(style.split(";").filter(Boolean).map((d) => {
    const i = d.indexOf(":");
    return [d.slice(0, i), d.slice(i + 1)];
  }));

/** The text of every shared-sheet rule that targets `cls`. */
function rulesFor(cls: string): string[] {
  const sheet = getResponsiveSheet();
  if (!sheet) throw new Error("this test needs constructable stylesheets");
  return [...sheet.cssRules].map((r) => r.cssText).filter((t) => t.includes(`.${cls}`));
}
const stateClass = (classes: readonly string[]): string => {
  const cls = classes.find((c) => /^ak-s/.test(c));
  if (!cls) throw new Error(`no state class in ${JSON.stringify(classes)}`);
  return cls;
};

describe("sx — numbers on length keys are pixels", () => {
  it("emits px for spacing, size, offset, radius, font-size and inset keys", () => {
    const { style } = serializeSx({
      p: 8, mx: -4, gap: 12, w: 200, maxH: 640, minW: 0, basis: 120,
      top: -10, left: 0, inset: 4, radius: 6, fontSize: 16,
    });
    expect(declsOf(style)).toMatchObject({
      padding: "8px", "margin-inline": "-4px", gap: "12px", width: "200px", "max-height": "640px", "min-width": "0",
      "flex-basis": "120px", top: "-10px", left: "0", inset: "4px", "border-radius": "6px", "font-size": "16px",
    });
  });

  it("keeps strings and tokens as they were, and unitless keys unitless", () => {
    const { style } = serializeSx({ p: "12px", m: "md", w: "full", opacity: 0.5, grow: 2, zIndex: 10, weight: 700 });
    expect(declsOf(style)).toMatchObject({
      padding: "12px", margin: "var(--rui-spacing-m)", width: "100%", opacity: "0.5", "flex-grow": "2", "z-index": "10", "font-weight": "700",
    });
  });

  it("drops a non-finite number instead of writing `NaN`", () => {
    expect(serializeSx({ p: Number.NaN, w: Number.POSITIVE_INFINITY }).style).toBe("");
  });

  it("applies the same rule inside a breakpoint map and a state style", () => {
    expect(RESPONSIVE_RESOLVERS.p!(8)).toEqual([["padding", "8px"]]);
    expect(RESPONSIVE_RESOLVERS.radius!(0)).toEqual([["border-radius", "0"]]);
    const { classes } = serializeSx({ states: { hover: { translateY: -4, translateX: 2 } } });
    expect(rulesFor(stateClass(classes)).join(" ")).toContain("translateY(-4px) translateX(2px)");
  });
});

describe("sx — interaction effects", () => {
  it("emits no focus class the stylesheet does not style", () => {
    for (const effect of ["lift", "grow", "bright", "underline", "scale"]) {
      expect(serializeSx({ focus: effect }).classes, effect).toEqual([]);
      expect(serializeSx({ focus: { [effect]: true } }).classes, effect).toEqual([]);
    }
    expect(serializeSx({ focus: "glow" }).classes).toEqual(["ak-focus-glow"]);
    expect(serializeSx({ focus: { border: true } }).classes).toEqual(["ak-focus-border"]);
  });

  it("has a stylesheet rule for every effect class it can emit", () => {
    for (const effect of HOVER_EFFECTS) {
      expect(componentStyles, `ak-hover-${effect}`).toMatch(new RegExp(`\\.ak-hover-${effect}:hover\\b`));
    }
    for (const effect of FOCUS_EFFECTS) {
      expect(componentStyles, `ak-focus-${effect}`).toMatch(new RegExp(`\\.ak-focus-${effect}:focus(-visible|-within)?\\b`));
    }
  });

  it("treats `hover: { scale: <number> }` as the transform alone", () => {
    const { classes } = serializeSx({ hover: { scale: 1.04 } });
    expect(classes).not.toContain("ak-hover-scale");
    expect(rulesFor(stateClass(classes)).join(" ")).toContain("scale(1.04)");
  });

  it("keeps `scale` as the effect when it is `true` or the shorthand", () => {
    expect(serializeSx({ hover: { scale: true } }).classes).toEqual(["ak-hover-scale"]);
    expect(serializeSx({ hover: "scale" }).classes).toEqual(["ak-hover-scale"]);
    // Other flags are unaffected, and still combine with state styles.
    const both = serializeSx({ hover: { lift: true, bg: "primary-hover" } }).classes;
    expect(both[0]).toBe("ak-hover-lift");
    expect(rulesFor(stateClass(both)).join(" ")).toContain("var(--rui-color-primary-hover)");
  });

  it("styles exactly the states the selector table can express", () => {
    expect([...INTERACTION_STATES].sort()).toEqual(
      ["active", "checked", "disabled", "focus", "focus-visible", "focus-within", "group-hover", "hover"],
    );
    expect(serializeSx({ states: { visited: { color: "primary" } } }).classes).toEqual([]);
  });
});

describe("sx — base pass agrees with the responsive pass", () => {
  it("emits `flex-wrap: nowrap` for `wrap: false`", () => {
    expect(declsOf(serializeSx({ wrap: false }).style)).toEqual({ "flex-wrap": "nowrap" });
    expect(declsOf(serializeSx({ wrap: true }).style)).toEqual({ "flex-wrap": "wrap" });
    expect(RESPONSIVE_RESOLVERS.wrap!(false)).toEqual([["flex-wrap", "nowrap"]]);
  });

  it("orders breakpoints from the shared list", () => {
    expect(Object.keys(BREAKPOINT_MIN)).toEqual([...RESPONSIVE_BREAKPOINTS]);
  });
});

describe("sx — gradients only where a background is painted", () => {
  it("resolves a gradient ref on bg and bgOverlay", () => {
    expect(declsOf(serializeSx({ bg: "gradient.brand" }).style)).toEqual({ background: "var(--rui-gradient-brand)" });
    expect(declsOf(serializeSx({ bgOverlay: "gradient.cool" }).style)).toEqual({ "background-image": "var(--rui-gradient-cool)" });
  });

  it("refuses one in a colour sink", () => {
    expect(serializeSx({ color: "gradient.brand", borderColor: "gradient.brand", border: "gradient.brand" }).style).toBe("");
    expect(serializeSx({ states: { hover: { color: "gradient.brand", borderColor: "gradient.warm" } } }).classes).toEqual([]);
    expect(RESPONSIVE_RESOLVERS.color!("gradient.brand")).toEqual([]);
  });
});

describe("sx — border", () => {
  it("draws nothing for `false`, and the default border for `true`", () => {
    expect(serializeSx({ border: false }).style).toBe("");
    expect(declsOf(serializeSx({ border: true }).style)).toEqual({ border: "1px solid var(--rui-color-border)" });
    expect(declsOf(serializeSx({ border: "primary" }).style)).toEqual({ border: "1px solid var(--rui-color-primary)" });
  });
});

describe("sx — table lookups are own-key only", () => {
  it("does not resolve Object.prototype members as tokens", () => {
    const { style } = serializeSx({
      p: "constructor", w: "toString", radius: "valueOf", shadow: "toString", align: "constructor",
      justify: "hasOwnProperty", zIndex: "constructor", fontSize: "toString", border: "constructor", backdrop: "toString",
    });
    expect(style).not.toMatch(/function|native code/);
  });
});

describe("animate", () => {
  it("renders nothing for the documented `none`", () => {
    expect(ANIMATE_NONE).toBe("none");
    expect(resolveAnimate(ANIMATE_NONE)).toEqual({ classes: [], style: "" });
    expect(resolveAnimate({ preset: ANIMATE_NONE, duration: 300 })).toEqual({ classes: [], style: "" });
  });

  it("does not read `easing` (the docs no longer advertise it)", () => {
    expect(resolveAnimate({ preset: "fade", easing: "linear" })).toEqual({ classes: ["ak-anim", "ak-anim-fade"], style: "" });
  });
});
