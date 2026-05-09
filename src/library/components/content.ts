/**
 * Content components: TextContent, Header, Image, Link, Badge, Tag, TagBlock,
 * Alert, Callout, CodeBlock, Skeleton, Markdown.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString } from "../utils.js";

const TEXT_VARIANTS = [
  "small",
  "small-heavy",
  "body",
  "body-heavy",
  "large",
  "large-heavy",
  "heading",
  "title",
] as const;

export const TextContent: ComponentSpec = {
  name: "TextContent",
  description: "Renders plain text with a typographic variant.",
  props: [
    { name: "value", type: "string" },
    { name: "variant", type: "string", optional: true, enum: TEXT_VARIANTS },
    { name: "color", type: "string", optional: true, enum: ["default", "muted", "primary", "success", "warning", "danger"] },
  ],
  render: (_node, props) => {
    const variant = asString(props.variant, "body");
    return el("span", {
      class: "rui-text",
      "data-variant": variant,
      "data-color": asString(props.color, "default"),
    }, [asString(props.value)]);
  },
};

export const Header: ComponentSpec = {
  name: "Header",
  description: "Page header with title and optional subtitle.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("header", { class: "rui-header" });
    root.append(el("h2", { class: "rui-header-title" }, [asString(props.title)]));
    const sub = asString(props.subtitle);
    if (sub) root.append(el("p", { class: "rui-header-subtitle" }, [sub]));
    return root;
  },
};

export const Image: ComponentSpec = {
  name: "Image",
  description: "Inline image.",
  props: [
    { name: "src", type: "string" },
    { name: "alt", type: "string", optional: true },
    { name: "caption", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const wrapper = el("figure", { class: "rui-image" });
    wrapper.append(el("img", {
      src: asString(props.src),
      alt: asString(props.alt),
      loading: "lazy",
    }));
    const cap = asString(props.caption);
    if (cap) wrapper.append(el("figcaption", { class: "rui-image-caption" }, [cap]));
    return wrapper;
  },
};

export const Link: ComponentSpec = {
  name: "Link",
  description: "Anchor link.",
  props: [
    { name: "label", type: "string" },
    { name: "href", type: "string" },
    { name: "external", type: "boolean", optional: true },
  ],
  render: (_node, props) => {
    return el("a", {
      class: "rui-link",
      href: asString(props.href, "#"),
      target: asString(props.external) === "true" ? "_blank" : null,
      rel: asString(props.external) === "true" ? "noopener" : null,
    }, [asString(props.label)]);
  },
};

const BADGE_VARIANTS = ["neutral", "primary", "success", "warning", "danger", "info"] as const;

export const Badge: ComponentSpec = {
  name: "Badge",
  description: "Small status badge.",
  props: [
    { name: "label", type: "string" },
    { name: "variant", type: "string", optional: true, enum: BADGE_VARIANTS },
  ],
  render: (_node, props) =>
    el("span", {
      class: "rui-badge",
      "data-variant": asString(props.variant, "neutral"),
    }, [asString(props.label)]),
};

export const Tag: ComponentSpec = {
  name: "Tag",
  description: "Inline tag/pill.",
  props: [
    { name: "label", type: "string" },
    { name: "icon", type: "string", optional: true, description: "Optional emoji or symbol" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "variant", type: "string", optional: true, enum: BADGE_VARIANTS },
  ],
  render: (_node, props) => {
    const tag = el("span", {
      class: "rui-tag",
      "data-size": asString(props.size, "md"),
      "data-variant": asString(props.variant, "neutral"),
    });
    const icon = asString(props.icon);
    if (icon) tag.append(el("span", { class: "rui-tag-icon" }, [icon]));
    tag.append(el("span", { class: "rui-tag-label" }, [asString(props.label)]));
    return tag;
  },
};

export const TagBlock: ComponentSpec = {
  name: "TagBlock",
  description: "Cluster of tag pills rendered from an array of strings.",
  props: [
    { name: "tags", type: "string[]", description: "Array of tag labels" },
    { name: "variant", type: "string", optional: true, enum: BADGE_VARIANTS },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-tag-block" });
    const variant = asString(props.variant, "neutral");
    const size = asString(props.size, "md");
    for (const raw of asArray(props.tags)) {
      const label = asString(raw);
      if (!label) continue;
      root.append(el("span", {
        class: "rui-tag",
        "data-size": size,
        "data-variant": variant,
      }, [el("span", { class: "rui-tag-label" }, [label])]));
    }
    return root;
  },
};

export const Alert: ComponentSpec = {
  name: "Alert",
  description: "Banner-style alert message.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true },
    { name: "variant", type: "string", optional: true, enum: ["info", "success", "warning", "danger"] },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-alert", "data-variant": asString(props.variant, "info") });
    root.append(el("div", { class: "rui-alert-title" }, [asString(props.title)]));
    const msg = asString(props.message);
    if (msg) root.append(el("div", { class: "rui-alert-message" }, [msg]));
    return root;
  },
};

const CALLOUT_VARIANTS = ["neutral", "info", "success", "warning", "danger", "error"] as const;

export const Callout: ComponentSpec = {
  name: "Callout",
  description: "Highlighted callout banner with variant, title, and description.",
  props: [
    { name: "variant", type: "string", optional: true, enum: CALLOUT_VARIANTS },
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Optional emoji or symbol" },
  ],
  render: (_node, props) => {
    const variant = asString(props.variant, "info");
    const root = el("div", { class: "rui-callout", "data-variant": variant });
    const icon = asString(props.icon) || defaultCalloutIcon(variant);
    if (icon) root.append(el("span", { class: "rui-callout-icon" }, [icon]));
    const body = el("div", { class: "rui-callout-body" });
    body.append(el("div", { class: "rui-callout-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) body.append(el("div", { class: "rui-callout-description" }, [desc]));
    root.append(body);
    return root;
  },
};

export const CodeBlock: ComponentSpec = {
  name: "CodeBlock",
  description: "Read-only code block with a language label and copy affordance.",
  props: [
    { name: "language", type: "string", optional: true, description: "Display label (e.g. ts, bash)" },
    { name: "codeString", type: "string", description: "Raw source text" },
  ],
  render: (_node, props) => {
    const language = asString(props.language);
    const code = asString(props.codeString);
    const root = el("div", { class: "rui-code-block" });
    if (language) root.append(el("div", { class: "rui-code-block-language" }, [language]));
    root.append(el("pre", { class: "rui-code-block-pre" }, [
      el("code", {}, [code]),
    ]));
    return root;
  },
};

function defaultCalloutIcon(variant: string): string {
  switch (variant) {
    case "success": return "✓";
    case "warning": return "!";
    case "danger":
    case "error": return "✕";
    case "info": return "i";
    default: return "";
  }
}

export const Skeleton: ComponentSpec = {
  name: "Skeleton",
  description: "Loading placeholder.",
  props: [
    { name: "lines", type: "number", optional: true },
    { name: "height", type: "number", optional: true },
  ],
  render: (_node, props) => {
    const lines = Math.max(1, Math.floor(Number(props.lines ?? 3)));
    const root = el("div", { class: "rui-skeleton" });
    for (let i = 0; i < lines; i += 1) {
      root.append(el("div", { class: "rui-skeleton-line", style: `height:${Number(props.height ?? 12)}px` }));
    }
    return root;
  },
};

export const Markdown: ComponentSpec = {
  name: "Markdown",
  description: "Render a paragraph of markdown-like text. Supports **bold**, *italic*, `code`, and links.",
  props: [{ name: "content", type: "string" }],
  render: (_node, props) => {
    const value = asString(props.content);
    const html = renderMarkdown(value);
    return el("div", { class: "rui-markdown", html });
  },
};

function renderMarkdown(value: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = value.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(escape(line.replace(/^\s*[-*]\s+/, "")))}</li>`);
    } else if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push("");
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${inline(escape(line))}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");

  function inline(s: string): string {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="rui-link" href="$2" target="_blank" rel="noopener">$1</a>');
  }
}
