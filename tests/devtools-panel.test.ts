/**
 * Aktion DevTools — the 3.0 panel, end to end.
 *
 * Every test mounts the real `<aktion-devtools>` against a real `<aktion-app>`
 * and drives it through its own controls, addressed by their `data-dt` test
 * ids. What is asserted is what a user sees or what the app actually did —
 * never a view's private state alone — because a debugger that reports one
 * thing while the runtime did another is worse than no debugger.
 *
 * The first half ports the guarantees the 2.x panel was tested for (focus and
 * caret survive re-renders, derivations are memoised, the palette, shortcuts,
 * pausing, time travel, program history, storage editing…) onto the new
 * shell; the second half covers the sections added in 3.0.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, flush, cleanup } from "../src/testing/index.js";
import { getDevtoolsHook, installDevtoolsHook, type DevtoolsAppRecord } from "../src/devtools/hook.js";
import { AktionDevtoolsElement, mountDevtools } from "../src/devtools/panel.js";
import { VIEWS } from "../src/devtools/views/index.js";
import { visibleNodes } from "../src/devtools/views/inspect.js";
import { diffSnapshots } from "../src/devtools/views/state.js";
import { fuzzyScore, rankCommands, type Command } from "../src/devtools/palette.js";
import { ancestorKeyCandidates } from "../src/devtools/tree.js";
import { defaultUiState } from "../src/devtools/context.js";
import { codeView, highlightLines } from "../src/devtools/ui/code.js";
import { render as renderVdom } from "../src/devtools/core/vdom.js";
import { InspectOverlay } from "../src/devtools/overlay.js";
import type { HistoryEntry } from "../src/devtools/model.js";
import type { InstanceNode } from "../src/devtools/protocol.js";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

type Controller = ReturnType<typeof mountDevtools>;

let controllers: Controller[] = [];
let unsubscribers: Array<() => void> = [];
let restoreFetch: (() => void) | null = null;

function clearStorage(): void {
  try {
    for (const key of Object.keys(globalThis.localStorage ?? {})) {
      if (key.startsWith("aktion-devtools") || key.startsWith("dt-test")) globalThis.localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}

function mount(options?: Parameters<typeof mountDevtools>[0]): Controller {
  clearStorage();
  const controller = mountDevtools(options);
  controllers.push(controller);
  return controller;
}

function listen(): void {
  unsubscribers.push(installDevtoolsHook().subscribe(() => {}));
}

function currentApp(): DevtoolsAppRecord {
  const app = [...getDevtoolsHook()!.apps.values()].pop();
  if (!app) throw new Error("no app registered");
  return app;
}

/** Let the app and the panel settle, then force the panel's pending render. */
async function settle(c: Controller, times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
  c.flush();
}

const shadow = (c: Controller): ShadowRoot => c.element.shadowRoot!;
const text = (c: Controller): string => shadow(c).textContent ?? "";

function q<T extends Element = HTMLElement>(c: Controller, selector: string): T {
  const el = shadow(c).querySelector(selector);
  if (!el) throw new Error(`not found: ${selector}\n${text(c).slice(0, 400)}`);
  return el as T;
}

function all<T extends Element = HTMLElement>(c: Controller, selector: string): T[] {
  return [...shadow(c).querySelectorAll(selector)] as T[];
}

function byText<T extends Element = HTMLElement>(c: Controller, selector: string, needle: string): T {
  const el = all<T>(c, selector).find((node) => (node.textContent ?? "").includes(needle));
  if (!el) throw new Error(`no ${selector} containing "${needle}"`);
  return el;
}

async function show(c: Controller, id: string): Promise<void> {
  q(c, `[data-dt="rail-${id}"]`).click();
  await settle(c);
}

async function click(c: Controller, selector: string): Promise<void> {
  q(c, selector).click();
  await settle(c);
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...init }));
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const original = globalThis.fetch;
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init));
  globalThis.fetch = mock as unknown as typeof fetch;
  restoreFetch = () => { globalThis.fetch = original; };
  return mock;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  for (const c of controllers) c.destroy();
  controllers = [];
  for (const u of unsubscribers) u();
  unsubscribers = [];
  cleanup();
  document.querySelectorAll("aktion-devtools, aktion-devtools-overlay").forEach((el) => el.remove());
  const hook = getDevtoolsHook();
  if (hook) {
    hook.apps.clear();
    hook.buffer.length = 0;
    hook.setOptions({ captureProps: true, tagDom: true, captureSnapshots: true, captureNetwork: true, measureDom: true });
  }
  restoreFetch?.();
  restoreFetch = null;
  clearStorage();
  vi.restoreAllMocks();
});

const COUNTER = `
  $count = 0
  $app(Column([
    Text(\`\${$count}\`),
    Button("inc", { onClick: () => $count = $count + 1 })
  ]))
`;

const PANEL_PROGRAM = `
  $count = 0
  $name = "Ada"
  $effect(() => {}, [$count])
  function Row(label) { return Text(\`\${label}:\${$count}\`) }
  $app(Column([
    Row("A"),
    Input({ value: $name, label: "Name" }),
    Button("inc", { onClick: () => $count = $count + 1 })
  ]))
`;

/* ========================================================================== */
/*  The shell                                                                  */
/* ========================================================================== */

