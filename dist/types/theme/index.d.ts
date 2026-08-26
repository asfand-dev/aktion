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
export declare const visionTheme: ThemeTokens;
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
export declare const shadcnLightTheme: ThemeTokens;
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
export declare const shadcnDarkTheme: ThemeTokens;
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
export declare const muiLightTheme: ThemeTokens;
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
export declare const muiDarkTheme: ThemeTokens;
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
export declare const herouiLightTheme: ThemeTokens;
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
export declare const herouiDarkTheme: ThemeTokens;
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
 *
 * Three of the entries are family SHORTHANDS: `shadcn`, `mui` and `heroui`
 * each hold the very same object as their `-light` sibling, so
 * `theme="shadcn"` and `theme="shadcn-light"` are interchangeable and
 * `data-rui-theme` echoes back whichever spelling the author used (both are
 * matched by the family's CSS block). They are listed rather than hidden
 * because editor autocomplete should offer every name that works.
 */
export declare const builtInThemes: Record<string, ThemeTokens>;
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
export declare const deprecatedThemeAliases: Record<string, string>;
/**
 * Rewrite a retired theme name onto its replacement; pass anything else
 * through unchanged. Callers hand this a name they have already trimmed and
 * lower-cased.
 */
export declare function canonicalThemeName(key: string): string;
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
 * CSS custom property backing one theme token (`colorBg` → `--rui-color-bg`),
 * or `null` for a name that is not a token.
 *
 * Exported for DevTools: a live token editor has to read back what is
 * *actually* painted on the host — an in-script `$theme({...})` or a DevTools
 * edit writes inline custom properties, not theme objects — and duplicating the
 * mapping is how such an editor silently stops covering newly-added tokens.
 */
export declare function themeTokenCssVar(token: string): string | null;
/** Every theme token name, in declaration order. */
export declare function themeTokenNames(): Array<keyof ThemeTokens>;
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
