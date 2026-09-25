import { describe, expect, it } from "vitest";
import {
  applyInsertions,
  computeLineStarts,
  lineColumnToOffset,
  offsetToLineColumn,
  rangeOverlapsInsertion,
  toOriginalOffset,
  type Insertion,
} from "../src/eslint/remap.js";

describe("applyInsertions", () => {
  it("returns the source unchanged when there are no insertions", () => {
    expect(applyInsertions("hello world", [], "const ")).toBe("hello world");
  });

  it("splices text in at a single offset", () => {
    const source = 'export ENDPOINT = "x"';
    const insertions: Insertion[] = [{ originalOffset: "export ".length, insertedLength: 6 }];
    expect(applyInsertions(source, insertions, "const ")).toBe('export const ENDPOINT = "x"');
  });

  it("splices text in at multiple offsets, left to right", () => {
    const source = "export A = 1\nexport B = 2\n";
    const insertions: Insertion[] = [
      { originalOffset: "export ".length, insertedLength: 6 },
      { originalOffset: source.indexOf("B"), insertedLength: 6 },
    ];
    expect(applyInsertions(source, insertions, "const ")).toBe("export const A = 1\nexport const B = 2\n");
  });
});

describe("toOriginalOffset", () => {
  it("returns the same offset unchanged when there are no insertions", () => {
    expect(toOriginalOffset([], 42)).toBe(42);
  });

  it("leaves an offset before the first insertion untouched", () => {
    const insertions: Insertion[] = [{ originalOffset: 20, insertedLength: 6 }];
    expect(toOriginalOffset(insertions, 5)).toBe(5);
  });

  it("subtracts the inserted length for an offset after a single insertion", () => {
    // Original: "export ENDPOINT = 1" (offset 7 = start of ENDPOINT)
    // Transformed: "export const ENDPOINT = 1" (inserted "const " = 6 chars at 7)
    // "ENDPOINT" now starts at transformed offset 13; should map back to 7.
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    expect(toOriginalOffset(insertions, 13)).toBe(7);
  });

  it("accumulates subtraction across multiple insertions that all precede the offset", () => {
    const insertions: Insertion[] = [
      { originalOffset: 7, insertedLength: 6 },
      { originalOffset: 20, insertedLength: 6 },
    ];
    // A transformed offset after BOTH insertions should have both lengths
    // subtracted.
    expect(toOriginalOffset(insertions, 40)).toBe(40 - 12);
  });

  it("only subtracts insertions strictly before the offset, not ones after it", () => {
    const insertions: Insertion[] = [
      { originalOffset: 7, insertedLength: 6 },
      { originalOffset: 100, insertedLength: 6 }, // Far after the probed offset
    ];
    expect(toOriginalOffset(insertions, 13)).toBe(7);
  });

  it("clamps an offset that falls INSIDE an inserted span to the insertion point", () => {
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // Transformed offsets 7..12 inclusive-exclusive are the injected "const "
    // text itself — every one of them should clamp to 7.
    expect(toOriginalOffset(insertions, 7)).toBe(7);
    expect(toOriginalOffset(insertions, 10)).toBe(7);
    expect(toOriginalOffset(insertions, 12)).toBe(7);
  });

  it("is exact at the boundary immediately after an inserted span", () => {
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // Transformed offset 13 is the first character AFTER the injected text
    // (the "E" of "ENDPOINT") — maps back to original offset 7.
    expect(toOriginalOffset(insertions, 13)).toBe(7);
    // One further along ("N" of "ENDPOINT") maps back to original offset 8.
    expect(toOriginalOffset(insertions, 14)).toBe(8);
  });

  it("round-trips through applyInsertions for every offset in a multi-insertion document", () => {
    const source = [
      "export A = 1",
      "export $store = {}",
      "const already = 2",
      "export ZZZ = 3",
    ].join("\n");

    const scanForExportAssignments = (text: string): number[] => {
      const offsets: number[] = [];
      const re = /export ([$A-Z_a-z][\w$]*) =/gu;

      for (let match = re.exec(text); match !== null; match = re.exec(text)) {
        if (match[1] !== "already") {
          offsets.push(match.index + "export ".length);
        }
      }

      return offsets;
    };

    const insertions: Insertion[] = scanForExportAssignments(source).map(originalOffset => ({
      originalOffset,
      insertedLength: 6,
    }));

    const transformed = applyInsertions(source, insertions, "const ");

    // For every character in the ORIGINAL source, find its offset in the
    // transformed text (by construction) and confirm toOriginalOffset
    // recovers the original offset exactly.
    let originalCursor = 0;
    let transformedCursor = 0;
    let insertionIndex = 0;
    while (originalCursor < source.length) {
      if (
        insertionIndex < insertions.length
        && insertions[insertionIndex].originalOffset === originalCursor
      ) {
        transformedCursor += insertions[insertionIndex].insertedLength;
        insertionIndex += 1;
      }

      expect(toOriginalOffset(insertions, transformedCursor)).toBe(originalCursor);
      expect(transformed[transformedCursor]).toBe(source[originalCursor]);
      originalCursor += 1;
      transformedCursor += 1;
    }
  });
});

