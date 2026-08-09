/**
 * Theme tokens applied as CSS custom properties on the host element.
 *
 * Built-in themes:
 *   - "light"      (default)
 *   - "dark"
 *   - "corporate"  (contemporary enterprise workspace: graphite neutrals, a
 *                   deep teal brand hue, square-shouldered controls, crisp
 *                   hairlines and tight shadows)
 *   - "soft"       (soft, friendly, light & rounded; lavender + mint)
 *   - "glass"      (light glassmorphism: frosted white surfaces over a soft
 *                   pastel gradient, airy and translucent)
 *   - "modern"     (clean modern SaaS: light, generous rounding, ink primary,
 *                   pill buttons, soft diffuse shadows, vibrant charts)
 *
 * Private themes (see `privateThemes`) resolve by name exactly like the ones
 * above but are deliberately absent from `builtInThemes`, so they never reach
 * `langSpec.themeNames`, the docs' theme pickers or the published reference.
 *
 * Consumers can also pass a JSON object via the `theme` attribute, call
 * `element.setTheme({...})`, or write a bare `$theme({...})` statement
 * inside a Aktion program. All three paths flow through `mergeTheme`
 * so partial token maps are layered on top of the `light` defaults.
 *
 * Token taxonomy:
 *   - **Color** — surface, semantic, brand accents, focus ring.
 *   - **Typography** — body and heading families, sizes, weights, line
 *     heights, letter spacing, and heading text-transform. Enough surface
 *     to mirror brand systems (GitHub, Stripe, Apple, IONOS, Notion, …).
 *   - **Shape & spacing** — radii (xs/sm/md/lg/pill/button/input), border
 *     width, shadows, spacing scale.
 *   - **Buttons** — font-weight, text-transform, letter-spacing, padding.
 *   - **Charts** — six rotating series colors.
 *   - **Motion** — transition duration shared by hover / focus animations.
 */

export interface ThemeTokens {
  /* ----- Surface & semantic colors --------------------------------- */
  colorBg: string;
  colorBgSubtle: string;
  colorSurface: string;
  colorSurfaceMuted: string;
  colorBorder: string;
  colorBorderSubtle: string;
  /**
   * Boundary colour for INTERACTIVE controls (input, select, textarea,
   * checkbox, radio, switch track, picker triggers).
   *
   * Separate from `colorBorder` on purpose. `colorBorder` also draws hairlines,
   * dividers and table row separators, which are decorative and are meant to be
   * faint — it measures 1.17-1.70:1 against its surface in all six themes.
   * WCAG 1.4.11 requires 3:1 for the boundary of a control the user has to
   * find, so darkening `colorBorder` to satisfy that would make every divider
   * in the library heavy. This token carries the accessible value instead.
   */
  colorBorderControl: string;
  colorText: string;
  colorTextMuted: string;
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryText: string;
  /** Secondary brand accent (links, chips, callouts). Defaults to primary. */
  colorAccent: string;
  colorAccentHover: string;
  colorAccentText: string;
  /**
   * Interactive TEXT colour — links, link/ghost buttons, the selected tab label,
   * pagination digits, a clickable row's leading icon.
   *
   * Optional, and derived from `colorAccent` by the `:host` block when a theme
   * leaves it out. It exists because `colorAccent` has to serve two jobs at once:
   * it is a FILL paired with `colorAccentText` (soft pairs mint `#5eead4` with
   * `#0f3a35` ink) *and* it was painted as link text. Darkening the accent to
   * clear the 4.5:1 text minimum would have broken the fill pairing, so the
   * text-side value moved here instead. soft's mint measured 1.48:1 on its own
   * white surface and glass's `#b58ee6` 2.63:1 — links were effectively invisible.
   *
   * A theme whose accent already clears 4.5:1 as text (light 6.29:1, dark
   * 5.95:1, corporate 4.86:1) can omit both and inherit the derivation.
   */
  colorLink?: string;
  colorLinkHover?: string;
  /** Focus ring color (CSS color). Defaults to primary. */
  colorFocusRing: string;
  colorSuccess: string;
  colorWarning: string;
  colorDanger: string;
  colorInfo: string;
  /**
   * Text-safe partners for the four status hues.
   *
   * The tokens above are tuned for FILLS and shapes, where 3:1 is the bar
   * (WCAG 1.4.11). Used as `color:` on a light surface they are nowhere near the
   * 4.5:1 body-text minimum — `#10b981` measures 2.54:1 on white, `#f59e0b`
   * 2.15:1, soft's `#5eead4` 1.48:1 — and the sheet paints status *text* in
   * roughly 45 places (Badge, Tag, Pill, Callout, StatCard value, MenuItem
   * danger, field errors…). Those rules take these tokens instead.
   *
   * Optional so a partial `$theme({ colors: { success } })` still works; the
   * `:host` block carries light-theme defaults. A theme that retints a status
   * hue should retint its `*Text` partner with it.
   */
  colorSuccessText?: string;
  colorWarningText?: string;
  colorDangerText?: string;
  colorInfoText?: string;
  /**
   * Ink for a label that sits ON a filled status surface — the ✓ in a completed
   * Step, the glyph in a Callout/Toast icon disc, a danger Button or IconButton
   * label, the count in a TabBar / NotificationBell / ProductBadge pill.
   *
   * The mirror image of the `*Text` tokens above: those are "the status hue,
   * painted as text on a surface"; these are "text painted on the status hue".
   * Every one of those places used a literal `#fff`, which fails in EVERY theme —
   * white on `--rui-color-success` is 2.54:1, on warning 2.15:1, on info 2.43:1
   * and on danger 3.76:1. (Not named `colorSuccessText`, which is already taken
   * by the other direction; `colorPrimaryText`/`colorAccentText` are the naming
   * precedent for "ink on this fill".)
   *
   * Values are per theme because the fills are: corporate's danger `#c80a00` is
   * dark enough that white is the correct ink (6.00:1), while soft's pastel
   * `#fda4af` needs a deep rose. No status fill had to be darkened — a
   * hue-matched dark ink clears 4.5:1 on all four hues in all six themes.
   */
  colorOnSuccess?: string;
  colorOnWarning?: string;
  colorOnDanger?: string;
  colorOnInfo?: string;
  /**
   * Hover wash for rows and cells that are clickable but own no surface.
   * Optional — the `:host` default derives it from `colorText`/`colorSurface`,
   * which is what the hardcoded `rgba(0, 0, 0, 0.04)` could not do.
   */
  colorSurfaceHover?: string;
  /* ----- Typography ------------------------------------------------- */
  fontFamily: string;
  /** Font stack used for headings (Card title, Page header, SectionHeader…). */
  fontFamilyHeading: string;
  fontFamilyMono: string;
  /** Root font size — body text defaults to this value. */
  fontSizeBase: string;
  /**
   * Additional type-scale rungs, all OPTIONAL.
   *
   * The sheet had 411 hardcoded px font-sizes across 25 distinct values, so a
   * theme could not retune the type scale at all (token adoption was 4.6%).
   * Squashing them onto the original five tokens would have changed the visual
   * design, so the scale is widened to cover the values actually in use and the
   * existing five keep their current values untouched.
   */
  fontSize10?: string;
  fontSize11?: string;
  fontSize13?: string;
  fontSize15?: string;
  fontSize18?: string;
  fontSize20?: string;
  fontSize24?: string;
  fontSize32?: string;
  fontSizeSm: string;
  fontSizeLg: string;
  /** Font size for Card/Section headings. */
  fontSizeHeading: string;
  /** Font size for page-level titles (PageHeader, Cover, Hero). */
  fontSizeTitle: string;
  fontWeightBody: string;
  fontWeightHeading: string;
  lineHeightBody: string;
  lineHeightHeading: string;
  /** Letter spacing applied to titles & headings (e.g. "-0.01em"). */
  letterSpacingHeading: string;
  /** `text-transform` applied to titles & headings (e.g. "uppercase"). */
  headingTextTransform: string;
  /* ----- Shape ------------------------------------------------------ */
  /** Micro radius (pills, dots, status chips). */
  radiusXs: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  /** Fully-rounded radius — `999px` by default. */
  radiusPill: string;
  /** Button-specific radius. Falls back to `radiusSm`. */
  radiusButton: string;
  /** Input-specific radius. Falls back to `radiusSm`. */
  radiusInput: string;
  /** Width of every solid border (default 1px). */
  borderWidth: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  /* ----- Spacing ---------------------------------------------------- */
  /** Hairline spacing steps below `xs` (optional; default 1px / 2px). */
  spacing3xs?: string;
  spacing2xs?: string;
  spacingXs: string;
  spacingS: string;
  spacingM: string;
  spacingL: string;
  spacingXl: string;
  /** Extra-large spacing steps for marketing/section rhythm. */
  spacing2xl: string;
  spacing3xl: string;
  /* ----- Gradients (named, brandable) ------------------------------ */
  /** Primary brand gradient — used by `fill: "gradient.brand"`, GradientText, etc. */
  gradientBrand: string;
  gradientAccent: string;
  gradientWarm: string;
  gradientCool: string;
  gradientSuccess: string;
  gradientDanger: string;
  /* ----- Buttons ---------------------------------------------------- */
  buttonFontWeight: string;
  buttonTextTransform: string;
  buttonLetterSpacing: string;
  buttonPaddingY: string;
  buttonPaddingX: string;
  /* ----- Motion ----------------------------------------------------- */
  transitionDuration: string;
  /** Motion tokens (I.2) — `$theme({ motion: { fast, base, slow, ease } })`.
   *  Optional: components fall back to their built-in timings. */
  motionFast?: string;
  motionBase?: string;
  motionSlow?: string;
  motionEase?: string;
  /* ----- Layers (I.2) ------------------------------------------------ */
  /** z-index tokens — `$theme({ zIndex: { modal: 2000, ... } })`. Optional:
   *  `sx.zIndex` tokens fall back to the documented defaults. */
  zBase?: string;
  zRaised?: string;
  zDropdown?: string;
  zSticky?: string;
  zBanner?: string;
  zOverlay?: string;
  zModal?: string;
  zPopover?: string;
  zToast?: string;
  zTooltip?: string;
  /* ----- Syntax highlighting (CodeBlock / CodeEditor) --------------- */
  /**
   * Optional. These were previously only `var(--rui-hl-keyword, #c678dd)`
   * fallbacks, i.e. a One Dark palette hardcoded onto CodeBlock's *light*
   * surface in five of six themes and unreachable from `$theme(...)`.
   */
  hlKeyword?: string;
  hlString?: string;
  hlNumber?: string;
  hlComment?: string;
  hlFn?: string;
  hlTag?: string;
  hlAttr?: string;
  hlPunct?: string;
  /* ----- Chart palette --------------------------------------------- */
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  chart6: string;
}

