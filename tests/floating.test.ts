import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  deferToPaint,
  openFloating,
  closeFloating,
  updateFloating,
  isFloating,
  promoteOverlay,
  releaseOverlay,
  OVERLAY_FILL,
  OVERLAY_FILL_CLIP,
  OVERLAY_CORNER,
} from "../src/library/floating.js";

describe("deferToPaint()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the function once via timer when rAF is not available", () => {
    const origRAF = globalThis.requestAnimationFrame;
    // @ts-expect-error testing fallback
    globalThis.requestAnimationFrame = undefined;

    let calls = 0;
    deferToPaint(() => { calls++; });

    vi.advanceTimersByTime(10);
    expect(calls).toBe(1);

    globalThis.requestAnimationFrame = origRAF;
  });

  it("returns a cancel function that prevents execution", () => {
    let calls = 0;
    const cancel = deferToPaint(() => { calls++; });
    cancel();
    vi.advanceTimersByTime(100);
    expect(calls).toBe(0);
  });

  it("runs the function at most once even if both rAF and timer fire", () => {
    let calls = 0;
    deferToPaint(() => { calls++; });
    vi.advanceTimersByTime(100);
    expect(calls).toBe(1);
  });
});

describe("closeFloating()", () => {
  it("is a no-op for null/undefined", () => {
    expect(() => closeFloating(null)).not.toThrow();
    expect(() => closeFloating(undefined)).not.toThrow();
  });

  it("is a no-op for an element that was never opened", () => {
    const el = document.createElement("div");
    expect(() => closeFloating(el)).not.toThrow();
  });
});

describe("updateFloating()", () => {
  it("is a no-op for null/undefined", () => {
    expect(() => updateFloating(null)).not.toThrow();
    expect(() => updateFloating(undefined)).not.toThrow();
  });

  it("is a no-op for a non-floating element", () => {
    const el = document.createElement("div");
    expect(() => updateFloating(el)).not.toThrow();
  });
});

describe("isFloating()", () => {
  it("returns false for null/undefined", () => {
    expect(isFloating(null)).toBe(false);
    expect(isFloating(undefined)).toBe(false);
  });

  it("returns false for a non-floating element", () => {
    const el = document.createElement("div");
    expect(isFloating(el)).toBe(false);
  });
});

describe("overlay constants", () => {
  it("OVERLAY_FILL contains expected styles", () => {
    expect(OVERLAY_FILL).toContain("inset:0");
    expect(OVERLAY_FILL).toContain("background:transparent");
    expect(OVERLAY_FILL).toContain("overflow:visible");
  });

  it("OVERLAY_FILL_CLIP uses overflow:hidden", () => {
    expect(OVERLAY_FILL_CLIP).toContain("overflow:hidden");
  });

  it("OVERLAY_CORNER omits inset", () => {
    expect(OVERLAY_CORNER).not.toContain("inset:0");
    expect(OVERLAY_CORNER).toContain("background:transparent");
  });
});

describe("promoteOverlay()", () => {
  it("returns false when Popover API is unavailable", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const hasShowPopover = typeof (el as unknown as { showPopover?: unknown }).showPopover === "function";
    const result = promoteOverlay(el);

    if (!hasShowPopover) {
      expect(result).toBe(false);
    }

    el.remove();
  });

  it("is idempotent — returns true for already-promoted elements", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.setAttribute("data-floating-side", "overlay");

    expect(promoteOverlay(el)).toBe(true);

    el.remove();
  });
});

describe("releaseOverlay()", () => {
  it("is a no-op for null/undefined", () => {
    expect(() => releaseOverlay(null)).not.toThrow();
    expect(() => releaseOverlay(undefined)).not.toThrow();
  });

  it("is a no-op for a non-promoted element", () => {
    const el = document.createElement("div");
    expect(() => releaseOverlay(el)).not.toThrow();
  });
});

