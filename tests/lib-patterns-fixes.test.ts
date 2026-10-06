/**
 * Renderer / spec agreements for the pattern, chart and wrapper components
 * (src/library/components/{new-components,patterns,advanced-patterns,charts,
 * scheduling,wave3,wrappers}.ts) that an audit found drifting apart.
 *
 * Each case is a place where the spec (its prop descriptions, and the
 * generated types built from them) promised one thing and the renderer did
 * another; the cases fail on the pre-fix renderer. The type-level halves live
 * in tests/fixtures/dsl-types/{surface,negative}.lib-patterns.*.
 */
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, flush, render } from "../src/testing/index.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";
import { Gantt, JsonTree, Truncate } from "../src/library/components/new-components.js";
import { Tour, Drawer } from "../src/library/components/advanced-patterns.js";
import type { RenderHelpers } from "../src/library/types.js";
import { Router } from "../src/runtime/router.js";
import { generateDslTypes } from "../scripts/dsl-types/generate.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  cleanup();
});

/** The minimal helpers a spec renders against outside the runtime. */
function helpers(): RenderHelpers {
  const noop = (): void => {};
  return {
    renderNode: (value: unknown) => document.createTextNode(typeof value === "string" ? value : ""),
    invoke: (fn, ...args) => { if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args); },
    setState: noop,
    resetState: noop,
    sendToAssistant: noop,
    openUrl: noop,
    bindState: noop,
    useInstanceState: <T,>(_key: string, initial: T) => {
      let value = initial;
      return { get: () => value, set: (next: T) => { value = next; } };
    },
    registerDisposer: noop,
    router: new Router(),
  };
}

const node = (name: string) => ({ __kind: "Component" as const, name, args: [], argMeta: [] });

/* ---------------------------------------------------------------- new-components */

describe("QueryBuilder", () => {
  it("reports every edit through onChange even when `value` is bound", async () => {
    // The mode the description recommends (`value: $rules`) used to write the
    // state and skip the callback, so a bound builder could not also refetch.
    const screen = render(`
      $rules = []
      $calls = 0
      $app(QueryBuilder(["name"], { value: $rules, onChange: (next) => { $calls = $calls + 1 } }))
    `);
    await flush();
    await screen.click(screen.getByText("Add rule"));
    expect(screen.state.get("rules")).toHaveLength(1);
    expect(screen.state.get("calls")).toBe(1);
  });

  it("scopes a global operator to a field whose custom `type` differs only in case", async () => {
    const screen = render(`
      $app(QueryBuilder([{ name: "price", type: "Currency" }], {
        value: [{ field: "price" }],
        operators: [{ value: "gt", label: "more than", type: "Currency" }, { value: "equals", type: "text" }],
      }))
    `);
    await flush();
    const op = screen.shadowRoot.querySelector<HTMLSelectElement>(".rui-query-builder-op")!;
    expect([...op.options].map((o) => o.textContent)).toEqual(["more than"]);
  });
});

describe("Truncate", () => {
  it("declares `text` optional, since `child` replaces it", () => {
    expect(Truncate.props.find((p) => p.name === "text")?.optional).toBe(true);
  });
});

describe("InlineEdit", () => {
  it("puts the shell's name / invalid / describedBy contract on the input, not the wrapper", async () => {
    const screen = render(`$app(InlineEdit("Draft", { name: "title", invalid: true, describedBy: "title-help" }))`);
    await flush();
    const wrapper = screen.shadowRoot.querySelector<HTMLElement>(".rui-inline-edit")!;
    const input = wrapper.querySelector<HTMLInputElement>(".rui-inline-edit-input")!;
    const display = wrapper.querySelector<HTMLElement>(".rui-inline-edit-display")!;
    expect(input.getAttribute("name")).toBe("title");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("title-help");
    // The display button holds focus while the field is not being edited.
    expect(display.getAttribute("aria-describedby")).toBe("title-help");
    for (const attr of ["name", "aria-invalid", "aria-describedby", "required", "disabled"]) {
      expect(wrapper.hasAttribute(attr), attr).toBe(false);
    }
  });

  it("still submits under the generated id when no `name` is given", async () => {
    const screen = render(`$app(InlineEdit("Draft", { label: "Title" }))`);
    await flush();
    const input = screen.shadowRoot.querySelector<HTMLInputElement>(".rui-inline-edit-input")!;
    expect(input.getAttribute("name")).toBe(input.id);
  });
});

