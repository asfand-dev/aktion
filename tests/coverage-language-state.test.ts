/**
 * State & reactivity — permanent regression coverage.
 *
 * Extends (never duplicates) `store.test.ts`, `fine-grained-reactivity.test.ts`,
 * `hooks.test.ts` and `render-consistency.test.ts`. Everything here is asserted
 * from the outside: what the DOM shows, which components re-executed, what
 * `serializeState()` reports, and how many times a disposer ran. No computed
 * geometry, no CSS, no palette values, no class-string snapshots.
 *
 * The contracts pinned down:
 *
 *   1. `$var` declaration / update / survival across unrelated re-renders, and
 *      the resumability round-trip (`serializeState` → `loadSnapshot`).
 *   2. Two-way binding through a component prop lands in the **declared** slot.
 *      Four components (Tabs, Tree, DataGrid, CommandPalette) once resolved
 *      their write target with `argMeta.find(m => m?.stateRef)`, which finds the
 *      *first* `$`-bound prop — usually `items` / `columns` — and clobbered the
 *      author's data with a tab id / page number / `false`. Each component gets
 *      two tests: the bound case writes the declared atom, and the unbound case
 *      writes nothing at all. Both must stay green.
 *   3. Path-level reactivity deeper than one level (sibling leaf vs sibling
 *      subtree vs ancestor vs root), plus the dot-boundary rule — a write to
 *      `$user` must not wake a reader of `$username`.
 *   4. Per-component memoization: per *instance*, and sound — a prop that is a
 *      fresh object every render re-runs the child, a `$memo`-stabilised one
 *      does not.
 *   5. `$store` state survives a re-render driven by an unrelated `$var`, and
 *      two stores never notify each other.
 *   6. Computed derivations propagate transitively through a chain.
 *   7. Array mutation through state: append, filter, and an element-field write
 *      that must not disturb its siblings.
 *   8. `useInstanceState` persists across re-renders, is per-instance, and is
 *      dropped when the instance unmounts.
 *   9. `registerDisposer` runs exactly once per key — never while the instance
 *      is alive, once when it leaves, and again after a remount.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { StateStore } from "../src/runtime/state.js";
import type { ComponentSpec } from "../src/library/types.js";

/* ---------------------------------------------------------------- harness */

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

/** Pump microtask turns so a click → notify → flush → render settles. */
async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
  serializeState(): Record<string, unknown>;
  loadSnapshot(payload: { programText: string; state: Record<string, unknown> }): void;
  registerComponents(components: ComponentSpec[], rootName?: string): void;
}

function create(): AktionEl {
  const el = document.createElement("aktion-app") as AktionEl;
  document.body.appendChild(el);
  return el;
}

async function mount(program: string): Promise<AktionEl> {
  const el = create();
  el.setResponse(program);
  await settle();
  return el;
}

const root = (el: AktionEl): ShadowRoot => el.shadowRoot!;
const textOf = (el: AktionEl): string => root(el).textContent ?? "";
const all = (el: AktionEl, selector: string): HTMLElement[] =>
  [...root(el).querySelectorAll<HTMLElement>(selector)];

function buttonLabels(el: AktionEl): string[] {
  return all(el, "button").map((b) => (b.textContent ?? "").trim());
}

/** Click the first button whose visible label contains `label`. */
async function clickButton(el: AktionEl, label: string): Promise<void> {
  const btn = all(el, "button").find((b) => (b.textContent ?? "").includes(label));
  if (!btn) throw new Error(`No button containing "${label}". Found: ${buttonLabels(el).join(" | ")}`);
  btn.click();
  await settle();
}

/** Click an element, then let the resulting state write settle. */
async function clickNode(node: HTMLElement | undefined): Promise<void> {
  if (!node) throw new Error("clickNode: missing target");
  node.click();
  await settle();
}

/** Capture `console.log` lines (components log to announce a re-execution). */
function captureLogs(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(String(args[0]));
  });
  return logs;
}

/**
 * Mount with logging already captured, then drop the first-paint lines: these
 * tests are about which components re-execute on an *update*.
 */
async function mountWithLogs(program: string): Promise<{ el: AktionEl; logs: string[] }> {
  const logs = captureLogs();
  const el = await mount(program);
  logs.length = 0;
  return { el, logs };
}

/** Labels of the currently selected tab(s), read from ARIA. */
const selectedTabs = (el: AktionEl): string[] =>
  all(el, '[role="tab"]').filter((t) => t.getAttribute("aria-selected") === "true")
    .map((t) => (t.textContent ?? "").trim());

const tabLabels = (el: AktionEl): string[] =>
  all(el, '[role="tab"]').map((t) => (t.textContent ?? "").trim());

