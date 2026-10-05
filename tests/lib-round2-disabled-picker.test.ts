/**
 * A disabled picker is disabled, not only announced as disabled.
 *
 * `InputGroup(MultiSelect(…), { disabled: true })` gave the MultiSelect's
 * `div role="combobox"` trigger `aria-disabled="true"` and nothing else: it
 * kept its tab stop, a click or Enter still opened the list, and its chips
 * could still be removed — assistive tech announced as disabled a control that
 * worked. A MultiSelect's own `disabled` left its chips removable as well, and
 * a disabled InputGroup left a clearable Combobox's × working.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, render, type Screen } from "../src/testing/index.js";

afterEach(() => cleanup());

async function mount(source: string): Promise<Screen> {
  const screen = render(source);
  await flush();
  return screen;
}

const $ = <T extends HTMLElement = HTMLElement>(screen: Screen, selector: string): T =>
  screen.shadowRoot.querySelector<T>(selector)!;

const GROUP = `let $tags = ["a"]
let $locked = true
$app(Column([
  Button("toggle", { onClick: () => { $locked = !$locked } }),
  InputGroup(MultiSelect("tags", { items: ["a", "b"], value: $tags }), { disabled: $locked }),
]))`;

describe("InputGroup(MultiSelect(…), { disabled: true })", () => {
  it("takes the trigger out of the tab order", async () => {
    const screen = await mount(GROUP);
    const trigger = $(screen, ".rui-multiselect-trigger");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.hasAttribute("tabindex")).toBe(false);
  });

  it("does not open on a click", async () => {
    const screen = await mount(GROUP);
    $(screen, ".rui-multiselect-trigger").click();
    await flush();
    expect($(screen, ".rui-multiselect").getAttribute("data-open")).toBe("false");
  });

  it("does not open on Enter", async () => {
    const screen = await mount(GROUP);
    $(screen, ".rui-multiselect-trigger").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect($(screen, ".rui-multiselect").getAttribute("data-open")).toBe("false");
  });

  it("does not remove a chip", async () => {
    const screen = await mount(GROUP);
    const remove = $<HTMLButtonElement>(screen, ".rui-multiselect-chip-remove");
    expect(remove.disabled).toBe(true);
    remove.click();
    await flush();
    expect(screen.state.get("tags")).toEqual(["a"]);
  });

  it("works again once the group is enabled", async () => {
    const screen = await mount(GROUP);
    await screen.click("toggle");
    const trigger = $(screen, ".rui-multiselect-trigger");
    expect(trigger.getAttribute("tabindex")).toBe("0");
    expect(trigger.hasAttribute("aria-disabled")).toBe(false);
    trigger.click();
    await flush();
    expect($(screen, ".rui-multiselect").getAttribute("data-open")).toBe("true");
    $<HTMLButtonElement>(screen, ".rui-multiselect-chip-remove").click();
    await flush();
    expect(screen.state.get("tags")).toEqual([]);
  });
});

describe("MultiSelect(…, { disabled: true })", () => {
  it("does not remove a chip either", async () => {
    const screen = await mount(`let $tags = ["a", "b"]
$app(MultiSelect("tags", { items: ["a", "b"], value: $tags, disabled: true }))`);
    const remove = $<HTMLButtonElement>(screen, ".rui-multiselect-chip-remove");
    expect(remove.disabled).toBe(true);
    remove.click();
    await flush();
    expect(screen.state.get("tags")).toEqual(["a", "b"]);
  });
});

describe("InputGroup(Combobox(…), { disabled: true })", () => {
  it("disables a clearable Combobox's clear button with its trigger", async () => {
    const screen = await mount(`let $owner = "ada"
$app(InputGroup(Combobox("owner", { items: ["ada", "grace"], value: $owner, clearable: true }), { disabled: true }))`);
    expect($<HTMLButtonElement>(screen, ".rui-combobox-trigger").disabled).toBe(true);
    const clear = $<HTMLButtonElement>(screen, ".rui-combobox-clear");
    expect(clear.disabled).toBe(true);
    clear.click();
    await flush();
    expect(screen.state.get("owner")).toBe("ada");
  });
});
