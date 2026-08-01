/**
 * Rich, opinionated layout patterns the LLM can reach for in a single line.
 *
 * Each component packs an entire UI idiom (hero, page header, empty state,
 * timeline, kanban board, …) into a small, predictable signature. The goal is
 * to let the LLM emit beautiful, dense UI without composing dozens of nested
 * primitives — the components below handle the visual hierarchy internally.
 *
 * Everything here is presentational: state binding is delegated to the
 * primitives the patterns embed (Button, Card, etc.), so the patterns stay
 * stateless and composable.
 */

import type { ComponentSpec, RenderHelpers } from "../types.js";
import type { ComponentNode } from "../../runtime/evaluator.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon, isComponentNode,
  sanitiseCssLength, sanitiseCssUrl, sanitiseImageSrc, sanitiseHref,
} from "../utils.js";
import { renderAvatar, pickIconForLabel, pickIconForTone, dialogKeydownHandler } from "./_internal.js";
import { deferToPaint } from "../floating.js";
import { SearchBar } from "./forms.js";
import { Grid } from "./layout.js";

const SURFACE_TONES = ["default", "primary", "success", "warning", "danger", "info"] as const;

/** Focusable descendants used when moving focus into a freshly-opened drawer. */
const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

const renderActionsRow = (
  raw: unknown,
  helpers: { renderNode: (n: unknown) => Node },
): HTMLElement | null => {
  const items = asArray<unknown>(raw);
  if (items.length === 0) return null;
  const row = el("div", { class: "rui-pattern-actions" });
  for (const item of items) row.append(helpers.renderNode(item));
  return row;
};

/**
 * Resolve an element from an event, never from a variable captured at render
 * time: the morph reconciler keeps the LIVE node and discards the snapshot the
 * handler closed over, so a captured reference is usually detached.
 */
const closestFrom = (target: EventTarget | null, selector: string): HTMLElement | null => {
  const node = target instanceof Element ? target : null;
  return (node?.closest(selector) as HTMLElement | null) ?? null;
};

/**
 * Router-friendly `href` for a path prop. The runtime router is hash-based, so
 * `/orders` becomes `#/orders` — that is what gives an in-app nav item its
 * native affordances (middle-click, Cmd+click, "Copy link address", status-bar
 * preview) instead of a `<button>` that can only ever handle a plain click.
 */
const routeHref = (path: string): string => "#" + (path.startsWith("/") ? path : "/" + path);

/**
 * Read the sub-object shape some props accept alongside a bare string
 * (`{label, to}` breadcrumbs, `{label, included}` pricing features). Component
 * nodes are NOT records — they must go through `renderNode`.
 */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !isComponentNode(value)
    ? (value as Record<string, unknown>)
    : null;

/** Keyboard activation for a non-button element carrying a click handler. */
const activateOnKey = (invoke: () => void) => (event: KeyboardEvent): void => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  invoke();
};

/**
 * Pick a short eyebrow tag for a Hero based on intent keywords in its title
 * or subtitle. Returns the empty string when no rule matches so the caller
 * can decide whether to render the band at all.
 */
const HERO_EYEBROW_RULES: Array<{ match: RegExp; label: string }> = [
  { match: /\bbeta\b/i, label: "Beta" },
  { match: /\b(early\s?access|preview)\b/i, label: "Preview" },
  { match: /\b(introduc(?:ing|e)|launch(?:ed|ing)?|announcing)\b/i, label: "Introducing" },
  { match: /\b(welcome\b|get(?:ting)?\s?started)/i, label: "Welcome" },
  { match: /\b(new\b|whats\s?new|now\b)/i, label: "What's new" },
  { match: /\bfree\b/i, label: "Free trial" },
  { match: /\bupgrade\b/i, label: "Upgrade" },
  { match: /\b(sale|discount|deal)\b/i, label: "Limited time" },
];

function deriveHeroEyebrow(title: string, subtitle: string): string {
  const haystack = `${title} ${subtitle}`.trim();
  if (!haystack) return "";
  for (const rule of HERO_EYEBROW_RULES) {
    if (rule.match.test(haystack)) return rule.label;
  }
  return "";
}

/** Alpha of the darkening scrim a cover hero paints over its image. */
const COVER_OVERLAY_DEFAULT = 0.62;

/**
 * Cover scrim strength as a 0–1 alpha. `0.4` and `40` both mean "40%" so
 * either spelling works, and a hero over a pastel photo can dial the scrim
 * down (or off, with `0`) — `sx` cannot reach `background-image`, which the
 * render owns.
 */
function resolveOverlay(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return COVER_OVERLAY_DEFAULT;
  const value = asNumber(raw, COVER_OVERLAY_DEFAULT);
  if (!Number.isFinite(value)) return COVER_OVERLAY_DEFAULT;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

/**
 * Highlight pills, shared by both Hero layouts. `layout="cover"` used to drop
 * the prop silently even though the pill treatment reads fine over the scrim.
 */
function renderHeroHighlights(raw: unknown, layout: "default" | "cover"): HTMLElement | null {
  const highlights = asArray<unknown>(raw);
  if (highlights.length === 0) return null;
  const isCover = layout === "cover";
  const tags = el("div", {
    class: isCover ? "rui-hero-highlights rui-cover-highlights" : "rui-hero-highlights",
  });
  let rendered = 0;
  for (const h of highlights) {
    const label = asString(h);
    if (!label) continue;
    rendered += 1;
    tags.append(el("span", {
      class: isCover ? "rui-hero-highlight rui-cover-highlight" : "rui-hero-highlight",
    }, [label]));
  }
  return rendered > 0 ? tags : null;
}

export const Hero: ComponentSpec = {
  name: "Hero",
  description:
    "Eye-catching landing/marketing header with eyebrow tag, title, subtitle, " +
    "optional bullet highlights, and primary/secondary CTA buttons. Use " +
    "`layout=\"cover\"` with `imageSrc` for an image-backed hero band " +
    "(pass `height`, optional `caption`, and `overlay` to tune the scrim). " +
    "Default layout shows an optional side illustration. `align=\"center\"` " +
    "centers the text block.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
    { name: "primary", type: "Button", optional: true, description: "Primary CTA — pass a Button(...)" },
    { name: "secondary", type: "Button", optional: true, description: "Secondary CTA — pass a Button(...)" },
    { name: "eyebrow", type: "string", optional: true, description: "Short uppercase tag above the title" },
    { name: "highlights", type: "string[]", optional: true, description: "Bullet items rendered as tag pills" },
    { name: "imageSrc", type: "string", optional: true, description: "Illustration or cover background when layout=cover" },
    { name: "caption", type: "string", optional: true, description: "Small caption above CTAs (cover layout)" },
    { name: "height", type: "string", optional: true, description: "Min-height for cover layout (default 280px)" },
    { name: "actions", type: "Node[]", optional: true, description: "CTA row (cover layout; alternative to primary/secondary)" },
    { name: "layout", type: "string", optional: true, enum: ["default", "cover"], description: "default = text-first; cover = image-backed band" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: SURFACE_TONES, description: "Accent tone" },
    { name: "overlay", type: "string | number", optional: true, description: "Cover scrim strength — 0–1 alpha or 0–100 percent (default 0.62). Use a low value over a light photo, `0` for none." },
    { name: "align", type: "string", optional: true, enum: ["start", "center"], description: "Text alignment inside the band (default start)" },
  ],
  render: (_node, props, helpers) => {
    const layout = asString(props.layout, "default");
    const heroTitle = asString(props.title);
    const heroSubtitle = asString(props.subtitle);
    const explicitEyebrow = asString(props.eyebrow);
    const eyebrow = explicitEyebrow || deriveHeroEyebrow(heroTitle, heroSubtitle);
    const tone = asString(props.tone, "primary");
    const align = asString(props.align, "start");

    if (layout === "cover") {
      const safeImageSrc = sanitiseCssUrl(asString(props.imageSrc));
      const safeHeight = sanitiseCssLength(asString(props.height), "280px");
      // Only emit layers we actually have. `url("")` resolves against the base
      // URL, so an omitted `imageSrc` made the browser fetch the host document
      // on every render and fail to decode it as an image.
      const overlay = resolveOverlay(props.overlay);
      const layers: string[] = [];
      if (overlay > 0) {
        const top = (overlay * 0.08).toFixed(3);
        layers.push(`linear-gradient(180deg, rgba(15, 23, 42, ${top}) 0%, rgba(15, 23, 42, ${overlay.toFixed(3)}) 100%)`);
      }
      if (safeImageSrc) layers.push(`url("${safeImageSrc}")`);
      const root = el("section", {
        class: "rui-cover",
        "data-tone": tone,
        "data-align": align,
        style: `${layers.length > 0 ? `background-image:${layers.join(", ")};` : ""}min-height:${safeHeight};`,
      });
      const body = el("div", { class: "rui-cover-body" });
      if (eyebrow) body.append(el("span", { class: "rui-cover-eyebrow" }, [eyebrow]));
      body.append(el("h1", { class: "rui-cover-title" }, [heroTitle]));
      if (heroSubtitle) body.append(el("p", { class: "rui-cover-subtitle" }, [heroSubtitle]));
      const coverHighlights = renderHeroHighlights(props.highlights, "cover");
      if (coverHighlights) body.append(coverHighlights);
      const caption = asString(props.caption);
      if (caption) body.append(el("p", { class: "rui-cover-caption" }, [caption]));
      const actions = renderActionsRow(props.actions, helpers);
      if (actions) {
        actions.classList.add("rui-cover-actions");
        body.append(actions);
      } else {
        const ctaItems = [props.primary, props.secondary].filter(Boolean);
        if (ctaItems.length > 0) {
          const ctas = el("div", { class: "rui-cover-actions rui-pattern-actions" });
          for (const cta of ctaItems) ctas.append(helpers.renderNode(cta));
          body.append(ctas);
        }
      }
      root.append(body);
      return root;
    }

    const heroImageSrc = sanitiseImageSrc(props.imageSrc);
    const root = el("section", {
      class: "rui-hero",
      "data-tone": tone,
      "data-align": align,
      "data-has-image": heroImageSrc ? "true" : "false",
    });
    const body = el("div", { class: "rui-hero-body" });
    if (eyebrow) body.append(el("span", { class: "rui-hero-eyebrow" }, [eyebrow]));
    body.append(el("h1", { class: "rui-hero-title" }, [heroTitle]));
    if (heroSubtitle) body.append(el("p", { class: "rui-hero-subtitle" }, [heroSubtitle]));
    const highlights = renderHeroHighlights(props.highlights, "default");
    if (highlights) body.append(highlights);
    const ctaItems = [props.primary, props.secondary].filter(Boolean);
    if (ctaItems.length > 0) {
      const ctas = el("div", { class: "rui-hero-ctas" });
      for (const cta of ctaItems) ctas.append(helpers.renderNode(cta));
      body.append(ctas);
    }
    root.append(body);
    if (heroImageSrc) {
      const media = el("div", { class: "rui-hero-media" });
      media.append(el("img", { src: heroImageSrc, alt: "", loading: "lazy" }));
      root.append(media);
    }
    return root;
  },
};

/**
 * One breadcrumb of an auto-derived or author-supplied trail.
 *
 * A trail nobody can click is decoration, so a crumb carrying a `to` path (or
 * a page-level `onCrumbClick`) renders as a real anchor: modified clicks stay
 * with the browser, plain clicks go through the router. The leaf crumb is the
 * current page and stays inert.
 */
