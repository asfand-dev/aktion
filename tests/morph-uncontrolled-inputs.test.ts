/**
 * Regression: the morph reconciler must not wipe user input.
 *
 * `syncInput` used to resolve a desired value of `""` for any control whose
 * render did not assert one, and then apply it. Because a re-render is triggered
 * by *any* state change anywhere in the app, an uncontrolled field cleared
 * itself constantly — typing into an `onChange`-only Input blanked the box on
 * every keystroke, a ticked uncontrolled Checkbox un-ticked itself, and a chosen
 * file vanished from a FileUpload.
 *
 * The contract these tests pin down:
 *
 *   - an ABSENT `value` attribute means "this render asserts nothing" → the live
 *     DOM value is preserved;
 *   - a PRESENT `value` attribute (including `value=""`) is a deliberate
 *     assertion → it is applied, even while the field has focus, so
 *     clear-after-submit still works;
 *   - `type="file"` is never synced at all, because the only assignment the
 *     platform permits (`value = ""`) empties the FileList.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { morphNode } from "../src/renderer/morph.js";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Build a detached `<input>` the way a component render would. */
function input(attrs: Record<string, string>): HTMLInputElement {
  const el = document.createElement("input");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function mount(el: HTMLElement): HTMLElement {
  const host = document.createElement("div");
  host.appendChild(el);
  document.body.appendChild(host);
  return host;
}

describe("morph does not wipe uncontrolled form state", () => {
  it("preserves typed text when the re-render asserts no value", () => {
    const live = input({ type: "text" });
    mount(live);
    live.value = "user typed this";

    // A fresh render of the same uncontrolled Input: no `value` attribute.
    morphNode(live, input({ type: "text" }));

    expect(live.value).toBe("user typed this");
  });

  it("still applies a deliberate programmatic clear (value=\"\")", () => {
    const live = input({ type: "text", value: "seed" });
    mount(live);
    live.value = "user typed this";

    morphNode(live, input({ type: "text", value: "" }));

    // An explicit empty `value` attribute is a controlled clear and must win.
    expect(live.value).toBe("");
  });

  it("still applies a controlled value change", () => {
    const live = input({ type: "text", value: "before" });
    mount(live);

    morphNode(live, input({ type: "text", value: "after" }));

    expect(live.value).toBe("after");
  });

  it("preserves a user's tick on an uncontrolled checkbox", () => {
    const live = input({ type: "checkbox" });
    mount(live);
    live.checked = true;

    morphNode(live, input({ type: "checkbox" }));

    expect(live.checked).toBe(true);
  });

  it("still applies a controlled checked state", () => {
    const live = input({ type: "checkbox" });
    mount(live);

    morphNode(live, input({ type: "checkbox", checked: "" }));

    expect(live.checked).toBe(true);
  });

  it("never assigns to a file input", () => {
    const live = input({ type: "file" });
    mount(live);
    let assigned = 0;
    // A real FileList cannot be constructed here, so observe the sink instead:
    // any write at all is the defect, because "" is the only legal write and it
    // clears the selection.
    Object.defineProperty(live, "value", {
      get: () => "C:\\fakepath\\report.pdf",
      set: () => { assigned += 1; },
      configurable: true,
    });

    morphNode(live, input({ type: "file" }));

    expect(assigned).toBe(0);
  });
});
