/**
 * Layout components: Stack, StackItem, Grid, GridItem, Box, Card, CardHeader,
 * CardFooter, Tabs, TabItem, Accordion, AccordionItem,
 * Modal, AspectRatio, ScrollArea.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseCssLength,
  readResponsiveProp, RESPONSIVE_BREAKPOINTS, type Breakpoint, type ResponsiveProp,
  SPACING_TOKENS, normalizeSpacingToken, spacingCssValue,
} from "../utils.js";

const GRID_COLUMNS = 12;

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
    { name: "child", type: "Node", description: "Child node to wrap" },
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
    if (props.grow !== undefined && props.grow !== null) {
      attrs["data-grow"] = String(asNumber(props.grow, 0));
    }
    if (props.shrink !== undefined && props.shrink !== null) {
      attrs["data-shrink"] = String(asNumber(props.shrink, 1));
    }
    const basis = asString(props.basis);
    if (basis === "auto" || basis === "0") {
      attrs["data-basis"] = basis;
    } else if (basis) {
      styleParts.push(`flex-basis:${sanitiseCssLength(basis, basis)}`);
    }
    const alignSelf = asString(props.alignSelf);
    if (alignSelf) attrs["data-align-self"] = alignSelf;
    if (props.order !== undefined && props.order !== null) {
      const order = asNumber(props.order, 0);
      attrs["data-order"] = String(order);
      styleParts.push(`order:${order}`);
    }
    const minWidth = asString(props.minWidth);
    if (minWidth) styleParts.push(`min-width:${sanitiseCssLength(minWidth, minWidth)}`);
    const maxWidth = asString(props.maxWidth);
    if (maxWidth) styleParts.push(`max-width:${sanitiseCssLength(maxWidth, maxWidth)}`);
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    root.append(helpers.renderNode(props.child));
    return root;
  },
};

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
    for (const bp of RESPONSIVE_BREAKPOINTS) {
      const v = direction.values[bp];
      if (v) styleParts.push(`--rui-stack-dir-${bp}:${applyDirectionWithReverse(String(v), reverse)}`);
    }
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
    { name: "children", type: "Node[]", description: "Children laid out left → right" },
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
    { name: "children", type: "Node[]", description: "Children laid out top → bottom" },
    { name: "gap", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Vertical spacing between children (default `md`). May be a responsive map." },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Horizontal alignment of children (default `stretch`). May be a responsive map." },
    { ...FLEX_JUSTIFY_PROP },
    { ...FLEX_WRAP_PROP },
    { ...FLEX_REVERSE_PROP },
    { ...FLEX_PADDING_PROP },
    { ...FLEX_INLINE_PROP },
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
    { name: "children", type: "Node[]", description: "Child components to stack" },
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
    { name: "children", type: "Node[]", description: "Content to center" },
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
    if (minHeight) styleParts.push(`min-height:${sanitiseCssLength(minHeight, minHeight)}`);
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Card: ComponentSpec = {
  name: "Card",
  description: "Vertical card container.",
  props: [
    { name: "children", type: "Node[]", description: "Card contents" },
    { name: "variant", type: "string", optional: true, enum: ["default", "outlined", "elevated"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-card",
      "data-variant": asString(props.variant, "default"),
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const CardHeader: ComponentSpec = {
  name: "CardHeader",
  description:
    "Card header with title, an optional `eyebrow` line rendered ABOVE the " +
    "title (category / kicker / pre-headline), and an optional `subtitle` " +
    "rendered below it.",
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
  ],
  render: (_node, props) => {
    const root = el("header", { class: "rui-card-header" });
    const eyebrow = asString(props.eyebrow);
    if (eyebrow) root.append(el("p", { class: "rui-card-eyebrow" }, [eyebrow]));
    root.append(el("h3", { class: "rui-card-title" }, [asString(props.title)]));
    const subtitle = asString(props.subtitle);
    if (subtitle) root.append(el("p", { class: "rui-card-subtitle" }, [subtitle]));
    return root;
  },
};

export const CardFooter: ComponentSpec = {
  name: "CardFooter",
  description: "Card footer for actions.",
  props: [{ name: "children", type: "Node[]" }],
  render: (_node, props, helpers) => {
    const root = el("footer", { class: "rui-card-footer" });
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
    { name: "children", type: "Node[]", positional: true },
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
      return el("div", {
        class: "rui-separator rui-separator-with-label",
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

const renderStepLi = (title: string, details: string, active = false): HTMLElement => {
  const root = el("li", {
    class: "rui-steps-item",
    "data-active": active ? "true" : "false",
  });
  root.append(el("div", { class: "rui-steps-title" }, [title]));
  if (details) root.append(el("div", { class: "rui-steps-details" }, [details]));
  return root;
};

export const Steps: ComponentSpec = {
  name: "Steps",
  description:
    "Numbered step-by-step guide. Pass items as `{title, details?, active?}` " +
    "objects. Use `active` to mark the current step in a multi-step flow.",
  props: [
    { name: "items", type: "object[]" },
  ],
  render: (_node, props, helpers) => {
    const root = el("ol", { class: "rui-steps" });
    for (const item of asArray<unknown>(props.items)) {
      if (item && typeof item === "object" && (item as { __kind?: string }).__kind === "Component") {
        root.append(helpers.renderNode(item));
        continue;
      }
      if (item && typeof item === "object") {
        const data = item as { title?: unknown; details?: unknown; active?: unknown };
        root.append(renderStepLi(
          asString(data.title),
          asString(data.details),
          asBoolean(data.active),
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
    "chip in the tab trigger, and `icon` for a leading Font Awesome icon.",
  props: [
    { name: "value", type: "string", description: "Stable identifier for the tab" },
    { name: "label", type: "string", description: "Display label" },
    { name: "children", type: "Node[]", description: "Tab content" },
    { name: "badge", type: "string", optional: true, description: "Trailing chip rendered in the tab trigger (count / status)" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name shown before the label" },
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("div", {
      class: "rui-tab-content",
      role: "tabpanel",
      "data-value": asString(props.value),
      "data-active": "false",
    });
    for (const child of asArray(props.children)) wrapper.append(helpers.renderNode(child));
    return wrapper;
  },
};

export const Tabs: ComponentSpec = {
  name: "Tabs",
  description:
    "Tabbed container. Children must be TabItem components. Supports " +
    "`orientation=\"vertical\"` for sidebar-style tabs and built-in " +
    "keyboard navigation (←/→ or ↑/↓, Home, End). Provide `onChange` to " +
    "react when the user switches tabs (called with the new tab's value).",
  props: [
    { name: "items", type: "TabItem[]", description: "Tab definitions" },
    { name: "defaultValue", type: "string", optional: true, description: "Initially active tab value" },
    { name: "orientation", type: "string", optional: true, enum: ["horizontal", "vertical"], description: "Layout direction (default `horizontal`)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-activated tab value when the user switches tabs" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const orientation = asString(props.orientation, "horizontal");
    const root = el("div", { class: "rui-tabs", "data-orientation": orientation });
    const tablist = el("div", {
      class: "rui-tab-list",
      role: "tablist",
      "aria-orientation": orientation,
    });
    const panels = el("div", { class: "rui-tab-panels" });

    // Compute the falsy-default tab value (LLM-supplied `defaultValue` or
    // the first item) so we can seed the persistent active slot when the
    // user has never interacted with this Tabs instance.
    let fallbackValue = asString(props.defaultValue);
    if (!fallbackValue && items.length > 0) {
      const first = items[0] as { args?: unknown[] } | undefined;
      fallbackValue = asString(first?.args?.[0], "tab-0");
    }

    // Persist the active tab across re-renders. Without this slot the active
    // pane would jump back to `defaultValue` every time an unrelated state
    // change re-renders the tree (e.g. typing into an Input one panel over).
    const activeSlot = helpers.useInstanceState<string>("activeTab", fallbackValue);

    // If `defaultValue` was changed by the LLM since last render, honour the
    // new prop. This lets host code drive the active tab via state without
    // breaking the persistence behaviour for user-initiated clicks.
    if (asString(props.defaultValue) && asString(props.defaultValue) !== fallbackValue) {
      activeSlot.set(asString(props.defaultValue));
    }

    // Make sure the persisted value still refers to a tab that exists —
    // the LLM may have removed the previously-active tab mid-stream.
    const validValues = new Set(
      items.map((item, idx) => asString((item as { args?: unknown[] }).args?.[0], `tab-${idx}`)),
    );
    if (!validValues.has(activeSlot.get())) {
      activeSlot.set(fallbackValue);
    }

    // setActive walks the LIVE DOM (via the clicked button's ancestor chain)
    // instead of the local `tablist` / `panels` closure variables. With the
    // morph reconciler in place, an unrelated re-render may produce a fresh
    // Tabs subtree whose onclick handlers get copied onto the previously
    // mounted nodes — the closures' local refs point at the discarded fresh
    // subtree, but `event.currentTarget` is always the in-DOM button.
    const setActive = (next: string, originBtn: Element): void => {
      const previous = activeSlot.get();
      activeSlot.set(next);
      const liveRoot = originBtn.closest(".rui-tabs");
      if (liveRoot) {
        liveRoot.querySelectorAll<HTMLButtonElement>(".rui-tab-trigger").forEach((b) => {
          const isActive = b.getAttribute("data-value") === next;
          b.setAttribute("aria-selected", isActive ? "true" : "false");
          b.tabIndex = isActive ? 0 : -1;
        });
        liveRoot.querySelectorAll<HTMLElement>(".rui-tab-content").forEach((p) => {
          p.setAttribute("data-active", p.getAttribute("data-value") === next ? "true" : "false");
        });
      }
      if (previous !== next) helpers.invoke(props.onChange, next);
    };

    items.forEach((item, idx) => {
      const tabNode = item as { name?: string; args?: unknown[] };
      const value = asString(tabNode.args?.[0], `tab-${idx}`);
      const label = asString(tabNode.args?.[1], `Tab ${idx + 1}`);
      const badge = asString(tabNode.args?.[3]);
      const icon = asString(tabNode.args?.[4]);
      const isActive = value === activeSlot.get();
      const button = el(
        "button",
        {
          class: "rui-tab-trigger",
          role: "tab",
          type: "button",
          "data-value": value,
          "aria-selected": isActive ? "true" : "false",
          tabindex: isActive ? "0" : "-1",
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
        const triggers = Array.from(liveList.querySelectorAll<HTMLButtonElement>(".rui-tab-trigger"));
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

      const panel = helpers.renderNode(item) as HTMLElement;
      panel.setAttribute("data-value", value);
      panel.setAttribute("data-active", isActive ? "true" : "false");
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

export const AccordionItem: ComponentSpec = {
  name: "AccordionItem",
  description: "Single accordion section.",
  props: [
    { name: "title", type: "string" },
    { name: "children", type: "Node[]" },
    { name: "open", type: "boolean", optional: true },
    { name: "showArrow", type: "boolean", optional: true, description: "Show a chevron icon on the right (default false). Inherits from parent Accordion when unset." },
  ],
  render: (_node, props, helpers) => {
    const explicit = props.showArrow !== undefined && props.showArrow !== null;
    const details = el("details", {
      class: "rui-accordion-item",
      "data-show-arrow": explicit ? (asBoolean(props.showArrow) ? "true" : "false") : null,
    });
    if (asBoolean(props.open)) details.setAttribute("open", "");
    const summary = el("summary", { class: "rui-accordion-trigger" });
    summary.append(el("span", { class: "rui-accordion-title" }, [asString(props.title)]));
    summary.append(el("span", { class: "rui-accordion-chevron", "aria-hidden": "true" }));
    details.append(summary);
    const body = el("div", { class: "rui-accordion-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    details.append(body);
    return details;
  },
};

export const Accordion: ComponentSpec = {
  name: "Accordion",
  description:
    "Accordion container. Children must be AccordionItem components. " +
    "Set `showArrow: true` to add a chevron indicator to every item; " +
    "individual `AccordionItem`s can override via their own `showArrow` prop.",
  props: [
    { name: "items", type: "AccordionItem[]" },
    { name: "showArrow", type: "boolean", optional: true, description: "Show chevron icon on every item (default false)." },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-accordion",
      "data-show-arrow": asBoolean(props.showArrow) ? "true" : "false",
    });
    for (const child of asArray(props.items)) root.append(helpers.renderNode(child));
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

function gridMinChildWidth(props: Record<string, unknown>): string {
  const width = asString(props.minChildWidth) || asString(props.minItemWidth);
  return sanitiseCssLength(width || "220px", "220px");
}

export const GridItem: ComponentSpec = {
  name: "GridItem",
  description:
    "Wraps a child in a 12-column grid cell with `span`, `offset`, and " +
    "responsive `spanAt` maps. Parent `Grid` auto-enables 12-column mode " +
    "when any child is a `GridItem`. Fraction spans like `\"1/3\"` resolve " +
    "against the 12-column track.",
  props: [
    { name: "child", type: "Node", description: "Child node to place in the grid" },
    { name: "span", type: "number | string", optional: true, description: "Columns to span (1–12) or fraction like \"1/2\", \"1/3\"" },
    { name: "offset", type: "number", optional: true, description: "Empty columns before this item (0–11)" },
    { name: "spanAt", type: "object", optional: true, description: "Responsive span map `{sm: 12, md: 6, lg: 4}`" },
  ],
  render: (_node, props, helpers) => {
    const baseSpan = resolveSpan(props.span ?? 12);
    const spanAt = readResponsiveProp<number | string>(props.spanAt);
    const offset = props.offset === undefined || props.offset === null
      ? 0
      : Math.max(0, Math.min(GRID_COLUMNS - 1, Math.round(asNumber(props.offset, 0))));
    const attrs: Record<string, string | null> = {
      class: "rui-grid-item",
      "data-span": String(baseSpan),
    };
    const styleParts: string[] = [`--rui-grid-item-span:${baseSpan}`];
    if (offset > 0) {
      attrs["data-offset"] = String(offset);
      styleParts.push(`--rui-grid-item-offset:${offset}`);
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
    attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    root.append(helpers.renderNode(props.child));
    return root;
  },
};

export const Box: ComponentSpec = {
  name: "Box",
  description:
    "Spacing and surface wrapper for padding, margin, borders, semantic " +
    "backgrounds, and max-width constraints. Use when a `Card` is too heavy " +
    "but the content needs a subtle surface or inset.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "padding", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Inner padding. May be a responsive map." },
    { name: "margin", type: "string | object", optional: true, enum: SPACING_TOKENS, description: "Outer margin. May be a responsive map." },
    { name: "border", type: "string", optional: true, enum: ["none", "subtle", "default"], description: "Border preset (default none)" },
    { name: "background", type: "string", optional: true, enum: ["none", "surface", "muted", "primary", "success", "warning", "danger", "info"], description: "Semantic background token" },
    { name: "maxWidth", type: "string", optional: true, description: "CSS max-width" },
  ],
  render: (_node, props, helpers) => {
    const padding = readResponsiveProp<string>(props.padding);
    const margin = readResponsiveProp<string>(props.margin);
    const attrs: Record<string, string | null> = {
      class: "rui-box",
      "data-border": asString(props.border, "none"),
      "data-background": asString(props.background, "none"),
    };
    const styleParts: string[] = [];
    const maxWidth = asString(props.maxWidth);
    if (maxWidth) styleParts.push(`max-width:${sanitiseCssLength(maxWidth, maxWidth)}`);
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
    "Groups several siblings into one value WITHOUT adding a layout box — " +
    "the wrapper is `display: contents`, so the children participate in the " +
    "parent's flex/grid layout directly. Use to return multiple nodes from a " +
    "component, or to conditionally group siblings, without a stray `div` " +
    "that would break a Grid/Stack's spacing.",
  props: [
    { name: "children", type: "Node[]", description: "Sibling nodes to group" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-fragment", style: "display:contents;" });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
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
    { name: "children", type: "Node[]" },
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
        const minChild = asString(props.minChildWidth) || asString(props.minItemWidth);
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
        const cols = clampGridColumns(asNumber(v, 0));
        if (cols === GRID_COLUMNS) {
          twelveColMode = true;
        } else if (cols > 0) {
          explicitNonTwelve = true;
        }
        styleParts.push(`--rui-grid-cols-${bp}:${cols}`);
      }
    }

    if (hasGridItems && !explicitNonTwelve) twelveColMode = true;
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
    "for video embeds, 1:1 for thumbnails). The child fills the box.",
  props: [
    { name: "ratio", type: "string", description: "`width:height` (e.g. `16:9`, `4:3`) or a decimal like `1.78`" },
    { name: "children", type: "Node[]" },
  ],
  render: (_node, props, helpers) => {
    const ratio = parseRatio(asString(props.ratio, "16:9"));
    const root = el("div", {
      class: "rui-aspect-ratio",
      style: `aspect-ratio:${ratio};`,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

function parseRatio(input: string): string {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}

export const ScrollArea: ComponentSpec = {
  name: "ScrollArea",
  description:
    "Bounded scroll container. Use to clip long lists / logs / chat panels " +
    "to a fixed max height with a clean scrollbar.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "maxHeight", type: "string", optional: true, aliases: ["height"], description: "CSS height (default 320px)" },
    { name: "direction", type: "string", optional: true, enum: ["vertical", "horizontal", "both"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-scroll-area",
      "data-direction": asString(props.direction, "vertical"),
      style: `max-height:${sanitiseCssLength(props.maxHeight, "320px")};`,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

const MODAL_SIZES = ["sm", "md", "lg", "xl", "full"] as const;

/** Tab-reachable elements inside a dialog, used by the Modal focus trap. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let modalIdSeq = 0;

/** The active element within the modal's root (document or shadow root). */
function activeWithin(el: Element): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return (root as Document).activeElement ?? null;
}

