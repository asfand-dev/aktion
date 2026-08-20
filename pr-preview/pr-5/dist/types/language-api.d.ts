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
export { getDiagnostics, getLintWarnings, getCompletions, getHoverInfo, type Position, type Diagnostic, type CompletionItem, type HoverInfo, } from './tooling/language-service.js';
/**
 * Nearest-name ranking over the component library. `getDiagnostics` already
 * folds the suggestion into the unknown-component warning's prose, but an editor
 * that wants to offer the fix as an *applicable* action (a VS Code quick fix, an
 * LSP `textDocument/codeAction`) needs the candidate names as data. Exported so
 * no host re-implements edit distance over the catalogue — the rule is that
 * downstream artifacts derive from this surface, never from their own copy.
 */
export { suggestComponent } from './tooling/schema.js';
export { getDefinition, getDefinitionTarget, findDeclaration, getReferences, getDocumentHighlights, getDocumentSymbols, getRenameEdits, type Range, type TextEdit, type RenameResult, type DocumentSymbol, type SymbolKind, type DefinitionTarget, } from './tooling/navigation.js';
export { getSemanticTokens, semanticTokenTypes, semanticTokenModifiers, type SemanticToken, type SemanticTokenType, type SemanticTokenModifier, } from './tooling/semantic-tokens.js';
export { getSignatureHelp, type SignatureHelp, type SignatureInfo, type ParameterInfo, } from './tooling/signature-help.js';
export { getLanguageSpec, grammarSpec, keywordDocs, getComponentCatalog, universalPropCatalog, getSnippets, builtinCatalog, findBuiltin, isBuiltinName, namespaceCatalog, factoryResourceCatalog, factoryResourceNames, routeMembers, i18nResultMembers, findNamespace, isNamespaceName, findFactoryResource, namespaceMembersAt, findNamespaceMember, findBuiltinConfig, type LanguageSpec, type GrammarSpec, type ComponentEntry, type ComponentParam, type SnippetEntry, type KeywordDoc, type BuiltinEntry, type BuiltinCategory, type NamespaceEntry, type NamespaceMember, type NamespaceMemberKind, type FactoryResourceEntry, type ConfigKey, } from './language/index.js';
export { formatProgram, type FormatResult } from './tooling/formatter.js';
/**
 * Re-emit a `Program` as source.
 *
 * `linkProject` returns the merged source for its callers; `linkProgram` returns
 * only the `Program`, which leaves a Node host that has just linked an import
 * graph with no text to run the source-based lint pass (`getLintWarnings`) over.
 * That is exactly what `tools/validate-aktion-app.mjs` needs, so the printer
 * belongs on this surface too — it is pure and DOM-free.
 */
export { printProgram } from './tooling/formatter.js';
export { defaultLibrary } from './library/index.js';
export type { ComponentLibrary } from './library/types.js';
/**
 * The parser and the schema validator themselves. A Node host that lints or
 * pre-compiles `.aktion` files (CI gates, the `tools/validate-aktion*.mjs`
 * scripts, a bundler plugin) needs the raw program + errors, not just the
 * editor-shaped projections above. Both are pure and DOM-free.
 */
export { parse } from './parser/index.js';
export type { Program, ParseError } from './parser/types.js';
export { validateProgram, validateProgramSchema } from './library/validate.js';
/**
 * Built-in theme **data**. Only the token records and the pure resolver — not
 * `applyTheme`/`applyPartialTheme`, which write CSS variables onto a host
 * element and are therefore DOM-bound and stay on the package root. The records
 * are plain objects, so a Node host (docs generator, theme editor, agent-skill
 * reference) can read every token without a DOM.
 */
export { builtInThemes, builtInThemeFonts, resolveTheme, sanitiseThemeTokens, type ThemeTokens, type ThemeInput, type ResolvedTheme, } from './theme/index.js';
/**
 * Multi-file linking. `src/compiler/*` is deliberately free of `node:*` and of
 * any DOM access, so it belongs on this surface: linking an import graph is a
 * tooling concern, and without it a Node host cannot validate an app split
 * across `import`ed modules (every imported name reads as unknown).
 */
export { linkProgram, linkProject, resolveSpecifier, createMemoryResolver, type LinkResult, type LinkDiagnostic, type ModuleResolver, type LinkProjectOptions, type LinkProjectResult, } from './compiler/index.js';
