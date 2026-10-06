/**
 * Event wiring in the editor, advanced-form and layout components that has to
 * survive the morph reconciler, and payloads that have to reach the program
 * intact.
 *
 *   - `onChange` on TimePicker, DateTimePicker, RichTextEditor, CodeEditor and
 *     ColorPicker went through `attachOnChange` (since removed), an `addEventListener` the
 *     reconciler cannot transfer onto the node it keeps. A handler supplied on a
 *     later render never fired, one withdrawn later kept firing, and a lambda
 *     closing over loop locals stayed frozen at the first render.
 *   - TagInput's `onFocus` received the draft text while `onBlur` received the
 *     tag list.
 *   - Accordion's `onChange` reported the echo of a controlled item's
 *     programmatic `open` change, which AccordionItem's own `onToggle`
 *     suppresses to stop open/close loops.
 *   - Draggable handed a DropZone different values on the pointer and keyboard
 *     paths: a string payload was JSON-parsed after a pointer drop (`"42"`
 *     arrived as `42`).
 *   - Lottie never reported lottie-web's asynchronous `data_failed`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup, type Screen } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  delete (window as unknown as { lottie?: unknown }).lottie;
});

function query<T extends Element>(screen: Screen, selector: string): T {
  const node = screen.shadowRoot.querySelector<T>(selector);
  expect(node, `${selector} not rendered`).not.toBeNull();
  return node!;
}

interface ChangeCase {
  name: string;
  /** The component call, with `ON_CHANGE` standing for the onChange expression. */
  call: string;
  selector: string;
  /** Put a new value on the live control and fire the event onChange listens to. */
  edit: (node: HTMLElement) => void;
  expected: string;
}

const setValue = (event: string, value: string) => (node: HTMLElement): void => {
  (node as HTMLInputElement).value = value;
  node.dispatchEvent(new Event(event, { bubbles: true }));
};

const CHANGE_CASES: ChangeCase[] = [
  {
    name: "TimePicker",
    call: `TimePicker("t", { onChange: ON_CHANGE })`,
    selector: ".rui-time-picker-input",
    edit: setValue("change", "10:30"),
    expected: "10:30",
  },
  {
    name: "DateTimePicker",
    call: `DateTimePicker("dt", { onChange: ON_CHANGE })`,
    selector: ".rui-datetime-picker-input",
    edit: setValue("change", "2026-01-02T10:30"),
    expected: "2026-01-02T10:30",
  },
  {
    name: "RichTextEditor",
    call: `RichTextEditor("rte", { onChange: ON_CHANGE })`,
    selector: ".rui-rich-text-content",
    edit: (node) => {
      node.innerHTML = "<p>hello</p>";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    },
    expected: "<p>hello</p>",
  },
  {
    name: "CodeEditor",
    call: `CodeEditor("ce", { onChange: ON_CHANGE })`,
    selector: ".rui-code-editor-textarea",
    edit: setValue("input", "let x = 1"),
    expected: "let x = 1",
  },
  {
    name: "ColorPicker",
    call: `ColorPicker("c", { onChange: ON_CHANGE })`,
    selector: ".rui-color-picker-color",
    edit: setValue("input", "#ff0000"),
    expected: "#ff0000",
  },
];

describe("onChange survives the morph reconciler", () => {
  it.each(CHANGE_CASES)("$name picks up a handler that is only supplied on a later render", async (c) => {
    const screen = render(`
let $on = false
let $got = "none"
$app(Column([
  Button("arm", { onClick: () => { $on = true } }),
  ${c.call.replace("ON_CHANGE", "$on ? (v) => { $got = v } : null")},
]))`);
    await screen.flush();
    await screen.click("arm");
    c.edit(query<HTMLElement>(screen, c.selector));
    await screen.flush();
    expect(screen.state.get("got")).toBe(c.expected);
  });

  it.each(CHANGE_CASES)("$name stops calling a handler that a later render withdraws", async (c) => {
    const screen = render(`
let $on = true
let $calls = 0
$app(Column([
  Button("disarm", { onClick: () => { $on = false } }),
  ${c.call.replace("ON_CHANGE", "$on ? (v) => { $calls = $calls + 1 } : null")},
]))`);
    await screen.flush();
    await screen.click("disarm");
    c.edit(query<HTMLElement>(screen, c.selector));
    await screen.flush();
    expect(screen.state.get("calls")).toBe(0);
  });

  it.each(CHANGE_CASES)("$name calls the latest render's closure, not the first one's", async (c) => {
    // The lambda closes over a `.map` local; after the swap the kept node must
    // report the new row's tag, not the departed one's.
    const screen = render(`
let $rows = ["first"]
let $got = "none"
$app(Column([
  Button("swap", { onClick: () => { $rows = ["second"] } }),
  Column($rows.map((tag) => ${c.call.replace("ON_CHANGE", "(v) => { $got = tag }")})),
]))`);
    await screen.flush();
    await screen.click("swap");
    c.edit(query<HTMLElement>(screen, c.selector));
    await screen.flush();
    expect(screen.state.get("got")).toBe("second");
  });
});

