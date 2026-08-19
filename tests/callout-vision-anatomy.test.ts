/**
 * Callout on the `vision` theme, where the icon is lifted OUT of flow.
 *
 * That theme drops the filled medallion and draws the icon as a bare semantic
 * glyph absolutely positioned onto the title's first line, with the title
 * indented past it. Four things went wrong with that arrangement, and every one
 * of them is pinned here:
 *
 *   1. `compact` overrode only the section's padding (28px/30px -> 10px/14px),
 *      leaving the icon pinned at the regular offsets — below and to the right
 *      of the denser box's title, overlapping the headline and spilling past the
 *      bottom border.
 *   2. `hideIcon` still left the title indented past an icon that was not there.
 *   3. The bare glyph kept `--rui-color-on-*`, the knock-out ink meant for the
 *      medallion it no longer sits on — so `danger`, `error` and `neutral` drew
 *      #ffffff on a white card and were invisible.
 *   4. `error` was missing from the theme's title-colour set even though the
 *      tone bar already covered it, so it alone kept the default navy headline.
 *
 * The geometry is asserted against the stylesheet text rather than
 * `getComputedStyle`: jsdom does not cascade `:host(...)` rules from an adopted
 * stylesheet, so a layout assertion there would pass no matter what the CSS
 * said. The DOM contract (`data-has-icon`) is asserted against the render.
 */

import { afterEach, describe, expect, it } from "vitest";
import { componentStyles } from "../src/theme/styles.js";
import { cleanup, flush, render } from "../src/testing/index.js";

afterEach(() => cleanup());

/** Mount one Callout expression on the vision theme and hand back its shadow root. */
async function callout(expression: string): Promise<ShadowRoot> {
  const screen = render(`$app(${expression})`, { theme: "vision" });
  for (let i = 0; i < 5; i += 1) await flush();
  return screen.shadowRoot;
}

const VISION = ':host([data-rui-theme="vision"])';

/**
 * The vision Callout block, from its root rule up to the next component.
 *
 * The end marker is searched FROM the block's start: this theme also styles
 * tooltips earlier in the sheet, and a plain `indexOf` for the end lands before
 * the beginning and slices an empty string — which would make every assertion
 * below silently vacuous.
 */
const visionCalloutStart = componentStyles.indexOf(`${VISION} .rui-callout {`);
const visionCallout = componentStyles.slice(
  visionCalloutStart,
  componentStyles.indexOf(`${VISION} .rui-tooltip-content`, visionCalloutStart),
);

