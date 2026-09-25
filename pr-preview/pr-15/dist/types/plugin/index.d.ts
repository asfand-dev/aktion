import { Plugin } from 'vite';
import { CompiledProgram, ModuleResolver } from '../compiler/index.js';
/**
 * How a `.aktion` import specifier becomes a file on disk.
 *
 * Shared by the Vite plugin, {@link compileAktionFile} / {@link compileAktionSource},
 * and the `tools/validate-aktion*.mjs` validators, so that building a tree and
 * validating it agree on what resolves. A validator that accepted an import the
 * build then rejected — or the reverse — is worse than no validator.
 *
 * Every field can also be declared once per repository in an `aktion.config.json`
 * (see {@link loadAktionConfig}), which is what a monorepo normally wants.
 */
export interface AktionResolveOptions {
    /**
     * Bare-specifier prefixes mapped to directories, so shared modules are imported
     * by name instead of by a `../../../..` chain:
     *
     * ```ts
     * aktion({ alias: { "@acme/ui": resolve(import.meta.dirname, "../../libs/ui/src") } })
     * ```
     * ```
     * import { Button } from "@acme/ui/button.aktion"
     * ```
     *
     * The longest matching prefix wins, so `@acme/ui/forms` can be aliased
     * separately from `@acme/ui`. Each target directory becomes an allowed root,
     * and an aliased import may not climb out of the target it matched — so an
     * alias widens resolution by exactly the directory it names and no further.
     */
    alias?: Record<string, string>;
    /**
     * Extra directories `.aktion` imports may resolve into, on top of the project
     * root. Use for a monorepo package that is imported by relative path rather
     * than through an {@link alias}.
     */
    roots?: string[];
    /**
     * Suffixes tried when a specifier names no file directly.
     * Default: `[".aktion", "/index.aktion"]`, so `"./lib/format"` finds
     * `lib/format.aktion` and `"./lib"` finds `lib/index.aktion`.
     */
    extensions?: string[];
}
export interface AktionPluginOptions extends AktionResolveOptions {
    /** Treat linker warnings (e.g. a missing `aktion` entry) as build errors. Default: false. */
    strict?: boolean;
    /** Specifier the emitted module imports the runtime helper from. Default: `"aktion-runtime"`. */
    runtimeModuleId?: string;
    /**
     * Allow `.aktion` imports to resolve outside the Vite project root.
     *
     * Off by default: an import is a filesystem read performed by the build (and,
     * in `serve` mode, one whose result reaches the browser), so it is confined to
     * the project. Prefer {@link AktionResolveOptions.alias} or
     * {@link AktionResolveOptions.roots}, which widen resolution by a named
     * directory instead of removing the boundary altogether; this flag remains for
     * the case where the set of sibling packages is not known ahead of time.
     */
    allowOutsideRoot?: boolean;
    /**
     * Look for an `aktion.config.json` above the Vite project root and merge it
     * under the options passed here. Default: true. Set `false` to pin resolution
     * to this config object alone.
     */
    config?: boolean;
}
/**
 * Add to `vite.config.ts`:
 *
 *   import aktion from "aktion-runtime/vite";
 *   export default { plugins: [aktion()] };
 */
export declare function aktionPlugin(options?: AktionPluginOptions): Plugin;
/** True for `*.aktion` ids (query/hash stripped). Exported for tests. */
export declare function isAktionId(id: string): boolean;
export { aktionPlugin as default };
export interface CompileOptions extends AktionResolveOptions {
    /**
     * Directory `.aktion` imports are confined to. Defaults to the entry's own
     * directory — widen it to your project root when modules import across it.
     * Pass `null` to lift the restriction entirely (trusted sources only).
     */
    root?: string | null;
    /** Reject on any linker warning, not just errors. */
    strict?: boolean;
    /**
     * Merge an `aktion.config.json` found above the entry. Default: true, so a
     * test that compiles one module of a monorepo app resolves the same aliases
     * the build does without restating them.
     */
    config?: boolean;
}
/**
 * Link a `.aktion` file from disk into a {@link CompiledProgram}, without a
 * bundler.
 *
 * The Vite plugin is normally what produces this artefact, which leaves anything
 * outside a Vite build — a test runner, an SSR pass, a CLI, a lint rule —
 * reimplementing the linker call and its resolver. Both are here already, so both
 * are exported.
 *
 * ```ts
 * import { compileAktionFile } from "aktion-runtime/vite";
 * import { renderCompiled } from "aktion-runtime/test";
 *
 * const app = compileAktionFile("src/app.aktion", { root: "src" });
 * const screen = renderCompiled(app);
 * ```
 *
 * Node-only (it reads the filesystem) — this module never enters a browser
 * bundle.
 *
 * @throws If a module cannot be resolved or loaded, or the graph has a parse
 *   error. The message lists every diagnostic with its position.
 */
