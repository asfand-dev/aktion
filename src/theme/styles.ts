/**
 * Single CSS bundle for the shadow root. Uses CSS custom properties so that
 * theme switches at the host element propagate without re-rendering.
 *
 * Built-in themes additionally hook into `:host([data-rui-theme="..."])`
 * overrides so that themes can change layout, fonts, animations, etc., not
 * only color tokens.
 */

/**
 * Spacing token → CSS value for attribute-driven spacing selectors.
 * Canonical tokens first; the legacy single-letter spellings stay matched so
 * pre-0.6 markup (and any un-normalised attribute writer) keeps its spacing.
 */
const SPACING_ATTR_TOKENS: ReadonlyArray<readonly [token: string, css: string]> = [
  ["none", "0"],
  ["3xs", "var(--rui-spacing-3xs)"],
  ["2xs", "var(--rui-spacing-2xs)"],
  ["xs", "var(--rui-spacing-xs)"],
  ["sm", "var(--rui-spacing-s)"],
  ["md", "var(--rui-spacing-m)"],
  ["lg", "var(--rui-spacing-l)"],
  ["xl", "var(--rui-spacing-xl)"],
  ["2xl", "var(--rui-spacing-2xl)"],
  ["3xl", "var(--rui-spacing-3xl)"],
  ["s", "var(--rui-spacing-s)"],
  ["m", "var(--rui-spacing-m)"],
  ["l", "var(--rui-spacing-l)"],
];

/** Emit one rule per spacing token: `selector[attr="token"] { …decl(css)… }`. */
function spacingAttrRules(selector: string, attr: string, decl: (css: string) => string): string {
  return SPACING_ATTR_TOKENS
    .map(([token, css]) => `${selector}[${attr}="${token}"] { ${decl(css)} }`)
    .join("\n");
}

/**
 * Compact inline controls that must hug their content inside a row Stack,
 * instead of being flex-grown into full-width banners.
 */
const ROW_HUG_SELECTORS: ReadonlyArray<string> = [
  ".rui-tag", ".rui-badge", ".rui-status-dot", ".rui-kbd-group", ".rui-icon", ".rui-rating",
];

/**
 * Row-direction rules for one breakpoint of a responsive Stack.
 *
 * A responsive `direction` map sets `data-direction="responsive"`, which kills
 * every `[data-direction="row"]`-keyed rule: uniform sizing stops working, the
 * `min-width: 0` overflow guard disappears, and chips stretch into banners.
 * CSS cannot branch on a custom property's value, so the render also emits
 * `data-row-at` listing the breakpoints whose cascaded direction resolves to
 * row — these rules key off that, once per breakpoint, inside the matching
 * mobile-first media query.
 */
function rowAtRules(bp: string): string {
  const at = `.rui-stack[data-row-at~="${bp}"]`;
  return [
    `${at}[data-uniform="true"] > *:not(.rui-stack-item) { flex: 1 1 auto; min-width: 0; }`,
    `${at} > * { min-width: 0; }`,
    `${ROW_HUG_SELECTORS.map((cls) => `${at} > ${cls}`).join(",\n")} { flex: 0 0 auto; }`,
  ].join("\n");
}

/**
 * THE breakpoint ladder. Every viewport media query in this sheet is generated
 * from this map — nothing here writes a raw pixel threshold.
 *
 * `sm`/`md`/`lg`/`xl` are byte-for-byte the values in
 * `src/library/responsive-style.ts` (`BREAKPOINT_MIN`), which is what an author's
 * `sx` breakpoint map and every `data-responsive-*` ladder resolve against. The
 * sheet used to carry a *second*, hand-written family alongside them — 480, 560,
 * 720, 760, 820, 900, 920 plus `max-width: 640/768/1024px` — so a page built from
 * Stack + Grid + Navbar2 reflowed in three separate steps between 560px and
 * 920px and an author's `md` (768px) never lined up with the component collapse
 * (720px). Those thresholds are now snapped to the nearest rung.
 *
 * `xs` is the one rung with no `sx` counterpart. It subdivides `base` rather than
 * contradicting it, and it exists because the narrow-phone compaction (stretched
 * card footers, full-width StatCards) genuinely should not reach a 600px tablet.
 */
const BREAKPOINTS = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

/** Mobile-first: this rung and wider. */
function up(bp: Breakpoint): string {
  return `@media (min-width: ${BREAKPOINTS[bp]}px)`;
}

/**
 * Narrower than this rung. The 0.02px step is what keeps `below("sm")` and
 * `up("sm")` from both matching at exactly 640px — the bug behind every
 * `max-width: 640px` this replaced, where the collapse rule and the sm rule
 * applied together.
 */
function belowCond(bp: Breakpoint): string {
  return `(max-width: ${BREAKPOINTS[bp] - 0.02}px)`;
}

function below(bp: Breakpoint): string {
  return `@media ${belowCond(bp)}`;
}

/**
 * Mobile-first rungs for the responsive custom-property ladders (Grid columns
 * and gaps, Stack direction, Box padding, masonry, pattern grids). `base` is
 * implicit — it is the unqualified rule these cascade on top of.
 */
const COLUMN_LADDER_RUNGS: ReadonlyArray<readonly [rung: string, minWidth: string]> =
  (["sm", "md", "lg", "xl"] as const).map((rung) => [rung, `${BREAKPOINTS[rung]}px`] as const);

/**
 * Cascading fallback chain for one rung of a responsive custom-property ladder:
 * at `md` (rungCount 2) this is
 * `var(--p-md, var(--p-sm, var(--p-base, fallback)))`, so a map that only
 * declares `base` and `sm` still resolves at every wider breakpoint.
 */
function responsiveVarChain(prefix: string, rungCount: number, fallback: string): string {
  return COLUMN_LADDER_RUNGS
    .slice(0, rungCount)
    .reduce((acc, [rung]) => `var(${prefix}-${rung}, ${acc})`, `var(${prefix}-base, ${fallback})`);
}

/**
 * Per-axis gap ladder for Grid.
 *
 * `rowGap` / `columnGap` accept the same responsive maps as `gap`, and the
 * render emits `data-responsive-row-gap` plus `--rui-grid-row-gap-{bp}` for
 * them (layout.ts). Nothing consumed either name, so a responsive rowGap
 * silently fell back to the uniform `gap` — and an author who already had
 * `rowGap: "xl"` working lost it the moment they made it responsive. Emitted
 * *after* the shorthand `gap` rule at each rung so the axis override wins the
 * source-order tie-break.
 */
function responsiveAxisGapRules(rungCount: number): string {
  return [["row", "row-gap"], ["column", "column-gap"]]
    .map(([axis, prop]) => {
      const chain = responsiveVarChain(`--rui-grid-${axis}-gap`, rungCount, "var(--rui-spacing-m)");
      return `.rui-grid[data-responsive-${axis}-gap] { ${prop}: ${chain}; }`;
    })
    .join("\n");
}

/** A `repeat()` track list, collapsing the single-column case to plain `1fr`. */
function gridTracks(count: number): string {
  return count <= 1 ? "1fr" : `repeat(${count}, minmax(0, 1fr))`;
}

/**
 * Breakpoint ladder for a pattern grid whose `data-columns="N"` would otherwise
 * pin the same track count at every viewport width — the reason a 4-column
 * PricingTable used to render four 84px columns on a 375px phone while the same
 * grid *without* `columns` reflowed correctly.
 *
 * Shaped like `.rui-masonry-grid[data-responsive-columns]`: the element declares
 * one custom property per breakpoint and each media query reads its own rung
 * with a cascade of fallbacks down to the base. `caps` is the maximum number of
 * columns allowed at base/sm/md/lg/xl, so the author's count is honoured once
 * there is room for it and clamped below that.
 *
 * Every rung is declared for every count instead of being left to fall through,
 * because custom properties inherit: a pattern grid nested inside another one
 * would otherwise adopt its ancestor's track list at the breakpoints it did not
 * set itself.
 */
function columnLadderRules(
  selector: string,
  prefix: string,
  maxColumns: number,
  caps: readonly [base: number, sm: number, md: number, lg: number, xl: number],
): string {
  const scope = `${selector}[data-columns]`;
  const out: string[] = [`${scope} { grid-template-columns: var(${prefix}-base, 1fr); }`];
  COLUMN_LADDER_RUNGS.forEach(([, minWidth], i) => {
    // Read this rung, then every lower one, then the base: a count that only
    // needs two steps still resolves at xl.
    const chain = COLUMN_LADDER_RUNGS
      .slice(0, i + 1)
      .reduce((acc, [rung]) => `var(${prefix}-${rung}, ${acc})`, `var(${prefix}-base, 1fr)`);
    out.push(`@media (min-width: ${minWidth}) { ${scope} { grid-template-columns: ${chain}; } }`);
  });
  for (let n = 1; n <= maxColumns; n += 1) {
    const decls = [`${prefix}-base: ${gridTracks(Math.min(n, caps[0]))};`];
    COLUMN_LADDER_RUNGS.forEach(([rung], i) => {
      // caps is a 5-tuple keyed base,sm,md,lg,xl, so the index always resolves;
      // the fallback only satisfies the indexed-access check.
      decls.push(`${prefix}-${rung}: ${gridTracks(Math.min(n, caps[i + 1] ?? maxColumns))};`);
    });
    out.push(`${selector}[data-columns="${n}"] { ${decls.join(" ")} }`);
  }
  return out.join("\n");
}

/**
 * The eight roots that share the `SURFACE_TONES` enum (patterns.ts:23): Hero,
 * TimelineItem, FeatureItem, Banner, KanbanCard, KanbanColumn, Tile and
 * Notification. The CSS used to be hand-written per component, so `info` styled
 * a Tile and silently no-opped on a KanbanColumn while `primary` was the one
 * tone a FeatureItem could not render. Each root resolves the attribute ONCE
 * into the `--rui-tone-*` trio and the component rules consume that, so a tone
 * added to the enum can no longer land on only some of the eight.
 */
const SURFACE_TONE_ROOTS: ReadonlyArray<string> = [
  ".rui-hero",
  ".rui-timeline-item",
  ".rui-feature-item",
  ".rui-banner",
  ".rui-kanban-card",
  ".rui-kanban-column",
  ".rui-tile",
  ".rui-notification",
];

/**
 * tone → [colour, surface tint, border tint]. The two percentages carry the
 * per-tone nuance the hand-written rules had — amber needs more of itself than
 * green before it reads as a warning wash — so no component has to re-decide it.
 */
const SURFACE_TONE_MAP: ReadonlyArray<
  readonly [tone: string, color: string, surfaceMix: string, borderMix: string]
> = [
  ["primary", "var(--rui-color-primary)", "18%", "28%"],
  ["success", "var(--rui-color-success)", "18%", "28%"],
  ["warning", "var(--rui-color-warning)", "22%", "32%"],
  ["danger", "var(--rui-color-danger)", "18%", "32%"],
  ["info", "var(--rui-color-info)", "18%", "30%"],
];

/** `--rui-tone-*` resolution for every shared-tone root. */
function surfaceToneTokenRules(): string {
  const roots = (suffix: string) => SURFACE_TONE_ROOTS.map((root) => `${root}${suffix}`).join(",\n");
  // `default` resets the trio rather than leaving it unset: custom properties
  // inherit, so an untoned Tile inside a toned Hero would otherwise pick up the
  // Hero's tone. Every one of the eight always emits data-tone, so the reset
  // selector reaches all of them.
  const blocks = [`${roots("[data-tone]")} {
  --rui-tone-color: var(--rui-color-border);
  --rui-tone-surface-mix: 0%;
  --rui-tone-border-mix: 0%;
}`];
  for (const [tone, color, surfaceMix, borderMix] of SURFACE_TONE_MAP) {
    blocks.push(`${roots(`[data-tone="${tone}"]`)} {
  --rui-tone-color: ${color};
  --rui-tone-surface-mix: ${surfaceMix};
  --rui-tone-border-mix: ${borderMix};
}`);
  }
  return blocks.join("\n");
}

/**
 * Scope for a rule that consumes `--rui-tone-color`. `default` is always
 * excluded — that is the component's own neutral look. `excludePrimary` is for
 * the surfaces whose *base* rule already IS the primary tone because their
 * render defaults `tone` to `"primary"` (Hero/Cover patterns.ts:173, Banner
 * patterns.ts:731); restating it here would only re-paint every default Hero
 * and Banner with a flatter gradient than the one they are designed around.
 */
function tonedScope(root: string, excludePrimary = false): string {
  const primary = excludePrimary ? `:not([data-tone="primary"])` : "";
  return `${root}[data-tone]:not([data-tone="default"])${primary}`;
}

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
  /* Long unbroken strings (URLs, hashes, IDs, base64, German compounds) used to
     blow out of every card, table cell, badge and list row: overflow-wrap did
     not appear once in this stylesheet. It is an inherited property, so one
     declaration here covers all 288 components. break-word rather than
     anywhere, because anywhere also shrinks min-content contributions, which
     would change existing flex/grid sizing. Elements set to white-space nowrap
     are unaffected — they never wrap, so this is inert there. */
  overflow-wrap: break-word;
  /* Surface & semantic */
  --rui-color-bg: #ffffff;
  --rui-color-bg-subtle: #f8fafc;
  --rui-color-surface: #ffffff;
  --rui-color-surface-muted: #f1f5f9;
  --rui-color-border: #e2e8f0;
  /* The boundary of a control the user has to LOCATE needs 3:1 (WCAG 1.4.11);
     --rui-color-border sits around 1.2:1 in every theme. Darkening it would make
     every divider and table separator in the library heavy, so interactive form
     controls take this separate, darker token and decorative hairlines keep the
     faint one. Kept in sync with colorBorderControl in theme/index.ts. */
  --rui-color-border-control: #767f8c;
  --rui-color-border-subtle: rgba(15, 23, 42, 0.08);
  --rui-color-text: #0f172a;
  --rui-color-text-muted: #475569;
  /* indigo-600, not indigo-500: #6366f1 measures 4.47:1 on this theme's white
     surface, which fails both as text (125 rules paint color: primary) and for
     the white label on a primary button. Kept in sync with theme/index.ts. */
  --rui-color-primary: #4f46e5;
  --rui-color-primary-hover: #4338ca;
  --rui-color-primary-text: #ffffff;
  --rui-color-accent: #4f46e5;
  --rui-color-accent-hover: #4338ca;
  --rui-color-accent-text: #ffffff;
  /* Interactive TEXT (links, link/ghost buttons, selected tab label, pagination
     digits). DERIVED from the accent, so a theme or a partial $theme({accent})
     that only retints the accent still moves its links. A theme overrides these
     when its accent cannot also be text: the accent is simultaneously a FILL
     paired with --rui-color-accent-text, so it cannot just be darkened. soft's
     mint accent measured 1.48:1 as link text and glass's lavender 2.63:1; both
     now ship an explicit pair. Kept in sync with colorLink in theme/index.ts. */
  --rui-color-link: var(--rui-color-accent);
  --rui-color-link-hover: var(--rui-color-accent-hover);
  --rui-color-focus-ring: #4f46e5;
  --rui-color-success: #10b981;
  --rui-color-warning: #f59e0b;
  --rui-color-danger: #ef4444;
  --rui-color-info: #06b6d4;
  /* Text-safe partners for the four status hues. The tokens above are tuned for
     FILLS and shapes, where 3:1 is the bar (WCAG 1.4.11); painted as a text
     colour on a light surface, #10b981 measures 2.54:1 and #f59e0b 2.15:1. Every
     rule that renders status TEXT takes these instead, and a theme that retints
     a status hue is expected to retint its -text partner with it. */
  --rui-color-success-text: #047857;
  --rui-color-warning-text: #a35a00;
  --rui-color-danger-text: #d92d20;
  --rui-color-info-text: #0e7490;
  /* The mirror image: ink for a label sitting ON one of those fills (the check in
     a completed Step, a Callout/Toast icon disc, a danger Button, a TabBar count).
     Those places all used a literal #fff, which fails in every theme — white is
     2.54:1 on success, 2.15:1 on warning, 2.43:1 on info, 3.76:1 on danger. No
     fill was darkened to fix it; a hue-matched dark ink clears 4.5:1 on all four.
     Kept in sync with colorOnSuccess... in theme/index.ts. */
  --rui-color-on-success: #04291e;
  --rui-color-on-warning: #451a03;
  --rui-color-on-danger: #2c0606;
  --rui-color-on-info: #0c2b3a;
  /* Hover wash for rows/cells that are clickable but have no surface of their
     own. Derived from the theme's own ink so it stays visible on dark and
     translucent surfaces — the literal rgba(0,0,0,.04) it replaced did not. */
  --rui-color-surface-hover: color-mix(in srgb, var(--rui-color-text) 6%, var(--rui-color-surface));
  /* Typography */
  --rui-font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --rui-font-family-heading: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --rui-font-family-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --rui-font-size-base: 14px;
  /* Extra type-scale rungs covering the sizes the sheet actually uses, so a
     theme can retune the whole scale. Values match what was hardcoded, so
     converting the raw px to these tokens is visually a no-op. */
  --rui-font-size-10: 10px;
  --rui-font-size-11: 11px;
  --rui-font-size-13: 13px;
  --rui-font-size-15: 15px;
  --rui-font-size-18: 18px;
  --rui-font-size-20: 20px;
  --rui-font-size-24: 24px;
  --rui-font-size-32: 32px;
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
  /* Stacking — ONE ladder for the whole library (audit phase 2).
     Before this existed there were two disjoint families: components hardcoded
     25-81 while overlays hardcoded 1000-9999, so a Modal (50) painted *under* a
     FAB (1300), a Tour (9100) and a Lightbox (9999). sx.ts also exposed a
     third, unused token ladder. These names match the sx zIndex keywords so
     a zIndex style prop and the component's own CSS now agree.
     Anchored popups are promoted to the browser top layer by floating.ts and
     do not depend on these values; the popup tokens are the fallback path. */
  --rui-z-base: 0;
  --rui-z-raised: 10;
  --rui-z-sticky: 100;          /* sticky headers, FAB, speed dial */
  --rui-z-header: 200;
  --rui-z-banner: 300;          /* reading progress, page-top bars */
  --rui-z-overlay: 900;         /* scrims — must sit under what they dim */
  --rui-z-dropdown: 1000;       /* menus, listboxes, autocompletes */
  --rui-z-modal: 1100;          /* modal, sheet, drawer, command palette */
  --rui-z-modal-top: 1200;      /* a dialog that must beat another modal (ConfirmDialog) */
  --rui-z-popover: 1350;
  --rui-z-toast: 1400;
  --rui-z-tooltip: 1500;
  --rui-z-top: 1600;            /* lightbox, tour, spotlight, confetti */
  --rui-z-skip-link: 1700;      /* must stay reachable above everything */
  --rui-z-max: 2147483000;
  /* Spacing — canonical scale none/3xs/2xs/xs/sm/md/lg/xl/2xl/3xl. The
     sm/md/lg storage vars keep their historical short names (-s/-m/-l) so
     existing theme overrides keep working; the canonical spellings alias
     onto them for direct var() access ({spacing.md}, style.token, user CSS). */
  --rui-spacing-3xs: 1px;
  --rui-spacing-2xs: 2px;
  --rui-spacing-xs: 4px;
  --rui-spacing-s: 8px;
  --rui-spacing-m: 12px;
  --rui-spacing-l: 20px;
  --rui-spacing-xl: 32px;
  --rui-spacing-2xl: 48px;
  --rui-spacing-3xl: 80px;
  --rui-spacing-sm: var(--rui-spacing-s);
  --rui-spacing-md: var(--rui-spacing-m);
  --rui-spacing-lg: var(--rui-spacing-l);
  --rui-spacing-none: 0px;
  /* Named gradients (brandable via $theme({ gradients: {...} })) */
  --rui-gradient-brand: linear-gradient(120deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
  --rui-gradient-accent: linear-gradient(120deg, #22d3ee 0%, #6366f1 100%);
  --rui-gradient-warm: linear-gradient(120deg, #f59e0b 0%, #ec4899 100%);
  --rui-gradient-cool: linear-gradient(120deg, #3b82f6 0%, #06b6d4 100%);
  --rui-gradient-success: linear-gradient(120deg, #10b981 0%, #22d3ee 100%);
  --rui-gradient-danger: linear-gradient(120deg, #f43f5e 0%, #ec4899 100%);
  /* Syntax highlighting (CodeBlock / CodeEditor). These existed only as literal
     var() fallbacks — an unthemeable One Dark palette
     painted on CodeBlock's LIGHT --rui-color-surface-muted in five of six
     themes, where #c678dd measures 2.9:1. The defaults below are the light
     palette (4.4-11.7:1 on every theme's muted surface) and the dark theme
     overrides them with One Dark, which is what that palette was drawn for. */
  --rui-hl-keyword: #cf222e;
  --rui-hl-string: #0a3069;
  --rui-hl-number: #0550ae;
  --rui-hl-comment: #57606a;
  --rui-hl-fn: #6f42c1;
  --rui-hl-tag: #116329;
  --rui-hl-attr: #953800;
  --rui-hl-punct: var(--rui-color-text-muted);
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
.rui-icon[data-icon-size="xs"] { font-size: var(--rui-font-size-10); }
.rui-icon[data-icon-size="sm"] { font-size: var(--rui-font-size-sm); }
.rui-icon[data-icon-size="md"] { font-size: var(--rui-font-size-base); }
.rui-icon[data-icon-size="lg"] { font-size: var(--rui-font-size-18); }
.rui-icon[data-icon-size="xl"] { font-size: var(--rui-font-size-24); }

/* Custom (inline-SVG) icons registered via $theme({ icons }) — size to 1em
   so they track the surrounding text / icon-size like a Font Awesome glyph. */
.rui-icon-custom svg { width: 1em; height: 1em; display: block; fill: currentColor; }

/* Field shell — label/hint/error wrapper for inputs (suggestions-global V.4) */
.rui-field { display: flex; flex-direction: column; gap: 6px; }
.rui-field-label { font-size: var(--rui-font-size-13); font-weight: 600; color: var(--rui-color-text); }
.rui-field-required { color: var(--rui-color-danger-text); margin-left: 3px; }
.rui-field-hint { font-size: 12.5px; color: var(--rui-color-text-muted); }
.rui-field-error { font-size: 12.5px; color: var(--rui-color-danger-text); font-weight: 500; }
.rui-field-warning { font-size: 12.5px; color: var(--rui-color-warning-text); font-weight: 500; }
/* Guidance between the label and the control: body size, not hint size. It is
   read BEFORE the field is filled in, so it is prose the reader is meant to act
   on, not a footnote about a value they have already typed. Normal weight keeps
   it from competing with the label above it. */
.rui-field-description { font-size: var(--rui-font-size-13); font-weight: 400; color: var(--rui-color-text-muted); }
/* Normal weight against a 600-weight label. One base rule is enough even where a
   theme raises the label's weight: the cascade compares rules matching the SAME
   element, and this one matches the span, not its parent. */
.rui-field-optional { font-weight: 400; color: var(--rui-color-text-muted); margin-left: 4px; }
.rui-field[data-invalid="true"] .rui-input,
.rui-field[data-invalid="true"] .rui-textarea,
.rui-field[data-invalid="true"] .rui-select,
.rui-field[data-invalid="true"] .rui-number-input { border-color: var(--rui-color-danger); }
/* A control marked invalid with no shell around it (a bare Input with only
   invalid: true returns the element itself, not a wrapper) still has to look invalid — the
   selectors above can only reach a control that has a .rui-field parent. */
.rui-input[aria-invalid="true"],
.rui-textarea[aria-invalid="true"],
.rui-select[aria-invalid="true"] { border-color: var(--rui-color-danger); }
.rui-field[data-warning="true"] .rui-input,
.rui-field[data-warning="true"] .rui-textarea,
.rui-field[data-warning="true"] .rui-select,
.rui-field[data-warning="true"] .rui-number-input { border-color: var(--rui-color-warning); }

/* Requirement list — one row per rule, met / unmet / not yet checked.
   The tri-state is carried by data-met, and the glyph plus a visually-hidden
   word carry it too, so it never rests on colour alone. */
.rui-requirement-list { display: flex; flex-direction: column; gap: 4px; }
.rui-requirement-list-title { font-size: var(--rui-font-size-13); font-weight: 600; color: var(--rui-color-text); }
.rui-requirement-list-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.rui-requirement {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12.5px;
  color: var(--rui-color-text-muted);
}
.rui-requirement-icon { flex-shrink: 0; margin-top: 0.15em; font-size: 0.9em; }
.rui-requirement[data-met="true"] { color: var(--rui-color-success-text); }
.rui-requirement[data-met="false"] { color: var(--rui-color-danger-text); }
/* A rule nothing has been checked against yet reads as neutral, not as failing:
   an untouched form must not accuse the reader of a mistake. */
.rui-requirement[data-met="pending"] { color: var(--rui-color-text-muted); }
.rui-requirement-list[data-pending="true"] .rui-requirement { color: var(--rui-color-text-muted); }

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
  padding: var(--rui-app-margin, 20px);
}

/* ----- Focus-visible safety net -------------------------------------------
   85 classes in this sheet declare cursor: pointer and most of them strip the
   UA chrome (border: none / appearance: none), which also removes the UA focus
   ring — so a keyboard user tabbing a Rating, TabBar item or KanbanCard used to
   see nothing at all outside Windows High Contrast.

   This must LOSE to every per-component rule, including the ones that
   deliberately swap the outline for a box-shadow ring via "outline: none", or it
   would double-ring them. Two things guarantee that: :where() contributes zero
   specificity, so the whole selector weighs exactly one pseudo-class and any
   per-class ":focus-visible" rule outranks it; and it is declared here, near the
   top of the sheet, so a component rule also wins on source order when specificity
   ties. Slider and Switch paint their ring on a sibling or a ::thumb rather than
   on the focused input, so they opt out instead of collecting a second ring.

   Form controls are deliberately absent: .rui-input, .rui-select and friends all
   style :focus themselves with a border + shadow and no outline reset, and would
   be the one group this net actually double-rings. */
:where(.rui-root) :where(
    button, a[href], summary, [tabindex]:not([tabindex="-1"]),
    [role="button"], [role="link"], [role="option"], [role="menuitem"],
    [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"],
    [role="switch"], [role="checkbox"], [role="radio"], [role="treeitem"]
  ):where(:not(.rui-slider-input, .rui-switch-input)):focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: 2px;
}

.rui-error-banner {
  border: var(--rui-border-width) solid var(--rui-color-danger);
  background: color-mix(in srgb, var(--rui-color-danger) 8%, transparent);
  color: var(--rui-color-danger-text);
  border-radius: var(--rui-radius-md);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  font-size: var(--rui-font-size-13);
  margin-bottom: var(--rui-spacing-s);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rui-error-banner[hidden] { display: none; }
/* The universal hidden prop (sx.ts sets the bare attribute) relies on the UA
   rule [hidden] { display: none }, which is normal-origin and loses to any
   author display declaration on the same element — and nearly every component
   root in this sheet has one. So hidden: true used to leave 288 components on
   screen, and each case had to be patched per component (see .rui-error-banner
   above and .rui-validation-summary below). This states it once. !important is
   what makes it beat those author declarations; nothing in the library sets
   [hidden] on an element it then wants painted. */
[hidden] { display: none !important; }
/* Same trap, stated declaratively: an author-sheet display: flex on a component
   root outranks the UA [hidden] rule, so hidden alone never collapses these. The
   dismiss handlers also set an inline display:none, which wins on its own — this
   documents the contract. */
.rui-notification[data-dismissed="true"],
.rui-banner[data-dismissed="true"] { display: none !important; }
.rui-error-banner ul { margin: 0; padding-left: 18px; }

/* Stack */
.rui-stack {
  display: flex;
  gap: var(--rui-spacing-m);
  /* So a Stack nested in a flex/grid parent can shrink below its content's
     min-content width instead of pushing the parent open. */
  min-width: 0;
}
.rui-stack[data-direction="row"] { flex-direction: row; }
.rui-stack[data-direction="column"] { flex-direction: column; }
${spacingAttrRules(".rui-stack", "data-gap", (v) => `gap: ${v};`)}
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
${spacingAttrRules(".rui-stack", "data-padding", (v) => `padding: ${v};`)}
.rui-stack[data-direction="row"][data-uniform="true"] > *:not(.rui-stack-item) { flex: 1 1 auto; min-width: 0; }
.rui-stack[data-direction="row-reverse"][data-uniform="true"] > *:not(.rui-stack-item) { flex: 1 1 auto; min-width: 0; }
/* min-width: 0 on every row child, NOT only the uniform ones: a default Row is
   data-uniform="false", so its children kept min-width: auto — one unbreakable
   URL grew the Row past its Card, and no ellipsis anywhere in the library could
   engage, because no ancestor flex item was allowed to shrink below min-content.
   .rui-stack-item already does exactly this. */
.rui-stack[data-direction="row"] > *,
.rui-stack[data-direction="row-reverse"] > * { min-width: 0; }
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

/* Center — center children on both axes (or one, via data-axis). Pair with
   a minHeight to center vertically inside a tall region. */
.rui-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--rui-spacing-m);
  width: 100%;
  box-sizing: border-box;
  text-align: center;
}
.rui-center[data-inline="true"] { display: inline-flex; width: auto; }
.rui-center[data-axis="horizontal"] { justify-content: flex-start; }
.rui-center[data-axis="vertical"] { align-items: stretch; text-align: left; }
${spacingAttrRules(".rui-center", "data-gap", (v) => `gap: ${v};`)}
${spacingAttrRules(".rui-center", "data-padding", (v) => `padding: ${v};`)}

/* Section — the root rule lives with the page-band block further down (search
   "Section page-band"); this half of a split definition was merged into it. */
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
/* The padding is routed through --rui-card-pad so CardSection's full-bleed
   negative margin can be computed from the SAME value. The band used to hardcode
   --rui-spacing-l while the card dropped to --rui-spacing-m below 720px, which
   overhung the card by 4px a side and put the band's content 4px out of line with
   the header. Everything that changes card padding now sets the variable. */
.rui-card {
  --rui-card-pad: var(--rui-spacing-l);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  padding: var(--rui-card-pad);
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  box-shadow: var(--rui-shadow-sm);
}
.rui-card[data-variant="elevated"] { box-shadow: var(--rui-shadow-md); }
.rui-card[data-variant="outlined"] { box-shadow: none; }
${spacingAttrRules(".rui-card", "data-padding", (v) => `--rui-card-pad: ${v};`)}
/* A clickable Card is a real button/anchor for keyboard operation, so the UA
   chrome — centred text, system font, its own border — has to go, and the
   keyboard target needs a ring. */
button.rui-card,
a.rui-card {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  color: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  width: 100%;
}
.rui-card[data-clickable="true"]:focus-visible { outline: 2px solid var(--rui-color-focus-ring); outline-offset: 2px; }
.rui-card-header { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
/* The header is a column, so an actions container would stack under the subtitle.
   The wrapper pair only exists when actions are present. */
.rui-card-header[data-has-actions="true"] {
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rui-spacing-m);
}
.rui-card-header-text { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); min-width: 0; }
.rui-card-header-actions { display: flex; align-items: center; gap: var(--rui-spacing-s); flex: 0 0 auto; }
.rui-card-title {
  margin: 0;
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-heading);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  text-transform: var(--rui-heading-text-transform);
}
.rui-card-subtitle { margin: 0; color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); }
.rui-card-eyebrow {
  margin: 0;
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-sm);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.rui-card-footer { display: flex; gap: var(--rui-spacing-s); justify-content: flex-end; flex-wrap: wrap; }
/* justify was emitted against a hardcoded flex-end, so the "destructive left,
   confirm right" footer was unexpressible. */
.rui-card-footer[data-justify="start"] { justify-content: flex-start; }
.rui-card-footer[data-justify="center"] { justify-content: center; }
.rui-card-footer[data-justify="end"] { justify-content: flex-end; }
.rui-card-footer[data-justify="between"] { justify-content: space-between; }

/* Text */
/* overflow-wrap so a 64-char unbroken token (an API key, a hash) breaks instead
   of pushing its siblings out of the card, and min-width: 0 so it can shrink
   below its min-content width as a flex item. Here rather than inline in the
   component, so a theme can still override the wrapping. */
.rui-text { display: inline; overflow-wrap: anywhere; min-width: 0; }
.rui-text[data-variant="small"] { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
.rui-text[data-variant="small-heavy"] { font-size: var(--rui-font-size-sm); font-weight: 600; }
.rui-text[data-variant="body"] { font-size: var(--rui-font-size-base); }
.rui-text[data-variant="body-heavy"] { font-size: var(--rui-font-size-base); font-weight: 600; }
.rui-text[data-variant="large"] { font-size: var(--rui-font-size-18); }
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
  font-size: var(--rui-font-size-20);
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
.rui-text[data-color="success"] { color: var(--rui-color-success-text); }
.rui-text[data-color="warning"] { color: var(--rui-color-warning-text); }
.rui-text[data-color="danger"] { color: var(--rui-color-danger-text); }
/* align only works on a block box — the span is inline by default. */
.rui-text[data-align] { display: block; }
.rui-text[data-align="left"] { text-align: left; }
.rui-text[data-align="center"] { text-align: center; }
.rui-text[data-align="right"] { text-align: right; }

/* Image */
.rui-image { margin: 0; display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-image img { max-width: 100%; height: auto; border-radius: var(--rui-radius-md); display: block; }
.rui-image-caption { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); }

/* Link */
/* --rui-color-link, not --rui-color-accent: the accent is also a FILL (paired
   with --rui-color-accent-text) and two themes therefore ship an accent that is
   unreadable as text — soft's mint is 1.48:1 on its own white surface. */
.rui-link {
  color: var(--rui-color-link);
  text-decoration: none;
  font-weight: 500;
  word-break: break-word;
  transition: color var(--rui-transition-duration) ease;
}
.rui-link:hover { color: var(--rui-color-link-hover); text-decoration: underline; }
/* The only focus-visible rule for links was vision-scoped, so on every other
   theme a keyboard user got the UA ring alone — which text-decoration: none makes
   hard to locate (WCAG 2.4.7). The ring is the focus token rather than the accent
   because that is the one token guaranteed to clear 3:1 in every theme. */
.rui-link:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: 2px;
  border-radius: 2px;
}
/* variant is declared, read and written as data-variant with nothing reading it,
   so a subtle link was identical to the default accent one. */
.rui-link[data-variant="subtle"] { color: var(--rui-color-text-muted); font-weight: 400; }
.rui-link[data-variant="subtle"]:hover { color: var(--rui-color-text); }

/* Routing — NavLink anchor + the RouteView page wrapper. NavLink is a
   hash-aware anchor that reflects the current route via data-active="true".
   The .rui-routes outlet block that used to sit here was dead: nothing has
   emitted that class since RouteView replaced it. */
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
  border: var(--rui-border-width) solid transparent;
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
/* data-routes-enabled was dead — nothing in the repo ever wrote it. NavLink's
   disabled prop emits data-disabled, the house convention. */
.rui-nav-link[data-disabled="true"] { opacity: 0.6; pointer-events: none; cursor: not-allowed; }
.rui-nav-link-icon { display: inline-flex; align-items: center; }

/* Badge & Tag */
/* No margin-right: the badge is a flex row and owns the spacing through gap,
   which also makes the icon-only badge centre without a conditional class. */
.rui-badge-icon {
  display: inline-flex;
  align-items: center;
}
.rui-badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rui-spacing-xs);
}

.rui-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 4px;
  border-radius: var(--rui-radius-pill);
  padding: 2px 10px;
  font-size: var(--rui-font-size-sm);
  font-weight: 600;
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text);
}
/* data-size was normalised and emitted on every badge with nothing reading it,
   so size was silently inert while the sibling .rui-tag had its rules. */
.rui-badge[data-size="xs"] { font-size: var(--rui-font-size-10); padding: 0 6px; }
.rui-badge[data-size="sm"] { font-size: var(--rui-font-size-11); padding: 1px 8px; }
.rui-badge[data-size="lg"] { font-size: var(--rui-font-size-base); padding: 4px 12px; }
.rui-badge[data-size="xl"] { font-size: var(--rui-font-size-lg); padding: 6px 14px; }
/* The "+N more" overflow chip is a count, not a label — read it back a step. */
.rui-badge[data-overflow="true"] { opacity: 0.75; cursor: default; }
.rui-badge[data-variant="primary"] { background: var(--rui-color-primary); color: var(--rui-color-primary-text); }
.rui-badge[data-variant="success"] { background: color-mix(in srgb, var(--rui-color-success) 18%, transparent); color: var(--rui-color-success-text); }
.rui-badge[data-variant="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 18%, transparent); color: var(--rui-color-warning-text); }
.rui-badge[data-variant="danger"] { background: color-mix(in srgb, var(--rui-color-danger) 18%, transparent); color: var(--rui-color-danger-text); }
.rui-badge[data-variant="info"] { background: color-mix(in srgb, var(--rui-color-info) 18%, transparent); color: var(--rui-color-info-text); }

.rui-tag {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 4px;
  border-radius: var(--rui-radius-pill);
  padding: 2px 10px;
  font-size: var(--rui-font-size-sm);
  font-weight: 500;
  background: var(--rui-color-surface-muted);
  border: var(--rui-border-width) solid var(--rui-color-border-subtle);
}
.rui-tag[data-size="sm"] { font-size: var(--rui-font-size-11); padding: 1px 8px; }
.rui-tag[data-size="lg"] { font-size: var(--rui-font-size-base); padding: 4px 12px; }
.rui-tag[data-variant="success"] { background: color-mix(in srgb, var(--rui-color-success) 16%, transparent); color: var(--rui-color-success-text); border-color: transparent; }
.rui-tag[data-variant="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 16%, transparent); color: var(--rui-color-warning-text); border-color: transparent; }
.rui-tag[data-variant="danger"] { background: color-mix(in srgb, var(--rui-color-danger) 16%, transparent); color: var(--rui-color-danger-text); border-color: transparent; }
.rui-tag[data-variant="primary"] { background: color-mix(in srgb, var(--rui-color-primary) 16%, transparent); color: var(--rui-color-primary); border-color: transparent; }

/* Pill — soft tinted STATE label (vs Badge's solid attention chip). Pale
   semantic background + dark semantic text, regular weight, fully rounded.
   Tone vocabulary follows the UI block ".pill" block. */
.rui-pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 4px;
  border-radius: var(--rui-radius-pill);
  padding: 2px 8px;
  font-size: var(--rui-font-size-sm);
  font-weight: 400;
  line-height: 1.45;
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
}
.rui-pill-icon { font-size: 0.95em; }
.rui-pill[data-tone="activating"] { background: color-mix(in srgb, var(--rui-color-info) 16%, transparent); color: var(--rui-color-info-text); }
.rui-pill[data-tone="corporate"] { background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent); color: var(--rui-color-primary); }
.rui-pill[data-tone="success"] { background: color-mix(in srgb, var(--rui-color-success) 16%, transparent); color: var(--rui-color-success-text); }
.rui-pill[data-tone="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 18%, transparent); color: var(--rui-color-warning-text); }
.rui-pill[data-tone="critical"] { background: color-mix(in srgb, var(--rui-color-danger) 14%, transparent); color: var(--rui-color-danger-text); }
.rui-pill[data-tone="promoting"] { background: color-mix(in srgb, var(--rui-chart-5, #b410e7) 14%, transparent); color: var(--rui-chart-5, #b410e7); }

/* ButtonGroup — buttons joined edge-to-edge into one continuous control:
   only the outer corners round, adjoining borders collapse to a single
   shared hairline. */
.rui-button-group { display: inline-flex; flex-wrap: nowrap; vertical-align: middle; }
.rui-button-group[data-full-width="true"] { display: flex; width: 100%; }
.rui-button-group[data-full-width="true"] > .rui-button-group-item { flex: 1 1 0; }
.rui-button-group > .rui-button-group-item { margin: 0; border-radius: 0; }
.rui-button-group > .rui-button-group-item[data-pos="start"] {
  border-top-left-radius: var(--rui-radius-button);
  border-bottom-left-radius: var(--rui-radius-button);
}
.rui-button-group > .rui-button-group-item[data-pos="end"] {
  border-top-right-radius: var(--rui-radius-button);
  border-bottom-right-radius: var(--rui-radius-button);
}
.rui-button-group > .rui-button-group-item[data-pos="only"] { border-radius: var(--rui-radius-button); }
/* collapse the doubled border between adjoining items */
.rui-button-group > .rui-button-group-item[data-pos="middle"],
.rui-button-group > .rui-button-group-item[data-pos="end"] { border-left-width: 0; }

/* InputGroup — one bordered shell around a field plus optional leading icon
   and trailing action, so the focus ring surrounds the whole composite. */
.rui-input-group {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-input);
  overflow: hidden;
}
.rui-input-group:focus-within {
  border-color: var(--rui-color-focus-ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 22%, transparent);
}
/* The shell owns the border, so disabled and invalid have to be read here: the
   nested control's own chrome is stripped, which puts .rui-field[data-invalid]
   out of reach of anything visible. */
.rui-input-group[data-disabled="true"] {
  opacity: 0.55;
  cursor: not-allowed;
  background: var(--rui-color-surface-muted);
}
.rui-input-group[data-disabled="true"]:focus-within { border-color: var(--rui-color-border); box-shadow: none; }
.rui-input-group[data-invalid="true"] { border-color: var(--rui-color-danger); }
.rui-input-group[data-invalid="true"]:focus-within {
  border-color: var(--rui-color-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-danger) 22%, transparent);
}
.rui-input-group-icon { flex: none; margin-left: 10px; color: var(--rui-color-text-muted); }
.rui-input-group-field { flex: 1 1 auto; min-width: 0; display: flex; }
/* the nested control loses its own chrome — the group owns it now.
   Descendant, not child: as soon as the field carries a label/hint/error the
   control is wrapped in a .rui-field, so a child combinator misses it and the
   shell renders a box inside a box with two focus rings. */
.rui-input-group-field .rui-input,
.rui-input-group-field .rui-select,
.rui-input-group-field .rui-textarea,
.rui-input-group-field .rui-number-input,
.rui-input-group-field .rui-combobox-trigger {
  border: none; border-radius: 0; background: transparent; width: 100%; box-shadow: none; outline: none;
}
.rui-input-group-field .rui-input:focus,
.rui-input-group-field .rui-select:focus,
.rui-input-group-field .rui-textarea:focus,
.rui-input-group-field .rui-number-input:focus,
.rui-input-group-field .rui-combobox-trigger:focus { border: none; box-shadow: none; outline: none; }
.rui-input-group-suffix {
  flex: none; padding: 0 10px; color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-sm); white-space: nowrap;
}
.rui-input-group-action { flex: none; display: flex; align-items: center; }

/* FilterPill — toggleable filter control (vs FilterChips' removable chips). */
.rui-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-pill);
  padding: 4px 12px;
  font-size: var(--rui-font-size-sm);
  font-family: inherit;
  color: var(--rui-color-text);
  background: var(--rui-color-surface);
  cursor: pointer;
  transition: background var(--rui-transition-duration) ease, color var(--rui-transition-duration) ease, border-color var(--rui-transition-duration) ease;
}
.rui-filter-pill:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-filter-pill:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: 2px;
}
.rui-filter-pill[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--rui-color-primary) 40%, transparent);
  color: var(--rui-color-primary);
  font-weight: 600;
}
.rui-filter-pill:disabled { opacity: 0.5; cursor: not-allowed; }
.rui-filter-pill-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

/* ActionStripe — full-width clickable navigation row with a chevron. */
.rui-action-stripe {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m);
  width: 100%;
  box-sizing: border-box;
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  background: var(--rui-color-surface);
  border: none;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle);
  border-radius: 0;
  font: inherit;
  color: var(--rui-color-text);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--rui-transition-duration) ease;
}
.rui-action-stripe:last-child { border-bottom: none; }
.rui-action-stripe:hover:not([data-disabled="true"]) { background: var(--rui-color-surface-muted); }
.rui-action-stripe:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: -2px;
}
.rui-action-stripe[data-disabled="true"] { opacity: 0.55; cursor: not-allowed; }
.rui-action-stripe-icon { flex: none; font-size: var(--rui-font-size-20); color: var(--rui-color-link); }
.rui-action-stripe-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rui-action-stripe-label { font-weight: 600; }
.rui-action-stripe-description { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); }
.rui-action-stripe-value { flex: none; color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); }
/* The trailing-node slot (Switch, Badge, Avatar) had no rule, so a Switch in a
   settings row was neither centred against the label nor safe from the flex row
   squeezing it. */
.rui-action-stripe-trailing { display: inline-flex; align-items: center; gap: var(--rui-spacing-s); flex-shrink: 0; }
.rui-action-stripe-chevron {
  flex: none;
  width: 0.5em; height: 0.5em;
  border-right: 2px solid var(--rui-color-text-muted);
  border-bottom: 2px solid var(--rui-color-text-muted);
  transform: rotate(-45deg);
}

/* CardSection — full-bleed semantic band inside a Card. */
.rui-card-section {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  /* Bleed and inset both read the Card's own --rui-card-pad, so the band always
     lines up with the header no matter what the card's padding resolves to. */
  margin-inline: calc(-1 * var(--rui-card-pad, var(--rui-spacing-l)));
  padding-block: var(--rui-spacing-m);
  padding-inline: var(--rui-card-pad, var(--rui-spacing-l));
}
.rui-card-section[data-align="center"] { text-align: center; }
.rui-card-section[data-align="right"] { text-align: right; }
.rui-card-section[data-tone="activating"] { background: color-mix(in srgb, var(--rui-color-info) 8%, transparent); border-top: 2px solid var(--rui-color-info); border-bottom: 2px solid var(--rui-color-info); }
.rui-card-section[data-tone="success"] { background: color-mix(in srgb, var(--rui-color-success) 8%, transparent); border-top: 2px solid var(--rui-color-success); border-bottom: 2px solid var(--rui-color-success); }
.rui-card-section[data-tone="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 10%, transparent); border-top: 2px solid var(--rui-color-warning); border-bottom: 2px solid var(--rui-color-warning); }
.rui-card-section[data-tone="critical"] { background: color-mix(in srgb, var(--rui-color-danger) 8%, transparent); border-top: 2px solid var(--rui-color-danger); border-bottom: 2px solid var(--rui-color-danger); }
.rui-card-section[data-tone="neutral"] { background: var(--rui-color-surface-muted); border-top: 2px solid var(--rui-color-border); border-bottom: 2px solid var(--rui-color-border); }
.rui-card-section[data-tone="corporate"] { background: color-mix(in srgb, var(--rui-color-primary) 8%, transparent); border-top: 2px solid var(--rui-color-primary); border-bottom: 2px solid var(--rui-color-primary); }
.rui-card-section[data-tone="promoting"] { background: color-mix(in srgb, var(--rui-chart-5, #b410e7) 8%, transparent); border-top: 2px solid var(--rui-chart-5, #b410e7); border-bottom: 2px solid var(--rui-chart-5, #b410e7); }

/* Callout footer — action row under the callout body. */
.rui-callout-footer { display: flex; flex-wrap: wrap; gap: var(--rui-spacing-s); margin-top: var(--rui-spacing-s); }

/* There is no Alert component — Callout above is the banner primitive. The
   .rui-alert / .rui-alert-title block that used to sit here, plus its four
   variant rules, matched nothing in any of the 288 renders. */

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
/* The alt-text stand-in for an image that failed to load — italic muted so it
   reads as a note about missing content, not as body copy. */
.rui-markdown-image-fallback { color: var(--rui-color-text-muted); font-style: italic; }
.rui-markdown p { margin: 0; }
.rui-markdown ul { margin: 0; padding-left: var(--rui-spacing-l); }
.rui-markdown code {
  background: var(--rui-color-surface-muted);
  border-radius: 4px;
  padding: 0 4px;
  font-family: var(--rui-font-family-mono);
  font-size: 0.92em;
}

/* The .rui-divider family that used to sit here was the pre-rename spelling of
   Separator below; nothing emits it. Its four theme overrides went with it —
   every one of them already listed .rui-separator alongside. */

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
  font-size: var(--rui-font-size-13);
}
/* A bare component item is wrapped in an li so the ol only ever has li children
   and the item keeps the 44px gutter — but it must not also get a numbered badge
   or consume a step number, or two real steps render as a three-rung ladder. */
.rui-steps-item[data-bare="true"] { counter-increment: none; }
.rui-steps-item[data-bare="true"]::before { content: none; }
/* Pending / active / complete / error share MultiStepForm's visual language.
   The badge is drawn with ::before; the old active accent targeted ::marker,
   which list-style: none means never exists, so the highlight was invisible. */
.rui-steps-item[data-status="pending"]::before {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
  border: var(--rui-border-width) solid var(--rui-color-border);
}
/* The glyph reads on-success / on-danger, not #ffffff: white on a success fill is
   2.54:1 and on a danger fill 3.76:1 in the light theme, and worse in the pastel
   ones — the check mark was the least readable thing in the stepper. */
.rui-steps-item[data-complete="true"]::before { content: "✓"; background: var(--rui-color-success); color: var(--rui-color-on-success); }
.rui-steps-item[data-status="error"]::before { content: "!"; background: var(--rui-color-danger); color: var(--rui-color-on-danger); }
.rui-steps-title { font-weight: 600; line-height: 28px; }
.rui-steps-details { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); margin-top: 2px; }
/* orientation was emitted against a hardcoded column, so a horizontal stepper
   across the top of a checkout still stacked. Modelled on the row layout
   .rui-multi-step-form-steps already uses. */
.rui-steps[data-orientation="horizontal"] { flex-direction: row; flex-wrap: wrap; }
.rui-steps[data-orientation="horizontal"] .rui-steps-item {
  flex: 1 1 0;
  min-width: 0;
  padding-left: 0;
  padding-top: 36px;
}
.rui-steps[data-orientation="horizontal"] .rui-steps-item::before { left: 0; }

/* Callout */
/* Mirrors UI block's .message / .message__section split: the OUTER element draws the
   chrome and clips, the INNER section lays out and pads. Keeping the two apart is what
   lets a themed left status bar be cut straight by the corner arc rather than curling
   around the radius (see the vision block). */
.rui-callout {
  display: block;
  border-radius: var(--rui-radius-md);
  border: var(--rui-border-width) solid var(--rui-color-border);
  background: var(--rui-color-surface);
  overflow: hidden;
}
.rui-callout-section {
  display: flex;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
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
  font-size: var(--rui-font-size-13);
  background: var(--rui-color-info);
  /* Ink tracks the disc's fill (see the per-variant rules below). The literal
     #ffffff this replaces was 2.43:1 on the info fill it sits on by default. */
  color: var(--rui-color-on-info);
}
.rui-callout-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.rui-callout-title { font-weight: 600; }
.rui-callout-description { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); }
/* compact was emitted with nothing reading it — the padding lives on the section
   unconditionally, so compact:true was byte-identical to compact:false. */
.rui-callout[data-compact="true"] .rui-callout-section { padding: 6px 10px; gap: 6px; }
.rui-callout[data-compact="true"] .rui-callout-icon { width: 16px; height: 16px; font-size: var(--rui-font-size-10); }
.rui-callout[data-compact="true"] .rui-callout-title { font-size: var(--rui-font-size-sm); }
/* The dismissible Callout's close button had no rule at all, so it drew default
   browser button chrome inside the banner. */
.rui-callout-dismiss {
  flex-shrink: 0;
  align-self: flex-start;
  margin-left: auto;
  background: transparent;
  border: 0;
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-18);
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--rui-radius-sm);
  cursor: pointer;
}
.rui-callout-dismiss:hover { color: var(--rui-color-text); background: var(--rui-color-surface-muted); }
.rui-callout[data-variant="info"] { background: color-mix(in srgb, var(--rui-color-info) 8%, var(--rui-color-surface)); border-color: color-mix(in srgb, var(--rui-color-info) 30%, transparent); }
.rui-callout[data-variant="info"] .rui-callout-icon { background: var(--rui-color-info); color: var(--rui-color-on-info); }
.rui-callout[data-variant="success"] { background: color-mix(in srgb, var(--rui-color-success) 8%, var(--rui-color-surface)); border-color: color-mix(in srgb, var(--rui-color-success) 30%, transparent); }
.rui-callout[data-variant="success"] .rui-callout-icon { background: var(--rui-color-success); color: var(--rui-color-on-success); }
.rui-callout[data-variant="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 10%, var(--rui-color-surface)); border-color: color-mix(in srgb, var(--rui-color-warning) 32%, transparent); }
.rui-callout[data-variant="warning"] .rui-callout-icon { background: var(--rui-color-warning); color: var(--rui-color-on-warning); }
.rui-callout[data-variant="danger"], .rui-callout[data-variant="error"] {
  background: color-mix(in srgb, var(--rui-color-danger) 8%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-color-danger) 32%, transparent);
}
.rui-callout[data-variant="danger"] .rui-callout-icon, .rui-callout[data-variant="error"] .rui-callout-icon {
  background: var(--rui-color-danger);
  color: var(--rui-color-on-danger);
}
.rui-callout[data-variant="neutral"] .rui-callout-icon {
  background: var(--rui-color-text-muted);
  /* The only disc whose fill is NOT a status hue. primary-text is the token that
     already means "readable on a filled surface" and it flips with the theme, so
     the glyph stays legible on a muted grey that is dark in five themes and light
     in the dark one: 7.58:1 in light, 7.30:1 in dark, 5.25-7.05:1 elsewhere. */
  color: var(--rui-color-primary-text);
}

/* CodeBlock */
.rui-code-block {
  display: flex;
  flex-direction: column;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface-muted);
  overflow: hidden;
  font-size: var(--rui-font-size-13);
}
/* Chromeless variant (header=false): no frame, fills its container, scrolls. */
.rui-code-block[data-headerless="true"] {
  border: none;
  border-radius: 0;
  width: 100%;
  height: 100%;
}
.rui-code-block-language {
  font-family: var(--rui-font-family-mono);
  font-size: var(--rui-font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--rui-color-text-muted);
  padding: 6px 12px;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle);
}
/* Matches its sibling above minus the uppercase — a filename is a filename. */
.rui-code-block-filename { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-11); padding: 6px 12px; }
.rui-code-block-pre {
  margin: 0;
  padding: var(--rui-spacing-m);
  font-family: var(--rui-font-family-mono);
  white-space: pre;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  color: var(--rui-color-text);
}

/* CheckBoxGroup */
.rui-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
}
/* CheckBoxItem is exported on its own, so the layout has to work without a
   group ancestor — otherwise a standalone item is a block label and the box
   lands on its own line above the text. Only the card chrome stays scoped. */
.rui-checkbox-item {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-s);
}
.rui-checkbox-group .rui-checkbox-item {
  padding: var(--rui-spacing-s);
  border: var(--rui-border-width) solid var(--rui-color-border-subtle);
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
.rui-checkbox-item-label { font-weight: 500; font-size: var(--rui-font-size-13); }
.rui-checkbox-item-description { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); }

/* Tabs */
.rui-tabs { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-tab-list {
  display: flex;
  gap: var(--rui-spacing-xs);
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  flex-wrap: wrap;
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
/* After :hover so a disabled trigger stops lighting up under the pointer. */
.rui-tab-trigger:disabled,
.rui-tab-trigger[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; color: var(--rui-color-text-muted); }
.rui-tab-trigger:disabled:hover { color: var(--rui-color-text-muted); }
.rui-tab-trigger[aria-selected="true"] {
  color: var(--rui-color-primary);
  border-bottom-color: var(--rui-color-primary);
}
/* fitted: the strip spans its container and the triggers share it equally, so a
   two-tab strip reads as two halves of one surface rather than two labels tucked
   into the left corner. Wrapping and horizontal scroll are both off — a fitted
   strip divides the row it has, so there is nothing to wrap onto or scroll to. */
.rui-tabs[data-fitted="true"] .rui-tab-list { flex-wrap: nowrap; overflow-x: visible; gap: 0; }
.rui-tabs[data-fitted="true"] .rui-tab-trigger {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Vertical tabs are already full-width by their own layout, so fitted is a no-op
   there rather than a competing flex direction. */
.rui-tabs[data-orientation="vertical"][data-fitted="true"] .rui-tab-trigger { flex: 0 0 auto; justify-content: flex-start; }
.rui-tab-panels { display: block; }
.rui-tab-content { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-tab-content[data-active="false"] { display: none; }

/* Accordion */
.rui-accordion { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
.rui-accordion-item {
  border: var(--rui-border-width) solid var(--rui-color-border);
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
/* disabled emits data-disabled, sets aria-disabled on the summary and swallows
   the activation click, but the row still looked fully interactive — so a
   "available after you pick a plan" section read as clickable. */
.rui-accordion-item[data-disabled="true"] { opacity: 0.6; }
.rui-accordion-item[data-disabled="true"] > .rui-accordion-trigger { cursor: not-allowed; }
/* Semantic left stripe, mirroring the vision theme's own accordion variants
   so the prop is not a silent no-op in every other theme. */
.rui-accordion-item[data-variant="success"] { box-shadow: inset 4px 0 0 0 var(--rui-color-success); }
.rui-accordion-item[data-variant="warning"] { box-shadow: inset 4px 0 0 0 var(--rui-color-warning); }
.rui-accordion-item[data-variant="danger"] { box-shadow: inset 4px 0 0 0 var(--rui-color-danger); }
.rui-accordion-item[data-variant="info"] { box-shadow: inset 4px 0 0 0 var(--rui-color-info); }
.rui-accordion-item[data-variant="neutral"] { box-shadow: inset 4px 0 0 0 var(--rui-color-border); }
.rui-accordion-title { flex: 1; min-width: 0; }
/* Two-line trigger: the title keeps its weight, the subtitle is the quieter
   preview of what the collapsed section holds. */
.rui-accordion-heading { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rui-accordion-heading .rui-accordion-title { flex: 0 0 auto; }
.rui-accordion-subtitle {
  font-weight: 400;
  font-size: var(--rui-font-size-sm);
  line-height: 1.4;
  color: var(--rui-color-text-muted);
}
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
  z-index: var(--rui-z-modal);
  /* Stops the gesture chaining to the document once the modal reaches its end. */
  overscroll-behavior: contain;
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
  /* dvh with a vh fallback: on iOS Safari 100vh is the LARGEST viewport, roughly
     80px taller than the visible one, so the footer — the canonical place for the
     action buttons — rendered under the browser toolbar and could not be tapped. */
  max-height: calc(100vh - 2 * var(--rui-spacing-l));
  max-height: calc(100dvh - 2 * var(--rui-spacing-l));
  overflow-y: auto;
}
.rui-modal-header { display: flex;justify-content: space-between; }
.rui-modal-title { margin: 0; font-size: var(--rui-font-size-18); }
.rui-modal-close { background: none; border: none; padding: 5px; margin: 0; cursor: pointer; font-size: var(--rui-font-size-18); color: var(--rui-color-primary); }

/* Forms */
.rui-form { display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-form-control { display: flex; flex-direction: column; gap: 4px; }
.rui-form-label { font-size: var(--rui-font-size-13); font-weight: 600; color: var(--rui-color-text); }
.rui-form-hint { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); margin: 0; }
.rui-form-actions {
  display: flex;
  gap: var(--rui-spacing-s);
  justify-content: flex-end;
  margin-top: var(--rui-spacing-s);
  flex-wrap: wrap;
}

.rui-input, .rui-select, .rui-textarea {
  width: 100%;
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
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
  font-size: var(--rui-font-size-base);
  user-select: none;
  line-height: 1.4;
}
.rui-radio-group { display: flex; flex-direction: column; gap: var(--rui-spacing-xs); }
/* Per-option trailing content (Radio slots). The option keeps its own label
   box; the slot sits beside it so a control in there is clickable without
   selecting the radio. A group that has slots always stacks — the rows are
   tall enough that flowing them inline would interleave the controls. */
.rui-radio-group[data-slots="true"] { flex-direction: column; flex-wrap: nowrap; align-items: stretch; }
.rui-radio-row { display: flex; align-items: center; gap: var(--rui-spacing-m); flex-wrap: wrap; }
.rui-radio-slot { display: flex; align-items: center; gap: var(--rui-spacing-m); min-width: 0; }

/* Custom Checkbox & Radio control styling.
 * Hides the native input visually but keeps it focusable; renders the
 * checked state via a CSS-painted indicator so the appearance is
 * consistent across themes and platforms. */
.rui-checkbox input[type="checkbox"],
.rui-checkbox-item input[type="checkbox"],
.rui-data-grid-col-panel-cb,
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
  border: 1.5px solid var(--rui-color-border-control, var(--rui-color-border));
  cursor: pointer;
  position: relative;
  transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.rui-checkbox input[type="checkbox"],
.rui-checkbox-item input[type="checkbox"],
.rui-data-grid-col-panel-cb {
  border-radius: 5px;
}
.rui-radio input[type="radio"] {
  border-radius: 999px;
}
.rui-checkbox input[type="checkbox"]:hover,
.rui-checkbox-item input[type="checkbox"]:hover,
.rui-data-grid-col-panel-cb:hover:not(:disabled),
.rui-radio input[type="radio"]:hover {
  border-color: var(--rui-color-primary);
}
.rui-checkbox input[type="checkbox"]:focus-visible,
.rui-checkbox-item input[type="checkbox"]:focus-visible,
.rui-data-grid-col-panel-cb:focus-visible,
.rui-radio input[type="radio"]:focus-visible {
  outline: none;
  border-color: var(--rui-color-focus-ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 22%, transparent);
}
.rui-checkbox input[type="checkbox"]:checked,
.rui-checkbox-item input[type="checkbox"]:checked,
.rui-data-grid-col-panel-cb:checked,
.rui-radio input[type="radio"]:checked {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
}
.rui-checkbox input[type="checkbox"]:checked::after,
.rui-checkbox-item input[type="checkbox"]:checked::after,
.rui-data-grid-col-panel-cb:checked::after {
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
/* #fff on a danger fill is 3.76:1 in light/dark, 3.67:1 in modern and 1.89:1 in
   soft — the destructive action was the least readable button in the library. The
   ink token clears 4.5:1 on every theme's danger fill without moving the hue, which
   also draws borders, dots and progress bars. The hover BRIGHTENS rather than
   darkens for the same reason vision's does (critical-5 -> critical-4): mixing
   toward black shrinks the gap to a dark ink, mixing toward white widens it. */
.rui-button[data-variant="danger"] { background: var(--rui-color-danger); color: var(--rui-color-on-danger); }
.rui-button[data-variant="danger"]:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-danger) 85%, white); }
/* "default" is an alias for the base (primary) look — no override needed. */
.rui-button[data-variant="outline"] { background: transparent; color: var(--rui-color-primary); border-color: color-mix(in srgb, var(--rui-color-primary) 55%, transparent); }
.rui-button[data-variant="outline"]:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-primary) 10%, transparent); border-color: var(--rui-color-primary); }
.rui-button[data-variant="link"] { background: transparent; color: var(--rui-color-primary); border-color: transparent; text-underline-offset: 3px; }
.rui-button[data-variant="link"]:hover:not(:disabled) { background: transparent; color: var(--rui-color-primary-hover); text-decoration: underline; }
.rui-button[data-size="xs"] { padding: calc(var(--rui-button-padding-y) * 0.45) calc(var(--rui-button-padding-x) * 0.6); font-size: var(--rui-font-size-11); }
.rui-button[data-size="sm"] { padding: calc(var(--rui-button-padding-y) * 0.55) calc(var(--rui-button-padding-x) * 0.7); font-size: var(--rui-font-size-sm); }
.rui-button[data-size="lg"] { padding: calc(var(--rui-button-padding-y) * 1.4) calc(var(--rui-button-padding-x) * 1.3); font-size: var(--rui-font-size-lg); }
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}
.rui-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--rui-font-size-13);
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
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  white-space: nowrap;
}
.rui-table th {
  background: var(--rui-color-bg-subtle);
  font-weight: 600;
  /* No position: sticky here. It only works inside a vertical scroller, which
     the wrapper only becomes under [data-sticky="true"] (that rule sets both
     max-height and the sticky th) — so unconditionally it did nothing except
     make every header cell a positioned element that painted over a tooltip
     opened in the first data row. The [data-sticky="false"] reset that used to
     undo it is now redundant but kept, in case a wrapper omits the attribute. */
}
.rui-table td[data-format="number"], .rui-table td[data-format="currency"] {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* Col(wrap:) — both grids emit data-wrap on th and td (null when the column said
   nothing, so the nowrap default above still applies). Without these the prop
   validated and did nothing, because the base rule pins nowrap unconditionally. */
.rui-table th[data-wrap="true"], .rui-table td[data-wrap="true"],
.rui-data-grid-table th[data-wrap="true"], .rui-data-grid-table td[data-wrap="true"] {
  white-space: normal;
  overflow-wrap: anywhere;
}
.rui-table th[data-wrap="false"], .rui-table td[data-wrap="false"],
.rui-data-grid-table th[data-wrap="false"], .rui-data-grid-table td[data-wrap="false"] {
  white-space: nowrap;
}
.rui-table tbody tr:last-child td { border-bottom: none; }
/* onRowClick sets tabIndex = 0 on every row, so the rows are keyboard-reachable
   and need a visible focus indicator (WCAG 2.4.7) plus a pointer affordance. */
.rui-table tr[data-clickable="true"],
.rui-data-grid-table tbody tr[data-clickable="true"] { cursor: pointer; }
.rui-table tr[data-clickable="true"]:hover > td,
.rui-data-grid-table tbody tr[data-clickable="true"]:hover > td { background: var(--rui-color-surface-muted); }
.rui-table tr[data-clickable="true"]:focus-visible,
.rui-data-grid-table tbody tr[data-clickable="true"]:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: -2px;
}
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
  border: var(--rui-border-width) solid var(--rui-color-border-subtle);
  background: var(--rui-color-surface);
}
/* divided: the flush hairline list — the common settings-list shape — had no rule
   at all, so the prop was inert. */
.rui-list[data-divided="true"] {
  gap: 0;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  overflow: hidden;
}
.rui-list[data-divided="true"] > .rui-list-item {
  border: 0;
  border-radius: 0;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle);
}
.rui-list[data-divided="true"] > .rui-list-item:last-child { border-bottom: 0; }
/* active/selected already sets aria-current, so AT was covered — this is the
   visible half. The inset bar keeps the state from being colour-only. */
.rui-list-item[data-active="true"] {
  border-color: var(--rui-color-primary);
  background: color-mix(in srgb, var(--rui-color-primary) 8%, var(--rui-color-surface));
  box-shadow: inset 2px 0 0 var(--rui-color-primary);
}
/* tone was emitted with no rule, so a status list rendered every row on the same
   neutral surface. Accent border, matching the other toned surfaces. */
.rui-list-item[data-tone="primary"] { border-left: 3px solid var(--rui-color-primary); }
.rui-list-item[data-tone="success"] { border-left: 3px solid var(--rui-color-success); }
.rui-list-item[data-tone="warning"] { border-left: 3px solid var(--rui-color-warning); }
.rui-list-item[data-tone="danger"] { border-left: 3px solid var(--rui-color-danger); }
.rui-list-item[data-tone="info"] { border-left: 3px solid var(--rui-color-info); }
.rui-list-icon { font-size: var(--rui-font-size-20); }
.rui-list-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* A clickable ListItem is a real button or anchor; without the reset it rendered
   as a grey UA button box (or an underlined link) inside the row. */
.rui-list-action {
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-decoration: none;
  text-align: left;
  cursor: pointer;
  flex: 1 1 auto;
}
.rui-list-trailing { margin-left: auto; display: flex; align-items: center; gap: var(--rui-spacing-xs); flex: 0 0 auto; }
.rui-list-title { font-weight: 600; }
.rui-list-description { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); }
/* Same muted, centred treatment .rui-table-empty already uses. */
.rui-list-empty, .rui-tree-empty {
  list-style: none;
  text-align: center;
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-13);
  padding: var(--rui-spacing-m);
}

/* StatCard */
.rui-stat-card {
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-lg);
}
.rui-stat-label { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); text-transform: uppercase; letter-spacing: 0.04em; }
.rui-stat-value {
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-24);
  font-weight: var(--rui-font-weight-heading);
  line-height: var(--rui-line-height-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
}
.rui-stat-trend { font-size: var(--rui-font-size-sm); font-weight: 600; }
.rui-stat-trend[data-trend="up"] { color: var(--rui-color-success-text); }
.rui-stat-trend[data-trend="down"] { color: var(--rui-color-danger-text); }

/* Charts — the ONE canonical home for the .rui-chart* selectors.
   These used to be declared twice (here and again under "Advanced charts"), so
   the cascade decided per property which file's intent won: gap, title size,
   tick size, legend gap and the swatch shape came from the later block while
   padding/border/background survived only because that block forgot to
   re-declare them. The winning values are folded in below and the duplicates
   are gone, so the rendering is unchanged and there is a single place to edit. */
.rui-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: var(--rui-spacing-m);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
}
.rui-chart-title { font-weight: 600; font-size: var(--rui-font-size-13); color: var(--rui-color-text); }
/* max-height is the default height cap the chart components rely on: they only
   emit an inline override when the requested height differs from their default,
   so removing it here would uncap every default chart. */
.rui-chart-svg { display: block; width: 100%; height: auto; max-height: 240px; }
.rui-chart-svg text { fill: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); font-family: var(--rui-font-family); }
.rui-chart-label { font-size: var(--rui-font-size-11); fill: var(--rui-color-text-muted); }
.rui-chart-tick { font-size: 10.5px; fill: var(--rui-color-text-muted); }
.rui-chart-empty {
  padding: 24px;
  text-align: center;
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-13);
}
/* A Series written outside a chart renders this placeholder in a <span>, whose
   padding and centring are inert on an inline box. */
.rui-series { display: block; }
.rui-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 12.5px;
  color: var(--rui-color-text-muted);
}
.rui-chart-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.rui-chart-legend-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
/* Pie chart inline value labels: bold, centered, painted with a soft
 * stroke (set inline) so they remain legible on any slice color. The
 * specificity here is higher than the generic '.rui-chart-svg text'
 * fill, so the white fill wins. */
.rui-chart-svg .rui-pie-chart-value,
.rui-pie-chart .rui-pie-chart-value {
  font-size: var(--rui-font-size-sm);
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
.rui-section-block-title { margin: 0; font-size: var(--rui-font-size-lg); font-weight: 600; }
.rui-section-block-description { margin: 0; color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); }
.rui-list-block { margin: 0; padding-left: var(--rui-spacing-l); }
.rui-list-block[data-marker="check"] { list-style: none; padding-left: 0; }
.rui-list-block[data-marker="check"] li::before {
  content: "\\2713";
  margin-right: 0.5em;
  color: var(--rui-color-success-text);
}
.rui-list-block li { margin-bottom: 4px; }

.rui-follow-up { display: flex; flex-direction: column; gap: var(--rui-spacing-s); margin-top: var(--rui-spacing-m); }
.rui-follow-up-title { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.rui-follow-up-list { display: flex; flex-wrap: wrap; gap: var(--rui-spacing-s); }
.rui-follow-up-button {
  border: var(--rui-border-width) solid var(--rui-color-border);
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: var(--rui-font-size-13);
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
.rui-action-link:focus-visible {
  outline: 2px solid var(--rui-color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
/* The component has honoured disabled functionally since it shipped — the click
   handler is simply not attached — but looked entirely live, so the only way to
   discover an inert link was to click it. */
.rui-action-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  text-decoration: none;
}
/* The gap used to be written inline, which no theme could override. It is one
   declaration per side, flipped by the same data-icon-position Button uses. */
.rui-action-link-icon { margin-inline-end: 0.35em; }
.rui-action-link[data-icon-position="end"] .rui-action-link-icon {
  margin-inline-end: 0;
  margin-inline-start: 0.35em;
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
${spacingAttrRules(".rui-grid", "data-gap", (v) => `gap: ${v};`)}

/* Responsive prop maps for Grid columns/gap and Stack direction/gap.
 * Components set --rui-grid-cols-{bp} / --rui-stack-dir-{bp} CSS vars for
 * each requested breakpoint; the cascade picks the most specific value
 * via mobile-first min-width media queries. */
.rui-grid[data-responsive-cols] {
  grid-template-columns: repeat(var(--rui-grid-cols-base, 1), minmax(var(--rui-grid-min-child, 0), 1fr));
}
.rui-grid[data-responsive-gap] {
  gap: var(--rui-grid-gap-base, var(--rui-spacing-m));
}
${responsiveAxisGapRules(0)}
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
/* Bento row height takes the same responsive maps. Lives here rather than next
   to the Bento block so the per-breakpoint overrides below stay downstream of
   it; the plain .rui-bento rule that reads --rui-bento-row is one class less
   specific, so it still loses to every rule in this section. */
.rui-bento[data-responsive-row] {
  grid-auto-rows: var(--rui-bento-row-base, minmax(110px, auto));
}
${rowAtRules("base")}
${up("sm")} {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1)), minmax(var(--rui-grid-min-child, 0), 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m)));
  }
${responsiveAxisGapRules(1)}
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
  .rui-bento[data-responsive-row] {
    grid-auto-rows: var(--rui-bento-row-sm, var(--rui-bento-row-base, minmax(110px, auto)));
  }
${rowAtRules("sm")}
}
${up("md")} {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-md, var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1))), minmax(var(--rui-grid-min-child, 0), 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-md, var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m))));
  }
${responsiveAxisGapRules(2)}
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
  .rui-bento[data-responsive-row] {
    grid-auto-rows: var(--rui-bento-row-md, var(--rui-bento-row-sm, var(--rui-bento-row-base, minmax(110px, auto))));
  }
${rowAtRules("md")}
}
${up("lg")} {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-lg, var(--rui-grid-cols-md, var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1)))), minmax(var(--rui-grid-min-child, 0), 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-lg, var(--rui-grid-gap-md, var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m)))));
  }
${responsiveAxisGapRules(3)}
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
  .rui-bento[data-responsive-row] {
    grid-auto-rows: var(--rui-bento-row-lg, var(--rui-bento-row-md, var(--rui-bento-row-sm, var(--rui-bento-row-base, minmax(110px, auto)))));
  }
${rowAtRules("lg")}
}
${up("xl")} {
  .rui-grid[data-responsive-cols] {
    grid-template-columns: repeat(var(--rui-grid-cols-xl, var(--rui-grid-cols-lg, var(--rui-grid-cols-md, var(--rui-grid-cols-sm, var(--rui-grid-cols-base, 1))))), minmax(var(--rui-grid-min-child, 0), 1fr));
  }
  .rui-grid[data-responsive-gap] {
    gap: var(--rui-grid-gap-xl, var(--rui-grid-gap-lg, var(--rui-grid-gap-md, var(--rui-grid-gap-sm, var(--rui-grid-gap-base, var(--rui-spacing-m))))));
  }
${responsiveAxisGapRules(4)}
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
  .rui-bento[data-responsive-row] {
    grid-auto-rows: var(--rui-bento-row-xl, var(--rui-bento-row-lg, var(--rui-bento-row-md, var(--rui-bento-row-sm, var(--rui-bento-row-base, minmax(110px, auto))))));
  }
${rowAtRules("xl")}
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
${spacingAttrRules(".rui-grid", "data-row-gap", (v) => `row-gap: ${v};`)}
${spacingAttrRules(".rui-grid", "data-column-gap", (v) => `column-gap: ${v};`)}
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
/* Longhand pair, not the grid-column shorthand: the shorthand resets
   grid-column-start to auto and these rules come later than
   .rui-grid-item[data-offset] at identical specificity, so offset + spanAt
   silently cancelled each other and the item sat flush left at every
   breakpoint. Both attributes are emitted together whenever both props are set. */
.rui-grid-item[data-responsive-span] {
  grid-column-start: calc(var(--rui-grid-item-offset, 0) + 1);
  grid-column-end: span var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1));
}
${up("sm")} {
  .rui-grid-item[data-responsive-span] {
    grid-column-start: calc(var(--rui-grid-item-offset, 0) + 1);
    grid-column-end: span var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1)));
  }
}
${up("md")} {
  .rui-grid-item[data-responsive-span] {
    grid-column-start: calc(var(--rui-grid-item-offset, 0) + 1);
    grid-column-end: span var(--rui-grid-item-span-md, var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1))));
  }
}
${up("lg")} {
  .rui-grid-item[data-responsive-span] {
    grid-column-start: calc(var(--rui-grid-item-offset, 0) + 1);
    grid-column-end: span var(--rui-grid-item-span-lg, var(--rui-grid-item-span-md, var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1)))));
  }
}
${up("xl")} {
  .rui-grid-item[data-responsive-span] {
    grid-column-start: calc(var(--rui-grid-item-offset, 0) + 1);
    grid-column-end: span var(--rui-grid-item-span-xl, var(--rui-grid-item-span-lg, var(--rui-grid-item-span-md, var(--rui-grid-item-span-sm, var(--rui-grid-item-span-base, var(--rui-grid-item-span, 1))))));
  }
}

/* ----- Mobile collapse: fixed-column grids stack on phones -----
   Plain numeric Grid(columns: N) sets data-columns and previously never
   collapsed on small screens, leaving 3-12 cramped columns at phone widths.
   Below the sm (640px) breakpoint: collapse fixed grids of 3+ columns to 2,
   and stack 12-column layout grids (non-responsive GridItems go full-width).
   Untouched: data-responsive-cols / data-responsive-span (author opted into a
   breakpoint map) and data-min-child-width grids (already auto-wrap via minmax). */
${below("sm")} {
  .rui-grid[data-columns]:not([data-columns="1"]):not([data-columns="2"]):not([data-grid-mode="12"]):not([data-min-child-width]) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .rui-grid[data-grid-mode="12"] > *:not(.rui-grid-item[data-responsive-span]) {
    grid-column: 1 / -1;
  }
}

/* ----- Tablet (640-767px): intermediate grid columns -----
   Smooth the jump from the phone cap (2 cols) to the full count: fixed grids
   of 4+ columns render 3-up at tablet widths. columns 2-3 already fit, and
   responsive-cols / min-child / 12-col modes manage themselves. */
${up("sm")} and ${belowCond("md")} {
  .rui-grid[data-columns]:not([data-columns="1"]):not([data-columns="2"]):not([data-columns="3"]):not([data-grid-mode="12"]):not([data-min-child-width]) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* Box — spacing / surface wrapper */
.rui-box { box-sizing: border-box; }
${spacingAttrRules(".rui-box", "data-padding", (v) => `padding: ${v};`)}
${spacingAttrRules(".rui-box", "data-margin", (v) => `margin: ${v};`)}
.rui-box[data-border="subtle"] { border: var(--rui-border-width) solid color-mix(in srgb, var(--rui-color-border) 60%, transparent); border-radius: var(--rui-radius-md); }
.rui-box[data-border="default"] { border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); }
.rui-box[data-background="surface"] { background: var(--rui-color-surface); }
.rui-box[data-background="muted"] { background: var(--rui-color-surface-muted); }
.rui-box[data-background="primary"] { background: color-mix(in srgb, var(--rui-color-primary) 10%, var(--rui-color-surface)); }
.rui-box[data-background="success"] { background: color-mix(in srgb, var(--rui-color-success) 10%, var(--rui-color-surface)); }
.rui-box[data-background="warning"] { background: color-mix(in srgb, var(--rui-color-warning) 12%, var(--rui-color-surface)); }
.rui-box[data-background="danger"] { background: color-mix(in srgb, var(--rui-color-danger) 10%, var(--rui-color-surface)); }
.rui-box[data-background="info"] { background: color-mix(in srgb, var(--rui-color-info) 10%, var(--rui-color-surface)); }
.rui-box[data-responsive-padding] { padding: var(--rui-box-padding-base, 0); }
.rui-box[data-responsive-margin] { margin: var(--rui-box-margin-base, 0); }
${up("sm")} {
  .rui-box[data-responsive-padding] { padding: var(--rui-box-padding-sm, var(--rui-box-padding-base, 0)); }
  .rui-box[data-responsive-margin] { margin: var(--rui-box-margin-sm, var(--rui-box-margin-base, 0)); }
}
${up("md")} {
  .rui-box[data-responsive-padding] { padding: var(--rui-box-padding-md, var(--rui-box-padding-sm, var(--rui-box-padding-base, 0))); }
  .rui-box[data-responsive-margin] { margin: var(--rui-box-margin-md, var(--rui-box-margin-sm, var(--rui-box-margin-base, 0))); }
}
${up("lg")} {
  .rui-box[data-responsive-padding] { padding: var(--rui-box-padding-lg, var(--rui-box-padding-md, var(--rui-box-padding-sm, var(--rui-box-padding-base, 0)))); }
  .rui-box[data-responsive-margin] { margin: var(--rui-box-margin-lg, var(--rui-box-margin-md, var(--rui-box-margin-sm, var(--rui-box-margin-base, 0)))); }
}
${up("xl")} {
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
/* Every child is sized 100%x100% inside an overflow: hidden box, so a second
   child — a Badge over an Image — was stretched to the full box, pushed below the
   image and clipped away. The container is already position: relative; the render
   marks the multi-child case with data-overlay. */
.rui-aspect-ratio[data-overlay="true"] > *:not(:first-child) {
  position: absolute;
  top: var(--rui-spacing-s);
  left: var(--rui-spacing-s);
  width: auto;
  height: auto;
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
.rui-avatar[data-size="xs"] { width: 18px; height: 18px; font-size: 8px; max-width: 18px; max-height: 18px; }
.rui-avatar[data-size="sm"] { width: 24px; height: 24px; font-size: var(--rui-font-size-10); max-width: 24px; max-height: 24px; }
.rui-avatar[data-size="md"] { width: 36px; height: 36px; font-size: var(--rui-font-size-13); max-width: 36px; max-height: 36px; }
.rui-avatar[data-size="lg"] { width: 52px; height: 52px; font-size: var(--rui-font-size-18); max-width: 52px; max-height: 52px; }
.rui-avatar[data-size="xl"] { width: 72px; height: 72px; font-size: var(--rui-font-size-title); max-width: 72px; max-height: 72px; }
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
/* Shape as well as colour (WCAG 1.4.1) — the same four cues .rui-person-chip-status
   uses, so the two presence indicators stay one visual language: round vs square
   crossed with filled vs hollow. Without a shape, busy and online differ only in
   red vs green, exactly the pair red-green colour blindness collapses. Only the
   radius and the fill vary — this dot is sized in % of the avatar and wears a 2px
   ring, so shrinking it into a bar would leave no room inside the ring to paint. */
.rui-avatar-status[data-status="online"] { background: var(--rui-color-success); }
.rui-avatar-status[data-status="busy"] { background: var(--rui-color-danger); border-radius: 2px; }
.rui-avatar-status[data-status="away"] { background: transparent; border: 2px solid var(--rui-color-warning); }
.rui-avatar-status[data-status="offline"] { background: transparent; border: 2px solid var(--rui-color-text-muted); border-radius: 2px; }

/* AvatarGroup — overlapping pile with ring border. */
.rui-avatar-group {
  display: inline-flex;
  align-items: center;
}
.rui-avatar-group > .rui-avatar {
  border: 2px solid var(--rui-color-surface);
  margin-left: -8px;
}
/* Overlap tracks avatar diameter — the generic -8px hides 44% of an 18px xs
   avatar and is barely visible on a 72px xl one. These keep the ~22% ratio. */
.rui-avatar-group[data-size="xs"] > .rui-avatar { margin-left: -4px; }
.rui-avatar-group[data-size="sm"] > .rui-avatar { margin-left: -6px; }
.rui-avatar-group[data-size="lg"] > .rui-avatar { margin-left: -12px; }
.rui-avatar-group[data-size="xl"] > .rui-avatar { margin-left: -16px; }
/* After the sized overlaps: same specificity, so it has to come last to keep
   the leading avatar flush with the group's left edge in every size. */
.rui-avatar-group > .rui-avatar:first-child { margin-left: 0; }
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
  font-size: var(--rui-font-size-sm);
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
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
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
  /* Was rgba(15, 23, 42, 0.18) — a light-theme ink shadow that is invisible on
     the dark theme's surfaces, so the thumb lost its lift entirely. */
  box-shadow: var(--rui-shadow-sm);
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
.rui-switch-label { font-weight: 500; font-size: var(--rui-font-size-base); }
.rui-switch-description { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }

/* Toggle (single + group) */
.rui-toggle {
  border: var(--rui-border-width) solid transparent;
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
.rui-toggle[data-size="sm"] { padding: 4px 8px; font-size: var(--rui-font-size-sm); }
.rui-toggle[data-size="lg"] { padding: 9px 16px; font-size: var(--rui-font-size-15); }
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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
/* The group's own reset out-specifies .rui-toggle[data-variant], so the variant
   has to be read off the group root or all three enum values render alike.
   No rule for "outline": that is the render default and must not change. */
.rui-toggle-group[data-variant="default"] .rui-toggle[data-state="on"] {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
}
.rui-toggle-group[data-variant="ghost"] {
  border-color: transparent;
  background: transparent;
  padding: 0;
  gap: 4px;
}
.rui-toggle-group[data-variant="ghost"] .rui-toggle[data-state="on"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
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
  font-size: var(--rui-font-size-sm);
  font-weight: 500;
  line-height: 1.3;
  /* nowrap and max-width cancel each other out — the cap sizes the box but
     forbids the break that would honour it, so long hints spilled outside the
     dark background. max-content keeps short hints on one line as before. */
  white-space: normal;
  overflow-wrap: anywhere;
  width: max-content;
  max-width: 240px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease, transform 140ms ease;
  z-index: var(--rui-z-tooltip);
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
.rui-tooltip[data-side="top"] .rui-tooltip-content:not([data-floating-side]) .rui-tooltip-arrow,
.rui-tooltip-content[data-floating-side="top"] .rui-tooltip-arrow {
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
.rui-tooltip[data-side="bottom"] .rui-tooltip-content:not([data-floating-side]) .rui-tooltip-arrow,
.rui-tooltip-content[data-floating-side="bottom"] .rui-tooltip-arrow {
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
.rui-tooltip[data-side="left"] .rui-tooltip-content:not([data-floating-side]) .rui-tooltip-arrow,
.rui-tooltip-content[data-floating-side="left"] .rui-tooltip-arrow {
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
.rui-tooltip[data-side="right"] .rui-tooltip-content:not([data-floating-side]) .rui-tooltip-arrow,
.rui-tooltip-content[data-floating-side="right"] .rui-tooltip-arrow {
  left: -4px;
  top: calc(50% - 4px);
}
.rui-tooltip-content {
  transform: translate(calc(var(--rui-tooltip-x) + var(--rui-tooltip-offset-x)), calc(var(--rui-tooltip-y) + var(--rui-tooltip-offset-y)));
}
/* Reveal is now owned by JS, not by pseudo-classes. The hint is positioned by
   library/floating.ts (which promotes it to the top layer so it is not clipped),
   and a CSS-only reveal could show a panel JS never positioned — an
   unpositioned absolute panel is the original clipping bug. The root carries
   data-open; the second selector covers the reparenting fallback used by engines
   without the Popover API, where the descendant selector no longer matches
   because the panel is no longer inside the root. */
.rui-tooltip[data-open="true"] .rui-tooltip-content,
.rui-tooltip-content[data-floating-side] {
  opacity: 1;
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  box-shadow: var(--rui-shadow-md);
  opacity: 0;
  pointer-events: none;
  /* visibility (not just opacity) keeps the closed card out of the tab order on
     engines that ignore inert; the delayed transition lets it fade out first. */
  visibility: hidden;
  transition: opacity 160ms ease, transform 160ms ease, visibility 0s linear 160ms;
  z-index: var(--rui-z-popover);
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
}
.rui-hover-card[data-side="bottom"] .rui-hover-card-content { top: calc(100% + 6px); left: 0; transform: translateY(-4px); }
.rui-hover-card[data-side="top"] .rui-hover-card-content { bottom: calc(100% + 6px); left: 0; transform: translateY(4px); }
.rui-hover-card[data-side="left"] .rui-hover-card-content { right: calc(100% + 6px); top: 0; transform: translateX(4px); }
.rui-hover-card[data-side="right"] .rui-hover-card-content { left: calc(100% + 6px); top: 0; transform: translateX(-4px); }
/* Same single-owner rule as the Tooltip above: JS drives data-open and does the
   positioning, so the hover/focus pseudo-classes are gone. */
.rui-hover-card[data-open="true"] .rui-hover-card-content,
.rui-hover-card-content[data-floating-side] {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
  transition-delay: 0s;
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-bottom-width: 2px;
  font-family: var(--rui-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--rui-font-size-11);
  font-weight: 600;
  color: var(--rui-color-text);
  line-height: 1.2;
  /* Derived from the theme's ink rather than a light-theme slate, which was
     invisible on dark. */
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--rui-color-text) 10%, transparent);
}
.rui-kbd-group[data-size="sm"] .rui-kbd { padding: 1px 4px; font-size: var(--rui-font-size-10); }
.rui-kbd-sep { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-10); }

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
  font-size: var(--rui-font-size-13);
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
/* A plain-string crumb with onItemClick renders as a <button>, and
   .rui-breadcrumb-link only sets colour and layout — the native chrome showed
   through and the crumb stopped looking like part of the trail. */
.rui-breadcrumb-button { appearance: none; background: none; border: none; padding: 0; font: inherit; cursor: pointer; }
.rui-breadcrumb-text { color: var(--rui-color-text-muted); display: inline-flex; align-items: center; gap: 4px; }
.rui-breadcrumb-current {
  color: var(--rui-color-text);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Pagination — the root rule lives with the summary/per-page block further down
   (search "Pagination summary"). There used to be two top-level .rui-pagination
   definitions ~5600 lines apart fighting over display and gap, and only the
   later one's values ever shipped; they are merged there, at the winning site. */
.rui-pagination-button {
  min-width: 32px;
  height: 32px;
  border-radius: var(--rui-radius-sm);
  border: var(--rui-border-width) solid transparent;
  background: transparent;
  color: var(--rui-color-text);
  font: inherit;
  font-weight: 500;
  font-size: var(--rui-font-size-13);
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

/* Sheet — side drawer overlay (also used by Drawer and BottomSheet).
   A closed sheet was hidden with opacity 0 plus pointer-events none alone.
   Neither removes an element from the tab order or the accessibility tree, so
   every control inside a *closed* drawer stayed keyboard-focusable and
   screen-reader-visible: Tab walked into an invisible drawer. visibility is
   animatable (it flips discretely at the end of the transition), so adding it
   keeps the fade-out intact while genuinely removing the subtree from both. */
.rui-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.40);
  display: flex;
  z-index: var(--rui-z-modal);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 200ms ease, visibility 200ms ease;
}
.rui-sheet-overlay[data-side="right"] { justify-content: flex-end; }
.rui-sheet-overlay[data-side="left"] { justify-content: flex-start; }
.rui-sheet-overlay[data-side="top"],
.rui-sheet-overlay[data-side="bottom"] { flex-direction: column; }
.rui-sheet-overlay[data-side="bottom"] { justify-content: flex-end; }
.rui-sheet-overlay[data-open="true"] {
  opacity: 1;
  visibility: visible;
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
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-sheet-title { margin: 0; font-size: var(--rui-font-size-lg); font-weight: 600; }
.rui-sheet-close {
  background: transparent;
  border: none;
  font-size: var(--rui-font-size-title);
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
/* Drawer emits rui-drawer-* alongside rui-sheet-* so the newer Sheet
   redefinitions further down the sheet cannot steal its chrome (audit D0955). */
.rui-drawer-title { margin: 0; font-size: var(--rui-font-size-lg); font-weight: 600; }
.rui-drawer-close { font-size: var(--rui-font-size-title); line-height: 1; width: auto; height: auto; padding: 4px 8px; }
.rui-drawer-body { padding: var(--rui-spacing-l); display: flex; flex-direction: column; gap: var(--rui-spacing-m); }
.rui-sheet-footer {
  display: flex;
  gap: var(--rui-spacing-s);
  justify-content: flex-end;
  padding: var(--rui-spacing-l);
  border-top: var(--rui-border-width) solid var(--rui-color-border);
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

/* ----- Shared surface tones ------------------------------------------------
   One resolution point for the SURFACE_TONES enum, consumed by the eight roots
   that declare it. A component rule reads --rui-tone-color (and the two tint
   percentages where it paints a wash) instead of naming a colour token per tone,
   so the enum and the stylesheet can no longer disagree about which tones exist.
   Both the reset and the per-tone blocks are keyed on the same [data-tone]
   attribute the specs already emit, so nothing has to change in the renders. */
${surfaceToneTokenRules()}

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
  border: var(--rui-border-width) solid var(--rui-color-border);
  /* No overflow: hidden. Author nodes render into the CTA/actions rows, and the
     clip amputated any absolutely-positioned one at the rounded bottom edge. The
     radial-gradient background is painted by this element, so border-radius
     already clips it, and .rui-hero-media img carries its own radius. */
}
.rui-hero[data-has-image="true"] { grid-template-columns: 1.2fr 1fr; }
/* One rule for every tone but "primary", which is the base's own primary+info
   sweep (and the render's default), and "default". "info" used to be the gap. */
${tonedScope(".rui-hero", true)} { background:
    radial-gradient(60% 60% at 0% 0%, color-mix(in srgb, var(--rui-tone-color) var(--rui-tone-surface-mix), transparent), transparent 60%),
    var(--rui-color-surface); }
.rui-hero-body {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  align-items: flex-start;
  min-width: 0;
}
/* align was declared, read and emitted with no selector behind it, so
   align: "center" did nothing at all — the body hardcodes flex-start. */
.rui-hero[data-align="center"] { justify-items: center; text-align: center; }
.rui-hero[data-align="center"] .rui-hero-body { align-items: center; }
.rui-hero[data-align="center"] .rui-hero-subtitle { margin-inline: auto; }
.rui-hero-eyebrow {
  font-size: var(--rui-font-size-11);
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
  font-size: var(--rui-font-size-sm);
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
}
.rui-page-header-crumb-sep { color: var(--rui-color-border); }
/* Crumbs are real anchors now — keep them flat instead of UA-underlined. */
.rui-page-header-crumb { color: var(--rui-color-text-muted); text-decoration: none; }
.rui-page-header-crumb:hover { text-decoration: underline; }
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
  font-size: var(--rui-font-size-base);
  max-width: 70ch;
}
.rui-page-header-actions { gap: var(--rui-spacing-s); flex-wrap: wrap; }

/* MetricGrid */
.rui-metric-grid {
  display: grid;
  gap: var(--rui-spacing-m);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
/* KPI tiles are the narrowest of the three pattern grids and Stats(layout=grid)
   also carries .rui-grid, so the ladder starts at the same 2-up the shared
   .rui-grid phone/tablet collapse enforces — the two must agree or the higher
   specificity of that :not() chain would win and contradict this ladder. */
${columnLadderRules(".rui-metric-grid", "--rui-metric-grid-cols", 6, [2, 3, 4, 5, 6])}

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
  border: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-empty-state-title { margin: 0; font-size: var(--rui-font-size-lg); font-weight: 600; }
.rui-empty-state-description {
  margin: 0;
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-base);
  color: var(--rui-color-text);
  flex-shrink: 0;
}
${tonedScope(".rui-timeline-item")} .rui-timeline-marker { border-color: var(--rui-tone-color); color: var(--rui-tone-color); }
.rui-timeline-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-top: 6px; }
.rui-timeline-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* A linked entry title is an anchor; inherit the row's colour and stay flat. */
.rui-timeline-title { font-weight: 600; color: inherit; text-decoration: none; }
a.rui-timeline-title:hover { text-decoration: underline; }
.rui-timeline-time {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  font-variant-numeric: tabular-nums;
}
.rui-timeline-description { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); }
/* The rich content slot had no rule, so its children stacked with no gap. */
.rui-timeline-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--rui-spacing-s);
  margin-top: 4px;
}
/* A row that is now role=button with tabindex=0 needs both affordances. */
.rui-timeline-item[data-interactive="true"] .rui-timeline-body {
  cursor: pointer;
  border-radius: var(--rui-radius-sm);
  transition: background 160ms ease;
}
.rui-timeline-item[data-interactive="true"] .rui-timeline-body:hover { background: var(--rui-color-surface-muted); }
.rui-timeline-item[data-interactive="true"] .rui-timeline-body:focus-visible {
  outline: 2px solid var(--rui-color-primary);
  outline-offset: 2px;
}

/* FeatureGrid */
.rui-feature-grid {
  display: grid;
  gap: var(--rui-spacing-l);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin: var(--rui-spacing-l) 0;
}
/* A 40px icon plus a title and description needs the full width on a phone. */
${columnLadderRules(".rui-feature-grid", "--rui-feature-grid-cols", 4, [1, 2, 3, 4, 4])}
.rui-feature-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  /* The tile renders as an <a> when it has an href, and text-decoration
     propagates down the box tree, so without these the heading, description and
     meta all came out underlined in link blue. */
  color: var(--rui-color-text);
  text-decoration: none;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
/* Gated on data-interactive: a display-only tile must not advertise a click. */
.rui-feature-item[data-interactive="true"] { cursor: pointer; }
.rui-feature-item[data-interactive="true"]:hover {
  transform: translateY(-2px);
  box-shadow: var(--rui-shadow-md);
  border-color: color-mix(in srgb, var(--rui-color-primary) 28%, var(--rui-color-border));
}
.rui-feature-item[data-interactive="true"]:focus-visible {
  outline: 2px solid var(--rui-color-primary);
  outline-offset: 2px;
}
.rui-feature-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--rui-radius-md);
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  font-size: var(--rui-font-size-title);
  margin-bottom: var(--rui-spacing-s);
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
}
/* 14% is the icon chip's own strength (a 40px swatch needs less tint than a
   full-width wash), so it stays a literal here rather than reading the shared
   surface mix. "primary" is included — it is FeatureItem's default tone, and this
   resolves to exactly the base .rui-feature-icon look. */
${tonedScope(".rui-feature-item")} .rui-feature-icon { background: color-mix(in srgb, var(--rui-tone-color) 14%, transparent); color: var(--rui-tone-color); }
.rui-feature-title { margin: 0; font-size: var(--rui-font-size-lg); font-weight: 600; }
.rui-feature-description { margin: 0; color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); line-height: 1.5; }

/* Testimonial */
.rui-testimonial {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-15);
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
.rui-testimonial-name { font-weight: 600; font-size: var(--rui-font-size-base); }
.rui-testimonial-role { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }

/* ProfileCard */
.rui-profile-card {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-profile-card-header { display: flex; align-items: center; gap: var(--rui-spacing-m); }
.rui-profile-card-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rui-profile-card-name { margin: 0; font-size: var(--rui-font-size-lg); font-weight: 600; }
.rui-profile-card-role { margin: 0; font-size: var(--rui-font-size-13); color: var(--rui-color-text-muted); }
.rui-profile-card-bio { margin: 0; color: var(--rui-color-text); font-size: var(--rui-font-size-13); line-height: 1.5; }
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
  border: var(--rui-border-width) solid var(--rui-color-border-subtle);
}
.rui-comment-header { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.rui-comment-author { font-weight: 600; font-size: var(--rui-font-size-13); }
.rui-comment-time { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
.rui-comment-content { font-size: var(--rui-font-size-base); color: var(--rui-color-text); line-height: 1.5; }
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
  border: var(--rui-border-width) solid color-mix(in srgb, var(--rui-color-primary) 28%, var(--rui-color-border));
  color: var(--rui-color-text);
  /* Rendered as an <a> when it links out; the UA underline would propagate to
     the title and message. */
  text-decoration: none;
}
/* "primary" is the render's default and is what the base rule above paints, so
   the shared rule covers the other four. info used to be the gap: an
   informational banner silently took the brand treatment. */
${tonedScope(".rui-banner", true)} {
  background: linear-gradient(135deg, color-mix(in srgb, var(--rui-tone-color) var(--rui-tone-surface-mix), var(--rui-color-surface)), var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-tone-color) var(--rui-tone-border-mix), var(--rui-color-border));
}
.rui-banner[data-tone="default"] {
  background: var(--rui-color-surface-muted);
  border-color: var(--rui-color-border);
}
.rui-banner-icon {
  font-size: var(--rui-font-size-title);
  flex-shrink: 0;
}
.rui-banner-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.rui-banner-title { font-size: var(--rui-font-size-base); }
.rui-banner-message { font-size: var(--rui-font-size-13); color: var(--rui-color-text-muted); }
.rui-banner-action { flex-shrink: 0; }
/* The dismissible Banner's close button had no CSS, so it rendered as a raw UA
   button on the gradient band. currentColor so it works on every tone. */
.rui-banner-dismiss {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--rui-radius-sm);
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}
.rui-banner-dismiss:hover { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
.rui-banner-dismiss:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.rui-banner-dismiss-icon { font-size: var(--rui-font-size-sm); }

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
  border: var(--rui-border-width) solid var(--rui-color-border);
  min-width: 0;
}
.rui-kanban-column-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rui-kanban-column-title { font-weight: 600; font-size: var(--rui-font-size-13); text-transform: uppercase; letter-spacing: 0.04em; color: var(--rui-color-text); }
.rui-kanban-column-count {
  font-size: var(--rui-font-size-sm);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  color: var(--rui-color-text-muted);
}
/* "info" was the tone this component used to be missing while
   .rui-kanban-card[data-tone="info"] had it — the enum validated, the attribute
   was set, and the title stayed in the default colour. */
${tonedScope(".rui-kanban-column")} .rui-kanban-column-title { color: var(--rui-tone-color); }
/* Header actions row + the WIP-limit overflow flag — new markup with no styling,
   so the actions sat flush after the count and an over-limit column looked
   exactly like one inside its limit. */
.rui-kanban-column-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.rui-kanban-column-count[data-over-limit="true"] {
  color: var(--rui-color-danger-text);
  background: color-mix(in srgb, var(--rui-color-danger) 14%, transparent);
  font-weight: 600;
}
.rui-kanban-column[data-over-limit="true"] { border-color: color-mix(in srgb, var(--rui-color-danger) 30%, var(--rui-color-border)); }
.rui-kanban-column-body { display: flex; flex-direction: column; gap: var(--rui-spacing-s); }
.rui-kanban-column-empty {
  text-align: center;
  padding: var(--rui-spacing-m);
  font-size: var(--rui-font-size-sm);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  box-shadow: var(--rui-shadow-sm);
}
.rui-kanban-card[role="button"] {
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 160ms ease;
}
.rui-kanban-card[role="button"]:hover { transform: translateY(-1px); box-shadow: var(--rui-shadow-md); }
.rui-kanban-card-title { font-weight: 600; font-size: var(--rui-font-size-base); display: flex; align-items: center; gap: 6px; }
.rui-kanban-card-icon { font-size: var(--rui-font-size-base); }
.rui-kanban-card-description { margin: 0; color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); line-height: 1.4; }
.rui-kanban-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.rui-kanban-card-footer { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.rui-kanban-card-assignee { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
${tonedScope(".rui-kanban-card")} { border-left: 3px solid var(--rui-tone-color); }

/* SectionHeader */
.rui-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rui-spacing-m);
  flex-wrap: wrap;
  padding-bottom: var(--rui-spacing-s);
  border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle);
  margin-bottom: var(--rui-spacing-s);
}
.rui-section-header-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; }
.rui-section-header-eyebrow {
  font-size: var(--rui-font-size-11);
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
  font-size: var(--rui-font-size-13);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-toolbar-side {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  flex-wrap: wrap;
  min-width: 0;
}
.rui-toolbar-left { flex: 1 1 auto; }
/*
 * An auto left margin, not just justify-content: space-between on the parent.
 * The bar wraps (it has to — filters plus actions do not fit a narrow viewport),
 * and justify-content resolves PER FLEX LINE: once the right slot wraps onto a
 * line of its own it is the only item there, so space-between leaves it at
 * flex-start and the "right" slot renders hard left. An auto margin absorbs the
 * free space on whatever line the slot ends up on, so it sits right in both
 * layouts. Skipped when a center slot is present — there the auto margin would
 * eat the space that centres it.
 *
 * NO BACKTICKS IN HERE: this whole sheet is one JS template literal, so a
 * backtick in a CSS comment closes it and the rest of the file parses as code.
 */
.rui-toolbar-right { flex-shrink: 0; }
.rui-toolbar[data-has-center="false"] .rui-toolbar-right { margin-left: auto; }
.rui-toolbar .rui-form-control { gap: 4px; }
.rui-toolbar .rui-form-label { font-size: var(--rui-font-size-11); text-transform: uppercase; letter-spacing: 0.04em; color: var(--rui-color-text-muted); }
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  align-self: stretch;
}
/* Full-height rail (default): inside an AppShell, pin the sidebar to the
   viewport so the main content scrolls beneath it. top + height track the app
   margin so the rail stays inside the same inset as the rest of the shell
   (margin:0 -> full bleed). Sticky (not fixed) keeps it in normal flow +
   RTL-safe, and the stretched AppShell sidebar column gives it room to stick.
   Scoped to AppShell because "full height / fixed beneath scrolling content"
   is only meaningful there — a standalone Sidebar keeps its natural height. */
.rui-app-shell .rui-sidebar[data-full-height="true"] {
  position: sticky;
  top: var(--rui-app-margin, 20px);
  height: calc(100vh - var(--rui-app-margin, 20px) * 2);
  max-height: calc(100vh - var(--rui-app-margin, 20px) * 2);
}
/* Scroll the nav body, not the rail: with overflow on the rail itself the rail
   clipped its own header and footer, and max-height guarantees there is no room
   below — so the documented footer block (avatar, upgrade CTA) was cut off.
   .rui-sidebar-body already has flex: 1 + min-height: 0, so it is ready to be
   the scroll container. */
.rui-app-shell .rui-sidebar[data-full-height="true"] .rui-sidebar-body { overflow-y: auto; }
.rui-sidebar-header { display: flex; flex-direction: column; gap: 2px; padding-bottom: var(--rui-spacing-s); border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle); }
.rui-sidebar-brand { font-size: var(--rui-font-size-base); font-weight: 700; letter-spacing: -0.01em; color: var(--rui-color-text); }
.rui-sidebar-tagline { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
.rui-sidebar-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-height: 0; }
.rui-sidebar-section { display: flex; flex-direction: column; gap: 2px; margin-top: var(--rui-spacing-s); }
.rui-sidebar-section:first-child { margin-top: 0; }
.rui-sidebar-section-label {
  font-size: var(--rui-font-size-10);
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
  border: var(--rui-border-width) solid transparent;
  color: var(--rui-color-text);
  font-size: var(--rui-font-size-13);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  width: 100%;
}
a.rui-sidebar-item { text-decoration: none; }
.rui-sidebar-item:hover {
  background: var(--rui-color-surface);
  color: var(--rui-color-primary);
}
.rui-sidebar-item[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
  border-color: color-mix(in srgb, var(--rui-color-primary) 32%, transparent);
}
.rui-sidebar-item-icon { font-size: var(--rui-font-size-base); width: 18px; text-align: center; }
.rui-sidebar-item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rui-sidebar-item-badge {
  font-size: var(--rui-font-size-11);
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  border-top: var(--rui-border-width) solid var(--rui-color-border-subtle);
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
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
}
/* Topbar content (a Row / TopBar / actions block) grows to fill the bar so
   the mobile hamburger can sit beside it without pushing it onto its own
   line. min-width:0 lets long content shrink instead of overflowing. */
.rui-app-shell-topbar > *:not(.rui-app-shell-toggle) {
  flex: 1 1 auto;
  min-width: 0;
}
.rui-app-shell-toggle { flex: 0 0 auto; }
/* Collapsible AppShell with no topbar content: the bar only exists to host the
   mobile hamburger, so hide it on wide screens (no burger there, no content).
   The phone media query reveals it where the sidebar collapses to a drawer. */
.rui-app-shell-topbar[data-burger-only="true"] { display: none; }
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
  font-size: var(--rui-font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--rui-color-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.rui-description-icon { font-size: var(--rui-font-size-13); }
.rui-description-value {
  margin: 0;
  font-size: var(--rui-font-size-base);
  color: var(--rui-color-text);
  font-weight: 500;
  word-break: break-word;
}

/* StatusDot */
.rui-status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
}
/* The pulse keyframes below paint their halo with currentColor, so every tone has
   to set color as well as background — otherwise a danger dot pulsed a GREY halo
   inherited from .rui-status-dot, and the animated box-shadow overrode the tone's
   static coloured one. The base marker states its muted colour for the same
   reason: so an untoned dot pulses grey deliberately. */
.rui-status-dot-marker {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--rui-color-text-muted);
  color: var(--rui-color-text-muted);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-text-muted) 18%, transparent);
}
.rui-status-dot[data-tone="primary"] .rui-status-dot-marker { background: var(--rui-color-primary); color: var(--rui-color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-primary) 20%, transparent); }
.rui-status-dot[data-tone="success"] .rui-status-dot-marker { background: var(--rui-color-success); color: var(--rui-color-success); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-success) 22%, transparent); }
.rui-status-dot[data-tone="warning"] .rui-status-dot-marker { background: var(--rui-color-warning); color: var(--rui-color-warning); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-warning) 22%, transparent); }
.rui-status-dot[data-tone="danger"] .rui-status-dot-marker { background: var(--rui-color-danger); color: var(--rui-color-danger); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-danger) 22%, transparent); }
.rui-status-dot[data-tone="info"] .rui-status-dot-marker { background: var(--rui-color-info); color: var(--rui-color-info); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-info) 22%, transparent); }
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
  margin: var(--rui-spacing-l) 0;
}
/* A tier card carries a price, a feature list and a CTA button — four of them
   side by side on a 375px phone overflowed every one of those. */
${columnLadderRules(".rui-pricing-table", "--rui-pricing-table-cols", 4, [1, 2, 3, 4, 4])}

.rui-pricing-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-l);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-11);
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
  font-size: var(--rui-font-size-base);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
}
.rui-pricing-card-description { margin: 0; font-size: var(--rui-font-size-13); color: var(--rui-color-text-muted); line-height: 1.5; }
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
.rui-pricing-card-period { font-size: var(--rui-font-size-13); color: var(--rui-color-text-muted); }
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
  font-size: var(--rui-font-size-13);
  color: var(--rui-color-text);
}
/* An excluded feature swaps the glyph but was otherwise styled identically to an
   included one, so at a glance it still read as included. */
.rui-pricing-card-feature[data-included="false"] { color: var(--rui-color-text-muted); }
.rui-pricing-card-feature[data-included="false"] .rui-pricing-card-check {
  color: var(--rui-color-text-muted);
  /* The disc is a success-tinted green; leaving it would put a grey cross inside
     a green badge. */
  background: color-mix(in srgb, var(--rui-color-text-muted) 16%, transparent);
  opacity: 0.7;
}
.rui-pricing-card-check {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-success) 18%, transparent);
  color: var(--rui-color-success-text);
  font-size: var(--rui-font-size-15);
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
  /* The centring guarantee belongs to the class, not only to the inline style the
     component emits — the max-width rules below are useless without it. */
  margin-inline: auto;
}
.rui-container[data-size="sm"]  { max-width: 640px; }
.rui-container[data-size="md"]  { max-width: 820px; }
.rui-container[data-size="lg"]  { max-width: 1040px; }
.rui-container[data-size="xl"]  { max-width: 1280px; }
.rui-container[data-size="full"] { max-width: 100%; }
${spacingAttrRules(".rui-container", "data-padding", (v) => `padding-left: ${v}; padding-right: ${v};`)}

/* Spacer */
.rui-spacer { display: block; }
.rui-spacer[data-flex="true"] { flex: 1 1 auto; }
${spacingAttrRules(".rui-spacer", "data-size", (v) => `min-width: ${v}; min-height: ${v};`)}

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
/* Same inert-prop fix as the Hero above: .rui-cover hardcodes align-items:
   flex-end, so nothing read data-align. */
.rui-cover[data-align="center"] { align-items: center; justify-content: center; text-align: center; }
.rui-cover[data-align="center"] .rui-cover-body { align-items: center; }
.rui-cover[data-align="center"] .rui-cover-eyebrow { align-self: center; }
/* Highlights reuse the light-theme .rui-hero-highlight pill, which is close to
   invisible on the dark cover scrim — the render adds this class to override it. */
.rui-cover-highlights { display: flex; flex-wrap: wrap; gap: 8px; }
.rui-cover-highlight {
  font-size: var(--rui-font-size-sm);
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  border: var(--rui-border-width) solid rgba(255, 255, 255, 0.24);
  color: #ffffff;
  backdrop-filter: blur(2px);
}
.rui-cover-eyebrow {
  display: inline-flex;
  align-self: flex-start;
  font-size: var(--rui-font-size-11);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  border: var(--rui-border-width) solid rgba(255, 255, 255, 0.24);
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
  font-size: var(--rui-font-size-15);
  color: rgba(255, 255, 255, 0.92);
  max-width: 640px;
  line-height: 1.55;
}
.rui-cover-caption {
  margin: 0;
  font-size: var(--rui-font-size-13);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  /* The card is an <a> when it links out, and text-decoration propagates to
     every descendant — the title, description, tags and meta were all
     underlined and in link blue. */
  color: var(--rui-color-text);
  text-decoration: none;
  /* No overflow: hidden — the classic overflow menu in the actions row was cut
     off at the card's bottom edge. The media band clips itself below. */
  transition: box-shadow 200ms ease, border-color 200ms ease;
}
/* Gated on data-interactive so a plain gallery card does not lift and glow and
   then do nothing on click. No transform: the hover lift made the card a
   containing block and re-anchored any fixed child by 2px on pointer-enter. */
.rui-media-card[data-interactive="true"] { cursor: pointer; }
.rui-media-card[data-interactive="true"]:hover {
  box-shadow: var(--rui-shadow-md);
  border-color: color-mix(in srgb, var(--rui-color-primary) 20%, var(--rui-color-border));
}
.rui-media-card[data-interactive="true"]:focus-visible {
  outline: 2px solid var(--rui-color-primary);
  outline-offset: 2px;
}
.rui-media-card-media {
  position: relative;
  width: 100%;
  background: color-mix(in srgb, var(--rui-color-text) 6%, var(--rui-color-surface-muted));
  overflow: hidden;
  /* Own the rounded top corners now that the card itself no longer clips. */
  border-radius: calc(var(--rui-radius-md) - var(--rui-border-width)) calc(var(--rui-radius-md) - var(--rui-border-width)) 0 0;
}
.rui-media-card[data-orientation="horizontal"] .rui-media-card-media {
  border-radius: calc(var(--rui-radius-md) - var(--rui-border-width)) 0 0 calc(var(--rui-radius-md) - var(--rui-border-width));
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
  font-size: var(--rui-font-size-11);
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
  font-size: var(--rui-font-size-lg);
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
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  border-top: var(--rui-border-width) solid var(--rui-color-border-subtle);
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
  border-left: var(--rui-border-width) solid var(--rui-color-border-subtle);
}
.rui-stats-item:first-child { padding-left: 0; border-left: none; }
.rui-stats-label {
  font-size: var(--rui-font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  color: var(--rui-color-text-muted);
}
.rui-stats-value {
  font-size: var(--rui-font-size-title);
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--rui-color-text);
}
.rui-stats-hint {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
}
.rui-stats-item[data-tone="primary"] .rui-stats-value { color: var(--rui-color-primary); }
.rui-stats-item[data-tone="success"] .rui-stats-value { color: var(--rui-color-success-text); }
.rui-stats-item[data-tone="warning"] .rui-stats-value { color: var(--rui-color-warning-text); }
.rui-stats-item[data-tone="danger"]  .rui-stats-value { color: var(--rui-color-danger-text); }
.rui-stats-item[data-tone="info"]    .rui-stats-value { color: var(--rui-color-info-text); }

/* Tile */
.rui-tile {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  text-align: left;
  color: inherit;
  /* The tile is an <a> when it has an href; without this the label, description
     and everything under it inherit the UA underline. */
  text-decoration: none;
  font: inherit;
  cursor: default;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}
button.rui-tile, a.rui-tile { cursor: pointer; }
/* Element-scoped, matching the base rule's own cursor: default — the render
   emits a plain div when there is neither href nor onClick. */
button.rui-tile:hover,
a.rui-tile:hover {
  transform: translateY(-1px);
  box-shadow: var(--rui-shadow-sm);
  border-color: color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-border));
}
.rui-tile[data-selected="true"] {
  border-color: var(--rui-color-primary);
  background: color-mix(in srgb, var(--rui-color-primary) 8%, var(--rui-color-surface));
}
.rui-tile[data-selected="true"] .rui-tile-label { color: var(--rui-color-primary); font-weight: 600; }
.rui-tile-icon {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--rui-radius-md);
  background: color-mix(in srgb, var(--rui-color-primary) 12%, var(--rui-color-surface-muted));
  font-size: var(--rui-font-size-18);
  flex-shrink: 0;
}
.rui-tile-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rui-tile-label {
  font-size: var(--rui-font-size-13);
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-tile-value {
  font-size: var(--rui-font-size-18);
  font-weight: 700;
  color: var(--rui-color-text);
}
.rui-tile-description {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  line-height: 1.45;
}
/* Choice-card shape: the copy reads first and the mark sits opposite it, so the
   body takes the slack rather than the gap. */
.rui-tile[data-icon-position="end"] { justify-content: space-between; }
.rui-tile[data-icon-position="end"] .rui-tile-body { flex: 1 1 auto; }
${tonedScope(".rui-tile")} .rui-tile-icon { background: color-mix(in srgb, var(--rui-tone-color) 18%, transparent); color: var(--rui-tone-color); }

/* Notification */
.rui-notification {
  display: flex;
  gap: var(--rui-spacing-m);
  padding: var(--rui-spacing-m) var(--rui-spacing-l);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  position: relative;
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}
/* A clickable notification must look and focus like a control (audit D0917/D0918). */
.rui-notification[data-clickable="true"] { cursor: pointer; }
.rui-notification[data-clickable="true"]:hover { border-color: color-mix(in srgb, var(--rui-color-primary) 40%, var(--rui-color-border)); box-shadow: var(--rui-shadow-sm); }
.rui-notification[data-clickable="true"]:focus-visible { outline: 2px solid var(--rui-color-primary); outline-offset: 2px; }
/* The per-item dismiss button is new markup with no styling — it rendered as a
   default UA button inside the notification's flex row. */
.rui-notification-dismiss {
  flex-shrink: 0;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin-left: auto;
  border: none;
  border-radius: var(--rui-radius-sm);
  background: transparent;
  color: var(--rui-color-text-muted);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}
.rui-notification-dismiss:hover { background: var(--rui-color-surface-muted); color: var(--rui-color-text); }
.rui-notification-dismiss:focus-visible { outline: 2px solid var(--rui-color-primary); outline-offset: 2px; }
.rui-notification-dismiss-icon { font-size: var(--rui-font-size-sm); }
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
${tonedScope(".rui-notification")}[data-unread="true"] {
  background: color-mix(in srgb, var(--rui-tone-color) 6%, var(--rui-color-surface));
  border-color: color-mix(in srgb, var(--rui-tone-color) 28%, var(--rui-color-border));
  box-shadow: 0 1px 2px color-mix(in srgb, var(--rui-tone-color) 16%, transparent);
}
${tonedScope(".rui-notification")}[data-unread="true"]::before { background: var(--rui-tone-color); }
.rui-notification-visual { flex-shrink: 0; display: flex; }
.rui-notification-icon {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rui-color-primary) 12%, var(--rui-color-surface-muted));
  font-size: var(--rui-font-size-lg);
  flex-shrink: 0;
}
.rui-notification[data-unread="true"] .rui-notification-icon {
  background: color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-surface));
  color: var(--rui-color-primary);
}
${tonedScope(".rui-notification")} .rui-notification-icon { background: color-mix(in srgb, var(--rui-tone-color) 18%, transparent); color: var(--rui-tone-color); }
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
${tonedScope(".rui-notification")} .rui-notification-unread-dot {
  background: var(--rui-tone-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-tone-color) 25%, transparent);
}
.rui-notification-title {
  font-size: var(--rui-font-size-base);
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-notification[data-unread="true"] .rui-notification-title {
  font-weight: 700;
}
.rui-notification-time {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  flex-shrink: 0;
}
.rui-notification[data-unread="true"] .rui-notification-time {
  color: var(--rui-color-primary);
  font-weight: 600;
}
${tonedScope(".rui-notification")}[data-unread="true"] .rui-notification-time { color: var(--rui-tone-color); }
.rui-notification-message {
  margin: 0;
  font-size: var(--rui-font-size-13);
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
/* Shape as well as colour: on a 9px dot, red-green colour blindness makes busy
   and online indistinguishable, and shape survives without colour. Two axes give
   four unambiguous cues — round vs square, filled vs hollow:
     online  filled round    busy    filled square
     away    hollow round    offline hollow square
   busy used to be a 4px-tall bar, which under the global "* { box-sizing:
   border-box }" left ZERO content height inside the 2px ring — the whole marker
   painted in --rui-color-surface and the danger fill never showed. away and
   offline were both hollow rounds, i.e. still colour-only against each other. */
.rui-person-chip-status[data-status="online"]  { background: var(--rui-color-success); }
.rui-person-chip-status[data-status="busy"]    { background: var(--rui-color-danger); border-radius: 2px; }
.rui-person-chip-status[data-status="away"]    { background: transparent; border: 2px solid var(--rui-color-warning); }
.rui-person-chip-status[data-status="offline"] { background: transparent; border: 2px solid var(--rui-color-text-muted); border-radius: 2px; }
.rui-person-chip-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.rui-person-chip-name {
  font-size: var(--rui-font-size-13);
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
.rui-person-chip[data-size="sm"] .rui-person-chip-name { font-size: var(--rui-font-size-sm); }
.rui-person-chip[data-size="sm"] .rui-person-chip-role { font-size: var(--rui-font-size-11); }
.rui-person-chip[data-size="lg"] .rui-person-chip-name { font-size: var(--rui-font-size-base); }
.rui-person-chip[data-size="lg"] .rui-person-chip-role { font-size: var(--rui-font-size-sm); }

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
  font-size: var(--rui-font-size-15);
  line-height: 1.55;
  font-style: italic;
  color: var(--rui-color-text);
}
.rui-quote-text::before { content: "“"; margin-right: 2px; opacity: 0.55; }
.rui-quote-text::after  { content: "”"; margin-left: 2px; opacity: 0.55; }
.rui-quote-cite {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  font-style: normal;
}
.rui-quote[data-tone="success"] { border-left-color: color-mix(in srgb, var(--rui-color-success) 60%, transparent); background: color-mix(in srgb, var(--rui-color-success) 4%, var(--rui-color-surface)); }
.rui-quote[data-tone="warning"] { border-left-color: color-mix(in srgb, var(--rui-color-warning) 60%, transparent); background: color-mix(in srgb, var(--rui-color-warning) 4%, var(--rui-color-surface)); }
.rui-quote[data-tone="danger"]  { border-left-color: color-mix(in srgb, var(--rui-color-danger)  60%, transparent); background: color-mix(in srgb, var(--rui-color-danger)  4%, var(--rui-color-surface)); }
.rui-quote[data-tone="info"]    { border-left-color: color-mix(in srgb, var(--rui-color-info)    60%, transparent); background: color-mix(in srgb, var(--rui-color-info)    4%, var(--rui-color-surface)); }

/* There is no Note component either — the .rui-note / -icon / -text family and
   its six tones sat here unreachable. Callout(variant) is the live equivalent
   and carries the same tone set. */

/* Rating */
/* No !important on display, unlike the icon wrappers further up: this is a
   component ROOT, and those sites exist to beat the inline-block display Font
   Awesome sets on elements that are co-classed fa-solid (renderIcon puts both
   class families on one node). A Rating root never carries an FA class, so the
   !important bought nothing and cost two features — an author !important
   outranks an inline style, so sx.display and the universal hidden prop were
   both dead here. */
.rui-rating {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rui-rating-stars { display: inline-flex; gap: 2px; }
.rui-rating-star {
  background: transparent;
  border: none;
  padding: 0;
  font-size: var(--rui-font-size-lg);
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
/* Route the filled colour through a custom property: the tone prop needs a hook,
   and the half-glyph gradient below cannot use currentColor because that rule
   has to set the text fill transparent for background-clip to show through. */
.rui-rating { --rui-rating-color: var(--rui-color-warning); }
.rui-rating[data-tone="primary"] { --rui-rating-color: var(--rui-color-primary); }
.rui-rating[data-tone="success"] { --rui-rating-color: var(--rui-color-success); }
.rui-rating[data-tone="warning"] { --rui-rating-color: var(--rui-color-warning); }
.rui-rating[data-tone="danger"]  { --rui-rating-color: var(--rui-color-danger); }
.rui-rating[data-tone="info"]    { --rui-rating-color: var(--rui-color-info); }
.rui-rating-star[data-fill="full"],
.rui-rating-star[data-fill="half"] { color: var(--rui-rating-color); }
.rui-rating[data-interactive="true"] .rui-rating-star { cursor: pointer; }
.rui-rating[data-size="sm"] .rui-rating-star { font-size: var(--rui-font-size-13); }
.rui-rating[data-size="lg"] .rui-rating-star { font-size: var(--rui-font-size-20); }
.rui-rating-label { font-size: var(--rui-font-size-13); color: var(--rui-color-text); font-weight: 600; }
.rui-rating-count { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }

/* ProgressRing */
/* Same as .rui-rating above: component root, no Font Awesome classes, so the
   !important only blocked sx.display and the hidden prop. */
.rui-progress-ring {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--rui-spacing-xs);
}
.rui-progress-ring-wrap {
  position: relative;
  display: inline-flex;
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
  font-size: var(--rui-font-size-lg);
  font-weight: 700;
  color: var(--rui-color-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.rui-progress-ring[data-size="sm"] .rui-progress-ring-value { font-size: var(--rui-font-size-13); }
.rui-progress-ring[data-size="lg"] .rui-progress-ring-value { font-size: var(--rui-font-size-20); }
.rui-progress-ring-icon { font-size: 1.6em; }
.rui-progress-ring[data-tone="primary"] .rui-progress-ring-icon { color: var(--rui-color-primary); }
.rui-progress-ring[data-tone="success"] .rui-progress-ring-icon { color: var(--rui-color-success); }
.rui-progress-ring[data-tone="warning"] .rui-progress-ring-icon { color: var(--rui-color-warning); }
.rui-progress-ring[data-tone="danger"]  .rui-progress-ring-icon { color: var(--rui-color-danger); }
.rui-progress-ring[data-tone="info"]    .rui-progress-ring-icon { color: var(--rui-color-info); }
.rui-progress-ring-caption {
  font-size: var(--rui-font-size-11);
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
.rui-chat-bubble-fallback { font-size: var(--rui-font-size-11); font-weight: 700; color: var(--rui-color-primary); }
.rui-chat-bubble-bubble {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px var(--rui-spacing-m);
  border-radius: 16px;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-sm);
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-chat-bubble-time {
  font-size: var(--rui-font-size-11);
  color: var(--rui-color-text-muted);
}
.rui-chat-bubble-body {
  margin: 0;
  font-size: 13.5px;
  color: var(--rui-color-text);
  line-height: 1.5;
  white-space: pre-wrap;
}
/* The content escape hatch drops arbitrary components into a bare div, so it
   needs its own rhythm. min-width: 0 is what lets a wide CodeBlock scroll inside
   the bubble instead of stretching it past max-width. */
.rui-chat-bubble-content {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-xs);
  min-width: 0;
}
.rui-chat-bubble-content > * { max-width: 100%; }
.rui-chat-bubble-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--rui-font-size-10);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
  align-self: flex-end;
}
.rui-chat-bubble-status[data-status="error"] { color: var(--rui-color-danger-text); }
.rui-chat-bubble-status[data-status="read"]  { color: var(--rui-color-success-text); }
/* Retry lives inside the status row, which is 10px uppercase letter-spaced — a
   UA-default button inherits none of that and reads as a stray control. */
.rui-chat-bubble-retry {
  border: var(--rui-border-width) solid var(--rui-color-danger);
  background: transparent;
  color: var(--rui-color-danger-text);
  border-radius: var(--rui-radius-sm);
  padding: 1px 6px;
  font: inherit;
  text-transform: none;
  letter-spacing: normal;
  cursor: pointer;
}
.rui-chat-bubble-retry:hover {
  background: color-mix(in srgb, var(--rui-color-danger) 12%, transparent);
}

/* SearchBar */
.rui-search-bar {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  padding: 6px 10px;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-base);
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
.rui-search-bar-clear {
  flex: none;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  font-size: var(--rui-font-size-lg);
  color: var(--rui-color-text-muted);
}
.rui-search-bar-clear:hover { color: var(--rui-color-text); }
.rui-search-bar-input::placeholder { color: var(--rui-color-text-muted); }
.rui-search-bar-input::-webkit-search-cancel-button { -webkit-appearance: none; }
.rui-search-bar-shortcut {
  display: inline-flex;
  align-items: center;
  font-family: var(--rui-font-family);
  font-size: var(--rui-font-size-11);
  color: var(--rui-color-text-muted);
  padding: 2px 6px;
  border: var(--rui-border-width) solid var(--rui-color-border);
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

${below("md")} {
  /* Compaction has to land on .rui-root, not :host. applyTheme() writes every
     theme token as an INLINE style on the host (theme/index.ts:709-715) and an
     inline declaration beats any stylesheet rule, so the :host version of this
     block never applied once — spacing stayed at desktop values on every phone.
     .rui-root is the shadow child that wraps all rendered content, so a rule here
     wins and still inherits into everything.

     The three -mobile properties are the opt-out: the host never sets them, so
     an author or theme can pin any step back to its desktop value. font-size is
     one of them for the same reason the literal 14px had to go — it is NOT a
     custom property, so it was the one declaration here that DID win, silently
     overriding whatever fontSizeBase the active theme (or a custom token map)
     had set. It now defaults to the theme's own base size. */
  .rui-root {
    font-size: var(--rui-font-size-base-mobile, var(--rui-font-size-base));
    --rui-spacing-l: var(--rui-spacing-l-mobile, 16px);
    --rui-spacing-xl: var(--rui-spacing-xl-mobile, 24px);
  }
  /* Set the variable, not padding, so CardSection's bleed follows. */
  .rui-card { --rui-card-pad: var(--rui-spacing-m); }
  .rui-stat-card { padding: var(--rui-spacing-m); min-width: 120px; }
  .rui-stat-value { font-size: var(--rui-font-size-20); }
  .rui-text[data-variant="title"] { font-size: var(--rui-font-size-24); }
  .rui-text[data-variant="large-heavy"] { font-size: var(--rui-font-size-18); }
  .rui-page-header-title { font-size: var(--rui-font-size-20); }
  .rui-callout { padding: var(--rui-spacing-s) var(--rui-spacing-m); }
  .rui-modal { padding: var(--rui-spacing-m); border-radius: var(--rui-radius-md); }
  .rui-modal-overlay { padding: var(--rui-spacing-s); }
  .rui-form-actions { justify-content: stretch; }
  .rui-form-actions .rui-button,
  .rui-form-actions .rui-buttons { flex: 1 1 auto; }
  .rui-buttons[data-direction="row"] .rui-button { flex: 1 1 auto; }

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
  /* showDetail: only one pane at a time on a phone, so tapping a list row does
     not leave the user scrolling past the whole list to reach the message.
     Emitted only when the author opts in, so the stacked default is preserved. */
  .rui-split-view[data-mobile-pane="detail"] .rui-split-view-primary { display: none; }
  .rui-split-view[data-mobile-pane="primary"] .rui-split-view-detail { display: none; }
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
    /* Stacked again on a phone, so the media band is back on top. */
    border-radius: calc(var(--rui-radius-md) - var(--rui-border-width)) calc(var(--rui-radius-md) - var(--rui-border-width)) 0 0;
  }
  .rui-stats { gap: var(--rui-spacing-m); }
  .rui-stats-item { padding: 0; border-left: none; padding-bottom: var(--rui-spacing-s); }
  .rui-notification { padding: var(--rui-spacing-s) var(--rui-spacing-m); }
  .rui-notification-head { flex-direction: column; align-items: flex-start; gap: 2px; }
  .rui-search-bar-shortcut { display: none; }
  .rui-chat-bubble-bubble { max-width: 86%; }
}

${below("xs")} {
  /* Same story as the 720px step: on :host this lost to applyTheme's inline
     font-size — except it was a plain property, so it won and hard-coded 13.5px
     over every theme's scale. Themeable, and off by default. */
  .rui-root { font-size: var(--rui-font-size-base-xs, var(--rui-font-size-base-mobile, var(--rui-font-size-base))); }
  .rui-card { --rui-card-pad: var(--rui-spacing-m); }
  /* :not([data-justify]) so an explicit footer alignment is not silently
     discarded on a phone. */
  .rui-card-footer:not([data-justify]) { justify-content: stretch; }
  .rui-card-footer .rui-button { flex: 1 1 auto; }
  .rui-tab-trigger { padding: var(--rui-spacing-xs) var(--rui-spacing-s); font-size: var(--rui-font-size-13); }
  .rui-stat-card { width: 100%; }
}

/* ========================================================================
   Theme-specific overrides.
   The host carries data-rui-theme so themes can change layout, fonts,
   shadows, and animations on top of their token map.
   ======================================================================== */

/* Soft — friendly, super-rounded everything, soft drop-shadows, cards
   subtly lift on hover, gentle pop animation when buttons are pressed. */
:host([data-rui-theme="soft"]) {
  background:
    radial-gradient(80vw 60vw at 100% 0%, rgba(167, 139, 250, 0.18), transparent 60%),
    radial-gradient(70vw 50vw at 0% 100%, rgba(94, 234, 212, 0.18), transparent 60%),
    var(--rui-color-bg);
}
:host([data-rui-theme="soft"][transparent]),
:host([data-rui-theme="soft"][transparent="true"]) {
  background: transparent;
}
:host([data-rui-theme="soft"]) .rui-card,
:host([data-rui-theme="soft"]) .rui-stat-card,
:host([data-rui-theme="soft"]) .rui-chart,
:host([data-rui-theme="soft"]) .rui-callout {
  border-color: var(--rui-color-border);
  transition: transform 220ms ease, box-shadow 220ms ease;
}
:host([data-rui-theme="soft"]) .rui-card:hover,
:host([data-rui-theme="soft"]) .rui-stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--rui-shadow-md);
}
/* Gradient titles, in three layers.
   1. A solid, readable colour is painted FIRST. The clip trick works by making
      the text fill transparent and letting a background show through it, so any
      environment that keeps the transparent fill but drops the background —
      forced colors, print, an engine without background-clip: text — rendered
      every soft-theme title invisible.
   2. The gradient itself moved off two literals onto --rui-gradient-brand (soft
      now defines its own; before this it was inlined, so $theme({ gradients:
      { brand } }) could not reach it) and its end stops were darkened: the old
      #f9a8d4 measured 1.81:1 on this theme's white surface, so the right-hand
      half of every title failed WCAG 1.4.3.
   3. forced-colors puts the fill back, because the OS replaces the gradient. */
:host([data-rui-theme="soft"]) .rui-card-title,
:host([data-rui-theme="soft"]) .rui-section-title,
:host([data-rui-theme="soft"]) .rui-page-header-title,
:host([data-rui-theme="soft"]) .rui-text[data-variant="title"],
:host([data-rui-theme="soft"]) .rui-text[data-variant="heading"] {
  font-weight: 700;
  color: var(--rui-color-text);
}
@supports ((background-clip: text) or (-webkit-background-clip: text)) {
  :host([data-rui-theme="soft"]) .rui-card-title,
  :host([data-rui-theme="soft"]) .rui-section-title,
  :host([data-rui-theme="soft"]) .rui-page-header-title,
  :host([data-rui-theme="soft"]) .rui-text[data-variant="title"],
  :host([data-rui-theme="soft"]) .rui-text[data-variant="heading"] {
    background: var(--rui-gradient-brand);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}
@media (forced-colors: active) {
  :host([data-rui-theme="soft"]) .rui-card-title,
  :host([data-rui-theme="soft"]) .rui-section-title,
  :host([data-rui-theme="soft"]) .rui-page-header-title,
  :host([data-rui-theme="soft"]) .rui-text[data-variant="title"],
  :host([data-rui-theme="soft"]) .rui-text[data-variant="heading"] {
    background: none;
    color: CanvasText;
    -webkit-text-fill-color: currentColor;
  }
}
:host([data-rui-theme="soft"]) .rui-button {
  background: linear-gradient(135deg, #a78bfa, #f9a8d4);
  border-radius: 999px;
  padding: 10px 18px;
  box-shadow: 0 6px 16px rgba(167, 139, 250, 0.28);
}
:host([data-rui-theme="soft"]) .rui-button:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 10px 22px rgba(167, 139, 250, 0.36);
}
:host([data-rui-theme="soft"]) .rui-button:active:not(:disabled) {
  transform: scale(0.98);
}
:host([data-rui-theme="soft"]) .rui-button[data-variant="secondary"] {
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  box-shadow: 0 2px 8px rgba(167, 139, 250, 0.12);
}
:host([data-rui-theme="soft"]) .rui-button[data-variant="ghost"] {
  background: transparent;
  border-color: var(--rui-color-border);
  color: var(--rui-color-text);
  box-shadow: none;
}
:host([data-rui-theme="soft"]) .rui-input,
:host([data-rui-theme="soft"]) .rui-select,
:host([data-rui-theme="soft"]) .rui-textarea {
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface);
}
:host([data-rui-theme="soft"]) .rui-tab-list { border-bottom-color: var(--rui-color-border); }
:host([data-rui-theme="soft"]) .rui-tab-trigger[aria-selected="true"] {
  background: rgba(167, 139, 250, 0.10);
  border-radius: var(--rui-radius-md) var(--rui-radius-md) 0 0;
}
:host([data-rui-theme="soft"]) .rui-badge[data-variant="primary"] {
  background: linear-gradient(135deg, #a78bfa, #f9a8d4);
}
:host([data-rui-theme="soft"]) .rui-follow-up-button {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.10), rgba(249, 168, 212, 0.10));
  border-color: var(--rui-color-border);
}
:host([data-rui-theme="soft"]) .rui-follow-up-button:hover {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.22), rgba(249, 168, 212, 0.22));
  transform: translateY(-1px);
}

/* Glass — light glassmorphism. Frosted *white* surfaces float over a soft,
   airy pastel wash (cool grey at the top melting into peach → pink → lavender
   → mint toward the bottom). Surfaces use real backdrop-filter blur so they
   pick up the colourful gradient behind them, edged with a bright 1px white
   rim-light and a feather-soft tinted shadow. Text stays dark for contrast. */
:host([data-rui-theme="glass"]) {
  background:
    radial-gradient(60vw 55vw at 8% 88%, rgba(245, 160, 120, 0.55), transparent 60%),
    radial-gradient(55vw 50vw at 55% 108%, rgba(244, 138, 166, 0.50), transparent 58%),
    radial-gradient(60vw 55vw at 100% 95%, rgba(181, 142, 230, 0.50), transparent 60%),
    radial-gradient(50vw 45vw at 100% 35%, rgba(142, 197, 232, 0.35), transparent 60%),
    radial-gradient(45vw 45vw at 0% 25%, rgba(159, 216, 198, 0.30), transparent 60%),
    linear-gradient(160deg, #eef0f3 0%, #e9e6ef 45%, #efe4ec 100%);
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
:host([data-rui-theme="glass"]) .rui-dropdown-menu-content,
:host([data-rui-theme="glass"]) .rui-popover-content,
:host([data-rui-theme="glass"]) .rui-hover-card-content,
:host([data-rui-theme="glass"]) .rui-combobox-panel,
:host([data-rui-theme="glass"]) .rui-multiselect-panel,
:host([data-rui-theme="glass"]) .rui-context-menu-pop,
:host([data-rui-theme="glass"]) .rui-mention-input-suggestions,
:host([data-rui-theme="glass"]) .rui-notification-bell-panel,
:host([data-rui-theme="glass"]) .rui-command-palette-panel,
:host([data-rui-theme="glass"]) .rui-sheet,
:host([data-rui-theme="glass"]) .rui-sheet-panel,
:host([data-rui-theme="glass"]) .rui-toast,
:host([data-rui-theme="glass"]) .rui-toast-standalone,
:host([data-rui-theme="glass"]) .rui-tour-card,
:host([data-rui-theme="glass"]) .rui-spotlight-card,
:host([data-rui-theme="glass"]) .rui-confirm-card,
:host([data-rui-theme="glass"]) .rui-drawer,
:host([data-rui-theme="glass"]) .rui-notification,
:host([data-rui-theme="glass"]) .rui-tile,
:host([data-rui-theme="glass"]) .rui-media-card,
:host([data-rui-theme="glass"]) .rui-pricing-card,
:host([data-rui-theme="glass"]) .rui-profile-card,
:host([data-rui-theme="glass"]) .rui-product-card,
:host([data-rui-theme="glass"]) .rui-kanban-card,
:host([data-rui-theme="glass"]) .rui-code-block {
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.40));
  backdrop-filter: blur(26px) saturate(150%);
  -webkit-backdrop-filter: blur(26px) saturate(150%);
  border: var(--rui-border-width) solid rgba(255, 255, 255, 0.75);
  box-shadow:
    0 14px 40px rgba(120, 110, 140, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.65);
}
:host([data-rui-theme="glass"]) .rui-card,
:host([data-rui-theme="glass"]) .rui-stat-card {
  transition: transform 240ms ease, box-shadow 240ms ease;
}
:host([data-rui-theme="glass"]) .rui-card:hover,
:host([data-rui-theme="glass"]) .rui-stat-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 22px 56px rgba(120, 110, 140, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
:host([data-rui-theme="glass"]) .rui-input,
:host([data-rui-theme="glass"]) .rui-select,
:host([data-rui-theme="glass"]) .rui-textarea {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(255, 255, 255, 0.75);
  color: var(--rui-color-text);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
:host([data-rui-theme="glass"]) .rui-input::placeholder,
:host([data-rui-theme="glass"]) .rui-textarea::placeholder { color: rgba(60, 50, 70, 0.45); }
:host([data-rui-theme="glass"]) .rui-input:focus,
:host([data-rui-theme="glass"]) .rui-select:focus,
:host([data-rui-theme="glass"]) .rui-textarea:focus {
  border-color: rgba(242, 130, 106, 0.75);
  box-shadow: 0 0 0 4px rgba(242, 130, 106, 0.18);
  background: rgba(255, 255, 255, 0.75);
}
:host([data-rui-theme="glass"]) .rui-button {
  background: linear-gradient(135deg, #f7a072, #f2826a);
  color: #ffffff;
  border: var(--rui-border-width) solid rgba(255, 255, 255, 0.45);
  box-shadow: 0 10px 24px rgba(242, 130, 106, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.45);
}
:host([data-rui-theme="glass"]) .rui-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 30px rgba(242, 130, 106, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.55);
}
:host([data-rui-theme="glass"]) .rui-button[data-variant="secondary"] {
  background: rgba(255, 255, 255, 0.62);
  color: var(--rui-color-text);
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
:host([data-rui-theme="glass"]) .rui-button[data-variant="ghost"] {
  background: transparent;
  color: var(--rui-color-text);
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: none;
}
:host([data-rui-theme="glass"]) .rui-card-title,
:host([data-rui-theme="glass"]) .rui-section-title,
:host([data-rui-theme="glass"]) .rui-page-header-title,
:host([data-rui-theme="glass"]) .rui-text[data-variant="title"],
:host([data-rui-theme="glass"]) .rui-text[data-variant="heading"] {
  color: var(--rui-color-text);
  letter-spacing: -0.01em;
}
:host([data-rui-theme="glass"]) .rui-tab-list { border-bottom-color: rgba(255, 255, 255, 0.6); }
:host([data-rui-theme="glass"]) .rui-tab-trigger { color: var(--rui-color-text-muted); }
:host([data-rui-theme="glass"]) .rui-tab-trigger:hover { color: var(--rui-color-text); }
:host([data-rui-theme="glass"]) .rui-tab-trigger[aria-selected="true"] {
  color: var(--rui-color-primary);
  border-bottom-color: var(--rui-color-primary);
}
:host([data-rui-theme="glass"]) .rui-table th {
  background: rgba(255, 255, 255, 0.45);
  border-bottom-color: rgba(255, 255, 255, 0.6);
}
:host([data-rui-theme="glass"]) .rui-table td { border-bottom-color: rgba(255, 255, 255, 0.5); }
:host([data-rui-theme="glass"]) .rui-follow-up-button {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(255, 255, 255, 0.75);
  color: var(--rui-color-text);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
:host([data-rui-theme="glass"]) .rui-follow-up-button:hover {
  background: rgba(255, 255, 255, 0.75);
  border-color: rgba(242, 130, 106, 0.5);
  box-shadow: 0 6px 18px rgba(242, 130, 106, 0.18);
}
:host([data-rui-theme="glass"]) .rui-skeleton-line {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.7) 50%, rgba(255, 255, 255, 0.3) 100%);
  background-size: 200% 100%;
}
:host([data-rui-theme="glass"]) .rui-separator { background: rgba(255, 255, 255, 0.6); }

/* ============================================================================
   Vision — a faithful re-creation of the UI block design framework.
   (Private theme: resolvable by name, deliberately absent from the public
   theme registry, the theme picker and the docs.)
   Flat white surfaces on a blue-grey canvas (no card borders/shadows), navy
   PILL buttons (2px border) that BRIGHTEN to blue on hover and never recolor
   when disabled (opacity only), transparent inputs with a crisp blue
   hover/focus outline, borderless tables with uppercase navy headers and
   hairline rows, solid semantic badges, soft-tinted status pills, messages
   with a neutral-4 border + 9px inset left bar (headline itself takes the
   semantic color), a full-bleed pale-tint interception banner, and dark-navy
   (not blue!) body/heading/nav text throughout — blue is reserved for
   interactive elements (links, tiles, focus rings) only.
   Verified against the real compiled UI block CSS and real UI block
   example markup (exhaustive ground-truth audit, 2026-07-27).
   Palette: corporate 1 #dbedf8 · 3 #3196d6 · 4 #1474c4 · 5 #095bb1 · 6 #003d8f
   · 7 #0b2a63 · 8 #001b41 · 9 #02102b | neutral 1 #f4f7fa · 2 #dbe2e8 ·
   3 #bcc8d4 · 4 #97a3b4 · 5 #718095 · 6 #465a75 · 7 #2e4360 | success 1 #c7fae2
   · 3 #12cf76 · 4 #0fa954 · 6 #096b35 | warning 1 #ffedca · 2 #ffd176 ·
   3 #ffaa00 · 6 #8e4e00 | critical 1 #ffe4e2 · 2 #ffa8a3 · 3 #ff6159 ·
   4 #f50c00 · 5 #c80a00 | activating(cyan) 1 #d2f6fc · 3 #11c7e6 · 4 #08a5c5
   | promoting 1 #fae7fe.
   ============================================================================ */
:host([data-rui-theme="vision"]) {
  background: var(--rui-color-bg);            /* neutral-1, flat — no gradient */
}
:host([data-rui-theme="vision"][transparent]),
:host([data-rui-theme="vision"][transparent="true"]) {
  background: transparent;
}

/* ---- Typography — headline atom is ALWAYS default-text-color (#001b41),
   never primary-text-color (#02102b, reserved for form labels & accordion
   headers only). Second-level tier (22px+: header/page-header/title/
   large-heavy) is Overpass; third-level tier (16px: section/card headings)
   is Open Sans Semibold — UI block switches FAMILY at the third-level boundary,
   not just weight. */
:host([data-rui-theme="vision"]) .rui-page-header-title,
:host([data-rui-theme="vision"]) .rui-text[data-variant="title"],
:host([data-rui-theme="vision"]) .rui-text[data-variant="large-heavy"],
:host([data-rui-theme="vision"]) .rui-text[data-variant="heading"],
:host([data-rui-theme="vision"]) .rui-heading {
  color: var(--rui-color-text);               /* corporate-8 #001b41 · --default-text-color */
  font-family: var(--rui-font-family-heading); /* Overpass Semibold · second-level-headline-family */
  font-weight: 600;
  letter-spacing: 0;
}
:host([data-rui-theme="vision"]) .rui-section-title,
:host([data-rui-theme="vision"]) .rui-section-header-title {
  color: var(--rui-color-text);
  font-family: var(--rui-font-family);        /* Open Sans Semibold · third-level-headline-family */
  font-weight: 600;
  letter-spacing: 0;
}

:host([data-rui-theme="vision"]) .rui-page-header-title-line .rui-badge{
  margin-bottom: 16px;
}

/* UI block's headline ladder has exactly three levels, and the FIRST is Overpass
   REGULAR (--first-level-headline-family resolves to --corporate-font-regular),
   not semibold — a detail that reads very differently at 32px:
     L1  32px / 42px  Overpass Regular   → page titles
     L2  22px / 30px  Overpass Semibold  → card + section headlines
     L3  16px / 24px  Open Sans Semibold → sub-headings
   Aktion's own ladder is mapped onto those three rungs here. */
:host([data-rui-theme="vision"]) .rui-page-header-title,
:host([data-rui-theme="vision"]) .rui-heading[data-size="section"] {
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-32);
  line-height: 42px;
  font-weight: 400;                            /* L1 is REGULAR weight */
  letter-spacing: 0;
  color: var(--rui-color-text);
  margin: 0 0 16px;
}
:host([data-rui-theme="vision"]) .rui-heading[data-size="lg"] {
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-title); line-height: 30px; font-weight: 600; letter-spacing: 0;
}
:host([data-rui-theme="vision"]) .rui-heading[data-size="md"],
:host([data-rui-theme="vision"]) .rui-heading[data-size="sm"] {
  font-family: var(--rui-font-family);         /* L3 drops to Open Sans Semibold */
  font-size: var(--rui-font-size-lg); line-height: 24px; font-weight: 600; letter-spacing: 0;
}
/* Card headline is UI block's SECOND-level headline: 22px Overpass / 30px —
   measured against the live framework (card.scss:578-583), not the
   third-level tier. Subheadline is third-level: 16px Open Sans SB / 24px.
   Neither is ever muted grey. */
:host([data-rui-theme="vision"]) .rui-card-title {
  color: #001b41;                              /* --default-text-color */
  font-family: var(--rui-font-family-heading); /* OverpassSemibold */
  font-size: var(--rui-font-size-title);
  line-height: 30px;
  font-weight: 600;
  margin-bottom: 12px;
}
:host([data-rui-theme="vision"]) .rui-card-subtitle {
  color: #001b41;
  font-family: var(--rui-font-family);         /* Open Sans Semibold tier */
  font-size: var(--rui-font-size-lg);
  line-height: 24px;
  font-weight: 600;
}
/* Card eyebrow (UI block "card__preheadline") — sits above the headline, plain
   14px/20px body text, never muted. */
:host([data-rui-theme="vision"]) .rui-card-eyebrow {
  color: #001b41;
  font-family: var(--rui-font-family);
  font-size: var(--rui-font-size-base);
  line-height: 20px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  margin-bottom: 3px;
}

/* ---- Flat surfaces — white, borderless, shadowless; separate by colour alone.
   UI block's --card-shadow/--card-border resolve to none/0 unconditionally, so
   "elevated"/"outlined" modifiers (which Aktion invents, UI block has neither)
   are neutralised rather than left to add fake depth. */
:host([data-rui-theme="vision"]) .rui-card,
:host([data-rui-theme="vision"]) .rui-stat-card,
:host([data-rui-theme="vision"]) .rui-metric,
:host([data-rui-theme="vision"]) .rui-tile,
:host([data-rui-theme="vision"]) .rui-table-wrapper,
:host([data-rui-theme="vision"]) .rui-chart {
  background: var(--rui-color-surface);
  border: none;
  box-shadow: none;
  border-radius: var(--rui-radius-lg);        /* 16px */
  transition: background var(--rui-transition-duration) ease-out, box-shadow 200ms ease-out;
}
:host([data-rui-theme="vision"]) .rui-card[data-variant="elevated"],
:host([data-rui-theme="vision"]) .rui-card[data-variant="outlined"] { box-shadow: none; border: none; }

/* UI block has no 500 rung at all -- its ladder is 400 (Regular file) and 600
   (SemiBold file). Aktion's base rules use 500 as a "medium" in several places,
   which renders as a weight UI block never produces. Pull those onto 400 where UI block
   uses body copy. Verified against the compiled CDN sheet: .pagination__list-item a
   and .tooltip__element both inherit the 400 default-font-regular. */
:host([data-rui-theme="vision"]) .rui-pagination-button,
:host([data-rui-theme="vision"]) .rui-pagination-current,
:host([data-rui-theme="vision"]) .rui-tooltip-content,
:host([data-rui-theme="vision"]) .rui-field-error,
:host([data-rui-theme="vision"]) .rui-data-grid-page-button { font-weight: 400; }

/* ---- Typography weight ladder — the systemic "reads bolder" cause ------
   UI block's reset puts h1-h6 at "font: inherit", so an UI block heading is weight 400 and
   takes its boldness entirely from a SemiBold font FILE. A grep of the whole
   compiled CDN sheet confirms UI block has NO component text above SemiBold: the only
   700s in the framework are outside component typography. Aktion, by contrast,
   let native headings fall through to the UA bold 700 and hard-coded 700 (and one
   800) on a dozen title roles -- roughly 21-30% more ink at the same size, which
   is what made every card, dialog and stripe read heavier than UI block.
   ------------------------------------------------------------------------- */
:host([data-rui-theme="vision"]) h1,
:host([data-rui-theme="vision"]) h2,
:host([data-rui-theme="vision"]) h3,
:host([data-rui-theme="vision"]) h4,
:host([data-rui-theme="vision"]) h5,
:host([data-rui-theme="vision"]) h6 { font-weight: inherit; }

/* UI block deliberately resets strong back to 400 and lets the SemiBold FILE carry the
   emphasis; with a weight-tagged family the equivalent is 600, not the UA's 700. */
:host([data-rui-theme="vision"]) strong,
:host([data-rui-theme="vision"]) b { font-weight: 600; }

/* Every remaining title role onto the SemiBold rung. */
:host([data-rui-theme="vision"]) .rui-form-section-label,
:host([data-rui-theme="vision"]) .rui-topbar-title,
:host([data-rui-theme="vision"]) .rui-media-card-title,
:host([data-rui-theme="vision"]) .rui-product-title,
:host([data-rui-theme="vision"]) .rui-onboarding-checklist-title,
:host([data-rui-theme="vision"]) .rui-loading-state-title,
:host([data-rui-theme="vision"]) .rui-tour-title,
:host([data-rui-theme="vision"]) .rui-spotlight-title,
:host([data-rui-theme="vision"]) .rui-confirm-title { font-weight: 600; }
:host([data-rui-theme="vision"]) .rui-confirm-title { font-size: var(--rui-font-size-lg); line-height: 24px; }

/* UI block's FIRST-level headline is Overpass REGULAR at 400 -- the biggest overshoot
   was at the largest size, where it shows most. */
:host([data-rui-theme="vision"]) .rui-hero-title,
:host([data-rui-theme="vision"]) .rui-cover-title {
  font-family: var(--rui-font-family-heading);
  font-weight: 400;
  letter-spacing: 0;
}

/* The page-header subheadline is the one role that was too LIGHT: it is UI block's
   SECOND-level role (OverpassSemibold), not regular. */
:host([data-rui-theme="vision"]) .rui-page-header-subtitle { font-weight: 600; }

/* Sheet headline is the THIRD-level role, 16/24 SemiBold. Overrides a duplicate
   17px/700 declaration further down this sheet that would otherwise win on order. */
:host([data-rui-theme="vision"]) .rui-sheet-title {
  font-size: var(--rui-font-size-lg); line-height: 24px; font-weight: 600;
}

/* UI block never uppercases or letter-spaces a heading, and never exceeds SemiBold. */
:host([data-rui-theme="vision"]) .rui-footer-col h5 {
  font-weight: 600; text-transform: none; letter-spacing: 0;
  font-size: var(--rui-font-size-base);
}

/* UI block grayscale-smooths exactly its .headline ladder and .page-header__headline --
   the same glyphs at the same weight look thicker under macOS subpixel smoothing,
   which is part of why titles read heavier. Scoped to those roles only; UI block leaves
   card titles, buttons and body copy at the default. */
:host([data-rui-theme="vision"]) .rui-heading,
:host([data-rui-theme="vision"]) .rui-section-title,
:host([data-rui-theme="vision"]) .rui-page-header-title,
:host([data-rui-theme="vision"]) .rui-page-header-subtitle,
:host([data-rui-theme="vision"]) .rui-hero-title,
:host([data-rui-theme="vision"]) .rui-cover-title,
:host([data-rui-theme="vision"]) .rui-modal-title,
:host([data-rui-theme="vision"]) .rui-callout-title {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:host([data-rui-theme="vision"]) .rui-multiselect-trigger {
  padding: 6px 16px;
  font-size: var(--rui-font-size-base);
}

:host([data-rui-theme="vision"]) .rui-input,
:host([data-rui-theme="vision"]) .rui-select, 
:host([data-rui-theme="vision"]) .rui-textarea {
  padding: 6px 12px;
}

:host([data-rui-theme="vision"]) .rui-callout[data-variant="success"] .rui-callout-title { color: var(--rui-color-success-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="danger"] .rui-callout-title,
:host([data-rui-theme="vision"]) .rui-callout[data-variant="error"] .rui-callout-title { color: var(--rui-color-danger-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="warning"] .rui-callout-title { color: var(--rui-color-warning-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="info"] .rui-callout-title { color: var(--rui-color-info-text); }


/* Modal titles had no weight rule at all, so they took the UA's 700. */
:host([data-rui-theme="vision"]) .rui-modal-title { font-weight: 600; }

/* Prose / rich-text / sidebar-section headings were all falling through to 700. */
:host([data-rui-theme="vision"]) .rui-prose h1,
:host([data-rui-theme="vision"]) .rui-prose h2,
:host([data-rui-theme="vision"]) .rui-prose h3,
:host([data-rui-theme="vision"]) .rui-rich-text h1,
:host([data-rui-theme="vision"]) .rui-rich-text h2,
:host([data-rui-theme="vision"]) .rui-rich-text h3,
:host([data-rui-theme="vision"]) .rui-sidebar-section-label { font-weight: 600; }

/* ---- Overlay / navigation / menu type sizes ----------------------------
   Aktion's base rules put several chrome elements at 13px, but UI block has no 13px
   step at all -- its ladder is 14px body, 16px L3 / first-level nav, 22px L2.
   Each value below is the resolved UI block token, cited where it comes from.
   ---------------------------------------------------------------------- */

/* UI block's page-header subheadline is the SECOND-level headline: 22/30 Overpass
   Semibold, not body copy (page-header.scss:173-178 -> default.scss:35-36). */
:host([data-rui-theme="vision"]) .rui-page-header-subtitle {
  font-family: var(--rui-font-family-heading);
  font-size: var(--rui-font-size-title);
  line-height: 30px;
  color: var(--rui-color-text);
  margin-top: -4px;                            /* page-header.scss:180-182 */
}

/* UI block dialog headlines are .headline--sub = THIRD level, 16/24 (default.scss:38-39). */
:host([data-rui-theme="vision"]) .rui-modal-title {
  font-size: var(--rui-font-size-lg);
  line-height: 24px;
}

/* Context-menu links and popover body copy are plain 14px default text
   (context-menu.scss:277-287, and UI block's popover title is .paragraph--bold). */
:host([data-rui-theme="vision"]) .rui-menu-item,
:host([data-rui-theme="vision"]) .rui-menu-item-label,
:host([data-rui-theme="vision"]) .rui-popover-title {
  font-size: var(--rui-font-size-base);
}

/* Left navigation: first level 16px, second level 14px, both 22px line-height
   (left-navigation.scss:476-482 / 575-580 -> default.scss:487-488). */
:host([data-rui-theme="vision"]) .rui-sidebar-item {
  font-size: var(--rui-font-size-lg);
  line-height: 22px;
}
:host([data-rui-theme="vision"]) .rui-sidebar-section .rui-sidebar-item {
  font-size: var(--rui-font-size-base);
  line-height: 22px;
}

/* ---- Toolbar (UI block table-toolbar) --------------------------------------
   Aktion's default Toolbar is a grey, fully-bordered, 12px-radius box. UI block's
   table-toolbar is the opposite: WHITE, with no border except a single 1px
   neutral-3 rule along the bottom, rounded only on its TOP corners so it sits
   flush on the table beneath it, and generously padded at 24px/16px
   (table.scss:1047-1054 + default.scss:348-352 -- table-border is
   "0 none transparent" and table-shadow is "none").
   ---------------------------------------------------------------------- */
/* ---- Semantic TEXT colours (UI block semantic-text-colors mixin) ------------
   UI block tints body copy with the level-5/6 "text" shades, not the mid-palette
   shape shades used for fills (utils.scss:661-693 + default.scss:172-186).
   Aktion's base rules point at --rui-color-success / -warning / -danger, which
   are the FILL shades -- e.g. success-4 #0fa954 instead of success-6 #096b35.
   On white that reads as a brighter, lower-contrast green than UI block's. Same
   distinction the Callout fix turned on: fills use level 3/4, text uses 5/6.
   ---------------------------------------------------------------------- */
:host([data-rui-theme="vision"]) .rui-text[data-color="success"] { color: #096b35; }   /* success-6 */
:host([data-rui-theme="vision"]) .rui-text[data-color="warning"] { color: #8e4e00; }   /* warning-6 */
:host([data-rui-theme="vision"]) .rui-text[data-color="danger"]  { color: #c80a00; }   /* critical-5 */
:host([data-rui-theme="vision"]) .rui-text[data-color="muted"]   { color: #465a75; }   /* neutral-6 */
:host([data-rui-theme="vision"]) .rui-text[data-color="primary"] { color: #1474c4; }   /* corporate-4 */

/* ---- Field bylines (UI block input-byline) ----------------------------------
   UI block sets no font-size on .input-byline, so validation copy inherits the 14px
   body size (input-byline.scss:27-35) and takes the critical TEXT shade. Aktion's
   base rule shrinks it to 12.5px/500 and uses the brighter critical fill colour,
   which reads as a different, smaller message than UI block's.
   ---------------------------------------------------------------------- */
:host([data-rui-theme="vision"]) .rui-field-error {
  font-size: var(--rui-font-size-base);        /* 14px, inherited in UI block */
  line-height: 24px;
  font-weight: 400;
  color: #c80a00;                              /* critical-5 · critical-text-color */
  margin-top: 6px;
}
:host([data-rui-theme="vision"]) .rui-field-hint,
:host([data-rui-theme="vision"]) .rui-form-hint {
  font-size: var(--rui-font-size-base);
  line-height: 24px;
  margin-top: 6px;
}

/* Truncated copy keeps the UI block 14/24 body rhythm, so a single clipped line is the
   same 24px tall as the paragraph it replaces (Aktion's base left it at 20px). */
:host([data-rui-theme="vision"]) .rui-truncate-text { line-height: 24px; }

:host([data-rui-theme="vision"]) .rui-toolbar {
  background: var(--rui-color-surface);        /* white, not bg-subtle */
  border: none;
  border-bottom: var(--rui-border-width) solid #bcc8d4;            /* neutral-3 · tertiary-shape-color */
  border-radius: var(--rui-radius-lg) var(--rui-radius-lg) 0 0;   /* 16px top only */
  box-shadow: none;
  padding: 24px 16px;
  gap: 12px;
}
:host([data-rui-theme="vision"]) button.rui-card:hover,
:host([data-rui-theme="vision"]) a.rui-card:hover,
:host([data-rui-theme="vision"]) .rui-card[data-clickable="true"]:hover {
  background: #dbedf8;                         /* corporate-1 · --hovered-card-background-color */
}

/* ---- Tile — UI block's clickable icon+label unit: interactive-blue text at
   rest, darker blue on hover, no lift/translate, scale-press on :active, and
   a distinct double-ring focus (matching button/link focus language). */
/* UI block tiles are CENTRE-stacked (icon over label over description), not a
   left-aligned icon+text row, and the icon is a large bare glyph in
   interactive-blue with no background chip (tile.scss: font-size 64px /
   line-height 62.5px / margin 0 auto, colour --interactive-text-color). */
:host([data-rui-theme="vision"]) .rui-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 16px;
  gap: 0;
}
:host([data-rui-theme="vision"]) .rui-tile-icon {
  background: transparent;
  color: var(--rui-color-link);
  width: auto;
  height: auto;
  font-size: 48px;
  line-height: 1;
  margin: 0 auto 4px;
  border-radius: 0;
}
:host([data-rui-theme="vision"]) .rui-tile-body { align-items: center; text-align: center; }
:host([data-rui-theme="vision"]) .rui-tile-label { color: var(--rui-color-link); font-size: var(--rui-font-size-lg); line-height: 22px; margin: 4px auto; } /* interactive-text-color, third-level size */
:host([data-rui-theme="vision"]) .rui-tile-description { color: #001b41; font-size: var(--rui-font-size-sm); line-height: 20px; margin: 4px auto; }           /* default-text-color, fourth-level size */
:host([data-rui-theme="vision"]) .rui-tile:hover { background: #dbedf8; transform: none; }            /* no lift — UI block tiles never move on hover */
:host([data-rui-theme="vision"]) .rui-tile:hover .rui-tile-icon { color: #095bb1; }                   /* hovered-interactive-text-color */
:host([data-rui-theme="vision"]) .rui-tile:hover .rui-tile-label,
:host([data-rui-theme="vision"]) .rui-tile:hover .rui-tile-description { color: #095bb1; }             /* hovered-interactive-text-color */
/* An end-positioned icon is a different block from the centred menu tile
   above: a choice card, where the copy is left-aligned body text and the
   illustration sits opposite it. Undo the column/centre treatment for that
   shape only. */
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"] {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  gap: 16px;
  padding: 12px 16px;
  /* Flat surfaces above strip every tile's border, but on a choice card the
     border IS the affordance — it is what says "this is one of a set you pick
     from" and what the selected state changes colour. */
  border: 1px solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
}
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"][data-selected="true"] {
  border-width: 2px;
}
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"] .rui-tile-body {
  align-items: flex-start; text-align: left; flex: 1 1 auto; gap: 2px;
}
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"] .rui-tile-label {
  color: var(--rui-color-text);
  font-size: var(--rui-font-size-base);
  line-height: 21px;
  font-weight: 400;
  margin: 0;
}
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"] .rui-tile-description {
  color: var(--rui-color-text-muted); line-height: 20px; margin: 0;
}
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"] .rui-tile-icon {
  margin: 0; font-size: 28px; line-height: 1;
}
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"]:hover { background: var(--rui-color-surface); }
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"]:hover .rui-tile-label { color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"]:hover .rui-tile-description { color: var(--rui-color-text-muted); }
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"][data-selected="true"] {
  border-color: var(--rui-color-link);
  box-shadow: none;
  background: var(--rui-color-surface);
}
:host([data-rui-theme="vision"]) .rui-tile[data-icon-position="end"][data-selected="true"] .rui-tile-label {
  color: var(--rui-color-text); font-weight: 400;
}
:host([data-rui-theme="vision"]) button.rui-tile:active,
:host([data-rui-theme="vision"]) a.rui-tile:active { transform: scale(0.98); }
:host([data-rui-theme="vision"]) button.rui-tile:focus-visible,
:host([data-rui-theme="vision"]) a.rui-tile:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--rui-color-focus-ring);
}

/* ---- Buttons — pill shape, 2px border, semibold, 4px/20px padding. Primary
   = navy that BRIGHTENS to blue on hover; secondary = navy outline that
   fills; ghost/link = blue text, no border, shorter box; disabled = SAME
   colour at opacity 0.62 (UI block never recolors disabled — verified: the only
   disabled rule in the entire framework is "opacity: 0.62; cursor: not-allowed"). */
:host([data-rui-theme="vision"]) .rui-button {
  /* 24px, not 999px: on a 36px-tall button both clamp to the same pill, but
     UI block deliberately keeps 24px so TALLER buttons (wrapped label, lg size,
     full-width) stay softly rounded instead of becoming a stadium. */
  border-radius: var(--rui-radius-button);
  border: 2px solid var(--rui-color-primary);
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  font-weight: 600;
  letter-spacing: 0;
  /* 24px line-height + 4px/4px padding + 2px/2px border = UI block's exact 36px
     button box (button-base.scss:11). Without it the label's "normal"
     line-height renders a 31px button. */
  line-height: 24px;
  box-shadow: none;
  transition: background var(--rui-transition-duration) ease-out, border-color var(--rui-transition-duration) ease-out, color var(--rui-transition-duration) ease-out;
}
:host([data-rui-theme="vision"]) .rui-button:hover:not(:disabled) {
  background: var(--rui-color-primary-hover);  /* corporate-4 — brighter */
  border-color: var(--rui-color-primary-hover);
  color: #fff;
  box-shadow: none;
}
:host([data-rui-theme="vision"]) .rui-button:active:not(:disabled) { transform: none; }
:host([data-rui-theme="vision"]) .rui-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--rui-color-focus-ring);
}
:host([data-rui-theme="vision"]) .rui-button:disabled {
  opacity: 0.62; /* button.scss:147-150 — never recolor, opacity only */
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="secondary"],
:host([data-rui-theme="vision"]) .rui-button[data-variant="outline"] {
  background: transparent; border-color: var(--rui-color-primary); color: var(--rui-color-primary);
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="secondary"]:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-button[data-variant="outline"]:hover:not(:disabled) {
  background: var(--rui-color-primary); border-color: var(--rui-color-primary); color: #fff;
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="ghost"],
:host([data-rui-theme="vision"]) .rui-button[data-variant="link"] {
  background: transparent; border-color: transparent; color: var(--rui-color-link);
  padding: 4px var(--rui-button-padding-x); min-height: 28px; /* ghost-button.scss: no border, shorter box */
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="ghost"]:hover:not(:disabled) {
  background: #dbedf8; border-color: transparent; color: #095bb1;       /* corporate-1 / -5 */
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="link"]:hover:not(:disabled) {
  background: transparent; text-decoration: underline; color: #095bb1;
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="ghost"]:focus-visible,
:host([data-rui-theme="vision"]) .rui-button[data-variant="link"]:focus-visible {
  box-shadow: 0 0 0 2px inset var(--rui-color-accent); /* ghost-button.scss: inset ring, no white gap (nothing to gap against) */
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="ghost"]:disabled,
:host([data-rui-theme="vision"]) .rui-button[data-variant="link"]:disabled { opacity: 0.38; } /* ghost-button.scss:153-156 */
:host([data-rui-theme="vision"]) .rui-button[data-variant="danger"] {
  background: #c80a00; border-color: #c80a00; color: #fff;              /* critical-5 */
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="danger"]:hover:not(:disabled) {
  background: #f50c00; border-color: #f50c00;                           /* critical-4 */
}
/* UI block spaces a button's icon from its label by 8px (button.scss:477-490) and
   trails the loading spinner by 12px; icon-only buttons are a fixed 36×36. */
:host([data-rui-theme="vision"]) .rui-button-icon {
  margin-right: 8px;
  /* UI block's button__icon is a 16x16 SVG. Aktion renders a font glyph, whose box is
     the glyph's own advance width (12.25 x 14) -- narrower, so the label crept
     left. Fix the box and centre the glyph inside it. */
  width: 16px; height: 16px;
  display: inline-flex; align-items: center; justify-content: center;
  flex: 0 0 auto; font-size: var(--rui-font-size-lg); line-height: 16px;
}
:host([data-rui-theme="vision"]) .rui-button[data-icon-position="trailing"] .rui-button-icon { margin-right: 0; margin-left: 8px; }
:host([data-rui-theme="vision"]) .rui-button-spinner { margin-right: 8px; }
:host([data-rui-theme="vision"]) .rui-button[data-icon-only="true"] {
  width: 36px; height: 36px; padding: 0 9px;
  align-items: center; justify-content: center;
}
:host([data-rui-theme="vision"]) .rui-button[data-icon-only="true"] .rui-button-icon,
:host([data-rui-theme="vision"]) .rui-button[data-icon-only="true"] .rui-button-spinner { margin: 0; }
:host([data-rui-theme="vision"]) .rui-buttons { gap: 12px; }
:host([data-rui-theme="vision"]) .rui-icon-button,
:host([data-rui-theme="vision"]) .rui-fab { border-radius: 999px; color: var(--rui-color-link); }
:host([data-rui-theme="vision"]) .rui-icon-button:hover:not(:disabled) { background: #dbedf8; color: #095bb1; }
:host([data-rui-theme="vision"]) .rui-icon-button:disabled { opacity: 0.38; }
/* follow-up chips — navy pill outline that fills on hover, same focus ring as button */
:host([data-rui-theme="vision"]) .rui-follow-up-button {
  background: transparent; border: 2px solid var(--rui-color-primary);
  color: var(--rui-color-primary); border-radius: 999px; font-weight: 600;
}
:host([data-rui-theme="vision"]) .rui-follow-up-button:hover {
  background: var(--rui-color-primary); border-color: var(--rui-color-primary); color: #fff;
}
:host([data-rui-theme="vision"]) .rui-follow-up-button:focus-visible {
  outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--rui-color-focus-ring);
}
/* toggle (pressed button) & segmented control — pill shape, pale-blue hover wash */
:host([data-rui-theme="vision"]) .rui-toggle:hover:not([data-state="on"]) { background: #dbedf8; color: #095bb1; }
:host([data-rui-theme="vision"]) .rui-toggle[data-state="on"] { background: #dbedf8; color: #095bb1; border-color: transparent; }
:host([data-rui-theme="vision"]) .rui-segmented-control { border-radius: 999px; background: #f4f7fa; border-color: var(--rui-color-border); }
:host([data-rui-theme="vision"]) .rui-segmented-control-option { border-radius: 999px; color: var(--rui-color-text-muted); }
:host([data-rui-theme="vision"]) .rui-segmented-control-option:hover:not([data-active="true"]):not([aria-selected="true"]) { color: var(--rui-color-link); }
:host([data-rui-theme="vision"]) .rui-segmented-control-option[data-active="true"],
:host([data-rui-theme="vision"]) .rui-segmented-control-option[aria-selected="true"] { background: #fff; color: #0b2a63; }

/* ---- Links — interactive blue; UI block never darkens on hover/active, it only
   adds an underline. Focus draws an outline "chip" that expands past the glyphs.
   Every accent-as-TEXT declaration in this block reads --rui-color-link, which
   defaults to the accent — so corporate-4 #1474c4 is unchanged — but keeps the
   text side separate from the accent's fill/border duties. */
:host([data-rui-theme="vision"]) .rui-link { color: var(--rui-color-link); font-weight: 400; text-decoration: none; }
/* UI block ".link--action" is an un-underlined interactive-blue link with a
   leading chevron glyph (link.scss) — not a navy underlined link. */
:host([data-rui-theme="vision"]) .rui-action-link {
  color: var(--rui-color-link);
  text-decoration: none;
  line-height: 20px;
}
:host([data-rui-theme="vision"]) .rui-action-link:not(.has-icon)::before {
  content: "";
  display: inline-block;
  width: 0.36em;
  height: 0.36em;
  margin-right: 0.5em;
  vertical-align: 0.12em;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
}
:host([data-rui-theme="vision"]) .rui-action-link:hover { color: #095bb1; text-decoration: underline; }
:host([data-rui-theme="vision"]) .rui-action-link:disabled { opacity: 0.38; }
/* This control was the one vision link falling through to the base ring, which is
   navy — every other vision control focuses in interactive blue. An outline, not
   the inset shadow the boxed controls use: there is no box to inset into. */
:host([data-rui-theme="vision"]) .rui-action-link:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: 2px;
  border-radius: 2px;
}
:host([data-rui-theme="vision"]) .rui-link:hover,
:host([data-rui-theme="vision"]) .rui-link:active { color: var(--rui-color-link); text-decoration: underline; }
:host([data-rui-theme="vision"]) .rui-link:focus-visible {
  outline: 2px solid var(--rui-color-accent); outline-offset: 2px; border-radius: 2px;
}

/* ---- Inputs — transparent field, 1px neutral-5 border, 8px radius; hover &
   focus draw a crisp blue border + 1px outline (no soft glow). Invalid
   (data-invalid) fields stay critical-red on hover/focus too — UI block never
   lets the blue interaction state override an error border. */
:host([data-rui-theme="vision"]) .rui-input,
:host([data-rui-theme="vision"]) .rui-select,
:host([data-rui-theme="vision"]) .rui-textarea {
  background: transparent;
  border: var(--rui-border-width) solid #718095;                  /* neutral-5 · --secondary-shape-color */
  border-radius: var(--rui-radius-input);     /* 8px */
  color: var(--rui-color-text);
  box-sizing: border-box;
  transition: border-color var(--rui-transition-duration) ease-out, outline-color var(--rui-transition-duration) ease-out;
}
:host([data-rui-theme="vision"]) .rui-input:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-select:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-textarea:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-input:focus,
:host([data-rui-theme="vision"]) .rui-select:focus,
:host([data-rui-theme="vision"]) .rui-textarea:focus {
  border-color: var(--rui-color-focus-ring);  /* corporate-4 */
  outline: 1px solid var(--rui-color-focus-ring);
  box-shadow: none;
}
/* UI block sizes single-line fields by an explicit height token
   (--input-text-height / --input-select-height = 36px), not by padding, so
   Aktion's padding-derived 38-39px boxes need pinning. The touch-target
   media query's min-height still wins on coarse pointers, as it should. */
:host([data-rui-theme="vision"]) .rui-input,
:host([data-rui-theme="vision"]) .rui-select { height: 36px; }
:host([data-rui-theme="vision"]) .rui-textarea:hover:not(:disabled) { background: #dbedf8; } /* textarea-only quirk: pale-blue tint on hover */
:host([data-rui-theme="vision"]) .rui-input:disabled,
:host([data-rui-theme="vision"]) .rui-select:disabled,
:host([data-rui-theme="vision"]) .rui-textarea:disabled { color: #718095; opacity: 1; cursor: not-allowed; } /* tertiary-text-color, no fade */
:host([data-rui-theme="vision"]) .rui-input::placeholder,
:host([data-rui-theme="vision"]) .rui-select::placeholder,
:host([data-rui-theme="vision"]) .rui-textarea::placeholder { color: var(--rui-color-text-muted); }
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-input,
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-select,
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-textarea,
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-number-input {
  border-color: #ff6159; /* critical-shape-color */
}
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-input:hover,
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-input:focus,
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-select:hover,
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-select:focus,
:host([data-rui-theme="vision"]) .rui-field[data-invalid="true"] .rui-textarea:focus {
  border-color: #ff6159; outline: 1px solid #ff6159; box-shadow: none;
}
/* composite / grid inputs that ship a pill radius or navy focus in the base → UI block 8px + blue focus */
:host([data-rui-theme="vision"]) .rui-data-grid-filter,
:host([data-rui-theme="vision"]) .rui-search-bar-input,
:host([data-rui-theme="vision"]) .rui-combobox-filter,
:host([data-rui-theme="vision"]) .rui-inline-edit-input,
:host([data-rui-theme="vision"]) .rui-search-bar,
:host([data-rui-theme="vision"]) .rui-number-input,
:host([data-rui-theme="vision"]) .rui-password-input-field {
  border-radius: var(--rui-radius-input);
  border-color: #718095;
}
:host([data-rui-theme="vision"]) .rui-data-grid-filter:focus,
:host([data-rui-theme="vision"]) .rui-combobox-filter:focus,
:host([data-rui-theme="vision"]) .rui-search-bar:focus-within,
:host([data-rui-theme="vision"]) .rui-number-input:focus-within,
:host([data-rui-theme="vision"]) .rui-password-input-field:focus-within {
  border-color: var(--rui-color-focus-ring); outline: 1px solid var(--rui-color-focus-ring); box-shadow: none;
}
:host([data-rui-theme="vision"]) .rui-search-bar-submit { border-radius: 999px; } /* embeds a real .rui-button-like pill */
:host([data-rui-theme="vision"]) .rui-number-input-button { background: transparent; }
:host([data-rui-theme="vision"]) .rui-number-input-button,
:host([data-rui-theme="vision"]) .rui-password-input-toggle { color: var(--rui-color-link); }
:host([data-rui-theme="vision"]) .rui-number-input-button:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-password-input-toggle:hover { color: #095bb1; }
/* form labels — Open Sans Semibold, primary-text-color (form/label.scss) */
:host([data-rui-theme="vision"]) .rui-field-label,
:host([data-rui-theme="vision"]) .rui-form-label,
:host([data-rui-theme="vision"]) .rui-checkbox-label,
:host([data-rui-theme="vision"]) .rui-radio-label,
:host([data-rui-theme="vision"]) .rui-switch-label { color: #02102b; font-weight: 600; line-height: 22px; }
/* UI block sets no font-size on .label, so it inherits the 14px body size, with a 22px
   line-height and 12px/4px margins. Aktion's base
   rule shrinks field labels to 13px. Scoped to FIELD labels only -- checkbox, radio
   and switch labels are plain 14/21 body copy and keep their own weight rule below. */
:host([data-rui-theme="vision"]) .rui-field-label,
:host([data-rui-theme="vision"]) .rui-form-label {
  font-size: var(--rui-font-size-base);
  line-height: 22px;
  margin-bottom: 4px;
}
:host([data-rui-theme="vision"]) .rui-field-hint,
:host([data-rui-theme="vision"]) .rui-form-hint { color: var(--rui-color-text); } /* input-byline has no muted-gray rule — reads as normal body text */

/* ---- Checkbox & radio — corporate-5 2px border. Hover fills a pale preview
   tint + outer glow ring (does NOT recolor the border); focus draws a solid
   opaque blue ring (not a translucent haze); disabled is a flat neutral fill
   with NO opacity fade (UI block never dims form controls). */
/* UI block's box is 17x17 with a 2px corporate-5 border and the label sits 32px
   from the box's left edge (input-checkbox.scss / input-radio.scss). Aktion's
   base control is a 20px box visually shrunk to 16px by transform:scale(.8),
   with an 8px flex gap — noticeably smaller and tighter, which is why the two
   read differently. Cancel the scale, use the real 17px, and open the gap. */
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"],
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"],
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel-cb,
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"] {
  /* content-box: 17px of box + 2px border each side = a 21px marker, and the
     label sits 32px from its left edge -> an 11px gap. */
  box-sizing: content-box;
  width: 17px;
  height: 17px;
  transform: none;
  border-width: 2px; border-color: #095bb1; background: transparent;   /* corporate-5 */
}
:host([data-rui-theme="vision"]) .rui-checkbox,
:host([data-rui-theme="vision"]) .rui-checkbox-item,
:host([data-rui-theme="vision"]) .rui-radio { gap: 11px; align-items: flex-start; }
/* UI block lays choices out INLINE, wrapping when they run out of room -- its labels are
   bare inline elements with margin-right: 11px, and the real fieldset markup shows
   several on one line. Aktion stacks them by default. Wrapping (not nowrap) keeps long
   option labels readable, which is how UI block behaves too. */
:host([data-rui-theme="vision"]) .rui-radio-group {
  flex-direction: row; flex-wrap: wrap;
  column-gap: 11px;
  row-gap: 0;                                  /* the item line-height IS the row advance in UI block */
  align-items: flex-start;
}
/* ...except when the options carry slots: a row with a stepper hanging off it
   is a block, not a word, so those stack and the option's own control lines up
   with the middle of the slot rather than with the top of the text. */
:host([data-rui-theme="vision"]) .rui-radio-group[data-slots="true"] {
  flex-direction: column; flex-wrap: nowrap; row-gap: 10px; align-items: stretch;
}
:host([data-rui-theme="vision"]) .rui-radio-group[data-slots="true"] .rui-radio { align-items: center; }
/* CheckboxGroup stays STACKED. Each of its items carries a label plus a description
   block, and flowing those inline squashes them into narrow columns -- which UI block never
   does. Only bare radios flow inline. */
:host([data-rui-theme="vision"]) .rui-checkbox-group {
  flex-direction: column; flex-wrap: nowrap;
  column-gap: 0; row-gap: 8px; align-items: stretch;
}
/* UI block never bolds a control's label. */
:host([data-rui-theme="vision"]) .rui-checkbox-label,
:host([data-rui-theme="vision"]) .rui-radio-label { font-weight: 400; line-height: 21px; }
/* the CSS-drawn tick has to be re-centred for the larger, unscaled box */
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:checked::after,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:checked::after,
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel-cb:checked::after {
  left: 6px; top: 2px; width: 4px; height: 8px; border-width: 0 2px 2px 0;
}
/* UI block's radio has no separate centre-dot element at all -- the whole "filled" look
   is the box-shadow rings below, painted directly on the input. Aktion's base theme
   draws a small ::after dot on top of a solid "background" fill; once the vision
   fill is the box-shadow technique instead, that leftover dot would sit inside the
   solid centre and read as a punched-out hole. Remove it. */
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]::after {
  content: none;
}
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"],
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"],
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel-cb { border-radius: 4px; }
/* UI block keeps the box TRANSPARENT when checked and draws the fill as two stacked
   inset rings, so a 2px page-coloured gap separates the border from the blue centre:
     .input-checkbox:checked+label::before {
       border: 2px solid #095bb1;
       box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 10px inset #095bb1;
     }
   Filling the box edge-to-edge (what this theme did before) loses that gap and is the
   single most visible checkbox difference. The tick is the PAGE background colour
   #f4f7fa, not pure white. */
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:checked,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:checked,
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel-cb:checked {
  background: transparent; border-color: #095bb1;
  box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 10px inset #095bb1;
}
/* THE BUG: this rule set border-color but never a fill, so a checked radio rendered
   as an empty ring -- clicking an option looked like nothing happened. UI block:
     .input-radio:checked:not(:disabled)+label::before {
       box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset #095bb1;
     }
   Same two-ring technique as the checkbox fix, but the spacer ring is WHITE here,
   not the page background -- that is what UI block's own compiled CSS specifies for
   radio (input-checkbox uses --default-background-color, input-radio uses --white). */
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:checked {
  background: transparent; border-color: #095bb1;
  box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset #095bb1;
}
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:checked::after,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:checked::after,
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel-cb:checked::after {
  border-color: #f4f7fa;                       /* tick = --default-background-color */
}
/* Checked + disabled swaps both rings to inactive neutral -- UI block never just fades it:
   box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 10px inset #bcc8d4 */
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:checked:disabled,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:checked:disabled {
  border-color: #bcc8d4;
  box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 10px inset #bcc8d4;
}
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:hover,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:hover,
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:hover {
  border-color: #095bb1; /* unchanged on hover */
}
/* UI block keeps the 2px gap ring on hover too, so the pale-blue preview core is inset
   rather than flooding to the border:
   box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 10px inset #95caeb, 0 0 0 8px #dbedf8 */
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:not(:disabled):not(:checked):hover,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:not(:disabled):not(:checked):hover {
  background: transparent;
  box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 10px inset #95caeb, 0 0 0 8px #dbedf8;
}
/* Radio's hover states had the exact bug the checked-rest rule above had: the old
   code set "background: #95caeb" (fills edge-to-edge, no white gap) then a SEPARATE
   later rule replaced "box-shadow" with just the glow -- wiping out any fill ring
   for that property. Consolidated into one rule per state, using the radio's own
   ground truth (".input-radio:not(:disabled)+label:hover::before" / the ":checked"
   variant), including a 7px glow -- radio's is 7px, checkbox's is 8px, per UI block. */
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:not(:disabled):not(:checked):hover {
  background: transparent;
  box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset #95caeb, 0 0 0 7px #dbedf8;
}
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:checked:not(:disabled):hover {
  box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset #095bb1, 0 0 0 7px #dbedf8;
}
/* UI block gives a disabled radio no HOVER REACTION -- not no fill. The previous
   "box-shadow: none" wiped out a disabled+checked radio's fill on hover too, making a
   selected-but-disabled option look unselected the moment the pointer passed over it.
   The ":checked" variant is more specific (one extra pseudo-class) so it always wins
   over the plain ":disabled:hover" rule below, regardless of source order. */
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:disabled:hover,
:host([data-rui-theme="vision"]) .rui-radio:hover input[type="radio"]:disabled {
  background: transparent; box-shadow: none; border-color: #bcc8d4;
}
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:checked:disabled:hover,
:host([data-rui-theme="vision"]) .rui-radio:hover input[type="radio"]:checked:disabled {
  box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset #bcc8d4;
}
/* Unchecked keyboard focus shows the same pale-preview fill UI block gives on hover, plus
   the 4px outer ring (input-radio.scss's plain ":focus-visible", not the ":checked"
   variant below). */
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:not(:checked):focus-visible {
  border-color: #095bb1;
  box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset #95caeb, 0 0 0 4px #1474c4;
  outline: none;
}
/* Checked + focus-visible had the SAME missing-fill bug as plain :checked: the old
   rule matched both checked and unchecked radios and only ever drew the outer ring,
   so tabbing to an already-selected option made it look deselected. UI block restates
   the full solid-fill rings before adding the focus ring
   (.input-radio:checked:not(:disabled):focus-visible+label::before). */
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:checked:focus-visible {
  border-color: #095bb1;
  box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset #095bb1, 0 0 0 4px #1474c4;
  outline: none;
}
/* Because the checked fill now LIVES in box-shadow, every state that touches box-shadow
   must restate the fill rings or the box goes blank. UI block does exactly this -- see
   .input-checkbox:checked:not(:disabled):focus-visible+label::before, which repeats both
   inset rings before adding the focus ring. The spacer ring is #f4f7fa
   (--default-background-color), never #fff. */
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:not(:checked):focus-visible,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:not(:checked):focus-visible {
  border-color: #095bb1;
  box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 2px #f4f7fa, 0 0 0 4px #1474c4;
}
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:checked:focus-visible,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:checked:focus-visible {
  border-color: #095bb1;
  box-shadow: 0 0 0 2px inset #f4f7fa, 0 0 0 10px inset #095bb1, 0 0 0 2px #f4f7fa, 0 0 0 4px #1474c4;
}
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:disabled,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:disabled,
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:disabled {
  opacity: 1; border-color: var(--rui-color-border); /* inactive-neutral-shape-color, no fade */
}
:host([data-rui-theme="vision"]) .rui-checkbox input[type="checkbox"]:checked:disabled,
:host([data-rui-theme="vision"]) .rui-checkbox-item input[type="checkbox"]:checked:disabled {
  background: var(--rui-color-border); border-color: var(--rui-color-border);
}
/* Radio uses the same ring technique as its other states, not a plain solid fill --
   .input-radio:disabled+label::before{border-color:#bcc8d4;
     box-shadow:0 0 0 2px inset #fff,0 0 0 10px inset #bcc8d4} */
:host([data-rui-theme="vision"]) .rui-radio input[type="radio"]:checked:disabled {
  background: transparent; border-color: var(--rui-color-border);
  box-shadow: 0 0 0 2px inset #fff, 0 0 0 10px inset var(--rui-color-border);
}

/* ---- Switch — neutral off, corporate-5 on; pale-blue glow ring on hover
   (whole control, not just the thumb); solid blue focus ring. */
  /* UI block switch (input-switch.scss): 39x19 hit box, a 37x15 track with a 10px
   radius, neutral-4 off / corporate-5 on, and a 15px square white thumb with an
   8px radius (NOT a circle). Aktion's default is a 36x20 pill track with a 16px
   round thumb — visibly chunkier and rounder. */
:host([data-rui-theme="vision"]) .rui-switch-track {
  width: 37px;
  height: 15px;
  border-radius: 10px;
  border-color: transparent;
  border-width: 2px;
  /* UI block sizes the track content-box: 15px of track + 2px borders = 19px tall,
     37px + 2px = 39px wide (input-switch.scss). */
  box-sizing: content-box;
  background: #97a3b4;                         /* quaternary-background-color */
}
:host([data-rui-theme="vision"]) .rui-switch-input:checked + .rui-switch-track {
  background: #095bb1;                         /* hovered-interactive-text-color */
  border-color: transparent;
}
:host([data-rui-theme="vision"]) .rui-switch-thumb {
  width: 15px;
  height: 15px;
  top: 0;
  left: 0;
  border-radius: var(--rui-radius-sm);         /* 8px, square-ish — not a circle */
  background: #fff;
  box-shadow: none;                            /* UI block's knob is flat; Aktion's base adds a drop shadow */
}
:host([data-rui-theme="vision"]) .rui-switch-input:checked + .rui-switch-track .rui-switch-thumb {
  transform: translateX(22px);                 /* UI block's __on grows to 22px */
}
/* UI block shows a white tick inside the track once ON (.input-switch__on::before,
   an icon-font glyph). Aktion has no such element, so it is drawn as a
   CSS checkmark on the track itself. */
:host([data-rui-theme="vision"]) .rui-switch-input:checked + .rui-switch-track::before {
  content: "";
  position: absolute;
  left: 8px;
  top: 2px;
  width: 4px;
  height: 7px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  pointer-events: none;
}
:host([data-rui-theme="vision"]) .rui-switch:hover .rui-switch-track { box-shadow: 0 0 0 7px #dbedf8; border-radius: 12px; }
:host([data-rui-theme="vision"]) .rui-switch-input:focus-visible + .rui-switch-track {
  box-shadow: 0 0 0 2px var(--rui-color-surface), 0 0 0 4px var(--rui-color-focus-ring);
}

/* ---- Table — flat & borderless; uppercase navy-bold header (UI block's
   fourth-level-headline style), hairline rows, pale-blue row hover, uppercase
   navy caption. */
:host([data-rui-theme="vision"]) .rui-table-wrapper { border: none; box-shadow: none; }
:host([data-rui-theme="vision"]) .rui-table { font-size: var(--rui-font-size-base); }
:host([data-rui-theme="vision"]) .rui-table th {
  /* UI block's header CELL is white (--secondary-table-search-background-color) and
     draws its hairline as an inset box-shadow, not a border (table.scss:
     ".table__header .table__cell" sets background #fff plus
     "box-shadow: inset 0 -1px 0 0 rgb(188,200,212)"). */
  background: var(--rui-color-surface);
  color: var(--rui-color-text); font-weight: 600;
  font-size: var(--rui-font-size-base); text-transform: uppercase; letter-spacing: 0;
  border-bottom: none;
  box-shadow: inset 0 -1px 0 0 var(--rui-color-border);   /* neutral-3 */
}
:host([data-rui-theme="vision"]) .rui-table td {
  border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle); color: var(--rui-color-text);   /* neutral-2 */
}
:host([data-rui-theme="vision"]) .rui-table tbody tr:hover td { background: #dbedf8; }   /* corporate-1 */
:host([data-rui-theme="vision"]) .rui-table-caption { color: var(--rui-color-text); text-transform: uppercase; }

/* ---- DataGrid — the same treatment as Table above.
   These are two different tables in the markup ('.rui-table' vs
   '.rui-data-grid-table'), and only the plain one was dressed — so swapping a
   Table for a DataGrid to gain sorting silently reverted the head to the base
   theme's small grey uppercase label on a tinted fill, and every app that did
   it had to restate the Exos head in its own stylesheet. Same rules, same
   reasons; the head fill goes through '--rui-dg-head-bg' so the overlaid
   column-settings button and the scroll-edge fades follow it. */
:host([data-rui-theme="vision"]) .rui-data-grid { --rui-dg-head-bg: var(--rui-color-surface); }
:host([data-rui-theme="vision"]) .rui-data-grid-scroll { border: none; box-shadow: none; }
:host([data-rui-theme="vision"]) .rui-data-grid-table { font-size: var(--rui-font-size-base); }
:host([data-rui-theme="vision"]) .rui-data-grid-table thead th {
  color: var(--rui-color-text); font-weight: 600;
  font-size: var(--rui-font-size-base); text-transform: uppercase; letter-spacing: 0;
  border-bottom: none;
  box-shadow: inset 0 -1px 0 0 var(--rui-color-border);   /* neutral-3 */
}
:host([data-rui-theme="vision"]) .rui-data-grid-table tbody td {
  border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle); color: var(--rui-color-text);
}
:host([data-rui-theme="vision"]) .rui-data-grid-table tbody tr:last-child td {
  border-bottom: none;
}
:host([data-rui-theme="vision"]) .rui-data-grid[data-highlight-hover="true"] tbody tr:hover td,
:host([data-rui-theme="vision"]) .rui-data-grid[data-highlight-hover="true"] tbody tr:hover td[data-pinned="true"] {
  background: #dbedf8;   /* corporate-1 */
}
:host([data-rui-theme="vision"]) .rui-data-grid-caption { color: var(--rui-color-text); text-transform: uppercase; }
:host([data-rui-theme="vision"]) .rui-data-grid-filter-row td,
:host([data-rui-theme="vision"]) .rui-data-grid-filter-row td[data-pinned="true"] {
  background: var(--rui-color-surface);
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}
/* Column settings: the same ghost-icon-fills-blue trigger the theme gives every
   other menu opener, and the 2px accent border its menu panels wear. */
:host([data-rui-theme="vision"]) .rui-data-grid-col-menu-btn {
  border-radius: 999px; color: var(--rui-color-link);
}
:host([data-rui-theme="vision"]) .rui-data-grid-col-menu-btn:hover,
:host([data-rui-theme="vision"]) .rui-data-grid-col-menu-btn:focus-visible,
:host([data-rui-theme="vision"]) .rui-data-grid-col-menu-btn[aria-expanded="true"] {
  background: var(--rui-color-accent); color: #fff; outline: none;
}
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel {
  border: 2px solid var(--rui-color-accent);
  border-radius: var(--rui-radius-sm);
  box-shadow: 0 2px 8px 0 rgba(113, 128, 149, 0.5);
}
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel-row:hover { background: #dbedf8; }
:host([data-rui-theme="vision"]) .rui-data-grid-col-panel-reset { color: var(--rui-color-link); font-weight: 600; }
/* Flat theme: the chevrons take the same hairline-on-white treatment as the
   pagination controls rather than a floating drop shadow. */
:host([data-rui-theme="vision"]) .rui-data-grid-scroll-arrow {
  background: var(--rui-color-surface);
  border-color: var(--rui-color-border);
  color: var(--rui-color-link);
}
:host([data-rui-theme="vision"]) .rui-data-grid-scroll-arrow:hover {
  background: var(--rui-color-accent); border-color: var(--rui-color-accent); color: #fff;
}
:host([data-rui-theme="vision"]) .rui-data-grid-resize-handle:hover::after,
:host([data-rui-theme="vision"]) .rui-data-grid-resize-handle:focus-visible::after,
:host([data-rui-theme="vision"]) .rui-data-grid-resize-handle.rui-data-grid-resize-active::after {
  background: var(--rui-color-accent);
}

/* ---- Pagination — UI block's active/hover page is a flat NEUTRAL-GRAY pill with
   dark text, never blue/white (verified identical across default-hover,
   active, and active-hover states). */
/* UI block rounds pagination links with the DEFAULT 16px radius, not the 8px small one
   (pagination.scss:84). */
:host([data-rui-theme="vision"]) .rui-pagination-button { color: var(--rui-color-link); border-radius: var(--rui-radius-lg); border-color: transparent; }
:host([data-rui-theme="vision"]) .rui-pagination-button:hover:not([disabled]):not([data-active="true"]),
:host([data-rui-theme="vision"]) .rui-pagination-button[data-active="true"],
:host([data-rui-theme="vision"]) .rui-pagination-button[data-active="true"]:hover {
  background: var(--rui-color-border);   /* neutral-3 · --tertiary-shape-color */
  border-color: transparent;
  color: var(--rui-color-text);          /* --default-text-color, NOT white/blue */
}
:host([data-rui-theme="vision"]) .rui-pagination-per-page-select { border-color: #718095; }
:host([data-rui-theme="vision"]) .rui-pagination-per-page-select:hover,
:host([data-rui-theme="vision"]) .rui-pagination-per-page-select:focus-visible {
  border-color: var(--rui-color-focus-ring); outline: 1px solid var(--rui-color-focus-ring);
}

/* ---- Progress / gauge / donut — track = tertiary-shape-color (neutral-3);
   warning/danger tones use the actual *-shape-color palette (amber/coral),
   not the darker accessible-text shade colorWarning/colorDanger resolve to. */
/* UI block's quota bar is a 12px-tall trough with a 4px (xsmall) radius — NOT an
   8px pill. quotabar.scss ".quotabar__bar": background #bcc8d4, height 12px,
   border-radius 4px, overflow hidden, margin-bottom 12px. The value fills
   the full height and is clipped by the trough, so it carries no radius. */
:host([data-rui-theme="vision"]) .rui-progress {
  display: flex;
  flex-direction: column;
}
/* UI block's caption sits UNDER the bar, not above it (quotabar__text follows
   quotabar__bar), at full-strength navy rather than a muted grey. */
:host([data-rui-theme="vision"]) .rui-progress-head { order: 2; margin-top: 8px; }
:host([data-rui-theme="vision"]) .rui-progress-label,
:host([data-rui-theme="vision"]) .rui-progress-value {
  color: var(--rui-color-text);
  font-size: var(--rui-font-size-base);
  font-weight: 400;
}
:host([data-rui-theme="vision"]) .rui-progress-track {
  background: var(--rui-color-border);        /* neutral-3 #bcc8d4 */
  height: 12px;
  border-radius: var(--rui-radius-xs);        /* 4px */
  overflow: hidden;
  order: 1;
}
  /* UI block's quota bar fills with the ACTIVATING cyan (--activating-shape-color
   #08a5c5), not the navy primary — quotabar.scss ".quotabar__value". */
:host([data-rui-theme="vision"]) .rui-progress-bar {
  background: var(--rui-color-info);          /* activating-4 #08a5c5 */
  border-radius: 0;                            /* clipped by the trough, per UI block */
}
/* LoadingDots — three dots pulsing in sequence (a quieter alternative to the
   Spinner's rotating ring). Each dot fades out and back on a staggered delay.
   The comment used to sit between a stray :host([data-rui-theme="vision"])
   and this selector, which silently scoped the component's own layout rule to
   one theme — every other theme rendered the dots as an inline box with no gap. */
.rui-loading-dots { display: inline-flex; align-items: center; gap: var(--rui-spacing-s); }
.rui-loading-dots-track { display: inline-flex; align-items: center; gap: 6px; }
.rui-loading-dots-dot {
  width: 10px;
  height: 10px;
  border-radius: 20px;
  background: var(--rui-color-primary);
  animation: rui-loading-dots-pulse 1.3s ease-in-out infinite;
}
.rui-loading-dots-dot:nth-child(2) { animation-delay: 0.3s; }
.rui-loading-dots-dot:nth-child(3) { animation-delay: 0.5s; }
/* The enum is xs|sm|md|lg|xl and includes a neutral tone; only sm/lg and the four
   semantic tones existed, so xs/xl/neutral silently fell through to the default. */
.rui-loading-dots[data-size="xs"] .rui-loading-dots-dot { width: 5px; height: 5px; }
.rui-loading-dots[data-size="sm"] .rui-loading-dots-dot { width: 7px; height: 7px; }
.rui-loading-dots[data-size="lg"] .rui-loading-dots-dot { width: 13px; height: 13px; }
.rui-loading-dots[data-size="xl"] .rui-loading-dots-dot { width: 16px; height: 16px; }
/* primary is the documented DEFAULT of the shared TONE_ENUM (content.ts:36) and
   still had no rule of its own; it resolves to the same colour the base dot uses. */
.rui-loading-dots[data-tone="primary"] .rui-loading-dots-dot { background: var(--rui-color-primary); }
.rui-loading-dots[data-tone="default"] .rui-loading-dots-dot { background: var(--rui-color-primary); }
.rui-loading-dots[data-tone="neutral"] .rui-loading-dots-dot { background: var(--rui-color-text-muted); }
.rui-loading-dots[data-tone="success"] .rui-loading-dots-dot { background: var(--rui-color-success); }
.rui-loading-dots[data-tone="warning"] .rui-loading-dots-dot { background: var(--rui-color-warning); }
.rui-loading-dots[data-tone="danger"] .rui-loading-dots-dot { background: var(--rui-color-danger); }
.rui-loading-dots[data-tone="info"] .rui-loading-dots-dot { background: var(--rui-color-info); }
.rui-loading-dots-label { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); }
@keyframes rui-loading-dots-pulse {
  0%, 100% { background-color: var(--rui-color-primary); }
  50% { background-color: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .rui-carousel-track { transition: none; }
  .rui-loading-dots-dot { animation-duration: 2.6s; }
}

/* An unscoped .rui-spinner-ring rule was stranded here in the vision theme
   section, leaking a hardcoded pale blue #dbedf8 ring into every theme. It has
   now been deleted rather than re-tokenized, because it was also DEAD: the real
   Spinner rule further down declares the border shorthand, which resets
   border-color, and it wins on source order. If the vision theme wants an
   accent-coloured ring, it needs a :host([data-rui-theme="vision"]) rule. */
/* UI block's quotabar takes a semantic fill per state; success is the one tone the
   vision block was missing, so a success quota bar fell back to the default
   activating cyan (quotabar.scss:101-103 -> default.scss:175 = success-4). */
:host([data-rui-theme="vision"]) .rui-progress[data-tone="success"] .rui-progress-bar,
:host([data-rui-theme="vision"]) .rui-progress-segment[data-tone="success"][data-filled="true"],
:host([data-rui-theme="vision"]) .rui-progress-ring[data-tone="success"] .rui-progress-ring-bar,
:host([data-rui-theme="vision"]) .rui-gauge[data-tone="success"] .rui-gauge-value,
:host([data-rui-theme="vision"]) .rui-gauge[data-tone="success"] .rui-gauge-arc {
  border-color: #0fa954; stroke: #0fa954; color: #0fa954; /* success-shape-color */
}
:host([data-rui-theme="vision"]) .rui-progress[data-tone="warning"] .rui-progress-bar,
:host([data-rui-theme="vision"]) .rui-progress-segment[data-tone="warning"][data-filled="true"],
:host([data-rui-theme="vision"]) .rui-progress-ring[data-tone="warning"] .rui-progress-ring-bar,
:host([data-rui-theme="vision"]) .rui-gauge[data-tone="warning"] .rui-gauge-value,
:host([data-rui-theme="vision"]) .rui-gauge[data-tone="warning"] .rui-gauge-arc {
  border-color: #ffaa00; stroke: #ffaa00; color: #ffaa00; /* warning-shape-color */
}
:host([data-rui-theme="vision"]) .rui-progress[data-tone="danger"] .rui-progress-bar,
:host([data-rui-theme="vision"]) .rui-progress-segment[data-tone="danger"][data-filled="true"],
:host([data-rui-theme="vision"]) .rui-progress-ring[data-tone="danger"] .rui-progress-ring-bar,
:host([data-rui-theme="vision"]) .rui-gauge[data-tone="danger"] .rui-gauge-value,
:host([data-rui-theme="vision"]) .rui-gauge[data-tone="danger"] .rui-gauge-arc {
  border-color: #ff6159; stroke: #ff6159; color: #ff6159; /* critical-shape-color */
}

/* ---- Price tag — UI block's savings badge is a solid ORANGE chip with dark navy
   text and a 4px radius; not a rounded semantic-danger pill. */
:host([data-rui-theme="vision"]) .rui-pricetag-off {
  background: #ffaa00; color: #001b41; border-radius: var(--rui-radius-xs);
  font-size: var(--rui-font-size-sm); line-height: 20px; padding: 0 6px; font-weight: 600;
}

/* ---- Badge — small SOLID semantic chip, 2px radius (UI block xxsmall), 14px
   body-copy size, regular no-variant fill = neutral-solid grey. */
:host([data-rui-theme="vision"]) .rui-badge {
  border-radius: 2px; font-weight: 600; font-size: var(--rui-font-size-base); line-height: 20px;
  padding: 0 6px; letter-spacing: 0; background: var(--rui-color-border); color: var(--rui-color-text);
}
:host([data-rui-theme="vision"]) .rui-badge[data-variant="primary"] { background: #0b2a63; color: #fff; }
:host([data-rui-theme="vision"]) .rui-badge[data-variant="success"] { background: #12cf76; color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-badge[data-variant="warning"] { background: #ffaa00; color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-badge[data-variant="danger"]  { background: #ff6159; color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-badge[data-variant="info"]    { background: #11c7e6; color: var(--rui-color-text); }

/* ---- Pill — the real UI block ".pill": 11px radius, 12px text, regular weight,
   2px/6px padding, 20px line-height, pale tint bg + dark semantic text. */
:host([data-rui-theme="vision"]) .rui-pill {
  border-radius: 11px; border: none; font-weight: 400;
  font-size: var(--rui-font-size-sm);        /* 12px · --small-text-size */
  line-height: 20px; padding: 2px 6px;
  background: #f4f7fa; color: #465a75;       /* neutral-1 / neutral-6 */
}
:host([data-rui-theme="vision"]) .rui-pill[data-tone="activating"] { background: #dbedf8; color: #095bb1; } /* corporate-1 / -5 */
:host([data-rui-theme="vision"]) .rui-pill[data-tone="corporate"]  { background: #dbedf8; color: #095bb1; }
:host([data-rui-theme="vision"]) .rui-pill[data-tone="success"]    { background: #c7fae2; color: #096b35; } /* success-1 / -6 */
:host([data-rui-theme="vision"]) .rui-pill[data-tone="warning"]    { background: #ffedca; color: #8e4e00; } /* warning-1 / -6 */
:host([data-rui-theme="vision"]) .rui-pill[data-tone="critical"]   { background: #ffe4e2; color: #c80a00; } /* critical-1 / -5 */
:host([data-rui-theme="vision"]) .rui-pill[data-tone="promoting"]  { background: #fae7fe; color: #6a1b8f; } /* promoting-1 / -6 */

/* ---- ButtonGroup — UI block rounds ONLY the outer corners (start
   "24px 0 0 24px", middle "0", end "0 24px 24px 0") and fully COLLAPSES the
   adjoining border on middle/end so neighbours share one edge. These need the
   host-scoped selector because the vision ".rui-button" radius would
   otherwise out-specify the group's own corner rules and leave every item a
   separate pill. Only the primary (filled) variant re-introduces a visible
   neutral-3 hairline, since navy-on-navy would otherwise merge. */
:host([data-rui-theme="vision"]) .rui-button-group > .rui-button-group-item[data-pos="start"] {
  border-radius: 24px 0 0 24px;
}
:host([data-rui-theme="vision"]) .rui-button-group > .rui-button-group-item[data-pos="middle"] {
  border-radius: 0;
  border-left-width: 0;
}
:host([data-rui-theme="vision"]) .rui-button-group > .rui-button-group-item[data-pos="end"] {
  border-radius: 0 24px 24px 0;
  border-left-width: 0;
}
:host([data-rui-theme="vision"]) .rui-button-group > .rui-button-group-item[data-pos="only"] { border-radius: 24px; }
:host([data-rui-theme="vision"]) .rui-button-group > .rui-button-group-item[data-pos="middle"]:not([data-variant="secondary"]):not([data-variant="outline"]):not([data-variant="ghost"]),
:host([data-rui-theme="vision"]) .rui-button-group > .rui-button-group-item[data-pos="end"]:not([data-variant="secondary"]):not([data-variant="outline"]):not([data-variant="ghost"]) {
  border-left: var(--rui-border-width) solid var(--rui-color-border); /* neutral-3 divider on filled buttons */
}

/* ---- InputGroup — same shell as a lone UI block input: transparent fill, 1px
   neutral-5 border, 8px radius, and a crisp blue border+outline on focus
   (never a soft glow). */
:host([data-rui-theme="vision"]) .rui-input-group {
  background: transparent;
  border: var(--rui-border-width) solid #718095;                   /* neutral-5 · --secondary-shape-color */
  border-radius: var(--rui-radius-input);      /* 8px */
}
:host([data-rui-theme="vision"]) .rui-input-group:focus-within,
:host([data-rui-theme="vision"]) .rui-input-group:hover {
  border-color: var(--rui-color-focus-ring);
  outline: 1px solid var(--rui-color-focus-ring);
  box-shadow: none;
}
/* Host-scoped mirrors, or the vision at-rest/hover border above out-specifies
   the base disabled + invalid rules and the states render as a normal field. */
:host([data-rui-theme="vision"]) .rui-input-group[data-invalid="true"],
:host([data-rui-theme="vision"]) .rui-input-group[data-invalid="true"]:hover,
:host([data-rui-theme="vision"]) .rui-input-group[data-invalid="true"]:focus-within {
  border-color: var(--rui-color-danger);
  outline-color: var(--rui-color-danger);
}
:host([data-rui-theme="vision"]) .rui-input-group[data-disabled="true"]:hover,
:host([data-rui-theme="vision"]) .rui-input-group[data-disabled="true"]:focus-within {
  border-color: var(--rui-color-border);
  outline: none;
}
:host([data-rui-theme="vision"]) .rui-input-group-icon { color: var(--rui-color-link); }
/* The group owns the chrome — strip the nested control's own border/outline.
   Needs the host-scoped selector to out-specify the vision .rui-input rule
   (which would otherwise draw a second box inside the shell). */
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-input,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-select,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-textarea,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-number-input,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-combobox-trigger,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-input:hover,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-select:hover,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-textarea:hover,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-number-input:hover,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-combobox-trigger:hover,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-input:focus,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-select:focus,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-textarea:focus,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-number-input:focus,
:host([data-rui-theme="vision"]) .rui-input-group-field .rui-combobox-trigger:focus {
  border: none; border-radius: 0; background: transparent; box-shadow: none; outline: none;
}

/* ---- FilterPill — UI block filter-pill: 11px radius, 12px text, neutral-1 fill
   with neutral-6 text; hover steps to neutral-2; active is corporate-1 with
   corporate-5 text, and active+hover deepens to corporate-2 / corporate-6. */
:host([data-rui-theme="vision"]) .rui-filter-pill {
  border: none; border-radius: 11px; padding: 2px 8px;
  font-size: var(--rui-font-size-sm); font-weight: 400;
  background: #f4f7fa; color: #465a75;         /* neutral-1 / neutral-6 */
}
:host([data-rui-theme="vision"]) .rui-filter-pill:hover:not(:disabled) { background: #dbe2e8; } /* neutral-2 */
:host([data-rui-theme="vision"]) .rui-filter-pill:focus-visible {
  outline: 2px solid var(--rui-color-accent); outline-offset: 2px;
}
:host([data-rui-theme="vision"]) .rui-filter-pill[data-active="true"] {
  background: #dbedf8; color: #095bb1; border: none; font-weight: 400;  /* corporate-1 / -5 */
}
:host([data-rui-theme="vision"]) .rui-filter-pill[data-active="true"]:hover:not(:disabled) {
  background: #95caeb; color: #003d8f;         /* corporate-2 / -6 */
}

/* ---- ActionStripe — flat white row, hairline separator, pale-blue hover UI block
   wash, and the chevron + label switching to interactive blue on hover. */
:host([data-rui-theme="vision"]) .rui-action-stripe {
  background: var(--rui-color-surface);
  border-bottom: var(--rui-border-width) solid #bcc8d4;            /* neutral-3 · tertiary-shape-color */
  padding: 14px 15px 16px;                     /* action-stripe 14/0/16 + stripes 15px sides */
  align-items: center;
}
/* UI block's stripe label is REGULAR weight (--default-font-regular = OpenSansRegular at
   400), not semibold. Aktion was setting 600, which is the single most visible
   difference in a stripe list -- every row read as a heading. */
:host([data-rui-theme="vision"]) .rui-action-stripe-label {
  font-weight: 400;
  font-size: var(--rui-font-size-base);
  line-height: 20px;
}
/* The right-hand action is an UI block action LINK: corporate-4 blue, regular weight,
   14/20, with the chevron drawn as a ::before so it precedes the label. Aktion emits
   the value and then the chevron, so reorder them -- icon and body stay at order 0. */
:host([data-rui-theme="vision"]) .rui-action-stripe-value {
  color: #1474c4;                              /* interactive-text-color */
  font-weight: 400;
  font-size: var(--rui-font-size-base);
  line-height: 20px;
  order: 2;
}
:host([data-rui-theme="vision"]) .rui-action-stripe-chevron { order: 1; margin-right: 6px; }
/* UI block's stripes are FULL-BLEED. Its .sheet has padding: 0 and overflow: hidden, so
   each .action-stripe spans the sheet's whole width, its own 15px padding sets the text
   inset, and the first/last stripes carry the sheet's 16px corner radius -- which is
   what clips the 8px semantic bar into a rounded end. Aktion's Card pads 20px, so
   stripes were inset with white to the left of the bar and square corners. Cancel the
   card padding and hand the outer stripes the card's radius.
   .rui-spacing-l is the card's padding (20px in this theme). */
:host([data-rui-theme="vision"]) .rui-card > .rui-action-stripe {
  margin-left: calc(-1 * var(--rui-spacing-l));
  margin-right: calc(-1 * var(--rui-spacing-l));
  width: auto;
}
/* The bleed only reads right if the card clips -- that is what rounds the end of the
   8px semantic bar, exactly as UI block's overflow: hidden sheet does. */
:host([data-rui-theme="vision"]) .rui-card:has(> .rui-action-stripe) { overflow: hidden; }
/* UI block butts consecutive stripes directly together; Aktion's card is a flex column with
   a 12px gap. Pull each stripe up by the gap so neighbours touch, without collapsing the
   gaps around other card children (headers, footers, quota bars). */
:host([data-rui-theme="vision"]) .rui-card > .rui-action-stripe + .rui-action-stripe {
  margin-top: calc(-1 * var(--rui-spacing-m));
}
:host([data-rui-theme="vision"]) .rui-card > .rui-action-stripe:first-child {
  border-top-left-radius: var(--rui-radius-lg);
  border-top-right-radius: var(--rui-radius-lg);
}
:host([data-rui-theme="vision"]) .rui-card > .rui-action-stripe:last-child {
  border-bottom: none;
  border-bottom-left-radius: var(--rui-radius-lg);
  border-bottom-right-radius: var(--rui-radius-lg);
}
:host([data-rui-theme="vision"]) .rui-action-stripe:hover:not([data-disabled="true"]) { background: #dbedf8; }
:host([data-rui-theme="vision"]) .rui-action-stripe:hover:not([data-disabled="true"]) .rui-action-stripe-label,
:host([data-rui-theme="vision"]) .rui-action-stripe:hover:not([data-disabled="true"]) .rui-action-stripe-icon { color: #095bb1; }
:host([data-rui-theme="vision"]) .rui-action-stripe-chevron {
  border-right-color: #1474c4; border-bottom-color: #1474c4; color: #1474c4;
}
/* UI block hover moves the whole link to the darker interactive shade and does NOT tint
   the row background (.action-stripe.__direct-selection--hover .link -> #095bb1). */
:host([data-rui-theme="vision"]) .rui-action-stripe:hover:not([data-disabled="true"]) .rui-action-stripe-value,
:host([data-rui-theme="vision"]) .rui-action-stripe:hover:not([data-disabled="true"]) .rui-action-stripe-chevron {
  color: #095bb1; border-right-color: #095bb1; border-bottom-color: #095bb1;
}

/* ---- CardSection — UI block card__section: white fill with a 2px semantic rule
   above and below (the tint stays white; the RULES carry the colour) and the
   body text taking the semantic text shade. */
:host([data-rui-theme="vision"]) .rui-card-section { background: var(--rui-color-surface); padding-block: 16px; }
:host([data-rui-theme="vision"]) .rui-card-section[data-tone="activating"] { border-top-color: #08a5c5; border-bottom-color: #08a5c5; color: #005b72; }
:host([data-rui-theme="vision"]) .rui-card-section[data-tone="success"]    { border-top-color: #0fa954; border-bottom-color: #0fa954; color: #096b35; }
:host([data-rui-theme="vision"]) .rui-card-section[data-tone="warning"]    { border-top-color: #ffaa00; border-bottom-color: #ffaa00; color: #8e4e00; }
:host([data-rui-theme="vision"]) .rui-card-section[data-tone="critical"]   { border-top-color: #ff6159; border-bottom-color: #ff6159; color: #c80a00; }
:host([data-rui-theme="vision"]) .rui-card-section[data-tone="neutral"]    { border-top-color: #97a3b4; border-bottom-color: #97a3b4; color: #465a75; }
:host([data-rui-theme="vision"]) .rui-card-section[data-tone="corporate"]  { border-top-color: #95caeb; border-bottom-color: #95caeb; color: #1474c4; }
:host([data-rui-theme="vision"]) .rui-card-section[data-tone="promoting"]  { border-top-color: #e480f8; border-bottom-color: #e480f8; color: #b410e7; }

/* ---- Callout footer — UI block message__footer: 12px gap, 24px top margin. */
:host([data-rui-theme="vision"]) .rui-callout-footer { gap: 12px; margin-top: 24px; }

/* ---- Tag / chip — same soft tinted treatment (Aktion's internal chip used
   by ProfileCard/MediaCard/KanbanCard); kept in sync with Pill above. */
:host([data-rui-theme="vision"]) .rui-tag {
  border-radius: 999px; border: none; font-weight: 400; font-size: var(--rui-font-size-sm);
  line-height: 20px; padding: 2px 6px; background: #f4f7fa; color: #465a75;   /* neutral-1 / neutral-6 */
}
:host([data-rui-theme="vision"]) .rui-tag[data-variant="primary"] { background: #dbedf8; color: #095bb1; }
:host([data-rui-theme="vision"]) .rui-tag[data-variant="success"] { background: #c7fae2; color: #096b35; }
:host([data-rui-theme="vision"]) .rui-tag[data-variant="warning"] { background: #ffedca; color: #8e4e00; }
:host([data-rui-theme="vision"]) .rui-tag[data-variant="danger"]  { background: #ffe4e2; color: #c80a00; }
:host([data-rui-theme="vision"]) .rui-filter-chip {
  border-radius: 999px; background: #f4f7fa; color: #465a75; border: none; font-size: var(--rui-font-size-sm);
}
:host([data-rui-theme="vision"]) .rui-filter-chip:hover { background: #dbe2e8; }
:host([data-rui-theme="vision"]) .rui-filter-chip:focus-within { outline: 2px solid var(--rui-color-accent); outline-offset: 2px; }
:host([data-rui-theme="vision"]) .rui-filter-chip-remove { color: inherit; }
:host([data-rui-theme="vision"]) .rui-filter-chip[data-active="true"],
:host([data-rui-theme="vision"]) .rui-filter-chip[aria-pressed="true"] { background: #dbedf8; color: #095bb1; }
:host([data-rui-theme="vision"]) .rui-filter-chip[data-active="true"]:hover,
:host([data-rui-theme="vision"]) .rui-filter-chip[aria-pressed="true"]:hover { background: #95caeb; color: #003d8f; }

/* ---- Tabs — muted default label; selected/hover both turn interactive-blue
   with a blue underline (UI Block never uses dark-navy for the active tab). */
:host([data-rui-theme="vision"]) .rui-tab-list { border-bottom: var(--rui-border-width) solid var(--rui-color-border); }
:host([data-rui-theme="vision"]) .rui-tab-trigger {
  color: var(--rui-color-text); font-weight: 600; font-family: var(--rui-font-family-heading);
  border-bottom: 3px solid transparent;
}
:host([data-rui-theme="vision"]) .rui-tab-trigger:hover,
:host([data-rui-theme="vision"]) .rui-tab-trigger[aria-selected="true"] {
  color: var(--rui-color-link); border-bottom-color: var(--rui-color-accent);
}

/* ---- Accordion — 15px outer radius (16-1), primary-text-color header,
   colour-only hover (no background wash), inset focus ring, and semantic
   left-bar status variants (a real UI Block feature Aktion had zero support for). */
:host([data-rui-theme="vision"]) .rui-accordion { border: none; border-radius: calc(var(--rui-radius-lg) - 1px); overflow: hidden; box-shadow: none; gap: unset; }
:host([data-rui-theme="vision"]) .rui-accordion-item {
  border: none; border-bottom: var(--rui-border-width) solid #bcc8d4; border-radius: 0;
  background: var(--rui-color-surface); box-shadow: none;
  position: relative; overflow: hidden;
}
/* 15px, not 16px: UI Block uses calc(--default-border-radius - 1px) so the item's corner
   sits just inside the group's 1px edge. */
:host([data-rui-theme="vision"]) .rui-accordion-item:first-child {
  border-top-left-radius: calc(var(--rui-radius-lg) - 1px);
  border-top-right-radius: calc(var(--rui-radius-lg) - 1px);
}
:host([data-rui-theme="vision"]) .rui-accordion-item:last-child {
  border-bottom: none;
  border-bottom-left-radius: calc(var(--rui-radius-lg) - 1px);
  border-bottom-right-radius: calc(var(--rui-radius-lg) - 1px);
}
/* UI Block accordion header — accordion.scss: primary-text-color, Open Sans SB
   14px/20px, padding 16px 32px 18px 20px, and an ALWAYS-VISIBLE chevron pinned
   at right:16px / top:14px. Aktion hides its chevron unless the author opts in
   via data-show-arrow, which is the single biggest reason the two looked
   unrelated — force it on and give it UI Block's geometry. */
:host([data-rui-theme="vision"]) .rui-accordion-trigger {
  color: #02102b;                              /* primary-text-color */
  font-family: var(--rui-font-family);
  font-size: var(--rui-font-size-base);        /* 14px */
  line-height: 20px;
  font-weight: 600;
  padding: 16px 32px 18px 20px;
  position: relative;
  justify-content: flex-start;
}
:host([data-rui-theme="vision"]) .rui-accordion-chevron {
  display: inline-block;                       /* UI Block always shows it */
  position: absolute;
  right: 16px;
  top: 22px;                                   /* production says 14px, not 18px */
  font-size: var(--rui-font-size-base);
  line-height: 24px;
  color: #02102b;
  opacity: 1;
}
/* A two-line trigger is twice as tall, so the chevron's pinned top would land
   on the title rather than between the two lines — centre it instead. */
/* Nudged with top rather than a translate: the chevron IS its transform (a
   rotated corner), so overriding that property squares it off. */
:host([data-rui-theme="vision"]) .rui-accordion-trigger:has(.rui-accordion-heading) .rui-accordion-chevron {
  top: calc(50% - 4px);
}
:host([data-rui-theme="vision"]) .rui-accordion-subtitle {
  font-size: var(--rui-font-size-base);
  line-height: 21px;
  color: var(--rui-color-text-muted);
}
:host([data-rui-theme="vision"]) .rui-accordion-body {
  padding: 0 20px 18px;
  color: var(--rui-color-text);
}
:host([data-rui-theme="vision"]) .rui-accordion-trigger:hover,
:host([data-rui-theme="vision"]) .rui-accordion-item[data-state="open"] .rui-accordion-trigger { background: transparent; color: var(--rui-color-link); }
:host([data-rui-theme="vision"]) .rui-accordion-trigger:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--rui-color-accent); }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="success"] { box-shadow: inset 8px 0 0 0 #12cf76; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="success"]:hover,
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="success"][data-state="open"] { box-shadow: inset 8px 0 0 0 #0fa954; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="warning"] { box-shadow: inset 8px 0 0 0 #ffd176; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="warning"]:hover,
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="warning"][data-state="open"] { box-shadow: inset 8px 0 0 0 #ffaa00; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="danger"] { box-shadow: inset 8px 0 0 0 #ffa8a3; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="danger"]:hover,
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="danger"][data-state="open"] { box-shadow: inset 8px 0 0 0 #ff6159; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="neutral"] { box-shadow: inset 8px 0 0 0 var(--rui-color-border); }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="neutral"]:hover,
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="neutral"][data-state="open"] { box-shadow: inset 8px 0 0 0 #97a3b4; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="info"] { box-shadow: inset 8px 0 0 0 #7fe4f6; }
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="info"]:hover,
:host([data-rui-theme="vision"]) .rui-accordion-item[data-variant="info"][data-state="open"] { box-shadow: inset 8px 0 0 0 var(--rui-color-info); }

/* ---- Breadcrumb — every crumb (incl. separators, current) reads at the same
   default-text-color / normal weight; hover only underlines; focus draws a
   crisp outline. UI Block never mutes earlier crumbs or bolds the current one. */
:host([data-rui-theme="vision"]) .rui-breadcrumb-list { font-size: var(--rui-font-size-lg); color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-breadcrumb-separator { color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-breadcrumb-link { color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-breadcrumb-link:hover { color: var(--rui-color-text); text-decoration: underline; }
:host([data-rui-theme="vision"]) .rui-breadcrumb-link:focus-visible { outline: 2px solid var(--rui-color-accent); outline-offset: 2px; border-radius: 2px; }
:host([data-rui-theme="vision"]) .rui-breadcrumb-current { color: var(--rui-color-text); font-weight: 400; }
:host([data-rui-theme="vision"]) .rui-page-header-crumb,
:host([data-rui-theme="vision"]) .rui-page-header-crumb-sep { color: var(--rui-color-text); font-weight: 400; }
:host([data-rui-theme="vision"]) .rui-page-header-crumb:focus-visible { outline: 2px solid var(--rui-color-accent); outline-offset: 1px; }

/* ---- Context menu / dropdown menu — 2px accent border, 8px radius, tight
   menu shadow (not the 32px modal shadow); items highlight via a 3px LEFT
   border + text recolor, never a background wash. Trigger fills solid blue
   on open/hover (ghost-button-icon-only pattern). */
:host([data-rui-theme="vision"]) .rui-context-menu-pop,
:host([data-rui-theme="vision"]) .rui-dropdown-menu-content {
  border: 2px solid var(--rui-color-accent);
  border-radius: var(--rui-radius-sm);
  box-shadow: 0 2px 8px 0 rgba(113, 128, 149, 0.5);
}
:host([data-rui-theme="vision"]) .rui-context-menu-pop .rui-menu-item,
:host([data-rui-theme="vision"]) .rui-dropdown-menu-content .rui-menu-item {
  border-left: 3px solid transparent; border-radius: 0; padding: 6px 16px 6px 13px;
}
:host([data-rui-theme="vision"]) .rui-context-menu-pop .rui-menu-item:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-context-menu-pop .rui-menu-item:focus-visible,
:host([data-rui-theme="vision"]) .rui-dropdown-menu-content .rui-menu-item:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-dropdown-menu-content .rui-menu-item:focus-visible {
  background: transparent; border-left-color: var(--rui-color-accent); color: var(--rui-color-link);
}
:host([data-rui-theme="vision"]) .rui-menu-item[data-variant="danger"]:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-menu-item[data-variant="danger"]:focus-visible {
  background: transparent; border-left-color: var(--rui-color-danger); color: var(--rui-color-danger-text);
}
:host([data-rui-theme="vision"]) .rui-menu-item:disabled { opacity: 0.5; }
/* UI Block rules its menu entries apart. Adjacent-sibling so the first entry has
   no rule against the panel border, and so a MenuSeparator (which draws its own)
   is not doubled. */
:host([data-rui-theme="vision"]) .rui-context-menu-pop .rui-menu-item + .rui-menu-item,
:host([data-rui-theme="vision"]) .rui-dropdown-menu-content .rui-menu-item + .rui-menu-item {
  border-top: var(--rui-border-width) solid var(--rui-color-border-subtle);
}
/* Both menu flavours share the trigger treatment: a ghost icon-only control that
   fills solid blue while its menu is open. DropdownMenu marks its own trigger
   with the same data-state attribute, so it gets the same rule, not a copy. */
:host([data-rui-theme="vision"]) .rui-context-menu-target .rui-icon-button,
:host([data-rui-theme="vision"]) .rui-dropdown-menu-trigger .rui-icon-button {
  border-radius: 999px; color: var(--rui-color-link);
}
:host([data-rui-theme="vision"]) .rui-context-menu-target .rui-icon-button:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-context-menu-target .rui-icon-button:focus-visible,
:host([data-rui-theme="vision"]) .rui-context-menu-target .rui-icon-button[data-state="open"],
:host([data-rui-theme="vision"]) .rui-dropdown-menu-trigger[data-state="open"] .rui-icon-button,
:host([data-rui-theme="vision"]) .rui-dropdown-menu-trigger .rui-icon-button:hover:not(:disabled),
:host([data-rui-theme="vision"]) .rui-dropdown-menu-trigger .rui-icon-button:focus-visible {
  background: var(--rui-color-accent); color: #fff; outline: none;
}

/* ---- Interception banner — UI Block's Interception Stripe is a full-bleed,
   edge-to-edge, flat pale-tinted strip: no radius, no border, no left bar
   (structurally the OPPOSITE of Message below). */
:host([data-rui-theme="vision"]) .rui-banner {
  display: flex; align-items: center; gap: 8px; padding: 16px 24px;
  border-radius: 0; border: none; background: #dbedf8; color: var(--rui-color-text);
}
:host([data-rui-theme="vision"]) .rui-banner[data-tone="success"] { background: #c7fae2; }
:host([data-rui-theme="vision"]) .rui-banner[data-tone="warning"] { background: #ffedca; }
:host([data-rui-theme="vision"]) .rui-banner[data-tone="danger"]  { background: #ffe4e2; }
/* info is the vision stripe's own pale blue (same as the untoned default);
   default is the neutral grey band. */
:host([data-rui-theme="vision"]) .rui-banner[data-tone="info"]    { background: #dbedf8; }
:host([data-rui-theme="vision"]) .rui-banner[data-tone="default"] { background: #f4f7fa; }

/* ---- Callout / Alert / Note (UI Block Message) ------------------------------
   Matched to UI Block's Message ANATOMY, which differs from Aktion's default in
   three ways that made them look unrelated:
     1. UI Block has NO filled icon disc. The icon is an inline glyph in the
        SEMANTIC colour, sitting on the title's line.
     2. Body copy is NOT indented under the icon — it starts at the container's
        own left padding, because in UI Block the icon lives inside the headline.
     3. Padding is 28px/30px, and the 9px semantic bar is an inset shadow so the
        16px radius still clips it.
   Aktion emits the icon as a flex sibling of the body, so the icon is taken out
   of flow and only the title is indented — same result, no DOM fork.
   ------------------------------------------------------------------------- */
/* OUTER = UI Block's .message: chrome only, and it CLIPS.
   .message{background:#fff;border: var(--rui-border-width) solid #97a3b4;border-radius:16px;
            margin-bottom:32px;overflow:hidden;display:block} */
:host([data-rui-theme="vision"]) .rui-callout {
  /* Section padding, icon offset and title indent are three views of ONE geometry:
     the icon is absolutely positioned INTO the section's padding box, so its offsets
     have to equal that padding, and the title has to be indented by exactly the
     icon's width plus a gap. Compact only changes the numbers, so the numbers live
     here and every rule below reads them. Overriding padding alone (which is what
     shipped) left the icon pinned at the regular 28px/30px while the box shrank to
     10px/14px: it landed below and right of the denser title, overlapping the
     headline and spilling past the bottom border. */
  --rui-callout-pad-block: 28px;
  --rui-callout-pad-inline: 30px;
  --rui-callout-icon-size: 24px;               /* svg-icon--larger */
  --rui-callout-icon-font: var(--rui-font-size-title);
  --rui-callout-icon-gap: 11px;                /* 24 + 11 = UI Block's 35px indent */
  --rui-callout-line: 24px;                    /* the title's first line box */
  --rui-callout-title-min: 30px;               /* headline--sub stretches to 30px */
  --rui-callout-title-gap: 12px;               /* headline--sub margin-bottom */
  display: block;
  padding: 0;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid #97a3b4;                   /* neutral-4 · --neutral-shape-color */
  border-radius: var(--rui-radius-lg);         /* 16px */
  color: var(--rui-color-text);
  box-shadow: none;                            /* the bar belongs to the inner section */
  margin-bottom: 32px;                         /* UI Block always leaves air below a Message */
  overflow: hidden;
}
/* INNER = UI Block's .message__section: padding, and the semantic bar.
   .message__section{display:block;margin-left:-1px;padding:28px 30px;position:relative}
   The -1px pull makes the bar cover the outer element's 1px border instead of leaving a
   grey hairline to its left, and because the OUTER clips, the bar's ends are cut straight
   by the corner arc rather than following the 16px radius. */
:host([data-rui-theme="vision"]) .rui-callout-section {
  display: block;
  position: relative;
  margin-left: -1px;
  padding: var(--rui-callout-pad-block) var(--rui-callout-pad-inline);
  box-shadow: inset 9px 0 0 -1px #97a3b4;      /* default/neutral bar */
}
:host([data-rui-theme="vision"]) .rui-callout[data-variant="info"] .rui-callout-section    { box-shadow: inset 9px 0 0 -1px #08a5c5; }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="success"] .rui-callout-section { box-shadow: inset 9px 0 0 -1px #0fa954; }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="warning"] .rui-callout-section { box-shadow: inset 9px 0 0 -1px #ffaa00; }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="danger"] .rui-callout-section,
:host([data-rui-theme="vision"]) .rui-callout[data-variant="error"] .rui-callout-section   { box-shadow: inset 9px 0 0 -1px #ff6159; }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="neutral"] .rui-callout-section { box-shadow: inset 9px 0 0 -1px #97a3b4; }
/* Compact still has to be denser than this theme's 28px/30px, and it re-points the
   whole geometry rather than just the padding — the icon and the title indent
   follow on their own because they read the same tokens. */
:host([data-rui-theme="vision"]) .rui-callout[data-compact="true"] {
  --rui-callout-pad-block: 10px;
  --rui-callout-pad-inline: 14px;
  --rui-callout-icon-size: 18px;
  --rui-callout-icon-font: var(--rui-font-size-base);
  --rui-callout-icon-gap: 8px;
  --rui-callout-title-min: var(--rui-callout-line);   /* one line, no headline stretch */
  --rui-callout-title-gap: 4px;
}
/* The section is display: block here, so the dismiss button cannot be pushed over
   by margin-left: auto — pin it to the section, which is already position: relative. */
:host([data-rui-theme="vision"]) .rui-callout-dismiss { position: absolute; top: 24px; right: 24px; margin: 0; }
:host([data-rui-theme="vision"]) .rui-callout[data-compact="true"] .rui-callout-dismiss { top: 6px; right: 10px; }

/* The body becomes a plain block so the description is NOT indented. */
:host([data-rui-theme="vision"]) .rui-callout-body {
  display: block;
  flex: none;
}

/* The icon: lifted out of flow, drawn as a bare semantic-coloured glyph on the
   title's line — no disc, no white knock-out. */
:host([data-rui-theme="vision"]) .rui-callout-icon {
  position: absolute;
  left: var(--rui-callout-pad-inline);
  top: var(--rui-callout-pad-block);
  width: var(--rui-callout-icon-size);
  /* The box is as tall as the title's FIRST LINE, not as tall as the glyph, so
     align-items:center optically centres the icon on the headline for any
     icon/line combination instead of needing a hand-tuned top offset per size. */
  height: var(--rui-callout-line);
  border-radius: 0;
  background: transparent !important;
  font-size: var(--rui-callout-icon-font);
  line-height: 1;
  align-items: center;
  justify-content: flex-start;
}
/* Removing the disc also removed what --rui-color-on-* was FOR: those tokens are
   the knock-out ink for a filled medallion, so reading them on the bare card left
   danger/error/neutral drawing a #ffffff glyph on a white surface -- a 1:1
   contrast ratio, i.e. no visible icon at all. On this theme the icon is a semantic
   glyph on the title's line, so it takes the title's own semantic text colour. */
:host([data-rui-theme="vision"]) .rui-callout .rui-callout-icon              { color: var(--rui-color-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="info"] .rui-callout-icon    { color: var(--rui-color-info-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="success"] .rui-callout-icon { color: var(--rui-color-success-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="warning"] .rui-callout-icon { color: var(--rui-color-warning-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="danger"] .rui-callout-icon,
:host([data-rui-theme="vision"]) .rui-callout[data-variant="error"] .rui-callout-icon   { color: var(--rui-color-danger-text); }
:host([data-rui-theme="vision"]) .rui-callout[data-variant="neutral"] .rui-callout-icon { color: var(--rui-color-text); }

/* Title: UI Block's third-level headline in the semantic colour, cleared past the
   icon. Description + footer stay at the container's left padding. */
:host([data-rui-theme="vision"]) .rui-callout-title {
  font-family: var(--rui-font-family);
  font-size: var(--rui-font-size-lg);
  line-height: 24px;
  font-weight: 600;
  /* UI Block's .headline--sub carries margin-top: -2px, and because its icon is an INLINE
     glyph inside the headline the line box stretches to 30px. Aktion positions the icon
     absolutely, so match the box explicitly -- otherwise every Callout ends up 4px
     shorter than the UI Block original. */
  margin-top: 0px;
  min-height: var(--rui-callout-title-min);
  /* Exactly clears the absolutely-placed icon: its width plus the gap. */
  padding-left: calc(var(--rui-callout-icon-size) + var(--rui-callout-icon-gap));
  margin-bottom: var(--rui-callout-title-gap); /* headline--sub margin-bottom */
}
/* hideIcon (and icon:false) leave no icon to clear, so the indent has to go with it --
   otherwise the headline sits behind a gap nothing occupies. The render marks the root
   rather than relying on :has(), so every theme gets the same hook. */
:host([data-rui-theme="vision"]) .rui-callout[data-has-icon="false"] .rui-callout-title {
  padding-left: 0;
}
/* .message__section > :last-child { margin-bottom: 0 } -- UI Block collapses the trailing
   margin inside the section, so a title-only or description-last Callout has no stray
   space above its bottom edge. */
:host([data-rui-theme="vision"]) .rui-callout-section > :last-child,
:host([data-rui-theme="vision"]) .rui-callout-body > :last-child { margin-bottom: 0; }
:host([data-rui-theme="vision"]) .rui-callout-description {
  color: var(--rui-color-text);                /* body copy stays navy */
  font-size: var(--rui-font-size-base);
  line-height: 20px;
  padding-left: 0;
  margin-bottom: 12px;                         /* .paragraph margin-bottom */
}

/* ---- Floating layers — dark (neutral-5, not near-navy) tooltip that WRAPS
   and centers; borderless popovers/hover-cards at the full 16px card radius
   + the lighter primary-shadow (context-menu/dropdown keep their own tighter
   rule above); borderless toast at 8px radius + UI Block's 16px/14px padding. */
:host([data-rui-theme="vision"]) .rui-tooltip-content {
  background: #718095; color: #fff; border: none;                       /* neutral-5 · tertiary-background-color-inverted */
  border-radius: var(--rui-radius-sm);
  box-shadow: 0 2px 8px 0 rgba(113, 128, 149, 0.5);
  padding: 8px; max-width: 200px; white-space: normal; text-align: center; line-height: 1.538em;
  /* UI Block sets no font-size on .tooltip__element, so it inherits the 14px body
     base. Aktion's base rule drops tooltips to 12px -- restore the UI Block size. */
  font-size: var(--rui-font-size-base);
}
:host([data-rui-theme="vision"]) .rui-tooltip-arrow { background: #718095; }
:host([data-rui-theme="vision"]) .rui-popover-content,
:host([data-rui-theme="vision"]) .rui-hover-card-content {
  background: var(--rui-color-surface);
  border: none;                                    /* --card-border resolves to 0 none transparent */
  border-radius: var(--rui-radius-lg);              /* 16px, --default-border-radius */
  box-shadow: 0 2px 8px 0 rgba(113, 128, 149, 0.5); /* --primary-shadow */
}
:host([data-rui-theme="vision"]) .rui-toast {
  background: var(--rui-color-surface);
  border: none;                                     /* --semantic-container-border-width resolves to 0 */
  border-radius: var(--rui-radius-sm);               /* 8px, --small-border-radius */
  box-shadow: 0 2px 8px 0 rgba(113, 128, 149, 0.5);
  padding: 16px 14px;
  color: var(--rui-color-text);
}
:host([data-rui-theme="vision"]) .rui-toast[data-tone] { border: none; }
/* UI Block's snackbar is a SOLID semantic bar, not a white card with a tinted icon:
   background is the level-3 shade and the text stays navy, with no border
   (snackbar.scss:72-105 pulls in semantic-solid-backgrounds; utils.scss:337-372
   -> default.scss:204-211). The vision default above stays white so an
   untoned Toast still reads as a neutral card. */
:host([data-rui-theme="vision"]) .rui-toast[data-tone="success"]    { background: #12cf76; color: #001b41; }  /* success-3 */
:host([data-rui-theme="vision"]) .rui-toast[data-tone="warning"]    { background: #ffaa00; color: #001b41; }  /* warning-3 */
:host([data-rui-theme="vision"]) .rui-toast[data-tone="danger"],
:host([data-rui-theme="vision"]) .rui-toast[data-tone="error"]      { background: #ff6159; color: #001b41; }  /* critical-3 */
:host([data-rui-theme="vision"]) .rui-toast[data-tone="neutral"]    { background: #bcc8d4; color: #001b41; }  /* neutral-3 */
:host([data-rui-theme="vision"]) .rui-toast[data-tone="info"]       { background: #11c7e6; color: #001b41; }  /* activating-3 */
/* Only the corporate tone knocks its text out to white (utils.scss:374-377). */
:host([data-rui-theme="vision"]) .rui-toast[data-tone="primary"]    { background: #0b2a63; color: #fff; }     /* corporate-7 */
/* The icon rides on the bar, so it inherits rather than keeping a tinted disc. */
:host([data-rui-theme="vision"]) .rui-toast[data-tone] .rui-toast-icon {
  background: transparent; color: inherit;
}

/* ---- Modal & sheet — flat white panel, no shadow of its own (separation
   comes purely from the pure-black 0.38-opacity backdrop, not a navy tint). */
:host([data-rui-theme="vision"]) .rui-modal,
:host([data-rui-theme="vision"]) .rui-sheet-panel {
  background: var(--rui-color-surface); border: none;
  border-radius: var(--rui-radius-lg); box-shadow: none;
}
:host([data-rui-theme="vision"]) .rui-modal-overlay,
:host([data-rui-theme="vision"]) .rui-sheet-overlay,
:host([data-rui-theme="vision"]) .rui-sheet-backdrop { background: rgba(0, 0, 0, 0.38); }

/* ---- Steps — filled navy step markers. */
:host([data-rui-theme="vision"]) .rui-steps-item::before { background: var(--rui-color-primary); color: #fff; border: none; font-weight: 600; }

/* ---- Avatar — pale-blue with navy initials. */
:host([data-rui-theme="vision"]) .rui-avatar,
:host([data-rui-theme="vision"]) .rui-avatar-fallback { background: #dbedf8; color: #0b2a63; }

/* ---- Dividers & separators — neutral-3 hairline (UI Block's universal divider
   shade — same token list.scss/table rows/menus all share). */
:host([data-rui-theme="vision"]) .rui-separator { background: var(--rui-color-border); }

/* ---- Lists — hairline uses neutral-3 (not the lighter neutral-2 the base
   rule reaches for); icon/description sizes match UI Block's icon-list/paragraph
   scale. */
/* UI Block lists (bullet / check / icon / link) are FLAT — the list items carry no
   border and no background of their own, only left padding for the marker
   (mixins/list.scss). Aktion's base list item is a bordered white card, which
   reads as a completely different component next to the real thing. */
:host([data-rui-theme="vision"]) .rui-list-item {
  border: none;
  background: transparent;
  border-radius: 0;
  padding: 2px 0;
}
/* UI Block's check-list marker is not a bare glyph: it is a 20px corporate-2 DISC
   with a corporate-6 check inside, sitting 8px from the label
   (check-list.scss: li padding-left 28px, ::before 20px at margin-left -28px).
   Without the disc the list read as a completely different component. */
:host([data-rui-theme="vision"]) .rui-list-icon {
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: #95caeb;                         /* corporate-2 · check-list-icon-background-color */
  color: #003d8f;                              /* corporate-6 · check-list-icon-color */
  font-size: var(--rui-font-size-11);
  line-height: 20px;
  text-align: center;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
}
:host([data-rui-theme="vision"]) .rui-list-item { gap: 8px; align-items: flex-start; }
:host([data-rui-theme="vision"]) .rui-list { gap: 8px; }
:host([data-rui-theme="vision"]) .rui-list-title { font-weight: 400; line-height: 24px; }
:host([data-rui-theme="vision"]) .rui-list-item { line-height: 24px; }   /* 1.717em at 14px */
:host([data-rui-theme="vision"]) .rui-list-description { font-size: var(--rui-font-size-sm); }
:host([data-rui-theme="vision"]) .rui-description-item { border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle); } /* solid, not dashed — no dashed divider exists anywhere in UI Block */
:host([data-rui-theme="vision"]) .rui-text[data-variant="large"] { font-size: var(--rui-font-size-lg); line-height: 24px; } /* paragraph--large */

/* ---- Navigation — active/hover items use a NAVY-at-opacity wash (not a flat
   pale-blue solid), text always stays dark navy (UI Block never recolors nav
   text on hover/active), and every state gets a visible focus ring. */
:host([data-rui-theme="vision"]) .rui-sidebar-item,
:host([data-rui-theme="vision"]) .rui-nav-link {
  color: var(--rui-color-text);
  border-color: transparent;
}
:host([data-rui-theme="vision"]) .rui-sidebar-item:hover,
:host([data-rui-theme="vision"]) .rui-nav-link:hover,
:host([data-rui-theme="vision"]) .rui-navbar-item:hover {
  background: rgba(0, 61, 143, 0.1); color: var(--rui-color-text); border-color: transparent;
}
:host([data-rui-theme="vision"]) .rui-sidebar-item[data-active="true"],
:host([data-rui-theme="vision"]) .rui-nav-link[data-active="true"],
:host([data-rui-theme="vision"]) .rui-navbar-item[data-active="true"] {
  background: rgba(0, 61, 143, 0.15); color: var(--rui-color-text); border-color: transparent; border-radius: 12px;
}
:host([data-rui-theme="vision"]) .rui-sidebar-item[data-active="true"]:hover,
:host([data-rui-theme="vision"]) .rui-nav-link[data-active="true"]:hover { background: rgba(0, 61, 143, 0.2); }
:host([data-rui-theme="vision"]) .rui-sidebar-item:active,
:host([data-rui-theme="vision"]) .rui-nav-link:active { background: rgba(0, 61, 143, 0.3); }
:host([data-rui-theme="vision"]) .rui-sidebar-item:focus-visible,
:host([data-rui-theme="vision"]) .rui-nav-link:focus-visible,
:host([data-rui-theme="vision"]) .rui-navbar-item:focus-visible { outline: 2px solid var(--rui-color-accent); outline-offset: 1px; }
:host([data-rui-theme="vision"]) .rui-sidebar {
  background: var(--rui-color-surface); border: none; box-shadow: 0 2px 8px 0 rgba(113, 128, 149, 0.5);
}
:host([data-rui-theme="vision"]) .rui-sidebar-section-label {
  color: var(--rui-color-text); font-size: var(--rui-font-size-base); font-weight: 600; text-transform: none; letter-spacing: 0;
}
:host([data-rui-theme="vision"]) .rui-sidebar-item-icon { font-size: var(--rui-font-size-20); }
:host([data-rui-theme="vision"]) .rui-app-shell-topbar {
  background: #003d8f; color: #fff; border-bottom: var(--rui-border-width) solid #002659; box-shadow: 0 1px 1px -1px #3364a5;
}
:host([data-rui-theme="vision"]) .rui-page-header { border-bottom: none; } /* flat — separates by colour alone, like cards */
:host([data-rui-theme="vision"]) .rui-page-header-title,
:host([data-rui-theme="vision"]) .rui-section-header-title { color: var(--rui-color-text); }

/* ---- Loaders — skeleton shimmer needs actual contrast (vision's bg and
   surface-muted tokens are identical, so the base gradient was invisible);
   spinner matches UI Block's 1s rotation and switches to a bright/grey ring
   depending on whether it sits on a filled or unfilled button. */
:host([data-rui-theme="vision"]) .rui-skeleton-line {
  background: linear-gradient(90deg, #dbe2e8 0%, #f4f7fa 50%, #dbe2e8 100%);
  background-size: 200% 100%;
}
:host([data-rui-theme="vision"]) .rui-spinner-ring { animation-duration: 1s; }
/* UI Block's loading-circle: 10px dots (1em at font-size 10px), 0.6em apart, pulsing
   between interactive-blue and transparent on a 1.3s loop with 0/0.3/0.5s
   delays, in a 55px-min-width row (loading-circle.scss). */
:host([data-rui-theme="vision"]) .rui-loading-dots-track { min-width: 55px; gap: 6px; }
:host([data-rui-theme="vision"]) .rui-loading-dots-dot {
  width: 10px; height: 10px;
  animation-name: rui-loading-dots-pulse-vision;
  animation-duration: 1.3s;
}
@keyframes rui-loading-dots-pulse-vision {
  0%, 100% { background-color: #1474c4; }
  50% { background-color: transparent; }
}
:host([data-rui-theme="vision"]) .rui-button:not([data-variant="secondary"]):not([data-variant="outline"]):not([data-variant="ghost"]):not([data-variant="link"]) .rui-spinner-ring,
:host([data-rui-theme="vision"]) .rui-button[data-variant="danger"] .rui-spinner-ring {
  border-color: rgba(255, 255, 255, 0.35); border-top-color: #fff;
}
:host([data-rui-theme="vision"]) .rui-button[data-variant="secondary"] .rui-spinner-ring,
:host([data-rui-theme="vision"]) .rui-button[data-variant="outline"] .rui-spinner-ring,
:host([data-rui-theme="vision"]) .rui-button[data-variant="ghost"] .rui-spinner-ring,
:host([data-rui-theme="vision"]) .rui-button[data-variant="link"] .rui-spinner-ring {
  border-color: rgba(113, 128, 149, 0.25); border-top-color: #718095;
}

/* ============================================================================
   Corporate — contemporary enterprise workspace.

   Signatures, each one chosen to be somebody's opposite in this stylesheet:
     - square-shouldered 8px controls, where modern is a 999px pill;
     - flat cards that own a hairline and NO resting shadow, gaining a tinted
       border plus a short-throw shadow on hover, where modern lifts on hover;
     - a 2px teal rail marking the selected tab, active nav item and open
       accordion, where modern fills a segmented pill;
     - a single brand hue (teal) doing primary, link, focus and chart-1, so the
       only other colour on screen is a status;
     - Space Grotesk display type with negative tracking over a 15px Inter body.

   Every rule below is a deliberate departure from the base sheet. Anything the
   theme is happy with (spacing rhythm, icon sizing, layout) is left alone and
   inherits from the tokens.
   ============================================================================ */
:host([data-rui-theme="corporate"]) {
  /* A quiet brand wash anchoring the top of the page — no radial blobs, which
     is the modern theme's move. */
  background:
    linear-gradient(180deg, rgba(15, 118, 110, 0.05) 0%, rgba(15, 118, 110, 0) 240px),
    var(--rui-color-bg);
}
:host([data-rui-theme="corporate"][transparent]),
:host([data-rui-theme="corporate"][transparent="true"]) {
  background: transparent;
}

/* ---- Surfaces — hairline first, shadow only on interaction ---------------- */
:host([data-rui-theme="corporate"]) .rui-card,
:host([data-rui-theme="corporate"]) .rui-stat-card,
:host([data-rui-theme="corporate"]) .rui-chart,
:host([data-rui-theme="corporate"]) .rui-table-wrapper,
:host([data-rui-theme="corporate"]) .rui-accordion-item,
:host([data-rui-theme="corporate"]) .rui-code-block {
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-lg);
  background: var(--rui-color-surface);
  box-shadow: none;
}
:host([data-rui-theme="corporate"]) .rui-card,
:host([data-rui-theme="corporate"]) .rui-stat-card {
  transition:
    border-color var(--rui-motion-base, 170ms) var(--rui-motion-ease, ease),
    box-shadow var(--rui-motion-base, 170ms) var(--rui-motion-ease, ease);
}
:host([data-rui-theme="corporate"]) .rui-card:hover,
:host([data-rui-theme="corporate"]) .rui-stat-card:hover {
  /* No translate: a console is a dense grid, and lifting one tile out of it
     reads as breakage rather than as feedback. */
  border-color: color-mix(in srgb, var(--rui-color-primary) 34%, var(--rui-color-border));
  box-shadow: var(--rui-shadow-sm);
}
:host([data-rui-theme="corporate"]) .rui-modal {
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-lg);
  box-shadow: var(--rui-shadow-lg);
}

/* ---- Type — display face, negative tracking, teal eyebrows --------------- */
:host([data-rui-theme="corporate"]) .rui-card-title,
:host([data-rui-theme="corporate"]) .rui-section-title,
:host([data-rui-theme="corporate"]) .rui-page-header-title,
:host([data-rui-theme="corporate"]) .rui-text[data-variant="title"],
:host([data-rui-theme="corporate"]) .rui-text[data-variant="heading"],
:host([data-rui-theme="corporate"]) .rui-text[data-variant="large-heavy"] {
  font-family: var(--rui-font-family-heading);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--rui-color-text);
}
:host([data-rui-theme="corporate"]) .rui-section-header-eyebrow {
  color: var(--rui-color-primary);
  letter-spacing: 0.1em;
}
:host([data-rui-theme="corporate"]) .rui-page-header {
  border-bottom-width: 2px;
  border-bottom-color: var(--rui-color-border);
}

/* ---- Buttons — 8px, flat, with a darker bottom edge that compresses on press
   (the "keycap"). No lift, no glow: this is a control, not a call to action. */
:host([data-rui-theme="corporate"]) .rui-button {
  border-radius: var(--rui-radius-button);
  font-weight: var(--rui-button-font-weight);
  letter-spacing: var(--rui-button-letter-spacing);
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  border: var(--rui-border-width) solid transparent;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.18);
  transition:
    background var(--rui-motion-fast, 110ms) var(--rui-motion-ease, ease),
    border-color var(--rui-motion-fast, 110ms) var(--rui-motion-ease, ease),
    box-shadow var(--rui-motion-fast, 110ms) var(--rui-motion-ease, ease);
}
:host([data-rui-theme="corporate"]) .rui-button:hover:not(:disabled) {
  background: var(--rui-color-primary-hover);
}
:host([data-rui-theme="corporate"]) .rui-button:active:not(:disabled) {
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.22);
}
:host([data-rui-theme="corporate"]) .rui-button[data-variant="secondary"] {
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  border-color: var(--rui-color-border-control);
  box-shadow: none;
}
:host([data-rui-theme="corporate"]) .rui-button[data-variant="secondary"]:hover:not(:disabled) {
  background: var(--rui-color-surface-muted);
  border-color: var(--rui-color-primary);
  color: var(--rui-color-primary);
}
:host([data-rui-theme="corporate"]) .rui-button[data-variant="ghost"],
:host([data-rui-theme="corporate"]) .rui-button[data-variant="link"] {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--rui-color-link);
}
:host([data-rui-theme="corporate"]) .rui-button[data-variant="ghost"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--rui-color-primary) 9%, transparent);
}
:host([data-rui-theme="corporate"]) .rui-button[data-variant="danger"] {
  background: var(--rui-color-danger);
  color: var(--rui-color-on-danger);
}
:host([data-rui-theme="corporate"]) .rui-button:disabled {
  /* Opacity only — recolouring a disabled button loses which variant it was. */
  opacity: 0.5;
  box-shadow: none;
}

/* ---- Fields — white box, accessible boundary, 3px halo on focus ---------- */
:host([data-rui-theme="corporate"]) .rui-input,
:host([data-rui-theme="corporate"]) .rui-select,
:host([data-rui-theme="corporate"]) .rui-textarea {
  background: var(--rui-color-surface);
  border-color: var(--rui-color-border-control);
  border-radius: var(--rui-radius-input);
  transition:
    border-color var(--rui-motion-fast, 110ms) var(--rui-motion-ease, ease),
    box-shadow var(--rui-motion-fast, 110ms) var(--rui-motion-ease, ease);
}
:host([data-rui-theme="corporate"]) .rui-input:hover:not(:disabled),
:host([data-rui-theme="corporate"]) .rui-select:hover:not(:disabled),
:host([data-rui-theme="corporate"]) .rui-textarea:hover:not(:disabled) {
  border-color: var(--rui-color-primary);
}
:host([data-rui-theme="corporate"]) .rui-input:focus,
:host([data-rui-theme="corporate"]) .rui-select:focus,
:host([data-rui-theme="corporate"]) .rui-textarea:focus {
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 20%, transparent);
}

/* ---- Tabs — a 2px rail under the selected trigger, not a segmented pill --- */
:host([data-rui-theme="corporate"]) .rui-tab-list {
  gap: var(--rui-spacing-l);
  padding: 0;
  background: transparent;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: 0;
}
:host([data-rui-theme="corporate"]) .rui-tab-trigger {
  border: none;
  border-radius: 0;
  padding: 8px 0;
  margin-bottom: -1px;
  font-weight: 500;
  color: var(--rui-color-text-muted);
  border-bottom: 2px solid transparent;
  background: transparent;
}
:host([data-rui-theme="corporate"]) .rui-tab-trigger:hover {
  color: var(--rui-color-text);
  border-bottom-color: var(--rui-color-border-control);
}
:host([data-rui-theme="corporate"]) .rui-tab-trigger[aria-selected="true"] {
  color: var(--rui-color-primary);
  font-weight: 600;
  background: transparent;
  border-bottom-color: var(--rui-color-primary);
  box-shadow: none;
}

/* ---- Navigation — the same 2px rail, turned on its side ------------------ */
:host([data-rui-theme="corporate"]) .rui-nav-link {
  border-radius: var(--rui-radius-sm);
  font-weight: 500;
}
:host([data-rui-theme="corporate"]) .rui-nav-link[data-active="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 10%, transparent);
  color: var(--rui-color-primary);
  border-color: transparent;
  box-shadow: inset 2px 0 0 var(--rui-color-primary);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  font-weight: 600;
}
:host([data-rui-theme="corporate"]) .rui-breadcrumb-link:hover {
  color: var(--rui-color-link-hover);
}

/* ---- Chips — square shoulders, so a Badge never reads as a Button -------- */
:host([data-rui-theme="corporate"]) .rui-tag,
:host([data-rui-theme="corporate"]) .rui-badge,
:host([data-rui-theme="corporate"]) .rui-pill {
  border-radius: var(--rui-radius-sm);
  font-weight: 600;
  letter-spacing: 0.01em;
}
:host([data-rui-theme="corporate"]) .rui-badge[data-variant="primary"] {
  background: color-mix(in srgb, var(--rui-color-primary) 12%, transparent);
  color: var(--rui-color-link);
}

/* ---- Data — sentence-case headers on a muted band, teal row wash ---------
   Uppercase table headers are already the private vision theme's and modern's
   signature; going sentence-case with a 2px rule is how this theme's tables
   read as its own. */
:host([data-rui-theme="corporate"]) .rui-table th {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
  font-weight: 600;
  font-size: var(--rui-font-size-13);
  text-transform: none;
  letter-spacing: 0;
  border-bottom: 2px solid var(--rui-color-border);
}
:host([data-rui-theme="corporate"]) .rui-table td {
  border-bottom-color: var(--rui-color-border-subtle);
}
:host([data-rui-theme="corporate"]) .rui-table tbody tr:hover td {
  background: color-mix(in srgb, var(--rui-color-primary) 6%, transparent);
}
:host([data-rui-theme="corporate"]) .rui-stat-value {
  font-family: var(--rui-font-family-heading);
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--rui-color-text);
}
:host([data-rui-theme="corporate"]) .rui-stat-label {
  color: var(--rui-color-text-muted);
  text-transform: uppercase;
  font-size: var(--rui-font-size-11);
  letter-spacing: 0.08em;
  font-weight: 600;
}

/* ---- Messaging — a 3px status rail on a flat tint, no icon disc chrome --- */
:host([data-rui-theme="corporate"]) .rui-callout {
  border-radius: var(--rui-radius-md);
  border-left-width: 3px;
  border-left-color: var(--rui-color-primary);
  background: var(--rui-color-surface-muted);
}
:host([data-rui-theme="corporate"]) .rui-callout[data-tone="success"] { border-left-color: var(--rui-color-success); }
:host([data-rui-theme="corporate"]) .rui-callout[data-tone="warning"] { border-left-color: var(--rui-color-warning); }
:host([data-rui-theme="corporate"]) .rui-callout[data-tone="danger"]  { border-left-color: var(--rui-color-danger); }
:host([data-rui-theme="corporate"]) .rui-callout[data-tone="info"]    { border-left-color: var(--rui-color-info); }
:host([data-rui-theme="corporate"]) .rui-banner {
  border-radius: 0;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}

/* ---- Progress, steps, separators ---------------------------------------- */
:host([data-rui-theme="corporate"]) .rui-progress-bar {
  background: var(--rui-gradient-accent);
}
:host([data-rui-theme="corporate"]) .rui-steps-item::before {
  border-radius: var(--rui-radius-xs);
  font-weight: 600;
  font-family: var(--rui-font-family-heading);
}
:host([data-rui-theme="corporate"]) .rui-separator {
  background: var(--rui-color-border);
}
:host([data-rui-theme="corporate"]) .rui-link {
  color: var(--rui-color-link);
  font-weight: 500;
  text-underline-offset: 2px;
}
:host([data-rui-theme="corporate"]) .rui-follow-up-button {
  border-radius: var(--rui-radius-button);
  background: var(--rui-color-surface);
  border-color: var(--rui-color-border-control);
  color: var(--rui-color-text);
  font-weight: 500;
  box-shadow: none;
}
:host([data-rui-theme="corporate"]) .rui-follow-up-button:hover {
  border-color: var(--rui-color-primary);
  color: var(--rui-color-primary);
  background: color-mix(in srgb, var(--rui-color-primary) 7%, transparent);
}

/* Modern — clean SaaS dashboard. Light off-white canvas with a whisper-faint
   ambient wash, crisp white cards with generous rounding and feather-soft
   diffuse shadows that lift on hover, an ink (near-black) primary rendered as
   pill buttons, a violet accent, and segmented pill-style tabs. */
:host([data-rui-theme="modern"]) {
  background:
    radial-gradient(60vw 50vw at 100% -5%, rgba(37, 99, 235, 0.06), transparent 60%),
    radial-gradient(55vw 50vw at 0% 105%, rgba(124, 92, 252, 0.06), transparent 60%),
    var(--rui-color-bg);
}
:host([data-rui-theme="modern"][transparent]),
:host([data-rui-theme="modern"][transparent="true"]) {
  background: transparent;
}
:host([data-rui-theme="modern"]) .rui-card,
:host([data-rui-theme="modern"]) .rui-stat-card,
:host([data-rui-theme="modern"]) .rui-callout,
:host([data-rui-theme="modern"]) .rui-chart,
:host([data-rui-theme="modern"]) .rui-table-wrapper,
:host([data-rui-theme="modern"]) .rui-accordion-item,
:host([data-rui-theme="modern"]) .rui-list-item,
:host([data-rui-theme="modern"]) .rui-modal,
:host([data-rui-theme="modern"]) .rui-code-block {
  border: var(--rui-border-width) solid var(--rui-color-border);
  background: var(--rui-color-surface);
  box-shadow: var(--rui-shadow-sm);
}
:host([data-rui-theme="modern"]) .rui-card,
:host([data-rui-theme="modern"]) .rui-stat-card {
  transition: transform 240ms ease, box-shadow 240ms ease;
}
:host([data-rui-theme="modern"]) .rui-card:hover,
:host([data-rui-theme="modern"]) .rui-stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--rui-shadow-md);
}
:host([data-rui-theme="modern"]) .rui-card-title,
:host([data-rui-theme="modern"]) .rui-section-title,
:host([data-rui-theme="modern"]) .rui-page-header-title,
:host([data-rui-theme="modern"]) .rui-text[data-variant="title"],
:host([data-rui-theme="modern"]) .rui-text[data-variant="heading"],
:host([data-rui-theme="modern"]) .rui-text[data-variant="large-heavy"] {
  color: var(--rui-color-text);
  letter-spacing: -0.02em;
  font-weight: 700;
}
:host([data-rui-theme="modern"]) .rui-button {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  border: var(--rui-border-width) solid transparent;
  border-radius: var(--rui-radius-pill);
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(17, 24, 39, 0.12);
  transition: transform 120ms ease, box-shadow 160ms ease, background 140ms ease;
}
:host([data-rui-theme="modern"]) .rui-button:hover:not(:disabled) {
  background: var(--rui-color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(17, 24, 39, 0.18);
}
:host([data-rui-theme="modern"]) .rui-button:active:not(:disabled) {
  transform: translateY(0);
}
:host([data-rui-theme="modern"]) .rui-button[data-variant="secondary"] {
  background: var(--rui-color-surface);
  color: var(--rui-color-text);
  border-color: var(--rui-color-border);
  box-shadow: var(--rui-shadow-sm);
}
:host([data-rui-theme="modern"]) .rui-button[data-variant="secondary"]:hover:not(:disabled) {
  background: var(--rui-color-surface-muted);
}
:host([data-rui-theme="modern"]) .rui-button[data-variant="ghost"] {
  background: transparent;
  color: var(--rui-color-text);
  border-color: transparent;
  box-shadow: none;
}
:host([data-rui-theme="modern"]) .rui-button[data-variant="ghost"]:hover:not(:disabled) {
  background: var(--rui-color-surface-muted);
}
:host([data-rui-theme="modern"]) .rui-input,
:host([data-rui-theme="modern"]) .rui-select,
:host([data-rui-theme="modern"]) .rui-textarea {
  background: var(--rui-color-surface-muted);
  border-color: var(--rui-color-border);
  border-radius: var(--rui-radius-input);
  transition: border-color 140ms ease, box-shadow 160ms ease, background 140ms ease;
}
:host([data-rui-theme="modern"]) .rui-input:focus,
:host([data-rui-theme="modern"]) .rui-select:focus,
:host([data-rui-theme="modern"]) .rui-textarea:focus {
  background: var(--rui-color-surface);
  border-color: var(--rui-color-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--rui-color-accent) 18%, transparent);
}
:host([data-rui-theme="modern"]) .rui-tab-list {
  border-bottom: none;
  gap: 4px;
  padding: 4px;
  background: var(--rui-color-surface-muted);
  border-radius: var(--rui-radius-pill);
  display: inline-flex;
}
:host([data-rui-theme="modern"]) .rui-tab-trigger {
  border: none;
  border-radius: var(--rui-radius-pill);
  padding: 6px 16px;
  font-weight: 600;
  color: var(--rui-color-text-muted);
  transition: background 140ms ease, color 140ms ease;
}
:host([data-rui-theme="modern"]) .rui-tab-trigger:hover {
  color: var(--rui-color-text);
}
:host([data-rui-theme="modern"]) .rui-tab-trigger[aria-selected="true"] {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.14);
}
:host([data-rui-theme="modern"]) .rui-tag,
:host([data-rui-theme="modern"]) .rui-badge {
  border-radius: var(--rui-radius-pill);
  font-weight: 600;
}
:host([data-rui-theme="modern"]) .rui-badge[data-variant="primary"] {
  background: color-mix(in srgb, var(--rui-color-accent) 14%, transparent);
  /* The 14% wash stays keyed to the accent; the label on it does not — this
     theme's accent is 3.66:1 against its own wash, the link token 4.58:1. */
  color: var(--rui-color-link);
}
:host([data-rui-theme="modern"]) .rui-stat-value {
  color: var(--rui-color-text);
  font-weight: 700;
  letter-spacing: -0.03em;
}
:host([data-rui-theme="modern"]) .rui-stat-label {
  color: var(--rui-color-text-muted);
  letter-spacing: 0.01em;
}
:host([data-rui-theme="modern"]) .rui-link {
  color: var(--rui-color-link);
  font-weight: 600;
}
:host([data-rui-theme="modern"]) .rui-table th {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
  font-weight: 600;
  font-size: var(--rui-font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom-color: var(--rui-color-border);
}
:host([data-rui-theme="modern"]) .rui-table td { border-bottom-color: var(--rui-color-border-subtle); }
:host([data-rui-theme="modern"]) .rui-table tbody tr:hover td {
  background: var(--rui-color-surface-muted);
}
:host([data-rui-theme="modern"]) .rui-follow-up-button {
  background: var(--rui-color-surface);
  border-color: var(--rui-color-border);
  color: var(--rui-color-text);
  border-radius: var(--rui-radius-pill);
  font-weight: 600;
  box-shadow: var(--rui-shadow-sm);
  transition: background 140ms ease, border-color 140ms ease, transform 120ms ease;
}
:host([data-rui-theme="modern"]) .rui-follow-up-button:hover {
  background: var(--rui-color-surface-muted);
  border-color: color-mix(in srgb, var(--rui-color-accent) 40%, var(--rui-color-border));
  transform: translateY(-1px);
}
:host([data-rui-theme="modern"]) .rui-steps-item::before {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  font-weight: 700;
}
:host([data-rui-theme="modern"]) .rui-separator {
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
/* disabled is functionally complete in source (no tabindex, no handlers, forced
   closed, aria-disabled) but was visually identical to an enabled menu. */
.rui-dropdown-menu[data-disabled="true"] .rui-dropdown-menu-trigger {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
.rui-dropdown-menu-content {
  position: absolute;
  z-index: var(--rui-z-dropdown);
  min-width: 200px;
  padding: 6px;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-13);
  line-height: 1.2;
}
.rui-menu-item:hover:not(:disabled),
.rui-menu-item:focus-visible {
  background: var(--rui-color-surface-muted);
  outline: none;
}
.rui-menu-item:disabled { opacity: 0.55; cursor: not-allowed; }
.rui-menu-item[data-variant="danger"] { color: var(--rui-color-danger-text); }
.rui-menu-item[data-variant="danger"]:hover:not(:disabled) {
  background: color-mix(in srgb, var(--rui-color-danger) 12%, transparent);
}
.rui-menu-item-icon { width: 14px; display: inline-flex; justify-content: center; }
/* The role="group" / role="none" wrappers MUST be display: contents, or they
   become flex items and break the panel's own column layout and gap. menu.ts
   also sets these inline; this is the permanent home. */
.rui-menu-group { display: contents; }
.rui-menu-custom { display: contents; }
.rui-menu-item-check { width: 14px; display: inline-flex; justify-content: center; }
.rui-menu-item-label { flex: 1; min-width: 0; }
.rui-menu-item-shortcut {
  font-size: var(--rui-font-size-11);
  color: var(--rui-color-text-muted);
  font-family: var(--rui-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.rui-menu-separator {
  height: 1px;
  background: var(--rui-color-border-subtle);
  margin: 4px 0;
}
.rui-menu-label {
  font-size: var(--rui-font-size-11);
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
.rui-popover-content {
  position: absolute;
  z-index: var(--rui-z-popover);
  width: 280px;
  max-width: min(360px, calc(100vw - 32px));
  padding: var(--rui-spacing-m);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-18);
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
  z-index: var(--rui-z-toast);
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
/* Present in the position enum and on the standalone Toast since day one, but
   the STACK had no rule — so Toasts with position "bottom-center" pinned to
   nothing and rendered wherever position: fixed left it (top-left of the
   viewport, over the page's own chrome). column-reverse like the other two
   bottom corners, so the newest toast is the one nearest the viewport edge. */
.rui-toasts[data-position="bottom-center"] { bottom: 16px; left: 50%; transform: translateX(-50%); align-items: center; flex-direction: column-reverse; }
/* The max cap summarises the toasts it hid; without this the +N row is bare
   text floating in the stack. align-self overrides the per-position align-items. */
.rui-toasts-overflow {
  align-self: stretch;
  padding: 4px 10px;
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-surface-muted);
  border: var(--rui-border-width) solid var(--rui-color-border);
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-11);
  text-align: center;
}
.rui-toast {
  display: flex;
  align-items: flex-start;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-s) var(--rui-spacing-m);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
/* A centre-pinned stack has no side to leave by: the sideways default slid it
   away from the axis it is centred on, which reads as the toast drifting off
   course rather than dismissing. Both centres leave the way they arrived —
   towards the edge they are pinned to. */
.rui-toasts[data-position="top-center"] .rui-toast.is-dismissed {
  transform: translateY(-12px);
}
.rui-toasts[data-position="bottom-center"] .rui-toast.is-dismissed {
  transform: translateY(12px);
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
  font-size: var(--rui-font-size-sm);
  /* The disc is filled with a theme token (muted by default, primary/success/
     warning/danger per tone), and in the dark theme those tokens are LIGHT — a
     literal #ffffff glyph disappeared into them. primary-text is the token that
     tracks "readable on a filled brand surface" in both directions. */
  color: var(--rui-color-primary-text);
  background: var(--rui-color-text-muted);
}
.rui-toast-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rui-toast-title { font-weight: 600; font-size: var(--rui-font-size-13); }
.rui-toast-message { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); line-height: 1.45; }
.rui-toast-action { margin-top: 6px; }
.rui-toast-close {
  appearance: none;
  border: none;
  background: transparent;
  font-size: var(--rui-font-size-18);
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
/* primary-text is right for the primary/neutral discs but not for the status ones:
   it is #ffffff in five themes, i.e. 2.54:1 on a success disc and 2.15:1 on a
   warning one. Each toned disc names the ink that matches its own fill. */
.rui-toast[data-tone="success"] .rui-toast-icon { background: var(--rui-color-success); color: var(--rui-color-on-success); }
.rui-toast[data-tone="warning"] .rui-toast-icon { background: var(--rui-color-warning); color: var(--rui-color-on-warning); }
.rui-toast[data-tone="danger"] .rui-toast-icon { background: var(--rui-color-danger); color: var(--rui-color-on-danger); }
.rui-toast[data-tone="info"] .rui-toast-icon { background: var(--rui-color-info); color: var(--rui-color-on-info); }
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
.rui-slider-label { font-size: var(--rui-font-size-13); color: var(--rui-color-text); }
.rui-slider-value {
  font-size: var(--rui-font-size-13);
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
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-surface);
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.rui-number-input:focus-within {
  border-color: var(--rui-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
}
.rui-number-input-prefix,
.rui-number-input-suffix {
  display: flex;
  align-items: center;
  padding: 0 6px;
  white-space: nowrap;
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-sm);
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
  font-size: var(--rui-font-size-lg);
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
  transition: background 150ms ease, color 150ms ease;
}
.rui-number-input-button[data-direction="down"] {
  border-right: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-number-input-button[data-direction="up"] {
  border-left: var(--rui-border-width) solid var(--rui-color-border);
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
.rui-date-picker-label { font-size: var(--rui-font-size-13); color: var(--rui-color-text); }
.rui-date-picker-input {
  appearance: none;
  padding: 8px 12px;
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-surface);
  color: inherit;
  font: inherit;
  font-size: var(--rui-font-size-13);
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
/* The only focusable element is the 1x1 clipped file input, so focus has to be
   shown on the zone or a keyboard user tabs through with no indication at all. */
.rui-file-upload-dropzone:focus-within {
  border-color: var(--rui-color-focus-ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 22%, transparent);
}
.rui-file-upload[data-disabled="true"] { opacity: 0.55; }
.rui-file-upload[data-disabled="true"] .rui-file-upload-dropzone { cursor: not-allowed; }
.rui-file-upload-dropzone.is-dragover {
  border-color: var(--rui-color-primary);
  background: color-mix(in srgb, var(--rui-color-primary) 8%, transparent);
}
.rui-file-upload-filesize { color: var(--rui-color-text-muted); font-size: 0.75rem; margin-left: 6px; }
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
  font-size: var(--rui-font-size-base);
}
.rui-file-upload-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.rui-file-upload-label { font-weight: 600; font-size: var(--rui-font-size-13); }
.rui-file-upload-hint { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  background: var(--rui-color-surface, var(--rui-color-bg-subtle));
}
.rui-file-upload-preview-item {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-s);
}
.rui-file-upload-remove {
  margin-left: auto;
  flex: none;
  border: none;
  background: none;
  cursor: pointer;
  line-height: 1;
  color: var(--rui-color-text-muted);
}
.rui-file-upload-thumbnail {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--rui-radius-sm);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  /* min() so the preferred 200px never becomes a floor that overflows a narrow
     grid cell (and drags the panel out with it). */
  min-width: min(200px, 100%);
}
.rui-combobox[data-disabled="true"] { opacity: 0.55; }
/* The clear button is a direct child of a column flex root, so it would stack
   under the trigger; lift it into the trigger, left of the chevron. */
.rui-combobox-clear {
  position: absolute;
  top: 50%;
  right: 30px;
  transform: translateY(-50%);
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
  color: var(--rui-color-text-muted);
}
.rui-combobox-clear:hover { color: var(--rui-color-text); }
.rui-combobox-trigger {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-s);
  padding: 8px 12px;
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
  border-radius: var(--rui-radius-sm);
  color: inherit;
  font: inherit;
  font-size: var(--rui-font-size-13);
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
.rui-combobox-chevron { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-11); }
.rui-combobox-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: var(--rui-z-dropdown);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-sm);
  padding: 6px 10px;
  font: inherit;
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-13);
}
/* Group heading and unavailable option inside a picker panel. aria-disabled
   rather than the disabled attribute keeps the row arrow-reachable and announced
   as unavailable, so it needs its own visual treatment. */
.rui-combobox-group {
  padding: var(--rui-spacing-xs) var(--rui-spacing-s);
  font-size: var(--rui-font-size-11);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--rui-color-text-muted);
}
.rui-combobox-option[data-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
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
  font-size: var(--rui-font-size-sm);
  text-align: center;
}
.rui-combobox-loading {
  padding: var(--rui-spacing-s);
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-sm);
}

/* ----------------------------------------------------------------------- */
/* Tree / TreeNode                                                         */
/* ----------------------------------------------------------------------- */
.rui-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--rui-font-size-13);
}
.rui-tree-node {
  display: flex;
  flex-direction: column;
}
/* flex, not block: the chevron button is a sibling of the row inside the summary,
   and display: block stacked it above the row. The component also sets this
   inline today; this is the permanent home. */
.rui-tree-node-summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
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
/* disabled is already genuinely inert in source (no href, no onClick, non-button
   tag, aria-disabled), but a permission-gated folder looked identical to a live
   one, so the user had no way to tell why clicking did nothing. */
.rui-tree-node-row[data-disabled="true"] { opacity: 0.5; cursor: default; pointer-events: none; }
/* The toggle is a real button next to the row; strip its UA chrome. */
.rui-tree-node-chevron-button {
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: inherit;
  cursor: pointer;
}
.rui-tree-node-chevron {
  font-size: var(--rui-font-size-10);
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
.rui-tree-node-icon { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); }
.rui-tree-node-row[data-active="true"] .rui-tree-node-icon { color: var(--rui-color-primary); }
.rui-tree-node-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rui-tree-node-badge {
  background: var(--rui-color-surface-muted);
  color: var(--rui-color-text-muted);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: var(--rui-font-size-11);
  font-weight: 600;
}
.rui-tree-node-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 16px;
  border-left: var(--rui-border-width) solid var(--rui-color-border-subtle);
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
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md) var(--rui-radius-md) 0 0;
}
/* The frosted blur moved onto a ::before layer. backdrop-filter on the bar itself
   made it the containing block for every fixed-position descendant, so a Modal in
   the documented actions slot resolved its inset: 0 scrim against the ~56px
   navbar strip instead of the viewport. */
.rui-navbar[data-sticky="true"] {
  position: sticky;
  top: 0;
  z-index: var(--rui-z-sticky);
  background: color-mix(in srgb, var(--rui-color-surface) 92%, transparent);
}
.rui-navbar[data-sticky="true"]::before {
  content: "";
  position: absolute;
  inset: 0;
  backdrop-filter: blur(8px);
  z-index: -1;
  pointer-events: none;
}
.rui-navbar[data-variant="transparent"] {
  background: transparent;
  border-bottom-color: transparent;
}
.rui-navbar-brand {
  font-weight: 700;
  font-size: var(--rui-font-size-15);
  color: var(--rui-color-text);
  display: inline-flex;
  align-items: center;
  gap: var(--rui-spacing-s);
  /* A long brand refused to shrink at 375px and pushed the item row onto extra
     lines, which with sticky pinned a ~180px header over the content. */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  font-size: var(--rui-font-size-13);
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
/* disabled already drops the href, so the entry is neither clickable nor
   focusable — this is the only thing that says so on screen. */
.rui-navbar-item[data-disabled="true"] { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.rui-navbar-item-icon { display: inline-flex; }
/* Burger: hidden above the collapse breakpoint. Mirrors the .rui-navbar2-burger
   pattern. Without these rules the button was permanently visible and the item
   row never collapsed, so the collapsible prop toggled attributes nothing read. */
.rui-navbar-burger {
  display: none;
  appearance: none;
  border: none;
  background: transparent;
  color: var(--rui-color-text);
  font: inherit;
  font-size: var(--rui-font-size-18);
  line-height: 1;
  padding: 6px 10px;
  border-radius: var(--rui-radius-sm);
  cursor: pointer;
  margin-left: auto;
}
.rui-navbar-burger:hover { background: var(--rui-color-surface-muted); }
.rui-navbar-burger:focus-visible { outline: 2px solid var(--rui-color-focus-ring); outline-offset: 2px; }
.rui-navbar-burger-icon { display: inline-flex; }

/* Compact layout shifts for narrow viewports */
${below("sm")} {
  .rui-navbar { flex-wrap: wrap; gap: var(--rui-spacing-s); }
  .rui-navbar-items { width: 100%; }
  .rui-navbar[data-collapsible="true"] .rui-navbar-burger { display: inline-flex; }
  .rui-navbar[data-collapsible="true"] .rui-navbar-items { display: none; }
  .rui-navbar[data-collapsible="true"][data-menu-open="true"] .rui-navbar-items {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }
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
/* default/primary/neutral are all in the shared TONE_ENUM (content.ts:36) —
   primary is even the documented default — and none of the three had a rule, so
   tone: "neutral" on a quiet inline spinner stayed brand-coloured. */
.rui-spinner[data-tone="default"] .rui-spinner-ring,
.rui-spinner[data-tone="primary"] .rui-spinner-ring { border-color: color-mix(in srgb, var(--rui-color-primary) 25%, transparent); border-top-color: var(--rui-color-primary); }
.rui-spinner[data-tone="neutral"] .rui-spinner-ring { border-color: color-mix(in srgb, var(--rui-color-text-muted) 25%, transparent); border-top-color: var(--rui-color-text-muted); }
.rui-spinner[data-tone="success"] .rui-spinner-ring { border-color: color-mix(in srgb, var(--rui-color-success) 25%, transparent); border-top-color: var(--rui-color-success); }
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
.rui-sparkline-empty { color: var(--rui-color-text-muted); }
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
/* primary and info are in the shared SURFACE_TONES enum and rendered identically
   to the default; the enum cannot shrink because ListItem shares it. */
.rui-stat-card[data-tone="primary"] .rui-stat-value { color: var(--rui-color-primary); }
.rui-stat-card[data-tone="info"] .rui-stat-value { color: var(--rui-color-info-text); }
.rui-stat-card[data-tone="success"] .rui-stat-value { color: var(--rui-color-success-text); }
.rui-stat-card[data-tone="warning"] .rui-stat-value { color: var(--rui-color-warning-text); }
.rui-stat-card[data-tone="danger"] .rui-stat-value { color: var(--rui-color-danger-text); }

/* MultiSelect ---------------------------------------------------------- */
.rui-multiselect {
  position: relative;
  width: 100%;
  font-size: var(--rui-font-size-base);
}
.rui-multiselect-trigger {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rui-spacing-s, 8px);
  padding: 6px var(--rui-spacing-s, 8px);
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
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
  z-index: var(--rui-z-dropdown);
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  box-shadow: var(--rui-shadow-md);
  padding: var(--rui-spacing-xs, 4px);
}
.rui-multiselect[data-open="true"] .rui-multiselect-panel { display: block; }
.rui-multiselect-filter {
  width: 100%;
  padding: 6px 8px;
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: 4px;
  flex-shrink: 0;
}
.rui-multiselect-option[data-selected="true"] .rui-multiselect-option-check {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
/* Group-level and per-option disabled both emit the attribute; nothing dimmed the
   segment, so a locked option still looked clickable. */
.rui-segmented-control-option:disabled { opacity: .45; cursor: not-allowed; }
.rui-segmented-control-option:disabled:hover { color: var(--rui-color-text-muted); }

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
  border-top: var(--rui-border-width) solid var(--rui-color-border);
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
/* flex-direction: row is the point of the rule — the base .rui-tabs is a column,
   so "sidebar-style tabs" rendered as a narrow strip ABOVE the panels with a
   dangling right-hand border, and flex: 1 on the panels then ate the height. */
.rui-tabs[data-orientation="vertical"] {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: var(--rui-spacing-m, 12px);
}
.rui-tabs[data-orientation="vertical"] .rui-tab-list {
  flex-direction: column;
  border-bottom: 0;
  border-right: var(--rui-border-width) solid var(--rui-color-border);
  padding-right: var(--rui-spacing-s, 8px);
  min-width: 140px;
}
.rui-tabs[data-orientation="vertical"] .rui-tab-trigger {
  justify-content: flex-start;
  text-align: left;
  /* The accent moves to the LEADING edge. A bottom rule under a stacked item
     reads as a divider between two items rather than as "this one is current",
     and it collided with the list's own right-hand border. */
  border-bottom: none;
  margin-bottom: 0;
  border-left: 2px solid transparent;
}
.rui-tabs[data-orientation="vertical"] .rui-tab-trigger[aria-selected="true"] {
  border-left-color: var(--rui-color-primary);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-progress-segment[data-filled="true"] {
  background: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
}
/* Same 22% tint the bar variant's buffer uses, so buffered reads identically in
   both variants. Never collides with filled — the render only marks segments
   past the filled ones. */
.rui-progress-segment[data-buffered="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 22%, var(--rui-color-surface-muted));
  border-color: color-mix(in srgb, var(--rui-color-primary) 32%, var(--rui-color-border));
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
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
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
  border: var(--rui-border-width) solid transparent;
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

/* Syntax highlighting tokens (VIII.3) ----------------------------------- */
.rui-hl-keyword { color: var(--rui-hl-keyword); font-weight: 600; }
.rui-hl-string  { color: var(--rui-hl-string); }
.rui-hl-number  { color: var(--rui-hl-number); }
.rui-hl-comment { color: var(--rui-hl-comment); font-style: italic; }
.rui-hl-fn      { color: var(--rui-hl-fn); }
.rui-hl-punct   { color: var(--rui-hl-punct); }
.rui-hl-tag     { color: var(--rui-hl-tag); }
.rui-hl-attr    { color: var(--rui-hl-attr); }

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
/* The duplicate rui-skeleton-shimmer keyframes that used to live here is gone.
   Two definitions of one name shipped in the same sheet and the later silently
   won, so the 200%/-200% travel declared next to .rui-skeleton-line — which is
   sized background-size: 200% for exactly that travel — never took effect, and
   editing that block appeared to do nothing. */
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
/* The base .rui-table th rule sets position: sticky unconditionally, so the
   default sticky: false still produced a positioned header that painted over a
   tooltip opened in the first data row. DataGrid already has this counterpart. */
.rui-table-wrapper[data-sticky="false"] thead th { position: static; }
.rui-table td[data-align="center"], .rui-table th[data-align="center"] { text-align: center; }
.rui-table td[data-align="right"], .rui-table th[data-align="right"] { text-align: right; }
.rui-table td[data-align="left"], .rui-table th[data-align="left"] { text-align: left; }

/* Clickable cells (Col onClick) — both Table and DataGrid. The whole cell
   is an accessible button; show affordance + a keyboard focus ring. */
.rui-table td[data-clickable="true"],
.rui-data-grid-table td[data-clickable="true"] {
  cursor: pointer;
}
.rui-table td[data-clickable="true"]:hover,
.rui-data-grid-table td[data-clickable="true"]:hover {
  background: var(--rui-color-surface-hover);
}
.rui-table td[data-clickable="true"]:focus-visible,
.rui-data-grid-table td[data-clickable="true"]:focus-visible {
  outline: 2px solid var(--rui-color-primary, #6366f1);
  outline-offset: -2px;
}

/* Pagination summary + per-page selector ------------------------------ */
/* Single root definition. display/align-items/gap/flex-wrap are the values that
   already shipped (this rule won on source order); padding and border-radius are
   carried over from the earlier duplicate, which had no competitor for them. */
.rui-pagination {
  display: flex;
  align-items: center;
  gap: var(--rui-spacing-m);
  flex-wrap: wrap;
  padding: 4px;
  border-radius: var(--rui-radius-sm);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  z-index: var(--rui-z-toast);
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
/* background-clip: text only shows through a transparent text fill, and the
   opaque filled colour painted straight over the gradient — so a half read as a
   whole for every icon family without a real half glyph. Scoped to synthetic
   halves on purpose: the star family HAS a half glyph, and transparent fill
   would erase it. */
.rui-rating-star[data-fill="half"][data-half-glyph="synthetic"] {
  background-image: linear-gradient(90deg,
    var(--rui-rating-color) 50%, var(--rui-color-border) 50%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

/* Steps active state -------------------------------------------------- */
.rui-steps-item[data-active="true"] {
  font-weight: 600;
}
/* The dead ::marker rule that used to sit here is gone — list-style: none means
   there is no marker box, so the active accent never rendered. The badge is a
   ::before, so the ring goes there instead. */
.rui-steps-item[data-active="true"]::before {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-primary) 25%, transparent);
}
.rui-steps-item[data-active="true"] .rui-steps-title { color: var(--rui-color-text); }

/* ====================================================================== */
/* Advanced components (DataGrid, CalendarView, Carousel, Media, ...)    */
/* ====================================================================== */

/* DataGrid ------------------------------------------------------------ */
.rui-data-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  /* One source for the header band's fill: the header cells paint it, and so do
     the two things that overlay them (the column-settings button and the edge
     fades behind the scroll arrows). A theme that restyles the head only has to
     move this token. */
  --rui-dg-head-bg: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, #fff)));
  --rui-dg-menu-w: 28px;
}
.rui-data-grid-bulk {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--rui-color-primary) 8%, var(--rui-color-surface, #fff));
  border: var(--rui-border-width) solid color-mix(in srgb, var(--rui-color-primary) 25%, var(--rui-color-border));
  border-radius: var(--rui-radius-md, 8px);
  font-size: var(--rui-font-size-13);
}
.rui-data-grid-bulk-count {
  font-weight: 600;
  color: var(--rui-color-primary);
}
.rui-data-grid-toolbar { display: flex; justify-content: flex-end; padding: 6px 0; }
.rui-data-grid-export {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: var(--rui-radius-md, 8px);
  border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface);
  cursor: pointer; font-size: 0.85rem;
}
.rui-data-grid-export:hover { border-color: var(--rui-color-primary); color: var(--rui-color-primary); }
.rui-data-grid-bulk-tools {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
/* The non-scrolling frame. Anything pinned to an edge of the visible port —
   scroll arrows, the column-settings button, the edge fades — is positioned
   against THIS box, because an absolutely-positioned child of a scroll
   container is positioned against its content and therefore scrolls away. */
.rui-data-grid-viewport {
  position: relative;
  min-width: 0;
  max-width: 100%;
}
.rui-data-grid-scroll {
  position: relative;
  overflow: auto;
  max-width: 100%;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-data-grid-scroll:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: -2px;
}
.rui-data-grid-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--rui-font-size-base);
}
/* Fixed layout is what makes a drag-resize honest: the declared column width
   wins over the content's natural width, so a narrowed column truncates instead
   of shoving its neighbours sideways. Only switched on once every column has a
   measured width ('data-fixed-layout') — see 'measureColumns'. */
.rui-data-grid[data-fixed-layout="true"] .rui-data-grid-table { table-layout: fixed; }
.rui-data-grid[data-resizable="true"] .rui-data-grid-table thead th,
.rui-data-grid[data-resizable="true"] .rui-data-grid-table tbody td {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The clip has to reach the cell's own content too: a flex Row inside a cell
   would otherwise refuse to shrink past its children and spill out again. */
.rui-data-grid[data-resizable="true"] .rui-data-grid-table tbody td > * { min-width: 0; max-width: 100%; }
/* Slack absorber (see 'buildColGroup'). Zero-width whenever the columns already
   fill the port, so it is invisible in every normal state. */
.rui-data-grid-filler { padding: 0 !important; width: auto; }
.rui-data-grid-caption {
  text-align: left;
  caption-side: top;
  padding: 12px 14px 8px;
  font-weight: 600;
  font-size: var(--rui-font-size-base);
  color: var(--rui-color-text);
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-data-grid-table thead th {
  position: sticky;
  top: 0;
  background: var(--rui-dg-head-bg);
  z-index: 2;
  text-align: left;
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--rui-color-text-muted);
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  padding: 10px 12px;
  white-space: nowrap;
}
.rui-data-grid-table thead th[data-align="left"] { text-align: left; }
.rui-data-grid-table thead th[data-align="right"] { text-align: right; }
.rui-data-grid-table thead th[data-align="center"] { text-align: center; }
.rui-data-grid-table thead th[data-active="true"] { color: var(--rui-color-primary); }
/* Frozen first column. The three sticky layers must be ordered
   body-frozen < header-row < header-corner, or the frozen column paints over
   the sticky header when you scroll down. It previously read 3 / 2 / 4, so the
   body cells (3) beat the header (2) and slid across it. */
.rui-data-grid[data-sticky-first="true"] tbody td:first-child,
.rui-data-grid[data-sticky-first="true"] thead th:first-child {
  position: sticky;
  left: 0;
  background: var(--rui-color-surface, var(--rui-color-bg));
  z-index: 1;
  box-shadow: 1px 0 0 var(--rui-color-border);
}
/* The corner cell is in both sticky axes, so it has to beat the header row. */
.rui-data-grid[data-sticky-first="true"] thead th:first-child { z-index: 3; }
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
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  vertical-align: middle;
  color: var(--rui-color-text);
}
.rui-data-grid[data-density="compact"] .rui-data-grid-table thead th,
.rui-data-grid[data-density="compact"] .rui-data-grid-table tbody td { padding: 6px 10px; }
/* text-align: right to match Table — swapping Table for DataGrid to gain sorting
   used to silently left-align every money column. */
.rui-data-grid-table tbody td[data-format="number"],
.rui-data-grid-table tbody td[data-format="currency"] { text-align: right; font-variant-numeric: tabular-nums; }
/* Col(align:) is the author's explicit answer, so it has to out-rank the
   format-derived default above — hence these come AFTER it (same specificity,
   later wins). Table already worked this way; DataGrid declared its align rules
   first and had no left rule at all, so a numeric column that asked for
   align: left was silently right-aligned. That is the shape a count column
   wants: "2 groups" is a label with a number in it, not money to compare down
   the column. Keep tabular-nums on the right-aligned case only. */
.rui-data-grid-table tbody td[data-align="left"] { text-align: left; font-variant-numeric: normal; }
.rui-data-grid-table tbody td[data-align="right"] { text-align: right; font-variant-numeric: tabular-nums; }
.rui-data-grid-table tbody td[data-align="center"] { text-align: center; }
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
  font-size: var(--rui-font-size-11);
  opacity: 0.55;
}
th[data-active="true"] .rui-data-grid-sort-icon { opacity: 1; }
.rui-data-grid-filter-row td {
  padding: 6px 10px 10px;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 2%, var(--rui-color-surface, #fff)));
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-data-grid-filter {
  width: 100%;
  font-size: var(--rui-font-size-sm);
  padding: 5px 10px;
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-base);
}
/* A failed fetch has to read as an error, not as "no results". */
.rui-data-grid-empty.rui-data-grid-error { color: var(--rui-color-danger-text); }
.rui-data-grid-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 2px 4px;
  font-size: var(--rui-font-size-13);
}
.rui-data-grid-footer-summary { color: var(--rui-color-text-muted); }
.rui-data-grid-per-page { font: inherit; padding: 2px 6px; }
.rui-data-grid-footer-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rui-data-grid-page-button {
  border: var(--rui-border-width) solid var(--rui-color-border);
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

/* DataGrid — highlight on hover */
.rui-data-grid[data-highlight-hover="true"] tbody tr:hover td {
  background: var(--rui-color-surface-muted);
}
.rui-data-grid[data-highlight-hover="false"] tbody tr:hover td {
  background: inherit;
}

/* DataGrid — row numbers */
.rui-data-grid-cell-rownum {
  width: 42px;
  padding-left: 12px;
  padding-right: 4px;
  color: var(--rui-color-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  user-select: none;
}

/* DataGrid — cell truncation (wrapCells=false) */
.rui-data-grid[data-nowrap="true"] .rui-data-grid-table tbody td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.rui-data-grid[data-nowrap="true"] .rui-data-grid-table tbody td[data-wrap="true"] {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  max-width: none;
}

/* DataGrid — pinned columns: sticky with a subtle shadow separator.
   Pinned cells must be fully opaque so scrolled content doesn't bleed through,
   including on striped/selected rows that normally use semi-transparent tints. */
.rui-data-grid-table th[data-pinned="true"],
.rui-data-grid-table td[data-pinned="true"] {
  position: sticky;
  z-index: 2;
  background: var(--rui-color-surface, var(--rui-color-bg));
  box-shadow: 1px 0 0 var(--rui-color-border);
}
.rui-data-grid-table thead th[data-pinned="true"] { z-index: 4; }
/* A pinned cell has to be opaque, but it must be opaque in ITS OWN row's colour —
   inheriting the plain surface left a pale stripe down the pinned columns of the
   header and the filter row, which read as a rendering seam. */
.rui-data-grid-table thead th[data-pinned="true"] { background: var(--rui-dg-head-bg); }
.rui-data-grid-filter-row td[data-pinned="true"] {
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 2%, var(--rui-color-surface, #fff)));
}
.rui-data-grid[data-striped="true"] tbody tr:nth-child(even) td[data-pinned="true"] {
  background: color-mix(in srgb, var(--rui-color-text) 2%, var(--rui-color-surface, var(--rui-color-bg)));
}
.rui-data-grid-table tbody tr[data-selected="true"] td[data-pinned="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 10%, var(--rui-color-surface, var(--rui-color-bg)));
}
/* Hover has to reach a pinned cell too, or the pinned block stays inert while
   the rest of the row lights up. */
.rui-data-grid[data-highlight-hover="true"] tbody tr:hover td[data-pinned="true"] {
  background: color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, var(--rui-color-bg)));
}

/* DataGrid — toolbar & global search */
.rui-data-grid-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.rui-data-grid-toolbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rui-data-grid-global-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface);
  max-width: 320px;
  flex: 1;
}
.rui-data-grid-search-icon {
  color: var(--rui-color-text-muted);
  flex: 0 0 auto;
  font-size: 13px;
}
.rui-data-grid-search-input {
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: var(--rui-font-size-13);
  color: var(--rui-color-text);
  width: 100%;
  min-width: 0;
}
.rui-data-grid-search-input::placeholder { color: var(--rui-color-text-muted); }

/* DataGrid — column settings.
   An overlay on the header band, NOT a column: it is a child of the
   (non-scrolling) viewport, so it takes part in no table layout — the last
   column keeps its natural width — and it stays pinned to the right edge while
   the columns scroll under it. Only ever covers the header, never a data cell,
   and the header's last cell reserves room for it below. */
.rui-data-grid-col-menu {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 6;
  height: var(--rui-dg-head-h, 40px);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
  padding-left: 14px;
  /* Fades the header label out from under the button instead of chopping it. */
  background: linear-gradient(to right, transparent, var(--rui-dg-head-bg) 60%);
  /* The fade must not swallow clicks meant for the header cell underneath it —
     the last column's sort button reaches to within a few pixels of here. Only
     the controls themselves take pointer input. */
  pointer-events: none;
}
.rui-data-grid-col-menu-btn,
.rui-data-grid-col-panel { pointer-events: auto; }
/* When the right-hand chevron is showing as well, the scrim has to reach far
   enough left to sit behind both controls — otherwise the chevron floats on top
   of a header label with nothing to explain it. */
.rui-data-grid[data-col-menu="true"] .rui-data-grid-viewport[data-overflow-x="true"]:not([data-at-end]) .rui-data-grid-col-menu {
  padding-left: calc(var(--rui-dg-menu-w) + 24px);
}
/* Reserve room in the HEADER only. Body cells are untouched, so the column's
   content width and its alignment with every other column are unaffected —
   under fixed layout this changes no width at all, it just keeps the label from
   sliding under the button. */
.rui-data-grid[data-col-menu="true"] .rui-data-grid-table thead th[data-last="true"] {
  padding-right: calc(var(--rui-dg-menu-w) + 14px);
}
.rui-data-grid-col-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--rui-dg-menu-w);
  height: var(--rui-dg-menu-w);
  padding: 0;
  border-radius: var(--rui-radius-sm, 4px);
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--rui-color-text-muted, var(--rui-color-text));
  font-size: 0.9rem;
  transition: color 0.15s, background 0.15s;
}
.rui-data-grid-col-menu-btn:hover,
.rui-data-grid-col-menu-btn[aria-expanded="true"] {
  color: var(--rui-color-primary);
  background: color-mix(in srgb, var(--rui-color-primary) 10%, transparent);
}
.rui-data-grid-col-menu-btn:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: 1px;
}
.rui-data-grid-col-panel {
  /* Closed by default, and by ATTRIBUTE rather than inline style: the floating
     layer promotes this panel with the popover API, and an inline
     'display: none' would outrank '[popover]''s own visibility. */
  display: none;
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 20;
  min-width: 260px;
  max-height: 420px;
  overflow-y: auto;
  background: var(--rui-color-surface, #fff);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  box-shadow: var(--rui-shadow-lg, 0 4px 16px rgba(0,0,0,0.12));
}
.rui-data-grid-col-panel[data-open="true"] { display: flex; flex-direction: column; }
/* The head is a title + sub-heading block with the close control pinned to the
   top-right corner, so align-items:flex-start -- centring would drop the x to
   the middle of a two-line heading. */
.rui-data-grid-col-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
}
.rui-data-grid-col-panel-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rui-data-grid-col-panel-title {
  font-weight: 700;
  font-size: var(--rui-font-size-base);
  line-height: 1.35;
}
.rui-data-grid-col-panel-subtitle {
  font-weight: 400;
  font-size: var(--rui-font-size-base);
  line-height: 1.35;
  color: var(--rui-color-text);
}
/* Reset moved out of the header and under the list: it is the least-used control
   in the panel and sat next to the close button, where a mis-click threw away a
   layout instead of dismissing a popup. */
.rui-data-grid-col-panel-footer {
  display: flex;
  align-items: center;
  padding: 10px 16px 14px;
}
.rui-data-grid-col-panel-reset {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  font-size: var(--rui-font-size-base);
  color: var(--rui-color-link, var(--rui-color-primary));
  padding: 4px 6px;
  margin-left: -6px;
  border-radius: var(--rui-radius-sm, 4px);
}
.rui-data-grid-col-panel-reset:hover { background: color-mix(in srgb, var(--rui-color-primary) 8%, transparent); }
.rui-data-grid-col-panel-reset-icon { font-size: var(--rui-font-size-18); }
.rui-data-grid-col-panel-close {
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--rui-font-size-24);
  line-height: 1;
  color: var(--rui-color-text);
  padding: 0 2px;
  border-radius: var(--rui-radius-sm, 4px);
  margin-left: 4px;
  flex-shrink: 0;
}
.rui-data-grid-col-panel-close:hover { color: var(--rui-color-text); background: color-mix(in srgb, var(--rui-color-text) 6%, transparent); }
.rui-data-grid-col-panel-list {
  padding: 2px 0;
}
/* The boundary between pinned and unpinned columns, and a real one: neither a
   drag nor an arrow key crosses it — only the pin button does. */
.rui-data-grid-col-panel-divider {
  height: var(--rui-border-width);
  background: var(--rui-color-border);
  margin: 6px 0;
}
.rui-data-grid-col-panel-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 16px;
  cursor: grab;
  transition: background 0.15s;
  user-select: none;
}
.rui-data-grid-col-panel-row:hover { background: var(--rui-color-surface-muted); }
/* While a reorder is in flight the rows are moved by transform, so nothing in
   this list may reflow: the dragged row tracks the pointer 1:1 (no transition,
   or it would lag behind the cursor) and the rows it displaces glide by exactly
   one row-height. The old rule instead drew a 2px border-top on whichever row
   was hovered, which both nudged the list 2px every time it moved and pointed at
   the wrong gap whenever the drag was going upwards. */
.rui-data-grid-col-panel-list.rui-data-grid-col-reordering { cursor: grabbing; }
.rui-data-grid-col-panel-row.rui-data-grid-col-shifting {
  transition: transform 0.16s ease;
}
.rui-data-grid-col-panel-row.rui-data-grid-col-dragging {
  position: relative;
  z-index: 2;
  cursor: grabbing;
  background: var(--rui-color-surface);
  box-shadow: var(--rui-shadow-md, 0 2px 8px rgba(0, 0, 0, 0.15));
  border-radius: var(--rui-radius-sm, 4px);
}
/* The lifted row must not also take the hover tint, or it flips shade as the
   pointer crosses the rows underneath it. */
.rui-data-grid-col-panel-row.rui-data-grid-col-dragging:hover {
  background: var(--rui-color-surface);
}
@media (prefers-reduced-motion: reduce) {
  .rui-data-grid-col-panel-row.rui-data-grid-col-shifting { transition: none; }
}
.rui-data-grid-col-panel-handle {
  color: var(--rui-color-text-muted);
  font-size: 20px;
  cursor: grab;
  flex: 0 0 auto;
  line-height: 1;
  /* A real <button> now, so the keyboard can reorder too — strip the UA chrome. */
  border: none;
  background: none;
  padding: 0 2px;
  font-family: inherit;
  border-radius: var(--rui-radius-sm, 4px);
  /* The handle is the touch drag affordance, so it — and only it — opts out of
     the browser's panning; the rest of the row keeps scrolling the list. */
  touch-action: none;
}
.rui-data-grid-col-panel-handle:focus-visible {
  outline: 2px solid var(--rui-color-focus, var(--rui-color-primary));
  outline-offset: 1px;
  color: var(--rui-color-text);
}
/* Describes the arrow-key gesture to screen readers without taking layout. */
.rui-data-grid-col-panel-hint {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.rui-data-grid-col-panel-cb {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  accent-color: var(--rui-color-primary);
  cursor: pointer;
}
.rui-data-grid-col-panel-label {
  flex: 1;
  font-size: var(--rui-font-size-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rui-data-grid-col-panel-pin {
  flex: 0 0 auto;
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px;
  border-radius: var(--rui-radius-sm, 4px);
  color: var(--rui-color-text-muted);
  font-size: 13px;
  line-height: 1;
  display: flex;
  align-items: center;
  opacity: 0.7;
}
.rui-data-grid-col-panel-pin:hover { color: var(--rui-color-primary); opacity: 1; }
/* Font Awesome Free ships thumbtack in Solid only — there is no outline cut to
   pair it with — so the pinned/unpinned distinction is carried by weight of
   colour rather than by two glyphs: a full-strength primary pin against a muted
   one. Same silhouette, unmistakably different state. */
.rui-data-grid-col-panel-pin[data-active="true"] {
  color: var(--rui-color-primary);
  opacity: 1;
}
.rui-data-grid-col-panel-pin-icon { font-size: var(--rui-font-size-18); }
/* The last visible column cannot be hidden, and the control says so rather than
   swallowing the click. */
.rui-data-grid-col-panel-cb:disabled {
  cursor: not-allowed;
  border-color: var(--rui-color-border);
  opacity: 0.85;
}
.rui-data-grid-col-panel-cb:disabled:checked {
  border-color: var(--rui-color-border);
  box-shadow: none;
  background: var(--rui-color-surface-muted);
}
.rui-data-grid-col-panel-cb:disabled:checked::after { border-color: var(--rui-color-text-muted); }
/* columnMenuButton:false hides the TRIGGER, never the wrapper: on the popover
   path the panel is still a child of that wrapper, so display:none on it took the
   panel down too -- the menu opened into nothing. The wrapper is absolutely
   positioned and now empty, so it costs no space either way. */
.rui-data-grid-col-menu[data-hidden="true"] .rui-data-grid-col-menu-btn { display: none; }

/* DataGrid — column resize handle.
   The visible bar is 3px via ::after, but the click target is 12px wide so the
   user does not have to hit a 3px sliver. The bar appears on header-row hover
   (not just handle hover) so all dividers light up at once. The grab area stops
   short of the cell's bottom edge so it cannot swallow a click meant for the
   sort button of the column next door. */
.rui-data-grid-resize-handle {
  position: absolute;
  top: 0;
  /* Wholly INSIDE its own header cell. It used to straddle the boundary
     ('right: -6px'), and both halves of that were unreachable: each 'th' is
     sticky, so it is its own stacking context and the NEXT header cell — later in
     the document, same z-index — painted over the overhang, swallowing every
     pointerdown aimed at the divider. The clip that makes a resized cell
     truncate then cut the overhang off visually as well. The grab area now
     reaches 12px to the LEFT of the boundary and the bar sits on it. */
  right: 0;
  bottom: 0;
  width: 12px;
  cursor: col-resize;
  z-index: 4;
  user-select: none;
  touch-action: none;
  background: transparent;
}
.rui-data-grid-resize-handle::after {
  content: "";
  position: absolute;
  top: 4px;
  bottom: 4px;
  right: 0;
  width: 3px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.15s;
}
.rui-data-grid-table thead th { position: relative; }
/* Show the bar when any part of the header row is hovered */
.rui-data-grid-table thead tr:hover .rui-data-grid-resize-handle::after {
  background: var(--rui-color-border);
}
.rui-data-grid-resize-handle:hover::after,
.rui-data-grid-resize-handle:focus-visible::after,
.rui-data-grid-resize-handle.rui-data-grid-resize-active::after {
  background: var(--rui-color-primary);
  width: 3px;
}
.rui-data-grid-resize-handle:focus-visible { outline: none; }
/* While a drag is live the pointer is captured, so the bar is the only feedback
   the user gets — keep it lit across the whole header height. */
.rui-data-grid-resize-handle.rui-data-grid-resize-active::after { top: 0; bottom: 0; }
/* The last column's divider sits under the settings overlay, which is
   'pointer-events: none' apart from its button — so the divider stays grabbable.
   ('right: 0' resolves against the cell's padding box, so the reserve the header
   adds for the button does not move the handle inwards.) */

/* DataGrid — scroll hint.
   Two things say "there is more sideways": a soft fade at whichever edge has
   content behind it, and a small chevron parked in the HEADER band. The chevron
   deliberately never sits over a data cell — it is 20px, vertically centred on
   the header row, and inset far enough to land in the first/last cell's own
   padding. Both edges can show at once when the table is scrolled to neither
   end. */
.rui-data-grid-viewport::before,
.rui-data-grid-viewport::after {
  content: "";
  position: absolute;
  top: 44px;
  bottom: 0;
  width: 24px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 3;
}
.rui-data-grid-viewport::before {
  left: 0;
  background: linear-gradient(to right, color-mix(in srgb, var(--rui-color-text) 12%, transparent), transparent);
}
.rui-data-grid-viewport::after {
  right: 0;
  background: linear-gradient(to left, color-mix(in srgb, var(--rui-color-text) 12%, transparent), transparent);
}
.rui-data-grid-viewport[data-overflow-x="true"]:not([data-at-start])::before { opacity: 1; }
.rui-data-grid-viewport[data-overflow-x="true"]:not([data-at-end])::after { opacity: 1; }
.rui-data-grid-scroll-arrow {
  display: none;
  position: absolute;
  top: calc(var(--rui-dg-head-h, 40px) / 2);
  transform: translateY(-50%);
  z-index: 7;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: 999px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  color: var(--rui-color-text-muted);
  background: var(--rui-color-surface, #fff);
  transition: color 0.15s, border-color 0.15s;
}
.rui-data-grid-scroll-arrow:hover {
  color: var(--rui-color-primary);
  border-color: var(--rui-color-primary);
}
.rui-data-grid-viewport[data-overflow-x="true"]:not([data-at-start]) .rui-data-grid-scroll-arrow-left,
.rui-data-grid-viewport[data-overflow-x="true"]:not([data-at-end]) .rui-data-grid-scroll-arrow-right {
  display: inline-flex;
}
.rui-data-grid-scroll-arrow-left { left: 3px; }
.rui-data-grid-scroll-arrow-right { right: 3px; }
/* The settings button owns the top-right corner, so the right chevron steps
   aside rather than stacking on top of it. */
.rui-data-grid[data-col-menu="true"] .rui-data-grid-scroll-arrow-right {
  right: calc(var(--rui-dg-menu-w) + 8px);
}
.rui-data-grid-scroll-arrow-icon { font-size: 10px; }

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
.rui-calendar-nav { display: flex; align-items: center; gap: 4px; }
.rui-calendar-title {
  font-weight: 700;
  font-size: var(--rui-font-size-15);
  color: var(--rui-color-text);
}
.rui-calendar-weekrow {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  padding: 0 1px;
}
.rui-calendar-weekday {
  padding: 6px 8px;
  font-size: var(--rui-font-size-11);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-text-muted);
  text-align: left;
}
.rui-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  background: var(--rui-color-border);
  border: var(--rui-border-width) solid var(--rui-color-border);
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
/* Day cells became div role=gridcell (so event chips could be real buttons
   inside them) and lost the UA focus ring the old button had, leaving the
   keyboard grid navigation invisible. */
.rui-calendar-day:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: -2px;
  z-index: 1;
}
.rui-calendar-day[data-selected="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 18%, var(--rui-color-surface, var(--rui-color-bg)));
  /* Weight + ring so selection is not signalled by fill alone; today keeps the
     same inset ring, so the two are told apart by the bolder number. */
  font-weight: 700;
  box-shadow: inset 0 0 0 2px var(--rui-color-primary);
}
.rui-calendar-daynumber {
  font-weight: 700;
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-11);
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--rui-color-primary) 18%, transparent);
  color: var(--rui-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
}
.rui-calendar-event[data-tone="success"] { background: color-mix(in srgb, var(--rui-color-success, #10b981) 18%, transparent); color: var(--rui-color-success-text); }
.rui-calendar-event[data-tone="warning"] { background: color-mix(in srgb, var(--rui-color-warning, #f59e0b) 18%, transparent); color: var(--rui-color-warning-text); }
.rui-calendar-event[data-tone="danger"] { background: color-mix(in srgb, var(--rui-color-danger, #ef4444) 18%, transparent); color: var(--rui-color-danger-text); }
.rui-calendar-event[data-tone="info"] { background: color-mix(in srgb, var(--rui-color-info, #06b6d4) 18%, transparent); color: var(--rui-color-info-text); }
.rui-calendar-event-more { font-size: var(--rui-font-size-11); color: var(--rui-color-text-muted); padding: 0 2px; }

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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-sm);
  margin-left: auto;
  white-space: nowrap;
}
.rui-activity-log-description,
.rui-audit-trail-description {
  font-size: var(--rui-font-size-13);
  color: var(--rui-color-text-muted);
  margin: 0;
}
/* The audit variant's meta is monospace; the default variant's had no CSS at all,
   so IP / browser / request id rendered as unstyled inline text in a non-audit
   feed. Block + small + muted, without claiming the monospace chip. */
.rui-activity-log-meta { display: block; font-size: var(--rui-font-size-11); color: var(--rui-color-text-muted); }
.rui-activity-log-time,
.rui-audit-trail-time { font-variant-numeric: tabular-nums; }
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-comparison-table table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--rui-font-size-base);
}
.rui-comparison-table th,
.rui-comparison-table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  margin-top: 2px;
  font-weight: 400;
}
.rui-comparison-table-group td {
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
}
.rui-comparison-yes { color: var(--rui-color-success-text); font-size: var(--rui-font-size-18); }
.rui-comparison-no { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-18); }

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
  font-size: var(--rui-font-size-13);
}
.rui-infinite-list-spin {
  animation: rui-spin 0.9s linear infinite;
}
@keyframes rui-spin { to { transform: rotate(360deg); } }
.rui-infinite-list-load-more {
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: var(--rui-border-width) solid var(--rui-color-border);
  color: inherit;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: var(--rui-font-size-13);
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
/* Restore a visible focus indicator: the rule above removes the UA outline
   and nothing replaced it, leaving this surface with no focus affordance at
   all for keyboard users (WCAG 2.4.7). */
.rui-video-player-video:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: 2px;
}

.rui-video-player-caption {
  margin: 0;
  font-size: var(--rui-font-size-13);
  color: var(--rui-color-text-muted);
}
.rui-audio-player {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-audio-player-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 0 1 auto;
}
.rui-audio-player-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--rui-color-primary) 12%, transparent);
  color: var(--rui-color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--rui-font-size-lg);
}
.rui-audio-player-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rui-audio-player-title {
  font-weight: 600;
  font-size: var(--rui-font-size-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rui-audio-player-artist {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
}
.rui-audio-player-audio {
  min-width: 180px;
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
  touch-action: pan-y;  /* let vertical page scroll through the swipe handler */
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
  /* will-change removed: it made the track a containing block, trapping
     position: fixed descendants (audit D1084). */
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
  font-size: var(--rui-font-size-base);
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
  font-size: var(--rui-font-size-base);
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
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rui-color-border);
  border: 0;
  cursor: pointer;
  padding: 0;
  transition: background 120ms ease, transform 120ms ease;
}
.rui-carousel-empty { display: flex; align-items: center; justify-content: center; min-height: 120px; padding: 24px; border: 1px dashed var(--rui-color-border); border-radius: var(--rui-radius-md); color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); text-align: center; }
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
${below("md")} {
  .rui-gallery { grid-template-columns: repeat(min(var(--rui-gallery-columns, 3), 2), 1fr); }
}
.rui-gallery-tile {
  position: relative;
  overflow: hidden;
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 5%, var(--rui-color-surface, #fff)));
  border: var(--rui-border-width) solid var(--rui-color-border);
  padding: 0;
  margin: 0;
  /* cursor moved to [data-clickable] — a non-clickable tile must not
     advertise interactivity (audit D1094). */
  font: inherit;
  color: inherit;
  transition: transform 160ms ease, border-color 160ms ease;
}
.rui-gallery-tile[data-clickable="true"] { cursor: pointer; }
.rui-gallery-tile[data-clickable="true"]:hover { transform: scale(1.02); border-color: var(--rui-color-primary); }
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
  font-size: var(--rui-font-size-sm);
  padding: 16px 10px 8px;
  text-align: left;
  pointer-events: none;
}
.rui-gallery-empty { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; min-height: 120px; padding: 24px; color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); text-align: center; }

.rui-lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: var(--rui-z-top);
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
  font-size: var(--rui-font-size-title);
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
  font-size: var(--rui-font-size-base);
}
.rui-lightbox-counter {
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--rui-font-size-sm);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-13);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: 999px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  font-size: var(--rui-font-size-sm);
}
.rui-map-marker-icon { color: var(--rui-color-primary); }
.rui-map-caption {
  margin: 0;
  font-size: 12.5px;
  color: var(--rui-color-text-muted);
}

/* Editors: RichTextEditor / CodeEditor ----------------------------- */
.rui-rich-text {
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-13);
  transition: background 120ms ease, color 120ms ease;
}
/* :not(:disabled) — a readonly/disabled editor renders every tool disabled, and
   they were still lighting up under the pointer. */
.rui-rich-text-tool:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-text) 8%, transparent); color: var(--rui-color-text); }
/* queryCommandState is reflected into aria-pressed on every tool; without a rule
   a sighted user got no signal that Bold is active at the caret. */
.rui-rich-text-tool[aria-pressed="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 14%, transparent);
  color: var(--rui-color-primary);
}
.rui-rich-text-content {
  padding: 14px 16px;
  outline: 0;
  font: inherit;
  color: inherit;
  overflow-y: auto;
  position: relative;
}
/* Restore a visible focus indicator: the rule above removes the UA outline
   and nothing replaced it, leaving this surface with no focus affordance at
   all for keyboard users (WCAG 2.4.7). */
.rui-rich-text-content:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: 2px;
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
.rui-rich-text-content h2 { font-size: var(--rui-font-size-18); font-weight: 700; }
.rui-rich-text-content h3 { font-size: var(--rui-font-size-lg); font-weight: 700; }
.rui-rich-text-content p { margin: 0 0 0.6em; line-height: 1.55; }
.rui-rich-text-content blockquote {
  border-left: 3px solid var(--rui-color-border);
  margin: 0.5em 0;
  padding-left: 12px;
  color: var(--rui-color-text-muted);
}
.rui-rich-text-content :is(ul, ol) { padding-left: 20px; margin: 0 0 0.6em; }

.rui-code-editor {
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: var(--rui-color-surface, var(--rui-color-bg));
  font-family: var(--rui-font-family-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: var(--rui-font-size-13);
  display: flex;
  flex-direction: column;
}
.rui-code-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 4%, var(--rui-color-surface, #fff)));
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-code-editor-language {
  font-size: var(--rui-font-size-11);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--rui-color-text-muted);
}
/* minmax(0, …) rather than a bare 1fr: the grid item's automatic minimum is
   auto, so a long unwrapped line would push the code out of the overflow:
   hidden root. The component also sets min-width: 0 inline; stating it in the
   track means a future child that forgets cannot regress it. */
.rui-code-editor-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
}
.rui-code-editor[data-gutter="false"] .rui-code-editor-body { grid-template-columns: minmax(0, 1fr); }
.rui-code-editor-gutter {
  background: var(--rui-color-surface-muted, color-mix(in srgb, var(--rui-color-text) 3%, var(--rui-color-surface, #fff)));
  color: var(--rui-color-text-muted);
  padding: 12px 10px;
  text-align: right;
  user-select: none;
  border-right: var(--rui-border-width) solid var(--rui-color-border);
  /* Must match the textarea EXACTLY, in absolute units — a unitless 1.6 resolves
     against each element's own font-size, so a 12px gutter beside a 13px textarea
     drifted a pixel per line and the numbers walked off their rows. */
  line-height: 20px;
  font-size: var(--rui-font-size-13);
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
  line-height: 20px;
  white-space: pre;
  overflow-x: auto;
}
/* Restore a visible focus indicator: the rule above removes the UA outline
   and nothing replaced it, leaving this surface with no focus affordance at
   all for keyboard users (WCAG 2.4.7). */
.rui-code-editor-textarea:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: 2px;
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
  z-index: var(--rui-z-dropdown);
  min-width: 200px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: var(--rui-border-width) solid var(--rui-color-border);
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
/* This scoped rule dropped the :not(:disabled) guard the base .rui-menu-item:hover
   rule has and won on source order, so a disabled item painted a hover
   background even though no handler was ever attached. */
.rui-context-menu-pop .rui-menu-item:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-text) 6%, transparent); }
.rui-context-menu-pop .rui-menu-item[data-variant="danger"] { color: var(--rui-color-danger-text); }
.rui-context-menu-pop .rui-menu-item[disabled] { opacity: 0.5; cursor: not-allowed; }
.rui-context-menu-pop .rui-menu-item-icon { color: var(--rui-color-text-muted); width: 16px; text-align: center; }
.rui-context-menu-pop .rui-menu-item-shortcut {
  margin-left: auto;
  font-size: var(--rui-font-size-11);
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
  font-size: var(--rui-font-size-13);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: 8px;
  padding: 2px;
  cursor: pointer;
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-color-picker-hex {
  flex: 1;
  padding: 8px 12px;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  font-family: var(--rui-font-family-mono, monospace);
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-20);
  font-weight: 600;
  font-family: var(--rui-font-family-mono, monospace);
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  font: inherit;
  font-size: var(--rui-font-size-base);
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
  font-size: var(--rui-font-size-sm);
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
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
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
  font-size: var(--rui-font-size-13);
  font-weight: 500;
}
.rui-tag-input-remove {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font-size: var(--rui-font-size-base);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  font: inherit;
  font-size: var(--rui-font-size-base);
  resize: vertical;
  outline: none;
}
.rui-mention-input-field:focus { border-color: var(--rui-color-primary); }
.rui-mention-input-suggestions {
  position: absolute;
  z-index: var(--rui-z-dropdown);
  left: 0;
  right: 0;
  top: 100%;
  margin-top: 4px;
  min-width: 220px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-13);
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
/* The searching / no-results row replaces the options, so it has to share their
   padding and size instead of sitting flush against the panel edge. */
.rui-mention-input-status { padding: 8px 12px; font-size: var(--rui-font-size-13); color: var(--rui-color-text-muted); }
.rui-mention-input-option-label { font-weight: 500; }
.rui-mention-input-option-handle {
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-sm);
  font-family: var(--rui-font-family-mono);
}

/* Time / DateTime / Masked input ---------------------------------- */
.rui-time-picker,
.rui-datetime-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rui-time-picker-label {
  font-size: var(--rui-font-size-13);
  font-weight: 600;
  color: var(--rui-color-text);
}
.rui-time-picker-input,
.rui-datetime-picker-input,
.rui-masked-input {
  width: 100%;
  padding: 8px 12px;
  border: var(--rui-border-width) solid var(--rui-color-border-control, var(--rui-color-border));
  border-radius: var(--rui-radius-md, 8px);
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: inherit;
  font: inherit;
  font-size: var(--rui-font-size-base);
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
  font-size: var(--rui-font-size-15);
  margin: 0;
  color: var(--rui-color-text);
}
.rui-form-section-helper {
  font-size: var(--rui-font-size-13);
  color: var(--rui-color-text-muted);
  margin: 0;
}
.rui-form-section-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rui-fieldset {
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  padding: 12px 16px 16px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  /* fieldset carries a UA min-inline-size: min-content, so a wide child (a Table)
     stops it shrinking inside a grid track and the page scrolls sideways instead
     of the table's own scroll wrapper taking over. */
  min-width: 0;
}
.rui-fieldset-legend {
  font-weight: 700;
  padding: 0 6px;
  font-size: var(--rui-font-size-13);
  color: var(--rui-color-text);
}
.rui-fieldset-helper {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  margin: 0;
}
.rui-validation-summary {
  padding: 14px 16px;
  border: var(--rui-border-width) solid color-mix(in srgb, var(--rui-color-danger, #ef4444) 30%, var(--rui-color-border));
  border-radius: var(--rui-radius-md, 8px);
  background: color-mix(in srgb, var(--rui-color-danger, #ef4444) 8%, var(--rui-color-surface, var(--rui-color-bg)));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* The author-level display: flex above beats the UA [hidden] rule, so the
   errors-empty branch rendered an empty danger-tinted box on every clean form.
   Same guard .rui-error-banner[hidden] already uses. */
.rui-validation-summary[hidden] { display: none; }
.rui-validation-summary[data-tone="warning"] {
  border-color: color-mix(in srgb, var(--rui-color-warning, #f59e0b) 30%, var(--rui-color-border));
  background: color-mix(in srgb, var(--rui-color-warning, #f59e0b) 8%, var(--rui-color-surface, var(--rui-color-bg)));
}
.rui-validation-summary-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: var(--rui-font-size-base);
  color: var(--rui-color-danger-text);
}
.rui-validation-summary[data-tone="warning"] .rui-validation-summary-title { color: var(--rui-color-warning-text); }
.rui-validation-summary-icon { font-size: var(--rui-font-size-lg); }
.rui-validation-summary-list {
  margin: 0;
  padding-left: 22px;
  color: var(--rui-color-text);
  font-size: 13.5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
/* Entries that carry a field render as jump links; the UA blue would not match
   the plain-text entries sitting next to them in the same list. */
.rui-validation-summary-link { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.rui-validation-summary-link:hover { text-decoration-thickness: 2px; }

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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-13);
}
.rui-multi-step-form-steps[data-layout="row"] .rui-steps-item {
  border-right: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-multi-step-form-steps[data-layout="row"] .rui-steps-item:last-child { border-right: none; }
.rui-multi-step-form-steps[data-layout="column"] .rui-steps-item {
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
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
  top: 6px;
  transform: none;
}
.rui-multi-step-form-steps .rui-steps-item[data-active="true"]::before {
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text, #fff);
}
.rui-multi-step-form-steps .rui-steps-item[data-complete="true"]::before {
  background: var(--rui-color-success, #10b981);
  color: var(--rui-color-on-success);
}
.rui-multi-step-form-steps .rui-steps-item .rui-steps-title {
  font-weight: 700;
  color: inherit;
  margin: 0;
  line-height: 1.2;
}
.rui-multi-step-form-steps .rui-steps-item .rui-steps-details {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
  margin-top: 2px;
}
.rui-multi-step-form-steps .rui-steps-item[data-active="true"] {
  background: var(--rui-color-surface, var(--rui-color-bg));
  color: var(--rui-color-primary);
}
.rui-multi-step-form-steps .rui-steps-item[data-complete="true"] {
  color: var(--rui-color-success-text);
}
.rui-multi-step-form-steps .rui-steps-item[data-complete="true"] .rui-steps-title::before {
  content: "✓ ";
  margin-right: 2px;
}
/* A completed step is now a real control (role=button + tabindex), but an li has
   no affordance of its own — the caret cursor and the missing ring are the tell. */
.rui-multi-step-form-steps .rui-steps-item[data-clickable="true"] { cursor: pointer; }
.rui-multi-step-form-steps .rui-steps-item[data-clickable="true"]:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring);
  outline-offset: 2px;
}
/* Both sit in the wizard's 1fr column-layout track, whose automatic minimum is
   auto — a wide step (Table, pre, an API key) would size the track to its
   min-content width and blow the whole wizard out of its container. */
.rui-multi-step-form-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.rui-multi-step-form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding-top: 8px;
  border-top: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-multi-step-form-progress {
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-13);
  font-variant-numeric: tabular-nums;
}
${below("md")} {
  .rui-multi-step-form[data-layout="column"] {
    grid-template-columns: 1fr;
    grid-template-areas:
      "steps"
      "body"
      "footer";
  }
}

/* Advanced charts (Area/Gauge/Heatmap/Radar/Scatter/Histogram) --
   The .rui-chart* selectors that used to be re-declared here now live in the one
   canonical Charts block near the top of the sheet. */

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
  font-size: var(--rui-font-size-title);
  font-weight: 700;
  color: var(--rui-color-text);
  margin-top: -6px;
}
.rui-gauge[data-tone="primary"] .rui-gauge-value { color: var(--rui-color-primary); }
.rui-gauge[data-tone="success"] .rui-gauge-value { color: var(--rui-color-success-text); }
.rui-gauge[data-tone="warning"] .rui-gauge-value { color: var(--rui-color-warning-text); }
.rui-gauge[data-tone="danger"] .rui-gauge-value { color: var(--rui-color-danger-text); }
.rui-gauge[data-tone="info"] .rui-gauge-value { color: var(--rui-color-info-text); }
.rui-gauge-caption {
  font-size: var(--rui-font-size-sm);
  color: var(--rui-color-text-muted);
}

.rui-heatmap { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.rui-heatmap-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* A 12- or 52-column matrix now sets --rui-heatmap-cols instead of wrapping into
     phantom rows, but a 0 floor crushed those columns to a few px — well under the
     32px the cells declare. A 28px floor plus this scroller lets it scroll. */
  overflow-x: auto;
}
.rui-heatmap-row {
  display: grid;
  grid-template-columns: 56px repeat(var(--rui-heatmap-cols, 7), minmax(28px, 1fr));
  gap: 4px;
}
.rui-heatmap-row-header { font-size: var(--rui-font-size-11); color: var(--rui-color-text-muted); }
.rui-heatmap-cell {
  padding: 8px 6px;
  border-radius: 4px;
  text-align: center;
  font-size: var(--rui-font-size-sm);
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
  font-size: var(--rui-font-size-11);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
}
.rui-loading-state .rui-spinner { font-size: var(--rui-font-size-32); }
.rui-error-state-icon { color: var(--rui-color-danger, #ef4444); font-size: 36px; }
.rui-success-state-icon { color: var(--rui-color-success, #10b981); font-size: 36px; }
.rui-loading-state-title,
.rui-error-state-title,
.rui-success-state-title { font-size: var(--rui-font-size-18); font-weight: 700; margin: 0; color: var(--rui-color-text); }
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
  font-size: var(--rui-font-size-15);
  font-weight: 700;
  margin: 0;
  color: var(--rui-color-text);
}
.rui-onboarding-checklist-subtitle {
  margin: 0;
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-sm);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-base);
}
.rui-onboarding-checklist-item[data-done="true"] .rui-onboarding-checklist-marker {
  background: var(--rui-color-success, #10b981);
  color: var(--rui-color-on-success);
}
.rui-onboarding-checklist-marker-icon { font-size: var(--rui-font-size-base); }
.rui-onboarding-checklist-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rui-onboarding-checklist-item-title { font-weight: 600; font-size: var(--rui-font-size-base); color: var(--rui-color-text); }
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
  font-size: var(--rui-font-size-13);
  padding: 0;
}
.rui-inbox-panel-mark-all:hover { text-decoration: underline; }
.rui-inbox-panel-empty {
  padding: 28px;
  text-align: center;
  color: var(--rui-color-text-muted);
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-11);
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
  z-index: var(--rui-z-top);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.rui-tour[data-open="true"] { display: flex; }
.rui-tour-card {
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: var(--rui-border-width) solid var(--rui-color-border);
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
  font-size: var(--rui-font-size-11);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--rui-color-primary);
}
.rui-tour-title {
  font-size: var(--rui-font-size-18);
  font-weight: 700;
  margin: 0;
  color: var(--rui-color-text);
}
.rui-tour-description {
  font-size: var(--rui-font-size-base);
  color: var(--rui-color-text-muted);
  line-height: 1.55;
  margin: 0;
}
.rui-tour-target {
  font-family: var(--rui-font-family-mono, monospace);
  font-size: var(--rui-font-size-sm);
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
  border-top: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-tour-footer > .rui-button:first-child { margin-right: auto; }

.rui-spotlight {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: var(--rui-z-top);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.rui-spotlight[data-open="true"] { display: flex; }
.rui-spotlight-card {
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  padding: 22px 24px;
  box-shadow: var(--rui-shadow-md, 0 16px 40px rgba(0, 0, 0, 0.28));
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
  width: 100%;
}
.rui-spotlight-title { font-size: var(--rui-font-size-lg); font-weight: 700; margin: 0; color: var(--rui-color-text); }
.rui-spotlight-description { font-size: 13.5px; color: var(--rui-color-text-muted); margin: 0; line-height: 1.55; }
.rui-spotlight-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
/* Spotlight ring: the scrim is painted by the ring's outer box-shadow so
   the highlighted target stays fully visible (audit D0938/P0941). */
.rui-spotlight-ring { position: fixed; border-radius: var(--rui-radius-md, 8px); box-shadow: 0 0 0 3px var(--rui-color-primary), 0 0 0 9999px rgba(0, 0, 0, 0.5); pointer-events: none; }
.rui-spotlight[data-ring="true"] { background: transparent; }

/* Sticky / ResizablePanels / MasonryGrid / TopBar -------------- */
.rui-sticky {
  background: var(--rui-color-surface, var(--rui-color-bg));
}
/* Stuck state (II.4): a subtle shadow + hairline once the bar pins. */
.rui-sticky[data-stuck="true"] {
  box-shadow: var(--rui-shadow-sm, 0 1px 2px rgba(0,0,0,0.08)), 0 1px 0 var(--rui-color-border);
}
.rui-resizable-panels {
  display: grid;
  grid-template-columns: var(--rui-resizable-primary, 40%) 6px 1fr;
  gap: 0;
  min-height: 280px;
  width: 100%;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  background: var(--rui-color-surface, var(--rui-color-bg));
}
.rui-resizable-panel { overflow: auto; min-width: 0; padding: 12px; }
.rui-resizable-panel-primary { min-width: var(--rui-resizable-min, 240px); }
.rui-resizable-panel-secondary {
  border-left: 0; min-width: var(--rui-resizable-min-secondary, 0); }
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
  column-gap: var(--rui-masonry-gap, var(--rui-spacing-m));
}
/* Responsive column counts (audit P0952). The component writes the
   --rui-masonry-columns-* vars; each breakpoint falls back to the next
   smaller one so a partial map still cascades sensibly. */
.rui-masonry-grid[data-responsive-columns] { column-count: var(--rui-masonry-columns-base, 1); }
${up("sm")} { .rui-masonry-grid[data-responsive-columns] { column-count: var(--rui-masonry-columns-sm, var(--rui-masonry-columns-base, 1)); } }
${up("md")} { .rui-masonry-grid[data-responsive-columns] { column-count: var(--rui-masonry-columns-md, var(--rui-masonry-columns-sm, var(--rui-masonry-columns-base, 1))); } }
${up("lg")} { .rui-masonry-grid[data-responsive-columns] { column-count: var(--rui-masonry-columns-lg, var(--rui-masonry-columns-md, var(--rui-masonry-columns-sm, var(--rui-masonry-columns-base, 1)))); } }
${up("xl")} { .rui-masonry-grid[data-responsive-columns] { column-count: var(--rui-masonry-columns-xl, var(--rui-masonry-columns-lg, var(--rui-masonry-columns-md, var(--rui-masonry-columns-sm, var(--rui-masonry-columns-base, 1))))); } }
.rui-masonry-grid[data-columns="1"] { --rui-masonry-columns: 1; }
.rui-masonry-grid[data-columns="2"] { --rui-masonry-columns: 2; }
.rui-masonry-grid[data-columns="3"] { --rui-masonry-columns: 3; }
.rui-masonry-grid[data-columns="4"] { --rui-masonry-columns: 4; }
.rui-masonry-grid[data-columns="5"] { --rui-masonry-columns: 5; }
.rui-masonry-grid[data-columns="6"] { --rui-masonry-columns: 6; }
${spacingAttrRules(".rui-masonry-grid", "data-gap", (v) => `--rui-masonry-gap: ${v};`)}
.rui-masonry-grid > * {
  display: inline-block;
  width: 100%;
  break-inside: avoid;
  margin-bottom: var(--rui-masonry-gap, var(--rui-spacing-m));
}
${below("md")} {
  .rui-masonry-grid { column-count: min(var(--rui-masonry-columns, 3), 2); }
}
${below("xs")} {
  .rui-masonry-grid { column-count: 1; }
}

.rui-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: var(--rui-color-surface, var(--rui-color-bg));
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  flex-wrap: wrap;
}
.rui-topbar[data-sticky="true"] { position: sticky; top: 0; z-index: var(--rui-z-sticky); border-radius: 0; border-left: 0; border-right: 0; }
.rui-topbar-side { display: flex; align-items: center; gap: 10px; min-width: 0; }
.rui-topbar-title-block { display: flex; flex-direction: column; gap: 2px; }
.rui-topbar-title { margin: 0; font-size: var(--rui-font-size-lg); font-weight: 700; color: var(--rui-color-text); }
.rui-topbar-subtitle { margin: 0; font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
.rui-topbar-center { flex: 1; min-width: 200px; justify-content: center; }
.rui-topbar-right { margin-left: auto; }

/* AppShell collapsible / mobile drawer ------------------------ */
.rui-app-shell-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: var(--rui-z-overlay);
  display: none;
}
.rui-app-shell-toggle {
  background: transparent;
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md, 8px);
  padding: 4px 10px;
  cursor: pointer;
  color: inherit;
  display: none;
  align-items: center;
  justify-content: center;
}
${below("md")} {
  /* Animates left, not transform, and states an explicit width. transform on the
     drawer made it the containing block for every position: fixed descendant, so
     a Modal or Sheet declared in the Sidebar footer was positioned against the
     drawer box — and while closed at translateX(-100%), entirely off-screen.
     Without a width the fixed panel also shrink-wrapped its content (the nested
     rail's width: 100% resolves to auto against a shrink-to-fit parent), so a
     long brand string pushed it past the viewport edge and made the trailing
     badges unreachable. */
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: calc(-1 * min(300px, 85vw));
    right: auto;
    width: min(300px, 85vw);
    z-index: var(--rui-z-modal);
    transition: left 0.25s ease;
  }
  .rui-app-shell[data-collapsible="true"][data-sidebar-open="true"] .rui-app-shell-sidebar {
    left: 0;
  }
  .rui-app-shell[data-collapsible="true"][data-sidebar-open="true"] .rui-app-shell-scrim {
    display: block;
  }
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-toggle {
    display: inline-flex;
  }
  /* Reveal a burger-only bar (no topbar content) where the sidebar collapses,
     so the hamburger has somewhere to live on phones. */
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-topbar[data-burger-only="true"] {
    display: flex;
  }
  /* Keep a topbar Row horizontal on phones — search + actions stay on one line
     beside the hamburger instead of collapsing to a column the way ordinary
     content rows do. Higher specificity + later source order beats the global
     row-to-column rule. */
  .rui-app-shell .rui-app-shell-topbar .rui-stack[data-direction="row"] {
    flex-direction: row;
    align-items: center;
  }
  /* Inside the off-canvas drawer the host is already a full-height fixed
     panel, so let a full-height rail fill it normally instead of sticking. */
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-full-height="true"] {
    position: static;
    top: auto;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
  /* A desktop-collapsed shell viewed on a phone used to slide out a 64px icon
     strip with a single brand letter and no label anywhere, while the scrim
     dimmed the whole screen. The drawer always has room for the labels. */
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] { width: 100%; }
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] .rui-sidebar-tagline,
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] .rui-sidebar-section-label,
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] .rui-sidebar-item-label,
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] .rui-sidebar-item-badge { display: revert; }
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] .rui-sidebar-item { justify-content: flex-start; }
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] .rui-sidebar-header { align-items: stretch; }
  .rui-app-shell[data-collapsible="true"] .rui-app-shell-sidebar .rui-sidebar[data-collapsed="true"] .rui-sidebar-brand {
    text-align: left;
    font-size: var(--rui-font-size-base);
    width: auto;
  }
}

/* Collapsed Sidebar (icon rail) ------------------------------ */
.rui-sidebar[data-collapsed="true"] { width: 64px; }
.rui-sidebar[data-collapsed="true"] .rui-sidebar-tagline,
.rui-sidebar[data-collapsed="true"] .rui-sidebar-section-label,
.rui-sidebar[data-collapsed="true"] .rui-sidebar-item-label,
.rui-sidebar[data-collapsed="true"] .rui-sidebar-item-badge { display: none; }
.rui-sidebar[data-collapsed="true"] .rui-sidebar-item { justify-content: center; }
/* Collapsed rail shows only the brand's initial — centre it in the column. */
.rui-sidebar[data-collapsed="true"] .rui-sidebar-header { align-items: center; }
.rui-sidebar[data-collapsed="true"] .rui-sidebar-brand {
  text-align: center;
  font-size: var(--rui-font-size-18);
  line-height: 1;
  width: 100%;
}

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
/* Mirrors the .rui-button variant ladder. Without these the enum's other six
   values rendered byte-identically to the ghost default, so a destructive
   row action looked exactly like a benign one. */
.rui-icon-button[data-variant="secondary"] { background: var(--rui-color-surface); color: var(--rui-color-text); border-color: var(--rui-color-border); }
.rui-icon-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-icon-button[data-variant="outline"] { background: transparent; color: var(--rui-color-primary); border-color: color-mix(in srgb, var(--rui-color-primary) 55%, transparent); }
.rui-icon-button[data-variant="outline"]:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-primary) 10%, transparent); border-color: var(--rui-color-primary); }
/* Same pairing as the danger Button — see the note there for why the hover
   brightens instead of darkening. */
.rui-icon-button[data-variant="danger"] { background: var(--rui-color-danger); color: var(--rui-color-on-danger); }
.rui-icon-button[data-variant="danger"]:hover:not(:disabled) { background: color-mix(in srgb, var(--rui-color-danger) 85%, white); }
.rui-icon-button[data-variant="link"] { background: transparent; color: var(--rui-color-primary); border-color: transparent; }
.rui-icon-button[data-variant="link"]:hover:not(:disabled) { background: transparent; color: var(--rui-color-primary-hover); }
/* "ghost" and "default" are both the base transparent look and "md" is the base
   size. They are spelled out anyway so every value the enum advertises has a
   rule of its own: the previous state — where four of the seven variants and two
   of the five sizes matched nothing — is exactly how variant: "danger" came to
   render identically to its benign neighbour. */
.rui-icon-button[data-variant="ghost"] { background: transparent; color: var(--rui-color-text); border-color: transparent; }
.rui-icon-button[data-variant="ghost"]:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-icon-button[data-variant="default"] { background: transparent; color: var(--rui-color-text); }
.rui-icon-button[data-size="xs"] { padding: 2px; font-size: var(--rui-font-size-11); }
.rui-icon-button[data-size="sm"] { padding: 4px; }
.rui-icon-button[data-size="md"] { padding: 6px; }
.rui-icon-button[data-size="lg"] { padding: 10px; }
.rui-icon-button[data-size="xl"] { padding: 14px; font-size: var(--rui-font-size-18); }
/* Toggle + loading states, and the href variant: :disabled cannot match an <a>,
   so the anchor form needs the aria-disabled hook instead. */
.rui-icon-button[data-active="true"] { background: var(--rui-color-surface-muted); color: var(--rui-color-primary); }
.rui-icon-button[data-loading="true"] { cursor: progress; }
.rui-icon-button-spinner { animation: rui-spin 0.8s linear infinite; }
a.rui-icon-button[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; pointer-events: none; }

.rui-command-palette[data-open="false"] { display: none; }
.rui-command-palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: var(--rui-z-overlay);
}
.rui-command-palette-panel {
  position: fixed;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 32px));
  background: var(--rui-color-surface);
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  z-index: var(--rui-z-modal);
  overflow: hidden;
}
.rui-command-palette-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-command-palette-input { flex: 1; border: 0; background: transparent; font: inherit; outline: none; }
/* Restore a visible focus indicator: the rule above removes the UA outline
   and nothing replaced it, leaving this surface with no focus affordance at
   all for keyboard users (WCAG 2.4.7). */
.rui-command-palette-input:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: 2px;
}

.rui-command-palette-shortcut { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
.rui-command-palette-list { max-height: 320px; overflow: auto; padding: 6px; }
.rui-command-palette-group {
  font-size: var(--rui-font-size-11);
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
/* Roving arrow-key selection is driven by data-active + aria-activedescendant;
   without a rule the keyboard cursor is invisible to sighted users. */
.rui-command-palette-item[data-active="true"] {
  background: var(--rui-color-surface-muted);
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: -2px;
}
.rui-command-palette-item-kbd { font-size: var(--rui-font-size-11); color: var(--rui-color-text-muted); }
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  font-size: var(--rui-font-size-13);
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
  font-size: var(--rui-font-size-13);
}
/* The row is frozen while a filtered query is in flight; nothing said so. */
.rui-filter-chips[data-disabled="true"] { opacity: 0.6; }
.rui-filter-chip-remove:disabled,
.rui-filter-chips-clear:disabled { cursor: not-allowed; opacity: 0.5; }

.rui-field-repeater { display: flex; flex-direction: column; gap: 12px; }
.rui-field-repeater-row {
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  padding: 12px;
  background: var(--rui-color-surface);
}
.rui-field-repeater-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.rui-field-repeater-label { display: block; font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); margin-bottom: 4px; }
.rui-field-repeater-remove { margin-top: 8px; }

.rui-virtual-list-scroller { position: relative; overflow: auto; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); }
.rui-virtual-list-item {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  box-sizing: border-box;
}
.rui-virtual-grid-scroller { position: relative; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); }
.rui-virtual-grid-cell { display: flex; align-items: stretch; box-sizing: border-box; }
.rui-virtual-grid-cell > * { width: 100%; }
/* Empty / loading placeholders rendered as unpadded bare text against the
   scroller's own border. */
.rui-virtual-list-empty,
.rui-virtual-grid-empty {
  padding: 24px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--rui-color-text-muted);
}
/* Every new spinner icon was static — reuse the keyframes the other loaders use. */
.rui-command-palette-spinner,
.rui-virtual-list-spinner,
.rui-virtual-grid-spinner { animation: rui-spin 0.8s linear infinite; }

.rui-query-builder { display: flex; flex-direction: column; gap: 8px; }
.rui-query-builder-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rui-query-builder-remove,
.rui-query-builder-add {
  border: var(--rui-border-width) solid var(--rui-color-border);
  background: var(--rui-color-surface);
  border-radius: var(--rui-radius-sm);
  padding: 6px 10px;
  cursor: pointer;
}

.rui-diff-viewer { border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); overflow: hidden; font-family: var(--rui-font-family-mono, monospace); font-size: var(--rui-font-size-sm); }
.rui-diff-viewer-panes { display: grid; grid-template-columns: 1fr 1fr; }
/* Split view is now paired cells in the one grid above, not two independently
   scrolling pre blocks (they went off-by-one after the first insertion), so the
   per-line cells carry the padding, divider and whitespace handling. pre-wrap
   because collapsing whitespace loses the indentation in a code diff. */
.rui-diff-viewer-cell { padding: 0 8px; white-space: pre-wrap; word-break: break-word; }
.rui-diff-viewer-cell[data-side="left"] { border-right: var(--rui-border-width) solid var(--rui-color-border); }
.rui-diff-viewer-filler { background: var(--rui-color-surface-muted); }
.rui-diff-viewer-title {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 8px;
  font-weight: 600;
  background: var(--rui-color-surface);
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
}
.rui-diff-line-num { display: inline-block; min-width: 3ch; margin-right: 8px; text-align: right; color: var(--rui-color-text-muted); user-select: none; }
.rui-diff-line-text { white-space: pre-wrap; }
.rui-diff-line-gap { padding: 4px 8px; text-align: center; color: var(--rui-color-text-muted); background: var(--rui-color-surface-muted); }
.rui-diff-viewer-unified { margin: 0; padding: 12px; max-height: 320px; overflow: auto; }
.rui-diff-line-add { background: color-mix(in srgb, var(--rui-color-success) 12%, transparent); }
.rui-diff-line-remove { background: color-mix(in srgb, var(--rui-color-danger) 12%, transparent); }

.rui-json-tree { font-family: var(--rui-font-family-mono, monospace); font-size: var(--rui-font-size-sm); }
.rui-json-tree-toggle {
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: var(--rui-color-text);
  padding: 2px 0;
}
.rui-json-tree-children[data-open="false"] { display: none; }
/* Nesting depth was only conveyed on the row, so children of children sat at the
   same indent; and the rows are focusable treeitems with arrow-key traversal
   that was completely invisible without a ring. */
.rui-json-tree-children { padding-left: 12px; }
.rui-json-tree-row { display: flex; align-items: center; gap: 4px; padding-left: 12px; }
/* Only expandable rows toggle — a leaf treeitem is focusable but not clickable. */
.rui-json-tree-row[aria-expanded] { cursor: pointer; }
.rui-json-tree-row:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: -2px;
}
.rui-json-tree-summary { color: var(--rui-color-text-muted); }
.rui-json-tree-key { color: var(--rui-color-primary); }
.rui-json-tree-leaf { color: var(--rui-color-text-muted); }

.rui-gantt { border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); overflow: hidden; }
/* Same 140px 1fr template as .rui-gantt-row below, or the percent-positioned
   ticks do not line up with the bars they label. -axis-ticks also has to be the
   positioning context, otherwise the absolute ticks escape to whatever ancestor
   happens to be positioned. */
.rui-gantt-axis { display: grid; grid-template-columns: 140px 1fr; gap: 8px; align-items: end; padding: 6px 12px; border-bottom: var(--rui-border-width) solid var(--rui-color-border); }
.rui-gantt-axis-ticks { position: relative; height: 16px; }
.rui-gantt-tick { position: absolute; transform: translateX(-50%); font-size: var(--rui-font-size-11); color: var(--rui-color-text-muted); white-space: nowrap; }
.rui-gantt-row { display: grid; grid-template-columns: 140px 1fr; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: var(--rui-border-width) solid var(--rui-color-border); }
.rui-gantt-label { font-size: var(--rui-font-size-13); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Clips the track itself, not just the outer frame: a geometry slip would
   otherwise paint leftward across the 140px label column and cover the name. */
.rui-gantt-bars { position: relative; height: 24px; background: var(--rui-color-surface-muted); border-radius: var(--rui-radius-sm); overflow: hidden; }
.rui-gantt-today { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--rui-color-danger); opacity: 0.8; }
.rui-gantt-bar {
  position: absolute;
  top: 4px;
  height: 16px;
  border-radius: var(--rui-radius-sm);
  background: var(--rui-color-primary);
  overflow: hidden;
}
/* Mix toward the theme text colour rather than #000: a fixed darkening step
   reduces contrast in a dark theme, where the progress fill needs to go
   lighter than its track, not darker. */
.rui-gantt-bar-progress { height: 100%; background: color-mix(in srgb, var(--rui-color-text) 25%, var(--rui-color-primary)); }
/* tasks[].tone was emitted with one bar appearance behind it, so done / at-risk /
   blocked were indistinguishable. */
.rui-gantt-bar[data-tone="success"] { background: var(--rui-color-success); }
.rui-gantt-bar[data-tone="warning"] { background: var(--rui-color-warning); }
.rui-gantt-bar[data-tone="danger"] { background: var(--rui-color-danger); }
.rui-gantt-bar[data-tone="info"] { background: var(--rui-color-info); }
.rui-gantt-bar[data-tone="muted"] { background: var(--rui-color-text-muted); }
/* A row whose dates could not be parsed draws no bar at all, so the label is the
   only place left to say so. */
.rui-gantt-row[data-invalid="true"] .rui-gantt-label { color: var(--rui-color-text-muted); font-style: italic; }
.rui-gantt-row[role="button"] { cursor: pointer; }
.rui-gantt-row[role="button"]:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: -2px;
}

.rui-truncate-text { margin: 0; }
/* The clamp lives here, not inline: an inline overflow/line-clamp beat every
   stylesheet rule and could not be themed. Only the line count is inline, so
   without this rule Truncate does not clamp at all. */
.rui-truncate[data-expanded="false"] .rui-truncate-text {
  display: -webkit-box;
  -webkit-line-clamp: var(--rui-truncate-lines, 3);
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.rui-truncate-toggle {
  border: 0;
  background: transparent;
  color: var(--rui-color-primary);
  cursor: pointer;
  padding: 4px 0;
  font-size: var(--rui-font-size-13);
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
/* An empty value shows the placeholder (or an em dash) as the trigger text — it
   has to read as placeholder, not as real content. */
.rui-inline-edit-display[data-empty="true"] { color: var(--rui-color-text-muted); font-style: italic; }
/* A permission-gated field must lose the dashed edit affordance above. */
.rui-inline-edit[data-disabled="true"] .rui-inline-edit-display { border-color: transparent; cursor: default; }

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
  color: var(--rui-color-on-danger);
  font-size: var(--rui-font-size-10);
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
  border: var(--rui-border-width) solid var(--rui-color-border);
  border-radius: var(--rui-radius-md);
  box-shadow: var(--rui-shadow-md);
  z-index: var(--rui-z-dropdown);
  max-height: 360px;
  overflow: auto;
}
.rui-notification-bell[data-open="true"] .rui-notification-bell-panel { display: block; }
/* Stylesheet fallback for a left-placed bell: the floating layer handles the
   promoted panel, but before promotion (or with no Popover support) the
   hardcoded right: 0 pushes a 320px panel off the left edge of the screen. */
.rui-notification-bell[data-align="left"] .rui-notification-bell-panel { left: 0; right: auto; }
/* Rows are a button (onItemClick) or an anchor (items[].href) now, so the rule
   has to undo the UA control chrome — centred text, grey fill, underlined blue —
   and they are keyboard-focusable, so they need a ring. */
.rui-notification-bell-item {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 0;
  border-bottom: var(--rui-border-width) solid var(--rui-color-border);
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  text-decoration: none;
}
/* Element-scoped: a row with neither href nor onItemClick is still a plain div
   and must not advertise a click. */
a.rui-notification-bell-item,
button.rui-notification-bell-item { cursor: pointer; }
a.rui-notification-bell-item:hover,
button.rui-notification-bell-item:hover { background: var(--rui-color-surface-muted); }
.rui-notification-bell-item:focus-visible {
  outline: 2px solid var(--rui-color-focus-ring, var(--rui-color-primary));
  outline-offset: -2px;
}
.rui-notification-bell-item-title { font-weight: 600; font-size: var(--rui-font-size-13); }
.rui-notification-bell-item-message,
.rui-notification-bell-item-time { font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); }
/* items[].unread and the mark-all-read footer had no rules at all, so a read and
   an unread notification rendered identically. */
.rui-notification-bell-item[data-unread="true"] {
  background: color-mix(in srgb, var(--rui-color-primary) 8%, transparent);
  font-weight: 600;
}
.rui-notification-bell-footer { border-top: var(--rui-border-width) solid var(--rui-color-border); }
.rui-notification-bell-mark {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--rui-color-primary);
  cursor: pointer;
  padding: 8px 12px;
  font: inherit;
}
.rui-notification-bell-empty { padding: 16px; text-align: center; color: var(--rui-color-text-muted); }
.rui-notification-bell-spinner { animation: rui-spin 0.8s linear infinite; }
.rui-select-searchable { width: 100%; }

/* Lightbox thumbnail ------------------------------------------------- */
.rui-lightbox-thumb {
  display: inline-block;
  padding: 0;
  border: var(--rui-border-width) solid var(--rui-color-border);
  background: var(--rui-color-surface);
  border-radius: var(--rui-radius-md, 8px);
  overflow: hidden;
  cursor: zoom-in;
  max-width: 240px;
}
.rui-lightbox-thumb img { display: block; width: 100%; height: auto; }
.rui-lightbox-thumb:hover { border-color: var(--rui-color-primary); }

/* ====================================================================== *
 * sx universal channel — interaction-state utility classes (Part I.4)
 * ====================================================================== */
.ak-hover-lift { transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s; }
.ak-hover-lift:hover { transform: translateY(-4px); box-shadow: var(--rui-shadow-lg); }
.ak-hover-grow { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.ak-hover-grow:hover { transform: scale(1.03); }
.ak-hover-scale { transition: transform .2s cubic-bezier(.22,1,.36,1); }
.ak-hover-scale:hover { transform: scale(1.05); }
.ak-hover-glow { transition: box-shadow .25s; }
.ak-hover-glow:hover { box-shadow: 0 0 0 1px var(--rui-color-primary), 0 8px 30px -8px var(--rui-color-primary); }
.ak-hover-bright { transition: filter .2s; }
.ak-hover-bright:hover { filter: brightness(1.08); }
.ak-hover-border { transition: border-color .2s; }
.ak-hover-border:hover { border-color: var(--rui-color-primary); }
.ak-hover-underline:hover { text-decoration: underline; }
.ak-focus-glow:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--rui-color-focus-ring) 45%, transparent); }
.ak-focus-border:focus-within { border-color: var(--rui-color-primary); }

/* ====================================================================== *
 * Animation presets (Part III.1) — opt-in via the universal \`animate\` prop
 * ====================================================================== */
.ak-anim { animation-duration: .6s; animation-fill-mode: both; animation-timing-function: cubic-bezier(.22,1,.36,1); }
.ak-anim-fade { animation-name: akFade; }
.ak-anim-fade-up { animation-name: akFadeUp; }
.ak-anim-fade-down { animation-name: akFadeDown; }
.ak-anim-fade-left { animation-name: akFadeLeft; }
.ak-anim-fade-right { animation-name: akFadeRight; }
.ak-anim-zoom, .ak-anim-zoom-in { animation-name: akZoom; }
.ak-anim-slide-up { animation-name: akSlideUp; }
.ak-anim-slide-down { animation-name: akSlideDown; }
.ak-anim-slide-left { animation-name: akSlideLeft; }
.ak-anim-slide-right { animation-name: akSlideRight; }
.ak-anim-pulse { animation-name: akPulse; animation-duration: 1.8s; animation-iteration-count: infinite; }
.ak-anim-float { animation-name: akFloat; animation-duration: 4s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
.ak-anim-shimmer { animation-name: akShimmer; animation-duration: 1.6s; animation-iteration-count: infinite; animation-timing-function: linear; }
.ak-anim-bounce { animation-name: akBounce; animation-duration: 1s; animation-iteration-count: infinite; }
.ak-anim-spin { animation-name: akSpin; animation-duration: 1s; animation-iteration-count: infinite; animation-timing-function: linear; }
.ak-anim-ping { animation-name: akPing; animation-duration: 1.2s; animation-iteration-count: infinite; }
.ak-anim-wiggle { animation-name: akWiggle; animation-duration: .8s; animation-iteration-count: infinite; }
@keyframes akFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes akFadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes akFadeDown { from { opacity: 0; transform: translateY(-24px); } to { opacity: 1; transform: none; } }
@keyframes akFadeLeft { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
@keyframes akFadeRight { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes akZoom { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
@keyframes akSlideUp { from { transform: translateY(100%); } to { transform: none; } }
@keyframes akSlideDown { from { transform: translateY(-100%); } to { transform: none; } }
@keyframes akSlideLeft { from { transform: translateX(100%); } to { transform: none; } }
@keyframes akSlideRight { from { transform: translateX(-100%); } to { transform: none; } }
@keyframes akPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes akFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes akShimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
@keyframes akBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-25%); } }
@keyframes akSpin { to { transform: rotate(360deg); } }
@keyframes akPing { 0% { transform: scale(1); opacity: 1; } 75%,100% { transform: scale(2); opacity: 0; } }
@keyframes akWiggle { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@media (prefers-reduced-motion: reduce) {
  .ak-anim, .ak-hover-lift, .ak-hover-grow, .ak-hover-scale { animation: none !important; transition: none !important; }
}

/* ====================================================================== *
 * GradientText (Part I.3 / VIII.1)
 * ====================================================================== */
.rui-gradient-text {
  background: var(--rui-gradient-brand);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  display: inline;
}
.rui-gradient-text[data-gradient="accent"] { background: var(--rui-gradient-accent); -webkit-background-clip: text; background-clip: text; }
.rui-gradient-text[data-gradient="warm"] { background: var(--rui-gradient-warm); -webkit-background-clip: text; background-clip: text; }
.rui-gradient-text[data-gradient="cool"] { background: var(--rui-gradient-cool); -webkit-background-clip: text; background-clip: text; }
.rui-gradient-text[data-gradient="success"] { background: var(--rui-gradient-success); -webkit-background-clip: text; background-clip: text; }
.rui-gradient-text[data-gradient="danger"] { background: var(--rui-gradient-danger); -webkit-background-clip: text; background-clip: text; }

/* ====================================================================== *
 * Display / Heading typography (Part I.5 / VIII.1)
 * ====================================================================== */
.rui-display {
  font-family: var(--rui-font-family-heading);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin: 0;
  color: var(--rui-color-text);
}
.rui-display[data-size="hero"] { font-size: clamp(36px, 6.2vw, 72px); }
.rui-display[data-size="xl"] { font-size: clamp(30px, 5vw, 56px); }
.rui-display[data-size="lg"] { font-size: clamp(26px, 4vw, 42px); }
.rui-display[data-balance="true"] { text-wrap: balance; }
.rui-display[data-align="center"] { text-align: center; }
.rui-display[data-align="right"] { text-align: right; }
.rui-heading {
  font-family: var(--rui-font-family-heading);
  font-weight: var(--rui-font-weight-heading);
  letter-spacing: var(--rui-letter-spacing-heading);
  line-height: 1.15;
  margin: 0;
  color: var(--rui-color-text);
}
.rui-heading[data-size="section"] { font-size: clamp(24px, 3.4vw, 38px); font-weight: 800; letter-spacing: -0.02em; margin: var(--rui-spacing-l) 0; }
.rui-heading[data-size="lg"] { font-size: var(--rui-font-size-24); }
.rui-heading[data-size="md"] { font-size: 19px; }
.rui-heading[data-size="sm"] { font-size: var(--rui-font-size-lg); }
.rui-heading[data-align="left"] { text-align: left; }
.rui-heading[data-align="center"] { text-align: center; }
.rui-heading[data-align="right"] { text-align: right; }
.rui-eyebrow {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--rui-color-primary);
}

/* ====================================================================== *
 * Section page-band (Part II.1)
 * ====================================================================== */
/* Single root definition: the flex-column half used to sit ~10600 lines earlier,
   next to .rui-section-title. Both halves shipped (they never named the same
   property), so merging them changes nothing. */
.rui-section {
  display: flex;
  flex-direction: column;
  gap: var(--rui-spacing-s);
  padding: var(--rui-spacing-3xl) var(--rui-spacing-l);
  position: relative;
}
.rui-section[data-pad="none"] { padding: 0; }
.rui-section[data-pad="xs"] { padding: var(--rui-spacing-l) var(--rui-spacing-l); }
.rui-section[data-pad="sm"] { padding: var(--rui-spacing-xl) var(--rui-spacing-l); }
.rui-section[data-pad="md"] { padding: var(--rui-spacing-3xl) var(--rui-spacing-l); }
.rui-section[data-pad="lg"] { padding: calc(var(--rui-spacing-3xl) * 1.3) var(--rui-spacing-l); }
.rui-section[data-pad="xl"] { padding: calc(var(--rui-spacing-3xl) * 1.6) var(--rui-spacing-l); }
.rui-section[data-bg="soft"] { background: color-mix(in srgb, var(--rui-color-primary) 4%, var(--rui-color-bg)); }
.rui-section[data-bg="surface"] { background: var(--rui-color-surface); }
.rui-section[data-bg="muted"] { background: var(--rui-color-surface-muted); }
.rui-section[data-bg="brand"] { background: var(--rui-gradient-brand); color: #fff; }
.rui-section-inner { margin: 0 auto; width: 100%; }
.rui-section-inner[data-w="sm"] { max-width: 720px; }
.rui-section-inner[data-w="md"] { max-width: 960px; }
.rui-section-inner[data-w="lg"] { max-width: 1180px; }
.rui-section-inner[data-w="xl"] { max-width: 1320px; }
.rui-section-inner[data-w="full"] { max-width: 100%; }
.rui-section-head { max-width: 760px; margin-bottom: var(--rui-spacing-xl); }
.rui-section[data-align="center"] .rui-section-head { margin-left: auto; margin-right: auto; text-align: center; }
.rui-section-head .rui-eyebrow { margin-bottom: 12px; }
.rui-section-head .rui-section-title { font-size: clamp(26px, 4vw, 42px); font-weight: 900; letter-spacing: -0.02em; margin: 0 0 12px; line-height: 1.1; color: var(--rui-color-text); }
.rui-section-head .rui-section-sub { font-size: 17px; color: var(--rui-color-text-muted); margin: 0; line-height: 1.6; }
/* With a trailing action row the head becomes two columns, so the 760px cap has
   to move off the head and onto the text column or the CTA gets squeezed. */
.rui-section-head[data-has-actions="true"] {
  max-width: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rui-spacing-l);
}
.rui-section-head-text { max-width: 760px; min-width: 0; }
.rui-section-actions { flex: 0 0 auto; display: flex; align-items: center; gap: var(--rui-spacing-s); }
${below("sm")} {
  .rui-section-head[data-has-actions="true"] { flex-direction: column; }
}

/* ====================================================================== *
 * Overlay positioning (Part II.3)
 * ====================================================================== */
.rui-overlay { position: relative; display: inline-block; }
.rui-overlay > .rui-overlay-base { display: block; }
.rui-overlay-item { position: absolute; z-index: 2; }
.rui-overlay-item[data-anchor="top-left"] { top: var(--ak-ov-off, 8px); left: var(--ak-ov-off, 8px); }
.rui-overlay-item[data-anchor="top-right"] { top: var(--ak-ov-off, 8px); right: var(--ak-ov-off, 8px); }
.rui-overlay-item[data-anchor="bottom-left"] { bottom: var(--ak-ov-off, 8px); left: var(--ak-ov-off, 8px); }
.rui-overlay-item[data-anchor="bottom-right"] { bottom: var(--ak-ov-off, 8px); right: var(--ak-ov-off, 8px); }
.rui-overlay-item[data-anchor="top"] { top: var(--ak-ov-off, 8px); left: 50%; transform: translateX(-50%); }
.rui-overlay-item[data-anchor="bottom"] { bottom: var(--ak-ov-off, 8px); left: 50%; transform: translateX(-50%); }
.rui-overlay-item[data-anchor="left"] { left: var(--ak-ov-off, 8px); top: 50%; transform: translateY(-50%); }
.rui-overlay-item[data-anchor="right"] { right: var(--ak-ov-off, 8px); top: 50%; transform: translateY(-50%); }
.rui-overlay-item[data-anchor="center"] { top: 50%; left: 50%; transform: translate(-50%, -50%); }

/* ====================================================================== *
 * Marketing composites (Part VIII.1)
 * ====================================================================== */
.rui-navbar2 { display: flex; align-items: center; gap: 20px; height: 64px; padding: 0 var(--rui-spacing-l); border-bottom: var(--rui-border-width) solid var(--rui-color-border); background: color-mix(in srgb, var(--rui-color-bg) 78%, transparent); }
.rui-navbar2[data-sticky="true"] { position: sticky; top: 0; z-index: var(--rui-z-sticky); }
.rui-navbar2[data-blur="true"] { backdrop-filter: saturate(180%) blur(14px); -webkit-backdrop-filter: saturate(180%) blur(14px); }
.rui-navbar2-links { display: flex; align-items: center; gap: 4px; }
.rui-navbar2-links .rui-link { color: var(--rui-color-text-muted); font-weight: 500; padding: 8px 12px; border-radius: var(--rui-radius-sm); text-decoration: none; font-size: 14.5px; }
.rui-navbar2-links .rui-link:hover { color: var(--rui-color-text); background: var(--rui-color-surface-muted); }
.rui-navbar2-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.rui-navbar2-burger { display: none; align-items: center; justify-content: center; width: 38px; height: 38px; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-sm); background: transparent; color: var(--rui-color-text); cursor: pointer; font-size: var(--rui-font-size-lg); }
.rui-navbar2-burger:hover { background: var(--rui-color-surface-muted); }
.rui-navbar2-burger:focus-visible { outline: 2px solid var(--rui-color-focus-ring); outline-offset: 2px; }
${below("md")} {
  .rui-navbar2 { position: relative; }
  .rui-navbar2-links { display: none; }
  .rui-navbar2-burger { display: inline-flex; order: 99; }
  /* Burger-open: the links row becomes a dropdown panel under the bar. */
  .rui-navbar2[data-menu-open="true"] .rui-navbar2-links {
    display: flex; flex-direction: column; align-items: stretch; gap: 2px;
    position: absolute; top: 100%; left: 0; right: 0; z-index: var(--rui-z-dropdown);
    padding: 10px var(--rui-spacing-l) 14px;
    background: var(--rui-color-bg); border-bottom: var(--rui-border-width) solid var(--rui-color-border);
    box-shadow: var(--rui-shadow-lg);
  }
  .rui-navbar2[data-menu-open="true"] .rui-navbar2-links .rui-link { padding: 11px 12px; font-size: var(--rui-font-size-15); }
}

.rui-brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: var(--rui-font-size-18); letter-spacing: -0.02em; color: var(--rui-color-text); text-decoration: none; }
.rui-brand-logo { width: 32px; height: 32px; border-radius: var(--rui-radius-sm); object-fit: contain; }
.rui-brand-version { font-size: var(--rui-font-size-11); font-weight: 700; color: var(--rui-color-text-muted); background: var(--rui-color-surface-muted); border: var(--rui-border-width) solid var(--rui-color-border); padding: 2px 7px; border-radius: var(--rui-radius-pill); }

.rui-logocloud { text-align: center; }
.rui-logocloud-label { font-size: 12.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--rui-color-text-muted); margin: 0 0 22px; }
.rui-logocloud-row { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; }
.rui-logochip { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; font-size: var(--rui-font-size-15); color: var(--rui-color-text); padding: 11px 18px; border-radius: var(--rui-radius-md); border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); transition: transform .2s, box-shadow .2s; }
.rui-logochip:hover { transform: translateY(-3px); box-shadow: var(--rui-shadow-md); }
.rui-logochip .rui-icon { font-size: var(--rui-font-size-20); }
/* A full-resolution customer wordmark would otherwise blow the trust band apart. */
.rui-logochip-logo { height: 22px; max-width: 110px; object-fit: contain; display: block; }

.rui-metricstrip { display: grid; grid-template-columns: repeat(var(--ak-metric-cols, 4), minmax(0, 1fr)); gap: var(--rui-spacing-m); margin: var(--rui-spacing-l) 0; }
${below("md")} { .rui-metricstrip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* No position/overflow: those were the leftovers of a removed gradient accent
   bar, and the clip would cut off a popover placed inside a metric tile. */
.rui-metric { border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); border-radius: var(--rui-radius-lg); padding: 26px 22px; }
.rui-metric-value { font-size: clamp(28px, 4vw, 42px); font-weight: 900; letter-spacing: -0.03em; line-height: 1; }
.rui-metric-value[data-gradient="true"] { background: var(--rui-gradient-brand); -webkit-background-clip: text; background-clip: text; color: transparent; }
.rui-metric-label { font-size: var(--rui-font-size-base); color: var(--rui-color-text-muted); margin-top: 6px; }
.rui-metric-trend { font-size: var(--rui-font-size-13); font-weight: 650; margin-top: 8px; color: var(--rui-color-text-muted); }
.rui-metric-trend[data-dir="up"] { color: var(--rui-color-success-text); }
.rui-metric-trend[data-dir="down"] { color: var(--rui-color-danger-text); }

/* No overflow: hidden and no backdrop-filter. The filter did nothing over the
   opaque surface but made the frame a containing block for position: fixed, so a
   Modal or FAB in the live preview anchored to the window instead of the
   viewport; the clip cut off any Dropdown/Select/Tooltip at the rounded edge.
   The rounded look is preserved by clipping the two children instead. */
.rui-codewindow { border: var(--rui-border-width) solid var(--rui-color-border); border-radius: 22px; overflow: visible; background: var(--rui-color-surface); box-shadow: var(--rui-shadow-lg); }
.rui-codewindow > .rui-window-bar { border-radius: 21px 21px 0 0; }
.rui-window-bar { display: flex; align-items: center; gap: 8px; padding: 13px 18px; border-bottom: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface-muted); }
.rui-window-dots { display: flex; gap: 7px; }
.rui-window-dots i { width: 12px; height: 12px; border-radius: 50%; display: block; }
.rui-window-dots i:nth-child(1) { background: #ff5f57; } .rui-window-dots i:nth-child(2) { background: #febc2e; } .rui-window-dots i:nth-child(3) { background: #28c840; }
.rui-window-file { margin-left: 8px; font-family: var(--rui-font-family-mono); font-size: 12.5px; color: var(--rui-color-text-muted); }
.rui-window-status { margin-left: auto; display: inline-flex; align-items: center; }
.rui-window-live { display: inline-flex; align-items: center; gap: 7px; font-size: var(--rui-font-size-sm); font-weight: 600; color: var(--rui-color-success-text); }
.rui-window-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--rui-color-success, #10b981); animation: akLivePulse 1.8s infinite; }
@keyframes akLivePulse { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.55); } 70% { box-shadow: 0 0 0 9px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
@media (prefers-reduced-motion: reduce) { .rui-window-live-dot { animation: none; } }
.rui-codewindow-body { display: grid; grid-template-columns: 1fr; }
.rui-codewindow-body[data-split="true"] { grid-template-columns: 1fr 1fr; }
/* Bottom corners are rounded on the panes themselves rather than clipped by the
   frame, so an overlay opened in the preview pane can still escape the window. */
.rui-codewindow-body > .rui-codewindow-code { border-bottom-left-radius: 21px; border-bottom-right-radius: 21px; }
.rui-codewindow-body[data-split="true"] > .rui-codewindow-code { border-bottom-right-radius: 0; }
.rui-codewindow-body[data-split="true"] > .rui-codewindow-preview { border-bottom-right-radius: 21px; }
${below("lg")} {
  .rui-codewindow-body[data-split="true"] { grid-template-columns: 1fr; }
  /* Stacked: the code pane is no longer the bottom row. */
  .rui-codewindow-body[data-split="true"] > .rui-codewindow-code { border-bottom-left-radius: 0; }
  .rui-codewindow-body[data-split="true"] > .rui-codewindow-preview { border-bottom-left-radius: 21px; }
}
.rui-codewindow-code { min-width: 0; background: #0e0b1c; }
/* The internal CodeBlock is chromeless (header=false) — keep it transparent
   so the window's dark pane shows through, and give the code air. */
.rui-codewindow-code .rui-code-block { background: transparent; height: 100%; }
.rui-codewindow-code .rui-code-block-pre { padding: 22px; font-size: var(--rui-font-size-13); line-height: 1.75; color: #e6e3ff; }
.rui-codewindow-preview { padding: 22px; min-width: 0; border-left: var(--rui-border-width) solid var(--rui-color-border); background: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--rui-color-primary) 16%, transparent) 1px, transparent 0) 0 0 / 22px 22px, var(--rui-color-bg); }
.rui-codewindow-preview aktion-app { display: block; }
${below("lg")} { .rui-codewindow-preview { border-left: none; border-top: var(--rui-border-width) solid var(--rui-color-border); } }
/* The frame exists to wrap live UI demos, so it must not clip: overflow: hidden
   reproduced the dropdown-clipping bug by construction for every Select /
   Tooltip / DatePicker inside. Authors opt back into the screenshot look with
   data-clip; the bar keeps its own rounded top so the frame still reads hard-edged. */
.rui-browserframe { border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-lg); overflow: visible; background: var(--rui-color-surface); box-shadow: var(--rui-shadow-md); }
.rui-browserframe[data-clip="true"] { overflow: hidden; }
.rui-browserframe-bar { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface-muted); border-radius: calc(var(--rui-radius-lg) - var(--rui-border-width)) calc(var(--rui-radius-lg) - var(--rui-border-width)) 0 0; }
.rui-browserframe-url { flex: 1; font-family: var(--rui-font-family-mono); font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); background: var(--rui-color-bg); border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-pill); padding: 4px 12px; text-align: center; }
.rui-terminal { border-radius: var(--rui-radius-lg); overflow: hidden; border: var(--rui-border-width) solid var(--rui-color-border); box-shadow: var(--rui-shadow-md); }
.rui-terminal-body { background: #0e0b1c; color: #e6e3ff; font-family: var(--rui-font-family-mono); font-size: var(--rui-font-size-13); line-height: 1.8; padding: 18px 20px; white-space: pre-wrap; }
/* user-select: none is the whole point of the prompt marker — copying the block
   has to yield just the commands, and the component cannot express that without
   inlining a style on every line. */
.rui-terminal-prompt { user-select: none; -webkit-user-select: none; color: var(--rui-color-primary); font-weight: 700; }
.rui-terminal-line { display: inline; }

.rui-swatch { border-radius: var(--rui-radius-md); padding: 18px; border: var(--rui-border-width) solid var(--rui-color-border); min-height: 120px; display: flex; flex-direction: column; justify-content: flex-end; transition: transform .3s, box-shadow .3s; }
.rui-swatch:hover { transform: translateY(-4px); box-shadow: var(--rui-shadow-lg); }
/* Swatch is a real button once onClick is given; the UA button defaults (auto
   width, centred text, system font) break the tile layout. */
button.rui-swatch { width: 100%; text-align: left; font: inherit; cursor: pointer; }
.rui-swatch[data-selected="true"] { border-color: var(--rui-color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-primary) 45%, transparent); }
.rui-swatch:focus-visible { outline: 2px solid var(--rui-color-primary); outline-offset: 2px; }
.rui-swatch-dots { display: flex; gap: 6px; margin-bottom: 12px; }
.rui-swatch-dots i { width: 16px; height: 16px; border-radius: 50%; display: block; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
.rui-swatch-name { font-weight: 700; font-size: var(--rui-font-size-15); }

.rui-footer { border-top: var(--rui-border-width) solid var(--rui-color-border); padding: var(--rui-spacing-2xl) var(--rui-spacing-l) var(--rui-spacing-xl); background: var(--rui-color-bg); }
.rui-footer-grid { display: grid; grid-template-columns: 2fr repeat(var(--ak-foot-cols, 3), 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; }
${below("lg")} { .rui-footer-grid { grid-template-columns: 1fr 1fr; } }
.rui-footer-tagline { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-base); margin-top: 12px; max-width: 36ch; line-height: 1.6; }
.rui-footer-social { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; }
.rui-footer-col h5 { font-size: var(--rui-font-size-13); text-transform: uppercase; letter-spacing: 0.08em; color: var(--rui-color-text-muted); margin: 0 0 12px; }
.rui-footer-col-links { display: flex; flex-direction: column; gap: 8px; }
.rui-footer-col-links .rui-link { color: var(--rui-color-text-muted); font-size: 14.5px; text-decoration: none; }
.rui-footer-col-links .rui-link:hover { color: var(--rui-color-text); }
.rui-footer-legal { max-width: 1180px; margin: 32px auto 0; padding-top: 20px; border-top: var(--rui-border-width) solid var(--rui-color-border); color: var(--rui-color-text-muted); font-size: 13.5px; }

/* Backdrop decoration (Part IV.1) */
.rui-backdrop { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.rui-backdrop[data-fixed="true"] { position: fixed; }
.rui-backdrop-grid { position: absolute; inset: 0; background-image: linear-gradient(color-mix(in srgb, var(--rui-color-primary) 14%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--rui-color-primary) 14%, transparent) 1px, transparent 1px); background-size: 46px 46px; -webkit-mask-image: radial-gradient(ellipse 80% 55% at 50% 0, #000, transparent 70%); mask-image: radial-gradient(ellipse 80% 55% at 50% 0, #000, transparent 70%); }
.rui-backdrop-blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .5; animation: akBlobFloat 18s ease-in-out infinite alternate; }
@keyframes akBlobFloat { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(40px, 36px) scale(1.15); } }
.rui-backdrop-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
@media (prefers-reduced-motion: reduce) { .rui-backdrop-blob { animation: none; } }

/* ThemeToggle */
.rui-theme-toggle { width: 40px; height: 40px; display: inline-grid; place-items: center; border-radius: var(--rui-radius-md); border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); color: var(--rui-color-text-muted); cursor: pointer; transition: .2s; }
.rui-theme-toggle:hover { color: var(--rui-color-text); border-color: var(--rui-color-text-muted); }

/* Utility display components */
/* The button now ships next to its own live region inside a wrapper span, which
   would otherwise be a plain inline box that mis-aligns inside a window bar. */
.rui-copy-button-wrap { display: inline-flex; align-items: center; }
.rui-copy-button[data-icon-only="true"] { padding: 7px; gap: 0; }
.rui-copy-button { display: inline-flex; align-items: center; gap: 7px; font-size: var(--rui-font-size-13); font-weight: 600; padding: 7px 12px; border-radius: var(--rui-radius-button); border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); color: var(--rui-color-text); cursor: pointer; transition: .15s; }
.rui-copy-button:hover { border-color: var(--rui-color-primary); }
.rui-copy-button[data-copied="true"] { border-color: var(--rui-color-success, #10b981); color: var(--rui-color-success-text); }
.rui-copy-button[data-copied="true"] .rui-copy-button-icon { color: var(--rui-color-success-text); }
/* The legacy .rui-segmented block is gone: SegmentedControl emits both class
   names, and .rui-segmented button (0,1,1) was out-specifying the themed
   .rui-segmented-control-option, so the base metrics came from the unthemed
   duplicate instead of the block all four themes actually target. */
.rui-fab { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; border: none; background: var(--rui-color-primary); color: var(--rui-color-primary-text); font-size: var(--rui-font-size-20); cursor: pointer; box-shadow: var(--rui-shadow-lg); z-index: var(--rui-z-sticky); transition: transform .2s; }
.rui-fab:hover { transform: scale(1.06); }
/* position / extended / disabled were all emitted with nothing reading them, and
   .rui-fab and .rui-backtotop resolved to byte-identical coordinates, so an app
   with both rendered one reachable circle. */
.rui-fab[data-position="bottom-left"] { left: 24px; right: auto; }
.rui-fab[data-position="bottom-center"] { left: 50%; right: auto; transform: translateX(-50%); }
.rui-fab[data-position="bottom-center"]:hover { transform: translateX(-50%) scale(1.06); }
.rui-fab[data-extended="true"] {
  width: auto;
  height: 52px;
  border-radius: var(--rui-radius-pill);
  padding: 0 22px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.rui-fab-label { font-size: var(--rui-font-size-15); font-weight: 650; }
.rui-fab:disabled { opacity: .5; cursor: not-allowed; box-shadow: var(--rui-shadow-md); }
.rui-fab:disabled:hover { transform: none; }
/* Keep the centring translate — a bare transform: none would slide it right. */
.rui-fab[data-position="bottom-center"]:disabled:hover { transform: translateX(-50%); }
.rui-prose { color: var(--rui-color-text); line-height: 1.7; font-size: var(--rui-font-size-lg); }
.rui-prose h1, .rui-prose h2, .rui-prose h3 { font-family: var(--rui-font-family-heading); color: var(--rui-color-text); line-height: 1.25; margin: 1.6em 0 .6em; }
.rui-prose h1 { font-size: 1.9em; } .rui-prose h2 { font-size: 1.5em; } .rui-prose h3 { font-size: 1.25em; }
.rui-prose p { margin: 0 0 1em; }
.rui-prose a { color: var(--rui-color-primary); text-decoration: underline; }
.rui-prose ul, .rui-prose ol { margin: 0 0 1em; padding-left: 1.4em; }
.rui-prose li { margin: .3em 0; }
.rui-prose blockquote { margin: 1em 0; padding: .4em 1.1em; border-left: 3px solid var(--rui-color-primary); color: var(--rui-color-text-muted); }
.rui-prose code { font-family: var(--rui-font-family-mono); font-size: .9em; background: var(--rui-color-surface-muted); padding: .15em .4em; border-radius: var(--rui-radius-xs); }
.rui-prose pre { background: var(--rui-color-surface-muted); padding: 1em; border-radius: var(--rui-radius-md); overflow: auto; }
.rui-prose[data-size="lg"] { font-size: var(--rui-font-size-18); }
.rui-prose[data-size="sm"] { font-size: var(--rui-font-size-base); }

/* E-commerce / content / utility (Part VIII.2/3/8) */
.rui-pricetag { display: inline-flex; align-items: baseline; gap: 8px; }
.rui-pricetag-now { font-weight: 800; color: var(--rui-color-text); font-size: var(--rui-font-size-18); }
.rui-pricetag[data-size="lg"] .rui-pricetag-now { font-size: var(--rui-font-size-24); }
.rui-pricetag[data-size="sm"] .rui-pricetag-now { font-size: var(--rui-font-size-15); }
.rui-pricetag-was { color: var(--rui-color-text-muted); text-decoration: line-through; font-size: .85em; }
.rui-pricetag-off { font-size: var(--rui-font-size-11); font-weight: 700; color: var(--rui-color-danger-text); background: color-mix(in srgb, var(--rui-color-danger) 14%, transparent); padding: 2px 7px; border-radius: var(--rui-radius-pill); }
/* Unstyled it matched the price weight and size, so a price plus period read as
   two prices. em so it tracks the size variants above. */
.rui-pricetag-period { font-size: .8em; font-weight: 600; color: var(--rui-color-text-muted); }
.rui-qty { display: inline-flex; align-items: center; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); overflow: hidden; }
.rui-qty button { border: none; background: var(--rui-color-surface); color: var(--rui-color-text); width: 34px; height: 34px; font-size: 17px; cursor: pointer; transition: background .15s; }
.rui-qty button:hover:not(:disabled) { background: var(--rui-color-surface-muted); }
.rui-qty button:disabled { opacity: .4; cursor: not-allowed; }
.rui-qty-value { min-width: 38px; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
/* size / disabled were emitted with nothing keying off them, and the value cell
   is now a focusable role=spinbutton, so it needs a ring of its own. */
.rui-qty[data-size="sm"] button { width: 28px; height: 28px; font-size: var(--rui-font-size-15); }
.rui-qty[data-size="sm"] .rui-qty-value { min-width: 30px; font-size: var(--rui-font-size-13); }
.rui-qty[data-size="lg"] button { width: 42px; height: 42px; font-size: 19px; }
.rui-qty[data-size="lg"] .rui-qty-value { min-width: 46px; font-size: 17px; }
.rui-qty[data-disabled="true"] { opacity: .6; }
.rui-qty-value:focus-visible { outline: 2px solid var(--rui-color-primary); outline-offset: -2px; }
/* overflow: visible — a variant Dropdown in the footer action slot is mainstream
   for a product card, and hidden clipped it at the rounded edge. The media pane
   already clips itself, so it just needs its own top corners. */
.rui-product-card { border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-lg); overflow: visible; background: var(--rui-color-surface); transition: transform .25s, box-shadow .25s; }
.rui-product-card:hover { transform: translateY(-4px); box-shadow: var(--rui-shadow-lg); }
.rui-product-card[data-sold-out="true"] { opacity: .6; }
.rui-product-card[data-sold-out="true"]:hover { transform: none; box-shadow: none; }
.rui-product-media { position: relative; aspect-ratio: 4/3; background: var(--rui-color-surface-muted); overflow: hidden; border-radius: calc(var(--rui-radius-lg) - var(--rui-border-width)) calc(var(--rui-radius-lg) - var(--rui-border-width)) 0 0; }
.rui-product-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rui-product-badge { position: absolute; top: 10px; left: 10px; font-size: var(--rui-font-size-11); font-weight: 700; color: var(--rui-color-on-danger); background: var(--rui-color-danger); padding: 3px 9px; border-radius: var(--rui-radius-pill); }
.rui-product-body { padding: 14px 16px; }
.rui-product-title { font-size: var(--rui-font-size-15); font-weight: 700; margin: 0 0 6px; color: var(--rui-color-text); }
/* The title becomes an <a> or a <button> when href/onClick is given — strip the
   UA chrome so it still reads as the heading it replaces. */
.rui-product-title-link { color: inherit; text-decoration: none; background: none; border: 0; padding: 0; margin: 0; font: inherit; text-align: left; cursor: pointer; }
.rui-product-title-link:hover { color: var(--rui-color-primary); }
.rui-product-rating { display: flex; gap: 2px; color: var(--rui-color-warning); font-size: var(--rui-font-size-sm); margin-bottom: 8px; }
.rui-product-reviews { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-sm); font-weight: 500; margin-left: 4px; }
.rui-product-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.rui-product-add { border: none; width: 38px; height: 38px; border-radius: var(--rui-radius-md); background: var(--rui-color-primary); color: var(--rui-color-primary-text); cursor: pointer; display: grid; place-items: center; transition: filter .15s; }
.rui-product-add:hover { filter: brightness(1.08); }
.rui-product-add:disabled { opacity: .45; cursor: not-allowed; filter: none; }
.rui-toc { font-size: var(--rui-font-size-base); }
.rui-toc-title { font-size: var(--rui-font-size-sm); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--rui-color-text-muted); margin-bottom: 10px; }
.rui-toc-list { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--rui-color-border); }
.rui-toc-item a { display: block; padding: 5px 0 5px 14px; color: var(--rui-color-text-muted); text-decoration: none; border-left: 2px solid transparent; margin-left: -2px; transition: color .15s, border-color .15s; }
.rui-toc-item a:hover { color: var(--rui-color-text); border-left-color: var(--rui-color-primary); }
.rui-toc-item[data-level="2"] a { padding-left: 28px; }
.rui-toc-item[data-level="3"] a { padding-left: 42px; }
/* level is clamped to 1-4, so without this an h4 sat flush with an h1 and the
   hierarchy the prop exists to convey collapsed. */
.rui-toc-item[data-level="4"] a { padding-left: 56px; }
/* The hover treatment already existed; this is what makes the tracked active
   entry visible without pointing at it. */
.rui-toc-item[data-active="true"] a { color: var(--rui-color-text); border-left-color: var(--rui-color-primary); font-weight: 600; }
.rui-typing { display: inline-flex; align-items: center; gap: 8px; color: var(--rui-color-text-muted); font-size: var(--rui-font-size-13); }
.rui-typing-dots { display: inline-flex; gap: 4px; }
.rui-typing-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--rui-color-text-muted); display: block; animation: akTyping 1.2s infinite ease-in-out; }
.rui-typing-dots i:nth-child(2) { animation-delay: .15s; }
.rui-typing-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes akTyping { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-5px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .rui-typing-dots i { animation: none; } }
.rui-countdown { display: inline-flex; gap: 10px; }
.rui-countdown-unit { min-width: 56px; text-align: center; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); padding: 10px 6px; background: var(--rui-color-surface); }
.rui-countdown-value { font-size: var(--rui-font-size-24); font-weight: 800; font-variant-numeric: tabular-nums; color: var(--rui-color-text); line-height: 1; }
.rui-countdown-label { font-size: var(--rui-font-size-11); text-transform: uppercase; letter-spacing: .05em; color: var(--rui-color-text-muted); margin-top: 5px; }
.rui-countdown-done { font-weight: 700; color: var(--rui-color-primary); padding: 10px; }
/* Stacks one row above a FloatingActionButton instead of landing on top of it;
   the horizontal edge comes from the shared .rui-fab[data-position] rules. */
.rui-backtotop { bottom: 92px; }

/* ====================================================================== *
 * Layout & motion (Parts II.2, III.2/5/6/7)
 * ====================================================================== */
.rui-split { display: grid; align-items: start; }
.rui-split[data-align="center"] { align-items: center; }
.rui-split[data-align="stretch"] { align-items: stretch; }
.rui-split[data-divider="true"] { position: relative; }
.rui-split[data-divider="true"] > .rui-split-pane:first-child { border-right: var(--rui-border-width) solid var(--rui-color-border); padding-right: var(--rui-spacing-l); }
.rui-split-pane[data-sticky="true"] { position: sticky; top: 88px; align-self: start; }
/* One threshold per stackAt level, so the enum's three values are three real
   behaviours. Everything that only makes sense side-by-side — the first pane's
   divider rule, its gutter padding, a sticky pane — has to be undone at the
   same width that level collapses, and the reverseOnStack order swap can only
   live in a media query or it would also flip the desktop layout. */
${below("lg")} {
  .rui-split[data-stack="lg"] { grid-template-columns: 1fr !important; }
  .rui-split[data-stack="lg"] > .rui-split-pane:first-child { border-right: none; padding-right: 0; }
  .rui-split[data-stack="lg"] .rui-split-pane[data-sticky="true"] { position: static; }
  .rui-split[data-stack="lg"][data-reverse-stack="true"] > .rui-split-pane:first-child { order: 2; }
  .rui-split[data-stack="lg"][data-reverse-stack="true"] > .rui-split-pane:last-child { order: 1; }
}
${below("md")} {
  .rui-split[data-stack="md"] { grid-template-columns: 1fr !important; }
  .rui-split[data-stack="md"] > .rui-split-pane:first-child { border-right: none; padding-right: 0; }
  .rui-split[data-stack="md"] .rui-split-pane[data-sticky="true"] { position: static; }
  .rui-split[data-stack="md"][data-reverse-stack="true"] > .rui-split-pane:first-child { order: 2; }
  .rui-split[data-stack="md"][data-reverse-stack="true"] > .rui-split-pane:last-child { order: 1; }
}
${below("sm")} {
  .rui-split[data-stack="sm"] { grid-template-columns: 1fr !important; }
  .rui-split[data-stack="sm"] > .rui-split-pane:first-child { border-right: none; padding-right: 0; }
  .rui-split[data-stack="sm"] .rui-split-pane[data-sticky="true"] { position: static; }
  .rui-split[data-stack="sm"][data-reverse-stack="true"] > .rui-split-pane:first-child { order: 2; }
  .rui-split[data-stack="sm"][data-reverse-stack="true"] > .rui-split-pane:last-child { order: 1; }
}

/* Bento — track count and spans flow through custom properties (data-cols →
   --rui-bento-cols, BentoCell inline --rui-cell-col/row) so the responsive
   collapse below can re-shape the grid without fighting inline styles. */
.rui-bento { display: grid; grid-template-columns: repeat(var(--rui-bento-cols, 6), minmax(0, 1fr)); gap: var(--rui-spacing-m); grid-auto-rows: var(--rui-bento-row, minmax(110px, auto)); }
.rui-bento[data-dense="true"] { grid-auto-flow: dense; }
${spacingAttrRules(".rui-bento", "data-gap", (v) => `gap: ${v};`)}
.rui-bento[data-cols="1"] { --rui-bento-cols: 1; }
.rui-bento[data-cols="2"] { --rui-bento-cols: 2; }
.rui-bento[data-cols="3"] { --rui-bento-cols: 3; }
.rui-bento[data-cols="4"] { --rui-bento-cols: 4; }
.rui-bento[data-cols="5"] { --rui-bento-cols: 5; }
.rui-bento[data-cols="6"] { --rui-bento-cols: 6; }
.rui-bento[data-cols="7"] { --rui-bento-cols: 7; }
.rui-bento[data-cols="8"] { --rui-bento-cols: 8; }
.rui-bento-cell { min-width: 0; min-height: 0; display: flex; flex-direction: column; grid-column: span var(--rui-cell-col, 1); grid-row: span var(--rui-cell-row, 1); }
.rui-bento-cell > * { flex: 1 1 auto; min-height: 0; }
.rui-bento-cell[data-span="full"] { grid-column: 1 / -1; }
${below("lg")} {
  .rui-bento[data-cols] { --rui-bento-cols: 2; }
  .rui-bento[data-cols] > .rui-bento-cell { grid-column: span 1; grid-row: span 1; }
  .rui-bento[data-cols] > .rui-bento-cell[data-span="wide"],
  .rui-bento[data-cols] > .rui-bento-cell[data-span="hero"],
  .rui-bento[data-cols] > .rui-bento-cell[data-span="full"] { grid-column: 1 / -1; }
}
${below("sm")} {
  .rui-bento[data-cols] { --rui-bento-cols: 1; }
}

.rui-reveal { opacity: 0; transition: opacity .6s cubic-bezier(.22,1,.36,1), transform .6s cubic-bezier(.22,1,.36,1); }
.rui-reveal[data-anim="fade-up"] { transform: translateY(28px); }
.rui-reveal[data-anim="fade-down"] { transform: translateY(-28px); }
.rui-reveal[data-anim="fade-left"] { transform: translateX(28px); }
.rui-reveal[data-anim="fade-right"] { transform: translateX(-28px); }
.rui-reveal[data-anim="zoom"] { transform: scale(.92); }
.rui-reveal[data-anim="slide-up"] { transform: translateY(60px); }
.rui-reveal.is-revealed { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .rui-reveal { opacity: 1 !important; transform: none !important; transition: none; } }

/* Transition — enter/exit choreography (III.3). data-state flips enter↔exit. */
.rui-transition { display: contents; }
.rui-transition > * {
  transition: opacity var(--rui-transition-ms, 280ms) cubic-bezier(.22,1,.36,1),
              transform var(--rui-transition-ms, 280ms) cubic-bezier(.22,1,.36,1);
}
/* pointer-events off while exiting: the child is invisible but still
   hit-testable for the whole duration, which on an overlay is a click blocker. */
.rui-transition[data-state="exit"] > * { opacity: 0; pointer-events: none; }
.rui-transition[data-state="enter"] > * { opacity: 1; transform: none; }
.rui-transition[data-preset="scale"][data-state="exit"] > * { transform: scale(.94); }
.rui-transition[data-preset="slide-up"][data-state="exit"] > * { transform: translateY(12px); }
.rui-transition[data-preset="slide-down"][data-state="exit"] > * { transform: translateY(-12px); }
.rui-transition[data-preset="slide-left"][data-state="exit"] > * { transform: translateX(12px); }
.rui-transition[data-preset="slide-right"][data-state="exit"] > * { transform: translateX(-12px); }
@media (prefers-reduced-motion: reduce) { .rui-transition > * { transition: none !important; transform: none !important; } }

/* A11y primitives (X.3) ------------------------------------------------- */
.rui-visually-hidden {
  position: absolute !important;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.rui-skip-link {
  /* fixed, not absolute: nothing in the tree establishes a positioned ancestor,
     so absolute resolved against the initial containing block and put the
     revealed link at top: 8px in DOCUMENT coordinates — on a scrolled page the
     browser jumped to the top to show it, and inside any position: relative
     wrapper it appeared mid-page. */
  position: fixed;
  left: 8px; top: -48px;
  z-index: var(--rui-z-skip-link);
  padding: 8px 14px;
  background: var(--rui-color-primary);
  color: var(--rui-color-primary-text);
  border-radius: var(--rui-radius-md);
  text-decoration: none;
  transition: top .15s ease;
}
.rui-skip-link:focus { top: 8px; outline: 2px solid var(--rui-color-primary); outline-offset: 2px; }
.rui-live-region { font-size: .875rem; color: var(--rui-color-text-muted); }
.rui-focus-trap { display: contents; }
/* OnClick (role=button, tabindex=0) and OnKeyboard are display: contents, so they
   generate no box and NEITHER the UA outline nor a theme ring can be painted on
   the wrapper itself — focus landed on a clickable card with nothing on screen to
   show it. Forwarding the ring to the child is the only way to show focus without
   giving the wrapper a box, which would change layout. */
.rui-wrapper[tabindex]:focus-visible { outline: none; }
.rui-wrapper[tabindex]:focus-visible > * {
  outline: 2px solid var(--rui-color-primary);
  outline-offset: 2px;
}

/* Forced-colors / high-contrast (X.4): keep focus + borders visible when the
   OS high-contrast mode strips theme colors. */
@media (forced-colors: active) {
  .rui-button, .rui-card, .rui-input, .rui-badge, .rui-tag,
  .rui-select, .rui-textarea, .rui-table, .rui-modal {
    border: var(--rui-border-width) solid CanvasText;
  }
  .rui-button:focus-visible, .rui-input:focus-visible,
  .rui-nav-link:focus-visible, a:focus-visible, [tabindex]:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
  .ak-anim, .rui-transition > * { forced-color-adjust: auto; }
  /* Same trap as the soft-theme titles: these paint their glyphs by clipping a
     background to the text and setting the fill transparent. Forced colors
     replaces the background image, so without this they render as nothing.
     Declared here rather than beside the components because this block is
     downstream of them and the selectors weigh the same. */
  .rui-gradient-text,
  .rui-metric-value[data-gradient="true"] {
    background: none;
    color: CanvasText;
    -webkit-text-fill-color: currentColor;
  }
}

/* Wave-3 components (QR, reactions, cursor, tab bar, cart) ---------------- */
.rui-qrcode { display: inline-block; line-height: 0; }
.rui-qrcode-error { font-size: 0.8rem; color: var(--rui-color-danger-text); padding: 8px; }
.rui-reaction-picker { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.rui-reaction {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 999px;
  border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface);
  cursor: pointer; font-size: 0.85rem; transition: background .12s, border-color .12s;
}
.rui-reaction:hover { background: color-mix(in srgb, var(--rui-color-primary) 6%, transparent); }
.rui-reaction[data-active="true"] { border-color: var(--rui-color-primary); background: color-mix(in srgb, var(--rui-color-primary) 12%, transparent); }
.rui-reaction-count { color: var(--rui-color-text-muted); font-variant-numeric: tabular-nums; }
.rui-live-cursor { position: absolute; top: 0; left: 0; pointer-events: none; z-index: var(--rui-z-toast); will-change: transform; }
.rui-live-cursor-label { position: absolute; top: 16px; left: 14px; padding: 1px 7px; border-radius: 6px; color: #fff; font-size: 0.72rem; white-space: nowrap; }
.rui-tabbar {
  display: flex; align-items: stretch; justify-content: space-around;
  border-top: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface);
  padding-bottom: env(safe-area-inset-bottom);
}
.rui-tabbar-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 4px 6px; border: none; background: none; cursor: pointer;
  color: var(--rui-color-text-muted); font-size: 0.7rem;
}
.rui-tabbar-item[data-active="true"] { color: var(--rui-color-primary); }
.rui-tabbar-icon-wrap { position: relative; font-size: 1.15rem; line-height: 1; }
.rui-tabbar-badge { position: absolute; top: -4px; right: -8px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px; background: var(--rui-color-danger); color: var(--rui-color-on-danger); font-size: 0.6rem; display: flex; align-items: center; justify-content: center; }
.rui-cart { display: flex; flex-direction: column; gap: 2px; }
.rui-cart-empty { padding: 24px; text-align: center; color: var(--rui-color-text-muted); }
.rui-cart-line { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: var(--rui-border-width) solid var(--rui-color-border); }
.rui-cart-thumb { width: 48px; height: 48px; border-radius: var(--rui-radius-md, 8px); object-fit: cover; flex-shrink: 0; }
.rui-cart-body { flex: 1; min-width: 0; }
.rui-cart-name { font-weight: 500; }
.rui-cart-price { color: var(--rui-color-text-muted); font-size: 0.85rem; }
.rui-cart-qty { display: inline-flex; align-items: center; gap: 8px; }
.rui-cart-qty-btn { width: 26px; height: 26px; border-radius: 6px; border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); cursor: pointer; font-size: 1rem; line-height: 1; }
.rui-cart-qty-value { min-width: 20px; text-align: center; font-variant-numeric: tabular-nums; }
.rui-cart-line-total { font-weight: 600; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
.rui-cart-remove { border: none; background: none; cursor: pointer; color: var(--rui-color-text-muted); padding: 4px; }
.rui-cart-remove:hover { color: var(--rui-color-danger-text); }
.rui-cart-foot { display: flex; justify-content: space-between; padding: 12px 0; font-weight: 600; }

/* Calendar (scheduling) ------------------------------------------------- */
/* Calendar (VIII.6) — Google Calendar-style month grid. Its own rui-gcal
   namespace keeps it independent from CalendarView's rui-calendar styles. */
.rui-gcal { width: 100%; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-lg, 12px); background: var(--rui-color-surface); overflow: hidden; }
.rui-gcal-toolbar { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: var(--rui-border-width) solid var(--rui-color-border); }
.rui-gcal-today { font: inherit; font-size: var(--rui-font-size-13); font-weight: 600; color: var(--rui-color-text); background: var(--rui-color-surface); border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-pill, 99px); padding: 5px 14px; cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
.rui-gcal-today:hover { background: var(--rui-color-surface-muted); border-color: var(--rui-color-text-muted); }
.rui-gcal-nav { width: 30px; height: 30px; display: grid; place-items: center; border: none; background: transparent; color: var(--rui-color-text-muted); border-radius: 50%; cursor: pointer; font-size: var(--rui-font-size-13); transition: background 120ms ease, color 120ms ease; }
.rui-gcal-nav:hover { background: var(--rui-color-surface-muted); color: var(--rui-color-text); }
.rui-gcal-title { margin-left: 8px; font-size: var(--rui-font-size-lg); font-weight: 600; color: var(--rui-color-text); letter-spacing: -0.01em; }
.rui-gcal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.rui-gcal-weekday { text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; color: var(--rui-color-text-muted); padding: 8px 0 6px; border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle, var(--rui-color-border)); }
.rui-gcal-day { position: relative; min-height: clamp(64px, 9vw, 96px); padding: 4px 4px 6px; display: flex; flex-direction: column; align-items: stretch; gap: 2px; font: inherit; text-align: center; color: var(--rui-color-text); background: var(--rui-color-surface); border: none; border-bottom: var(--rui-border-width) solid var(--rui-color-border-subtle, var(--rui-color-border)); border-right: var(--rui-border-width) solid var(--rui-color-border-subtle, var(--rui-color-border)); cursor: pointer; transition: background 120ms ease; }
/* Each week is now its own role="row" wrapper (display: contents), so no day is a
   direct child of the grid any more: the trailing cell is the 7th child of its
   ROW, and the bottom edge is every cell of the LAST row. */
.rui-gcal-row > .rui-gcal-day:nth-child(7n) { border-right: none; }
.rui-gcal-grid > .rui-gcal-row:last-child > .rui-gcal-day { border-bottom: none; }
.rui-gcal-day:hover { background: color-mix(in srgb, var(--rui-color-primary) 5%, var(--rui-color-surface)); }
/* minDate/maxDate/disabledDates render blocked cells with the native disabled
   attribute plus data-disabled, but the base rule declares cursor: pointer and a
   hover wash — so a blacked-out day looked selectable right up to the dead click. */
.rui-gcal-day[data-disabled="true"] { cursor: not-allowed; background: var(--rui-color-surface-muted); }
.rui-gcal-day[data-disabled="true"] .rui-gcal-daynum { color: var(--rui-color-text-muted); opacity: 0.45; }
.rui-gcal-day[data-disabled="true"]:hover { background: var(--rui-color-surface-muted); }
.rui-gcal-day[data-in-month="false"] .rui-gcal-daynum { color: var(--rui-color-text-muted); opacity: 0.55; }
.rui-gcal-daynum { width: 24px; height: 24px; margin: 0 auto; display: grid; place-items: center; border-radius: 50%; font-size: var(--rui-font-size-sm); font-weight: 500; line-height: 1; }
.rui-gcal-day[data-today="true"] .rui-gcal-daynum { background: var(--rui-color-primary); color: var(--rui-color-primary-text); font-weight: 700; }
.rui-gcal-day[data-selected="true"] { background: color-mix(in srgb, var(--rui-color-primary) 10%, var(--rui-color-surface)); }
.rui-gcal-day[data-selected="true"]:not([data-today="true"]) .rui-gcal-daynum { background: color-mix(in srgb, var(--rui-color-primary) 18%, transparent); color: var(--rui-color-primary); font-weight: 700; }
.rui-gcal-events { display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-height: 0; }
/* Chips are only interactive when onEventClick is supplied. */
.rui-gcal-chip[data-clickable="true"] { cursor: pointer; }
.rui-gcal-chip[data-clickable="true"]:hover { filter: brightness(1.1); }
.rui-gcal-chip { display: block; font-size: 10.5px; font-weight: 600; line-height: 1.6; padding: 0 6px; border-radius: 4px; background: var(--rui-gcal-chip, var(--rui-color-primary)); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
.rui-gcal-dots { display: flex; justify-content: center; gap: 3px; padding: 1px 0; }
.rui-gcal-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--rui-color-primary); }
.rui-gcal-more { font-size: 10.5px; font-weight: 600; color: var(--rui-color-text-muted); text-align: left; padding: 0 6px; }
${below("sm")} {
  .rui-gcal-chip, .rui-gcal-more, .rui-gcal-dots { display: none; }
  .rui-gcal-day { min-height: 48px; }
  /* Collapse all event detail into a single presence dot per day. */
  .rui-gcal-events::after { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--rui-color-primary); margin: 1px auto 0; }
}

.rui-gesture { touch-action: pan-y; }
.rui-parallax { display: block; }
.rui-flip-list { display: flex; flex-direction: column; gap: var(--rui-spacing-s); }
.rui-flip-list > * { will-change: transform; }
.rui-lottie { display: inline-block; }
.rui-lottie-empty { background: color-mix(in srgb, var(--rui-color-text-muted) 8%, transparent); border-radius: var(--rui-radius-md, 8px); }
/* Interactive canvas / editors (VIII.7) */
.rui-drawing-canvas, .rui-signature-pad { position: relative; display: inline-block; }
.rui-canvas-surface { display: block; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md, 8px); background: var(--rui-color-surface); cursor: crosshair; }
/* Deliberately light in every theme: signature ink is dark, so a dark pad
   would be unusable. Expressed as a token so a theme can still override it
   (e.g. a dark theme that also inverts the ink). */
.rui-signature-pad .rui-canvas-surface { background: var(--rui-signature-surface, #fff); }
/* The guide now hangs off .rui-signature-surface (the box around the canvas), not
   off the pad root, so it no longer has to clear a toolbar. */
.rui-signature-surface { position: relative; display: block; }
.rui-signature-baseline { position: absolute; left: 16px; right: 16px; bottom: 14px; border-bottom: 1px dashed var(--rui-color-border); pointer-events: none; }
/* Stated here as well as inline, so a consumer overriding the sheet still gets a
   portal layer that stacks above ordinary content. */
.rui-portal-layer { position: relative; z-index: var(--rui-z-popover); }
/* Deliberately NOT display: contents. It would stop the wrapper introducing a
   block box, but the wrapper is what carries aria-busy for the in-flight subtree,
   and a box-less element's ARIA is unreliable across engines. A block box here is
   the cheaper trade. */
.rui-async { min-width: 0; }
.rui-canvas-toolbar { display: flex; justify-content: flex-end; padding-top: 6px; }
.rui-canvas-clear { padding: 4px 12px; border-radius: var(--rui-radius-md, 8px); border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); cursor: pointer; font-size: 0.8rem; }
.rui-canvas-clear:hover { border-color: var(--rui-color-primary); color: var(--rui-color-primary); }
/* The stale duplicate ColorPicker block that used to sit here is gone. It
   redefined the same selectors at equal specificity and won on source order:
   the root flipped to inline-flex (which shrink-wrapped the hex field to
   unusable), the swatch row flipped from a wrapping row of 24px circles to a
   rigid repeat(8, 1fr) grid of squares (rendering a 12-colour palette as a
   ragged 8 + 4), and the active swatch painted two competing indicators. Its
   -top / -input / -value selectors were dead anyway — the component emits
   -row / -color / -hex. The intended block lives with the other editor rules. */
/* ErrorBoundary friendly card (XIV.4) */
.rui-error-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; text-align: center; border: var(--rui-border-width) solid color-mix(in srgb, var(--rui-color-danger) 30%, var(--rui-color-border)); border-radius: var(--rui-radius-lg, 12px); background: color-mix(in srgb, var(--rui-color-danger) 5%, var(--rui-color-surface)); color: var(--rui-color-text); }
.rui-error-card-icon { font-size: 1.6rem; color: var(--rui-color-danger); }
.rui-error-card-title { font-weight: 600; }
.rui-error-card-message { font-family: var(--rui-font-family-mono); font-size: 0.8rem; color: var(--rui-color-text-muted); word-break: break-word; }
/* RouteView page transitions (IV.4) — the keyed wrapper replays on route change. */
.rui-route-view { display: block; }
.rui-route-page[data-anim] { animation: routeEnter var(--rui-route-ms, 300ms) cubic-bezier(.22,1,.36,1) both; }
.rui-route-page[data-anim="fade-up"] { animation-name: routeEnterUp; }
.rui-route-page[data-anim="fade-down"] { animation-name: routeEnterDown; }
.rui-route-page[data-anim="fade-left"] { animation-name: routeEnterLeft; }
.rui-route-page[data-anim="fade-right"] { animation-name: routeEnterRight; }
.rui-route-page[data-anim="zoom"] { animation-name: routeEnterZoom; }
.rui-route-page[data-anim="slide-up"] { animation-name: routeEnterSlideUp; }
@keyframes routeEnter { from { opacity: 0; } to { opacity: 1; } }
@keyframes routeEnterUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes routeEnterDown { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: none; } }
@keyframes routeEnterLeft { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes routeEnterRight { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
@keyframes routeEnterZoom { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@keyframes routeEnterSlideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .rui-route-page { animation: none !important; } }

.rui-sortable { display: flex; flex-direction: column; gap: var(--rui-spacing-s); }
.rui-sortable-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-md); background: var(--rui-color-surface); }
.rui-sortable-item.is-dragging { opacity: .5; }
.rui-sortable-item.is-over { border-color: var(--rui-color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--rui-color-primary) 30%, transparent); }
.rui-sortable-handle { cursor: grab; color: var(--rui-color-text-muted); }
.rui-sortable-body { flex: 1; min-width: 0; }
.rui-draggable { cursor: grab; }
.rui-draggable.is-dragging { opacity: .5; }
.rui-dropzone { border: 2px dashed var(--rui-color-border); border-radius: var(--rui-radius-md); padding: var(--rui-spacing-l); text-align: center; color: var(--rui-color-text-muted); transition: border-color .15s, background .15s; }
.rui-dropzone.is-over { border-color: var(--rui-color-primary); background: color-mix(in srgb, var(--rui-color-primary) 6%, transparent); }
/* Both are functionally inert when disabled; the grab cursor and the dashed
   invitation have to stop advertising an interaction that cannot happen. */
.rui-draggable[data-disabled="true"] { cursor: default; opacity: .6; }
.rui-dropzone[data-disabled="true"] { opacity: .6; border-style: solid; }

.rui-reading-progress { position: fixed; top: 0; left: 0; right: 0; z-index: var(--rui-z-banner); background: transparent; }
.rui-reading-progress-bar { height: 100%; width: 0; background: var(--rui-color-primary); transition: width .1s linear; }
.rui-reading-progress-bar[data-gradient="true"] { background: var(--rui-gradient-brand); }

/* Image blur-up */
.rui-image img[data-blur="true"] { filter: blur(12px); transition: filter .4s ease; }
.rui-image img[data-blur="true"][data-loaded="true"] { filter: none; }

/* ====================================================================== *
 * Extras (Parts VIII, IX)
 * ====================================================================== */
.rui-svg { display: inline-block; vertical-align: middle; }

/* Sheets */
.rui-sheet-root { position: fixed; inset: 0; z-index: var(--rui-z-modal); pointer-events: none; }
.rui-sheet-root[data-open="false"] { visibility: hidden; }
.rui-sheet-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.45); opacity: 0; transition: opacity .25s; }
.rui-sheet-root[data-open="true"] { pointer-events: auto; }
.rui-sheet-root[data-open="true"] .rui-sheet-backdrop { opacity: 1; }
.rui-sheet-panel { position: absolute; background: var(--rui-color-surface); box-shadow: var(--rui-shadow-lg); display: flex; flex-direction: column; transition: transform .3s cubic-bezier(.22,1,.36,1); }
.rui-sheet-root[data-side="right"] .rui-sheet-panel { top: 0; bottom: 0; right: 0; width: min(420px, 90vw); transform: translateX(100%); }
.rui-sheet-root[data-side="left"] .rui-sheet-panel { top: 0; bottom: 0; left: 0; width: min(420px, 90vw); transform: translateX(-100%); }
.rui-sheet-root[data-side="top"] .rui-sheet-panel { top: 0; left: 0; right: 0; max-height: 80vh; transform: translateY(-100%); }
.rui-sheet-root[data-side="bottom"] .rui-sheet-panel { bottom: 0; left: 0; right: 0; max-height: 85vh; border-radius: var(--rui-radius-lg) var(--rui-radius-lg) 0 0; transform: translateY(100%); }
.rui-sheet-root[data-open="true"] .rui-sheet-panel { transform: none; }
.rui-sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: var(--rui-border-width) solid var(--rui-color-border); }
/* Scoped under .rui-sheet-root, which only extras' Sheet/BottomSheet emits —
   Drawer's root is .rui-sheet-overlay. Unscoped these sat after Drawer's own
   mitigation at equal specificity and won it, so a Drawer heading rendered
   17px/700 instead of 16px/600, its body padding lost the theme token, and its
   close glyph shrank from 22px to 16px. */
.rui-sheet-root .rui-sheet-title { font-size: 17px; font-weight: 700; margin: 0; }
.rui-sheet-root .rui-sheet-close { border: none; background: transparent; color: var(--rui-color-text-muted); cursor: pointer; font-size: var(--rui-font-size-lg); width: 32px; height: 32px; border-radius: var(--rui-radius-sm); }
.rui-sheet-root .rui-sheet-close:hover { background: var(--rui-color-surface-muted); color: var(--rui-color-text); }
.rui-sheet-root .rui-sheet-body { padding: 18px; overflow-y: auto; flex: 1; }
/* overscroll-behavior on both copies: once the sheet body reaches its end the
   gesture used to chain to the document — the iOS "modal scrolls the page away
   underneath" bug that the JS scroll lock alone does not cover. */
.rui-sheet-body { overscroll-behavior: contain; }
/* A 4px bar is not a touch target, so the grip is a 20px box drawing the bar
   through ::before. touch-action: none is load-bearing: without it the browser's
   own scroll gesture claims the pointer stream and cancels the drag on touch —
   the only platform where drag-to-dismiss matters. */
.rui-bottomsheet-grip {
  width: 56px;
  height: 20px;
  margin: 6px auto 0;
  background: none;
  display: grid;
  place-items: center;
  touch-action: none;
  cursor: grab;
}
.rui-bottomsheet-grip::before {
  content: "";
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--rui-color-border);
}
.rui-bottomsheet-grip:active { cursor: grabbing; }
.rui-bottomsheet .rui-sheet-title { padding: 6px 18px; }
@media (prefers-reduced-motion: reduce) { .rui-sheet-panel, .rui-sheet-backdrop { transition: none; } }

/* Confirm dialog */
.rui-confirm-root { position: fixed; inset: 0; z-index: var(--rui-z-modal-top); display: grid; place-items: center; pointer-events: none; }
.rui-confirm-root[data-open="false"] { visibility: hidden; }
.rui-confirm-root[data-open="true"] { pointer-events: auto; }
.rui-confirm-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.45); }
.rui-confirm-card { position: relative; background: var(--rui-color-surface); border-radius: var(--rui-radius-lg); box-shadow: var(--rui-shadow-lg); padding: 24px; max-width: 400px; width: calc(100% - 40px); }
.rui-confirm-title { font-size: var(--rui-font-size-18); font-weight: 800; margin: 0 0 8px; }
.rui-confirm-message { color: var(--rui-color-text-muted); margin: 0 0 20px; line-height: 1.5; }
.rui-confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }
.rui-confirm-cancel, .rui-confirm-ok { border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); color: var(--rui-color-text); font-weight: 600; padding: 8px 16px; border-radius: var(--rui-radius-button); cursor: pointer; }
.rui-confirm-cancel:hover { background: var(--rui-color-surface-muted); }
.rui-confirm-ok { border: none; color: var(--rui-color-primary-text); background: var(--rui-color-primary); }
/* Only the fill was toned, so the label kept --rui-color-primary-text (#ffffff in
   five themes): 3.76:1 on the danger fill and 2.15:1 on the warning one, on the
   button that confirms a destructive action. */
.rui-confirm-ok[data-tone="danger"] { background: var(--rui-color-danger); color: var(--rui-color-on-danger); }
.rui-confirm-ok[data-tone="warning"] { background: var(--rui-color-warning); color: var(--rui-color-on-warning); }
/* The tone glyph rides inside the heading; spacing + colour are what make danger
   read at a glance rather than as decoration. */
.rui-confirm-icon { margin-right: 8px; }
.rui-confirm-card[data-tone="danger"] .rui-confirm-icon { color: var(--rui-color-danger); }
.rui-confirm-card[data-tone="warning"] .rui-confirm-icon { color: var(--rui-color-warning); }

/* Presence avatars */
.rui-presence { display: inline-flex; align-items: center; }
/* padding/font reset: with onClick each avatar renders as a <button>, and the UA
   padding and font would break the fixed circle around a 100%-sized img. */
.rui-presence-avatar { width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--rui-color-surface); margin-left: -10px; overflow: hidden; position: relative; background: var(--rui-color-surface-muted); display: grid; place-items: center; padding: 0; font: inherit; }
button.rui-presence-avatar { cursor: pointer; }
/* The size scale has to be declared before the first-child reset below: both tie
   at 0,2,0 and source order decides, so the reset must come last to keep the
   leading avatar flush. */
.rui-presence[data-size="sm"] .rui-presence-avatar,
.rui-presence[data-size="sm"] .rui-presence-more { width: 26px; height: 26px; margin-left: -8px; }
.rui-presence[data-size="sm"] .rui-presence-initials { font-size: var(--rui-font-size-10); }
.rui-presence[data-size="lg"] .rui-presence-avatar,
.rui-presence[data-size="lg"] .rui-presence-more { width: 44px; height: 44px; margin-left: -12px; }
.rui-presence[data-size="lg"] .rui-presence-initials { font-size: var(--rui-font-size-base); }
.rui-presence-avatar:first-child { margin-left: 0; }
.rui-presence[data-size] .rui-presence-avatar:first-child { margin-left: 0; }
.rui-presence-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rui-presence-initials { font-size: var(--rui-font-size-sm); font-weight: 700; color: var(--rui-color-text-muted); }
.rui-presence-avatar[data-online="true"]::after { content: ""; position: absolute; bottom: 0; right: 0; width: 9px; height: 9px; border-radius: 50%; background: var(--rui-color-success); border: 2px solid var(--rui-color-surface); }
.rui-presence-more { width: 34px; height: 34px; border-radius: 50%; margin-left: -10px; background: var(--rui-color-surface-muted); border: 2px solid var(--rui-color-surface); display: grid; place-items: center; font-size: var(--rui-font-size-sm); font-weight: 700; color: var(--rui-color-text-muted); }

/* Share buttons */
.rui-share { display: inline-flex; gap: 8px; }
.rui-share-btn { width: 38px; height: 38px; display: grid; place-items: center; border-radius: var(--rui-radius-md); border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); color: var(--rui-color-text-muted); cursor: pointer; text-decoration: none; transition: .15s; }
.rui-share-btn:hover { color: var(--rui-color-text); border-color: var(--rui-color-primary); transform: translateY(-2px); }
/* The button is a fixed 38x38 grid box, so showLabels text overflowed it. */
.rui-share[data-labels="true"] { flex-wrap: wrap; }
.rui-share[data-labels="true"] .rui-share-btn {
  width: auto;
  height: auto;
  padding: 8px 12px;
  grid-auto-flow: column;
  gap: 8px;
  justify-content: center;
}
.rui-share-label { font-size: var(--rui-font-size-13); font-weight: 600; white-space: nowrap; }

/* Author byline */
.rui-byline { display: inline-flex; align-items: center; gap: 12px; }
.rui-byline-avatar { width: 44px; height: 44px; border-radius: 50%; overflow: hidden; background: var(--rui-color-surface-muted); display: grid; place-items: center; font-weight: 700; color: var(--rui-color-text-muted); }
.rui-byline-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rui-byline-initials { font-size: var(--rui-font-size-15); }
.rui-byline-name { font-weight: 700; color: var(--rui-color-text); }
.rui-byline-sub { font-size: var(--rui-font-size-13); color: var(--rui-color-text-muted); }
.rui-byline-dot { opacity: .6; }

/* Variant selector */
.rui-variants-label { font-size: var(--rui-font-size-13); font-weight: 600; color: var(--rui-color-text-muted); margin-bottom: 8px; }
.rui-variants-row { display: flex; flex-wrap: wrap; gap: 8px; }
.rui-variant { border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); color: var(--rui-color-text); border-radius: var(--rui-radius-md); padding: 7px 14px; cursor: pointer; font-weight: 600; font-size: 13.5px; transition: .15s; }
.rui-variant[data-selected="true"] { border-color: var(--rui-color-primary); box-shadow: 0 0 0 1px var(--rui-color-primary); }
.rui-variant:focus-visible { outline: 2px solid var(--rui-color-focus-ring); outline-offset: 2px; }
/* Out-of-stock variants carry a real disabled attribute; with no visual state a
   sold-out size looked identical to an available one — the exact mistake the
   picker exists to prevent. Swatches keep full opacity and take the conventional
   diagonal strike instead, since fading a colour chip misreports the colour. */
.rui-variant:disabled { opacity: .45; cursor: not-allowed; }
.rui-variants[data-kind="swatch"] .rui-variant { width: 34px; height: 34px; border-radius: 50%; padding: 0; position: relative; }
.rui-variants[data-kind="swatch"] .rui-variant:disabled { opacity: 1; }
.rui-variants[data-kind="swatch"] .rui-variant:disabled::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  background: linear-gradient(to top left,
    transparent calc(50% - 1px),
    var(--rui-color-text-muted) calc(50% - 1px),
    var(--rui-color-text-muted) calc(50% + 1px),
    transparent calc(50% + 1px));
}
.rui-variants[data-kind="swatch"] .rui-variant[data-selected="true"] { box-shadow: 0 0 0 2px var(--rui-color-surface), 0 0 0 4px var(--rui-color-primary); }
/* The check glyph is what stops selection resting on colour + ring alone; it has
   to hold up against an arbitrary author-supplied swatch colour. */
.rui-variants[data-kind="swatch"] .rui-variant-check {
  font-size: var(--rui-font-size-sm);
  color: #fff;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, .6));
  pointer-events: none;
}
/* size was emitted with the 34px swatch / 7px-14px pill padding hardcoded. */
.rui-variants[data-size="sm"] .rui-variant { padding: 4px 10px; font-size: 12.5px; }
.rui-variants[data-size="sm"][data-kind="swatch"] .rui-variant { width: 24px; height: 24px; padding: 0; }

/* Order summary */
.rui-order-summary { border: var(--rui-border-width) solid var(--rui-color-border); border-radius: var(--rui-radius-lg); padding: 18px; background: var(--rui-color-surface); }
.rui-order-line, .rui-order-sub, .rui-order-total { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: var(--rui-font-size-base); }
.rui-order-line { color: var(--rui-color-text-muted); }
/* Without this a long product name in a 320px sidebar pushes the price past the
   card padding: the label has to be allowed to shrink and wrap, the amount must
   not. */
.rui-order-line > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.rui-order-line > span:last-child { white-space: nowrap; flex: none; }
.rui-order-qty { color: var(--rui-color-text-muted); font-variant-numeric: tabular-nums; }
.rui-order-empty { color: var(--rui-color-text-muted); font-size: var(--rui-font-size-base); text-align: center; padding: 12px 0; }
.rui-order-note { margin-top: 10px; font-size: var(--rui-font-size-sm); color: var(--rui-color-text-muted); line-height: 1.4; }
.rui-order-skeleton { border-radius: var(--rui-radius-xs); }
.rui-order-lines { border-bottom: var(--rui-border-width) solid var(--rui-color-border); margin-bottom: 8px; padding-bottom: 6px; }
.rui-order-total { font-weight: 800; font-size: 17px; border-top: var(--rui-border-width) solid var(--rui-color-border); margin-top: 6px; padding-top: 12px; }

/* ScrollSpy */
/* The description promises a sticky in-page nav; the whole base rule used to be
   a font-size, so the nav scrolled away with the page and the active highlight it
   maintains could never be seen. The offset comes from the top prop. */
.rui-scrollspy {
  font-size: var(--rui-font-size-base);
  position: sticky;
  top: var(--rui-scrollspy-top, 16px);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}
.rui-scrollspy-title { font-size: var(--rui-font-size-sm); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--rui-color-text-muted); margin-bottom: 10px; }
.rui-scrollspy-list { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--rui-color-border); }
.rui-scrollspy-item a { display: block; padding: 5px 0 5px 14px; margin-left: -2px; border-left: 2px solid transparent; color: var(--rui-color-text-muted); text-decoration: none; transition: .15s; }
.rui-scrollspy-item a:hover { color: var(--rui-color-text); }
.rui-scrollspy-item a.is-active { color: var(--rui-color-primary); border-left-color: var(--rui-color-primary); font-weight: 600; }

/* SpeedDial */
.rui-speeddial { position: fixed; bottom: 24px; right: 24px; z-index: var(--rui-z-sticky); display: flex; flex-direction: column-reverse; align-items: center; gap: 12px; }
.rui-speeddial-fab { width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--rui-color-primary); color: var(--rui-color-primary-text); font-size: var(--rui-font-size-20); cursor: pointer; box-shadow: var(--rui-shadow-lg); display: grid; place-items: center; transition: transform .2s; }
/* Only the default plus glyph morphs into an x — rotating an ellipsis or a pencil
   45 degrees is just a tilted icon. data-icon on the root is the gate. */
.rui-speeddial[data-icon="plus"].is-open .rui-speeddial-fab { transform: rotate(45deg); }
/* position is emitted as data-position; promoted overlays get insets inline, but
   an engine that cannot promote fell back to the hardcoded bottom-right and two
   dials stacked on each other. column for the top corners so the menu expands
   downward instead of off-screen. */
.rui-speeddial[data-position="bottom-left"] { right: auto; left: 24px; }
.rui-speeddial[data-position="top-right"] { bottom: auto; top: 24px; flex-direction: column; }
.rui-speeddial[data-position="top-left"] { bottom: auto; top: 24px; right: auto; left: 24px; flex-direction: column; }
/* visibility, not just opacity, so the closed menu is out of the tab order on
   engines that do not honour inert yet. */
.rui-speeddial-menu { display: flex; flex-direction: column; gap: 10px; align-items: center; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(10px); transition: .2s; }
.rui-speeddial.is-open .rui-speeddial-menu { opacity: 1; visibility: visible; pointer-events: auto; transform: none; }
.rui-speeddial-action { width: 44px; height: 44px; border-radius: 50%; border: var(--rui-border-width) solid var(--rui-color-border); background: var(--rui-color-surface); color: var(--rui-color-text); cursor: pointer; box-shadow: var(--rui-shadow-md); display: grid; place-items: center; }
.rui-speeddial-action:hover { border-color: var(--rui-color-primary); color: var(--rui-color-primary); }

/* Confetti */
.rui-confetti { position: fixed; inset: 0; pointer-events: none; z-index: var(--rui-z-top); overflow: hidden; }
.rui-confetti-piece { position: absolute; top: -12px; width: 9px; height: 9px; border-radius: 2px; animation-name: akConfetti; animation-timing-function: ease-in; animation-fill-mode: forwards; }
/* Reads each piece's own --rot: keyframes that declare transform at both ends beat
   an inline transform, so without this every particle spun in lockstep. */
@keyframes akConfetti {
  0%   { transform: translateY(0) rotate(var(--rot, 0deg)); opacity: 1; }
  100% { transform: translateY(105vh) rotate(calc(var(--rot, 0deg) + 720deg)); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .rui-confetti { display: none; } }

/* Kbd shortcut — no rules of its own any more. KbdShortcut also emits
   .rui-kbd-group / .rui-kbd / .rui-kbd-sep, which carry the canonical cap styling
   and the data-size scale. The old .rui-kbd-key block sat later at equal
   specificity and overrode .rui-kbd, so the same shortcut rendered 11px through
   KbdShortcut and 12px through Kbd, with only one of the two getting the 2px
   bottom border that makes the cap look pressed. */

/* ===== Mobile (<640px) per-component layout fixes =====
   Desktop side-by-side / fixed-track layouts that cannot fit a phone. Placed
   at the end of the sheet so these single-class rules win over the base
   definitions on source order. Audited via DOM measurement at 375px;
   intentionally-scrollable components (code / data-grid / kanban / diff) keep
   scrolling, and off-canvas (sheet) / clipped (carousel) layouts are already
   correct, so they are deliberately left untouched. */
${below("sm")} {
  /* SplitView: fixed 320px sidebar + content -> stack to one column */
  .rui-split-view { grid-template-columns: 1fr !important; }
  /* ResizablePanels: side-by-side panels -> stack; drop the drag divider */
  .rui-resizable-panels { grid-template-columns: 1fr !important; }
  .rui-resizable-panel { min-width: 0 !important; }
  .rui-resizable-divider { display: none; }
  /* MultiStepForm column layout -> single column (mirrors data-layout="row") */
  .rui-multi-step-form[data-layout="column"] {
    grid-template-columns: 1fr;
    grid-template-areas: "steps" "body" "footer";
  }
  /* ComparisonTable: wide pricing/feature table -> scroll instead of clipping */
  .rui-comparison-table { overflow-x: auto; }
  /* DrawingCanvas / SignaturePad: scale the fixed-size canvas down to fit */
  .rui-drawing-canvas, .rui-signature-pad { display: block; max-width: 100%; }
  .rui-canvas-surface { max-width: 100%; height: auto; }
  /* Combobox fills its cell rather than forcing a multi-column filter row wider
     than the phone (MultiSelect already behaves this way). */
  .rui-combobox { width: 100%; }
}

/* ===== Touch targets: comfortable tap sizes on touch / small screens =====
   Applies on coarse-pointer (touch) devices and small viewports. Enlarges the
   genuinely tappable controls toward ~44px (WCAG 2.5.5 AAA / Apple HIG).
   Buttons get inline-flex centering since the base .rui-button has no display
   (a bare min-height would top-align the label). Deliberately excluded, since
   44px would break their layout: inline text links (rui-link / breadcrumb),
   dense data-grid controls, chip/tag remove buttons, and colour swatches. */
@media (pointer: coarse), ${belowCond("md")} {
  .rui-carousel-dot::before { content: ""; position: absolute; inset: -8px; }
  .rui-carousel-arrow { min-width: 44px; min-height: 44px; }

  .rui-button:not([data-variant="link"]):not([data-size="xs"]) {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .rui-button[data-icon-only="true"]:not([data-size="xs"]) { min-width: 44px; }
  /* Same xs exemption .rui-button already has: a dense grid toolbar asks for xs
     explicitly and 44px would break its layout. */
  .rui-icon-button:not([data-size="xs"]) { min-width: 44px; min-height: 44px; }
  .rui-input, .rui-select { min-height: 44px; }
  .rui-sidebar-item, .rui-navbar-item, .rui-menu-item { min-height: 44px; }
  .rui-combobox-option { display: flex; align-items: center; min-height: 44px; }
  .rui-tab-trigger { min-height: 44px; display: inline-flex; align-items: center; }
}

/* ----------------------------------------------------------------------- */
/* Reduced motion — blanket coverage (audit phase 10)                      */
/* ----------------------------------------------------------------------- */
/* The sheet has 41 keyframe animations but only 12 were behind a
   prefers-reduced-motion query, so the looping loading indicators kept
   animating for users who asked for less motion (WCAG 2.3.3).

   Two different treatments on purpose:

   1. LOOPING STATUS INDICATORS are slowed, not stopped. Freezing a spinner
      makes the interface look hung — the exact defect the audit flagged on
      Button(loading:), whose spinner glyph had no animation at all. A very slow
      rotation still communicates "working" while removing the motion that
      actually triggers discomfort.
   2. ENTRANCE / DECORATIVE motion is disabled outright, and anything that
      animates opacity or transform in is pinned to its final state so content
      can never be left invisible or offset. This last rule matters beyond
      accessibility: it is also the safety net for animations that never run to
      completion (a background tab, an offscreen render), which is how the
      Transition component ended up rendering an invisible child.

   This block is last in the sheet so it wins on source order at equal
   specificity. */
@media (prefers-reduced-motion: reduce) {
  .rui-spinner,
  .rui-spinner-ring,
  .rui-button-spinner,
  .rui-loading-dots i,
  /* The animation lives on the marker element, not on a pseudo-element — the old
     ::after selector matched nothing, so this was the one looping animation in
     the sheet that ignored the preference. */
  .rui-status-dot[data-pulse="true"] .rui-status-dot-marker,
  .rui-skeleton {
    animation-duration: 6s !important;
    animation-timing-function: linear !important;
  }

  .rui-progress[data-indeterminate="true"] .rui-progress-bar {
    animation-duration: 6s !important;
  }

  /* Everything else: no entrance motion, and never leave content hidden. */
  .rui-reveal,
  .rui-transition > *,
  .rui-flip-list > *,
  .rui-parallax,
  .rui-popover-content,
  .rui-dropdown-menu-content,
  .rui-tooltip-content,
  .rui-hover-card-content,
  .rui-toast,
  .rui-modal,
  .rui-sheet,
  .rui-route-page {
    animation: none !important;
    transition: none !important;
  }
  .rui-reveal,
  .rui-transition > *,
  .rui-flip-list > * {
    opacity: 1 !important;
    transform: none !important;
  }
  .rui-parallax { transform: none !important; }
}
`;
