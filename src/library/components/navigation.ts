/**
 * Navigation primitives modeled after shadcn/ui:
 * Breadcrumb, BreadcrumbItem, Pagination, Navbar, NavbarItem.
 *
 * These are intentionally light — they wrap the existing Link/NavLink
 * components when an `href`/`to` is provided so routing stays consistent
 * with the rest of the library.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseHref,
} from "../utils.js";

/** In-app targets always go through the hash router, never the document. */
function routeHash(to: string): string {
  return `#${to.startsWith("/") ? to : `/${to}`}`;
}

/** True when a plain primary click (no modifiers) — the one we may intercept. */
function isPlainClick(event: Event): boolean {
  const evt = event as MouseEvent;
  if (typeof evt.button === "number" && evt.button !== 0) return false;
  return !(evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey);
}

interface CrumbOptions {
  label: string;
  icon?: unknown;
  /** In-app route — navigated through the router. */
  to?: string;
  /** External href; must already be sanitised. */
  href?: string;
  /** Author callable, fired before any navigation. */
  onClick?: unknown;
  /** Leaf crumb: rendered as emphasised text with `aria-current="page"`. */
  current?: boolean;
}

/**
 * One `<li>` of a trail. Shared by `BreadcrumbItem` and by `Breadcrumb`'s
 * plain-string form so neither can invent an `href="#"`: the app is
 * hash-routed, so a bare `#` reads as "go to /" and would drop the user at
 * the home route instead of the crumb they clicked.
 */
function renderCrumb(opts: CrumbOptions, helpers: RenderHelpers): HTMLElement {
  const root = el("li", { class: "rui-breadcrumb-item" });
  const inner: Array<Node | string> = [];
  const iconNode = renderIcon(opts.icon, { className: "rui-breadcrumb-icon" });
  if (iconNode) inner.push(iconNode);
  inner.push(el("span", { class: "rui-breadcrumb-label" }, [opts.label]));

  if (opts.current) {
    root.setAttribute("aria-current", "page");
    root.append(el("span", { class: "rui-breadcrumb-current" }, inner));
    return root;
  }

  const to = opts.to ?? "";
  const href = opts.href ?? "";
  const onClick = typeof opts.onClick === "function" ? opts.onClick : null;

  if (to || href) {
    const anchor = el("a", {
      class: "rui-breadcrumb-link",
      href: to ? routeHash(to) : href,
    }, inner);
    anchor.onclick = (event) => {
      if (event.defaultPrevented) return;
      // Modified / middle clicks on a real link belong to the browser
      // ("open in new tab"), so only a plain click is ours to intercept.
      if (!isPlainClick(event)) return;
      if (onClick) helpers.invoke(onClick);
      if (to) {
        event.preventDefault();
        helpers.router.navigate(to);
      } else if (href === "#") {
        // `sanitiseHref` neutralised a hostile URL. Letting the bare `#`
        // through would hand the hash router a navigation to `/`.
        event.preventDefault();
      }
    };
    root.append(anchor);
    return root;
  }

  if (onClick) {
    // Handler-only crumb (pop a wizard step, close a drawer) — a button, so
    // there is no URL for the hash router to misread.
    const btn = el("button", {
      type: "button",
      class: "rui-breadcrumb-link rui-breadcrumb-button",
    }, inner);
    btn.onclick = () => helpers.invoke(onClick);
    root.append(btn);
    return root;
  }

  root.append(el("span", { class: "rui-breadcrumb-text" }, inner));
  return root;
}

