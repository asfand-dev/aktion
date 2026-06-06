/**
 * Signature help for Aktion calls.
 *
 * When the cursor sits inside `Caller(…)`, report the callee's signature and
 * which parameter is active (the comma count at the call's depth). Resolves
 * library components, `$`-builtins, and the author's own components / actions
 * / hooks. Pure + DOM-free like the rest of the language service.
 */

import { parse } from "../parser/index.js";
import type { ComponentLibrary } from "../library/types.js";
import { defaultLibrary } from "../library/index.js";
import { getComponentCatalog, type ComponentEntry } from "../language/components.js";
import { findBuiltin } from "../language/builtins.js";
import type { Position } from "./language-service.js";

export interface ParameterInfo {
  label: string;
  documentation?: string;
}

export interface SignatureInfo {
  label: string;
  documentation?: string;
  parameters: ParameterInfo[];
}

export interface SignatureHelp {
  signatures: SignatureInfo[];
  activeSignature: number;
  activeParameter: number;
}

/**
 * Signature help for the call enclosing `position`, or `null` when the cursor
 * is not inside a recognised call.
 */
export function getSignatureHelp(
  source: string,
  position: Position,
  library: ComponentLibrary = defaultLibrary,
): SignatureHelp | null {
  const call = findActiveCall(source, position);
  if (!call || !call.callee) return null;

  const signature =
    libraryComponentSignature(call.callee, library) ??
    builtinSignature(call.callee) ??
    userSignature(call.callee, source);
  if (!signature) return null;

  const activeParameter =
    signature.parameters.length > 0
      ? Math.min(call.argIndex, signature.parameters.length - 1)
      : 0;
  return { signatures: [signature], activeSignature: 0, activeParameter };
}

// ---------------------------------------------------------------------------
// Signature builders
// ---------------------------------------------------------------------------

let cachedCatalog: { library: ComponentLibrary; byName: Record<string, ComponentEntry> } | null = null;

function catalogFor(library: ComponentLibrary): Record<string, ComponentEntry> {
  if (cachedCatalog && cachedCatalog.library === library) return cachedCatalog.byName;
  const byName: Record<string, ComponentEntry> = {};
  for (const entry of getComponentCatalog(library)) byName[entry.name] = entry;
  cachedCatalog = { library, byName };
  return byName;
}

function libraryComponentSignature(
  callee: string,
  library: ComponentLibrary,
): SignatureInfo | null {
  const entry = catalogFor(library)[callee];
  if (!entry) return null;
  return {
    label: entry.signature,
    documentation: entry.description,
    parameters: entry.params.map((p) => ({
      label: p.required ? p.name : `${p.name}?`,
      documentation: paramDoc(p.type, p.enumValues, p.description),
    })),
  };
}

function builtinSignature(callee: string): SignatureInfo | null {
  if (!callee.startsWith("$")) return null;
  const builtin = findBuiltin(callee.slice(1));
  if (!builtin) return null;
  return { label: builtin.signature, documentation: builtin.summary, parameters: [] };
}

function userSignature(callee: string, source: string): SignatureInfo | null {
  let program;
  try {
    program = parse(source);
  } catch {
    return null;
  }
  for (const stmt of program.statements) {
    const matches =
      (stmt.kind === "ComponentDeclaration" ||
        stmt.kind === "ActionDeclaration" ||
        stmt.kind === "HookDeclaration") &&
      stmt.name === callee;
    if (!matches) continue;
    const decl = stmt as { name: string; params: ReadonlyArray<{ name: string; optional?: boolean; rest?: boolean }> };
    const params = decl.params.map((p) => ({
      label: paramLabel(p),
    }));
    const label = `${callee}(${params.map((p) => p.label).join(", ")})`;
    return { label, documentation: `Declared in this file (${kindLabel(stmt.kind)}).`, parameters: params };
  }
  return null;
}

function paramLabel(p: { name: string; optional?: boolean; rest?: boolean }): string {
  if (p.rest) return `...${p.name}`;
  return p.optional ? `${p.name}?` : p.name;
}

function kindLabel(kind: string): string {
  if (kind === "ComponentDeclaration") return "component";
  if (kind === "ActionDeclaration") return "action";
  return "hook";
}

function paramDoc(type: string, enumValues?: readonly string[], description?: string): string {
  const parts: string[] = [type];
  if (enumValues && enumValues.length > 0) {
    parts.push(`enum: ${enumValues.map((e) => `"${e}"`).join(" | ")}`);
  }
  const head = parts.join(" — ");
  return description ? `${head}\n\n${description}` : head;
}

// ---------------------------------------------------------------------------
// Cursor → enclosing call
// ---------------------------------------------------------------------------

interface ActiveCall {
  callee: string;
  /** Zero-based index of the argument the cursor is in. */
  argIndex: number;
}

interface CallFrame {
  bracket: "(" | "[" | "{";
  callee: string;
  commas: number;
}

/**
 * Forward-scan to the cursor, maintaining a bracket stack so comma counting
 * respects nested arrays / objects. Strings and comments are skipped. The
 * nearest still-open `(` frame is the active call.
 */
function findActiveCall(source: string, position: Position): ActiveCall | null {
  const offset = lineColumnToOffset(source, position);
  const stack: CallFrame[] = [];

  for (let i = 0; i < offset; i += 1) {
    const ch = source[i]!;

    // Skip comments.
    if (ch === "/" && source[i + 1] === "/") {
      while (i < offset && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < offset && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    // Skip strings + template literals wholesale.
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i, ch, offset);
      continue;
    }

    if (ch === "(" || ch === "[" || ch === "{") {
      const callee = ch === "(" ? identifierBefore(source, i) : "";
      stack.push({ bracket: ch, callee, commas: 0 });
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      stack.pop();
      continue;
    }
    if (ch === "," && stack.length > 0) {
      stack[stack.length - 1]!.commas += 1;
    }
  }

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i]!;
    if (frame.bracket === "(") {
      return { callee: frame.callee, argIndex: frame.commas };
    }
  }
  return null;
}

/** Returns the index of the closing quote (or `limit-1` if unterminated). */
function skipString(source: string, start: number, quote: string, limit: number): number {
  let i = start + 1;
  while (i < limit) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i;
    i += 1;
  }
  return limit - 1;
}

function identifierBefore(source: string, parenIndex: number): string {
  let end = parenIndex;
  while (end > 0 && /\s/.test(source[end - 1]!)) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1]!)) start -= 1;
  return source.slice(start, end);
}

function lineColumnToOffset(source: string, pos: Position): number {
  let line = 1;
  let col = 1;
  for (let i = 0; i < source.length; i += 1) {
    if (line === pos.line && col === pos.column) return i;
    if (source[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return source.length;
}
