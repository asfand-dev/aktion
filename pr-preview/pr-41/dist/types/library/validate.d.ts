import { ParseError, Program } from '../parser/types.js';
import { ComponentLibrary } from './types.js';
/**
 * Combined entry point for hosts: parse the source and merge any
 * schema-level violations into `program.errors`. The element calls
 * this so the on-screen error banner surfaces *every* Aktion 0.5
 * violation, not just the syntactic ones. Returning the
 * parsed program lets the caller render the committed prefix when
 * the input still parses cleanly.
 */
export declare function validateProgram(source: string, library: ComponentLibrary): Program;
/**
 * Schema-as-truth validation (§15).
 *
 * Walks a parsed `Program` and returns every Aktion 0.5
 * schema violation as a `ParseError`. In 0.5 these are **fatal** — the
 * host should merge them into `program.errors` (see
 * `validateProgram(source, library)` for the combined entry point) and
 * surface the error banner instead of rendering. There are no longer
 * any "advisory warnings" — every legacy v1 surface either:
 *
 *   - produces a parser-level migration error at parse time, or
 *   - produces a schema-validator error here when library knowledge is
 *     required (positional arity overflows, unknown props, enum
 *     mismatches, built-in-name collisions, legacy Theme tokens, …).
 */
export declare function validateProgramSchema(program: Program, library: ComponentLibrary): ParseError[];
