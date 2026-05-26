/**
 * Aktion 0.5 §27 — minimal in-process language service.
 *
 * Goal: ship the *data* a Language Server Protocol (LSP) implementation
 * would need — completions, diagnostics, hover info — as a pure
 * JSON-friendly API. A real LSP server can wrap these calls behind a
 * WebSocket / stdio transport; library consumers can also use them
 * directly inside in-browser editors.
 *
 * Surface
 * -------
 *
 *   - `getDiagnostics(source, library)` — every parse + schema error.
 *   - `getCompletions(source, position, library)` — component names,
 *     known prop names for the call site under the cursor, and state-tier
 *     keywords.
 *   - `getHoverInfo(source, position, library)` — the description /
 *     signature for the symbol under the cursor.
 *
 * Why not a real LSP? Network/process plumbing for a full LSP is an
 * order of magnitude more code than the language service it would wrap.
 * Shipping the projection makes the surface available to every host
 * today (LSP wrapper is straightforward when needed).
 */

import { parse } from "../parser/index.js";
import type { ComponentLibrary, ComponentSpec, PropSpec } from "../library/types.js";
import { findComponent } from "../library/registry.js";
import { validateProgramSchema } from "../library/validate.js";
import { findPositionalProp } from "../library/types.js";

export interface Position {
  /** 1-indexed line number. */
  line: number;
  /** 1-indexed column number. */
  column: number;
}

export interface Diagnostic {
  line: number;
  column: number;
  message: string;
  /** `error` when the program will not render; `warning` is reserved for the future. */
  severity: "error" | "warning";
}

export interface CompletionItem {
  /** Insertion text (the user types this to accept). */
  label: string;
  /**
   * What kind of symbol this is. Useful when the host wants to render
   * different icons per kind (LSP / editor UIs typically display these).
   */
  kind:
    | "component"
    | "prop"
    | "state"
    | "builtin"
    | "keyword";
  /** Short textual description. */
  detail?: string;
  /** Long-form documentation surfaced in a tooltip. */
  documentation?: string;
}

export interface HoverInfo {
  /** Markdown-friendly text rendered in the hover popup. */
  contents: string;
  /** Symbol kind for clients that prefer typed surfaces. */
  kind: "component" | "prop" | "state" | "builtin" | "unknown";
}

const KEYWORDS: ReadonlyArray<{ label: string; detail: string }> = [
  { label: "function",     detail: "Declare a component (PascalCase) or action (camelCase)" },
  { label: "effect",       detail: "Reactive side-effect: effect(() => { ... }, [deps])" },
  { label: "Router",       detail: "pages = Router({ '/': Home(), default: NotFound() })" },
  { label: "switch",       detail: "switch (value) { case …: …; break; default: … }" },
  { label: "for",          detail: "for (let x of xs) { … }" },
  { label: "if",           detail: "if (condition) { … } else { … }" },
  { label: "return",       detail: "Return value from a component or action" },
  { label: "let",          detail: "Declare a variable (reactive if $-prefixed)" },
  { label: "const",        detail: "Declare a constant" },
  { label: "emit",         detail: "emit('name', detail) — dispatch a CustomEvent" },
  { label: "cleanup",      detail: "Register an effect teardown callback" },
];

/**
 * Combine parse-level + schema-level diagnostics into one list. Every
 * entry has a `severity` field so editors can theme errors vs warnings
 * (in 0.5 every entry is currently `error` — there are no soft
 * warnings — but the surface stays future-proof).
 */
export function getDiagnostics(
  source: string,
  library: ComponentLibrary,
): Diagnostic[] {
  const program = parse(source);
  const schemaErrors = validateProgramSchema(program, library);
  return [
    ...program.errors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
      severity: "error" as const,
    })),
    ...schemaErrors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
      severity: "error" as const,
    })),
  ];
}

/**
 * Completion items for the cursor position `position`. Heuristics are
 * intentionally simple — the prompt + the closed schema (§16) make
 * deep static analysis unnecessary:
 *
 *   - Inside `(...)` after a known component name → the spec's prop
 *     names (filtered to unconsumed props).
 *   - After `$` → state-tier keywords (`$state`, `$persist`, …).
 *   - At top of line / inside a block → top-level keywords + the
 *     full library component list.
 */
