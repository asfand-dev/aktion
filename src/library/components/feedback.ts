/**
 * Feedback primitives modeled after shadcn/ui:
 * Avatar, AvatarGroup, Progress, Switch, Toggle, ToggleGroup, Tooltip,
 * HoverCard, Popover, Toast, Toasts, Kbd.
 *
 * These cover the most common "small bits of UI" that the LLM otherwise has
 * to fake with Text + emoji combinations. Every component is purely
 * declarative — state binding is done at the prop level so a `$variable`
 * passed to `Switch` two-way-binds the same way it does for `Checkbox`.
 *
 * The three anchored popups here (Tooltip, HoverCard, Popover) hand their
 * panel to the shared floating layer instead of positioning it themselves —
 * see the block above `Tooltip` for why.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, isComponentNode,
  sanitiseCssLength, sanitiseImageSrc,
} from "../utils.js";
import {
  initialsFor, installDismissListeners, disposeDismissListeners, dicebearUrlFor,
  dialogKeydownHandler, wireDialogFocus,
} from "./_internal.js";
import { getCustomIcon, resolveIconClasses } from "../../icons/index.js";
import { closeFloating, deferToPaint, openFloating, syncFloatingPanel } from "../floating.js";
import type { FloatingAlign, FloatingOptions, FloatingSide } from "../floating.js";

/**
 * Elements that already take focus on their own. A popup wrapper only needs its
 * own `tabindex` when the trigger it wraps has none — adding one regardless
 * duplicates the tab stop in front of every Button / IconButton / Link.
 */
const FOCUSABLE_TRIGGER_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

function triggerIsFocusable(node: Node | null | undefined): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return node.matches(FOCUSABLE_TRIGGER_SELECTOR)
    || node.querySelector(FOCUSABLE_TRIGGER_SELECTOR) !== null;
}

/**
 * Point an element's `aria-describedby` at `id` without discarding a
 * description the wrapped component set for itself.
 */
function describeTrigger(node: Node | null | undefined, id: string): void {
  if (!(node instanceof HTMLElement)) return;
  const existing = node.getAttribute("aria-describedby");
  if (!existing) { node.setAttribute("aria-describedby", id); return; }
  if (existing.split(/\s+/).includes(id)) return;
  node.setAttribute("aria-describedby", `${existing} ${id}`);
}

let PANEL_ID_SEQ = 0;

/**
 * Stable per-instance DOM id for a panel that has to be referenced by
 * `aria-describedby` / `aria-labelledby`. The counter is only consulted the
 * first time an instance renders — the value then lives in instance state, so
 * re-renders keep the same id and morph has no attribute churn to patch.
 */
function panelId(slot: { get: () => string; set: (value: string) => void }, prefix: string): string {
  const existing = slot.get();
  if (existing) return existing;
  PANEL_ID_SEQ += 1;
  const next = `${prefix}-${PANEL_ID_SEQ}`;
  slot.set(next);
  return next;
}

const AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;

const AVATAR_FALLBACKS = ["initials", "dicebear", "gradient"] as const;

/**
 * Deterministic offline avatar (IX.4): hash the seed into a hue and render a
 * two-stop gradient swatch with the initials. No network — works offline.
 */
function gradientAvatarStyle(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  return `background:linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${hue2} 65% 45%));color:#fff;`;
}

export const Avatar: ComponentSpec = {
  name: "Avatar",
  description:
    "User avatar. Shows the image at `src`. When `src` is missing, falls back " +
    "to a deterministic DiceBear illustration seeded by `name` (pass " +
    "`fallback=\"initials\"` to render two-letter initials instead, or " +
    "`\"gradient\"` for an offline seeded swatch). If the image errors at " +
    "runtime the avatar gracefully degrades to initials. `status` is " +
    "announced as part of the accessible name (\"Ada Lovelace, busy\").",
  props: [
    { name: "name", type: "string", description: "Accessible name + initials fallback" },
    { name: "src", type: "string", optional: true, description: "Image URL" },
    { name: "size", type: "string", optional: true, enum: AVATAR_SIZES },
    { name: "status", type: "string", optional: true, enum: ["online", "offline", "busy", "away"] },
    {
      name: "fallback",
      type: "string",
      optional: true,
      enum: AVATAR_FALLBACKS,
      description: "How to render when `src` is missing (default: dicebear illustration; pass `initials` for the two-letter pill)",
    },
  ],
  render: (_node, props, helpers) => {
    const size = asString(props.size, "md");
    const name = asString(props.name);
    const status = asString(props.status);
    // The wrapper owns the accessible name: ARIA prunes the children of
    // `role="img"`, so the inner `<img alt>` / initials text is never announced
    // on its own — and the status dot is colour-only without this.
    const label = status ? `${name}, ${status}` : name;
    const root = el("span", {
      class: "rui-avatar",
      "data-size": size,
      role: name ? "img" : "presentation",
      "aria-label": name ? label : null,
    });
    const fallback = asString(props.fallback, "dicebear") as (typeof AVATAR_FALLBACKS)[number];
    const explicitSrc = sanitiseImageSrc(props.src);
    const generated = !explicitSrc && fallback === "dicebear" && name
      ? sanitiseImageSrc(dicebearUrlFor(name))
      : "";
    const src = explicitSrc || generated;
    // Offline generated gradient avatar (IX.4) / two-letter pill.
    const fallbackNode = (): HTMLElement => (fallback === "gradient" && name
      ? el("span", {
        class: "rui-avatar-fallback rui-avatar-gradient",
        style: gradientAvatarStyle(name),
      }, [initialsFor(name)])
      : el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
    // Remember a broken image *per src*. The `onerror` fallback swaps the live
    // `<img>` for a `<span>`, so without a record the next render emits an
    // `<img>` again, morph replaces the span (tag mismatch), the dead URL is
    // re-requested and the initials flash back — on every commit. Keying by src
    // also clears the latch when the author points at a different image.
    const errorSlot = src ? helpers.useInstanceState<boolean>(`img-error:${src}`, false) : null;
    if (src && !errorSlot?.get()) {
      // `alt=""` because the root carries the name: a duplicated one would be
      // announced twice on engines that do expose the child.
      const img = el("img", { src, alt: "", loading: "lazy" });
      img.onerror = (event) => {
        errorSlot?.set(true);
        const ev = event as Event;
        const live = (ev.currentTarget ?? ev.target) as Element;
        live.replaceWith(fallbackNode());
      };
      root.append(img);
    } else {
      root.append(fallbackNode());
    }
    if (status) {
      root.append(el("span", {
        class: "rui-avatar-status",
        "data-status": status,
        // Sighted users get the presence as a tooltip; AT gets it from the
        // root's aria-label (this node is inside a pruned `role="img"`).
        title: status,
      }));
    }
    return root;
  },
};

export const AvatarGroup: ComponentSpec = {
  name: "AvatarGroup",
  description:
    "Stack of overlapping avatars with a `+N` chip when the list overflows. " +
    "Pass either Avatar(...) nodes or plain {name, src, status?, fallback?} " +
    "objects. Set `total` when the list is only a page of a larger set (5 " +
    "avatars out of 200 members renders `+195`), and `fallback: \"initials\"` " +
    "to keep the whole pile offline (the default DiceBear illustration is a " +
    "network request per member).",
  props: [
    { name: "items", type: "Avatar[]", description: "Avatar(...) nodes or {name, src, status?, fallback?} objects" },
    { name: "max", type: "number", optional: true, description: "Maximum avatars to show (default 4)" },
    { name: "size", type: "string", optional: true, enum: AVATAR_SIZES },
    { name: "total", type: "number", optional: true, description: "Total member count when `items` is only a page of it — drives the `+N` chip" },
    {
      name: "fallback",
      type: "string",
      optional: true,
      enum: AVATAR_FALLBACKS,
      description: "Default fallback for `{name}` items that have no `src` (per-item `fallback` wins)",
    },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    // `asNumber` rather than `Number()`: a non-numeric `max` yielded NaN, and
    // `slice(0, NaN)` renders zero avatars behind a `+N` chip counting all of them.
    const max = Math.max(1, Math.floor(asNumber(props.max, 4)));
    const size = asString(props.size, "md");
    const groupFallback = asString(props.fallback);
    const visible = items.slice(0, max);
    // `total` describes the real population, which `items` often cannot: an API
    // page of 5 out of 200 can otherwise only ever say `+1`.
    const total = props.total != null ? Math.max(0, Math.floor(asNumber(props.total, 0))) : null;
    const overflow = Math.max(0, (total ?? items.length) - visible.length);
    const root = el("div", { class: "rui-avatar-group", "data-size": size });
    for (const item of visible) {
      if (isComponentNode(item)) {
        const child = helpers.renderNode(item);
        // The overlap margin is picked from the group's `data-size`, so a child
        // that did not choose its own size has to inherit it or a `lg` group
        // overlaps `md` avatars by a third instead of a fifth. Slot 2 is
        // Avatar's declared `size` slot, so this sees both call forms.
        const declaredSize = (item as { args?: unknown[] }).args?.[2];
        if (declaredSize == null && child instanceof Element && child.classList.contains("rui-avatar")) {
          child.setAttribute("data-size", size);
        }
        root.append(child);
        continue;
      }
      const data = item as { name?: unknown; src?: unknown; status?: unknown; fallback?: unknown } | string | null;
      const plain = typeof data === "string";
      const name = plain ? data : asString((data ?? {}).name);
      const src = plain ? "" : asString((data ?? {}).src);
      const status = plain ? "" : asString((data ?? {}).status);
      const itemFallback = (plain ? "" : asString((data ?? {}).fallback)) || groupFallback;
      root.append(Avatar.render(
        { __kind: "Component", name: "Avatar", args: [], argMeta: [] },
        // `undefined` (not "") so Avatar's own default still applies.
        { name, src, size, status, fallback: itemFallback || undefined },
        helpers,
      ));
    }
    if (overflow > 0) {
      root.append(el("span", {
        class: "rui-avatar rui-avatar-overflow",
        "data-size": size,
      }, [el("span", { class: "rui-avatar-fallback" }, [`+${overflow}`])]));
    }
    return root;
  },
};

/**
 * `progressbar` REQUIRES an accessible name, and an unnamed one announces as a
 * bare "progress bar, 62 percent" — three of them on a dashboard are then
 * indistinguishable. `label` is the real name; this is the last resort so the
 * role is never left nameless.
 *
 * Note what is deliberately absent: no `aria-live` on the bar. A determinate
 * progressbar is a polled control (AT reads the value when the user asks, and on
 * focus), and a live region that re-announces on every commit turns a download
 * from 1% to 100% into a hundred interruptions. The busy state that IS worth
 * publishing — an indeterminate bar — travels as `aria-busy` instead.
 */
const PROGRESS_FALLBACK_NAME = "Progress";

export const Progress: ComponentSpec = {
  name: "Progress",
  description:
    "Linear progress bar. `value` is clamped between 0 and `max` (default " +
    "100). `indeterminate=true` renders a looping animation when the total " +
    "is unknown. Provide `segments` to render a segmented progress strip " +
    "(steps in an onboarding flow), or `buffered` for a secondary " +
    "buffer indicator (downloads, video buffering) — a segmented bar shows " +
    "the buffer as pre-lit segments. `label` also becomes the bar's " +
    "accessible name.",
  props: [
    { name: "value", type: "number", optional: true, description: "Current progress; ignored when indeterminate" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: "Shown above the bar" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "indeterminate", type: "boolean", optional: true },
    { name: "showValue", type: "boolean", optional: true, description: "Show the numeric value on the right" },
    { name: "segments", type: "number", optional: true, description: "Render N equal segments (filled by current step)" },
    { name: "buffered", type: "number", optional: true, description: "Secondary value (0..max) drawn behind the bar" },
  ],
  render: (_node, props) => {
    const max = Math.max(1, asNumber(props.max, 100));
    const indeterminate = asBoolean(props.indeterminate);
    const value = Math.max(0, Math.min(max, asNumber(props.value, 0)));
    const percent = Math.round((value / max) * 100);
    // Clamp: `segments` drives a DOM-creation loop, so an unclamped value
    // (`segments: 1e7`) turns one prop into a frozen tab.
    const segments = Math.min(200, Math.max(0, Math.floor(asNumber(props.segments, 0))));
    const buffered = props.buffered != null ? Math.max(0, Math.min(max, asNumber(props.buffered, 0))) : null;
    const tone = asString(props.tone, "primary");
    const root = el("div", { class: "rui-progress", "data-tone": tone });
    const label = asString(props.label);
    const showValue = asBoolean(props.showValue);
    if (label || showValue) {
      const head = el("div", { class: "rui-progress-head" });
      head.append(el("span", { class: "rui-progress-label" }, [label]));
      if (showValue && !indeterminate) {
        const display = segments > 0
          ? `${Math.min(segments, Math.round((value / max) * segments))} / ${segments}`
          : `${percent}%`;
        head.append(el("span", { class: "rui-progress-value" }, [display]));
      }
      root.append(head);
    }

    if (segments > 0 && !indeterminate) {
      const filled = Math.min(segments, Math.round((value / max) * segments));
      const trackRoot = el("div", {
        class: "rui-progress-segments",
        role: "progressbar",
        // Without a name three bars on one page all announce as an unnamed
        // "progress bar, 62 percent" with nothing to tell them apart.
        "aria-label": label || PROGRESS_FALLBACK_NAME,
        "aria-valuemin": "0",
        "aria-valuemax": String(segments),
        "aria-valuenow": String(filled),
        // A step strip is counted, not measured: the derived percentage AT would
        // otherwise read ("60%") contradicts the "3 / 5" printed next to it.
        "aria-valuetext": `${filled} of ${segments}`,
      });
      // `buffered` used to be dropped silently in this branch; a segmented bar
      // shows it as pre-lit segments beyond the filled ones.
      const bufferedSegments = buffered !== null
        ? Math.min(segments, Math.round((buffered / max) * segments))
        : 0;
      for (let i = 0; i < segments; i += 1) {
        trackRoot.append(el("span", {
          class: "rui-progress-segment",
          // Mirror the tone onto every segment: theme overrides target
          // `.rui-progress-segment[data-tone=…]` directly, and tone only lived
          // on the root, so those rules never matched.
          "data-tone": tone,
          "data-filled": i < filled ? "true" : "false",
          "data-buffered": i >= filled && i < bufferedSegments ? "true" : null,
        }));
      }
      root.append(trackRoot);
      return root;
    }

    const track = el("div", {
      class: "rui-progress-track",
      role: "progressbar",
      "aria-label": label || (indeterminate ? "Loading" : PROGRESS_FALLBACK_NAME),
      "aria-valuemin": "0",
      "aria-valuemax": String(max),
      "aria-valuenow": indeterminate ? null : String(value),
      "aria-busy": indeterminate ? "true" : null,
      "data-indeterminate": indeterminate ? "true" : "false",
    });
    if (buffered !== null) {
      const bufferedPercent = Math.round((buffered / max) * 100);
      track.append(el("div", {
        class: "rui-progress-buffer",
        style: `width:${bufferedPercent}%`,
        "aria-hidden": "true",
      }));
    }
    track.append(el("div", {
      class: "rui-progress-bar",
      style: indeterminate ? "" : `width:${percent}%`,
    }));
    root.append(track);
    return root;
  },
};

export const Switch: ComponentSpec = {
  name: "Switch",
  description:
    "Compact on/off toggle. Pass a `$variable` as `value` for two-way binding " +
    "— prefer Switch over Checkbox when the control represents a setting. " +
    "`onChange(checked)` fires with the new boolean.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string", optional: true },
    { name: "value", type: "boolean", optional: true, aliases: ["checked"], description: "Bound value (typically $variable)" },
    { name: "description", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new boolean value" },
    { name: "labelHidden", type: "boolean", optional: true, description: "Keep the label in the accessibility tree but hide it visually — for a switch in a table cell whose column header already carries the name" },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("label", {
      class: "rui-switch",
      for: id,
      "data-disabled": asBoolean(props.disabled) ? "true" : "false",
    });
    // Declared slot index of `value` — never `argMeta.find(…)`, which would
    // return the first `$`-bound slot (the label, an id, …) instead.
    const stateName = node.argMeta?.[2]?.stateRef;
    // With neither a binding nor a `value` the switch is uncontrolled, and its
    // checked state lived only in the DOM: any unrelated re-render re-asserted
    // `checked=false` and visibly flipped it back off. Keep it per instance.
    const controlled = stateName != null || props.value != null;
    const localSlot = controlled ? null : helpers.useInstanceState<boolean>("checked", false);
    const isChecked = localSlot ? localSlot.get() : asBoolean(props.value);
    const input = el("input", {
      type: "checkbox",
      id,
      name: id,
      class: "rui-switch-input",
      role: "switch",
      // Only assert `checked` when this render really holds a checked state:
      // morph reads a present attribute as a deliberate assertion, and an
      // absent one as "leave the user's toggle alone".
      checked: isChecked ? "" : null,
      // `role="switch"` overrides the checkbox's native mapping, so the state
      // has to be published explicitly (the change handler keeps it in sync).
      "aria-checked": isChecked ? "true" : "false",
      disabled: asBoolean(props.disabled) ? "" : null,
    }) as HTMLInputElement;
    input.checked = isChecked;
    const track = el("span", { class: "rui-switch-track" }, [
      el("span", { class: "rui-switch-thumb" }),
    ]);
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "change",
        getValue: (n) => (n as HTMLInputElement).checked,
      });
    }
    // Property handler, never `addEventListener`: morph copies `onchange` onto
    // the node it keeps, so a handler that only appears on a later render still
    // fires, and swapping `onChange` is not frozen at the first render's
    // closure. `bindState` uses the same property, so chain rather than clobber.
    const boundChange = input.onchange;
    input.onchange = function (event) {
      const live = (event.currentTarget ?? event.target) as HTMLInputElement;
      boundChange?.call(this, event);
      if (localSlot) localSlot.set(live.checked);
      live.setAttribute("aria-checked", live.checked ? "true" : "false");
      helpers.invoke(props.onChange, live.checked);
    };
    const label = asString(props.label);
    const description = asString(props.description);
    root.append(input, track);
    if (label || description) {
      // `labelHidden` takes the label off the screen but leaves it in the
      // accessibility tree, so a switch in a grid cell is still named by its
      // column header without repeating that word in every row. Same contract as
      // the field-shell inputs (see forms-shared.ts) — never `display: none`.
      const labelClass = asBoolean(props.labelHidden)
        ? "rui-switch-label rui-visually-hidden"
        : "rui-switch-label";
      const meta = el("span", { class: "rui-switch-meta" });
      if (label) meta.append(el("span", { class: labelClass }, [label]));
      if (description) meta.append(el("span", { class: "rui-switch-description" }, [description]));
      root.append(meta);
    }
    return root;
  },
};

