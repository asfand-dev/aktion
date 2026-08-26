/**
 * Chat-friendly composite components: SectionBlock, ListBlock, FollowUpBlock.
 * These wrap content with the right typography for assistant responses.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asBoolean, asNumber, asString, isComponentNode, renderIcon } from "../utils.js";

export const SectionBlock: ComponentSpec = {
  name: "SectionBlock",
  description:
    "Titled chat block with a description and child content. `level` sets the " +
    "heading level (2-6, default 3) so nested sections keep a valid outline; " +
    "`actions` renders trailing controls in the header row (a \"View all\" " +
    "link, an overflow menu).",
  props: [
    { name: "title", type: "string" },
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true, description: "Header-right controls, e.g. a Link or DropdownMenu" },
    { name: "level", type: "number", optional: true, description: "Heading level 2-6 (default 3); the visual size is unchanged" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon shown before the title" },
  ],
  render: (_node, props, helpers) => {
    const root = el("section", { class: "rui-section-block" });
    // The level is a11y-only — a nested SectionBlock rendering a second <h3>
    // makes heading navigation useless. `.rui-section-block-title` pins the
    // size, so appearance does not change with the level.
    const level = Math.max(2, Math.min(6, Math.round(asNumber(props.level, 3))));
    const heading = el(`h${level}` as "h3", { class: "rui-section-block-title" });
    const iconNode = renderIcon(props.icon, { className: "rui-section-block-icon" });
    if (iconNode) {
      // Spacing inline: the heading is not a flex row, so there is no gap to
      // inherit and the glyph would otherwise touch the first letter.
      iconNode.style.marginInlineEnd = "0.4em";
      heading.append(iconNode);
    }
    heading.append(document.createTextNode(asString(props.title)));
    const actions = asArray<unknown>(props.actions).filter((a) => a !== null && a !== undefined);
    if (actions.length > 0) {
      const header = el("div", {
        class: "rui-section-block-header",
        style: "display:flex;align-items:center;justify-content:space-between;gap:var(--rui-spacing-s)",
      });
      header.append(heading);
      const trailing = el("div", { class: "rui-section-block-actions", style: "display:flex;align-items:center;gap:var(--rui-spacing-xs)" });
      for (const action of actions) trailing.append(helpers.renderNode(action));
      header.append(trailing);
      root.append(header);
    } else {
      root.append(heading);
    }
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-section-block-description" }, [desc]));
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

const LIST_MARKERS = ["bullet", "none", "check"] as const;

export const ListBlock: ComponentSpec = {
  name: "ListBlock",
  description:
    "Chat-styled list with bullets, useful for steps or summaries. `items` " +
    "takes plain strings or component nodes (Text, ActionLink, Badge, …), " +
    "which render inline. `marker` switches to an unmarked or checklist list; " +
    "`start` continues an `ordered` list that was split across blocks.",
  props: [
    { name: "items", type: "any[]", description: "Strings, or component nodes rendered inside the list item" },
    { name: "ordered", type: "boolean", optional: true },
    { name: "marker", type: "string", optional: true, enum: LIST_MARKERS, description: "Bullet style (default `bullet`); `none` drops the marker, `check` shows a checkmark" },
    { name: "start", type: "number", optional: true, description: "First number of an `ordered` list (default 1)" },
  ],
  render: (_node, props, helpers) => {
    const ordered = asBoolean(props.ordered);
    const markerRaw = asString(props.marker, "bullet");
    const marker = (LIST_MARKERS as readonly string[]).includes(markerRaw) ? markerRaw : "bullet";
    const start = Math.round(asNumber(props.start, 1));
    const tag = ordered ? "ol" : "ul";
    const root = el(tag as "ul", {
      class: "rui-list-block",
      "data-marker": marker,
      // `start` is only meaningful on <ol>; emitting it otherwise is invalid.
      start: ordered && start !== 1 ? String(start) : null,
      // Suppressing the native marker is the whole point of these variants, so
      // it is inline rather than dependent on a theme rule. `check` keeps the
      // indent for the glyph the stylesheet draws in `::before`.
      style: marker === "none" ? "list-style:none;padding-left:0" : marker === "check" ? "list-style:none" : null,
    });
    for (const item of asArray<unknown>(props.items)) {
      const li = el("li", {});
      // A component node used to be coerced with `asString`, which rendered the
      // literal "[object Object]" for the natural `[Text(…), ActionLink(…)]`
      // shape the description invites.
      if (isComponentNode(item)) li.append(helpers.renderNode(item));
      else li.append(document.createTextNode(asString(item)));
      root.append(li);
    }
    return root;
  },
};

/** Sequence for the follow-up title ids that label the suggestion group. */
let followUpIdSeq = 0;

