/**
 * Tokenizer for Aktion.
 *
 * The surface syntax is a strict subset of JavaScript. We tokenize into a
 * flat stream of tokens including NEWLINE markers so that the parser can
 * recover at line boundaries.
 */
export type TokenType = "Identifier" | "Keyword" | "StateIdentifier" | "Number" | "String"
/**
 * Backtick-quoted template literal — carries alternating raw chunks and
 * embedded expression source strings via `parts`.
 */
 | "TemplateString" | "Boolean" | "Null"
/**
 * Regex literal `/pattern/flags`. `value` carries the pattern body and
 * `flags` the trailing flag letters; the parser desugars it to
 * `new RegExp(value, flags)`.
 */
 | "Regex" | "Punctuation" | "Operator" | "Newline" | "Semicolon" | "EOF";
/**
 * Keywords reserved by Aktion. The lexer recognises them so the parser can
 * dispatch on `Keyword` tokens directly.
 */
export declare const KEYWORDS_AKTION: Set<string>;
export type TemplatePart = {
    kind: "str";
    text: string;
} | {
    kind: "expr";
    source: string;
    line: number;
    column: number;
};
export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
    /** Set on `TemplateString` tokens to carry the alternating parts. */
    parts?: TemplatePart[];
    /** Set on `Regex` tokens to carry the trailing flag letters. */
    flags?: string;
}
export declare function tokenize(source: string): Token[];