/**
 * The selected tab label of every tab strip on the page, in document order.
 * Reported per strip so two structurally identical strips stay distinguishable
 * — that is what proves instance state is keyed per instance.
 */
const selectedTabPerStrip = (el: AktionEl): string[] =>
  all(el, '[role="tablist"]').map((strip) =>
    [...strip.querySelectorAll<HTMLElement>('[role="tab"]')]
      .filter((t) => t.getAttribute("aria-selected") === "true")
      .map((t) => (t.textContent ?? "").trim())
      .join(","));

const tabsInStrip = (el: AktionEl, index: number): HTMLElement[] => {
  const strip = all(el, '[role="tablist"]')[index];
  if (!strip) throw new Error(`No tab strip at index ${index}`);
  return [...strip.querySelectorAll<HTMLElement>('[role="tab"]')];
};

const treeLabels = (el: AktionEl): string[] =>
  all(el, '[role="treeitem"]').map((t) => (t.textContent ?? "").trim());

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/* ====================================================================== *
 * 1. `$var` — declaration, update, survival
 * ====================================================================== */

describe("$var — declaration and update", () => {
  const PROGRAM = `
    $count = 0
    $tick = 0
    aktion = Column([
      Button("Inc", () => $count = $count + 1),
      Button("Tick", () => $tick = $tick + 1),
      Text(\`count:\${$count} tick:\${$tick}\`),
    ])
  `;

  it("renders the declared default, then reflects a handler's write", async () => {
    const el = await mount(PROGRAM);
    expect(textOf(el)).toContain("count:0");
    await clickButton(el, "Inc");
    expect(textOf(el)).toContain("count:1");
    await clickButton(el, "Inc");
    expect(textOf(el)).toContain("count:2");
  });

  it("keeps a written value across a re-render driven by a different atom", async () => {
    const el = await mount(PROGRAM);
    await clickButton(el, "Inc");
    await clickButton(el, "Inc");
    expect(textOf(el)).toContain("count:2");
    // The re-render is caused by `$tick`; the declaration `$count = 0` must not
    // be re-applied over the user's value.
    await clickButton(el, "Tick");
    expect(textOf(el)).toContain("count:2 tick:1");
  });

  it("round-trips live state through serializeState → loadSnapshot (resumability)", async () => {
    const first = await mount(PROGRAM);
    await clickButton(first, "Inc");
    await clickButton(first, "Inc");
    await clickButton(first, "Tick");
    const snapshot = first.serializeState();
    expect(snapshot).toMatchObject({ count: 2, tick: 1 });
    first.remove();

    const resumed = create();
    resumed.loadSnapshot({ programText: PROGRAM, state: snapshot });
    await settle();
    // The restored values win over the program's declared defaults…
    expect(textOf(resumed)).toContain("count:2 tick:1");
    // …and the resumed app is still live.
    await clickButton(resumed, "Inc");
    expect(textOf(resumed)).toContain("count:3");
  });
});

