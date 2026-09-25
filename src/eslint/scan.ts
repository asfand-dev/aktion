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
 * discipline — quotes, template literals, comments, and (as of this pass)
 * regex literals are all skipped the same way `src/parser/lexer.ts`'s real
 * `tokenize()` would, so `export` (or a lookalike sequence) appearing inside
 * a string, a template literal's inert text, a `//`/`/* *\/` comment, or a
 * `/pattern/flags` regex is never mistaken for the keyword or for a phantom
 * string start. Unlike a full tokenizer, this one is targeted: it looks
 * specifically for the `export` keyword and, only when found, classifies
 * what immediately follows it.
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
const DIGIT_CHAR = /\d/u;
const HEX_DIGIT_CHAR = /[\da-f]/iu;

/**
 * Exactly `src/parser/lexer.ts`'s own `KEYWORDS_AKTION` set — used only by
 * `scanCode`'s regex-vs-division disambiguation (see `regexAllowed` there)
 * to classify a scanned identifier word as a reserved KEYWORD (after which a
 * value — and therefore a regex literal — is expected next) versus an
 * ordinary IDENTIFIER (a value in itself, so DIVISION is expected next).
 * Deliberately excludes `true`/`false`/`null`: the real tokenizer gives those
 * their own `Boolean`/`Null` token types, which (like `Identifier`) ARE
 * value-types — `regexAllowedHere` in `lexer.ts` returns `false` for all
 * three, and leaving them out of this set already makes `.has(word)` return
 * `false` for them below, the correct outcome, with no separate check
 * needed.
 */
const RESERVED_KEYWORD_WORDS = new Set([
  "function",
  "import",
  "export",
  "if",
  "else",
  "switch",
  "case",
  "break",
  "continue",
  "for",
  "while",
  "do",
  "of",
  "in",
  "let",
  "var",
  "const",
  "await",
  "async",
  "return",
  "default",
  "try",
  "catch",
  "finally",
  "throw",
  "new",
  "typeof",
  "instanceof",
  "delete",
  "void",
]);

/**
 * Skips a `0x`/`0X`/`0b`/`0B`/`0o`/`0O`-prefixed radix number literal starting
 * at `index` (assumes the prefix already matched there) — hex/binary/octal
 * digits and `_` separators only, mirroring `src/parser/lexer.ts`'s own
 * `tokenize()` radix branch. Split out of `skipNumberLiteral` purely to keep
 * that function's own branching flat.
 */
function skipRadixNumberLiteral(source: string, index: number): number {
  let cursor = index + 2;
  while (cursor < source.length) {
    const next = source[cursor] ?? "";
    if (HEX_DIGIT_CHAR.test(next)) {
      cursor += 1;
      continue;
    }

    if (next === "_" && HEX_DIGIT_CHAR.test(source[cursor + 1] ?? "")) {
      cursor += 1;
      continue;
    }

    break;
  }

  return cursor;
}

/**
 * Attempts to consume an `e`/`E` exponent marker (with an optional `+`/`-`
 * sign) starting at `index`, ONLY when it's immediately followed by a digit
 * (otherwise this isn't a real exponent — e.g. a bare trailing `e` identifier
 * character). Returns the cursor just past the marker/sign on success, or
 * `undefined` when there's no valid exponent here. Split out of
 * `skipDecimalNumberLiteral` purely to keep that function's own branching
 * flat.
 */
function tryConsumeExponentMarker(source: string, index: number): number | undefined {
  const next = source[index] ?? "";
  if (next !== "e" && next !== "E") {
    return undefined;
  }

  const afterE = source[index + 1] ?? "";
  const afterSign = afterE === "+" || afterE === "-" ? (source[index + 2] ?? "") : afterE;
  if (!DIGIT_CHAR.test(afterSign)) {
    return undefined;
  }

  let cursor = index + 1;
  if (source[cursor] === "+" || source[cursor] === "-") {
    cursor += 1;
  }

  return cursor;
}