export declare function compileAktionFile(entryPath: string, options?: CompileOptions): CompiledProgram;
/**
 * Link an in-memory program whose imports resolve against the real filesystem,
 * relative to `virtualPath`.
 *
 * This is what makes a *helper module* directly testable. A `.aktion` library
 * file exports functions that only a program can call, so exercising one used to
 * mean adding a fixture file per case. Instead, write the program inline:
 *
 * ```ts
 * const probe = compileAktionSource(
 *   `import { formatBytes } from "../src/lib/format.aktion"\n` +
 *   `$app(Text(formatBytes(2048)))`,
 *   "tests/inline.aktion",
 *   { root: process.cwd() },
 * );
 * ```
 *
 * Because coverage is keyed by module path, hits from a probe like this land on
 * the real `format.aktion` — so unit-testing a helper counts towards its file's
 * coverage exactly as calling it through the UI does.
 *
 * `virtualPath` need not exist; only its directory is used, to resolve relative
 * specifiers.
 */
export declare function compileAktionSource(source: string, virtualPath: string, options?: CompileOptions): CompiledProgram;
/**
 * True when `candidate` is `root` or sits underneath it.
 *
 * The separator matters: a bare `startsWith(root)` also accepts a sibling whose
 * name merely begins with the root's (`/srv/app` vs `/srv/app-secrets`).
 */
export declare function isInsideRoot(candidate: string, root: string): boolean;
/**
 * A `ModuleResolver` over the Node filesystem (absolute paths, sync reads).
 *
 * Exported because every Node host that touches the `.aktion` module graph — the
 * Vite plugin, {@link compileAktionFile}, the `tools/validate-aktion*.mjs`
 * validators, a CI gate, an SSR pass — needs the *same* answer to "what does this
 * specifier point at". Reimplementing it per host is how a validator drifts into
 * accepting imports the build rejects.
 *
 * Resolution order for a specifier:
 *
 *   1. the longest matching {@link AktionResolveOptions.alias} prefix, joined
 *      with the remainder of the specifier;
 *   2. otherwise a relative (`./`, `../`) or absolute (`/`) path against the
 *      importer's directory;
 *   3. otherwise unresolved — a bare specifier with no alias is not a project
 *      module.
 *
 * The result is then extension-completed ({@link AktionResolveOptions.extensions})
 * and must name a real file.
 *
 * **Containment.** When `root` is non-null every resolved path must sit inside
 * `root`, one of {@link AktionResolveOptions.roots}, or an alias target. `.aktion`
 * files are project source, but they are also *data* that may have arrived with an
 * untrusted repository — and a specifier like `../../../../etc/passwd` (or an
 * absolute `/etc/passwd`) would otherwise be read and, under `vite dev`, served to
 * the browser as part of the compiled module. An aliased import is additionally
 * confined to the target it matched, so declaring an alias widens resolution by
 * exactly that directory.
 */
export declare function createNodeResolver(options?: AktionResolveOptions & {
    root?: string | null;
}): ModuleResolver;
/** The subset of `aktion.config.json` that affects module resolution. */
export interface AktionConfig extends AktionResolveOptions {
    /** Absolute path of the file these values came from. */
    configPath?: string;
}
/**
 * Find the nearest `aktion.config.json` at or above `from` and read its
 * resolution settings, with every `alias` target and `roots` entry resolved
 * against the config file's own directory.
 *
 * One file at the top of a monorepo is what lets a build, a test, and
 * `validate-aktion-app` agree on the import graph without each restating it:
 *
 * ```json
 * { "alias": { "@acme/ui": "./libs/ui/src" } }
 * ```
 *
 * Returns `null` when no config exists, when it is unreadable, or when it is not
 * valid JSON — resolution then falls back to the caller's own options, which is
 * the pre-config behaviour. A malformed config must not be able to fail a build
 * that never asked for one.
 */
export declare function loadAktionConfig(from: string): AktionConfig | null;
/**
 * Overlay explicit options on a discovered config: `alias` merges key-wise with
 * the caller winning, `roots` concatenate, `extensions` is replaced outright.
 */
export declare function mergeResolveOptions(base: AktionResolveOptions | null, override: AktionResolveOptions): AktionResolveOptions;
