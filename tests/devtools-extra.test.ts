/**
 * Aktion DevTools — the 0.6 tool surface.
 *
 * `devtools.test.ts` covers the original three tabs and the hook contract; this
 * file covers everything added alongside them: the network / route / emit /
 * error event kinds, the inspector half of the app record (component tree,
 * per-instance props and hooks, prop overrides), the expression REPL, the data
 * and theme surfaces, request rules, and the pure modules behind the panel
 * (tree derivation, serialisation, the accessibility audit, the interaction
 * recorder).
 *
 * Everything here runs against a REAL `<aktion-app>`: the point of a debugger
 * is that what it reports matches what the runtime actually did, so a test that
 * asserted against a hand-built record would be testing nothing.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, flush, cleanup } from "../src/testing/index.js";
import { getDevtoolsHook, installDevtoolsHook } from "../src/devtools/hook.js";
import { mountDevtools, type AktionDevtoolsElement } from "../src/devtools/panel.js";
import type {
  DevtoolsEvent,
  EmitEvent,
  ErrorEvent as DevtoolsErrorEvent,
  NetworkEvent,
  RouteEvent,
} from "../src/devtools/protocol.js";
import type { DevtoolsAppRecord } from "../src/devtools/hook.js";
import {
  ancestorsOf, buildInstanceTree, componentNameFromKey, descendantsOf, parentKeyOf,
} from "../src/devtools/tree.js";
import { parseEditedValue, toDevtoolsValue, toJsonText } from "../src/devtools/serialize.js";
import { findMatchingRule, newRule, ruleMatches, verdictFor } from "../src/devtools/rules.js";
import {
  buildTimeline, componentAggregates, emptyModel, ingest, ingestLog, networkStats,
} from "../src/devtools/model.js";
import { auditAccessibility, contrastRatio, groupFindings, parseColor } from "../src/devtools/a11y.js";
import { InteractionRecorder, chooseQuery, generateTest, queryExpression } from "../src/devtools/recorder.js";
import { InspectOverlay, accessibleName, implicitRole, isPanelChrome } from "../src/devtools/overlay.js";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

let unsubscribers: Array<() => void> = [];
let restoreFetch: (() => void) | null = null;

/** Subscribe a collector — also what makes the hook "active". */
function listen(): DevtoolsEvent[] {
  const hook = installDevtoolsHook();
  const events: DevtoolsEvent[] = [];
  unsubscribers.push(hook.subscribe((e) => events.push(e)));
  return events;
}

function currentApp(): DevtoolsAppRecord {
  const app = [...getDevtoolsHook()!.apps.values()].pop();
  if (!app) throw new Error("no app registered with the DevTools hook");
  return app;
}

function instanceKeyFor(app: DevtoolsAppRecord, name: string): string {
  const tree = app.getComponentTree?.() ?? [];
  const node = tree.find((entry) => entry.name === name);
  if (!node) throw new Error(`no instance named ${name} (have: ${tree.map((n) => n.name).join(", ")})`);
  return node.instanceKey;
}

function stubFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const original = (globalThis as { fetch?: typeof fetch }).fetch;
  const mock = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
  (globalThis as { fetch?: typeof fetch }).fetch = mock as unknown as typeof fetch;
  restoreFetch = () => {
    if (original) (globalThis as { fetch?: typeof fetch }).fetch = original;
    else delete (globalThis as { fetch?: typeof fetch }).fetch;
  };
  return mock;
}

/** Pump extra microtask turns for an async resource to settle. */
async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

afterEach(() => {
  for (const u of unsubscribers) u();
  unsubscribers = [];
  cleanup();
  document.querySelectorAll("aktion-devtools").forEach((el) => el.remove());
  document.querySelectorAll("aktion-devtools-overlay").forEach((el) => el.remove());
  const hook = getDevtoolsHook();
  if (hook) {
    hook.apps.clear();
    hook.buffer.length = 0;
    hook.setOptions({
      captureProps: true, tagDom: true, captureSnapshots: true,
      captureNetwork: true, measureDom: true,
    });
  }
  restoreFetch?.();
  restoreFetch = null;
});

/* ========================================================================== */
/*  Protocol — the event kinds added in v2                                     */
/* ========================================================================== */

describe("protocol v2 — commit payload", () => {
  it("carries per-instance props, source positions, a state snapshot, and DOM timings", async () => {
    const events = listen();
    render(`
      $count = 3
      function Row(label) { return Text(\`\${label}:\${$count}\`) }
      $app(Column([Row("A")]))
    `);
    await flush();

    const commit = events.find((e): e is Extract<DevtoolsEvent, { kind: "commit" }> => e.kind === "commit")!;
    expect(commit).toBeTruthy();
    // Time travel needs a snapshot per commit.
    expect(commit.snapshot).toMatchObject({ count: 3 });
    // "The commit took 30ms" is only actionable split by phase.
    expect(typeof commit.morphTime).toBe("number");
    expect(commit.domNodes).toBeGreaterThan(0);

    const row = commit.components.find((c) => c.name === "Row")!;
    expect(row.props?.some((prop) => prop.value.preview === '"A"')).toBe(true);
    expect(row.source?.line).toBeGreaterThan(0);

    // A library component reports its declared prop names, not indices.
    const text = commit.components.find((c) => c.name === "Text")!;
    expect(text.props?.[0]?.name).toBe("value");
  });

  it("omits props and snapshots when the frontend turns that instrumentation off", async () => {
    const events = listen();
    getDevtoolsHook()!.setOptions({ captureProps: false, captureSnapshots: false, measureDom: false });
    render(`$count = 1\n$app(Text(\`\${$count}\`))`);
    await flush();

    const commit = events.find((e): e is Extract<DevtoolsEvent, { kind: "commit" }> => e.kind === "commit")!;
    expect(commit.components.length).toBeGreaterThan(0);
    expect(commit.components[0]!.props).toBeUndefined();
    expect(commit.snapshot).toBeUndefined();
    expect(commit.domNodes).toBeUndefined();
  });
});

