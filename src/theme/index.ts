/**
 * Theme tokens applied as CSS custom properties on the host element.
 *
 * Built-in themes:
 *   - "light"         (default)
 *   - "dark"
 *   - "shadcn"        (= "shadcn-light") · "shadcn-light" · "shadcn-dark"
 *                     shadcn/ui's default `neutral` theme: white page, ink
 *                     primary, one flat grey wash, hairline borders, 8px
 *                     controls on 14px Geist
 *   - "mui"           (= "mui-light") · "mui-light" · "mui-dark"
 *                     Material UI's default theme: #1976d2 primary, 4px
 *                     radii everywhere, uppercase buttons, Roboto, and the
 *                     real three-layer elevation shadows
 *   - "heroui"        (= "heroui-light") · "heroui-light" · "heroui-dark"
 *                     HeroUI: #006fee primary, 12–14px corners, borderless
 *                     cards on soft shadows, opacity-dimming hovers and a
 *                     2px offset focus outline, on 16px Inter
 *   - "soft"          (soft, friendly, light & rounded; lavender + mint)
 *
 * Each framework family is ONE design in two modes; the bare name is the
 * light one. All three names of a family share a CSS block in `styles.ts`.
 *
 * Private themes (see `privateThemes`) resolve by name exactly like the ones
 * above but are deliberately absent from `builtInThemes`, so they never reach
 * `langSpec.themeNames`, the docs' theme pickers or the published reference.
 * The retired `modern` / `glass` / `corporate` names live there too, pointing
 * at the themes that replaced them (see `deprecatedThemeAliases`).
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
   * white surface, and `heroui-dark`'s `#006fee` 3.80:1 on its `content1` card.
   *
   * A theme whose accent already clears 4.5:1 as text (light 6.29:1, dark
   * 5.95:1, `heroui-light` 4.66:1) can omit both and inherit the derivation.
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
   * Values are per theme because the fills are: shadcn's destructive `#e7000b`
   * is dark enough that white is the correct ink (4.77:1), while soft's pastel
   * `#fda4af` needs a deep rose. No status fill had to be darkened — a
   * hue-matched dark ink clears 4.5:1 on all four hues in every theme.
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
 * Vision — enterprise cloud-console aesthetic. Deep navy primary, calm
 * cyan accents, very pale blue page background, white surfaces with crisp
 * 1px borders, small radii, and Open Sans / Overpass type. The look should
 * feel at home in an admin panel: dense, scannable, minimal chrome.
 *
 * PRIVATE. Registered in `privateThemes`, not in `builtInThemes`, so
 * `theme="vision"` and `$theme({ name: "vision" })` resolve normally while the
 * name stays out of `langSpec.themeNames` — the single source the playground
 * theme picker, the editor autocomplete and the generated docs all read from.
 * (Formerly "skyline", then "corporate"; the `corporate` key is now a
 * deprecated alias of `heroui-light` — see `deprecatedThemeAliases`.)
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
  // (It held `#c80a00` — the fill — for a while, contradicting the note directly
  // above it, and the whole family shipped red-on-red with it:
  // `.rui-confirm-ok[data-tone="danger"]`, `.rui-button[data-variant="danger"]`,
  // `.rui-icon-button[data-variant="danger"]`, the danger toast icon,
  // `.rui-product-badge`, `.rui-tabbar-badge` and the error step marker all paint
  // this token on `colorDanger`.) #ffffff on critical-5 #c80a00 is 6.00:1.
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

/* ==========================================================================
   shadcn/ui  —  `shadcn` · `shadcn-light` · `shadcn-dark`
   ========================================================================== */

/**
 * shadcn/ui (light) — a faithful re-creation of the default `neutral` shadcn
 * theme, the one `npx shadcn@latest init` produces.
 *
 * Every colour below is the sRGB value of the corresponding `oklch(...)` custom
 * property in shadcn's own `globals.css`:
 *
 *   --background #ffffff · --foreground #0a0a0a · --card #ffffff
 *   --primary #171717 · --primary-foreground #fafafa
 *   --secondary / --muted / --accent #f5f5f5 · --muted-foreground #737373
 *   --border / --input #e5e5e5 · --destructive #e7000b
 *   --radius 0.625rem (10px), with `rounded-md` (8px) on buttons and inputs
 *   and `rounded-xl` (14px) on cards
 *
 * The look: pure white page, near-black primary buttons with a white label,
 * one flat neutral grey doing secondary / muted / accent duty, hairline
 * borders, a 3px translucent focus ring, `shadow-xs` on almost everything, and
 * Geist at 14px (`text-sm`, which is shadcn's component default).
 *
 * Two values are NOT shadcn's, and both are accessibility corrections the
 * repo applies to every theme:
 *   - `colorBorderControl` #8f8f8f (3.24:1) rather than `--input` #e5e5e5
 *     (1.20:1) — WCAG 1.4.11 wants 3:1 on the boundary of a control the user
 *     has to find. Decorative hairlines keep `colorBorder` #e5e5e5.
 *   - `colorFocusRing` #737373 (4.74:1) rather than `--ring` #a1a1a1
 *     (2.58:1). It is still shadcn's neutral-grey ring, one step down the
 *     same ramp, and it is the value shadcn itself shipped before v4.
 */
