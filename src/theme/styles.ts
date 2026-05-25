/**
 * Single CSS bundle for the shadow root. Uses CSS custom properties so that
 * theme switches at the host element propagate without re-rendering.
 *
 * Built-in themes additionally hook into `:host([data-rui-theme="..."])`
 * overrides so that themes can change layout, fonts, animations, etc., not
 * only color tokens.
 */

export const componentStyles = `
:host {
  display: block;
  box-sizing: border-box;
  color: var(--rui-color-text);
  background: var(--rui-host-bg, var(--rui-color-bg));
  font-family: var(--rui-font-family);
  font-weight: var(--rui-font-weight-body);
  line-height: var(--rui-line-height-body);
  font-size: var(--rui-font-size-base);
  /* Surface & semantic */
  --rui-color-bg: #ffffff;
  --rui-color-bg-subtle: #f8fafc;
  --rui-color-surface: #ffffff;
  --rui-color-surface-muted: #f1f5f9;
  --rui-color-border: #e2e8f0;
  --rui-color-border-subtle: rgba(15, 23, 42, 0.08);
  --rui-color-text: #0f172a;
  --rui-color-text-muted: #475569;
  --rui-color-primary: #6366f1;
  --rui-color-primary-hover: #4f46e5;
  --rui-color-primary-text: #ffffff;
  --rui-color-accent: #6366f1;
  --rui-color-accent-hover: #4f46e5;
  --rui-color-accent-text: #ffffff;
  --rui-color-focus-ring: #6366f1;
  --rui-color-success: #10b981;
  --rui-color-warning: #f59e0b;
  --rui-color-danger: #ef4444;
  --rui-color-info: #06b6d4;
  /* Typography */
  --rui-font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --rui-font-family-heading: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --rui-font-family-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --rui-font-size-base: 14px;
  --rui-font-size-sm: 12px;
  --rui-font-size-lg: 16px;
  --rui-font-size-heading: 16px;
  --rui-font-size-title: 22px;
  --rui-font-weight-body: 400;
  --rui-font-weight-heading: 700;
  --rui-line-height-body: 1.5;
  --rui-line-height-heading: 1.2;
  --rui-letter-spacing-heading: 0;
  --rui-heading-text-transform: none;
  /* Shape */
  --rui-radius-xs: 4px;
  --rui-radius-sm: 6px;
  --rui-radius-md: 10px;
  --rui-radius-lg: 16px;
  --rui-radius-pill: 999px;
  --rui-radius-button: 6px;
  --rui-radius-input: 6px;
  --rui-border-width: 1px;
  --rui-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --rui-shadow-md: 0 6px 24px rgba(15, 23, 42, 0.08);
  --rui-shadow-lg: 0 18px 60px rgba(15, 23, 42, 0.12);
  /* Spacing */
  --rui-spacing-xs: 4px;
  --rui-spacing-s: 8px;
  --rui-spacing-m: 12px;
  --rui-spacing-l: 20px;
  --rui-spacing-xl: 32px;
  /* Buttons */
  --rui-button-font-weight: 600;
  --rui-button-text-transform: none;
  --rui-button-letter-spacing: 0;
  --rui-button-padding-y: 8px;
  --rui-button-padding-x: 14px;
  /* Motion */
  --rui-transition-duration: 120ms;
}

* { box-sizing: border-box; }
button { font-family: inherit; font-size: inherit; cursor: pointer; }
input, textarea, select, button { color: inherit; font-family: inherit; }

/* Font Awesome icon wrapper used by Icon(...) and every icon-typed prop.
   The element is given Font Awesome's own classes (fa-solid, fa-house, etc.)
   so the FA stylesheet does the glyph rendering; .rui-icon only handles
   sizing + alignment. */
.rui-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.rui-icon[data-icon-size="xs"] { font-size: 10px; }
.rui-icon[data-icon-size="sm"] { font-size: 12px; }
.rui-icon[data-icon-size="md"] { font-size: 14px; }
.rui-icon[data-icon-size="lg"] { font-size: 18px; }
.rui-icon[data-icon-size="xl"] { font-size: 24px; }

/* Additional attributes: render the host with no background so it inherits the parent
   container's color. Useful when embedding inside a themed page where the
   surrounding chrome already carries the background. The internal cards
   keep their own surface colors so the UI stays legible. */
:host([transparent]),
:host([transparent="true"]) {
  background: transparent;
}

.rui-root {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
}

.rui-error-banner {
  border: 1px solid var(--rui-color-danger);
  background: color-mix(in srgb, var(--rui-color-danger) 8%, transparent);
  color: var(--rui-color-danger);
  border-radius: var(--rui-radius-md);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  font-size: 13px;
  margin-bottom: var(--rui-spacing-s);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rui-error-banner[hidden] { display: none; }
.rui-error-banner ul { margin: 0; padding-left: 18px; }

/* Stack */
.rui-stack {
  display: flex;
  gap: var(--rui-spacing-m);
}
.rui-stack[data-direction="row"] { flex-direction: row; }
.rui-stack[data-direction="column"] { flex-direction: column; }
.rui-stack[data-gap="xs"] { gap: var(--rui-spacing-xs); }
.rui-stack[data-gap="s"] { gap: var(--rui-spacing-s); }
.rui-stack[data-gap="m"] { gap: var(--rui-spacing-m); }
.rui-stack[data-gap="l"] { gap: var(--rui-spacing-l); }
.rui-stack[data-gap="xl"] { gap: var(--rui-spacing-xl); }
.rui-stack[data-align="start"] { align-items: flex-start; }
.rui-stack[data-align="center"] { align-items: center; }
.rui-stack[data-align="end"] { align-items: flex-end; }
.rui-stack[data-align="stretch"] { align-items: stretch; }
.rui-stack[data-justify="start"] { justify-content: flex-start; }
.rui-stack[data-justify="center"] { justify-content: center; }
.rui-stack[data-justify="end"] { justify-content: flex-end; }
.rui-stack[data-justify="between"] { justify-content: space-between; }
.rui-stack[data-justify="around"] { justify-content: space-around; }
.rui-stack[data-justify="evenly"] { justify-content: space-evenly; }
.rui-stack[data-align-content="start"] { align-content: flex-start; }
.rui-stack[data-align-content="center"] { align-content: center; }
.rui-stack[data-align-content="end"] { align-content: flex-end; }
.rui-stack[data-align-content="between"] { align-content: space-between; }
.rui-stack[data-align-content="around"] { align-content: space-around; }
.rui-stack[data-align-content="stretch"] { align-content: stretch; }
.rui-stack[data-wrap="true"] { flex-wrap: wrap; }
.rui-stack[data-inline="true"] { display: inline-flex; }
.rui-stack[data-direction="row-reverse"] { flex-direction: row-reverse; }
.rui-stack[data-direction="column-reverse"] { flex-direction: column-reverse; }
.rui-stack[data-padding="xs"] { padding: var(--rui-spacing-xs); }
.rui-stack[data-padding="s"] { padding: var(--rui-spacing-s); }
.rui-stack[data-padding="m"] { padding: var(--rui-spacing-m); }
.rui-stack[data-padding="l"] { padding: var(--rui-spacing-l); }
.rui-stack[data-padding="xl"] { padding: var(--rui-spacing-xl); }
.rui-stack[data-direction="row"][data-uniform="true"] > *:not(.rui-stack-item) { flex: 1 1 auto; min-width: 0; }
.rui-stack[data-direction="row-reverse"][data-uniform="true"] > *:not(.rui-stack-item) { flex: 1 1 auto; min-width: 0; }
/* Compact inline pills should hug their content, even inside a row Stack
   that flex-grows its children. Without this they get stretched to fill the
   leftover space and look like full-width banners. */
.rui-stack[data-direction="row"] > .rui-tag,
.rui-stack[data-direction="row"] > .rui-badge,
.rui-stack[data-direction="row"] > .rui-status-dot,
.rui-stack[data-direction="row"] > .rui-kbd-group,
.rui-stack[data-direction="row"] > .rui-icon,
.rui-stack[data-direction="row"] > .rui-rating,
.rui-stack[data-direction="row-reverse"] > .rui-tag,
.rui-stack[data-direction="row-reverse"] > .rui-badge,
.rui-stack[data-direction="row-reverse"] > .rui-status-dot,
.rui-stack[data-direction="row-reverse"] > .rui-kbd-group,
.rui-stack[data-direction="row-reverse"] > .rui-icon,
.rui-stack[data-direction="row-reverse"] > .rui-rating { flex: 0 0 auto; }

/* StackItem — per-child flex control inside Stack */
.rui-stack-item { min-width: 0; }
.rui-stack-item[data-grow="0"] { flex-grow: 0; }
.rui-stack-item[data-grow="1"] { flex-grow: 1; }
.rui-stack-item[data-shrink="0"] { flex-shrink: 0; }
.rui-stack-item[data-shrink="1"] { flex-shrink: 1; }
.rui-stack-item[data-basis="auto"] { flex-basis: auto; }
.rui-stack-item[data-basis="0"] { flex-basis: 0; }
.rui-stack-item[data-align-self="start"] { align-self: flex-start; }
.rui-stack-item[data-align-self="center"] { align-self: center; }
.rui-stack-item[data-align-self="end"] { align-self: flex-end; }
.rui-stack-item[data-align-self="stretch"] { align-self: stretch; }

/* Section */
.rui-section { display: flex; flex-direction: column; gap: var(--rui-spacing-s); }
.rui-section-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-heading);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
  color: var(--rui-color-text);
}

/* Card */
.rui-card {
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  padding: var(--rui-spacing-l);
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  box-shadow: var(--rui-shadow-sm);
}
.rui-card[data-variant="elevated"] { box-shadow: var(--rui-shadow-md); }
.rui-card[data-variant="outlined"] { box-shadow: none; }
.rui-card-header { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-card-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-heading);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
}
.rui-card-subtitle { margin: 0; color: var(--rui-color-text-muted); font-size: 13px; }
.rui-card-body { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-card-footer { display: flex; gap: var(--rui-spacing-s); justify-content: flex-end; flex-wrap: wrap; }

/* Header */
.rui-header { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-header-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-title);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
}
.rui-header-subtitle { margin: 0; color: var(--rui-color-text-muted); font-size: 14px; }

/* Text */
.rui-text { display: inline; }
.rui-text[data-variant="small"] { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
.rui-text[data-variant="small-heavy"] { font-size: var(--rui-font-size-sm); font-weight: 600; }
.rui-text[data-variant="body"] { font-size: var(--rui-font-size-base); }
.rui-text[data-variant="body-heavy"] { font-size: var(--rui-font-size-base); font-weight: 600; }
.rui-text[data-variant="large"] { font-size: 18px; }
.rui-text[data-variant="large-heavy"] {
  font-size: var(--rui-font-size-title);
  font-family: var(--rui-font-family-heading);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
  display: block;
}
.rui-text[data-variant="heading"] {
  font-size: 20px;
  font-family: var(--rui-font-family-heading);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
  display: block;
}
.rui-text[data-variant="title"] {
  font-size: calc(var(--rui-font-size-title) + 6px);
  font-family: var(--rui-font-family-heading);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
  display: block;
}
.rui-text[data-color="muted"] { color: var(--rui-color-text-muted); }
.rui-text[data-color="primary"] { color: var(--rui-color-primary); }
.rui-text[data-color="success"] { color: var(--rui-color-success); }
.rui-text[data-color="warning"] { color: var(--rui-color-warning); }
.rui-text[data-color="danger"] { color: var(--rui-color-danger); }

/* Image */
.rui-image { margin: 0; display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-image img { max-width: 100%; height: auto; border-radius: var(--rui-radius-md); display: block; }
.rui-image-caption { color: var(--rui-color-text-muted); font-size: 12px; }

/* Link */
.rui-link {
  color: var(--rui-color-accent);
  text-decoration: none;
  font-weight: 500;
  word-break: break-word;
  transition: color var(--rui-transition-duration) ease;
}
.rui-link:hover { color: var(--rui-color-accent-hover); text-decoration: underline; }

/* Routing — NavLink anchor + Routes outlet. NavLink is a hash-aware anchor
   that reflects the current route via data-active="true". Routes wraps
   the matched page so themes can target it without leaking styles into
   surrounding content. */
.rui-routes {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  width: 100%;
}
.rui-route { display: contents; }
.rui-nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--rui-radius-sm);
  font-weight: 500;
  color: var(--rui-color-text);
  text-decoration: none;
  background: transparent;
  border: 1px solid transparent;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}
.rui-nav-link:hover {
  background: var(--rui-color-surface-muted);
  text-decoration: none;
}
.rui-nav-link[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  border-color: color-mix(in srgb, var(--rui-color-primary) 28%, transparent);
}
.rui-nav-link[data-variant="primary"] {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
}
.rui-nav-link[data-variant="primary"]:hover { background: var(--rui-color-primary-hover); }
.rui-nav-link[data-variant="primary"][data-active="true"] {
  background: var(--rui-color-primary-hover);
  border-color: transparent;
}
.rui-nav-link[data-variant="ghost"] {
  background: transparent;
}
.rui-nav-link[data-variant="ghost"]:hover {
  background: var(--rui-color-surface-muted);
}
.rui-nav-link[data-variant="pill"] {
  border-radius: 999px;
  padding: 6px 14px;
  background: var(--rui-color-surface-muted);
}
.rui-nav-link[data-variant="pill"][data-active="true"] {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  border-color: transparent;
}
.rui-nav-link[data-routes-enabled="false"] { opacity: 0.6; }
.rui-nav-link-icon { display: inline-flex; align-items: center; }

/* Badge & Tag */
.rui-badge-icon {
  margin-right: 4px;
}
.rui-badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rui-spacing-xs);
}

.rui-badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--rui-radius-pill);
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text);
}
.rui-badge[data-variant="primary"] { background: var(--rui-color-primary); color: var(--rui-color-primary-text); }
.rui-badge[data-variant="success"] { background: color-mix(in srgb, var(--rui-color-success) 18%, transparent); color: var(--rui-color-success); }
.rui-badge[data-variant="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 18%, transparent); color: var(--rui-color-warning); }
.rui-badge[data-variant="danger"] { background: color-mix(in srgb, var(--rui-color-danger) 18%, transparent); color: var(--rui-color-danger); }
.rui-badge[data-variant="info"] { background: color-mix(in srgb, var(--rui-color-info) 18%, transparent); color: var(--rui-color-info); }

.rui-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--rui-radius-pill);
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  background: var(--rui-color-surface-muted);
  border: 1px solid var(--rui-color-border-subtle);
}
.rui-tag[data-size="sm"] { font-size: 11px; padding: 1px 8px; }
.rui-tag[data-size="lg"] { font-size: 14px; padding: 4px 12px; }
.rui-tag[data-variant="success"] { background: color-mix(in srgb, var(--rui-color-success) 16%, transparent); color: var(--rui-color-success); border-color: transparent; }
.rui-tag[data-variant="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 16%, transparent); color: var(--rui-color-warning); border-color: transparent; }
.rui-tag[data-variant="danger"] { background: color-mix(in srgb, var(--rui-color-danger) 16%, transparent); color: var(--rui-color-danger); border-color: transparent; }
.rui-tag[data-variant="primary"] { background: color-mix(in srgb, var(--rui-color-primary) 16%, transparent); color: var(--rui-color-primary); border-color: transparent; }

/* Alert */
.rui-alert {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  border: 1px solid var(--rui-color-border);
}
.rui-alert-title { font-weight: 600; }
.rui-alert[data-variant="info"] { background: color-mix(in srgb, var(--rui-color-info) 12%, transparent); border-color: transparent; color: var(--rui-color-info); }
.rui-alert[data-variant="success"] { background: color-mix(in srgb, var(--rui-color-success) 12%, transparent); border-color: transparent; color: var(--rui-color-success); }
.rui-alert[data-variant="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 12%, transparent); border-color: transparent; color: var(--rui-color-warning); }
.rui-alert[data-variant="danger"] { background: color-mix(in srgb, var(--rui-color-danger) 12%, transparent); border-color: transparent; color: var(--rui-color-danger); }

/* Skeleton */
.rui-skeleton { display: flex; flex-direction: column; gap: 6px; }
.rui-skeleton-line {
  background: linear-gradient(90deg, var(--rui-color-surface-muted) 0%, color-mix(in srgb, var(--rui-color-surface-muted) 60%, var(--rui-color-bg)) 50%, var(--rui-color-surface-muted) 100%);
  background-size: 200% 100%;
  animation: rui-skeleton-shimmer 1.4s ease infinite;
  border-radius: var(--rui-radius-sm);
}
@keyframes rui-skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Markdown */
.rui-markdown { display: flex; flex-direction: column; gap: var(--rui-spacing-s); word-break: break-word; }
.rui-markdown p { margin: 0; }
.rui-markdown ul { margin: 0; padding-left: var(--rui-spacing-l); }
.rui-markdown code {
  background: var(--rui-color-surface-muted);
  border-radius: 4px;
  padding: 0 4px;
  font-family: var(--rui-font-family-mono);
  font-size: 0.92em;
}

/* Divider */
.rui-divider { border: none; height: var(--rui-border-width); background: var(--rui-color-border); margin: var(--rui-spacing-s) 0; }
.rui-divider-with-label {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  height: auto;
  background: none;
}
.rui-divider-line { flex: 1; height: var(--rui-border-width); background: var(--rui-color-border); }
.rui-divider-label { color: var(--rui-color-text-muted); font-size: 12px; }

/* Separator */
.rui-separator {
  background: var(--rui-color-border);
  flex-shrink: 0;
}
.rui-separator[data-orientation="horizontal"] {
  width: 100%;
  height: var(--rui-border-width);
  margin: var(--rui-spacing-s) 0;
}
.rui-separator[data-orientation="vertical"] {
  width: var(--rui-border-width);
  height: auto;
  align-self: stretch;
  margin: 0 var(--rui-spacing-s);
}

/* Steps */
.rui-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  counter-reset: rui-steps;
}
.rui-steps-item {
  position: relative;
  padding-left: 44px;
  counter-increment: rui-steps;
}
.rui-steps-item::before {
  content: counter(rui-steps);
  position: absolute;
  left: 0;
  top: 0;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
}
.rui-steps-title { font-weight: 600; line-height: 28px; }
.rui-steps-details { color: var(--rui-color-text-muted); font-size: 13px; margin-top: 2px; }

/* TagBlock */
.rui-tag-block {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rui-spacing-xs);
}

/* Callout */
.rui-callout {
  display: flex;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface);
}
.rui-callout-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  background: var(--rui-color-info);
  color: #ffffff;
}
.rui-callout-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.rui-callout-title { font-weight: 600; }
.rui-callout-description { color: var(--rui-color-text-muted); font-size: 13px; }
.rui-callout[data-variant="info"] { background: color-mix(in srgb, var(--rui-color-info) 8%, var(--rui-color-surface)); border-color: color-mix(in srgb, var(--rui-color-info) 30%, transparent); }
.rui-callout[data-variant="info"] .rui-callout-icon { background: var(--rui-color-info); }
.rui-callout[data-variant="success"] { background: color-mix(in srgb, var(--rui-color-success) 8%, var(--rui-color-surface)); border-color: color-mix(in srgb, var(--rui-color-success) 30%, transparent); }
.rui-callout[data-variant="success"] .rui-callout-icon { background: var(--rui-color-success); }
.rui-callout[data-variant="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 10%, var(--rui-color-surface)); border-color: color-mix(in srgb, var(--rui-color-warning) 32%, transparent); }
.rui-callout[data-variant="warning"] .rui-callout-icon { background: var(--rui-color-warning); }
.rui-callout[data-variant="danger"], .rui-callout[data-variant="error"] {
  background: color-mix(in srgb, var(--rui-color-danger) 8%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-danger) 32%, transparent);
}
.rui-callout[data-variant="danger"] .rui-callout-icon, .rui-callout[data-variant="error"] .rui-callout-icon {
  background: var(--rui-color-danger);
}
.rui-callout[data-variant="neutral"] .rui-callout-icon {
  background: var(--rui-color-text-muted);
}

/* CodeBlock */
.rui-code-block {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface-muted);
  overflow: hidden;
  font-size: 13px;
}
.rui-code-block-language {
  font-family: var(--rui-font-family-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--rui-color-text-muted);
  padding: 6px 12px;
  border-bottom: 1px solid var(--rui-color-border-subtle);
}
.rui-code-block-pre {
  margin: 0;
  padding: var(--rui-spacing-m);
  font-family: var(--rui-font-family-mono);
  white-space: pre;
  overflow-x: auto;
  color: var(--rui-color-text);
}

/* CheckBoxGroup */
.rui-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
}
.rui-checkbox-group .rui-checkbox-item {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-s);
  border: 1px solid var(--rui-color-border-subtle);
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-surface);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.rui-checkbox-group .rui-checkbox-item:hover {
  border-color: var(--rui-color-border);
  background: var(--rui-color-surface-muted);
}
.rui-checkbox-item-text { display: flex; flex-direction: column; gap: 2px; }
.rui-checkbox-item-label { font-weight: 500; font-size: 13px; }
.rui-checkbox-item-description { color: var(--rui-color-text-muted); font-size: 12px; }

/* Tabs */
.rui-tabs { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-tab-list {
  display: flex;
  gap: var(--rui-spacing-xs);
  border-bottom: 1px solid var(--rui-color-border);
  flex-wrap: wrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.rui-tab-trigger {
  border: none;
  background: transparent;
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  font-weight: 500;
  color: var(--rui-color-text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 150ms ease, border-color 150ms ease;
  white-space: nowrap;
}
.rui-tab-trigger:hover { color: var(--rui-color-text); }
.rui-tab-trigger[aria-selected="true"] {
  color: var(--rui-color-primary);
  border-bottom-color: var(--rui-color-primary);
}
.rui-tab-panels { display: block; }
.rui-tab-content { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-tab-content[data-active="false"] { display: none; }

/* Accordion */
.rui-accordion { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-accordion-item {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  overflow: hidden;
}
.rui-accordion-trigger {
  cursor: pointer;
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  font-weight: 600;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-s);
}
.rui-accordion-trigger::-webkit-details-marker { display: none; }
.rui-accordion-title { flex: 1; min-width: 0; }
/* Chevron: hidden by default; revealed when wrapper or item opts in via data-show-arrow="true". */
.rui-accordion-chevron {
  display: none;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg) translate(-2px, -2px);
  transform-origin: center;
  transition: transform 180ms ease;
  color: var(--rui-color-text-muted);
  opacity: 0.8;
}
.rui-accordion[data-show-arrow="true"] .rui-accordion-item:not([data-show-arrow="false"]) .rui-accordion-chevron,
.rui-accordion-item[data-show-arrow="true"] .rui-accordion-chevron {
  display: inline-block;
}
.rui-accordion[data-show-arrow="true"] .rui-accordion-item[data-show-arrow="false"] .rui-accordion-chevron {
  display: none;
}
.rui-accordion-item[open] > .rui-accordion-trigger .rui-accordion-chevron {
  transform: rotate(225deg) translate(-2px, -2px);
  color: var(--rui-color-primary);
}
.rui-accordion-body { padding: 0 var(--rui-spacing-m) var(--rui-spacing-m); }

/* Modal */
.rui-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: none;
  align-items: center;
  justify-content: center;
  padding: var(--rui-spacing-l);
  z-index: 50;
}
.rui-modal-overlay[data-open="true"] { display: flex; }
.rui-modal {
  background: var(--rui-color-surface);
  border-radius: var(--rui-radius-lg);
  box-shadow: var(--rui-shadow-md);
  max-width: 480px;
  width: 100%;
  padding: var(--rui-spacing-l);
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  max-height: calc(100vh - 2 * var(--rui-spacing-l));
  overflow-y: auto;
}
.rui-modal-header { display: flex;justify-content: space-between; }
.rui-modal-title { margin: 0; font-size: 18px; }
.rui-modal-close { background: none; border: none; padding: 5px; margin: 0; cursor: pointer; font-size: 18px; color: var(--rui-color-primary); }

/* Forms */
.rui-form { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-form-control { display: flex; flex-direction: column; gap: 4px; }
.rui-form-label { font-size: 13px; font-weight: 600; color: var(--rui-color-text); }
.rui-form-hint { font-size: 12px; color: var(--rui-color-text-muted); margin: 0; }
.rui-form-actions {
  display: flex;
  gap: var(--rui-spacing-s);
  justify-content: flex-end;
  margin-top: var(--rui-spacing-s);
  flex-wrap: wrap;
}

.rui-input, .rui-select, .rui-textarea {
  width: 100%;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-input);
  padding: 8px 12px;
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  font: inherit;
  transition: border-color var(--rui-transition-duration) ease, box-shadow var(--rui-transition-duration) ease;
}
.rui-input:focus, .rui-select:focus, .rui-textarea:focus {
  outline: none;
  border-color: var(--rui-color-focus-ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 22%, transparent);
}
.rui-textarea { min-height: 80px; resize: vertical; }

.rui-checkbox, .rui-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  cursor: pointer;
  font-size: 14px;
  user-select: none;
  line-height: 1.4;
}
.rui-radio-group { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }

/* Custom Checkbox & Radio control styling.
 * Hides the native input visually but keeps it focusable; renders the
 * checked state via a CSS-painted indicator so the appearance is
 * consistent across themes and platforms. */
.rui-checkbox input[type="checkbox"],
.rui-checkbox-item input[type="checkbox"],
.rui-radio input[type="radio"] {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  flex-shrink: 0;
  display: inline-block;
  width: 20px;
  height: 20px;
  transform: scale(0.8);
  background: var(--rui-color-surface);
  border: 1.5px solid var(--rui-color-border);
  cursor: pointer;
  position: relative;
  transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.rui-checkbox input[type="checkbox"],
.rui-checkbox-item input[type="checkbox"] {
  border-radius: 5px;
}
.rui-radio input[type="radio"] {
  border-radius: 999px;
}
.rui-checkbox input[type="checkbox"]:hover,
.rui-checkbox-item input[type="checkbox"]:hover,
.rui-radio input[type="radio"]:hover {
  border-color: var(--rui-color-primary);
}
.rui-checkbox input[type="checkbox"]:focus-visible,
.rui-checkbox-item input[type="checkbox"]:focus-visible,
.rui-radio input[type="radio"]:focus-visible {
  outline: none;
  border-color: var(--rui-color-focus-ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 22%, transparent);
}
.rui-checkbox input[type="checkbox"]:checked,
.rui-checkbox-item input[type="checkbox"]:checked,
.rui-radio input[type="radio"]:checked {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
}
.rui-checkbox input[type="checkbox"]:checked::after,
.rui-checkbox-item input[type="checkbox"]:checked::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 1px;
  width: 5px;
  height: 10px;
  border: solid var(--rui-color-primary-text, #fff);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.rui-radio input[type="radio"]:checked::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--rui-color-primary-text, #fff);
  transform: translate(-50%, -50%);
}
.rui-checkbox input[type="checkbox"]:disabled,
.rui-checkbox-item input[type="checkbox"]:disabled,
.rui-radio input[type="radio"]:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.rui-checkbox-label, .rui-radio-label { color: var(--rui-color-text); }

.rui-button {
  border: var(--rui-border-width) solid transparent;
  border-radius: var(--rui-radius-button);
  padding: var(--rui-button-padding-y) var(--rui-button-padding-x);
  font-weight: var(--rui-button-font-weight);
  letter-spacing: var(--rui-button-letter-spacing);
  text-transform: var(--rui-button-text-transform);
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  transition: background var(--rui-transition-duration) ease, border-color var(--rui-transition-duration) ease, transform var(--rui-transition-duration) ease, box-shadow var(--rui-transition-duration) ease;
}
.rui-button-icon {
  margin-right: 4px;
}
.rui-button:hover:not(:disabled) { background: var(--rui-color-primary-hover); }
.rui-button:disabled { opacity: 0.5; cursor: not-allowed; }
.rui-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 35%, transparent);
}
.rui-button[data-variant="secondary"] { background: var(--rui-color-surface); color: var(--rui-color-text); border-color: var(--rui-color-border); }
.rui-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-button[data-variant="ghost"] { background: transparent; color: var(--rui-color-text); }
.rui-button[data-variant="ghost"]:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-button[data-variant="danger"] { background: var(--rui-color-danger); color: #fff; }
.rui-button[data-variant="danger"]:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-danger) 80%, black); }
.rui-button[data-size="xs"] { padding: calc(var(--rui-button-padding-y) * 0.45) calc(var(--rui-button-padding-x) * 0.6); font-size: 11px; }
.rui-button[data-size="sm"],
.rui-button[data-size="small"] { padding: calc(var(--rui-button-padding-y) * 0.55) calc(var(--rui-button-padding-x) * 0.7); font-size: var(--rui-font-size-sm); }
.rui-button[data-size="lg"],
.rui-button[data-size="large"] { padding: calc(var(--rui-button-padding-y) * 1.4) calc(var(--rui-button-padding-x) * 1.3); font-size: var(--rui-font-size-lg); }
.rui-button[data-size="xl"] { padding: calc(var(--rui-button-padding-y) * 1.6) calc(var(--rui-button-padding-x) * 1.5); font-size: var(--rui-font-size-lg); }
.rui-button[data-full-width="true"] { width: 100%; }
.rui-button[data-icon-only="true"] .rui-button-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
.rui-button[data-icon-position="trailing"] .rui-button-icon { margin-right: 0; margin-left: 10px; order: 2; }
.rui-button[data-loading="true"] { pointer-events: none; }
.rui-button-spinner { margin-right: 4px; }
.rui-button[data-icon-position="trailing"] .rui-button-spinner { margin-right: 0; margin-left: 10px; }

.rui-buttons {
  display: flex;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
}
.rui-buttons[data-direction="column"] { flex-direction: column; align-items: stretch; }
.rui-buttons[data-direction="column"] > .rui-button { width: 100%; }

/* Table — wrapper provides horizontal scroll when columns overflow the
   viewport so tables stay readable on phones and tablets. */
.rui-table-wrapper {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}
.rui-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: max-content;
}
.rui-table-caption {
  text-align: left;
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  font-weight: 600;
  color: var(--rui-color-text-muted);
}
.rui-table th, .rui-table td {
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  text-align: left;
  border-bottom: 1px solid var(--rui-color-border);
  white-space: nowrap;
}
.rui-table th {
  background: var(--rui-color-bg-subtle);
  font-weight: 600;
  position: sticky;
  top: 0;
}
.rui-table td[data-format="number"], .rui-table td[data-format="currency"] {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rui-table tbody tr:last-child td { border-bottom: none; }
.rui-table-empty {
  text-align: center;
  color: var(--rui-color-text-muted);
  padding: var(--rui-spacing-l) !important;
  white-space: normal;
}

/* List */
.rui-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--rui-spacing-s); }
.rui-list-item {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-s);
  border-radius: var(--rui-radius-sm);
  border: 1px solid var(--rui-color-border-subtle);
  background: var(--rui-color-surface);
}
.rui-list-icon { font-size: 20px; }
.rui-list-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rui-list-title { font-weight: 600; }
.rui-list-description { color: var(--rui-color-text-muted); font-size: 13px; }

/* StatCard */
.rui-stat-card {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  padding: var(--rui-spacing-l);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
}
.rui-stat-label-row { display: flex; align-items: center; gap: 6px; }
.rui-stat-icon {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--rui-color-primary);
  font-size: 16px;
}
.rui-stat-label { color: var(--rui-color-text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
.rui-stat-value {
  font-family: var(--rui-font-family-heading);
  font-size: 24px;
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
}
.rui-stat-trend { font-size: 12px; font-weight: 600; }
.rui-stat-trend[data-trend="up"] { color: var(--rui-color-success); }
.rui-stat-trend[data-trend="down"] { color: var(--rui-color-danger); }

/* Charts */
.rui-chart {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-m);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
}
.rui-chart-title { font-weight: 600; font-size: 14px; }
.rui-chart-svg { width: 100%; height: auto; max-height: 240px; }
.rui-chart-svg text { fill: var(--rui-color-text-muted); font-size: 12px; font-family: var(--rui-font-family); }
.rui-chart-tick { font-size: 10px; }
.rui-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rui-spacing-s);
  font-size: 12px;
  color: var(--rui-color-text-muted);
}
.rui-chart-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.rui-chart-legend-swatch { width: 10px; height: 10px; border-radius: 999px; }
/* Pie chart inline value labels: bold, centered, painted with a soft
 * stroke (set inline) so they remain legible on any slice color. The
 * specificity here is higher than the generic '.rui-chart-svg text'
 * fill, so the white fill wins. */
.rui-chart-svg .rui-pie-chart-value,
.rui-pie-chart .rui-pie-chart-value {
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
  fill: #ffffff;
}

/* Chat blocks */
.rui-section-block {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
}
.rui-section-block-title { margin: 0; font-size: 16px; font-weight: 600; }
.rui-section-block-description { margin: 0; color: var(--rui-color-text-muted); font-size: 13px; }
.rui-list-block { margin: 0; padding-left: var(--rui-spacing-l); }
.rui-list-block li { margin-bottom: 4px; }

.rui-follow-up { display: flex; flex-direction: column; gap: var(--rui-spacing-s); margin-top: var(--rui-spacing-m); }
.rui-follow-up-title { font-size: 12px; color: var(--rui-color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.rui-follow-up-list { display: flex; flex-wrap: wrap; gap: var(--rui-spacing-s); }
.rui-follow-up-button {
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms ease;
  font-family: inherit;
}
.rui-follow-up-button:hover { background: var(--rui-color-surface-muted); }
.rui-action-link {
  color: var(--rui-color-primary);
  cursor: pointer;
  text-decoration: underline;
}

/* ========================================================================
   New primitives (shadcn parity): Avatar, AvatarGroup, Progress, Switch,
   Toggle, ToggleGroup, Tooltip, HoverCard, Kbd, Breadcrumb, Pagination,
   Sheet, AspectRatio, ScrollArea, Grid.
   ======================================================================== */

/* Grid — responsive CSS grid. Auto-fit fallback when no fixed column count. */
.rui-grid {
  display: grid;
  gap: var(--rui-spacing-m);
  grid-template-columns: repeat(auto-fit, minmax(var(--rui-grid-min-item, 220px), 1fr));
  width: 100%;
}
.rui-grid[data-columns="1"] { grid-template-columns: 1fr; }
.rui-grid[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rui-grid[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rui-grid[data-columns="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.rui-grid[data-columns="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.rui-grid[data-columns="6"] { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.rui-grid[data-columns="7"] { grid-template-columns: repeat(7, minmax(0, 1fr)); }
.rui-grid[data-columns="8"] { grid-template-columns: repeat(8, minmax(0, 1fr)); }
.rui-grid[data-columns="9"] { grid-template-columns: repeat(9, minmax(0, 1fr)); }
.rui-grid[data-columns="10"] { grid-template-columns: repeat(10, minmax(0, 1fr)); }
.rui-grid[data-columns="11"] { grid-template-columns: repeat(11, minmax(0, 1fr)); }
.rui-grid[data-columns="12"] { grid-template-columns: repeat(12, minmax(0, 1fr)); }
.rui-grid[data-gap="xs"] { gap: var(--rui-spacing-xs); }
.rui-grid[data-gap="s"] { gap: var(--rui-spacing-s); }
.rui-grid[data-gap="m"] { gap: var(--rui-spacing-m); }
.rui-grid[data-gap="l"] { gap: var(--rui-spacing-l); }
.rui-grid[data-gap="xl"] { gap: var(--rui-spacing-xl); }

/* Responsive prop maps for Grid columns/gap and Stack direction/gap.
 * Components set --rui-grid-cols-{bp} / --rui-stack-dir-{bp} CSS vars for
 * each requested breakpoint; the cascade picks the most specific value
 * via mobile-first min-width media queries. */
.rui-grid[data-responsive-cols] {
  grid-template-columns: repeat(var(--rui-grid-cols-base, 1), minmax(0, 1fr));
}
.rui-grid[data-responsive-gap] {
  gap: var(--rui-grid-gap-base, var(--rui-spacing-m));
}
.rui-stack[data-responsive-dir] {
  flex-direction: var(--rui-stack-dir-base, column);
}
.rui-stack[data-responsive-gap] {
  gap: var(--rui-stack-gap-base, var(--rui-spacing-m));
}
.rui-stack[data-responsive-align] {
  align-items: var(--rui-stack-align-base, stretch);
}
.rui-stack[data-responsive-justify] {
  justify-content: var(--rui-stack-justify-base, flex-start);
}
.rui-stack[data-responsive-padding] {
  padding: var(--rui-stack-padding-base, 0);
}
@media (min-width: 640px) {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1)), minmax(0, 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m)));
  }
  .rui-stack[data-responsive-dir] {
    flex-direction: var(--rui-stack-dir-sm, var(--rui-stack-dir-base, column));
  }
  .rui-stack[data-responsive-gap] {
    gap: var(--rui-stack-gap-sm, var(--rui-stack-gap-base, var(--rui-spacing-m)));
  }
  .rui-stack[data-responsive-align] {
    align-items: var(--rui-stack-align-sm, var(--rui-stack-align-base, stretch));
  }
  .rui-stack[data-responsive-justify] {
    justify-content: var(--rui-stack-justify-sm, var(--rui-stack-justify-base, flex-start));
  }
  .rui-stack[data-responsive-padding] {
    padding: var(--rui-stack-padding-sm, var(--rui-stack-padding-base, 0));
  }
}
@media (min-width: 768px) {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-md, var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1))), minmax(0, 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-md, var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m))));
  }
  .rui-stack[data-responsive-dir] {
    flex-direction: var(--rui-stack-dir-md, var(--rui-stack-dir-sm, var(--rui-stack-dir-base, column)));
  }
  .rui-stack[data-responsive-gap] {
    gap: var(--rui-stack-gap-md, var(--rui-stack-gap-sm, var(--rui-stack-gap-base, var(--rui-spacing-m))));
  }
  .rui-stack[data-responsive-align] {
    align-items: var(--rui-stack-align-md, var(--rui-stack-align-sm, var(--rui-stack-align-base, stretch)));
  }
  .rui-stack[data-responsive-justify] {
    justify-content: var(--rui-stack-justify-md, var(--rui-stack-justify-sm, var(--rui-stack-justify-base, flex-start)));
  }
  .rui-stack[data-responsive-padding] {
    padding: var(--rui-stack-padding-md, var(--rui-stack-padding-sm, var(--rui-stack-padding-base, 0)));
  }
}
@media (min-width: 1024px) {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-lg, var(--rui-grid-cols-md, var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1)))), minmax(0, 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-lg, var(--rui-grid-gap-md, var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m)))));
  }
  .rui-stack[data-responsive-dir] {
    flex-direction: var(--rui-stack-dir-lg, var(--rui-stack-dir-md, var(--rui-stack-dir-sm, var(--rui-stack-dir-base, column))));
  }
  .rui-stack[data-responsive-gap] {
    gap: var(--rui-stack-gap-lg, var(--rui-stack-gap-md, var(--rui-stack-gap-sm, var(--rui-stack-gap-base, var(--rui-spacing-m)))));
  }
  .rui-stack[data-responsive-align] {
    align-items: var(--rui-stack-align-lg, var(--rui-stack-align-md, var(--rui-stack-align-sm, var(--rui-stack-align-base, stretch))));
  }
  .rui-stack[data-responsive-justify] {
    justify-content: var(--rui-stack-justify-lg, var(--rui-stack-justify-md, var(--rui-stack-justify-sm, var(--rui-stack-justify-base, flex-start))));
  }
  .rui-stack[data-responsive-padding] {
    padding: var(--rui-stack-padding-lg, var(--rui-stack-padding-md, var(--rui-stack-padding-sm, var(--rui-stack-padding-base, 0))));
  }
}
@media (min-width: 1280px) {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-xl, var(--rui-grid-cols-lg, var(--rui-grid-cols-md, var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1))))), minmax(0, 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-xl, var(--rui-grid-gap-lg, var(--rui-grid-gap-md, var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m))))));
  }
  .rui-stack[data-responsive-dir] {
    flex-direction: var(--rui-stack-dir-xl, var(--rui-stack-dir-lg, var(--rui-stack-dir-md, var(--rui-stack-dir-sm, var(--rui-stack-dir-base, column)))));
  }
  .rui-stack[data-responsive-gap] {
    gap: var(--rui-stack-gap-xl, var(--rui-stack-gap-lg, var(--rui-stack-gap-md, var(--rui-stack-gap-sm, var(--rui-stack-gap-base, var(--rui-spacing-m))))));
  }
  .rui-stack[data-responsive-align] {
    align-items: var(--rui-stack-align-xl, var(--rui-stack-align-lg, var(--rui-stack-align-md, var(--rui-stack-align-sm, var(--rui-stack-align-base, stretch)))));
  }
  .rui-stack[data-responsive-justify] {
    justify-content: var(--rui-stack-justify-xl, var(--rui-stack-justify-lg, var(--rui-stack-justify-md, var(--rui-stack-justify-sm, var(--rui-stack-justify-base, flex-start)))));
  }
  .rui-stack[data-responsive-padding] {
    padding: var(--rui-stack-padding-xl, var(--rui-stack-padding-lg, var(--rui-stack-padding-md, var(--rui-stack-padding-sm, var(--rui-stack-padding-base, 0)))));
  }
}

/* Grid — 12-column mode + GridItem spans */
.rui-grid[data-grid-mode="12"] {
  grid-template-columns: repeat(12, minmax(0, 1fr));
}
.rui-grid[data-grid-mode="12"][data-min-child-width] {
  grid-template-columns: repeat(12, minmax(var(--rui-grid-min-child, 0), 1fr));
}
.rui-grid[data-columns][data-min-child-width]:not([data-grid-mode="12"]) {
  grid-template-columns: repeat(var(--rui-grid-col-count, 1), minmax(var(--rui-grid-min-child, 220px), 1fr));
}
.rui-grid[data-columns="1"][data-min-child-width] { --rui-grid-col-count: 1; }
.rui-grid[data-columns="2"][data-min-child-width] { --rui-grid-col-count: 2; }
.rui-grid[data-columns="3"][data-min-child-width] { --rui-grid-col-count: 3; }
.rui-grid[data-columns="4"][data-min-child-width] { --rui-grid-col-count: 4; }
.rui-grid[data-columns="5"][data-min-child-width] { --rui-grid-col-count: 5; }
.rui-grid[data-columns="6"][data-min-child-width] { --rui-grid-col-count: 6; }
.rui-grid[data-columns="7"][data-min-child-width] { --rui-grid-col-count: 7; }
.rui-grid[data-columns="8"][data-min-child-width] { --rui-grid-col-count: 8; }
.rui-grid[data-columns="9"][data-min-child-width] { --rui-grid-col-count: 9; }
.rui-grid[data-columns="10"][data-min-child-width] { --rui-grid-col-count: 10; }
.rui-grid[data-columns="11"][data-min-child-width] { --rui-grid-col-count: 11; }
.rui-grid[data-columns="12"][data-min-child-width] { --rui-grid-col-count: 12; }
.rui-grid[data-row-gap="xs"] { row-gap: var(--rui-spacing-xs); }
.rui-grid[data-row-gap="s"] { row-gap: var(--rui-spacing-s); }
.rui-grid[data-row-gap="m"] { row-gap: var(--rui-spacing-m); }
.rui-grid[data-row-gap="l"] { row-gap: var(--rui-spacing-l); }
.rui-grid[data-row-gap="xl"] { row-gap: var(--rui-spacing-xl); }
.rui-grid[data-column-gap="xs"] { column-gap: var(--rui-spacing-xs); }
.rui-grid[data-column-gap="s"] { column-gap: var(--rui-spacing-s); }
.rui-grid[data-column-gap="m"] { column-gap: var(--rui-spacing-m); }
.rui-grid[data-column-gap="l"] { column-gap: var(--rui-spacing-l); }
.rui-grid[data-column-gap="xl"] { column-gap: var(--rui-spacing-xl); }
.rui-grid[data-align-items="start"] { align-items: start; }
.rui-grid[data-align-items="center"] { align-items: center; }
.rui-grid[data-align-items="end"] { align-items: end; }
.rui-grid[data-align-items="stretch"] { align-items: stretch; }
.rui-grid[data-justify-items="start"] { justify-items: start; }
.rui-grid[data-justify-items="center"] { justify-items: center; }
.rui-grid[data-justify-items="end"] { justify-items: end; }
.rui-grid[data-justify-items="stretch"] { justify-items: stretch; }
.rui-grid[data-dense="true"] { grid-auto-flow: dense; }
.rui-grid-item {
  grid-column: span var(--rui-grid-item-span, 1);
  min-width: 0;
}
.rui-grid-item[data-offset] {
  grid-column-start: calc(var(--rui-grid-item-offset, 0) + 1);
  grid-column-end: span var(--rui-grid-item-span, 1);
}
.rui-grid-item[data-responsive-span] {
  grid-column: span var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1));
}
@media (min-width: 640px) {
  .rui-grid-item[data-responsive-span] {
    grid-column: span var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1)));
  }
}
@media (min-width: 768px) {
  .rui-grid-item[data-responsive-span] {
    grid-column: span var(--rui-grid-item-span-md, var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1))));
  }
}
@media (min-width: 1024px) {
  .rui-grid-item[data-responsive-span] {
    grid-column: span var(--rui-grid-item-span-lg, var(--rui-grid-item-span-md, var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1)))));
  }
}
@media (min-width: 1280px) {
  .rui-grid-item[data-responsive-span] {
    grid-column: span var(--rui-grid-item-span-xl, var(--rui-grid-item-span-lg, var(--rui-grid-item-span-md, var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1))))));
  }
}

/* Box — spacing / surface wrapper */
.rui-box { box-sizing: border-box; }
.rui-box[data-padding="xs"] { padding: var(--rui-spacing-xs); }
.rui-box[data-padding="s"] { padding: var(--rui-spacing-s); }
.rui-box[data-padding="m"] { padding: var(--rui-spacing-m); }
.rui-box[data-padding="l"] { padding: var(--rui-spacing-l); }
.rui-box[data-padding="xl"] { padding: var(--rui-spacing-xl); }
.rui-box[data-margin="xs"] { margin: var(--rui-spacing-xs); }
.rui-box[data-margin="s"] { margin: var(--rui-spacing-s); }
.rui-box[data-margin="m"] { margin: var(--rui-spacing-m); }
.rui-box[data-margin="l"] { margin: var(--rui-spacing-l); }
.rui-box[data-margin="xl"] { margin: var(--rui-spacing-xl); }
.rui-box[data-border="subtle"] { border: 1px solid color-mix(in srgb, var(--rui-color-border) 60%, transparent); border-radius: var(--rui-radius-md); }
.rui-box[data-border="default"] { border: 1px solid var(--rui-color-border); border-radius: var(--rui-radius-md); }
.rui-box[data-background="surface"] { background: var(--rui-color-surface); }
.rui-box[data-background="muted"] { background: var(--rui-color-surface-muted); }
.rui-box[data-background="primary"] { background: color-mix(in srgb, var(--rui-color-primary) 10%, var(--rui-color-surface)); }
.rui-box[data-background="success"] { background: color-mix(in srgb, var(--rui-color-success) 10%, var(--rui-color-surface)); }
.rui-box[data-background="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 12%, var(--rui-color-surface)); }
.rui-box[data-background="danger"] { background: color-mix(in srgb, var(--rui-color-danger) 10%, var(--rui-color-surface)); }
.rui-box[data-background="info"] { background: color-mix(in srgb, var(--rui-color-info) 10%, var(--rui-color-surface)); }
.rui-box[data-responsive-padding] { padding: var(--rui-box-padding-base, 0); }
.rui-box[data-responsive-margin] { margin: var(--rui-box-margin-base, 0); }
@media (min-width: 640px) {
  .rui-box[data-responsive-padding] { padding: var(--rui-box-padding-sm, var(--rui-box-padding-base, 0)); }
  .rui-box[data-responsive-margin] { margin: var(--rui-box-margin-sm, var(--rui-box-margin-base, 0)); }
}
@media (min-width: 768px) {
  .rui-box[data-responsive-padding] { padding: var(--rui-box-padding-md, var(--rui-box-padding-sm, var(--rui-box-padding-base, 0))); }
  .rui-box[data-responsive-margin] { margin: var(--rui-box-margin-md, var(--rui-box-margin-sm, var(--rui-box-margin-base, 0))); }
}
@media (min-width: 1024px) {
  .rui-box[data-responsive-padding] { padding: var(--rui-box-padding-lg, var(--rui-box-padding-md, var(--rui-box-padding-sm, var(--rui-box-padding-base, 0)))); }
  .rui-box[data-responsive-margin] { margin: var(--rui-box-margin-lg, var(--rui-box-margin-md, var(--rui-box-margin-sm, var(--rui-box-margin-base, 0)))); }
}
@media (min-width: 1280px) {
  .rui-box[data-responsive-padding] { padding: var(--rui-box-padding-xl, var(--rui-box-padding-lg, var(--rui-box-padding-md, var(--rui-box-padding-sm, var(--rui-box-padding-base, 0))))); }
  .rui-box[data-responsive-margin] { margin: var(--rui-box-margin-xl, var(--rui-box-margin-lg, var(--rui-box-margin-md, var(--rui-box-margin-sm, var(--rui-box-margin-base, 0))))); }
}

/* AspectRatio */
.rui-aspect-ratio {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface-muted);
}
.rui-aspect-ratio > * {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

/* ScrollArea */
.rui-scroll-area {
  overflow: auto;
  border-radius: var(--rui-radius-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--rui-color-border) transparent;
}
.rui-scroll-area[data-direction="vertical"] { overflow-x: hidden; }
.rui-scroll-area[data-direction="horizontal"] { overflow-y: hidden; }
.rui-scroll-area::-webkit-scrollbar { width: 8px; height: 8px; }
.rui-scroll-area::-webkit-scrollbar-thumb {
  background: var(--rui-color-border);
  border-radius: 999px;
}
.rui-scroll-area::-webkit-scrollbar-track { background: transparent; }

/* Avatar */
.rui-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text);
  font-weight: 600;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  user-select: none;
}
.rui-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rui-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--rui-color-primary) 14%, var(--rui-color-surface-muted)),
    color-mix(in srgb, var(--rui-color-primary) 30%, var(--rui-color-surface-muted)));
  color: color-mix(in srgb, var(--rui-color-primary) 90%, var(--rui-color-text));
}
.rui-avatar[data-size="sm"] { width: 24px; height: 24px; font-size: 10px; max-width: 24px; max-height: 24px; }
.rui-avatar[data-size="md"] { width: 36px; height: 36px; font-size: 13px; max-width: 36px; max-height: 36px; }
.rui-avatar[data-size="lg"] { width: 52px; height: 52px; font-size: 18px; max-width: 52px; max-height: 52px; }
.rui-avatar[data-size="xl"] { width: 72px; height: 72px; font-size: 22px; max-width: 72px; max-height: 72px; }
.rui-avatar-status {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 25%;
  height: 25%;
  min-width: 8px;
  min-height: 8px;
  border-radius: 999px;
  border: 2px solid var(--rui-color-surface);
  background: var(--rui-color-text-muted);
}
.rui-avatar-status[data-status="online"] { background: var(--rui-color-success); }
.rui-avatar-status[data-status="busy"] { background: var(--rui-color-danger); }
.rui-avatar-status[data-status="away"] { background: var(--rui-color-warning); }
.rui-avatar-status[data-status="offline"] { background: var(--rui-color-text-muted); }

/* AvatarGroup — overlapping pile with ring border. */
.rui-avatar-group {
  display: inline-flex;
  align-items: center;
}
.rui-avatar-group > .rui-avatar {
  border: 2px solid var(--rui-color-surface);
  margin-left: -8px;
}
.rui-avatar-group > .rui-avatar:first-child { margin-left: 0; }
.rui-avatar-group[data-size="sm"] > .rui-avatar { margin-left: -6px; }
.rui-avatar-group[data-size="lg"] > .rui-avatar { margin-left: -12px; }
.rui-avatar-overflow .rui-avatar-fallback {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
}

/* Progress */
.rui-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.rui-progress-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--rui-color-text-muted);
}
.rui-progress-label { font-weight: 500; }
.rui-progress-value { font-variant-numeric: tabular-nums; }
.rui-progress-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--rui-color-surface-muted);
  overflow: hidden;
}
.rui-progress-bar {
  height: 100%;
  background: var(--rui-color-primary);
  border-radius: inherit;
  transition: width 220ms ease;
}
.rui-progress[data-tone="success"] .rui-progress-bar { background: var(--rui-color-success); }
.rui-progress[data-tone="warning"] .rui-progress-bar { background: var(--rui-color-warning); }
.rui-progress[data-tone="danger"] .rui-progress-bar { background: var(--rui-color-danger); }
.rui-progress[data-tone="info"] .rui-progress-bar { background: var(--rui-color-info); }
.rui-progress-track[data-indeterminate="true"] .rui-progress-bar {
  width: 40%;
  animation: rui-progress-indeterminate 1.4s ease-in-out infinite;
}
@keyframes rui-progress-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}

/* Switch */
.rui-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  cursor: pointer;
  user-select: none;
}
.rui-switch[data-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
.rui-switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.rui-switch-track {
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--rui-color-surface-muted);
  border: 1px solid var(--rui-color-border);
  position: relative;
  transition: background 160ms ease, border-color 160ms ease;
  flex-shrink: 0;
}
.rui-switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 16px;
  height: 16px;
  background: var(--rui-color-surface);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
  transition: transform 180ms cubic-bezier(0.5, 0.05, 0.5, 1.2);
}
.rui-switch-input:checked + .rui-switch-track {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
}
.rui-switch-input:checked + .rui-switch-track .rui-switch-thumb { transform: translateX(16px); }
.rui-switch-input:focus-visible + .rui-switch-track {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 25%, transparent);
}
.rui-switch-meta { display: flex; flex-direction: column; gap: 2px; }
.rui-switch-label { font-weight: 500; font-size: 14px; }
.rui-switch-description { font-size: 12px; color: var(--rui-color-text-muted); }

/* Toggle (single + group) */
.rui-toggle {
  border: 1px solid transparent;
  border-radius: var(--rui-radius-sm);
  background: transparent;
  color: var(--rui-color-text);
  padding: 6px 12px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.rui-toggle[data-size="sm"] { padding: 4px 8px; font-size: 12px; }
.rui-toggle[data-size="lg"] { padding: 9px 16px; font-size: 15px; }
.rui-toggle[data-variant="outline"] {
  border-color: var(--rui-color-border);
  background: var(--rui-color-surface);
}
.rui-toggle[data-variant="ghost"] { background: transparent; }
.rui-toggle:hover:not([data-state="on"]) { background: var(--rui-color-surface-muted); }
.rui-toggle[data-state="on"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  border-color: color-mix(in srgb, var(--rui-color-primary) 32%, transparent);
}
.rui-toggle-icon { display: inline-flex; align-items: center; }
.rui-toggle-group {
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  border-radius: var(--rui-radius-sm);
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface);
  padding: 2px;
}
.rui-toggle-group .rui-toggle {
  border: none;
  border-radius: calc(var(--rui-radius-sm) - 2px);
  background: transparent;
}
.rui-toggle-group .rui-toggle[data-state="on"] {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-primary);
}

/* Tooltip — CSS-only hover/focus reveal with arrow and accurate placement. */
.rui-tooltip {
  position: relative;
  display: inline-flex;
  align-items: center;
  outline: none;
}
.rui-tooltip-trigger { display: contents; }
.rui-tooltip-content {
  position: absolute;
  padding: 5px 9px;
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-text);
  color: var(--rui-color-bg);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  max-width: 240px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease, transform 140ms ease;
  z-index: 30;
  box-shadow: var(--rui-shadow-sm);
  /* Default origin — overridden per side below. */
  --rui-tooltip-x: -50%;
  --rui-tooltip-y: 0;
  --rui-tooltip-offset-x: 0;
  --rui-tooltip-offset-y: 4px;
}
/* Arrow pointing back at the trigger. */
.rui-tooltip-arrow {
  position: absolute;
  width: 8px;
  height: 8px;
  background: inherit;
  transform: rotate(45deg);
}
.rui-tooltip[data-side="top"] .rui-tooltip-content {
  bottom: calc(100% + 6px);
  left: 50%;
  --rui-tooltip-x: -50%;
  --rui-tooltip-y: 0;
  --rui-tooltip-offset-y: 4px;
}
.rui-tooltip[data-side="top"] .rui-tooltip-arrow {
  bottom: -4px;
  left: calc(50% - 4px);
}
.rui-tooltip[data-side="bottom"] .rui-tooltip-content {
  top: calc(100% + 6px);
  left: 50%;
  --rui-tooltip-x: -50%;
  --rui-tooltip-y: 0;
  --rui-tooltip-offset-y: -4px;
}
.rui-tooltip[data-side="bottom"] .rui-tooltip-arrow {
  top: -4px;
  left: calc(50% - 4px);
}
.rui-tooltip[data-side="left"] .rui-tooltip-content {
  right: calc(100% + 6px);
  top: 50%;
  --rui-tooltip-x: 0;
  --rui-tooltip-y: -50%;
  --rui-tooltip-offset-x: 4px;
  --rui-tooltip-offset-y: 0;
}
.rui-tooltip[data-side="left"] .rui-tooltip-arrow {
  right: -4px;
  top: calc(50% - 4px);
}
.rui-tooltip[data-side="right"] .rui-tooltip-content {
  left: calc(100% + 6px);
  top: 50%;
  --rui-tooltip-x: 0;
  --rui-tooltip-y: -50%;
  --rui-tooltip-offset-x: -4px;
  --rui-tooltip-offset-y: 0;
}
.rui-tooltip[data-side="right"] .rui-tooltip-arrow {
  left: -4px;
  top: calc(50% - 4px);
}
.rui-tooltip-content {
  transform: translate(calc(var(--rui-tooltip-x) + var(--rui-tooltip-offset-x)), calc(var(--rui-tooltip-y) + var(--rui-tooltip-offset-y)));
}
.rui-tooltip:hover .rui-tooltip-content,
.rui-tooltip:focus-visible .rui-tooltip-content,
.rui-tooltip:focus-within:not(:active) .rui-tooltip-content {
  opacity: 1;
  transform: translate(var(--rui-tooltip-x), var(--rui-tooltip-y));
}
/* When the wrapper (or any descendant) is being pressed, suppress the
 * tooltip immediately so clicking the trigger doesn't leave it visible. */
.rui-tooltip:active .rui-tooltip-content,
.rui-tooltip:has(:active) .rui-tooltip-content {
  opacity: 0;
  transition-duration: 0ms;
}

/* HoverCard */
.rui-hover-card {
  position: relative;
  display: inline-flex;
  outline: none;
}
.rui-hover-card-trigger { display: contents; }
.rui-hover-card-content {
  position: absolute;
  min-width: 240px;
  max-width: 320px;
  padding: var(--rui-spacing-m);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  box-shadow: var(--rui-shadow-md);
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
  z-index: 25;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
}
.rui-hover-card[data-side="bottom"] .rui-hover-card-content { top: calc(100% + 6px); left: 0; transform: translateY(-4px); }
.rui-hover-card[data-side="top"] .rui-hover-card-content { bottom: calc(100% + 6px); left: 0; transform: translateY(4px); }
.rui-hover-card[data-side="left"] .rui-hover-card-content { right: calc(100% + 6px); top: 0; transform: translateX(4px); }
.rui-hover-card[data-side="right"] .rui-hover-card-content { left: calc(100% + 6px); top: 0; transform: translateX(-4px); }
.rui-hover-card:hover .rui-hover-card-content,
.rui-hover-card:focus-visible .rui-hover-card-content,
.rui-hover-card:focus-within .rui-hover-card-content,
.rui-hover-card[data-open="true"] .rui-hover-card-content {
  opacity: 1;
  pointer-events: auto;
  transform: translate(0, 0);
}

/* Kbd */
.rui-kbd-group { display: inline-flex; align-items: center; gap: 4px; }
.rui-kbd {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--rui-color-surface-muted);
  border: 1px solid var(--rui-color-border);
  border-bottom-width: 2px;
  font-family: var(--rui-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  font-weight: 600;
  color: var(--rui-color-text);
  line-height: 1.2;
  box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.04);
}
.rui-kbd-group[data-size="sm"] .rui-kbd { padding: 1px 4px; font-size: 10px; }
.rui-kbd-sep { color: var(--rui-color-text-muted); font-size: 10px; }

/* Breadcrumb */
.rui-breadcrumb { display: flex; }
.rui-breadcrumb-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 13px;
  color: var(--rui-color-text-muted);
}
.rui-breadcrumb-item { display: inline-flex; align-items: center; }
.rui-breadcrumb-separator { color: var(--rui-color-border); }
.rui-breadcrumb-link {
  color: var(--rui-color-text-muted);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.rui-breadcrumb-link:hover { color: var(--rui-color-primary); text-decoration: underline; }
.rui-breadcrumb-current {
  color: var(--rui-color-text);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Pagination */
.rui-pagination {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: var(--rui-radius-sm);
}
.rui-pagination-button {
  min-width: 32px;
  height: 32px;
  border-radius: var(--rui-radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--rui-color-text);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  padding: 0 8px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.rui-pagination-button:hover:not([disabled]):not([data-active="true"]) {
  background: var(--rui-color-surface-muted);
}
.rui-pagination-button[data-active="true"] {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  border-color: var(--rui-color-primary);
}
.rui-pagination-button:disabled { opacity: 0.45; cursor: not-allowed; }
.rui-pagination-ellipsis {
  min-width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--rui-color-text-muted);
}

/* Sheet — side drawer overlay. */
.rui-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.40);
  display: flex;
  z-index: 50;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
}
.rui-sheet-overlay[data-side="right"] { justify-content: flex-end; }
.rui-sheet-overlay[data-side="left"] { justify-content: flex-start; }
.rui-sheet-overlay[data-side="top"],
.rui-sheet-overlay[data-side="bottom"] { flex-direction: column; }
.rui-sheet-overlay[data-side="bottom"] { justify-content: flex-end; }
.rui-sheet-overlay[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
}
.rui-sheet {
  background: var(--rui-color-surface);
  display: flex;
  flex-direction: column;
  width: min(420px, 100vw);
  height: 100%;
  box-shadow: var(--rui-shadow-md);
  transition: transform 240ms cubic-bezier(0.4, 0, 0.2, 1);
}
.rui-sheet[data-side="right"] { transform: translateX(100%); }
.rui-sheet[data-side="left"] { transform: translateX(-100%); }
.rui-sheet[data-side="top"] { width: 100%; height: auto; max-height: 80vh; transform: translateY(-100%); }
.rui-sheet[data-side="bottom"] { width: 100%; height: auto; max-height: 80vh; transform: translateY(100%); }
.rui-sheet-overlay[data-open="true"] .rui-sheet { transform: translate(0, 0); }
.rui-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--rui-spacing-l);
  border-bottom: 1px solid var(--rui-color-border);
}
.rui-sheet-title { margin: 0; font-size: 16px; font-weight: 600; }
.rui-sheet-close {
  background: transparent;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--rui-color-text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--rui-radius-sm);
}
.rui-sheet-close:hover { background: var(--rui-color-surface-muted); }
.rui-sheet-body {
  padding: var(--rui-spacing-l);
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
}
.rui-sheet-footer {
  display: flex;
  gap: var(--rui-spacing-s);
  justify-content: flex-end;
  padding: var(--rui-spacing-l);
  border-top: 1px solid var(--rui-color-border);
}

/* ========================================================================
   Pattern composites: Hero, PageHeader, MetricGrid, EmptyState, Timeline,
   FeatureGrid, Testimonial, ProfileCard, Comment, Banner, KanbanBoard.
   ======================================================================== */

.rui-pattern-actions {
  display: flex;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
}

/* Hero */
.rui-hero {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--rui-spacing-l);
  align-items: center;
  padding: clamp(28px, 4vw, 56px);
  border-radius: var(--rui-radius-lg);
  background:
    radial-gradient(60% 60% at 0% 0%, color-mix(in srgb, var(--rui-color-primary) 18%, transparent), transparent 60%),
    radial-gradient(50% 50% at 100% 100%, color-mix(in srgb, var(--rui-color-info) 18%, transparent), transparent 60%),
    var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  overflow: hidden;
}
.rui-hero[data-has-image="true"] { grid-template-columns: 1.2fr 1fr; }
.rui-hero[data-tone="success"] { background:
    radial-gradient(60% 60% at 0% 0%, color-mix(in srgb, var(--rui-color-success) 18%, transparent), transparent 60%),
    var(--rui-color-surface); }
.rui-hero[data-tone="warning"] { background:
    radial-gradient(60% 60% at 0% 0%, color-mix(in srgb, var(--rui-color-warning) 22%, transparent), transparent 60%),
    var(--rui-color-surface); }
.rui-hero[data-tone="danger"] { background:
    radial-gradient(60% 60% at 0% 0%, color-mix(in srgb, var(--rui-color-danger) 18%, transparent), transparent 60%),
    var(--rui-color-surface); }
.rui-hero-body {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  align-items: flex-start;
  min-width: 0;
}
.rui-hero-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--rui-color-primary);
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
}
.rui-hero-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: clamp(28px, 3.4vw, 44px);
  font-weight: calc(var(--rui-font-weight-heading) + 100);
  line-height: 1.05;
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
}
.rui-hero-subtitle {
  margin: 0;
  font-size: clamp(15px, 1.4vw, 17px);
  color: var(--rui-color-text-muted);
  max-width: 60ch;
  line-height: 1.5;
}
.rui-hero-highlights { display: flex; flex-wrap: wrap; gap: 8px; }
.rui-hero-highlight {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  color: var(--rui-color-text);
}
.rui-hero-ctas { display: flex; flex-wrap: wrap; gap: var(--rui-spacing-s); margin-top: 4px; }
.rui-hero-media {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}
.rui-hero-media img {
  max-width: 100%;
  height: auto;
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
}

/* PageHeader */
.rui-page-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: var(--rui-spacing-m);
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-page-header-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--rui-color-text-muted);
}
.rui-page-header-crumb-sep { color: var(--rui-color-border); }
.rui-page-header-crumb { color: var(--rui-color-text-muted); }
.rui-page-header-crumb:last-child { color: var(--rui-color-text); font-weight: 600; }
.rui-page-header-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-m);
  flex-wrap: wrap;
  justify-content: space-between;
}
.rui-page-header-title-block { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rui-page-header-title-line {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
}
.rui-page-header-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: clamp(20px, 2vw, calc(var(--rui-font-size-title) + 4px));
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
}
.rui-page-header-subtitle {
  margin: 0;
  color: var(--rui-color-text-muted);
  font-size: 14px;
  max-width: 70ch;
}
.rui-page-header-actions { gap: var(--rui-spacing-s); flex-wrap: wrap; }

/* MetricGrid */
.rui-metric-grid {
  display: grid;
  gap: var(--rui-spacing-m);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.rui-metric-grid[data-columns="1"] { grid-template-columns: 1fr; }
.rui-metric-grid[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rui-metric-grid[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rui-metric-grid[data-columns="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.rui-metric-grid[data-columns="5"] { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.rui-metric-grid[data-columns="6"] { grid-template-columns: repeat(6, minmax(0, 1fr)); }

/* EmptyState */
.rui-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--rui-spacing-s);
  text-align: center;
  padding: clamp(24px, 5vw, 56px) var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  border: 1px dashed var(--rui-color-border);
  background: var(--rui-color-bg-subtle);
}
.rui-empty-state-icon {
  font-size: 40px;
  line-height: 1;
  width: 72px;
  height: 72px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
}
.rui-empty-state-title { margin: 0; font-size: 16px; font-weight: 600; }
.rui-empty-state-description {
  margin: 0;
  color: var(--rui-color-text-muted);
  font-size: 13px;
  max-width: 48ch;
}
.rui-empty-state-action { margin-top: var(--rui-spacing-s); }

/* Timeline */
.rui-timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  position: relative;
}
.rui-timeline-item {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: var(--rui-spacing-s);
  position: relative;
}
.rui-timeline-item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 15px;
  top: 32px;
  bottom: -16px;
  width: 2px;
  background: var(--rui-color-border);
}
.rui-timeline-marker {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: 2px solid var(--rui-color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--rui-color-text);
  flex-shrink: 0;
}
.rui-timeline-item[data-tone="primary"] .rui-timeline-marker { border-color: var(--rui-color-primary); color: var(--rui-color-primary); }
.rui-timeline-item[data-tone="success"] .rui-timeline-marker { border-color: var(--rui-color-success); color: var(--rui-color-success); }
.rui-timeline-item[data-tone="warning"] .rui-timeline-marker { border-color: var(--rui-color-warning); color: var(--rui-color-warning); }
.rui-timeline-item[data-tone="danger"] .rui-timeline-marker { border-color: var(--rui-color-danger); color: var(--rui-color-danger); }
.rui-timeline-item[data-tone="info"] .rui-timeline-marker { border-color: var(--rui-color-info); color: var(--rui-color-info); }
.rui-timeline-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-top: 6px; }
.rui-timeline-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rui-timeline-title { font-weight: 600; }
.rui-timeline-time {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  font-variant-numeric: tabular-nums;
}
.rui-timeline-description { color: var(--rui-color-text-muted); font-size: 13px; }

/* FeatureGrid */
.rui-feature-grid {
  display: grid;
  gap: var(--rui-spacing-l);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.rui-feature-grid[data-columns="1"] { grid-template-columns: 1fr; }
.rui-feature-grid[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rui-feature-grid[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rui-feature-grid[data-columns="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.rui-feature-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.rui-feature-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--rui-shadow-md);
  border-color: color-mix(in srgb, var(--rui-color-primary) 28%, var(--rui-color-border));
}
.rui-feature-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--rui-radius-md);
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: var(--rui-spacing-s);
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
}
.rui-feature-item[data-tone="success"] .rui-feature-icon { background: color-mix(in srgb, var(--rui-color-success) 14%, transparent); color: var(--rui-color-success); }
.rui-feature-item[data-tone="warning"] .rui-feature-icon { background: color-mix(in srgb, var(--rui-color-warning) 14%, transparent); color: var(--rui-color-warning); }
.rui-feature-item[data-tone="danger"] .rui-feature-icon { background: color-mix(in srgb, var(--rui-color-danger) 14%, transparent); color: var(--rui-color-danger); }
.rui-feature-item[data-tone="info"] .rui-feature-icon { background: color-mix(in srgb, var(--rui-color-info) 14%, transparent); color: var(--rui-color-info); }
.rui-feature-title { margin: 0; font-size: 16px; font-weight: 600; }
.rui-feature-description { margin: 0; color: var(--rui-color-text-muted); font-size: 13px; line-height: 1.5; }

/* Testimonial */
.rui-testimonial {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  position: relative;
}
.rui-testimonial::before {
  content: "“";
  position: absolute;
  top: -8px;
  left: var(--rui-spacing-m);
  font-size: 64px;
  line-height: 1;
  color: color-mix(in srgb, var(--rui-color-primary) 28%, transparent);
  font-family: Georgia, serif;
}
.rui-testimonial-rating { color: var(--rui-color-warning); letter-spacing: 1px; }
.rui-testimonial-quote {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--rui-color-text);
}
.rui-testimonial-author {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
}
.rui-testimonial-avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; }
.rui-testimonial-meta { display: flex; flex-direction: column; }
.rui-testimonial-name { font-weight: 600; font-size: 14px; }
.rui-testimonial-role { font-size: 12px; color: var(--rui-color-text-muted); }

/* ProfileCard */
.rui-profile-card {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
}
.rui-profile-card-header { display: flex; align-items: center; gap: var(--rui-spacing-m); }
.rui-profile-card-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rui-profile-card-name { margin: 0; font-size: 16px; font-weight: 600; }
.rui-profile-card-role { margin: 0; font-size: 13px; color: var(--rui-color-text-muted); }
.rui-profile-card-bio { margin: 0; color: var(--rui-color-text); font-size: 13px; line-height: 1.5; }
.rui-profile-card-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.rui-profile-card-actions { gap: var(--rui-spacing-s); }

/* Comment */
.rui-comment {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-s) 0;
}
.rui-comment-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  background: var(--rui-color-bg-subtle);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  border-radius: var(--rui-radius-md);
  border: 1px solid var(--rui-color-border-subtle);
}
.rui-comment-header { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.rui-comment-author { font-weight: 600; font-size: 13px; }
.rui-comment-time { font-size: 12px; color: var(--rui-color-text-muted); }
.rui-comment-content { font-size: 14px; color: var(--rui-color-text); line-height: 1.5; }
.rui-comment-actions { gap: var(--rui-spacing-xs); margin-top: 4px; }

/* Banner */
.rui-banner {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-s) var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-surface)),
    color-mix(in srgb, var(--rui-color-info) 12%, var(--rui-color-surface)));
  border: 1px solid color-mix(in srgb, var(--rui-color-primary) 28%, var(--rui-color-border));
  color: var(--rui-color-text);
}
.rui-banner[data-tone="success"] {
  background: linear-gradient(135deg, color-mix(in srgb, var(--rui-color-success) 18%, var(--rui-color-surface)), var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-success) 28%, var(--rui-color-border));
}
.rui-banner[data-tone="warning"] {
  background: linear-gradient(135deg, color-mix(in srgb, var(--rui-color-warning) 18%, var(--rui-color-surface)), var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-warning) 32%, var(--rui-color-border));
}
.rui-banner[data-tone="danger"] {
  background: linear-gradient(135deg, color-mix(in srgb, var(--rui-color-danger) 18%, var(--rui-color-surface)), var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-danger) 32%, var(--rui-color-border));
}
.rui-banner-icon {
  font-size: 22px;
  flex-shrink: 0;
}
.rui-banner-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.rui-banner-title { font-size: 14px; }
.rui-banner-message { font-size: 13px; color: var(--rui-color-text-muted); }
.rui-banner-action { flex-shrink: 0; }

/* Kanban */
.rui-kanban-board {
  display: flex;
  gap: var(--rui-spacing-m);
  overflow-x: auto;
  padding-bottom: var(--rui-spacing-s);
  -webkit-overflow-scrolling: touch;
}
.rui-kanban-column {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-m);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-bg-subtle);
  border: 1px solid var(--rui-color-border);
  min-width: 0;
}
.rui-kanban-column-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rui-kanban-column-title { font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--rui-color-text); }
.rui-kanban-column-count {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  color: var(--rui-color-text-muted);
}
.rui-kanban-column[data-tone="primary"] .rui-kanban-column-title { color: var(--rui-color-primary); }
.rui-kanban-column[data-tone="success"] .rui-kanban-column-title { color: var(--rui-color-success); }
.rui-kanban-column[data-tone="warning"] .rui-kanban-column-title { color: var(--rui-color-warning); }
.rui-kanban-column[data-tone="danger"] .rui-kanban-column-title { color: var(--rui-color-danger); }
.rui-kanban-column-body { display: flex; flex-direction: column; gap: var(--rui-spacing-s); }
.rui-kanban-column-empty {
  text-align: center;
  padding: var(--rui-spacing-m);
  font-size: 12px;
  color: var(--rui-color-text-muted);
  border: 1px dashed var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
}
.rui-kanban-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  box-shadow: var(--rui-shadow-sm);
}
.rui-kanban-card[role="button"] {
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 160ms ease;
}
.rui-kanban-card[role="button"]:hover { transform: translateY(-1px); box-shadow: var(--rui-shadow-md); }
.rui-kanban-card-title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.rui-kanban-card-icon { font-size: 14px; }
.rui-kanban-card-description { margin: 0; color: var(--rui-color-text-muted); font-size: 12px; line-height: 1.4; }
.rui-kanban-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.rui-kanban-card-footer { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.rui-kanban-card-assignee { font-size: 12px; color: var(--rui-color-text-muted); }
.rui-kanban-card[data-tone="primary"] { border-left: 3px solid var(--rui-color-primary); }
.rui-kanban-card[data-tone="success"] { border-left: 3px solid var(--rui-color-success); }
.rui-kanban-card[data-tone="warning"] { border-left: 3px solid var(--rui-color-warning); }
.rui-kanban-card[data-tone="danger"] { border-left: 3px solid var(--rui-color-danger); }
.rui-kanban-card[data-tone="info"] { border-left: 3px solid var(--rui-color-info); }

/* SectionHeader */
.rui-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rui-spacing-m);
  flex-wrap: wrap;
  padding-bottom: var(--rui-spacing-s);
  border-bottom: 1px solid var(--rui-color-border-subtle);
  margin-bottom: var(--rui-spacing-s);
}
.rui-section-header-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; }
.rui-section-header-eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--rui-color-primary);
}
.rui-section-header-title-line {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
}
.rui-section-header-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-heading);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
}
.rui-section-header-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--rui-color-text-muted);
  max-width: 70ch;
}
.rui-section-header-actions {
  display: flex;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* Toolbar */
.rui-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-m);
  flex-wrap: wrap;
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-bg-subtle);
  border: 1px solid var(--rui-color-border);
}
.rui-toolbar-side {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
  min-width: 0;
}
.rui-toolbar-left { flex: 1 1 auto; }
.rui-toolbar-right { flex-shrink: 0; }
.rui-toolbar .rui-form-control { gap: 4px; }
.rui-toolbar .rui-form-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--rui-color-text-muted); }
.rui-toolbar .rui-input,
.rui-toolbar .rui-select { min-width: 160px; }

/* Sidebar + AppShell */
.rui-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-m);
  width: 240px;
  flex-shrink: 0;
  background: var(--rui-color-bg-subtle);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  align-self: stretch;
}
.rui-sidebar-header { display: flex; flex-direction: column; gap: 2px; padding-bottom: var(--rui-spacing-s); border-bottom: 1px solid var(--rui-color-border-subtle); }
.rui-sidebar-brand { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; color: var(--rui-color-text); }
.rui-sidebar-tagline { font-size: 12px; color: var(--rui-color-text-muted); }
.rui-sidebar-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-height: 0; }
.rui-sidebar-section { display: flex; flex-direction: column; gap: 2px; margin-top: var(--rui-spacing-s); }
.rui-sidebar-section:first-child { margin-top: 0; }
.rui-sidebar-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: var(--rui-color-text-muted);
  padding: 0 var(--rui-spacing-s);
  margin-bottom: 4px;
}
.rui-sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-xs) var(--rui-spacing-s);
  border-radius: var(--rui-radius-sm);
  background: transparent;
  border: 1px solid transparent;
  color: var(--rui-color-text);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  width: 100%;
}
.rui-sidebar-item:hover {
  background: var(--rui-color-surface);
  color: var(--rui-color-primary);
}
.rui-sidebar-item[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  border-color: color-mix(in srgb, var(--rui-color-primary) 32%, transparent);
}
.rui-sidebar-item-icon { font-size: 14px; width: 18px; text-align: center; }
.rui-sidebar-item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rui-sidebar-item-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  color: var(--rui-color-text-muted);
  font-weight: 600;
}
.rui-sidebar-item[data-active="true"] .rui-sidebar-item-badge {
  background: color-mix(in srgb, var(--rui-color-primary) 22%, var(--rui-color-surface));
  color: var(--rui-color-primary);
  border-color: color-mix(in srgb, var(--rui-color-primary) 40%, transparent);
}
.rui-sidebar-footer {
  padding-top: var(--rui-spacing-s);
  border-top: 1px solid var(--rui-color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
}

.rui-app-shell {
  display: flex;
  gap: var(--rui-spacing-l);
  align-items: stretch;
  min-height: 0;
}
.rui-app-shell-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-l);
}
.rui-app-shell-topbar {
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
}
.rui-app-shell-content {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-l);
}

/* SplitView */
.rui-split-view {
  display: grid;
  grid-template-columns: var(--rui-split-primary, 320px) 1fr;
  gap: var(--rui-spacing-l);
  align-items: stretch;
  min-width: 0;
}
.rui-split-view-primary,
.rui-split-view-detail {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  min-width: 0;
}

/* DescriptionList */
.rui-description-list {
  display: grid;
  gap: var(--rui-spacing-s) var(--rui-spacing-l);
  grid-template-columns: 1fr;
  margin: 0;
  padding: var(--rui-spacing-m) 0;
}
.rui-description-list[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rui-description-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--rui-spacing-s) 0;
  border-bottom: 1px dashed var(--rui-color-border-subtle);
}
.rui-description-label {
  margin: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--rui-color-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.rui-description-icon { font-size: 13px; }
.rui-description-value {
  margin: 0;
  font-size: 14px;
  color: var(--rui-color-text);
  font-weight: 500;
  word-break: break-word;
}

/* StatusDot */
.rui-status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--rui-color-text-muted);
}
.rui-status-dot-marker {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--rui-color-text-muted);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-text-muted) 18%, transparent);
}
.rui-status-dot[data-tone="primary"] .rui-status-dot-marker { background: var(--rui-color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-primary) 20%, transparent); }
.rui-status-dot[data-tone="success"] .rui-status-dot-marker { background: var(--rui-color-success); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-success) 22%, transparent); }
.rui-status-dot[data-tone="warning"] .rui-status-dot-marker { background: var(--rui-color-warning); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-warning) 22%, transparent); }
.rui-status-dot[data-tone="danger"] .rui-status-dot-marker { background: var(--rui-color-danger); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-danger) 22%, transparent); }
.rui-status-dot[data-tone="info"] .rui-status-dot-marker { background: var(--rui-color-info); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-info) 22%, transparent); }
.rui-status-dot-label { color: var(--rui-color-text); font-weight: 500; }
.rui-status-dot[data-pulse="true"] .rui-status-dot-marker {
  animation: rui-status-dot-pulse 1600ms ease-in-out infinite;
}
@keyframes rui-status-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 16%, transparent); }
  50%      { box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 8%, transparent); }
}

/* Pricing */
.rui-pricing-table {
  display: grid;
  gap: var(--rui-spacing-l);
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  align-items: stretch;
}
.rui-pricing-table[data-columns="1"] { grid-template-columns: 1fr; }
.rui-pricing-table[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rui-pricing-table[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rui-pricing-table[data-columns="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }

.rui-pricing-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
}
.rui-pricing-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--rui-shadow-md);
  border-color: color-mix(in srgb, var(--rui-color-primary) 22%, var(--rui-color-border));
}
.rui-pricing-card[data-featured="true"] {
  border-color: color-mix(in srgb, var(--rui-color-primary) 48%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--rui-color-primary) 24%, transparent), var(--rui-shadow-md);
  background: linear-gradient(180deg, color-mix(in srgb, var(--rui-color-primary) 6%, var(--rui-color-surface)) 0%, var(--rui-color-surface) 70%);
}
.rui-pricing-card-badge {
  position: absolute;
  top: -10px;
  right: var(--rui-spacing-l);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  box-shadow: var(--rui-shadow-sm);
}
.rui-pricing-card-plan {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
}
.rui-pricing-card-description { margin: 0; font-size: 13px; color: var(--rui-color-text-muted); line-height: 1.5; }
.rui-pricing-card-price-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: var(--rui-spacing-s) 0;
}
.rui-pricing-card-price {
  font-size: clamp(28px, 3.4vw, 36px);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--rui-color-text);
}
.rui-pricing-card-period { font-size: 13px; color: var(--rui-color-text-muted); }
.rui-pricing-card-features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
}
.rui-pricing-card-feature {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--rui-color-text);
}
.rui-pricing-card-check {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-success) 18%, transparent);
  color: var(--rui-color-success);
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}
.rui-pricing-card-action {
  margin-top: var(--rui-spacing-s);
  display: flex;
}
.rui-pricing-card-action .rui-button { width: 100%; }

/* ========================================================================
   Richer composition primitives
   Cover · MediaCard · Stats · Tile · Notification · PersonChip ·
   Container · Spacer · Quote · Note · Rating · ProgressRing · ChatBubble ·
   SearchBar
   ======================================================================== */

/* Container */
.rui-container {
  width: 100%;
}
.rui-container[data-size="sm"]  { max-width: 640px; }
.rui-container[data-size="md"]  { max-width: 820px; }
.rui-container[data-size="lg"]  { max-width: 1040px; }
.rui-container[data-size="xl"]  { max-width: 1280px; }
.rui-container[data-size="full"] { max-width: 100%; }
.rui-container[data-padding="none"] { padding-left: 0; padding-right: 0; }
.rui-container[data-padding="s"]  { padding-left: var(--rui-spacing-s); padding-right: var(--rui-spacing-s); }
.rui-container[data-padding="m"]  { padding-left: var(--rui-spacing-m); padding-right: var(--rui-spacing-m); }
.rui-container[data-padding="l"]  { padding-left: var(--rui-spacing-l); padding-right: var(--rui-spacing-l); }

/* Spacer */
.rui-spacer { display: block; }
.rui-spacer[data-flex="true"] { flex: 1 1 auto; }
.rui-spacer[data-size="xs"] { min-width: var(--rui-spacing-xs); min-height: var(--rui-spacing-xs); }
.rui-spacer[data-size="s"]  { min-width: var(--rui-spacing-s);  min-height: var(--rui-spacing-s); }
.rui-spacer[data-size="m"]  { min-width: var(--rui-spacing-m);  min-height: var(--rui-spacing-m); }
.rui-spacer[data-size="l"]  { min-width: var(--rui-spacing-l);  min-height: var(--rui-spacing-l); }
.rui-spacer[data-size="xl"] { min-width: var(--rui-spacing-xl); min-height: var(--rui-spacing-xl); }

/* Cover */
.rui-cover {
  position: relative;
  display: flex;
  align-items: flex-end;
  border-radius: var(--rui-radius-lg);
  padding: var(--rui-spacing-xl) var(--rui-spacing-xl);
  color: #ffffff;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  background-color: color-mix(in srgb, var(--rui-color-primary) 20%, #0f172a);
  box-shadow: var(--rui-shadow-md);
}
.rui-cover-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  max-width: 720px;
  z-index: 1;
}
.rui-cover-eyebrow {
  display: inline-flex;
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(6px);
}
.rui-cover-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: clamp(24px, 3.5vw, 36px);
  font-weight: var(--rui-font-weight-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
  line-height: 1.15;
  text-shadow: 0 4px 16px rgba(15, 23, 42, 0.35);
}
.rui-cover-subtitle {
  margin: 0;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.92);
  max-width: 640px;
  line-height: 1.55;
}
.rui-cover-caption {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
}
.rui-cover-actions { margin-top: var(--rui-spacing-s); }
.rui-cover[data-tone="success"] { background-color: color-mix(in srgb, var(--rui-color-success) 18%, #022c22); }
.rui-cover[data-tone="warning"] { background-color: color-mix(in srgb, var(--rui-color-warning) 18%, #1f1404); }
.rui-cover[data-tone="danger"]  { background-color: color-mix(in srgb, var(--rui-color-danger)  18%, #1f0606); }
.rui-cover[data-tone="info"]    { background-color: color-mix(in srgb, var(--rui-color-info)    18%, #03242a); }
.rui-cover[data-tone="default"] { background-color: #0f172a; }

/* MediaCard */
.rui-media-card {
  display: flex;
  flex-direction: column;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  overflow: hidden;
  transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
}
.rui-media-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--rui-shadow-md);
  border-color: color-mix(in srgb, var(--rui-color-primary) 20%, var(--rui-color-border));
}
.rui-media-card-media {
  position: relative;
  width: 100%;
  background: color-mix(in srgb, var(--rui-color-text) 6%, var(--rui-color-surface-muted));
  overflow: hidden;
}
.rui-media-card-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rui-media-card-media-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rui-color-text-muted);
}
.rui-media-card-placeholder { font-size: clamp(32px, 4vw, 48px); opacity: 0.55; }
.rui-media-card-badge {
  position: absolute;
  top: var(--rui-spacing-s);
  left: var(--rui-spacing-s);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #ffffff;
  backdrop-filter: blur(6px);
}
.rui-media-card-body {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-m) var(--rui-spacing-l) var(--rui-spacing-l);
}
.rui-media-card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--rui-color-text);
}
.rui-media-card-description {
  margin: 0;
  font-size: 13.5px;
  color: var(--rui-color-text-muted);
  line-height: 1.55;
}
.rui-media-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rui-media-card-meta {
  margin: 0;
  font-size: 12px;
  color: var(--rui-color-text-muted);
  border-top: 1px solid var(--rui-color-border-subtle);
  padding-top: var(--rui-spacing-s);
}
.rui-media-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rui-spacing-s);
  margin-top: var(--rui-spacing-xs);
}
.rui-media-card[data-orientation="horizontal"] {
  flex-direction: row;
  align-items: stretch;
}
.rui-media-card[data-orientation="horizontal"] .rui-media-card-media {
  width: 38%;
  max-width: 280px;
  min-height: 100%;
}
.rui-media-card[data-orientation="horizontal"] .rui-media-card-body { flex: 1 1 auto; }

/* Stats */
.rui-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rui-spacing-l);
  padding: var(--rui-spacing-m) 0;
}
.rui-stats[data-align="center"] { justify-content: center; }
.rui-stats[data-align="end"]    { justify-content: flex-end; }
.rui-stats-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 96px;
  padding: 0 var(--rui-spacing-m);
  border-left: 1px solid var(--rui-color-border-subtle);
}
.rui-stats-item:first-child { padding-left: 0; border-left: none; }
.rui-stats-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--rui-color-text-muted);
}
.rui-stats-value {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--rui-color-text);
}
.rui-stats-hint {
  font-size: 12px;
  color: var(--rui-color-text-muted);
}
.rui-stats-item[data-tone="primary"] .rui-stats-value { color: var(--rui-color-primary); }
.rui-stats-item[data-tone="success"] .rui-stats-value { color: var(--rui-color-success); }
.rui-stats-item[data-tone="warning"] .rui-stats-value { color: var(--rui-color-warning); }
.rui-stats-item[data-tone="danger"]  .rui-stats-value { color: var(--rui-color-danger); }
.rui-stats-item[data-tone="info"]    .rui-stats-value { color: var(--rui-color-info); }

/* Tile */
.rui-tile {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: default;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}
button.rui-tile { cursor: pointer; }
button.rui-tile:hover,
.rui-tile:hover {
  transform: translateY(-1px);
  box-shadow: var(--rui-shadow-sm);
  border-color: color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-border));
}
.rui-tile-icon {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--rui-radius-md);
  background: color-mix(in srgb, var(--rui-color-primary) 12%, var(--rui-color-surface-muted));
  font-size: 18px;
  flex-shrink: 0;
}
.rui-tile-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rui-tile-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-tile-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--rui-color-text);
}
.rui-tile-description {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  line-height: 1.45;
}
.rui-tile[data-tone="primary"] .rui-tile-icon { background: color-mix(in srgb, var(--rui-color-primary) 18%, transparent); color: var(--rui-color-primary); }
.rui-tile[data-tone="success"] .rui-tile-icon { background: color-mix(in srgb, var(--rui-color-success) 18%, transparent); color: var(--rui-color-success); }
.rui-tile[data-tone="warning"] .rui-tile-icon { background: color-mix(in srgb, var(--rui-color-warning) 18%, transparent); color: var(--rui-color-warning); }
.rui-tile[data-tone="danger"]  .rui-tile-icon { background: color-mix(in srgb, var(--rui-color-danger)  18%, transparent); color: var(--rui-color-danger); }
.rui-tile[data-tone="info"]    .rui-tile-icon { background: color-mix(in srgb, var(--rui-color-info)    18%, transparent); color: var(--rui-color-info); }

/* Notification */
.rui-notification {
  display: flex;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  position: relative;
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}
.rui-notification[data-unread="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 5%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-primary) 28%, var(--rui-color-border));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--rui-color-primary) 16%, transparent);
}
.rui-notification[data-unread="true"]::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: var(--rui-color-primary);
  border-radius: var(--rui-radius-md) 0 0 var(--rui-radius-md);
}
.rui-notification[data-tone="success"][data-unread="true"] {
  background: color-mix(in srgb, var(--rui-color-success) 6%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-success) 28%, var(--rui-color-border));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--rui-color-success) 16%, transparent);
}
.rui-notification[data-tone="success"][data-unread="true"]::before { background: var(--rui-color-success); }
.rui-notification[data-tone="warning"][data-unread="true"] {
  background: color-mix(in srgb, var(--rui-color-warning) 6%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-warning) 28%, var(--rui-color-border));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--rui-color-warning) 16%, transparent);
}
.rui-notification[data-tone="warning"][data-unread="true"]::before { background: var(--rui-color-warning); }
.rui-notification[data-tone="danger"][data-unread="true"] {
  background: color-mix(in srgb, var(--rui-color-danger) 6%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-danger) 28%, var(--rui-color-border));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--rui-color-danger) 16%, transparent);
}
.rui-notification[data-tone="danger"][data-unread="true"]::before  { background: var(--rui-color-danger); }
.rui-notification[data-tone="info"][data-unread="true"] {
  background: color-mix(in srgb, var(--rui-color-info) 6%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-info) 28%, var(--rui-color-border));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--rui-color-info) 16%, transparent);
}
.rui-notification[data-tone="info"][data-unread="true"]::before    { background: var(--rui-color-info); }
.rui-notification-visual { flex-shrink: 0; display: flex; }
.rui-notification-icon {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-primary) 12%, var(--rui-color-surface-muted));
  font-size: 16px;
  flex-shrink: 0;
}
.rui-notification[data-unread="true"] .rui-notification-icon {
  background: color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-surface));
  color: var(--rui-color-primary);
}
.rui-notification[data-tone="success"] .rui-notification-icon { background: color-mix(in srgb, var(--rui-color-success) 18%, transparent); color: var(--rui-color-success); }
.rui-notification[data-tone="warning"] .rui-notification-icon { background: color-mix(in srgb, var(--rui-color-warning) 18%, transparent); color: var(--rui-color-warning); }
.rui-notification[data-tone="danger"]  .rui-notification-icon { background: color-mix(in srgb, var(--rui-color-danger)  18%, transparent); color: var(--rui-color-danger); }
.rui-notification[data-tone="info"]    .rui-notification-icon { background: color-mix(in srgb, var(--rui-color-info)    18%, transparent); color: var(--rui-color-info); }
.rui-notification-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}
.rui-notification-head {
  display: flex;
  justify-content: space-between;
  gap: var(--rui-spacing-s);
  align-items: baseline;
}
.rui-notification-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.rui-notification-unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--rui-color-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-primary) 25%, transparent);
  flex-shrink: 0;
}
.rui-notification[data-tone="success"] .rui-notification-unread-dot {
  background: var(--rui-color-success);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-success) 25%, transparent);
}
.rui-notification[data-tone="warning"] .rui-notification-unread-dot {
  background: var(--rui-color-warning);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-warning) 25%, transparent);
}
.rui-notification[data-tone="danger"] .rui-notification-unread-dot {
  background: var(--rui-color-danger);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-danger) 25%, transparent);
}
.rui-notification[data-tone="info"] .rui-notification-unread-dot {
  background: var(--rui-color-info);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-info) 25%, transparent);
}
.rui-notification-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-notification[data-unread="true"] .rui-notification-title {
  font-weight: 700;
}
.rui-notification-time {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  flex-shrink: 0;
}
.rui-notification[data-unread="true"] .rui-notification-time {
  color: var(--rui-color-primary);
  font-weight: 600;
}
.rui-notification[data-tone="success"][data-unread="true"] .rui-notification-time { color: var(--rui-color-success); }
.rui-notification[data-tone="warning"][data-unread="true"] .rui-notification-time { color: var(--rui-color-warning); }
.rui-notification[data-tone="danger"][data-unread="true"] .rui-notification-time { color: var(--rui-color-danger); }
.rui-notification[data-tone="info"][data-unread="true"] .rui-notification-time { color: var(--rui-color-info); }
.rui-notification-message {
  margin: 0;
  font-size: 13px;
  color: var(--rui-color-text-muted);
  line-height: 1.5;
}
.rui-notification-actions {
  display: flex;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
  margin-top: var(--rui-spacing-xs);
}

/* PersonChip */
.rui-person-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  border-radius: var(--rui-radius-md);
}
button.rui-person-chip {
  cursor: pointer;
  transition: background 140ms ease;
}
button.rui-person-chip:hover { background: color-mix(in srgb, var(--rui-color-primary) 8%, transparent); }
.rui-person-chip-avatar { position: relative; display: inline-flex; }
.rui-person-chip-status {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 2px solid var(--rui-color-surface);
}
.rui-person-chip-status[data-status="online"]  { background: var(--rui-color-success); }
.rui-person-chip-status[data-status="busy"]    { background: var(--rui-color-danger); }
.rui-person-chip-status[data-status="away"]    { background: var(--rui-color-warning); }
.rui-person-chip-status[data-status="offline"] { background: var(--rui-color-text-muted); }
.rui-person-chip-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.rui-person-chip-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--rui-color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rui-person-chip-role {
  font-size: 11.5px;
  color: var(--rui-color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rui-person-chip[data-size="sm"] .rui-person-chip-name { font-size: 12px; }
.rui-person-chip[data-size="sm"] .rui-person-chip-role { font-size: 11px; }
.rui-person-chip[data-size="lg"] .rui-person-chip-name { font-size: 14px; }
.rui-person-chip[data-size="lg"] .rui-person-chip-role { font-size: 12px; }

/* Quote */
.rui-quote {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  border-left: 3px solid color-mix(in srgb, var(--rui-color-primary) 60%, transparent);
  background: color-mix(in srgb, var(--rui-color-primary) 4%, var(--rui-color-surface));
  border-radius: 0 var(--rui-radius-md) var(--rui-radius-md) 0;
}
.rui-quote-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  font-style: italic;
  color: var(--rui-color-text);
}
.rui-quote-text::before { content: "“"; margin-right: 2px; opacity: 0.55; }
.rui-quote-text::after  { content: "”"; margin-left: 2px; opacity: 0.55; }
.rui-quote-cite {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  font-style: normal;
}
.rui-quote[data-tone="success"] { border-left-color: color-mix(in srgb, var(--rui-color-success) 60%, transparent); background: color-mix(in srgb, var(--rui-color-success) 4%, var(--rui-color-surface)); }
.rui-quote[data-tone="warning"] { border-left-color: color-mix(in srgb, var(--rui-color-warning) 60%, transparent); background: color-mix(in srgb, var(--rui-color-warning) 4%, var(--rui-color-surface)); }
.rui-quote[data-tone="danger"]  { border-left-color: color-mix(in srgb, var(--rui-color-danger)  60%, transparent); background: color-mix(in srgb, var(--rui-color-danger)  4%, var(--rui-color-surface)); }
.rui-quote[data-tone="info"]    { border-left-color: color-mix(in srgb, var(--rui-color-info)    60%, transparent); background: color-mix(in srgb, var(--rui-color-info)    4%, var(--rui-color-surface)); }

/* Note */
.rui-note {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-s);
  padding: 8px var(--rui-spacing-m);
  border-radius: var(--rui-radius-md);
  background: color-mix(in srgb, var(--rui-color-info) 10%, var(--rui-color-surface-muted));
  border: 1px solid color-mix(in srgb, var(--rui-color-info) 22%, transparent);
}
.rui-note-icon {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-info) 28%, transparent);
  color: var(--rui-color-info);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}
.rui-note-text { margin: 0; font-size: 13px; color: var(--rui-color-text); line-height: 1.5; }
.rui-note[data-tone="success"] { background: color-mix(in srgb, var(--rui-color-success) 10%, var(--rui-color-surface-muted)); border-color: color-mix(in srgb, var(--rui-color-success) 22%, transparent); }
.rui-note[data-tone="success"] .rui-note-icon { background: color-mix(in srgb, var(--rui-color-success) 28%, transparent); color: var(--rui-color-success); }
.rui-note[data-tone="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 10%, var(--rui-color-surface-muted)); border-color: color-mix(in srgb, var(--rui-color-warning) 22%, transparent); }
.rui-note[data-tone="warning"] .rui-note-icon { background: color-mix(in srgb, var(--rui-color-warning) 28%, transparent); color: var(--rui-color-warning); }
.rui-note[data-tone="danger"]  { background: color-mix(in srgb, var(--rui-color-danger)  10%, var(--rui-color-surface-muted)); border-color: color-mix(in srgb, var(--rui-color-danger)  22%, transparent); }
.rui-note[data-tone="danger"]  .rui-note-icon { background: color-mix(in srgb, var(--rui-color-danger)  28%, transparent); color: var(--rui-color-danger); }
.rui-note[data-tone="tip"]     { background: color-mix(in srgb, var(--rui-color-primary) 8%,  var(--rui-color-surface-muted)); border-color: color-mix(in srgb, var(--rui-color-primary) 22%, transparent); }
.rui-note[data-tone="tip"]     .rui-note-icon { background: color-mix(in srgb, var(--rui-color-primary) 28%, transparent); color: var(--rui-color-primary); }
.rui-note[data-tone="default"] { background: var(--rui-color-surface-muted); border-color: var(--rui-color-border); }
.rui-note[data-tone="default"] .rui-note-icon { background: color-mix(in srgb, var(--rui-color-text-muted) 22%, transparent); color: var(--rui-color-text-muted); }

/* Rating */
.rui-rating {
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
}
.rui-rating-stars { display: inline-flex !important; gap: 2px; }
.rui-rating-star {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: color-mix(in srgb, var(--rui-color-text-muted) 40%, transparent);
  cursor: default;
  /*
   * Intentionally NO font-family declaration. Font Awesome fa-solid /
   * fa-regular classes are co-applied to this element and they set the
   * glyph font at specificity 0,1,0. The theme stylesheet ships through
   * adoptedStyleSheets, which the CSSOM spec cascades AFTER declared
   * stylesheets, so any same-specificity font-family declared here would
   * win the tie-break and prevent the FA ::before glyph from rendering
   * (the "horizontal stripes instead of stars" regression).
   */
}
.rui-rating-star[data-fill="full"],
.rui-rating-star[data-fill="half"] { color: var(--rui-color-warning); }
.rui-rating[data-interactive="true"] .rui-rating-star { cursor: pointer; }
.rui-rating[data-size="sm"] .rui-rating-star { font-size: 13px; }
.rui-rating[data-size="lg"] .rui-rating-star { font-size: 20px; }
.rui-rating-label { font-size: 13px; color: var(--rui-color-text); font-weight: 600; }
.rui-rating-count { font-size: 12px; color: var(--rui-color-text-muted); }

/* ProgressRing */
.rui-progress-ring {
  display: inline-flex !important;
  flex-direction: column;
  align-items: center;
  gap: var(--rui-spacing-xs);
}
.rui-progress-ring-wrap {
  position: relative;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
}
.rui-progress-ring-svg { transform: rotate(-90deg); }
.rui-progress-ring-track { stroke: var(--rui-color-border); }
.rui-progress-ring-bar { stroke: var(--rui-color-primary); transition: stroke-dashoffset 360ms ease; }
.rui-progress-ring[data-tone="success"] .rui-progress-ring-bar { stroke: var(--rui-color-success); }
.rui-progress-ring[data-tone="warning"] .rui-progress-ring-bar { stroke: var(--rui-color-warning); }
.rui-progress-ring[data-tone="danger"]  .rui-progress-ring-bar { stroke: var(--rui-color-danger); }
.rui-progress-ring[data-tone="info"]    .rui-progress-ring-bar { stroke: var(--rui-color-info); }
.rui-progress-ring-value {
  position: absolute;
  font-size: 16px;
  font-weight: 700;
  color: var(--rui-color-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.rui-progress-ring[data-size="sm"] .rui-progress-ring-value { font-size: 13px; }
.rui-progress-ring[data-size="lg"] .rui-progress-ring-value { font-size: 20px; }
.rui-progress-ring-icon { font-size: 1.6em; }
.rui-progress-ring[data-tone="primary"] .rui-progress-ring-icon { color: var(--rui-color-primary); }
.rui-progress-ring[data-tone="success"] .rui-progress-ring-icon { color: var(--rui-color-success); }
.rui-progress-ring[data-tone="warning"] .rui-progress-ring-icon { color: var(--rui-color-warning); }
.rui-progress-ring[data-tone="danger"]  .rui-progress-ring-icon { color: var(--rui-color-danger); }
.rui-progress-ring[data-tone="info"]    .rui-progress-ring-icon { color: var(--rui-color-info); }
.rui-progress-ring-caption {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
}
.rui-progress-ring[data-indeterminate="true"] .rui-progress-ring-bar {
  animation: rui-progress-ring-spin 1400ms linear infinite;
  transform-origin: center;
}
@keyframes rui-progress-ring-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.rui-progress-ring[data-indeterminate="true"] .rui-progress-ring-svg {
  animation: rui-progress-ring-rotate 1600ms linear infinite;
}
@keyframes rui-progress-ring-rotate {
  from { transform: rotate(-90deg); }
  to   { transform: rotate(270deg); }
}

/* ChatBubble */
.rui-chat-bubble {
  display: flex;
  align-items: flex-end;
  gap: var(--rui-spacing-s);
  max-width: 100%;
}
.rui-chat-bubble[data-from="me"] { justify-content: flex-end; }
.rui-chat-bubble-avatar {
  display: inline-flex !important;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-primary) 14%, var(--rui-color-surface-muted));
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.rui-chat-bubble-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rui-chat-bubble-fallback { font-size: 11px; font-weight: 700; color: var(--rui-color-primary); }
.rui-chat-bubble-bubble {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px var(--rui-spacing-m);
  border-radius: 16px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  max-width: min(72ch, 100%);
}
.rui-chat-bubble[data-from="me"] .rui-chat-bubble-bubble {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-primary) 24%, var(--rui-color-border));
  color: var(--rui-color-text);
}
.rui-chat-bubble[data-from="system"] .rui-chat-bubble-bubble {
  background: var(--rui-color-surface-muted);
  font-style: italic;
}
.rui-chat-bubble-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.rui-chat-bubble-author {
  font-size: 12px;
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-chat-bubble-time {
  font-size: 11px;
  color: var(--rui-color-text-muted);
}
.rui-chat-bubble-body {
  margin: 0;
  font-size: 13.5px;
  color: var(--rui-color-text);
  line-height: 1.5;
  white-space: pre-wrap;
}
.rui-chat-bubble-status {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
  align-self: flex-end;
}
.rui-chat-bubble-status[data-status="error"] { color: var(--rui-color-danger); }
.rui-chat-bubble-status[data-status="read"]  { color: var(--rui-color-success); }

/* SearchBar */
.rui-search-bar {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  padding: 6px 10px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  transition: border-color 140ms ease, box-shadow 140ms ease;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.rui-search-bar:focus-within {
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
}
.rui-search-bar-icon {
  display: inline-flex;
  font-size: 14px;
  color: var(--rui-color-text-muted);
  flex-shrink: 0;
}
.rui-search-bar-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13.5px;
  padding: 4px 0;
}
.rui-search-bar-input::placeholder { color: var(--rui-color-text-muted); }
.rui-search-bar-input::-webkit-search-cancel-button { -webkit-appearance: none; }
.rui-search-bar-shortcut {
  display: inline-flex;
  align-items: center;
  font-family: var(--rui-font-family);
  font-size: 11px;
  color: var(--rui-color-text-muted);
  padding: 2px 6px;
  border: 1px solid var(--rui-color-border);
  border-radius: 6px;
  background: var(--rui-color-surface-muted);
  flex-shrink: 0;
}
.rui-search-bar-submit {
  border: none;
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--rui-radius-sm);
  cursor: pointer;
  flex-shrink: 0;
}
.rui-search-bar-submit:hover { background: var(--rui-color-primary-hover); }

/* ========================================================================
   Responsive — phones & small tablets.
   The library targets phone-first layouts: stacks, table wrappers, and form
   action rows are most likely to overflow, so we relax their sizing here.
   ======================================================================== */

@media (max-width: 720px) {
  :host {
    font-size: 14px;
    --rui-spacing-l: 16px;
    --rui-spacing-xl: 24px;
  }
  .rui-card { padding: var(--rui-spacing-m); }
  .rui-stat-card { padding: var(--rui-spacing-m); min-width: 120px; }
  .rui-stat-value { font-size: 20px; }
  .rui-text[data-variant="title"] { font-size: 24px; }
  .rui-text[data-variant="large-heavy"] { font-size: 18px; }
  .rui-header-title { font-size: 20px; }
  .rui-callout, .rui-alert { padding: var(--rui-spacing-s) var(--rui-spacing-m); }
  .rui-modal { padding: var(--rui-spacing-m); border-radius: var(--rui-radius-md); }
  .rui-modal-overlay { padding: var(--rui-spacing-s); }
  .rui-form-actions { justify-content: stretch; }
  .rui-form-actions .rui-button,
  .rui-form-actions .rui-buttons { flex: 1 1 auto; }
  .rui-buttons[data-direction="row"] .rui-button { flex: 1 1 auto; }
  /* Row stacks collapse to columns on phones unless the author opted into
     wrapping (a horizontal scroll list, etc.) — wrap=true keeps the row
     layout because the user explicitly asked for it. */
  .rui-stack[data-direction="row"]:not([data-wrap="true"]),
  .rui-stack[data-direction="row-reverse"]:not([data-wrap="true"]) {
    flex-direction: column;
    align-items: stretch;
  }
  /* Hero collapses to a single column so the title stays readable. */
  .rui-hero[data-has-image="true"] { grid-template-columns: 1fr; }
  .rui-hero-media { justify-content: center; }
  .rui-page-header-title-row { flex-direction: column; }
  .rui-page-header-actions { width: 100%; }
  .rui-sheet { width: 100vw; }
  /* App shell + split view collapse to single column on phones. */
  .rui-app-shell { flex-direction: column; }
  .rui-sidebar { width: 100%; }
  .rui-split-view { grid-template-columns: 1fr; }
  .rui-description-list[data-columns="2"] { grid-template-columns: 1fr; }
  .rui-toolbar { padding: var(--rui-spacing-s); }
  .rui-toolbar .rui-input,
  .rui-toolbar .rui-select { min-width: 0; flex: 1 1 100%; }
  .rui-section-header { flex-direction: column; }
  .rui-section-header-actions { width: 100%; }
  /* Richer composition primitives shrink/wrap on phones. */
  .rui-cover { padding: var(--rui-spacing-l); border-radius: var(--rui-radius-md); }
  .rui-media-card[data-orientation="horizontal"] {
    flex-direction: column;
  }
  .rui-media-card[data-orientation="horizontal"] .rui-media-card-media {
    width: 100%;
    max-width: 100%;
  }
  .rui-stats { gap: var(--rui-spacing-m); }
  .rui-stats-item { padding: 0; border-left: none; padding-bottom: var(--rui-spacing-s); }
  .rui-notification { padding: var(--rui-spacing-s) var(--rui-spacing-m); }
  .rui-notification-head { flex-direction: column; align-items: flex-start; gap: 2px; }
  .rui-search-bar-shortcut { display: none; }
  .rui-chat-bubble-bubble { max-width: 86%; }
}

@media (max-width: 480px) {
  :host { font-size: 13.5px; }
  .rui-card { padding: var(--rui-spacing-m); }
  .rui-card-footer { justify-content: stretch; }
  .rui-card-footer .rui-button { flex: 1 1 auto; }
  .rui-tab-trigger { padding: var(--rui-spacing-xs) var(--rui-spacing-s); font-size: 13px; }
  .rui-stat-card { width: 100%; }
}

/* ========================================================================
   Theme-specific overrides.
   The host carries data-rui-theme so themes can change layout, fonts,
   shadows, and animations on top of their token map.
   ======================================================================== */

/* Neon — subtle scanlines on cards, glowing focus rings, animated primary
   buttons, sharper typography. */
:host([data-rui-theme="neon"]) {
  letter-spacing: 0.01em;
  background:
    radial-gradient(60vw 60vw at 110% -10%, rgba(236, 72, 153, 0.18), transparent 60%),
    radial-gradient(50vw 50vw at -10% 110%, rgba(34, 211, 238, 0.18), transparent 60%),
    var(--rui-color-bg);
}
:host([data-rui-theme="neon"][transparent]),
:host([data-rui-theme="neon"][transparent="true"]) {
  background: transparent;
}
:host([data-rui-theme="neon"]) .rui-card,
:host([data-rui-theme="neon"]) .rui-stat-card,
:host([data-rui-theme="neon"]) .rui-callout,
:host([data-rui-theme="neon"]) .rui-chart {
  background:
    linear-gradient(180deg, rgba(236, 72, 153, 0.04), rgba(34, 211, 238, 0.04)),
    var(--rui-color-surface);
  border-color: rgba(236, 72, 153, 0.35);
  box-shadow: var(--rui-shadow-sm);
  position: relative;
}
:host([data-rui-theme="neon"]) .rui-card::before,
:host([data-rui-theme="neon"]) .rui-stat-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(transparent 96%, rgba(236, 72, 153, 0.08) 96%);
  background-size: 100% 4px;
  opacity: 0.45;
}
:host([data-rui-theme="neon"]) .rui-card-title,
:host([data-rui-theme="neon"]) .rui-section-title,
:host([data-rui-theme="neon"]) .rui-header-title,
:host([data-rui-theme="neon"]) .rui-text[data-variant="title"],
:host([data-rui-theme="neon"]) .rui-text[data-variant="heading"],
:host([data-rui-theme="neon"]) .rui-text[data-variant="large-heavy"] {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
:host([data-rui-theme="neon"]) .rui-button {
  background: linear-gradient(135deg, #ec4899, #22d3ee);
  color: #05060f;
  border: 1px solid rgba(236, 72, 153, 0.6);
  box-shadow: 0 0 18px rgba(236, 72, 153, 0.45);
}
:host([data-rui-theme="neon"]) .rui-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #f472b6, #67e8f9);
  box-shadow: 0 0 24px rgba(34, 211, 238, 0.55);
  transform: translateY(-1px);
}
:host([data-rui-theme="neon"]) .rui-button[data-variant="secondary"] {
  background: rgba(236, 72, 153, 0.08);
  color: var(--rui-color-text);
  border-color: rgba(236, 72, 153, 0.45);
  box-shadow: none;
}
:host([data-rui-theme="neon"]) .rui-button[data-variant="ghost"] {
  background: transparent;
  border-color: rgba(34, 211, 238, 0.4);
  color: var(--rui-color-text);
  box-shadow: none;
}
:host([data-rui-theme="neon"]) .rui-input:focus,
:host([data-rui-theme="neon"]) .rui-textarea:focus,
:host([data-rui-theme="neon"]) .rui-select:focus {
  box-shadow: 0 0 0 1px var(--rui-color-primary), 0 0 18px rgba(236, 72, 153, 0.45);
}
:host([data-rui-theme="neon"]) .rui-tab-trigger[aria-selected="true"] {
  text-shadow: 0 0 12px rgba(236, 72, 153, 0.55);
}
:host([data-rui-theme="neon"]) .rui-table th {
  background: rgba(236, 72, 153, 0.08);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 12px;
}
:host([data-rui-theme="neon"]) .rui-follow-up-button {
  background: rgba(34, 211, 238, 0.06);
  border-color: rgba(34, 211, 238, 0.4);
}
:host([data-rui-theme="neon"]) .rui-follow-up-button:hover {
  background: rgba(236, 72, 153, 0.15);
  border-color: rgba(236, 72, 153, 0.65);
  box-shadow: 0 0 18px rgba(236, 72, 153, 0.35);
}

/* Pastel — friendly, super-rounded everything, soft drop-shadows, cards
   subtly lift on hover, gentle pop animation when buttons are pressed. */
:host([data-rui-theme="pastel"]) {
  background:
    radial-gradient(80vw 60vw at 100% 0%, rgba(167, 139, 250, 0.18), transparent 60%),
    radial-gradient(70vw 50vw at 0% 100%, rgba(94, 234, 212, 0.18), transparent 60%),
    var(--rui-color-bg);
}
:host([data-rui-theme="pastel"][transparent]),
:host([data-rui-theme="pastel"][transparent="true"]) {
  background: transparent;
}
:host([data-rui-theme="pastel"]) .rui-card,
:host([data-rui-theme="pastel"]) .rui-stat-card,
:host([data-rui-theme="pastel"]) .rui-chart,
:host([data-rui-theme="pastel"]) .rui-callout {
  border-color: var(--rui-color-border);
  transition: transform 220ms ease, box-shadow 220ms ease;
}
:host([data-rui-theme="pastel"]) .rui-card:hover,
:host([data-rui-theme="pastel"]) .rui-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--rui-shadow-md);
}
:host([data-rui-theme="pastel"]) .rui-card-title,
:host([data-rui-theme="pastel"]) .rui-section-title,
:host([data-rui-theme="pastel"]) .rui-header-title,
:host([data-rui-theme="pastel"]) .rui-text[data-variant="title"],
:host([data-rui-theme="pastel"]) .rui-text[data-variant="heading"] {
  font-weight: 700;
  background: linear-gradient(135deg, #8b5cf6, #f9a8d4);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
:host([data-rui-theme="pastel"]) .rui-button {
  background: linear-gradient(135deg, #a78bfa, #f9a8d4);
  border-radius: 999px;
  padding: 10px 18px;
  box-shadow: 0 6px 16px rgba(167, 139, 250, 0.28);
}
:host([data-rui-theme="pastel"]) .rui-button:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 10px 22px rgba(167, 139, 250, 0.36);
}
:host([data-rui-theme="pastel"]) .rui-button:active:not(:disabled) {
  transform: scale(0.98);
}
:host([data-rui-theme="pastel"]) .rui-button[data-variant="secondary"] {
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  box-shadow: 0 2px 8px rgba(167, 139, 250, 0.12);
}
:host([data-rui-theme="pastel"]) .rui-button[data-variant="ghost"] {
  background: transparent;
  border-color: var(--rui-color-border);
  color: var(--rui-color-text);
  box-shadow: none;
}
:host([data-rui-theme="pastel"]) .rui-input,
:host([data-rui-theme="pastel"]) .rui-select,
:host([data-rui-theme="pastel"]) .rui-textarea {
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
}
:host([data-rui-theme="pastel"]) .rui-tab-list { border-bottom-color: var(--rui-color-border); }
:host([data-rui-theme="pastel"]) .rui-tab-trigger[aria-selected="true"] {
  background: rgba(167, 139, 250, 0.10);
  border-radius: var(--rui-radius-md) var(--rui-radius-md) 0 0;
}
:host([data-rui-theme="pastel"]) .rui-badge[data-variant="primary"] {
  background: linear-gradient(135deg, #a78bfa, #f9a8d4);
}
:host([data-rui-theme="pastel"]) .rui-follow-up-button {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.10), rgba(249, 168, 212, 0.10));
  border-color: var(--rui-color-border);
}
:host([data-rui-theme="pastel"]) .rui-follow-up-button:hover {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.22), rgba(249, 168, 212, 0.22));
  transform: translateY(-1px);
}

/* Glass — frosted translucent surfaces over a vivid gradient backdrop.
   Cards use real backdrop-filter blur so they pick up whatever sits behind
   the host. Buttons get a soft inner highlight. */
:host([data-rui-theme="glass"]) {
  background:
    radial-gradient(60vw 60vw at 0% 0%, rgba(96, 165, 250, 0.45), transparent 60%),
    radial-gradient(50vw 50vw at 100% 0%, rgba(167, 139, 250, 0.40), transparent 55%),
    radial-gradient(70vw 60vw at 50% 110%, rgba(34, 211, 238, 0.30), transparent 60%),
    linear-gradient(135deg, #0b132b 0%, #1a2454 60%, #1f3a8a 100%);
  background-attachment: local;
}
:host([data-rui-theme="glass"][transparent]),
:host([data-rui-theme="glass"][transparent="true"]) {
  background: transparent;
}
:host([data-rui-theme="glass"]) .rui-card,
:host([data-rui-theme="glass"]) .rui-stat-card,
:host([data-rui-theme="glass"]) .rui-callout,
:host([data-rui-theme="glass"]) .rui-chart,
:host([data-rui-theme="glass"]) .rui-table-wrapper,
:host([data-rui-theme="glass"]) .rui-accordion-item,
:host([data-rui-theme="glass"]) .rui-list-item,
:host([data-rui-theme="glass"]) .rui-modal,
:host([data-rui-theme="glass"]) .rui-code-block {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow:
    0 18px 50px rgba(7, 14, 33, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.10);
}
:host([data-rui-theme="glass"]) .rui-input,
:host([data-rui-theme="glass"]) .rui-select,
:host([data-rui-theme="glass"]) .rui-textarea {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
  color: var(--rui-color-text);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
:host([data-rui-theme="glass"]) .rui-input::placeholder,
:host([data-rui-theme="glass"]) .rui-textarea::placeholder { color: rgba(241, 245, 255, 0.45); }
:host([data-rui-theme="glass"]) .rui-input:focus,
:host([data-rui-theme="glass"]) .rui-select:focus,
:host([data-rui-theme="glass"]) .rui-textarea:focus {
  border-color: rgba(96, 165, 250, 0.85);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.20);
  background: rgba(255, 255, 255, 0.14);
}
:host([data-rui-theme="glass"]) .rui-button {
  background: linear-gradient(135deg, #60a5fa, #22d3ee);
  color: #0b132b;
  border: 1px solid rgba(255, 255, 255, 0.30);
  box-shadow: 0 10px 24px rgba(34, 211, 238, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.40);
}
:host([data-rui-theme="glass"]) .rui-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(34, 211, 238, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.50);
}
:host([data-rui-theme="glass"]) .rui-button[data-variant="secondary"] {
  background: rgba(255, 255, 255, 0.10);
  color: var(--rui-color-text);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10);
}
:host([data-rui-theme="glass"]) .rui-button[data-variant="ghost"] {
  background: transparent;
  color: var(--rui-color-text);
  border-color: rgba(255, 255, 255, 0.20);
  box-shadow: none;
}
:host([data-rui-theme="glass"]) .rui-card-title,
:host([data-rui-theme="glass"]) .rui-section-title,
:host([data-rui-theme="glass"]) .rui-header-title,
:host([data-rui-theme="glass"]) .rui-text[data-variant="title"],
:host([data-rui-theme="glass"]) .rui-text[data-variant="heading"] {
  background: linear-gradient(135deg, #ffffff, #c7d2fe 60%, #a5f3fc);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.01em;
}
:host([data-rui-theme="glass"]) .rui-tab-list { border-bottom-color: rgba(255, 255, 255, 0.15); }
:host([data-rui-theme="glass"]) .rui-tab-trigger { color: rgba(241, 245, 255, 0.65); }
:host([data-rui-theme="glass"]) .rui-tab-trigger:hover { color: #ffffff; }
:host([data-rui-theme="glass"]) .rui-tab-trigger[aria-selected="true"] {
  color: #ffffff;
  border-bottom-color: #60a5fa;
}
:host([data-rui-theme="glass"]) .rui-table th {
  background: rgba(255, 255, 255, 0.08);
  border-bottom-color: rgba(255, 255, 255, 0.15);
}
:host([data-rui-theme="glass"]) .rui-table td { border-bottom-color: rgba(255, 255, 255, 0.10); }
:host([data-rui-theme="glass"]) .rui-follow-up-button {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.20);
  color: var(--rui-color-text);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
:host([data-rui-theme="glass"]) .rui-follow-up-button:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(96, 165, 250, 0.55);
  box-shadow: 0 6px 18px rgba(34, 211, 238, 0.20);
}
:host([data-rui-theme="glass"]) .rui-skeleton-line {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.20) 50%, rgba(255, 255, 255, 0.08) 100%);
  background-size: 200% 100%;
}
:host([data-rui-theme="glass"]) .rui-divider { background: rgba(255, 255, 255, 0.15); }
:host([data-rui-theme="glass"]) .rui-separator { background: rgba(255, 255, 255, 0.15); }

/* Brutalist — chunky borders, hard offset shadows, no gradients, all-caps
   display type. The aesthetic only works with sharp geometry, so we override
   the radii on every container in case the user passes a custom token map. */
:host([data-rui-theme="brutalist"]) {
  background:
    repeating-linear-gradient(
      45deg,
      transparent 0,
      transparent 22px,
      rgba(10, 10, 10, 0.04) 22px,
      rgba(10, 10, 10, 0.04) 24px
    ),
    var(--rui-color-bg);
  font-weight: 500;
}
:host([data-rui-theme="brutalist"][transparent]),
:host([data-rui-theme="brutalist"][transparent="true"]) {
  background: transparent;
}
:host([data-rui-theme="brutalist"]) .rui-card,
:host([data-rui-theme="brutalist"]) .rui-stat-card,
:host([data-rui-theme="brutalist"]) .rui-chart,
:host([data-rui-theme="brutalist"]) .rui-callout,
:host([data-rui-theme="brutalist"]) .rui-table-wrapper,
:host([data-rui-theme="brutalist"]) .rui-accordion-item,
:host([data-rui-theme="brutalist"]) .rui-list-item,
:host([data-rui-theme="brutalist"]) .rui-modal,
:host([data-rui-theme="brutalist"]) .rui-code-block {
  border: 2px solid #0a0a0a;
  border-radius: 0;
  box-shadow: 6px 6px 0 0 #0a0a0a;
  background: var(--rui-color-surface);
}
:host([data-rui-theme="brutalist"]) .rui-card[data-variant="elevated"] { box-shadow: 8px 8px 0 0 #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-card[data-variant="outlined"] { box-shadow: 3px 3px 0 0 #0a0a0a; }

:host([data-rui-theme="brutalist"]) .rui-card-title,
:host([data-rui-theme="brutalist"]) .rui-section-title,
:host([data-rui-theme="brutalist"]) .rui-header-title,
:host([data-rui-theme="brutalist"]) .rui-text[data-variant="title"],
:host([data-rui-theme="brutalist"]) .rui-text[data-variant="heading"],
:host([data-rui-theme="brutalist"]) .rui-text[data-variant="large-heavy"] {
  text-transform: uppercase;
  letter-spacing: -0.01em;
  font-weight: 800;
}

:host([data-rui-theme="brutalist"]) .rui-button {
  border: 2px solid #0a0a0a;
  border-radius: 0;
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  box-shadow: 4px 4px 0 0 #0a0a0a;
  transition: transform 80ms ease, box-shadow 80ms ease;
}
:host([data-rui-theme="brutalist"]) .rui-button:hover:not(:disabled) {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0 0 #0a0a0a;
  background: var(--rui-color-primary);
}
:host([data-rui-theme="brutalist"]) .rui-button:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 0 #0a0a0a;
}
:host([data-rui-theme="brutalist"]) .rui-button[data-variant="secondary"] {
  background: #ffffff;
  color: #0a0a0a;
}
:host([data-rui-theme="brutalist"]) .rui-button[data-variant="ghost"] {
  background: var(--rui-color-bg);
  color: #0a0a0a;
  box-shadow: 3px 3px 0 0 #0a0a0a;
}
:host([data-rui-theme="brutalist"]) .rui-button[data-variant="danger"] {
  background: var(--rui-color-danger);
  color: #ffffff;
}

:host([data-rui-theme="brutalist"]) .rui-input,
:host([data-rui-theme="brutalist"]) .rui-select,
:host([data-rui-theme="brutalist"]) .rui-textarea {
  border: 2px solid #0a0a0a;
  border-radius: 0;
  background: #ffffff;
  font-weight: 500;
  box-shadow: 3px 3px 0 0 #0a0a0a;
}
:host([data-rui-theme="brutalist"]) .rui-input:focus,
:host([data-rui-theme="brutalist"]) .rui-select:focus,
:host([data-rui-theme="brutalist"]) .rui-textarea:focus {
  border-color: var(--rui-color-primary);
  box-shadow: 3px 3px 0 0 var(--rui-color-primary);
  outline: none;
}

:host([data-rui-theme="brutalist"]) .rui-tag,
:host([data-rui-theme="brutalist"]) .rui-badge {
  border: 2px solid #0a0a0a;
  border-radius: 0;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--rui-color-warning);
  color: #0a0a0a;
}
:host([data-rui-theme="brutalist"]) .rui-badge[data-variant="primary"] {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
}
:host([data-rui-theme="brutalist"]) .rui-badge[data-variant="success"] { background: var(--rui-color-success); color: #ffffff; }
:host([data-rui-theme="brutalist"]) .rui-badge[data-variant="warning"] { background: var(--rui-color-warning); color: #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-badge[data-variant="danger"] { background: var(--rui-color-danger); color: #ffffff; }

:host([data-rui-theme="brutalist"]) .rui-tab-list { border-bottom: 2px solid #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-tab-trigger {
  border: 2px solid transparent;
  border-bottom: none;
  margin-bottom: -2px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.04em;
}
:host([data-rui-theme="brutalist"]) .rui-tab-trigger[aria-selected="true"] {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  border-color: #0a0a0a;
  border-bottom-color: var(--rui-color-primary);
}

:host([data-rui-theme="brutalist"]) .rui-table th {
  background: #0a0a0a;
  color: #fef9c3;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 800;
  border-bottom: 2px solid #0a0a0a;
}
:host([data-rui-theme="brutalist"]) .rui-table td { border-bottom: 1px solid #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-table-caption {
  background: var(--rui-color-warning);
  color: #0a0a0a;
  font-weight: 800;
  text-transform: uppercase;
  border-bottom: 2px solid #0a0a0a;
}

:host([data-rui-theme="brutalist"]) .rui-follow-up-button {
  border: 2px solid #0a0a0a;
  border-radius: 0;
  background: var(--rui-color-warning);
  color: #0a0a0a;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  box-shadow: 3px 3px 0 0 #0a0a0a;
}
:host([data-rui-theme="brutalist"]) .rui-follow-up-button:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 0 #0a0a0a;
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
}

:host([data-rui-theme="brutalist"]) .rui-divider,
:host([data-rui-theme="brutalist"]) .rui-separator { background: #0a0a0a; height: 2px; }
:host([data-rui-theme="brutalist"]) .rui-separator[data-orientation="vertical"] { width: 2px; height: auto; }

:host([data-rui-theme="brutalist"]) .rui-callout[data-variant="info"] { background: #bfdbfe; color: #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-callout[data-variant="success"] { background: #bbf7d0; color: #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-callout[data-variant="warning"] { background: var(--rui-color-warning); color: #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-callout[data-variant="danger"],
:host([data-rui-theme="brutalist"]) .rui-callout[data-variant="error"] { background: #fecaca; color: #0a0a0a; }
:host([data-rui-theme="brutalist"]) .rui-callout-icon {
  border: 2px solid #0a0a0a;
  border-radius: 0;
  width: 26px;
  height: 26px;
}

:host([data-rui-theme="brutalist"]) .rui-stat-value { font-weight: 900; }
:host([data-rui-theme="brutalist"]) .rui-stat-label { font-weight: 800; color: #0a0a0a; }

:host([data-rui-theme="brutalist"]) .rui-steps-item::before {
  border-radius: 0;
  border: 2px solid #0a0a0a;
  background: var(--rui-color-warning);
  color: #0a0a0a;
  font-weight: 900;
}

:host([data-rui-theme="brutalist"]) .rui-link {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  font-weight: 700;
}

/* Skyline — enterprise cloud-console look. Calm navy + cyan, crisp 1px
   borders, small radii, accent strip on primary cards, animated underline
   on tabs. Designed to look at home in an admin dashboard. */
:host([data-rui-theme="skyline"]) {
  background:
    linear-gradient(180deg, #eff2f7 0%, #e6ecf3 100%);
  font-feature-settings: "ss01", "cv11";
}
:host([data-rui-theme="skyline"][transparent]),
:host([data-rui-theme="skyline"][transparent="true"]) {
  background: transparent;
}
:host([data-rui-theme="skyline"]) .rui-card,
:host([data-rui-theme="skyline"]) .rui-stat-card,
:host([data-rui-theme="skyline"]) .rui-callout,
:host([data-rui-theme="skyline"]) .rui-chart,
:host([data-rui-theme="skyline"]) .rui-table-wrapper,
:host([data-rui-theme="skyline"]) .rui-accordion-item,
:host([data-rui-theme="skyline"]) .rui-list-item,
:host([data-rui-theme="skyline"]) .rui-modal,
:host([data-rui-theme="skyline"]) .rui-code-block {
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface);
  box-shadow: var(--rui-shadow-sm);
  transition: border-color 160ms ease, box-shadow 200ms ease, transform 160ms ease;
}
:host([data-rui-theme="skyline"]) .rui-card:hover {
  border-color: color-mix(in srgb, var(--rui-color-primary) 28%, var(--rui-color-border));
  box-shadow: var(--rui-shadow-md);
}
:host([data-rui-theme="skyline"]) .rui-card[data-variant="elevated"] {
  position: relative;
  overflow: hidden;
}
:host([data-rui-theme="skyline"]) .rui-card[data-variant="elevated"]::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--rui-color-primary), var(--rui-color-info));
}
:host([data-rui-theme="skyline"]) .rui-card-title,
:host([data-rui-theme="skyline"]) .rui-section-title,
:host([data-rui-theme="skyline"]) .rui-header-title,
:host([data-rui-theme="skyline"]) .rui-text[data-variant="title"],
:host([data-rui-theme="skyline"]) .rui-text[data-variant="heading"],
:host([data-rui-theme="skyline"]) .rui-text[data-variant="large-heavy"] {
  color: var(--rui-color-primary);
  letter-spacing: -0.01em;
  font-weight: 600;
}
:host([data-rui-theme="skyline"]) .rui-button {
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-primary);
  font-weight: 500;
  letter-spacing: 0.01em;
  box-shadow: 0 1px 0 rgba(13, 27, 58, 0.06);
  transition: background 140ms ease, transform 80ms ease, box-shadow 160ms ease;
}
:host([data-rui-theme="skyline"]) .rui-button:hover:not(:disabled) {
  background: var(--rui-color-primary-hover);
  box-shadow: 0 4px 10px rgba(0, 53, 128, 0.18);
}
:host([data-rui-theme="skyline"]) .rui-button:active:not(:disabled) {
  transform: translateY(1px);
}
:host([data-rui-theme="skyline"]) .rui-button[data-variant="secondary"] {
  background: var(--rui-color-surface);
  color: var(--rui-color-primary);
  border: 1px solid var(--rui-color-primary);
  box-shadow: none;
}
:host([data-rui-theme="skyline"]) .rui-button[data-variant="secondary"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--rui-color-primary) 6%, var(--rui-color-surface));
}
:host([data-rui-theme="skyline"]) .rui-button[data-variant="ghost"] {
  background: transparent;
  color: var(--rui-color-primary);
  border-color: transparent;
  box-shadow: none;
}
:host([data-rui-theme="skyline"]) .rui-button[data-variant="ghost"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--rui-color-primary) 8%, transparent);
}
:host([data-rui-theme="skyline"]) .rui-input,
:host([data-rui-theme="skyline"]) .rui-select,
:host([data-rui-theme="skyline"]) .rui-textarea {
  background: var(--rui-color-surface);
  border-color: var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
  transition: border-color 140ms ease, box-shadow 160ms ease;
}
:host([data-rui-theme="skyline"]) .rui-input:focus,
:host([data-rui-theme="skyline"]) .rui-select:focus,
:host([data-rui-theme="skyline"]) .rui-textarea:focus {
  border-color: var(--rui-color-info);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-info) 22%, transparent);
}
:host([data-rui-theme="skyline"]) .rui-tab-list {
  border-bottom-color: var(--rui-color-border);
}
:host([data-rui-theme="skyline"]) .rui-tab-trigger {
  font-weight: 500;
  color: var(--rui-color-text-muted);
  border-bottom-width: 2px;
}
:host([data-rui-theme="skyline"]) .rui-tab-trigger:hover {
  color: var(--rui-color-primary);
}
:host([data-rui-theme="skyline"]) .rui-tab-trigger[aria-selected="true"] {
  color: var(--rui-color-info);
  border-bottom-color: var(--rui-color-info);
}
:host([data-rui-theme="skyline"]) .rui-table th {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom-color: var(--rui-color-border);
}
:host([data-rui-theme="skyline"]) .rui-table td {
  border-bottom-color: var(--rui-color-border-subtle);
}
:host([data-rui-theme="skyline"]) .rui-table tbody tr:hover td {
  background: color-mix(in srgb, var(--rui-color-info) 5%, transparent);
}
:host([data-rui-theme="skyline"]) .rui-tag,
:host([data-rui-theme="skyline"]) .rui-badge {
  border-radius: 999px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
:host([data-rui-theme="skyline"]) .rui-tag::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  display: inline-block;
}
:host([data-rui-theme="skyline"]) .rui-badge[data-variant="primary"] {
  background: color-mix(in srgb, var(--rui-color-info) 14%, transparent);
  color: var(--rui-color-info);
}
:host([data-rui-theme="skyline"]) .rui-stat-value {
  color: var(--rui-color-primary);
  font-weight: 700;
  letter-spacing: -0.02em;
}
:host([data-rui-theme="skyline"]) .rui-stat-label {
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
}
:host([data-rui-theme="skyline"]) .rui-callout[data-variant="info"] .rui-callout-icon,
:host([data-rui-theme="skyline"]) .rui-callout[data-variant="success"] .rui-callout-icon,
:host([data-rui-theme="skyline"]) .rui-callout[data-variant="warning"] .rui-callout-icon,
:host([data-rui-theme="skyline"]) .rui-callout[data-variant="danger"] .rui-callout-icon,
:host([data-rui-theme="skyline"]) .rui-callout[data-variant="error"] .rui-callout-icon {
  border-radius: 999px;
  width: 20px;
  height: 20px;
}
:host([data-rui-theme="skyline"]) .rui-link {
  color: var(--rui-color-info);
  font-weight: 500;
}
:host([data-rui-theme="skyline"]) .rui-follow-up-button {
  background: var(--rui-color-surface);
  border-color: var(--rui-color-border);
  color: var(--rui-color-primary);
  font-weight: 500;
  border-radius: var(--rui-radius-sm);
  transition: background 140ms ease, border-color 140ms ease;
}
:host([data-rui-theme="skyline"]) .rui-follow-up-button:hover {
  background: color-mix(in srgb, var(--rui-color-info) 8%, var(--rui-color-surface));
  border-color: var(--rui-color-info);
  color: var(--rui-color-info);
}
:host([data-rui-theme="skyline"]) .rui-steps-item::before {
  background: var(--rui-color-surface);
  color: var(--rui-color-primary);
  border: 1px solid var(--rui-color-primary);
  font-weight: 600;
}
:host([data-rui-theme="skyline"]) .rui-divider,
:host([data-rui-theme="skyline"]) .rui-separator {
  background: var(--rui-color-border);
}

/* ----------------------------------------------------------------------- */
/* DropdownMenu / MenuItem / MenuSeparator / MenuLabel                     */
/* ----------------------------------------------------------------------- */
.rui-dropdown-menu {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}
.rui-dropdown-menu-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  border-radius: var(--rui-radius-sm);
}
.rui-dropdown-menu-trigger:focus-visible,
.rui-dropdown-menu-trigger:focus-within {
  outline: 2px solid color-mix(in srgb, var(--rui-color-primary) 60%, transparent);
  outline-offset: 2px;
}
.rui-dropdown-menu-trigger[data-state="open"] { z-index: 41; }
.rui-dropdown-menu-content {
  position: absolute;
  z-index: 40;
  min-width: 200px;
  padding: 6px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  display: none;
  flex-direction: column;
  gap: 2px;
}
.rui-dropdown-menu[data-open="true"] > .rui-dropdown-menu-content { display: flex; }
.rui-dropdown-menu[data-side="bottom"] > .rui-dropdown-menu-content {
  top: calc(100% + 6px);
}
.rui-dropdown-menu[data-side="top"] > .rui-dropdown-menu-content {
  bottom: calc(100% + 6px);
}
.rui-dropdown-menu[data-side="right"] > .rui-dropdown-menu-content {
  left: calc(100% + 6px);
  top: 0;
}
.rui-dropdown-menu[data-side="left"] > .rui-dropdown-menu-content {
  right: calc(100% + 6px);
  top: 0;
}
.rui-dropdown-menu[data-align="start"][data-side="bottom"] > .rui-dropdown-menu-content,
.rui-dropdown-menu[data-align="start"][data-side="top"] > .rui-dropdown-menu-content { left: 0; }
.rui-dropdown-menu[data-align="center"][data-side="bottom"] > .rui-dropdown-menu-content,
.rui-dropdown-menu[data-align="center"][data-side="top"] > .rui-dropdown-menu-content {
  left: 50%; transform: translateX(-50%);
}
.rui-dropdown-menu[data-align="end"][data-side="bottom"] > .rui-dropdown-menu-content,
.rui-dropdown-menu[data-align="end"][data-side="top"] > .rui-dropdown-menu-content { right: 0; }
.rui-menu-item {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  padding: 6px 10px;
  border-radius: var(--rui-radius-sm);
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-size: 13px;
  line-height: 1.2;
}
.rui-menu-item:hover:not(:disabled),
.rui-menu-item:focus-visible {
  background: var(--rui-color-surface-muted);
  outline: none;
}
.rui-menu-item:disabled { opacity: 0.55; cursor: not-allowed; }
.rui-menu-item[data-variant="danger"] { color: var(--rui-color-danger); }
.rui-menu-item[data-variant="danger"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--rui-color-danger) 12%, transparent);
}
.rui-menu-item-icon { width: 14px; display: inline-flex; justify-content: center; }
.rui-menu-item-label { flex: 1; min-width: 0; }
.rui-menu-item-shortcut {
  font-size: 11px;
  color: var(--rui-color-text-muted);
  font-family: var(--rui-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.rui-menu-separator {
  height: 1px;
  background: var(--rui-color-border-subtle);
  margin: 4px 0;
}
.rui-menu-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
  padding: 6px 10px 4px;
}

/* ----------------------------------------------------------------------- */
/* Popover                                                                 */
/* ----------------------------------------------------------------------- */
.rui-popover {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}
.rui-popover-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  border-radius: var(--rui-radius-sm);
}
.rui-popover-trigger:focus-visible,
.rui-popover-trigger:focus-within {
  outline: 2px solid color-mix(in srgb, var(--rui-color-primary) 60%, transparent);
  outline-offset: 2px;
}
.rui-popover-trigger[data-state="open"] { z-index: 41; }
.rui-popover-content {
  position: absolute;
  z-index: 40;
  width: 280px;
  max-width: min(360px, calc(100vw - 32px));
  padding: var(--rui-spacing-m);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  display: none;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  animation: rui-popover-in 140ms ease-out;
}
.rui-popover[data-open="true"] > .rui-popover-content { display: flex; }
.rui-popover[data-side="bottom"] > .rui-popover-content { top: calc(100% + 8px); }
.rui-popover[data-side="top"] > .rui-popover-content { bottom: calc(100% + 8px); }
.rui-popover[data-side="right"] > .rui-popover-content { left: calc(100% + 8px); top: 0; }
.rui-popover[data-side="left"] > .rui-popover-content { right: calc(100% + 8px); top: 0; }
.rui-popover[data-align="start"][data-side="bottom"] > .rui-popover-content,
.rui-popover[data-align="start"][data-side="top"] > .rui-popover-content { left: 0; }
.rui-popover[data-align="center"][data-side="bottom"] > .rui-popover-content,
.rui-popover[data-align="center"][data-side="top"] > .rui-popover-content {
  left: 50%; transform: translateX(-50%);
}
.rui-popover[data-align="end"][data-side="bottom"] > .rui-popover-content,
.rui-popover[data-align="end"][data-side="top"] > .rui-popover-content { right: 0; }
.rui-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-s);
  margin: calc(var(--rui-spacing-xs) * -1) calc(var(--rui-spacing-xs) * -1) 0;
}
.rui-popover-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--rui-color-text);
}
.rui-popover-title-spacer { display: block; flex: 1; }
.rui-popover-close {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--rui-color-text-muted);
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--rui-radius-sm);
  font-size: 18px;
  line-height: 1;
  transition: background 150ms ease, color 150ms ease;
}
.rui-popover-close:hover {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text);
}
.rui-popover-close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--rui-color-primary) 60%, transparent);
  outline-offset: 1px;
}
@keyframes rui-popover-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.rui-popover[data-side="top"] > .rui-popover-content { animation-name: rui-popover-in-up; }
@keyframes rui-popover-in-up {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ----------------------------------------------------------------------- */
/* Toast / Toasts                                                          */
/* ----------------------------------------------------------------------- */
.rui-toasts {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  pointer-events: none;
  max-width: min(360px, calc(100% - 32px));
}
.rui-toasts > * { pointer-events: auto; }
.rui-toasts[data-position="top-right"] { top: 16px; right: 16px; align-items: flex-end; }
.rui-toasts[data-position="top-left"] { top: 16px; left: 16px; align-items: flex-start; }
.rui-toasts[data-position="top-center"] { top: 16px; left: 50%; transform: translateX(-50%); align-items: center; }
.rui-toasts[data-position="bottom-right"] { bottom: 16px; right: 16px; align-items: flex-end; flex-direction: column-reverse; }
.rui-toasts[data-position="bottom-left"] { bottom: 16px; left: 16px; align-items: flex-start; flex-direction: column-reverse; }
.rui-toasts[data-position="bottom-center"] { bottom: 16px; left: 50%; transform: translateX(-50%); align-items: center; flex-direction: column-reverse; }
.rui-toast {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  min-width: 240px;
  animation: rui-toast-in 200ms ease-out;
  transition: opacity 180ms ease, transform 180ms ease;
}
.rui-toast.is-dismissed {
  opacity: 0;
  transform: translateX(12px);
  pointer-events: none;
}
.rui-toasts[data-position^="top-left"] .rui-toast.is-dismissed,
.rui-toasts[data-position="bottom-left"] .rui-toast.is-dismissed {
  transform: translateX(-12px);
}
.rui-toast-placeholder { display: none !important; }
.rui-toast-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #ffffff;
  background: var(--rui-color-text-muted);
}
.rui-toast-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rui-toast-title { font-weight: 600; font-size: 13px; }
.rui-toast-message { color: var(--rui-color-text-muted); font-size: 12px; line-height: 1.45; }
.rui-toast-action { margin-top: 6px; }
.rui-toast-close {
  appearance: none;
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: var(--rui-color-text-muted);
  cursor: pointer;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--rui-radius-sm);
  margin: -2px -4px -2px 0;
  transition: background 150ms ease, color 150ms ease;
}
.rui-toast-close:hover {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text);
}
.rui-toast-close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--rui-color-primary) 60%, transparent);
  outline-offset: 1px;
}
.rui-toast[data-tone="primary"] .rui-toast-icon { background: var(--rui-color-primary); }
.rui-toast[data-tone="success"] .rui-toast-icon { background: var(--rui-color-success); }
.rui-toast[data-tone="warning"] .rui-toast-icon { background: var(--rui-color-warning); }
.rui-toast[data-tone="danger"] .rui-toast-icon { background: var(--rui-color-danger); }
.rui-toast[data-tone="info"] .rui-toast-icon { background: var(--rui-color-info); }
.rui-toast[data-tone="success"] { border-color: color-mix(in srgb, var(--rui-color-success) 36%, transparent); }
.rui-toast[data-tone="warning"] { border-color: color-mix(in srgb, var(--rui-color-warning) 36%, transparent); }
.rui-toast[data-tone="danger"] { border-color: color-mix(in srgb, var(--rui-color-danger) 36%, transparent); }
.rui-toast[data-tone="info"] { border-color: color-mix(in srgb, var(--rui-color-info) 36%, transparent); }
@keyframes rui-toast-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ----------------------------------------------------------------------- */
/* Slider                                                                  */
/* ----------------------------------------------------------------------- */
.rui-slider { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-slider-head { display: flex; justify-content: space-between; align-items: center; }
.rui-slider-label { font-size: 13px; color: var(--rui-color-text); }
.rui-slider-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--rui-color-primary);
  font-variant-numeric: tabular-nums;
}
.rui-slider-input {
  appearance: none;
  width: 100%;
  height: 6px;
  background: var(--rui-color-surface-muted);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}
.rui-slider[data-disabled="true"] .rui-slider-input { opacity: 0.55; cursor: not-allowed; }
.rui-slider-input::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--rui-color-primary);
  border: 2px solid var(--rui-color-surface);
  box-shadow: var(--rui-shadow-sm);
  cursor: pointer;
}
.rui-slider-input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--rui-color-primary);
  border: 2px solid var(--rui-color-surface);
  box-shadow: var(--rui-shadow-sm);
  cursor: pointer;
}
.rui-slider-input:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 30%, transparent);
}
.rui-slider-input:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 30%, transparent);
}

/* ----------------------------------------------------------------------- */
/* NumberInput                                                             */
/* ----------------------------------------------------------------------- */
.rui-number-input {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-surface);
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.rui-number-input:focus-within {
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
}
.rui-number-input-button {
  appearance: none;
  border: none;
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text);
  flex: 0 0 auto;
  width: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
  transition: background 150ms ease, color 150ms ease;
}
.rui-number-input-button[data-direction="down"] {
  border-right: 1px solid var(--rui-color-border);
}
.rui-number-input-button[data-direction="up"] {
  border-left: 1px solid var(--rui-color-border);
}
.rui-number-input-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--rui-color-primary) 10%, var(--rui-color-surface-muted));
  color: var(--rui-color-primary);
}
.rui-number-input-button:active:not(:disabled) {
  background: color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-surface-muted));
}
.rui-number-input-button:disabled { opacity: 0.5; cursor: not-allowed; }
.rui-number-input-field {
  appearance: none;
  border: none;
  background: transparent;
  padding: 8px 12px;
  color: inherit;
  font: inherit;
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.rui-number-input-field:focus { outline: none; }
.rui-number-input-field::-webkit-outer-spin-button,
.rui-number-input-field::-webkit-inner-spin-button { appearance: none; margin: 0; }
.rui-number-input[data-disabled="true"] {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ----------------------------------------------------------------------- */
/* DatePicker                                                              */
/* ----------------------------------------------------------------------- */
.rui-date-picker { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-date-picker-label { font-size: 13px; color: var(--rui-color-text); }
.rui-date-picker-input {
  appearance: none;
  padding: 8px 12px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-surface);
  color: inherit;
  font: inherit;
  font-size: 13px;
}
.rui-date-picker-input:focus {
  outline: none;
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
}

/* ----------------------------------------------------------------------- */
/* FileUpload                                                              */
/* ----------------------------------------------------------------------- */
.rui-file-upload {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
}
.rui-file-upload-dropzone {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  border: 1.5px dashed var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-bg-subtle);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.rui-file-upload-dropzone:hover {
  border-color: var(--rui-color-primary);
  background: color-mix(in srgb, var(--rui-color-primary) 5%, var(--rui-color-bg-subtle));
}
.rui-file-upload[data-disabled="true"] { opacity: 0.55; }
.rui-file-upload[data-disabled="true"] .rui-file-upload-dropzone { cursor: not-allowed; }
.rui-file-upload-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  font-size: 14px;
}
.rui-file-upload-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.rui-file-upload-label { font-weight: 600; font-size: 13px; }
.rui-file-upload-hint { font-size: 12px; color: var(--rui-color-text-muted); }
.rui-file-upload-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.rui-file-upload-preview {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-xs, 4px);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface, var(--rui-color-bg-subtle));
}
.rui-file-upload-preview-item {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
}
.rui-file-upload-thumbnail {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--rui-radius-sm);
  border: 1px solid var(--rui-color-border);
  flex-shrink: 0;
}
.rui-file-upload-filename {
  font-size: 12.5px;
  color: var(--rui-color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ----------------------------------------------------------------------- */
/* Combobox                                                                */
/* ----------------------------------------------------------------------- */
.rui-combobox {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  min-width: 200px;
}
.rui-combobox[data-disabled="true"] { opacity: 0.55; }
.rui-combobox-trigger {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-s);
  padding: 8px 12px;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.rui-combobox-trigger:focus-visible,
.rui-combobox[data-open="true"] .rui-combobox-trigger {
  outline: none;
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
}
.rui-combobox-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rui-combobox-value[data-placeholder="true"] { color: var(--rui-color-text-muted); }
.rui-combobox-chevron { color: var(--rui-color-text-muted); font-size: 11px; }
.rui-combobox-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 40;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  display: none;
  flex-direction: column;
  padding: 6px;
  gap: 4px;
  max-height: 280px;
}
.rui-combobox[data-open="true"] .rui-combobox-panel { display: flex; }
.rui-combobox-filter {
  appearance: none;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
  padding: 6px 10px;
  font: inherit;
  font-size: 13px;
  background: var(--rui-color-bg-subtle);
}
.rui-combobox-filter:focus {
  outline: none;
  border-color: var(--rui-color-primary);
}
.rui-combobox-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.rui-combobox-option {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 6px 10px;
  border-radius: var(--rui-radius-sm);
  cursor: pointer;
  font-size: 13px;
}
.rui-combobox-option:hover { background: var(--rui-color-surface-muted); }
.rui-combobox-option[aria-selected="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  font-weight: 600;
}
.rui-combobox-empty {
  padding: 12px;
  color: var(--rui-color-text-muted);
  font-size: 12px;
  text-align: center;
}

/* ----------------------------------------------------------------------- */
/* Tree / TreeNode                                                         */
/* ----------------------------------------------------------------------- */
.rui-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.rui-tree-node {
  display: flex;
  flex-direction: column;
}
.rui-tree-node-summary {
  list-style: none;
  cursor: pointer;
  display: block;
}
.rui-tree-node-summary::-webkit-details-marker { display: none; }
.rui-tree-node-row {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-xs);
  width: 100%;
  padding: 4px 6px;
  border-radius: var(--rui-radius-sm);
  cursor: pointer;
  text-align: left;
}
.rui-tree-node-row:hover { background: var(--rui-color-surface-muted); }
.rui-tree-node-row[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  font-weight: 600;
}
.rui-tree-node-chevron {
  font-size: 10px;
  color: var(--rui-color-text-muted);
  width: 14px;
  display: inline-flex;
  justify-content: center;
  transition: transform 150ms ease;
}
.rui-tree-node[open] > .rui-tree-node-summary .rui-tree-node-chevron {
  transform: rotate(90deg);
}
.rui-tree-node-chevron-spacer { width: 14px; }
.rui-tree-node-icon { color: var(--rui-color-text-muted); font-size: 12px; }
.rui-tree-node-row[data-active="true"] .rui-tree-node-icon { color: var(--rui-color-primary); }
.rui-tree-node-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rui-tree-node-badge {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
}
.rui-tree-node-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 16px;
  border-left: 1px solid var(--rui-color-border-subtle);
  margin-left: 8px;
  margin-top: 2px;
}

/* ----------------------------------------------------------------------- */
/* Navbar / NavbarItem                                                     */
/* ----------------------------------------------------------------------- */
.rui-navbar {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-l);
  padding: var(--rui-spacing-s) var(--rui-spacing-l);
  background: var(--rui-color-surface);
  border-bottom: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md) var(--rui-radius-md) 0 0;
}
.rui-navbar[data-sticky="true"] {
  position: sticky;
  top: 0;
  z-index: 30;
  backdrop-filter: blur(8px);
  background: color-mix(in srgb, var(--rui-color-surface) 92%, transparent);
}
.rui-navbar[data-variant="transparent"] {
  background: transparent;
  border-bottom-color: transparent;
}
.rui-navbar-brand {
  font-weight: 700;
  font-size: 15px;
  color: var(--rui-color-text);
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-s);
}
.rui-navbar-items {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  flex-wrap: wrap;
}
.rui-navbar-actions {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  margin-left: auto;
}
.rui-navbar-item {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--rui-color-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--rui-radius-sm);
  text-decoration: none;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.rui-navbar-item:hover { background: var(--rui-color-surface-muted); }
.rui-navbar-item[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
}
.rui-navbar-item-icon { display: inline-flex; }

/* Compact layout shifts for narrow viewports */
@media (max-width: 640px) {
  .rui-navbar { flex-wrap: wrap; gap: var(--rui-spacing-s); }
  .rui-navbar-items { width: 100%; }
}

/* ------------------------------------------------------------------------- *
 * New / refined component styles — wave introduced by components_suggestions.md
 * ------------------------------------------------------------------------- */

/* Spinner --------------------------------------------------------------- */
.rui-spinner {
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-xs, 4px);
  vertical-align: middle;
}
.rui-spinner-ring {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--rui-color-primary) 25%, transparent);
  border-top-color: var(--rui-color-primary);
  animation: rui-spinner-rotate 0.8s linear infinite;
}
.rui-spinner[data-size="xs"] .rui-spinner-ring { width: 10px; height: 10px; border-width: 1.5px; }
.rui-spinner[data-size="sm"] .rui-spinner-ring { width: 14px; height: 14px; }
.rui-spinner[data-size="md"] .rui-spinner-ring { width: 16px; height: 16px; }
.rui-spinner[data-size="lg"] .rui-spinner-ring { width: 22px; height: 22px; border-width: 2.5px; }
.rui-spinner[data-size="xl"] .rui-spinner-ring { width: 32px; height: 32px; border-width: 3px; }
.rui-spinner[data-tone="success"] .rui-spinner-ring { border-top-color: var(--rui-color-success); border-color: color-mix(in srgb, var(--rui-color-success) 25%, transparent); border-top-color: var(--rui-color-success); }
.rui-spinner[data-tone="warning"] .rui-spinner-ring { border-color: color-mix(in srgb, var(--rui-color-warning) 25%, transparent); border-top-color: var(--rui-color-warning); }
.rui-spinner[data-tone="danger"] .rui-spinner-ring { border-color: color-mix(in srgb, var(--rui-color-danger) 25%, transparent); border-top-color: var(--rui-color-danger); }
.rui-spinner[data-tone="info"] .rui-spinner-ring { border-color: color-mix(in srgb, var(--rui-color-info) 25%, transparent); border-top-color: var(--rui-color-info); }
.rui-spinner-label { font-size: 0.875rem; color: var(--rui-color-text-muted); }
@keyframes rui-spinner-rotate { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .rui-spinner-ring { animation-duration: 2s; }
}

/* Sparkline ------------------------------------------------------------ */
.rui-sparkline {
  display: inline-block;
  vertical-align: middle;
  color: var(--rui-color-primary);
}
.rui-sparkline-line {
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
.rui-sparkline-area {
  fill: color-mix(in srgb, currentColor 16%, transparent);
}
.rui-sparkline[data-tone="success"] { color: var(--rui-color-success); }
.rui-sparkline[data-tone="warning"] { color: var(--rui-color-warning); }
.rui-sparkline[data-tone="danger"] { color: var(--rui-color-danger); }
.rui-sparkline[data-tone="info"] { color: var(--rui-color-info); }
.rui-sparkline-wrap { display: inline-flex; align-items: center; }

.rui-stat-spark { margin-top: var(--rui-spacing-xs, 4px); }
.rui-stats-value-row {
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-s, 8px);
}
.rui-stat-card[data-tone="success"] .rui-stat-value { color: var(--rui-color-success); }
.rui-stat-card[data-tone="warning"] .rui-stat-value { color: var(--rui-color-warning); }
.rui-stat-card[data-tone="danger"] .rui-stat-value { color: var(--rui-color-danger); }

/* MultiSelect ---------------------------------------------------------- */
.rui-multiselect {
  position: relative;
  width: 100%;
  font-size: 0.875rem;
}
.rui-multiselect-trigger {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-s, 8px);
  padding: 6px var(--rui-spacing-s, 8px);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.rui-multiselect-trigger:focus-visible {
  outline: 2px solid var(--rui-color-primary);
  outline-offset: 1px;
}
.rui-multiselect[data-disabled="true"] .rui-multiselect-trigger {
  opacity: 0.6;
  cursor: not-allowed;
}
.rui-multiselect-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.rui-multiselect-placeholder { color: var(--rui-color-text-muted); }
.rui-multiselect-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  border-radius: var(--rui-radius-sm, 6px);
  font-size: 0.8125rem;
}
.rui-multiselect-chip-remove {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  border-radius: 4px;
}
.rui-multiselect-chip-remove:hover { background: color-mix(in srgb, currentColor 18%, transparent); }
.rui-multiselect-chevron {
  flex-shrink: 0;
  color: var(--rui-color-text-muted);
  transition: transform 0.15s ease;
}
.rui-multiselect[data-open="true"] .rui-multiselect-chevron { transform: rotate(180deg); }
.rui-multiselect-panel {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  box-shadow: var(--rui-shadow-md);
  padding: var(--rui-spacing-xs, 4px);
}
.rui-multiselect[data-open="true"] .rui-multiselect-panel { display: block; }
.rui-multiselect-filter {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm, 6px);
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  font: inherit;
  margin-bottom: 4px;
}
.rui-multiselect-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.rui-multiselect-option {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s, 8px);
  padding: 6px var(--rui-spacing-s, 8px);
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--rui-color-text);
  font: inherit;
  text-align: left;
  border-radius: var(--rui-radius-sm, 6px);
}
.rui-multiselect-option:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-multiselect-option[data-selected="true"] {
  color: var(--rui-color-primary);
  font-weight: 600;
}
.rui-multiselect-option:disabled { opacity: 0.4; cursor: not-allowed; }
.rui-multiselect-option-check {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rui-color-border);
  border-radius: 4px;
  flex-shrink: 0;
}
.rui-multiselect-option[data-selected="true"] .rui-multiselect-option-check {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
  color: var(--rui-color-on-primary, #fff);
}
.rui-multiselect-empty {
  padding: 12px;
  color: var(--rui-color-text-muted);
  text-align: center;
  font-size: 0.875rem;
}

/* DateRangePicker ------------------------------------------------------ */
.rui-date-range-picker { display: flex; flex-direction: column; gap: 4px; }
.rui-date-range-picker-label {
  font-size: 0.875rem;
  color: var(--rui-color-text-muted);
}
.rui-date-range-picker-row {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s, 8px);
}
.rui-date-range-picker-input {
  flex: 1;
  min-width: 0;
  padding: 8px var(--rui-spacing-s, 8px);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  font: inherit;
}
.rui-date-range-picker-input:focus-visible {
  outline: 2px solid var(--rui-color-primary);
  outline-offset: 1px;
}
.rui-date-range-picker-separator { color: var(--rui-color-text-muted); }

/* SegmentedControl ----------------------------------------------------- */
.rui-segmented-control {
  display: inline-flex;
  background: var(--rui-color-surface-muted);
  padding: 3px;
  border-radius: var(--rui-radius-md, 8px);
  border: 1px solid var(--rui-color-border);
  gap: 2px;
}
.rui-segmented-control-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px var(--rui-spacing-s, 10px);
  background: transparent;
  border: 0;
  border-radius: var(--rui-radius-sm, 6px);
  color: var(--rui-color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
}
.rui-segmented-control-option:hover { color: var(--rui-color-text); }
.rui-segmented-control-option[data-active="true"] {
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  box-shadow: var(--rui-shadow-sm);
}
.rui-segmented-control[data-size="sm"] .rui-segmented-control-option { padding: 2px 8px; font-size: 0.75rem; }
.rui-segmented-control[data-size="lg"] .rui-segmented-control-option { padding: 6px 14px; font-size: 0.9375rem; }

/* Toolbar center slot -------------------------------------------------- */
.rui-toolbar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--rui-spacing-s, 8px);
  flex: 1;
  flex-wrap: wrap;
}
.rui-toolbar[data-has-center="true"] .rui-toolbar-left,
.rui-toolbar[data-has-center="true"] .rui-toolbar-right { flex: 0 1 auto; }

/* EmptyState multi-action + illustration ------------------------------- */
.rui-empty-state-actions {
  display: flex;
  gap: var(--rui-spacing-s, 8px);
  margin-top: var(--rui-spacing-m, 12px);
  flex-wrap: wrap;
  justify-content: center;
}
.rui-empty-state-illustration {
  max-width: 240px;
  width: 100%;
  height: auto;
  display: block;
  margin: 0 auto var(--rui-spacing-m, 12px);
}

/* Modal size + footer -------------------------------------------------- */
.rui-modal[data-size="sm"] { max-width: 360px; }
.rui-modal[data-size="md"] { max-width: 520px; }
.rui-modal[data-size="lg"] { max-width: 760px; }
.rui-modal[data-size="xl"] { max-width: 960px; }
.rui-modal[data-size="full"] { max-width: 96vw; width: 96vw; }
.rui-modal-footer {
  display: flex;
  gap: var(--rui-spacing-s, 8px);
  padding: var(--rui-spacing-m, 12px) var(--rui-spacing-l, 16px);
  border-top: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* Tabs trigger icon + badge ------------------------------------------- */
.rui-tab-trigger-icon { display: inline-flex; align-items: center; margin-right: 4px; }
.rui-tab-trigger-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  margin-left: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
  color: var(--rui-color-primary);
  font-size: 0.6875rem;
  font-weight: 600;
}
.rui-tabs[data-orientation="vertical"] {
  display: flex;
  gap: var(--rui-spacing-m, 12px);
}
.rui-tabs[data-orientation="vertical"] .rui-tab-list {
  flex-direction: column;
  border-bottom: 0;
  border-right: 1px solid var(--rui-color-border);
  padding-right: var(--rui-spacing-s, 8px);
  min-width: 140px;
}
.rui-tabs[data-orientation="vertical"] .rui-tab-trigger {
  justify-content: flex-start;
  text-align: left;
}
.rui-tabs[data-orientation="vertical"] .rui-tab-panels { flex: 1; }

/* Progress segmented + buffered --------------------------------------- */
.rui-progress-segments {
  display: flex;
  gap: 4px;
}
.rui-progress-segment {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--rui-color-surface-muted);
  border: 1px solid var(--rui-color-border);
}
.rui-progress-segment[data-filled="true"] {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
}
.rui-progress[data-tone="success"] .rui-progress-segment[data-filled="true"] { background: var(--rui-color-success); border-color: var(--rui-color-success); }
.rui-progress[data-tone="warning"] .rui-progress-segment[data-filled="true"] { background: var(--rui-color-warning); border-color: var(--rui-color-warning); }
.rui-progress[data-tone="danger"] .rui-progress-segment[data-filled="true"] { background: var(--rui-color-danger); border-color: var(--rui-color-danger); }
.rui-progress-buffer {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--rui-color-primary) 22%, transparent);
  border-radius: inherit;
}
.rui-progress-track { position: relative; overflow: hidden; }

/* CodeBlock copy + line gutter + highlight ----------------------------- */
.rui-code-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-s, 8px);
  padding: 4px 8px;
  background: var(--rui-color-surface-muted);
  border-bottom: 1px solid var(--rui-color-border);
  border-top-left-radius: var(--rui-radius-md, 8px);
  border-top-right-radius: var(--rui-radius-md, 8px);
  font-size: 0.75rem;
  color: var(--rui-color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.rui-code-block-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--rui-color-text-muted);
  padding: 2px 6px;
  border-radius: var(--rui-radius-sm, 6px);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  text-transform: none;
  letter-spacing: 0;
}
.rui-code-block-copy:hover {
  background: var(--rui-color-surface);
  border-color: var(--rui-color-border);
  color: var(--rui-color-text);
}
.rui-code-block-pre[data-line-numbers="true"] {
  counter-reset: rui-codeline;
}
.rui-code-block-line {
  display: flex;
  gap: var(--rui-spacing-s, 8px);
  padding: 0 var(--rui-spacing-s, 8px);
}
.rui-code-block-line[data-highlight="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 10%, transparent);
}
.rui-code-block-gutter {
  flex-shrink: 0;
  color: var(--rui-color-text-muted);
  user-select: none;
  min-width: 2ch;
  text-align: right;
}
.rui-code-block-code { white-space: pre; }

/* Skeleton variants ---------------------------------------------------- */
.rui-skeleton[data-variant="card"],
.rui-skeleton[data-variant="image"],
.rui-skeleton[data-variant="avatar"],
.rui-skeleton[data-variant="table-row"] {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s, 8px);
}
.rui-skeleton-shape {
  background: linear-gradient(90deg, var(--rui-color-surface-muted) 25%, var(--rui-color-surface) 37%, var(--rui-color-surface-muted) 63%);
  background-size: 400% 100%;
  animation: rui-skeleton-shimmer 1.4s ease-in-out infinite;
}
.rui-skeleton-shape[data-shape="circle"] { border-radius: 999px; }
.rui-skeleton-shape[data-shape="rect"] { border-radius: var(--rui-radius-md, 8px); }
.rui-skeleton-row { display: flex; gap: var(--rui-spacing-s, 8px); }
@keyframes rui-skeleton-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) {
  .rui-skeleton-shape, .rui-skeleton-line { animation-duration: 3s; }
}

/* Image fit + placeholder --------------------------------------------- */
.rui-image[data-fit="contain"] img { object-fit: contain; }
.rui-image[data-fit="cover"] img { object-fit: cover; }
.rui-image[data-fit="fill"] img { object-fit: fill; }
.rui-image[data-fit="none"] img { object-fit: none; }
.rui-image[data-fit="scale-down"] img { object-fit: scale-down; }
.rui-image-placeholder {
  width: 100%;
  height: 100%;
  min-height: 80px;
  background: var(--rui-color-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rui-color-text-muted);
  border-radius: inherit;
}
.rui-image-fallback-icon { font-size: 1.5rem; opacity: 0.6; }
.rui-image-fallback-text { font-size: 0.8125rem; opacity: 0.8; }

/* Table density + sticky ---------------------------------------------- */
.rui-table-wrapper[data-density="compact"] td,
.rui-table-wrapper[data-density="compact"] th { padding: 4px 8px; }
.rui-table-wrapper[data-striped="true"] tbody tr:nth-child(even) td {
  background: var(--rui-color-surface-muted);
}
.rui-table-wrapper[data-sticky="true"] {
  position: relative;
  overflow: auto;
  max-height: 60vh;
}
.rui-table-wrapper[data-sticky="true"] thead th {
  position: sticky;
  top: 0;
  background: var(--rui-color-surface);
  z-index: 1;
}
.rui-table td[data-align="center"], .rui-table th[data-align="center"] { text-align: center; }
.rui-table td[data-align="right"], .rui-table th[data-align="right"] { text-align: right; }
.rui-table td[data-align="left"], .rui-table th[data-align="left"] { text-align: left; }

/* Pagination summary + per-page selector ------------------------------ */
.rui-pagination {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m, 12px);
  flex-wrap: wrap;
}
.rui-pagination-summary {
  color: var(--rui-color-text-muted);
  font-size: 0.875rem;
}
.rui-pagination-buttons { display: inline-flex; gap: 2px; align-items: center; flex-wrap: wrap; }
.rui-pagination-current {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--rui-spacing-s, 8px);
  color: var(--rui-color-text-muted);
  font-size: 0.875rem;
}
.rui-pagination-per-page {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  color: var(--rui-color-text-muted);
}
.rui-pagination-per-page-select {
  padding: 4px 6px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm, 6px);
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  font: inherit;
}

/* Markdown rich rendering --------------------------------------------- */
.rui-markdown h1.rui-markdown-h1,
.rui-markdown h2.rui-markdown-h2,
.rui-markdown h3.rui-markdown-h3 {
  margin: 0.6em 0 0.3em;
  font-weight: 600;
  line-height: 1.25;
}
.rui-markdown h1.rui-markdown-h1 { font-size: 1.5rem; }
.rui-markdown h2.rui-markdown-h2 { font-size: 1.25rem; }
.rui-markdown h3.rui-markdown-h3 { font-size: 1.0625rem; }
.rui-markdown .rui-markdown-quote {
  border-left: 3px solid var(--rui-color-primary);
  padding: 0 var(--rui-spacing-m, 12px);
  color: var(--rui-color-text-muted);
  font-style: italic;
  margin: var(--rui-spacing-s, 8px) 0;
}
.rui-markdown .rui-markdown-code {
  background: var(--rui-color-surface-muted);
  padding: var(--rui-spacing-s, 8px) var(--rui-spacing-m, 12px);
  border-radius: var(--rui-radius-md, 8px);
  overflow-x: auto;
  font-size: 0.8125rem;
  margin: var(--rui-spacing-s, 8px) 0;
}
.rui-markdown .rui-markdown-image {
  max-width: 100%;
  height: auto;
  display: block;
  margin: var(--rui-spacing-s, 8px) 0;
  border-radius: var(--rui-radius-md, 8px);
}
.rui-markdown ol, .rui-markdown ul { padding-left: 1.5em; margin: 0.25em 0; }

/* Separator with label ------------------------------------------------ */
.rui-separator-with-label {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s, 8px);
  height: auto;
  width: 100%;
  /* The line lives in the inner spans, not on the container. */
  background: transparent;
}
.rui-separator-with-label[data-orientation="horizontal"] { height: auto; }
.rui-separator-with-label .rui-separator-line {
  flex: 1;
  height: 1px;
  background: var(--rui-color-border);
}
.rui-separator-with-label .rui-separator-label {
  color: var(--rui-color-text-muted);
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

/* Standalone Toast positioning ---------------------------------------- */
.rui-toast-standalone {
  position: fixed;
  z-index: 1000;
  max-width: 360px;
}
.rui-toast-standalone[data-position="top-right"]    { top: 20px; right: 20px; }
.rui-toast-standalone[data-position="top-left"]     { top: 20px; left: 20px; }
.rui-toast-standalone[data-position="top-center"]   { top: 20px; left: 50%; transform: translateX(-50%); }
.rui-toast-standalone[data-position="bottom-right"] { bottom: 20px; right: 20px; }
.rui-toast-standalone[data-position="bottom-left"]  { bottom: 20px; left: 20px; }
.rui-toast-standalone[data-position="bottom-center"]{ bottom: 20px; left: 50%; transform: translateX(-50%); }

/* Rating half-step / custom icons ------------------------------------- */
.rui-rating[data-half-step="true"] .rui-rating-star { cursor: crosshair; }
.rui-rating-star[data-fill="half"] {
  background: linear-gradient(90deg, var(--rui-color-primary) 50%, var(--rui-color-border) 50%);
  -webkit-background-clip: text;
  background-clip: text;
}

/* Steps active state -------------------------------------------------- */
.rui-steps-item[data-active="true"] {
  font-weight: 600;
}
.rui-steps-item[data-active="true"]::marker {
  color: var(--rui-color-primary);
}

/* ====================================================================== */
/* Advanced components (DataGrid, CalendarView, Carousel, Media, ...)    */
/* ====================================================================== */

/* DataGrid ------------------------------------------------------------ */
.rui-data-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.rui-data-grid-bulk {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--rui-color-primary) 8%, var(--rui-color-surface, #fff));
  border: 1px solid color-mix(in srgb, var(--rui-color-primary) 25%, var(--rui-color-border));
  border-radius: var(--rui-radius-md, 8px);
  font-size: 13px;
}
.rui-data-grid-bulk-count {
  font-weight: 600;
  color: var(--rui-color-primary);
}
.rui-data-grid-bulk-tools {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.rui-data-grid-scroll {
  position: relative;
  overflow: auto;
  max-width: 100%;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-data-grid-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 14px;
}
.rui-data-grid-caption {
  text-align: left;
  caption-side: top;
  padding: 12px 14px 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--rui-color-text);
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-data-grid-table thead th {
  position: sticky;
  top: 0;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, #fff)));
  z-index: 2;
  text-align: left;
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--rui-color-text-muted);
  border-bottom: 1px solid var(--rui-color-border);
  padding: 10px 12px;
  white-space: nowrap;
}
.rui-data-grid-table thead th[data-align="right"] { text-align: right; }
.rui-data-grid-table thead th[data-align="center"] { text-align: center; }
.rui-data-grid-table thead th[data-active="true"] { color: var(--rui-color-primary); }
.rui-data-grid[data-sticky-first="true"] tbody td:first-child,
.rui-data-grid[data-sticky-first="true"] thead th:first-child {
  position: sticky;
  left: 0;
  background: var(--rui-color-surface, var(--rui-color-bg));
  z-index: 3;
  box-shadow: 1px 0 0 var(--rui-color-border);
}
.rui-data-grid[data-sticky-first="true"] thead th:first-child { z-index: 4; }
.rui-data-grid[data-sticky-header="false"] thead th { position: static; }
.rui-data-grid-cell-select {
  width: 36px;
  padding-left: 12px;
  padding-right: 4px;
}
.rui-data-grid-checkbox {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: var(--rui-color-primary);
}
.rui-data-grid-table tbody td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--rui-color-border);
  vertical-align: middle;
  color: var(--rui-color-text);
}
.rui-data-grid[data-density="compact"] .rui-data-grid-table thead th,
.rui-data-grid[data-density="compact"] .rui-data-grid-table tbody td { padding: 6px 10px; }
.rui-data-grid-table tbody td[data-align="right"] { text-align: right; font-variant-numeric: tabular-nums; }
.rui-data-grid-table tbody td[data-align="center"] { text-align: center; }
.rui-data-grid-table tbody td[data-format="number"],
.rui-data-grid-table tbody td[data-format="currency"] { font-variant-numeric: tabular-nums; }
.rui-data-grid-table tbody tr:last-child td { border-bottom: none; }
.rui-data-grid[data-striped="true"] tbody tr:nth-child(even) td {
  background: color-mix(in srgb, var(--rui-color-text) 2%, transparent);
}
.rui-data-grid-table tbody tr[data-selected="true"] td {
  background: color-mix(in srgb, var(--rui-color-primary) 10%, transparent);
}
.rui-data-grid-table tbody tr[data-clickable="true"] { cursor: pointer; }
.rui-data-grid-table tbody tr[data-clickable="true"]:hover td {
  background: color-mix(in srgb, var(--rui-color-text) 4%, transparent);
}
.rui-data-grid-sort {
  background: none;
  border: 0;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
}
.rui-data-grid-sort:hover { color: var(--rui-color-primary); }
.rui-data-grid-sort-icon {
  font-size: 11px;
  opacity: 0.55;
}
th[data-active="true"] .rui-data-grid-sort-icon { opacity: 1; }
.rui-data-grid-filter-row td {
  padding: 6px 10px 10px;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 2%, var(--rui-color-surface, #fff)));
  border-bottom: 1px solid var(--rui-color-border);
}
.rui-data-grid-filter {
  width: 100%;
  font-size: 12px;
  padding: 5px 10px;
  border: 1px solid var(--rui-color-border);
  border-radius: 999px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  outline: none;
}
.rui-data-grid-filter:focus { border-color: var(--rui-color-primary); }
.rui-data-grid-empty {
  text-align: center;
  padding: 36px 16px;
  color: var(--rui-color-text-muted);
  font-size: 14px;
}
.rui-data-grid-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 2px 4px;
  font-size: 13px;
}
.rui-data-grid-footer-summary { color: var(--rui-color-text-muted); }
.rui-data-grid-footer-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rui-data-grid-page-button {
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
}
.rui-data-grid-page-button:hover:not([disabled]) { border-color: var(--rui-color-primary); color: var(--rui-color-primary); }
.rui-data-grid-page-button[disabled] { opacity: 0.45; cursor: not-allowed; }
.rui-data-grid-page-current {
  min-width: 56px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--rui-color-text-muted);
}

/* CalendarView -------------------------------------------------------- */
.rui-calendar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.rui-calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}
.rui-calendar-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--rui-color-text);
}
.rui-calendar-weekrow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  padding: 0 1px;
}
.rui-calendar-weekday {
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
  text-align: left;
}
.rui-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--rui-color-border);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
}
.rui-calendar[data-view="week"] .rui-calendar-grid { grid-template-rows: minmax(120px, 1fr); }
.rui-calendar-day {
  background: var(--rui-color-surface, var(--rui-color-bg));
  min-height: 88px;
  padding: 6px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font: inherit;
  cursor: pointer;
  border: 0;
  color: inherit;
  transition: background 120ms ease;
}
.rui-calendar-day:hover {
  background: color-mix(in srgb, var(--rui-color-primary) 6%, var(--rui-color-surface, var(--rui-color-bg)));
}
.rui-calendar-day[data-in-month="false"] {
  color: var(--rui-color-text-muted);
  background: color-mix(in srgb, var(--rui-color-text) 2%, var(--rui-color-surface, var(--rui-color-bg)));
}
.rui-calendar-day[data-today="true"] { box-shadow: inset 0 0 0 2px var(--rui-color-primary); }
.rui-calendar-day[data-selected="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-surface, var(--rui-color-bg)));
}
.rui-calendar-daynumber {
  font-weight: 700;
  font-size: 13px;
  align-self: flex-start;
}
.rui-calendar-day-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.rui-calendar-event {
  display: block;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
  color: var(--rui-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
.rui-calendar-event[data-tone="success"] { background: color-mix(in srgb, var(--rui-color-success, #10b981) 18%, transparent); color: var(--rui-color-success, #10b981); }
.rui-calendar-event[data-tone="warning"] { background: color-mix(in srgb, var(--rui-color-warning, #f59e0b) 18%, transparent); color: var(--rui-color-warning, #f59e0b); }
.rui-calendar-event[data-tone="danger"] { background: color-mix(in srgb, var(--rui-color-danger, #ef4444) 18%, transparent); color: var(--rui-color-danger, #ef4444); }
.rui-calendar-event[data-tone="info"] { background: color-mix(in srgb, var(--rui-color-info, #06b6d4) 18%, transparent); color: var(--rui-color-info, #06b6d4); }
.rui-calendar-event-more { font-size: 11px; color: var(--rui-color-text-muted); padding: 0 2px; }

/* ActivityLog / AuditTrail ------------------------------------------- */
.rui-activity-log,
.rui-audit-trail {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rui-activity-log-item,
.rui-audit-trail-item {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  align-items: flex-start;
  position: relative;
}
.rui-activity-log-item:not(:last-child)::before,
.rui-audit-trail-item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 15px;
  top: 32px;
  bottom: -12px;
  width: 2px;
  background: var(--rui-color-border);
}
.rui-activity-log-marker,
.rui-audit-trail-marker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  border: 1px solid var(--rui-color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--rui-color-text-muted);
  position: relative;
  z-index: 1;
}
.rui-activity-log-item[data-tone="primary"] .rui-activity-log-marker,
.rui-audit-trail-item[data-tone="primary"] .rui-audit-trail-marker { color: var(--rui-color-primary); border-color: color-mix(in srgb, var(--rui-color-primary) 35%, var(--rui-color-border)); }
.rui-activity-log-item[data-tone="success"] .rui-activity-log-marker,
.rui-audit-trail-item[data-tone="success"] .rui-audit-trail-marker { color: var(--rui-color-success, #10b981); border-color: color-mix(in srgb, var(--rui-color-success, #10b981) 35%, var(--rui-color-border)); }
.rui-activity-log-item[data-tone="warning"] .rui-activity-log-marker,
.rui-audit-trail-item[data-tone="warning"] .rui-audit-trail-marker { color: var(--rui-color-warning, #f59e0b); border-color: color-mix(in srgb, var(--rui-color-warning, #f59e0b) 35%, var(--rui-color-border)); }
.rui-activity-log-item[data-tone="danger"] .rui-activity-log-marker,
.rui-audit-trail-item[data-tone="danger"] .rui-audit-trail-marker { color: var(--rui-color-danger, #ef4444); border-color: color-mix(in srgb, var(--rui-color-danger, #ef4444) 35%, var(--rui-color-border)); }
.rui-activity-log-body,
.rui-audit-trail-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
}
.rui-activity-log-head,
.rui-audit-trail-head {
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}
.rui-activity-log-actor,
.rui-audit-trail-actor {
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-activity-log-title,
.rui-audit-trail-title {
  color: var(--rui-color-text);
}
.rui-activity-log-time,
.rui-audit-trail-time {
  color: var(--rui-color-text-muted);
  font-size: 12px;
  margin-left: auto;
  white-space: nowrap;
}
.rui-activity-log-description,
.rui-audit-trail-description {
  font-size: 13px;
  color: var(--rui-color-text-muted);
  margin: 0;
}
.rui-audit-trail-meta {
  font-family: var(--rui-font-family-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 11.5px;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  padding: 3px 6px;
  border-radius: 4px;
  display: inline-block;
  color: var(--rui-color-text-muted);
  align-self: flex-start;
}

/* ComparisonTable ---------------------------------------------------- */
.rui-comparison-table {
  width: 100%;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-comparison-table table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 14px;
}
.rui-comparison-table th,
.rui-comparison-table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--rui-color-border);
  vertical-align: middle;
}
.rui-comparison-table tr:last-child td { border-bottom: none; }
.rui-comparison-table thead th {
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, #fff)));
  font-weight: 700;
  color: var(--rui-color-text);
}
.rui-comparison-table thead th[data-highlight="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, var(--rui-color-surface, #fff));
  color: var(--rui-color-primary);
}
.rui-comparison-table tbody td[data-highlight="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 6%, var(--rui-color-surface, #fff));
}
.rui-comparison-table-feature {
  font-weight: 600;
  width: 36%;
  color: var(--rui-color-text);
}
.rui-comparison-table-feature-label { font-weight: 600; }
.rui-comparison-table-feature-hint {
  display: block;
  font-size: 12px;
  color: var(--rui-color-text-muted);
  margin-top: 2px;
  font-weight: 400;
}
.rui-comparison-table-group td {
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 12px;
  color: var(--rui-color-text-muted);
}
.rui-comparison-yes { color: var(--rui-color-success, #10b981); font-size: 18px; }
.rui-comparison-no { color: var(--rui-color-text-muted); font-size: 18px; }

/* InfiniteList ------------------------------------------------------- */
.rui-infinite-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rui-infinite-list-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rui-infinite-list-sentinel {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 16px;
  color: var(--rui-color-text-muted);
  font-size: 13px;
}
.rui-infinite-list-spin {
  animation: rui-spin 0.9s linear infinite;
}
@keyframes rui-spin { to { transform: rotate(360deg); } }
.rui-infinite-list-load-more {
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: 1px solid var(--rui-color-border);
  color: inherit;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.rui-infinite-list-load-more:hover { border-color: var(--rui-color-primary); color: var(--rui-color-primary); }

/* Media: Video / Audio ---------------------------------------------- */
.rui-video-player {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}
.rui-video-player-frame {
  position: relative;
  width: 100%;
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: #000;
}
.rui-video-player-video {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.rui-video-player-caption {
  margin: 0;
  font-size: 13px;
  color: var(--rui-color-text-muted);
}
.rui-audio-player {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-audio-player-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 0;
}
.rui-audio-player-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--rui-color-primary) 12%, transparent);
  color: var(--rui-color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
.rui-audio-player-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rui-audio-player-title {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rui-audio-player-artist {
  font-size: 12px;
  color: var(--rui-color-text-muted);
}
.rui-audio-player-audio {
  flex: 1;
  min-width: 0;
  height: 36px;
}

/* Carousel / Gallery / Lightbox ------------------------------------- */
.rui-carousel {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rui-carousel-frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
}
.rui-carousel-track {
  display: flex;
  width: 100%;
  height: 100%;
  transition: transform 0.4s ease;
  will-change: transform;
}
.rui-carousel-slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.rui-carousel-slide img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rui-carousel-figure {
  margin: 0;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.rui-carousel-figure img,
.rui-carousel-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rui-carousel-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 18px;
  font-size: 14px;
  color: #fff;
  background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.6) 100%);
  margin: 0;
}
.rui-carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  z-index: 1;
}
.rui-carousel-arrow:hover { background: rgba(0, 0, 0, 0.75); }
.rui-carousel-arrow[data-direction="prev"] { left: 12px; }
.rui-carousel-arrow[data-direction="next"] { right: 12px; }
.rui-carousel-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.rui-carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rui-color-border);
  border: 0;
  cursor: pointer;
  padding: 0;
  transition: background 120ms ease, transform 120ms ease;
}
.rui-carousel-dot[data-active="true"] {
  background: var(--rui-color-primary);
  transform: scale(1.3);
}

.rui-gallery {
  display: grid;
  grid-template-columns: repeat(var(--rui-gallery-columns, 4), minmax(0, 1fr));
  gap: 8px;
}
.rui-gallery[data-columns="1"] { --rui-gallery-columns: 1; }
.rui-gallery[data-columns="2"] { --rui-gallery-columns: 2; }
.rui-gallery[data-columns="3"] { --rui-gallery-columns: 3; }
.rui-gallery[data-columns="4"] { --rui-gallery-columns: 4; }
.rui-gallery[data-columns="5"] { --rui-gallery-columns: 5; }
.rui-gallery[data-columns="6"] { --rui-gallery-columns: 6; }
@media (max-width: 720px) {
  .rui-gallery { grid-template-columns: repeat(min(var(--rui-gallery-columns, 3), 2), 1fr); }
}
.rui-gallery-tile {
  position: relative;
  overflow: hidden;
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  border: 1px solid var(--rui-color-border);
  padding: 0;
  margin: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: transform 160ms ease, border-color 160ms ease;
}
.rui-gallery-tile:hover { transform: scale(1.02); border-color: var(--rui-color-primary); }
.rui-gallery-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.rui-gallery-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--rui-color-text-muted);
}
.rui-gallery-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #fff;
  font-size: 12px;
  padding: 16px 10px 8px;
  text-align: left;
  pointer-events: none;
}

.rui-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 9999;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 32px;
  backdrop-filter: blur(4px);
}
.rui-lightbox-overlay[data-open="true"] { display: flex; }
.rui-lightbox {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.rui-lightbox-image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 90vw;
  max-height: 75vh;
}
.rui-lightbox-image-wrap img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
}
.rui-lightbox-arrow,
.rui-lightbox-close {
  position: absolute;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 0;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  transition: background 120ms ease;
}
.rui-lightbox-arrow:hover,
.rui-lightbox-close:hover { background: rgba(255, 255, 255, 0.3); }
.rui-lightbox-arrow[data-direction="prev"] { left: 24px; top: 50%; transform: translateY(-50%); }
.rui-lightbox-arrow[data-direction="next"] { right: 24px; top: 50%; transform: translateY(-50%); }
.rui-lightbox-close { right: 24px; top: 24px; }
.rui-lightbox-caption {
  color: #fff;
  text-align: center;
  font-size: 14px;
}
.rui-lightbox-counter {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Map --------------------------------------------------------------- */
.rui-map {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
}
.rui-map-frame {
  width: 100%;
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  position: relative;
}
.rui-map-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
.rui-map-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rui-color-text-muted);
  font-size: 13px;
}
.rui-map-markers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rui-map-marker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--rui-color-border);
  border-radius: 999px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  font-size: 12px;
}
.rui-map-marker-icon { color: var(--rui-color-primary); }
.rui-map-caption {
  margin: 0;
  font-size: 12.5px;
  color: var(--rui-color-text-muted);
}

/* Editors: RichTextEditor / CodeEditor ----------------------------- */
.rui-rich-text {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: var(--rui-color-surface, var(--rui-color-bg));
  display: flex;
  flex-direction: column;
}
.rui-rich-text[data-disabled="true"] { opacity: 0.6; }
.rui-rich-text-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, #fff)));
}
.rui-rich-text-tool {
  background: transparent;
  border: 0;
  border-radius: 4px;
  width: 30px;
  height: 30px;
  cursor: pointer;
  color: var(--rui-color-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: background 120ms ease, color 120ms ease;
}
.rui-rich-text-tool:hover { background: color-mix(in srgb, var(--rui-color-text) 8%, transparent); color: var(--rui-color-text); }
.rui-rich-text-content {
  padding: 14px 16px;
  outline: 0;
  font: inherit;
  color: inherit;
  overflow-y: auto;
  position: relative;
}
.rui-rich-text-content[data-empty="true"]::before {
  content: attr(data-placeholder);
  color: var(--rui-color-text-muted);
  pointer-events: none;
  position: absolute;
  top: 14px;
  left: 16px;
}
.rui-rich-text-content > :first-child { margin-top: 0; }
.rui-rich-text-content > :last-child { margin-bottom: 0; }
.rui-rich-text-content :is(h1,h2,h3) { margin: 0.6em 0 0.4em; line-height: 1.25; }
.rui-rich-text-content h2 { font-size: 18px; font-weight: 700; }
.rui-rich-text-content h3 { font-size: 16px; font-weight: 700; }
.rui-rich-text-content p { margin: 0 0 0.6em; line-height: 1.55; }
.rui-rich-text-content blockquote {
  border-left: 3px solid var(--rui-color-border);
  margin: 0.5em 0;
  padding-left: 12px;
  color: var(--rui-color-text-muted);
}
.rui-rich-text-content :is(ul, ol) { padding-left: 20px; margin: 0 0 0.6em; }

.rui-code-editor {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: var(--rui-color-surface, var(--rui-color-bg));
  font-family: var(--rui-font-family-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 13px;
  display: flex;
  flex-direction: column;
}
.rui-code-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, #fff)));
  border-bottom: 1px solid var(--rui-color-border);
}
.rui-code-editor-language {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--rui-color-text-muted);
}
.rui-code-editor-body {
  display: grid;
  grid-template-columns: auto 1fr;
}
.rui-code-editor[data-gutter="false"] .rui-code-editor-body { grid-template-columns: 1fr; }
.rui-code-editor-gutter {
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 3%, var(--rui-color-surface, #fff)));
  color: var(--rui-color-text-muted);
  padding: 12px 10px;
  text-align: right;
  user-select: none;
  border-right: 1px solid var(--rui-color-border);
  line-height: 1.6;
  font-size: 12px;
  display: flex;
  flex-direction: column;
}
.rui-code-editor-line { display: block; min-width: 24px; }
.rui-code-editor-textarea {
  padding: 12px 14px;
  border: 0;
  outline: 0;
  resize: vertical;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
}

/* ContextMenu / ColorPicker / PinInput etc ------------------------ */
.rui-context-menu {
  position: relative;
  display: inline-block;
  width: 100%;
}
.rui-context-menu-target {
  display: block;
  width: 100%;
}
.rui-context-menu-pop {
  position: absolute;
  z-index: 50;
  min-width: 200px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  box-shadow: var(--rui-shadow-md, 0 12px 32px rgba(0, 0, 0, 0.18));
  padding: 4px;
  display: none;
  flex-direction: column;
  gap: 1px;
}
.rui-context-menu-pop[data-open="true"] { display: flex; }
.rui-context-menu-pop .rui-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.rui-context-menu-pop .rui-menu-item:hover { background: color-mix(in srgb, var(--rui-color-text) 6%, transparent); }
.rui-context-menu-pop .rui-menu-item[data-variant="danger"] { color: var(--rui-color-danger, #ef4444); }
.rui-context-menu-pop .rui-menu-item[disabled] { opacity: 0.5; cursor: not-allowed; }
.rui-context-menu-pop .rui-menu-item-icon { color: var(--rui-color-text-muted); width: 16px; text-align: center; }
.rui-context-menu-pop .rui-menu-item-shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--rui-color-text-muted);
  font-family: var(--rui-font-family-mono, monospace);
}
.rui-context-menu-pop .rui-menu-separator {
  height: 1px;
  background: var(--rui-color-border);
  margin: 4px 0;
}

.rui-color-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rui-color-picker[data-disabled="true"] { opacity: 0.6; }
.rui-color-picker-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-color-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rui-color-picker-color {
  width: 40px;
  height: 36px;
  border: 1px solid var(--rui-color-border);
  border-radius: 8px;
  padding: 2px;
  cursor: pointer;
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-color-picker-hex {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  font-family: var(--rui-font-family-mono, monospace);
  font-size: 13px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
}
.rui-color-picker-hex:focus { outline: none; border-color: var(--rui-color-primary); }
.rui-color-picker-swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.rui-color-picker-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--rui-color-border);
  cursor: pointer;
  padding: 0;
  transition: transform 120ms ease, border-color 120ms ease;
}
.rui-color-picker-swatch:hover { transform: scale(1.1); }
.rui-color-picker-swatch[data-active="true"] { border-color: var(--rui-color-text); transform: scale(1.15); }

.rui-pin-input {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
.rui-pin-input[data-disabled="true"] { opacity: 0.6; }
.rui-pin-input-slot {
  width: 44px;
  height: 52px;
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  font-family: var(--rui-font-family-mono, monospace);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.rui-pin-input-slot:focus {
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 22%, transparent);
}

.rui-password-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rui-password-input[data-disabled="true"] { opacity: 0.6; }
.rui-password-input-row {
  position: relative;
}
.rui-password-input-field {
  width: 100%;
  padding: 8px 40px 8px 12px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  font: inherit;
  font-size: 14px;
  outline: none;
}
.rui-password-input-field:focus { border-color: var(--rui-color-primary); }
.rui-password-input-toggle {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--rui-color-text-muted);
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.rui-password-input-toggle:hover { color: var(--rui-color-text); }
.rui-password-input-strength-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rui-password-input-strength {
  display: flex;
  gap: 4px;
  flex: 1;
}
.rui-password-input-strength-bar {
  flex: 1;
  height: 4px;
  background: var(--rui-color-border);
  border-radius: 2px;
}
.rui-password-input-strength[data-score="1"] .rui-password-input-strength-bar[data-filled="true"] { background: var(--rui-color-danger, #ef4444); }
.rui-password-input-strength[data-score="2"] .rui-password-input-strength-bar[data-filled="true"] { background: var(--rui-color-warning, #f59e0b); }
.rui-password-input-strength[data-score="3"] .rui-password-input-strength-bar[data-filled="true"] { background: color-mix(in srgb, var(--rui-color-success, #10b981) 70%, var(--rui-color-warning, #f59e0b)); }
.rui-password-input-strength[data-score="4"] .rui-password-input-strength-bar[data-filled="true"] { background: var(--rui-color-success, #10b981); }
.rui-password-input-strength-label {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  min-width: 60px;
  text-align: right;
}

.rui-tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  min-height: 40px;
}
.rui-tag-input[data-disabled="true"] { opacity: 0.6; }
.rui-tag-input:focus-within { border-color: var(--rui-color-primary); }
.rui-tag-input-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--rui-color-primary) 12%, transparent);
  color: var(--rui-color-primary);
  padding: 3px 4px 3px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
}
.rui-tag-input-remove {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font-size: 14px;
  padding: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.rui-tag-input-remove:hover { background: color-mix(in srgb, currentColor 20%, transparent); }
.rui-tag-input-field {
  flex: 1;
  min-width: 100px;
  border: 0;
  outline: 0;
  font: inherit;
  background: transparent;
  color: inherit;
  padding: 4px 6px;
}

.rui-mention-input {
  position: relative;
  display: flex;
  flex-direction: column;
}
.rui-mention-input[data-disabled="true"] { opacity: 0.6; }
.rui-mention-input-field {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  font: inherit;
  font-size: 14px;
  resize: vertical;
  outline: none;
}
.rui-mention-input-field:focus { border-color: var(--rui-color-primary); }
.rui-mention-input-suggestions {
  position: absolute;
  z-index: 50;
  left: 0;
  right: 0;
  top: 100%;
  margin-top: 4px;
  min-width: 220px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  box-shadow: var(--rui-shadow-md, 0 12px 32px rgba(0, 0, 0, 0.18));
  padding: 4px;
  display: none;
  flex-direction: column;
  gap: 1px;
  max-height: 220px;
  overflow: auto;
}
.rui-mention-input-suggestions[data-open="true"] { display: flex; }
.rui-mention-input-option {
  background: transparent;
  border: 0;
  text-align: left;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.rui-mention-input-option:hover,
.rui-mention-input-option[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-text);
}
.rui-mention-input-option-label { font-weight: 500; }
.rui-mention-input-option-handle {
  color: var(--rui-color-text-muted);
  font-size: 12px;
  font-family: var(--rui-font-family-mono);
}

/* Time / DateTime / Masked input ---------------------------------- */
.rui-time-picker,
.rui-datetime-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rui-time-picker-label,
.rui-datetime-picker-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-time-picker-input,
.rui-datetime-picker-input,
.rui-masked-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  font: inherit;
  font-size: 14px;
  outline: none;
}
.rui-time-picker-input:focus,
.rui-datetime-picker-input:focus,
.rui-masked-input:focus { border-color: var(--rui-color-primary); }

/* FormSection / FieldSet / ValidationSummary --------------------- */
.rui-form-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rui-form-section-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rui-form-section-label {
  font-weight: 700;
  font-size: 15px;
  margin: 0;
  color: var(--rui-color-text);
}
.rui-form-section-helper {
  font-size: 13px;
  color: var(--rui-color-text-muted);
  margin: 0;
}
.rui-form-section-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rui-fieldset {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  padding: 12px 16px 16px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-fieldset-legend {
  font-weight: 700;
  padding: 0 6px;
  font-size: 13px;
  color: var(--rui-color-text);
}
.rui-fieldset-helper {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  margin: 0;
}
.rui-validation-summary {
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--rui-color-danger, #ef4444) 30%, var(--rui-color-border));
  border-radius: var(--rui-radius-md, 8px);
  background: color-mix(in srgb, var(--rui-color-danger, #ef4444) 8%, var(--rui-color-surface, var(--rui-color-bg)));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rui-validation-summary[data-tone="warning"] {
  border-color: color-mix(in srgb, var(--rui-color-warning, #f59e0b) 30%, var(--rui-color-border));
  background: color-mix(in srgb, var(--rui-color-warning, #f59e0b) 8%, var(--rui-color-surface, var(--rui-color-bg)));
}
.rui-validation-summary-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  color: var(--rui-color-danger, #ef4444);
}
.rui-validation-summary[data-tone="warning"] .rui-validation-summary-title { color: var(--rui-color-warning, #f59e0b); }
.rui-validation-summary-icon { font-size: 16px; }
.rui-validation-summary-list {
  margin: 0;
  padding-left: 22px;
  color: var(--rui-color-text);
  font-size: 13.5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* MultiStepForm ------------------------------------------------ */
.rui-multi-step-form {
  display: grid;
  gap: 16px;
}
.rui-multi-step-form[data-layout="row"] {
  grid-template-columns: 1fr;
  grid-template-areas:
    "steps"
    "body"
    "footer";
}
.rui-multi-step-form[data-layout="column"] {
  grid-template-columns: 240px 1fr;
  grid-template-areas:
    "steps body"
    "steps footer";
  align-items: start;
}
.rui-multi-step-form > .rui-multi-step-form-steps { grid-area: steps; }
.rui-multi-step-form > .rui-multi-step-form-body { grid-area: body; }
.rui-multi-step-form > .rui-multi-step-form-footer { grid-area: footer; }
.rui-multi-step-form-steps {
  display: flex;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 3%, var(--rui-color-surface, #fff)));
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
}
.rui-multi-step-form-steps[data-layout="row"] { flex-direction: row; }
.rui-multi-step-form-steps[data-layout="column"] { flex-direction: column; }
.rui-multi-step-form-steps .rui-steps-item {
  flex: 1;
  padding: 12px 16px 12px 52px;
  position: relative;
  color: var(--rui-color-text-muted);
  font-size: 13px;
}
.rui-multi-step-form-steps[data-layout="row"] .rui-steps-item {
  border-right: 1px solid var(--rui-color-border);
}
.rui-multi-step-form-steps[data-layout="row"] .rui-steps-item:last-child { border-right: none; }
.rui-multi-step-form-steps[data-layout="column"] .rui-steps-item {
  border-bottom: 1px solid var(--rui-color-border);
}
.rui-multi-step-form-steps[data-layout="column"] .rui-steps-item:last-child { border-bottom: none; }
.rui-multi-step-form-steps .rui-steps-item::before {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  background: color-mix(in srgb, var(--rui-color-text) 12%, transparent);
  color: var(--rui-color-text-muted);
}
.rui-multi-step-form-steps[data-layout="column"] .rui-steps-item::before {
  top: 14px;
  transform: none;
}
.rui-multi-step-form-steps .rui-steps-item[data-active="true"]::before {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text, #fff);
}
.rui-multi-step-form-steps .rui-steps-item[data-complete="true"]::before {
  background: var(--rui-color-success, #10b981);
  color: #fff;
}
.rui-multi-step-form-steps .rui-steps-item .rui-steps-title {
  font-weight: 700;
  color: inherit;
  margin: 0;
  line-height: 1.2;
}
.rui-multi-step-form-steps .rui-steps-item .rui-steps-details {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  margin-top: 2px;
}
.rui-multi-step-form-steps .rui-steps-item[data-active="true"] {
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: var(--rui-color-primary);
}
.rui-multi-step-form-steps .rui-steps-item[data-complete="true"] {
  color: var(--rui-color-success, #10b981);
}
.rui-multi-step-form-steps .rui-steps-item[data-complete="true"] .rui-steps-title::before {
  content: "✓ ";
  margin-right: 2px;
}
.rui-multi-step-form-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rui-multi-step-form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--rui-color-border);
}
.rui-multi-step-form-progress {
  color: var(--rui-color-text-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 720px) {
  .rui-multi-step-form[data-layout="column"] {
    grid-template-columns: 1fr;
    grid-template-areas:
      "steps"
      "body"
      "footer";
  }
}

/* Advanced charts (Area/Gauge/Heatmap/Radar/Scatter/Histogram) -- */
.rui-chart { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.rui-chart-title { font-size: 13px; font-weight: 600; color: var(--rui-color-text); }
.rui-chart-svg { display: block; width: 100%; height: auto; }
.rui-chart-label { font-size: 11px; fill: var(--rui-color-text-muted, #64748b); }
.rui-chart-tick { font-size: 10.5px; fill: var(--rui-color-text-muted, #64748b); }
.rui-chart-empty {
  padding: 24px;
  text-align: center;
  color: var(--rui-color-text-muted);
  font-size: 13px;
}
.rui-chart-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--rui-color-text-muted);
}
.rui-chart-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rui-chart-legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.rui-area-chart,
.rui-radar-chart,
.rui-scatter-chart,
.rui-histogram { width: 100%; }

.rui-gauge {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
}
.rui-gauge[data-size="sm"] svg { max-width: 140px; }
.rui-gauge[data-size="md"] svg { max-width: 180px; }
.rui-gauge[data-size="lg"] svg { max-width: 220px; }
.rui-gauge-arc {
  transition: stroke-dasharray 400ms ease;
}
.rui-gauge-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--rui-color-text);
  margin-top: -6px;
}
.rui-gauge[data-tone="primary"] .rui-gauge-value { color: var(--rui-color-primary); }
.rui-gauge[data-tone="success"] .rui-gauge-value { color: var(--rui-color-success, #10b981); }
.rui-gauge[data-tone="warning"] .rui-gauge-value { color: var(--rui-color-warning, #f59e0b); }
.rui-gauge[data-tone="danger"] .rui-gauge-value { color: var(--rui-color-danger, #ef4444); }
.rui-gauge[data-tone="info"] .rui-gauge-value { color: var(--rui-color-info, #06b6d4); }
.rui-gauge-caption {
  font-size: 12px;
  color: var(--rui-color-text-muted);
}

.rui-heatmap { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.rui-heatmap-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rui-heatmap-row {
  display: grid;
  grid-template-columns: 56px repeat(var(--rui-heatmap-cols, 7), minmax(0, 1fr));
  gap: 4px;
}
.rui-heatmap-row-header { font-size: 11px; color: var(--rui-color-text-muted); }
.rui-heatmap-cell {
  padding: 8px 6px;
  border-radius: 4px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 3%, var(--rui-color-surface, #fff)));
  color: var(--rui-color-text);
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rui-heatmap-xlabel,
.rui-heatmap-ylabel {
  background: transparent;
  color: var(--rui-color-text-muted);
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.rui-heatmap-ylabel { justify-content: flex-start; padding-left: 0; }
.rui-heatmap-corner { background: transparent; }

/* Patterns: state cards, tour/spotlight, inbox, onboarding ----- */
.rui-loading-state,
.rui-error-state,
.rui-success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 40px 24px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
}
.rui-loading-state .rui-spinner { font-size: 32px; }
.rui-error-state-icon { color: var(--rui-color-danger, #ef4444); font-size: 36px; }
.rui-success-state-icon { color: var(--rui-color-success, #10b981); font-size: 36px; }
.rui-loading-state-title,
.rui-error-state-title,
.rui-success-state-title { font-size: 18px; font-weight: 700; margin: 0; color: var(--rui-color-text); }
.rui-loading-state-description,
.rui-error-state-description,
.rui-success-state-description { color: var(--rui-color-text-muted); margin: 0; max-width: 36em; line-height: 1.55; }
.rui-loading-state-actions,
.rui-error-state-actions,
.rui-success-state-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 4px; }

.rui-onboarding-checklist {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rui-onboarding-checklist-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rui-onboarding-checklist-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: var(--rui-color-text);
}
.rui-onboarding-checklist-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--rui-color-text-muted);
}
.rui-onboarding-checklist-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}
.rui-onboarding-checklist-bar {
  flex: 1;
  height: 6px;
  background: var(--rui-color-border);
  border-radius: 999px;
  overflow: hidden;
}
.rui-onboarding-checklist-fill {
  height: 100%;
  background: var(--rui-color-primary);
  transition: width 240ms ease;
}
.rui-onboarding-checklist-meta {
  font-size: 12px;
  color: var(--rui-color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rui-onboarding-checklist-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rui-onboarding-checklist-item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  transition: border-color 120ms ease;
}
.rui-onboarding-checklist-item:hover { border-color: color-mix(in srgb, var(--rui-color-primary) 30%, var(--rui-color-border)); }
.rui-onboarding-checklist-item[data-done="true"] .rui-onboarding-checklist-item-title {
  text-decoration: line-through;
  color: var(--rui-color-text-muted);
}
.rui-onboarding-checklist-marker {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--rui-color-text-muted);
  font-size: 14px;
}
.rui-onboarding-checklist-item[data-done="true"] .rui-onboarding-checklist-marker {
  background: var(--rui-color-success, #10b981);
  color: #fff;
}
.rui-onboarding-checklist-marker-icon { font-size: 14px; }
.rui-onboarding-checklist-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rui-onboarding-checklist-item-title { font-weight: 600; font-size: 14px; color: var(--rui-color-text); }
.rui-onboarding-checklist-item-description { font-size: 12.5px; color: var(--rui-color-text-muted); margin: 0; }

.rui-inbox-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rui-inbox-panel-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.rui-inbox-panel-mark-all {
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--rui-color-primary);
  font: inherit;
  font-size: 13px;
  padding: 0;
}
.rui-inbox-panel-mark-all:hover { text-decoration: underline; }
.rui-inbox-panel-empty {
  padding: 28px;
  text-align: center;
  color: var(--rui-color-text-muted);
  font-size: 13px;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 3%, var(--rui-color-surface, #fff)));
  border-radius: var(--rui-radius-md, 8px);
}
.rui-inbox-panel-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rui-inbox-panel-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
}
.rui-inbox-panel-group-count {
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  padding: 1px 8px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

/* Tour overlay + Spotlight overlay -------------------------------- */
.rui-tour {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 9100;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.rui-tour[data-open="true"] { display: flex; }
.rui-tour-card {
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  padding: 24px;
  box-shadow: var(--rui-shadow-md, 0 16px 40px rgba(0, 0, 0, 0.28));
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 460px;
  width: 100%;
}
.rui-tour-step {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-primary);
}
.rui-tour-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--rui-color-text);
}
.rui-tour-description {
  font-size: 14px;
  color: var(--rui-color-text-muted);
  line-height: 1.55;
  margin: 0;
}
.rui-tour-target {
  font-family: var(--rui-font-family-mono, monospace);
  font-size: 12px;
  padding: 6px 10px;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, #fff)));
  border-radius: 6px;
  color: var(--rui-color-text-muted);
  align-self: flex-start;
}
.rui-tour-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--rui-color-border);
}
.rui-tour-footer > .rui-button:first-child { margin-right: auto; }

.rui-spotlight {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9000;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.rui-spotlight[data-open="true"] { display: flex; }
.rui-spotlight-card {
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  padding: 22px 24px;
  box-shadow: var(--rui-shadow-md, 0 16px 40px rgba(0, 0, 0, 0.28));
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
  width: 100%;
}
.rui-spotlight-title { font-size: 16px; font-weight: 700; margin: 0; color: var(--rui-color-text); }
.rui-spotlight-description { font-size: 13.5px; color: var(--rui-color-text-muted); margin: 0; line-height: 1.55; }
.rui-spotlight-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }

/* Sticky / ResizablePanels / MasonryGrid / TopBar -------------- */
.rui-sticky {
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-resizable-panels {
  display: grid;
  grid-template-columns: var(--rui-resizable-primary, 40%) 6px 1fr;
  gap: 0;
  min-height: 280px;
  width: 100%;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-resizable-panel {
  overflow: auto;
  min-width: var(--rui-resizable-min, 240px);
  padding: 12px;
}
.rui-resizable-panel-secondary {
  border-left: 0;
}
.rui-resizable-divider {
  cursor: col-resize;
  background: var(--rui-color-border);
  width: 6px;
  position: relative;
  transition: background 120ms ease;
}
.rui-resizable-divider::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: var(--rui-color-text-muted);
  opacity: 0.5;
}
.rui-resizable-divider:hover,
.rui-resizable-divider:focus-visible { background: var(--rui-color-primary); outline: none; }

.rui-masonry-grid {
  column-count: var(--rui-masonry-columns, 3);
  column-gap: 12px;
}
.rui-masonry-grid[data-columns="1"] { --rui-masonry-columns: 1; }
.rui-masonry-grid[data-columns="2"] { --rui-masonry-columns: 2; }
.rui-masonry-grid[data-columns="3"] { --rui-masonry-columns: 3; }
.rui-masonry-grid[data-columns="4"] { --rui-masonry-columns: 4; }
.rui-masonry-grid[data-columns="5"] { --rui-masonry-columns: 5; }
.rui-masonry-grid[data-columns="6"] { --rui-masonry-columns: 6; }
.rui-masonry-grid[data-gap="xs"] { column-gap: 4px; }
.rui-masonry-grid[data-gap="s"] { column-gap: 8px; }
.rui-masonry-grid[data-gap="m"] { column-gap: 12px; }
.rui-masonry-grid[data-gap="l"] { column-gap: 16px; }
.rui-masonry-grid[data-gap="xl"] { column-gap: 24px; }
.rui-masonry-grid > * {
  display: inline-block;
  width: 100%;
  break-inside: avoid;
  margin-bottom: 12px;
}
@media (max-width: 720px) {
  .rui-masonry-grid { column-count: min(var(--rui-masonry-columns, 3), 2); }
}

.rui-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  flex-wrap: wrap;
}
.rui-topbar[data-sticky="true"] { position: sticky; top: 0; z-index: 30; border-radius: 0; border-left: 0; border-right: 0; }
.rui-topbar-side { display: flex; align-items: center; gap: 10px; min-width: 0; }
.rui-topbar-title-block { display: flex; flex-direction: column; gap: 2px; }
.rui-topbar-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--rui-color-text); }
.rui-topbar-subtitle { margin: 0; font-size: 12px; color: var(--rui-color-text-muted); }
.rui-topbar-center { flex: 1; min-width: 200px; justify-content: center; }
.rui-topbar-right { margin-left: auto; }

/* AppShell collapsible / mobile drawer ------------------------ */
.rui-app-shell-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 40;
  display: none;
}
.rui-app-shell-toggle {
  background: transparent;
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  padding: 4px 10px;
  cursor: pointer;
  color: inherit;
  display: none;
  align-items: center;
  justify-content: center;
}
@media (max-width: 720px) {
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }
  .rui-app-shell[data-collapsible="true"][data-sidebar-open="true"] .rui-app-shell-sidebar {
    transform: translateX(0);
  }
  .rui-app-shell[data-collapsible="true"][data-sidebar-open="true"] .rui-app-shell-scrim {
    display: block;
  }
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-toggle {
    display: inline-flex;
  }
}

/* Collapsed Sidebar (icon rail) ------------------------------ */
.rui-sidebar[data-collapsed="true"] { width: 64px; }
.rui-sidebar[data-collapsed="true"] .rui-sidebar-tagline,
.rui-sidebar[data-collapsed="true"] .rui-sidebar-section-label,
.rui-sidebar[data-collapsed="true"] .rui-sidebar-item-label,
.rui-sidebar[data-collapsed="true"] .rui-sidebar-item-badge { display: none; }
.rui-sidebar[data-collapsed="true"] .rui-sidebar-item { justify-content: center; }

/* New components (Tier 1–3) ----------------------------------- */
.rui-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: var(--rui-border-width) solid transparent;
  border-radius: var(--rui-radius-button);
  background: transparent;
  color: var(--rui-color-text);
  cursor: pointer;
  padding: 6px;
}
.rui-icon-button:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-icon-button:disabled { opacity: 0.5; cursor: not-allowed; }
.rui-icon-button[data-variant="primary"] { background: var(--rui-color-primary); color: var(--rui-color-primary-text); }
.rui-icon-button[data-size="sm"] { padding: 4px; }
.rui-icon-button[data-size="lg"] { padding: 10px; }

.rui-command-palette[data-open="false"] { display: none; }
.rui-command-palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 80;
}
.rui-command-palette-panel {
  position: fixed;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 32px));
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  z-index: 81;
  overflow: hidden;
}
.rui-command-palette-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--rui-color-border);
}
.rui-command-palette-input { flex: 1; border: 0; background: transparent; font: inherit; outline: none; }
.rui-command-palette-shortcut { font-size: 12px; color: var(--rui-color-text-muted); }
.rui-command-palette-list { max-height: 320px; overflow: auto; padding: 6px; }
.rui-command-palette-group {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--rui-color-text-muted);
  padding: 8px 8px 4px;
}
.rui-command-palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 0;
  background: transparent;
  border-radius: var(--rui-radius-sm);
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.rui-command-palette-item:hover { background: var(--rui-color-surface-muted); }
.rui-command-palette-item-kbd { font-size: 11px; color: var(--rui-color-text-muted); }
.rui-command-palette-empty { padding: 16px; text-align: center; color: var(--rui-color-text-muted); }

.rui-filter-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rui-filter-chips-row { display: flex; flex-wrap: wrap; gap: 6px; }
.rui-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-primary) 12%, transparent);
  border: 1px solid var(--rui-color-border);
  font-size: 13px;
}
.rui-filter-chip-remove {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0 2px;
  color: var(--rui-color-text-muted);
}
.rui-filter-chips-clear {
  border: 0;
  background: transparent;
  color: var(--rui-color-primary);
  cursor: pointer;
  font-size: 13px;
}

.rui-field-repeater { display: flex; flex-direction: column; gap: 12px; }
.rui-field-repeater-row {
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  padding: 12px;
  background: var(--rui-color-surface);
}
.rui-field-repeater-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.rui-field-repeater-label { display: block; font-size: 12px; color: var(--rui-color-text-muted); margin-bottom: 4px; }
.rui-field-repeater-remove { margin-top: 8px; }

.rui-virtual-list-scroller { position: relative; overflow: auto; border: 1px solid var(--rui-color-border); border-radius: var(--rui-radius-md); }
.rui-virtual-list-item {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--rui-color-border);
  box-sizing: border-box;
}

.rui-query-builder { display: flex; flex-direction: column; gap: 8px; }
.rui-query-builder-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rui-query-builder-remove,
.rui-query-builder-add {
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface);
  border-radius: var(--rui-radius-sm);
  padding: 6px 10px;
  cursor: pointer;
}

.rui-diff-viewer { border: 1px solid var(--rui-color-border); border-radius: var(--rui-radius-md); overflow: hidden; font-family: var(--rui-font-family-mono, monospace); font-size: 12px; }
.rui-diff-viewer-panes { display: grid; grid-template-columns: 1fr 1fr; }
.rui-diff-viewer-pane { margin: 0; padding: 12px; overflow: auto; max-height: 320px; }
.rui-diff-viewer-left { border-right: 1px solid var(--rui-color-border); background: color-mix(in srgb, var(--rui-color-danger) 6%, var(--rui-color-surface)); }
.rui-diff-viewer-right { background: color-mix(in srgb, var(--rui-color-success) 6%, var(--rui-color-surface)); }
.rui-diff-viewer-unified { margin: 0; padding: 12px; max-height: 320px; overflow: auto; }
.rui-diff-line-add { background: color-mix(in srgb, var(--rui-color-success) 12%, transparent); }
.rui-diff-line-remove { background: color-mix(in srgb, var(--rui-color-danger) 12%, transparent); }

.rui-json-tree { font-family: var(--rui-font-family-mono, monospace); font-size: 12px; }
.rui-json-tree-toggle {
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: var(--rui-color-text);
  padding: 2px 0;
}
.rui-json-tree-children[data-open="false"] { display: none; }
.rui-json-tree-row { padding-left: 12px; }
.rui-json-tree-key { color: var(--rui-color-primary); }
.rui-json-tree-leaf { color: var(--rui-color-text-muted); }

.rui-gantt { border: 1px solid var(--rui-color-border); border-radius: var(--rui-radius-md); overflow: hidden; }
.rui-gantt-row { display: grid; grid-template-columns: 140px 1fr; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--rui-color-border); }
.rui-gantt-label { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rui-gantt-bars { position: relative; height: 24px; background: var(--rui-color-surface-muted); border-radius: var(--rui-radius-sm); }
.rui-gantt-bar {
  position: absolute;
  top: 4px;
  height: 16px;
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-primary);
  overflow: hidden;
}
.rui-gantt-bar-progress { height: 100%; background: color-mix(in srgb, #000 25%, var(--rui-color-primary)); }

.rui-truncate-text { margin: 0; }
.rui-truncate-toggle {
  border: 0;
  background: transparent;
  color: var(--rui-color-primary);
  cursor: pointer;
  padding: 4px 0;
  font-size: 13px;
}

.rui-inline-edit { display: inline-flex; flex-direction: column; gap: 4px; }
.rui-inline-edit-display {
  border: 1px dashed var(--rui-color-border);
  background: transparent;
  border-radius: var(--rui-radius-sm);
  padding: 4px 8px;
  cursor: text;
  font: inherit;
  color: inherit;
  text-align: left;
}
.rui-inline-edit-input { display: none; }
.rui-inline-edit[data-editing="true"] .rui-inline-edit-display { display: none; }
.rui-inline-edit[data-editing="true"] .rui-inline-edit-input { display: block; }

.rui-notification-bell { position: relative; display: inline-block; width: 30px; }
.rui-notification-bell-trigger {
  position: relative;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 6px;
  color: inherit;
}
.rui-notification-bell-badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--rui-color-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rui-notification-bell-panel {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: min(320px, 80vw);
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  z-index: 40;
  max-height: 360px;
  overflow: auto;
}
.rui-notification-bell[data-open="true"] .rui-notification-bell-panel { display: block; }
.rui-notification-bell-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--rui-color-border);
}
.rui-notification-bell-item-title { font-weight: 600; font-size: 13px; }
.rui-notification-bell-item-message,
.rui-notification-bell-item-time { font-size: 12px; color: var(--rui-color-text-muted); }
.rui-notification-bell-empty { padding: 16px; text-align: center; color: var(--rui-color-text-muted); }
.rui-select-searchable { width: 100%; }

/* Lightbox thumbnail ------------------------------------------------- */
.rui-lightbox-thumb {
  display: inline-block;
  padding: 0;
  border: 1px solid var(--rui-color-border);
  background: var(--rui-color-surface);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  cursor: zoom-in;
  max-width: 240px;
}
.rui-lightbox-thumb img { display: block; width: 100%; height: auto; }
.rui-lightbox-thumb:hover { border-color: var(--rui-color-primary); }
`;
