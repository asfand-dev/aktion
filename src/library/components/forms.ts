/**
 * Form components: Form, FormControl, Input, TextArea, Select, SelectItem,
 * Checkbox, CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, SearchBar,
 * Slider, NumberInput, DatePicker, FileUpload, Combobox.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import type { ComponentNode } from "../../runtime/evaluator.js";
import { el, asArray, asString, asBoolean, asNumber, renderIcon } from "../utils.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";
import { extractComboboxItems, withFieldShell, FIELD_SHELL_PROPS, attachFocusHandlers } from "./forms-shared.js";
import { attachOnChange } from "./wrappers.js";

const BUTTON_VARIANTS = ["primary", "secondary", "outline", "ghost", "link", "danger", "default"] as const;
const BUTTON_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
const INPUT_TYPES = ["text", "email", "password", "number", "tel", "url", "date"] as const;

/**
 * Normalise a size token to the canonical `xs|sm|md|lg|xl` vocabulary.
 * `extra-small` / `extra-large` are accepted as verbose spellings of `xs` /
 * `xl`; anything unrecognised (or empty) falls back to `md`.
 */
function normaliseButtonSize(value: unknown): string {
  const v = asString(value).trim().toLowerCase();
  if (v === "xs" || v === "extra-small") return "xs";
  if (v === "sm") return "sm";
  if (v === "lg") return "lg";
  if (v === "xl" || v === "extra-large") return "xl";
  return "md";
}

/** Human-readable file size for upload previews (V.5). */
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

