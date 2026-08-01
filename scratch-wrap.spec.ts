import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "./src/testing/index.js";

afterEach(() => cleanup());
async function settle(times = 8): Promise<void> { for (let i = 0; i < times; i += 1) await flush(); }

describe("morph safety", () => {
  it("OnClick sees the current loop variable after a re-render", async () => {
    const screen = render(`
      $rows = ["a", "b", "c"]
      $picked = ""
      $app(Column([
        Column($rows.map(r => OnClick(Card([Text(r)]), { onClick: () => { $picked = r } }))),
        Button("Drop first", { onClick: () => { $rows = ["b", "c"] } })
      ]))
    `);
    await settle();
    await screen.click("Drop first");
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const wrappers = [...root.querySelectorAll(".rui-on-click")] as HTMLElement[];
    expect(wrappers.length).toBe(2);
    wrappers[0]!.click();
    await settle();
    expect(screen.state.get("picked")).toBe("b");
  });

  it("OnClick does not fire for clicks on a nested Button", async () => {
    const screen = render(`
      $outer = 0
      $inner = 0
      $app(OnClick(Card([Button("Delete", { onClick: () => { $inner = $inner + 1 } })]), { onClick: () => { $outer = $outer + 1 } }))
    `);
    await settle();
    await screen.click("Delete");
    await settle();
    expect(screen.state.get("inner")).toBe(1);
    expect(screen.state.get("outer")).toBe(0);
  });

  it("OnClick honours a disabled flag that flips after the first render", async () => {
    const screen = render(`
      $busy = false
      $hits = 0
      $app(Column([
        OnClick(Card([Text("Save")]), { onClick: () => { $hits = $hits + 1 }, disabled: $busy }),
        Button("Busy", { onClick: () => { $busy = true } })
      ]))
    `);
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const w = root.querySelector(".rui-on-click") as HTMLElement;
    w.click();
    await settle();
    expect(screen.state.get("hits")).toBe(1);
    await screen.click("Busy");
    await settle();
    w.click();
    await settle();
    expect(screen.state.get("hits")).toBe(1);
    expect(w.getAttribute("aria-disabled")).toBe("true");
  });

  it("OnMouse binds a handler first supplied on a later render", async () => {
    const screen = render(`
      $on = false
      $drops = 0
      $app(Column([
        OnMouse(Card([Text("zone")]), { drop: $on ? (() => { $drops = $drops + 1 }) : null }),
        Button("Enable", { onClick: () => { $on = true } })
      ]))
    `);
    await settle();
    await screen.click("Enable");
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const w = root.querySelector(".rui-on-mouse") as HTMLElement;
    w.dispatchEvent(new Event("drop", { bubbles: true }));
    await settle();
    expect(screen.state.get("drops")).toBe(1);
  });

  it("OnFocus keeps firing with fresh props after re-renders", async () => {
    const screen = render(`
      $n = 0
      $log = ""
      $app(Column([
        OnFocus(Card([Text("f")]), { onBlur: () => { $log = "n=" + $n } }),
        Button("Bump", { onClick: () => { $n = $n + 1 } })
      ]))
    `);
    await settle();
    await screen.click("Bump");
    await settle();
    await screen.click("Bump");
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const w = root.querySelector(".rui-on-focus") as HTMLElement;
    w.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await settle();
    expect(screen.state.get("log")).toBe("n=2");
  });

  it("OnKeyboard reads the current state after a re-render", async () => {
    const screen = render(`
      $cursor = 0
      $app(OnKeyboard(Card([Text("grid")]), { onKeyDown: () => { $cursor = $cursor + 1 } }))
    `);
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const w = root.querySelector(".rui-on-keyboard") as HTMLElement;
    w.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    w.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    expect(screen.state.get("cursor")).toBe(2);
  });

  it("OnKeyboard global listens on the window", async () => {
    const screen = render(`
      $hits = 0
      $app(OnKeyboard(Card([Text("palette")]), { global: true, onKeyDown: () => { $hits = $hits + 1 } }))
    `);
    await settle();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    await settle();
    expect(screen.state.get("hits")).toBe(1);
    const root = screen.shadowRoot as ShadowRoot;
    expect((root.querySelector(".rui-on-keyboard") as HTMLElement).hasAttribute("tabindex")).toBe(false);
  });

  it("OnMouse scroll fires from a descendant scroll", async () => {
    const screen = render(`
      $scrolls = 0
      $app(OnMouse(ScrollArea([Text("long")], { height: "40px" }), { scroll: () => { $scrolls = $scrolls + 1 } }))
    `);
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const inner = root.querySelector(".rui-scroll-area") as HTMLElement;
    expect(inner).toBeTruthy();
    inner.dispatchEvent(new Event("scroll"));
    await settle();
    expect(screen.state.get("scrolls")).toBe(1);
  });

  it("Link builds a hash href and navigates with the current target", async () => {
    const screen = render(`
      $to = "/one"
      $app(Column([
        Link("Go", { to: $to }),
        Button("Switch", { onClick: () => { $to = "/two" } })
      ]))
    `);
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const a = root.querySelector("a.rui-link") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("#/one");
    await screen.click("Switch");
    await settle();
    expect(a.getAttribute("href")).toBe("#/two");
    a.click();
    await settle();
    expect(window.location.hash).toContain("/two");
  });

  it("Link disabled does not navigate and Link onClick runs", async () => {
    const screen = render(`
      $clicks = 0
      $app(Column([
        Link("Off", { to: "/nope", disabled: true }),
        Link("On", { to: "/yes", onClick: () => { $clicks = $clicks + 1 } })
      ]))
    `);
    await settle();
    const root = screen.shadowRoot as ShadowRoot;
    const links = [...root.querySelectorAll("a.rui-link")] as HTMLAnchorElement[];
    expect(links[0]!.hasAttribute("href")).toBe(false);
    expect(links[0]!.getAttribute("aria-disabled")).toBe("true");
    links[1]!.click();
    await settle();
    expect(screen.state.get("clicks")).toBe(1);
  });
});
