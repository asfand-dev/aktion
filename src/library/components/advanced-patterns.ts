/**
 * Advanced pattern composites that round out the catalogue:
 *
 *   - InboxPanel — Grouped notification card list (read / unread).
 *   - OnboardingChecklist — Step-by-step product checklist.
 *   - LoadingState / ErrorState / SuccessState — Full-card status panels.
 *   - Tour / Spotlight — Light-weight product-tour primitives.
 *   - Sticky / Affix — Pin a child to the top while scrolling.
 *   - ResizablePanels — Two-pane drag-to-resize split.
 *   - MasonryGrid — Pinterest-style column grid.
 *   - TopBar — Convenience composite.
 *   - Drawer — Side-panel overlay (detail views, filters, previews).
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  sanitiseCssLength, SPACING_TOKENS, normalizeSpacingToken,
} from "../utils.js";
import { Notification } from "./patterns.js";

/* ----------------------------------------------------------------------- *
 * InboxPanel
 * ----------------------------------------------------------------------- */

interface InboxEntry {
  title: string;
  message: string;
  time: string;
  icon: string;
  tone: string;
  unread: boolean;
  avatarSrc: string;
  onClick: unknown;
}

function readInboxEntries(raw: unknown): InboxEntry[] {
  return asArray<unknown>(raw)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const r = entry as Record<string, unknown>;
      return {
        title: asString(r.title),
        message: asString(r.message),
        time: asString(r.time),
        icon: asString(r.icon),
        tone: asString(r.tone, "default"),
        unread: asBoolean(r.unread),
        avatarSrc: asString(r.avatarSrc),
        onClick: r.onClick ?? r.action,
      };
    })
    .filter((e): e is InboxEntry => e !== null);
}

