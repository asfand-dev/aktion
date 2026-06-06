/**
 * Mounts the compiled multi-file site (via `mountCompiled`, like src/main.ts)
 * and exercises navigation + the validated contact form.
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

function mountApp(route = "/", options = {}) {
  const screen = render("", { route, ...options });
  (screen.container as unknown as AktionElement).mountCompiled(app);
  return screen;
}

describe("pet-sitting website", () => {
  it("renders the landing page", async () => {
    const screen = mountApp();
    await flush();
    expect(screen.getByText("Loving care for your pets, at home", { exact: false })).toBeTruthy();
    expect(screen.getByText("Dog Walking", { exact: false })).toBeTruthy();
  });

  it("navigates to the other pages", async () => {
    const screen = mountApp();
    await flush();
    await screen.navigate("/pricing");
    expect(screen.getByText("Frequently asked", { exact: false })).toBeTruthy();
    await screen.navigate("/services");
    expect(screen.getByText("How it works", { exact: false })).toBeTruthy();
  });

  it("shows validation errors when the contact form is empty", async () => {
    const screen = mountApp("/contact");
    await flush();
    await screen.click("Request booking");
    expect(screen.getAllByText("Please tell us your name.", { exact: false }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Enter a valid email address.", { exact: false }).length).toBeGreaterThanOrEqual(1);
    // Still on the form — no success state yet.
    expect(screen.queryByText("Request received!")).toBeNull();
  });

  it("submits a valid booking and emits contact-submitted", async () => {
    const screen = mountApp("/contact", { captureEvents: ["contact-submitted"] });
    await flush();
    await screen.user.type(screen.getByPlaceholderText("Jane Doe"), "Jane Doe");
    await screen.user.type(screen.getByPlaceholderText("jane@example.com"), "jane@example.com");
    await screen.user.type(
      screen.getByPlaceholderText("Tell us about your pet and the dates you need"),
      "Two walks a day for my beagle Biscuit.",
    );
    await screen.click("Request booking");
    expect(screen.getByText("Request received!", { exact: false })).toBeTruthy();
    const events = screen.emitted("contact-submitted");
    expect(events).toHaveLength(1);
    expect((events[0] as { email: string }).email).toBe("jane@example.com");
  });
});
