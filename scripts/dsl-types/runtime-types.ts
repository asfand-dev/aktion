/**
 * Read types straight out of the runtime's TypeScript sources with the compiler
 * API, so the generated declarations for these surfaces cannot drift from the
 * implementation:
 *
 *   - the static `$util` helpers (`Util`), `$util.style` (`Style`),
 *     `$util.rules` (`Rules`), `$util.duration`, the reactive env snapshots
 *     (`EnvManager`), the `openWindow()` handle (`OpenedWindow`) and the
 *     `Validator` alias the rules return;
 *   - the exported parameter types those members mention (`UtilList<T>`,
 *     `UtilOpenUrlOptions`, …), copied verbatim from the runtime source;
 *   - the global names the TypeScript libs declare, which decide where a DSL
 *     name collides with a JavaScript global (`Map`) or a DOM global (`Text`).
 *
 * The runtime files are type-checked on their own (`noResolve`): `env.ts` imports
 * `EvaluationContext` for its factory, but no member printed here depends on it,
 * and resolving it would pull the whole runtime into the program.
 */
import type * as TS from "typescript";
import { resolve } from "node:path";

export interface PrintedMember {
  name: string;
  /** The member's type, printed by the checker (e.g. `(arr: unknown) => number`). */
  type: string;
  /** The member's JSDoc text, whitespace-collapsed ("" when undocumented). */
  docs: string;
}

/** A type declaration copied from a runtime source file. */
export interface PrintedDeclaration {
  name: string;
  /** The declaration as written (`export type …` / `export interface …`), led by its JSDoc. */
  text: string;
}

export interface RuntimeTypes {
  /** `typeof Util` members, without `duration` (printed separately). */
  util: PrintedMember[];
  /** `typeof Util.duration` members. */
  duration: PrintedMember[];
  style: PrintedMember[];
  rules: PrintedMember[];
  /** `EnvManager` members (`viewport`, `breakpoint`, `scroll`, `media`, `mouse`). */
  env: PrintedMember[];
  openedWindow: PrintedMember[];
  /** The declared type of the `Validator` alias in `namespaces-extra.ts`. */
  validator: string;
  /** `Validator`'s type-parameter list as written (`"<T = unknown>"`), or `""`. */
  validatorTypeParameters: string;
  /** {@link PRINTED_DECLARATIONS}, in that order. */
  declarations: PrintedDeclaration[];
}

/**
 * The exported runtime types the printed members mention, by source file. They
 * are copied into `aktion-runtime/dsl` as written; generation fails when a
 * printed member mentions a name that is neither declared here nor by the
 * generator (`builtins.ts`), so a new parameter type cannot ship undeclared.
 */
export const PRINTED_DECLARATIONS: Readonly<Record<string, readonly string[]>> = {
  "runtime/util.ts": [
    "UtilList", "UtilAggregateInput", "UtilPicked", "UtilOmitted", "UtilFieldPath", "UtilCompareOp",
    "UtilNumberFormatOptions", "UtilBlobLike", "UtilReadFileOptions", "UtilWindowFlag", "UtilWindowFeatures",
    "UtilOpenUrlOptions", "UtilOpenWindowOptions", "UtilWebManifestConfig", "UtilWebManifest",
  ],
  "runtime/namespaces-extra.ts": ["UtilStyleColorToken", "UtilStyleColor", "UtilStyleClassValue"],
};

export interface LibGlobals {
  /** Value names declared by `lib.es2022` (what a DSL program may use without the DOM lib). */
  esValues: ReadonlySet<string>;
  /** Type names declared by `lib.es2022`. */
  esTypes: ReadonlySet<string>;
  /** Value names `lib.dom` adds on top of `lib.es2022`. */
  domOnlyValues: ReadonlySet<string>;
  /**
   * For an `lib.es2022` value declared as `declare var X: XConstructor`, the
   * interface name (`MapConstructor`); `undefined` for any other shape.
   */
  constructorInterface(name: string): string | undefined;
}

const FORMAT_FLAGS = (ts: typeof TS): number =>
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

