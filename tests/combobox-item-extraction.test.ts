/**
 * Option normalisation must not lose data or render placeholder text.
 *
 * `extractComboboxItems` normalises everything the pickers accept — SelectItem
 * nodes, `{value,label}` objects, and bare strings — into one shape. Two defects:
 *
 *   - an object shaped like a real API row (`{ id, name }`) matched neither
 *     branch and fell through to `asString(entry)`, so the option label rendered
 *     as the literal text "[object Object]";
 *   - the normalised shape carried only `value` and `label`, so `disabled` and
 *     `group` — both of which `SelectItem` declares — were silently dropped, and
 *     the props did nothing on Combobox/MultiSelect even though native Select
 *     honours `group` via `<optgroup>`.
 */

import { describe, expect, it } from "vitest";
import { extractComboboxItems } from "../src/library/components/forms-shared.js";

/** A `SelectItem(value, label, disabled, group)` call as the evaluator emits it. */
const selectItem = (...args: unknown[]) => ({ __kind: "Component", name: "SelectItem", args });

describe("extractComboboxItems", () => {
  it("never produces [object Object]", () => {
    const items = extractComboboxItems([{ id: 7, name: "Alpha" }, { foo: 1 }]);
    for (const item of items) {
      expect(item.label).not.toContain("[object");
      expect(item.value).not.toContain("[object");
    }
  });

  it("reads API-shaped rows via alternate keys", () => {
    expect(extractComboboxItems([{ id: 7, name: "Alpha" }])).toEqual([
      { value: "7", label: "Alpha", disabled: undefined, group: undefined },
    ]);
  });

  it("drops an object with no recognisable key rather than rendering a junk row", () => {
    // Better to omit an unusable option than to offer a selectable "[object Object]".
    expect(extractComboboxItems([{ unrelated: true }])).toEqual([]);
  });

  it("carries disabled and group through from a SelectItem node", () => {
    expect(extractComboboxItems([selectItem("a", "Alpha", true, "Letters")])).toEqual([
      { value: "a", label: "Alpha", disabled: true, group: "Letters" },
    ]);
  });

  it("carries disabled and group through from a plain object", () => {
    expect(extractComboboxItems([{ value: "b", label: "Beta", disabled: true, group: "G" }])).toEqual([
      { value: "b", label: "Beta", disabled: true, group: "G" },
    ]);
  });

  it("still handles the simple shapes it always did", () => {
    expect(extractComboboxItems(["x", "y"])).toEqual([
      { value: "x", label: "x" },
      { value: "y", label: "y" },
    ]);
    expect(extractComboboxItems([selectItem("a", "Alpha")])).toEqual([
      { value: "a", label: "Alpha", disabled: undefined, group: undefined },
    ]);
  });
});
