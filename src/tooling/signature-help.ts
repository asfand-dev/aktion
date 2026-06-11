/**
 * Signature help for Aktion calls.
 *
 * When the cursor sits inside `Caller(…)`, report the callee's signature and
 * which parameter is active. The active parameter follows the §19 flexible
 * call-binding rules (shared with the runtime via `chooseNamedBagIndex` /
 * `slotForNthPositional`):
 *
 *   - positional arguments highlight the slot they will bind to — the first
 *     positional maps to the `(positional)` slot, later ones to the next
 *     unfilled slots in declaration order, so all-positional calls track
 *     the signature correctly;
 *   - inside the named-props object (trailing, leading, or a single
 *     all-named argument) the highlighted parameter is the prop whose key
 *     the cursor is on — `Button("Save", { variant: ‸ })` highlights
 *     `variant`, not "argument #1";
 *   - an object argument that binds positionally (payload for an
 *     object-typed slot) highlights that slot.
 *
 * Resolves library components, `$`-builtins, and the author's own
 * components / actions / hooks. Pure + DOM-free like the rest of the
 * language service.
 */

import { parse } from "../parser/index.js";
import type { ComponentLibrary, ComponentSpec } from "../library/types.js";
import { chooseNamedBagIndex, slotForNthPositional } from "../library/types.js";
import { findComponent } from "../library/registry.js";
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
  /**
   * Index into `signatures[activeSignature].parameters`. May equal
   * `parameters.length` (out of range) when no parameter should be
   * highlighted — e.g. the cursor is on a not-yet-matching object key or
   * past the last slot of an all-positional call.
   */
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

  const spec = findComponent(library, call.callee);
  if (spec) {
    const signature = libraryComponentSignature(call.callee, library);
    if (!signature) return null;
    const activeParameter = resolveActiveSlot(call, spec, signature.parameters.length);
    return { signatures: [signature], activeSignature: 0, activeParameter };
  }

  const signature = builtinSignature(call.callee) ?? userSignature(call.callee, source);
  if (!signature) return null;
  const activeParameter = resolveDeclaredParam(call, signature.parameters.map((p) => p.label));
  return { signatures: [signature], activeSignature: 0, activeParameter };
}

/**
 * Map the cursor's argument context onto a library spec's prop index using
 * the same binding rules the runtime applies.
 */
function resolveActiveSlot(call: ActiveCall, spec: ComponentSpec, paramCount: number): number {
  const noHighlight = paramCount; // out-of-range index → editors highlight nothing
  const bagIdx = chooseNamedBagIndex(call.args, spec);

  // Cursor inside the named-props object → highlight the prop whose key the
  // cursor is on (or prefix-matches the key being typed).
  if (call.objectArg !== null && call.argIndex === bagIdx) {
    const key = call.objectArg.activeKey;
    if (!key) return noHighlight;
    const exact = spec.props.findIndex((p) => p.name === key || (p.aliases?.includes(key) ?? false));
    if (exact >= 0) return exact;
    const prefix = spec.props.findIndex((p) => p.name.startsWith(key));
    return prefix >= 0 ? prefix : noHighlight;
  }

  // Positional context: the cursor's argument binds as the n-th positional,
  // where the named-props object (if already present) is excluded.
  let n = call.argIndex;
  if (bagIdx >= 0 && bagIdx < call.argIndex) n -= 1;
  const slot = slotForNthPositional(spec, n);
  if (!slot) return noHighlight;
  const index = spec.props.indexOf(slot);
  return index >= 0 ? index : noHighlight;
}

/**
 * Active parameter for user components / actions / hooks (declared params,
 * no spec). Positional commas map 1:1; inside a trailing object the key is
 * matched against the declared parameter names.
 */