describe("panel shell", () => {
  it("mounts, adopts the app, and derives a live model", async () => {
    const c = mount();
    expect(c.element).toBeInstanceOf(AktionDevtoolsElement);
    const screen = render(`
      $count = 7
      function Label() { return Text(\`n=\${$count}\`) }
      $app(Label())
    `);
    await settle(c);
    const model = c.element.getModel()!;
    expect(model.state.count).toBe(7);
    expect(model.commits.length).toBeGreaterThan(0);
    // Opens on Overview, with the app's name in the switcher.
    expect(c.element.getUiState().tab).toBe("overview");
    expect(q(c, "[data-dt=\"overview\"]")).toBeTruthy();

    await show(c, "state");
    expect(text(c)).toContain("count");
    currentApp().setState("count", 99);
    await settle(c);
    expect(c.element.getModel()!.state.count).toBe(99);
    expect(screen.state.get("count")).toBe(99);
  });

  it("renders every section without hitting the error boundary", async () => {
    const c = mount();
    const screen = render(PANEL_PROGRAM);
    await settle(c);
    await screen.click("inc");
    await settle(c);
    for (const view of VIEWS) {
      await show(c, view.id);
      expect(c.element.getUiState().tab).toBe(view.id);
      expect(text(c).length, view.id).toBeGreaterThan(50);
      expect(text(c), view.id).not.toContain("hit an error while rendering");
    }
  });

  it("contains a section that throws instead of blanking the panel", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    const model = c.element.getModel()!;
    Object.defineProperty(model, "commits", { get() { throw new Error("boom"); }, configurable: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await show(c, "profiler");
    expect(text(c)).toContain("hit an error while rendering");
    // The rail still works: the shell survived its section.
    expect(shadow(c).querySelectorAll("[data-dt^=\"rail-\"]").length).toBe(VIEWS.length);
  });

  it("reflects dock and theme on the host element", async () => {
    const c = mount({ dock: "bottom" });
    render(`$app(Text("x"))`);
    await settle(c);
    expect(c.element.getAttribute("data-dock")).toBe("bottom");
    c.element.getUiState().theme = "light";
    c.selectTab("overview");
    await settle(c);
    expect(c.element.getAttribute("data-theme")).toBe("light");
    c.dock("right");
    await settle(c);
    expect(c.element.getAttribute("data-dock")).toBe("right");
    // Docking pushes the page aside so the app stays visible.
    expect(document.documentElement.getAttribute("data-aktion-devtools-docked")).toBe("right");
  });

  it("minimises to a launcher and restores the page when it does", async () => {
    const c = mount({ dock: "right" });
    render(`$app(Text("x"))`);
    await settle(c);
    c.close();
    await settle(c);
    expect(c.element.getUiState().minimized).toBe(true);
    expect(shadow(c).querySelector(".dt-launcher")).toBeTruthy();
    expect(document.documentElement.hasAttribute("data-aktion-devtools-docked")).toBe(false);
    (shadow(c).querySelector(".dt-launcher") as HTMLElement).click();
    await settle(c);
    expect(c.element.getUiState().minimized).toBe(false);
  });

  it("gives every section a rail button and a badge only when there is a problem", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    for (const view of VIEWS) expect(shadow(c).querySelector(`[data-dt="rail-${view.id}"]`), view.id).toBeTruthy();
    // A clean app: no alarm badges anywhere.
    expect(all(c, ".dt-rail-badge.t-red")).toHaveLength(0);
  });
});

/* ========================================================================== */
/*  Typing survives re-renders                                                 */
/* ========================================================================== */

describe("typing survives the panel re-rendering", () => {
  it("keeps focus in the REPL across running an expression and later commits", async () => {
    const c = mount();
    const screen = render(`$count = 7\n$app(Text("x"))`);
    await settle(c);
    await show(c, "console");
    const input = q<HTMLInputElement>(c, "[data-dt=\"repl\"]");
    input.focus();
    type(input, "$count * 2");
    press(input, "Enter");
    await settle(c);
    expect(text(c)).toContain("$count * 2");
    expect(text(c)).toContain("14");
    expect(shadow(c).activeElement).toBe(input);
    await screen.state.set("count", 8);
    await settle(c);
    expect(shadow(c).activeElement).toBe(q(c, "[data-dt=\"repl\"]"));
  });

  it("keeps the filter text and focus when a commit arrives mid-typing", async () => {
    const c = mount();
    const screen = render(PANEL_PROGRAM);
    await settle(c);
    await show(c, "state");
    const search = q<HTMLInputElement>(c, "[data-dt=\"state-filter\"]");
    search.focus();
    type(search, "cou");
    await settle(c);
    await screen.click("inc");
    await settle(c);
    const active = shadow(c).activeElement as HTMLInputElement | null;
    expect(active?.getAttribute("data-dt")).toBe("state-filter");
    expect(active?.value).toBe("cou");
  });

  it("does not move focus into another field when the focused one goes away", async () => {
    const c = mount();
    render(`$count = 1\n$app(Text("x"))`);
    await settle(c);
    await show(c, "state");
    q<HTMLInputElement>(c, "[data-dt=\"state-filter\"]").focus();
    // The Diff view has no filter box: focus must not jump into a different input.
    await click(c, "[data-dt=\"seg-diff\"]");
    const active = shadow(c).activeElement;
    expect(active instanceof HTMLInputElement && active.getAttribute("data-dt") !== "state-filter").toBe(false);
  });

  it("keeps an uncontrolled field's draft when the panel repaints", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await show(c, "theme");
    const input = all<HTMLInputElement>(c, "[data-dt=\"theme-token\"] .tm-value")[0]!;
    input.focus();
    input.value = "#123456";
    await screen.click("inc");
    await settle(c);
    // The token was not committed, and the typed draft is still there.
    expect(input.value).toBe("#123456");
  });

  it("keeps a list's scroll offset across re-renders", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await show(c, "state");
    const list = q(c, "[data-dt=\"state-tree\"]");
    list.scrollTop = 42;
    await screen.click("inc");
    await settle(c);
    expect(q(c, "[data-dt=\"state-tree\"]")).toBe(list);
    expect(list.scrollTop).toBe(42);
  });
});

/* ========================================================================== */
/*  Memoised derivations                                                       */
/* ========================================================================== */

