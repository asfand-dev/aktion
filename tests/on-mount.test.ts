/**
 * `OnMount` — the DOM-ref / lifecycle wrapper. `onMount(node)` fires once
 * after the wrapped child attaches; `onUnmount(node)` fires when it leaves
 * the tree. This is the Aktion-native escape hatch for grabbing a rendered
 * DOM node and running imperative code against it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

describe("OnMount", () => {
  it("fires onMount once with the rendered DOM element", async () => {
    const screen = render(`
      $tag = ""
      $count = 0
      $app(OnMount(Box([Text("hello")]), {
        onMount: (node) => { $tag = node.tagName; $count = $count + 1 }
      }))
    `);
    await settle();
    expect(typeof screen.state.get("tag")).toBe("string");
    expect((screen.state.get("tag") as string).length).toBeGreaterThan(0);
    expect(screen.state.get("count")).toBe(1);
  });

  it("fires onUnmount when the wrapped element leaves the tree", async () => {
    const screen = render(`
      $show = true
      $gone = false
      $app(Column([
        Show($show, { children: OnMount(Box([Text("x")]), {
          onUnmount: () => { $gone = true }
        }) }),
        Button("Hide", { onClick: () => $show = false })
      ]))
    `);
    await settle();
    expect(screen.state.get("gone")).toBe(false);

    await screen.click("Hide");
    await settle();
    expect(screen.state.get("gone")).toBe(true);
  });
});
