/**
 * Theme — a live editor for the design tokens every component reads.
 *
 * Aktion's components take almost no styling props: they read `--rui-*`
 * custom properties, and a theme is a map of those. One token edit restyles
 * every Button, Card and Table at once, so this view is the highest-leverage
 * styling tool there is — and "why is this the wrong colour?" becomes a
 * question about tokens rather than about CSS.
 *
 * Edits are applied the way an in-script `$theme({...})` block applies them,
 * so what you see is what the program gets if it declares the same tokens —
 * "Copy as $theme" hands you that block.
 */

import { h, type Child } from "../core/vdom.js";
import { can, type ViewContext, type ViewDefinition } from "../context.js";
import type { DevtoolsAppRecord } from "../hook.js";
import type { ThemeInfo } from "../protocol.js";
import { contrastRatio, parseColor } from "../a11y.js";
import { icon } from "../ui/icons.js";
import {
  button, card, chip, emptyState, filterChip, iconButton, note, plural, searchField, segmented, select, spacer, viewbar, vsep,
} from "../ui/kit.js";
import { noApp, unsupported } from "./common.js";
import { suggestForeground, toHex } from "./a11y.js";

/** Token groups, in the order a designer thinks about them. */
const GROUPS: ReadonlyArray<{ title: string; icon: "droplet" | "type" | "sparkles" | "checkCircle" | "ruler" | "layers" | "grid"; match: (token: string) => boolean }> = [
  { title: "Surfaces", icon: "layers", match: (t) => /^color(Bg|Surface|Border|Overlay|Backdrop)/.test(t) },
  { title: "Text", icon: "type", match: (t) => /^colorText/.test(t) || /^colorLink/.test(t) },
  { title: "Brand", icon: "sparkles", match: (t) => /^color(Primary|Accent|Focus|Secondary)/.test(t) },
  { title: "Status", icon: "checkCircle", match: (t) => /^color(Success|Warning|Danger|Error|Info)/.test(t) },
  { title: "Other colours", icon: "droplet", match: (t) => /^color/.test(t) },
  { title: "Typography", icon: "type", match: (t) => /^(font|line|letter|text)/i.test(t) },
  { title: "Spacing & shape", icon: "ruler", match: (t) => /^(space|spacing|radius|border|size|gap)/i.test(t) },
  { title: "Elevation & motion", icon: "grid", match: (t) => /^(shadow|elevation|motion|duration|ease|transition|z)/i.test(t) },
];

/** The colour pairs the library actually paints, with the WCAG minimum each needs. */
export const CONTRAST_PAIRS: ReadonlyArray<{ label: string; fg: string; bg: string; min: number }> = [
  { label: "Body text", fg: "colorText", bg: "colorBg", min: 4.5 },
  { label: "Muted text", fg: "colorTextMuted", bg: "colorBg", min: 4.5 },
  { label: "Text on surface", fg: "colorText", bg: "colorSurface", min: 4.5 },
  { label: "Muted on surface", fg: "colorTextMuted", bg: "colorSurface", min: 4.5 },
  { label: "Primary button", fg: "colorPrimaryText", bg: "colorPrimary", min: 4.5 },
  { label: "Accent fill", fg: "colorAccentText", bg: "colorAccent", min: 4.5 },
  { label: "Link", fg: "colorLink", bg: "colorBg", min: 4.5 },
  { label: "Success text", fg: "colorSuccessText", bg: "colorBg", min: 4.5 },
  { label: "Warning text", fg: "colorWarningText", bg: "colorBg", min: 4.5 },
  { label: "Danger text", fg: "colorDangerText", bg: "colorBg", min: 4.5 },
  { label: "Info text", fg: "colorInfoText", bg: "colorBg", min: 4.5 },
  { label: "Danger button", fg: "colorOnDanger", bg: "colorDanger", min: 4.5 },
  { label: "Control border", fg: "colorBorderControl", bg: "colorBg", min: 3 },
  { label: "Focus ring", fg: "colorFocusRing", bg: "colorBg", min: 3 },
];

