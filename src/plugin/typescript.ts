/**
 * The TypeScript frontend for `.aktion.ts` modules. Node-only: it loads a
 * TypeScript parser, so it ships in the `aktion-runtime/vite` entry and never
 * enters the browser bundle.
 *
 * Aktion's syntax is a subset of JavaScript, so a TypeScript module becomes
 * Aktion source by blanking every type annotation with spaces: the text keeps
 * its length and its line breaks, and every node the Aktion parser builds sits
 * at the line and column the author wrote. Diagnostics, coverage, effect keys
 * and `$store` identities all stay on the `.ts` file with no source map.
 *
 * Erasure is done by `ts-blank-space` (an optional peer dependency) behind the
 * small {@link TypeEraser} interface, so another position-preserving eraser can
 * replace it without touching anything else.
 */

import { createRequire } from "node:module";
import type * as TS from "typescript";
import {
  compileJavaScriptModule,
  type FrontendResult,
  type ModuleFrontend,
} from "../compiler/frontend.js";
import type { LinkDiagnostic } from "../compiler/linker.js";
import type { Program } from "../parser/types.js";

/** One diagnostic from a {@link TypeEraser}. Positions are 1-based. */
export interface TypeEraseDiagnostic {
  line: number;
  column: number;
  message: string;
  /** Stable code — `AKT-TS-ERASE` for non-erasable syntax, `AKT-TS-SYNTAX` for TypeScript syntax errors. */
  code?: string;
}

export interface TypeEraseResult {
  /**
   * JavaScript text with every type-only range replaced by spaces. Newlines are
   * kept, so `code.length === source.length` and every `\n` is where it was.
   */
  code: string;
  /** Non-erasable syntax and TypeScript syntax errors, each with its own position. */
  diagnostics: TypeEraseDiagnostic[];
}

/** Turn TypeScript into same-length JavaScript (see {@link TypeEraseResult}). Must not throw. */
export type TypeEraser = (source: string, path: string) => TypeEraseResult;

export interface TypeScriptFrontendOptions {
  /** Replace the default `ts-blank-space` eraser. */
  eraser?: TypeEraser;
}

/** The message every "install ts-blank-space" path shares. */
export const MISSING_ERASER_MESSAGE =
  "Compiling `.aktion.ts` needs the `ts-blank-space` package — `npm i -D ts-blank-space`.";

/* -------------------------------------------------------------------------- */
/*  Position helpers                                                           */
/* -------------------------------------------------------------------------- */

const isWhitespace = (ch: string | undefined): boolean =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v" ||
  ch === " " || ch === "﻿";

/**
 * Report why `code` cannot stand in for `source` position-for-position, or
 * `null` when it can. An eraser that moved a line break would mis-attribute
 * every diagnostic after it, which is worse than refusing the module.
 */
export function checkErasureInvariant(source: string, code: string): string | null {
  if (code.length !== source.length) {
    return `type erasure changed the length of the module (${source.length} → ${code.length} characters) — please report this`;
  }
  for (let i = 0; i < source.length; i += 1) {
    if ((source[i] === "\n") !== (code[i] === "\n")) {
      return "type erasure moved a line break — please report this";
    }
  }
  return null;
}

/**
 * Offsets of the `\n` characters that sit INSIDE an erased type range.
 *
 * Aktion ends a statement at a newline in places where JavaScript does not, so
 * a line break the eraser left behind can split a statement: erased
 * `const x = foo<⏎ Bar⏎>(1)` would read as `x = foo` followed by `(1)`. A
 * newline is soft when the nearest non-whitespace character before it AND the
 * nearest one after it were both erased (changed by the eraser) — it is then
 * surrounded by type syntax. The parser lexes soft newlines as whitespace
 * while still counting the line, so positions stay exact.
 *
 * A newline after a fully erased statement (`type A = {…}`) stays hard: the
 * character after it belongs to the next statement and was not erased.
 */
