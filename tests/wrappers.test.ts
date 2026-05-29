/**
 * Tests for the behavioural & styling wrapper components added in 0.5.x:
 *   `OnClick`, `OnMouse`, `OnKeyboard`, `OnFocus`, `OnIntersect`, `Css`,
 *   and the router-aware `Link` rewrite. Also covers the new
 *   `onChange(value)` prop wired into every input component.
 */
import { describe, expect, it, vi } from "vitest";
import {
  Link,
  OnClick,
  OnMouse,
  OnKeyboard,
  OnFocus,
  OnIntersect,
  Css,
  attachOnChange,
} from "../src/library/components/wrappers.js";
import {
  Input,
  TextArea,
  Select,
  Checkbox,
  Radio,
  Slider,
  NumberInput,
  DatePicker,
} from "../src/library/components/forms.js";
import { Switch, ToggleGroup } from "../src/library/components/feedback.js";
import { SidebarItem } from "../src/library/components/patterns.js";
import type { RenderHelpers } from "../src/library/types.js";
import { Router } from "../src/runtime/router.js";

/* ------------------------------------------------------------------------ *
 * Test harness — minimal `RenderHelpers` implementation. Components only
 * touch `renderNode`, `invoke`, `bindState`, and `registerDisposer` here,
 * so the other helpers can stay as no-ops.
 * ------------------------------------------------------------------------ */

const noop = () => {/* no-op */};

function makeHelpers(overrides: Partial<RenderHelpers> = {}): RenderHelpers {
  return {
    renderNode: (value: unknown) => {
      // Mirror the existing test fixture in `library.test.ts` — components
      // render as a stub `<div>` so DOM assertions can inspect the result.
      if (value && typeof value === "object" && (value as { __kind?: string }).__kind === "Component") {
        const stub = document.createElement("div");
        stub.className = "rui-stub";
        stub.dataset.componentName = (value as { name?: string }).name ?? "";
        return stub;
      }
      if (typeof value === "string") return document.createTextNode(value);
      return document.createTextNode("");
    },
    invoke: (fn, ...args) => {
      if (typeof fn === "function") (fn as (...a: unknown[]) => unknown)(...args);
    },
    setState: noop,
    resetState: noop,
    sendToAssistant: noop,
    openUrl: noop,
    bindState: noop,
    useInstanceState: <T,>(_k: string, initial: T) => {
      let value = initial;
      return { get: () => value, set: (next: T) => { value = next; } };
    },
    registerDisposer: noop,
    router: new Router(),
    ...overrides,
  };
}

const makeNode = (name: string, args: unknown[] = []) => ({
  __kind: "Component" as const,
  name,
  args,
  argMeta: args.map(() => ({})),
});

const makeChild = (name: string) => ({
  __kind: "Component" as const,
  name,
  args: [],
  argMeta: [],
});

/* ------------------------------------------------------------------------ *
 * OnClick
 * ------------------------------------------------------------------------ */