const baseFonts = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyHeading: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

const baseFontScale = {
  fontSizeBase: "14px",
  fontSizeSm: "12px",
  fontSizeLg: "16px",
  fontSizeHeading: "16px",
  fontSizeTitle: "22px",
  fontWeightBody: "400",
  fontWeightHeading: "700",
  lineHeightBody: "1.5",
  lineHeightHeading: "1.2",
  letterSpacingHeading: "0",
  headingTextTransform: "none",
} as const;

const baseSpacing = {
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "12px",
  spacingL: "20px",
  spacingXl: "32px",
  spacing2xl: "48px",
  spacing3xl: "80px",
} as const;

const baseGradients = {
  gradientBrand: "linear-gradient(120deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
  gradientAccent: "linear-gradient(120deg, #22d3ee 0%, #6366f1 100%)",
  gradientWarm: "linear-gradient(120deg, #f59e0b 0%, #ec4899 100%)",
  gradientCool: "linear-gradient(120deg, #3b82f6 0%, #06b6d4 100%)",
  gradientSuccess: "linear-gradient(120deg, #10b981 0%, #22d3ee 100%)",
  gradientDanger: "linear-gradient(120deg, #f43f5e 0%, #ec4899 100%)",
} as const;

const baseRadii = {
  radiusXs: "4px",
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "16px",
  radiusPill: "999px",
  radiusButton: "6px",
  radiusInput: "6px",
} as const;

const baseButtons = {
  buttonFontWeight: "600",
  buttonTextTransform: "none",
  buttonLetterSpacing: "0",
  buttonPaddingY: "8px",
  buttonPaddingX: "14px",
} as const;

const baseMotion = {
  transitionDuration: "120ms",
} as const;

export const lightTheme: ThemeTokens = {
  colorBg: "#ffffff",
  colorBgSubtle: "#f8fafc",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f1f5f9",
  colorBorder: "#e2e8f0",
  colorBorderControl: "#767f8c",
  colorBorderSubtle: "rgba(15, 23, 42, 0.08)",
  colorText: "#0f172a",
  colorTextMuted: "#475569",
  // Was #6366f1 (indigo-500), which measures 4.47:1 on this theme's white
  // surface — just under the 4.5:1 body-text minimum, and symmetric, so it
  // failed BOTH as text (125 rules paint `color: var(--rui-color-primary)`) and
  // for the #ffffff label on a primary button. #4f46e5 is indigo-600, the value
  // this theme already used for `colorPrimaryHover`, so the brand hue is
  // unchanged; hover steps down to indigo-700. #4f46e5 on white = 6.29:1.
  colorPrimary: "#4f46e5",
  colorPrimaryHover: "#4338ca",
  colorPrimaryText: "#ffffff",
  colorAccent: "#4f46e5",
  colorAccentHover: "#4338ca",
  colorAccentText: "#ffffff",
  colorFocusRing: "#4f46e5",
  colorSuccess: "#10b981",
  colorWarning: "#f59e0b",
  colorDanger: "#ef4444",
  colorInfo: "#06b6d4",
  // Same hues, darkened until they clear 4.5:1 on both #ffffff and #f8fafc:
  // 5.48 / 5.22 / 4.83 / 5.36:1 respectively (the fills above are 2.54 / 2.15 /
  // 3.76 / 2.43:1, which is fine for a shape and not for a glyph).
  colorSuccessText: "#047857",
  colorWarningText: "#a35a00",
  colorDangerText: "#d92d20",
  colorInfoText: "#0e7490",
  // Ink ON the fills above, where the literal #fff used to be: 6.17 / 6.97 /
  // 4.91 / 6.08:1 against success / warning / danger / info respectively.
  // Danger is the tight one — white is 3.76:1 and even #450a0a only reaches
  // 4.29:1, so the ink has to be this dark to clear the bar without moving the
  // hue itself (which draws borders, dots and progress bars elsewhere).
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#2c0606",
  colorOnInfo: "#0c2b3a",
  // Light syntax palette — CodeBlock's surface is --rui-color-surface-muted,
  // which is light in every theme but dark. 4.6-11.7:1 on #f1f5f9.
  hlKeyword: "#cf222e",
  hlString: "#0a3069",
  hlNumber: "#0550ae",
  hlComment: "#57606a",
  hlFn: "#6f42c1",
  hlTag: "#116329",
  hlAttr: "#953800",
  hlPunct: "#475569",
  shadowSm: "0 1px 2px rgba(15, 23, 42, 0.06)",
  shadowMd: "0 6px 24px rgba(15, 23, 42, 0.08)",
  shadowLg: "0 18px 60px rgba(15, 23, 42, 0.12)",
  borderWidth: "1px",
  chart1: "#6366f1",
  chart2: "#10b981",
  chart3: "#f59e0b",
  chart4: "#ef4444",
  chart5: "#06b6d4",
  chart6: "#8b5cf6",
  ...baseFonts,
  ...baseFontScale,
  ...baseSpacing,
  ...baseGradients,
  ...baseRadii,
  ...baseButtons,
  ...baseMotion,
};

