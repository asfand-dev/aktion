/**
 * Tiny, dependency-free syntax highlighter (suggestions-global VIII.3).
 *
 * Tokenises a line of code into `{ text, cls }` spans for a handful of common
 * languages. It is intentionally lightweight (a single-pass scanner, not a
 * full parser) — enough to colour keywords, strings, comments, numbers, and
 * punctuation in docs/snippets without pulling in a 200 KB grammar engine.
 * Output is always plain text segments, so the caller can build DOM spans
 * safely (no HTML injection).
 */
export interface HlToken {
    text: string;
    /** Token class suffix (`rui-hl-<cls>`), or null for plain text. */
    cls: string | null;
}
export declare function highlightLine(line: string, lang: string, state: {
    inBlockComment: boolean;
}): HlToken[];
/** True when `lang` is a language we can meaningfully highlight. */
export declare function isHighlightable(lang: string): boolean;
