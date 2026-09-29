/**
 * Aktion DevTools — the component kit.
 *
 * Small pure functions returning vnodes, so every view speaks one visual
 * language without a component framework. Nothing here reads the model or the
 * app record; a kit function is given everything it draws.
 *
 * Conventions that keep the views consistent:
 *
 *   - Every interactive element gets a text label — visible, or as
 *     `aria-label` + tooltip for icon-only buttons. The DevTools audits other
 *     people's accessibility; it has no excuse for failing its own.
 *   - `data-tip` is the one tooltip mechanism (the shell renders it), so
 *     tooltips look and behave the same everywhere and never outlive a
 *     re-render.
 *   - `testid` becomes `data-dt`, the stable hook the test-suite and the
 *     end-to-end checks query by. Class names are styling, not API.
 */

import { h, type Child, type Props, type VElement, type VNode } from "../core/vdom.js";
import { icon, type IconName } from "./icons.js";

export type Tone = "grey" | "green" | "amber" | "red" | "blue" | "cyan" | "purple" | "pink" | "orange" | "teal" | "accent";

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                    */
/* -------------------------------------------------------------------------- */

export interface ButtonOptions {
  label?: Child;
  icon?: IconName;
  onClick?: (event: MouseEvent) => void;
  variant?: "default" | "primary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  active?: boolean;
  disabled?: boolean;
  /** Tooltip; also the accessible description. */
  tip?: string;
  /** Keyboard shortcut shown in the tooltip. */
  kbd?: string;
  testid?: string;
  /** Extra attributes (aria-*, type, …). */
  attrs?: Props;
  trailing?: Child;
}

export function button(options: ButtonOptions): VElement {
  const cls = [
    "btn",
    options.variant && options.variant !== "default" ? `is-${options.variant}` : "",
    options.size && options.size !== "md" ? `is-${options.size}` : "",
    options.active ? "is-on" : "",
  ];
  return h(
    "button",
    {
      type: "button",
      class: cls,
      disabled: options.disabled || undefined,
      "data-tip": options.tip,
      "data-kbd": options.kbd,
      "data-dt": options.testid,
      "aria-pressed": options.active === undefined ? undefined : options.active,
      onClick: options.onClick,
      ...options.attrs,
    },
    options.icon ? icon(options.icon, { size: options.size === "sm" ? 13 : 14 }) : null,
    options.label ?? null,
    options.trailing ?? null,
  );
}

