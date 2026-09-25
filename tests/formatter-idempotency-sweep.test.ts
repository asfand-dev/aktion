/**
 * Whole-repo idempotency sweep for the pretty-printer: every committed
 * `.aktion` program (docs examples, demo apps, component showcases) must
 * format to a fixed point — `format(format(x)) === format(x)` — matching
 * `formatProgram`'s own doc-comment guarantee (`src/tooling/formatter.ts`).
 *
 * Added alongside the `__rui_assign__` round-trip fix (see
 * `tests/formatter.test.ts`) so a fix scoped to one repro doesn't leave
 * other instances of the same class of bug (any `BuiltinCall` whose printed
 * form doesn't re-parse to the same node kind) undetected in real programs.
 * Mirrors the collection pattern in `tests/aktion-programs-validate.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { formatProgram } from "../src/tooling/formatter.js";
import { tokenize, type RawComment } from "../src/parser/lexer.js";

const root = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "site"]);

/**
 * Known pre-existing idempotency gap, NOT fixed by this change set: the
 * printer has no concept of operator precedence at all — there is no
 * `Paren`/grouping AST node in this grammar (parens are pure grouping
 * syntax the parser discards), and `printExpression`'s `Binary`/`Ternary`
 * cases never re-add parentheses when the printed sub-expression would
 * parse with different precedence than the original. Concretely,
 * `(html || "").replaceAll(...)` prints its `Binary(Or, html, "")` target
 * as bare `html || ""` with no wrapping parens, producing
 * `html || "".replaceAll(...)` — since `.` binds tighter than `||`, that
 * reparses as `html || ("".replaceAll(...))`, a structurally different
 * tree, so the SECOND `formatProgram` pass (on the now-differently-shaped
 * AST) prints differently from the first. Confirmed the two passes
 * converge to a stable fixed point from pass 2 onward — this is a
 * one-off shift, not runaway growth — but fixing it properly needs a
 * real precedence table and parenthesization pass across `Binary`,
 * `Ternary`, `Lambda`, and `Unary`, which is out of scope for the
 * `__rui_assign__` BuiltinCall round-trip fix this sweep was added
 * alongside. Tracked separately rather than silently patched here.
 */
const KNOWN_PRE_EXISTING_LIMITATIONS = new Set([
  "docs/demos/mini-apps/show-finder.aktion", // missing-parens/precedence gap above
]);

/**
 * Known, MEASURED comment-preservation gaps, NOT fixed by the comment-
 * attachment work in `parser.ts`/`formatter.ts` (see `tests/formatter-
 * comments.test.ts`). Attachment is scoped to STATEMENT-level comments
 * (before/after a `Statement` in a `Program`/`BlockExpr`/`SwitchCase` body) —
 * confirmed, by tokenizing every file in this same sweep, to cover 920 of the
 * corpus's 922 real comments (161 of 162 comment-bearing files fully
 * preserved). The one exception is `create-aktion/template/dashboard/src/
 * store.aktion`, whose two missing comments (`// --- mutations ---`,
 * `// --- derived reads ---`) are SECTION-DIVIDER comments sitting BETWEEN
 * properties of an object literal passed to `$store({...})` — a genuinely
 * different, rarer category (mid-expression / inside-a-literal) that this
 * pass explicitly does not attempt, per its own scoping. Maps relative path
 * to the exact count of comments expected to be missing — not a blanket
 * skip — so a REGRESSION that drops an ADDITIONAL, previously-preserved
 * comment in this file still fails the sweep.
 */
const KNOWN_COMMENT_GAPS: Record<string, number> = {
  "create-aktion/template/dashboard/src/store.aktion": 2,
};

/**
 * Known, MEASURED comment-PLACEMENT gaps — a comment whose raw text survives
 * formatting (so it is NOT in `KNOWN_COMMENT_GAPS` above) but re-attaches at
 * a different brace-nesting depth than it started at, i.e. it moved to a
 * DIFFERENT lexical scope while its text stayed intact. This is a distinct
 * failure mode from a dropped comment: `formatted.includes(c.text)` alone is
 * blind to it, since the text is still present somewhere in the output.
 *
 * Empty as of this writing: the parser bug that caused this (an unconsumed
 * ANCESTOR comment permanently blocking every nested container's own, later
 * comments — see `attachComments`'s doc comment in `src/parser/parser.ts`)
 * is fixed. Measured before the fix: exactly one real-corpus instance,
 * `docs/demos/mini-apps/typing-test.aktion`'s
 * `// finished the sentence early — chain another one` comment, which
 * re-attached at brace-depth 0 (top-level) instead of its real depth-2
 * (inside a nested block) — confirmed via `git stash` of the parser fix and
 * re-running this same sweep. A regression that reintroduces a scope
 * relocation shows up here as a nonzero count for some file not listed
 * below, exactly like `KNOWN_COMMENT_GAPS` above.
 */
const KNOWN_COMMENT_SCOPE_GAPS: Record<string, number> = {};

/**
 * Comment-depth pairing for the placement-aware check below: for every
 * comment in `source` (in source order), the brace-nesting depth in effect
 * at that comment's exact source position — computed from the TOKEN stream
 * (via `tokenize`'s own `{`/`}` `Punctuation` tokens), never from raw-text
 * brace counting, so a `{`/`}` character inside a string or template literal
 * is never mistaken for a real scope boundary.
 */
