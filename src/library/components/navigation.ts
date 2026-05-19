/**
 * Navigation primitives modeled after shadcn/ui:
 * Breadcrumb, BreadcrumbItem, Pagination, Navbar, NavbarItem.
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

const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;

export const Pagination: ComponentSpec = {
  name: "Pagination",
  description:
    "Page navigator with Prev/Next, page numbers, and ellipses. Pass a " +
    "`$variable` as `page` for two-way binding — clicking a page button " +
    "sets that state to the new (1-indexed) value. Add `total` to render " +
    "a \"Showing N–M of T\" summary, pass `$variable` as `perPage` to " +
    "expose a per-page selector, or set `compact=true` to drop the " +
    "page-number row for tight toolbars.",
  props: [
    { name: "page", type: "number", description: "Current page (1-indexed); typically a $variable" },
    { name: "totalPages", type: "number" },
    { name: "siblings", type: "number", optional: true, description: "Number of page links shown around the current page (default 1)" },
    { name: "total", type: "number", optional: true, description: "Total record count — enables the \"Showing N–M of T\" summary" },
    { name: "perPage", type: "number", optional: true, description: "Bind a `$variable` to expose a per-page selector" },
    { name: "perPageOptions", type: "number[]", optional: true, description: "Override the per-page choices (default 10/20/50/100)" },
    { name: "compact", type: "boolean", optional: true, description: "Hide page numbers — keep Prev / Next only" },
  ],
  render: (node, props, helpers) => {
    const total = Math.max(1, Math.floor(asNumber(props.totalPages, 1)));
    const current = Math.max(1, Math.min(total, Math.floor(asNumber(props.page, 1))));
    const siblings = Math.max(0, Math.floor(asNumber(props.siblings, 1)));
    const compact = asBoolean(props.compact);
    const stateName = node.argMeta?.[0]?.stateRef;

    const root = el("nav", { class: "rui-pagination", "aria-label": "Pagination", "data-compact": compact ? "true" : "false" });

    const setPage = (next: number) => {
      if (!stateName) return;
      const clamped = Math.max(1, Math.min(total, next));
      if (clamped === current) return;
      helpers.runAction({
        kind: "Action",
        steps: [{ kind: "Set", name: stateName, value: clamped }],
      });
    };

    // Optional record-count summary ("Showing 21–30 of 123").
    const totalRecords = props.total != null ? Math.max(0, Math.floor(asNumber(props.total, 0))) : null;
    const perPageValue = props.perPage != null ? Math.max(1, Math.floor(asNumber(props.perPage, 0))) : null;
    if (totalRecords !== null && perPageValue && perPageValue > 0) {
      const start = totalRecords === 0 ? 0 : (current - 1) * perPageValue + 1;
      const end = Math.min(totalRecords, current * perPageValue);
      root.append(el("span", { class: "rui-pagination-summary" }, [
        totalRecords === 0
          ? "No results"
          : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${totalRecords.toLocaleString()}`,
      ]));
    } else if (totalRecords !== null) {
      root.append(el("span", { class: "rui-pagination-summary" }, [
        `${totalRecords.toLocaleString()} result${totalRecords === 1 ? "" : "s"}`,
      ]));
    }

    const buttonsWrap = el("div", { class: "rui-pagination-buttons" });

    const button = (label: string, target: number, opts: { active?: boolean; disabled?: boolean; ellipsis?: boolean; ariaLabel?: string } = {}) => {
      if (opts.ellipsis) {
        return el("span", { class: "rui-pagination-ellipsis", "aria-hidden": "true" }, [label]);
      }
      const btn = el("button", {
        type: "button",
        class: "rui-pagination-button",
        "data-active": opts.active ? "true" : "false",
        "aria-current": opts.active ? "page" : null,
        "aria-label": opts.ariaLabel ?? null,
        disabled: opts.disabled ? "" : null,
      }, [label]);
      if (!opts.disabled && !opts.active) {
        btn.onclick = () => setPage(target);
      }
      return btn;
    };

    buttonsWrap.append(button("‹", current - 1, { disabled: current <= 1, ariaLabel: "Previous page" }));

    if (!compact) {
      const pageNumbers = computePageNumbers(current, total, siblings);
      for (const entry of pageNumbers) {
        if (entry === "…") {
          buttonsWrap.append(button("…", 0, { ellipsis: true }));
        } else {
          buttonsWrap.append(button(String(entry), entry, { active: entry === current }));
        }
      }
    } else {
      // Compact variant still shows the current page label so callers
      // know where they are when the numbered row is hidden.
      buttonsWrap.append(el("span", { class: "rui-pagination-current" }, [`${current} / ${total}`]));
    }

    buttonsWrap.append(button("›", current + 1, { disabled: current >= total, ariaLabel: "Next page" }));
    root.append(buttonsWrap);

    // Per-page selector — only renders when `perPage` is a $variable so the
    // bound state can absorb the change. Falls back to a passive label when
    // perPage is a plain number.
    const perPageState = node.argMeta?.[4]?.stateRef;
    if (perPageValue && (perPageState || asArray(props.perPageOptions).length > 0)) {
      const options = asArray<unknown>(props.perPageOptions).length > 0
        ? asArray<unknown>(props.perPageOptions).map((v) => Math.max(1, Math.floor(Number(v) || 0))).filter((n) => n > 0)
        : Array.from(PER_PAGE_OPTIONS);
      const perPageWrap = el("label", { class: "rui-pagination-per-page" }, [
        document.createTextNode("Show "),
      ]);
      const select = el("select", { class: "rui-pagination-per-page-select" }) as HTMLSelectElement;
      for (const opt of options) {
        const optEl = el("option", {
          value: String(opt),
          selected: opt === perPageValue ? "" : null,
        }, [String(opt)]);
        select.append(optEl);
      }
      if (perPageState) {
        helpers.bindState(select, perPageState, {
          event: "change",
          getValue: (n) => Number((n as HTMLSelectElement).value),
        });
      }
      perPageWrap.append(select);
      perPageWrap.append(document.createTextNode(" per page"));
      root.append(perPageWrap);
    }

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
