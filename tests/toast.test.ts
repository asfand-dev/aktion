/**
 * `$toast` — imperative toast manager. Replaces hand-managing a `$toasts`
 * array: `show` appends + arms an auto-dismiss timer, tone shortcuts set the
 * accent, `dismiss`/`clear` remove entries, and timers are cleared on dispose.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * The corners the `Toasts` component itself accepts, read off its spec instead
 * of re-typed here. The runtime keeps its own copy of this list (see the last
 * describe in this file), so a third hand-written copy in the test would just
 * be one more thing to drift.
 */
const TOASTS_POSITIONS: readonly string[] = (() => {
  const spec = defaultLibrary.components.find((c) => c.name === "Toasts");
  const position = spec?.props.find((p) => p.name === "position");
  if (!position?.enum) throw new Error("Toasts.position lost its enum");
  return position.enum;
})();

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

/**
 * Auto-rendered toast layer: `$toast.show/.success/...` should display without
 * the author wiring a `Toasts(...)` into `$app`. The runtime appends a
 * synthesized `Toasts(Toast...)` node to the UI root — unless the program
 * already renders `$toast.items` itself (then it owns placement; no double).
 */
describe("$toast auto-render", () => {
  type Node = { __kind?: string; name?: string; args?: unknown[] };
  const renderRoot = (ctx: ReturnType<typeof build>["ctx"]): unknown =>
    ctx.bindings.get("aktion")?.();
  const toastersIn = (tree: unknown): Node[] => {
    const list = Array.isArray(tree) ? tree : [tree];
    return list.filter(
      (n): n is Node => Boolean(n) && (n as Node).__kind === "Component" && (n as Node).name === "Toasts",
    );
  };

  it("appends a Toasts layer when the program does not render $toast.items", () => {
    const { ctx, toast } = build("$app(Stack())");
    toast.success("Working!");
    const toasters = toastersIn(renderRoot(ctx));
    expect(toasters).toHaveLength(1);
    const children = toasters[0]!.args![0] as Node[];
    expect(children).toHaveLength(1);
    expect(children[0]!.name).toBe("Toast");
  });

  it("renders no layer when there are no toasts", () => {
    const { ctx } = build("$app(Stack())");
    expect(toastersIn(renderRoot(ctx))).toHaveLength(0);
  });

  it("reflects multiple toasts and drops them as they are dismissed", () => {
    const { ctx, toast } = build("$app(Stack())");
    toast.show("a", { duration: 0 });
    const b = toast.show("b", { duration: 0 });
    expect((toastersIn(renderRoot(ctx))[0]!.args![0] as Node[])).toHaveLength(2);
    toast.dismiss(b);
    expect((toastersIn(renderRoot(ctx))[0]!.args![0] as Node[])).toHaveLength(1);
  });

  it("does NOT auto-render when the program already renders $toast.items (no double)", () => {
    const { ctx, toast } = build(
      "$app(Toasts($toast.items.map(t => Toast({ message: t.message, tone: t.tone, onClose: () => $toast.dismiss(t.id) }))))",
    );
    toast.success("hi");
    // Exactly one Toasts node — the author's — not a second injected one.
    expect(toastersIn(renderRoot(ctx))).toHaveLength(1);
  });

  it("auto-renders for the legacy `aktion = ...` root form too", () => {
    const { ctx, toast } = build("aktion = Stack()");
    toast.success("legacy");
    expect(toastersIn(renderRoot(ctx))).toHaveLength(1);
  });

  it("puts a message-only toast in the prominent title slot (no empty title row)", () => {
    const { ctx, toast } = build("$app(Stack())");
    toast.success("Just a message");
    const toastNode = (toastersIn(renderRoot(ctx))[0]!.args![0] as Node[])[0]!;
    // Toast prop order is [title, message, ...]; message-only → title slot.
    expect(toastNode.args![0]).toBe("Just a message");
    expect(toastNode.args![1]).toBeUndefined();
  });

  it("the synthesized Toast's onClose dismisses through the manager", () => {
    const { ctx, toast } = build("$app(Stack())");
    toast.show("x", { duration: 0 });
    const toastNode = (toastersIn(renderRoot(ctx))[0]!.args![0] as Node[])[0]!;
    const onClose = toastNode.args!.find((a) => typeof a === "function") as () => void;
    expect(toast.items).toHaveLength(1);
    onClose();
    expect(toast.items).toHaveLength(0);
  });

  /**
   * `$toast.configure({position})` moves the layer the runtime renders on the
   * program's behalf. Programs that place their own `Toasts(...)` already own
   * their corner, so the interesting cases are what reaches the auto-layer and
   * what must not reach it at all.
   */
  describe("configure({ position })", () => {
    /** The single auto-rendered (or author-rendered) stack in the tree. */
    const layerOf = (ctx: ReturnType<typeof build>["ctx"]): Node => {
      const found = toastersIn(renderRoot(ctx));
      expect(found).toHaveLength(1);
      return found[0]!;
    };

    it("passes no position argument at all when the program never configures one", () => {
      const { ctx, toast } = build("$app(Stack())");
      toast.success("Working!");
      const layer = layerOf(ctx);
      // No second argument at all: the component's own "top-right" is the
      // answer for a program that never asked for a corner, so nothing —
      // not even a runtime-side default — should fill the position slot.
      expect(layer.args).toHaveLength(1);
      // Slot 0 is still the children, exactly as the block above asserts.
      const children = layer.args![0] as Node[];
      expect(children).toHaveLength(1);
      expect(children[0]!.name).toBe("Toast");
    });

    it("puts a configured corner on the stack from a top-level configure call", () => {
      const { ctx, toast } = build(`
$toast.configure({ position: "bottom-center" })
$app(Stack())
      `);
      toast.success("Saved");
      const layer = layerOf(ctx);
      expect(layer.args![1]).toBe("bottom-center");
      // The corner rides in slot 1; the children keep slot 0.
      expect(layer.args![0]).toHaveLength(1);
    });

    it("accepts every corner the Toasts component declares", () => {
      for (const position of TOASTS_POSITIONS) {
        const { ctx, toast } = build("$app(Stack())");
        toast.configure({ position });
        toast.success("x");
        expect(layerOf(ctx).args![1], position).toBe(position);
      }
    });

    it("ignores anything that is not a real corner", () => {
      // A typo must not reach the component: an unknown `data-position` matches
      // no stylesheet rule, which pins the stack to nothing at all — a worse
      // outcome than quietly keeping the default corner.
      for (const bad of ["middle", "", null, 42, { position: "top-left" }]) {
        const { ctx, toast } = build("$app(Stack())");
        toast.configure({ position: bad } as never);
        toast.success("x");
        expect(layerOf(ctx).args, JSON.stringify(bad)).toHaveLength(1);
      }
    });

    it("treats configure() and configure({}) as no-ops instead of throwing", () => {
      const bare = build("$app(Stack())");
      expect(() => bare.toast.configure()).not.toThrow();
      bare.toast.success("x");
      expect(layerOf(bare.ctx).args).toHaveLength(1);

      const empty = build("$app(Stack())");
      expect(() => empty.toast.configure({})).not.toThrow();
      empty.toast.success("x");
      expect(layerOf(empty.ctx).args).toHaveLength(1);
    });

    it("is idempotent, last-call-wins, and a bad value never clobbers a good one", () => {
      const { ctx, toast } = build("$app(Stack())");
      toast.configure({ position: "bottom-left" });
      toast.configure({ position: "bottom-left" });
      toast.success("x");
      expect(layerOf(ctx).args![1]).toBe("bottom-left");
      toast.configure({ position: "top-center" });
      expect(layerOf(ctx).args![1]).toBe("top-center");
      toast.configure({ position: "middle" } as never);
      expect(layerOf(ctx).args![1]).toBe("top-center");
    });

    it("notifies so an already-visible stack moves to the new corner", () => {
      const { toast, notify } = build("$app(Stack())");
      toast.success("x");
      notify.mockClear();
      toast.configure({ position: "bottom-center" });
      expect(notify).toHaveBeenCalled();
    });

    it("does not mark the program as rendering the stack itself", () => {
      // Asserted on the context flag rather than through a render, because a
      // render cannot see this: the root binding clears the flag at the start
      // of every pass, so one `configure` flipped outside that window is wiped
      // before it is read. The flag is what makes the auto-layer step aside, so
      // setting it here would make a `configure` that runs mid-pass (a function
      // component choosing its own placement) swallow every toast instead.
      const { ctx, toast } = build("$app(Stack())");
      toast.configure({ position: "bottom-center" });
      expect(ctx.toastItemsRead).not.toBe(true);
    });

    it("does not count as reading $toast.items — the auto-layer still renders", () => {
      const { ctx, toast } = build(`
$toast.configure({ position: "top-center" })
$app(Stack())
      `);
      toast.success("still auto-rendered");
      // The outside view of the test above: configuring is not rendering, so
      // the runtime still owns the stack and places it where it was asked to.
      // The failure this pair guards against is silent either way — a stack
      // nobody wrote (every toast lost), or two stacks (every toast doubled).
      expect(layerOf(ctx).args![1]).toBe("top-center");
    });

    it("leaves a hand-rendered stack alone — one stack, at the author's own corner", () => {
      const { ctx, toast } = build(`
$toast.configure({ position: "bottom-center" })
$app(Toasts($toast.items.map(t => Toast({ message: t.message, tone: t.tone, onClose: () => $toast.dismiss(t.id) }))))
      `);
      toast.success("hi");
      // The converse of the case above: reading `$toast.items` still opts out,
      // so there is exactly one stack — the author's — not a second injected
      // one showing every toast twice.
      const layer = layerOf(ctx);
      // ...and `configure` does not reach into it: only the author's own
      // `Toasts(...)` call positions a hand-placed stack.
      expect(layer.args).toHaveLength(1);
    });
  });
});