function renderCrumb(
  raw: unknown,
  index: number,
  isLast: boolean,
  onCrumbClick: unknown,
  helpers: RenderHelpers,
): HTMLElement {
  const record = asRecord(raw);
  const label = asString(record ? (record.label ?? record.title) : raw);
  const to = asString(record ? (record.to ?? record.href ?? record.path) : "");
  const interactive = !isLast && (to !== "" || typeof onCrumbClick === "function");
  if (!interactive) {
    return el("span", {
      class: "rui-page-header-crumb",
      "aria-current": isLast ? "page" : null,
    }, [label]);
  }
  const path = to ? (to.startsWith("/") ? to : "/" + to) : "";
  const anchor = el("a", {
    class: "rui-page-header-crumb",
    href: path ? routeHref(path) : "#",
  }, [label]);
  anchor.onclick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (path) helpers.router.navigate(path);
    helpers.invoke(onCrumbClick, label, index);
  };
  return anchor;
}

export const PageHeader: ComponentSpec = {
  name: "PageHeader",
  description:
    "Page-level header with breadcrumbs, title, subtitle, status tag, and a " +
    "right-aligned actions row. The canonical first child for any dashboard, " +
    "settings, or detail page — replaces ad-hoc Stack+Header+Buttons stitching. " +
    "If `breadcrumbs` is omitted the component auto-derives `[\"Home\", title]` " +
    "so the page never lacks a trail. Pass `breadcrumbs=false` to opt out.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
    { name: "breadcrumbs", type: "string[] | {label, to}[] | Breadcrumb | false", optional: true, description: "Array of strings or `{label, to}` objects (a `to` path renders a router link), a Breadcrumb(...) node, or `false` to suppress the auto-derived trail" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / NavLinks shown on the right" },
    { name: "status", type: "Badge", optional: true, aliases: ["badge"], description: "Optional Badge(...) rendered next to the title" },
    { name: "onCrumbClick", type: "callable", optional: true, description: "Called with (label, index) when a breadcrumb is clicked — makes string crumbs interactive" },
  ],
  render: (_node, props, helpers) => {
    const root = el("header", { class: "rui-page-header" });

    const title = asString(props.title);
    // Default: auto-derive ["Home", title] when caller omits breadcrumbs.
    // Pass `breadcrumbs=false` to suppress (handy for sign-in screens).
    let crumbs: unknown = props.breadcrumbs;
    if (crumbs === undefined || crumbs === null) {
      if (title) crumbs = ["Home", title];
    } else if (crumbs === false || crumbs === "false") {
      crumbs = null;
    }

    if (crumbs) {
      // A landmark with a name so the trail can be skipped/found, separators
      // hidden from the accessible name ("Home slash Orders" is not a path),
      // and `aria-current` on the leaf so the current page is announced.
      const crumbWrap = el("nav", { class: "rui-page-header-breadcrumbs", "aria-label": "Breadcrumb" });
      if (Array.isArray(crumbs)) {
        const lastIndex = crumbs.length - 1;
        crumbs.forEach((c, i) => {
          if (i > 0) {
            crumbWrap.append(el("span", { class: "rui-page-header-crumb-sep", "aria-hidden": "true" }, ["/"]));
          }
          if (isComponentNode(c)) {
            crumbWrap.append(helpers.renderNode(c));
            return;
          }
          crumbWrap.append(renderCrumb(c, i, i === lastIndex, props.onCrumbClick, helpers));
        });
      } else {
        crumbWrap.append(helpers.renderNode(crumbs));
      }
      root.append(crumbWrap);
    }

    const titleRow = el("div", { class: "rui-page-header-title-row" });
    const titleBlock = el("div", { class: "rui-page-header-title-block" });
    const titleLine = el("div", { class: "rui-page-header-title-line" });
    titleLine.append(el("h1", { class: "rui-page-header-title" }, [title]));
    if (props.status) titleLine.append(helpers.renderNode(props.status));
    titleBlock.append(titleLine);

    const subtitle = asString(props.subtitle);
    if (subtitle) titleBlock.append(el("p", { class: "rui-page-header-subtitle" }, [subtitle]));
    titleRow.append(titleBlock);

    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-page-header-actions");
      titleRow.append(actions);
    }

    root.append(titleRow);
    return root;
  },
};

export const EmptyState: ComponentSpec = {
  name: "EmptyState",
  description:
    "Zero-state placeholder for empty lists, searches, dashboards. Renders " +
    "a centered icon (or illustration), title, description, and either a " +
    "single `action` Button or an `actions` row (primary + secondary). " +
    "Always preferable to an empty Card with raw text.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name (defaults to \"inbox\")" },
    { name: "illustration", type: "string", optional: true, description: "Image URL — takes precedence over `icon` when provided" },
    { name: "action", type: "Button", optional: true, description: "Single CTA (legacy slot)" },
    { name: "actions", type: "Node[]", optional: true, description: "Row of CTA Buttons / Links — preferred over `action` for primary + secondary affordances" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-empty-state" });
    const illustration = sanitiseImageSrc(props.illustration);
    if (illustration) {
      root.append(el("img", {
        class: "rui-empty-state-illustration",
        src: illustration,
        alt: "",
        loading: "lazy",
      }));
    } else {
      const title = asString(props.title);
      const description = asString(props.description);
      const iconName =
        asString(props.icon) ||
        pickIconForLabel(`${title} ${description}`) ||
        "inbox";
      const iconNode = renderIcon(iconName, { className: "rui-empty-state-icon" });
      if (iconNode) root.append(iconNode);
    }
    root.append(el("h3", { class: "rui-empty-state-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-empty-state-description" }, [desc]));
    const actions = asArray<unknown>(props.actions);
    if (actions.length > 0) {
      const row = el("div", { class: "rui-empty-state-actions" });
      for (const item of actions) row.append(helpers.renderNode(item));
      root.append(row);
    } else if (props.action) {
      const wrap = el("div", { class: "rui-empty-state-action" });
      wrap.append(helpers.renderNode(props.action));
      root.append(wrap);
    }
    return root;
  },
};

/** `true` for a timestamp a `<time datetime>` can carry verbatim. */
const isIsoLike = (value: string): boolean => /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(value);

