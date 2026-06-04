/**
 * Aktion DevTools tests.
 *
 * These exercise the genuine runtime instrumentation end-to-end: a real
 * `<aktion-app>` is mounted via the testing library, the DevTools hook
 * captures the events the runtime emits, and we assert on the protocol
 * payloads (commits, state, effects). A final block mounts the actual
 * `<aktion-devtools>` panel and checks it derives a live model.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, flush, cleanup } from "../src/testing/index.js";
import {
  installDevtoolsHook,
  getDevtoolsHook,
  isDevtoolsActive,
  emitDevtoolsEvent,
  HOOK_KEY,
} from "../src/devtools/hook.js";
import { mountDevtools, AktionDevtoolsElement } from "../src/devtools/panel.js";
import type {
  CommitRecord,
  DevtoolsEvent,
  EffectEvent,
  StateEvent,
} from "../src/devtools/protocol.js";

/** Track subscriptions so each test tears down cleanly (the hook is global). */
let unsubscribers: Array<() => void> = [];

/** Subscribe a fresh event collector — also makes the hook "active". */
function listen(): DevtoolsEvent[] {
  const hook = installDevtoolsHook();
  const events: DevtoolsEvent[] = [];
  unsubscribers.push(hook.subscribe((e) => events.push(e)));
  return events;
}

const commits = (e: DevtoolsEvent[]) => e.filter((x): x is CommitRecord => x.kind === "commit");
const states = (e: DevtoolsEvent[]) => e.filter((x): x is StateEvent => x.kind === "state");
const effects = (e: DevtoolsEvent[]) => e.filter((x): x is EffectEvent => x.kind === "effect");

afterEach(() => {
  for (const u of unsubscribers) u();
  unsubscribers = [];
  cleanup();
  // Remove any panels we mounted and reset the shared hub between tests.
  document.querySelectorAll("aktion-devtools").forEach((el) => el.remove());
  const hook = getDevtoolsHook();
  if (hook) {
    hook.apps.clear();
    hook.buffer.length = 0;
  }
});

/* -------------------------------------------------------------------------- */

describe("hook", () => {
  it("stays dormant until a frontend subscribes", () => {
    delete (globalThis as Record<string, unknown>)[HOOK_KEY];
    expect(getDevtoolsHook()).toBeUndefined();
    expect(isDevtoolsActive()).toBe(false);
    // Emitting without a hook is a safe no-op (the common production path).
    expect(() =>
      emitDevtoolsEvent({ kind: "state", appId: "x", snapshot: {}, changedPaths: [], time: 0 }),
    ).not.toThrow();

    const hook = installDevtoolsHook();
    expect(getDevtoolsHook()).toBe(hook);
    expect(isDevtoolsActive()).toBe(false); // installed, but nobody listening

    const unsub = hook.subscribe(() => {});
    expect(isDevtoolsActive()).toBe(true);
    unsub();
    expect(isDevtoolsActive()).toBe(false);
  });

  it("registers and unregisters apps", async () => {
    const seen: string[] = [];
    const hook = installDevtoolsHook();
    unsubscribers.push(hook.subscribe(() => {}));
    unsubscribers.push(hook.subscribeApps((action, app) => seen.push(`${action}:${app.label}`)));

    const screen = render(`$app(Text("hi"))`);
    await flush();
    expect(hook.apps.size).toBe(1);
    expect(seen.some((s) => s.startsWith("register:"))).toBe(true);

    screen.unmount();
    await flush();
    expect(hook.apps.size).toBe(0);
    expect(seen.some((s) => s.startsWith("unregister:"))).toBe(true);
  });
});

describe("state inspector events", () => {
  it("emits a snapshot + changed paths on every flush, and editing writes back", async () => {
    const events = listen();
    const screen = render(`
      $count = 0
      $app(Column([
        Text(\`Count: \${$count}\`),
        Button("inc", { onClick: () => $count = $count + 1 })
      ]))
    `);
    await flush();

    await screen.click("inc");
    const change = states(events).find((s) => s.changedPaths.includes("count"));
    expect(change).toBeTruthy();
    expect(change!.snapshot.count).toBe(1);

    // The app record lets a debugger push an edit through the real pipeline.
    const app = [...getDevtoolsHook()!.apps.values()].pop()!;
    app.setState("count", 42);
    await flush();
    expect(screen.state.get("count")).toBe(42);
    expect(states(events).some((s) => s.changedPaths.includes("count") && s.snapshot.count === 42)).toBe(true);
  });

  it("supports dotted-path edits into nested state", async () => {
    listen();
    const screen = render(`
      $user = { name: "Ada", role: "admin" }
      $app(Text(\`\${$user.name} (\${$user.role})\`))
    `);
    await flush();

    const app = [...getDevtoolsHook()!.apps.values()].pop()!;
    app.setState("user.name", "Grace");
    await flush();
    const user = screen.state.get("user") as { name: string; role: string };
    expect(user.name).toBe("Grace");
    expect(user.role).toBe("admin"); // sibling preserved (immutable setPath)
  });
});

