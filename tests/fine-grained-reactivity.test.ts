/**
 * Fine-grained (path-level) reactivity.
 *
 * Reading `$user.name` subscribes to the path `user.name`, not the whole
 * `$user` graph. A write to a sibling path (`user.role`) must not wake a
 * reader of `user.name`; a write to an ancestor (`user`) or descendant
 * (`user.name.first`) must. These tests pin down the three layers:
 *
 *   1. the `StateStore` overlap predicate + precise change paths,
 *   2. the evaluator's precise dependency tracking, and
 *   3. the end-to-end render gate (no re-render when an unread path changes),
 *      plus computed-derivation and effect granularity.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { StateStore, pathAffects, anyPathAffects, pathsOverlap } from "../src/runtime/state.js";
import { createContext, evaluate, planProgram } from "../src/runtime/evaluator.js";
import { parse } from "../src/parser/index.js";
import { defaultLibrary } from "../src/library/index.js";
import { Renderer } from "../src/renderer/renderer.js";

const tick = () => Promise.resolve();
const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

// ──────────────────────────────────────────────────────────────────────
// 1. StateStore — the path-overlap contract
// ──────────────────────────────────────────────────────────────────────
describe("StateStore — path overlap predicate", () => {
  it("matches equal paths, ancestors, and descendants; rejects siblings", () => {
    expect(pathAffects("user.name", "user.name")).toBe(true); // equal
    expect(pathAffects("user", "user.name")).toBe(true);       // ancestor changed
    expect(pathAffects("user.name", "user")).toBe(true);       // descendant changed
    expect(pathAffects("user.name.first", "user.name")).toBe(true);
    expect(pathAffects("user.role", "user.name")).toBe(false); // siblings
    expect(pathAffects("user", "username")).toBe(false);       // dot-boundary, not substring
    expect(pathAffects("cart", "user")).toBe(false);
  });

  it("anyPathAffects / pathsOverlap fold the predicate over sets", () => {
    const changed = new Set(["user.role", "cart.total"]);
    expect(anyPathAffects(changed, "user.name")).toBe(false);
    expect(anyPathAffects(changed, "cart")).toBe(true);          // ancestor of cart.total
    expect(pathsOverlap(changed, ["user.name", "cart.total"])).toBe(true);
    expect(pathsOverlap(changed, ["user.name", "settings"])).toBe(false);
  });

  it("setPath emits the precise changed path; set emits the root", async () => {
    const store = new StateStore();
    store.declare("user", { name: "Ada", role: "Engineer" });
    const seen: string[][] = [];
    store.subscribe((changed) => seen.push([...changed]));

    store.setPath("user", ["role"], "Manager");
    await tick();
    expect(seen.at(-1)).toEqual(["user.role"]); // not ["user"]

    store.set("user", { name: "Bea", role: "Lead" });
    await tick();
    expect(seen.at(-1)).toEqual(["user"]); // whole-atom replacement
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2. Evaluator — precise dependency tracking
// ──────────────────────────────────────────────────────────────────────
describe("Evaluator — precise path tracking", () => {
  /** Evaluate `exprSrc` against `program` and return the tracked path set. */
  function depsOf(program: string, exprSrc: string): string[] {
    const state = new StateStore();
    const ctx = createContext(state, { library: defaultLibrary });
    planProgram(parse(program), ctx);
    const sub = parse(`__probe = ${exprSrc}`);
    const stmt = sub.statements[0] as { expression: import("../src/parser/types.js").Expression };
    const tracker = new Set<string>();
    ctx.trackedState = tracker;
    evaluate(stmt.expression, ctx);
    return [...tracker];
  }

  it("tracks a bare atom by its root path", () => {
    expect(depsOf(`$user = { name: "A" }`, `$user`)).toEqual(["user"]);
  });

  it("tracks an object field by its precise path", () => {
    expect(depsOf(`$user = { name: "A", role: "B" }`, `$user.name`)).toEqual(["user.name"]);
  });

  it("tracks a deep object path segment-by-segment", () => {
    expect(depsOf(`$u = { a: { b: { c: 1 } } }`, `$u.a.b.c`)).toEqual(["u.a.b.c"]);
  });

  it("reading two sibling fields tracks both precise paths (no coarse root)", () => {
    const program = `$user = { name: "A", role: "B" }`;
    expect(depsOf(program, `$user.name + $user.role`).sort()).toEqual(["user.name", "user.role"]);
  });

  it("falls back to the container path at arrays (index access)", () => {
    expect(depsOf(`$cart = { items: [{ n: 1 }] }`, `$cart.items[0]`)).toEqual(["cart.items"]);
  });

  it("falls back to the array root for array pluck", () => {
    expect(depsOf(`$rows = [{ name: "a" }]`, `$rows.name`)).toEqual(["rows"]);
  });

  it("falls back to the container path for a dynamic key, and tracks the key's own deps", () => {
    const program = `$obj = { a: 1, b: 2 }\n$key = "a"`;
    expect(depsOf(program, `$obj[$key]`).sort()).toEqual(["key", "obj"]);
  });

  it("non-state-rooted member chains are unaffected (loop vars, etc.)", () => {
    // `route.params` roots at the `route` identifier, tracked coarsely as "route".
    expect(depsOf(`$x = 1`, `route.path`)).toEqual(["route"]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 3. End-to-end — render gate, derivations, effects
// ──────────────────────────────────────────────────────────────────────
interface AktionEl extends HTMLElement {
  setResponse(text: string): void;
  state: StateStore;
}

function create(): AktionEl {
  const el = document.createElement("aktion-app") as AktionEl;
  document.body.appendChild(el);
  return el;
}
const textOf = (el: AktionEl): string => el.shadowRoot!.textContent ?? "";
async function clickButton(el: AktionEl, label: string): Promise<void> {
  const btn = [...el.shadowRoot!.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").includes(label),
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error(`No button "${label}"`);
  btn.click();
  await settle();
}

describe("Fine-grained reactivity — render gate", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("does NOT re-render when an unread sibling path changes, but DOES when the read path changes", async () => {
    const renderSpy = vi.spyOn(Renderer.prototype, "render");
    const el = await (async () => {
      const e = create();
      e.setResponse(`
        $user = { name: "Ada", role: "Engineer" }
        function changeRole() { $user.role = "Manager" }
        function changeName() { $user.name = "Bob" }
        aktion = Stack([
          Text($user.name),
          Button("role", { onClick: changeRole }),
          Button("name", { onClick: changeName })
        ])
      `);
      await settle();
      return e;
    })();

    expect(textOf(el)).toContain("Ada");
    const baseline = renderSpy.mock.calls.length;

    // Writing the *unread* sibling `user.role` must not re-render…
    await clickButton(el, "role");
    expect(el.state.get("user")).toMatchObject({ role: "Manager" }); // the write landed
    expect(renderSpy.mock.calls.length).toBe(baseline);              // but no render
    expect(textOf(el)).toContain("Ada");

    // …while writing the *read* path `user.name` re-renders and updates the DOM.
    await clickButton(el, "name");
    expect(renderSpy.mock.calls.length).toBeGreaterThan(baseline);
    expect(textOf(el)).toContain("Bob");
  });

  it("re-renders when the whole atom (an ancestor of the read path) is replaced", async () => {
    const el = create();
    el.setResponse(`
      $user = { name: "Ada", role: "Engineer" }
      aktion = Text($user.name)
    `);
    await settle();
    expect(textOf(el)).toContain("Ada");

    // Replacing the whole `$user` atom → changed path "user", an ancestor of
    // the read "user.name" → must re-render.
    el.state.set("user", { name: "Zed", role: "X" });
    await settle();
    expect(textOf(el)).toContain("Zed");
  });

  it("two sibling readers each update only for their own field", async () => {
    const el = create();
    el.setResponse(`
      $user = { name: "Ada", role: "Engineer" }
      function changeName() { $user.name = "Bob" }
      aktion = Stack([
        Text(\`name:\${$user.name}\`),
        Text(\`role:\${$user.role}\`),
        Button("go", { onClick: changeName })
      ])
    `);
    await settle();
    expect(textOf(el)).toContain("name:Ada");
    expect(textOf(el)).toContain("role:Engineer");

    await clickButton(el, "go");
    expect(textOf(el)).toContain("name:Bob");
    expect(textOf(el)).toContain("role:Engineer");
  });
});

describe("Fine-grained reactivity — computed derivations", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("recomputes a derived atom only for overlapping paths", async () => {
    const store = new StateStore();
    const ctx = createContext(store, { library: defaultLibrary });
    planProgram(
      parse(`
        $user = { name: "Ada", role: "Engineer" }
        $greeting = "Hi " + $user.name
        aktion = Text($greeting)
      `),
      ctx,
    );
    expect(store.get("greeting")).toBe("Hi Ada");

    // Sibling write — derivation depends on user.name, so greeting is stable.
    store.setPath("user", ["role"], "Manager");
    await settle();
    expect(store.get("greeting")).toBe("Hi Ada");

    // Relevant write — recompute.
    store.setPath("user", ["name"], "Bob");
    await settle();
    expect(store.get("greeting")).toBe("Hi Bob");

    // Whole-atom replacement (ancestor) — recompute.
    store.set("user", { name: "Cleo", role: "Lead" });
    await settle();
    expect(store.get("greeting")).toBe("Hi Cleo");
  });
});

describe("Fine-grained reactivity — effects", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("fires a `[$user.name]` effect only for name changes, not sibling role changes", async () => {
    const el = create();
    el.setResponse(`
      $user = { name: "Ada", role: "Engineer" }
      $fires = 0
      $effect(() => { $fires = $fires + 1 }, [$user.name])
      aktion = Text(\`\${$fires}\`)
    `);
    await settle();
    // Runs once on mount.
    expect(el.state.get("fires")).toBe(1);

    // Sibling path — must NOT fire the effect.
    el.state.setPath("user", ["role"], "Manager");
    await settle();
    expect(el.state.get("fires")).toBe(1);

    // Tracked path — fires.
    el.state.setPath("user", ["name"], "Bob");
    await settle();
    expect(el.state.get("fires")).toBe(2);

    // Ancestor (whole atom) — fires.
    el.state.set("user", { name: "Cleo", role: "Lead" });
    await settle();
    expect(el.state.get("fires")).toBe(3);
  });
});
