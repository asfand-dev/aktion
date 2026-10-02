/**
 * Module frontends: how a module's text becomes the `Program` AST the linker
 * merges.
 *
 * Every module language compiles to the SAME AST — the one `parse()` produces —
 * so the evaluator, linker, formatter, coverage and DevTools never learn that a
 * module was written in TypeScript. A frontend only decides how to get there:
 *
 *   - `.aktion`     → `parse()` as-is;
 *   - `.aktion.js`  → `parse()`, then the JS-semantics layer, which lowers or
 *                     rejects code whose Aktion meaning differs from its
 *                     JavaScript meaning (see `js-semantics.ts`);
 *   - `.aktion.ts`  → erase the types without moving any character, then the
 *                     same JavaScript path. That frontend needs a TypeScript
 *                     parser, so it lives in the Node-only plugin entry
 *                     (`src/plugin/typescript.ts`) and is passed in, which keeps
 *                     this module — and the browser bundle — free of it.
 *
 * Browser-safe: no `node:*` imports.
 */

import { parse, type ParseOptions } from "../parser/index.js";
import type { Program } from "../parser/types.js";
import type { LinkDiagnostic } from "./linker.js";
import type { ModuleLanguage } from "./module-kind.js";
import {
  asyncModifierDiagnostic,
  checkJavaScriptSemantics,
  collectImportedStateMutations,
  findAsyncModifiers,
  lowerJavaScriptSemantics,
  normalizeComponentForms,
  type ImportedStateMutation,
} from "./js-semantics.js";

export { DSL_MODULE_ID } from "./module-kind.js";

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
export const aktionFrontend: ModuleFrontend = {
  language: "aktion",
  compile(source: string): FrontendResult {
    return { program: parse(source), diagnostics: [], aktionSource: source };
  },
};

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
export function compileJavaScriptModule(
  code: string,
  path: string,
  options: CompileJavaScriptOptions = {},
): FrontendResult {
  const parseOptions: ParseOptions & { softNewlines?: ReadonlySet<number> } = {};
  if (options.softNewlines && options.softNewlines.size > 0) parseOptions.softNewlines = options.softNewlines;
  const parsed = parse(code, parseOptions);
  if (parsed.errors.length > 0) {
    // A module that does not parse is reported as parse errors only: the
    // JS-semantics passes need a complete tree to reason about scopes. The one
    // exception is `async`: an `async` arrow or function expression is a parse
    // error at the `async` keyword, and E102 says why — so it replaces the
    // generic message at that position.
    const asyncAt = new Map(findAsyncModifiers(code).map((loc) => [`${loc.line}:${loc.column}`, loc]));
    const replaced: LinkDiagnostic[] = [];
    const errors = parsed.errors.filter((e) => {
      const loc = asyncAt.get(`${e.line}:${e.column}`);
      if (!loc) return true;
      replaced.push(asyncModifierDiagnostic(loc, path));
      return false;
    });
    return { program: { ...parsed, errors }, diagnostics: replaced, aktionSource: code };
  }
  const normalized = normalizeComponentForms(parsed);
  const diagnostics = checkJavaScriptSemantics(normalized, path, { source: code });
  if (diagnostics.some((d) => d.severity === "error")) {
    return { program: normalized, diagnostics, aktionSource: code };
  }
  const importedStateMutations = collectImportedStateMutations(normalized);
  const program = lowerJavaScriptSemantics(normalized);
  return {
    program,
    diagnostics,
    aktionSource: code,
    ...(importedStateMutations.length > 0 ? { importedStateMutations } : {}),
  };
}

/** `.aktion.js`: JavaScript that keeps to the Aktion subset. */
export const javascriptFrontend: ModuleFrontend = {
  language: "javascript",
  compile(source: string, path: string): FrontendResult {
    return compileJavaScriptModule(source, path);
  },
};

/**
 * The frontends available without a TypeScript parser — everything the
 * browser bundle can compile. Pass a `typescript` frontend (from
 * `aktion-runtime/vite`) alongside these to link `.aktion.ts` modules.
 */
export const defaultFrontends: ModuleFrontends = {
  aktion: aktionFrontend,
  javascript: javascriptFrontend,
};
