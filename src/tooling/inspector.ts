/**
 * Aktion 0.5 §27 — live AST inspector.
 *
 * Hosts (playgrounds, IDE panels, debuggers) need a structured snapshot
 * of *both* ASTs at any byte position in the stream:
 *
 *   - The **Committed AST** — what the evaluator runs right now.
 *   - The **Drafting AST** — what the parser is currently chewing on.
 *
 * This file exposes a small, JSON-serialisable view over the existing
 * `computeFrontier` + `parse` results. It does not re-implement the
 * parser; it is a *projection* over the parsed program intended for
 * tooling consumption (live playgrounds, agent introspection, LLM
 * "what's in flight?" prompts, …).
 *
 * The inspector is read-only and side-effect-free.
 */

import type {
  Expression,
  Program,
  Statement,
} from "../parser/types.js";
import {
  computeFrontier,
} from "../parser/frontier.js";

export interface InspectorBinding {
  /** Top-level name (e.g. `root`, `count`, `Header`). */
  name: string;
  /** What kind of declaration introduced this binding. */
  kind:
    | "assignment"
    | "component"
    | "effect"
    | "action"
    | "router";
  /** Source line (1-indexed). */
  line: number;
  /** Source column (1-indexed). */
  column: number;
  /** Brief textual summary (callee name for assignments, endpoint method, …). */
  summary?: string;
}

export interface InspectorView {
  /** Committed prefix that has already parsed cleanly. */
  committed: {
    source: string;
    bindings: InspectorBinding[];
    statementCount: number;
  };
  /** Drafting tail past the committed frontier. */
  drafting: {
    source: string;
    bindings: InspectorBinding[];
    statementCount: number;
    /** SCC-2 — names declared in the drafting tail but not yet committed. */
    inFlightNames: string[];
  };
  /** Parse errors (if any). Empty when the whole input parses cleanly. */
  errors: ReadonlyArray<{ line: number; column: number; message: string }>;
  /** Total number of declared bindings across both ASTs. */
  totalBindings: number;
}

/**
 * Inspect `source` and return a JSON-friendly view of the Committed +
 * Drafting ASTs. Cheap — runs a single `parse` pass via
 * `computeFrontier`.
 */
export function inspectAST(source: string): InspectorView {
  const frontier = computeFrontier(source);
  const committedBindings = frontier.committedStatements
    .map(toBinding)
    .filter((b): b is InspectorBinding => b !== null);

  // Drafting bindings: the parser doesn't emit partial AST nodes for
  // half-written lines, so `uncommittedBindings` is usually empty.
  // Instead we scan the drafting source for top-level declaration
  // patterns (`$tier name`, `component Name(`, `name =`, …) to surface
  // *which names the author has started writing* even before they
  // commit. This is the "in-flight" view the SCC promises (§1, §2).
  const draftingBindings: InspectorBinding[] = scanDraftingNames(
    frontier.draftingSource,
    frontier.committedSource,
  );
  // Merge any names the parser *did* identify (rare — only when the
  // drafting source contains a clean prefix followed by an error).
  for (const name of frontier.uncommittedBindings) {
    if (!draftingBindings.some((b) => b.name === name)) {
      draftingBindings.push({
        name,
        kind: "assignment",
        line: 0,
        column: 0,
      });
    }
  }
  const inFlightNames = draftingBindings.map((b) => b.name);

  return {
    committed: {
      source: frontier.committedSource,
      bindings: committedBindings,
      statementCount: frontier.committedStatements.length,
    },
    drafting: {
      source: frontier.draftingSource,
      bindings: draftingBindings,
      statementCount: draftingBindings.length,
      inFlightNames,
    },
    errors: frontier.errors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
    })),
    totalBindings: committedBindings.length + draftingBindings.length,
  };
}

/**
 * Build a view directly from a parsed `Program`. Useful for hosts that
 * have already paid the parse cost and just need the structured
 * projection.
 */
export function inspectProgram(source: string, program: Program): InspectorView {
  const bindings = program.statements
    .map(toBinding)
    .filter((b): b is InspectorBinding => b !== null);
  return {
    committed: {
      source,
      bindings,
      statementCount: program.statements.length,
    },
    drafting: {
      source: "",
      bindings: [],
      statementCount: 0,
      inFlightNames: [],
    },
    errors: program.errors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
    })),
    totalBindings: bindings.length,
  };
}

