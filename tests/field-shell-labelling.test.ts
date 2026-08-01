/**
 * A field must always be labelled, with or without an author-supplied `id`.
 *
 * `withFieldShell` used to write `for` and `aria-describedby` only when the
 * author passed an `id`. Without one it silently produced a field that set
 * `aria-invalid="true"` while having no accessible name and no reference to the
 * message explaining the error — announced as invalid, with nothing to say why.
 *
 * The no-id path now nests the control inside its `<label>`, which is an
 * implicit association requiring no ids at all. That is deliberately preferred
 * over generating an id: this helper has no per-instance identity to key one
 * off, so a generated id would differ on every render and the morph reconciler
 * would rewrite it every pass.
 */

import { describe, expect, it } from "vitest";
import { withFieldShell } from "../src/library/components/forms-shared.js";

const input = (): HTMLInputElement => {
  const el = document.createElement("input");
  el.type = "text";
  return el;
};

describe("withFieldShell labelling", () => {
  it("uses for/id association when the author supplies an id", () => {
    const control = input();
    control.setAttribute("id", "email");
    const root = withFieldShell(control, { label: "Email", id: "email" });

    const label = root.querySelector("label")!;
    expect(label.getAttribute("for")).toBe("email");
    // The control stays a sibling, which is how authors style and query it.
    expect(label.contains(control)).toBe(false);
  });

  it("nests the control in its label when there is no id", () => {
    const control = input();
    const root = withFieldShell(control, { label: "Email" });

    const label = root.querySelector("label")!;
    expect(label.getAttribute("for")).toBeNull();
    // Implicit association: the control is inside the label element.
    expect(label.contains(control)).toBe(true);
    expect(label.textContent).toContain("Email");
  });

  it("associates the error message when an id is available", () => {
    const control = input();
    control.setAttribute("id", "email");
    const root = withFieldShell(control, { label: "Email", id: "email", error: "Required" });

    const err = root.querySelector(".rui-field-error")!;
    expect(err.getAttribute("role")).toBe("alert");
    expect(control.getAttribute("aria-describedby")).toBe(err.getAttribute("id"));
    expect(control.getAttribute("aria-invalid")).toBe("true");
  });

  it("never announces invalid without also naming the field", () => {
    // The original defect: aria-invalid set, but no name and no description.
    const control = input();
    const root = withFieldShell(control, { label: "Email", error: "Required" });

    expect(control.getAttribute("aria-invalid")).toBe("true");
    const label = root.querySelector("label")!;
    // Named via the implicit label…
    expect(label.contains(control)).toBe(true);
    // …and the error is still announced by role, not only by reference.
    expect(root.querySelector(".rui-field-error")?.getAttribute("role")).toBe("alert");
  });

  it("returns the bare control when no shell props are supplied", () => {
    const control = input();
    expect(withFieldShell(control, {})).toBe(control);
  });
});

describe("withFieldShell shared props", () => {
  it("applies `name` even when no shell is rendered", () => {
    // `name` lives in FIELD_SHELL_PROPS, so every spec that spreads it declares
    // the prop — it therefore has to be read here, or it is dead on all of them
    // except Input. It must also work with no label/hint/error present, which is
    // the early-return path.
    const control = input();
    const returned = withFieldShell(control, { name: "email_field" });
    expect(returned).toBe(control);              // no shell needed
    expect(control.getAttribute("name")).toBe("email_field");
  });

  it("hides the label visually but keeps it in the a11y tree", () => {
    const control = input();
    control.setAttribute("id", "q");
    const root = withFieldShell(control, { label: "Search", id: "q", labelHidden: true });
    const lab = root.querySelector("label")!;
    // Still a real, associated label — just not visible.
    expect(lab.getAttribute("for")).toBe("q");
    expect(lab.textContent).toContain("Search");
    expect(lab.className).toContain("rui-visually-hidden");
    // Never removed from the accessibility tree.
    expect(lab.getAttribute("aria-hidden")).toBeNull();
  });

  it("merges aria-describedby instead of overwriting the control's own", () => {
    const control = input();
    control.setAttribute("id", "amount");
    control.setAttribute("aria-describedby", "amount-range");   // set by the component
    withFieldShell(control, { label: "Amount", id: "amount", error: "Too high" });
    const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/);
    expect(ids).toContain("amount-range");   // the component's own description survives
    expect(ids).toContain("amount-error");   // and the shell's message is added
  });
});
