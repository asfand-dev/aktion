/**
 * Theme tab — a live editor for the design tokens the whole library reads.
 *
 * Aktion's components take almost no styling props: they read `--rui-*` custom
 * properties, and a theme is a map of those. That makes theming the highest-
 * leverage thing a debugger can expose — one token edit restyles every Button,
 * Card, and Table at once — and it makes "why is this the wrong colour?" a
 * question about tokens rather than about CSS.
 *
 * Edits are applied as inline custom properties on the host, exactly the way an
 * in-script `$theme({...})` block applies them, so what you see here is what the
 * program would get if it declared the same tokens. "Copy as $theme" hands you
 * that block.
 */

import {
  button, chip, code, copyButton, emptyState, faint, h, muted, searchInput,
  section, spacer, stat, statGrid, toolbar,
} from "../ui.js";
import { can, type TabContext, type TabDefinition } from "../context.js";
import { contrastRatio, parseColor } from "../a11y.js";
import type { ThemeInfo } from "../protocol.js";

/** Token groups, in the order a designer thinks about them. */
const GROUPS: ReadonlyArray<{ title: string; match: (token: string) => boolean }> = [
  { title: "Surfaces", match: (t) => /^color(Bg|Surface|Border)/.test(t) },
  { title: "Text", match: (t) => /^colorText/.test(t) || t === "colorLink" || t === "colorLinkHover" },
  { title: "Brand", match: (t) => /^color(Primary|Accent|FocusRing)/.test(t) },
  { title: "Status", match: (t) => /^color(Success|Warning|Danger|Info)/.test(t) },
  { title: "Typography", match: (t) => /^(font|line|letter|text)/i.test(t) },
  { title: "Spacing & shape", match: (t) => /^(space|spacing|radius|border(Width|Radius))/i.test(t) },
  { title: "Elevation & motion", match: (t) => /^(shadow|elevation|motion|duration|ease|z)/i.test(t) },
];

export const themeTab: TabDefinition = {
  id: "theme",
  label: "Theme",
  icon: "◐",
  hint: "Live design-token editor, theme switcher, and contrast checks",
  badge: (ctx) => {
    if (!can(ctx.app, "getTheme")) return null;
    const count = ctx.app.getTheme().devtoolsOverrides.length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render(ctx),
};

function render(ctx: TabContext): Node[] {
  const { app, ui } = ctx;
  if (!can(app, "getTheme")) {
    return [emptyState("This app does not expose its theme.")];
  }
  const theme = app.getTheme();
  const tokens = Object.entries(theme.tokens).sort((a, b) => a[0].localeCompare(b[0]));
  const filter = ui.themeFilter.trim().toLowerCase();

  const bar = toolbar(
    searchInput(ui.themeFilter, (value) => {
      ui.themeFilter = value;
      ctx.refresh();
    }, "Filter tokens…"),
    spacer(),
    muted(`${tokens.length} tokens`),
    copyButton(() => asThemeBlock(theme), "Copy as $theme"),
    copyButton(() => JSON.stringify(theme.tokens, null, 2), "Copy JSON"),
    theme.devtoolsOverrides.length > 0 && can(app, "clearThemeTokens")
      ? button(`Reset (${theme.devtoolsOverrides.length})`, () => {
          app.clearThemeTokens();
          ctx.toast("Token overrides cleared");
          ctx.refresh();
        }, { tone: "warn", title: "Drop every DevTools token override" })
      : null,
  );

  const out: Node[] = [bar, renderSwitcher(ctx, theme), renderContrast(theme)];

  const shown = new Set<string>();
  for (const group of GROUPS) {
    const rows = tokens.filter(([token]) =>
      group.match(token) && (filter === "" || token.toLowerCase().includes(filter)));
    for (const [token] of rows) shown.add(token);
    if (rows.length === 0) continue;
    out.push(section(group.title, h("div", { class: "token-grid" },
      ...rows.map(([token, value]) => renderToken(ctx, theme, token, value)))));
  }
  const rest = tokens.filter(([token]) =>
    !shown.has(token) && (filter === "" || token.toLowerCase().includes(filter)));
  if (rest.length > 0) {
    out.push(section("Other", h("div", { class: "token-grid" },
      ...rest.map(([token, value]) => renderToken(ctx, theme, token, value)))));
  }
  if (out.length === 3) out.push(section(null, faint("No tokens match the filter."), { flush: true }));
  return out;
}

/* -------------------------------------------------------------------------- */

function renderSwitcher(ctx: TabContext, theme: ThemeInfo): HTMLElement {
  const { app } = ctx;
  return section(null, [
    statGrid(
      stat("theme", theme.name),
      stat("overrides", String(theme.devtoolsOverrides.length), {
        title: theme.devtoolsOverrides.join(", "),
        tone: theme.devtoolsOverrides.length > 0 ? "warn" : undefined,
      }),
      stat("in-script", String(theme.scriptOverrides.length), {
        title: theme.scriptOverrides.length > 0
          ? `The program's $theme({...}) block sets: ${theme.scriptOverrides.join(", ")}`
          : "The program declares no $theme({...}) block",
      }),
    ),
    h("div", { class: "chip-row" }, ...theme.available.map((name) =>
      can(app, "setThemeName")
        ? h("button", {
            class: `chip ${name === theme.name ? "green" : "grey"} is-link`,
            title: `Switch to the ${name} theme`,
            onclick: () => {
              app.setThemeName(name);
              ctx.toast(`Theme: ${name}`);
              ctx.refresh();
            },
          }, name)
        : chip(name, name === theme.name ? "green" : "grey"))),
    theme.scriptOverrides.length > 0
      ? faint("The program's own $theme({...}) block is re-applied on every render, so it wins over an edit here for the tokens it sets.")
      : null,
  ], { flush: true });
}

function renderToken(ctx: TabContext, theme: ThemeInfo, token: string, value: string): HTMLElement {
  const { app } = ctx;
  const overridden = theme.devtoolsOverrides.includes(token);
  const fromScript = theme.scriptOverrides.includes(token);
  const colour = isColor(value);

  const input = h("input", {
    class: "token-input",
    value,
    spellcheck: "false",
  }) as HTMLInputElement;
  const commit = (): void => {
    if (!can(app, "setThemeTokens") || input.value === value) return;
    app.setThemeTokens({ [token]: input.value });
    ctx.toast(`${token} = ${input.value}`);
    ctx.refresh();
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") commit();
  });

  // A native colour picker for colour-valued tokens: typing hex is fine, but
  // finding a colour by typing hex is not.
  const picker = colour && can(app, "setThemeTokens")
    ? (() => {
        const el = h("input", { class: "token-picker", type: "color", value: toHex(value) ?? "#000000" }) as HTMLInputElement;
        el.addEventListener("input", () => {
          app.setThemeTokens({ [token]: el.value });
          input.value = el.value;
        });
        el.addEventListener("change", () => ctx.refresh());
        return el;
      })()
    : null;

  return h("div", { class: `token-row ${overridden ? "is-overridden" : ""}` },
    h("div", { class: "token-head" },
      colour ? h("span", { class: "swatch", style: `background:${value}` }) : null,
      h("span", { class: "token-name", title: `--rui-${kebab(token)}` }, token),
      overridden ? chip("edited", "amber") : null,
      fromScript ? chip("$theme", "purple", "Set by the program's $theme({...}) block") : null),
    h("div", { class: "token-body" }, picker, input));
}