describe("expensive derivations are memoised", () => {
  it("analyses the program at most once per change of text", async () => {
    const c = mount();
    render(`$n = 1\n$app(Text("x"))`);
    await settle(c);
    const app = currentApp() as Required<DevtoolsAppRecord>;
    const spy = vi.spyOn(app, "analyzeProgram");
    await show(c, "source");
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockClear();
    c.selectTab("source");
    await settle(c);
    await settle(c);
    expect(spy.mock.calls.length).toBe(0);
  });

  it("reads the component tree once per render pass", async () => {
    const c = mount();
    render(`
      function Row(label) { return Text(label) }
      $app(Column([Row("A"), Row("B")]))
    `);
    await settle(c);
    const app = currentApp() as Required<DevtoolsAppRecord>;
    await show(c, "inspect");
    const spy = vi.spyOn(app, "getComponentTree");
    c.flush();
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

/* ========================================================================== */
/*  Inspector                                                                  */
/* ========================================================================== */

describe("inspector", () => {
  const nodes: InstanceNode[] = [
    { instanceKey: "a", name: "Page", kind: "user", parentKey: null, depth: 0, phase: "mount", selfTime: 1, reason: "" },
    { instanceKey: "b", name: "Column", kind: "library", parentKey: "a", depth: 1, phase: "mount", selfTime: 1, reason: "" },
    { instanceKey: "c", name: "Card", kind: "library", parentKey: "b", depth: 2, phase: "mount", selfTime: 1, reason: "" },
    { instanceKey: "d", name: "Row", kind: "user", parentKey: "c", depth: 3, phase: "mount", selfTime: 1, reason: "" },
    { instanceKey: "e", name: "Text", kind: "library", parentKey: "d", depth: 4, phase: "mount", selfTime: 1, reason: "" },
  ] as unknown as InstanceNode[];
  const withUi = (overrides: Partial<ReturnType<typeof defaultUiState>>) => ({ ui: { ...defaultUiState(), ...overrides } });

  it("keeps the hierarchy when library components are hidden", () => {
    const shown = visibleNodes(withUi({ inspectShowLibrary: false }), nodes);
    expect(shown.map((n) => n.name)).toEqual(["Page", "Row"]);
    expect(shown.map((n) => n.depth)).toEqual([0, 1]);
    expect(shown[1]!.parentKey).toBe("a");
  });

  it("flattens to a result list while filtering", () => {
    const shown = visibleNodes(withUi({ inspectFilter: "row" }), nodes);
    expect(shown.map((n) => [n.name, n.depth, n.parentKey])).toEqual([["Row", 0, null]]);
  });

  it("shows the component tree and a selected component's props", async () => {
    const c = mount();
    render(PANEL_PROGRAM);
    await settle(c);
    await show(c, "inspect");
    expect(text(c)).toContain("Row");
    expect(text(c)).toContain("Column");
    byText(c, "[data-dt=\"tree-row\"]", "Row").click();
    await settle(c);
    expect(c.element.getUiState().selectedInstance).toContain("Row");
    expect(q(c, "[data-dt=\"inspect-detail\"]").textContent).toContain("label");
  });

  it("overrides a prop inline and the app re-renders with it", async () => {
    const c = mount();
    const screen = render(`$app(Text("before"))`);
    await settle(c);
    await show(c, "inspect");
    byText(c, "[data-dt=\"tree-row\"]", "Text").click();
    await settle(c);
    byText(c, "[data-dt=\"value-leaf\"]", "before").click();
    await settle(c);
    const input = q<HTMLInputElement>(c, "[data-dt=\"value-edit\"]");
    type(input, "after");
    press(input, "Enter");
    await settle(c);
    expect(screen.html()).toContain("after");
    expect(text(c)).toContain("override");
  });

  it("derives the ancestors to expand from the instance key alone", () => {
    const key = "$/0#Page@1:0/1#Card@7:4>0#Button@9:12";
    const candidates = ancestorKeyCandidates(key);
    expect(candidates).toEqual(expect.arrayContaining(["$", "$/0#Page@1:0", "$/0#Page@1:0/1#Card@7:4"]));
    expect(candidates).not.toContain(key);
  });

  it("reveals a component selected from elsewhere, clearing what hid it", async () => {
    const c = mount();
    render(`
      Card = () => Column([Text("inner")])
      $app(Column([Card()]))
    `);
    await settle(c);
    await show(c, "inspect");
    type(q<HTMLInputElement>(c, "[data-dt=\"inspect-filter\"]"), "zzz-nothing");
    await settle(c);
    await click(c, "[data-dt=\"inspect-library\"]");
    expect(c.element.getUiState().inspectShowLibrary).toBe(false);

    // Jump there from the command palette's "Inspect Text".
    press(shadow(c), "k", { ctrlKey: true });
    await settle(c);
    const input = q<HTMLInputElement>(c, "[data-dt=\"palette-input\"]");
    type(input, "Inspect Text");
    await settle(c);
    press(input, "Enter");
    await settle(c);
    await settle(c);

    const ui = c.element.getUiState();
    expect(ui.tab).toBe("inspect");
    expect(ui.inspectFilter).toBe("");
    expect(ui.inspectShowLibrary).toBe(true);
    expect(ui.selectedInstance).toContain("Text");
    expect(ui.inspectReveal).toBeNull();
    expect(shadow(c).querySelector("[data-dt=\"tree-row\"].is-selected")?.textContent).toContain("Text");
  });
});

/* ========================================================================== */
/*  State                                                                      */
/* ========================================================================== */

describe("state", () => {
  const snapshot = (values: Record<string, unknown>, commitId = 0): HistoryEntry => ({ commitId, time: commitId, changedPaths: [], snapshot: values });

  it("diffs snapshots at the leaves", () => {
    const changes = diffSnapshots(snapshot({ user: { prefs: { notify: true } }, count: 1 }), snapshot({ user: { prefs: { notify: false } }, count: 1 }, 1));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "changed", path: "user.prefs.notify", before: "true", after: "false" });
    const kinds = new Map(diffSnapshots(snapshot({ a: 1, gone: "x" }), snapshot({ a: 1, added: "y" }, 1)).map((ch) => [ch.path, ch.kind]));
    expect(kinds.get("added")).toBe("added");
    expect(kinds.get("gone")).toBe("removed");
    expect(diffSnapshots(snapshot({ a: [1, 2] }), snapshot({ a: [1, 2] }, 1))).toHaveLength(0);
  });

  it("time-travels to an earlier commit and restores it into the app", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await screen.click("inc");
    await screen.click("inc");
    await settle(c);
    await show(c, "state");
    const history = c.element.getModel()!.history;
    expect(history.length).toBeGreaterThan(1);
    const range = q<HTMLInputElement>(c, ".st-range");
    range.value = "0";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(c);
    expect(c.element.getUiState().timeTravel).toBe(history[0]!.commitId);
    expect(text(c)).toContain("read-only");
    await click(c, "[data-dt=\"travel-restore\"]");
    expect(screen.state.get("count")).toBe(0);
    expect(c.element.getUiState().timeTravel).toBeNull();
  });

  it("renders the diff view against a real app", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await screen.click("inc");
    await screen.click("inc");
    await settle(c);
    await show(c, "state");
    await click(c, "[data-dt=\"seg-diff\"]");
    expect(q(c, "[data-dt=\"state-diff\"]").textContent).toContain("count");
  });

  it("breaks into the debugger (and warns) when a marked atom changes", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await show(c, "state");
    q(c, ".st-break").click();
    await settle(c);
    expect(c.element.getUiState().breakOnChange.has("count")).toBe(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await screen.click("inc");
    await settle(c);
    expect(warn.mock.calls.some((call) => String(call[0]).includes("break on change: $count"))).toBe(true);
  });
});

