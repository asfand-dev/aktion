/**
 * Module linker for multi-file Aktion programs. Browser-safe — no `node:*`
 * imports; the host supplies I/O through a {@link ModuleResolver}.
 *
 * Modules may be written as `.aktion`, `.aktion.js` or `.aktion.ts`. Each one is
 * compiled by the frontend for its language (`./frontend.ts`, chosen from the
 * path by `./module-kind.ts`) into the same `Program` AST, so everything below
 * — renaming, merging, provenance — is language-agnostic.
 *
 * Resolves the `import`/`export` graph rooted at an entry file and merges it
 * into a single `Program` AST that the runtime evaluates unchanged. Each file
 * gets **true module scope**: its non-exported top-level names are private. We
 * achieve this by renaming every module-local declaration (and `$state` atom,
 * and the references to them) to a per-module-unique symbol, rewriting imported
 * aliases to the source module's renamed export, and concatenating the result.
 *
 * Why renaming is correct (verified against the evaluator): the runtime keys
 * every top-level binding / action / component / hook / `$state` atom purely by
 * string name, and per-instance keys derive from SOURCE LOCATION, not name. So
 * consistent renaming yields an independent, correctly-scoped symbol with no
 * runtime change. The only names that must NOT be renamed are those resolved
 * outside the module (library components, JS globals, `route`, `$util`/
 * `$console`/`$storage`) — they're simply never in a module's rename map — and
 * genuine block-locals introduced by `loopVars` binders (params, loop vars,
 * `catch`, destructuring patterns), which the renamer tracks as shadows.
 *
 * I/O note: `linkProgram` is synchronous and resolver-driven. To link a project
 * that imports over the network (URL specifiers), pre-fetch every reachable
 * source into a map and use the async `linkProject` in `./project.js`.
 */

import { collectPatternNames, stampSourceIndex } from "../parser/index.js";
import { moduleLocalSymbol } from "../parser/module-symbols.js";
import type {
  Program,
  Statement,
  Expression,
  BlockExpr,
  DeclParam,
  LambdaParam,
  DestructuringPattern,
  ImportStatement,
} from "../parser/types.js";
import {
  defaultFrontends,
  DSL_MODULE_ID,
  type FrontendResult,
  type ModuleFrontends,
} from "./frontend.js";
import { importedStateMutationApplies, type ImportedStateMutation } from "./js-semantics.js";
import {
  isNativeModulePath,
  isReservedAktionPath,
  moduleLanguage,
  type ModuleLanguage,
} from "./module-kind.js";

// The module-local mangling (`total` in module 3 → `__a3_total`) lives in the
// parser, which needs its inverse to classify a renamed `function __a1_Counter`
// as a component; the linker re-exports it so both can never drift apart.
export { moduleLocalBaseName, moduleLocalSymbol } from "../parser/module-symbols.js";

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

interface ModuleRecord {
  id: number;
  path: string;
  language: ModuleLanguage;
  originalSource: string;
  aktionSource: string;
  program: Program;
  /** Resolved import edges (after path resolution). */
  edges: { stmt: ImportStatement; resolvedPath: string | null }[];
  /** `import { … } from "aktion-runtime/dsl"` statements — built-ins, never loaded. */
  builtinImports: ImportStatement[];
  /** Top-level declared names, by keyspace. */
  declaredPlain: Set<string>;
  declaredState: Set<string>;
  /** Exported subset, by keyspace. */
  exportedPlain: Set<string>;
  exportedState: Set<string>;
  /** Rename maps (own locals + imported aliases), by keyspace. */
  renamePlain: Map<string, string>;
  renameState: Map<string, string>;
  /** In-place changes of imported `$` atoms, judged once the exporters are loaded (E108). */
  importedStateMutations: ImportedStateMutation[];
}

/** How a language is named in diagnostics. */
const LANGUAGE_LABEL: Record<ModuleLanguage, string> = {
  aktion: "Aktion",
  javascript: "JavaScript",
  typescript: "TypeScript",
};