/** Body of the first rule whose selector list contains `selector`. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
}

describe("the vision Callout stylesheet block", () => {
  it("is non-empty — otherwise every CSS assertion below is vacuous", () => {
    expect(visionCalloutStart).toBeGreaterThan(-1);
    expect(visionCallout.length).toBeGreaterThan(500);
    expect(visionCallout).toContain(".rui-callout-title");
  });
});

describe("Callout marks whether an icon was actually rendered", () => {
  it("reports data-has-icon=true for the default (tone-derived) icon", async () => {
    const root = await callout(`Callout("T", { tone: "info" })`);
    expect(root.querySelector(".rui-callout")?.getAttribute("data-has-icon")).toBe("true");
    expect(root.querySelector(".rui-callout-icon")).toBeTruthy();
  });

  it("reports data-has-icon=false for hideIcon", async () => {
    const root = await callout(`Callout("T", { tone: "info", hideIcon: true })`);
    expect(root.querySelector(".rui-callout")?.getAttribute("data-has-icon")).toBe("false");
    expect(root.querySelector(".rui-callout-icon")).toBeNull();
  });

  it("reports data-has-icon=false for icon: false", async () => {
    // `icon: false` is the other way to suppress it; it must not be stringified
    // into an `fa-false` glyph that occupies the slot invisibly.
    const root = await callout(`Callout("T", { tone: "info", icon: false })`);
    expect(root.querySelector(".rui-callout")?.getAttribute("data-has-icon")).toBe("false");
    expect(root.querySelector(".rui-callout-icon")).toBeNull();
  });

  it("still marks it true in compact mode", async () => {
    const root = await callout(`Callout("T", { tone: "warning", compact: true })`);
    const el = root.querySelector(".rui-callout");
    expect(el?.getAttribute("data-compact")).toBe("true");
    expect(el?.getAttribute("data-has-icon")).toBe("true");
  });
});

describe("vision Callout geometry is token-driven, so compact moves everything at once", () => {
  it("drives padding, icon offset and title indent from the same custom properties", () => {
    // The three are one geometry: the icon is positioned INTO the section's
    // padding box, so hard-coding any of them independently is what let compact
    // drift apart from the icon in the first place.
    const section = ruleBody(visionCallout, `${VISION} .rui-callout-section {`);
    expect(section).toContain("padding: var(--rui-callout-pad-block) var(--rui-callout-pad-inline);");

    const icon = ruleBody(visionCallout, `${VISION} .rui-callout-icon {`);
    expect(icon).toContain("left: var(--rui-callout-pad-inline);");
    expect(icon).toContain("top: var(--rui-callout-pad-block);");
    expect(icon).toContain("width: var(--rui-callout-icon-size);");

    const title = ruleBody(visionCallout, `${VISION} .rui-callout-title {`);
    expect(title).toContain(
      "padding-left: calc(var(--rui-callout-icon-size) + var(--rui-callout-icon-gap));",
    );
  });

  it("redefines the geometry tokens for compact rather than only the padding", () => {
    const compact = ruleBody(visionCallout, `${VISION} .rui-callout[data-compact="true"] {`);
    for (const token of [
      "--rui-callout-pad-block",
      "--rui-callout-pad-inline",
      "--rui-callout-icon-size",
      "--rui-callout-icon-gap",
    ]) {
      expect(compact, `compact must re-point ${token}`).toContain(`${token}:`);
    }
    // The regression itself: a compact rule that sets padding directly is exactly
    // the shape that left the icon behind.
    expect(visionCallout).not.toContain(
      `${VISION} .rui-callout[data-compact="true"] .rui-callout-section { padding: 10px 14px; }`,
    );
  });

  it("keeps the non-compact metrics at the values UI Block specifies", () => {
    // 30px + 24px icon + 11px gap = the 35px indent the design calls for; the
    // fix must not have moved the regular rendering while fixing compact.
    const root = ruleBody(visionCallout, `${VISION} .rui-callout {`);
    expect(root).toContain("--rui-callout-pad-block: 28px;");
    expect(root).toContain("--rui-callout-pad-inline: 30px;");
    expect(root).toContain("--rui-callout-icon-size: 24px;");
    expect(root).toContain("--rui-callout-icon-gap: 11px;");
  });

  it("sizes the icon box to the title's line so the glyph centres on the headline", () => {
    // Height tracks the LINE, not the glyph: that is what makes one `top` value
    // correct for both densities instead of needing a hand-tuned offset each.
    const icon = ruleBody(visionCallout, `${VISION} .rui-callout-icon {`);
    expect(icon).toContain("height: var(--rui-callout-line);");
    expect(icon).toContain("align-items: center;");
  });

  it("drops the title indent when there is no icon to clear", () => {
    expect(visionCallout).toContain(
      `${VISION} .rui-callout[data-has-icon="false"] .rui-callout-title`,
    );
    const noIcon = ruleBody(
      visionCallout,
      `${VISION} .rui-callout[data-has-icon="false"] .rui-callout-title {`,
    );
    expect(noIcon).toContain("padding-left: 0;");
  });
});

describe("vision Callout icon colour survives losing its medallion", () => {
  it("never leaves the bare glyph on a knock-out ink token", () => {
    // `--rui-color-on-danger` is #ffffff — correct ON the filled disc, invisible
    // once the disc is gone. No vision icon rule may reach for that family.
    const iconRules = visionCallout
      .split("\n")
      .filter((line) => line.includes(".rui-callout-icon") && line.includes("color:"));
    expect(iconRules.length).toBeGreaterThan(0);
    for (const line of iconRules) {
      expect(line, `knock-out ink on a disc-less icon: ${line}`).not.toMatch(
        /color:\s*var\(--rui-color-(on-\w+|primary-text)\)/,
      );
    }
  });

  it("gives every tone the same semantic colour as its title", () => {
    for (const [tone, token] of [
      ["info", "--rui-color-info-text"],
      ["success", "--rui-color-success-text"],
      ["warning", "--rui-color-warning-text"],
      ["danger", "--rui-color-danger-text"],
      ["error", "--rui-color-danger-text"],
    ] as const) {
      const body = ruleBody(
        visionCallout,
        `${VISION} .rui-callout[data-variant="${tone}"] .rui-callout-icon`,
      );
      expect(body, `${tone} icon colour`).toContain(`color: var(${token})`);
    }
  });

  it("colours the error headline like danger, not like the default", () => {
    // The tone bar already treated error as danger; the title did not, so an
    // `error` Callout drew a red bar over a navy headline.
    const titleColours = componentStyles.slice(
      componentStyles.indexOf(`${VISION} .rui-callout[data-variant="success"] .rui-callout-title`),
    );
    const rule = titleColours.slice(0, titleColours.indexOf("}") + 1);
    expect(titleColours).toContain(`${VISION} .rui-callout[data-variant="error"] .rui-callout-title`);
    expect(rule.length).toBeGreaterThan(0);
  });
});