/**
 * Skips a plain decimal number literal starting at `index` (assumes
 * `DIGIT_CHAR` already matched there, and that `skipNumberLiteral` already
 * ruled out a radix prefix). Mirrors `src/parser/lexer.ts`'s own `tokenize()`
 * decimal branch: a digit run allows a single `.` and a single `e`/`E`
 * exponent (with an optional sign), each only when immediately followed by a
 * digit, via `tryConsumeExponentMarker` above. Split out of
 * `skipNumberLiteral` purely to keep that function's own branching flat.
 */
function skipDecimalNumberLiteral(source: string, index: number): number {
  let cursor = index;
  let sawDot = false;
  let sawExponent = false;
  while (cursor < source.length) {
    const next = source[cursor] ?? "";
    if (DIGIT_CHAR.test(next)) {
      cursor += 1;
      continue;
    }

    if (next === "_" && DIGIT_CHAR.test(source[cursor + 1] ?? "")) {
      cursor += 1;
      continue;
    }

    if (next === "." && !sawDot && !sawExponent && DIGIT_CHAR.test(source[cursor + 1] ?? "")) {
      sawDot = true;
      cursor += 1;
      continue;
    }

    const afterExponent = sawExponent ? undefined : tryConsumeExponentMarker(source, cursor);
    if (afterExponent !== undefined) {
      sawExponent = true;
      cursor = afterExponent;
      continue;
    }

    break;
  }

  return cursor;
}

/**
 * Skips a number literal starting at `index` (assumes `DIGIT_CHAR` already
 * matched there, or a `0x`/`0b`/`0o` radix prefix). This only needs to find
 * where the literal ENDS, not validate or evaluate it — so it deliberately
 * doesn't mirror the real tokenizer's handling of a LEADING `-`/`.` folded
 * into a single signed-number token (`lexer.ts`'s `allowSignedNumber`
 * heuristic): whether `-5` is one "Number" token or an "Operator" token
 * followed by a "Number" token, the last token immediately before whatever
 * follows is a value-type token either way, so the `regexAllowed` state this
 * feeds into ends up identical regardless.
 */
function skipNumberLiteral(source: string, index: number): number {
  const radixMark = source[index + 1];
  if (source[index] === "0" && ["x", "X", "b", "B", "o", "O"].includes(radixMark ?? "")) {
    return skipRadixNumberLiteral(source, index);
  }

  return skipDecimalNumberLiteral(source, index);
}

/**
 * Attempts to skip a regex literal starting at `index` (`source[index]` is
 * assumed to be `/`), through its closing, unescaped `/` and any trailing
 * flag letters. Mirrors `src/parser/lexer.ts`'s own `scanRegexLiteral`
 * exactly: a `\` escapes the following character (even an escaped `/`), and
 * an unescaped `/` inside a `[...]` character class does NOT close the
 * literal — the classic regex-grammar rule that also makes a quote character
 * safely inert when it appears inside a character class, since the whole
 * span is skipped atomically by THIS function before `scanCode`'s
 * string-literal check (`trySkipStringLike`) ever gets a chance to misread
 * that quote as the start of a real string.
 *
 * Returns `undefined` (consuming nothing) when the line ends without a
 * closing `/` — real regex literals cannot contain a literal newline — the
 * same "fall back to division" outcome `scanRegexLiteral` produces by
 * restoring its scan position on failure.
 */
function trySkipRegexLiteral(source: string, index: number): number | undefined {
  let cursor = index + 1;
  let inClass = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\n") {
      return undefined;
    }

    if (char === "\\") {
      cursor += 1;
      const escaped = source[cursor];
      if (escaped !== undefined && escaped !== "\n") {
        cursor += 1;
      }

      continue;
    }

    if (char === "[") {
      inClass = true;
      cursor += 1;
      continue;
    }

    if (char === "]") {
      inClass = false;
      cursor += 1;
      continue;
    }

    if (char === "/" && !inClass) {
      cursor += 1;
      while (cursor < source.length && /[a-z]/iu.test(source[cursor] ?? "")) {
        cursor += 1;
      }

      return cursor;
    }

    cursor += 1;
  }

  return undefined;
}

