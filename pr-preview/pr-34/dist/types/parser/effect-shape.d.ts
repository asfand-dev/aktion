import { EffectDeclaration, SourceLocation } from './types.js';
export interface EffectCallShape {
    /** Position of a first argument that is not an inline arrow or function expression. */
    callback?: SourceLocation;
    /** Position of a second argument that is not an array literal. */
    deps?: SourceLocation;
}
/** Record an unsupported argument of `decl` (called by the parser). */
export declare function recordEffectCallShape(decl: object, shape: EffectCallShape): void;
/** The unsupported arguments of `decl`, or `undefined` when both were written the supported way. */
export declare function effectCallShape(decl: EffectDeclaration): EffectCallShape | undefined;
