/**
 * A plain number handed to `sanitiseCssLength` means pixels.
 *
 * It used to be emitted as written — `height: 320` became `height:320`, a
 * declaration the CSS parser drops, so the box silently collapsed to its
 * content. That is the opposite of the React convention every author of a
 * `width: 240` already expects. A NUMERIC STRING keeps its old meaning: callers
 * that care already decide what bare digits mean before they get here
 * (`cssLengthProp` in content.ts turns them into px; `cssSize` in data.ts hands
 * them to the Sparkline `<svg width>` attribute as user units), and changing it
 * here would move call sites that already work.
 */

import { describe, expect, it } from "vitest";
import { sanitiseCssLength } from "../src/library/utils.js";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";

const fragment = (expression: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(`$app(${expression})`);
  return host;
};

describe("sanitiseCssLength", () => {
  it("reads a finite number as px", () => {
    expect(sanitiseCssLength(320, "auto")).toBe("320px");
    expect(sanitiseCssLength(12.5, "auto")).toBe("12.5px");
    expect(sanitiseCssLength(-8, "auto")).toBe("-8px");
  });

  it("keeps zero unitless, as React does", () => {
    expect(sanitiseCssLength(0, "auto")).toBe("0");
  });

  it("falls back on a number that is not a length", () => {
    expect(sanitiseCssLength(Number.NaN, "auto")).toBe("auto");
    expect(sanitiseCssLength(Number.POSITIVE_INFINITY, "auto")).toBe("auto");
  });

  it("leaves strings exactly as before — numeric strings included", () => {
    expect(sanitiseCssLength("320", "auto")).toBe("320");
    expect(sanitiseCssLength("40vh", "auto")).toBe("40vh");
    expect(sanitiseCssLength("calc(100% - 20px)", "auto")).toBe("calc(100% - 20px)");
    expect(sanitiseCssLength("10px;position:fixed", "auto")).toBe("auto");
    expect(sanitiseCssLength("", "auto")).toBe("auto");
    expect(sanitiseCssLength(null, "auto")).toBe("auto");
  });
});

describe("components that pass a raw prop through get px for a number", () => {
  it("ScrollArea maxHeight", () => {
    const style = fragment(`ScrollArea([Text("x")], { maxHeight: 400 })`).querySelector(".rui-scroll-area")?.getAttribute("style");
    expect(style).toContain("max-height:400px");
  });

  it("Container maxWidth", () => {
    const style = fragment(`Container([Text("x")], { maxWidth: 640 })`).querySelector(".rui-container")?.getAttribute("style");
    expect(style).toContain("640px");
  });
});
