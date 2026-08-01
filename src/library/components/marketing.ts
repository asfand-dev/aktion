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
  normalizeSpacingToken, sanitiseCssLength, canonicalSizeToken,
} from "../utils.js";
import { deferToPaint } from "../floating.js";
import { installDismissListeners, disposeDismissListeners } from "./_internal.js";
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
    { name: "children", aliases: ["child"], type: "Node[]", positional: true, required: true },
    { name: "background", type: "string", optional: true, enum: ["base", "soft", "surface", "muted", "brand"], aliases: ["bg"] },
    { name: "width", type: "string", optional: true, enum: ["sm", "md", "lg", "xl", "full"] },
    { name: "padding", type: "string", optional: true, enum: ["none", "xs", "sm", "md", "lg", "xl"], description: "Band padding preset (default md)" },
    { name: "align", type: "string", optional: true, enum: ["left", "center"], description: "Centers the generated eyebrow/title/subtitle header; children keep their own alignment" },
    { name: "eyebrow", type: "string", optional: true },
    { name: "title", type: "string | Node[]", optional: true },
    { name: "subtitle", type: "string", optional: true, aliases: ["description"] },
    { name: "id", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true, description: "Trailing header actions (e.g. a 'See all' Button), aligned opposite the title" },
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
    const actions = asArray<unknown>(props.actions);
    if (eyebrow || hasTitle || subtitle || actions.length > 0) {
      const head = el("div", { class: "rui-section-head", "data-has-actions": actions.length > 0 ? "true" : null });
      // Only introduce the text wrapper when there is something to sit beside
      // it, so the plain header keeps its existing (single-column) structure.
      const textCol = actions.length > 0 ? el("div", { class: "rui-section-head-text" }) : head;
      if (eyebrow) textCol.append(el("span", { class: "rui-eyebrow" }, [eyebrow]));
      if (hasTitle) {
        const h = el("h2", { class: "rui-section-title" });
        appendInline(h, props.title, helpers);
        textCol.append(h);
      }
      if (subtitle) textCol.append(el("p", { class: "rui-section-sub" }, [subtitle]));
      if (textCol !== head) {
        head.append(textCol);
        const actionRow = el("div", { class: "rui-section-actions" });
        for (const action of actions) actionRow.append(helpers.renderNode(action));
        head.append(actionRow);
      }
      inner.append(head);
    }
    // A Backdrop must be a SIBLING of the content wrapper, not a child of it.
    // Per CSS painting order a positioned `z-index: 0` layer paints after the
    // in-flow, unpositioned content around it — so nesting the decorative grid /
    // blobs / particle canvas inside `.rui-section-inner` drew them over the hero
    // copy. Hoisted out and paired with a `z-index: 1` content wrapper, the band
    // content always wins. (Matched on the rendered class so it also catches a
    // Backdrop reached through a wrapper component.)
    const decor: Node[] = [];
    for (const child of asArray(props.children)) {
      const rendered = helpers.renderNode(child);
      if (rendered instanceof HTMLElement && rendered.classList.contains("rui-backdrop")) decor.push(rendered);
      else inner.append(rendered);
    }
    if (decor.length > 0) {
      root.append(...decor);
      inner.setAttribute("style", "position:relative;z-index:1");
    }
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
      // Validated as a CSS length: a raw value could otherwise close the custom
      // property with `;` and append arbitrary declarations to this element.
      style: props.offset ? `--ak-ov-off:${sanitiseCssLength(props.offset, "8px")}` : null,
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
    { name: "items", type: "OverlayItem[]", optional: true, aliases: ["overlays"] },
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
    // `logo` is the original spelling and is still used by shipped .aktion demo
    // programs; validate.ts treats an undeclared prop as a fatal error, so the
    // alias is what keeps those programs compiling.
    { name: "logoSrc", type: "string", optional: true, aliases: ["logo"], description: "Logo image src URL, e.g. https://example.com/logo.png" },
    { name: "version", type: "string", optional: true },
    { name: "href", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("a", { class: "rui-brand", href: sanitiseHref(props.href, "#") });
    const logo = sanitiseImageSrc(props.logoSrc);
    const name = asString(props.name);
    if (logo) root.append(el("img", { class: "rui-brand-logo", src: logo, alt: name || "" }));
    root.append(el("span", {}, [name]));
    const version = asString(props.version);
    if (version) root.append(el("span", { class: "rui-brand-version" }, [version]));
    return root;
  },
};

/** Source of unique mobile-menu ids (one NavBar per shadow root is not a given). */
let NAVBAR_MENU_SEQ = 0;

/** Mirror the burger state onto the live nav so the change is visible now. */
function paintNavMenu(live: HTMLElement, open: boolean): void {
  live.setAttribute("data-menu-open", open ? "true" : "false");
  live.querySelector(".rui-navbar2-burger")?.setAttribute("aria-expanded", open ? "true" : "false");
}

