/**
 * Advanced form components:
 *
 *   - PinInput / OtpInput — Per-digit code entry for 2FA, SMS verification.
 *   - PasswordInput — Text input with visibility toggle and strength meter.
 *   - TagInput — Comma/Enter-separated chip input bound to a `$variable` array.
 *   - MentionInput — TextArea-like input that suggests @-mentions from a list.
 *   - TimePicker — `<input type="time">` wrapper.
 *   - DateTimePicker — `<input type="datetime-local">` wrapper.
 *   - MaskedInput — Text input with a simple mask (e.g. `(999) 999-9999`).
 *   - FormSection / FieldSet — Semantic grouping for form fields.
 *   - ValidationSummary — Aggregate errors list for the top of a form.
 *   - MultiStepForm — Steps + content + prev/next composite.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import { el, asArray, asString, asBoolean, asNumber, renderIcon } from "../utils.js";

const PIN_TYPES = ["numeric", "alphanumeric"] as const;

/* ----------------------------------------------------------------------- *
 * PinInput / OtpInput
 * ----------------------------------------------------------------------- */

function renderPin(
  id: string,
  length: number,
  type: string,
  value: string,
  disabled: boolean,
  mask: boolean,
  onChange?: (next: string) => void,
): HTMLElement {
  const root = el("div", {
    class: "rui-pin-input",
    "data-disabled": disabled ? "true" : "false",
  });
  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < length; i += 1) {
    const input = el("input", {
      class: "rui-pin-input-slot",
      id: i === 0 ? id : null,
      maxlength: "1",
      autocomplete: "one-time-code",
      inputmode: type === "numeric" ? "numeric" : "text",
      type: mask ? "password" : "text",
      "aria-label": `Digit ${i + 1}`,
      value: value.charAt(i) || "",
      disabled: disabled ? "" : null,
    }) as HTMLInputElement;
    inputs.push(input);
    root.append(input);
  }
  const collect = (): string => inputs.map((i) => i.value).join("").slice(0, length);
  inputs.forEach((input, idx) => {
    input.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      let v = target.value;
      if (type === "numeric") v = v.replace(/\D/g, "");
      else v = v.replace(/[^A-Za-z0-9]/g, "");
      if (v.length > 1) {
        // Paste support — distribute the typed characters across slots.
        const chars = v.split("");
        chars.slice(0, length - idx).forEach((c, k) => {
          const next = inputs[idx + k];
          if (next) next.value = c;
        });
        const lastFilled = Math.min(idx + chars.length, length - 1);
        inputs[lastFilled]?.focus();
      } else {
        target.value = v;
        if (v && idx < length - 1) inputs[idx + 1]?.focus();
      }
      onChange?.(collect());
    };
    input.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      if (e.key === "Backspace" && !input.value && idx > 0) {
        e.preventDefault();
        inputs[idx - 1]?.focus();
        const prev = inputs[idx - 1];
        if (prev) prev.value = "";
        onChange?.(collect());
      } else if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        inputs[idx - 1]?.focus();
      } else if (e.key === "ArrowRight" && idx < length - 1) {
        e.preventDefault();
        inputs[idx + 1]?.focus();
      }
    };
  });
  return root;
}

export const PinInput: ComponentSpec = {
  name: "PinInput",
  description:
    "Per-digit PIN entry. Auto-advances focus as the user types and " +
    "supports paste. Pass a `$variable` as `value` for two-way binding " +
    "(the bound value is the joined string). Use `type=\"numeric\"` for " +
    "PINs / 2FA codes, `\"alphanumeric\"` for invite codes.",
  props: [
    { name: "id", type: "string" },
    { name: "length", type: "number", optional: true, description: "Number of slots (default 4)" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "type", type: "string", optional: true, enum: PIN_TYPES },
    { name: "mask", type: "boolean", optional: true, description: "Render slots as `<input type=password>`" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const length = Math.max(1, Math.min(12, Math.floor(asNumber(props.length, 4))));
    const type = asString(props.type, "numeric");
    const value = asString(props.value);
    const disabled = asBoolean(props.disabled);
    const mask = asBoolean(props.mask);
    const stateName = node.argMeta?.[2]?.stateRef;
    return renderPin(id, length, type, value, disabled, mask, (next) => {
      if (stateName) {
        helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: stateName, value: next }] });
      }
    });
  },
};

