import { Position } from './language-service.js';
export interface Range {
    /** 1-indexed inclusive start. */
    start: Position;
    /** 1-indexed exclusive end (column points one past the last character). */
    end: Position;
}
export interface TextEdit {
    range: Range;
    newText: string;
}
export interface RenameResult {
    edits: TextEdit[];
    /** Set when the rename is rejected (the symbol cannot be renamed safely). */
    error?: string;
}
export type SymbolKind = "component" | "action" | "hook" | "state" | "import";
/**
 * Resolved go-to-definition target. Cross-file navigation lives in the host
 * (it must read the imported file), so the service classifies the cursor:
 *
 *   - `local`          → a declaration in THIS file (`range` is set).
 *   - `import-binding` → an imported name; the host resolves `moduleSource`
 *                        to a file and looks up `imported` there.
 *   - `module`         → the module specifier string itself (open the file).
 */
export interface DefinitionTarget {
    kind: "local" | "import-binding" | "module";
    /** Set for `kind: "local"` — the declaration range in this file. */
    range?: Range;
    /** Set for `kind: "import-binding"` — the name as exported by the module. */
    imported?: string;
    /** Set for `kind: "import-binding"` — whether the binding is a `$state` atom. */
    isState?: boolean;
    /** Set for `import-binding` + `module` — the raw module specifier. */
    moduleSource?: string;
}
export interface DocumentSymbol {
    /** Display name — includes the `$` sigil for state atoms / hooks. */
    name: string;
    /** Human-readable category, e.g. `"component"`. */
    detail: string;
    kind: SymbolKind;
    /** Span used for the outline row (here: the name token). */
    range: Range;
    /** Span the editor reveals/selects when the row is picked (the name). */
    selectionRange: Range;
}
/**
 * Location of the declaration for the symbol under `position`, or `null` when
 * the cursor is not over a navigable, file-scoped symbol.
 */
export declare function getDefinition(source: string, position: Position): Range | null;
/**
 * Classify the go-to-definition target under `position`. Unlike
 * `getDefinition` (which only ever resolves within the current file), this
 * also recognises imported bindings and the module specifier string so a host
 * can perform cross-file navigation. Returns `null` when there is nothing to
 * jump to.
 */
export declare function getDefinitionTarget(source: string, position: Position): DefinitionTarget | null;
/**
 * Find the declaration of a top-level `name` in `source` (used by a host to
 * land on an imported symbol's definition in another file). `isState`
 * disambiguates the `$`-namespace from the identifier namespace.
 */
export declare function findDeclaration(source: string, name: string, isState: boolean): Range | null;
/**
 * Every occurrence of the symbol under `position`. For a known file-scoped
 * declaration this is precise; for an unrecognised identifier it falls back to
 * same-name, same-kind tokens (handy as document highlights).
 */
export declare function getReferences(source: string, position: Position, options?: {
    includeDeclaration?: boolean;
}): Range[];
/**
 * Highlight all occurrences of the symbol under `position` (the editor paints
 * these when the cursor rests on a name). Always includes the declaration.
 */
export declare function getDocumentHighlights(source: string, position: Position): Range[];
/**
 * Rename a file-scoped symbol. Returns the edits to apply, or an `error`
 * explaining why the rename was rejected (unknown symbol, invalid new name).
 * `newName` may be supplied with or without the leading `$`.
 */
export declare function getRenameEdits(source: string, position: Position, newName: string): RenameResult;
/**
 * The document outline: every top-level declaration (atoms, components,
 * actions, hooks) and `import` binding, in source order.
 */
export declare function getDocumentSymbols(source: string): DocumentSymbol[];
