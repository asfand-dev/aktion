/**
 * Layout components: Stack, Grid, Card, CardHeader, CardBody, CardFooter,
 * Tabs, TabItem, Accordion, AccordionItem, Section, Divider, Modal,
 * AspectRatio, ScrollArea.
 */

import type { ComponentSpec } from "../types.js";
import { el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseCssLength } from "../utils.js";

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

export const StepsItem: ComponentSpec = {
  name: "StepsItem",
  description:
    "Single step inside a Steps guide. Optional — `Steps([{title, details}])` " +
    "is the canonical (object-based) shape; this component is kept for " +
    "back-compat with prompts that emit `Steps([StepsItem(...), ...])`.",
  props: [
    { name: "title", type: "string" },
    { name: "details", type: "string", optional: true },
    { name: "active", type: "boolean", optional: true, description: "Highlights this step as the current one" },
  ],
  render: (_node, props) =>
    renderStepLi(asString(props.title), asString(props.details), asBoolean(props.active)),
};

export const Steps: ComponentSpec = {
  name: "Steps",
  description:
    "Numbered step-by-step guide. Items can be `{title, details?, active?}` " +
    "objects (preferred) or `StepsItem(...)` nodes. Use `active` to mark " +
    "the current step in a multi-step flow.",
  props: [
    { name: "items", type: "StepsItem[] | object[]" },
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
    "keyboard navigation (←/→ or ↑/↓, Home, End).",
  props: [
    { name: "items", type: "TabItem[]", description: "Tab definitions" },
    { name: "defaultValue", type: "string", optional: true, description: "Initially active tab value" },
    { name: "orientation", type: "string", optional: true, enum: ["horizontal", "vertical"], description: "Layout direction (default `horizontal`)" },
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
      activeSlot.set(next);
      const liveRoot = originBtn.closest(".rui-tabs");
      if (!liveRoot) return;
      liveRoot.querySelectorAll<HTMLButtonElement>(".rui-tab-trigger").forEach((b) => {
        const isActive = b.getAttribute("data-value") === next;
        b.setAttribute("aria-selected", isActive ? "true" : "false");
        b.tabIndex = isActive ? 0 : -1;
      });
      liveRoot.querySelectorAll<HTMLElement>(".rui-tab-content").forEach((p) => {
        p.setAttribute("data-active", p.getAttribute("data-value") === next ? "true" : "false");
      });
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
      style: columns === 0 ? `--rui-grid-min-item:${sanitiseCssLength(props.minItemWidth, "220px")}` : null,
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
    "(disable via `closable=false`); the optional `footer` slot is the " +
    "canonical place for action buttons. `closeOnBackdrop=true` opts in " +
    "to backdrop-click dismissal.",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state — usually a $variable" },
    { name: "children", type: "Node[]" },
    { name: "size", type: "string", optional: true, enum: MODAL_SIZES, description: "Width preset (default `md`)" },
    { name: "footer", type: "Node[]", optional: true, description: "Footer slot — typically a row of action Buttons" },
    { name: "closable", type: "boolean", optional: true, description: "Render the header × button (default true)" },
    { name: "closeOnBackdrop", type: "boolean", optional: true, description: "Close when the overlay is clicked (default false)" },
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
      if (!stateName) return;
      helpers.runAction({
        kind: "Action",
        steps: [{ kind: "Set", name: stateName, value: false }],
      });
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
    if (asBoolean(props.closeOnBackdrop) && stateName) {
      overlay.onclick = (event) => {
        if (event.target === overlay) closeModal();
      };
    }
    return overlay;
  },
};