export interface IconButtonOptions {
  icon: IconName;
  /** Required: an icon button's only name. */
  label: string;
  onClick?: (event: MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  size?: "sm" | "md" | "lg";
  kbd?: string;
  testid?: string;
  dot?: boolean;
  attrs?: Props;
}

export function iconButton(options: IconButtonOptions): VElement {
  const size = options.size ?? "md";
  return h(
    "button",
    {
      type: "button",
      class: ["ibtn", size !== "md" ? `is-${size}` : "", options.active ? "is-on" : "", options.danger ? "is-danger" : ""],
      "aria-label": options.label,
      "data-tip": options.label,
      "data-kbd": options.kbd,
      "data-dt": options.testid,
      "aria-pressed": options.active === undefined ? undefined : options.active,
      disabled: options.disabled || undefined,
      onClick: options.onClick,
      ...options.attrs,
    },
    icon(options.icon, { size: size === "sm" ? 13 : size === "lg" ? 17 : 15 }),
    options.dot ? h("span", { class: "dot" }) : null,
  );
}

/* -------------------------------------------------------------------------- */
/*  Selection controls                                                         */
/* -------------------------------------------------------------------------- */

export interface Choice<T extends string> {
  value: T;
  label: Child;
  icon?: IconName;
  count?: number | string | null;
  tip?: string;
  tone?: Tone;
  testid?: string;
}

/** A segmented control — the sub-view switcher of every section. */
export function segmented<T extends string>(
  choices: ReadonlyArray<Choice<T>>,
  value: T,
  onChange: (value: T) => void,
  options: { label?: string; testid?: string } = {},
): VElement {
  return h(
    "div",
    { class: "seg", role: "tablist", "aria-label": options.label, "data-dt": options.testid },
    ...choices.map((choice) =>
      h(
        "button",
        {
          key: choice.value,
          type: "button",
          role: "tab",
          class: choice.value === value ? "is-on" : "",
          "aria-selected": choice.value === value,
          "data-tip": choice.tip,
          "data-dt": choice.testid ?? `seg-${choice.value}`,
          onClick: () => onChange(choice.value),
        },
        choice.icon ? icon(choice.icon, { size: 13 }) : null,
        choice.label,
        choice.count !== undefined && choice.count !== null && choice.count !== 0
          ? h("span", { class: "seg-count" }, String(choice.count))
          : null,
      ),
    ),
  );
}

/** Underlined tabs — for detail panes. */
export function tabs<T extends string>(
  choices: ReadonlyArray<Choice<T>>,
  value: T,
  onChange: (value: T) => void,
  options: { label?: string; trailing?: Child } = {},
): VElement {
  return h(
    "div",
    { class: "tabs", role: "tablist", "aria-label": options.label },
    ...choices.map((choice) =>
      h(
        "button",
        {
          key: choice.value,
          type: "button",
          role: "tab",
          class: choice.value === value ? "is-on" : "",
          "aria-selected": choice.value === value,
          "data-tip": choice.tip,
          "data-dt": choice.testid ?? `tab-${choice.value}`,
          onClick: () => onChange(choice.value),
        },
        choice.icon ? icon(choice.icon, { size: 13 }) : null,
        choice.label,
        choice.count !== undefined && choice.count !== null && choice.count !== 0
          ? h("span", { class: ["tab-count", choice.tone ? `t-${choice.tone}` : ""] }, String(choice.count))
          : null,
      ),
    ),
    options.trailing ? h("span", { class: "grow" }) : null,
    options.trailing ?? null,
  );
}

/** A pill-shaped filter toggle. */
export function filterChip(options: {
  label: Child;
  on: boolean;
  onToggle: () => void;
  count?: number;
  swatch?: string;
  tip?: string;
  testid?: string;
}): VElement {
  return h(
    "button",
    {
      type: "button",
      class: ["fchip", options.on ? "is-on" : ""],
      "aria-pressed": options.on,
      "data-tip": options.tip,
      "data-dt": options.testid,
      onClick: options.onToggle,
    },
    options.swatch ? h("span", { class: "swatch", style: { background: options.swatch } }) : null,
    options.label,
    options.count !== undefined ? h("span", { class: "fcount" }, String(options.count)) : null,
  );
}

/** An on/off switch with an optional label and description. */
export function toggleSwitch(options: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: Child;
  testid?: string;
  disabled?: boolean;
}): VElement {
  return h(
    "label",
    { class: "switch", "data-dt": options.testid },
    h("input", {
      type: "checkbox",
      role: "switch",
      checked: options.checked,
      disabled: options.disabled || undefined,
      onChange: (event: Event) => options.onChange((event.target as HTMLInputElement).checked),
    }),
    h("span", { class: "track", "aria-hidden": "true" }),
    options.label ? h("span", { class: "switch-label" }, options.label) : null,
  );
}

export function checkbox(options: { checked: boolean; onChange: (checked: boolean) => void; label: Child; testid?: string }): VElement {
  return h(
    "label",
    { class: "check", "data-dt": options.testid },
    h("input", {
      type: "checkbox",
      checked: options.checked,
      onChange: (event: Event) => options.onChange((event.target as HTMLInputElement).checked),
    }),
    options.label,
  );
}

/* -------------------------------------------------------------------------- */
/*  Text inputs                                                                */
/* -------------------------------------------------------------------------- */

export interface SearchOptions {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  /** Right-aligned meta (match count). */
  meta?: string;
  testid?: string;
  onKeyDown?: (event: KeyboardEvent) => void;
  width?: string;
}

