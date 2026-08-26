/**
 * Shared form helpers used by forms.ts and new-components.ts.
 */

import { asArray, asString, asBoolean, el } from "../utils.js";


/**
 * Wrap a bare input element in a field shell with a label, an optional/required
 * marker, guidance above the control, and a message below it — but ONLY when one
 * of those props is supplied (suggestions-global V.4). When none are present, the
 * input is returned unchanged so existing call sites keep identical output
 * (backwards compatible). Also wires `required` + `aria-invalid` /
 * `aria-describedby` on the control for accessibility.
 *
 * The vertical order is label → description → control → message, which is the
 * order a reader needs it in: what the field is, what to put in it, the field,
 * then what went wrong. `description` is guidance that is true whatever the value
 * is; `hint` is a note about the value; `warning` and `error` are verdicts on it.
 *
 * Only ONE message renders, in the order error > warning > hint: they occupy the
 * same slot, and a field that is simultaneously wrong and merely unusual has
 * nothing to gain from saying both. All of them join `aria-describedby`
 * (description first), so the control is described by everything it shows.
 */
export function withFieldShell(
  control: HTMLElement,
  props: Record<string, unknown>,
  options: { idKey?: string } = {},
): HTMLElement {
  // `disabled` and `name` are applied before the early return below, because a
  // field with no label/hint/error still has to honour them — otherwise a bare
  // `Input({ disabled })` would silently stay editable.
  if (asBoolean(props.disabled)) control.setAttribute("disabled", "");
  // Every spec that spreads FIELD_SHELL_PROPS now declares `name`, so it has to
  // be read in one shared place; only Input handled it individually, which left
  // it declared-but-dead on TextArea, Select, NumberInput and the rest. The
  // controls default `name` to `id`, so this only overrides when supplied.
  const fieldName = asString(props.name);
  if (fieldName) control.setAttribute("name", fieldName);

  const label = asString(props.label);
  const hint = asString(props.hint);
  const error = asString(props.error);
  const warning = asString(props.warning);
  const description = asString(props.description);
  const required = asBoolean(props.required);
  // `optional` is `true` for the built-in word or a string to say it another way
  // — the built-in is English, and a field shell cannot translate. Anything else
  // (false, absent) renders no marker. `required` wins: a field cannot be both,
  // and the attribute-backed state is the one assistive tech already announces.
  const optionalText = required
    ? ""
    : props.optional === true
      ? "(optional)"
      : asString(props.optional);

  // `aria-invalid` and an author-supplied `aria-describedby` are applied BEFORE
  // the early return below, for the same reason `disabled` is: they are contracts
  // on the CONTROL, and a field that renders no shell still has to honour them.
  // `invalid` exists so a field can read as invalid while something OUTSIDE the
  // shell — a requirement list, a form-level summary — owns the explanation;
  // without it the only way to redden a border was an `error` string, which
  // forced a duplicate message.
  const invalid = asBoolean(props.invalid) || Boolean(error);
  if (invalid) control.setAttribute("aria-invalid", "true");
  const authorDescribedBy = asString(props.describedBy)
    .split(/\s+/)
    .filter(Boolean);
  if (authorDescribedBy.length > 0) mergeDescribedBy(control, authorDescribedBy);

  // KNOWN DEFECT, deliberately not fixed here (audit D0337).
  //
  // Because the shell only exists when one of these props is present, the
  // component's ROOT TAG changes the moment an error appears: `<input>` becomes
  // `<div class="rui-field">`. The morph reconciler replaces a node whose tagName
  // differs, so the live control is destroyed and rebuilt — on the documented
  // validate-on-change pattern (`Input(id, { value: $v, error: $e })`) that happens
  // as the user types, aborting IME composition mid-word and losing the selection.
  //
  // The clean fix is to always render the wrapper so the tag is stable. That was
  // implemented and reverted: it is a BREAKING output change. 23 existing tests
  // assert that a bare control is its own root (`.rui-slider`, `.rui-date-picker`,
  // `.rui-rich-text`, `.rui-pin-input`, …), and any consumer CSS or query selecting
  // a component root would break the same way. It needs a coordinated major
  // version, not a silent change here.
  // Every prop named here creates the shell, so adding one to this list means a
  // field that previously rendered as a bare control now renders as a wrapper —
  // the root-tag flip described above. All of `description` / `warning` /
  // `optional` / `invalid` are NEW props, so no existing call site can be moved
  // across this line by their arrival. `invalid` and `describedBy` are deliberately
  // ABSENT: both are already applied to the control above, and neither has
  // anything of its own to render, so neither needs a wrapper to live in.
  if (!label && !hint && !error && !required && !description && !warning && !optionalText) return control;

  // Omitting `id` used to drop BOTH the label's `for` and the message's
  // `aria-describedby`, while still setting `aria-invalid` — so the field
  // announced itself as invalid with no accessible name and no way to reach the
  // message saying why.
  //
  // The label is fixed WITHOUT needing an id: wrapping the control inside the
  // `<label>` is an implicit association, which HTML has always supported. That
  // is deliberately preferred over generating an id, because a generated id
  // would have to change on every render (there is no per-instance identity
  // available in this helper), and the morph reconciler compares attributes
  // between renders — a value that changes every pass is pure churn.
  const id = asString(props[options.idKey ?? "id"]) || asString(control.getAttribute("id"));
  if (required) control.setAttribute("required", "");
  if (error) control.setAttribute("aria-invalid", "true");

  const root = el("div", {
    class: "rui-field",
    "data-invalid": invalid ? "true" : null,
    "data-warning": !invalid && warning ? "true" : null,
  });
  const requiredMark = (): HTMLElement =>
    el("span", { class: "rui-field-required", "aria-hidden": "true" }, ["*"]);
  // NOT `aria-hidden`, unlike the required star. `required` is announced by the
  // attribute of the same name, so its star is decoration; HTML has no `optional`
  // attribute, which makes this text the only thing that carries the state — and
  // WCAG 3.3.2 wants it carried.
  const optionalMark = (): HTMLElement =>
    el("span", { class: "rui-field-optional" }, [optionalText]);

  // `labelHidden` hides the label VISUALLY while keeping it in the accessibility
  // tree — the correct treatment for a field whose purpose is obvious from
  // context (a search box next to a magnifier). It must never become
  // `display: none` or `aria-hidden`, either of which would take the name away
  // from the very users who need it.
  const labelHidden = asBoolean(props.labelHidden);
  const labelClass = labelHidden
    ? "rui-field-label rui-visually-hidden"
    : "rui-field-label";

  // With an id, keep the label a sibling (authors style and query it that way).
  // Without one, nest the control so the association still holds.
  const implicitLabel = !!label && !id;
  if (label && !implicitLabel) {
    const lab = el("label", { class: labelClass, for: id }, [label]);
    if (required) lab.append(requiredMark());
    else if (optionalText) lab.append(optionalMark());
    root.append(lab);
  }

  const describedBy: string[] = [];
  // Guidance is described BEFORE the verdict, because that is the order it is
  // useful in: "what to type here" then "what is wrong with what you typed".
  const descriptionNode = description
    ? el("p", { class: "rui-field-description", id: id ? `${id}-description` : null }, [description])
    : null;
  if (descriptionNode && id) describedBy.push(descriptionNode.getAttribute("id")!);

  // One slot, three tenants, error first. `role="alert"` interrupts, which is
  // right for a rejection and wrong for everything else — a warning is a
  // "you probably didn't mean this" that must not talk over the user's typing, so
  // it announces politely and does NOT set `aria-invalid` (the value is accepted).
  const message = error
    ? el("div", { class: "rui-field-error", id: id ? `${id}-error` : null, role: "alert" }, [error])
    : warning
      ? el("div", { class: "rui-field-warning", id: id ? `${id}-warning` : null, role: "status", "aria-live": "polite" }, [warning])
      : hint
        ? el("div", { class: "rui-field-hint", id: id ? `${id}-hint` : null }, [hint])
        : null;
  if (message && id) describedBy.push(message.getAttribute("id")!);
  if (describedBy.length) mergeDescribedBy(control, describedBy);

  if (implicitLabel) {
    // `<label>Name <input></label>` — the control is named by its wrapper with
    // no id on either side.
    const lab = el("label", { class: `${labelClass}`.trim(), "data-implicit": "true" }, [label]);
    if (required) lab.append(requiredMark());
    else if (optionalText) lab.append(optionalMark());
    // Inside the label, not before the control: with no id there is no
    // `aria-describedby` to point at it, and the implicit label is the only thing
    // naming the field — so the guidance has to ride along in that name or be
    // unreachable. It still renders above the control, which is where it belongs.
    if (descriptionNode) lab.append(descriptionNode);
    lab.append(control);
    root.append(lab);
  } else {
    if (descriptionNode) root.append(descriptionNode);
    root.append(control);
  }

  // Without an id there is no `aria-describedby` to give, so the message has to
  // be reachable some other way: `role="alert"` already announces an error, and
  // for a hint we fall back to appending it to the accessible description via
  // `aria-label` only when nothing else names the field.
  if (message) {
    if (!id && hint && !error && !label) control.setAttribute("aria-label", hint);
    root.append(message);
  }
  return root;
}