/**
 * The runtime restates the six stack corners in its own `STACK_POSITIONS`
 * instead of importing `TOASTS_POSITIONS` from the component library, because
 * the runtime must not depend on the library. That duplication is deliberate,
 * which means something has to hold the two copies together: if the library
 * grows a seventh corner, `$toast.configure` would silently reject it and the
 * program would keep the default with no error anywhere.
 */
describe("$toast.configure's corner list vs the Toasts component's own", () => {
  const source = readFileSync(join(process.cwd(), "src", "runtime", "toast.ts"), "utf8");

  it("restates exactly the corners the Toasts spec declares", () => {
    const literal = /const STACK_POSITIONS[^=]*=\s*\[([\s\S]*?)\]/.exec(source);
    expect(literal, "STACK_POSITIONS array literal in src/runtime/toast.ts").toBeTruthy();
    const runtimeList = [...literal![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    // Compared as sets: `includes` is what reads the runtime list, so its order
    // carries no behaviour — only membership does.
    expect([...runtimeList].sort()).toEqual([...TOASTS_POSITIONS].sort());
  });

  it("keeps the runtime free of the component library", () => {
    // The reason the list is duplicated at all. If this ever becomes a real
    // import the duplication should go, and so should the test above.
    expect(source).not.toMatch(/from "\.\.\/library/);
    expect(source).not.toContain("TOASTS_POSITIONS");
  });
});