export const darkTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#0b1220",
  colorBgSubtle: "#0f172a",
  colorSurface: "#111827",
  colorSurfaceMuted: "#1e293b",
  colorBorder: "#1f2937",
  colorBorderControl: "#5b6674",
  colorBorderSubtle: "rgba(248, 250, 252, 0.08)",
  colorText: "#f8fafc",
  colorTextMuted: "#94a3b8",
  colorPrimary: "#818cf8",
  colorPrimaryHover: "#6366f1",
  colorPrimaryText: "#0b1220",
  colorAccent: "#818cf8",
  colorAccentHover: "#6366f1",
  colorAccentText: "#0b1220",
  // colorLink derives from the accent, which is 5.95:1 on #111827 — fine. The
  // HOVER does not: #6366f1 is 3.97:1 here, i.e. a link that fails the moment
  // the pointer lands on it. On a dark surface hover has to BRIGHTEN, so this is
  // indigo-300 rather than light's indigo-700 step: 8.90:1.
  colorLinkHover: "#a5b4fc",
  colorFocusRing: "#818cf8",
  // On #111827 the status fills are ALREADY text-safe — 6.99 / 8.26 / 4.71 /
  // 7.31:1 — so the -Text partners are the hues themselves. Stated explicitly
  // rather than inherited, because light's darkened values (#047857 = 1.75:1
  // here) would be unreadable on a dark surface.
  colorSuccessText: "#10b981",
  colorWarningText: "#f59e0b",
  colorDangerText: "#ef4444",
  colorInfoText: "#06b6d4",
  // colorOn* is NOT restated: this theme keeps light's four status FILLS, so
  // light's inks are measured against exactly the same colours here.
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.4)",
  shadowMd: "0 8px 24px rgba(0, 0, 0, 0.4)",
  shadowLg: "0 22px 60px rgba(0, 0, 0, 0.55)",
  // One Dark, which is what this palette was drawn for: 4.6-7.3:1 on the dark
  // theme's #1e293b code surface. Comment lifted from #7f848e (3.90:1).
  hlKeyword: "#c678dd",
  hlString: "#98c379",
  hlNumber: "#d19a66",
  hlComment: "#9ca3af",
  hlFn: "#61afef",
  hlTag: "#e06c75",
  hlAttr: "#d19a66",
  hlPunct: "#abb2bf",
};

/**
 * Soft — friendly, light and rounded. Larger paddings, big radii,
 * lavender + mint palette, gentle shadows. (Formerly "pastel".)
 */
export const softTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#fdf6ff",
  colorBgSubtle: "#fbf2ff",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f4ecff",
  colorBorder: "#ead8ff",
  colorBorderControl: "#8d78a8",
  colorBorderSubtle: "rgba(168, 132, 232, 0.18)",
  colorText: "#3b1f56",
  colorTextMuted: "#7d6193",
  // 2.72:1 on this theme's white surface, so it fails the 4.5:1 text minimum
  // both in the 125 rules that paint it as a text colour and for the #ffffff
  // label on a primary button. Deepening it to #7c4ddb (5.33:1, same lavender)
  // is the fix, but tests/element.test.ts:282 pins this exact value as its probe
  // for "applies CSS custom properties for built-in themes", so the change needs
  // that assertion updated in the same commit. Left alone here deliberately.
  // Darkened from #a78bfa / #8b5cf6. The old pair measured 2.72:1 on this
  // theme's own white surface, which fails 4.5:1 in BOTH directions: 124 rules
  // paint `color: var(--rui-color-primary)` as body text, and the same value is
  // the fill behind the #ffffff label on every primary button. Same lavender
  // hue, verified: 5.33:1 and 6.65:1.
  colorPrimary: "#7c4ddb",
  colorPrimaryHover: "#6d3fc4",
  colorPrimaryText: "#ffffff",
  colorAccent: "#5eead4",
  colorAccentHover: "#2dd4bf",
  colorAccentText: "#0f3a35",
  // The mint accent CANNOT double as link text: 1.48:1 on this theme's white
  // surface and 1.36:1 on the page tint, i.e. unreadable. It stays exactly as it
  // is, because it is also the FILL that carries the #0f3a35 ink above, and
  // darkening it would break that pairing. The same mint hue at text depth
  // carries the interactive text instead: 6.38:1 on #ffffff and 5.55:1 on
  // #f4ecff, the deepest surface in the theme. Hover deepens (7.65 / 6.66:1).
  colorLink: "#0b6b62",
  colorLinkHover: "#075e56",
  // Darkened from #a78bfa. The focus indicator is the border-colour change on
  // this token, so it has to clear the 3:1 non-text contrast minimum (WCAG
  // 1.4.11 / 2.4.11); the 22% box-shadow glow beside it is only ~1.2:1 and
  // cannot carry the indicator.
  colorFocusRing: "#8b66f8",   // 3.92:1 on #ffffff
  colorSuccess: "#5eead4",
  colorWarning: "#fcd34d",
  colorDanger: "#fda4af",
  colorInfo: "#93c5fd",
  // The pastel status hues are 1.4-1.9:1 as text. Same hues at full depth:
  // 5.47 / 5.50 / 6.29 / 6.70:1 on #ffffff, all >= 4.88:1 on the page tints.
  colorSuccessText: "#0f766e",
  colorWarningText: "#856400",
  colorDangerText: "#be123c",
  colorInfoText: "#1d4ed8",
  // The pastel fills are the lightest in the library, so the ink on them is the
  // theme's own deep tints: 8.47 / 9.87 / 8.27 / 8.15:1. onSuccess reuses the
  // mint pairing that colorAccentText already established.
  colorOnSuccess: "#0f3a35",
  colorOnWarning: "#3d2600",
  colorOnDanger: "#4c0519",
  colorOnInfo: "#172554",
  fontFamily: "'Quicksand', 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading: "'Quicksand', 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusXs: "8px",
  radiusSm: "12px",
  radiusMd: "20px",
  radiusLg: "28px",
  radiusButton: "16px",
  radiusInput: "16px",
  shadowSm: "0 4px 14px rgba(168, 132, 232, 0.12)",
  shadowMd: "0 18px 40px rgba(168, 132, 232, 0.18)",
  shadowLg: "0 28px 70px rgba(168, 132, 232, 0.22)",
  spacingXs: "6px",
  spacingS: "12px",
  spacingM: "18px",
  spacingL: "28px",
  spacingXl: "44px",
  // The top two rungs are NOT inherited. Every theme spreads lightTheme, so a
  // theme that rescaled xs-xl silently kept light's 48px/80px: soft went
  // 44 -> 48 -> 80, a 4px step in a scale where every other rung roughly
  // doubles, and Section(pad: "sm") landed almost on top of pad: "md".
  // Continued at light's own xl x 1.5 / xl x 2.5 ratio.
  spacing2xl: "66px",
  spacing3xl: "110px",
  // This theme had no gradient of its own, so it inherited light's
  // indigo/violet/pink while the stylesheet separately inlined
  // linear-gradient(135deg, #8b5cf6, #f9a8d4) for card and section titles.
  // Both problems close here: the lavender-to-rose identity becomes the token
  // (so $theme({ gradients: { brand } }) reaches the titles), and both stops
  // clear 4.5:1 on this theme's white surface — 5.70:1 and 6.04:1, against
  // 4.23:1 and 1.81:1 for the pair they replace.
  gradientBrand: "linear-gradient(135deg, #7c3aed 0%, #be185d 100%)",
  chart1: "#a78bfa",
  chart2: "#5eead4",
  chart3: "#fcd34d",
  chart4: "#fda4af",
  chart5: "#93c5fd",
  chart6: "#f9a8d4",
};

