import { Program, Statement, Expression } from './types.js';
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
 * Visit every node in `program` in source order, depth-first, parents first.
 *
 * ```ts
 * walk(program, ({ node }) => {
 *   if (node.kind === "Call") console.log(node.callee, node.loc);
 * });
 * ```
 */
export declare function walk(program: Program, visit: WalkVisitor): void;
/** Visit `root` and its descendants — `walk` for a single subtree. */
export declare function walkNode(root: AnyNode, visit: WalkVisitor): void;
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
export declare function stampSourceIndex(root: AnyNode, index: number): void;
