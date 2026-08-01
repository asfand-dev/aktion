/**
 * Shared form helpers used by forms.ts and new-components.ts.
 */

import { asArray, asString, asBoolean, el } from "../utils.js";


/**
 * Wrap a bare input element in a field shell with a label, required marker,
 * hint, and error message — but ONLY when one of those props is supplied
 * (suggestions-global V.4). When none are present, the input is returned
 * unchanged so existing call sites keep identical output (backwards
 * compatible). Also wires `required` + `aria-invalid` / `aria-describedby`
 * on the control for accessibility.
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
  const required = asBoolean(props.required);

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
  if (!label && !hint && !error && !required) return control;

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

  const root = el("div", { class: "rui-field", "data-invalid": error ? "true" : null });
  const requiredMark = (): HTMLElement =>
    el("span", { class: "rui-field-required", "aria-hidden": "true" }, ["*"]);

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
    root.append(lab);
  }

  const describedBy: string[] = [];
  const message = error
    ? el("div", { class: "rui-field-error", id: id ? `${id}-error` : null, role: "alert" }, [error])
    : hint
      ? el("div", { class: "rui-field-hint", id: id ? `${id}-hint` : null }, [hint])
      : null;
  if (message && id) describedBy.push(message.getAttribute("id")!);
  if (describedBy.length) {
    // MERGE, do not overwrite. Several controls already point `aria-describedby`
    // at their own description (a character counter, a format hint, a stepper's
    // range), and assigning here dropped it — leaving the field described only by
    // the shell's message, or by nothing when there was no message.
    const existing = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    const merged = [...new Set([...existing, ...describedBy])];
    control.setAttribute("aria-describedby", merged.join(" "));
  }

  if (implicitLabel) {
    // `<label>Name <input></label>` — the control is named by its wrapper with
    // no id on either side.
    const lab = el("label", { class: `${labelClass}`.trim(), "data-implicit": "true" }, [label]);
    if (required) lab.append(requiredMark());
    lab.append(control);
    root.append(lab);
  } else {
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

/** Props every field-shell-capable input accepts (for spec declarations). */
export const FIELD_SHELL_PROPS = [
  { name: "disabled", type: "boolean", optional: true, description: "Disable the control (non-editable, skipped by tab order)" },
  { name: "label", type: "string", optional: true, description: "Field label rendered above the control" },
  { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
  { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
  { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*` and the `required` attribute)" },
  { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Called with the current value when focus leaves the control (validate-on-blur, `form.touch`)" },
  { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Called when the control gains focus" },
  { name: "name", type: "string", optional: true, description: "Form field name submitted to the server (defaults to `id`)" },
  { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context" },
] as const;

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