/* ----------------------------------------------------------------------- *
 * PasswordInput
 * ----------------------------------------------------------------------- */

function passwordStrength(value: string): { score: number; label: string } {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  score = Math.min(4, score);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] ?? "" };
}

export const PasswordInput: ComponentSpec = {
  name: "PasswordInput",
  description:
    "Password input with a show/hide toggle and an optional strength " +
    "meter. Pass a `$variable` as `value` for two-way binding. Set " +
    "`strengthMeter=true` to render a 4-step indicator and label.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "strengthMeter", type: "boolean", optional: true },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const visibleSlot = helpers.useInstanceState<boolean>("visible", false);
    const visible = visibleSlot.get();
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-password-input", "data-disabled": disabled ? "true" : "false" });
    const row = el("div", { class: "rui-password-input-row" });
    const input = el("input", {
      type: visible ? "text" : "password",
      class: "rui-password-input-field",
      id,
      name: id,
      autocomplete: "current-password",
      placeholder: asString(props.placeholder),
      value: asString(props.value),
      disabled: disabled ? "" : null,
    }) as HTMLInputElement;
    const toggleBtn = el("button", {
      type: "button",
      class: "rui-password-input-toggle",
      "aria-label": visible ? "Hide password" : "Show password",
    });
    const toggleIcon = renderIcon(visible ? "eye-slash" : "eye");
    if (toggleIcon) toggleBtn.append(toggleIcon);
    toggleBtn.onclick = (event) => {
      event.preventDefault();
      const next = !visibleSlot.get();
      visibleSlot.set(next);
      const target = event.currentTarget as Element;
      const live = target.closest(".rui-password-input");
      const liveInput = live?.querySelector<HTMLInputElement>(".rui-password-input-field");
      if (liveInput) liveInput.type = next ? "text" : "password";
    };
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => (n as HTMLInputElement).value,
      });
    }
    row.append(input);
    row.append(toggleBtn);
    root.append(row);
    if (asBoolean(props.strengthMeter)) {
      const strength = passwordStrength(asString(props.value));
      const meter = el("div", { class: "rui-password-input-strength", "data-score": String(strength.score) });
      for (let i = 0; i < 4; i += 1) {
        meter.append(el("span", {
          class: "rui-password-input-strength-bar",
          "data-filled": i < strength.score ? "true" : "false",
        }));
      }
      const labelRow = el("div", { class: "rui-password-input-strength-row" });
      labelRow.append(meter);
      if (strength.label) labelRow.append(el("span", { class: "rui-password-input-strength-label" }, [strength.label]));
      root.append(labelRow);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * TagInput
 * ----------------------------------------------------------------------- */

export const TagInput: ComponentSpec = {
  name: "TagInput",
  description:
    "Tag/chip input — type a value, press Enter (or comma) to commit, " +
    "click × on a chip to remove. Pass a `$variable` (array of strings) " +
    "as `value` for two-way binding. Use for keywords, recipients, " +
    "labels, skills, allowlists.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string[]", optional: true, description: "Bound array of tag values" },
    { name: "placeholder", type: "string", optional: true },
    { name: "max", type: "number", optional: true, description: "Maximum number of tags" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const tags = asArray<unknown>(props.value).map((v) => asString(v)).filter(Boolean);
    const max = Math.max(0, Math.floor(asNumber(props.max, 0)));
    const disabled = asBoolean(props.disabled);
    const stateName = node.argMeta?.[1]?.stateRef;
    const setTags = (next: string[]) => {
      if (!stateName) return;
      helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: stateName, value: next }] });
    };
    const root = el("div", {
      class: "rui-tag-input",
      "data-disabled": disabled ? "true" : "false",
    });
    for (const tag of tags) {
      const chip = el("span", { class: "rui-tag-input-chip" });
      chip.append(el("span", {}, [tag]));
      const remove = el("button", {
        type: "button",
        class: "rui-tag-input-remove",
        "aria-label": `Remove ${tag}`,
      }, ["×"]);
      remove.onclick = () => setTags(tags.filter((t) => t !== tag));
      chip.append(remove);
      root.append(chip);
    }
    const input = el("input", {
      type: "text",
      class: "rui-tag-input-field",
      id,
      name: id,
      placeholder: asString(props.placeholder, tags.length === 0 ? "Add tags…" : ""),
      disabled: disabled ? "" : null,
      autocomplete: "off",
    }) as HTMLInputElement;
    input.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        if (max > 0 && tags.length >= max) return;
        if (tags.includes(value)) {
          input.value = "";
          return;
        }
        setTags([...tags, value]);
        input.value = "";
      } else if (e.key === "Backspace" && input.value === "" && tags.length > 0) {
        e.preventDefault();
        setTags(tags.slice(0, -1));
      }
    };
    root.append(input);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * MentionInput
 * ----------------------------------------------------------------------- */