export function isColorValue(value: string): boolean {
  return /^(#[0-9a-f]{3,8}$|rgba?\(|hsla?\(|color\(|oklch\(|oklab\()/i.test(value.trim());
}

/** `colorBgSubtle` → `--rui-color-bg-subtle`. */
export function cssVarName(token: string): string {
  return `--rui-${token.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

function hexOf(value: string): string | null {
  const parsed = parseColor(value);
  return parsed ? toHex(parsed) : null;
}

/** The `$theme({...})` block reproducing the edits (or every token). */
export function themeBlock(theme: ThemeInfo, onlyEdited: boolean): string {
  const keys = onlyEdited && theme.devtoolsOverrides.length > 0 ? theme.devtoolsOverrides : Object.keys(theme.tokens).sort();
  const lines = keys.flatMap((key) => (theme.tokens[key] === undefined ? [] : [`  ${key}: ${JSON.stringify(theme.tokens[key])},`]));
  return `$theme({\n${lines.join("\n")}\n})`;
}

/** Step a numeric CSS value (`12px`, `1.5`, `0.25rem`) by `delta` in its own unit. */
export function nudgeValue(value: string, delta: number): string | null {
  const match = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  const unit = match[2] ?? "";
  const step = unit === "" || unit === "rem" || unit === "em" ? delta / 10 : delta;
  const next = Math.round((number + step) * 1000) / 1000;
  return `${next}${unit}`;
}

/* -------------------------------------------------------------------------- */

function setToken(ctx: ViewContext, app: DevtoolsAppRecord, theme: ThemeInfo, token: string, value: string, options: { quiet?: boolean } = {}): void {
  if (!can(app, "setThemeTokens")) return;
  const previous = theme.tokens[token];
  app.setThemeTokens({ [token]: value });
  if (!options.quiet) {
    ctx.toast(`${token} = ${value}`, "info", previous !== undefined ? { action: { label: "Undo", run: () => { app.setThemeTokens!({ [token]: previous }); ctx.refresh(); } } } : undefined);
  }
  ctx.refresh();
}

/** Drop one override: clear all, then re-apply the others (the record has no per-token clear). */
function resetToken(ctx: ViewContext, app: DevtoolsAppRecord, theme: ThemeInfo, token: string): void {
  if (!can(app, "clearThemeTokens")) return;
  const others: Record<string, string> = {};
  for (const key of theme.devtoolsOverrides) if (key !== token && theme.tokens[key] !== undefined) others[key] = theme.tokens[key]!;
  app.clearThemeTokens();
  if (Object.keys(others).length > 0) app.setThemeTokens?.(others);
  ctx.toast(`${token} restored`);
  ctx.refresh();
}

let pickerFrame = 0;
let pickerQueued: { app: DevtoolsAppRecord; token: string; value: string } | null = null;

/** Colour picker drags fire `input` continuously; one write per frame keeps them smooth. */
function queuePicker(app: DevtoolsAppRecord, token: string, value: string): void {
  pickerQueued = { app, token, value };
  if (pickerFrame) return;
  const flush = (): void => {
    pickerFrame = 0;
    const next = pickerQueued;
    pickerQueued = null;
    if (next) next.app.setThemeTokens?.({ [next.token]: next.value });
  };
  pickerFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
}

function tokenRow(ctx: ViewContext, app: DevtoolsAppRecord, theme: ThemeInfo, token: string, value: string): Child {
  const edited = theme.devtoolsOverrides.includes(token);
  const fromScript = theme.scriptOverrides.includes(token);
  const color = isColorValue(value);
  const hex = color ? hexOf(value) : null;
  const canEdit = can(app, "setThemeTokens");
  return h("div", { key: token, class: ["tm-token", edited ? "is-edited" : ""], "data-dt": "theme-token", "data-token": token },
    color
      ? h("label", { class: "tm-swatch", style: { background: value }, "data-tip": canEdit ? "Pick a colour" : value },
          canEdit ? h("input", {
            type: "color", value: hex ?? "#000000", "aria-label": `Colour for ${token}`,
            onInput: (event: Event) => queuePicker(app, token, (event.target as HTMLInputElement).value),
            onChange: (event: Event) => setToken(ctx, app, theme, token, (event.target as HTMLInputElement).value, { quiet: true }),
          }) : null)
      : h("span", { class: "tm-swatch is-text", "aria-hidden": "true" }, previewGlyph(token, value)),
    h("div", { class: "tm-token-main" },
      h("div", { class: "tm-token-name" },
        h("span", { class: "mono ellipsis", "data-tip": cssVarName(token) }, token),
        edited ? chip("edited", "amber") : null,
        fromScript ? chip("$theme", "purple", { tip: "Set by the program's $theme({...}) block — it is re-applied on every render and wins over an edit here" }) : null),
      h("input", {
        class: ["input", "is-mono", "tm-value"], value, "aria-label": `${token} value`, spellcheck: "false", disabled: !canEdit || undefined,
        onKeyDown: (event: KeyboardEvent) => {
          const input = event.target as HTMLInputElement;
          if (event.key === "Enter") { event.preventDefault(); if (input.value.trim() && input.value !== value) setToken(ctx, app, theme, token, input.value.trim()); }
          else if (event.key === "Escape") { input.value = value; input.blur(); }
          else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const next = nudgeValue(input.value, (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
            if (next !== null) { event.preventDefault(); input.value = next; setToken(ctx, app, theme, token, next, { quiet: true }); }
          }
        },
        onBlur: (event: FocusEvent) => { const input = event.target as HTMLInputElement; if (input.value.trim() && input.value !== value) setToken(ctx, app, theme, token, input.value.trim()); },
      })),
    h("span", { class: "tm-token-actions" },
      iconButton({ icon: "copy", label: `Copy var(${cssVarName(token)})`, size: "sm", onClick: () => ctx.copy(`var(${cssVarName(token)})`, "the CSS variable") }),
      edited && can(app, "clearThemeTokens") ? iconButton({ icon: "undo", label: `Restore ${token}`, size: "sm", onClick: () => resetToken(ctx, app, theme, token) }) : null));
}

function previewGlyph(token: string, value: string): Child {
  if (/^radius/i.test(token)) return h("span", { class: "tm-glyph-radius", style: { borderRadius: value } });
  if (/^shadow|elevation/i.test(token)) return h("span", { class: "tm-glyph-shadow", style: { boxShadow: value } });
  if (/^font(Size)?/i.test(token) && /px|rem|em/.test(value)) return h("span", { class: "tm-glyph-font", style: { fontSize: value.length < 10 ? value : undefined } }, "Aa");
  if (/^fontFamily|^font$/i.test(token)) return h("span", { class: "tm-glyph-font", style: { fontFamily: value } }, "Aa");
  if (/^(space|spacing|gap|size)/i.test(token)) return h("span", { class: "tm-glyph-space", style: { width: `min(${value}, 22px)` } });
  return icon("hash", { size: 12 });
}

function contrastCard(ctx: ViewContext, app: DevtoolsAppRecord, theme: ThemeInfo): Child {
  const rows: Child[] = [];
  let failing = 0;
  for (const pair of CONTRAST_PAIRS) {
    const fgValue = theme.tokens[pair.fg];
    const bgValue = theme.tokens[pair.bg];
    const fg = fgValue ? parseColor(fgValue) : null;
    const bg = bgValue ? parseColor(bgValue) : null;
    if (!fg || !bg || fg.a === 0 || bg.a === 0) continue;
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= pair.min;
    if (!pass) failing += 1;
    const fix = !pass ? suggestForeground(fg, bg, pair.min + 0.05) : null;
    rows.push(h("div", { key: pair.label, class: ["tm-pair", pass ? "" : "is-fail"], "data-dt": "theme-pair" },
      h("span", { class: "tm-pair-sample", style: { background: bgValue, color: fgValue } }, "Aa"),
      h("span", { class: "tm-pair-text" }, h("span", { class: "tm-pair-label" }, pair.label), h("code", { class: "t3" }, `${pair.fg} on ${pair.bg}`)),
      spacer(),
      chip(`${ratio.toFixed(2)}:1`, pass ? "green" : "red", { tip: `Needs ${pair.min}:1 (WCAG ${pair.min === 3 ? "1.4.11" : "1.4.3"})`, mono: true }),
      fix && can(app, "setThemeTokens") ? button({ label: `Use ${fix.hex}`, size: "sm", variant: "ghost", icon: "wand", tip: `Closest passing colour for ${pair.fg} (${fix.ratio.toFixed(2)}:1)`, onClick: () => setToken(ctx, app, theme, pair.fg, fix.hex) }) : null));
  }
  return card({
    title: "Contrast", icon: "contrast", testid: "theme-contrast",
    sub: rows.length === 0 ? "no measurable pairs" : failing > 0 ? h("span", { class: "tone-red" }, `${failing} of ${rows.length} pairs fail`) : `all ${rows.length} pairs pass`,
    body: rows.length === 0 ? h("div", { class: "t3" }, "This theme's colours could not be measured.") : h("div", { class: "tm-pairs" }, ...rows),
  });
}

function paletteStrip(theme: ThemeInfo): Child {
  const picks = ["colorBg", "colorSurface", "colorBorder", "colorText", "colorTextMuted", "colorPrimary", "colorAccent", "colorSuccess", "colorWarning", "colorDanger", "colorInfo"]
    .filter((t) => theme.tokens[t] && isColorValue(theme.tokens[t]!));
  if (picks.length === 0) return null;
  return h("div", { class: "tm-strip", "aria-label": "Palette preview" }, ...picks.map((t) => h("span", { key: t, class: "tm-strip-swatch", style: { background: theme.tokens[t] }, "data-tip": `${t}: ${theme.tokens[t]}` })));
}

/* -------------------------------------------------------------------------- */

function render(ctx: ViewContext): Child {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "The Theme view", "theme");
  if (!can(app, "getTheme")) return h("div", { class: "dt-pad" }, unsupported("its theme tokens"));
  const theme = app.getTheme();
  const q = ui.themeFilter.trim().toLowerCase();
  const editedOnly = ui.themeEditedOnly;
  const entries = Object.entries(theme.tokens)
    .filter(([token, value]) => (!q || token.toLowerCase().includes(q) || value.toLowerCase().includes(q)) && (!editedOnly || theme.devtoolsOverrides.includes(token)))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const placed = new Set<string>();
  const groups: Child[] = [];
  for (const group of GROUPS) {
    const rows = entries.filter(([token]) => !placed.has(token) && group.match(token));
    for (const [token] of rows) placed.add(token);
    if (rows.length === 0) continue;
    groups.push(card({ title: group.title, icon: group.icon, sub: plural(rows.length, "token"), flush: true, body: h("div", { class: "tm-tokens" }, ...rows.map(([token, value]) => tokenRow(ctx, app, theme, token, value))) }));
  }
  const rest = entries.filter(([token]) => !placed.has(token));
  if (rest.length > 0) groups.push(card({ title: "Other", icon: "grid", sub: plural(rest.length, "token"), flush: true, body: h("div", { class: "tm-tokens" }, ...rest.map(([token, value]) => tokenRow(ctx, app, theme, token, value))) }));

  const switcher = theme.available.length > 0 && can(app, "setThemeName")
    ? (theme.available.length <= 5
        ? segmented(theme.available.map((name) => ({ value: name, label: name })), theme.available.includes(theme.name) ? theme.name : ("" as string), (name) => { app.setThemeName(name); ctx.toast(`Theme: ${name}`); ctx.refresh(); }, { label: "Theme", testid: "theme-switch" })
        : select({ value: theme.available.includes(theme.name) ? theme.name : theme.available[0]!, label: "Theme", options: theme.available.map((name) => ({ value: name, label: name })), onChange: (name) => { app.setThemeName(name); ctx.toast(`Theme: ${name}`); ctx.refresh(); } }))
    : chip(theme.name, "grey");

  return h("div", { class: "tm", "data-dt": "theme" },
    viewbar(
      switcher,
      searchField({ value: ui.themeFilter, placeholder: "Filter tokens or values…", width: "200px", testid: "theme-filter", meta: q ? String(entries.length) : undefined, onInput: (v) => { ui.themeFilter = v; ctx.refresh(); } }),
      filterChip({ label: "Edited", on: editedOnly, count: theme.devtoolsOverrides.length, onToggle: () => { ui.themeEditedOnly = !ui.themeEditedOnly; ctx.refresh(); }, tip: "Show only tokens you changed" }),
      spacer(),
      button({ label: "Copy $theme", size: "sm", icon: "copy", testid: "theme-copy", tip: theme.devtoolsOverrides.length > 0 ? "The block reproducing your edits" : "Every resolved token as a $theme block", onClick: () => ctx.copy(themeBlock(theme, true), "the $theme block") }),
      iconButton({ icon: "more", label: "More", size: "sm", onClick: (event) => ctx.openMenu(event, [
        { label: "Copy every token as $theme", icon: "copy", run: () => ctx.copy(themeBlock(theme, false), "the $theme block") },
        { label: "Copy tokens as JSON", icon: "brackets", run: () => ctx.copy(JSON.stringify(theme.tokens, null, 2), "the tokens") },
        { label: "Copy as CSS variables", icon: "code", run: () => ctx.copy(`:host {\n${Object.entries(theme.tokens).map(([k, v]) => `  ${cssVarName(k)}: ${v};`).join("\n")}\n}`, "the CSS") },
      ]) }),
      theme.devtoolsOverrides.length > 0 && can(app, "clearThemeTokens")
        ? [vsep(), button({ label: `Reset ${theme.devtoolsOverrides.length}`, size: "sm", variant: "danger", icon: "undo", testid: "theme-reset", onClick: () => {
            const backup: Record<string, string> = {};
            for (const key of theme.devtoolsOverrides) if (theme.tokens[key] !== undefined) backup[key] = theme.tokens[key]!;
            app.clearThemeTokens();
            ctx.toast("Token edits cleared", "info", { action: { label: "Undo", run: () => { app.setThemeTokens?.(backup); ctx.refresh(); } } });
            ctx.refresh();
          } })]
        : null),
    h("div", { class: "dt-scroll" },
      h("div", { class: "tm-page" },
        h("div", { class: "tm-hero" },
          h("div", { class: "tm-hero-text" },
            h("div", { class: "tm-hero-title" }, h("span", { class: "tm-hero-name" }, theme.name), h("span", { class: "t3" }, ` · ${plural(Object.keys(theme.tokens).length, "token")}`)),
            h("div", { class: "t3" }, theme.devtoolsOverrides.length > 0 ? `${plural(theme.devtoolsOverrides.length, "edit")} applied live` : "Click a swatch or edit a value — every component restyles instantly. ↑/↓ nudges numbers (⇧ ×10)."),
            theme.scriptOverrides.length > 0 ? h("div", { class: "t3" }, icon("info", { size: 11 }), ` The program's $theme block sets ${plural(theme.scriptOverrides.length, "token")}; those win over edits here.`) : null),
          paletteStrip(theme)),
        contrastCard(ctx, app, theme),
        groups.length > 0 ? h("div", { class: "tm-groups" }, ...groups) : emptyState({ icon: "filter", title: editedOnly ? "No edited tokens" : "No token matches" }),
        theme.devtoolsOverrides.length > 0 ? note("accent", ["Happy with it? ", h("strong", {}, "Copy $theme"), " and paste the block into the program to make the edits permanent."], { icon: "sparkles" }) : null)));
}