describe("protocol v2 — network events", () => {
  it("reports a request's start and success with headers, body, and duration", async () => {
    const events = listen();
    const fetchMock = stubFetch({ items: [1, 2, 3] });
    render(`
      $users = $query({ url: "https://api.example.com/users" })
      $app(Text("loading"))
    `);
    await settle();

    expect(fetchMock).toHaveBeenCalled();
    const net = events.filter((e): e is NetworkEvent => e.kind === "network");
    const start = net.find((e) => e.phase === "start")!;
    const done = net.find((e) => e.phase === "success")!;
    expect(start.url).toContain("/users");
    expect(start.method).toBe("GET");
    expect(done.requestId).toBe(start.requestId);
    expect(done.status).toBe(200);
    expect(done.responseBody).toContain("items");
    expect(typeof done.duration).toBe("number");
  });

  it("mocks a matching request from a DevTools rule without touching the network", async () => {
    listen();
    const fetchMock = stubFetch({ real: true });
    // The element registers with the hook synchronously on connect, so a rule
    // installed here is in place before the query fires on the next tick.
    render(`
      $users = $query({ url: "https://api.example.com/users" })
      $app(Text("loading"))
    `);
    const app = currentApp();
    app.setNetworkRules!([
      newRule({ pattern: "/users", action: "mock", status: 201, body: JSON.stringify({ mocked: true }), label: "users-mock" }),
    ]);
    await settle();

    // The rule answered it: the network was never touched, and the resource
    // holds the canned body.
    expect(fetchMock).not.toHaveBeenCalled();
    const query = app.getQueries!()[0]!;
    expect(query.status).toBe(201);
    expect(query.data.preview).toContain("mocked");
  });

  it("fails a matching request when the rule says offline", async () => {
    const events = listen();
    stubFetch({ real: true });
    render(`
      $users = $query({ url: "https://api.example.com/users" })
      $app(Text("loading"))
    `);
    const app = currentApp();
    app.setNetworkRules!([newRule({ pattern: "*", action: "offline", label: "offline" })]);
    await settle();

    const blocked = events.filter((e): e is NetworkEvent => e.kind === "network").filter((e) => e.phase === "blocked");
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]!.rule).toBe("offline");
    // The program sees a normal transport failure, so its error path runs.
    expect(app.getQueries!()[0]!.error).toBeTruthy();
  });
});

describe("protocol v2 — route, emit, and error events", () => {
  it("reports navigations with the pattern and params that matched", async () => {
    const events = listen();
    const screen = render(`
      $app($router({
        "/": Text("home"),
        "/orders/:id": Text("order"),
        default: Text("missing")
      }))
    `);
    await flush();
    await screen.navigate("/orders/42");
    await flush();

    const route = events.filter((e): e is RouteEvent => e.kind === "route").pop()!;
    expect(route.to).toBe("/orders/42");
    expect(route.pattern).toBe("/orders/:id");
    expect(route.params).toMatchObject({ id: "42" });
  });

  it("reports custom events the program emits", async () => {
    const events = listen();
    const screen = render(`
      $app(Button("ping", { onClick: () => $emit("pinged", { at: 1 }) }))
    `);
    await flush();
    await screen.click("ping");
    await flush();

    const emitted = events.filter((e): e is EmitEvent => e.kind === "emit");
    expect(emitted.length).toBe(1);
    expect(emitted[0]!.name).toBe("pinged");
    expect(emitted[0]!.detail.preview).toContain("at");
  });

  it("reports a plan error the app survived", async () => {
    const events = listen();
    // Nine positional arguments to a five-prop component: a schema error the
    // program survives (it still renders) but that a debugger must surface.
    render(`$app(Text(1, 2, 3, 4, 5, 6, 7, 8, 9))`);
    await flush();

    const reported = events.filter((e): e is DevtoolsErrorEvent => e.kind === "error");
    expect(reported.length).toBeGreaterThan(0);
    expect(reported[0]!.phase).toBe("plan");
  });
});

/* ========================================================================== */
/*  App record — the inspector                                                 */
/* ========================================================================== */

describe("app record — component tree", () => {
  it("derives a parented tree from the last commit", async () => {
    listen();
    render(`
      function Row(label) { return Text(label) }
      $app(Column([Row("A"), Row("B")]))
    `);
    await flush();

    const app = currentApp();
    const tree = app.getComponentTree!();
    const column = tree.find((node) => node.name === "Column")!;
    const rows = tree.filter((node) => node.name === "Row");
    expect(rows.length).toBe(2);
    // Both Rows hang off the Column, and each owns the Text it returns.
    for (const row of rows) {
      expect(row.parentKey).toBe(column.instanceKey);
      expect(row.kind).toBe("user");
      const text = tree.find((node) => node.parentKey === row.instanceKey);
      expect(text?.name).toBe("Text");
    }
    // The tree is ordered parents-before-children, so a flat render reads right.
    expect(tree.indexOf(column)).toBeLessThan(tree.indexOf(rows[0]!));
  });

  it("maps a DOM node back to the instance that rendered it, and back again", async () => {
    listen();
    const screen = render(`$app(Button("save", { onClick: () => 1 }))`);
    await flush();

    const app = currentApp();
    const button = screen.container.shadowRoot!.querySelector("button")!;
    const key = app.instanceForNode!(button);
    expect(key).toBeTruthy();
    expect(componentNameFromKey(key!)).toBe("Button");
    // …and the reverse lookup lands on the same node.
    expect(app.nodeForInstance!(key!)).toBe(button);
  });

  it("stops tagging the DOM when the frontend turns tagging off", async () => {
    listen();
    getDevtoolsHook()!.setOptions({ tagDom: false });
    const screen = render(`$app(Button("save", { onClick: () => 1 }))`);
    await flush();
    expect(screen.container.shadowRoot!.querySelector("[data-aktion-instance]")).toBeNull();
  });
});

describe("app record — instance detail", () => {
  it("reports props, deps, ancestors, and DOM for one instance", async () => {
    listen();
    render(`
      $label = "hello"
      function Row(text) { return Text(text) }
      $app(Column([Row($label)]))
    `);
    await flush();

    const app = currentApp();
    const detail = app.getInstance!(instanceKeyFor(app, "Row"))!;
    expect(detail.name).toBe("Row");
    expect(detail.kind).toBe("user");
    expect(detail.props.some((prop) => prop.value.preview === '"hello"')).toBe(true);
    expect(detail.ancestors.length).toBeGreaterThan(0);
    expect(detail.mounted).toBe(true);
    expect(detail.html).toContain("hello");
  });

  it("flags a $-bound prop with the reactive path it is bound to", async () => {
    listen();
    render(`
      $name = "Ada"
      $app(Input({ value: $name, label: "Name" }))
    `);
    await flush();

    const app = currentApp();
    const detail = app.getInstance!(instanceKeyFor(app, "Input"))!;
    const bound = detail.props.find((prop) => prop.stateRef !== undefined);
    expect(bound?.stateRef).toBe("name");
  });

  it("exposes and writes a library component's own UI state", async () => {
    listen();
    const screen = render(`
      $app(Tabs([
        TabItem("one", "One", Text("first")),
        TabItem("two", "Two", Text("second"))
      ]))
    `);
    await flush();

    const app = currentApp();
    const key = instanceKeyFor(app, "Tabs");
    const slots = app.getInstance!(key)!.uiState;
    expect(slots.length).toBeGreaterThan(0);

    // Switching the active pane through DevTools re-renders the app for real.
    // The slot holds the active tab VALUE, not an index.
    expect(slots.some((slot) => slot.key === "activeTab")).toBe(true);
    expect(app.setInstanceUiState!(key, "activeTab", "two")).toBe(true);
    await flush();
    expect(screen.html()).toContain("second");
    // An unknown slot is refused rather than silently created.
    expect(app.setInstanceUiState!(key, "not-a-slot", 1)).toBe(false);
  });

  it("reads and writes a component's per-instance $state hook cells", async () => {
    listen();
    const screen = render(`
      function Counter() {
        const [count, setCount] = $state(1)
        return Text(\`n=\${count}\`)
      }
      $app(Counter())
    `);
    await flush();

    const app = currentApp();
    const key = instanceKeyFor(app, "Counter");
    const hooks = app.getInstance!(key)!.hooks;
    expect(hooks.length).toBe(1);
    expect(hooks[0]!.kind).toBe("state");
    expect(hooks[0]!.value.preview).toBe("1");
    expect(hooks[0]!.editable).toBe(true);

    expect(app.setInstanceHook!(key, 0, 42)).toBe(true);
    await flush();
    expect(screen.html()).toContain("n=42");
    // A slot that does not exist is refused.
    expect(app.setInstanceHook!(key, 7, 1)).toBe(false);
  });
});

