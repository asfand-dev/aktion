/**
 * Tests for using function declarations directly as array-helper
 * callbacks — `[1, 2, 3].map(MyComponent)`, `[...].filter(myAction)`, etc.
 *
 * These exercise three orthogonal fixes:
 *   1. PascalCase component declarations resolve to a synchronous
 *      callable that produces a `UserComponent` node, so
 *      `fruits.map(Fruit)` renders one component per item.
 *   2. camelCase action declarations resolve to a synchronous callable
 *      that runs the body inline (no async runner, no notify per call),
 *      so `fruits.map(fruit)` no longer triggers an infinite render loop.
 *   3. Eager action invocation (`$result = greet("Ada")`) returns the
 *      body's value synchronously instead of a Promise.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

interface ElementWithApi extends HTMLElement {
  setResponse(text: string): void;
  state: { get: (k: string) => unknown };
}

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

const waitForRenders = async (n = 5): Promise<void> => {
  for (let i = 0; i < n; i += 1) await flush();
};

const mount = (): ElementWithApi => {
  const el = document.createElement("aktion-app") as unknown as ElementWithApi;
  document.body.appendChild(el);
  return el;
};

describe("array helpers: pass a function declaration directly", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a PascalCase component when passed as `.map(Fruit)`", async () => {
    const el = mount();
    el.setResponse(`aktion = Grid(fruits.map(Fruit))
function Fruit(name) { return Badge(name) }
fruits = ["Apple", "Banana", "Orange"]`);
    await waitForRenders();
    const root = el.shadowRoot!;
    const badges = root.querySelectorAll(".rui-badge");
    expect(badges).toHaveLength(3);
    expect(badges[0]!.textContent).toContain("Apple");
    expect(badges[1]!.textContent).toContain("Banana");
    expect(badges[2]!.textContent).toContain("Orange");
  });

  it("renders a camelCase action when passed as `.map(fruit)` without freezing", async () => {
    const el = mount();
    el.setResponse(`aktion = Grid(fruits.map(fruit))
function fruit(name) { return Badge(name) }
fruits = ["Apple", "Banana", "Orange"]`);
    // Wait long enough that an infinite render loop would have hung us.
    await waitForRenders(20);
    const root = el.shadowRoot!;
    const badges = root.querySelectorAll(".rui-badge");
    expect(badges).toHaveLength(3);
    expect(badges[0]!.textContent).toContain("Apple");
  });

  it("supports `.filter(predicate)` with a camelCase action", async () => {
    const el = mount();
    el.setResponse(`aktion = Grid(fruits.filter(longName).map(fruit))
function longName(name) { return name.length > 5 }
function fruit(name) { return Badge(name) }
fruits = ["Apple", "Banana", "Orange"]`);
    await waitForRenders();
    const badges = el.shadowRoot!.querySelectorAll(".rui-badge");
    expect(badges).toHaveLength(2);
    expect(Array.from(badges).map((b) => b.textContent?.trim())).toEqual([
      "Banana",
      "Orange",
    ]);
  });

  it("eager action call returns the body's value synchronously", async () => {
    const el = mount();
    el.setResponse(`function greet(name) { return "Hello, " + name }
$message = greet("Ada")
aktion = Text($message)`);
    await waitForRenders();
    expect(el.state.get("message")).toBe("Hello, Ada");
  });

  it("supports passing a component declaration to a custom helper", async () => {
    const el = mount();
    el.setResponse(`function Fruit(name) { return Badge(name) }
aktion = Grid(["Apple", "Banana"].map(Fruit))`);
    await waitForRenders();
    const badges = el.shadowRoot!.querySelectorAll(".rui-badge");
    expect(badges).toHaveLength(2);
  });
});