/** The search field every list has. `/` focuses the first one in the view. */
export function searchField(options: SearchOptions): VElement {
  return h(
    "div",
    { class: "search", style: options.width ? { flexBasis: options.width } : undefined },
    icon("search", { size: 13 }),
    h("input", {
      class: "input",
      type: "search",
      "data-search": "",
      "data-dt": options.testid,
      placeholder: options.placeholder ?? "Filter…",
      "aria-label": options.placeholder ?? "Filter",
      spellcheck: "false",
      autocomplete: "off",
      value: options.value,
      onInput: (event: Event) => options.onInput((event.target as HTMLInputElement).value),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Escape" && options.value !== "") {
          event.stopPropagation();
          options.onInput("");
        }
        options.onKeyDown?.(event);
      },
    }),
    options.meta ? h("span", { class: "search-meta" }, options.meta) : null,
    options.value
      ? iconButton({ icon: "close", label: "Clear filter", size: "sm", onClick: () => options.onInput(""), attrs: { class: "ibtn is-sm search-clear" } })
      : null,
  );
}

export interface FieldOptions {
  value: string;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  width?: string;
  label?: string;
  testid?: string;
  type?: string;
  /** Every keystroke. */
  onInput?: (value: string) => void;
  /** Enter (and blur, when `commitOnBlur`). */
  onCommit?: (value: string) => void;
  commitOnBlur?: boolean;
  onKeyDown?: (event: KeyboardEvent) => void;
  attrs?: Props;
}

/** A single-line input. Controlled when `onInput` is given. */
export function field(options: FieldOptions): VElement {
  return h("input", {
    class: ["input", options.mono ? "is-mono" : "", options.invalid ? "is-invalid" : ""],
    type: options.type ?? "text",
    value: options.value,
    placeholder: options.placeholder,
    "aria-label": options.label ?? options.placeholder,
    "aria-invalid": options.invalid || undefined,
    "data-dt": options.testid,
    spellcheck: "false",
    autocomplete: "off",
    style: options.width ? { width: options.width } : undefined,
    onInput: options.onInput ? (event: Event) => options.onInput!((event.target as HTMLInputElement).value) : undefined,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" && options.onCommit) {
        event.preventDefault();
        options.onCommit((event.target as HTMLInputElement).value);
      }
      options.onKeyDown?.(event);
    },
    onChange: options.commitOnBlur && options.onCommit
      ? (event: Event) => options.onCommit!((event.target as HTMLInputElement).value)
      : undefined,
    ...options.attrs,
  });
}

export function textarea(options: {
  value: string;
  onInput: (value: string) => void;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  testid?: string;
  label?: string;
  onKeyDown?: (event: KeyboardEvent) => void;
}): VElement {
  return h("textarea", {
    class: ["textarea", options.mono ? "is-mono" : "", options.invalid ? "is-invalid" : ""],
    rows: options.rows ?? 6,
    value: options.value,
    placeholder: options.placeholder,
    "aria-label": options.label ?? options.placeholder,
    "data-dt": options.testid,
    spellcheck: "false",
    onInput: (event: Event) => options.onInput((event.target as HTMLTextAreaElement).value),
    onKeyDown: options.onKeyDown,
  });
}

export function select<T extends string>(options: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  testid?: string;
  width?: string;
}): VElement {
  return h(
    "select",
    {
      class: "select",
      value: options.value,
      "aria-label": options.label,
      "data-dt": options.testid,
      style: options.width ? { width: options.width } : undefined,
      onChange: (event: Event) => options.onChange((event.target as HTMLSelectElement).value as T),
    },
    ...options.options.map((option) => h("option", { key: option.value, value: option.value }, option.label)),
  );
}

/* -------------------------------------------------------------------------- */
/*  Display                                                                    */
/* -------------------------------------------------------------------------- */

export function chip(label: Child, tone: Tone = "grey", options: { tip?: string; icon?: IconName; mono?: boolean; outline?: boolean; onClick?: () => void; testid?: string } = {}): VElement {
  const cls = ["chip", tone !== "grey" ? `t-${tone}` : "", options.mono ? "is-mono" : "", options.outline ? "is-outline" : ""];
  return h(
    options.onClick ? "button" : "span",
    {
      class: cls,
      type: options.onClick ? "button" : undefined,
      "data-tip": options.tip,
      "data-dt": options.testid,
      onClick: options.onClick,
    },
    options.icon ? icon(options.icon, { size: 11 }) : null,
    label,
  );
}