export const shadcnLightTheme: ThemeTokens = {
  ...lightTheme,
  /* ----- Surface & semantic ----- */
  colorBg: "#ffffff",
  colorBgSubtle: "#fafafa",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f5f5f5",
  colorBorder: "#e5e5e5",
  colorBorderSubtle: "rgba(10, 10, 10, 0.06)",
  colorBorderControl: "#8f8f8f",
  colorText: "#0a0a0a",
  colorTextMuted: "#737373",
  colorPrimary: "#171717",
  // shadcn hovers a solid button by dropping the fill to `bg-primary/90`,
  // which over a white page LIGHTENS it. This is that composite.
  colorPrimaryHover: "#2e2e2e",
  colorPrimaryText: "#fafafa",
  // shadcn has no second brand hue — `--accent` is the same neutral wash as
  // `--muted`, and anything that wants attention uses the ink primary.
  colorAccent: "#171717",
  colorAccentHover: "#2e2e2e",
  colorAccentText: "#fafafa",
  colorLink: "#171717",
  colorLinkHover: "#404040",
  colorFocusRing: "#737373",
  // shadcn ships one semantic colour (`--destructive`); the other three are
  // the Tailwind v4 hues its own examples and charts reach for.
  colorSuccess: "#16a34a",
  colorWarning: "#f59e0b",
  colorDanger: "#e7000b",
  colorInfo: "#2563eb",
  colorSuccessText: "#15803d",
  colorWarningText: "#a35a00",
  colorDangerText: "#c10007",
  colorInfoText: "#1d4ed8",
  // shadcn paints white on `--destructive`, and white clears 4.5:1 on that
  // fill (4.77:1) — so unlike most themes here, three of the four inks are
  // simply white. Success and warning are too light for it.
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#ffffff",
  colorOnInfo: "#ffffff",
  colorSurfaceHover: "rgba(10, 10, 10, 0.05)",
  /* ----- Typography — Geist, 14px (`text-sm`) ----- */
  fontFamily:
    "'Geist', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading:
    "'Geist', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSizeBase: "14px",
  fontSizeSm: "12px",
  fontSizeLg: "16px",
  fontSizeHeading: "16px",
  fontSizeTitle: "24px",
  fontWeightBody: "400",
  fontWeightHeading: "600",
  lineHeightBody: "1.5",
  lineHeightHeading: "1.25",
  letterSpacingHeading: "-0.015em",
  headingTextTransform: "none",
  /* ----- Shape — `--radius: 0.625rem` and its four derived rungs ----- */
  radiusXs: "4px",
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "14px",
  radiusPill: "999px",
  radiusButton: "8px",
  radiusInput: "8px",
  borderWidth: "1px",
  /* ----- Shadows — Tailwind's `shadow-xs` / `shadow-md` / `shadow-lg` ----- */
  shadowSm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  shadowMd: "0 4px 6px -1px rgba(0, 0, 0, 0.10), 0 2px 4px -2px rgba(0, 0, 0, 0.10)",
  shadowLg: "0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -4px rgba(0, 0, 0, 0.10)",
  /* ----- Spacing — Tailwind's 4px grid, `p-6` cards ----- */
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "12px",
  spacingL: "24px",
  spacingXl: "36px",
  spacing2xl: "56px",
  spacing3xl: "88px",
  /* ----- Gradients — neutral-first, the way shadcn's own marketing reads ----- */
  gradientBrand: "linear-gradient(120deg, #0a0a0a 0%, #404040 55%, #737373 100%)",
  gradientAccent: "linear-gradient(120deg, #171717 0%, #525252 100%)",
  gradientWarm: "linear-gradient(120deg, #f59e0b 0%, #e7000b 100%)",
  gradientCool: "linear-gradient(120deg, #2563eb 0%, #06b6d4 100%)",
  gradientSuccess: "linear-gradient(120deg, #16a34a 0%, #22c55e 100%)",
  gradientDanger: "linear-gradient(120deg, #e7000b 0%, #9f0712 100%)",
  /* ----- Buttons — `h-9 px-4 text-sm font-medium` ----- */
  buttonFontWeight: "500",
  buttonTextTransform: "none",
  buttonLetterSpacing: "0",
  buttonPaddingY: "8px",
  buttonPaddingX: "16px",
  /* ----- Motion — Tailwind's 150ms / `ease-in-out` default ----- */
  transitionDuration: "150ms",
  motionFast: "100ms",
  motionBase: "150ms",
  motionSlow: "300ms",
  motionEase: "cubic-bezier(0.4, 0, 0.2, 1)",
  /* ----- Charts — the five `--chart-*` values from shadcn's light block ----- */
  chart1: "#e76e50",
  chart2: "#2a9d90",
  chart3: "#274754",
  chart4: "#e8c468",
  chart5: "#f4a462",
  chart6: "#9c6644",
};

