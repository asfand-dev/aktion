/**
 * Content components: Text, Image, Link, Badge, BadgeList, Callout,
 * CodeBlock, Skeleton, Markdown, Icon, Quote, Container, Spacer, Spinner.
 *
 * `TextContent` is exported as a deprecated alias for `Text` so existing
 * Aktion programs keep rendering — prefer `Text` in new code.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  sanitiseCssLength, sanitiseHref, sanitiseImageSrc,
} from "../utils.js";
import { ICON_SIZES } from "../../icons/index.js";

const ICON_VARIANTS = ["solid", "regular", "brands"] as const;

const SIZE_ENUM = ["xs", "sm", "md", "lg", "xl"] as const;
const TONE_ENUM = ["default", "neutral", "primary", "success", "warning", "danger", "info"] as const;

/**
 * Normalise a legacy size token to the shared `xs|sm|md|lg|xl` vocabulary.
 * Keeps the catalogue self-consistent (suggestion 4.2) while letting old
 * prompts that emit `"small"` / `"normal"` / `"large"` still render.
 */
export function normaliseSize(value: unknown, fallback: string = "md"): string {
  const v = asString(value).trim().toLowerCase();
  if (!v) return fallback;
  if (v === "small") return "sm";
  if (v === "normal") return "md";
  if (v === "large") return "lg";
  if ((SIZE_ENUM as readonly string[]).includes(v)) return v;
  return fallback;
}

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

/**
 * Sanitise an inline CSS declaration string before it lands on a DOM
 * element's `style` attribute. The `<span>` style attribute can't host
 * `<style>` injection, but we still strip the legacy attack vectors
 * (IE-only `expression()`, `javascript:` URLs, `behavior:`, `@import`)
 * and any angle brackets defensively. Returns an empty string when the
 * input is rejected so callers can drop the attribute entirely.
 */
function sanitiseInlineStyle(input: unknown): string {
  const raw = asString(input).trim();
  if (!raw) return "";
  if (/[<>]/.test(raw)) return "";
  if (/\bexpression\s*\(|\bjavascript\s*:|\bbehavior\s*:|@import\b/i.test(raw)) {
    return "";
  }
  return raw;
}

const TEXT_PROPS = [
  { name: "value", type: "string" },
  { name: "variant", type: "string", optional: true, enum: TEXT_VARIANTS },
  { name: "tone", type: "string", optional: true, enum: ["default", "muted", "primary", "success", "warning", "danger"], description: "Visual accent" },
  {
    name: "style",
    type: "string",
    optional: true,
    description: "Inline CSS declarations applied to the rendered element (e.g. \"font-size: 16px; font-weight: bold; color: #000;\").",
  },
] as const;

const renderText: ComponentSpec["render"] = (_node, props) => {
  const variant = asString(props.variant, "body");
  const tone = asString(props.tone, "default");
  const style = sanitiseInlineStyle(props.style);
  return el("span", {
    class: "rui-text",
    "data-variant": variant,
    "data-color": tone,
    style: style || null,
  }, [asString(props.value)]);
};

export const Text: ComponentSpec = {
  name: "Text",
  description:
    "Renders plain text with a typographic variant. Optional `style` prop " +
    "accepts a CSS declaration string (e.g. \"font-size: 16px; color: #000;\") " +
    "applied directly to the rendered element.",
  props: TEXT_PROPS,
  render: renderText,
};

/**
 * Deprecated alias for `Text`. Kept registered so existing Aktion
 * programs that still emit `TextContent(...)` keep rendering. New code
 * should use `Text(...)`.
 */
export const TextContent: ComponentSpec = {
  name: "TextContent",
  description: "Deprecated alias for `Text`. Prefer `Text(...)` — both render identically.",
  props: TEXT_PROPS,
  render: renderText,
};

const IMAGE_FIT = ["cover", "contain", "fill", "none", "scale-down"] as const;

export const Image: ComponentSpec = {
  name: "Image",
  description:
    "Inline image. `ratio` constrains the box to a fixed aspect ratio (e.g. " +
    "`16:9`, `1:1`) so callers do not need an outer `AspectRatio`. `fit` " +
    "controls how the image fills that box. When `src` is missing or " +
    "unsafe the component renders a placeholder (or `fallback` text/icon).",
  props: [
    { name: "src", type: "string" },
    { name: "alt", type: "string", optional: true },
    { name: "caption", type: "string", optional: true },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio shorthand (e.g. `16:9`, `1:1`, `4:3`)" },
    { name: "fit", type: "string", optional: true, enum: IMAGE_FIT, description: "object-fit value (default `cover`)" },
    { name: "fallback", type: "string", optional: true, description: "Text label or Font Awesome icon shown when src is missing/unsafe" },
  ],
  render: (_node, props) => {
    const wrapper = el("figure", {
      class: "rui-image",
      "data-fit": asString(props.fit, "cover"),
      style: props.ratio ? `aspect-ratio:${parseImageRatio(asString(props.ratio))};` : null,
    });
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
      const placeholder = el("div", {
        class: "rui-image-placeholder",
        role: "presentation",
        "aria-hidden": "true",
      });
      const fallback = asString(props.fallback);
      if (fallback) {
        const iconNode = renderIcon(fallback, { className: "rui-image-fallback-icon" });
        if (iconNode) placeholder.append(iconNode);
        else placeholder.append(el("span", { class: "rui-image-fallback-text" }, [fallback]));
      }
      wrapper.append(placeholder);
    }
    const cap = asString(props.caption);
    if (cap) wrapper.append(el("figcaption", { class: "rui-image-caption" }, [cap]));
    return wrapper;
  },
};

