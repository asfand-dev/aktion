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
  line-height: 1.5;
  font-size: 14px;
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
  --rui-color-success: #10b981;
  --rui-color-warning: #f59e0b;
  --rui-color-danger: #ef4444;
  --rui-color-info: #06b6d4;
  --rui-font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --rui-radius-sm: 6px;
  --rui-radius-md: 10px;
  --rui-radius-lg: 16px;
  --rui-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --rui-shadow-md: 0 6px 24px rgba(15, 23, 42, 0.08);
  --rui-spacing-xs: 4px;
  --rui-spacing-s: 8px;
  --rui-spacing-m: 12px;
  --rui-spacing-l: 20px;
  --rui-spacing-xl: 32px;
}

* { box-sizing: border-box; }
button { font-family: inherit; font-size: inherit; cursor: pointer; }
input, textarea, select, button { color: inherit; font-family: inherit; }

/* Opt-in: render the host with no background so it inherits the parent
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
.rui-stack[data-wrap="true"] { flex-wrap: wrap; }
.rui-stack[data-direction="row"] > * { flex: 1 1 auto; min-width: 0; }

/* Section */
.rui-section { display: flex; flex-direction: column; gap: var(--rui-spacing-s); }
.rui-section-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--rui-color-text); }

/* Card */
.rui-card {
  background: var(--rui-color-surface);
  border: 1px solid var(--rui-color-border);
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
.rui-card-title { margin: 0; font-size: 16px; font-weight: 600; }
.rui-card-subtitle { margin: 0; color: var(--rui-color-text-muted); font-size: 13px; }
.rui-card-body { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-card-footer { display: flex; gap: var(--rui-spacing-s); justify-content: flex-end; flex-wrap: wrap; }

/* Header */
.rui-header { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-header-title { margin: 0; font-size: 22px; font-weight: 700; line-height: 1.2; }
.rui-header-subtitle { margin: 0; color: var(--rui-color-text-muted); font-size: 14px; }

/* Text */
.rui-text { display: inline; }
.rui-text[data-variant="small"] { font-size: 12px; color: var(--rui-color-text-muted); }
.rui-text[data-variant="small-heavy"] { font-size: 12px; font-weight: 600; }
.rui-text[data-variant="body"] { font-size: 14px; }
.rui-text[data-variant="body-heavy"] { font-size: 14px; font-weight: 600; }
.rui-text[data-variant="large"] { font-size: 18px; }
.rui-text[data-variant="large-heavy"] { font-size: 22px; font-weight: 700; display: block; }
.rui-text[data-variant="heading"] { font-size: 20px; font-weight: 700; display: block; }
.rui-text[data-variant="title"] { font-size: 28px; font-weight: 700; display: block; line-height: 1.2; }
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
  color: var(--rui-color-primary);
  text-decoration: none;
  font-weight: 500;
  word-break: break-word;
}
.rui-link:hover { text-decoration: underline; }

/* Badge & Tag */
.rui-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
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
  border-radius: 999px;
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
.rui-divider { border: none; height: 1px; background: var(--rui-color-border); margin: var(--rui-spacing-s) 0; }
.rui-divider-with-label {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  height: auto;
  background: none;
}
.rui-divider-line { flex: 1; height: 1px; background: var(--rui-color-border); }
.rui-divider-label { color: var(--rui-color-text-muted); font-size: 12px; }

/* Separator */
.rui-separator {
  background: var(--rui-color-border);
  flex-shrink: 0;
}
.rui-separator[data-orientation="horizontal"] {
  width: 100%;
  height: 1px;
  margin: var(--rui-spacing-s) 0;
}
.rui-separator[data-orientation="vertical"] {
  width: 1px;
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
  display: inline-flex;
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
.rui-modal-title { margin: 0; font-size: 18px; }

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
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
  padding: 8px 12px;
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  font: inherit;
}
.rui-input:focus, .rui-select:focus, .rui-textarea:focus {
  outline: none;
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 22%, transparent);
}
.rui-textarea { min-height: 80px; resize: vertical; }

.rui-checkbox, .rui-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  cursor: pointer;
  font-size: 14px;
}
.rui-radio-group { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }

.rui-button {
  border: 1px solid transparent;
  border-radius: var(--rui-radius-sm);
  padding: 8px 14px;
  font-weight: 600;
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.rui-button:hover:not(:disabled) { background: var(--rui-color-primary-hover); }
.rui-button:disabled { opacity: 0.5; cursor: not-allowed; }
.rui-button[data-variant="secondary"] { background: var(--rui-color-surface); color: var(--rui-color-text); border-color: var(--rui-color-border); }
.rui-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-button[data-variant="ghost"] { background: transparent; color: var(--rui-color-text); }
.rui-button[data-variant="ghost"]:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-button[data-variant="danger"] { background: var(--rui-color-danger); color: #fff; }
.rui-button[data-variant="danger"]:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-danger) 80%, black); }
.rui-button[data-size="small"] { padding: 4px 10px; font-size: 12px; }
.rui-button[data-size="large"] { padding: 12px 18px; font-size: 16px; }

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
.rui-stat-label { color: var(--rui-color-text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
.rui-stat-value { font-size: 24px; font-weight: 700; }
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
.rui-chart-svg text { fill: var(--rui-color-text-muted); font-size: 11px; font-family: var(--rui-font-family); }
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
  .rui-stack[data-direction="row"]:not([data-wrap="true"]) {
    flex-direction: column;
    align-items: stretch;
  }
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
`;
