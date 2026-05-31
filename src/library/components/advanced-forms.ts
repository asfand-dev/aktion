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
import { el, asArray, asString, asBoolean, asNumber, renderIcon } from "../utils.js";
import { attachOnChange } from "./wrappers.js";

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
  const getLiveSlots = (origin: Element): HTMLInputElement[] => {
    const pinRoot = origin.closest(".rui-pin-input");
    if (!pinRoot) return inputs;
    return Array.from(pinRoot.querySelectorAll<HTMLInputElement>(".rui-pin-input-slot"));
  };
  const collectLive = (origin: Element): string => {
    return getLiveSlots(origin).map((i) => i.value).join("").slice(0, length);
  };
  inputs.forEach((input, idx) => {
    input.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      const liveSlots = getLiveSlots(target);
      let v = target.value;
      if (type === "numeric") v = v.replace(/\D/g, "");
      else v = v.replace(/[^A-Za-z0-9]/g, "");
      if (v.length > 1) {
        const chars = v.split("");
        chars.slice(0, length - idx).forEach((c, k) => {
          const next = liveSlots[idx + k];
          if (next) next.value = c;
        });
        const lastFilled = Math.min(idx + chars.length, length - 1);
        liveSlots[lastFilled]?.focus();
      } else {
        target.value = v;
        if (v && idx < length - 1) liveSlots[idx + 1]?.focus();
      }
      onChange?.(collectLive(target));
    };
    input.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const target = e.currentTarget as HTMLInputElement;
      const liveSlots = getLiveSlots(target);
      if (e.key === "Backspace" && !target.value && idx > 0) {
        e.preventDefault();
        liveSlots[idx - 1]?.focus();
        const prev = liveSlots[idx - 1];
        if (prev) prev.value = "";
        onChange?.(collectLive(target));
      } else if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        liveSlots[idx - 1]?.focus();
      } else if (e.key === "ArrowRight" && idx < length - 1) {
        e.preventDefault();
        liveSlots[idx + 1]?.focus();
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
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current joined string on every keystroke" },
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
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
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
    { name: "label", type: "string", optional: true, description: "Inline label above the field" },
    { name: "strengthMeter", type: "boolean", optional: true, aliases: ["showStrength"] },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const visibleSlot = helpers.useInstanceState<boolean>("visible", false);
    const visible = visibleSlot.get();
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-password-input", "data-disabled": disabled ? "true" : "false" });
    const labelText = asString(props.label);
    if (labelText) {
      root.append(el("label", { class: "rui-password-input-label", for: id }, [labelText]));
    }
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
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLInputElement).value,
    });
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
    { name: "label", type: "string", optional: true, description: "Inline label above the field" },
    { name: "max", type: "number", optional: true, description: "Maximum number of tags" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated array of tags whenever one is added or removed" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const tags = asArray<unknown>(props.value).map((v) => asString(v)).filter(Boolean);
    const max = Math.max(0, Math.floor(asNumber(props.max, 0)));
    const disabled = asBoolean(props.disabled);
    const stateName = node.argMeta?.[1]?.stateRef;
    const setTags = (next: string[]) => {
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
    };
    const labelText = asString(props.label);
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
      // Read the value from the *live* input — morph keeps the previously
      // mounted DOM node, so the closure-captured `input` reference points
      // at the freshly rendered (detached) field and its `.value` is empty.
      const liveInput = e.currentTarget as HTMLInputElement;
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const value = liveInput.value.trim();
        if (!value) return;
        if (max > 0 && tags.length >= max) return;
        if (tags.includes(value)) {
          liveInput.value = "";
          return;
        }
        setTags([...tags, value]);
        liveInput.value = "";
      } else if (e.key === "Backspace" && liveInput.value === "" && tags.length > 0) {
        e.preventDefault();
        setTags(tags.slice(0, -1));
      }
    };
    root.append(input);
    if (labelText) {
      const wrapper = el("div", { class: "rui-tag-input-wrapper" });
      wrapper.append(el("label", { class: "rui-tag-input-label", for: id }, [labelText]));
      wrapper.append(root);
      return wrapper;
    }
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
      // Accept `{name}`, `{label}`, `{value}`, or `{id}` plus a `handle`
      // for tagging (e.g. `@ada` vs full name "Ada Lovelace").
      const display = asString(r.label ?? r.name ?? r.value ?? r.id);
      const handle = asString(r.handle ?? r.value ?? r.id ?? r.name ?? r.label);
      return { value: handle, label: display };
    }
    return { value: "", label: "" };
  }).filter((i) => i.value || i.label);
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
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current text on every keystroke" },
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
    const suggestions = el("div", { class: "rui-mention-input-suggestions", "data-open": "false" });

    // Per-instance UI state survives re-renders triggered by two-way
    // binding. The fresh render must reproduce the open state on the
    // freshly-built suggestions panel so morph doesn't reset the live
    // panel back to "closed" when it copies attributes/children over.
    const activeSlot = helpers.useInstanceState<number>("activeIndex", 0);
    const matchesSlot = helpers.useInstanceState<MentionItem[]>("matches", []);
    const querySlot = helpers.useInstanceState<string | null>("query", null);

    const liveSuggestionsFor = (origin: Element): HTMLElement | null => {
      const root = origin.closest(".rui-mention-input");
      return root?.querySelector<HTMLElement>(".rui-mention-input-suggestions") ?? null;
    };

    const liveTextareaFor = (origin: Element): HTMLTextAreaElement | null => {
      const root = origin.closest(".rui-mention-input");
      return root?.querySelector<HTMLTextAreaElement>(".rui-mention-input-field") ?? null;
    };

    const insertMention = (liveTextarea: HTMLTextAreaElement, item: MentionItem) => {
      const text = liveTextarea.value;
      const caret = liveTextarea.selectionStart ?? text.length;
      const before = text.slice(0, caret);
      const triggerIdx = before.lastIndexOf("@");
      if (triggerIdx === -1) return;
      const after = text.slice(caret);
      const insert = `@${item.value} `;
      const next = before.slice(0, triggerIdx) + insert + after;
      liveTextarea.value = next;
      const cursor = triggerIdx + insert.length;
      liveTextarea.selectionStart = liveTextarea.selectionEnd = cursor;
      liveTextarea.dispatchEvent(new Event("input", { bubbles: true }));
      liveTextarea.focus();
    };

    const paintSuggestions = (panel: HTMLElement, query: string | null) => {
      panel.replaceChildren();
      if (query === null) {
        panel.setAttribute("data-open", "false");
        matchesSlot.set([]);
        return;
      }
      const q = query.toLowerCase();
      const filtered = people.filter((p) =>
        p.label.toLowerCase().includes(q) || p.value.toLowerCase().includes(q),
      );
      const slice = filtered.slice(0, 6);
      matchesSlot.set(slice);
      if (slice.length === 0) {
        panel.setAttribute("data-open", "false");
        return;
      }
      const nextActive = Math.min(activeSlot.get(), slice.length - 1);
      activeSlot.set(nextActive);
      panel.setAttribute("data-open", "true");
      slice.forEach((item, idx) => {
        const btn = el("button", {
          type: "button",
          class: "rui-mention-input-option",
          "data-value": item.value,
          "data-active": idx === nextActive ? "true" : "false",
        });
        btn.append(el("span", { class: "rui-mention-input-option-label" }, [item.label]));
        if (item.value && item.value !== item.label) {
          btn.append(el("span", { class: "rui-mention-input-option-handle" }, [`@${item.value}`]));
        }
        btn.onmousedown = (event) => event.preventDefault();
        btn.onclick = (event) => {
          const origin = event.currentTarget as Element;
          const ta = liveTextareaFor(origin);
          const live = liveSuggestionsFor(origin);
          if (ta) insertMention(ta, item);
          querySlot.set(null);
          if (live) paintSuggestions(live, null);
        };
        panel.append(btn);
      });
    };

    const updateFromCaret = (liveTextarea: HTMLTextAreaElement) => {
      const live = liveSuggestionsFor(liveTextarea);
      if (!live) return;
      const caret = liveTextarea.selectionStart ?? liveTextarea.value.length;
      const before = liveTextarea.value.slice(0, caret);
      const match = /@([\w-]*)$/.exec(before);
      const nextQuery = match ? match[1] ?? "" : null;
      querySlot.set(nextQuery);
      paintSuggestions(live, nextQuery);
    };

    const stateName = node.argMeta?.[2]?.stateRef;
    if (stateName) {
      // bindState overwrites `oninput`, so we piggyback the suggestion
      // update onto `getValue` (called by the renderer's listener with
      // the live currentTarget).
      helpers.bindState(textarea, stateName, {
        event: "input",
        getValue: (n) => {
          const ta = n as HTMLTextAreaElement;
          updateFromCaret(ta);
          return ta.value;
        },
      });
    } else {
      textarea.oninput = (event) => {
        updateFromCaret(event.currentTarget as HTMLTextAreaElement);
      };
    }
    attachOnChange(textarea, props.onChange, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLTextAreaElement).value,
    });
    textarea.onkeydown = (event) => {
      const ta = event.currentTarget as HTMLTextAreaElement;
      const live = liveSuggestionsFor(ta);
      if (!live || live.getAttribute("data-open") !== "true") return;
      const matches = matchesSlot.get();
      if (matches.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = (activeSlot.get() + 1) % matches.length;
        activeSlot.set(next);
        const items = live.querySelectorAll<HTMLElement>(".rui-mention-input-option");
        items.forEach((b, i) => b.setAttribute("data-active", i === next ? "true" : "false"));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = (activeSlot.get() - 1 + matches.length) % matches.length;
        activeSlot.set(next);
        const items = live.querySelectorAll<HTMLElement>(".rui-mention-input-option");
        items.forEach((b, i) => b.setAttribute("data-active", i === next ? "true" : "false"));
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const chosen = matches[activeSlot.get()];
        if (chosen) {
          insertMention(ta, chosen);
          querySlot.set(null);
          paintSuggestions(live, null);
        }
      } else if (event.key === "Escape") {
        querySlot.set(null);
        paintSuggestions(live, null);
      }
    };
    textarea.onblur = (event) => {
      const ta = event.currentTarget as HTMLTextAreaElement;
      setTimeout(() => {
        const live = liveSuggestionsFor(ta);
        querySlot.set(null);
        if (live) paintSuggestions(live, null);
      }, 120);
    };
    root.append(textarea);
    root.append(suggestions);
    // Reproduce the persisted open/query state on this freshly-built
    // panel so morph keeps the live popover open across re-renders.
    paintSuggestions(suggestions, querySlot.get());
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
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new HH:MM string when the user picks a time" },
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
    }) as HTMLInputElement;
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) helpers.bindState(input, stateName);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).value,
    });
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
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new ISO `YYYY-MM-DDTHH:MM` string" },
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
    }) as HTMLInputElement;
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) helpers.bindState(input, stateName);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    root.append(input);
    return root;
  },
};

