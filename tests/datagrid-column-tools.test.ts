/**
 * DataGrid's column tooling: the settings menu, drag-resize, and the horizontal
 * scroll hint.
 *
 * Every case here is a bug these features shipped with, pinned so it cannot come
 * back:
 *
 *   - the settings button took a whole column, so every row carried an empty
 *     cell and the last column's content was narrower than its header;
 *   - resize wrote a width onto each `<td>` under auto table layout, where the
 *     content's own min-content width wins — the column did not move and the
 *     text spilled across its neighbour;
 *   - the scroll arrows were appended after paint, so the reconciler deleted
 *     them on the next unrelated re-render and they never came back;
 *   - `repaint` rebuilt the header on EVERY call, which destroyed and recreated
 *     the filter input the user was typing into;
 *   - the stored column order was seeded once, so a column added later was
 *     dropped entirely;
 *   - and hiding / pinning / reordering from the settings panel repainted
 *     nothing wherever the floating layer reparents the panel out of the grid.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => cleanup());

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

const ROWS = `rows = [
  { name: "Charlie", age: 30 },
  { name: "Alice", age: 25 },
  { name: "Bob", age: 35 }
]`;

function grid(options: string, cols?: string): string {
  return [
    ROWS,
    "$app(DataGrid([",
    cols ?? [
      '  Col("Name", rows.map(r => r.name), "text", "left", true),',
      '  Col("Age", rows.map(r => r.age), "number")',
    ].join("\n"),
    `], ${options}))`,
  ].join("\n");
}

describe("DataGrid scroll arrows", () => {
  it("renders both chevrons inside the non-scrolling viewport by default", async () => {
    const screen = render(grid("{}"));
    await settle();
    const viewport = screen.shadowRoot.querySelector(".rui-data-grid-viewport")!;
    const left = screen.shadowRoot.querySelector(".rui-data-grid-scroll-arrow-left")!;
    const right = screen.shadowRoot.querySelector(".rui-data-grid-scroll-arrow-right")!;
    // Children of the viewport, NOT of the scroll port: an absolutely positioned
    // child of a scroller is positioned against its content and scrolls away.
    expect(left.parentElement).toBe(viewport);
    expect(right.parentElement).toBe(viewport);
    expect(screen.shadowRoot.querySelector(".rui-data-grid-scroll")!.parentElement).toBe(viewport);
  });

  it("survives a re-render, because it is part of the rendered tree", async () => {
    const screen = render([
      "$count = 0",
      ROWS,
      "$app(Column([",
      '  Button("bump", { onClick: () => { $count = $count + 1 } }),',
      '  Text("n:" + $count),',
      "  DataGrid([",
      '    Col("Name", rows.map(r => r.name)),',
      '    Col("Age", rows.map(r => r.age))',
      "  ])",
      "]))",
    ].join("\n"));
    await settle();
    expect(screen.shadowRoot.querySelectorAll(".rui-data-grid-scroll-arrow")).toHaveLength(2);
    expect(screen.shadowRoot.querySelectorAll(".rui-data-grid-table > tbody > tr")).toHaveLength(3);
    (screen.shadowRoot.querySelector(".rui-button") as HTMLElement).click();
    await settle();
    // The re-render really happened…
    expect(screen.shadowRoot.textContent).toContain("n:1");
    // …and the reconciler did not sweep the arrows away with it.
    expect(screen.shadowRoot.querySelectorAll(".rui-data-grid-scroll-arrow")).toHaveLength(2);
    // …nor the rows. The end-of-render paint has to fill the FRESH tree; when it
    // resolved to the live one instead, the fresh (empty) tbody was handed to the
    // reconciler and every row vanished on the second render.
    expect(screen.shadowRoot.querySelectorAll(".rui-data-grid-table > tbody > tr")).toHaveLength(3);
    expect(screen.shadowRoot.querySelector(".rui-data-grid")!.getAttribute("data-col-sig")).toBeTruthy();
  });

  it("can be switched off with scrollArrows: false", async () => {
    const screen = render(grid("{ scrollArrows: false }"));
    await settle();
    expect(screen.shadowRoot.querySelector(".rui-data-grid-scroll-arrow")).toBeNull();
    // The viewport and the edge fades it drives are still there.
    expect(screen.shadowRoot.querySelector(".rui-data-grid-viewport")).toBeTruthy();
  });

  it("clicking an arrow scrolls the port, not the page", async () => {
    const screen = render(grid("{}"));
    await settle();
    const scroller = screen.shadowRoot.querySelector(".rui-data-grid-scroll") as HTMLElement;
    let scrolledBy: number | null = null;
    scroller.scrollBy = ((opts: ScrollToOptions) => { scrolledBy = opts.left ?? 0; }) as HTMLElement["scrollBy"];
    (screen.shadowRoot.querySelector(".rui-data-grid-scroll-arrow-right") as HTMLElement).click();
    expect(scrolledBy).not.toBeNull();
    expect(scrolledBy!).toBeGreaterThan(0);
    (screen.shadowRoot.querySelector(".rui-data-grid-scroll-arrow-left") as HTMLElement).click();
    expect(scrolledBy!).toBeLessThan(0);
  });
});

describe("DataGrid resizable columns", () => {
  it("drives widths from a colgroup and adds the slack-absorbing filler", async () => {
    const screen = render(grid("{ resizable: true }"));
    await settle();
    const root = screen.shadowRoot;
    const group = root.querySelector(".rui-data-grid-table > colgroup")!;
    expect(group).toBeTruthy();
    const keyed = [...group.querySelectorAll("col[data-col-key]")].map((c) => c.getAttribute("data-col-key"));
    expect(keyed).toEqual(["Name", "Age"]);
    // One filler column, and a matching cell in the header and in every row, so
    // the borders run to the table's edge.
    expect(group.querySelector("col.rui-data-grid-col-filler")).toBeTruthy();
    expect(root.querySelector(".rui-data-grid-table > thead th.rui-data-grid-filler")).toBeTruthy();
    for (const tr of root.querySelectorAll(".rui-data-grid-table > tbody > tr")) {
      expect(tr.querySelector("td.rui-data-grid-filler")).toBeTruthy();
    }
    expect(root.querySelector(".rui-data-grid")!.getAttribute("data-resizable")).toBe("true");
  });

  it("puts a keyboard-operable handle on each resizable header", async () => {
    const screen = render(grid("{ resizable: true }"));
    await settle();
    const handles = [...screen.shadowRoot.querySelectorAll(".rui-data-grid-resize-handle")] as HTMLElement[];
    expect(handles).toHaveLength(2);
    expect(handles[0]!.getAttribute("role")).toBe("separator");
    expect(handles[0]!.getAttribute("tabindex")).toBe("0");
    expect(handles[0]!.getAttribute("aria-label")).toBe("Resize Name");
  });

  it("a keyboard resize writes the width to the column, not to every cell", async () => {
    const screen = render(grid("{ resizable: true }"));
    await settle();
    const root = screen.shadowRoot;
    const handle = root.querySelector(".rui-data-grid-resize-handle") as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    const nameCol = root.querySelector('.rui-data-grid-table > colgroup > col[data-col-key="Name"]') as HTMLElement;
    expect(nameCol.style.width).toMatch(/^\d+px$/);
    // No per-cell width writes: header, filter row and body can no longer skew
    // apart, which is what the old `applySizeToCells` pass caused.
    const cell = root.querySelector('.rui-data-grid-table > tbody td[data-col-key="Name"]') as HTMLElement;
    expect(cell.style.width).toBe("");
  });

  it("respects a per-column resizable: false", async () => {
    const screen = render(grid("{ resizable: true }", [
      '  Col("Name", rows.map(r => r.name), "text", "left", false, false, null, null, "", "", null, "", "", false, "", false),',
      '  Col("Age", rows.map(r => r.age), "number")',
    ].join("\n")));
    await settle();
    const handles = [...screen.shadowRoot.querySelectorAll(".rui-data-grid-resize-handle")] as HTMLElement[];
    expect(handles.map((h) => h.getAttribute("data-resize-col"))).toEqual(["Age"]);
  });

  it("leaves a non-resizable grid on auto layout with no colgroup filler", async () => {
    const screen = render(grid("{}"));
    await settle();
    const root = screen.shadowRoot;
    expect(root.querySelector(".rui-data-grid")!.getAttribute("data-resizable")).toBeNull();
    expect(root.querySelector("col.rui-data-grid-col-filler")).toBeNull();
    expect(root.querySelector(".rui-data-grid-filler")).toBeNull();
  });
});

describe("DataGrid repaint keeps the filter box the user is typing in", () => {
  it("does not recreate the filter input on every keystroke", async () => {
    const screen = render(grid("{}", [
      '  Col("Name", rows.map(r => r.name), "text", "left", false, true),',
      '  Col("Age", rows.map(r => r.age), "number", "left", false, true)',
    ].join("\n")));
    await settle();
    const root = screen.shadowRoot;
    const input = root.querySelector(".rui-data-grid-filter") as HTMLInputElement;
    input.focus();
    input.value = "Ali";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    // The SAME node, still focused, still holding what was typed. Rebuilding the
    // header on every repaint replaced this node and dropped the caret.
    expect(root.querySelector(".rui-data-grid-filter")).toBe(input);
    expect(input.value).toBe("Ali");
    expect(root.activeElement).toBe(input);
    // …and the filter actually ran.
    const names = [...root.querySelectorAll('.rui-data-grid-table > tbody td[data-col-key="Name"]')]
      .map((td) => td.textContent);
    expect(names).toEqual(["Alice"]);
  });

  it("rebuilds the header when the column layout DOES change", async () => {
    const screen = render(grid("{ columnMenu: true }"));
    await settle();
    const root = screen.shadowRoot;
    (root.querySelector(".rui-data-grid-col-menu-btn") as HTMLElement).click();
    await settle();
    const rows = [...root.querySelectorAll(".rui-data-grid-col-panel-row")] as HTMLElement[];
    const ageRow = rows.find((r) => r.getAttribute("data-col-key") === "Age")!;
    (ageRow.querySelector(".rui-data-grid-col-panel-cb") as HTMLInputElement).click();
    await settle();
    const headers = [...root.querySelectorAll(".rui-data-grid-table > thead th[data-col-key]")]
      .map((th) => th.getAttribute("data-col-key"));
    expect(headers).toEqual(["Name"]);
    // Body rows follow, and the empty menu column is gone for good.
    const firstRow = root.querySelector(".rui-data-grid-table > tbody > tr")!;
    expect(firstRow.querySelectorAll("td")).toHaveLength(1);
  });
});

describe("conditional columns", () => {
  // `cols.map(col => col.args?.[n])` throws on a null entry — optional chaining
  // on `.args` does not protect the `col` in front of it — so a permission-gated
  // column rendered the whole table as "[render error in …]".
  for (const component of ["Table", "DataGrid"]) {
    it(`${component} skips a null column instead of failing to render`, async () => {
      const screen = render([
        ROWS,
        "canEdit = false",
        `$app(${component}([`,
        '  Col("Name", rows.map(r => r.name)),',
        '  canEdit ? Col("Actions", rows.map(r => r.name)) : null,',
        '  Col("Age", rows.map(r => r.age), "number")',
        "]))",
      ].join("\n"));
      await settle();
      const root = screen.shadowRoot;
      expect(root.querySelector(".rui-render-error")).toBeNull();
      const headers = [...root.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
      expect(headers).toEqual(["Name", "Age"]);
    });
  }
});

describe("DataGrid column configuration follows the current columns", () => {
  it("shows a column that only appears on a later render", async () => {
    const screen = render([
      "$extra = false",
      ROWS,
      "$app(Column([",
      '  Button("add", { onClick: () => { $extra = true } }),',
      "  DataGrid([",
      '    Col("Name", rows.map(r => r.name)),',
      // A conditional column is the natural way to write "only for someone who
      // can use it" — and the `null` used to crash the whole grid.
      '    $extra ? Col("Age", rows.map(r => r.age), "number") : null',
      "  ], { columnMenu: true })",
      "]))",
    ].join("\n"));
    await settle();
    const root = screen.shadowRoot;
    const keys = (): (string | null)[] =>
      [...root.querySelectorAll(".rui-data-grid-table > thead th[data-col-key]")]
        .map((th) => th.getAttribute("data-col-key"));
    expect(keys()).toEqual(["Name"]);
    (root.querySelector(".rui-button") as HTMLElement).click();
    await settle();
    // The stored order was seeded on the first render and never revisited, so
    // this column used to be filtered straight back out again.
    expect(keys()).toEqual(["Name", "Age"]);
  });
});

/**
 * The settings panel drives the table from OUTSIDE it.
 *
 * The panel is promoted into the top layer while open, and where the `popover`
 * API is missing the floating layer falls back to reparenting it out of the grid
 * — Safari < 17, Firefox < 125, and the DOM implementation behind these very
 * tests (the first case below asserts the reparenting, so this is not
 * hypothetical). Its checkboxes and pin buttons therefore hand `repaint` an
 * origin whose `closest(".rui-data-grid")` is null, and the grid has to be
 * resolved some other way or the new column config is stored while the table in
 * front of the user does not change.
 *
 * These cases pin the panel → live-table path end to end. The resolver's LAST
 * fallback — the remembered live root, for a host where the deferred post-paint
 * pass has not filled the viewport slot — is not reachable from here, because
 * happy-dom fills that slot on the first flush; `apps/user-management`'s suite
 * runs on jsdom, which does not, and it is where that arm actually failed.
 */
