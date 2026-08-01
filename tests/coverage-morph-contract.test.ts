/**
 * The morph reconciler's contract, end to end.
 *
 * Every commit re-evaluates the whole tree and hands the freshly-rendered DOM to
 * `morphChildren(container, fresh)`. The reconciler keeps as much of the LIVE DOM
 * as it can, because the live DOM is where the browser parks state the render
 * output knows nothing about: a typed value, a caret, an IME composition, a
 * user-opened `<details>`, a canvas bitmap, a promoted overlay's measured
 * coordinates, a third-party widget's children.
 *
 * That makes the reconciler a two-sided promise, and both sides break silently:
 *
 *   - keep too little → the user's typing / focus / open panel is destroyed on
 *     an unrelated state change somewhere else in the app;
 *   - keep too much   → a stale attribute, a stale closure, or a stale text node
 *     survives and the UI stops reflecting state.
 *
 * The suites below pin the promise from the outside — what an author or a user
 * can observe: node identity, attributes (including removal and the handful of
 * element-owned exemptions), handler currency, text updates, keyed vs positional
 * child reuse, form state, focus and composition. Nothing here asserts geometry
 * or resolved CSS (happy-dom has neither), and nothing asserts a literal class
 * string or palette value.
 *
 * `tests/morph-uncontrolled-inputs.test.ts` (uncontrolled `<input>` state),
 * `tests/morph-event-props-coverage.test.ts` (EVENT_PROPS covers every handler
 * the library assigns) and `tests/regression-reported-bugs.test.ts` (#2/#6/#7)
 * cover slices of this; this file extends rather than repeats them.
 *
 * Three suites at the bottom are marked `it.fails` — they encode contracts the
 * reconciler documents but does not yet honour (uncontrolled `<textarea>` and
 * `<select>` state). They pass while the defect exists and go red the moment it
 * is fixed, which is the signal to flip them to `it`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { morphChildren, morphNode } from "../src/renderer/morph.js";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

/** Build a node the way a component's `render` would: attributes + children. */
function h(
  tag: string,
  attrs: Record<string, string> = {},
  kids: Array<Node | string> = [],
): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const kid of kids) {
    node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return node;
}

/** The renderer always hands morph a fragment of siblings. */
function fresh(...nodes: Node[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const node of nodes) f.appendChild(node);
  return f;
}

/**
 * A container attached to the document. Attachment matters: focus,
 * `activeElement` and the caret logic all consult the root node.
 */
function stage(...nodes: Node[]): HTMLElement {
  const host = document.createElement("div");
  for (const node of nodes) host.appendChild(node);
  document.body.appendChild(host);
  return host;
}

/** An element carrying an author key, as `renderer.ts` stamps it. */
function row(key: string, kids: Array<Node | string> = [], tag = "div"): HTMLElement {
  return h(tag, { "data-rui-key": key }, kids);
}

const keysOf = (parent: Element): string[] =>
  [...parent.children].map((c) => c.getAttribute("data-rui-key") ?? (c.id || c.tagName));

const tagsOf = (parent: Element): string[] => [...parent.children].map((c) => c.tagName);

/**
 * happy-dom throws from `ShadowRoot.activeElement` once the focused node has
 * been detached, so every focused element is blurred before teardown.
 */
let focusedNode: HTMLElement | null = null;
function focusIt(el: HTMLElement): void {
  el.focus();
  focusedNode = el;
}

afterEach(() => {
  focusedNode?.blur();
  focusedNode = null;
  document.body.innerHTML = "";
});

/* -------------------------------------------------------------------------- */
/*  1. Node identity                                                           */
/* -------------------------------------------------------------------------- */

describe("morph: node identity across a re-render", () => {
  it("keeps the live element and patches it when the tag matches", () => {
    const container = stage(h("div", { class: "card", "data-tone": "info" }, ["one"]));
    const liveEl = container.firstElementChild!;

    morphChildren(container, fresh(h("div", { class: "card raised", "data-tone": "warn" }, ["two"])));

    expect(container.firstElementChild).toBe(liveEl);
    expect(liveEl.getAttribute("data-tone")).toBe("warn");
    expect(liveEl.classList.contains("raised")).toBe(true);
    expect(liveEl.textContent).toBe("two");
  });

  it("keeps identity for every node of a matching subtree, not just the root", () => {
    const label = h("span", {}, ["Old"]);
    const item = h("li", {}, [label]);
    const list = h("ul", {}, [item]);
    const container = stage(h("section", {}, [list]));
    const section = container.firstElementChild!;

    morphChildren(
      container,
      fresh(h("section", {}, [h("ul", {}, [h("li", {}, [h("span", {}, ["New"])])])])),
    );

    expect(container.firstElementChild).toBe(section);
    expect(section.firstElementChild).toBe(list);
    expect(list.firstElementChild).toBe(item);
    expect(item.firstElementChild).toBe(label);
    expect(label.textContent).toBe("New");
  });

  it("replaces the live element when the tag differs, detaching the old one", () => {
    const container = stage(h("div", {}, ["placeholder"]));
    const liveEl = container.firstElementChild!;
    const replacement = h("span", {}, ["real content"]);

    morphChildren(container, fresh(replacement));

    expect(container.firstElementChild).toBe(replacement);
    expect(liveEl.isConnected).toBe(false);
    expect(container.textContent).toBe("real content");
  });

  it("`morphNode` returns whichever node is live afterwards", () => {
    const kept = h("p", {}, ["a"]);
    stage(kept);
    expect(morphNode(kept, h("p", {}, ["b"]))).toBe(kept);

    const doomed = h("p", {}, ["a"]);
    stage(doomed);
    const swapped = h("h2", {}, ["b"]);
    expect(morphNode(doomed, swapped)).toBe(swapped);
  });

  it("replaces across node types in both directions", () => {
    const container = stage(document.createTextNode("just text"));
    const el = h("strong", {}, ["now an element"]);
    morphChildren(container, fresh(el));
    expect(container.firstChild).toBe(el);

    const backToText = document.createTextNode("text again");
    morphChildren(container, fresh(backToText));
    expect(container.firstChild).toBe(backToText);
    expect(container.textContent).toBe("text again");
  });

  it("replaces only the node whose tag changed and leaves its siblings in place", () => {
    const first = h("div", {}, ["1"]);
    const middle = h("div", {}, ["2"]);
    const last = h("div", {}, ["3"]);
    const container = stage(first, middle, last);

    morphChildren(container, fresh(h("div", {}, ["1"]), h("span", {}, ["2"]), h("div", {}, ["3"])));

    expect(tagsOf(container)).toEqual(["DIV", "SPAN", "DIV"]);
    expect(container.children[0]).toBe(first);
    expect(container.children[2]).toBe(last);
    expect(middle.isConnected).toBe(false);
  });

});

