import { Program, DestructuringPattern } from './types.js';
/** Options for {@link parse}. */
export interface ParseOptions {
    /**
     * `source` is a prefix of a response that is still being generated, so a
     * string or template literal left open at the very end is not yet an error.
     * See {@link TokenizeOptions.streaming}.
     */
    streaming?: boolean;
    /**
     * Offsets of `\n` characters in `source` that do not end a line for the
     * grammar: no statement ends there, but positions after them stay exact.
     * See {@link TokenizeOptions.softNewlines}. The TypeScript frontend passes
     * the line breaks left inside erased multi-line type annotations, so
     * `const x = foo<⏎ Bar⏎>(1)` (erased to `foo` + blank lines + `(1)`) stays
     * one call instead of becoming two statements.
     */
    softNewlines?: ReadonlySet<number>;
    /**
     * Read a `{` at the start of a statement that is not an object literal as a
     * statement block — an `ExpressionStatement` whose expression is a `Block` —
     * instead of failing inside the object-literal grammar. For the
     * `.aktion.js` / `.aktion.ts` frontends, which reject block statements
     * (E113) at the `{` with one diagnostic; `.aktion` keeps reading every
     * statement-position `{` as an object literal.
     */
    statementBlocks?: boolean;
    /**
     * Parse `this` as an ordinary identifier instead of reporting it. `.aktion`
     * has no `this`, so by default it is a parse error at the word. The
     * `.aktion.js` / `.aktion.ts` frontends set this because their checker
     * already reports it as E103. A module with any parse error gets only the
     * parse errors (the semantic checks need a complete tree), so a parse error
     * for `this` would also hide every other diagnostic in that module.
     */
    allowThis?: boolean;
}
export declare function parse(source: string, options?: ParseOptions): Program;
/**
 * Flatten every variable name a destructuring pattern introduces, descending
 * into nested patterns. Shared by the linker (scope collection) and the
 * language service (shadowing checks) so both see the same set of names.
 */
export declare function collectPatternNames(pattern: DestructuringPattern): string[];
