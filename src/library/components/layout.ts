/**
 * Layout components: Stack, StackItem, Grid, GridItem, Box, Card, CardHeader,
 * CardFooter, Tabs, TabItem, Accordion, AccordionItem,
 * Modal, AspectRatio, ScrollArea.
 */

import type { ComponentSpec, InstanceStateSlot, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseCssLength,
  sanitiseHref, readResponsiveProp, RESPONSIVE_BREAKPOINTS, type Breakpoint, type ResponsiveProp,
  SPACING_TOKENS, normalizeSpacingToken, spacingCssValue,
} from "../utils.js";
import { promoteOverlay, releaseOverlay } from "../floating.js";

const GRID_COLUMNS = 12;

/** Run `fn` on the microtask queue — after the commit, before paint. */
function afterCommit(fn: () => void): void {
  if (typeof queueMicrotask === "function") queueMicrotask(fn);
  else void Promise.resolve().then(fn);
}

/**
 * Install a once-per-instance effect against the node that stays MOUNTED.
 *
 * `render` builds a fresh node on every commit and the morph reconciler keeps
 * the live one, so anything long-lived (an observer, a listener on the root)
 * must be attached to the mounted node only. The microtask lands after
 * `morphChildren`, so `isConnected` separates the two: the first render's node
 * is in the DOM and registers, every later snapshot is detached and returns.
 * That guard also protects the keyed disposer — re-registering a key runs the
 * previous cleanup immediately, which would otherwise tear down the live
 * registration and kill the feature for good.
 */
function whenMounted(fresh: HTMLElement, install: (live: HTMLElement) => void): void {
  afterCommit(() => {
    if (fresh.isConnected) install(fresh);
  });
}

/**
 * Run `fn` against the LIVE element of a component that has to act on the DOM
 * from its render path (move focus, promote to the top layer, lock scrolling).
 *
 * The node recorded in instance state is the one morph kept at mount; every
 * later render builds a snapshot that morph throws away, so acting on that is a
 * silent no-op. Always deferred to a microtask: the work has to land AFTER the
 * commit, or it targets a node whose attributes (and therefore visibility) are
 * still one render behind — you cannot focus a `display: none` dialog.
 */
function withLiveNode(
  fresh: HTMLElement,
  slot: InstanceStateSlot<HTMLElement | null>,
  fn: (live: HTMLElement) => void,
): void {
  afterCommit(() => {
    const recorded = slot.get();
    const live = recorded && recorded.isConnected
      ? recorded
      : (fresh.isConnected ? fresh : null);
    if (!live) return; // discarded snapshot, or never mounted
    slot.set(live);
    fn(live);
  });
}

const FLEX_ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const FLEX_JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

function mapFlexAlign(token: string): string {
  return FLEX_ALIGN[token] ?? "stretch";
}

function mapFlexJustify(token: string): string {
  return FLEX_JUSTIFY[token] ?? "flex-start";
}

function applyDirectionWithReverse(value: string, reverse: boolean): string {
  if (!reverse) return value;
  if (value === "row") return "row-reverse";
  if (value === "column") return "column-reverse";
  if (value.endsWith("-reverse")) return value;
  return `${value}-reverse`;
}

function emitResponsiveSpacingVars(
  styleParts: string[],
  prop: Extract<ResponsiveProp<string>, { kind: "responsive" }>,
  cssPrefix: string,
): void {
  for (const bp of RESPONSIVE_BREAKPOINTS) {
    const v = prop.values[bp];
    // Spacing tokens (canonical or legacy) resolve through the shared scale;
    // anything else keeps the historical var-with-fallback form so raw CSS
    // lengths in responsive maps still work.
    if (v) styleParts.push(`${cssPrefix}-${bp}:${spacingCssValue(v) || `var(--rui-spacing-${v}, ${v})`}`);
  }
}

function emitResponsiveFlexVars(
  styleParts: string[],
  prop: Extract<ResponsiveProp<string>, { kind: "responsive" }>,
  cssPrefix: string,
  mapper: (token: string) => string,
): void {
  for (const bp of RESPONSIVE_BREAKPOINTS) {
    const v = prop.values[bp];
    if (v) styleParts.push(`${cssPrefix}-${bp}:${mapper(String(v))}`);
  }
}

function applyResponsiveEnumProp(
  value: unknown,
  styleParts: string[],
  attrs: Record<string, string | null>,
  options: {
    attrName: string;
    responsiveFlag: string;
    cssVarPrefix: string;
    defaultToken: string;
    mapper: (token: string) => string;
  },
): void {
  const parsed = readResponsiveProp<string>(value);
  if (parsed.kind === "single") {
    const token = parsed.value ? String(parsed.value) : options.defaultToken;
    attrs[options.attrName] = token;
    return;
  }
  attrs[options.attrName] = "responsive";
  attrs[options.responsiveFlag] = "true";
  emitResponsiveFlexVars(styleParts, parsed, options.cssVarPrefix, options.mapper);
}

function isComponentNamed(value: unknown, name: string): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && (value as { __kind?: string }).__kind === "Component"
    && (value as { name?: string }).name === name,
  );
}

function stackBaseDirection(props: Record<string, unknown>): string {
  const direction = readResponsiveProp<string>(props.direction);
  if (direction.kind === "single") {
    return direction.value ? String(direction.value) : "column";
  }
  return direction.values.base ? String(direction.values.base) : "column";
}

