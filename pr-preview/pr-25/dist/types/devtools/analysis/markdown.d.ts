/**
 * Aktion DevTools — Markdown for bug reports and exported audits.
 *
 * Report text is built from values the app produced — URLs, log lines, CSS
 * selectors, state — and none of it may change the report's structure. Rather
 * than escaping characters one by one (easy to get wrong: a pipe escaped with a
 * backslash is undone by a backslash already in the value), app text goes into
 * code spans and fenced blocks whose delimiter is longer than any run of
 * backticks inside it, which CommonMark renders as literal text.
 */
/** One line of text: control characters (newlines included) become single spaces. */
export declare function singleLine(text: string): string;
/** An inline code span that nothing in `text` can close early. */
export declare function inlineCode(text: string): string;
/** A fenced code block that no line of `lines` can close early. */
export declare function codeBlock(lines: ReadonlyArray<string>, info?: string): string[];
