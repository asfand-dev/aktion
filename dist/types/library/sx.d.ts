/**
 * `sx` — bounded, token-aware style-intent layer (suggestions-global Part I).
 *
 * Every component accepts a universal `sx` prop (plus `animate`, `id`,
 * `anchor`, `className`, `style`, `testId`). These are NOT raw CSS: each value is a
 * design-token reference, a small enum, or a sanitised scalar, so the surface
 * stays theme-safe, XSS-safe, and enumerable by an LLM.
 *
 * The evaluator collects these into `node.universal`; the renderer calls
 * {@link applyUniversal} on the element returned by a component's `render`.
 * One hook styles all 196 components without editing each spec.
 *
 * The lookup tables below are exported for `scripts/dsl-types/style-types.ts`,
 * which prints the `aktion-runtime/dsl` style types (`SxProps`, `AnimateValue`,
 * `AriaRole`, …) FROM them, so a value added here is typed without a second
 * edit, and a value removed here stops type-checking.
 */
/** Spacing scale → CSS variable. Mirrors Tailwind-ish mental model. */
export declare const SPACING: Readonly<Record<string, string>>;
/** Named colors → CSS variable. */
export declare const COLORS: Readonly<Record<string, string>>;
export declare const RADIUS: Readonly<Record<string, string>>;
export declare const SHADOW: Readonly<Record<string, string>>;
export declare const SIZE_KEYWORDS: Readonly<Record<string, string>>;
export declare const ALIGN: Readonly<Record<string, string>>;
export declare const JUSTIFY: Readonly<Record<string, string>>;
export declare const Z_INDEX: Readonly<Record<string, string>>;
/** Typography presets for `sx.fontSize` (tokens) — raw lengths also accepted. */
export declare const FONT_SIZE: Readonly<Record<string, string>>;
export declare const FONT_WEIGHT: ReadonlySet<string>;
export declare const DISPLAY: ReadonlySet<string>;
export declare const DIRECTION: ReadonlySet<string>;
export declare const POSITION: ReadonlySet<string>;
export declare const OVERFLOW: ReadonlySet<string>;
export declare const CURSOR: ReadonlySet<string>;
export declare const TEXT_ALIGN: ReadonlySet<string>;
/** How a background value names a theme gradient: `gradient.brand`. */
export declare const GRADIENT_REF_PREFIX = "gradient.";
/** The CSS variables a {@link GRADIENT_REF_PREFIX} ref resolves to (`--rui-gradient-brand`). */
export declare const GRADIENT_CSS_VAR_PREFIX = "--rui-gradient-";
/**
 * Per-key resolvers for the responsive pass: each maps a raw value to the
 * `[cssProperty, cssValue]` pairs it produces (empty when invalid). Mirrors
 * the base inline logic below so a breakpoint map and a single value resolve
 * identically.
 */
export declare const RESPONSIVE_RESOLVERS: Readonly<Record<string, (v: unknown) => Array<[string, string]>>>;
export declare const TEXT_DECORATION: ReadonlySet<string>;
/**
 * `sx.border` keywords → the `border` shorthand. `true` reads as `"true"`
 * (`asString`), so `border: true` is the default border. Any other value is a
 * colour for a 1px solid border; `false` draws nothing.
 */
export declare const BORDER_PRESETS: Readonly<Record<string, string>>;
/**
 * The `sx` keys {@link serializeSx} reads WITHOUT a responsive resolver: a
 * breakpoint map on one of them collapses to its narrowest value. With the
 * keys of {@link RESPONSIVE_RESOLVERS} and {@link SX_STATE_KEYS} this is the
 * whole `sx` surface; the DSL type generator fails when the keys
 * `serializeSx` actually reads disagree with the three tables.
 */
export declare const SX_BASE_ONLY_KEYS: readonly string[];
/** The interaction-state keys of `sx` (not responsive). */
export declare const SX_STATE_KEYS: readonly string[];
/** `sx.backdrop` → the `backdrop-filter` it applies. */
export declare const BACKDROP_FILTERS: Readonly<Record<string, string>>;
/** `sx.bgSize` values (read only with `bgImage`); anything else is the first, `cover`. */
export declare const BG_SIZES: readonly string[];
/**
 * Serialize an `sx` object into a safe inline-style string + utility classes.
 * Unknown keys are ignored. Hover/focus map to predefined utility classes
 * (no dynamic CSS injection) so the surface stays bounded. Responsive map
 * values (`{ base, md, … }`) emit real `@media` rules via atomic classes.
 */
export declare function serializeSx(sxRaw: unknown): {
    style: string;
    classes: string[];
};
/**
 * Bounded effect shorthands per state: each name is an `ak-<state>-<name>`
 * utility class with a rule in `src/theme/styles.ts`. Focus has only two —
 * `focus: "lift"` used to emit `ak-focus-lift`, a class no rule styles.
 */
export declare const HOVER_EFFECTS: ReadonlySet<string>;
export declare const FOCUS_EFFECTS: ReadonlySet<string>;
export declare const ANIMATE_PRESETS: ReadonlySet<string>;
/** The documented "no animation" value: it renders nothing, like a falsy `animate`. */
export declare const ANIMATE_NONE = "none";
/**
 * Resolve the `animate` universal prop → class + inline timing overrides.
 * Accepts a preset string or `{ preset, delay, duration, repeat }`.
 */
export declare function resolveAnimate(raw: unknown): {
    classes: string[];
    style: string;
};
/**
 * Roles an app author may set through the universal `role` channel.
 *
 * Deliberately a closed list: an unrecognised role is dropped by assistive tech
 * anyway, and a plausible-but-wrong one (say `button` on a container) is worse
 * than the original defect. Landmarks, common widget roles, and the two
 * "remove me from the tree" values are covered; anything requiring a matching
 * set of owned children or ARIA state is not, because a bare role override
 * cannot supply those.
 */
export declare const ALLOWED_ROLES: ReadonlySet<string>;
/** Named props that every component implicitly accepts (the universal channel). */
export declare const UNIVERSAL_PROP_NAMES: Set<string>;
export interface UniversalProps {
    sx?: unknown;
    animate?: unknown;
    id?: unknown;
    anchor?: unknown;
    className?: unknown;
    class?: unknown;
    style?: unknown;
    aria?: unknown;
    data?: unknown;
    dataAttrs?: unknown;
    role?: unknown;
    tooltip?: unknown;
    hidden?: unknown;
    testId?: unknown;
    testid?: unknown;
}
/**
 * Apply the universal-prop channel to a rendered element. Merges with any
 * inline style/classes the component already set. Safe to call with a
 * non-Element (no-ops) and with an empty `universal` (no-ops).
 */
export declare function applyUniversal(node: Node, universal: UniversalProps | null | undefined): void;
