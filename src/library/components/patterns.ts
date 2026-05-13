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

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import {
  el, asArray, asString, asBoolean, renderIcon,
  sanitiseCssLength, sanitiseCssUrl, sanitiseImageSrc,
} from "../utils.js";
import { renderAvatar } from "./_internal.js";

const SURFACE_TONES = ["default", "primary", "success", "warning", "danger", "info"] as const;

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

export const Hero: ComponentSpec = {
  name: "Hero",
  description:
    "Eye-catching landing/marketing header with eyebrow tag, title, subtitle, " +
    "optional bullet highlights, and primary/secondary CTA buttons. Use as the " +
    "first child of `root` when introducing a product, feature, or new section.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
    { name: "primary", type: "Button", optional: true, description: "Primary CTA — pass a Button(...)" },
    { name: "secondary", type: "Button", optional: true, description: "Secondary CTA — pass a Button(...)" },
    { name: "eyebrow", type: "string", optional: true, description: "Short uppercase tag above the title" },
    { name: "highlights", type: "string[]", optional: true, description: "Bullet items rendered as tag pills" },
    { name: "imageSrc", type: "string", optional: true, description: "Optional illustration src" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES, description: "Accent tone" },
  ],
  render: (_node, props, helpers) => {
    // Resolve the safe image URL up front so the `data-has-image` flag stays
    // in sync with whether we actually render the `<img>` element — a hostile
    // `javascript:` src would otherwise leave the layout reserving space for
    // an image that never appears.
    const heroImageSrc = sanitiseImageSrc(props.imageSrc);
    const root = el("section", {
      class: "rui-hero",
      "data-tone": asString(props.tone, "primary"),
      "data-has-image": heroImageSrc ? "true" : "false",
    });
    const body = el("div", { class: "rui-hero-body" });

    const eyebrow = asString(props.eyebrow);
    if (eyebrow) body.append(el("span", { class: "rui-hero-eyebrow" }, [eyebrow]));

    body.append(el("h1", { class: "rui-hero-title" }, [asString(props.title)]));

    const subtitle = asString(props.subtitle);
    if (subtitle) body.append(el("p", { class: "rui-hero-subtitle" }, [subtitle]));

    const highlights = asArray<unknown>(props.highlights);
    if (highlights.length > 0) {
      const tags = el("div", { class: "rui-hero-highlights" });
      for (const h of highlights) {
        const label = asString(h);
        if (label) tags.append(el("span", { class: "rui-hero-highlight" }, [label]));
      }
      body.append(tags);
    }

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

export const PageHeader: ComponentSpec = {
  name: "PageHeader",
  description:
    "Page-level header with breadcrumbs, title, subtitle, status tag, and a " +
    "right-aligned actions row. The canonical first child for any dashboard, " +
    "settings, or detail page — replaces ad-hoc Stack+Header+Buttons stitching.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
    { name: "breadcrumbs", type: "string[] | Breadcrumb", optional: true, description: "Array of strings, or a Breadcrumb(...) node" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / NavLinks shown on the right" },
    { name: "status", type: "Badge | Tag", optional: true, description: "Optional Badge(...) or Tag(...) rendered next to the title" },
  ],
  render: (_node, props, helpers) => {
    const root = el("header", { class: "rui-page-header" });

    const crumbs = props.breadcrumbs;
    if (crumbs) {
      const crumbWrap = el("div", { class: "rui-page-header-breadcrumbs" });
      if (Array.isArray(crumbs)) {
        crumbs.forEach((c, i) => {
          if (i > 0) crumbWrap.append(el("span", { class: "rui-page-header-crumb-sep" }, ["/"]));
          crumbWrap.append(el("span", { class: "rui-page-header-crumb" }, [asString(c)]));
        });
      } else {
        crumbWrap.append(helpers.renderNode(crumbs));
      }
      root.append(crumbWrap);
    }

    const titleRow = el("div", { class: "rui-page-header-title-row" });
    const titleBlock = el("div", { class: "rui-page-header-title-block" });
    const titleLine = el("div", { class: "rui-page-header-title-line" });
    titleLine.append(el("h1", { class: "rui-page-header-title" }, [asString(props.title)]));
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

export const MetricGrid: ComponentSpec = {
  name: "MetricGrid",
  description:
    "Responsive grid of StatCard tiles (auto 2/3/4 columns based on viewport). " +
    "Use as the KPI strip at the top of any dashboard. Pass an array of " +
    "StatCard(...) values as items.",
  props: [
    { name: "items", type: "StatCard[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (1–6, default auto)" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const columns = Math.max(1, Math.min(6, Number(props.columns ?? "auto")));
    const root = el("div", {
      class: "rui-metric-grid",
      "data-columns": columns > 0 ? String(columns) : null,
    });
    for (const item of items) root.append(helpers.renderNode(item));
    return root;
  },
};

export const EmptyState: ComponentSpec = {
  name: "EmptyState",
  description:
    "Zero-state placeholder for empty lists, searches, dashboards. Renders a " +
    "centered icon, title, description, and optional CTA. Always preferable to " +
    "an empty Card with raw text.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name (defaults to \"inbox\")" },
    { name: "action", type: "Button", optional: true, description: "Optional Button(...) CTA" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-empty-state" });
    const iconName = asString(props.icon, "inbox");
    const iconNode = renderIcon(iconName, { className: "rui-empty-state-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("h3", { class: "rui-empty-state-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-empty-state-description" }, [desc]));
    if (props.action) {
      const wrap = el("div", { class: "rui-empty-state-action" });
      wrap.append(helpers.renderNode(props.action));
      root.append(wrap);
    }
    return root;
  },
};

export const TimelineItem: ComponentSpec = {
  name: "TimelineItem",
  description: "Single event on a Timeline.",
  props: [
    { name: "title", type: "string" },
    { name: "time", type: "string", optional: true, description: "Display label (ISO, relative, etc.)" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name rendered inside the marker" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
  ],
  render: (_node, props) => {
    const li = el("li", {
      class: "rui-timeline-item",
      "data-tone": asString(props.tone, "default"),
    });
    const marker = el("span", { class: "rui-timeline-marker" });
    const iconNode = renderIcon(props.icon);
    if (iconNode) marker.append(iconNode);
    li.append(marker);

    const body = el("div", { class: "rui-timeline-body" });
    const head = el("div", { class: "rui-timeline-head" });
    head.append(el("span", { class: "rui-timeline-title" }, [asString(props.title)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-timeline-time" }, [time]));
    body.append(head);

    const desc = asString(props.description);
    if (desc) body.append(el("div", { class: "rui-timeline-description" }, [desc]));

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
  description: "Single tile on a FeatureGrid.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
  ],
  render: (_node, props) => {
    const root = el("div", {
      class: "rui-feature-item",
      "data-tone": asString(props.tone, "primary"),
    });
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
    const columns = Math.max(1, Math.min(4, Number(props.columns ?? "auto")));
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
    { name: "author", type: "string" },
    { name: "role", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true },
    { name: "rating", type: "number", optional: true, description: "0–5 stars" },
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-testimonial" });
    const rating = Math.max(0, Math.min(5, Math.round(Number(props.rating ?? 0))));
    if (rating > 0) {
      const stars = el("div", { class: "rui-testimonial-rating" });
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
    { name: "avatarSrc", type: "string", optional: true, description: "Avatar image src; falls back to initials" },
    { name: "bio", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons to render at the bottom" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-profile-card" });
    const header = el("div", { class: "rui-profile-card-header" });
    header.append(renderAvatar(asString(props.avatarSrc), asString(props.name), "lg"));
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
    "body, and an optional row of action buttons (reply, like, …).",
  props: [
    { name: "author", type: "string" },
    { name: "body", type: "string" },
    { name: "time", type: "string", optional: true, description: "Relative or absolute timestamp" },
    { name: "avatarSrc", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("article", { class: "rui-comment" });
    root.append(renderAvatar(asString(props.avatarSrc), asString(props.author), "md"));
    const body = el("div", { class: "rui-comment-body" });
    const head = el("header", { class: "rui-comment-header" });
    head.append(el("span", { class: "rui-comment-author" }, [asString(props.author)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-comment-time" }, [time]));
    body.append(head);
    body.append(el("div", { class: "rui-comment-content" }, [asString(props.body)]));
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
    "release notes, or downtime notices. For inline notices prefer Callout " +
    "or Alert.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true },
    { name: "action", type: "Button", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
  ],
  render: (_node, props, helpers) => {
    const root = el("aside", {
      class: "rui-banner",
      "data-tone": asString(props.tone, "primary"),
    });
    const iconNode = renderIcon(props.icon, { className: "rui-banner-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-banner-body" });
    body.append(el("strong", { class: "rui-banner-title" }, [asString(props.title)]));
    const msg = asString(props.message);
    if (msg) body.append(el("span", { class: "rui-banner-message" }, [msg]));
    root.append(body);
    if (props.action) {
      const wrap = el("div", { class: "rui-banner-action" });
      wrap.append(helpers.renderNode(props.action));
      root.append(wrap);
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
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name shown beside the title" },
    { name: "action", type: "Action", optional: true, description: "Optional Action(...) fired when the card is clicked" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-kanban-card",
      "data-tone": asString(props.tone, "default"),
    });
    if (isActionPayload(props.action)) {
      root.setAttribute("role", "button");
      root.setAttribute("tabindex", "0");
      root.onclick = () => helpers.runAction(props.action);
      root.onkeydown = (event) => {
        const e = event as KeyboardEvent;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          helpers.runAction(props.action);
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
      footer.append(renderAvatar("", assignee, "sm"));
      footer.append(el("span", { class: "rui-kanban-card-assignee" }, [assignee]));
      root.append(footer);
    }
    return root;
  },
};

export const KanbanColumn: ComponentSpec = {
  name: "KanbanColumn",
  description: "Single column inside a KanbanBoard. Children must be KanbanCard entries.",
  props: [
    { name: "title", type: "string" },
    { name: "items", type: "KanbanCard[]" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES, description: "Header accent tone" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const root = el("section", {
      class: "rui-kanban-column",
      "data-tone": asString(props.tone, "default"),
    });
    const header = el("header", { class: "rui-kanban-column-header" });
    header.append(el("span", { class: "rui-kanban-column-title" }, [asString(props.title)]));
    header.append(el("span", { class: "rui-kanban-column-count" }, [String(items.length)]));
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

export const KanbanBoard: ComponentSpec = {
  name: "KanbanBoard",
  description:
    "Horizontal Kanban board. Children must be KanbanColumn entries. The " +
    "board scrolls horizontally on narrow viewports so columns stay readable.",
  props: [{ name: "columns", type: "KanbanColumn[]" }],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-kanban-board" });
    for (const column of asArray(props.columns)) root.append(helpers.renderNode(column));
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
    { name: "subtitle", type: "string", optional: true },
    { name: "eyebrow", type: "string", optional: true, description: "Short uppercase label above the title" },
    { name: "status", type: "Badge | Tag", optional: true },
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

export const Toolbar: ComponentSpec = {
  name: "Toolbar",
  description:
    "Horizontal toolbar for filters, search, view modes, and primary " +
    "actions. Left and right slots wrap onto separate rows on narrow " +
    "viewports so the bar never overflows. Use ABOVE a Table, List, " +
    "Grid, or Kanban view — never replace `PageHeader` with it.",
  props: [
    { name: "left", type: "Node[]", optional: true, description: "Filters / search inputs / chips" },
    { name: "right", type: "Node[]", optional: true, description: "Primary action buttons" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-toolbar" });
    const left = el("div", { class: "rui-toolbar-side rui-toolbar-left" });
    for (const child of asArray(props.left)) left.append(helpers.renderNode(child));
    root.append(left);
    const right = el("div", { class: "rui-toolbar-side rui-toolbar-right" });
    for (const child of asArray(props.right)) right.append(helpers.renderNode(child));
    root.append(right);
    return root;
  },
};

export const SidebarItem: ComponentSpec = {
  name: "SidebarItem",
  description:
    "Single navigation item inside a Sidebar. Pass `active=true` to mark " +
    "as the current page, an `action` Action for click handling, or an " +
    "optional `badge` (string/number) for a trailing chip.",
  props: [
    { name: "label", type: "string" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name rendered before the label" },
    { name: "active", type: "boolean", optional: true },
    { name: "badge", type: "string", optional: true, description: "Trailing chip (count or status)" },
    { name: "action", type: "Action", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("button", {
      type: "button",
      class: "rui-sidebar-item",
      "data-active": asBoolean(props.active) ? "true" : "false",
    });
    const iconNode = renderIcon(props.icon, { className: "rui-sidebar-item-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("span", { class: "rui-sidebar-item-label" }, [asString(props.label)]));
    const badge = asString(props.badge);
    if (badge) root.append(el("span", { class: "rui-sidebar-item-badge" }, [badge]));
    if (isActionPayload(props.action)) {
      root.onclick = () => helpers.runAction(props.action);
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
    "items (`SidebarItem` or `SidebarSection`), and an optional footer. " +
    "Use inside `AppShell` for SaaS-style left navigation.",
  props: [
    { name: "items", type: "(SidebarItem | SidebarSection)[]" },
    { name: "brand", type: "string", optional: true, description: "Product name / workspace label at the top" },
    { name: "tagline", type: "string", optional: true },
    { name: "footer", type: "Node[]", optional: true, description: "Footer block (Avatar + name, upgrade CTA, …)" },
  ],
  render: (_node, props, helpers) => {
    const root = el("aside", { class: "rui-sidebar" });
    const brand = asString(props.brand);
    const tagline = asString(props.tagline);
    if (brand || tagline) {
      const header = el("div", { class: "rui-sidebar-header" });
      if (brand) header.append(el("div", { class: "rui-sidebar-brand" }, [brand]));
      if (tagline) header.append(el("div", { class: "rui-sidebar-tagline" }, [tagline]));
      root.append(header);
    }
    const body = el("nav", { class: "rui-sidebar-body" });
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
    "settings + sections, admin panels). Collapses to a single column on " +
    "narrow viewports.",
  props: [
    { name: "sidebar", type: "Sidebar", description: "Pass a Sidebar(...) node" },
    { name: "content", type: "Node[]", description: "Main content (typically starts with a PageHeader)" },
    { name: "topbar", type: "Node[]", optional: true, description: "Optional thin top bar above the content" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-app-shell" });
    root.append(helpers.renderNode(props.sidebar));
    const main = el("div", { class: "rui-app-shell-main" });
    const topbar = asArray<unknown>(props.topbar);
    if (topbar.length > 0) {
      const bar = el("div", { class: "rui-app-shell-topbar" });
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

export const SplitView: ComponentSpec = {
  name: "SplitView",
  description:
    "Two-pane master/detail layout — a narrow primary pane on the left, " +
    "wider detail pane on the right. Collapses to a single column on " +
    "narrow viewports. Use for inboxes, file browsers, contact lists.",
  props: [
    { name: "primary", type: "Node[]", description: "Master pane content (list, filters)" },
    { name: "detail", type: "Node[]", description: "Detail pane content (selected item, empty state)" },
    { name: "primaryWidth", type: "string", optional: true, description: "CSS width for the primary pane (default 320px)" },
  ],
  render: (_node, props, helpers) => {
    const width = sanitiseCssLength(asString(props.primaryWidth), "320px");
    const root = el("div", { class: "rui-split-view", style: `--rui-split-primary:${width}` });
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
    if (props.value && typeof props.value === "object" && (props.value as { __kind?: string }).__kind === "Component") {
      value.append(helpers.renderNode(props.value));
    } else {
      value.append(document.createTextNode(asString(props.value)));
    }
    root.append(labelWrap, value);
    return root;
  },
};

export const DescriptionList: ComponentSpec = {
  name: "DescriptionList",
  description:
    "Compact key/value summary for detail pages — replaces a row of " +
    "`TextContent`s with a properly aligned `<dl>`. Children must be " +
    "DescriptionItem entries. Two columns by default on wide viewports.",
  props: [
    { name: "items", type: "DescriptionItem[]" },
    { name: "columns", type: "number", optional: true, description: "1 or 2 (default 2)" },
  ],
  render: (_node, props, helpers) => {
    const columns = Math.max(1, Math.min(2, Math.floor(Number(props.columns ?? 2))));
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
    { name: "tone", type: "string", optional: true, enum: ["default", "primary", "success", "warning", "danger", "info"] },
    { name: "pulse", type: "boolean", optional: true, description: "Animate the dot for 'live' state" },
  ],
  render: (_node, props) => {
    const root = el("span", {
      class: "rui-status-dot",
      "data-tone": asString(props.tone, "success"),
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
    "`featured=true` to highlight it (raises the card, adds a ribbon).",
  props: [
    { name: "plan", type: "string", description: "Tier name (e.g. 'Pro')" },
    { name: "price", type: "string", description: "Display price (e.g. '$29')" },
    { name: "period", type: "string", optional: true, description: "Billing period (e.g. '/mo')" },
    { name: "description", type: "string", optional: true },
    { name: "features", type: "string[]", optional: true, description: "Bullet list of included features" },
    { name: "action", type: "Button", optional: true, description: "Primary CTA — pass a Button(...)" },
    { name: "badge", type: "string", optional: true, description: "Eyebrow / badge above the plan name" },
    { name: "featured", type: "boolean", optional: true },
  ],
  render: (_node, props, helpers) => {
    const featured = asBoolean(props.featured);
    const root = el("article", {
      class: "rui-pricing-card",
      "data-featured": featured ? "true" : "false",
    });
    const badge = asString(props.badge);
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
        const label = asString(f);
        if (!label) continue;
        const check = renderIcon("circle-check", { className: "rui-pricing-card-check" })
          ?? el("span", { class: "rui-pricing-card-check" });
        list.append(el("li", { class: "rui-pricing-card-feature" }, [
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
    const columns = Math.max(1, Math.min(4, Math.floor(Number(props.columns ?? "auto"))));
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

export const Cover: ComponentSpec = {
  name: "Cover",
  description:
    "Image-backed hero band with a gradient overlay, eyebrow tag, title, " +
    "subtitle, optional caption row, and CTA buttons. Use as the top " +
    "section of product, article, or campaign pages — distinct from " +
    "`Hero`, which is text-first with an optional side image.",
  props: [
    { name: "title", type: "string" },
    { name: "imageSrc", type: "string", description: "Background image URL" },
    { name: "subtitle", type: "string", optional: true },
    { name: "eyebrow", type: "string", optional: true, description: "Short uppercase label above the title" },
    { name: "caption", type: "string", optional: true, description: "Small caption rendered above the actions" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons (typically Button(...) nodes)" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES, description: "Overlay accent tone" },
    { name: "height", type: "string", optional: true, description: "Min-height CSS value (default 280px)" },
  ],
  render: (_node, props, helpers) => {
    // Sanitise both interpolated values to prevent style-injection: a hostile
    // `imageSrc` containing `');…` could break out of the `url()` literal and
    // inject arbitrary CSS declarations, and `height` is interpolated directly
    // into the rule.
    const safeImageSrc = sanitiseCssUrl(asString(props.imageSrc));
    const safeHeight = sanitiseCssLength(asString(props.height), "280px");
    const root = el("section", {
      class: "rui-cover",
      "data-tone": asString(props.tone, "primary"),
      style: `background-image:linear-gradient(180deg, rgba(15, 23, 42, 0.05) 0%, rgba(15, 23, 42, 0.62) 100%), url("${safeImageSrc}");min-height:${safeHeight};`,
    });
    const body = el("div", { class: "rui-cover-body" });
    const eyebrow = asString(props.eyebrow);
    if (eyebrow) body.append(el("span", { class: "rui-cover-eyebrow" }, [eyebrow]));
    body.append(el("h1", { class: "rui-cover-title" }, [asString(props.title)]));
    const subtitle = asString(props.subtitle);
    if (subtitle) body.append(el("p", { class: "rui-cover-subtitle" }, [subtitle]));
    const caption = asString(props.caption);
    if (caption) body.append(el("p", { class: "rui-cover-caption" }, [caption]));
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-cover-actions");
      body.append(actions);
    }
    root.append(body);
    return root;
  },
};

export const MediaCard: ComponentSpec = {
  name: "MediaCard",
  description:
    "Card with a media (image) header followed by title, body, optional " +
    "tags, footer meta, and an actions row. Use for article previews, " +
    "product cards, project highlights, gallery items — anywhere a Card " +
    "needs a leading image. Orient with `orientation=\"horizontal\"` for " +
    "side-by-side media + content on wide viewports.",
  props: [
    { name: "title", type: "string" },
    { name: "imageSrc", type: "string", optional: true, description: "Image URL (omit to render a neutral placeholder)" },
    { name: "description", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true, description: "Tag pill labels" },
    { name: "meta", type: "string", optional: true, description: "Footer meta line (author · date · category)" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / Links rendered at the bottom" },
    { name: "badge", type: "string | Badge", optional: true, description: "Eyebrow string or Badge node shown over the image" },
    { name: "orientation", type: "string", optional: true, enum: ["vertical", "horizontal"] },
    { name: "ratio", type: "string", optional: true, description: "Media aspect ratio (default 16:9 vertical, 4:3 horizontal)" },
  ],
  render: (_node, props, helpers) => {
    const orientation = asString(props.orientation, "vertical");
    const root = el("article", {
      class: "rui-media-card",
      "data-orientation": orientation,
    });
    const ratio = parseMediaRatio(asString(props.ratio, orientation === "horizontal" ? "4:3" : "16:9"));
    const media = el("div", {
      class: "rui-media-card-media",
      style: `aspect-ratio:${ratio};`,
    });
    const imageSrc = sanitiseImageSrc(props.imageSrc);
    if (imageSrc) {
      media.append(el("img", { src: imageSrc, alt: asString(props.title), loading: "lazy" }));
    } else {
      media.classList.add("rui-media-card-media-empty");
      const placeholder = renderIcon("image", { className: "rui-media-card-placeholder" })
        ?? el("span", { class: "rui-media-card-placeholder" });
      media.append(placeholder);
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
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}

export const Stats: ComponentSpec = {
  name: "Stats",
  description:
    "Compact horizontal stat strip of `{label, value, hint?, tone?}` " +
    "entries. Lighter than `MetricGrid` — use inside a Card alongside a " +
    "chart, in a Toolbar, or beneath a PageHeader when you need a few " +
    "inline KPIs without taking over the layout.",
  props: [
    { name: "items", type: "any[]", description: "Array of {label, value, hint?, tone?} objects" },
    { name: "align", type: "string", optional: true, enum: ["start", "center", "end"] },
  ],
  render: (_node, props) => {
    const align = asString(props.align, "start");
    const root = el("div", { class: "rui-stats", "data-align": align });
    for (const raw of asArray<unknown>(props.items)) {
      const item = (raw ?? {}) as { label?: unknown; value?: unknown; hint?: unknown; tone?: unknown };
      const block = el("div", {
        class: "rui-stats-item",
        "data-tone": asString(item.tone, "default"),
      });
      block.append(el("div", { class: "rui-stats-label" }, [asString(item.label)]));
      block.append(el("div", { class: "rui-stats-value" }, [asString(item.value)]));
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
    "directories, and category filters. Pair with `Grid` for uniform rows.",
  props: [
    { name: "label", type: "string" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "value", type: "string", optional: true, description: "Secondary value rendered next to/under the label" },
    { name: "description", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
    { name: "action", type: "Action", optional: true },
  ],
  render: (_node, props, helpers) => {
    const isClickable = isActionPayload(props.action);
    const tag = isClickable ? "button" : "div";
    const root = el(tag as "div", {
      type: isClickable ? "button" : null,
      class: "rui-tile",
      "data-tone": asString(props.tone, "default"),
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
      root.onclick = () => helpers.runAction(props.action);
    }
    return root;
  },
};

export const Notification: ComponentSpec = {
  name: "Notification",
  description:
    "Inline notification card with title, message, time, optional avatar, " +
    "and dismiss/action buttons. Use inside notification panels, inboxes, " +
    "or activity drawers — for top-of-page announcements prefer `Banner`.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true },
    { name: "time", type: "string", optional: true, description: "Relative or absolute timestamp" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "avatarSrc", type: "string", optional: true, description: "Avatar URL (alternative to `icon`)" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
    { name: "unread", type: "boolean", optional: true, description: "Highlights the card with an accent" },
    { name: "actions", type: "Node[]", optional: true },
  ],
  render: (_node, props, helpers) => {
    const root = el("article", {
      class: "rui-notification",
      "data-tone": asString(props.tone, "default"),
      "data-unread": asBoolean(props.unread) ? "true" : "false",
    });
    const avatarSrc = asString(props.avatarSrc);
    if (avatarSrc) {
      root.append(renderAvatar(avatarSrc, asString(props.title), "md"));
    } else {
      const iconNode = renderIcon(asString(props.icon, "bell"), { className: "rui-notification-icon" });
      if (iconNode) root.append(iconNode);
    }
    const body = el("div", { class: "rui-notification-body" });
    const head = el("header", { class: "rui-notification-head" });
    head.append(el("span", { class: "rui-notification-title" }, [asString(props.title)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-notification-time" }, [time]));
    body.append(head);
    const message = asString(props.message);
    if (message) body.append(el("p", { class: "rui-notification-message" }, [message]));
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-notification-actions");
      body.append(actions);
    }
    root.append(body);
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
    { name: "avatarSrc", type: "string", optional: true },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "status", type: "string", optional: true, enum: ["online", "offline", "busy", "away"] },
    { name: "action", type: "Action", optional: true },
  ],
  render: (_node, props, helpers) => {
    const isClickable = isActionPayload(props.action);
    const tag = isClickable ? "button" : "div";
    const size = asString(props.size, "md");
    const avatarSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";
    const root = el(tag as "div", {
      type: isClickable ? "button" : null,
      class: "rui-person-chip",
      "data-size": size,
    });
    const avatarWrap = el("span", { class: "rui-person-chip-avatar" });
    avatarWrap.append(renderAvatar(asString(props.avatarSrc), asString(props.name), avatarSize));
    const status = asString(props.status);
    if (status) avatarWrap.append(el("span", { class: "rui-person-chip-status", "data-status": status }));
    root.append(avatarWrap);
    const meta = el("div", { class: "rui-person-chip-meta" });
    meta.append(el("span", { class: "rui-person-chip-name" }, [asString(props.name)]));
    const role = asString(props.role);
    if (role) meta.append(el("span", { class: "rui-person-chip-role" }, [role]));
    root.append(meta);
    if (isClickable) {
      root.onclick = () => helpers.runAction(props.action);
    }
    return root;
  },
};

