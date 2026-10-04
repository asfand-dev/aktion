/**
 * How an `$effect(…)` call was written — facts the AST cannot hold.
 *
 * The parser keeps only an inline function's body and an array literal's
 * triggers, so `$effect(load, ["mount"])` (a function REFERENCE) and
 * `$effect(() => …, deps)` (a dependency VARIABLE) both produce a valid
 * `EffectDeclaration` that silently does nothing / runs once. `.aktion`
 * programs have always behaved that way; the JS-semantics layer for
 * `.aktion.js` / `.aktion.ts` rejects both (E119, E120) and needs to know where
 * the unsupported argument was.
 *
 * Recorded in a side table keyed by the declaration node, so the AST — and
 * every compiled program — stays byte-for-byte what it was.
 */

import type { EffectDeclaration, SourceLocation } from "./types.js";

export interface EffectCallShape {
  /** Position of a first argument that is not an inline arrow or function expression. */
  callback?: SourceLocation;
  /** Position of a second argument that is not an array literal. */
  deps?: SourceLocation;
}

const shapes = new WeakMap<object, EffectCallShape>();

/** Record an unsupported argument of `decl` (called by the parser). */
export function recordEffectCallShape(decl: object, shape: EffectCallShape): void {
  if (shape.callback === undefined && shape.deps === undefined) return;
  shapes.set(decl, shape);
}

/** The unsupported arguments of `decl`, or `undefined` when both were written the supported way. */
export function effectCallShape(decl: EffectDeclaration): EffectCallShape | undefined {
  return shapes.get(decl);
}
