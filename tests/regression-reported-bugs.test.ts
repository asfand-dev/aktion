/**
 * Regression guards for a batch of reported bugs.
 *
 * Each `describe` block maps to one reported item. Some report items turned
 * out to be already-graceful / intentional (the tests pin that behaviour so
 * it does not silently regress); others were genuine defects fixed alongside
 * these tests.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";
import { Util } from "../src/runtime/util.js";
import { morphChildren } from "../src/renderer/morph.js";

/* -------------------------------------------------------------------------- */
/*  #1 — lexer must not hard-crash on legacy `@builtin(...)` / `$$x`           */
/* -------------------------------------------------------------------------- */

describe("#1 lexer is total — legacy syntax never throws from tokenize/parse", () => {
  it("does not throw on a legacy @builtin(...) call", () => {
    expect(() => parse("@builtin(1)\nx = 5")).not.toThrow();
  });

  it("recovers and still parses the valid trailing statement after @foo()", () => {
    const program = parse("@builtin(1)\nx = 5");
    const names = program.statements
      .map((s) => (s as { identifier?: string }).identifier)
      .filter(Boolean);
    expect(names).toContain("x");
  });

  it("does not throw on the legacy $$x sigil", () => {
    expect(() => parse("$$x = 5\ny = 2")).not.toThrow();
  });

  it("recovers to the next line after a malformed $$x statement", () => {
    const program = parse("$$x = 5\ny = 2");
    const names = program.statements
      .map((s) => (s as { identifier?: string }).identifier)
      .filter(Boolean);
    expect(names).toContain("y");
  });
});

/* -------------------------------------------------------------------------- */
/*  #2 — morph must reconcile property-based scroll / context-menu handlers   */
/* -------------------------------------------------------------------------- */

describe("#2 morph transfers non-pointer property handlers on re-render", () => {
  function keyedDiv(id: string): HTMLDivElement {
    const d = document.createElement("div");
    d.id = id;
    return d;
  }
  function fragmentOf(...nodes: Node[]): DocumentFragment {
    const f = document.createDocumentFragment();
    for (const n of nodes) f.appendChild(n);
    return f;
  }

  it("copies a fresh onscroll closure onto the kept node (VirtualList pattern)", () => {
    const container = document.createElement("div");
    const oldEl = keyedDiv("vlist");
    const stale = () => "stale";
    oldEl.onscroll = stale;
    container.appendChild(oldEl);

    const fresh = () => "fresh";
    const newEl = keyedDiv("vlist");
    newEl.onscroll = fresh;
    morphChildren(container, fragmentOf(newEl));

    // Same DOM node is kept (morph reuses it)…
    expect(container.children[0]).toBe(oldEl);
    // …but its onscroll handler is the freshly-rendered closure.
    expect(oldEl.onscroll).toBe(fresh);
    expect(oldEl.onscroll).not.toBe(stale);
  });

  it("copies a fresh oncontextmenu closure onto the kept node (editors pattern)", () => {
    const container = document.createElement("div");
    const oldEl = keyedDiv("menu");
    const stale = () => "stale";
    oldEl.oncontextmenu = stale;
    container.appendChild(oldEl);

    const fresh = () => "fresh";
    const newEl = keyedDiv("menu");
    newEl.oncontextmenu = fresh;
    morphChildren(container, fragmentOf(newEl));

    expect(container.children[0]).toBe(oldEl);
    expect(oldEl.oncontextmenu).toBe(fresh);
  });
});

/* -------------------------------------------------------------------------- */
/*  #3 — $util.filter / find string operators                                 */
/* -------------------------------------------------------------------------- */

describe("#3 filter/find support startsWith & endsWith operators", () => {
  const rows = [{ name: "alpha" }, { name: "beta" }, { name: "alphabet" }, { name: "gamma" }];

  it("filters with startsWith", () => {
    expect(Util.filter(rows, "name", "startsWith", "alph")).toEqual([
      { name: "alpha" },
      { name: "alphabet" },
    ]);
  });

  it("filters with endsWith", () => {
    expect(Util.filter(rows, "name", "endsWith", "a")).toEqual([
      { name: "alpha" },
      { name: "beta" },
      { name: "gamma" },
    ]);
  });

  it("find with startsWith returns the first match", () => {
    expect(Util.find(rows, "name", "startsWith", "be")).toEqual({ name: "beta" });
  });

  it("still supports the previously-implemented contains operator", () => {
    expect(Util.filter(rows, "name", "contains", "amm")).toEqual([{ name: "gamma" }]);
  });
});

/* -------------------------------------------------------------------------- */
/*  #6 — reconcileChildren keyed reorder + end-truncation correctness         */
/* -------------------------------------------------------------------------- */