describe("Gantt today", () => {
  const program = (today: string): string => `
    $app(Gantt([{ id: "a", label: "A", start: "2026-01-01T00:00:00Z", end: "2026-01-11T00:00:00Z" }], { today: ${today} }))
  `;
  const markers = (screen: ReturnType<typeof render>): HTMLElement[] =>
    [...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-gantt-today")];

  it("draws no marker for null (a cleared $variable)", () => {
    // A range around NOW: null used to mean "now", which a fixed past range
    // would hide by clipping the marker.
    const day = 86_400_000;
    const iso = (t: number): string => new Date(t).toISOString();
    const tasks = [{ id: "a", label: "A", start: iso(Date.now() - 5 * day), end: iso(Date.now() + 5 * day) }];
    const cleared = Gantt.render(node("Gantt"), { tasks, today: null }, helpers()) as HTMLElement;
    expect(cleared.querySelectorAll(".rui-gantt-today")).toHaveLength(0);
    const now = Gantt.render(node("Gantt"), { tasks, today: true }, helpers()) as HTMLElement;
    expect(now.querySelectorAll(".rui-gantt-today")).toHaveLength(1);
  });

  it("draws the marker at an epoch-millisecond timestamp", async () => {
    const screen = render(program(String(Date.parse("2026-01-06T00:00:00Z"))));
    await flush();
    expect(markers(screen).map((m) => m.getAttribute("style"))).toEqual(["left:50%"]);
  });
});

describe("NotificationBell", () => {
  it("passes onItemClick the item's index in `items`, not among the objects only", async () => {
    const screen = render(`
      $got = -1
      $app(NotificationBell(2, {
        items: [{ title: "First" }, 5, { title: "Second" }],
        onItemClick: (item, index) => { $got = index },
      }))
    `);
    await flush();
    const rows = [...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-notification-bell-item")];
    expect(rows.map((r) => r.textContent)).toEqual(["First", "Second"]);
    await screen.click(rows[1]!);
    expect(screen.state.get("got")).toBe(2);
  });
});

describe("JsonTree", () => {
  it("renders undefined and function leaves with a value", () => {
    const root = JsonTree.render(node("JsonTree"), { data: { a: undefined, f: () => 1 }, expanded: true }, helpers()) as HTMLElement;
    const leaves = [...root.querySelectorAll(".rui-json-tree-leaf")].map((l) => l.textContent);
    expect(leaves).toEqual(["undefined", "[Function]"]);
  });
});

/* ---------------------------------------------------------------- scheduling */

describe("Calendar event chips", () => {
  it("falls back to the primary tone when the chip colour is rejected", async () => {
    const screen = render(`
      $app(Calendar(0, { year: 2026, events: [
        { date: "2026-01-03", label: "Breakout", color: "red;position:fixed" },
        { date: "2026-01-04", label: "Proto", color: "constructor" },
        { date: "2026-01-05", label: "Tone", tone: "success" },
      ] }))
    `);
    await flush();
    const chips = [...screen.shadowRoot.querySelectorAll<HTMLElement>(".rui-gcal-chip")];
    expect(chips.map((c) => c.getAttribute("style"))).toEqual([
      "--rui-gcal-chip:var(--rui-color-primary)",
      // An own-key lookup: a colour word, not Object.prototype.constructor.
      "--rui-gcal-chip:constructor",
      "--rui-gcal-chip:var(--rui-color-success, #10b981)",
    ]);
  });
});

/* ---------------------------------------------------------------- patterns */

describe("Banner", () => {
  it("fires onClick alongside href", async () => {
    const screen = render(`
      $clicks = 0
      $app(Banner("Release notes", { href: "#changelog", onClick: () => { $clicks = $clicks + 1 } }))
    `);
    await flush();
    const band = screen.shadowRoot.querySelector<HTMLElement>("a.rui-banner")!;
    // An anchor already has its role and tab stop.
    expect(band.getAttribute("role")).toBeNull();
    expect(band.getAttribute("tabindex")).toBeNull();
    await screen.click(band);
    expect(screen.state.get("clicks")).toBe(1);
  });
});

describe("Stats", () => {
  it("renders object items under `layout: \"grid\"`", async () => {
    const screen = render(`$app(Stats([{ label: "MRR", value: "$12k" }, { label: "Churn", value: "2%" }], { layout: "grid" }))`);
    await flush();
    const grid = screen.shadowRoot.querySelector(".rui-metric-grid")!;
    expect([...grid.querySelectorAll(".rui-stats-label")].map((l) => l.textContent)).toEqual(["MRR", "Churn"]);
  });

  it("keeps object items beside a StatCard (which forces the grid)", async () => {
    const screen = render(`$app(Stats([{ label: "MRR", value: "$12k" }, StatCard("Churn", { value: "2%" })]))`);
    await flush();
    const grid = screen.shadowRoot.querySelector(".rui-metric-grid")!;
    expect(grid.querySelector(".rui-stats-label")?.textContent).toBe("MRR");
    expect(grid.querySelector(".rui-stat-card")).not.toBeNull();
  });
});

describe("type hints", () => {
  it("name no type the declarations cannot resolve (SectionHeader.status named a nonexistent `Tag`)", () => {
    const { summary } = generateDslTypes({ ts, repoRoot });
    expect(summary.unresolvedTypeNames).toEqual({});
  });
});

/* ---------------------------------------------------------------- wave3 */

describe("QRCode", () => {
  it("drops the backing rect for a transparent background", async () => {
    const screen = render(`$app(Column([QRCode("https://a.example", { background: "transparent" }), QRCode("https://b.example")]))`);
    await flush();
    const svgs = [...screen.shadowRoot.querySelectorAll(".rui-qrcode svg")];
    expect(svgs.map((svg) => svg.querySelectorAll("rect").length)).toEqual([0, 1]);
  });
});

/* ---------------------------------------------------------------- charts */

describe("Series colour", () => {
  const INJECTED = "red;background:url(https://evil.example/x)";

  it("is sanitised before it reaches the legend's inline style and the SVG fill", async () => {
    const screen = render(`$app(BarChart(["a", "b"], [Series("Revenue", [1, 2], "${INJECTED}")]))`);
    await flush();
    const swatch = screen.shadowRoot.querySelector<HTMLElement>(".rui-chart-legend-swatch")!;
    expect(swatch.getAttribute("style")).toBe("background:var(--rui-chart-1, #6366f1)");
    for (const bar of screen.shadowRoot.querySelectorAll("rect[rx]")) {
      expect(bar.getAttribute("fill")).toBe("var(--rui-chart-1, #6366f1)");
    }
  });

  it("is sanitised for ScatterChart too, whose series reader passes it through", async () => {
    const screen = render(`$app(ScatterChart([Series("Cohort", [{ x: 1, y: 2 }], "${INJECTED}")]))`);
    await flush();
    const swatch = screen.shadowRoot.querySelector<HTMLElement>(".rui-chart-legend-swatch")!;
    expect(swatch.getAttribute("style")).toBe("background:var(--rui-chart-1, #6366f1)");
  });

  it("keeps a plain colour", async () => {
    const screen = render(`$app(BarChart(["a"], [Series("Revenue", [1], "#ff0000")]))`);
    await flush();
    expect(screen.shadowRoot.querySelector(".rui-chart-legend-swatch")?.getAttribute("style")).toBe("background:#ff0000");
  });
});

describe("Series values hint", () => {
  // `propExpectsObject` reads the hint, and an object-shaped hint makes
  // `chooseNamedBagIndex` take an all-unknown-keys object in the `values`
  // slot as the payload instead of the named-props bag, so a misspelt prop
  // bound silently into `values` and the chart drew nothing.
  const messages = (src: string): string[] =>
    validateProgramSchema(parse(src), defaultLibrary).map((e) => e.message);

  it("still reports a misspelt prop in the named-props bag", () => {
    expect(messages(`$app(BarChart(["a"], [Series("Rev", { valeus: [1] })]))`).join("\n")).toContain('Unknown prop "valeus"');
    expect(messages(`$app(ScatterChart([Series("A", { pts: [[1, 2]] })]))`).join("\n")).toContain('Unknown prop "pts"');
  });

  it("accepts both point forms and the named `values` / `points` props", () => {
    expect(messages(`$app(ScatterChart([Series("A", [{ x: 1, y: 2 }]), Series("B", [[1, 2, "p"]])]))`)).toEqual([]);
    expect(messages(`$app(ScatterChart([Series("A", { values: [{ x: 1, y: 2 }] }), Series("B", { points: [[1, 2]] })]))`)).toEqual([]);
  });
});

describe("LineChart filled + stacked", () => {
  /** The `<title>` of every activatable dot, i.e. what a click or a screen reader reports. */
  const dots = (screen: ReturnType<typeof render>): string[] =>
    [...screen.shadowRoot.querySelectorAll("circle")].map((c) => c.querySelector("title")?.textContent ?? "");

  it("draws no click target at a hole in `data`", async () => {
    const screen = render(`
      $got = []
      $app(LineChart({
        data: [{ x: "Jan", a: 1, b: 2 }, { x: "Feb", b: 3 }, { x: "Mar", a: 2, b: 1 }],
        filled: true, stacked: true,
        onPointClick: (label, value, name) => { $got = [...$got, value] },
      }))
    `);
    await flush();
    expect(dots(screen)).toEqual(["a — Jan: 1", "a — Mar: 2", "b — Jan: 2", "b — Feb: 3", "b — Mar: 1"]);
  });

  it("draws no click target past the end of a shorter Series", async () => {
    const screen = render(`
      $app(LineChart(["A", "B", "C"], [Series("long", [1, 2, 3]), Series("short", [1])], {
        filled: true, stacked: true, onPointClick: (label, value, name) => {},
      }))
    `);
    await flush();
    expect(dots(screen).filter((d) => d.startsWith("short"))).toEqual(["short — A: 1"]);
  });
});

/* ---------------------------------------------------------------- wrappers */

describe("OnFocus", () => {
  const program = `
    $focus = 0
    $blur = 0
    $app(Column([
      OnFocus(Column([Input("first"), Input("second")]), {
        onFocus: (event) => { $focus = $focus + 1 },
        onBlur: (event) => { $blur = $blur + 1 },
      }),
      Input("outside"),
    ]))
  `;
  const move = (from: Element | null, to: Element | null): void => {
    from?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: to }));
    to?.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true, relatedTarget: from }));
  };

  it("treats the wrapped subtree as one unit", async () => {
    const screen = render(program);
    await flush();
    const [first, second, outside] = ["first", "second", "outside"].map((id) => screen.shadowRoot.querySelector(`#${id}`)!);
    move(outside!, first!); // enter from outside
    await flush();
    expect([screen.state.get("focus"), screen.state.get("blur")]).toEqual([1, 0]);
    move(first!, second!); // a move between two descendants fires neither
    await flush();
    expect([screen.state.get("focus"), screen.state.get("blur")]).toEqual([1, 0]);
    move(second!, outside!); // leave
    await flush();
    expect([screen.state.get("focus"), screen.state.get("blur")]).toEqual([1, 1]);
  });

  it("counts a null relatedTarget as outside", async () => {
    const screen = render(program);
    await flush();
    const first = screen.shadowRoot.querySelector("#first")!;
    move(null, first);
    first.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: null }));
    await flush();
    expect([screen.state.get("focus"), screen.state.get("blur")]).toEqual([1, 1]);
  });
});

