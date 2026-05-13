/**
 * Content components: TextContent, Header, Image, Link, Badge, Tag, TagBlock,
 * Alert, Callout, CodeBlock, Skeleton, Markdown, Icon.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, renderIcon,
  sanitiseCssLength, sanitiseHref, sanitiseImageSrc,
} from "../utils.js";
import { ICON_SIZES } from "../../icons/index.js";

const ICON_VARIANTS = ["solid", "regular", "brands"] as const;

export const Icon: ComponentSpec = {
  name: "Icon",
  description:
    "Single Font Awesome icon. `name` is the FA name without the `fa-` " +
    "prefix (e.g. `\"house\"`, `\"chart-line\"`). Use `variant` for non-solid " +
    "styles (`regular`/`brands`) or prefix the name (`\"regular:star\"`).",
  props: [
    { name: "name", type: "string", description: "FA name without the fa- prefix" },
    { name: "variant", type: "string", optional: true, enum: ICON_VARIANTS },
    { name: "size", type: "string", optional: true, enum: ICON_SIZES },
  ],
  render: (_node, props) => {
    const name = asString(props.name);
    const variant = asString(props.variant, "");
    const size = asString(props.size, "md");
    const composed = variant ? `${variant}:${name}` : name;
    const node = renderIcon(composed, { size });
    if (node) return node;
    return el("span", { class: "rui-icon", "data-icon-size": size }, [name]);
  },
};


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
    const safeSrc = sanitiseImageSrc(props.src);
    if (safeSrc) {
      wrapper.append(el("img", {
        src: safeSrc,
        alt: asString(props.alt),
        loading: "lazy",
      }));
    } else {
      // Rendering a broken/hostile src is worse than rendering nothing —
      // keep the layout slot but skip the network request.
      wrapper.append(el("div", {
        class: "rui-image-placeholder",
        role: "presentation",
        "aria-hidden": "true",
      }));
    }
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
    const external = asBoolean(props.external);
    // Sanitise the href before it lands on the anchor so a hostile
    // `javascript:` (or `vbscript:` / control-char-bypassed) URL coming from
    // an LLM/tool response cannot execute on click.
    const safeHref = sanitiseHref(props.href, "#");
    return el("a", {
      class: "rui-link",
      href: safeHref,
      target: external ? "_blank" : null,
      // `noreferrer` rounds out `noopener` so the destination cannot read the
      // opener's `document.referrer` either — important for external links.
      rel: external ? "noopener noreferrer" : null,
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
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name (e.g. \"star\")" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "variant", type: "string", optional: true, enum: BADGE_VARIANTS },
  ],
  render: (_node, props) => {
    const tag = el("span", {
      class: "rui-tag",
      "data-size": asString(props.size, "md"),
      "data-variant": asString(props.variant, "neutral"),
    });
    const iconNode = renderIcon(props.icon, { className: "rui-tag-icon" });
    if (iconNode) tag.append(iconNode);
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
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
  ],
  render: (_node, props) => {
    const variant = asString(props.variant, "info");
    const root = el("div", { class: "rui-callout", "data-variant": variant });
    const iconName = asString(props.icon) || defaultCalloutIcon(variant);
    const iconNode = renderIcon(iconName, { className: "rui-callout-icon" });
    if (iconNode) root.append(iconNode);
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
    case "success": return "circle-check";
    case "warning": return "triangle-exclamation";
    case "danger":
    case "error": return "circle-xmark";
    case "info": return "circle-info";
    default: return "circle-info";
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
    // Coerce defensively: `Number(...)` returns NaN for arbitrary objects /
    // hostile strings, which previously surfaced as `height:NaNpx` style.
    const rawLines = Number(props.lines);
    const lines = Math.max(1, Math.min(50, Number.isFinite(rawLines) ? Math.floor(rawLines) : 3));
    const rawHeight = Number(props.height);
    const lineHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.min(200, Math.floor(rawHeight)) : 12;
    const root = el("div", { class: "rui-skeleton" });
    for (let i = 0; i < lines; i += 1) {
      root.append(el("div", { class: "rui-skeleton-line", style: `height:${lineHeight}px` }));
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

export const Container: ComponentSpec = {
  name: "Container",
  description:
    "Centered, max-width content wrapper. Use when a page is wider than " +
    "comfortable reading width — landing pages, marketing sections, long " +
    "documents. Picks a sensible default max-width per size; pass " +
    "`maxWidth` to override with any CSS value.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg", "xl", "full"], description: "sm=640 / md=820 / lg=1040 / xl=1280 / full=100% (default lg)" },
    { name: "maxWidth", type: "string", optional: true, description: "Custom CSS max-width (overrides `size`)" },
    { name: "padding", type: "string", optional: true, enum: ["none", "s", "m", "l"], description: "Horizontal padding (default m)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-container",
      "data-size": asString(props.size, "lg"),
      "data-padding": asString(props.padding, "m"),
      style: props.maxWidth ? `max-width:${sanitiseCssLength(props.maxWidth, "auto")};` : null,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Spacer: ComponentSpec = {
  name: "Spacer",
  description:
    "Explicit space element for fine layout control. By default acts as a " +
    "flex spacer that pushes following content to the far edge (use " +
    "inside `Stack(direction=\"row\")`). Pass `size` to render a fixed " +
    "vertical/horizontal gap instead.",
  props: [
    { name: "size", type: "string", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Fixed gap; omit to flex-grow" },
    { name: "flex", type: "boolean", optional: true, description: "Flex-grow even when size is set (default true when size omitted)" },
  ],
  render: (_node, props) => {
    const size = asString(props.size);
    const flex = props.flex === undefined ? !size : asBoolean(props.flex);
    return el("span", {
      class: "rui-spacer",
      "data-size": size || null,
      "data-flex": flex ? "true" : "false",
      "aria-hidden": "true",
    });
  },
};

export const Quote: ComponentSpec = {
  name: "Quote",
  description:
    "Inline pull-quote with optional citation. Lighter than `Testimonial` " +
    "— use inside articles, blog posts, marketing sections, or anywhere " +
    "you need to highlight a sentence without the full quote/author/role " +
    "+ rating shape.",
  props: [
    { name: "text", type: "string" },
    { name: "cite", type: "string", optional: true, description: "Attribution text shown below the quote" },
    { name: "tone", type: "string", optional: true, enum: ["default", "primary", "success", "warning", "danger", "info"] },
  ],
  render: (_node, props) => {
    const root = el("figure", {
      class: "rui-quote",
      "data-tone": asString(props.tone, "default"),
    });
    root.append(el("blockquote", { class: "rui-quote-text" }, [asString(props.text)]));
    const cite = asString(props.cite);
    if (cite) root.append(el("figcaption", { class: "rui-quote-cite" }, [cite]));
    return root;
  },
};

export const Note: ComponentSpec = {
  name: "Note",
  description:
    "Compact inline note for tips, warnings, footnotes, and helper text. " +
    "Lighter than `Callout` — sits on a tinted background with a leading " +
    "icon. Use inside cards, form sections, and side panels.",
  props: [
    { name: "content", type: "string" },
    { name: "tone", type: "string", optional: true, enum: ["default", "info", "success", "warning", "danger", "tip"] },
    { name: "icon", type: "string", optional: true, description: "Override the default tone-based icon" },
  ],
  render: (_node, props) => {
    const tone = asString(props.tone, "info");
    const root = el("div", { class: "rui-note", "data-tone": tone });
    const iconName = asString(props.icon) || defaultNoteIcon(tone);
    const iconNode = renderIcon(iconName, { className: "rui-note-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("p", { class: "rui-note-text" }, [asString(props.content)]));
    return root;
  },
};

function defaultNoteIcon(tone: string): string {
  switch (tone) {
    case "success": return "circle-check";
    case "warning": return "triangle-exclamation";
    case "danger": return "circle-xmark";
    case "tip": return "lightbulb";
    case "info": return "circle-info";
    default: return "circle-info";
  }
}

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
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, rawHref: string) => {
        const href = sanitizeMarkdownHref(rawHref);
        return `<a class="rui-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });
  }
}

/**
 * Block dangerous URL schemes (`javascript:`, `data:`, `vbscript:`, …) and
 * protocol-relative URLs (`//evil.com/...`) so a tool response embedded
 * inside a Markdown link cannot smuggle script execution or cross-origin
 * navigation into the page. Allow http/https/mailto/tel absolute URLs plus
 * same-origin fragments and root-relative paths.
 */
function sanitizeMarkdownHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "#";
  // Protocol-relative URLs (`//host/path`) inherit the page's scheme and
  // therefore can navigate to a hostile host. Treat them as unsafe.
  if (trimmed.startsWith("//")) return "#";
  // Same-origin fragments / root-relative paths / query-only links are safe.
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("?")) {
    return escapeAttr(trimmed);
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!schemeMatch) return escapeAttr(trimmed);
  const scheme = schemeMatch[1]!.toLowerCase();
  const allowed = new Set(["http", "https", "mailto", "tel"]);
  if (!allowed.has(scheme)) return "#";
  return escapeAttr(trimmed);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
