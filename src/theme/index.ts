/**
 * Theme tokens applied as CSS custom properties on the host element.
 *
 * Built-in themes:
 *   - "light"      (default)
 *   - "dark"
 *   - "corporate"  (enterprise console: deep navy + cyan, crisp & calm)
 *   - "soft"       (soft, friendly, light & rounded; lavender + mint)
 *   - "glass"      (light glassmorphism: frosted white surfaces over a soft
 *                   pastel gradient, airy and translucent)
 *   - "modern"     (clean modern SaaS: light, generous rounding, ink primary,
 *                   pill buttons, soft diffuse shadows, vibrant charts)
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
  colorText: string;
  colorTextMuted: string;
  colorPrimary: string;
  colorPrimaryHover: string;
  colorPrimaryText: string;
  /** Secondary brand accent (links, chips, callouts). Defaults to primary. */
  colorAccent: string;
  colorAccentHover: string;
  colorAccentText: string;
  /** Focus ring color (CSS color). Defaults to primary. */
  colorFocusRing: string;
  colorSuccess: string;
  colorWarning: string;
  colorDanger: string;
  colorInfo: string;
  /* ----- Typography ------------------------------------------------- */
  fontFamily: string;
  /** Font stack used for headings (Card title, Page header, SectionHeader…). */
  fontFamilyHeading: string;
  fontFamilyMono: string;
  /** Root font size — body text defaults to this value. */
  fontSizeBase: string;
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
  colorBorderSubtle: "rgba(15, 23, 42, 0.08)",
  colorText: "#0f172a",
  colorTextMuted: "#475569",
  colorPrimary: "#6366f1",
  colorPrimaryHover: "#4f46e5",
  colorPrimaryText: "#ffffff",
  colorAccent: "#6366f1",
  colorAccentHover: "#4f46e5",
  colorAccentText: "#ffffff",
  colorFocusRing: "#6366f1",
  colorSuccess: "#10b981",
  colorWarning: "#f59e0b",
  colorDanger: "#ef4444",
  colorInfo: "#06b6d4",
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
  colorBorderSubtle: "rgba(248, 250, 252, 0.08)",
  colorText: "#f8fafc",
  colorTextMuted: "#94a3b8",
  colorPrimary: "#818cf8",
  colorPrimaryHover: "#6366f1",
  colorPrimaryText: "#0b1220",
  colorAccent: "#818cf8",
  colorAccentHover: "#6366f1",
  colorAccentText: "#0b1220",
  colorFocusRing: "#818cf8",
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.4)",
  shadowMd: "0 8px 24px rgba(0, 0, 0, 0.4)",
  shadowLg: "0 22px 60px rgba(0, 0, 0, 0.55)",
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
  colorBorderSubtle: "rgba(168, 132, 232, 0.18)",
  colorText: "#3b1f56",
  colorTextMuted: "#7d6193",
  colorPrimary: "#a78bfa",
  colorPrimaryHover: "#8b5cf6",
  colorPrimaryText: "#ffffff",
  colorAccent: "#5eead4",
  colorAccentHover: "#2dd4bf",
  colorAccentText: "#0f3a35",
  colorFocusRing: "#a78bfa",
  colorSuccess: "#5eead4",
  colorWarning: "#fcd34d",
  colorDanger: "#fda4af",
  colorInfo: "#93c5fd",
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
  colorBorderSubtle: "rgba(255, 255, 255, 0.45)",
  colorText: "#33303a",
  colorTextMuted: "#7c7585",
  colorPrimary: "#f2826a",
  colorPrimaryHover: "#ec6c50",
  colorPrimaryText: "#ffffff",
  colorAccent: "#b58ee6",
  colorAccentHover: "#a376e0",
  colorAccentText: "#ffffff",
  colorFocusRing: "#f2826a",
  colorSuccess: "#5bbf9b",
  colorWarning: "#f0b259",
  colorDanger: "#ef7b86",
  colorInfo: "#7fb0e8",
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
 * Corporate — enterprise cloud-console aesthetic. Deep navy primary, calm
 * cyan accents, very pale blue page background, white surfaces with crisp
 * 1px borders, small radii, and a clean Inter type stack. The look should
 * feel at home in an admin panel: dense, scannable, minimal chrome.
 * (Formerly "skyline".)
 */
