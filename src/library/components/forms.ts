/**
 * Form components: Form, FormControl, Input, TextArea, Select, SelectItem,
 * Checkbox, CheckBoxGroup, CheckBoxItem, Radio, Button, Buttons, SearchBar,
 * Slider, NumberInput, DatePicker, FileUpload, Combobox.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import type { ComponentNode } from "../../runtime/evaluator.js";
import { el, asArray, asString, asBoolean, asNumber, valueAttr, renderIcon, sanitiseHref } from "../utils.js";
import { closeFloating, deferToPaint, syncFloatingPanel } from "../floating.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";
import { extractComboboxItems, withFieldShell, FIELD_SHELL_PROPS, attachFocusHandlers, fieldShellExtraProps } from "./forms-shared.js";

/**
 * The one button vocabulary. Every button-shaped control (`Button` here,
 * `IconButton` in new-components.ts) must take its `variant` / `size` enum from
 * these arrays rather than restate them: the two lists drifted once already —
 * IconButton advertised four variants where Button had seven, so `variant:
 * "outline"` was valid on one and a validation error on the other — and a
 * duplicated literal gives nothing to notice the next divergence.
 * Every value here has a matching `.rui-button[data-variant|data-size]` and
 * `.rui-icon-button[data-variant|data-size]` rule in the theme.
 */
export const BUTTON_VARIANTS = ["primary", "secondary", "outline", "ghost", "link", "danger", "default"] as const;
export const BUTTON_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
// `time` and `datetime-local` complete the native temporal set alongside `date`.
// A maintenance-window picker (pick a weekday + a time-of-day) has no reasonable
// substitute: a free-text field for "02:00" invites typos the API then rejects.
const INPUT_TYPES = [
  "text", "email", "password", "number", "tel", "url", "date", "time", "datetime-local",
] as const;

/**
 * Normalise a size token to the canonical `xs|sm|md|lg|xl` vocabulary.
 * `extra-small` / `small` / `large` / `extra-large` are accepted as verbose
 * spellings; anything unrecognised (or empty) falls back to `md`.
 *
 * Exported alongside `BUTTON_SIZES` so IconButton resolves sizes by the same
 * rules instead of keeping its own copy. IconButton's copy accepted `small` /
 * `large` where this one did not, so the verbose pair is honoured here too —
 * consolidating must not quietly narrow what either control used to take.
 */
export function normaliseButtonSize(value: unknown): string {
  const v = asString(value).trim().toLowerCase();
  if (v === "xs" || v === "extra-small") return "xs";
  if (v === "sm" || v === "small") return "sm";
  if (v === "lg" || v === "large") return "lg";
  if (v === "xl" || v === "extra-large") return "xl";
  return "md";
}

/**
 * Wire an `onChange`-style prop as a DOM **property** handler, composed on top
 * of whatever handler `bindState` already installed for the same event.
 *
 * `attachOnChange` (wrappers.ts) registers with `addEventListener`, and the
 * morph reconciler cannot transfer those onto the node it keeps — so the
 * callback captured by the FIRST render is the only one that ever runs. Inside
 * a `.map` that lambda still holds the departed row's loop variables, so typing
 * in row 2 renames row 1 while the visible value (a property handler, refreshed
 * by morph) stays correct: silent data corruption.
 *
 * The property is assigned unconditionally and the prop is read *inside* the
 * handler, so a callback that only appears on a later render (`onChange:
 * $editing ? save : null`) is picked up as well.
 */
function bindChangeHandler(
  element: HTMLElement,
  props: Record<string, unknown>,
  helpers: RenderHelpers,
  options: { event: string; getValue: (node: HTMLElement) => unknown; prop?: string },
): void {
  composeHandler(element, `on${options.event}`, (event) => {
    const handler = props[options.prop ?? "onChange"];
    if (handler == null) return;
    const live = (event.currentTarget ?? event.target ?? element) as HTMLElement;
    helpers.invoke(handler, options.getValue(live));
  });
}

/**
 * Chain an extra property handler after whatever is already assigned to
 * `propKey` — `bindState` owns the same keys (`oninput` / `onchange`), and
 * layering a second `addEventListener` instead is exactly what morph cannot
 * carry over.
 */
function composeHandler(element: HTMLElement, propKey: string, extra: (event: Event) => void): void {
  const record = element as unknown as Record<string, unknown>;
  const previous = record[propKey] as ((event: Event) => void) | null | undefined;
  record[propKey] = (event: Event) => {
    previous?.call(element, event);
    extra(event);
  };
}

/**
 * Move the field shell's control-level attributes from a wrapper onto the real
 * form control inside it.
 *
 * `withFieldShell` writes `disabled` / `required` / `aria-invalid` /
 * `aria-describedby` onto whatever element it is handed. For composite controls
 * (NumberInput's stepper shell, a checkbox's `<label>`) that element is not a
 * form control, so all four are inert: AT reports no invalid state and native
 * validation never blocks submission.
 */
function relocateControlAria(wrapper: HTMLElement, control: HTMLElement): void {
  // `required` is only a real attribute on a form control. On the pickers' own
  // trigger (a `div role="combobox"` / a `<button>`) it is invalid markup that no
  // AT reads; `aria-required` is the same statement in a form the control's role
  // actually supports.
  const supportsRequired = control instanceof HTMLInputElement
    || control instanceof HTMLSelectElement
    || control instanceof HTMLTextAreaElement;
  // `disabled` has a wider set of legal hosts than `required` — a `<button>`
  // trigger takes it — so it needs its own test. Anything else (MultiSelect's
  // `div role="combobox"`) gets `aria-disabled`, which is what that trigger
  // already sets for itself.
  const supportsDisabled = supportsRequired || control instanceof HTMLButtonElement;
  for (const attr of ["disabled", "required", "aria-invalid", "aria-describedby"]) {
    const value = wrapper.getAttribute(attr);
    if (value === null) continue;
    // Off the wrapper first, unconditionally: `<div disabled>` styles nothing,
    // blocks no input and is not in any attribute's content model — the composites
    // disable their own inner controls and style from `data-disabled` — so leaving
    // it behind only invites a consumer selector that will never match again.
    wrapper.removeAttribute(attr);
    if (attr === "required" && !supportsRequired) {
      control.setAttribute("aria-required", "true");
      continue;
    }
    if (attr === "disabled" && !supportsDisabled) {
      control.setAttribute("aria-disabled", "true");
      continue;
    }
    control.setAttribute(attr, value);
  }
}

/**
 * Deterministic fallback id so a visible label can still be associated with its
 * control when the author omits `id`.
 *
 * Derived from the label text rather than a counter: a counter would hand out a
 * different id on every render, and morph patches the two halves of a `for`/`id`
 * pair independently, so the association would break the moment anything else
 * on the page changed state.
 */
function fallbackFieldId(prefix: string, label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `${prefix}-${slug}` : "";
}

/**
 * A BCP-47 tag for `Intl`, or `undefined` meaning "whatever the host uses".
 *
 * Same function, same name and same semantics as `localeTag` in data.ts, which
 * is the `locale` channel's home — deliberately NOT imported from there. This
 * file cannot: data.ts → patterns.ts → forms.ts is a module cycle, and
 * patterns.ts dereferences `SearchBar.props` at module scope, so importing
 * anything from data.ts here makes every spec in the library fail to load with
 * `Cannot read properties of undefined (reading 'props')`. If a later refactor
 * moves this helper into utils.ts or forms-shared.ts (neither of which is in
 * that cycle), both copies should collapse into that one.
 *
 * The canonicalisation is the safety property, not a nicety:
 * `toLocaleDateString("de_DE")` throws a RangeError, so one typo in
 * `DatePicker(locale:)` would take the whole page down; an unusable tag has to
 * degrade to the browser's own formatting instead.
 */
function localeTag(value: unknown): string | undefined {
  const tag = asString(value).trim();
  if (!tag) return undefined;
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch { return undefined; }
}

/**
 * Render an ISO `YYYY-MM-DD` the way `locale` writes dates — the same channel
 * `Table` / `Col` format their `date` columns through, so a report and the
 * picker that filters it agree on what "31/07" means.
 *
 * Parsed field by field instead of `new Date(iso)`: that constructor reads a
 * bare date as UTC midnight, so `toLocaleDateString` west of Greenwich renders
 * the day BEFORE the one the user picked. An off-by-one in a date readout is
 * worse than no readout at all.
 */
function formatDateInLocale(iso: unknown, locale: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asString(iso).trim());
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // `2026-02-31` rolls over into 3 March. Echoing a day the author never wrote
  // would be worse than echoing nothing, so an impossible date reads as empty.
  if (Number.isNaN(date.getTime()) || date.getDate() !== Number(match[3])) return "";
  return date.toLocaleDateString(locale);
}

/**
 * Keep a locale readout in step with the field it echoes.
 *
 * Needed because an *uncontrolled* picker (no `$variable` bound) never
 * re-renders when the user picks a date, so a readout computed from props alone
 * would freeze at the initial value. The live nodes are resolved from the event
 * — the `input` this closure was handed is the freshly-rendered one that morph
 * discards.
 */
function wireDateReadout(
  input: HTMLInputElement,
  rootSelector: string,
  readoutSelector: string,
  text: (liveRoot: Element) => string,
): void {
  const update = (event: Event): void => {
    const target = (event.currentTarget ?? event.target) as HTMLElement | null;
    const liveRoot = target?.closest(rootSelector);
    const readout = liveRoot?.querySelector(readoutSelector);
    if (liveRoot && readout) readout.textContent = text(liveRoot);
  };
  // Both keys: `input` fires as each segment of the native widget is filled,
  // while some UAs only report a committed date through `change`.
  composeHandler(input, "oninput", update);
  composeHandler(input, "onchange", update);
}

const isComponentNodeLike = (value: unknown): value is ComponentNode =>
  !!value && typeof value === "object" && (value as { __kind?: string }).__kind === "Component";

interface OptionItem { value: string; label: string; disabled: boolean; group: string }

/**
 * Normalise a `SelectItem[]` prop into option records.
 *
 * `extractComboboxItems` already accepts `SelectItem(value, label)` nodes,
 * `{value, label}` objects and bare strings, but it drops the `disabled` and
 * `group` slots — both of which have to survive to reach `<option disabled>`
 * and `<optgroup>`. Accepting the same shapes everywhere is the point: plain
 * `{value, label}` objects out of an API used to render an empty `<select>`
 * while working fine in the searchable branch.
 */
function extractOptionItems(raw: unknown): OptionItem[] {
  const out: OptionItem[] = [];
  for (const entry of asArray<unknown>(raw)) {
    if (entry && typeof entry === "object") {
      const node = entry as {
        __kind?: string; args?: unknown[];
        value?: unknown; label?: unknown; disabled?: unknown; group?: unknown;
      };
      if (node.__kind === "Component" && Array.isArray(node.args)) {
        const value = asString(node.args[0]);
        out.push({
          value,
          label: asString(node.args[1], value),
          disabled: asBoolean(node.args[2]),
          group: asString(node.args[3]),
        });
        continue;
      }
      if (node.value !== undefined || node.label !== undefined) {
        const value = asString(node.value);
        out.push({
          value,
          label: asString(node.label, value),
          disabled: asBoolean(node.disabled),
          group: asString(node.group),
        });
        continue;
      }
    }
    const value = asString(entry);
    out.push({ value, label: value, disabled: false, group: "" });
  }
  return out.filter((item) => item.value !== "" || item.label !== "");
}

interface CheckItem { label: string; name: string; description: string; checked: boolean; disabled: boolean; value: string }

/**
 * Normalise one CheckBoxGroup item. Mirrors `extractOptionItems`: a plain
 * `{label, name}` object out of a `$variable` used to fall through every
 * `item.args?.[n]` read and render an unlabelled checkbox keyed `group-0`, so
 * `onChange` reported keys that matched nothing in the caller's data model.
 */
function extractCheckItem(entry: unknown, groupName: string, index: number): CheckItem {
  const fallbackName = `${groupName}-${index}`;
  if (isComponentNodeLike(entry)) {
    const args = entry.args ?? [];
    const name = asString(args[1], fallbackName);
    return {
      label: asString(args[0]),
      name,
      description: asString(args[2]),
      checked: asBoolean(args[3]),
      disabled: asBoolean(args[4]),
      value: asString(args[5], name),
    };
  }
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const name = asString(obj.name, fallbackName);
    return {
      label: asString(obj.label),
      name,
      description: asString(obj.description),
      checked: asBoolean(obj.defaultChecked ?? obj.checked),
      disabled: asBoolean(obj.disabled),
      value: asString(obj.value, name),
    };
  }
  const label = asString(entry);
  return { label, name: label || fallbackName, description: "", checked: false, disabled: false, value: label || fallbackName };
}

interface SliderMark { value: number; label: string }

/**
 * Normalise the Slider's `marks` prop: bare tick positions (`[0, 50, 100]`) or
 * `{value, label}` objects for a labelled scale (`Low` / `Medium` / `High`).
 *
 * Both shapes are accepted for the same reason `extractOptionItems` accepts
 * both: the values usually arrive from a `$variable` holding plain API data.
 * Ticks outside the track are dropped — there is nowhere to draw them, and a
 * negative `left:` would push the label out of the component.
 */