describe("StateStore — declaration and reset contracts", () => {
  const tick = (): Promise<void> => flush();

  it("declare() seeds once — a second declaration never clobbers a live value", async () => {
    const store = new StateStore();
    store.declare("count", 0);
    store.set("count", 7);
    await tick();
    store.declare("count", 0); // re-plan / streaming re-parse
    expect(store.get("count")).toBe(7);
  });

  it("writing the identical value notifies nobody (no spurious re-render)", async () => {
    const store = new StateStore();
    store.declare("count", 0);
    const batches: string[][] = [];
    store.subscribe((changed) => batches.push([...changed]));

    store.set("count", 0); // same value
    await tick();
    expect(batches).toEqual([]);

    store.set("count", 1); // different value
    await tick();
    expect(batches).toEqual([["count"]]);
  });

  it("an object write is identity-based: an equal-but-new object still notifies", async () => {
    const store = new StateStore();
    const initial = { name: "Ada" };
    store.declare("user", initial);
    const batches: string[][] = [];
    store.subscribe((changed) => batches.push([...changed]));

    store.set("user", initial); // same reference
    await tick();
    expect(batches).toEqual([]);

    store.set("user", { name: "Ada" }); // equal, fresh reference
    await tick();
    expect(batches).toEqual([["user"]]);
  });

  it("setPath rebuilds the root immutably — the previous snapshot is untouched", async () => {
    const store = new StateStore();
    store.declare("user", { name: "Ada", role: "Engineer" });
    const before = store.get("user") as Record<string, unknown>;

    store.setPath("user", ["name"], "Bea");
    await tick();

    const after = store.get("user") as Record<string, unknown>;
    expect(after).not.toBe(before);                              // fresh identity
    expect(after).toEqual({ name: "Bea", role: "Engineer" });    // sibling preserved
    expect(before).toEqual({ name: "Ada", role: "Engineer" });   // old snapshot intact
  });

  it("reset() restores the declared default and notifies; resetAll() covers every atom", async () => {
    const store = new StateStore();
    store.declare("count", 5);
    store.declare("name", "Ada");
    store.set("count", 9);
    store.set("name", "Bea");
    await tick();

    const batches: string[][] = [];
    store.subscribe((changed) => batches.push([...changed]));

    store.reset("count");
    await tick();
    expect(store.get("count")).toBe(5);
    expect(store.get("name")).toBe("Bea");
    expect(batches).toEqual([["count"]]);

    store.resetAll();
    await tick();
    expect(store.get("name")).toBe("Ada");
  });

  it("reset() of a name that has no declared default is a no-op (no undefined sentinel)", async () => {
    const store = new StateStore();
    store.declare("count", 1);
    // A hydrated atom the program never declared — an SSR / resumability seed,
    // or `Util.reset($typo)` naming a variable that does not exist.
    store.hydrate({ ghost: 5 });
    const batches: string[][] = [];
    store.subscribe((changed) => batches.push([...changed]));

    store.reset("ghost");
    await tick();
    expect(store.get("ghost")).toBe(5); // NOT overwritten with undefined
    expect(batches).toEqual([]);

    store.reset("neverSeen");
    await tick();
    expect(store.has("neverSeen")).toBe(false);
    expect(batches).toEqual([]);

    // Resetting an atom already at its default is also silent.
    store.reset("count");
    await tick();
    expect(batches).toEqual([]);
  });
});

/* ====================================================================== *
 * 2. Two-way binding lands in the DECLARED prop slot
 * ====================================================================== */