export const corporateTheme: ThemeTokens = {
  ...lightTheme,
  colorBg: "#eff2f7",
  colorBgSubtle: "#e6ecf3",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f4f7fb",
  colorBorder: "#d6deea",
  colorBorderSubtle: "rgba(13, 27, 58, 0.08)",
  colorText: "#0d1b3a",
  colorTextMuted: "#5a6a85",
  colorPrimary: "#003580",
  colorPrimaryHover: "#002a66",
  colorPrimaryText: "#ffffff",
  colorAccent: "#0095d6",
  colorAccentHover: "#0078ad",
  colorAccentText: "#ffffff",
  colorFocusRing: "#0095d6",
  colorSuccess: "#1b8f4f",
  colorWarning: "#c47e00",
  colorDanger: "#c8362b",
  colorInfo: "#0095d6",
  fontFamily: "'Inter', 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading: "'Inter', 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusXs: "3px",
  radiusSm: "4px",
  radiusMd: "6px",
  radiusLg: "10px",
  radiusButton: "4px",
  radiusInput: "4px",
  shadowSm: "0 1px 0 rgba(13, 27, 58, 0.04), 0 1px 3px rgba(13, 27, 58, 0.06)",
  shadowMd: "0 4px 16px rgba(13, 27, 58, 0.08), 0 1px 3px rgba(13, 27, 58, 0.04)",
  shadowLg: "0 16px 40px rgba(13, 27, 58, 0.12), 0 2px 6px rgba(13, 27, 58, 0.06)",
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "14px",
  spacingL: "20px",
  spacingXl: "32px",
  chart1: "#003580",
  chart2: "#0095d6",
  chart3: "#1b8f4f",
  chart4: "#c47e00",
  chart5: "#d43594",
  chart6: "#5a6a85",
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
  colorBorderSubtle: "rgba(17, 24, 39, 0.06)",
  colorText: "#111827",
  colorTextMuted: "#6b7280",
  colorPrimary: "#111827",
  colorPrimaryHover: "#000000",
  colorPrimaryText: "#ffffff",
  colorAccent: "#7c5cfc",
  colorAccentHover: "#6a47f5",
  colorAccentText: "#ffffff",
  colorFocusRing: "#7c5cfc",
  colorSuccess: "#22c55e",
  colorWarning: "#f59e0b",
  colorDanger: "#f43f5e",
  colorInfo: "#2563eb",
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

export const builtInThemes: Record<string, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
  corporate: corporateTheme,
  soft: softTheme,
  glass: glassTheme,
  modern: modernTheme,
};

const TOKEN_TO_CSS: Record<keyof ThemeTokens, string> = {
  colorBg: "--rui-color-bg",
  colorBgSubtle: "--rui-color-bg-subtle",
  colorSurface: "--rui-color-surface",
  colorSurfaceMuted: "--rui-color-surface-muted",
  colorBorder: "--rui-color-border",
  colorBorderSubtle: "--rui-color-border-subtle",
  colorText: "--rui-color-text",
  colorTextMuted: "--rui-color-text-muted",
  colorPrimary: "--rui-color-primary",
  colorPrimaryHover: "--rui-color-primary-hover",
  colorPrimaryText: "--rui-color-primary-text",
  colorAccent: "--rui-color-accent",
  colorAccentHover: "--rui-color-accent-hover",
  colorAccentText: "--rui-color-accent-text",
  colorFocusRing: "--rui-color-focus-ring",
  colorSuccess: "--rui-color-success",
  colorWarning: "--rui-color-warning",
  colorDanger: "--rui-color-danger",
  colorInfo: "--rui-color-info",
  fontFamily: "--rui-font-family",
  fontFamilyHeading: "--rui-font-family-heading",
  fontFamilyMono: "--rui-font-family-mono",
  fontSizeBase: "--rui-font-size-base",
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
    const tokens = builtInThemes[key];
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