/**
 * Glass — light glassmorphism. Frosted *white* translucent surfaces floating
 * over a soft, airy pastel gradient (peach → pink → lavender → mint). Real
 * backdrop-filter blur is applied via the stylesheet, so surfaces pick up the
 * colourful wash behind them. Dark warm-slate text, a warm coral primary, a
 * lavender accent, generous rounding, and feather-soft tinted shadows. The
 * look mirrors calm, modern wellness / consumer dashboards.
 */
export const glassTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#eceef2",
  colorBgSubtle: "#e6e8ee",
  colorSurface: "rgba(255, 255, 255, 0.55)",
  colorSurfaceMuted: "rgba(255, 255, 255, 0.35)",
  colorBorder: "rgba(255, 255, 255, 0.70)",
  colorBorderControl: "rgba(71, 85, 105, 0.85)",
  colorBorderSubtle: "rgba(255, 255, 255, 0.45)",
  colorText: "#33303a",
  // Was #7c7585: 4.43:1 on #ffffff, 3.81:1 on the #eceef2 page and 3.62:1 on
  // #e6e8ee — muted captions (StatCard, hints, table meta) were the single
  // largest body of failing text in this theme. #5d5768 keeps the warm-grey
  // hue at 6.93 / 5.97 / 5.66:1.
  colorTextMuted: "#5d5768",
  // Deepened from #f2826a (2.57:1 on white), which failed as text and for the
  // #ffffff label on primary buttons. #af4027 is the same terracotta-coral hue
  // at 5.86:1 on #ffffff and 4.78:1 on the darkest page tint. The frosted
  // translucency that defines this theme is unaffected.
  colorPrimary: "#af4027",
  colorPrimaryHover: "#9c3722",
  colorPrimaryText: "#ffffff",
  colorAccent: "#b58ee6",
  colorAccentHover: "#a376e0",
  colorAccentText: "#ffffff",
  // The lavender accent is 2.63:1 on #ffffff and 2.15:1 on the #e6e8ee page, so
  // it fails as link text; it stays put because it is also a fill (and the
  // gradientAccent stop). The same lavender at text depth takes over: 7.38:1 on
  // #ffffff, 6.03:1 on #e6e8ee. Hover deepens, matching the primary's direction.
  colorLink: "#6b3fa0",
  colorLinkHover: "#552f80",
  // Now the primary itself — it clears the 4.5:1 text bar, so it also clears the
  // 3:1 the focus border needs (the 22% glow beside it is only ~1.2:1).
  colorFocusRing: "#af4027",   // 5.86:1 on #ffffff
  colorSuccess: "#5bbf9b",
  colorWarning: "#f0b259",
  colorDanger: "#ef7b86",
  colorInfo: "#7fb0e8",
  // Same hues at text depth: 6.46 / 6.75 / 6.07 / 6.29:1 on #ffffff and
  // >= 4.68:1 on #e6e8ee (the fills are 1.9-2.7:1).
  colorSuccessText: "#146b50",
  colorWarningText: "#7f5200",
  colorDangerText: "#b82c39",
  colorInfoText: "#28629f",
  // Ink on this theme's softer fills: 6.99 / 8.00 / 5.84 / 6.49:1.
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#4c0519",
  colorOnInfo: "#172554",
  fontFamily: "'Poppins', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading: "'Poppins', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  letterSpacingHeading: "-0.01em",
  radiusXs: "8px",
  radiusSm: "14px",
  radiusMd: "20px",
  radiusLg: "28px",
  radiusButton: "16px",
  radiusInput: "16px",
  shadowSm: "0 2px 8px rgba(120, 110, 140, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.55)",
  shadowMd: "0 14px 40px rgba(120, 110, 140, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.55)",
  shadowLg: "0 26px 70px rgba(120, 110, 140, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.60)",
  spacingXs: "6px",
  spacingS: "12px",
  spacingM: "18px",
  spacingL: "26px",
  spacingXl: "42px",
  // See softTheme: light's 48px/80px would otherwise cap this theme's scale.
  spacing2xl: "63px",
  spacing3xl: "105px",
  gradientBrand: "linear-gradient(120deg, #f7a072 0%, #f2826a 45%, #c98bd6 100%)",
  gradientAccent: "linear-gradient(120deg, #b58ee6 0%, #8ec5e8 100%)",
  gradientWarm: "linear-gradient(120deg, #f9b079 0%, #f48aa6 100%)",
  gradientCool: "linear-gradient(120deg, #8ec5e8 0%, #9fd8c6 100%)",
  chart1: "#f2826a",
  chart2: "#b58ee6",
  chart3: "#8ec5e8",
  chart4: "#5bbf9b",
  chart5: "#f0b259",
  chart6: "#f48aa6",
};

/**
 * Vision — enterprise cloud-console aesthetic. Deep navy primary, calm
 * cyan accents, very pale blue page background, white surfaces with crisp
 * 1px borders, small radii, and Open Sans / Overpass type. The look should
 * feel at home in an admin panel: dense, scannable, minimal chrome.
 *
 * PRIVATE. Registered in `privateThemes`, not in `builtInThemes`, so
 * `theme="vision"` and `$theme({ name: "vision" })` resolve normally while the
 * name stays out of `langSpec.themeNames` — the single source the playground
 * theme picker, the editor autocomplete and the generated docs all read from.
 * (Formerly "skyline", then "corporate"; the `corporate` key now names the
 * unrelated theme below.)
 */
