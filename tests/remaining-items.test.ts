/**
 * Tests for the later batch of suggestions-global items:
 *  - XIII.3 Fragment (display:contents grouping, no layout box)
 *  - II.4    Sticky stuck-state (IntersectionObserver → data-stuck)
 *  - II.6    MasonryGrid responsive column reflow
 *  - X.1     RTL via the `dir` attribute on <aktion-app>
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { Sticky } from "../src/library/components/advanced-patterns.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await flush(); };

type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};

describe("Fragment (XIII.3)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("splices siblings into the parent with no wrapper element at all", async () => {
    const el = create();
    el.setResponse(`$app(Grid([Fragment([Text("A"), Text("B")]), Text("C")], { columns: 3 }))`);
    await settle();

    // Fragment now returns a real DocumentFragment rather than a
    // `display: contents` wrapper. The wrapper was the weaker implementation of
    // the same intent: even with no layout box it still matched every `> *` rule
    // the parent aimed at its children (`.rui-grid[data-grid-mode] > *`, the row
    // hugging rules, the mobile column collapse), so those rules landed on the
    // wrapper instead of the nodes they were written for.
    expect(el.shadowRoot?.querySelector(".rui-fragment")).toBeNull();

    // The three texts are now true siblings inside the grid, which is what
    // "groups siblings without a layout box" was always supposed to mean.
    const grid = el.shadowRoot?.querySelector(".rui-grid") as HTMLElement;
    expect(grid).toBeTruthy();
    const texts = [...grid.children].filter((c) => (c.textContent ?? "").trim());
    expect(texts.map((c) => c.textContent?.trim())).toEqual(["A", "B", "C"]);
  });

  it("lets a user component return multiple nodes via Fragment", async () => {
    const el = create();
    el.setResponse(`function Pair() { return Fragment([Badge("x"), Badge("y")]) }
$app(Row([Pair()]))`);
    await settle();
    const badges = el.shadowRoot?.querySelectorAll(".rui-badge");
    expect(badges?.length).toBe(2);
  });
});

describe("Sticky stuck-state (II.4)", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("registers an IntersectionObserver and flips data-stuck on pin", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let capturedCb: ((entries: Array<{ intersectionRatio: number }>) => void) | null = null;
    const FakeObserver = vi.fn().mockImplementation((cb: typeof capturedCb) => {
      capturedCb = cb;
      return { observe, disconnect, unobserve: vi.fn(), takeRecords: () => [] };
    });
    const original = globalThis.IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      FakeObserver as unknown as typeof IntersectionObserver;
    vi.useFakeTimers();
    try {
      // Two changes to this harness, both forced by the audit fix rather than by
      // a change of intent:
      //
      // 1. `useInstanceState` is now required. The stuck flag has to survive a
      //    re-render — morph strips attributes the fresh node omits, and the
      //    observer only fires on a *change*, so a flag kept only on the DOM
      //    node never recovers after an unrelated re-render.
      // 2. The node must be mounted. Sticky now attaches its observer only to a
      //    connected node, because attaching to the freshly-rendered (discarded)
      //    one and registering the same disposer key tore down the observer
      //    watching the live node — killing the feature permanently after the
      //    first re-render. A detached target also receives an initial callback
      //    with ratio 0 in real browsers, which would write a false "unstuck".
      const slots = new Map<string, unknown>();
      const node = Sticky.render(
        { type: "Component", name: "Sticky", props: {}, children: [] } as never,
        { children: [], offset: "8px" },
        {
          renderNode: () => document.createTextNode(""),
          registerDisposer: () => {},
          useInstanceState: <T,>(key: string, initial: T) => {
            if (!slots.has(key)) slots.set(key, initial);
            return { get: () => slots.get(key) as T, set: (v: T) => slots.set(key, v) };
          },
        } as never,
      ) as HTMLElement;
      document.body.appendChild(node);
      vi.runAllTimers();
      expect(FakeObserver).toHaveBeenCalledTimes(1);
      expect(observe).toHaveBeenCalledWith(node);
      // Simulate the bar pinning (ratio < 1) and unpinning (ratio === 1).
      capturedCb?.([{ intersectionRatio: 0.4 }]);
      expect(node.getAttribute("data-stuck")).toBe("true");
      capturedCb?.([{ intersectionRatio: 1 }]);
      expect(node.getAttribute("data-stuck")).toBe("false");
    } finally {
      vi.useRealTimers();
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = original;
    }
  });
});

describe("MasonryGrid responsive (II.6)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("renders a column-based masonry with the requested column count", async () => {
    const el = create();
    el.setResponse(`$app(MasonryGrid([Card([Text("1")]), Card([Text("2")]), Card([Text("3")])], { columns: 4, gap: "l" }))`);
    await settle();
    const grid = el.shadowRoot?.querySelector(".rui-masonry-grid") as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.getAttribute("data-columns")).toBe("4");
    expect(grid.getAttribute("data-gap")).toBe("lg");
    expect(grid.querySelectorAll(".rui-card").length).toBe(3);
  });
});

describe("RTL via dir attribute (X.1)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("reflects dir=rtl onto the render root and clears it when removed", async () => {
    const el = create();
    el.setAttribute("dir", "rtl");
    el.setResponse(`$app(Text("שלום"))`);
    await settle();
    const root = el.shadowRoot?.querySelector(".rui-root") as HTMLElement;
    expect(root.getAttribute("dir")).toBe("rtl");

    el.setAttribute("dir", "ltr");
    expect(root.getAttribute("dir")).toBe("ltr");

    el.removeAttribute("dir");
    expect(root.hasAttribute("dir")).toBe(false);
  });

  it("ignores an invalid dir value", async () => {
    const el = create();
    el.setAttribute("dir", "sideways");
    el.setResponse(`$app(Text("hi"))`);
    await settle();
    const root = el.shadowRoot?.querySelector(".rui-root") as HTMLElement;
    expect(root.hasAttribute("dir")).toBe(false);
  });
});