export const StackItem: ComponentSpec = {
  name: "StackItem",
  description:
    "Per-child flex control inside a `Row`, `Column`, or `Stack`. Wraps one " +
    "child so it can `grow` to fill leftover space, `shrink`, set a `basis`, " +
    "override `alignSelf`, or change visual `order` — the building block for " +
    "asymmetric rows like `Row([StackItem(searchInput, { grow: 1 }), " +
    "saveButton])` (input expands, button hugs).",
  props: [
    { name: "child", aliases: ["children"], type: "Node", description: "Child node to wrap" },
    { name: "grow", type: "number", optional: true, description: "flex-grow (0 or 1 typical)" },
    { name: "shrink", type: "number", optional: true, description: "flex-shrink (0 or 1 typical)" },
    { name: "basis", type: "string", optional: true, description: "flex-basis (`auto`, `0`, or CSS length)" },
    { name: "alignSelf", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Per-item cross-axis alignment" },
    { name: "order", type: "number", optional: true, description: "Visual order override" },
    { name: "minWidth", type: "string", optional: true, description: "CSS min-width" },
    { name: "maxWidth", type: "string", optional: true, description: "CSS max-width" },
  ],
  render: (_node, props, helpers) => {
    const attrs: Record<string, string | null> = { class: "rui-stack-item" };
    const styleParts: string[] = [];
    // The stylesheet only carries rules for `0` and `1`, so a ratio split
    // (`grow: 2` next to `grow: 1`) has to reach CSS as a real declaration or
    // the larger value silently degrades to `flex-grow: 0`.
    if (props.grow !== undefined && props.grow !== null) {
      const grow = flexFactor(props.grow, 0);
      attrs["data-grow"] = String(grow);
      styleParts.push(`flex-grow:${grow}`);
    }
    if (props.shrink !== undefined && props.shrink !== null) {
      const shrink = flexFactor(props.shrink, 1);
      attrs["data-shrink"] = String(shrink);
      styleParts.push(`flex-shrink:${shrink}`);
    }
    const basis = asString(props.basis);
    if (basis === "auto" || basis === "0") {
      attrs["data-basis"] = basis;
    } else if (basis) {
      // Literal fallbacks throughout: `sanitiseCssLength(v, v)` hands the
      // rejected string back as its own fallback, which makes the guard a
      // no-op and lets `10px;position:fixed;inset:0` reach the style attribute.
      styleParts.push(`flex-basis:${sanitiseCssLength(basis, "auto")}`);
    }
    const alignSelf = asString(props.alignSelf);
    if (alignSelf) attrs["data-align-self"] = alignSelf;
    if (props.order !== undefined && props.order !== null) {
      const order = asNumber(props.order, 0);
      attrs["data-order"] = String(order);
      styleParts.push(`order:${order}`);
    }
    const minWidth = asString(props.minWidth);
    if (minWidth) styleParts.push(`min-width:${sanitiseCssLength(minWidth, "0")}`);
    const maxWidth = asString(props.maxWidth);
    if (maxWidth) styleParts.push(`max-width:${sanitiseCssLength(maxWidth, "none")}`);
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    root.append(helpers.renderNode(props.child));
    return root;
  },
};

/** Clamp a `grow`/`shrink` prop to a non-negative finite flex factor. */
function flexFactor(value: unknown, fallback: number): number {
  const n = asNumber(value, fallback);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Shared flex engine behind `Stack`, `Row`, and `Column`. All three render
 * the same `.rui-stack` DOM so they share one stylesheet; they differ only
 * in their *defaults* (direction, cross-axis alignment, whether children
 * grow to fill the main axis). `directionValue` may be a single token or a
 * responsive map (`Stack` passes the author's `direction` prop; `Row` /
 * `Column` pass a fixed `"row"` / `"column"`). `uniform` is the resolved
 * "children share the main axis equally" flag.
 */
function renderFlexContainer(
  directionValue: unknown,
  uniform: boolean,
  alignDefault: string,
  props: Record<string, unknown>,
  helpers: RenderHelpers,
): HTMLElement {
  const direction = readResponsiveProp<string>(directionValue);
  const gap = readResponsiveProp<string>(props.gap);
  const padding = readResponsiveProp<string>(props.padding);
  const reverse = asBoolean(props.reverse);
  const attrs: Record<string, string | null> = {
    class: "rui-stack",
    "data-wrap": asBoolean(props.wrap) ? "true" : null,
    "data-reverse": reverse ? "true" : null,
    "data-uniform": uniform ? "true" : "false",
    "data-inline": asBoolean(props.inline) ? "true" : null,
  };
  const styleParts: string[] = [];
  if (direction.kind === "single") {
    const dir = direction.value ? String(direction.value) : "column";
    attrs["data-direction"] = applyDirectionWithReverse(dir, reverse);
  } else {
    attrs["data-direction"] = "responsive";
    attrs["data-responsive-dir"] = "true";
    // Which breakpoints actually resolve to a ROW. Every uniform-sizing,
    // min-width-0 and chip-hugging rule is keyed on the literal
    // `data-direction="row"`, so a responsive Stack got none of them:
    // `data-row-at="md lg"` is what lets the stylesheet re-apply them inside
    // the matching breakpoint's media query. Values cascade mobile-first, so a
    // breakpoint the author skipped inherits the previous one.
    const rowAt: string[] = [];
    let effectiveDir = "column";
    for (const bp of RESPONSIVE_BREAKPOINTS) {
      const v = direction.values[bp];
      if (v) {
        effectiveDir = String(v);
        styleParts.push(`--rui-stack-dir-${bp}:${applyDirectionWithReverse(effectiveDir, reverse)}`);
      }
      if (effectiveDir === "row" || effectiveDir === "row-reverse") rowAt.push(bp);
    }
    if (rowAt.length > 0) attrs["data-row-at"] = rowAt.join(" ");
  }
  if (gap.kind === "single") {
    attrs["data-gap"] = gap.value ? normalizeSpacingToken(gap.value, String(gap.value)) : "md";
  } else {
    attrs["data-gap"] = "responsive";
    attrs["data-responsive-gap"] = "true";
    emitResponsiveSpacingVars(styleParts, gap, "--rui-stack-gap");
  }
  applyResponsiveEnumProp(props.align, styleParts, attrs, {
    attrName: "data-align",
    responsiveFlag: "data-responsive-align",
    cssVarPrefix: "--rui-stack-align",
    defaultToken: alignDefault,
    mapper: mapFlexAlign,
  });
  applyResponsiveEnumProp(props.justify, styleParts, attrs, {
    attrName: "data-justify",
    responsiveFlag: "data-responsive-justify",
    cssVarPrefix: "--rui-stack-justify",
    defaultToken: "start",
    mapper: mapFlexJustify,
  });
  const alignContent = asString(props.alignContent);
  if (alignContent) attrs["data-align-content"] = alignContent;
  if (padding.kind === "single") {
    const pad = padding.value ? normalizeSpacingToken(padding.value, String(padding.value)) : null;
    if (pad) attrs["data-padding"] = pad;
  } else {
    attrs["data-padding"] = "responsive";
    attrs["data-responsive-padding"] = "true";
    emitResponsiveSpacingVars(styleParts, padding, "--rui-stack-padding");
  }
  if (styleParts.length > 0) attrs.style = styleParts.join(";");
  const root = el("div", attrs);
  for (const child of asArray(props.children)) {
    root.append(helpers.renderNode(child));
  }
  return root;
}

/** Shared prop docs for the flex family (Stack/Row/Column). */
const FLEX_GAP_PROP = { name: "gap", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Spacing between children. May be a responsive map." } as const;
const FLEX_JUSTIFY_PROP = { name: "justify", type: "string | object", optional: true, enum: ["start", "center", "end", "between", "around", "evenly"], description: "Main-axis distribution. May be a responsive map." } as const;
const FLEX_WRAP_PROP = { name: "wrap", type: "boolean", optional: true, description: "Wrap children onto multiple lines when they overflow" } as const;
const FLEX_REVERSE_PROP = { name: "reverse", type: "boolean", optional: true, description: "Reverse the visual order of children" } as const;
const FLEX_PADDING_PROP = { name: "padding", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Inner padding token. May be a responsive map." } as const;
const FLEX_INLINE_PROP = { name: "inline", type: "boolean", optional: true, description: "Use inline-flex (shrink-to-fit) instead of a full-width block" } as const;
const FLEX_ALIGN_CONTENT_PROP = { name: "alignContent", type: "string", optional: true, enum: ["start", "center", "end", "between", "around", "stretch"], description: "Alignment of wrapped lines (only when `wrap` is on)" } as const;

export const Row: ComponentSpec = {
  name: "Row",
  description:
    "Lay children out horizontally (left → right) with even spacing. The " +
    "developer-friendly default: children keep their natural width and are " +
    "vertically centered. Set `grow=true` to make children share the row " +
    "equally (for equal-width columns prefer `Grid(columns: N)`); drop a " +
    "`Spacer()` between children to push them apart; wrap a child in " +
    "`StackItem` for per-child grow/shrink/alignment. Use `wrap=true` for " +
    "chips/tags that should flow onto multiple lines.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "Children laid out left → right" },
    { name: "gap", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Horizontal spacing between children (default `md`). May be a responsive map." },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Vertical alignment of children (default `center`). May be a responsive map." },
    { ...FLEX_JUSTIFY_PROP },
    { name: "grow", type: "boolean", optional: true, description: "Children share the row width equally (replaces the old `uniform`)" },
    { ...FLEX_WRAP_PROP },
    { ...FLEX_REVERSE_PROP },
    { ...FLEX_PADDING_PROP },
    { ...FLEX_INLINE_PROP },
    { ...FLEX_ALIGN_CONTENT_PROP },
  ],
  render: (_node, props, helpers) =>
    renderFlexContainer("row", asBoolean(props.grow), "center", props, helpers),
};

export const Column: ComponentSpec = {
  name: "Column",
  description:
    "Lay children out vertically (top → bottom) with even spacing — the " +
    "most common page/section layout. Children stretch to the full width by " +
    "default; set `align` to `start`/`center`/`end` to change that. This is " +
    "the recommended root container for a page or a card body.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "Children laid out top → bottom" },
    { name: "gap", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Vertical spacing between children (default `md`). May be a responsive map." },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Horizontal alignment of children (default `stretch`). May be a responsive map." },
    { ...FLEX_JUSTIFY_PROP },
    { ...FLEX_WRAP_PROP },
    { ...FLEX_REVERSE_PROP },
    { ...FLEX_PADDING_PROP },
    { ...FLEX_INLINE_PROP },
    { ...FLEX_ALIGN_CONTENT_PROP },
  ],
  render: (_node, props, helpers) =>
    renderFlexContainer("column", false, "stretch", props, helpers),
};

export const Stack: ComponentSpec = {
  name: "Stack",
  description:
    "Low-level flex container with a configurable, optionally responsive " +
    "`direction`. Reach for `Row` or `Column` first — they are clearer for " +
    "fixed-direction layouts. Use `Stack` when the direction itself must " +
    "change across breakpoints, e.g. `direction: {base: \"column\", md: " +
    "\"row\"}` for a sidebar that stacks on mobile. `gap`, `align`, " +
    "`justify`, and `padding` also accept responsive maps. NOTE: a `row` " +
    "Stack grows its children equally by default (`uniform=true`); set " +
    "`uniform=false` for natural widths (this is `Row`'s default).",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "Child components to stack" },
    { name: "direction", type: "string | object", optional: true, enum: ["column", "row"], description: "Layout direction (default column). May be a responsive map like `{base: \"column\", md: \"row\"}`." },
    { ...FLEX_GAP_PROP },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Cross-axis alignment (default stretch). May be a responsive map." },
    { ...FLEX_JUSTIFY_PROP },
    { ...FLEX_ALIGN_CONTENT_PROP },
    { ...FLEX_WRAP_PROP },
    { ...FLEX_REVERSE_PROP },
    { name: "uniform", type: "boolean", optional: true, description: "Row children share space equally (default true for row stacks; use `Row` for natural widths)" },
    { ...FLEX_INLINE_PROP },
    { ...FLEX_PADDING_PROP },
  ],
  render: (_node, props, helpers) => {
    const baseDir = stackBaseDirection(props);
    const uniformDefault = baseDir === "row";
    const uniform = props.uniform === undefined
      ? uniformDefault
      : asBoolean(props.uniform, uniformDefault);
    return renderFlexContainer(props.direction, uniform, "stretch", props, helpers);
  },
};