describe("DataGrid column settings panel drives the live table", () => {
  const headers = (screen: ReturnType<typeof render>): string[] =>
    [...screen.shadowRoot.querySelectorAll<HTMLElement>(
      ".rui-data-grid-table thead th:not([role=\"presentation\"])",
    )].map((th) => (th.textContent ?? "").trim());

  async function openPanel(screen: ReturnType<typeof render>): Promise<HTMLElement> {
    await screen.click(screen.getByRole("button", { name: "Column settings" }));
    await settle();
    return screen.getByRole("dialog", { name: "Column settings" });
  }

  it("takes a column out of the header when its checkbox is unchecked", async () => {
    const screen = render(grid("{columnMenu: true, resizable: true}"));
    await settle();
    expect(headers(screen)).toStrictEqual(["Name", "Age"]);

    const panel = await openPanel(screen);
    // Reparented by the floating layer, which is the whole point of this suite.
    expect(panel.closest(".rui-data-grid")).toBeNull();
    await screen.click(screen.getByRole("checkbox", { name: "Show Age" }));
    await settle();

    expect(headers(screen)).toStrictEqual(["Name"]);
    // The rows follow the header — a hidden column leaves no empty cell behind.
    const firstRow = screen.shadowRoot.querySelector(".rui-data-grid-table tbody tr")!;
    expect(firstRow.querySelectorAll("td[data-col-key]").length).toBe(1);
  });

  it("puts a re-checked column back", async () => {
    const screen = render(grid("{columnMenu: true}"));
    await settle();
    await openPanel(screen);

    await screen.click(screen.getByRole("checkbox", { name: "Show Age" }));
    await settle();
    expect(headers(screen)).toStrictEqual(["Name"]);

    await screen.click(screen.getByRole("checkbox", { name: "Show Age" }));
    await settle();
    expect(headers(screen)).toStrictEqual(["Name", "Age"]);
  });

  it("Reset restores every column the panel hid", async () => {
    const screen = render(grid("{columnMenu: true}"));
    await settle();
    const panel = await openPanel(screen);

    await screen.click(screen.getByRole("checkbox", { name: "Show Age" }));
    await settle();
    expect(headers(screen)).toStrictEqual(["Name"]);

    await screen.click(panel.querySelector<HTMLElement>(".rui-data-grid-col-panel-reset")!);
    await settle();
    expect(headers(screen)).toStrictEqual(["Name", "Age"]);
  });

  it("pins a column from the panel and marks the live header cell", async () => {
    const screen = render(grid("{columnMenu: true}"));
    await settle();
    await openPanel(screen);

    await screen.click(screen.getByRole("button", { name: "Pin Name" }));
    await settle();

    const nameTh = screen.shadowRoot.querySelector('th[data-col-key="Name"]')!;
    expect(nameTh.getAttribute("data-pinned")).toBe("true");
  });

  it("names its storage slot in the DOM, so a shared key is visible", async () => {
    const screen = render(grid('{columnMenu: true, persistKey: "tools-spec"}'));
    await settle();

    expect(screen.shadowRoot.querySelector(".rui-data-grid")!.getAttribute("data-persist-key"))
      .toBe("tools-spec");

    const plain = render(grid("{columnMenu: true}"));
    await settle();
    expect(plain.shadowRoot.querySelector(".rui-data-grid")!.hasAttribute("data-persist-key")).toBe(false);
  });

  it("persists what the panel changed under the persistKey", async () => {
    localStorage.removeItem("aktion-datagrid-tools-spec");
    const screen = render(grid('{columnMenu: true, persistKey: "tools-spec"}'));
    await settle();
    await openPanel(screen);

    await screen.click(screen.getByRole("checkbox", { name: "Show Age" }));
    await settle();

    expect(JSON.parse(localStorage.getItem("aktion-datagrid-tools-spec") ?? "{}"))
      .toMatchObject({ v: 1, hidden: ["Age"] });
    localStorage.removeItem("aktion-datagrid-tools-spec");
  });

  it("starts from the persisted layout on the next mount", async () => {
    localStorage.setItem("aktion-datagrid-tools-spec", JSON.stringify({
      v: 1, order: ["Name", "Age"], hidden: ["Age"], pinned: [], widths: {},
    }));
    const screen = render(grid('{columnMenu: true, persistKey: "tools-spec"}'));
    await settle();

    expect(headers(screen)).toStrictEqual(["Name"]);
    localStorage.removeItem("aktion-datagrid-tools-spec");
  });
});

