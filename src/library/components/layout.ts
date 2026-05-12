/**
 * Layout components: Stack, Grid, Card, CardHeader, CardBody, CardFooter,
 * Tabs, TabItem, Accordion, AccordionItem, Section, Divider, Modal,
 * AspectRatio, ScrollArea.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString, asBoolean, asNumber } from "../utils.js";

export const Stack: ComponentSpec = {
  name: "Stack",
  description: "Flex container that arranges children in a row or column.",
  props: [
    { name: "children", type: "Node[]", description: "Child components to stack" },
    { name: "direction", type: "string", optional: true, enum: ["column", "row"], description: "Layout direction (default column)" },
    { name: "gap", type: "string", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Spacing between children" },
    { name: "align", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Cross-axis alignment" },
    { name: "justify", type: "string", optional: true, enum: ["start", "center", "end", "between", "around"], description: "Main-axis alignment" },
    { name: "wrap", type: "boolean", optional: true, description: "Allow wrapping" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-stack",
      "data-direction": asString(props.direction, "column"),
      "data-gap": asString(props.gap, "m"),
      "data-align": asString(props.align, "stretch"),
      "data-justify": asString(props.justify, "start"),
      "data-wrap": asBoolean(props.wrap) ? "true" : null,
    });
    for (const child of asArray(props.children)) {
      root.append(helpers.renderNode(child));
    }
    return root;
  },
};

export const Section: ComponentSpec = {
  name: "Section",
  description: "Visual section grouping with optional title.",
  props: [
    { name: "children", type: "Node[]", description: "Child components" },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("section", { class: "rui-section" });
    const title = asString(props.title);
    if (title) wrapper.append(el("h3", { class: "rui-section-title" }, [title]));
    for (const child of asArray(props.children)) wrapper.append(helpers.renderNode(child));
    return wrapper;
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

export const CardBody: ComponentSpec = {
  name: "CardBody",
  description: "Card body region.",
  props: [{ name: "children", type: "Node[]" }],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-card-body" });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
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

export const Divider: ComponentSpec = {
  name: "Divider",
  description: "Horizontal divider.",
  props: [{ name: "label", type: "string", optional: true }],
  render: (_node, props) => {
    const label = asString(props.label);
    if (!label) return el("hr", { class: "rui-divider" });
    return el("div", { class: "rui-divider rui-divider-with-label" }, [
      el("span", { class: "rui-divider-line" }),
      el("span", { class: "rui-divider-label" }, [label]),
      el("span", { class: "rui-divider-line" }),
    ]);
  },
};

export const Separator: ComponentSpec = {
  name: "Separator",
  description: "Visual divider between content sections. Supports horizontal or vertical orientation.",
  props: [
    { name: "orientation", type: "string", optional: true, enum: ["horizontal", "vertical"] },
    { name: "decorative", type: "boolean", optional: true, description: "Hides the separator from assistive tech when true." },
  ],
  render: (_node, props) => {
    const orientation = asString(props.orientation, "horizontal");
    const decorative = asBoolean(props.decorative, true);
    return el("div", {
      class: "rui-separator",
      "data-orientation": orientation,
      role: decorative ? "presentation" : "separator",
      "aria-orientation": decorative ? null : orientation,
    });
  },
};

export const StepsItem: ComponentSpec = {
  name: "StepsItem",
  description: "Single step inside a Steps guide.",
  props: [
    { name: "title", type: "string" },
    { name: "details", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("li", { class: "rui-steps-item" });
    root.append(el("div", { class: "rui-steps-title" }, [asString(props.title)]));
    const details = asString(props.details);
    if (details) root.append(el("div", { class: "rui-steps-details" }, [details]));
    return root;
  },
};

export const Steps: ComponentSpec = {
  name: "Steps",
  description: "Numbered step-by-step guide. Children must be StepsItem components.",
  props: [{ name: "items", type: "StepsItem[]" }],
  render: (_node, props, helpers) => {
    const root = el("ol", { class: "rui-steps" });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

export const TabItem: ComponentSpec = {
  name: "TabItem",
  description: "Single tab definition (used inside Tabs).",
  props: [
    { name: "value", type: "string", description: "Stable identifier for the tab" },
    { name: "label", type: "string", description: "Display label" },
    { name: "children", type: "Node[]", description: "Tab content" },
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
  description: "Tabbed container. Children must be TabItem components.",
  props: [
    { name: "items", type: "TabItem[]", description: "Tab definitions" },
    { name: "defaultValue", type: "string", optional: true, description: "Initially active tab value" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const root = el("div", { class: "rui-tabs" });
    const tablist = el("div", { class: "rui-tab-list", role: "tablist" });
    const panels = el("div", { class: "rui-tab-panels" });

    let activeValue = asString(props.defaultValue);
    if (!activeValue && items.length > 0) {
      const first = items[0] as { args?: unknown[] } | undefined;
      activeValue = asString(first?.args?.[0], "tab-0");
    }

    const setActive = (next: string) => {
      activeValue = next;
      tablist.querySelectorAll<HTMLButtonElement>(".rui-tab-trigger").forEach((b) => {
        const isActive = b.getAttribute("data-value") === activeValue;
        b.setAttribute("aria-selected", isActive ? "true" : "false");
        b.tabIndex = isActive ? 0 : -1;
      });
      panels.querySelectorAll<HTMLElement>(".rui-tab-content").forEach((p) => {
        p.setAttribute("data-active", p.getAttribute("data-value") === activeValue ? "true" : "false");
      });
    };

    items.forEach((item, idx) => {
      const tabNode = item as { name?: string; args?: unknown[] };
      const value = asString(tabNode.args?.[0], `tab-${idx}`);
      const label = asString(tabNode.args?.[1], `Tab ${idx + 1}`);
      const isActive = value === activeValue;
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
        [label],
      );
      button.addEventListener("click", () => setActive(value));
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

export const AccordionItem: ComponentSpec = {
  name: "AccordionItem",
  description: "Single accordion section.",
  props: [
    { name: "title", type: "string" },
    { name: "children", type: "Node[]" },
    { name: "open", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const details = el("details", { class: "rui-accordion-item" });
    if (asBoolean(props.open)) details.setAttribute("open", "");
    const summary = el("summary", { class: "rui-accordion-trigger" }, [asString(props.title)]);
    details.append(summary);
    const body = el("div", { class: "rui-accordion-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    details.append(body);
    return details;
  },
};

export const Accordion: ComponentSpec = {
  name: "Accordion",
  description: "Accordion container. Children must be AccordionItem components.",
  props: [{ name: "items", type: "AccordionItem[]" }],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-accordion" });
    for (const child of asArray(props.items)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Grid: ComponentSpec = {
  name: "Grid",
  description:
    "Responsive CSS grid. Use for KPI strips, feature blocks, card grids, " +
    "and any layout where children should stay on the same row but reflow on " +
    "narrow viewports. Prefer `Grid` over `Stack` with `direction=\"row\"` " +
    "whenever the children should size uniformly.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "columns", type: "number", optional: true, description: "Target column count 1–6 (default auto-fit)" },
    { name: "gap", type: "string", optional: true, enum: ["xs", "s", "m", "l", "xl"] },
    { name: "minItemWidth", type: "string", optional: true, description: "CSS width used by the auto-fit fallback (default 220px)" },
  ],
  render: (_node, props, helpers) => {
    const requested = asNumber(props.columns, 0);
    const columns = requested > 0 ? Math.max(1, Math.min(6, requested)) : 0;
    const root = el("div", {
      class: "rui-grid",
      "data-columns": columns > 0 ? String(columns) : null,
      "data-gap": asString(props.gap, "m"),
      style: columns === 0 ? `--rui-grid-min-item:${asString(props.minItemWidth, "220px")}` : null,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
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
    { name: "maxHeight", type: "string", optional: true, description: "CSS height (default 320px)" },
    { name: "direction", type: "string", optional: true, enum: ["vertical", "horizontal", "both"] },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-scroll-area",
      "data-direction": asString(props.direction, "vertical"),
      style: `max-height:${asString(props.maxHeight, "320px")};`,
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  },
};

export const Modal: ComponentSpec = {
  name: "Modal",
  description: "Dialog overlay shown when `open` is true.",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state — usually a $variable" },
    { name: "children", type: "Node[]" },
  ],
  render: (_node, props, helpers) => {
    const overlay = el("div", { class: "rui-modal-overlay", "data-open": asBoolean(props.open) ? "true" : "false" });
    const dialog = el("div", { class: "rui-modal", role: "dialog", "aria-modal": "true" });
    dialog.append(el("h3", { class: "rui-modal-title" }, [asString(props.title)]));
    const body = el("div", { class: "rui-modal-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    dialog.append(body);
    overlay.append(dialog);
    return overlay;
  },
};
