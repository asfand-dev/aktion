/**
 * Mounts the compiled multi-file portfolio and exercises the interactive bits:
 * the project tech-filter and the validated contact form.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "aktion-runtime/test";
import type { AktionElement } from "aktion-runtime";
import app from "../src/app.aktion";

afterEach(() => {
  cleanup();
  try {
    window.location.hash = "";
  } catch {
    /* ignore */
  }
});

function mountApp(options = {}) {
  const screen = render("", options);
  (screen.container as unknown as AktionElement).mountCompiled(app);
  return screen;
}

describe("developer portfolio", () => {
  it("renders the hero and featured work", async () => {
    const screen = mountApp();
    await flush();
    // Name appears in the navbar, hero, and footer — just assert it's present.
    expect(screen.getAllByText("Jordan Avery", { exact: false }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Atlas Analytics", { exact: false })).toBeTruthy();
  });

  it("filters projects by tech", async () => {
    const screen = mountApp({ route: "/projects" });
    await flush();
    expect(screen.getByText("Atlas Analytics", { exact: false })).toBeTruthy();
    const vue = screen.shadowRoot.querySelector('button[role="radio"][data-value="Vue"]') as HTMLButtonElement;
    expect(vue).toBeTruthy();
    await screen.user.click(vue);
    expect(screen.getByText("Verde Storefront", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Atlas Analytics")).toBeNull();
  });

  it("submits the contact form and emits an event", async () => {
    const screen = mountApp({ route: "/contact", captureEvents: ["contact-submitted"] });
    await flush();
    await screen.user.type(screen.getByPlaceholderText("Your name"), "Sam Client");
    await screen.user.type(screen.getByPlaceholderText("you@company.com"), "sam@acme.com");
    await screen.user.type(
      screen.getByPlaceholderText("Tell me about your project"),
      "We need a new marketing site built in React.",
    );
    await screen.click("Send message");
    expect(screen.getByText("Thanks for reaching out!", { exact: false })).toBeTruthy();
    expect(screen.emitted("contact-submitted")).toHaveLength(1);
  });
});
