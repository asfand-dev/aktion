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
export function applyInsertions(source: string, insertions: readonly Insertion[], insertedText: string): string {
  let result = "";
  let cursor = 0;
  for (const insertion of insertions) {
    result += source.slice(cursor, insertion.originalOffset) + insertedText;
    cursor = insertion.originalOffset;
  }

  result += source.slice(cursor);
  return result;
}

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
export function toOriginalOffset(insertions: readonly Insertion[], transformedOffset: number): number {
  let cumulativeInserted = 0;

  for (const insertion of insertions) {
    const transformedInsertionStart = insertion.originalOffset + cumulativeInserted;
    if (transformedOffset < transformedInsertionStart) {
      break;
    }

    const transformedInsertionEnd = transformedInsertionStart + insertion.insertedLength;
    if (transformedOffset < transformedInsertionEnd) {
      // Inside the injected text itself — clamp to the insertion point.
      return insertion.originalOffset;
    }

    cumulativeInserted += insertion.insertedLength;
  }

  return transformedOffset - cumulativeInserted;
}

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
export function rangeOverlapsInsertion(
  insertions: readonly Insertion[],
  transformedStart: number,
  transformedEnd: number,
): boolean {
  let cumulativeInserted = 0;

  for (const insertion of insertions) {
    const transformedInsertionStart = insertion.originalOffset + cumulativeInserted;
    const transformedInsertionEnd = transformedInsertionStart + insertion.insertedLength;

    if (transformedStart < transformedInsertionEnd && transformedEnd > transformedInsertionStart) {
      return true;
    }

    cumulativeInserted += insertion.insertedLength;
  }

  return false;
}

/**
 * Offsets (in characters from the start of `text`) where each line begins.
 * `lineStarts[0]` is always `0` (line 1 starts at offset 0). Used to convert
 * between ESLint's 1-based line/column messages and flat character offsets.
 */
export function computeLineStarts(text: string): number[] {
  const lineStarts = [0];
  // A classic index-based loop, deliberately NOT `[...text].entries()`:
  // spreading a string iterates by UNICODE CODE POINT, collapsing each
  // surrogate pair into one entry, which would desynchronise `index` from
  // the UTF-16 code-unit offsets `String.prototype` indexing (and every
  // other offset this module computes) actually uses — silently wrong
  // line/column math for any file with an astral-plane character (e.g. an
  // emoji) in a comment.
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
}

/**
 * Converts a 1-based ESLint `{line, column}` position to a flat offset.
 */
export function lineColumnToOffset(lineStarts: readonly number[], line: number, column: number): number {
  const lineStart = lineStarts[line - 1] ?? 0;
  return lineStart + (column - 1);
}

/**
 * Converts a flat offset back to a 1-based ESLint `{line, column}` position.
 */
export function offsetToLineColumn(lineStarts: readonly number[], offset: number): { line: number; column: number } {
  // Binary search for the last lineStart <= offset.
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((lineStarts[mid] ?? 0) <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const line = low + 1;
  const column = offset - (lineStarts[low] ?? 0) + 1;
  return { line, column };
}