function resolveDeclaredParam(call: ActiveCall, paramLabels: string[]): number {
  if (paramLabels.length === 0) return 0;
  const names = paramLabels.map((label) => label.replace(/^\.\.\./, "").replace(/\?$/, ""));
  if (call.objectArg !== null) {
    const key = call.objectArg.activeKey;
    if (key) {
      const exact = names.indexOf(key);
      if (exact >= 0) return exact;
      const prefix = names.findIndex((name) => name.startsWith(key));
      if (prefix >= 0) return prefix;
    }
    return paramLabels.length;
  }
  return Math.min(call.argIndex, paramLabels.length - 1);
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

/** Per-argument shape gathered by the scanner (feeds `chooseNamedBagIndex`). */
interface ScannedArg {
  /** Top-level keys when the argument is an object literal; null otherwise. */
  objectKeys: string[] | null;
}

interface ActiveObjectContext {
  /**
   * The prop key the cursor is on: the key whose value region contains the
   * cursor, or the partial identifier being typed in key position. Empty
   * when the cursor sits before any key (e.g. right after `{`).
   */
  activeKey: string;
}

export interface ActiveCall {
  callee: string;
  /** Zero-based index of the argument the cursor is in. */
  argIndex: number;
  /** Shapes of every argument seen so far (the cursor's one included). */
  args: ScannedArg[];
  /** Set when the cursor is inside an object literal that IS the argument. */
  objectArg: ActiveObjectContext | null;
}

/**
 * Expose the cursor → enclosing-call analysis so other language-service
 * surfaces (completions) can apply the same §19 binding rules without
 * re-implementing the scan.
 */
export function analyseCallContext(source: string, position: Position): ActiveCall | null {
  return findActiveCall(source, position);
}

interface ObjectInfo {
  keys: string[];
  /** Last key whose `:` was passed at this object's top level (cursor may be in its value). */
  valueKey: string | null;
  /** True between an argument-separating comma (or `{`) and the next `:`. */
  expectingKey: boolean;
  /** Identifier accumulated in key position (the key currently being typed). */
  pendingKey: string;
}

interface ScanFrame {
  bracket: "(" | "[" | "{";
  callee: string;
  commas: number;
  /** Call frames: shape info per completed/started argument. */
  args: ScannedArg[];
  /** Object frame bookkeeping (only for `{` frames). */
  object: ObjectInfo | null;
  /** For `{` frames opened directly as a call argument: the arg's record. */
  argRecord: ScannedArg | null;
}

/**
 * Forward-scan to the cursor, maintaining a bracket stack so comma counting
 * respects nested arrays / objects. Strings and comments are skipped. The
 * nearest still-open `(` frame is the active call; for object-literal
 * arguments the scanner also records their top-level keys and which key the
 * cursor is on, so the caller can apply the §19 binding rules.
 */
function findActiveCall(source: string, position: Position): ActiveCall | null {
  const offset = lineColumnToOffset(source, position);
  const stack: ScanFrame[] = [];

  const currentArg = (frame: ScanFrame): ScannedArg => {
    while (frame.args.length <= frame.commas) frame.args.push({ objectKeys: null });
    return frame.args[frame.commas]!;
  };

  const flushPendingKey = (obj: ObjectInfo, asShorthand: boolean): void => {
    if (obj.pendingKey && asShorthand) obj.keys.push(obj.pendingKey);
    obj.pendingKey = "";
  };

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

    const top = stack[stack.length - 1];

    if (ch === "(" || ch === "[" || ch === "{") {
      const callee = ch === "(" ? identifierBefore(source, i) : "";
      let argRecord: ScannedArg | null = null;
      let object: ObjectInfo | null = null;
      if (ch === "{") {
        object = { keys: [], valueKey: null, expectingKey: true, pendingKey: "" };
        // An object opening directly inside a call frame is (the start of)
        // that argument's value — link it so its keys feed the arg shape.
        if (top && top.bracket === "(") {
          const arg = currentArg(top);
          if (arg.objectKeys === null) arg.objectKeys = object.keys;
          argRecord = arg;
        }
      }
      stack.push({ bracket: ch, callee, commas: 0, args: [], object, argRecord });
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      const closing = stack.pop();
      if (closing?.bracket === "{" && closing.object) {
        flushPendingKey(closing.object, closing.object.expectingKey);
      }
      continue;
    }

    if (!top) continue;

    if (ch === ",") {
      top.commas += 1;
      if (top.bracket === "(") currentArg(top);
      if (top.object) {
        flushPendingKey(top.object, top.object.expectingKey);
        top.object.expectingKey = true;
        top.object.valueKey = null;
      }
      continue;
    }

    if (top.object) {
      const obj = top.object;
      if (obj.expectingKey) {
        if (/[\w$]/.test(ch)) {
          obj.pendingKey += ch;
        } else if (ch === ":") {
          obj.keys.push(obj.pendingKey);
          obj.valueKey = obj.pendingKey;
          obj.pendingKey = "";
          obj.expectingKey = false;
        } else if (ch === "." && source.slice(i, i + 3) === "...") {
          // Spread — no key.
          obj.pendingKey = "";
          obj.expectingKey = false;
          i += 2;
        } else if (!/\s/.test(ch)) {
          // Computed key or other syntax — give up on this entry's key.
          obj.pendingKey = "";
        }
      }
      continue;
    }
  }

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i]!;
    if (frame.bracket !== "(") continue;
    // Materialise the in-progress argument so shapes include it.
    while (frame.args.length <= frame.commas) frame.args.push({ objectKeys: null });

    // Is the cursor inside an object literal that is this call's argument?
    let objectArg: ActiveObjectContext | null = null;
    const inner = stack[i + 1];
    if (inner && inner.bracket === "{" && inner.object && inner.argRecord) {
      const obj = inner.object;
      objectArg = { activeKey: obj.expectingKey ? obj.pendingKey : (obj.valueKey ?? "") };
    }

    return {
      callee: frame.callee,
      argIndex: frame.commas,
      args: frame.args.map((a) => ({ objectKeys: a.objectKeys })),
      objectArg,
    };
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
