/**
 * Library fixes in the feedback / menu / navigation / marketing / media
 * components: each case renders through the real runtime (renderer, morph,
 * user components) and pins what the component's spec documents.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, type Screen } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  try { window.location.hash = ""; } catch { /* ignore */ }
});

async function mount(source: string, state?: Record<string, unknown>): Promise<Screen> {
  const screen = render(source, state ? { state } : {});
  await screen.flush();
  return screen;
}

const $ = (screen: Screen, selector: string): HTMLElement | null =>
  screen.shadowRoot.querySelector<HTMLElement>(selector);
const $$ = (screen: Screen, selector: string): HTMLElement[] =>
  [...screen.shadowRoot.querySelectorAll<HTMLElement>(selector)];

describe("ProductCard", () => {
  it("renders a custom `price` node as-is instead of stringifying it", async () => {
    const screen = await mount(`$app(ProductCard("Shoe", { price: Text("$9 special") }))`);
    const foot = $(screen, ".rui-product-foot")!;
    expect(foot.textContent).toContain("$9 special");
    expect(foot.textContent).not.toContain("[object Object]");
    expect(foot.querySelector(".rui-pricetag")).toBeNull();
  });

  it("still formats a plain price through PriceTag", async () => {
    const screen = await mount(`$app(ProductCard("Shoe", { price: 1299, compareAt: 1500 }))`);
    expect($(screen, ".rui-product-foot .rui-pricetag-now")?.textContent).toMatch(/^\$1.?299$/);
  });
});

describe("CodeWindow", () => {
  it("shows a numeric `code` like every other string slot", async () => {
    const screen = await mount(`$app(CodeWindow(12345))`);
    expect($(screen, ".rui-codewindow-code")?.textContent).toContain("12345");
  });
});

describe("OverlayItem", () => {
  const style = async (offset: string): Promise<string | null> => {
    const screen = await mount(`$app(Overlay(Text("b"), [OverlayItem(Text("x"), { offset: ${offset} })]))`);
    const value = $(screen, ".rui-overlay-item")!.getAttribute("style");
    cleanup();
    return value;
  };

  it("insets the item by a numeric `offset` of 0 instead of the 8px default", async () => {
    expect(await style(`0`)).toBe("--ak-ov-off:0");
    expect(await style(`"0"`)).toBe("--ak-ov-off:0");
  });

  it("keeps the 8px default when no `offset` is given", async () => {
    expect(await style(`null`)).toBeNull();
    expect(await style(`""`)).toBeNull();
  });
});

describe("ThemeToggle", () => {
  it("toggles back from a dark theme whose name does not contain 'dark'", async () => {
    const screen = await mount(`$app(ThemeToggle({ dark: "midnight" }))`);
    const btn = () => $(screen, ".rui-theme-toggle")!;
    await screen.click(btn());
    expect(screen.container.getAttribute("theme")).toBe("midnight");
    expect(btn().getAttribute("aria-pressed")).toBe("true");
    await screen.click(btn());
    expect(screen.container.getAttribute("theme")).toBe("light");
    expect(btn().getAttribute("aria-pressed")).toBe("false");
  });

  it("goes dark from a custom light theme whose name contains 'dark'", async () => {
    const screen = await mount(`$app(ThemeToggle({ light: "darkroom-light", dark: "dark" }))`);
    await screen.click($(screen, ".rui-theme-toggle")!);
    expect(screen.container.getAttribute("theme")).toBe("dark");
    await screen.click($(screen, ".rui-theme-toggle")!);
    expect(screen.container.getAttribute("theme")).toBe("darkroom-light");
  });
});

