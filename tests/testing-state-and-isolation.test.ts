/**
 * `aktion/test` — state probing across module scope, and test isolation.
 *
 * Three defects these pin, all of which passed silently before:
 *
 *  1. `screen.waitForState(name)` read `serializeState()[name]` raw while every
 *     other `StateProbe` method resolved the author's name to the runtime key.
 *     In a multi-file program the linker renames a non-entry module's atoms
 *     (`$count` in `lib/store.aktion` becomes `__a1_count`), so the wait could
 *     only ever time out.
 *  2. `screen.state.set(...)` called before the first flush found an empty store,
 *     failed to resolve the module-local symbol, and DECLARED a new top-level
 *     atom instead — the program's own atom kept its default and the test failed
 *     somewhere unrelated.
 *  3. `cleanup()` left `location.hash` wherever the last test finished, so a
 *     later `render()` with no `route` started on a path it never asked for and
 *     the suite's result depended on its own ordering.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compileAktionSource } from "../src/plugin/index.js";
import { cleanup, flush, render, renderCompiled } from "../src/testing/index.js";

const dir = mkdtempSync(join(tmpdir(), "aktion-testing-state-"));
writeFileSync(
  join(dir, "store.aktion"),
  ["export $count = 0", "export $label = \"\"", "export function bump() { $count = $count + 1 }"].join("\n"),
  "utf8",
);

/** An entry that imports its state from another module, so every atom is renamed. */
const multiFile = () =>
  compileAktionSource(
    [
      'import {$count, $label, bump} from "./store.aktion"',
      "$app(Column([",
      '  Text(`count=${$count}`),',
      '  Button("bump", { onClick: bump })',
      "]))",
    ].join("\n"),
    join(dir, "entry.aktion"),
    { root: dir },
  );

afterAll(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

describe("waitForState resolves module-local atoms", () => {
  it("settles on an atom the linker renamed", async () => {
    const screen = renderCompiled(multiFile());
    await flush();

    await screen.click("bump");
    const value = await screen.waitForState("count", (n) => n === 1, { timeout: 500 });

    expect(value).toBe(1);
    // The atom really is renamed — this is the case the raw read could not see.
    expect(screen.state.key("count")).not.toBe("count");
    screen.unmount();
  });

  it("waits for an atom that is not declared when the wait starts", async () => {
    const screen = renderCompiled(multiFile());
    // No flush: the program has not planned, so `count` does not exist yet.
    const value = await screen.waitForState("count", (n) => n === 0, { timeout: 500 });
    expect(value).toBe(0);
    screen.unmount();
  });
});

describe("state.set before the first plan", () => {
  it("throws instead of silently declaring an unrelated atom", async () => {
    const screen = renderCompiled(multiFile());
    await expect(screen.state.set("count", 5)).rejects.toThrow(/before the program planned/);

    // …and the program's own atom is untouched, which is the failure the error
    // replaces: the old behaviour left it at 0 while `snapshot().count` read 5.
    await flush();
    expect(screen.state.get("count")).toBe(0);
    screen.unmount();
  });

  it("works normally once the program has planned", async () => {
    const screen = renderCompiled(multiFile());
    await flush();
    expect(screen.state.planned).toBe(true);

    await screen.state.set("count", 7);
    expect(screen.state.get("count")).toBe(7);
    expect(screen.getByText("count=7")).toBeTruthy();
    screen.unmount();
  });

  it("reports `planned: false` before the first flush", () => {
    const screen = renderCompiled(multiFile());
    expect(screen.state.planned).toBe(false);
    screen.unmount();
  });

  it("seeding a value BEFORE the plan still works through the paths built for it", async () => {
    // `options.state` and `state.hydrate` are unaffected by the guard: they are
    // how a host restores a snapshot, which is by definition a pre-plan write.
    const screen = renderCompiled(multiFile(), { state: { __a1_count: 42 } });
    await flush();
    expect(screen.state.get("count")).toBe(42);
    screen.unmount();
  });
});

describe("cleanup restores the route", () => {
  it("puts location.hash back where the mount found it", async () => {
    window.location.hash = "#/start";

    const screen = render('$app(Text(`at ${route.path}`))', { route: "/deep/link" });
    await flush();
    expect(window.location.hash).toBe("#/deep/link");

    cleanup();
    expect(window.location.hash).toBe("#/start");
    void screen;
  });

  it("also undoes a route the PROGRAM navigated to", async () => {
    window.location.hash = "#/start";

    const screen = render(
      ['$app(Button("go", { onClick: () => route.navigate("/elsewhere") }))'].join("\n"),
      { route: "/here" },
    );
    await flush();
    await screen.click("go");
    expect(window.location.hash).toBe("#/elsewhere");

    cleanup();
    expect(window.location.hash).toBe("#/start");
  });

  it("leaves the hash alone when nothing changed it", async () => {
    window.location.hash = "#/untouched";
    render("$app(Text(\"static\"))");
    await flush();
    cleanup();
    expect(window.location.hash).toBe("#/untouched");
  });
});

describe("query variants exposed on Screen", () => {
  it("offers queryAll / findAll for every query family", async () => {
    const screen = render(
      [
        "$app(Column([",
        '  Button("Alpha", {}),',
        '  Button("Beta", {}),',
        '  Input("Email", { value: "", label: "Email", placeholder: "you@example.com" })',
        "]))",
      ].join("\n"),
    );
    await flush();

    expect(screen.queryAllByRole("button")).toHaveLength(2);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(await screen.findAllByRole("button")).toHaveLength(2);

    expect(screen.getAllByLabelText("Email").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("Nope")).toHaveLength(0);
    expect(await screen.findByLabelText("Email")).toBeTruthy();

    expect(screen.getAllByPlaceholderText("you@example.com")).toHaveLength(1);
    expect(screen.queryAllByPlaceholderText("nothing")).toHaveLength(0);
    expect(await screen.findByPlaceholderText("you@example.com")).toBeTruthy();
    expect(await screen.findAllByPlaceholderText("you@example.com")).toHaveLength(1);
    expect(await screen.findAllByLabelText("Email")).not.toHaveLength(0);

    expect(screen.queryAllByTestId("missing")).toHaveLength(0);
    screen.unmount();
  });
});
