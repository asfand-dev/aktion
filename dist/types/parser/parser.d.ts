import { Program, DestructuringPattern } from './types.js';
/** Options for {@link parse}. */
export interface ParseOptions {
    /**
     * `source` is a prefix of a response that is still being generated, so a
     * string or template literal left open at the very end is not yet an error.
     * See {@link TokenizeOptions.streaming}.
     */
    streaming?: boolean;
}
export declare function parse(source: string, options?: ParseOptions): Program;
/**
 * Flatten every variable name a destructuring pattern introduces, descending
 * into nested patterns. Shared by the linker (scope collection) and the
 * language service (shadowing checks) so both see the same set of names.
 */
export declare function collectPatternNames(pattern: DestructuringPattern): string[];