export const Button: ComponentSpec = {
  name: "Button",
  description:
    "Clickable button. `onClick` (a callable) runs when the user " +
    "presses the button. The legacy `action` prop is an alias and is " +
    "still accepted.",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable invoked when the button is clicked" },
    { name: "variant", type: "string", optional: true, aliases: ["tone"], enum: BUTTON_VARIANTS, description: "Visual style — `primary` solid brand button (`default` is its alias), `secondary` surface + border, `outline` transparent with primary border, `ghost` bare, `link` text-only (underlines on hover), `danger` destructive" },
    { name: "type", type: "string", optional: true, enum: ["button", "submit"], description: "HTML button type" },
    { name: "size", type: "string", optional: true, enum: BUTTON_SIZES, description: "Size token `xs|sm|md|lg|xl`" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
    { name: "iconPosition", type: "string", optional: true, enum: ["leading", "trailing"], description: "Icon placement (default leading)" },
    { name: "iconOnly", type: "boolean", optional: true, description: "Hide the label visually (keeps aria-label)" },
    { name: "loading", type: "boolean", optional: true, description: "Show spinner and disable interaction" },
    { name: "fullWidth", type: "boolean", optional: true },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const loading = asBoolean(props.loading);
    const iconOnly = asBoolean(props.iconOnly);
    const iconPosition = asString(props.iconPosition, "leading");
    const labelText = asString(props.label);
    const button = el("button", {
      class: "rui-button",
      type: asString(props.type, "button"),
      "data-variant": asString(props.variant, "primary"),
      "data-size": normaliseButtonSize(props.size),
      "data-icon-position": iconPosition,
      "data-icon-only": iconOnly ? "true" : null,
      "data-full-width": asBoolean(props.fullWidth) ? "true" : null,
      "data-loading": loading ? "true" : null,
      "aria-label": iconOnly ? labelText : null,
      disabled: asBoolean(props.disabled) || loading ? "" : null,
    });
    const labelSpan = el("span", { class: "rui-button-label" }, [labelText]);
    const iconNode = renderIcon(props.icon, { className: "rui-button-icon" });
    const spinNode = loading ? renderIcon("spinner", { className: "rui-button-spinner" }) : null;
    const adornment = spinNode ?? iconNode;
    if (iconOnly) {
      if (adornment) button.append(adornment);
    } else if (iconPosition === "trailing") {
      button.append(labelSpan);
      if (adornment) button.append(adornment);
    } else {
      if (adornment) button.append(adornment);
      button.append(labelSpan);
    }
    button.onclick = () => {
      if (loading) return;
      helpers.invoke(props.onClick);
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

/**
 * `ButtonGroup` is the *segmented* sibling of `Buttons`: instead of separate
 * buttons with a gap, the items butt directly against each other into one
 * continuous control, with only the outer corners rounded and shared
 * 1px dividers between items. Distinct from `SegmentedControl`/`ToggleGroup`,
 * which render a padded track with a floating "active" chip.
 *
 * Each child is marked with `data-pos` (start / middle / end) so the theme can
 * round the right corners and collapse the adjoining borders.
 */
export const ButtonGroup: ComponentSpec = {
  name: "ButtonGroup",
  description:
    "Row of buttons joined edge-to-edge into a single continuous control — " +
    "only the outer corners are rounded and adjoining borders are shared. " +
    "Use for related actions that form one unit (segmented actions, " +
    "split/paired buttons, view switchers with real actions). For a " +
    "single-select pill track use `SegmentedControl`; for spaced-out " +
    "independent actions use `Buttons`.",
  props: [
    { name: "items", type: "Button[]", positional: true },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "fullWidth", type: "boolean", optional: true, aliases: ["full"], description: "Stretch the group to fill its container, dividing width evenly" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-button-group",
      "data-size": asString(props.size, "md"),
      "data-full-width": asBoolean(props.fullWidth) ? "true" : null,
      role: "group",
    });
    const items = asArray(props.items);
    items.forEach((child, i) => {
      const node = helpers.renderNode(child);
      if (node instanceof HTMLElement) {
        const pos = items.length === 1 ? "only" : i === 0 ? "start" : i === items.length - 1 ? "end" : "middle";
        node.setAttribute("data-pos", pos);
        node.classList.add("rui-button-group-item");
      }
      root.append(node);
    });
    return root;
  },
};

/**
 * `InputGroup` wraps a single field with an optional leading icon and an
 * optional trailing action (a button or icon-button), all inside one shared
 * bordered shell — the pattern behind search fields, password reveal,
 * copy-to-clipboard inputs, and unit-suffixed numeric fields.
 *
 * The nested control keeps its own behaviour (binding, validation); the group
 * only owns the shell, so the border/focus ring is drawn once around the whole
 * composite instead of around the bare input.
 */
export const InputGroup: ComponentSpec = {
  name: "InputGroup",
  description:
    "Single field wrapped in a shared bordered shell with an optional " +
    "leading `icon` and an optional trailing `action` node (button / " +
    "IconButton / short text suffix). The focus ring is drawn around the " +
    "whole composite. Use for search fields, password reveal, " +
    "copy-to-clipboard rows, and unit-suffixed inputs.",
  props: [
    { name: "field", type: "Node", positional: true, description: "The Input/Select/etc. to wrap" },
    { name: "icon", type: "string", optional: true, description: "Leading Font Awesome icon name" },
    { name: "action", type: "Node", optional: true, aliases: ["trailing"], description: "Trailing action node (Button / IconButton)" },
    { name: "suffix", type: "string", optional: true, description: "Short trailing text (e.g. a unit like \"GB\")" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-input-group" });
    const iconNode = renderIcon(props.icon, { className: "rui-input-group-icon" });
    if (iconNode) root.append(iconNode);
    if (props.field) {
      const body = el("div", { class: "rui-input-group-field" });
      body.append(helpers.renderNode(props.field));
      root.append(body);
    }
    const suffix = asString(props.suffix);
    if (suffix) root.append(el("span", { class: "rui-input-group-suffix" }, [suffix]));
    if (props.action) {
      const act = el("div", { class: "rui-input-group-action" });
      act.append(helpers.renderNode(props.action));
      root.append(act);
    }
    return root;
  },
};

export const Input: ComponentSpec = {
  name: "Input",
  description: "Text input field. Pass a $variable as `value` for two-way binding. `onChange(value)` fires on every keystroke with the current string. Pass `label`/`hint`/`error`/`required` to render a labelled field shell with validation messaging.",
  props: [
    { name: "id", type: "string", description: "Input identifier" },
    { name: "placeholder", type: "string", optional: true },
    { name: "type", type: "string", optional: true, enum: INPUT_TYPES },
    { name: "validations", type: "any", optional: true, description: "Array or object of validation hints" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const input = el("input", {
      class: "rui-input",
      id: asString(props.id),
      name: asString(props.id),
      type: asString(props.type, "text"),
      placeholder: asString(props.placeholder),
      value: asString(props.value),
    }) as HTMLInputElement;
    bindToStateAtArg(input, node, 4, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    attachFocusHandlers(input, props, helpers);
    applyValidations(input, props.validations);
    return withFieldShell(input, props);
  },
};

export const TextArea: ComponentSpec = {
  name: "TextArea",
  description: "Multi-line text input. `onChange(value)` fires on every keystroke with the current text. Pass `label`/`hint`/`error`/`required` for a labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "placeholder", type: "string", optional: true },
    { name: "rows", type: "number", optional: true },
    { name: "value", type: "any", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const textarea = el("textarea", {
      class: "rui-textarea",
      id: asString(props.id),
      name: asString(props.id),
      placeholder: asString(props.placeholder),
      rows: String(Number(props.rows ?? 4) || 4),
    }) as HTMLTextAreaElement;
    textarea.value = asString(props.value);
    bindToStateAtArg(textarea, node, 3, helpers);
    attachOnChange(textarea, props.onChange, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLTextAreaElement).value,
    });
    attachFocusHandlers(textarea, props, helpers, (n) => (n as HTMLTextAreaElement).value);
    return withFieldShell(textarea, props);
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
  description:
    "Dropdown select. Pass a `$variable` as `value` for two-way binding. " +
    "Set `searchable: true` for a combobox-style filter UI on long option " +
    "lists. `onChange(value)` fires with the newly-selected value.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]" },
    { name: "label", type: "string", optional: true },
    { name: "placeholder", type: "string", optional: true },
    { name: "value", type: "any", optional: true },
    { name: "searchable", type: "boolean", optional: true, description: "Render as a filterable combobox" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required" },
  ],
  render: (node, props, helpers) => {
    if (asBoolean(props.searchable)) {
      return renderSearchableSelect(node, props, helpers);
    }
    const select = el("select", {
      class: "rui-select",
      id: asString(props.id),
      name: asString(props.id),
    }) as HTMLSelectElement;
    const placeholder = asString(props.placeholder);
    if (placeholder) {
      select.append(el("option", { value: "", disabled: "", selected: "" }, [placeholder]));
    }
    for (const item of asArray(props.items)) {
      select.append(helpers.renderNode(item));
    }
    select.value = asString(props.value);
    bindToStateAtArg(select, node, 4, helpers);
    attachOnChange(select, props.onChange, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLSelectElement).value,
    });
    attachFocusHandlers(select, props, helpers, (n) => (n as HTMLSelectElement).value);
    return withFieldShell(select, props);
  },
};