/**
 * Column reordering.
 *
 * This ran on HTML5 drag-and-drop and was unusable. The headline defect was that
 * the drop was direction-dependent: the commit spliced the key out of the order
 * and re-inserted it AT the target's index, but removing it first shifts every
 * later index down one — so dropping a column onto a row put it AFTER that row
 * when dragging down and BEFORE it when dragging up. The only feedback was a
 * `border-top` on the hovered row, which therefore pointed at the wrong gap half
 * the time (and reflowed the list 2px every time it moved), `dragenter` /
 * `dragleave` bubbling from the row's own children made the highlight flicker
 * several times per row, and `dragstart` never called `dataTransfer.setData`,
 * which Firefox requires before it will start a drag at all.
 *
 * It is now pointer-driven: `toIndex` is how many whole row-heights the row has
 * travelled, the rows it passes slide out of the way, and the gap on screen is
 * where the column lands — the same way in both directions.
 */
describe("DataGrid column reordering", () => {
  const COLS = [
    '  Col("Name", rows.map(r => r.name), "text", "left", true),',
    '  Col("Age", rows.map(r => r.age), "number"),',
    '  Col("City", rows.map(r => r.name), "text"),',
    '  Col("Zip", rows.map(r => r.age), "number")',
  ].join("\n");

  const headers = (screen: ReturnType<typeof render>): string[] =>
    [...screen.shadowRoot.querySelectorAll<HTMLElement>(
      ".rui-data-grid-table thead th:not([role=\"presentation\"])",
    )].map((th) => (th.textContent ?? "").trim());

  const panelKeys = (screen: ReturnType<typeof render>): string[] =>
    [...screen.shadowRoot.querySelectorAll(".rui-data-grid-col-panel-row")]
      .map((r) => r.getAttribute("data-col-key") ?? "");

  const rowFor = (screen: ReturnType<typeof render>, key: string): HTMLElement =>
    [...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-data-grid-col-panel-row")]
      .find((r) => r.getAttribute("data-col-key") === key)!;

  async function open(screen: ReturnType<typeof render>): Promise<void> {
    await screen.click(screen.getByRole("button", { name: "Column settings" }));
    await settle();
  }

  /**
   * jsdom lays nothing out, so every row measures 0×0 and the component's
   * "how many row-heights have I travelled" maths has nothing to divide by.
   * Stub the geometry: uniform ROW_H-tall rows stacked from the top.
   */
  const ROW_H = 32;
  function stubGeometry(screen: ReturnType<typeof render>): void {
    const rows = [...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-data-grid-col-panel-row")];
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () => ({
        top: i * ROW_H, bottom: (i + 1) * ROW_H, height: ROW_H,
        left: 0, right: 200, width: 200, x: 0, y: i * ROW_H,
        toJSON: () => ({}),
      } as DOMRect);
    });
    const panel = screen.shadowRoot.querySelector<HTMLElement>(".rui-data-grid-col-panel")!;
    panel.getBoundingClientRect = () => ({
      top: 0, bottom: rows.length * ROW_H, height: rows.length * ROW_H,
      left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
  }

  const pointer = (node: HTMLElement, type: string, clientY: number, pointerId = 1): void => {
    node.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      pointerId, pointerType: "mouse", isPrimary: true,
      button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: 20, clientY,
    }));
  };

  /** Press on `key`'s row and drag it `deltaRows` places, then release. */
  async function drag(
    screen: ReturnType<typeof render>, key: string, deltaRows: number,
  ): Promise<void> {
    stubGeometry(screen);
    const row = rowFor(screen, key);
    const startY = row.getBoundingClientRect().top + (ROW_H / 2);
    pointer(row, "pointerdown", startY);
    pointer(row, "pointermove", startY + (Math.sign(deltaRows) * 8));
    pointer(row, "pointermove", startY + (deltaRows * ROW_H));
    pointer(row, "pointerup", startY + (deltaRows * ROW_H));
    await settle();
  }

  it("lands the column exactly where the gap was, dragging DOWN", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);
    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);

    await drag(screen, "Name", 2);

    expect(panelKeys(screen)).toStrictEqual(["Age", "City", "Name", "Zip"]);
    expect(headers(screen)).toStrictEqual(["Age", "City", "Name", "Zip"]);
  });

  it("lands the column exactly where the gap was, dragging UP", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);

    await drag(screen, "Zip", -2);

    expect(panelKeys(screen)).toStrictEqual(["Name", "Zip", "Age", "City"]);
  });

  it("is symmetric — dragging n places down then n back up is a no-op", async () => {
    // The whole point. The old splice-at-target-index commit could not do this:
    // the same gesture in reverse landed the column one place off.
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);
    const before = panelKeys(screen);

    await drag(screen, "Name", 2);
    expect(panelKeys(screen)).not.toStrictEqual(before);
    await drag(screen, "Name", -2);

    expect(panelKeys(screen)).toStrictEqual(before);
  });

  it("clamps at both ends instead of wrapping or throwing", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);

    await drag(screen, "Name", -5);
    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);

    await drag(screen, "Zip", 5);
    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);
  });

  it("treats a press that barely moves as a click, not a reorder", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);
    stubGeometry(screen);

    const row = rowFor(screen, "Name");
    pointer(row, "pointerdown", 16);
    pointer(row, "pointermove", 18);   // 2px — under the 4px threshold
    pointer(row, "pointerup", 18);
    await settle();

    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);
  });

  it("does not arm a drag from the checkbox, so hiding a column still works", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);
    stubGeometry(screen);

    const cb = rowFor(screen, "Age").querySelector<HTMLElement>(".rui-data-grid-col-panel-cb")!;
    pointer(cb, "pointerdown", 40);
    pointer(cb, "pointermove", 90);
    pointer(cb, "pointerup", 90);
    await settle();

    // No reorder happened…
    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);
    // …and the checkbox is still live.
    await screen.click(screen.getByRole("checkbox", { name: "Show Age" }));
    await settle();
    expect(headers(screen)).toStrictEqual(["Name", "City", "Zip"]);
  });

  it("abandons an in-flight drag on Escape without committing or closing", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);
    stubGeometry(screen);

    const row = rowFor(screen, "Name");
    pointer(row, "pointerdown", 16);
    pointer(row, "pointermove", 16 + (2 * ROW_H));
    expect(row.classList.contains("rui-data-grid-col-dragging")).toBe(true);

    row.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true, composed: true,
    }));
    await settle();

    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);
    // Every inline transform the drag added is gone…
    expect([...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-data-grid-col-panel-row")]
      .every((r) => r.style.transform === "")).toBe(true);
    // …and Escape did not bubble on to close the whole panel.
    expect(screen.shadowRoot.querySelector(".rui-data-grid-col-panel")!.getAttribute("data-open"))
      .toBe("true");
  });

  it("displaces the rows the dragged column passes, so the gap shows the landing slot", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);
    stubGeometry(screen);

    const row = rowFor(screen, "Name");
    pointer(row, "pointerdown", 16);
    pointer(row, "pointermove", 16 + 8);
    pointer(row, "pointermove", 16 + (2 * ROW_H));

    const transforms = [...screen.shadowRoot.querySelectorAll<HTMLElement>(
      ".rui-data-grid-col-panel-row",
    )].map((r) => r.style.transform);
    // The dragged row tracks the pointer; the two it passed step up exactly one
    // row-height each; the one beyond it does not move.
    expect(transforms).toStrictEqual([
      `translateY(${2 * ROW_H}px)`,
      `translateY(-${ROW_H}px)`,
      `translateY(-${ROW_H}px)`,
      "",
    ]);

    pointer(row, "pointerup", 16 + (2 * ROW_H));
    await settle();
  });

  it("reorders from the keyboard, which pointer-only dragging made impossible", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);

    const handle = screen.getByRole("button", { name: "Reorder Name" });
    handle.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowDown", bubbles: true, cancelable: true, composed: true,
    }));
    await settle();

    expect(panelKeys(screen)).toStrictEqual(["Age", "Name", "City", "Zip"]);
    expect(headers(screen)).toStrictEqual(["Age", "Name", "City", "Zip"]);
    // Focus follows the column it moved, so the next arrow press keeps going.
    expect(screen.shadowRoot.activeElement?.getAttribute("aria-label")).toBe("Reorder Name");
  });

  it("clamps keyboard reordering at the ends", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);

    screen.getByRole("button", { name: "Reorder Name" }).dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowUp", bubbles: true, cancelable: true, composed: true,
    }));
    await settle();
    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);
  });

  it("abandons the drag if the pointer capture is lost mid-gesture", async () => {
    // Capture can go away without a pointerup — the row gets replaced, or the
    // browser takes the pointer back. Without this the gesture is stranded: the
    // rows stay displaced and there is no event left that would finish it.
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);
    stubGeometry(screen);

    const row = rowFor(screen, "Name");
    pointer(row, "pointerdown", 16);
    pointer(row, "pointermove", 16 + (2 * ROW_H));
    expect(row.style.transform).not.toBe("");

    pointer(row, "lostpointercapture", 16 + (2 * ROW_H));
    await settle();

    expect(panelKeys(screen)).toStrictEqual(["Name", "Age", "City", "Zip"]);
    expect([...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-data-grid-col-panel-row")]
      .every((r) => r.style.transform === "")).toBe(true);
  });

  it("no longer opts the row into native drag-and-drop", async () => {
    // A `draggable` ancestor would race the pointer handlers: the browser's own
    // drag start cancels the pointer stream mid-gesture.
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);

    for (const row of screen.shadowRoot.querySelectorAll(".rui-data-grid-col-panel-row")) {
      expect(row.hasAttribute("draggable")).toBe(false);
    }
  });

  it("describes the keyboard gesture on every handle", async () => {
    const screen = render(grid("{columnMenu: true}", COLS));
    await settle();
    await open(screen);

    const hint = screen.shadowRoot.querySelector(".rui-data-grid-col-panel-hint")!;
    expect(hint.id).toMatch(/reorder-hint$/);
    for (const handle of screen.shadowRoot.querySelectorAll(".rui-data-grid-col-panel-handle")) {
      expect(handle.tagName).toBe("BUTTON");
      expect(handle.getAttribute("aria-describedby")).toBe(hint.id);
    }
  });
});