export function computeSoftNewlines(source: string, code: string): Set<number> {
  const soft = new Set<number>();
  const erased = (i: number): boolean => i >= 0 && i < source.length && code[i] !== source[i];
  // Index of the previous / next non-whitespace character, precomputed in two
  // passes so the whole computation stays linear.
  const prevNonWs = new Int32Array(source.length);
  let last = -1;
  for (let i = 0; i < source.length; i += 1) {
    prevNonWs[i] = last;
    if (!isWhitespace(source[i])) last = i;
  }
  let next = -1;
  for (let i = source.length - 1; i >= 0; i -= 1) {
    if (source[i] === "\n" && erased(prevNonWs[i]!) && erased(next)) soft.add(i);
    if (!isWhitespace(source[i])) next = i;
  }
  return soft;
}

/** Replace `source[start, end)` with spaces, keeping line breaks. */
function blankRange(text: string, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i += 1) {
    const ch = text[i]!;
    out += ch === "\n" || ch === "\r" ? ch : " ";
  }
  return text.slice(0, start) + out + text.slice(end);
}

/* -------------------------------------------------------------------------- */
/*  ts-blank-space eraser                                                      */
/* -------------------------------------------------------------------------- */

interface BlankSpaceModule {
  blankSourceFile(source: TS.SourceFile, onError?: (node: TS.Node) => void): string;
}

/** Message for a node ts-blank-space reports as non-erasable. */
function nonErasableMessage(ts: typeof TS, node: TS.Node): string {
  const SK = ts.SyntaxKind;
  switch (node.kind) {
    case SK.EnumDeclaration:
      return 'TypeScript enums are not erasable — use a plain object (`const E = { A: "a" }`) or a string union.';
    case SK.ModuleDeclaration:
      return "TypeScript namespaces are not supported in Aktion modules — use an ordinary module.";
    // ts-blank-space reports a parameter property by its modifier
    // (`constructor(private x)` → the `private` keyword).
    case SK.Parameter:
    case SK.Constructor:
    case SK.PublicKeyword:
    case SK.PrivateKeyword:
    case SK.ProtectedKeyword:
    case SK.ReadonlyKeyword:
    case SK.OverrideKeyword:
      return "Parameter properties are not supported (Aktion has no classes).";
    case SK.ImportEqualsDeclaration:
    case SK.ExportAssignment:
      return "CommonJS-style TypeScript imports/exports are not supported — use `import { … } from`.";
    case SK.TypeAssertionExpression:
      return "Angle-bracket type assertions are not supported — use `expr as T` (it is erased).";
    case SK.Decorator:
      return "Decorators are not supported in Aktion modules.";
    default:
      return `This TypeScript syntax (${SK[node.kind]}) has runtime meaning and cannot be erased — rewrite it as plain JavaScript.`;
  }
}

function position(sf: TS.SourceFile, offset: number): { line: number; column: number } {
  const { line, character } = sf.getLineAndCharacterOfPosition(offset);
  return { line: line + 1, column: character + 1 };
}

/**
 * Build an eraser over `ts-blank-space`. `ts` must be the exact TypeScript
 * instance `ts-blank-space` itself imports: its `SyntaxKind` numbers differ
 * between TypeScript versions, so a `SourceFile` from another copy produces
 * wrong output.
 */
