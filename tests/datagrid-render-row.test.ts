/**
 * DataGrid `Col` render receives the original row, not just a display index
 * (issue #11 from issues-to-fix.md).
 *
 * When DataGrid sorts internally, a cell `render` that looks up sibling data
 * must still resolve the correct row. We pin two guarantees:
 *   1. the `index` passed to `render` is the ORIGINAL row index, and
 *   2. `render` also receives a header-keyed `row` object as its 3rd arg.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";

afterEach(() => cleanup());

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

const ROWS = `rows = [
  { name: "Charlie", age: 30 },
  { name: "Alice", age: 25 },
  { name: "Bob", age: 35 }
]`;

describe("#11 DataGrid render() and sorting", () => {
  it("passes a header-keyed row object so sibling lookups survive sorting", () => {
    const program = [
      ROWS,
      "$app(DataGrid([",
      '  Col("Name", rows.map(r => r.name), "text", "left", true),',
      '  Col("Age", rows.map(r => r.age), "number"),',
      '  Col("Combo", rows.map(r => r.name), "text", "left", false, false, (v, i, row) => Text(`${row.Name}#${row.Age}`))',
      '], { sort: { key: "Name", direction: "asc" } }))',
    ].join("\n");
    const html = renderToStaticMarkup(program);
    // Each combo cell must pair the correct name with ITS OWN age, in sorted
    // order (Alice, Bob, Charlie) — never a mismatched age.
    expect(html).toContain("Alice#25");
    expect(html).toContain("Bob#35");
    expect(html).toContain("Charlie#30");
    expect(html).not.toContain("Alice#30");
    expect(html).not.toContain("Bob#25");
    // Sorted order: Alice before Bob before Charlie.
    expect(html.indexOf("Alice#25")).toBeLessThan(html.indexOf("Bob#35"));
    expect(html.indexOf("Bob#35")).toBeLessThan(html.indexOf("Charlie#30"));
  });

  it("passes the ORIGINAL row index to render (not the display position)", () => {
    // A column whose values are the original indices; after sorting by name the
    // index arg must still map back to the original row's age.
    const program = [
      ROWS,
      "$app(DataGrid([",
      '  Col("Name", rows.map(r => r.name), "text", "left", true),',
      '  Col("Idx", rows.map(r => r.name), "text", "left", false, false, (v, i) => Text(`${v}=${rows[i].age}`))',
      '], { sort: { key: "Name", direction: "asc" } }))',
    ].join("\n");
    const html = renderToStaticMarkup(program);
    expect(html).toContain("Alice=25");
    expect(html).toContain("Bob=35");
    expect(html).toContain("Charlie=30");
  });
});

describe("DataGrid pinned columns on striped rows", () => {
  it("pinned cells have data-pinned on both header and body in striped grids (SSR)", () => {
    const program = [
      ROWS,
      "$app(DataGrid([",
      // slot 14 = pinned: "left"
      '  Col("Name", rows.map(r => r.name), "text", "left", false, false, null, null, "", "", null, "", "", false, "left"),',
      '  Col("Age", rows.map(r => r.age), "number")',
      '], { striped: true }))',
    ].join("\n");
    const html = renderToStaticMarkup(program);
    expect(html).toContain('data-pinned="true"');
    expect(html).toContain('data-striped="true"');
  });
});

describe("DataGrid pinned filter row cells", () => {
  it("filter cells for pinned columns have data-pinned and sticky positioning", async () => {
    const program = [
      ROWS,
      "$app(DataGrid([",
      // slot 4 = sortable, slot 5 = filterable, slot 14 = pinned
      '  Col("Name", rows.map(r => r.name), "text", "left", false, true, null, null, "", "", null, "", "", false, "left"),',
      '  Col("Age", rows.map(r => r.age), "number", "left", false, true)',
      "]))",
    ].join("\n");
    const screen = render(program);
    await settle();
    const filterRow = screen.shadowRoot.querySelector(".rui-data-grid-filter-row");
    expect(filterRow).toBeTruthy();
    const filterCells = [...filterRow!.querySelectorAll("td[data-col-key]")] as HTMLElement[];
    const nameCell = filterCells.find((c) => c.getAttribute("data-col-key") === "Name")!;
    const ageCell = filterCells.find((c) => c.getAttribute("data-col-key") === "Age")!;
    expect(nameCell.getAttribute("data-pinned")).toBe("true");
    expect(nameCell.style.position).toBe("sticky");
    expect(ageCell.getAttribute("data-pinned")).toBeNull();
  });
});

describe("DataGrid column menu is an overlay, not a column", () => {
  it("pins the button to the header without adding a cell to any row", async () => {
    const screen = render([
      ROWS,
      "$app(DataGrid([",
      '  Col("Name", rows.map(r => r.name)),',
      '  Col("Age", rows.map(r => r.age))',
      "], { columnMenu: true }))",
    ].join("\n"));
    await settle();
    const root = screen.shadowRoot;
    // The button lives in the non-scrolling viewport, so it survives a sideways
    // scroll and costs the table no width.
    const menu = root.querySelector(".rui-data-grid-viewport > .rui-data-grid-col-menu");
    expect(menu).toBeTruthy();
    expect(root.querySelector(".rui-data-grid-col-menu-btn")).toBeTruthy();
    expect(root.querySelector(".rui-data-grid")!.getAttribute("data-col-menu")).toBe("true");
    // Two columns in, two cells out — the menu is not one of them.
    expect(root.querySelectorAll(".rui-data-grid-table > thead > tr:first-child > th")).toHaveLength(2);
    const firstRow = root.querySelector(".rui-data-grid-table > tbody > tr")!;
    expect(firstRow.querySelectorAll("td")).toHaveLength(2);
    // And the reserve for the button is charged to the header cell only.
    expect(
      root.querySelector('.rui-data-grid-table > thead th[data-last="true"]'),
    ).toBeTruthy();
  });
});

describe("DataGrid column menu close button", () => {
  it("renders a close button inside the column panel header", async () => {
    const screen = render([
      ROWS,
      "$app(DataGrid([",
      '  Col("Name", rows.map(r => r.name)),',
      '  Col("Age", rows.map(r => r.age))',
      "], { columnMenu: true }))",
    ].join("\n"));
    await settle();
    const menuBtn = screen.shadowRoot.querySelector(".rui-data-grid-col-menu-btn") as HTMLElement;
    expect(menuBtn).toBeTruthy();
    menuBtn.click();
    await settle();
    const closeBtn = screen.shadowRoot.querySelector(".rui-data-grid-col-panel-close") as HTMLElement;
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.getAttribute("aria-label")).toBe("Close column settings");
    expect(closeBtn.textContent).toBe("\u00D7");
  });

  it("clicking the close button hides the panel", async () => {
    const screen = render([
      ROWS,
      "$app(DataGrid([",
      '  Col("Name", rows.map(r => r.name)),',
      '  Col("Age", rows.map(r => r.age))',
      "], { columnMenu: true }))",
    ].join("\n"));
    await settle();
    const menuBtn = screen.shadowRoot.querySelector(".rui-data-grid-col-menu-btn") as HTMLElement;
    menuBtn.click();
    await settle();
    // Open/closed is an attribute, not an inline display: the floating layer
    // promotes the panel with the popover API, which owns `display`.
    const panel = screen.shadowRoot.querySelector(".rui-data-grid-col-panel") as HTMLElement;
    expect(panel.getAttribute("data-open")).toBe("true");
    const closeBtn = screen.shadowRoot.querySelector(".rui-data-grid-col-panel-close") as HTMLElement;
    closeBtn.click();
    await settle();
    expect(panel.getAttribute("data-open")).toBe("false");
    expect(
      screen.shadowRoot.querySelector(".rui-data-grid-col-menu-btn")!.getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
