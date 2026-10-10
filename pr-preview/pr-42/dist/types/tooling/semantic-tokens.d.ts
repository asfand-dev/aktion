import { ComponentLibrary } from '../library/types.js';
/** Token type legend (the host registers these in the same order). */
export declare const semanticTokenTypes: readonly ["namespace", "class", "function", "variable", "property", "keyword", "number"];
export type SemanticTokenType = (typeof semanticTokenTypes)[number];
/** Token modifier legend (a token may carry several). */
export declare const semanticTokenModifiers: readonly ["declaration", "defaultLibrary"];
export type SemanticTokenModifier = (typeof semanticTokenModifiers)[number];
export interface SemanticToken {
    /** 1-indexed line. */
    line: number;
    /** 1-indexed column (start). */
    column: number;
    /** Character length of the token (includes `$` for state identifiers). */
    length: number;
    tokenType: SemanticTokenType;
    tokenModifiers: SemanticTokenModifier[];
}
/**
 * Classify every meaningful token in `source`. Unknown lowercase identifiers
 * (locals, params, bare globals) are intentionally left untagged so the
 * TextMate layer keeps colouring them — semantic tokens only fire where we can
 * say something the regex grammar cannot.
 */
export declare function getSemanticTokens(source: string, library?: ComponentLibrary): SemanticToken[];
