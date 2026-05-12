/**
 * Feedback primitives modeled after shadcn/ui:
 * Avatar, AvatarGroup, Progress, Switch, Toggle, ToggleGroup, Tooltip,
 * HoverCard, Kbd.
 *
 * These cover the most common "small bits of UI" that the LLM otherwise has
 * to fake with TextContent + emoji combinations. Every component is purely
 * declarative — state binding is done at the prop level so a `$variable`
 * passed to `Switch` two-way-binds the same way it does for `Checkbox`.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString, asBoolean, asNumber } from "../utils.js";
import { initialsFor } from "./_internal.js";

const AVATAR_SIZES = ["sm", "md", "lg", "xl"] as const;

export const Avatar: ComponentSpec = {
  name: "Avatar",
  description:
    "User avatar. Shows the image at `src`, falling back to initials computed " +
    "from `name` if the image is missing or fails to load.",
  props: [
    { name: "name", type: "string", description: "Used for alt text + initials fallback" },
    { name: "src", type: "string", optional: true, description: "Image URL" },
    { name: "size", type: "string", optional: true, enum: AVATAR_SIZES },
    { name: "status", type: "string", optional: true, enum: ["online", "offline", "busy", "away"] },
  ],
  render: (_node, props) => {
    const size = asString(props.size, "md");
    const root = el("span", {
      class: "rui-avatar",
      "data-size": size,
      role: "img",
    });
    const name = asString(props.name);
    const src = asString(props.src);
    if (src) {
      const img = el("img", { src, alt: name, loading: "lazy" });
      img.addEventListener("error", () => {
        img.replaceWith(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
      });
      root.append(img);
    } else {
      root.append(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
    }
    const status = asString(props.status);
    if (status) root.append(el("span", { class: "rui-avatar-status", "data-status": status }));
    return root;
  },
};

export const AvatarGroup: ComponentSpec = {
  name: "AvatarGroup",
  description:
    "Stack of overlapping avatars with a `+N` chip when the list overflows. " +
    "Pass either Avatar(...) nodes or plain {name, src} objects.",
  props: [
    { name: "items", type: "Avatar[]", description: "Avatar(...) nodes or {name, src} objects" },
    { name: "max", type: "number", optional: true, description: "Maximum avatars to show (default 4)" },
    { name: "size", type: "string", optional: true, enum: AVATAR_SIZES },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const max = Math.max(1, Math.floor(Number(props.max ?? 4)));
    const size = asString(props.size, "md");
    const visible = items.slice(0, max);
    const overflow = items.length - visible.length;
    const root = el("div", { class: "rui-avatar-group", "data-size": size });
    for (const item of visible) {
      if (item && typeof item === "object" && (item as { __kind?: string }).__kind === "Component") {
        root.append(helpers.renderNode(item));
        continue;
      }
      const data = item as { name?: unknown; src?: unknown } | string | null;
      const name = typeof data === "string" ? data : asString((data ?? {}).name);
      const src = typeof data === "string" ? "" : asString((data ?? {}).src);
      root.append(Avatar.render(
        { __kind: "Component", name: "Avatar", args: [], argMeta: [] },
        { name, src, size },
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

export const Progress: ComponentSpec = {
  name: "Progress",
  description:
    "Linear progress bar. `value` is clamped between 0 and `max` (default 100). " +
    "Set `indeterminate=true` to render a looping animation when the total is " +
    "unknown.",
  props: [
    { name: "value", type: "number", optional: true, description: "Current progress; ignored when indeterminate" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: "Shown above the bar" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "indeterminate", type: "boolean", optional: true },
    { name: "showValue", type: "boolean", optional: true, description: "Show the numeric value on the right" },
  ],
  render: (_node, props) => {
    const max = Math.max(1, asNumber(props.max, 100));
    const indeterminate = asBoolean(props.indeterminate);
    const value = Math.max(0, Math.min(max, asNumber(props.value, 0)));
    const percent = Math.round((value / max) * 100);
    const root = el("div", { class: "rui-progress", "data-tone": asString(props.tone, "primary") });
    const label = asString(props.label);
    const showValue = asBoolean(props.showValue);
    if (label || showValue) {
      const head = el("div", { class: "rui-progress-head" });
      head.append(el("span", { class: "rui-progress-label" }, [label]));
      if (showValue && !indeterminate) {
        head.append(el("span", { class: "rui-progress-value" }, [`${percent}%`]));
      }
      root.append(head);
    }
    const track = el("div", {
      class: "rui-progress-track",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": String(max),
      "aria-valuenow": indeterminate ? null : String(value),
      "data-indeterminate": indeterminate ? "true" : "false",
    });
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
    "— prefer Switch over Checkbox when the control represents a setting.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string", optional: true },
    { name: "value", type: "boolean", optional: true, description: "Bound value (typically $variable)" },
    { name: "description", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("label", {
      class: "rui-switch",
      for: id,
      "data-disabled": asBoolean(props.disabled) ? "true" : "false",
    });
    const input = el("input", {
      type: "checkbox",
      id,
      name: id,
      class: "rui-switch-input",
      role: "switch",
      checked: asBoolean(props.value) ? "" : null,
      disabled: asBoolean(props.disabled) ? "" : null,
    });
    const track = el("span", { class: "rui-switch-track" }, [
      el("span", { class: "rui-switch-thumb" }),
    ]);
    const stateName = node.argMeta?.[2]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "change",
        getValue: (n) => (n as HTMLInputElement).checked,
      });
    }
    const label = asString(props.label);
    const description = asString(props.description);
    root.append(input, track);
    if (label || description) {
      const meta = el("span", { class: "rui-switch-meta" });
      if (label) meta.append(el("span", { class: "rui-switch-label" }, [label]));
      if (description) meta.append(el("span", { class: "rui-switch-description" }, [description]));
      root.append(meta);
    }
    return root;
  },
};

export const Toggle: ComponentSpec = {
  name: "Toggle",
  description:
    "Single icon/text button with a pressed/unpressed state. When `value` is a " +
    "`$variable` reference, clicking the toggle flips it without an extra " +
    "Action — perfect for filter chips and view-mode buttons.",
  props: [
    { name: "label", type: "string" },
    { name: "value", type: "boolean", optional: true, description: "Pressed state (typically $variable)" },
    { name: "icon", type: "string", optional: true },
    { name: "variant", type: "string", optional: true, enum: ["default", "outline", "ghost"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
  ],
  render: (node, props, helpers) => {
    const pressed = asBoolean(props.value);
    const button = el("button", {
      type: "button",
      class: "rui-toggle",
      "aria-pressed": pressed ? "true" : "false",
      "data-variant": asString(props.variant, "default"),
      "data-size": asString(props.size, "md"),
      "data-state": pressed ? "on" : "off",
    });
    const icon = asString(props.icon);
    if (icon) button.append(el("span", { class: "rui-toggle-icon" }, [icon]));
    button.append(el("span", { class: "rui-toggle-label" }, [asString(props.label)]));
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      button.addEventListener("click", () => {
        helpers.runAction({
          kind: "Action",
          steps: [{ kind: "Set", name: stateName, value: !pressed }],
        });
      });
    }
    return button;
  },
};

export const ToggleGroup: ComponentSpec = {
  name: "ToggleGroup",
  description:
    "Group of mutually-exclusive Toggle-style buttons (single-select). Items " +
    "are `[value, label]` arrays, `{value, label, icon?}` objects, or plain " +
    "strings (used for both value and label). Pass a `$variable` as `value` " +
    "for two-way binding.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "any[]" },
    { name: "value", type: "any", optional: true },
    { name: "variant", type: "string", optional: true, enum: ["default", "outline"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
  ],
  render: (node, props, helpers) => {
    const current = asString(props.value);
    const variant = asString(props.variant, "outline");
    const size = asString(props.size, "md");
    const root = el("div", {
      class: "rui-toggle-group",
      role: "radiogroup",
      "data-variant": variant,
      "data-size": size,
    });
    const stateName = node.argMeta?.[2]?.stateRef;
    for (const raw of asArray<unknown>(props.items)) {
      const { value, label, icon } = extractToggleItem(raw);
      const isOn = value === current;
      const btn = el("button", {
        type: "button",
        class: "rui-toggle",
        role: "radio",
        "aria-checked": isOn ? "true" : "false",
        "data-variant": variant,
        "data-size": size,
        "data-state": isOn ? "on" : "off",
        "data-value": value,
      });
      if (icon) btn.append(el("span", { class: "rui-toggle-icon" }, [icon]));
      btn.append(el("span", { class: "rui-toggle-label" }, [label]));
      if (stateName) {
        btn.addEventListener("click", () => {
          helpers.runAction({
            kind: "Action",
            steps: [{ kind: "Set", name: stateName, value }],
          });
        });
      }
      root.append(btn);
    }
    return root;
  },
};

function extractToggleItem(raw: unknown): { value: string; label: string; icon: string } {
  if (typeof raw === "string") return { value: raw, label: raw, icon: "" };
  if (Array.isArray(raw)) {
    return {
      value: asString(raw[0]),
      label: asString(raw[1], asString(raw[0])),
      icon: asString(raw[2]),
    };
  }
  if (raw && typeof raw === "object") {
    const r = raw as { value?: unknown; label?: unknown; icon?: unknown };
    const value = asString(r.value);
    return { value, label: asString(r.label, value), icon: asString(r.icon) };
  }
  return { value: "", label: "", icon: "" };
}

export const Tooltip: ComponentSpec = {
  name: "Tooltip",
  description:
    "Wraps a trigger node and shows `label` text when the user hovers or " +
    "focuses it. Pure CSS — no JS needed. Use for short hints (≤6 words); " +
    "reach for HoverCard when you need rich content.",
  props: [
    { name: "label", type: "string" },
    { name: "trigger", type: "Node" },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom", "left", "right"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("span", {
      class: "rui-tooltip",
      "data-side": asString(props.side, "top"),
      tabindex: "0",
    });
    root.append(el("span", { class: "rui-tooltip-trigger" }, [
      helpers.renderNode(props.trigger),
    ]));
    root.append(el("span", { class: "rui-tooltip-content", role: "tooltip" }, [
      asString(props.label),
    ]));
    return root;
  },
};

export const HoverCard: ComponentSpec = {
  name: "HoverCard",
  description:
    "Wraps a trigger node and reveals a card with rich content on hover/focus. " +
    "Use for previewing a referenced item (profile, link target, definition).",
  props: [
    { name: "trigger", type: "Node" },
    { name: "content", type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom", "left", "right"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("span", {
      class: "rui-hover-card",
      "data-side": asString(props.side, "bottom"),
      tabindex: "0",
    });
    root.append(el("span", { class: "rui-hover-card-trigger" }, [
      helpers.renderNode(props.trigger),
    ]));
    const card = el("span", { class: "rui-hover-card-content", role: "dialog" });
    for (const child of asArray(props.content)) card.append(helpers.renderNode(child));
    root.append(card);
    return root;
  },
};

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

