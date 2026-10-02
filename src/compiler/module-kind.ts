/**
 * Which language a module is written in, decided from its path alone.
 *
 * Aktion modules can be authored three ways: the DSL itself (`*.aktion`), or
 * JavaScript / TypeScript that keeps to the Aktion subset (`*.aktion.js`,
 * `*.aktion.ts`). All three compile to the same `Program` AST. The suffix is
 * the only signal — the same file name has to classify the same way for the
 * linker, the Vite plugin, tsconfig `include` globs, ESLint `files` and
 * coverage filters, and none of those read file contents.
 *
 * A plain `*.ts` / `*.js` file is deliberately NOT an Aktion module: it is
 * native code (host code, tests, and — later — modules an Aktion program may
 * call into). Keeping that namespace free is why the DSL suffix stays in the
 * name (`store.aktion.ts`), the same convention Svelte uses for `.svelte.ts`.
 *
 * Browser-safe: no `node:*` imports.
 */

export type ModuleLanguage = "aktion" | "javascript" | "typescript";

/**
 * Specifier of the types-only built-ins module. In an Aktion module,
 * `import { Button, $http } from "aktion-runtime/dsl"` names the runtime's
 * globals so TypeScript can type-check them; the linker drops the import and
 * the names resolve exactly as they would without it.
 */
export const DSL_MODULE_ID = "aktion-runtime/dsl";

/** Suffixes that make a file an Aktion module, longest first. */
export const AKTION_MODULE_SUFFIXES = [".aktion.ts", ".aktion.js", ".aktion"] as const;

/**
 * Suffixes reserved for a future JSX frontend. They classify as "not an Aktion
 * module" today, with their own diagnostic, so the names stay available.
 */
export const RESERVED_AKTION_SUFFIXES = [".aktion.tsx", ".aktion.jsx"] as const;

/** Extensions of native code an Aktion module may not import. */
export const NATIVE_MODULE_RE = /\.(?:[cm]?[jt]sx?|json|css|wasm)$/i;

/**
 * Strip a `?query` and/or `#hash` from a module id or URL key.
 *
 * Module ids reach this code from Vite (`/src/app.aktion.ts?import`) and from
 * URL imports (`https://cdn/x.aktion.js?v=3`); classifying the raw string would
 * read `?v=3` as part of the extension.
 */
export function stripQuery(id: string): string {
  const q = id.indexOf("?");
  const base = q === -1 ? id : id.slice(0, q);
  const h = base.indexOf("#");
  return h === -1 ? base : base.slice(0, h);
}

/** True when `path` ends in one of the reserved JSX suffixes (query/hash ignored). */
export function isReservedAktionPath(path: string): boolean {
  const clean = stripQuery(path).toLowerCase();
  return RESERVED_AKTION_SUFFIXES.some((suffix) => clean.endsWith(suffix));
}

/**
 * The language of the module at `path`, or `null` when `path` is not an
 * Aktion module (native code, or a reserved suffix).
 *
 *   moduleLanguage("app.aktion")        → "aktion"
 *   moduleLanguage("store.aktion.ts")   → "typescript"
 *   moduleLanguage("lib/fmt.aktion.js") → "javascript"
 *   moduleLanguage("utils.ts")          → null   (native)
 *   moduleLanguage("/p/a")              → "aktion" (no extension)
 *
 * A path with no recognised extension is treated as Aktion. That keeps every
 * in-memory resolver working that keys modules by bare names or URLs without a
 * DSL suffix (tests and the playground do).
 */
export function moduleLanguage(path: string): ModuleLanguage | null {
  const clean = stripQuery(path).toLowerCase();
  if (clean.endsWith(".aktion.ts")) return "typescript";
  if (clean.endsWith(".aktion.js")) return "javascript";
  if (clean.endsWith(".aktion")) return "aktion";
  if (isReservedAktionPath(clean)) return null;
  if (NATIVE_MODULE_RE.test(clean)) return null;
  return "aktion";
}

/** True when `path` ends in an Aktion module suffix (query/hash ignored). */
export function isAktionModulePath(path: string): boolean {
  const clean = stripQuery(path).toLowerCase();
  return AKTION_MODULE_SUFFIXES.some((suffix) => clean.endsWith(suffix));
}

/** True when `path` names native code: a JS/TS/JSON/CSS/Wasm file that is not an Aktion module. */
export function isNativeModulePath(path: string): boolean {
  return moduleLanguage(path) === null && !isReservedAktionPath(path);
}
