/**
 * Layout components: Stack, StackItem, Grid, GridItem, Box, Card, CardHeader,
 * CardFooter, Tabs, TabItem, Accordion, AccordionItem,
 * Modal, AspectRatio, ScrollArea.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseCssLength,
  readResponsiveProp, RESPONSIVE_BREAKPOINTS, type Breakpoint, type ResponsiveProp,
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
    if (v) styleParts.push(`${cssPrefix}-${bp}:var(--rui-spacing-${v}, ${v})`);
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
    "Wraps a single child in a flex item with explicit grow/shrink/basis, " +
    "alignment, and order. Use inside `Stack` when the default row flex " +
    "growth would stretch toolbars, chips, or asymmetric layouts.",
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

export const Stack: ComponentSpec = {
  name: "Stack",
  description:
    "Flex container that arranges children in a row or column. " +
    "`direction`, `gap`, `align`, `justify`, and `padding` accept either a " +
    "single value OR a responsive map like `{sm: \"column\", md: \"row\"}`. " +
    "Row stacks grow children uniformly by default (`uniform=true`); set " +
    "`uniform=false` or wrap children in `StackItem` for toolbars and " +
    "asymmetric rows. Use `reverse` for chat-style column-reverse timelines.",
  props: [
    { name: "children", type: "Node[]", description: "Child components to stack" },
    { name: "direction", type: "string | object", optional: true, enum: ["column", "row"], description: "Layout direction (default column). May be a responsive map." },
    { name: "gap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Spacing between children. May be a responsive map." },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Cross-axis alignment. May be a responsive map." },
    { name: "justify", type: "string | object", optional: true, enum: ["start", "center", "end", "between", "around", "evenly"], description: "Main-axis alignment. May be a responsive map." },
    { name: "alignContent", type: "string", optional: true, enum: ["start", "center", "end", "between", "around", "stretch"], description: "Multi-line wrap alignment" },
    { name: "wrap", type: "boolean", optional: true, description: "Allow wrapping" },
    { name: "reverse", type: "boolean", optional: true, description: "Reverse main-axis order (column-reverse / row-reverse)" },
    { name: "uniform", type: "boolean", optional: true, description: "Row children share space equally (default true for row stacks)" },
    { name: "inline", type: "boolean", optional: true, description: "Use inline-flex instead of flex" },
    { name: "padding", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Inner padding token. May be a responsive map." },
  ],
  render: (_node, props, helpers) => {
    const direction = readResponsiveProp<string>(props.direction);
    const gap = readResponsiveProp<string>(props.gap);
    const padding = readResponsiveProp<string>(props.padding);
    const reverse = asBoolean(props.reverse);
    const baseDir = stackBaseDirection(props);
    const uniformDefault = baseDir === "row";
    const uniform = props.uniform === undefined
      ? uniformDefault
      : asBoolean(props.uniform, uniformDefault);
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
      attrs["data-gap"] = gap.value ? String(gap.value) : "m";
    } else {
      attrs["data-gap"] = "responsive";
      attrs["data-responsive-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, gap, "--rui-stack-gap");
    }
    applyResponsiveEnumProp(props.align, styleParts, attrs, {
      attrName: "data-align",
      responsiveFlag: "data-responsive-align",
      cssVarPrefix: "--rui-stack-align",
      defaultToken: "stretch",
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
      const pad = padding.value ? String(padding.value) : null;
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
  description: "Card header with title and optional subtitle.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("header", { class: "rui-card-header" });
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
    { name: "padding", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Inner padding. May be a responsive map." },
    { name: "margin", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Outer margin. May be a responsive map." },
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
      const pad = padding.value ? String(padding.value) : null;
      if (pad) attrs["data-padding"] = pad;
    } else {
      attrs["data-padding"] = "responsive";
      attrs["data-responsive-padding"] = "true";
      emitResponsiveSpacingVars(styleParts, padding, "--rui-box-padding");
    }
    if (margin.kind === "single") {
      const mar = margin.value ? String(margin.value) : null;
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

export const Grid: ComponentSpec = {
  name: "Grid",
  description:
    "Responsive CSS grid. Use for KPI strips, feature blocks, card grids, " +
    "and asymmetric layouts with `GridItem` spans. Set `columns: 12` (or " +
    "include `GridItem` children) for a 12-column track system with " +
    "fractional spans like `\"1/3\"`. `columns` and `gap` accept responsive " +
    "maps like `{sm: 1, md: 2, lg: 4}`.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "columns", type: "number | object", optional: true, description: "Target column count 1–12 (default auto-fit). `12` enables 12-column mode. May be a responsive map." },
    { name: "gap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Gap size (both axes). May be a responsive map." },
    { name: "rowGap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Row gap override. May be a responsive map." },
    { name: "columnGap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Column gap override. May be a responsive map." },
    { name: "minItemWidth", type: "string", optional: true, description: "CSS min width for auto-fit fallback (alias: minChildWidth)" },
    { name: "minChildWidth", type: "string", optional: true, description: "CSS min child width; also applies when `columns` is set" },
    { name: "alignItems", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Align items inside grid cells" },
    { name: "justifyItems", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Justify items inside grid cells" },
    { name: "dense", type: "boolean", optional: true, description: "Use dense auto-flow packing" },
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
      attrs["data-gap"] = gap.value ? String(gap.value) : "m";
    } else {
      attrs["data-gap"] = "responsive";
      attrs["data-responsive-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, gap, "--rui-grid-gap");
    }

    if (rowGap.kind === "single" && rowGap.value) {
      attrs["data-row-gap"] = String(rowGap.value);
    } else if (rowGap.kind === "responsive") {
      attrs["data-row-gap"] = "responsive";
      attrs["data-responsive-row-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, rowGap, "--rui-grid-row-gap");
    }

    if (columnGap.kind === "single" && columnGap.value) {
      attrs["data-column-gap"] = String(columnGap.value);
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

export const Modal: ComponentSpec = {
  name: "Modal",
  description:
    "Dialog overlay shown when `open` is true. Pass a `$variable` as " +
    "`open` to control it. The header always renders a × close button " +
    "(disable via `closable: false`); the optional `footer` slot is the " +
    "canonical place for action buttons. `closeOnBackdrop=true` opts in " +
    "to backdrop-click dismissal. `onClose` fires every time the modal " +
    "closes (× button, backdrop, programmatic state write).",
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
    const dialog = el("div", {
      class: "rui-modal",
      role: "dialog",
      "aria-modal": "true",
      "data-size": size,
    });
    const header = el("header", { class: "rui-modal-header" });
    header.append(el("h3", { class: "rui-modal-title" }, [asString(props.title)]));
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
    return overlay;
  },
};