/* ========================================================================== */
/*  State heat, profiler, effects                                              */
/* ========================================================================== */

describe("insights and visualisations", () => {
  it("sorts atoms by how often they change", async () => {
    const c = mount();
    const screen = render(`
      $alpha = 0
      $zeta = 0
      $app(Column([Text(\`\${$zeta}\`), Button("bump", { onClick: () => $zeta = $zeta + 1 })]))
    `);
    await settle(c);
    await screen.click("bump");
    await screen.click("bump");
    await settle(c);
    expect(c.element.getModel()!.changeCounts.get("zeta")).toBeGreaterThanOrEqual(2);
    await show(c, "state");
    const names = (): string[] => all(c, "[data-dt=\"state-tree\"] .vk").map((el) => el.textContent ?? "");
    expect(names().indexOf("alpha")).toBeLessThan(names().indexOf("zeta"));
    byText(c, "[data-dt=\"state\"] .fchip", "Activity").click();
    await settle(c);
    expect(c.element.getUiState().stateSort).toBe("activity");
    expect(names().indexOf("zeta")).toBeLessThan(names().indexOf("alpha"));
  });

  it("ranks components by cost and explains why each rendered", async () => {
    const c = mount();
    const screen = render(`
      $count = 0
      function Row(label) { return Text(\`\${label}:\${$count}\`) }
      $app(Column([Row("A"), Button("inc", { onClick: () => $count = $count + 1 })]))
    `);
    await settle(c);
    await screen.click("inc");
    await settle(c);
    await show(c, "profiler");
    expect(q(c, "[data-dt=\"commit-chart\"]")).toBeTruthy();
    await click(c, "[data-dt=\"seg-ranked\"]");
    expect(q(c, "[data-dt=\"ranked-table\"]").textContent).toContain("Row");
    await click(c, "[data-dt=\"seg-why\"]");
    const why = q(c, "[data-dt=\"why-render\"]").textContent ?? "";
    expect(why).toContain("Commit #");
    expect(why).toContain("$count");
    expect(why).toContain("state dependency changed");
  });

  it("lists mounted effects with their runs, and draws their timeline", async () => {
    const c = mount();
    const screen = render(`
      $count = 0
      $effect(() => { cleanup(() => {}) }, [$count])
      $app(Column([Text(\`\${$count}\`), Button("inc", { onClick: () => $count = $count + 1 })]))
    `);
    await settle(c);
    await screen.click("inc");
    await settle(c);
    await show(c, "effects");
    const table = q(c, "[data-dt=\"effects-table\"]");
    expect(table.querySelectorAll(".trow").length).toBeGreaterThan(0);
    expect(table.textContent).toContain("$count");
    await click(c, "[data-dt=\"seg-timeline\"]");
    expect(q(c, "[data-dt=\"effects-timeline\"]")).toBeTruthy();
  });
});

/* ========================================================================== */
/*  Console                                                                    */
/* ========================================================================== */

describe("console", () => {
  it("pins a watch expression that follows the app and persists", async () => {
    const c = mount();
    const screen = render(`
      $count = 1
      $app(Column([Text(\`\${$count}\`), Button("inc", { onClick: () => $count = $count + 1 })]))
    `);
    await settle(c);
    await show(c, "console");
    type(q<HTMLInputElement>(c, "[data-dt=\"repl\"]"), "$count * 10");
    await settle(c);
    q(c, "button[aria-label=\"Watch this expression\"]").click();
    await settle(c);
    expect(c.element.getUiState().watches).toEqual(["$count * 10"]);
    expect(q(c, "[data-dt=\"watches\"]").textContent).toContain("10");
    await screen.click("inc");
    await settle(c);
    expect(q(c, "[data-dt=\"watches\"]").textContent).toContain("20");
    const persisted = JSON.parse(globalThis.localStorage.getItem("aktion-devtools-ui") ?? "{}") as { watches?: string[] };
    expect(persisted.watches).toEqual(["$count * 10"]);
  });

  it("reports a broken watch instead of throwing", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "console");
    type(q<HTMLInputElement>(c, "[data-dt=\"repl\"]"), "$count +");
    await settle(c);
    q(c, "button[aria-label=\"Watch this expression\"]").click();
    await settle(c);
    expect(shadow(c).querySelector(".con-watch.is-error")).toBeTruthy();
  });
});

/* ========================================================================== */
/*  Palette + keyboard                                                         */
/* ========================================================================== */