export function badge(value: number | string, tone: "grey" | "red" | "amber" | "accent" | "green" = "grey"): VElement {
  const text = typeof value === "number" && value > 999 ? "999+" : String(value);
  return h("span", { class: ["badge", tone !== "grey" ? `t-${tone}` : ""] }, text);
}

export function kbd(keys: string): VElement {
  return h("span", { class: "kbd" }, keys);
}

/** Keyboard combo `⌘ K` → two keycaps. */
export function keys(combo: string): VElement {
  return h("span", { class: "row-flex", style: { gap: "3px" } }, ...combo.split(/\s+/).filter(Boolean).map((k) => kbd(k)));
}

export function spinner(): VElement {
  return h("span", { class: "spinner", role: "status", "aria-label": "Loading" });
}

export interface StatOptions {
  label: string;
  value: Child;
  unit?: string;
  foot?: Child;
  tone?: "green" | "amber" | "red" | "accent";
  tip?: string;
  onClick?: () => void;
  icon?: IconName;
  spark?: VNode | null;
  testid?: string;
}

/** One headline number. Clickable stats navigate to the view that explains them. */
export function stat(options: StatOptions): VElement {
  return h(
    options.onClick ? "button" : "div",
    {
      class: ["stat", options.tone ? `t-${options.tone}` : ""],
      type: options.onClick ? "button" : undefined,
      "data-tip": options.tip,
      "data-dt": options.testid,
      onClick: options.onClick,
    },
    h("span", { class: "stat-label" }, options.icon ? icon(options.icon, { size: 11 }) : null, options.label),
    h("span", { class: "stat-main" },
      h("span", { class: "stat-value" }, options.value, options.unit ? h("small", {}, options.unit) : null),
      options.spark ? h("span", { class: "spark" }, options.spark) : null),
    options.foot !== undefined ? h("span", { class: "stat-foot" }, options.foot) : null,
  );
}

export function statGrid(...stats: Child[]): VElement {
  return h("div", { class: "grid-stats" }, ...stats);
}

export function meter(fraction: number, tone?: "green" | "amber" | "red" | "cyan"): VElement {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return h("span", { class: ["meter", tone ? `t-${tone}` : ""], role: "presentation" }, h("span", { style: { width: `${(pct * 100).toFixed(1)}%` } }));
}

export function emptyState(options: { icon?: IconName; title: string; body?: Child; actions?: Child[]; testid?: string }): VElement {
  return h(
    "div",
    { class: "empty", "data-dt": options.testid ?? "empty" },
    h("div", { class: "empty-art" }, icon(options.icon ?? "inbox", { size: 22 })),
    h("div", { class: "empty-title" }, options.title),
    options.body ? h("div", { class: "empty-body" }, options.body) : null,
    options.actions && options.actions.length > 0 ? h("div", { class: "empty-actions" }, ...options.actions) : null,
  );
}

export function note(tone: "info" | "warn" | "error" | "good" | "accent" | "plain", body: Child, options: { icon?: IconName; testid?: string; actions?: Child } = {}): VElement {
  const glyph: IconName = options.icon ?? (tone === "warn" ? "warning" : tone === "error" ? "error" : tone === "good" ? "checkCircle" : tone === "accent" ? "sparkles" : "info");
  return h(
    "div",
    { class: ["note", tone !== "plain" ? `t-${tone}` : ""], "data-dt": options.testid, role: tone === "error" ? "alert" : undefined },
    icon(glyph, { size: 14 }),
    h("div", { class: "grow" }, body),
    options.actions ?? null,
  );
}

export function kv(rows: ReadonlyArray<readonly [string, Child] | null | false>): VElement {
  const out: Child[] = [];
  for (const row of rows) {
    if (!row) continue;
    out.push(h("dt", {}, row[0]), h("dd", {}, row[1]));
  }
  return h("dl", { class: "kv" }, ...out);
}

