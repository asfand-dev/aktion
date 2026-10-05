/**
 * The style / theme declarations (scripts/dsl-types/style-types.ts) are printed
 * from runtime tables, and generation fails when a curated shape and the
 * runtime disagree. This file proves both halves:
 *
 *   1. each drift check really fires — a mutated table makes generation throw;
 *   2. what the generator derives is what the runtime does — every `$theme` key
 *      the declarations offer reaches a CSS variable, and the gradient and font
 *      tables the generator reads match the evaluator's behaviour.
 */
import { describe, expect, it } from "vitest";

import * as sx from "../src/library/sx.js";
import { INTERACTION_STATES } from "../src/library/responsive-style.js";
import { defaultLibrary } from "../src/library/index.js";
import { findBuiltinConfig } from "../src/language/namespaces.js";
import { THEME_GRADIENT_FUNCTIONS, sanitiseThemeTokens, themeTokenCssVar, themeTokenNames } from "../src/theme/index.js";
import { FONT_IMPORT_KEY, loadFonts } from "../src/theme/fonts.js";
import { SUPPORTED_VARIANTS } from "../src/icons/index.js";
import {
  SPACING_THEME_KEY_ALIASES, STRUCTURED_THEME_GROUPS, THEME_GROUP_PREFIX, THEME_METADATA_KEYS,
  createContext, evaluate,
} from "../src/runtime/evaluator.js";
import { StateStore } from "../src/runtime/state.js";
import { parse } from "../src/parser/index.js";
import type { Expression } from "../src/parser/types.js";
import { emitStyleTypes, type StyleTypesInput } from "../scripts/dsl-types/style-types.js";

function input(patch: { sx?: Partial<typeof sx>; theme?: Partial<StyleTypesInput["theme"]>; iconVariants?: ReadonlySet<string> } = {}): StyleTypesInput {
  return {
    sx: { ...sx, ...patch.sx },
    interactionStates: INTERACTION_STATES,
    theme: {
      tokenNames: themeTokenNames(),
      tokenCssVar: themeTokenCssVar,
      gradientFunctions: THEME_GRADIENT_FUNCTIONS,
      fontImportKey: FONT_IMPORT_KEY,
      structuredGroups: STRUCTURED_THEME_GROUPS,
      metadataKeys: THEME_METADATA_KEYS,
      spacingAliases: SPACING_THEME_KEY_ALIASES,
      groupPrefix: THEME_GROUP_PREFIX,
      catalogue: findBuiltinConfig("theme") ?? [],
      ...patch.theme,
    },
    iconVariants: patch.iconVariants ?? SUPPORTED_VARIANTS,
    components: defaultLibrary.components,
    universalPropNames: sx.UNIVERSAL_PROP_NAMES,
  };
}
const emit = (i: StyleTypesInput) => emitStyleTypes(i, (name) => name);

