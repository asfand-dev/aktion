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
 *
 * The rest of the file covers the shell's other naming and description
 * contracts, which are all order- and precedence-sensitive rather than
 * presence-sensitive: `description` above the control and ahead of the message
 * in `aria-describedby`, the optional/required asymmetry inside the label, the
 * single message slot shared by error/warning/hint, and `invalid`/`describedBy`
 * landing on the control even when no shell is rendered at all.
 */

import { afterEach, describe, expect, it } from "vitest";
import { withFieldShell } from "../src/library/components/forms-shared.js";
import { cleanup, flush, render } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
});

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

const input = (): HTMLInputElement => {
  const el = document.createElement("input");
  el.type = "text";
  return el;
};

/**
 * The shell's children in document order, by class (a bare `<input>` has none,
 * so it shows up as its tag). Several of the props below differ from one another
 * ONLY in where they render, so `querySelector` cannot tell a correct field from
 * a broken one — the order is the assertion.
 */
const shellOrder = (root: HTMLElement): string[] =>
  [...root.children].map((child) => child.getAttribute("class") ?? child.tagName.toLowerCase());

/**
 * What the accessible-name computation reads off a `<label>`: its text with every
 * `aria-hidden` subtree taken out. happy-dom implements no accname algorithm, so
 * this is the smallest honest stand-in — enough to tell decoration apart from
 * something a screen reader will actually say.
 */