export function card(options: {
  title?: Child;
  icon?: IconName;
  sub?: Child;
  actions?: Child[];
  body: Child;
  flush?: boolean;
  testid?: string;
  className?: string;
}): VElement {
  return h(
    "section",
    { class: ["card", options.className ?? ""], "data-dt": options.testid },
    options.title !== undefined || options.actions
      ? h(
          "div",
          { class: "card-head" },
          options.title !== undefined
            ? h("h3", { class: "card-title", style: { margin: "0" } }, options.icon ? icon(options.icon, { size: 14 }) : null, options.title)
            : null,
          options.sub ? h("span", { class: "card-sub" }, options.sub) : null,
          h("span", { class: "grow" }),
          ...(options.actions ?? []),
        )
      : null,
    h("div", { class: ["card-body", options.flush ? "is-flush" : ""] }, options.body),
  );
}

export function section(title: Child, body: Child, options: { actions?: Child[]; testid?: string; icon?: IconName } = {}): VElement {
  return h(
    "section",
    { class: "section", "data-dt": options.testid },
    h(
      "div",
      { class: "section-head" },
      h("h3", { class: "section-title", style: { margin: "0" } }, options.icon ? icon(options.icon, { size: 12 }) : null, title),
      h("span", { class: "grow" }),
      ...(options.actions ?? []),
    ),
    body,
  );
}

/** The strip at the top of a view. */
export function viewbar(...children: Child[]): VElement {
  return h("div", { class: "viewbar", role: "toolbar" }, ...children);
}

export function subbar(...children: Child[]): VElement {
  return h("div", { class: "viewbar is-sub", role: "toolbar" }, ...children);
}

export function spacer(): VElement {
  return h("span", { class: "grow" });
}

export function vsep(): VElement {
  return h("span", { class: "vb-sep", "aria-hidden": "true" });
}

export function tip(text: string, kbdHint?: string): Props {
  return { "data-tip": text, "data-kbd": kbdHint };
}

/* -------------------------------------------------------------------------- */
/*  Small charts                                                               */
/* -------------------------------------------------------------------------- */

/** A tiny line chart. `values` oldest first. */
export function sparkline(values: ReadonlyArray<number>, options: { width?: number; height?: number; color?: string; fill?: boolean; max?: number } = {}): VElement {
  const width = options.width ?? 64;
  const height = options.height ?? 20;
  const color = options.color ?? "var(--dt-accent)";
  if (values.length < 2) {
    return h("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" },
      h("line", { x1: 0, y1: height - 1, x2: width, y2: height - 1, stroke: "var(--dt-border-strong)", "stroke-width": "1" }));
  }
  const max = Math.max(options.max ?? 0, ...values, 1e-9);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => [i * step, height - 1.5 - (Math.max(0, v) / max) * (height - 3)] as const);
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return h(
    "svg",
    { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", style: { overflow: "visible" } },
    options.fill !== false
      ? h("path", { d: `${d}L${width} ${height}L0 ${height}Z`, fill: color, opacity: "0.14", stroke: "none" })
      : null,
    h("path", { d, fill: "none", stroke: color, "stroke-width": "1.5", "stroke-linejoin": "round", "stroke-linecap": "round" }),
  );
}

