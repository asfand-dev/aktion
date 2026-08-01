/**
 * The universal `role` channel is the escape valve for ARIA defects that cannot
 * be fixed from outside the library.
 *
 * Before it existed, an app author had no way to correct a component's role: the
 * universal channel offered `aria` but not `role`, and `validate.ts` rejects any
 * undeclared prop, so passing one was a hard error.
 *
 * It is allow-listed on purpose. An unrecognised role is ignored by assistive
 * tech, and a plausible-but-wrong one (`button` on a container, a landmark that
 * needs owned children) is worse than the defect it was meant to work around.
 */

import { describe, expect, it } from "vitest";
import { applyUniversal, UNIVERSAL_PROP_NAMES } from "../src/library/sx.js";

const div = (): HTMLElement => document.createElement("div");

describe("universal role channel", () => {
  it("is registered, so validate.ts accepts it", () => {
    // validate.ts consults this same set, so registration is what makes the prop
    // passable at all.
    expect(UNIVERSAL_PROP_NAMES.has("role")).toBe(true);
  });

  it("applies an allow-listed role", () => {
    const el = div();
    applyUniversal(el, { role: "status" });
    expect(el.getAttribute("role")).toBe("status");
  });

  it("normalises case and whitespace", () => {
    const el = div();
    applyUniversal(el, { role: "  NAVIGATION " });
    expect(el.getAttribute("role")).toBe("navigation");
  });

  it("drops a role that is not on the allow-list", () => {
    const el = div();
    applyUniversal(el, { role: "gridcell" });   // needs an owning row/grid
    expect(el.getAttribute("role")).toBeNull();
  });

  it("drops a nonsense role rather than emitting it", () => {
    const el = div();
    applyUniversal(el, { role: "totally-made-up" });
    expect(el.getAttribute("role")).toBeNull();
  });

  it("supports the neutral values used to remove an element from the tree", () => {
    for (const role of ["none", "presentation"]) {
      const el = div();
      applyUniversal(el, { role });
      expect(el.getAttribute("role")).toBe(role);
    }
  });
});