/**
 * shadcn/ui (dark) — the `.dark` block of the same file.
 *
 *   --background #0a0a0a · --card / --popover #171717 · --foreground #fafafa
 *   --primary #e5e5e5 · --primary-foreground #171717
 *   --secondary / --muted / --accent #262626 · --muted-foreground #a1a1a1
 *   --border oklch(1 0 0 / 10%) · --ring #737373 · --destructive #ff6467
 *
 * Note the inversion: in dark mode shadcn's primary button is a near-WHITE
 * pill of ink with dark text, which is the single most recognisable thing
 * about the theme.
 */
export const shadcnDarkTheme: ThemeTokens = {
  ...shadcnLightTheme,
  colorBg: "#0a0a0a",
  colorBgSubtle: "#0f0f0f",
  colorSurface: "#171717",
  colorSurfaceMuted: "#262626",
  colorBorder: "#262626",
  colorBorderSubtle: "rgba(255, 255, 255, 0.08)",
  colorBorderControl: "#737373",
  colorText: "#fafafa",
  colorTextMuted: "#a1a1a1",
  colorPrimary: "#e5e5e5",
  colorPrimaryHover: "#cfcfcf",
  colorPrimaryText: "#171717",
  colorAccent: "#e5e5e5",
  colorAccentHover: "#cfcfcf",
  colorAccentText: "#171717",
  colorLink: "#fafafa",
  colorLinkHover: "#d4d4d4",
  colorFocusRing: "#737373",
  colorSuccess: "#22c55e",
  colorWarning: "#f59e0b",
  colorDanger: "#ff6467",
  colorInfo: "#3b82f6",
  // On #171717 all four fills already clear the 4.5:1 text bar (7.9 / 10.4 /
  // 6.4 / 4.9:1), so the text partners are the hues themselves — light's
  // darkened values would be unreadable here.
  colorSuccessText: "#22c55e",
  colorWarningText: "#f59e0b",
  colorDangerText: "#ff6467",
  colorInfoText: "#3b82f6",
  // The dark fills are bright, so the ink flips the other way: white on
  // #ff6467 is 2.4:1 and on #3b82f6 3.7:1.
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#2c0606",
  colorOnInfo: "#08131f",
  colorSurfaceHover: "rgba(255, 255, 255, 0.06)",
  shadowSm: "0 1px 2px 0 rgba(0, 0, 0, 0.35)",
  shadowMd: "0 4px 6px -1px rgba(0, 0, 0, 0.45), 0 2px 4px -2px rgba(0, 0, 0, 0.45)",
  shadowLg: "0 10px 15px -3px rgba(0, 0, 0, 0.55), 0 4px 6px -4px rgba(0, 0, 0, 0.50)",
  gradientBrand: "linear-gradient(120deg, #fafafa 0%, #a1a1a1 55%, #525252 100%)",
  gradientAccent: "linear-gradient(120deg, #e5e5e5 0%, #a1a1a1 100%)",
  // One Dark — CodeBlock's surface is `--rui-color-surface-muted`, #262626 here.
  hlKeyword: "#c678dd",
  hlString: "#98c379",
  hlNumber: "#d19a66",
  hlComment: "#9ca3af",
  hlFn: "#61afef",
  hlTag: "#e06c75",
  hlAttr: "#d19a66",
  hlPunct: "#abb2bf",
  /* The `--chart-*` values from shadcn's `.dark` block. */
  chart1: "#2662d9",
  chart2: "#2eb88a",
  chart3: "#e88c30",
  chart4: "#af57db",
  chart5: "#e23670",
  chart6: "#3ec9d6",
};

/* ==========================================================================
   Material UI  —  `mui` · `mui-light` · `mui-dark`
   ========================================================================== */

/**
 * Material UI (light) — MUI's default theme, token for token.
 *
 *   palette.primary.main #1976d2 / .dark #1565c0
 *   palette.secondary.main #9c27b0 / .dark #7b1fa2
 *   error #d32f2f · warning #ed6c02 · info #0288d1 · success #2e7d32
 *   text.primary rgba(0,0,0,0.87) · text.secondary rgba(0,0,0,0.6)
 *   divider rgba(0,0,0,0.12) · background.paper #fff
 *   shape.borderRadius 4 · spacing(1) = 8px
 *   typography Roboto, htmlFontSize 16, button 0.875rem/500/uppercase with
 *   0.02857em tracking
 *
 * `shadowSm` / `shadowMd` / `shadowLg` are MUI's elevation 1 / 4 / 24 strings
 * verbatim, which is what makes a Paper read as Material rather than as a
 * generic card: three stacked umbra / penumbra / ambient layers instead of one
 * soft drop shadow. The status *Text* tokens are MUI's own Alert text colours
 * (`rgb(30,70,32)`, `#663c00`, `#5f2120`, `#014361`).
 *
 * `colorBorderControl` #8c8c8c replaces MUI's `rgba(0,0,0,0.23)` outline for
 * the same WCAG 1.4.11 reason as every other theme here; the decorative
 * divider keeps the authentic `rgba(0,0,0,0.12)`.
 */