describe("TagInput focus callbacks", () => {
  it("onFocus receives the committed tags, like onBlur", async () => {
    const screen = render(`
let $tags = ["a", "b"]
let $focused = null
let $blurred = null
$app(TagInput("tags", { value: $tags, onFocus: (v) => { $focused = v }, onBlur: (v) => { $blurred = v } }))`);
    await screen.flush();
    const field = query<HTMLInputElement>(screen, ".rui-tag-input-field");
    field.dispatchEvent(new FocusEvent("focus"));
    await screen.flush();
    expect(screen.state.get("focused")).toEqual(["a", "b"]);
    field.dispatchEvent(new FocusEvent("blur"));
    await screen.flush();
    expect(screen.state.get("blurred")).toEqual(["a", "b"]);
  });
});

describe("Accordion onChange ignores the echo of a controlled item", () => {
  it("does not report a programmatic open, just as AccordionItem.onToggle does not", async () => {
    const screen = render(`
let $o = false
let $changes = []
let $toggles = []
$app(Column([
  Button("open it", { onClick: () => { $o = true } }),
  Accordion([
    AccordionItem("S", [Text("body")], $o, { onToggle: (open) => { $toggles = [...$toggles, open] } }),
  ], { onChange: (title, open) => { $changes = [...$changes, [title, open]] } }),
]))`);
    await screen.flush();
    await screen.click("open it");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await screen.flush();
    expect(query<HTMLDetailsElement>(screen, ".rui-accordion-item").open).toBe(true);
    expect(screen.state.get("toggles")).toEqual([]);
    expect(screen.state.get("changes")).toEqual([]);
  });

  it("still reports a user toggle of an uncontrolled item", async () => {
    const screen = render(`
let $changes = []
$app(Accordion([AccordionItem("S", [Text("body")])], { onChange: (title, open) => { $changes = [...$changes, [title, open]] } }))`);
    await screen.flush();
    const item = query<HTMLDetailsElement>(screen, ".rui-accordion-item");
    item.open = true;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await screen.flush();
    expect(screen.state.get("changes")).toEqual([["S", true]]);
  });
});

describe("Draggable hands the DropZone the same payload on both paths", () => {
  const program = (data: string): string => `
let $got = "none"
let $kind = "none"
$app(Column([
  Draggable(Text("drag me"), { data: ${data}, ariaLabel: "card" }),
  DropZone({ label: "drop here", onDrop: (d) => { $got = d; $kind = typeof d } }),
]))`;

  /** happy-dom's DragEvent ignores `dataTransfer` in its init dict, so attach it by hand. */
  const drag = (type: string, transfer: DataTransfer): Event => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    return event;
  };

  async function pointerDrop(screen: Screen): Promise<void> {
    const source = query<HTMLElement>(screen, ".rui-draggable");
    const zone = query<HTMLElement>(screen, ".rui-dropzone");
    const transfer = new DataTransfer();
    source.dispatchEvent(drag("dragstart", transfer));
    zone.dispatchEvent(drag("dragover", transfer));
    zone.dispatchEvent(drag("drop", transfer));
    source.dispatchEvent(drag("dragend", transfer));
    await screen.flush();
  }

  async function keyboardDrop(screen: Screen): Promise<void> {
    query<HTMLElement>(screen, ".rui-draggable").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    query<HTMLElement>(screen, ".rui-dropzone").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    await screen.flush();
  }

  it.each([
    ["a numeric string", `"42"`, "42", "string"],
    ["the string 'true'", `"true"`, "true", "string"],
    ["a number", "42", 42, "number"],
  ])("%s arrives unchanged after a pointer drop and a keyboard drop", async (_label, data, expected, kind) => {
    const pointer = render(program(data));
    await pointer.flush();
    await pointerDrop(pointer);
    expect(pointer.state.get("got")).toBe(expected);
    expect(pointer.state.get("kind")).toBe(kind);
    cleanup();

    const keyboard = render(program(data));
    await keyboard.flush();
    await keyboardDrop(keyboard);
    expect(keyboard.state.get("got")).toBe(expected);
    expect(keyboard.state.get("kind")).toBe(kind);
  });

  it("an object payload arrives equal on the pointer path", async () => {
    const screen = render(program(`{ id: 7, tags: ["x"] }`));
    await screen.flush();
    await pointerDrop(screen);
    expect(screen.state.get("got")).toEqual({ id: 7, tags: ["x"] });
  });

  it("text dropped from outside the app is still parsed as JSON when it can be", async () => {
    const screen = render(program(`"unused"`));
    await screen.flush();
    const zone = query<HTMLElement>(screen, ".rui-dropzone");
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "[1,2]");
    zone.dispatchEvent(drag("drop", transfer));
    await screen.flush();
    expect(screen.state.get("got")).toEqual([1, 2]);
  });
});

describe("Lottie reports asynchronous load failures", () => {
  it("calls onError with \"load-failed\" when lottie-web signals data_failed", async () => {
    const listeners: Record<string, Array<() => void>> = {};
    (window as unknown as { lottie: unknown }).lottie = {
      loadAnimation: () => ({
        addEventListener: (name: string, cb: () => void) => { (listeners[name] ??= []).push(cb); },
        destroy: () => {},
      }),
    };
    const screen = render(`
let $errors = []
$app(Lottie({ src: "https://example.com/missing.json", onError: (reason) => { $errors = [...$errors, reason] } }))`);
    await screen.flush();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await screen.flush();
    expect(listeners.data_failed?.length, "data_failed is not subscribed").toBe(1);
    listeners.data_failed![0]!();
    // A second signal for the same load is not a second failure.
    listeners.data_failed![0]!();
    await screen.flush();
    expect(screen.state.get("errors")).toEqual(["load-failed"]);
  });
});