export const visionTheme: ThemeTokens = {
  ...lightTheme,
  /* Surface & semantic — palette */
  colorBg: "#f4f7fa", // neutral-1 · --default-background-color
  colorBgSubtle: "#eaeff4", // neutral-1 → neutral-2 blend
  colorSurface: "#ffffff", // white · cards / tables / sheets / panels
  colorSurfaceMuted: "#f4f7fa", // neutral-1 · muted fills, hovered neutrals
  colorBorder: "#bcc8d4", // neutral-3 · --tertiary-shape-color (hairlines, dividers, table rows)
  colorBorderControl: "#6b7a8a",
  colorBorderSubtle: "#dbe2e8", // neutral-2
  colorText: "#001b41", // corporate-8 · --default-text-color
  colorTextMuted: "#465a75", // neutral-6 · --secondary-text-color
  colorPrimary: "#0b2a63", // corporate-7 · --primary-button-background-color
  colorPrimaryHover: "#1474c4", // corporate-4 · primaries BRIGHTEN on hover
  colorPrimaryText: "#ffffff",
  colorAccent: "#1474c4", // corporate-4 · --interactive-text-color (links)
  colorAccentHover: "#095bb1", // corporate-5 · --hovered-interactive-text-color
  colorAccentText: "#ffffff",
  colorFocusRing: "#1474c4", // corporate-4 · --interactive-shape-color
  colorSuccess: "#0fa954", // success-4 · --success-shape-color
  colorWarning: "#ef8300", // warning-4 · accessible amber (badges use -3 #ffaa00)
  colorDanger: "#c80a00", // critical-5 · --critical-text-color
  colorInfo: "#08a5c5", // activating-4 · cyan --activating-shape-color
  // The shape tokens above are 2.7-3.1:1 as text on white (danger already
  // passes at 6.00:1). Same hues one step down the palette: 6.20 / 6.80 / 6.00 /
  // 6.14:1 on #ffffff, >= 5.19:1 on #eaeff4.
  colorSuccessText: "#0a7038",
  colorWarningText: "#8a4b00",
  colorDangerText: "#c80a00",
  colorInfoText: "#066b80",
  // Ink ON the fills. Danger is the one hue in the library dark enough that
  // white is the RIGHT answer (#ffffff on critical-5 #c80a00 = 6.00:1); the other
  // three need dark ink at 5.09 / 5.65 / 5.06:1.
  // colorLink is left deriving from the accent on purpose: corporate-4 #1474c4 is
  // the design system's own --interactive-text-color and measures 4.86:1 on the
  // white surfaces links actually sit on (4.52:1 on the #f4f7fa page). It is
  // 4.20:1 on the #eaeff4 bg-subtle tint — the one shortfall, left as-is because
  // overriding it would break the verified parity of the resting link colour.
  colorOnSuccess: "#0a7038",
  colorOnWarning: "#8a4b00",
  // #ffffff, not the fill colour: this token is the ink drawn ON critical-5, and
  // copying the fill here made every danger-filled surface invisible — a solid
  // red ConfirmDialog button with a red label, a red badge with a red count.
  colorOnDanger: "#ffffff",
  colorOnInfo: "#066b80",
  /* Typography — Open Sans body, Overpass display, 14px/20px */
  fontFamily:
    "'Open Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyHeading:
    "'Overpass', 'Open Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSizeBase: "14px", // --default-text-size
  fontSizeSm: "12px", // --small-text-size
  fontSizeLg: "16px", // --large-text-size
  fontSizeHeading: "16px", // --third-level-headline-size
  fontSizeTitle: "22px", // --second-level-headline-size
  fontWeightBody: "400",
  fontWeightHeading: "600", // Open Sans Semibold / Overpass Semibold
  lineHeightBody: "1.4286", // 20/14 · --default-text-line-height
  lineHeightHeading: "1.3",
  letterSpacingHeading: "0",
  headingTextTransform: "none",
  /* Shape — radii scale */
  radiusXs: "4px", // --xsmall-border-radius
  radiusSm: "8px", // --small-border-radius (inputs, list items)
  radiusMd: "12px", // --medium-border-radius
  radiusLg: "16px", // --default-border-radius (cards, tables, alerts)
  radiusPill: "999px",
  radiusButton: "24px", // --button-border-radius (pill buttons)
  radiusInput: "8px", // --small-border-radius
  borderWidth: "1px", // --default-border-width
  /* Shadows — is deliberately flat; shadows only on floating layers */
  shadowSm: "0 1px 2px 0 rgba(113, 128, 149, 0.5)", // --default-shadow (exact alpha)
  shadowMd: "0 2px 8px 0 rgba(113, 128, 149, 0.5)", // --primary-shadow (exact alpha)
  shadowLg: "0 12px 32px rgba(2, 16, 43, 0.16)", // floating overlays / modals
  /* Spacing — 4 / 8 / 12 / 20 / 32 rhythm */
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "12px",
  spacingL: "20px",
  spacingXl: "32px",
  /* Gradients — advertising gradient is corporate-6 → corporate-4 */
  gradientBrand: "linear-gradient(120deg, #003d8f 0%, #1474c4 100%)",
  gradientAccent: "linear-gradient(120deg, #1474c4 0%, #11c7e6 100%)",
  gradientWarm: "linear-gradient(120deg, #ffaa00 0%, #ff6159 100%)",
  gradientCool: "linear-gradient(120deg, #0b2a63 0%, #08a5c5 100%)",
  gradientSuccess: "linear-gradient(120deg, #0fa954 0%, #11c7e6 100%)",
  gradientDanger: "linear-gradient(120deg, #ff6159 0%, #c80a00 100%)",
  /* Buttons — semibold, pill, 20px horizontal padding */
  buttonFontWeight: "600",
  buttonTextTransform: "none",
  buttonLetterSpacing: "0",
  buttonPaddingY: "4px", // --button-padding: 4px 20px
  buttonPaddingX: "20px",
  /* Motion — uses snappy 0.1s ease-out transitions */
  transitionDuration: "100ms",
  motionFast: "80ms",
  motionBase: "120ms",
  motionSlow: "240ms",
  motionEase: "ease-out",
  /* Chart palette — brand hues */
  chart1: "#1474c4", // corporate-4 (blue)
  chart2: "#08a5c5", // activating-4 (cyan)
  chart3: "#0fa954", // success-4 (green)
  chart4: "#ffaa00", // warning-3 (amber)
  chart5: "#b410e7", // promoting-5 (magenta)
  chart6: "#0b2a63", // corporate-7 (navy)
};

/**
 * Modern — clean, friendly SaaS dashboard. Light off-white page, crisp white
 * surfaces, generous rounding, feather-soft diffuse shadows, an ink (near
 * black) primary rendered as pill buttons, a violet accent, and a vibrant
 * multi-hue chart palette. The aesthetic is the contemporary product-dashboard
 * look: airy, rounded, low-contrast chrome with confident black call-to-actions.
 */
