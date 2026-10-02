/**
 * Browser-safe compiler runtime helpers.
 *
 * Contains the `CompiledProgram` data contract, two guards, and `compileLite`
 * — a parse-and-wrap helper whose only dependencies (`parse`, the
 * `Program`/`ComponentLibrary` types) are already part of the runtime bundle.
 *
 * A `CompiledProgram` is the artefact `<aktion-app>.mountCompiled(...)` consumes:
 * the already-parsed (and, for multi-file projects, linker-merged) component-tree
 * AST plus the original source. Shipping the parsed AST is what "pre-evaluated
 * component tree" means in practice — the reactive runtime (state, HTTP, effects,
 * routing) still runs in the browser exactly as it does for the streamed-string
 * path, but the parser no longer has to.
 */

import { parse } from "../parser/index.js";
import type { Program } from "../parser/types.js";
import type { ComponentLibrary } from "../library/types.js";

/**
 * Schema version of the compiled-program contract. Bumped only on a breaking
 * change to the `CompiledProgram` shape so the runtime can reject an artefact
 * produced by an incompatible compiler version instead of mounting garbage.
 */
export const COMPILED_PROGRAM_VERSION = 1;

/**
 * The artefact produced by the Aktion linker (`linkProject`) or `compileLite`
 * and consumed by `<aktion-app>.mountCompiled(...)`. It carries the parsed AST
 * so the runtime skips `parse()`, plus the original source so text-based
 * features (`applyDelta`, `serializeState` round-trips, debugging) keep working.
 */
export interface CompiledProgram {
  /** Version marker — see {@link COMPILED_PROGRAM_VERSION}. */
  readonly __aktionCompiled: typeof COMPILED_PROGRAM_VERSION;
  /** Already-parsed component-tree AST. Mounted without re-parsing. */
  readonly program: Program;
  /**
   * Runnable Aktion text of the program. For a linked project this is the
   * merged program re-emitted by `printProgram` (one self-contained `.aktion`
   * program); for a single file, the file itself. Text-based features read it —
   * `applyDelta`, DevTools Edit/Apply, generated tests, `renderToString` —
   * while re-plans (reconnect, reload) reuse `program` directly.
   */
  readonly source: string;
  /** Module id / file path — used for diagnostics and HMR targeting. */
  readonly path: string;
  /**
   * Original text of every module, indexed like `program.sources` (index 0 is
   * the entry; a single-file program has one entry). These are the texts every
   * `loc` refers to — for a `.aktion.ts` module, the TypeScript the author
   * wrote — so DevTools shows them instead of `source`. Optional: artefacts
   * from older compilers omit it and DevTools falls back to `source`.
   */
  readonly sourcesContent?: readonly string[];
}

/**
 * Narrowing guard for values that cross the `mountCompiled` boundary so a stray
 * object can't be mistaken for a compiled artefact.
 */
export function isCompiledProgram(value: unknown): value is CompiledProgram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CompiledProgram>;
  return (
    candidate.__aktionCompiled === COMPILED_PROGRAM_VERSION &&
    typeof candidate.source === "string" &&
    typeof candidate.path === "string" &&
    !!candidate.program &&
    Array.isArray((candidate.program as Program).statements)
  );
}

/**
 * Identity helper the linker / emitted module wraps its payload with. It gives
 * authors a single, typed construction point — `defineCompiledProgram({...})`
 * returns a value typed as `CompiledProgram`, so a malformed payload is a
 * compile error rather than a runtime surprise.
 */
export function defineCompiledProgram(compiled: CompiledProgram): CompiledProgram {
  return compiled;
}

/** Options for {@link compileLite}. */
export interface CompileLiteOptions {
  /** Module id / file path stamped onto the artefact (default `"<inline>"`). */
  path?: string;
  /**
   * Library reserved for future lite-path validation. The browser runtime
   * already re-runs `validateProgramSchema` on mount (see `element.ts`
   * `replan()`), so the lite path intentionally skips validation here to avoid
   * duplicating diagnostics — it only parses and wraps.
   */
  library?: ComponentLibrary;
}

/**
 * Parse `source` and wrap it as a {@link CompiledProgram} — the minimal,
 * browser-safe single-file compile path. Useful for mounting a program string
 * via `mountCompiled` without the streamed-string `setResponse` API. It performs
 * no module linking and no schema validation (the runtime validates on mount),
 * so it adds nothing to the browser bundle beyond the parser that already ships.
 *
 * For multi-file projects use `linkProject(...)`, which resolves the
 * `import`/`export` graph before wrapping.
 */
export function compileLite(source: string, options: CompileLiteOptions = {}): CompiledProgram {
  const program = parse(source);
  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program,
    source,
    path: options.path ?? "<inline>",
  });
}
