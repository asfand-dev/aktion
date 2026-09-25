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
 * `.aktion` files are JS/TS-syntax compatible except for exactly ONE
 * construct: a bare top-level `export IDENTIFIER = …` (or
 * `export $identifier = …`) with no declaration keyword — see `eslint/scan.ts`'s
 * header for the full grammar cross-check against `src/parser/parser.ts`.
 * `preprocess` rewrites every such occurrence into `export const IDENTIFIER =
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
 *   // The two portable blocks this package documents — processor wiring
 *   // plus the eight DSL-general rule overrides (see `aktionRecommendedRules`
 *   // for the full citations).
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
 * (the plain rules record), plus the pure `scan`/`remap` primitives for
 * anyone building their own tooling on top of the same position-remap
 * machinery.
 */

export { aktionProcessor } from "./eslint/processor.js";
export { aktionRecommendedRules } from "./eslint/rules.js";
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
import { aktionProcessor } from "./eslint/processor.js";
import { aktionRecommendedRules } from "./eslint/rules.js";

/**
 * ESLint flat-config-compatible plugin object, mirroring the public shape of
 * other processor-based ESLint plugins (e.g. `eslint-plugin-markdown`'s
 * `configs.recommended`).
 *
 * `configs.recommended` covers the two DSL-general blocks — routing `.aktion`
 * files through the processor, and the eight rule overrides every consumer
 * needs — but deliberately stops short of wiring a parser for the processor's
 * virtual `.ts` block: `aktion-runtime` has no opinion on, and no dependency
 * on, which JS/TS parser a consumer uses. Add that block yourself (see the
 * module doc comment above for the exact shape) — flat config merges every
 * config object matching the same `files` glob, so your own
 * `**\/*.aktion/*.ts` block combines with the one `configs.recommended`
 * already provides.
 */
const aktionEslintPlugin: ESLint.Plugin = {
  meta: {
    name: "aktion-runtime",
    version: "0.1.0",
  },
  processors: {
    aktion: aktionProcessor,
  },
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
    rules: {
      ...aktionRecommendedRules,
    },
  },
];

aktionEslintPlugin.configs = {
  recommended: recommendedConfig,
};

export default aktionEslintPlugin;
