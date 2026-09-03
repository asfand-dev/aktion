import { ParseError, Program } from '../parser/types.js';
export interface FormatResult {
    /** Canonical source. Equal to the input when parse errors occur. */
    formatted: string;
    /** Parse errors raised while reading the input — formatting is a no-op when non-empty. */
    errors: ParseError[];
}
export declare function formatProgram(source: string): FormatResult;
/**
 * Re-emit a parsed `Program` as canonical Aktion source. Exported so the
 * module linker can serialise a merged (multi-file → single) program back to
 * text for `mountCompiled`'s round-trip fields (reconnect re-parse, snapshots).
 */
export declare function printProgram(program: Program): string;