export const Checkbox: ComponentSpec = {
  name: "Checkbox",
  description: "Boolean checkbox. `onChange(checked)` fires with the new boolean state.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string" },
    { name: "value", type: "boolean", optional: true, aliases: ["checked"] },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new boolean value" },
  ],
  render: (node, props, helpers) => {
    const wrapper = el("label", { class: "rui-checkbox" });
    const isChecked = asBoolean(props.value);
    const input = el("input", {
      type: "checkbox",
      id: asString(props.id),
      name: asString(props.id),
      checked: isChecked ? "" : null,
    }) as HTMLInputElement;
    input.checked = isChecked;
    bindToStateAtArg(input, node, 2, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).checked,
    });
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
    { name: "defaultChecked", type: "boolean", optional: true, aliases: ["checked"] },
  ],
  render: (_node, props) => {
    const itemName = asString(props.name);
    const label = asString(props.label);
    const description = asString(props.description);
    const isChecked = asBoolean(props.defaultChecked);
    const wrapper = el("label", {
      class: "rui-checkbox-item",
      "data-name": itemName,
    });
    const input = el("input", {
      type: "checkbox",
      name: itemName,
      checked: isChecked ? "" : null,
    }) as HTMLInputElement;
    input.checked = isChecked;
    const text = el("div", { class: "rui-checkbox-item-text" });
    text.append(el("div", { class: "rui-checkbox-item-label" }, [label]));
    if (description) text.append(el("div", { class: "rui-checkbox-item-description" }, [description]));
    wrapper.append(input, text);
    return wrapper;
  },
};