export const Modal: ComponentSpec = {
  name: "Modal",
  description:
    "Dialog overlay shown when `open` is true. Pass a `$variable` as " +
    "`open` to control it. The header always renders a × close button " +
    "(disable via `closable: false`); the optional `footer` slot is the " +
    "canonical place for action buttons. `closeOnBackdrop=true` opts in " +
    "to backdrop-click dismissal. `onClose` fires every time the modal " +
    "closes (× button, backdrop, programmatic state write). Accessible by " +
    "default: the dialog is labelled by its title, focus moves into it on " +
    "open and is restored on close, Tab is trapped inside, and Escape " +
    "closes it (unless `closable: false`).",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state — usually a $variable" },
    { name: "children", type: "Node[]" },
    { name: "size", type: "string", optional: true, enum: MODAL_SIZES, description: "Width preset (default `md`)" },
    { name: "footer", type: "Node[]", optional: true, description: "Footer slot — typically a row of action Buttons" },
    { name: "closable", type: "boolean", optional: true, description: "Render the header × button (default true)" },
    { name: "closeOnBackdrop", type: "boolean", optional: true, description: "Close when the overlay is clicked (default false)" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked when the modal is closed (× button or backdrop)" },
  ],
  render: (node, props, helpers) => {
    const size = asString(props.size, "md");
    const closable = props.closable === undefined ? true : asBoolean(props.closable);
    const overlay = el("div", {
      class: "rui-modal-overlay",
      "data-open": asBoolean(props.open) ? "true" : "false",
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
    const closeModal = () => {
      if (stateName) helpers.setState(stateName, false);
      helpers.invoke(props.onClose);
    };
    if (closable) {
      const closeBtn = el("button", {
        type: "button",
        class: "rui-modal-close",
        "aria-label": "Close dialog",
      }, ["×"]);
      closeBtn.onclick = (event) => {
        event.stopPropagation();
        closeModal();
      };
      header.append(closeBtn);
    }
    dialog.append(header);
    const body = el("div", { class: "rui-modal-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    dialog.append(body);
    const footer = asArray<unknown>(props.footer);
    if (footer.length > 0) {
      const footRow = el("footer", { class: "rui-modal-footer" });
      for (const item of footer) footRow.append(helpers.renderNode(item));
      dialog.append(footRow);
    }
    overlay.append(dialog);
    if (asBoolean(props.closeOnBackdrop)) {
      overlay.onclick = (event) => {
        if (event.target === overlay) closeModal();
      };
    }

    // ── Accessibility: Escape to close + Tab focus trap ──────────────
    const isOpen = asBoolean(props.open);
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && closable) {
        event.stopPropagation();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = activeWithin(dialog);
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    });

    // Move focus into the dialog when it opens; restore it when it closes.
    // `useInstanceState` survives re-renders so we only react to the
    // open→closed / closed→open transition, not every commit.
    const focusSlot = helpers.useInstanceState<{ open: boolean; prev: Element | null }>(
      "rui-modal-focus",
      { open: false, prev: null },
    );
    const prevState = focusSlot.get();
    if (isOpen && !prevState.open) {
      const previouslyFocused = activeWithin(dialog);
      focusSlot.set({ open: true, prev: previouslyFocused });
      const focusFirst = (): void => {
        const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
        (items[0] ?? dialog).focus();
      };
      if (typeof queueMicrotask === "function") queueMicrotask(focusFirst);
      else void Promise.resolve().then(focusFirst);
    } else if (!isOpen && prevState.open) {
      const toRestore = prevState.prev as HTMLElement | null;
      focusSlot.set({ open: false, prev: null });
      if (toRestore && typeof toRestore.focus === "function") {
        const restore = (): void => toRestore.focus();
        if (typeof queueMicrotask === "function") queueMicrotask(restore);
        else void Promise.resolve().then(restore);
      }
    }

    return overlay;
  },
};