const TOGGLE_VARIANTS = ["default", "outline", "ghost"] as const;

export const ToggleGroup: ComponentSpec = {
  name: "ToggleGroup",
  description:
    "Group of Toggle-style buttons. Items are `[value, label]` arrays, " +
    "`{value, label, icon?, disabled?}` objects, or plain strings (used for " +
    "both value and label). Single-select by default — pass `multiple: true` " +
    "for an independently toggleable set (a bold/italic/underline toolbar), " +
    "which reads and writes an ARRAY of values. Pass a `$variable` as `value` " +
    "for two-way binding; item values keep their original type, so numeric " +
    "items write numbers back. `onChange(value)` fires with the new " +
    "selection. Left/Right arrows move between items; give the group a " +
    "`label` so screen readers can tell two groups apart.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "any[]" },
    { name: "value", type: "any", optional: true },
    { name: "variant", aliases: ["tone"], type: "string", optional: true, enum: TOGGLE_VARIANTS },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value (an array when `multiple`)" },
    // Appended below `onChange` on purpose: `value` is read from its declared
    // slot index (2), so the existing slots must not move.
    { name: "multiple", type: "boolean", optional: true, description: "Let any number of items be on at once; reads/writes an array" },
    { name: "type", type: "string", optional: true, enum: ["single", "multiple"], description: "Selection mode — `single` (default) or `multiple`" },
    { name: "disabled", type: "boolean", optional: true, description: "Disable every item in the group" },
    { name: "label", type: "string", optional: true, aliases: ["ariaLabel"], description: "Accessible name for the group (required by the radiogroup role)" },
  ],
  render: (node, props, helpers) => {
    // `id` occupies the implicit positional slot, so `ToggleGroup(["Day","Week"])`
    // lands the item list there and would otherwise render an empty group.
    const idHoldsItems = Array.isArray(props.id) && props.items == null;
    const id = idHoldsItems ? "" : asString(props.id);
    const multiple = asBoolean(props.multiple) || asString(props.type) === "multiple";
    const variant = asString(props.variant, "outline");
    const size = asString(props.size, "md");
    const groupDisabled = asBoolean(props.disabled);
    const groupLabel = asString(props.label);
    // Declared slot index of `value`.
    const stateName = node.argMeta?.[2]?.stateRef;
    // Without a binding AND without `onChange` a click used to do nothing at
    // all — no state, no repaint — so the control looked interactive and was
    // inert. Mirror Rating: keep the selection per instance and repaint.
    const localSlot = stateName
      ? null
      : helpers.useInstanceState<unknown>("toggle-value", props.value);
    const current = localSlot ? localSlot.get() : props.value;
    const items = asArray<unknown>(idHoldsItems ? props.id : props.items).map(extractToggleItem);
    const selected = selectedToggleKeys(current, multiple);
    const root = el("div", {
      class: "rui-toggle-group",
      // The declared prop used to swallow the universal `id` channel without
      // applying it, so `ToggleGroup(id: "view")` produced an element with no id.
      id: id || null,
      // A multi-select group is a set of independent toggle buttons, not a set
      // of radios: `aria-pressed` is the model AT announces for that.
      role: multiple ? "group" : "radiogroup",
      "aria-label": groupLabel || null,
      "aria-disabled": groupDisabled ? "true" : null,
      "data-variant": variant,
      "data-size": size,
      "data-multiple": multiple ? "true" : null,
      "data-disabled": groupDisabled ? "true" : null,
    });

    const commit = (origin: HTMLElement, item: ToggleItem): void => {
      // Read the value at click time (the local slot is authoritative for an
      // unbound group) and keep the item's original type: coercing to a string
      // broke every `$year == 2023` comparison downstream.
      const source = localSlot ? localSlot.get() : props.value;
      let next: unknown;
      if (multiple) {
        const list = asArray<unknown>(source);
        next = list.some((v) => asString(v) === item.key)
          ? list.filter((v) => asString(v) !== item.key)
          : [...list, item.value];
      } else {
        next = item.value;
      }
      if (stateName) helpers.setState(stateName, next);
      if (localSlot) localSlot.set(next);
      // Resolve the container from the live event, never from the render-time
      // capture: morph keeps the previous DOM and discards this render's nodes.
      paintToggleGroup(origin.closest(".rui-toggle-group"), next, multiple);
      helpers.invoke(props.onChange, next);
    };
    const activate = (origin: HTMLElement): void => {
      const key = origin.getAttribute("data-value") ?? "";
      const item = items.find((it) => it.key === key);
      if (item) commit(origin, item);
    };

    // Roving tabindex: a radiogroup is ONE tab stop, and the arrows move
    // within it. Land it on the selected item, or the first enabled one.
    const selectedIndex = items.findIndex((it) => selected.has(it.key) && !it.disabled);
    const firstEnabled = items.findIndex((it) => !it.disabled);
    const rovingIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, firstEnabled);

    items.forEach((item, index) => {
      const isOn = selected.has(item.key);
      const disabled = groupDisabled || item.disabled;
      const btn = el("button", {
        type: "button",
        class: "rui-toggle",
        role: multiple ? null : "radio",
        "aria-checked": multiple ? null : (isOn ? "true" : "false"),
        "aria-pressed": multiple ? (isOn ? "true" : "false") : null,
        "data-variant": variant,
        "data-size": size,
        "data-state": isOn ? "on" : "off",
        "data-value": item.key,
        disabled: disabled ? "" : null,
        tabindex: multiple || disabled ? null : (index === rovingIndex ? "0" : "-1"),
      });
      const itemIconNode = renderIcon(item.icon, { className: "rui-toggle-icon" });
      if (itemIconNode) btn.append(itemIconNode);
      btn.append(el("span", { class: "rui-toggle-label" }, [item.label]));
      if (!disabled) {
        btn.onclick = (event) => {
          activate((event.currentTarget ?? event.target) as HTMLElement);
        };
        if (!multiple) {
          // The radio interaction model AT advertises: arrows move focus AND
          // select. Without this the group announced "use arrow keys" and the
          // arrows did nothing.
          btn.onkeydown = (event) => moveToggleFocus(event as KeyboardEvent, activate);
        }
      }
      root.append(btn);
    });
    return root;
  },
};

