/**
 * Extra components (suggestions-global Parts VIII.2/3/4/8/9, IX.2).
 *
 * SVG escape, overlay sheets, social/content widgets, e-commerce extras,
 * and small utilities — all bounded + theme-aware.
 */

import type { ComponentSpec } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, sanitiseImageSrc, sanitiseHref,
} from "../utils.js";
import { dialogKeydownHandler, wireDialogFocus } from "./_internal.js";

/* ----------------------------------------------------------------------- *
 * Inline SVG (Part IX.2)
 * ----------------------------------------------------------------------- */

// Drop anything that could execute script when we set innerHTML on an <svg>.
const SVG_BLOCK_RE = /<script|<foreignObject|on\w+\s*=|javascript\s*:|<!ENTITY|<iframe|<embed|<object/i;
function sanitiseSvgInner(raw: string): string {
  if (!raw || raw.length > 32 * 1024) return "";
  if (SVG_BLOCK_RE.test(raw)) return "";
  return raw;
}
const VIEWBOX_RE = /^[\d.\s-]+$/;

export const Svg: ComponentSpec = {
  name: "Svg",
  description:
    "Render inline SVG markup safely (paths, shapes, gradients) — for brand " +
    "illustrations, custom icons, and data-viz overlays without the HTMLTag " +
    "escape hatch. Pass the inner markup (everything inside <svg>) plus a " +
    "`viewBox`. Script/event-handler payloads are stripped.",
  props: [
    { name: "content", type: "string", positional: true, required: true, aliases: ["paths", "markup"] },
    { name: "viewBox", type: "string", optional: true, description: "e.g. \"0 0 24 24\" (default)" },
    { name: "width", type: "string", optional: true },
    { name: "height", type: "string", optional: true },
    { name: "fill", type: "string", optional: true, description: "currentColor (default), none, or a token color" },
  ],
  render: (_node, props) => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "rui-svg");
    const vb = asString(props.viewBox, "0 0 24 24");
    svg.setAttribute("viewBox", VIEWBOX_RE.test(vb) ? vb : "0 0 24 24");
    const fill = asString(props.fill, "currentColor");
    svg.setAttribute("fill", /^[a-zA-Z#()0-9,.\s-]+$/.test(fill) ? fill : "currentColor");
    if (props.width) svg.setAttribute("width", asString(props.width).replace(/[^0-9a-z%.]/gi, ""));
    if (props.height) svg.setAttribute("height", asString(props.height).replace(/[^0-9a-z%.]/gi, ""));
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = sanitiseSvgInner(asString(props.content));
    return svg as unknown as HTMLElement;
  },
};

/* ----------------------------------------------------------------------- *
 * Overlay sheets / confirm (Part VIII.9)
 * ----------------------------------------------------------------------- */

export const Sheet: ComponentSpec = {
  name: "Sheet",
  description:
    "A panel that slides in from an edge over a dimmed backdrop. `side` is " +
    "left|right|top|bottom. Bind `open` to a $variable; `onClose` fires on " +
    "backdrop click / Escape. Use BottomSheet for the mobile bottom variant.",
  props: [
    { name: "children", type: "Node[]", positional: true, required: true, aliases: ["content"] },
    { name: "open", type: "boolean", optional: true },
    { name: "side", type: "string", optional: true, enum: ["left", "right", "top", "bottom"] },
    { name: "title", type: "string", optional: true },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"] },
  ],
  render: (node, props, helpers) => {
    const open = asBoolean(props.open);
    const root = el("div", { class: "rui-sheet-root", "data-open": open ? "true" : "false", "data-side": asString(props.side, "right") });
    const ref = node.argMeta?.find((m) => m?.stateRef)?.stateRef;
    const close = () => { if (ref) helpers.setState(ref, false); helpers.invoke(props.onClose); };
    const backdrop = el("div", { class: "rui-sheet-backdrop" });
    backdrop.onclick = close;
    const panel = el("div", { class: "rui-sheet-panel", role: "dialog", "aria-modal": "true", tabindex: "-1" });
    const title = asString(props.title);
    if (title) {
      const head = el("div", { class: "rui-sheet-head" });
      head.append(el("h3", { class: "rui-sheet-title", id: "rui-sheet-label" }, [title]));
      panel.setAttribute("aria-labelledby", "rui-sheet-label");
      const x = el("button", { class: "rui-sheet-close", type: "button", "aria-label": "Close" }) as HTMLButtonElement;
      const ic = renderIcon("xmark"); if (ic) x.append(ic);
      x.onclick = close;
      head.append(x);
      panel.append(head);
    }
    const body = el("div", { class: "rui-sheet-body" });
    for (const c of asArray(props.children)) body.append(helpers.renderNode(c));
    panel.append(body);
    root.append(backdrop, panel);
    // Escape-to-close + Tab focus trap + focus restore (VIII.9 / X.3).
    root.onkeydown = dialogKeydownHandler(".rui-sheet-panel", () => close());
    wireDialogFocus(root, ".rui-sheet-panel", helpers);
    return root;
  },
};

