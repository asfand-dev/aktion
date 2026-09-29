/**
 * The DevTools reconciler. The panel re-renders on every runtime event, so the
 * properties that matter are the ones a user feels: nodes they are touching
 * are never recreated, a list reorder moves nodes instead of rebuilding them,
 * and an unchanged subtree costs nothing.
 */

import { describe, expect, it, vi } from "vitest";
import { h, render, unmountAll, classString, Widget, type VNode } from "../src/devtools/core/vdom.js";

function mount(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

describe("vdom — creation", () => {
  it("renders elements, text, attributes, classes and styles", () => {
    const host = mount();
    render(host, h("div", { id: "a", class: ["x", { y: true, z: false }], style: { color: "red", "--k": "1" }, title: "t" },
      "hello ", 42, null, false, h("b", {}, "bold")));
    const div = host.firstElementChild as HTMLElement;
    expect(div.id).toBe("a");
    expect(div.className).toBe("x y");
    expect(div.style.color).toBe("red");
    expect(div.style.getPropertyValue("--k")).toBe("1");
    expect(div.textContent).toBe("hello 42bold");
    expect(div.getAttribute("title")).toBe("t");
  });

  it("spells out aria booleans instead of writing an empty attribute", () => {
    const host = mount();
    render(host, h("button", { "aria-expanded": true, "aria-pressed": false, hidden: false, disabled: true }));
    const btn = host.firstElementChild!;
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.hasAttribute("hidden")).toBe(false);
    expect(btn.getAttribute("disabled")).toBe("");
  });

  it("creates SVG children in the SVG namespace", () => {
    const host = mount();
    render(host, h("svg", { viewBox: "0 0 24 24", class: "ic" }, h("path", { d: "M0 0L1 1" })));
    const svg = host.firstElementChild!;
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.firstElementChild!.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.getAttribute("class")).toBe("ic");
  });

  it("applies a <select> value after its options exist", () => {
    const host = mount();
    render(host, h("select", { value: "b" }, h("option", { value: "a" }, "A"), h("option", { value: "b" }, "B")));
    expect((host.firstElementChild as HTMLSelectElement).value).toBe("b");
  });

  it("never interprets a string as markup", () => {
    const host = mount();
    render(host, h("div", {}, "<img src=x onerror=alert(1)>"));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("vdom — updates", () => {
  it("patches in place, preserving element identity", () => {
    const host = mount();
    render(host, h("div", { class: "a" }, h("span", {}, "1"), h("input", { value: "" })));
    const div = host.firstElementChild!;
    const input = div.querySelector("input")!;
    render(host, h("div", { class: "b" }, h("span", {}, "2"), h("input", { value: "" })));
    expect(host.firstElementChild).toBe(div);
    expect(div.querySelector("input")).toBe(input);
    expect(div.className).toBe("b");
    expect(div.querySelector("span")!.textContent).toBe("2");
  });

  it("keeps focus in a field while the tree around it changes", () => {
    const host = mount();
    const view = (n: number): VNode => h("div", {}, ...Array.from({ length: n }, (_, i) => h("p", { key: `p${i}` }, `row ${i}`)),
      h("input", { key: "field", value: "draft" }));
    render(host, view(1));
    const input = host.querySelector("input")!;
    input.focus();
    render(host, view(5));
    expect(host.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it("removes attributes, classes and styles that disappear", () => {
    const host = mount();
    render(host, h("div", { title: "x", class: "c", style: { color: "red" }, "data-x": "1" }));
    render(host, h("div", {}));
    const div = host.firstElementChild as HTMLElement;
    expect(div.hasAttribute("title")).toBe(false);
    expect(div.className).toBe("");
    expect(div.style.color).toBe("");
    expect(div.hasAttribute("data-x")).toBe(false);
  });

  it("swaps listeners without stacking them", () => {
    const host = mount();
    const first = vi.fn();
    const second = vi.fn();
    render(host, h("button", { onClick: first }));
    render(host, h("button", { onClick: second }));
    (host.firstElementChild as HTMLButtonElement).click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    render(host, h("button", {}));
    (host.firstElementChild as HTMLButtonElement).click();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("replaces a node whose tag changes", () => {
    const host = mount();
    render(host, h("div", {}, h("span", {}, "a")));
    const span = host.querySelector("span");
    render(host, h("div", {}, h("em", {}, "a")));
    expect(host.querySelector("span")).toBeNull();
    expect(host.querySelector("em")).not.toBe(span);
  });

  it("writes a controlled value only when the live value differs", () => {
    const host = mount();
    render(host, h("input", { value: "a" }));
    const input = host.firstElementChild as HTMLInputElement;
    input.value = "typed";
    render(host, h("input", { value: "typed" }));
    expect(input.value).toBe("typed");
    render(host, h("input", { value: "reset" }));
    expect(input.value).toBe("reset");
  });
});

describe("vdom — keyed lists", () => {
  const list = (keys: string[]): VNode => h("ul", {}, ...keys.map((k) => h("li", { key: k }, k)));

  it("moves keyed nodes instead of recreating them", () => {
    const host = mount();
    render(host, list(["a", "b", "c", "d"]));
    const before = new Map([...host.querySelectorAll("li")].map((li) => [li.textContent!, li]));
    render(host, list(["d", "b", "a", "c"]));
    const after = [...host.querySelectorAll("li")];
    expect(after.map((li) => li.textContent)).toEqual(["d", "b", "a", "c"]);
    for (const li of after) expect(li).toBe(before.get(li.textContent!));
  });

  it("inserts, removes and reorders in one pass", () => {
    const host = mount();
    render(host, list(["a", "b", "c"]));
    const b = [...host.querySelectorAll("li")][1];
    render(host, list(["x", "c", "b", "y"]));
    const items = [...host.querySelectorAll("li")];
    expect(items.map((li) => li.textContent)).toEqual(["x", "c", "b", "y"]);
    expect(items[2]).toBe(b);
  });

  it("does not touch the DOM for an unchanged list", () => {
    const host = mount();
    render(host, list(["a", "b", "c"]));
    const ul = host.firstElementChild!;
    const spy = vi.spyOn(ul, "insertBefore");
    render(host, list(["a", "b", "c"]));
    expect(spy).not.toHaveBeenCalled();
  });

  it("appends to an unkeyed list with one insertion", () => {
    const host = mount();
    const rows = (n: number): VNode => h("div", {}, ...Array.from({ length: n }, (_, i) => h("p", {}, String(i))));
    render(host, rows(3));
    const first = host.querySelector("p");
    render(host, rows(4));
    expect(host.querySelectorAll("p")).toHaveLength(4);
    expect(host.querySelector("p")).toBe(first);
  });
});

describe("vdom — referential skip", () => {
  it("skips an identical subtree entirely", () => {
    const host = mount();
    const shared = h("section", {}, h("p", {}, "static"));
    render(host, h("div", {}, shared, h("span", {}, "1")));
    const p = host.querySelector("p")!;
    p.textContent = "mutated behind the reconciler's back";
    render(host, h("div", {}, shared, h("span", {}, "2")));
    // Same node object → not diffed, so the out-of-band mutation survives.
    expect(p.textContent).toBe("mutated behind the reconciler's back");
    expect(host.querySelector("span")!.textContent).toBe("2");
  });
});

describe("vdom — widgets", () => {
  class Counter extends Widget<{ value: number; onDestroy?: () => void }> {
    renders = 0;
    mount(): Element {
      const el = document.createElement("output");
      el.textContent = String(this.props.value);
      return el;
    }
    override update(): void {
      this.renders += 1;
      this.el.textContent = String(this.props.value);
    }
    override unmount(): void {
      this.props.onDestroy?.();
    }
  }

  it("mounts once, updates with new props, and unmounts", () => {
    const host = mount();
    const destroyed = vi.fn();
    render(host, h("div", {}, h(Counter, { value: 1, onDestroy: destroyed })));
    const out = host.querySelector("output")!;
    render(host, h("div", {}, h(Counter, { value: 2, onDestroy: destroyed })));
    expect(host.querySelector("output")).toBe(out);
    expect(out.textContent).toBe("2");
    render(host, h("div", {}));
    expect(destroyed).toHaveBeenCalledTimes(1);
    expect(host.querySelector("output")).toBeNull();
  });

  it("renders an inline error when a widget fails to mount", () => {
    class Broken extends Widget<Record<string, never>> {
      mount(): Element {
        throw new Error("boom");
      }
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = mount();
    render(host, h("div", {}, h(Broken, {}), h("p", {}, "still here")));
    expect(host.textContent).toContain("boom");
    expect(host.textContent).toContain("still here");
    errors.mockRestore();
  });

  it("calls ref callbacks on mount and removal", () => {
    const host = mount();
    const ref = vi.fn();
    render(host, h("div", {}, h("span", { ref })));
    expect(ref).toHaveBeenLastCalledWith(host.querySelector("span"));
    render(host, h("div", {}));
    expect(ref).toHaveBeenLastCalledWith(null);
  });

  it("unmountAll tears down widgets and empties the container", () => {
    const host = mount();
    const destroyed = vi.fn();
    render(host, [h(Counter, { value: 1, onDestroy: destroyed }), "text"]);
    unmountAll(host);
    expect(destroyed).toHaveBeenCalled();
    expect(host.childNodes).toHaveLength(0);
  });
});

describe("vdom — stable slots and form fields", () => {
  it("keeps later siblings when a conditional before them appears or disappears", () => {
    const host = mount();
    const view = (banner: boolean): VNode => h("div", {}, h("header", {}, "bar"), banner ? h("div", { class: "banner" }, "note") : null, h("div", { class: "main" }, "content"));
    render(host, view(false));
    const main = host.querySelector(".main")!;
    render(host, view(true));
    // The banner is a <div> like .main — it must not steal .main's node.
    expect(host.querySelector(".main")).toBe(main);
    expect(host.querySelector(".banner")).toBeTruthy();
    render(host, view(false));
    expect(host.querySelector(".main")).toBe(main);
    expect(host.querySelector(".banner")).toBeNull();
    // Holes render as empty text: no text content, no layout box.
    expect(host.textContent).toBe("barcontent");
  });

  it("matches unkeyed siblings by position among unkeyed children, ignoring keyed rows", () => {
    const host = mount();
    const view = (rows: string[]): VNode => h("ul", {}, h("li", { class: "head" }, "head"), ...rows.map((r) => h("li", { key: r }, r)), h("li", { class: "foot" }, "foot"));
    render(host, view(["a"]));
    const foot = host.querySelector(".foot")!;
    render(host, view(["a", "b", "c"]));
    expect(host.querySelector(".foot")).toBe(foot);
    expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["head", "a", "b", "c", "foot"]);
  });

  it("re-applies a controlled value but leaves an uncontrolled field's typing alone", () => {
    const host = mount();
    const view = (value: string): VNode => h("div", {},
      h("input", { class: "controlled", value, onInput: () => undefined }),
      h("input", { class: "uncontrolled", value }));
    render(host, view("a"));
    const controlled = host.querySelector<HTMLInputElement>(".controlled")!;
    const uncontrolled = host.querySelector<HTMLInputElement>(".uncontrolled")!;
    controlled.value = "typed";
    uncontrolled.value = "typed";
    render(host, view("a"));
    // The controlled field reflects the view's state; the uncontrolled one keeps the draft.
    expect(controlled.value).toBe("a");
    expect(uncontrolled.value).toBe("typed");
    // A changed prop still reaches the uncontrolled field.
    render(host, view("b"));
    expect(uncontrolled.value).toBe("b");
  });
});

describe("classString", () => {
  it("joins strings, arrays and maps", () => {
    expect(classString(["a", null, ["b", { c: true, d: false }]])).toBe("a b c");
    expect(classString(undefined)).toBe("");
  });
});