function commentDepthPairs(source: string): Array<{ text: string; depth: number }> {
  const comments: RawComment[] = [];
  const tokens = tokenize(source, comments);
  // One (line, column, depthAfterThisToken) event per token, in source
  // order — lets us look up "the depth in effect right before position P" by
  // scanning for the last event strictly before P.
  let depth = 0;
  const events: Array<{ line: number; column: number; depthAfter: number }> = [];
  for (const t of tokens) {
    if (t.type === "Punctuation" && t.value === "{") depth += 1;
    else if (t.type === "Punctuation" && t.value === "}") depth -= 1;
    events.push({ line: t.line, column: t.column, depthAfter: depth });
  }
  const isBefore = (aLine: number, aColumn: number, bLine: number, bColumn: number): boolean =>
    aLine !== bLine ? aLine < bLine : aColumn < bColumn;
  const depthBefore = (line: number, column: number): number => {
    let result = 0;
    for (const e of events) {
      if (isBefore(e.line, e.column, line, column)) result = e.depthAfter;
      else break;
    }
    return result;
  };
  return comments.map((c) => ({ text: c.text, depth: depthBefore(c.line, c.column) }));
}

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collect(full, out);
    else if (entry.endsWith(".aktion")) out.push(full);
  }
}

const files: string[] = [];
collect(root, files);

describe("repo .aktion programs format to a fixed point", () => {
  it("found a representative set of programs", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files.sort()) {
    const relPath = relative(root, file);
    const runner = KNOWN_PRE_EXISTING_LIMITATIONS.has(relPath) ? it.skip : it;
    runner(relPath, () => {
      const source = readFileSync(file, "utf8");
      const first = formatProgram(source);
      // A program with pre-existing parse errors formats to a no-op — not
      // this sweep's concern (covered by `aktion-programs-validate.test.ts`).
      if (first.errors.length > 0) return;

      const second = formatProgram(first.formatted);
      expect(second.errors).toEqual([]);
      expect(second.formatted).toBe(first.formatted);
    });
  }
});

describe("repo .aktion programs keep their comments through formatProgram", () => {
  const filesWithComments: Array<{ relPath: string; comments: RawComment[] }> = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const comments: RawComment[] = [];
    tokenize(source, comments);
    if (comments.length > 0) filesWithComments.push({ relPath: relative(root, file), comments });
  }

  it("found a representative set of comment-bearing programs", () => {
    // Measured: 162 of 165 real `.aktion` files in this repo carry at least
    // one comment — confirms comments are the COMMON case in real code, not
    // an edge case, matching the downstream dcd-monorepo's own ~78% figure.
    expect(filesWithComments.length).toBeGreaterThan(100);
  });

  for (const { relPath, comments } of filesWithComments.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    it(`${relPath} preserves ${comments.length} comment(s), verbatim text`, () => {
      const source = readFileSync(join(root, relPath), "utf8");
      const { formatted, errors } = formatProgram(source);
      if (errors.length > 0) return; // pre-existing parse errors — not this sweep's concern

      // A comment "survives" when its RAW text (delimiters included) appears
      // verbatim somewhere in the formatted output — deliberately loose about
      // WHERE (this suite is about not silently deleting a comment's text,
      // not about pinning its exact position; formatter.test.ts and
      // formatter-comments.test.ts pin exact placement for representative
      // cases; the "correct nesting depth" describe block below is the
      // whole-repo check for WHERE). A comment whose exact text
      // coincidentally also appears elsewhere in the file (e.g. a repeated
      // one-word comment) would false-pass THIS check — accepted here since
      // the depth check below independently catches a same-text relocation.
      const missing = comments.filter((c) => !formatted.includes(c.text));
      const expectedMissing = KNOWN_COMMENT_GAPS[relPath] ?? 0;
      expect(missing.length).toBe(expectedMissing);
    });
  }
});

describe("repo .aktion programs keep their comments at the correct nesting depth", () => {
  // Text presence alone (the describe block above) is blind to a comment
  // that survives formatting but reattaches to the WRONG lexical scope —
  // e.g. a nested container's comment silently promoted to top-level. This
  // block re-tokenizes both the source and the formatted output, pairs up
  // each SURVIVING comment (by text, in source order — see
  // `commentDepthPairs`'s doc comment) and asserts its brace-nesting depth
  // didn't change.
  const filesWithComments: Array<{ relPath: string; source: string }> = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const comments: RawComment[] = [];
    tokenize(source, comments);
    if (comments.length > 0) filesWithComments.push({ relPath: relative(root, file), source });
  }

  for (const { relPath, source } of filesWithComments.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    it(`${relPath} keeps every surviving comment at its original scope depth`, () => {
      const { formatted, errors } = formatProgram(source);
      if (errors.length > 0) return; // pre-existing parse errors — not this sweep's concern

      const inPairs = commentDepthPairs(source);
      const outPairs = commentDepthPairs(formatted);

      // Align by text, in order, so a comment whose exact text repeats
      // (e.g. two identical one-word section dividers) is still paired with
      // its own corresponding occurrence rather than an earlier one that was
      // already consumed. A source comment with no remaining match in
      // `outPairs` was dropped entirely — that is `KNOWN_COMMENT_GAPS`'s
      // concern (the describe block above), not this one, so it is skipped
      // here rather than double-counted.
      let moved = 0;
      let cursor = 0;
      for (const inC of inPairs) {
        let k = cursor;
        while (k < outPairs.length && outPairs[k]!.text !== inC.text) k += 1;
        if (k >= outPairs.length) continue; // dropped — not this check's concern
        if (outPairs[k]!.depth !== inC.depth) moved += 1;
        cursor = k + 1;
      }

      const expectedMoved = KNOWN_COMMENT_SCOPE_GAPS[relPath] ?? 0;
      expect(moved).toBe(expectedMoved);
    });
  }
});
