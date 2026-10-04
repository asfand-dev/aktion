import { Program } from '../parser/types.js';
import { ModuleFrontends } from './frontend.js';
import { ModuleLanguage } from './module-kind.js';
export { moduleLocalBaseName, moduleLocalSymbol } from '../parser/module-symbols.js';
/** A single linker diagnostic. Positions are 1-indexed, matching `loc`. */
export interface LinkDiagnostic {
    line: number;
    column: number;
    message: string;
    severity: "error" | "warning";
    /**
     * The module the position refers to (a resolved module key / path). The
     * linker sets it on every diagnostic it emits; an absent `path` means the
     * entry. Non-entry messages additionally keep their `"<path>: "` prefix so
     * text-only consumers stay informative.
     */
    path?: string;
    /**
     * Stable rule code — `E1xx` / `W2xx` for the JS-semantics rules of
     * `.aktion.js` / `.aktion.ts` modules, `AKT-LINK-*` for linker rules. Tests
     * and docs refer to these; messages may be reworded, codes are not.
     */
    code?: string;
}
/** Injected so the linker is host-agnostic (filesystem, in-memory, URL cache). */
export interface ModuleResolver {
    /** Resolve a specifier relative to the importer; `null` = unresolved. */
    resolve(spec: string, importerPath: string): string | null;
    /** Load module text by resolved (absolute) path. Throws if missing. */
    load(path: string): string;
    /**
     * Optional: why `resolve(spec, importerPath)` returned `null`, appended to the
     * linker's "Cannot resolve import" diagnostic — e.g. two sibling Aktion
     * modules with the same base name, or a path outside the project root.
     */
    explain?(spec: string, importerPath: string): string | undefined;
}
/** Options for {@link linkProgram}. */
export interface LinkOptions {
    /**
     * How each module language is compiled. Defaults to `defaultFrontends`
     * (`.aktion` and `.aktion.js`, both browser-safe). Pass a `typescript`
     * frontend — `loadTypeScriptFrontend()` from `aktion-runtime/vite` — to link
     * `.aktion.ts` modules.
     */
    frontends?: ModuleFrontends;
}
/** One linked module, in `program.sources` order (index 0 is the entry). */
export interface LinkedModule {
    /** Resolved module key / path. */
    path: string;
    language: ModuleLanguage;
    /** The text the resolver returned (or the entry text passed in). */
    originalSource: string;
    /** The Aktion text the frontend parsed — identical to `originalSource` for `.aktion`. */
    aktionSource: string;
}
export interface LinkResult {
    /** The merged, scope-renamed program (import statements dropped). */
    program: Program;
    /** Linker errors: unresolved import, missing export, dep load/parse errors. */
    diagnostics: LinkDiagnostic[];
    /** Resolved paths of the imported modules (excludes the entry). */
    dependencies: string[];
    /**
     * Every module that was linked, in `program.sources` order. Validators,
     * DevTools and lint passes read each module's text from here instead of
     * re-reading files — for a `.aktion.ts` module the parsed text is not the
     * file's text.
     */
    modules: LinkedModule[];
}
/**
 * Message for an import of native code (`./utils.ts`, `./helpers.js`).
 *
 * Exported so the docs and tests quote one source of truth.
 */
export declare function nativeImportMessage(spec: string, resolvedPath: string): string;
/**
 * Link the import graph rooted at `entrySource`/`entryPath` into one program.
 *
 * Each module is compiled by the frontend for its language
 * (`moduleLanguage(path)`, see `./module-kind.ts`); the entry's language comes
 * from `entryPath` the same way, except that an entry with a native extension
 * (`app.js`) is still linked as Aktion — with a deprecation warning — so hosts
 * that load programs from `.js` URLs keep working. Imports of native code are
 * rejected, never read.
 */
export declare function linkProgram(entrySource: string, entryPath: string, resolver: ModuleResolver, options?: LinkOptions): LinkResult;