describe("OnClick", () => {
  it("hands a key activation its KeyboardEvent, as the prop description says", async () => {
    const screen = render(`
      $kind = ""
      $app(OnClick(Text("Row"), { onClick: (event) => { $kind = event.type } }))
    `);
    await flush();
    const wrapper = screen.shadowRoot.querySelector(".rui-on-click")!;
    wrapper.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(screen.state.get("kind")).toBe("keydown");
  });
});

/* ---------------------------------------------------------------- advanced-patterns */

describe("Tour", () => {
  it("declares `current` optional — an unbound tour starts at 0 and advances itself", () => {
    expect(Tour.props.find((p) => p.name === "current")?.optional).toBe(true);
  });

  it("reports Escape through onOpenChange(false)", async () => {
    const screen = render(`
      $changes = []
      $app(Tour(["One", "Two"], { onOpenChange: (open) => { $changes = [...$changes, open] } }))
    `);
    await flush();
    const card = screen.shadowRoot.querySelector(".rui-tour-card")!;
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    expect(screen.state.get("changes")).toEqual([false]);
  });
});

describe("Drawer", () => {
  it("declares `title` optional — the renderer names an untitled drawer itself", () => {
    expect(Drawer.props.find((p) => p.name === "title")?.optional).toBe(true);
    const overlay = Drawer.render(node("Drawer"), { open: true, children: [] }, helpers()) as HTMLElement;
    expect(overlay.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Drawer");
  });
});