/**
 * Add ids to a control's `aria-describedby` without dropping what is there.
 *
 * MERGE, do not overwrite. Several controls already point `aria-describedby` at
 * their own description (a character counter, a format hint, a stepper's range),
 * and assigning dropped it — leaving the field described only by the shell's
 * message, or by nothing when there was no message.
 */
function mergeDescribedBy(control: HTMLElement, ids: readonly string[]): void {
  const existing = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const merged = [...new Set([...existing, ...ids])];
  control.setAttribute("aria-describedby", merged.join(" "));
}

/** Props every field-shell-capable input accepts (for spec declarations). */
export const FIELD_SHELL_PROPS = [
  { name: "disabled", type: "boolean", optional: true, description: "Disable the control (non-editable, skipped by tab order)" },
  { name: "label", type: "string", optional: true, description: "Field label rendered above the control" },
  { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
  { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid). Takes the message slot ahead of `warning` and `hint`" },
  { name: "warning", type: "string", optional: true, description: "Cautionary note below the control for a value that is accepted but probably not what was meant. Announced politely and does NOT mark the field invalid; takes the message slot ahead of `hint`" },
  { name: "description", type: "string", optional: true, description: "Guidance rendered BETWEEN the label and the control — what to put in the field, as opposed to `hint`, which is a note about the value below it" },
  { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*` and the `required` attribute)" },
  { name: "optional", type: "boolean | string", optional: true, description: "Mark the field optional in its label: `true` for \"(optional)\", or a string to word it another way (e.g. a translation). Ignored when `required` is set" },
  { name: "invalid", type: "boolean", optional: true, aliases: ["ariaInvalid"], description: "Mark the control invalid without supplying a message — for a field whose explanation lives outside it, e.g. in a `RequirementList` or a form-level summary" },
  { name: "describedBy", type: "string", optional: true, aliases: ["ariaDescribedBy"], description: "Space-separated ids of elements that describe this control, merged into its `aria-describedby` alongside the shell's own message" },
  { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Called with the current value when focus leaves the control (validate-on-blur, `form.touch`)" },
  { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Called when the control gains focus" },
  { name: "name", type: "string", optional: true, description: "Form field name submitted to the server (defaults to `id`)" },
  { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context" },
] as const;

/**
 * The field-shell props that arrived after the original nine, for the dozen specs
 * that hand-declare their prop list instead of spreading {@link FIELD_SHELL_PROPS}
 * (they do it to give a prop a control-specific description).
 *
 * Derived from `FIELD_SHELL_PROPS` by name rather than restated, so a spec that
 * spreads this can never drift from one that spreads the whole list. `exclude` is
 * for a control that already owns a prop of the same name and means something
 * else by it — `Checkbox.description` is a secondary line under its label, and
 * declaring the shell's as well would be a duplicate name.
 */
const SHELL_LATER_PROP_NAMES: readonly string[] = [
  "description", "warning", "optional", "invalid", "describedBy",
];

export function fieldShellExtraProps(exclude: readonly string[] = []) {
  return FIELD_SHELL_PROPS.filter(
    (prop) => SHELL_LATER_PROP_NAMES.includes(prop.name) && !exclude.includes(prop.name),
  );
}

interface FocusHelpers { invoke: (handler: unknown, ...args: unknown[]) => void }

/**
 * Wire `onBlur`/`onFocus` props as DOM property handlers (morph contract —
 * fresh closures survive node reuse). `onBlur` receives the control's current
 * value so `form.touch(name)` / validate-on-blur flows work (V.1).
 */
export function attachFocusHandlers(
  control: HTMLElement,
  props: Record<string, unknown>,
  helpers: FocusHelpers,
  getValue: (node: HTMLElement) => unknown = (node) => (node as HTMLInputElement).value,
): void {
  // Chain rather than assign. A plain `control.onblur = …` silently replaced any
  // handler the component had already set for its own behaviour — several controls
  // commit or validate on blur — so whichever ran last won and the other was lost.
  // The existing handler runs first so component behaviour is not reordered by
  // the presence of an author callback.
  const chain = (
    key: "onblur" | "onfocus",
    handler: (event: FocusEvent) => void,
  ): void => {
    const existing = (control as unknown as Record<string, unknown>)[key];
    (control as unknown as Record<string, unknown>)[key] = (event: FocusEvent) => {
      if (typeof existing === "function") (existing as (e: FocusEvent) => void).call(control, event);
      handler(event);
    };
  };

  if (props.onBlur != null) {
    chain("onblur", (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLElement;
      helpers.invoke(props.onBlur, getValue(live));
    });
  }
  if (props.onFocus != null) {
    chain("onfocus", (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLElement;
      helpers.invoke(props.onFocus, getValue(live));
    });
  }
}

export interface ComboboxItem {
  value: string;
  label: string;
  /** Option is listed but not selectable. */
  disabled?: boolean;
  /** Optional heading this option is bucketed under. */
  group?: string;
}

/**
 * Keys an object option may carry instead of `value`/`label`.
 *
 * Without this, an object shaped like a real API row (`{ id, name }`) matched
 * neither branch and fell through to `asString(entry)`, rendering the literal
 * text "[object Object]" as the option label.
 */
const VALUE_KEYS = ["value", "id", "key", "code"] as const;
const LABEL_KEYS = ["label", "name", "title", "text", "description"] as const;

export function extractComboboxItems(raw: unknown): ComboboxItem[] {
  const items = asArray<unknown>(raw);
  return items
    .map((entry): ComboboxItem | null => {
      if (entry && typeof entry === "object") {
        const node = entry as Record<string, unknown> & { __kind?: string; args?: unknown[] };
        // `SelectItem(value, label, disabled, group)` — carry all four through, not
        // just the first two. SelectItem declares `disabled` and `group`, so
        // dropping them here made both silently inert on Combobox/MultiSelect.
        if (node.__kind === "Component" && Array.isArray(node.args)) {
          const value = asString(node.args[0]);
          return {
            value,
            label: asString(node.args[1], value),
            disabled: asBoolean(node.args[2]) || undefined,
            group: asString(node.args[3]) || undefined,
          };
        }
        const vKey = VALUE_KEYS.find((k) => node[k] !== undefined);
        const lKey = LABEL_KEYS.find((k) => node[k] !== undefined);
        if (vKey || lKey) {
          const value = asString(vKey ? node[vKey] : node[lKey!]);
          return {
            value,
            label: asString(lKey ? node[lKey] : undefined, value),
            disabled: asBoolean(node.disabled) || undefined,
            group: asString(node.group) || undefined,
          };
        }
        // An object with no recognisable key is not a usable option. Dropping it
        // is better than rendering "[object Object]" as a selectable row.
        return null;
      }
      const value = asString(entry);
      return { value, label: value };
    })
    .filter((item): item is ComboboxItem => item !== null && (item.value !== "" || item.label !== ""));
}
