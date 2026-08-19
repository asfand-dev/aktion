/**
 * The universal `testId` channel is the first-class end-to-end test hook.
 *
 * A test id was already reachable through `data: { testid: "row" }`, but that
 * spelling reads as incidental metadata, and it does not work at all on the six
 * components that declare a `data` prop of their own (`LineChart`, `JsonTree`,
 * `Async`, `Draggable`, `Lottie`, `QRCode`) — there the component's prop shadows
 * the universal channel. `testId` reaches every component.
 *
 * Unlike `id`, the value is NOT restricted. An id has to be a CSS identifier
 * because it feeds `#id` selectors, `getElementById` and `href="#…"`; a test id
 * is an attribute VALUE, and every runner escapes it on the query side. Dropping
 * `user-row:asfand@example.com` for containing a colon would be a silent
 * capability loss — the failure mode this file's neighbours already regret.
 */

import { describe, expect, it } from "vitest";
import { applyUniversal, UNIVERSAL_PROP_NAMES } from "../src/library/sx.js";

const div = (): HTMLElement => document.createElement("div");

describe("universal testId channel", () => {
  it("is registered under both spellings, so validate.ts accepts them", () => {
    // validate.ts consults this same set, and an undeclared prop is a hard
    // error there — not a warning — so registration is what makes the prop
    // passable at all.
    expect(UNIVERSAL_PROP_NAMES.has("testId")).toBe(true);
    expect(UNIVERSAL_PROP_NAMES.has("testid")).toBe(true);
  });

  it("writes data-testid on the element", () => {
    const el = div();
    applyUniversal(el, { testId: "save-button" });
    expect(el.getAttribute("data-testid")).toBe("save-button");
  });

  it("accepts the lowercase alias", () => {
    const el = div();
    applyUniversal(el, { testid: "save-button" });
    expect(el.getAttribute("data-testid")).toBe("save-button");
  });

  it("prefers the camelCase spelling when both are given", () => {
    const el = div();
    applyUniversal(el, { testId: "camel", testid: "lower" });
    expect(el.getAttribute("data-testid")).toBe("camel");
  });

  it("wins over the data bag", () => {
    const el = div();
    applyUniversal(el, { testId: "explicit", data: { testid: "bag" } });
    expect(el.getAttribute("data-testid")).toBe("explicit");
  });

  it("wins over the dataAttrs bag", () => {
    const el = div();
    applyUniversal(el, { testId: "explicit", dataAttrs: { testid: "bag" } });
    expect(el.getAttribute("data-testid")).toBe("explicit");
  });

  it("leaves the older data-bag spelling working on its own", () => {
    // The prop is additive; nothing that used `data: { testid }` may change.
    const el = div();
    applyUniversal(el, { data: { testid: "bag" } });
    expect(el.getAttribute("data-testid")).toBe("bag");
  });

  it("trims surrounding whitespace", () => {
    const el = div();
    applyUniversal(el, { testId: "  save-button  " });
    expect(el.getAttribute("data-testid")).toBe("save-button");
  });

  it("emits nothing for an empty or whitespace-only value", () => {
    for (const testId of ["", "   "]) {
      const el = div();
      applyUniversal(el, { testId });
      expect(el.hasAttribute("data-testid")).toBe(false);
    }
  });

  it("passes the value through verbatim", () => {
    // Characters an `id` would be rejected for. `setAttribute` escapes on
    // serialisation, so there is no injection surface; escaping for a selector
    // is the query side's job (see `cssEscape` in src/testing/index.ts).
    const el = div();
    const raw = 'user "row" 3/4 & co — ünïcode';
    applyUniversal(el, { testId: raw });
    expect(el.getAttribute("data-testid")).toBe(raw);
  });

  it("does not promote a boxless host to a block", () => {
    // The box-promotion rule at the top of applyUniversal exists because STYLE
    // cannot render on a `display: contents` host. An attribute lands fine, so
    // a test id must never change layout.
    const el = div();
    el.setAttribute("style", "display:contents");
    applyUniversal(el, { testId: "boxless" });
    expect(el.getAttribute("style")).toContain("display:contents");
    expect(el.getAttribute("style")).not.toContain("display:block");
    expect(el.getAttribute("data-testid")).toBe("boxless");
  });

  it("is inert on a non-Element node", () => {
    // applyUniversal is called with whatever a component's render returned.
    expect(() => {
      applyUniversal(document.createTextNode("x"), { testId: "nope" });
    }).not.toThrow();
  });
});
