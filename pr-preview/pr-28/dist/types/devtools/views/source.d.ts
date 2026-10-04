import { ViewDefinition } from '../context.js';
export interface DiffLine {
    kind: "same" | "add" | "del";
    text: string;
    /** 1-based line in the old text (for `same` / `del`). */
    oldLine?: number;
    /** 1-based line in the new text (for `same` / `add`). */
    newLine?: number;
}
/**
 * Line diff: common prefix and suffix are trimmed first (edits are local, so
 * this usually leaves a handful of lines), then an LCS over the middle. The
 * middle is capped so a pasted-over program degrades to "all removed, all
 * added" instead of allocating a quadratic table.
 */
export declare function lineDiff(before: string, after: string, cap?: number): DiffLine[];
export declare function diffStats(diff: ReadonlyArray<DiffLine>): {
    added: number;
    removed: number;
};
/** Collapse long runs of unchanged lines to `context` lines around each change. */
export declare function foldDiff(diff: ReadonlyArray<DiffLine>, context?: number): Array<DiffLine | {
    kind: "fold";
    count: number;
}>;
export declare const sourceView: ViewDefinition;