export const muiLightTheme: ThemeTokens = {
  ...lightTheme,
  /* ----- Surface & semantic ----- */
  colorBg: "#ffffff",
  colorBgSubtle: "#f5f5f5",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f5f5f5",
  colorBorder: "rgba(0, 0, 0, 0.12)",
  colorBorderSubtle: "rgba(0, 0, 0, 0.07)",
  colorBorderControl: "#8c8c8c",
  colorText: "rgba(0, 0, 0, 0.87)",
  colorTextMuted: "rgba(0, 0, 0, 0.6)",
  colorPrimary: "#1976d2",
  colorPrimaryHover: "#1565c0",
  colorPrimaryText: "#ffffff",
  colorAccent: "#9c27b0",
  colorAccentHover: "#7b1fa2",
  colorAccentText: "#ffffff",
  // MUI's Link is `primary.main`, which is 4.22:1 on the grey-100 band this
  // theme paints table headers and muted panels with — under the 4.5:1 text
  // bar. One step down the same ramp (`primary.dark`) gives 5.27:1 there and
  // 5.75:1 on white; hover continues to blue-900.
  colorLink: "#1565c0",
  colorLinkHover: "#0d47a1",
  colorFocusRing: "#1976d2",
  colorSuccess: "#2e7d32",
  colorWarning: "#ed6c02",
  colorDanger: "#d32f2f",
  colorInfo: "#0288d1",
  colorSuccessText: "#1e4620",
  colorWarningText: "#663c00",
  colorDangerText: "#5f2120",
  colorInfoText: "#014361",
  // Success and error are dark enough for MUI's own white label (5.13 / 4.98:1).
  // Warning and info are not (3.11 / 3.86:1), so those two take a hue-matched
  // dark ink instead — the one place this theme knowingly departs from MUI,
  // and only on the ~45 rules that paint a glyph ON the fill.
  colorOnSuccess: "#ffffff",
  colorOnWarning: "#451a03",
  colorOnDanger: "#ffffff",
  colorOnInfo: "#001724",
  colorSurfaceHover: "rgba(0, 0, 0, 0.04)",
  /* ----- Typography — Roboto, 16px body, MUI's h5/h6 for title/heading ----- */
  fontFamily: "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontFamilyHeading: "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontFamilyMono: "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSizeBase: "16px",
  fontSizeSm: "14px",
  fontSizeLg: "18px",
  fontSizeHeading: "20px",
  fontSizeTitle: "24px",
  fontWeightBody: "400",
  fontWeightHeading: "500",
  lineHeightBody: "1.5",
  lineHeightHeading: "1.334",
  letterSpacingHeading: "0.0075em",
  headingTextTransform: "none",
  /* ----- Shape — `shape.borderRadius: 4` really is the whole scale ----- */
  radiusXs: "2px",
  radiusSm: "4px",
  radiusMd: "4px",
  radiusLg: "4px",
  radiusPill: "999px",
  radiusButton: "4px",
  radiusInput: "4px",
  borderWidth: "1px",
  /* ----- Shadows — MUI elevation 1 / 4 / 24, verbatim ----- */
  shadowSm:
    "0px 2px 1px -1px rgba(0, 0, 0, 0.2), 0px 1px 1px 0px rgba(0, 0, 0, 0.14), 0px 1px 3px 0px rgba(0, 0, 0, 0.12)",
  shadowMd:
    "0px 2px 4px -1px rgba(0, 0, 0, 0.2), 0px 4px 5px 0px rgba(0, 0, 0, 0.14), 0px 1px 10px 0px rgba(0, 0, 0, 0.12)",
  shadowLg:
    "0px 11px 15px -7px rgba(0, 0, 0, 0.2), 0px 24px 38px 3px rgba(0, 0, 0, 0.14), 0px 9px 46px 8px rgba(0, 0, 0, 0.12)",
  /* ----- Spacing — `theme.spacing(n)` = n * 8 ----- */
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "16px",
  spacingL: "24px",
  spacingXl: "32px",
  spacing2xl: "48px",
  spacing3xl: "80px",
  /* ----- Gradients — primary → secondary, the only two brand hues MUI has -- */
  gradientBrand: "linear-gradient(120deg, #1976d2 0%, #9c27b0 100%)",
  gradientAccent: "linear-gradient(120deg, #9c27b0 0%, #1976d2 100%)",
  gradientWarm: "linear-gradient(120deg, #ed6c02 0%, #d32f2f 100%)",
  gradientCool: "linear-gradient(120deg, #0288d1 0%, #1976d2 100%)",
  gradientSuccess: "linear-gradient(120deg, #2e7d32 0%, #0288d1 100%)",
  gradientDanger: "linear-gradient(120deg, #d32f2f 0%, #9c27b0 100%)",
  /* ----- Buttons — MUI's `MuiButton` typography, exactly ----- */
  buttonFontWeight: "500",
  buttonTextTransform: "uppercase",
  buttonLetterSpacing: "0.02857em",
  buttonPaddingY: "6px",
  buttonPaddingX: "16px",
  /* ----- Motion — `transitions.duration` shortest / standard / complex ----- */
  transitionDuration: "150ms",
  motionFast: "150ms",
  motionBase: "250ms",
  motionSlow: "300ms",
  motionEase: "cubic-bezier(0.4, 0, 0.2, 1)",
  /* ----- Charts — MUI X's default `blueberryTwilightPalette` (light) ----- */
  chart1: "#02b2af",
  chart2: "#2e96ff",
  chart3: "#b800d8",
  chart4: "#60009b",
  chart5: "#2731c8",
  chart6: "#03008d",
};

