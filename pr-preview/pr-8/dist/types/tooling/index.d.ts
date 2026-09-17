/**
 * Tooling surface (§27) — host-side helpers projected from the schema.
 *
 * The pieces ship as a separate entry so library consumers can opt in
 * without paying for them at runtime. Each helper is pure: feed in
 * source / AST / library, get diagnostics, canonical source, or a
 * structured AST view back.
 *
 * Surfaces
 * --------
 *
 *   - `formatProgram(source)` — canonical pretty-printer.
 *   - `applyDelta(source, ops)` — structured edit protocol (§14).
 *   - `inspectAST(source)` — Committed + Drafting AST snapshot.
 *   - `getDiagnostics(source, library)` — language-service diagnostics.
 *   - `getCompletions(source, position, library)` — completions.
 *   - `getHoverInfo(source, position, library)` — hover docs.
 */
export { formatProgram } from './formatter.js';
export type { FormatResult } from './formatter.js';
export { applyDelta } from './delta.js';
export type { DeltaOp, DeltaResult } from './delta.js';
export { inspectAST, inspectProgram } from './inspector.js';
export type { InspectorBinding, InspectorView } from './inspector.js';
export { getDiagnostics, getLintWarnings, getCompletions, getHoverInfo, } from './language-service.js';
export type { Position, Diagnostic, CompletionItem, HoverInfo, } from './language-service.js';
export { getDefinition, getDefinitionTarget, findDeclaration, getReferences, getDocumentHighlights, getDocumentSymbols, getRenameEdits, } from './navigation.js';
export type { Range, TextEdit, RenameResult, DocumentSymbol, SymbolKind, DefinitionTarget, } from './navigation.js';
export { getSemanticTokens, semanticTokenTypes, semanticTokenModifiers, } from './semantic-tokens.js';
export type { SemanticToken, SemanticTokenType, SemanticTokenModifier, } from './semantic-tokens.js';
export { getSignatureHelp, } from './signature-help.js';
export type { SignatureHelp, SignatureInfo, ParameterInfo, } from './signature-help.js';
export { htmlToAktion } from './html-import.js';
export { componentSchema, tailwindToSx, cssToSx, styledToSx, buildGallery, suggestComponent, } from './schema.js';
export type { LibrarySchema, ComponentSchemaEntry, ComponentPropSchema, GalleryOptions, } from './schema.js';
