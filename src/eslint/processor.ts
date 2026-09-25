import type { Linter } from "eslint";
import { findBareExportInsertions } from "./scan.js";
import {
  applyInsertions,
  computeLineStarts,
  lineColumnToOffset,
  offsetToLineColumn,
  rangeOverlapsInsertion,
  toOriginalOffset,
  type Insertion,
} from "./remap.js";

const INSERTED_TEXT = "const ";

type FileState = {
  insertions: Insertion[];
  originalLineStarts: number[];
  transformedLineStarts: number[];
};

/**
 * Per-file bridge between `preprocess` and `postprocess`. ESLint always
 * calls `postprocess` for a given filename immediately after `preprocess`
 * within the same synchronous lint pass (this is the documented processor
 * contract — see https://eslint.org/docs/latest/extend/plugins#processors-in-plugins),
 * so keying scratch state by filename and clearing it in `postprocess` is
 * the standard pattern real processors (e.g. `eslint-plugin-markdown`) use.
 * A single-process CLI lint run lints files sequentially, so there is no
 * concurrent-access hazard in practice; a hypothetical worker-pool ESLint
 * invocation would need a different sharing mechanism, out of scope here.
 */
const fileStates = new Map<string, FileState>();

function remapPosition(
  state: FileState,
  line: number,
  column: number,
): { line: number; column: number } {
  const transformedOffset = lineColumnToOffset(state.transformedLineStarts, line, column);
  const originalOffset = toOriginalOffset(state.insertions, transformedOffset);
  return offsetToLineColumn(state.originalLineStarts, originalOffset);
}

/**
 * Remaps one lint message's position (and, when safe, its autofix) from the
 * TRANSFORMED file's coordinates back to the ORIGINAL file's coordinates.
 *
 * `message.fix` is destructured out separately rather than spread through
 * via `...message` — a fix is only ever carried over onto `remapped` when it
 * passes the overlap check below, so the spread must never be allowed to
 * silently reattach the original (transformed-coordinate, potentially
 * injection-tainted) fix object.
 */
function remapMessage(state: FileState, message: Linter.LintMessage): Linter.LintMessage {
  const { fix, ...rest } = message;
  const start = remapPosition(state, message.line, message.column);
  const remapped: Linter.LintMessage = {
    ...rest,
    line: start.line,
    column: start.column,
  };

  if (message.endLine !== undefined && message.endColumn !== undefined) {
    const end = remapPosition(state, message.endLine, message.endColumn);
    remapped.endLine = end.line;
    remapped.endColumn = end.column;
  }

  if (fix) {
    const [fixStart, fixEnd] = fix.range;

    // A fix whose transformed-world range overlaps one of this processor's
    // own injected `const ` spans can never be trusted: the rule's
    // replacement `text` was generated against the TRANSFORMED source (the
    // one containing the injection), so it may itself have baked the
    // injected keyword into its replacement text — and there is no general
    // way to detect or strip that back out of arbitrary rule-generated
    // text (see `rangeOverlapsInsertion`'s own doc comment). Dropping the
    // fix here downgrades the message to a plain (non-autofixed) lint
    // diagnostic rather than risking corrupting the real `.aktion` file.
    if (!rangeOverlapsInsertion(state.insertions, fixStart, fixEnd)) {
      remapped.fix = {
        range: [
          toOriginalOffset(state.insertions, fixStart),
          toOriginalOffset(state.insertions, fixEnd),
        ],
        text: fix.text,
      };
    }
  }

  return remapped;
}

/**
 * ESLint processor letting a consumer's own ESLint installation lint (and
 * autofix) `.aktion` DSL files using a real JS/TS parser and their own rule
 * set — not a bespoke reimplementation of any rule.
 *
 * `.aktion` files are JS/TS-compatible syntax EXCEPT for one construct: a
 * bare top-level `export IDENTIFIER = …` with no declaration keyword (see
 * `scan.ts`'s header for the full grammar cross-check). `preprocess` rewrites
 * every such occurrence to `export const IDENTIFIER = …` — genuinely valid
 * JS/TS — and hands the transformed text to whatever parser the consumer has
 * configured for the virtual `.ts` block (see this module's own README
 * section / `rules.ts` for the recommended wiring). `postprocess` then remaps
 * every reported message's position, and any autofix's `fix.range`, back to
 * the ORIGINAL file's coordinates via `remap.ts` — getting this wrong would
 * mean `--fix` silently corrupts the real `.aktion` file at the wrong byte
 * offset, which is why `remap.ts` has its own dedicated, ESLint-independent
 * unit tests. A fix whose range overlaps the processor's own injected text is
 * dropped entirely rather than remapped — see `remapMessage` and
 * `rangeOverlapsInsertion`.
 */
export const aktionProcessor: Linter.Processor = {
  meta: {
    name: "aktion-runtime/eslint",
    version: "0.1.0",
  },
  supportsAutofix: true,
  preprocess(text: string, filename: string): Linter.ProcessorFile[] {
    const insertions: Insertion[] = findBareExportInsertions(text).map(({ originalOffset }) => ({
      originalOffset,
      insertedLength: INSERTED_TEXT.length,
    }));
    const transformedText = applyInsertions(text, insertions, INSERTED_TEXT);

    fileStates.set(filename, {
      insertions,
      originalLineStarts: computeLineStarts(text),
      transformedLineStarts: computeLineStarts(transformedText),
    });

    // A SHORT synthetic `.ts` virtual filename — NOT the original path
    // echoed back with `.ts` appended. ESLint's `ProcessorService`
    // constructs the actual on-disk-looking virtual path itself, via
    // `path.join(file.path, `${i}_${block.filename}`)` (see
    // `eslint/lib/services/processor-service.js`), so returning the full
    // original path here would double it up — e.g. for a real file
    // `src/app.aktion` linted via a real absolute path, that produces a
    // virtual path whose FINAL segment is `.../src/app.aktion.ts` with
    // parent directory `src`, not `app.aktion`, which silently fails to
    // match any `**/*.aktion/*.ts` config block. A short name like
    // `eslint-aktion.ts` keeps the constructed virtual path exactly
    // `<original file path>/0_eslint-aktion.ts` — its parent segment is
    // always the ORIGINAL filename (e.g. `app.aktion`), matching
    // `**/*.aktion/*.ts` reliably regardless of whether the original
    // filename ESLint passes in is relative or absolute.
    return [{ text: transformedText, filename: "eslint-aktion.ts" }];
  },
  postprocess(messagesPerBlock: Linter.LintMessage[][], filename: string): Linter.LintMessage[] {
    const state = fileStates.get(filename);
    fileStates.delete(filename);

    const messages = messagesPerBlock.flat();
    if (!state) {
      // Preprocess was never invoked for this filename — nothing to remap
      // against. Shouldn't happen in a normal ESLint run; degrade to
      // passing messages through unchanged rather than throwing.
      return messages;
    }

    return messages.map(message => remapMessage(state, message));
  },
};
