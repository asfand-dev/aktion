import { ModuleFrontend } from '../compiler/frontend.js';
/** One diagnostic from a {@link TypeEraser}. Positions are 1-based. */
export interface TypeEraseDiagnostic {
    line: number;
    column: number;
    message: string;
    /** Stable code — `AKT-TS-ERASE` for non-erasable syntax, `AKT-TS-SYNTAX` for TypeScript syntax errors. */
    code?: string;
}
export interface TypeEraseResult {
    /**
     * JavaScript text with every type-only range replaced by spaces. Newlines are
     * kept, so `code.length === source.length` and every `\n` is where it was.
     */
    code: string;
    /** Non-erasable syntax and TypeScript syntax errors, each with its own position. */
    diagnostics: TypeEraseDiagnostic[];
}
/** Turn TypeScript into same-length JavaScript (see {@link TypeEraseResult}). Must not throw. */
export type TypeEraser = (source: string, path: string) => TypeEraseResult;
export interface TypeScriptFrontendOptions {
    /** Replace the default `ts-blank-space` eraser. */
    eraser?: TypeEraser;
}
/** The message every "install ts-blank-space" path shares. */
export declare const MISSING_ERASER_MESSAGE = "Compiling `.aktion.ts` needs the `ts-blank-space` package \u2014 `npm i -D ts-blank-space`.";
/**
 * Report why `code` cannot stand in for `source` position-for-position, or
 * `null` when it can. An eraser that moved a line break would mis-attribute
 * every diagnostic after it, which is worse than refusing the module.
 */
export declare function checkErasureInvariant(source: string, code: string): string | null;
/**
 * Offsets of the `\n` characters that sit INSIDE an erased type range.
 *
 * Aktion ends a statement at a newline in places where JavaScript does not, so
 * a line break the eraser left behind can split a statement: erased
 * `const x = foo<⏎ Bar⏎>(1)` would read as `x = foo` followed by `(1)`. A
 * newline is soft when the nearest non-whitespace character before it AND the
 * nearest one after it were both erased (changed by the eraser) — it is then
 * surrounded by type syntax. The parser lexes soft newlines as whitespace
 * while still counting the line, so positions stay exact.
 *
 * A newline after a fully erased statement (`type A = {…}`) stays hard: the
 * character after it belongs to the next statement and was not erased.
 */
export declare function computeSoftNewlines(source: string, code: string): Set<number>;
/** A `typescript` frontend over any {@link TypeEraser}. */
export declare function typeScriptFrontendFromEraser(eraser: TypeEraser): ModuleFrontend;
/**
 * A stand-in `typescript` frontend that reports one diagnostic per module —
 * used when `ts-blank-space` is not installed, so a project that never writes
 * `.aktion.ts` never needs it, and one that does gets told what to install.
 */
export declare function unavailableTypeScriptFrontend(message?: string): ModuleFrontend;
/**
 * Load the default `typescript` frontend. Asynchronous because `ts-blank-space`
 * is an ES module, and `import()` is the only way to load one on every Node
 * version the plugin supports (≥ 18). Rejects when `ts-blank-space` is missing.
 */
export declare function loadTypeScriptFrontend(options?: TypeScriptFrontendOptions): Promise<ModuleFrontend>;
/**
 * Synchronous variant of {@link loadTypeScriptFrontend} for synchronous APIs
 * (`compileAktionFile`, `compileAktionSource`). It needs `require()` of an ES
 * module, which Node supports from 20.19 / 22.12; on older Node it throws, and
 * callers should `await loadTypeScriptFrontend()` instead.
 */
export declare function createTypeScriptFrontend(options?: TypeScriptFrontendOptions): ModuleFrontend;
/**
 * The `typescript` frontend if `ts-blank-space` can be loaded, otherwise the
 * {@link unavailableTypeScriptFrontend} stub. Never throws.
 */
export declare function tryLoadTypeScriptFrontend(options?: TypeScriptFrontendOptions): Promise<ModuleFrontend>;
/** Synchronous {@link tryLoadTypeScriptFrontend}: the real frontend where Node can `require()` it, otherwise the stub. */
export declare function tryCreateTypeScriptFrontend(options?: TypeScriptFrontendOptions): ModuleFrontend;
