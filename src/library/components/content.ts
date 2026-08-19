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
  sanitiseCssLength, sanitiseImageSrc, SPACING_TOKENS, normalizeSpacingToken,
  canonicalSizeToken,
} from "../utils.js";
import { ICON_SIZES, hasCustomIcon, resolveIconClasses } from "../../icons/index.js";
import { highlightLine, isHighlightable } from "../highlight.js";
import { setSanitisedHtml } from "../html-sanitizer.js";

/** Build a line's content as highlighted token spans (VIII.3). */
function appendHighlightedLine(
  container: HTMLElement,
  lineText: string,
  lang: string,
  state: { inBlockComment: boolean },
): void {
  const tokens = highlightLine(lineText, lang, state);
  for (const tok of tokens) {
    if (tok.cls) container.append(el("span", { class: `rui-hl-${tok.cls}` }, [tok.text]));
    else container.append(document.createTextNode(tok.text));
  }
}

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
  // Delegate to the single shared alias map rather than repeating a subset of
  // it. This function used to handle only `small`/`normal`/`large`, so the older
  // single-letter dialect resolved differently depending on which helper a
  // component happened to use: `canonicalSizeToken("s")` yields "sm", while this
  // function saw "s", found it absent from SIZE_ENUM, and returned the "md"
  // fallback. The same `size: "s"` therefore rendered small in some components
  // and medium in others.
  const canonical = canonicalSizeToken(v);
  if ((SIZE_ENUM as readonly string[]).includes(canonical)) return canonical;
  return fallback;
}

/**
 * True when a value is a single Unicode codepoint — i.e. plausibly a glyph the
 * author meant to render literally (`"✓"`, `"→"`), as opposed to a word.
 */
function isSingleGlyph(value: string): boolean {
  return Array.from(value.trim()).length === 1;
}