export const InboxPanel: ComponentSpec = {
  name: "InboxPanel",
  description:
    "Grouped notification list — entries are grouped into Unread/Earlier " +
    "sections, with a count chip on each group header. Pass `items` as " +
    "`{title, message, time, icon?, tone?, unread?, avatarSrc?, onClick?}` " +
    "objects (`action` is also accepted as an alias). Pair with a `SectionHeader` for the panel title (the " +
    "component does not render its own title to avoid duplication). Use " +
    "for top-bar notification trays, activity drawers, and alert center " +
    "pages.",
  props: [
    { name: "items", type: "object[]" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when there are no notifications" },
    { name: "onMarkAllRead", type: "callable", optional: true, description: "Callable fired by the \"Mark all as read\" button" },
  ],
  render: (_node, props, helpers) => {
    const entries = readInboxEntries(props.items);
    const unread = entries.filter((e) => e.unread);
    const read = entries.filter((e) => !e.unread);
    const root = el("div", { class: "rui-inbox-panel" });
    if (typeof props.onMarkAllRead === "function" && unread.length > 0) {
      const toolbar = el("div", { class: "rui-inbox-panel-toolbar" });
      const btn = el("button", { type: "button", class: "rui-inbox-panel-mark-all" }, ["Mark all as read"]);
      btn.onclick = () => helpers.invoke(props.onMarkAllRead);
      toolbar.append(btn);
      root.append(toolbar);
    }
    if (entries.length === 0) {
      root.append(el("div", { class: "rui-inbox-panel-empty" }, [asString(props.emptyLabel, "You're all caught up.")]));
      return root;
    }
    const renderGroup = (label: string, items: InboxEntry[]) => {
      if (items.length === 0) return;
      const group = el("section", { class: "rui-inbox-panel-group" });
      const groupHead = el("header", { class: "rui-inbox-panel-group-head" });
      groupHead.append(el("span", { class: "rui-inbox-panel-group-label" }, [label]));
      groupHead.append(el("span", { class: "rui-inbox-panel-group-count" }, [String(items.length)]));
      group.append(groupHead);
      for (const entry of items) {
        const card = Notification.render(
          { __kind: "Component", name: "Notification", args: [], argMeta: [] },
          {
            title: entry.title,
            message: entry.message,
            time: entry.time,
            icon: entry.icon,
            tone: entry.tone,
            avatarSrc: entry.avatarSrc,
            unread: entry.unread,
          },
          helpers,
        ) as HTMLElement;
        if (typeof entry.onClick === "function") {
          card.setAttribute("data-clickable", "true");
          card.onclick = () => helpers.invoke(entry.onClick);
        }
        group.append(card);
      }
      root.append(group);
    };
    renderGroup(`Unread (${unread.length})`, unread);
    renderGroup("Earlier", read);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * OnboardingChecklist
 * ----------------------------------------------------------------------- */

interface ChecklistItem {
  title: string;
  description: string;
  done: boolean;
  onClick: unknown;
  cta: string;
}

function readChecklistItems(raw: unknown): ChecklistItem[] {
  return asArray<unknown>(raw)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const r = entry as Record<string, unknown>;
      return {
        title: asString(r.title),
        description: asString(r.description),
        done: asBoolean(r.done),
        onClick: r.onClick ?? r.action,
        cta: asString(r.cta, "Start"),
      };
    })
    .filter((c): c is ChecklistItem => c !== null);
}

export const OnboardingChecklist: ComponentSpec = {
  name: "OnboardingChecklist",
  description:
    "Step-by-step product checklist with completion progress at the top. " +
    "Pass `items` as `{title, description?, done?, onClick?, cta?}` " +
    "objects (`action` is also accepted as an alias). The progress percentage is computed automatically from " +
    "`done`. Use on first-run dashboards, empty workspaces, and " +
    "\"complete your profile\" surfaces.",
  props: [
    { name: "items", type: "object[]" },
    { name: "title", type: "string", optional: true, description: "Heading (default \"Getting started\")" },
    { name: "subtitle", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const items = readChecklistItems(props.items);
    const completed = items.filter((i) => i.done).length;
    const total = Math.max(1, items.length);
    const pct = Math.round((completed / total) * 100);
    const root = el("div", { class: "rui-onboarding-checklist" });
    const head = el("header", { class: "rui-onboarding-checklist-header" });
    head.append(el("h3", { class: "rui-onboarding-checklist-title" }, [
      asString(props.title, "Getting started"),
    ]));
    const subtitle = asString(props.subtitle);
    if (subtitle) head.append(el("p", { class: "rui-onboarding-checklist-subtitle" }, [subtitle]));
    head.append(el("div", { class: "rui-onboarding-checklist-progress" }, [
      el("div", { class: "rui-onboarding-checklist-bar" }, [
        el("div", {
          class: "rui-onboarding-checklist-fill",
          style: `width:${pct}%`,
        }),
      ]),
      el("span", { class: "rui-onboarding-checklist-meta" }, [`${completed}/${items.length} complete`]),
    ]));
    root.append(head);
    const list = el("ol", { class: "rui-onboarding-checklist-list" });
    for (const item of items) {
      const li = el("li", {
        class: "rui-onboarding-checklist-item",
        "data-done": item.done ? "true" : "false",
      });
      const marker = el("span", { class: "rui-onboarding-checklist-marker" });
      const iconNode = renderIcon(item.done ? "circle-check" : "circle", { className: "rui-onboarding-checklist-marker-icon" });
      if (iconNode) marker.append(iconNode);
      li.append(marker);
      const body = el("div", { class: "rui-onboarding-checklist-body" });
      body.append(el("div", { class: "rui-onboarding-checklist-item-title" }, [item.title]));
      if (item.description) body.append(el("p", { class: "rui-onboarding-checklist-item-description" }, [item.description]));
      li.append(body);
      if (!item.done && typeof item.onClick === "function") {
        const btn = el("button", {
          type: "button",
          class: "rui-button",
          "data-variant": "secondary",
          "data-size": "sm",
        }, [item.cta]);
        btn.onclick = () => helpers.invoke(item.onClick);
        li.append(btn);
      }
      list.append(li);
    }
    root.append(list);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * LoadingState / ErrorState / SuccessState
 * ----------------------------------------------------------------------- */

function renderStateCard(opts: {
  klass: string;
  iconName: string;
  iconClass: string;
  title: string;
  description: string;
  actions: unknown;
  helpers: { renderNode: (n: unknown) => Node };
}): HTMLElement {
  const root = el("div", { class: `rui-${opts.klass}` });
  if (opts.iconName) {
    const icon = renderIcon(opts.iconName, { className: opts.iconClass });
    if (icon) root.append(icon);
  }
  if (opts.title) root.append(el("h3", { class: `rui-${opts.klass}-title` }, [opts.title]));
  if (opts.description) root.append(el("p", { class: `rui-${opts.klass}-description` }, [opts.description]));
  const items = asArray<unknown>(opts.actions);
  if (items.length > 0) {
    const row = el("div", { class: `rui-${opts.klass}-actions` });
    for (const item of items) row.append(opts.helpers.renderNode(item));
    root.append(row);
  }
  return root;
}

export const LoadingState: ComponentSpec = {
  name: "LoadingState",
  description:
    "Full-card loading state — large spinner + title + description. Use " +
    "while a query is in flight or while a long-running tool runs. For " +
    "tiny inline loaders prefer `Spinner`; for skeleton placeholders " +
    "prefer `Skeleton`.",
  props: [
    { name: "title", type: "string", optional: true, description: "Default \"Loading…\"" },
    { name: "description", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-loading-state" });
    const spinner = el("span", { class: "rui-spinner", "data-size": "lg", "data-tone": "primary" });
    spinner.append(el("span", { class: "rui-spinner-ring", "aria-hidden": "true" }));
    root.append(spinner);
    root.append(el("h3", { class: "rui-loading-state-title" }, [asString(props.title, "Loading…")]));
    const description = asString(props.description);
    if (description) root.append(el("p", { class: "rui-loading-state-description" }, [description]));
    return root;
  },
};

export const ErrorState: ComponentSpec = {
  name: "ErrorState",
  description:
    "Full-card error placeholder. Pairs a danger icon with title, " +
    "description, and a row of recovery actions (Retry / Contact " +
    "support / Go home). Pass `actions` as Button(...) entries.",
  props: [
    { name: "title", type: "string", optional: true, description: "Default \"Something went wrong\"" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon (default `circle-exclamation`)" },
  ],
  render: (_node, props, helpers) => renderStateCard({
    klass: "error-state",
    iconName: asString(props.icon, "circle-exclamation"),
    iconClass: "rui-error-state-icon",
    title: asString(props.title, "Something went wrong"),
    description: asString(props.description),
    actions: props.actions,
    helpers,
  }),
};

export const SuccessState: ComponentSpec = {
  name: "SuccessState",
  description:
    "Full-card success placeholder. Use for confirmation screens " +
    "(\"Order placed\", \"Payment succeeded\", \"Account verified\") at " +
    "the end of a flow. Pass `actions` for follow-up CTAs.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Default `circle-check`" },
  ],
  render: (_node, props, helpers) => renderStateCard({
    klass: "success-state",
    iconName: asString(props.icon, "circle-check"),
    iconClass: "rui-success-state-icon",
    title: asString(props.title),
    description: asString(props.description),
    actions: props.actions,
    helpers,
  }),
};

/* ----------------------------------------------------------------------- *
 * Tour / Spotlight
 * ----------------------------------------------------------------------- */

interface TourStep {
  title: string;
  description: string;
  target: string;
}

export const Tour: ComponentSpec = {
  name: "Tour",
  description:
    "Product-tour controller — renders the current step's title, " +
    "description, and a Prev/Next/Skip row. Bind `current` to a " +
    "`$variable` (0-indexed). Pass `steps` as `{title, description, " +
    "target?}` objects; the optional `target` is a CSS selector that " +
    "renders alongside the step for designers to reference.",
  props: [
    { name: "steps", type: "object[]" },
    { name: "current", type: "number", description: "0-indexed active step — bind a $variable" },
    { name: "open", type: "boolean", optional: true, description: "Whether the tour is visible" },
    { name: "onComplete", type: "callable", optional: true },
  ],
  render: (node, props, helpers) => {
    const steps: TourStep[] = asArray<unknown>(props.steps).map((entry) => {
      if (!entry || typeof entry !== "object") return { title: asString(entry), description: "", target: "" };
      const r = entry as Record<string, unknown>;
      return { title: asString(r.title), description: asString(r.description), target: asString(r.target) };
    });
    const isOpen = props.open === undefined ? true : asBoolean(props.open);
    const total = steps.length;
    const current = Math.max(0, Math.min(total - 1, Math.floor(asNumber(props.current, 0))));
    const stateName = node.argMeta?.[1]?.stateRef;
    const overlay = el("div", { class: "rui-tour", "data-open": isOpen ? "true" : "false" });
    if (!isOpen || total === 0) return overlay;
    const step = steps[current];
    if (!step) return overlay;
    const card = el("div", { class: "rui-tour-card", role: "dialog", "aria-modal": "false" });
    card.append(el("div", { class: "rui-tour-step" }, [`Step ${current + 1} of ${total}`]));
    card.append(el("h3", { class: "rui-tour-title" }, [step.title]));
    if (step.description) card.append(el("p", { class: "rui-tour-description" }, [step.description]));
    if (step.target) card.append(el("div", { class: "rui-tour-target" }, [`Target: ${step.target}`]));
    const footer = el("div", { class: "rui-tour-footer" });
    const skip = el("button", { type: "button", class: "rui-button", "data-variant": "ghost" }, ["Skip"]);
    skip.onclick = () => helpers.invoke(props.onComplete);
    const prev = el("button", {
      type: "button",
      class: "rui-button",
      "data-variant": "secondary",
      disabled: current <= 0 ? "" : null,
    }, ["Back"]);
    if (stateName && current > 0) {
      prev.onclick = () => helpers.setState(stateName, current - 1);
    }
    const isLast = current >= total - 1;
    const next = el("button", { type: "button", class: "rui-button", "data-variant": "primary" }, [isLast ? "Finish" : "Next"]);
    next.onclick = () => {
      if (isLast) {
        helpers.invoke(props.onComplete);
      } else if (stateName) {
        helpers.setState(stateName, current + 1);
      }
    };
    footer.append(skip, prev, next);
    card.append(footer);
    overlay.append(card);
    return overlay;
  },
};

export const Spotlight: ComponentSpec = {
  name: "Spotlight",
  description:
    "Single-step product highlight — a dimmed full-page overlay with a " +
    "ring around the focused area and a small explainer card. Use for " +
    "one-off feature reveals (\"Try the new commands menu\"). Bind " +
    "`open` to a `$variable` to dismiss.",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", optional: true, description: "Whether the spotlight is visible — typically a $variable (default true)" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true, aliases: ["action"] },
  ],
  render: (node, props, helpers) => {
    const isOpen = props.open === undefined ? true : asBoolean(props.open);
    const overlay = el("div", { class: "rui-spotlight", "data-open": isOpen ? "true" : "false" });
    if (!isOpen) return overlay;
    const card = el("div", { class: "rui-spotlight-card" });
    card.append(el("h3", { class: "rui-spotlight-title" }, [asString(props.title)]));
    const description = asString(props.description);
    if (description) card.append(el("p", { class: "rui-spotlight-description" }, [description]));
    const actions = asArray<unknown>(props.actions);
    if (actions.length > 0) {
      const row = el("div", { class: "rui-spotlight-actions" });
      for (const item of actions) row.append(helpers.renderNode(item));
      card.append(row);
    }
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      overlay.onclick = (event) => {
        if (event.target !== overlay) return;
        helpers.setState(stateName, false);
      };
    }
    overlay.append(card);
    return overlay;
  },
};

/* ----------------------------------------------------------------------- *
 * Sticky / ResizablePanels / MasonryGrid / Drawer / TopBar
 * ----------------------------------------------------------------------- */

export const Sticky: ComponentSpec = {
  name: "Sticky",
  description:
    "Wraps content in a `position: sticky` container so it pins to the " +
    "top (or bottom) of the nearest scrollable ancestor. Use for " +
    "toolbar action rows above tables, in-page navs, status banners. " +
    "Sets `data-stuck=\"true\"` on itself once pinned, so a CSS hook (a " +
    "shadow/border) can flag the pinned state.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom"] },
    { name: "offset", type: "string", optional: true, description: "CSS offset (default 0)" },
    { name: "zIndex", type: "number", optional: true, description: "Z-index (default 10)" },
  ],
  render: (_node, props, helpers) => {
    const side = asString(props.side, "top");
    const offset = sanitiseCssLength(props.offset, "0");
    const z = Math.max(0, Math.floor(asNumber(props.zIndex, 10)));
    const styles = `position:sticky;${side}:${offset};z-index:${z};`;
    const root = el("div", { class: "rui-sticky", style: styles });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    // Stuck detection (II.4): a sentinel rootMargin equal to the pin offset
    // makes the element's intersection ratio drop below 1 exactly when it
    // pins, with no extra sentinel node. Toggle `data-stuck` for CSS hooks.
    if (typeof IntersectionObserver !== "undefined") {
      // Parse a px offset for the rootMargin; non-px offsets fall back to 0
      // (the stuck flag still flips, just at the viewport edge).
      const offsetPx = /^(\d+(?:\.\d+)?)px$/.exec(offset)?.[1] ?? "0";
      const margin = side === "bottom"
        ? `0px 0px -${Number(offsetPx) + 1}px 0px`
        : `-${Number(offsetPx) + 1}px 0px 0px 0px`;
      setTimeout(() => {
        const io = new IntersectionObserver(
          ([entry]) => {
            if (entry) root.setAttribute("data-stuck", entry.intersectionRatio < 1 ? "true" : "false");
          },
          { threshold: [1], rootMargin: margin },
        );
        io.observe(root);
        // Keyed: a re-render replaces the previous observer instead of
        // stacking one per render (anonymous disposers only run on unmount).
        helpers.registerDisposer(() => io.disconnect(), "rui-sticky-io");
      }, 0);
    }
    return root;
  },
};

