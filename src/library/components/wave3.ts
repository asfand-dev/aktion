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
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  sanitiseCssColor, sanitiseHref, sanitiseImageSrc,
} from "../utils.js";
import { deferToPaint } from "../floating.js";
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
    "`size` is the pixel side length and acts as a maximum — the code scales " +
    "down to fit a narrower container. `ecc` is the error-correction level " +
    "(L|M|Q|H, default M), `color`/`background` override the modules, `label` " +
    "sets the accessible name. No network — encodes fully in the browser.",
  props: [
    { name: "data", type: "string", positional: true, required: true, aliases: ["value", "text"], description: "URL or text to encode" },
    { name: "size", type: "number", optional: true, description: "Side length in px (default 160); scales down on narrower viewports" },
    { name: "ecc", type: "string", optional: true, enum: ["L", "M", "Q", "H"] },
    { name: "color", type: "string", optional: true, description: "Module (dark) color" },
    { name: "background", type: "string", optional: true, description: "Background color — default opaque white, which reliable scanning needs; pass \"transparent\" to drop the backing rect" },
    { name: "margin", type: "number", optional: true, description: "Quiet-zone modules (default 2)" },
    { name: "label", type: "string", optional: true, aliases: ["alt"], description: "Accessible name (default \"QR code for <data>\") — use it so screen readers do not read out a whole signed URL" },
  ],
  render: (_node, props) => {
    const data = asString(props.data);
    const size = Math.max(48, Math.min(1024, asNumber(props.size, 160)));
    const label = asString(props.label);
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
      // A raw payload (a signed checkout URL, say) is an unusable accessible
      // name, so `label` wins verbatim when the author supplies one.
      "aria-label": label || `QR code for ${data}`,
      "shape-rendering": "crispEdges",
      // `size` is a max, not a fixed dimension: a 600px code inside a 375px
      // phone column would otherwise force the page to scroll sideways. Inline
      // so the constraint holds no matter which theme is adopted.
      style: "max-width:100%;height:auto",
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
    "{ emoji, count?, active?, label? } — `label` names the reaction (\"You " +
    "and 2 others\") for the tooltip and the accessible name. " +
    "`onReact(emoji)` fires on click; `disabled` makes the whole bar " +
    "read-only. Use under messages, comments, and posts.",
  props: [
    { name: "reactions", type: "object[]", positional: true, required: true, description: "[{ emoji, count?, active?, label? }]" },
    { name: "onReact", type: "callable", optional: true, description: "(emoji) => …" },
    { name: "disabled", type: "boolean", optional: true, description: "Render every pill inert — archived threads, locked issues, logged-out visitors" },
  ],
  render: (_node, props, helpers) => {
    const reactions = asArray(props.reactions);
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-reaction-picker", role: "group", "aria-label": "Reactions" });
    for (const r of reactions) {
      const rec = (r && typeof r === "object") ? r as Record<string, unknown> : {};
      const emoji = asString(rec.emoji, "👍");
      const count = asNumber(rec.count, 0);
      const active = asBoolean(rec.active);
      // The glyph plus a bare number announces as "thumbs up 3" — `label` is
      // the only way to say what the reaction means and who left it.
      const label = asString(rec.label);
      const name = label || `React with ${emoji}`;
      const btn = el("button", {
        type: "button",
        class: "rui-reaction",
        "data-active": active ? "true" : null,
        "aria-pressed": active ? "true" : "false",
        "aria-label": count > 0 ? `${name} (${count})` : name,
        title: label || null,
        disabled,
      });
      btn.append(el("span", { class: "rui-reaction-emoji" }, [emoji]));
      if (count > 0) btn.append(el("span", { class: "rui-reaction-count" }, [String(count)]));
      // `invoke` is the runtime's containment path: an author handler that
      // throws or rejects is logged, not left as an uncaught exception.
      if (!disabled) btn.onclick = () => helpers.invoke(props.onReact, emoji);
      root.append(btn);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * LiveCursor (VIII.4)
 * ----------------------------------------------------------------------- */

/** Horizontal offset of the name label from the arrow — mirrors the stylesheet. */
const CURSOR_LABEL_GAP = 14;

/** Inline style for the name bubble; `side` flips it to the arrow's left. */
function cursorLabelStyle(color: string, side: "left" | "right"): string {
  const flip = side === "left" ? `;right:${CURSOR_LABEL_GAP}px;left:auto` : "";
  return `background:${color}${flip}`;
}

export const LiveCursor: ComponentSpec = {
  name: "LiveCursor",
  description:
    "A floating collaborator cursor positioned at `x`/`y` with a name label — " +
    "drive it from presence/`$socket` state for multiplayer UIs. `space` " +
    "declares what x/y are measured against: \"parent\" (default) is the " +
    "nearest positioned ancestor, so give the shared surface " +
    "`position: relative`; \"viewport\" treats them as viewport coordinates " +
    "and escapes `overflow: hidden` clipping. `smooth` glides between presence " +
    "ticks, `typing` shows a typing indicator. Pointer-events are disabled so " +
    "it never blocks interaction.",
  props: [
    { name: "x", type: "number", description: "X position in px, relative to `space`" },
    { name: "y", type: "number", description: "Y position in px, relative to `space`" },
    { name: "label", type: "string", optional: true, description: "Collaborator name" },
    { name: "color", type: "string", optional: true },
    { name: "space", type: "string", optional: true, enum: ["parent", "viewport"], description: "Coordinate frame for x/y (default `parent`)" },
    { name: "smooth", type: "boolean", optional: true, description: "Interpolate movement between presence updates (default true; ignored under prefers-reduced-motion)" },
    { name: "typing", type: "boolean", optional: true, description: "Show a typing indicator on the cursor" },
  ],
  render: (_node, props, helpers) => {
    const x = asNumber(props.x, 0);
    const y = asNumber(props.y, 0);
    const color = sanitiseCssColor(props.color) || "var(--rui-color-primary)";
    const space = asString(props.space, "parent") === "viewport" ? "viewport" : "parent";
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const smooth = asBoolean(props.smooth, true) && !reduce;
    const typing = asBoolean(props.typing);
    const label = asString(props.label);

    // Label geometry measured once after the first paint. Keeping it in
    // instance state (rather than re-measuring) is what makes the flip work at
    // all: on a re-render the morph keeps the LIVE node and discards this
    // fresh tree, so the fresh node is never connected and can never measure.
    // Cached widths let every render recompute the side from the new `x`.
    const metricsSlot = helpers.useInstanceState<{ frame: number; label: number }>(
      "rui-cursor-label-metrics",
      { frame: 0, label: 0 },
    );
    const metrics = metricsSlot.get();
    const side: "left" | "right" =
      metrics.frame > 0 && x + CURSOR_LABEL_GAP + metrics.label > metrics.frame ? "left" : "right";

    const root = el("div", {
      class: "rui-live-cursor",
      "data-space": space,
      "data-typing": typing ? "true" : null,
      // `position` and `transition` are inline so both behaviours hold without
      // a theme rule: `fixed` is what lets `space: "viewport"` escape a
      // clipping ancestor, and without a transition a 10Hz presence feed makes
      // every remote cursor teleport in ~40px steps.
      style: [
        `transform:translate(${x}px,${y}px)`,
        `--rui-cursor-color:${color}`,
        space === "viewport" ? "position:fixed" : "",
        smooth ? "transition:transform 90ms linear" : "",
      ].filter(Boolean).join(";"),
    });
    const arrow = svgEl("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" });
    arrow.append(svgEl("path", { d: "M3 3l14 6-6 2-2 6z", fill: color, stroke: "#fff", "stroke-width": "1" }));
    root.append(arrow);
    let bubble: HTMLElement | null = null;
    if (label || typing) {
      bubble = el("span", {
        class: "rui-live-cursor-label",
        "data-side": side,
        style: cursorLabelStyle(color, side),
      }, [label]);
      if (typing) bubble.append(el("span", { class: "rui-live-cursor-typing", "aria-hidden": "true" }, ["…"]));
      root.append(bubble);
    }

    // Measure once: a re-render's fresh tree is never the committed one, so a
    // repeat schedule could only bail — and this render path runs at the
    // presence feed's rate.
    if (bubble && metrics.frame === 0) {
      const labelNode = bubble;
      deferToPaint(() => {
        // Only the tree the morph committed is connected; a discarded fresh
        // tree must neither measure nor write (the live node already carries
        // the cached side, re-emitted above on every render).
        if (!root.isConnected) return;
        const frame = space === "viewport"
          ? (typeof window === "undefined" ? 0 : window.innerWidth)
          : ((root.offsetParent as HTMLElement | null)?.clientWidth ?? 0);
        const width = labelNode.offsetWidth;
        if (frame <= 0 || width <= 0) return;
        const current = metricsSlot.get();
        if (current.frame === frame && current.label === width) return;
        metricsSlot.set({ frame, label: width });
        const next: "left" | "right" = x + CURSOR_LABEL_GAP + width > frame ? "left" : "right";
        labelNode.setAttribute("data-side", next);
        labelNode.setAttribute("style", cursorLabelStyle(color, next));
      });
    }
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
    "`items` is [{ id, label, icon?, badge?, href?, disabled? }]; an item with " +
    "`href` renders a real link (\"/reports\" targets a route, so middle-click " +
    "and copy-link work); `active` is the current id; `onChange(id)` fires on " +
    "tap. `pinned` (default true) sticks the bar to the bottom of its scroll " +
    "container; safe-area padding is always applied.",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, description: "[{ id, label, icon?, badge?, href?, disabled? }]" },
    { name: "active", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, description: "(id) => …" },
    { name: "pinned", type: "boolean", optional: true, description: "Stick to the bottom of the scroll container (default true)" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const active = asString(props.active);
    const pinned = asBoolean(props.pinned, true);
    // This is route navigation, not a tablist: there are no tabpanels to own,
    // and `role="tab"` advertised `aria-controls` + arrow-key semantics the bar
    // never implemented (while also destroying the <nav> landmark). Keep the
    // landmark and `aria-current="page"`, which is what a bottom nav actually is.
    const root = el("nav", {
      class: "rui-tabbar",
      "aria-label": "Primary",
      "data-pinned": pinned ? "true" : null,
      // Inline so pinning does not depend on a theme rule. `sticky` rather than
      // `fixed`: it survives the transformed / filtered ancestors the library
      // creates itself (`animate`, the glass theme's backdrop filters).
      style: pinned ? "position:sticky;bottom:0;z-index:var(--rui-z-sticky,100)" : null,
    });
    for (const it of items) {
      const rec = (it && typeof it === "object") ? it as Record<string, unknown> : {};
      const id = asString(rec.id ?? rec.label);
      const isActive = id === active && id !== "";
      const disabled = asBoolean(rec.disabled);
      const rawHref = asString(rec.href);
      // A root-relative target is a route: the hash router picks up the
      // resulting `#/path` from the browser's own navigation, so the anchor
      // needs no JS and stays middle-clickable.
      const href = disabled
        ? ""
        : rawHref.startsWith("/") ? `#${rawHref}` : sanitiseHref(rawHref, "");
      const tab = href
        ? el("a", {
          class: "rui-tabbar-item",
          href,
          "data-active": isActive ? "true" : null,
          "aria-current": isActive ? "page" : null,
          style: "text-decoration:none",
        })
        : el("button", {
          type: "button",
          class: "rui-tabbar-item",
          disabled,
          "data-active": isActive ? "true" : null,
          "aria-current": isActive ? "page" : null,
        });
      const icon = renderIcon(rec.icon, { className: "rui-tabbar-icon" });
      const badge = asString(rec.badge);
      // The badge used to live inside the `if (icon)` branch, so an item with
      // an unread count but no icon silently lost it. Give the badge a
      // positioning box even when no icon resolved.
      if (icon || badge) {
        const wrap = el("span", {
          class: "rui-tabbar-icon-wrap",
          style: icon ? null : "min-width:1em;min-height:1em;display:inline-block",
        });
        if (icon) wrap.append(icon);
        if (badge) wrap.append(el("span", { class: "rui-tabbar-badge" }, [badge]));
        tab.append(wrap);
      }
      const label = asString(rec.label);
      if (label) tab.append(el("span", { class: "rui-tabbar-label" }, [label]));
      // Links keep their default navigation; `onChange` still fires so authors
      // can mirror the selection into state.
      if (id && !disabled) tab.onclick = () => helpers.invoke(props.onChange, id);
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
    "is [{ id, name, price, qty, image?, max? }] — `max` caps the stepper at " +
    "available stock. `onQty(id, qty)` and `onRemove(id)` fire on interaction; " +
    "omit `onQty` for a read-only receipt view. `disabled` freezes every " +
    "control (e.g. while checkout submits), `loading` shows placeholder lines, " +
    "`error` renders a message above the lines. `currency` is an ISO code " +
    "(default USD).",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, description: "[{ id, name, price, qty, image?, max? }]" },
    { name: "onQty", type: "callable", optional: true, description: "(id, qty) => …" },
    { name: "onRemove", type: "callable", optional: true, description: "(id) => …" },
    { name: "currency", type: "string", optional: true },
    { name: "footer", type: "Node", optional: true, description: "Custom footer (e.g. a checkout button)" },
    { name: "disabled", type: "boolean", optional: true, aliases: ["busy"], description: "Freeze every stepper and remove button — use while a mutation or the checkout round-trip is outstanding" },
    { name: "loading", type: "boolean", optional: true, description: "Show placeholder lines while the cart hydrates (keeps scroll position)" },
    { name: "error", type: "string", optional: true, description: "Error message rendered above the lines (a failed quantity update, a stock conflict)" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const currency = asString(props.currency, "USD") || "USD";
    const disabled = asBoolean(props.disabled);
    const loading = asBoolean(props.loading);
    const error = asString(props.error);
    const canEditQty = typeof props.onQty === "function";
    const canRemove = typeof props.onRemove === "function";
    const fmt = (n: number): string => {
      try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); }
      // Don't imply dollars for an unknown code — show the code itself.
      catch { return `${n.toFixed(2)} ${currency}`; }
    };
    const root = el("div", {
      class: "rui-cart",
      "aria-busy": loading ? "true" : null,
      "data-disabled": disabled ? "true" : null,
    });
    if (error) root.append(el("div", { class: "rui-cart-error", role: "alert" }, [error]));
    if (loading) {
      // Placeholder rows keep the line rhythm so the list does not jump when
      // the real data lands. Reuses the Skeleton shimmer class.
      for (let i = 0; i < 3; i += 1) {
        const row = el("div", { class: "rui-cart-line", "aria-hidden": "true" });
        row.append(el("div", { class: "rui-skeleton-line", style: "width:48px;height:48px;flex-shrink:0" }));
        const body = el("div", { class: "rui-cart-body" });
        body.append(el("div", { class: "rui-skeleton-line", style: "height:12px;width:55%" }));
        body.append(el("div", { class: "rui-skeleton-line", style: "height:10px;width:30%;margin-top:6px" }));
        row.append(body);
        root.append(row);
      }
      return root;
    }
    // An empty cart returns early: the subtotal row (and a checkout `footer`)
    // under "Your cart is empty" reads as a half-loaded panel.
    if (items.length === 0) {
      root.append(el("div", { class: "rui-cart-empty" }, ["Your cart is empty"]));
      return root;
    }
    let subtotal = 0;
    for (const it of items) {
      const rec = (it && typeof it === "object") ? it as Record<string, unknown> : {};
      const id = asString(rec.id ?? rec.name);
      const name = asString(rec.name);
      const price = asNumber(rec.price, 0);
      const qty = Math.max(0, asNumber(rec.qty, 1));
      const max = rec.max == null ? Infinity : Math.max(0, asNumber(rec.max, Infinity));
      subtotal += price * qty;
      const row = el("div", { class: "rui-cart-line" });
      const image = sanitiseImageSrc(rec.image);
      if (image) row.append(el("img", { class: "rui-cart-thumb", src: image, alt: name, loading: "lazy" }));
      const body = el("div", { class: "rui-cart-body" });
      body.append(el("div", { class: "rui-cart-name" }, [name]));
      body.append(el("div", { class: "rui-cart-price" }, [fmt(price)]));
      row.append(body);
      // Quantity stepper. Without `onQty` there is nothing to change, so the
      // buttons are omitted rather than rendered as focusable, pointer-cursored
      // controls with a null handler (an order-summary / receipt view).
      const stepper = el("div", { class: "rui-cart-qty" });
      if (canEditQty && id) {
        const dec = el("button", {
          type: "button", class: "rui-cart-qty-btn", "aria-label": "Decrease quantity",
          disabled: disabled || qty <= 0,
        }, ["−"]);
        const inc = el("button", {
          type: "button", class: "rui-cart-qty-btn", "aria-label": "Increase quantity",
          disabled: disabled || qty >= max,
        }, ["+"]);
        const step = (event: Event, delta: number): void => {
          // Read the displayed quantity off the LIVE row (resolved from the
          // event, never a render-time capture): a second tap before the
          // author's async PATCH lands must send qty±2, not race two identical
          // payloads. The optimistic write keeps the next tap in step.
          const btn = (event.currentTarget ?? event.target) as HTMLElement | null;
          const cell = btn?.closest(".rui-cart-line")?.querySelector(".rui-cart-qty-value") ?? null;
          const shownText = asString(cell?.textContent).trim();
          const shown = shownText === "" ? NaN : Number(shownText);
          const base = Number.isFinite(shown) ? shown : qty;
          const next = Math.min(max, Math.max(0, base + delta));
          if (cell) cell.textContent = String(next);
          helpers.invoke(props.onQty, id, next);
        };
        dec.onclick = (event) => step(event, -1);
        inc.onclick = (event) => step(event, 1);
        stepper.append(dec, el("span", { class: "rui-cart-qty-value" }, [String(qty)]), inc);
      } else {
        stepper.append(el("span", { class: "rui-cart-qty-value" }, [`×${qty}`]));
      }
      row.append(stepper);
      row.append(el("div", { class: "rui-cart-line-total" }, [fmt(price * qty)]));
      if (canRemove && id) {
        const rm = el("button", {
          type: "button", class: "rui-cart-remove", "aria-label": `Remove ${name}`, disabled,
        });
        const icon = renderIcon("xmark", { className: "rui-cart-remove-icon" });
        if (icon) rm.append(icon); else rm.append(document.createTextNode("×"));
        // `invoke` contains a handler that throws or rejects; a raw call left
        // an async failure as an unhandled rejection no error surface sees.
        rm.onclick = () => helpers.invoke(props.onRemove, id);
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
