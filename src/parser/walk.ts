/**
 * Generic AST traversal for Aktion programs.
 *
 * Before this module every consumer that needed to visit a whole tree wrote its
 * own switch over the 20-odd `Statement` kinds and 18 `Expression` kinds — the
 * linker's renamer, the tooling passes, the coverage recorder. Each copy is a
 * place a newly added node kind can be silently forgotten, which shows up as a
 * mysterious hole rather than a type error.
 *
 * `walk` is deliberately structural and untyped at the visitor boundary: it
 * enumerates every object in the tree that carries a `kind`, in source order,
 * with its parent. Callers that need type narrowing switch on `node.kind`
 * themselves and get full inference from the `Statement`/`Expression` unions.
 *
 * The traversal is *reflective* — it walks own enumerable properties rather than
 * a hand-written child list — so a node kind added to the parser is visited the
 * day it is added, with no change here. That costs a little speed versus a
 * bespoke switch, which is why the linker keeps its own scope-aware renamer:
 * this is for tooling and analysis passes, not the hot render path.
 */

import type { Program, Statement, Expression, SourceLocation } from "./types.js";

/** Any AST node — every node in the tree carries a discriminating `kind`. */
export type AnyNode = Statement | Expression;

/** A node together with the position it occupies in its parent. */
export interface WalkStep {
  node: AnyNode;
  /** The enclosing node, or `null` for a top-level statement. */
  parent: AnyNode | null;
  /** Property of `parent` this node was reached through (`"body"`, `"left"`, …). */
  key: string | null;
  /** Index within that property when it is an array, else `null`. */
  index: number | null;
  /** Depth from the program root (top-level statements are 0). */
  depth: number;
}

/** Return `false` from a visitor to skip a node's children. */
export type WalkVisitor = (step: WalkStep) => void | false;

/**
 * True for a real AST node.
 *
 * A `kind` string alone is not enough: `EffectTrigger` (`"state"`,
 * `"lifecycle"`, `"every"`), `EffectRateLimit` (`"debounce"`, `"throttle"`) and
 * `DestructuringPattern` (`"array"`, `"object"`) are node-BEARING records that
 * carry a `kind` of their own and would otherwise be reported as nodes a caller
 * cannot switch on. Every genuine node kind is PascalCase and every one of those
 * records is lowercase — note `ArrayExpr`/`ObjectExpr` are `"Array"`/`"Object"`,
 * so the test has to be case-sensitive, not a name comparison.
 */
function isNode(value: unknown): value is AnyNode {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== "string" || kind.length === 0) return false;
  const first = kind.charCodeAt(0);
  return first >= 65 && first <= 90; // "A".."Z"
}

/**
 * Visit every node in `program` in source order, depth-first, parents first.
 *
 * ```ts
 * walk(program, ({ node }) => {
 *   if (node.kind === "Call") console.log(node.callee, node.loc);
 * });
 * ```
 */
export function walk(program: Program, visit: WalkVisitor): void {
  for (const stmt of program.statements) visitNode(stmt, null, null, null, 0, visit);
}

/** Visit `root` and its descendants — `walk` for a single subtree. */
export function walkNode(root: AnyNode, visit: WalkVisitor): void {
  visitNode(root, null, null, null, 0, visit);
}

function visitNode(
  node: AnyNode,
  parent: AnyNode | null,
  key: string | null,
  index: number | null,
  depth: number,
  visit: WalkVisitor,
): void {
  if (visit({ node, parent, key, index, depth }) === false) return;
  for (const childKey of Object.keys(node)) {
    // `loc` is a position, not a child; `kind`/`name`/`operator` are scalars.
    if (childKey === "loc") continue;
    const value = (node as unknown as Record<string, unknown>)[childKey];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (isNode(item)) visitNode(item, node, childKey, i, depth + 1, visit);
        // `SwitchCase` / `ImportSpecifier` / `ObjectProperty` are node-bearing
        // records without a `kind` of their own — descend through them so their
        // expressions are not skipped.
        else if (item && typeof item === "object") visitRecord(item as Record<string, unknown>, node, childKey, depth, visit);
      }
      continue;
    }
    if (isNode(value)) visitNode(value, node, childKey, null, depth + 1, visit);
    else if (value && typeof value === "object") {
      visitRecord(value as Record<string, unknown>, node, childKey, depth, visit);
    }
  }
}

/**
 * Descend through a plain record that holds child expressions but is not itself
 * a node (`ObjectProperty`, `SwitchCase`, `DeclParam`, `DestructuringPattern`).
 * Its children are attributed to the nearest real node, so a visitor never sees
 * a parent it cannot switch on.
 */
function visitRecord(
  record: Record<string, unknown>,
  owner: AnyNode,
  key: string,
  depth: number,
  visit: WalkVisitor,
): void {
  for (const inner of Object.keys(record)) {
    if (inner === "loc") continue;
    const value = record[inner];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (isNode(item)) visitNode(item, owner, key, i, depth + 1, visit);
        else if (item && typeof item === "object") visitRecord(item as Record<string, unknown>, owner, key, depth, visit);
      }
      continue;
    }
    if (isNode(value)) visitNode(value, owner, key, null, depth + 1, visit);
    else if (value && typeof value === "object") {
      visitRecord(value as Record<string, unknown>, owner, key, depth, visit);
    }
  }
}

/**
 * Stamp `loc.source = index` on every located node in `root` that does not
 * already carry one.
 *
 * "Does not already carry one" is what makes this safe to run per module while
 * merging a graph: a node that arrived from a deeper import keeps the index it
 * was given there instead of being re-attributed to whoever imported it.
 *
 * Mutates in place — callers own freshly parsed trees.
 */
export function stampSourceIndex(root: AnyNode, index: number): void {
  walkNode(root, ({ node }) => {
    const loc = (node as { loc?: SourceLocation }).loc;
    if (loc && loc.source === undefined) loc.source = index;
  });
}
