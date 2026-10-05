/**
 * `sanitiseCssColor` — the gate in front of every author colour that lands in
 * an inline style, an SVG `fill` or a generated rule.
 *
 * Series colours and Calendar chips go through it now, which exposed two
 * rejections of perfectly valid colours that used to render: the slash-alpha
 * syntax (`rgb(0 0 0 / 50%)`, `oklch(… / .5)`) and anything over 64
 * characters (a `var(--brand, color-mix(…))` fallback chain). Both are
 * accepted; nothing that could leave the declaration is.
 */

import { afterEach, describe, expect, it } from "vitest";
import { sanitiseCssColor } from "../src/library/utils.js";
import { cleanup, flush, render, type Screen } from "../src/testing/index.js";

afterEach(() => cleanup());

const LONG_VAR = "var(--brand-primary, color-mix(in oklch, var(--rui-color-accent) 40%, white))";

describe("sanitiseCssColor accepts", () => {
  it.each([
    "#00ff00",
    "tomato",
    "var(--rui-color-primary)",
    "rgb(0 0 0 / 50%)",
    "rgba(0, 0, 0, 0.5)",
    "hsl(120deg 50% 50% / 0.3)",
    "oklch(0.7 0.15 200 / .5)",
    "color(display-p3 1 0 0 / 0.5)",
    "color-mix(in srgb, red 30%, blue)",
  ])("%s", (value) => {
    expect(sanitiseCssColor(value)).toBe(value);
  });

  it("a nested var()/color-mix() fallback chain longer than 64 characters", () => {
    expect(LONG_VAR.length).toBeGreaterThan(64);
    expect(sanitiseCssColor(LONG_VAR)).toBe(LONG_VAR);
  });
});

describe("sanitiseCssColor still rejects", () => {
  it.each([
    ["a declaration break", "red;position:fixed"],
    ["a declaration break after a slash colour", "rgb(0 0 0 / 50%);position:fixed"],
    ["a rule break", "red}body{color:red"],
    ["an empty comment that hides the rest", "red/**/;color:blue"],
    ["an opening comment", "red /* swallow the next declarations"],
    ["a closing comment", "*/ red"],
    ["a property separator", "red:hover"],
    ["an !important", "red !important"],
    ["a quote", "red\"x"],
    ["a backslash escape", "r\\65 d"],
    ["url()", "url(/x.png)"],
    ["expression()", "expression(alert(1))"],
    ["an angle bracket", "red</style>"],
  ])("%s", (_why, value) => {
    expect(sanitiseCssColor(value)).toBe("");
  });

  it("an unbounded value, even in the colour alphabet", () => {
    expect(sanitiseCssColor(`rgb(${"1 ".repeat(200)})`)).toBe("");
  });
});

describe("Series and Calendar colours use the widened rule", () => {
  const legendSwatch = async (color: string): Promise<string | null> => {
    const screen = render(`$app(LineChart({ labels: ["a", "b"], series: [Series("A", [1, 2], ${JSON.stringify(color)})] }))`);
    await flush();
    return screen.shadowRoot.querySelector<HTMLElement>(".rui-chart-legend-swatch")!.getAttribute("style");
  };

  it("renders a slash-alpha series colour instead of the palette slot", async () => {
    expect(await legendSwatch("rgb(0 0 0 / 50%)")).toBe("background:rgb(0 0 0 / 50%)");
  });

  it("renders a long var() fallback chain", async () => {
    expect(await legendSwatch(LONG_VAR)).toBe(`background:${LONG_VAR}`);
  });

  it("keeps an injection attempt out of the style", async () => {
    const style = await legendSwatch("rgb(0 0 0 / 50%);position:fixed");
    expect(style).not.toContain("position");
    expect(style).not.toContain("rgb(0 0 0");
  });

  it("renders a slash-alpha Calendar chip", async () => {
    const screen: Screen = render(`$app(Calendar(0, { year: 2026, events: [{ date: "2026-01-03", label: "Slash", color: "rgb(1 2 3 / 50%)" }] }))`);
    await flush();
    expect(screen.shadowRoot.querySelector(".rui-gcal-chip")?.getAttribute("style")).toBe("--rui-gcal-chip:rgb(1 2 3 / 50%)");
  });

  it("keeps ScatterChart's hostile colours out of the legend and the points", async () => {
    const screen = render(`$app(ScatterChart({ series: [Series("A", [{ x: 1, y: 2 }], "red;position:fixed")] }))`);
    await flush();
    const html = screen.shadowRoot.innerHTML;
    expect(html).not.toContain("position:fixed");
    expect(screen.shadowRoot.querySelector(".rui-chart-legend-swatch")?.getAttribute("style")).toMatch(/^background:/);
  });
});