export const CheckBoxGroup: ComponentSpec = {
  name: "CheckBoxGroup",
  description: "Group of checkboxes. Value is an object keyed by item name. Pass a `$variable` for two-way binding. `onChange(value)` fires with the full updated object.",
  props: [
    { name: "name", type: "string", description: "Group identifier" },
    { name: "items", type: "CheckBoxItem[]" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated `{name: checked}` object when any item toggles" },
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
    // Snapshot the live `{name: checked}` object from the rendered DOM. The
    // CheckBoxGroup re-derives the object on every event so morphing and
    // user-supplied `onChange` handlers stay in sync.
    const readGroupValue = (rootEl: HTMLElement): Record<string, boolean> => {
      const out: Record<string, boolean> = {};
      rootEl
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((input) => {
          out[input.name] = input.checked;
        });
      return out;
    };
    if (stateName) {
      helpers.bindState(root, stateName, {
        event: "change",
        // Read from the *live* DOM rooted at the event target, never from
        // the closure's `inputs` array. After a morph re-render those
        // captured input elements are detached and report stale `checked`.
        getValue: readGroupValue,
      });
    }
    attachOnChange(root, props.onChange, helpers, {
      event: "change",
      getValue: (n) => readGroupValue(n as HTMLElement),
    });

    return root;
  },
};

export const Radio: ComponentSpec = {
  name: "Radio",
  description: "Radio button group. `onChange(value)` fires with the newly-selected option value.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]" },
    { name: "value", type: "any", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected radio value" },
  ],
  render: (node, props, helpers) => {
    const groupName = asString(props.id);
    const root = el("div", { class: "rui-radio-group", role: "radiogroup" });
    for (const item of asArray<{ args?: unknown[] }>(props.items)) {
      const value = asString(item.args?.[0]);
      const label = asString(item.args?.[1], value);
      const id = `${groupName}-${value}`;
      const itemRoot = el("label", { class: "rui-radio", for: id });
      const isChecked = asString(props.value) === value;
      const input = el("input", {
        type: "radio",
        id,
        name: groupName,
        value,
        checked: isChecked ? "" : null,
      }) as HTMLInputElement;
      input.checked = isChecked;
      bindToStateAtArg(input, node, 2, helpers);
      attachOnChange(input, props.onChange, helpers, {
        event: "change",
        getValue: (n) => (n as HTMLInputElement).value,
      });
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
    { name: "field", type: "Node", aliases: ["control"] },
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
    { name: "onSubmit", type: "callable", optional: true, aliases: ["action", "onClick"], description: "Optional submit callable; clicking the trailing button or pressing Enter invokes it" },
    { name: "submitLabel", type: "string", optional: true, description: "Label for the trailing submit button (default \"Search\"). Omitted when no action is provided." },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current query on every keystroke" },
  ],
  render: (node, props, helpers) => {
    const root = el("form", { class: "rui-search-bar", role: "search" });
    root.onsubmit = (event) => {
      event.preventDefault();
      helpers.invoke(props.onSubmit);
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
    }) as HTMLInputElement;
    bindToStateAtArg(input, node, 2, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    root.append(input);
    const shortcut = asString(props.shortcut);
    if (shortcut) root.append(el("span", { class: "rui-search-bar-shortcut" }, [shortcut]));
    if (props.onSubmit != null) {
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
  description:
    "Form container. Children FormControls render in order; buttons " +
    "render at the bottom. Provide `onSubmit` to handle form submission " +
    "(invoked when the user presses Enter on a focused input or clicks a " +
    "`type=\"submit\"` Button inside the form).",
  props: [
    { name: "id", type: "string" },
    { name: "buttons", type: "Buttons | Button" },
    { name: "fields", type: "FormControl[]" },
    { name: "onSubmit", type: "callable", optional: true, aliases: ["onsubmit"], description: "Called when the form is submitted (Enter key or submit button)" },
  ],
  render: (_node, props, helpers) => {
    const form = el("form", { class: "rui-form", id: asString(props.id) });
    form.onsubmit = (event) => {
      event.preventDefault();
      helpers.invoke(props.onSubmit);
    };
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
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new number as the user drags" },
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
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => Number((n as HTMLInputElement).value),
    });
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
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new number (or null when blank)" },
    ...FIELD_SHELL_PROPS,
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
    const readNumberValue = (n: HTMLElement): number | null => {
      const raw = (n as HTMLInputElement).value;
      if (raw === "") return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    };
    if (stateName) {
      helpers.bindState(input, stateName, { event: "input", getValue: readNumberValue });
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: readNumberValue,
    });
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
    attachFocusHandlers(input, props, helpers, readNumberValue);
    root.append(decBtn, input, incBtn);
    return withFieldShell(root, props, { idKey: "id" });
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
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new ISO date string when the picker changes" },
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
    }) as HTMLInputElement;
    bindToStateAtArg(input, node, 1, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    root.append(input);
    return root;
  },
};

