/**
 * Reusable language-support module for Aktion.
 *
 * Framework-agnostic: this module ships pure data (grammar tokens, the
 * component catalog, builtins, snippets, theme names, severity tokens) plus
 * a lightweight stream tokenizer factory. It does not import CodeMirror,
 * Monaco, or any DOM API at the top level, so the same metadata can drive a
 * VS Code extension, a Monaco editor, a CodeMirror 6 instance, or pure-CLI
 * linting.
 *
 * Consume via `getLanguageSpec(library?)` — see `./README.md` for example
 * wiring against CodeMirror, Monaco, and VS Code.
 */

import type { ComponentLibrary } from "../library/types.js";
import { defaultLibrary } from "../library/index.js";
import { builtInThemes } from "../theme/index.js";

import {
  grammarSpec,
  createStreamTokenizer,
  defaultTagMap,
  keywordDocs,
  type GrammarSpec,
  type GrammarTokenKind,
  type StreamTokenizer,
  type KeywordDoc,
} from "./grammar.js";
import {
  getComponentCatalog,
  indexCatalog,
  type ComponentEntry,
  type ComponentParam,
} from "./components.js";
import { getSnippets, type SnippetEntry } from "./snippets.js";
import {
  builtinCatalog,
  builtinNames,
  builtinsByName,
  findBuiltin,
  isBuiltinName,
  type BuiltinEntry,
  type BuiltinCategory,
} from "./builtins.js";

export type {
  GrammarSpec,
  GrammarTokenKind,
  StreamTokenizer,
  KeywordDoc,
  ComponentEntry,
  ComponentParam,
  SnippetEntry,
  BuiltinEntry,
  BuiltinCategory,
};

export {
  grammarSpec,
  createStreamTokenizer,
  defaultTagMap,
  keywordDocs,
  getComponentCatalog,
  indexCatalog,
  getSnippets,
  builtinCatalog,
  builtinNames,
  builtinsByName,
  findBuiltin,
  isBuiltinName,
};

/**
 * Diagnostic severity buckets that map to common editor lint levels.
 * Editors typically map: `error` → red squiggle, `warning` → yellow,
 * `info` → blue, `hint` → grey.
 */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface LanguageSpec {
  grammar: GrammarSpec;
  /** Build a fresh tokenizer instance suitable for CodeMirror StreamLanguage. */
  tokenizer: StreamTokenizer;
  /** Map from grammar token kind → CodeMirror highlight tag name. */
  tagMap: Record<GrammarTokenKind, string | null>;
  components: ComponentEntry[];
  componentsByName: Record<string, ComponentEntry>;
  /** Catalog of `$`-prefixed builtins (hooks, factories, namespaces). */
  builtins: readonly BuiltinEntry[];
  snippets: readonly SnippetEntry[];
  /**
   * Reserved-keyword documentation (definition + syntax + example),
   * keyed by keyword. Powers keyword highlight-popups and hover help.
   */
  keywordDocs: Record<string, KeywordDoc>;
  /** Built-in theme names; useful for theme-picker autocomplete. */
  themeNames: readonly string[];
  /** Default severity for the parser's ParseError stream. */
  severityTokenMap: Record<"parse-error", DiagnosticSeverity>;
  /**
   * Font Awesome icon aliases used by components that accept `icon: string`.
   * Editors can use these to power icon-name autocomplete.
   */
  iconAliases: readonly string[];
}

/**
 * Build a complete language spec ready for editor consumption. Pass a custom
 * `ComponentLibrary` if your host has registered extra components via
 * `<aktion-app>.registerComponents([...])` — the returned spec will
 * include them in autocomplete and inspection tooltips.
 */
export function getLanguageSpec(library: ComponentLibrary = defaultLibrary): LanguageSpec {
  const components = getComponentCatalog(library);
  return {
    grammar: grammarSpec,
    tokenizer: createStreamTokenizer(grammarSpec),
    tagMap: defaultTagMap,
    components,
    componentsByName: indexCatalog(components),
    builtins: builtinCatalog,
    snippets: getSnippets(),
    keywordDocs,
    themeNames: Object.keys(builtInThemes),
    severityTokenMap: { "parse-error": "error" },
    iconAliases: COMMON_ICON_ALIASES,
  };
}

/**
 * A pragmatic shortlist of Font Awesome icon names that the design system
 * uses in templates. Editors get a useful autocomplete without us shipping
 * the full FA dictionary (which is ~2 MB).
 */
const COMMON_ICON_ALIASES: readonly string[] = [
  "house", "user", "users", "gear", "bell", "envelope", "magnifying-glass",
  "plus", "minus", "pen", "trash", "check", "xmark", "arrow-right", "arrow-left",
  "arrow-up", "arrow-down", "chevron-right", "chevron-left", "chevron-down",
  "chevron-up", "ellipsis", "ellipsis-vertical", "star", "heart", "bookmark",
  "calendar", "clock", "file", "folder", "image", "video", "music",
  "chart-line", "chart-bar", "chart-pie", "gauge", "table",
  "circle-info", "circle-check", "circle-exclamation", "circle-question",
  "triangle-exclamation", "shield", "lock", "unlock", "key", "rocket",
  "bolt", "fire", "snowflake", "sun", "moon", "cloud", "code", "terminal",
  "database", "server", "globe", "link", "share", "download", "upload",
  "filter", "sort", "list", "grid", "columns", "sidebar", "bars",
  "tag", "tags", "flag", "trophy", "medal", "gift", "cart-shopping",
  "credit-card", "money-bill", "receipt", "wallet", "comment", "comments",
  "paper-plane", "inbox", "paper-clip", "phone", "video-camera",
  "play", "pause", "stop", "forward", "backward", "expand", "compress",
  "eye", "eye-slash", "thumbs-up", "thumbs-down", "thumbtack",
];
