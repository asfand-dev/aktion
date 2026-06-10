/**
 * Wave-3 components (suggestions-global VIII.2 / VIII.4 / VIII.8, XII.1):
 *
 *   QRCode         — offline SVG QR code (VIII.8)
 *   ReactionPicker — emoji reaction bar (VIII.4)
 *   LiveCursor     — collaborative presence cursor (VIII.4)
 *   TabBar         — bottom mobile tab bar (XII.1)
 *   Cart           — shopping-cart line list with qty steppers (VIII.2)
 *
 * All bounded + theme-aware; no external dependencies.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import { el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseCssColor, sanitiseImageSrc } from "../utils.js";
import { encodeQr, type Ecc } from "../qr.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string | null>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, v);
  }
  return node;
}

/* ----------------------------------------------------------------------- *
 * QRCode (VIII.8)
 * ----------------------------------------------------------------------- */

export const QRCode: ComponentSpec = {
  name: "QRCode",
  description:
    "Renders an offline QR code as crisp SVG from `data` (a URL or text). " +
    "`size` is the pixel side length, `ecc` the error-correction level " +
    "(L|M|Q|H, default M), `color`/`background` override the modules. No " +
    "network — encodes fully in the browser.",
  props: [
    { name: "data", type: "string", positional: true, required: true, aliases: ["value", "text"], description: "URL or text to encode" },
    { name: "size", type: "number", optional: true, description: "Side length in px (default 160)" },
    { name: "ecc", type: "string", optional: true, enum: ["L", "M", "Q", "H"] },
    { name: "color", type: "string", optional: true, description: "Module (dark) color" },
    { name: "background", type: "string", optional: true, description: "Background color (default transparent-white)" },
    { name: "margin", type: "number", optional: true, description: "Quiet-zone modules (default 2)" },
  ],
  render: (_node, props) => {
    const data = asString(props.data);
    const size = Math.max(48, Math.min(1024, asNumber(props.size, 160)));
    const eccRaw = asString(props.ecc, "M").toUpperCase();
    const ecc = (["L", "M", "Q", "H"].includes(eccRaw) ? eccRaw : "M") as Ecc;
    const color = sanitiseCssColor(props.color) || "#000000";
    const background = sanitiseCssColor(props.background) || "#ffffff";
    const margin = Math.max(0, Math.min(8, asNumber(props.margin, 2)));

    const root = el("div", { class: "rui-qrcode" });
    let matrix: boolean[][];
    try {
      matrix = encodeQr(data || " ", ecc);
    } catch {
      root.append(el("div", { class: "rui-qrcode-error" }, ["Data too long for QR"]));
      return root;
    }
    const count = matrix.length;
    const dim = count + margin * 2;
    const svg = svgEl("svg", {
      viewBox: `0 0 ${dim} ${dim}`,
      width: String(size),
      height: String(size),
      role: "img",
      "aria-label": `QR code for ${data}`,
      "shape-rendering": "crispEdges",
    });
    svg.append(svgEl("rect", { x: "0", y: "0", width: String(dim), height: String(dim), fill: background }));
    // Build one path string for all dark modules (compact + fast).
    let d = "";
    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        if (matrix[y]![x]) d += `M${x + margin},${y + margin}h1v1h-1z`;
      }
    }
    svg.append(svgEl("path", { d, fill: color }));
    root.append(svg);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * ReactionPicker (VIII.4)
 * ----------------------------------------------------------------------- */

