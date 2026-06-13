/**
 * Third-party / imperative interop: `Mount(...)` (managed widget lifecycle),
 * `WebComponent(...)` (custom-element bridge), `$script(...)` (external loader),
 * and the `$dom` observer namespace. These are the escape hatches that let an
 * app embed a chart / map / editor / payment element it can't express with
 * built-in components.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

describe("Mount", () => {
  it("runs setup once with the host node and preserves it", async () => {
    const screen = render(`
      $tag = ""
      $count = 0
      $app(Mount({
        tag: "div",
        setup: (node) => { $tag = node.tagName; $count = $count + 1; return { node: node } }
      }))
    `);
    await settle();
    expect(screen.state.get("count")).toBe(1);
    expect((screen.state.get("tag") as string).toLowerCase()).toBe("div");
    const host = screen.shadowRoot.querySelector(".rui-mount");
    expect(host).not.toBeNull();
    expect(host?.hasAttribute("data-rui-preserve")).toBe(true);
  });

  it("runs update when the props bag changes (shallow-compared)", async () => {
    const screen = render(`
      $n = 1
      $seen = 0
      $app(Column([
        Mount({
          setup: () => ({}),
          update: () => { $seen = $seen + 1 },
          props: { n: $n }
        }),
        Button("Inc", { onClick: () => $n = $n + 1 })
      ]))
    `);
    await settle();
    expect(screen.state.get("seen")).toBe(0);

    await screen.click("Inc");
    await settle();
    expect(screen.state.get("seen")).toBe(1);
  });

  it("runs cleanup when the host leaves the tree", async () => {
    const screen = render(`
      $show = true
      $gone = false
      $app(Column([
        Show($show, { children: Mount({ setup: () => ({}), cleanup: () => { $gone = true } }) }),
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

describe("WebComponent", () => {
  it("renders a custom element with reactive attributes", async () => {
    const screen = render(`
      $id = "abc"
      $app(WebComponent("my-widget", { attributes: { "data-id": $id } }))
    `);
    await settle();
    const node = screen.shadowRoot.querySelector("my-widget");
    expect(node).not.toBeNull();
    expect(node?.getAttribute("data-id")).toBe("abc");
    expect(node?.hasAttribute("data-rui-preserve")).toBe(true);
  });

  it("falls back to a div for a hyphen-less tag", async () => {
    const screen = render(`$app(WebComponent("notcustom", {}))`);
    await settle();
    expect(screen.shadowRoot.querySelector(".rui-web-component")?.tagName.toLowerCase()).toBe("div");
  });
});

describe("$script", () => {
  it("returns a reactive load bag and errors without a src", async () => {
    const screen = render(`
      function P() {
        sdk = $script({})
        return Text(sdk.error ? "err" : "ok")
      }
      $app(P())
    `);
    await settle();
    expect(screen.getByText("err")).toBeTruthy();
  });

  it("exposes ready/loading/value fields", async () => {
    const screen = render(`
      function P() {
        sdk = $script({ src: "/sdk.js", global: "Sdk" })
        return Text(sdk.ready ? "ready" : "loading")
      }
      $app(P())
    `);
    await settle();
    // happy-dom won't fire a real load, so it stays in the loading state.
    expect(screen.queryByText("loading")).toBeTruthy();
  });
});

describe("$dom", () => {
  it("measures an element handed over by OnMount", async () => {
    const screen = render(`
      $w = -1
      $app(OnMount(Box([Text("box")]), {
        onMount: (node) => { $w = $dom.measure(node).viewport.width }
      }))
    `);
    await settle();
    expect(typeof screen.state.get("w")).toBe("number");
    expect(screen.state.get("w")).toBeGreaterThanOrEqual(0);
  });

  it("onResize returns a disposer function", async () => {
    const screen = render(`
      $kind = ""
      $app(OnMount(Box([Text("box")]), {
        onMount: (node) => {
          stop = $dom.onResize(node, () => {})
          $kind = typeof stop
        }
      }))
    `);
    await settle();
    expect(screen.state.get("kind")).toBe("function");
  });
});
