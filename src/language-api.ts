/**
 * `aktion-runtime/language` — the DOM-free language + tooling surface.
 *
 * Editors (the VS Code extension, a future LSP), CLIs, and any Node host that
 * needs diagnostics / completions / hover / snippets / grammar metadata import
 * this instead of the package root. The root entry (`aktion-runtime`) defines
 * the `<aktion-app>` custom element — `class AktionElement extends HTMLElement`
 * plus a top-level `defineElement()` — which throws in a non-DOM runtime. This
 * module pulls in NONE of that: everything re-exported here is pure and
 * Node-safe (no DOM access at import time).
 */

export {
  getDiagnostics,
  getCompletions,
  getHoverInfo,
  type Position,
  type Diagnostic,
  type CompletionItem,
  type HoverInfo,
} from "./tooling/language-service.js";

export {
  getDefinition,
  getDefinitionTarget,
  findDeclaration,
  getReferences,
  getDocumentHighlights,
  getDocumentSymbols,
  getRenameEdits,
  type Range,
  type TextEdit,
  type RenameResult,
  type DocumentSymbol,
  type SymbolKind,
  type DefinitionTarget,
} from "./tooling/navigation.js";

export {
  getSemanticTokens,
  semanticTokenTypes,
  semanticTokenModifiers,
  type SemanticToken,
  type SemanticTokenType,
  type SemanticTokenModifier,
} from "./tooling/semantic-tokens.js";

export {
  getSignatureHelp,
  type SignatureHelp,
  type SignatureInfo,
  type ParameterInfo,
} from "./tooling/signature-help.js";

export {
  getLanguageSpec,
  grammarSpec,
  keywordDocs,
  getComponentCatalog,
  getSnippets,
  builtinCatalog,
  findBuiltin,
  isBuiltinName,
  type LanguageSpec,
  type GrammarSpec,
  type ComponentEntry,
  type ComponentParam,
  type SnippetEntry,
  type KeywordDoc,
  type BuiltinEntry,
  type BuiltinCategory,
} from "./language/index.js";

export { formatProgram, type FormatResult } from "./tooling/formatter.js";

export { defaultLibrary } from "./library/index.js";
export type { ComponentLibrary } from "./library/types.js";