export const ReactionPicker: ComponentSpec = {
  name: "ReactionPicker",
  description:
    "A row of emoji reactions with counts. `reactions` is a list of " +
    "{ emoji, count?, active? }; `onReact(emoji)` fires on click. Use under " +
    "messages, comments, and posts.",
  props: [
    { name: "reactions", type: "object[]", positional: true, required: true, description: "[{ emoji, count?, active? }]" },
    { name: "onReact", type: "callable", optional: true, description: "(emoji) => …" },
  ],
  render: (_node, props) => {
    const reactions = asArray(props.reactions);
    const onReact = typeof props.onReact === "function" ? props.onReact as (e: string) => void : null;
    const root = el("div", { class: "rui-reaction-picker", role: "group", "aria-label": "Reactions" });
    for (const r of reactions) {
      const rec = (r && typeof r === "object") ? r as Record<string, unknown> : {};
      const emoji = asString(rec.emoji, "👍");
      const count = asNumber(rec.count, 0);
      const active = asBoolean(rec.active);
      const btn = el("button", {
        type: "button",
        class: "rui-reaction",
        "data-active": active ? "true" : null,
        "aria-pressed": active ? "true" : "false",
      });
      btn.append(el("span", { class: "rui-reaction-emoji" }, [emoji]));
      if (count > 0) btn.append(el("span", { class: "rui-reaction-count" }, [String(count)]));
      if (onReact) btn.onclick = () => onReact(emoji);
      root.append(btn);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * LiveCursor (VIII.4)
 * ----------------------------------------------------------------------- */

export const LiveCursor: ComponentSpec = {
  name: "LiveCursor",
  description:
    "A floating collaborator cursor positioned at `x`/`y` (px) with a name " +
    "label — drive it from presence/`$socket` state for multiplayer UIs. " +
    "Pointer-events are disabled so it never blocks interaction.",
  props: [
    { name: "x", type: "number", description: "X position in px" },
    { name: "y", type: "number", description: "Y position in px" },
    { name: "label", type: "string", optional: true, description: "Collaborator name" },
    { name: "color", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const x = asNumber(props.x, 0);
    const y = asNumber(props.y, 0);
    const color = sanitiseCssColor(props.color) || "var(--rui-color-primary)";
    const root = el("div", {
      class: "rui-live-cursor",
      style: `transform:translate(${x}px,${y}px);--rui-cursor-color:${color}`,
    });
    const arrow = svgEl("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" });
    arrow.append(svgEl("path", { d: "M3 3l14 6-6 2-2 6z", fill: color, stroke: "#fff", "stroke-width": "1" }));
    root.append(arrow);
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-live-cursor-label", style: `background:${color}` }, [label]));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * TabBar (XII.1 — mobile bottom navigation)
 * ----------------------------------------------------------------------- */

export const TabBar: ComponentSpec = {
  name: "TabBar",
  description:
    "Bottom navigation bar for mobile layouts — a row of icon+label tabs. " +
    "`items` is [{ id, label, icon?, badge? }]; `active` is the current id; " +
    "`onChange(id)` fires on tap. Pins to the bottom with safe-area padding.",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, description: "[{ id, label, icon?, badge? }]" },
    { name: "active", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, description: "(id) => …" },
  ],
  render: (_node, props) => {
    const items = asArray(props.items);
    const active = asString(props.active);
    const onChange = typeof props.onChange === "function" ? props.onChange as (id: string) => void : null;
    const root = el("nav", { class: "rui-tabbar", role: "tablist", "aria-label": "Primary" });
    for (const it of items) {
      const rec = (it && typeof it === "object") ? it as Record<string, unknown> : {};
      const id = asString(rec.id ?? rec.label);
      const isActive = id === active && id !== "";
      const tab = el("button", {
        type: "button",
        class: "rui-tabbar-item",
        role: "tab",
        "data-active": isActive ? "true" : null,
        "aria-selected": isActive ? "true" : "false",
        // Bottom nav doubles as page navigation — announce the current page.
        "aria-current": isActive ? "page" : null,
      });
      const iconName = asString(rec.icon);
      if (iconName) {
        const icon = renderIcon(iconName, { className: "rui-tabbar-icon" });
        if (icon) {
          const wrap = el("span", { class: "rui-tabbar-icon-wrap" });
          wrap.append(icon);
          const badge = asString(rec.badge);
          if (badge) wrap.append(el("span", { class: "rui-tabbar-badge" }, [badge]));
          tab.append(wrap);
        }
      }
      const label = asString(rec.label);
      if (label) tab.append(el("span", { class: "rui-tabbar-label" }, [label]));
      if (onChange && id) tab.onclick = () => onChange(id);
      root.append(tab);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Cart (VIII.2 — shopping cart line list)
 * ----------------------------------------------------------------------- */

function renderChild(helpers: RenderHelpers, child: unknown): Node | null {
  if (child == null) return null;
  return typeof child === "string" ? document.createTextNode(child) : helpers.renderNode(child);
}

export const Cart: ComponentSpec = {
  name: "Cart",
  description:
    "A shopping-cart line list: each item shows image, name, unit price, a " +
    "quantity stepper, and a remove button, with a running subtotal. `items` " +
    "is [{ id, name, price, qty, image? }]; `onQty(id, qty)` and " +
    "`onRemove(id)` fire on interaction. `currency` is an ISO code (default USD).",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, description: "[{ id, name, price, qty, image? }]" },
    { name: "onQty", type: "callable", optional: true, description: "(id, qty) => …" },
    { name: "onRemove", type: "callable", optional: true, description: "(id) => …" },
    { name: "currency", type: "string", optional: true },
    { name: "footer", type: "Node", optional: true, description: "Custom footer (e.g. a checkout button)" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const currency = asString(props.currency, "USD") || "USD";
    const onQty = typeof props.onQty === "function" ? props.onQty as (id: string, q: number) => void : null;
    const onRemove = typeof props.onRemove === "function" ? props.onRemove as (id: string) => void : null;
    const fmt = (n: number): string => {
      try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); }
      // Don't imply dollars for an unknown code — show the code itself.
      catch { return `${n.toFixed(2)} ${currency}`; }
    };
    const root = el("div", { class: "rui-cart" });
    let subtotal = 0;
    if (items.length === 0) {
      root.append(el("div", { class: "rui-cart-empty" }, ["Your cart is empty"]));
    }
    for (const it of items) {
      const rec = (it && typeof it === "object") ? it as Record<string, unknown> : {};
      const id = asString(rec.id ?? rec.name);
      const name = asString(rec.name);
      const price = asNumber(rec.price, 0);
      const qty = Math.max(0, asNumber(rec.qty, 1));
      subtotal += price * qty;
      const row = el("div", { class: "rui-cart-line" });
      const image = sanitiseImageSrc(rec.image);
      if (image) row.append(el("img", { class: "rui-cart-thumb", src: image, alt: name, loading: "lazy" }));
      const body = el("div", { class: "rui-cart-body" });
      body.append(el("div", { class: "rui-cart-name" }, [name]));
      body.append(el("div", { class: "rui-cart-price" }, [fmt(price)]));
      row.append(body);
      // Quantity stepper.
      const stepper = el("div", { class: "rui-cart-qty" });
      const dec = el("button", { type: "button", class: "rui-cart-qty-btn", "aria-label": "Decrease quantity" }, ["−"]);
      const inc = el("button", { type: "button", class: "rui-cart-qty-btn", "aria-label": "Increase quantity" }, ["+"]);
      if (onQty && id) { dec.onclick = () => onQty(id, Math.max(0, qty - 1)); inc.onclick = () => onQty(id, qty + 1); }
      stepper.append(dec, el("span", { class: "rui-cart-qty-value" }, [String(qty)]), inc);
      row.append(stepper);
      row.append(el("div", { class: "rui-cart-line-total" }, [fmt(price * qty)]));
      if (onRemove && id) {
        const rm = el("button", { type: "button", class: "rui-cart-remove", "aria-label": `Remove ${name}` });
        const icon = renderIcon("xmark", { className: "rui-cart-remove-icon" });
        if (icon) rm.append(icon); else rm.append(document.createTextNode("×"));
        rm.onclick = () => onRemove(id);
        row.append(rm);
      }
      root.append(row);
    }
    const foot = el("div", { class: "rui-cart-foot" });
    foot.append(el("span", { class: "rui-cart-subtotal-label" }, ["Subtotal"]));
    foot.append(el("span", { class: "rui-cart-subtotal-value" }, [fmt(subtotal)]));
    root.append(foot);
    const footer = renderChild(helpers, props.footer);
    if (footer) root.append(footer);
    return root;
  },
};
