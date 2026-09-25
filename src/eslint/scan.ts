/**
 * Tokenizer-aware scan for the ONE Aktion construct that is not already valid
 * JS/TS syntax: a bare top-level `export IDENTIFIER = …` (or `export $name =
 * …`) with no declaration keyword.
 *
 * Verified two ways:
 *
 * - **Against the grammar itself.** `parseExportStatement`/`couldStartAssignment`
 *   in `src/parser/parser.ts` accept exactly four export shapes: `export
 *   function …`, `export async function …`, `export let/const/var …` (all
 *   already valid JS/TS) and a bare `export <Identifier|$Identifier> = <expr>`
 *   assignment (the one this module rewrites). `export { … }` lists and
 *   `export <destructure>` are explicit parse errors in the grammar
 *   (`parseExportStatement` throws on both), so no valid `.aktion` file can
 *   contain them.
 * - **Empirically, against this repo's own real `.aktion` corpus** (every
 *   file under `docs/demos/`, `create-aktion/template/`, and any other
 *   in-tree `.aktion` file — see `tests/eslint-corpus-sweep.test.ts`, which
 *   mirrors `tests/formatter-idempotency-sweep.test.ts`'s own collection
 *   pattern): running the full preprocess → lint → `--fix` → postprocess
 *   pipeline and re-parsing every fixed output via this package's own
 *   `parse()` confirms the pipeline never corrupts a real file. Re-run the
 *   sweep yourself before trusting a specific pass rate — file count and
 *   pass rate both drift as example programs are added.
 *
 * This module only finds the exact insertion points; it does not rewrite the
 * text itself (see `processor.ts`) and does not remap positions back (see
 * `remap.ts`).
 *
 * Design deliberately mirrors `src/tooling/formatter.ts`'s own tokenizer
 * discipline — quotes, template literals, and comments are all skipped the
 * same way a real lexer would, so `export` (or a lookalike sequence)
 * appearing inside a string, a template literal's inert text, or a
 * `//`/`/* *\/` comment is never mistaken for the keyword. Unlike a full
 * tokenizer, this one is targeted: it looks specifically for the `export`
 * keyword and, only when found, classifies what immediately follows it.
 *
 * Known, deliberate scope limit: this scan does not track brace depth to
 * confirm a match is at true top level (module scope) — the task's own
 * definition of "top-level" is purely textual ("`export ` immediately
 * followed by …"), and the runtime's own parser routes `export` through the
 * same `parseStatement` dispatch used for nested blocks, so a hypothetical
 * `export NAME = …` nested inside a function/if/for body would also match
 * here. In practice no real Aktion program does this (export exists to
 * publish a MODULE's public bindings), and even if the assumption is ever
 * wrong, the failure mode is contained: real ES modules do not allow `export`
 * inside a nested scope, so the rewritten text would fail to parse under
 * `@typescript-eslint/parser` (or whatever real JS/TS parser the consumer
 * wires in) — the file just stays unlintable, exactly the pre-existing
 * status quo, never silently corrupted.
 */

export type ExportInsertion = {
  /**
   * Offset in the ORIGINAL source where `const ` must be inserted — the
   * position immediately before the identifier that follows `export` (and
   * any whitespace between them). Inserting there yields
   * `export <ws>const <identifier> = …`, which is valid JS/TS regardless of
   * how much whitespace originally separated `export` from the identifier.
   */
  originalOffset: number;
};

const IDENTIFIER_START = /[$A-Z_a-z]/u;
const IDENTIFIER_CHAR = /[\w$]/u;
const WHITESPACE_CHAR = /\s/u;

/**
 * Reads one identifier-shaped word starting at `index` (assumes
 * `IDENTIFIER_START` already matched there). Returns the word text and the
 * offset immediately after it.
 */
function readIdentifierWord(source: string, index: number): { word: string; end: number } {
  let end = index;
  while (end < source.length && IDENTIFIER_CHAR.test(source[end] ?? "")) {
    end += 1;
  }

  return { word: source.slice(index, end), end };
}

