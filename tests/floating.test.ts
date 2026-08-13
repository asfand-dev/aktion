import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  deferToPaint,
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