export const modernTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#f4f5f7",
  colorBgSubtle: "#eef0f3",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f6f7f9",
  colorBorder: "#ebedf1",
  colorBorderControl: "#787d88",
  colorBorderSubtle: "rgba(17, 24, 39, 0.06)",
  colorText: "#111827",
  // Was #6b7280: 4.83:1 on the white surface but 4.43:1 on the #f4f5f7 page and
  // 4.23:1 on #eef0f3, and muted captions sit on the page as often as on a card.
  // #585f6b is the same cool grey at 6.43 / 5.90 / 5.64:1.
  colorTextMuted: "#585f6b",
  colorPrimary: "#111827",
  colorPrimaryHover: "#000000",
  colorPrimaryText: "#ffffff",
  colorAccent: "#7c5cfc",
  colorAccentHover: "#6a47f5",
  colorAccentText: "#ffffff",
  // The violet accent is 4.38:1 on #ffffff and 3.84:1 on the #eef0f3 page — just
  // under the text bar in both, and it is also the badge fill and the
  // gradientAccent stop, so it stays. The link takes one step down the same
  // ramp (the value this theme already uses for accentHover): 5.48:1 on #ffffff,
  // 4.80:1 on #eef0f3; hover goes to 6.67 / 5.84:1.
  colorLink: "#6a47f5",
  colorLinkHover: "#5b34ec",
  colorFocusRing: "#7c5cfc",
  colorSuccess: "#22c55e",
  colorWarning: "#f59e0b",
  colorDanger: "#f43f5e",
  colorInfo: "#2563eb",
  // 2.0-3.7:1 as text on this theme's surfaces; same hues at text depth give
  // 6.20 / 5.77 / 6.29 / 6.70:1 on #ffffff and >= 5.05:1 on #eef0f3.
  colorSuccessText: "#12702f",
  colorWarningText: "#9a5400",
  colorDangerText: "#be123c",
  colorInfoText: "#1d4ed8",
  // Ink ON the fills: 6.87 / 6.97 / 4.84:1. This theme's info is blue-600, dark
  // enough that white is the better ink there (5.17:1 against 2.86:1 for a dark
  // one). onDanger is rose-tinted to match #f43f5e rather than reusing light's
  // red-tinted ink.
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#33061a",
  colorOnInfo: "#ffffff",
  fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontWeightHeading: "700",
  letterSpacingHeading: "-0.02em",
  radiusXs: "8px",
  radiusSm: "12px",
  radiusMd: "18px",
  radiusLg: "24px",
  radiusButton: "999px",
  radiusInput: "12px",
  shadowSm: "0 1px 3px rgba(17, 24, 39, 0.05)",
  shadowMd: "0 8px 30px rgba(17, 24, 39, 0.07)",
  shadowLg: "0 24px 60px rgba(17, 24, 39, 0.10)",
  spacingXs: "5px",
  spacingS: "10px",
  spacingM: "16px",
  spacingL: "24px",
  spacingXl: "40px",
  // See softTheme: light's 48px/80px would otherwise cap this theme's scale.
  spacing2xl: "60px",
  spacing3xl: "100px",
  buttonFontWeight: "600",
  buttonPaddingY: "10px",
  buttonPaddingX: "18px",
  gradientBrand: "linear-gradient(120deg, #111827 0%, #4b3f72 50%, #7c5cfc 100%)",
  gradientAccent: "linear-gradient(120deg, #7c5cfc 0%, #2563eb 100%)",
  gradientWarm: "linear-gradient(120deg, #ff7849 0%, #f43f5e 100%)",
  gradientCool: "linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)",
  chart1: "#7c5cfc",
  chart2: "#ff7849",
  chart3: "#2563eb",
  chart4: "#22c55e",
  chart5: "#f43f5e",
  chart6: "#fbbf24",
};

/**
 * Corporate — contemporary enterprise workspace.
 *
 * A single-hue system: graphite neutrals with a faint green cast, pure white
 * surfaces, and one confident deep-teal brand colour that carries primary
 * buttons, links, the focus ring and the first chart series. Controls are
 * square-shouldered (8px, not pills), hairlines are crisp, shadows are tight
 * and short-throw, and the type is Inter over a Space Grotesk display face at a
 * 15px base — roomy enough to read all day, dense enough for a data console.
 *
 * Deliberately unlike its siblings: `modern` is ink + violet on pill buttons
 * with 24px radii, `light` is indigo, `soft` pastel, `glass` translucent, and
 * the private `vision` theme is navy + cyan pills. Teal on graphite with 8px
 * corners is nobody else's territory.
 *
 * Contrast notes (WCAG AA, measured against `colorSurface` #ffffff, the page
 * `colorBg` #f5f7f8 and the `colorBgSubtle` #eaeef0 tint, worst case listed):
 *   primary #0f766e as text 4.69:1 · white on primary 5.47:1
 *   textMuted 5.56:1 · borderControl 3.45:1 (>= the 3:1 shape bar)
 *   status *Text tokens 5.08-5.83:1 · ink on every status fill >= 4.70:1
 */
export const corporateTheme: ThemeTokens = {
  ...lightTheme,
  /* ----- Surface & semantic ----- */
  // Graphite with a whisper of green so the canvas agrees with the teal brand
  // hue instead of fighting it (light's #f8fafc is blue-cast).
  colorBg: "#f5f7f8",
  colorBgSubtle: "#eaeef0",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f2f5f6",
  colorBorder: "#dfe5e8",
  colorBorderSubtle: "rgba(13, 31, 34, 0.07)",
  // 3.45:1 on the darkest of the three surfaces — the accessible boundary for
  // inputs/checkboxes, kept separate from the decorative `colorBorder` hairline.
  colorBorderControl: "#71818a",
  colorText: "#0d1f22",
  colorTextMuted: "#4d616a",
  colorPrimary: "#0f766e",
  // Primary DARKENS on hover (the private vision theme brightens — that is its
  // signature, not a house rule).
  colorPrimaryHover: "#0b5f58",
  colorPrimaryText: "#ffffff",
  // One step brighter than primary so tinted accents read as a second voice in
  // the same family; still 5.01:1 under white ink as a fill.
  colorAccent: "#0b7d72",
  colorAccentHover: "#0a6a61",
  colorAccentText: "#ffffff",
  colorLink: "#0f766e",
  colorLinkHover: "#115e59",
  colorFocusRing: "#0f766e",
  colorSuccess: "#16a34a",
  colorWarning: "#f59e0b",
  colorDanger: "#e11d48",
  // Sky rather than cyan: a cyan info would collide with the teal brand hue and
  // stop reading as a status at all.
  colorInfo: "#0369a1",
  colorSuccessText: "#0a7038",
  colorWarningText: "#8a4b00",
  colorDangerText: "#be123c",
  colorInfoText: "#075985",
  // Ink ON the fills. Success and warning are bright enough to need dark ink
  // (4.75 / 6.97:1); the rose danger and the sky info are dark enough that white
  // is the correct answer (4.70 / 5.93:1).
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#ffffff",
  colorOnInfo: "#ffffff",
  colorSurfaceHover: "rgba(15, 118, 110, 0.06)",
  /* ----- Typography — Inter body, Space Grotesk display, 15px/1.55 ----- */
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyHeading:
    "'Space Grotesk', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSizeBase: "15px",
  fontSizeSm: "13px",
  fontSizeLg: "17px",
  fontSizeHeading: "17px",
  fontSizeTitle: "24px",
  fontWeightBody: "400",
  fontWeightHeading: "600",
  lineHeightBody: "1.55",
  lineHeightHeading: "1.25",
  letterSpacingHeading: "-0.015em",
  headingTextTransform: "none",
  /* ----- Shape — square-shouldered, 8px controls ----- */
  radiusXs: "3px",
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "14px",
  radiusPill: "999px",
  radiusButton: "8px",
  radiusInput: "8px",
  borderWidth: "1px",
  /* ----- Shadows — short throw, graphite-tinted, always paired with a hairline ----- */
  shadowSm: "0 1px 2px rgba(13, 31, 34, 0.06), 0 1px 1px rgba(13, 31, 34, 0.04)",
  shadowMd: "0 4px 16px rgba(13, 31, 34, 0.08), 0 1px 2px rgba(13, 31, 34, 0.05)",
  shadowLg: "0 16px 48px rgba(13, 31, 34, 0.14), 0 2px 6px rgba(13, 31, 34, 0.06)",
  /* ----- Spacing — 4 / 8 / 14 / 22 / 36 ----- */
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "14px",
  spacingL: "22px",
  spacingXl: "36px",
  // See softTheme: light's 48px/80px would otherwise cap this theme's scale.
  spacing2xl: "56px",
  spacing3xl: "88px",
  /* ----- Gradients ----- */
  gradientBrand: "linear-gradient(120deg, #0d1f22 0%, #0f766e 55%, #14b8a6 100%)",
  gradientAccent: "linear-gradient(120deg, #0f766e 0%, #0369a1 100%)",
  gradientWarm: "linear-gradient(120deg, #f59e0b 0%, #e11d48 100%)",
  gradientCool: "linear-gradient(120deg, #0369a1 0%, #14b8a6 100%)",
  gradientSuccess: "linear-gradient(120deg, #16a34a 0%, #14b8a6 100%)",
  gradientDanger: "linear-gradient(120deg, #e11d48 0%, #9f1239 100%)",
  /* ----- Buttons — compact, semibold, a hair of tracking ----- */
  buttonFontWeight: "600",
  buttonTextTransform: "none",
  buttonLetterSpacing: "0.01em",
  buttonPaddingY: "9px",
  buttonPaddingX: "16px",
  /* ----- Motion — decisive, with a fast-out easing curve ----- */
  transitionDuration: "150ms",
  motionFast: "110ms",
  motionBase: "170ms",
  motionSlow: "300ms",
  motionEase: "cubic-bezier(0.2, 0, 0, 1)",
  /* ----- Charts — brand teal first, then a wide-spread supporting set ----- */
  chart1: "#0f766e",
  chart2: "#0369a1",
  chart3: "#f59e0b",
  chart4: "#7c3aed",
  chart5: "#e11d48",
  chart6: "#65a30d",
};

