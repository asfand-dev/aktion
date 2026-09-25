import { Program } from '../parser/types.js';
/**
 * The symbol a module-local name is renamed to when it is merged into the linked
 * program: `total` in module 3 becomes `__a3_total`.
 *
 * Exported because the mangling is observable — `serializeState()` returns these
 * keys, so a test or devtool inspecting a multi-file program's `$state` sees
 * `__a3_total`, not `total`. {@link moduleLocalBaseName} is the inverse, and is
 * what lets a caller work in the names the author actually wrote.
 */
export declare function moduleLocalSymbol(moduleId: number, name: string): string;
/**
 * Recover the name an author wrote from a linker-renamed symbol, or `null` if
 * `symbol` is not one.
 *
 * ```ts
 * moduleLocalBaseName("__a3_total"); // "total"
 * moduleLocalBaseName("total");      // null — an entry-module name, unrenamed
 * ```
 *
 * Note the module id is not stable across edits: it comes from import traversal
 * order, so a new import can renumber every module. Resolve by base name rather
 * than hard-coding a mangled symbol.
 */
export declare function moduleLocalBaseName(symbol: string): string | null;
/** A single linker diagnostic. Positions are 1-indexed, matching `loc`. */
export interface LinkDiagnostic {
    line: number;
    column: number;
    message: string;
    severity: "error" | "warning";
}
/** Injected so the linker is host-agnostic (filesystem, in-memory, URL cache). */
export interface ModuleResolver {
    /** Resolve a specifier relative to the importer; `null` = unresolved. */
    resolve(spec: string, importerPath: string): string | null;
    /** Load module text by resolved (absolute) path. Throws if missing. */
    load(path: string): string;
}
export interface LinkResult {
    /** The merged, scope-renamed program (import statements dropped). */
    program: Program;
    /** Linker errors: unresolved import, missing export, dep load/parse errors. */
    diagnostics: LinkDiagnostic[];
    /** Resolved paths of the imported modules (excludes the entry). */
    dependencies: string[];
}
/**
 * Link the import graph rooted at `entrySource`/`entryPath` into one program.
 */
export declare function linkProgram(entrySource: string, entryPath: string, resolver: ModuleResolver): LinkResult;