/**
 * Contrast checks for the pairs the library actually paints.
 *
 * The generic advice "check your contrast" is useless without knowing which
 * pairs matter. These four are the ones the stylesheet uses for body text,
 * muted text, primary buttons, and links — the places a low ratio shows up on
 * every page at once.
 */
function renderContrast(theme: ThemeInfo): HTMLElement {
  const pairs: Array<[string, string, string, number]> = [
    ["Body text", "colorText", "colorBg", 4.5],
    ["Muted text", "colorTextMuted", "colorBg", 4.5],
    ["Text on surface", "colorText", "colorSurface", 4.5],
    ["Primary button", "colorPrimaryText", "colorPrimary", 4.5],
    ["Accent fill", "colorAccentText", "colorAccent", 4.5],
    ["Link", "colorLink", "colorBg", 4.5],
    ["Control border", "colorBorderControl", "colorBg", 3],
  ];
  const rows: HTMLElement[] = [];
  for (const [label, fgToken, bgToken, required] of pairs) {
    const fg = parseColor(theme.tokens[fgToken] ?? "");
    const bg = parseColor(theme.tokens[bgToken] ?? "");
    if (!fg || !bg || fg.a === 0 || bg.a === 0) continue;
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= required;
    rows.push(h("div", { class: "contrast-row" },
      h("span", {
        class: "contrast-sample",
        style: `background:${theme.tokens[bgToken]};color:${theme.tokens[fgToken]}`,
      }, "Aa"),
      h("span", { class: "contrast-label" }, label),
      code(`${fgToken} / ${bgToken}`),
      spacer(),
      chip(`${ratio.toFixed(2)}:1`, pass ? "green" : "red", `needs ${required}:1`)));
  }
  if (rows.length === 0) {
    return section("Contrast", faint("No colour pairs could be measured for this theme."));
  }
  return section("Contrast", [
    h("div", {}, ...rows),
    faint("WCAG 1.4.3 asks for 4.5:1 on body text and 3:1 on large text and control boundaries."),
  ]);
}

/* -------------------------------------------------------------------------- */

function isColor(value: string): boolean {
  return /^(#|rgb|hsl|color\()/i.test(value.trim());
}

/** `colorBgSubtle` → `color-bg-subtle`, for the CSS-variable tooltip. */
function kebab(token: string): string {
  return token.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Hex form of a colour, for `<input type="color">` (which accepts only hex). */
function toHex(value: string): string | null {
  const parsed = parseColor(value);
  if (!parsed) return null;
  const hex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${hex(parsed.r)}${hex(parsed.g)}${hex(parsed.b)}`;
}

/** The `$theme({...})` block that reproduces the current overrides. */
function asThemeBlock(theme: ThemeInfo): string {
  const keys = theme.devtoolsOverrides.length > 0
    ? theme.devtoolsOverrides
    : Object.keys(theme.tokens);
  const lines = keys
    .map((key) => {
      const value = theme.tokens[key];
      return value === undefined ? null : `  ${key}: ${JSON.stringify(value)},`;
    })
    .filter((line): line is string => line !== null);
  return `$theme({\n${lines.join("\n")}\n})`;
}
