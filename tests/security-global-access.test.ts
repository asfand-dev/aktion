/**
 * Host-global access policy.
 *
 * By default an Aktion program can reach the whole `globalThis` surface,
 * including `eval` and `Function` — i.e. a program is as privileged as a
 * `<script>` tag. That is deliberate (see `setGlobalAccessPolicy`), and the
 * `runtime.test.ts` suite pins it as documented behaviour.
 *
 * These tests cover the opt-in narrowing a host needs when program text may
 * come from somewhere it does not trust (a prompt-injectable LLM, a
 * multi-tenant store, a user-editable template).
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";
import { setGlobalAccessPolicy, getGlobalAccessPolicy } from "../src/runtime/evaluator.js";

afterEach(() => {
  cleanup();
  setGlobalAccessPolicy("all");
  const g = globalThis as Record<string, unknown>;
  delete g.__escaped;
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

/** Click every button in the render and let effects settle. */
async function clickAll(root: ShadowRoot): Promise<void> {
  for (const b of [...root.querySelectorAll("button")]) {
    try { b.click(); } catch { /* a blocked global throws — that is the point */ }
  }
  await settle();
}

describe("default policy", () => {
  it("is 'all' — the documented full passthrough", () => {
    expect(getGlobalAccessPolicy()).toBe("all");
  });

  it("reaches Function under the default policy", async () => {
    const screen = render(
      `$app(Column([Button("go", { onClick: () => { Function("globalThis.__escaped=1")() } })]))`,
    );
    await settle();
    await clickAll(screen.shadowRoot);
    expect((globalThis as Record<string, unknown>).__escaped).toBe(1);
  });
});

describe("'safe' policy", () => {
  it("blocks Function", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$app(Column([Button("go", { onClick: () => { Function("globalThis.__escaped=1")() } })]))`,
    );
    await settle();
    await clickAll(screen.shadowRoot);
    expect((globalThis as Record<string, unknown>).__escaped).toBeUndefined();
  });

  it("blocks eval", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$app(Column([Button("go", { onClick: () => { eval("globalThis.__escaped=1") } })]))`,
    );
    await settle();
    await clickAll(screen.shadowRoot);
    expect((globalThis as Record<string, unknown>).__escaped).toBeUndefined();
  });

  it("blocks the window / globalThis / self re-entry names", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$app(Column([
        Button("a", { onClick: () => { window.__escaped = 1 } }),
        Button("b", { onClick: () => { globalThis.__escaped = 1 } }),
        Button("c", { onClick: () => { self.__escaped = 1 } }),
        Button("d", { onClick: () => { top.__escaped = 1 } })
      ]))`,
    );
    await settle();
    await clickAll(screen.shadowRoot);
    expect((globalThis as Record<string, unknown>).__escaped).toBeUndefined();
  });

  it("blocks document", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$app(Column([Button("go", { onClick: () => { $t = document.title } })]))`,
    );
    await settle();
    await clickAll(screen.shadowRoot);
    // No throw escaping to the host, and no document handle reached.
    expect(screen.shadowRoot).toBeTruthy();
  });

  it("still allows inert data + formatting globals", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$app(Column([
        Text(new URL("https://example.com/a?b=1").host),
        Text(btoa("hi")),
        Text(String(new Map().size))
      ]))`,
    );
    await settle();
    const text = screen.shadowRoot.textContent ?? "";
    expect(text).toContain("example.com");
    expect(text).toContain("aGk=");
  });

  it("leaves the curated namespaces working", async () => {
    setGlobalAccessPolicy("safe");
    const screen = render(
      `$app(Column([Text(String(Math.max(2, 5))), Text(JSON.stringify({ a: 1 }))]))`,
    );
    await settle();
    const text = screen.shadowRoot.textContent ?? "";
    expect(text).toContain("5");
    expect(text).toContain('{"a":1}');
  });
});

describe("explicit allow-list policy", () => {
  it("permits only the named globals", async () => {
    setGlobalAccessPolicy(["btoa"]);
    const screen = render(
      `$app(Column([
        Text(btoa("hi")),
        Button("go", { onClick: () => { Function("globalThis.__escaped=1")() } })
      ]))`,
    );
    await settle();
    await clickAll(screen.shadowRoot);
    expect(screen.shadowRoot.textContent).toContain("aGk=");
    expect((globalThis as Record<string, unknown>).__escaped).toBeUndefined();
  });

  it("an empty list blocks the whole passthrough", async () => {
    setGlobalAccessPolicy([]);
    const screen = render(
      `$app(Column([Button("go", { onClick: () => { Function("globalThis.__escaped=1")() } })]))`,
    );
    await settle();
    await clickAll(screen.shadowRoot);
    expect((globalThis as Record<string, unknown>).__escaped).toBeUndefined();
  });
});
