/**
 * Pure position-remapping logic for the Aktion ESLint processor, kept
 * entirely independent of ESLint's own types/runtime so it can be unit
 * tested in isolation with synthetic inputs before ever touching a real
 * `Linter` run.
 *
 * The processor only ever performs simple TEXT INSERTIONS (never deletions or
 * replacements) at known offsets in the ORIGINAL source — see `scan.ts` and
 * `processor.ts`. That constraint is what makes the remap tractable: an
 * offset in the transformed (post-insertion) text maps back to the original
 * by walking the ordered insertion list and subtracting the length of every
 * insertion that lies entirely before it.
 */
export type Insertion = {
    /**
     * Offset in the ORIGINAL text where the insertion is spliced in.
     */
    originalOffset: number;
    /**
     * Length, in characters, of the text that was inserted there.
     */
    insertedLength: number;
};
/**
 * Applies `insertions` (must be pre-sorted ascending by `originalOffset`) to
 * `source`, splicing `insertedText` in at each `originalOffset`.
 */
export declare function applyInsertions(source: string, insertions: readonly Insertion[], insertedText: string): string;
/**
 * Maps a single offset in the TRANSFORMED text back to the equivalent offset
 * in the ORIGINAL text, given the same ordered `insertions` list that
 * produced the transformed text via `applyInsertions`.
 *
 * A transformed offset that falls INSIDE an inserted span (i.e. points at
 * the literal injected text itself, not anything from the original source)
 * has no real original-text counterpart — it is clamped to the insertion
 * point. This should be rare in practice (nothing sane flags the literal
 * keyword `const` this processor injects) but must degrade safely rather
 * than produce a nonsensical offset.
 */
export declare function toOriginalOffset(insertions: readonly Insertion[], transformedOffset: number): number;
/**
 * True when the transformed-world half-open range `[transformedStart,
 * transformedEnd)` overlaps ANY of the processor's own injected spans (the
 * literal `const ` text spliced in by `applyInsertions`).
 *
 * A fix whose range overlaps an injected span can never be trusted: an
 * autofix rule's replacement `text` is generated from the TRANSFORMED source
 * (the one containing the injected keyword), so a range that touches the
 * injection may itself have baked that injected text into its replacement —
 * and there is no general way to detect or strip that back out of arbitrary
 * rule-generated text. The caller (`processor.ts`'s `remapMessage`) uses this
 * to decide whether a fix is safe to remap at all, or must be dropped and the
 * diagnostic left as a non-autofixed lint error instead.
 */
export declare function rangeOverlapsInsertion(insertions: readonly Insertion[], transformedStart: number, transformedEnd: number): boolean;
/**
 * Offsets (in characters from the start of `text`) where each line begins.
 * `lineStarts[0]` is always `0` (line 1 starts at offset 0). Used to convert
 * between ESLint's 1-based line/column messages and flat character offsets.
 */
export declare function computeLineStarts(text: string): number[];
/**
 * Converts a 1-based ESLint `{line, column}` position to a flat offset.
 */
export declare function lineColumnToOffset(lineStarts: readonly number[], line: number, column: number): number;
/**
 * Converts a flat offset back to a 1-based ESLint `{line, column}` position.
 */
export declare function offsetToLineColumn(lineStarts: readonly number[], offset: number): {
    line: number;
    column: number;
};