export const Center: ComponentSpec = {
  name: "Center",
  description:
    "Centers its children on both axes — the easy way to drop a spinner, an " +
    "empty state, a hero call-to-action, or a modal body into the middle of " +
    "a region. Give it `minHeight` (e.g. `\"60vh\"`) to center vertically " +
    "inside a tall area, or `axis` to center on only one axis. Multiple " +
    "children stack in a column and are centered as a group.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "Content to center" },
    { name: "axis", type: "string", optional: true, enum: ["both", "horizontal", "vertical"], description: "Which axis to center on (default both)" },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height — set to center vertically inside a tall region (e.g. `60vh`, `400px`)" },
    { name: "gap", type: "string", optional: true, enum: SPACING_TOKENS, description: "Spacing between stacked children (default `md`)" },
    { name: "padding", type: "string", optional: true, enum: SPACING_TOKENS, description: "Inner padding token" },
    { name: "inline", type: "boolean", optional: true, description: "Shrink to fit content instead of filling the available width" },
  ],
  render: (_node, props, helpers) => {
    const attrs: Record<string, string | null> = {
      class: "rui-center",
      "data-axis": asString(props.axis, "both"),
      "data-gap": normalizeSpacingToken(props.gap, "md"),
      "data-inline": asBoolean(props.inline) ? "true" : null,
    };
    const padding = normalizeSpacingToken(props.padding, asString(props.padding));
    if (padding) attrs["data-padding"] = padding;
    const styleParts: string[] = [];
    const minHeight = asString(props.minHeight);
    // Literal fallback: passing `minHeight` as its own fallback returns the
    // rejected string unchanged, so the guard would let extra declarations
    // ride along into the inline style.
    if (minHeight) styleParts.push(`min-height:${sanitiseCssLength(minHeight, "auto")}`);
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Card: ComponentSpec = {
  name: "Card",
  description:
    "Vertical card container. Set `padding: \"none\"` for a full-bleed body " +
    "(a Table, image, or list that should meet the card's edges). Pass " +
    "`onClick` or `href` to make the whole card a single interactive target — " +
    "it then renders as a `button` / `a` so it is keyboard-operable.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "Card contents" },
    { name: "variant", aliases: ["tone"], type: "string", optional: true, enum: ["default", "outlined", "elevated"] },
    { name: "padding", type: "string", optional: true, enum: SPACING_TOKENS, description: "Inner padding (default `lg`). Use `none` for a full-bleed body." },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick"], description: "Makes the whole card clickable (renders as a `button`)" },
    { name: "href", type: "string", optional: true, description: "Makes the whole card a link (renders as an `a`)" },
  ],
  render: (_node, props, helpers) => {
    const href = sanitiseHref(props.href, "");
    const clickable = Boolean(href) || props.onClick != null;
    // A clickable card must be a real button/anchor: `div + onclick` is
    // unreachable by keyboard and invisible to assistive tech, and the
    // stylesheet's hover affordances key off the element / `data-clickable`.
    const tag = href ? "a" : (clickable ? "button" : "div");
    const padding = normalizeSpacingToken(props.padding, "");
    const root = el(tag as keyof HTMLElementTagNameMap, {
      class: "rui-card",
      "data-variant": asString(props.variant, "default"),
      "data-padding": padding || null,
      "data-clickable": clickable ? "true" : null,
      href: href || null,
      type: tag === "button" ? "button" : null,
    });
    if (clickable) {
      root.onclick = () => {
        helpers.invoke(props.onClick);
      };
    }
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const CardHeader: ComponentSpec = {
  name: "CardHeader",
  description:
    "Card header with title, an optional `eyebrow` line rendered ABOVE the " +
    "title (category / kicker / pre-headline), and an optional `subtitle` " +
    "rendered below it. `actions` puts nodes (a Badge, an overflow Menu, an " +
    "\"Edit\" Button) on the trailing edge of the title row; `level` sets the " +
    "heading tag so a page of cards keeps a sane document outline.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
    {
      name: "eyebrow",
      type: "string",
      optional: true,
      aliases: ["preheadline", "kicker"],
      description: "Short line shown above the title",
    },
    { name: "actions", type: "Node[]", optional: true, description: "Nodes pinned to the trailing edge of the title row (badge / menu / button)" },
    { name: "level", type: "number", optional: true, description: "Heading level for the title, 2–6 (default 3)" },
  ],
  render: (_node, props, helpers) => {
    const actions = asArray<unknown>(props.actions);
    const root = el("header", {
      class: "rui-card-header",
      "data-has-actions": actions.length > 0 ? "true" : null,
    });
    // Without `actions` the eyebrow/title/subtitle stay direct children so the
    // header's own column layout and typography rules apply unchanged.
    const textHost = actions.length > 0
      ? el("div", { class: "rui-card-header-text" })
      : root;
    const eyebrow = asString(props.eyebrow);
    if (eyebrow) textHost.append(el("p", { class: "rui-card-eyebrow" }, [eyebrow]));
    const level = Math.min(6, Math.max(2, Math.round(asNumber(props.level, 3))));
    textHost.append(el(`h${level}` as keyof HTMLElementTagNameMap, { class: "rui-card-title" }, [asString(props.title)]));
    const subtitle = asString(props.subtitle);
    if (subtitle) textHost.append(el("p", { class: "rui-card-subtitle" }, [subtitle]));
    if (textHost !== root) {
      root.append(textHost);
      const actionHost = el("div", { class: "rui-card-header-actions" });
      for (const item of actions) actionHost.append(helpers.renderNode(item));
      root.append(actionHost);
    }
    return root;
  },
};

const CARD_FOOTER_JUSTIFY = ["start", "center", "end", "between"] as const;

export const CardFooter: ComponentSpec = {
  name: "CardFooter",
  description:
    "Card footer for actions. Defaults to trailing-aligned buttons; use " +
    "`justify: \"between\"` for the \"destructive action far left, confirm " +
    "actions far right\" shape, or `start` to left-align them.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "justify", type: "string", optional: true, enum: CARD_FOOTER_JUSTIFY, description: "Horizontal distribution of the actions (default `end`)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("footer", {
      class: "rui-card-footer",
      "data-justify": asString(props.justify) || null,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

const CARD_SECTION_TONES = [
  "default", "activating", "success", "warning", "critical", "neutral", "corporate", "promoting",
] as const;

/**
 * `CardSection` is a full-bleed horizontal band *inside* a Card that
 * colour-codes a chunk of its content — the status band pattern (an inline
 * "this is activating / succeeded / needs attention" stripe that spans the
 * card's full width, edge to edge, with a tinted background and a rule above
 * and below). Distinct from `Callout`, which is a self-contained bordered
 * notice box; a CardSection is part of the card's own body flow.
 */
export const CardSection: ComponentSpec = {
  name: "CardSection",
  description:
    "Full-bleed, colour-coded band inside a `Card` that groups and " +
    "semantically tints a chunk of the card's content (edge-to-edge tinted " +
    "background with a rule above/below). Use to mark a region of a card as " +
    "activating / success / warning / critical / neutral. For a standalone " +
    "bordered notice use `Callout` instead.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", positional: true },
    { name: "tone", type: "string", optional: true, enum: CARD_SECTION_TONES, aliases: ["variant", "status"] },
    { name: "align", type: "string", optional: true, enum: ["left", "center", "right"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("section", {
      class: "rui-card-section",
      "data-tone": asString(props.tone, "default"),
      "data-align": asString(props.align) || null,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Separator: ComponentSpec = {
  name: "Separator",
  description:
    "Visual divider between content sections. Supports horizontal or " +
    "vertical orientation, and an optional center `label` (lifted from " +
    "the legacy `Divider`). Use `decorative=false` to expose the " +
    "separator to assistive tech.",
  props: [
    { name: "orientation", type: "string", optional: true, enum: ["horizontal", "vertical"] },
    { name: "label", type: "string", optional: true, description: "Optional label rendered in the middle (horizontal only)" },
    { name: "decorative", type: "boolean", optional: true, description: "Hides the separator from assistive tech when true (default)" },
  ],
  render: (_node, props) => {
    const orientation = asString(props.orientation, "horizontal");
    const decorative = asBoolean(props.decorative, true);
    const label = asString(props.label);
    if (label && orientation === "horizontal") {
      // Deliberately NOT `.rui-separator`: the labelled variant paints its rule
      // in the two inner spans, and every per-theme `:host([data-rui-theme=…])
      // .rui-separator { background: … }` override out-specifies the container
      // reset — filling the whole flex box with a solid bar around the label.
      return el("div", {
        class: "rui-separator-with-label",
        "data-orientation": orientation,
        role: decorative ? "presentation" : "separator",
        "aria-orientation": decorative ? null : orientation,
      }, [
        el("span", { class: "rui-separator-line" }),
        el("span", { class: "rui-separator-label" }, [label]),
        el("span", { class: "rui-separator-line" }),
      ]);
    }
    return el("div", {
      class: "rui-separator",
      "data-orientation": orientation,
      role: decorative ? "presentation" : "separator",
      "aria-orientation": decorative ? null : orientation,
    });
  },
};

const STEP_STATUSES = ["pending", "active", "complete", "error"] as const;

/** Resolve a step's status from `status` / `complete` / `active`, in that order. */
function resolveStepStatus(data: { status?: unknown; complete?: unknown; active?: unknown }): string {
  const declared = asString(data.status).toLowerCase();
  if ((STEP_STATUSES as readonly string[]).includes(declared)) return declared;
  if (data.complete !== undefined && data.complete !== null && asBoolean(data.complete)) return "complete";
  return asBoolean(data.active) ? "active" : "pending";
}

const renderStepLi = (title: string, details: string, status = "pending"): HTMLElement => {
  const root = el("li", {
    class: "rui-steps-item",
    "data-active": status === "active" ? "true" : "false",
    "data-status": status,
    // `data-complete` mirrors what MultiStepForm's stepper already styles, so
    // a plain `Steps` gets the same check badge from one shared rule.
    "data-complete": status === "complete" ? "true" : null,
  });
  root.append(el("div", { class: "rui-steps-title" }, [title]));
  if (details) root.append(el("div", { class: "rui-steps-details" }, [details]));
  return root;
};

export const Steps: ComponentSpec = {
  name: "Steps",
  description:
    "Numbered step-by-step guide. Pass items as `{title, details?, active?, " +
    "status?}` objects. `active` marks the current step; `status` " +
    "(`pending|active|complete|error`) additionally distinguishes finished and " +
    "failed steps. `orientation: \"horizontal\"` lays the steps across the top " +
    "of a wizard instead of down the page.",
  props: [
    { name: "items", type: "object[]" },
    { name: "orientation", type: "string", optional: true, enum: ["vertical", "horizontal"], description: "Layout direction (default `vertical`)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("ol", {
      class: "rui-steps",
      "data-orientation": asString(props.orientation, "vertical"),
    });
    for (const item of asArray<unknown>(props.items)) {
      if (item && typeof item === "object" && (item as { __kind?: string }).__kind === "Component") {
        // A component item still needs an `<li>`: a bare `<div>` inside `<ol>`
        // is invalid list markup and misses the 44px step gutter. `data-bare`
        // suppresses the counter badge so the ladder keeps its numbering.
        root.append(el("li", { class: "rui-steps-item", "data-bare": "true" }, [helpers.renderNode(item)]));
        continue;
      }
      if (item && typeof item === "object") {
        const data = item as { title?: unknown; details?: unknown; active?: unknown; status?: unknown; complete?: unknown };
        root.append(renderStepLi(
          asString(data.title),
          asString(data.details),
          resolveStepStatus(data),
        ));
        continue;
      }
      // Plain string falls back to a title-only step.
      root.append(renderStepLi(asString(item), ""));
    }
    return root;
  },
};

export const TabItem: ComponentSpec = {
  name: "TabItem",
  description:
    "Single tab definition (used inside Tabs). Add `badge` for a count " +
    "chip in the tab trigger, `icon` for a leading Font Awesome icon, and " +
    "`disabled` for a tab that cannot be selected yet.",
  props: [
    { name: "value", type: "string", description: "Stable identifier for the tab" },
    { name: "label", type: "string", description: "Display label" },
    { name: "children", aliases: ["child"], type: "Node[]", description: "Tab content" },
    { name: "badge", type: "string", optional: true, description: "Trailing chip rendered in the tab trigger (count / status)" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name shown before the label" },
    { name: "disabled", type: "boolean", optional: true, description: "Render the trigger as unavailable (not selectable, skipped by keyboard nav)" },
  ],
  render: (_node, props, helpers) => {
    // The trigger lives in `Tabs`, which used to reach back into the caller's
    // raw positional slots for label/badge/icon — that breaks for any TabItem
    // produced by a user component (those carry `positional`, not `args`). Stash
    // the RESOLVED props on the panel instead so `Tabs` reads real values.
    const wrapper = el("div", {
      class: "rui-tab-content",
      role: "tabpanel",
      "data-value": asString(props.value),
      "data-label": asString(props.label) || null,
      "data-badge": asString(props.badge) || null,
      "data-icon": asString(props.icon) || null,
      "data-disabled": asBoolean(props.disabled) ? "true" : null,
      "data-active": "false",
    });
    for (const child of asArray(props.children)) wrapper.append(helpers.renderNode(child));
    return wrapper;
  },
};

let tabsIdSeq = 0;

interface TabEntry {
  panel: HTMLElement;
  value: string;
  label: string;
  badge: string;
  icon: string;
  disabled: boolean;
}

/**
 * Resolve one tab's panel + metadata.
 *
 * Preference order is deliberate: the RENDERED panel's dataset (the resolved
 * props of whatever produced it, however indirectly) wins; the caller's raw
 * positional `args` are only a fallback for hosts that stub `renderNode`; the
 * index is the last resort.
 */
function readTabEntry(item: unknown, idx: number, helpers: RenderHelpers): TabEntry {
  const rendered = helpers.renderNode(item);
  // `renderNode` returns a Text node for strings/numbers and a DocumentFragment
  // for arrays; casting either to HTMLElement and calling setAttribute throws
  // and replaces the whole Tabs with an error box.
  let panel: HTMLElement;
  if (rendered instanceof HTMLElement) {
    panel = rendered;
  } else {
    panel = el("div", { class: "rui-tab-content", role: "tabpanel" });
    panel.append(rendered);
  }
  const raw = item as { args?: unknown[] } | null;
  const fromArgs = (slot: number): string => asString(raw?.args?.[slot]);
  const data = panel.dataset;
  return {
    panel,
    value: data.value || fromArgs(0) || `tab-${idx}`,
    label: data.label || fromArgs(1) || `Tab ${idx + 1}`,
    badge: data.badge || fromArgs(3),
    icon: data.icon || fromArgs(4),
    disabled: data.disabled === "true" || asBoolean(raw?.args?.[5]),
  };
}

export const Tabs: ComponentSpec = {
  name: "Tabs",
  description:
    "Tabbed container. Children must be TabItem components. Supports " +
    "`orientation=\"vertical\"` for sidebar-style tabs and built-in " +
    "keyboard navigation (←/→ or ↑/↓, Home, End). Provide `onChange` to " +
    "react when the user switches tabs (called with the new tab's value). " +
    "Pass a `$variable` as `value` for a controlled strip — it is kept in sync " +
    "both ways, so a button elsewhere on the page (or a route) can switch tabs " +
    "and a user click updates the variable; `defaultValue` is the initial tab " +
    "only.",
  props: [
    { name: "items", type: "TabItem[]", description: "Tab definitions" },
    { name: "defaultValue", type: "string", optional: true, description: "Initially active tab value" },
    { name: "orientation", type: "string", optional: true, enum: ["horizontal", "vertical"], description: "Layout direction (default `horizontal`)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-activated tab value when the user switches tabs" },
    { name: "value", type: "string", optional: true, description: "Active tab value — pass a `$variable` to control the strip from host state (written back when the user switches tabs)" },
  ],
  render: (node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const orientation = asString(props.orientation, "horizontal");
    const root = el("div", { class: "rui-tabs", "data-orientation": orientation });
    const tablist = el("div", {
      class: "rui-tab-list",
      role: "tablist",
      "aria-orientation": orientation,
    });
    const panels = el("div", { class: "rui-tab-panels" });

    // Render the panels FIRST: every trigger's value/label/badge/icon comes
    // from the rendered panel, which is the only place the resolved TabItem
    // props are observable (see readTabEntry).
    const entries = items.map((item, idx) => readTabEntry(item, idx, helpers));

    // Stable id prefix so each trigger can point at its panel and back.
    const idSlot = helpers.useInstanceState<string>("rui-tabs-id", "");
    if (!idSlot.get()) idSlot.set(`rui-tabs-${(tabsIdSeq += 1)}`);
    const idPrefix = idSlot.get();

    // Compute the fallback tab value (author-supplied `defaultValue` or the
    // first selectable item) so we can seed the persistent active slot when the
    // user has never interacted with this Tabs instance.
    const declaredDefault = asString(props.defaultValue);
    const firstSelectable = entries.find((e) => !e.disabled) ?? entries[0];
    const fallbackValue = declaredDefault || (firstSelectable ? firstSelectable.value : "");

    // Persist the active tab across re-renders. Without this slot the active
    // pane would jump back to `defaultValue` every time an unrelated state
    // change re-renders the tree (e.g. typing into an Input one panel over).
    const activeSlot = helpers.useInstanceState<string>("activeTab", fallbackValue);

    // Re-seed only when `defaultValue` ITSELF changes. The previous condition
    // compared `defaultValue` against a variable that had just been assigned
    // `defaultValue`, so it could never fire and host writes were ignored.
    const seenDefault = helpers.useInstanceState<string | null>("seenDefaultValue", null);
    if (declaredDefault && seenDefault.get() !== declaredDefault) {
      seenDefault.set(declaredDefault);
      activeSlot.set(declaredDefault);
    }

    // Make sure the persisted value still refers to a tab that exists —
    // the LLM may have removed the previously-active tab mid-stream.
    const validValues = new Set(entries.map((e) => e.value));
    if (!validValues.has(activeSlot.get())) {
      activeSlot.set(fallbackValue);
    }

    // A `value` prop is the controlled channel: while it names a real tab it
    // wins over the persisted slot, so host state (a route, a "go to Logs"
    // button) drives the strip.
    const controlled = asString(props.value);
    if (controlled && validValues.has(controlled)) activeSlot.set(controlled);
    // …and a `$variable` there is two-way: the read channel alone would make a
    // click appear to work and then snap back on the next unrelated re-render.
    // Read the ref from the DECLARED slot index — `argMeta.find` would return
    // the first `$`-bound slot, which may be `items` or `defaultValue`.
    const valueStateRef = node.argMeta?.[4]?.stateRef;

    // setActive walks the LIVE DOM (via the clicked button's ancestor chain)
    // instead of the local `tablist` / `panels` closure variables. With the
    // morph reconciler in place, an unrelated re-render may produce a fresh
    // Tabs subtree whose onclick handlers get copied onto the previously
    // mounted nodes — the closures' local refs point at the discarded fresh
    // subtree, but `event.currentTarget` is always the in-DOM button.
    const setActive = (next: string, originBtn: Element): void => {
      const previous = activeSlot.get();
      activeSlot.set(next);
      if (valueStateRef) helpers.setState(valueStateRef, next);
      const liveRoot = originBtn.closest(".rui-tabs");
      if (liveRoot) {
        liveRoot.querySelectorAll<HTMLButtonElement>(".rui-tab-trigger").forEach((b) => {
          const isActive = b.getAttribute("data-value") === next;
          b.setAttribute("aria-selected", isActive ? "true" : "false");
          b.tabIndex = isActive && !b.disabled ? 0 : -1;
        });
        liveRoot.querySelectorAll<HTMLElement>(".rui-tab-content").forEach((p) => {
          p.setAttribute("data-active", p.getAttribute("data-value") === next ? "true" : "false");
        });
      }
      if (previous !== next) helpers.invoke(props.onChange, next);
    };

    entries.forEach((entry, idx) => {
      const { value, label, badge, icon, disabled, panel } = entry;
      const isActive = value === activeSlot.get();
      const tabId = `${idPrefix}-tab-${idx}`;
      const panelId = `${idPrefix}-panel-${idx}`;
      const button = el(
        "button",
        {
          class: "rui-tab-trigger",
          role: "tab",
          type: "button",
          id: tabId,
          "aria-controls": panelId,
          "data-value": value,
          "aria-selected": isActive ? "true" : "false",
          "aria-disabled": disabled ? "true" : null,
          disabled: disabled ? "" : null,
          tabindex: isActive && !disabled ? "0" : "-1",
        },
      );
      // We use the icon helper without falling back to inline emoji so that
      // an unset icon prop renders the trigger as label-only.
      const iconNode = icon ? renderIconForTab(icon) : null;
      if (iconNode) button.append(iconNode);
      button.append(el("span", { class: "rui-tab-trigger-label" }, [label]));
      if (badge) button.append(el("span", { class: "rui-tab-trigger-badge" }, [badge]));
      button.onclick = (event) => {
        const origin = (event.currentTarget ?? event.target) as Element;
        setActive(value, origin);
      };
      // Keyboard navigation between tabs (ArrowLeft/Right/Up/Down/Home/End)
      // resolves the next focusable trigger from the live DOM so it survives
      // morph reconciliation.
      button.onkeydown = (event) => {
        const e = event as KeyboardEvent;
        const horizontal = orientation !== "vertical";
        const isNext = horizontal ? e.key === "ArrowRight" : e.key === "ArrowDown";
        const isPrev = horizontal ? e.key === "ArrowLeft" : e.key === "ArrowUp";
        if (!isNext && !isPrev && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        const origin = (e.currentTarget ?? e.target) as Element;
        const liveList = origin.closest(".rui-tab-list");
        if (!liveList) return;
        // A disabled trigger is not a navigation target — roving focus has to
        // step over it, or ←/→ dead-ends on an unselectable tab.
        const triggers = Array.from(liveList.querySelectorAll<HTMLButtonElement>(".rui-tab-trigger"))
          .filter((t) => !t.disabled);
        if (triggers.length === 0) return;
        const currentIdx = triggers.indexOf(origin as HTMLButtonElement);
        let nextIdx = currentIdx;
        if (e.key === "Home") nextIdx = 0;
        else if (e.key === "End") nextIdx = triggers.length - 1;
        else if (isNext) nextIdx = (currentIdx + 1) % triggers.length;
        else if (isPrev) nextIdx = (currentIdx - 1 + triggers.length) % triggers.length;
        const target = triggers[nextIdx];
        if (!target) return;
        target.focus();
        const nextValue = target.getAttribute("data-value") ?? "";
        if (nextValue) setActive(nextValue, target);
      };
      tablist.append(button);

      panel.setAttribute("data-value", value);
      panel.setAttribute("data-active", isActive ? "true" : "false");
      panel.setAttribute("id", panelId);
      // Pair the panel with its trigger so a screen reader can move between
      // them, and make it focusable so Tab from the trigger lands in the panel
      // (and a panel with no interactive content is still reachable).
      panel.setAttribute("aria-labelledby", tabId);
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "0");
      panels.append(panel);
    });

    root.append(tablist, panels);
    return root;
  },
};

function renderIconForTab(iconName: string): HTMLElement | null {
  // Tab triggers use the standard rui-icon helper class so consumers can
  // override icon spacing via theme tokens without touching the trigger.
  return renderIcon(iconName, { className: "rui-tab-trigger-icon" });
}

const ACCORDION_VARIANTS = ["success", "warning", "danger", "neutral", "info"] as const;

export const AccordionItem: ComponentSpec = {
  name: "AccordionItem",
  description:
    "Single accordion section. Pass a `$variable` as `open` to control it " +
    "from host state (a \"Collapse all\" button then works); `onToggle` fires " +
    "with the new open state, which is where lazy-loading a section's content " +
    "belongs. `variant` paints a semantic left-edge stripe for check-list " +
    "style accordions, and `disabled` marks a section that cannot be opened yet.",
  props: [
    { name: "title", type: "string" },
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "open", type: "boolean", optional: true },
    { name: "showArrow", type: "boolean", optional: true, description: "Show a chevron icon on the right (default false). Inherits from parent Accordion when unset." },
    { name: "variant", type: "string", optional: true, enum: ACCORDION_VARIANTS, aliases: ["tone"], description: "Semantic left-edge stripe (success / warning / danger / neutral / info)" },
    { name: "disabled", type: "boolean", optional: true, description: "Section cannot be expanded (e.g. a step that is not available yet)" },
    { name: "onToggle", type: "callable", optional: true, aliases: ["onOpenChange", "ontoggle"], description: "Called with the new open state whenever the section expands or collapses" },
  ],
  render: (node, props, helpers) => {
    const explicit = props.showArrow !== undefined && props.showArrow !== null;
    // "Does this render own the open state?" A prop that was never supplied
    // leaves `<details>` entirely user-driven; one that was supplied makes the
    // render authoritative, which is what lets a programmatic collapse work.
    const controlsOpen = props.open !== undefined && props.open !== null;
    const isOpen = asBoolean(props.open);
    const disabled = asBoolean(props.disabled);
    // Slots are read up here because the mounted node is also what tells an
    // UNCONTROLLED item which `data-state` to render.
    const liveSlot = helpers.useInstanceState<HTMLElement | null>("rui-accordion-node", null);
    const assertedSlot = helpers.useInstanceState<boolean | null>("rui-accordion-open", null);
    const recorded = liveSlot.get();
    // `data-state` is what the themes key their open styling on, and it has to
    // be right for a user-toggled `<details>` too — so re-read the live node
    // rather than letting morph's attribute sync reset it to "closed" on every
    // unrelated re-render.
    const stateOpen = controlsOpen
      ? isOpen
      : Boolean(recorded?.isConnected && (recorded as HTMLDetailsElement).open);
    const details = el("details", {
      class: "rui-accordion-item",
      "data-show-arrow": explicit ? (asBoolean(props.showArrow) ? "true" : "false") : null,
      "data-variant": asString(props.variant) || null,
      "data-disabled": disabled ? "true" : null,
      // The morph reconciler deliberately never strips `open` from a
      // `<details>` (it is user-toggleable state), so an `open: false` render
      // could never collapse an expanded item. `data-rui-open` is an attribute
      // morph DOES sync; the observer below mirrors it onto the live element.
      "data-rui-open": controlsOpen ? String(isOpen) : null,
      "data-state": stateOpen ? "open" : "closed",
    });
    if (isOpen) details.setAttribute("open", "");
    const summary = el("summary", { class: "rui-accordion-trigger" });
    summary.append(el("span", { class: "rui-accordion-title" }, [asString(props.title)]));
    summary.append(el("span", { class: "rui-accordion-chevron", "aria-hidden": "true" }));
    if (disabled) {
      summary.setAttribute("aria-disabled", "true");
      // `<details>` has no `disabled`; swallowing the activation is the only
      // way to keep an unavailable section closed.
      summary.onclick = (event) => { event.preventDefault(); };
    }
    details.append(summary);
    const body = el("div", { class: "rui-accordion-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    details.append(body);

    // `ontoggle` is a property handler, so morph copies it onto the kept node
    // with this render's closure — the state ref and `onToggle` stay current.
    const stateName = node.argMeta?.[2]?.stateRef;
    details.ontoggle = (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLDetailsElement;
      const nowOpen = live.open;
      live.setAttribute("data-state", nowOpen ? "open" : "closed");
      // Only write back when the DOM has actually diverged from the render's
      // assertion, so mirroring `data-rui-open` cannot bounce back as a state
      // write and re-render loop.
      if (stateName && live.getAttribute("data-rui-open") !== String(nowOpen)) {
        helpers.setState(stateName, nowOpen);
      }
      helpers.invoke(props.onToggle, nowOpen);
    };

    // Mirror a CHANGED `open` prop onto the live element. Only on change, so an
    // unrelated re-render never re-opens a section the user just closed by hand
    // — and `<details>.open` is a property, which is the one channel the
    // reconciler leaves alone.
    if (!recorded?.isConnected) whenMounted(details, (live) => liveSlot.set(live));
    if (controlsOpen && assertedSlot.get() !== isOpen) {
      assertedSlot.set(isOpen);
      withLiveNode(details, liveSlot, (live) => {
        if ((live as HTMLDetailsElement).open !== isOpen) (live as HTMLDetailsElement).open = isOpen;
      });
    }
    return details;
  },
};

let accordionIdSeq = 0;

/**
 * The accordion item element(s) a rendered child contributes: the item itself,
 * the items inside a plain wrapper, or the items of a `Fragment` group. Walks
 * one level only — a nested Accordion inside a section body is its own group.
 */
function accordionItemsIn(rendered: Node): HTMLElement[] {
  if (rendered instanceof HTMLElement && rendered.classList.contains("rui-accordion-item")) {
    return [rendered];
  }
  const out: HTMLElement[] = [];
  for (const child of Array.from(rendered.childNodes)) {
    if (child instanceof HTMLElement && child.classList.contains("rui-accordion-item")) out.push(child);
  }
  return out;
}

export const Accordion: ComponentSpec = {
  name: "Accordion",
  description:
    "Accordion container. Children must be AccordionItem components. " +
    "Set `showArrow: true` to add a chevron indicator to every item; " +
    "individual `AccordionItem`s can override via their own `showArrow` prop. " +
    "`type: \"single\"` keeps only one section open at a time (the browser " +
    "closes the previous one); `onChange` is called with the section's title " +
    "and its new open state whenever any section toggles.",
  props: [
    { name: "items", type: "AccordionItem[]" },
    { name: "showArrow", type: "boolean", optional: true, description: "Show chevron icon on every item (default false)." },
    { name: "type", type: "string", optional: true, enum: ["single", "multiple"], description: "`single` allows one open section at a time; `multiple` (default) allows any number." },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with (title, open) when any section toggles" },
  ],
  render: (_node, props, helpers) => {
    const single = asString(props.type, "multiple") === "single";
    // One shared `name` per instance is what makes the browser enforce
    // single-open — the exclusive-accordion behaviour, without JS bookkeeping.
    const groupSlot = helpers.useInstanceState<string>("rui-accordion-group", "");
    if (single && !groupSlot.get()) groupSlot.set(`rui-accordion-${(accordionIdSeq += 1)}`);
    const groupName = single ? groupSlot.get() : "";
    const root = el("div", {
      class: "rui-accordion",
      "data-show-arrow": asBoolean(props.showArrow) ? "true" : "false",
      "data-type": single ? "single" : "multiple",
    });
    const notify = props.onChange != null;
    for (const child of asArray(props.items)) {
      const rendered = helpers.renderNode(child);
      // Resolve the item elements BEFORE appending: a DocumentFragment is
      // emptied by `append`.
      const itemEls = accordionItemsIn(rendered);
      for (const item of itemEls) {
        if (groupName) item.setAttribute("name", groupName);
        if (!notify) continue;
        // Compose with the item's own `ontoggle` rather than replacing it —
        // AccordionItem uses it for its state write-back. `toggle` does not
        // bubble, so a container-level listener is not an option.
        const prior = item.ontoggle;
        item.ontoggle = (event) => {
          const live = (event.currentTarget ?? event.target) as HTMLDetailsElement;
          if (prior) prior.call(live, event);
          const title = live.querySelector(".rui-accordion-title")?.textContent ?? "";
          helpers.invoke(props.onChange, title, live.open);
        };
      }
      root.append(rendered);
    }
    return root;
  },
};

const clampGridColumns = (n: number): number => Math.max(1, Math.min(GRID_COLUMNS, Math.round(n)));

/** Resolve a grid span from a number or fraction string (e.g. `"1/3"` → 4 on a 12-col grid). */
export function resolveSpan(span: unknown): number {
  if (span == null || span === "") return 12;
  const raw = String(span).trim();
  if (raw.includes("/")) {
    const [numPart, denPart] = raw.split("/");
    const num = Number(numPart);
    const den = Number(denPart);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return clampGridColumns(Math.round((GRID_COLUMNS * num) / den));
    }
  }
  if (raw === "auto" || raw === "fit" || raw === "auto-fit" || raw === "full" || raw === "100%") return 12;
  return clampGridColumns(asNumber(span, 12));
}

// `minItemWidth` is declared as an alias of `minChildWidth`, and the evaluator
// folds aliases into the canonical slot before render — so `minChildWidth` is
// the only key that ever carries the value.
function gridMinChildWidth(props: Record<string, unknown>): string {
  return sanitiseCssLength(asString(props.minChildWidth) || "220px", "220px");
}

export const GridItem: ComponentSpec = {
  name: "GridItem",
  description:
    "Wraps a child in a 12-column grid cell with `span`, `offset`, `rowSpan`, " +
    "and responsive `spanAt` maps. Parent `Grid` auto-enables 12-column mode " +
    "when any child is a `GridItem`. Fraction spans like `\"1/3\"` resolve " +
    "against the 12-column track. With no `span` the item takes one cell, so " +
    "`GridItem` wrappers are safe inside a `Grid(columns: N)`.",
  props: [
    { name: "child", aliases: ["children"], type: "Node", description: "Child node to place in the grid" },
    { name: "span", type: "number | string", optional: true, description: "Columns to span (1–12) or fraction like \"1/2\", \"1/3\" (default: one cell)" },
    { name: "offset", type: "number", optional: true, description: "Empty columns before this item (0–11)" },
    { name: "spanAt", type: "object", optional: true, description: "Responsive span map `{sm: 12, md: 6, lg: 4}`" },
    { name: "rowSpan", type: "number", optional: true, description: "Rows to span — the tall dashboard cell next to stacked KPI cards" },
  ],
  render: (_node, props, helpers) => {
    // No default span. `span: 12` used to be assumed, which made every
    // GridItem child of a `Grid(columns: 3)` claim the whole row; the CSS
    // fallback of `span 1` is the right "one cell" behaviour.
    const hasSpan = props.span !== undefined && props.span !== null && props.span !== "";
    const baseSpan = hasSpan ? resolveSpan(props.span) : null;
    const spanAt = readResponsiveProp<number | string>(props.spanAt);
    const offset = props.offset === undefined || props.offset === null
      ? 0
      : Math.max(0, Math.min(GRID_COLUMNS - 1, Math.round(asNumber(props.offset, 0))));
    const attrs: Record<string, string | null> = {
      class: "rui-grid-item",
    };
    const styleParts: string[] = [];
    if (baseSpan !== null) {
      attrs["data-span"] = String(baseSpan);
      styleParts.push(`--rui-grid-item-span:${baseSpan}`);
    }
    if (offset > 0) {
      attrs["data-offset"] = String(offset);
      styleParts.push(`--rui-grid-item-offset:${offset}`);
    }
    const rowSpan = props.rowSpan === undefined || props.rowSpan === null
      ? 0
      : Math.max(1, Math.round(asNumber(props.rowSpan, 1)));
    if (rowSpan > 1) {
      attrs["data-row-span"] = String(rowSpan);
      // The real declaration, not just the custom property: no stylesheet rule
      // reads `grid-row`, so a var on its own would leave the prop inert — and
      // the tall dashboard cell is the whole reason `rowSpan` exists.
      styleParts.push(`--rui-grid-item-row-span:${rowSpan}`, `grid-row:span ${rowSpan}`);
    }
    if (spanAt.kind === "responsive") {
      attrs["data-responsive-span"] = "true";
      for (const bp of RESPONSIVE_BREAKPOINTS) {
        const v = spanAt.values[bp];
        if (v !== undefined) {
          const resolved = resolveSpan(v);
          styleParts.push(`--rui-grid-item-span-${bp}:${resolved}`);
        }
      }
    } else if (spanAt.kind === "single" && spanAt.value != null) {
      const resolved = resolveSpan(spanAt.value);
      styleParts.push(`--rui-grid-item-span:${resolved}`);
      attrs["data-span"] = String(resolved);
    }
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    root.append(helpers.renderNode(props.child));
    return root;
  },
};

/**
 * Corner rounding for `Box`, emitted as a real declaration rather than a data
 * attribute: radius used to be welded to the `border` presets, so an explicit
 * `radius` has to out-rank them, and a semantic background needs to round
 * itself without also drawing a border.
 */
const BOX_RADIUS: Record<string, string> = {
  none: "0",
  sm: "var(--rui-radius-sm)",
  md: "var(--rui-radius-md)",
  lg: "var(--rui-radius-lg)",
  pill: "var(--rui-radius-pill)",
};

export const Box: ComponentSpec = {
  name: "Box",
  description:
    "Spacing and surface wrapper for padding, margin, borders, semantic " +
    "backgrounds, and max-width constraints. Use when a `Card` is too heavy " +
    "but the content needs a subtle surface or inset. `radius` rounds the " +
    "surface independently of `border`.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "padding", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Inner padding. May be a responsive map." },
    { name: "margin", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Outer margin. May be a responsive map." },
    { name: "border", type: "string", optional: true, enum: ["none", "subtle", "default"], description: "Border preset (default none)" },
    { name: "background", type: "string", optional: true, enum: ["none", "surface", "muted", "primary", "success", "warning", "danger", "info"], description: "Semantic background token" },
    { name: "maxWidth", type: "string", optional: true, description: "CSS max-width" },
    { name: "radius", type: "string", optional: true, enum: ["none", "sm", "md", "lg", "pill"], description: "Corner rounding — independent of `border`" },
  ],
  render: (_node, props, helpers) => {
    const padding = readResponsiveProp<string>(props.padding);
    const margin = readResponsiveProp<string>(props.margin);
    const border = asString(props.border, "none");
    const background = asString(props.background, "none");
    // A semantic surface implies rounding: without this a `background`-only Box
    // is a hard-cornered rectangle inside a rounded Card, and the only way to
    // round it was to add a border nobody asked for.
    const radius = asString(props.radius)
      || (background !== "none" && border === "none" ? "md" : "");
    const attrs: Record<string, string | null> = {
      class: "rui-box",
      "data-border": border,
      "data-background": background,
      "data-radius": radius || null,
    };
    const styleParts: string[] = [];
    if (radius && BOX_RADIUS[radius]) styleParts.push(`border-radius:${BOX_RADIUS[radius]}`);
    const maxWidth = asString(props.maxWidth);
    // Literal fallback — see StackItem: `sanitiseCssLength(v, v)` returns the
    // rejected value and defeats the guard entirely.
    if (maxWidth) styleParts.push(`max-width:${sanitiseCssLength(maxWidth, "none")}`);
    if (padding.kind === "single") {
      const pad = padding.value ? normalizeSpacingToken(padding.value, String(padding.value)) : null;
      if (pad) attrs["data-padding"] = pad;
    } else {
      attrs["data-padding"] = "responsive";
      attrs["data-responsive-padding"] = "true";
      emitResponsiveSpacingVars(styleParts, padding, "--rui-box-padding");
    }
    if (margin.kind === "single") {
      const mar = margin.value ? normalizeSpacingToken(margin.value, String(margin.value)) : null;
      if (mar) attrs["data-margin"] = mar;
    } else {
      attrs["data-margin"] = "responsive";
      attrs["data-responsive-margin"] = "true";
      emitResponsiveSpacingVars(styleParts, margin, "--rui-box-margin");
    }
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Fragment: ComponentSpec = {
  name: "Fragment",
  description:
    "Groups several siblings into one value WITHOUT adding a layout box — the " +
    "children become direct children of the parent, so they participate in its " +
    "flex/grid layout exactly as if they had been written inline. Use to return " +
    "multiple nodes from a component, or to conditionally group siblings, " +
    "without a stray `div` that would break a Grid/Stack's spacing. Because " +
    "there is no element, universal style props (`sx`, `animate`, `id`) have " +
    "nothing to attach to — wrap the group in a `Box` if you need those.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]", description: "Sibling nodes to group" },
  ],
  render: (_node, props, helpers) => {
    // A real element — even `display: contents` — still matches every
    // `> *` rule the parent aims at its children (`.rui-grid[data-grid-mode]
    // > *`, the row hugging rules for tags/badges, the mobile column
    // collapse), so those rules landed on the boxless wrapper instead of the
    // nodes they were written for. A DocumentFragment has no such shadow:
    // `renderNode` splices it into the parent and morph reconciles the
    // flattened child list.
    const frag = document.createDocumentFragment();
    for (const child of asArray(props.children)) frag.append(helpers.renderNode(child));
    return frag;
  },
};

export const Grid: ComponentSpec = {
  name: "Grid",
  description:
    "Two-dimensional grid with three modes:\n" +
    "  1. AUTO-FIT (default, no `columns`): wraps as many equal columns as " +
    "fit, each at least `minChildWidth` wide (default 220px) — perfect for " +
    "card/KPI grids that should reflow on their own.\n" +
    "  2. FIXED (`columns: N`, 1–12): exactly N equal columns.\n" +
    "  3. SPAN (`columns: 12` or any `GridItem` children): a 12-track grid " +
    "where each `GridItem` sets its own `span` (a number 1–12 or a fraction " +
    "like `\"1/3\"`) for dashboards and asymmetric layouts.\n" +
    "`columns` and `gap` accept responsive maps like `{base: 1, md: 2, lg: 4}`.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "columns", type: "number | object", optional: true, description: "Fixed column count 1–12. Omit for auto-fit; `12` (or `GridItem` children) enables the 12-track span system. May be a responsive map like `{base: 1, md: 3}`." },
    { name: "gap", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Gap on both axes (default `md`). May be a responsive map." },
    { name: "rowGap", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Row gap override. May be a responsive map." },
    { name: "columnGap", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Column gap override. May be a responsive map." },
    { name: "minChildWidth", type: "string", optional: true, aliases: ["minItemWidth"], description: "Minimum column width for AUTO-FIT mode, e.g. `\"240px\"` (default 220px). Also caps the floor in FIXED mode." },
    { name: "alignItems", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Vertical alignment of items within their cells" },
    { name: "justifyItems", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Horizontal alignment of items within their cells" },
    { name: "dense", type: "boolean", optional: true, description: "Dense auto-flow packing — let later items backfill earlier gaps" },
  ],
  render: (_node, props, helpers) => {
    const children = asArray(props.children);
    const hasGridItems = children.some((child) => isComponentNamed(child, "GridItem"));
    const columns = readResponsiveProp<number | string>(props.columns);
    const gap = readResponsiveProp<string>(props.gap);
    const rowGap = readResponsiveProp<string>(props.rowGap);
    const columnGap = readResponsiveProp<string>(props.columnGap);
    const attrs: Record<string, string | null> = {
      class: "rui-grid",
    };
    const styleParts: string[] = [];
    // Twelve-column mode is enabled when (a) the author explicitly asks
    // for 12 columns or (b) GridItem children are present AND no explicit
    // non-12 column count was supplied. When the author writes
    // `Grid([...], 3)` they expect a 3-column grid regardless of whether
    // the children are GridItem wrappers; forcing 12-column mode squashes
    // each `GridItem` (default span=1) to 1/12 of the row.
    let twelveColMode = false;
    let explicitNonTwelve = false;
    // A responsive `columns` map owns the template outright: the 12-track rule
    // and the per-breakpoint rules have identical specificity and the 12-track
    // one comes later, so setting both threw the whole map away.
    const responsiveCols = columns.kind === "responsive";

    if (columns.kind === "single") {
      const requested = columns.value === null ? 0 : asNumber(columns.value, 0);
      const cols = requested > 0 ? clampGridColumns(requested) : 0;
      if (cols === GRID_COLUMNS) {
        twelveColMode = true;
      } else if (cols > 0) {
        explicitNonTwelve = true;
      }
      if (cols > 0) {
        attrs["data-columns"] = String(cols);
        const minChild = asString(props.minChildWidth);
        if (minChild) {
          attrs["data-min-child-width"] = "true";
          styleParts.push(`--rui-grid-min-child:${sanitiseCssLength(minChild, "220px")}`);
        }
      } else {
        styleParts.push(`--rui-grid-min-item:${gridMinChildWidth(props)}`);
      }
    } else {
      attrs["data-responsive-cols"] = "true";
      for (const bp of RESPONSIVE_BREAKPOINTS) {
        const v = columns.values[bp as Breakpoint];
        if (v === undefined) continue;
        styleParts.push(`--rui-grid-cols-${bp}:${clampGridColumns(asNumber(v, 0))}`);
      }
      // `minChildWidth` is a floor in every mode, not just fixed / auto-fit —
      // "at most 4 columns but never narrower than 280px" has to be expressible.
      const minChild = asString(props.minChildWidth);
      if (minChild) {
        attrs["data-min-child-width"] = "true";
        styleParts.push(`--rui-grid-min-child:${sanitiseCssLength(minChild, "220px")}`);
      }
    }

    if (hasGridItems && !explicitNonTwelve && !responsiveCols) twelveColMode = true;
    if (twelveColMode) attrs["data-grid-mode"] = "12";

    if (gap.kind === "single") {
      attrs["data-gap"] = gap.value ? normalizeSpacingToken(gap.value, String(gap.value)) : "md";
    } else {
      attrs["data-gap"] = "responsive";
      attrs["data-responsive-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, gap, "--rui-grid-gap");
    }

    if (rowGap.kind === "single" && rowGap.value) {
      attrs["data-row-gap"] = normalizeSpacingToken(rowGap.value, String(rowGap.value));
    } else if (rowGap.kind === "responsive") {
      attrs["data-row-gap"] = "responsive";
      attrs["data-responsive-row-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, rowGap, "--rui-grid-row-gap");
    }

    if (columnGap.kind === "single" && columnGap.value) {
      attrs["data-column-gap"] = normalizeSpacingToken(columnGap.value, String(columnGap.value));
    } else if (columnGap.kind === "responsive") {
      attrs["data-column-gap"] = "responsive";
      attrs["data-responsive-column-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, columnGap, "--rui-grid-column-gap");
    }

    const alignItems = asString(props.alignItems);
    if (alignItems) attrs["data-align-items"] = alignItems;
    const justifyItems = asString(props.justifyItems);
    if (justifyItems) attrs["data-justify-items"] = justifyItems;
    if (asBoolean(props.dense)) attrs["data-dense"] = "true";

    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const child of children) root.append(helpers.renderNode(child));
    return root;
  },
};

export const AspectRatio: ComponentSpec = {
  name: "AspectRatio",
  description:
    "Container that constrains its child to a fixed aspect ratio (e.g. 16:9 " +
    "for video embeds, 1:1 for thumbnails). The FIRST child fills the box; any " +
    "further children are overlays positioned on top of it (a \"LIVE\" badge " +
    "over a thumbnail), not stacked below.",
  props: [
    { name: "ratio", type: "string", description: "`width:height` (e.g. `16:9`, `4:3`) or a decimal like `1.78`" },
    { name: "children", aliases: ["child"], type: "Node[]" },
  ],
  render: (_node, props, helpers) => {
    const ratio = parseRatio(asString(props.ratio, "16:9"));
    const children = asArray(props.children);
    const root = el("div", {
      class: "rui-aspect-ratio",
      // Marks the overlay case for CSS: every direct child is sized to
      // 100%×100%, so a second child would otherwise be pushed out of the
      // clipped box and never seen.
      "data-overlay": children.length > 1 ? "true" : null,
      style: `aspect-ratio:${ratio};`,
    });
    for (const child of children) root.append(helpers.renderNode(child));
    return root;
  },
};

function parseRatio(input: string): string {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    // Both components must be POSITIVE: `aspect-ratio: 0 / 1` (or a negative
    // ratio) is invalid, the declaration is dropped, and the `overflow: hidden`
    // box collapses to zero height — an invisible element with no error.
    if (Number.isFinite(num) && num > 0 && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}

/**
 * Per-element "is the viewport still pinned to the bottom?" flag for
 * `stickToBottom`. Absent means pinned: a pane that has never been scrolled
 * should follow new content. Set to false the moment the user scrolls up, so
 * appended lines never yank them back down.
 */
const SCROLL_PINNED: WeakMap<HTMLElement, boolean> = new WeakMap();
const STICK_THRESHOLD_PX = 24;

const isNearBottom = (node: HTMLElement): boolean =>
  node.scrollHeight - node.clientHeight - node.scrollTop <= STICK_THRESHOLD_PX;

export const ScrollArea: ComponentSpec = {
  name: "ScrollArea",
  description:
    "Bounded scroll container. Use to clip long lists / logs / chat panels " +
    "to a fixed max height with a clean scrollbar. `height` gives the pane a " +
    "stable box (it does not grow with its content); `maxHeight` lets it grow " +
    "up to a cap. `stickToBottom` keeps the newest line in view as content is " +
    "appended, until the user scrolls up.",
  props: [
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "maxHeight", type: "string", optional: true, description: "CSS max-height — the pane grows with its content up to this cap (default 320px)" },
    { name: "direction", type: "string", optional: true, enum: ["vertical", "horizontal", "both"] },
    { name: "height", type: "string", optional: true, description: "CSS height — a FIXED box that neither grows nor shrinks with its content" },
    { name: "stickToBottom", type: "boolean", optional: true, description: "Auto-scroll to the newest content (logs / chat), until the user scrolls up" },
  ],
  render: (_node, props, helpers) => {
    // `height` used to be an alias of `maxHeight`, so a chat pane asked for a
    // stable 400px box and got one that grew from ~90px — reflowing the page on
    // every message. The two are now separate declarations.
    const height = asString(props.height);
    const styleParts = [`max-height:${sanitiseCssLength(props.maxHeight, "320px")}`];
    if (height) styleParts.push(`height:${sanitiseCssLength(height, "auto")}`);
    const stick = asBoolean(props.stickToBottom);
    const root = el("div", {
      class: "rui-scroll-area",
      "data-direction": asString(props.direction, "vertical"),
      "data-stick-to-bottom": stick ? "true" : null,
      style: `${styleParts.join(";")};`,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    if (stick) {
      // Property handler so morph keeps it on the live node; the pinned flag is
      // read off `currentTarget`, never a render-time capture.
      root.onscroll = (event) => {
        const live = (event.currentTarget ?? event.target) as HTMLElement;
        SCROLL_PINNED.set(live, isNearBottom(live));
      };
      if (typeof MutationObserver !== "undefined") {
        whenMounted(root, (live) => {
          const follow = (): void => {
            // Re-read the attribute rather than the captured prop: the render
            // keeps it current, this closure is from the mount render.
            if (live.getAttribute("data-stick-to-bottom") !== "true") return;
            if (SCROLL_PINNED.get(live) === false) return;
            live.scrollTop = live.scrollHeight;
          };
          follow();
          const observer = new MutationObserver(follow);
          observer.observe(live, { childList: true, subtree: true, characterData: true });
          helpers.registerDisposer(() => observer.disconnect(), "rui-scroll-stick");
        });
      }
    }
    return root;
  },
};

const MODAL_SIZES = ["sm", "md", "lg", "xl", "full"] as const;

/** Tab-reachable elements inside a dialog, used by the Modal focus trap. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let modalIdSeq = 0;

/**
 * Focusable AND actually rendered.
 *
 * `querySelectorAll` also returns the controls inside a `display: none`
 * subtree — an inactive `TabItem` panel, a collapsed `<details>` body — and
 * `.focus()` on those is a no-op. The trap then compared the active element
 * against an unfocusable `last`, never matched, never called `preventDefault`,
 * and Tab walked straight out of a dialog claiming `aria-modal="true"`.
 *
 * When NOTHING is measurable the environment has no layout engine at all
 * (test DOMs, offscreen panes), so we keep the unfiltered list rather than
 * pretending the dialog is empty.
 */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
  const rendered = all.filter((n) => n.offsetParent !== null || n.getClientRects().length > 0);
  return rendered.length > 0 ? rendered : all;
}

/** The active element within the modal's root (document or shadow root). */
function activeWithin(el: Element): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return (root as Document).activeElement ?? null;
}

/*
 * The scrim is promoted into the browser TOP LAYER while open, through the
 * shared `promoteOverlay` / `releaseOverlay` pair in `../floating.js` — the same
 * pair Sheet, ConfirmDialog, Confetti and the other viewport overlays use.
 *
 * `position: fixed` alone is not enough: any ancestor with `transform`,
 * `filter`, `backdrop-filter` or `will-change` becomes its containing block, and
 * the library creates those itself (the glass theme filters `.rui-card`
 * unconditionally, modern/glass translate a card on hover, the universal
 * `animate` prop can put a permanent transform on ANY component). The
 * "full-screen" scrim then collapses into that ancestor's box — and inside
 * `.rui-accordion-item` it is clipped by `overflow: hidden` as well.
 *
 * Modal passes no overlay reset: `.rui-modal-overlay` IS the scrim, so it owns a
 * background and a padding that the full-bleed presets would flatten. The UA
 * geometry (`fit-content`, `margin: auto`, `border: solid`, `color: CanvasText`)
 * is neutralised by the shared reset for every surface.
 */

/**
 * Background scroll lock, ref-counted so nested dialogs cannot clobber each
 * other's restore value. Keyed by element so a re-render while open never
 * double-locks.
 */
const SCROLL_LOCKED: WeakSet<HTMLElement> = new WeakSet();
let scrollLockCount = 0;
let savedBodyOverflow = "";

function lockBodyScroll(owner: HTMLElement): void {
  if (typeof document === "undefined" || !document.body) return;
  if (SCROLL_LOCKED.has(owner)) return;
  SCROLL_LOCKED.add(owner);
  scrollLockCount += 1;
  if (scrollLockCount === 1) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockBodyScroll(owner: HTMLElement): void {
  if (typeof document === "undefined" || !document.body) return;
  if (!SCROLL_LOCKED.delete(owner)) return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = "";
  }
}

/**
 * Release the top layer and the scroll lock if the dialog is unmounted while
 * open — otherwise the page stays locked with no dialog to close.
 * Registered once per LIVE node: re-registering a keyed disposer runs the
 * previous cleanup immediately, which would unlock on every re-render.
 */
const MODAL_TEARDOWN: WeakSet<HTMLElement> = new WeakSet();
function installModalTeardown(live: HTMLElement, helpers: RenderHelpers): void {
  if (MODAL_TEARDOWN.has(live)) return;
  MODAL_TEARDOWN.add(live);
  helpers.registerDisposer(() => {
    releaseOverlay(live);
    unlockBodyScroll(live);
    MODAL_TEARDOWN.delete(live);
  }, "rui-modal-teardown");
}

export const Modal: ComponentSpec = {
  name: "Modal",
  description:
    "Dialog overlay shown when `open` is true. Pass a `$variable` as " +
    "`open` to control it — the × button, Escape and the backdrop close the " +
    "dialog by writing that variable, so a literal `true` or an expression " +
    "needs `onRequestClose` instead or the dialog cannot be dismissed. The " +
    "header always renders a × close button (disable via `closable: false`); " +
    "the optional `footer` slot is the canonical place for action buttons. " +
    "`closeOnBackdrop=true` opts in to backdrop-click dismissal. `onClose` " +
    "fires once every time the modal actually closes, however it closed " +
    "(× button, Escape, backdrop, or a state write from a Cancel/Save " +
    "button). `lazy: true` skips rendering the body while closed. Accessible " +
    "by default: the dialog is labelled by its title, renders in the browser's " +
    "top layer so no transformed ancestor can clip it, moves focus into itself " +
    "on open and restores it on close, traps Tab, locks background scrolling, " +
    "and closes on Escape (unless `closable: false`).",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state — usually a $variable" },
    { name: "children", aliases: ["child"], type: "Node[]" },
    { name: "size", type: "string", optional: true, enum: MODAL_SIZES, description: "Width preset (default `md`)" },
    { name: "footer", type: "Node[]", optional: true, description: "Footer slot — typically a row of action Buttons" },
    { name: "closable", type: "boolean", optional: true, description: "Render the header × button (default true)" },
    { name: "closeOnBackdrop", type: "boolean", optional: true, description: "Close when the overlay is clicked (default false)" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked once whenever the modal closes, by any route" },
    { name: "onRequestClose", type: "callable", optional: true, description: "Called when the user asks to close (× / Escape / backdrop). Required when `open` is not a plain $variable — that is the only way the dialog can be dismissed." },
    { name: "lazy", type: "boolean", optional: true, description: "Skip rendering `children`/`footer` while closed (defer charts, tables, timers)" },
  ],
  render: (node, props, helpers) => {
    const size = asString(props.size, "md");
    const closable = props.closable === undefined ? true : asBoolean(props.closable);
    const isOpen = asBoolean(props.open);
    // No `popover` / `style` in the render output: promotion is a fact about the
    // LIVE node, not something a render can assert. An overlay that carries
    // `popover` without having been shown is `display: none` per the UA rule
    // `[popover]:not(:popover-open)` — an invisible modal with `open: true`,
    // which is exactly what happened when morph replaced the node outside an
    // open/close transition. `promoteOverlay` writes the attribute only once
    // `showPopover()` has succeeded, and marks the node `data-floating-side` so
    // the reconciler stops treating `popover`/`style` as render-owned.
    const overlay = el("div", {
      class: "rui-modal-overlay",
      "data-open": isOpen ? "true" : "false",
    });
    // Stable id so the title can label the dialog for assistive tech.
    const titleIdSlot = helpers.useInstanceState<string>("rui-modal-title-id", "");
    if (!titleIdSlot.get()) titleIdSlot.set(`rui-modal-title-${(modalIdSeq += 1)}`);
    const titleId = titleIdSlot.get();
    const dialog = el("div", {
      class: "rui-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      // Focusable so we can move focus into the dialog on open.
      tabindex: "-1",
      "data-size": size,
    });
    const header = el("header", { class: "rui-modal-header" });
    header.append(el("h3", { class: "rui-modal-title", id: titleId }, [asString(props.title)]));
    const stateName = node.argMeta?.[1]?.stateRef;
    // "The user asked to close." Writing the bound state is what actually
    // closes the dialog; `onClose` is NOT called here — it fires from the
    // open→closed transition below, so a Cancel button that writes the state
    // itself reports the close exactly like the × button does.
    const requestClose = (): void => {
      if (stateName) helpers.setState(stateName, false);
      helpers.invoke(props.onRequestClose);
    };
    if (closable) {
      const closeBtn = el("button", {
        type: "button",
        class: "rui-modal-close",
        "aria-label": "Close dialog",
      }, ["×"]);
      closeBtn.onclick = (event) => {
        event.stopPropagation();
        requestClose();
      };
      header.append(closeBtn);
    }
    dialog.append(header);
    // `lazy` keeps a closed dialog's subtree unrendered: the overlay is only
    // `display: none`, so a Chart / Table / data-fetching child otherwise runs
    // its full render and side effects on every commit while invisible.
    const renderContent = isOpen || !asBoolean(props.lazy);
    const body = el("div", { class: "rui-modal-body" });
    if (renderContent) {
      for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    }
    dialog.append(body);
    const footer = renderContent ? asArray<unknown>(props.footer) : [];
    if (footer.length > 0) {
      const footRow = el("footer", { class: "rui-modal-footer" });
      for (const item of footer) footRow.append(helpers.renderNode(item));
      dialog.append(footRow);
    }
    overlay.append(dialog);
    if (asBoolean(props.closeOnBackdrop)) {
      overlay.onclick = (event) => {
        // `currentTarget` is the LIVE overlay; `overlay` is this render's
        // snapshot, which morph may already have discarded.
        if (event.target === event.currentTarget) requestClose();
      };
    }

    // ── Accessibility: Escape to close + Tab focus trap ──────────────
    // A PROPERTY handler, not addEventListener: morph copies property handlers
    // onto the node it keeps, so `closable` / `onRequestClose` / the state ref
    // stay current. An addEventListener closure is frozen at first mount —
    // `closable: $confirmed` would never start honouring Escape.
    dialog.onkeydown = (event) => {
      const live = (event.currentTarget ?? event.target) as HTMLElement;
      if (event.key === "Escape" && closable) {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusablesIn(live);
      if (items.length === 0) {
        event.preventDefault();
        live.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = activeWithin(live);
      if (event.shiftKey && (active === first || !live.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // ── Open/close side effects, on the LIVE overlay ──────────────────
    // `useInstanceState` survives re-renders, so this reacts to the
    // closed→open / open→closed transition rather than every commit. All the
    // DOM work runs against the mounted node (see withLiveNode): the node this
    // render just built is thrown away by morph on every commit but the first,
    // so focusing / promoting it was a silent no-op.
    const liveSlot = helpers.useInstanceState<HTMLElement | null>("rui-modal-node", null);
    // Record the mounted overlay on the first commit — a later render that
    // flips `open` only ever holds a snapshot, so without this the open
    // transition would have no live node to focus or promote.
    if (!liveSlot.get()?.isConnected) whenMounted(overlay, (live) => liveSlot.set(live));
    const openSlot = helpers.useInstanceState<{ open: boolean; prev: Element | null }>(
      "rui-modal-focus",
      { open: false, prev: null },
    );
    const prevState = openSlot.get();
    if (isOpen !== prevState.open) {
      const recorded = liveSlot.get();
      const anchor = recorded && recorded.isConnected ? recorded : overlay;
      const toRestore = isOpen ? null : (prevState.prev as HTMLElement | null);
      openSlot.set({ open: isOpen, prev: isOpen ? activeWithin(anchor) : null });
      withLiveNode(overlay, liveSlot, (live) => {
        installModalTeardown(live, helpers);
        if (isOpen) {
          promoteOverlay(live);
          lockBodyScroll(live);
          const panel = live.querySelector<HTMLElement>(".rui-modal") ?? live;
          (focusablesIn(panel)[0] ?? panel).focus();
        } else {
          releaseOverlay(live);
          unlockBodyScroll(live);
          if (toRestore && typeof toRestore.focus === "function") toRestore.focus();
        }
      });
      // Every close route ends here — including a Cancel button that only
      // wrote the state — so `onClose` fires exactly once per close.
      if (!isOpen) helpers.invoke(props.onClose);
    }

    return overlay;
  },
};
