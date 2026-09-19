import { ParseError, Program } from '../parser/types.js';
/**
 * Configures the printer's indentation. Every default matches today's
 * hard-coded behaviour (2-space indents), so calling `formatProgram`/
 * `printProgram` with no options is BIT-FOR-BIT IDENTICAL to the pre-existing
 * output — this is load-bearing: the printer is a published surface with
 * real consumers depending on that exact shape.
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
