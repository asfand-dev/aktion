/**
 * `aktion-runtime/vite` — the Vite/Rollup plugin for Aktion modules: `.aktion`,
 * `.aktion.js` and `.aktion.ts`.
 *
 * It compiles each entry module at build time by running the browser-safe
 * {@link linkProgram} (the same linker the in-page `linkProject` uses) over a
 * Node-filesystem resolver, then emits a tiny ES module that default-exports a
 * `CompiledProgram`. So `import app from "./app.aktion"` (or `"./app.aktion.ts"`)
 * gives you the pre-parsed, schema-aware, cross-file-linked program —
 * `el.mountCompiled(app)` renders it without the parser ever running in the
 * browser.
 *
 * `.aktion.ts` modules are compiled by the TypeScript frontend
 * (`./typescript.ts`), which erases types without moving a character and hands
 * the result to the same pipeline as `.aktion.js`.
 *
 * This is the ONLY module that imports `vite`/`node:*`; it ships as a separate
 * Node entry (`dist/plugin.{js,cjs}`) and never enters the browser bundle.
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, relative as relativePath, resolve as resolvePath, sep } from "node:path";
import type { Plugin, UserConfig } from "vite";
import {
  linkProgram,
  defineCompiledProgram,
  defaultFrontends,
  isAktionModulePath,
  stripQuery,
  AKTION_MODULE_SUFFIXES,
  COMPILED_PROGRAM_VERSION,
  DSL_MODULE_ID,
  type CompiledProgram,
  type ModuleResolver,
  type LinkDiagnostic,
  type LinkResult,
  type ModuleFrontend,
  type ModuleFrontends,
} from "../compiler/index.js";
import { parse } from "../parser/index.js";
import type { Program } from "../parser/types.js";
import { printProgram } from "../tooling/formatter.js";
import {
  tryCreateTypeScriptFrontend,
  tryLoadTypeScriptFrontend,
  unavailableTypeScriptFrontend,
  type TypeScriptFrontendOptions,
} from "./typescript.js";
import {
  aktionExportNames,
  emitAktionDeclarations,
  updateAktionDeclaration,
  type AktionDeclarationsOptions,
} from "./declarations.js";

export {
  loadTypeScriptFrontend,
  createTypeScriptFrontend,
  tryLoadTypeScriptFrontend,
  tryCreateTypeScriptFrontend,
  unavailableTypeScriptFrontend,
  typeScriptFrontendFromEraser,
  computeSoftNewlines,
  checkErasureInvariant,
  MISSING_ERASER_MESSAGE,
  type TypeEraser,
  type TypeEraseResult,
  type TypeEraseDiagnostic,
  type TypeScriptFrontendOptions,
} from "./typescript.js";

export {
  aktionDeclarationText,
  aktionExportNames,
  declarationFileName,
  emitAktionDeclarations,
  updateAktionDeclaration,
  DECLARATION_HEADER,
  DEFAULT_DECLARATIONS_DIR,
  type AktionDeclarationsOptions,
  type AktionDeclarationsResult,
} from "./declarations.js";

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

/** Message for `.aktion.ts` modules when the plugin was configured with `typescript: false`. */
const TYPESCRIPT_DISABLED_MESSAGE =
  "`.aktion.ts` modules are disabled by the plugin option `typescript: false`.";

/**
 * Vite's asset queries: `?raw` (the file's text), `?url`, `?inline`, `?worker`.
 * Such an import asks for the file itself, not the compiled module, and Vite's
 * own plugins answer it.
 */
