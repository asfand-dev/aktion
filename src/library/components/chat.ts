/**
 * Chat-friendly composite components: SectionBlock, ListBlock, FollowUpBlock.
 * These wrap content with the right typography for assistant responses.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asBoolean, asString } from "../utils.js";

export const SectionBlock: ComponentSpec = {
  name: "SectionBlock",
  description: "Titled chat block with a description and child content.",
  props: [
    { name: "title", type: "string" },
    { name: "children", type: "Node[]" },
    { name: "description", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("section", { class: "rui-section-block" });
    root.append(el("h3", { class: "rui-section-block-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-section-block-description" }, [desc]));
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const ListBlock: ComponentSpec = {
  name: "ListBlock",
  description: "Chat-styled list with bullets, useful for steps or summaries.",
  props: [
    { name: "items", type: "string[]" },
    { name: "ordered", type: "boolean", optional: true },
  ],
  render: (_node, props) => {
    const tag = asBoolean(props.ordered) ? "ol" : "ul";
    const root = el(tag as "ul", { class: "rui-list-block" });
    for (const item of asArray(props.items)) {
      root.append(el("li", {}, [asString(item)]));
    }
    return root;
  },
};

export const FollowUpBlock: ComponentSpec = {
  name: "FollowUpBlock",
  description: "Suggested follow-up prompts shown as buttons. Each item dispatches its label as an assistant message (equivalent to `emit \"assistant-message\" { message }`).",
  props: [
    { name: "items", type: "FollowUpItem[]", description: "Array of FollowUpItem(label, message?), {label, message} objects, or plain strings" },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-follow-up" });
    const title = asString(props.title, "You can also ask");
    if (title) root.append(el("div", { class: "rui-follow-up-title" }, [title]));
    const list = el("div", { class: "rui-follow-up-list" });
    for (const item of asArray<unknown>(props.items)) {
      list.append(buildFollowUpButton(item, helpers));
    }
    root.append(list);
    return root;
  },
};

const buildFollowUpButton = (
  item: unknown,
  helpers: Pick<RenderHelpers, "sendToAssistant">,
): HTMLButtonElement => {
  const { label, message } = extractFollowUp(item);
  const button = el("button", { class: "rui-follow-up-button", type: "button" }, [label]);
  button.onclick = () => {
    helpers.sendToAssistant(message);
  };
  return button;
};

const extractFollowUp = (item: unknown): { label: string; message: string } => {
  if (typeof item === "string") return { label: item, message: item };
  if (item && typeof item === "object") {
    const node = item as { __kind?: string; args?: unknown[]; label?: unknown; message?: unknown };
    if (node.__kind === "Component" && Array.isArray(node.args)) {
      const label = asString(node.args[0]);
      const message = asString(node.args[1], label);
      return { label, message };
    }
    const label = asString(node.label);
    const message = asString(node.message, label);
    return { label, message };
  }
  const fallback = asString(item);
  return { label: fallback, message: fallback };
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
  description: "Inline link that runs an action when clicked instead of navigating.",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", aliases: ["action", "onclick"] },
  ],
  render: (_node, props, helpers) => {
    const link = el("a", { class: "rui-action-link", href: "#", role: "button" }, [asString(props.label)]);
    link.onclick = (event) => {
      event.preventDefault();
      helpers.invoke(props.onClick);
    };
    return link;
  },
};