export const NavBar: ComponentSpec = {
  name: "NavBar",
  description:
    "Marketing top navigation: brand on the left, links in the middle, " +
    "actions (buttons/toggles) on the right. `sticky` pins it; `blur` adds a " +
    "frosted-glass backdrop. On narrow viewports the links collapse behind a " +
    "burger toggle. Distinct from the app-shell Navbar/TopBar.",
  props: [
    { name: "brand", type: "Node", optional: true },
    // `items` is accepted too: this component and the app-shell `Navbar` differ by
    // one letter of case, so an author who reaches for the wrong one should not
    // also hit a hard validator error on the slot name.
    { name: "links", type: "Node[]", optional: true, aliases: ["items"], description: "NavLink / Link nodes" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons, ThemeToggle, IconButton, etc." },
    { name: "sticky", type: "boolean", optional: true },
    { name: "blur", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    // The open flag lives in instance state, not on the live element: the morph
    // reconciler strips any attribute the fresh tree omits, so an
    // element-only `data-menu-open` was deleted by the next unrelated commit
    // and the open mobile menu snapped shut mid-interaction.
    const openSlot = helpers.useInstanceState<boolean>("rui-navbar-menu", false);
    const menuOpen = openSlot.get();
    const links = asArray<unknown>(props.links);
    const root = el("header", {
      class: "rui-navbar2",
      "data-sticky": asBoolean(props.sticky) ? "true" : null,
      "data-blur": asBoolean(props.blur) ? "true" : null,
      "data-menu-open": links.length > 0 ? (menuOpen ? "true" : "false") : null,
    });
    if (props.brand != null) root.append(helpers.renderNode(props.brand));
    if (links.length > 0) {
      // Per-instance id: two NavBars in one shadow root would otherwise emit
      // duplicate ids and both burgers' `aria-controls` would resolve to the
      // first panel.
      const idSlot = helpers.useInstanceState<string>("rui-navbar-menu-id", "");
      let menuId = idSlot.get();
      if (!menuId) {
        NAVBAR_MENU_SEQ += 1;
        menuId = `rui-navbar2-menu-${NAVBAR_MENU_SEQ}`;
        idSlot.set(menuId);
      }
      const nav = el("nav", { class: "rui-navbar2-links", id: menuId, "aria-label": "Primary" });
      for (const l of links) nav.append(helpers.renderNode(l));
      root.append(nav);
      // Mobile burger — CSS shows it below the breakpoint and switches the
      // links row into a dropdown panel gated by `data-menu-open`.
      const burger = el("button", {
        class: "rui-navbar2-burger",
        type: "button",
        "aria-label": "Menu",
        "aria-expanded": menuOpen ? "true" : "false",
        "aria-controls": menuId,
      }) as HTMLButtonElement;
      const burgerIcon = renderIcon("bars");
      if (burgerIcon) burger.append(burgerIcon); else burger.textContent = "≡";
      burger.onclick = (event: Event) => {
        const liveBtn = ((event.currentTarget ?? event.target) as HTMLElement | null);
        const live = liveBtn?.closest(".rui-navbar2") as HTMLElement | null;
        if (!live) return;
        const next = live.getAttribute("data-menu-open") !== "true";
        paintNavMenu(live, next);
        openSlot.set(next);
        if (!next) { disposeDismissListeners(live); return; }
        // Escape + outside-pointer dismissal, and move focus into the panel so
        // a keyboard user is not left tabbing behind an open overlay.
        installDismissListeners({
          liveRoot: live,
          key: "rui-navbar2-menu",
          onDismiss: () => { paintNavMenu(live, false); openSlot.set(false); },
        });
        live.querySelector<HTMLElement>(".rui-navbar2-links a, .rui-navbar2-links button")?.focus?.();
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
    { name: "links", type: "Node[]", optional: true, aliases: ["children", "items"] },
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
    { name: "legal", type: "string | Node[]", optional: true, aliases: ["copyright"], description: "Copyright line — a string, or Link nodes for Privacy/Terms/Cookies" },
    { name: "social", type: "Node[]", optional: true, description: "Brand/social icon row under the tagline (IconButton / Link nodes)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("footer", { class: "rui-footer" });
    const cols = asArray<unknown>(props.columns);
    // With no link columns the grid must not reserve an empty 1fr track, or the
    // brand column is squeezed to two thirds width beside dead space. The
    // stylesheet's `repeat(var(--ak-foot-cols, 3), 1fr)` cannot express "no
    // tracks" (repeat() rejects 0), so override the template outright.
    const grid = el("div", {
      class: "rui-footer-grid",
      "data-cols": String(cols.length),
      style: cols.length > 0 ? `--ak-foot-cols:${cols.length}` : "grid-template-columns:1fr",
    });
    const brandCol = el("div", { class: "rui-footer-brand" });
    if (props.brand != null) brandCol.append(helpers.renderNode(props.brand));
    const tagline = asString(props.tagline);
    if (tagline) brandCol.append(el("p", { class: "rui-footer-tagline" }, [tagline]));
    const social = asArray<unknown>(props.social);
    if (social.length > 0) {
      const row = el("div", { class: "rui-footer-social" });
      for (const s of social) row.append(helpers.renderNode(s));
      brandCol.append(row);
    }
    grid.append(brandCol);
    for (const c of cols) grid.append(helpers.renderNode(c));
    root.append(grid);
    // `legal` accepts nodes so Privacy / Terms links can live on that line.
    const legalIsEmpty = props.legal == null || (typeof props.legal === "string" && props.legal === "");
    if (!legalIsEmpty) {
      const legal = el("div", { class: "rui-footer-legal" });
      appendInline(legal, props.legal, helpers);
      root.append(legal);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * LogoCloud (Part VIII.1)
 * ----------------------------------------------------------------------- */

export const LogoChip: ComponentSpec = {
  name: "LogoChip",
  description:
    "A single labelled chip for a LogoCloud: a Font Awesome `icon` or a " +
    "customer wordmark `image`, plus the name. Give it an `href` to link the " +
    "chip at its integration/partner page.",
  props: [
    { name: "label", type: "string", positional: true, required: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome name (e.g. brands:react)" },
    { name: "imageSrc", type: "string", optional: true, aliases: ["logo", "image", "src"], description: "Logo image src URL (wins over `icon`)" },
    { name: "href", type: "string", optional: true, description: "Link target — the chip's hover lift already advertises interactivity" },
  ],
  render: (_node, props) => {
    const label = asString(props.label);
    const href = props.href != null ? sanitiseHref(props.href, "") : "";
    // An anchor when it links somewhere, a span otherwise: the hover lift in
    // the stylesheet promises a click target, so don't render a dead one.
    const chip = href
      ? el("a", { class: "rui-logochip", href })
      : el("span", { class: "rui-logochip" });
    const image = sanitiseImageSrc(props.imageSrc);
    if (image) {
      chip.append(el("img", { class: "rui-logochip-logo", src: image, alt: label, loading: "lazy" }));
    } else {
      const icon = renderIcon(props.icon);
      if (icon) chip.append(icon);
    }
    chip.append(document.createTextNode(label));
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

interface CountUpConfig {
  target: number;
  prefix: string;
  suffix: string;
  duration: number;
  /** Fraction digits to keep — 0 rounds, so `99.9%` must ask for 1. */
  decimals: number;
  /** Group thousands (`1,200`). Only on when the source value was grouped. */
  group: boolean;
}

/** Live elements that already own an observer/animation for their instance. */
const COUNTUP_WIRED = new WeakSet<HTMLElement>();

/** Digits after the decimal point in `value` (capped, so 1/3 doesn't explode). */
function decimalsOf(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : Math.min(4, text.length - dot - 1);
}

function formatCountValue(value: number, cfg: CountUpConfig): string {
  const decimals = cfg.decimals;
  if (cfg.group) {
    try {
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    } catch { /* Intl unavailable — fall through to the plain form */ }
  }
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

/**
 * Animate a number from 0 → target once the element scrolls into view.
 *
 * Two morph-driven rules make this safe. (1) The displayed value is mirrored
 * into an instance slot and the *fresh* tree is seeded from it, so an unrelated
 * re-render never rewrites a settled counter back to `0` (morph copies the
 * fresh text onto the kept element). (2) The observer is only ever attached to
 * the element that is actually connected — a fresh tree the morph discarded must
 * not register the keyed disposer, because that would immediately disconnect the
 * live element's observer and freeze the number forever.
 */
function wireCountUp(node: HTMLElement, cfg: CountUpConfig, helpers: RenderHelpers, slotKey: string): void {
  const valueSlot = helpers.useInstanceState<number>(`${slotKey}-value`, 0);
  const paint = (host: HTMLElement, v: number): void => {
    host.textContent = `${cfg.prefix}${formatCountValue(v, cfg)}${cfg.suffix}`;
  };
  paint(node, valueSlot.get());

  const run = (live: HTMLElement): void => {
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / cfg.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = cfg.target * eased;
      valueSlot.set(v);
      paint(live, v);
      if (t < 1 && live.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Defer until committed so the observer has a live target.
  const cancel = deferToPaint(() => {
    if (!node.isConnected || COUNTUP_WIRED.has(node)) return;
    COUNTUP_WIRED.add(node);
    if (typeof IntersectionObserver === "undefined") { run(node); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { io.disconnect(); run(node); }
      }
    }, { threshold: 0.4 });
    io.observe(node);
    // If the number never scrolls into view, drop the observer on unmount.
    helpers.registerDisposer(() => io.disconnect(), `${slotKey}-io`);
  });
  // Cancel the pending wiring on unmount so it cannot create an observer for a
  // component the renderer has already pruned. Conditional on `isConnected` so
  // the keyed replacement performed by the *next* render never cancels the live
  // element's own pending wiring.
  helpers.registerDisposer(() => { if (!node.isConnected) cancel(); }, `${slotKey}-defer`);
}

export const CountUp: ComponentSpec = {
  name: "CountUp",
  description:
    "A number that animates from 0 to `value` when scrolled into view. " +
    "`prefix`/`suffix` wrap it (e.g. `$`, `+`, `%`). `decimals` keeps fraction " +
    "digits (default: as many as `value` has, so 99.9 stays 99.9). Respects " +
    "reduced motion.",
  props: [
    { name: "value", type: "number", positional: true, required: true },
    { name: "suffix", type: "string", optional: true },
    { name: "prefix", type: "string", optional: true },
    { name: "duration", type: "number", optional: true, description: "Animation ms (default 1000)" },
    { name: "decimals", type: "number", optional: true, description: "Fraction digits to display (default: inferred from `value`)" },
  ],
  render: (_node, props, helpers) => {
    const span = el("span", { class: "rui-countup" });
    const target = asNumber(props.value, 0);
    const cfg: CountUpConfig = {
      target,
      prefix: asString(props.prefix),
      suffix: asString(props.suffix),
      duration: Math.max(200, asNumber(props.duration, 1000)),
      decimals: props.decimals != null
        ? Math.max(0, Math.min(4, Math.round(asNumber(props.decimals, 0))))
        : decimalsOf(target),
      group: false,
    };
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      span.textContent = `${cfg.prefix}${formatCountValue(target, cfg)}${cfg.suffix}`;
    } else {
      wireCountUp(span, cfg, helpers, "rui-countup");
    }
    return span;
  },
};

/**
 * Split a display value like `$1,200`, `1.2M` or `99.9%` into the currency-ish
 * prefix, the numeric core and the trailing unit. The old single-regex version
 * treated a leading `$` as a *suffix* (rendering `1200$`) and dropped the
 * thousands separators entirely.
 */
function splitMetricValue(raw: string): { prefix: string; numeric: number; suffix: string; decimals: number; group: boolean } {
  const match = /^(\D*?)(\d[\d.,\s\u00A0\u202F]*)([\s\S]*)$/.exec(raw.trim());
  if (!match) return { prefix: "", numeric: NaN, suffix: "", decimals: 0, group: false };
  const prefix = match[1] ?? "";
  let digits = match[2] ?? "";
  let suffix = match[3] ?? "";
  // A trailing separator belongs to the suffix, not the number ("1,200 users").
  while (digits.length > 1 && /[.,\s\u00A0\u202F]$/.test(digits)) {
    suffix = digits.slice(-1) + suffix;
    digits = digits.slice(0, -1);
  }
  const group = /\d[,\s\u00A0\u202F]\d/.test(digits);
  const plain = digits.replace(/[,\s\u00A0\u202F]/g, "");
  const dot = plain.indexOf(".");
  return {
    prefix,
    numeric: Number(plain),
    suffix,
    decimals: dot === -1 ? 0 : Math.min(4, plain.length - dot - 1),
    group,
  };
}

export const Metric: ComponentSpec = {
  name: "Metric",
  description:
    "A single big-number metric tile: the value (gradient-painted by default), " +
    "an optional label and an optional `trend` delta. Use inside MetricStrip. " +
    "Set `countUp` to animate the number in on scroll — currency prefixes, " +
    "thousands separators and decimals survive the animation.",
  props: [
    { name: "value", type: "string | number", positional: true, required: true },
    { name: "label", type: "string", optional: true },
    { name: "gradient", type: "boolean", optional: true, description: "Paint the number with the brand gradient" },
    { name: "countUp", type: "boolean", optional: true, description: "Animate numeric value from 0 on scroll-in" },
    { name: "duration", type: "number", optional: true, description: "countUp animation ms (default 1000)" },
    { name: "trend", type: "string", optional: true, aliases: ["delta", "change"], description: "Period-over-period delta, e.g. \"+12.5%\" or \"-3 vs last week\"" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-metric" });
    // Gradient is the signature look, so it defaults ON — but `gradient:
    // false` genuinely opts out (this previously ignored the prop).
    const gradient = props.gradient === undefined ? true : asBoolean(props.gradient);
    const valueEl = el("div", { class: "rui-metric-value", "data-gradient": gradient ? "true" : null });
    const raw = asString(props.value);
    const parts = splitMetricValue(raw);
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (asBoolean(props.countUp) && Number.isFinite(parts.numeric) && parts.numeric > 0 && !reduce) {
      wireCountUp(valueEl, {
        target: parts.numeric,
        prefix: parts.prefix,
        suffix: parts.suffix,
        duration: Math.max(200, asNumber(props.duration, 1000)),
        decimals: parts.decimals,
        group: parts.group,
      }, helpers, "rui-metric-countup");
    } else {
      valueEl.textContent = raw;
    }
    root.append(valueEl);
    const label = asString(props.label);
    if (label) root.append(el("div", { class: "rui-metric-label" }, [label]));
    const trend = asString(props.trend);
    if (trend) {
      // Direction drives the token color; a leading sign is the only signal we
      // can read from free text, so anything else stays neutral.
      const dir = /^\s*[+↑▲]/.test(trend) ? "up" : /^\s*[-−↓▼]/.test(trend) ? "down" : null;
      root.append(el("div", { class: "rui-metric-trend", "data-dir": dir }, [trend]));
    }
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

function windowBar(
  file: string,
  status: unknown,
  helpers: { renderNode: (n: unknown) => Node },
  action?: Node | null,
): HTMLElement {
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
  if (action) {
    const a = el("span", { class: "rui-window-action" });
    a.append(action);
    bar.append(a);
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
    "also accepted for non-Aktion previews. `copy` adds a copy-to-clipboard " +
    "button to the title bar, `height`/`maxHeight` cap the pane (long snippets " +
    "scroll), and `showLineNumbers`/`highlightLines` point the reader at a " +
    "specific line. The canonical way to show code in docs/marketing.",
  props: [
    { name: "code", type: "string", positional: true, required: true, aliases: ["codeString"], description: "Source text (a legacy CodeBlock(...) node is also accepted)" },
    { name: "file", type: "string", optional: true, description: "Filename shown in the title bar" },
    { name: "language", type: "string", optional: true, description: "Highlight language (default: from the file extension, else aktion)" },
    { name: "status", type: "Node", optional: true, description: "A Badge shown at the right of the bar" },
    { name: "preview", type: "boolean | Node", optional: true, description: "true → run the source as a live Aktion preview; or a custom node" },
    { name: "copy", type: "boolean", optional: true, description: "Show a copy-the-source button in the title bar" },
    { name: "height", type: "string", optional: true, description: "Explicit code-pane height (CSS length); overflow scrolls" },
    { name: "maxHeight", type: "string", optional: true, description: "Cap the code-pane height (CSS length); overflow scrolls" },
    { name: "showLineNumbers", type: "boolean", optional: true, description: "Render a left-side line-number gutter" },
    { name: "highlightLines", type: "string", optional: true, description: "Highlight ranges, e.g. \"3-5,8\"" },
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
    // The inner CodeBlock is chromeless (no header), which is what suppresses
    // its own copy button — so the window owns that affordance instead.
    const copyBtn = asBoolean(props.copy) && source
      ? CopyButton.render(
        { __kind: "Component", name: "CopyButton", args: [], argMeta: [] },
        { text: source, label: "Copy code", iconOnly: true },
        helpers,
      )
      : null;
    root.append(windowBar(file, status, helpers, copyBtn));

    const height = sanitiseCssLength(props.height, "");
    const maxHeight = sanitiseCssLength(props.maxHeight, "");
    const body = el("div", { class: "rui-codewindow-body", "data-split": split ? "true" : null });
    const codeCol = el("div", {
      class: "rui-codewindow-code",
      style: maxHeight ? `max-height:${maxHeight};overflow:auto` : null,
    });
    if (source || legacyNode == null) {
      codeCol.append(CodeBlock.render(
        { __kind: "Component", name: "CodeBlock", args: [], argMeta: [] },
        {
          codeString: source,
          language,
          header: false,
          height: height || null,
          showLineNumbers: props.showLineNumbers,
          highlightLines: props.highlightLines,
        },
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
  // Depth guard: a docs page that demonstrates CodeWindow itself would otherwise
  // mount an app whose source mounts another app, each one synchronously booting
  // the next until the tab hangs. The *displayed* code keeps `preview: true`;
  // only the copy we execute is flattened, so nesting stops at one live level.
  app.setAttribute("response", source.replace(/preview\s*:\s*true\b/g, "preview: false"));
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
  description:
    "A browser-window chrome (dots + URL bar) wrapping a child — for " +
    "screenshots/demos of web UIs. `height` fixes the mock viewport and scrolls " +
    "inside it. The frame does NOT clip its child, so dropdowns/tooltips in the " +
    "wrapped UI stay visible; set `clip: true` for a hard-edged screenshot look.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children", "content"] },
    { name: "url", type: "string", optional: true },
    { name: "height", type: "string", optional: true, description: "Mock viewport height (CSS length); the body scrolls" },
    { name: "clip", type: "boolean", optional: true, description: "Clip the child at the frame edge (hides popovers that overflow it)" },
  ],
  render: (_node, props, helpers) => {
    const clip = asBoolean(props.clip);
    const root = el("div", { class: "rui-browserframe", "data-clip": clip ? "true" : null });
    const bar = el("div", { class: "rui-browserframe-bar" });
    const dots = el("span", { class: "rui-window-dots" });
    dots.append(el("i"), el("i"), el("i"));
    bar.append(dots);
    bar.append(el("span", { class: "rui-browserframe-url" }, [asString(props.url, "example.com")]));
    root.append(bar);
    const height = sanitiseCssLength(props.height, "");
    const body = el("div", {
      class: "rui-browserframe-body",
      style: height ? `height:${height};overflow:auto` : null,
    });
    if (props.child != null) body.append(helpers.renderNode(props.child));
    root.append(body);
    return root;
  },
};

export const Terminal: ComponentSpec = {
  name: "Terminal",
  description:
    "A terminal window rendering monospace lines. Pass `lines` as an array of " +
    "strings. `prompt` (e.g. \"$\" or \"❯\") prefixes each command line with a " +
    "non-selectable marker — indented lines count as output and get none, so " +
    "copying the block yields just the commands. `height`/`maxHeight` cap a long " +
    "log and scroll it.",
  props: [
    { name: "lines", type: "string[]", positional: true, required: true, aliases: ["children", "content"] },
    { name: "file", type: "string", optional: true, description: "Title-bar label (default 'bash')" },
    { name: "prompt", type: "string", optional: true, description: "Prompt marker for command lines (e.g. \"$\"); indented lines are treated as output" },
    { name: "height", type: "string", optional: true, description: "Explicit body height (CSS length); overflow scrolls" },
    { name: "maxHeight", type: "string", optional: true, description: "Cap the body height (CSS length); overflow scrolls" },
  ],
  render: (_node, props, helpers) => {
    const file = asString(props.file, "bash");
    // Labelled group: the transcript is otherwise an unlabelled multi-line blob
    // with no hint that it is terminal output.
    const root = el("div", { class: "rui-terminal", role: "group", "aria-label": file || "Terminal output" });
    root.append(windowBar(file, null, helpers));
    const height = sanitiseCssLength(props.height, "");
    const maxHeight = sanitiseCssLength(props.maxHeight, "");
    const sizeStyle = [
      height ? `height:${height}` : "",
      maxHeight ? `max-height:${maxHeight}` : "",
      height || maxHeight ? "overflow:auto" : "",
    ].filter(Boolean).join(";");
    const body = el("pre", { class: "rui-terminal-body", style: sizeStyle || null });
    const lines = asArray<unknown>(props.lines).map((l) => asString(l));
    const prompt = asString(props.prompt);
    if (!prompt) {
      body.textContent = lines.join("\n");
    } else {
      lines.forEach((line, i) => {
        const row = el("span", { class: "rui-terminal-line" });
        // Output lines keep their indentation and stay marker-free.
        if (!/^\s/.test(line) && line !== "") {
          row.append(el("span", { class: "rui-terminal-prompt", "aria-hidden": "true" }, [`${prompt} `]));
        }
        row.append(document.createTextNode(line));
        body.append(row);
        if (i < lines.length - 1) body.append(document.createTextNode("\n"));
      });
    }
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
  let boxEmpty = true;

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
    // A collapsed container (hidden tab, closed accordion) would clamp to 1×1
    // and stack every particle on the origin; stay dormant until the
    // ResizeObserver reports a real box.
    boxEmpty = rect.width * rect.height === 0;
    w = Math.max(1, Math.round(rect.width * dpr));
    h = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    if (boxEmpty) return;
    seed();
    if (reduce) drawFrame();
  };

  const drawFrame = (): void => {
    if (boxEmpty) return;
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
    const count = Math.max(0, Math.min(120, Math.round(asNumber(props.particles, 0))));
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
  render: (_node, props, helpers) => {
    const lightName = asString(props.light, "light");
    const darkName = asString(props.dark, "dark");
    // The active theme is mirrored into instance state so the RENDER can emit
    // the right icon/label. Patching the DOM after commit is not enough: the
    // fresh tree always won the next morph pass and put the moon back while the
    // app was dark.
    const darkSlot = helpers.useInstanceState<boolean>("rui-theme-dark", false);
    const isDark = darkSlot.get();
    const btn = el("button", {
      class: "rui-theme-toggle",
      type: "button",
      "aria-pressed": isDark ? "true" : "false",
      "aria-label": isDark ? "Switch to light theme" : "Switch to dark theme",
      title: "Toggle theme",
    }) as HTMLButtonElement;
    const icon = renderIcon(isDark ? "sun" : "moon");
    if (icon) btn.append(icon);
    // Read from the live event target (not the closure element) so the
    // handler keeps working after the morph reconciler reuses a prior DOM
    // node — `currentTarget` is always the on-page element.
    const hostFrom = (node: EventTarget | null): HTMLElement | undefined => {
      const root = (node as Node | null)?.getRootNode?.();
      return root && (root as ShadowRoot).host ? ((root as ShadowRoot).host as HTMLElement) : undefined;
    };
    const paint = (live: HTMLElement, dark: boolean): void => {
      live.setAttribute("aria-pressed", dark ? "true" : "false");
      live.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      live.replaceChildren(renderIcon(dark ? "sun" : "moon") ?? document.createTextNode(""));
    };
    // The host theme is only readable once connected, so sync the slot from it
    // on mount. Guarded on `isConnected`: a fresh tree the morph discarded must
    // not repaint (it would paint an off-page node and mask the real state).
    deferToPaint(() => {
      if (!btn.isConnected) return;
      const host = hostFrom(btn);
      const dark = (host?.getAttribute("theme") || "").toLowerCase().includes("dark");
      if (dark === darkSlot.get()) return;
      darkSlot.set(dark);
      paint(btn, dark);
    });
    btn.onclick = (event: Event) => {
      const target = (event.currentTarget ?? event.target) as HTMLElement | null;
      const host = hostFrom(target);
      if (!host) return;
      const cur = (host.getAttribute("theme") || lightName).toLowerCase();
      const next = cur.includes("dark") ? lightName : darkName;
      host.setAttribute("theme", next);
      host.dispatchEvent(new CustomEvent("theme-change", { detail: { theme: next }, bubbles: true, composed: true }));
      const dark = next.toLowerCase().includes("dark");
      darkSlot.set(dark);
      if (target) paint(target, dark);
    };
    return btn;
  },
};

export const Swatch: ComponentSpec = {
  name: "Swatch",
  description:
    "A theme/palette preview tile — color dots over a named background. For " +
    "theming galleries: give it `onClick` to make the tile pick that theme and " +
    "`selected` to mark the active one.",
  props: [
    { name: "name", type: "string", positional: true, required: true },
    { name: "background", type: "string", optional: true, description: "Tile background CSS color" },
    { name: "foreground", type: "string", optional: true, description: "Tile text CSS color" },
    { name: "colors", type: "string[]", optional: true, description: "Accent dot colors" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onSelect", "onclick"], description: "Fired when the tile is picked" },
    { name: "selected", type: "boolean", optional: true, aliases: ["active"], description: "Mark this tile as the active theme" },
  ],
  render: (_node, props, helpers) => {
    const safe = (c: string, fb: string) => (/^[#a-zA-Z0-9(),.%\s-]+$/.test(c) && c.length <= 64 ? c : fb);
    const bg = safe(asString(props.background, "#ffffff"), "#ffffff");
    const fg = safe(asString(props.foreground, "#0f172a"), "#0f172a");
    const name = asString(props.name);
    const selected = asBoolean(props.selected);
    const interactive = props.onClick != null;
    // A real button when it does something — the stylesheet's hover lift
    // otherwise advertises a click target that does not exist.
    const attrs = {
      class: "rui-swatch",
      style: `background:${bg};color:${fg}`,
      "data-selected": selected ? "true" : null,
    };
    const root = interactive
      ? el("button", { ...attrs, type: "button", "aria-pressed": selected ? "true" : "false" })
      : el("div", attrs);
    if (interactive) {
      (root as HTMLButtonElement).onclick = () => helpers.invoke(props.onClick, name);
    }
    const dots = el("div", { class: "rui-swatch-dots" });
    for (const c of asArray<unknown>(props.colors).slice(0, 5)) {
      const color = safe(asString(c), "#6366f1");
      // The palette is otherwise conveyed by color alone; name each dot so a
      // screen reader can tell two themes apart.
      dots.append(el("i", { style: `background:${color}`, role: "img", "aria-label": color, title: color }));
    }
    root.append(dots);
    root.append(el("div", { class: "rui-swatch-name" }, [name]));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Utility components (Part VIII.8)
 * ----------------------------------------------------------------------- */

export const CopyButton: ComponentSpec = {
  name: "CopyButton",
  description:
    "A button that copies `text` to the clipboard and confirms it — the " +
    "label flips to `copiedLabel` (default 'Copied!') with a check icon for " +
    "a couple of seconds, then reverts, and the confirmation is announced to " +
    "screen readers. `iconOnly` drops the label for tight corners (code " +
    "blocks, API-key fields). Bounded, no host glue.",
  props: [
    { name: "text", type: "string", positional: true, required: true, aliases: ["value"] },
    { name: "label", type: "string", optional: true, description: "Button label (default 'Copy')" },
    { name: "copiedLabel", type: "string", optional: true, description: "Confirmation label (default 'Copied!')" },
    { name: "iconOnly", type: "boolean", optional: true, aliases: ["variant"], description: "Render the icon alone; `label` becomes the accessible name" },
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label, "Copy");
    const copiedLabel = asString(props.copiedLabel, "Copied!");
    const iconOnly = asBoolean(props.iconOnly);
    // The confirmation is part of the RENDER, not a post-commit DOM patch: any
    // unrelated commit inside the 2s window used to morph the base label and
    // icon back over the "Copied!" state.
    const copiedSlot = helpers.useInstanceState<boolean>("rui-copy-copied", false);
    const copied = copiedSlot.get();
    const wrap = el("span", { class: "rui-copy-button-wrap" });
    const btn = el("button", {
      class: "rui-copy-button",
      type: "button",
      "data-copied": copied ? "true" : null,
      "data-icon-only": iconOnly ? "true" : null,
      "aria-label": iconOnly ? (copied ? copiedLabel : label) : null,
    }) as HTMLButtonElement;
    const icon = renderIcon(copied ? "check" : "copy", { className: "rui-copy-button-icon" });
    if (icon) btn.append(icon);
    if (!iconOnly) btn.append(el("span", { class: "rui-copy-button-label" }, [copied ? copiedLabel : label]));
    // A label swap on the focused button is not reliably announced, so the
    // confirmation also lands in a polite live region beside it.
    const status = el("span", {
      class: "rui-copy-button-status rui-visually-hidden",
      role: "status",
      "aria-live": "polite",
    }, [copied ? copiedLabel : ""]);
    wrap.append(btn, status);

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

      const paint = (isCopied: boolean): void => {
        if (isCopied) live.setAttribute("data-copied", "true");
        else live.removeAttribute("data-copied");
        if (iconOnly) live.setAttribute("aria-label", isCopied ? copiedLabel : label);
        const labelEl = live.querySelector(".rui-copy-button-label");
        if (labelEl) labelEl.textContent = isCopied ? copiedLabel : label;
        const iconEl = live.querySelector(".rui-copy-button-icon");
        if (iconEl) {
          const next = renderIcon(isCopied ? "check" : "copy", { className: "rui-copy-button-icon" });
          if (next) iconEl.replaceWith(next);
        }
        const region = live.parentElement?.querySelector(".rui-copy-button-status");
        if (region) region.textContent = isCopied ? copiedLabel : "";
      };
      copiedSlot.set(true);
      paint(true);
      // Keyed disposer instead of a module-level timer map: it both dedupes a
      // rapid second click (the prior cleanup runs immediately) and cancels the
      // pending revert if the surface unmounts inside the 2s window.
      const timer = setTimeout(() => {
        copiedSlot.set(false);
        paint(false);
      }, 2000);
      helpers.registerDisposer(() => clearTimeout(timer), "rui-copy-reset");
    };
    return wrap;
  },
};

export const SegmentedControl: ComponentSpec = {
  name: "SegmentedControl",
  description:
    "A compact segmented toggle (iOS-style). `options` is an array of strings " +
    "or {label, value, icon?, disabled?}. Bind `value` to a $variable; " +
    "`onChange(value)` fires on select. Left/Right arrows move between " +
    "segments; `size` sets the height and `disabled` locks the whole control.",
  props: [
    { name: "options", type: "any[]", positional: true, required: true, aliases: ["items"] },
    { name: "value", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"] },
    { name: "disabled", type: "boolean", optional: true, description: "Lock every segment" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "label", type: "string", optional: true, aliases: ["ariaLabel"], description: "Accessible name for the group" },
  ],
  render: (node, props, helpers) => {
    const groupDisabled = asBoolean(props.disabled);
    // Emits BOTH class names: `rui-segmented-control` is what the themes style
    // (the generic `rui-segmented` block has no themed variants), and a group of
    // `aria-pressed` toggle buttons is the accurate role — `role="tab"` claimed
    // tab semantics with no tabpanel and silently ignored the pressed state.
    const root = el("div", {
      class: "rui-segmented rui-segmented-control",
      role: "group",
      "aria-label": asString(props.label) || null,
      "data-size": canonicalSizeToken(asString(props.size, "md")),
      "data-disabled": groupDisabled ? "true" : null,
    });
    const current = asString(props.value);
    for (const raw of asArray<unknown>(props.options)) {
      const opt = (raw && typeof raw === "object")
        ? raw as { label?: unknown; value?: unknown; icon?: unknown; disabled?: unknown }
        : { label: raw, value: raw, icon: undefined, disabled: undefined };
      const value = asString(opt.value ?? opt.label);
      const label = asString(opt.label ?? opt.value);
      const active = value === current;
      const disabled = groupDisabled || asBoolean(opt.disabled);
      const btn = el("button", {
        class: "rui-segmented-control-option",
        type: "button",
        "aria-pressed": active ? "true" : "false",
        "data-active": active ? "true" : null,
        disabled: disabled ? "" : null,
      }) as HTMLButtonElement;
      const icon = renderIcon(opt.icon);
      if (icon) btn.append(icon);
      if (label) btn.append(document.createTextNode(label));
      btn.onclick = () => {
        if (disabled) return;
        const meta = node.argMeta?.[1];
        if (meta?.stateRef) helpers.setState(meta.stateRef, value);
        helpers.invoke(props.onChange, value);
      };
      root.append(btn);
    }
    // Arrow keys walk the group the way a segmented control is expected to
    // behave; the click path (state write + onChange) is reused verbatim.
    root.onkeydown = (event: KeyboardEvent) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const live = (event.currentTarget ?? event.target) as HTMLElement | null;
      if (!live) return;
      const options = [...live.querySelectorAll<HTMLButtonElement>(".rui-segmented-control-option:not([disabled])")];
      if (options.length === 0) return;
      const origin = (event.target as HTMLElement | null)?.closest(".rui-segmented-control-option") as HTMLButtonElement | null;
      const from = origin ? options.indexOf(origin) : options.findIndex((b) => b.getAttribute("aria-pressed") === "true");
      let next = from;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (from <= 0 ? options.length : from) - 1;
      else next = (from + 1) % options.length;
      const target = options[next];
      if (!target) return;
      event.preventDefault();
      target.focus();
      target.click();
    };
    return root;
  },
};

/**
 * Fixed-corner slots shared by FloatingActionButton and BackToTop. Both used to
 * resolve to byte-identical coordinates, so an app with one of each rendered a
 * single reachable circle.
 */
const FAB_POSITIONS = ["bottom-right", "bottom-left", "bottom-center"] as const;

const fabPosition = (raw: unknown): string => {
  const value = asString(raw, "bottom-right");
  return (FAB_POSITIONS as readonly string[]).includes(value) ? value : "bottom-right";
};

export const FloatingActionButton: ComponentSpec = {
  name: "FloatingActionButton",
  description:
    "A fixed circular action button (FAB). `icon` + `onClick`; `position` picks " +
    "the corner (bottom-right default — move it to sit beside a BackToTop or a " +
    "chat launcher, or for RTL), `extended: true` shows `label` as visible text " +
    "next to the icon, and `disabled` locks it while a request is in flight.",
  props: [
    { name: "icon", type: "string", positional: true, required: true },
    { name: "label", type: "string", optional: true, description: "Accessible label (visible text when `extended`)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] },
    { name: "position", type: "string", optional: true, enum: FAB_POSITIONS, description: "Screen corner (default bottom-right)" },
    { name: "extended", type: "boolean", optional: true, description: "Pill-shaped icon + text FAB" },
    { name: "disabled", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label, "Action");
    const extended = asBoolean(props.extended);
    const disabled = asBoolean(props.disabled);
    const btn = el("button", {
      class: "rui-fab",
      type: "button",
      "data-position": fabPosition(props.position),
      "data-extended": extended ? "true" : null,
      "aria-label": extended ? null : label,
      disabled: disabled ? "" : null,
    }) as HTMLButtonElement;
    const icon = renderIcon(props.icon, { size: "lg" });
    if (icon) btn.append(icon);
    if (extended) btn.append(el("span", { class: "rui-fab-label" }, [label]));
    btn.onclick = () => {
      if (disabled) return;
      helpers.invoke(props.onClick);
    };
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
    { name: "children", type: "Node[]", positional: true, required: true, aliases: ["child", "content"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-prose", "data-size": canonicalSizeToken(asString(props.size, "md")) });
    for (const child of asArray(props.children)) {
      if (typeof child === "string") root.append(document.createTextNode(child));
      else root.append(helpers.renderNode(child));
    }
    return root;
  },
};

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31536e6], ["month", 2592e6], ["week", 6048e5],
  ["day", 864e5], ["hour", 36e5], ["minute", 6e4], ["second", 1e3],
];

/**
 * Format `date` relative to now. The quotient is truncated, not rounded: the
 * unit is chosen by `abs >= ms`, so rounding turned 90 minutes into "2 hours
 * ago" — wrong by a whole unit for half of all inputs.
 */
function relativeTimeLabel(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    for (const [unit, ms] of RELATIVE_UNITS) {
      if (abs >= ms || unit === "second") return rtf.format(Math.trunc(diffMs / ms), unit);
    }
  } catch { return date.toLocaleString(); }
  return "just now";
}

export const RelativeTime: ComponentSpec = {
  name: "RelativeTime",
  description:
    "Renders a human relative time ('3m ago', 'in 2 days') from an ISO " +
    "date/timestamp, localized via Intl. Emits a `<time datetime=…>` carrying " +
    "the absolute instant and refreshes itself on a coarse schedule, so a list " +
    "left open does not keep claiming 'just now'.",
  props: [
    { name: "value", type: "string | number", positional: true, required: true, aliases: ["date", "time"] },
  ],
  render: (_node, props, helpers) => {
    const raw = props.value;
    const date = typeof raw === "number" ? new Date(raw) : new Date(asString(raw));
    if (Number.isNaN(date.getTime())) {
      return el("span", { class: "rui-relative-time" }, [asString(raw)]);
    }
    const absolute = date.toLocaleString();
    // `<time datetime>` so the machine-readable instant is not hover-only (a
    // touch user can never reach a `title`).
    const root = el("time", {
      class: "rui-relative-time",
      datetime: date.toISOString(),
      title: absolute,
    });
    const labelEl = el("span", { class: "rui-relative-time-label" }, [relativeTimeLabel(date)]);
    root.append(labelEl, el("span", { class: "rui-visually-hidden" }, [` (${absolute})`]));

    // Refresh from the LIVE element only: a fresh tree the morph discarded must
    // not start a second timer (nor register the keyed disposer, which would
    // clear the live one).
    const cancel = deferToPaint(() => {
      if (!root.isConnected) return;
      let timer: ReturnType<typeof setTimeout>;
      const run = (): void => {
        const live = root.querySelector(".rui-relative-time-label");
        if (!root.isConnected || !live) { clearTimeout(timer); return; }
        live.textContent = relativeTimeLabel(date);
        schedule();
      };
      // Coarse: every second while the delta is under a minute, then every 30s.
      const schedule = (): void => {
        const delay = Math.abs(date.getTime() - Date.now()) < 6e4 ? 1000 : 30000;
        timer = setTimeout(run, delay);
      };
      schedule();
      helpers.registerDisposer(() => clearTimeout(timer), "rui-relativetime");
    });
    helpers.registerDisposer(() => { if (!root.isConnected) cancel(); }, "rui-relativetime-defer");
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * E-commerce (Part VIII.2)
 * ----------------------------------------------------------------------- */

/** Numeric value of a price prop, or null when it is pre-formatted text. */
function priceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = asString(value).trim();
  if (!text || !/^-?[\d.,\s]+$/.test(text)) return null;
  const n = Number(text.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export const PriceTag: ComponentSpec = {
  name: "PriceTag",
  description:
    "A formatted price with an optional struck-through compare-at price and a " +
    "discount badge. Numeric values are grouped and given matching decimals " +
    "(9.5 → $9.50, 1299 → $1,299); pre-formatted strings pass through untouched. " +
    "`currencyPosition: \"suffix\"` writes \"12,50 €\"; `period` adds a trailing " +
    "unit (\"$29 /month\").",
  props: [
    { name: "price", type: "string | number", positional: true, required: true },
    { name: "compareAt", type: "string | number", optional: true, aliases: ["was", "original"] },
    { name: "currency", type: "string", optional: true, description: "Currency symbol/prefix (default '$')" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "currencyPosition", type: "string", optional: true, enum: ["prefix", "suffix"], description: "Where the symbol sits (default prefix)" },
    { name: "period", type: "string", optional: true, aliases: ["suffix", "per"], description: "Trailing unit, e.g. \"month\" → \"$29 /month\"" },
  ],
  render: (_node, props) => {
    const cur = asString(props.currency, "$");
    const suffixed = asString(props.currencyPosition, "prefix") === "suffix";
    const now = priceNumber(props.price);
    const was = priceNumber(props.compareAt);
    // One decimal contract for both figures, so "9.5 / 12" is not shown as
    // "$9.50 / $12".
    const cents = (now != null && !Number.isInteger(now)) || (was != null && !Number.isInteger(was)) ? 2 : 0;
    const fmt = (value: unknown, numeric: number | null): string => {
      if (numeric == null) return `${suffixed ? "" : cur}${asString(value)}${suffixed ? ` ${cur}` : ""}`;
      let body: string;
      try {
        body = new Intl.NumberFormat(undefined, {
          minimumFractionDigits: cents,
          maximumFractionDigits: cents,
        }).format(numeric);
      } catch { body = cents > 0 ? numeric.toFixed(cents) : String(numeric); }
      return suffixed ? `${body} ${cur}` : `${cur}${body}`;
    };
    const root = el("span", { class: "rui-pricetag", "data-size": canonicalSizeToken(asString(props.size, "md")) });
    const hasCompare = props.compareAt != null && asString(props.compareAt) !== "";
    // "was"/"now" as visually-hidden text: the strike-through is CSS-only, so AT
    // otherwise announces two bare prices with no cue which one you pay.
    if (hasCompare) root.append(el("span", { class: "rui-visually-hidden" }, ["Now "]));
    root.append(el("span", { class: "rui-pricetag-now" }, [fmt(props.price, now)]));
    const period = asString(props.period);
    if (period) {
      root.append(el("span", { class: "rui-pricetag-period" }, [period.startsWith("/") ? period : `/${period}`]));
    }
    if (hasCompare) {
      root.append(el("span", { class: "rui-visually-hidden" }, [" was "]));
      root.append(el("s", { class: "rui-pricetag-was" }, [fmt(props.compareAt, was)]));
      if (now != null && was != null && was > now && was > 0) {
        const pct = Math.round((1 - now / was) * 100);
        root.append(el("span", { class: "rui-pricetag-off" }, [`-${pct}%`]));
      }
    }
    return root;
  },
};

export const QuantityStepper: ComponentSpec = {
  name: "QuantityStepper",
  description:
    "A −/value/+ numeric stepper. Bind `value` to a $variable; " +
    "`onChange(value)` fires on change. Respects min/max (an out-of-range bound " +
    "value is corrected once), exposes the value as a spinbutton with Arrow/" +
    "Home/End keys, and `label` names it so several steppers in one cart are " +
    "distinguishable.",
  props: [
    { name: "value", type: "number", positional: true, required: true },
    { name: "min", type: "number", optional: true },
    { name: "max", type: "number", optional: true },
    { name: "step", type: "number", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"] },
    { name: "disabled", type: "boolean", optional: true, description: "Lock the whole control (read-only cart, out of stock)" },
    { name: "label", type: "string", optional: true, aliases: ["ariaLabel"], description: "What this quantity is for, e.g. the product name" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
  ],
  render: (node, props, helpers) => {
    const min = props.min != null ? asNumber(props.min) : -Infinity;
    const max = props.max != null ? asNumber(props.max) : Infinity;
    // A literal `0` step (often a state variable that starts at 0) made both
    // buttons look enabled and do nothing.
    const step = Math.abs(asNumber(props.step, 1)) || 1;
    const incoming = asNumber(props.value, 0);
    const current = Math.min(max, Math.max(min, incoming));
    const disabled = asBoolean(props.disabled);
    const label = asString(props.label);
    const ref = node.argMeta?.[0]?.stateRef;
    const root = el("div", { class: "rui-qty", "data-size": canonicalSizeToken(asString(props.size, "md")), "data-disabled": disabled ? "true" : null });
    const set = (next: number) => {
      const clamped = Math.min(max, Math.max(min, next));
      if (ref) helpers.setState(ref, clamped);
      helpers.invoke(props.onChange, clamped);
    };
    const minus = el("button", {
      type: "button",
      class: "rui-qty-minus",
      "aria-label": label ? `Decrease ${label}` : "Decrease",
      disabled: disabled || current <= min ? "" : null,
    }, ["−"]) as HTMLButtonElement;
    minus.onclick = () => { if (!disabled) set(current - step); };
    // Spinbutton semantics: the quantity used to live in an unlabelled span
    // that AT never announced when it changed, with no keyboard affordance.
    const valueEl = el("span", {
      class: "rui-qty-value",
      role: "spinbutton",
      tabindex: disabled ? null : "0",
      "aria-label": label ? `${label} quantity` : "Quantity",
      "aria-valuenow": String(current),
      "aria-valuemin": Number.isFinite(min) ? String(min) : null,
      "aria-valuemax": Number.isFinite(max) ? String(max) : null,
      "aria-live": "polite",
      "aria-disabled": disabled ? "true" : null,
    }, [String(current)]);
    valueEl.onkeydown = (event: KeyboardEvent) => {
      if (disabled) return;
      let next: number | null = null;
      if (event.key === "ArrowUp" || event.key === "ArrowRight") next = current + step;
      else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = current - step;
      else if (event.key === "PageUp") next = current + step * 10;
      else if (event.key === "PageDown") next = current - step * 10;
      else if (event.key === "Home" && Number.isFinite(min)) next = min;
      else if (event.key === "End" && Number.isFinite(max)) next = max;
      if (next == null) return;
      event.preventDefault();
      set(next);
    };
    const plus = el("button", {
      type: "button",
      class: "rui-qty-plus",
      "aria-label": label ? `Increase ${label}` : "Increase",
      disabled: disabled || current >= max ? "" : null,
    }, ["+"]) as HTMLButtonElement;
    plus.onclick = () => { if (!disabled) set(current + step); };
    root.append(minus, valueEl, plus);
    // The displayed value is clamped, so reconcile the model once (deferred, and
    // only from the committed element) rather than showing "9" next to a
    // disabled "+" and dropping two steps on the first click.
    const correctedSlot = helpers.useInstanceState<number | null>("rui-qty-corrected", null);
    if (current !== incoming && !disabled) {
      deferToPaint(() => {
        if (!root.isConnected || correctedSlot.get() === current) return;
        correctedSlot.set(current);
        set(current);
      });
    }
    return root;
  },
};

export const ProductCard: ComponentSpec = {
  name: "ProductCard",
  description:
    "An e-commerce product card: image, title, optional rating, a PriceTag, " +
    "and an add-to-cart action. Pass `price`/`compareAt` directly or a custom " +
    "`price` node. Give it `href` or `onClick` to make the whole card open the " +
    "product (the card's hover lift promises it), `rating` + `reviewCount` for " +
    "credible stars, and `soldOut` to dim it and stop the add button firing.",
  props: [
    { name: "title", type: "string", positional: true, required: true },
    { name: "image", type: "string", optional: true, aliases: ["src"] },
    { name: "price", type: "string | number", optional: true },
    { name: "compareAt", type: "string | number", optional: true },
    { name: "currency", type: "string", optional: true },
    { name: "rating", type: "number", optional: true, description: "0–5 stars" },
    { name: "badge", type: "string", optional: true, description: "Corner ribbon label (e.g. 'Sale')" },
    { name: "action", type: "Node", optional: true, description: "Add-to-cart Button; omit it and pass `onAdd` for the built-in icon button" },
    { name: "onAdd", type: "callable", optional: true, description: "Fired by the default add button" },
    { name: "href", type: "string", optional: true, description: "Product detail page — makes the whole card a link" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onSelect", "onclick"], description: "Fired when the card is opened (alternative to `href`)" },
    { name: "reviewCount", type: "number", optional: true, aliases: ["reviews"], description: "Number of ratings shown beside the stars" },
    { name: "soldOut", type: "boolean", optional: true, aliases: ["disabled"], description: "Dim the card and disable the add action" },
  ],
  render: (_node, props, helpers) => {
    const title = asString(props.title);
    const soldOut = asBoolean(props.soldOut);
    const root = el("div", { class: "rui-product-card", "data-sold-out": soldOut ? "true" : null });
    const media = el("div", { class: "rui-product-media" });
    const img = sanitiseImageSrc(props.image);
    if (img) media.append(el("img", { src: img, alt: title, loading: "lazy" }));
    const badge = asString(props.badge);
    if (badge) media.append(el("span", { class: "rui-product-badge" }, [badge]));
    else if (soldOut) media.append(el("span", { class: "rui-product-badge" }, ["Sold out"]));
    root.append(media);
    const body = el("div", { class: "rui-product-body" });
    // The title carries the card's click target (a stretched link/button covers
    // the card in CSS) so the real add-to-cart button below is never nested
    // inside another interactive element.
    const href = props.href != null ? sanitiseHref(props.href, "") : "";
    const heading = el("h3", { class: "rui-product-title" });
    if (href) {
      heading.append(el("a", { class: "rui-product-title-link", href }, [title]));
    } else if (props.onClick != null) {
      const link = el("button", { class: "rui-product-title-link", type: "button" }, [title]) as HTMLButtonElement;
      link.onclick = () => helpers.invoke(props.onClick);
      heading.append(link);
    } else {
      heading.append(document.createTextNode(title));
    }
    body.append(heading);
    const rating = Math.max(0, Math.min(5, Math.round(asNumber(props.rating, 0))));
    const reviewCount = Math.max(0, Math.round(asNumber(props.reviewCount, 0)));
    if (rating > 0) {
      // The star glyphs are aria-hidden, so the group carries the numbers.
      const stars = el("div", {
        class: "rui-product-rating",
        role: "img",
        "aria-label": reviewCount > 0
          ? `Rated ${rating} out of 5 from ${reviewCount} reviews`
          : `Rated ${rating} out of 5`,
      });
      for (let i = 0; i < 5; i += 1) {
        const ic = renderIcon(i < rating ? "star" : "regular:star");
        if (ic) stars.append(ic);
      }
      if (reviewCount > 0) {
        stars.append(el("span", { class: "rui-product-reviews", "aria-hidden": "true" }, [`(${reviewCount})`]));
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
      const btn = el("button", {
        class: "rui-product-add",
        type: "button",
        "aria-label": soldOut ? `${title} is sold out` : "Add to cart",
        disabled: soldOut ? "" : null,
      }) as HTMLButtonElement;
      const ic = renderIcon("cart-plus");
      if (ic) btn.append(ic);
      btn.onclick = () => { if (!soldOut) helpers.invoke(props.onAdd); };
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
  description:
    "A navigable table of contents. `items` is an array of {label, href, " +
    "level?}. A `#fragment` href scrolls to the matching `id` INSIDE the app " +
    "(the browser cannot resolve a fragment into the shadow tree, and touching " +
    "`location.hash` would drive the router), marks that entry active, and " +
    "fires `onSelect(href)`. `activeHref` sets the current entry from state.",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, aliases: ["children"] },
    { name: "title", type: "string", optional: true },
    { name: "activeHref", type: "string", optional: true, aliases: ["active"], description: "href of the entry to mark current" },
    { name: "onSelect", type: "callable", optional: true, aliases: ["onChange"], description: "Fired with the clicked href" },
  ],
  render: (_node, props, helpers) => {
    const root = el("nav", { class: "rui-toc", "aria-label": "Table of contents" });
    const title = asString(props.title);
    if (title) root.append(el("div", { class: "rui-toc-title" }, [title]));
    // Clicked entries stay highlighted across re-renders; an explicit
    // `activeHref` always wins.
    const activeSlot = helpers.useInstanceState<string>("rui-toc-active", "");
    const active = asString(props.activeHref) || activeSlot.get();
    const list = el("ul", { class: "rui-toc-list" });
    for (const raw of asArray<unknown>(props.items)) {
      const item = (raw ?? {}) as { label?: unknown; href?: unknown; level?: unknown };
      const href = sanitiseHref(item.href, "#");
      const isActive = href !== "#" && href === active;
      const li = el("li", {
        class: "rui-toc-item",
        "data-level": String(Math.max(1, Math.min(4, Math.round(asNumber(item.level, 1))))),
        "data-active": isActive ? "true" : null,
      });
      const link = el("a", { href, "aria-current": isActive ? "location" : null }, [asString(item.label)]);
      link.onclick = (event: MouseEvent) => {
        const origin = (event.currentTarget ?? event.target) as HTMLElement | null;
        const target = (origin as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
        helpers.invoke(props.onSelect, target);
        // Real links (and a bare "#") keep the browser's behaviour.
        if (!target.startsWith("#") || target.length < 2 || !origin) return;
        event.preventDefault();
        activeSlot.set(target);
        const scope = origin.getRootNode() as DocumentFragment | Document;
        const id = decodeURIComponent(target.slice(1));
        scope.getElementById?.(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        // Reflect the new position now — the render reads the same slot.
        const nav = origin.closest(".rui-toc");
        nav?.querySelectorAll(".rui-toc-item[data-active]").forEach((n) => {
          n.removeAttribute("data-active");
          n.querySelector("a")?.removeAttribute("aria-current");
        });
        const item2 = origin.closest(".rui-toc-item");
        item2?.setAttribute("data-active", "true");
        origin.setAttribute("aria-current", "location");
      };
      li.append(link);
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
    const root = el("div", { class: "rui-typing", role: "status", "aria-live": "polite" });
    const name = asString(props.name);
    // The status region must carry text, and `aria-label` on the roleless dots
    // span was never exposed — so an anonymous indicator announced nothing.
    if (name) root.append(el("span", { class: "rui-typing-name" }, [`${name} is typing`]));
    else root.append(el("span", { class: "rui-visually-hidden" }, ["Someone is typing"]));
    const dots = el("span", { class: "rui-typing-dots", "aria-hidden": "true" });
    dots.append(el("i"), el("i"), el("i"));
    root.append(dots);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Utility (Part VIII.8)
 * ----------------------------------------------------------------------- */

const COUNTDOWN_UNITS = ["days", "hours", "minutes", "seconds"] as const;

const COUNTDOWN_LABELS: Record<string, string> = {
  days: "days", hours: "hrs", minutes: "min", seconds: "sec",
};

/** Live countdown roots that already own a ticking interval. */
const COUNTDOWN_RUNNING = new WeakSet<HTMLElement>();

export const CountdownTimer: ComponentSpec = {
  name: "CountdownTimer",
  description:
    "Live countdown to a target date/time (ISO string or timestamp). Ticks " +
    "every second, then shows `endLabel` and fires `onEnd` (enable checkout, " +
    "reveal a link, refresh a price). `units` trims the boxes — a 10-minute " +
    "flash sale should not render two zeroed day/hour cells.",
  props: [
    { name: "to", type: "string | number", positional: true, required: true, aliases: ["target", "date"] },
    { name: "endLabel", type: "string", optional: true, description: "Shown when the countdown finishes (default 'Done')" },
    { name: "onEnd", type: "callable", optional: true, aliases: ["onFinish", "onComplete"], description: "Fired once when the countdown reaches zero" },
    { name: "units", type: "string[]", optional: true, enum: COUNTDOWN_UNITS, description: "Which units to show (default all four)" },
    { name: "showDays", type: "boolean", optional: true, description: "Set false to drop the days cell" },
  ],
  render: (_node, props, helpers) => {
    const target = typeof props.to === "number" ? props.to : new Date(asString(props.to)).getTime();
    const endLabel = asString(props.endLabel, "Done");
    const requested = asArray<unknown>(props.units).map((u) => asString(u));
    let units: string[] = requested.filter((u) => (COUNTDOWN_UNITS as readonly string[]).includes(u));
    if (units.length === 0) units = [...COUNTDOWN_UNITS];
    if (props.showDays != null && !asBoolean(props.showDays)) units = units.filter((u) => u !== "days");
    if (units.length === 0) units = ["seconds"];

    // `aria-live="off"` on the per-second cells (a screen reader must not read
    // every tick) with one polite, atomic summary that updates once a minute.
    const root = el("div", { class: "rui-countdown", role: "timer", "aria-live": "off", "aria-atomic": "true" });
    for (const unit of units) {
      const u = el("div", { class: "rui-countdown-unit", "data-unit": unit });
      u.append(
        el("div", { class: "rui-countdown-value" }, ["00"]),
        el("div", { class: "rui-countdown-label" }, [COUNTDOWN_LABELS[unit] ?? unit]),
      );
      root.append(u);
    }
    const summary = el("span", { class: "rui-countdown-summary rui-visually-hidden", role: "status", "aria-live": "polite" });
    root.append(summary);

    const endedSlot = helpers.useInstanceState<boolean>("rui-countdown-ended", false);
    const fireEnd = (): void => {
      if (endedSlot.get()) return;
      endedSlot.set(true);
      helpers.invoke(props.onEnd);
    };
    const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");
    /**
     * Write into whatever element is passed — the caller resolves it, so the
     * interval always drives the LIVE node instead of the value spans captured
     * by the render that started it (which morph discards, freezing the clock).
     */
    const paint = (host: HTMLElement): boolean => {
      const diff = target - Date.now();
      if (!Number.isFinite(target) || diff <= 0) {
        host.replaceChildren(el("div", { class: "rui-countdown-done" }, [endLabel]));
        host.setAttribute("data-done", "true");
        return false;
      }
      const sec = Math.floor(diff / 1000);
      const values: Record<string, number> = {
        days: Math.floor(sec / 86400),
        hours: Math.floor((sec % 86400) / 3600),
        minutes: Math.floor((sec % 3600) / 60),
        seconds: sec % 60,
      };
      for (const unit of units) {
        const cell = host.querySelector(`.rui-countdown-unit[data-unit="${unit}"] .rui-countdown-value`);
        if (cell) cell.textContent = pad(values[unit] ?? 0);
      }
      const live = host.querySelector(".rui-countdown-summary");
      if (live) {
        const spoken = units
          .filter((u) => u !== "seconds" || sec < 60)
          .map((u) => `${values[u] ?? 0} ${u}`)
          .join(", ");
        const next = `${spoken} remaining`;
        // Only on a minute boundary, so the polite queue is not flooded.
        if (live.textContent !== next && (sec % 60 === 0 || live.textContent === "")) live.textContent = next;
      }
      return true;
    };
    paint(root);

    const cancel = deferToPaint(() => {
      // Only the committed element ticks; a discarded fresh tree must not
      // register the keyed disposer (that is what killed the live interval).
      if (!root.isConnected || COUNTDOWN_RUNNING.has(root)) return;
      if (!paint(root)) { fireEnd(); return; }
      COUNTDOWN_RUNNING.add(root);
      const id = setInterval(() => {
        if (!root.isConnected) { clearInterval(id); COUNTDOWN_RUNNING.delete(root); return; }
        if (!paint(root)) { clearInterval(id); COUNTDOWN_RUNNING.delete(root); fireEnd(); }
      }, 1000);
      helpers.registerDisposer(() => { clearInterval(id); COUNTDOWN_RUNNING.delete(root); }, "countdown");
    });
    helpers.registerDisposer(() => { if (!root.isConnected) cancel(); }, "countdown-defer");
    return root;
  },
};

/** Scroll offset of the window, or of whichever ancestor is actually scrolling. */
function scrolledDistance(from: HTMLElement): number {
  let max = typeof window !== "undefined"
    ? window.scrollY || document.documentElement.scrollTop || 0
    : 0;
  const rootNode = from.getRootNode();
  let node = rootNode instanceof ShadowRoot ? (rootNode.host as HTMLElement).parentElement : from.parentElement;
  while (node) {
    if (node.scrollTop > max) max = node.scrollTop;
    node = node.parentElement;
  }
  return max;
}

export const BackToTop: ComponentSpec = {
  name: "BackToTop",
  description:
    "A floating button that smoothly scrolls the page (and the host) back to " +
    "the top. It appears only after `showAfter` px of scrolling (default 400) " +
    "so it does not sit over the hero, and stacks above a FloatingActionButton " +
    "rather than on top of it.",
  props: [
    { name: "label", type: "string", optional: true },
    { name: "showAfter", type: "number", optional: true, description: "Scroll distance in px before the button appears (0 = always)" },
    { name: "position", type: "string", optional: true, enum: FAB_POSITIONS, description: "Screen corner (default bottom-right)" },
  ],
  render: (_node, props, helpers) => {
    const showAfter = Math.max(0, asNumber(props.showAfter, 400));
    const visibleSlot = helpers.useInstanceState<boolean>("rui-backtotop-visible", false);
    const visible = showAfter === 0 || visibleSlot.get();
    const btn = el("button", {
      class: "rui-fab rui-backtotop",
      type: "button",
      "data-position": fabPosition(props.position),
      "data-visible": visible ? "true" : "false",
      // Inline so the affordance works with or without a themed transition.
      style: visible ? null : "display:none",
      "aria-label": asString(props.label, "Back to top"),
    }) as HTMLButtonElement;
    const ic = renderIcon("arrow-up", { size: "lg" });
    if (ic) btn.append(ic);
    btn.onclick = (event: Event) => {
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
      // Resolve the shadow host from the live element: the closure's `btn` is
      // the detached fresh tree after any re-render, and the app-scroll half of
      // this handler then silently did nothing.
      const live = (event.currentTarget ?? event.target) as Node | null;
      const host = (live?.getRootNode?.() as ShadowRoot | null)?.host as HTMLElement | undefined;
      host?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    };
    if (showAfter > 0) {
      const cancel = deferToPaint(() => {
        if (!btn.isConnected) return;
        const apply = (): void => {
          const next = scrolledDistance(btn) > showAfter;
          if (next === (btn.getAttribute("data-visible") === "true")) return;
          visibleSlot.set(next);
          btn.setAttribute("data-visible", next ? "true" : "false");
          btn.style.display = next ? "" : "none";
        };
        apply();
        // Capture, because scroll does not bubble: this also catches an inner
        // scroll container when the app is embedded in one.
        window.addEventListener("scroll", apply, { passive: true, capture: true });
        helpers.registerDisposer(
          () => window.removeEventListener("scroll", apply, true),
          "rui-backtotop-scroll",
        );
      });
      helpers.registerDisposer(() => { if (!btn.isConnected) cancel(); }, "rui-backtotop-defer");
    }
    return btn;
  },
};