describe("rangeOverlapsInsertion", () => {
  it("returns false when there are no insertions at all", () => {
    expect(rangeOverlapsInsertion([], 0, 10)).toBe(false);
  });

  it("returns false for a range that does not touch any insertion", () => {
    // Original: "export ENDPOINT = 1" (insertion at offset 7, length 6)
    // Transformed: "export const ENDPOINT = 1" -- injected span is [7, 13)
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // A range entirely before the injected span.
    expect(rangeOverlapsInsertion(insertions, 0, 7)).toBe(false);
    // A range entirely after the injected span.
    expect(rangeOverlapsInsertion(insertions, 13, 20)).toBe(false);
  });

  it("returns true for a range fully inside an insertion", () => {
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // [8, 12) sits entirely within the injected span [7, 13).
    expect(rangeOverlapsInsertion(insertions, 8, 12)).toBe(true);
  });

  it("returns true for a range straddling the LEADING boundary of an insertion", () => {
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // [5, 9) starts before the injected span [7, 13) but overlaps it.
    expect(rangeOverlapsInsertion(insertions, 5, 9)).toBe(true);
  });

  it("returns true for a range straddling the TRAILING boundary of an insertion", () => {
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // [10, 20) starts inside the injected span [7, 13) and extends past it.
    expect(rangeOverlapsInsertion(insertions, 10, 20)).toBe(true);
  });

  it("returns true when a range fully CONTAINS an insertion", () => {
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // [0, 20) fully contains the injected span [7, 13).
    expect(rangeOverlapsInsertion(insertions, 0, 20)).toBe(true);
  });

  it("is exact at the boundary immediately adjacent to an insertion (no overlap)", () => {
    const insertions: Insertion[] = [{ originalOffset: 7, insertedLength: 6 }];
    // A half-open range ending exactly at the injected span's start does not overlap.
    expect(rangeOverlapsInsertion(insertions, 0, 7)).toBe(false);
    // A half-open range starting exactly at the injected span's end does not overlap.
    expect(rangeOverlapsInsertion(insertions, 13, 13)).toBe(false);
  });

  it("checks every insertion when there are multiple, not just the first", () => {
    const insertions: Insertion[] = [
      { originalOffset: 7, insertedLength: 6 },
      { originalOffset: 30, insertedLength: 6 },
    ];
    // Overlaps only the SECOND insertion's transformed span.
    // First insertion transformed span: [7, 13). Second: originalOffset 30 +
    // cumulativeInserted 6 = [36, 42).
    expect(rangeOverlapsInsertion(insertions, 38, 40)).toBe(true);
    // Doesn't overlap either.
    expect(rangeOverlapsInsertion(insertions, 20, 25)).toBe(false);
  });
});

describe("computeLineStarts / offsetToLineColumn / lineColumnToOffset", () => {
  it("treats a single-line string as starting at offset 0", () => {
    expect(computeLineStarts("hello")).toEqual([0]);
  });

  it("records the offset immediately after each newline", () => {
    const text = "ab\ncd\nef";
    // Line 1 "ab\n" (offsets 0-2), line 2 "cd\n" (offsets 3-5), line 3 "ef" (offset 6-7)
    expect(computeLineStarts(text)).toEqual([0, 3, 6]);
  });

  it("converts offset 0 to line 1, column 1", () => {
    const lineStarts = computeLineStarts("ab\ncd");
    expect(offsetToLineColumn(lineStarts, 0)).toEqual({ line: 1, column: 1 });
  });

  it("converts an offset on a later line correctly", () => {
    const text = "ab\ncd\nef";
    const lineStarts = computeLineStarts(text);
    // Offset 3 is 'c' -> line 2, column 1
    expect(offsetToLineColumn(lineStarts, 3)).toEqual({ line: 2, column: 1 });
    // Offset 4 is 'd' -> line 2, column 2
    expect(offsetToLineColumn(lineStarts, 4)).toEqual({ line: 2, column: 2 });
    // Offset 6 is 'e' -> line 3, column 1
    expect(offsetToLineColumn(lineStarts, 6)).toEqual({ line: 3, column: 1 });
  });

  it("is the exact inverse of lineColumnToOffset for every offset in a multi-line document", () => {
    const text = "line one\nline two\nline three\n";
    const lineStarts = computeLineStarts(text);
    for (let offset = 0; offset < text.length; offset += 1) {
      const { line, column } = offsetToLineColumn(lineStarts, offset);
      expect(lineColumnToOffset(lineStarts, line, column)).toBe(offset);
    }
  });
});