function createBlankSpaceEraser(mod: BlankSpaceModule, ts: typeof TS): TypeEraser {
  const languageOptions: TS.CreateSourceFileOptions = {
    languageVersion: ts.ScriptTarget.ESNext,
    impliedNodeFormat: ts.ModuleKind.ESNext,
  };
  // Same options ts-blank-space uses for its own `tsBlankSpace(text)` entry.
  if (ts.JSDocParsingMode) {
    (languageOptions as { jsDocParsingMode?: TS.JSDocParsingMode }).jsDocParsingMode = ts.JSDocParsingMode.ParseNone;
  }

  return (source, path) => {
    const diagnostics: TypeEraseDiagnostic[] = [];
    let sf: TS.SourceFile;
    try {
      sf = ts.createSourceFile(path, source, languageOptions, /* setParentNodes */ false, ts.ScriptKind.TS);
    } catch (err) {
      return {
        code: source,
        diagnostics: [{ line: 1, column: 1, message: `TypeScript could not read this module: ${String(err)}`, code: "AKT-TS-SYNTAX" }],
      };
    }

    // Syntax errors: ts-blank-space does not report them — `let x: = 1;` would
    // silently erase to `let x  = 1;`. `parseDiagnostics` is internal but
    // stable within the TypeScript range ts-blank-space pins.
    const parseDiagnostics = (sf as unknown as { parseDiagnostics?: TS.DiagnosticWithLocation[] }).parseDiagnostics ?? [];
    for (const d of parseDiagnostics) {
      diagnostics.push({
        ...position(sf, d.start ?? 0),
        message: `TypeScript syntax error: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
        code: "AKT-TS-SYNTAX",
      });
    }

    // Non-erasable syntax ts-blank-space reports, plus decorators, which every
    // eraser passes through untouched. Each range is blanked before parsing so
    // the Aktion parser does not report the same construct a second time and
    // the rest of the module still links.
    const rejected: Array<[number, number]> = [];
    const reject = (node: TS.Node): void => {
      const start = node.getStart(sf);
      diagnostics.push({ ...position(sf, start), message: nonErasableMessage(ts, node), code: "AKT-TS-ERASE" });
      // `<T>expr`: blank the `<T>` only, so the expression still parses.
      const end = ts.isTypeAssertionExpression(node) ? node.expression.getStart(sf) : node.getEnd();
      rejected.push([start, end]);
    };
    const findDecorators = (node: TS.Node): void => {
      if (node.kind === ts.SyntaxKind.Decorator) {
        reject(node);
        return;
      }
      ts.forEachChild(node, findDecorators);
    };
    findDecorators(sf);

    let code: string;
    try {
      code = mod.blankSourceFile(sf, (node) => reject(node));
    } catch (err) {
      return {
        code: source,
        diagnostics: [...diagnostics, { line: 1, column: 1, message: `Type erasure failed: ${String(err)}`, code: "AKT-TS-ERASE" }],
      };
    }
    for (const [start, end] of rejected) code = blankRange(code, start, end);
    diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
    return { code, diagnostics };
  };
}

/* -------------------------------------------------------------------------- */
/*  Frontend                                                                   */
/* -------------------------------------------------------------------------- */

const EMPTY_PROGRAM = (): Program => ({ statements: [], errors: [] });

/** A `typescript` frontend over any {@link TypeEraser}. */
export function typeScriptFrontendFromEraser(eraser: TypeEraser): ModuleFrontend {
  return {
    language: "typescript",
    compile(source: string, path: string): FrontendResult {
      let erased: TypeEraseResult;
      try {
        erased = eraser(source, path);
      } catch (err) {
        return {
          program: EMPTY_PROGRAM(),
          diagnostics: [{ line: 1, column: 1, message: `Type erasure failed: ${String(err)}`, severity: "error", code: "AKT-TS-ERASE" }],
          aktionSource: source,
        };
      }
      const toLink = (d: TypeEraseDiagnostic): LinkDiagnostic => ({
        line: d.line,
        column: d.column,
        message: d.message,
        severity: "error",
        ...(d.code ? { code: d.code } : {}),
      });
      const broken = checkErasureInvariant(source, erased.code);
      if (broken) {
        return {
          program: EMPTY_PROGRAM(),
          diagnostics: [...erased.diagnostics.map(toLink), { line: 1, column: 1, message: broken, severity: "error", code: "AKT-TS-ERASE" }],
          aktionSource: erased.code,
        };
      }
      const result = compileJavaScriptModule(erased.code, path, {
        softNewlines: computeSoftNewlines(source, erased.code),
      });
      return {
        ...result,
        diagnostics: [...erased.diagnostics.map(toLink), ...result.diagnostics],
        aktionSource: erased.code,
      };
    },
  };
}

/**
 * A stand-in `typescript` frontend that reports one diagnostic per module —
 * used when `ts-blank-space` is not installed, so a project that never writes
 * `.aktion.ts` never needs it, and one that does gets told what to install.
 */
export function unavailableTypeScriptFrontend(message: string = MISSING_ERASER_MESSAGE): ModuleFrontend {
  return {
    language: "typescript",
    compile(source: string): FrontendResult {
      return {
        program: EMPTY_PROGRAM(),
        diagnostics: [{ line: 1, column: 1, message, severity: "error", code: "AKT-TS-MISSING" }],
        aktionSource: source,
      };
    },
  };
}

/** `require` rooted at this module — works in the ESM and the CJS build alike. */
function localRequire(): NodeRequire {
  return createRequire(import.meta.url);
}

/** The TypeScript instance `ts-blank-space` imports (see {@link createBlankSpaceEraser}). */
function typescriptOfBlankSpace(req: NodeRequire): typeof TS {
  const entry = req.resolve("ts-blank-space");
  return createRequire(entry)("typescript") as typeof TS;
}

/**
 * Load the default `typescript` frontend. Asynchronous because `ts-blank-space`
 * is an ES module, and `import()` is the only way to load one on every Node
 * version the plugin supports (≥ 18). Rejects when `ts-blank-space` is missing.
 */
export async function loadTypeScriptFrontend(options: TypeScriptFrontendOptions = {}): Promise<ModuleFrontend> {
  if (options.eraser) return typeScriptFrontendFromEraser(options.eraser);
  const req = localRequire();
  const mod = (await import("ts-blank-space")) as unknown as BlankSpaceModule;
  return typeScriptFrontendFromEraser(createBlankSpaceEraser(mod, typescriptOfBlankSpace(req)));
}

/**
 * Synchronous variant of {@link loadTypeScriptFrontend} for synchronous APIs
 * (`compileAktionFile`, `compileAktionSource`). It needs `require()` of an ES
 * module, which Node supports from 20.19 / 22.12; on older Node it throws, and
 * callers should `await loadTypeScriptFrontend()` instead.
 */
export function createTypeScriptFrontend(options: TypeScriptFrontendOptions = {}): ModuleFrontend {
  if (options.eraser) return typeScriptFrontendFromEraser(options.eraser);
  const req = localRequire();
  let mod: BlankSpaceModule;
  try {
    mod = req("ts-blank-space") as BlankSpaceModule;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ERR_REQUIRE_ESM" || code === "ERR_REQUIRE_ASYNC_MODULE") {
      throw new Error(
        "[aktion] This Node version cannot load `ts-blank-space` synchronously (require of an ES module needs " +
          "Node ≥ 20.19 / 22.12). Use `await loadTypeScriptFrontend()` (or the *Async compile helpers) instead.",
      );
    }
    throw new Error(`[aktion] ${MISSING_ERASER_MESSAGE}`);
  }
  return typeScriptFrontendFromEraser(createBlankSpaceEraser(mod, typescriptOfBlankSpace(req)));
}

/**
 * The `typescript` frontend if `ts-blank-space` can be loaded, otherwise the
 * {@link unavailableTypeScriptFrontend} stub. Never throws.
 */
export async function tryLoadTypeScriptFrontend(options: TypeScriptFrontendOptions = {}): Promise<ModuleFrontend> {
  try {
    return await loadTypeScriptFrontend(options);
  } catch {
    return unavailableTypeScriptFrontend();
  }
}

/** Synchronous {@link tryLoadTypeScriptFrontend}: the real frontend where Node can `require()` it, otherwise the stub. */
export function tryCreateTypeScriptFrontend(options: TypeScriptFrontendOptions = {}): ModuleFrontend {
  try {
    return createTypeScriptFrontend(options);
  } catch (err) {
    return unavailableTypeScriptFrontend((err as Error).message.replace(/^\[aktion\] /, ""));
  }
}
