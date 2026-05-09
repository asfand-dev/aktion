/**
 * Form components: Form, FormControl, Input, TextArea, Select, SelectItem,
 * Checkbox, CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import { el, asArray, asString, asBoolean } from "../utils.js";

const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const BUTTON_SIZES = ["small", "normal", "large"] as const;
const INPUT_TYPES = ["text", "email", "password", "number", "tel", "url", "date"] as const;

export const Button: ComponentSpec = {
  name: "Button",
  description: "Clickable button. The action argument runs when clicked.",
  props: [
    { name: "label", type: "string" },
    { name: "action", type: "Action", optional: true, description: "Action() payload to execute" },
    { name: "variant", type: "string", optional: true, enum: BUTTON_VARIANTS },
    { name: "type", type: "string", optional: true, enum: ["button", "submit"], description: "HTML button type" },
    { name: "size", type: "string", optional: true, enum: BUTTON_SIZES },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const button = el("button", {
      class: "rui-button",
      type: asString(props.type, "button"),
      "data-variant": asString(props.variant, "primary"),
      "data-size": asString(props.size, "normal"),
      disabled: asBoolean(props.disabled) ? "" : null,
    }, [asString(props.label)]);
    button.addEventListener("click", () => {
      if (isActionPayload(props.action)) helpers.runAction(props.action);
    });
    return button;
  },
};

export const Buttons: ComponentSpec = {
  name: "Buttons",
  description: "Group of buttons laid out horizontally or vertically.",
  props: [
    { name: "items", type: "Button[]" },
    { name: "direction", type: "string", optional: true, enum: ["row", "column"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-buttons",
      "data-direction": asString(props.direction, "row"),
    });
    for (const child of asArray(props.items)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Input: ComponentSpec = {
  name: "Input",
  description: "Text input field. Pass a $variable as `value` for two-way binding.",
  props: [
    { name: "id", type: "string", description: "Input identifier" },
    { name: "placeholder", type: "string", optional: true },
    { name: "type", type: "string", optional: true, enum: INPUT_TYPES },
    { name: "validations", type: "any", optional: true, description: "Array or object of validation hints" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
  ],
  render: (node, props, helpers) => {
    const input = el("input", {
      class: "rui-input",
      id: asString(props.id),
      name: asString(props.id),
      type: asString(props.type, "text"),
      placeholder: asString(props.placeholder),
      value: asString(props.value),
    });
    bindToStateAtArg(input, node, 4, helpers);
    applyValidations(input, props.validations);
    return input;
  },
};

export const TextArea: ComponentSpec = {
  name: "TextArea",
  description: "Multi-line text input.",
  props: [
    { name: "id", type: "string" },
    { name: "placeholder", type: "string", optional: true },
    { name: "rows", type: "number", optional: true },
    { name: "value", type: "any", optional: true },
  ],
  render: (node, props, helpers) => {
    const textarea = el("textarea", {
      class: "rui-textarea",
      id: asString(props.id),
      name: asString(props.id),
      placeholder: asString(props.placeholder),
      rows: String(Number(props.rows ?? 4) || 4),
    });
    textarea.value = asString(props.value);
    bindToStateAtArg(textarea, node, 3, helpers);
    return textarea;
  },
};

export const SelectItem: ComponentSpec = {
  name: "SelectItem",
  description: "Single option for a Select component.",
  props: [
    { name: "value", type: "string" },
    { name: "label", type: "string" },
  ],
  render: (_node, props) => {
    return el("option", { value: asString(props.value) }, [asString(props.label)]);
  },
};

export const Select: ComponentSpec = {
  name: "Select",
  description: "Dropdown select. Pass a $variable as `value` for two-way binding.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]" },
    { name: "label", type: "string", optional: true },
    { name: "placeholder", type: "string", optional: true },
    { name: "value", type: "any", optional: true },
  ],
  render: (node, props, helpers) => {
    const select = el("select", {
      class: "rui-select",
      id: asString(props.id),
      name: asString(props.id),
    });
    const placeholder = asString(props.placeholder);
    if (placeholder) {
      select.append(el("option", { value: "", disabled: "", selected: "" }, [placeholder]));
    }
    for (const item of asArray(props.items)) {
      select.append(helpers.renderNode(item));
    }
    select.value = asString(props.value);
    bindToStateAtArg(select, node, 4, helpers);
    return select;
  },
};

export const Checkbox: ComponentSpec = {
  name: "Checkbox",
  description: "Boolean checkbox.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string" },
    { name: "value", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const wrapper = el("label", { class: "rui-checkbox" });
    const input = el("input", {
      type: "checkbox",
      id: asString(props.id),
      name: asString(props.id),
      checked: asBoolean(props.value) ? "" : null,
    });
    bindToStateAtArg(input, node, 2, helpers);
    wrapper.append(input, el("span", { class: "rui-checkbox-label" }, [asString(props.label)]));
    return wrapper;
  },
};

export const CheckBoxItem: ComponentSpec = {
  name: "CheckBoxItem",
  description: "Single option inside a CheckBoxGroup.",
  props: [
    { name: "label", type: "string" },
    { name: "name", type: "string", description: "Key inside the group's value object" },
    { name: "description", type: "string", optional: true },
    { name: "defaultChecked", type: "boolean", optional: true },
  ],
  render: (_node, props) => {
    return el("label", {
      class: "rui-checkbox-item",
      "data-name": asString(props.name),
    }, [asString(props.label)]);
  },
};

export const CheckBoxGroup: ComponentSpec = {
  name: "CheckBoxGroup",
  description: "Group of checkboxes. Value is an object keyed by item name. Pass a `$variable` for two-way binding.",
  props: [
    { name: "name", type: "string", description: "Group identifier" },
    { name: "items", type: "CheckBoxItem[]" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
  ],
  render: (node, props, helpers) => {
    const groupName = asString(props.name);
    const root = el("div", { class: "rui-checkbox-group", role: "group", "data-name": groupName });
    const items = asArray<{ args?: unknown[] }>(props.items);
    const valueObject = (props.value && typeof props.value === "object")
      ? (props.value as Record<string, unknown>)
      : {};
    const inputs: HTMLInputElement[] = [];

    items.forEach((item, idx) => {
      const label = asString(item.args?.[0]);
      const itemName = asString(item.args?.[1], `${groupName}-${idx}`);
      const description = asString(item.args?.[2]);
      const defaultChecked = asBoolean(item.args?.[3]);
      const id = `${groupName}-${itemName}`;
      const wrapper = el("label", { class: "rui-checkbox-item", for: id });
      const isChecked = itemName in valueObject
        ? Boolean(valueObject[itemName])
        : defaultChecked;
      const input = el("input", {
        type: "checkbox",
        id,
        name: itemName,
        checked: isChecked ? "" : null,
      }) as HTMLInputElement;
      inputs.push(input);
      const text = el("div", { class: "rui-checkbox-item-text" });
      text.append(el("div", { class: "rui-checkbox-item-label" }, [label]));
      if (description) text.append(el("div", { class: "rui-checkbox-item-description" }, [description]));
      wrapper.append(input, text);
      root.append(wrapper);
    });

    const stateName = node.argMeta?.[2]?.stateRef;
    if (stateName) {
      helpers.bindState(root, stateName, {
        event: "change",
        getValue: () => {
          const out: Record<string, boolean> = {};
          for (const input of inputs) out[input.name] = input.checked;
          return out;
        },
      });
    }

    return root;
  },
};

export const Radio: ComponentSpec = {
  name: "Radio",
  description: "Radio button group.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]" },
    { name: "value", type: "any", optional: true },
  ],
  render: (node, props, helpers) => {
    const groupName = asString(props.id);
    const root = el("div", { class: "rui-radio-group", role: "radiogroup" });
    for (const item of asArray<{ args?: unknown[] }>(props.items)) {
      const value = asString(item.args?.[0]);
      const label = asString(item.args?.[1], value);
      const id = `${groupName}-${value}`;
      const itemRoot = el("label", { class: "rui-radio", for: id });
      const input = el("input", {
        type: "radio",
        id,
        name: groupName,
        value,
        checked: asString(props.value) === value ? "" : null,
      });
      bindToStateAtArg(input, node, 2, helpers);
      itemRoot.append(input, el("span", { class: "rui-radio-label" }, [label]));
      root.append(itemRoot);
    }
    return root;
  },
};

export const FormControl: ComponentSpec = {
  name: "FormControl",
  description: "Labeled wrapper around a single form field.",
  props: [
    { name: "label", type: "string" },
    { name: "field", type: "Node" },
    { name: "hint", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-form-control" });
    root.append(el("label", { class: "rui-form-label" }, [asString(props.label)]));
    const fieldEl = helpers.renderNode(props.field);
    root.append(fieldEl);
    const hint = asString(props.hint);
    if (hint) root.append(el("p", { class: "rui-form-hint" }, [hint]));
    return root;
  },
};

export const Form: ComponentSpec = {
  name: "Form",
  description: "Form container. Children FormControls render in order; buttons render at the bottom.",
  props: [
    { name: "id", type: "string" },
    { name: "buttons", type: "Buttons | Button" },
    { name: "fields", type: "FormControl[]" },
  ],
  render: (_node, props, helpers) => {
    const form = el("form", { class: "rui-form", id: asString(props.id) });
    form.addEventListener("submit", (event) => event.preventDefault());
    for (const field of asArray(props.fields)) form.append(helpers.renderNode(field));
    if (props.buttons) {
      const actions = el("div", { class: "rui-form-actions" });
      actions.append(helpers.renderNode(props.buttons));
      form.append(actions);
    }
    return form;
  },
};

function bindToStateAtArg(
  element: HTMLElement,
  node: { argMeta?: { stateRef?: string }[] },
  argIndex: number,
  helpers: {
    bindState: (
      el: HTMLElement,
      name: string,
      opts?: { event?: string; getValue?: (el: HTMLElement) => unknown },
    ) => void;
  },
): void {
  const stateName = node.argMeta?.[argIndex]?.stateRef;
  if (!stateName) return;
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    helpers.bindState(element, stateName, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).checked,
    });
    return;
  }
  helpers.bindState(element, stateName);
}

function applyValidations(input: HTMLInputElement, validations: unknown): void {
  if (!validations) return;
  const list = Array.isArray(validations)
    ? validations.map((v) => String(v))
    : typeof validations === "object"
      ? Object.entries(validations as Record<string, unknown>).map(([k, v]) => (v ? `${k}:${v}` : k))
      : [];
  for (const v of list) {
    if (v === "required") input.required = true;
    else if (v.startsWith("minLength:")) input.minLength = Number(v.slice("minLength:".length)) || 0;
    else if (v.startsWith("maxLength:")) input.maxLength = Number(v.slice("maxLength:".length)) || 0;
    else if (v === "email") input.type = "email";
  }
}