/**
 * Material UI (dark) — `createTheme({ palette: { mode: "dark" } })`.
 *
 *   primary.main #90caf9 · secondary.main #ce93d8
 *   error #f44336 · warning #ffa726 · info #29b6f6 · success #66bb6a
 *   text.primary #fff · text.secondary rgba(255,255,255,0.7)
 *   divider rgba(255,255,255,0.12) · background.default / .paper #121212
 *
 * `colorSurface` is #1e1e1e rather than the raw #121212 because MUI's dark
 * Paper composites an elevation overlay on top of the palette value — a
 * resting Card renders at `rgba(255,255,255,0.05)` over #121212, which is
 * exactly #1e1e1e. Using the raw value would make every card invisible
 * against the page.
 */
export const muiDarkTheme: ThemeTokens = {
  ...muiLightTheme,
  colorBg: "#121212",
  colorBgSubtle: "#181818",
  colorSurface: "#1e1e1e",
  colorSurfaceMuted: "#272727",
  colorBorder: "rgba(255, 255, 255, 0.12)",
  colorBorderSubtle: "rgba(255, 255, 255, 0.08)",
  colorBorderControl: "#7a7a7a",
  colorText: "#ffffff",
  colorTextMuted: "rgba(255, 255, 255, 0.7)",
  colorPrimary: "#90caf9",
  colorPrimaryHover: "#42a5f5",
  colorPrimaryText: "rgba(0, 0, 0, 0.87)",
  colorAccent: "#ce93d8",
  colorAccentHover: "#ba68c8",
  colorAccentText: "rgba(0, 0, 0, 0.87)",
  colorLink: "#90caf9",
  colorLinkHover: "#bbdefb",
  colorFocusRing: "#90caf9",
  colorSuccess: "#66bb6a",
  colorWarning: "#ffa726",
  colorDanger: "#f44336",
  colorInfo: "#29b6f6",
  // 7.0 / 10.5 / 4.5 / 8.4:1 on #1e1e1e — the dark palette's fills are already
  // text-safe, so light's very dark Alert inks are replaced by the hues.
  colorSuccessText: "#66bb6a",
  colorWarningText: "#ffa726",
  colorDangerText: "#f44336",
  colorInfoText: "#29b6f6",
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#2c0606",
  colorOnInfo: "#08131f",
  colorSurfaceHover: "rgba(255, 255, 255, 0.08)",
  gradientBrand: "linear-gradient(120deg, #90caf9 0%, #ce93d8 100%)",
  gradientAccent: "linear-gradient(120deg, #ce93d8 0%, #90caf9 100%)",
  gradientWarm: "linear-gradient(120deg, #ffa726 0%, #f44336 100%)",
  gradientCool: "linear-gradient(120deg, #29b6f6 0%, #90caf9 100%)",
  gradientSuccess: "linear-gradient(120deg, #66bb6a 0%, #29b6f6 100%)",
  gradientDanger: "linear-gradient(120deg, #f44336 0%, #ce93d8 100%)",
  hlKeyword: "#c678dd",
  hlString: "#98c379",
  hlNumber: "#d19a66",
  hlComment: "#9ca3af",
  hlFn: "#61afef",
  hlTag: "#e06c75",
  hlAttr: "#d19a66",
  hlPunct: "#abb2bf",
  /* MUI X's `blueberryTwilightPalette` (dark). */
  chart1: "#02b2af",
  chart2: "#72ccff",
  chart3: "#da00ff",
  chart4: "#9001cb",
  chart5: "#2e96ff",
  chart6: "#b800d8",
};

/* ==========================================================================
   HeroUI  —  `heroui` · `heroui-light` · `heroui-dark`
   ========================================================================== */

/**
 * HeroUI (light) — the default `light` layout + colour theme from
 * `@heroui/theme`.
 *
 *   background #ffffff · foreground #11181c · content1 #ffffff
 *   default-100 #f4f4f5 · default-200 #e4e4e7 · default-500 #71717a
 *   primary #006fee (600 #005bc4) · secondary #7828c8
 *   success #17c964 · warning #f5a524 · danger #f31260
 *   radius small 8px / medium 12px / large 14px
 *   shadow small / medium / large — the three-layer, hairline-topped strings
 *
 * The signatures that make it unmistakable and that the stylesheet block
 * builds on: buttons that dim to `opacity: .8` on hover and scale to .97 on
 * press instead of changing colour, a 2px `outline-offset: 2px` focus ring
 * rather than a glow, borderless cards carrying `shadow-medium`, filled
 * `default-100` inputs, and 12–14px corners everywhere.
 *
 * As in the other two themes, `colorBorderControl` (#8b8b93, 3.38:1) is an
 * accessibility upgrade over HeroUI's `default-200` field boundary.
 */
