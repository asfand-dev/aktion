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
import {
  autoId,
  el, asArray, asString, asBoolean, asNumber, renderIcon, valueAttr, sanitiseHref,
} from "../utils.js";
import { attachOnChange } from "./wrappers.js";
import { FIELD_SHELL_PROPS, withFieldShell, attachFocusHandlers } from "./forms-shared.js";
import { closeFloating, deferToPaint, openFloating } from "../floating.js";

const PIN_TYPES = ["numeric", "alphanumeric"] as const;

/* ----------------------------------------------------------------------- *
 * Shared helpers
 * ----------------------------------------------------------------------- */



/**
 * `withFieldShell` writes `required` / `aria-invalid` / `aria-describedby` onto
 * the node it is handed. A composite hands it the *wrapper* (so chips, slots,
 * toggles and meters stay inside the field), where those attributes are inert —
 * so move them onto the element that actually takes focus.
 *
 * `native: false` downgrades `required` to `aria-required`, which is what a
 * grouped control needs: a TagInput holding chips is satisfied even when its
 * text field is empty, so asserting native `required` there would block submit
 * on a perfectly valid field.
 */
function forwardFieldAria(
  wrapper: HTMLElement,
  control: HTMLElement,
  options: { native?: boolean } = {},
): void {
  for (const attr of ["aria-invalid", "aria-describedby"]) {
    const value = wrapper.getAttribute(attr);
    if (value === null) continue;
    wrapper.removeAttribute(attr);
    control.setAttribute(attr, value);
  }
  if (!wrapper.hasAttribute("required")) return;
  wrapper.removeAttribute("required");
  if (options.native === false) control.setAttribute("aria-required", "true");
  else control.setAttribute("required", "");
}

/**
 * `step` on a temporal input must be a positive integer (or the literal
 * `"any"`). A `0`, negative or fractional value is discarded by the browser,
 * which silently falls back to 60-second granularity — so the author's
 * 15-minute buckets quietly did not apply.
 */
function stepAttr(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && raw.trim().toLowerCase() === "any") return "any";
  return String(Math.max(1, Math.floor(asNumber(raw, 60))));
}

/* ----------------------------------------------------------------------- *
 * PinInput / OtpInput
 * ----------------------------------------------------------------------- */

/** Pad/trim a per-slot character array to exactly `length` entries. */
function padSlots(chars: readonly string[], length: number): string[] {
  const out = chars.slice(0, length).map((c) => c.slice(0, 1));
  while (out.length < length) out.push("");
  return out;
}

interface PinOptions {
  id: string;
  length: number;
  type: string;
  /** One entry per slot, empty string for a gap. */
  chars: readonly string[];
  disabled: boolean;
  mask: boolean;
  groupLabel: string;
  onSlots: (slots: string[]) => void;
  onFocusChange?: (kind: "focus" | "blur", slots: string[]) => void;
}