export const FollowUpBlock: ComponentSpec = {
  name: "FollowUpBlock",
  description: "Suggested follow-up prompts shown as buttons. Each item dispatches its label as an assistant message (equivalent to `emit \"assistant-message\" { message }`) unless `onSelect` is supplied, which receives `(message, label)` instead. `disabled` makes the row inert while the assistant is responding; `layout: \"stack\"` puts one suggestion per line.",
  props: [
    { name: "items", type: "FollowUpItem[]", description: "Array of FollowUpItem(label, message?), {label, message, disabled?} objects, or plain strings" },
    { name: "title", type: "string", optional: true },
    { name: "onSelect", type: "callable", optional: true, description: "(message, label) => … — replaces the default assistant-message dispatch" },
    { name: "disabled", type: "boolean", optional: true, description: "Render every chip inert (e.g. once one has been picked)" },
    { name: "layout", type: "string", optional: true, aliases: ["columns"], enum: ["wrap", "stack"], description: "`wrap` (default) flows chips in a row; `stack` gives each a full line — better for long suggestion sentences" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-follow-up" });
    const title = asString(props.title, "You can also ask");
    const layout = asString(props.layout, "wrap") === "stack" ? "stack" : "wrap";
    const disabled = asBoolean(props.disabled);
    // Stable id so the title can label the group instead of being announced as
    // one more unrelated line of text.
    const titleIdSlot = helpers.useInstanceState<string>("rui-follow-up-title-id", "");
    if (!titleIdSlot.get()) titleIdSlot.set(`rui-follow-up-title-${(followUpIdSeq += 1)}`);
    const titleId = titleIdSlot.get();
    if (title) root.append(el("div", { class: "rui-follow-up-title", id: titleId }, [title]));
    const list = el("div", {
      class: "rui-follow-up-list",
      // Grouped so a screen-reader user knows these are suggestions that send a
      // message, not buttons that mutate application state.
      role: "group",
      "aria-labelledby": title ? titleId : null,
      "aria-label": title ? null : "Suggested follow-ups",
      "data-layout": layout,
      style: layout === "stack" ? "flex-direction:column;align-items:stretch" : null,
    });
    for (const item of asArray<unknown>(props.items)) {
      const button = buildFollowUpButton(item, helpers, disabled, props.onSelect);
      if (button) list.append(button);
    }
    root.append(list);
    return root;
  },
};

const buildFollowUpButton = (
  item: unknown,
  helpers: Pick<RenderHelpers, "sendToAssistant" | "invoke">,
  blockDisabled: boolean,
  onSelect: unknown,
): HTMLButtonElement | null => {
  const { label, message, disabled } = extractFollowUp(item);
  // An unusable item (a foreign component node) yields no label; a blank chip
  // is worse than none.
  if (!label) return null;
  const inert = blockDisabled || disabled;
  const button = el("button", { class: "rui-follow-up-button", type: "button", disabled: inert }, [label]);
  if (inert) return button;
  button.onclick = (event) => {
    // Swallow the double-tap: the clicked chip goes inert on the LIVE node
    // (resolved from the event, never a render-time capture) until the next
    // render restores it — which is when the assistant's reply arrives.
    const clicked = (event.currentTarget ?? event.target) as HTMLButtonElement | null;
    if (clicked) clicked.disabled = true;
    if (onSelect === null || onSelect === undefined) helpers.sendToAssistant(message);
    else helpers.invoke(onSelect, message, label);
  };
  return button;
};

const extractFollowUp = (item: unknown): { label: string; message: string; disabled: boolean } => {
  if (typeof item === "string") return { label: item, message: item, disabled: false };
  if (item && typeof item === "object") {
    const node = item as {
      __kind?: string; name?: string; args?: unknown[];
      label?: unknown; message?: unknown; disabled?: unknown;
    };
    // Only FollowUpItem's slots mean (label, message). `args` is aligned to the
    // CALLED spec's prop order, so reading slot 1 off any other component —
    // `FollowUpBlock([ActionLink("Retry", $retry)])`, an easy mistake — used to
    // stringify a callable and send its source text to the assistant.
    if (node.__kind === "Component" && node.name === "FollowUpItem" && Array.isArray(node.args)) {
      const label = asString(node.args[0]);
      return { label, message: asString(node.args[1], label), disabled: false };
    }
    const label = asString(node.label);
    return { label, message: asString(node.message, label), disabled: asBoolean(node.disabled) };
  }
  const fallback = asString(item);
  return { label: fallback, message: fallback, disabled: false };
};

export const FollowUpItem: ComponentSpec = {
  name: "FollowUpItem",
  description: "Single follow-up item.",
  props: [
    { name: "label", type: "string" },
    { name: "message", type: "string", optional: true, description: "Defaults to label" },
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label);
    const message = asString(props.message, label);
    const button = el("button", { class: "rui-follow-up-button", type: "button" }, [label]);
    button.onclick = () => {
      helpers.sendToAssistant(message);
    };
    return button;
  },
};

