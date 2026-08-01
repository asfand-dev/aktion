/**
 * Module linker for multi-file `.aktion` programs. Browser-safe — no `node:*`
 * imports; the host supplies I/O through a {@link ModuleResolver}.
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

import { parse, collectPatternNames } from "../parser/index.js";
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

interface ModuleRecord {
  id: number;
  path: string;
  program: Program;
  /** Resolved import edges (after path resolution). */
  edges: { stmt: ImportStatement; resolvedPath: string | null }[];
  /** Top-level declared names, by keyspace. */
  declaredPlain: Set<string>;
  declaredState: Set<string>;
  /** Exported subset, by keyspace. */
  exportedPlain: Set<string>;
  exportedState: Set<string>;
  /** Rename maps (own locals + imported aliases), by keyspace. */
  renamePlain: Map<string, string>;
  renameState: Map<string, string>;
}

/**
 * Link the import graph rooted at `entrySource`/`entryPath` into one program.
 */
export function linkProgram(
  entrySource: string,
  entryPath: string,
  resolver: ModuleResolver,
): LinkResult {
  const modules = new Map<string, ModuleRecord>();
  const order: string[] = []; // post-order: dependencies before dependents
  const visiting = new Set<string>();
  const diagnostics: LinkDiagnostic[] = [];
  let nextId = 0;

  const fail = (path: string, line: number, column: number, message: string): void => {
    // Path-prefix non-entry diagnostics so the author knows which file.
    diagnostics.push({
      line,
      column,
      message: path === entryPath ? message : `${path}: ${message}`,
      severity: "error",
    });
  };

  function load(path: string, sourceOverride: string | null): ModuleRecord | undefined {
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
        fail(entryPath, 0, 0, `Failed to load imported module "${path}".`);
        return undefined;
      }
    }

    const program = parse(src);
    // `parse()` records a bad statement's error and recovers rather than
    // throwing, so a dependency with a syntax error would otherwise link
    // "successfully" minus whatever statements were dropped. Surface each
    // module's own parse errors as link diagnostics — only the ENTRY's errors
    // travel out on `program.errors`, so a dependency's would vanish entirely.
    for (const e of program.errors) fail(path, e.line, e.column, e.message);
    const rec: ModuleRecord = {
      id: nextId++,
      path,
      program,
      edges: [],
      declaredPlain: new Set(),
      declaredState: new Set(),
      exportedPlain: new Set(),
      exportedState: new Set(),
      renamePlain: new Map(),
      renameState: new Map(),
    };
    modules.set(path, rec);
    buildSymbolTable(rec);

    for (const stmt of program.statements) {
      if (stmt.kind !== "Import") continue;
      const resolved = resolver.resolve(stmt.source, path);
      rec.edges.push({ stmt, resolvedPath: resolved });
      if (resolved === null) {
        fail(path, stmt.loc?.line ?? 0, stmt.loc?.column ?? 0, `Cannot resolve import "${stmt.source}".`);
        continue;
      }
      load(resolved, null);
    }

    visiting.delete(path);
    order.push(path);
    return rec;
  }

  load(entryPath, entrySource);

  // Build rename maps: own declarations first (so imports can target them).
  // The ENTRY module keeps its own names CANONICAL — they are the program's
  // public surface: the `aktion` entry binding, and the `$state` names that
  // `serializeState` / `hydrateState` / `applyDelta` target. Only imported
  // (non-entry) modules are renamed for privacy + collision-freedom. This also
  // makes a single-file program a true no-op (its rename maps stay empty).
  for (const rec of modules.values()) {
    if (rec.path === entryPath) continue;
    for (const name of rec.declaredPlain) rec.renamePlain.set(name, `__a${rec.id}_${name}`);
    for (const name of rec.declaredState) rec.renameState.set(name, `__a${rec.id}_${name}`);
  }
  // Resolve imported aliases to the source module's renamed export.
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
            fail(rec.path, line, column, `"${stmt.source}" does not export \`$${spec.imported}\`.`);
            continue;
          }
          rec.renameState.set(spec.local, src.renameState.get(spec.imported) ?? `__a${src.id}_${spec.imported}`);
        } else {
          if (!src.exportedPlain.has(spec.imported)) {
            fail(rec.path, line, column, `"${stmt.source}" does not export \`${spec.imported}\`.`);
            continue;
          }
          rec.renamePlain.set(spec.local, src.renamePlain.get(spec.imported) ?? `__a${src.id}_${spec.imported}`);
        }
      }
    }
  }

  // Rename + merge in dependency order.
  const merged: Statement[] = [];
  for (const path of order) {
    const rec = modules.get(path)!;
    const renamer = makeRenamer(rec);
    for (const stmt of rec.program.statements) {
      if (stmt.kind === "Import") continue; // dropped
      renamer.renameTopLevel(stmt);
      stripExported(stmt);
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
  // program's merged AST deep-equals `parse(source)`.
  return {
    program: { statements: merged, errors: entryRec ? entryRec.program.errors : [] },
    diagnostics,
    dependencies: order.filter((p) => p !== entryPath),
  };
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
      const renamePatternBindings = (bindings: DestructuringPattern["bindings"]): void => {
        for (const b of bindings) {
          if (b.defaultValue) renameExpr(b.defaultValue);
          if (b.pattern) renamePatternBindings(b.pattern.bindings);
          else b.name = rPlain(b.name);
        }
      };
      renamePatternBindings(stmt.bindings);
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
