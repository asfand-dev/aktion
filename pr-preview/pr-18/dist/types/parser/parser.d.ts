import { Program, DestructuringPattern } from './types.js';
export declare function parse(source: string): Program;
/**
 * Flatten every variable name a destructuring pattern introduces, descending
 * into nested patterns. Shared by the linker (scope collection) and the
 * language service (shadowing checks) so both see the same set of names.
 */
export declare function collectPatternNames(pattern: DestructuringPattern): string[];
