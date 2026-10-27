import { Plugin, UserConfig } from 'vite';
import { CompiledProgram, ModuleResolver, ModuleFrontends } from '../compiler/index.js';
import { TypeScriptFrontendOptions } from './typescript.js';
import { AktionDeclarationsOptions } from './declarations.js';
export { loadTypeScriptFrontend, createTypeScriptFrontend, tryLoadTypeScriptFrontend, tryCreateTypeScriptFrontend, unavailableTypeScriptFrontend, typeScriptFrontendFromEraser, computeSoftNewlines, checkErasureInvariant, MISSING_ERASER_MESSAGE, type TypeEraser, type TypeEraseResult, type TypeEraseDiagnostic, type TypeScriptFrontendOptions, } from './typescript.js';
export { aktionDeclarationText, aktionExportNames, declarationFileName, emitAktionDeclarations, updateAktionDeclaration, DECLARATION_HEADER, DEFAULT_DECLARATIONS_DIR, type AktionDeclarationsOptions, type AktionDeclarationsResult, } from './declarations.js';
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
     *
     * A relative target resolves against the working directory (`path.resolve`)
     * — for the build and, in the Vite plugin, for the `dts` declarations alike.
     * An `aktion.config.json` target resolves against the file's own directory.
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
     * Default: `[".aktion", ".aktion.ts", ".aktion.js", "/index.aktion",
     * "/index.aktion.ts", "/index.aktion.js"]`, so `"./lib/format"` finds
     * `lib/format.aktion` (or `.aktion.ts` / `.aktion.js`) and `"./lib"` finds
     * `lib/index.aktion`. Setting it REPLACES the list (an `aktion.config.json`
     * value too), so include the TypeScript / JavaScript suffixes if you want
     * them.
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
    /**
     * Compile `.aktion.ts` modules. On by default whenever the optional peer
     * `ts-blank-space` is installed (without it, each `.aktion.ts` module reports
     * "needs the `ts-blank-space` package"). Pass `{ eraser }` to plug in another
     * position-preserving type eraser, or `false` to refuse `.aktion.ts`.
     */
    typescript?: TypeScriptFrontendOptions | false;
    /**
     * Ship each module's original text with the compiled program
     * (`CompiledProgram.sourcesContent`) so DevTools can show the files — and
     * line numbers — the author wrote. Default: true. Turn off to trim
     * production bundles.
     */
    devtools?: boolean;
    /**
     * Write a `name.d.aktion.ts` declaration for every `.aktion` module — on
     * `buildStart`, and again whenever one changes under the dev server — so
     * `.aktion.ts` code that imports from `.aktion` files is type-checked
     * (see {@link emitAktionDeclarations}). `true` uses the defaults
     * (`src/**\/*.aktion` into `.aktion-types`, which needs
     * `"rootDirs": ["src", ".aktion-types/src"]` and `"allowArbitraryExtensions": true`
     * in the tsconfig). The modules of every {@link AktionResolveOptions.alias}
     * target are declared too, under `.aktion-types/<prefix>/`. Default: off.
     */
    dts?: boolean | Omit<AktionDeclarationsOptions, "root" | "write">;
}
/**
 * Config the plugin contributes:
 *
 *   - `optimizeDeps.exclude` for `aktion-runtime/dsl`: Vite's dependency scanner
 *     reads `.aktion.ts` files as plain TypeScript and tries to pre-bundle their
 *     imports, and the types-only `./dsl` subpath has nothing to bundle
 *     ("No known conditions for "./dsl" specifier");
 *   - an exclusion of `.aktion.ts` ids from Vite's own TypeScript transform
 *     (`esbuild` in Vite 5–7, `oxc` in Vite 8), which otherwise re-processes the
 *     plugin's output — re-parsing a large JSON blob and dropping unused
 *     imports. Setting `exclude` replaces the default (`/\.js$/`), so the
 *     default is restated unless the user already chose one.
 */
export declare function aktionViteConfig(user: UserConfig, viteMajor: number | undefined): UserConfig;
/**
 * Add to `vite.config.ts`:
 *
 *   import aktion from "aktion-runtime/vite";
 *   export default { plugins: [aktion()] };
 */
export declare function aktionPlugin(options?: AktionPluginOptions): Plugin;
/**
 * True for the ids of Aktion modules — `*.aktion`, `*.aktion.ts`, `*.aktion.js`
 * (query/hash stripped). Plain `*.ts` / `*.js` ids are native code and are left
 * to Vite. Exported for tests.
 */
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
    /**
     * Frontends per module language, merged over the defaults. The default
     * `typescript` frontend is created synchronously from `ts-blank-space`, which
     * needs Node ≥ 20.19 / 22.12 (`require` of an ES module); on older Node, or
     * to control the eraser, pass `typescript: await loadTypeScriptFrontend()` —
     * or use {@link compileAktionFileAsync} / {@link compileAktionSourceAsync}.
     */
    frontends?: ModuleFrontends;
    /** Include each module's original text (`CompiledProgram.sourcesContent`). Default: true. */
    sourcesContent?: boolean;
}
/**
 * Link an Aktion module from disk (`.aktion`, `.aktion.js` or `.aktion.ts`) into a {@link CompiledProgram}, without a
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
 * {@link compileAktionFile}, loading the TypeScript frontend asynchronously —
 * works on every Node version the plugin supports, including Node 18 where
 * `ts-blank-space` (an ES module) cannot be `require`d.
 */
export declare function compileAktionFileAsync(entryPath: string, options?: CompileOptions): Promise<CompiledProgram>;
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
 * {@link compileAktionSource}, loading the TypeScript frontend asynchronously
 * (see {@link compileAktionFileAsync}).
 */
export declare function compileAktionSourceAsync(source: string, virtualPath: string, options?: CompileOptions): Promise<CompiledProgram>;
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
