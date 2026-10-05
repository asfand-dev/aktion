/**
 * Timer-driven marketing components (`CountdownTimer`, `RelativeTime`) after a
 * prop changes.
 *
 * Both start their timer from the first render that finds its element on the
 * page. Every later render produces a fresh tree that morph discards in favour
 * of that element, so a timer that closed over the first render's target kept
 * repainting it: the change showed for at most one tick and was then undone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, type Screen } from "../src/testing/index.js";

const T0 = new Date("2026-01-01T00:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Mount, then let the deferred post-paint work run. */
async function mount(source: string, state: Record<string, unknown>): Promise<Screen> {
  const screen = render(source, { state });
  await screen.flush();
  await vi.advanceTimersByTimeAsync(20);
  return screen;
}

/** Write state, re-render, and run the deferred post-paint work. */
async function write(screen: Screen, name: string, value: unknown): Promise<void> {
  screen.state.set(name, value);
  await screen.flush();
  await vi.advanceTimersByTimeAsync(20);
}

describe("CountdownTimer", () => {
  const COUNTDOWN = `$to = ""
$ends = 0
function ended() { $ends = $ends + 1 }
$app(CountdownTimer($to, { onEnd: ended, units: ["hours", "minutes", "seconds"] }))`;

  const cells = (screen: Screen): string =>
    [...screen.shadowRoot.querySelectorAll(".rui-countdown-value")].map((c) => c.textContent).join(":");
  const done = (screen: Screen): string | null =>
    screen.shadowRoot.querySelector(".rui-countdown-done")?.textContent ?? null;

  it("waits on an empty target instead of finishing (and firing onEnd) at once", async () => {
    const screen = await mount(COUNTDOWN, { to: "" });
    expect(done(screen)).toBeNull();
    expect(cells(screen)).toBe("--:--:--");
    await vi.advanceTimersByTimeAsync(5000);
    expect(screen.state.get("ends")).toBe(0);
  });

  it("starts counting once the target arrives, and fires onEnd when it runs out", async () => {
    const screen = await mount(COUNTDOWN, { to: "" });
    await write(screen, "to", T0 + 3000);
    expect(cells(screen)).toBe("00:00:02");
    await vi.advanceTimersByTimeAsync(1000);
    expect(cells(screen)).toBe("00:00:01");
    await vi.advanceTimersByTimeAsync(2500);
    expect(done(screen)).toBe("Done");
    expect(screen.state.get("ends")).toBe(1);
  });

  it("retargets the running clock when `to` changes, and fires onEnd for the new target", async () => {
    const screen = await mount(COUNTDOWN, { to: T0 + 5 * 3600e3 });
    expect(cells(screen)).toBe("05:00:00");
    await write(screen, "to", Date.now() + 2000);
    expect(cells(screen)).toBe("00:00:02");
    // The live interval used to repaint the first target ("04:59:59") here.
    await vi.advanceTimersByTimeAsync(1000);
    expect(cells(screen)).toBe("00:00:01");
    await vi.advanceTimersByTimeAsync(2500);
    expect(done(screen)).toBe("Done");
    expect(screen.state.get("ends")).toBe(1);
  });

  it("fires onEnd once per target: not again on a re-render, again for a new target", async () => {
    const screen = await mount(`${COUNTDOWN}\n$other = 0`, { to: T0 + 1000 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(screen.state.get("ends")).toBe(1);
    // An unrelated re-render of the finished countdown stays quiet.
    await write(screen, "other", 1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.state.get("ends")).toBe(1);
    // A new target restarts the clock from the "Done" state.
    await write(screen, "to", Date.now() + 2000);
    expect(done(screen)).toBeNull();
    expect(cells(screen)).toBe("00:00:02");
    await vi.advanceTimersByTimeAsync(1000);
    expect(cells(screen)).toBe("00:00:01");
    await vi.advanceTimersByTimeAsync(1500);
    expect(screen.state.get("ends")).toBe(2);
  });

  it("stops ticking when the target is cleared again", async () => {
    const screen = await mount(COUNTDOWN, { to: T0 + 2000 });
    await write(screen, "to", "");
    await vi.advanceTimersByTimeAsync(5000);
    expect(cells(screen)).toBe("--:--:--");
    expect(screen.state.get("ends")).toBe(0);
  });
});

describe("RelativeTime", () => {
  const RELATIVE = `$at = 0
$app(RelativeTime($at))`;
  const label = (screen: Screen): string | null | undefined =>
    screen.shadowRoot.querySelector(".rui-relative-time-label")?.textContent;

  it("keeps a changed value instead of repainting the first one on the next refresh", async () => {
    const screen = await mount(RELATIVE, { at: T0 - 10_000 });
    expect(label(screen)).toBe("10 seconds ago");
    await write(screen, "at", Date.now() - 3 * 864e5);
    expect(label(screen)).toBe("3 days ago");
    // The first render's timer runs every second while its date is under a
    // minute old; it used to write "11 seconds ago" back here.
    await vi.advanceTimersByTimeAsync(1200);
    expect(label(screen)).toBe("3 days ago");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(label(screen)).toBe("3 days ago");
  });

  it("refreshes on the cadence of the NEW value", async () => {
    const screen = await mount(RELATIVE, { at: T0 - 3 * 864e5 });
    await write(screen, "at", Date.now() + 20_000);
    expect(label(screen)).toBe("in 20 seconds");
    // Within a minute the label refreshes every second, not on the 30s cadence
    // the first value's timer was scheduled with.
    await vi.advanceTimersByTimeAsync(5000);
    expect(label(screen)).toBe("in 15 seconds");
  });

  it("reads a Date value with its milliseconds", async () => {
    const at = new Date(T0 - 1234);
    const screen = await mount(RELATIVE, { at });
    expect(screen.shadowRoot.querySelector("time")?.getAttribute("datetime")).toBe(at.toISOString());
  });
});
