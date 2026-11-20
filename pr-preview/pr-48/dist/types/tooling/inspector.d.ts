import { Program } from '../parser/types.js';
export interface InspectorBinding {
    /** Top-level name (e.g. `root`, `count`, `Header`). */
    name: string;
    /** What kind of declaration introduced this binding. */
    kind: "assignment" | "component" | "effect" | "action" | "hook" | "router";
    /** Source line (1-indexed). */
    line: number;
    /** Source column (1-indexed). */
    column: number;
    /** Brief textual summary (callee name for assignments, endpoint method, …). */
    summary?: string;
}
export interface InspectorView {
    /** Committed prefix that has already parsed cleanly. */
    committed: {
        source: string;
        bindings: InspectorBinding[];
        statementCount: number;
    };
    /** Drafting tail past the committed frontier. */
    drafting: {
        source: string;
        bindings: InspectorBinding[];
        statementCount: number;
        /** SCC-2 — names declared in the drafting tail but not yet committed. */
        inFlightNames: string[];
    };
    /** Parse errors (if any). Empty when the whole input parses cleanly. */
    errors: ReadonlyArray<{
        line: number;
        column: number;
        message: string;
    }>;
    /** Total number of declared bindings across both ASTs. */
    totalBindings: number;
}
/**
 * Inspect `source` and return a JSON-friendly view of the Committed +
 * Drafting ASTs. Cheap — runs a single `parse` pass via
 * `computeFrontier`.
 */
export declare function inspectAST(source: string): InspectorView;
/**
 * Build a view directly from a parsed `Program`. Useful for hosts that
 * have already paid the parse cost and just need the structured
 * projection.
 */
export declare function inspectProgram(source: string, program: Program): InspectorView;