export const herouiLightTheme: ThemeTokens = {
  ...lightTheme,
  /* ----- Surface & semantic ----- */
  colorBg: "#ffffff",
  colorBgSubtle: "#fafafa",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f4f4f5",
  colorBorder: "#e4e4e7",
  colorBorderSubtle: "rgba(17, 17, 17, 0.08)",
  colorBorderControl: "#8b8b93",
  colorText: "#11181c",
  // HeroUI's `default-500` #71717a measures 4.40:1 on the `default-100` fill
  // that backs chips, pills and flat inputs — just under the body-text bar.
  // #63636b is the same zinc a rung darker: 5.42:1 there, 5.95:1 on white.
  colorTextMuted: "#63636b",
  colorPrimary: "#006fee",
  colorPrimaryHover: "#005bc4",
  colorPrimaryText: "#ffffff",
  colorAccent: "#7828c8",
  colorAccentHover: "#6020a0",
  colorAccentText: "#ffffff",
  // HeroUI paints links in `primary` itself, which is 4.46:1 on this theme's
  // `default-50` page tint — a hair under the body-text bar. The link takes
  // the 600 rung instead (6.38:1 on white, 6.10:1 on the tint); the FILL
  // above is untouched, so buttons and chips stay HeroUI blue.
  colorLink: "#005bc4",
  colorLinkHover: "#004493",
  colorFocusRing: "#006fee",
  colorSuccess: "#17c964",
  colorWarning: "#f5a524",
  colorDanger: "#f31260",
  // HeroUI's semantic set has no `info`; the primary blue is what its own
  // informational chips and alerts use.
  colorInfo: "#006fee",
  // The 700 rung of each HeroUI colour scale — the shade its flat chips and
  // alerts already paint their label in.
  colorSuccessText: "#0e793c",
  colorWarningText: "#936316",
  colorDangerText: "#920b3a",
  colorInfoText: "#005bc4",
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#2a0413",
  colorOnInfo: "#ffffff",
  colorSurfaceHover: "rgba(17, 24, 28, 0.05)",
  /* ----- Typography — Inter at 16px (`text-medium`) ----- */
  fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading:
    "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSizeBase: "16px",
  fontSizeSm: "14px",
  fontSizeLg: "18px",
  fontSizeHeading: "18px",
  fontSizeTitle: "30px",
  fontWeightBody: "400",
  fontWeightHeading: "600",
  lineHeightBody: "1.5",
  lineHeightHeading: "1.25",
  letterSpacingHeading: "-0.02em",
  headingTextTransform: "none",
  /* ----- Shape — `--heroui-radius-small / -medium / -large` ----- */
  radiusXs: "6px",
  radiusSm: "8px",
  radiusMd: "12px",
  radiusLg: "14px",
  radiusPill: "999px",
  radiusButton: "12px",
  radiusInput: "12px",
  borderWidth: "1px",
  /* ----- Shadows — HeroUI's `shadow-small / -medium / -large`, verbatim ----- */
  shadowSm:
    "0px 0px 5px 0px rgba(0, 0, 0, 0.02), 0px 2px 10px 0px rgba(0, 0, 0, 0.06), 0px 0px 1px 0px rgba(0, 0, 0, 0.3)",
  shadowMd:
    "0px 0px 15px 0px rgba(0, 0, 0, 0.03), 0px 2px 30px 0px rgba(0, 0, 0, 0.08), 0px 0px 1px 0px rgba(0, 0, 0, 0.3)",
  shadowLg:
    "0px 0px 30px 0px rgba(0, 0, 0, 0.04), 0px 30px 60px 0px rgba(0, 0, 0, 0.12), 0px 0px 1px 0px rgba(0, 0, 0, 0.3)",
  /* ----- Spacing ----- */
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "12px",
  spacingL: "16px",
  spacingXl: "28px",
  spacing2xl: "48px",
  spacing3xl: "80px",
  /* ----- Gradients — the pairs HeroUI's own docs put on their hero copy ----- */
  gradientBrand: "linear-gradient(120deg, #5ea2ef 0%, #0072f5 100%)",
  gradientAccent: "linear-gradient(120deg, #ff1cf7 0%, #b249f8 100%)",
  gradientWarm: "linear-gradient(120deg, #ff705b 0%, #ffb457 100%)",
  gradientCool: "linear-gradient(120deg, #5ea2ef 0%, #17c964 100%)",
  gradientSuccess: "linear-gradient(120deg, #6fee8d 0%, #17c964 100%)",
  gradientDanger: "linear-gradient(120deg, #f54180 0%, #f31260 100%)",
  /* ----- Buttons — `h-10 px-4 text-small font-medium`, `rounded-medium` ----- */
  buttonFontWeight: "500",
  buttonTextTransform: "none",
  buttonLetterSpacing: "0",
  buttonPaddingY: "10px",
  buttonPaddingX: "16px",
  /* ----- Motion — HeroUI's 250ms `transition-transform-colors-opacity` ----- */
  transitionDuration: "250ms",
  motionFast: "150ms",
  motionBase: "250ms",
  motionSlow: "300ms",
  motionEase: "cubic-bezier(0, 0, 0.2, 1)",
  /* ----- Charts — the semantic palette, primary first ----- */
  chart1: "#006fee",
  chart2: "#7828c8",
  chart3: "#17c964",
  chart4: "#f5a524",
  chart5: "#f31260",
  chart6: "#ff705b",
};