describe("app record — prop overrides", () => {
  it("forces a library component's prop until the override is cleared", async () => {
    listen();
    const screen = render(`$app(Text("original"))`);
    await flush();

    const app = currentApp();
    const key = instanceKeyFor(app, "Text");
    app.setPropOverride!(key, "value", "overridden");
    await flush();
    expect(screen.html()).toContain("overridden");
    expect(app.listPropOverrides!()).toHaveLength(1);
    // The detail record flags the prop so the UI can show it is not the program's.
    expect(app.getInstance!(key)!.props.find((p) => p.name === "value")?.overridden).toBe(true);

    app.clearPropOverride!(key, "value");
    await flush();
    expect(screen.html()).toContain("original");
    expect(app.listPropOverrides!()).toHaveLength(0);
  });

  it("forces a user component's parameter, and does not leak into the memo cache", async () => {
    listen();
    const screen = render(`
      $tick = 0
      function Row(label) { return Text(\`\${label}:\${$tick}\`) }
      $app(Column([
        Row("A"),
        Button("tick", { onClick: () => $tick = $tick + 1 })
      ]))
    `);
    await flush();

    const app = currentApp();
    const key = instanceKeyFor(app, "Row");
    app.setPropOverride!(key, "label", "Z");
    await flush();
    expect(screen.html()).toContain("Z:0");

    // A later commit must keep honouring the override…
    await screen.click("tick");
    expect(screen.html()).toContain("Z:1");

    // …and clearing it must restore the authored value, not a cached override.
    app.clearPropOverride!(key);
    await flush();
    await screen.click("tick");
    expect(screen.html()).toContain("A:2");
  });

  it("drops overrides when the program is re-planned", async () => {
    listen();
    const screen = render(`$app(Text("first program"))`);
    await flush();

    const app = currentApp();
    app.setPropOverride!(instanceKeyFor(app, "Text"), "value", "forced");
    await flush();
    expect(screen.html()).toContain("forced");

    // A new program can produce the SAME instance key for a different
    // component, so an override must not survive the swap.
    await screen.rerender(`$app(Text("second program"))`);
    await flush();
    expect(app.listPropOverrides!()).toHaveLength(0);
    expect(screen.html()).toContain("second program");
  });

  it("remounts an instance so its hook state starts over", async () => {
    listen();
    const screen = render(`
      function Counter() {
        const [count, setCount] = $state(0)
        return Button(\`n=\${count}\`, { onClick: () => setCount(count + 1) })
      }
      $app(Counter())
    `);
    await flush();
    await screen.click("n=0");
    expect(screen.html()).toContain("n=1");

    const app = currentApp();
    app.remountInstance!(instanceKeyFor(app, "Counter"));
    await flush();
    expect(screen.html()).toContain("n=0");
  });
});

/* ========================================================================== */
/*  App record — state, effects, data, router, theme                           */
/* ========================================================================== */

describe("app record — reactive state", () => {
  it("describes atoms, marking runtime-owned and derived ones", async () => {
    listen();
    render(`
      $first = "Ada"
      $shout = $first + "!"
      $app(Text($shout))
    `);
    await flush();

    const meta = currentApp().getStateMeta!();
    const byName = new Map(meta.map((entry) => [entry.name, entry]));
    expect(byName.get("route")?.reserved).toBe(true);
    expect(byName.get("first")?.reserved).toBe(false);
    // A `$x = expr` initialiser is re-derived, so an edit to it is temporary —
    // which the inspector has to be able to say.
    expect(byName.get("shout")?.computed).toBe(true);
  });

  it("resets atoms to their declared defaults", async () => {
    listen();
    const screen = render(`$count = 5\n$app(Text(\`\${$count}\`))`);
    await flush();

    const app = currentApp();
    app.setState("count", 99);
    await flush();
    expect(screen.state.get("count")).toBe(99);

    app.resetState!();
    await flush();
    expect(screen.state.get("count")).toBe(5);
  });

  it("evaluates Aktion expressions against the live program scope", async () => {
    listen();
    const screen = render(`
      $count = 4
      $user = { name: "Ada", role: "admin" }
      $app(Text("x"))
    `);
    await flush();
    const app = currentApp();

    expect(app.evaluateExpression!("$count + 1").value?.preview).toBe("5");
    expect(app.evaluateExpression!("$user.name").value?.preview).toBe('"Ada"');
    // An assignment writes through the real reactive path.
    expect(app.evaluateExpression!("$count = 11").ok).toBe(true);
    await flush();
    expect(screen.state.get("count")).toBe(11);
    // A broken expression reports the failure instead of throwing.
    const bad = app.evaluateExpression!("$count +");
    expect(bad.ok).toBe(false);
    expect(typeof bad.error).toBe("string");
  });

  it("analyses a candidate program without mounting it", async () => {
    listen();
    render(`$app(Text("ok"))`);
    await flush();
    const app = currentApp();

    const good = app.analyzeProgram!(`$n = 1\nfunction MyRow() { return Text("x") }\n$app(MyRow())`);
    expect(good.diagnostics).toEqual([]);
    expect(good.ok).toBe(true);
    expect(good.outline.some((entry) => entry.kind === "component" && entry.name === "MyRow")).toBe(true);
    expect(good.outline.some((entry) => entry.kind === "state" && entry.name === "n")).toBe(true);

    const bad = app.analyzeProgram!(`$app(Text(1, 2, 3, 4, 5, 6, 7, 8, 9))`);
    expect(bad.ok).toBe(false);
    expect(bad.diagnostics.length).toBeGreaterThan(0);
  });
});