describe("#6 reconcileChildren removes the right nodes on keyed reorders", () => {
  function keyed(id: string): HTMLDivElement {
    const d = document.createElement("div");
    d.id = id;
    d.textContent = id;
    return d;
  }
  function makeContainer(ids: string[]): { container: HTMLElement; nodes: Record<string, HTMLElement> } {
    const container = document.createElement("div");
    const nodes: Record<string, HTMLElement> = {};
    for (const id of ids) {
      const n = keyed(id);
      nodes[id] = n;
      container.appendChild(n);
    }
    return { container, nodes };
  }
  function freshFragment(ids: string[]): DocumentFragment {
    const f = document.createDocumentFragment();
    for (const id of ids) f.appendChild(keyed(id));
    return f;
  }
  const idsOf = (parent: Element): string[] =>
    Array.from(parent.children).map((c) => (c as HTMLElement).id);

  it("reverses a keyed list and reuses every node", () => {
    const { container, nodes } = makeContainer(["a", "b", "c"]);
    morphChildren(container, freshFragment(["c", "b", "a"]));
    expect(idsOf(container)).toEqual(["c", "b", "a"]);
    // No surplus, and the original instances are reused (not recreated).
    expect(container.children[0]).toBe(nodes.c);
    expect(container.children[1]).toBe(nodes.b);
    expect(container.children[2]).toBe(nodes.a);
  });

  it("removes a middle keyed node without disturbing its neighbours", () => {
    const { container, nodes } = makeContainer(["a", "b", "c"]);
    morphChildren(container, freshFragment(["a", "c"]));
    expect(idsOf(container)).toEqual(["a", "c"]);
    expect(container.children[0]).toBe(nodes.a);
    expect(container.children[1]).toBe(nodes.c);
  });

  it("drops a FRONT keyed node during a reorder (truncation must not eat 'c')", () => {
    const { container, nodes } = makeContainer(["a", "b", "c"]);
    morphChildren(container, freshFragment(["c", "b"]));
    expect(idsOf(container)).toEqual(["c", "b"]);
    expect(container.children[0]).toBe(nodes.c);
    expect(container.children[1]).toBe(nodes.b);
  });

  it("moves the first node to the end (A→tail)", () => {
    const { container, nodes } = makeContainer(["a", "b", "c", "d"]);
    morphChildren(container, freshFragment(["b", "c", "d", "a"]));
    expect(idsOf(container)).toEqual(["b", "c", "d", "a"]);
    expect(container.children[3]).toBe(nodes.a);
  });

  it("inserts a brand-new keyed node between two reused ones", () => {
    const { container, nodes } = makeContainer(["a", "b"]);
    morphChildren(container, freshFragment(["a", "x", "b"]));
    expect(idsOf(container)).toEqual(["a", "x", "b"]);
    expect(container.children[0]).toBe(nodes.a);
    expect(container.children[2]).toBe(nodes.b);
  });

  it("removes a middle UNKEYED node sandwiched between keyed siblings", () => {
    const container = document.createElement("div");
    const a = keyed("a");
    const filler = document.createElement("span"); // unkeyed
    filler.textContent = "filler";
    const b = keyed("b");
    container.append(a, filler, b);

    const f = document.createDocumentFragment();
    f.appendChild(keyed("a"));
    f.appendChild(keyed("b"));
    morphChildren(container, f);

    expect(idsOf(container)).toEqual(["a", "b"]);
    expect(container.children[0]).toBe(a);
    expect(container.children[1]).toBe(b);
    expect(container.contains(filler)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  #7 — a programmatic value change must reach a FOCUSED controlled input     */
/*       (e.g. clearing $input after Send; on macOS clicking a button does     */
/*       not blur the field, so a focus-gated sync would silently drop it).    */
/* -------------------------------------------------------------------------- */

describe("#7 morph syncs programmatic value changes into focused fields", () => {
  function freshInput(id: string, value: string): HTMLInputElement {
    const input = document.createElement("input");
    input.id = id;
    // Mirror how the library renders `value` — as an attribute.
    input.setAttribute("value", value);
    return input;
  }

  it("clears a focused text input when the bound value becomes empty", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const live = freshInput("chat", "");
      container.appendChild(live);
      // Simulate the user typing (dirties the property, not the attribute).
      live.value = "Hello there";
      live.focus();
      expect(document.activeElement).toBe(live);

      // Re-render after `$input = ""`: the fresh node carries value="".
      const f = document.createDocumentFragment();
      f.appendChild(freshInput("chat", ""));
      morphChildren(container, f);

      // Same node is reused AND its value reflects the programmatic clear,
      // even though the field is still focused.
      expect(container.children[0]).toBe(live);
      expect(live.value).toBe("");
      expect(document.activeElement).toBe(live);
    } finally {
      container.remove();
    }
  });

  it("does not clobber an in-flight keystroke (state mirrors the DOM)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const live = freshInput("name", "ab");
      container.appendChild(live);
      live.value = "ab";
      live.focus();
      live.setSelectionRange(1, 1); // caret in the middle

      // A re-render where the bound value equals what the user already typed.
      const f = document.createDocumentFragment();
      f.appendChild(freshInput("name", "ab"));
      morphChildren(container, f);

      expect(live.value).toBe("ab");
      // Caret is untouched because the sync was a no-op.
      expect(live.selectionStart).toBe(1);
    } finally {
      container.remove();
    }
  });

  it("applies a programmatic value change to a focused <select>", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      const buildSelect = (value: string): HTMLSelectElement => {
        const select = document.createElement("select");
        for (const v of ["a", "b"]) {
          const opt = document.createElement("option");
          opt.value = v;
          opt.textContent = v;
          select.appendChild(opt);
        }
        select.value = value;
        return select;
      };
      const live = buildSelect("a");
      container.appendChild(live);
      live.focus();

      const f = document.createDocumentFragment();
      f.appendChild(buildSelect("b"));
      morphChildren(container, f);

      expect(live.value).toBe("b");
    } finally {
      container.remove();
    }
  });
});
