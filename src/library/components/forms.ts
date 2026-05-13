/**
 * Form components: Form, FormControl, Input, TextArea, Select, SelectItem,
 * Checkbox, CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, SearchBar,
 * Slider, NumberInput, DatePicker, FileUpload, Combobox.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import { el, asArray, asString, asBoolean, asNumber, renderIcon } from "../utils.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";

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
    button.onclick = () => {
      if (isActionPayload(props.action)) helpers.runAction(props.action);
    };
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
        // Read from the *live* DOM rooted at the event target, never from
        // the closure's `inputs` array. After a morph re-render those
        // captured input elements are detached and report stale `checked`.
        getValue: (rootEl) => {
          const out: Record<string, boolean> = {};
          rootEl
            .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
            .forEach((input) => {
              out[input.name] = input.checked;
            });
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

export const SearchBar: ComponentSpec = {
  name: "SearchBar",
  description:
    "Pre-styled search input with a leading magnifying-glass icon, optional " +
    "trailing submit button, and optional keyboard-shortcut hint. Pass a " +
    "`$variable` as `value` for two-way binding. Use anywhere a user " +
    "needs to filter content — toolbars, command bars, lists, headers.",
  props: [
    { name: "id", type: "string" },
    { name: "placeholder", type: "string", optional: true },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "shortcut", type: "string", optional: true, description: "Keyboard hint chip on the right (e.g. \"/\")" },
    { name: "action", type: "Action", optional: true, description: "Optional submit Action; clicking the trailing button or pressing Enter triggers it" },
    { name: "submitLabel", type: "string", optional: true, description: "Label for the trailing submit button (default \"Search\"). Omitted when no action is provided." },
  ],
  render: (node, props, helpers) => {
    const root = el("form", { class: "rui-search-bar", role: "search" });
    root.onsubmit = (event) => {
      event.preventDefault();
      if (isActionPayload(props.action)) helpers.runAction(props.action);
    };
    const iconWrap = renderIcon("magnifying-glass", { className: "rui-search-bar-icon" })
      ?? el("span", { class: "rui-search-bar-icon", "aria-hidden": "true" });
    root.append(iconWrap);
    const input = el("input", {
      class: "rui-search-bar-input",
      id: asString(props.id),
      name: asString(props.id),
      type: "search",
      placeholder: asString(props.placeholder, "Search…"),
      value: asString(props.value),
      autocomplete: "off",
    });
    bindToStateAtArg(input, node, 2, helpers);
    root.append(input);
    const shortcut = asString(props.shortcut);
    if (shortcut) root.append(el("span", { class: "rui-search-bar-shortcut" }, [shortcut]));
    if (isActionPayload(props.action)) {
      const btn = el("button", {
        type: "submit",
        class: "rui-search-bar-submit",
      }, [asString(props.submitLabel, "Search")]);
      root.append(btn);
    }
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
    form.onsubmit = (event) => event.preventDefault();
    for (const field of asArray(props.fields)) form.append(helpers.renderNode(field));
    if (props.buttons) {
      const actions = el("div", { class: "rui-form-actions" });
      actions.append(helpers.renderNode(props.buttons));
      form.append(actions);
    }
    return form;
  },
};

export const Slider: ComponentSpec = {
  name: "Slider",
  description:
    "Range slider for selecting a single numeric value between `min` and " +
    "`max`. Pass a `$variable` as `value` for two-way binding. Useful for " +
    "filters, settings (volume, brightness), and parameter tuning.",
  props: [
    { name: "id", type: "string" },
    { name: "min", type: "number", optional: true, description: "Default 0" },
    { name: "max", type: "number", optional: true, description: "Default 100" },
    { name: "step", type: "number", optional: true, description: "Default 1" },
    { name: "value", type: "number", optional: true, description: "Bound value (typically $variable)" },
    { name: "label", type: "string", optional: true },
    { name: "showValue", type: "boolean", optional: true, description: "Render the current numeric value beside the slider" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const min = asNumber(props.min, 0);
    const max = asNumber(props.max, 100);
    const step = asNumber(props.step, 1);
    const value = asNumber(props.value, min);
    const root = el("div", { class: "rui-slider", "data-disabled": asBoolean(props.disabled) ? "true" : "false" });
    const label = asString(props.label);
    const showValue = asBoolean(props.showValue);
    if (label || showValue) {
      const head = el("div", { class: "rui-slider-head" });
      if (label) head.append(el("label", { class: "rui-slider-label", for: id }, [label]));
      if (showValue) head.append(el("span", { class: "rui-slider-value" }, [String(value)]));
      root.append(head);
    }
    const input = el("input", {
      type: "range",
      class: "rui-slider-input",
      id,
      name: id,
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
      disabled: asBoolean(props.disabled) ? "" : null,
    }) as HTMLInputElement;
    // Update the inline value pill while dragging so the user gets feedback
    // before the state binding propagates back through a render tick.
    // NOTE: the morph copies `oninput` onto the *live* input, so we must
    // resolve sibling nodes from the event target — capturing `root` /
    // `input` here would point at the freshly-rendered (detached) tree.
    input.oninput = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement | null;
      if (!target) return;
      const sliderRoot = target.closest(".rui-slider");
      const valueEl = sliderRoot?.querySelector(".rui-slider-value");
      if (valueEl) valueEl.textContent = target.value;
    };
    const stateName = node.argMeta?.[4]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => Number((n as HTMLInputElement).value),
      });
    }
    root.append(input);
    return root;
  },
};

export const NumberInput: ComponentSpec = {
  name: "NumberInput",
  description:
    "Numeric input with paired increment/decrement buttons. Use for " +
    "quantity steppers, integer settings, and any field where a `<input " +
    "type=\"number\">` plus +/- controls is friendlier than the native " +
    "spinner. Pass a `$variable` as `value` for two-way binding.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "number", optional: true, description: "Bound value (typically $variable)" },
    { name: "min", type: "number", optional: true },
    { name: "max", type: "number", optional: true },
    { name: "step", type: "number", optional: true, description: "Default 1" },
    { name: "placeholder", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const step = asNumber(props.step, 1);
    const hasMin = props.min !== undefined && props.min !== null;
    const hasMax = props.max !== undefined && props.max !== null;
    const min = hasMin ? asNumber(props.min, 0) : Number.NEGATIVE_INFINITY;
    const max = hasMax ? asNumber(props.max, 0) : Number.POSITIVE_INFINITY;
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-number-input", "data-disabled": disabled ? "true" : "false" });
    const decBtn = el("button", {
      type: "button",
      class: "rui-number-input-button",
      "data-direction": "down",
      "aria-label": "Decrement",
      disabled: disabled ? "" : null,
    }, ["−"]);
    const input = el("input", {
      type: "number",
      class: "rui-number-input-field",
      id,
      name: id,
      value: asString(props.value),
      placeholder: asString(props.placeholder),
      min: hasMin ? String(min) : null,
      max: hasMax ? String(max) : null,
      step: String(step),
      disabled: disabled ? "" : null,
    }) as HTMLInputElement;
    const incBtn = el("button", {
      type: "button",
      class: "rui-number-input-button",
      "data-direction": "up",
      "aria-label": "Increment",
      disabled: disabled ? "" : null,
    }, ["+"]);
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => {
          const raw = (n as HTMLInputElement).value;
          if (raw === "") return null;
          const num = Number(raw);
          return Number.isFinite(num) ? num : null;
        },
      });
    }
    const adjust = (origin: Element, delta: number): void => {
      // Resolve the *live* input via the DOM. The `input` captured by this
      // closure points at the freshly-rendered node, which is detached
      // once the morph reconciler reuses the previous one.
      const liveRoot = origin.closest(".rui-number-input");
      const live = liveRoot?.querySelector<HTMLInputElement>(".rui-number-input-field");
      if (!live) return;
      const current = Number(live.value);
      const base = Number.isFinite(current) ? current : 0;
      const next = clampNumber(base + delta, min, max);
      live.value = String(next);
      live.dispatchEvent(new Event("input", { bubbles: true }));
    };
    decBtn.onclick = (event) => adjust((event.currentTarget ?? event.target) as Element, -step);
    incBtn.onclick = (event) => adjust((event.currentTarget ?? event.target) as Element, step);
    root.append(decBtn, input, incBtn);
    return root;
  },
};

export const DatePicker: ComponentSpec = {
  name: "DatePicker",
  description:
    "Date picker that wraps the native `<input type=\"date\">` with " +
    "consistent styling. Pass a `$variable` as `value` for two-way binding. " +
    "Use `min`/`max` to bound the selectable range.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "ISO date (YYYY-MM-DD); typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true, description: "Earliest ISO date" },
    { name: "max", type: "string", optional: true, description: "Latest ISO date" },
    { name: "placeholder", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("div", { class: "rui-date-picker" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-date-picker-label", for: id }, [label]));
    const input = el("input", {
      type: "date",
      class: "rui-date-picker-input",
      id,
      name: id,
      value: asString(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      placeholder: asString(props.placeholder),
      disabled: asBoolean(props.disabled) ? "" : null,
    });
    bindToStateAtArg(input, node, 1, helpers);
    root.append(input);
    return root;
  },
};

export const FileUpload: ComponentSpec = {
  name: "FileUpload",
  description:
    "Styled file picker. Renders a click/drop area with a leading icon, " +
    "label, and helper text. Files cannot round-trip through `$variables` " +
    "(they are not serialisable), so pass an `action` containing an " +
    "`@Js(...)` step to handle the picked files via `ctx.query(\"#id\").files`.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string", optional: true, description: "Primary label (default \"Choose a file\")" },
    { name: "hint", type: "string", optional: true, description: "Secondary helper text" },
    { name: "accept", type: "string", optional: true, description: "Comma-separated MIME types or extensions" },
    { name: "multiple", type: "boolean", optional: true },
    { name: "action", type: "Action", optional: true, description: "Action fired when files are picked" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon (default \"cloud-arrow-up\")" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const id = asString(props.id);
    const disabled = asBoolean(props.disabled);
    const root = el("label", {
      class: "rui-file-upload",
      for: id,
      "data-disabled": disabled ? "true" : "false",
    });
    const iconNode = renderIcon(asString(props.icon, "cloud-arrow-up"), { className: "rui-file-upload-icon" });
    if (iconNode) root.append(iconNode);
    const text = el("div", { class: "rui-file-upload-text" });
    text.append(el("div", { class: "rui-file-upload-label" }, [asString(props.label, "Choose a file")]));
    const hint = asString(props.hint);
    if (hint) text.append(el("div", { class: "rui-file-upload-hint" }, [hint]));
    root.append(text);
    const input = el("input", {
      type: "file",
      id,
      name: id,
      class: "rui-file-upload-input",
      accept: asString(props.accept) || null,
      multiple: asBoolean(props.multiple) ? "" : null,
      disabled: disabled ? "" : null,
    });
    input.onchange = () => {
      if (isActionPayload(props.action)) helpers.runAction(props.action);
    };
    root.append(input);
    return root;
  },
};

export const Combobox: ComponentSpec = {
  name: "Combobox",
  description:
    "Searchable single-select dropdown — type to filter, click an option " +
    "to choose. Use instead of `Select` when the list is long enough that " +
    "scanning is faster than scrolling (countries, currencies, repos, " +
    "users). Pass a `$variable` as `value` for two-way binding; the " +
    "selected option's `value` is written to state on pick.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) or {value, label}" },
    { name: "value", type: "string", optional: true, description: "Bound selected value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no items match the filter (default \"No matches\")" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const items = extractComboboxItems(props.items);
    const currentValue = asString(props.value);
    const currentLabel = items.find((item) => item.value === currentValue)?.label ?? currentValue;
    const placeholder = asString(props.placeholder, "Select…");
    const emptyLabel = asString(props.emptyLabel, "No matches");
    const disabled = asBoolean(props.disabled);
    const openSlot = helpers.useInstanceState<boolean>("open", false);
    const filterSlot = helpers.useInstanceState<string>("filter", "");
    const isOpen = openSlot.get();

    const root = el("div", {
      class: "rui-combobox",
      "data-open": isOpen ? "true" : "false",
      "data-disabled": disabled ? "true" : "false",
    });
    const triggerBtn = el("button", {
      type: "button",
      class: "rui-combobox-trigger",
      id,
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen ? "true" : "false",
      disabled: disabled ? "" : null,
    });
    triggerBtn.append(el("span", {
      class: "rui-combobox-value",
      "data-placeholder": currentLabel ? "false" : "true",
    }, [currentLabel || placeholder]));
    const chevron = renderIcon("chevron-down", { className: "rui-combobox-chevron" });
    if (chevron) triggerBtn.append(chevron);
    root.append(triggerBtn);

    const panel = el("div", { class: "rui-combobox-panel", role: "listbox" });
    const filterInput = el("input", {
      type: "text",
      class: "rui-combobox-filter",
      placeholder: "Filter…",
      autocomplete: "off",
      value: filterSlot.get(),
    }) as HTMLInputElement;
    panel.append(filterInput);
    const list = el("div", { class: "rui-combobox-list" });
    panel.append(list);

    const renderList = (filter: string): void => {
      list.replaceChildren();
      const lower = filter.trim().toLowerCase();
      const matches = lower === ""
        ? items
        : items.filter((item) =>
            item.label.toLowerCase().includes(lower) ||
            item.value.toLowerCase().includes(lower),
          );
      if (matches.length === 0) {
        list.append(el("div", { class: "rui-combobox-empty" }, [emptyLabel]));
        return;
      }
      for (const item of matches) {
        const option = el("button", {
          type: "button",
          class: "rui-combobox-option",
          role: "option",
          "data-value": item.value,
          "aria-selected": item.value === currentValue ? "true" : "false",
        }, [item.label]);
        option.onclick = (event) => {
          event.stopPropagation();
          selectComboboxValue(event.currentTarget as Element, item.value);
        };
        list.append(option);
      }
    };

    // Apply a value as the bound state, then close the combobox UI. Also
    // disposes any pending dismissal listeners so we don't accumulate them
    // after a successful pick (the previous implementation only cleaned
    // them up on outside-click / Escape).
    const selectComboboxValue = (origin: Element, value: string): void => {
      const stateName = node.argMeta?.[2]?.stateRef;
      if (stateName) {
        helpers.runAction({
          kind: "Action",
          steps: [{ kind: "Set", name: stateName, value }],
        });
      }
      openSlot.set(false);
      filterSlot.set("");
      const live = origin.closest(".rui-combobox") as HTMLElement | null;
      live?.setAttribute("data-open", "false");
      live?.querySelector(".rui-combobox-trigger")
        ?.setAttribute("aria-expanded", "false");
      disposeDismissListeners(live);
    };

    renderList(filterSlot.get());

    filterInput.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      filterSlot.set(target.value);
      renderList(target.value);
    };

    // Enter on the filter selects the first visible option, matching the
    // type-ahead behaviour that users expect from native comboboxes. We
    // resolve the option from the live DOM so the handler survives morph.
    filterInput.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      if (e.key !== "Enter") return;
      e.preventDefault();
      const target = e.currentTarget as HTMLInputElement;
      const live = target.closest(".rui-combobox");
      const firstOption = live?.querySelector<HTMLElement>(
        ".rui-combobox-option[data-value]",
      );
      const value = firstOption?.getAttribute("data-value");
      if (value !== null && value !== undefined && firstOption) {
        selectComboboxValue(firstOption, value);
      }
    };

    triggerBtn.onclick = (event) => {
      if (disabled) return;
      event.stopPropagation();
      const next = !openSlot.get();
      openSlot.set(next);
      const live = (event.currentTarget as Element).closest(".rui-combobox") as HTMLElement | null;
      live?.setAttribute("data-open", next ? "true" : "false");
      live?.querySelector(".rui-combobox-trigger")
        ?.setAttribute("aria-expanded", next ? "true" : "false");
      if (!live) return;
      if (!next) {
        // Close path: release any listeners that an earlier open() installed.
        disposeDismissListeners(live);
        return;
      }
      // Focus the filter so users can type immediately. Defer one tick so
      // the element is in the DOM after attribute updates settle.
      setTimeout(() => filterInput.focus(), 0);
      installDismissListeners({
        liveRoot: live,
        onDismiss: () => {
          openSlot.set(false);
          filterSlot.set("");
          live.setAttribute("data-open", "false");
          live.querySelector(".rui-combobox-trigger")
            ?.setAttribute("aria-expanded", "false");
        },
      });
    };
    root.append(panel);
    return root;
  },
};

function extractComboboxItems(raw: unknown): Array<{ value: string; label: string }> {
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

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min === Number.NEGATIVE_INFINITY ? 0 : min;
  return Math.min(Math.max(value, min), max);
}

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
