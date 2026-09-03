/**
 * A CONTROLLED `Switch` must follow its bound value in BOTH directions.
 *
 * The reported repro, verbatim:
 *
 *   const [isEnable, setIsEnable] = $state(true)
 *   Switch("test", { value: isEnable, label: isEnable ? "Enabled" : "Disabled",
 *                    onChange: () => setIsEnable(!isEnable) })
 *   Button("Toggle", () => setIsEnable(!isEnable))
 *
 * Pressing Toggle while `isEnable` is true re-rendered the label to "Disabled"
 * and left the switch visibly ON.
 *
 * The cause was a gap in what a boolean attribute can express. `Switch.render`
 * emitted `checked=""` for true and NOTHING for false, and `syncInput` in
 * `renderer/morph.ts` reads an absent `checked` as "this render is not
 * asserting a checked state — leave the user's toggle alone". That leniency is
 * there for a real reason (an UNCONTROLLED checkbox used to silently un-tick
 * itself on every unrelated re-render), but it also swallowed the one case that
 * *is* an assertion: a controlled switch turning off. `input.checked` stayed
 * true, `:checked` kept matching, and the CSS thumb stayed in the on position.
 *
 * Turning ON always worked — `checked=""` is present and gets applied — so the
 * defect was one-directional, which is why the label and the switch could
 * disagree rather than both being stuck.
 *
 * The fix is `data-checked`: a controlled switch publishes `"true"`/`"false"`
 * and morph honours it in both directions. An uncontrolled switch still emits
 * nothing and stays user-owned — `switchUncontrolledKeepsItsOwnState` below is
 * the guard that the fix did not buy the first bug back.
 *
 * The state is asserted on the DOM PROPERTY (`input.checked`) and on
 * `matches(":checked")`, not on the attribute: the property is what the
 * `.rui-switch-input:checked + .rui-switch-track .rui-switch-thumb` rule keys
 * off, so it is the thing a user actually sees. happy-dom has no layout, so the
 * thumb's transform itself is not observable here — `:checked` is the closest
 * honest proxy, and the browser check that closed this bug is recorded in the
 * commit rather than simulated.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (turns = 12): Promise<void> => {
  for (let i = 0; i < turns; i += 1) {
    await flush();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

interface El extends HTMLElement {
  setResponse(text: string): void;
}

const mount = (program: string): El => {
  const el = document.createElement("aktion-app") as unknown as El;
  document.body.appendChild(el);
  el.setResponse(program);
  return el;
};

/** The switch input, its live checked state, and the label rendered beside it. */
function readSwitch(el: El, id = "test"): {
  checked: boolean;
  matchesChecked: boolean;
  aria: string | null;
  owned: string | null;
  label: string;
} {
  const input = el.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`switch #${id} not rendered`);
  return {
    checked: input.checked,
    matchesChecked: input.matches(":checked"),
    aria: input.getAttribute("aria-checked"),
    owned: input.getAttribute("data-checked"),
    label: (input.closest(".rui-switch")?.textContent ?? "").trim(),
  };
}

const button = (el: El, text: string): HTMLButtonElement => {
  const found = Array.from(el.shadowRoot?.querySelectorAll("button") ?? []).find(
    (b) => (b.textContent ?? "").trim() === text,
  );
  if (!found) throw new Error(`button "${text}" not rendered`);
  return found as HTMLButtonElement;
};

/** The reported program, unchanged. */
const REPRO = `
$app(Test())

function Test() {
  const [isEnable, setIsEnable] = $state(true)
  return Column([
    Switch("test", {
      value: isEnable,
      label: isEnable ? "Enabled" : "Disabled",
      onChange: () => setIsEnable(!isEnable)
    }),
    Button("Toggle", () => setIsEnable(!isEnable))
  ])
}
`;

