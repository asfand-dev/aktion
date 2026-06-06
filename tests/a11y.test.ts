/**
 * Accessibility behaviours: NavLink `aria-current`, danger Toast `role=alert`,
 * and the Modal focus trap (label association, focus-in-on-open, Escape close).
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  try { window.location.hash = ""; } catch { /* ignore */ }
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

describe("NavLink", () => {
  it("marks the active link with aria-current=page", async () => {
    const screen = render(
      `$app(Column([
        NavLink("Home", { to: "/", exact: true }),
        NavLink("About", { to: "/about" })
      ]))`,
      { route: "/" },
    );
    await settle();
    const links = [...screen.shadowRoot.querySelectorAll("a.rui-nav-link")] as HTMLAnchorElement[];
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute("aria-current")).toBe("page");
    expect(links[1]!.getAttribute("aria-current")).toBeNull();
  });
});

describe("Toast", () => {
  it("uses role=alert + assertive for danger tone, role=status otherwise", async () => {
    const screen = render(`$app(Column([
      Toast("Saved", { tone: "success" }),
      Toast("Failed", { tone: "danger" })
    ]))`);
    await settle();
    const toasts = [...screen.shadowRoot.querySelectorAll(".rui-toast")] as HTMLElement[];
    const success = toasts.find((t) => t.getAttribute("data-tone") === "success")!;
    const danger = toasts.find((t) => t.getAttribute("data-tone") === "danger")!;
    expect(success.getAttribute("role")).toBe("status");
    expect(success.getAttribute("aria-live")).toBe("polite");
    expect(danger.getAttribute("role")).toBe("alert");
    expect(danger.getAttribute("aria-live")).toBe("assertive");
  });
});

describe("Modal focus trap", () => {
  it("labels the dialog with its title", async () => {
    const screen = render(`
      $open = true
      $app(Modal("Settings", { open: $open, children: [Text("body")] }))
    `);
    await settle();
    const dialog = screen.shadowRoot.querySelector(".rui-modal") as HTMLElement;
    expect(dialog).toBeTruthy();
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const title = screen.shadowRoot.getElementById(labelledBy!);
    expect(title?.textContent).toContain("Settings");
  });

  it("moves focus into the dialog when opened", async () => {
    const screen = render(`
      $open = true
      $app(Modal("Settings", { open: $open, children: [Button("OK")] }))
    `);
    await settle();
    const dialog = screen.shadowRoot.querySelector(".rui-modal") as HTMLElement;
    const active = (screen.shadowRoot as unknown as { activeElement: Element | null }).activeElement;
    expect(active).toBeTruthy();
    expect(dialog.contains(active)).toBe(true);
  });

  it("closes on Escape (writes the bound state to false)", async () => {
    const screen = render(`
      $open = true
      $app(Modal("Settings", { open: $open, children: [Button("OK")] }))
    `);
    await settle();
    expect(screen.state.get("open")).toBe(true);
    const dialog = screen.shadowRoot.querySelector(".rui-modal") as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    expect(screen.state.get("open")).toBe(false);
  });
});
