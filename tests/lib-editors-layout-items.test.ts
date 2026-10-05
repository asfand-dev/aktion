/**
 * Item lists and shorthand values in the layout, content, editor and extras
 * components, where the renderer disagreed with what its spec documents.
 *
 *   - Steps treated a user-component node as a data object (an EMPTY pending
 *     step) and rendered `null` items as empty steps; Tabs turned a `null` item
 *     into a phantom "Tab N" trigger (and skipping it must not renumber the
 *     instance paths of the tabs after it).
 *   - Grid only switched to span mode for library `GridItem` nodes, not for a
 *     user component that returns one.
 *   - BadgeList indexed `tones` / `icons` against the label list AFTER empty
 *     labels were filtered out, shifting every later tone and icon.
 *   - Image and AspectRatio parsed `ratio` with two parsers that disagreed, and
 *     an unparseable Image ratio still clipped the figure.
 *   - ContextMenu rendered any non-menu component node as an empty enabled row
 *     and dropped MenuItem's `checked` / `role` / `keepOpen`.
 *   - ColorPicker rendered named-colour swatches that did nothing when clicked.
 *   - ScrollSpy rewrote legal ids ("intro.part") into ones that match nothing.
 *   - Svg rejected the comma-separated viewBox syntax SVG allows.
 *   - MultiStepForm honoured `stepsLayout: "horizontal"` but the validator
 *     rejected it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, type Screen } from "../src/testing/index.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";

afterEach(() => {
  cleanup();
});

async function mount(program: string): Promise<Screen> {
  const screen = render(program);
  await screen.flush();
  return screen;
}

const all = <T extends Element>(screen: Screen, selector: string): T[] =>
  Array.from(screen.shadowRoot.querySelectorAll<T>(selector));

const text = (node: Element | null | undefined): string => (node?.textContent ?? "").trim();

describe("Steps", () => {
  it("renders a user-component item as a node, not as an empty data step", async () => {
    const screen = await mount(`
function Custom(props) { return Text("custom " + props.n) }
$app(Steps([Custom({ n: 1 }), { title: "B" }]))`);
    const items = all<HTMLElement>(screen, ".rui-steps-item");
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute("data-bare")).toBe("true");
    expect(text(items[0])).toBe("custom 1");
    expect(text(items[1]!.querySelector(".rui-steps-title"))).toBe("B");
  });

  it("skips null, undefined and false items (conditional steps)", async () => {
    const screen = await mount(`$app(Steps([{ title: "A" }, null, undefined, false, { title: "B", complete: true }]))`);
    const items = all<HTMLElement>(screen, ".rui-steps-item");
    expect(items.map((li) => text(li.querySelector(".rui-steps-title")))).toEqual(["A", "B"]);
    expect(items[1]!.getAttribute("data-status")).toBe("complete");
  });
});

describe("Tabs", () => {
  it("skips a null item instead of rendering a phantom trigger", async () => {
    const screen = await mount(`$app(Tabs([TabItem("a", "A", [Text("x")]), null, undefined]))`);
    expect(all(screen, ".rui-tab-trigger").map(text)).toEqual(["A"]);
    expect(all(screen, ".rui-tab-content")).toHaveLength(1);
  });

  it("keeps the instance state of later tabs when a conditional tab ahead of them appears", async () => {
    const screen = await mount(`
let $admin = false
$app(Tabs([
  $admin ? TabItem("adm", "Admin", [Text("admin")]) : null,
  TabItem("a", "Alpha", [Tabs([TabItem("one", "One", [Text("1")]), TabItem("two", "Two", [Text("2")])])]),
], "a"))`);
    const inner = (): HTMLElement[] =>
      all<HTMLElement>(screen, ".rui-tab-panels .rui-tab-trigger");
    const selected = (): Record<string, string | null> =>
      Object.fromEntries(inner().map((b) => [text(b), b.getAttribute("aria-selected")]));
    inner().find((b) => text(b) === "Two")!.click();
    await screen.flush();
    expect(selected()).toEqual({ One: "false", Two: "true" });

    await screen.state.set("admin", true);
    const outer = screen.shadowRoot.querySelector(".rui-tabs > .rui-tab-list");
    expect(Array.from(outer!.querySelectorAll(".rui-tab-trigger")).map(text)).toEqual(["Admin", "Alpha"]);
    expect(selected()).toEqual({ One: "false", Two: "true" });
  });
});

describe("Grid span mode", () => {
  it("is enabled by a user component that returns a GridItem", async () => {
    const screen = await mount(`
function Cell(props) { return GridItem(Text(props.label), { span: 6 }) }
$app(Grid([Cell({ label: "a" }), Cell({ label: "b" })]))`);
    const grid = screen.shadowRoot.querySelector(".rui-grid");
    expect(grid?.getAttribute("data-grid-mode")).toBe("12");
  });

  it("stays in auto-fit mode for plain children", async () => {
    const screen = await mount(`
function Cell(props) { return Text(props.label) }
$app(Grid([Cell({ label: "a" }), Text("b")]))`);
    expect(screen.shadowRoot.querySelector(".rui-grid")?.getAttribute("data-grid-mode")).toBeNull();
  });
});

describe("BadgeList", () => {
  it("keeps tones and icons aligned with the original labels when a label is empty", async () => {
    const screen = await mount(`$app(BadgeList(["a", "", null, "d"], {
  tones: ["success", "danger", "info", "warning"],
  icons: [null, "star", "bell", "house"],
}))`);
    const pills = all<HTMLElement>(screen, ".rui-badge");
    expect(pills.map((p) => text(p.querySelector(".rui-badge-label")))).toEqual(["a", "d"]);
    expect(pills.map((p) => p.getAttribute("data-variant"))).toEqual(["success", "warning"]);
    expect(pills[0]!.querySelector(".rui-badge-icon")).toBeNull();
    expect(pills[1]!.querySelector(".rui-badge-icon")?.className).toContain("fa-house");
  });

  it("names the hidden labels in the overflow pill", async () => {
    const screen = await mount(`$app(BadgeList(["a", "", "c", "d"], { max: 1 }))`);
    const overflow = screen.shadowRoot.querySelector("[data-overflow='true']");
    expect(text(overflow)).toBe("+2");
    expect(overflow?.getAttribute("title")).toBe("c, d");
  });
});

describe("Image and AspectRatio share one ratio parser", () => {
  const imageStyle = async (ratio: string): Promise<HTMLElement> => {
    const screen = await mount(`$app(Image("https://example.com/a.png", { ratio: ${JSON.stringify(ratio)} }))`);
    return screen.shadowRoot.querySelector<HTMLElement>(".rui-image")!;
  };
  const boxStyle = async (ratio: string): Promise<string> => {
    const screen = await mount(`$app(AspectRatio(${JSON.stringify(ratio)}, [Text("x")]))`);
    return screen.shadowRoot.querySelector<HTMLElement>(".rui-aspect-ratio")!.style.aspectRatio;
  };

  it.each([
    ["16:9", "16 / 9"],
    ["4/3", "4 / 3"],
    ["1.5", "1.5 / 1"],
  ])("%s gives the same aspect-ratio to both", async (ratio, expected) => {
    const figure = await imageStyle(ratio);
    expect(figure.style.aspectRatio).toBe(expected);
    expect(figure.getAttribute("data-ratio")).toBe("true");
    expect(await boxStyle(ratio)).toBe(expected);
  });

  it.each(["0:1", "-4:3", "wide", "4:"])("an unusable Image ratio %s reserves and clips nothing", async (ratio) => {
    const figure = await imageStyle(ratio);
    expect(figure.style.aspectRatio).toBe("");
    expect(figure.style.overflow).toBe("");
    expect(figure.getAttribute("data-ratio")).toBeNull();
  });

  it("an unusable AspectRatio ratio still falls back to 16 / 9", async () => {
    expect(await boxStyle("wide")).toBe("16 / 9");
  });
});

describe("ContextMenu items", () => {
  const program = `
let $wrap = false
let $deleted = false
let $events = []
$app(ContextMenu(Text("target"), [
  MenuItem("Wrap lines", { onClick: () => { $wrap = !$wrap }, checked: $wrap, keepOpen: true }),
  MenuItem("Ascending", { role: "menuitemradio", checked: true }),
  { label: "Delete", tone: "danger", onClick: () => { $deleted = true } },
  Button("Not a menu row"),
  "plain string",
  { label: "" },
  MenuSeparator(),
], { onOpenChange: (open) => { $events = [...$events, open] } }))`;

  it("renders only menu rows, with MenuItem's checked and role and the object form's tone", async () => {
    const screen = await mount(program);
    const rows = all<HTMLElement>(screen, ".rui-context-menu-pop .rui-menu-item");
    expect(rows.map((r) => text(r.querySelector(".rui-menu-item-label")))).toEqual(["Wrap lines", "Ascending", "Delete"]);
    expect(rows.map((r) => r.getAttribute("role"))).toEqual(["menuitemcheckbox", "menuitemradio", "menuitem"]);
    expect(rows.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", null]);
    expect(rows[2]!.getAttribute("data-variant")).toBe("danger");
    expect(all(screen, ".rui-context-menu-pop .rui-menu-separator")).toHaveLength(1);
  });

  it("runs an object item's onClick", async () => {
    const screen = await mount(program);
    all<HTMLElement>(screen, ".rui-context-menu-pop .rui-menu-item")[2]!.click();
    await screen.flush();
    expect(screen.state.get("deleted")).toBe(true);
    expect(screen.state.get("events")).toEqual([false]);
  });

  it("leaves the menu open after a keepOpen row and reflects the new checked state", async () => {
    const screen = await mount(program);
    all<HTMLElement>(screen, ".rui-context-menu-pop .rui-menu-item")[0]!.click();
    await screen.flush();
    expect(screen.state.get("wrap")).toBe(true);
    expect(screen.state.get("events")).toEqual([]);
    expect(all<HTMLElement>(screen, ".rui-context-menu-pop .rui-menu-item")[0]!.getAttribute("aria-checked")).toBe("true");
  });
});

describe("ColorPicker swatches", () => {
  it("renders only swatches the picker can select", async () => {
    const screen = await mount(`
let $picked = "none"
$app(ColorPicker("c", { swatches: ["tomato", "#ff0000", "rgb(0, 0, 255)", "var(--brand)"], onChange: (v) => { $picked = v } }))`);
    const swatches = all<HTMLElement>(screen, ".rui-color-picker-swatch");
    expect(swatches.map((s) => s.getAttribute("data-color"))).toEqual(["#ff0000", "#0000ff"]);
    swatches[1]!.click();
    await screen.flush();
    expect(screen.state.get("picked")).toBe("#0000ff");
  });
});

describe("ScrollSpy section ids", () => {
  it("keeps an id verbatim so it can match the element that carries it", async () => {
    const screen = await mount(`$app(ScrollSpy([{ label: "Intro", id: "intro.part" }, { label: "Usage", id: "usage" }]))`);
    expect(all(screen, ".rui-scrollspy-item a").map((a) => a.getAttribute("href"))).toEqual(["#intro.part", "#usage"]);
  });

  it("does not let two different ids collapse onto one", async () => {
    const screen = await mount(`$app(ScrollSpy([{ label: "A", id: "a.b" }, { label: "B", id: "ab" }]))`);
    expect(all(screen, ".rui-scrollspy-item a").map((a) => a.getAttribute("href"))).toEqual(["#a.b", "#ab"]);
  });
});

describe("Svg viewBox", () => {
  const viewBox = async (call: string): Promise<string | null> => {
    const screen = await mount(`$app(${call})`);
    return screen.shadowRoot.querySelector("svg.rui-svg")?.getAttribute("viewBox") ?? null;
  };

  it("accepts the comma-separated form", async () => {
    expect(await viewBox(`Svg("<path d='M0 0h48v48H0z'/>", { viewBox: "0,0,48,48" })`)).toBe("0 0 48 48");
  });

  it("accepts it on a pasted <svg> root", async () => {
    expect(await viewBox(`Svg('<svg viewBox="0, 0, 48, 48"><path d="M0 0h48v48H0z"/></svg>')`)).toBe("0 0 48 48");
  });

  it.each(["0 0 24", "0 0 -24 24", "0 0 abc 24", "1e3 0 24 24 5"])("falls back to 0 0 24 24 for %s", async (vb) => {
    expect(await viewBox(`Svg("<path d='M0 0'/>", { viewBox: ${JSON.stringify(vb)} })`)).toBe("0 0 24 24");
  });

  it("still accepts negative origins and decimals", async () => {
    expect(await viewBox(`Svg("<path d='M0 0'/>", { viewBox: "-12 -12.5 24 25" })`)).toBe("-12 -12.5 24 25");
  });
});

describe("MultiStepForm stepsLayout synonyms", () => {
  const steps = `[{ title: "A", content: Text("a") }, { title: "B", content: Text("b") }]`;

  it.each([["horizontal", "row"], ["vertical", "column"], ["row", "row"]])("%s validates and renders as %s", async (token, layout) => {
    const source = `$app(MultiStepForm(${steps}, 0, { stepsLayout: "${token}" }))`;
    expect(validateProgramSchema(parse(source), defaultLibrary).map((e) => e.message)).toEqual([]);
    const screen = await mount(source);
    expect(screen.shadowRoot.querySelector(".rui-multi-step-form")?.getAttribute("data-layout")).toBe(layout);
  });
});
