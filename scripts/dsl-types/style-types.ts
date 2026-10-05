/**
 * Declarations for the universal style channel and the theme: `SxProps` and its
 * value unions, `AnimateValue`, `AriaRole`, the icon-name type, the members of
 * `BaseProps` that are not catalogue hints, and the typed `ThemeConfig` groups.
 *
 * Every literal union here is PRINTED from a runtime table — `src/library/sx.ts`
 * for `sx` / `animate` / `role`, `src/library/responsive-style.ts` for the
 * interaction states, the theme token list (`src/theme/index.ts`) and the
 * `$theme` flattening tables (`src/runtime/evaluator.ts`) for `ThemeConfig`,
 * `src/icons/index.ts` for icon variants. What stays curated is the SHAPE —
 * which union a key takes, which keys accept a breakpoint map — and that is
 * checked too: generation FAILS when
 *
 *   - the curated `sx` key list differs from the keys `serializeSx` actually
 *     reads (a recording proxy), or from the runtime's responsive / base-only /
 *     state key tables;
 *   - the state-style or `animate` key list differs from what the resolver reads;
 *   - a literal a curated `Exclude<…>` names is no longer in its derived union;
 *   - a `$theme` group, catalogue key or prefix table disagrees with the others.
 */
import type * as SxTables from "../../src/library/sx.js";
import type { ConfigKey } from "../../src/language/namespaces.js";
import type { ComponentSpec } from "../../src/library/types.js";
import { byCodePoint, jsdoc, propKey } from "./components.js";

export interface StyleTypesInput {
  /** The `src/library/sx.ts` module (its exported tables and resolvers). */
  sx: typeof SxTables;
  /** `INTERACTION_STATES` from `src/library/responsive-style.ts`. */
  interactionStates: readonly string[];
  theme: {
    /** `themeTokenNames()` and `themeTokenCssVar` from `src/theme/index.ts`. */
    tokenNames: readonly string[];
    tokenCssVar: (token: string) => string | null;
    /** `THEME_GRADIENT_FUNCTIONS` (`src/theme/index.ts`) and `FONT_IMPORT_KEY` (`src/theme/fonts.ts`). */
    gradientFunctions: readonly string[];
    fontImportKey: string;
    /** The `$theme` flattening tables of `src/runtime/evaluator.ts`. */
    structuredGroups: ReadonlySet<string>;
    metadataKeys: ReadonlySet<string>;
    spacingAliases: Readonly<Record<string, string>>;
    groupPrefix: Readonly<Record<string, string>>;
    /** The `$theme` config catalogue (`findBuiltinConfig("theme")`). */
    catalogue: readonly ConfigKey[];
  };
  /** `SUPPORTED_VARIANTS` from `src/icons/index.ts`. */
  iconVariants: ReadonlySet<string>;
  /** The library's components (for the `Icon.variant` drift check). */
  components: readonly ComponentSpec[];
  universalPropNames: ReadonlySet<string>;
}

export interface StyleTypesOutput {
  /** Prelude declarations: the `sx` / `animate` / role / icon types. */
  prelude: string[];
  /** `BaseProps` member types that are curated rather than compiled from the catalogue hint. */
  universalTypes: Readonly<Record<string, string>>;
  /** The `ThemeConfig` support types (emitted before it). */
  themeDeclarations: string[];
  /** `ThemeConfig` member types and JSDoc overrides, for `configInterface`. */
  themeOverrides: Readonly<Record<string, string>>;
  themeDocs: ReadonlyMap<string, string>;
}

/** Fail generation when a curated key list and the runtime disagree. */
function expectSame(label: string, curated: Iterable<string>, runtime: Iterable<string>, fix: string): void {
  const c = new Set(curated);
  const r = new Set(runtime);
  const missing = [...r].filter((k) => !c.has(k)).sort(byCodePoint);
  const extra = [...c].filter((k) => !r.has(k)).sort(byCodePoint);
  if (missing.length || extra.length) {
    throw new Error(
      `emit-dsl-types: ${label} — the curated types and the runtime disagree.\n` +
        `  in the runtime, not typed: ${JSON.stringify(missing)}\n` +
        `  typed, not in the runtime: ${JSON.stringify(extra)}\n` +
        `  ${fix}`,
    );
  }
}

