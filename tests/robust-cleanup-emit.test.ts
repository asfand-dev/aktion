/**
 * Robustness fixes from feedback §2.5 (cleanup/emit detected by literal callee
 * name) and §2.3 (silent named→positional trailing-object flip).
 *
 * `cleanup` and `$emit` now resolve to real bound functions, so aliasing them
 * keeps working. The trailing-object flip stays behaviourally identical but is
 * surfaced as a strict-mode warning instead of failing silently.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> => new Promise((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
  state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
}

function mount(attrs: Record<string, string> = {}): AktionEl {
  const el = document.createElement("aktion-app") as AktionEl;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("cleanup is robust beyond a literal top-level call (feedback §2.5)", () => {
  it("fires a teardown registered from inside a nested conditional block", async () => {
    const el = mount();
    el.setResponse(`aktion = $on ? Item(name) : Stack([])
function Item(name) {
  $effect(() => {
    if (name) {
      cleanup(() => { $mark = name })
    }
  }, ["mount"])
  return Text(name)
}
$on = true
$mark = ""
name = "Alpha"`);
    await settle();
    expect(el.state.get("mark")).toBe("");
    el.state.set("on", false);
    await settle();
    expect(el.state.get("mark")).toBe("Alpha");
  });
});

describe("$emit survives aliasing (feedback §2.5)", () => {
  it("dispatches a CustomEvent through an aliased `$emit`", async () => {
    const el = mount();
    const events: unknown[] = [];
    el.addEventListener("pinged", (e) => events.push((e as CustomEvent).detail));
    el.setResponse(`function ping() {
  const e = $emit
  e("pinged", { ok: true })
}
$ready = ping()
aktion = Stack([])`);
    await settle();
    expect(events).toEqual([{ ok: true }]);
  });
});

describe("trailing-object strict diagnostic (feedback §2.3)", () => {
  it("warns in strict mode when a trailing object matches no parameter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount({ strict: "" });
    // `Card` declares `title`, but the caller passes `{ heading: ... }` —
    // none of its keys match a param, so it's forwarded positionally.
    el.setResponse(`function Card(title) { return Text(title) }
aktion = Card({ heading: "Hi" })`);
    await settle();
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("positional argument") && m.includes("Card"))).toBe(true);
  });

  it("does not warn without strict mode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount();
    el.setResponse(`function Card(title) { return Text(title) }
aktion = Card({ heading: "Hi" })`);
    await settle();
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("positional argument"))).toBe(false);
  });

  it("does not warn when a key matches a parameter (named-args expansion)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount({ strict: "" });
    el.setResponse(`function Card(title) { return Text(title) }
aktion = Card({ title: "Hi" })`);
    await settle();
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("positional argument"))).toBe(false);
  });
});