/**
 * A single-character outcome type shared by the two `scanCode` dispatch
 * helpers below (`tryHandleBracketOrBrace`, `handleSlash`): the new
 * `regexAllowed` state after consuming one token, plus whatever else that
 * token needs to update. Extracted purely to keep `scanCode`'s own main loop
 * — already a wide dispatch over many token kinds — under a manageable
 * cyclomatic complexity.
 */
type BracketOutcome = {
  braceDepth: number;
  regexAllowed: boolean;
};

/**
 * Handles the six punctuation characters whose ENTIRE effect on `scanCode`'s
 * state is a `braceDepth`/`regexAllowed` transition with no other token-kind
 * checks needed (`{`, `}`, `(`, `[`, `)`, `]`). Returns `undefined` when
 * `char` isn't one of these, so the caller can fall through to its next
 * check — same "not this kind of span" convention as `trySkipStringLike`/
 * `trySkipComment` elsewhere in this module.
 */
function tryHandleBracketOrBrace(char: string, braceDepth: number): BracketOutcome | undefined {
  if (char === "{" || char === "}") {
    return { braceDepth: braceDepth + (char === "{" ? 1 : -1), regexAllowed: char === "{" };
  }

  if (char === "(" || char === "[") {
    return { braceDepth, regexAllowed: true };
  }

  if (char === ")" || char === "]") {
    return { braceDepth, regexAllowed: false };
  }

  return undefined;
}

type SlashOutcome = {
  index: number;
  regexAllowed: boolean;
};

/**
 * Handles a `/` at `index`: attempts a regex literal (only when a value is
 * expected, i.e. `regexAllowed`), falling back to treating it as an ordinary
 * division operator otherwise (or when no valid regex closing delimiter was
 * found). Extracted out of `scanCode`'s main loop for the same complexity
 * reason as `tryHandleBracketOrBrace` above.
 */