const VITE_ASSET_QUERY = /[?&](?:raw|url|inline|no-inline|worker|sharedworker)(?:[=&#]|$)/;

/**
 * Id filter matching every Aktion module (query/hash allowed), except an asset
 * import of one. One RegExp rather than `{ include, exclude }`, which Rollup
 * before 4.38 and Vite before 6.3 do not understand.
 */
const AKTION_ID_FILTER = new RegExp(`^(?!.*${VITE_ASSET_QUERY.source}).*\\.aktion(?:\\.[jt]s)?(?:[?#]|$)`);

/** `.aktion.ts` ids, for Vite's own TypeScript transform to skip. */
const AKTION_TS_ID = /\.aktion\.ts(?:[?#]|$)/;

/** The Vite major version, from `this.meta.viteVersion` (Vite 7+) — `undefined` means 5 or 6. */
function viteMajorOf(ctx: unknown): number | undefined {
  const version = (ctx as { meta?: { viteVersion?: unknown } } | undefined)?.meta?.viteVersion;
  if (typeof version !== "string") return undefined;
  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) ? major : undefined;
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
export function aktionViteConfig(user: UserConfig, viteMajor: number | undefined): UserConfig {
  const out: Record<string, unknown> = { optimizeDeps: { exclude: [DSL_MODULE_ID, `${DSL_MODULE_ID}-globals`] } };
  const key = viteMajor !== undefined && viteMajor >= 8 ? "oxc" : "esbuild";
  const current = (user as Record<string, unknown>)[key];
  if (current !== false) {
    const userExclude =
      current && typeof current === "object" ? (current as { exclude?: unknown }).exclude : undefined;
    out[key] = { exclude: userExclude === undefined ? [/\.js$/, AKTION_TS_ID] : [AKTION_TS_ID] };
  }
  return out as UserConfig;
}

/**
 * Add to `vite.config.ts`:
 *
 *   import aktion from "aktion-runtime/vite";
 *   export default { plugins: [aktion()] };
 */
export function aktionPlugin(options: AktionPluginOptions = {}): Plugin {
  const runtimeModuleId = options.runtimeModuleId ?? "aktion-runtime";
  let isServe = false;
  let projectRoot = process.cwd();
  let resolution: AktionResolveOptions = options;
  let typescriptFrontend: Promise<ModuleFrontend> | null = null;

  const declarationOptions = (): Omit<AktionDeclarationsOptions, "root" | "write"> =>
    typeof options.dts === "object" ? options.dts : {};

  // Loaded once per plugin instance: eagerly in `buildStart`, and on demand in
  // `transform` for hosts that never call `buildStart` before transforming.
  const loadTypeScript = (): Promise<ModuleFrontend> => {
    if (options.typescript === false) return Promise.resolve(unavailableTypeScriptFrontend(TYPESCRIPT_DISABLED_MESSAGE));
    typescriptFrontend ??= tryLoadTypeScriptFrontend(options.typescript ?? {});
    return typescriptFrontend;
  };

  const transform = {
    // Vite ≥ 6.3 / Rollup ≥ 4.38 skip non-matching ids before calling the
    // handler; Vite 5's dev server ignores `filter`, so the handler re-checks.
    filter: { id: AKTION_ID_FILTER },
    async handler(this: TransformContext, code: string, id: string) {
      if (!isAktionId(id) || VITE_ASSET_QUERY.test(id)) return null;
      const cleanId = stripQuery(id);
      const frontends: ModuleFrontends = { ...defaultFrontends, typescript: await loadTypeScript() };

      const result = linkProgram(
        code,
        cleanId,
        createNodeResolver({
          ...resolution,
          root: options.allowOutsideRoot === true ? null : projectRoot,
        }),
        { frontends },
      );

      // Editing an imported module must re-trigger the entry's transform.
      for (const dep of result.dependencies) this.addWatchFile(dep);

      const diagnostics = collectDiagnostics(result.program, result.diagnostics);
      const fatal = diagnostics.filter((d) => d.severity === "error" || (options.strict && d.severity === "warning"));
      if (fatal.length > 0) {
        const first = fatal[0]!;
        const file = first.path ?? cleanId;
        return this.error({
          message: fatal.length === 1 ? first.message : fatal.map(formatDiagnostic).join("\n"),
          id: file,
          loc: { file, line: first.line, column: first.column },
        });
      }
      for (const w of diagnostics) {
        if (w.severity === "warning") this.warn(w.message);
      }

      const moduleCode =
        emitModule(result, code, cleanId, runtimeModuleId, { sourcesContent: options.devtools !== false }) +
        (isServe ? hostOnlyExports(result, displayPath(cleanId, projectRoot)) + HMR_FOOTER : "");
      // `moduleType: "js"`: Vite 8 (Rolldown) otherwise treats an `.aktion.ts`
      // id as TypeScript by its extension even after the oxc transform is
      // excluded. Rollup-based Vite ignores the field.
      return { code: moduleCode, map: buildSourceMap(moduleCode, cleanId, code), moduleType: "js" };
    },
  };

  const plugin = {
    name: "aktion",
    enforce: "pre" as const,
    config(this: unknown, user: UserConfig): UserConfig {
      return aktionViteConfig(user, viteMajorOf(this));
    },
    configResolved(config: { command: string; root?: string }) {
      isServe = config.command === "serve";
      // Confine `.aktion` imports to the project. Without a root, a crafted
      // import in a `.aktion` file reads any file the dev-server process can —
      // and in `serve` mode its contents are then handed to the browser.
      if (config.root) projectRoot = resolvePath(config.root);
      // A monorepo declares its shared `.aktion` packages once, in a config file
      // the validators read too — so the build and `validate-aktion-app` cannot
      // disagree about which imports exist.
      resolution =
        options.config === false ? options : mergeResolveOptions(loadAktionConfig(projectRoot), options);
    },
    async buildStart(this: { warn?: (message: string) => void }) {
      await loadTypeScript();
      if (options.dts) {
        const result = emitAktionDeclarations({ alias: resolution.alias, ...declarationOptions(), root: projectRoot });
        for (const w of result.warnings) this.warn?.(w);
        for (const d of result.diagnostics) this.warn?.(`${d.path}:${d.line}:${d.column} ${d.message}`);
      }
    },
    // Host code receives only an Aktion module's default export (the compiled
    // program): its other exports live inside Aktion programs, which the linker
    // inlines. A named import from host code would otherwise fail as a bare
    // "is not exported" — say why instead. Rollup builds only: the dev server
    // does not call `moduleParsed`, Rolldown (Vite 8) throws "UNSUPPORTED:
    // ModuleInfo#ast" on reading the AST and keeps its own missing-export
    // error, and in serve mode the emitted module carries stand-ins that fail
    // with the same explanation when used.
    async moduleParsed(this: ModuleParsedContext, info: { id: string; ast?: unknown }) {
      if (isServe || isAktionId(info.id)) return;
      let ast: EsProgram | null;
      try {
        ast = (info.ast ?? null) as EsProgram | null;
      } catch {
        return;
      }
      for (const node of ast?.body ?? []) {
        if (node.type !== "ImportDeclaration" && !(node.type === "ExportNamedDeclaration" && node.source)) continue;
        const source = node.source?.value;
        if (typeof source !== "string" || !source.includes(".aktion")) continue;
        const named = (node.specifiers ?? []).map(specifierName).filter((n): n is string => n !== null);
        if (named.length === 0) continue;
        const resolved = await this.resolve(source, info.id);
        if (!resolved || !isAktionId(resolved.id) || VITE_ASSET_QUERY.test(resolved.id)) continue;
        this.error(hostImportMessage(named, source, displayPath(info.id, projectRoot)));
      }
    },
    configureServer(server: { watcher?: { on(event: string, listener: (file: string) => void): unknown } }) {
      if (!options.dts || !server.watcher) return;
      const refresh = (file: string): void => {
        if (/\.aktion$/i.test(file)) {
          updateAktionDeclaration(file, { alias: resolution.alias, ...declarationOptions(), root: projectRoot });
        }
      };
      server.watcher.on("add", refresh);
      server.watcher.on("change", refresh);
      server.watcher.on("unlink", refresh);
    },
    transform,
  };
  return plugin as unknown as Plugin;
}

/** The slice of Rollup's plugin context `moduleParsed` uses. */
interface ModuleParsedContext {
  resolve(source: string, importer: string): Promise<{ id: string } | null>;
  error(message: string): never;
}

/** The slice of an ESTree `Program` `moduleParsed` reads. */
interface EsProgram {
  body?: Array<{ type: string; source?: { value?: unknown } | null; specifiers?: EsSpecifier[] }>;
}

interface EsSpecifier {
  type: string;
  imported?: { name?: string; value?: string };
  local?: { name?: string; value?: string };
}

/** The binding an import or re-export specifier takes from its module; `null` for the default or a namespace. */
function specifierName(spec: EsSpecifier): string | null {
  if (spec.type === "ImportDefaultSpecifier" || spec.type === "ImportNamespaceSpecifier") return null;
  // `import { x as y }` takes `imported`; `export { x as y } from` takes `local`.
  const ref = spec.type === "ImportSpecifier" ? spec.imported : spec.local;
  const name = ref?.name ?? ref?.value;
  return name === undefined || name === "default" ? null : name;
}

/** `id` relative to the project root (`/`-separated) when it is inside it, else as given. */
function displayPath(id: string, root: string): string {
  return isInsideRoot(id, root) ? relativePath(root, id).split(sep).join("/") : id;
}

/**
 * Why a host module cannot import named bindings from an Aktion module. No
 * `[aktion]` prefix: Rollup already names the plugin (`[plugin aktion]`).
 */
function hostImportMessage(names: readonly string[], source: string, importer: string): string {
  return (
    `${importer} imports ${names.map((n) => `\`${n}\``).join(", ")} from "${source}", but an Aktion ` +
    `module gives host code only its compiled program: \`import app from "${source}"\`. Its other exports ` +
    "exist inside Aktion programs — exercise them through a program (compileAktionSource from aktion-runtime/vite)."
  );
}

/** The slice of Rollup's plugin context `transform` uses. */
interface TransformContext {
  addWatchFile(id: string): void;
  warn(message: string): void;
  error(error: { message: string; id?: string; loc?: { file?: string; line: number; column: number } }): never;
}

/** `path:line:column message` for multi-error build failures. */
function formatDiagnostic(d: LinkDiagnostic): string {
  const where = d.path ? `${d.path}:${d.line}:${d.column}` : `${d.line}:${d.column}`;
  const message = d.path && d.message.startsWith(`${d.path}: `) ? d.message.slice(d.path.length + 2) : d.message;
  return `${where} ${message}`;
}

/**
 * True for the ids of Aktion modules — `*.aktion`, `*.aktion.ts`, `*.aktion.js`
 * (query/hash stripped). Plain `*.ts` / `*.js` ids are native code and are left
 * to Vite. Exported for tests.
 */
export function isAktionId(id: string): boolean {
  return isAktionModulePath(id);
}

export { aktionPlugin as default };

/* -------------------------------------------------------------------------- */
/*  Compiling outside a Vite build                                             */
/* -------------------------------------------------------------------------- */

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

/** The default `typescript` frontend for the synchronous compile helpers, created once. */
let defaultSyncTypeScriptFrontend: ModuleFrontend | undefined;

function compileFrontends(options: CompileOptions): ModuleFrontends {
  const typescript = options.frontends?.typescript ?? (defaultSyncTypeScriptFrontend ??= tryCreateTypeScriptFrontend());
  return { ...defaultFrontends, ...options.frontends, typescript };
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
export function compileAktionFile(entryPath: string, options: CompileOptions = {}): CompiledProgram {
  const absolute = resolvePath(entryPath);
  return compileAktionSource(readFileSync(absolute, "utf8"), absolute, options);
}

/**
 * {@link compileAktionFile}, loading the TypeScript frontend asynchronously —
 * works on every Node version the plugin supports, including Node 18 where
 * `ts-blank-space` (an ES module) cannot be `require`d.
 */
export async function compileAktionFileAsync(entryPath: string, options: CompileOptions = {}): Promise<CompiledProgram> {
  const absolute = resolvePath(entryPath);
  return compileAktionSourceAsync(readFileSync(absolute, "utf8"), absolute, options);
}

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
export function compileAktionSource(
  source: string,
  virtualPath: string,
  options: CompileOptions = {},
): CompiledProgram {
  const absolute = resolvePath(virtualPath);
  const root = options.root === null ? null : resolvePath(options.root ?? dirname(absolute));
  const resolution =
    options.config === false ? options : mergeResolveOptions(loadAktionConfig(root ?? absolute), options);
  const result = linkProgram(source, absolute, createNodeResolver({ ...resolution, root }), {
    frontends: compileFrontends(options),
  });

  const fatal = collectDiagnostics(result.program, result.diagnostics).filter(
    (d) => d.severity === "error" || (options.strict === true && d.severity === "warning"),
  );
  if (fatal.length > 0) {
    const detail = fatal.map((d) => `  ${d.line}:${d.column} ${d.message}`).join("\n");
    throw new Error(`[aktion] failed to compile ${absolute}:\n${detail}`);
  }

  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program: result.program,
    source: runnableSource(result, source),
    path: absolute,
    ...(options.sourcesContent === false ? {} : { sourcesContent: result.modules.map((m) => m.originalSource) }),
  });
}

/**
 * {@link compileAktionSource}, loading the TypeScript frontend asynchronously
 * (see {@link compileAktionFileAsync}).
 */
export async function compileAktionSourceAsync(
  source: string,
  virtualPath: string,
  options: CompileOptions = {},
): Promise<CompiledProgram> {
  const typescript = options.frontends?.typescript ?? (await tryLoadTypeScriptFrontend());
  return compileAktionSource(source, virtualPath, { ...options, frontends: { ...options.frontends, typescript } });
}

// ---- internals ----

/**
 * The runnable text of a linked program: the merged program re-printed as one
 * `.aktion` program, as `linkProject` does. Re-parsing the ENTRY text alone
 * (what this used to be) loses every imported module, and for a `.aktion.ts`
 * entry it is not Aktion at all. Falls back to the entry's parsed text if the
 * printer cannot print some node.
 */
function runnableSource(result: LinkResult, entrySource: string): string {
  try {
    return printProgram(result.program);
  } catch {
    return result.modules[0]?.aktionSource ?? entrySource;
  }
}

/**
 * True when `candidate` is `root` or sits underneath it.
 *
 * The separator matters: a bare `startsWith(root)` also accepts a sibling whose
 * name merely begins with the root's (`/srv/app` vs `/srv/app-secrets`).
 */
export function isInsideRoot(candidate: string, root: string): boolean {
  const normalisedRoot = resolvePath(root);
  const normalised = resolvePath(candidate);
  if (normalised === normalisedRoot) return true;
  return normalised.startsWith(normalisedRoot.endsWith(sep) ? normalisedRoot : normalisedRoot + sep);
}

/** Default suffixes tried when a specifier names no file directly. */
const DEFAULT_EXTENSIONS = [
  ".aktion",
  ".aktion.ts",
  ".aktion.js",
  "/index.aktion",
  "/index.aktion.ts",
  "/index.aktion.js",
];

/**
 * Another Aktion module with the same base name as `path` (`store.aktion` next
 * to `store.aktion.ts`), or `null`. Such pairs are refused whatever the
 * specifier: TypeScript resolves `./store.aktion` to `store.aktion.ts` while
 * Vite picks `store.aktion`, so the type-checker and the bundler would silently
 * disagree about which file an import means.
 */
function siblingVariant(path: string): string | null {
  const lower = path.toLowerCase();
  const suffix = AKTION_MODULE_SUFFIXES.find((s) => lower.endsWith(s));
  if (!suffix) return null;
  const stem = path.slice(0, path.length - suffix.length);
  for (const other of AKTION_MODULE_SUFFIXES) {
    if (other !== suffix && isFile(stem + other)) return stem + other;
  }
  return null;
}

const baseNameOf = (p: string): string => p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);

