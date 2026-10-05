/**
 * Table, DataGrid, Col and ComparisonTable: each case is a behaviour the spec
 * documented and the renderer did not deliver.
 *
 *   - two `Col`s with the same header shared one column key, so DataGrid drew
 *     the second column's data in both and the header-keyed `row` kept one;
 *   - `Col(locale:)` only reached Table — DataGrid formatted in the browser's;
 *   - `Col(minWidth:/maxWidth:)` were read as px only, so a number, `5rem` or
 *     `50%` fell back to the 50px / 2000px defaults;
 *   - `ComparisonTable(ariaLabel:)` was an alias of `caption`, so it rendered a
 *     visible `<caption>` and never set `aria-label`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";

afterEach(() => cleanup());

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

const bodyCells = (root: ShadowRoot, row = 0): string[] =>
  [...root.querySelectorAll(`.rui-data-grid-table > tbody > tr:nth-child(${row + 1}) > td`)].map((td) => td.textContent ?? "");

describe("columns with the same header", () => {
  it("DataGrid renders each column's own values", async () => {
    const screen = render(`$app(DataGrid([Col("Price", [1, 2]), Col("Price", [100, 200])]))`);
    await settle();
    expect(bodyCells(screen.shadowRoot)).toEqual(["1", "100"]);
    expect(bodyCells(screen.shadowRoot, 1)).toEqual(["2", "200"]);
  });

  it("DataGrid hands onRowClick a row with both values, the repeat keyed col-<index>", async () => {
    const screen = render(`$picked = ""
$app(DataGrid([Col("Price", [1, 2]), Col("Price", [100, 200])], {
  onRowClick: (i, row) => { $picked = row.Price + "/" + row["col-1"] }
}))`);
    await settle();
    (screen.shadowRoot.querySelector(".rui-data-grid-table > tbody > tr") as HTMLElement).click();
    await settle();
    expect(screen.state.get("picked")).toBe("1/100");
  });

  it("DataGrid sorts the repeated column by its own key", async () => {
    const screen = render(`$app(DataGrid([
  Col("Price", [1, 2], "number", "left", true),
  Col("Price", [100, 200], "number", "left", true)
], { sort: { key: "col-1", direction: "desc" } }))`);
    await settle();
    expect(bodyCells(screen.shadowRoot)).toEqual(["2", "200"]);
    const keys = [...screen.shadowRoot.querySelectorAll(".rui-data-grid-table thead th[data-col-key]")]
      .map((th) => th.getAttribute("data-col-key"));
    expect(keys).toEqual(["Price", "col-1"]);
  });

  it("Table's header-keyed row keeps both values", async () => {
    const screen = render(`$app(Table([
  Col("Price", [1]),
  Col("Price", [100], { render: (v, i, row) => Text(row.Price + "/" + row["col-1"]) })
]))`);
    await settle();
    const cells = [...screen.shadowRoot.querySelectorAll(".rui-table tbody td")].map((td) => td.textContent);
    expect(cells).toEqual(["1", "1/100"]);
  });

  it("DataGrid draws each column once from a layout saved under the old shared key", async () => {
    // Before `col-<index>` keys, both columns were keyed "Price", and the grid
    // persisted that on every resize, reorder, hide or pin.
    localStorage.setItem("aktion-datagrid-dup-headers", JSON.stringify({
      v: 1, order: ["Price", "Price"], hidden: [], pinned: [], widths: {},
    }));
    try {
      const screen = render(`$app(DataGrid([Col("Price", [1, 2]), Col("Price", [100, 200])], { persistKey: "dup-headers" }))`);
      await settle();
      const keys = [...screen.shadowRoot.querySelectorAll(".rui-data-grid-table thead th[data-col-key]")]
        .map((th) => th.getAttribute("data-col-key"));
      expect(keys).toEqual(["Price", "col-1"]);
      expect(bodyCells(screen.shadowRoot)).toEqual(["1", "100"]);
    } finally {
      localStorage.removeItem("aktion-datagrid-dup-headers");
    }
  });

  it("a header that reads like a generated key does not collide with one", async () => {
    const screen = render(`$app(DataGrid([Col("col-1", ["a"]), Col("", ["b"]), Col("col-1", ["c"])]))`);
    await settle();
    expect(bodyCells(screen.shadowRoot)).toEqual(["a", "b", "c"]);
  });
});

describe("Col(locale:) in a DataGrid", () => {
  it("formats the column in the column's locale", async () => {
    const screen = render(`$app(DataGrid([
  Col("Amount", [1234.5], { format: "number", locale: "de-DE" }),
  Col("Total", [1234.5], { format: "currency", currency: "EUR", locale: "de-DE" })
]))`);
    await settle();
    const [amount, total] = bodyCells(screen.shadowRoot);
    expect(amount).toBe((1234.5).toLocaleString("de-DE"));
    expect(total).toBe((1234.5).toLocaleString("de-DE", { style: "currency", currency: "EUR" }));
    expect(amount).toBe("1.234,5");
  });
});

describe("Col(minWidth:) as a resize bound", () => {
  const resizeTo = async (minWidth: string): Promise<string> => {
    const screen = render(`$app(DataGrid([
  Col("A", ["x"], { minWidth: ${minWidth} }),
  Col("B", ["y"])
], { resizable: true }))`);
    await settle();
    const handle = screen.shadowRoot.querySelector('.rui-data-grid-resize-handle[data-resize-col="A"]') as HTMLElement;
    // happy-dom has no layout: the column measures 0px wide, so shrinking it
    // lands exactly on the lower bound.
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await settle();
    return (screen.shadowRoot.querySelector('col[data-col-key="A"]') as HTMLElement).style.width;
  };

  it("reads a number as px", async () => {
    expect(await resizeTo("120")).toBe("120px");
  });

  it("still reads a px length", async () => {
    expect(await resizeTo('"120px"')).toBe("120px");
  });

  it("measures any other length against the grid's viewport", async () => {
    // Stand in for layout: the probe is the only element styled `width: 5rem`.
    const proto = HTMLElement.prototype;
    const original = proto.getBoundingClientRect;
    const parents: string[] = [];
    proto.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      if (this.style.width === "5rem") {
        parents.push(this.parentElement?.className ?? "");
        return { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 80, width: 80, height: 0, toJSON: () => ({}) } as DOMRect;
      }
      return original.call(this);
    };
    try {
      expect(await resizeTo('"5rem"')).toBe("80px");
    } finally {
      proto.getBoundingClientRect = original;
    }
    expect(parents).toEqual(["rui-data-grid-viewport"]);
  });

  it("falls back to 50px for a length that does not parse", async () => {
    expect(await resizeTo('"wide"')).toBe("50px");
  });
});

describe("Col(pinned:)", () => {
  const errorsFor = (pinned: string): string[] =>
    validateProgramSchema(parse(`$app(DataGrid([Col("A", [1], { pinned: "${pinned}" })]))`), defaultLibrary).map((e) => e.message);

  it("offers only the edge DataGrid pins to, plus an explicit none", () => {
    expect(errorsFor("left")).toEqual([]);
    expect(errorsFor("none")).toEqual([]);
    // "right" used to validate and then render unpinned.
    expect(errorsFor("right").join("\n")).toMatch(/pinned="right"/);
  });

  it("pins on \"left\" and leaves a \"none\" column unpinned", async () => {
    const screen = render(`$app(DataGrid([Col("A", ["a"], { pinned: "none" }), Col("B", ["b"], { pinned: "left" })]))`);
    await settle();
    const pinned = [...screen.shadowRoot.querySelectorAll(".rui-data-grid-table thead th[data-col-key]")]
      .map((th) => `${th.getAttribute("data-col-key")}:${th.getAttribute("data-pinned") ?? "-"}`);
    expect(pinned).toEqual(["B:true", "A:-"]);
  });
});

describe("ComparisonTable(ariaLabel:)", () => {
  const ROWS = `[{ label: "SSO", values: [true, false] }]`;

  it("names the table without a visible caption", async () => {
    const screen = render(`$app(ComparisonTable(["Free", "Pro"], ${ROWS}, { ariaLabel: "Plans" }))`);
    await settle();
    const table = screen.shadowRoot.querySelector(".rui-comparison-table table") as HTMLElement;
    expect(table.getAttribute("aria-label")).toBe("Plans");
    expect(table.querySelector("caption")).toBeNull();
  });

  it("yields to a caption, which already names the table", async () => {
    const screen = render(`$app(ComparisonTable(["Free", "Pro"], ${ROWS}, { caption: "Compare plans", ariaLabel: "Plans" }))`);
    await settle();
    const table = screen.shadowRoot.querySelector(".rui-comparison-table table") as HTMLElement;
    expect(table.getAttribute("aria-label")).toBeNull();
    expect(table.querySelector("caption")?.textContent).toBe("Compare plans");
  });
});