/**
 * The string keys an object-reading function reads off its argument, recorded
 * through a proxy. `seed` supplies values for keys whose presence gates further
 * reads (`bgSize` is only read when `bgImage` is a valid URL).
 */
function keysRead(read: (probe: object) => void, seed: Readonly<Record<string, unknown>> = {}): string[] {
  const seen = new Set<string>();
  const probe = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      seen.add(key);
      return seed[key];
    },
  });
  read(probe);
  return [...seen];
}

const literals = (values: Iterable<string>): string => [...values].map((v) => JSON.stringify(v)).join(" | ");

export function emitStyleTypes(input: StyleTypesInput, typeName: (name: string) => string): StyleTypesOutput {
  const { sx } = input;
  const decl = (name: string, doc: string, body: string): string => `${jsdoc(doc)}export type ${typeName(name)} = ${body};`;
  const iface = (name: string, doc: string, members: ReadonlyArray<readonly [key: string, type: string, doc?: string]>): string =>
    `${jsdoc(doc)}export interface ${typeName(name)} {\n${members.map(([k, t, d]) => `${jsdoc(d, "  ")}  readonly ${propKey(k)}?: ${t};`).join("\n")}\n}`;

  /** `Exclude<Alias, …>` over a derived union, failing when a named literal left the table. */
  const excluding = (alias: string, values: readonly string[], drop: readonly string[], why: string): string => {
    for (const d of drop) {
      if (!values.includes(d)) {
        throw new Error(`emit-dsl-types: ${alias} no longer contains "${d}", which a curated Exclude<> drops (${why}). Update scripts/dsl-types/style-types.ts.`);
      }
    }
    return `Exclude<${alias}, ${literals(drop)}>`;
  };

  /* ------------------------------------------------------------- sx values */

  const space = Object.keys(sx.SPACING);
  const sizes = Object.keys(sx.SIZE_KEYWORDS);
  const colors = Object.keys(sx.COLORS);
  const gradientNames = input.theme.tokenNames
    .map((t) => input.theme.tokenCssVar(t) ?? "")
    .filter((v) => v.startsWith(sx.GRADIENT_CSS_VAR_PREFIX))
    .map((v) => v.slice(sx.GRADIENT_CSS_VAR_PREFIX.length));
  if (gradientNames.length === 0) throw new Error(`emit-dsl-types: no theme token maps to a ${sx.GRADIENT_CSS_VAR_PREFIX}* variable`);
  const weights = [...sx.FONT_WEIGHT];
  // `border: true` reads as `"true"`: print the boolean, not the string.
  const borderKeywords = Object.keys(sx.BORDER_PRESETS).filter((k) => k !== "true");
  const borderTrue = "true" in sx.BORDER_PRESETS ? " | boolean" : "";

  const sxValues = [
    decl("SxLength",
      "A CSS length: a number is pixels (`8` → `8px`, `0` → `0`), or a string that passes the length sanitiser — `\"12px\"`, `\"60%\"`, `\"clamp(1rem, 2vw, 2rem)\"`, `\"var(--gap)\"` (letters, digits, `. % + - * / ( ) ,` and spaces; at most 64 characters).",
      "number | (string & {})"),
    decl("SxNumber",
      "A unitless number, or the same number as a string (`\"0.9\"`, `\"-1\"`): the runtime parses both. Write plain decimals — `num()` (src/library/sx.ts) drops `\"1e3\"`, `\".5\"` and `\"+1\"`, which `${number}` admits.",
      "number | `${number}`"),
    decl("SxSpaceToken",
      "The `sx` spacing scale, `auto`, and the safe-area insets (`SPACING`, src/library/sx.ts). Distinct from `SpacingToken`: `sx` has no `small` / `normal` / `large`.",
      literals(space)),
    decl("SxPadding", "`p`: a spacing token (`safe` is the 4-side safe-area shorthand) or a length.",
      `${excluding("SxSpaceToken", space, ["auto"], "padding has no auto")} | SxLength`),
    decl("SxPaddingSide", "`px` `py` `pt` `pr` `pb` `pl` `ps` `pe`: one side or axis — use the directional `safe-*` insets.",
      `${excluding("SxSpaceToken", space, ["auto", "safe"], "one side takes one value, and padding has no auto")} | SxLength`),
    decl("SxMargin", "`m`: a spacing token or a length.", "SxSpaceToken | SxLength"),
    decl("SxMarginSide", "`mx` `my` `mt` `mr` `mb` `ml` `ms` `me`.",
      `${excluding("SxSpaceToken", space, ["safe"], "one side takes one value")} | SxLength`),
    decl("SxGap", "`gap`: a spacing token or a length.",
      `${excluding("SxSpaceToken", space, ["auto", "safe"], "gap takes neither")} | SxLength`),
    decl("SxSizeKeyword", "Size keywords (`SIZE_KEYWORDS`, src/library/sx.ts): `full` = 100%, `screen` = 100vh, `min` / `max` / `fit` = the intrinsic sizes, ….",
      literals(sizes)),
    decl("SxSize", "`w` `h` `minW` `minH` `basis`: a size keyword or a length.", "SxSizeKeyword | SxLength"),
    decl("SxMaxSize", "`maxW` `maxH`: a size keyword or a length (`max-width: auto` is not CSS — use `\"none\"`).",
      `${excluding("SxSizeKeyword", sizes, ["auto"], "max-width: auto is invalid")} | SxLength`),
    decl("SxOffset", "`top` `right` `bottom` `left`: a size keyword or a length.",
      `${excluding("SxSizeKeyword", sizes, ["min", "max", "fit"], "the intrinsic keywords are not inset values")} | SxLength`),
    decl("SxColorToken", "Theme colour tokens (`COLORS`, src/library/sx.ts) — kebab-case, unlike `$theme({ colors })`'s camelCase keys.",
      literals(colors)),
    decl("SxColor", "A colour token or any colour that passes the colour sanitiser (`#0969da`, `rgb(…)`, `color-mix(…)`, `var(--x)`). Not a gradient.",
      "SxColorToken | (string & {})"),
    decl("SxGradientName", "The theme's gradient tokens (the `--rui-gradient-*` variables).", literals(gradientNames)),
    decl("SxBackground", `\`bg\`, \`bgOverlay\` and a state's \`bg\`: a colour, or a theme gradient (\`"${sx.GRADIENT_REF_PREFIX}brand"\`).`,
      `SxColorToken | \`${sx.GRADIENT_REF_PREFIX}\${SxGradientName}\` | (string & {})`),
    decl("SxRadius", "A radius token (`RADIUS`, src/library/sx.ts) or a length.", `${literals(Object.keys(sx.RADIUS))} | SxLength`),
    decl("SxShadow", "Shadow tokens (`SHADOW`, src/library/sx.ts). Closed: any other value is dropped.", literals(Object.keys(sx.SHADOW))),
    decl("SxBorder", "A border keyword (`BORDER_PRESETS`, src/library/sx.ts) — `true` is the default border, `false` draws nothing — or a colour for a 1px solid border.",
      `${literals(borderKeywords)}${borderTrue} | SxColor`),
    decl("SxDisplay", "Closed (`DISPLAY`, src/library/sx.ts).", literals(sx.DISPLAY)),
    decl("SxDirection", "Closed (`DIRECTION`, src/library/sx.ts).", literals(sx.DIRECTION)),
    decl("SxAlign", "`align-items` (`ALIGN`, src/library/sx.ts).", literals(Object.keys(sx.ALIGN))),
    decl("SxJustify", "`justify-content` (`JUSTIFY`, src/library/sx.ts): `between` = space-between, ….", literals(Object.keys(sx.JUSTIFY))),
    decl("SxPosition", "Closed (`POSITION`, src/library/sx.ts).", literals(sx.POSITION)),
    decl("SxOverflow", "Closed (`OVERFLOW`, src/library/sx.ts).", literals(sx.OVERFLOW)),
    decl("SxCursor", "Closed (`CURSOR`, src/library/sx.ts).", literals(sx.CURSOR)),
    decl("SxTextAlign", "Closed (`TEXT_ALIGN`, src/library/sx.ts).", literals(sx.TEXT_ALIGN)),
    decl("SxTextDecoration", "Closed (`TEXT_DECORATION`, src/library/sx.ts).", literals(sx.TEXT_DECORATION)),
    decl("SxZIndex", "A layer token (`Z_INDEX`, src/library/sx.ts; themeable through `$theme({ zIndex })`) or a number.",
      `${literals(Object.keys(sx.Z_INDEX))} | SxNumber`),
    decl("SxFontSize", "A type-scale token (`FONT_SIZE`, src/library/sx.ts) or a length.", `${literals(Object.keys(sx.FONT_SIZE))} | SxLength`),
    decl("SxFontWeight", "Closed (`FONT_WEIGHT`, src/library/sx.ts): the numeric weights as numbers or strings, `normal`, `bold`.",
      [literals(weights), ...weights.filter((w) => /^\d+$/.test(w))].join(" | ")),
    decl("SxBackdrop", "`backdrop` filters (`BACKDROP_FILTERS`, src/library/sx.ts).", literals(Object.keys(sx.BACKDROP_FILTERS))),
    decl("SxBgSize", `\`bgSize\` (\`BG_SIZES\`, src/library/sx.ts); read only with \`bgImage\`, and anything else is \`${sx.BG_SIZES[0]}\`.`, literals(sx.BG_SIZES)),
    decl("SxHoverEffect", "Hover effect shorthands (`HOVER_EFFECTS`, src/library/sx.ts): each is an `ak-hover-*` utility class.", literals(sx.HOVER_EFFECTS)),
    decl("SxFocusEffect", "Focus effect shorthands (`FOCUS_EFFECTS`, src/library/sx.ts): `glow` on `:focus-visible`, `border` on `:focus-within`.", literals(sx.FOCUS_EFFECTS)),
    decl("SxInteractionState",
      "The states `sx.states` styles (src/library/responsive-style.ts). `group-hover` fires while an ancestor with class `ak-group` is hovered; `disabled` also matches `[disabled]` / `[data-disabled=\"true\"]`, `checked` also `[aria-checked=\"true\"]`.",
      literals(input.interactionStates)),
    `${jsdoc("An `sx` value, or a breakpoint map of it (`{ base: 8, md: 16 }` emits real `@media` rules).")}export type ${typeName("SxValue")}<T> = T | Responsive<T>;`,
  ];

  /* ------------------------------------------------- interaction state styles */

  // What `resolveStateDecls` reads, curated by type.
  const STATE_STYLE: ReadonlyArray<readonly [string, string, string?]> = [
    ["bg", "SxBackground"],
    ["color", "SxColor"],
    ["borderColor", "SxColor"],
    ["shadow", "SxShadow"],
    ["radius", "SxRadius"],
    ["opacity", "SxNumber"],
    ["cursor", "SxCursor"],
    ["textDecoration", "SxTextDecoration"],
    ["scale", "SxNumber", "`transform: scale(n)`."],
    ["translateX", "SxLength"],
    ["translateY", "SxLength"],
    ["rotate", "SxNumber", "Degrees, at most ±360; anything else is dropped."],
  ];
  const stateKeysRead = keysRead((probe) => sx.serializeSx({ states: { [input.interactionStates[0]!]: probe } }));
  expectSame("sx state-style keys", STATE_STYLE.map(([k]) => k), stateKeysRead,
    "Update STATE_STYLE in scripts/dsl-types/style-types.ts to match resolveStateDecls (src/library/sx.ts).");

  const stateStyle = (effects: ReadonlySet<string>): Array<readonly [string, string, string?]> => {
    const members: Array<readonly [string, string, string?]> = STATE_STYLE.map(([k, t, d]) =>
      effects.has(k) ? [k, `${t} | boolean`, `\`true\` is the \`${k}\` effect; a value is the state style.${d ? ` ${d}` : ""}`] as const : [k, t, d] as const);
    for (const effect of effects) {
      if (!STATE_STYLE.some(([k]) => k === effect)) members.push([effect, "boolean", `The \`${effect}\` effect.`]);
    }
    return members;
  };
  const stateSection = [
    iface("SxStateStyle", "A bounded style object for one interaction state.", STATE_STYLE),
    iface("SxHoverStyle", "The object form of `hover`: effect flags plus state styles.", stateStyle(sx.HOVER_EFFECTS)),
    iface("SxFocusStyle", "The object form of `focus`: effect flags plus state styles.", stateStyle(sx.FOCUS_EFFECTS)),
    decl("SxStates", "Per-state style objects: `states: { active: { scale: 0.98 }, \"focus-visible\": { borderColor: \"primary\" } }`.",
      "{ readonly [S in SxInteractionState]?: SxStateStyle }"),
  ];

  /* ------------------------------------------------------------- SxProps */

  // Key → value type, in serializeSx's order. Responsive-ness is NOT curated:
  // a key takes `SxValue<T>` exactly when it has a responsive resolver.
  const SX_KEYS: ReadonlyArray<readonly [string, string, string?]> = [
    ["p", "SxPadding"], ["px", "SxPaddingSide", "`padding-inline` (mirrors under RTL)."], ["py", "SxPaddingSide"],
    ["pt", "SxPaddingSide"], ["pr", "SxPaddingSide"], ["pb", "SxPaddingSide"], ["pl", "SxPaddingSide"],
    ["ps", "SxPaddingSide", "`padding-inline-start`."], ["pe", "SxPaddingSide", "`padding-inline-end`."],
    ["m", "SxMargin"], ["mx", "SxMarginSide", "`margin-inline` (mirrors under RTL)."], ["my", "SxMarginSide"],
    ["mt", "SxMarginSide"], ["mr", "SxMarginSide"], ["mb", "SxMarginSide"], ["ml", "SxMarginSide"],
    ["ms", "SxMarginSide", "`margin-inline-start`."], ["me", "SxMarginSide", "`margin-inline-end`."],
    ["gap", "SxGap"],
    ["w", "SxSize"], ["h", "SxSize"], ["minW", "SxSize"], ["maxW", "SxMaxSize"], ["minH", "SxSize"], ["maxH", "SxMaxSize"],
    ["bg", "SxBackground"], ["color", "SxColor"],
    ["border", "SxBorder"], ["borderColor", "SxColor"],
    ["radius", "SxRadius"], ["shadow", "SxShadow"], ["opacity", "SxNumber", "0–1."],
    ["display", "SxDisplay"], ["direction", "SxDirection", "`flex-direction`."], ["align", "SxAlign"], ["justify", "SxJustify"],
    ["wrap", "boolean", "`true` wraps, `false` forbids wrapping."], ["grow", "SxNumber"], ["shrink", "SxNumber"], ["basis", "SxSize"],
    ["columns", "SxNumber", "N equal grid columns."],
    ["position", "SxPosition"], ["top", "SxOffset"], ["right", "SxOffset"], ["bottom", "SxOffset"], ["left", "SxOffset"],
    ["inset", "SxLength"], ["zIndex", "SxZIndex"],
    ["fontSize", "SxFontSize"], ["weight", "SxFontWeight"], ["textDecoration", "SxTextDecoration"],
    ["overflow", "SxOverflow"], ["cursor", "SxCursor"], ["textAlign", "SxTextAlign"],
    ["backdrop", "SxBackdrop"],
    ["bgImage", "string", "An http(s), protocol-relative, root-relative, relative or `data:image/*` URL; other schemes are dropped."],
    ["bgOverlay", "SxBackground", "A tint or gradient layered over `bgImage` (or on its own)."],
    ["bgSize", "SxBgSize"],
    ["hover", "SxHoverEffect | SxHoverStyle", "An effect name, or `{ …effect flags, …state styles }`."],
    ["focus", "SxFocusEffect | SxFocusStyle", "An effect name, or `{ …effect flags, …state styles }`."],
    ["states", "SxStates"],
  ];
  const responsiveKeys = new Set(Object.keys(sx.RESPONSIVE_RESOLVERS));
  const runtimeKeys = [...responsiveKeys, ...sx.SX_BASE_ONLY_KEYS, ...sx.SX_STATE_KEYS];
  expectSame("sx keys (runtime tables)", SX_KEYS.map(([k]) => k), runtimeKeys,
    "Update SX_KEYS in scripts/dsl-types/style-types.ts with RESPONSIVE_RESOLVERS / SX_BASE_ONLY_KEYS / SX_STATE_KEYS (src/library/sx.ts).");
  // The tables themselves must describe serializeSx: it ignores every other key.
  expectSame("sx keys (read by serializeSx)", runtimeKeys, keysRead((probe) => sx.serializeSx(probe), { bgImage: "/probe.png" }),
    "A key serializeSx reads must be in RESPONSIVE_RESOLVERS, SX_BASE_ONLY_KEYS or SX_STATE_KEYS (src/library/sx.ts).");

  const sxProps = iface(
    "SxProps",
    "The bounded, token-aware `sx` style object (`sx: { p: \"md\", bg: \"surface\", hover: \"lift\" }`). Unknown keys are ignored by the runtime, so they are rejected here; there is no `_hover` — use `hover`, `focus` or `states`. Keys typed `SxValue<…>` also take a breakpoint map.",
    SX_KEYS.map(([k, t, d]) => [k, responsiveKeys.has(k) ? `SxValue<${t}>` : t, d] as const),
  );

  /* ------------------------------------------------------------- animate */

  const presets = [...sx.ANIMATE_PRESETS];
  if (presets.includes(sx.ANIMATE_NONE)) throw new Error(`emit-dsl-types: ANIMATE_NONE ("${sx.ANIMATE_NONE}") is also an animation preset`);
  const ANIMATE_TIMING: ReadonlyArray<readonly [string, string, string]> = [
    ["delay", "SxNumber", "Milliseconds, 0–20000; anything outside is ignored."],
    ["duration", "SxNumber", "Milliseconds, above 0 and at most 20000; anything outside is ignored."],
    ["repeat", "SxNumber | true | \"infinite\"", "An iteration count, or loop forever."],
  ];
  // `preset` and its alias `name` select the preset; the rest is timing.
  const ANIMATE_PRESET_KEYS = ["preset", "name"] as const;
  expectSame("animate object keys", [...ANIMATE_PRESET_KEYS, ...ANIMATE_TIMING.map(([k]) => k)], keysRead((probe) => sx.resolveAnimate(probe)),
    "Update ANIMATE_TIMING in scripts/dsl-types/style-types.ts to match resolveAnimate (src/library/sx.ts).");
  const animate = [
    decl("AnimatePreset", "Animation presets (`ANIMATE_PRESETS`, src/library/sx.ts); each is an `ak-anim-*` class.", literals(presets)),
    iface("AnimateTiming", "Timing overrides for an animation preset.", ANIMATE_TIMING),
    decl("AnimateConfig", `A preset (\`${ANIMATE_PRESET_KEYS[0]}\`, or its alias \`${ANIMATE_PRESET_KEYS[1]}\` — exactly one) with timing overrides. Without a preset nothing animates.`,
      `OneOf<${literals(ANIMATE_PRESET_KEYS)}, AnimatePreset> & AnimateTiming`),
    decl("AnimateValue", `A preset name, \`${JSON.stringify(sx.ANIMATE_NONE)}\` for no animation, or a preset with timing overrides.`,
      `AnimatePreset | ${JSON.stringify(sx.ANIMATE_NONE)} | AnimateConfig`),
  ];

  /* ------------------------------------------------------------- role / icons */

  const role = decl("AriaRole", "The roles the universal `role` channel accepts (`ALLOWED_ROLES`, src/library/sx.ts); any other role is dropped.",
    literals(sx.ALLOWED_ROLES));

  const iconSpec = input.components.find((c) => c.name === "Icon");
  const iconVariantEnum = iconSpec?.props.find((p) => p.name === "variant")?.enum;
  if (!iconVariantEnum) throw new Error("emit-dsl-types: the Icon component has no `variant` enum to check SUPPORTED_VARIANTS against");
  expectSame("icon variants (Icon.variant enum vs SUPPORTED_VARIANTS)", iconVariantEnum, input.iconVariants,
    "Icon's `variant` enum (src/library/components/content.ts) must list exactly SUPPORTED_VARIANTS (src/icons/index.ts).");
  const icons = [
    `${jsdoc("Augmentation point for custom icon names (`$theme({ icons })`, `registerIcons`), so they autocomplete wherever `AktionIconName` is accepted: `declare module \"aktion-runtime/dsl\" { interface AktionIconRegistry { logo: true } }`.")}export interface ${typeName("AktionIconRegistry")} {}`,
    decl("AktionIconName",
      "An icon name: a Font Awesome 6 name without `fa-` (`\"house\"`), optionally prefixed with a style (`\"regular:star\"`), or a registered custom icon. Open: the runtime also renders non-ASCII text (an emoji) inline.",
      `(keyof AktionIconRegistry & string) | \`\${${literals(input.iconVariants)}}:\${string}\` | (string & {})`),
  ];

  /* ------------------------------------------------------------- BaseProps */

  const record = "Readonly<Record<string, string | number | boolean | null | undefined>>";
  const universalTypes: Record<string, string> = {
    sx: "SxProps | null",
    animate: "AnimateValue | null",
    // An object is written through `String(…)`: `style="[object Object]"`.
    style: "string",
    class: "string | readonly string[]",
    className: "string | readonly string[]",
    role: "AriaRole",
    aria: record,
    data: record,
    dataAttrs: record,
  };
  for (const name of Object.keys(universalTypes)) {
    if (!input.universalPropNames.has(name)) throw new Error(`emit-dsl-types: a curated BaseProps type names "${name}", which is not a universal prop`);
  }

  /* ------------------------------------------------------------- $theme */

  const theme = emitThemeTypes(input.theme, decl);

  return {
    prelude: [...sxValues, ...stateSection, sxProps, ...animate, role, ...icons],
    universalTypes,
    themeDeclarations: theme.declarations,
    themeOverrides: theme.overrides,
    themeDocs: theme.docs,
  };
}

