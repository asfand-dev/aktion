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
import { el, asArray, asString } from "../utils.js";
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
    const root = el("section", {
      class: "rui-hero",
      "data-tone": asString(props.tone, "primary"),
      "data-has-image": props.imageSrc ? "true" : "false",
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

    const imageSrc = asString(props.imageSrc);
    if (imageSrc) {
      const media = el("div", { class: "rui-hero-media" });
      media.append(el("img", { src: imageSrc, alt: "", loading: "lazy" }));
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
    const columns = Math.max(1, Math.min(6, Number(props.columns ?? 0)));
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
    { name: "icon", type: "string", optional: true, description: "Emoji or symbol" },
    { name: "action", type: "Button", optional: true, description: "Optional Button(...) CTA" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-empty-state" });
    const icon = asString(props.icon, "📭");
    root.append(el("div", { class: "rui-empty-state-icon" }, [icon]));
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
    { name: "icon", type: "string", optional: true, description: "Emoji shown inside the marker" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
  ],
  render: (_node, props) => {
    const li = el("li", {
      class: "rui-timeline-item",
      "data-tone": asString(props.tone, "default"),
    });
    const marker = el("span", { class: "rui-timeline-marker" });
    const icon = asString(props.icon);
    if (icon) marker.textContent = icon;
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
    { name: "icon", type: "string", optional: true, description: "Emoji shown in a colored disc" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
  ],
  render: (_node, props) => {
    const root = el("div", {
      class: "rui-feature-item",
      "data-tone": asString(props.tone, "primary"),
    });
    const icon = asString(props.icon, "✦");
    root.append(el("div", { class: "rui-feature-icon" }, [icon]));
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
    const columns = Math.max(1, Math.min(4, Number(props.columns ?? 0)));
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
      stars.textContent = "★".repeat(rating) + "☆".repeat(5 - rating);
      root.append(stars);
    }
    root.append(el("blockquote", { class: "rui-testimonial-quote" }, [
      asString(props.quote),
    ]));
    const footer = el("figcaption", { class: "rui-testimonial-author" });
    const avatarSrc = asString(props.avatarSrc);
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
    { name: "icon", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
  ],
  render: (_node, props, helpers) => {
    const root = el("aside", {
      class: "rui-banner",
      "data-tone": asString(props.tone, "primary"),
    });
    const icon = asString(props.icon);
    if (icon) root.append(el("span", { class: "rui-banner-icon" }, [icon]));
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
    { name: "icon", type: "string", optional: true, description: "Optional emoji shown beside the title" },
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
      root.addEventListener("click", () => helpers.runAction(props.action));
      root.addEventListener("keydown", (event) => {
        const e = event as KeyboardEvent;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          helpers.runAction(props.action);
        }
      });
    }
    const titleEl = el("div", { class: "rui-kanban-card-title" });
    const icon = asString(props.icon);
    if (icon) titleEl.append(el("span", { class: "rui-kanban-card-icon" }, [icon]));
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