describe("Two-way binding writes the DECLARED slot, never the first $-bound one", () => {
  // ---------------------------------------------------------------- Tabs
  // `Tabs(items, defaultValue, orientation, onChange, value)` — `items` is
  // $-bound at slot 0, the two-way channel is `value` at slot 4.
  const TABS_ITEMS = `[TabItem("a", "Alpha", [Text("pane A")]), TabItem("b", "Beta", [Text("pane B")])]`;

  it("Tabs: activating a tab writes the tab id into the bound `value` atom", async () => {
    const el = await mount(`
      $tabs = ${TABS_ITEMS}
      $active = "a"
      aktion = Column([
        Text(\`active:\${$active}\`),
        Tabs($tabs, { value: $active }),
      ])
    `);
    expect(selectedTabs(el)).toEqual(["Alpha"]);

    await clickNode(all(el, '[role="tab"]')[1]);

    // The write went to `$active`…
    expect(textOf(el)).toContain("active:b");
    expect(el.serializeState().active).toBe("b");
    // …and `$tabs` (the first $-bound prop) is untouched: both tabs still exist.
    expect(tabLabels(el)).toEqual(["Alpha", "Beta"]);
    expect(selectedTabs(el)).toEqual(["Beta"]);
    const tabsAtom = el.serializeState().tabs;
    expect(Array.isArray(tabsAtom)).toBe(true);
    expect(tabsAtom as unknown[]).toHaveLength(2);
  });

  it("Tabs: with no `value` binding, activating a tab writes no state at all", async () => {
    const el = await mount(`
      $tabs = ${TABS_ITEMS}
      aktion = Tabs($tabs)
    `);
    const before = el.serializeState().tabs;

    await clickNode(all(el, '[role="tab"]')[1]);

    expect(selectedTabs(el)).toEqual(["Beta"]);   // the click still works locally
    expect(tabLabels(el)).toEqual(["Alpha", "Beta"]);
    expect(el.serializeState().tabs).toBe(before); // the atom was never written
  });

  // ---------------------------------------------------------------- Tree
  // `Tree(items, selectedId, onSelect, expandedIds, …, checkable, checkedIds)`
  // — `items` is $-bound at slot 0; `selectedId` is slot 1, `checkedIds` slot 7.
  const TREE_ITEMS = `[TreeNode("Docs", { nodeId: "docs" }), TreeNode("Src", { nodeId: "src" })]`;

  it("Tree: selecting a row writes the node id into the bound `selectedId` atom", async () => {
    const el = await mount(`
      $nodes = ${TREE_ITEMS}
      $picked = ""
      aktion = Column([
        Text(\`picked:\${$picked}\`),
        Tree($nodes, { selectedId: $picked }),
      ])
    `);
    await clickNode(all(el, '[role="treeitem"]')[1]);

    expect(el.serializeState().picked).toBe("src");
    expect(textOf(el)).toContain("picked:src");
    expect(treeLabels(el)).toEqual(["Docs", "Src"]); // `$nodes` survived
  });

  it("Tree: checking a box writes the id array into the bound `checkedIds` atom", async () => {
    const el = await mount(`
      $nodes = ${TREE_ITEMS}
      $checked = []
      aktion = Column([
        Text(\`checked:\${$checked.length}\`),
        Tree($nodes, { checkedIds: $checked, checkable: true }),
      ])
    `);
    await clickNode(all(el, 'input[type="checkbox"]')[0]);

    expect(el.serializeState().checked).toEqual(["docs"]);
    expect(textOf(el)).toContain("checked:1");
    expect(treeLabels(el)).toEqual(["Docs", "Src"]); // `$nodes` survived
  });

  it("Tree: with only `onSelect`, the selection writes no state atom", async () => {
    const el = await mount(`
      $nodes = ${TREE_ITEMS}
      $log = ""
      aktion = Column([
        Text(\`log:\${$log}\`),
        Tree($nodes, { onSelect: (id) => $log = id }),
      ])
    `);
    const before = el.serializeState().nodes;

    await clickNode(all(el, '[role="treeitem"]')[1]);

    expect(el.serializeState().log).toBe("src");   // the callback ran
    expect(el.serializeState().nodes).toBe(before); // items never rewritten
    expect(treeLabels(el)).toEqual(["Docs", "Src"]);
  });

  // ------------------------------------------------------------ DataGrid
  // `DataGrid(columns, rowIds, caption, sort, selectedIds, selectable, page, …)`
  // — `columns` is $-bound at slot 0; `page` is slot 6.
  const GRID_COLS = `[Col("Name", ["a", "b", "c", "d"])]`;

  it("DataGrid: paging writes the page number into the bound `page` atom", async () => {
    const el = await mount(`
      $cols = ${GRID_COLS}
      $page = 1
      aktion = Column([
        Text(\`page:\${$page}\`),
        DataGrid($cols, { page: $page, perPage: 2 }),
      ])
    `);
    expect(textOf(el)).toContain("page:1");

    await clickButton(el, "Next");

    expect(el.serializeState().page).toBe(2);
    expect(textOf(el)).toContain("page:2");
    // `$cols` intact — the header and the row count still come from it.
    expect(textOf(el)).toContain("Name");
    expect(textOf(el)).toContain("4 results");
  });

  it("DataGrid: with no `page` binding, paging writes no state atom", async () => {
    const el = await mount(`
      $cols = ${GRID_COLS}
      aktion = DataGrid($cols, { perPage: 2 })
    `);
    const before = el.serializeState().cols;

    await clickButton(el, "Next");

    expect(el.serializeState().cols).toBe(before);
    expect(textOf(el)).toContain("Name");
    expect(textOf(el)).toContain("4 results");
  });

  // ------------------------------------------------------- CommandPalette
  // `CommandPalette(items, open, …)` — `items` is $-bound at slot 0, the
  // dismissal channel is `open` at slot 1.
  const CMD_ITEMS = `[{ label: "Open file", value: "open" }]`;

  it("CommandPalette: dismissing writes `false` into the bound `open` atom", async () => {
    const el = await mount(`
      $cmds = ${CMD_ITEMS}
      $paletteOpen = true
      aktion = Column([
        Text(\`open:\${$paletteOpen}\`),
        CommandPalette($cmds, { open: $paletteOpen }),
      ])
    `);
    expect(all(el, '[role="dialog"]')).toHaveLength(1);

    await clickNode(all(el, '[role="option"]')[0]);

    expect(el.serializeState().paletteOpen).toBe(false);
    expect(all(el, '[role="dialog"]')).toHaveLength(0); // it stayed closed
    // The command list itself is untouched — this is the exact prop the buggy
    // `argMeta.find(...)` lookup used to overwrite with `false`.
    expect(el.serializeState().cmds).toEqual([{ label: "Open file", value: "open" }]);
  });

  it("CommandPalette: with only `onClose`, dismissing writes no state atom", async () => {
    const el = await mount(`
      $cmds = ${CMD_ITEMS}
      $closed = 0
      aktion = Column([
        Text(\`closed:\${$closed}\`),
        CommandPalette($cmds, { onClose: () => $closed = $closed + 1 }),
      ])
    `);
    await clickNode(all(el, '[role="option"]')[0]);

    expect(el.serializeState().closed).toBe(1); // the callback ran
    expect(el.serializeState().cmds).toEqual([{ label: "Open file", value: "open" }]);
  });
});

