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
  const label = asString(props.label);
  const hint = asString(props.hint);
  const error = asString(props.error);
  const required = asBoolean(props.required);
  if (!label && !hint && !error && !required) return control;

  const id = asString(props[options.idKey ?? "id"]) || asString(control.getAttribute("id"));
  if (required) control.setAttribute("required", "");
  if (error) control.setAttribute("aria-invalid", "true");

  const root = el("div", { class: "rui-field", "data-invalid": error ? "true" : null });
  if (label) {
    const lab = el("label", { class: "rui-field-label", for: id || null }, [label]);
    if (required) lab.append(el("span", { class: "rui-field-required", "aria-hidden": "true" }, ["*"]));
    root.append(lab);
  }
  root.append(control);
  if (error) {
    const errId = id ? `${id}-error` : null;
    const errEl = el("div", { class: "rui-field-error", id: errId, role: "alert" }, [error]);
    if (errId) control.setAttribute("aria-describedby", errId);
    root.append(errEl);
  } else if (hint) {
    const hintId = id ? `${id}-hint` : null;
    const hintEl = el("div", { class: "rui-field-hint", id: hintId }, [hint]);
    if (hintId) control.setAttribute("aria-describedby", hintId);
    root.append(hintEl);
  }
  return root;
}

/** Props every field-shell-capable input accepts (for spec declarations). */
export const FIELD_SHELL_PROPS = [
  { name: "label", type: "string", optional: true, description: "Field label rendered above the control" },
  { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
  { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
  { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*` and the `required` attribute)" },
  { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Called with the current value when focus leaves the control (validate-on-blur, `form.touch`)" },
  { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Called when the control gains focus" },
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
  if (props.onBlur != null) {
    control.onblur = (event: FocusEvent) => {
      const live = (event.currentTarget ?? event.target) as HTMLElement;
      helpers.invoke(props.onBlur, getValue(live));
    };
  }
  if (props.onFocus != null) {
    control.onfocus = (event: FocusEvent) => {
      const live = (event.currentTarget ?? event.target) as HTMLElement;
      helpers.invoke(props.onFocus, getValue(live));
    };
  }
}

export function extractComboboxItems(raw: unknown): Array<{ value: string; label: string }> {
  const items = asArray<unknown>(raw);
  return items
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const node = entry as { __kind?: string; args?: unknown[]; value?: unknown; label?: unknown };
        if (node.__kind === "Component" && Array.isArray(node.args)) {
          const value = asString(node.args[0]);
          return { value, label: asString(node.args[1], value) };
        }
        if (node.value !== undefined || node.label !== undefined) {
          const value = asString(node.value);
          return { value, label: asString(node.label, value) };
        }
      }
      const value = asString(entry);
      return { value, label: value };
    })
    .filter((item) => item.value !== "" || item.label !== "");
}