/** Last path segment of `path`, for diagnostics (`src/lib/utils.ts` → `utils.ts`). */
function baseName(path: string): string {
  // Find the first `?`/`#` with `search` rather than `replace(/[?#].*$/, "")`:
  // that pattern is quadratic on a long run of `#` ending in a line break.
  const suffixStart = path.search(/[?#]/);
  const clean = suffixStart < 0 ? path : path.slice(0, suffixStart);
  const slash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return slash < 0 ? clean : clean.slice(slash + 1);
}

/**
 * Message for an import of native code (`./utils.ts`, `./helpers.js`).
 *
 * Exported so the docs and tests quote one source of truth.
 */
export function nativeImportMessage(spec: string, resolvedPath: string): string {
  const name = baseName(resolvedPath);
  const stem = name.replace(/\.(?:[cm]?[jt]sx?|json|css|wasm)$/i, "");
  const suggestion = /\.(?:[cm]?ts|tsx)$/i.test(name) ? `${stem}.aktion.ts` : `${stem}.aktion.js`;
  return (
    `"${spec}" is not an Aktion module. Aktion modules end in .aktion, .aktion.ts or .aktion.js — ` +
    `rename it to ${suggestion} to write it as Aktion, or keep it native and pass values in from the host ` +
    `(importing native modules is not supported yet).`
  );
}

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
export function linkProgram(
  entrySource: string,
  entryPath: string,
  resolver: ModuleResolver,
  options: LinkOptions = {},
): LinkResult {
  const frontends: ModuleFrontends = options.frontends ?? defaultFrontends;
  const modules = new Map<string, ModuleRecord>();
  const order: string[] = []; // post-order: dependencies before dependents
  const visiting = new Set<string>();
  const diagnostics: LinkDiagnostic[] = [];
  let nextId = 0;

  const report = (
    path: string,
    line: number,
    column: number,
    message: string,
    severity: "error" | "warning",
    code?: string,
  ): void => {
    // Path-prefix non-entry diagnostics so the author knows which file even
    // when a consumer only prints `message`.
    const diagnostic: LinkDiagnostic = {
      line,
      column,
      message: path === entryPath ? message : `${path}: ${message}`,
      severity,
      path,
    };
    if (code) diagnostic.code = code;
    diagnostics.push(diagnostic);
  };
  const fail = (path: string, line: number, column: number, message: string, code?: string): void =>
    report(path, line, column, message, "error", code);

  function load(path: string, sourceOverride: string | null, language: ModuleLanguage): ModuleRecord | undefined {
    const existing = modules.get(path);
    if (existing) return existing;
    if (visiting.has(path)) return undefined; // cycle: in-progress; refs resolve post-merge
    visiting.add(path);

    let src: string;
    if (sourceOverride !== null) {
      src = sourceOverride;
    } else {
      try {
        src = resolver.load(path);
      } catch {
        visiting.delete(path);
        fail(entryPath, 0, 0, `Failed to load imported module "${path}".`, "AKT-LINK-LOAD");
        return undefined;
      }
    }

    const frontend = frontends[language];
    if (!frontend) {
      visiting.delete(path);
      fail(
        path,
        0,
        0,
        `"${path}" is a ${LANGUAGE_LABEL[language]} Aktion module, but no ${language} frontend is configured — ` +
          `compile it with aktion-runtime/vite, or pass a ${language} frontend to linkProgram ` +
          `(loadTypeScriptFrontend() from aktion-runtime/vite).`,
        "AKT-LINK-NO-FRONTEND",
      );
      return undefined;
    }

    let compiled: FrontendResult;
    try {
      compiled = frontend.compile(src, path);
    } catch (err) {
      // Frontends must report, not throw — but a throwing one must not take
      // the whole link down or lose its position silently.
      visiting.delete(path);
      fail(path, 0, 0, `Failed to compile "${path}": ${(err as Error)?.message ?? String(err)}`, "AKT-LINK-FRONTEND");
      return undefined;
    }
    const { program } = compiled;
    // A frontend records a bad statement's error and recovers rather than
    // throwing, so a dependency with a syntax error would otherwise link
    // "successfully" minus whatever statements were dropped. Surface each
    // module's own parse errors as link diagnostics — only the ENTRY's errors
    // travel out on `program.errors`, so a dependency's would vanish entirely.
    for (const e of program.errors) fail(path, e.line, e.column, e.message);
    for (const d of compiled.diagnostics) {
      report(path, d.line, d.column, d.message, d.severity, d.code);
    }

    const rec: ModuleRecord = {
      id: nextId++,
      path,
      language,
      originalSource: src,
      aktionSource: compiled.aktionSource,
      program,
      edges: [],
      builtinImports: [],
      declaredPlain: new Set(),
      declaredState: new Set(),
      exportedPlain: new Set(),
      exportedState: new Set(),
      renamePlain: new Map(),
      renameState: new Map(),
      importedStateMutations: compiled.importedStateMutations ?? [],
    };
    modules.set(path, rec);
    buildSymbolTable(rec);

    for (const stmt of program.statements) {
      if (stmt.kind !== "Import") continue;
      const line = stmt.loc?.line ?? 0;
      const column = stmt.loc?.column ?? 0;
      if (stmt.source === DSL_MODULE_ID) {
        checkBuiltinImport(rec, stmt, fail);
        rec.builtinImports.push(stmt);
        continue;
      }
      const resolved = resolver.resolve(stmt.source, path);
      if (resolved === null) {
        rec.edges.push({ stmt, resolvedPath: null });
        const why = resolver.explain?.(stmt.source, path);
        fail(path, line, column, `Cannot resolve import "${stmt.source}".${why ? ` ${why}` : ""}`, "AKT-LINK-RESOLVE");
        continue;
      }
      // Classify BEFORE loading: a native module is never read, let alone
      // parsed as Aktion (which used to report a wall of misleading parse
      // errors for `./utils.ts`, or silently link a `.js` file that happened
      // to fit the subset).
      const language = moduleLanguage(resolved);
      if (language === null) {
        rec.edges.push({ stmt, resolvedPath: null });
        if (isReservedAktionPath(resolved)) {
          fail(
            path,
            line,
            column,
            `"${stmt.source}": JSX Aktion modules (.aktion.tsx / .aktion.jsx) are not supported yet — use .aktion.ts or .aktion.js.`,
            "AKT-LINK-JSX",
          );
        } else {
          fail(path, line, column, nativeImportMessage(stmt.source, resolved), "AKT-LINK-NATIVE");
        }
        continue;
      }
      rec.edges.push({ stmt, resolvedPath: resolved });
      load(resolved, null, language);
    }

    visiting.delete(path);
    order.push(path);
    return rec;
  }

  let entryLanguage = moduleLanguage(entryPath);
  if (entryLanguage === null) {
    // Lenient for entries only: hosts load whole programs from `app.js` URLs,
    // and `compileAktionSource(src, "x.js")` predates module languages.
    if (isNativeModulePath(entryPath)) {
      report(
        entryPath,
        1,
        1,
        `Aktion entry "${baseName(entryPath)}" has a JavaScript extension; rename it to ` +
          `${baseName(entryPath).replace(/\.[^.]+$/, "")}.aktion (or .aktion.js for JavaScript semantics). ` +
          `It is linked as an .aktion module for now.`,
        "warning",
        "AKT-LINK-NATIVE-ENTRY",
      );
    } else {
      fail(
        entryPath,
        1,
        1,
        `"${baseName(entryPath)}": JSX Aktion modules (.aktion.tsx / .aktion.jsx) are not supported yet — use .aktion.ts or .aktion.js.`,
        "AKT-LINK-JSX",
      );
    }
    entryLanguage = "aktion";
  }
  load(entryPath, entrySource, entryLanguage);

  // Build rename maps: own declarations first (so imports can target them).
  // The ENTRY module keeps its own names CANONICAL — they are the program's
  // public surface: the `aktion` entry binding, and the `$state` names that
  // `serializeState` / `hydrateState` / `applyDelta` target. Only imported
  // (non-entry) modules are renamed for privacy + collision-freedom. This also
  // makes a single-file program a true no-op (its rename maps stay empty).
  for (const rec of modules.values()) {
    if (rec.path === entryPath) continue;
    for (const name of rec.declaredPlain) rec.renamePlain.set(name, moduleLocalSymbol(rec.id, name));
    for (const name of rec.declaredState) rec.renameState.set(name, moduleLocalSymbol(rec.id, name));
  }
  // Resolve imported aliases to the source module's renamed export. An import
  // of the ENTRY (a cycle back to it) targets the entry's canonical name: the
  // entry's rename maps are empty by design, and falling back to
  // `moduleLocalSymbol(0, …)` bound the importer to an `__a0_` name nothing
  // declares — a shared `$atom` silently split in two.
  const exportSymbol = (src: ModuleRecord, name: string, renames: Map<string, string>): string =>
    renames.get(name) ?? (src.path === entryPath ? name : moduleLocalSymbol(src.id, name));
  for (const rec of modules.values()) {
    for (const { stmt, resolvedPath } of rec.edges) {
      if (resolvedPath === null) continue;
      const src = modules.get(resolvedPath);
      if (!src) continue; // load failed (already diagnosed)
      for (const spec of stmt.specifiers) {
        const line = stmt.loc?.line ?? 0;
        const column = stmt.loc?.column ?? 0;
        if (spec.isState) {
          if (!src.exportedState.has(spec.imported)) {
            fail(rec.path, line, column, `"${stmt.source}" does not export \`$${spec.imported}\`.`, "AKT-LINK-EXPORT");
            continue;
          }
          rec.renameState.set(spec.local, exportSymbol(src, spec.imported, src.renameState));
        } else {
          if (!src.exportedPlain.has(spec.imported)) {
            fail(rec.path, line, column, `"${stmt.source}" does not export \`${spec.imported}\`.`, "AKT-LINK-EXPORT");
            continue;
          }
          rec.renamePlain.set(spec.local, exportSymbol(src, spec.imported, src.renamePlain));
        }
      }
    }
  }

  // E108 across modules. A JavaScript-shaped module that changes an imported
  // `$` atom in place (`$todos.push(t)`) only breaks re-rendering if the
  // EXPORTER declares that atom as plain data — something its own frontend
  // could not see. Judged before renaming, on the names the authors wrote.
  for (const rec of modules.values()) {
    for (const mutation of rec.importedStateMutations) {
      const edge = rec.edges.find((e) => e.stmt.source === mutation.source && e.resolvedPath !== null);
      const exporter = edge ? modules.get(edge.resolvedPath!) : undefined;
      if (exporter && importedStateMutationApplies(mutation, exporter.program)) {
        fail(rec.path, mutation.line, mutation.column, mutation.message, "E108");
      }
    }
  }

  // Rename + merge in dependency order.
  //
  // Merging is where `loc.line` stops being a position: line 42 of the entry and
  // line 42 of a helper module both land in one statement list. So each module's
  // nodes are stamped with an index into `sources` on the way in — the only
  // record of which file a node was authored in that survives the merge, and
  // what lets diagnostics, source maps and coverage name a real file.
  //
  // The entry is pinned to index 0 (`order` is post-order, so it is last) — a
  // stable convention consumers can rely on, and it keeps `loc.source ?? 0`
  // correct for unstamped single-file programs.
  const merged: Statement[] = [];
  const sources: string[] = [entryPath];
  const sourceIndex = new Map<string, number>([[entryPath, 0]]);
  for (const path of order) {
    if (sourceIndex.has(path)) continue;
    sourceIndex.set(path, sources.length);
    sources.push(path);
  }
  // A single-file program needs no provenance: `line` still identifies a
  // position on its own, and stamping would break the documented invariant that
  // its merged AST deep-equals `parse(source)`.
  const multiModule = sources.length > 1;
  for (const path of order) {
    const rec = modules.get(path)!;
    const renamer = makeRenamer(rec);
    const index = sourceIndex.get(path)!;
    for (const stmt of rec.program.statements) {
      if (stmt.kind === "Import") continue; // dropped
      renamer.renameTopLevel(stmt);
      stripExported(stmt);
      if (multiModule) stampSourceIndex(stmt, index);
      if (stmt.kind === "EffectDeclaration" && rec.path !== entryPath) {
        // De-collide location-named effects across IMPORTED files (linker-only).
        // The entry's effect names stay canonical (single-file = no-op).
        stmt.name = `__effect_a${rec.id}_${stmt.name.replace(/^__effect_/, "")}`;
      }
      merged.push(stmt);
    }
  }

  const entryRec = modules.get(entryPath);
  // Shape matches `parse()` exactly (no `warnings` key) so a single-file
  // program's merged AST deep-equals `parse(source)` — `sources` is only added
  // for a genuine multi-module graph, where that equivalence no longer applies.
  const program: Program = {
    statements: merged,
    errors: entryRec ? entryRec.program.errors : [],
  };
  if (multiModule) program.sources = sources;
  const linkedModules: LinkedModule[] = [];
  for (const path of sources) {
    const rec = modules.get(path);
    if (!rec) continue;
    linkedModules.push({
      path: rec.path,
      language: rec.language,
      originalSource: rec.originalSource,
      aktionSource: rec.aktionSource,
    });
  }
  return {
    program,
    diagnostics,
    dependencies: order.filter((p) => p !== entryPath),
    modules: linkedModules,
  };
}

/**
 * Validate an `import { … } from "aktion-runtime/dsl"` statement. Only identity
 * imports are allowed:
 *
 *   - an alias (`{ $effect as $fx }`) is rejected (E122): the parser recognises
 *     `$effect` by NAME, so an aliased effect would silently become a plain
 *     call, and an aliased `$` built-in would hide from the per-module checks;
 *   - importing a name the module also declares is rejected (E123): the local
 *     declaration would shadow the built-in it claims to import.
 *
 * With only identity imports left, no rename-map entry is needed — the name
 * already is the global's name, and module rename maps never contain it.
 */
function checkBuiltinImport(
  rec: ModuleRecord,
  stmt: ImportStatement,
  fail: (path: string, line: number, column: number, message: string, code?: string) => void,
): void {
  const line = stmt.loc?.line ?? 0;
  const column = stmt.loc?.column ?? 0;
  for (const spec of stmt.specifiers) {
    const sigil = spec.isState ? "$" : "";
    if (spec.local !== spec.imported) {
      fail(
        rec.path,
        line,
        column,
        `Import Aktion built-ins by their own name (\`${sigil}${spec.imported}\`); aliases are not supported.`,
        "E122",
      );
      continue;
    }
    const declared = spec.isState ? rec.declaredState.has(spec.local) : rec.declaredPlain.has(spec.local);
    if (declared) {
      fail(
        rec.path,
        line,
        column,
        `\`${sigil}${spec.local}\` is imported from aktion-runtime/dsl and also declared here — remove one.`,
        "E123",
      );
    }
  }
}

/**
 * Collect a module's top-level declared/exported names. Names are deduped by
 * the `Set`s; Aktion's top-level bindings are last-wins (re-assignment is legal),
 * so duplicate top-level names are NOT errors.
 */
function buildSymbolTable(rec: ModuleRecord): void {
  for (const stmt of rec.program.statements) {
    switch (stmt.kind) {
      case "Assignment":
        if (stmt.isState) {
          rec.declaredState.add(stmt.identifier);
          if (stmt.exported) rec.exportedState.add(stmt.identifier);
        } else {
          rec.declaredPlain.add(stmt.identifier);
          if (stmt.exported) rec.exportedPlain.add(stmt.identifier);
        }
        break;
      case "ComponentDeclaration":
      case "ActionDeclaration":
        rec.declaredPlain.add(stmt.name);
        if (stmt.exported) rec.exportedPlain.add(stmt.name);
        break;
      case "HookDeclaration":
        // Hooks are referenced as `$useX()` → the state keyspace.
        rec.declaredState.add(stmt.name);
        if (stmt.exported) rec.exportedState.add(stmt.name);
        break;
      case "DestructureStatement":
        // Top-level destructuring declares module-local (plain) bindings.
        for (const name of collectPatternNames({ kind: stmt.patternKind, bindings: stmt.bindings })) {
          rec.declaredPlain.add(name);
        }
        break;
      default:
        break; // Import / Effect / control-flow declare nothing importable
    }
  }
}

/** Drop the `exported` flag so the merged AST is clean. */
function stripExported(stmt: Statement): void {
  if (
    stmt.kind === "Assignment" ||
    stmt.kind === "ComponentDeclaration" ||
    stmt.kind === "ActionDeclaration" ||
    stmt.kind === "HookDeclaration"
  ) {
    delete (stmt as { exported?: boolean }).exported;
  }
}

/**
 * Build a scope-aware renamer bound to one module's rename maps. Mutates AST
 * nodes in place (the linker owns freshly-parsed trees).
 */
function makeRenamer(rec: ModuleRecord) {
  const shadow: Set<string>[] = []; // PLAIN local names only (loopVars binders)

  const shadowed = (name: string): boolean => {
    for (const set of shadow) if (set.has(name)) return true;
    return false;
  };
  const rPlain = (name: string): string => (shadowed(name) ? name : rec.renamePlain.get(name) ?? name);
  const rState = (name: string): string => rec.renameState.get(name) ?? name;
  const push = (names: string[]): void => {
    shadow.push(new Set(names));
  };
  const pop = (): void => {
    shadow.pop();
  };

  const patternNames = (p: DestructuringPattern): string[] => collectPatternNames(p);
  const paramNames = (params: ReadonlyArray<DeclParam | LambdaParam>): string[] => {
    const out: string[] = [];
    for (const p of params) {
      if (p.name) out.push(p.name);
      if (p.pattern) out.push(...patternNames(p.pattern));
    }
    return out;
  };
  const renameParamDefaults = (params: ReadonlyArray<DeclParam | LambdaParam>): void => {
    for (const p of params) if (p.defaultValue) renameExpr(p.defaultValue);
  };

  function renameExpr(expr: Expression): void {
    switch (expr.kind) {
      case "Literal":
        return;
      case "Identifier":
        expr.name = rPlain(expr.name);
        return;
      case "StateRef":
        expr.name = rState(expr.name);
        return;
      case "Array":
        for (const el of expr.elements) renameExpr(el);
        return;
      case "Object":
        for (const prop of expr.properties) {
          if (prop.computedKey) renameExpr(prop.computedKey);
          renameExpr(prop.value); // shorthand `{ x }` keeps key, renames the value Identifier
        }
        return;
      case "Member":
        renameExpr(expr.object);
        if (expr.computed) renameExpr(expr.computed);
        return; // never touch `.property`
      case "Unary":
        renameExpr(expr.argument);
        return;
      case "Binary":
        renameExpr(expr.left);
        renameExpr(expr.right);
        return;
      case "Ternary":
        renameExpr(expr.test);
        renameExpr(expr.consequent);
        renameExpr(expr.alternate);
        return;
      case "Call":
        expr.callee = rPlain(expr.callee);
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "MethodCall":
        renameExpr(expr.object);
        for (const a of expr.arguments) renameExpr(a);
        return; // never touch `.method`
      case "Invoke":
        renameExpr(expr.callee); // `$useX()` → StateRef callee handled by renameExpr
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "BuiltinCall":
        for (const a of expr.arguments) renameExpr(a);
        return; // internal name, never a user binding
      case "New":
        renameExpr(expr.callee);
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "Template":
        for (const e of expr.expressions) renameExpr(e);
        return;
      case "Spread":
        renameExpr(expr.argument);
        return;
      case "Lambda":
        push(paramNames(expr.params));
        renameParamDefaults(expr.params);
        renameExpr(expr.body); // may be a Block
        pop();
        return;
      case "Block":
        renameBlock(expr);
        return;
    }
  }

  /** Walk a block; block-local destructures / nested decls shadow LATER statements. */
  function renameBlock(block: BlockExpr): void {
    push([]);
    const scope = shadow[shadow.length - 1]!;
    for (const stmt of block.body) {
      renameStatement(stmt, false);
      addBlockLocals(stmt, scope);
    }
    pop();
  }

  function addBlockLocals(stmt: Statement, scope: Set<string>): void {
    if (stmt.kind === "DestructureStatement") {
      for (const name of collectPatternNames({ kind: stmt.patternKind, bindings: stmt.bindings })) scope.add(name);
    } else if (stmt.kind === "ComponentDeclaration" || stmt.kind === "ActionDeclaration") {
      scope.add(stmt.name);
    }
  }

  /** Top-level statements: destructuring binding names ARE module-locals (renamed). */
  function renameTopLevel(stmt: Statement): void {
    if (stmt.kind === "DestructureStatement") {
      renameExpr(stmt.expression);
      const renamePatternBindings = (
        bindings: DestructuringPattern["bindings"],
        kind: DestructuringPattern["kind"],
      ): void => {
        for (const b of bindings) {
          if (b.defaultValue) renameExpr(b.defaultValue);
          if (b.pattern) {
            renamePatternBindings(b.pattern.bindings, b.pattern.kind);
            continue;
          }
          const renamed = rPlain(b.name);
          // An object-pattern slot without an explicit source key reads the
          // property named like its binding (`{ title }` reads `.title`; the
          // evaluator uses `sourceKey ?? name`). Renaming the binding to
          // `__aN_title` must not change which property is read, so pin the
          // original name as the source key first.
          if (kind === "object" && !b.rest && b.sourceKey === undefined && renamed !== b.name) {
            b.sourceKey = b.name;
          }
          b.name = renamed;
        }
      };
      renamePatternBindings(stmt.bindings, stmt.patternKind);
      return;
    }
    renameStatement(stmt, true);
  }

  function renameStatement(stmt: Statement, topLevel: boolean): void {
    switch (stmt.kind) {
      case "Import":
        return;
      case "Assignment":
        stmt.identifier = stmt.isState ? rState(stmt.identifier) : rPlain(stmt.identifier);
        renameExpr(stmt.expression);
        return;
      case "ComponentDeclaration":
      case "ActionDeclaration":
        stmt.name = rPlain(stmt.name);
        push(paramNames(stmt.params));
        renameParamDefaults(stmt.params);
        renameBlock(stmt.body);
        pop();
        return;
      case "HookDeclaration":
        stmt.name = rState(stmt.name);
        push(paramNames(stmt.params));
        renameParamDefaults(stmt.params);
        renameBlock(stmt.body);
        pop();
        return;
      case "EffectDeclaration":
        for (const t of stmt.triggers) if (t.kind === "state") t.name = rState(t.name);
        renameBlock(stmt.body);
        return;
      case "Await":
        renameExpr(stmt.argument);
        return;
      case "Return":
        if (stmt.argument) renameExpr(stmt.argument);
        return;
      case "ExpressionStatement":
        renameExpr(stmt.expression);
        return;
      case "IfStatement":
        renameExpr(stmt.test);
        renameBlock(stmt.consequent);
        if (stmt.alternate) {
          if (stmt.alternate.kind === "IfStatement") renameStatement(stmt.alternate, false);
          else renameBlock(stmt.alternate);
        }
        return;
      case "SwitchStatement":
        renameExpr(stmt.discriminant);
        for (const c of stmt.cases) {
          if (c.test) renameExpr(c.test);
          for (const s of c.body) renameStatement(s, false);
        }
        return;
      case "ForOfStatement": {
        renameExpr(stmt.iterable);
        const names = stmt.pattern ? collectPatternNames(stmt.pattern) : [stmt.item];
        push(names);
        renameBlock(stmt.body);
        pop();
        return;
      }
      case "ForInStatement":
        renameExpr(stmt.iterable);
        push([stmt.item]);
        renameBlock(stmt.body);
        pop();
        return;
      case "ForClassicStatement": {
        const initNames: string[] = [];
        if (stmt.init && stmt.init.kind === "Assignment" && stmt.init.identifier) {
          initNames.push(stmt.init.identifier);
        }
        push(initNames);
        if (stmt.init) renameStatement(stmt.init, false);
        if (stmt.test) renameExpr(stmt.test);
        if (stmt.update) renameExpr(stmt.update);
        renameBlock(stmt.body);
        pop();
        return;
      }
      case "WhileStatement":
      case "DoWhileStatement":
        renameExpr(stmt.test);
        renameBlock(stmt.body);
        return;
      case "DestructureStatement":
        // Nested (block-local): rename RHS + defaults, but NOT binding names
        // (they're locals; `renameBlock` adds them to the shadow scope).
        renameExpr(stmt.expression);
        for (const b of stmt.bindings) if (b.defaultValue) renameExpr(b.defaultValue);
        if (topLevel) for (const b of stmt.bindings) b.name = rPlain(b.name);
        return;
      case "ThrowStatement":
        renameExpr(stmt.argument);
        return;
      case "TryStatement":
        renameBlock(stmt.block);
        if (stmt.catchBlock) {
          push(stmt.catchParam ? [stmt.catchParam] : []);
          renameBlock(stmt.catchBlock);
          pop();
        }
        if (stmt.finallyBlock) renameBlock(stmt.finallyBlock);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        return;
    }
  }

  return { renameTopLevel };
}