/* -------------------------------------------------------------------------- */
/*  2. Attributes: add / update / remove                                       */
/* -------------------------------------------------------------------------- */

describe("morph: attribute add, update and removal", () => {
  it("adds attributes the fresh render introduced", () => {
    const container = stage(h("button", {}, ["Menu"]));
    const button = container.firstElementChild!;

    morphChildren(
      container,
      fresh(h("button", { "aria-expanded": "true", "aria-controls": "menu-1" }, ["Menu"])),
    );

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe("menu-1");
  });

  it("updates a changed attribute, including reflected properties", () => {
    const container = stage(h("button", { "aria-expanded": "true" }, ["Menu"]));
    const button = container.firstElementChild as HTMLButtonElement;

    morphChildren(container, fresh(h("button", { "aria-expanded": "false", disabled: "" }, ["Menu"])));

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.disabled).toBe(true);
  });

  it("removes an attribute the fresh render no longer emits", () => {
    const container = stage(
      h("input", { type: "text", "aria-invalid": "true", "aria-describedby": "err-1" }),
    );
    const input = container.firstElementChild as HTMLInputElement;

    // The field validated: the error is gone from the render output.
    morphChildren(container, fresh(h("input", { type: "text" })));

    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(input.getAttribute("type")).toBe("text");
  });

  it("clears a boolean attribute so the element stops being hidden/disabled", () => {
    const container = stage(h("div", { hidden: "", "aria-busy": "true" }, ["Results"]));
    const panel = container.firstElementChild as HTMLElement;

    morphChildren(container, fresh(h("div", {}, ["Results"])));

    expect(panel.hidden).toBe(false);
    expect(panel.hasAttribute("aria-busy")).toBe(false);
  });

  it("patches attributes on descendants, not only the reconciled root", () => {
    const inner = h("span", { "aria-hidden": "true", class: "icon" });
    const container = stage(h("div", {}, [inner]));

    morphChildren(container, fresh(h("div", {}, [h("span", { class: "icon spin", role: "img" })])));

    expect(container.firstElementChild!.firstElementChild).toBe(inner);
    expect(inner.hasAttribute("aria-hidden")).toBe(false);
    expect(inner.getAttribute("role")).toBe("img");
    expect(inner.classList.contains("spin")).toBe(true);
  });

  it("applies a class swap as a replacement, not a merge", () => {
    const container = stage(h("div", { class: "chip chip-selected" }, ["Tag"]));
    const chip = container.firstElementChild!;

    morphChildren(container, fresh(h("div", { class: "chip" }, ["Tag"])));

    expect(chip.classList.contains("chip")).toBe(true);
    expect(chip.classList.contains("chip-selected")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  3. Element-owned state the strip pass must not touch                       */
/* -------------------------------------------------------------------------- */

describe("morph: element-owned attributes survive the strip pass", () => {
  it("keeps a user-opened <details> open when the render does not emit `open`", () => {
    const container = stage(h("details", { class: "accordion" }, [h("summary", {}, ["More"])]));
    const details = container.firstElementChild as HTMLDetailsElement;
    details.open = true; // what the UA does when the user clicks the summary

    morphChildren(
      container,
      fresh(h("details", { class: "accordion" }, [h("summary", {}, ["More"])])),
    );

    expect(container.firstElementChild).toBe(details);
    expect(details.open).toBe(true);
  });

  it("does not make <details> immune: other stale attributes are still stripped", () => {
    const container = stage(
      h("details", { open: "", "data-state": "open", "aria-busy": "true" }, [h("summary", {}, ["More"])]),
    );
    const details = container.firstElementChild as HTMLDetailsElement;

    morphChildren(
      container,
      fresh(h("details", { "data-state": "closed" }, [h("summary", {}, ["More"])])),
    );

    expect(details.open).toBe(true);
    expect(details.hasAttribute("aria-busy")).toBe(false);
    expect(details.getAttribute("data-state")).toBe("closed");
  });

  it("keeps a <canvas> drawing buffer that was sized after mount", () => {
    const container = stage(h("canvas", { class: "sparkline" }));
    const canvas = container.firstElementChild as HTMLCanvasElement;
    // The component measured its container post-paint and sized the buffer.
    canvas.setAttribute("width", "640");
    canvas.setAttribute("height", "180");

    morphChildren(container, fresh(h("canvas", { class: "sparkline" })));

    expect(container.firstElementChild).toBe(canvas);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(180);
  });

  it("still lets the render assert new canvas dimensions", () => {
    const container = stage(h("canvas", { width: "640", height: "180" }));
    const canvas = container.firstElementChild as HTMLCanvasElement;

    morphChildren(container, fresh(h("canvas", { width: "320", height: "90" })));

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(90);
  });

  it("keeps a promoted floating panel in the top layer at its measured position", () => {
    const panel = h("div", {
      class: "menu",
      popover: "manual",
      style: "position:fixed;top:120px;left:40px",
      "data-floating-side": "bottom",
    });
    const container = stage(panel);

    // The fresh render knows nothing about promotion: no `popover`, no measured
    // coordinates, and a static `style` of its own.
    morphChildren(container, fresh(h("div", { class: "menu open", style: "width:220px", role: "menu" })));

    expect(container.firstElementChild).toBe(panel);
    expect(panel.getAttribute("popover")).toBe("manual");
    expect(panel.getAttribute("data-floating-side")).toBe("bottom");
    expect(panel.getAttribute("style")).toContain("top:120px");
    expect(panel.getAttribute("style")).not.toContain("width:220px");
    // Everything the render DOES own still updates.
    expect(panel.classList.contains("open")).toBe(true);
    expect(panel.getAttribute("role")).toBe("menu");
  });

  it("hands `popover`/`style` back to the render once the panel is no longer promoted", () => {
    // The floating layer removes `data-floating-side` on close and restores the
    // original style, so ownership returns to the render output.
    const panel = h("div", { class: "menu", popover: "manual", style: "position:fixed;top:9px" });
    const container = stage(panel);

    morphChildren(container, fresh(h("div", { class: "menu" })));

    expect(panel.hasAttribute("popover")).toBe(false);
    expect(panel.hasAttribute("style")).toBe(false);
  });

  it("protects a promoted panel that is also a preserved widget host", () => {
    const panel = h("div", {
      "data-rui-preserve": "",
      popover: "manual",
      style: "position:fixed;top:33px",
      "data-floating-side": "top",
      class: "picker",
    });
    const container = stage(panel);

    morphChildren(
      container,
      fresh(h("div", { "data-rui-preserve": "", class: "picker active", style: "top:0" })),
    );

    expect(panel.getAttribute("style")).toContain("top:33px");
    expect(panel.getAttribute("popover")).toBe("manual");
    expect(panel.classList.contains("active")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  4. `data-rui-preserve` — imperative subtrees                               */
/* -------------------------------------------------------------------------- */

describe("morph: data-rui-preserve keeps a widget's DOM to itself", () => {
  it("never reconciles the children of a preserved host", () => {
    const host = h("div", { "data-rui-preserve": "", "data-rui-key": "chart-1" });
    const container = stage(host);
    // The widget built its own DOM after mount.
    const widgetCanvas = h("canvas", { class: "chart-surface" });
    host.append(widgetCanvas, h("div", { class: "chart-legend" }, ["Revenue"]));

    // A re-render of the host component, whose own children are a placeholder.
    morphChildren(
      container,
      fresh(h("div", { "data-rui-preserve": "", "data-rui-key": "chart-1" }, [h("span", {}, ["loading"])])),
    );

    expect(container.firstElementChild).toBe(host);
    expect(host.firstElementChild).toBe(widgetCanvas);
    expect(host.children.length).toBe(2);
    expect(host.textContent).toContain("Revenue");
    expect(host.textContent).not.toContain("loading");
  });

  it("honours the flag when only the FRESH node carries it", () => {
    const host = h("div", { "data-rui-key": "map-1" });
    const container = stage(host);
    const tiles = h("div", { class: "tiles" });
    host.appendChild(tiles);

    morphChildren(container, fresh(h("div", { "data-rui-preserve": "", "data-rui-key": "map-1" })));

    expect(host.firstElementChild).toBe(tiles);
  });

  it("still pushes Aktion-owned attribute updates onto the host", () => {
    const host = h("div", { "data-rui-preserve": "", class: "editor", "data-theme": "light" });
    const container = stage(host);

    morphChildren(
      container,
      fresh(h("div", { "data-rui-preserve": "", class: "editor wide", "data-theme": "dark" })),
    );

    expect(host.classList.contains("wide")).toBe(true);
    expect(host.getAttribute("data-theme")).toBe("dark");
  });

  it("never removes an attribute the widget reflected onto itself", () => {
    const host = h("div", { "data-rui-preserve": "", class: "editor" });
    const container = stage(host);
    // Written by the third-party widget, absent from every render.
    host.setAttribute("aria-multiline", "true");
    host.setAttribute("data-editor-ready", "1");

    morphChildren(container, fresh(h("div", { "data-rui-preserve": "", class: "editor" })));

    expect(host.getAttribute("aria-multiline")).toBe("true");
    expect(host.getAttribute("data-editor-ready")).toBe("1");
  });

  it("keeps the preserved host's event handlers current", () => {
    const host = h("div", { "data-rui-preserve": "" });
    const container = stage(host);
    const calls: string[] = [];
    host.onclick = () => calls.push("stale");

    const freshHost = h("div", { "data-rui-preserve": "" });
    freshHost.onclick = () => calls.push("current");
    morphChildren(container, fresh(freshHost));

    host.dispatchEvent(new Event("click"));
    expect(calls).toEqual(["current"]);
  });

  it("leaves a preserved control's form state to the widget", () => {
    const control = h("input", { "data-rui-preserve": "", type: "text" }) as HTMLInputElement;
    const container = stage(control);
    control.value = "widget-owned";

    morphChildren(
      container,
      fresh(h("input", { "data-rui-preserve": "", type: "text", value: "render-owned" })),
    );

    expect(control.value).toBe("widget-owned");
  });
});

/* -------------------------------------------------------------------------- */
/*  5. Event handler transfer (no stale closures)                              */
/* -------------------------------------------------------------------------- */

/** The handler properties the reconciler promises to transfer. */
function eventProps(): string[] {
  const src = readFileSync(join(process.cwd(), "src", "renderer", "morph.ts"), "utf8");
  const block = /const EVENT_PROPS = \[([\s\S]*?)\] as const;/.exec(src);
  expect(block, "EVENT_PROPS not found — has src/renderer/morph.ts been restructured?").toBeTruthy();
  const names = [...block![1]!.matchAll(/"(on[a-z]+)"/g)].map((m) => m[1]!);
  expect(names.length, "EVENT_PROPS parsed as suspiciously short").toBeGreaterThan(20);
  return names;
}

describe("morph: property handlers are refreshed on the kept node", () => {
  const read = (el: Element, key: string): unknown => (el as unknown as Record<string, unknown>)[key];
  const write = (el: Element, key: string, fn: unknown): void => {
    (el as unknown as Record<string, unknown>)[key] = fn;
  };

  it("transfers every handler in EVENT_PROPS onto the live node", () => {
    const stale = (): string => "stale";
    const current = (): string => "current";
    const failures: string[] = [];

    for (const key of eventProps()) {
      const liveEl = h("div");
      const container = stage(liveEl);
      write(liveEl, key, stale);
      const freshEl = h("div");
      write(freshEl, key, current);

      morphChildren(container, fresh(freshEl));

      if (read(liveEl, key) !== current) failures.push(key);
      container.remove();
    }

    expect(failures, `these handlers keep a STALE closure after a re-render: ${failures.join(", ")}`)
      .toEqual([]);
  });

  it("clears every handler in EVENT_PROPS the fresh render no longer assigns", () => {
    const stale = (): string => "stale";
    const leftovers: string[] = [];

    for (const key of eventProps()) {
      const liveEl = h("div");
      const container = stage(liveEl);
      write(liveEl, key, stale);

      morphChildren(container, fresh(h("div")));

      if (read(liveEl, key) != null) leftovers.push(key);
      container.remove();
    }

    expect(leftovers, `these handlers survived a render that dropped them: ${leftovers.join(", ")}`)
      .toEqual([]);
  });

  it("dispatching on the live node runs the fresh closure and only that one", () => {
    const seen: string[] = [];
    const liveButton = h("button", {}, ["Save"]);
    const container = stage(liveButton);
    liveButton.onclick = () => seen.push("first-render");

    const freshButton = h("button", {}, ["Save"]);
    freshButton.onclick = () => seen.push("second-render");
    morphChildren(container, fresh(freshButton));

    (container.firstElementChild as HTMLButtonElement).click();

    expect(container.firstElementChild).toBe(liveButton);
    expect(seen).toEqual(["second-render"]);
  });

  it("gives the fresh handler the LIVE node as its event target", () => {
    // The two-way binding contract: the fresh render's element is detached the
    // moment morph keeps the live one, so a handler must read
    // `event.currentTarget`, and morph must put it on the node that fires.
    const liveInput = h("input", { type: "text" }) as HTMLInputElement;
    const container = stage(liveInput);
    liveInput.value = "typed by the user";

    const seen: string[] = [];
    const freshInput = h("input", { type: "text" }) as HTMLInputElement;
    freshInput.oninput = (event) => {
      seen.push((event.currentTarget as HTMLInputElement).value);
    };
    morphChildren(container, fresh(freshInput));

    liveInput.dispatchEvent(new Event("input"));
    expect(seen).toEqual(["typed by the user"]);
  });

  it("refreshes handlers on descendants of a kept node", () => {
    const seen: string[] = [];
    const liveChild = h("button", {}, ["Delete"]);
    const container = stage(h("div", { class: "toolbar" }, [liveChild]));
    liveChild.onclick = () => seen.push("stale");

    const freshChild = h("button", {}, ["Delete"]);
    freshChild.onclick = () => seen.push("current");
    morphChildren(container, fresh(h("div", { class: "toolbar" }, [freshChild])));

    liveChild.click();
    expect(seen).toEqual(["current"]);
  });

  it("refreshes handlers on a keyed node that moved position", () => {
    const seen: string[] = [];
    const first = row("a", ["A"]);
    const second = row("b", ["B"]);
    const container = stage(first, second);
    second.onclick = () => seen.push("stale-b");

    const freshSecond = row("b", ["B"]);
    freshSecond.onclick = () => seen.push("current-b");
    morphChildren(container, fresh(freshSecond, row("a", ["A"])));

    expect(container.children[0]).toBe(second);
    (container.children[0] as HTMLElement).click();
    expect(seen).toEqual(["current-b"]);
  });
});

/* -------------------------------------------------------------------------- */
/*  6. Text nodes                                                              */
/* -------------------------------------------------------------------------- */

describe("morph: text nodes", () => {
  it("updates a text node in place instead of replacing it", () => {
    const text = document.createTextNode("Count: 0");
    const container = stage(text);

    morphChildren(container, fresh(document.createTextNode("Count: 1")));

    expect(container.firstChild).toBe(text);
    expect(container.textContent).toBe("Count: 1");
  });

  it("leaves an unchanged text node alone", () => {
    const text = document.createTextNode("Stable");
    const container = stage(text);

    morphChildren(container, fresh(document.createTextNode("Stable")));

    expect(container.firstChild).toBe(text);
    expect(text.textContent).toBe("Stable");
  });

  it("updates interleaved text while keeping its element siblings", () => {
    const strong = h("strong", {}, ["3"]);
    const container = stage(document.createTextNode("You have "), strong, document.createTextNode(" items"));

    morphChildren(
      container,
      fresh(document.createTextNode("You have "), h("strong", {}, ["4"]), document.createTextNode(" messages")),
    );

    expect(container.childNodes[1]).toBe(strong);
    expect(strong.textContent).toBe("4");
    expect(container.textContent).toBe("You have 4 messages");
  });

  it("appends and truncates trailing text nodes", () => {
    const container = stage(h("span", {}, ["label"]));

    morphChildren(container, fresh(h("span", {}, ["label"]), document.createTextNode(" (2)")));
    expect(container.textContent).toBe("label (2)");

    morphChildren(container, fresh(h("span", {}, ["label"])));
    expect(container.textContent).toBe("label");
    expect(container.childNodes.length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  7. Child reconciliation: keyed vs positional                               */
/* -------------------------------------------------------------------------- */

describe("morph: child reconciliation", () => {
  /** A list item that carries browser-owned state (a typed input). */
  function itemWithInput(key: string | null, label: string): HTMLElement {
    const attrs = key == null ? {} : { "data-rui-key": key };
    return h("div", attrs, [h("span", {}, [label]), h("input", { type: "text" })]);
  }
  const labelsOf = (parent: Element): string[] =>
    [...parent.children].map((c) => c.querySelector("span")?.textContent ?? "");
  const valuesOf = (parent: Element): string[] =>
    [...parent.querySelectorAll("input")].map((i) => (i as HTMLInputElement).value);

  it("reuses UNKEYED children by position, so live state stays with the slot", () => {
    const container = stage(itemWithInput(null, "Ada"), itemWithInput(null, "Bob"));
    const [firstSlot, secondSlot] = [...container.children] as HTMLElement[];
    (secondSlot.querySelector("input") as HTMLInputElement).value = "draft";

    morphChildren(container, fresh(itemWithInput(null, "Bob"), itemWithInput(null, "Ada")));

    // Both nodes were reused where they stood; only their content changed.
    expect(container.children[0]).toBe(firstSlot);
    expect(container.children[1]).toBe(secondSlot);
    expect(labelsOf(container)).toEqual(["Bob", "Ada"]);
    expect(valuesOf(container)).toEqual(["", "draft"]);
  });

  it("moves KEYED children, so live state travels with its key", () => {
    const container = stage(itemWithInput("ada", "Ada"), itemWithInput("bob", "Bob"));
    const bobRow = container.children[1] as HTMLElement;
    (bobRow.querySelector("input") as HTMLInputElement).value = "draft";

    morphChildren(container, fresh(itemWithInput("bob", "Bob"), itemWithInput("ada", "Ada")));

    expect(container.children[0]).toBe(bobRow);
    expect(labelsOf(container)).toEqual(["Bob", "Ada"]);
    expect(valuesOf(container)).toEqual(["draft", ""]);
  });

  it("treats an `id` as an identity too", () => {
    const first = h("div", { id: "row-a" }, ["A"]);
    const second = h("div", { id: "row-b" }, ["B"]);
    const container = stage(first, second);

    morphChildren(container, fresh(h("div", { id: "row-b" }, ["B"]), h("div", { id: "row-a" }, ["A"])));

    expect(container.children[0]).toBe(second);
    expect(container.children[1]).toBe(first);
  });

  it("inserts a new keyed child between reused ones", () => {
    const container = stage(row("a", ["A"]), row("c", ["C"]));
    const [a, c] = [...container.children] as HTMLElement[];

    morphChildren(container, fresh(row("a", ["A"]), row("b", ["B"]), row("c", ["C"])));

    expect(keysOf(container)).toEqual(["a", "b", "c"]);
    expect(container.children[0]).toBe(a);
    expect(container.children[2]).toBe(c);
  });

  it("removes a keyed child from the middle and from the front", () => {
    const container = stage(row("a", ["A"]), row("b", ["B"]), row("c", ["C"]));
    const [a, , c] = [...container.children] as HTMLElement[];

    morphChildren(container, fresh(row("a", ["A"]), row("c", ["C"])));
    expect(keysOf(container)).toEqual(["a", "c"]);
    expect(container.children[0]).toBe(a);
    expect(container.children[1]).toBe(c);

    morphChildren(container, fresh(row("c", ["C"])));
    expect(keysOf(container)).toEqual(["c"]);
    expect(container.children[0]).toBe(c);
    expect(a.isConnected).toBe(false);
  });

  it("appends when the fresh list grew and truncates when it shrank", () => {
    const container = stage(h("li", {}, ["1"]));

    morphChildren(container, fresh(h("li", {}, ["1"]), h("li", {}, ["2"]), h("li", {}, ["3"])));
    expect([...container.children].map((c) => c.textContent)).toEqual(["1", "2", "3"]);

    morphChildren(container, fresh(h("li", {}, ["1"])));
    expect([...container.children].map((c) => c.textContent)).toEqual(["1"]);
    expect(container.childNodes.length).toBe(1);
  });

  it("empties a list when the fresh render has no children left", () => {
    const container = stage(row("a", ["A"]), row("b", ["B"]));
    morphChildren(container, document.createDocumentFragment());
    expect(container.childNodes.length).toBe(0);
  });

  it("keeps a static unkeyed header in place while keyed rows reorder beneath it", () => {
    const header = h("h2", {}, ["Rows"]);
    const container = stage(header, row("a", ["A"]), row("b", ["B"]));
    const bRow = container.children[2] as HTMLElement;

    morphChildren(container, fresh(h("h2", {}, ["Rows"]), row("b", ["B"]), row("a", ["A"])));

    expect(container.children[0]).toBe(header);
    expect(container.children[1]).toBe(bRow);
    expect(keysOf(container)).toEqual(["H2", "b", "a"]);
  });

  it("reorders a nested keyed list without disturbing the ancestors", () => {
    const inner = h("ul", {}, [row("x", ["X"], "li"), row("y", ["Y"], "li")]);
    const container = stage(h("section", {}, [h("h3", {}, ["Title"]), inner]));
    const section = container.firstElementChild!;
    const xItem = inner.children[0] as HTMLElement;

    morphChildren(
      container,
      fresh(
        h("section", {}, [
          h("h3", {}, ["Title"]),
          h("ul", {}, [row("y", ["Y"], "li"), row("x", ["X"], "li")]),
        ]),
      ),
    );

    expect(container.firstElementChild).toBe(section);
    expect(section.children[1]).toBe(inner);
    expect(keysOf(inner)).toEqual(["y", "x"]);
    expect(inner.children[1]).toBe(xItem);
  });

  it("drops an unkeyed node that the fresh keyed list no longer wants", () => {
    const container = stage(row("a", ["A"]), h("div", {}, ["spinner"]), row("b", ["B"]));
    const [a, spinner, b] = [...container.children] as HTMLElement[];

    morphChildren(container, fresh(row("a", ["A"]), row("b", ["B"])));

    expect(keysOf(container)).toEqual(["a", "b"]);
    expect(container.children[0]).toBe(a);
    expect(container.children[1]).toBe(b);
    expect(spinner.isConnected).toBe(false);
  });

  it("accepts a single node as the whole child list", () => {
    // `morphChildren` documents both shapes: a fragment of siblings, or one node
    // treated as the sole child (so the surplus live siblings go away).
    const container = stage(h("span", {}, ["a"]), h("span", {}, ["b"]));
    const firstSlot = container.firstElementChild!;

    morphChildren(container, h("span", {}, ["solo"]));

    expect(container.childNodes.length).toBe(1);
    expect(container.firstElementChild).toBe(firstSlot);
    expect(container.textContent).toBe("solo");
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Form state                                                              */
/* -------------------------------------------------------------------------- */

describe("morph: form state", () => {
  it("keeps a typed value while unrelated attributes on the same field change", () => {
    const input = h("input", { type: "text", class: "field" }) as HTMLInputElement;
    const container = stage(input);
    input.value = "half-finished sentence";

    // A re-render triggered elsewhere in the app: same field, new decoration.
    morphChildren(container, fresh(h("input", { type: "text", class: "field field-dirty" })));

    expect(container.firstElementChild).toBe(input);
    expect(input.value).toBe("half-finished sentence");
    expect(input.classList.contains("field-dirty")).toBe(true);
  });

  it("applies a controlled value change to an unfocused field the user has touched", () => {
    const input = h("input", { type: "text", value: "before" }) as HTMLInputElement;
    const container = stage(input);
    // A field the user has typed in is "dirty": per the platform, its `value`
    // property no longer follows the attribute, so the reconciler is the only
    // channel a programmatic change can arrive through.
    input.value = "before";

    morphChildren(container, fresh(h("input", { type: "text", value: "after" })));

    expect(input.value).toBe("after");
  });

  /**
   * A browser collapses the caret to the end of the field on every `value`
   * write; happy-dom does not, so without this stub a caret test would pass even
   * if the reconciler stopped restoring the selection — i.e. it could not fail.
   */
  function emulateCaretCollapse(el: HTMLInputElement): void {
    let raw = el.value;
    Object.defineProperty(el, "value", {
      get: () => raw,
      set: (next: string) => {
        raw = next;
        el.setSelectionRange(next.length, next.length);
      },
      configurable: true,
    });
  }

  it("does not bounce a focused caret to the end on a controlled transform", () => {
    const input = h("input", { type: "text", value: "abcdef" }) as HTMLInputElement;
    const container = stage(input);
    input.value = "abcdef";
    focusIt(input);
    input.setSelectionRange(2, 2); // caret mid-word, user still typing
    emulateCaretCollapse(input);

    // e.g. a controlled uppercase-as-you-type transform.
    morphChildren(container, fresh(h("input", { type: "text", value: "ABCDEF" })));

    expect(input.value).toBe("ABCDEF");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("clamps a focused caret into the new length when the value shrinks", () => {
    const input = h("input", { type: "text", value: "abcdef" }) as HTMLInputElement;
    const container = stage(input);
    input.value = "abcdef";
    focusIt(input);
    input.setSelectionRange(1, 1);
    emulateCaretCollapse(input);

    morphChildren(container, fresh(h("input", { type: "text", value: "abc" })));

    expect(input.value).toBe("abc");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
  });

  it("follows the caret to the new end when it was already at the end", () => {
    const input = h("input", { type: "text", value: "ab" }) as HTMLInputElement;
    const container = stage(input);
    input.value = "ab";
    focusIt(input);
    input.setSelectionRange(2, 2);
    emulateCaretCollapse(input);

    morphChildren(container, fresh(h("input", { type: "text", value: "abcd" })));

    expect(input.selectionStart).toBe(4);
    expect(input.selectionEnd).toBe(4);
  });

  it("never writes to a file input, not even when the render asserts a value", () => {
    const input = h("input", { type: "file" }) as HTMLInputElement;
    const container = stage(input);
    // A FileList cannot be constructed here; observe the sink instead. Any write
    // is the defect — "" is the only legal one and it clears the selection.
    let writes = 0;
    Object.defineProperty(input, "value", {
      get: () => "C:\\fakepath\\budget.xlsx",
      set: () => { writes += 1; },
      configurable: true,
    });

    morphChildren(container, fresh(h("input", { type: "file", value: "" })));
    morphChildren(container, fresh(h("input", { type: "file", value: "something.pdf" })));

    expect(writes).toBe(0);
  });

  it("keeps the user's radio pick when the render asserts nothing", () => {
    const yes = h("input", { type: "radio", name: "plan", value: "yes" }) as HTMLInputElement;
    const no = h("input", { type: "radio", name: "plan", value: "no" }) as HTMLInputElement;
    const container = stage(yes, no);
    no.checked = true;

    morphChildren(
      container,
      fresh(
        h("input", { type: "radio", name: "plan", value: "yes" }),
        h("input", { type: "radio", name: "plan", value: "no" }),
      ),
    );

    expect(no.checked).toBe(true);
    expect(yes.checked).toBe(false);
  });

  it("applies a controlled radio selection to a control the user has touched", () => {
    const yes = h("input", { type: "radio", name: "plan", value: "yes" }) as HTMLInputElement;
    const container = stage(yes);
    // Interacting with a control sets its dirty-checkedness flag, after which the
    // `checked` attribute alone no longer moves the property — so this asserts the
    // reconciler applies the render's assertion, not the attribute's side effect.
    yes.checked = false;

    morphChildren(
      container,
      fresh(h("input", { type: "radio", name: "plan", value: "yes", checked: "" })),
    );

    expect(yes.checked).toBe(true);
  });

  it("keeps a ticked uncontrolled checkbox while its labelling changes", () => {
    const box = h("input", { type: "checkbox", "aria-describedby": "hint-1" }) as HTMLInputElement;
    const container = stage(box);
    box.checked = true;

    morphChildren(container, fresh(h("input", { type: "checkbox", "aria-invalid": "true" })));

    expect(box.checked).toBe(true);
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.hasAttribute("aria-describedby")).toBe(false);
  });

  it("applies a programmatic <select> change and patches the option list", () => {
    const buildSelect = (values: string[], value: string): HTMLSelectElement => {
      const select = h("select", {}) as HTMLSelectElement;
      for (const v of values) select.appendChild(h("option", { value: v }, [v.toUpperCase()]));
      select.value = value;
      return select;
    };
    const select = buildSelect(["a", "b"], "a");
    const container = stage(select);

    morphChildren(container, fresh(buildSelect(["a", "b"], "b")));

    expect(container.firstElementChild).toBe(select);
    expect(select.value).toBe("b");
    // The options themselves are reconciled (labels can change under the value).
    morphChildren(container, fresh(buildSelect(["a", "b", "c"], "b")));
    expect([...select.options].map((o) => o.value)).toEqual(["a", "b", "c"]);
  });
});

/* -------------------------------------------------------------------------- */
/*  9. Focus and IME composition                                               */
/* -------------------------------------------------------------------------- */

describe("morph: focus and composition", () => {
  it("keeps focus and selection across an in-place re-render", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    root.appendChild(container);
    const input = h("input", { type: "text", id: "email" }) as HTMLInputElement;
    container.appendChild(input);
    input.value = "user@example.com";
    focusIt(input);
    input.setSelectionRange(4, 4);
    expect(root.activeElement).toBe(input);

    morphChildren(container, fresh(h("input", { type: "text", id: "email", class: "field-dirty" })));

    expect(container.firstElementChild).toBe(input);
    expect(root.activeElement).toBe(input);
    expect(input.value).toBe("user@example.com");
    expect(input.selectionStart).toBe(4);
  });

  it("does not write to a field mid-composition when the render asserts nothing", () => {
    const input = h("input", { type: "text" }) as HTMLInputElement;
    const container = stage(input);
    focusIt(input);
    // An IME composition in progress: the DOM holds provisional characters that
    // no state has seen yet. Count writes — a single assignment ends composition.
    let composed = "にほn";
    let writes = 0;
    Object.defineProperty(input, "value", {
      get: () => composed,
      set: (next: string) => { writes += 1; composed = next; },
      configurable: true,
    });

    morphChildren(container, fresh(h("input", { type: "text" })));

    expect(writes).toBe(0);
    expect(composed).toBe("にほn");
  });

  it("does not write when the asserted value already equals the composed text", () => {
    const input = h("input", { type: "text", value: "にほ" }) as HTMLInputElement;
    const container = stage(input);
    focusIt(input);
    let composed = "にほ";
    let writes = 0;
    Object.defineProperty(input, "value", {
      get: () => composed,
      set: (next: string) => { writes += 1; composed = next; },
      configurable: true,
    });

    morphChildren(container, fresh(h("input", { type: "text", value: "にほ" })));

    expect(writes).toBe(0);
  });

  it("leaves the user's selection alone when a re-render asserts what is already typed", () => {
    const input = h("input", { type: "text", value: "hello" }) as HTMLInputElement;
    const container = stage(input);
    input.value = "hello";
    focusIt(input);
    input.setSelectionRange(2, 4); // the user has text selected
    // Same stub as the caret tests above: a real `value` write collapses the
    // selection, which is the regression this test has to be able to see.
    let raw = input.value;
    Object.defineProperty(input, "value", {
      get: () => raw,
      set: (next: string) => {
        raw = next;
        input.setSelectionRange(next.length, next.length);
      },
      configurable: true,
    });

    morphChildren(container, fresh(h("input", { type: "text", value: "hello" })));

    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/*  10. End to end through <aktion-app>                                        */
/* -------------------------------------------------------------------------- */

type ScriptedEl = HTMLElement & { setResponse(text: string): void };

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}
async function renderApp(program: string): Promise<ShadowRoot> {
  const el = document.createElement("aktion-app") as ScriptedEl;
  document.body.appendChild(el);
  el.setResponse(program);
  await settle();
  return el.shadowRoot as ShadowRoot;
}
function buttonNamed(root: ShadowRoot, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  if (!found) throw new Error(`no button "${label}"`);
  return found as HTMLButtonElement;
}

describe("morph: a real app across a state-change re-render", () => {
  it("keeps a focused field's node, value and caret while the tree around it re-renders", async () => {
    const root = await renderApp(`
      $count = 0
      $app(Column([
        Input({ id: "email", label: "Email " + $count }),
        Text("count " + $count),
        Button("Bump", () => $count = $count + 1),
      ]))
    `);
    const input = root.querySelector("input") as HTMLInputElement;
    focusIt(input);
    input.value = "user@example.com";
    input.setSelectionRange(3, 3);

    buttonNamed(root, "Bump").click();
    await settle();

    // The re-render really happened…
    expect(root.textContent).toContain("count 1");
    expect(root.textContent).toContain("Email 1");
    // …and the field came through it untouched.
    expect(root.querySelector("input")).toBe(input);
    expect(input.value).toBe("user@example.com");
    expect(input.selectionStart).toBe(3);
    expect(root.activeElement).toBe(input);
  });

  it("keeps a button's handler current so repeated clicks keep counting", async () => {
    const root = await renderApp(`
      $count = 0
      $app(Column([Text("count " + $count), Button("Bump", () => $count = $count + 1)]))
    `);
    const button = buttonNamed(root, "Bump");

    for (const expected of [1, 2, 3]) {
      button.click();
      await settle();
      expect(root.textContent).toContain(`count ${expected}`);
    }
    // The same node served all three clicks — each with a fresh closure.
    expect(buttonNamed(root, "Bump")).toBe(button);
  });

  it("keeps an Accordion the user opened open across a re-render", async () => {
    const root = await renderApp(`
      $count = 0
      $app(Column([
        Accordion({ items: [AccordionItem({ title: "Details " + $count, content: Text("body") })] }),
        Button("Bump", () => $count = $count + 1),
      ]))
    `);
    const details = root.querySelector("details") as HTMLDetailsElement;
    details.open = true; // the UA's response to a summary click

    buttonNamed(root, "Bump").click();
    await settle();

    expect(root.querySelector("details")).toBe(details);
    expect(details.open).toBe(true);
    expect(root.textContent).toContain("Details 1");
  });

  it("keeps text typed into an uncontrolled Input across a re-render", async () => {
    const root = await renderApp(`
      $count = 0
      $app(Column([
        Input({ id: "name", label: "Name " + $count }),
        Button("Bump", () => $count = $count + 1),
      ]))
    `);
    const input = root.querySelector("input") as HTMLInputElement;
    input.value = "Ada Lovelace";

    buttonNamed(root, "Bump").click();
    await settle();

    expect(root.textContent).toContain("Name 1");
    expect((root.querySelector("input") as HTMLInputElement).value).toBe("Ada Lovelace");
  });
});

/* -------------------------------------------------------------------------- */
/*  11. Contracts the reconciler documents but does not honour yet              */
/* -------------------------------------------------------------------------- */

/**
 * `syncInput` learned the "an absent `value` attribute asserts nothing" rule
 * (see tests/morph-uncontrolled-inputs.test.ts) but `<textarea>` and `<select>`
 * never did: their branches compare against the fresh node's `value` PROPERTY,
 * which is always a string, so "the render asserts nothing" is indistinguishable
 * from "the render asserts empty / the first option".
 *
 * These three are `it.fails`: they document the defect executably and go red the
 * moment it is fixed — at which point they should become plain `it`.
 */
describe("morph: OPEN DEFECTS — uncontrolled textarea/select state", () => {
  it.fails("should keep text typed into an uncontrolled <textarea>", () => {
    const area = h("textarea") as HTMLTextAreaElement;
    const container = stage(area);
    area.value = "a long note the user is still writing";

    // What `TextArea.render` emits with no `value` prop: `el.value = ""`.
    const freshArea = h("textarea") as HTMLTextAreaElement;
    freshArea.value = "";
    morphChildren(container, fresh(freshArea));

    expect(area.value).toBe("a long note the user is still writing");
  });

  it.fails("should keep the option an uncontrolled <select> user picked", () => {
    const build = (value: string): HTMLSelectElement => {
      const select = h("select") as HTMLSelectElement;
      for (const v of ["alpha", "beta"]) select.appendChild(h("option", { value: v }, [v]));
      select.value = value; // `Select.render`: select.value = asString(props.value) → ""
      return select;
    };
    const select = build("");
    const container = stage(select);
    select.value = "beta"; // the user picked it

    morphChildren(container, fresh(build("")));

    expect(select.value).toBe("beta");
  });

  it.fails("should resolve a <select> value against options only the fresh tree has", () => {
    // morph.ts reconciles children before form state precisely so this works,
    // but the new options are MOVED out of the fresh <select>, which resets its
    // `value` before the comparison reads it.
    const build = (values: string[], value: string): HTMLSelectElement => {
      const select = h("select") as HTMLSelectElement;
      for (const v of values) select.appendChild(h("option", { value: v }, [v]));
      select.value = value;
      return select;
    };
    const select = build(["alpha"], "alpha");
    const container = stage(select);

    // The option list grew and the program selected one of the new entries.
    morphChildren(container, fresh(build(["alpha", "beta"], "beta")));

    expect([...select.options].map((o) => o.value)).toEqual(["alpha", "beta"]);
    expect(select.value).toBe("beta");
  });
});