interface ToggleItem {
  /** The item's value with its original type preserved (number, boolean, …). */
  value: unknown;
  /** Stringified value — used for DOM attributes and selection comparison. */
  key: string;
  label: string;
  icon: string;
  disabled: boolean;
}

function extractToggleItem(raw: unknown): ToggleItem {
  if (typeof raw === "string") return { value: raw, key: raw, label: raw, icon: "", disabled: false };
  if (typeof raw === "number" || typeof raw === "boolean") {
    const key = String(raw);
    return { value: raw, key, label: key, icon: "", disabled: false };
  }
  if (Array.isArray(raw)) {
    const value = raw[0];
    return {
      value,
      key: asString(value),
      label: asString(raw[1], asString(value)),
      icon: asString(raw[2]),
      disabled: asBoolean(raw[3]),
    };
  }
  if (raw && typeof raw === "object") {
    const r = raw as { value?: unknown; label?: unknown; icon?: unknown; disabled?: unknown };
    const value = r.value;
    return {
      value,
      key: asString(value),
      label: asString(r.label, asString(value)),
      icon: asString(r.icon),
      disabled: asBoolean(r.disabled),
    };
  }
  return { value: "", key: "", label: "", icon: "", disabled: false };
}

/** The set of selected item keys, for both the single and the array form. */
function selectedToggleKeys(value: unknown, multiple: boolean): Set<string> {
  if (multiple) return new Set(asArray<unknown>(value).map((v) => asString(v)));
  return value == null ? new Set() : new Set([asString(value)]);
}

/**
 * Repaint a live ToggleGroup's selection without a full re-render — the unbound
 * (instance-state) path has no other way to reflect the click, since an
 * instance-state write does not schedule a render.
 */
function paintToggleGroup(root: Element | null, value: unknown, multiple: boolean): void {
  if (!root) return;
  const keys = selectedToggleKeys(value, multiple);
  const buttons = [...root.querySelectorAll<HTMLElement>(".rui-toggle")];
  for (const btn of buttons) {
    const on = keys.has(btn.getAttribute("data-value") ?? "");
    btn.setAttribute("data-state", on ? "on" : "off");
    if (multiple) btn.setAttribute("aria-pressed", on ? "true" : "false");
    else btn.setAttribute("aria-checked", on ? "true" : "false");
  }
  if (multiple) return;
  // The radiogroup's single tab stop belongs to the *checked* item. Repainting
  // only the checked state left it on the previously-selected button, so tabbing
  // away and back landed on the old choice. (A `multiple` group is a set of
  // independent toggle buttons, which each keep their own tab stop.)
  const enabled = buttons.filter((btn) => !btn.hasAttribute("disabled"));
  const checked = enabled.find((btn) => keys.has(btn.getAttribute("data-value") ?? "")) ?? enabled[0];
  for (const btn of enabled) btn.setAttribute("tabindex", btn === checked ? "0" : "-1");
}

/** Arrow/Home/End navigation for the single-select (radiogroup) form. */
function moveToggleFocus(event: KeyboardEvent, activate: (btn: HTMLElement) => void): void {
  const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
  const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
  if (!forward && !back && event.key !== "Home" && event.key !== "End") return;
  const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
  const group = origin?.closest(".rui-toggle-group");
  if (!origin || !group) return;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>(".rui-toggle:not([disabled])")];
  const at = buttons.indexOf(origin as HTMLButtonElement);
  if (at < 0) return;
  event.preventDefault();
  const target = event.key === "Home"
    ? buttons[0]
    : event.key === "End"
      ? buttons[buttons.length - 1]
      : buttons[(at + (forward ? 1 : -1) + buttons.length) % buttons.length];
  if (!target) return;
  for (const btn of buttons) btn.setAttribute("tabindex", btn === target ? "0" : "-1");
  target.focus();
  activate(target);
}

/* ------------------------------------------------------------------------ *
 * Anchored popups — Tooltip, HoverCard, Popover
 *
 * All three used to render their panel as a `position: absolute` child of
 * their own trigger, so any ancestor with non-visible `overflow` amputated it
 * (a table wrapper, a modal body, an accordion item, an InputGroup, a scroll
 * area, …). `position: fixed` is not a fix either: it is re-trapped by
 * `transform` / `will-change` / `backdrop-filter` ancestors, which this
 * library creates itself. So the panel is handed to the shared floating layer,
 * which promotes it into the browser top layer — the only place that escapes
 * both — and measures its coordinates in JS.
 * ------------------------------------------------------------------------ */

const POPOVER_SIDES = ["bottom", "top", "left", "right"] as const;
const POPOVER_ALIGNS = ["start", "center", "end"] as const;

/** The options a hover controller fills in for itself. */
type HoverFloatingOptions = Omit<FloatingOptions, "anchor" | "side">;

interface HoverPanelController {
  /**
   * Resolve the *live* root from an event. Never trust the closure-captured
   * root: the morph reconciler copies handlers onto kept DOM, so the captured
   * node is frequently a discarded render snapshot — and promoting/closing a
   * detached panel would leave the live one orphaned in the top layer.
   */
  resolve: (event: Event) => HTMLElement | null;
  open: (liveRoot: HTMLElement) => void;
  close: (liveRoot: HTMLElement) => void;
}

/**
 * Build the open/close pair for a hover-driven panel (Tooltip, HoverCard).
 *
 * Anchoring is deliberately on the component root rather than on the
 * `*-trigger` span: that span is `display: contents`, so it generates no box
 * at all and `getBoundingClientRect()` reports zeros — the panel would end up
 * pinned to the viewport origin. The root is an `inline-flex` box around the
 * same content, so it is the correct anchor.
 */
const hoverPanelController = (
  rootSelector: string,
  panelSelector: string,
  defaultSide: FloatingSide,
  floating: HoverFloatingOptions,
): HoverPanelController => ({
  resolve: (event) => {
    const origin = (event.currentTarget ?? event.target) as Element | null;
    return (origin?.closest(rootSelector) as HTMLElement | null) ?? null;
  },
  open: (liveRoot) => {
    const panel = liveRoot.querySelector<HTMLElement>(panelSelector);
    if (!panel) return;
    liveRoot.setAttribute("data-open", "true");
    // A closed panel is hidden from AT and taken out of the tab order (see
    // `hidePanelFromAT`), so revealing it has to hand both back.
    panel.removeAttribute("aria-hidden");
    panel.removeAttribute("inert");
    openFloating(panel, {
      ...floating,
      anchor: liveRoot,
      side: (liveRoot.getAttribute("data-side") as FloatingSide | null) ?? defaultSide,
      // `align` is authored on the root, so read it live rather than freezing
      // the controller's default — the panel is positioned in JS.
      align: (liveRoot.getAttribute("data-align") as FloatingAlign | null) ?? floating.align,
    });
  },
  close: (liveRoot) => {
    liveRoot.setAttribute("data-open", "false");
    const panel = liveRoot.querySelector<HTMLElement>(panelSelector);
    hidePanelFromAT(panel);
    closeFloating(panel);
  },
});

/**
 * A panel hidden only by `opacity: 0` still keeps its content in the tab order
 * and in the screen-reader reading order — 20 hover cards on a comment feed
 * make the document unnavigable, and Tab lands on invisible buttons. `inert`
 * removes the interaction, `aria-hidden` removes the narration; the visual side
 * is `visibility: hidden` in the stylesheet.
 */
function hidePanelFromAT(panel: HTMLElement | null | undefined): void {
  if (!panel) return;
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");
}

/**
 * Reveal on keyboard focus as well as on hover.
 *
 * `focus`/`blur` do not bubble and a property handler is bubble-phase only, so
 * the root alone would miss focus landing on a focusable *inside* the trigger
 * (an IconButton, a Link) — exactly the case the old `:focus-within` rule
 * covered. Wiring the rendered trigger too restores it. (`focusin`/`focusout`
 * bubble, but they are not standard IDL attributes — Gecko has no
 * `onfocusin` — and the morph reconciler only syncs the handler properties on
 * its own list, which carries `onfocus`/`onblur`.)
 */
const wireFocusReveal = (
  root: HTMLElement,
  triggerNode: Node,
  reveal: (event: Event) => void,
  hide: (event: Event) => void,
): void => {
  root.onfocus = reveal;
  root.onblur = hide;
  if (!(triggerNode instanceof HTMLElement)) return;
  // Chain rather than clobber: a trigger can bring its own focus handlers
  // (form controls commit on blur), and overwriting them would silently break
  // the wrapped component.
  const priorFocus = triggerNode.onfocus;
  const priorBlur = triggerNode.onblur;
  triggerNode.onfocus = function (event) {
    priorFocus?.call(this, event);
    reveal(event);
  };
  triggerNode.onblur = function (event) {
    priorBlur?.call(this, event);
    hide(event);
  };
};

/**
 * Position a panel that is open on its very first paint (`open: true`, used by
 * demos and by authors pre-opening a panel).
 *
 * Positioning needs live layout and `render` returns a detached tree, so this
 * defers past the current task and only acts once the node is actually
 * connected. On a re-render the morph reconciler keeps the previous live node
 * and discards this one, so the guard makes the call a no-op there — the live
 * panel is already promoted and the floating layer's own scroll/resize
 * listeners keep it in place.
 */
const positionOnMount = (root: HTMLElement, open: (liveRoot: HTMLElement) => void): void => {
  deferToPaint(() => {
    if (!root.isConnected) return;
    if (root.getAttribute("data-open") !== "true") return;
    open(root);
  });
};

const TOOLTIP_PANEL = hoverPanelController(
  ".rui-tooltip", ".rui-tooltip-content", "top",
  // Hints centre on the trigger edge (what `--rui-tooltip-x: -50%` used to do)
  // and must never grow an internal scrollbar — a scrolling tooltip reads as
  // broken, and a hint is short enough that it never needs one.
  { align: "center", layer: "tooltip", maxHeight: "none" },
);

/**
 * Tooltip roots whose trigger is currently under a pointer press.
 *
 * A click both dismisses the hint (`pointerdown`) and immediately focuses the
 * trigger, so without this flag the focus reveal would re-open the tooltip on
 * the very click meant to get rid of it. This is the job the old
 * `:focus-within:not(:active)` selector and the `mousedown` → blur hack shared
 * between them.
 */
const TOOLTIP_PRESSED: WeakSet<HTMLElement> = new WeakSet();

/**
 * Arm a delayed reveal/hide.
 *
 * The handle is captured by the disposer rather than read back out of the slot:
 * `registerDisposer` runs the PREVIOUS cleanup for the same key immediately, so
 * a cleanup that read `slot.get()` would cancel the timer that just replaced it.
 */
const armDelay = (
  slot: { get: () => ReturnType<typeof setTimeout> | null; set: (v: ReturnType<typeof setTimeout> | null) => void },
  helpers: { registerDisposer: (cleanup: () => void, key?: string) => void },
  key: string,
  ms: number,
  run: () => void,
): void => {
  const pending = slot.get();
  if (pending !== null) clearTimeout(pending);
  const handle = setTimeout(() => {
    slot.set(null);
    run();
  }, ms);
  slot.set(handle);
  helpers.registerDisposer(() => clearTimeout(handle), key);
};