function renderPin(opts: PinOptions): HTMLElement {
  const { id, length, type, chars, disabled, mask, groupLabel, onSlots, onFocusChange } = opts;
  const alphanumeric = type === "alphanumeric";
  const root = el("div", {
    class: "rui-pin-input",
    "data-disabled": disabled ? "true" : "false",
    // The slots only make sense as a set: without group semantics a screen
    // reader announced "edit text" eight times with no name for the code.
    role: "group",
    "aria-label": groupLabel || (alphanumeric ? `${length}-character code` : `${length}-digit code`),
  });
  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < length; i += 1) {
    const input = el("input", {
      class: "rui-pin-input-slot",
      id: i === 0 ? id : null,
      // Deliberately NO `maxlength="1"`: browsers apply it to pastes too, so a
      // pasted SMS code was truncated to its first character — the single
      // most-used interaction on a 2FA screen. The multi-character branch in
      // `oninput` distributes the extra characters across the following slots
      // and trims each slot back to one, so the cap is still enforced.
      autocomplete: "one-time-code",
      inputmode: alphanumeric ? "text" : "numeric",
      type: mask ? "password" : "text",
      "aria-label": alphanumeric ? `Character ${i + 1} of ${length}` : `Digit ${i + 1} of ${length}`,
      // Asserting the value on every render is deliberate here: the slot array
      // (gaps included) is the component's model, and re-asserting it is what
      // restores a cleared middle slot in the right box.
      value: chars[i] ?? "",
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
  /**
   * Read the live slots *positionally*. The previous model joined them into a
   * string, which dropped the gaps: clearing slot 2 of `1 2 3 4` produced
   * `"134"`, and the next render re-distributed that by character index, so the
   * user watched their `3` and `4` jump one box to the left.
   */
  const collectLive = (origin: Element): string[] =>
    padSlots(getLiveSlots(origin).map((slot) => slot.value), length);
  inputs.forEach((input, idx) => {
    input.oninput = (event) => {
      const target = (event.currentTarget ?? event.target) as HTMLInputElement;
      const liveSlots = getLiveSlots(target);
      let v = target.value;
      if (type === "numeric") v = v.replace(/\D/g, "");
      else v = v.replace(/[^A-Za-z0-9]/g, "");
      if (v.length > 1) {
        // Paste (or a fast multi-character insert): spread over the slots.
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
      onSlots(collectLive(target));
    };
    input.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const target = e.currentTarget as HTMLInputElement;
      const liveSlots = getLiveSlots(target);
      if (e.key === "Backspace" && !target.value && idx > 0) {
        e.preventDefault();
        const prev = liveSlots[idx - 1];
        if (prev) {
          prev.value = "";
          prev.focus();
        }
        onSlots(collectLive(target));
      } else if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        liveSlots[idx - 1]?.focus();
      } else if (e.key === "ArrowRight" && idx < length - 1) {
        e.preventDefault();
        liveSlots[idx + 1]?.focus();
      }
    };
    if (!onFocusChange) return;
    // A PIN is one field to the author, so `onFocus`/`onBlur` must describe the
    // GROUP: moving between slots is not a blur.
    const leftTheGroup = (e: FocusEvent): boolean => {
      const origin = (e.currentTarget ?? e.target) as HTMLElement;
      const group = origin.closest(".rui-pin-input");
      const other = e.relatedTarget as Node | null;
      return !(other && group?.contains(other));
    };
    input.onblur = (event) => {
      const e = event as FocusEvent;
      if (!leftTheGroup(e)) return;
      onFocusChange("blur", collectLive((e.currentTarget ?? e.target) as HTMLElement));
    };
    input.onfocus = (event) => {
      const e = event as FocusEvent;
      if (!leftTheGroup(e)) return;
      onFocusChange("focus", collectLive((e.currentTarget ?? e.target) as HTMLElement));
    };
  });
  return root;
}

export const PinInput: ComponentSpec = {
  name: "PinInput",
  description:
    "Per-digit PIN entry. Auto-advances focus as the user types and " +
    "supports pasting a whole code into any slot. Pass a `$variable` as " +
    "`value` for two-way binding (the bound value is the joined string). " +
    "Use `type=\"numeric\"` for PINs / 2FA codes, `\"alphanumeric\"` for " +
    "invite codes. `onComplete` fires once every slot is filled (auto-submit " +
    "hook); pass `label`/`hint`/`error` for the labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "length", type: "number", optional: true, description: "Number of slots (default 4)" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "type", type: "string", optional: true, enum: PIN_TYPES },
    { name: "mask", type: "boolean", optional: true, description: "Render slots as `<input type=password>`" },
    { name: "autoFocus", type: "boolean", optional: true, aliases: ["autofocus"], description: "Focus the first slot on mount" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current joined string on every keystroke" },
    { name: "onComplete", type: "callable", optional: true, aliases: ["oncomplete"], description: "Called with the code once every slot is filled" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id) || autoId(helpers, "rui-pin-input");
    const length = Math.max(1, Math.min(12, Math.floor(asNumber(props.length, 4))));
    const type = asString(props.type, "numeric");
    const value = asString(props.value);
    const disabled = asBoolean(props.disabled);
    const mask = asBoolean(props.mask);
    const stateName = node.argMeta?.[2]?.stateRef;
    const slotsSlot = helpers.useInstanceState<string[]>("slots", []);
    const stored = slotsSlot.get();
    // The per-slot array wins whenever it still describes the bound value (it
    // additionally knows *where* the gaps are). An absent `value` prop asserts
    // nothing, so the typed characters survive an unrelated re-render; a
    // programmatic write to the $variable re-distributes positionally.
    const asserted = props.value !== null && props.value !== undefined;
    const inSync = stored.length === length && stored.join("") === value;
    const chars = !asserted || inSync
      ? padSlots(stored, length)
      : padSlots(value.split(""), length);

    const root = renderPin({
      id,
      length,
      type,
      chars,
      disabled,
      mask,
      groupLabel: asString(props.label),
      onSlots: (slots) => {
        slotsSlot.set(slots);
        const joined = slots.join("");
        if (stateName) helpers.setState(stateName, joined);
        helpers.invoke(props.onChange, joined);
        // Only a genuinely full code completes — a gap keeps `joined` short.
        if (joined.length === length) helpers.invoke(props.onComplete, joined);
      },
      onFocusChange: props.onBlur != null || props.onFocus != null
        ? (kind, slots) => {
          helpers.invoke(kind === "blur" ? props.onBlur : props.onFocus, slots.join(""));
        }
        : undefined,
    });

    const autoFocusedSlot = helpers.useInstanceState<boolean>("autoFocused", false);
    if (asBoolean(props.autoFocus) && !disabled && !autoFocusedSlot.get()) {
      // `render` returns a detached tree. Only the paint that actually lands in
      // the document may steal focus — a re-render's discarded snapshot must
      // not, hence the `isConnected` guard.
      deferToPaint(() => {
        if (!root.isConnected || autoFocusedSlot.get()) return;
        const first = root.querySelector<HTMLInputElement>(".rui-pin-input-slot");
        if (!first) return;
        autoFocusedSlot.set(true);
        first.focus();
      });
    }

    const shell = withFieldShell(root, { ...props, id });
    // `required` is meaningless on the group element and wrong on a single slot.
    forwardFieldAria(root, root, { native: false });
    return shell;
  },
};

/* ----------------------------------------------------------------------- *
 * PasswordInput
 * ----------------------------------------------------------------------- */

const PASSWORD_AUTOCOMPLETE = ["current-password", "new-password", "off"] as const;

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
    "`strengthMeter=true` to render a 4-step indicator and label. Use " +
    "`autocomplete=\"new-password\"` on sign-up / reset forms so the browser " +
    "offers a generated password. Pass `label`/`hint`/`error`/`required` for " +
    "the labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "strengthMeter", type: "boolean", optional: true, aliases: ["showStrength"] },
    { name: "autocomplete", type: "string", optional: true, enum: PASSWORD_AUTOCOMPLETE, description: "Password-manager hint (default \"current-password\")" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id) || autoId(helpers, "rui-password-input");
    const visibleSlot = helpers.useInstanceState<boolean>("visible", false);
    const visible = visibleSlot.get();
    const disabled = asBoolean(props.disabled);
    const showStrength = asBoolean(props.strengthMeter);
    const root = el("div", { class: "rui-password-input", "data-disabled": disabled ? "true" : "false" });
    const row = el("div", { class: "rui-password-input-row" });
    const input = el("input", {
      type: visible ? "text" : "password",
      class: "rui-password-input-field",
      id,
      name: asString(props.name, id),
      autocomplete: asString(props.autocomplete, "current-password"),
      placeholder: asString(props.placeholder),
      // `valueAttr`, not `asString`: an absent prop must emit no attribute at
      // all, otherwise morph reads `value=""` as a deliberate clear and wipes
      // whatever the user typed on the next re-render from anywhere.
      value: valueAttr(props.value),
      disabled: disabled ? "" : null,
    }) as HTMLInputElement;
    const toggleBtn = el("button", {
      type: "button",
      class: "rui-password-input-toggle",
      "aria-label": visible ? "Hide password" : "Show password",
      "aria-pressed": visible ? "true" : "false",
      disabled: disabled ? "" : null,
    });
    const toggleIcon = renderIcon(visible ? "eye-slash" : "eye");
    if (toggleIcon) toggleBtn.append(toggleIcon);
    toggleBtn.onclick = (event) => {
      event.preventDefault();
      const next = !visibleSlot.get();
      visibleSlot.set(next);
      const btn = (event.currentTarget ?? event.target) as HTMLElement;
      const live = btn.closest(".rui-password-input");
      const liveInput = live?.querySelector<HTMLInputElement>(".rui-password-input-field");
      if (liveInput) liveInput.type = next ? "text" : "password";
      // `useInstanceState.set` does not schedule a render, so the button has to
      // repaint itself. Without this the eye glyph and the "Show password"
      // label stayed frozen at the first render's state — announcing "hidden"
      // over a plainly visible password, and inverting the next click.
      btn.setAttribute("aria-label", next ? "Hide password" : "Show password");
      btn.setAttribute("aria-pressed", next ? "true" : "false");
      const nextIcon = renderIcon(next ? "eye-slash" : "eye");
      if (nextIcon) {
        const currentIcon = btn.querySelector(".rui-icon");
        if (currentIcon) currentIcon.replaceWith(nextIcon);
        else btn.append(nextIcon);
      }
    };

    /**
     * Repaint the meter from the LIVE field.
     *
     * The score used to be derived from `props.value`, so an unbound
     * `PasswordInput(strengthMeter: true)` never left zero: nothing re-renders
     * it, and the render-time prop stays `undefined` however much the user
     * types.
     */
    const syncStrength = (origin: HTMLElement): void => {
      const live = origin.closest(".rui-password-input");
      const meterEl = live?.querySelector<HTMLElement>(".rui-password-input-strength");
      const field = live?.querySelector<HTMLInputElement>(".rui-password-input-field");
      if (!meterEl || !field) return;
      const next = passwordStrength(field.value);
      meterEl.setAttribute("data-score", String(next.score));
      meterEl.querySelectorAll<HTMLElement>(".rui-password-input-strength-bar").forEach((bar, i) => {
        bar.setAttribute("data-filled", i < next.score ? "true" : "false");
      });
      const labelEl = live?.querySelector<HTMLElement>(".rui-password-input-strength-label");
      if (labelEl) labelEl.textContent = next.label;
    };

    const stateName = node.argMeta?.[1]?.stateRef;
    // One property-based handler for state, `onChange` and the meter: morph
    // copies `oninput` onto the kept node, so the closure stays current.
    input.oninput = (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLInputElement;
      if (showStrength) syncStrength(live);
      if (stateName) helpers.setState(stateName, live.value);
      helpers.invoke(props.onChange, live.value);
    };
    attachFocusHandlers(input, props, helpers);
    row.append(input);
    row.append(toggleBtn);
    root.append(row);
    if (showStrength) {
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
      // Always present (even empty) so `syncStrength` has a node to write into.
      labelRow.append(el("span", { class: "rui-password-input-strength-label" }, [strength.label]));
      root.append(labelRow);
    }
    const shell = withFieldShell(root, { ...props, id });
    forwardFieldAria(root, input);
    return shell;
  },
};

/* ----------------------------------------------------------------------- *
 * TagInput
 * ----------------------------------------------------------------------- */