export const FileUpload: ComponentSpec = {
  name: "FileUpload",
  description:
    "Styled file picker. Renders a click/drop area with a leading icon, " +
    "label, and helper text. Files cannot round-trip through `$variables` " +
    "(they are not serialisable), so pass a callable as `action` to handle " +
    "the picked files via `ctx.query(\"#id\").files`.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string", optional: true, description: "Primary label (default \"Choose a file\")" },
    { name: "hint", type: "string", optional: true, description: "Secondary helper text" },
    { name: "accept", type: "string", optional: true, description: "Comma-separated MIME types or extensions" },
    { name: "multiple", type: "boolean", optional: true },
    { name: "onSelect", type: "callable", optional: true, aliases: ["action", "onChange"], description: "Callable fired with the FileList when files are picked" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon (default \"cloud-arrow-up\")" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const id = asString(props.id);
    const disabled = asBoolean(props.disabled);
    const root = el("div", {
      class: "rui-file-upload",
      "data-disabled": disabled ? "true" : "false",
    });
    const dropZone = el("label", {
      class: "rui-file-upload-dropzone",
      for: id,
    });
    const iconNode = renderIcon(asString(props.icon, "cloud-arrow-up"), { className: "rui-file-upload-icon" });
    if (iconNode) dropZone.append(iconNode);
    const text = el("div", { class: "rui-file-upload-text" });
    text.append(el("div", { class: "rui-file-upload-label" }, [asString(props.label, "Choose a file")]));
    const hint = asString(props.hint);
    if (hint) text.append(el("div", { class: "rui-file-upload-hint" }, [hint]));
    dropZone.append(text);
    const input = el("input", {
      type: "file",
      id,
      name: id,
      class: "rui-file-upload-input",
      accept: asString(props.accept) || null,
      multiple: asBoolean(props.multiple) ? "" : null,
      disabled: disabled ? "" : null,
    });
    dropZone.append(input);
    root.append(dropZone);

    const isImageFile = (file: File, accept: string): boolean =>
      accept.includes("image") ||
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name);

    // Shared preview renderer used by both the native picker and drag-drop.
    const showPreview = (uploadRoot: HTMLElement, files: FileList | File[] | null): void => {
      const existing = uploadRoot.querySelector(".rui-file-upload-preview");
      if (existing) existing.remove();
      const list = files ? Array.from(files) : [];
      if (list.length === 0) return;
      const accept = asString(props.accept);
      const preview = el("div", { class: "rui-file-upload-preview" });
      list.forEach((file) => {
        const row = el("div", { class: "rui-file-upload-preview-item" });
        if (isImageFile(file, accept)) {
          const objectUrl = URL.createObjectURL(file);
          const img = el("img", { src: objectUrl, alt: file.name, class: "rui-file-upload-thumbnail" }) as HTMLImageElement;
          img.onload = () => URL.revokeObjectURL(objectUrl);
          row.append(img);
        }
        row.append(el("span", { class: "rui-file-upload-filename" }, [file.name]));
        const size = formatFileSize(file.size);
        if (size) row.append(el("span", { class: "rui-file-upload-filesize" }, [size]));
        preview.append(row);
      });
      uploadRoot.append(preview);
    };

    input.onchange = (event) => {
      const fileInput = event.currentTarget as HTMLInputElement;
      helpers.invoke(props.onSelect, fileInput.files);
      const uploadRoot = fileInput.closest(".rui-file-upload") as HTMLElement | null;
      if (uploadRoot) showPreview(uploadRoot, fileInput.files);
    };

    // Real drag-and-drop (V.5): highlight on dragover, accept dropped files,
    // assign them to the hidden input, then fire onSelect + preview.
    if (!disabled) {
      const stop = (e: Event): void => { e.preventDefault(); e.stopPropagation(); };
      dropZone.addEventListener("dragenter", (e) => { stop(e); dropZone.classList.add("is-dragover"); });
      dropZone.addEventListener("dragover", (e) => { stop(e); dropZone.classList.add("is-dragover"); });
      dropZone.addEventListener("dragleave", (e) => { stop(e); dropZone.classList.remove("is-dragover"); });
      dropZone.addEventListener("drop", (event) => {
        stop(event);
        dropZone.classList.remove("is-dragover");
        const dt = (event as DragEvent).dataTransfer;
        if (!dt || dt.files.length === 0) return;
        try { input.files = dt.files; } catch { /* some browsers disallow setting .files */ }
        helpers.invoke(props.onSelect, dt.files);
        const uploadRoot = dropZone.closest(".rui-file-upload") as HTMLElement | null;
        if (uploadRoot) showPreview(uploadRoot, dt.files);
      });
    }
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
    { name: "open", type: "boolean", optional: true, description: "Initial open state — use to demo or pre-open the dropdown" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const items = extractComboboxItems(props.items);
    const currentValue = asString(props.value);
    const currentLabel = items.find((item) => item.value === currentValue)?.label ?? currentValue;
    const placeholder = asString(props.placeholder, "Select…");
    const emptyLabel = asString(props.emptyLabel, "No matches");
    const disabled = asBoolean(props.disabled);
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState<boolean>("open", initialOpen);
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

    // Re-paint the option list into the supplied container. When the
    // user types into the filter input on a re-rendered combobox the
    // closure-captured `list` reference points at the (detached)
    // freshly-rendered DOM; the live target is the only thing that
    // actually shows in the page, so we accept it as an argument and let
    // each call site resolve it from the live tree.
    const renderList = (target: HTMLElement, filter: string): void => {
      target.replaceChildren();
      const lower = filter.trim().toLowerCase();
      const matches = lower === ""
        ? items
        : items.filter((item) =>
            item.label.toLowerCase().includes(lower) ||
            item.value.toLowerCase().includes(lower),
          );
      if (matches.length === 0) {
        target.append(el("div", { class: "rui-combobox-empty" }, [emptyLabel]));
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
        target.append(option);
      }
    };

    // Apply a value as the bound state, then close the combobox UI. Also
    // disposes any pending dismissal listeners so we don't accumulate them
    // after a successful pick (the previous implementation only cleaned
    // them up on outside-click / Escape).
    const selectComboboxValue = (origin: Element, value: string): void => {
      const stateName = node.argMeta?.[2]?.stateRef;
      if (stateName) {
        helpers.setState(stateName, value);
      }
      helpers.invoke(props.onChange, value);
      openSlot.set(false);
      filterSlot.set("");
      const live = origin.closest(".rui-combobox") as HTMLElement | null;
      live?.setAttribute("data-open", "false");
      live?.querySelector(".rui-combobox-trigger")
        ?.setAttribute("aria-expanded", "false");
      disposeDismissListeners(live);
    };

    renderList(list, filterSlot.get());

    filterInput.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      filterSlot.set(target.value);
      const liveList = target.closest(".rui-combobox-panel")
        ?.querySelector(".rui-combobox-list") as HTMLElement | null;
      if (liveList) renderList(liveList, target.value);
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

export const MultiSelect: ComponentSpec = {
  name: "MultiSelect",
  description:
    "Multi-option searchable dropdown. Type to filter, click an option to " +
    "add/remove it from the bound array. Renders the selected options as " +
    "removable chips inside the trigger. Pass a `$variable` (array of " +
    "values) as `value` for two-way binding.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) or {value, label}" },
    { name: "value", type: "any[]", optional: true, description: "Bound array of selected values (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no items match the filter" },
    { name: "max", type: "number", optional: true, description: "Maximum number of selections" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "open", type: "boolean", optional: true, description: "Initial open state — use to demo or pre-open the dropdown" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated array of selected values" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const items = extractComboboxItems(props.items);
    const placeholder = asString(props.placeholder, "Select…");
    const emptyLabel = asString(props.emptyLabel, "No matches");
    const disabled = asBoolean(props.disabled);
    const max = Math.max(0, Math.floor(Number(props.max ?? 0)));
    const selected = Array.isArray(props.value)
      ? (props.value as unknown[]).map((v) => asString(v)).filter(Boolean)
      : [];
    const selectedSet = new Set(selected);
    const stateName = node.argMeta?.[2]?.stateRef;

    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState<boolean>("open", initialOpen);
    const filterSlot = helpers.useInstanceState<string>("filter", "");
    const isOpen = openSlot.get();

    const root = el("div", {
      class: "rui-multiselect",
      "data-open": isOpen ? "true" : "false",
      "data-disabled": disabled ? "true" : "false",
    });

    const triggerBtn = el("button", {
      type: "button",
      class: "rui-multiselect-trigger",
      id,
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen ? "true" : "false",
      disabled: disabled ? "" : null,
    });
    const chipRow = el("span", { class: "rui-multiselect-chips" });
    const writeSelection = (next: string[]): void => {
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
    };
    if (selected.length === 0) {
      chipRow.append(el("span", { class: "rui-multiselect-placeholder" }, [placeholder]));
    } else {
      for (const value of selected) {
        const label = items.find((item) => item.value === value)?.label ?? value;
        const chip = el("span", { class: "rui-multiselect-chip", "data-value": value });
        chip.append(el("span", { class: "rui-multiselect-chip-label" }, [label]));
        const removeBtn = el("button", {
          type: "button",
          class: "rui-multiselect-chip-remove",
          "aria-label": `Remove ${label}`,
        }, ["×"]);
        removeBtn.onclick = (event) => {
          event.stopPropagation();
          const next = selected.filter((v) => v !== value);
          writeSelection(next);
        };
        chip.append(removeBtn);
        chipRow.append(chip);
      }
    }
    triggerBtn.append(chipRow);
    const chevron = renderIcon("chevron-down", { className: "rui-multiselect-chevron" });
    if (chevron) triggerBtn.append(chevron);
    root.append(triggerBtn);

    const panel = el("div", { class: "rui-multiselect-panel", role: "listbox", "aria-multiselectable": "true" });
    const filterInput = el("input", {
      type: "text",
      class: "rui-multiselect-filter",
      placeholder: "Filter…",
      autocomplete: "off",
      value: filterSlot.get(),
    }) as HTMLInputElement;
    panel.append(filterInput);
    const list = el("div", { class: "rui-multiselect-list" });
    panel.append(list);

    // Paint into the *given* container so the input handler can pass the
    // live list element it found from `event.currentTarget` (the
    // closure-captured `list` is detached after morph keeps the previous
    // multiselect DOM).
    const renderList = (target: HTMLElement, filter: string): void => {
      target.replaceChildren();
      const lower = filter.trim().toLowerCase();
      const matches = lower === ""
        ? items
        : items.filter((item) =>
            item.label.toLowerCase().includes(lower) ||
            item.value.toLowerCase().includes(lower),
          );
      if (matches.length === 0) {
        target.append(el("div", { class: "rui-multiselect-empty" }, [emptyLabel]));
        return;
      }
      for (const item of matches) {
        const isSelected = selectedSet.has(item.value);
        const atCap = !isSelected && max > 0 && selected.length >= max;
        const option = el("button", {
          type: "button",
          class: "rui-multiselect-option",
          role: "option",
          "data-value": item.value,
          "data-selected": isSelected ? "true" : "false",
          "aria-selected": isSelected ? "true" : "false",
          disabled: atCap ? "" : null,
        });
        const checkbox = el("span", { class: "rui-multiselect-option-check" });
        const checkIcon = renderIcon(isSelected ? "check" : "", { className: "rui-multiselect-option-check-icon" });
        if (checkIcon) checkbox.append(checkIcon);
        option.append(checkbox);
        option.append(el("span", { class: "rui-multiselect-option-label" }, [item.label]));
        option.onclick = (event) => {
          event.stopPropagation();
          if (atCap) return;
          const next = isSelected
            ? selected.filter((v) => v !== item.value)
            : [...selected, item.value];
          writeSelection(next);
        };
        target.append(option);
      }
    };

    renderList(list, filterSlot.get());

    filterInput.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      filterSlot.set(target.value);
      const liveList = target.closest(".rui-multiselect-panel")
        ?.querySelector(".rui-multiselect-list") as HTMLElement | null;
      if (liveList) renderList(liveList, target.value);
    };

    triggerBtn.onclick = (event) => {
      if (disabled) return;
      event.stopPropagation();
      const next = !openSlot.get();
      openSlot.set(next);
      const live = (event.currentTarget as Element).closest(".rui-multiselect") as HTMLElement | null;
      live?.setAttribute("data-open", next ? "true" : "false");
      live?.querySelector(".rui-multiselect-trigger")
        ?.setAttribute("aria-expanded", next ? "true" : "false");
      if (!live) return;
      if (!next) { disposeDismissListeners(live); return; }
      setTimeout(() => filterInput.focus(), 0);
      installDismissListeners({
        liveRoot: live,
        onDismiss: () => {
          openSlot.set(false);
          filterSlot.set("");
          live.setAttribute("data-open", "false");
          live.querySelector(".rui-multiselect-trigger")
            ?.setAttribute("aria-expanded", "false");
        },
      });
    };

    root.append(panel);
    return root;
  },
};