describe("app record — effects", () => {
  it("lists mounted effects with their triggers, and runs one on demand", async () => {
    listen();
    const screen = render(`
      $count = 0
      $ran = 0
      $effect(() => { $ran = $ran + 1 }, [$count])
      $app(Text(\`\${$ran}\`))
    `);
    await flush();

    const app = currentApp();
    const mounted = app.getEffects!();
    expect(mounted.length).toBe(1);
    expect(mounted[0]!.stateDeps).toContain("count");
    expect(mounted[0]!.triggers).toContain("$count");
    expect(mounted[0]!.source?.line).toBeGreaterThan(0);

    const before = screen.state.get("ran") as number;
    expect(app.runEffect!(mounted[0]!.effectKey)).toBe(true);
    await flush();
    expect(screen.state.get("ran")).toBe(before + 1);
    expect(app.runEffect!("no-such-effect")).toBe(false);
  });
});

describe("app record — data layer", () => {
  it("describes cached queries and can refetch them", async () => {
    listen();
    const fetchMock = stubFetch({ ok: 1 });
    render(`
      $users = $query({ url: "https://api.example.com/users" })
      $app(Text("x"))
    `);
    await settle();

    const app = currentApp();
    const queries = app.getQueries!();
    expect(queries.length).toBe(1);
    expect(queries[0]!.state).toBe("data");
    expect(queries[0]!.loading).toBe(false);
    expect(queries[0]!.data.preview).toContain("ok");

    const calls = fetchMock.mock.calls.length;
    app.refetchQuery!(queries[0]!.key);
    await settle();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it("describes store handles and calls their methods", async () => {
    listen();
    const screen = render(`
      cart = $store({
        items: [],
        add: (s, item) => { s.items = [...s.items, item] },
        clear: (s) => { s.items = [] }
      })
      $app(Text(\`\${cart.items.length} items\`))
    `);
    await flush();

    const app = currentApp();
    const stores = app.getStores!();
    expect(stores.length).toBe(1);
    expect(stores[0]!.flavour).toBe("store");
    expect(stores[0]!.methods).toEqual(["add", "clear"]);

    expect(app.callStoreMethod!(stores[0]!.atom, "add", [{ price: 2 }]).ok).toBe(true);
    await flush();
    expect(screen.html()).toContain("1 items");
    // A method that does not exist is reported, not thrown.
    expect(app.callStoreMethod!(stores[0]!.atom, "nope").ok).toBe(false);
  });
});

describe("app record — router and theme", () => {
  it("reports the current route and the patterns the program declares", async () => {
    listen();
    render(`
      $app($router({
        "/": Text("home"),
        "/about": Text("about"),
        "/orders/:id": Text("order"),
        default: Text("missing")
      }))
    `);
    await flush();

    const app = currentApp();
    const route = app.getRoute!();
    expect(route.declared).toEqual(["/", "/about", "/orders/:id"]);
    expect(route.mode).toBe("hash");
    expect(route.guarded).toBe(false);

    app.navigate!("/about");
    await flush();
    expect(app.getRoute!().path).toBe("/about");
    expect(app.getRoute!().pattern).toBe("/about");
  });

  it("reports resolved theme tokens and applies a live override", async () => {
    listen();
    render(`$app(Text("x"))`);
    await flush();

    const app = currentApp();
    const theme = app.getTheme!();
    expect(theme.name).toBe("light");
    expect(theme.tokens.colorBg).toBeTruthy();
    expect(theme.available).toContain("dark");
    expect(theme.devtoolsOverrides).toEqual([]);

    app.setThemeTokens!({ colorBg: "rgb(1, 2, 3)" });
    await flush();
    const edited = app.getTheme!();
    expect(edited.devtoolsOverrides).toContain("colorBg");
    expect(edited.tokens.colorBg).toBe("rgb(1, 2, 3)");
    expect(app.element.style.getPropertyValue("--rui-color-bg")).toBe("rgb(1, 2, 3)");

    app.clearThemeTokens!();
    await flush();
    expect(app.getTheme!().devtoolsOverrides).toEqual([]);
  });

  it("reports runtime counters", async () => {
    listen();
    render(`
      $count = 1
      $effect(() => {}, ["mount"])
      $app(Column([Text("a"), Text("b")]))
    `);
    await flush();

    const stats = currentApp().getStats!();
    expect(stats.instances).toBeGreaterThan(0);
    expect(stats.domNodes).toBeGreaterThan(stats.elements - 1);
    expect(stats.atoms).toBeGreaterThan(0);
    expect(stats.effects).toBe(1);
    expect(stats.programBytes).toBeGreaterThan(0);
  });
});

/* ========================================================================== */
/*  Pure modules                                                               */
/* ========================================================================== */

describe("highlight overlay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function fixture(): { overlay: InspectOverlay; a: HTMLElement; b: HTMLElement } {
    const host = document.createElement("div");
    host.innerHTML = `<p id="a">first</p><p id="b">second</p>`;
    document.body.appendChild(host);
    return {
      overlay: new InspectOverlay(),
      a: host.querySelector("#a") as HTMLElement,
      b: host.querySelector("#b") as HTMLElement,
    };
  }

  /** The label the overlay currently draws, or `null` when nothing is drawn. */
  function drawnLabel(): string | null {
    const host = document.querySelector("aktion-devtools-overlay");
    const tip = host?.shadowRoot?.querySelector(".tip") as HTMLElement | null;
    if (!tip || tip.style.display === "none") return null;
    return tip.textContent ?? "";
  }

  it("keeps the pinned selection when a hover ends", () => {
    const { overlay, a, b } = fixture();
    overlay.highlight(a, { component: "Alpha" }, true);
    expect(drawnLabel()).toContain("Alpha");

    // Hovering a second element draws it…
    overlay.highlight(b, { component: "Beta" }, false);
    expect(drawnLabel()).toContain("Beta");

    // …and leaving the hover returns to the SELECTION, not to nothing and not
    // to the element that happened to be hovered last.
    overlay.hideHover();
    expect(drawnLabel()).toContain("Alpha");

    overlay.clear();
    expect(drawnLabel()).toBeNull();
    overlay.destroy();
  });

  it("clears when there is no selection to fall back to", () => {
    const { overlay, a } = fixture();
    overlay.highlight(a, {}, false);
    expect(drawnLabel()).not.toBeNull();
    overlay.hideHover();
    expect(drawnLabel()).toBeNull();
    overlay.destroy();
  });

  it("ignores its own chrome so the picker cannot inspect the inspector", () => {
    const { overlay } = fixture();
    const panel = document.createElement("aktion-devtools");
    const inner = document.createElement("div");
    panel.appendChild(inner);
    document.body.appendChild(panel);
    expect(isPanelChrome(inner)).toBe(true);
    expect(isPanelChrome(document.querySelector("#a"))).toBe(false);
    overlay.destroy();
  });
});