export const TagInput: ComponentSpec = {
  name: "TagInput",
  description:
    "Tag/chip input — type a value, press Enter (or comma) to commit, " +
    "click × on a chip to remove. Tabbing away commits the pending text " +
    "too. Pass a `$variable` (array of strings) as `value` for two-way " +
    "binding. Use for keywords, recipients, labels, skills, allowlists. " +
    "Pass `suggestions` for autocomplete and `label`/`hint`/`error` for the " +
    "labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string[]", optional: true, description: "Bound array of tag values" },
    { name: "placeholder", type: "string", optional: true },
    { name: "max", type: "number", optional: true, description: "Maximum number of tags" },
    { name: "suggestions", type: "any[]", optional: true, description: "Values offered as autocomplete while typing" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated array of tags whenever one is added or removed" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id) || autoId(helpers, "rui-tag-input");
    const tags = asArray<unknown>(props.value).map((v) => asString(v)).filter(Boolean);
    const max = Math.max(0, Math.floor(asNumber(props.max, 0)));
    const disabled = asBoolean(props.disabled);
    const stateName = node.argMeta?.[1]?.stateRef;
    // Uncommitted text lives in instance state: morph reads the rendered
    // `value` attribute as the desired value, so without echoing the draft back
    // any re-render (including the one this component triggers by removing a
    // chip) wiped a half-typed tag.
    const draftSlot = helpers.useInstanceState<string>("draft", "");
    const setTags = (next: string[]) => {
      // `disabled` can flip between render and click, so guard here too.
      if (disabled) return;
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
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
        // A greyed-out field that still lets you delete chips is worse than no
        // `disabled` at all — a viewer-role user could destroy data.
        disabled: disabled ? "" : null,
      }, ["×"]);
      remove.onclick = () => setTags(tags.filter((t) => t !== tag));
      chip.append(remove);
      root.append(chip);
    }
    const suggestions = asArray<unknown>(props.suggestions)
      .map((v) => asString(v))
      .filter((v) => v !== "" && !tags.includes(v));
    const listId = suggestions.length > 0 ? `${id}-suggestions` : null;
    const input = el("input", {
      type: "text",
      class: "rui-tag-input-field",
      id,
      name: id,
      // Keyed so the morph reconciler parks the live field when a new chip is
      // inserted ahead of it. Without a key the chip landed on the field's
      // index, the tag mismatch replaced the node, and focus was lost after
      // every committed tag.
      "data-rui-key": "tag-field",
      placeholder: asString(props.placeholder, tags.length === 0 ? "Add tags…" : ""),
      value: draftSlot.get(),
      list: listId,
      disabled: disabled ? "" : null,
      autocomplete: "off",
    }) as HTMLInputElement;

    /** Commit the pending text; returns the resulting tag list. */
    const commitDraft = (liveInput: HTMLInputElement): string[] => {
      const value = liveInput.value.trim();
      if (!value || disabled) return tags;
      if (max > 0 && tags.length >= max) return tags;
      liveInput.value = "";
      draftSlot.set("");
      if (tags.includes(value)) return tags;
      const next = [...tags, value];
      setTags(next);
      return next;
    };

    input.oninput = (event) => {
      const liveInput = (event.currentTarget ?? event.target) as HTMLInputElement;
      draftSlot.set(liveInput.value);
    };
    input.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      // Read the value from the *live* input — morph keeps the previously
      // mounted DOM node, so the closure-captured `input` reference points
      // at the freshly rendered (detached) field and its `.value` is empty.
      const liveInput = (e.currentTarget ?? e.target) as HTMLInputElement;
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commitDraft(liveInput);
      } else if (e.key === "Backspace" && liveInput.value === "" && tags.length > 0) {
        e.preventDefault();
        setTags(tags.slice(0, -1));
      }
    };
    // Hand-wired rather than `attachFocusHandlers`, because blur has to commit
    // the pending tag whether or not an `onBlur` handler was supplied —
    // tabbing away used to discard it silently.
    input.onblur = (event) => {
      const liveInput = (event.currentTarget ?? event.target) as HTMLInputElement;
      const next = commitDraft(liveInput);
      if (props.onBlur != null) helpers.invoke(props.onBlur, next);
    };
    if (props.onFocus != null) {
      input.onfocus = (event) => {
        const liveInput = (event.currentTarget ?? event.target) as HTMLInputElement;
        helpers.invoke(props.onFocus, liveInput.value);
      };
    }
    root.append(input);
    if (listId) {
      const list = el("datalist", { id: listId });
      for (const value of suggestions) list.append(el("option", { value }));
      root.append(list);
    }
    // The label goes through the field shell so it matches every other field in
    // the form (the old `.rui-tag-input-label` wrapper had no CSS at all).
    const shell = withFieldShell(root, { ...props, id });
    forwardFieldAria(root, input, { native: false });
    return shell;
  },
};

/* ----------------------------------------------------------------------- *
 * MentionInput
 * ----------------------------------------------------------------------- */

const MENTION_FORMATS = ["handle", "label"] as const;

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
      // `id` is LAST in the handle chain: `{id: 42, name: "Ada"}` used to
      // resolve to `42`, so selecting the row inserted the literal `@42`.
      const handle = asString(r.handle ?? r.username ?? r.value ?? r.name ?? r.label ?? r.id);
      return { value: handle, label: display };
    }
    return { value: "", label: "" };
  }).filter((i) => i.value || i.label);
}

/**
 * Live textarea → the suggestion panel promoted against it.
 *
 * Needed because the floating layer's reparenting fallback (engines without the
 * Popover API) hoists the panel into a shadow-root-level container, so it stops
 * being a descendant of `.rui-mention-input` and `querySelector` from the
 * component root can no longer find it. Keyboard navigation and every later
 * keystroke resolve the panel through that query, so without this link the list
 * would freeze open showing stale options on those engines.
 *
 * A WeakMap keyed on the field means a discarded instance takes its entry with
 * it. Entries are never removed on close: a closed panel is restored into the
 * component root, where the ordinary query finds it first.
 */
const PROMOTED_PANELS: WeakMap<HTMLTextAreaElement, HTMLElement> = new WeakMap();

/**
 * Promote the suggestion list into the shared floating layer, anchored to the
 * textarea.
 *
 * The list used to be a `position: absolute` child of `.rui-mention-input`, so
 * any ancestor with non-visible overflow amputated it — and a mention composer
 * practically lives inside one (a modal, a Sheet body, a Card, a table cell, a
 * scroll area). `position: fixed` would not be enough either: this library gives
 * itself `transform` / `backdrop-filter` ancestors (hover lifts, the glass
 * theme, the universal `animate` prop) that re-trap fixed descendants.
 *
 * The anchor is the whole textarea rather than the caret — caret-relative
 * anchoring is out of scope here, so this keeps the pre-existing anchor and only
 * changes where the panel paints. `matchAnchorWidth` reproduces what the
 * stylesheet's `left: 0; right: 0` used to give us.
 *
 * Guarded on connectedness because `paintSuggestions` also runs against the
 * detached tree `render` returns: promoting a node that is not in the document
 * would register a panel the morph reconciler is about to discard, and would
 * measure against a zero-sized anchor. The already-open-on-first-paint case goes
 * through `positionMentionOnMount` instead.
 */
const openMentionPanel = (panel: HTMLElement, anchor: HTMLTextAreaElement): void => {
  if (!panel.isConnected || !anchor.isConnected) return;
  PROMOTED_PANELS.set(anchor, panel);
  openFloating(panel, {
    anchor,
    side: "bottom",
    align: "start",
    // Mirrors `.rui-mention-input-suggestions { min-width: 220px }` so a narrow
    // composer still gets a list wide enough to read a name plus a handle.
    matchAnchorWidth: true,
    minWidth: 220,
    layer: "dropdown",
  });
};

/**
 * Position a list that is already open on its very first paint.
 *
 * The persisted `query` slot outlives a render, so a re-render that hands morph
 * a brand-new subtree can produce a panel that is `data-open="true"` before any
 * input event has run. Positioning needs live layout and `render` returns a
 * detached tree, so this defers past the current task and only acts once the
 * node is actually connected. When morph keeps the previous live nodes instead,
 * the guard makes this a no-op — that panel is already promoted and is held in
 * place by the floating layer's own scroll/resize listeners.
 */
const positionMentionOnMount = (root: HTMLElement): void => {
  deferToPaint(() => {
    if (!root.isConnected) return;
    const panel = root.querySelector<HTMLElement>(".rui-mention-input-suggestions");
    const anchor = root.querySelector<HTMLTextAreaElement>(".rui-mention-input-field");
    // `data-open` lives on the panel, not on the root: this list's visibility is
    // derived from the current @-query rather than from a trigger toggle.
    if (!panel || !anchor || panel.getAttribute("data-open") !== "true") return;
    openMentionPanel(panel, anchor);
  });
};

