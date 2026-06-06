/**
 * Dev/strict mode — the opt-in `strict` attribute on `<aktion-app>` surfaces
 * silent failures (currently: unknown bare identifiers that would otherwise
 * resolve to null) as console warnings. Off by default.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mount(program: string, strict: boolean): Promise<void> {
  const el = document.createElement("aktion-app") as AktionEl;
  if (strict) el.setAttribute("strict", "");
  document.body.appendChild(el);
  el.setResponse(program);
  await settle();
}

describe("strict mode", () => {
  it("warns about an unknown identifier when strict is set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount("$count = 0\n$app(Text(`${couunt}`))", true);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("unknown identifier") && m.includes("couunt"))).toBe(true);
  });

  it("stays silent for the same typo without strict", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount("$count = 0\n$app(Text(`${couunt}`))", false);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("unknown identifier"))).toBe(false);
  });

  it("does not warn for known atoms / components in strict mode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount("$count = 3\n$app(Text(`${$count}`))", true);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("unknown identifier"))).toBe(false);
  });
});
