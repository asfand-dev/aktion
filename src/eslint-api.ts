/**
 * `aktion-runtime/eslint` — lint (and `--fix`) `.aktion` DSL files with a
 * real JS/TS-backed ESLint, using the consumer's OWN parser and rule set —
 * not a bespoke reimplementation of any rule.
 *
 * Like `aktion-runtime/language`, this is a self-contained, DOM-free Node
 * entry: it pulls in none of the `<aktion-app>` custom element and can be
 * imported from a plain `eslint.config.js` running under plain Node with no
 * bundler in front of it.
 *
 * ## Why this works
 *
 * A `.aktion` file can be written to parse as JS/TS. The one construct this
 * processor rewrites is a bare top-level `export IDENTIFIER = …` (or
 * `export $identifier = …`) with no declaration keyword, a syntax error in
 * JS/TS — see `eslint/scan.ts`'s header for the full grammar cross-check against
 * `src/parser/parser.ts`; anything else a JS parser rejects is reported by the
 * consumer's own parser. `preprocess` rewrites every such occurrence into `export const IDENTIFIER =
 * …` (genuinely valid JS/TS) and hands the result to the parser the CONSUMER
 * configures for the processor's virtual `.ts` block; `postprocess` remaps
 * every reported position — and any autofix — back to the original file's
 * coordinates (`eslint/remap.ts`, unit-tested in complete isolation from
 * ESLint itself).
 *
 * This package does NOT depend on `eslint`, a TS/JS parser, or any ESLint
 * plugin as a hard dependency — bring your own installation. `eslint` is a
 * peer dependency (see `package.json`), and the parser/rule set for the
 * processor's virtual block is entirely the consumer's choice.
 *
 * ## Consuming it (flat config)
 *
 * ```js
 * import aktionEslint from "aktion-runtime/eslint";
 * import tsParser from "@typescript-eslint/parser";
 *
 * export default [
 *   // The two portable blocks this package documents — processor wiring,
 *   // plus the names the runtime injects (`aktionGlobals`, so `no-undef` knows
 *   // `Container`, `$state`, `route`, …) and the ten DSL-general rule
 *   // overrides (see `aktionRecommendedRules` for the full citations).
 *   ...aktionEslint.configs.recommended,
 *   {
 *     // Matches the SAME virtual per-block path the processor produces
 *     // (`<file>.aktion/0_eslint-aktion.ts`) — bring your own parser here.
 *     // `aktion-runtime` does not hard-depend on any JS/TS parser, so this
 *     // block cannot be pre-built into `configs.recommended` itself.
 *     files: ["**\/*.aktion/*.ts"],
 *     languageOptions: {
 *       parser: tsParser,
 *       ecmaVersion: 2022,
 *       sourceType: "module",
 *       // REQUIRED: the virtual path doesn't exist on disk and isn't named
 *       // in any tsconfig `include`, so a type-aware parser's project
 *       // service fails outright if this isn't disabled.
 *       parserOptions: { project: false, projectService: false },
 *     },
 *   },
 * ];
 * ```
 *
 * Prefer to assemble the pieces yourself instead of spreading
 * `configs.recommended`? Every piece is exported individually too:
 * `aktionProcessor` (the `Linter.Processor` object), `aktionRecommendedRules`
 * (the plain rules record), `aktionGlobals` (every name the runtime injects, for
 * `languageOptions.globals` — so `no-undef` knows `Container`, `$state`,
 * `route`, … without a hand-kept list), plus the pure `scan`/`remap`
 * primitives for anyone building their own tooling on top of the same
 * position-remap machinery.
 *
 * ## `.aktion.ts` / `.aktion.js` modules
 *
 * Modules authored in TypeScript or JavaScript need no processor: they are
 * real `.ts`/`.js` files, so the parser and (type-aware) rules a consumer
 * already applies to that extension lint them as they are. What they need is
 * a different set of overrides — Aktion still parses and evaluates the
 * erased code with its own grammar and semantics (see
 * `aktionTypeScriptRules`) — plus two rules of this package for objects
 * Aktion reads by syntax where TypeScript sees only their type:
 * `aktion/props-literal` (type-aware), for a props bag TypeScript accepts but
 * Aktion never reads, and `aktion/router-literal`, for a `$router` table.
 * `aktionTypeScriptConfig` (also `configs.typescript`) applies all of them to
 * `**\/*.aktion.ts` and `**\/*.aktion.js`:
 *
 * ```js
 * import aktionEslint from "aktion-runtime/eslint";
 * import tseslint from "typescript-eslint";
 * import unicorn from "eslint-plugin-unicorn";
 *
 * export default [
 *   ...tseslint.configs.recommendedTypeChecked,
 *   unicorn.configs.recommended,
 *   {
 *     // `aktion/props-literal` reads the type checker; without type
 *     // information it reports nothing. Root config files (this one,
 *     // `vite.config.ts`) sit outside a scaffold's tsconfig `include`, so the
 *     // project service must be allowed a default project for them.
 *     languageOptions: {
 *       parserOptions: {
 *         projectService: { allowDefaultProject: ["*.config.js", "*.config.ts"] },
 *         tsconfigRootDir: import.meta.dirname,
 *       },
 *     },
 *   },
 *   // Last, so its overrides win over the rule sets above.
 *   ...aktionEslint.configs.typescript,
 * ];
 * ```
 *
 * Unlike `configs.recommended`, this preset also switches rules ON, as
 * errors that override the consumer's own settings for these files: core
 * `object-shorthand` in `properties` mode and `unicorn/switch-case-braces` in
 * `avoid` mode (see `aktionTypeScriptRules`). The unicorn one needs
 * `eslint-plugin-unicorn` registered as `unicorn`; without it, follow the
 * preset with `{ files: ["**\/*.aktion.ts", "**\/*.aktion.js"], rules: {
 * "unicorn/switch-case-braces": "off" } }`. The two rules are also exported
 * as `aktionPropsLiteralRule` and `aktionRouterLiteralRule`.
 */