/* ====================================================================== *
 * 3. Path-level reactivity
 * ====================================================================== */

describe("Path-level reactivity — nested paths", () => {
  const DEEP = `
    $cfg = { theme: { color: "red", size: 12 }, other: { x: 1 } }
    aktion = Column([
      Button("Size",  () => $cfg.theme.size = 20),
      Button("Other", () => $cfg.other.x = 2),
      Button("Color", () => $cfg.theme.color = "blue"),
      Button("Theme", () => $cfg.theme = { color: "green", size: 30 }),
      Button("All",   () => $cfg = { theme: { color: "black", size: 1 }, other: { x: 9 } }),
      ShowColor(),
    ])
    // Reads the path in its own body, so the component's dependency — not a
    // prop identity comparison — is what decides whether it re-executes.
    function ShowColor() { console.log("render:color") ; return Text(\`color:\${$cfg.theme.color}\`) }
  `;

  it("a reader of $cfg.theme.color ignores sibling leaves and sibling subtrees", async () => {
    const { el, logs } = await mountWithLogs(DEEP);

    await clickButton(el, "Size");   // sibling leaf: cfg.theme.size
    expect(logs).not.toContain("render:color");
    expect(textOf(el)).toContain("color:red");

    await clickButton(el, "Other");  // sibling subtree: cfg.other.x
    expect(logs).not.toContain("render:color");
    expect(textOf(el)).toContain("color:red");
  });

  it("…but wakes for its own leaf, for an intermediate replacement, and for the root", async () => {
    const { el, logs } = await mountWithLogs(DEEP);

    await clickButton(el, "Color");  // exact path
    expect(logs).toContain("render:color");
    expect(textOf(el)).toContain("color:blue");

    logs.length = 0;
    await clickButton(el, "Theme");  // ancestor: cfg.theme replaced wholesale
    expect(logs).toContain("render:color");
    expect(textOf(el)).toContain("color:green");

    logs.length = 0;
    await clickButton(el, "All");    // root atom replaced
    expect(logs).toContain("render:color");
    expect(textOf(el)).toContain("color:black");
  });

  it("matches at dot boundaries — writes to $user never wake a $username reader", async () => {
    const { el, logs } = await mountWithLogs(`
      $user = { name: "Ada" }
      $username = "ada99"
      aktion = Column([
        Button("Rename",  () => $user.name = "Bea"),
        Button("Replace", () => $user = { name: "Cleo" }),
        ShowHandle(),
      ])
      function ShowHandle() { console.log("render:handle") ; return Text(\`handle:\${$username}\`) }
    `);

    await clickButton(el, "Rename");            // changed path "user.name"
    expect(logs).not.toContain("render:handle");
    expect(el.serializeState().user).toEqual({ name: "Bea" }); // the write landed

    await clickButton(el, "Replace");           // changed path "user"
    // "username" merely *starts with* "user"; the overlap rule matches at dot
    // separators, so the handle reader is not a dependent.
    expect(logs).not.toContain("render:handle");
    expect(textOf(el)).toContain("handle:ada99");
    expect(el.serializeState().user).toEqual({ name: "Cleo" });
  });
});

/* ====================================================================== *
 * 4. Per-component memoization
 * ====================================================================== */

describe("Per-component memoization", () => {
  it("memoizes per instance — two calls of one component update independently", async () => {
    const { el, logs } = await mountWithLogs(`
      $left = 1
      $right = 1
      aktion = Column([
        Button("L", () => $left = $left + 1),
        Button("R", () => $right = $right + 1),
        Cell("left", $left),
        Cell("right", $right),
      ])
      function Cell(name, v) { console.log("render:" + name) ; return Text(\`\${name}=\${v}\`) }
    `);

    await clickButton(el, "L");
    expect(logs).toContain("render:left");
    expect(logs).not.toContain("render:right");
    expect(textOf(el)).toContain("left=2");
    expect(textOf(el)).toContain("right=1"); // the skipped instance kept its DOM

    logs.length = 0;
    await clickButton(el, "R");
    expect(logs).toContain("render:right");
    expect(logs).not.toContain("render:left");
    expect(textOf(el)).toContain("left=2");
    expect(textOf(el)).toContain("right=2");
  });

  it("is sound about props: a freshly allocated prop re-runs the child, a $memo-stable one does not", async () => {
    const { el, logs } = await mountWithLogs(`
      aktion = Host()
      function Host() {
        $n = 0
        const stable = $memo(() => ({ tag: "stable" }), [])
        const fresh = { tag: "fresh" }
        return [
          Button("Inc", () => $n = $n + 1),
          Stable(stable),
          Fresh(fresh),
          Text(\`n:\${$n}\`),
        ]
      }
      function Stable(cfg) { console.log("render:stable") ; return Text(cfg.tag) }
      function Fresh(cfg) { console.log("render:fresh") ; return Text(cfg.tag) }
    `);
    expect(textOf(el)).toContain("stable");
    expect(textOf(el)).toContain("fresh");

    await clickButton(el, "Inc");

    expect(textOf(el)).toContain("n:1");
    // `fresh` is a new object identity every render → the child must re-run.
    expect(logs).toContain("render:fresh");
    // `stable` came out of `$memo(..., [])` → identity held → child skipped.
    expect(logs).not.toContain("render:stable");
    expect(textOf(el)).toContain("stable"); // …and its DOM survived the skip
  });
});

