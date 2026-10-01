import { Program } from '../parser/types.js';
import { LinkDiagnostic, ModuleResolver } from './linker.js';
/**
 * Resolve an import specifier to a module key.
 *
 *   - `https://host/x.aktion`                       → itself (a remote module)
 *   - relative/absolute under a URL importer        → resolved against the URL
 *   - `/components/Button.aktion` (project root)    → `components/Button.aktion`
 *   - `./Button.aktion` from `app.aktion`           → `Button.aktion`
 *   - `../Button.aktion` from `components/App.aktion`→ `Button.aktion`
 *   - bare `lodash`                                 → `null` (unresolved)
 */
export declare function resolveSpecifier(spec: string, importerPath: string): string | null;
/** A sync `ModuleResolver` backed by a complete in-memory `{ path → source }` map. */
export declare function createMemoryResolver(files: Readonly<Record<string, string>>): ModuleResolver;
export interface LinkProjectOptions {
    /** Entry module key (must exist in `files`), e.g. `"app.aktion"`. */
    entry: string;
    /** In-memory project files, keyed by path. */
    files: Readonly<Record<string, string>>;
    /**
     * Fetch a remote module's text. Defaults to the global `fetch`. Override in
     * tests / hosts that want a custom transport or to disable remote loading.
     */
    fetch?: (url: string) => Promise<string>;
}
export interface LinkProjectResult {
    /** The merged, scope-renamed program. */
    program: Program;
    /** Re-emitted source of the merged program (for `mountCompiled` round-trips). */
    source: string;
    /** Linker + fetch diagnostics. */
    diagnostics: LinkDiagnostic[];
    /** Resolved paths/URLs of the imported modules (excludes the entry). */
    dependencies: string[];
}
/**
 * Link an in-memory project (entry + files) into a single `CompiledProgram`-
 * ready `Program`, fetching any `https://…` imports along the way.
 *
 * The walk is async only because of URL fetches — a project with no URL imports
 * resolves on a single microtask. URL-fetch failures become diagnostics (the
 * rest of the graph still links) rather than thrown errors.
 */
export declare function linkProject(options: LinkProjectOptions): Promise<LinkProjectResult>;
