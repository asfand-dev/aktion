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
 | "Regex" | "Punctuation" | "Operator" | "Newline" | "Semicolon"
/**
 * Source the lexer cannot make a token of: a character Aktion has no use
 * for (`@`, `#`, `\`, a non-ASCII letter) or an unterminated string or
 * template literal. `value` is the offending text and `message` the
 * diagnostic. The parser reports it wherever it meets the token, so the
 * input is rejected instead of silently losing the character.
 */
 | "Error" | "EOF";
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
    /**
     * Index in the tokenized text of `source`'s first character (just past
     * the `${`). `source` is a verbatim slice of the input, so this is what
     * lets the parser carry {@link TokenizeOptions.softNewlines} into the
     * interpolation's own sub-parse.
     */
    offset?: number;
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
    /** Set on `Error` tokens: the diagnostic the parser reports for them. */
    message?: string;
    /**
     * Set on a `String` token written as a backtick template literal without
     * interpolation, so the parser can tell `` tag`x` `` (a tagged template,
     * unsupported) from a plain string.
     */
    template?: true;
    /**
     * Set on the `String` / `TemplateString` token that was still open at the end
     * of the input and was accepted only because of {@link TokenizeOptions.streaming}.
     */
    open?: true;
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
/** Options for {@link tokenize}. */
export interface TokenizeOptions {
    /**
     * The source is a prefix of a response that is still being generated. A
     * string or template literal that is still open at the very end of the input
     * is then lexed as the string it has so far, because the chunk that closes it
     * has not arrived yet. Left off, such a literal is an `Error` token. (A plain
     * string cut off by a newline is an error either way: more input cannot
     * close it.)
     */
    streaming?: boolean;
    /**
     * Offsets (indices into `source`) of `\n` characters that are NOT line
     * terminators for the grammar: the lexer emits no `Newline` token for them,
     * but still advances the line counter, so every position after them stays
     * exact.
     *
     * Used by the TypeScript frontend. It blanks type annotations with spaces
     * and keeps their line breaks, so a newline that sat inside a multi-line type
     * (`foo<⏎ Bar⏎>(1)`, `const o: {⏎ a: number⏎} = …`) would otherwise end the
     * statement it is part of. Any other offset in the set is ignored. Only
     * `\n` offsets are expected; an offset of a U+2028 / U+2029 line separator
     * is honoured the same way.
     */
    softNewlines?: ReadonlySet<number>;
}
/**
 * Tokenize `source`. When `comments` is passed, every `//` line comment and
 * `/* *\/` block comment encountered is pushed onto it (in source order,
 * mirroring the token stream) instead of being silently discarded — this is
 * an optional out-param rather than a return-shape change so every existing
 * caller (`navigation.ts`, `semantic-tokens.ts`, …) that only wants tokens
 * keeps working unmodified.
 */
export declare function tokenize(source: string, comments?: RawComment[], options?: TokenizeOptions): Token[];