export const BottomSheet: ComponentSpec = {
  name: "BottomSheet",
  description: "A mobile bottom sheet — Sheet pinned to the bottom edge with a drag handle. Bind `open`; `onClose` on dismiss.",
  props: [
    { name: "children", type: "Node[]", positional: true, required: true, aliases: ["content"] },
    { name: "open", type: "boolean", optional: true },
    { name: "title", type: "string", optional: true },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"] },
  ],
  render: (node, props, helpers) => {
    const open = asBoolean(props.open);
    const root = el("div", { class: "rui-sheet-root rui-bottomsheet", "data-open": open ? "true" : "false", "data-side": "bottom" });
    const ref = node.argMeta?.find((m) => m?.stateRef)?.stateRef;
    const close = () => { if (ref) helpers.setState(ref, false); helpers.invoke(props.onClose); };
    const backdrop = el("div", { class: "rui-sheet-backdrop" });
    backdrop.onclick = close;
    const panel = el("div", { class: "rui-sheet-panel", role: "dialog", "aria-modal": "true", tabindex: "-1" });
    panel.append(el("div", { class: "rui-bottomsheet-grip", "aria-hidden": "true" }));
    const title = asString(props.title);
    if (title) panel.append(el("h3", { class: "rui-sheet-title" }, [title]));
    const body = el("div", { class: "rui-sheet-body" });
    for (const c of asArray(props.children)) body.append(helpers.renderNode(c));
    panel.append(body);
    root.append(backdrop, panel);
    root.onkeydown = dialogKeydownHandler(".rui-sheet-panel", () => close());
    wireDialogFocus(root, ".rui-sheet-panel", helpers);
    return root;
  },
};

