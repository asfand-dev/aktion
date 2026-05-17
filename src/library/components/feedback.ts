/**
 * Feedback primitives modeled after shadcn/ui:
 * Avatar, AvatarGroup, Progress, Switch, Toggle, ToggleGroup, Tooltip,
 * HoverCard, Popover, Toast, Toasts, Kbd.
 *
 * These cover the most common "small bits of UI" that the LLM otherwise has
 * to fake with TextContent + emoji combinations. Every component is purely
 * declarative — state binding is done at the prop level so a `$variable`
 * passed to `Switch` two-way-binds the same way it does for `Checkbox`.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  sanitiseCssLength, sanitiseImageSrc,
} from "../utils.js";
import { initialsFor, installDismissListeners, disposeDismissListeners, dicebearUrlFor } from "./_internal.js";
import { resolveIconClasses } from "../../icons/index.js";

const AVATAR_SIZES = ["sm", "md", "lg", "xl"] as const;

const AVATAR_FALLBACKS = ["initials", "dicebear"] as const;

export const Avatar: ComponentSpec = {
  name: "Avatar",
  description:
    "User avatar. Shows the image at `src`. When `src` is missing, falls back " +
    "to a deterministic DiceBear illustration seeded by `name` (pass " +
    "`fallback=\"initials\"` to render two-letter initials instead). If the " +
    "image errors at runtime the avatar gracefully degrades to initials.",
  props: [
    { name: "name", type: "string", description: "Used for alt text + initials fallback" },
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
  render: (_node, props) => {
    const size = asString(props.size, "md");
    const root = el("span", {
      class: "rui-avatar",
      "data-size": size,
      role: "img",
    });
    const name = asString(props.name);
    const fallback = asString(props.fallback, "dicebear") as (typeof AVATAR_FALLBACKS)[number];
    const explicitSrc = sanitiseImageSrc(props.src);
    const generated = !explicitSrc && fallback === "dicebear" && name
      ? sanitiseImageSrc(dicebearUrlFor(name))
      : "";
    const src = explicitSrc || generated;
    if (src) {
      const img = el("img", { src, alt: name, loading: "lazy" });
      img.onerror = (event) => {
        const ev = event as Event;
        const live = (ev.currentTarget ?? ev.target) as Element;
        live.replaceWith(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
      };
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
    "Linear progress bar. `value` is clamped between 0 and `max` (default " +
    "100). `indeterminate=true` renders a looping animation when the total " +
    "is unknown. Provide `segments` to render a segmented progress strip " +
    "(steps in an onboarding flow), or `buffered` for a secondary " +
    "buffer indicator (downloads, video buffering).",
  props: [
    { name: "value", type: "number", optional: true, description: "Current progress; ignored when indeterminate" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: "Shown above the bar" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
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
    const segments = Math.max(0, Math.floor(asNumber(props.segments, 0)));
    const buffered = props.buffered != null ? Math.max(0, Math.min(max, asNumber(props.buffered, 0))) : null;
    const root = el("div", { class: "rui-progress", "data-tone": asString(props.tone, "primary") });
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
      const trackRoot = el("div", {
        class: "rui-progress-segments",
        role: "progressbar",
        "aria-valuemin": "0",
        "aria-valuemax": String(segments),
        "aria-valuenow": String(Math.min(segments, Math.round((value / max) * segments))),
      });
      const filled = Math.min(segments, Math.round((value / max) * segments));
      for (let i = 0; i < segments; i += 1) {
        trackRoot.append(el("span", {
          class: "rui-progress-segment",
          "data-filled": i < filled ? "true" : "false",
        }));
      }
      root.append(trackRoot);
      return root;
    }

    const track = el("div", {
      class: "rui-progress-track",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": String(max),
      "aria-valuenow": indeterminate ? null : String(value),
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
    const iconNode = renderIcon(props.icon, { className: "rui-toggle-icon" });
    if (iconNode) button.append(iconNode);
    button.append(el("span", { class: "rui-toggle-label" }, [asString(props.label)]));
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      button.onclick = () => {
        helpers.runAction({
          kind: "Action",
          steps: [{ kind: "Set", name: stateName, value: !pressed }],
        });
      };
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
      const itemIconNode = renderIcon(icon, { className: "rui-toggle-icon" });
      if (itemIconNode) btn.append(itemIconNode);
      btn.append(el("span", { class: "rui-toggle-label" }, [label]));
      if (stateName) {
        btn.onclick = () => {
          helpers.runAction({
            kind: "Action",
            steps: [{ kind: "Set", name: stateName, value }],
          });
        };
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
    "Pass `interactive=true` and a `$variable` as `value` to let users " +
    "rate something; with `halfStep=true` clicking the left half of a " +
    "star sets a fractional value. `icon` swaps the glyph family — " +
    "`star` (default), `heart`, `thumb`, `fire`, `bolt`, or any custom " +
    "Font Awesome name.",
  props: [
    { name: "value", type: "number", description: "0–max; can be a $variable when interactive" },
    { name: "max", type: "number", optional: true, description: "Maximum number of stars (default 5)" },
    { name: "label", type: "string", optional: true, description: "Inline text shown after the stars (e.g. \"4.2 of 5\")" },
    { name: "count", type: "number", optional: true, description: "Review/voter count rendered in parentheses" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "interactive", type: "boolean", optional: true, description: "Allow clicking a star to set the value" },
    { name: "halfStep", type: "boolean", optional: true, description: "Allow half-star resolution when interactive" },
    { name: "icon", type: "string", optional: true, description: "Icon family — `star` (default), `heart`, `thumb`, `fire`, `bolt`, or any FA name" },
  ],
  render: (node, props, helpers) => {
    const max = Math.max(1, Math.floor(asNumber(props.max, 5)));
    const raw = Math.max(0, Math.min(max, asNumber(props.value, 0)));
    const size = asString(props.size, "md");
    const interactive = asBoolean(props.interactive);
    const halfStep = asBoolean(props.halfStep);
    const stateName = node.argMeta?.[0]?.stateRef;
    const iconChoice = resolveRatingIcons(asString(props.icon));
    const root = el("div", {
      class: "rui-rating",
      "data-size": size,
      "data-interactive": interactive && stateName ? "true" : "false",
      "data-half-step": interactive && stateName && halfStep ? "true" : "false",
      role: "img",
      "aria-label": `${raw} of ${max}`,
    });
    const stars = el("span", { class: "rui-rating-stars" });
    for (let i = 1; i <= max; i += 1) {
      const fill = Math.max(0, Math.min(1, raw - (i - 1)));
      const iconName =
        fill >= 1 ? iconChoice.full : fill > 0 ? iconChoice.half : iconChoice.empty;
      const iconClasses = resolveIconClasses(iconName).join(" ");
      const star = el(interactive && stateName ? "button" : "span", {
        class: `rui-rating-star ${iconClasses}`.trim(),
        type: interactive && stateName ? "button" : null,
        "data-fill": fill >= 1 ? "full" : fill > 0 ? "half" : "empty",
        "aria-label": interactive && stateName ? `Rate ${i}` : null,
        "aria-hidden": interactive && stateName ? null : "true",
      });
      if (interactive && stateName) {
        const fullValue = i;
        const halfValue = i - 0.5;
        (star as HTMLButtonElement).onclick = (event) => {
          let next: number = fullValue;
          if (halfStep) {
            // Determine which half of the star was clicked. Resolve from
            // the live element via the event so the handler still works
            // after the morph reconciler keeps the previous DOM.
            const evt = event as MouseEvent;
            const target = (evt.currentTarget ?? evt.target) as HTMLElement;
            const rect = target.getBoundingClientRect();
            if (rect.width > 0 && evt.clientX - rect.left < rect.width / 2) {
              next = halfValue;
            }
          }
          helpers.runAction({
            kind: "Action",
            steps: [{ kind: "Set", name: stateName, value: next }],
          });
        };
      }
      stars.append(star);
    }
    root.append(stars);
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-rating-label" }, [label]));
    const count = props.count != null ? asNumber(props.count, 0) : null;
    if (count !== null && count > 0) {
      root.append(el("span", { class: "rui-rating-count" }, [`(${count.toLocaleString()})`]));
    }
    return root;
  },
};

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
    "value (or a custom label) inside the ring.",
  props: [
    { name: "value", type: "number", optional: true, description: "Current value (ignored when indeterminate)" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: "Text shown inside the ring (default \"{percent}%\")" },
    { name: "caption", type: "string", optional: true, description: "Small caption rendered under the ring" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "indeterminate", type: "boolean", optional: true },
  ],
  render: (_node, props) => {
    const max = Math.max(1, asNumber(props.max, 100));
    const indeterminate = asBoolean(props.indeterminate);
    const value = Math.max(0, Math.min(max, asNumber(props.value, 0)));
    const percent = Math.round((value / max) * 100);
    const size = asString(props.size, "md");
    const px = size === "lg" ? 120 : size === "sm" ? 72 : 96;
    const stroke = size === "lg" ? 10 : size === "sm" ? 6 : 8;
    const r = (px - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = indeterminate ? circumference * 0.65 : circumference * (1 - percent / 100);
    const root = el("div", {
      class: "rui-progress-ring",
      "data-tone": asString(props.tone, "primary"),
      "data-size": size,
      "data-indeterminate": indeterminate ? "true" : "false",
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
    // Allow the inner label to be a Font Awesome icon name (e.g. "circle-check")
    // for completion-style rings, while still accepting plain text labels.
    const labelIcon = renderIcon(rawLabel, { className: "rui-progress-ring-icon" });
    if (labelIcon && resolveIconClasses(rawLabel).length > 0) {
      center.append(labelIcon);
    } else {
      center.append(document.createTextNode(rawLabel));
    }
    wrap.append(center);
    root.append(wrap);
    const caption = asString(props.caption);
    if (caption) root.append(el("span", { class: "rui-progress-ring-caption" }, [caption]));
    return root;
  },
};

export const ChatBubble: ComponentSpec = {
  name: "ChatBubble",
  description:
    "Single chat-style message bubble with author, time, and body. Use " +
    "for conversation threads, agent transcripts, support chats, and any " +
    "message-style UI. Set `from=\"me\"` (or any non-empty author) for " +
    "the active speaker — the bubble aligns to the right with a primary " +
    "tint. `from=\"agent\"` (default) renders as the canonical incoming " +
    "bubble on the left.",
  props: [
    { name: "author", type: "string" },
    { name: "body", type: "string" },
    { name: "time", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true },
    { name: "from", type: "string", optional: true, enum: ["agent", "me", "system"], description: "Lane (default agent)" },
    { name: "status", type: "string", optional: true, enum: ["sending", "sent", "delivered", "read", "error"] },
  ],
  render: (_node, props) => {
    const from = asString(props.from, "agent");
    const root = el("div", {
      class: "rui-chat-bubble",
      "data-from": from,
    });
    if (from !== "me") {
      root.append(renderAvatarFallback(asString(props.avatarSrc), asString(props.author)));
    }
    const bubble = el("div", { class: "rui-chat-bubble-bubble" });
    const head = el("header", { class: "rui-chat-bubble-head" });
    head.append(el("span", { class: "rui-chat-bubble-author" }, [asString(props.author)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-chat-bubble-time" }, [time]));
    bubble.append(head);
    bubble.append(el("p", { class: "rui-chat-bubble-body" }, [asString(props.body)]));
    const status = asString(props.status);
    if (status) bubble.append(el("span", { class: "rui-chat-bubble-status", "data-status": status }, [status]));
    root.append(bubble);
    if (from === "me") {
      root.append(renderAvatarFallback(asString(props.avatarSrc), asString(props.author)));
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

const POPOVER_SIDES = ["bottom", "top", "left", "right"] as const;
const POPOVER_ALIGNS = ["start", "center", "end"] as const;

export const Popover: ComponentSpec = {
  name: "Popover",
  description:
    "Click-triggered popup with arbitrary rich content. Use when " +
    "HoverCard's hover trigger is too eager and Modal/Sheet is too heavy — " +
    "perfect for filter panels, color pickers, share menus, and small " +
    "settings flyouts. The trigger stays visible while the popover is " +
    "open — clicking it again, clicking outside, pressing Escape, or " +
    "clicking the built-in × button all close it.",
  props: [
    { name: "trigger", type: "Node", description: "Clickable trigger element (Button, Avatar, IconButton, …). The trigger remains visible while the popover is open." },
    { name: "content", type: "Node[]", description: "Body rendered inside the popover" },
    { name: "title", type: "string", optional: true, description: "Optional bold heading rendered above the content" },
    { name: "side", type: "string", optional: true, enum: POPOVER_SIDES, description: "Where the popover opens relative to the trigger (default \"bottom\")" },
    { name: "align", type: "string", optional: true, enum: POPOVER_ALIGNS, description: "Alignment along the trigger edge (default \"start\")" },
    { name: "width", type: "string", optional: true, description: "CSS width for the popover panel (default \"280px\")" },
  ],
  render: (_node, props, helpers) => {
    const openSlot = helpers.useInstanceState<boolean>("open", false);
    const isOpen = openSlot.get();
    const width = sanitiseCssLength(props.width, "");
    const root = el("div", {
      class: "rui-popover",
      "data-open": isOpen ? "true" : "false",
      "data-side": asString(props.side, "bottom"),
      "data-align": asString(props.align, "start"),
    });

    // Render the user's trigger directly and wrap it in a span so we can
    // attach the toggle handler without nesting <button> inside <button>
    // (which is invalid HTML and silently swallows clicks in some browsers).
    const triggerWrap = el("span", {
      class: "rui-popover-trigger",
      "data-state": isOpen ? "open" : "closed",
      "aria-haspopup": "dialog",
      "aria-expanded": isOpen ? "true" : "false",
    });
    triggerWrap.append(helpers.renderNode(props.trigger));
    root.append(triggerWrap);

    const body = el("div", {
      class: "rui-popover-content",
      role: "dialog",
      style: width ? `width: ${width};` : null,
    });
    // Always render a header so the close (×) button has a stable slot,
    // whether or not the user provided a title.
    const header = el("div", { class: "rui-popover-header" });
    const titleText = asString(props.title);
    header.append(
      titleText
        ? el("div", { class: "rui-popover-title" }, [titleText])
        : el("span", { class: "rui-popover-title-spacer" }),
    );
    const closeBtn = el("button", {
      type: "button",
      class: "rui-popover-close",
      "aria-label": "Close popover",
    }, ["×"]);
    closeBtn.onclick = (event) => {
      event.stopPropagation();
      setPopoverOpen(closeBtn, false, openSlot);
    };
    header.append(closeBtn);
    body.append(header);
    for (const child of asArray(props.content)) {
      body.append(helpers.renderNode(child));
    }
    root.append(body);

    // Property-based handlers so the morph reconciler can copy the latest
    // closure (with up-to-date `openSlot`) onto kept DOM. `addEventListener`
    // would leak a fresh listener onto every detached re-render snapshot.
    triggerWrap.onclick = (event) => {
      event.stopPropagation();
      const origin = (event.currentTarget ?? event.target) as Element;
      const next = !openSlot.get();
      const liveRoot = setPopoverOpen(origin, next, openSlot);
      if (next && liveRoot) installPopoverDismiss(liveRoot, openSlot);
    };
    triggerWrap.onkeydown = (event) => {
      const e = event as KeyboardEvent;
      const origin = (e.currentTarget ?? e.target) as Element;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const next = !openSlot.get();
        const liveRoot = setPopoverOpen(origin, next, openSlot);
        if (next && liveRoot) installPopoverDismiss(liveRoot, openSlot);
      } else if (e.key === "Escape" && openSlot.get()) {
        e.preventDefault();
        setPopoverOpen(origin, false, openSlot);
      }
    };

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
  if (!next) disposeDismissListeners(liveRoot);
  return liveRoot;
};

const installPopoverDismiss = (
  liveRoot: HTMLElement,
  openSlot: { set: (value: boolean) => void },
): void => {
  installDismissListeners({
    liveRoot,
    onDismiss: () => {
      openSlot.set(false);
      liveRoot.setAttribute("data-open", "false");
      const trigger = liveRoot.querySelector(".rui-popover-trigger");
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.setAttribute("data-state", "closed");
    },
  });
};

const TOAST_TONES = ["default", "primary", "success", "warning", "danger", "info"] as const;

const TOASTS_POSITIONS = [
  "top-right", "top-left", "top-center",
  "bottom-right", "bottom-left", "bottom-center",
] as const;

export const Toast: ComponentSpec = {
  name: "Toast",
  description:
    "Single transient notification card. Always shows a close (×) button " +
    "that removes the toast from the DOM (and fires `onClose` if set). " +
    "Pass `duration` (ms) to auto-dismiss, or `position` for a standalone " +
    "one-off toast (the renderer will pin it to the viewport corner so " +
    "you do not have to wrap a single notification in `Toasts(...)`). " +
    "Use `Toasts` for grouped stacks; prefer `Banner` for top-of-page " +
    "announcements and `Notification` for permanent inbox entries.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, enum: TOAST_TONES, description: "Visual accent (default \"default\")" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name (default picked from tone)" },
    { name: "duration", type: "number", optional: true, description: "Auto-dismiss after N milliseconds (e.g. 4000). Omit to keep the toast until the user closes it." },
    { name: "action", type: "Button", optional: true, description: "Optional inline action Button(...) shown above the message" },
    { name: "onClose", type: "Action", optional: true, description: "Action fired when the toast is dismissed (× button, auto-dismiss, or programmatic)" },
    { name: "position", type: "string", optional: true, enum: TOASTS_POSITIONS, description: "Pin a standalone Toast to a viewport corner without wrapping it in `Toasts(...)`" },
  ],
  render: (_node, props, helpers) => {
    const tone = asString(props.tone, "default");
    const position = asString(props.position);
    const root = el("div", {
      class: position ? "rui-toast rui-toast-standalone" : "rui-toast",
      role: "status",
      "aria-live": tone === "danger" ? "assertive" : "polite",
      "data-tone": tone,
      "data-position": position || null,
    });
    const iconName = asString(props.icon) || defaultToastIcon(tone);
    const iconNode = renderIcon(iconName, { className: "rui-toast-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-toast-body" });
    body.append(el("div", { class: "rui-toast-title" }, [asString(props.title)]));
    const message = asString(props.message);
    if (message) body.append(el("div", { class: "rui-toast-message" }, [message]));
    if (props.action) {
      const actionWrap = el("div", { class: "rui-toast-action" });
      actionWrap.append(helpers.renderNode(props.action));
      body.append(actionWrap);
    }
    root.append(body);

    // Track dismiss locally so re-renders don't restart the timer or undo
    // the manual close. `useInstanceState` keeps the slot keyed by the
    // toast's path in the tree.
    const dismissedSlot = helpers.useInstanceState<boolean>("dismissed", false);
    const timerSlot = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("timer", null);

    // Resolves whichever .rui-toast element is currently in the DOM,
    // preferring the live one over the closure-captured (potentially
    // detached) root.
    const liveToast = (origin?: Element): HTMLElement | null => {
      if (origin) {
        const live = origin.closest(".rui-toast") as HTMLElement | null;
        if (live) return live;
      }
      return root.isConnected ? root : null;
    };

    const cancelTimer = (): void => {
      const handle = timerSlot.get();
      if (handle !== null) {
        clearTimeout(handle);
        timerSlot.set(null);
      }
    };

    const removalTimerSlot = helpers.useInstanceState<ReturnType<typeof setTimeout> | null>("removal-timer", null);

    const dismiss = (origin?: Element): void => {
      if (dismissedSlot.get()) return;
      dismissedSlot.set(true);
      // Clear the pending auto-dismiss timer so it doesn't fire `onClose`
      // a second time after the user has already closed the toast.
      cancelTimer();
      const target = liveToast(origin);
      if (!target) return;
      target.classList.add("is-dismissed");
      // Allow the CSS exit animation to complete before unmounting.
      const handle = setTimeout(() => {
        removalTimerSlot.set(null);
        target.remove();
      }, 180);
      removalTimerSlot.set(handle);
      helpers.registerDisposer(() => {
        const h = removalTimerSlot.get();
        if (h !== null) {
          clearTimeout(h);
          removalTimerSlot.set(null);
        }
      }, "exit-animation-timer");
      if (isActionPayload(props.onClose)) helpers.runAction(props.onClose);
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

    const duration = asNumber(props.duration, 0);
    if (duration > 0 && timerSlot.get() === null && !dismissedSlot.get()) {
      const handle = setTimeout(() => {
        timerSlot.set(null);
        // Only auto-dismiss if the element is still in the document and
        // hasn't been manually closed.
        if (!dismissedSlot.get() && root.isConnected) dismiss();
      }, duration);
      timerSlot.set(handle);
      // If the toast is unmounted before the timer fires (parent re-rendered
      // without it, page navigated, host cleared), cancel the timer instead
      // of letting it fire a stale `onClose` action.
      helpers.registerDisposer(() => {
        const h = timerSlot.get();
        if (h !== null) {
          clearTimeout(h);
          timerSlot.set(null);
        }
      }, "auto-dismiss-timer");
    }

    if (dismissedSlot.get()) {
      // The toast was already dismissed in a previous render cycle —
      // return an empty placeholder so the reconciler doesn't resurrect it.
      const placeholder = el("div", { class: "rui-toast-placeholder", hidden: "" });
      return placeholder;
    }
    return root;
  },
};

export const Toasts: ComponentSpec = {
  name: "Toasts",
  description:
    "Fixed-position container that stacks Toast notifications. Pin to a " +
    "viewport corner with `position`. Pair with a `$toasts` $variable + " +
    "`@Push` / `@Filter` to add and remove toasts declaratively.",
  props: [
    { name: "items", type: "Toast[]" },
    { name: "position", type: "string", optional: true, enum: TOASTS_POSITIONS, description: "Viewport anchor (default \"top-right\")" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-toasts",
      "data-position": asString(props.position, "top-right"),
      "aria-live": "polite",
    });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
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