export const Icon: ComponentSpec = {
  name: "Icon",
  description:
    "Single Font Awesome icon. `name` is the FA name without the `fa-` " +
    "prefix (e.g. `\"house\"`, `\"chart-line\"`). Use `variant` for non-solid " +
    "styles (`regular`/`brands`) or prefix the name (`\"regular:star\"`). " +
    "`color` accepts any CSS colour (`\"#00ff00\"`, `\"tomato\"`, " +
    "`\"var(--rui-color-primary)\"`). Icons are decorative (hidden from " +
    "screen readers) by default — pass `label` when the glyph carries the " +
    "only meaning in its slot (a tick meaning \"verified\", a padlock next to " +
    "a plan name) and it becomes an announced `role=\"img\"`. `title` adds a " +
    "native hover tooltip.",
  props: [
    { name: "name", type: "string", description: "FA name without the fa- prefix" },
    { name: "variant", type: "string", optional: true, aliases: ["tone"], enum: ICON_VARIANTS },
    { name: "size", type: "string", optional: true, enum: ICON_SIZES },
    { name: "color", type: "string", optional: true, description: "CSS colour applied to the glyph (hex, named, rgb()/hsl(), or var(--token))" },
    { name: "label", type: "string", optional: true, aliases: ["ariaLabel", "alt"], description: "Accessible name — set when the icon is not decorative; announced as role=\"img\"" },
    { name: "title", type: "string", optional: true, description: "Native hover tooltip (also used as the accessible name when `label` is omitted)" },
  ],
  render: (_node, props) => {
    const name = asString(props.name);
    const variant = asString(props.variant, "");
    const size = asString(props.size, "md");
    const color = asString(props.color, "");
    const composed = variant ? `${variant}:${name}` : name;
    const label = asString(props.label).trim();
    const title = asString(props.title).trim();
    // `renderIcon` falls back to printing the raw string when a name resolves
    // to no glyph, which is deliberate for legacy emoji input. A name of more
    // than one codepoint is not a glyph though — it is a guess ("pfeil-rechts",
    // "café") — and printing it leaks the guess into the UI where a symbol was
    // expected. Degrade to an empty slot instead.
    const resolved = hasCustomIcon(composed) || resolveIconClasses(composed).length > 0;
    if (name && !resolved && !isSingleGlyph(name)) {
      return el("i", {
        class: "rui-icon rui-icon-unresolved",
        "data-icon-size": size,
        "aria-hidden": "true",
      });
    }
    const node = renderIcon(composed, { size, color });
    if (node) {
      const accessibleName = label || title;
      if (accessibleName) {
        // `renderIcon` hard-codes `aria-hidden` for the decorative case, so an
        // announced icon has to undo it here — `aria-label` on a hidden node is
        // still invisible to assistive tech.
        node.removeAttribute("aria-hidden");
        node.setAttribute("role", "img");
        node.setAttribute("aria-label", accessibleName);
      } else if (!node.hasAttribute("aria-hidden")) {
        // The emoji/raw-text fallback has no aria-hidden of its own.
        node.setAttribute("aria-hidden", "true");
      }
      if (title) node.setAttribute("title", title);
      return node;
    }
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

/**
 * Elements `Text` may render as. `span` stays the default so existing programs
 * keep their inline layout; the heading tags are what put a section title into
 * the screen reader's heading list.
 */
const TEXT_TAGS = ["span", "p", "div", "h1", "h2", "h3", "h4", "h5", "h6"] as const;

/**
 * Implicit heading level for the two heading-shaped variants. They are styled
 * like headings (heading font, block display) but render as a `<span>`, so
 * without this a page whose section titles are all `Text(variant="heading")`
 * has no document outline at all. `as` overrides it with a real element.
 */
const VARIANT_ARIA_LEVEL: Record<string, string> = { title: "2", heading: "3" };

const TEXT_PROPS = [
  { name: "value", type: "string" },
  { name: "variant", type: "string", optional: true, enum: TEXT_VARIANTS },
  { name: "tone", type: "string", optional: true, enum: ["default", "muted", "primary", "success", "warning", "danger"], description: "Visual accent" },
  { name: "align", type: "string", optional: true, enum: ["left", "center", "right"], description: "Horizontal text alignment — the text becomes its own block-level line" },
  {
    name: "style",
    type: "string",
    optional: true,
    description: "Inline CSS declarations applied to the rendered element (e.g. \"font-size: 16px; font-weight: bold; color: #000;\").",
  },
  { name: "as", type: "string", optional: true, enum: TEXT_TAGS, aliases: ["tag"], description: "Element to render (default `span`). Use `h1`..`h6` so a heading-styled variant is a real heading." },
  { name: "truncate", type: "boolean", optional: true, description: "Clip to a single line with a trailing ellipsis" },
  { name: "lines", type: "number", optional: true, aliases: ["clamp"], description: "Clamp to N lines with a trailing ellipsis (implies `truncate`)" },
] as const;

/** Build the clamp declarations for `truncate` / `lines`. */
function textClampStyle(truncate: boolean, lines: number): string {
  if (lines > 1) {
    // `-webkit-line-clamp` is the only cross-browser multi-line clamp; the
    // -webkit- box model is required with it even in non-WebKit engines.
    return `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden`;
  }
  if (truncate || lines === 1) {
    return "display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  }
  return "";
}

const renderText: ComponentSpec["render"] = (_node, props) => {
  const variant = asString(props.variant, "body");
  const tone = asString(props.tone, "default");
  const align = asString(props.align);
  const authorStyle = sanitiseInlineStyle(props.style);
  const rawLines = Number(props.lines);
  const clampLines = Number.isFinite(rawLines) && rawLines > 0 ? Math.min(20, Math.floor(rawLines)) : 0;
  const clamp = textClampStyle(asBoolean(props.truncate), clampLines);
  // Author style last so an explicit declaration still wins over the clamp.
  const style = [clamp, authorStyle].filter(Boolean).join(";");
  const requested = asString(props.as).trim().toLowerCase();
  const tag = (TEXT_TAGS as readonly string[]).includes(requested)
    ? (requested as (typeof TEXT_TAGS)[number])
    : "span";
  const level = tag === "span" || tag === "p" || tag === "div" ? VARIANT_ARIA_LEVEL[variant] : undefined;
  return el(tag, {
    class: "rui-text",
    "data-variant": variant,
    "data-color": tone,
    "data-align": align || null,
    // A heading-styled variant on a generic element still needs heading
    // semantics, or rotor/heading navigation finds nothing.
    role: level ? "heading" : null,
    "aria-level": level ?? null,
    style: style || null,
  }, [asString(props.value)]);
};

export const Text: ComponentSpec = {
  name: "Text",
  description:
    "Renders plain text with a typographic variant. `align` " +
    "(left|center|right) sets the horizontal alignment (the text renders as " +
    "its own block). `as` picks the element — pass `h1`..`h6` for real " +
    "heading semantics (or use `Heading`); the `heading`/`title` variants " +
    "otherwise get `role=\"heading\"` so they still appear in the document " +
    "outline. `truncate` clips to one line with an ellipsis and `lines: N` " +
    "clamps to N lines. Optional `style` prop accepts a CSS declaration " +
    "string (e.g. \"font-size: 16px; color: #000;\") applied directly to the " +
    "rendered element.",
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
    "`16:9`, `1:1`) so callers do not need an outer `AspectRatio` (and it " +
    "reserves space to avoid layout shift). `fit` controls how the image " +
    "fills that box. `placeholder: \"blur\"` fades the image in once loaded; " +
    "`sizes`/`srcset` enable responsive loading; `loading: \"eager\"` opts out " +
    "of lazy-loading. When `src` is missing/unsafe or fails to load it shows " +
    "the `fallback` text/icon.",
  props: [
    { name: "src", type: "string" },
    { name: "alt", type: "string", optional: true },
    { name: "caption", type: "string", optional: true },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio shorthand (e.g. `16:9`, `1:1`, `4:3`)" },
    { name: "fit", type: "string", optional: true, enum: IMAGE_FIT, description: "object-fit value (default `cover`)" },
    { name: "fallback", type: "string", optional: true, description: "Text label or Font Awesome icon shown when src is missing/unsafe/errored" },
    { name: "placeholder", type: "string", optional: true, enum: ["blur", "none"], description: "`blur` fades the image in on load" },
    { name: "loading", type: "string", optional: true, enum: ["lazy", "eager"], description: "Native loading strategy (default lazy)" },
    { name: "sizes", type: "string", optional: true, description: "Responsive `sizes` attribute" },
    { name: "srcset", type: "string", optional: true, aliases: ["srcSet"], description: "Responsive `srcset` candidates" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick", "action"], description: "Makes the image activatable (gallery thumbnail, clickable avatar) — adds button semantics and keyboard activation" },
  ],
  render: (_node, props, helpers) => {
    const ratio = props.ratio ? parseImageRatio(asString(props.ratio)) : "";
    const clickable = props.onClick !== undefined && props.onClick !== null;
    const alt = asString(props.alt);
    const wrapperStyle = [
      ratio ? `aspect-ratio:${ratio}` : "",
      // A ratio only reserves the box; without clipping, an image whose
      // intrinsic ratio differs spills over whatever follows.
      ratio ? "overflow:hidden" : "",
      clickable ? "cursor:pointer" : "",
    ].filter(Boolean).join(";");
    const wrapper = el("figure", {
      class: "rui-image",
      "data-fit": asString(props.fit, "cover"),
      "data-ratio": ratio ? "true" : null,
      style: wrapperStyle ? `${wrapperStyle};` : null,
    });
    // `aspect-ratio` sizes the figure, but `object-fit` can only crop once the
    // <img> box itself is the declared size — otherwise the img keeps its
    // intrinsic ratio and `fit` is a no-op. `min-height: 0` lets it shrink when
    // a figcaption shares the ratio box.
    const fillStyle = ratio ? "width:100%;height:100%;min-height:0;" : null;
    const safeSrc = sanitiseImageSrc(props.src);
    const renderFallback = (): HTMLElement => {
      const fallback = asString(props.fallback);
      // The <img> (and its alt) is gone in this branch, so the accessible name
      // has to move onto the placeholder or the slot announces nothing at all.
      const name = alt || fallback;
      const placeholder = el("div", {
        class: "rui-image-placeholder",
        role: name ? "img" : "presentation",
        "aria-label": name || null,
        "aria-hidden": name ? null : "true",
        style: fillStyle,
      });
      if (fallback) {
        const iconNode = renderIcon(fallback, { className: "rui-image-fallback-icon" });
        if (iconNode) placeholder.append(iconNode);
        else placeholder.append(el("span", { class: "rui-image-fallback-text" }, [fallback]));
      }
      return placeholder;
    };
    // A load failure is remembered per instance (keyed by the src that failed)
    // so a re-render does not resurrect a broken <img>, while a NEW src still
    // gets a fresh attempt.
    const failedSlot = helpers?.useInstanceState<string>("image-failed-src", "");
    const failed = !!safeSrc && failedSlot?.get() === safeSrc;
    if (safeSrc && !failed) {
      const blur = asString(props.placeholder) === "blur";
      // The blur-in flag lives in instance state, not in an attribute set by a
      // listener: morph keeps the live node and strips attributes the fresh
      // render does not assert, and it transfers `on*` PROPERTIES only — an
      // `addEventListener("load")` registration dies with the discarded node,
      // so the image would stay blurred for the rest of the session.
      const loadedSlot = helpers?.useInstanceState<boolean>("image-loaded", false);
      const img = el("img", {
        src: safeSrc,
        alt,
        loading: asString(props.loading, "lazy") === "eager" ? "eager" : "lazy",
        decoding: "async",
        sizes: asString(props.sizes) || null,
        srcset: asString(props.srcset) || null,
        "data-blur": blur ? "true" : null,
        "data-loaded": blur && loadedSlot?.get() === true ? "true" : null,
        style: fillStyle,
      }) as HTMLImageElement;
      if (blur && loadedSlot?.get() !== true) {
        if (img.complete) {
          loadedSlot?.set(true);
          img.setAttribute("data-loaded", "true");
        } else {
          img.onload = (event) => {
            const live = (event.currentTarget ?? event.target) as HTMLImageElement | null;
            loadedSlot?.set(true);
            live?.setAttribute("data-loaded", "true");
          };
        }
      }
      // Swap to the fallback placeholder if the image fails to load. Property
      // handler (not addEventListener) so morph carries it to the kept node.
      // `onerror` is typed `OnErrorEventHandler`, whose first argument may be a
      // string for the window-level form — narrow before touching the target.
      img.onerror = (event) => {
        const live = typeof event === "string"
          ? null
          : (event.currentTarget ?? event.target) as HTMLImageElement | null;
        failedSlot?.set(safeSrc);
        (live ?? img).replaceWith(renderFallback());
      };
      wrapper.append(img);
    } else {
      // Rendering a broken/hostile src is worse than rendering nothing —
      // keep the layout slot but skip the network request.
      wrapper.append(renderFallback());
    }
    const cap = asString(props.caption);
    if (cap) wrapper.append(el("figcaption", { class: "rui-image-caption" }, [cap]));
    if (clickable) {
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("tabindex", "0");
      // An activatable element must have a name; the figure's own text is only
      // the caption, and an uncaptioned thumbnail would otherwise be nameless.
      wrapper.setAttribute("aria-label", alt || cap || "Image");
      wrapper.onclick = () => { helpers?.invoke(props.onClick); };
      wrapper.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        helpers?.invoke(props.onClick);
      };
    }
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

const BADGE_VARIANTS = ["neutral", "primary", "success", "warning", "danger", "info"] as const;

/**
 * Single source of truth for a badge pill's DOM. `BadgeList` used to inline its
 * own copy of this, which is how it ended up without the `icon` support `Badge`
 * advertises — delegating means the two cannot drift again.
 */
function renderBadgePill(label: string, tone: string, size: string, icon?: unknown): HTMLElement {
  const root = el("span", {
    class: "rui-badge",
    "data-variant": tone,
    "data-size": size,
  });
  // The `.rui-badge-icon` class only contributes a `margin-right`, which on an
  // icon-only badge is 4px of dead space that pushes the glyph off-centre
  // inside the pill. Only claim the spacing when there is a label to space from.
  const iconNode = renderIcon(icon, label ? { className: "rui-badge-icon" } : {});
  if (iconNode) root.append(iconNode);
  if (label) root.append(el("span", { class: "rui-badge-label" }, [label]));
  return root;
}

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
  render: (_node, props) => renderBadgePill(
    asString(props.label),
    asString(props.tone, "neutral"),
    normaliseSize(props.size, "md"),
    props.icon,
  ),
};

/**
 * UI block parity status label. Where `Badge` is a *solid* attention chip
 * ("Recommended", "Save 50 %"), `Pill` is the softer, tinted **state**
 * label used for things like "SSL active" / "pending" / "broken" — a pale
 * semantic background with dark semantic text, regular weight, fully
 * rounded. Mirrors the UI block `.pill` block, whose tone vocabulary
 * (activating / success / warning / critical / promoting / neutral) is
 * accepted here alongside the Aktion synonyms (info / danger / primary).
 */
const PILL_TONES = [
  "neutral", "activating", "success", "warning", "critical", "promoting", "corporate",
] as const;

/**
 * Accepted values for the `tone` prop. The synonyms are the wording every other
 * component in the catalogue uses (and the wording this component's own
 * description tells authors to use), so they have to be in the enum too — the
 * validator rejects anything absent from it, which made `normalisePillTone`'s
 * mapping unreachable for literal arguments.
 */
const PILL_TONE_ENUM = [
  ...PILL_TONES, "danger", "error", "info", "primary",
] as const;

/** Map Aktion's generic tone synonyms onto the UI block pill vocabulary. */
function normalisePillTone(value: unknown): string {
  const raw = asString(value, "neutral").toLowerCase();
  if (raw === "danger" || raw === "error") return "critical";
  if (raw === "info") return "activating";
  if (raw === "primary") return "corporate";
  return (PILL_TONES as readonly string[]).includes(raw) ? raw : "neutral";
}

export const Pill: ComponentSpec = {
  name: "Pill",
  description:
    "Soft, tinted **state** label — pale semantic background with dark " +
    "semantic text, regular weight, fully rounded. Use for the current " +
    "state of a thing (\"SSL active\", \"pending\", \"broken\", \"open ticket\"). " +
    "For a solid, high-attention marketing/status chip use `Badge` instead. " +
    "Tones: neutral, activating, success, warning, critical, promoting, " +
    "corporate (danger/error/info/primary are accepted as synonyms).",
  props: [
    { name: "label", type: "string", positional: true },
    { name: "tone", type: "string", optional: true, enum: PILL_TONE_ENUM, aliases: ["variant", "status"], description: "Semantic state tone" },
    { name: "icon", type: "string", optional: true, description: "Optional leading Font Awesome icon name" },
  ],
  render: (_node, props) => {
    const root = el("span", {
      class: "rui-pill",
      "data-tone": normalisePillTone(props.tone),
    });
    const iconNode = renderIcon(props.icon, { className: "rui-pill-icon" });
    if (iconNode) root.append(iconNode);
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-pill-label" }, [label]));
    return root;
  },
};

/**
 * `BadgeList` renders an array of string labels as a row of Badge pills.
 * Replaces the legacy `TagBlock` component.
 */
export const BadgeList: ComponentSpec = {
  name: "BadgeList",
  description:
    "Cluster of Badge pills rendered from an array of strings. `tone` sets " +
    "the whole cluster; `tones` / `icons` are index-aligned arrays that " +
    "override it per item (so one item can be `success` and the next " +
    "`danger`). `max` caps how many pills render and appends a `+N` overflow " +
    "pill for the rest.",
  props: [
    { name: "labels", type: "string[]", positional: true, description: "Array of badge labels" },
    { name: "tone", type: "string", optional: true, enum: BADGE_VARIANTS, aliases: ["variant"] },
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM },
    { name: "tones", type: "string[]", optional: true, aliases: ["variants"], description: "Per-item tones, index-aligned with `labels` (falls back to `tone`)" },
    { name: "icons", type: "string[]", optional: true, description: "Per-item leading Font Awesome icon names, index-aligned with `labels`" },
    { name: "max", type: "number", optional: true, description: "Render at most N pills, then a `+N` overflow pill" },
  ],
  render: (_node, props) => {
    const variant = asString(props.tone, "neutral");
    const size = normaliseSize(props.size, "md");
    const tones = asArray<unknown>(props.tones);
    const icons = asArray<unknown>(props.icons);
    const root = el("div", { class: "rui-badge-list" });
    const labels = asArray<unknown>(props.labels)
      .map((raw) => asString(raw))
      .filter((label) => label !== "");
    const rawMax = Number(props.max);
    // `.rui-badge-list` wraps, so an unbounded cluster from user data turns
    // into a wall of pills that dominates the card it lives in.
    const max = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : labels.length;
    const shown = labels.slice(0, max);
    shown.forEach((label, i) => {
      const itemTone = asString(tones[i]) || variant;
      root.append(renderBadgePill(label, itemTone, size, icons[i]));
    });
    const hidden = labels.length - shown.length;
    if (hidden > 0) {
      const overflow = renderBadgePill(`+${hidden}`, variant, size);
      overflow.setAttribute("data-overflow", "true");
      // The hidden labels are still reachable — as a tooltip and as the pill's
      // accessible name, so "+3" is not a dead end for a screen reader either.
      overflow.setAttribute("title", labels.slice(max).join(", "));
      overflow.setAttribute("aria-label", `${hidden} more: ${labels.slice(max).join(", ")}`);
      root.append(overflow);
    }
    return root;
  },
};

const CALLOUT_VARIANTS = ["neutral", "info", "success", "warning", "danger", "error"] as const;

export const Callout: ComponentSpec = {
  name: "Callout",
  description:
    "Highlighted callout banner with variant, title, description, and " +
    "leading icon. This is the library's alert primitive: it is announced to " +
    "assistive tech by default (`role=\"alert\"` for danger/error/warning, " +
    "`role=\"status\"` otherwise) — pass `live: false` for a static, " +
    "decorative note that should stay quiet. Pass `compact: true` for a " +
    "one-line inline-note rendering, `hideIcon: true` to drop the icon " +
    "medallion, and `dismissible: true` (with an optional `onDismiss`) for a " +
    "closable banner.",
  props: [
    { name: "tone", type: "string", optional: true, enum: CALLOUT_VARIANTS, aliases: ["variant"] },
    { name: "title", type: "string", positional: true, required: true },
    { name: "description", type: "string", optional: true, aliases: ["text"], description: "Body text" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
    { name: "compact", type: "boolean", optional: true, description: "Render with the dense, one-line note shape." },
    {
      name: "actions",
      type: "Node[]",
      optional: true,
      aliases: ["footer"],
      description: "Optional action row (buttons/links) rendered under the body",
    },
    { name: "hideIcon", type: "boolean", optional: true, aliases: ["noIcon"], description: "Render without the leading icon medallion" },
    { name: "live", type: "boolean", optional: true, description: "Announce the banner to assistive tech (default true; `false` for a static note)" },
    { name: "dismissible", type: "boolean", optional: true, aliases: ["closable"], description: "Render a × close button that removes the banner" },
    { name: "onDismiss", type: "callable", optional: true, aliases: ["onClose"], description: "Called when the banner is dismissed (implies `dismissible`)" },
  ],
  render: (_node, props, helpers) => {
    const variant = asString(props.tone, "info");
    const compact = asBoolean(props.compact);
    const dismissible = asBoolean(props.dismissible) || (props.onDismiss !== undefined && props.onDismiss !== null);
    // Dismissal is component-local UI state: it must survive a re-render
    // triggered by anything else on the page, or the banner the user closed
    // reappears on the next keystroke.
    const dismissedSlot = helpers?.useInstanceState<boolean>("dismissed", false);
    if (dismissible && dismissedSlot?.get() === true) {
      return el("div", { class: "rui-callout", "data-dismissed": "true", hidden: true });
    }
    // Error banners appear *after* an action (a failed submit) with focus still
    // on the trigger, so without a live region a screen-reader user gets no
    // signal at all that anything happened.
    const announce = props.live === undefined ? true : asBoolean(props.live);
    const urgent = variant === "danger" || variant === "error" || variant === "warning";
    // `icon: false` used to stringify to "false" -> `fa-false`: an invisible
    // glyph that still occupied the 22px coloured medallion, so there was no
    // way to render a Callout without one. Treat it as `hideIcon`.
    const hideIcon = asBoolean(props.hideIcon) || props.icon === false;
    const iconName = hideIcon ? "" : (asString(props.icon) || defaultCalloutIcon(variant));
    const iconNode = iconName ? renderIcon(iconName, { className: "rui-callout-icon" }) : null;
    const root = el("div", {
      class: "rui-callout",
      "data-variant": variant,
      "data-compact": compact ? "true" : "false",
      // Themes that place the icon out of flow have to indent the title past it,
      // and that indent must disappear when there is no icon. Publishing the fact
      // as an attribute keeps that a pure-CSS decision in every theme (and needs
      // no `:has()`), instead of each theme guessing from the DOM.
      "data-has-icon": iconNode ? "true" : "false",
      role: announce ? (urgent ? "alert" : "status") : null,
      "aria-live": announce ? (urgent ? "assertive" : "polite") : null,
      "aria-atomic": announce ? "true" : null,
    });
    // UI block splits a Message into an OUTER element that draws the chrome (border,
    // radius, `overflow: hidden`) and an INNER section that carries the padding and
    // the semantic bar:
    //   .message         { border; border-radius: 16px; overflow: hidden }
    //   .message__section{ padding: 28px 30px; margin-left: -1px;
    //                      box-shadow: inset 9px 0 0 -1px <tone> }
    // The split is what makes the bar look right: because the bar lives on the inner
    // element and the outer one clips, the bar's ends are cut straight by the corner
    // arc instead of curling around the radius, and the -1px pull lets it cover the
    // outer border. A single element cannot do both, so the section is real markup.
    const section = el("div", { class: "rui-callout-section" });
    if (iconNode) section.append(iconNode);
    const body = el("div", { class: "rui-callout-body" });
    body.append(el("div", { class: "rui-callout-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) body.append(el("div", { class: "rui-callout-description" }, [desc]));
    const actions = asArray(props.actions);
    if (actions.length > 0 && helpers) {
      const footer = el("div", { class: "rui-callout-footer" });
      for (const action of actions) footer.append(helpers.renderNode(action));
      body.append(footer);
    }
    section.append(body);
    if (dismissible) {
      const closeBtn = el("button", {
        type: "button",
        class: "rui-callout-dismiss",
        "aria-label": "Dismiss",
      }, ["×"]);
      closeBtn.onclick = (event) => {
        // Resolve the banner from the event, never from `root` — after a morph
        // the captured node is a discarded snapshot.
        const origin = (event.currentTarget ?? event.target) as Element | null;
        const live = origin?.closest(".rui-callout") ?? (root.isConnected ? root : null);
        dismissedSlot?.set(true);
        live?.remove();
        helpers?.invoke(props.onDismiss);
      };
      // Inside the section, not the root: the root's only child is the section
      // (that split is what lets it clip the section's inset tone bar).
      section.append(closeBtn);
    }
    root.append(section);
    return root;
  },
};

export const CodeBlock: ComponentSpec = {
  name: "CodeBlock",
  description:
    "Read-only code block with a language label and a copy-to-clipboard " +
    "button. Pass `showLineNumbers=true` to render a gutter; `highlightLines` " +
    "accepts a string like `\"3-5,8\"` to emphasise specific lines. " +
    "`header=false` renders a chromeless variant — no language label or copy " +
    "button, no border or rounding — that fills its container (100%×100%), " +
    "for embedding in your own frame (CodeWindow uses it). `filename` shows a " +
    "file path in the header instead of the language token. `wrap=true` soft-" +
    "wraps long lines instead of scrolling horizontally. `width`/`height` " +
    "set an explicit size; overflowing code scrolls either way.",
  props: [
    { name: "language", type: "string", optional: true, description: "Display label + syntax highlighting (e.g. aktion, ts, bash)" },
    { name: "codeString", type: "string", positional: true, required: true, aliases: ["code"], description: "Raw source text" },
    { name: "showLineNumbers", type: "boolean", optional: true, description: "Render a left-side line-number gutter" },
    { name: "highlightLines", type: "string", optional: true, description: "Highlight ranges, e.g. \"3-5,8\"" },
    { name: "highlight", type: "boolean", optional: true, description: "Syntax-highlight tokens when a language is set (default true)" },
    { name: "copy", type: "boolean", optional: true, description: "Show the copy-to-clipboard button (default true)" },
    { name: "header", type: "boolean", optional: true, description: "Show the header bar (default true); false = chromeless, fills its container" },
    { name: "width", type: "string", optional: true, description: "Explicit width (CSS length)" },
    { name: "height", type: "string", optional: true, description: "Explicit height (CSS length); overflowing code scrolls" },
    { name: "filename", type: "string", optional: true, aliases: ["title"], description: "File path shown in the header in place of the language token (e.g. `src/index.ts`)" },
    { name: "wrap", type: "boolean", optional: true, description: "Soft-wrap long lines instead of scrolling horizontally" },
  ],
  render: (_node, props, helpers) => {
    const language = asString(props.language);
    const code = asString(props.codeString);
    const showLineNumbers = asBoolean(props.showLineNumbers);
    const highlights = parseLineRanges(asString(props.highlightLines), code);
    const showCopy = props.copy === undefined ? true : asBoolean(props.copy);
    const showHeader = props.header === undefined ? true : asBoolean(props.header);
    const filename = asString(props.filename);
    const wrap = asBoolean(props.wrap);
    const width = sanitiseCssLength(props.width, "");
    const height = sanitiseCssLength(props.height, "");
    const sizeStyle = [width ? `width:${width}` : "", height ? `height:${height}` : ""].filter(Boolean).join(";");
    const root = el("div", {
      class: "rui-code-block",
      "data-headerless": showHeader ? null : "true",
      style: sizeStyle || null,
    });

    if (showHeader && (filename || language || showCopy)) {
      const head = el("div", { class: "rui-code-block-head" });
      if (filename) {
        head.append(el("span", {
          class: "rui-code-block-filename",
          // The header uppercases and letter-spaces the language token; a file
          // path has to stay verbatim, so the reset rides with the one element
          // that needs it rather than adding a rule per theme.
          style: "font-family:var(--rui-font-family-mono);text-transform:none;letter-spacing:0;",
        }, [filename]));
      } else if (language) {
        head.append(el("span", { class: "rui-code-block-language" }, [language]));
      }
      if (showCopy) {
      // "Copied" has to be re-asserted by the render, not just written by the
      // click handler: an unrelated re-render morphs the label's text back to
      // whatever the fresh tree says.
      const copiedSlot = helpers?.useInstanceState<boolean>("copied", false);
      const copyBtn = el("button", {
        type: "button",
        class: "rui-code-block-copy",
        "aria-label": "Copy code",
        title: "Copy",
      });
      const copyIcon = renderIcon("copy", { className: "rui-code-block-copy-icon" });
      if (copyIcon) copyBtn.append(copyIcon);
      copyBtn.append(el("span", {
        class: "rui-code-block-copy-label",
        // Announce the Copy → Copied swap; the button's own name is static.
        "aria-live": "polite",
      }, [copiedSlot?.get() === true ? "Copied" : "Copy"]));
      copyBtn.onclick = (event) => {
        const origin = (event.currentTarget ?? event.target) as HTMLButtonElement;
        // Resolve the live code from the on-page DOM so this still works
        // after the morph reconciler keeps the previous element.
        const live = origin.closest(".rui-code-block");
        const text = liveCodeText(live, code);
        const nav = (typeof navigator !== "undefined") ? navigator as Navigator & { clipboard?: { writeText?: (t: string) => Promise<void> } } : null;
        const clipboard = nav?.clipboard;
        if (clipboard?.writeText) {
          clipboard.writeText(text).catch(() => { /* user denied / non-secure */ });
        }
        const label = origin.querySelector(".rui-code-block-copy-label");
        if (label) {
          label.textContent = "Copied";
          copiedSlot?.set(true);
          // Restore the LITERAL "Copy". Reading the label's current text would
          // capture "Copied" on a second click inside the window and latch the
          // button there permanently.
          const handle = setTimeout(() => {
            copiedSlot?.set(false);
            if (label.isConnected) label.textContent = "Copy";
          }, 1500);
          // Anonymous (unkeyed) on purpose: a keyed disposer re-registered on
          // every click would run the previous cleanup against the timer we
          // just created and cancel it.
          helpers?.registerDisposer(() => clearTimeout(handle));
        }
      };
      head.append(copyBtn);
      }
      root.append(head);
    }

    const pre = el("pre", {
      class: "rui-code-block-pre",
      "data-line-numbers": showLineNumbers ? "true" : "false",
      // A horizontally scrolling region has to be reachable without a mouse
      // (WCAG 2.1.1), and a focusable scroll container needs a name.
      tabindex: "0",
      role: "region",
      "aria-label": language ? `${language} code` : "Code",
      style: wrap ? "white-space:pre-wrap;overflow-wrap:anywhere;" : null,
    });
    // `.rui-code-block-code` hard-sets `white-space: pre`, so the per-line
    // branch needs the override on the line span itself; `min-width: 0` lets it
    // shrink inside the flex row that holds the gutter.
    const wrapLineStyle = wrap ? "white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;" : null;
    // Syntax highlighting (VIII.3): when a known `language` is set we tokenise
    // each line into coloured spans. Disable with `highlight={false}`.
    const wantHighlight = (props.highlight === undefined ? true : asBoolean(props.highlight)) && !!language && isHighlightable(language);
    if (showLineNumbers || highlights.size > 0) {
      const lines = code.split(/\r?\n/);
      const codeEl = el("code", {});
      const hlState = { inBlockComment: false };
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
        const codeSpan = el("span", { class: "rui-code-block-code", style: wrapLineStyle });
        if (wantHighlight) appendHighlightedLine(codeSpan, lineText, language, hlState);
        else codeSpan.append(document.createTextNode(lineText));
        line.append(codeSpan);
        codeEl.append(line);
      });
      pre.append(codeEl);
    } else if (wantHighlight) {
      const codeEl = el("code", {});
      const hlState = { inBlockComment: false };
      const lines = code.split(/\r?\n/);
      lines.forEach((lineText, idx) => {
        appendHighlightedLine(codeEl, lineText, language, hlState);
        if (idx < lines.length - 1) codeEl.append(document.createTextNode("\n"));
      });
      pre.append(codeEl);
    } else {
      pre.append(el("code", {}, [code]));
    }
    root.append(pre);
    return root;
  },
};

/**
 * Recover the block's source text from the rendered DOM.
 *
 * The gutter branch builds one `<span>` per line with the line number in a
 * sibling span and no newline text nodes at all, so `code.textContent` fuses
 * the digits onto the code and drops every line break — a clipboard payload
 * that looks copied but pastes as one unrunnable line.
 */
function liveCodeText(root: Element | null, fallback: string): string {
  const codeEl = root?.querySelector("code");
  if (!codeEl) return fallback;
  const lines = codeEl.querySelectorAll(".rui-code-block-code");
  if (lines.length === 0) return codeEl.textContent ?? fallback;
  return Array.from(lines).map((line) => line.textContent ?? "").join("\n");
}

function parseLineRanges(input: string, code = ""): Set<number> {
  const out = new Set<number>();
  if (!input) return out;
  // A range can never usefully exceed the block's own line count, and clamping
  // to it is what keeps `highlightLines: "1-99999999"` (an easy typo for
  // `"1-9"`) from building a 100-million-entry Set on the main thread.
  const lineCount = code ? code.split(/\r?\n/).length : MAX_HIGHLIGHT_LINES;
  const ceiling = Math.min(lineCount, MAX_HIGHLIGHT_LINES);
  for (const segment of input.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const parts = trimmed.split("-").map((s) => Number(s.trim()));
      const a = parts[0] ?? NaN;
      const b = parts[1] ?? NaN;
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
        const start = Math.max(0, Math.floor(a));
        const end = Math.min(Math.floor(b), ceiling);
        for (let i = start; i <= end; i += 1) out.add(i);
      }
    } else {
      const n = Number(trimmed);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return out;
}

/**
 * Hard ceiling on how many lines a single `highlightLines` range may expand to,
 * used when the code text is not available to clamp against. Bounds the work a
 * one-line prop value can cause.
 */
const MAX_HIGHLIGHT_LINES = 10_000;

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
    "animation that respects `prefers-reduced-motion`. The placeholder is a " +
    "polite live region announcing `label` (default \"Loading\"), so a screen " +
    "reader hears the wait instead of silence — when you stack several " +
    "Skeletons into one loading view, pass `live: false` on all but the first " +
    "so the announcement happens once rather than once per placeholder.",
  props: [
    { name: "variant", aliases: ["tone"], type: "string", optional: true, enum: SKELETON_VARIANTS },
    { name: "lines", type: "number", optional: true, aliases: ["count", "columns"], description: "Lines for the `paragraph` variant (default 3) / cells for `table-row` (default 4)" },
    { name: "height", type: "number | string", optional: true, description: "Line height in px (paragraph) or CSS height for custom shape; a bare number is px" },
    { name: "shape", type: "string", optional: true, enum: SKELETON_SHAPES, description: "Force a primitive shape (rect/circle)" },
    { name: "width", type: "string", optional: true, description: "CSS width for shape-only skeletons" },
    { name: "label", type: "string", optional: true, description: "What is loading, announced to assistive tech (default \"Loading\")" },
    { name: "live", type: "boolean", optional: true, description: "Announce the wait (default true); `false` keeps this placeholder silent when a sibling already announces" },
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
    const root = skeletonRoot(props, { class: "rui-skeleton", "data-variant": "paragraph" });
    for (let i = 0; i < lines; i += 1) {
      root.append(el("div", { class: "rui-skeleton-line", style: `height:${lineHeight}px`, "aria-hidden": "true" }));
    }
    return root;
  },
};

/**
 * The shared root for every Skeleton shape.
 *
 * A loading placeholder is a state, not content. Without the live-region ARIA a
 * screen-reader user hears nothing while data is in flight and then walks
 * through a handful of empty group nodes — indistinguishable from a broken or
 * empty view. The decorative bars themselves get `aria-hidden` at the call site.
 *
 * Three details that are easy to get wrong:
 *   - `aria-live` is spelled out rather than left to `role="status"`'s implicit
 *     polite value, because the region is *inserted* rather than mutated in
 *     place and engines disagree about the implicit case.
 *   - A live region announces the TEXT it contains; `aria-label` names it but is
 *     not what gets read out. Every bar below is `aria-hidden`, so without the
 *     visually-hidden caption the region has nothing to announce at all.
 *   - Ten placeholders standing in for one table is ten "Loading" utterances, so
 *     `live: false` drops the announcement while KEEPING `role="status"` and
 *     `aria-busy` — the region is still reachable and still reads as busy when
 *     the user navigates onto it; it just does not interrupt.
 */
function skeletonRoot(
  props: Record<string, unknown>,
  attrs: Record<string, string | null>,
): HTMLElement {
  const label = asString(props.label) || "Loading";
  const announce = props.live === undefined ? true : asBoolean(props.live);
  const root = el("div", {
    ...attrs,
    role: "status",
    "aria-live": announce ? "polite" : "off",
    "aria-busy": "true",
    "aria-label": label,
  });
  if (announce) root.append(el("span", { class: "rui-visually-hidden" }, [label]));
  return root;
}

/**
 * Coerce a `number | string` length prop to a valid CSS length.
 *
 * `sanitiseCssLength` passes bare digits straight through, so a numeric prop
 * (`height: 200`) became `height:200` — a declaration the CSS parser drops,
 * collapsing the placeholder to zero height.
 */
function cssLengthProp(value: unknown, fallback: string): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? `${value}px` : fallback;
  }
  const raw = asString(value).trim();
  if (!raw) return fallback;
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  return sanitiseCssLength(raw, fallback);
}

function renderShapeSkeleton(shape: string, props: Record<string, unknown>): HTMLElement {
  const width = cssLengthProp(props.width, "100%");
  const height = props.height !== undefined && props.height !== null && asString(props.height) !== ""
    ? cssLengthProp(props.height, "16px")
    : (shape === "circle" ? width : "16px");
  const kind = shape === "circle" ? "circle" : "rect";
  const root = skeletonRoot(props, {
    class: "rui-skeleton",
    "data-variant": "shape",
    "data-shape": kind,
    style: `width:${width};`,
  });
  // The fill, radius and shimmer all live on `.rui-skeleton-shape`; putting
  // `data-shape` on the bare root (which only sets `display: flex`) rendered a
  // completely invisible box. Same child element the variant paths use.
  root.append(el("div", {
    class: "rui-skeleton-shape",
    "data-shape": kind,
    style: `width:100%;height:${height};`,
    "aria-hidden": "true",
  }));
  return root;
}

function renderVariantSkeleton(variant: string, props: Record<string, unknown>): HTMLElement {
  const root = skeletonRoot(props, { class: "rui-skeleton", "data-variant": variant });
  switch (variant) {
    case "avatar": {
      const size = cssLengthProp(props.width, "40px");
      root.append(el("div", {
        class: "rui-skeleton-shape",
        "data-shape": "circle",
        style: `width:${size};height:${size};`,
        "aria-hidden": "true",
      }));
      return root;
    }
    case "image": {
      const width = cssLengthProp(props.width, "100%");
      const height = cssLengthProp(props.height, "160px");
      root.append(el("div", {
        class: "rui-skeleton-shape",
        "data-shape": "rect",
        style: `width:${width};height:${height};`,
        "aria-hidden": "true",
      }));
      return root;
    }
    case "card": {
      root.append(el("div", { class: "rui-skeleton-shape", "data-shape": "rect", style: "width:100%;height:120px;", "aria-hidden": "true" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:14px;width:70%;", "aria-hidden": "true" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:12px;width:90%;", "aria-hidden": "true" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:12px;width:60%;", "aria-hidden": "true" }));
      return root;
    }
    case "table-row": {
      // `lines` doubles as the cell count here (aliased as `columns`, which is
      // what an author looking for this actually reaches for).
      const rawCells = Number(props.lines);
      const cells = Math.max(1, Math.min(8, Number.isFinite(rawCells) ? Math.floor(rawCells) : 4));
      const row = el("div", { class: "rui-skeleton-row", "aria-hidden": "true" });
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

const MARKDOWN_LINK_TARGETS = ["_self", "_blank"] as const;

export const Markdown: ComponentSpec = {
  name: "Markdown",
  description:
    "Render markdown-flavoured text. Supports **bold**, *italic*, `code`, " +
    "headings (`#` through `######`), blockquotes (`>`), bullet (`-`/`*`) and " +
    "numbered (`1.`) lists, thematic breaks (`---`), fenced code blocks " +
    "(```), images (`![alt](src)`), inline links, and auto-linked bare URLs. " +
    "Multi-line paragraphs collapse into `<p>` blocks. Links to a fragment or " +
    "a root-relative path stay in the tab; absolute URLs open in a new one — " +
    "pass `linkTarget` to force one or the other.",
  props: [
    { name: "content", type: "string" },
    { name: "linkTarget", type: "string", optional: true, enum: MARKDOWN_LINK_TARGETS, aliases: ["target"], description: "Force every link's target (default: `_self` for in-app links, `_blank` for absolute URLs)" },
  ],
  render: (_node, props) => {
    const value = asString(props.content);
    const requestedTarget = asString(props.linkTarget).trim();
    const linkTarget = (MARKDOWN_LINK_TARGETS as readonly string[]).includes(requestedTarget)
      ? requestedTarget
      : "";
    const html = renderMarkdown(value, linkTarget);
    const root = el("div", { class: "rui-markdown" });
    // `renderMarkdown` escapes both text and attribute contexts, so its output
    // is safe by construction — but it is still an HTML string built from
    // untrusted input, so it goes through the same allow-list as every other
    // string-to-DOM conversion. Cheap, and it means a future escaping slip in
    // the Markdown renderer cannot become script execution on its own.
    setSanitisedHtml(root, html);
    return root;
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
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg", "xl", "full"], description: "sm=640 / md=820 / lg=1040 / xl=1280 / full=100% (default lg)" },
    { name: "maxWidth", type: "string", optional: true, description: "Custom CSS max-width (overrides `size`)" },
    { name: "padding", type: "string", optional: true, enum: SPACING_TOKENS, description: "Horizontal padding (default md)" },
  ],
  render: (_node, props, helpers) => {
    // The whole point of the component is the centring, and `max-width` alone
    // does not centre anything: as a stretch-aligned flex child the capped box
    // falls back to flex-start and sits flush left. Declared here (rather than
    // only in the theme) so the guarantee travels with the component.
    const maxWidth = props.maxWidth ? sanitiseCssLength(props.maxWidth, "auto") : "";
    const root = el("div", {
      class: "rui-container",
      "data-size": canonicalSizeToken(asString(props.size, "lg")),
      "data-padding": normalizeSpacingToken(props.padding, "md"),
      style: `${maxWidth ? `max-width:${maxWidth};` : ""}margin-inline:auto;`,
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
    { name: "size", type: "string", optional: true, enum: SPACING_TOKENS, description: "Fixed gap; omit to flex-grow" },
    { name: "flex", type: "boolean", optional: true, description: "Flex-grow even when size is set (default true when size omitted)" },
  ],
  render: (_node, props) => {
    const size = normalizeSpacingToken(props.size, asString(props.size));
    const flex = props.flex === undefined ? !size : asBoolean(props.flex);
    return el("span", {
      class: "rui-spacer",
      "data-size": size || null,
      "data-flex": flex ? "true" : "false",
      "aria-hidden": "true",
    });
  },
};

/**
 * `LoadingDots` is the sequenced three-dot loader — a row of dots that pulse in
 * turn. A different visual metaphor from `Spinner`'s rotating ring, and the one
 * UI block uses for inline "working on it" feedback (its `loading-circle`
 * block). Use it where a ring would feel heavy: inside buttons, beside a label,
 * or in a table cell.
 */
export const LoadingDots: ComponentSpec = {
  name: "LoadingDots",
  description:
    "Three dots that pulse in sequence — an inline indeterminate loader. " +
    "Lighter and quieter than `Spinner`'s rotating ring; use inside buttons, " +
    "beside labels, or in table cells. Pass `label` for an announced caption.",
  props: [
    { name: "label", type: "string", optional: true, positional: true, description: "Caption rendered beside the dots (also announced)" },
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM, description: "Default `md`" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: TONE_ENUM, description: "Visual accent (default `primary`)" },
  ],
  render: (_node, props) => {
    const label = asString(props.label);
    const root = el("span", {
      class: "rui-loading-dots",
      "data-size": normaliseSize(props.size, "md"),
      "data-tone": asString(props.tone, "primary"),
      role: "status",
      "aria-live": "polite",
      "aria-label": label || "Loading",
    });
    const dots = el("span", { class: "rui-loading-dots-track", "aria-hidden": "true" });
    for (let i = 0; i < 3; i += 1) dots.append(el("span", { class: "rui-loading-dots-dot" }));
    root.append(dots);
    if (label) root.append(el("span", { class: "rui-loading-dots-label" }, [label]));
    // A live region announces the text it CONTAINS — `aria-live` on a region
    // whose only content is three `aria-hidden` dots has nothing to read out,
    // and `aria-label` names the region rather than being announced. Uncaptioned
    // loaders therefore appeared in total silence.
    else root.append(el("span", { class: "rui-visually-hidden" }, ["Loading"]));
    return root;
  },
};

export const Spinner: ComponentSpec = {
  name: "Spinner",
  description:
    "Indeterminate inline loader (a rotating ring). Use for tiny loading " +
    "states inside buttons, toolbars, table cells, or chat bubbles where " +
    "`Skeleton` and `Progress(indeterminate=true)` are too heavy. For a " +
    "quieter three-dot pulse instead of a ring use `LoadingDots`. Pass " +
    "`label` to render an inline caption beside the spinner (also announced " +
    "via `aria-label`).",
  props: [
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM, description: "Default `md`" },
    { name: "label", type: "string", optional: true, description: "Caption rendered beside the spinner (also announced)" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: TONE_ENUM, description: "Visual accent (default `primary`)" },
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
    // Same reason as LoadingDots: the ring is `aria-hidden`, so without a
    // caption the live region carried no announceable text at all.
    else root.append(el("span", { class: "rui-visually-hidden" }, ["Loading"]));
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
    { name: "tone", type: "string", optional: true, aliases: ["variant"], enum: ["default", "primary", "success", "warning", "danger", "info"] },
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
 *   - Headings (# … ######)
 *   - Blockquotes (>)
 *   - Thematic breaks (---, ***, ___)
 *   - Fenced code blocks (```lang)
 *   - Bullet lists (`-` / `*`) and numbered lists (`1.`)
 *   - Inline **bold**, *italic*, `code`
 *   - Links `[label](href)` (sanitised) and images `![alt](src)` (sanitised)
 *   - Auto-linked bare HTTP/HTTPS URLs
 *
 * All HTML output is escape-encoded so an LLM cannot smuggle raw markup
 * past the parser.
 * ------------------------------------------------------------------------ */
/**
 * Sentinel wrapping the index of a parked markup fragment during inline
 * rendering (see `inline`). NUL can never appear in the rendered text because
 * `renderMarkdown` strips it from the input first, which is what makes the
 * sentinel unforgeable by a hostile document.
 */
const SENTINEL = "\u0000";
const SENTINEL_RE = /\u0000(\d+)\u0000/g;

/**
 * Caps for the Markdown renderer. Its inline transforms are regex passes whose
 * cost grows super-linearly with line length, so a single huge document (an LLM
 * response, a pasted payload) could otherwise freeze the render thread for
 * seconds. Content past these bounds is truncated rather than dropped, so an
 * over-long document still renders its beginning.
 */
const MARKDOWN_MAX_LENGTH = 128 * 1024;
const MARKDOWN_MAX_LINE_LENGTH = 8 * 1024;

function renderMarkdown(value: string, linkTarget = ""): string {
  // Text-context escape. NEVER use this for an attribute value — it leaves
  // `"` and `'` intact, so an attribute slot needs `escapeAttr` instead.
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Strip NUL (and the other C0 controls, which have no place in rendered
  // text) so the fragment sentinel below cannot be forged from the source.
  // eslint-disable-next-line no-control-regex
  const lines = value
    .slice(0, MARKDOWN_MAX_LENGTH)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .split(/\r?\n/)
    .map((line) => (line.length > MARKDOWN_MAX_LINE_LENGTH ? line.slice(0, MARKDOWN_MAX_LINE_LENGTH) : line));
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
    // `codeLang` is the raw text after the opening fence, so it is fully
    // attacker-controlled. It lands in an attribute value, which means it
    // needs `escapeAttr` — `escape` leaves `"` intact and a fence like
    // ```` ```js" onmouseover="alert(1) ```` would break out of the
    // attribute and execute.
    const lang = codeLang ? ` data-language="${escapeAttr(codeLang)}"` : "";
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

    // `#` through `######`. Stopping at three left `#### Detail` to fall through
    // to the paragraph branch, which printed the hashes as body text.
    const heading = /^\s*(#{1,6})\s+(.+)$/.exec(rawLine);
    if (heading) {
      closeList(); closeQuote();
      const level = Math.min(6, heading[1]!.length);
      out.push(`<h${level} class="rui-markdown-h${level}">${inline(escape(heading[2]!))}</h${level}>`);
      continue;
    }

    // Thematic break. Checked before the bullet-list branch so `---` is a rule
    // rather than a paragraph reading "---".
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(rawLine)) {
      closeList(); closeQuote();
      out.push("<hr class=\"rui-markdown-rule\">");
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
    // Every transform below emits raw markup into a string that later
    // transforms scan again. Left unguarded, a later pass rewrites the
    // *inside* of markup an earlier pass produced — e.g. the autolinker
    // finding a URL inside an `alt="…"` value and injecting an anchor there,
    // breaking out of the attribute. So each emitted fragment is parked in
    // `slots` and replaced by a sentinel that no transform can match; the
    // fragments are spliced back in only at the very end.
    const slots: string[] = [];
    const park = (html: string): string => {
      slots.push(html);
      return `${SENTINEL}${slots.length - 1}${SENTINEL}`;
    };
    // `s` has already been through `escape()`, so `&`/`<`/`>` are encoded but
    // quotes are not. Attribute slots need the quotes closed off too — and
    // escaping only the quotes avoids double-encoding the `&amp;` entities
    // `escape()` already produced.
    const attr = (v: string): string => v.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    // A URL landing in an attribute must additionally have `&` re-encoded.
    // `attr` alone is not enough: the value has already been entity-decoded
    // for the scheme check, so leaving a raw `&` lets the HTML parser decode
    // `&#106;avascript:` back into a live `javascript:` URL after validation.
    const attrUrl = (v: string): string => attr(v).replace(/&(?!(amp|quot|#39);)/g, "&amp;");
    // Hard-coding `_blank` ripped in-app navigation out into a new tab — a
    // `[see step 2](#step-2)` link opened a whole second copy of the app. An
    // in-app destination (fragment / root-relative / query-only, the same set
    // `sanitizeMarkdownHref` treats as same-origin) stays in the tab unless the
    // author overrides it; anything absolute still opens away from the app.
    const anchor = (href: string, body: string): string => {
      const internal = href.startsWith("#") || href.startsWith("/") || href.startsWith("?");
      const target = linkTarget || (internal ? "_self" : "_blank");
      const rel = target === "_blank" ? " rel=\"noopener noreferrer\"" : "";
      return `<a class="rui-link" href="${href}" target="${target}"${rel}>${body}</a>`;
    };

    let result = s
      // Images first so the ![alt](src) regex does not match inside link labels.
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, rawSrc: string) => {
        const src = sanitiseImageSrc(decodeEntities(rawSrc));
        if (!src) return park(`<span class="rui-markdown-image-fallback">${alt}</span>`);
        return park(
          `<img class="rui-markdown-image" src="${attrUrl(src)}" alt="${attr(alt)}" loading="lazy">`,
        );
      })
      // Inline code — careful not to match across line boundaries.
      .replace(/`([^`]+)`/g, (_m, code: string) => park(`<code>${code}</code>`))
      .replace(/\*\*([^*]+)\*\*/g, (_m, b: string) => park(`<strong>${b}</strong>`))
      .replace(/\*([^*]+)\*/g, (_m, i: string) => park(`<em>${i}</em>`))
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, rawHref: string) => {
        const href = sanitizeMarkdownHref(rawHref);
        return park(anchor(href, label));
      });
    // Auto-link bare http(s) URLs. Generated markup is parked in `slots` by
    // now, so what remains is plain text and this cannot land inside a tag.
    result = result.replace(
      /\bhttps?:\/\/[a-zA-Z0-9._~:/?#@!$&'()*+,;=%\-]+/g,
      (url) => {
        const safe = sanitizeMarkdownHref(url);
        return park(anchor(safe, attr(url)));
      },
    );
    // Splice the parked fragments back in. Sentinels only ever appear where
    // `park` put them: NUL is stripped from the source before rendering, so a
    // hostile document cannot forge one and pull a fragment into a tag.
    return result.replace(SENTINEL_RE, (_m, i: string) => slots[Number(i)] ?? "");
  }
}

/**
 * Decode the small set of HTML entities the parser would decode inside an
 * attribute value, so scheme checks see what the browser will see. Without
 * this, `&#106;avascript:alert(1)` passes a literal `javascript:` check and is
 * then decoded by the HTML parser into a live `javascript:` URL.
 */
function decodeEntities(raw: string): string {
  // Repeat to a fixed point (bounded, so a hostile document cannot make this
  // loop expensive). One pass is not enough: the line has already been
  // `escape()`d, so `&#106;` arrives as `&amp;#106;` and the first pass only
  // unwraps the outer `&amp;`.
  let out = raw;
  for (let i = 0; i < 5; i += 1) {
    const next = decodeEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

function decodeEntitiesOnce(raw: string): string {
  return raw.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});?/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    const named: Record<string, string> = {
      amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
      Tab: "\t", NewLine: "\n", colon: ":", sol: "/", commat: "@",
    };
    return named[body] ?? whole;
  });
}

/**
 * Block dangerous URL schemes (`javascript:`, `data:`, `vbscript:`, …) and
 * protocol-relative URLs (`//evil.com/...`) so a tool response embedded
 * inside a Markdown link cannot smuggle script execution or cross-origin
 * navigation into the page. Allow http/https/mailto/tel absolute URLs plus
 * same-origin fragments and root-relative paths.
 */
function sanitizeMarkdownHref(raw: string): string {
  // Validate what the HTML parser will actually see, not the source text —
  // otherwise `&#106;avascript:alert(1)` sails past the scheme check and is
  // then decoded into a live `javascript:` URL inside the attribute.
  // eslint-disable-next-line no-control-regex
  const trimmed = decodeEntities(raw).replace(/[\u0000-\u001F\u007F]/g, "").trim();
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