describe("render profiler", () => {
  it("captures commits with per-component mount/update records", async () => {
    const events = listen();
    const screen = render(`
      $count = 0
      function Row(label) { return Text(\`\${label}: \${$count}\`) }
      $app(Column([
        Row("A"),
        Row("B"),
        Button("inc", { onClick: () => $count = $count + 1 })
      ]))
    `);
    await flush();

    const first = commits(events)[0];
    expect(first).toBeTruthy();
    expect(first!.initial).toBe(true);
    const mountedRows = first!.components.filter((c) => c.name === "Row");
    expect(mountedRows.length).toBe(2);
    expect(mountedRows.every((c) => c.phase === "mount")).toBe(true);
    expect(typeof first!.duration).toBe("number");

    // A state change should drive an incremental commit that re-renders Row
    // (it reads $count) and attributes the reason to the dependency.
    await screen.click("inc");
    const after = commits(events).slice(1);
    const updateCommit = after.find((c) => c.components.some((x) => x.name === "Row" && x.phase === "update"));
    expect(updateCommit).toBeTruthy();
    const updatedRow = updateCommit!.components.find((c) => c.name === "Row" && c.phase === "update")!;
    expect(updatedRow.reason).toContain("dependency");
    expect(updatedRow.deps).toContain("count");
  });

  it("memoizes a component whose deps did not change", async () => {
    const events = listen();
    const screen = render(`
      $a = 0
      $b = 0
      function ReadsA() { return Text(\`a=\${$a}\`) }
      function ReadsB() { return Text(\`b=\${$b}\`) }
      $app(Column([
        ReadsA(),
        ReadsB(),
        Button("bumpB", { onClick: () => $b = $b + 1 })
      ]))
    `);
    await flush();

    await screen.click("bumpB");
    // After bumping only $b, ReadsA's body must be skipped (memoized) while
    // ReadsB re-renders.
    const after = commits(events).slice(1);
    const memoCommit = after.find((c) => c.components.some((x) => x.name === "ReadsA" && x.phase === "memo"));
    expect(memoCommit).toBeTruthy();
    expect(memoCommit!.components.some((x) => x.name === "ReadsB" && x.phase === "update")).toBe(true);
    expect(memoCommit!.memoized).toBeGreaterThan(0);
  });
});

describe("effect timeline", () => {
  it("captures mount, run, cleanup with the firing trigger", async () => {
    const events = listen();
    const screen = render(`
      $count = 0
      $ran = 0
      $effect(() => {
        $ran = $ran + 1
        cleanup(() => {})
      }, [$count])
      $app(Column([
        Text(\`Count: \${$count}\`),
        Button("inc", { onClick: () => $count = $count + 1 })
      ]))
    `);
    await flush();

    // Mounted + ran once on mount.
    expect(effects(events).some((e) => e.phase === "mount")).toBe(true);
    expect(effects(events).some((e) => e.phase === "run" && e.reason === "mount")).toBe(true);

    await screen.click("inc");
    // Re-ran because $count changed; prior cleanup fired first.
    expect(effects(events).some((e) => e.phase === "run" && e.reason === "state:count")).toBe(true);
    expect(effects(events).some((e) => e.phase === "cleanup")).toBe(true);

    const run = effects(events).find((e) => e.phase === "run");
    expect(run!.triggers).toContain("$count");
    expect(typeof run!.duration).toBe("number");
  });

  it("emits an unmount event when an instance leaves the tree", async () => {
    const events = listen();
    const screen = render(`
      $show = true
      function Box() {
        $effect(() => {}, ["mount"])
        return Text("boxed")
      }
      $app(Column([
        ($show ? Box() : Text("gone")),
        Button("toggle", { onClick: () => $show = !$show })
      ]))
    `);
    await flush();
    expect(effects(events).some((e) => e.instanceKey != null && e.phase === "mount")).toBe(true);

    await screen.click("toggle");
    expect(effects(events).some((e) => e.phase === "unmount")).toBe(true);
  });
});

describe("panel", () => {
  it("mounts, lists the app, and derives a live model", async () => {
    const controller = mountDevtools();
    expect(controller.element).toBeInstanceOf(AktionDevtoolsElement);
    await flush();

    const screen = render(`
      $count = 7
      function Label() { return Text(\`n=\${$count}\`) }
      $app(Label())
    `);
    await flush();

    // The app was adopted and a model derived.
    const model = controller.element.getModel();
    expect(model).toBeTruthy();
    expect(model!.state.count).toBe(7);
    expect(model!.commits.length).toBeGreaterThan(0);

    // The rendered panel shows the State tab with the atom name.
    const text = controller.element.shadowRoot!.textContent ?? "";
    expect(text).toContain("Aktion DevTools");
    expect(text).toContain("count");

    // A pushed edit flows through and updates the model on the next flush.
    const app = [...controller.hook.apps.values()].pop()!;
    app.setState("count", 99);
    await flush();
    expect(controller.element.getModel()!.state.count).toBe(99);
    expect(screen.state.get("count")).toBe(99);

    controller.destroy();
  });
});