describe("command palette and shortcuts", () => {
  const commands: Command[] = [
    { id: "1", group: "Inspect", label: "Pick element on the page", run: () => {} },
    { id: "2", group: "Go to", label: "Network", keywords: "http requests", run: () => {} },
    { id: "3", group: "Session", label: "Clear captured data", run: () => {} },
  ];

  it("matches subsequences and ranks word starts first", () => {
    expect(fuzzyScore("pel", "Inspect · Pick element")).not.toBeNull();
    expect(fuzzyScore("zzz", "Inspect · Pick element")).toBeNull();
    expect(fuzzyScore("net", "Go to · Network")!).toBeLessThan(fuzzyScore("net", "Session · Clear captured data no entry")!);
    expect(rankCommands(commands, "http").map((cmd) => cmd.label)).toEqual(["Network"]);
    expect(rankCommands(commands, "")).toHaveLength(3);
  });

  it("puts navigation ahead of an action repeating the word, and exact labels first", () => {
    expect(rankCommands([
      { id: "a", group: "Theme", label: "Reset theme token overrides", run: () => {} },
      { id: "b", group: "Go to", label: "Theme", keywords: "tokens colours", run: () => {} },
    ], "theme")[0]?.id).toBe("b");
    expect(rankCommands([
      { id: "a", group: "Network", label: "Clear network rules", run: () => {} },
      { id: "b", group: "Network", label: "Clear", run: () => {} },
    ], "clear")[0]?.id).toBe("b");
  });

  it("opens with Ctrl+K, runs a command with Enter, and closes with Escape", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    press(shadow(c), "k", { ctrlKey: true });
    await settle(c);
    expect(all(c, "[data-dt=\"palette-item\"]").length).toBeGreaterThan(10);
    const input = q<HTMLInputElement>(c, "[data-dt=\"palette-input\"]");
    type(input, "theme");
    await settle(c);
    press(input, "Enter");
    await settle(c);
    expect(c.element.getUiState().tab).toBe("theme");
    expect(shadow(c).querySelector("[data-dt=\"palette\"]")).toBeNull();
    press(shadow(c), "k", { ctrlKey: true });
    await settle(c);
    press(q(c, "[data-dt=\"palette-input\"]"), "Escape");
    await settle(c);
    expect(shadow(c).querySelector("[data-dt=\"palette\"]")).toBeNull();
  });

  it("opens the palette page-wide with Shift+Alt+K", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "K", code: "KeyK", shiftKey: true, altKey: true, bubbles: true }));
    await settle(c);
    expect(shadow(c).querySelector("[data-dt=\"palette\"]")).toBeTruthy();
  });

  it("shows the shortcut sheet on ? and jumps sections on Alt+number", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    press(shadow(c), "?");
    await settle(c);
    expect(q(c, "[data-dt=\"shortcuts\"]").textContent).toContain("Command palette");
    press(shadow(c), "Escape");
    await settle(c);
    expect(shadow(c).querySelector("[data-dt=\"shortcuts\"]")).toBeNull();
    press(shadow(c), "2", { altKey: true, code: "Digit2" });
    await settle(c);
    expect(c.element.getUiState().tab).toBe("inspect");
  });

  it("switches sections page-wide while focus is in the app", async () => {
    listen();
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "3", code: "Digit3", altKey: true, bubbles: true }));
    await settle(c);
    expect(c.element.getUiState().tab).toBe("state");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "]", code: "BracketRight", altKey: true, bubbles: true }));
    await settle(c);
    expect(c.element.getUiState().tab).toBe(VIEWS[VIEWS.findIndex((v) => v.id === "state") + 1]!.id);
  });

  it("leaves a keystroke alone when the host page is typing", async () => {
    listen();
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    const before = c.element.getUiState().tab;
    const host = document.createElement("input");
    document.body.appendChild(host);
    host.focus();
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "4", code: "Digit4", altKey: true, bubbles: true }));
    await settle(c);
    expect(c.element.getUiState().tab).toBe(before);
    host.remove();
  });
});

/* ========================================================================== */
/*  Pausing                                                                    */
/* ========================================================================== */

describe("pausing", () => {
  it("says how many events it ignored instead of looking hung", async () => {
    listen();
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await click(c, "[data-dt=\"record\"]");
    expect(c.element.getUiState().paused).toBe(true);
    await screen.click("inc");
    await screen.click("inc");
    await settle(c);
    const rec = q(c, "[data-dt=\"record\"]");
    expect(rec.textContent).toMatch(/Paused · \d+/);
    expect(rec.getAttribute("data-tip")).toContain("events ignored");
    await click(c, "[data-dt=\"record\"]");
    expect(c.element.getUiState().paused).toBe(false);
  });
});

/* ========================================================================== */
/*  Network                                                                    */
/* ========================================================================== */

describe("network", () => {
  it("lists requests and pushes a rule to the app", async () => {
    stubFetch(() => json({ items: [] }));
    const c = mount();
    render(`
      $users = $query({ url: "https://api.example.com/users" })
      $app(Text("x"))
    `);
    await settle(c, 12);
    await show(c, "network");
    expect(q(c, "[data-dt=\"network-table\"]").textContent).toContain("/users");
    await click(c, "[data-dt=\"rules-toggle\"]");
    byText(c, "[data-dt=\"rules\"] button", "Delay").click();
    await settle(c);
    expect(c.element.getUiState().rules).toHaveLength(1);
    expect(currentApp().getNetworkRules!()).toHaveLength(1);
  });
});

/* ========================================================================== */
/*  Data                                                                       */
/* ========================================================================== */

describe("data", () => {
  it("simulates a failing query and restores it", async () => {
    stubFetch(() => json({ visits: 1 }));
    const c = mount();
    render(`
      $stats = $query({ url: "https://api.example.com/stats", key: "stats" })
      $app(Text(\`\${$stats.data ? $stats.data.visits : "…"}\`))
    `);
    await settle(c, 12);
    await show(c, "data");
    expect(q(c, "[data-dt=\"queries-table\"]").textContent).toContain("stats");
    q(c, "[data-dt=\"queries-table\"] .trow").click();
    await settle(c);
    await click(c, "[data-dt=\"sim-error\"]");
    const rules = c.element.getUiState().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ label: "devtools:simulate", action: "mock", status: 500, pattern: "/stats" });
    expect(currentApp().getNetworkRules!()).toHaveLength(1);
    await settle(c, 12);
    expect(currentApp().getQueries!().find((query) => query.key === "stats")?.state).toBe("error");
    expect(text(c)).toContain("simulated");
    byText(c, "[data-dt=\"query-detail\"] button", "Restore").click();
    await settle(c, 12);
    expect(c.element.getUiState().rules).toHaveLength(0);
  });

  it("calls a store method with JSON arguments", async () => {
    const c = mount();
    render(`
      cart = $store({ items: [], add: (s, item) => { s.items = [...s.items, item] } })
      $app(Text(\`\${cart.items.length}\`))
    `);
    await settle(c);
    await show(c, "data");
    await click(c, "[data-dt=\"seg-stores\"]");
    q(c, "[data-dt=\"stores-table\"] .trow").click();
    await settle(c);
    type(q<HTMLInputElement>(c, "input[aria-label=\"Arguments for add\"]"), "\"milk\"");
    byText(c, "[data-dt=\"store-detail\"] button", "Call").click();
    await settle(c);
    const store = currentApp().getStores!()[0]!;
    expect(JSON.parse(store.value.json!)).toMatchObject({ items: ["milk"] });
    expect(text(c)).toContain("milk");
  });

  it("writes, flags, edits, and deletes browser storage", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "data");
    await click(c, "[data-dt=\"seg-storage\"]");
    type(q<HTMLInputElement>(c, "input[aria-label=\"New key\"]"), "dt-test-note");
    type(q<HTMLInputElement>(c, "input[aria-label=\"New value\"]"), "hello");
    byText(c, "[data-dt=\"data\"] button", "Add").click();
    await settle(c);
    expect(globalThis.localStorage.getItem("dt-test-note")).toBe("hello");
    expect(q(c, "[data-dt=\"storage-table\"]").textContent).toContain("dt-test-note");

    // The new key is selected: edit it in place.
    const value = q<HTMLTextAreaElement>(c, "[data-dt=\"storage-value\"]");
    type(value, "hello again");
    await settle(c);
    // The edit enabled Save, and the textarea kept what was typed.
    expect(byText<HTMLButtonElement>(c, "[data-dt=\"storage-detail\"] button", "Save").disabled).toBe(false);
    expect(q<HTMLTextAreaElement>(c, "[data-dt=\"storage-value\"]").value).toBe("hello again");
    byText(c, "[data-dt=\"storage-detail\"] button", "Save").click();
    await settle(c);
    expect(globalThis.localStorage.getItem("dt-test-note")).toBe("hello again");

    // A credential-looking key is flagged.
    globalThis.localStorage.setItem("dt-test-token", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ");
    c.selectTab("data");
    await settle(c);
    expect(byText(c, "[data-dt=\"storage-table\"] .trow", "dt-test-token").textContent).toContain("JWT");

    q(c, "[data-dt=\"storage-detail\"] button[aria-label=\"Delete\"]").click();
    await settle(c);
    expect(globalThis.localStorage.getItem("dt-test-note")).toBeNull();
  });
});