const accessibleName = (label: Element): string => {
  const copy = label.cloneNode(true) as Element;
  for (const hidden of [...copy.querySelectorAll("[aria-hidden='true']")]) hidden.remove();
  return (copy.textContent ?? "").trim();
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

describe("withFieldShell description", () => {
  it("renders the description between the label and the control", () => {
    const control = input();
    control.setAttribute("id", "email");
    const root = withFieldShell(control, {
      label: "Email",
      id: "email",
      description: "We only use it to sign you in",
      error: "Required",
    });

    // Order, not presence. `description` is guidance that is true before you
    // type; `hint` and the verdicts are notes on what you typed. They are told
    // apart by nothing except which side of the control they land on, so a
    // description rendered below it is the same defect as no description at all
    // — and a `querySelector` for the class would still find it.
    expect(shellOrder(root)).toEqual([
      "rui-field-label",
      "rui-field-description",
      "input",
      "rui-field-error",
    ]);
  });

  it("describes the control by the guidance ahead of the verdict", () => {
    const control = input();
    control.setAttribute("id", "email");
    withFieldShell(control, {
      label: "Email",
      id: "email",
      description: "Your work address",
      error: "Required",
    });

    // Exact sequence, not `toContain`: assistive tech reads the accessible
    // description in `aria-describedby` order, and the order that helps is name →
    // guidance → verdict ("Email", "your work address", "required"). Reversed,
    // the user hears the complaint before the instruction it refers to.
    expect(control.getAttribute("aria-describedby")).toBe("email-description email-error");
    // The error-only case above ("associates the error message when an id is
    // available") deliberately keeps its exact single-id `toBe`, and should: it is
    // the assertion that catches a stray extra id being appended to a field that
    // asked for no description. This case is an addition to that pin, not a
    // loosening of it.
  });

  it("builds a shell for a description-only field", () => {
    const control = input();
    control.setAttribute("id", "slug");
    const root = withFieldShell(control, { id: "slug", description: "Lower case, no spaces" });

    // `description` is in the early-return guard, so guidance on its own is
    // enough to earn a wrapper — without that the text has nowhere to render and
    // is silently dropped. The inverse, a field with none of the shell props,
    // stays the bare control: that backwards-compatibility guarantee is already
    // pinned by "returns the bare control when no shell props are supplied".
    expect(root).not.toBe(control);
    expect(root.getAttribute("class")).toBe("rui-field");
    expect(root.querySelector("label")).toBeNull();
    expect(shellOrder(root)).toEqual(["rui-field-description", "input"]);
    expect(control.getAttribute("aria-describedby")).toBe("slug-description");
  });

  it("carries the description inside the implicit label when there is no id", () => {
    const control = input();
    const root = withFieldShell(control, { label: "Email", description: "Your work address" });

    const label = root.querySelector("label")!;
    const description = root.querySelector(".rui-field-description")!;
    // With no id there is no `aria-describedby` to point at the guidance, so the
    // wrapping label — the only thing naming the field — is the sole route by
    // which it reaches a screen reader. Outside the label it would be visible and
    // completely unannounced.
    expect(label.contains(description)).toBe(true);
    expect(description.getAttribute("id")).toBeNull();
    expect(control.getAttribute("aria-describedby")).toBeNull();
    // Still named, with the guidance riding along in the name.
    expect(accessibleName(label)).toContain("Email");
    expect(accessibleName(label)).toContain("Your work address");
    // And still above the control, which is the point of the prop.
    expect(description.nextElementSibling).toBe(control);
  });
});

describe("withFieldShell optional marker", () => {
  it("uses the built-in word for `true` and the author's wording for a string", () => {
    for (const [value, text] of [[true, "(optional)"], ["(facultatif)", "(facultatif)"]] as const) {
      const control = input();
      control.setAttribute("id", "nick");
      const root = withFieldShell(control, { label: "Nickname", id: "nick", optional: value });
      // The built-in word is English and a field shell cannot translate, so the
      // string form is the only way a localised app can mark a field optional.
      expect(root.querySelector(".rui-field-optional")!.textContent).toBe(text);
    }
  });

  it("renders the required star and no optional marker when both are set", () => {
    const control = input();
    control.setAttribute("id", "nick");
    const root = withFieldShell(control, {
      label: "Nickname", id: "nick", optional: true, required: true,
    });

    // A field cannot be both, and `required` is the one with a real HTML
    // attribute behind it — native validation will block the submit either way,
    // so a label saying "(optional)" would be a lie the browser then contradicts.
    expect(root.querySelector(".rui-field-required")).not.toBeNull();
    expect(root.querySelector(".rui-field-optional")).toBeNull();
    expect(control.hasAttribute("required")).toBe(true);
  });

  it("keeps the optional wording in the accessible name and the required star out of it", () => {
    // Both halves of the asymmetry are pinned in one test because the asymmetry
    // is the contract, and looks like an oversight worth "tidying" if you meet
    // either half alone: `required` is announced by the attribute of the same
    // name, which makes its star pure decoration, but HTML has no `optional`
    // attribute — the words are the only carrier of that state, so they have to
    // stay in the accessibility tree (WCAG 3.3.2).
    //
    // Run over both label branches: an id keeps the label a sibling of the
    // control, no id nests the control inside it, and the markers are appended by
    // separate code paths in each.
    for (const id of ["nick", undefined]) {
      const optionalControl = input();
      if (id) optionalControl.setAttribute("id", id);
      const optionalRoot = withFieldShell(optionalControl, { label: "Nickname", id, optional: true });
      const optionalMark = optionalRoot.querySelector(".rui-field-optional")!;
      expect(optionalMark.getAttribute("aria-hidden")).toBeNull();
      expect(accessibleName(optionalRoot.querySelector("label")!)).toBe("Nickname(optional)");

      const requiredControl = input();
      if (id) requiredControl.setAttribute("id", id);
      const requiredRoot = withFieldShell(requiredControl, { label: "Nickname", id, required: true });
      const requiredMark = requiredRoot.querySelector(".rui-field-required")!;
      expect(requiredMark.getAttribute("aria-hidden")).toBe("true");
      expect(accessibleName(requiredRoot.querySelector("label")!)).toBe("Nickname");
      // The star is still on screen — it is hidden from AT, not removed.
      expect(requiredMark.textContent).toBe("*");
    }
  });
});

describe("withFieldShell warning", () => {
  it("announces the warning politely and leaves the value valid", () => {
    const control = input();
    control.setAttribute("id", "amount");
    const root = withFieldShell(control, {
      label: "Amount", id: "amount", warning: "That is unusually large",
    });

    const warning = root.querySelector(".rui-field-warning")!;
    // `role="status"` and polite, never the error's `role="alert"`: a warning
    // appears while the user is still typing, and an assertive live region would
    // interrupt them mid-word to say something they did not ask about.
    expect(warning.getAttribute("role")).toBe("status");
    expect(warning.getAttribute("aria-live")).toBe("polite");
    expect(control.getAttribute("aria-describedby")).toBe("amount-warning");
    // The value is ACCEPTED. `aria-invalid` here would make every cautionary note
    // read as a rejection, and would block nothing while claiming to.
    expect(control.getAttribute("aria-invalid")).toBeNull();
    expect(root.getAttribute("data-warning")).toBe("true");
    expect(root.getAttribute("data-invalid")).toBeNull();
  });

  it("fills the single message slot in the order error > warning > hint", () => {
    const slot = (props: Record<string, unknown>): { messages: string[]; warned: string | null } => {
      const control = input();
      control.setAttribute("id", "amount");
      const root = withFieldShell(control, { label: "Amount", id: "amount", ...props });
      return {
        messages: [...root.querySelectorAll(".rui-field-error, .rui-field-warning, .rui-field-hint")]
          .map((node) => node.getAttribute("class")!),
        warned: root.getAttribute("data-warning"),
      };
    };

    // One slot, three tenants. Each case must yield exactly ONE node: a field
    // that is simultaneously wrong and merely unusual has nothing to gain from
    // saying both, and two live regions under one control means two
    // announcements for a single keystroke.
    expect(slot({ error: "Too high", warning: "Unusually large", hint: "In euros" }))
      .toEqual({ messages: ["rui-field-error"], warned: null });
    expect(slot({ warning: "Unusually large", hint: "In euros" }))
      .toEqual({ messages: ["rui-field-warning"], warned: "true" });
    expect(slot({ hint: "In euros" }))
      .toEqual({ messages: ["rui-field-hint"], warned: null });
    // `data-warning` is absent in the first case even though `warning` was
    // supplied: the root carries one state, and being wrong outranks being odd.
  });
});

describe("withFieldShell invalid", () => {
  it("marks the control invalid without inventing a message", () => {
    const control = input();
    control.setAttribute("id", "password");
    const root = withFieldShell(control, { label: "Password", id: "password", invalid: true });

    // `invalid` exists for a field whose explanation lives OUTSIDE it — a
    // RequirementList, a form-level summary. Before it, the only way to redden a
    // border was an `error` string, which forced a second copy of that outside
    // message into the field.
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(root.getAttribute("data-invalid")).toBe("true");
    expect(root.querySelector(".rui-field-error, .rui-field-warning, .rui-field-hint")).toBeNull();
    // Nothing is claimed to describe the control, because nothing does — a
    // dangling `aria-describedby` announces as silence, not as the reason.
    expect(control.getAttribute("aria-describedby")).toBeNull();
  });

  it("marks a bare control invalid even when there is no shell to render", () => {
    const control = input();
    // Applied BEFORE the early return, for the same reason `disabled` and `name`
    // are: it is a contract on the CONTROL. And it is deliberately absent from
    // the guard that creates the wrapper, because it has nothing of its own to
    // render — so a field with only `invalid` keeps its previous output (a bare
    // control, no root-tag flip) and merely gains the attribute.
    expect(withFieldShell(control, { invalid: true })).toBe(control);
    expect(control.getAttribute("aria-invalid")).toBe("true");
  });

  it("reads as invalid rather than merely warned when both are set", () => {
    const control = input();
    control.setAttribute("id", "amount");
    const root = withFieldShell(control, {
      label: "Amount", id: "amount", invalid: true, warning: "Unusually large",
    });

    // The warning still takes the message slot — it is the only one of the three
    // with text — but the root must not claim both states at once, or the two
    // border colours race and whichever CSS rule comes last wins.
    expect(root.querySelector(".rui-field-warning")).not.toBeNull();
    expect(root.getAttribute("data-invalid")).toBe("true");
    expect(root.getAttribute("data-warning")).toBeNull();
  });
});

describe("withFieldShell describedBy", () => {
  it("merges the author's ids with the control's own and the shell's message", () => {
    const control = input();
    control.setAttribute("id", "amount");
    // What NumberInput's stepper range and the character counters do: point at
    // their own description before the shell ever sees the control.
    control.setAttribute("aria-describedby", "amount-range");
    withFieldShell(control, {
      label: "Amount", id: "amount", describedBy: "currency-note", error: "Too high",
    });

    // All three survive, with the author's ids ahead of the shell's verdict for
    // the same reason `description` goes first — guidance, then complaint.
    // Assigning instead of merging (which is what this replaced) silently dropped
    // whichever description the author did not know about.
    expect(control.getAttribute("aria-describedby")).toBe("amount-range currency-note amount-error");
  });

  it("splits on any whitespace and drops ids already referenced", () => {
    const control = input();
    control.setAttribute("id", "amount");
    control.setAttribute("aria-describedby", "amount-range");
    withFieldShell(control, { id: "amount", describedBy: "  amount-range\n note-a  note-a note-b " });

    // The prop is documented as space-separated, so a multi-id string arriving as
    // a single token would reference one element that does not exist and describe
    // the field with nothing. A repeated id is not invalid, but it makes the same
    // sentence read out twice.
    expect(control.getAttribute("aria-describedby")).toBe("amount-range note-a note-b");
  });
});

describe("Checkbox description", () => {
  it("renders its own description once, not twice", async () => {
    const screen = render(`$app(Column([
      Checkbox("news", {
        label: "Weekly digest",
        description: "Sent every Monday at 9am",
        error: "Pick at least one"
      })
    ]))`);
    await settle();

    // REGRESSION GUARD for the one real backwards-compatibility hazard in giving
    // the field shell a `description`: Checkbox has owned a `description` prop of
    // its own — the secondary line under the label — since long before the shell
    // had one, and it spreads the rest of its props straight into the shell. Its
    // call site therefore passes `description: null` explicitly; drop that and
    // the same sentence renders twice, once as the checkbox's second line and
    // once as the shell's guidance above the control.
    const descriptions = [...screen.shadowRoot.querySelectorAll(
      ".rui-checkbox-item-description, .rui-field-description",
    )].map((node) => node.textContent);
    expect(descriptions).toEqual(["Sent every Monday at 9am"]);
    // Rendered as the checkbox's two-line treatment, not the shell's slot.
    expect(screen.shadowRoot.querySelector(".rui-field-description")).toBeNull();
    expect(screen.shadowRoot.querySelector(".rui-checkbox")!.getAttribute("data-has-description"))
      .toBe("true");
    // The shell is genuinely present (the `error` built it), so this is not
    // passing merely because nothing was wrapped.
    expect(screen.shadowRoot.querySelector(".rui-field-error")).not.toBeNull();
  });
});
