import { Expression, Program, SourceLocation } from '../parser/types.js';
import { LinkDiagnostic } from './linker.js';
export { localBindingBaseName } from '../parser/module-symbols.js';
/**
 * W4 — a module-level `const Name = (params) => expr` or
 * `const Name = function (params) {…}` (optionally `export`ed) becomes
 * `function Name(params) {…}`, so a PascalCase arrow is a component — hooks,
 * per-instance state and named props work — exactly as React authors expect
 * (S25). An expression body becomes `{ return expr }`. Every `loc` is kept.
 *
 * Runs BEFORE the checks, so E110–E112 see these as components. Returns a new
 * `Program` sharing every statement it did not convert.
 */
export declare function normalizeComponentForms(program: Program): Program;
/**
 * An in-place change of an imported `$` atom. Whether it is E108 depends on how
 * the EXPORTING module declares the atom, which only the linker sees — see
 * {@link importedStateMutationApplies}.
 */
export interface ImportedStateMutation {
    /** The import specifier, as written. */
    readonly source: string;
    /** Exported name (no `$`). */
    readonly imported: string;
    /** The mutating method, for `$x.push(…)`-style changes. */
    readonly method?: string;
    /** The change goes through a property path (`$x.items.push(…)`), not the atom's own value. */
    readonly path: boolean;
    /** Message to report when it applies. */
    readonly message: string;
    readonly line: number;
    readonly column: number;
}
/**
 * The data atoms a module declares (name without `$` → initializer) — what an
 * importer's in-place change must not touch (E108 across modules). Works on any
 * module language: `.aktion` declares atoms with a bare `$x = []`.
 */
export declare function dataAtomInitializers(program: Program): Map<string, Expression>;
/**
 * Whether an importer's in-place change of an atom is E108, given the module
 * that exports the atom: it must be a data atom there, and a method call must
 * be one that mutates a value built that way.
 */
export declare function importedStateMutationApplies(mutation: ImportedStateMutation, exporter: Program): boolean;
/**
 * Positions of every `async` modifier in `source`. The parser accepts
 * `async function` as a no-op modifier and rejects `async` arrows and
 * function expressions, so neither leaves a trace in the AST; the tokens are
 * the only record. A property named `async` (`{ async: true }`, `o.async`) is
 * not a modifier.
 */
export declare function findAsyncModifiers(source: string): SourceLocation[];
/** Options for {@link checkJavaScriptSemantics}. */
export interface CheckJavaScriptOptions {
    /**
     * The module text the program was parsed from. Needed for E102 (`async`
     * modifiers leave no trace in the AST); without it that rule is skipped.
     */
    source?: string;
}
/**
 * Check a `.aktion.js` / `.aktion.ts` module for constructs whose Aktion
 * meaning differs from their JavaScript meaning (E101–E126, W201–W202).
 *
 * Run on the program as the author wrote it, after {@link normalizeComponentForms}.
 * Every diagnostic carries `path`, a stable `code` and the author's
 * line/column. Pure — `program` is not modified.
 */
export declare function checkJavaScriptSemantics(program: Program, path: string, options?: CheckJavaScriptOptions): LinkDiagnostic[];
/**
 * The in-place changes a module makes to IMPORTED `$` atoms. Whether each is
 * E108 depends on how the exporting module declares the atom, which only the
 * linker knows — it reports the ones whose exporter declares a data atom
 * (see {@link dataAtomNames}).
 */
export declare function collectImportedStateMutations(program: Program): ImportedStateMutation[];
/** The E102 diagnostic for an `async` modifier at `loc` — used when the module did not parse. */
export declare function asyncModifierDiagnostic(loc: SourceLocation, path: string): LinkDiagnostic;
/**
 * Lower a checked `.aktion.js` / `.aktion.ts` module so the evaluator computes
 * what JavaScript would:
 *
 *   - **W1** every binding that is not module-level — parameters, `let`/`const`
 *     in functions and nested blocks, loop and `catch` variables — gets a
 *     unique name `__l{n}_{name}`, and every reference resolved to it follows.
 *     Aktion keeps all of a function's locals in one flat map and lets a callee
 *     read its caller's locals, so without this a block's `let x` leaks out
 *     (S1), a local overwrites a module binding (S2), a helper reads its
 *     caller's variable (S3) and a parameter loses to a top-level function of
 *     the same name (S4). `$` names are never renamed (state is keyed by name);
 *     a renamed component parameter keeps its calling-convention name in
 *     `publicName` (R6), and an object-pattern slot pins its `sourceKey`.
 *   - **W2** a function declared inside another becomes
 *     `const __l{n}_name = function (…) {…}` at the same position (S8). Never
 *     hoisted: a lambda copies the locals that exist when it is created, so a
 *     hoisted one would lose every local declared above it.
 *   - **W3** every function body that does not end in `return`/`throw` gets a
 *     bare `return` (without `loc`, so coverage gains no phantom line), so
 *     falling off the end yields `undefined` instead of the last expression
 *     (S24).
 *
 * Mutates and returns `program` (the frontend owns the freshly parsed tree).
 * Run only on a module {@link checkJavaScriptSemantics} accepted.
 */
export declare function lowerJavaScriptSemantics(program: Program): Program;
