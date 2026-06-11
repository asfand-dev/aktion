/**
 * Canonical t-shirt spacing scale (none|3xs|2xs|xs|sm|md|lg|xl|2xl|3xl):
 *
 *   - every spacing-ish prop (gap / padding / margin / Spacer size) shares
 *     the same enum and `none` resolves to 0;
 *   - the legacy single-letter dialect (`s`/`m`/`l`) keeps working at
 *     runtime and in validation but normalises to the canonical spelling;
 *   - the stylesheet carries rules for every canonical token, including the
 *     new hairline steps (3xs/2xs) and `none`;
 *   - `$theme({ spacing: { md: … } })` lands on the same CSS variable the
 *     legacy `spacing.m` key writes.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";
import { SPACING_TOKENS, normalizeSpacingToken, spacingCssValue } from "../src/library/utils.js";
import { componentStyles } from "../src/theme/styles.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await flush(); };

type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

describe("canonical spacing scale", () => {
  it("orders the scale none → 3xl", () => {
    expect([...SPACING_TOKENS]).toEqual(["none", "3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"]);
  });

  it("normalises legacy aliases to canonical spellings", () => {
    expect(normalizeSpacingToken("s")).toBe("sm");
    expect(normalizeSpacingToken("m")).toBe("md");
    expect(normalizeSpacingToken("l")).toBe("lg");
    expect(normalizeSpacingToken("md")).toBe("md");
    expect(normalizeSpacingToken("none")).toBe("none");
    expect(normalizeSpacingToken("bogus", "md")).toBe("md");
  });

  it("resolves tokens to CSS — none is 0, sm/md/lg keep the legacy var names", () => {
    expect(spacingCssValue("none")).toBe("0");
    expect(spacingCssValue("md")).toBe("var(--rui-spacing-m)");
    expect(spacingCssValue("m")).toBe("var(--rui-spacing-m)");
    expect(spacingCssValue("2xs")).toBe("var(--rui-spacing-2xs)");
    expect(spacingCssValue("3xl")).toBe("var(--rui-spacing-3xl)");
    expect(spacingCssValue("bogus")).toBe("");
  });

  it("every spacing-ish prop enum advertises the full canonical scale", () => {
    const expectFull = (component: string, prop: string) => {
      const spec = defaultLibrary.components.find((c) => c.name === component)!;
      const p = spec.props.find((x) => x.name === prop)!;
      expect([...(p.enum ?? [])], `${component}.${prop}`).toEqual([...SPACING_TOKENS]);
    };
    expectFull("Column", "gap");
    expectFull("Row", "gap");
    expectFull("Stack", "gap");
    expectFull("Grid", "gap");
    expectFull("Grid", "rowGap");
    expectFull("Box", "padding");
    expectFull("Box", "margin");
    expectFull("Center", "padding");
    expectFull("Container", "padding");
    expectFull("Spacer", "size");
    expectFull("Split", "gap");
    expectFull("MasonryGrid", "gap");
  });

  it("Section's band-padding preset uses the canonical names and supports none", () => {
    const section = defaultLibrary.components.find((c) => c.name === "Section")!;
    const padding = section.props.find((p) => p.name === "padding")!;
    expect([...(padding.enum ?? [])]).toEqual(["none", "xs", "sm", "md", "lg", "xl"]);
  });
});

describe("stylesheet coverage", () => {
  it("defines the hairline vars and canonical aliases", () => {
    expect(componentStyles).toContain("--rui-spacing-3xs: 1px;");
    expect(componentStyles).toContain("--rui-spacing-2xs: 2px;");
    expect(componentStyles).toContain("--rui-spacing-md: var(--rui-spacing-m);");
  });

  it("emits rules for every canonical token on stack gap/padding", () => {
    for (const token of SPACING_TOKENS) {
      expect(componentStyles).toContain(`.rui-stack[data-gap="${token}"]`);
      expect(componentStyles).toContain(`.rui-stack[data-padding="${token}"]`);
    }
    expect(componentStyles).toContain(`.rui-stack[data-gap="none"] { gap: 0; }`);
    // Legacy attribute values still match for un-normalised writers.
    expect(componentStyles).toContain(`.rui-stack[data-gap="m"]`);
  });

  it("Section gains none/xs/xl band paddings", () => {
    expect(componentStyles).toContain(`.rui-section[data-pad="none"] { padding: 0; }`);
    expect(componentStyles).toContain(`.rui-section[data-pad="xl"]`);
  });
});

describe("end-to-end token behaviour", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("gap none / new tokens reach the DOM normalised", async () => {
    const el = create();
    el.setResponse(`$app(Column([
  Row([Text("a")], { gap: "none", key: "r1" }),
  Row([Text("b")], { gap: "2xs", key: "r2" }),
  Row([Text("c")], { gap: "l", key: "r3" })
], { gap: "none" }))`);
    await settle();
    const stacks = [...(el.shadowRoot?.querySelectorAll(".rui-stack") ?? [])] as HTMLElement[];
    expect(stacks[0]?.getAttribute("data-gap")).toBe("none");
    const gaps = stacks.slice(1).map((s) => s.getAttribute("data-gap"));
    expect(gaps).toEqual(["none", "2xs", "lg"]);
  });

  it("validation accepts canonical, none, and legacy aliases; rejects unknown tokens with canonical hints", () => {
    const ok = validateProgramSchema(
      parse(`$app(Column([], { gap: "none", padding: "3xs" }))`),
      defaultLibrary,
    );
    expect(ok).toEqual([]);
    const legacy = validateProgramSchema(
      parse(`$app(Column([], { gap: "m" }))`),
      defaultLibrary,
    );
    expect(legacy).toEqual([]);
    const bad = validateProgramSchema(
      parse(`$app(Column([], { gap: "gigantic" }))`),
      defaultLibrary,
    );
    expect(bad.length).toBe(1);
    expect(bad[0]!.message).toContain('"none", "3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"');
  });

  it("$theme spacing accepts canonical keys (md → --rui-spacing-m)", async () => {
    const el = create();
    el.setResponse(`$theme({ spacing: { md: "30px", l: "44px" } })
$app(Column([Text("themed")]))`);
    await settle();
    expect(el.style.getPropertyValue("--rui-spacing-m")).toBe("30px");
    expect(el.style.getPropertyValue("--rui-spacing-l")).toBe("44px");
  });
});
