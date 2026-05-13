/**
 * Navigation primitives modeled after shadcn/ui:
 * Breadcrumb, BreadcrumbItem, Pagination, Sheet, Navbar, NavbarItem.
 *
 * These are intentionally light — they wrap the existing Link/NavLink
 * components when an `href`/`to` is provided so routing stays consistent
 * with the rest of the library.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseHref,
} from "../utils.js";

export const BreadcrumbItem: ComponentSpec = {
  name: "BreadcrumbItem",
  description:
    "Single item inside a Breadcrumb trail. Provide `href` for a link, omit " +
    "it for the current/leaf page (rendered with emphasis).",
  props: [
    { name: "label", type: "string" },
    { name: "href", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
  ],
  render: (_node, props) => {
    const root = el("li", { class: "rui-breadcrumb-item" });
    const label = asString(props.label);
    // Sanitise the href so a hostile `javascript:` URL coming from an LLM
    // cannot fire on click. Empty input keeps the legacy "current page"
    // rendering path so leaf crumbs still render as plain text.
    const rawHref = asString(props.href);
    const safeHref = rawHref ? sanitiseHref(rawHref) : "";
    const inner: Array<Node | string | null> = [];
    const iconNode = renderIcon(props.icon, { className: "rui-breadcrumb-icon" });
    if (iconNode) inner.push(iconNode);
    inner.push(el("span", { class: "rui-breadcrumb-label" }, [label]));
    if (safeHref) {
      root.append(el("a", { class: "rui-breadcrumb-link", href: safeHref }, inner));
    } else {
      root.setAttribute("aria-current", "page");
      const span = el("span", { class: "rui-breadcrumb-current" });
      for (const node of inner) if (node) span.append(typeof node === "string" ? document.createTextNode(node) : node);
      root.append(span);
    }
    return root;
  },
};

export const Breadcrumb: ComponentSpec = {
  name: "Breadcrumb",
  description:
    "Trail of links showing the user's location. Children may be " +
    "BreadcrumbItem(label, href?) nodes OR plain strings (the last string is " +
    "treated as the current page).",
  props: [
    { name: "items", type: "BreadcrumbItem[] | string[]" },
    { name: "separator", type: "string", optional: true, description: "Default `/`" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const separator = asString(props.separator, "/");
    const root = el("nav", { class: "rui-breadcrumb", "aria-label": "Breadcrumb" });
    const list = el("ol", { class: "rui-breadcrumb-list" });
    items.forEach((item, i) => {
      if (i > 0) {
        list.append(el("li", { class: "rui-breadcrumb-separator", "aria-hidden": "true" }, [separator]));
      }
      if (item && typeof item === "object" && (item as { __kind?: string }).__kind === "Component") {
        list.append(helpers.renderNode(item));
        return;
      }
      const label = asString(item);
      const isLast = i === items.length - 1;
      list.append(BreadcrumbItem.render(
        { __kind: "Component", name: "BreadcrumbItem", args: [], argMeta: [] },
        { label, href: isLast ? "" : "#" },
        helpers,
      ));
    });
    root.append(list);
    return root;
  },
};

export const Pagination: ComponentSpec = {
  name: "Pagination",
  description:
    "Page navigator with Prev/Next, page numbers, and ellipses. Pass a " +
    "`$variable` as `page` for two-way binding — clicking a page button " +
    "sets that state to the new (1-indexed) value.",
  props: [
    { name: "page", type: "number", description: "Current page (1-indexed); typically a $variable" },
    { name: "totalPages", type: "number" },
    { name: "siblings", type: "number", optional: true, description: "Number of page links shown around the current page (default 1)" },
  ],
  render: (node, props, helpers) => {
    const total = Math.max(1, Math.floor(asNumber(props.totalPages, 1)));
    const current = Math.max(1, Math.min(total, Math.floor(asNumber(props.page, 1))));
    const siblings = Math.max(0, Math.floor(asNumber(props.siblings, 1)));
    const stateName = node.argMeta?.[0]?.stateRef;

    const root = el("nav", { class: "rui-pagination", "aria-label": "Pagination" });

    const setPage = (next: number) => {
      if (!stateName) return;
      const clamped = Math.max(1, Math.min(total, next));
      if (clamped === current) return;
      helpers.runAction({
        kind: "Action",
        steps: [{ kind: "Set", name: stateName, value: clamped }],
      });
    };

    const button = (label: string, target: number, opts: { active?: boolean; disabled?: boolean; ellipsis?: boolean } = {}) => {
      if (opts.ellipsis) {
        return el("span", { class: "rui-pagination-ellipsis", "aria-hidden": "true" }, [label]);
      }
      const btn = el("button", {
        type: "button",
        class: "rui-pagination-button",
        "data-active": opts.active ? "true" : "false",
        "aria-current": opts.active ? "page" : null,
        disabled: opts.disabled ? "" : null,
      }, [label]);
      if (!opts.disabled && !opts.active) {
        btn.onclick = () => setPage(target);
      }
      return btn;
    };

    root.append(button("‹", current - 1, { disabled: current <= 1 }));

    const pageNumbers = computePageNumbers(current, total, siblings);
    for (const entry of pageNumbers) {
      if (entry === "…") {
        root.append(button("…", 0, { ellipsis: true }));
      } else {
        root.append(button(String(entry), entry, { active: entry === current }));
      }
    }

    root.append(button("›", current + 1, { disabled: current >= total }));

    return root;
  },
};

function computePageNumbers(current: number, total: number, siblings: number): Array<number | "…"> {
  const pages: Array<number | "…"> = [];
  const range = (from: number, to: number) => {
    for (let i = from; i <= to; i += 1) pages.push(i);
  };
  const totalNumbers = siblings * 2 + 5; // first, last, current, 2 ellipses, siblings on both sides
  if (total <= totalNumbers) {
    range(1, total);
    return pages;
  }
  const leftSibling = Math.max(2, current - siblings);
  const rightSibling = Math.min(total - 1, current + siblings);
  pages.push(1);
  if (leftSibling > 2) pages.push("…");
  range(leftSibling, rightSibling);
  if (rightSibling < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

export const NavbarItem: ComponentSpec = {
  name: "NavbarItem",
  description:
    "Single link inside a Navbar's main item slot. Renders as an inline " +
    "anchor / button — pass `to` for a router-aware link, `href` for an " +
    "external link, or `action` for a click handler. `active=true` " +
    "highlights the current page.",
  props: [
    { name: "label", type: "string" },
    { name: "to", type: "string", optional: true, description: "Internal route (consumes the built-in router)" },
    { name: "href", type: "string", optional: true, description: "External href; opens in a new tab when set with `external=true`" },
    { name: "icon", type: "string", optional: true },
    { name: "active", type: "boolean", optional: true },
    { name: "action", type: "Action", optional: true, description: "Action fired on click (alternative to `to`/`href`)" },
    { name: "external", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label);
    const icon = props.icon;
    const active = asBoolean(props.active);
    const to = asString(props.to);
    // Sanitise the external href so a hostile `javascript:` cannot fire on
    // click. The internal `to` value is always rendered through the hash
    // router (`#/...`) which is inherently safe.
    const safeHref = sanitiseHref(props.href, "");
    const external = asBoolean(props.external);
    const tagName: "a" | "button" = (to || safeHref) ? "a" : "button";
    const root = el(tagName, {
      class: "rui-navbar-item",
      type: tagName === "button" ? "button" : null,
      href: safeHref || (to ? `#${to.startsWith("/") ? to : `/${to}`}` : null),
      target: external && safeHref ? "_blank" : null,
      rel: external && safeHref ? "noopener noreferrer" : null,
      "data-active": active ? "true" : "false",
    });
    const iconNode = renderIcon(icon, { className: "rui-navbar-item-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("span", { class: "rui-navbar-item-label" }, [label]));
    if (to && !safeHref) {
      root.onclick = (event) => {
        if (event.defaultPrevented) return;
        const evt = event as MouseEvent;
        if (evt.button !== 0 || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
        event.preventDefault();
        helpers.runAction({ kind: "Action", steps: [{ kind: "Navigate", path: to }] });
      };
    } else if (isActionPayload(props.action)) {
      root.onclick = (event) => {
        event.preventDefault();
        helpers.runAction(props.action);
      };
    }
    return root;
  },
};

export const Navbar: ComponentSpec = {
  name: "Navbar",
  description:
    "Top navigation bar with a brand on the left, primary nav items in " +
    "the middle, and a right-aligned actions slot (user avatar, " +
    "DropdownMenu, CTA buttons, …). Use `sticky=true` to pin it to the " +
    "top of the page. The canonical companion of `Sidebar` for product " +
    "surfaces; prefer Navbar for marketing/docs pages without a sidebar.",
  props: [
    { name: "brand", type: "string | Node", optional: true, description: "Workspace/product name (string) or a node (e.g. logo Image)" },
    { name: "items", type: "NavbarItem[]", optional: true, description: "Center navigation items" },
    { name: "actions", type: "Node[]", optional: true, description: "Right-side controls (Buttons, Avatar, DropdownMenu, …)" },
    { name: "sticky", type: "boolean", optional: true, description: "Pin the bar to the top of the viewport" },
    { name: "variant", type: "string", optional: true, enum: ["default", "transparent"], description: "Visual variant" },
  ],
  render: (_node, props, helpers) => {
    const root = el("nav", {
      class: "rui-navbar",
      "data-sticky": asBoolean(props.sticky) ? "true" : "false",
      "data-variant": asString(props.variant, "default"),
      "aria-label": "Primary",
    });
    const brand = props.brand;
    if (brand !== undefined && brand !== null && brand !== "") {
      const brandWrap = el("div", { class: "rui-navbar-brand" });
      if (typeof brand === "string") {
        brandWrap.append(document.createTextNode(brand));
      } else {
        brandWrap.append(helpers.renderNode(brand));
      }
      root.append(brandWrap);
    }
    const items = asArray<unknown>(props.items);
    if (items.length > 0) {
      const list = el("div", { class: "rui-navbar-items" });
      for (const item of items) list.append(helpers.renderNode(item));
      root.append(list);
    }
    const actions = asArray<unknown>(props.actions);
    if (actions.length > 0) {
      const right = el("div", { class: "rui-navbar-actions" });
      for (const item of actions) right.append(helpers.renderNode(item));
      root.append(right);
    }
    return root;
  },
};

export const Sheet: ComponentSpec = {
  name: "Sheet",
  description:
    "Side drawer overlay shown when `open` is true. Pass a `$variable` as " +
    "`open` to control it. Choose `side` for slide direction (default right).",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state — usually a $variable" },
    { name: "children", type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["right", "left", "top", "bottom"] },
    { name: "footer", type: "Node[]", optional: true, description: "Optional footer actions row" },
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
    if (stateName) {
      closeBtn.onclick = () => {
        helpers.runAction({
          kind: "Action",
          steps: [{ kind: "Set", name: stateName, value: false }],
        });
      };
      overlay.onclick = (event) => {
        if (event.target === overlay) {
          helpers.runAction({
            kind: "Action",
            steps: [{ kind: "Set", name: stateName, value: false }],
          });
        }
      };
    }
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
