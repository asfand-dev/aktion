/**
 * Reactive form engine — `$form({ values, rules, onSubmit })` (V.1).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await flush(); };

type ScriptedEl = HTMLElement & { setResponse(text: string): void };
const create = (): ScriptedEl => {
  const el = document.createElement("aktion-app");
  document.body.appendChild(el);
  return el as ScriptedEl;
};
const textOf = (el: ScriptedEl): string => el.shadowRoot?.textContent ?? "";
const clickButton = async (el: ScriptedEl, label: string): Promise<void> => {
  const btn = [...(el.shadowRoot?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").includes(label)) as HTMLButtonElement;
  btn.click();
  await settle();
};

const FORM_PROGRAM = `
form = $form({
  values: { email: "", age: "" },
  rules: {
    email: [$util.rules.required(), $util.rules.email()],
    age: [$util.rules.required(), $util.rules.min(18)]
  },
  onSubmit: (values) => { $submitted = values.email }
})
$submitted = ""
function App() {
  return Column([
    Text(\`valid:\${form.valid}\`),
    Text(\`emailErr:\${form.errors.email ?? "none"}\`),
    Text(\`submitted:\${$submitted}\`),
    Button("Validate", { onClick: () => form.validate() }),
    Button("Submit", { onClick: () => form.handleSubmit() }),
    Button("SetGood", { onClick: () => { form.setField("email", "a@b.co"); form.setField("age", 21) } })
  ])
}
$app(App())
`;

describe("$form engine (V.1)", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("validates fields and exposes errors + valid flag", async () => {
    const el = create();
    el.setResponse(FORM_PROGRAM);
    await settle();
    expect(textOf(el)).toContain("emailErr:none");

    await clickButton(el, "Validate");
    expect(textOf(el)).toContain("valid:false");
    expect(textOf(el)).toContain("emailErr:");
    expect(textOf(el)).not.toContain("emailErr:none");
  });

  it("does not call onSubmit while invalid", async () => {
    const el = create();
    el.setResponse(FORM_PROGRAM);
    await settle();
    await clickButton(el, "Submit");
    expect(textOf(el)).toContain("submitted:");
    expect(textOf(el)).not.toContain("submitted:a@b.co");
  });

  it("submits once values are valid", async () => {
    const el = create();
    el.setResponse(FORM_PROGRAM);
    await settle();
    await clickButton(el, "SetGood");
    await clickButton(el, "Submit");
    expect(textOf(el)).toContain("submitted:a@b.co");
    expect(textOf(el)).toContain("valid:true");
  });

  it("two-way binds a field via the store path and validates on blur", async () => {
    const el = create();
    el.setResponse(`
form = $form({ values: { name: "" }, rules: { name: [$util.rules.required()] } })
function App() {
  return Column([
    Input("name", { value: form.values.name, onBlur: () => form.touch("name") }),
    Text(\`val:\${form.values.name}\`),
    Text(\`err:\${form.errors.name ?? "none"}\`)
  ])
}
$app(App())`);
    await settle();
    const input = el.shadowRoot?.querySelector("input") as HTMLInputElement;
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    expect(textOf(el)).toContain("val:Ada");
  });

  it("field() returns a controlled prop bag with value + handlers", async () => {
    const el = create();
    el.setResponse(`
form = $form({ values: { name: "Ada" }, rules: { name: [$util.rules.required()] } })
function App() {
  f = form.field("name")
  return Column([Text(\`fval:\${f.value}\`), Text(\`fname:\${f.name}\`)])
}
$app(App())`);
    await settle();
    expect(textOf(el)).toContain("fval:Ada");
    expect(textOf(el)).toContain("fname:name");
  });

  it("reset() clears values and errors", async () => {
    const el = create();
    el.setResponse(`
form = $form({ values: { name: "x" }, rules: { name: [$util.rules.required()] } })
function App() {
  return Column([
    Text(\`name:\${form.values.name}\`),
    Button("Clear", { onClick: () => { form.setField("name", ""); form.validate() } }),
    Button("Reset", { onClick: () => form.reset() })
  ])
}
$app(App())`);
    await settle();
    await clickButton(el, "Clear");
    expect(textOf(el)).toContain("name:");
    await clickButton(el, "Reset");
    expect(textOf(el)).toContain("name:x");
  });
});