/** The string literals of a printed `export type Name = "a" | "b";`. */
function unionOf(lines: readonly string[], name: string): string[] {
  const line = lines.find((l) => l.includes(`export type ${name} = `));
  if (!line) throw new Error(`no ${name} in the output`);
  return [...line.slice(line.indexOf(" = ")).matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe("style types — the drift checks fire", () => {
  it("generates from the unmodified tables", () => {
    const out = emit(input());
    expect(unionOf(out.prelude, "SxShadow")).toEqual(Object.keys(sx.SHADOW));
    expect(unionOf(out.prelude, "AriaRole")).toEqual([...sx.ALLOWED_ROLES]);
    expect(unionOf(out.prelude, "SxInteractionState")).toEqual([...INTERACTION_STATES]);
  });

  it("fails when the runtime gains an sx key the types do not cover", () => {
    const resolvers = { ...sx.RESPONSIVE_RESOLVERS, aspect: () => [] };
    expect(() => emit(input({ sx: { RESPONSIVE_RESOLVERS: resolvers } }))).toThrow(/sx keys \(runtime tables\)[\s\S]*"aspect"/);
  });

  it("fails when serializeSx reads a key no table lists", () => {
    const serializeSx = (raw: unknown) => {
      void (raw as Record<string, unknown>).aspectRatio;
      return sx.serializeSx(raw);
    };
    expect(() => emit(input({ sx: { serializeSx } }))).toThrow(/read by serializeSx[\s\S]*"aspectRatio"/);
  });

  it("fails when resolveAnimate reads a key the types do not declare", () => {
    const resolveAnimate = (raw: unknown) => {
      void (raw as Record<string, unknown>).easing;
      return sx.resolveAnimate(raw);
    };
    expect(() => emit(input({ sx: { resolveAnimate } }))).toThrow(/animate object keys[\s\S]*"easing"/);
  });

  it("fails when a literal a curated Exclude<> drops leaves its table", () => {
    const { auto: _auto, ...spacing } = sx.SPACING;
    expect(() => emit(input({ sx: { SPACING: spacing } }))).toThrow(/SxSpaceToken no longer contains "auto"/);
  });

  it("fails when the $theme groups and the catalogue disagree", () => {
    expect(() => emit(input({ theme: { structuredGroups: new Set([...STRUCTURED_THEME_GROUPS, "charts"]) } }))).toThrow(/\$theme groups/);
    const catalogue = (findBuiltinConfig("theme") ?? []).filter((k) => k.name !== "direction");
    expect(() => emit(input({ theme: { catalogue } }))).toThrow(/\$theme config keys[\s\S]*"direction"/);
  });

  it("fails when a token-less $theme group starts flattening to tokens", () => {
    expect(() => emit(input({ theme: { tokenNames: [...themeTokenNames(), "fontsImport"] } }))).toThrow(/"fonts" now flattens to tokens/);
  });

  it("fails when Icon's variant enum and SUPPORTED_VARIANTS disagree", () => {
    expect(() => emit(input({ iconVariants: new Set(["solid", "regular", "brands", "duotone"]) }))).toThrow(/icon variants[\s\S]*"duotone"/);
  });
});

describe("style types — the derived $theme keys are exactly what $theme applies", () => {
  const ctx = createContext(new StateStore(), { library: defaultLibrary });
  const expression = (src: string): Expression => {
    const program = parse(src);
    expect(program.errors, src).toEqual([]);
    return (program.statements[0] as { expression: Expression }).expression;
  };
  const themeTokens = (config: object): Record<string, string> =>
    (evaluate(expression(`$theme(${JSON.stringify(config)})`), ctx) as { tokens: Record<string, string> }).tokens;

  const out = emit(input());
  const groups: ReadonlyArray<readonly [group: string, alias: string, value: unknown]> = [
    ["colors", "ThemeColorToken", "#123456"],
    ["radius", "ThemeRadiusToken", "3px"],
    ["font", "ThemeFontToken", "600"],
    ["spacing", "ThemeSpacingToken", "5px"],
    ["shadows", "ThemeShadowToken", "none"],
    ["gradients", "ThemeGradientToken", ["#111111", "#222222"]],
    ["zIndex", "ThemeZIndexToken", 5],
    ["motion", "ThemeMotionToken", "90ms"],
  ];

  it("covers every structured group that has tokens", () => {
    expect(groups.map(([g]) => g).sort()).toEqual([...STRUCTURED_THEME_GROUPS].filter((g) => g !== "fonts").sort());
  });

  for (const [group, alias, value] of groups) {
    it(`every ${alias} reaches a theme token, and a key outside it does not`, () => {
      const keys = unionOf(out.themeDeclarations, alias);
      for (const key of keys) {
        const applied = sanitiseThemeTokens(themeTokens({ [group]: { [key]: value } }));
        expect(Object.keys(applied), `${group}.${key}`).toHaveLength(1);
      }
      expect(sanitiseThemeTokens(themeTokens({ [group]: { bogusKey: value } }))).toEqual({});
    });
  }
});

describe("style types — the theme tables the generator reads match the evaluator", () => {
  const ctx = createContext(new StateStore(), { library: defaultLibrary });
  const gradientOf = (value: unknown): string | undefined => {
    const program = parse(`$theme(${JSON.stringify({ gradients: { brand: value } })})`);
    return (evaluate((program.statements[0] as { expression: Expression }).expression, ctx) as { tokens: Record<string, string> }).tokens.gradientBrand;
  };

  it("accepts a string gradient exactly for THEME_GRADIENT_FUNCTIONS", () => {
    for (const fn of THEME_GRADIENT_FUNCTIONS) expect(gradientOf(`${fn}-gradient(#111111, #222222)`), fn).toBe(`${fn}-gradient(#111111, #222222)`);
    for (const fn of ["repeating-linear", "repeating-radial", "foo"]) expect(gradientOf(`${fn}-gradient(#111111, #222222)`), fn).toBeUndefined();
    expect(gradientOf("#ff0000")).toBeUndefined();
  });

  it("needs at least two stops (ThemeGradientStops), as an array or `{ stops, angle }`", () => {
    expect(gradientOf(["#111111"])).toBeUndefined();
    expect(gradientOf(["#111111", "#222222"])).toBe("linear-gradient(120deg, #111111, #222222)");
    expect(gradientOf({ stops: ["#111111", "#222222"], angle: 45 })).toBe("linear-gradient(45deg, #111111, #222222)");
  });

  it("imports web fonts from FONT_IMPORT_KEY, as one string or an array", () => {
    expect(loadFonts({ [FONT_IMPORT_KEY]: "Inter:400" })).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Inter/);
    expect(loadFonts({ [FONT_IMPORT_KEY]: ["Inter:400", "Lora:700"] })).toMatch(/family=Lora/);
  });
});