/** `path` with symlinks resolved, or `path` itself when it does not exist. */
function realPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

/** `paths` plus the symlink-resolved spelling of each one that differs. */
function withRealPaths(paths: string[]): string[] {
  const out = new Set(paths);
  for (const p of paths) out.add(realPath(p));
  return [...out];
}

/** True when `path` names an existing regular file. */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

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
export function createNodeResolver(
  options: AktionResolveOptions & { root?: string | null } = {},
): ModuleResolver {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  // Longest prefix first, so `@acme/ui/forms` can be aliased apart from `@acme/ui`.
  const aliases = Object.entries(options.alias ?? {})
    .map(([prefix, target]) => [prefix, resolvePath(target)] as const)
    .sort((a, b) => b[0].length - a[0].length);

  const root = options.root === undefined ? process.cwd() : options.root;
  const allowed =
    root === null
      ? null
      : withRealPaths([resolvePath(root), ...(options.roots ?? []).map((r) => resolvePath(r)), ...aliases.map(([, t]) => t)]);

  // Compared both as written and with symlinks resolved: Vite hands the plugin
  // REAL paths for module ids but keeps `config.root` as configured, so on macOS
  // (`/var` → `/private/var`) or in a symlinked workspace every import of a
  // project under such a path used to read as "outside the project root".
  const contained = (path: string): boolean =>
    allowed === null || allowed.some((r) => isInsideRoot(path, r) || isInsideRoot(realPath(path), r));

  /** Extension-complete a base path; `null` when nothing on disk matches. */
  const complete = (base: string): string | null => {
    if (isFile(base)) return base;
    for (const ext of extensions) {
      if (isFile(base + ext)) return base + ext;
    }
    return null;
  };

  /**
   * Resolve `spec` and say why when it does not resolve. One function backs
   * both `resolve` and `explain`, so the explanation can never describe a
   * different decision than the one taken.
   */
  const resolveDetailed = (spec: string, importerPath: string): { path: string | null; why?: string } => {
    try {
      for (const [prefix, target] of aliases) {
        if (spec !== prefix && !spec.startsWith(`${prefix}/`)) continue;
        const rest = spec === prefix ? "" : spec.slice(prefix.length + 1);
        const base = rest === "" ? target : resolvePath(target, rest);
        // `rest` may contain `..`; an alias must not become a way out of the
        // directory it names.
        if (!isInsideRoot(base, target)) {
          return { path: null, why: `It climbs out of the directory the "${prefix}" alias names.` };
        }
        return checked(spec, base, complete(base));
      }

      // Bare specifiers with no alias aren't project modules.
      if (!spec.startsWith(".") && !spec.startsWith("/")) {
        return {
          path: null,
          why: "Bare specifiers name packages, not Aktion modules; map a prefix with `alias` (plugin option or aktion.config.json) or use a relative path.",
        };
      }

      const base = resolvePath(dirname(importerPath), spec);
      const resolved = complete(base);
      if (resolved !== null && !contained(resolved)) {
        return { path: null, why: "It resolves outside the project root (see the `roots` / `alias` options)." };
      }
      return checked(spec, base, resolved);
    } catch {
      return { path: null };
    }
  };

  /** Apply the sibling-variant refusal and the "did you mean" hint to a completed path. */
  const checked = (spec: string, base: string, resolved: string | null): { path: string | null; why?: string } => {
    if (resolved === null) {
      // `./store.aktion` when only `store.aktion.ts` exists, or the TypeScript
      // habit `./store.aktion.js` for `store.aktion.ts`: name the file.
      const lower = spec.toLowerCase();
      const suffix = AKTION_MODULE_SUFFIXES.find((s) => lower.endsWith(s));
      if (suffix) {
        const stem = base.slice(0, base.length - suffix.length);
        for (const other of AKTION_MODULE_SUFFIXES) {
          if (other === suffix || !isFile(stem + other)) continue;
          const hint = `Did you mean "${spec.slice(0, spec.length - suffix.length)}${other}"?`;
          return {
            path: null,
            why:
              suffix === ".aktion.js" && other === ".aktion.ts"
                ? `${hint} Aktion imports the file named, without TypeScript's \`.js\` → \`.ts\` mapping.`
                : hint,
          };
        }
      }
      return { path: null };
    }
    const sibling = siblingVariant(resolved);
    if (sibling !== null) {
      return {
        path: null,
        why:
          `"${baseNameOf(resolved)}" and "${baseNameOf(sibling)}" both exist — keep one ` +
          `(TypeScript and Vite resolve "./${baseNameOf(resolved).replace(/\.(?:ts|js)$/, "")}" to different files).`,
      };
    }
    return { path: resolved };
  };

  return {
    resolve(spec, importerPath) {
      return resolveDetailed(spec, importerPath).path;
    },
    explain(spec, importerPath) {
      return resolveDetailed(spec, importerPath).why;
    },
    load(path) {
      if (!contained(path)) {
        throw new Error(`[aktion] refusing to read "${path}" — outside the project root`);
      }
      return readFileSync(path, "utf8");
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  aktion.config.json                                                         */
/* -------------------------------------------------------------------------- */

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
export function loadAktionConfig(from: string): AktionConfig | null {
  let dir = isFile(from) ? dirname(resolvePath(from)) : resolvePath(from);

  for (;;) {
    const candidate = resolvePath(dir, "aktion.config.json");
    if (isFile(candidate)) {
      try {
        const raw = JSON.parse(readFileSync(candidate, "utf8")) as AktionConfig;
        const alias: Record<string, string> = {};
        for (const [prefix, target] of Object.entries(raw.alias ?? {})) {
          alias[prefix] = resolvePath(dir, target);
        }
        return {
          configPath: candidate,
          alias,
          roots: (raw.roots ?? []).map((r) => resolvePath(dir, r)),
          ...(raw.extensions ? { extensions: raw.extensions } : {}),
        };
      } catch {
        return null;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Overlay explicit options on a discovered config: `alias` merges key-wise with
 * the caller winning, `roots` concatenate, `extensions` is replaced outright.
 */
export function mergeResolveOptions(
  base: AktionResolveOptions | null,
  override: AktionResolveOptions,
): AktionResolveOptions {
  if (!base) return override;
  return {
    alias: { ...base.alias, ...override.alias },
    roots: [...(base.roots ?? []), ...(override.roots ?? [])],
    extensions: override.extensions ?? base.extensions,
  };
}

/**
 * True when the program declares a UI root the element can render.
 *
 * Two forms count: the current `$app(...)` statement and the legacy
 * `aktion = ...` assignment it replaced. Checking only the legacy form made
 * every modern program warn "renders nothing" on each build — and turned into a
 * hard error under `strict: true`, which is exactly backwards.
 */
/**
 * Every diagnostic for a linked program: the linker's own, plus the checks that
 * belong to compiling rather than linking.
 *
 * Shared by the Vite `transform` and {@link compileAktionSource} so `strict`
 * means the same thing whichever way a program is compiled — the entry-binding
 * warning used to exist only inside `transform`, which made a program that
 * "renders nothing" compile silently outside a build.
 */
function collectDiagnostics(program: Program, linkDiagnostics: LinkDiagnostic[]): LinkDiagnostic[] {
  const out: LinkDiagnostic[] = [...linkDiagnostics];
  if (!hasEntryBinding(program)) {
    out.push({
      line: 1,
      column: 1,
      severity: "warning",
      message:
        "No top-level `$app(…)` entry found — this program renders nothing.",
    });
  }
  return out;
}

function hasEntryBinding(program: Program): boolean {
  return program.statements.some((s) => {
    if (s.kind === "Assignment") return s.identifier === "aktion";
    if (s.kind !== "ExpressionStatement") return false;
    const expr = s.expression;
    return expr.kind === "Invoke" && expr.callee.kind === "StateRef" && expr.callee.name === "app";
  });
}

/**
 * Build a minimal valid v3 source map for the generated module.
 *
 * The emitted module is machine-generated (an inert `JSON.parse(...)` of the
 * AST), so there is no line-by-line correspondence with the author's source.
 * The previous `{ mappings: "" }` left every runtime stack frame pointing at
 * that opaque blob (feedback §3.4). Instead we emit a map that (a) carries the
 * original `.aktion` path and its content (`sourcesContent`) so the file shows
 * up in the browser's Sources panel, and (b) maps each generated line to the
 * original file so frames resolve to the `.aktion` module rather than the
 * generated JS. `AAAA` is the VLQ for the segment `[0, 0, 0, 0]`
 * (generatedColumn 0 → source 0, original line 0, original column 0); repeated
 * per line it keeps the absolute original position at the top of the file.
 */
function buildSourceMap(
  generated: string,
  sourcePath: string,
  source: string,
): { version: 3; sources: string[]; sourcesContent: string[]; names: string[]; mappings: string } {
  const lineCount = generated.split("\n").length;
  const mappings = new Array(lineCount).fill("AAAA").join(";");
  return {
    version: 3,
    sources: [sourcePath],
    sourcesContent: [source],
    names: [],
    mappings,
  };
}

/** `JSON.stringify` replacer: the runtime never reads a statement's `let` / `const` / `var`
 *  (`declaration`, kept only so the formatter can print it), so it is not shipped. */
function omitDeclarationKeyword(this: unknown, key: string, value: unknown): unknown {
  if (key !== "declaration") return value;
  const kind = (this as { kind?: unknown } | null)?.kind;
  return kind === "Assignment" || kind === "DestructureStatement" || kind === "ForOfStatement" || kind === "ForInStatement"
    ? undefined
    : value;
}

/**
 * ES module exporting the linked `CompiledProgram`. The AST embeds as an inert
 * `JSON.parse("…")` (faster + smaller than an object literal for large trees);
 * `source` is the runnable re-print of the linked program, and
 * `sourcesContent` (unless disabled) each module's original text for DevTools.
 */
function emitModule(
  result: LinkResult,
  entrySource: string,
  path: string,
  runtimeModuleId: string,
  options: { sourcesContent: boolean },
): string {
  const programLiteral = JSON.stringify(JSON.stringify(result.program, omitDeclarationKeyword));
  const contents = options.sourcesContent
    ? `, sourcesContent: ${JSON.stringify(result.modules.map((m) => m.originalSource))}`
    : "";
  return (
    `// Generated by the Aktion Vite plugin — do not edit by hand.\n` +
    `import { defineCompiledProgram } from ${JSON.stringify(runtimeModuleId)};\n` +
    `const program = /*#__PURE__*/ JSON.parse(${programLiteral});\n` +
    `const source = ${JSON.stringify(runnableSource(result, entrySource))};\n` +
    `export default /*#__PURE__*/ defineCompiledProgram({ ` +
    `__aktionCompiled: ${COMPILED_PROGRAM_VERSION}, program, source, path: ${JSON.stringify(path)}${contents} });\n`
  );
}

/**
 * Dev-only stand-ins for the entry module's named exports. The emitted module's
 * only real export is `default`; without these, host code that imports a helper
 * (a unit test calling `remaining(todos)`) silently reads `undefined` under
 * Vitest, or fails to link in the browser with no word on why. Each stand-in
 * throws an Aktion-specific error on any use — a call, a property read, a
 * coercion — and nothing at import time, so the default import keeps working.
 * Builds leave them out: there a named import fails at bundle time (the
 * plugin's `moduleParsed`).
 *
 * An export named `then` gets no stand-in: a namespace with a callable `then`
 * is a thenable, so `await import("./x.aktion")` would call it and reject
 * instead of yielding the module.
 *
 * The text never contains `");` or `] });`, which tests unpacking the program
 * literal match on.
 */
function hostOnlyExports(result: LinkResult, path: string): string {
  const entry = result.modules[0];
  if (!entry) return "";
  const names = aktionExportNames(parse(entry.aktionSource)).filter((name) => name !== "then");
  if (names.length === 0) return "";
  const message =
    `"[aktion] \`" + __aktionNames[i] + "\` is not available to host code: the Aktion module " + ` +
    `${JSON.stringify(JSON.stringify(path))} + " gives host code only its compiled program (\`import app from\`). ` +
    `Exercise its other exports through a program (compileAktionSource from aktion-runtime/vite)."`;
  return (
    `const __aktionNames = ${JSON.stringify(names)};\n` +
    "function __aktionHostOnly(i) {\n" +
    `  const message = ${message};\n` +
    "  const fail = () => { throw new Error(message); };\n" +
    "  return new Proxy(function () {}, { apply: fail, construct: fail, get: fail, set: fail, has: fail, ownKeys: fail, " +
    "defineProperty: fail, deleteProperty: fail, getOwnPropertyDescriptor: fail, getPrototypeOf: fail, setPrototypeOf: fail });\n" +
    "}\n" +
    names.map((_, i) => `const __aktion_${i} = __aktionHostOnly(${i});\n`).join("") +
    `export { ${names.map((n, i) => `__aktion_${i} as ${n}`).join(", ")} };\n`
  );
}

/** Dev-only self-accepting HMR: re-mount every `<aktion-app>` showing this
 *  module, replaying its serialized `$state` so live state survives the edit. */
const HMR_FOOTER = `
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    const next = mod && mod.default;
    if (!next || typeof document === "undefined") return;
    for (const el of document.querySelectorAll("aktion-app")) {
      if (el.sourceId !== next.path) continue;
      el.mountCompiled(next, el.serializeState());
    }
  });
}
`;