describe("measure() height cap — the oscillation guard", () => {
  /**
   * A panel whose NATURAL height is `natural`, reported through a stubbed
   * `getBoundingClientRect` that honours whatever `max-height` is currently set.
   *
   * That is the whole reproduction: happy-dom does not lay out, so the loop only
   * appears if the fake behaves the way a real browser does — a capped element
   * measures at its cap, an uncapped one at its natural size.
   */
  function panelWithNaturalHeight(natural: number, width = 200): HTMLElement {
    const panel = document.createElement("div");
    panel.getBoundingClientRect = function (this: HTMLElement) {
      const cap = Number.parseFloat(this.style.maxHeight);
      const height = Number.isFinite(cap) ? Math.min(cap, natural) : natural;
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON() { return {}; } } as DOMRect;
    };
    return panel;
  }

  function anchorAt(top: number, height = 20): HTMLElement {
    const anchor = document.createElement("div");
    anchor.getBoundingClientRect = () =>
      ({ x: 0, y: top, top, left: 0, right: 100, bottom: top + height, width: 100, height, toJSON() { return {}; } }) as DOMRect;
    return anchor;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the cap across repeated updates instead of alternating", () => {
    // The shape that produced the bug: 379px of panel, ~333px of room below the
    // anchor. `update()` runs on every scroll, resize and ResizeObserver callback,
    // and the panel shrinking under its own cap FIRES that observer — so the second
    // pass is not hypothetical, it is guaranteed.
    // TALLER THAN THE WHOLE VIEWPORT, so neither side has room and flipping cannot
    // resolve it — the cap is the only answer and is therefore guaranteed to be
    // applied. Sized from `innerHeight` rather than hard-coded so the test states
    // the relationship it depends on instead of a number that holds at one window
    // size. (The real report was narrower — 379px of panel against 333px of room
    // below — but that shape lets `flip` find space above and never reaches the
    // cap in a viewport this tall.)
    const viewport = window.innerHeight;
    expect(viewport).toBeGreaterThan(0);
    const panel = panelWithNaturalHeight(viewport + 100);
    const anchor = anchorAt(Math.round(viewport / 2));
    document.body.append(anchor, panel);

    const handle = openFloating(panel, { anchor, side: "bottom" });

    const capOf = () => panel.style.maxHeight;
    const first = capOf();
    expect(first).not.toBe("");

    // Five more passes, exactly as a live ResizeObserver would drive them. Before
    // the fix these alternated between the cap and "" and never settled; the panel's
    // `top` moved with them, so anything waiting for the element to be stable waited
    // for ever.
    const seen = new Set<string>([first]);
    for (let i = 0; i < 5; i += 1) {
      handle.update();
      seen.add(capOf());
    }

    expect([...seen]).toEqual([first]);
    expect(panel.style.overflowY).toBe("auto");
    handle.close();
  });

  it("still drops a cap that is genuinely no longer needed", () => {
    // The guard must not become "cap once, cap for ever": a panel that fits is not
    // capped, which is what keeps a short menu from growing a pointless scrollbar.
    const panel = panelWithNaturalHeight(120);
    const anchor = anchorAt(100);
    document.body.append(anchor, panel);

    const handle = openFloating(panel, { anchor, side: "bottom" });
    expect(panel.style.maxHeight).toBe("");
    expect(panel.style.overflowY).toBe("");

    handle.update();
    expect(panel.style.maxHeight).toBe("");
    handle.close();
  });

  it("honours an explicit numeric maxHeight on every pass", () => {
    // An author-supplied cap is not the measured one and must survive unchanged —
    // the fix clears the two properties before measuring, so this is the case that
    // proves it re-applies rather than merely not-oscillating.
    const panel = panelWithNaturalHeight(window.innerHeight * 2);
    const anchor = anchorAt(100);
    document.body.append(anchor, panel);

    const handle = openFloating(panel, { anchor, side: "bottom", maxHeight: 240 });
    expect(panel.style.maxHeight).toBe("240px");

    handle.update();
    handle.update();
    expect(panel.style.maxHeight).toBe("240px");
    handle.close();
  });
});

describe("the reparenting fallback — stranded panels", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /**
   * Force the fallback path regardless of what the test engine supports.
   *
   * `supportsPopover()` reads `HTMLElement.prototype.showPopover`, so deleting it
   * for the duration of the test is what selects the branch under test rather than
   * the Popover one. Restored by the caller.
   */
  function withoutPopover<T>(fn: () => T): T {
    const proto = HTMLElement.prototype as unknown as { showPopover?: unknown };
    const had = Object.prototype.hasOwnProperty.call(proto, "showPopover");
    const original = proto.showPopover;
    delete proto.showPopover;
    try {
      return fn();
    } finally {
      if (had) proto.showPopover = original;
    }
  }

  /**
   * A shadow root, because that is the only root `ensureLayer` actually serves.
   *
   * It appends the layer with `root.appendChild(...)`, which on a `Document` puts
   * the node outside `documentElement` where no `document.querySelector` reaches
   * it. Every Aktion program mounts into a shadow root, so that path is the real
   * one and a `document.body` reproduction tests something that never runs.
   */
  function shadowHost(): ShadowRoot {
    const host = document.createElement("div");
    document.body.append(host);
    return host.attachShadow({ mode: "open" });
  }

  it("removes the panel a re-render stranded, instead of accumulating one per open", () => {
    withoutPopover(() => {
      const root = shadowHost();
      const anchor = document.createElement("button");
      root.append(anchor);

      // The component's own subtree. A re-render replaces the panel node inside it
      // while the promoted node is still parented by the layer — which is exactly
      // what leaves the stale one behind.
      const owner = document.createElement("div");
      root.append(owner);

      const makePanel = (): HTMLElement => {
        const panel = document.createElement("div");
        panel.className = "test-panel";
        panel.id = "shared-panel-id";
        owner.append(panel);
        return panel;
      };

      const first = makePanel();
      openFloating(first, { anchor, side: "bottom" });
      const layer = root.querySelector(".rui-layer")!;
      expect(layer).toBeTruthy();
      expect(first.parentNode).toBe(layer);

      // The re-render: a brand-new panel node at the original position, while the
      // first one is still in the layer. Nothing closes the first — the component
      // no longer holds a reference to it.
      const second = makePanel();
      expect(layer.querySelectorAll(".test-panel")).toHaveLength(1);

      openFloating(second, { anchor, side: "bottom" });

      // ONE panel in the layer, not two — and no duplicate `id` in the root.
      expect(layer.querySelectorAll(".test-panel")).toHaveLength(1);
      expect(layer.querySelector(".test-panel")).toBe(second);
      expect(root.querySelectorAll("#shared-panel-id")).toHaveLength(1);
    });
  });

  it("leaves a DIFFERENT anchor's promoted panel alone", () => {
    withoutPopover(() => {
      const root = shadowHost();
      const anchorA = document.createElement("button");
      const anchorB = document.createElement("button");
      root.append(anchorA, anchorB);

      const panelA = document.createElement("div");
      const panelB = document.createElement("div");
      panelA.className = "test-panel";
      panelB.className = "test-panel";
      root.append(panelA, panelB);

      openFloating(panelA, { anchor: anchorA, side: "bottom" });
      openFloating(panelB, { anchor: anchorB, side: "bottom" });

      // Two anchors, two panels: the sweep is keyed on the anchor, so one open must
      // not evict the other. Two comboboxes open at once is unusual, but a tooltip
      // over an open menu is not.
      const layer = root.querySelector(".rui-layer")!;
      expect(layer.querySelectorAll(".test-panel")).toHaveLength(2);
    });
  });
});