describe("tree derivation", () => {
  const keys = new Set([
    "$/0#Page@1:0",
    "$/0#Page@1:0/0#Card@2:2",
    "$/0#Page@1:0/0#Card@2:2>0#Button@3:4",
  ]);

  it("resolves parents only at segment boundaries", () => {
    expect(parentKeyOf("$/0#Page@1:0", keys)).toBeNull();
    expect(parentKeyOf("$/0#Page@1:0/0#Card@2:2", keys)).toBe("$/0#Page@1:0");
    expect(parentKeyOf("$/0#Page@1:0/0#Card@2:2>0#Button@3:4", keys)).toBe("$/0#Page@1:0/0#Card@2:2");
    // A key that merely shares a prefix is not a child.
    expect(parentKeyOf("$/0#Page@1:01", keys)).toBeNull();
  });

  it("lists ancestors root-first and descendants of a subtree", () => {
    expect(ancestorsOf("$/0#Page@1:0/0#Card@2:2>0#Button@3:4", keys))
      .toEqual(["$/0#Page@1:0", "$/0#Page@1:0/0#Card@2:2"]);
    const nodes = buildInstanceTree([...keys].map((key, i) => ({
      instanceKey: key,
      name: componentNameFromKey(key),
      kind: "library" as const,
      phase: "mount" as const,
      selfTime: i,
      depth: i,
      reason: "mounted",
    })));
    expect(descendantsOf("$/0#Page@1:0", nodes)).toHaveLength(2);
    expect(nodes.map((node) => node.depth)).toEqual([0, 1, 2]);
  });

  it("keeps the last record per instance and counts repeats", () => {
    const nodes = buildInstanceTree([
      { instanceKey: "$/0#A@1:0", name: "A", kind: "user", phase: "mount", selfTime: 1, depth: 0, reason: "mounted" },
      { instanceKey: "$/0#A@1:0", name: "A", kind: "user", phase: "update", selfTime: 2, depth: 0, reason: "re-rendered" },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.phase).toBe("update");
    expect(nodes[0]!.renders).toBe(2);
  });
});

describe("value serialisation", () => {
  it("previews values and marks which ones can round-trip", () => {
    expect(toDevtoolsValue("Ada")).toMatchObject({ type: "string", preview: '"Ada"', json: '"Ada"' });
    expect(toDevtoolsValue(42).preview).toBe("42");
    expect(toDevtoolsValue([1, 2, 3])).toMatchObject({ type: "array", size: 3 });
    // A function cannot be written back, so no `json` is offered — that absence
    // is what tells an inspector to render the value read-only.
    expect(toDevtoolsValue(() => 1).json).toBeUndefined();
  });

  it("survives cycles, depth, and getters that throw", () => {
    const cyclic: Record<string, unknown> = { name: "a" };
    cyclic.self = cyclic;
    expect(toJsonText(cyclic)).toContain("[Circular]");

    const hostile = { get boom(): never { throw new Error("nope"); } };
    expect(() => toDevtoolsValue(hostile)).not.toThrow();
    expect(toJsonText(hostile)).toContain("getter threw");
  });

  it("parses an edit as JSON first, then as a bare string", () => {
    expect(parseEditedValue("42")).toBe(42);
    expect(parseEditedValue("true")).toBe(true);
    expect(parseEditedValue("null")).toBeNull();
    expect(parseEditedValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseEditedValue("Ada")).toBe("Ada");
  });
});

describe("network rules", () => {
  it("matches by substring, glob, and method", () => {
    const rule = newRule({ pattern: "/api/todos", action: "delay" });
    expect(ruleMatches(rule, "GET", "https://x.test/api/todos?done=1")).toBe(true);
    expect(ruleMatches(rule, "GET", "https://x.test/api/users")).toBe(false);

    const glob = newRule({ pattern: "*/api/*", action: "fail" });
    expect(ruleMatches(glob, "POST", "https://x.test/api/users")).toBe(true);

    const scoped = newRule({ pattern: "", method: "POST", action: "fail" });
    expect(ruleMatches(scoped, "POST", "https://x.test/anything")).toBe(true);
    expect(ruleMatches(scoped, "GET", "https://x.test/anything")).toBe(false);

    expect(ruleMatches({ ...rule, enabled: false }, "GET", "https://x.test/api/todos")).toBe(false);
  });

  it("returns the first matching rule, and translates it to a verdict", () => {
    const rules = [
      newRule({ id: "a", pattern: "/users", action: "delay", delayMs: 250, enabled: false }),
      newRule({ id: "b", pattern: "/users", action: "mock", status: 503, body: '{"err":1}' }),
    ];
    expect(findMatchingRule(rules, "GET", "/users")!.id).toBe("b");

    const verdict = verdictFor(rules[1]!);
    expect(verdict.response?.status).toBe(503);
    expect(verdict.response?.body).toEqual({ err: 1 });

    // A non-JSON mock body is passed through rather than rejected.
    expect(verdictFor(newRule({ action: "mock", body: "hello" })).response?.body).toBe("hello");
    expect(verdictFor(newRule({ action: "offline" })).error).toContain("offline");
  });
});

describe("derived model", () => {
  it("merges a request's start and terminal events into one row", () => {
    const model = emptyModel();
    const base: Omit<NetworkEvent, "phase"> = {
      kind: "network", appId: "a", requestId: "r1", method: "GET",
      url: "https://x.test/api/items", time: 100,
    };
    ingest(model, { ...base, phase: "start" });
    expect(model.network[0]!.phase).toBe("pending");
    ingest(model, { ...base, phase: "success", time: 150, duration: 50, status: 200, responseSize: 12 });
    expect(model.network).toHaveLength(1);
    expect(model.network[0]).toMatchObject({ phase: "success", status: 200, duration: 50 });

    const stats = networkStats(model.network);
    expect(stats).toMatchObject({ total: 1, pending: 0, failed: 0, bytes: 12 });
  });

  it("synthesises a row when a terminal event arrives without its start", () => {
    const model = emptyModel();
    ingest(model, {
      kind: "network", appId: "a", requestId: "orphan", phase: "error", method: "POST",
      url: "https://x.test/api", time: 200, duration: 20, error: "boom",
    });
    expect(model.network).toHaveLength(1);
    expect(model.network[0]!.error).toBe("boom");
  });

  it("collapses consecutive identical console lines", () => {
    const model = emptyModel();
    for (let i = 0; i < 5; i += 1) {
      ingestLog(model, { level: "log", text: "tick", args: ["tick"], origin: "program", time: i, count: 1 });
    }
    ingestLog(model, { level: "log", text: "other", args: ["other"], origin: "program", time: 6, count: 1 });
    expect(model.logs).toHaveLength(2);
    expect(model.logs[0]!.count).toBe(5);
    expect(model.totals.logs).toBe(6);
  });

  it("does not flash rows replayed from the backfill buffer", () => {
    const model = emptyModel();
    ingest(model, {
      kind: "state", appId: "a", snapshot: { count: 1 }, changedPaths: ["count"], time: 10,
    }, true);
    // Counts still accumulate (that is history) but nothing is marked as
    // just-changed, so opening the panel does not flash minutes-old edits.
    expect(model.changeCounts.get("count")).toBe(1);
    expect(model.changed.has("count")).toBe(false);
  });

  it("interleaves every event kind into one ordered timeline", () => {
    const model = emptyModel();
    ingest(model, {
      kind: "commit", appId: "a", commitId: 0, startTime: 10, duration: 2, changedPaths: [],
      fullRender: true, initial: true, components: [], rendered: 1, memoized: 0,
    });
    ingest(model, {
      kind: "network", appId: "a", requestId: "r", phase: "start", method: "GET",
      url: "https://x.test/api/items", time: 5,
    });
    ingest(model, { kind: "route", appId: "a", from: "/", to: "/next", time: 20 });

    const timeline = buildTimeline(model, new Set(["commit", "network", "route"]));
    expect(timeline.map((entry) => entry.kind)).toEqual(["network", "commit", "route"]);
  });

  it("aggregates components across commits", () => {
    const model = emptyModel();
    const record = (phase: "mount" | "update" | "memo", selfTime: number) => ({
      instanceKey: "$/0#Card@1:0", name: "Card", kind: "user" as const, phase, selfTime,
      depth: 0, reason: "x",
    });
    ingest(model, {
      kind: "commit", appId: "a", commitId: 0, startTime: 0, duration: 1, changedPaths: [],
      fullRender: true, initial: true, components: [record("mount", 4)], rendered: 1, memoized: 0,
    });
    ingest(model, {
      kind: "commit", appId: "a", commitId: 1, startTime: 1, duration: 1, changedPaths: ["x"],
      fullRender: false, initial: false, components: [record("memo", 0)], rendered: 0, memoized: 1,
    });
    const agg = componentAggregates(model.commits)[0]!;
    expect(agg).toMatchObject({ name: "Card", renders: 1, memo: 1, total: 4, max: 4, instances: 1 });
  });
});

/* ========================================================================== */
/*  Accessibility audit                                                        */
/* ========================================================================== */

describe("accessibility audit", () => {
  function fixture(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds an image with no alt and a button with no name", () => {
    const root = fixture(`<img src="/logo.png"><button></button>`);
    const { findings } = auditAccessibility(root);
    const rules = findings.map((finding) => finding.rule);
    expect(rules).toContain("image-alt");
    expect(rules).toContain("button-name");
    // Every finding names the element and the fix.
    expect(findings.every((finding) => finding.help.length > 0)).toBe(true);
  });

  it("distinguishes a missing label from a placeholder-only one", () => {
    const root = fixture(`<input type="text"><input type="text" placeholder="Email">`);
    const rules = auditAccessibility(root).findings.map((finding) => finding.rule);
    expect(rules).toContain("form-field-label");
    expect(rules).toContain("label-placeholder-only");
  });

  it("reports duplicate ids, dangling ARIA references, and a heading gap", () => {
    const root = fixture(`
      <h2>Two</h2><h4>Four</h4>
      <div id="dup"></div><div id="dup"></div>
      <div aria-labelledby="missing-id">x</div>
    `);
    const rules = auditAccessibility(root).findings.map((finding) => finding.rule);
    expect(rules).toContain("duplicate-id");
    expect(rules).toContain("aria-dangling-reference");
    expect(rules).toContain("heading-order");
  });

  it("reports focusable content inside aria-hidden, and a positive tabindex", () => {
    const root = fixture(`
      <div aria-hidden="true"><button>Hidden</button></div>
      <a href="#x" tabindex="3">Jump</a>
    `);
    const rules = auditAccessibility(root).findings.map((finding) => finding.rule);
    expect(rules).toContain("aria-hidden-focus");
    expect(rules).toContain("tabindex-positive");
  });

  it("groups findings by rule, worst impact first", () => {
    const root = fixture(`<img src="a.png"><img src="b.png"><a href="#" tabindex="2">x</a>`);
    const groups = groupFindings(auditAccessibility(root).findings);
    expect(groups[0]!.impact).toBe("critical");
    expect(groups.find((group) => group.rule === "image-alt")!.count).toBe(2);
  });

  it("computes contrast ratios and parses every colour form", () => {
    expect(parseColor("#fff")).toMatchObject({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toMatchObject({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseColor("transparent")!.a).toBe(0);
    expect(parseColor("not-a-colour")).toBeNull();
    // Black on white is the maximum ratio.
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
    expect(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it("audits a real rendered Aktion app", async () => {
    // Two elements sharing an id: `aria-labelledby`, `for`, and anchor links all
    // resolve the FIRST match, so a duplicate silently mis-wires — and it is a
    // finding the library itself cannot prevent.
    render(`$app(Column([Text("a", { id: "dup" }), Text("b", { id: "dup" })]))`);
    await flush();
    const app = currentApp();
    const root = app.getRenderRoot!() as Element;
    const { findings, examined } = auditAccessibility(root);
    expect(examined).toBeGreaterThan(0);
    expect(findings.some((finding) => finding.rule === "duplicate-id")).toBe(true);
  });
});

/* ========================================================================== */
/*  Accessible names and roles                                                 */
/* ========================================================================== */

describe("accessible name resolution", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("follows aria-label, native labels, and text content in priority order", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <button aria-label="Close dialog">×</button>
      <label for="email">Email address</label><input id="email">
      <button>Save changes</button>
      <img src="a.png" alt="A cat">
    `;
    document.body.appendChild(host);
    const [close, , save] = [...host.querySelectorAll("button, input, img")];
    expect(accessibleName(close!)).toBe("Close dialog");
    expect(accessibleName(host.querySelector("input")!)).toBe("Email address");
    expect(accessibleName(save!)).toBe("Save changes");
    expect(accessibleName(host.querySelector("img")!)).toBe("A cat");
  });

  it("knows the implicit roles that matter", () => {
    const host = document.createElement("div");
    host.innerHTML = `<a href="/x">x</a><a>y</a><input type="checkbox"><select></select><h3>h</h3>`;
    document.body.appendChild(host);
    const [link, plain] = [...host.querySelectorAll("a")];
    expect(implicitRole(link!)).toBe("link");
    expect(implicitRole(plain!)).toBeNull();
    expect(implicitRole(host.querySelector("input")!)).toBe("checkbox");
    expect(implicitRole(host.querySelector("select")!)).toBe("combobox");
    expect(implicitRole(host.querySelector("h3")!)).toBe("heading");
  });
});

/* ========================================================================== */
/*  Interaction recorder                                                       */
/* ========================================================================== */

describe("interaction recorder", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("chooses the most robust query available", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <button data-testid="save-btn">Save</button>
      <button>Publish</button>
      <label for="email">Email</label><input id="email">
      <input placeholder="Search">
      <span>plain</span>
    `;
    document.body.appendChild(host);
    const [withTestId, plainButton] = [...host.querySelectorAll("button")];
    expect(chooseQuery(withTestId!)).toMatchObject({ kind: "testid", value: "save-btn" });
    expect(chooseQuery(plainButton!)).toMatchObject({ kind: "role", value: "button", name: "Publish" });
    expect(chooseQuery(host.querySelector("#email")!)).toMatchObject({ kind: "label", value: "Email" });
    expect(chooseQuery(host.querySelector("[placeholder]")!)).toMatchObject({ kind: "placeholder", value: "Search" });
    // Nothing to match on falls back to a selector — and says so.
    // A span with text but no role falls back to a text query…
    expect(chooseQuery(host.querySelector("span")!)).toMatchObject({ kind: "text", value: "plain" });
    // …and only a node with nothing to match on at all falls back to a selector.
    const anonymous = document.createElement("div");
    host.appendChild(anonymous);
    expect(chooseQuery(anonymous).kind).toBe("css");
  });

  it("emits the Testing Library expression for each strategy", () => {
    expect(queryExpression({ kind: "role", value: "button", name: "Save" }))
      .toBe('screen.getByRole("button", { name: "Save" })');
    expect(queryExpression({ kind: "testid", value: "x" })).toBe('screen.getByTestId("x")');
    expect(queryExpression({ kind: "label", value: "Email" })).toBe('screen.getByLabelText("Email")');
  });

  it("records clicks and typing against a live app, coalescing keystrokes", async () => {
    const screen = render(`
      $name = ""
      $app(Column([
        Input({ value: $name, label: "Name" }),
        Button("Save", { onClick: () => 1 })
      ]))
    `);
    await flush();

    const recorder = new InteractionRecorder();
    const root = currentApp().getRenderRoot!() as Element;
    expect(recorder.start(root, () => {})).toBe(true);

    const input = root.querySelector("input")!;
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.value = "Ada L";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    const button = [...root.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Save"))!;
    button.click();
    recorder.stop();

    const steps = recorder.list();
    // One `type` step carrying the final value, then the click.
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ type: "type", value: "Ada L" });
    expect(steps[1]!.type).toBe("click");
    expect(screen.html()).toContain("Save");

    const code = generateTest(steps, { program: "$app(Text(\"x\"))", title: "does the thing" });
    expect(code).toContain('import { render, cleanup } from "aktion-runtime/test"');
    expect(code).toContain("await screen.type(");
    expect(code).toContain("await screen.click(");
    expect(code).toContain('it("does the thing"');
  });

  it("escapes a program containing backticks and interpolation", () => {
    const code = generateTest([], { program: "$app(Text(`n=${$count}`))" });
    expect(code).toContain("\\`n=\\${$count}\\`");
  });

  it("warns in the generated code when a step fell back to a selector", () => {
    const code = generateTest([
      { type: "click", query: { kind: "css", value: "div > span" }, time: 0, label: "click span" },
    ]);
    expect(code).toContain("shadowRoot");
    expect(code).toContain("brittle" in {} ? "" : "NOTE:");
  });

  it("collapses duplicate navigation steps", () => {
    const recorder = new InteractionRecorder();
    const root = document.createElement("div");
    document.body.appendChild(root);
    recorder.start(root, () => {});
    recorder.addStep({ type: "navigate", value: "/next", label: "navigate to /next" });
    recorder.addStep({ type: "navigate", value: "/next", label: "navigate to /next" });
    recorder.stop();
    expect(recorder.list()).toHaveLength(1);
  });
});

/* ========================================================================== */
/*  Panel — every tab renders                                                  */
/* ========================================================================== */

/** Click a tab by label (tabs render an icon glyph before the label). */
function clickTab(el: AktionDevtoolsElement, label: string): void {
  const tabs = [...el.shadowRoot!.querySelectorAll(".tab")] as HTMLElement[];
  const btn = tabs.find((t) => (t.textContent ?? "").includes(label));
  if (!btn) throw new Error(`devtools tab not found: ${label}`);
  btn.click();
}

/** Click a `.filter-chip` sub-view toggle by its exact label. */
function clickChip(el: AktionDevtoolsElement, label: string): void {
  const chips = [...el.shadowRoot!.querySelectorAll(".filter-chip")] as HTMLElement[];
  const btn = chips.find((c) => (c.textContent ?? "").trim() === label);
  if (!btn) throw new Error(`devtools chip not found: ${label}`);
  btn.click();
}

/** Click an `.icon-btn` by its exact label. */
function clickButton(el: AktionDevtoolsElement, label: string): void {
  const buttons = [...el.shadowRoot!.querySelectorAll(".icon-btn")] as HTMLElement[];
  const btn = buttons.find((b) => (b.textContent ?? "").trim() === label);
  if (!btn) throw new Error(`devtools button not found: ${label}`);
  btn.click();
}

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

describe("panel — all tabs", () => {
  const TABS = [
    "Overview", "Inspect", "State", "Profiler", "Effects", "Network",
    "Console", "Routes", "Data", "Theme", "Source", "Test", "Timeline", "Settings",
  ];

  it("renders every tab without throwing", async () => {
    const controller = mountDevtools();
    const screen = render(PANEL_PROGRAM);
    await flush();
    await screen.click("inc");
    await flush();

    for (const label of TABS) {
      clickTab(controller.element, label);
      await flush();
      const text = controller.element.shadowRoot!.textContent ?? "";
      // Every tab renders SOMETHING, and none of them render the crash notice.
      expect(text.length).toBeGreaterThan(50);
      expect(text).not.toContain("hit an error while rendering");
    }
    controller.destroy();
  });

  it("shows the component tree and a selected component's props", async () => {
    const controller = mountDevtools();
    render(PANEL_PROGRAM);
    await flush();

    clickTab(controller.element, "Inspect");
    await flush();
    const shadow = controller.element.shadowRoot!;
    expect(shadow.textContent).toContain("Row");
    expect(shadow.textContent).toContain("Column");

    // Selecting the Row row shows its props, hooks, and DOM panes.
    const rows = [...shadow.querySelectorAll(".ct-row")] as HTMLElement[];
    const rowRow = rows.find((row) => (row.textContent ?? "").includes("Row"))!;
    rowRow.click();
    await flush();
    const detail = shadow.textContent ?? "";
    expect(detail).toContain("Props");
    expect(detail).toContain("label");
    expect(controller.element.getUiState().selectedInstance).toBeTruthy();
    controller.destroy();
  });

  it("edits a prop from the Inspect tab and the app re-renders", async () => {
    const controller = mountDevtools();
    const screen = render(`$app(Text("before"))`);
    await flush();

    clickTab(controller.element, "Inspect");
    await flush();
    const shadow = controller.element.shadowRoot!;
    const textRow = [...shadow.querySelectorAll(".ct-row")].find((row) => (row.textContent ?? "").includes("Text")) as HTMLElement;
    textRow.click();
    await flush();

    // Click the editable value to open the inline editor, then commit.
    const valueSpan = [...shadow.querySelectorAll(".prop-row .v")].find((el) => (el.textContent ?? "").includes("before")) as HTMLElement;
    valueSpan.click();
    const input = shadow.querySelector(".prop-row .edit-input") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = "after";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();

    expect(screen.html()).toContain("after");
    expect(controller.element.shadowRoot!.textContent).toContain("override");
    controller.destroy();
  });

  it("evaluates an expression from the Console tab", async () => {
    const controller = mountDevtools();
    render(`$count = 7\n$app(Text("x"))`);
    await flush();

    clickTab(controller.element, "Console");
    await flush();
    const input = controller.element.shadowRoot!.querySelector(".repl-input") as HTMLInputElement;
    input.value = "$count * 2";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();

    const text = controller.element.shadowRoot!.textContent ?? "";
    expect(text).toContain("$count * 2");
    expect(text).toContain("14");
    controller.destroy();
  });

  it("lists requests in the Network tab and adds a rule", async () => {
    const controller = mountDevtools();
    stubFetch({ items: [] });
    render(`
      $users = $query({ url: "https://api.example.com/users" })
      $app(Text("x"))
    `);
    await settle();

    clickTab(controller.element, "Network");
    await flush();
    expect(controller.element.shadowRoot!.textContent).toContain("/users");

    clickChip(controller.element, "Rules");
    await flush();
    clickButton(controller.element, "＋ Delay");
    await flush();
    expect(controller.element.getUiState().rules).toHaveLength(1);
    expect(currentApp().getNetworkRules!()).toHaveLength(1);
    controller.destroy();
  });

  it("scrubs state history from the State tab", async () => {
    const controller = mountDevtools();
    const screen = render(`
      $count = 0
      $app(Column([Text(\`\${$count}\`), Button("inc", { onClick: () => $count = $count + 1 })]))
    `);
    await flush();
    await screen.click("inc");
    await screen.click("inc");
    await flush();

    clickTab(controller.element, "State");
    await flush();
    const model = controller.element.getModel()!;
    expect(model.history.length).toBeGreaterThan(1);

    // Scrub to the first snapshot: the tree shows the past, read-only.
    const slider = controller.element.shadowRoot!.querySelector(".slider") as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(controller.element.shadowRoot!.textContent).toContain("read-only");
    expect(controller.element.getUiState().timeTravel).toBe(0);

    // Restoring hydrates the old snapshot back into the live store.
    clickButton(controller.element, "Restore this snapshot");
    await flush();
    expect(screen.state.get("count")).toBe(0);
    controller.destroy();
  });

  it("runs the accessibility audit from the Test tab", async () => {
    const controller = mountDevtools();
    render(`$app(Column([Text("a", { id: "dup" }), Text("b", { id: "dup" })]))`);
    await flush();

    clickTab(controller.element, "Test");
    await flush();
    clickChip(controller.element, "A11y");
    await flush();
    clickButton(controller.element, "Run audit");
    await flush();

    const run = controller.element.getUiState().a11yRun;
    expect(run).toBeTruthy();
    expect(run!.findings.some((finding) => finding.rule === "duplicate-id")).toBe(true);
    expect(controller.element.shadowRoot!.textContent).toContain("duplicate-id");
    controller.destroy();
  });

  it("generates a test from recorded steps in the Test tab", async () => {
    const controller = mountDevtools();
    const screen = render(`
      $count = 0
      $app(Column([Text(\`\${$count}\`), Button("inc", { onClick: () => $count = $count + 1 })]))
    `);
    await flush();

    clickTab(controller.element, "Test");
    await flush();
    clickButton(controller.element, "● Record");
    await flush();
    await screen.click("inc");
    await flush();
    clickButton(controller.element, "■ Stop");
    await flush();
    clickButton(controller.element, "Generate test");
    await flush();

    const generated = controller.element.getUiState().generatedTest ?? "";
    expect(generated).toContain("await screen.click(");
    expect(generated).toContain("expect(screen.state.get(\"count\"))");
    controller.destroy();
  });

  it("toggles instrumentation from the Settings tab", async () => {
    const controller = mountDevtools();
    render(`$app(Text("x"))`);
    await flush();

    clickTab(controller.element, "Settings");
    await flush();
    clickChip(controller.element, "Capture props");
    await flush();
    expect(getDevtoolsHook()!.options.captureProps).toBe(false);

    clickChip(controller.element, "Capture props");
    await flush();
    expect(getDevtoolsHook()!.options.captureProps).toBe(true);
    controller.destroy();
  });

  it("exposes a dock mode and a light theme on the host element", async () => {
    const controller = mountDevtools({ dock: "bottom" });
    render(`$app(Text("x"))`);
    await flush();
    expect(controller.element.classList.contains("dock-bottom")).toBe(true);

    controller.element.getUiState().light = true;
    controller.selectTab("overview");
    await flush();
    expect(controller.element.classList.contains("is-light")).toBe(true);
    controller.destroy();
  });

  it("keeps the caret in a filter box across an event-driven re-render", async () => {
    const controller = mountDevtools();
    const screen = render(PANEL_PROGRAM);
    await flush();
    clickTab(controller.element, "State");
    await flush();

    const search = controller.element.shadowRoot!.querySelector(".search") as HTMLInputElement;
    search.focus();
    search.value = "cou";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();

    // A commit arriving mid-typing must not steal focus or the caret.
    await screen.click("inc");
    await flush();
    const active = controller.element.shadowRoot!.activeElement as HTMLInputElement | null;
    expect(active?.classList.contains("search")).toBe(true);
    expect(active?.value).toBe("cou");
    controller.destroy();
  });

  it("survives a tab that throws", async () => {
    const controller = mountDevtools();
    render(`$app(Text("x"))`);
    await flush();

    // Force a failure inside a tab's render by handing it a poisoned model.
    const model = controller.element.getModel()!;
    Object.defineProperty(model, "commits", {
      get() { throw new Error("boom"); },
      configurable: true,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    clickTab(controller.element, "Profiler");
    await flush();

    expect(controller.element.shadowRoot!.textContent).toContain("hit an error while rendering");
    spy.mockRestore();
    controller.destroy();
  });
});
