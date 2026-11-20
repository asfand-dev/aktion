import { Program } from '../parser/types.js';
import { LinkDiagnostic } from './linker.js';
import { ModuleLanguage } from './module-kind.js';
import { ImportedStateMutation } from './js-semantics.js';
export { DSL_MODULE_ID } from './module-kind.js';
export interface FrontendResult {
    /**
     * The parsed program. Its `loc`s are positions in the ORIGINAL file the
     * author wrote (erasing frontends never move a character). Parse errors live
     * in `program.errors`, exactly as `parse()` reports them.
     */
    program: Program;
    /** Frontend-specific diagnostics: erasure errors, JS-semantics violations. */
    diagnostics: LinkDiagnostic[];
    /**
     * The Aktion text that was parsed. Same length and same line breaks as the
     * input for erasing frontends, so it can be shown, linted or re-parsed in
     * place of the original.
     */
    aktionSource: string;
    /**
     * In-place changes of IMPORTED `$` atoms (JavaScript-shaped modules only).
     * Whether each is E108 depends on how the exporting module declares the
     * atom, so the linker decides once the graph is loaded.
     */
    importedStateMutations?: ImportedStateMutation[];
}
export interface ModuleFrontend {
    readonly language: ModuleLanguage;
    /** Compile one module. MUST NOT throw for bad input — report diagnostics instead. */
    compile(source: string, path: string): FrontendResult;
}
/** Frontends keyed by language — what `linkProgram` / `linkProject` accept. */
export type ModuleFrontends = Readonly<Partial<Record<ModuleLanguage, ModuleFrontend>>>;
/** `.aktion`: the DSL itself, parsed as-is. */
export declare const aktionFrontend: ModuleFrontend;
/** Options for {@link compileJavaScriptModule}. */
export interface CompileJavaScriptOptions {
    /**
     * Offsets of `\n` characters that must not end a statement — newlines the
     * TypeScript frontend left behind inside erased type ranges. See
     * `ParseOptions.softNewlines`.
     */
    softNewlines?: ReadonlySet<number>;
}
/**
 * The JavaScript pipeline shared by the `.aktion.js` and `.aktion.ts`
 * frontends:
 *
 *   parse → W4 (normalise component forms) → checks → W1–W3 (rewrites)
 *
 * The checks run on the AST as the author wrote it (after W4, which only
 * re-classifies `const Name = () => …` as a component), so every diagnostic
 * points at code the author can see. The rewrites keep every original `loc`.
 */
export declare function compileJavaScriptModule(code: string, path: string, options?: CompileJavaScriptOptions): FrontendResult;
/** `.aktion.js`: JavaScript that keeps to the Aktion subset. */
export declare const javascriptFrontend: ModuleFrontend;
/**
 * The frontends available without a TypeScript parser — everything the
 * browser bundle can compile. Pass a `typescript` frontend (from
 * `aktion-runtime/vite`) alongside these to link `.aktion.ts` modules.
 */
export declare const defaultFrontends: ModuleFrontends;