describe("OnClick", () => {
  it("wraps the child in a transparent span and fires onClick on click", () => {
    const onClick = vi.fn();
    const node = OnClick.render(
      makeNode("OnClick"),
      { child: makeChild("Card"), onClick },
      makeHelpers(),
    ) as HTMLElement;

    expect(node.tagName.toLowerCase()).toBe("span");
    expect(node.classList.contains("rui-on-click")).toBe(true);
    expect(node.getAttribute("style")).toContain("display: contents");
    expect(node.getAttribute("role")).toBe("button");
    expect(node.getAttribute("tabindex")).toBe("0");
    // Child stub rendered inside.
    expect(node.querySelector(".rui-stub")?.getAttribute("data-component-name")).toBe("Card");

    node.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("invokes onClick on Enter / Space keys for keyboard accessibility", () => {
    const onClick = vi.fn();
    const node = OnClick.render(
      makeNode("OnClick"),
      { child: makeChild("Card"), onClick },
      makeHelpers(),
    ) as HTMLElement;

    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("skips invocation while `disabled` is truthy", () => {
    const onClick = vi.fn();
    const node = OnClick.render(
      makeNode("OnClick"),
      { child: makeChild("Card"), onClick, disabled: true },
      makeHelpers(),
    ) as HTMLElement;

    node.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards the click event when child is a string", () => {
    const onClick = vi.fn();
    const node = OnClick.render(
      makeNode("OnClick"),
      { child: "Click me", onClick },
      makeHelpers(),
    ) as HTMLElement;

    expect(node.textContent).toBe("Click me");
    node.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------------ *
 * OnMouse
 * ------------------------------------------------------------------------ */

describe("OnMouse", () => {
  it("only attaches listeners for supplied event props", () => {
    const enter = vi.fn();
    const leave = vi.fn();
    const node = OnMouse.render(
      makeNode("OnMouse"),
      { child: makeChild("Card"), enter, leave },
      makeHelpers(),
    ) as HTMLElement;

    node.dispatchEvent(new MouseEvent("mouseenter"));
    node.dispatchEvent(new MouseEvent("mouseleave"));
    // No handler attached for `click` — nothing should crash.
    node.dispatchEvent(new MouseEvent("click"));

    expect(enter).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("wires drag / drop events and makes wrapper draggable when requested", () => {
    const dragStart = vi.fn();
    const drop = vi.fn();
    const dragOver = vi.fn();
    const node = OnMouse.render(
      makeNode("OnMouse"),
      { child: makeChild("Card"), dragStart, drop, dragOver, draggable: true },
      makeHelpers(),
    ) as HTMLElement;

    expect(node.getAttribute("draggable")).toBe("true");
    node.dispatchEvent(new Event("dragstart"));
    node.dispatchEvent(new Event("dragover"));
    node.dispatchEvent(new Event("drop"));

    expect(dragStart).toHaveBeenCalledTimes(1);
    expect(dragOver).toHaveBeenCalledTimes(1);
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it("dispatches wheel and contextmenu events to their handlers", () => {
    const wheel = vi.fn();
    const contextMenu = vi.fn();
    const node = OnMouse.render(
      makeNode("OnMouse"),
      { child: makeChild("Card"), wheel, contextMenu },
      makeHelpers(),
    ) as HTMLElement;

    node.dispatchEvent(new Event("wheel"));
    node.dispatchEvent(new Event("contextmenu"));

    expect(wheel).toHaveBeenCalledTimes(1);
    expect(contextMenu).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------------ *
 * OnKeyboard
 * ------------------------------------------------------------------------ */

describe("OnKeyboard", () => {
  it("attaches keydown / keyup handlers when supplied", () => {
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();
    const node = OnKeyboard.render(
      makeNode("OnKeyboard"),
      { child: makeChild("Card"), onKeyDown, onKeyUp },
      makeHelpers(),
    ) as HTMLElement;

    expect(node.getAttribute("tabindex")).toBe("0");
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    node.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyUp).toHaveBeenCalledTimes(1);
  });

  it("omits the tabindex when `focusable: false`", () => {
    const node = OnKeyboard.render(
      makeNode("OnKeyboard"),
      { child: makeChild("Card"), focusable: false, onKeyDown: () => {} },
      makeHelpers(),
    ) as HTMLElement;
    expect(node.hasAttribute("tabindex")).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * OnFocus
 * ------------------------------------------------------------------------ */

describe("OnFocus", () => {
  it("invokes onFocus / onBlur via bubbling focusin / focusout", () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const node = OnFocus.render(
      makeNode("OnFocus"),
      { child: makeChild("Input"), onFocus, onBlur },
      makeHelpers(),
    ) as HTMLElement;

    node.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    node.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------------ *
 * OnIntersect
 * ------------------------------------------------------------------------ */

describe("OnIntersect", () => {
  it("registers an IntersectionObserver and disposes it via helpers.registerDisposer", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const FakeObserver = vi.fn().mockImplementation(() => ({
      observe,
      disconnect,
      unobserve: vi.fn(),
      takeRecords: vi.fn().mockReturnValue([]),
    }));

    const originalObserver = globalThis.IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver })
      .IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;

    let disposer: (() => void) | null = null;
    const helpers = makeHelpers({
      registerDisposer: (fn: () => void) => { disposer = fn; },
    });

    try {
      const node = OnIntersect.render(
        makeNode("OnIntersect"),
        { child: makeChild("Card"), onEnter: () => {}, threshold: 0.5 },
        helpers,
      ) as HTMLElement;

      expect(node.classList.contains("rui-on-intersect")).toBe(true);
      expect(FakeObserver).toHaveBeenCalledTimes(1);
      // Threshold clamps into [0, 1] and reaches the IntersectionObserver
      // constructor's options bag.
      const options = FakeObserver.mock.calls[0][1] as IntersectionObserverInit;
      expect(options.threshold).toBe(0.5);
      expect(observe).toHaveBeenCalledWith(node);
      expect(disposer).not.toBeNull();
      disposer?.();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver | undefined })
        .IntersectionObserver = originalObserver;
    }
  });

  it("falls back to a bare wrapper when IntersectionObserver is unavailable", () => {
    const originalObserver = globalThis.IntersectionObserver;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).IntersectionObserver;
    try {
      const node = OnIntersect.render(
        makeNode("OnIntersect"),
        { child: makeChild("Card"), onEnter: () => {} },
        makeHelpers(),
      ) as HTMLElement;
      // No throws — the wrapper still renders.
      expect(node.tagName.toLowerCase()).toBe("span");
    } finally {
      (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver })
        .IntersectionObserver = originalObserver;
    }
  });
});

/* ------------------------------------------------------------------------ *
 * Css
 * ------------------------------------------------------------------------ */

describe("Css", () => {
  it("merges class tokens and inline style onto the rendered element", () => {
    const node = Css.render(
      makeNode("Css"),
      { child: makeChild("Card"), class: "highlight callout", style: "padding: 12px" },
      makeHelpers(),
    ) as HTMLElement;

    expect(node.classList.contains("highlight")).toBe(true);
    expect(node.classList.contains("callout")).toBe(true);
    expect(node.getAttribute("style")).toContain("padding: 12px");
  });

  it("accepts class names as an array", () => {
    const node = Css.render(
      makeNode("Css"),
      { child: makeChild("Card"), class: ["a", "b"] },
      makeHelpers(),
    ) as HTMLElement;
    expect(node.classList.contains("a")).toBe(true);
    expect(node.classList.contains("b")).toBe(true);
  });

  it("drops unsafe inline style declarations", () => {
    const node = Css.render(
      makeNode("Css"),
      { child: makeChild("Card"), style: "background: url(javascript:alert(1))" },
      makeHelpers(),
    ) as HTMLElement;
    // The whole declaration is rejected because of the `javascript:` URL.
    expect(node.getAttribute("style")).toBeNull();
  });

  it("drops attribute-breaking class tokens silently", () => {
    const node = Css.render(
      makeNode("Css"),
      { child: makeChild("Card"), class: 'safe " onerror="alert(1)' },
      makeHelpers(),
    ) as HTMLElement;
    expect(node.classList.contains("safe")).toBe(true);
    expect(node.getAttribute("class")?.includes("onerror")).toBe(false);
  });

  it("wraps non-element children in a span anchor", () => {
    const node = Css.render(
      makeNode("Css"),
      { child: "plain text", class: "wrapped" },
      makeHelpers(),
    ) as HTMLElement;
    expect(node.tagName.toLowerCase()).toBe("span");
    expect(node.classList.contains("wrapped")).toBe(true);
    expect(node.textContent).toBe("plain text");
  });
});

/* ------------------------------------------------------------------------ *
 * Link
 * ------------------------------------------------------------------------ */

describe("Link (router-aware)", () => {
  it("renders a string label and a plain href when only `href` is provided", () => {
    const anchor = Link.render(
      makeNode("Link"),
      { label: "Docs", href: "/docs" },
      makeHelpers(),
    ) as HTMLAnchorElement;
    expect(anchor.tagName.toLowerCase()).toBe("a");
    expect(anchor.getAttribute("href")).toBe("/docs");
    expect(anchor.textContent).toBe("Docs");
  });

  it("renders a wrapped component as its child", () => {
    const anchor = Link.render(
      makeNode("Link"),
      { label: makeChild("Badge"), to: "/profile" },
      makeHelpers(),
    ) as HTMLAnchorElement;
    expect(anchor.querySelector(".rui-stub")?.getAttribute("data-component-name")).toBe("Badge");
  });

  it("intercepts clicks on `to` links and navigates via the runtime router", () => {
    const router = new Router();
    const navigate = vi.spyOn(router, "navigate");
    const anchor = Link.render(
      makeNode("Link"),
      { label: "Go", to: "/dashboard" },
      makeHelpers({ router }),
    ) as HTMLAnchorElement;

    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not hijack modifier-clicks (open-in-new-tab gestures keep working)", () => {
    const router = new Router();
    const navigate = vi.spyOn(router, "navigate");
    const anchor = Link.render(
      makeNode("Link"),
      { label: "Go", to: "/dashboard" },
      makeHelpers({ router }),
    ) as HTMLAnchorElement;

    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, metaKey: true }));
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 1 }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens external destinations in a new tab with `noopener noreferrer`", () => {
    const anchor = Link.render(
      makeNode("Link"),
      { label: "External", href: "https://example.com", external: true },
      makeHelpers(),
    ) as HTMLAnchorElement;
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("still sanitises hostile `href` schemes when `to` is omitted", () => {
    const anchor = Link.render(
      makeNode("Link"),
      // eslint-disable-next-line no-script-url
      { label: "evil", href: "javascript:alert(1)" },
      makeHelpers(),
    ) as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("#");
  });
});

/* ------------------------------------------------------------------------ *
 * SidebarItem `to` integration
 * ------------------------------------------------------------------------ */

describe("SidebarItem with `to`", () => {
  it("navigates via the runtime router when clicked", () => {
    const router = new Router();
    const navigate = vi.spyOn(router, "navigate");
    const node = SidebarItem.render(
      makeNode("SidebarItem"),
      { label: "Home", to: "/" },
      makeHelpers({ router }),
    ) as HTMLButtonElement;

    expect(node.getAttribute("data-to")).toBe("/");
    node.click();
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("auto-derives the `active` state from the current router path", () => {
    const router = new Router();
    router.setPath("/orders");
    const node = SidebarItem.render(
      makeNode("SidebarItem"),
      { label: "Orders", to: "/orders" },
      makeHelpers({ router }),
    ) as HTMLButtonElement;
    expect(node.getAttribute("data-active")).toBe("true");

    const inactive = SidebarItem.render(
      makeNode("SidebarItem"),
      { label: "Reports", to: "/reports" },
      makeHelpers({ router }),
    ) as HTMLButtonElement;
    expect(inactive.getAttribute("data-active")).toBe("false");
  });

  it("invokes `onClick` in addition to navigating", () => {
    const action = vi.fn();
    const router = new Router();
    const navigate = vi.spyOn(router, "navigate");
    const node = SidebarItem.render(
      makeNode("SidebarItem"),
      { label: "Home", to: "/", onClick: action },
      makeHelpers({ router }),
    ) as HTMLButtonElement;
    node.click();
    expect(navigate).toHaveBeenCalledWith("/");
    expect(action).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------------ *
 * onChange — fires with the freshly-read value on every input change
 * ------------------------------------------------------------------------ */

describe("Input components — onChange(value)", () => {
  it("Input fires onChange(value) on every keystroke", () => {
    const onChange = vi.fn();
    const node = Input.render(
      makeNode("Input"),
      { id: "name", onChange },
      makeHelpers(),
    ) as HTMLInputElement;

    node.value = "ada";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("ada");
  });

  it("TextArea fires onChange(value) on every input event", () => {
    const onChange = vi.fn();
    const node = TextArea.render(
      makeNode("TextArea"),
      { id: "notes", onChange },
      makeHelpers(),
    ) as HTMLTextAreaElement;

    node.value = "hello";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("Select fires onChange(value) with the newly-selected option", () => {
    const onChange = vi.fn();
    const items = [
      makeNode("SelectItem", ["a", "A"]),
      makeNode("SelectItem", ["b", "B"]),
    ];
    const helpers = makeHelpers({
      renderNode: (value: unknown) => {
        // Render real <option> elements so Select can read .value back.
        const v = value as { args?: unknown[] };
        const opt = document.createElement("option");
        opt.value = String(v.args?.[0] ?? "");
        opt.textContent = String(v.args?.[1] ?? "");
        return opt;
      },
    });
    const node = Select.render(
      makeNode("Select"),
      { id: "letter", items, onChange },
      helpers,
    ) as HTMLSelectElement;

    node.value = "b";
    node.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Checkbox fires onChange(boolean) with the new checked state", () => {
    const onChange = vi.fn();
    const wrapper = Checkbox.render(
      makeNode("Checkbox"),
      { id: "agree", label: "Accept", onChange },
      makeHelpers(),
    ) as HTMLElement;

    const input = wrapper.querySelector("input") as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(true);

    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("Radio fires onChange(value) with the selected option value", () => {
    const onChange = vi.fn();
    const wrapper = Radio.render(
      makeNode("Radio"),
      {
        id: "pick",
        items: [
          makeNode("SelectItem", ["a", "A"]),
          makeNode("SelectItem", ["b", "B"]),
        ],
        onChange,
      },
      makeHelpers(),
    ) as HTMLElement;

    const second = wrapper.querySelectorAll("input")[1] as HTMLInputElement;
    second.checked = true;
    second.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Slider fires onChange(number) on input", () => {
    const onChange = vi.fn();
    const wrapper = Slider.render(
      makeNode("Slider"),
      { id: "vol", min: 0, max: 100, value: 10, onChange },
      makeHelpers(),
    ) as HTMLElement;

    const input = wrapper.querySelector("input[type=\"range\"]") as HTMLInputElement;
    input.value = "42";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it("NumberInput fires onChange(number) with null when blank", () => {
    const onChange = vi.fn();
    const node = NumberInput.render(
      makeNode("NumberInput"),
      { id: "qty", onChange },
      makeHelpers(),
    ) as HTMLElement;

    const input = node.tagName.toLowerCase() === "input"
      ? (node as HTMLInputElement)
      : (node.querySelector("input") as HTMLInputElement);

    input.value = "7";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(7);

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("DatePicker fires onChange(value) with the ISO date string", () => {
    const onChange = vi.fn();
    const node = DatePicker.render(
      makeNode("DatePicker"),
      { id: "birthdate", onChange },
      makeHelpers(),
    ) as HTMLElement;
    const input = node.tagName.toLowerCase() === "input"
      ? (node as HTMLInputElement)
      : (node.querySelector("input") as HTMLInputElement);

    input.value = "2026-05-27";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("2026-05-27");
  });

  it("Switch fires onChange(boolean) when toggled", () => {
    const onChange = vi.fn();
    const wrapper = Switch.render(
      makeNode("Switch"),
      { id: "darkmode", label: "Dark mode", onChange },
      makeHelpers(),
    ) as HTMLElement;
    const input = wrapper.querySelector("input[type=\"checkbox\"]") as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("ToggleGroup fires onChange(value) when an option is picked", () => {
    const onChange = vi.fn();
    const wrapper = ToggleGroup.render(
      makeNode("ToggleGroup"),
      {
        id: "alignment",
        items: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
        onChange,
      },
      makeHelpers(),
    ) as HTMLElement;
    const buttons = wrapper.querySelectorAll("button");
    (buttons[1] as HTMLButtonElement).click();
    expect(onChange).toHaveBeenCalledWith("right");
  });
});

/* ------------------------------------------------------------------------ *
 * attachOnChange helper
 * ------------------------------------------------------------------------ */

describe("attachOnChange helper", () => {
  it("does nothing when the callback is null/undefined", () => {
    const input = document.createElement("input");
    attachOnChange(input, null, makeHelpers(), {
      event: "input",
      getValue: () => "x",
    });
    // No listener attached — dispatching the event is a no-op.
    expect(() => input.dispatchEvent(new Event("input"))).not.toThrow();
  });

  it("invokes the callback with the read value on the chosen event", () => {
    const input = document.createElement("input");
    const onChange = vi.fn();
    attachOnChange(input, onChange, makeHelpers(), {
      event: "input",
      getValue: (el) => (el as HTMLInputElement).value.toUpperCase(),
    });
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith("HELLO");
  });

  it("defaults to the `change` event when none is provided", () => {
    const input = document.createElement("input");
    const onChange = vi.fn();
    attachOnChange(input, onChange, makeHelpers(), {
      getValue: () => "v",
    });
    input.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith("v");
  });
});