export const TimelineItem: ComponentSpec = {
  name: "TimelineItem",
  description:
    "Single event on a Timeline. Pass `content` for rich children (Badge, " +
    "Link, Button) beside the plain-text `description`, and `href`/`onClick` " +
    "to make the row navigable.",
  props: [
    { name: "title", type: "string" },
    { name: "time", type: "string", optional: true, description: "Display label (ISO, relative, etc.)" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name rendered inside the marker" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: SURFACE_TONES },
    { name: "content", type: "Node[]", optional: true, description: "Rich children below the description (Badge, Link, Button, …)" },
    { name: "href", type: "string", optional: true, description: "Turns the title into a link (changelog entry → PR, commit, release)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Called when the row is clicked" },
  ],
  render: (_node, props, helpers) => {
    const href = asString(props.href) ? sanitiseHref(props.href) : "";
    // `href` wins the title slot; a bare `onClick` promotes the whole row the
    // same way KanbanCard does, so the affordance matches the interaction.
    const rowClickable = !href && typeof props.onClick === "function";
    const li = el("li", {
      class: "rui-timeline-item",
      "data-tone": asString(props.tone, "default"),
      "data-interactive": href || rowClickable ? "true" : null,
    });
    const marker = el("span", { class: "rui-timeline-marker" });
    const iconNode = renderIcon(props.icon);
    if (iconNode) marker.append(iconNode);
    li.append(marker);

    // The interactive role lands on the body, not the <li> — overriding the
    // list item's role would drop the entry from the list the <ol> announces.
    const body = el("div", {
      class: "rui-timeline-body",
      role: rowClickable ? "button" : null,
      tabindex: rowClickable ? "0" : null,
    });
    const head = el("div", { class: "rui-timeline-head" });
    const title = asString(props.title);
    if (href) {
      const link = el("a", { class: "rui-timeline-title", href }, [title]);
      if (typeof props.onClick === "function") {
        link.onclick = () => helpers.invoke(props.onClick);
      }
      head.append(link);
    } else {
      head.append(el("span", { class: "rui-timeline-title" }, [title]));
    }
    const time = asString(props.time);
    if (time) {
      // The prop invites ISO input, so expose it machine-readably instead of
      // dumping the raw string into a <span>.
      head.append(el("time", {
        class: "rui-timeline-time",
        datetime: isIsoLike(time) ? time : null,
      }, [time]));
    }
    body.append(head);

    const desc = asString(props.description);
    if (desc) body.append(el("div", { class: "rui-timeline-description" }, [desc]));

    const content = asArray<unknown>(props.content);
    if (content.length > 0) {
      const extra = el("div", { class: "rui-timeline-content" });
      for (const child of content) extra.append(helpers.renderNode(child));
      body.append(extra);
    }

    if (rowClickable) {
      const fire = (): void => helpers.invoke(props.onClick);
      body.onclick = fire;
      body.onkeydown = activateOnKey(fire);
    }
    li.append(body);
    return li;
  },
};

export const Timeline: ComponentSpec = {
  name: "Timeline",
  description:
    "Vertical event timeline. Children must be TimelineItem entries. Ideal " +
    "for activity feeds, changelogs, and process flows.",
  props: [{ name: "items", type: "TimelineItem[]" }],
  render: (_node, props, helpers) => {
    const root = el("ol", { class: "rui-timeline" });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

export const FeatureItem: ComponentSpec = {
  name: "FeatureItem",
  description:
    "Single tile on a FeatureGrid. Pass `href` or `onClick` to make the whole " +
    "tile a link/button — a category or capability tile is normally the way " +
    "into that section.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: SURFACE_TONES },
    { name: "href", type: "string", optional: true, description: "Render the tile as a link to this URL" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Called when the tile is clicked" },
  ],
  render: (_node, props, helpers) => {
    const href = asString(props.href) ? sanitiseHref(props.href) : "";
    const clickable = typeof props.onClick === "function";
    // The tile carries a hover lift, so it has to be reachable: an anchor when
    // it navigates, a button-roled div when it only calls back.
    const root = el((href ? "a" : "div") as "div", {
      class: "rui-feature-item",
      "data-tone": asString(props.tone, "primary"),
      href: href || null,
      "data-interactive": href || clickable ? "true" : null,
      role: !href && clickable ? "button" : null,
      tabindex: !href && clickable ? "0" : null,
    });
    if (clickable) {
      const fire = (): void => helpers.invoke(props.onClick);
      root.onclick = fire;
      if (!href) root.onkeydown = activateOnKey(fire);
    }
    const iconName = asString(props.icon, "sparkles");
    const iconNode = renderIcon(iconName, { className: "rui-feature-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("h3", { class: "rui-feature-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-feature-description" }, [desc]));
    return root;
  },
};

export const FeatureGrid: ComponentSpec = {
  name: "FeatureGrid",
  description:
    "Responsive grid of FeatureItem tiles (typically 2–3 columns). Use to " +
    "highlight product capabilities or page categories.",
  props: [
    { name: "items", type: "FeatureItem[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default auto)" },
  ],
  render: (_node, props, helpers) => {
    // Read the count explicitly instead of relying on NaN falling through the
    // clamp: `columns: "three"` used to silently mean "auto".
    const requested = props.columns == null ? 0 : Math.floor(asNumber(props.columns, 0));
    const columns = requested > 0 ? Math.max(1, Math.min(4, requested)) : 0;
    const root = el("div", {
      class: "rui-feature-grid",
      "data-columns": columns > 0 ? String(columns) : null,
    });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

export const Testimonial: ComponentSpec = {
  name: "Testimonial",
  description: "Quote card with author, role, and optional avatar.",
  props: [
    { name: "quote", type: "string" },
    { name: "author", type: "string", aliases: ["name"] },
    { name: "role", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "rating", type: "number", optional: true, description: "0–5 stars" },
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-testimonial" });
    // `asNumber` falls back for unparseable input; `Number("4 stars")` was NaN,
    // which failed the `> 0` test and dropped the rating row entirely.
    const rating = Math.max(0, Math.min(5, Math.round(asNumber(props.rating, 0))));
    if (rating > 0) {
      // The stars are aria-hidden icons, so the rating needs its own name or
      // the single most load-bearing datum on the card is never announced.
      const stars = el("div", {
        class: "rui-testimonial-rating",
        role: "img",
        "aria-label": `Rated ${rating} out of 5`,
      });
      for (let i = 0; i < 5; i += 1) {
        const filled = i < rating;
        const icon = renderIcon(filled ? "star" : "regular:star", { className: "rui-testimonial-rating-star" });
        if (icon) stars.append(icon);
      }
      root.append(stars);
    }
    root.append(el("blockquote", { class: "rui-testimonial-quote" }, [
      asString(props.quote),
    ]));
    const footer = el("figcaption", { class: "rui-testimonial-author" });
    const avatarSrc = sanitiseImageSrc(props.avatarSrc);
    if (avatarSrc) {
      footer.append(el("img", { class: "rui-testimonial-avatar", src: avatarSrc, alt: "" }));
    }
    const meta = el("div", { class: "rui-testimonial-meta" });
    meta.append(el("div", { class: "rui-testimonial-name" }, [asString(props.author)]));
    const role = asString(props.role);
    if (role) meta.append(el("div", { class: "rui-testimonial-role" }, [role]));
    footer.append(meta);
    root.append(footer);
    return root;
  },
};

export const ProfileCard: ComponentSpec = {
  name: "ProfileCard",
  description:
    "Compact profile/user card with avatar, name, role, optional bio, social " +
    "tags, and a row of action buttons. Use for team rosters, contributor " +
    "lists, and contact panels.",
  props: [
    { name: "name", type: "string" },
    { name: "role", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"], description: "Avatar image src; falls back to initials" },
    { name: "bio", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons to render at the bottom" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-profile-card" });
    const header = el("div", { class: "rui-profile-card-header" });
    header.append(renderAvatar(asString(props.avatarSrc), asString(props.name), "lg", helpers));
    const meta = el("div", { class: "rui-profile-card-meta" });
    meta.append(el("h3", { class: "rui-profile-card-name" }, [asString(props.name)]));
    const role = asString(props.role);
    if (role) meta.append(el("p", { class: "rui-profile-card-role" }, [role]));
    header.append(meta);
    root.append(header);

    const bio = asString(props.bio);
    if (bio) root.append(el("p", { class: "rui-profile-card-bio" }, [bio]));

    const tags = asArray<unknown>(props.tags);
    if (tags.length > 0) {
      const tagRow = el("div", { class: "rui-profile-card-tags" });
      for (const t of tags) {
        const label = asString(t);
        if (label) tagRow.append(el("span", { class: "rui-tag", "data-size": "sm" }, [
          el("span", { class: "rui-tag-label" }, [label]),
        ]));
      }
      root.append(tagRow);
    }

    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-profile-card-actions");
      root.append(actions);
    }
    return root;
  },
};

export const Comment: ComponentSpec = {
  name: "Comment",
  description:
    "Single comment / message bubble. Renders avatar, author, timestamp, " +
    "body, and an optional row of toolbar buttons (reply, like, …).",
  props: [
    { name: "author", type: "string" },
    { name: "body", type: "Node[] | Node | string", aliases: ["text", "message"], description: "Comment text, or nodes — Markdown(...), Link(...), Code(...), a Stack of them" },
    { name: "time", type: "string", optional: true, description: "Relative or absolute timestamp" },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "actions", type: "Node[]", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("article", { class: "rui-comment" });
    root.append(renderAvatar(asString(props.avatarSrc), asString(props.author), "md", helpers));
    const body = el("div", { class: "rui-comment-body" });
    const head = el("header", { class: "rui-comment-header" });
    head.append(el("span", { class: "rui-comment-author" }, [asString(props.author)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-comment-time" }, [time]));
    body.append(head);
    // A comment thread without links/mentions is not a real use case, so the
    // body renders nodes as nodes — `asString` turned them into "[object Object]".
    const content = el("div", { class: "rui-comment-content" });
    if (isComponentNode(props.body) || Array.isArray(props.body)) {
      content.append(helpers.renderNode(props.body));
    } else {
      content.append(document.createTextNode(asString(props.body)));
    }
    body.append(content);
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-comment-actions");
      body.append(actions);
    }
    root.append(body);
    return root;
  },
};

export const Banner: ComponentSpec = {
  name: "Banner",
  description:
    "Full-width announcement banner. Use at the top of a page for promos, " +
    "release notes, or downtime notices. Pass `dismissible: true` for a close " +
    "button, or `href`/`onClick` to make the whole band a click target. For " +
    "inline notices prefer Callout or Alert.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true, aliases: ["description"] },
    { name: "action", type: "Button", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name" },
    { name: "tone", type: "string", optional: true, aliases: ["variant"], enum: SURFACE_TONES },
    { name: "dismissible", type: "boolean", optional: true, aliases: ["closable"], description: "Show a close button that hides the banner" },
    { name: "onDismiss", type: "callable", optional: true, aliases: ["onClose"], description: "Called when the banner is dismissed (implies `dismissible`)" },
    { name: "href", type: "string", optional: true, description: "Make the whole banner a link (release notes → changelog)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick"], description: "Called when the banner itself is clicked" },
  ],
  render: (_node, props, helpers) => {
    const tone = asString(props.tone, "primary");
    // A late-arriving incident banner is only seen by sighted users unless the
    // band is a live region; danger/warning interrupt, everything else is polite.
    const isAlert = tone === "danger" || tone === "warning";
    const href = asString(props.href) ? sanitiseHref(props.href) : "";
    const clickable = !href && typeof props.onClick === "function";
    const dismissible = asBoolean(props.dismissible) || props.onDismiss != null;
    const dismissed = helpers.useInstanceState<boolean>("dismissed", false);
    const tag = href ? "a" : "aside";
    if (dismissible && dismissed.get()) {
      // Same tag, no children: the morph patches the row away instead of
      // replacing the node, and a later re-render re-emits this so the banner
      // stays dismissed. `hidden` alone is not enough — the author-sheet
      // `.rui-banner { display: flex }` outranks the UA `[hidden]` rule
      // (cf. `.rui-error-banner[hidden]`), so the collapse is inline.
      return el(tag as "aside", {
        class: "rui-banner",
        "data-tone": tone,
        "data-dismissed": "true",
        hidden: true,
        style: "display:none",
      });
    }
    const root = el(tag as "aside", {
      class: "rui-banner",
      "data-tone": tone,
      href: href || null,
      // `aria-live` rather than only `role`, so the announcement survives the
      // link/button root the interactive variants need.
      role: href ? null : clickable ? "button" : isAlert ? "alert" : "status",
      "aria-live": isAlert ? "assertive" : "polite",
      tabindex: clickable ? "0" : null,
    });
    if (clickable) {
      const fire = (): void => helpers.invoke(props.onClick);
      root.onclick = fire;
      root.onkeydown = activateOnKey(fire);
    }
    const iconName = asString(props.icon) || pickIconForTone(tone) || "";
    const iconNode = renderIcon(iconName, { className: "rui-banner-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-banner-body" });
    body.append(el("strong", { class: "rui-banner-title" }, [asString(props.title)]));
    const msg = asString(props.message);
    if (msg) body.append(el("span", { class: "rui-banner-message" }, [msg]));
    root.append(body);
    if (props.action) {
      const wrap = el("div", { class: "rui-banner-action" });
      wrap.append(helpers.renderNode(props.action));
      // The band itself may be a link/button — the CTA must not trigger both.
      if (href || clickable) wrap.onclick = (event) => event.stopPropagation();
      root.append(wrap);
    }
    if (dismissible) {
      const close = el("button", {
        class: "rui-banner-dismiss",
        type: "button",
        "aria-label": "Dismiss",
      });
      close.append(renderIcon("xmark", { className: "rui-banner-dismiss-icon" }) ?? document.createTextNode("×"));
      close.onclick = (event) => {
        event.stopPropagation();
        dismissed.set(true);
        // Instance state does not schedule a render, so hide the LIVE band now
        // (resolved from the event — the captured node may be a discarded
        // re-render snapshot).
        const live = closestFrom(event.currentTarget ?? event.target, ".rui-banner");
        if (live) {
          live.setAttribute("data-dismissed", "true");
          live.hidden = true;
          live.style.display = "none";
        }
        helpers.invoke(props.onDismiss);
      };
      root.append(close);
    }
    return root;
  },
};

export const KanbanCard: ComponentSpec = {
  name: "KanbanCard",
  description: "Single card on a Kanban board.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true },
    { name: "assignee", type: "string", optional: true, description: "Name shown next to avatar initials" },
    { name: "tone", type: "string", optional: true, aliases: ["variant"], enum: SURFACE_TONES },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name shown beside the title" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Optional callable fired when the card is clicked" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-kanban-card",
      "data-tone": asString(props.tone, "default"),
    });
    if (typeof props.onClick === "function") {
      root.setAttribute("role", "button");
      root.setAttribute("tabindex", "0");
      root.onclick = () => helpers.invoke(props.onClick);
      root.onkeydown = (event) => {
        const e = event as KeyboardEvent;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          helpers.invoke(props.onClick);
        }
      };
    }
    const titleEl = el("div", { class: "rui-kanban-card-title" });
    const iconNode = renderIcon(props.icon, { className: "rui-kanban-card-icon" });
    if (iconNode) titleEl.append(iconNode);
    titleEl.append(document.createTextNode(asString(props.title)));
    root.append(titleEl);
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-kanban-card-description" }, [desc]));

    const tags = asArray<unknown>(props.tags);
    if (tags.length > 0) {
      const tagRow = el("div", { class: "rui-kanban-card-tags" });
      for (const t of tags) {
        const label = asString(t);
        if (label) tagRow.append(el("span", { class: "rui-tag", "data-size": "sm" }, [
          el("span", { class: "rui-tag-label" }, [label]),
        ]));
      }
      root.append(tagRow);
    }

    const assignee = asString(props.assignee);
    if (assignee) {
      const footer = el("footer", { class: "rui-kanban-card-footer" });
      footer.append(renderAvatar("", assignee, "sm", helpers));
      footer.append(el("span", { class: "rui-kanban-card-assignee" }, [assignee]));
      root.append(footer);
    }
    return root;
  },
};

export const KanbanColumn: ComponentSpec = {
  name: "KanbanColumn",
  description:
    "Single column inside a KanbanBoard. Children must be KanbanCard entries. " +
    "Pass `actions` for the header's \"+ Add card\" / overflow menu and `limit` " +
    "for a WIP limit (the count chip renders \"3 / 5\" and flags an overflow).",
  props: [
    { name: "title", type: "string" },
    { name: "items", type: "KanbanCard[]", aliases: ["cards"] },
    { name: "tone", aliases: ["variant"], type: "string", optional: true, enum: SURFACE_TONES, description: "Header accent tone" },
    { name: "actions", type: "Node[]", optional: true, description: "Header buttons — add card, column menu" },
    { name: "limit", type: "number", optional: true, description: "WIP limit; the count chip becomes \"items / limit\"" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const requestedLimit = props.limit == null ? 0 : Math.floor(asNumber(props.limit, 0));
    const limit = requestedLimit > 0 ? requestedLimit : 0;
    const overLimit = limit > 0 && items.length > limit;
    const root = el("section", {
      class: "rui-kanban-column",
      "data-tone": asString(props.tone, "default"),
      "data-over-limit": overLimit ? "true" : null,
    });
    const header = el("header", { class: "rui-kanban-column-header" });
    header.append(el("span", { class: "rui-kanban-column-title" }, [asString(props.title)]));
    header.append(el("span", {
      class: "rui-kanban-column-count",
      "data-over-limit": overLimit ? "true" : null,
    }, [limit > 0 ? `${items.length} / ${limit}` : String(items.length)]));
    const headerActions = renderActionsRow(props.actions, helpers);
    if (headerActions) {
      headerActions.classList.add("rui-kanban-column-actions");
      header.append(headerActions);
    }
    root.append(header);
    const body = el("div", { class: "rui-kanban-column-body" });
    for (const item of items) body.append(helpers.renderNode(item));
    if (items.length === 0) {
      body.append(el("div", { class: "rui-kanban-column-empty" }, ["No items"]));
    }
    root.append(body);
    return root;
  },
};

/**
 * Card drag & drop for a KanbanBoard.
 *
 * Every handler lives on the BOARD root as a property handler and resolves its
 * card/column from the event. Two reasons: the cards are produced by a separate
 * spec that knows nothing about the board, and `addEventListener` on a
 * per-render node is discarded by the morph reconciler (contract #1). Marking
 * `draggable` on the freshly-rendered cards is enough — the morph copies
 * attributes from the fresh tree onto the kept live nodes.
 */
function wireCardDragAndDrop(root: HTMLElement, onCardMove: unknown, helpers: RenderHelpers): void {
  const titleOf = (element: HTMLElement | null, selector: string): string =>
    asString(element?.querySelector(selector)?.textContent).trim();
  const cardTitle = (card: HTMLElement | null): string => titleOf(card, ".rui-kanban-card-title");
  const columnTitle = (column: HTMLElement | null): string => titleOf(column, ".rui-kanban-column-title");
  const clearMarkers = (board: HTMLElement): void => {
    for (const marked of board.querySelectorAll<HTMLElement>("[data-drop-target]")) {
      marked.removeAttribute("data-drop-target");
    }
    for (const dragging of board.querySelectorAll<HTMLElement>("[data-dragging]")) {
      dragging.removeAttribute("data-dragging");
    }
  };

  root.dataset.draggableCards = "true";
  for (const card of root.querySelectorAll<HTMLElement>(".rui-kanban-card")) {
    card.setAttribute("draggable", "true");
  }

  root.ondragstart = (event) => {
    const card = closestFrom(event.target, ".rui-kanban-card");
    if (!card) return;
    card.dataset.dragging = "true";
    event.dataTransfer?.setData("text/plain", cardTitle(card));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
  root.ondragover = (event) => {
    const column = closestFrom(event.target, ".rui-kanban-column");
    if (!column) return;
    // Without preventDefault the browser refuses the drop entirely.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    column.dataset.dropTarget = "true";
  };
  root.ondragleave = (event) => {
    closestFrom(event.target, ".rui-kanban-column")?.removeAttribute("data-drop-target");
  };
  root.ondrop = (event) => {
    const board = (closestFrom(event.currentTarget ?? event.target, ".rui-kanban-board") ?? root);
    const column = closestFrom(event.target, ".rui-kanban-column");
    const card = board.querySelector<HTMLElement>(".rui-kanban-card[data-dragging='true']");
    const from = columnTitle(card?.closest(".rui-kanban-column") as HTMLElement | null);
    clearMarkers(board);
    if (!column || !card) return;
    event.preventDefault();
    const to = columnTitle(column);
    if (!to || to === from) return;
    helpers.invoke(onCardMove, cardTitle(card), to, from);
  };
  root.ondragend = (event) => {
    clearMarkers(closestFrom(event.currentTarget ?? event.target, ".rui-kanban-board") ?? root);
  };
}

export const KanbanBoard: ComponentSpec = {
  name: "KanbanBoard",
  description:
    "Horizontal Kanban board. Children must be KanbanColumn entries. The " +
    "board scrolls horizontally on narrow viewports so columns stay readable. " +
    "Pass `onCardMove` to enable drag & drop — it is called with " +
    "(cardTitle, toColumn, fromColumn) so the author moves the data.",
  props: [
    { name: "columns", type: "KanbanColumn[]" },
    { name: "onCardMove", type: "callable", optional: true, description: "Called with (cardTitle, toColumn, fromColumn) after a card is dropped on another column" },
    { name: "draggable", type: "boolean", optional: true, description: "Make cards draggable without an onCardMove handler (implied by onCardMove)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-kanban-board" });
    for (const column of asArray(props.columns)) root.append(helpers.renderNode(column));
    if (typeof props.onCardMove === "function" || asBoolean(props.draggable)) {
      wireCardDragAndDrop(root, props.onCardMove, helpers);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Rich application-shell patterns
 *
 * These composites encode the most common SaaS-style page shells in a
 * single line, so the LLM can reach for them instead of stitching nested
 * Stacks/Cards by hand. They were added specifically to bridge the gap
 * between hand-rolled component demos and polished, real-world UIs.
 * ----------------------------------------------------------------------- */

export const SectionHeader: ComponentSpec = {
  name: "SectionHeader",
  description:
    "Compact section header for the top of a Card or panel. Renders a small " +
    "eyebrow, a title, an optional subtitle, an optional status Tag/Badge, " +
    "and a right-aligned actions row. Use this inside a Card to introduce " +
    "a section instead of a bare `CardHeader`.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true, aliases: ["description"] },
    { name: "eyebrow", type: "string", optional: true, description: "Short uppercase label above the title" },
    { name: "status", type: "Badge | Tag", optional: true, aliases: ["badge"] },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / Links shown on the right" },
  ],
  render: (_node, props, helpers) => {
    const root = el("header", { class: "rui-section-header" });
    const left = el("div", { class: "rui-section-header-left" });
    const eyebrow = asString(props.eyebrow);
    if (eyebrow) left.append(el("span", { class: "rui-section-header-eyebrow" }, [eyebrow]));
    const titleLine = el("div", { class: "rui-section-header-title-line" });
    titleLine.append(el("h3", { class: "rui-section-header-title" }, [asString(props.title)]));
    if (props.status) titleLine.append(helpers.renderNode(props.status));
    left.append(titleLine);
    const subtitle = asString(props.subtitle);
    if (subtitle) left.append(el("p", { class: "rui-section-header-subtitle" }, [subtitle]));
    root.append(left);
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-section-header-actions");
      root.append(actions);
    }
    return root;
  },
};

/** Fallback ids for auto-mounted SearchBars, so two Toolbars never collide. */
let toolbarSearchSeq = 0;

/**
 * Mount the `searchable` SearchBar.
 *
 * Two things have to survive the hand-off. (1) The `$variable` bound to
 * `searchValue`: SearchBar binds its OWN `value` slot, so this node's slot
 * metadata is forwarded into that position — the previous fabricated
 * `argMeta: []` made `bindToStateAtArg` return early, so typing updated
 * nothing. (2) A unique `id`: SearchBar uses it as the input's `name` too, so a
 * hardcoded `"toolbar-search"` produced duplicate ids (and cross-contaminating
 * autofill) whenever two Toolbars shared a shadow root.
 */
function renderToolbarSearch(
  node: ComponentNode,
  props: Record<string, unknown>,
  helpers: RenderHelpers,
): Node {
  const idSlot = helpers.useInstanceState<string>("searchId", "");
  let searchId = asString(props.searchId);
  if (!searchId) {
    searchId = idSlot.get();
    if (!searchId) {
      toolbarSearchSeq += 1;
      searchId = `toolbar-search-${toolbarSearchSeq}`;
      idSlot.set(searchId);
    }
  }
  const meta = node.argMeta ? [...node.argMeta] : [];
  while (meta.length <= SEARCHBAR_VALUE_SLOT) meta.push({});
  const bound = TOOLBAR_SEARCH_VALUE_SLOT >= 0 ? node.argMeta?.[TOOLBAR_SEARCH_VALUE_SLOT] : undefined;
  if (bound?.stateRef) meta[SEARCHBAR_VALUE_SLOT] = bound;
  return SearchBar.render(
    { ...node, name: "SearchBar", args: [], argMeta: meta },
    {
      id: searchId,
      placeholder: asString(props.searchPlaceholder, "Search…"),
      value: props.searchValue,
      onChange: props.onSearch,
    },
    helpers,
  );
}

export const Toolbar: ComponentSpec = {
  name: "Toolbar",
  description:
    "Horizontal toolbar for filters, search, view modes, and primary " +
    "actions. Left/center/right slots wrap onto separate rows on narrow " +
    "viewports so the bar never overflows. Pass `searchable: true` to " +
    "auto-mount a SearchBar in the left slot (bind `searchValue` to a " +
    "`$variable`, or handle `onSearch`). Use ABOVE a Table, List, Grid, or " +
    "Kanban view — never replace `PageHeader` with it.",
  props: [
    { name: "left", type: "Node[]", optional: true, description: "Filters / search inputs / chips" },
    { name: "right", type: "Node[]", optional: true, description: "Primary action buttons" },
    { name: "center", type: "Node[]", optional: true, description: "Centered controls (e.g. SegmentedControl, search bar)" },
    { name: "searchable", type: "boolean", optional: true, description: "Auto-mount a SearchBar at the start of the left slot" },
    { name: "searchPlaceholder", type: "string", optional: true, description: "Placeholder for the auto-mounted SearchBar" },
    { name: "searchValue", type: "string", optional: true, description: "$variable bound to the auto-mounted SearchBar" },
    { name: "onSearch", type: "callable", optional: true, aliases: ["onSearchChange", "onChange"], description: "Called with the query on every keystroke of the auto-mounted SearchBar" },
    { name: "searchId", type: "string", optional: true, description: "Explicit id/name for the auto-mounted SearchBar (defaults to a per-instance unique id)" },
  ],
  render: (node, props, helpers) => {
    const center = asArray<unknown>(props.center);
    const root = el("div", {
      class: "rui-toolbar",
      "data-has-center": center.length > 0 ? "true" : "false",
    });
    const left = el("div", { class: "rui-toolbar-side rui-toolbar-left" });
    if (asBoolean(props.searchable)) {
      left.append(renderToolbarSearch(node, props, helpers));
    }
    for (const child of asArray(props.left)) left.append(helpers.renderNode(child));
    root.append(left);
    if (center.length > 0) {
      const centerWrap = el("div", { class: "rui-toolbar-side rui-toolbar-center" });
      for (const child of center) centerWrap.append(helpers.renderNode(child));
      root.append(centerWrap);
    }
    const right = el("div", { class: "rui-toolbar-side rui-toolbar-right" });
    for (const child of asArray(props.right)) right.append(helpers.renderNode(child));
    root.append(right);
    return root;
  },
};

/* Slot indices for the Toolbar → SearchBar binding hand-off. Derived from the
 * specs rather than hardcoded so reordering either prop list cannot silently
 * break two-way binding again. */
const TOOLBAR_SEARCH_VALUE_SLOT = Toolbar.props.findIndex((p) => p.name === "searchValue");
const SEARCHBAR_VALUE_SLOT = SearchBar.props.findIndex((p) => p.name === "value");

export const SidebarItem: ComponentSpec = {
  name: "SidebarItem",
  description:
    "Single navigation item inside a Sidebar. Pass `active=true` to mark " +
    "as the current page, a `to` path to navigate via the runtime router " +
    "on click, an `onClick` callable for arbitrary click handling, or an " +
    "optional `badge` (string/number) for a trailing chip. `to` and " +
    "`onClick` can coexist — `onClick` is invoked AFTER the router " +
    "navigates so authors can do extra work (analytics, side-effects). Items " +
    "with `to`/`href` render as real links, so Cmd/middle-click opens a new " +
    "tab; `disabled: true` greys a gated item out.",
  props: [
    { name: "label", type: "string" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name rendered before the label" },
    { name: "active", type: "boolean", optional: true, description: "Mark this item as the current page. When `to` is provided and `active` is omitted, the item auto-detects the active state from the current router path." },
    { name: "badge", type: "string", optional: true, description: "Trailing chip (count or status)" },
    { name: "to", type: "string", optional: true, description: "Router path to navigate to on click (e.g. \"/\", \"/orders\"). Uses the runtime router — no full page reload." },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable invoked on click. Runs in addition to `to`-based navigation." },
    { name: "href", type: "string", optional: true, description: "External/absolute URL — rendered as a plain link (no router)" },
    { name: "disabled", type: "boolean", optional: true, description: "Render a non-interactive, greyed item (gated features)" },
  ],
  render: (_node, props, helpers) => {
    const to = asString(props.to);
    const explicitHref = asString(props.href);
    const disabled = asBoolean(props.disabled);
    const explicitActive = props.active !== undefined && props.active !== null;
    const currentPath = to ? helpers.router.getPath() : "";
    // When the caller supplies `to` without an explicit `active`, derive
    // the active state from the current router path so a single declaration
    // (`SidebarItem("Home", { to: "/", icon: "house" })`) renders the
    // active highlight without extra wiring.
    const autoActive = (() => {
      if (!to) return false;
      if (to === "/") return currentPath === "/";
      if (currentPath === to) return true;
      return currentPath.startsWith(to + "/");
    })();
    const isActive = explicitActive ? asBoolean(props.active) : autoActive;
    // Anything with a destination renders as an <a>: the sidebar is the app's
    // primary navigation, so open-in-new-tab, middle-click, "Copy link
    // address" and the status-bar preview must work. `href` wins over `to`
    // because it is the explicit, non-router escape hatch.
    const href = explicitHref
      ? sanitiseHref(explicitHref)
      : to ? routeHref(to) : "";
    const tag = href ? "a" : "button";
    const root = el(tag as "button", {
      type: tag === "button" ? "button" : null,
      class: "rui-sidebar-item",
      "data-active": isActive ? "true" : "false",
      // Colour alone never told a screen-reader user which item is current.
      "aria-current": isActive ? "page" : null,
      "data-to": to || null,
      href: tag === "a" ? href : null,
      disabled: tag === "button" && disabled ? true : null,
      // The tag stays stable when `disabled` flips (a tagName change makes the
      // morph replace the node and drop focus), so an anchor expresses
      // disablement with aria + removal from the tab order instead.
      "aria-disabled": disabled ? "true" : null,
      "data-disabled": disabled ? "true" : null,
      tabindex: tag === "a" && disabled ? "-1" : null,
    });
    const iconNode = renderIcon(props.icon, { className: "rui-sidebar-item-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("span", { class: "rui-sidebar-item-label" }, [asString(props.label)]));
    const badge = asString(props.badge);
    if (badge) root.append(el("span", { class: "rui-sidebar-item-badge" }, [badge]));
    if (disabled) {
      root.onclick = (event) => { event.preventDefault(); };
    } else if (to || props.onClick != null) {
      root.onclick = (event) => {
        const e = event as MouseEvent;
        // Modified / non-primary clicks belong to the browser now that there
        // is a real href — but `onClick` still runs either way, which the old
        // early return silently swallowed.
        const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
        if (to && !modified) {
          e.preventDefault();
          helpers.router.navigate(to);
        }
        if (props.onClick != null) helpers.invoke(props.onClick);
      };
    }
    return root;
  },
};

export const SidebarSection: ComponentSpec = {
  name: "SidebarSection",
  description:
    "Grouping inside a Sidebar — small uppercase label followed by " +
    "SidebarItem entries. Use this to chunk a long sidebar into sections.",
  props: [
    { name: "label", type: "string" },
    { name: "items", type: "SidebarItem[]" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-sidebar-section" });
    const label = asString(props.label);
    if (label) root.append(el("div", { class: "rui-sidebar-section-label" }, [label]));
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

export const Sidebar: ComponentSpec = {
  name: "Sidebar",
  description:
    "Vertical app navigation panel. Supports a brand header, navigation " +
    "items (`SidebarItem` or `SidebarSection`), an optional footer, and a " +
    "`collapsed` mode that hides labels to leave just an icon rail. Use " +
    "inside `AppShell` for SaaS-style left navigation.",
  props: [
    { name: "items", type: "(SidebarItem | SidebarSection)[]" },
    { name: "brand", type: "string", optional: true, description: "Product name / workspace label at the top" },
    { name: "tagline", type: "string", optional: true },
    { name: "footer", type: "Node[]", optional: true, description: "Footer block (Avatar + name, upgrade CTA, …)" },
    { name: "collapsed", type: "boolean", optional: true, description: "Render as an icon-only rail (hides labels/badges; brand shrinks to its initial)" },
    { name: "fullHeight", type: "boolean", optional: true, description: "Pin the rail to the full viewport height so the main content scrolls beneath it (default true). Set false for an auto-height sidebar that scrolls with the page." },
    { name: "label", type: "string", optional: true, description: "Accessible name for the nav landmark (defaults to `brand`, then \"Main navigation\")" },
  ],
  render: (_node, props, helpers) => {
    const collapsed = asBoolean(props.collapsed);
    const fullHeight = props.fullHeight === undefined ? true : asBoolean(props.fullHeight);
    const root = el("aside", { class: "rui-sidebar" });
    if (collapsed) root.dataset.collapsed = "true";
    if (fullHeight) root.dataset.fullHeight = "true";
    const brand = asString(props.brand);
    const tagline = asString(props.tagline);
    if (brand || tagline) {
      const header = el("div", { class: "rui-sidebar-header" });
      if (brand) {
        // Collapsed rail: condense the brand to its first character so it fits
        // the icon-only column (centred via CSS); full label otherwise.
        const brandText = collapsed ? (brand.trim().charAt(0).toUpperCase() || brand) : brand;
        const condensed = brandText !== brand;
        header.append(el("div", {
          class: "rui-sidebar-brand",
          role: "heading",
          "aria-level": "2",
          // A single letter is meaningless to a screen reader or on hover, so
          // the collapsed rail still carries the full product name.
          "aria-label": condensed ? brand : null,
          title: condensed ? brand : null,
        }, [brandText]));
      }
      if (tagline) header.append(el("div", { class: "rui-sidebar-tagline" }, [tagline]));
      root.append(header);
    }
    // Name the landmark: a Sidebar next to a Navbar exposed two indistinguishable
    // "navigation" regions in the screen-reader rotor.
    const body = el("nav", {
      class: "rui-sidebar-body",
      "aria-label": asString(props.label) || brand || "Main navigation",
    });
    for (const item of asArray(props.items)) body.append(helpers.renderNode(item));
    root.append(body);
    const footerItems = asArray<unknown>(props.footer);
    if (footerItems.length > 0) {
      const footer = el("div", { class: "rui-sidebar-footer" });
      for (const item of footerItems) footer.append(helpers.renderNode(item));
      root.append(footer);
    }
    return root;
  },
};

export const AppShell: ComponentSpec = {
  name: "AppShell",
  description:
    "Canonical SaaS application shell: optional top bar, fixed left " +
    "Sidebar, and scrollable main content. Reach for this whenever a " +
    "response represents a full product surface (dashboard with nav, " +
    "settings + sections, admin panels). Pass `collapsible=true` to render " +
    "a hamburger that turns the sidebar into a slide-over drawer on narrow " +
    "viewports; bind `sidebarOpen` to a `$variable` (or handle " +
    "`onSidebarOpenChange`) to drive/observe that drawer — e.g. to close it " +
    "after a nav click. Do NOT declare a Modal/Sheet inside `sidebar`: the " +
    "drawer is a transformed box, so an overlay inside it is positioned " +
    "against the drawer instead of the viewport.",
  props: [
    { name: "sidebar", type: "Sidebar", description: "Pass a Sidebar(...) node" },
    { name: "content", type: "Node[]", description: "Main content (typically starts with a PageHeader)" },
    { name: "topbar", type: "Node[]", optional: true, description: "Optional thin top bar above the content" },
    { name: "collapsible", type: "boolean", optional: true, description: "Show a hamburger that toggles the sidebar drawer on mobile (default true)" },
    { name: "sidebarOpen", type: "boolean", optional: true, description: "$variable controlling whether the mobile drawer is open (two-way: the hamburger, scrim and Escape write back to it)" },
    { name: "onSidebarOpenChange", type: "callable", optional: true, description: "Called with the new open state whenever the drawer is toggled" },
  ],
  render: (node, props, helpers) => {
    const collapsible = props.collapsible === undefined ? true : asBoolean(props.collapsible);
    const propOpen = asBoolean(props.sidebarOpen);
    // The open flag has to live in instance state. Written as a bare
    // `data-sidebar-open` attribute it was stripped by the very next morph
    // (`syncAttributes` removes whatever the fresh render omits), so the drawer
    // slammed shut on any unrelated re-render.
    const openSlot = helpers.useInstanceState<boolean>("sidebarOpen", propOpen);
    const stateRef = APP_SHELL_OPEN_SLOT >= 0
      ? node.argMeta?.[APP_SHELL_OPEN_SLOT]?.stateRef
      : undefined;
    // A bound `$variable` is the source of truth; mirror it into the local slot
    // so a programmatic open/close wins over the last local toggle.
    if (stateRef) openSlot.set(propOpen);
    const isOpen = stateRef ? propOpen : openSlot.get();

    // Stable per-instance id so `aria-controls` still resolves when two shells
    // share a shadow root.
    const idSlot = helpers.useInstanceState<string>("sidebarId", "");
    let sidebarId = idSlot.get();
    if (!sidebarId) {
      appShellSeq += 1;
      sidebarId = `rui-app-shell-sidebar-${appShellSeq}`;
      idSlot.set(sidebarId);
    }

    /**
     * Flip the drawer. Writes the LIVE DOM immediately (instance state does not
     * schedule a render), keeps the persisted slot in sync, and pushes the new
     * value out through the bound `$variable` / `onSidebarOpenChange` so the
     * author's state stays authoritative.
     */
    const setOpen = (origin: EventTarget | null, next: boolean): void => {
      openSlot.set(next);
      const liveRoot = closestFrom(origin, ".rui-app-shell");
      if (liveRoot) {
        if (next) liveRoot.dataset.sidebarOpen = "true";
        else delete liveRoot.dataset.sidebarOpen;
        const toggle = liveRoot.querySelector<HTMLElement>(".rui-app-shell-toggle");
        toggle?.setAttribute("aria-expanded", next ? "true" : "false");
        const panel = liveRoot.querySelector<HTMLElement>(".rui-app-shell-sidebar");
        // Move focus into the drawer on open and hand it back on close — the
        // panel is visually modal, so leaving focus behind the scrim traps the
        // keyboard user in unreachable content.
        deferToPaint(() => {
          if (next) (panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panel)?.focus?.();
          else toggle?.focus?.();
        });
      }
      if (stateRef) helpers.setState(stateRef, next);
      helpers.invoke(props.onSidebarOpenChange, next);
    };

    const root = el("div", { class: "rui-app-shell" });
    if (collapsible) root.dataset.collapsible = "true";
    if (isOpen) root.dataset.sidebarOpen = "true";
    const sidebarHost = el("div", {
      class: "rui-app-shell-sidebar",
      id: sidebarId,
      tabindex: "-1",
    });
    sidebarHost.append(helpers.renderNode(props.sidebar));
    root.append(sidebarHost);
    if (collapsible) {
      // Property handlers, never `addEventListener`: the morph copies these
      // onto the kept node, so every render's closure (and its fresh state
      // slot) is the one that runs.
      const scrim = el("div", { class: "rui-app-shell-scrim", "aria-hidden": "true" });
      scrim.onclick = (event) => setOpen(event.currentTarget ?? event.target, false);
      root.append(scrim);
      // Escape closes and Tab is trapped inside the drawer — but only while it
      // is open, otherwise Tab in the page content would be confined to the rail.
      const trap = dialogKeydownHandler(".rui-app-shell-sidebar", (origin) => setOpen(origin, false));
      root.onkeydown = (event) => {
        const live = closestFrom(event.currentTarget ?? event.target, ".rui-app-shell");
        if (!live || live.dataset.sidebarOpen !== "true") return;
        trap(event as KeyboardEvent);
      };
    }
    const main = el("div", { class: "rui-app-shell-main" });
    const topbar = asArray<unknown>(props.topbar);
    const hasTopbarContent = topbar.length > 0;
    if (hasTopbarContent || collapsible) {
      const bar = el("div", { class: "rui-app-shell-topbar" });
      // A bar with no content exists only to host the mobile hamburger, so
      // flag it: CSS hides it on wide screens (no burger, nothing to show) and
      // reveals it only where the sidebar collapses to a drawer.
      if (!hasTopbarContent) bar.dataset.burgerOnly = "true";
      if (collapsible) {
        const toggle = el("button", {
          class: "rui-app-shell-toggle",
          type: "button",
          "aria-label": "Toggle navigation",
          "aria-expanded": isOpen ? "true" : "false",
          "aria-controls": sidebarId,
        });
        toggle.append(renderIcon("bars", { size: "md" }) ?? document.createTextNode("≡"));
        toggle.onclick = (event) => {
          // Read the slot, not the render-time `isOpen`: a local toggle updates
          // state + DOM without re-rendering, so the captured value goes stale.
          setOpen(event.currentTarget ?? event.target, !openSlot.get());
        };
        bar.append(toggle);
      }
      for (const item of topbar) bar.append(helpers.renderNode(item));
      main.append(bar);
    }
    const content = el("div", { class: "rui-app-shell-content" });
    for (const child of asArray(props.content)) content.append(helpers.renderNode(child));
    main.append(content);
    root.append(main);
    return root;
  },
};

/** Slot index of AppShell's `sidebarOpen`, for the two-way `$variable` write-back. */
const APP_SHELL_OPEN_SLOT = AppShell.props.findIndex((p) => p.name === "sidebarOpen");
/** Fallback ids for the drawer's `aria-controls` target. */
let appShellSeq = 0;

export const SplitView: ComponentSpec = {
  name: "SplitView",
  description:
    "Two-pane master/detail layout — a narrow primary pane on the left, " +
    "wider detail pane on the right. Collapses to a single column on " +
    "narrow viewports. Use for inboxes, file browsers, contact lists. On a " +
    "phone pass `showDetail` (typically a `$variable`) so only the list or " +
    "only the selected item is shown.",
  props: [
    { name: "primary", type: "Node[]", description: "Master pane content (list, filters)" },
    { name: "detail", type: "Node[]", aliases: ["secondary"], description: "Detail pane content (selected item, empty state)" },
    { name: "primaryWidth", type: "string", optional: true, aliases: ["splitAt"], description: "CSS width for the primary pane (default 320px)" },
    { name: "showDetail", type: "boolean", optional: true, description: "Which pane wins on narrow viewports: true = detail, false = list. Omit to keep both stacked." },
  ],
  render: (_node, props, helpers) => {
    const width = sanitiseCssLength(asString(props.primaryWidth), "320px");
    // Only emit the attribute when the author opted in — an app that never
    // passes `showDetail` keeps the historical stacked behaviour.
    const mobilePane = props.showDetail === undefined || props.showDetail === null
      ? null
      : asBoolean(props.showDetail) ? "detail" : "primary";
    const root = el("div", {
      class: "rui-split-view",
      style: `--rui-split-primary:${width}`,
      "data-mobile-pane": mobilePane,
    });
    const primary = el("div", { class: "rui-split-view-primary" });
    for (const child of asArray(props.primary)) primary.append(helpers.renderNode(child));
    const detail = el("div", { class: "rui-split-view-detail" });
    for (const child of asArray(props.detail)) detail.append(helpers.renderNode(child));
    root.append(primary, detail);
    return root;
  },
};

export const DescriptionItem: ComponentSpec = {
  name: "DescriptionItem",
  description:
    "Single row inside a DescriptionList. Renders a small uppercase " +
    "label on the left and a value (string or arbitrary Node) on the right.",
  props: [
    { name: "label", type: "string" },
    { name: "value", type: "Node | string" },
    { name: "icon", type: "string", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-description-item" });
    const labelWrap = el("dt", { class: "rui-description-label" });
    const iconNode = renderIcon(props.icon, { className: "rui-description-icon" });
    if (iconNode) labelWrap.append(iconNode);
    labelWrap.append(document.createTextNode(asString(props.label)));
    const value = el("dd", { class: "rui-description-value" });
    // Use the shared predicate: the hand-rolled `__kind === "Component"` check
    // missed author-defined components (`"UserComponent"`) and arrays, both of
    // which the declared `Node | string` type accepts — they rendered as
    // "[object Object]".
    if (isComponentNode(props.value) || Array.isArray(props.value)) {
      value.append(helpers.renderNode(props.value));
    } else {
      value.append(document.createTextNode(asString(props.value)));
    }
    root.append(labelWrap, value);
    return root;
  },
};

/**
 * `ActionStripe` is a full-width, clickable navigation row: an optional
 * leading icon, a label with optional description, an optional trailing
 * value/status, and a chevron affordance signalling "this row goes
 * somewhere". Stack several to build settings screens, product menus, and
 * drill-down lists — the row-based counterpart to a grid of `Tile`s.
 *
 * Unlike `ListItem` (presentational content row) an ActionStripe is always
 * interactive and renders as a real `<button>`/`<a>`.
 */
export const ActionStripe: ComponentSpec = {
  name: "ActionStripe",
  description:
    "Full-width clickable navigation row — leading icon, label + optional " +
    "description, an optional trailing `value` string or `trailing` node " +
    "(Switch, Badge, Avatar), and a chevron affordance. Stack them for " +
    "settings screens, product menus, and drill-down lists. Use `ListItem` " +
    "instead for a non-interactive content row.",
  props: [
    { name: "label", type: "string", positional: true },
    { name: "description", type: "string", optional: true, aliases: ["subtitle", "meta"] },
    { name: "icon", type: "string", optional: true, description: "Leading Font Awesome icon name" },
    { name: "value", type: "string", optional: true, description: "Trailing value / status text shown before the chevron" },
    { name: "href", type: "string", optional: true, description: "Render as a link instead of a button" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] },
    { name: "trailing", type: "Node", optional: true, description: "Trailing node before the chevron — Switch, Badge, Avatar (alternative to the string `value`)" },
    { name: "target", type: "string", optional: true, enum: ["_self", "_blank", "_parent", "_top"], description: "Link target; `_blank` also sets rel=\"noopener noreferrer\"" },
  ],
  render: (_node, props, helpers) => {
    const href = asString(props.href);
    const disabled = asBoolean(props.disabled);
    // `sanitiseCssUrl` (the old call here) is a CSS-literal escaper for
    // `url(...)`, not a scheme check, and its `|| href` fallback handed the RAW
    // value to the anchor — so `javascript:` reached a live `href`.
    const safeHref = href ? sanitiseHref(href) : "";
    // The tag is decided by `href` ALONE: flipping <a>→<button> when `disabled`
    // toggles makes the morph replace the node (tagName mismatch) and destroys
    // focus mid-interaction, and it also discarded the intended destination.
    const tag = safeHref ? "a" : "button";
    const target = asString(props.target);
    const root = el(tag as "button", {
      class: "rui-action-stripe",
      type: tag === "button" ? "button" : null,
      href: tag === "a" ? safeHref : null,
      target: tag === "a" && target ? target : null,
      // A new-tab link without `noopener` hands the opener window to the target.
      rel: tag === "a" && target === "_blank" ? "noopener noreferrer" : null,
      disabled: tag === "button" && disabled ? true : null,
      "aria-disabled": disabled ? "true" : null,
      tabindex: tag === "a" && disabled ? "-1" : null,
      "data-disabled": disabled ? "true" : null,
    });
    const iconNode = renderIcon(props.icon, { className: "rui-action-stripe-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("span", { class: "rui-action-stripe-body" });
    body.append(el("span", { class: "rui-action-stripe-label" }, [asString(props.label)]));
    const description = asString(props.description);
    if (description) {
      body.append(el("span", { class: "rui-action-stripe-description" }, [description]));
    }
    root.append(body);
    const value = asString(props.value);
    if (value) root.append(el("span", { class: "rui-action-stripe-value" }, [value]));
    if (props.trailing != null) {
      const trailing = el("span", { class: "rui-action-stripe-trailing" });
      trailing.append(helpers.renderNode(props.trailing));
      // A Switch/Badge in the trailing slot must not also fire the row itself —
      // flipping the toggle is not "open this settings page".
      trailing.onclick = (event) => event.stopPropagation();
      root.append(trailing);
    }
    root.append(el("span", { class: "rui-action-stripe-chevron", "aria-hidden": "true" }));
    if (disabled) {
      // Anchors ignore the `disabled` attribute, so activation is blocked here.
      root.onclick = (event) => { event.preventDefault(); };
    } else if (typeof props.onClick === "function") {
      root.onclick = () => helpers.invoke(props.onClick);
    }
    return root;
  },
};

export const DescriptionList: ComponentSpec = {
  name: "DescriptionList",
  description:
    "Compact key/value summary for detail pages — replaces a row of " +
    "`Text`s with a properly aligned `<dl>`. Children must be " +
    "DescriptionItem entries. Two columns by default on wide viewports.",
  props: [
    { name: "items", type: "DescriptionItem[]" },
    { name: "columns", type: "number", optional: true, description: "1 or 2 (default 2)" },
  ],
  render: (_node, props, helpers) => {
    // `Number("two")` was NaN and every Math wrapper propagated it, emitting
    // `data-columns="NaN"`. `asNumber` falls back instead.
    const requested = Math.floor(asNumber(props.columns, 2));
    const columns = Number.isFinite(requested) ? Math.max(1, Math.min(2, requested)) : 2;
    const root = el("dl", {
      class: "rui-description-list",
      "data-columns": String(columns),
    });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  },
};

export const StatusDot: ComponentSpec = {
  name: "StatusDot",
  description:
    "Inline status pip + label. Use for compact health/state indicators " +
    "in toolbars, sidebars, lists, and table cells.",
  props: [
    { name: "label", type: "string" },
    { name: "tone", type: "string", optional: true, aliases: ["variant"], enum: ["default", "primary", "success", "warning", "danger", "info"] },
    { name: "pulse", type: "boolean", optional: true, description: "Animate the dot for 'live' state" },
  ],
  render: (_node, props) => {
    const root = el("span", {
      class: "rui-status-dot",
      // Default to the neutral tone like every sibling pattern (and like the
      // stylesheet's own base marker): `StatusDot("Offline")` used to render a
      // bright green pip next to the word "Offline".
      "data-tone": asString(props.tone, "default"),
      "data-pulse": asBoolean(props.pulse) ? "true" : "false",
    });
    root.append(el("span", { class: "rui-status-dot-marker" }));
    root.append(el("span", { class: "rui-status-dot-label" }, [asString(props.label)]));
    return root;
  },
};

export const PricingCard: ComponentSpec = {
  name: "PricingCard",
  description:
    "Single pricing tier card with plan name, price, billing period, " +
    "description, bullet features, and a CTA button. Mark one tier as " +
    "`featured=true` to highlight it (raises the card and shows a ribbon — " +
    "\"Most popular\" unless `ribbon`/`badge` says otherwise). `features` " +
    "entries may be plain strings or `{label, included: false}` objects so a " +
    "cheaper tier can show what it does NOT include.",
  props: [
    { name: "plan", type: "string", description: "Tier name (e.g. 'Pro')" },
    { name: "price", type: "string", description: "Display price (e.g. '$29')" },
    { name: "period", type: "string", optional: true, description: "Billing period (e.g. '/mo')" },
    { name: "description", type: "string", optional: true },
    { name: "features", type: "string[] | {label, included}[]", optional: true, description: "Bullet list — strings are included features; `{label, included: false}` renders a struck-through/excluded bullet" },
    { name: "action", type: "Button", optional: true, aliases: ["cta"], description: "Primary CTA — pass a Button(...)" },
    { name: "badge", type: "string", optional: true, description: "Eyebrow / badge above the plan name" },
    { name: "featured", type: "boolean", optional: true, aliases: ["highlighted"] },
    { name: "ribbon", type: "string", optional: true, aliases: ["badgeLabel"], description: "Ribbon text for a featured tier (default \"Most popular\")" },
  ],
  render: (_node, props, helpers) => {
    const featured = asBoolean(props.featured);
    const root = el("article", {
      class: "rui-pricing-card",
      "data-featured": featured ? "true" : "false",
    });
    // `featured` promises a ribbon; without a label it used to raise the card
    // and show nothing at all, so the description and behaviour disagreed.
    const badge = asString(props.ribbon) || asString(props.badge) || (featured ? "Most popular" : "");
    if (badge) root.append(el("div", { class: "rui-pricing-card-badge" }, [badge]));
    root.append(el("h3", { class: "rui-pricing-card-plan" }, [asString(props.plan)]));
    const description = asString(props.description);
    if (description) root.append(el("p", { class: "rui-pricing-card-description" }, [description]));
    const priceRow = el("div", { class: "rui-pricing-card-price-row" });
    priceRow.append(el("span", { class: "rui-pricing-card-price" }, [asString(props.price)]));
    const period = asString(props.period);
    if (period) priceRow.append(el("span", { class: "rui-pricing-card-period" }, [period]));
    root.append(priceRow);
    const features = asArray<unknown>(props.features);
    if (features.length > 0) {
      const list = el("ul", { class: "rui-pricing-card-features" });
      for (const f of features) {
        const record = asRecord(f);
        const label = asString(record ? (record.label ?? record.text ?? record.name) : f);
        if (!label) continue;
        // Every bullet used to get a check mark, so a Free tier listing "SSO"
        // claimed to include it. `included: false` flips the mark.
        const included = record && record.included !== undefined ? asBoolean(record.included) : true;
        const check = renderIcon(included ? "circle-check" : "circle-xmark", { className: "rui-pricing-card-check" })
          ?? el("span", { class: "rui-pricing-card-check" });
        list.append(el("li", {
          class: "rui-pricing-card-feature",
          "data-included": included ? "true" : "false",
        }, [
          check,
          document.createTextNode(label),
        ]));
      }
      root.append(list);
    }
    if (props.action) {
      const wrap = el("div", { class: "rui-pricing-card-action" });
      wrap.append(helpers.renderNode(props.action));
      root.append(wrap);
    }
    return root;
  },
};

export const PricingTable: ComponentSpec = {
  name: "PricingTable",
  description:
    "Responsive grid of PricingCard tiers. Items size uniformly across a " +
    "row and wrap onto multiple rows on narrow viewports. Use as the " +
    "centerpiece of any pricing or upgrade page.",
  props: [
    { name: "tiers", type: "PricingCard[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default auto)" },
  ],
  render: (_node, props, helpers) => {
    // Same explicit read as FeatureGrid: `Number(props.columns ?? "auto")` is
    // NaN both when the prop is omitted AND when it is unparseable, so "auto"
    // and `columns: "three"` were indistinguishable.
    const requested = props.columns == null ? 0 : Math.floor(asNumber(props.columns, 0));
    const columns = requested > 0 ? Math.max(1, Math.min(4, requested)) : 0;
    const root = el("div", {
      class: "rui-pricing-table",
      "data-columns": columns > 0 ? String(columns) : null,
    });
    for (const tier of asArray(props.tiers)) root.append(helpers.renderNode(tier));
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Richer composition primitives
 *
 * These small, named patterns close the remaining gap between hand-rolled
 * `Stack(Card([...]))` blocks and the polished, dense layouts that LLMs
 * produce with shadcn/ui or Tailwind. Each component covers a recurring
 * UI motif (cover hero, media card, compact stat strip, icon tile, person
 * chip, inline notification) so the LLM can reach for a single line.
 * ----------------------------------------------------------------------- */

export const MediaCard: ComponentSpec = {
  name: "MediaCard",
  description:
    "Card with a media (image) header followed by title, body, optional " +
    "tags, footer meta, and an actions row. Use for article previews, " +
    "product cards, project highlights, gallery items — anywhere a Card " +
    "needs a leading image. Orient with `orientation=\"horizontal\"` for " +
    "side-by-side media + content on wide viewports. Pass `href` (or " +
    "`onClick`) to make the whole card the click target, which is what the " +
    "hover lift implies.",
  props: [
    { name: "title", type: "string" },
    { name: "imageSrc", type: "string", optional: true, aliases: ["src", "image"], description: "Image URL (omit to render a neutral placeholder)" },
    { name: "description", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true, description: "Tag pill labels" },
    { name: "meta", type: "string", optional: true, description: "Footer meta line (author · date · category)" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / Links rendered at the bottom" },
    { name: "badge", type: "string | Badge", optional: true, description: "Eyebrow string or Badge node shown over the image" },
    { name: "orientation", type: "string", optional: true, enum: ["vertical", "horizontal"] },
    { name: "ratio", type: "string", optional: true, description: "Media aspect ratio (default 16:9 vertical, 4:3 horizontal)" },
    { name: "href", type: "string", optional: true, description: "Make the whole card a link (article preview, product card, gallery item)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Called when the card is clicked" },
  ],
  render: (_node, props, helpers) => {
    const orientation = asString(props.orientation, "vertical");
    const href = asString(props.href) ? sanitiseHref(props.href) : "";
    const clickable = typeof props.onClick === "function";
    // The card lifts and turns brand-primary on hover, so it has to BE the
    // target: an anchor when it navigates, a button-roled article otherwise
    // (an <article> keeps the heading/paragraph markup valid).
    const root = el((href ? "a" : "article") as "article", {
      class: "rui-media-card",
      "data-orientation": orientation,
      href: href || null,
      "data-interactive": href || clickable ? "true" : null,
      role: !href && clickable ? "button" : null,
      tabindex: !href && clickable ? "0" : null,
    });
    if (clickable) {
      const fire = (): void => helpers.invoke(props.onClick);
      root.onclick = fire;
      if (!href) root.onkeydown = activateOnKey(fire);
    }
    const ratio = parseMediaRatio(asString(props.ratio, orientation === "horizontal" ? "4:3" : "16:9"));
    const media = el("div", {
      class: "rui-media-card-media",
      style: `aspect-ratio:${ratio};`,
    });
    const mediaPlaceholder = (): HTMLElement => renderIcon("image", { className: "rui-media-card-placeholder" })
      ?? el("span", { class: "rui-media-card-placeholder" });
    // Same error latch the avatars use: remember a dead image URL per src so
    // the placeholder swapped in below is re-emitted by the next render. Morph
    // replaces a node outright when the tag names differ, so a purely
    // imperative swap would be undone (and the dead URL re-requested) on every
    // commit. Keying by src re-arms the attempt when the author changes it.
    const rawSrc = sanitiseImageSrc(props.imageSrc);
    const mediaFailed = rawSrc ? helpers.useInstanceState<boolean>(`media-error:${rawSrc}`, false) : null;
    const imageSrc = mediaFailed?.get() ? "" : rawSrc;
    if (imageSrc) {
      const img = el("img", { src: imageSrc, alt: asString(props.title), loading: "lazy" });
      img.onerror = (event) => {
        mediaFailed?.set(true);
        const ev = event as Event;
        const live = (ev.currentTarget ?? ev.target) as Element;
        // Resolve the band from the live image — the `media` closure variable
        // may be a re-render snapshot the reconciler already discarded.
        const band = live.parentElement;
        live.replaceWith(mediaPlaceholder());
        band?.classList.add("rui-media-card-media-empty");
      };
      media.append(img);
    } else {
      media.classList.add("rui-media-card-media-empty");
      media.append(mediaPlaceholder());
    }
    if (props.badge) {
      const badgeWrap = el("span", { class: "rui-media-card-badge" });
      if (typeof props.badge === "string") {
        badgeWrap.append(document.createTextNode(asString(props.badge)));
      } else {
        badgeWrap.append(helpers.renderNode(props.badge));
      }
      media.append(badgeWrap);
    }
    root.append(media);

    const body = el("div", { class: "rui-media-card-body" });
    body.append(el("h3", { class: "rui-media-card-title" }, [asString(props.title)]));
    const description = asString(props.description);
    if (description) body.append(el("p", { class: "rui-media-card-description" }, [description]));
    const tags = asArray<unknown>(props.tags);
    if (tags.length > 0) {
      const row = el("div", { class: "rui-media-card-tags" });
      for (const t of tags) {
        const label = asString(t);
        if (label) row.append(el("span", { class: "rui-tag", "data-size": "sm" }, [
          el("span", { class: "rui-tag-label" }, [label]),
        ]));
      }
      body.append(row);
    }
    const meta = asString(props.meta);
    if (meta) body.append(el("p", { class: "rui-media-card-meta" }, [meta]));
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-media-card-actions");
      // The card root can be a link/button now — a click on "Buy" must not also
      // trigger the card's own navigation.
      if (href || clickable) actions.onclick = (event) => event.stopPropagation();
      body.append(actions);
    }
    root.append(body);
    return root;
  },
};

function parseMediaRatio(input: string): string {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    // Guard BOTH sides: `"-16:9"` produced `aspect-ratio:-16 / 9`, an invalid
    // declaration the browser drops, collapsing the media band to 0px.
    if (Number.isFinite(num) && num > 0 && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}

/**
 * Render a tiny inline sparkline as an SVG. Shared by `Stats`, `StatCard`,
 * and the standalone `Sparkline` component so the visual language stays
 * consistent across surfaces. `tone` maps to a CSS variable so themes can
 * override the stroke colour.
 */
export function renderInlineSparkline(values: number[], tone = "primary"): SVGSVGElement {
  const width = 80;
  const height = 24;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "rui-sparkline");
  svg.setAttribute("data-tone", tone);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");
  if (values.length < 2) return svg;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, i) => {
    const x = i * step;
    // Bias by 2px padding top/bottom so the stroke is fully visible.
    const y = 2 + ((max - value) / range) * (height - 4);
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const area = document.createElementNS(svgNS, "path");
  area.setAttribute("d", areaPath);
  area.setAttribute("class", "rui-sparkline-area");
  svg.appendChild(area);
  const line = document.createElementNS(svgNS, "path");
  line.setAttribute("d", linePath);
  line.setAttribute("class", "rui-sparkline-line");
  line.setAttribute("fill", "none");
  svg.appendChild(line);
  return svg;
}

export const Stats: ComponentSpec = {
  name: "Stats",
  description:
    "KPI strip or grid. Pass `items` as `{label, value, hint?, tone?, spark?}` " +
    "objects for strip layout, or as `StatCard(...)` nodes when `layout=\"grid\"`.",
  props: [
    { name: "items", type: "object[] | StatCard[]", description: "Stat objects or StatCard nodes when layout=grid" },
    { name: "layout", type: "string", optional: true, enum: ["strip", "grid"], description: "strip = horizontal row; grid = responsive Grid" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count for grid layout (1–6)" },
    { name: "align", type: "string", optional: true, enum: ["start", "center", "end"], description: "Strip alignment (layout=strip only)" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const hasComponentItems = items.some((item) => isComponentNode(item));
    // Detection WINS over the prop for the incompatible case: the strip path
    // reads `{label, value}` fields a component node does not have, so
    // `layout: "strip"` with StatCard items rendered one empty block per KPI.
    const layout = hasComponentItems ? "grid" : asString(props.layout, "strip");
    if (layout === "grid") {
      const columns = props.columns ? Math.max(1, Math.min(6, Math.floor(asNumber(props.columns)))) : 0;
      const gridNode = Grid.render(
        { __kind: "Component", name: "Grid", args: [], argMeta: [] },
        {
          children: items,
          columns: columns > 0 ? columns : "auto",
          gap: "m",
        },
        helpers,
      ) as HTMLElement;
      gridNode.classList.add("rui-metric-grid");
      return gridNode;
    }
    const align = asString(props.align, "start");
    const root = el("div", { class: "rui-stats", "data-align": align });
    for (const raw of items) {
      const item = (raw ?? {}) as {
        label?: unknown; value?: unknown; hint?: unknown; tone?: unknown; spark?: unknown;
      };
      const tone = asString(item.tone, "default");
      const block = el("div", { class: "rui-stats-item", "data-tone": tone });
      block.append(el("div", { class: "rui-stats-label" }, [asString(item.label)]));
      const valueRow = el("div", { class: "rui-stats-value-row" });
      valueRow.append(el("div", { class: "rui-stats-value" }, [asString(item.value)]));
      const sparkValues = asArray<unknown>(item.spark).map((v) => Number(v)).filter((n) => Number.isFinite(n));
      if (sparkValues.length > 1) {
        valueRow.append(renderInlineSparkline(sparkValues, tone));
      }
      block.append(valueRow);
      const hint = asString(item.hint);
      if (hint) block.append(el("div", { class: "rui-stats-hint" }, [hint]));
      root.append(block);
    }
    return root;
  },
};

export const Tile: ComponentSpec = {
  name: "Tile",
  description:
    "Compact icon + label + optional value tile. Smaller and denser than " +
    "`StatCard`, ideal for menu grids, quick-action panels, category " +
    "directories, and category filters. Pair with `Grid` for uniform rows. " +
    "Pass `href` for a directory tile that links to a route, and `selected` " +
    "for the on-state of a filter tile.",
  props: [
    { name: "label", type: "string" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "value", type: "string", optional: true, description: "Secondary value rendered next to/under the label" },
    { name: "description", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, aliases: ["variant"], enum: SURFACE_TONES },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] },
    { name: "href", type: "string", optional: true, description: "Render the tile as a link to this URL" },
    { name: "selected", type: "boolean", optional: true, aliases: ["active"], description: "Mark the tile as currently applied/current (filter grids, category directories)" },
  ],
  render: (_node, props, helpers) => {
    const isClickable = typeof props.onClick === "function";
    const href = asString(props.href) ? sanitiseHref(props.href) : "";
    const tag = href ? "a" : isClickable ? "button" : "div";
    const declaresSelected = props.selected !== undefined && props.selected !== null;
    const selected = asBoolean(props.selected);
    const root = el(tag as "div", {
      type: tag === "button" ? "button" : null,
      href: href || null,
      class: "rui-tile",
      "data-tone": asString(props.tone, "default"),
      // A filter tile needs an on-state that is more than a CSS hook: pressed
      // for a toggle, current-page for a link.
      "data-selected": selected ? "true" : null,
      "aria-pressed": tag === "button" && declaresSelected ? (selected ? "true" : "false") : null,
      "aria-current": tag === "a" && selected ? "page" : null,
    });
    const iconNode = renderIcon(props.icon, { className: "rui-tile-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-tile-body" });
    body.append(el("div", { class: "rui-tile-label" }, [asString(props.label)]));
    const value = asString(props.value);
    if (value) body.append(el("div", { class: "rui-tile-value" }, [value]));
    const description = asString(props.description);
    if (description) body.append(el("div", { class: "rui-tile-description" }, [description]));
    root.append(body);
    if (isClickable) {
      root.onclick = () => helpers.invoke(props.onClick);
    }
    return root;
  },
};

export const Notification: ComponentSpec = {
  name: "Notification",
  description:
    "Inline notification card with title, message, time, optional avatar, " +
    "and dismiss/action buttons. Use inside notification panels, inboxes, " +
    "or activity drawers — for top-of-page announcements prefer `Banner`. " +
    "Pass `onClick` to make the whole row open the underlying item, " +
    "`dismissible`/`onDismiss` for a per-item close button, and `author` " +
    "when `avatarSrc` is set so the avatar carries the actor's name.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true, aliases: ["description"] },
    { name: "time", type: "string", optional: true, description: "Relative or absolute timestamp" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"], description: "Avatar URL (alternative to `icon`)" },
    { name: "tone", type: "string", optional: true, aliases: ["variant"], enum: SURFACE_TONES },
    { name: "unread", type: "boolean", optional: true, description: "Highlights the card with an accent" },
    { name: "actions", type: "Node[]", optional: true },
    // New props are appended, never inserted: a positional call fills slots in
    // declaration order, so a mid-list insert would silently re-route args.
    { name: "author", type: "string", optional: true, aliases: ["actor"], description: "Person the notification is about — supplies the avatar's alt text and initials fallback" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Called when the row is clicked — open the item / mark it read" },
    { name: "dismissible", type: "boolean", optional: true, aliases: ["closable"], description: "Show a close button that removes the notification" },
    { name: "onDismiss", type: "callable", optional: true, aliases: ["onClose"], description: "Called when the notification is dismissed (implies `dismissible`)" },
  ],
  render: (_node, props, helpers) => {
    const isUnread = asBoolean(props.unread);
    const clickable = typeof props.onClick === "function";
    const dismissible = asBoolean(props.dismissible) || props.onDismiss != null;
    const dismissed = helpers.useInstanceState<boolean>("dismissed", false);
    if (dismissible && dismissed.get()) {
      // Same tag, no children: the morph patches the row away instead of
      // replacing the node, and a later re-render re-emits this so the card
      // stays dismissed. `hidden` alone is not enough — the author-sheet
      // `.rui-notification { display: flex }` outranks the UA `[hidden]` rule.
      return el("article", {
        class: "rui-notification",
        "data-tone": asString(props.tone, "default"),
        "data-dismissed": "true",
        hidden: true,
        style: "display:none",
      });
    }
    // Opening the underlying item by tapping the row is the primary gesture of
    // every notification list, so the card itself becomes the control.
    const root = el("article", {
      class: "rui-notification",
      "data-tone": asString(props.tone, "default"),
      "data-unread": isUnread ? "true" : "false",
      "data-clickable": clickable ? "true" : null,
      role: clickable ? "button" : null,
      tabindex: clickable ? "0" : null,
    });
    if (clickable) {
      const fire = (): void => helpers.invoke(props.onClick);
      root.onclick = fire;
      root.onkeydown = activateOnKey(fire);
    }
    const avatarSrc = asString(props.avatarSrc);
    const visual = el("div", { class: "rui-notification-visual" });
    if (avatarSrc) {
      // The NAME, never the title: the headline produced nonsense initials
      // ("Deployment failed" → "DE") on a 404 and made screen readers read the
      // title twice. Empty falls back to a decorative alt + "?" initials.
      visual.append(renderAvatar(avatarSrc, asString(props.author), "md", helpers));
    } else {
      const iconNode = renderIcon(asString(props.icon, "bell"), { className: "rui-notification-icon" });
      if (iconNode) visual.append(iconNode);
    }
    root.append(visual);
    const body = el("div", { class: "rui-notification-body" });
    const head = el("header", { class: "rui-notification-head" });
    const titleWrap = el("span", { class: "rui-notification-title-wrap" });
    if (isUnread) {
      // `aria-label` on an empty generic span is not exposed, so the unread
      // state was colour-only. Carry it as real (visually hidden) text instead.
      titleWrap.append(el("span", { class: "rui-notification-unread-dot", "aria-hidden": "true" }));
      titleWrap.append(el("span", { class: "rui-visually-hidden" }, ["Unread"]));
    }
    titleWrap.append(el("span", { class: "rui-notification-title" }, [asString(props.title)]));
    head.append(titleWrap);
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-notification-time" }, [time]));
    body.append(head);
    const message = asString(props.message);
    if (message) body.append(el("p", { class: "rui-notification-message" }, [message]));
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-notification-actions");
      // The row itself may be the click target — "Approve" must not also open it.
      if (clickable) actions.onclick = (event) => event.stopPropagation();
      body.append(actions);
    }
    root.append(body);
    if (dismissible) {
      const close = el("button", {
        class: "rui-notification-dismiss",
        type: "button",
        "aria-label": "Dismiss",
      });
      close.append(renderIcon("xmark", { className: "rui-notification-dismiss-icon" }) ?? document.createTextNode("×"));
      close.onclick = (event) => {
        event.stopPropagation();
        dismissed.set(true);
        // Instance state does not schedule a render, so hide the LIVE card now,
        // resolved from the event — the captured node may be a discarded
        // re-render snapshot.
        const live = closestFrom(event.currentTarget ?? event.target, ".rui-notification");
        if (live) {
          live.setAttribute("data-dismissed", "true");
          live.hidden = true;
          live.style.display = "none";
        }
        helpers.invoke(props.onDismiss);
      };
      root.append(close);
    }
    return root;
  },
};

export const PersonChip: ComponentSpec = {
  name: "PersonChip",
  description:
    "Inline avatar + name + optional role/meta pill. Use anywhere a " +
    "person needs to be referenced compactly: table cells, list rows, " +
    "comments, kanban cards, sidebar footers. Pair multiple chips with " +
    "`Stack(direction=\"row\", wrap=true)` for assignee lists.",
  props: [
    { name: "name", type: "string" },
    { name: "role", type: "string", optional: true, description: "Sub-line below the name (role, email, handle, …)" },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "status", type: "string", optional: true, enum: ["online", "offline", "busy", "away"] },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] },
  ],
  render: (_node, props, helpers) => {
    const isClickable = typeof props.onClick === "function";
    const tag = isClickable ? "button" : "div";
    const size = asString(props.size, "md");
    const avatarSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";
    const root = el(tag as "div", {
      type: isClickable ? "button" : null,
      class: "rui-person-chip",
      "data-size": size,
    });
    const avatarWrap = el("span", { class: "rui-person-chip-avatar" });
    avatarWrap.append(renderAvatar(asString(props.avatarSrc), asString(props.name), avatarSize, helpers));
    const status = asString(props.status);
    if (status) {
      // Presence was colour-only on an 8px dot: unreadable to a screen reader
      // and indistinguishable (busy vs online) for a red-green colour-blind
      // user. Give it a name of its own.
      avatarWrap.append(el("span", {
        class: "rui-person-chip-status",
        "data-status": status,
        role: "img",
        "aria-label": status,
        title: status,
      }));
    }
    root.append(avatarWrap);
    const meta = el("div", { class: "rui-person-chip-meta" });
    meta.append(el("span", { class: "rui-person-chip-name" }, [asString(props.name)]));
    const role = asString(props.role);
    if (role) meta.append(el("span", { class: "rui-person-chip-role" }, [role]));
    root.append(meta);
    if (isClickable) {
      root.onclick = () => helpers.invoke(props.onClick);
    }
    return root;
  },
};