/**
 * Web fonts a built-in theme needs in order to look like itself.
 *
 * Selecting a theme by name (`theme="corporate"` or `$theme({ name: ... })`)
 * previously loaded no fonts at all — only a program that spelled out
 * `$theme({ fonts: { import: [...] } })` triggered `loadFonts`. For the
 * vision theme that meant every page rendered in `system-ui` instead of the
 * UI block typefaces, so the whole UI block type ladder (and every font-weight
 * correction in the theme) was invisible outside the parity harnesses, which
 * load the fonts themselves.
 *
 * UI block self-hosts OpenSansRegular / OpenSansSemibold / OverpassRegular /
 * OverpassSemibold and always asks for weight 400, taking its boldness from the
 * font FILE. The closest equivalent here is the same two families at 400 and 600.
 *
 * Keyed by theme name, private themes included — `loadBuiltInThemeFonts` looks
 * a name up here directly, so a private theme still gets its typefaces.
 */
export const builtInThemeFonts: Record<string, { import: string[] }> = {
  corporate: { import: ["Inter:400,500,600,700", "Space Grotesk:500,600,700"] },
  vision: { import: ["Open Sans:400,600", "Overpass:400,600"] },
};

/**
 * The PUBLIC theme registry.
 *
 * This record is the single source of truth for every surface that enumerates
 * themes: `langSpec.themeNames` (playground picker + editor autocomplete), the
 * generated VS Code metadata, the agent-skill reference and the docs. Adding a
 * key here publishes the theme; see `privateThemes` for the other case.
 */
export const builtInThemes: Record<string, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
  corporate: corporateTheme,
  soft: softTheme,
  glass: glassTheme,
  modern: modernTheme,
};

/**
 * Themes that RESOLVE by name but are not advertised anywhere.
 *
 * `theme="vision"`, `setTheme("vision")` and `$theme({ name: "vision" })` all
 * behave exactly like a built-in — same token application, same
 * `data-rui-theme` marker driving the per-theme CSS block, same web fonts —
 * but the name is absent from `builtInThemes`, so nothing that enumerates
 * themes (theme pickers, autocomplete, docs, README) can surface it.
 *
 * Deliberately NOT merged into `builtInThemes`: every enumerating surface reads
 * that record, so one merge would undo the privacy in a dozen places at once.
 */
export const privateThemes: Record<string, ThemeTokens> = {
  vision: visionTheme,
};

/**
 * Look a theme name up across both registries. This — not `builtInThemes` — is
 * what a *resolver* should consult; `builtInThemes` is for *enumeration*.
 */
export function findThemeByName(name: unknown): ThemeTokens | null {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return builtInThemes[key] ?? privateThemes[key] ?? null;
}