/* ====================================================================== *
 * 5. $memo
 * ====================================================================== */

describe("$memo", () => {
  it("with an empty dependency list, computes exactly once across many re-renders", async () => {
    const logs = captureLogs();
    const el = await mount(`
      aktion = Host()
      function Host() {
        $n = 0
        const once = $memo(() => { console.log("compute") ; return 42 }, [])
        return [ Button("Inc", () => $n = $n + 1), Text(\`n:\${$n} once:\${once}\`) ]
      }
    `);
    await clickButton(el, "Inc");
    await clickButton(el, "Inc");
    await clickButton(el, "Inc");

    expect(logs.filter((l) => l === "compute")).toHaveLength(1);
    expect(textOf(el)).toContain("n:3 once:42");
  });
});

/* ====================================================================== *
 * 6. $store
 * ====================================================================== */

describe("$store — global state", () => {
  it("survives a re-render driven by an unrelated $var (the declaration does not re-seed)", async () => {
    const el = await mount(`
      counter = $store({ n: 0, inc: (s) => { s.n = s.n + 1 } })
      $tick = 0
      aktion = Column([
        Button("IncN", () => counter.inc()),
        Button("Tick", () => $tick = $tick + 1),
        Text(\`n:\${counter.n} tick:\${$tick}\`),
      ])
    `);
    await clickButton(el, "IncN");
    await clickButton(el, "IncN");
    expect(textOf(el)).toContain("n:2 tick:0");

    await clickButton(el, "Tick");
    expect(textOf(el)).toContain("n:2 tick:1"); // store value preserved
  });

  it("two stores are independent — mutating one never re-runs a reader of the other", async () => {
    const { el, logs } = await mountWithLogs(`
      counter = $store({ n: 0, inc: (s) => { s.n = s.n + 1 } })
      other = $store({ m: 0, bump: (s) => { s.m = s.m + 1 } })
      aktion = Column([
        Button("IncN", () => counter.inc()),
        Button("IncM", () => other.bump()),
        NView(), MView(),
      ])
      function NView() { console.log("render:n") ; return Text(\`n:\${counter.n}\`) }
      function MView() { console.log("render:m") ; return Text(\`m:\${other.m}\`) }
    `);

    await clickButton(el, "IncN");
    expect(logs).toContain("render:n");
    expect(logs).not.toContain("render:m");
    expect(textOf(el)).toContain("n:1");
    expect(textOf(el)).toContain("m:0");

    logs.length = 0;
    await clickButton(el, "IncM");
    expect(logs).toContain("render:m");
    expect(logs).not.toContain("render:n");
    expect(textOf(el)).toContain("n:1");
    expect(textOf(el)).toContain("m:1");
  });
});

/* ====================================================================== *
 * 7. Computed / derived values
 * ====================================================================== */

describe("Computed derivations", () => {
  it("propagate transitively through a chain on a single write", async () => {
    const el = await mount(`
      $a = 1
      $b = $a * 2
      $c = $b + 1
      aktion = Column([
        Button("SetA", () => $a = 5),
        Text(\`a:\${$a} b:\${$b} c:\${$c}\`),
      ])
    `);
    expect(textOf(el)).toContain("a:1 b:2 c:3");

    await clickButton(el, "SetA");
    // `$b` re-derives from `$a`, then `$c` re-derives from `$b` — one click.
    expect(textOf(el)).toContain("a:5 b:10 c:11");
  });

  it("re-derive when the source collection is mutated", async () => {
    const el = await mount(`
      $cart = [{ price: 10 }, { price: 5 }]
      $total = $util.sum($cart.price)
      aktion = Column([
        Button("Add", () => $cart = [...$cart, { price: 2 }]),
        Text(\`items:\${$cart.length} total:\${$total}\`),
      ])
    `);
    expect(textOf(el)).toContain("items:2 total:15");

    await clickButton(el, "Add");
    expect(textOf(el)).toContain("items:3 total:17");
  });
});

