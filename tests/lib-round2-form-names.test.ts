/**
 * The field-shell `name` reaches the form control a submission actually reads.
 *
 * `withFieldShell` writes `name` onto the element it is handed, and the
 * composites hand it their WRAPPER `<div>` — which no form submits. PinInput,
 * TagInput and MentionInput therefore submitted nothing under the author's
 * name (TagInput's text field submitted its draft under the id instead), and
 * the rest carried a second, inert copy on the wrapper. Every case here reads
 * a real `FormData` off the rendered `<form>`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, type Screen } from "../src/testing/index.js";

afterEach(() => cleanup());

async function mountForm(field: string, setup = ""): Promise<Screen> {
  const screen = render(`${setup}\n$app(Form({ fields: [${field}] }))`);
  await screen.flush();
  return screen;
}

const formData = (screen: Screen): FormData => new FormData(screen.shadowRoot.querySelector("form")!);

/** Every element carrying a `name`, as `tag.class` — to prove no `<div name>` is left behind. */
const namedElements = (screen: Screen): string[] =>
  [...screen.shadowRoot.querySelectorAll("form [name]")].map((n) => `${n.tagName.toLowerCase()}.${n.classList[0] ?? ""}`);

describe("PinInput", () => {
  const type = async (screen: Screen, code: string): Promise<void> => {
    const slots = [...screen.shadowRoot.querySelectorAll<HTMLInputElement>(".rui-pin-input-slot")];
    [...code].forEach((ch, i) => {
      slots[i]!.value = ch;
      slots[i]!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await screen.flush();
  };

  it("submits the joined code under `name`", async () => {
    const screen = await mountForm(`PinInput("pin", { name: "code" })`);
    await type(screen, "1234");
    expect(formData(screen).getAll("code")).toEqual(["1234"]);
    expect(namedElements(screen)).toEqual(["input.rui-pin-input-value"]);
  });

  it("defaults the name to `id` and follows a gap like onChange does", async () => {
    const screen = await mountForm(`PinInput("pin")`);
    await type(screen, "12");
    expect(formData(screen).getAll("pin")).toEqual(["12"]);
  });

  it("submits a bound value", async () => {
    const screen = await mountForm(`PinInput("pin", { value: $code, name: "code" })`, `let $code = "4321"`);
    expect(formData(screen).get("code")).toBe("4321");
  });

  it("disables the submitted field with the slots", async () => {
    const screen = await mountForm(`PinInput("pin", { name: "code", disabled: true })`);
    expect(screen.shadowRoot.querySelector("input.rui-pin-input-value")?.hasAttribute("disabled")).toBe(true);
  });
});

describe("TagInput", () => {
  it("submits one entry per tag under `name`, and not the draft", async () => {
    const screen = await mountForm(`TagInput("tags", { value: $tags, name: "labels" })`, `let $tags = ["a", "b"]`);
    expect(formData(screen).getAll("labels")).toEqual(["a", "b"]);
    expect(formData(screen).getAll("tags")).toEqual([]);
    expect(namedElements(screen)).toEqual(["input.rui-tag-input-value", "input.rui-tag-input-value"]);
  });

  it("defaults the name to `id` and follows a committed tag", async () => {
    const screen = await mountForm(`TagInput("tags", { value: $tags })`, `let $tags = ["a"]`);
    const field = screen.shadowRoot.querySelector<HTMLInputElement>(".rui-tag-input-field")!;
    field.value = "b";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await screen.flush();
    expect(screen.state.get("tags")).toEqual(["a", "b"]);
    expect(formData(screen).getAll("tags")).toEqual(["a", "b"]);
  });

  it("disables the submitted fields with the control", async () => {
    const screen = await mountForm(`TagInput("tags", { value: ["a"], disabled: true })`);
    expect(screen.shadowRoot.querySelector("input.rui-tag-input-value")?.hasAttribute("disabled")).toBe(true);
  });
});

describe("MentionInput", () => {
  it("submits the text under `name`", async () => {
    const screen = await mountForm(`MentionInput("m", { people: ["ada"], value: "hi @ada", name: "comment" })`);
    expect(formData(screen).getAll("comment")).toEqual(["hi @ada"]);
    expect(formData(screen).getAll("m")).toEqual([]);
    expect(namedElements(screen)).toEqual(["textarea.rui-mention-input-field"]);
  });
});

describe("composites that already named their control keep no copy on the wrapper", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const cases: Array<{ name: string; field: string; value: string; control: string }> = [
    { name: "PasswordInput", field: `PasswordInput("pw", { name: "zz", value: "s3cret" })`, value: "s3cret", control: "input.rui-password-input-field" },
    { name: "TimePicker", field: `TimePicker("t", { name: "zz", value: "10:30" })`, value: "10:30", control: "input.rui-time-picker-input" },
    { name: "DateTimePicker", field: `DateTimePicker("dt", { name: "zz", value: "2026-01-02T10:30" })`, value: "2026-01-02T10:30", control: "input.rui-datetime-picker-input" },
    { name: "RichTextEditor", field: `RichTextEditor("r", { name: "zz", value: "<p>hi</p>" })`, value: "<p>hi</p>", control: "input.rui-rich-text-mirror" },
    { name: "CodeEditor", field: `CodeEditor("c", { name: "zz", value: "let x = 1" })`, value: "let x = 1", control: "textarea.rui-code-editor-textarea" },
    { name: "ColorPicker", field: `ColorPicker("cp", { name: "zz", value: "#ff0000" })`, value: "#ff0000", control: "input.rui-color-picker-color" },
    { name: "DrawingCanvas", field: `DrawingCanvas({ name: "zz", value: "${PNG}" })`, value: PNG, control: "input.rui-canvas-value" },
    { name: "SignaturePad", field: `SignaturePad({ name: "zz", value: "${PNG}" })`, value: PNG, control: "input.rui-canvas-value" },
  ];

  it.each(cases)("$name", async (c) => {
    const screen = await mountForm(c.field);
    expect(formData(screen).getAll("zz")).toEqual([c.value]);
    expect(namedElements(screen)).toEqual([c.control]);
  });

  it("…including inside a labelled shell", async () => {
    const screen = await mountForm(`TimePicker("t", { name: "zz", label: "Start", value: "09:00" })`);
    expect(formData(screen).getAll("zz")).toEqual(["09:00"]);
    expect(namedElements(screen)).toEqual(["input.rui-time-picker-input"]);
  });
});
