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
    /** Primary brand gradient — used by `fill: "gradient.brand"`, GradientText, etc. */
    gradientBrand: string;
    gradientAccent: string;
    gradientWarm: string;
    gradientCool: string;
    gradientSuccess: string;
    gradientDanger: string;
    buttonFontWeight: string;
    buttonTextTransform: string;
    buttonLetterSpacing: string;
    buttonPaddingY: string;
    buttonPaddingX: string;
    transitionDuration: string;
    /** Motion tokens (I.2) — `$theme({ motion: { fast, base, slow, ease } })`.
     *  Optional: components fall back to their built-in timings. */
    motionFast?: string;
    motionBase?: string;
    motionSlow?: string;
    motionEase?: string;
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
    chart1: string;
    chart2: string;
    chart3: string;
    chart4: string;
    chart5: string;
    chart6: string;
}
export declare const lightTheme: ThemeTokens;
export declare const darkTheme: ThemeTokens;
/**
 * Soft — friendly, light and rounded. Larger paddings, big radii,
 * lavender + mint palette, gentle shadows. (Formerly "pastel".)
 */
export declare const softTheme: ThemeTokens;
/**
 * Glass — light glassmorphism. Frosted *white* translucent surfaces floating
 * over a soft, airy pastel gradient (peach → pink → lavender → mint). Real
 * backdrop-filter blur is applied via the stylesheet, so surfaces pick up the
 * colourful wash behind them. Dark warm-slate text, a warm coral primary, a
 * lavender accent, generous rounding, and feather-soft tinted shadows. The
 * look mirrors calm, modern wellness / consumer dashboards.
 */
export declare const glassTheme: ThemeTokens;
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
export declare const visionTheme: ThemeTokens;
/**
 * Modern — clean, friendly SaaS dashboard. Light off-white page, crisp white
 * surfaces, generous rounding, feather-soft diffuse shadows, an ink (near
 * black) primary rendered as pill buttons, a violet accent, and a vibrant
 * multi-hue chart palette. The aesthetic is the contemporary product-dashboard
 * look: airy, rounded, low-contrast chrome with confident black call-to-actions.
 */
export declare const modernTheme: ThemeTokens;
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
export declare const corporateTheme: ThemeTokens;
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
export declare const builtInThemeFonts: Record<string, {
    import: string[];
}>;
/**
 * The PUBLIC theme registry.
 *
 * This record is the single source of truth for every surface that enumerates
 * themes: `langSpec.themeNames` (playground picker + editor autocomplete), the
 * generated VS Code metadata, the agent-skill reference and the docs. Adding a
 * key here publishes the theme; see `privateThemes` for the other case.
 */
export declare const builtInThemes: Record<string, ThemeTokens>;
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
export declare const privateThemes: Record<string, ThemeTokens>;
/**
 * Look a theme name up across both registries. This — not `builtInThemes` — is
 * what a *resolver* should consult; `builtInThemes` is for *enumeration*.
 */
export declare function findThemeByName(name: unknown): ThemeTokens | null;
export type ThemeInput = string | Partial<ThemeTokens>;
export interface ResolvedTheme {
    /** Built-in theme name when known, otherwise "custom". Drives `data-rui-theme`. */
    name: string;
    tokens: ThemeTokens;
}
export declare function resolveTheme(input: ThemeInput | null | undefined): ResolvedTheme;
/**
 * Apply theme tokens to the host element. Also sets `data-rui-theme` so the
 * shadow-DOM stylesheet can hook into theme-specific overrides (fonts,
 * gradients, animations, etc.) that go beyond raw token values.
 */
export declare function applyTheme(host: HTMLElement, theme: ResolvedTheme | ThemeTokens): void;
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
export declare function applyPartialTheme(host: HTMLElement, partial: Partial<ThemeTokens>): ReadonlyArray<keyof ThemeTokens>;
/**
 * Remove an array of token CSS variables from the host's inline style. Used
 * to "undo" a previous `applyPartialTheme(...)` call so the next render
 * inherits whatever the base theme provides rather than the stale override.
 */
export declare function clearTokenOverrides(host: HTMLElement, keys: ReadonlyArray<keyof ThemeTokens>): void;
/**
 * Filter an arbitrary object down to the keys recognised by `ThemeTokens`,
 * stringifying primitive values along the way. Used when an Aktion program
 * applies `$theme({...})` — the evaluator hands us
 * a plain JS object, and we want to ignore anything that isn't a real token
 * (LLM typo guard) before applying it.
 */
export declare function sanitiseThemeTokens(input: unknown): Partial<ThemeTokens>;
