/**
 * `Lazy(loader, fallback?, children?)` — finished async deferral (feedback
 * §4.4). A pending promise shows the fallback; on resolve the value renders;
 * a synchronous loader value renders immediately.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
  state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
}

function mount(): AktionEl {
  const el = document.createElement("aktion-app") as unknown as AktionEl;
  document.body.appendChild(el);
  return el;
}

/** Rendered UI lives in the element's shadow root, not its light DOM. */
function text(el: AktionEl): string {
  return el.shadowRoot?.textContent ?? "";
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Lazy", () => {
  it("renders a synchronous loader value immediately", async () => {
    const el = mount();
    el.setResponse(`aktion = Lazy(() => Text("ready"), { fallback: Text("loading") })`);
    await settle();
    expect(text(el)).toContain("ready");
    expect(text(el)).not.toContain("loading");
  });

  it("resolves a promise loader to its value", async () => {
    const el = mount();
    el.setResponse(`aktion = Lazy(() => Promise.resolve(Text("loaded!")), { fallback: Text("loading…") })`);
    await settle();
    expect(text(el)).toContain("loaded!");
    expect(text(el)).not.toContain("loading…");
  });

  it("shows the fallback while a promise loader stays pending", async () => {
    const el = mount();
    // A promise that never settles — the fallback must remain visible.
    el.setResponse(`aktion = Lazy(() => new Promise(() => {}), { fallback: Text("loading…") })`);
    await settle();
    expect(text(el)).toContain("loading…");
  });

  it("keeps the fallback when the loader promise rejects", async () => {
    const el = mount();
    el.setResponse(`aktion = Lazy(() => Promise.reject("nope"), { fallback: Text("fallback-shown") })`);
    await settle();
    expect(text(el)).toContain("fallback-shown");
  });

  it("runs the loader once even across re-renders", async () => {
    const el = mount();
    el.setResponse(`$tick = 0
$count = 0
function inc() { $count = $count + 1 }
aktion = Column([
  Lazy(() => { $tick = $tick + 1; return Text("once") }, { fallback: Text("...") }),
  Button("re-render", { onClick: inc })
])`);
    await settle();
    expect(el.state.get("tick")).toBe(1);
    // Force an unrelated re-render; the loader must not run again.
    el.state.set("count", 5);
    await settle();
    expect(el.state.get("tick")).toBe(1);
  });
});
