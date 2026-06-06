/**
 * `$toast` — imperative toast manager. Replaces hand-managing a `$toasts`
 * array: `show` appends + arms an auto-dismiss timer, tone shortcuts set the
 * accent, `dismiss`/`clear` remove entries, and timers are cleared on dispose.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  createContext,
  disposeContext,
  planProgram,
  evaluate,
} from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";
import type { ToastManager } from "../src/runtime/toast.js";

function build(source = "aktion = Stack()") {
  const program = parse(source);
  const state = new StateStore();
  const notify = vi.fn();
  const ctx = createContext(state, { library: defaultLibrary, notify });
  planProgram(program, ctx);
  // Resolve the `$toast` namespace the same way author code would.
  const toast = evaluate({ kind: "StateRef", name: "toast" } as never, ctx) as ToastManager;
  return { ctx, toast, notify };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("$toast", () => {
  it("show() appends an item, returns its id, and notifies", () => {
    const { toast, notify } = build();
    const id = toast.show("Saved!", { tone: "success", title: "Done" });
    expect(typeof id).toBe("string");
    expect(toast.items).toHaveLength(1);
    expect(toast.items[0]).toMatchObject({ id, message: "Saved!", tone: "success", title: "Done" });
    expect(notify).toHaveBeenCalled();
  });

  it("tone shortcuts set the accent", () => {
    const { toast } = build();
    toast.success("a");
    toast.error("b");
    toast.info("c");
    toast.warning("d");
    expect(toast.items.map((t) => t.tone)).toEqual(["success", "danger", "info", "warning"]);
  });

  it("auto-dismisses after the duration elapses", () => {
    const { toast } = build();
    toast.show("bye", { duration: 1000 });
    expect(toast.items).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(toast.items).toHaveLength(0);
  });

  it("keeps a sticky toast when duration is 0", () => {
    const { toast } = build();
    toast.show("stay", { duration: 0 });
    vi.advanceTimersByTime(60_000);
    expect(toast.items).toHaveLength(1);
  });

  it("dismiss(id) removes a single toast", () => {
    const { toast } = build();
    const a = toast.show("a", { duration: 0 });
    toast.show("b", { duration: 0 });
    toast.dismiss(a);
    expect(toast.items.map((t) => t.message)).toEqual(["b"]);
  });

  it("clear() removes everything", () => {
    const { toast } = build();
    toast.show("a", { duration: 0 });
    toast.show("b", { duration: 0 });
    toast.clear();
    expect(toast.items).toHaveLength(0);
  });

  it("replaces the array identity on change (fine-grained reactivity)", () => {
    const { toast } = build();
    const before = toast.items;
    toast.show("a", { duration: 0 });
    expect(toast.items).not.toBe(before);
  });

  it("clears pending timers on context dispose", () => {
    const { ctx, toast } = build();
    toast.show("a", { duration: 1000 });
    disposeContext(ctx);
    expect(toast.items).toHaveLength(0);
    // The timer must not fire against the disposed context.
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(toast.items).toHaveLength(0);
  });
});

describe("$toast via author code", () => {
  it("is reachable as the reserved $toast namespace from author code", () => {
    const { toast } = build(`
$shown = $toast.show("Hello", { tone: "info" })
aktion = Stack()
    `);
    expect(toast.items.map((t) => t.message)).toEqual(["Hello"]);
    expect(toast.items[0]?.tone).toBe("info");
  });
});