function skipWhitespace(source: string, index: number): number {
  let cursor = index;
  while (cursor < source.length && WHITESPACE_CHAR.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  return cursor;
}

/**
 * Given the offset immediately after a confirmed `export` keyword token
 * (i.e. bounded on both sides so it can't be part of a longer identifier —
 * see `findBareExportInsertions`'s main loop), decides whether this is the
 * bare-assignment shape that needs rewriting, and if so returns the
 * insertion point.
 *
 * KNOWN LIMITATION: only `skipWhitespace` is called here, not a comment
 * skip — a C-style block comment placed between the `export` keyword and the
 * identifier (e.g. `export`, a comment, then `NAME = 1`) is legal Aktion but
 * is not recognised as the bare-assignment shape, so zero insertions happen
 * for it and the file is simply left unlintable (not corrupted — the
 * pre-existing status quo). Measured: zero occurrences of this shape
 * anywhere in this repo's real `.aktion` corpus as of this writing —
 * re-measure before assuming this is still negligible if the corpus grows.
 */
function classifyExportTail(source: string, afterExportKeyword: number): number | undefined {
  const afterLeadingWhitespace = skipWhitespace(source, afterExportKeyword);
  const nextChar = source[afterLeadingWhitespace];
  if (nextChar === undefined || !IDENTIFIER_START.test(nextChar)) {
    // `export {`, `export *`, `export =` (no identifier at all), or end of
    // file — none of these are the bare-assignment shape.
    return undefined;
  }

  // The word following `export` is read but its identity is never checked
  // against a keyword list (`function`, `const`, `let`, …): an
  // already-valid export form is always followed by MORE THAN JUST
  // whitespace-then-`=` (a function name and `(`, a binding name and `=`
  // preceded by the DECLARATION's own identifier, etc.) — the check below,
  // requiring the word be immediately (modulo whitespace) followed by a
  // bare `=`, already rejects every one of those shapes on its own.
  const { end: afterWord } = readIdentifierWord(source, afterLeadingWhitespace);
  const afterWordWhitespace = skipWhitespace(source, afterWord);
  if (source[afterWordWhitespace] !== "=") {
    // Not immediately followed by `=` — not an assignment (could be
    // `export default`-shaped prose, or simply invalid Aktion syntax this
    // scan has no business rewriting).
    return undefined;
  }

  // Exclude `==` (equality) and `=>` (arrow) — couldStartAssignment in the
  // runtime's own parser only recognises a BARE `=`.
  const afterEquals = source[afterWordWhitespace + 1];
  if (afterEquals === "=" || afterEquals === ">") {
    return undefined;
  }

  return afterLeadingWhitespace;
}

/**
 * Scans `source` for every bare `export IDENTIFIER = …` occurrence and
 * returns the ordered (ascending) list of insertion points where `const `
 * must be spliced in.
 */
export function findBareExportInsertions(source: string): ExportInsertion[] {
  const insertions: ExportInsertion[] = [];

  const skipQuoted = (start: number, quote: string): number => {
    let index = start + 1;
    while (index < source.length && source[index] !== quote) {
      index += source[index] === "\\" ? 2 : 1;
    }

    return index + 1;
  };

  // Skips a plain quoted string or a backtick template literal starting at
  // `index` (a `${…}` interpolation inside the template recurses through
  // `scanCode` itself). Returns `undefined` when `char` isn't the start of
  // either, so the caller can tell "not this kind of span" apart from "this
  // span happened to be zero-length".
  //
  // KNOWN LIMITATION: this scanner has NO concept of a regex literal as its
  // own kind of span — `scanCode`'s main loop only ever recognises strings,
  // templates, and comments via this function and `trySkipComment`. A regex
  // literal containing a quote character INSIDE its character class (e.g. a
  // pattern matching either a single or double quote) would make this
  // function treat that quote as the START of a real string literal, and
  // `skipQuoted` would then scan forward looking for a matching close quote
  // — potentially consuming the rest of the file if none appears, or
  // resynchronising at the wrong point if one eventually does, silently
  // dropping or misplacing everything in between. Re-measure against a real
  // corpus before assuming this is still negligible if it grows.
  const trySkipStringLike = (index: number): number | undefined => {
    const char = source[index];
    if (char === "\"" || char === "'") {
      return skipQuoted(index, char);
    }

    if (char === "`") {
      return scanTemplate(index + 1);
    }

    return undefined;
  };

  // Skips a `//` line comment or a `/* */` block comment starting at
  // `index`. Returns `undefined` when `index` isn't a comment start, same
  // "not this kind of span" convention as `trySkipStringLike` above.
  const trySkipComment = (index: number): number | undefined => {
    if (source[index] !== "/") {
      return undefined;
    }

    if (source[index + 1] === "/") {
      // Line comment — skip to (but not past) the newline so the newline
      // itself still participates in normal scanning.
      let cursor = index;
      while (cursor < source.length && source[cursor] !== "\n") {
        cursor += 1;
      }

      return cursor;
    }

    if (source[index + 1] === "*") {
      const closeIndex = source.indexOf("*/", index + 2);
      return closeIndex === -1 ? source.length : closeIndex + 2;
    }

    return undefined;
  };

  // True when `index` is the start of a genuine `export` KEYWORD token —
  // bounded on both sides (not preceded or followed by another identifier
  // character) so "exportedValue" or "obj.exportFoo" is never mistaken for
  // the keyword.
  const isExportKeywordAt = (index: number): boolean => {
    if (source.slice(index, index + 6) !== "export") {
      return false;
    }

    const precedingChar = index === 0 ? undefined : source[index - 1];
    if (precedingChar !== undefined && IDENTIFIER_CHAR.test(precedingChar)) {
      return false;
    }

    const followingChar = source[index + 6];
    return followingChar === undefined || !IDENTIFIER_CHAR.test(followingChar);
  };

  // Scans one code region — the whole file, or one `${…}` interpolation
  // body — recursing into any nested template literal's own
  // interpolations. `stopAtBrace` is true only for an interpolation body,
  // whose end is its own unescaped, depth-0 `}`.
  const scanCode = (start: number, stopAtBrace: boolean): number => {
    let index = start;
    let braceDepth = 0;
    while (index < source.length) {
      const char = source[index];

      if (stopAtBrace && char === "}" && braceDepth === 0) {
        return index + 1;
      }

      if (char === "{" || char === "}") {
        braceDepth += char === "{" ? 1 : -1;
        index += 1;
        continue;
      }

      const skippedStringLike = trySkipStringLike(index);
      if (skippedStringLike !== undefined) {
        index = skippedStringLike;
        continue;
      }

      const skippedComment = trySkipComment(index);
      if (skippedComment !== undefined) {
        index = skippedComment;
        continue;
      }

      if (char === "e" && isExportKeywordAt(index)) {
        const insertionOffset = classifyExportTail(source, index + 6);
        if (insertionOffset !== undefined) {
          insertions.push({ originalOffset: insertionOffset });
        }

        index += 6;
        continue;
      }

      index += 1;
    }

    return index;
  };

  // Scans a template literal's body, starting right after the opening
  // backtick. Real code only exists inside `${…}` interpolations — the
  // literal text between them is inert and skipped opaquely, same as a
  // plain quoted string.
  const scanTemplate = (start: number): number => {
    let index = start;
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        index += 2;
        continue;
      }

      if (char === "`") {
        return index + 1;
      }

      if (char === "$" && source[index + 1] === "{") {
        index = scanCode(index + 2, true);
        continue;
      }

      index += 1;
    }

    return index;
  };

  scanCode(0, false);
  return insertions;
}