function parseImageRatio(input: string): string {
  if (!input) return "auto";
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "auto";
}

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
  description:
    "Small pill-style tag for status, counts, categories. Accepts an " +
    "optional leading `icon` and a `size`.",
  props: [
    { name: "label", type: "string", positional: true },
    { name: "tone", type: "string", optional: true, enum: BADGE_VARIANTS, aliases: ["variant"], description: "Visual tone" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name (e.g. \"star\")" },
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM },
  ],
  render: (_node, props) => {
    const variant = asString(props.tone, "neutral");
    const size = normaliseSize(props.size, "md");
    const root = el("span", {
      class: "rui-badge",
      "data-variant": variant,
      "data-size": size,
    });
    const iconNode = renderIcon(props.icon, { className: "rui-badge-icon" });
    if (iconNode) root.append(iconNode);
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-badge-label" }, [label]));
    return root;
  },
};

/**
 * `BadgeList` renders an array of string labels as a row of Badge pills.
 * Replaces the legacy `TagBlock` component.
 */
export const BadgeList: ComponentSpec = {
  name: "BadgeList",
  description: "Cluster of Badge pills rendered from an array of strings.",
  props: [
    { name: "labels", type: "string[]", positional: true, description: "Array of badge labels" },
    { name: "tone", type: "string", optional: true, enum: BADGE_VARIANTS, aliases: ["variant"] },
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM },
  ],
  render: (_node, props) => {
    const variant = asString(props.tone, "neutral");
    const size = normaliseSize(props.size, "md");
    const root = el("div", { class: "rui-badge-list" });
    for (const raw of asArray(props.labels)) {
      const label = asString(raw);
      if (!label) continue;
      const pill = el("span", {
        class: "rui-badge",
        "data-variant": variant,
        "data-size": size,
      });
      pill.append(el("span", { class: "rui-badge-label" }, [label]));
      root.append(pill);
    }
    return root;
  },
};

const CALLOUT_VARIANTS = ["neutral", "info", "success", "warning", "danger", "error"] as const;