/** A tiny bar chart. */
export function microBars(values: ReadonlyArray<number>, options: { width?: number; height?: number; color?: string; highlight?: (v: number) => string | null } = {}): VElement {
  const width = options.width ?? 80;
  const height = options.height ?? 22;
  const n = Math.max(1, values.length);
  const gap = n > 40 ? 0.5 : 1;
  const bw = Math.max(1, width / n - gap);
  const max = Math.max(...values, 1e-9);
  return h(
    "svg",
    { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" },
    ...values.map((v, i) => {
      const bh = Math.max(1, (v / max) * height);
      return h("rect", {
        key: i, x: (i * (width / n)).toFixed(1), y: (height - bh).toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: "1",
        fill: options.highlight?.(v) ?? options.color ?? "var(--dt-accent)",
      });
    }),
  );
}

/** A score ring (0–100), Lighthouse-style. */
export function scoreRing(score: number | null, options: { size?: number; label?: string } = {}): VElement {
  const size = options.size ?? 64;
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = score === null ? 0 : Math.max(0, Math.min(100, score));
  const color = score === null ? "var(--dt-text-4)" : value >= 90 ? "var(--dt-green)" : value >= 50 ? "var(--dt-amber)" : "var(--dt-red)";
  return h(
    "div",
    { class: "score-ring", style: { width: `${size}px`, height: `${size}px` }, role: "img", "aria-label": `${options.label ?? "Score"}: ${score === null ? "not run" : Math.round(value)}` },
    h(
      "svg",
      { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" },
      h("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--dt-bg-active)", "stroke-width": stroke }),
      h("circle", {
        cx: size / 2, cy: size / 2, r, fill: "none", stroke: color, "stroke-width": stroke, "stroke-linecap": "round",
        "stroke-dasharray": `${((value / 100) * c).toFixed(2)} ${c.toFixed(2)}`,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
        style: { transition: "stroke-dasharray 600ms var(--dt-ease)" },
      }),
    ),
    h("span", { class: "score-num", style: { color } }, score === null ? "–" : String(Math.round(value))),
  );
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function fmtMs(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  if (n >= 60_000) return `${Math.floor(n / 60_000)}m ${Math.round((n % 60_000) / 1000)}s`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 1 : 2)}s`;
  if (n >= 100) return `${n.toFixed(0)}ms`;
  if (n >= 10) return `${n.toFixed(1)}ms`;
  if (n >= 1) return `${n.toFixed(2)}ms`;
  if (n === 0) return "0ms";
  return `${(n * 1000).toFixed(0)}µs`;
}

export function fmtBytes(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

export function fmtPct(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function fmtClock(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** "3s ago", "2m ago" — relative to `now`. */
export function fmtAgo(ms: number, now: number): string {
  const delta = Math.max(0, now - ms);
  if (delta < 1000) return "just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

/** Shorten from the middle — URLs and keys carry their meaning at both ends. */
export function truncateMiddle(text: string, limit = 60): string {
  if (text.length <= limit) return text;
  const head = Math.ceil((limit - 1) / 2);
  const tail = Math.floor((limit - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtCount(n)} ${n === 1 ? one : many}`;
}

/**
 * Plain text with `backtick` spans rendered as inline code — audit messages
 * are written that way. An unmatched backtick stays literal.
 */
export function richText(text: string): Child[] {
  const parts = text.split("`");
  if (parts.length % 2 === 0) parts.splice(parts.length - 2, 2, `${parts[parts.length - 2]}\`${parts[parts.length - 1]}`);
  const out: Child[] = [];
  parts.forEach((part, i) => {
    if (part === "") return;
    out.push(i % 2 === 1 ? h("code", {}, part) : part);
  });
  return out;
}

/** Highlight `query` inside `text` (case-insensitive), for search results. */
export function highlightMatch(text: string, query: string): Child {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const index = text.toLowerCase().indexOf(q);
  if (index < 0) return text;
  return [text.slice(0, index), h("mark", { class: "hl" }, text.slice(index, index + q.length)), text.slice(index + q.length)];
}

/* -------------------------------------------------------------------------- */
/*  Clipboard + download                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Copy to the clipboard, falling back to a hidden textarea. The panel runs in an
 * arbitrary page, so the async Clipboard API may be missing (insecure context)
 * or refused (no permission) — a copy button that silently does nothing then
 * is worse than one that uses the older command.
 */
export function copyText(text: string): Promise<boolean> {
  const clipboard = (typeof navigator !== "undefined" ? navigator : undefined) as
    | (Navigator & { clipboard?: { writeText(t: string): Promise<void> } })
    | undefined;
  if (clipboard?.clipboard?.writeText) {
    return clipboard.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Offer `text` as a download. The URL is revoked later: some browsers cancel a download revoked in the same task. */
export function downloadText(filename: string, text: string, mime = "application/json"): void {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    /* download unavailable — every download button has a copy sibling */
  }
}