/** Per `$theme` group: the support type it names and the value type of each key (curated). */
const THEME_GROUPS: Readonly<Record<string, { token?: string; value?: (key: string) => string; doc: string }>> = {
  colors: { token: "ThemeColorToken", value: () => "string", doc: "`$theme({ colors })` keys (camelCase)." },
  radius: { token: "ThemeRadiusToken", value: () => "string", doc: "`$theme({ radius })` keys." },
  // `font-weight: 600` is valid CSS; a unitless font size or family is not.
  font: { token: "ThemeFontToken", value: (k) => (/^weight/.test(k) ? "string | number" : "string"), doc: "`$theme({ font })` keys." },
  spacing: { token: "ThemeSpacingToken", value: () => "string", doc: "`$theme({ spacing })` keys." },
  shadows: { token: "ThemeShadowToken", value: () => "string", doc: "`$theme({ shadows })` keys." },
  gradients: { token: "ThemeGradientToken", value: () => "ThemeGradient", doc: "`$theme({ gradients })` keys, referenced from `sx` as `bg: \"gradient.<name>\"`." },
  zIndex: { token: "ThemeZIndexToken", value: () => "number | string", doc: "`$theme({ zIndex })` keys." },
  motion: { token: "ThemeMotionToken", value: () => "string", doc: "`$theme({ motion })` keys." },
  // No tokens: read only for its font import.
  fonts: { doc: "`$theme({ fonts })`: web-font imports only." },
};
/** `$theme` keys handled outside the token flow (side effects in the evaluator's `theme` case). */
const THEME_SIDE_EFFECT_KEYS = ["icons"];