describe("SegmentedControl", () => {
  it("writes a numeric option value back as a number (state and onChange)", async () => {
    const screen = await mount(`$v = 1
$seen = null
function picked(value) { $seen = value }
$app(SegmentedControl([{ value: 1, label: "One" }, { value: 2, label: "Two" }], $v, picked))`);
    const two = $$(screen, ".rui-segmented-control-option").find((b) => b.textContent === "Two")!;
    await screen.click(two);
    expect(screen.state.get("v")).toBe(2);
    expect(screen.state.get("seen")).toBe(2);
    expect(two.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("CopyButton", () => {
  const iconOnly = async (props: string): Promise<boolean> => {
    const screen = await mount(`$app(CopyButton("abc", ${props}))`);
    const icon = $(screen, ".rui-copy-button")!.getAttribute("data-icon-only") === "true";
    cleanup();
    return icon;
  };

  it("does not read a Button style passed as `variant` as icon-only", async () => {
    expect(await iconOnly(`{ variant: "ghost" }`)).toBe(false);
  });

  it("still goes icon-only for `iconOnly: true` and `variant: \"icon\"`", async () => {
    expect(await iconOnly(`{ iconOnly: true }`)).toBe(true);
    expect(await iconOnly(`{ variant: "icon" }`)).toBe(true);
    expect(await iconOnly(`{ iconOnly: false }`)).toBe(false);
  });
});

describe("VideoPlayer", () => {
  const SOURCES = `$errors = 0
function failed() { $errors = $errors + 1 }
$app(VideoPlayer({ sources: [{ src: "/a.mp4", type: "video/mp4" }, { src: "/b.webm", type: "video/webm" }], onError: failed }))`;

  it("reports a failed `sources` list once the last <source> fails", async () => {
    const screen = await mount(SOURCES);
    const [first, last] = $$(screen, "video source");
    // A failing source is reported on that <source>, which does not bubble.
    first!.dispatchEvent(new Event("error"));
    await screen.flush();
    expect(screen.state.get("errors")).toBe(0);
    expect($(screen, ".rui-video-player-empty")).toBeNull();
    last!.dispatchEvent(new Event("error"));
    await screen.flush();
    expect(screen.state.get("errors")).toBe(1);
    expect($(screen, ".rui-video-player-empty")?.textContent).toContain("could not be loaded");
  });

  it("keeps the handler on the last <source> across a re-render", async () => {
    const screen = await mount(`${SOURCES}\n$tick = 0`);
    screen.state.set("tick", 1);
    await screen.flush();
    $$(screen, "video source").at(-1)!.dispatchEvent(new Event("error"));
    await screen.flush();
    expect(screen.state.get("errors")).toBe(1);
  });

  it("still reports a failing `src` through the <video>", async () => {
    const screen = await mount(`$errors = 0
function failed() { $errors = $errors + 1 }
$app(VideoPlayer({ src: "/a.mp4", onError: failed }))`);
    $(screen, "video")!.dispatchEvent(new Event("error"));
    await screen.flush();
    expect(screen.state.get("errors")).toBe(1);
  });
});

describe("Breadcrumb", () => {
  const TRAIL = `$log = ""
function track(index, label) { $log = $log + index + ":" + label + ";" }`;

  it("fires onItemClick for a BreadcrumbItem node crumb", async () => {
    const screen = await mount(`${TRAIL}
$app(Breadcrumb([BreadcrumbItem("Home", { to: "/" }), BreadcrumbItem("Docs", { to: "/docs" }), BreadcrumbItem("Here")], { onItemClick: track }))`);
    const docs = $$(screen, ".rui-breadcrumb-link").find((a) => a.textContent?.includes("Docs"))!;
    await screen.click(docs);
    expect(screen.state.get("log")).toBe("1:Docs;");
    expect(screen.route).toBe("/docs");
  });

  it("leaves a modified click on a node crumb's link to the browser", async () => {
    const screen = await mount(`${TRAIL}
$app(Breadcrumb([BreadcrumbItem("Docs", { to: "/docs" }), BreadcrumbItem("Here")], { onItemClick: track }))`);
    const link = $(screen, ".rui-breadcrumb-link")!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    await screen.flush();
    expect(screen.state.get("log")).toBe("");
  });

  it("fires onItemClick for a handler-only (button) node crumb", async () => {
    const screen = await mount(`${TRAIL}
$app(Breadcrumb([BreadcrumbItem("Step 1", { onClick: () => {} }), BreadcrumbItem("Step 2")], { onItemClick: track }))`);
    await screen.click($(screen, ".rui-breadcrumb-button")!);
    expect(screen.state.get("log")).toBe("0:Step 1;");
  });

  it("renders the program's own crumb component as a crumb, not an empty record", async () => {
    const screen = await mount(`${TRAIL}
function Crumb(p) { return BreadcrumbItem(p.label, { to: p.to }) }
$app(Breadcrumb([Crumb({ label: "Docs", to: "/docs" }), BreadcrumbItem("Here")], { onItemClick: track }))`);
    const link = $(screen, "a.rui-breadcrumb-link")!;
    expect(link.textContent).toContain("Docs");
    expect(link.getAttribute("href")).toBe("#/docs");
    await screen.click(link);
    expect(screen.state.get("log")).toBe("0:Docs;");
  });

  it("does not derive a route from a node crumb's stringified value", async () => {
    const screen = await mount(`$app(Breadcrumb([BreadcrumbItem("Home", { to: "/" }), "Reports", "Q3"]))`);
    const hrefs = $$(screen, "a.rui-breadcrumb-link").map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("object"))).toBe(false);
    expect(hrefs).toEqual(["#/"]);
  });
});

describe("DropdownMenu", () => {
  const menu = (items: string, setup = "") => `$done = ""
function run(tag) { $done = $done + tag + ";" }
${setup}
$app(DropdownMenu(Button("Menu"), ${items}, { open: true }))`;
  const isOpen = (screen: Screen): string | null => $(screen, ".rui-dropdown-menu")!.getAttribute("data-open");
  const item = (screen: Screen, label: string): HTMLElement =>
    $$(screen, ".rui-menu-item").find((b) => b.textContent?.includes(label))!;

  it("honours MenuItem's `tone` and `onclick` aliases on object items", async () => {
    const screen = await mount(menu(`[{ label: "Delete", tone: "danger" }, { label: "Go", onclick: () => run("go") }]`));
    expect(item(screen, "Delete").getAttribute("data-variant")).toBe("danger");
    await screen.click(item(screen, "Go"));
    expect(screen.state.get("done")).toBe("go;");
    expect(isOpen(screen)).toBe("false");
  });

  it("closes after an item rendered by the program's own component", async () => {
    const screen = await mount(menu(`[Act({ label: "Archive" })]`, `function Act(p) { return MenuItem(p.label, () => run("archive")) }`));
    const archive = item(screen, "Archive");
    expect(archive.closest(".rui-menu-custom")).toBeNull();
    await screen.click(archive);
    expect(screen.state.get("done")).toBe("archive;");
    expect(isOpen(screen)).toBe("false");
  });

  it("flattens item arrays nested deeper than four levels", async () => {
    const screen = await mount(menu(`[[[[[[{ label: "Deep", onClick: () => run("deep") }]]]]], MenuItem("Shallow")]`));
    expect($$(screen, ".rui-menu-item").map((b) => b.textContent)).toEqual(["Deep", "Shallow"]);
    await screen.click(item(screen, "Deep"));
    expect(screen.state.get("done")).toBe("deep;");
    expect(isOpen(screen)).toBe("false");
  });

  it("flattens the same item array listed twice, twice", async () => {
    const screen = await mount(menu(`[$pair, $pair]`, `$pair = [{ label: "A" }, { label: "B" }]`));
    expect($$(screen, ".rui-menu-item").map((b) => b.textContent)).toEqual(["A", "B", "A", "B"]);
  });
});
