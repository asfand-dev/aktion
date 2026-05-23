/**
 * Aktion 0.5 §14 — Delta Protocol.
 *
 * In v1 every LLM turn replaced the entire program. SUIS/2 ships a
 * structured delta surface so a "tweak the UI" turn can stay tiny:
 * a handful of typed operations applied to the previous program's
 * Committed AST. The runtime mounts the patched program with the
 * user's `$state` preserved across the diff.
 *
 * The spec's original pragma signalling (`#sus/2 delta`) was retired
 * along with every other pragma in 0.5 (`#…` lines are comments). The
 * delta is therefore expressed as **structured operations** — hosts
 * call `el.applyDelta(ops)` directly, no in-language pragma required.
 *
 * Operations
 * ----------
 *
 *   { kind: "patch", target: "stateName", value: 50 }
 *     Update a `$state` atom in place. Does not touch the program
 *     text. Use for "set the slider to 50", "expand the panel", etc.
 *
 *   { kind: "replace", binding: "header", source: "PageHeader(\"Sales\")" }
 *     Replace a top-level binding's RHS. Equivalent to deleting and
 *     re-emitting the line(s).
 *
 *   { kind: "append", binding: "items", item: "{ label: \"Reports\" }" }
 *     Append an item to a top-level array binding. `binding`'s RHS
 *     must be a literal array expression.
 *
 *   { kind: "new", source: "component ReportCard(r) { Card([Text(r.title)]) }" }
 *     Append a new top-level statement to the program.
 *
 *   { kind: "delete", binding: "legacyWidget" }
 *     Remove a top-level binding (or component / action / effect /
 *     endpoint declaration) by name.
 *
 * Op application is best-effort: each op that does not match its
 * target surfaces an advisory warning and is skipped. The runtime
 * still mounts the rest of the patched program — partial deltas
 * never strand the user with no UI.
 *
 * The function is pure: feed in `(source, ops)`, get back
 * `(programText, stateUpdates, warnings)`. State application is the
 * caller's responsibility (the host element wires it up — see
 * `AktionElement.applyDelta`).
 */

import { parse } from "../parser/index.js";
import type { Expression, Program, Statement } from "../parser/types.js";

export type DeltaOp =
  | { kind: "patch"; target: string; value: unknown }
  | { kind: "replace"; binding: string; source: string }
  | { kind: "append"; binding: string; item: string }
  | { kind: "new"; source: string }
  | { kind: "delete"; binding: string };

export interface DeltaResult {
  /** Source text after every structural op (replace/append/new/delete) lands. */
  programText: string;
  /** `patch` ops collected as a name→value map; the caller applies these to its state store. */
  stateUpdates: Record<string, unknown>;
  /** Advisory diagnostics for ops that became no-ops. */
  warnings: string[];
}

export function applyDelta(
  source: string,
  ops: readonly DeltaOp[],
): DeltaResult {
  const warnings: string[] = [];
  const stateUpdates: Record<string, unknown> = {};
  let programText = source;

  for (const op of ops) {
    if (op.kind === "patch") {
      stateUpdates[op.target] = op.value;
      continue;
    }
    const result = applyStructural(programText, op);
    programText = result.programText;
    if (result.warning) warnings.push(result.warning);
  }

  return { programText, stateUpdates, warnings };
}

interface StructuralResult {
  programText: string;
  warning?: string;
}

function applyStructural(
  source: string,
  op: Exclude<DeltaOp, { kind: "patch" }>,
): StructuralResult {
  const program = parse(source);
  if (program.errors.length > 0) {
    return {
      programText: source,
      warning: `delta(${op.kind}): source did not parse cleanly (${program.errors[0]!.message}); op skipped`,
    };
  }

  switch (op.kind) {
    case "new": {
      const sub = parse(op.source);
      if (sub.errors.length > 0 || sub.statements.length === 0) {
        return {
          programText: source,
          warning: `delta(new): could not parse "${snippet(op.source)}" — op skipped`,
        };
      }
      const sep = source.endsWith("\n") ? "" : "\n";
      return { programText: source + sep + op.source.trim() + "\n" };
    }
    case "delete": {
      const idx = findBindingIndex(program, op.binding);
      if (idx < 0) {
        return {
          programText: source,
          warning: `delta(delete): binding "${op.binding}" not found — op skipped`,
        };
      }
      return { programText: spliceLines(source, program, idx, null) };
    }
    case "replace": {
      const idx = findBindingIndex(program, op.binding);
      if (idx < 0) {
        return {
          programText: source,
          warning: `delta(replace): binding "${op.binding}" not found — op skipped`,
        };
      }
      const sub = parse(`${op.binding} = ${op.source}`);
      if (sub.errors.length > 0) {
        return {
          programText: source,
          warning: `delta(replace): could not parse new source for "${op.binding}" — op skipped`,
        };
      }
      return {
        programText: spliceLines(source, program, idx, `${op.binding} = ${op.source.trim()}`),
      };
    }
    case "append": {
      const idx = findBindingIndex(program, op.binding);
      if (idx < 0) {
        return {
          programText: source,
          warning: `delta(append): binding "${op.binding}" not found — op skipped`,
        };
      }
      const target = program.statements[idx]!;
      if (target.kind !== "Assignment" || target.expression.kind !== "Array") {
        return {
          programText: source,
          warning: `delta(append): binding "${op.binding}" is not an array literal — op skipped`,
        };
      }
      const sub = parse(`__rui_delta_item__ = ${op.item}`);
      const itemStmt = sub.statements[0];
      if (sub.errors.length > 0 || !itemStmt || itemStmt.kind !== "Assignment") {
        return {
          programText: source,
          warning: `delta(append): could not parse item "${snippet(op.item)}" — op skipped`,
        };
      }
      const elements = target.expression.elements;
      const rebuilt = `${op.binding} = [${[...elements.map(stringifyExpression), op.item.trim()].join(", ")}]`;
      return { programText: spliceLines(source, program, idx, rebuilt) };
    }
  }
}