function toBinding(stmt: Statement): InspectorBinding | null {
  switch (stmt.kind) {
    case "Assignment":
      return {
        name: stmt.identifier,
        kind: "assignment",
        line: stmt.loc?.line ?? 0,
        column: stmt.loc?.column ?? 0,
        summary: summariseExpression(stmt.expression),
      };
    case "ComponentDeclaration":
      return {
        name: stmt.name,
        kind: "component",
        line: stmt.loc?.line ?? 0,
        column: stmt.loc?.column ?? 0,
        summary: `component (${stmt.params.length} param${stmt.params.length === 1 ? "" : "s"}, ${stmt.body.body.length} stmt${stmt.body.body.length === 1 ? "" : "s"})`,
      };
    case "EffectDeclaration": {
      const deps = stmt.triggers.map((t) => {
        if (t.kind === "lifecycle") return `on:${t.name}`;
        if (t.kind === "every") return `on:every(${t.intervalMs})`;
        return `$${t.name}`;
      });
      if (stmt.rateLimit) deps.push(`${stmt.rateLimit.kind}(${stmt.rateLimit.ms})`);
      const depsLabel = deps.length > 0 ? ` [${deps.join(", ")}]` : "";
      return {
        name: stmt.name,
        kind: "effect",
        line: stmt.loc?.line ?? 0,
        column: stmt.loc?.column ?? 0,
        summary: `effect${depsLabel}`,
      };
    }
    case "ActionDeclaration":
      return {
        name: stmt.name,
        kind: "action",
        line: stmt.loc?.line ?? 0,
        column: stmt.loc?.column ?? 0,
        summary: stmt.optimistic ? "action (optimistic)" : "action",
      };
    default:
      return null;
  }
}

/**
 * Scan the drafting source for top-level declaration patterns. We
 * only look at the *start* of each line (after optional indent — the
 * top-level surface is column 1) and never recurse into blocks; that
 * keeps the scan O(lines) and stable while the author types.
 *
 * `committedSource` is used purely to compute the absolute line offset
 * so the returned `line` numbers line up with the original source.
 */
function scanDraftingNames(
  draftingSource: string,
  committedSource: string,
): InspectorBinding[] {
  if (draftingSource.length === 0) return [];
  const lineOffset = committedSource === ""
    ? 0
    : committedSource.split("\n").length - 1;

  const lines = draftingSource.split("\n");
  const bindings: InspectorBinding[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i]!;
    // Top-level only — skip indented continuations.
    if (/^\s/.test(rawLine) && rawLine.trim().length > 0) continue;
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("//")) continue;

    const stateMatch = /^\$([A-Za-z_]\w*)\s*=/.exec(line);
    if (stateMatch) {
      bindings.push({
        name: stateMatch[1]!,
        kind: "assignment",
        line: lineOffset + i + 1,
        column: rawLine.indexOf("$") + 1,
        summary: "$state",
      });
      continue;
    }
    const compMatch = /^component\s+([A-Za-z_]\w*)/.exec(line);
    if (compMatch) {
      bindings.push({
        name: compMatch[1]!,
        kind: "component",
        line: lineOffset + i + 1,
        column: 1,
      });
      continue;
    }
    const effectMatch = /^effect\s+([A-Za-z_]\w*)/.exec(line);
    if (effectMatch) {
      bindings.push({
        name: effectMatch[1]!,
        kind: "effect",
        line: lineOffset + i + 1,
        column: 1,
      });
      continue;
    }
    const actionMatch = /^action\s+([A-Za-z_]\w*)/.exec(line);
    if (actionMatch) {
      bindings.push({
        name: actionMatch[1]!,
        kind: "action",
        line: lineOffset + i + 1,
        column: 1,
      });
      continue;
    }
    const assignmentMatch = /^([A-Za-z_]\w*)\s*=/.exec(line);
    if (assignmentMatch && !line.startsWith("$")) {
      bindings.push({
        name: assignmentMatch[1]!,
        kind: "assignment",
        line: lineOffset + i + 1,
        column: 1,
      });
    }
  }
  return bindings;
}

function summariseExpression(expr: Expression): string {
  switch (expr.kind) {
    case "Call":      return `${expr.callee}(...)`;
    case "MethodCall": return `${summariseExpression(expr.object)}${expr.optional ? "?." : "."}${expr.method}(...)`;
    case "BuiltinCall": return `@${expr.name}(...)`;
    case "Literal":   return typeof expr.value === "string" ? `"${expr.value}"` : String(expr.value);
    case "Identifier": return expr.name;
    case "StateRef": return `$${expr.name}`;
    case "Array":     return "[…]";
    case "Object":    return "{…}";
    case "Template":  return "`…`";
    case "If":        return "if … { … }";
    case "Match":     return "match … { … }";
    case "For":       return "for … in …";
    case "Lambda":    return "(…) => …";
    default:          return expr.kind;
  }
}