function handleSlash(source: string, index: number, regexAllowed: boolean): SlashOutcome {
  const skippedRegex = regexAllowed ? trySkipRegexLiteral(source, index) : undefined;
  if (skippedRegex !== undefined) {
    return { index: skippedRegex, regexAllowed: false };
  }

  // Not a regex (either a value was already expected here so this is
  // division, or no valid closing delimiter was found on this line) — an
  // ordinary `/` operator token, after which a value IS expected again.
  return { index: index + 1, regexAllowed: true };
}

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
 * pre-existing status quo). Measured: zero occurrences of `export` followed
 * by whitespace and a block-comment opener anywhere in the real 165-file
 * in-repo `.aktion` corpus (`docs/demos/`, `create-aktion/template/`).
 * Re-measure before assuming this is still negligible if the corpus grows.
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
  // A regex literal is now its own recognised span kind (see
  // `trySkipRegexLiteral` and `scanCode`'s `regexAllowed`-gated `/` branch
  // below) and is skipped BEFORE the scanner would ever reach a quote
  // character sitting inside it — including one inside a `[...]` character
  // class — so this function no longer needs to guard against that case.
  // (Previously documented here as a KNOWN LIMITATION: a regex containing a
  // quote inside a character class could make this function mistake that
  // quote for the start of a real string literal, and `skipQuoted` would
  // then scan forward for a matching close quote, potentially consuming the
  // rest of the file. Fixed by giving regex literals their own span in
  // `scanCode` instead of leaving them invisible to it — see
  // `tests/eslint-scan.test.ts`'s "does not let a quote character inside a
  // regex character class start a phantom string literal" case. The fix
  // only covers positions where `regexAllowed` itself is correctly
  // computed; see `scanCode`'s own comment for that half of the story.)
  const trySkipStringLike = (index: number): number | undefined => {
    const char = source[index];
    if (char === '"' || char === "'") {
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
  //
  // `regexAllowed` tracks whether a `/` encountered right here would begin a
  // REGEX LITERAL or is a DIVISION operator — mirrors `src/parser/lexer.ts`'s
  // own `regexAllowedHere` exactly: a value is NOT expected next (division)
  // immediately after an identifier, a state identifier (`$name`), a number,
  // a string, a template literal, `true`/`false`/`null`, a regex literal
  // itself, or a closing `)`/`]`/`}` — every other token (a reserved
  // keyword, an opening bracket, any other operator/punctuation, a newline,
  // or the start of this region) means a VALUE is expected next, so a
  // following `/` is a regex literal. Reset to `true` at the start of every
  // `scanCode` call (including each recursive call for a `${…}`
  // interpolation), matching the real tokenizer's own `!last` (empty token
  // list) case.
  const scanCode = (start: number, stopAtBrace: boolean): number => {
    let index = start;
    let braceDepth = 0;
    let regexAllowed = true;
    while (index < source.length) {
      const char = source[index];

      if (stopAtBrace && char === "}" && braceDepth === 0) {
        return index + 1;
      }

      const bracketOutcome = tryHandleBracketOrBrace(char ?? "", braceDepth);
      if (bracketOutcome !== undefined) {
        braceDepth = bracketOutcome.braceDepth;
        regexAllowed = bracketOutcome.regexAllowed;
        index += 1;
        continue;
      }

      const skippedStringLike = trySkipStringLike(index);
      if (skippedStringLike !== undefined) {
        index = skippedStringLike;
        regexAllowed = false;
        continue;
      }

      const skippedComment = trySkipComment(index);
      if (skippedComment !== undefined) {
        // A comment produces no token in the real tokenizer, so it never
        // changes what a following `/` would be — leave `regexAllowed`
        // exactly as it was before this comment.
        index = skippedComment;
        continue;
      }

      if (char === "/") {
        const slashOutcome = handleSlash(source, index, regexAllowed);
        index = slashOutcome.index;
        regexAllowed = slashOutcome.regexAllowed;
        continue;
      }

      if (char === "\n") {
        // A newline is its OWN pushed token in the real tokenizer (unlike a
        // plain space/tab, which produces no token at all — see the
        // whitespace branch below) and, like any non-value token, resets
        // `regexAllowed` to true.
        regexAllowed = true;
        index += 1;
        continue;
      }

      if (WHITESPACE_CHAR.test(char ?? "")) {
        // A plain space/tab/`\r` produces NO token in the real tokenizer
        // (`advance(); continue;` with nothing pushed) — unlike a newline,
        // it must never touch `regexAllowed`, or `a / b` would misclassify
        // the division `/` as a regex-open the moment there's a space
        // before it (the previous, buggy version of this scan did exactly
        // that — see `tests/eslint-scan.test.ts`'s "treats `/` as division"
        // case).
        index += 1;
        continue;
      }

      if (DIGIT_CHAR.test(char ?? "")) {
        index = skipNumberLiteral(source, index);
        regexAllowed = false;
        continue;
      }

      if (char === "e" && isExportKeywordAt(index)) {
        const insertionOffset = classifyExportTail(source, index + 6);
        if (insertionOffset !== undefined) {
          insertions.push({ originalOffset: insertionOffset });
        }

        index += 6;
        regexAllowed = true; // `export` is a reserved keyword.
        continue;
      }

      if (IDENTIFIER_START.test(char ?? "")) {
        const { word, end } = readIdentifierWord(source, index);
        index = end;
        regexAllowed = RESERVED_KEYWORD_WORDS.has(word);
        continue;
      }

      // Any other punctuation/operator character (`=`, `,`, `;`, `:`, `?`,
      // `+`, `.`, …) — none of these are a "value" token, so a value (and
      // therefore a regex literal) is expected next.
      regexAllowed = true;
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
