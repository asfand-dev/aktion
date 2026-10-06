/**
 * The hidden form field of a `name`d DrawingCanvas / SignaturePad.
 *
 *   - SignaturePad's field took the raw PNG after every stroke, so a pad that
 *     only received taps — no signature — submitted a non-empty data URL, while
 *     `onChange`, `onBlur` and `onFocus` all report `""` for it.
 *   - Clear reset the pad but not the field, so both pads went on submitting
 *     the drawing the user had just erased.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, flush, render, type Screen } from "../src/testing/index.js";

// happy-dom has no canvas backend: `toDataURL` returns "". Stand in for a
// browser, where a blank pad still exports a non-empty PNG.
const EXPORT = "data:image/png;base64,EXPORTED";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(EXPORT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function mount(field: string): Promise<Screen> {
  const screen = render(`$app(Form({ fields: [${field}] }))`);
  for (let i = 0; i < 4; i += 1) await flush();
  return screen;
}

const canvasOf = (screen: Screen): HTMLCanvasElement =>
  screen.shadowRoot.querySelector("canvas.rui-canvas-surface") as HTMLCanvasElement;
const submitted = (screen: Screen, name: string): unknown[] =>
  new FormData(screen.shadowRoot.querySelector("form")!).getAll(name);

function tap(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 10, clientY: 10 }));
}

function stroke(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 }));
  canvas.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 40, clientY: 20, buttons: 1, pointerType: "pen" }));
  canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 40, clientY: 20 }));
}

async function clear(screen: Screen): Promise<void> {
  (screen.shadowRoot.querySelector(".rui-canvas-clear") as HTMLButtonElement).click();
  await flush();
}

describe("SignaturePad's form field follows onChange", () => {
  it("submits \"\" for a pad that only received a tap", async () => {
    const screen = await mount(`SignaturePad({ name: "sig" })`);
    tap(canvasOf(screen));
    expect(submitted(screen, "sig")).toEqual([""]);
  });

  it("submits the PNG once the pad holds a stroke", async () => {
    const screen = await mount(`SignaturePad({ name: "sig" })`);
    stroke(canvasOf(screen));
    expect(submitted(screen, "sig")).toEqual([EXPORT]);
  });

  it("submits \"\" again after Clear", async () => {
    const screen = await mount(`SignaturePad({ name: "sig" })`);
    stroke(canvasOf(screen));
    await clear(screen);
    expect(submitted(screen, "sig")).toEqual([""]);
  });
});

describe("DrawingCanvas's form field", () => {
  it("still takes the PNG of any stroke, a dot included", async () => {
    const screen = await mount(`DrawingCanvas({ name: "art" })`);
    tap(canvasOf(screen));
    expect(submitted(screen, "art")).toEqual([EXPORT]);
  });

  it("is emptied by Clear", async () => {
    const screen = await mount(`DrawingCanvas({ name: "art" })`);
    stroke(canvasOf(screen));
    await clear(screen);
    expect(submitted(screen, "art")).toEqual([""]);
  });
});
