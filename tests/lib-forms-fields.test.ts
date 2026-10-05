/**
 * Form-component defects from the forms audit, each pinned by the smallest
 * program that showed it.
 *
 *   - `optional: false` (or a number) printed the literal text as the marker.
 *   - `optional` had no visible effect on the controls that own their label.
 *   - A searchable `Select` dropped five declared field-shell props.
 *   - The documented object form of `Input(validations:)` was inverted.
 *   - `InputGroup` wrote `name` onto its wrapper div, and found the wrong
 *     element inside a `MultiSelect` / reported `""` for a `Combobox`.
 *   - `FormControl` around a composite field must still label the first
 *     control in document order, never a picker's hidden filter box.
 *   - `ButtonGroup(ariaLabelledBy:)` became the group's name TEXT.
 *   - `FileUpload(onSelect:)` handed over a `FileList` or an array, depending.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ButtonGroup,
  CheckBoxItem,
  Combobox,
  DatePicker,
  DateRangePicker,
  FileUpload,
  Input,
  normaliseButtonSize,
  Select,
} from "../src/library/components/forms.js";
import { FIELD_SHELL_PROPS } from "../src/library/components/forms-shared.js";
import { renderToStaticMarkup } from "../src/runtime/ssr.js";
import { cleanup, render } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fragment = (expression: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(`$app(${expression})`);
  return host;
};

const optionalMarks = (root: ParentNode): string[] =>
  [...root.querySelectorAll(".rui-field-optional")].map((n) => n.textContent ?? "");

describe("the optional marker", () => {
  it("renders nothing for optional: false — not the word \"false\"", () => {
    expect(optionalMarks(fragment(`Input("a", { label: "Name", optional: false })`))).toEqual([]);
    expect(optionalMarks(fragment(`FormControl("Name", Input("b"), { optional: false })`))).toEqual([]);
  });

  it("renders nothing for a number", () => {
    expect(optionalMarks(fragment(`Input("a", { label: "Name", optional: 0 })`))).toEqual([]);
    expect(optionalMarks(fragment(`Input("a", { label: "Name", optional: 1 })`))).toEqual([]);
    expect(optionalMarks(fragment(`FormControl("Name", Input("b"), { optional: 2 })`))).toEqual([]);
  });

  it("optional: false alone does not wrap the control in a field shell", () => {
    const root = fragment(`Input("a", { optional: false })`);
    expect(root.firstElementChild?.firstElementChild?.tagName).toBe("INPUT");
  });

  it("still renders the built-in word for true and the author's own wording for a string", () => {
    expect(optionalMarks(fragment(`Input("a", { label: "Name", optional: true })`))).toEqual(["(optional)"]);
    expect(optionalMarks(fragment(`Input("a", { label: "Name", optional: "(facultatif)" })`))).toEqual(["(facultatif)"]);
    expect(optionalMarks(fragment(`FormControl("Name", Input("b"), { optional: true })`))).toEqual(["(optional)"]);
  });

  it("shows on the controls that render their own label", () => {
    const cases = [
      `Checkbox("terms", "Send me news", { optional: true })`,
      `Slider("vol", { label: "Volume", optional: true })`,
      `DatePicker("d", { label: "Start", optional: true })`,
      `DateRangePicker("r", { label: "Period", optional: true })`,
    ];
    for (const expression of cases) {
      const root = fragment(expression);
      expect(optionalMarks(root), expression).toEqual(["(optional)"]);
    }
  });

  it("sits inside the label it qualifies, so it is part of the accessible name", () => {
    expect(fragment(`Checkbox("t", "News", { optional: true })`).querySelector(".rui-checkbox-label .rui-field-optional")).not.toBeNull();
    expect(fragment(`Slider("v", { label: "Volume", optional: true })`).querySelector(".rui-slider-label .rui-field-optional")).not.toBeNull();
    expect(fragment(`DatePicker("d", { label: "Start", optional: true })`).querySelector(".rui-date-picker-label .rui-field-optional")).not.toBeNull();
    expect(fragment(`DateRangePicker("r", { label: "Period", optional: true })`).querySelector(".rui-date-range-picker-label .rui-field-optional")).not.toBeNull();
  });

  it("is suppressed by required on those controls too", () => {
    expect(optionalMarks(fragment(`Checkbox("t", "News", { optional: true, required: true })`))).toEqual([]);
    expect(optionalMarks(fragment(`DatePicker("d", { label: "Start", optional: true, required: true })`))).toEqual([]);
  });
});

describe("searchable Select forwards every field-shell prop", () => {
  const props = `label: "Owner", warning: "Careful", description: "Who owns it", optional: true, invalid: true, describedBy: "ext-help"`;

  for (const variant of ["searchable: true", "onSearch: (q) => {}"]) {
    it(`warning / description / optional / invalid / describedBy survive ${variant}`, () => {
      const root = fragment(`Select("owner", { items: ["a", "b"], ${props}, ${variant} })`);
      expect(root.querySelector(".rui-select-searchable")).not.toBeNull();
      expect(root.querySelector(".rui-field-warning")?.textContent).toBe("Careful");
      expect(root.querySelector(".rui-field-description")?.textContent).toBe("Who owns it");
      expect(optionalMarks(root)).toEqual(["(optional)"]);
      const trigger = root.querySelector(".rui-combobox-trigger");
      expect(trigger?.getAttribute("aria-invalid")).toBe("true");
      expect(trigger?.getAttribute("aria-describedby")?.split(" ")).toContain("ext-help");
    });
  }
});

describe("Input validations — the object form", () => {
  const inputOf = (validations: string, type = ""): HTMLInputElement =>
    fragment(`Input("e", { ${type}validations: ${validations} })`).querySelector("input")!;

  it("a true flag applies the bare hint", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = inputOf(`{ required: true, email: true }`);
    expect(input.hasAttribute("required")).toBe(true);
    expect(input.getAttribute("type")).toBe("email");
    expect(warn).not.toHaveBeenCalled();
  });

  it("a false flag is off — it used to be the one that switched the hint on", () => {
    const input = inputOf(`{ required: false, email: false }`);
    expect(input.hasAttribute("required")).toBe(false);
    expect(input.getAttribute("type")).toBe("text");
  });

  it("valued hints keep a falsy value instead of collapsing to the bare key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = inputOf(`{ minLength: 3, maxLength: 12, min: 0, max: 0, pattern: "[a-z]+" }`, `type: "number", `);
    expect(input.getAttribute("minlength")).toBe("3");
    expect(input.getAttribute("maxlength")).toBe("12");
    expect(input.getAttribute("min")).toBe("0");
    expect(input.getAttribute("max")).toBe("0");
    expect(input.getAttribute("pattern")).toBe("[a-z]+");
    expect(warn).not.toHaveBeenCalled();
  });

  it("the array form is unchanged", () => {
    const input = inputOf(`["required", "minLength:2", "email"]`);
    expect(input.hasAttribute("required")).toBe(true);
    expect(input.getAttribute("minlength")).toBe("2");
    expect(input.getAttribute("type")).toBe("email");
  });
});

describe("Button sizes", () => {
  it("normaliseButtonSize knows every spelling the validator accepts", () => {
    expect(normaliseButtonSize("s")).toBe("sm");
    expect(normaliseButtonSize("m")).toBe("md");
    expect(normaliseButtonSize("l")).toBe("lg");
    expect(normaliseButtonSize("normal")).toBe("md");
    expect(normaliseButtonSize("small")).toBe("sm");
    expect(normaliseButtonSize("extra-large")).toBe("xl");
    expect(normaliseButtonSize("bogus")).toBe("md");
  });
});

describe("ButtonGroup naming", () => {
  it("ariaLabelledBy references the labelling element instead of becoming the name text", () => {
    const group = fragment(`ButtonGroup([Button("A")], { ariaLabelledBy: "range-heading" })`).querySelector(".rui-button-group")!;
    expect(group.getAttribute("aria-labelledby")).toBe("range-heading");
    expect(group.getAttribute("aria-label")).toBeNull();
  });

  it("ariaLabel and its label alias still name the group directly", () => {
    expect(fragment(`ButtonGroup([Button("A")], { ariaLabel: "Time range" })`).querySelector(".rui-button-group")?.getAttribute("aria-label")).toBe("Time range");
    expect(fragment(`ButtonGroup([Button("A")], { label: "Time range" })`).querySelector(".rui-button-group")?.getAttribute("aria-label")).toBe("Time range");
  });

  it("ariaLabelledBy is its own prop, not an alias of ariaLabel", () => {
    const ariaLabel = ButtonGroup.props.find((p) => p.name === "ariaLabel");
    expect(ariaLabel?.aliases ?? []).not.toContain("ariaLabelledBy");
    expect(ButtonGroup.props.some((p) => p.name === "ariaLabelledBy")).toBe(true);
  });
});

describe("field-shell name lands on the form control", () => {
  it("InputGroup", () => {
    const root = fragment(`InputGroup(Input("q"), { name: "query", icon: "search" })`);
    expect(root.querySelector("input")?.getAttribute("name")).toBe("query");
    expect(root.querySelector(".rui-input-group")?.hasAttribute("name")).toBe(false);
  });

  it("NumberInput", () => {
    const root = fragment(`NumberInput("qty", { name: "quantity" })`);
    expect(root.querySelector("input")?.getAttribute("name")).toBe("quantity");
    expect(root.querySelector(".rui-number-input")?.hasAttribute("name")).toBe(false);
  });
});

describe("InputGroup finds a picker's trigger", () => {
  it("around a MultiSelect, disabled and the validation aria reach the trigger, not the panel's filter", () => {
    const root = fragment(`InputGroup(MultiSelect("tags", { items: ["a", "b"], value: ["a"] }), { disabled: true, error: "Pick one" })`);
    const trigger = root.querySelector(".rui-multiselect-trigger")!;
    const filter = root.querySelector(".rui-multiselect-filter")!;
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(filter.hasAttribute("disabled")).toBe(false);
    expect(filter.hasAttribute("aria-invalid")).toBe(false);
  });

  it("around a Combobox, onBlur / onFocus report the selected value", async () => {
    const screen = render(`$blurred = "unset"
$focused = "unset"
$app(InputGroup(Combobox("c", { items: ["x", "y"], value: "y" }), { onBlur: (v) => $blurred = v, onFocus: (v) => $focused = v }))`);
    await screen.flush();
    const trigger = screen.shadowRoot.querySelector(".rui-combobox-trigger")!;
    trigger.dispatchEvent(new Event("focus"));
    trigger.dispatchEvent(new Event("blur"));
    await screen.flush();
    expect(screen.state.get("focused")).toBe("y");
    expect(screen.state.get("blurred")).toBe("y");
  });

  it("around a MultiSelect, onBlur reports the selected values", async () => {
    const screen = render(`$blurred = "unset"
$app(InputGroup(MultiSelect("m", { items: ["a", "b", "c"], value: ["a", "c"] }), { onBlur: (v) => $blurred = v }))`);
    await screen.flush();
    screen.shadowRoot.querySelector(".rui-multiselect-trigger")!.dispatchEvent(new Event("blur"));
    await screen.flush();
    expect(screen.state.get("blurred")).toEqual(["a", "c"]);
  });

  it("around an Input, onBlur still reports the typed text", async () => {
    const screen = render(`$blurred = "unset"
$app(InputGroup(Input("q", { value: "hello" }), { onBlur: (v) => $blurred = v }))`);
    await screen.flush();
    screen.shadowRoot.querySelector("input")!.dispatchEvent(new Event("blur"));
    await screen.flush();
    expect(screen.state.get("blurred")).toBe("hello");
  });
});

describe("FormControl labels the first control in document order", () => {
  const labelFor = (root: ParentNode): string | null | undefined =>
    root.querySelector(".rui-form-label")?.getAttribute("for");

  it("an Input with a Combobox action keeps the label and the error on the Input", () => {
    const root = fragment(`FormControl("Amount", InputGroup(Input("amt"), { action: Combobox("cur", { items: ["EUR", "USD"] }) }), { error: "Bad" })`);
    expect(labelFor(root)).toBe("amt");
    const amount = root.querySelector("#amt")!;
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(amount.getAttribute("aria-describedby")?.split(" ")).toContain("amt-error");
    const currency = root.querySelector("#cur")!;
    expect(currency.hasAttribute("aria-invalid")).toBe(false);
    expect(currency.hasAttribute("aria-describedby")).toBe(false);
  });

  it("an Input before a MultiSelect in a Row keeps the label on the Input", () => {
    expect(labelFor(fragment(`FormControl("Search", Row([Input("q"), MultiSelect("tags", { items: ["a", "b"] })]))`))).toBe("q");
  });

  it("a picker before an Input in a Row gets the label — tree order, not selector order", () => {
    expect(labelFor(fragment(`FormControl("Owner", Row([Combobox("o", { items: ["a", "b"] }), Input("note")]))`))).toBe("o");
    expect(labelFor(fragment(`FormControl("Tags", Row([MultiSelect("t", { items: ["a", "b"] }), Input("note")]))`))).toBe("t");
  });

  it("a bare picker gets the label on its trigger, never on the panel's filter box", () => {
    expect(labelFor(fragment(`FormControl("Owner", Combobox("o", { items: ["a", "b"] }))`))).toBe("o");
    expect(labelFor(fragment(`FormControl("Tags", MultiSelect("t", { items: ["a", "b"] }))`))).toBe("t");
  });
});

describe("FileUpload onSelect", () => {
  it("always hands over a real array, whatever the input's files are", async () => {
    const screen = render(`$isArray = "unset"
$count = -1
$app(FileUpload("f", { onSelect: (files) => { $isArray = Array.isArray(files); $count = files.length } }))`);
    await screen.flush();
    const input = screen.shadowRoot.querySelector<HTMLInputElement>(".rui-file-upload-input")!;
    const file = new File(["hi"], "a.txt", { type: "text/plain" });
    // A FileList is array-LIKE: index access and `length`, no array methods.
    const fileList = { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) };
    Object.defineProperty(input, "files", { configurable: true, get: () => fileList });
    input.dispatchEvent(new Event("change"));
    await screen.flush();
    expect(screen.state.get("isArray")).toBe(true);
    expect(screen.state.get("count")).toBe(1);
  });
});

describe("prop descriptions say what the runtime does", () => {
  const description = (spec: { props: ReadonlyArray<{ name: string; description?: string }> }, prop: string): string =>
    spec.props.find((p) => p.name === prop)?.description ?? "";

  it("Combobox onSearch is debounced, not per keystroke", () => {
    expect(description(Combobox, "onSearch")).not.toMatch(/every keystroke/);
    expect(description(Combobox, "onSearch")).toMatch(/200\s?ms/);
  });

  it("every onFocus says it receives the current value", () => {
    for (const spec of [{ props: FIELD_SHELL_PROPS }, Select, DatePicker, Combobox, DateRangePicker, Input]) {
      expect(description(spec, "onFocus")).toMatch(/value/);
    }
  });

  it("CheckBoxItem value does not promise an array-of-ids group", () => {
    expect(description(CheckBoxItem, "value")).not.toMatch(/array of ids/);
  });

  it("FileUpload onSelect mentions the remove path", () => {
    expect(description(FileUpload, "onSelect")).toMatch(/remov/);
  });
});
