import { ParseError, Program, Statement } from './types.js';
export interface FrontierResult {
    /**
     * Longest prefix of `source` (line-aligned) where every statement
     * parsed without errors. Always ends on a newline boundary, or equals
     * the empty string when no committed prefix exists yet.
     */
    committedSource: string;
    /** Tail of `source` past the committed prefix — the "in-flight" lines. */
    draftingSource: string;
    /**
     * Names declared inside the committed prefix. Top-level identifiers
     * only — block-local bindings (component params, $state inside a
     * component body) are not included.
     */
    committedBindings: ReadonlyArray<string>;
    /**
     * The set `U` (SCC-2): top-level names that appear inside the drafting
     * tail but have not yet committed. Includes:
     *
     *   - Identifiers on the left of an assignment (`foo = …`).
   *   - State assignments (`$x = …`).
   *   - Function / effect declarations.
     *
     * Names that only appear as call expressions (`Button(…)`) inside the
     * drafting tail are not listed — those are dependencies, not bindings.
     */
    uncommittedBindings: ReadonlyArray<string>;
    /**
     * Statements that parsed cleanly in the committed prefix. Hosts can
     * walk this list to enumerate the committed surface (components,
     * effects, actions, endpoints, router declarations) without having to
     * re-parse.
     */
    committedStatements: ReadonlyArray<Statement>;
    /** Errors reported by the parser. Empty when the whole input parses cleanly. */
    errors: ReadonlyArray<ParseError>;
}
/**
 * Compute the streaming frontier for `source`. Cheap — runs a single
 * `parse(source)` pass and walks the resulting statements once.
 *
 * Example:
 *
 *   const f = computeFrontier(
 *     "$state count = 0\n" +
 *     "function Counter() {\n" +
 *     "  Stack(Te"               // mid-stream: half-written `Text`
 *   );
 *   // f.committedBindings = ["count"]
 *   // f.uncommittedBindings = ["Counter"]
 *   // f.committedSource ends just before "function Counter() {…"
 */
export declare function computeFrontier(source: string): FrontierResult;
/**
 * Build a frontier result from an already-parsed program. Exposed so
 * hosts that already call `parse(...)` once don't have to repeat the
 * work.
 */
export declare function buildFrontier(source: string, program: Program): FrontierResult;
/**
 * SCC-3 helper: returns `true` when every name in `deps` lives in the
 * committed prefix (so a side effect depending on them is safe to fire).
 */
export declare function isQuiescent(frontier: FrontierResult, deps: ReadonlyArray<string>): boolean;