function findBindingIndex(program: Program, name: string): number {
  return program.statements.findIndex((s) => bindingName(s) === name);
}

function bindingName(stmt: Statement): string | null {
  switch (stmt.kind) {
    case "Assignment":
      return stmt.identifier;
    case "ComponentDeclaration":
    case "EffectDeclaration":
    case "ActionDeclaration":
      return stmt.name;
    default:
      return null;
  }
}

/**
 * Replace lines `[startLine .. endLine]` (1-indexed, inclusive) with
 * `replacement`, where the start line is the source location of
 * statement `idx` and the end line is the line *before* statement
 * `idx + 1` (or end of file).
 *
 * Passing `replacement: null` deletes the line range entirely.
 */
function spliceLines(
  source: string,
  program: Program,
  idx: number,
  replacement: string | null,
): string {
  const lines = source.split("\n");
  const target = program.statements[idx]!;
  const next = program.statements[idx + 1];
  const startLine = (target.loc?.line ?? 1) - 1;
  const endLine = next ? (next.loc?.line ?? lines.length + 1) - 1 : lines.length;
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine);
  if (replacement === null) {
    return [...before, ...after].join("\n");
  }
  return [...before, replacement, ...after].join("\n");
}

function stringifyExpression(expr: Expression): string {
  switch (expr.kind) {
    case "Literal":
      if (typeof expr.value === "string") {
        return `"${expr.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return String(expr.value);
    case "Identifier":
      return expr.name;
    case "StateRef":
      return `$${expr.name}`;
    case "Call":
      return `${expr.callee}(${expr.arguments.map(stringifyExpression).join(", ")})`;
    case "MethodCall":
      return `${stringifyExpression(expr.object)}${expr.optional ? "?." : "."}${expr.method}(${expr.arguments.map(stringifyExpression).join(", ")})`;
    case "NamedArg":
      return `${expr.name}: ${stringifyExpression(expr.value)}`;
    case "Array":
      return `[${expr.elements.map(stringifyExpression).join(", ")}]`;
    case "Object":
      return `{ ${expr.properties.map((p) =>
        p.spread
          ? `...${stringifyExpression(p.value)}`
          : `${p.key}: ${stringifyExpression(p.value)}`,
      ).join(", ")} }`;
    case "Member": {
      const obj = stringifyExpression(expr.object);
      if (expr.property) return `${obj}${expr.optional ? "?." : "."}${expr.property}`;
      if (expr.computed) return `${obj}${expr.optional ? "?." : ""}[${stringifyExpression(expr.computed)}]`;
      return obj;
    }
    case "Binary":
      return `${stringifyExpression(expr.left)} ${expr.operator} ${stringifyExpression(expr.right)}`;
    case "Template": {
      const parts: string[] = [];
      for (let i = 0; i < expr.quasis.length; i += 1) {
        parts.push(expr.quasis[i] ?? "");
        if (i < expr.expressions.length) {
          parts.push("${");
          parts.push(stringifyExpression(expr.expressions[i]!));
          parts.push("}");
        }
      }
      return `\`${parts.join("")}\``;
    }
    default:
      // Less-common expression kinds — `if` / `match` / `for` /
      // lambdas / `js{}` blocks. These would need a full pretty-
      // printer to round-trip safely; we treat them as opaque
      // and surface a placeholder so the caller can detect the
      // limitation.
      return "/* unprintable */";
  }
}

function snippet(s: string): string {
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}
