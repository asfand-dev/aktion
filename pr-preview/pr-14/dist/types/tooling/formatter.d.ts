import { ParseError, Program } from '../parser/types.js';
/**
 * Configures the printer's indentation, quote style, trailing commas and
 * object curly spacing. Every default matches today's hard-coded behaviour
 * (2-space indents, double-quoted strings, no trailing comma, spaced object
 * braces), so calling `formatProgram`/`printProgram` with no options is
 * BIT-FOR-BIT IDENTICAL to the pre-existing output — this is load-bearing:
 * the printer is a published surface with real consumers depending on that
 * exact shape.
 */
export interface FormatOptions {
    /** `"space"` (default) or `"tab"`. */
    indentStyle?: "space" | "tab";
    /**
     * Spaces per indent level when `indentStyle` is `"space"` (default `2`).
     * Ignored when `indentStyle` is `"tab"` — one tab is emitted per level
     * regardless of width, matching how every other tab-indented tool works.
     */
    indentWidth?: number;
    /**
     * `"single"` or `"double"` (default) quotes for string literals — applies
     * everywhere the printer emits a quoted string (literals, object keys,
     * import sources, `$effect` dependency strings), not just `printLiteral`.
     * A string containing the chosen quote char but not the other one falls
     * back to the other quote for THAT string only, to avoid an ugly escape —
     * mirrors ESLint's `quotes` rule with `avoidEscape: true`.
     */
    quoteStyle?: "single" | "double";
    /**
     * Trailing comma after the last item once an `Array`/`Object` literal
     * wraps across multiple lines (default `false`, matching today's
     * behaviour — never add one). Mirrors ESLint's
     * `comma-dangle: "always-multiline"`. Destructuring patterns never wrap
     * multi-line in this printer, so there is nothing for this option to
     * affect there.
     */
    trailingComma?: boolean;
    /**
     * Whether a single-line object literal gets a space just inside the
     * braces — `{ a, b }` (default `true`, today's behaviour) vs `{a, b}`.
     * Multi-line object literals are unaffected (the brace is already
     * followed/preceded by a newline). Array literals never had inner-bracket
     * spacing and are unaffected by this option. Destructuring patterns
     * already print their object form with no inner spacing today — that
     * pre-existing behaviour is intentionally left untouched here rather than
     * wired to this option, since doing so would change patterns' default
     * output the moment this option's own default (`true`) took effect.
     */
    objectCurlySpacing?: boolean;
}
export interface FormatResult {
    /** Canonical source. Equal to the input when parse errors occur. */
    formatted: string;
    /** Parse errors raised while reading the input — formatting is a no-op when non-empty. */
    errors: ParseError[];
}
export declare function formatProgram(source: string, options?: FormatOptions): FormatResult;
/**
 * Re-emit a parsed `Program` as canonical Aktion source. Exported so the
 * module linker can serialise a merged (multi-file → single) program back to
 * text for `mountCompiled`'s round-trip fields (reconnect re-parse, snapshots).
 */
export declare function printProgram(program: Program, options?: FormatOptions): string;