/* ========================================================================== */
/*  Routes                                                                     */
/* ========================================================================== */

describe("routes", () => {
  const ROUTED = `
    pages = $router({
      "/": Text("home"),
      "/users/:id": Text("user"),
      "/about": Text("about"),
      default: Text("not found")
    })
    $app(Column([RouteView(pages, { routeKey: route.path })]))
  `;

  it("lists declared arms, fills a param form, and navigates", async () => {
    const c = mount();
    const screen = render(ROUTED);
    await settle(c);
    await show(c, "routes");
    const rows = all(c, "[data-dt=\"route-row\"]");
    expect(rows.map((row) => row.querySelector(".rt-pattern")?.textContent)).toEqual(expect.arrayContaining(["/", "/users/:id", "/about"]));
    const userRow = byText(c, "[data-dt=\"route-row\"]", "/users/:id");
    type(userRow.querySelector("input")!, "42");
    await settle(c);
    byText(c, "[data-dt=\"route-row\"]", "/users/:id").querySelector<HTMLButtonElement>("button:not([disabled])")!.click();
    await settle(c);
    expect(currentApp().getRoute!().path).toBe("/users/42");
    expect(screen.html()).toContain("user");
    expect(q(c, "[data-dt=\"route-path\"]").textContent).toBe("/users/42");
    expect(q(c, "[data-dt=\"route-history\"]").textContent).toContain("/users/42");
  });

  it("tells you which arm a typed path would hit", async () => {
    const c = mount();
    render(ROUTED);
    await settle(c);
    await show(c, "routes");
    type(q<HTMLInputElement>(c, "[data-dt=\"route-input\"]"), "/users/7");
    await settle(c);
    expect(q(c, "[data-dt=\"route-draft-match\"]").textContent).toContain("/users/:id");
  });
});

/* ========================================================================== */
/*  Accessibility                                                              */
/* ========================================================================== */

describe("accessibility view", () => {
  it("audits, numbers findings, and explains one with its WCAG criterion", async () => {
    const c = mount();
    render(`$app(Column([Text("a", { id: "dup" }), Text("b", { id: "dup" })]))`);
    await settle(c);
    await show(c, "a11y");
    await click(c, "[data-dt=\"a11y-run\"]");
    const run = c.element.getUiState().a11yRun!;
    expect(run.findings.some((f) => f.rule === "duplicate-id")).toBe(true);
    expect(q(c, "[data-dt=\"a11y-issues\"]").textContent).toContain("duplicate-id");
    expect(q(c, "[data-dt=\"a11y-summary\"]").textContent).toContain("issue");
    byText(c, "[data-dt=\"a11y-finding\"]", "dup").click();
    await settle(c);
    const detail = q(c, "[data-dt=\"a11y-detail\"]");
    expect(detail.textContent).toContain("How to fix");
    expect(detail.querySelector("a.ax-sc")?.getAttribute("href")).toContain("w3.org/WAI/WCAG22/Understanding/");
  });

  it("walks keyboard focus through the app, announcing each stop", async () => {
    const c = mount();
    render(`$app(Column([Button("One", {}), Button("Two", {})]))`);
    await settle(c);
    await show(c, "a11y");
    await click(c, "[data-dt=\"seg-structure\"]");
    await click(c, "[data-dt=\"a11y-walk-next\"]");
    await click(c, "[data-dt=\"a11y-walk-next\"]");
    expect(c.element.getUiState().a11yWalk).toBe(1);
    const focused = currentApp().element.shadowRoot!.activeElement as HTMLElement | null;
    expect(focused?.textContent).toContain("Two");
    expect(q(c, "[data-dt=\"a11y-keyboard\"]").textContent).toContain("“Two”, button");
  });

  it("simulates colour-vision deficiency on the app, and puts it back", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    const element = currentApp().element;
    const before = element.style.filter;
    await show(c, "a11y");
    await click(c, "[data-dt=\"seg-vision\"]");
    await click(c, "[data-dt=\"vision-deuteranopia\"]");
    expect(element.style.filter).toContain("aktion-dt-vision-deuteranopia");
    expect(document.getElementById("aktion-devtools-vision-filters")).toBeTruthy();
    await click(c, "[data-dt=\"vision-none\"]");
    expect(element.style.filter).toBe(before);
  });

  it("computes contrast for any pair in the checker", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "a11y");
    await click(c, "[data-dt=\"seg-vision\"]");
    type(q<HTMLInputElement>(c, "input[aria-label=\"Text colour\"]"), "#777777");
    await settle(c);
    expect(q(c, "[data-dt=\"contrast-ratio\"]").textContent).toBe("4.48:1");
    expect(q(c, "[data-dt=\"a11y-contrast\"]").textContent).toContain("Closest passing");
  });
});

/* ========================================================================== */
/*  Security                                                                   */
/* ========================================================================== */