interface MentionItem {
  value: string;
  label: string;
}

function readMentionItems(raw: unknown): MentionItem[] {
  return asArray<unknown>(raw).map((entry) => {
    if (typeof entry === "string") return { value: entry, label: entry };
    if (entry && typeof entry === "object") {
      const r = entry as Record<string, unknown>;
      const value = asString(r.value ?? r.id ?? r.name);
      const label = asString(r.label, value);
      return { value, label };
    }
    return { value: "", label: "" };
  }).filter((i) => i.value);
}

export const MentionInput: ComponentSpec = {
  name: "MentionInput",
  description:
    "Multi-line input with inline @-mention suggestions. Typing `@` " +
    "opens a popover listing the provided `people` (filtered by what " +
    "follows). Selecting an option inserts `@label` into the text. Pass " +
    "a `$variable` as `value` for two-way binding. Use for comments, " +
    "task notes, chat composers.",
  props: [
    { name: "id", type: "string" },
    { name: "people", type: "any[]", description: "Available mentions: strings or {value, label} objects" },
    { name: "value", type: "string", optional: true, description: "Bound text (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "rows", type: "number", optional: true, description: "TextArea rows (default 3)" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const people = readMentionItems(props.people);
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-mention-input", "data-disabled": disabled ? "true" : "false" });
    const textarea = el("textarea", {
      class: "rui-mention-input-field",
      id,
      name: id,
      rows: String(Math.max(2, Math.floor(asNumber(props.rows, 3)))),
      placeholder: asString(props.placeholder, "Type @ to mention someone"),
      disabled: disabled ? "" : null,
    }) as HTMLTextAreaElement;
    textarea.value = asString(props.value);
    const stateName = node.argMeta?.[2]?.stateRef;
    if (stateName) {
      helpers.bindState(textarea, stateName, {
        event: "input",
        getValue: (n) => (n as HTMLTextAreaElement).value,
      });
    }
    const suggestions = el("div", { class: "rui-mention-input-suggestions", "data-open": "false" });
    const renderSuggestions = (query: string) => {
      suggestions.replaceChildren();
      const filtered = people.filter((p) => p.label.toLowerCase().includes(query.toLowerCase()));
      const slice = filtered.slice(0, 6);
      if (slice.length === 0) {
        suggestions.setAttribute("data-open", "false");
        return;
      }
      suggestions.setAttribute("data-open", "true");
      for (const item of slice) {
        const btn = el("button", {
          type: "button",
          class: "rui-mention-input-option",
          "data-value": item.value,
        }, [item.label]);
        btn.onmousedown = (event) => event.preventDefault();
        btn.onclick = () => {
          insertMention(item);
          suggestions.setAttribute("data-open", "false");
        };
        suggestions.append(btn);
      }
    };
    const insertMention = (item: MentionItem) => {
      const text = textarea.value;
      const caret = textarea.selectionStart;
      const before = text.slice(0, caret);
      const triggerIdx = before.lastIndexOf("@");
      if (triggerIdx === -1) return;
      const after = text.slice(caret);
      const insert = `@${item.label} `;
      const next = before.slice(0, triggerIdx) + insert + after;
      textarea.value = next;
      const cursor = triggerIdx + insert.length;
      textarea.selectionStart = textarea.selectionEnd = cursor;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    };
    textarea.oninput = () => {
      const caret = textarea.selectionStart;
      const before = textarea.value.slice(0, caret);
      const match = /@([\w-]*)$/.exec(before);
      if (match) renderSuggestions(match[1] ?? "");
      else suggestions.setAttribute("data-open", "false");
    };
    textarea.onblur = () => setTimeout(() => suggestions.setAttribute("data-open", "false"), 80);
    root.append(textarea);
    root.append(suggestions);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * TimePicker / DateTimePicker / MaskedInput
 * ----------------------------------------------------------------------- */

export const TimePicker: ComponentSpec = {
  name: "TimePicker",
  description:
    "Time-of-day picker that wraps `<input type=\"time\">`. Pass a " +
    "`$variable` as `value` for two-way binding (HH:MM 24-hour). Set " +
    "`step` to constrain to specific increments (e.g. 900 for 15-minute " +
    "buckets).",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "HH:MM value; typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true },
    { name: "max", type: "string", optional: true },
    { name: "step", type: "number", optional: true, description: "Seconds between selectable times" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("div", { class: "rui-time-picker" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-time-picker-label", for: id }, [label]));
    const input = el("input", {
      type: "time",
      class: "rui-time-picker-input",
      id,
      name: id,
      value: asString(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      step: props.step != null ? String(asNumber(props.step, 60)) : null,
      disabled: asBoolean(props.disabled) ? "" : null,
    });
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) helpers.bindState(input, stateName);
    root.append(input);
    return root;
  },
};

export const DateTimePicker: ComponentSpec = {
  name: "DateTimePicker",
  description:
    "Combined date + time picker — wraps `<input " +
    "type=\"datetime-local\">`. Pass a `$variable` as `value` for two-way " +
    "binding (ISO `YYYY-MM-DDTHH:MM`).",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "ISO date-time value; typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true },
    { name: "max", type: "string", optional: true },
    { name: "step", type: "number", optional: true, description: "Seconds between selectable times" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("div", { class: "rui-datetime-picker" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-datetime-picker-label", for: id }, [label]));
    const input = el("input", {
      type: "datetime-local",
      class: "rui-datetime-picker-input",
      id,
      name: id,
      value: asString(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      step: props.step != null ? String(asNumber(props.step, 60)) : null,
      disabled: asBoolean(props.disabled) ? "" : null,
    });
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) helpers.bindState(input, stateName);
    root.append(input);
    return root;
  },
};

function applyMask(value: string, mask: string): string {
  let out = "";
  let v = value;
  for (const ch of mask) {
    if (!v) break;
    if (ch === "9") {
      const m = /\d/.exec(v);
      if (!m) break;
      out += m[0];
      v = v.slice(v.indexOf(m[0]) + 1);
    } else if (ch === "A") {
      const m = /[a-zA-Z]/.exec(v);
      if (!m) break;
      out += m[0];
      v = v.slice(v.indexOf(m[0]) + 1);
    } else if (ch === "*") {
      out += v.charAt(0);
      v = v.slice(1);
    } else {
      out += ch;
      if (v.startsWith(ch)) v = v.slice(1);
    }
  }
  return out;
}

export const MaskedInput: ComponentSpec = {
  name: "MaskedInput",
  description:
    "Text input with an inline mask — `9` matches a digit, `A` matches a " +
    "letter, `*` matches any character, every other character is a " +
    "fixed delimiter. Useful for phone numbers, postal codes, credit " +
    "cards. Pass `mask` (e.g. `\"(999) 999-9999\"`) and a `$variable` " +
    "as `value`.",
  props: [
    { name: "id", type: "string" },
    { name: "mask", type: "string", description: "Mask pattern" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const mask = asString(props.mask);
    const disabled = asBoolean(props.disabled);
    const initial = applyMask(asString(props.value), mask);
    const input = el("input", {
      type: "text",
      class: "rui-masked-input",
      id,
      name: id,
      value: initial,
      placeholder: asString(props.placeholder, mask),
      disabled: disabled ? "" : null,
      autocomplete: "off",
    }) as HTMLInputElement;
    const stateName = node.argMeta?.[2]?.stateRef;
    input.oninput = () => {
      input.value = applyMask(input.value, mask);
    };
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => (n as HTMLInputElement).value,
      });
    }
    return input;
  },
};

/* ----------------------------------------------------------------------- *
 * FormSection / FieldSet / ValidationSummary
 * ----------------------------------------------------------------------- */

export const FormSection: ComponentSpec = {
  name: "FormSection",
  description:
    "Semantic grouping for related form fields — renders a small heading " +
    "(`label`), optional helper paragraph, and stacks the children with " +
    "consistent spacing. Use INSTEAD of wrapping fields in `Card` + " +
    "`SectionHeader` by hand. Pair with `FieldSet` when the group is a " +
    "true `<fieldset>` (radio sets, checkbox groups).",
  props: [
    { name: "label", type: "string" },
    { name: "children", type: "Node[]" },
    { name: "helper", type: "string", optional: true, description: "Description rendered below the label" },
  ],
  render: (_node, props, helpers) => {
    const root = el("section", { class: "rui-form-section" });
    const header = el("header", { class: "rui-form-section-header" });
    header.append(el("h3", { class: "rui-form-section-label" }, [asString(props.label)]));
    const helper = asString(props.helper);
    if (helper) header.append(el("p", { class: "rui-form-section-helper" }, [helper]));
    root.append(header);
    const body = el("div", { class: "rui-form-section-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    root.append(body);
    return root;
  },
};

export const FieldSet: ComponentSpec = {
  name: "FieldSet",
  description:
    "Native `<fieldset>`/`<legend>` wrapper for accessible grouping of " +
    "related controls. Use when assistive tech should announce the " +
    "wrapper (radio sets, checkbox groups). For purely visual grouping " +
    "prefer `FormSection`.",
  props: [
    { name: "legend", type: "string" },
    { name: "children", type: "Node[]" },
    { name: "helper", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("fieldset", {
      class: "rui-fieldset",
      disabled: asBoolean(props.disabled) ? "" : null,
    });
    root.append(el("legend", { class: "rui-fieldset-legend" }, [asString(props.legend)]));
    const helper = asString(props.helper);
    if (helper) root.append(el("p", { class: "rui-fieldset-helper" }, [helper]));
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const ValidationSummary: ComponentSpec = {
  name: "ValidationSummary",
  description:
    "Aggregate error list rendered at the top of a form. Pass `errors` " +
    "as `{label?, message, field?}` objects or plain strings. Pair with " +
    "individual field hints via `FormControl(hint=...)`.",
  props: [
    { name: "errors", type: "any[]" },
    { name: "title", type: "string", optional: true, description: "Heading (default \"Please fix the following:\")" },
    { name: "tone", type: "string", optional: true, enum: ["danger", "warning"] },
  ],
  render: (_node, props) => {
    const errors = asArray<unknown>(props.errors)
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === "string") return { label: "", message: entry, field: "" };
        if (typeof entry === "object") {
          const r = entry as Record<string, unknown>;
          return {
            label: asString(r.label),
            message: asString(r.message ?? r.error),
            field: asString(r.field),
          };
        }
        return null;
      })
      .filter((e): e is { label: string; message: string; field: string } => e !== null && e.message !== "");
    if (errors.length === 0) {
      return el("div", { class: "rui-validation-summary", "data-empty": "true", hidden: "" });
    }
    const tone = asString(props.tone, "danger");
    const root = el("aside", {
      class: "rui-validation-summary",
      "data-tone": tone,
      role: "alert",
    });
    const titleNode = el("div", { class: "rui-validation-summary-title" });
    const iconNode = renderIcon(tone === "warning" ? "triangle-exclamation" : "circle-xmark", { className: "rui-validation-summary-icon" });
    if (iconNode) titleNode.append(iconNode);
    titleNode.append(document.createTextNode(asString(props.title, "Please fix the following:")));
    root.append(titleNode);
    const list = el("ul", { class: "rui-validation-summary-list" });
    for (const err of errors) {
      const li = el("li", { class: "rui-validation-summary-item" });
      if (err.label) li.append(el("strong", {}, [`${err.label}: `]));
      li.append(document.createTextNode(err.message));
      list.append(li);
    }
    root.append(list);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * MultiStepForm
 * ----------------------------------------------------------------------- */

interface MultiStepFormStep {
  title: string;
  details: string;
  content: unknown;
}

function readSteps(raw: unknown): MultiStepFormStep[] {
  return asArray<unknown>(raw).map((entry) => {
    if (!entry || typeof entry !== "object") {
      return { title: asString(entry), details: "", content: null };
    }
    const r = entry as Record<string, unknown>;
    return {
      title: asString(r.title),
      details: asString(r.details),
      content: r.content ?? null,
    };
  });
}

export const MultiStepForm: ComponentSpec = {
  name: "MultiStepForm",
  description:
    "Multi-step / wizard form composite. Renders a `Steps` indicator, " +
    "the active step's `content`, and Prev/Next buttons that drive a " +
    "`$variable` for the current 0-indexed step. Use INSTEAD of " +
    "hand-rolling `Steps` + content + manual prev/next wiring. The " +
    "submit button is rendered on the final step (override via " +
    "`submitLabel`).",
  props: [
    { name: "steps", type: "object[]", description: "Array of {title, details?, content} step objects" },
    { name: "current", type: "number", description: "0-indexed active step — bind a $variable" },
    { name: "onSubmit", type: "Action", optional: true, description: "Action fired when the user clicks Submit on the final step" },
    { name: "prevLabel", type: "string", optional: true, description: "Default \"Back\"" },
    { name: "nextLabel", type: "string", optional: true, description: "Default \"Continue\"" },
    { name: "submitLabel", type: "string", optional: true, description: "Default \"Submit\" (final step)" },
  ],
  render: (node, props, helpers) => {
    const steps = readSteps(props.steps);
    const total = steps.length;
    const current = Math.max(0, Math.min(total - 1, Math.floor(asNumber(props.current, 0))));
    const stateName = node.argMeta?.[1]?.stateRef;
    const root = el("div", { class: "rui-multi-step-form" });
    const stepsEl = el("ol", { class: "rui-steps rui-multi-step-form-steps" });
    steps.forEach((step, idx) => {
      const li = el("li", {
        class: "rui-steps-item",
        "data-active": idx === current ? "true" : "false",
        "data-complete": idx < current ? "true" : "false",
      });
      li.append(el("div", { class: "rui-steps-title" }, [step.title || `Step ${idx + 1}`]));
      if (step.details) li.append(el("div", { class: "rui-steps-details" }, [step.details]));
      stepsEl.append(li);
    });
    root.append(stepsEl);
    const body = el("div", { class: "rui-multi-step-form-body" });
    const active = steps[current];
    if (active && active.content) {
      body.append(helpers.renderNode(active.content));
    }
    root.append(body);
    const footer = el("div", { class: "rui-multi-step-form-footer" });
    const prevBtn = el("button", {
      type: "button",
      class: "rui-button",
      "data-variant": "ghost",
      disabled: current <= 0 ? "" : null,
    }, [asString(props.prevLabel, "Back")]);
    if (stateName && current > 0) {
      prevBtn.onclick = () => {
        helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: stateName, value: current - 1 }] });
      };
    }
    const isFinal = current >= total - 1;
    const nextLabel = isFinal ? asString(props.submitLabel, "Submit") : asString(props.nextLabel, "Continue");
    const nextBtn = el("button", {
      type: "button",
      class: "rui-button",
      "data-variant": "primary",
    }, [nextLabel]);
    nextBtn.onclick = () => {
      if (isFinal) {
        if (isActionPayload(props.onSubmit)) helpers.runAction(props.onSubmit);
      } else if (stateName) {
        helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: stateName, value: current + 1 }] });
      }
    };
    footer.append(prevBtn);
    footer.append(el("span", { class: "rui-multi-step-form-progress" }, [`${current + 1} / ${total}`]));
    footer.append(nextBtn);
    root.append(footer);
    return root;
  },
};
