/**
 * Marketing / landing / utility components (suggestions-global Parts II, VIII).
 *
 * These composites fill the "marketing surface" gap: they turn whole landing
 * sections into one-line calls instead of escape-hatch `HTMLTag` trees. All
 * styling flows through theme tokens (no hard-coded colors), and they honour
 * the universal `sx`/`animate` channel like every other component.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { mapPositionalArgs } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseImageSrc, sanitiseHref,
  normalizeSpacingToken,
} from "../utils.js";
import { CodeBlock } from "./content.js";

/* ----------------------------------------------------------------------- *
 * Typography (Part I.3 / I.5 / VIII.1)
 * ----------------------------------------------------------------------- */

export const GradientText: ComponentSpec = {
  name: "GradientText",
  description:
    "Inline text painted with a brand gradient. Use inside a Display/Heading " +
    "title to emphasise a phrase: `Display([\"Build in \", GradientText(\"record time\")])`. " +
    "`gradient` selects a named theme gradient (brand|accent|warm|cool|success|danger).",
  props: [
    { name: "text", type: "string", positional: true, required: true, aliases: ["children", "label"] },
    { name: "gradient", type: "string", optional: true, enum: ["brand", "accent", "warm", "cool", "success", "danger"] },
  ],
  render: (_node, props) => {
    const span = el("span", { class: "rui-gradient-text", "data-gradient": asString(props.gradient, "brand") });
    span.append(document.createTextNode(asString(props.text)));
    return span;
  },
};

/** Shared: append a string or rendered node array as children. */
function appendInline(host: HTMLElement, value: unknown, helpers: { renderNode: (n: unknown) => Node }): void {
  for (const item of asArray<unknown>(value)) {
    if (item == null) continue;
    if (typeof item === "string" || typeof item === "number") {
      host.append(document.createTextNode(String(item)));
    } else {
      host.append(helpers.renderNode(item));
    }
  }
}