function emitThemeTypes(
  theme: StyleTypesInput["theme"],
  decl: (name: string, doc: string, body: string) => string,
): { declarations: string[]; overrides: Record<string, string>; docs: Map<string, string> } {
  expectSame("$theme groups (curated vs STRUCTURED_THEME_GROUPS)", Object.keys(THEME_GROUPS), theme.structuredGroups,
    "Update THEME_GROUPS in scripts/dsl-types/style-types.ts with STRUCTURED_THEME_GROUPS (src/runtime/evaluator.ts).");
  expectSame("$theme config keys (catalogue vs runtime)", theme.catalogue.map((k) => k.name),
    [...theme.structuredGroups, ...theme.metadataKeys, ...THEME_SIDE_EFFECT_KEYS],
    "Update the $theme catalogue (src/language/namespaces.ts) or the evaluator's theme tables together.");
  for (const group of Object.keys(theme.groupPrefix)) {
    if (!theme.structuredGroups.has(group)) throw new Error(`emit-dsl-types: THEME_GROUP_PREFIX names "${group}", which is not a structured $theme group`);
  }

  const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const decapitalise = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
  /** A group's inner keys: the token names `collectThemeTokens` flattens them to, un-prefixed. */
  const groupKeys = (group: string): string[] => {
    // The evaluator falls back to the group name itself when it has no prefix.
    const prefix = theme.groupPrefix[group] ?? group;
    const keys = theme.tokenNames
      .filter((t) => t.startsWith(prefix) && /^[A-Z0-9]/.test(t.slice(prefix.length)))
      .map((t) => decapitalise(t.slice(prefix.length)));
    for (const k of keys) {
      if (!theme.tokenNames.includes(prefix + capitalise(k))) throw new Error(`emit-dsl-types: $theme ${group}.${k} does not flatten back to a token`);
    }
    return keys;
  };

  const declarations: string[] = [];
  const overrides: Record<string, string> = { name: "BuiltInThemeName" };
  const docs = new Map<string, string>([
    ["direction", "@deprecated No runtime effect: `$theme` skips it as metadata. Set `dir` on `<aktion-app>` for a right-to-left layout."],
  ]);
  const importMember = `readonly ${propKey(theme.fontImportKey)}?: string | readonly string[]`;
  const fnTemplate = `\`\${${literals(theme.gradientFunctions)}}-gradient(\${string}\``;
  declarations.push(
    decl("ThemeGradientStops", "At least two colour stops.", "readonly [string, string, ...string[]]"),
    decl("ThemeGradient",
      "A theme gradient: colour stops (`linear-gradient(120deg, …)`), `{ stops, angle }` (degrees), or a gradient-function string. A plain colour is dropped.",
      `ThemeGradientStops | { readonly stops: ThemeGradientStops; readonly angle?: number } | ${fnTemplate}`),
  );
  for (const [group, spec] of Object.entries(THEME_GROUPS)) {
    let keys = groupKeys(group);
    if (group === "spacing") {
      for (const [alias, target] of Object.entries(theme.spacingAliases)) {
        if (!keys.includes(target)) throw new Error(`emit-dsl-types: SPACING_THEME_KEY_ALIASES maps "${alias}" to "${target}", which is not a spacing token`);
      }
      keys = [...keys, ...Object.keys(theme.spacingAliases)];
    }
    if (!spec.token) {
      if (keys.length > 0) throw new Error(`emit-dsl-types: $theme group "${group}" now flattens to tokens ${JSON.stringify(keys)} — give it a token type in THEME_GROUPS`);
      overrides[group] = `{ ${importMember} }`;
      continue;
    }
    if (keys.length === 0) throw new Error(`emit-dsl-types: $theme group "${group}" flattens to no theme token`);
    declarations.push(decl(spec.token, spec.doc, literals(keys)));
    // One mapped type per value type; the most common one is "the rest".
    const byValue = new Map<string, string[]>();
    for (const k of keys) byValue.set(spec.value!(k), [...(byValue.get(spec.value!(k)) ?? []), k]);
    const groups = [...byValue].sort((a, b) => b[1].length - a[1].length);
    const others = groups.slice(1).flatMap(([, ks]) => ks);
    const parts = groups.map(([value, ks], i) => {
      const domain = i > 0 ? literals(ks) : others.length ? `Exclude<${spec.token}, ${literals(others)}>` : spec.token;
      return `{ readonly [K in ${domain}]?: ${value} }`;
    });
    // Web fonts are also imported from the `font` group (evaluator: loadFonts(obj.font)).
    if (group === "font") parts.push(`{ ${importMember} }`);
    overrides[group] = parts.join(" & ");
  }
  overrides.icons = "Readonly<Record<string, string>>";
  docs.set("icons", "Custom icons: name (letters, digits, `:` `_` `-`) → inline SVG markup (at most 16 KB). Augment `AktionIconRegistry` to have the names autocomplete.");
  return { declarations, overrides, docs };
}