export const MentionInput: ComponentSpec = {
  name: "MentionInput",
  description:
    "Multi-line input with inline @-mention suggestions. Typing `@` " +
    "opens a popover listing the provided `people` (filtered by what " +
    "follows). Selecting an option inserts `@handle` — the `handle`/`value` " +
    "key, falling back to the display label; set `mentionFormat: \"label\"` " +
    "to insert the display name instead. Pass a `$variable` as `value` for " +
    "two-way binding. Use `onSearch` + `loading` for a server-side directory. " +
    "Use for comments, task notes, chat composers.",
  props: [
    { name: "id", type: "string" },
    { name: "people", type: "any[]", description: "Available mentions: strings or {value, label} objects" },
    { name: "value", type: "string", optional: true, description: "Bound text (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "rows", type: "number", optional: true, description: "TextArea rows (default 3)" },
    { name: "maxSuggestions", type: "number", optional: true, description: "Maximum options listed (default 6)" },
    { name: "mentionFormat", type: "string", optional: true, enum: MENTION_FORMATS, description: "Insert `@handle` (default) or `@label`" },
    { name: "loading", type: "boolean", optional: true, description: "Show \"Searching…\" while `onSearch` results are in flight" },
    { name: "onSearch", type: "callable", optional: true, description: "Called with the text typed after `@` so the app can fetch `people`" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current text on every keystroke" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id) || autoId(helpers, "rui-mention-input");
    const panelId = `${id}-suggestions`;
    const people = readMentionItems(props.people);
    const disabled = asBoolean(props.disabled);
    const loading = asBoolean(props.loading);
    const maxSuggestions = Math.max(1, Math.floor(asNumber(props.maxSuggestions, 6)));
    const insertLabel = asString(props.mentionFormat, "handle") === "label";
    const root = el("div", { class: "rui-mention-input", "data-disabled": disabled ? "true" : "false" });
    const textarea = el("textarea", {
      class: "rui-mention-input-field",
      id,
      name: id,
      rows: String(Math.max(2, Math.floor(asNumber(props.rows, 3)))),
      placeholder: asString(props.placeholder, "Type @ to mention someone"),
      disabled: disabled ? "" : null,
      // Combobox semantics: without these the popover, its options and the
      // active row existed only in `data-*` attributes, i.e. only for sighted
      // users. `aria-multiline` keeps the "multiline" announcement that
      // `role=combobox` would otherwise drop.
      role: "combobox",
      "aria-expanded": "false",
      "aria-autocomplete": "list",
      "aria-multiline": "true",
      "aria-controls": panelId,
    }) as HTMLTextAreaElement;
    textarea.value = asString(props.value);
    const suggestions = el("div", {
      class: "rui-mention-input-suggestions",
      id: panelId,
      role: "listbox",
      "data-open": "false",
    });

    // Per-instance UI state survives re-renders triggered by two-way
    // binding. The fresh render must reproduce the open state on the
    // freshly-built suggestions panel so morph doesn't reset the live
    // panel back to "closed" when it copies attributes/children over.
    const activeSlot = helpers.useInstanceState<number>("activeIndex", 0);
    const matchesSlot = helpers.useInstanceState<MentionItem[]>("matches", []);
    const querySlot = helpers.useInstanceState<string | null>("query", null);
    const blurTimerSlot = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("blurTimer", null);

    const liveSuggestionsFor = (origin: Element): HTMLElement | null => {
      const root = origin.closest(".rui-mention-input");
      const inPlace = root?.querySelector<HTMLElement>(".rui-mention-input-suggestions");
      if (inPlace) return inPlace;
      // Not under the component root: the floating layer's reparenting fallback
      // has hoisted it. Recover it through the field it was promoted against.
      const field = root?.querySelector<HTMLTextAreaElement>(".rui-mention-input-field");
      return (field ? PROMOTED_PANELS.get(field) : null) ?? null;
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
      const token = insertLabel ? (item.label || item.value) : (item.value || item.label);
      const insert = `@${token} `;
      const next = before.slice(0, triggerIdx) + insert + after;
      liveTextarea.value = next;
      const cursor = triggerIdx + insert.length;
      liveTextarea.selectionStart = liveTextarea.selectionEnd = cursor;
      liveTextarea.dispatchEvent(new Event("input", { bubbles: true }));
      liveTextarea.focus();
    };

    /** Mirror the active option into `data-active` *and* ARIA. */
    const applyActive = (panel: HTMLElement, field: HTMLTextAreaElement, next: number) => {
      const items = panel.querySelectorAll<HTMLElement>(".rui-mention-input-option");
      items.forEach((b, i) => {
        b.setAttribute("data-active", i === next ? "true" : "false");
        b.setAttribute("aria-selected", i === next ? "true" : "false");
      });
      const activeId = items[next]?.id;
      if (activeId) field.setAttribute("aria-activedescendant", activeId);
      else field.removeAttribute("aria-activedescendant");
    };

    /**
     * `anchor` is the *live* textarea this paint belongs to, threaded in rather
     * than re-derived with `closest` from the panel: once the panel is promoted
     * through the reparenting fallback it no longer sits inside
     * `.rui-mention-input`, so walking up from it would find nothing. It is
     * absent for the paint that runs on the detached tree `render` returns,
     * which is exactly the paint that must not promote anything.
     */
    const paintSuggestions = (
      panel: HTMLElement,
      query: string | null,
      anchor?: HTMLTextAreaElement | null,
    ) => {
      // The fresh textarea belongs to the same tree as the fresh panel, so it is
      // the right target for the render-time paint.
      const field = anchor ?? textarea;
      panel.replaceChildren();
      if (query === null) {
        panel.setAttribute("data-open", "false");
        field.setAttribute("aria-expanded", "false");
        field.removeAttribute("aria-activedescendant");
        matchesSlot.set([]);
        // Every close path has to un-promote, or the panel is left orphaned in
        // the top layer where nothing can dismiss it. No-op when not promoted.
        closeFloating(panel);
        return;
      }
      const q = query.toLowerCase();
      const filtered = people.filter((p) =>
        p.label.toLowerCase().includes(q) || p.value.toLowerCase().includes(q),
      );
      const slice = filtered.slice(0, maxSuggestions);
      matchesSlot.set(loading ? [] : slice);
      panel.setAttribute("data-open", "true");
      field.setAttribute("aria-expanded", "true");
      if (loading || slice.length === 0) {
        // Closing the panel here (the old behaviour) made "still fetching" and
        // "nothing matches" indistinguishable from "no trigger typed".
        panel.append(el("div", {
          class: "rui-mention-input-status",
          role: "option",
          "aria-disabled": "true",
          "aria-selected": "false",
        }, [loading ? "Searching…" : "No people found"]));
        field.removeAttribute("aria-activedescendant");
        if (anchor) openMentionPanel(panel, anchor);
        return;
      }
      const nextActive = Math.min(Math.max(0, activeSlot.get()), slice.length - 1);
      activeSlot.set(nextActive);
      slice.forEach((item, idx) => {
        const btn = el("button", {
          type: "button",
          class: "rui-mention-input-option",
          id: `${panelId}-option-${idx}`,
          role: "option",
          "aria-selected": idx === nextActive ? "true" : "false",
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
          // Prefer the textarea this paint was anchored to: under the
          // reparenting fallback the option button has been hoisted out of
          // `.rui-mention-input` with the panel, so `closest` cannot reach it.
          const ta = anchor ?? liveTextareaFor(origin);
          const live = ta ? liveSuggestionsFor(ta) : liveSuggestionsFor(origin);
          if (ta) insertMention(ta, item);
          querySlot.set(null);
          if (live) paintSuggestions(live, null, ta);
        };
        panel.append(btn);
      });
      applyActive(panel, field, nextActive);
      // Promote only after the options are in the DOM: flip, shift and the
      // height cap all measure the panel, and an empty box measures wrong.
      if (anchor) openMentionPanel(panel, anchor);
    };

    const updateFromCaret = (liveTextarea: HTMLTextAreaElement) => {
      const live = liveSuggestionsFor(liveTextarea);
      if (!live) return;
      const caret = liveTextarea.selectionStart ?? liveTextarea.value.length;
      const before = liveTextarea.value.slice(0, caret);
      // The trigger has to start a word — without the boundary guard, typing
      // `ping ada@` opened the mention list over an email address and Enter
      // rewrote it into a mention.
      const match = /(?:^|\s)@([\w-]*)$/.exec(before);
      const nextQuery = match ? match[1] ?? "" : null;
      const previous = querySlot.get();
      querySlot.set(nextQuery);
      if (nextQuery !== null && nextQuery !== previous) helpers.invoke(props.onSearch, nextQuery);
      paintSuggestions(live, nextQuery, liveTextarea);
    };

    const stateName = node.argMeta?.[2]?.stateRef;
    // A single property-based handler drives the suggestions, the bound
    // `$variable` and `onChange`. `onChange` used to go through
    // `addEventListener`, which morph cannot transfer: the listener stayed
    // frozen at the first render's closure (writing keystrokes from thread B
    // into thread A's draft) while the state binding stayed current.
    textarea.oninput = (event) => {
      const ta = (event.currentTarget ?? event.target) as HTMLTextAreaElement;
      updateFromCaret(ta);
      if (stateName) helpers.setState(stateName, ta.value);
      helpers.invoke(props.onChange, ta.value);
    };
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
        applyActive(live, ta, next);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = (activeSlot.get() - 1 + matches.length) % matches.length;
        activeSlot.set(next);
        applyActive(live, ta, next);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const chosen = matches[activeSlot.get()];
        if (chosen) {
          insertMention(ta, chosen);
          querySlot.set(null);
          paintSuggestions(live, null, ta);
        }
      } else if (event.key === "Escape") {
        querySlot.set(null);
        paintSuggestions(live, null, ta);
      }
    };
    textarea.onblur = (event) => {
      const ta = (event.currentTarget ?? event.target) as HTMLTextAreaElement;
      // Registered BEFORE the timer is scheduled: `registerDisposer` runs the
      // previous cleanup for the same key immediately, and that cleanup reads
      // the handle slot — scheduling first would make it cancel the timer we
      // just created instead of the stale one. Without a disposer the timer
      // outlived the instance and wrote to a torn-down state slot.
      helpers.registerDisposer(() => {
        const pending = blurTimerSlot.get();
        if (pending === null) return;
        clearTimeout(pending);
        blurTimerSlot.set(null);
      }, "mention-blur-dismiss");
      // Deferred so a mousedown on an option still lands before the close.
      const handle = setTimeout(() => {
        blurTimerSlot.set(null);
        if (!ta.isConnected) return;
        const live = liveSuggestionsFor(ta);
        querySlot.set(null);
        if (live) paintSuggestions(live, null, ta);
      }, 120);
      blurTimerSlot.set(handle);
      if (props.onBlur != null) helpers.invoke(props.onBlur, ta.value);
    };
    if (props.onFocus != null) {
      textarea.onfocus = (event) => {
        const ta = (event.currentTarget ?? event.target) as HTMLTextAreaElement;
        helpers.invoke(props.onFocus, ta.value);
      };
    }
    root.append(textarea);
    root.append(suggestions);
    // Reproduce the persisted open/query state on this freshly-built
    // panel so morph keeps the live popover open across re-renders. No anchor
    // is passed: this tree is still detached, so nothing is promoted here.
    paintSuggestions(suggestions, querySlot.get());
    if (suggestions.getAttribute("data-open") === "true") positionMentionOnMount(root);
    const shell = withFieldShell(root, { ...props, id });
    forwardFieldAria(root, textarea);
    return shell;
  },
};

/* ----------------------------------------------------------------------- *
 * TimePicker / DateTimePicker / MaskedInput
 * ----------------------------------------------------------------------- */

export const TimePicker: ComponentSpec = {
  name: "TimePicker",
  description:
    "Time-of-day picker that wraps `<input type=\"time\">`. Pass a " +
    "`$variable` as `value` for two-way binding (HH:MM 24-hour, written on " +
    "commit). Set `step` to constrain to specific increments (e.g. 900 for " +
    "15-minute buckets, or `\"any\"` for seconds). Pass " +
    "`label`/`hint`/`error`/`required` for the labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "HH:MM value; typically $variable" },
    { name: "min", type: "string", optional: true },
    { name: "max", type: "string", optional: true },
    { name: "step", type: "number", optional: true, description: "Seconds between selectable times" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new HH:MM string when the user picks a time" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id) || autoId(helpers, "rui-time-picker");
    const root = el("div", { class: "rui-time-picker" });
    const input = el("input", {
      type: "time",
      class: "rui-time-picker-input",
      id,
      name: asString(props.name, id),
      value: valueAttr(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      step: stepAttr(props.step),
      disabled: asBoolean(props.disabled) ? "" : null,
    }) as HTMLInputElement;
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      // `change`, not the renderer's default `input`: a `time` field reports
      // `""` until BOTH hour and minute are complete, so binding on `input`
      // wrote an empty string into the $variable on every partial edit (a
      // derived duration or a `min` attribute elsewhere flickered to its empty
      // branch mid-typing) — and disagreed with `onChange`, which commits.
      helpers.bindState(input, stateName, {
        event: "change",
        getValue: (n) => (n as HTMLInputElement).value,
      });
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    attachFocusHandlers(input, props, helpers);
    root.append(input);
    const shell = withFieldShell(root, { ...props, id });
    forwardFieldAria(root, input);
    return shell;
  },
};

export const DateTimePicker: ComponentSpec = {
  name: "DateTimePicker",
  description:
    "Combined date + time picker — wraps `<input " +
    "type=\"datetime-local\">`. Pass a `$variable` as `value` for two-way " +
    "binding (ISO `YYYY-MM-DDTHH:MM`, written on commit). The field is " +
    "timezone-naive, so spell the timezone out in `hint`. Pass " +
    "`label`/`hint`/`error`/`required` for the labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "ISO date-time value; typically $variable" },
    { name: "min", type: "string", optional: true },
    { name: "max", type: "string", optional: true },
    { name: "step", type: "number", optional: true, description: "Seconds between selectable times" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new ISO `YYYY-MM-DDTHH:MM` string" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id) || autoId(helpers, "rui-datetime-picker");
    const root = el("div", { class: "rui-datetime-picker" });
    const input = el("input", {
      type: "datetime-local",
      class: "rui-datetime-picker-input",
      id,
      name: asString(props.name, id),
      value: valueAttr(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      step: stepAttr(props.step),
      disabled: asBoolean(props.disabled) ? "" : null,
    }) as HTMLInputElement;
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      // Same `input` → `change` correction as TimePicker: a partially entered
      // datetime reads as `""`, so a picker bound on `input` cleared the
      // $variable a second picker was using as its `min` bound.
      helpers.bindState(input, stateName, {
        event: "change",
        getValue: (n) => (n as HTMLInputElement).value,
      });
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    attachFocusHandlers(input, props, helpers);
    root.append(input);
    const shell = withFieldShell(root, { ...props, id });
    forwardFieldAria(root, input);
    return shell;
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

/** True when the mask position holds a token (as opposed to a fixed delimiter). */
function isMaskToken(ch: string | undefined): boolean {
  return ch === "9" || ch === "A" || ch === "*";
}

/**
 * Strip the mask's fixed delimiters back out. `applyMask`'s output is
 * positionally aligned with the mask, so the token positions are the payload.
 */
function unmaskValue(masked: string, mask: string): string {
  if (!mask) return masked;
  let out = "";
  for (let i = 0; i < masked.length && i < mask.length; i += 1) {
    if (isMaskToken(mask[i])) out += masked[i];
  }
  return out;
}

const MASK_INPUT_MODES = ["text", "numeric", "decimal", "tel", "none"] as const;

/**
 * Derive a keyboard hint from the mask. An all-`9` mask can only accept digits
 * — every letter typed on a mobile QWERTY keyboard is swallowed by `applyMask`,
 * which makes the field look frozen.
 */
function maskInputMode(mask: string): string | null {
  const tokens = Array.from(mask).filter((c) => isMaskToken(c));
  if (tokens.length === 0 || tokens.some((t) => t !== "9")) return null;
  return "numeric";
}

export const MaskedInput: ComponentSpec = {
  name: "MaskedInput",
  description:
    "Text input with an inline mask — `9` matches a digit, `A` matches a " +
    "letter, `*` matches any character, every other character is a " +
    "fixed delimiter. Useful for phone numbers, postal codes, credit " +
    "cards. Pass `mask` (e.g. `\"(999) 999-9999\"`) and a `$variable` " +
    "as `value`. Set `unmasked: true` to bind the token characters only " +
    "(no punctuation in the submitted payload). Pass " +
    "`label`/`hint`/`error`/`required` for the labelled field shell.",
  props: [
    { name: "id", type: "string" },
    { name: "mask", type: "string", description: "Mask pattern" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "unmasked", type: "boolean", optional: true, aliases: ["rawValue"], description: "Bind/report the token characters only, without the mask's delimiters" },
    { name: "inputMode", type: "string", optional: true, aliases: ["inputmode"], enum: MASK_INPUT_MODES, description: "Mobile keyboard hint (derived from the mask when omitted)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" },
    ...FIELD_SHELL_PROPS,
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id) || autoId(helpers, "rui-masked-input");
    const mask = asString(props.mask);
    const disabled = asBoolean(props.disabled);
    const unmasked = asBoolean(props.unmasked);
    // `valueAttr` semantics: an absent `value` prop must emit no attribute, or
    // morph reads the rendered `value=""` as a deliberate clear and wipes the
    // half-typed phone number on the next re-render from anywhere in the app.
    const initial = valueAttr(props.value) === null ? null : applyMask(asString(props.value), mask);
    const input = el("input", {
      type: "text",
      class: "rui-masked-input",
      id,
      name: asString(props.name, id),
      value: initial,
      placeholder: asString(props.placeholder, mask),
      inputmode: asString(props.inputMode) || maskInputMode(mask),
      disabled: disabled ? "" : null,
      autocomplete: "off",
    }) as HTMLInputElement;
    if (initial !== null) input.value = initial;
    const stateName = node.argMeta?.[2]?.stateRef;
    // Apply the mask in place and keep the caret where the user's edit landed.
    // We use a property-based `oninput` so the morph reconciler can transfer it
    // to a kept DOM node across re-renders.
    const formatInPlace = (target: HTMLInputElement) => {
      const before = target.value;
      const masked = applyMask(before, mask);
      if (masked === before) return masked;
      const caret = target.selectionStart ?? before.length;
      target.value = masked;
      // Re-mask only the text to the LEFT of the caret: its masked length is
      // where the caret belongs, because every delimiter the mask inserted
      // before that point pushes the user's last character further right.
      // Clamping the raw offset instead (the old behaviour) parked the caret
      // BETWEEN `(` and the digit just typed, so the next keystroke landed
      // before the previous one and `4155550114` came out as `(155) 011-4554`.
      let pos = Math.min(masked.length, applyMask(before.slice(0, caret), mask).length);
      // Step over a fixed delimiter that now sits under the caret so the next
      // character types into a token slot instead of fighting the mask.
      while (pos < masked.length && pos < mask.length && !isMaskToken(mask[pos])) pos += 1;
      try { target.setSelectionRange(pos, pos); } catch { /* ignore */ }
      return masked;
    };
    input.oninput = (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLInputElement;
      const masked = formatInPlace(live);
      const reported = unmasked ? unmaskValue(masked, mask) : masked;
      if (stateName) helpers.setState(stateName, reported);
      helpers.invoke(props.onChange, reported);
    };
    attachFocusHandlers(input, props, helpers, (n) => {
      const masked = (n as HTMLInputElement).value;
      return unmasked ? unmaskValue(masked, mask) : masked;
    });
    return withFieldShell(input, { ...props, id });
  },
};

/* ----------------------------------------------------------------------- *
 * FormSection / FieldSet / ValidationSummary
 * ----------------------------------------------------------------------- */

const HEADING_TAGS = ["h2", "h3", "h4", "h5", "h6"] as const;

export const FormSection: ComponentSpec = {
  name: "FormSection",
  description:
    "Semantic grouping for related form fields — renders a small heading " +
    "(`label`), optional helper paragraph, and stacks the children with " +
    "consistent spacing. Use INSTEAD of wrapping fields in `Card` + " +
    "`SectionHeader` by hand. Set `level` (2-6, default 3) so the heading " +
    "fits the surrounding document outline. Pair with `FieldSet` when the " +
    "group is a true `<fieldset>` (radio sets, checkbox groups).",
  props: [
    { name: "label", type: "string", aliases: ["title"] },
    { name: "children", type: "Node[]", aliases: ["child", "fields"] },
    { name: "helper", type: "string", optional: true, aliases: ["description"], description: "Description rendered below the label" },
    { name: "level", type: "number", optional: true, description: "Heading level 2-6 (default 3) — keep the page outline correct" },
  ],
  render: (_node, props, helpers) => {
    const root = el("section", { class: "rui-form-section" });
    const label = asString(props.label);
    const helper = asString(props.helper);
    // An empty label used to still render an empty heading, so an unlabelled
    // first group sat ~19px lower than its siblings for no visible reason.
    if (label || helper) {
      const header = el("header", { class: "rui-form-section-header" });
      if (label) {
        const level = Math.max(2, Math.min(6, Math.floor(asNumber(props.level, 3))));
        header.append(el(HEADING_TAGS[level - 2] ?? "h3", { class: "rui-form-section-label" }, [label]));
      }
      if (helper) header.append(el("p", { class: "rui-form-section-helper" }, [helper]));
      root.append(header);
    }
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
    "wrapper (radio sets, checkbox groups). `error` renders a GROUP-level " +
    "validation message (\"Select at least one contact method\") that " +
    "belongs to the set rather than to any single control. For purely " +
    "visual grouping prefer `FormSection`.",
  props: [
    { name: "legend", type: "string", aliases: ["title", "label"] },
    { name: "children", type: "Node[]", aliases: ["child", "fields"] },
    { name: "helper", type: "string", optional: true, aliases: ["hint", "description"] },
    { name: "disabled", type: "boolean", optional: true },
    { name: "error", type: "string", optional: true, description: "Group-level validation error (marks the whole group invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the group required (adds a `*` to the legend)" },
  ],
  render: (_node, props, helpers) => {
    const helper = asString(props.helper);
    const error = asString(props.error);
    const required = asBoolean(props.required);
    const baseId = autoId(helpers, "rui-fieldset");
    const root = el("fieldset", {
      class: "rui-fieldset",
      disabled: asBoolean(props.disabled) ? "" : null,
      "data-invalid": error ? "true" : null,
      "aria-invalid": error ? "true" : null,
      "aria-required": required ? "true" : null,
    });
    const legend = el("legend", { class: "rui-fieldset-legend" }, [asString(props.legend)]);
    if (required) legend.append(el("span", { class: "rui-field-required", "aria-hidden": "true" }, ["*"]));
    root.append(legend);
    // The helper/error need ids: as bare paragraphs they were read by sighted
    // users only — a screen-reader user arrowing the radios never heard them.
    const describedBy: string[] = [];
    if (helper) {
      const helperId = `${baseId}-helper`;
      describedBy.push(helperId);
      root.append(el("p", { class: "rui-fieldset-helper", id: helperId }, [helper]));
    }
    if (error) {
      const errorId = `${baseId}-error`;
      describedBy.push(errorId);
      root.append(el("p", {
        class: "rui-fieldset-error rui-field-error",
        id: errorId,
        role: "alert",
      }, [error]));
    }
    if (describedBy.length > 0) root.setAttribute("aria-describedby", describedBy.join(" "));
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const ValidationSummary: ComponentSpec = {
  name: "ValidationSummary",
  description:
    "Aggregate error list rendered at the top of a form. Pass `errors` " +
    "as `{label?, message, field?}` objects or plain strings; an entry with " +
    "a `field` renders as a link that focuses that control (or calls " +
    "`onErrorClick(field)`). Set `count: true` to lead with \"There are 3 " +
    "problems with this form\". Pair with individual field hints via " +
    "`FormControl(hint=...)`.",
  props: [
    { name: "errors", type: "any[]" },
    { name: "title", type: "string", optional: true, description: "Heading (default \"Please fix the following:\")" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["danger", "warning"] },
    { name: "count", type: "boolean", optional: true, description: "Use a counting heading (\"There are 3 problems with this form\")" },
    { name: "onErrorClick", type: "callable", optional: true, description: "Called with the entry's `field` key when it is clicked" },
  ],
  render: (_node, props, helpers) => {
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
    // Tracks the empty → populated transition so focus moves exactly once, on
    // the render where the summary actually appears.
    const populatedSlot = helpers.useInstanceState<boolean>("populated", false);
    if (errors.length === 0) {
      populatedSlot.set(false);
      return el("div", { class: "rui-validation-summary", "data-empty": "true", hidden: "" });
    }
    const appearing = !populatedSlot.get();
    populatedSlot.set(true);
    const tone = asString(props.tone, "danger");
    const root = el("aside", {
      class: "rui-validation-summary",
      "data-tone": tone,
      role: "alert",
      // Focusable so the user is taken to the errors instead of having to
      // shift-tab back up through the whole form from the Submit button.
      tabindex: "-1",
    });
    const titleNode = el("div", { class: "rui-validation-summary-title" });
    const iconNode = renderIcon(tone === "warning" ? "triangle-exclamation" : "circle-xmark", { className: "rui-validation-summary-icon" });
    if (iconNode) titleNode.append(iconNode);
    const counted = errors.length === 1
      ? "There is 1 problem with this form"
      : `There are ${errors.length} problems with this form`;
    const heading = asString(props.title, asBoolean(props.count) ? counted : "Please fix the following:");
    titleNode.append(document.createTextNode(heading));
    root.append(titleNode);

    /** Focus (and scroll to) the control an entry points at. */
    const focusField = (origin: Element, field: string): void => {
      const scope = origin.getRootNode();
      const host: ParentNode | null = scope instanceof ShadowRoot || scope instanceof Document
        ? scope
        : origin.ownerDocument;
      if (!host) return;
      let target: HTMLElement | null = null;
      try {
        const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(field)
          : field;
        target = host.querySelector<HTMLElement>(`#${escaped}`);
      } catch { /* an id the selector grammar rejects — nothing to focus */ }
      if (!target) return;
      try { target.scrollIntoView?.({ behavior: "smooth", block: "center" }); } catch { /* no scrolling support */ }
      // Group wrappers and step bodies are not focusable by default.
      if (!target.matches("input, select, textarea, button, a[href], [tabindex]")) {
        target.setAttribute("tabindex", "-1");
      }
      target.focus?.();
    };

    const list = el("ul", { class: "rui-validation-summary-list" });
    for (const err of errors) {
      const li = el("li", { class: "rui-validation-summary-item" });
      if (err.label) li.append(el("strong", {}, [`${err.label}: `]));
      if (err.field) {
        // The documented `field` key used to be read and then dropped, leaving
        // the user to hunt a 30-field form for the offending control.
        const link = el("a", {
          class: "rui-validation-summary-link",
          href: sanitiseHref(`#${err.field}`, "#"),
        }, [err.message]);
        const field = err.field;
        link.onclick = (event) => {
          // Never let the fragment navigate: the app's router is hash-based, so
          // a real `#vatId` navigation would change the active route.
          event.preventDefault();
          const origin = (event.currentTarget ?? event.target) as Element | null;
          if (origin) focusField(origin, field);
          helpers.invoke(props.onErrorClick, field);
        };
        li.append(link);
      } else {
        li.append(document.createTextNode(err.message));
      }
      list.append(li);
    }
    root.append(list);
    if (appearing) {
      // `render` returns a detached tree; only the paint that lands in the
      // document may take focus.
      deferToPaint(() => {
        if (!root.isConnected) return;
        try { root.scrollIntoView?.({ behavior: "smooth", block: "start" }); } catch { /* no scrolling support */ }
        root.focus?.();
      });
    }
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
    "`$variable` for the current 0-indexed step (or call `onStepChange` " +
    "when `current` is a literal). Use INSTEAD of hand-rolling `Steps` + " +
    "content + manual prev/next wiring. Set `nextDisabled` to block " +
    "advancing past an incomplete step and `submitting` while the submit is " +
    "in flight. The submit button is rendered on the final step (override " +
    "via `submitLabel`). Step indicator direction defaults to `column` " +
    "(stacked next to the content); set `stepsLayout: \"row\"` for a " +
    "classic horizontal stepper.",
  props: [
    { name: "steps", type: "object[]", description: "Array of {title, details?, content} step objects" },
    { name: "current", type: "number", description: "0-indexed active step — bind a $variable (or pass a literal plus `onStepChange`)" },
    { name: "onSubmit", type: "callable", optional: true, description: "Callable fired when the user clicks Submit on the final step" },
    { name: "prevLabel", type: "string", optional: true, description: "Default \"Back\"" },
    { name: "nextLabel", type: "string", optional: true, description: "Default \"Continue\"" },
    { name: "submitLabel", type: "string", optional: true, description: "Default \"Submit\" (final step)" },
    { name: "stepsLayout", type: "string", optional: true, enum: ["column", "row"], aliases: ["layout", "stepsDirection"], description: "Direction of the steps indicator (default \"column\")" },
    { name: "nextDisabled", type: "boolean", optional: true, description: "Block Continue/Submit while the active step is incomplete" },
    { name: "submitting", type: "boolean", optional: true, description: "Disable the footer buttons while the submit is in flight" },
    { name: "onStepChange", type: "callable", optional: true, description: "Called with the new 0-indexed step whenever the step changes" },
    { name: "onStepClick", type: "callable", optional: true, description: "Called with the index when a completed step in the indicator is clicked" },
    { name: "clickableSteps", type: "boolean", optional: true, description: "Let the user jump back to a completed step from the indicator" },
    { name: "showProgress", type: "boolean", optional: true, description: "Show the `n / total` counter (default true)" },
    { name: "hideFooter", type: "boolean", optional: true, description: "Suppress the built-in Back/Continue row (supply your own action row)" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown while `steps` is empty (e.g. before a fetch lands)" },
  ],
  render: (node, props, helpers) => {
    const steps = readSteps(props.steps);
    const total = steps.length;
    const layoutToken = asString(props.stepsLayout, "column").toLowerCase();
    const layout = layoutToken === "row" || layoutToken === "horizontal" ? "row" : "column";
    if (total === 0) {
      // No steps yet (a fetch still in flight, a filtered-away list). The old
      // arithmetic produced `current = 0`, `isFinal = true` and a "1 / 0"
      // counter next to a live Submit button, so an empty wizard could fire
      // `onSubmit` with nothing filled in.
      const empty = el("div", { class: "rui-multi-step-form", "data-empty": "true" });
      const box = el("div", { class: "rui-empty-state" });
      box.append(el("p", { class: "rui-empty-state-description" }, [
        asString(props.emptyText, "No steps to show yet."),
      ]));
      empty.append(box);
      return empty;
    }
    const current = Math.max(0, Math.min(total - 1, Math.floor(asNumber(props.current, 0))));
    const stateName = node.argMeta?.[1]?.stateRef;
    const submitting = asBoolean(props.submitting);
    const nextBlocked = asBoolean(props.nextDisabled);
    // A literal `current` satisfies `type: "number"`, so the wizard used to
    // render a normal-looking Continue button that did nothing at all. Either a
    // bound $variable or an `onStepChange` handler makes navigation possible;
    // with neither, the buttons render disabled instead of silently inert.
    const canNavigate = stateName != null || props.onStepChange != null;
    const goTo = (next: number): void => {
      const target = Math.max(0, Math.min(total - 1, next));
      if (target === current) return;
      if (stateName) helpers.setState(stateName, target);
      helpers.invoke(props.onStepChange, target);
    };
    const root = el("div", {
      class: "rui-multi-step-form",
      "data-layout": layout,
    });
    const stepsEl = el("ol", {
      class: "rui-steps rui-multi-step-form-steps",
      "data-layout": layout,
      "aria-label": "Progress",
    });
    const stepsClickable = (asBoolean(props.clickableSteps) || props.onStepClick != null)
      && !submitting;
    steps.forEach((step, idx) => {
      const complete = idx < current;
      const li = el("li", {
        class: "rui-steps-item",
        "data-active": idx === current ? "true" : "false",
        "data-complete": complete ? "true" : "false",
        // Active/complete used to live only in `data-*`, which no screen reader
        // reads, and the ✓ is a CSS `content` most of them skip.
        "aria-current": idx === current ? "step" : null,
      });
      li.append(el("div", { class: "rui-steps-title" }, [step.title || `Step ${idx + 1}`]));
      if (complete) li.append(el("span", { class: "rui-visually-hidden" }, [" (completed)"]));
      if (step.details) li.append(el("div", { class: "rui-steps-details" }, [step.details]));
      if (stepsClickable && complete) {
        li.setAttribute("role", "button");
        li.setAttribute("tabindex", "0");
        li.setAttribute("data-clickable", "true");
        // The index is read back off the live element rather than captured, so
        // the handler cannot act on a stale render's loop variable.
        li.setAttribute("data-index", String(idx));
        const jump = (origin: Element): void => {
          const target = Number(origin.getAttribute("data-index"));
          if (!Number.isFinite(target)) return;
          goTo(target);
          helpers.invoke(props.onStepClick, target);
        };
        li.onclick = (event) => jump((event.currentTarget ?? event.target) as Element);
        li.onkeydown = (event) => {
          const e = event as KeyboardEvent;
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          jump((e.currentTarget ?? e.target) as Element);
        };
      }
      stepsEl.append(li);
    });
    root.append(stepsEl);
    const active = steps[current];
    const body = el("div", {
      class: "rui-multi-step-form-body",
      role: "group",
      "aria-label": `${active?.title || `Step ${current + 1}`} — step ${current + 1} of ${total}`,
    });
    if (active && active.content) {
      body.append(helpers.renderNode(active.content));
    }
    root.append(body);
    if (!asBoolean(props.hideFooter)) {
      const footer = el("div", { class: "rui-multi-step-form-footer" });
      const prevBtn = el("button", {
        type: "button",
        class: "rui-button",
        "data-variant": "ghost",
        disabled: current <= 0 || submitting || !canNavigate ? "" : null,
      }, [asString(props.prevLabel, "Back")]);
      prevBtn.onclick = () => {
        if (submitting) return;
        goTo(current - 1);
      };
      const isFinal = current >= total - 1;
      const nextLabel = isFinal ? asString(props.submitLabel, "Submit") : asString(props.nextLabel, "Continue");
      const nextBtn = el("button", {
        type: "button",
        class: "rui-button",
        "data-variant": "primary",
        disabled: nextBlocked || submitting || (!isFinal && !canNavigate) ? "" : null,
        "aria-busy": submitting ? "true" : null,
      }, [nextLabel]);
      nextBtn.onclick = () => {
        // `disabled` can flip between render and click (and a duplicate submit
        // is a duplicate order), so re-check here.
        if (submitting || nextBlocked) return;
        if (isFinal) {
          helpers.invoke(props.onSubmit);
          return;
        }
        goTo(current + 1);
      };
      footer.append(prevBtn);
      if (asBoolean(props.showProgress, true)) {
        footer.append(el("span", { class: "rui-multi-step-form-progress" }, [`${current + 1} / ${total}`]));
      }
      footer.append(nextBtn);
      root.append(footer);
    }
    // Out-of-flow (`position: absolute`), so it adds no grid track: announces
    // the transition for a user whose focus stays on the Continue button.
    root.append(el("div", {
      class: "rui-visually-hidden",
      role: "status",
      "aria-live": "polite",
    }, [`Step ${current + 1} of ${total}: ${active?.title || ""}`]));
    return root;
  },
};

/* RequirementList ---------------------------------------------------------- *
 *
 * "Which of these rules does my value break?" — a question a single error string
 * cannot answer. `error: "Use 3-63 characters: letters, digits, and - _ ."`
 * restates every rule at once and leaves the reader to diff it against what they
 * typed; this marks each rule individually so the one that failed is the one
 * that is red.
 *
 * Three states, not two. A rule the value has not been tested against yet
 * (nothing typed) is neither met nor unmet, and painting it red on an untouched
 * form accuses the user of a mistake they have not made — which is why `met`
 * carries `undefined` through instead of going via `asBoolean`.
 *
 * Not `OnboardingChecklist`: that is a panel with a progress bar, a heading, a
 * dismiss button and a call-to-action button per row. A `<button>` inside the
 * element a field points `aria-describedby` at is a keyboard trap.
 * ------------------------------------------------------------------------- */

/** One resolved row: the rule's text and whether the current value meets it. */
interface Requirement {
  label: string;
  /** `true` met, `false` unmet, `null` not yet evaluated. */
  met: boolean | null;
}

function readRequirements(raw: unknown): Requirement[] {
  return asArray<unknown>(raw)
    .map((entry): Requirement | null => {
      if (typeof entry === "string") return entry ? { label: entry, met: null } : null;
      if (entry && typeof entry === "object") {
        const r = entry as Record<string, unknown>;
        const label = asString(r.label ?? r.text);
        if (!label) return null;
        // Deliberately NOT `asBoolean`: it maps undefined/null to `false`, which
        // is the difference between "you broke this rule" and "not checked yet".
        const met = r.met === undefined || r.met === null ? null : r.met === true;
        return { label, met };
      }
      return null;
    })
    .filter((r): r is Requirement => r !== null);
}

export const RequirementList: ComponentSpec = {
  name: "RequirementList",
  description:
    "Checklist of rules a value has to satisfy, each marked met (check), unmet " +
    "(cross) or not yet checked (dot) — password requirements, naming rules, " +
    "policy checks. Pass `items` as strings or `{label, met}` objects, where " +
    "`met` omitted means \"not evaluated yet\" and renders neutral, so an " +
    "untouched field does not accuse the reader of breaking rules. Pair it with " +
    "a field's `invalid` and `describedBy` props to keep the border red and the " +
    "list as the explanation, instead of repeating the rules in an `error` " +
    "string. Set `announce` to have changes read out politely as the value is " +
    "edited.",
  props: [
    { name: "items", type: "any[]", positional: true, aliases: ["rules", "requirements"], description: "Rules: strings, or `{label, met}` where `met` is true / false / omitted" },
    { name: "title", type: "string", optional: true, description: "Heading above the list (e.g. \"Your password must:\")" },
    { name: "pending", type: "boolean", optional: true, description: "Force every row neutral regardless of its `met` — for a field the user has not touched yet" },
    { name: "announce", type: "boolean", optional: true, description: "Announce progress to assistive tech as rows change (a polite count, not the rule text). Off by default, because a list that talks on every keystroke is worse than one that stays quiet" },
    { name: "announceText", type: "string", optional: true, description: "What `announce` says; `{met}` and `{total}` are substituted (default \"{met} of {total} requirements met\")" },
    { name: "metLabel", type: "string", optional: true, description: "Screen-reader prefix for a met row (default \"Met\") — colour and glyph alone would not say which is which" },
    { name: "unmetLabel", type: "string", optional: true, description: "Screen-reader prefix for an unmet row (default \"Not met\")" },
  ],
  render: (_node, props) => {
    const items = readRequirements(props.items);
    const pending = asBoolean(props.pending);
    const root = el("div", {
      class: "rui-requirement-list",
      "data-pending": pending ? "true" : null,
    });
    const title = asString(props.title);
    if (title) root.append(el("div", { class: "rui-requirement-list-title" }, [title]));
    // An empty `<ul>` is announced as "list, 0 items" — a promise of content that
    // is not there. Nothing to list means nothing to render.
    if (items.length === 0) return root;

    // `|| default`, not just `asString(v, default)`: `asString` only falls back for
    // null/undefined, so an EMPTY override would silently remove the prefix — and
    // the prefix is the only channel the state has that is not colour or a glyph
    // (both hidden from a screen reader). An empty string here is a mistake, not a
    // request to drop the guarantee.
    const metLabel = asString(props.metLabel) || "Met";
    const unmetLabel = asString(props.unmetLabel) || "Not met";
    const list = el("ul", { class: "rui-requirement-list-items" });
    let metCount = 0;
    for (const item of items) {
      const state = pending || item.met === null ? "pending" : item.met ? "true" : "false";
      if (state === "true") metCount += 1;
      const row = el("li", { class: "rui-requirement", "data-met": state });
      const iconName = state === "true" ? "check" : state === "false" ? "xmark" : "circle";
      const icon = renderIcon(
        iconName,
        { className: iconName === "circle" ? "rui-requirement-icon-dot" : "rui-requirement-icon" },
      );
      if (icon) row.append(icon);
      // The glyph is `aria-hidden` and the colour is invisible to a screen reader
      // and to anyone who cannot tell the two hues apart, so the state has to be
      // in the text as well (WCAG 1.4.1). A pending row gets no prefix: "not
      // checked yet" is the absence of a verdict, not a third one worth saying.
      if (state !== "pending") {
        row.append(el("span", { class: "rui-visually-hidden" }, [`${state === "true" ? metLabel : unmetLabel}: `]));
      }
      row.append(el("span", { class: "rui-requirement-text" }, [item.label]));
      list.append(row);
    }
    root.append(list);

    // One live region for the whole list, carrying a COUNT rather than the rule
    // text. Marking each row live would utter up to one sentence per rule per
    // keystroke; the reconciler only rewrites `textContent` when it differs, so a
    // keystroke that changes no verdict makes no announcement at all.
    if (asBoolean(props.announce)) {
      const template = asString(props.announceText, "{met} of {total} requirements met");
      const text = template
        .split("{met}").join(String(metCount))
        .split("{total}").join(String(items.length));
      root.append(el("div", {
        class: "rui-requirement-list-status rui-visually-hidden",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
      }, [text]));
    }
    return root;
  },
};