describe("Switch — a controlled value turning OFF from outside the control", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("starts on, with the label and the control agreeing", async () => {
    const el = mount(REPRO);
    await settle();

    expect(readSwitch(el)).toMatchObject({
      checked: true,
      matchesChecked: true,
      aria: "true",
      owned: "true",
      label: "Enabled",
    });
  });

  it("follows the bound value off when an external button flips it", async () => {
    // The reported bug. Before the fix this assertion read `checked: true` while
    // `label` already read "Disabled" — the exact disagreement in the report.
    const el = mount(REPRO);
    await settle();

    button(el, "Toggle").click();
    await settle();

    expect(readSwitch(el)).toMatchObject({
      checked: false,
      matchesChecked: false,
      aria: "false",
      owned: "false",
      label: "Disabled",
    });
  });

  it("survives repeated external flips in both directions", async () => {
    // One flip could pass by accident if the node were being replaced rather
    // than morphed; four in a row cannot.
    const el = mount(REPRO);
    await settle();

    const seen: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      button(el, "Toggle").click();
      await settle();
      seen.push(readSwitch(el).checked);
    }

    expect(seen).toEqual([false, true, false, true]);
  });

  it("still toggles from the control itself, and the label keeps up", async () => {
    const el = mount(REPRO);
    await settle();

    const input = el.shadowRoot!.querySelector<HTMLInputElement>("#test")!;
    input.click();
    await settle();

    expect(readSwitch(el)).toMatchObject({checked: false, label: "Disabled", owned: "false"});

    el.shadowRoot!.querySelector<HTMLInputElement>("#test")!.click();
    await settle();

    expect(readSwitch(el)).toMatchObject({checked: true, label: "Enabled", owned: "true"});
  });

  it("follows a $variable binding off as well as a callback value", async () => {
    // The other way a switch is controlled: bound by identity rather than
    // through `onChange`. `bindState` owns the change event there, so this
    // exercises a different half of the render.
    const el = mount(`
$on = true
$app(Column([
  Switch("test", {value: $on, label: $on ? "Enabled" : "Disabled"}),
  Button("Off", () => { $on = false })
]))
`);
    await settle();
    expect(readSwitch(el)).toMatchObject({checked: true, owned: "true"});

    button(el, "Off").click();
    await settle();

    expect(readSwitch(el)).toMatchObject({checked: false, matchesChecked: false, label: "Disabled", owned: "false"});
  });

  it("fixes Checkbox the same way — the sibling with the identical shape", async () => {
    // Not incidental scope: `apps/user-management`'s privilege checklist is a
    // CONTROLLED `Checkbox` (`value: isOn(prop)` + `onChange`), so the same
    // defect was live there — discarding a draft left every un-ticked privilege
    // visibly ticked.
    const el = mount(`
$on = true
$app(Column([Checkbox("cb", {value: $on, label: "L"}), Button("Off", () => { $on = false })]))
`);
    await settle();
    expect(readSwitch(el, "cb")).toMatchObject({checked: true, owned: "true"});

    button(el, "Off").click();
    await settle();

    expect(readSwitch(el, "cb")).toMatchObject({checked: false, matchesChecked: false, owned: "false"});
  });

  it("leaves an UNCONTROLLED checkbox alone across an unrelated re-render", async () => {
    // The same guard as for the switch: no `value`, no binding, no marker.
    const el = mount(`
$count = 0
$app(Column([Checkbox("cb", {label: "L"}), Button("Bump", () => { $count = $count + 1 }), Text(\`count \${$count}\`)]))
`);
    await settle();
    el.shadowRoot!.querySelector<HTMLInputElement>("#cb")!.click();
    await settle();
    expect(readSwitch(el, "cb")).toMatchObject({checked: true, owned: null});

    button(el, "Bump").click();
    await settle();

    expect(el.shadowRoot?.textContent).toContain("count 1");
    expect(readSwitch(el, "cb")).toMatchObject({checked: true, owned: null});
  });

  it("fixes a Radio group being CLEARED — the third component with this shape", async () => {
    // Picking a different option always worked: the browser unchecks the rest of
    // a name group natively. Clearing the group did not, because no option then
    // asserted `checked` and the old selection survived.
    const el = mount(`
$pick = "a"
$app(Column([
  Radio("grp", {items: [SelectItem("a","A"), SelectItem("b","B")], value: $pick, label: "L"}),
  Button("PickB", () => { $pick = "b" }),
  Button("Clear", () => { $pick = "" })
]))
`);
    const picked = (): boolean[] =>
      Array.from(el.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="radio"]')).map(i => i.checked);
    await settle();
    expect(picked()).toEqual([true, false]);

    button(el, "PickB").click();
    await settle();
    expect(picked()).toEqual([false, true]);

    button(el, "Clear").click();
    await settle();

    expect(picked()).toEqual([false, false]);
  });

  it("leaves an UNCONTROLLED switch alone across an unrelated re-render", async () => {
    // The regression this fix must not buy back. With no binding and no `value`
    // the switch owns its own state, emits no `data-checked`, and an unrelated
    // state change elsewhere must not un-tick it.
    const el = mount(`
$count = 0
$app(Column([
  Switch("test", {label: "Uncontrolled"}),
  Button("Bump", () => { $count = $count + 1 }),
  Text(\`count \${$count}\`)
]))
`);
    await settle();

    const input = el.shadowRoot!.querySelector<HTMLInputElement>("#test")!;
    input.click();
    await settle();
    expect(readSwitch(el)).toMatchObject({checked: true, owned: null});

    button(el, "Bump").click();
    await settle();

    expect(el.shadowRoot?.textContent).toContain("count 1");
    // Still ticked, and still not claiming ownership.
    expect(readSwitch(el)).toMatchObject({checked: true, owned: null});
  });
});
