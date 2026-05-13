import { describe, expect, it } from "vitest";
import {
  FONT_AWESOME_CDN_URL,
  FONT_AWESOME_VERSION,
  ensureFontAwesomeLoaded,
  isIconName,
  isIconSize,
  resolveIconClasses,
} from "../src/icons/index.js";

describe("resolveIconClasses", () => {
  it("defaults to the solid variant when no prefix is given", () => {
    expect(resolveIconClasses("house")).toEqual(["fa-solid", "fa-house"]);
    expect(resolveIconClasses("chart-line")).toEqual(["fa-solid", "fa-chart-line"]);
  });

  it("supports `regular:` and `brands:` variant prefixes", () => {
    expect(resolveIconClasses("regular:star")).toEqual(["fa-regular", "fa-star"]);
    expect(resolveIconClasses("brands:github")).toEqual(["fa-brands", "fa-github"]);
  });

  it("accepts an explicit `solid:` prefix and treats it like the default", () => {
    expect(resolveIconClasses("solid:bell")).toEqual(["fa-solid", "fa-bell"]);
  });

  it("falls back to solid when the variant prefix is unknown", () => {
    expect(resolveIconClasses("light:cart-shopping")).toEqual([
      "fa-solid",
      "fa-cart-shopping",
    ]);
  });

  it("trims surrounding whitespace", () => {
    expect(resolveIconClasses("  bolt  ")).toEqual(["fa-solid", "fa-bolt"]);
  });

  it("returns an empty array for blank or non-string input", () => {
    expect(resolveIconClasses("")).toEqual([]);
    expect(resolveIconClasses("   ")).toEqual([]);
    expect(resolveIconClasses(undefined)).toEqual([]);
    expect(resolveIconClasses(null)).toEqual([]);
    expect(resolveIconClasses(42)).toEqual([]);
  });

  it("returns an empty array for emoji / non-ASCII legacy input", () => {
    expect(resolveIconClasses("🏠")).toEqual([]);
    expect(resolveIconClasses("✓")).toEqual([]);
    expect(resolveIconClasses("café")).toEqual([]);
  });

  it("strips invisible Unicode glyph modifiers (variation selectors, ZWJ)", () => {
    // FA name followed by a U+FE0F variation selector — common when an
    // emoji glyph was rewritten as text but the modifier was left behind.
    expect(resolveIconClasses("triangle-exclamation\uFE0F")).toEqual([
      "fa-solid",
      "fa-triangle-exclamation",
    ]);
    expect(resolveIconClasses("pen\uFE0F")).toEqual(["fa-solid", "fa-pen"]);
    expect(resolveIconClasses("\u200Dgear\uFE0E")).toEqual([
      "fa-solid",
      "fa-gear",
    ]);
    // Variant prefix still parses even with modifiers in the name.
    expect(resolveIconClasses("regular:star\uFE0F")).toEqual([
      "fa-regular",
      "fa-star",
    ]);
  });

  it("isIconName mirrors resolveIconClasses", () => {
    expect(isIconName("house")).toBe(true);
    expect(isIconName("🏠")).toBe(false);
    expect(isIconName(undefined)).toBe(false);
  });

  it("isIconSize recognises the supported size tokens", () => {
    expect(isIconSize("xs")).toBe(true);
    expect(isIconSize("md")).toBe(true);
    expect(isIconSize("xl")).toBe(true);
    expect(isIconSize("xxl")).toBe(false);
    expect(isIconSize(2)).toBe(false);
  });
});

describe("ensureFontAwesomeLoaded", () => {
  it("injects exactly one stylesheet into document.head and one into the shadow root", () => {
    // The runtime detects happy-dom and skips injection to keep test output
    // clean (real browsers never hit that path). Temporarily clear the marker
    // for this single test so we can exercise the injection logic itself.
    const globalAsAny = globalThis as { happyDOM?: unknown };
    const happyDomMarker = globalAsAny.happyDOM;
    delete globalAsAny.happyDOM;

    try {
      document.head
        .querySelectorAll(`link[data-rui-font-awesome="${FONT_AWESOME_VERSION}"]`)
        .forEach((node) => node.remove());

      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });

      ensureFontAwesomeLoaded(shadow);
      ensureFontAwesomeLoaded(shadow);

      const docLinks = document.head.querySelectorAll(
        `link[data-rui-font-awesome="${FONT_AWESOME_VERSION}"]`,
      );
      const shadowLinks = shadow.querySelectorAll(
        `link[data-rui-font-awesome="${FONT_AWESOME_VERSION}"]`,
      );

      expect(docLinks.length).toBe(1);
      expect(shadowLinks.length).toBe(1);
      expect(docLinks[0].getAttribute("href")).toBe(FONT_AWESOME_CDN_URL);
      expect(shadowLinks[0].getAttribute("href")).toBe(FONT_AWESOME_CDN_URL);
    } finally {
      if (happyDomMarker !== undefined) globalAsAny.happyDOM = happyDomMarker;
    }
  });
});