/**
 * Mask tokens:
 *   - `9` matches a single digit
 *   - `A` matches a single alpha character
 *   - `*` matches any single character
 *   - Any other character is a fixed delimiter inserted automatically
 *
 * Behavior: the raw value is stripped of all non-token-matching characters
 * for each placeholder; fixed delimiters are inserted between tokens as the
 * user types. This produces the expected progressive formatting (e.g. typing
 * `4155550114` into a `(999) 999-9999` mask becomes `(415) 555-0114`).
 */
function applyMask(value: string, mask: string): string {
  if (!mask) return value;
  let out = "";
  let i = 0;
  const v = String(value ?? "");
  for (const ch of mask) {
    if (i >= v.length) break;
    if (ch === "9") {
      while (i < v.length && !/\d/.test(v[i] ?? "")) i += 1;
      if (i >= v.length) break;
      out += v[i];
      i += 1;
    } else if (ch === "A") {
      while (i < v.length && !/[a-zA-Z]/.test(v[i] ?? "")) i += 1;
      if (i >= v.length) break;
      out += v[i];
      i += 1;
    } else if (ch === "*") {
      out += v[i];
      i += 1;
    } else {
      out += ch;
      if (v[i] === ch) i += 1;
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
    { name: "label", type: "string", optional: true, description: "Inline label above the field" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the masked value on every keystroke" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const mask = asString(props.mask);
    const disabled = asBoolean(props.disabled);
    const initial = applyMask(asString(props.value), mask);
    const labelText = asString(props.label);
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
    input.value = initial;
    const stateName = node.argMeta?.[2]?.stateRef;
    // Apply the mask in place and keep the caret near the user's edit
    // position. We use a property-based `oninput` so the morph reconciler
    // can transfer it to a kept DOM node across re-renders.
    const formatInPlace = (target: HTMLInputElement) => {
      const before = target.value;
      const masked = applyMask(before, mask);
      if (masked === before) return masked;
      const caret = target.selectionStart ?? masked.length;
      target.value = masked;
      const newPos = Math.min(masked.length, caret);
      try { target.setSelectionRange(newPos, newPos); } catch { /* ignore */ }
      return masked;
    };
    if (stateName) {
      // bindState overwrites `oninput`, so we mask inside `getValue`
      // (which the renderer's listener calls every time the input fires).
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => formatInPlace(n as HTMLInputElement),
      });
    } else {
      input.oninput = (event) => {
        formatInPlace((event.currentTarget ?? event.target) as HTMLInputElement);
      };
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    if (labelText) {
      const wrapper = el("div", { class: "rui-masked-input-wrapper" });
      wrapper.append(el("label", { class: "rui-masked-input-label", for: id }, [labelText]));
      wrapper.append(input);
      return wrapper;
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
    { name: "label", type: "string", aliases: ["title"] },
    { name: "children", type: "Node[]", aliases: ["fields"] },
    { name: "helper", type: "string", optional: true, aliases: ["description"], description: "Description rendered below the label" },
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
    { name: "legend", type: "string", aliases: ["title", "label"] },
    { name: "children", type: "Node[]", aliases: ["fields"] },
    { name: "helper", type: "string", optional: true, aliases: ["hint", "description"] },
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
    "`submitLabel`). Step indicator direction defaults to `column` " +
    "(stacked next to the content); set `stepsLayout: \"row\"` for a " +
    "classic horizontal stepper.",
  props: [
    { name: "steps", type: "object[]", description: "Array of {title, details?, content} step objects" },
    { name: "current", type: "number", description: "0-indexed active step — bind a $variable" },
    { name: "onSubmit", type: "callable", optional: true, description: "Callable fired when the user clicks Submit on the final step" },
    { name: "prevLabel", type: "string", optional: true, description: "Default \"Back\"" },
    { name: "nextLabel", type: "string", optional: true, description: "Default \"Continue\"" },
    { name: "submitLabel", type: "string", optional: true, description: "Default \"Submit\" (final step)" },
    { name: "stepsLayout", type: "string", optional: true, enum: ["column", "row"], aliases: ["layout", "stepsDirection"], description: "Direction of the steps indicator (default \"column\")" },
  ],
  render: (node, props, helpers) => {
    const steps = readSteps(props.steps);
    const total = steps.length;
    const current = Math.max(0, Math.min(total - 1, Math.floor(asNumber(props.current, 0))));
    const stateName = node.argMeta?.[1]?.stateRef;
    const layoutToken = asString(props.stepsLayout, "column").toLowerCase();
    const layout = layoutToken === "row" || layoutToken === "horizontal" ? "row" : "column";
    const root = el("div", {
      class: "rui-multi-step-form",
      "data-layout": layout,
    });
    const stepsEl = el("ol", {
      class: "rui-steps rui-multi-step-form-steps",
      "data-layout": layout,
    });
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
      prevBtn.onclick = () => helpers.setState(stateName, current - 1);
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
        helpers.invoke(props.onSubmit);
      } else if (stateName) {
        helpers.setState(stateName, current + 1);
      }
    };
    footer.append(prevBtn);
    footer.append(el("span", { class: "rui-multi-step-form-progress" }, [`${current + 1} / ${total}`]));
    footer.append(nextBtn);
    root.append(footer);
    return root;
  },
};