/* ====================================================================== *
 * 8. Array mutation through state
 * ====================================================================== */

describe("Array mutation through state", () => {
  const LIST = `
    $items = [{ label: "a", done: false }, { label: "b", done: false }]
    aktion = Column([
      Button("Add",    () => $items = [...$items, { label: "c", done: false }]),
      Button("Finish", () => $items[1].done = true),
      Button("Drop",   () => $items = $items.filter(i => i.label != "a")),
      Text(\`n:\${$items.length}\`),
      Column($items.map(i => Text(\`\${i.label}:\${i.done}\`))),
    ])
  `;

  it("appending and filtering re-render the list", async () => {
    const el = await mount(LIST);
    expect(textOf(el)).toContain("n:2");
    expect(textOf(el)).toContain("a:false");
    expect(textOf(el)).toContain("b:false");

    await clickButton(el, "Add");
    expect(textOf(el)).toContain("n:3");
    expect(textOf(el)).toContain("c:false");

    await clickButton(el, "Drop");
    expect(textOf(el)).toContain("n:2");
    expect(textOf(el)).not.toContain("a:false");
    expect(textOf(el)).toContain("b:false");
  });

  it("writing one element's field leaves its siblings, the order, and the length alone", async () => {
    const el = await mount(LIST);
    await clickButton(el, "Finish");

    expect(textOf(el)).toContain("n:2");
    expect(el.serializeState().items).toEqual([
      { label: "a", done: false },
      { label: "b", done: true },
    ]);
    // Rendered in the same order, with only row `b` flipped.
    const rows = (textOf(el).match(/[abc]:(true|false)/g) ?? []);
    expect(rows).toEqual(["a:false", "b:true"]);
  });
});

/* ====================================================================== *
 * 9 & 10. useInstanceState / registerDisposer (library-component contract)
 * ====================================================================== */

describe("useInstanceState", () => {
  // Two structurally IDENTICAL tab strips: same tab ids, same labels. A slot
  // keyed by anything other than the instance path would let one strip's active
  // pane drive the other.
  const STRIP = `Tabs([TabItem("a", "Alpha", [Text("pane A")]), TabItem("b", "Beta", [Text("pane B")])])`;
  const TWO_TABS = `
    $tick = 0
    aktion = Column([
      Button("Tick", () => $tick = $tick + 1),
      Text(\`tick:\${$tick}\`),
      ${STRIP},
      ${STRIP},
    ])
  `;

  it("persists across a re-render driven by unrelated state", async () => {
    const el = await mount(TWO_TABS);
    expect(selectedTabPerStrip(el)).toEqual(["Alpha", "Alpha"]);

    await clickNode(tabsInStrip(el, 0)[1]); // activate Beta in the first strip
    expect(selectedTabPerStrip(el)).toEqual(["Beta", "Alpha"]);

    await clickButton(el, "Tick"); // unrelated atom re-renders the whole tree
    expect(textOf(el)).toContain("tick:1");
    expect(selectedTabPerStrip(el)).toEqual(["Beta", "Alpha"]); // no snap-back
  });

  it("is per instance — sibling instances of one component keep separate slots", async () => {
    const el = await mount(TWO_TABS);
    await clickNode(tabsInStrip(el, 1)[1]); // activate Beta in the SECOND strip
    // Re-render from unrelated state so both strips are rebuilt from their
    // slots: a shared slot would drag the first strip along.
    await clickButton(el, "Tick");
    expect(selectedTabPerStrip(el)).toEqual(["Alpha", "Beta"]);

    await clickNode(tabsInStrip(el, 0)[1]); // now the first one too
    await clickButton(el, "Tick");
    expect(selectedTabPerStrip(el)).toEqual(["Beta", "Beta"]);
  });

  it("is dropped when the instance unmounts — a remount starts from the initial value", async () => {
    const el = await mount(`
      $visible = true
      aktion = Column([
        Button("Toggle", () => $visible = !$visible),
        Show($visible, [Tabs([TabItem("a", "Alpha", [Text("pane A")]), TabItem("b", "Beta", [Text("pane B")])])]),
      ])
    `);
    await clickNode(all(el, '[role="tab"]')[1]);
    expect(selectedTabs(el)).toEqual(["Beta"]);

    await clickButton(el, "Toggle");                 // unmount
    expect(all(el, '[role="tab"]')).toHaveLength(0);

    await clickButton(el, "Toggle");                 // remount
    expect(tabLabels(el)).toEqual(["Alpha", "Beta"]);
    expect(selectedTabs(el)).toEqual(["Alpha"]);     // fresh instance, default pane
  });
});

