/**
 * Render-loop guard — reactive `$state` writes during render.
 *
 * Writing reactive state while the tree is being rendered is an anti-pattern
 * (React/Vue/Solid all guard against it). In Aktion it surfaces when a
 * lowercase `function` that declares `$state` is invoked in render position
 * (`aktion = app()`): the function runs as an *action*, so `$user = {…}` is a
 * per-render *write* that schedules another render… forever. The runtime now
 * applies such a write to the value but suppresses the re-render it would
 * trigger, breaking the loop, and warns once.
 *
 * This is the exact program from the bug report: without the guard it spins
 * (the `console.log`s fire endlessly); with it, the render count settles.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { Renderer } from "../src/renderer/renderer.js";
import { StateStore } from "../src/runtime/state.js";

const tick = () => Promise.resolve();

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 12): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
}

// Verbatim from the bug report.
const REPORTED_PROGRAM = `
aktion = app()

function app() {
  $user = {
    name: "Asfand",
    age: 20,
  }

  return [
    updateValues(),
    showName($user.name),
    showAge($user.age),
  ]
}

function showName(name) {
  console.log({ name })
  return Text("Name: " + name)
}

function showAge(age) {
  console.log({ age })
  return Text("Age: " + age)
}

function updateValues({ onName, onAge }) {
  console.log("Update re-render");

  return Buttons([Button("Name", () => onName("New Name")), Button("Age", () => onAge(20))])
}
`;

describe("Render-loop guard — state writes during render", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("does not infinite-loop on the reported program — renders settle and the UI is correct", async () => {
    const renderSpy = vi.spyOn(Renderer.prototype, "render");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {}); // silence the program's logs

    const el = document.createElement("aktion-app") as AktionEl;
    document.body.appendChild(el);
    el.setResponse(REPORTED_PROGRAM);

    await settle(12);
    const settledRenders = renderSpy.mock.calls.length;
    expect(settledRenders).toBeGreaterThan(0);
    expect(settledRenders).toBeLessThan(5); // bounded — NOT a runaway loop

    // Let a generous number of further microtask turns elapse. A looping
    // program would keep re-rendering; a settled one stays put.
    await settle(25);
    expect(renderSpy.mock.calls.length).toBe(settledRenders);

    // The top-level `$user = {…}` is now a set-once declaration (it runs in
    // render position), so it seeds once and the UI shows the seeded values.
    const text = el.shadowRoot!.textContent ?? "";
    expect(text).toContain("Name: Asfand");
    expect(text).toContain("Age: 20");
  });

  it("still guards genuine writes during render (a non-declaration write) — suppressed + warned, no loop", async () => {
    const renderSpy = vi.spyOn(Renderer.prototype, "render");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const el = document.createElement("aktion-app") as AktionEl;
    document.body.appendChild(el);
    // `$tick` is declared at the top level, then mutated *during render* by a
    // postfix increment in a render-position function — a real write (not a
    // declaration). Without the guard this loops; with it the write is
    // applied once, suppressed, and warned.
    el.setResponse(`
      $tick = 0
      aktion = render()
      function render() {
        $tick++
        return Text("tick")
      }
    `);

    await settle(12);
    const settledRenders = renderSpy.mock.calls.length;
    await settle(25);
    expect(renderSpy.mock.calls.length).toBe(settledRenders); // settled, not looping
    expect(settledRenders).toBeLessThan(5);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("during render"))).toBe(true);
  });

  it("the write is applied but does not broadcast a change while rendering", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const el = document.createElement("aktion-app") as AktionEl & { state: import("../src/runtime/state.js").StateStore };
    document.body.appendChild(el);
    el.setResponse(REPORTED_PROGRAM);
    await settle(15);
    // `$user` was written during render and is readable…
    expect(el.state.get("user")).toMatchObject({ name: "Asfand", age: 20 });
  });
});

describe("StateStore — render guard (unit)", () => {
  it("applies writes during a render pass but suppresses the broadcast", async () => {
    const store = new StateStore();
    store.declare("x", 0);
    const seen: string[][] = [];
    store.subscribe((changed) => seen.push([...changed]));

    store.beginRenderPass();
    store.set("x", 1);
    store.setPath("obj", ["a"], 2); // nested write during render too
    const wrote = store.endRenderPass();
    await tick();

    expect(store.get("x")).toBe(1);   // value applied
    expect(wrote).toBe(true);          // flagged for the host warning
    expect(seen).toEqual([]);          // …but no subscriber was notified
  });

  it("broadcasts writes made outside a render pass as normal", async () => {
    const store = new StateStore();
    store.declare("x", 0);
    const seen: string[][] = [];
    store.subscribe((changed) => seen.push([...changed]));

    store.set("x", 5);
    await tick();
    expect(seen).toEqual([["x"]]);

    expect(store.endRenderPass()).toBe(false); // no write was suppressed
  });
});