export const DateRangePicker: ComponentSpec = {
  name: "DateRangePicker",
  description:
    "Paired date inputs with a single label, sharing the same min/max " +
    "range. Pass `$variable` references for both `from` and `to` to " +
    "two-way-bind a date range (ISO `YYYY-MM-DD` strings).",
  props: [
    { name: "id", type: "string" },
    { name: "from", type: "string", optional: true, description: "ISO date start; typically $variable" },
    { name: "to", type: "string", optional: true, description: "ISO date end; typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true, description: "Earliest selectable ISO date" },
    { name: "max", type: "string", optional: true, description: "Latest selectable ISO date" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with `{from, to}` whenever either endpoint changes" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const fromId = `${id}-from`;
    const toId = `${id}-to`;
    const min = asString(props.min);
    const max = asString(props.max);
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-date-range-picker", "data-disabled": disabled ? "true" : "false" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-date-range-picker-label", for: fromId }, [label]));
    const row = el("div", { class: "rui-date-range-picker-row" });
    const fromInput = el("input", {
      type: "date",
      class: "rui-date-range-picker-input",
      id: fromId,
      name: fromId,
      value: asString(props.from),
      min: min || null,
      max: max || null,
      disabled: disabled ? "" : null,
      "data-role": "from",
    });
    row.append(fromInput);
    row.append(el("span", { class: "rui-date-range-picker-separator", "aria-hidden": "true" }, ["–"]));
    const toInput = el("input", {
      type: "date",
      class: "rui-date-range-picker-input",
      id: toId,
      name: toId,
      value: asString(props.to),
      min: min || null,
      max: max || null,
      disabled: disabled ? "" : null,
      "data-role": "to",
    });
    row.append(toInput);
    root.append(row);
    const fromState = node.argMeta?.[1]?.stateRef;
    const toState = node.argMeta?.[2]?.stateRef;
    if (fromState) helpers.bindState(fromInput, fromState);
    if (toState) helpers.bindState(toInput, toState);
    if (props.onChange != null) {
      const readRange = (target: HTMLInputElement) => {
        const wrapper = target.closest(".rui-date-range-picker");
        const from = wrapper?.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"from\"]")?.value ?? "";
        const to = wrapper?.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"to\"]")?.value ?? "";
        return { from, to };
      };
      fromInput.addEventListener("change", (e) => helpers.invoke(props.onChange, readRange(e.currentTarget as HTMLInputElement)));
      toInput.addEventListener("change", (e) => helpers.invoke(props.onChange, readRange(e.currentTarget as HTMLInputElement)));
    }
    return root;
  },
};

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min === Number.NEGATIVE_INFINITY ? 0 : min;
  return Math.min(Math.max(value, min), max);
}

/** Searchable `Select` delegates to the Combobox renderer (value binds at arg index 4). */
function renderSearchableSelect(
  node: ComponentNode,
  props: Record<string, unknown>,
  helpers: RenderHelpers,
): Node {
  const meta = node.argMeta ? [...node.argMeta] : [];
  while (meta.length < 5) meta.push({});
  if (meta[4]?.stateRef) meta[2] = meta[4];
  const root = Combobox.render(
    { ...node, argMeta: meta } as ComponentNode,
    {
      id: props.id,
      items: props.items,
      value: props.value,
      placeholder: props.placeholder,
      emptyLabel: "No matches",
      disabled: false,
    },
    helpers,
  ) as HTMLElement;
  root.classList.add("rui-select-searchable");
  return root;
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