/**
 * HeroUI (dark) — the `dark` theme from `@heroui/theme`.
 *
 *   background #000000 · foreground #ecedee
 *   content1 #18181b · content2 #27272a · default-500 #a1a1aa
 *   primary #006fee (brightening to #338ef7 on hover) · secondary #9353d3
 *   divider rgba(255,255,255,0.15)
 *   the dark `shadow-*` trio, each with an inset white rim-light
 *
 * The page really is pure black — that, plus #18181b cards with no border at
 * all, is what dark HeroUI looks like. `colorLink` steps up to the dark
 * scale's #66aaf9 because #006fee measures 3.80:1 on `content1`: fine for the
 * button fill it mostly is, short of the 4.5:1 bar for the places the sheet
 * paints the brand hue as running text.
 */
export const herouiDarkTheme: ThemeTokens = {
  ...herouiLightTheme,
  colorBg: "#000000",
  colorBgSubtle: "#09090b",
  colorSurface: "#18181b",
  colorSurfaceMuted: "#27272a",
  colorBorder: "#27272a",
  colorBorderSubtle: "rgba(255, 255, 255, 0.10)",
  colorBorderControl: "#8b8b93",
  colorText: "#ecedee",
  colorTextMuted: "#a1a1aa",
  colorPrimary: "#006fee",
  // Dark-mode primaries BRIGHTEN on hover — #338ef7 is the dark scale's 500.
  colorPrimaryHover: "#338ef7",
  colorPrimaryText: "#ffffff",
  colorAccent: "#9353d3",
  colorAccentHover: "#ae7ede",
  colorAccentText: "#ffffff",
  colorLink: "#66aaf9",
  colorLinkHover: "#99c7fb",
  colorFocusRing: "#006fee",
  colorSuccess: "#17c964",
  colorWarning: "#f5a524",
  colorDanger: "#f31260",
  colorInfo: "#006fee",
  colorSuccessText: "#17c964",
  colorWarningText: "#f5a524",
  // #f31260 is 4.27:1 on content1; #f54180 is the same ramp one step up, 5.02:1.
  colorDangerText: "#f54180",
  colorInfoText: "#66aaf9",
  colorOnSuccess: "#04291e",
  colorOnWarning: "#451a03",
  colorOnDanger: "#2a0413",
  colorOnInfo: "#ffffff",
  colorSurfaceHover: "rgba(255, 255, 255, 0.07)",
  shadowSm:
    "0px 0px 5px 0px rgba(0, 0, 0, 0.05), 0px 2px 10px 0px rgba(0, 0, 0, 0.2), inset 0px 0px 1px 0px rgba(255, 255, 255, 0.15)",
  shadowMd:
    "0px 0px 15px 0px rgba(0, 0, 0, 0.06), 0px 2px 30px 0px rgba(0, 0, 0, 0.22), inset 0px 0px 1px 0px rgba(255, 255, 255, 0.15)",
  shadowLg:
    "0px 0px 30px 0px rgba(0, 0, 0, 0.07), 0px 30px 60px 0px rgba(0, 0, 0, 0.26), inset 0px 0px 1px 0px rgba(255, 255, 255, 0.15)",
  hlKeyword: "#c678dd",
  hlString: "#98c379",
  hlNumber: "#d19a66",
  hlComment: "#9ca3af",
  hlFn: "#61afef",
  hlTag: "#e06c75",
  hlAttr: "#d19a66",
  hlPunct: "#abb2bf",
  chart1: "#338ef7",
  chart2: "#9353d3",
  chart3: "#45d483",
  chart4: "#f7b750",
  chart5: "#f54180",
  chart6: "#ff8f7c",
};

/**
 * Web fonts a built-in theme needs in order to look like itself.
 *
 * Selecting a theme by name (`theme="shadcn"` or `$theme({ name: ... })`)
 * previously loaded no fonts at all — only a program that spelled out
 * `$theme({ fonts: { import: [...] } })` triggered `loadFonts`. For the
 * vision theme that meant every page rendered in `system-ui` instead of the
 * UI block typefaces, so the whole UI block type ladder (and every font-weight
 * correction in the theme) was invisible outside the parity harnesses, which
 * load the fonts themselves.
 *
 * The three framework themes are in the same position: Geist, Roboto and Inter
 * ARE half of what makes shadcn/ui, Material UI and HeroUI recognisable, so
 * every alias of each family declares its typefaces here.
 *
 * UI block self-hosts OpenSansRegular / OpenSansSemibold / OverpassRegular /
 * OverpassSemibold and always asks for weight 400, taking its boldness from the
 * font FILE. The closest equivalent here is the same two families at 400 and 600.
 *
 * Keyed by CANONICAL theme name, private themes included: callers pass the
 * name through `canonicalThemeName` first, so a retired alias picks up the
 * typefaces of the theme that replaced it, and a theme that is not publicly
 * enumerated still gets its own.
 */
