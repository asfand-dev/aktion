/**
 * The Vite plugin compiles + links the multi-file `.aktion` program at import
 * time into a `CompiledProgram`. We mount it in a real `<aktion-app>` with
 * `mountCompiled` — exactly how `src/main.ts` renders it in the browser — and
 * then drive it like a user would.
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

/** Mount the compiled program (optionally at a route) and return the Screen. */
function mountApp(route = "/") {
  const screen = render("", { route });
  (screen.container as unknown as AktionElement).mountCompiled(app);
  return screen;
}

describe("home automation dashboard", () => {
  it("shows the overview KPIs and devices", async () => {
    const screen = mountApp();
    await flush();
    expect(screen.getByText("Good evening, Alex", { exact: false })).toBeTruthy();
    expect(screen.getByText("Devices On", { exact: false })).toBeTruthy();
    // 9 of the 12 seeded devices start on.
    expect(screen.getByText("9 / 12", { exact: false })).toBeTruthy();
    expect(screen.getByText("Ceiling Lights", { exact: false })).toBeTruthy();
  });

  it("toggling a device flips the live KPI", async () => {
    const screen = mountApp();
    await flush();
    const toggle = screen.shadowRoot.querySelector("#sw-lr-ceiling") as HTMLInputElement;
    expect(toggle).toBeTruthy();
    await screen.user.click(toggle);
    // One light off → 8 of 12 on.
    expect(screen.getByText("8 / 12", { exact: false })).toBeTruthy();
  });

  it("activating a scene applies its presets and marks it active", async () => {
    const screen = mountApp();
    await flush();
    await screen.click("Away");
    // "Away" turns three on-lights off (9 → 6) and the tile reports it active.
    expect(screen.getByText("6 / 12", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("Active", { exact: true }).length).toBeGreaterThanOrEqual(1);
  });

  it("filters devices by search on the Devices page", async () => {
    const screen = mountApp("/devices");
    await flush();
    expect(screen.getByText("Ceiling Lights", { exact: false })).toBeTruthy();
    const search = screen.getByPlaceholderText("Search devices") as HTMLInputElement;
    await screen.user.type(search, "thermostat");
    expect(screen.queryByText("Ceiling Lights")).toBeNull();
    expect(screen.getByText("Thermostat", { exact: false })).toBeTruthy();
  });

  it("navigates between pages", async () => {
    const screen = mountApp();
    await flush();
    await screen.navigate("/energy");
    expect(screen.getByText("Live load", { exact: false })).toBeTruthy();
    await screen.navigate("/automations");
    expect(screen.getByText("Auto-Lock", { exact: false })).toBeTruthy();
  });
});