export function readRuntimeTypes(ts: typeof TS, repoRoot: string): RuntimeTypes {
  const file = (relative: string): string => resolve(repoRoot, "src", relative);
  const utilFile = file("runtime/util.ts");
  const extraFile = file("runtime/namespaces-extra.ts");
  const envFile = file("runtime/env.ts");
  const program = ts.createProgram([utilFile, extraFile, envFile], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: [],
    noResolve: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const flags = FORMAT_FLAGS(ts);

  const sourceFile = (path: string): TS.SourceFile => {
    const sf = program.getSourceFile(path);
    if (!sf) throw new Error(`emit-dsl-types: cannot load ${path}`);
    return sf;
  };
  const exportedSymbol = (path: string, name: string): TS.Symbol => {
    const sf = sourceFile(path);
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    const sym = moduleSymbol?.exports?.get(name as TS.__String);
    if (!sym) throw new Error(`emit-dsl-types: ${path} does not export ${name}`);
    return sym;
  };
  const membersOf = (type: TS.Type, location: TS.Node): PrintedMember[] =>
    checker.getPropertiesOfType(type).map((p) => ({
      name: p.name,
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(p, location), undefined, flags),
      docs: collapse(ts.displayPartsToString(p.getDocumentationComment(checker))),
    }));

  const utilSf = sourceFile(utilFile);
  const utilType = checker.getTypeOfSymbol(exportedSymbol(utilFile, "Util"));
  const durationSymbol = utilType.getProperty("duration");
  if (!durationSymbol) throw new Error("emit-dsl-types: Util.duration is missing");
  const durationType = checker.getTypeOfSymbolAtLocation(durationSymbol, utilSf);

  const extraSf = sourceFile(extraFile);
  const validatorDecl = extraSf.statements.find(
    (s): s is TS.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === "Validator",
  );
  if (!validatorDecl) throw new Error("emit-dsl-types: namespaces-extra.ts no longer declares `type Validator`");

  const declarations: PrintedDeclaration[] = [];
  for (const [relative, names] of Object.entries(PRINTED_DECLARATIONS)) {
    const sf = sourceFile(file(relative));
    for (const name of names) {
      const decl = sf.statements.find(
        (s): s is TS.TypeAliasDeclaration | TS.InterfaceDeclaration =>
          (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) && s.name.text === name,
      );
      const exported = decl && (ts.getModifiers(decl) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!decl || !exported) throw new Error(`emit-dsl-types: src/${relative} does not export a type or interface named ${name}`);
      // The JSDoc is the last `/** … */` comment in the declaration's leading trivia.
      const docs = (ts.getLeadingCommentRanges(sf.text, decl.getFullStart()) ?? [])
        .map((r) => sf.text.slice(r.pos, r.end))
        .filter((c) => c.startsWith("/**"));
      const doc = docs.length > 0 ? `${docs[docs.length - 1]}\n` : "";
      declarations.push({ name, text: `${doc}${decl.getText(sf)}` });
    }
  }

  return {
    util: membersOf(utilType, utilSf).filter((m) => m.name !== "duration"),
    duration: membersOf(durationType, utilSf),
    style: membersOf(checker.getTypeOfSymbol(exportedSymbol(extraFile, "Style")), extraSf),
    rules: membersOf(checker.getTypeOfSymbol(exportedSymbol(extraFile, "Rules")), extraSf),
    env: membersOf(checker.getDeclaredTypeOfSymbol(exportedSymbol(envFile, "EnvManager")), sourceFile(envFile)),
    openedWindow: membersOf(checker.getDeclaredTypeOfSymbol(exportedSymbol(utilFile, "OpenedWindow")), utilSf),
    // `InTypeAlias` prints the alias's target rather than its own name.
    validator: checker.typeToString(
      checker.getTypeAtLocation(validatorDecl.type),
      undefined,
      flags | ts.TypeFormatFlags.InTypeAlias,
    ),
    validatorTypeParameters: validatorDecl.typeParameters
      ? `<${validatorDecl.typeParameters.map((p) => p.getText(extraSf)).join(", ")}>`
      : "",
    declarations,
  };
}

/** Enumerate the globals `lib.es2022` (and `lib.dom` on top of it) declare. */
export function readLibGlobals(ts: typeof TS): LibGlobals {
  interface Scan { values: Set<string>; types: Set<string>; constructors: Map<string, string> }
  const scan = (lib: string[]): Scan => {
    const options: TS.CompilerOptions = { target: ts.ScriptTarget.ES2022, lib, types: [], noEmit: true };
    const host = ts.createCompilerHost(options);
    // A virtual, empty SCRIPT (no import/export), so its scope is the global scope.
    const probe = "/__aktion_dsl_globals_probe__.ts";
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion, ...rest) =>
      name === probe ? ts.createSourceFile(probe, "", languageVersion) : getSourceFile(name, languageVersion, ...rest);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (name) => name === probe || fileExists(name);
    const program = ts.createProgram([probe], options, host);
    const checker = program.getTypeChecker();
    const sf = program.getSourceFile(probe);
    if (!sf) throw new Error("emit-dsl-types: the lib probe file was not loaded");
    const out: Scan = { values: new Set(), types: new Set(), constructors: new Map() };
    for (const sym of checker.getSymbolsInScope(sf, ts.SymbolFlags.Value | ts.SymbolFlags.Type)) {
      if (sym.flags & ts.SymbolFlags.Type) out.types.add(sym.name);
      if (!(sym.flags & ts.SymbolFlags.Value)) continue;
      out.values.add(sym.name);
      // `declare var Map: MapConstructor;` — the constructor interface a DSL
      // component of the same name can merge its call signatures into.
      const decl = sym.valueDeclaration;
      if (decl && ts.isVariableDeclaration(decl) && decl.type && ts.isTypeReferenceNode(decl.type)) {
        out.constructors.set(sym.name, decl.type.typeName.getText());
      }
    }
    return out;
  };

  const es = scan(["lib.es2022.d.ts"]);
  const dom = scan(["lib.es2022.d.ts", "lib.dom.d.ts"]);
  return {
    esValues: es.values,
    esTypes: es.types,
    domOnlyValues: new Set([...dom.values].filter((n) => !es.values.has(n))),
    constructorInterface: (name) => es.constructors.get(name),
  };
}