describe("security view", () => {
  it("scans on open and lists findings by category", async () => {
    const c = mount();
    globalThis.localStorage.setItem("dt-test-auth", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ");
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "security");
    const report = c.element.getUiState().securityRun!;
    expect(report).toBeTruthy();
    expect(report.findings.some((f) => f.rule === "storage-secret" && f.storageKey === "dt-test-auth")).toBe(true);
    expect(all(c, "[data-dt=\"security-finding\"]").length).toBe(report.findings.length);
    byText(c, "[data-dt=\"security-finding\"]", "dt-test-auth").click();
    await settle(c);
    expect(q(c, "[data-dt=\"security-detail\"]").textContent).toContain("HttpOnly");
  });

  it("shows what the program text can reach", async () => {
    const c = mount();
    render(`
      $n = 0
      $app(Text("x"))
    `);
    await settle(c);
    await show(c, "security");
    await click(c, "[data-dt=\"seg-program\"]");
    expect(q(c, "[data-dt=\"security-policy\"]").textContent).toMatch(/all|safe|custom/);
  });

  it("checks response headers with one same-origin HEAD request", async () => {
    const mock = stubFetch(() => new Response(null, { status: 200, headers: { "x-content-type-options": "nosniff" } }));
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "security");
    await click(c, "[data-dt=\"seg-headers\"]");
    await click(c, "[data-dt=\"security-headers-check\"]");
    await settle(c, 8);
    expect(mock).toHaveBeenCalledTimes(1);
    expect((mock.mock.calls[0]![1] as RequestInit).method).toBe("HEAD");
    const headers = all(c, "[data-dt=\"security-header\"]");
    expect(headers.length).toBeGreaterThan(3);
    expect(byText(c, "[data-dt=\"security-header\"]", "x-content-type-options").textContent).toContain("good");
  });
});

/* ========================================================================== */
/*  Testing                                                                    */
/* ========================================================================== */

describe("testing view", () => {
  it("records a flow and generates a test asserting the changed state", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await show(c, "test");
    await click(c, "[data-dt=\"rec-start\"]");
    await screen.click("inc");
    await settle(c);
    await click(c, "[data-dt=\"rec-stop\"]");
    expect(all(c, "[data-dt=\"rec-step\"]")).toHaveLength(1);
    const generated = c.element.getUiState().generatedTest ?? "";
    expect(generated).toContain("await screen.click(");
    expect(generated).toContain("expect(screen.state.get(\"count\"))");
    await click(c, "[data-dt=\"seg-playwright\"]");
    expect(c.element.getUiState().generatedTest).toContain("@playwright/test");
  });

  it("replays the recording against the live app", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await show(c, "test");
    await click(c, "[data-dt=\"rec-start\"]");
    await screen.click("inc");
    await settle(c);
    await click(c, "[data-dt=\"rec-stop\"]");
    expect(screen.state.get("count")).toBe(1);
    await click(c, "[data-dt=\"rec-replay\"]");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await settle(c, 8);
    expect(screen.state.get("count")).toBe(2);
    expect(c.element.getUiState().replayResults[0]).toMatchObject({ ok: true });
  });

  it("saves a scenario and re-applies its state", async () => {
    const c = mount();
    const screen = render(COUNTER);
    await settle(c);
    await screen.click("inc");
    await screen.click("inc");
    await settle(c);
    await show(c, "test");
    await click(c, "[data-dt=\"seg-scenarios\"]");
    type(q<HTMLInputElement>(c, "[data-dt=\"scenario-name\"]"), "Two clicks");
    await click(c, "[data-dt=\"scenario-save\"]");
    expect(c.element.getUiState().scenarios.map((s) => s.name)).toEqual(["Two clicks"]);
    await screen.state.set("count", 50);
    await settle(c);
    await click(c, "[data-dt=\"scenario-apply\"]");
    expect(screen.state.get("count")).toBe(2);
  });

  it("finds elements the way a test would, and warns on ambiguity", async () => {
    const c = mount();
    render(`$app(Column([Button("Save", {}), Button("Cancel", {})]))`);
    await settle(c);
    await show(c, "test");
    await click(c, "[data-dt=\"seg-queries\"]");
    type(q<HTMLInputElement>(c, "[data-dt=\"query-input\"]"), "button");
    await settle(c);
    expect(q(c, "[data-dt=\"query-verdict\"]").textContent).toContain("2 elements match");
    type(q<HTMLInputElement>(c, "input[aria-label=\"Accessible name\"]"), "Save");
    await settle(c);
    expect(q(c, "[data-dt=\"query-verdict\"]").textContent).toContain("Exactly one match");
    expect(text(c)).toContain(`screen.getByRole("button", { name: "Save" })`);
  });

  it("runs a seeded chaos pass that reports errors and skips destructive controls", async () => {
    // Installed BEFORE the panel, so its console capture wraps the (silent) spy.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = mount();
    const screen = render(`
      $deleted = 0
      $app(Column([
        Button("Explode", { onClick: () => { throw new Error("chaos found me") } }),
        Button("Delete everything", { onClick: () => $deleted = $deleted + 1 })
      ]))
    `);
    await settle(c);
    await show(c, "test");
    await click(c, "[data-dt=\"seg-chaos\"]");
    c.element.getUiState().chaosClicks = 20;
    await click(c, "[data-dt=\"chaos-run\"]");
    for (let i = 0; i < 40 && c.element.getUiState().fuzzRunning; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    await settle(c);
    const run = c.element.getUiState().fuzzRun!;
    expect(run.clicks).toBeGreaterThan(0);
    expect(run.errors.some((e) => e.includes("chaos found me"))).toBe(true);
    expect(run.seed).toBeTypeOf("number");
    expect(run.steps!.length).toBe(run.clicks);
    expect(screen.state.get("deleted")).toBe(0);
    expect(q(c, "[data-dt=\"chaos-errors\"]").textContent).toContain("chaos found me");
  });

  it("emulates the network condition through the app's rules", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "test");
    await click(c, "[data-dt=\"seg-emulate\"]");
    q(c, "[data-dt=\"emulate-network\"] [data-dt=\"seg-offline\"]").click();
    await settle(c);
    expect(c.element.getUiState().throttle).toBe("offline");
    expect(currentApp().getNetworkRules!().some((rule) => rule.action === "offline")).toBe(true);
  });
});

/* ========================================================================== */
/*  Source                                                                     */
/* ========================================================================== */