export const BreadcrumbItem: ComponentSpec = {
  name: "BreadcrumbItem",
  description:
    "Single item inside a Breadcrumb trail. Pass `to` for an in-app route " +
    "(navigated through the built-in router), `href` for an external URL, or " +
    "`onClick` to handle the click yourself. Omit all three for the " +
    "current/leaf page (rendered with emphasis).",
  props: [
    { name: "label", type: "string" },
    { name: "href", type: "string", optional: true, description: "External URL — use `to` for in-app routes" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
    { name: "to", type: "string", optional: true, description: "In-app route, e.g. \"/projects\" — navigated through the router without reloading the app" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick"], description: "Callable fired on click — use instead of `to`/`href` to pop a step without changing the URL" },
  ],
  render: (_node, props, helpers) => {
    // Sanitise the href so a hostile `javascript:` URL coming from an LLM
    // cannot fire on click. `to` never needs it: it is always rendered as a
    // `#/route` hash the router owns.
    const rawHref = asString(props.href);
    const to = asString(props.to);
    return renderCrumb({
      label: asString(props.label),
      icon: props.icon,
      to,
      href: rawHref ? sanitiseHref(rawHref) : "",
      onClick: props.onClick,
      // No target of any kind = the leaf page the user is on.
      current: !rawHref && !to && typeof props.onClick !== "function",
    }, helpers);
  },
};

export const Breadcrumb: ComponentSpec = {
  name: "Breadcrumb",
  description:
    "Trail showing the user's location. Children may be " +
    "BreadcrumbItem(label, { to?, href? }) nodes OR plain strings (the last " +
    "string is the current page). Plain strings are text, not links — pass " +
    "`onItemClick` to make them clickable, or use BreadcrumbItem nodes with " +
    "`to` for real navigation. `maxItems` collapses the middle of a long " +
    "trail behind an ellipsis.",
  props: [
    { name: "items", type: "BreadcrumbItem[] | string[]" },
    { name: "separator", type: "string", optional: true, description: "Default `/`" },
    { name: "maxItems", type: "number", optional: true, description: "Collapse the middle of the trail to an ellipsis once there are more items than this (keeps the first crumb and the tail)" },
    { name: "onItemClick", type: "callable", optional: true, description: "Called with (index, label) when a plain-string crumb is clicked — makes the string form interactive without a URL" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const separator = asString(props.separator, "/");
    const maxItems = Math.max(0, Math.floor(asNumber(props.maxItems, 0)));
    const onItemClick = typeof props.onItemClick === "function" ? props.onItemClick : null;
    const root = el("nav", { class: "rui-breadcrumb", "aria-label": "Breadcrumb" });
    const list = el("ol", { class: "rui-breadcrumb-list" });

    // `maxItems` keeps the first crumb plus the tail and replaces the middle
    // with a single ellipsis (the shadcn / MUI collapse). Without it a
    // six-level trail wraps onto three rows on a phone. `null` = ellipsis.
    const shown: Array<number | null> = [];
    if (maxItems > 0 && items.length > maxItems) {
      const lead = maxItems > 1 ? 1 : 0;
      for (let i = 0; i < lead; i += 1) shown.push(i);
      shown.push(null);
      for (let i = items.length - (maxItems - lead); i < items.length; i += 1) shown.push(i);
    } else {
      items.forEach((_item, i) => shown.push(i));
    }

    shown.forEach((index, position) => {
      if (position > 0) {
        list.append(el("li", { class: "rui-breadcrumb-separator", "aria-hidden": "true" }, [separator]));
      }
      if (index === null) {
        // The glyph is decorative; the hidden text is what assistive tech reads,
        // so the collapse is announced instead of silently swallowing crumbs.
        list.append(el("li", { class: "rui-breadcrumb-item rui-breadcrumb-ellipsis" }, [
          el("span", { "aria-hidden": "true" }, ["…"]),
          el("span", { class: "rui-visually-hidden" }, ["collapsed items"]),
        ]));
        return;
      }
      const item = items[index];
      if (item && typeof item === "object" && (item as { __kind?: string }).__kind === "Component") {
        list.append(helpers.renderNode(item));
        return;
      }
      const label = asString(item);
      const isLast = index === items.length - 1;
      list.append(renderCrumb({
        label,
        current: isLast,
        // A plain string carries no URL, so it gets no href — the previous
        // `href="#"` was read by the hash router as "navigate to /", which
        // threw the user out of the route they clicked in.
        onClick: !isLast && onItemClick
          ? () => helpers.invoke(onItemClick, index, label)
          : undefined,
      }, helpers));
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
    "expose a per-page selector, or set `compact: true` to drop the " +
    "page-number row for tight toolbars. For server-side paging pass " +
    "`onChange` — it receives the new page number.",
  props: [
    { name: "page", type: "number", description: "Current page (1-indexed); typically a $variable" },
    { name: "totalPages", type: "number", aliases: ["pages"] },
    { name: "siblings", type: "number", optional: true, description: "Number of page links shown around the current page (default 1, max 6)" },
    { name: "total", type: "number", optional: true, description: "Total record count — enables the \"Showing N–M of T\" summary" },
    { name: "perPage", type: "number", optional: true, description: "Bind a `$variable` to expose a per-page selector" },
    { name: "perPageOptions", type: "number[]", optional: true, description: "Override the per-page choices (default 10/20/50/100)" },
    { name: "compact", type: "boolean", optional: true, description: "Hide page numbers — keep Prev / Next only" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onPageChange"], description: "Called with the new (1-indexed) page — required when `page` is not a bare `$variable`" },
    { name: "disabled", type: "boolean", optional: true, description: "Disable the whole pager (e.g. while a page fetch is in flight)" },
    { name: "onPerPageChange", type: "callable", optional: true, description: "Called with the new page size when the per-page selector changes" },
  ],
  render: (node, props, helpers) => {
    const total = Math.max(1, Math.floor(asNumber(props.totalPages, 1)));
    const current = Math.max(1, Math.min(total, Math.floor(asNumber(props.page, 1))));
    // Upper-clamped: `siblings: 999` (a plausible spelling of "show them all")
    // would otherwise build one <button> per page and freeze the tab.
    const siblings = Math.min(6, Math.max(0, Math.floor(asNumber(props.siblings, 1))));
    const compact = asBoolean(props.compact);
    const stateName = node.argMeta?.[0]?.stateRef;
    const onChange = typeof props.onChange === "function" ? props.onChange : null;
    // No state to write and nobody to notify: the pager physically cannot
    // change the page, so render it disabled rather than shipping buttons
    // that look live and swallow every click.
    const inert = !stateName && !onChange;
    const controlsDisabled = asBoolean(props.disabled);
    const allDisabled = controlsDisabled || inert;

    const root = el("nav", {
      class: "rui-pagination",
      "aria-label": "Pagination",
      "data-compact": compact ? "true" : "false",
      "data-disabled": allDisabled ? "true" : null,
    });

    const setPage = (next: number) => {
      const clamped = Math.max(1, Math.min(total, next));
      if (clamped === current) return;
      if (stateName) helpers.setState(stateName, clamped);
      helpers.invoke(onChange, clamped);
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
      const isDisabled = allDisabled || opts.disabled === true;
      const btn = el("button", {
        type: "button",
        class: "rui-pagination-button",
        "data-active": opts.active ? "true" : "false",
        "aria-current": opts.active ? "page" : null,
        "aria-label": opts.ariaLabel ?? null,
        disabled: isDisabled ? "" : null,
      }, [label]);
      if (!isDisabled && !opts.active) {
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

    // Per-page selector — a real `<select>` only when the choice has somewhere
    // to go (`perPage` bound to a $variable, or an `onPerPageChange` callable).
    // Otherwise it falls back to a passive label: an unbound select re-asserts
    // its rendered `selected` option on the next commit, so it would silently
    // snap back over the user's choice.
    const perPageState = node.argMeta?.[4]?.stateRef;
    const onPerPageChange = typeof props.onPerPageChange === "function" ? props.onPerPageChange : null;
    if (perPageValue && (perPageState || onPerPageChange || asArray(props.perPageOptions).length > 0)) {
      const perPageWrap = el("label", { class: "rui-pagination-per-page" }, [
        document.createTextNode("Show "),
      ]);
      if (perPageState || onPerPageChange) {
        const options = asArray<unknown>(props.perPageOptions).length > 0
          ? asArray<unknown>(props.perPageOptions).map((v) => Math.max(1, Math.floor(Number(v) || 0))).filter((n) => n > 0)
          : Array.from(PER_PAGE_OPTIONS);
        const select = el("select", {
          class: "rui-pagination-per-page-select",
          disabled: controlsDisabled ? "" : null,
        }) as HTMLSelectElement;
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
        if (onPerPageChange) {
          // `bindState` owns the same `onchange` property, so chain rather than
          // clobber it, and read the value off the live element the event fired
          // on — the element this render produced is discarded by the morph
          // reconciler.
          const bound = select.onchange;
          select.onchange = (event) => {
            bound?.call(select, event);
            const live = (event.currentTarget ?? event.target) as HTMLSelectElement | null;
            const size = Number(live?.value);
            if (Number.isFinite(size) && size > 0) helpers.invoke(onPerPageChange, size);
          };
        }
        perPageWrap.append(select);
      } else {
        perPageWrap.append(el("span", { class: "rui-pagination-per-page-value" }, [String(perPageValue)]));
      }
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
    "external link, or `onClick` for a click handler (`onClick` also runs " +
    "alongside `to`/`href`, e.g. to log the navigation). `active=true` " +
    "highlights the current page; `disabled=true` greys it out and makes it " +
    "unclickable.",
  props: [
    { name: "label", type: "string" },
    { name: "to", type: "string", optional: true, description: "Internal route (consumes the built-in router)" },
    { name: "href", type: "string", optional: true, description: "External href; opens in a new tab when set with `external=true`" },
    { name: "icon", type: "string", optional: true },
    { name: "active", type: "boolean", optional: true },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable fired on click — runs alongside `to`/`href` navigation, not instead of it" },
    { name: "external", type: "boolean", optional: true },
    { name: "disabled", type: "boolean", optional: true, description: "Grey out and de-activate the entry (gated feature / missing permission)" },
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
    const disabled = asBoolean(props.disabled);
    const onClick = typeof props.onClick === "function" ? props.onClick : null;
    const tagName: "a" | "button" = (to || safeHref) ? "a" : "button";
    const root = el(tagName, {
      class: "rui-navbar-item",
      type: tagName === "button" ? "button" : null,
      // A disabled entry keeps its shape but loses the href entirely, so it is
      // neither clickable nor keyboard-focusable — a greyed-out link the user
      // can still Tab into and open is worse than no gating at all.
      href: disabled ? null : (safeHref || (to ? routeHash(to) : null)),
      target: !disabled && external && safeHref ? "_blank" : null,
      rel: !disabled && external && safeHref ? "noopener noreferrer" : null,
      disabled: disabled && tagName === "button" ? "" : null,
      "aria-disabled": disabled ? "true" : null,
      "data-disabled": disabled ? "true" : null,
      "data-active": active ? "true" : "false",
    });
    const iconNode = renderIcon(icon, { className: "rui-navbar-item-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("span", { class: "rui-navbar-item-label" }, [label]));
    if (!disabled && (onClick || (to && !safeHref))) {
      root.onclick = (event) => {
        if (event.defaultPrevented) return;
        // Modified / middle clicks on a real link are the browser's to handle
        // ("open in new tab"), so leave them alone.
        if ((safeHref || to) && !isPlainClick(event)) return;
        // `onClick` runs *in addition to* navigation — "navigate and track" is
        // the common case, and swallowing one of the two silently is not a
        // behaviour any caller asked for.
        if (onClick) helpers.invoke(onClick);
        if (to && !safeHref) {
          event.preventDefault();
          helpers.router.navigate(to);
        } else if (!safeHref) {
          // <button> variant: nothing to navigate to.
          event.preventDefault();
        }
      };
    }
    return root;
  },
};

let navbarIdSeq = 0;

/**
 * Toggle the collapsed nav panel. Walks up from the clicked element so it
 * always mutates the LIVE navbar (the tree this render produced is the one the
 * reconciler discards) and keeps the persisted slot in sync so the panel
 * survives an unrelated re-render.
 */
function setNavbarMenuOpen(
  origin: Element,
  next: boolean,
  openSlot: { set: (value: boolean) => void },
): void {
  openSlot.set(next);
  const live = origin.closest(".rui-navbar") as HTMLElement | null;
  if (!live) return;
  live.setAttribute("data-menu-open", next ? "true" : "false");
  live.querySelector(".rui-navbar-burger")?.setAttribute("aria-expanded", next ? "true" : "false");
}

export const Navbar: ComponentSpec = {
  name: "Navbar",
  description:
    "Top navigation bar with a brand on the left, primary nav items in " +
    "the middle, and a right-aligned actions slot (user avatar, " +
    "DropdownMenu, CTA buttons, …). Use `sticky=true` to pin it to the " +
    "top of the page and `collapsible=true` to fold the item row behind a " +
    "burger toggle on narrow viewports. The canonical companion of `Sidebar` " +
    "for product surfaces; prefer Navbar for marketing/docs pages without a " +
    "sidebar.",
  props: [
    { name: "brand", type: "string | Node", optional: true, description: "Workspace/product name (string) or a node (e.g. logo Image)" },
    // `links` is accepted too — see the matching note on marketing NavBar.
    { name: "items", type: "NavbarItem[]", optional: true, aliases: ["links"], description: "Center navigation items" },
    { name: "actions", type: "Node[]", optional: true, description: "Right-side controls (Buttons, Avatar, DropdownMenu, …)" },
    { name: "sticky", type: "boolean", optional: true, description: "Pin the bar to the top of the viewport" },
    { name: "variant", aliases: ["tone"], type: "string", optional: true, enum: ["default", "transparent"], description: "Visual variant" },
    { name: "collapsible", type: "boolean", optional: true, description: "Collapse the item row behind a burger toggle below 640px (recommended with more than ~4 items, and with `sticky`)" },
  ],
  render: (_node, props, helpers) => {
    const collapsible = asBoolean(props.collapsible);
    // Persisted, so an unrelated commit cannot slam the mobile panel shut
    // mid-interaction.
    const openSlot = helpers.useInstanceState<boolean>("rui-navbar-menu-open", false);
    const menuOpen = collapsible && openSlot.get();
    const root = el("nav", {
      class: "rui-navbar",
      "data-sticky": asBoolean(props.sticky) ? "true" : "false",
      "data-variant": asString(props.variant, "default"),
      "data-collapsible": collapsible ? "true" : null,
      "data-menu-open": collapsible ? (menuOpen ? "true" : "false") : null,
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
    // Stable id so the burger can point `aria-controls` at the item row.
    let itemsId = "";
    if (collapsible) {
      const idSlot = helpers.useInstanceState<string>("rui-navbar-items-id", "");
      if (!idSlot.get()) idSlot.set(`rui-navbar-items-${(navbarIdSeq += 1)}`);
      itemsId = idSlot.get();
    }
    const items = asArray<unknown>(props.items);
    if (items.length > 0) {
      const list = el("div", { class: "rui-navbar-items", id: itemsId || null });
      for (const item of items) list.append(helpers.renderNode(item));
      if (collapsible) {
        // Picking a destination dismisses the panel, otherwise it stays open
        // on top of the page the user just navigated to.
        list.onclick = (event) => {
          const origin = (event.target as Element | null)?.closest(".rui-navbar-item");
          if (origin) setNavbarMenuOpen(origin, false, openSlot);
        };
      }
      root.append(list);
    }
    const actions = asArray<unknown>(props.actions);
    if (actions.length > 0) {
      const right = el("div", { class: "rui-navbar-actions" });
      for (const item of actions) right.append(helpers.renderNode(item));
      root.append(right);
    }
    if (collapsible && items.length > 0) {
      const burger = el("button", {
        type: "button",
        class: "rui-navbar-burger",
        "aria-label": "Toggle navigation",
        "aria-expanded": menuOpen ? "true" : "false",
        "aria-controls": itemsId || null,
      });
      const burgerIcon = renderIcon("bars", { className: "rui-navbar-burger-icon" });
      if (burgerIcon) burger.append(burgerIcon);
      else burger.textContent = "≡";
      burger.onclick = (event) => {
        const origin = (event.currentTarget ?? event.target) as Element | null;
        if (origin) setNavbarMenuOpen(origin, !openSlot.get(), openSlot);
      };
      root.append(burger);
    }
    return root;
  },
};
