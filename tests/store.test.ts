/**
 * Global stores — `Store({ ...state, ...methods })`.
 *
 * A store colocates reactive state (non-function entries) with methods
 * (function entries that receive the store handle as `s`). Reads
 * (`store.field`) are fine-grained; writes inside a method (`s.field = …`)
 * are reactive; methods called as `store.method(args)` run the author's
 * function with `s` injected. The handle is an app-global singleton.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { StateStore } from "../src/runtime/state.js";
import { createContext, evaluate, planProgram } from "../src/runtime/evaluator.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary } from "../src/library/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

// ──────────────────────────────────────────────────────────────────────
// Evaluator-level mechanics
// ──────────────────────────────────────────────────────────────────────
describe("Store — mechanics", () => {
  function harness(program: string) {
    const state = new StateStore();
    const ctx = createContext(state, { library: defaultLibrary });
    planProgram(parse(program), ctx);
    return {
      state,
      ctx,
      evalExpr(src: string, tracker?: Set<string>): unknown {
        const sub = parse(`__probe = ${src}`);
        const stmt = sub.statements[0] as { expression: import("../src/parser/types.js").Expression };
        if (tracker) ctx.trackedState = tracker;
        return evaluate(stmt.expression, ctx);
      },
    };
  }

  const CART = `
    cart = $store({
      items: [],
      coupon: "",
      count: (s) => s.items.length,
      total: (s) => $util.sum(s.items.map(i => i.price)),
      add: (s, item) => { s.items = [...s.items, item] },
      setCoupon: (s, c) => { s.coupon = c },
      clear: (s) => { s.items = [] },
    })
    aktion = Text("x")
  `;

  it("reads initial state and computes getter-methods", () => {
    const h = harness(CART);
    expect(h.evalExpr("cart.items")).toEqual([]);
    expect(h.evalExpr("cart.coupon")).toBe("");
    expect(h.evalExpr("cart.count()")).toBe(0);
    expect(h.evalExpr("cart.total()")).toBe(0);
  });

  it("methods mutate state via `s.field = …` and reads reflect it", () => {
    const h = harness(CART);
    h.evalExpr("cart.add({ price: 10 })");
    h.evalExpr("cart.add({ price: 5 })");
    expect(h.evalExpr("cart.count()")).toBe(2);
    expect(h.evalExpr("cart.total()")).toBe(15);
    h.evalExpr("cart.setCoupon(\"SAVE\")");
    expect(h.evalExpr("cart.coupon")).toBe("SAVE");
    h.evalExpr("cart.clear()");
    expect(h.evalExpr("cart.count()")).toBe(0);
  });

  it("is an app-global singleton with reference-stable methods", () => {
    const h = harness(CART);
    expect(h.evalExpr("cart")).toBe(h.evalExpr("cart"));     // same handle
    expect(h.evalExpr("cart.add")).toBe(h.evalExpr("cart.add")); // stable action ref
  });

  it("tracks the precise path a field read subscribes to", () => {
    const h = harness(CART);
    const tracker = new Set<string>();
    h.evalExpr("cart.items", tracker);
    // The store's backing atom + the field — a fine-grained slice subscription.
    expect([...tracker].some((p) => p.endsWith(".items"))).toBe(true);
    expect([...tracker].some((p) => p.endsWith(".coupon"))).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// End-to-end through the custom element
// ──────────────────────────────────────────────────────────────────────
interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
}
function create(): AktionEl {
  const el = document.createElement("aktion-app") as AktionEl;
  document.body.appendChild(el);
  return el;
}
const textOf = (el: AktionEl): string => el.shadowRoot!.textContent ?? "";
async function clickButton(el: AktionEl, label: string): Promise<void> {
  const btn = [...el.shadowRoot!.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").includes(label),
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`No button "${label}"`);
  btn.click();
  await settle();
}

describe("Store — reactivity end-to-end", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  const PROGRAM = `
    cart = $store({
      items: [],
      count: (s) => s.items.length,
      total: (s) => $util.sum(s.items.map(i => i.price)),
      add: (s, item) => { s.items = [...s.items, item] },
      clear: (s) => { s.items = [] },
    })
    function Cart() {
      return Column([
        Text(\`count:\${cart.count()}\`),
        Text(\`total:\${cart.total()}\`),
        Button("Add", { onClick: () => cart.add({ price: 10 }) }),
        Button("Clear", { onClick: () => cart.clear() }),
      ])
    }
    aktion = Cart()
  `;

  it("re-renders when an action mutates store state", async () => {
    const el = create();
    el.setResponse(PROGRAM);
    await settle();
    expect(textOf(el)).toContain("count:0");
    expect(textOf(el)).toContain("total:0");

    await clickButton(el, "Add");
    expect(textOf(el)).toContain("count:1");
    expect(textOf(el)).toContain("total:10");

    await clickButton(el, "Add");
    expect(textOf(el)).toContain("count:2");
    expect(textOf(el)).toContain("total:20");

    await clickButton(el, "Clear");
    expect(textOf(el)).toContain("count:0");
    expect(textOf(el)).toContain("total:0");
  });

  it("shares one global store across components (no prop drilling)", async () => {
    const el = create();
    el.setResponse(`
      cart = $store({ items: [], count: (s) => s.items.length, add: (s) => { s.items = [...s.items, 1] } })
      function Adder() { return Button("Add", { onClick: () => cart.add() }) }
      function Badge() { return Text(\`badge:\${cart.count()}\`) }
      aktion = Column([Adder(), Badge()])
    `);
    await settle();
    expect(textOf(el)).toContain("badge:0");
    await clickButton(el, "Add");
    // The Badge, with no props from Adder, reflects the shared store.
    expect(textOf(el)).toContain("badge:1");
  });

  it("is fine-grained — changing one slice doesn't re-run a component reading another", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => { logs.push(String(a[0])); });
    const el = create();
    el.setResponse(`
      user = $store({
        name: "Ada",
        age: 30,
        setName: (s, n) => { s.name = n },
        setAge: (s, a) => { s.age = a },
      })
      function NameView() { console.log("render:name"); return Text(\`name:\${user.name}\`) }
      function AgeView() { console.log("render:age"); return Text(\`age:\${user.age}\`) }
      function App() {
        return Column([
          NameView(), AgeView(),
          Button("Name", { onClick: () => user.setName("Bob") }),
          Button("Age", { onClick: () => user.setAge(40) }),
        ])
      }
      aktion = App()
    `);
    await settle();
    expect(textOf(el)).toContain("name:Ada");
    expect(textOf(el)).toContain("age:30");

    logs.length = 0;
    await clickButton(el, "Name");
    expect(textOf(el)).toContain("name:Bob");
    expect(logs).toContain("render:name");
    expect(logs).not.toContain("render:age"); // AgeView reads only `user.age` → skipped

    logs.length = 0;
    await clickButton(el, "Age");
    expect(textOf(el)).toContain("age:40");
    expect(logs).toContain("render:age");
    expect(logs).not.toContain("render:name");
  });

  it("supports two-way binding to a store field", async () => {
    const el = create();
    el.setResponse(`
      form = $store({ name: "" })
      function NameForm() {
        return Column([
          Input("name", { value: form.name }),
          Text(\`hello:\${form.name}\`),
        ])
      }
      aktion = NameForm()
    `);
    await settle();
    const input = el.shadowRoot!.getElementById("name") as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(textOf(el)).toContain("hello:Ada");
  });
});
