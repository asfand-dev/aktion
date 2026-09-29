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
export type CommentKind = "Line" | "Block";
/**
 * A `//` or `/* *\/` comment collected as out-of-band trivia rather than a
 * token — the parser never has to explicitly skip a "Comment" token at every
 * call site (mirrors how most JS-family tokenizers keep comments off the main
 * token stream). `text` is the RAW comment text INCLUDING its delimiters
 * (`// note`, `/* block *\/`), exactly as written; the comment-attachment
 * pass in `parser.ts` re-emits it verbatim rather than reformatting the
 * contents.
 */
export interface RawComment {
    kind: CommentKind;
    text: string;
    line: number;
    column: number;
    /** Line the comment's last character sits on — equals `line` for a `Line` comment, may exceed it for a multi-line `Block` comment. */
    endLine: number;
}
/**
 * Tokenize `source`. When `comments` is passed, every `//` line comment and
 * `/* *\/` block comment encountered is pushed onto it (in source order,
 * mirroring the token stream) instead of being silently discarded — this is
 * an optional out-param rather than a return-shape change so every existing
 * caller (`navigation.ts`, `semantic-tokens.ts`, …) that only wants tokens
 * keeps working unmodified.
 */
export declare function tokenize(source: string, comments?: RawComment[]): Token[];