export { aktionProcessor } from "./eslint/processor.js";
export { aktionRecommendedRules, aktionTypeScriptRules } from "./eslint/rules.js";
export { aktionGlobals, type AktionGlobalAccess } from "./eslint/globals.js";
export { aktionPropsLiteralRule } from "./eslint/props-literal.js";
export { aktionRouterLiteralRule } from "./eslint/router-literal.js";
export { findBareExportInsertions, type ExportInsertion } from "./eslint/scan.js";
export {
  applyInsertions,
  computeLineStarts,
  lineColumnToOffset,
  offsetToLineColumn,
  rangeOverlapsInsertion,
  toOriginalOffset,
  type Insertion,
} from "./eslint/remap.js";

import type { ESLint, Linter } from "eslint";
import { aktionGlobals, type AktionGlobalAccess } from "./eslint/globals.js";
import { aktionProcessor } from "./eslint/processor.js";
import { aktionPropsLiteralRule } from "./eslint/props-literal.js";
import { aktionRouterLiteralRule } from "./eslint/router-literal.js";
import { aktionRecommendedRules, aktionTypeScriptRules } from "./eslint/rules.js";

/**
 * ESLint flat-config-compatible plugin object, mirroring the public shape of
 * other processor-based ESLint plugins (e.g. `eslint-plugin-markdown`'s
 * `configs.recommended`).
 *
 * `configs.recommended` covers the two DSL-general blocks — routing `.aktion`
 * files through the processor, and the ten rule overrides every consumer
 * needs plus the names the runtime injects (`aktionGlobals`, so `no-undef` stays
 * usable) — but deliberately stops short of wiring a parser for the
 * processor's virtual `.ts` block: `aktion-runtime` has no opinion on, and no
 * dependency on, which JS/TS parser a consumer uses. Add that block yourself (see the
 * module doc comment above for the exact shape) — flat config merges every
 * config object matching the same `files` glob, so your own
 * `**\/*.aktion/*.ts` block combines with the one `configs.recommended`
 * already provides.
 *
 * `configs.typescript` (`aktionTypeScriptConfig`) is the counterpart for
 * `.aktion.ts`/`.aktion.js` modules, and `rules` holds the plugin's two rules,
 * addressed as `aktion/props-literal` and `aktion/router-literal`. `globals`
 * is the same record the entry exports as `aktionGlobals`, for a consumer that reads
 * it off the plugin instead of importing it.
 */
const aktionEslintPlugin: ESLint.Plugin & { globals: Readonly<Record<string, AktionGlobalAccess>> } = {
  meta: {
    name: "aktion-runtime",
    version: "0.1.0",
  },
  processors: {
    aktion: aktionProcessor,
  },
  rules: {
    "props-literal": aktionPropsLiteralRule,
    "router-literal": aktionRouterLiteralRule,
  },
  globals: aktionGlobals,
};

// Assigned after the object literal above (rather than inline) because this
// config's first entry registers the plugin BY REFERENCE
// (`plugins: {aktion: aktionEslintPlugin}`) — the same self-reference pattern
// `eslint-plugin-markdown`'s own `lib/index.js` uses for its
// `configs.recommended`.
const recommendedConfig: Linter.Config[] = [
  {
    name: "aktion/recommended/plugin",
    plugins: {
      aktion: aktionEslintPlugin,
    },
  },
  {
    name: "aktion/recommended/processor",
    files: ["**/*.aktion"],
    processor: "aktion/aktion",
  },
  {
    name: "aktion/recommended/rules",
    files: ["**/*.aktion/*.ts"],
    languageOptions: {
      globals: { ...aktionGlobals },
    },
    rules: {
      ...aktionRecommendedRules,
    },
  },
];

/**
 * The flat-config preset for `.aktion.ts` / `.aktion.js` modules: registers
 * the plugin (by reference, like `configs.recommended`) and applies
 * `aktionTypeScriptRules` plus `aktion/props-literal` and
 * `aktion/router-literal` to exactly those two extensions — not to the processor's virtual `**\/*.aktion/*.ts` blocks
 * (whose basename is `0_eslint-aktion.ts`) and not to host `.ts`/`.js` code.
 *
 * It sets no parser and no `parserOptions`: these are real `.ts`/`.js` files
 * the consumer's own TypeScript/JavaScript blocks already cover, and
 * `aktion/props-literal` simply does nothing where those blocks provide no
 * type information (`aktion/router-literal` needs none). Spread it AFTER the consumer's rule sets so its overrides
 * win, and see `aktionTypeScriptRules` for the two entries it switches on and
 * the one that needs `eslint-plugin-unicorn`.
 */
export const aktionTypeScriptConfig: Linter.Config[] = [
  {
    name: "aktion/typescript/plugin",
    plugins: {
      aktion: aktionEslintPlugin,
    },
  },
  {
    name: "aktion/typescript/rules",
    files: ["**/*.aktion.ts", "**/*.aktion.js"],
    rules: {
      ...aktionTypeScriptRules,
      "aktion/props-literal": "error",
      "aktion/router-literal": "error",
    },
  },
];

aktionEslintPlugin.configs = {
  recommended: recommendedConfig,
  typescript: aktionTypeScriptConfig,
};

export default aktionEslintPlugin;