export const Callout: ComponentSpec = {
  name: "Callout",
  description:
    "Highlighted callout banner with variant, title, description, and " +
    "leading icon. Pass `compact: true` for a one-line inline-note rendering.",
  props: [
    { name: "tone", type: "string", optional: true, enum: CALLOUT_VARIANTS, aliases: ["variant"] },
    { name: "title", type: "string", positional: true, required: true },
    { name: "description", type: "string", optional: true, aliases: ["text"], description: "Body text" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
    { name: "compact", type: "boolean", optional: true, description: "Render with the dense, one-line note shape." },
  ],
  render: (_node, props) => {
    const variant = asString(props.tone, "info");
    const compact = asBoolean(props.compact);
    const root = el("div", {
      class: "rui-callout",
      "data-variant": variant,
      "data-compact": compact ? "true" : "false",
    });
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
  description:
    "Read-only code block with a language label and a copy-to-clipboard " +
    "button. Pass `showLineNumbers=true` to render a gutter; `highlightLines` " +
    "accepts a string like `\"3-5,8\"` to emphasise specific lines.",
  props: [
    { name: "language", type: "string", optional: true, description: "Display label (e.g. ts, bash)" },
    { name: "codeString", type: "string", positional: true, required: true, aliases: ["code"], description: "Raw source text" },
    { name: "showLineNumbers", type: "boolean", optional: true, description: "Render a left-side line-number gutter" },
    { name: "highlightLines", type: "string", optional: true, aliases: ["highlight"], description: "Highlight ranges, e.g. \"3-5,8\"" },
    { name: "copy", type: "boolean", optional: true, description: "Show the copy-to-clipboard button (default true)" },
  ],
  render: (_node, props) => {
    const language = asString(props.language);
    const code = asString(props.codeString);
    const showLineNumbers = asBoolean(props.showLineNumbers);
    const highlights = parseLineRanges(asString(props.highlightLines));
    const showCopy = props.copy === undefined ? true : asBoolean(props.copy);
    const root = el("div", { class: "rui-code-block" });

    if (language || showCopy) {
      const head = el("div", { class: "rui-code-block-head" });
      if (language) head.append(el("span", { class: "rui-code-block-language" }, [language]));
      if (showCopy) {
      const copyBtn = el("button", {
        type: "button",
        class: "rui-code-block-copy",
        "aria-label": "Copy code",
        title: "Copy",
      });
      const copyIcon = renderIcon("copy", { className: "rui-code-block-copy-icon" });
      if (copyIcon) copyBtn.append(copyIcon);
      copyBtn.append(el("span", { class: "rui-code-block-copy-label" }, ["Copy"]));
      copyBtn.onclick = (event) => {
        const origin = (event.currentTarget ?? event.target) as HTMLButtonElement;
        // Resolve the live code from the on-page DOM so this still works
        // after the morph reconciler keeps the previous element.
        const live = origin.closest(".rui-code-block")?.querySelector("code");
        const text = live?.textContent ?? code;
        const nav = (typeof navigator !== "undefined") ? navigator as Navigator & { clipboard?: { writeText?: (t: string) => Promise<void> } } : null;
        const clipboard = nav?.clipboard;
        if (clipboard?.writeText) {
          clipboard.writeText(text).catch(() => { /* user denied / non-secure */ });
        }
        const label = origin.querySelector(".rui-code-block-copy-label");
        if (label) {
          const original = label.textContent ?? "Copy";
          label.textContent = "Copied";
          setTimeout(() => { label.textContent = original; }, 1500);
        }
      };
      head.append(copyBtn);
      }
      root.append(head);
    }

    const pre = el("pre", { class: "rui-code-block-pre", "data-line-numbers": showLineNumbers ? "true" : "false" });
    if (showLineNumbers || highlights.size > 0) {
      const lines = code.split(/\r?\n/);
      const codeEl = el("code", {});
      lines.forEach((lineText, idx) => {
        const lineNumber = idx + 1;
        const line = el("span", {
          class: "rui-code-block-line",
          "data-line": String(lineNumber),
          "data-highlight": highlights.has(lineNumber) ? "true" : null,
        });
        if (showLineNumbers) {
          line.append(el("span", { class: "rui-code-block-gutter" }, [String(lineNumber)]));
        }
        line.append(el("span", { class: "rui-code-block-code" }, [lineText]));
        codeEl.append(line);
      });
      pre.append(codeEl);
    } else {
      pre.append(el("code", {}, [code]));
    }
    root.append(pre);
    return root;
  },
};

function parseLineRanges(input: string): Set<number> {
  const out = new Set<number>();
  if (!input) return out;
  for (const segment of input.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const parts = trimmed.split("-").map((s) => Number(s.trim()));
      const a = parts[0] ?? NaN;
      const b = parts[1] ?? NaN;
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
        for (let i = a; i <= b; i += 1) out.add(i);
      }
    } else {
      const n = Number(trimmed);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return out;
}

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

const SKELETON_VARIANTS = ["paragraph", "card", "table-row", "avatar", "image"] as const;
const SKELETON_SHAPES = ["rect", "circle"] as const;

export const Skeleton: ComponentSpec = {
  name: "Skeleton",
  description:
    "Loading placeholder. Pass a `variant` for common shapes — `paragraph` " +
    "(default), `card`, `table-row`, `avatar`, `image` — or use `shape` / " +
    "`width` / `height` to build a custom one. All variants use a shimmer " +
    "animation that respects `prefers-reduced-motion`.",
  props: [
    { name: "variant", type: "string", optional: true, enum: SKELETON_VARIANTS },
    { name: "lines", type: "number", optional: true, aliases: ["count"], description: "Lines for the `paragraph` variant (default 3)" },
    { name: "height", type: "number | string", optional: true, description: "Line height in px (paragraph) or CSS height for custom shape" },
    { name: "shape", type: "string", optional: true, enum: SKELETON_SHAPES, description: "Force a primitive shape (rect/circle)" },
    { name: "width", type: "string", optional: true, description: "CSS width for shape-only skeletons" },
  ],
  render: (_node, props) => {
    const variant = asString(props.variant);
    const shape = asString(props.shape);
    if (shape) return renderShapeSkeleton(shape, props);
    if (variant && variant !== "paragraph") return renderVariantSkeleton(variant, props);

    const rawLines = Number(props.lines);
    const lines = Math.max(1, Math.min(50, Number.isFinite(rawLines) ? Math.floor(rawLines) : 3));
    const rawHeight = Number(props.height);
    const lineHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.min(200, Math.floor(rawHeight)) : 12;
    const root = el("div", { class: "rui-skeleton", "data-variant": "paragraph" });
    for (let i = 0; i < lines; i += 1) {
      root.append(el("div", { class: "rui-skeleton-line", style: `height:${lineHeight}px` }));
    }
    return root;
  },
};

function renderShapeSkeleton(shape: string, props: Record<string, unknown>): HTMLElement {
  const width = sanitiseCssLength(asString(props.width), "100%");
  const heightInput = asString(props.height);
  const height = heightInput
    ? sanitiseCssLength(heightInput, "16px")
    : (shape === "circle" ? width : "16px");
  return el("div", {
    class: "rui-skeleton",
    "data-variant": "shape",
    "data-shape": shape === "circle" ? "circle" : "rect",
    style: `width:${width};height:${height};`,
  });
}

function renderVariantSkeleton(variant: string, props: Record<string, unknown>): HTMLElement {
  const root = el("div", { class: "rui-skeleton", "data-variant": variant });
  switch (variant) {
    case "avatar": {
      const size = sanitiseCssLength(asString(props.width), "40px");
      root.append(el("div", {
        class: "rui-skeleton-shape",
        "data-shape": "circle",
        style: `width:${size};height:${size};`,
      }));
      return root;
    }
    case "image": {
      const width = sanitiseCssLength(asString(props.width), "100%");
      const height = sanitiseCssLength(asString(props.height), "160px");
      root.append(el("div", {
        class: "rui-skeleton-shape",
        "data-shape": "rect",
        style: `width:${width};height:${height};`,
      }));
      return root;
    }
    case "card": {
      root.append(el("div", { class: "rui-skeleton-shape", "data-shape": "rect", style: "width:100%;height:120px;" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:14px;width:70%;" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:12px;width:90%;" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:12px;width:60%;" }));
      return root;
    }
    case "table-row": {
      const cells = Math.max(1, Math.min(8, Math.floor(Number(props.lines ?? 4))));
      const row = el("div", { class: "rui-skeleton-row" });
      for (let i = 0; i < cells; i += 1) {
        row.append(el("div", { class: "rui-skeleton-line", style: "height:12px;flex:1;" }));
      }
      root.append(row);
      return root;
    }
    default:
      return root;
  }
}

export const Markdown: ComponentSpec = {
  name: "Markdown",
  description:
    "Render markdown-flavoured text. Supports **bold**, *italic*, `code`, " +
    "headings (`#`/`##`/`###`), blockquotes (`>`), bullet (`-`/`*`) and " +
    "numbered (`1.`) lists, fenced code blocks (```), images " +
    "(`![alt](src)`), inline links, and auto-linked bare URLs. Multi-line " +
    "paragraphs collapse into `<p>` blocks.",
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

export const Spinner: ComponentSpec = {
  name: "Spinner",
  description:
    "Indeterminate inline loader. Use for tiny loading states inside " +
    "buttons, toolbars, table cells, or chat bubbles where `Skeleton` " +
    "and `Progress(indeterminate=true)` are too heavy. Pass `label` to " +
    "render an inline caption beside the spinner (also announced via " +
    "`aria-label`).",
  props: [
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM, description: "Default `md`" },
    { name: "label", type: "string", optional: true, description: "Caption rendered beside the spinner (also announced)" },
    { name: "tone", type: "string", optional: true, enum: TONE_ENUM, description: "Visual accent (default `primary`)" },
  ],
  render: (_node, props) => {
    const size = normaliseSize(props.size, "md");
    const tone = asString(props.tone, "primary");
    const label = asString(props.label);
    const root = el("span", {
      class: "rui-spinner",
      "data-size": size,
      "data-tone": tone,
      role: "status",
      "aria-live": "polite",
      "aria-label": label || "Loading",
    });
    root.append(el("span", { class: "rui-spinner-ring", "aria-hidden": "true" }));
    if (label) root.append(el("span", { class: "rui-spinner-label" }, [label]));
    return root;
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
    { name: "cite", type: "string", optional: true, aliases: ["attribution", "author"], description: "Attribution text shown below the quote" },
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

/* ------------------------------------------------------------------------ *
 * Markdown renderer
 *
 * Hand-rolled because we ship inside a Shadow DOM with no peer deps. The
 * parser handles:
 *
 *   - Headings (#, ##, ###)
 *   - Blockquotes (>)
 *   - Fenced code blocks (```lang)
 *   - Bullet lists (`-` / `*`) and numbered lists (`1.`)
 *   - Inline **bold**, *italic*, `code`
 *   - Links `[label](href)` (sanitised) and images `![alt](src)` (sanitised)
 *   - Auto-linked bare HTTP/HTTPS URLs
 *
 * All HTML output is escape-encoded so an LLM cannot smuggle raw markup
 * past the parser.
 * ------------------------------------------------------------------------ */
function renderMarkdown(value: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = value.split(/\r?\n/);
  const out: string[] = [];

  // List / quote state so we can close them on a context change.
  let listMode: "ul" | "ol" | null = null;
  let inQuote = false;
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];

  const closeList = () => {
    if (listMode) {
      out.push(listMode === "ul" ? "</ul>" : "</ol>");
      listMode = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) { out.push("</blockquote>"); inQuote = false; }
  };
  const flushCode = () => {
    const lang = codeLang ? ` data-language="${escape(codeLang)}"` : "";
    out.push(`<pre class="rui-markdown-code"${lang}><code>${escape(codeBuf.join("\n"))}</code></pre>`);
    codeBuf = [];
    codeLang = "";
    inCode = false;
  };

  for (const rawLine of lines) {
    // Fenced code blocks must be detected before any inline transform so
    // their content is preserved verbatim (no `**bold**` interpretation).
    const fenceMatch = /^```\s*(.*)$/.exec(rawLine.trim());
    if (inCode) {
      if (fenceMatch) {
        flushCode();
        continue;
      }
      codeBuf.push(rawLine);
      continue;
    }
    if (fenceMatch) {
      closeList(); closeQuote();
      inCode = true;
      codeLang = fenceMatch[1] ?? "";
      continue;
    }

    const heading = /^\s*(#{1,3})\s+(.+)$/.exec(rawLine);
    if (heading) {
      closeList(); closeQuote();
      const level = heading[1]!.length;
      out.push(`<h${level} class="rui-markdown-h${level}">${inline(escape(heading[2]!))}</h${level}>`);
      continue;
    }

    const quoteMatch = /^\s*>\s?(.*)$/.exec(rawLine);
    if (quoteMatch) {
      closeList();
      if (!inQuote) { out.push("<blockquote class=\"rui-markdown-quote\">"); inQuote = true; }
      out.push(`<p>${inline(escape(quoteMatch[1] ?? ""))}</p>`);
      continue;
    } else if (inQuote && rawLine.trim() !== "") {
      // Non-empty non-quote line ends a quote block.
      closeQuote();
    }

    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(rawLine);
    if (ulMatch) {
      closeQuote();
      if (listMode !== "ul") { closeList(); out.push("<ul>"); listMode = "ul"; }
      out.push(`<li>${inline(escape(ulMatch[1] ?? ""))}</li>`);
      continue;
    }

    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(rawLine);
    if (olMatch) {
      closeQuote();
      if (listMode !== "ol") { closeList(); out.push("<ol>"); listMode = "ol"; }
      out.push(`<li>${inline(escape(olMatch[1] ?? ""))}</li>`);
      continue;
    }

    if (rawLine.trim() === "") {
      closeList(); closeQuote();
      continue;
    }

    closeList(); closeQuote();
    out.push(`<p>${inline(escape(rawLine))}</p>`);
  }

  if (inCode) flushCode();
  closeList();
  closeQuote();
  return out.join("");

  function inline(s: string): string {
    let result = s
      // Images first so the ![alt](src) regex does not match inside link labels.
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, rawSrc: string) => {
        const src = sanitiseImageSrc(rawSrc);
        if (!src) return `<span class="rui-markdown-image-fallback">${alt}</span>`;
        return `<img class="rui-markdown-image" src="${escapeAttr(src)}" alt="${alt}" loading="lazy">`;
      })
      // Inline code — careful not to match across line boundaries.
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, rawHref: string) => {
        const href = sanitizeMarkdownHref(rawHref);
        return `<a class="rui-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });
    // Auto-link bare http(s) URLs. We only match URLs that are not already
    // wrapped in an anchor or attribute — heuristic check via a negative
    // lookbehind on `"` (attribute) or `>` (already inside a tag).
    result = result.replace(
      /(?<![="'>])\bhttps?:\/\/[a-zA-Z0-9._~:/?#@!$&'()*+,;=%\-]+/g,
      (url) => {
        const safe = sanitizeMarkdownHref(url);
        return `<a class="rui-link" href="${safe}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      },
    );
    return result;
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

// `asNumber` is re-exported here so consumers that wanted it for the old
// helper shape keep working without changing imports (kept for clarity).
export { asNumber };
