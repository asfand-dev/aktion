/**
 * `$optimistic(() => { … })` — the JS-compliant optimistic-update builtin.
 * It snapshots reactive state, runs the callback, and rolls the store back
 * if the callback throws (or the promise it returns rejects), so an
 * optimistic UI write is reverted on failure.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

describe("$optimistic — rollback on sync throw", () => {
  it("rolls back an optimistic write when the callback throws", async () => {
    const screen = render(`
      $status = "idle"
      function save() {
        $optimistic(() => {
          $status = "saving"
          throw new Error("network down")
        })
      }
      $app(Button("Save", { onClick: save }))
    `);
    await flush();
    expect(screen.state.get("status")).toBe("idle");

    await screen.click("Save");
    // The optimistic write to "saving" must be rolled back after the throw.
    expect(screen.state.get("status")).toBe("idle");
  });

  it("keeps the write when there is no $optimistic wrapper", async () => {
    const screen = render(`
      $status = "idle"
      function save() {
        $status = "saving"
        throw new Error("network down")
      }
      $app(Button("Save", { onClick: save }))
    `);
    await flush();
    await screen.click("Save");
    expect(screen.state.get("status")).toBe("saving");
  });

  it("does not roll back a successful optimistic callback", async () => {
    const screen = render(`
      $count = 0
      function bump() { $optimistic(() => { $count = $count + 1 }) }
      $app(Button("Bump", { onClick: bump }))
    `);
    await flush();
    await screen.click("Bump");
    expect(screen.state.get("count")).toBe(1);
  });

  it("resets atoms created during the callback on rollback", async () => {
    const screen = render(`
      $count = 0
      function go() {
        $optimistic(() => {
          $count = 5
          $fresh = "created"
          throw new Error("boom")
        })
      }
      $app(Button("Go", { onClick: go }))
    `);
    await flush();
    await screen.click("Go");
    expect(screen.state.get("count")).toBe(0);
    // Atom created inside the callback is cleared back to undefined on rollback.
    expect(screen.state.get("fresh")).toBeUndefined();
  });
});