export const Display: ComponentSpec = {
  name: "Display",
  description:
    "Oversized display headline with built-in responsive `clamp()` sizing. " +
    "The positional argument may be a plain string OR an array mixing strings " +
    "and `GradientText(...)` runs. `size`: hero|xl|lg. `balance` wraps for " +
    "even line lengths.",
  props: [
    { name: "content", type: "string | Node[]", positional: true, required: true, aliases: ["children", "title"] },
    { name: "size", type: "string", optional: true, enum: ["hero", "xl", "lg"] },
    { name: "align", type: "string", optional: true, enum: ["left", "center", "right"] },
    { name: "balance", type: "boolean", optional: true },
    { name: "weight", type: "number", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("h1", {
      class: "rui-display",
      "data-size": asString(props.size, "hero"),
      "data-align": asString(props.align) || null,
      "data-balance": asBoolean(props.balance) ? "true" : null,
      style: props.weight != null ? `font-weight:${asNumber(props.weight, 900)}` : null,
    });
    appendInline(root, props.content, helpers);
    return root;
  },
};

export const Heading: ComponentSpec = {
  name: "Heading",
  description:
    "Section/subsection heading with token-driven sizing. `level` sets the " +
    "semantic tag (1–6); `size`: section|lg|md|sm. Accepts string or mixed " +
    "string/GradientText array like Display.",
  props: [
    { name: "content", type: "string | Node[]", positional: true, required: true, aliases: ["children", "title"] },
    { name: "level", type: "number", optional: true, description: "Heading level 1–6 (default 2)" },
    { name: "size", type: "string", optional: true, enum: ["section", "lg", "md", "sm"] },
    { name: "align", type: "string", optional: true, enum: ["left", "center", "right"] },
  ],
  render: (_node, props, helpers) => {
    const level = Math.min(6, Math.max(1, Math.round(asNumber(props.level, 2))));
    const root = el(`h${level}` as keyof HTMLElementTagNameMap, {
      class: "rui-heading",
      "data-size": asString(props.size, "section"),
      "data-align": asString(props.align) || null,
    });
    appendInline(root, props.content, helpers);
    return root;
  },
};

export const Eyebrow: ComponentSpec = {
  name: "Eyebrow",
  description: "Small uppercase, letter-spaced, primary-toned label above a heading.",
  props: [{ name: "text", type: "string", positional: true, required: true, aliases: ["label", "children"] }],
  render: (_node, props) => el("span", { class: "rui-eyebrow" }, [asString(props.text)]),
};

/* ----------------------------------------------------------------------- *
 * Section page-band (Part II.1)
 * ----------------------------------------------------------------------- */

export const Section: ComponentSpec = {
  name: "Section",
  description:
    "Full-bleed page band → centered max-width container → optional tinted " +
    "background → optional eyebrow/title/subtitle header. The single most " +
    "useful primitive for marketing, docs, and settings pages. Children " +
    "render below the header.",
  props: [
    { name: "children", type: "Node[]", positional: true, required: true },
    { name: "background", type: "string", optional: true, enum: ["base", "soft", "surface", "muted", "brand"], aliases: ["bg"] },
    { name: "width", type: "string", optional: true, enum: ["sm", "md", "lg", "xl", "full"] },
    { name: "padding", type: "string", optional: true, enum: ["none", "xs", "sm", "md", "lg", "xl"], description: "Band padding preset (default md)" },
    { name: "align", type: "string", optional: true, enum: ["left", "center"] },
    { name: "eyebrow", type: "string", optional: true },
    { name: "title", type: "string | Node[]", optional: true },
    { name: "subtitle", type: "string", optional: true, aliases: ["description"] },
    { name: "id", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const bg = asString(props.background, "base");
    const root = el("section", {
      class: "rui-section",
      "data-bg": bg !== "base" ? bg : null,
      "data-pad": normalizeSpacingToken(props.padding, asString(props.padding)) || null,
      "data-align": asString(props.align) || null,
      id: asString(props.id) || null,
    });
    const inner = el("div", { class: "rui-section-inner", "data-w": asString(props.width, "lg") });
    const eyebrow = asString(props.eyebrow);
    const hasTitle = props.title != null && (typeof props.title !== "string" || props.title !== "");
    const subtitle = asString(props.subtitle);
    if (eyebrow || hasTitle || subtitle) {
      const head = el("div", { class: "rui-section-head" });
      if (eyebrow) head.append(el("span", { class: "rui-eyebrow" }, [eyebrow]));
      if (hasTitle) {
        const h = el("h2", { class: "rui-section-title" });
        appendInline(h, props.title, helpers);
        head.append(h);
      }
      if (subtitle) head.append(el("p", { class: "rui-section-sub" }, [subtitle]));
      inner.append(head);
    }
    for (const child of asArray(props.children)) inner.append(helpers.renderNode(child));
    root.append(inner);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Overlay positioning (Part II.3)
 * ----------------------------------------------------------------------- */

export const OverlayItem: ComponentSpec = {
  name: "OverlayItem",
  description: "A child positioned over an Overlay's base. `anchor` picks a corner/edge/center.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "anchor", type: "string", optional: true, enum: ["top-left", "top-right", "bottom-left", "bottom-right", "top", "bottom", "left", "right", "center"] },
    { name: "offset", type: "string", optional: true, description: "Inset distance (CSS length, e.g. 8px or 1rem)" },
  ],
  render: (_node, props, helpers) => {
    const wrap = el("div", {
      class: "rui-overlay-item",
      "data-anchor": asString(props.anchor, "top-right"),
      style: props.offset ? `--ak-ov-off:${asString(props.offset)}` : null,
    });
    if (props.child != null) wrap.append(helpers.renderNode(props.child));
    return wrap;
  },
};

export const Overlay: ComponentSpec = {
  name: "Overlay",
  description:
    "Layers OverlayItem children on top of a base node — corner badges, " +
    "play buttons over thumbnails, sale ribbons, floating actions. Pass the " +
    "base as the positional argument and `items` as OverlayItem entries.",
  props: [
    { name: "base", type: "Node", positional: true, required: true },
    { name: "items", type: "OverlayItem[]", aliases: ["overlays"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-overlay" });
    if (props.base != null) {
      const base = el("div", { class: "rui-overlay-base" });
      base.append(helpers.renderNode(props.base));
      root.append(base);
    }
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Brand + marketing nav/footer (Part VIII.1)
 * ----------------------------------------------------------------------- */

export const Brand: ComponentSpec = {
  name: "Brand",
  description: "Logo + product name (+ optional version pill), linking home. Use in NavBar/Footer.",
  props: [
    { name: "name", type: "string", positional: true, required: true, aliases: ["label"] },
    { name: "logo", type: "string", optional: true, description: "Logo image src URL, e.g. https://example.com/logo.png" },
    { name: "version", type: "string", optional: true },
    { name: "href", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("a", { class: "rui-brand", href: sanitiseHref(props.href, "#") });
    const logo = sanitiseImageSrc(props.logo);
    if (logo) root.append(el("img", { class: "rui-brand-logo", src: logo, alt: "" }));
    root.append(el("span", {}, [asString(props.name)]));
    const version = asString(props.version);
    if (version) root.append(el("span", { class: "rui-brand-version" }, [version]));
    return root;
  },
};

export const NavBar: ComponentSpec = {
  name: "NavBar",
  description:
    "Marketing top navigation: brand on the left, links in the middle, " +
    "actions (buttons/toggles) on the right. `sticky` pins it; `blur` adds a " +
    "frosted-glass backdrop. On narrow viewports the links collapse behind a " +
    "burger toggle. Distinct from the app-shell Navbar/TopBar.",
  props: [
    { name: "brand", type: "Node", optional: true },
    { name: "links", type: "Node[]", optional: true, description: "NavLink / Link nodes" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons, ThemeToggle, IconButton, etc." },
    { name: "sticky", type: "boolean", optional: true },
    { name: "blur", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("header", {
      class: "rui-navbar2",
      "data-sticky": asBoolean(props.sticky) ? "true" : null,
      "data-blur": asBoolean(props.blur) ? "true" : null,
    });
    if (props.brand != null) root.append(helpers.renderNode(props.brand));
    const links = asArray<unknown>(props.links);
    if (links.length > 0) {
      const nav = el("nav", { class: "rui-navbar2-links", id: "rui-navbar2-menu", "aria-label": "Primary" });
      for (const l of links) nav.append(helpers.renderNode(l));
      root.append(nav);
      // Mobile burger — CSS shows it below the breakpoint and switches the
      // links row into a dropdown panel gated by `data-menu-open`.
      const burger = el("button", {
        class: "rui-navbar2-burger",
        type: "button",
        "aria-label": "Menu",
        "aria-expanded": "false",
        "aria-controls": "rui-navbar2-menu",
      }) as HTMLButtonElement;
      const burgerIcon = renderIcon("bars");
      if (burgerIcon) burger.append(burgerIcon); else burger.textContent = "≡";
      burger.onclick = (event: Event) => {
        const liveBtn = ((event.currentTarget ?? event.target) as HTMLElement | null);
        const live = liveBtn?.closest(".rui-navbar2") as HTMLElement | null;
        if (!live) return;
        const open = live.getAttribute("data-menu-open") === "true";
        live.setAttribute("data-menu-open", open ? "false" : "true");
        liveBtn?.setAttribute("aria-expanded", open ? "false" : "true");
      };
      root.append(burger);
    }
    const actions = el("div", { class: "rui-navbar2-actions" });
    for (const a of asArray(props.actions)) actions.append(helpers.renderNode(a));
    root.append(actions);
    return root;
  },
};

export const FooterColumn: ComponentSpec = {
  name: "FooterColumn",
  description: "A titled column of links inside a Footer.",
  props: [
    { name: "title", type: "string", positional: true, required: true },
    { name: "links", type: "Node[]", aliases: ["children", "items"] },
  ],
  render: (_node, props, helpers) => {
    const col = el("div", { class: "rui-footer-col" });
    col.append(el("h5", {}, [asString(props.title)]));
    const list = el("div", { class: "rui-footer-col-links" });
    for (const l of asArray(props.links)) list.append(helpers.renderNode(l));
    col.append(list);
    return col;
  },
};

export const Footer: ComponentSpec = {
  name: "Footer",
  description:
    "Site footer: brand + tagline in a wide first column, then link columns, " +
    "and a legal/copyright line. Pass `columns` as FooterColumn nodes.",
  props: [
    { name: "brand", type: "Node", optional: true },
    { name: "tagline", type: "string", optional: true },
    { name: "columns", type: "FooterColumn[]", optional: true },
    { name: "legal", type: "string", optional: true, aliases: ["copyright"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("footer", { class: "rui-footer" });
    const cols = asArray<unknown>(props.columns);
    const grid = el("div", { class: "rui-footer-grid", style: `--ak-foot-cols:${Math.max(1, cols.length)}` });
    const brandCol = el("div", { class: "rui-footer-brand" });
    if (props.brand != null) brandCol.append(helpers.renderNode(props.brand));
    const tagline = asString(props.tagline);
    if (tagline) brandCol.append(el("p", { class: "rui-footer-tagline" }, [tagline]));
    grid.append(brandCol);
    for (const c of cols) grid.append(helpers.renderNode(c));
    root.append(grid);
    const legal = asString(props.legal);
    if (legal) root.append(el("div", { class: "rui-footer-legal" }, [legal]));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * LogoCloud (Part VIII.1)
 * ----------------------------------------------------------------------- */

export const LogoChip: ComponentSpec = {
  name: "LogoChip",
  description: "A single labelled chip (icon + name) for a LogoCloud.",
  props: [
    { name: "label", type: "string", positional: true, required: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome name (e.g. brands:react)" },
  ],
  render: (_node, props) => {
    const chip = el("span", { class: "rui-logochip" });
    const icon = renderIcon(props.icon);
    if (icon) chip.append(icon);
    chip.append(document.createTextNode(asString(props.label)));
    return chip;
  },
};

export const LogoCloud: ComponentSpec = {
  name: "LogoCloud",
  description: "A centered, wrapping row of LogoChip items with an optional label — 'works with' / 'trusted by' bands.",
  props: [
    { name: "items", type: "LogoChip[]", positional: true, required: true, aliases: ["children", "chips"] },
    { name: "label", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-logocloud" });
    const label = asString(props.label);
    if (label) root.append(el("p", { class: "rui-logocloud-label" }, [label]));
    const row = el("div", { class: "rui-logocloud-row" });
    for (const item of asArray(props.items)) row.append(helpers.renderNode(item));
    root.append(row);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * CountUp + MetricStrip (Part III/VIII.1)
 * ----------------------------------------------------------------------- */

interface CountUpHelpers { registerDisposer: (cleanup: () => void, key?: string) => void }

/** Animate a number from 0 → target once the element scrolls into view. */
function wireCountUp(node: HTMLElement, target: number, suffix: string, prefix: string, duration: number, helpers?: CountUpHelpers): void {
  const render = (v: number) => { node.textContent = `${prefix}${Math.round(v)}${suffix}`; };
  render(0);
  let started = false;
  const run = () => {
    if (started) return;
    started = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      render(target * eased);
      if (t < 1 && node.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  // Defer until attached so IntersectionObserver has a live target.
  setTimeout(() => {
    if (typeof IntersectionObserver === "undefined") { run(); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { run(); io.disconnect(); }
      }
    }, { threshold: 0.4 });
    io.observe(node);
    // If the number never scrolls into view, drop the observer on unmount
    // (keyed so a re-render swaps it instead of stacking).
    helpers?.registerDisposer(() => io.disconnect(), "rui-countup-io");
  }, 0);
}

export const CountUp: ComponentSpec = {
  name: "CountUp",
  description:
    "A number that animates from 0 to `value` when scrolled into view. " +
    "`prefix`/`suffix` wrap it (e.g. `$`, `+`, `%`). Respects reduced motion.",
  props: [
    { name: "value", type: "number", positional: true, required: true },
    { name: "suffix", type: "string", optional: true },
    { name: "prefix", type: "string", optional: true },
    { name: "duration", type: "number", optional: true, description: "Animation ms (default 1000)" },
  ],
  render: (_node, props, helpers) => {
    const span = el("span", { class: "rui-countup" });
    const target = asNumber(props.value, 0);
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      span.textContent = `${asString(props.prefix)}${target}${asString(props.suffix)}`;
    } else {
      wireCountUp(span, target, asString(props.suffix), asString(props.prefix), Math.max(200, asNumber(props.duration, 1000)), helpers);
    }
    return span;
  },
};

export const Metric: ComponentSpec = {
  name: "Metric",
  description: "A single big-number metric tile with a gradient accent bar and label. Use inside MetricStrip. Set `countUp` to animate.",
  props: [
    { name: "value", type: "string | number", positional: true, required: true },
    { name: "label", type: "string", optional: true },
    { name: "gradient", type: "boolean", optional: true, description: "Paint the number with the brand gradient" },
    { name: "countUp", type: "boolean", optional: true, description: "Animate numeric value from 0 on scroll-in" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-metric" });
    // Gradient is the signature look, so it defaults ON — but `gradient:
    // false` genuinely opts out (this previously ignored the prop).
    const gradient = props.gradient === undefined ? true : asBoolean(props.gradient);
    const valueEl = el("div", { class: "rui-metric-value", "data-gradient": gradient ? "true" : null });
    const raw = asString(props.value);
    const numeric = Number(raw.replace(/[^0-9.]/g, ""));
    const suffix = raw.replace(/[0-9.,\s]/g, "");
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (asBoolean(props.countUp) && Number.isFinite(numeric) && numeric > 0 && !reduce) {
      wireCountUp(valueEl, numeric, suffix, "", 1000, helpers);
    } else {
      valueEl.textContent = raw;
    }
    root.append(valueEl);
    const label = asString(props.label);
    if (label) root.append(el("div", { class: "rui-metric-label" }, [label]));
    return root;
  },
};

export const MetricStrip: ComponentSpec = {
  name: "MetricStrip",
  description: "A responsive row/grid of Metric tiles. `columns` sets the preferred count.",
  props: [
    { name: "items", type: "Metric[]", positional: true, required: true, aliases: ["children", "metrics"] },
    { name: "columns", type: "number", optional: true },
  ],
  render: (_node, props, helpers) => {
    const cols = Math.max(1, Math.min(6, Math.round(asNumber(props.columns, 4))));
    const root = el("div", { class: "rui-metricstrip", style: `--ak-metric-cols:${cols}` });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Code/dev surfaces (Part VIII.1, VIII.3)
 * ----------------------------------------------------------------------- */

function windowBar(file: string, status: unknown, helpers: { renderNode: (n: unknown) => Node }): HTMLElement {
  const bar = el("div", { class: "rui-window-bar" });
  const dots = el("span", { class: "rui-window-dots" });
  dots.append(el("i"), el("i"), el("i"));
  bar.append(dots);
  if (file) bar.append(el("span", { class: "rui-window-file" }, [file]));
  if (status != null) {
    const s = el("span", { class: "rui-window-status" });
    s.append(status instanceof Node ? status : helpers.renderNode(status));
    bar.append(s);
  }
  return bar;
}

/**
 * Pull the raw source text out of a legacy node passed as CodeWindow's
 * `code`. The canonical shape was a `CodeBlock(...)` component node —
 * resolve its `codeString` slot through the spec so this keeps working if
 * the prop order changes. Falls back to the first string argument of any
 * node.
 */
function extractCodeString(codeNode: unknown): string {
  if (typeof codeNode === "string") return codeNode;
  if (codeNode == null || typeof codeNode !== "object") return "";
  const node = codeNode as { __kind?: unknown; name?: unknown; args?: unknown[] };
  if (node.__kind !== "Component" || !Array.isArray(node.args)) return "";
  if (node.name === "CodeBlock") {
    return asString(mapPositionalArgs(CodeBlock, node.args).codeString);
  }
  return asString(node.args.find((a) => typeof a === "string"));
}

/** Map a filename extension to a highlight language for the code pane. */
const FILE_LANGUAGES: Record<string, string> = {
  aktion: "aktion", js: "js", mjs: "js", cjs: "js", jsx: "jsx", ts: "ts", tsx: "tsx",
  py: "py", css: "css", scss: "scss", less: "less", json: "json", html: "html",
  xml: "xml", svg: "svg", vue: "vue", sh: "bash", bash: "bash", zsh: "bash",
  md: "md", yml: "yaml", yaml: "yaml", sql: "sql",
};

function languageFromFile(file: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(file.trim())?.[1]?.toLowerCase();
  return ext ? FILE_LANGUAGES[ext] ?? "" : "";
}

/** Nested preview apps that already follow their host's theme attribute. */
const PREVIEW_THEME_WIRED = new WeakSet<HTMLElement>();

export const CodeWindow: ComponentSpec = {
  name: "CodeWindow",
  description:
    "An editor/IDE window chrome (traffic-light dots + filename + status " +
    "area) around source code. Pass the code as a plain STRING — it renders " +
    "through a chromeless CodeBlock that fills the pane (no inner border, " +
    "language label, or copy button), syntax-highlighted via `language` " +
    "(default: inferred from the `file` extension, else aktion). Set " +
    "`preview: true` to run the source as a LIVE app beside the code " +
    "(split view with a pulsing 'Live render' badge); a custom node is " +
    "also accepted for non-Aktion previews. The canonical way to show code " +
    "in docs/marketing.",
  props: [
    { name: "code", type: "string", positional: true, required: true, aliases: ["codeString"], description: "Source text (a legacy CodeBlock(...) node is also accepted)" },
    { name: "file", type: "string", optional: true, description: "Filename shown in the title bar" },
    { name: "language", type: "string", optional: true, description: "Highlight language (default: from the file extension, else aktion)" },
    { name: "status", type: "Node", optional: true, description: "A Badge shown at the right of the bar" },
    { name: "preview", type: "boolean | Node", optional: true, description: "true → run the source as a live Aktion preview; or a custom node" },
  ],
  render: (_node, props, helpers) => {
    const file = asString(props.file);
    // Canonical input is a string; legacy CodeBlock(...) nodes still work —
    // their source (and language, unless overridden) is lifted out and
    // re-rendered through the internal chromeless CodeBlock.
    const legacyNode = props.code != null && typeof props.code === "object"
      ? props.code as { __kind?: unknown; name?: unknown; args?: unknown[] }
      : null;
    const source = extractCodeString(props.code);
    let language = asString(props.language);
    if (!language && legacyNode?.name === "CodeBlock" && Array.isArray(legacyNode.args)) {
      language = asString(mapPositionalArgs(CodeBlock, legacyNode.args).language);
    }
    if (!language) language = languageFromFile(file) || "aktion";

    const livePreview = props.preview === true || props.preview === "true";
    const nodePreview = !livePreview && props.preview != null && props.preview !== false && props.preview !== "false"
      ? props.preview
      : null;
    const split = livePreview || nodePreview != null;

    const root = el("div", { class: "rui-codewindow" });
    const status = split && props.status == null
      ? el("span", { class: "rui-window-live" }, [el("span", { class: "rui-window-live-dot" }), "Live render"])
      : props.status;
    root.append(windowBar(file, status, helpers));

    const body = el("div", { class: "rui-codewindow-body", "data-split": split ? "true" : null });
    const codeCol = el("div", { class: "rui-codewindow-code" });
    if (source || legacyNode == null) {
      codeCol.append(CodeBlock.render(
        { __kind: "Component", name: "CodeBlock", args: [], argMeta: [] },
        { codeString: source, language, header: false },
        helpers,
      ));
    } else {
      // Exotic legacy input (a non-CodeBlock node with no string args):
      // render it as-is so old programs keep working.
      codeCol.append(helpers.renderNode(legacyNode));
    }
    body.append(codeCol);

    if (split) {
      const prev = el("div", { class: "rui-codewindow-preview" });
      if (livePreview) {
        prev.append(buildLivePreview(source, root, helpers));
      } else {
        prev.append(helpers.renderNode(nodePreview));
      }
      body.append(prev);
    }
    root.append(body);
    return root;
  },
};

/**
 * Mount a nested `<aktion-app>` that runs `source` next to the code pane.
 * The `theme` attribute must be present on EVERY render (the morph strips
 * attributes the fresh tree doesn't emit), so the last host theme is kept in
 * an instance slot and re-stamped synchronously; a deferred, per-element
 * wiring step inherits the host's current theme and follows later changes.
 */
function buildLivePreview(source: string, root: HTMLElement, helpers: RenderHelpers): HTMLElement {
  const app = document.createElement("aktion-app");
  app.setAttribute("response", source);
  const themeSlot = helpers.useInstanceState<string>("rui-codewindow-theme", "");
  if (themeSlot.get()) app.setAttribute("theme", themeSlot.get());
  setTimeout(() => {
    // Only the committed (live) element wires up — fresh trees that the
    // morph discarded are never connected.
    if (!app.isConnected || PREVIEW_THEME_WIRED.has(app)) return;
    PREVIEW_THEME_WIRED.add(app);
    const shadow = root.getRootNode();
    const host = shadow instanceof ShadowRoot ? (shadow.host as HTMLElement) : null;
    if (!host) return;
    const sync = (): void => {
      const theme = host.getAttribute("theme") ?? "";
      themeSlot.set(theme);
      if (theme) app.setAttribute("theme", theme);
      else app.removeAttribute("theme");
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(host, { attributes: true, attributeFilter: ["theme"] });
    helpers.registerDisposer(() => observer.disconnect(), "rui-codewindow-theme-sync");
  }, 0);
  return app;
}

export const BrowserFrame: ComponentSpec = {
  name: "BrowserFrame",
  description: "A browser-window chrome (dots + URL bar) wrapping a child — for screenshots/demos of web UIs.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children", "content"] },
    { name: "url", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-browserframe" });
    const bar = el("div", { class: "rui-browserframe-bar" });
    const dots = el("span", { class: "rui-window-dots" });
    dots.append(el("i"), el("i"), el("i"));
    bar.append(dots);
    bar.append(el("span", { class: "rui-browserframe-url" }, [asString(props.url, "example.com")]));
    root.append(bar);
    const body = el("div", { class: "rui-browserframe-body" });
    if (props.child != null) body.append(helpers.renderNode(props.child));
    root.append(body);
    return root;
  },
};

export const Terminal: ComponentSpec = {
  name: "Terminal",
  description: "A terminal window rendering monospace lines. Pass `lines` as an array of strings.",
  props: [
    { name: "lines", type: "string[]", positional: true, required: true, aliases: ["children", "content"] },
    { name: "file", type: "string", optional: true, description: "Title-bar label (default 'bash')" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-terminal" });
    root.append(windowBar(asString(props.file, "bash"), null, helpers));
    const body = el("div", { class: "rui-terminal-body" });
    const lines = asArray<unknown>(props.lines);
    body.textContent = lines.map((l) => asString(l)).join("\n");
    root.append(body);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Backdrop decoration (Part IV.1)
 * ----------------------------------------------------------------------- */

const BACKDROP_BLOB_POS = [
  { t: "-160px", l: "-120px", d: "0s" },
  { t: "-80px", r: "-120px", d: "-6s" },
  { t: "46%", l: "34%", d: "-12s" },
];

const BACKDROP_TYPES = ["network", "drift", "snow", "stars", "bubbles"] as const;
const BACKDROP_PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#22d3ee"];

const safeCssColor = (c: string, fallback: string): string =>
  /^[#a-zA-Z0-9(),.%\s-]+$/.test(c) && c.length <= 64 && c.trim() !== "" ? c.trim() : fallback;

interface BackdropParticle {
  x: number; y: number; vx: number; vy: number;
  r: number; c: string; phase: number;
}

/** Canvases that already run a particle engine (live elements only). */
const BACKDROP_ENGINES = new WeakSet<HTMLCanvasElement>();

/**
 * Animated particle field. The engine attaches once per LIVE canvas (the
 * morph keeps the first render's element and discards later trees) and
 * reads its configuration from `data-*` attributes every frame, so reactive
 * prop changes — synced onto the kept element by the morph — retune the
 * animation without restarting it. Honours prefers-reduced-motion by
 * painting a single static frame.
 */
function startBackdropEngine(canvas: HTMLCanvasElement, helpers: RenderHelpers): void {
  if (!canvas.isConnected || BACKDROP_ENGINES.has(canvas)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  BACKDROP_ENGINES.add(canvas);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let particles: BackdropParticle[] = [];
  let w = 0;
  let h = 0;
  let dpr = 1;
  let signature = "";
  let raf = 0;
  let tick = 0;

  const readConfig = () => {
    const count = Math.max(0, Math.min(120, Math.round(Number(canvas.dataset.count) || 0)));
    const typeRaw = canvas.dataset.type ?? "network";
    const type = (BACKDROP_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "network";
    const speed = Math.max(0.1, Math.min(4, Number(canvas.dataset.speed) || 1));
    const link = Math.max(40, Math.min(240, Number(canvas.dataset.link) || 130));
    const size = Math.max(0.5, Math.min(6, Number(canvas.dataset.size) || 2.2));
    const colors = (canvas.dataset.colors ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    return { count, type, speed, link, size, colors: colors.length > 0 ? colors : BACKDROP_PALETTE };
  };

  const seed = (): void => {
    const cfg = readConfig();
    particles = Array.from({ length: cfg.count }, (_unused, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5 * dpr,
      vy: (Math.random() - 0.5) * 0.5 * dpr,
      r: (Math.random() * (cfg.size - 0.5) + 0.5) * dpr,
      c: cfg.colors[i % cfg.colors.length]!,
      phase: Math.random() * Math.PI * 2,
    }));
  };

  const resize = (): void => {
    const host = canvas.parentElement ?? canvas;
    const rect = host.getBoundingClientRect();
    dpr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, 2);
    w = Math.max(1, Math.round(rect.width * dpr));
    h = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    seed();
  };

  const drawFrame = (): void => {
    const cfg = readConfig();
    const sig = `${cfg.count}|${cfg.type}|${cfg.colors.join(",")}`;
    if (sig !== signature) { signature = sig; seed(); }
    // The morph can strip the width/height set here (the fresh tree never
    // emits them); heal the drawing buffer if that ever happens.
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    tick += 1;
    const sp = cfg.speed;

    for (const p of particles) {
      switch (cfg.type) {
        case "drift":
          p.x += p.vx * 0.5 * sp; p.y += p.vy * 0.5 * sp;
          if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
          ctx.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(tick / 60 + p.phase));
          break;
        case "snow":
          p.y += (0.4 + Math.abs(p.vy)) * sp;
          p.x += Math.sin(tick / 50 + p.phase) * 0.4 * dpr;
          if (p.y > h + 6) { p.y = -6; p.x = Math.random() * w; }
          ctx.globalAlpha = 0.8;
          break;
        case "stars":
          ctx.globalAlpha = 0.15 + 0.65 * Math.abs(Math.sin(tick / 40 * sp + p.phase));
          break;
        case "bubbles":
          p.y -= (0.5 + Math.abs(p.vy)) * sp;
          p.x += Math.sin(tick / 40 + p.phase) * 0.5 * dpr;
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
          ctx.globalAlpha = 0.5;
          break;
        default: // network
          p.x += p.vx * sp; p.y += p.vy * sp;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
          ctx.globalAlpha = 0.7;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      if (cfg.type === "bubbles") {
        ctx.strokeStyle = p.c;
        ctx.lineWidth = dpr;
        ctx.stroke();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = p.c;
        ctx.fill();
      } else {
        ctx.fillStyle = p.c;
        ctx.fill();
      }
    }

    if (cfg.type === "network") {
      const link = cfg.link * dpr;
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i]!;
          const b = particles[j]!;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < link) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = a.c;
            ctx.globalAlpha = (1 - dist / link) * 0.18;
            ctx.lineWidth = dpr * 0.6;
            ctx.stroke();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  const loop = (): void => {
    raf = 0;
    if (!canvas.isConnected) { BACKDROP_ENGINES.delete(canvas); return; }
    drawFrame();
    raf = requestAnimationFrame(loop);
  };

  resize();
  if (reduce) {
    drawFrame();
  } else {
    raf = requestAnimationFrame(loop);
  }
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(canvas.parentElement ?? canvas);
  helpers.registerDisposer(() => {
    if (raf) cancelAnimationFrame(raf);
    observer?.disconnect();
    BACKDROP_ENGINES.delete(canvas);
  }, "rui-backdrop-engine");
}

export const Backdrop: ComponentSpec = {
  name: "Backdrop",
  description:
    "Decorative background layer for hero/marketing sections: a masked grid, " +
    "floating blurred color 'blobs', and an animated canvas particle field. " +
    "`type` picks the particle behaviour — `network` (drifting dots joined " +
    "by constellation lines, the default), `drift`, `snow`, `stars`, or " +
    "`bubbles` — tuned via `particleColors`, `speed`, `linkDistance`, and " +
    "`particleSize`. All theme-aware and motion-safe. Place as the first " +
    "child of a Section (which is `position: relative`).",
  props: [
    { name: "grid", type: "boolean", optional: true, description: "Show the masked line grid" },
    { name: "blobs", type: "string[]", optional: true, description: "Colors for floating blur orbs (CSS colors)" },
    { name: "particles", type: "number", optional: true, description: "Particle count (0 = none, max 120)" },
    { name: "type", type: "string", optional: true, enum: [...BACKDROP_TYPES], aliases: ["particleType"], description: "Particle behaviour (default network)" },
    { name: "particleColors", type: "string[]", optional: true, aliases: ["colors"], description: "Particle palette (CSS colors; defaults to the brand palette)" },
    { name: "speed", type: "number", optional: true, description: "Animation speed multiplier 0.1–4 (default 1)" },
    { name: "linkDistance", type: "number", optional: true, description: "Max px between linked network particles (default 130)" },
    { name: "particleSize", type: "number", optional: true, description: "Max particle radius in px (default 2.2)" },
    { name: "fixed", type: "boolean", optional: true, description: "Pin to the viewport instead of the section" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-backdrop", "data-fixed": asBoolean(props.fixed) ? "true" : null, "aria-hidden": "true" });
    if (asBoolean(props.grid)) root.append(el("div", { class: "rui-backdrop-grid" }));
    const blobs = asArray<unknown>(props.blobs).slice(0, 3);
    blobs.forEach((c, i) => {
      const color = asString(c);
      const pos = BACKDROP_BLOB_POS[i]!;
      const size = 460 - i * 40;
      const style = [
        `width:${size}px`, `height:${size}px`,
        pos.t ? `top:${pos.t}` : "", pos.l ? `left:${pos.l}` : "", pos.r ? `right:${pos.r}` : "",
        `background:radial-gradient(circle, ${safeCssColor(color, "#6366f1")}, transparent 70%)`,
        `animation-delay:${pos.d}`,
      ].filter(Boolean).join(";");
      root.append(el("div", { class: "rui-backdrop-blob", style }));
    });
    const count = Math.max(0, Math.min(120, Math.round(asNumber(props.particles || 50, 0))));
    if (count > 0) {
      const typeRaw = asString(props.type, "network");
      const palette = asArray<unknown>(props.particleColors)
        .map((c) => safeCssColor(asString(c), ""))
        .filter(Boolean)
        .slice(0, 8);
      const canvas = el("canvas", {
        class: "rui-backdrop-canvas",
        "data-count": String(count),
        "data-type": (BACKDROP_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "network",
        "data-speed": String(Math.max(0.1, Math.min(4, asNumber(props.speed, 1)))),
        "data-link": String(Math.max(40, Math.min(240, asNumber(props.linkDistance, 130)))),
        "data-size": String(Math.max(0.5, Math.min(6, asNumber(props.particleSize, 2.2)))),
        "data-colors": (palette.length > 0 ? palette : BACKDROP_PALETTE).join(","),
      });
      root.append(canvas);
      // Engine wiring is deferred so only the committed element animates;
      // discarded fresh trees never connect, so they never start a loop.
      setTimeout(() => startBackdropEngine(canvas, helpers), 0);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ThemeToggle + Swatch (Part VII.4, VIII.1)
 * ----------------------------------------------------------------------- */

export const ThemeToggle: ComponentSpec = {
  name: "ThemeToggle",
  description:
    "A sun/moon button that toggles the host between light and dark themes — " +
    "no host glue required. It flips the <aktion-app> `theme` attribute and " +
    "dispatches a `theme-change` event the host can listen for.",
  props: [
    { name: "light", type: "string", optional: true, description: "Theme name when toggled to light (default 'light')" },
    { name: "dark", type: "string", optional: true, description: "Theme name when toggled to dark (default 'dark')" },
  ],
  render: (_node, props) => {
    const lightName = asString(props.light, "light");
    const darkName = asString(props.dark, "dark");
    const btn = el("button", { class: "rui-theme-toggle", type: "button", "aria-label": "Toggle dark mode", title: "Toggle theme" }) as HTMLButtonElement;
    const icon = renderIcon("moon");
    if (icon) btn.append(icon);
    // Read from the live event target (not the closure element) so the
    // handler keeps working after the morph reconciler reuses a prior DOM
    // node — `currentTarget` is always the on-page element.
    const hostFrom = (node: EventTarget | null): HTMLElement | undefined => {
      const root = (node as Node | null)?.getRootNode?.();
      return root && (root as ShadowRoot).host ? ((root as ShadowRoot).host as HTMLElement) : undefined;
    };
    const paint = (target: EventTarget | null) => {
      const host = hostFrom(target);
      const isDark = host ? (host.getAttribute("theme") || "").toLowerCase().includes("dark") : false;
      const live = (target as HTMLElement) ?? btn;
      live.replaceChildren(renderIcon(isDark ? "sun" : "moon") ?? document.createTextNode(""));
    };
    setTimeout(() => paint(btn), 0);
    btn.onclick = (event: Event) => {
      const target = event.currentTarget ?? event.target;
      const host = hostFrom(target);
      if (!host) return;
      const cur = (host.getAttribute("theme") || lightName).toLowerCase();
      const next = cur.includes("dark") ? lightName : darkName;
      host.setAttribute("theme", next);
      host.dispatchEvent(new CustomEvent("theme-change", { detail: { theme: next }, bubbles: true, composed: true }));
      setTimeout(() => paint(target), 0);
    };
    return btn;
  },
};

export const Swatch: ComponentSpec = {
  name: "Swatch",
  description: "A theme/palette preview tile — color dots over a named background. For theming galleries.",
  props: [
    { name: "name", type: "string", positional: true, required: true },
    { name: "background", type: "string", optional: true, description: "Tile background CSS color" },
    { name: "foreground", type: "string", optional: true, description: "Tile text CSS color" },
    { name: "colors", type: "string[]", optional: true, description: "Accent dot colors" },
  ],
  render: (_node, props) => {
    const safe = (c: string, fb: string) => (/^[#a-zA-Z0-9(),.%\s-]+$/.test(c) && c.length <= 64 ? c : fb);
    const bg = safe(asString(props.background, "#ffffff"), "#ffffff");
    const fg = safe(asString(props.foreground, "#0f172a"), "#0f172a");
    const root = el("div", { class: "rui-swatch", style: `background:${bg};color:${fg}` });
    const dots = el("div", { class: "rui-swatch-dots" });
    for (const c of asArray<unknown>(props.colors).slice(0, 5)) {
      dots.append(el("i", { style: `background:${safe(asString(c), "#6366f1")}` }));
    }
    root.append(dots);
    root.append(el("div", { class: "rui-swatch-name" }, [asString(props.name)]));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Utility components (Part VIII.8)
 * ----------------------------------------------------------------------- */

/** Pending revert timers, keyed by the live button element. */
const COPY_RESET_TIMERS = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export const CopyButton: ComponentSpec = {
  name: "CopyButton",
  description:
    "A button that copies `text` to the clipboard and confirms it — the " +
    "label flips to `copiedLabel` (default 'Copied!') with a check icon for " +
    "a couple of seconds, then reverts. Bounded, no host glue.",
  props: [
    { name: "text", type: "string", positional: true, required: true, aliases: ["value"] },
    { name: "label", type: "string", optional: true, description: "Button label (default 'Copy')" },
    { name: "copiedLabel", type: "string", optional: true, description: "Confirmation label (default 'Copied!')" },
  ],
  render: (_node, props) => {
    const label = asString(props.label, "Copy");
    const copiedLabel = asString(props.copiedLabel, "Copied!");
    const btn = el("button", { class: "rui-copy-button", type: "button" }) as HTMLButtonElement;
    const icon = renderIcon("copy", { className: "rui-copy-button-icon" });
    if (icon) btn.append(icon);
    btn.append(el("span", { class: "rui-copy-button-label" }, [label]));
    // All DOM reads/writes go through `event.currentTarget` — the closure's
    // `btn` is detached once the morph reconciler keeps a previous render's
    // element, but `currentTarget` is always the on-page button.
    btn.onclick = (event: Event) => {
      const live = ((event.currentTarget ?? event.target) as HTMLElement | null) ?? btn;
      const text = asString(props.text);
      const fallbackCopy = (): void => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
          document.body.append(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        } catch { /* clipboard unavailable */ }
      };
      try {
        const written = navigator.clipboard?.writeText(text);
        if (written && typeof written.catch === "function") written.catch(fallbackCopy);
        else if (!navigator.clipboard) fallbackCopy();
      } catch { fallbackCopy(); }

      const paint = (copied: boolean): void => {
        if (copied) live.setAttribute("data-copied", "true");
        else live.removeAttribute("data-copied");
        const labelEl = live.querySelector(".rui-copy-button-label");
        if (labelEl) labelEl.textContent = copied ? copiedLabel : label;
        const iconEl = live.querySelector(".rui-copy-button-icon");
        if (iconEl) {
          const next = renderIcon(copied ? "check" : "copy", { className: "rui-copy-button-icon" });
          if (next) iconEl.replaceWith(next);
        }
      };
      paint(true);
      const prior = COPY_RESET_TIMERS.get(live);
      if (prior) clearTimeout(prior);
      COPY_RESET_TIMERS.set(live, setTimeout(() => {
        COPY_RESET_TIMERS.delete(live);
        paint(false);
      }, 2000));
    };
    return btn;
  },
};

export const SegmentedControl: ComponentSpec = {
  name: "SegmentedControl",
  description:
    "A compact segmented toggle (iOS-style). `options` is an array of strings " +
    "or {label, value}. Bind `value` to a $variable; `onChange(value)` fires " +
    "on select.",
  props: [
    { name: "options", type: "any[]", positional: true, required: true, aliases: ["items"] },
    { name: "value", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"] },
  ],
  render: (node, props, helpers) => {
    const root = el("div", { class: "rui-segmented", role: "tablist" });
    const current = asString(props.value);
    for (const raw of asArray<unknown>(props.options)) {
      const opt = (raw && typeof raw === "object") ? raw as { label?: unknown; value?: unknown } : { label: raw, value: raw };
      const value = asString(opt.value ?? opt.label);
      const label = asString(opt.label ?? opt.value);
      const btn = el("button", { type: "button", role: "tab", "aria-pressed": value === current ? "true" : "false" }, [label]) as HTMLButtonElement;
      btn.onclick = () => {
        const meta = node.argMeta?.[1];
        if (meta?.stateRef) helpers.setState(meta.stateRef, value);
        helpers.invoke(props.onChange, value);
      };
      root.append(btn);
    }
    return root;
  },
};

export const FloatingActionButton: ComponentSpec = {
  name: "FloatingActionButton",
  description: "A fixed circular action button (FAB) anchored bottom-right. `icon` + `onClick`.",
  props: [
    { name: "icon", type: "string", positional: true, required: true },
    { name: "label", type: "string", optional: true, description: "Accessible label" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] },
  ],
  render: (_node, props, helpers) => {
    const btn = el("button", { class: "rui-fab", type: "button", "aria-label": asString(props.label, "Action") }) as HTMLButtonElement;
    const icon = renderIcon(props.icon, { size: "lg" });
    if (icon) btn.append(icon);
    btn.onclick = () => helpers.invoke(props.onClick);
    return btn;
  },
};

export const Prose: ComponentSpec = {
  name: "Prose",
  description:
    "A styled long-form reading container — applies typographic defaults to " +
    "headings, lists, blockquotes, code, links inside. Wrap Markdown(...) or " +
    "raw nodes for blog posts, docs bodies, product descriptions.",
  props: [
    { name: "children", type: "Node[]", positional: true, required: true, aliases: ["content"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-prose", "data-size": asString(props.size, "md") });
    for (const child of asArray(props.children)) {
      if (typeof child === "string") root.append(document.createTextNode(child));
      else root.append(helpers.renderNode(child));
    }
    return root;
  },
};

export const RelativeTime: ComponentSpec = {
  name: "RelativeTime",
  description: "Renders a human relative time ('3m ago', 'in 2 days') from an ISO date/timestamp, localized via Intl.",
  props: [
    { name: "value", type: "string | number", positional: true, required: true, aliases: ["date", "time"] },
  ],
  render: (_node, props) => {
    const raw = props.value;
    const date = typeof raw === "number" ? new Date(raw) : new Date(asString(raw));
    const span = el("span", { class: "rui-relative-time" });
    if (Number.isNaN(date.getTime())) { span.textContent = asString(raw); return span; }
    const diffMs = date.getTime() - Date.now();
    const abs = Math.abs(diffMs);
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["year", 31536e6], ["month", 2592e6], ["week", 6048e5],
      ["day", 864e5], ["hour", 36e5], ["minute", 6e4], ["second", 1e3],
    ];
    let label = "just now";
    try {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      for (const [unit, ms] of units) {
        if (abs >= ms || unit === "second") { label = rtf.format(Math.round(diffMs / ms), unit); break; }
      }
    } catch { label = date.toLocaleString(); }
    span.textContent = label;
    span.setAttribute("title", date.toLocaleString());
    return span;
  },
};

/* ----------------------------------------------------------------------- *
 * E-commerce (Part VIII.2)
 * ----------------------------------------------------------------------- */

export const PriceTag: ComponentSpec = {
  name: "PriceTag",
  description: "A formatted price with an optional struck-through compare-at price and a discount badge.",
  props: [
    { name: "price", type: "string | number", positional: true, required: true },
    { name: "compareAt", type: "string | number", optional: true, aliases: ["was", "original"] },
    { name: "currency", type: "string", optional: true, description: "Currency symbol/prefix (default '$')" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
  ],
  render: (_node, props) => {
    const cur = asString(props.currency, "$");
    const fmt = (v: unknown) => `${cur}${asString(v)}`;
    const root = el("span", { class: "rui-pricetag", "data-size": asString(props.size, "md") });
    root.append(el("span", { class: "rui-pricetag-now" }, [fmt(props.price)]));
    if (props.compareAt != null && asString(props.compareAt) !== "") {
      root.append(el("span", { class: "rui-pricetag-was" }, [fmt(props.compareAt)]));
      const now = Number(asString(props.price).replace(/[^0-9.]/g, ""));
      const was = Number(asString(props.compareAt).replace(/[^0-9.]/g, ""));
      if (Number.isFinite(now) && Number.isFinite(was) && was > now && was > 0) {
        const pct = Math.round((1 - now / was) * 100);
        root.append(el("span", { class: "rui-pricetag-off" }, [`-${pct}%`]));
      }
    }
    return root;
  },
};

export const QuantityStepper: ComponentSpec = {
  name: "QuantityStepper",
  description: "A −/value/+ numeric stepper. Bind `value` to a $variable; `onChange(value)` fires on change. Respects min/max.",
  props: [
    { name: "value", type: "number", positional: true, required: true },
    { name: "min", type: "number", optional: true },
    { name: "max", type: "number", optional: true },
    { name: "step", type: "number", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"] },
  ],
  render: (node, props, helpers) => {
    const min = props.min != null ? asNumber(props.min) : -Infinity;
    const max = props.max != null ? asNumber(props.max) : Infinity;
    const step = asNumber(props.step, 1);
    const current = asNumber(props.value, 0);
    const ref = node.argMeta?.[0]?.stateRef;
    const root = el("div", { class: "rui-qty" });
    const set = (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      if (ref) helpers.setState(ref, clamped);
      helpers.invoke(props.onChange, clamped);
    };
    const minus = el("button", { type: "button", "aria-label": "Decrease", disabled: current <= min ? "" : null }, ["−"]) as HTMLButtonElement;
    minus.onclick = () => set(current - step);
    const valueEl = el("span", { class: "rui-qty-value" }, [String(current)]);
    const plus = el("button", { type: "button", "aria-label": "Increase", disabled: current >= max ? "" : null }, ["+"]) as HTMLButtonElement;
    plus.onclick = () => set(current + step);
    root.append(minus, valueEl, plus);
    return root;
  },
};

export const ProductCard: ComponentSpec = {
  name: "ProductCard",
  description:
    "An e-commerce product card: image, title, optional rating, a PriceTag, " +
    "and an add-to-cart action. Pass `price`/`compareAt` directly or a custom " +
    "`price` node.",
  props: [
    { name: "title", type: "string", positional: true, required: true },
    { name: "image", type: "string", optional: true, aliases: ["src"] },
    { name: "price", type: "string | number", optional: true },
    { name: "compareAt", type: "string | number", optional: true },
    { name: "currency", type: "string", optional: true },
    { name: "rating", type: "number", optional: true, description: "0–5 stars" },
    { name: "badge", type: "string", optional: true, description: "Corner ribbon label (e.g. 'Sale')" },
    { name: "action", type: "Node", optional: true, description: "Add-to-cart Button (defaults to one)" },
    { name: "onAdd", type: "callable", optional: true, description: "Fired by the default add button" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-product-card" });
    const media = el("div", { class: "rui-product-media" });
    const img = sanitiseImageSrc(props.image);
    if (img) media.append(el("img", { src: img, alt: asString(props.title), loading: "lazy" }));
    const badge = asString(props.badge);
    if (badge) media.append(el("span", { class: "rui-product-badge" }, [badge]));
    root.append(media);
    const body = el("div", { class: "rui-product-body" });
    body.append(el("h3", { class: "rui-product-title" }, [asString(props.title)]));
    const rating = Math.max(0, Math.min(5, Math.round(asNumber(props.rating, 0))));
    if (rating > 0) {
      const stars = el("div", { class: "rui-product-rating" });
      for (let i = 0; i < 5; i += 1) {
        const ic = renderIcon(i < rating ? "star" : "regular:star");
        if (ic) stars.append(ic);
      }
      body.append(stars);
    }
    const row = el("div", { class: "rui-product-foot" });
    if (props.price != null) {
      row.append(PriceTag.render(
        { __kind: "Component", name: "PriceTag", args: [], argMeta: [] },
        { price: props.price, compareAt: props.compareAt, currency: props.currency },
        helpers,
      ));
    }
    if (props.action != null) {
      row.append(helpers.renderNode(props.action));
    } else if (typeof props.onAdd === "function") {
      const btn = el("button", { class: "rui-product-add", type: "button", "aria-label": "Add to cart" }) as HTMLButtonElement;
      const ic = renderIcon("cart-plus");
      if (ic) btn.append(ic);
      btn.onclick = () => helpers.invoke(props.onAdd);
      row.append(btn);
    }
    body.append(row);
    root.append(body);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Content / docs (Part VIII.3)
 * ----------------------------------------------------------------------- */

export const TableOfContents: ComponentSpec = {
  name: "TableOfContents",
  description: "A navigable table of contents. `items` is an array of {label, href, level?}.",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, aliases: ["children"] },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("nav", { class: "rui-toc", "aria-label": "Table of contents" });
    const title = asString(props.title);
    if (title) root.append(el("div", { class: "rui-toc-title" }, [title]));
    const list = el("ul", { class: "rui-toc-list" });
    for (const raw of asArray<unknown>(props.items)) {
      const item = (raw ?? {}) as { label?: unknown; href?: unknown; level?: unknown };
      const li = el("li", { class: "rui-toc-item", "data-level": String(Math.max(1, Math.min(4, Math.round(asNumber(item.level, 1))))) });
      li.append(el("a", { href: sanitiseHref(item.href, "#") }, [asString(item.label)]));
      list.append(li);
    }
    root.append(list);
    return root;
  },
};

export const TypingIndicator: ComponentSpec = {
  name: "TypingIndicator",
  description: "Three animated bouncing dots — a chat 'is typing…' affordance. Optional `name` prefix.",
  props: [{ name: "name", type: "string", optional: true, positional: true }],
  render: (_node, props) => {
    const root = el("div", { class: "rui-typing", role: "status" });
    const name = asString(props.name);
    if (name) root.append(el("span", { class: "rui-typing-name" }, [`${name} is typing`]));
    const dots = el("span", { class: "rui-typing-dots", "aria-label": "typing" });
    dots.append(el("i"), el("i"), el("i"));
    root.append(dots);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Utility (Part VIII.8)
 * ----------------------------------------------------------------------- */

export const CountdownTimer: ComponentSpec = {
  name: "CountdownTimer",
  description: "Live countdown to a target date/time (ISO string or timestamp). Ticks every second, then shows `endLabel`.",
  props: [
    { name: "to", type: "string | number", positional: true, required: true, aliases: ["target", "date"] },
    { name: "endLabel", type: "string", optional: true, description: "Shown when the countdown finishes (default 'Done')" },
  ],
  render: (_node, props, helpers) => {
    const target = typeof props.to === "number" ? props.to : new Date(asString(props.to)).getTime();
    const root = el("div", { class: "rui-countdown", role: "timer" });
    const unitEl = (label: string) => {
      const u = el("div", { class: "rui-countdown-unit" });
      const v = el("div", { class: "rui-countdown-value" }, ["00"]);
      u.append(v, el("div", { class: "rui-countdown-label" }, [label]));
      return { u, v };
    };
    const d = unitEl("days"), h = unitEl("hrs"), m = unitEl("min"), s = unitEl("sec");
    root.append(d.u, h.u, m.u, s.u);
    const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
    const tick = () => {
      const diff = target - Date.now();
      if (!Number.isFinite(target) || diff <= 0) {
        root.replaceChildren(el("div", { class: "rui-countdown-done" }, [asString(props.endLabel, "Done")]));
        return false;
      }
      const sec = Math.floor(diff / 1000);
      d.v.textContent = pad(Math.floor(sec / 86400));
      h.v.textContent = pad(Math.floor((sec % 86400) / 3600));
      m.v.textContent = pad(Math.floor((sec % 3600) / 60));
      s.v.textContent = pad(sec % 60);
      return true;
    };
    if (tick()) {
      const id = setInterval(() => { if (!tick()) clearInterval(id); }, 1000);
      helpers.registerDisposer(() => clearInterval(id), "countdown");
    }
    return root;
  },
};

export const BackToTop: ComponentSpec = {
  name: "BackToTop",
  description: "A floating button that smoothly scrolls the page (and the host) back to the top.",
  props: [{ name: "label", type: "string", optional: true }],
  render: (_node, props) => {
    const btn = el("button", { class: "rui-fab rui-backtotop", type: "button", "aria-label": asString(props.label, "Back to top") }) as HTMLButtonElement;
    const ic = renderIcon("arrow-up", { size: "lg" });
    if (ic) btn.append(ic);
    btn.onclick = () => {
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
      const host = (btn.getRootNode() as ShadowRoot)?.host as HTMLElement | undefined;
      host?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    };
    return btn;
  },
};

