/**
 * Breadcrumb reported a node crumb from its `li` as the click bubbled, i.e.
 * after the BreadcrumbItem link had already navigated; record and string
 * crumbs report before navigating. A handler that reads or redirects the route
 * saw a different order depending on the crumb's form.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, type Screen } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  try { window.location.hash = ""; } catch { /* ignore */ }
});

async function mount(source: string, options: Parameters<typeof render>[1] = {}): Promise<Screen> {
  const screen = render(source, options);
  await screen.flush();
  return screen;
}

describe("Breadcrumb reports onItemClick before it navigates, for every crumb form", () => {
  const program = (items: string): string => `$app(Breadcrumb(${items}, { onItemClick: (i, label) => $emit("crumb", label) }))`;
  const order = (screen: Screen): string[] =>
    screen.events.filter((e) => e.type === "crumb" || e.type === "route-change").map((e) => e.type);

  const clickCrumb = async (screen: Screen, label: string): Promise<void> => {
    const link = [...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-breadcrumb-link")].find((a) => a.textContent?.includes(label))!;
    await screen.click(link);
  };

  it("a record crumb", async () => {
    const screen = await mount(program(`[{ label: "Docs", to: "/docs" }, { label: "Here" }]`), { captureEvents: ["crumb"] });
    await clickCrumb(screen, "Docs");
    expect(screen.route).toBe("/docs");
    expect(order(screen)).toEqual(["crumb", "route-change"]);
  });

  it("a BreadcrumbItem node crumb", async () => {
    const screen = await mount(program(`[BreadcrumbItem("Docs", { to: "/docs" }), BreadcrumbItem("Here")]`), { captureEvents: ["crumb"] });
    await clickCrumb(screen, "Docs");
    expect(screen.route).toBe("/docs");
    expect(order(screen)).toEqual(["crumb", "route-change"]);
  });

  it("a node crumb with its own onClick runs onItemClick first, then the crumb's own handler", async () => {
    const screen = await mount(`$log = ""
$app(Breadcrumb([BreadcrumbItem("Docs", { to: "/docs", onClick: () => { $log = $log + "own;" } }), BreadcrumbItem("Here")], {
  onItemClick: (i, label) => { $log = $log + "item:" + label + ";" }
}))`);
    await clickCrumb(screen, "Docs");
    expect(screen.state.get("log")).toBe("item:Docs;own;");
    expect(screen.route).toBe("/docs");
  });
});
