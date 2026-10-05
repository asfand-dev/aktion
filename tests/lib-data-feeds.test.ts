/**
 * ActivityLog, CalendarView and InfiniteList: each case is a behaviour the spec
 * documented and the renderer did not deliver.
 *
 *   - `onItemClick` / `onEventClick` promised "(index, item)" / "(eventId,
 *     event)" and handed over a rebuilt copy: fields coerced to strings, any
 *     extra field (the `id` a handler acts on) dropped, and an ActivityLog index
 *     that skipped the entries that were not objects;
 *   - a fractional `firstDay` indexed the weekday labels with a fraction;
 *   - `rootMargin` let through values IntersectionObserver rejects (a number,
 *     `vh`, `rem`), whose constructor throw silently disabled auto-loading.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, flush } from "../src/testing/index.js";

afterEach(() => cleanup());

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

/** Let `deferToPaint` (rAF raced against `setTimeout(0)`) run. */
async function paint(): Promise<void> {
  await settle();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  await settle();
}

describe("ActivityLog(onItemClick:)", () => {
  it("receives the author's own item and its index in `items`", async () => {
    const screen = render(`$got = ""
$app(ActivityLog([null, { title: "Deployed", actor: "Ann", id: 42 }], {
  onItemClick: (i, item) => { $got = i + ":" + item.id + ":" + (item.tone == null ? "no-tone" : item.tone) }
}))`);
    await settle();
    (screen.shadowRoot.querySelector("button.rui-activity-log-title") as HTMLButtonElement).click();
    await settle();
    expect(screen.state.get("got")).toBe("1:42:no-tone");
  });

  it("keeps the fields' own types (a number stays a number)", async () => {
    const screen = render(`$got = ""
$app(ActivityLog([{ title: 7, meta: 3 }], { onItemClick: (i, item) => { $got = typeof item.title + "/" + typeof item.meta } }))`);
    await settle();
    (screen.shadowRoot.querySelector("button.rui-activity-log-title") as HTMLButtonElement).click();
    await settle();
    expect(screen.state.get("got")).toBe("number/number");
  });
});

describe("CalendarView", () => {
  it("onEventClick receives the author's own event object", async () => {
    const screen = render(`$got = ""
$app(CalendarView({
  month: "2026-07",
  events: [{ date: "2026-07-06", title: "Standup", location: "Room 1" }],
  onEventClick: (id, e) => { $got = id + "|" + e.location + "|" + (e.time == null ? "no-time" : e.time) }
}))`);
    await settle();
    (screen.shadowRoot.querySelector("button.rui-calendar-event") as HTMLButtonElement).click();
    await settle();
    expect(screen.state.get("got")).toBe("2026-07-06#0|Room 1|no-time");
  });

  it("floors a fractional firstDay", async () => {
    const screen = render(`$app(CalendarView({ month: "2026-07", firstDay: 1.5 }))`);
    await settle();
    const labels = [...screen.shadowRoot.querySelectorAll(".rui-calendar-weekday")].map((d) => d.textContent);
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});

describe("InfiniteList(rootMargin:)", () => {
  let margins: string[];

  beforeEach(() => {
    margins = [];
    // A recorder in place of the real observer: happy-dom's accepts anything,
    // while Chromium throws for every value that is not 1–4 px / % lengths.
    vi.stubGlobal("IntersectionObserver", class {
      constructor(_cb: unknown, options: { rootMargin?: string } = {}) { margins.push(options.rootMargin ?? ""); }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): unknown[] { return []; }
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  const marginFor = async (value: string): Promise<string | undefined> => {
    render(`$app(InfiniteList([Text("a")], { onLoadMore: () => {}, rootMargin: ${value} }))`);
    await paint();
    return margins.at(-1);
  };

  it("reads a number as px", async () => {
    expect(await marginFor("200")).toBe("200px");
  });

  it("gives a unitless token in a string px too", async () => {
    expect(await marginFor('"0 10%"')).toBe("0px 10%");
  });

  it("keeps up to four px / % lengths as written", async () => {
    expect(await marginFor('"-10px 5% 0px 12.5PX"')).toBe("-10px 5% 0px 12.5PX");
  });

  it("falls back to the default for a unit the observer rejects", async () => {
    expect(await marginFor('"10vh"')).toBe("200px");
    expect(await marginFor('"2rem"')).toBe("200px");
    expect(await marginFor('"calc(10px + 5px)"')).toBe("200px");
    expect(await marginFor('"1px 2px 3px 4px 5px"')).toBe("200px");
  });
});
