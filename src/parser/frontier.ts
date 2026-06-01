/**
 * Streaming Coherence Contract (SCC) — formal frontier API for Aktion 0.5.
 *
 * The spec (§1, §2) talks about a Drafting AST and a Committed AST. In the
 * current implementation the parser is already line-oriented and
 * error-tolerant, so the "committed" frontier is the longest prefix of the
 * input where every line parses cleanly. This module turns that informal
 * behaviour into a small, observable API.
 *
 * Why this matters: hosts (and tests) need to know which bindings are
 * stable vs in-flight so they can:
 *
 *   - SCC-2: enumerate the set `U` of *known-incomplete* bindings.
 *   - SCC-3: gate side effects on quiescence — never fire an effect that
 *     depends on a binding still in `U`.
 *   - SCC-4: verify identity stability across re-emissions of the same
 *     program prefix.
 *
 * The frontier is computed by parsing the input as-is, walking the
 * statements, and treating any statement whose source spans an error line
 * as drafting. Everything else commits.
 */

import { parse } from "./parser.js";
import type { ParseError, Program, Statement } from "./types.js";

export interface FrontierResult {
  /**
   * Longest prefix of `source` (line-aligned) where every statement
   * parsed without errors. Always ends on a newline boundary, or equals
   * the empty string when no committed prefix exists yet.
   */
  committedSource: string;
  /** Tail of `source` past the committed prefix — the "in-flight" lines. */
  draftingSource: string;
  /**
   * Names declared inside the committed prefix. Top-level identifiers
   * only — block-local bindings (component params, $state inside a
   * component body) are not included.
   */
  committedBindings: ReadonlyArray<string>;
  /**
   * The set `U` (SCC-2): top-level names that appear inside the drafting
   * tail but have not yet committed. Includes:
   *
   *   - Identifiers on the left of an assignment (`foo = …`).
 *   - State assignments (`$x = …`).
 *   - Function / effect declarations.
   *
   * Names that only appear as call expressions (`Button(…)`) inside the
   * drafting tail are not listed — those are dependencies, not bindings.
   */
  uncommittedBindings: ReadonlyArray<string>;
  /**
   * Statements that parsed cleanly in the committed prefix. Hosts can
   * walk this list to enumerate the committed surface (components,
   * effects, actions, endpoints, router declarations) without having to
   * re-parse.
   */
  committedStatements: ReadonlyArray<Statement>;
  /** Errors reported by the parser. Empty when the whole input parses cleanly. */
  errors: ReadonlyArray<ParseError>;
}

/**
 * Compute the streaming frontier for `source`. Cheap — runs a single
 * `parse(source)` pass and walks the resulting statements once.
 *
 * Example:
 *
 *   const f = computeFrontier(
 *     "$state count = 0\n" +
 *     "function Counter() {\n" +
 *     "  Stack(Te"               // mid-stream: half-written `Text`
 *   );
 *   // f.committedBindings = ["count"]
 *   // f.uncommittedBindings = ["Counter"]
 *   // f.committedSource ends just before "function Counter() {…"
 */
export function computeFrontier(source: string): FrontierResult {
  const program = parse(source);
  return buildFrontier(source, program);
}

/**
 * Build a frontier result from an already-parsed program. Exposed so
 * hosts that already call `parse(...)` once don't have to repeat the
 * work.
 */
export function buildFrontier(source: string, program: Program): FrontierResult {
  const errorLines = new Set(program.errors.map((e) => e.line));
  const committed: Statement[] = [];
  const drafting: Statement[] = [];
  for (const stmt of program.statements) {
    const stmtLine = (stmt as { loc?: { line: number } }).loc?.line ?? 0;
    // A statement commits when:
    //   (a) it parsed without contributing to an error line, AND
    //   (b) its source range does not touch the active drafting tail.
    //
    // We approximate (b) with "no later-or-equal line carried a parse
    // error" — line-oriented recovery means an earlier error never
    // bleeds forward, but an error on the same line marks the
    // statement as in-flight.
    if (errorLines.has(stmtLine)) {
      drafting.push(stmt);
      continue;
    }
    committed.push(stmt);
  }

  // Find the line of the first error (if any). Everything before that
  // line is the committed source; everything from that line onwards is
  // the drafting tail.
  let committedSource = source;
  let draftingSource = "";
  if (program.errors.length > 0) {
    const firstErrorLine = Math.min(...program.errors.map((e) => e.line));
    const split = splitSourceAtLine(source, firstErrorLine);
    committedSource = split.before;
    draftingSource = split.after;
    // Anything declared on or after that boundary is "in-flight" even if
    // the parser happened to recognise its name.
    const splitIndex = committed.findIndex(
      (s) => ((s as { loc?: { line: number } }).loc?.line ?? 0) >= firstErrorLine,
    );
    if (splitIndex >= 0) {
      for (const stmt of committed.splice(splitIndex)) {
        drafting.push(stmt);
      }
    }
  }

  return {
    committedSource,
    draftingSource,
    committedBindings: committed.map(bindingNameOf).filter((n): n is string => n !== null),
    uncommittedBindings: drafting.map(bindingNameOf).filter((n): n is string => n !== null),
    committedStatements: committed,
    errors: program.errors,
  };
}

/**
 * SCC-3 helper: returns `true` when every name in `deps` lives in the
 * committed prefix (so a side effect depending on them is safe to fire).
 */
export function isQuiescent(frontier: FrontierResult, deps: ReadonlyArray<string>): boolean {
  if (deps.length === 0) return true;
  const committed = new Set(frontier.committedBindings);
  for (const name of deps) {
    if (!committed.has(name)) return false;
  }
  return true;
}

function bindingNameOf(stmt: Statement): string | null {
  switch (stmt.kind) {
    case "Assignment":      return stmt.identifier;
    case "ComponentDeclaration":
    case "EffectDeclaration":
    case "ActionDeclaration":
    case "HookDeclaration":
      return stmt.name;
    default: return null;
  }
}

function splitSourceAtLine(
  source: string,
  line: number,
): { before: string; after: string } {
  if (line <= 1) return { before: "", after: source };
  // Find the offset of the start of `line` (1-indexed).
  let offset = 0;
  let current = 1;
  while (offset < source.length && current < line) {
    if (source[offset] === "\n") current += 1;
    offset += 1;
  }
  return { before: source.slice(0, offset), after: source.slice(offset) };
}