export const ConfirmDialog: ComponentSpec = {
  name: "ConfirmDialog",
  description:
    "A confirm/cancel modal dialog. Bind `open` to a $variable; `onConfirm` " +
    "fires on accept, `onCancel`/backdrop on dismiss. `tone` colors the " +
    "confirm button (danger for destructive actions).",
  props: [
    { name: "title", type: "string", positional: true, required: true },
    { name: "open", type: "boolean", optional: true },
    { name: "message", type: "string", optional: true, aliases: ["body"] },
    { name: "confirmLabel", type: "string", optional: true },
    { name: "cancelLabel", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, enum: ["primary", "danger", "warning"] },
    { name: "onConfirm", type: "callable", optional: true },
    { name: "onCancel", type: "callable", optional: true },
  ],
  render: (node, props, helpers) => {
    const open = asBoolean(props.open);
    const root = el("div", { class: "rui-confirm-root", "data-open": open ? "true" : "false" });
    const ref = node.argMeta?.find((m) => m?.stateRef)?.stateRef;
    const dismiss = () => { if (ref) helpers.setState(ref, false); };
    const backdrop = el("div", { class: "rui-confirm-backdrop" });
    backdrop.onclick = () => { helpers.invoke(props.onCancel); dismiss(); };
    const card = el("div", { class: "rui-confirm-card", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "rui-confirm-label", tabindex: "-1" });
    card.append(el("h3", { class: "rui-confirm-title", id: "rui-confirm-label" }, [asString(props.title)]));
    const msg = asString(props.message);
    if (msg) card.append(el("p", { class: "rui-confirm-message" }, [msg]));
    const actions = el("div", { class: "rui-confirm-actions" });
    const cancel = el("button", { class: "rui-confirm-cancel", type: "button" }, [asString(props.cancelLabel, "Cancel")]) as HTMLButtonElement;
    cancel.onclick = () => { helpers.invoke(props.onCancel); dismiss(); };
    const confirm = el("button", { class: "rui-confirm-ok", type: "button", "data-tone": asString(props.tone, "primary") }, [asString(props.confirmLabel, "Confirm")]) as HTMLButtonElement;
    confirm.onclick = () => { helpers.invoke(props.onConfirm); dismiss(); };
    actions.append(cancel, confirm);
    card.append(actions);
    root.append(backdrop, card);
    // Escape = cancel; Tab cycles between Cancel/Confirm; focus restores on close.
    root.onkeydown = dialogKeydownHandler(".rui-confirm-card", () => { helpers.invoke(props.onCancel); dismiss(); });
    wireDialogFocus(root, ".rui-confirm-card", helpers);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Social / content (Part VIII.3/4)
 * ----------------------------------------------------------------------- */

export const PresenceAvatars: ComponentSpec = {
  name: "PresenceAvatars",
  description: "An overlapping stack of avatars with online status dots — 'who's here' for collab/social. Pass `people` as {name, src?, online?}.",
  props: [
    { name: "people", type: "object[]", positional: true, required: true, aliases: ["users", "children"] },
    { name: "max", type: "number", optional: true, description: "Max avatars before a +N chip (default 5)" },
  ],
  render: (_node, props) => {
    const people = asArray<unknown>(props.people);
    const max = Math.max(1, Math.round(asNumber(props.max, 5)));
    const root = el("div", { class: "rui-presence" });
    people.slice(0, max).forEach((raw) => {
      const p = (raw ?? {}) as { name?: unknown; src?: unknown; online?: unknown };
      const av = el("div", { class: "rui-presence-avatar", "data-online": asBoolean(p.online) ? "true" : null, title: asString(p.name) });
      const src = sanitiseImageSrc(p.src);
      if (src) av.append(el("img", { src, alt: asString(p.name) }));
      else av.append(el("span", { class: "rui-presence-initials" }, [asString(p.name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")]));
      root.append(av);
    });
    if (people.length > max) root.append(el("div", { class: "rui-presence-more" }, [`+${people.length - max}`]));
    return root;
  },
};

export const ShareButtons: ComponentSpec = {
  name: "ShareButtons",
  description: "A row of social share buttons (twitter|facebook|linkedin|reddit|email) plus a copy-link button, for the given `url`/`title`.",
  props: [
    { name: "url", type: "string", positional: true, required: true },
    { name: "title", type: "string", optional: true },
    { name: "networks", type: "string[]", optional: true, description: "Which to show (default twitter, facebook, linkedin, copy)" },
  ],
  render: (_node, props) => {
    const url = sanitiseHref(props.url, "");
    const title = asString(props.title);
    const eu = encodeURIComponent(url), et = encodeURIComponent(title);
    const networks = asArray<unknown>(props.networks).map((n) => asString(n));
    const list = networks.length > 0 ? networks : ["twitter", "facebook", "linkedin", "copy"];
    const targets: Record<string, { icon: string; href: string }> = {
      twitter: { icon: "brands:x-twitter", href: `https://twitter.com/intent/tweet?url=${eu}&text=${et}` },
      facebook: { icon: "brands:facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${eu}` },
      linkedin: { icon: "brands:linkedin", href: `https://www.linkedin.com/sharing/share-offsite/?url=${eu}` },
      reddit: { icon: "brands:reddit", href: `https://www.reddit.com/submit?url=${eu}&title=${et}` },
      email: { icon: "envelope", href: `mailto:?subject=${et}&body=${eu}` },
    };
    const root = el("div", { class: "rui-share" });
    for (const net of list) {
      if (net === "copy") {
        const btn = el("button", { class: "rui-share-btn", type: "button", "aria-label": "Copy link", title: "Copy link" }) as HTMLButtonElement;
        const ic = renderIcon("link"); if (ic) btn.append(ic);
        btn.onclick = () => { try { navigator.clipboard?.writeText(url); } catch { /* ignore */ } };
        root.append(btn);
        continue;
      }
      const t = targets[net];
      if (!t) continue;
      const a = el("a", { class: "rui-share-btn", href: t.href, target: "_blank", rel: "noopener noreferrer", "aria-label": `Share on ${net}` });
      const ic = renderIcon(t.icon); if (ic) a.append(ic);
      root.append(a);
    }
    return root;
  },
};

export const AuthorByline: ComponentSpec = {
  name: "AuthorByline",
  description: "An author byline: avatar, name, optional role and date — for articles/blog posts.",
  props: [
    { name: "name", type: "string", positional: true, required: true },
    { name: "avatar", type: "string", optional: true, aliases: ["src"] },
    { name: "role", type: "string", optional: true },
    { name: "date", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-byline" });
    const src = sanitiseImageSrc(props.avatar);
    const av = el("div", { class: "rui-byline-avatar" });
    if (src) av.append(el("img", { src, alt: asString(props.name) }));
    else av.append(el("span", {}, [asString(props.name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")]));
    root.append(av);
    const meta = el("div", { class: "rui-byline-meta" });
    meta.append(el("div", { class: "rui-byline-name" }, [asString(props.name)]));
    const sub = [asString(props.role), asString(props.date)].filter(Boolean).join(" · ");
    if (sub) meta.append(el("div", { class: "rui-byline-sub" }, [sub]));
    root.append(meta);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * E-commerce extras (Part VIII.2)
 * ----------------------------------------------------------------------- */

export const VariantSelector: ComponentSpec = {
  name: "VariantSelector",
  description:
    "Product variant picker — color swatches or size pills. `options` is an " +
    "array of strings or {label, value, color?}. Bind `value` to a $variable; " +
    "`onChange(value)` fires on select.",
  props: [
    { name: "options", type: "any[]", positional: true, required: true, aliases: ["items"] },
    { name: "value", type: "string", optional: true },
    { name: "kind", type: "string", optional: true, enum: ["pill", "swatch"] },
    { name: "label", type: "string", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"] },
  ],
  render: (node, props, helpers) => {
    const kind = asString(props.kind, "pill");
    const root = el("div", { class: "rui-variants", "data-kind": kind });
    const label = asString(props.label);
    if (label) root.append(el("div", { class: "rui-variants-label" }, [label]));
    const row = el("div", { class: "rui-variants-row" });
    const current = asString(props.value);
    const ref = node.argMeta?.find((m) => m?.stateRef)?.stateRef;
    for (const raw of asArray<unknown>(props.options)) {
      const opt = (raw && typeof raw === "object") ? raw as { label?: unknown; value?: unknown; color?: unknown } : { label: raw, value: raw };
      const value = asString(opt.value ?? opt.label);
      const selected = value === current;
      const btn = el("button", { class: "rui-variant", type: "button", "aria-pressed": selected ? "true" : "false", "data-selected": selected ? "true" : null }) as HTMLButtonElement;
      if (kind === "swatch") {
        const color = asString(opt.color ?? opt.value);
        btn.style.background = /^[a-zA-Z#()0-9,.\s-]+$/.test(color) ? color : "var(--rui-color-surface-muted)";
        btn.title = asString(opt.label ?? opt.value);
      } else {
        btn.textContent = asString(opt.label ?? opt.value);
      }
      btn.onclick = () => { if (ref) helpers.setState(ref, value); helpers.invoke(props.onChange, value); };
      row.append(btn);
    }
    root.append(row);
    return root;
  },
};

export const OrderSummary: ComponentSpec = {
  name: "OrderSummary",
  description:
    "An order/cart summary: line items, subtotal, shipping, tax, and a bold " +
    "total. Pass `items` as {label, amount} and the named totals; `currency` " +
    "prefixes amounts.",
  props: [
    { name: "items", type: "object[]", positional: true, required: true, aliases: ["lines"] },
    { name: "subtotal", type: "string | number", optional: true },
    { name: "shipping", type: "string | number", optional: true },
    { name: "tax", type: "string | number", optional: true },
    { name: "total", type: "string | number", optional: true },
    { name: "currency", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const cur = asString(props.currency, "$");
    const money = (v: unknown) => (v == null || asString(v) === "" ? "" : `${cur}${asString(v)}`);
    const root = el("div", { class: "rui-order-summary" });
    const lines = el("div", { class: "rui-order-lines" });
    for (const raw of asArray<unknown>(props.items)) {
      const it = (raw ?? {}) as { label?: unknown; amount?: unknown };
      const line = el("div", { class: "rui-order-line" });
      line.append(el("span", {}, [asString(it.label)]), el("span", {}, [money(it.amount)]));
      lines.append(line);
    }
    root.append(lines);
    const row = (label: string, v: unknown, strong = false) => {
      if (v == null || asString(v) === "") return;
      const r = el("div", { class: strong ? "rui-order-total" : "rui-order-sub" });
      r.append(el("span", {}, [label]), el("span", {}, [money(v)]));
      root.append(r);
    };
    row("Subtotal", props.subtotal);
    row("Shipping", props.shipping);
    row("Tax", props.tax);
    row("Total", props.total, true);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Utility (Part VIII.8)
 * ----------------------------------------------------------------------- */

export const ScrollSpy: ComponentSpec = {
  name: "ScrollSpy",
  description:
    "A sticky in-page nav that highlights the section currently in view. " +
    "`sections` is an array of {label, id} matching element ids on the page " +
    "(set via the universal `id` prop). Clicking smooth-scrolls to a section.",
  props: [
    { name: "sections", type: "object[]", positional: true, required: true, aliases: ["items"] },
    { name: "title", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("nav", { class: "rui-scrollspy", "aria-label": "On this page" });
    const title = asString(props.title);
    if (title) root.append(el("div", { class: "rui-scrollspy-title" }, [title]));
    const list = el("ul", { class: "rui-scrollspy-list" });
    const sections = asArray<unknown>(props.sections).map((raw) => {
      const s = (raw ?? {}) as { label?: unknown; id?: unknown };
      return { label: asString(s.label), id: asString(s.id).replace(/[^A-Za-z0-9_-]/g, "") };
    }).filter((s) => s.id);
    const links = new Map<string, HTMLElement>();
    for (const s of sections) {
      const li = el("li", { class: "rui-scrollspy-item" });
      const a = el("a", { href: `#${s.id}` }, [s.label]);
      a.onclick = (e) => {
        e.preventDefault();
        const root2 = (a.getRootNode() as ShadowRoot);
        const target = root2?.getElementById?.(s.id) ?? document.getElementById(s.id);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      li.append(a);
      list.append(li);
      links.set(s.id, a);
    }
    root.append(list);
    if (typeof IntersectionObserver !== "undefined") {
      setTimeout(() => {
        const sr = root.getRootNode() as ShadowRoot | Document;
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              links.forEach((l) => l.classList.remove("is-active"));
              const id = (e.target as HTMLElement).id;
              links.get(id)?.classList.add("is-active");
            }
          }
        }, { rootMargin: "0px 0px -70% 0px", threshold: 0 });
        for (const s of sections) {
          const target = (sr as ShadowRoot).getElementById?.(s.id) ?? document.getElementById(s.id);
          if (target) io.observe(target);
        }
        // Keyed so a re-render replaces the previous observer instead of
        // stacking one per render (anonymous disposers only run on unmount).
        helpers.registerDisposer(() => io.disconnect(), "rui-scrollspy-io");
      }, 0);
    }
    return root;
  },
};

export const SpeedDial: ComponentSpec = {
  name: "SpeedDial",
  description: "A floating action button that expands a stack of mini-actions on click. Pass `actions` as {icon, label, onClick}.",
  props: [
    { name: "actions", type: "object[]", positional: true, required: true, aliases: ["items"] },
    { name: "icon", type: "string", optional: true, description: "Main FAB icon (default 'plus')" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-speeddial" });
    const menu = el("div", { class: "rui-speeddial-menu" });
    for (const raw of asArray<unknown>(props.actions)) {
      const a = (raw ?? {}) as { icon?: unknown; label?: unknown; onClick?: unknown; action?: unknown };
      const btn = el("button", { class: "rui-speeddial-action", type: "button", title: asString(a.label), "aria-label": asString(a.label) }) as HTMLButtonElement;
      const ic = renderIcon(a.icon ?? "circle"); if (ic) btn.append(ic);
      // Resolve the live root via `currentTarget` — the closure's `root` is
      // detached once the morph reconciler keeps a prior render's DOM.
      btn.onclick = (event: Event) => {
        helpers.invoke(a.onClick ?? a.action);
        const live = ((event.currentTarget ?? event.target) as HTMLElement | null)?.closest(".rui-speeddial") ?? root;
        live.classList.remove("is-open");
      };
      menu.append(btn);
    }
    root.append(menu);
    const fab = el("button", { class: "rui-speeddial-fab", type: "button", "aria-label": "Actions", "aria-expanded": "false" }) as HTMLButtonElement;
    const ic = renderIcon(props.icon ?? "plus", { size: "lg" }); if (ic) fab.append(ic);
    fab.onclick = (event: Event) => {
      const liveFab = ((event.currentTarget ?? event.target) as HTMLElement | null) ?? fab;
      const live = liveFab.closest(".rui-speeddial") ?? root;
      const open = live.classList.toggle("is-open");
      liveFab.setAttribute("aria-expanded", open ? "true" : "false");
    };
    root.append(fab);
    return root;
  },
};

export const Confetti: ComponentSpec = {
  name: "Confetti",
  description:
    "A one-shot confetti burst — celebration affordance after a success " +
    "(checkout, completion). Renders a short CSS particle animation when " +
    "`fire` is true. Honours prefers-reduced-motion.",
  props: [
    { name: "fire", type: "boolean", optional: true, description: "Trigger the burst (default true)" },
    { name: "count", type: "number", optional: true, description: "Particle count (default 40, max 120)" },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-confetti", "aria-hidden": "true" });
    const fire = props.fire === undefined ? true : asBoolean(props.fire);
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fire || reduce) return root;
    const count = Math.max(1, Math.min(120, Math.round(asNumber(props.count, 40))));
    const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#22d3ee", "#10b981", "#f59e0b"];
    for (let i = 0; i < count; i += 1) {
      const left = Math.round((i * 53 + 7) % 100);
      const delay = ((i * 17) % 50) / 100;
      const dur = 1 + ((i * 7) % 10) / 10;
      const color = colors[i % colors.length]!;
      const rot = (i * 47) % 360;
      const piece = el("span", {
        class: "rui-confetti-piece",
        style: `left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;transform:rotate(${rot}deg)`,
      });
      // One-shot burst: each piece removes itself when its fall finishes so
      // repeated celebrations never accumulate DOM (morph-safe — property
      // handler resolves the live node from the event).
      piece.onanimationend = (event: Event) => {
        ((event.currentTarget ?? event.target) as HTMLElement | null)?.remove();
      };
      root.append(piece);
    }
    return root;
  },
};

export const KbdShortcut: ComponentSpec = {
  name: "KbdShortcut",
  description: "Render a keyboard shortcut as styled key caps. Pass `keys` as an array (e.g. [\"Cmd\", \"K\"]) or a '+'-joined string.",
  props: [{ name: "keys", type: "string | string[]", positional: true, required: true }],
  render: (_node, props) => {
    const raw = props.keys;
    const keys = Array.isArray(raw) ? raw.map((k) => asString(k)) : asString(raw).split("+").map((k) => k.trim()).filter(Boolean);
    const root = el("span", { class: "rui-kbd-shortcut" });
    keys.forEach((k, i) => {
      if (i > 0) root.append(el("span", { class: "rui-kbd-plus" }, ["+"]));
      root.append(el("kbd", { class: "rui-kbd-key" }, [k]));
    });
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Lottie — vector animation player (III.8)
 * ----------------------------------------------------------------------- */

interface LottieGlobal {
  loadAnimation: (params: Record<string, unknown>) => { destroy?: () => void; setSpeed?: (n: number) => void };
}

export const Lottie: ComponentSpec = {
  name: "Lottie",
  description:
    "Plays a Lottie/Bodymovin vector animation from `src` (a .json URL) or " +
    "inline `data`. Uses the `lottie-web` library when it is present on the " +
    "page (`window.lottie`); otherwise shows the `fallback` (or a poster " +
    "image) so the layout never breaks. `loop`/`autoplay` default true; " +
    "`speed` scales playback. No dependency is bundled.",
  props: [
    { name: "src", type: "string", optional: true, description: "URL to a Lottie JSON file" },
    { name: "data", type: "object", optional: true, description: "Inline Lottie animation data" },
    { name: "loop", type: "boolean", optional: true },
    { name: "autoplay", type: "boolean", optional: true },
    { name: "speed", type: "number", optional: true },
    { name: "width", type: "string", optional: true },
    { name: "height", type: "string", optional: true },
    { name: "poster", type: "string", optional: true, description: "Image shown when lottie-web is unavailable" },
    { name: "fallback", type: "Node", optional: true, description: "Node shown when lottie-web is unavailable and no poster" },
  ],
  render: (_node, props, helpers) => {
    const width = asString(props.width, "200px");
    const height = asString(props.height, "200px");
    const root = el("div", {
      class: "rui-lottie",
      style: `width:${width};height:${height}`,
    });
    const lottie = (typeof window !== "undefined" ? (window as unknown as { lottie?: LottieGlobal }).lottie : null);
    const data = props.data && typeof props.data === "object" ? props.data : null;
    const src = sanitiseImageSrc(props.src);

    if (!lottie || (!data && !src)) {
      // Graceful fallback: poster image or the fallback slot.
      const poster = sanitiseImageSrc(props.poster);
      if (poster) {
        root.append(el("img", { src: poster, alt: "animation", class: "rui-lottie-poster", style: "width:100%;height:100%;object-fit:contain" }));
      } else if (props.fallback != null) {
        root.append(helpers.renderNode(props.fallback));
      } else {
        root.classList.add("rui-lottie-empty");
      }
      return root;
    }

    setTimeout(() => {
      try {
        const anim = lottie.loadAnimation({
          container: root,
          renderer: "svg",
          loop: props.loop === undefined ? true : asBoolean(props.loop),
          autoplay: props.autoplay === undefined ? true : asBoolean(props.autoplay),
          ...(data ? { animationData: data } : { path: src }),
        });
        const speed = asNumber(props.speed, 1);
        if (speed !== 1 && typeof anim.setSpeed === "function") anim.setSpeed(speed);
        helpers.registerDisposer(() => { try { anim.destroy?.(); } catch { /* noop */ } }, "rui-lottie");
      } catch {
        root.classList.add("rui-lottie-empty");
      }
    }, 0);
    return root;
  },
};
