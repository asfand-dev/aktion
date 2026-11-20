/**
 * Snippet templates for common Aktion composites.
 *
 * Placeholders use `${1:label}` syntax. CodeMirror's `snippet()` from
 * `@codemirror/autocomplete` parses this format natively. Monaco and VS
 * Code do too (it matches the LSP snippet format).
 */
export interface SnippetEntry {
    /** Snippet key — used as the autocomplete completion label. */
    name: string;
    /** Human-readable description shown in the autocomplete popup. */
    description: string;
    /** The template body with `${n:label}` placeholders. */
    template: string;
}
export declare const snippetCatalog: readonly SnippetEntry[];
export declare function getSnippets(): readonly SnippetEntry[];