describe("source view", () => {
  it("renders a window of a large program, with real gutter numbers", async () => {
    const host = document.createElement("div");
    renderVdom(host, [codeView({ lines: highlightLines("aaa\nbbb\nccc"), firstLine: 501, inline: true })]);
    expect([...host.querySelectorAll(".code-gutter")].map((el) => el.textContent)).toEqual(["501", "502", "503"]);

    const c = mount();
    render(`${Array.from({ length: 1000 }, (_, i) => `// filler ${i}`).join("\n")}\n$app(Text("big"))`);
    await settle(c);
    await show(c, "source");
    const lines = all(c, "[data-dt=\"source-code\"] .code-line").length;
    expect(lines).toBeGreaterThan(0);
    expect(lines).toBeLessThan(200);
  });

  it("edits the program with live validation and applies it", async () => {
    const c = mount();
    const screen = render(`$app(Text("first"))`);
    await settle(c);
    await show(c, "source");
    await click(c, "[data-dt=\"source-edit\"]");
    const editor = q<HTMLTextAreaElement>(c, "[data-dt=\"editor-input\"]");
    type(editor, `$app(Text("second"))`);
    await new Promise((resolve) => setTimeout(resolve, 320));
    await settle(c);
    expect(text(c)).toContain("valid");
    await click(c, "[data-dt=\"source-apply\"]");
    await settle(c);
    expect(screen.html()).toContain("second");
    expect(c.element.getUiState().sourceDraft).toBeNull();
  });

  it("records program versions and reverts to an earlier one", async () => {
    const c = mount();
    const screen = render(`$app(Text("first"))`);
    await settle(c);
    currentApp().setProgram!(`$app(Text("second"))`);
    await settle(c);
    expect(screen.html()).toContain("second");
    expect(c.element.getModel()!.programHistory.length).toBeGreaterThanOrEqual(2);
    await show(c, "source");
    await click(c, "[data-dt=\"seg-history\"]");
    expect(all(c, "[data-dt=\"source-history\"] .sr-version").length).toBeGreaterThanOrEqual(2);
    byText(c, "[data-dt=\"source-history\"] button", "Revert").click();
    await settle(c);
    expect(screen.html()).toContain("first");
  });
});

/* ========================================================================== */
/*  Theme                                                                      */
/* ========================================================================== */

describe("theme view", () => {
  it("edits a token live, marks it, and restores it", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "theme");
    const row = q(c, "[data-dt=\"theme-token\"][data-token=\"radiusMd\"]");
    const input = row.querySelector<HTMLInputElement>(".tm-value")!;
    input.value = "3px";
    press(input, "Enter");
    await settle(c);
    const theme = currentApp().getTheme!();
    expect(theme.tokens.radiusMd).toBe("3px");
    expect(theme.devtoolsOverrides).toContain("radiusMd");
    expect(q(c, "[data-dt=\"theme-token\"][data-token=\"radiusMd\"]").textContent).toContain("edited");
    // ↑ nudges numeric tokens in their own unit.
    const again = q(c, "[data-dt=\"theme-token\"][data-token=\"radiusMd\"] .tm-value") as HTMLInputElement;
    press(again, "ArrowUp");
    await settle(c);
    expect(currentApp().getTheme!().tokens.radiusMd).toBe("4px");
    await click(c, "[data-dt=\"theme-reset\"]");
    expect(currentApp().getTheme!().devtoolsOverrides).toHaveLength(0);
  });

  it("checks the contrast of the pairs the library paints", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "theme");
    expect(all(c, "[data-dt=\"theme-pair\"]").length).toBeGreaterThan(5);
  });
});

/* ========================================================================== */
/*  Settings                                                                   */
/* ========================================================================== */

describe("settings view", () => {
  it("toggles runtime instrumentation", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "settings");
    q(c, "[data-dt=\"settings-captureProps\"] input").click();
    await settle(c);
    expect(getDevtoolsHook()!.options.captureProps).toBe(false);
    q(c, "[data-dt=\"settings-captureProps\"] input").click();
    await settle(c);
    expect(getDevtoolsHook()!.options.captureProps).toBe(true);
  });

  it("switches the panel theme and density, and persists them", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "settings");
    q(c, "[data-dt=\"settings-theme\"] [data-dt=\"seg-light\"]").click();
    await settle(c);
    q(c, "[data-dt=\"settings-density\"] [data-dt=\"seg-compact\"]").click();
    await settle(c);
    expect(c.element.getAttribute("data-theme")).toBe("light");
    expect(c.element.getAttribute("data-density")).toBe("compact");
    const persisted = JSON.parse(globalThis.localStorage.getItem("aktion-devtools-ui") ?? "{}") as { theme?: string; compact?: boolean };
    expect(persisted).toMatchObject({ theme: "light", compact: true });
    byText(c, "[data-dt=\"settings-data\"] button", "Reset").click();
    await settle(c);
    expect(c.element.getAttribute("data-density")).toBe("comfortable");
  });

  it("shows the versions it is running with", async () => {
    const c = mount();
    render(`$app(Text("x"))`);
    await settle(c);
    await show(c, "settings");
    const about = q(c, "[data-dt=\"settings-about\"]").textContent ?? "";
    expect(about).toContain(String(getDevtoolsHook()!.protocolVersion));
    expect(about).toContain(getDevtoolsHook()!.libraryVersion);
  });
});

/* ========================================================================== */
/*  Render highlighting                                                        */
/* ========================================================================== */

describe("highlight re-renders", () => {
  it("outlines exactly the components that rendered", async () => {
    const c = mount();
    const screen = render(`
      $a = 0
      $b = 0
      function ReadsA() { return Text(\`a=\${$a}\`) }
      function ReadsB() { return Text(\`b=\${$b}\`) }
      $app(Column([ReadsA(), ReadsB(), Button("bumpA", { onClick: () => $a = $a + 1 })]))
    `);
    await settle(c);
    const scan = vi.spyOn(InspectOverlay.prototype, "scanRender");
    c.element.setHighlightUpdates(true);
    await settle(c);
    await screen.click("bumpA");
    await settle(c);
    const names = scan.mock.calls.flatMap((call) => call[0].map((entry) => entry.name));
    expect(names).toContain("ReadsA");
    expect(names).not.toContain("ReadsB");
  });
});