export const ResizablePanels: ComponentSpec = {
  name: "ResizablePanels",
  description:
    "Two-pane horizontal split with a draggable divider. The user can " +
    "drag the divider to resize the primary pane; defaults respect the " +
    "starting width. Use for code editors, file browsers, master/detail " +
    "layouts that need user-controllable proportions.",
  props: [
    { name: "primary", type: "Node[]" },
    { name: "secondary", type: "Node[]" },
    { name: "initialPrimaryWidth", type: "string", optional: true, description: "CSS width for the primary pane (default 40%)" },
    { name: "minPrimaryWidth", type: "string", optional: true, description: "Min width (default 240px)" },
  ],
  render: (_node, props, helpers) => {
    const initial = sanitiseCssLength(props.initialPrimaryWidth, "40%");
    const minWidth = sanitiseCssLength(props.minPrimaryWidth, "240px");
    const root = el("div", {
      class: "rui-resizable-panels",
      style: `--rui-resizable-primary:${initial};--rui-resizable-min:${minWidth};`,
    });
    const primary = el("div", { class: "rui-resizable-panel rui-resizable-panel-primary" });
    for (const child of asArray(props.primary)) primary.append(helpers.renderNode(child));
    const divider = el("div", {
      class: "rui-resizable-divider",
      role: "separator",
      "aria-orientation": "vertical",
      tabindex: "0",
    });
    const secondary = el("div", { class: "rui-resizable-panel rui-resizable-panel-secondary" });
    for (const child of asArray(props.secondary)) secondary.append(helpers.renderNode(child));
    root.append(primary, divider, secondary);

    divider.onpointerdown = (event) => {
      const e = event as PointerEvent;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const live = target.closest(".rui-resizable-panels") as HTMLElement | null;
      if (!live) return;
      const rect = live.getBoundingClientRect();
      const onMove = (moveEvent: PointerEvent) => {
        const ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
        const clamped = Math.max(15, Math.min(85, ratio));
        live.style.setProperty("--rui-resizable-primary", `${clamped}%`);
      };
      const onUp = (upEvent: PointerEvent) => {
        target.releasePointerCapture(upEvent.pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    };

    return root;
  },
};

export const MasonryGrid: ComponentSpec = {
  name: "MasonryGrid",
  description:
    "Pinterest-style column grid. Children flow into columns that reflow " +
    "on viewport changes. Use for galleries, social-style feeds, and " +
    "mixed-height card walls. Prefer `Grid` when children should share " +
    "the same height per row.",
  props: [
    { name: "items", type: "Node[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default 3)" },
    { name: "gap", type: "string", optional: true, enum: SPACING_TOKENS },
  ],
  render: (_node, props, helpers) => {
    const columns = Math.max(1, Math.min(6, Math.floor(asNumber(props.columns, 3))));
    const gap = normalizeSpacingToken(props.gap, "md");
    const root = el("div", {
      class: "rui-masonry-grid",
      "data-columns": String(columns),
      "data-gap": gap,
    });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

export const Drawer: ComponentSpec = {
  name: "Drawer",
  description:
    "Side drawer overlay shown when `open` is true. Pass a `$variable` as " +
    "`open` to control it. Choose `side` for slide direction (default right). " +
    "`onClose` fires whenever the drawer is dismissed (× button or " +
    "backdrop click).",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state — usually a $variable" },
    { name: "children", type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["right", "left", "top", "bottom"] },
    { name: "footer", type: "Node[]", optional: true, description: "Optional footer actions row" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked when the drawer is dismissed" },
  ],
  render: (node, props, helpers) => {
    const isOpen = asBoolean(props.open);
    const side = asString(props.side, "right");
    const overlay = el("div", {
      class: "rui-sheet-overlay",
      "data-open": isOpen ? "true" : "false",
      "data-side": side,
    });
    const panel = el("aside", {
      class: "rui-sheet",
      role: "dialog",
      "aria-modal": "true",
      "data-side": side,
    });
    const header = el("header", { class: "rui-sheet-header" });
    header.append(el("h3", { class: "rui-sheet-title" }, [asString(props.title)]));
    const closeBtn = el("button", {
      type: "button",
      class: "rui-sheet-close",
      "aria-label": "Close",
    }, ["×"]);
    const stateName = node.argMeta?.[1]?.stateRef;
    const closeDrawer = () => {
      if (stateName) helpers.setState(stateName, false);
      helpers.invoke(props.onClose);
    };
    closeBtn.onclick = closeDrawer;
    overlay.onclick = (event) => {
      if (event.target === overlay) closeDrawer();
    };
    header.append(closeBtn);
    panel.append(header);
    const body = el("div", { class: "rui-sheet-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    panel.append(body);
    const footer = asArray<unknown>(props.footer);
    if (footer.length > 0) {
      const footerRow = el("footer", { class: "rui-sheet-footer" });
      for (const child of footer) footerRow.append(helpers.renderNode(child));
      panel.append(footerRow);
    }
    overlay.append(panel);
    return overlay;
  },
};

export const TopBar: ComponentSpec = {
  name: "TopBar",
  description:
    "Compact header strip that pairs a title (or breadcrumb) with " +
    "search and action slots. Use INSTEAD of hand-rolling a " +
    "`Stack(direction=\"row\")` above a page. For full SaaS shells use " +
    "`Navbar` (links) or `AppShell` (sidebar + topbar + content).",
  props: [
    { name: "title", type: "string", optional: true },
    { name: "subtitle", type: "string", optional: true },
    { name: "left", type: "Node[]", optional: true, aliases: ["badges"], description: "Leading slot (breadcrumbs, brand, status, badges)" },
    { name: "center", type: "Node[]", optional: true, aliases: ["search"], description: "Centered slot (search bar, segmented control)" },
    { name: "right", type: "Node[]", optional: true, aliases: ["actions"], description: "Trailing slot (actions, avatar)" },
    { name: "sticky", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("header", {
      class: "rui-topbar",
      "data-sticky": asBoolean(props.sticky) ? "true" : "false",
    });
    const left = el("div", { class: "rui-topbar-side rui-topbar-left" });
    const title = asString(props.title);
    if (title) {
      const titleBlock = el("div", { class: "rui-topbar-title-block" });
      titleBlock.append(el("h2", { class: "rui-topbar-title" }, [title]));
      const subtitle = asString(props.subtitle);
      if (subtitle) titleBlock.append(el("p", { class: "rui-topbar-subtitle" }, [subtitle]));
      left.append(titleBlock);
    }
    for (const child of asArray(props.left)) left.append(helpers.renderNode(child));
    root.append(left);
    const center = asArray<unknown>(props.center);
    if (center.length > 0) {
      const centerWrap = el("div", { class: "rui-topbar-side rui-topbar-center" });
      for (const child of center) centerWrap.append(helpers.renderNode(child));
      root.append(centerWrap);
    }
    const right = el("div", { class: "rui-topbar-side rui-topbar-right" });
    for (const child of asArray(props.right)) right.append(helpers.renderNode(child));
    root.append(right);
    return root;
  },
};