export const Tooltip: ComponentSpec = {
  name: "Tooltip",
  description:
    "Wraps a trigger node and shows `label` when the user hovers or focuses " +
    "it — text, or a node when the hint needs a `Kbd` chip. The tooltip hides " +
    "on click/touch (so it does not stay stuck on touch devices) and on " +
    "Escape, and `side` + `align` place it on any of the 12 edge positions — " +
    "it is never clipped by a scrolling or `overflow: hidden` container. Pass " +
    "`delay` (ms) so sweeping across a toolbar does not pop every hint, or " +
    "`open: true` to force one open for a product tour. `onOpenChange(open)` " +
    "fires on every transition, so a tour step can advance when the hint is " +
    "dismissed. Use for short hints (≤6 words); reach for HoverCard when you " +
    "need rich content.",
  props: [
    { name: "label", type: "string | Node", description: "Hint text, or a node when the hint needs a Kbd chip or emphasis" },
    { name: "trigger", type: "Node", aliases: ["children"] },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom", "left", "right"], aliases: ["placement"] },
    { name: "delay", type: "number", optional: true, aliases: ["delayDuration", "enterDelay"], description: "Milliseconds to wait before showing on hover/focus (default 0)" },
    { name: "open", type: "boolean", optional: true, description: "Force the hint open (coach-marks, screenshots)" },
    // Appended after `open` rather than filed next to `side`: positional calls
    // bind slots in declaration order, so inserting mid-list would silently
    // rebind `Tooltip("hint", trigger, "bottom", 300)`'s fourth argument.
    { name: "align", type: "string", optional: true, enum: POPOVER_ALIGNS, description: "Alignment along the trigger edge (default \"center\") — `end` keeps a hint on a right-edge button inside the viewport" },
    { name: "onOpenChange", type: "callable", optional: true, description: "Called with the new boolean whenever the hint is revealed or hidden (hover, focus, Escape, tap)" },
  ],
  render: (_node, props, helpers) => {
    const side = asString(props.side, "top");
    const align = asString(props.align, "center");
    const delay = Math.max(0, asNumber(props.delay, 0));
    const forcedOpen = asBoolean(props.open);
    // `:hover` was inherently live, so the old CSS reveal survived re-renders
    // for free. Now that JS owns visibility the open state has to be persisted
    // the same way DropdownMenu persists its own, or an unrelated state change
    // (a ticking clock, a keystroke elsewhere) would blink the hint away
    // mid-hover.
    const openSlot = helpers.useInstanceState<boolean>("open", forcedOpen);
    const isOpen = forcedOpen || openSlot.get();
    // Single writer for the open state, so every transition is reported exactly
    // once. Gating on the slot matters: `hide` runs from both `pointerleave` and
    // `blur`, so an unguarded call would fire the author's callback twice for one
    // interaction — and a forced hint (whose slot starts `true`) never
    // re-announces an open it was born in.
    const setOpen = (next: boolean): void => {
      if (openSlot.get() === next) return;
      openSlot.set(next);
      helpers.invoke(props.onOpenChange, next);
    };
    const delaySlot = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("delay-timer", null);
    const idSlot = helpers.useInstanceState<string>("content-id", "");
    const contentId = panelId(idSlot, "rui-tooltip");
    const triggerNode = helpers.renderNode(props.trigger);
    const root = el("span", {
      class: "rui-tooltip",
      "data-side": side,
      // Read live off the root by the floating controller, so this is what gives
      // the hint the 12 placements the reference libraries expose.
      "data-align": align,
      // Visibility is now driven by this attribute rather than by `:hover` /
      // `:focus-within`, because a panel promoted into the top layer has to be
      // positioned from JS and the two must agree on when it is showing.
      "data-open": isOpen ? "true" : "false",
      // Only when the trigger cannot take focus itself: an IconButton inside a
      // wrapper with its own tabindex costs the keyboard user two Tab presses,
      // and static text gains a tab stop that leads nowhere.
      tabindex: triggerIsFocusable(triggerNode) ? null : "0",
    });
    root.append(el("span", { class: "rui-tooltip-trigger" }, [triggerNode]));
    const content = el("span", {
      class: "rui-tooltip-content",
      role: "tooltip",
      // Referenced by the trigger's `aria-describedby` — a `role="tooltip"` that
      // nothing points at is never announced, leaving icon-only buttons bare.
      id: contentId,
      // Mirrored onto the panel so the arrow can be placed for the alignment
      // actually in force: the panel is promoted into the top layer, where a
      // `.rui-tooltip[data-align] .rui-tooltip-content` descendant rule still
      // matches, but the reparenting fallback's does not.
      "data-align": align,
      "aria-hidden": isOpen ? null : "true",
      inert: isOpen ? null : "",
    }, [
      // A hint that needs a Kbd chip or two emphasised lines could not have one
      // while the label was stringified. Strings keep the text-node fast path.
      isComponentNode(props.label) ? helpers.renderNode(props.label) : asString(props.label),
    ]);
    describeTrigger(triggerNode, contentId);
    content.append(el("span", { class: "rui-tooltip-arrow", "aria-hidden": "true" }));
    root.append(content);

    // Property handlers (never `addEventListener`) so the morph reconciler can
    // copy the fresh closure onto kept DOM instead of leaking a listener onto
    // every discarded render snapshot.
    const show = (live: HTMLElement): void => {
      setOpen(true);
      TOOLTIP_PANEL.open(live);
    };
    const reveal = (event: Event): void => {
      const live = TOOLTIP_PANEL.resolve(event);
      if (!live) return;
      if (delay > 0) {
        // The live node is resolved before the wait; re-check it is still
        // mounted when the timer fires so a hint never opens against a
        // node the reconciler has since dropped.
        armDelay(delaySlot, helpers, "tooltip-delay", delay, () => {
          if (live.isConnected) show(live);
        });
        return;
      }
      show(live);
    };
    const hide = (event: Event): void => {
      const live = TOOLTIP_PANEL.resolve(event);
      if (!live) return;
      const pending = delaySlot.get();
      if (pending !== null) { clearTimeout(pending); delaySlot.set(null); }
      // A forced hint stays put — `open: true` is documented as overriding hover.
      if (forcedOpen) return;
      TOOLTIP_PRESSED.delete(live);
      setOpen(false);
      TOOLTIP_PANEL.close(live);
    };
    root.onpointerenter = (event) => {
      // Touch delivers a synthetic enter immediately followed by `pointerdown`
      // (which dismisses), so opening for touch would only ever flash the hint
      // — and leaving it open is the "stuck on a phone" bug this component has
      // always tried to avoid.
      if (event.pointerType === "touch") return;
      reveal(event);
    };
    root.onpointerleave = hide;
    root.onpointerdown = (event) => {
      const live = TOOLTIP_PANEL.resolve(event);
      if (!live) return;
      TOOLTIP_PRESSED.add(live);
      if (forcedOpen) return;
      const pending = delaySlot.get();
      if (pending !== null) { clearTimeout(pending); delaySlot.set(null); }
      setOpen(false);
      TOOLTIP_PANEL.close(live);
    };
    root.onpointerup = (event) => {
      const live = TOOLTIP_PANEL.resolve(event);
      if (live) TOOLTIP_PRESSED.delete(live);
    };
    // WCAG 1.4.13: content revealed on hover/focus must be dismissible without
    // moving the pointer or the focus. A hint covering the next row of a table
    // was otherwise stuck until the user tabbed away. Keydown bubbles, so this
    // fires whether focus is on the wrapper or on a focusable inside the
    // trigger. The event is deliberately left to propagate: a Modal further up
    // still owns Escape, and by then the hint is already gone.
    root.onkeydown = (event) => {
      if ((event as KeyboardEvent).key !== "Escape") return;
      // `open: true` means the author is driving, the same reason `hide` leaves a
      // forced hint alone — and 1.4.13 covers hover/focus content, not a
      // deliberately pinned coach-mark.
      if (forcedOpen) return;
      const live = TOOLTIP_PANEL.resolve(event);
      // Gate on the LIVE root: nothing to dismiss when it is already closed.
      if (!live || live.getAttribute("data-open") !== "true") return;
      const pending = delaySlot.get();
      if (pending !== null) { clearTimeout(pending); delaySlot.set(null); }
      setOpen(false);
      TOOLTIP_PANEL.close(live);
    };
    wireFocusReveal(root, triggerNode, (event) => {
      const live = TOOLTIP_PANEL.resolve(event);
      if (!live) return;
      // Consume the press flag: this is the focus the click itself caused, not
      // a keyboard tab-in, so swallow it once and let the next focus through.
      if (TOOLTIP_PRESSED.delete(live)) return;
      reveal(event);
    }, hide);
    // Covers the render that mounts an already-open hint: a re-render that
    // *replaces* the root (rather than morphing it) has to re-promote the panel,
    // because the floating layer's registration belonged to the discarded node.
    if (isOpen) positionOnMount(root, TOOLTIP_PANEL.open);
    return root;
  },
};

const HOVER_CARD_PANEL = hoverPanelController(
  ".rui-hover-card", ".rui-hover-card-content", "bottom",
  // A rich card can be tall, so the floating layer's default height cap (fit
  // the chosen side, scroll internally) is the behaviour we want here.
  { align: "start", layer: "popover" },
);

export const HoverCard: ComponentSpec = {
  name: "HoverCard",
  description:
    "Wraps a trigger node and reveals a card with rich content on hover/focus " +
    "(tap toggles it on touch devices, Escape closes it). Use for previewing a " +
    "referenced item (profile, link target, definition). `openDelay` / " +
    "`closeDelay` keep a paragraph full of mentions from flashing cards and " +
    "give the user time to move onto the card; `width` and `align` size and " +
    "place it. `onOpenChange(open)` fires on every transition, so the preview " +
    "can be fetched on open and cancelled on close. Give it a `label` when the " +
    "card is interactive so the popup has an accessible name.",
  props: [
    { name: "trigger", type: "Node" },
    { name: "content", type: "Node[]", aliases: ["children"] },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom", "left", "right"], aliases: ["placement"] },
    { name: "open", type: "boolean", optional: true, description: "Force the card open (otherwise reveal on hover/focus)" },
    { name: "align", type: "string", optional: true, enum: POPOVER_ALIGNS, description: "Alignment along the trigger edge (default \"start\")" },
    { name: "width", type: "string", optional: true, description: "CSS width for the card (default 240–320px)" },
    { name: "openDelay", type: "number", optional: true, description: "Milliseconds to wait before revealing (default 0; 700 is a good hover-card value)" },
    { name: "closeDelay", type: "number", optional: true, description: "Milliseconds to keep the card after the pointer leaves, so the user can move onto it" },
    { name: "label", type: "string", optional: true, aliases: ["ariaLabel"], description: "Accessible name for the card" },
    { name: "onOpenChange", type: "callable", optional: true, description: "Called with the new boolean whenever the card is revealed or hidden (hover, focus, tap, Escape) — use it to lazy-load the preview" },
  ],
  render: (_node, props, helpers) => {
    const forcedOpen = asBoolean(props.open);
    // As with Tooltip: JS owns visibility now, so the hover state is persisted
    // per instance and survives a re-render triggered by unrelated state.
    const openSlot = helpers.useInstanceState<boolean>("open", forcedOpen);
    const isOpen = forcedOpen || openSlot.get();
    // As in Tooltip: the slot is the single writer, so a callback that starts a
    // fetch on open runs once per transition and not again on the `blur` that
    // follows the `pointerleave` which already closed the card.
    const setOpen = (next: boolean): void => {
      if (openSlot.get() === next) return;
      openSlot.set(next);
      helpers.invoke(props.onOpenChange, next);
    };
    const openDelay = Math.max(0, asNumber(props.openDelay, 0));
    const closeDelay = Math.max(0, asNumber(props.closeDelay, 0));
    const timerSlot = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("hover-timer", null);
    const width = sanitiseCssLength(props.width, "");
    const label = asString(props.label);
    const triggerNode = helpers.renderNode(props.trigger);
    const root = el("span", {
      class: "rui-hover-card",
      "data-side": asString(props.side, "bottom"),
      "data-align": asString(props.align, "start"),
      // Always written (rather than omitted while closed) so the JS reveal and
      // the morph reconciler both see a stable attribute to flip.
      "data-open": isOpen ? "true" : "false",
      tabindex: triggerIsFocusable(triggerNode) ? null : "0",
    });
    root.append(el("span", { class: "rui-hover-card-trigger" }, [triggerNode]));
    const card = el("span", {
      class: "rui-hover-card-content",
      // A dialog role with no accessible name announces as an anonymous dialog,
      // so only claim it when the author named the card.
      role: label ? "dialog" : null,
      "aria-label": label || null,
      // `max-width` in the sheet always beats `width`, inline or not — override
      // it here or a wider link-preview card is silently clamped to 320px.
      style: width ? `width: ${width}; max-width: none;` : null,
      // A card hidden by opacity alone left its buttons in the tab order and its
      // text in the reading order of the surrounding prose.
      "aria-hidden": isOpen ? null : "true",
      inert: isOpen ? null : "",
    });
    for (const child of asArray(props.content)) card.append(helpers.renderNode(child));
    root.append(card);

    const show = (live: HTMLElement): void => {
      setOpen(true);
      HOVER_CARD_PANEL.open(live);
    };
    const dismiss = (live: HTMLElement): void => {
      setOpen(false);
      HOVER_CARD_PANEL.close(live);
    };
    const clearPending = (): void => {
      const pending = timerSlot.get();
      if (pending !== null) { clearTimeout(pending); timerSlot.set(null); }
    };
    const reveal = (event: Event): void => {
      const live = HOVER_CARD_PANEL.resolve(event);
      if (!live) return;
      clearPending();
      if (openDelay > 0) {
        armDelay(timerSlot, helpers, "hover-card-delay", openDelay, () => {
          if (live.isConnected) show(live);
        });
        return;
      }
      show(live);
    };
    const hide = (event: Event): void => {
      // `open: true` is documented as *forcing* the card open, and the old
      // `[data-open="true"]` rule honoured that regardless of hover — so a
      // forced card must not close when the pointer leaves.
      if (forcedOpen) return;
      const live = HOVER_CARD_PANEL.resolve(event);
      if (!live) return;
      clearPending();
      if (closeDelay > 0) {
        armDelay(timerSlot, helpers, "hover-card-delay", closeDelay, () => {
          if (live.isConnected) dismiss(live);
        });
        return;
      }
      dismiss(live);
    };
    // No press handling for a mouse (unlike Tooltip): a HoverCard holds rich
    // content the user is meant to click into, so a press must leave it open.
    root.onpointerenter = (event) => {
      // Touch has no hover: the synthetic one sticks until the user taps
      // elsewhere, so a tap is an explicit toggle instead.
      if (event.pointerType === "touch") return;
      reveal(event);
    };
    root.onpointerleave = (event) => {
      if (event.pointerType === "touch") return;
      hide(event);
    };
    root.onpointerdown = (event) => {
      if (event.pointerType !== "touch") return;
      const live = HOVER_CARD_PANEL.resolve(event);
      if (!live) return;
      clearPending();
      if (live.getAttribute("data-open") === "true") dismiss(live);
      else show(live);
    };
    root.onkeydown = (event) => {
      if ((event as KeyboardEvent).key !== "Escape") return;
      const live = HOVER_CARD_PANEL.resolve(event);
      if (!live || live.getAttribute("data-open") !== "true") return;
      clearPending();
      dismiss(live);
    };
    wireFocusReveal(root, triggerNode, reveal, hide);
    if (isOpen) positionOnMount(root, HOVER_CARD_PANEL.open);
    return root;
  },
};