export const themeView: ViewDefinition = {
  id: "theme",
  label: "Theme",
  icon: "theme",
  group: "app",
  hint: "Live design-token editor, theme switcher, contrast checks",
  keywords: "theme tokens colors palette dark light design css variables contrast",
  badge: (ctx) => {
    const app = ctx.app;
    if (!can(app, "getTheme")) return null;
    const count = ctx.memo("theme.badge", [app.id, ctx.model.revs.commit], () => app.getTheme().devtoolsOverrides.length);
    return count > 0 ? { value: count, tone: "amber" } : null;
  },
  render,
  commands: (ctx) => {
    const app = ctx.app;
    if (!can(app, "getTheme") || !can(app, "setThemeName")) return [];
    return app.getTheme().available.map((name) => ({ id: `theme:${name}`, label: `Switch app theme to ${name}`, icon: "theme" as const, keywords: "theme dark light", run: () => { app.setThemeName(name); ctx.refresh(); } }));
  },
  css: /* css */ `
.tm { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.tm-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.tm-hero { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-radius: var(--dt-r-lg); border: 1px solid var(--dt-border); background: linear-gradient(135deg, var(--dt-accent-soft), transparent 70%), var(--dt-bg-1); flex-wrap: wrap; }
.tm-hero-text { flex: 1 1 260px; display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-sm); }
.tm-hero-title { font-size: 17px; font-weight: 700; }
.tm-hero-name { text-transform: capitalize; }
.tm-strip { display: flex; border-radius: 10px; overflow: hidden; border: 1px solid var(--dt-border-strong); box-shadow: var(--dt-shadow-sm); }
.tm-strip-swatch { width: 26px; height: 40px; }
.tm-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; align-items: start; }
.tm-tokens { display: flex; flex-direction: column; }
.tm-token { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--dt-border); }
.tm-token:last-child { border-bottom: 0; }
.tm-token.is-edited { background: color-mix(in srgb, var(--dt-amber) 8%, transparent); }
.tm-swatch { position: relative; flex: none; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--dt-border-strong); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); cursor: pointer; overflow: hidden; background-clip: padding-box; }
.tm-swatch input[type="color"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.tm-swatch:focus-within { outline: 2px solid var(--dt-accent); outline-offset: 2px; }
.tm-swatch.is-text { display: flex; align-items: center; justify-content: center; cursor: default; background: var(--dt-bg-2); color: var(--dt-text-3); }
.tm-glyph-radius { width: 16px; height: 16px; border: 2px solid var(--dt-accent); border-right-color: transparent; border-bottom-color: transparent; }
.tm-glyph-shadow { width: 16px; height: 16px; border-radius: 4px; background: var(--dt-bg-0); }
.tm-glyph-font { font-weight: 650; color: var(--dt-text); line-height: 1; max-height: 26px; overflow: hidden; }
.tm-glyph-space { height: 6px; min-width: 2px; background: var(--dt-accent); border-radius: 3px; }
.tm-token-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tm-token-name { display: flex; align-items: center; gap: 6px; font-size: var(--dt-fs-sm); min-width: 0; }
.tm-value { width: 100%; height: 24px; font-size: var(--dt-fs-xs); }
.tm-token-actions { display: inline-flex; gap: 2px; opacity: 0; transition: opacity 120ms; }
.tm-token:hover .tm-token-actions, .tm-token:focus-within .tm-token-actions { opacity: 1; }
.tm-pairs { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 6px 14px; }
.tm-pair { display: flex; align-items: center; gap: 10px; padding: 5px 0; min-width: 0; }
.tm-pair-sample { width: 36px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-weight: 700; border: 1px solid var(--dt-border-strong); flex: none; }
.tm-pair-text { display: flex; flex-direction: column; min-width: 0; }
.tm-pair-label { font-size: var(--dt-fs-sm); font-weight: 600; }
.tm-pair-text code { font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tm-pair.is-fail .tm-pair-label { color: var(--dt-red); }
`,
};