const SHADCN_FONTS = ["Geist:400,500,600,700", "Geist Mono:400,500"];
const MUI_FONTS = ["Roboto:300,400,500,700", "Roboto Mono:400,500"];
const HEROUI_FONTS = ["Inter:400,500,600,700"];

export const builtInThemeFonts: Record<string, { import: string[] }> = {
  shadcn: { import: SHADCN_FONTS },
  "shadcn-light": { import: SHADCN_FONTS },
  "shadcn-dark": { import: SHADCN_FONTS },
  mui: { import: MUI_FONTS },
  "mui-light": { import: MUI_FONTS },
  "mui-dark": { import: MUI_FONTS },
  heroui: { import: HEROUI_FONTS },
  "heroui-light": { import: HEROUI_FONTS },
  "heroui-dark": { import: HEROUI_FONTS },
  vision: { import: ["Open Sans:400,600", "Overpass:400,600"] },
};

/**
 * The PUBLIC theme registry.
 *
 * This record is the single source of truth for every surface that enumerates
 * themes: `langSpec.themeNames` (playground picker + editor autocomplete), the
 * generated VS Code metadata, the agent-skill reference and the docs. Adding a
 * key here publishes the theme; see `privateThemes` for the other case.
 *
 * Three of the entries are family SHORTHANDS: `shadcn`, `mui` and `heroui`
 * each hold the very same object as their `-light` sibling, so
 * `theme="shadcn"` and `theme="shadcn-light"` are interchangeable and
 * `data-rui-theme` echoes back whichever spelling the author used (both are
 * matched by the family's CSS block). They are listed rather than hidden
 * because editor autocomplete should offer every name that works.
 */
export const builtInThemes: Record<string, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
  shadcn: shadcnLightTheme,
  "shadcn-light": shadcnLightTheme,
  "shadcn-dark": shadcnDarkTheme,
  mui: muiLightTheme,
  "mui-light": muiLightTheme,
  "mui-dark": muiDarkTheme,
  heroui: herouiLightTheme,
  "heroui-light": herouiLightTheme,
  "heroui-dark": herouiDarkTheme,
  soft: softTheme,
};

/**
 * Retired theme names → the theme that replaced them.
 *
 * `modern`, `glass` and `corporate` were the previous generation of this
 * library's designed-in-house themes. They have been replaced by faithful
 * re-creations of the design systems each was reaching for, under the names of
 * those systems. The old spellings still resolve so a page that says
 * `theme="modern"` renders the new design rather than silently falling back to
 * `light` — which is what an unknown name does.
 *
 * Unlike the family shorthands in `builtInThemes` (`shadcn` and `shadcn-light`
 * are two spellings of a LIVE name), these map to a DIFFERENT name: the
 * resolver rewrites them, so the host ends up with `data-rui-theme="shadcn-light"`
 * and picks up the family's CSS block, which is keyed on the new names only.
 *
 * They are deliberately absent from `builtInThemes` and `privateThemes`: every
 * surface that ENUMERATES themes reads those records, so listing a retired
 * name there would re-publish it.
 */
export const deprecatedThemeAliases: Record<string, string> = {
  modern: "shadcn-light",
  glass: "mui-light",
  corporate: "heroui-light",
};

/**
 * Rewrite a retired theme name onto its replacement; pass anything else
 * through unchanged. Callers hand this a name they have already trimmed and
 * lower-cased.
 */
export function canonicalThemeName(key: string): string {
  return deprecatedThemeAliases[key] ?? key;
}

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
  const canonical = canonicalThemeName(key);
  return builtInThemes[canonical] ?? privateThemes[canonical] ?? null;
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
    const canonical = canonicalThemeName(key);
    const tokens = findThemeByName(canonical);
    // The CANONICAL name, so a retired alias (`modern`) lands on the marker
    // its replacement's CSS block is keyed on (`shadcn-light`).
    if (tokens) return { name: canonical, tokens };
    return { name: "light", tokens: lightTheme };
  }
  return { name: "custom", tokens: mergeTheme(input) };
}

/**
 * CSS custom property backing one theme token (`colorBg` → `--rui-color-bg`),
 * or `null` for a name that is not a token.
 *
 * Exported for DevTools: a live token editor has to read back what is
 * *actually* painted on the host — an in-script `$theme({...})` or a DevTools
 * edit writes inline custom properties, not theme objects — and duplicating the
 * mapping is how such an editor silently stops covering newly-added tokens.
 */
export function themeTokenCssVar(token: string): string | null {
  return TOKEN_TO_CSS[token as keyof ThemeTokens] ?? null;
}

/** Every theme token name, in declaration order. */
export function themeTokenNames(): Array<keyof ThemeTokens> {
  return Object.keys(TOKEN_TO_CSS) as Array<keyof ThemeTokens>;
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
