/**
 * Pure-data grammar description for Aktion.
 *
 * The grammar lives here as plain JSON-style data and a minimal stream
 * tokenizer factory. The stream tokenizer returned by
 * `createStreamTokenizer` matches the shape of CodeMirror 6's `StreamParser`
 * (`token`, `startState`, `copyState`), but it does NOT import CodeMirror or
 * any DOM API — so the same data drives Monaco, a VS Code TextMate grammar,
 * or any other editor.
 *
 * Token kinds are reported as semantic strings. Consumers map them to their
 * own highlight tags (CodeMirror's `tags`, Monaco's `TokenType`, etc.).
 */
export type GrammarTokenKind = "comment" | "string" | "number" | "atom" | "keyword" | "state" | "component" | "identifier" | "operator" | "punctuation" | "loopvar" | "property";
export interface GrammarSpec {
    name: "aktion";
    /** Literal atoms (true / false / null). */
    atoms: readonly string[];
    /** Reserved keywords that drive control flow and declarations. */
    keywords: readonly string[];
    /** Operators (longest-match first when tokenising). */
    operators: readonly string[];
    /** Two-character operators that must be matched before single chars. */
    operatorsLong: readonly string[];
    /** Brackets that must be balanced; useful for editor bracket matching. */
    brackets: ReadonlyArray<{
        open: string;
        close: string;
    }>;
    comments: {
        /** Primary line-comment introducer (used by editors for Ctrl+/ toggle). */
        line: string;
        blockStart: string;
        blockEnd: string;
    };
    strings: {
        /** Quote characters allowed for single-line escape-supporting strings. */
        singleLineQuotes: readonly string[];
        /** Quote character for multi-line raw strings (no escaping needed). */
        multiLineQuote: string;
    };
    identifier: {
        start: RegExp;
        part: RegExp;
    };
    /** Sigils that mark non-identifier categories. */
    sigils: {
        state: string;
    };
}
export declare const grammarSpec: GrammarSpec;
/**
 * Documentation for a reserved keyword — surfaced by the language
 * service hover provider and the playground keyword-popup. Each entry
 * has a one-line `summary`, a `syntax` skeleton, and a runnable
 * `example` snippet.
 */
export interface KeywordDoc {
    /** One-line description of what the keyword does. */
    summary: string;
    /** Syntax skeleton, e.g. `if (condition) { … } else { … }`. */
    syntax: string;
    /** Short usage example. */
    example: string;
}
/**
 * Canonical explanations for every reserved word / top-level handle in
 * `grammarSpec.keywords`. Single source of truth shared by the language
 * service (`getHoverInfo`) and the playground keyword popups so the two
 * never drift. Keep this in sync with `grammarSpec.keywords`.
 */
export declare const keywordDocs: Record<string, KeywordDoc>;
/**
 * Mutable state carried by the stream tokenizer between calls. We track the
 * unclosed multi-line constructs (backtick strings, block comments).
 */
export interface StreamState {
    inBacktick: boolean;
    inBlockComment: boolean;
}
export interface StreamLike {
    /** True at column 0 of a line (CodeMirror exposes `stream.sol()`). */
    sol(): boolean;
    /** Returns next char without consuming. */
    peek(): string | null | undefined;
    /** Consume and return the next char, advancing the stream. */
    next(): string | undefined;
    /** Consume while the predicate matches. */
    eatWhile(test: RegExp | ((ch: string) => boolean)): boolean;
    /** Consume one char if it matches; returns whether it consumed. */
    eat(test: string | RegExp | ((ch: string) => boolean)): string | undefined;
    /**
     * Consume everything up to (and optionally including) the given string or
     * regex. CodeMirror's `skipTo` matches the string in the rest of the line.
     * We rely only on `match(string, consume?)` which is available in CM6.
     */
    match(pattern: string | RegExp, consume?: boolean): boolean | RegExpMatchArray | null;
    /** Skip to end of line. */
    skipToEnd(): void;
    /** True at end of line. */
    eol(): boolean;
}
export interface StreamTokenizer {
    startState(): StreamState;
    copyState(state: StreamState): StreamState;
    token(stream: StreamLike, state: StreamState): GrammarTokenKind | null;
    /**
     * Language metadata that CodeMirror's `StreamLanguage.define(...)` will pick
     * up — comment style and bracket pairs for auto-pairing.
     */
    languageData: {
        commentTokens: {
            line: string;
            block: {
                open: string;
                close: string;
            };
        };
        closeBrackets: {
            brackets: readonly string[];
        };
        indentOnInput: RegExp;
    };
}
/**
 * Lookahead tokenizer driven by `grammarSpec`. Suitable for
 * `StreamLanguage.define(...)` in CodeMirror 6, but framework-agnostic.
 */
export declare function createStreamTokenizer(spec?: GrammarSpec): StreamTokenizer;
/**
 * Default mapping from grammar token kinds to CodeMirror highlight tag names.
 *
 * Returned as plain strings so consumers can resolve them to whatever their
 * highlighter understands. We keep `tagName: string | null` so consumers may
 * skip a kind entirely (e.g. punctuation is often left unhighlighted).
 */
export declare const defaultTagMap: Record<GrammarTokenKind, string | null>;