export const ActionLink: ComponentSpec = {
  name: "ActionLink",
  description:
    "Inline link that runs an action when clicked instead of navigating. " +
    "`disabled` makes it inert while the work is in flight; `icon` adds a " +
    "glyph before the label (or after it with `iconPosition: \"end\"`).",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", aliases: ["action", "onclick"] },
    { name: "disabled", type: "boolean", optional: true, description: "Make the action inert, e.g. while a Retry is already running" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon shown with the label" },
    { name: "iconPosition", type: "string", optional: true, enum: ["start", "end"], description: "Which side the icon sits on (default `start`)" },
    { name: "ariaLabel", type: "string", optional: true, description: "Accessible name, when the visible label alone does not identify the target — e.g. one \"Rebuild\" link per table row, where every link would otherwise be announced identically" },
  ],
  render: (_node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    // A real <button>: `role="button"` on an `<a href="#">` promised Space
    // activation a native anchor never delivers, `disabled` does not apply to
    // an anchor, and the `#` target showed up in the status bar and on
    // middle-click. The link look is entirely class-based, so only the UA
    // button chrome needs resetting.
    // `aria-label` OVERRIDES the visible label for assistive tech, which is the
    // point: a repeated action in a list ("Rebuild node" on every row) is
    // announced identically on every row, so the name has to be able to carry
    // what the row does — while the visible column stays terse. Only set when
    // given, so an unlabelled link keeps its text as its name.
    const ariaLabel = asString(props.ariaLabel);
    const iconAtEnd = asString(props.iconPosition, "start") === "end";
    const button = el("button", {
      type: "button",
      class: "rui-action-link" + (props.icon ? " has-icon" : ""),
      disabled,
      "aria-label": ariaLabel || null,
      // `data-icon-position` rather than a second class, matching `Button`.
      "data-icon-position": props.icon ? (iconAtEnd ? "end" : "start") : null,
      // The four longhands, NOT the `font` shorthand. `font: inherit` also resets
      // `line-height` — and being inline it beat every stylesheet, so a theme that
      // set a line-height on this control (vision does: 20px) had a rule that
      // could never fire. These four inherit what the shorthand did without
      // touching the fifth property nobody meant to set.
      style: "background:none;border:0;padding:0;text-align:inherit;font-family:inherit;font-size:inherit;font-weight:inherit;font-style:inherit",
    });
    // The gap is a stylesheet concern now (see `.rui-action-link-icon`): an inline
    // margin is unthemeable, and a theme with different link metrics had no way to
    // change it.
    const iconNode = renderIcon(props.icon, { className: "rui-action-link-icon" });
    if (iconNode && !iconAtEnd) button.append(iconNode);
    button.append(document.createTextNode(asString(props.label)));
    if (iconNode && iconAtEnd) button.append(iconNode);
    if (!disabled) {
      button.onclick = () => {
        helpers.invoke(props.onClick);
      };
    }
    return button;
  },
};