const RATING_ICONS: Record<string, { full: string; half: string; empty: string }> = {
  star: { full: "star", half: "star-half-stroke", empty: "regular:star" },
  heart: { full: "heart", half: "heart", empty: "regular:heart" },
  thumb: { full: "thumbs-up", half: "thumbs-up", empty: "regular:thumbs-up" },
  fire: { full: "fire", half: "fire", empty: "regular:fire" },
  bolt: { full: "bolt", half: "bolt", empty: "regular:bolt" },
};

export const Rating: ComponentSpec = {
  name: "Rating",
  description:
    "Compact 0–5 star rating with optional numeric badge and review " +
    "count. Use in product cards, testimonials, reviews, and KPI rows. " +
    "Pass `interactive: true` (or an `onChange` handler) to let users pick " +
    "a rating; bind `value: $rating` for two-way binding, or read the new " +
    "value from `onChange: (v) => …`. With `halfStep: true` clicking the " +
    "left half of a star sets a fractional value; keyboard users get whole " +
    "steps with Enter/Space and half steps with the arrow keys. " +
    "`allowClear: true` lets clicking the current rating remove it. `icon` " +
    "swaps the glyph family — `star` (default), `heart`, `thumb`, `fire`, " +
    "`bolt`, or any custom Font Awesome name — and `tone` recolours it " +
    "(amber by default).",
  props: [
    { name: "value", type: "number", description: "0–max; can be a $variable when interactive" },
    { name: "max", type: "number", optional: true, description: "Maximum number of stars (default 5)" },
    { name: "label", type: "string", optional: true, description: "Inline text shown after the stars (e.g. \"4.2 of 5\"); also names the group when interactive" },
    { name: "count", type: "number", optional: true, description: "Review/voter count rendered in parentheses (0 renders \"(0)\")" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "interactive", type: "boolean", optional: true, description: "Allow clicking a star to set the value" },
    { name: "readonly", type: "boolean", optional: true, description: "Force read-only (overrides `interactive`)" },
    { name: "halfStep", type: "boolean", optional: true, description: "Allow half-star resolution when interactive" },
    { name: "icon", type: "string", optional: true, description: "Icon family — `star` (default), `heart`, `thumb`, `fire`, `bolt`, or any FA name" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new rating when the user picks a star (interactive mode)" },
    { name: "allowClear", type: "boolean", optional: true, description: "Clicking the current rating again clears it to 0 (\"remove my rating\")" },
    { name: "tone", type: "string", optional: true, aliases: ["variant", "color"], enum: ["primary", "success", "warning", "danger", "info"], description: "Colour of the filled icons (default warning/amber)" },
  ],
  render: (node, props, helpers) => {
    const max = Math.max(1, Math.floor(asNumber(props.max, 5)));
    const size = asString(props.size, "md");
    const halfStep = asBoolean(props.halfStep);
    const allowClear = asBoolean(props.allowClear);
    const tone = asString(props.tone);
    const stateName = node.argMeta?.[0]?.stateRef as string | undefined;
    // Interactive when the author opts in via `interactive: true` OR supplies
    // an `onChange` handler — `readonly` always forces display mode. A bound
    // `value: $atom` drives two-way binding; when there is no binding we keep a
    // local per-instance value so the stars still visibly select (an
    // uncontrolled input that also fires `onChange`).
    const interactive =
      (asBoolean(props.interactive) || props.onChange != null) && !asBoolean(props.readonly);
    const uncontrolled = interactive && !stateName;
    const localSlot = uncontrolled
      ? helpers.useInstanceState<number>("rating-value", asNumber(props.value, 0))
      : null;
    const current = localSlot ? asNumber(localSlot.get(), 0) : asNumber(props.value, 0);
    const raw = Math.max(0, Math.min(max, current));
    const iconChoice = resolveRatingIcons(asString(props.icon));
    const label = asString(props.label);
    const root = el("div", {
      class: "rui-rating",
      "data-size": size,
      "data-tone": tone || null,
      "data-interactive": interactive ? "true" : "false",
      "data-half-step": interactive && halfStep ? "true" : "false",
    });
    // The role lives on the star strip, NOT on the root. `role="img"` prunes
    // everything below it, so on the root it swallowed the visible `label` and
    // the review `count` (and, when interactive, every star button — a static
    // "3 of 5" image with five unnamed focus stops). Scoped to the strip, the
    // image name summarises the stars and the surrounding text is still read.
    const stars = el("span", {
      class: "rui-rating-stars",
      role: interactive ? "radiogroup" : "img",
      // A `role="img"` IS its own content, so "3.5 of 5" is exactly the right
      // name for the display form. A radiogroup is a control and needs a name
      // that does not change under the user: its value is carried by the radios
      // and by the live status node below.
      "aria-label": interactive ? (label || "Rating") : `${raw} of ${max}`,
    });
    // One tab stop for the group; the arrows then move (and adjust) within it.
    const rovingValue = raw > 0 ? Math.min(max, Math.max(1, Math.ceil(raw))) : 1;
    // The uncontrolled path does not re-render on a write, so successive arrow
    // presses have to read the slot rather than this render's `raw`.
    const readCurrent = (): number => (localSlot
      ? Math.max(0, Math.min(max, asNumber(localSlot.get(), 0)))
      : raw);
    const commit = (origin: HTMLElement, next: number): void => {
      const clamped = Math.max(0, Math.min(max, next));
      if (stateName) helpers.setState(stateName, clamped);
      if (localSlot) localSlot.set(clamped);
      // Reflect the selection immediately in the live DOM. The bound path
      // also re-renders on the next microtask; the uncontrolled path
      // relies solely on this paint (instance-state writes do not by
      // themselves schedule a render).
      paintRating(origin.closest(".rui-rating"), clamped, max, iconChoice);
      helpers.invoke(props.onChange, clamped);
    };
    for (let i = 1; i <= max; i += 1) {
      const fill = Math.max(0, Math.min(1, raw - (i - 1)));
      const iconName =
        fill >= 1 ? iconChoice.full : fill > 0 ? iconChoice.half : iconChoice.empty;
      const iconClasses = resolveIconClasses(iconName).join(" ");
      const star = el(interactive ? "button" : "span", {
        class: `rui-rating-star ${iconClasses}`.trim(),
        type: interactive ? "button" : null,
        "data-fill": fill >= 1 ? "full" : fill > 0 ? "half" : "empty",
        // Families without a dedicated half glyph (heart, fire, custom names)
        // reuse the full one, so a half is indistinguishable from the next
        // whole value unless CSS clips it — this flags which ones need that.
        "data-half-glyph": iconChoice.half === iconChoice.full ? "synthetic" : null,
        role: interactive ? "radio" : null,
        "aria-checked": interactive ? (i === rovingValue && raw > 0 ? "true" : "false") : null,
        tabindex: interactive ? (i === rovingValue ? "0" : "-1") : null,
        "aria-label": interactive ? `Rate ${i}` : null,
        "aria-hidden": interactive ? null : "true",
      });
      if (interactive) {
        const fullValue = i;
        const halfValue = i - 0.5;
        (star as HTMLButtonElement).onclick = (event) => {
          // Resolve the clicked element + container from the live event so the
          // handler still works after the morph reconciler keeps the previous
          // DOM (same approach as Tabs).
          const evt = event as MouseEvent;
          const origin = (evt.currentTarget ?? evt.target) as HTMLElement;
          // A keyboard Enter/Space arrives as a synthetic click with no click
          // count and no pointer coordinates, and `0 - rect.left` is always left
          // of centre — which silently made every keyboard rating half a star
          // low, with no way to reach a whole value without a mouse.
          const fromKeyboard = evt.detail === 0 && evt.clientX === 0 && evt.clientY === 0;
          let next: number = fullValue;
          if (halfStep && !fromKeyboard) {
            const rect = origin.getBoundingClientRect();
            if (rect.width > 0 && evt.clientX - rect.left < rect.width / 2) {
              next = halfValue;
            }
          }
          // "Remove my rating": re-picking the current value clears it.
          if (allowClear && next === readCurrent()) next = 0;
          commit(origin, next);
        };
        (star as HTMLButtonElement).onkeydown = (event) => {
          const evt = event as KeyboardEvent;
          const step = halfStep ? 0.5 : 1;
          const origin = (evt.currentTarget ?? evt.target) as HTMLElement;
          if (evt.key === "ArrowRight" || evt.key === "ArrowUp") {
            evt.preventDefault();
            commit(origin, readCurrent() + step);
          } else if (evt.key === "ArrowLeft" || evt.key === "ArrowDown") {
            evt.preventDefault();
            commit(origin, readCurrent() - step);
          } else if (evt.key === "Home") {
            evt.preventDefault();
            commit(origin, allowClear ? 0 : step);
          } else if (evt.key === "End") {
            evt.preventDefault();
            commit(origin, max);
          }
        };
      }
      stars.append(star);
    }
    root.append(stars);
    // Announcing the new value is not something the radio state can do on its
    // own: `aria-checked` flips on a star the user is not focused on (the arrows
    // change the value without moving focus), and a half step has no radio to
    // check at all. A polite region covers every path — click, arrow key, bound
    // and uncontrolled — and its initial content is not announced, so it stays
    // quiet until the user actually rates something. Kept OUTSIDE the radiogroup
    // so the group owns nothing but radios.
    if (interactive) {
      root.append(el("span", {
        class: "rui-rating-status rui-visually-hidden",
        role: "status",
        "aria-live": "polite",
      }, [`${raw} of ${max}`]));
    }
    if (label) root.append(el("span", { class: "rui-rating-label" }, [label]));
    const count = props.count != null ? asNumber(props.count, 0) : null;
    // `count: 0` is a deliberate "no reviews yet", not an absent count: dropping
    // the chip collapsed the card and shifted the grid around it.
    if (count !== null && count >= 0) {
      root.append(el("span", { class: "rui-rating-count" }, [`(${count.toLocaleString()})`]));
    }
    return root;
  },
};

/**
 * Repaint a live Rating's stars to reflect `value` without a full re-render.
 * Used by the interactive click handler so an uncontrolled (unbound) Rating
 * still visibly selects — instance-state writes alone don't schedule a render.
 */
function paintRating(
  root: Element | null,
  value: number,
  max: number,
  icons: { full: string; half: string; empty: string },
): void {
  if (!root) return;
  const clamped = Math.max(0, Math.min(max, value));
  const interactive = root.getAttribute("data-interactive") === "true";
  const checkedAt = clamped > 0 ? Math.min(max, Math.max(1, Math.ceil(clamped))) : 0;
  const stars = root.querySelectorAll(".rui-rating-star");
  stars.forEach((star, idx) => {
    const fill = Math.max(0, Math.min(1, value - idx));
    const iconName = fill >= 1 ? icons.full : fill > 0 ? icons.half : icons.empty;
    star.setAttribute("data-fill", fill >= 1 ? "full" : fill > 0 ? "half" : "empty");
    (star as HTMLElement).className = `rui-rating-star ${resolveIconClasses(iconName).join(" ")}`.trim();
    if (icons.half === icons.full) star.setAttribute("data-half-glyph", "synthetic");
    if (!interactive) return;
    // Keep the radio state and the single tab stop on the picked value.
    star.setAttribute("aria-checked", idx + 1 === checkedAt ? "true" : "false");
    star.setAttribute("tabindex", idx + 1 === (checkedAt || 1) ? "0" : "-1");
  });
  if (interactive) {
    // The radiogroup's name is stable (see `Rating.render`) — rewriting it would
    // both rename the control mid-interaction and still not be announced, since
    // a name change is not a live update. The value goes through the status node.
    const status = root.querySelector(".rui-rating-status");
    if (status) status.textContent = `${clamped} of ${max}`;
  } else {
    // Display mode: the `role="img"` on the star strip is what carries the value.
    root.querySelector(".rui-rating-stars")?.setAttribute("aria-label", `${clamped} of ${max}`);
  }
}

function resolveRatingIcons(icon: string): { full: string; half: string; empty: string } {
  const key = icon.trim().toLowerCase();
  if (!key) return RATING_ICONS.star!;
  if (RATING_ICONS[key]) return RATING_ICONS[key]!;
  // Custom icon name (e.g. "circle") — fill/half/empty reuse the same glyph
  // and rely on the data-fill attribute for visual differentiation in CSS.
  return { full: key, half: key, empty: `regular:${key}` };
}

export const ProgressRing: ComponentSpec = {
  name: "ProgressRing",
  description:
    "Circular progress indicator. Use for KPIs, quotas, completion rings, " +
    "and any metric better shown as a circle than a bar. Renders the " +
    "value (or a custom `label`) inside the ring; pass `icon` for a glyph " +
    "instead (completion checkmarks). `size` takes `sm|md|lg` or a plain " +
    "number of px (`size: 40`), so the ring fits a table cell or fills a " +
    "hero card.",
  props: [
    { name: "value", type: "number", optional: true, description: "Current value (ignored when indeterminate)" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: "Text shown inside the ring (default \"{percent}%\")" },
    { name: "caption", type: "string", optional: true, aliases: ["description"], description: "Small caption rendered under the ring" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    // The enum stays so a mistyped token is still caught, and it only gates
    // string literals — a numeric `size: 40` passes straight through to the
    // diameter path below.
    { name: "size", type: "string|number", optional: true, enum: ["sm", "md", "lg"], description: "`sm|md|lg`, or a diameter in px as a number (`size: 40`)" },
    { name: "indeterminate", type: "boolean", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon rendered inside the ring instead of the label" },
  ],
  render: (_node, props) => {
    const max = Math.max(1, asNumber(props.max, 100));
    const indeterminate = asBoolean(props.indeterminate);
    const value = Math.max(0, Math.min(max, asNumber(props.value, 0)));
    const percent = Math.round((value / max) * 100);
    const sizeRaw = asString(props.size, "md");
    // A numeric/CSS-px `size` sets the diameter directly: the viewBox and the
    // dash geometry are computed from it, so CSS-scaling the svg instead would
    // distort the stroke.
    const explicitPx = /^\d+(\.\d+)?(px)?$/.test(sizeRaw.trim())
      ? Math.min(480, Math.max(16, parseFloat(sizeRaw)))
      : null;
    // Keep a t-shirt token on the root even for a custom diameter so the inner
    // label's font-size still scales with the ring.
    const size = explicitPx !== null
      ? (explicitPx < 84 ? "sm" : explicitPx < 108 ? "md" : "lg")
      : sizeRaw;
    const px = explicitPx ?? (size === "lg" ? 120 : size === "sm" ? 72 : 96);
    const stroke = explicitPx !== null
      ? Math.max(2, Math.round(px / 12))
      : (size === "lg" ? 10 : size === "sm" ? 6 : 8);
    const r = (px - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = indeterminate ? circumference * 0.65 : circumference * (1 - percent / 100);
    const caption = asString(props.caption);
    const root = el("div", {
      class: "rui-progress-ring",
      "data-tone": asString(props.tone, "primary"),
      "data-size": size,
      "data-indeterminate": indeterminate ? "true" : "false",
      // Same control semantics as the sibling Progress: without these the ring
      // announced as loose text with no min/max and no busy state.
      role: "progressbar",
      "aria-label": caption || (indeterminate ? "Loading" : PROGRESS_FALLBACK_NAME),
      "aria-valuemin": "0",
      "aria-valuemax": indeterminate ? null : String(max),
      "aria-valuenow": indeterminate ? null : String(value),
      "aria-busy": indeterminate ? "true" : null,
    });
    const wrap = el("div", { class: "rui-progress-ring-wrap" });
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", String(px));
    svg.setAttribute("height", String(px));
    svg.setAttribute("viewBox", `0 0 ${px} ${px}`);
    svg.setAttribute("class", "rui-progress-ring-svg");
    const track = document.createElementNS(svgNS, "circle");
    track.setAttribute("class", "rui-progress-ring-track");
    track.setAttribute("cx", String(px / 2));
    track.setAttribute("cy", String(px / 2));
    track.setAttribute("r", String(r));
    track.setAttribute("stroke-width", String(stroke));
    track.setAttribute("fill", "none");
    svg.appendChild(track);
    const bar = document.createElementNS(svgNS, "circle");
    bar.setAttribute("class", "rui-progress-ring-bar");
    bar.setAttribute("cx", String(px / 2));
    bar.setAttribute("cy", String(px / 2));
    bar.setAttribute("r", String(r));
    bar.setAttribute("stroke-width", String(stroke));
    bar.setAttribute("fill", "none");
    bar.setAttribute("stroke-linecap", "round");
    bar.setAttribute("stroke-dasharray", String(circumference));
    bar.setAttribute("stroke-dashoffset", String(offset));
    svg.appendChild(bar);
    wrap.append(svg);
    const rawLabel = asString(props.label, indeterminate ? "…" : `${percent}%`);
    const center = el("span", { class: "rui-progress-ring-value" });
    // `icon` is the explicit opt-in for a glyph inside the ring. The label is
    // still accepted as an icon name, but only when it is unambiguously one:
    // `resolveIconClasses` happily returns `fa-Done` for ANY ascii token, so
    // guessing from arbitrary label text replaced words like "Done", "OK" and
    // "12" with a blank, `aria-hidden` glyph.
    const iconProp = asString(props.icon);
    const iconSource = iconProp || (looksLikeIconName(rawLabel) ? rawLabel : "");
    const labelIcon = iconSource
      ? renderIcon(iconSource, { className: "rui-progress-ring-icon" })
      : null;
    if (labelIcon && resolveIconClasses(iconSource).length > 0) {
      center.append(labelIcon);
      // A ring whose centre is a decorative glyph still has to say the value.
      if (!indeterminate) root.setAttribute("aria-valuetext", `${percent}%`);
    } else {
      center.append(document.createTextNode(rawLabel));
      // Announce the author's own wording instead of the percentage derived from
      // value/max: a ring captioned "3 of 8 seats" otherwise reads as "38%",
      // which is not what the user can see.
      if (!indeterminate && asString(props.label)) root.setAttribute("aria-valuetext", rawLabel);
    }
    wrap.append(center);
    root.append(wrap);
    if (caption) root.append(el("span", { class: "rui-progress-ring-caption" }, [caption]));
    return root;
  },
};

/**
 * Whether a free-text label should be treated as a Font Awesome name.
 *
 * Deliberately narrow: an explicit `variant:` prefix, a kebab-case multi-word
 * name (`circle-check`), or a registered custom icon. A single capitalised or
 * numeric token ("Done", "OK", "12") is text — the icon resolver would
 * otherwise return a nonexistent `fa-Done` and silently swallow the word.
 */
function looksLikeIconName(value: string): boolean {
  const token = value.trim();
  if (!token) return false;
  if (getCustomIcon(token)) return true;
  if (/^(solid|regular|brands):[a-z0-9-]+$/.test(token)) return true;
  return /^[a-z0-9]+(-[a-z0-9]+)+$/.test(token);
}

export const ChatBubble: ComponentSpec = {
  name: "ChatBubble",
  description:
    "Single chat-style message bubble with author, time, and body. Use " +
    "for conversation threads, agent transcripts, support chats, and any " +
    "message-style UI. Set `from=\"me\"` for the active speaker — the bubble " +
    "aligns to the right with a primary tint. `from=\"agent\"` (default) " +
    "renders as the canonical incoming bubble on the left, and " +
    "`from=\"system\"` as an avatar-less transcript annotation. Pass " +
    "`content: [...]` for rich bodies (CodeBlock, Image, Link, Table) and " +
    "`onRetry` alongside `status: \"error\"` so a failed send is recoverable.",
  props: [
    { name: "author", type: "string" },
    { name: "body", type: "string", aliases: ["text", "message"] },
    { name: "time", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "from", type: "string", optional: true, enum: ["agent", "me", "system"], aliases: ["role"], description: "Lane (default agent)" },
    { name: "status", type: "string", optional: true, enum: ["sending", "sent", "delivered", "read", "error"] },
    { name: "content", type: "Node[]", optional: true, aliases: ["children"], description: "Rich body nodes rendered under `body` (CodeBlock, Image, Link, Table, …)" },
    { name: "onRetry", type: "callable", optional: true, description: "Shown as a Retry action next to `status: \"error\"`" },
  ],
  render: (_node, props, helpers) => {
    const from = asString(props.from, "agent");
    const author = asString(props.author);
    const root = el("div", {
      class: "rui-chat-bubble",
      "data-from": from,
    });
    // `system` is a transcript annotation, not a participant — an avatar made it
    // look like a third speaker.
    const showAvatar = from !== "system";
    if (showAvatar && from !== "me") {
      root.append(renderAvatarFallback(asString(props.avatarSrc), author));
    }
    const bubble = el("div", { class: "rui-chat-bubble-bubble" });
    const head = el("header", { class: "rui-chat-bubble-head" });
    head.append(el("span", { class: "rui-chat-bubble-author" }, [author]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-chat-bubble-time" }, [time]));
    bubble.append(head);
    const body = asString(props.body);
    if (body) bubble.append(el("p", { class: "rui-chat-bubble-body" }, [body]));
    // The primary use case (agent transcripts) is code, images and links, none
    // of which survive being stringified into a single <p>.
    const content = asArray(props.content);
    if (content.length > 0) {
      const rich = el("div", { class: "rui-chat-bubble-content" });
      for (const child of content) rich.append(helpers.renderNode(child));
      bubble.append(rich);
    }
    const status = asString(props.status);
    if (status) {
      const footer = el("span", { class: "rui-chat-bubble-status", "data-status": status }, [status]);
      if (status === "error" && props.onRetry != null) {
        const retry = el("button", {
          type: "button",
          class: "rui-chat-bubble-retry",
        }, ["Retry"]);
        retry.onclick = (event) => {
          event.stopPropagation();
          helpers.invoke(props.onRetry);
        };
        footer.append(retry);
      }
      bubble.append(footer);
    }
    root.append(bubble);
    if (showAvatar && from === "me") {
      root.append(renderAvatarFallback(asString(props.avatarSrc), author));
    }
    return root;
  },
};

function renderAvatarFallback(src: string, name: string): HTMLElement {
  const wrap = el("span", { class: "rui-chat-bubble-avatar" });
  const safeSrc = sanitiseImageSrc(src);
  if (safeSrc) {
    wrap.append(el("img", { src: safeSrc, alt: name, loading: "lazy" }));
  } else {
    wrap.append(el("span", { class: "rui-chat-bubble-fallback" }, [initialsFor(name)]));
  }
  return wrap;
}

export const Kbd: ComponentSpec = {
  name: "Kbd",
  description:
    "Renders a keyboard shortcut chip (e.g. `Cmd+K`). Pass a single label, or " +
    "multiple labels as an array to render a `key + key + …` combo.",
  props: [
    { name: "keys", type: "string | string[]" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md"] },
  ],
  render: (_node, props) => {
    const size = asString(props.size, "md");
    const root = el("span", { class: "rui-kbd-group", "data-size": size });
    const keys = Array.isArray(props.keys) ? props.keys : [props.keys];
    keys.forEach((key, i) => {
      const label = asString(key);
      if (!label) return;
      if (i > 0) root.append(el("span", { class: "rui-kbd-sep" }, ["+"]));
      root.append(el("kbd", { class: "rui-kbd" }, [label]));
    });
    return root;
  },
};

export const Popover: ComponentSpec = {
  name: "Popover",
  description:
    "Click-triggered popup with arbitrary rich content. Use when " +
    "HoverCard's hover trigger is too eager and Modal/Sheet is too heavy — " +
    "perfect for filter panels, color pickers, share menus, and small " +
    "settings flyouts. The trigger stays visible while the popover is " +
    "open — clicking it again, clicking outside, pressing Escape, or " +
    "clicking the built-in × button all close it (pass `showClose: false` to " +
    "drop the × and its header row). Focus moves into the panel while it is " +
    "open and returns to the trigger on close. `onOpenChange(open)` fires on " +
    "every transition, so a filter flyout can apply its draft on close.",
  props: [
    { name: "trigger", type: "Node", description: "Clickable trigger element (Button, Avatar, IconButton, …). The trigger remains visible while the popover is open." },
    { name: "content", type: "Node[]", aliases: ["children"], description: "Body rendered inside the popover" },
    { name: "title", type: "string", optional: true, description: "Optional bold heading rendered above the content (also names the dialog)" },
    { name: "side", type: "string", optional: true, enum: POPOVER_SIDES, aliases: ["placement"], description: "Where the popover opens relative to the trigger (default \"bottom\")" },
    { name: "align", type: "string", optional: true, enum: POPOVER_ALIGNS, description: "Alignment along the trigger edge (default \"start\")" },
    { name: "width", type: "string", optional: true, description: "CSS width for the popover panel (default \"280px\")" },
    { name: "open", type: "boolean", optional: true, description: "Initial open state — use to demo or pre-open the popover" },
    { name: "onOpenChange", type: "callable", optional: true, description: "Called with the new boolean whenever the popover opens or closes" },
    { name: "showClose", type: "boolean", optional: true, description: "Render the × button and its header row (default true)" },
    { name: "disabled", type: "boolean", optional: true, description: "Make the trigger inert (e.g. while a request is in flight)" },
  ],
  render: (_node, props, helpers) => {
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState<boolean>("open", initialOpen);
    const isOpen = openSlot.get();
    const width = sanitiseCssLength(props.width, "");
    const disabled = asBoolean(props.disabled);
    const showClose = props.showClose == null || asBoolean(props.showClose);
    const titleText = asString(props.title);
    const idSlot = helpers.useInstanceState<string>("title-id", "");
    const titleId = titleText ? panelId(idSlot, "rui-popover-title") : "";
    const onOpenChange = props.onOpenChange;
    const notify = (next: boolean): void => { helpers.invoke(onOpenChange, next); };
    const root = el("div", {
      class: "rui-popover",
      "data-open": isOpen ? "true" : "false",
      "data-side": asString(props.side, "bottom"),
      "data-align": asString(props.align, "start"),
      "data-disabled": disabled ? "true" : null,
    });

    // Render the user's trigger directly and wrap it in a span so we can
    // attach the toggle handler without nesting <button> inside <button>
    // (which is invalid HTML and silently swallows clicks in some browsers).
    const triggerNode = helpers.renderNode(props.trigger);
    const focusableTrigger = triggerIsFocusable(triggerNode);
    const triggerWrap = el("span", {
      class: "rui-popover-trigger",
      "data-state": isOpen ? "open" : "closed",
      "aria-haspopup": "dialog",
      "aria-expanded": isOpen ? "true" : "false",
      "aria-disabled": disabled ? "true" : null,
      // The prop description sanctions non-button triggers (Avatar, Text), and
      // the wrapper carried the keyboard handler while nothing could focus it —
      // so those popovers were mouse-only. Only add the role/tab stop when the
      // wrapped trigger does not bring its own.
      role: focusableTrigger ? null : "button",
      tabindex: focusableTrigger || disabled ? null : "0",
    });
    triggerWrap.append(triggerNode);
    root.append(triggerWrap);

    const body = el("div", {
      class: "rui-popover-content",
      role: "dialog",
      // A dialog with no name announces as "dialog"; the title is the name when
      // there is one, so link it rather than leaving it decorative.
      "aria-labelledby": titleId || null,
      "aria-label": titleId ? null : "Popover",
      // The sheet's `max-width` always beats `width`, inline or not, so a
      // 480px date-range picker silently rendered at 360px.
      style: width ? `width: ${width}; max-width: none;` : null,
    });
    const closeBtn = el("button", {
      type: "button",
      class: "rui-popover-close",
      "aria-label": "Close popover",
    }, ["×"]);
    closeBtn.onclick = (event) => {
      event.stopPropagation();
      // Resolve the live button from the event rather than using the captured
      // `closeBtn`: the morph reconciler copies this closure onto kept DOM, so
      // the capture is often a discarded snapshot — and closing a detached
      // popover would leave the live panel promoted in the top layer forever.
      setPopoverOpen((event.currentTarget ?? event.target) as Element, false, openSlot);
      notify(false);
    };
    // The header exists to hold the × button and/or the title. A compact colour
    // picker that wants neither should not pay for a 24px row plus a spacer.
    if (showClose || titleText) {
      const header = el("div", { class: "rui-popover-header" });
      header.append(
        titleText
          ? el("div", { class: "rui-popover-title", id: titleId || null }, [titleText])
          : el("span", { class: "rui-popover-title-spacer" }),
      );
      if (showClose) header.append(closeBtn);
      body.append(header);
    }
    for (const child of asArray(props.content)) {
      body.append(helpers.renderNode(child));
    }
    root.append(body);

    // Property-based handlers so the morph reconciler can copy the latest
    // closure (with up-to-date `openSlot`) onto kept DOM. `addEventListener`
    // would leak a fresh listener onto every detached re-render snapshot.
    const toggle = (origin: Element): void => {
      const next = !openSlot.get();
      const liveRoot = setPopoverOpen(origin, next, openSlot);
      if (next && liveRoot) installPopoverDismiss(liveRoot, openSlot, notify);
      notify(next);
    };
    if (!disabled) {
      triggerWrap.onclick = (event) => {
        event.stopPropagation();
        toggle((event.currentTarget ?? event.target) as Element);
      };
      triggerWrap.onkeydown = (event) => {
        const e = event as KeyboardEvent;
        const origin = (e.currentTarget ?? e.target) as Element;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(origin);
        } else if (e.key === "Escape" && openSlot.get()) {
          e.preventDefault();
          setPopoverOpen(origin, false, openSlot);
          notify(false);
        }
      };
    }
    // Escape from anywhere inside the panel, plus a Tab cycle within it, so the
    // keyboard user is not walked out of an open dialog by the next Tab press.
    const dialogKeys = dialogKeydownHandler(".rui-popover-content", (origin) => {
      setPopoverOpen(origin, false, openSlot);
      notify(false);
    });
    root.onkeydown = (event) => {
      // Gate on the LIVE root's state: while closed, the trap would pull
      // Shift+Tab from the trigger into the hidden panel.
      const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
      if (origin?.getAttribute("data-open") !== "true") return;
      dialogKeys(event as KeyboardEvent);
    };
    // Moves focus into the panel on open and restores it to the trigger on
    // close, watching the LIVE node's data-open (discarded snapshots opt out).
    wireDialogFocus(root, ".rui-popover-content", helpers);

    if (isOpen) {
      positionOnMount(root, (liveRoot) => {
        syncFloatingPanel(liveRoot, true, ".rui-popover-content", ".rui-popover-trigger",
          { layer: "popover" });
        // `open: true` never installed these, so the documented outside-click /
        // Escape dismissal did nothing for a pre-opened popover.
        installPopoverDismiss(liveRoot, openSlot, notify);
      });
    }
    return root;
  },
};

/**
 * Toggle a Popover's open state and reflect it in the live DOM so the
 * change feels instant. Returns the live root so callers can install the
 * outside-click / Escape dismiss handlers on `open`.
 */
const setPopoverOpen = (
  origin: Element,
  next: boolean,
  openSlot: { set: (value: boolean) => void },
): HTMLElement | null => {
  openSlot.set(next);
  const liveRoot = origin.closest(".rui-popover") as HTMLElement | null;
  if (!liveRoot) return null;
  liveRoot.setAttribute("data-open", next ? "true" : "false");
  const trigger = liveRoot.querySelector(".rui-popover-trigger");
  trigger?.setAttribute("aria-expanded", next ? "true" : "false");
  trigger?.setAttribute("data-state", next ? "open" : "closed");
  // Promote the panel out of its clipping ancestry (or hand it back). Without
  // this a filter panel opened from a table cell, a modal body, an accordion
  // item or an InputGroup is amputated by the first ancestor with non-visible
  // overflow — and for `side: "top"` the overflow is unreachable, so no
  // scrollbar can ever reveal it.
  syncFloatingPanel(
    liveRoot,
    next,
    ".rui-popover-content",
    ".rui-popover-trigger",
    { layer: "popover" },
  );
  if (!next) disposeDismissListeners(liveRoot);
  return liveRoot;
};

const installPopoverDismiss = (
  liveRoot: HTMLElement,
  openSlot: { set: (value: boolean) => void },
  notify?: (open: boolean) => void,
): void => {
  installDismissListeners({
    liveRoot,
    onDismiss: () => {
      openSlot.set(false);
      liveRoot.setAttribute("data-open", "false");
      const trigger = liveRoot.querySelector(".rui-popover-trigger");
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.setAttribute("data-state", "closed");
      // Outside-click / Escape is a close path too — un-promote, or the panel
      // stays in the top layer as an orphan that nothing can dismiss.
      closeFloating(liveRoot.querySelector<HTMLElement>(".rui-popover-content"));
      notify?.(false);
    },
  });
};

const TOAST_TONES = ["default", "primary", "success", "warning", "danger", "info"] as const;

const TOASTS_POSITIONS = [
  "top-right", "top-left", "top-center",
  "bottom-right", "bottom-left", "bottom-center",
] as const;

/**
 * Promote a corner-pinned Toast into the browser top layer.
 *
 * `position` promises a viewport corner, but `position: fixed` resolves against
 * the nearest transformed or filtered ancestor, and the library manufactures
 * those itself (the universal `animate`/`sx` channel, the glass theme's backdrop
 * filters). A toast fired from a form inside one lands in the middle of that
 * ancestor's box instead of the corner, and stacks inside its context rather
 * than above the page. The top layer is the only escape that does not reparent
 * the node — reparenting would take it out from under the morph reconciler.
 *
 * This cannot go through `openFloating`: that layer measures a panel against an
 * anchor element, and a corner-pinned toast has none. So this is a bare
 * promotion with no positioning of its own; the corners stay in the stylesheet.
 *
 * Which is why it is gated on `--rui-toast-top-layer`, the flag the stylesheet
 * sets alongside the declarations that neutralise the UA `[popover]` rule
 * (`inset: 0; margin: auto`, which would otherwise centre the toast). Consumers
 * pin a library version and its stylesheet independently; without the gate, a
 * new runtime against an old sheet would move every standalone toast to the
 * middle of the screen. No flag, no promotion, and behaviour is unchanged.
 */
const promoteToast = (live: HTMLElement): boolean => {
  // Already in the top layer. Probed rather than read off the attribute: an
  // instance slot outliving its toast can hand the attribute to a node that was
  // never shown, and that node still needs promoting.
  if (isShowingPopover(live)) return true;
  const ready = typeof (live as { showPopover?: unknown }).showPopover === "function"
    && getComputedStyle(live).getPropertyValue("--rui-toast-top-layer").trim() === "1";
  if (ready) {
    try {
      live.setAttribute("popover", "manual");
      (live as unknown as { showPopover: () => void }).showPopover();
      return true;
    } catch { /* detached, or a popover state the browser refuses */ }
  }
  // Never leave the attribute on a toast that is not actually in the top layer:
  // the UA `[popover]` rule would then centre it in the viewport. Removing it
  // restores exactly today's rendering — `.rui-toast`'s `display: flex` already
  // beats the UA `[popover]:not(:popover-open) { display: none }`.
  live.removeAttribute("popover");
  return false;
};

/** `:popover-open` is not universally supported as a selector — probing it can throw. */
function isShowingPopover(live: HTMLElement): boolean {
  try { return live.matches(":popover-open"); } catch { return false; }
}

export const Toast: ComponentSpec = {
  name: "Toast",
  description:
    "Single transient notification card. Always shows a close (×) button " +
    "that removes the toast from the DOM (and fires `onClose` if set). " +
    "Pass `duration` (ms) to auto-dismiss — with `pauseOnHover: true` the " +
    "countdown stops while the pointer is over the card — or `position` for a " +
    "standalone one-off toast (the renderer will pin it to the viewport corner " +
    "so you do not have to wrap a single notification in `Stack(...)`). " +
    "Use `Toasts` for grouped stacks; prefer `Banner` for top-of-page " +
    "announcements and `Notification` for permanent inbox entries.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true, aliases: ["description"] },
    { name: "tone", type: "string", optional: true, aliases: ["variant"], enum: TOAST_TONES, description: "Visual accent (default \"default\")" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name (default picked from tone)" },
    { name: "duration", type: "number", optional: true, description: "Auto-dismiss after N milliseconds (e.g. 4000). Omit to keep the toast until the user closes it." },
    { name: "action", type: "Button", optional: true, description: "Optional inline `Button` action shown above the message" },
    { name: "onClose", type: "callable", optional: true, description: "Callable invoked when the toast is dismissed (× button, auto-dismiss, or programmatic)" },
    { name: "position", type: "string", optional: true, enum: TOASTS_POSITIONS, description: "Pin a standalone Toast to a viewport corner without wrapping it in `Stack(...)`" },
    { name: "pauseOnHover", type: "boolean", optional: true, description: "Pause the auto-dismiss countdown while the pointer is over the toast" },
  ],
  render: (node, props, helpers) => {
    const tone = asString(props.tone, "default");
    const position = asString(props.position);
    const title = asString(props.title);
    const message = asString(props.message);
    // Per-instance state is keyed by SIBLING INDEX, so when a stack shrinks the
    // next toast inherits the slot of the one that was closed. Everything below
    // is therefore keyed by *content identity* rather than by a bare flag: the
    // toast that shifts into the slot has a different identity and renders
    // normally instead of coming up pre-dismissed and invisible.
    const identity = `${title}\u0000${message}\u0000${tone}`;
    const root = el("div", {
      class: position ? "rui-toast rui-toast-standalone" : "rui-toast",
      // Danger toasts are interruptive — `alert` + `assertive` so screen
      // readers announce them immediately; others are polite `status`.
      role: tone === "danger" ? "alert" : "status",
      "aria-live": tone === "danger" ? "assertive" : "polite",
      "data-tone": tone,
      "data-position": position || null,
      // Reconciliation of unkeyed siblings is positional, so dismissing the top
      // toast shifted every survivor onto its neighbour's DOM node — replaying
      // the entry animation and dropping focus mid-interaction. A content-derived
      // key lets `keyFor` match them across the shift. An author `key:` (and the
      // runtime's own `$toast` id key) always wins.
      "data-rui-key": node.explicitKey == null ? toastAutoKey(identity) : null,
    });
    const iconName = asString(props.icon) || defaultToastIcon(tone);
    const iconNode = renderIcon(iconName, { className: "rui-toast-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-toast-body" });
    body.append(el("div", { class: "rui-toast-title" }, [title]));
    if (message) body.append(el("div", { class: "rui-toast-message" }, [message]));
    if (props.action) {
      const actionWrap = el("div", { class: "rui-toast-action" });
      actionWrap.append(helpers.renderNode(props.action));
      body.append(actionWrap);
    }
    root.append(body);

    // Track dismiss locally so re-renders don't restart the timer or undo
    // the manual close.
    const dismissedSlot = helpers.useInstanceState<string | null>("dismissed-id", null);
    const isDismissed = (): boolean => dismissedSlot.get() === identity;
    const timerSlot = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("timer", null);
    const removalTimerSlot = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("removal-timer", null);
    const deadlineSlot = helpers.useInstanceState<number>("deadline", 0);
    const remainingSlot = helpers.useInstanceState<number>("remaining", 0);
    const liveNodeSlot = helpers.useInstanceState<HTMLElement | null>("live-node", null);
    // Remember the node that actually mounted. On a re-render morph keeps that
    // node and discards this render's `root`, so a timer that trusted
    // `root.isConnected` silently stopped dismissing anything.
    if (liveNodeSlot.get()?.isConnected !== true) {
      deferToPaint(() => { if (root.isConnected) liveNodeSlot.set(root); });
    }

    // A standalone toast escapes its ancestors' containing block through the top
    // layer — see `promoteToast` for why that is the only way out.
    const promotedSlot = helpers.useInstanceState<boolean>("promoted", false);
    if (position) {
      // Re-emit `popover` once the live toast holds it. Morph strips any
      // attribute the fresh render does not carry, and it only exempts panels
      // the floating layer tagged with `data-floating-side` — so without this the
      // first re-render would drop the toast straight back out of the top layer.
      // Identical value, so morph makes no DOM call and the showing state stands.
      if (promotedSlot.get()) root.setAttribute("popover", "manual");
      deferToPaint(() => {
        // Only the tree morph committed is connected. On a re-render this `root`
        // is a discarded snapshot and the live toast is already promoted, so
        // promoting here would show a detached node (and throw).
        if (!root.isConnected) return;
        promotedSlot.set(promoteToast(root));
      });
    }

    // Resolves whichever .rui-toast element is currently in the DOM,
    // preferring the event's own origin over any closure capture.
    const liveToast = (origin?: Element): HTMLElement | null => {
      if (origin) {
        const live = origin.closest(".rui-toast") as HTMLElement | null;
        if (live) return live;
      }
      if (root.isConnected) return root;
      const tracked = liveNodeSlot.get();
      return tracked && tracked.isConnected ? tracked : null;
    };

    const cancelTimer = (): void => {
      const handle = timerSlot.get();
      if (handle !== null) {
        clearTimeout(handle);
        timerSlot.set(null);
      }
    };

    const dismiss = (origin?: Element): void => {
      if (isDismissed()) return;
      dismissedSlot.set(identity);
      // Clear the pending auto-dismiss timer so it doesn't fire `onClose`
      // a second time after the user has already closed the toast.
      cancelTimer();
      const target = liveToast(origin);
      if (target) {
        target.classList.add("is-dismissed");
        // Allow the CSS exit animation to complete before unmounting. The
        // disposer holds its own handle: `registerDisposer` runs the previous
        // cleanup for this key immediately, and one that read the slot back
        // would cancel the timer that had just replaced it.
        const handle = setTimeout(() => {
          removalTimerSlot.set(null);
          target.remove();
        }, 180);
        removalTimerSlot.set(handle);
        helpers.registerDisposer(() => clearTimeout(handle), "exit-animation-timer");
      }
      // `onClose` fires even when no live node could be found: it is usually
      // what removes the toast from the author's list, and skipping it left the
      // notification on screen for good.
      helpers.invoke(props.onClose);
    };

    const duration = asNumber(props.duration, 0);
    const armAutoDismiss = (ms: number): void => {
      if (ms <= 0 || isDismissed()) return;
      const handle = setTimeout(() => {
        timerSlot.set(null);
        dismiss();
      }, ms);
      timerSlot.set(handle);
      deadlineSlot.set(Date.now() + ms);
      // If the toast is unmounted before the timer fires (parent re-rendered
      // without it, page navigated, host cleared), cancel the timer instead
      // of letting it fire a stale `onClose` action.
      helpers.registerDisposer(() => clearTimeout(handle), "auto-dismiss-timer");
    };

    const closeBtn = el("button", {
      type: "button",
      class: "rui-toast-close",
      "aria-label": "Dismiss notification",
    }, ["×"]);
    closeBtn.onclick = (event) => {
      event.stopPropagation();
      dismiss((event.currentTarget ?? event.target) as Element);
    };
    root.append(closeBtn);

    if (asBoolean(props.pauseOnHover) && duration > 0) {
      // A 4000ms toast with two lines and an action button is unreadable and
      // unclickable for a slow reader without this.
      root.onpointerenter = () => {
        const deadline = deadlineSlot.get();
        if (timerSlot.get() === null) return;
        remainingSlot.set(Math.max(0, deadline - Date.now()));
        cancelTimer();
      };
      root.onpointerleave = () => {
        if (isDismissed() || timerSlot.get() !== null) return;
        armAutoDismiss(remainingSlot.get() || duration);
      };
    }

    if (duration > 0 && timerSlot.get() === null && !isDismissed()) {
      armAutoDismiss(duration);
    }

    if (isDismissed()) {
      // This exact toast was dismissed in a previous render cycle — return an
      // empty placeholder so the reconciler doesn't resurrect it.
      const placeholder = el("div", { class: "rui-toast-placeholder", hidden: "" });
      return placeholder;
    }
    return root;
  },
};

/**
 * Short, stable reconciliation key derived from a toast's content. Only used
 * when the author (or the `$toast` runtime layer) supplied no `key:`.
 */
function toastAutoKey(identity: string): string {
  let h = 0;
  for (let i = 0; i < identity.length; i += 1) h = (h * 31 + identity.charCodeAt(i)) >>> 0;
  return `toast-${h.toString(36)}`;
}

export const Toasts: ComponentSpec = {
  name: "Toasts",
  description:
    "Stacked container for transient `Toast` notifications, pinned to a " +
    "viewport corner. Usually unnecessary: `$toast.success(...)` (and " +
    "`.show/.error/.info/.warning`) auto-render their own stack. Reach for " +
    "`Toasts` only for custom placement — render the reactive `$toast.items` " +
    "list into it and the auto-layer steps aside: " +
    "`Toasts($toast.items.map(t => Toast({ title: t.message, tone: t.tone, " +
    "onClose: () => $toast.dismiss(t.id) })))` — add `key: t.id` there when the " +
    "list can reorder. `max` caps how many are shown at once (the rest are " +
    "summarised as `+N more`). Use a standalone `Toast` with `position` for a " +
    "single one-off notice.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "Toast components to stack" },
    { name: "position", type: "string", optional: true, enum: TOASTS_POSITIONS, description: "Viewport corner the stack pins to (default \"top-right\")" },
    { name: "max", type: "number", optional: true, aliases: ["limit"], description: "Maximum toasts shown at once; the overflow is summarised as `+N more`" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-toasts",
      "data-position": asString(props.position, "top-right"),
      // The stack itself is chrome, not content — individual toasts carry
      // their own `status`/`alert` roles for screen readers.
      "aria-live": "off",
    });
    const children = asArray(props.children);
    // The stack has no max-height and no scrollbar, so a burst of 15 failures
    // ran off both ends of the viewport with the oldest toasts unreachable.
    const max = props.max != null ? Math.max(1, Math.floor(asNumber(props.max, 0))) : null;
    // Keep the most recent ones — the newest notification is the one the user
    // is waiting for.
    const shown = max !== null && children.length > max ? children.slice(children.length - max) : children;
    const hidden = children.length - shown.length;
    for (const child of shown) root.append(helpers.renderNode(child));
    if (hidden > 0) {
      root.append(el("div", { class: "rui-toasts-overflow", role: "status" }, [`+${hidden} more`]));
    }
    return root;
  },
};

function defaultToastIcon(tone: string): string {
  switch (tone) {
    case "success": return "circle-check";
    case "warning": return "triangle-exclamation";
    case "danger": return "circle-xmark";
    case "primary": return "bell";
    case "info": return "circle-info";
    default: return "circle-info";
  }
}