export function getCompletions(
  source: string,
  position: Position,
  library: ComponentLibrary,
): CompletionItem[] {
  const ctx = analyseCursor(source, position);

  // After `$` — no specific suggestions in single-tier mode; surface
  // a generic hint so the editor doesn't blank out on `$x` lookups.
  if (ctx.afterDollar) {
    return [
      { label: "$name = value", kind: "state" as const, detail: "Declare or assign a reactive atom" },
    ];
  }

  // Inside a call's `(...)` argument list for a known component.
  if (ctx.insideCall && ctx.callee) {
    const spec = findComponent(library, ctx.callee);
    if (spec) {
      return propCompletions(spec);
    }
  }

  // Default: top-level keywords + all library component names.
  return [
    ...KEYWORDS.map((k) => ({ label: k.label, kind: "keyword" as const, detail: k.detail })),
    ...library.components.map((c) => ({
      label: c.name,
      kind: "component" as const,
      detail: signaturePreview(c),
      documentation: c.description,
    })),
  ];
}

/**
 * Hover info for the symbol under the cursor. Returns `null` when the
 * cursor is not over a recognised symbol.
 */
export function getHoverInfo(
  source: string,
  position: Position,
  library: ComponentLibrary,
): HoverInfo | null {
  const word = wordAt(source, position);
  if (!word) return null;
  const spec = findComponent(library, word);
  if (spec) {
    return {
      kind: "component",
      contents:
        `**${spec.name}** — ${spec.description ?? "Component."}\n\n` +
        `Signature: \`${signaturePreview(spec)}\``,
    };
  }
  if (word.startsWith("$")) {
    return { kind: "state", contents: `**${word}** — reactive state atom` };
  }
  const kw = KEYWORDS.find((k) => k.label === word);
  if (kw) {
    return { kind: "unknown", contents: `**${word}** — ${kw.detail}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CursorContext {
  /** Caller name when the cursor sits inside `Caller(...)`. */
  callee?: string;
  /** True when the cursor is past `(` and before the matching `)`. */
  insideCall: boolean;
  /** True when the previous non-whitespace token is `$` — user typing a tier. */
  afterDollar: boolean;
}

function analyseCursor(source: string, position: Position): CursorContext {
  const offset = lineColumnToOffset(source, position);
  const prefix = source.slice(0, offset);

  const afterDollar = /\$[A-Za-z_]*$/.test(prefix);

  // Walk backwards from the cursor to find an unbalanced `(`. If we
  // find one, capture the identifier (or `Caller(`-style) that
  // precedes it.
  let depth = 0;
  let openCallIdx = -1;
  for (let i = prefix.length - 1; i >= 0; i -= 1) {
    const ch = prefix[i]!;
    if (ch === ")") depth += 1;
    else if (ch === "(") {
      if (depth === 0) { openCallIdx = i; break; }
      depth -= 1;
    }
  }
  let callee: string | undefined;
  let insideCall = false;
  if (openCallIdx > 0) {
    insideCall = true;
    const upto = prefix.slice(0, openCallIdx);
    const m = /([A-Za-z_][\w]*)\s*$/.exec(upto);
    if (m) callee = m[1];
  }

  return { callee, insideCall, afterDollar };
}

function propCompletions(spec: ComponentSpec): CompletionItem[] {
  const positional = findPositionalProp(spec);
  return spec.props.map((prop) => ({
    label: `${prop.name}:`,
    kind: "prop" as const,
    detail: propDetail(prop, positional?.name === prop.name),
    documentation: prop.description,
  }));
}

function propDetail(prop: PropSpec, isPositional: boolean): string {
  const tags: string[] = [];
  if (isPositional) tags.push("positional");
  if (prop.required) tags.push("required");
  if (prop.enum) tags.push(`enum: ${prop.enum.map((e) => `"${e}"`).join(" | ")}`);
  const tagText = tags.length > 0 ? ` (${tags.join(", ")})` : "";
  return `${prop.type}${tagText}`;
}

function signaturePreview(spec: ComponentSpec): string {
  const positional = findPositionalProp(spec);
  const positionalLabel = positional ? positional.name : "";
  const rest = spec.props
    .filter((p) => p.name !== positional?.name)
    .map((p) => `${p.name}${p.optional || !p.required ? "?" : ""}: ${p.type}`)
    .join(", ");
  if (positionalLabel === "" && rest === "") return `${spec.name}()`;
  if (positionalLabel === "") return `${spec.name}(${rest})`;
  if (rest === "") return `${spec.name}(${positionalLabel})`;
  return `${spec.name}(${positionalLabel}, ${rest})`;
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

function wordAt(source: string, pos: Position): string | null {
  const offset = lineColumnToOffset(source, pos);
  // Expand left + right while we're on a word/identifier-like char.
  const isWord = (c: string): boolean => /[\w$]/.test(c);
  let start = offset;
  while (start > 0 && isWord(source[start - 1]!)) start -= 1;
  let end = offset;
  while (end < source.length && isWord(source[end]!)) end += 1;
  if (start === end) return null;
  return source.slice(start, end);
}