describe("registerDisposer", () => {
  /**
   * A probe component that registers three kinds of cleanup per render:
   *   - `"stable"` — same key, same function identity every render;
   *   - `"keyed"`  — same key, a NEW closure every render;
   *   - anonymous  — no key, a new closure every render.
   * Every disposal appends to `events`, so the test can count them exactly.
   */
  function probeSpec(events: string[]): { spec: ComponentSpec; renders: () => number } {
    let renders = 0;
    const stable = (): void => { events.push("stable"); };
    const spec: ComponentSpec = {
      name: "Probe",
      description: "Test-only probe that registers disposers.",
      props: [{ name: "label", type: "string", optional: true }],
      render: (_node, props, helpers) => {
        renders += 1;
        const generation = renders;
        helpers.registerDisposer(stable, "stable");
        helpers.registerDisposer(() => events.push(`keyed:${generation}`), "keyed");
        helpers.registerDisposer(() => events.push(`anon:${generation}`));
        const host = document.createElement("div");
        host.textContent = `probe:${String(props.label ?? "")}`;
        return host;
      },
    };
    return { spec, renders: () => renders };
  }

  const PROBE_PROGRAM = `
    $n = 0
    $visible = true
    aktion = Column([
      Button("Bump", () => $n = $n + 1),
      Button("Toggle", () => $visible = !$visible),
      Show($visible, [Probe(\`v\${$n}\`)]),
    ])
  `;

  async function mountProbe(events: string[]): Promise<{ el: AktionEl; renders: () => number }> {
    const { spec, renders } = probeSpec(events);
    const el = create();
    el.registerComponents([spec]);
    el.setResponse(PROBE_PROGRAM);
    await settle();
    return { el, renders };
  }

  it("a stable keyed disposer never runs while the instance is alive, and runs exactly once on unmount", async () => {
    const events: string[] = [];
    const { el, renders } = await mountProbe(events);

    await clickButton(el, "Bump");
    await clickButton(el, "Bump");
    expect(renders()).toBeGreaterThan(1);              // it really did re-render
    expect(events.filter((e) => e === "stable")).toEqual([]); // …without disposing

    await clickButton(el, "Toggle");                   // unmount
    expect(textOf(el)).not.toContain("probe:");
    expect(events.filter((e) => e === "stable")).toEqual(["stable"]); // exactly once
  });

  it("re-registering a key with a new identity disposes the previous generation exactly once", async () => {
    const events: string[] = [];
    const { el } = await mountProbe(events);

    await clickButton(el, "Bump");
    expect(events.filter((e) => e.startsWith("keyed:"))).toEqual(["keyed:1"]);

    await clickButton(el, "Bump");
    expect(events.filter((e) => e.startsWith("keyed:"))).toEqual(["keyed:1", "keyed:2"]);

    await clickButton(el, "Toggle"); // unmount disposes the live generation
    const keyed = events.filter((e) => e.startsWith("keyed:"));
    expect(keyed).toEqual([...new Set(keyed)]);        // never disposed twice
    expect(keyed.at(-1)).toMatch(/^keyed:\d+$/);
    expect(events.filter((e) => e === keyed.at(-1))).toHaveLength(1);
  });

  it("an anonymous disposer is replaced per render, not accumulated", async () => {
    const events: string[] = [];
    const { el, renders } = await mountProbe(events);

    await clickButton(el, "Bump");
    await clickButton(el, "Bump");
    // Each re-render retires the previous generation immediately, so exactly
    // one anonymous closure is live at any time. Accumulating them (one live
    // closure per render, all fired at unmount) is the regression.
    const duringLife = events.filter((e) => e.startsWith("anon:"));
    expect(duringLife).toEqual(["anon:1", "anon:2"]);

    await clickButton(el, "Toggle"); // unmount retires the last one
    const afterUnmount = events.filter((e) => e.startsWith("anon:"));
    expect(afterUnmount).toHaveLength(renders());
    expect(afterUnmount).toEqual([...new Set(afterUnmount)]); // each ran once
  });

  it("re-registers after a remount, so the next unmount disposes again", async () => {
    const events: string[] = [];
    const { el } = await mountProbe(events);

    await clickButton(el, "Toggle"); // unmount → 1st dispose
    expect(events.filter((e) => e === "stable")).toHaveLength(1);

    await clickButton(el, "Toggle"); // remount
    expect(textOf(el)).toContain("probe:");
    expect(events.filter((e) => e === "stable")).toHaveLength(1); // still just the one

    await clickButton(el, "Toggle"); // unmount again → 2nd dispose
    expect(events.filter((e) => e === "stable")).toHaveLength(2);
  });
});