function extractSliderMarks(raw: unknown, min: number, max: number): SliderMark[] {
  const out: SliderMark[] = [];
  for (const entry of asArray<unknown>(raw)) {
    if (entry && typeof entry === "object") {
      const obj = entry as { value?: unknown; label?: unknown };
      const value = asNumber(obj.value, NaN);
      if (!Number.isFinite(value)) continue;
      out.push({ value, label: asString(obj.label) });
      continue;
    }
    const value = asNumber(entry, NaN);
    if (!Number.isFinite(value)) continue;
    out.push({ value, label: "" });
  }
  return out.filter((mark) => mark.value >= min && mark.value <= max);
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
    "still accepted. Pass `href` to navigate instead (renders an `<a>` that " +
    "keeps the button styling — combine with `variant: \"link\"` for " +
    "\"Read the docs\" / \"View invoice\" links).",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable invoked when the button is clicked" },
    { name: "variant", type: "string", optional: true, aliases: ["tone"], enum: BUTTON_VARIANTS, description: "Visual style — `primary` solid brand button (`default` is its alias), `secondary` surface + border, `outline` transparent with primary border, `ghost` bare, `link` text-only (underlines on hover), `danger` destructive" },
    { name: "type", type: "string", optional: true, enum: ["button", "submit", "reset"], description: "HTML button type — `submit` submits the enclosing Form, `reset` clears it" },
    { name: "size", type: "string", optional: true, enum: BUTTON_SIZES, description: "Size token `xs|sm|md|lg|xl`" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
    { name: "iconPosition", type: "string", optional: true, enum: ["leading", "trailing"], description: "Icon placement (default leading)" },
    { name: "iconOnly", type: "boolean", optional: true, description: "Hide the label visually (keeps aria-label)" },
    { name: "loading", type: "boolean", optional: true, description: "Show a spinner, announce `aria-busy` and swallow clicks" },
    { name: "fullWidth", type: "boolean", optional: true },
    { name: "disabled", type: "boolean", optional: true },
    { name: "href", type: "string", optional: true, description: "Navigate to this URL — renders an `<a class=\"rui-button\">` instead of a `<button>`" },
  ],
  render: (_node, props, helpers) => {
    const loading = asBoolean(props.loading);
    const disabled = asBoolean(props.disabled);
    const iconOnly = asBoolean(props.iconOnly);
    const iconPosition = asString(props.iconPosition, "leading");
    const labelText = asString(props.label);
    const size = normaliseButtonSize(props.size);
    const rawHref = asString(props.href);
    const shell = {
      class: "rui-button",
      "data-variant": asString(props.variant, "primary"),
      "data-size": size,
      "data-icon-position": iconPosition,
      "data-icon-only": iconOnly ? "true" : null,
      "data-full-width": asBoolean(props.fullWidth) ? "true" : null,
      "data-loading": loading ? "true" : null,
      "aria-label": iconOnly ? labelText : null,
      // A busy button must stay focusable so the screen-reader user who
      // activated it is still on it when the state is announced — hence
      // `aria-busy` + `aria-disabled` rather than the `disabled` attribute
      // (which also silently swallows the announcement).
      "aria-busy": loading ? "true" : null,
      "aria-disabled": loading && !disabled ? "true" : null,
    };
    const button: HTMLElement = rawHref
      ? el("a", { ...shell, href: sanitiseHref(rawHref) })
      : el("button", {
          ...shell,
          type: asString(props.type, "button"),
          disabled: disabled ? "" : null,
        });
    const labelSpan = el("span", { class: "rui-button-label" }, [labelText]);
    const iconNode = renderIcon(props.icon, { className: "rui-button-icon" });
    // The icon font gives us a static glyph — `renderIcon("spinner")` emits no
    // rotation class and no theme rule animates `.rui-button-spinner`, so a
    // "loading" button showed a frozen icon that reads as a rendering glitch.
    // `.rui-spinner-ring` is the markup the theme already animates.
    const spinNode = loading
      ? el("span", { class: "rui-spinner rui-button-spinner", "data-size": size, "aria-hidden": "true" }, [
          el("span", { class: "rui-spinner-ring" }),
        ])
      : null;
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
    button.onclick = (event) => {
      // `preventDefault` matters for the two cases the guard alone misses: a
      // `type="submit"` button would still submit its form, and an `href`
      // button would still navigate, while a request is in flight.
      if (loading || disabled) { event.preventDefault(); return; }
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
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"], description: "Size token applied to every button in the group" },
    { name: "fullWidth", type: "boolean", optional: true, aliases: ["full"], description: "Stretch the group to fill its container, dividing width evenly" },
    { name: "ariaLabel", type: "string", optional: true, aliases: ["ariaLabelledBy", "label"], description: "Accessible name for the group (e.g. \"Time range\") — the group role is anonymous without it" },
  ],
  render: (_node, props, helpers) => {
    const size = asString(props.size);
    const root = el("div", {
      class: "rui-button-group",
      "data-size": size || "md",
      "data-full-width": asBoolean(props.fullWidth) ? "true" : null,
      role: "group",
      "aria-label": asString(props.ariaLabel) || null,
    });
    const items = asArray(props.items);
    items.forEach((child, i) => {
      const node = helpers.renderNode(child);
      if (node instanceof HTMLElement) {
        const pos = items.length === 1 ? "only" : i === 0 ? "start" : i === items.length - 1 ? "end" : "middle";
        node.setAttribute("data-pos", pos);
        node.classList.add("rui-button-group-item");
        // Sizing lives on the children (`.rui-button[data-size]`); nothing reads
        // `.rui-button-group[data-size]`, so the group token has to be pushed
        // down or it is a silent no-op and there is no compact ButtonGroup.
        if (size) node.setAttribute("data-size", size);
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
    ...FIELD_SHELL_PROPS,
  ],
  render: (_node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const error = asString(props.error);
    const invalid = asBoolean(props.invalid) || Boolean(error);
    const warning = asString(props.warning);
    const root = el("div", {
      class: "rui-input-group",
      // The group owns the border and the focus ring, so the invalid, warning and
      // disabled states have to be readable on the shell itself — the nested
      // field's own chrome is stripped by the theme and can never show them.
      //
      // All three, not just `error`: the shell's own state selectors reach
      // `.rui-input` / `.rui-select` / `.rui-textarea`, none of which is what
      // carries the border here — so a group that did not mirror them onto itself
      // signalled a bad value by message text alone.
      "data-disabled": disabled ? "true" : null,
      "data-invalid": invalid ? "true" : null,
      "data-warning": !invalid && warning ? "true" : null,
    });
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
    // Resolve the wrapped control: `disabled`, the validation aria and the
    // focus callbacks all have to land on a real form element, not on the shell.
    const control = root.querySelector<HTMLElement>(
      ".rui-input-group-field input, .rui-input-group-field select, " +
      ".rui-input-group-field textarea, .rui-input-group-field .rui-combobox-trigger",
    );
    if (control) {
      if (disabled) control.setAttribute("disabled", "");
      attachFocusHandlers(control, props, helpers);
      const controlId = control.getAttribute("id");
      // Gives `withFieldShell` a stem for the error/hint id it wires up below.
      if (controlId) root.setAttribute("id", `${controlId}-group`);
    }
    const shell = withFieldShell(root, props);
    if (control) {
      relocateControlAria(root, control);
      const controlId = control.getAttribute("id");
      const labelEl = shell === root ? null : shell.querySelector(".rui-field-label");
      // Point the shell's label at the nested control rather than at the group
      // div, so clicking the label focuses the field.
      if (labelEl && controlId) labelEl.setAttribute("for", controlId);
    }
    return shell;
  },
};

export const Input: ComponentSpec = {
  name: "Input",
  description: "Text input field. Pass a $variable as `value` for two-way binding. `onChange(value)` fires on every keystroke with the current string. Pass `label`/`hint`/`error`/`required` to render a labelled field shell with validation messaging. Use `autocomplete` on sign-in and address fields so password managers and browser autofill work, and `readOnly` for a locked-but-selectable value.",
  props: [
    { name: "id", type: "string", description: "Input identifier" },
    { name: "placeholder", type: "string", optional: true },
    { name: "type", type: "string", optional: true, enum: INPUT_TYPES },
    { name: "validations", type: "any", optional: true, description: "Array or object of validation hints (`required`, `minLength:n`, `maxLength:n`, `pattern:re`, `email`)" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" },
    ...FIELD_SHELL_PROPS,
    { name: "readOnly", type: "boolean", optional: true, aliases: ["readonly"], description: "Value is visible and selectable but not editable (unlike `disabled`, it stays in tab order and is submitted)" },
    { name: "autocomplete", type: "string", optional: true, aliases: ["autoComplete"], description: "Native autofill hint (e.g. `email`, `current-password`, `postal-code`)" },
    { name: "maxLength", type: "number", optional: true, aliases: ["maxlength"], description: "Maximum number of characters accepted" },
  ],
  render: (node, props, helpers) => {
    const explicitType = asString(props.type);
    const maxLength = Math.floor(asNumber(props.maxLength, 0));
    const input = el("input", {
      class: "rui-input",
      id: asString(props.id),
      name: asString(props.name, asString(props.id)),
      type: explicitType || "text",
      placeholder: asString(props.placeholder),
      // `valueAttr`, not `asString`: an absent attribute tells the morph
      // reconciler this render asserts no value, so an onChange-only field is
      // not wiped on every unrelated re-render.
      value: valueAttr(props.value),
      readonly: asBoolean(props.readOnly) ? "" : null,
      autocomplete: asString(props.autocomplete) || null,
      maxlength: maxLength > 0 ? String(maxLength) : null,
    }) as HTMLInputElement;
    bindToStateAtArg(input, node, 4, helpers);
    bindChangeHandler(input, props, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    attachFocusHandlers(input, props, helpers);
    applyValidations(input, props.validations, explicitType !== "");
    return withFieldShell(input, props);
  },
};

export const TextArea: ComponentSpec = {
  name: "TextArea",
  description: "Multi-line text input. `onChange(value)` fires on every keystroke with the current text. Pass `label`/`hint`/`error`/`required` for a labelled field shell, `maxLength` to cap the length (drives a \"120/280\" counter), and `autoResize` for a composer that grows with its content.",
  props: [
    { name: "id", type: "string" },
    { name: "placeholder", type: "string", optional: true },
    { name: "rows", type: "number", optional: true },
    { name: "value", type: "any", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" },
    ...FIELD_SHELL_PROPS,
    { name: "maxLength", type: "number", optional: true, aliases: ["maxlength"], description: "Maximum number of characters accepted" },
    { name: "readOnly", type: "boolean", optional: true, aliases: ["readonly"], description: "Content is scrollable and selectable but not editable (stays in tab order, unlike `disabled`)" },
    { name: "autoResize", type: "boolean", optional: true, description: "Grow the box to fit its content instead of showing an inner scrollbar" },
  ],
  render: (node, props, helpers) => {
    const text = asString(props.value);
    const autoResize = asBoolean(props.autoResize);
    const baseRows = Number(props.rows ?? 4) || 4;
    // The morph reconciler strips an inline height the fresh render does not
    // carry, so the JS fit below cannot be the only sizing channel: seed `rows`
    // from the content's line count so a re-render never collapses the box.
    const rows = autoResize ? Math.max(baseRows, text.split("\n").length) : baseRows;
    const maxLength = Math.floor(asNumber(props.maxLength, 0));
    const textarea = el("textarea", {
      class: "rui-textarea",
      id: asString(props.id),
      name: asString(props.id),
      placeholder: asString(props.placeholder),
      rows: String(rows),
      maxlength: maxLength > 0 ? String(maxLength) : null,
      readonly: asBoolean(props.readOnly) ? "" : null,
      "data-auto-resize": autoResize ? "true" : null,
    }) as HTMLTextAreaElement;
    textarea.value = text;
    bindToStateAtArg(textarea, node, 3, helpers);
    bindChangeHandler(textarea, props, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLTextAreaElement).value,
    });
    if (autoResize) {
      const fit = (target: HTMLTextAreaElement): void => {
        target.style.height = "auto";
        target.style.height = `${target.scrollHeight}px`;
      };
      composeHandler(textarea, "oninput", (event) => {
        const live = (event.currentTarget ?? event.target) as HTMLTextAreaElement | null;
        if (live) fit(live);
      });
      // Size the initial paint. `isConnected` is the morph guard: on a
      // re-render this node is the discarded snapshot and the live one is
      // already sized, so the call must be a no-op there.
      const cancel = deferToPaint(() => { if (textarea.isConnected) fit(textarea); });
      helpers.registerDisposer(cancel, "textarea-autoresize");
    }
    attachFocusHandlers(textarea, props, helpers, (n) => (n as HTMLTextAreaElement).value);
    return withFieldShell(textarea, props);
  },
};

export const SelectItem: ComponentSpec = {
  name: "SelectItem",
  description:
    "Single option for a Select/Radio/Combobox list. Set `disabled` for an " +
    "option that must stay visible but unselectable (\"Out of stock\", " +
    "\"Enterprise plan — upgrade required\"), and `group` to bucket long " +
    "lists under `<optgroup>` headings.",
  props: [
    { name: "value", type: "string" },
    { name: "label", type: "string" },
    { name: "disabled", type: "boolean", optional: true, description: "Render the option greyed out and unselectable" },
    { name: "group", type: "string", optional: true, description: "Optgroup heading this option belongs to" },
  ],
  render: (_node, props) => {
    return el("option", {
      value: asString(props.value),
      disabled: asBoolean(props.disabled) ? "" : null,
      // Read back by Select to bucket the option under an `<optgroup>`.
      "data-group": asString(props.group) || null,
    }, [asString(props.label)]);
  },
};

export const Select: ComponentSpec = {
  name: "Select",
  description:
    "Dropdown select. Pass a `$variable` as `value` for two-way binding. " +
    "Set `searchable: true` for a combobox-style filter UI on long option " +
    "lists, or pass `onSearch` (which implies it) to fetch the matches from " +
    "the server as the user types. `onChange(value)` fires with the " +
    "newly-selected value. `items` accepts `SelectItem(value, label)` nodes, " +
    "`{value, label}` objects and bare strings.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) nodes, {value, label} objects or bare strings" },
    { name: "label", type: "string", optional: true },
    { name: "placeholder", type: "string", optional: true },
    { name: "value", type: "any", optional: true },
    { name: "searchable", type: "boolean", optional: true, description: "Render as a filterable combobox" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required" },
    { name: "disabled", type: "boolean", optional: true, description: "Disable the control (non-editable, skipped by tab order)" },
    { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Called with the current value when focus leaves the control (validate-on-blur)" },
    { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Called when the control gains focus" },
    { name: "loading", type: "boolean", optional: true, description: "Options are still being fetched — disables the control and shows a loading option instead of an empty list" },
    { name: "onSearch", type: "callable", optional: true, description: "Called with the query ~200ms after typing stops, for server-side search (implies `searchable`; supply the matches as `items`)" },
    { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context (a picker under a section heading that names it, a control in a table cell whose column header is the label)" },
    // Appended, not inserted: `value` is read from positional slot 4 by
    // `bindToStateAtArg`, so anything placed ahead of it silently breaks
    // two-way binding at every existing call site.
    { name: "emptyLabel", type: "string", optional: true, description: "Shown in place of the options when there are none — the difference between \"this list is genuinely empty\" and \"something failed to load\". Defaults to \"No options\"" },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    // `onSearch` implies `searchable`. A native <select> has no query to report,
    // so honouring the handler on the plain branch is impossible — and silently
    // accepting a prop that can never fire is how a "search does nothing" bug
    // survives a code review.
    if (asBoolean(props.searchable) || props.onSearch != null) {
      return renderSearchableSelect(node, props, helpers);
    }
    const loading = asBoolean(props.loading);
    const select = el("select", {
      class: "rui-select",
      id: asString(props.id),
      name: asString(props.id),
      "data-loading": loading ? "true" : null,
      // An empty dropdown is indistinguishable from "no results", so a loading
      // select locks itself rather than inviting a pick from nothing.
      disabled: loading ? "" : null,
    }) as HTMLSelectElement;
    const placeholder = asString(props.placeholder);
    if (loading) {
      select.append(el("option", { value: "", disabled: "", selected: "" }, ["Loading…"]));
    } else if (placeholder) {
      select.append(el("option", { value: "", disabled: "", selected: "" }, [placeholder]));
    }
    // `<optgroup>` buckets, created on first use so option order is preserved.
    const groups = new Map<string, HTMLElement>();
    let optionCount = 0;
    const placeOption = (option: HTMLElement): void => {
      optionCount += 1;
      const group = option.getAttribute("data-group");
      if (!group) { select.append(option); return; }
      let bucket = groups.get(group);
      if (!bucket) {
        bucket = el("optgroup", { label: group });
        groups.set(group, bucket);
        select.append(bucket);
      }
      bucket.append(option);
    };
    for (const entry of asArray<unknown>(props.items)) {
      // ComponentNodes go through SelectItem.render so there is one
      // implementation of an option; anything else (a `{value,label}` object
      // straight out of an API, a bare string) is normalised here. Rendering
      // those through `renderNode` produced an empty text node, i.e. a
      // completely blank dropdown with no error anywhere.
      if (isComponentNodeLike(entry)) {
        const rendered = helpers.renderNode(entry);
        if (rendered instanceof HTMLElement) placeOption(rendered);
        else select.append(rendered);
        continue;
      }
      for (const item of extractOptionItems([entry])) {
        placeOption(el("option", {
          value: item.value,
          disabled: item.disabled ? "" : null,
          "data-group": item.group || null,
        }, [item.label]));
      }
    }
    // A dropdown that opens onto nothing reads as a broken control, not as an
    // empty list — which is exactly the wrong impression for a picker whose
    // options come from an API that legitimately answered with none. Combobox
    // and MultiSelect have said so via `emptyLabel` all along; this is the same
    // affordance on the native branch. Only when NOT loading: `loading` already
    // renders its own option and means something different.
    if (optionCount === 0 && !loading) {
      select.append(el("option", { value: "", disabled: "", selected: "" }, [
        asString(props.emptyLabel) || "No options",
      ]));
    }
    select.value = asString(props.value);
    bindToStateAtArg(select, node, 4, helpers);
    bindChangeHandler(select, props, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLSelectElement).value,
    });
    attachFocusHandlers(select, props, helpers, (n) => (n as HTMLSelectElement).value);
    return withFieldShell(select, props);
  },
};

export const Checkbox: ComponentSpec = {
  name: "Checkbox",
  description:
    "Boolean checkbox. `onChange(checked)` fires with the new boolean state. " +
    "Pass `required`/`error` for the \"I accept the Terms\" pattern, " +
    "`description` for a secondary line, and `indeterminate` for a " +
    "\"select all\" header over a partially-selected list.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string" },
    { name: "value", type: "boolean", optional: true, aliases: ["checked"] },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new boolean value" },
    { name: "disabled", type: "boolean", optional: true, description: "Disable the control (non-editable, skipped by tab order)" },
    { name: "description", type: "string", optional: true, description: "Secondary line under the label (e.g. \"Sent every Monday at 9am\")" },
    { name: "required", type: "boolean", optional: true, description: "Mark the checkbox required (native validation blocks submit until ticked)" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
    { name: "indeterminate", type: "boolean", optional: true, description: "Tri-state \"partially checked\" dash (a parent of a partly-selected list)" },
    { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a checkbox in a table cell whose column header already carries the name" },
    ...fieldShellExtraProps(["description"]),
  ],
  render: (node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const indeterminate = asBoolean(props.indeterminate);
    const description = asString(props.description);
    const wrapper = el("label", {
      class: "rui-checkbox",
      "data-disabled": disabled ? "true" : null,
      "data-has-description": description ? "true" : null,
    });
    const isChecked = asBoolean(props.value);
    const input = el("input", {
      type: "checkbox",
      id: asString(props.id),
      name: asString(props.id),
      checked: isChecked ? "" : null,
      disabled: disabled ? "" : null,
      // The DOM property below is the thing browsers paint; the attribute is
      // what survives a morph pass, and it is what the deferred sync reads.
      "data-indeterminate": indeterminate ? "true" : null,
    }) as HTMLInputElement;
    input.checked = isChecked;
    input.indeterminate = indeterminate;
    // `indeterminate` has no HTML attribute, so morph cannot carry a change of
    // it onto the node it keeps. Remember the live input in instance state the
    // first time we see it connected, and re-apply on every later render.
    const liveInput = helpers.useInstanceState<HTMLInputElement | null>("live-input", null);
    const cancelSync = deferToPaint(() => {
      const live = input.isConnected ? input : liveInput.get();
      if (!live?.isConnected) return;
      liveInput.set(live);
      live.indeterminate = indeterminate;
    });
    helpers.registerDisposer(cancelSync, "checkbox-indeterminate");
    bindToStateAtArg(input, node, 2, helpers);
    bindChangeHandler(input, props, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).checked,
    });
    // `labelHidden` keeps the label in the accessibility tree and takes it off
    // the screen — the correct treatment for a checkbox in a grid cell, where the
    // column header is the name and repeating it in every row is noise. It is
    // NOT `display: none` / `aria-hidden`, either of which would leave the box
    // unnamed for the users who most need the name. Same contract as the
    // `labelHidden` on every field-shell input (see forms-shared.ts).
    const labelSpan = el("span", {
      class: asBoolean(props.labelHidden)
        ? "rui-checkbox-label rui-visually-hidden"
        : "rui-checkbox-label",
    }, [asString(props.label)]);
    if (description) {
      // Same classes CheckBoxItem uses, so the existing two-line styling applies.
      const stack = el("span", { class: "rui-checkbox-item-text" });
      stack.append(labelSpan, el("span", { class: "rui-checkbox-item-description" }, [description]));
      wrapper.append(input, stack);
    } else {
      wrapper.append(input, labelSpan);
    }
    // The visible label is inline next to the box, so the shell must not render
    // a second one — it only contributes the required/error/hint machinery.
    //
    // `description` is nulled for the same reason and it is NOT optional: this
    // component has owned a `description` prop of its own since long before the
    // shell had one, and it has already rendered it as the secondary line under
    // the label above. Forwarding it would print the same sentence twice.
    const shell = withFieldShell(wrapper, { ...props, label: null, description: null });
    // …and those attributes have to end up on the input, not on the `<label>`.
    relocateControlAria(wrapper, input);
    return shell;
  },
};

export const CheckBoxItem: ComponentSpec = {
  name: "CheckBoxItem",
  description:
    "Single option inside a CheckBoxGroup. `disabled` locks one option (a " +
    "scope the current plan tier does not include) while the rest stay " +
    "editable; `value` is the string submitted for the option when it differs " +
    "from its `name` key.",
  props: [
    { name: "label", type: "string" },
    { name: "name", type: "string", description: "Key inside the group's value object" },
    { name: "description", type: "string", optional: true },
    { name: "defaultChecked", type: "boolean", optional: true, aliases: ["checked"] },
    { name: "disabled", type: "boolean", optional: true, description: "Lock this option (greyed out, not togglable)" },
    { name: "value", type: "string", optional: true, description: "Submitted value for this option (defaults to `name`) — use when the group maps to an array of ids" },
  ],
  render: (_node, props) => {
    const itemName = asString(props.name);
    const label = asString(props.label);
    const description = asString(props.description);
    const isChecked = asBoolean(props.defaultChecked);
    const disabled = asBoolean(props.disabled);
    const wrapper = el("label", {
      class: "rui-checkbox-item",
      "data-name": itemName,
      "data-disabled": disabled ? "true" : null,
    });
    const input = el("input", {
      type: "checkbox",
      name: itemName,
      value: asString(props.value, itemName),
      checked: isChecked ? "" : null,
      disabled: disabled ? "" : null,
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
  description:
    "Group of checkboxes. Value is an object keyed by item name. Pass a " +
    "`$variable` for two-way binding. `onChange(value)` fires with the full " +
    "updated object. `items` accepts `CheckBoxItem(label, name, …)` nodes and " +
    "plain `{label, name, description, checked, disabled}` objects. Pass " +
    "`label` for the group heading (\"Permissions\") and `error` for " +
    "\"Select at least one scope\".",
  props: [
    { name: "name", type: "string", description: "Group identifier" },
    { name: "items", type: "CheckBoxItem[]" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated `{name: checked}` object when any item toggles" },
    { name: "label", type: "string", optional: true, description: "Group heading — also becomes the group's accessible name" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the group" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the group (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the group required (adds a `*` to the heading)" },
    { name: "disabled", type: "boolean", optional: true, description: "Lock every item in the group" },
    { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context (a picker under a section heading that names it, a control in a table cell whose column header is the label)" },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    const groupName = asString(props.name);
    const groupDisabled = asBoolean(props.disabled);
    const groupLabel = asString(props.label);
    const root = el("div", {
      class: "rui-checkbox-group",
      role: "group",
      id: groupName ? `${groupName}-group` : null,
      "data-name": groupName,
      "data-disabled": groupDisabled ? "true" : null,
      // A bare `role="group"` announces nothing; replaced by `aria-labelledby`
      // below when the shell renders the visible heading.
      "aria-label": groupLabel || null,
    });
    const valueObject = (props.value && typeof props.value === "object")
      ? (props.value as Record<string, unknown>)
      : {};

    asArray<unknown>(props.items).forEach((entry, idx) => {
      const item = extractCheckItem(entry, groupName, idx);
      // One implementation of an item: ComponentNodes render through
      // CheckBoxItem, plain objects are normalised into the same props and
      // rendered by the same code. The group only post-processes what it owns —
      // the label/input association and the bound checked state — so a change
      // to CheckBoxItem is visible inside groups too.
      const rendered = isComponentNodeLike(entry)
        ? helpers.renderNode(entry)
        : CheckBoxItem.render(entry as ComponentNode, {
            label: item.label,
            name: item.name,
            description: item.description,
            defaultChecked: item.checked,
            disabled: item.disabled,
            value: item.value,
          }, helpers);
      if (!(rendered instanceof HTMLElement)) { root.append(rendered); return; }
      const input = rendered.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (input) {
        const itemName = input.getAttribute("name") || item.name;
        const id = `${groupName}-${itemName}`;
        input.setAttribute("name", itemName);
        input.setAttribute("id", id);
        rendered.setAttribute("for", id);
        rendered.setAttribute("data-name", itemName);
        const isChecked = itemName in valueObject
          ? Boolean(valueObject[itemName])
          : input.checked;
        input.checked = isChecked;
        if (isChecked) input.setAttribute("checked", "");
        else input.removeAttribute("checked");
        if (groupDisabled) {
          input.disabled = true;
          input.setAttribute("disabled", "");
          rendered.setAttribute("data-disabled", "true");
        }
      }
      root.append(rendered);
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
    // Property handler, not `addEventListener`: an `onChange` that is null on
    // the first render (a read-only view that later flips to editable) would
    // otherwise never attach, so toggles applied visibly and were never saved.
    bindChangeHandler(root, props, helpers, {
      event: "change",
      getValue: (n) => readGroupValue(n as HTMLElement),
    });

    const shell = withFieldShell(root, props);
    if (shell !== root) {
      const labelEl = shell.querySelector(".rui-field-label");
      if (labelEl && groupName) {
        // `<label for>` cannot target a group container, so name the group by
        // reference to the visible heading instead.
        labelEl.removeAttribute("for");
        const labelId = `${groupName}-group-label`;
        labelEl.setAttribute("id", labelId);
        root.setAttribute("aria-labelledby", labelId);
        root.removeAttribute("aria-label");
      }
    }
    return shell;
  },
};

export const Radio: ComponentSpec = {
  name: "Radio",
  description:
    "Radio button group. `onChange(value)` fires with the newly-selected " +
    "option value. Always pass `label` — the question being answered " +
    "(\"Shipping method\") — and use `direction: \"row\"` for a Yes/No or " +
    "Monthly/Yearly pair. `items` accepts `SelectItem(value, label)` nodes, " +
    "`{value, label, disabled}` objects and bare strings. Pass `slots` to hang " +
    "a control off an option's own row (\"Fixed  [– 3 +]\", \"Card  [number]\") — " +
    "one entry per item, aligned by index; the slot renders OUTSIDE the " +
    "`<label>`, so clicking the control does not select the option.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) nodes, {value, label, disabled} objects or bare strings" },
    { name: "value", type: "any", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected radio value" },
    { name: "label", type: "string", optional: true, description: "The question the group answers — also its accessible name" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the group" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the group (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the group required (adds a `*` to the label)" },
    { name: "disabled", type: "boolean", optional: true, description: "Lock every option in the group" },
    { name: "direction", type: "string", optional: true, enum: ["row", "column"], description: "Layout of the options (default `column`)" },
    { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context (a picker under a section heading that names it, a control in a table cell whose column header is the label)" },
    // Declared last: the controlled `value` channel reads its state ref from
    // argMeta slot 2, so nothing may be inserted ahead of it.
    { name: "slots", type: "Node[]", optional: true, description: "Per-option trailing content, aligned by index with `items` — rendered beside the option, outside its `<label>`, so a control in the slot stays independently clickable. Use `null` for an option that has none." },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    const groupName = asString(props.id);
    const groupLabel = asString(props.label);
    const groupDisabled = asBoolean(props.disabled);
    const isRow = asString(props.direction, "column") === "row";
    // A slot is a sibling of the option, not a child of it: an interactive
    // control inside the `<label>` would select the radio on every click.
    // Present-but-empty entries are kept so index alignment survives a caller
    // that only decorates the second option.
    const slots = props.slots === undefined || props.slots === null ? null : asArray<unknown>(props.slots);
    const root = el("div", {
      class: "rui-radio-group",
      role: "radiogroup",
      id: groupName ? `${groupName}-group` : null,
      "data-direction": isRow ? "row" : "column",
      "data-slots": slots ? "true" : null,
      "data-disabled": groupDisabled ? "true" : null,
      // Named here so the group is not announced as an anonymous "radio group";
      // swapped for `aria-labelledby` when the shell renders a visible label.
      "aria-label": groupLabel || null,
      // The stylesheet hard-codes a column, so the inline override is what
      // actually makes `direction: "row"` work today.
      style: isRow ? "flex-direction: row; flex-wrap: wrap" : null,
    });
    const current = asString(props.value);
    extractOptionItems(props.items).forEach((item, idx) => {
      // Fall back to the index when the value is empty: every option used to
      // resolve to `id="${group}-"`, and duplicate ids also poison morph's
      // keyed reconciliation (it keys elements by id), so two rows could be
      // matched to each other across renders.
      const id = `${groupName}-${item.value || idx}`;
      const itemDisabled = groupDisabled || item.disabled;
      const itemRoot = el("label", {
        class: "rui-radio",
        for: id,
        "data-disabled": itemDisabled ? "true" : null,
      });
      const isChecked = current !== "" && current === item.value;
      const input = el("input", {
        type: "radio",
        id,
        name: groupName,
        value: item.value,
        checked: isChecked ? "" : null,
        disabled: itemDisabled ? "" : null,
      }) as HTMLInputElement;
      input.checked = isChecked;
      itemRoot.append(input, el("span", { class: "rui-radio-label" }, [item.label]));
      if (!slots) {
        root.append(itemRoot);
        return;
      }

      // `readRadioValue` scans for `input[type="radio"]:checked` anywhere under
      // the group root, so the extra wrapper does not disturb the delegated
      // change handler.
      const row = el("div", { class: "rui-radio-row" }, [itemRoot]);
      const slot = slots[idx];
      if (slot !== undefined && slot !== null && slot !== false && slot !== "") {
        row.append(el("div", { class: "rui-radio-slot" }, [helpers.renderNode(slot)]));
      }
      root.append(row);
    });
    // Delegation on the group root, wired as a property: a per-input
    // `addEventListener` froze every reused radio on its first render's
    // callback, so after the list was re-sorted picking an option ran the
    // previous occupant's lambda.
    const stateName = node.argMeta?.[2]?.stateRef;
    if (stateName) {
      helpers.bindState(root, stateName, { event: "change", getValue: readRadioValue });
    }
    bindChangeHandler(root, props, helpers, {
      event: "change",
      getValue: (n) => readRadioValue(n),
    });
    const shell = withFieldShell(root, props);
    if (shell !== root) {
      const labelEl = shell.querySelector(".rui-field-label");
      if (labelEl && groupName) {
        // `<label for>` cannot target a radiogroup container.
        labelEl.removeAttribute("for");
        const labelId = `${groupName}-group-label`;
        labelEl.setAttribute("id", labelId);
        root.setAttribute("aria-labelledby", labelId);
        root.removeAttribute("aria-label");
      }
    }
    return shell;
  },
};

/** Current value of a radio group, resolved from the live DOM under `scope`. */
function readRadioValue(scope: HTMLElement): string {
  if (scope instanceof HTMLInputElement) return scope.value;
  return scope.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value ?? "";
}

export const FormControl: ComponentSpec = {
  name: "FormControl",
  description:
    "Labeled wrapper around a single form field. The label is associated with " +
    "the nested control automatically (override with `for`), and " +
    "`error`/`required` give a validation slot to fields that have none of " +
    "their own (Checkbox, Radio, CheckBoxGroup).",
  props: [
    { name: "label", type: "string" },
    { name: "field", type: "Node", aliases: ["control"] },
    { name: "hint", type: "string", optional: true },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the field (marks the control invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*` and the `required` attribute)" },
    { name: "for", type: "string", optional: true, aliases: ["htmlFor"], description: "Id of the control the label points at — only needed when the nested field has no `id` of its own" },
    // The same five the field shell grew, implemented here rather than spread:
    // this component wires its own label/message and does not call
    // `withFieldShell`, so a spread would declare props nothing reads.
    ...fieldShellExtraProps(),
  ],
  render: (_node, props, helpers) => {
    const labelText = asString(props.label);
    const hint = asString(props.hint);
    const error = asString(props.error);
    const warning = asString(props.warning);
    // A NODE as well as a string, unlike the field shell's: guidance often has to
    // carry a link ("reserved via <IP Management>", "see the <docs>"), and this is
    // the component that exists for composing a field by hand — it already takes
    // its control as a node. The shell cannot do the same: it is a plain function
    // with no renderer to hand.
    const descriptionNode = isComponentNodeLike(props.description)
      ? helpers.renderNode(props.description)
      : null;
    const description = descriptionNode ? "" : asString(props.description);
    const required = asBoolean(props.required);
    const invalid = asBoolean(props.invalid) || Boolean(error);
    // Same rule as the field shell: `required` wins, `true` means the built-in
    // English word, a string says it another way.
    const optionalText = required
      ? ""
      : props.optional === true
        ? "(optional)"
        : asString(props.optional);
    const root = el("div", {
      class: "rui-form-control",
      "data-invalid": invalid ? "true" : null,
      "data-warning": !invalid && warning ? "true" : null,
    });
    // Render the field FIRST: the label needs the control's id to point at, and
    // a sibling `<label>` with no `for` leaves every wrapped field anonymous —
    // "edit text, blank" in VoiceOver, and clicking the label does nothing.
    const fieldEl = helpers.renderNode(props.field);
    const control = fieldEl instanceof HTMLElement
      ? (fieldEl.matches("input, select, textarea")
          ? fieldEl
          : fieldEl.querySelector<HTMLElement>("input, select, textarea, .rui-combobox-trigger, .rui-multiselect-trigger"))
      : null;
    const controlId = asString(props.for) || control?.getAttribute("id") || "";
    const labelEl = el("label", { class: "rui-form-label", for: controlId || null }, [labelText]);
    if (required) labelEl.append(el("span", { class: "rui-field-required", "aria-hidden": "true" }, ["*"]));
    else if (optionalText) labelEl.append(el("span", { class: "rui-field-optional" }, [optionalText]));
    root.append(labelEl);
    // Guidance between the label and the field, so the reader has it before the
    // control rather than after — the order the field shell uses too.
    const describedByIds: string[] = [];
    if (description || descriptionNode) {
      const descriptionId = controlId ? `${controlId}-description` : "";
      // `<p>` for a string, `<div>` for a node. A paragraph may only contain
      // PHRASING content, and a node description is whatever the author composed —
      // `Markdown` alone renders a `<div>`. Wrapping that in a `<p>` produces markup
      // no parser would accept, and it is the element a field points
      // `aria-describedby` at, so it is exactly the wrong place to be invalid.
      const wrap = el(descriptionNode ? "div" : "p", {
        class: "rui-field-description",
        id: descriptionId || null,
      });
      if (descriptionNode) wrap.append(descriptionNode);
      else wrap.append(document.createTextNode(description));
      root.append(wrap);
      if (descriptionId) describedByIds.push(descriptionId);
    }
    root.append(fieldEl);
    // One message slot, error > warning > hint.
    const message = error
      ? {node: el("div", {class: "rui-field-error", id: controlId ? `${controlId}-error` : null, role: "alert"}, [error]), id: controlId ? `${controlId}-error` : ""}
      : warning
        ? {node: el("div", {class: "rui-field-warning", id: controlId ? `${controlId}-warning` : null, role: "status", "aria-live": "polite"}, [warning]), id: controlId ? `${controlId}-warning` : ""}
        : hint
          ? {node: el("p", {class: "rui-form-hint", id: controlId ? `${controlId}-hint` : null}, [hint]), id: controlId ? `${controlId}-hint` : ""}
          : null;
    if (message) {
      root.append(message.node);
      if (message.id) describedByIds.push(message.id);
    }
    if (control) {
      if (required) control.setAttribute("required", "");
      if (invalid) control.setAttribute("aria-invalid", "true");
      // MERGE, like the field shell: a composite field may already point at its
      // own counter or range, and overwriting drops it.
      const authorIds = asString(props.describedBy).split(/\s+/).filter(Boolean);
      const allIds = [...describedByIds, ...authorIds];
      if (allIds.length > 0) {
        const existing = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
        control.setAttribute("aria-describedby", [...new Set([...existing, ...allIds])].join(" "));
      }
      // No id to hang a `for` on — name the control directly instead.
      if (!controlId && labelText) control.setAttribute("aria-label", labelText);
      // `<label for>` only names *labelable* elements. A composite control does
      // not qualify (the MultiSelect trigger is a `div role="combobox"` so its
      // chips can carry their own remove buttons), so the association has to be
      // spelled out by id or the field is announced with no name at all.
      else if (controlId && labelText && !control.matches("input, select, textarea, button")) {
        labelEl.setAttribute("id", `${controlId}-label`);
        control.setAttribute("aria-labelledby", `${controlId}-label`);
      }
    }
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
    { name: "clearable", type: "boolean", optional: true, description: "Show a clear (×) button while the query is non-empty (default true)" },
    { name: "onClear", type: "callable", optional: true, description: "Called after the query is cleared — the bound `$variable` is emptied for you" },
    { name: "disabled", type: "boolean", optional: true, description: "Lock the field (e.g. while results are loading or the dataset is unavailable)" },
    { name: "loading", type: "boolean", optional: true, description: "Swap the magnifying glass for a spinner while a search is in flight" },
    { name: "ariaLabel", type: "string", optional: true, description: "Accessible name for the field (defaults to the placeholder, then \"Search\")" },
  ],
  render: (node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const loading = asBoolean(props.loading);
    const value = asString(props.value);
    const placeholder = asString(props.placeholder, "Search…");
    const root = el("form", {
      class: "rui-search-bar",
      role: "search",
      "data-disabled": disabled ? "true" : null,
      "data-loading": loading ? "true" : null,
    });
    root.onsubmit = (event) => {
      event.preventDefault();
      if (disabled) return;
      helpers.invoke(props.onSubmit);
    };
    // A debounced remote search otherwise gives the user no feedback at all:
    // the leading slot is the only state channel this control has.
    const iconWrap = loading
      ? el("span", { class: "rui-search-bar-icon rui-spinner", "aria-hidden": "true" }, [
          el("span", { class: "rui-spinner-ring" }),
        ])
      : renderIcon("magnifying-glass", { className: "rui-search-bar-icon" })
        ?? el("span", { class: "rui-search-bar-icon", "aria-hidden": "true" });
    root.append(iconWrap);
    const input = el("input", {
      class: "rui-search-bar-input",
      id: asString(props.id),
      name: asString(props.id),
      type: "search",
      placeholder,
      value: valueAttr(props.value),
      autocomplete: "off",
      disabled: disabled ? "" : null,
      // A placeholder is not a label: it is not exposed as a name by all AT and
      // it disappears the moment the user types.
      "aria-label": asString(props.ariaLabel) || placeholder || "Search",
    }) as HTMLInputElement;
    bindToStateAtArg(input, node, 2, helpers);
    bindChangeHandler(input, props, helpers, {
      event: "input",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    root.append(input);
    // The theme suppresses the native `::-webkit-search-cancel-button`, so
    // without this the styled component is strictly worse than a bare Input:
    // there is no way to reset the query in one gesture.
    if (asBoolean(props.clearable, true) && value !== "" && !disabled) {
      const clearBtn = el("button", {
        type: "button",
        class: "rui-search-bar-clear",
        "aria-label": "Clear search",
      }, ["×"]);
      clearBtn.onclick = (event) => {
        const origin = (event.currentTarget ?? event.target) as Element;
        const live = origin.closest(".rui-search-bar")
          ?.querySelector<HTMLInputElement>(".rui-search-bar-input");
        if (live) {
          live.value = "";
          // Re-dispatch so the state binding and `onChange` run through exactly
          // the same path as a keystroke.
          live.dispatchEvent(new Event("input", { bubbles: true }));
          live.focus();
        }
        helpers.invoke(props.onClear);
      };
      root.append(clearBtn);
    }
    const shortcut = asString(props.shortcut);
    if (shortcut) root.append(el("span", { class: "rui-search-bar-shortcut" }, [shortcut]));
    if (props.onSubmit != null) {
      const btn = el("button", {
        type: "submit",
        class: "rui-search-bar-submit",
        disabled: disabled ? "" : null,
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
    { name: "error", type: "string", optional: true, description: "Form-level error rendered above the actions (\"Invalid credentials\", \"That email is already registered\")" },
    { name: "loading", type: "boolean", optional: true, aliases: ["submitting"], description: "A submit is in flight — marks the form `aria-busy`, disables its submit buttons and blocks re-entry" },
  ],
  render: (_node, props, helpers) => {
    const loading = asBoolean(props.loading);
    const error = asString(props.error);
    const form = el("form", {
      class: "rui-form",
      id: asString(props.id),
      "data-loading": loading ? "true" : null,
      "data-invalid": error ? "true" : null,
      "aria-busy": loading ? "true" : null,
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      // Without this a second Enter / click while the request is in flight
      // submits the form twice.
      if (loading) return;
      helpers.invoke(props.onSubmit);
    };
    for (const field of asArray(props.fields)) form.append(helpers.renderNode(field));
    // Server-side failures are form-level, not field-level, and belong where
    // the user is already looking after pressing submit.
    if (error) {
      form.append(el("div", { class: "rui-form-error rui-field-error", role: "alert" }, [error]));
    }
    if (props.buttons) {
      const actions = el("div", { class: "rui-form-actions" });
      actions.append(helpers.renderNode(props.buttons));
      form.append(actions);
      if (loading) {
        // The author should not have to thread `loading` into every Button by
        // hand just to stop a double submit.
        actions.querySelectorAll<HTMLElement>('button[type="submit"]')
          .forEach((btn) => { btn.setAttribute("disabled", ""); btn.setAttribute("aria-busy", "true"); });
      }
    }
    return form;
  },
};

export const Slider: ComponentSpec = {
  name: "Slider",
  description:
    "Range slider for selecting a single numeric value between `min` and " +
    "`max`. Pass a `$variable` as `value` for two-way binding. Useful for " +
    "filters, settings (volume, brightness), and parameter tuning. Use " +
    "`suffix` (\"%\", \" ms\") or `format` (\"${value}\") so the displayed " +
    "value carries its unit, and `marks` for a ticked or named scale " +
    "(`[0, 50, 100]`, or `[{value: 1, label: \"Low\"}, …]` — a mark's label " +
    "replaces the numeric readout when the slider sits on it). Single-thumb " +
    "only: there is no two-handle range. For a `$50 – $400` filter use two " +
    "Sliders that bound each other — `Slider(\"lo\", value: $lo, max: $hi)` " +
    "above `Slider(\"hi\", value: $hi, min: $lo)` — which the browser then " +
    "keeps ordered, since `min`/`max` accept `$variables`.",
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
    { name: "suffix", type: "string", optional: true, description: "Unit appended to the displayed value (e.g. \"%\", \" ms\")" },
    { name: "format", type: "string", optional: true, description: "Display template — `{value}` is replaced by the number (e.g. \"${value}\"). Without a placeholder it behaves like `suffix`." },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the slider" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the slider (marks it invalid)" },
    { name: "marks", type: "any[]", optional: true, description: "Tick scale: numbers (`[0, 50, 100]`) or `{value, label}` objects. A mark's label becomes the readout and the announced value when the slider is on it." },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    const label = asString(props.label);
    const explicitId = asString(props.id);
    // Without an id the label rendered `for=""` against `id=""`, so the slider
    // was announced as an unnamed "slider, 50" and clicking the label did
    // nothing. Derive a stable id from the label text instead.
    const id = explicitId || fallbackFieldId("rui-slider", label);
    const min = asNumber(props.min, 0);
    const max = asNumber(props.max, 100);
    const step = asNumber(props.step, 1);
    const value = asNumber(props.value, min);
    const suffix = asString(props.suffix);
    const format = asString(props.format);
    const marks = extractSliderMarks(props.marks, min, max);
    /** The label of the mark sitting exactly on `raw`, if any. */
    const markLabel = (raw: string | number): string =>
      marks.find((mark) => mark.label && mark.value === Number(raw))?.label ?? "";
    // `showValue` printed the bare number, so a percentage / price / duration
    // slider had no way to display its unit.
    const display = (raw: string | number): string => {
      const text = String(raw);
      // A named step ("Medium") is the whole point of labelling it, so it wins
      // over the numeric template — the number is meaningless on such a scale.
      const named = markLabel(raw);
      if (named) return named;
      if (format.includes("{value}")) return format.replace("{value}", text);
      if (format.includes("{}")) return format.replace("{}", text);
      if (format) return `${text}${format}`;
      return suffix ? `${text}${suffix}` : text;
    };
    /** Whether the readout differs from the raw number, i.e. AT needs telling. */
    const needsValueText = (raw: string | number): boolean =>
      Boolean(format || suffix || markLabel(raw));
    const root = el("div", { class: "rui-slider", "data-disabled": asBoolean(props.disabled) ? "true" : "false" });
    const showValue = asBoolean(props.showValue);
    if (label || showValue) {
      const head = el("div", { class: "rui-slider-head" });
      if (label) head.append(el("label", { class: "rui-slider-label", for: id || null }, [label]));
      if (showValue) head.append(el("span", { class: "rui-slider-value" }, [display(value)]));
      root.append(head);
    }
    const input = el("input", {
      type: "range",
      class: "rui-slider-input",
      id: id || null,
      name: id || null,
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
      disabled: asBoolean(props.disabled) ? "" : null,
      // Last resort when no id could be derived, and harmless when one was.
      "aria-label": !explicitId && label ? label : null,
      // Screen readers announce the raw number otherwise ("50" for "50 ms",
      // or "2" for a step whose mark says "Medium").
      "aria-valuetext": needsValueText(value) ? display(value) : null,
    }) as HTMLInputElement;
    const stateName = node.argMeta?.[4]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => Number((n as HTMLInputElement).value),
      });
    }
    // Update the inline value pill while dragging so the user gets feedback
    // before the state binding propagates back through a render tick.
    // NOTE: the morph copies `oninput` onto the *live* input, so we must
    // resolve sibling nodes from the event target — capturing `root` /
    // `input` here would point at the freshly-rendered (detached) tree. It is
    // also composed on top of `bindState` (which owns the same property key)
    // rather than assigned, or whichever ran last would win.
    composeHandler(input, "oninput", (event: Event) => {
      const target = event.currentTarget as HTMLInputElement | null;
      if (!target) return;
      const text = display(target.value);
      const sliderRoot = target.closest(".rui-slider");
      const valueEl = sliderRoot?.querySelector(".rui-slider-value");
      if (valueEl) valueEl.textContent = text;
      // Dragging off a labelled mark has to REMOVE the override, or the slider
      // keeps announcing "Medium" while it sits on 7.
      if (needsValueText(target.value)) target.setAttribute("aria-valuetext", text);
      else target.removeAttribute("aria-valuetext");
    });
    bindChangeHandler(input, props, helpers, {
      event: "input",
      getValue: (n) => Number((n as HTMLInputElement).value),
    });
    root.append(input);
    if (marks.length > 0) {
      // `aria-hidden`: the ticks are a visual scale for the same information
      // `aria-valuetext` already announces, and a screen reader reading "0 50
      // 100" after the value is noise. A zero-width track would divide by zero.
      const span = max - min || 1;
      const row = el("div", { class: "rui-slider-marks", "aria-hidden": "true" });
      for (const mark of marks) {
        row.append(el("span", {
          class: "rui-slider-mark",
          "data-value": String(mark.value),
          // Only the render knows where a tick sits, so the offset is inline;
          // `.rui-slider-mark` supplies the absolute positioning it offsets from.
          style: `left:${(((mark.value - min) / span) * 100).toFixed(2)}%`,
        }, [mark.label || String(mark.value)]));
      }
      root.append(row);
    }
    // The slider owns its own label, so the shell must not render a second one.
    const shell = withFieldShell(root, { ...props, label: null }, { idKey: "id" });
    relocateControlAria(root, input);
    return shell;
  },
};

export const NumberInput: ComponentSpec = {
  name: "NumberInput",
  description:
    "Numeric input with paired increment/decrement buttons. Use for " +
    "quantity steppers, integer settings, and any field where a `<input " +
    "type=\"number\">` plus +/- controls is friendlier than the native " +
    "spinner. Pass a `$variable` as `value` for two-way binding. `prefix` / " +
    "`suffix` render an inline unit (\"€\", \"GB\", \"%\"), and `precision` " +
    "fixes the number of decimals (currency fields).",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "number", optional: true, description: "Bound value (typically $variable)" },
    { name: "min", type: "number", optional: true },
    { name: "max", type: "number", optional: true },
    { name: "step", type: "number", optional: true, description: "Default 1" },
    { name: "placeholder", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new number (or null when blank)" },
    // `disabled` comes from FIELD_SHELL_PROPS — declaring it here as well added a
    // second, unreachable slot: it inflated the positional arity the validator
    // reports, listed the name twice in the generated prompt, and let a mixed
    // positional+named call fill the first slot and clobber it back to undefined
    // from the second.
    ...FIELD_SHELL_PROPS,
    { name: "prefix", type: "string", optional: true, description: "Inline text before the number (e.g. \"€\")" },
    { name: "suffix", type: "string", optional: true, description: "Inline unit after the number (e.g. \"GB\", \"%\", \"ms\")" },
    { name: "precision", type: "number", optional: true, description: "Number of decimals the field keeps (rounds the value it reports)" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const step = asNumber(props.step, 1);
    const hasMin = props.min !== undefined && props.min !== null;
    const hasMax = props.max !== undefined && props.max !== null;
    const min = hasMin ? asNumber(props.min, 0) : Number.NEGATIVE_INFINITY;
    const max = hasMax ? asNumber(props.max, 0) : Number.POSITIVE_INFINITY;
    const disabled = asBoolean(props.disabled);
    const precision = props.precision === undefined || props.precision === null
      ? null
      : Math.max(0, Math.floor(asNumber(props.precision, 0)));
    // Decimals implied by the step. Plain float addition made three clicks of
    // `step: 0.1` render 0.30000000000000004 and dispatch that into the bound
    // $variable; native spinners avoid it by snapping to the step grid.
    const stepDecimals = (String(step).split(".")[1] ?? "").length;
    const round = (n: number): number => {
      if (precision !== null) return Number(n.toFixed(precision));
      return stepDecimals > 0 ? Number(n.toFixed(stepDecimals)) : n;
    };
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
      value: valueAttr(props.value),
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
      if (!Number.isFinite(num)) return null;
      // Browsers do not enforce min/max while typing, so without this a
      // `min: 1, max: 10` field happily reported 500 to the bound $variable
      // and to onChange — a value the +/- buttons would have refused.
      return round(clampNumber(num, min, max));
    };
    if (stateName) {
      helpers.bindState(input, stateName, { event: "input", getValue: readNumberValue });
    }
    bindChangeHandler(input, props, helpers, {
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
      const next = round(clampNumber(base + delta, min, max));
      live.value = String(next);
      live.dispatchEvent(new Event("input", { bubbles: true }));
    };
    decBtn.onclick = (event) => adjust((event.currentTarget ?? event.target) as Element, -step);
    incBtn.onclick = (event) => adjust((event.currentTarget ?? event.target) as Element, step);
    // Must run BEFORE the blur normaliser below: `attachFocusHandlers` assigns
    // `onblur` outright, so composing has to come second or it is overwritten.
    attachFocusHandlers(input, props, helpers, readNumberValue);
    composeHandler(input, "onblur", (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLInputElement | null;
      if (!live || live.value === "") return;
      const corrected = readNumberValue(live);
      // Keep the field and the state in agreement — the reported value is
      // clamped and rounded, so the visible text has to be too.
      if (corrected !== null && String(corrected) !== live.value) {
        live.value = String(corrected);
        live.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const prefix = asString(props.prefix);
    const suffix = asString(props.suffix);
    root.append(decBtn);
    if (prefix) root.append(el("span", { class: "rui-number-input-prefix", "aria-hidden": "true" }, [prefix]));
    root.append(input);
    if (suffix) root.append(el("span", { class: "rui-number-input-suffix", "aria-hidden": "true" }, [suffix]));
    root.append(incBtn);
    const shell = withFieldShell(root, props, { idKey: "id" });
    // `withFieldShell` writes `required` / `aria-invalid` / `aria-describedby`
    // onto the element it is handed — here the stepper `<div>`, where all three
    // are inert: AT announced no invalid state and `<div required>` never
    // blocked submission.
    relocateControlAria(root, input);
    if (suffix || prefix) {
      // The unit is decorative for AT (`aria-hidden` above), so fold it into the
      // control's own name instead.
      const spoken = [prefix, suffix].filter(Boolean).join(" ");
      const existing = asString(props.label);
      if (existing) input.setAttribute("aria-label", `${existing} (${spoken})`);
    }
    return shell;
  },
};

export const DatePicker: ComponentSpec = {
  name: "DatePicker",
  description:
    "Date picker that wraps the native `<input type=\"date\">` with " +
    "consistent styling. Pass a `$variable` as `value` for two-way binding. " +
    "Use `min`/`max` to bound the selectable range, and `error`/`required` " +
    "to make it part of the form's validation flow. Set `locale` (`de-DE`, " +
    "`en-GB`) to echo the chosen date in that locale's order under the field — " +
    "the native widget's own boxes always follow the viewer's browser, which is " +
    "not the customer's when the app serves one market.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "ISO date (YYYY-MM-DD); typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true, description: "Earliest ISO date" },
    { name: "max", type: "string", optional: true, description: "Latest ISO date" },
    { name: "placeholder", type: "string", optional: true, description: "Accessible name fallback when no `label` is given — date inputs render their own locale format hint, so this is never displayed" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new ISO date string when the picker changes" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required" },
    { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Called with the current value when focus leaves the control (validate-on-blur)" },
    { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Called when the control gains focus" },
    { name: "locale", type: "string", optional: true, description: "BCP-47 tag (`de-DE`, `en-GB`, `fr-CH`) the selected date is echoed in beneath the field, and the language the value is announced in. Same `locale` channel as `Table`/`Col`, so a filter and the report it filters read alike. Bound values stay ISO `YYYY-MM-DD`." },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    const label = asString(props.label);
    const placeholder = asString(props.placeholder);
    const explicitId = asString(props.id);
    // `for=""` against `id=""` associated nothing, so a labelled date field was
    // announced as an unnamed date input and clicking the label did not focus it.
    const id = explicitId || fallbackFieldId("rui-date", label || placeholder);
    const locale = localeTag(props.locale);
    const root = el("div", { class: "rui-date-picker" });
    if (label) root.append(el("label", { class: "rui-date-picker-label", for: id || null }, [label]));
    const input = el("input", {
      type: "date",
      class: "rui-date-picker-input",
      id: id || null,
      name: id || null,
      value: valueAttr(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      disabled: asBoolean(props.disabled) ? "" : null,
      // Browsers ignore `placeholder` on `<input type="date">` — it renders its
      // own mm/dd/yyyy hint — so the supplied text is surfaced as the
      // accessible name instead of being silently dropped. Also the fallback
      // when there is no id to hang the visible label's `for` on.
      "aria-label": id && label ? null : (label || placeholder || null),
      // The date the field holds is written in `locale`, so say so: `lang` is
      // what tells a screen reader which language to pronounce it in, and the UAs
      // that consult it for the widget's own segment order pick it up too. It is
      // NOT a promise about the boxes — that is the browser's call, which is
      // exactly why the readout below exists.
      lang: locale ?? null,
    }) as HTMLInputElement;
    bindToStateAtArg(input, node, 1, helpers);
    bindChangeHandler(input, props, helpers, {
      event: "change",
      getValue: (n) => (n as HTMLInputElement).value,
    });
    attachFocusHandlers(input, props, helpers);
    root.append(input);
    if (locale) {
      // `aria-hidden`: this is the same value the native field already announces,
      // just spelled the author's way — a second reading of the date is noise.
      root.append(el("span", {
        class: "rui-date-picker-readout",
        "aria-hidden": "true",
      }, [formatDateInLocale(props.value, locale)]));
      wireDateReadout(input, ".rui-date-picker", ".rui-date-picker-readout", (liveRoot) =>
        formatDateInLocale(liveRoot.querySelector<HTMLInputElement>(".rui-date-picker-input")?.value, locale));
    }
    // The picker renders its own label, so the shell only contributes the
    // hint / error / required machinery.
    const shell = withFieldShell(root, { ...props, label: null }, { idKey: "id" });
    relocateControlAria(root, input);
    return shell;
  },
};

export const FileUpload: ComponentSpec = {
  name: "FileUpload",
  description:
    "Styled file picker. Renders a click/drop area with a leading icon, " +
    "label, and helper text. Files cannot round-trip through `$variables` " +
    "(they are not serialisable), so pass a callable as `action` to handle " +
    "the picked files. Read one with `$util.readFile(files)` — pass the whole " +
    "pick and it resolves the first file's text (or a data URL), resolving " +
    "an empty string rather than rejecting on any failure. Set `maxSize` (in " +
    "bytes) to reject oversized files before the upload starts, `error` to " +
    "show why one was refused, and `progress` (0–100) while it transfers.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string", optional: true, description: "Primary label (default \"Choose a file\")" },
    { name: "hint", type: "string", optional: true, description: "Secondary helper text" },
    { name: "accept", type: "string", optional: true, description: "Comma-separated MIME types or extensions" },
    { name: "multiple", type: "boolean", optional: true },
    { name: "onSelect", type: "callable", optional: true, aliases: ["action", "onChange"], description: "Callable fired with the accepted files when files are picked" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon (default \"cloud-arrow-up\")" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "maxSize", type: "number", optional: true, description: "Maximum accepted file size in bytes — larger files are rejected client-side and never reach `onSelect`" },
    { name: "error", type: "string", optional: true, description: "Error rendered below the drop zone (\"File too large\", \"PDF only\", \"Upload failed\")" },
    { name: "progress", type: "number", optional: true, description: "Upload progress 0–100; renders a progress bar under the drop zone" },
    { name: "onRemove", type: "callable", optional: true, description: "Called with the removed File when the user deselects one from the preview" },
  ],
  render: (_node, props, helpers) => {
    const id = asString(props.id);
    const disabled = asBoolean(props.disabled);
    const error = asString(props.error);
    const maxSize = Math.max(0, asNumber(props.maxSize, 0));
    const root = el("div", {
      class: "rui-file-upload",
      "data-disabled": disabled ? "true" : "false",
      "data-invalid": error ? "true" : null,
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
    const errorId = error && id ? `${id}-error` : null;
    const input = el("input", {
      type: "file",
      id,
      name: id,
      class: "rui-file-upload-input",
      accept: asString(props.accept) || null,
      multiple: asBoolean(props.multiple) ? "" : null,
      disabled: disabled ? "" : null,
      "aria-invalid": error ? "true" : null,
      "aria-describedby": errorId,
    }) as HTMLInputElement;
    dropZone.append(input);
    root.append(dropZone);
    // Nowhere to say "File too large" / "PDF only" / "Upload failed" before.
    if (error) {
      root.append(el("div", {
        class: "rui-file-upload-error rui-field-error",
        id: errorId,
        role: "alert",
      }, [error]));
    }
    if (props.progress !== undefined && props.progress !== null) {
      const pct = Math.min(100, Math.max(0, asNumber(props.progress, 0)));
      const track = el("div", {
        class: "rui-file-upload-progress",
        role: "progressbar",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(Math.round(pct)),
      });
      track.append(el("div", {
        class: "rui-file-upload-progress-bar",
        // Only the width is inline: the track's height, radius and colours are
        // `.rui-file-upload-progress` in the sheet, where a theme can reach them.
        style: `width:${pct}%`,
      }));
      root.append(track);
    }

    const isImageFile = (file: File, accept: string): boolean =>
      accept.includes("image") ||
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name);

    // Every object URL this instance minted. Revoked when the instance goes
    // away (or on the next render, which also discards the preview) — the old
    // code only revoked on `img.onload`, so a corrupt or unsupported image
    // pinned its blob for the lifetime of the page.
    const objectUrls: string[] = [];
    const revokeObjectUrls = (): void => {
      while (objectUrls.length > 0) URL.revokeObjectURL(objectUrls.pop()!);
    };
    helpers.registerDisposer(revokeObjectUrls, "file-upload-object-urls");

    /** Split a pick into what we accept and what is too large. */
    const partitionBySize = (files: FileList | File[] | null): { accepted: File[]; rejected: File[] } => {
      const list = files ? Array.from(files) : [];
      if (maxSize <= 0) return { accepted: list, rejected: [] };
      return {
        accepted: list.filter((file) => file.size <= maxSize),
        rejected: list.filter((file) => file.size > maxSize),
      };
    };

    /** Replace a live input's FileList where the platform allows it. */
    const writeFiles = (target: HTMLInputElement | null, files: File[]): void => {
      if (!target) return;
      try {
        const dt = new DataTransfer();
        for (const file of files) dt.items.add(file);
        target.files = dt.files;
      } catch {
        // Older browsers / jsdom: at least clear a fully-rejected pick.
        if (files.length === 0) target.value = "";
      }
    };

    // Shared preview renderer used by both the native picker and drag-drop.
    const showPreview = (
      uploadRoot: HTMLElement,
      files: FileList | File[] | null,
      rejected: File[] = [],
    ): void => {
      const existing = uploadRoot.querySelector(".rui-file-upload-preview");
      if (existing) existing.remove();
      const list = files ? Array.from(files) : [];
      if (list.length === 0 && rejected.length === 0) return;
      const accept = asString(props.accept);
      // `role="status"` so the selection (and any rejection) is announced —
      // the only focusable element here is a 1×1 clipped input.
      const preview = el("div", { class: "rui-file-upload-preview", role: "status" });
      list.forEach((file) => {
        const row = el("div", { class: "rui-file-upload-preview-item" });
        if (isImageFile(file, accept)) {
          const objectUrl = URL.createObjectURL(file);
          objectUrls.push(objectUrl);
          const img = el("img", { src: objectUrl, alt: file.name, class: "rui-file-upload-thumbnail" }) as HTMLImageElement;
          const release = (): void => {
            URL.revokeObjectURL(objectUrl);
            const at = objectUrls.indexOf(objectUrl);
            if (at >= 0) objectUrls.splice(at, 1);
          };
          img.onload = release;
          // A `.heic` or corrupt image never fires `load`; without this its blob
          // stays pinned for the lifetime of the page.
          img.onerror = release;
          row.append(img);
        }
        row.append(el("span", { class: "rui-file-upload-filename" }, [file.name]));
        const size = formatFileSize(file.size);
        if (size) row.append(el("span", { class: "rui-file-upload-filesize" }, [size]));
        const removeBtn = el("button", {
          type: "button",
          class: "rui-file-upload-remove",
          "aria-label": `Remove ${file.name}`,
        }, ["×"]);
        removeBtn.onclick = (event) => {
          // The drop zone is a `<label for>`; a stray click would reopen the
          // picker.
          event.preventDefault();
          event.stopPropagation();
          const origin = (event.currentTarget ?? event.target) as Element;
          const liveRoot = origin.closest(".rui-file-upload") as HTMLElement | null;
          const liveInput = liveRoot?.querySelector<HTMLInputElement>(".rui-file-upload-input") ?? null;
          const remaining = Array.from(liveInput?.files ?? list).filter((f) => f !== file);
          writeFiles(liveInput, remaining);
          helpers.invoke(props.onRemove, file);
          helpers.invoke(props.onSelect, liveInput?.files ?? remaining);
          if (liveRoot) showPreview(liveRoot, remaining);
        };
        row.append(removeBtn);
        preview.append(row);
      });
      for (const file of rejected) {
        preview.append(el("div", { class: "rui-file-upload-preview-item", "data-rejected": "true" }, [
          el("span", { class: "rui-file-upload-filename" }, [file.name]),
          el("span", { class: "rui-field-error" }, [`Larger than ${formatFileSize(maxSize)}`]),
        ]));
      }
      uploadRoot.append(preview);
    };

    const handleFiles = (origin: Element, files: FileList | File[] | null): void => {
      const { accepted, rejected } = partitionBySize(files);
      const uploadRoot = origin.closest(".rui-file-upload") as HTMLElement | null;
      const liveInput = uploadRoot?.querySelector<HTMLInputElement>(".rui-file-upload-input") ?? null;
      // Never let a rejected file reach the caller — client-side size rejection
      // is the whole point of `maxSize`.
      if (rejected.length > 0) writeFiles(liveInput, accepted);
      helpers.invoke(props.onSelect, rejected.length > 0 ? accepted : files);
      if (uploadRoot) showPreview(uploadRoot, accepted, rejected);
    };

    input.onchange = (event) => {
      const fileInput = (event.currentTarget ?? event.target) as HTMLInputElement;
      handleFiles(fileInput, fileInput.files);
    };

    // Real drag-and-drop (V.5): highlight on dragover, accept dropped files,
    // assign them to the hidden input, then fire onSelect + preview.
    //
    // Property handlers that branch on `disabled` *inside*: the previous
    // `addEventListener` calls inside an `if (!disabled)` block were installed
    // on the node morph discards, so flipping `disabled` from true to false
    // permanently killed drop support (clicking still worked — that is the
    // native `<label for>` — which made it look half-broken with no error).
    const stop = (e: Event): void => { e.preventDefault(); e.stopPropagation(); };
    const setDragOver = (event: Event, on: boolean): HTMLElement | null => {
      const live = (event.currentTarget ?? event.target) as HTMLElement | null;
      const zone = live?.closest(".rui-file-upload-dropzone") as HTMLElement | null;
      if (zone) zone.classList.toggle("is-dragover", on);
      return zone;
    };
    dropZone.ondragenter = (event) => { if (disabled) return; stop(event); setDragOver(event, true); };
    dropZone.ondragover = (event) => { if (disabled) return; stop(event); setDragOver(event, true); };
    dropZone.ondragleave = (event) => { if (disabled) return; stop(event); setDragOver(event, false); };
    dropZone.ondrop = (event) => {
      if (disabled) return;
      stop(event);
      const zone = setDragOver(event, false);
      const dt = (event as DragEvent).dataTransfer;
      if (!dt || dt.files.length === 0) return;
      const liveInput = zone?.querySelector<HTMLInputElement>(".rui-file-upload-input") ?? null;
      try { if (liveInput) liveInput.files = dt.files; } catch { /* some browsers disallow setting .files */ }
      handleFiles(zone ?? dropZone, dt.files);
    };
    return root;
  },
};

/* ------------------------------------------------------------------------ *
 * Listbox pickers (Combobox / MultiSelect) — shared floating-layer wiring
 * ------------------------------------------------------------------------ */

const COMBOBOX_PANEL = ".rui-combobox-panel";
const COMBOBOX_TRIGGER = ".rui-combobox-trigger";
const MULTISELECT_PANEL = ".rui-multiselect-panel";
const MULTISELECT_TRIGGER = ".rui-multiselect-trigger";

/**
 * Placement options shared by both pickers.
 *
 * `matchAnchorWidth` reproduces what the panels' CSS used to get for free from
 * `left: 0; right: 0` inside a `position: relative` trigger: a listbox that is
 * exactly as wide as the control it belongs to. Viewport coordinates cannot
 * inherit that, so the width has to be measured and pinned. `minWidth` keeps a
 * narrow trigger (an empty MultiSelect in a table cell) from producing a panel
 * too cramped to read the options in.
 */
const PICKER_FLOATING = {
  matchAnchorWidth: true,
  minWidth: 180,
  layer: "dropdown",
} as const satisfies Parameters<typeof syncFloatingPanel>[4];

/**
 * Position a picker that is open on its very first paint (`open: true`, used by
 * demos and by authors pre-opening a dropdown).
 *
 * Positioning needs live layout and `render` returns a detached tree, so this
 * defers past the current task and only acts once the node is connected. On a
 * re-render the morph reconciler keeps the previous live node and discards this
 * one, so the guard makes the call a no-op there — the live panel is already
 * promoted and the floating layer's own scroll/resize listeners keep it placed.
 */
const positionPickerOnMount = (
  root: HTMLElement,
  panelSelector: string,
  triggerSelector: string,
): void => {
  deferToPaint(() => {
    if (!root.isConnected) return;
    if (root.getAttribute("data-open") !== "true") return;
    syncFloatingPanel(root, true, panelSelector, triggerSelector, PICKER_FLOATING);
  });
};

/**
 * Debounce window for `onSearch`. Long enough that "berlin" is one request
 * rather than six, short enough that the list still feels type-ahead. Anything
 * above ~250ms reads as lag on a fast connection.
 */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Debounced `onSearch` dispatcher shared by the pickers.
 *
 * The filter text is per-instance UI state, so a remote type-ahead has no way to
 * see it unless the component pushes it out — that is all this does, once the
 * keystrokes settle.
 *
 * The pending handle lives in instance state, not a closure: the handler that
 * schedules it belongs to render N and the one that has to cancel it usually
 * belongs to render N+1 (morph copies the newer handler onto the kept input), so
 * a closure variable would leak a timer per keystroke and never cancel anything.
 * `cancel` is also registered as a keyed disposer, so a field that disappears
 * mid-word never starts a fetch for a component that no longer exists.
 */
function makeSearchDispatcher(
  props: Record<string, unknown>,
  helpers: RenderHelpers,
  disposerKey: string,
): { schedule: (query: string) => void; cancel: () => void } {
  const timer = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("searchTimer", null);
  const cancel = (): void => {
    const pending = timer.get();
    if (pending === null) return;
    clearTimeout(pending);
    timer.set(null);
  };
  const schedule = (query: string): void => {
    if (props.onSearch == null) return;
    cancel();
    helpers.registerDisposer(cancel, disposerKey);
    const handle = setTimeout(() => {
      timer.set(null);
      // Read from `props` at fire time so the callback is the current render's.
      helpers.invoke(props.onSearch, query);
    }, SEARCH_DEBOUNCE_MS);
    timer.set(handle);
  };
  return { schedule, cancel };
}

export const Combobox: ComponentSpec = {
  name: "Combobox",
  description:
    "Searchable single-select dropdown — type to filter, click an option " +
    "to choose. Use instead of `Select` when the list is long enough that " +
    "scanning is faster than scrolling (countries, currencies, repos, " +
    "users). Pass a `$variable` as `value` for two-way binding; the " +
    "selected option's `value` is written to state on pick. Arrow keys / " +
    "Home / End / Enter / Escape operate the list. Pass `onSearch` for a " +
    "server-side type-ahead (called with the query ~200ms after typing " +
    "stops; local filtering is then skipped — supply the matches as " +
    "`items`), `loading` while those matches are in flight, `creatable` to " +
    "accept a value that is not in the list, and " +
    "`label`/`hint`/`error`/`required` for a labelled field.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) or {value, label}" },
    { name: "value", type: "string", optional: true, description: "Bound selected value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no items match the filter (default \"No matches\")" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "open", type: "boolean", optional: true, description: "Initial open state — use to demo or pre-open the dropdown" },
    { name: "onOpenChange", type: "callable", optional: true, aliases: ["onopenchange"], description: "Called with the new boolean open state whenever the component opens or closes." },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value" },
    { name: "label", type: "string", optional: true, description: "Field label rendered above the control" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*` and the `required` attribute)" },
    { name: "loading", type: "boolean", optional: true, description: "Matches are being fetched — shows \"Loading…\" instead of the (lying) empty label" },
    { name: "onSearch", type: "callable", optional: true, description: "Called with the query on every keystroke for server-side search; disables local filtering" },
    { name: "clearable", type: "boolean", optional: true, description: "Show a clear (×) control so the selection can be reset to the placeholder" },
    { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Called with the selected value when focus leaves the control (validate-on-blur)" },
    { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Called when the control gains focus" },
    { name: "creatable", type: "boolean", optional: true, description: "Offer the typed text itself as an option when it matches nothing (\"Create «acme-corp»\") so a value outside `items` can be selected" },
    { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context (a picker under a section heading that names it, a control in a table cell whose column header is the label)" },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const items = extractComboboxItems(props.items);
    const currentValue = asString(props.value);
    const currentLabel = items.find((item) => item.value === currentValue)?.label ?? currentValue;
    const placeholder = asString(props.placeholder, "Select…");
    const emptyLabel = asString(props.emptyLabel, "No matches");
    const disabled = asBoolean(props.disabled);
    const loading = asBoolean(props.loading);
    // With a remote search the supplied `items` are already the matches, so
    // filtering them again locally would hide rows the server just returned.
    // (This is what a separate `filterMode: "local" | "remote"` prop would say,
    // derived from the handler instead so the two can never disagree.)
    const remoteSearch = props.onSearch != null;
    const creatable = asBoolean(props.creatable);
    const search = makeSearchDispatcher(props, helpers, "combobox-search");
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState<boolean>("open", initialOpen);
    const filterSlot = helpers.useInstanceState<string>("filter", "");
    // Active option for keyboard navigation. Instance state, so it survives an
    // unrelated re-render; -1 means "nothing highlighted yet".
    const activeSlot = helpers.useInstanceState<number>("active", -1);
    const isOpen = openSlot.get();
    const panelId = id ? `${id}-listbox` : null;
    const optionDomId = (index: number): string | null => (id ? `${id}-option-${index}` : null);

    const root = el("div", {
      class: "rui-combobox",
      "data-open": isOpen ? "true" : "false",
      "data-disabled": disabled ? "true" : "false",
      "data-loading": loading ? "true" : null,
    });
    const triggerBtn = el("button", {
      type: "button",
      class: "rui-combobox-trigger",
      id,
      // Without `role="combobox"` + `aria-controls` the composite is announced
      // as a button followed by a pile of loose buttons.
      role: "combobox",
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen ? "true" : "false",
      "aria-controls": panelId,
      disabled: disabled ? "" : null,
    });
    triggerBtn.append(el("span", {
      class: "rui-combobox-value",
      "data-placeholder": currentLabel ? "false" : "true",
    }, [currentLabel || placeholder]));
    const chevron = renderIcon("chevron-down", { className: "rui-combobox-chevron" });
    if (chevron) triggerBtn.append(chevron);
    // The trigger is the focusable control, so validate-on-blur hangs off it.
    attachFocusHandlers(triggerBtn, props, helpers, () => currentValue);
    root.append(triggerBtn);

    const panel = el("div", {
      class: "rui-combobox-panel",
      id: panelId,
      role: "listbox",
      "aria-busy": loading ? "true" : null,
    });
    const filterInput = el("input", {
      type: "text",
      class: "rui-combobox-filter",
      // An id is what makes focus and caret position recoverable: element.ts
      // snapshots the active element by id before a render and restores it after
      // (captureFocus/restoreFocus), and it bails out on an unnamed node. Without
      // one, a validate-on-change `error` appearing mid-word swaps the field
      // shell in around the panel and the user's typing simply stops (D0337).
      id: id ? `${id}-filter` : null,
      placeholder: "Filter…",
      autocomplete: "off",
      value: filterSlot.get(),
      "aria-label": "Filter options",
      "aria-controls": panelId,
      "aria-autocomplete": "list",
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
      if (loading) {
        // `emptyLabel` here would actively lie: the user reads "No matches" and
        // concludes their query returned nothing.
        target.append(el("div", { class: "rui-combobox-loading" }, ["Loading…"]));
        return;
      }
      const query = filter.trim();
      const lower = query.toLowerCase();
      const matches = lower === "" || remoteSearch
        ? items
        : items.filter((item) =>
            item.label.toLowerCase().includes(lower) ||
            item.value.toLowerCase().includes(lower),
          );
      // "Create «…»" only when the typed text is genuinely new — offering to
      // create a value that already exists produces a duplicate the author's
      // data model then has to de-dupe.
      const canCreate = creatable && query !== ""
        && currentValue.toLowerCase() !== lower
        && !items.some((item) =>
          item.value.toLowerCase() === lower || item.label.toLowerCase() === lower);
      if (matches.length === 0 && !canCreate) {
        target.append(el("div", { class: "rui-combobox-empty" }, [emptyLabel]));
        return;
      }
      const active = activeSlot.get();
      // `group` buckets options under a heading, mirroring what native Select
      // does with <optgroup>. SelectItem declares both `group` and `disabled`,
      // so ignoring them here made those props silently inert on this picker.
      let lastGroup: string | undefined;
      matches.forEach((item, index) => {
        if (item.group && item.group !== lastGroup) {
          target.append(el("div", {
            class: "rui-combobox-group",
            role: "presentation",
          }, [item.group]));
          lastGroup = item.group;
        }
        const option = el("button", {
          type: "button",
          class: "rui-combobox-option",
          role: "option",
          id: optionDomId(index),
          // Options are driven by `aria-activedescendant`, so they must not each
          // be a tab stop — reaching "Zimbabwe" was ~200 Tab presses.
          tabindex: "-1",
          "data-value": item.value,
          "data-active": index === active ? "true" : null,
          "data-disabled": item.disabled ? "true" : null,
          // `aria-disabled` rather than the `disabled` attribute: a listbox
          // option must stay discoverable by arrow keys and announced as
          // unavailable, which `disabled` would prevent by removing it entirely.
          "aria-disabled": item.disabled ? "true" : null,
          "aria-selected": item.value === currentValue ? "true" : "false",
        }, [item.label]);
        if (!item.disabled) {
          option.onclick = (event) => {
            event.stopPropagation();
            selectComboboxValue(event.currentTarget as Element, item.value);
          };
        }
        target.append(option);
      });
      if (canCreate) {
        // Same class as a real option so the keyboard walker (`optionsIn`) and
        // `aria-activedescendant` treat it as the last row in the list.
        const create = el("button", {
          type: "button",
          class: "rui-combobox-option rui-combobox-create",
          role: "option",
          id: optionDomId(matches.length),
          tabindex: "-1",
          "data-value": query,
          "data-create": "true",
          "data-active": matches.length === active ? "true" : null,
          "aria-selected": "false",
        }, [`Create “${query}”`]);
        create.onclick = (event) => {
          event.stopPropagation();
          selectComboboxValue(event.currentTarget as Element, query);
        };
        target.append(create);
      }
    };

    /** Close paths all share this: attribute state, floating layer, listeners. */
    const closeCombobox = (origin: Element): void => {
      openSlot.set(false);
      helpers.invoke(props.onOpenChange, false);
      // The filter is cleared below, so a debounced query still in flight would
      // fetch matches for a panel nobody is looking at — and land them in the
      // author's `items` state after the fact.
      search.cancel();
      filterSlot.set("");
      activeSlot.set(-1);
      const live = origin.closest(".rui-combobox") as HTMLElement | null;
      if (!live) return;
      live.setAttribute("data-open", "false");
      const trigger = live.querySelector<HTMLElement>(".rui-combobox-trigger");
      trigger?.setAttribute("aria-expanded", "false");
      // Un-promote, or the panel is left behind in the top layer with no trigger
      // state that could ever hide it again.
      closeFloating(live.querySelector<HTMLElement>(COMBOBOX_PANEL));
      disposeDismissListeners(live);
    };

    // Apply a value as the bound state, then close the combobox UI.
    const selectComboboxValue = (origin: Element, value: string): void => {
      const stateName = node.argMeta?.[2]?.stateRef;
      if (stateName) {
        helpers.setState(stateName, value);
      }
      helpers.invoke(props.onChange, value);
      closeCombobox(origin);
    };

    renderList(list, filterSlot.get());

    const optionsIn = (scope: Element): HTMLElement[] =>
      Array.from(scope.querySelectorAll<HTMLElement>(".rui-combobox-option[data-value]"));

    /** Highlight option `index` (wrapping) and publish it via activedescendant. */
    const setActiveOption = (panelEl: Element, index: number, filterEl: Element | null): void => {
      const options = optionsIn(panelEl);
      if (options.length === 0) return;
      const clamped = ((index % options.length) + options.length) % options.length;
      activeSlot.set(clamped);
      options.forEach((option, i) => {
        if (i !== clamped) { option.removeAttribute("data-active"); return; }
        option.setAttribute("data-active", "true");
        if (option.id) filterEl?.setAttribute("aria-activedescendant", option.id);
        if (typeof option.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
      });
    };

    filterInput.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      filterSlot.set(target.value);
      activeSlot.set(-1);
      target.removeAttribute("aria-activedescendant");
      search.schedule(target.value);
      const liveList = target.closest(".rui-combobox-panel")
        ?.querySelector(".rui-combobox-list") as HTMLElement | null;
      if (liveList) renderList(liveList, target.value);
    };

    // Full keyboard operation. Everything resolves from the live DOM so the
    // handler still works after morph copies it onto the kept filter input.
    filterInput.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const target = e.currentTarget as HTMLInputElement;
      const panelEl = target.closest(".rui-combobox-panel");
      if (!panelEl) return;
      const active = activeSlot.get();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveOption(panelEl, active + 1, target);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveOption(panelEl, active <= 0 ? optionsIn(panelEl).length - 1 : active - 1, target);
        return;
      }
      if (e.key === "Home") { e.preventDefault(); setActiveOption(panelEl, 0, target); return; }
      if (e.key === "End") {
        e.preventDefault();
        setActiveOption(panelEl, optionsIn(panelEl).length - 1, target);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const options = optionsIn(panelEl);
        // Enter with nothing highlighted keeps the old type-ahead behaviour:
        // take the first match.
        const chosen = (active >= 0 ? options[active] : options[0]) ?? null;
        const value = chosen?.getAttribute("data-value");
        if (chosen && value !== null && value !== undefined) selectComboboxValue(chosen, value);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeCombobox(target);
        return;
      }
    };

    triggerBtn.onclick = (event) => {
      if (disabled) return;
      event.stopPropagation();
      const next = !openSlot.get();
      openSlot.set(next);
      helpers.invoke(props.onOpenChange, next);
      const live = (event.currentTarget as Element).closest(".rui-combobox") as HTMLElement | null;
      live?.setAttribute("data-open", next ? "true" : "false");
      live?.querySelector(".rui-combobox-trigger")
        ?.setAttribute("aria-expanded", next ? "true" : "false");
      if (!live) return;
      // Promote the option list out of its clipping ancestry (or hand it back).
      // As an absolutely-positioned child of the trigger it was amputated by any
      // ancestor with non-visible overflow — a table wrapper, a modal body, an
      // InputGroup — and the list is the whole point of a filterable control.
      syncFloatingPanel(live, next, COMBOBOX_PANEL, COMBOBOX_TRIGGER, PICKER_FLOATING);
      if (!next) {
        // Close path: release any listeners that an earlier open() installed.
        search.cancel();
        disposeDismissListeners(live);
        return;
      }
      activeSlot.set(-1);
      // Focus the filter so users can type immediately, resolved from the LIVE
      // tree: morph copied this handler onto the kept trigger, so the
      // `filterInput` this closure captured belongs to a discarded render and
      // focusing it silently does nothing (keystrokes then go to the trigger,
      // where Space re-closes the panel). `deferToPaint` also fires in
      // background tabs, and its canceller is registered as a disposer.
      const cancelFocus = deferToPaint(() => {
        const target = live.querySelector<HTMLInputElement>(".rui-combobox-filter")
          ?? (filterInput.isConnected ? filterInput : null);
        target?.focus();
      });
      helpers.registerDisposer(cancelFocus, "combobox-focus");
      installDismissListeners({
        liveRoot: live,
        onDismiss: () => {
          openSlot.set(false);
      helpers.invoke(props.onOpenChange, false);
          search.cancel();
          filterSlot.set("");
          activeSlot.set(-1);
          live.setAttribute("data-open", "false");
          live.querySelector(".rui-combobox-trigger")
            ?.setAttribute("aria-expanded", "false");
          // Outside-click / Escape is a close path too — un-promote, or the
          // panel stays in the top layer as an orphan nothing can dismiss.
          closeFloating(live.querySelector<HTMLElement>(COMBOBOX_PANEL));
        },
      });
    };
    // Reset to the placeholder state: the trigger alone can only ever swap one
    // value for another, so an optional filter ("Any owner") could not be undone.
    if (asBoolean(props.clearable) && currentValue !== "" && !disabled) {
      const clearBtn = el("button", {
        type: "button",
        class: "rui-combobox-clear",
        "aria-label": "Clear selection",
      }, ["×"]);
      clearBtn.onclick = (event) => {
        event.stopPropagation();
        const stateName = node.argMeta?.[2]?.stateRef;
        if (stateName) helpers.setState(stateName, "");
        helpers.invoke(props.onChange, "");
      };
      root.append(clearBtn);
    }
    root.append(panel);
    if (isOpen) positionPickerOnMount(root, COMBOBOX_PANEL, COMBOBOX_TRIGGER);
    const shell = withFieldShell(root, props, { idKey: "id" });
    // The trigger is the control AT lands on, so the shell's `required` /
    // `aria-invalid` / `aria-describedby` have to move there off the wrapper.
    relocateControlAria(root, triggerBtn);
    return shell;
  },
};

export const MultiSelect: ComponentSpec = {
  name: "MultiSelect",
  description:
    "Multi-option searchable dropdown. Type to filter, click an option to " +
    "add/remove it from the bound array. Renders the selected options as " +
    "removable chips inside the trigger. Pass a `$variable` (array of " +
    "values) as `value` for two-way binding. Arrow keys / Home / End move " +
    "through the list and Enter or Space toggles the highlighted option. " +
    "`min`/`max` bound the selection size; `onSearch` turns filtering over " +
    "to the server (called with the query ~200ms after typing stops — " +
    "supply the matches as `items`, with `loading` while they are in " +
    "flight), and `creatable` accepts a value that is not in the list.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) or {value, label}" },
    { name: "value", type: "any[]", optional: true, description: "Bound array of selected values (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no items match the filter" },
    { name: "max", type: "number", optional: true, description: "Maximum number of selections" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "open", type: "boolean", optional: true, description: "Initial open state — use to demo or pre-open the dropdown" },
    { name: "onOpenChange", type: "callable", optional: true, aliases: ["onopenchange"], description: "Called with the new boolean open state whenever the component opens or closes." },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated array of selected values" },
    { name: "label", type: "string", optional: true, description: "Field label rendered above the control" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the control" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the control (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark the field required (adds a `*` and the `required` attribute)" },
    { name: "min", type: "number", optional: true, description: "Minimum number of selections — the last ones cannot be removed (\"pick at least one\")" },
    { name: "onSearch", type: "callable", optional: true, description: "Called with the query ~200ms after typing stops, for server-side search; disables local filtering" },
    { name: "loading", type: "boolean", optional: true, description: "Matches are being fetched — shows \"Loading…\" instead of the (lying) empty label" },
    { name: "creatable", type: "boolean", optional: true, description: "Offer the typed text itself as an option when it matches nothing (\"Create «backend»\") so a tag outside `items` can be added" },
    { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a field whose purpose is already clear from context (a picker under a section heading that names it, a control in a table cell whose column header is the label)" },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const items = extractComboboxItems(props.items);
    const placeholder = asString(props.placeholder, "Select…");
    const emptyLabel = asString(props.emptyLabel, "No matches");
    const disabled = asBoolean(props.disabled);
    // `Number("3 max")` is NaN, and `NaN > 0` is false — so an unparseable cap
    // silently disabled capping altogether and the user could pick 20 tags.
    const rawMax = asNumber(props.max, 0);
    const max = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 0;
    if (props.max !== undefined && props.max !== null && !Number.isFinite(Number(props.max))) {
      console.warn(`[aktion] MultiSelect max="${asString(props.max)}" is not a number — the selection cap is ignored.`);
    }
    const rawMin = asNumber(props.min, 0);
    const min = Number.isFinite(rawMin) ? Math.max(0, Math.floor(rawMin)) : 0;
    const loading = asBoolean(props.loading);
    // The supplied `items` ARE the server's matches once a remote search is
    // wired, so re-filtering them locally would hide rows it just returned.
    const remoteSearch = props.onSearch != null;
    const creatable = asBoolean(props.creatable);
    const search = makeSearchDispatcher(props, helpers, "multiselect-search");
    const selected = Array.isArray(props.value)
      ? (props.value as unknown[]).map((v) => asString(v)).filter(Boolean)
      : [];
    const selectedSet = new Set(selected);
    const stateName = node.argMeta?.[2]?.stateRef;

    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState<boolean>("open", initialOpen);
    const filterSlot = helpers.useInstanceState<string>("filter", "");
    const activeSlot = helpers.useInstanceState<number>("active", -1);
    const isOpen = openSlot.get();
    const panelId = id ? `${id}-listbox` : null;
    const optionDomId = (index: number): string | null => (id ? `${id}-option-${index}` : null);

    const root = el("div", {
      class: "rui-multiselect",
      "data-open": isOpen ? "true" : "false",
      "data-disabled": disabled ? "true" : "false",
      "data-loading": loading ? "true" : null,
    });

    // Summary of the selection, used as the trigger's accessible name and by the
    // live region below.
    const selectionSummary = selected.length === 0
      ? "No options selected"
      : `${selected.length} selected${max > 0 ? ` of ${max}` : ""}`;
    const fieldLabel = asString(props.label);

    /**
     * The trigger is a `div role="combobox"`, not a `<button>`.
     *
     * Each chip carries its own "Remove X" `<button>`, and those chips live
     * inside the trigger — a button inside a button is invalid HTML that some
     * browsers resolve by swallowing the inner click (menu.ts:106 states the same
     * rule for menu items). It also polluted the trigger's accessible name: with
     * four chips a screen reader announced "Design, Remove Design, Engineering,
     * Remove Engineering, …, collapsed, button".
     *
     * A div has no implicit activation or tab stop, so both are wired by hand
     * (`tabindex` here, `onkeydown` below). It is also not a *labelable* element,
     * so `<label for>` — from the field shell or from FormControl — no longer
     * names it: hence the explicit `aria-label`, which starts with the field's
     * own label so the accessible name still contains the visible one.
     */
    const triggerBtn = el("div", {
      class: "rui-multiselect-trigger",
      id,
      role: "combobox",
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen ? "true" : "false",
      "aria-controls": panelId,
      tabindex: disabled ? null : "0",
      "aria-disabled": disabled ? "true" : null,
      "aria-label": fieldLabel ? `${fieldLabel}, ${selectionSummary}` : selectionSummary,
    });
    const chipRow = el("span", { class: "rui-multiselect-chips" });
    /**
     * Write the new selection, then re-establish the floating panel around the
     * render that write schedules.
     *
     * Unlike a single-select, picking here deliberately leaves the dropdown open
     * — so this is the one picker path where a promoted panel has to survive a
     * re-render, and it doesn't survive on its own: the morph reconciler removes
     * every attribute the freshly-rendered node does not carry, which includes
     * the `popover` attribute and the coordinates the floating layer wrote.
     * Dropping `popover` from a showing element hides it, so the panel would
     * fall back into the ancestry that clips it.
     *
     * Handing the panel back *before* the write means morph patches a node that
     * is exactly where it expects to find it (the reparenting fallback moves the
     * panel out of this subtree, and morph would otherwise append a duplicate).
     * Re-promoting afterwards has to wait for the patch: renders are queued as a
     * microtask, so `deferToPaint` always runs after it. Neither the closed nor
     * the un-positioned state is ever painted — a frame callback runs before the
     * paint that would show it.
     */
    const writeSelection = (origin: Element, next: string[]): void => {
      // "Pick at least one" — the only expression of a lower bound.
      if (min > 0 && next.length < min && next.length < selected.length) return;
      const live = origin.closest(".rui-multiselect") as HTMLElement | null;
      // The clicked option lives inside the panel, so `closest` finds the live
      // panel even once it has been reparented out of `live` by the fallback.
      closeFloating(
        (origin.closest(MULTISELECT_PANEL) as HTMLElement | null)
        ?? live?.querySelector<HTMLElement>(MULTISELECT_PANEL),
      );
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
      if (!live) return;
      deferToPaint(() => {
        if (!live.isConnected) return;
        if (live.getAttribute("data-open") !== "true") return;
        syncFloatingPanel(live, true, MULTISELECT_PANEL, MULTISELECT_TRIGGER, PICKER_FLOATING);
      });
    };
    if (selected.length === 0) {
      chipRow.append(el("span", { class: "rui-multiselect-placeholder" }, [placeholder]));
    } else {
      selected.forEach((value, chipIndex) => {
        const label = items.find((item) => item.value === value)?.label ?? value;
        const chip = el("span", { class: "rui-multiselect-chip", "data-value": value });
        chip.append(el("span", { class: "rui-multiselect-chip-label" }, [label]));
        const atMin = min > 0 && selected.length <= min;
        const removeBtn = el("button", {
          type: "button",
          class: "rui-multiselect-chip-remove",
          // Positional id, so element.ts's focus snapshot can put the keyboard
          // user back on the same slot in the row after the render a removal
          // triggers — without one, removing a chip dumps focus on <body>.
          id: id ? `${id}-chip-${chipIndex}` : null,
          "aria-label": `Remove ${label}`,
          // At the lower bound there is nothing to remove — say so rather than
          // silently swallowing the click.
          disabled: atMin ? "" : null,
        }, ["×"]);
        removeBtn.onclick = (event) => {
          event.stopPropagation();
          const next = selected.filter((v) => v !== value);
          writeSelection(event.currentTarget as Element, next);
        };
        chip.append(removeBtn);
        chipRow.append(chip);
      });
    }
    triggerBtn.append(chipRow);
    const chevron = renderIcon("chevron-down", { className: "rui-multiselect-chevron" });
    if (chevron) triggerBtn.append(chevron);
    root.append(triggerBtn);
    // Nothing announced the current selection count; the chips are inside the
    // (collapsed) trigger, so a keyboard user had no summary at all.
    root.append(el("span", {
      class: "rui-multiselect-status rui-visually-hidden",
      role: "status",
    }, [selectionSummary]));

    const panel = el("div", {
      class: "rui-multiselect-panel",
      id: panelId,
      role: "listbox",
      "aria-multiselectable": "true",
      "aria-busy": loading ? "true" : null,
    });
    const filterInput = el("input", {
      type: "text",
      class: "rui-multiselect-filter",
      // See the Combobox filter: an id is what lets element.ts recover focus and
      // caret when a render replaces the field around the panel (D0337).
      id: id ? `${id}-filter` : null,
      placeholder: "Filter…",
      autocomplete: "off",
      value: filterSlot.get(),
      "aria-label": "Filter options",
      "aria-controls": panelId,
      "aria-autocomplete": "list",
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
      if (loading) {
        // `emptyLabel` here would actively lie: the user reads "No matches" and
        // concludes their query returned nothing.
        target.append(el("div", { class: "rui-multiselect-loading" }, ["Loading…"]));
        return;
      }
      const query = filter.trim();
      const lower = query.toLowerCase();
      const matches = lower === "" || remoteSearch
        ? items
        : items.filter((item) =>
            item.label.toLowerCase().includes(lower) ||
            item.value.toLowerCase().includes(lower),
          );
      const atCapAll = max > 0 && selected.length >= max;
      // Adding a tag that is not in `items` — but never one already selected or
      // already offered, and not once the cap is reached.
      const canCreate = creatable && query !== "" && !atCapAll
        && !selectedSet.has(query)
        && !items.some((item) =>
          item.value.toLowerCase() === lower || item.label.toLowerCase() === lower);
      if (matches.length === 0 && !canCreate) {
        target.append(el("div", { class: "rui-multiselect-empty" }, [emptyLabel]));
        return;
      }
      const active = activeSlot.get();
      // `group` buckets options under a heading, as Combobox and native Select
      // (via <optgroup>) already do. SelectItem declares `group` and `disabled`,
      // so ignoring them here left both silently inert on this picker.
      let lastGroup: string | undefined;
      matches.forEach((item, index) => {
        if (item.group && item.group !== lastGroup) {
          target.append(el("div", {
            class: "rui-multiselect-group",
            role: "presentation",
          }, [item.group]));
          lastGroup = item.group;
        }
        const isSelected = selectedSet.has(item.value);
        const atCap = !isSelected && atCapAll;
        const option = el("button", {
          type: "button",
          class: "rui-multiselect-option",
          role: "option",
          id: optionDomId(index),
          // Driven by `aria-activedescendant`, so not individually tabbable.
          tabindex: "-1",
          "data-value": item.value,
          "data-selected": isSelected ? "true" : "false",
          "data-active": index === active ? "true" : null,
          "data-disabled": item.disabled ? "true" : null,
          // `aria-disabled` rather than the `disabled` attribute for an option
          // the author marked unavailable: a listbox option must stay
          // arrow-reachable and be announced as unavailable, which `disabled`
          // prevents. The selection cap keeps `disabled` — that row is not
          // unavailable in itself, it is the "no room left" state of a
          // still-selectable option.
          "aria-disabled": item.disabled ? "true" : null,
          "aria-selected": isSelected ? "true" : "false",
          disabled: atCap ? "" : null,
        });
        const checkbox = el("span", { class: "rui-multiselect-option-check" });
        const checkIcon = renderIcon(isSelected ? "check" : "", { className: "rui-multiselect-option-check-icon" });
        if (checkIcon) checkbox.append(checkIcon);
        option.append(checkbox);
        option.append(el("span", { class: "rui-multiselect-option-label" }, [item.label]));
        if (!item.disabled) {
          option.onclick = (event) => {
            event.stopPropagation();
            if (atCap) return;
            const next = isSelected
              ? selected.filter((v) => v !== item.value)
              : [...selected, item.value];
            writeSelection(event.currentTarget as Element, next);
          };
        }
        target.append(option);
      });
      if (canCreate) {
        // Same class as a real option so `optionsIn` and
        // `aria-activedescendant` treat it as the last row of the list.
        const create = el("button", {
          type: "button",
          class: "rui-multiselect-option rui-multiselect-create",
          role: "option",
          id: optionDomId(matches.length),
          tabindex: "-1",
          "data-value": query,
          "data-create": "true",
          "data-active": matches.length === active ? "true" : null,
          "aria-selected": "false",
        }, [`Create “${query}”`]);
        create.onclick = (event) => {
          event.stopPropagation();
          writeSelection(event.currentTarget as Element, [...selected, query]);
        };
        target.append(create);
      }
    };

    renderList(list, filterSlot.get());

    const optionsIn = (scope: Element): HTMLElement[] =>
      Array.from(scope.querySelectorAll<HTMLElement>(".rui-multiselect-option[data-value]"));

    const setActiveOption = (panelEl: Element, index: number, filterEl: Element | null): void => {
      const options = optionsIn(panelEl);
      if (options.length === 0) return;
      const clamped = ((index % options.length) + options.length) % options.length;
      activeSlot.set(clamped);
      options.forEach((option, i) => {
        if (i !== clamped) { option.removeAttribute("data-active"); return; }
        option.setAttribute("data-active", "true");
        if (option.id) filterEl?.setAttribute("aria-activedescendant", option.id);
        if (typeof option.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
      });
    };

    filterInput.oninput = (event) => {
      const target = event.currentTarget as HTMLInputElement;
      filterSlot.set(target.value);
      activeSlot.set(-1);
      target.removeAttribute("aria-activedescendant");
      search.schedule(target.value);
      const liveList = target.closest(".rui-multiselect-panel")
        ?.querySelector(".rui-multiselect-list") as HTMLElement | null;
      if (liveList) renderList(liveList, target.value);
    };

    // Keyboard operation: the panel stays open while toggling, so this is the
    // only way to pick several options without losing your place in the list.
    filterInput.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const target = e.currentTarget as HTMLInputElement;
      const panelEl = target.closest(".rui-multiselect-panel");
      if (!panelEl) return;
      const active = activeSlot.get();
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveOption(panelEl, active + 1, target); return; }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveOption(panelEl, active <= 0 ? optionsIn(panelEl).length - 1 : active - 1, target);
        return;
      }
      if (e.key === "Home") { e.preventDefault(); setActiveOption(panelEl, 0, target); return; }
      if (e.key === "End") { e.preventDefault(); setActiveOption(panelEl, optionsIn(panelEl).length - 1, target); return; }
      if (e.key === "Enter" || e.key === " ") {
        const chosen = active >= 0 ? optionsIn(panelEl)[active] : null;
        if (!chosen) return;
        e.preventDefault();
        chosen.click();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        const live = target.closest(".rui-multiselect") as HTMLElement | null;
        openSlot.set(false);
      helpers.invoke(props.onOpenChange, false);
        // A debounced query still in flight would fetch matches for a panel that
        // is closing, and land them in the author's `items` state afterwards.
        search.cancel();
        filterSlot.set("");
        activeSlot.set(-1);
        // Escape returns focus to the trigger — it is a div with no implicit
        // focus behaviour, so nothing would take it and the next Tab would start
        // from the top of the document.
        live?.querySelector<HTMLElement>(".rui-multiselect-trigger")?.focus();
        if (!live) return;
        live.setAttribute("data-open", "false");
        live.querySelector(".rui-multiselect-trigger")?.setAttribute("aria-expanded", "false");
        closeFloating(live.querySelector<HTMLElement>(MULTISELECT_PANEL));
        disposeDismissListeners(live);
      }
    };

    triggerBtn.onclick = (event) => {
      if (disabled) return;
      event.stopPropagation();
      const next = !openSlot.get();
      openSlot.set(next);
      helpers.invoke(props.onOpenChange, next);
      const live = (event.currentTarget as Element).closest(".rui-multiselect") as HTMLElement | null;
      live?.setAttribute("data-open", next ? "true" : "false");
      live?.querySelector(".rui-multiselect-trigger")
        ?.setAttribute("aria-expanded", next ? "true" : "false");
      if (!live) return;
      // Same clipping story as the Combobox, and worse here: a MultiSelect is
      // most often used in a filter bar or a table toolbar, both of which scroll.
      syncFloatingPanel(live, next, MULTISELECT_PANEL, MULTISELECT_TRIGGER, PICKER_FLOATING);
      if (!next) { search.cancel(); disposeDismissListeners(live); return; }
      activeSlot.set(-1);
      // Resolve the filter from the LIVE tree: this handler was copied onto the
      // kept trigger by morph, and the `filterInput` it captured belongs to a
      // discarded render — focusing that does nothing, so typing went to the
      // trigger where Space re-closed the panel. The first interaction worked,
      // which made it look intermittent.
      const cancelFocus = deferToPaint(() => {
        const target = live.querySelector<HTMLInputElement>(".rui-multiselect-filter")
          ?? (filterInput.isConnected ? filterInput : null);
        target?.focus();
      });
      helpers.registerDisposer(cancelFocus, "multiselect-focus");
      installDismissListeners({
        liveRoot: live,
        onDismiss: () => {
          openSlot.set(false);
      helpers.invoke(props.onOpenChange, false);
          search.cancel();
          filterSlot.set("");
          activeSlot.set(-1);
          live.setAttribute("data-open", "false");
          live.querySelector(".rui-multiselect-trigger")
            ?.setAttribute("aria-expanded", "false");
          // Outside-click / Escape is a close path too — un-promote, or the
          // panel stays in the top layer as an orphan nothing can dismiss.
          closeFloating(live.querySelector<HTMLElement>(MULTISELECT_PANEL));
        },
      });
    };

    // The trigger is a div (see above), so Enter / Space / ArrowDown have to be
    // translated into the activation a <button> would have given for free —
    // otherwise the control is unreachable without a pointer.
    triggerBtn.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      if (disabled) return;
      // A keystroke on a chip's remove button is that button's business.
      if (e.target !== e.currentTarget) return;
      const trigger = e.currentTarget as HTMLElement;
      const open = trigger.getAttribute("aria-expanded") === "true";
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trigger.click(); return; }
      // ArrowDown only ever opens (the filter's own handler drives the list from
      // there); Escape only ever closes. `click()` toggles, so both are guarded
      // by the current state rather than fired blind.
      if (e.key === "ArrowDown" && !open) { e.preventDefault(); trigger.click(); return; }
      if (e.key === "Escape" && open) { e.preventDefault(); trigger.click(); }
    };

    root.append(panel);
    if (isOpen) positionPickerOnMount(root, MULTISELECT_PANEL, MULTISELECT_TRIGGER);
    const shell = withFieldShell(root, props, { idKey: "id" });
    // The trigger is the control AT lands on, so the shell's control-level
    // attributes have to move there off the wrapper div.
    relocateControlAria(root, triggerBtn);
    return shell;
  },
};

export const DateRangePicker: ComponentSpec = {
  name: "DateRangePicker",
  description:
    "Paired date inputs with a single label, sharing the same min/max " +
    "range. Pass `$variable` references for both `from` and `to` to " +
    "two-way-bind a date range (ISO `YYYY-MM-DD` strings). The endpoints " +
    "bound each other, so the range cannot be inverted. Pass " +
    "`error`/`required` for a mandatory reporting period, and `locale` " +
    "(`de-DE`, `en-GB`) to echo the chosen period in that locale's date order.",
  props: [
    { name: "id", type: "string" },
    { name: "from", type: "string", optional: true, description: "ISO date start; typically $variable" },
    { name: "to", type: "string", optional: true, description: "ISO date end; typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true, description: "Earliest selectable ISO date" },
    { name: "max", type: "string", optional: true, description: "Latest selectable ISO date" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with `{from, to}` whenever either endpoint changes" },
    { name: "hint", type: "string", optional: true, description: "Helper text rendered below the pair" },
    { name: "error", type: "string", optional: true, description: "Validation error rendered below the pair (marks it invalid)" },
    { name: "required", type: "boolean", optional: true, description: "Mark both endpoints required" },
    { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Called with the current value when focus leaves an endpoint (validate-on-blur)" },
    { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Called when an endpoint gains focus" },
    { name: "locale", type: "string", optional: true, description: "BCP-47 tag (`de-DE`, `en-GB`) the chosen period is echoed in beneath the pair, and the language both endpoints are announced in. Same `locale` channel as `Table`/`Col`. Bound values stay ISO `YYYY-MM-DD`." },
    ...fieldShellExtraProps(),
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const fromId = `${id}-from`;
    const toId = `${id}-to`;
    const locale = localeTag(props.locale);
    const min = asString(props.min);
    const max = asString(props.max);
    const from = asString(props.from);
    const to = asString(props.to);
    const disabled = asBoolean(props.disabled);
    const label = asString(props.label);
    const root = el("div", {
      class: "rui-date-range-picker",
      "data-disabled": disabled ? "true" : "false",
      // The pair is one control; naming the group is what tells a screen-reader
      // user which range the two anonymous date fields belong to.
      role: "group",
      "aria-label": label || null,
    });
    if (label) {
      root.append(el("label", {
        class: "rui-date-range-picker-label",
        id: `${id}-label`,
        for: fromId,
      }, [label]));
      root.setAttribute("aria-labelledby", `${id}-label`);
      root.removeAttribute("aria-label");
    }
    const row = el("div", { class: "rui-date-range-picker-row" });
    const fromInput = el("input", {
      type: "date",
      class: "rui-date-range-picker-input",
      id: fromId,
      name: fromId,
      value: valueAttr(props.from),
      min: min || null,
      // Bound by the chosen end date: identical min/max on both inputs let the
      // user pick to < from and reported that inverted pair through onChange.
      max: to || max || null,
      disabled: disabled ? "" : null,
      "data-role": "from",
      // The single label points at `from` only, and the visual "–" separator is
      // aria-hidden, so without these the `to` field is announced as an
      // anonymous "date" with nothing to say it is the end of a range.
      "aria-label": label ? `${label} start` : "Start date",
      // Which language the endpoint's date is written in — see DatePicker.
      lang: locale ?? null,
    }) as HTMLInputElement;
    row.append(fromInput);
    row.append(el("span", { class: "rui-date-range-picker-separator", "aria-hidden": "true" }, ["–"]));
    const toInput = el("input", {
      type: "date",
      class: "rui-date-range-picker-input",
      id: toId,
      name: toId,
      value: valueAttr(props.to),
      min: from || min || null,
      max: max || null,
      disabled: disabled ? "" : null,
      "data-role": "to",
      "aria-label": label ? `${label} end` : "End date",
      lang: locale ?? null,
    }) as HTMLInputElement;
    row.append(toInput);
    root.append(row);
    const fromState = node.argMeta?.[1]?.stateRef;
    const toState = node.argMeta?.[2]?.stateRef;
    if (fromState) helpers.bindState(fromInput, fromState);
    if (toState) helpers.bindState(toInput, toState);
    const readRange = (target: HTMLInputElement): { from: string; to: string } => {
      const wrapper = target.closest(".rui-date-range-picker");
      const fromValue = wrapper?.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"from\"]")?.value ?? "";
      const toValue = wrapper?.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"to\"]")?.value ?? "";
      return { from: fromValue, to: toValue };
    };
    // Property handlers, assigned unconditionally: the previous
    // `addEventListener` pair inside an `if (props.onChange != null)` was
    // installed on the inputs morph discards, so a handler that appeared on a
    // later render (`onChange: $live ? refetch : null`) never fired while the
    // bound $variables updated correctly — dates changed, chart never refreshed.
    const onEndpointChange = (event: Event): void => {
      const target = (event.currentTarget ?? event.target) as HTMLInputElement | null;
      if (!target) return;
      const wrapper = target.closest(".rui-date-range-picker");
      const liveFrom = wrapper?.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"from\"]");
      const liveTo = wrapper?.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"to\"]");
      // Tighten the counterpart immediately, for the uncontrolled case where no
      // re-render will recompute the bounds from props.
      if (liveFrom && liveTo) {
        liveTo.min = liveFrom.value || min;
        liveFrom.max = liveTo.value || max;
      }
      helpers.invoke(props.onChange, readRange(target));
    };
    composeHandler(fromInput, "onchange", onEndpointChange);
    composeHandler(toInput, "onchange", onEndpointChange);
    if (locale) {
      // One readout for the pair, not one per endpoint: the period is what the
      // author asked to see in their locale, and "01.02.2026 – 28.02.2026" is
      // unambiguous where the native boxes' order is the browser's choice.
      const periodText = (f: string, t: string): string => {
        const start = formatDateInLocale(f, locale);
        const end = formatDateInLocale(t, locale);
        return start && end ? `${start} – ${end}` : start || end;
      };
      root.append(el("span", {
        class: "rui-date-range-picker-readout",
        // Same values both endpoints already announce — see DatePicker.
        "aria-hidden": "true",
      }, [periodText(from, to)]));
      const syncReadout = (liveRoot: Element): string => periodText(
        // By `data-role`, not by document order: the separator and any future
        // chrome between the two fields must not be able to reverse the period.
        liveRoot.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"from\"]")?.value ?? "",
        liveRoot.querySelector<HTMLInputElement>(".rui-date-range-picker-input[data-role=\"to\"]")?.value ?? "",
      );
      wireDateReadout(fromInput, ".rui-date-range-picker", ".rui-date-range-picker-readout", syncReadout);
      wireDateReadout(toInput, ".rui-date-range-picker", ".rui-date-range-picker-readout", syncReadout);
    }
    attachFocusHandlers(fromInput, props, helpers);
    attachFocusHandlers(toInput, props, helpers);
    const shell = withFieldShell(root, { ...props, label: null }, { idKey: "id" });
    // `required` / `aria-invalid` / `aria-describedby` have to reach real
    // controls; on the wrapper they are inert.
    relocateControlAria(root, fromInput);
    for (const attr of ["required", "aria-invalid", "aria-describedby"]) {
      const value = fromInput.getAttribute(attr);
      if (value !== null) toInput.setAttribute(attr, value);
    }
    return shell;
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
  const rendered = Combobox.render(
    { ...node, argMeta: meta } as ComponentNode,
    {
      id: props.id,
      items: props.items,
      value: props.value,
      placeholder: props.placeholder,
      emptyLabel: asString(props.emptyLabel) || "No matches",
      // Every prop the author declared has to reach the Combobox or it is
      // silently dropped: `onChange` never fired (so a dependent Select stayed
      // empty), and the label / required marker / error text vanished the moment
      // `searchable: true` was added. Toggling the flag off made all five
      // reappear, which sent authors hunting for a data problem.
      disabled: props.disabled,
      onChange: props.onChange,
      label: props.label,
      hint: props.hint,
      error: props.error,
      required: props.required,
      loading: props.loading,
      // Without this a `searchable` Select could only ever filter the options it
      // was handed, so a picker over anything larger than one state cell (users,
      // SKUs, repos) had to be a Combobox instead.
      onSearch: props.onSearch,
      // The non-searchable branch wires these through `attachFocusHandlers`, so
      // dropping them here made validate-on-blur work on a Select right up until
      // someone added `searchable: true`.
      onBlur: props.onBlur,
      onFocus: props.onFocus,
      // Same class of bug as the five above: a label the author had hidden
      // reappeared the moment the Select became searchable.
      labelHidden: props.labelHidden,
    },
    helpers,
  ) as HTMLElement;
  // The Combobox may return a field shell; the marker class belongs on the
  // picker itself (the disabled/width rules key off `.rui-select-searchable`).
  const comboRoot = rendered.classList.contains("rui-combobox")
    ? rendered
    : rendered.querySelector<HTMLElement>(".rui-combobox") ?? rendered;
  comboRoot.classList.add("rui-select-searchable");
  return rendered;
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

/**
 * Apply `validations` hints to a live input.
 *
 * Two rules earned by bug reports:
 *
 *  1. A length hint is only applied when it parses to a positive integer.
 *     `Number("120 chars")` is NaN and the old `|| 0` turned that into
 *     `maxLength = 0` — a valid attribute meaning "accept no characters", so
 *     the field silently refused every keystroke with nothing in the DOM or the
 *     console to explain it.
 *  2. A hint never mutates `type`. `validations: ["email"]` used to overwrite an
 *     explicit `type: "tel"`, which shows the wrong mobile keyboard and makes
 *     native validation reject valid phone numbers. `email` now only fills in a
 *     type the author did not assert.
 */
function applyValidations(
  input: HTMLInputElement,
  validations: unknown,
  hasExplicitType = false,
): void {
  if (!validations) return;
  const list = Array.isArray(validations)
    ? validations.map((v) => String(v))
    : typeof validations === "object"
      ? Object.entries(validations as Record<string, unknown>).map(([k, v]) => (v ? `${k}:${v}` : k))
      : [];
  const positiveInt = (raw: string, hint: string): number | null => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      console.warn(`[aktion] Input validations: "${hint}" is not a positive number — ignored.`);
      return null;
    }
    return Math.floor(n);
  };
  for (const v of list) {
    if (v === "required") {
      input.required = true;
    } else if (v.startsWith("minLength:")) {
      const n = positiveInt(v.slice("minLength:".length), v);
      if (n !== null) input.minLength = n;
    } else if (v.startsWith("maxLength:")) {
      const n = positiveInt(v.slice("maxLength:".length), v);
      if (n !== null) input.maxLength = n;
    } else if (v.startsWith("pattern:")) {
      const pattern = v.slice("pattern:".length);
      if (pattern) input.pattern = pattern;
    } else if (v.startsWith("min:")) {
      input.min = v.slice("min:".length);
    } else if (v.startsWith("max:")) {
      input.max = v.slice("max:".length);
    } else if (v === "email") {
      if (!hasExplicitType) input.type = "email";
    } else {
      console.warn(`[aktion] Input validations: unrecognised hint "${v}" — ignored.`);
    }
  }
}