const TOKEN_TO_CSS: Record<keyof ThemeTokens, string> = {
  colorBg: "--rui-color-bg",
  colorBgSubtle: "--rui-color-bg-subtle",
  colorSurface: "--rui-color-surface",
  colorSurfaceMuted: "--rui-color-surface-muted",
  colorBorder: "--rui-color-border",
  colorBorderSubtle: "--rui-color-border-subtle",
  colorBorderControl: "--rui-color-border-control",
  colorText: "--rui-color-text",
  colorTextMuted: "--rui-color-text-muted",
  colorPrimary: "--rui-color-primary",
  colorPrimaryHover: "--rui-color-primary-hover",
  colorPrimaryText: "--rui-color-primary-text",
  colorAccent: "--rui-color-accent",
  colorAccentHover: "--rui-color-accent-hover",
  colorAccentText: "--rui-color-accent-text",
  colorLink: "--rui-color-link",
  colorLinkHover: "--rui-color-link-hover",
  colorFocusRing: "--rui-color-focus-ring",
  colorSuccess: "--rui-color-success",
  colorWarning: "--rui-color-warning",
  colorDanger: "--rui-color-danger",
  colorInfo: "--rui-color-info",
  colorSuccessText: "--rui-color-success-text",
  colorWarningText: "--rui-color-warning-text",
  colorDangerText: "--rui-color-danger-text",
  colorInfoText: "--rui-color-info-text",
  colorOnSuccess: "--rui-color-on-success",
  colorOnWarning: "--rui-color-on-warning",
  colorOnDanger: "--rui-color-on-danger",
  colorOnInfo: "--rui-color-on-info",
  colorSurfaceHover: "--rui-color-surface-hover",
  fontFamily: "--rui-font-family",
  fontFamilyHeading: "--rui-font-family-heading",
  fontFamilyMono: "--rui-font-family-mono",
  fontSizeBase: "--rui-font-size-base",
  fontSize10: "--rui-font-size-10",
  fontSize11: "--rui-font-size-11",
  fontSize13: "--rui-font-size-13",
  fontSize15: "--rui-font-size-15",
  fontSize18: "--rui-font-size-18",
  fontSize20: "--rui-font-size-20",
  fontSize24: "--rui-font-size-24",
  fontSize32: "--rui-font-size-32",
  fontSizeSm: "--rui-font-size-sm",
  fontSizeLg: "--rui-font-size-lg",
  fontSizeHeading: "--rui-font-size-heading",
  fontSizeTitle: "--rui-font-size-title",
  fontWeightBody: "--rui-font-weight-body",
  fontWeightHeading: "--rui-font-weight-heading",
  lineHeightBody: "--rui-line-height-body",
  lineHeightHeading: "--rui-line-height-heading",
  letterSpacingHeading: "--rui-letter-spacing-heading",
  headingTextTransform: "--rui-heading-text-transform",
  radiusXs: "--rui-radius-xs",
  radiusSm: "--rui-radius-sm",
  radiusMd: "--rui-radius-md",
  radiusLg: "--rui-radius-lg",
  radiusPill: "--rui-radius-pill",
  radiusButton: "--rui-radius-button",
  radiusInput: "--rui-radius-input",
  borderWidth: "--rui-border-width",
  shadowSm: "--rui-shadow-sm",
  shadowMd: "--rui-shadow-md",
  shadowLg: "--rui-shadow-lg",
  spacing3xs: "--rui-spacing-3xs",
  spacing2xs: "--rui-spacing-2xs",
  spacingXs: "--rui-spacing-xs",
  spacingS: "--rui-spacing-s",
  spacingM: "--rui-spacing-m",
  spacingL: "--rui-spacing-l",
  spacingXl: "--rui-spacing-xl",
  spacing2xl: "--rui-spacing-2xl",
  spacing3xl: "--rui-spacing-3xl",
  gradientBrand: "--rui-gradient-brand",
  gradientAccent: "--rui-gradient-accent",
  gradientWarm: "--rui-gradient-warm",
  gradientCool: "--rui-gradient-cool",
  gradientSuccess: "--rui-gradient-success",
  gradientDanger: "--rui-gradient-danger",
  buttonFontWeight: "--rui-button-font-weight",
  buttonTextTransform: "--rui-button-text-transform",
  buttonLetterSpacing: "--rui-button-letter-spacing",
  buttonPaddingY: "--rui-button-padding-y",
  buttonPaddingX: "--rui-button-padding-x",
  transitionDuration: "--rui-transition-duration",
  motionFast: "--rui-motion-fast",
  motionBase: "--rui-motion-base",
  motionSlow: "--rui-motion-slow",
  motionEase: "--rui-motion-ease",
  zBase: "--rui-z-base",
  zRaised: "--rui-z-raised",
  zDropdown: "--rui-z-dropdown",
  zSticky: "--rui-z-sticky",
  zBanner: "--rui-z-banner",
  zOverlay: "--rui-z-overlay",
  zModal: "--rui-z-modal",
  zPopover: "--rui-z-popover",
  zToast: "--rui-z-toast",
  zTooltip: "--rui-z-tooltip",
  hlKeyword: "--rui-hl-keyword",
  hlString: "--rui-hl-string",
  hlNumber: "--rui-hl-number",
  hlComment: "--rui-hl-comment",
  hlFn: "--rui-hl-fn",
  hlTag: "--rui-hl-tag",
  hlAttr: "--rui-hl-attr",
  hlPunct: "--rui-hl-punct",
  chart1: "--rui-chart-1",
  chart2: "--rui-chart-2",
  chart3: "--rui-chart-3",
  chart4: "--rui-chart-4",
  chart5: "--rui-chart-5",
  chart6: "--rui-chart-6",
};

export type ThemeInput = string | Partial<ThemeTokens>;

export interface ResolvedTheme {
  /** Built-in theme name when known, otherwise "custom". Drives `data-rui-theme`. */
  name: string;
  tokens: ThemeTokens;
}

export function resolveTheme(input: ThemeInput | null | undefined): ResolvedTheme {
  if (!input) return { name: "light", tokens: lightTheme };
  if (typeof input === "string") {
    const key = input.trim().toLowerCase();
    if (key.startsWith("{")) {
      try {
        return { name: "custom", tokens: mergeTheme(JSON.parse(input) as Partial<ThemeTokens>) };
      } catch {
        return { name: "light", tokens: lightTheme };
      }
    }
    const tokens = findThemeByName(key);
    if (tokens) return { name: key, tokens };
    return { name: "light", tokens: lightTheme };
  }
  return { name: "custom", tokens: mergeTheme(input) };
}

/**
 * Apply theme tokens to the host element. Also sets `data-rui-theme` so the
 * shadow-DOM stylesheet can hook into theme-specific overrides (fonts,
 * gradients, animations, etc.) that go beyond raw token values.
 */
export function applyTheme(host: HTMLElement, theme: ResolvedTheme | ThemeTokens): void {
  const resolved: ResolvedTheme =
    "tokens" in theme ? theme : { name: "custom", tokens: theme };
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS) as Array<[keyof ThemeTokens, string]>) {
    const value = resolved.tokens[key];
    // Optional tokens (motion/z-index) may be absent — clear instead of
    // writing the string "undefined" so `var(--…, fallback)` still works.
    if (value == null) host.style.removeProperty(cssVar);
    else host.style.setProperty(cssVar, value);
  }
  host.setAttribute("data-rui-theme", resolved.name);
}

/**
 * Apply *only* the tokens explicitly listed in `partial`. Leaves every other
 * CSS variable untouched, so this composes cleanly on top of whatever base
 * theme `applyTheme(...)` last wrote. Used by the in-script `Theme(...)`
 * construct so authors can override just a handful of tokens without
 * wiping the rest of the active theme.
 *
 * Unknown keys are ignored — both for forward compatibility and to keep
 * malformed LLM output from polluting the host's inline styles.
 */
export function applyPartialTheme(
  host: HTMLElement,
  partial: Partial<ThemeTokens>,
): ReadonlyArray<keyof ThemeTokens> {
  const applied: Array<keyof ThemeTokens> = [];
  for (const key of Object.keys(partial) as Array<keyof ThemeTokens>) {
    const cssVar = TOKEN_TO_CSS[key];
    if (!cssVar) continue;
    const value = partial[key];
    if (typeof value !== "string" || value === "") continue;
    host.style.setProperty(cssVar, value);
    applied.push(key);
  }
  return applied;
}

/**
 * Remove an array of token CSS variables from the host's inline style. Used
 * to "undo" a previous `applyPartialTheme(...)` call so the next render
 * inherits whatever the base theme provides rather than the stale override.
 */
export function clearTokenOverrides(
  host: HTMLElement,
  keys: ReadonlyArray<keyof ThemeTokens>,
): void {
  for (const key of keys) {
    const cssVar = TOKEN_TO_CSS[key];
    if (cssVar) host.style.removeProperty(cssVar);
  }
}

/**
 * Filter an arbitrary object down to the keys recognised by `ThemeTokens`,
 * stringifying primitive values along the way. Used when an Aktion program
 * applies `$theme({...})` — the evaluator hands us
 * a plain JS object, and we want to ignore anything that isn't a real token
 * (LLM typo guard) before applying it.
 */
export function sanitiseThemeTokens(input: unknown): Partial<ThemeTokens> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Partial<ThemeTokens> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(key in TOKEN_TO_CSS)) continue;
    if (value == null) continue;
    if (typeof value === "string") {
      if (value.trim() === "") continue;
      out[key as keyof ThemeTokens] = value;
    } else if (typeof value === "number") {
      out[key as keyof ThemeTokens] = String(value);
    }
  }
  return out;
}

function mergeTheme(partial: Partial<ThemeTokens>): ThemeTokens {
  return { ...lightTheme, ...partial };
}
