/**
 * Heatmap, SignaturePad and Mount: each case is a behaviour the spec
 * documented (or implied) and the renderer did not deliver.
 *
 *   - Heatmap numbered an unlabelled column in its tooltip and `onCellClick`
 *     payload but left the column header blank;
 *   - SignaturePad's `onBlur` / `onFocus` handed over the raw data URL — a
 *     non-empty PNG even for a blank pad — while `onChange` reports `""`;
 *   - a restored signature that took a stray tap was reported as `""`, which a
 *     bound `value` echoed back and wiped the pad;
 *   - Mount never ran `update` when `setup` returned nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => cleanup());

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

/** Let `deferToPaint` (rAF raced against `setTimeout(0)`) run. */
async function paint(): Promise<void> {
  await settle();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await settle();
}

describe("Heatmap without labels", () => {
  it("numbers the column headers like its tooltip and click payload", async () => {
    const screen = render(`$got = ""
$app(Heatmap({ values: [[1, 2], [3, 4]], onCellClick: (v, x, y) => { $got = x + "," + y } }))`);
    await settle();
    const root = screen.shadowRoot;
    const headers = [...root.querySelectorAll(".rui-heatmap-xlabel")].map((h) => h.textContent);
    const rows = [...root.querySelectorAll(".rui-heatmap-ylabel")].map((h) => h.textContent);
    expect(headers).toEqual(["1", "2"]);
    expect(rows).toEqual(["1", "2"]);
    (root.querySelectorAll(".rui-heatmap-value")[1] as HTMLElement).click();
    await settle();
    expect(screen.state.get("got")).toBe("2,1");
  });

  it("keeps an explicit empty label empty", async () => {
    const screen = render(`$app(Heatmap({ xLabels: ["", "Tue"], values: [[1, 2]] }))`);
    await settle();
    const headers = [...screen.shadowRoot.querySelectorAll(".rui-heatmap-xlabel")].map((h) => h.textContent);
    expect(headers).toEqual(["", "Tue"]);
  });
});

describe("SignaturePad value reporting", () => {
  // happy-dom has no canvas backend: `toDataURL` returns "" and images never
  // load. Stand in for a browser, where a blank pad still exports a non-empty
  // PNG (measured in Chromium: a 466-character data URL for a blank 100×50).
  const EXPORT = "data:image/png;base64,EXPORTED";

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(EXPORT);
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) { setTimeout(() => this.onload?.(), 0); }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const surface = (root: ShadowRoot): HTMLCanvasElement =>
    root.querySelector("canvas.rui-canvas-surface") as HTMLCanvasElement;

  it("onBlur / onFocus report \"\" for a blank pad, like onChange", async () => {
    const screen = render(`$blur = "unset"
$focus = "unset"
$app(SignaturePad({ onBlur: (v) => { $blur = v }, onFocus: (v) => { $focus = v } }))`);
    await paint();
    const canvas = surface(screen.shadowRoot);
    canvas.dispatchEvent(new FocusEvent("focus"));
    canvas.dispatchEvent(new FocusEvent("blur"));
    await settle();
    expect(screen.state.get("focus")).toBe("");
    expect(screen.state.get("blur")).toBe("");
  });

  it("onBlur reports the data URL once the pad holds a restored signature", async () => {
    const screen = render(`$blur = "unset"
$app(SignaturePad({ value: "data:image/png;base64,SIGNED", onBlur: (v) => { $blur = v } }))`);
    await paint();
    await paint();
    surface(screen.shadowRoot).dispatchEvent(new FocusEvent("blur"));
    await settle();
    expect(screen.state.get("blur")).toBe(EXPORT);
  });

  it("a stray tap on a restored signature does not report it as cleared", async () => {
    const screen = render(`$sig = "data:image/png;base64,SIGNED"
$app(SignaturePad({ value: $sig, onChange: (png) => { $sig = png } }))`);
    await paint();
    await paint();
    const canvas = surface(screen.shadowRoot);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 10, clientY: 10 }));
    await paint();
    expect(screen.state.get("sig")).toBe(EXPORT);
  });

  it("a tap alone on an empty pad is still not a signature", async () => {
    const screen = render(`$sig = "unset"
$app(SignaturePad({ onChange: (png) => { $sig = png } }))`);
    await paint();
    const canvas = surface(screen.shadowRoot);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 10, clientY: 10 }));
    await settle();
    expect(screen.state.get("sig")).toBe("");
  });
});

describe("Mount(update:) after a setup that returns nothing", () => {
  it("runs update with an undefined instance and the live host node", async () => {
    const screen = render(`$n = 1
$seen = ""
$app(Column([
  Mount({
    setup: (node) => { $seen = "setup:" + node.tagName.toLowerCase(); return undefined },
    update: (instance, p, node) => { $seen = (instance == null ? "none" : "some") + ":" + p.n + ":" + node.getAttribute("class") },
    props: { n: $n }
  }),
  Button("Inc", { onClick: () => $n = $n + 1 })
]))`);
    await settle();
    expect(screen.state.get("seen")).toBe("setup:div");
    await screen.click("Inc");
    await settle();
    expect(screen.state.get("seen")).toBe("none:2:rui-mount");
  });

  it("still skips update after a setup that threw", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const screen = render(`$n = 1
$updates = 0
$app(Column([
  Mount({
    setup: () => { throw "boom" },
    update: () => { $updates = $updates + 1 },
    props: { n: $n }
  }),
  Button("Inc", { onClick: () => $n = $n + 1 })
]))`);
      await settle();
      await screen.click("Inc");
      await settle();
      expect(screen.state.get("updates")).toBe(0);
    } finally {
      errors.mockRestore();
    }
  });
});
