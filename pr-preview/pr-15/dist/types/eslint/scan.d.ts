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
/**
 * Scans `source` for every bare `export IDENTIFIER = …` occurrence and
 * returns the ordered (ascending) list of insertion points where `const `
 * must be spliced in.
 */
export declare function findBareExportInsertions(source: string): ExportInsertion[];
