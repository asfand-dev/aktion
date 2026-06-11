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
import { findPositionalProp, chooseNamedBagIndex, slotForNthPositional } from "../library/types.js";
import { keywordDocs, type KeywordDoc } from "../language/grammar.js";
import { builtinCatalog, findBuiltin } from "../language/builtins.js";
import { analyseCallContext } from "./signature-help.js";

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
  { label: "function",     detail: "Declare a component or action — either case works" },
  { label: "$effect",      detail: "Reactive side-effect: $effect(() => { ... }, [deps])" },
  { label: "$router",      detail: "pages = $router({ '/': Home(), default: NotFound() })" },
  { label: "switch",       detail: "switch (value) { case …: …; break; default: … }" },
  { label: "for",          detail: "for (let x of xs) { … }" },
  { label: "if",           detail: "if (condition) { … } else { … }" },
  { label: "return",       detail: "Return value from a component or action" },
  { label: "let",          detail: "Declare a variable (reactive if $-prefixed)" },
  { label: "const",        detail: "Declare a constant" },
  { label: "$emit",        detail: "$emit('name', detail) — dispatch a CustomEvent" },
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
 *   - After `$` → the reactive-atom hint + the `$`-builtin catalog.
 *   - Inside a component call's trailing `{ … }` props object → that
 *     component's prop names, FOLLOWED BY the general list (so you can
 *     still reference components / atoms / actions in prop values).
 *   - Everywhere else (top of line, inside a `[ … ]` children array, a
 *     `( … )` argument list) → the general list: author-declared symbols,
 *     keywords, and the full component library. Components are ALWAYS
 *     offered here — a children array like `Column([ Sidebar() ])` is the
 *     most common authoring position, so suppressing components there
 *     (the old behaviour) broke the headline autocomplete.
 */
export function getCompletions(
  source: string,
  position: Position,
  library: ComponentLibrary,
): CompletionItem[] {
  const ctx = analyseCursor(source, position);
  // Scope-aware symbols declared in THIS document — the author's own atoms,
  // components, and actions. Without these, autocomplete only ever knew the
  // library + reserved words (feedback §3.2 — the biggest hand-authoring
  // papercut). Parsing is cheap and tolerant: a partial/erroring program
  // still yields whatever declarations have streamed in so far.
  const user = collectUserSymbols(source);

  // After `$` — surface the reactive-atom hint plus the built-in catalog
  // (hooks, factories, namespaces), which also start with the `$` sigil.
  // Sourced from the single builtin catalog so new builtins appear here
  // automatically (`src/language/builtins.ts`).
  if (ctx.afterDollar) {
    return [
      ...user.atoms.map((name) => ({
        label: `$${name}`,
        kind: "state" as const,
        detail: "Reactive atom declared in this file",
      })),
      { label: "$name = value", kind: "state" as const, detail: "Declare or assign a reactive atom" },
      ...builtinCatalog.map((b) => ({
        label: b.signature,
        kind: "builtin" as const,
        detail: b.summary,
      })),
    ];
  }

  const general = generalCompletions(library, user);
  const call = analyseCallContext(source, position);

  // Inside a component call's named-props object `{ … }` — trailing,
  // leading, or a single all-named argument — offer the spec's prop names
  // first, then the general list. An object that binds POSITIONALLY under
  // the §19 rules (a payload for an object-typed slot) gets no prop names:
  // its keys are data, not props.
  if (ctx.objectCallee) {
    const spec = findComponent(library, ctx.objectCallee);
    if (spec) {
      const isNamedBag =
        !call ||
        call.objectArg === null ||
        chooseNamedBagIndex(call.args, spec) === call.argIndex;
      if (isNamedBag) return [...propCompletions(spec), ...general];
    }
    return general;
  }

  // Bare positional position inside a library call — when the slot the
  // argument will bind to carries an enum, offer its values first so
  // all-positional calls complete as well as named ones do.
  if (call?.callee && call.objectArg === null) {
    const spec = findComponent(library, call.callee);
    if (spec) {
      const bagIdx = chooseNamedBagIndex(call.args, spec);
      if (bagIdx !== call.argIndex) {
        let n = call.argIndex;
        if (bagIdx >= 0 && bagIdx < call.argIndex) n -= 1;
        const slot = slotForNthPositional(spec, n);
        if (slot?.enum && slot.enum.length > 0) {
          // Inside an open string literal the quotes are already typed.
          const prefix = source.slice(0, lineColumnToOffset(source, position));
          const inString = /["']([\w-]*)$/.test(prefix);
          const values = slot.enum.map((value) => ({
            label: inString ? value : `"${value}"`,
            kind: "prop" as const,
            detail: `${slot.name} value (${call.callee})`,
            documentation: slot.description,
          }));
          return [...values, ...general];
        }
      }
    }
  }

  return general;
}

/**
 * The "general" completion set: author-declared symbols, reserved keywords,
 * and the full component library. Offered at every position that is not after
 * a `$` and not inside a props object.
 */
function generalCompletions(library: ComponentLibrary, user: UserSymbols): CompletionItem[] {
  // Merge the curated `KEYWORDS` (which include non-reserved helpers like
  // `cleanup`) with the full reserved-word set from `keywordDocs`,
  // de-duplicated by label.
  const keywordItems = new Map<string, CompletionItem>();
  for (const [label, doc] of Object.entries(keywordDocs)) {
    keywordItems.set(label, {
      label,
      kind: "keyword",
      detail: doc.summary,
      documentation: `${doc.syntax}\n\n${doc.example}`,
    });
  }
  for (const k of KEYWORDS) {
    if (!keywordItems.has(k.label)) {
      keywordItems.set(k.label, { label: k.label, kind: "keyword", detail: k.detail });
    }
  }
  return [
    // Author-declared symbols first so they rank above the large library
    // list in editors that preserve provider order.
    ...user.components.map((name) => ({
      label: name,
      kind: "component" as const,
      detail: "Component declared in this file",
    })),
    ...user.actions.map((name) => ({
      label: name,
      kind: "builtin" as const,
      detail: "Action declared in this file",
    })),
    ...user.atoms.map((name) => ({
      label: `$${name}`,
      kind: "state" as const,
      detail: "Reactive atom declared in this file",
    })),
    ...keywordItems.values(),
    ...library.components.map((c) => ({
      label: c.name,
      kind: "component" as const,
      detail: signaturePreview(c),
      documentation: c.description,
    })),
  ];
}

/** Symbols declared in the current document, for scope-aware completions. */
interface UserSymbols {
  atoms: string[];
  components: string[];
  actions: string[];
}

/**
 * Parse `source` and collect the author's top-level reactive atoms,
 * component declarations (PascalCase functions), and action declarations
 * (camelCase functions). Tolerant of parse errors — the parser returns
 * whatever statements it recovered, which is exactly what we want while the
 * user is mid-edit.
 */
function collectUserSymbols(source: string): UserSymbols {
  const atoms = new Set<string>();
  const components = new Set<string>();
  const actions = new Set<string>();
  try {
    const program = parse(source);
    for (const stmt of program.statements) {
      if (stmt.kind === "Assignment" && stmt.isState && stmt.identifier) {
        atoms.add(stmt.identifier);
      } else if (stmt.kind === "ComponentDeclaration" && stmt.name) {
        components.add(stmt.name);
      } else if (stmt.kind === "ActionDeclaration" && stmt.name) {
        actions.add(stmt.name);
      }
    }
  } catch {
    // Never let completion crash the editor — fall back to no user symbols.
  }
  return { atoms: [...atoms], components: [...components], actions: [...actions] };
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
    // Runtime builtin (hook / factory / namespace) — rich signature + summary
    // sourced from the shared catalog (`src/language/builtins.ts`).
    const builtin = findBuiltin(word.slice(1));
    if (builtin) {
      return {
        kind: "builtin",
        contents: `**${builtin.sigil}** — ${builtin.summary}\n\nSignature: \`${builtin.signature}\``,
      };
    }
    return { kind: "state", contents: `**${word}** — reactive state atom` };
  }
  // Reserved-word hover: rich definition + syntax + example from the
  // shared keyword docs (single source of truth in `grammar.ts`).
  const doc = keywordDocs[word];
  if (doc) {
    return { kind: "unknown", contents: formatKeywordHover(word, doc) };
  }
  const kw = KEYWORDS.find((k) => k.label === word);
  if (kw) {
    return { kind: "unknown", contents: `**${word}** — ${kw.detail}` };
  }
  return null;
}

/** Render a keyword's docs as Markdown (definition, syntax, example). */
function formatKeywordHover(word: string, doc: KeywordDoc): string {
  return (
    `**${word}** — ${doc.summary}\n\n` +
    `**Syntax**\n\n\`\`\`js\n${doc.syntax}\n\`\`\`\n\n` +
    `**Example**\n\n\`\`\`js\n${doc.example}\n\`\`\``
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CursorContext {
  /**
   * The component call whose trailing props object `{ … }` the cursor sits
   * inside, if any. Drives prop-name completions.
   */
  objectCallee?: string;
  /** True when the previous non-whitespace token is `$` — user typing a tier. */
  afterDollar: boolean;
}

interface BracketFrame {
  bracket: "(" | "[" | "{";
  /** Identifier preceding a `(` — the callee. Empty for grouping/`[`/`{`. */
  callee: string;
}

/**
 * Analyse the text before the cursor with a bracket stack (skipping strings
 * and comments). The cursor is in a props object when the innermost open
 * bracket is `{` and there is an enclosing `(` call — the callee of that call
 * is the component whose props we complete.
 */
function analyseCursor(source: string, position: Position): CursorContext {
  const offset = lineColumnToOffset(source, position);
  const prefix = source.slice(0, offset);
  const afterDollar = /\$[A-Za-z_]*$/.test(prefix);

  const stack: BracketFrame[] = [];
  for (let i = 0; i < prefix.length; i += 1) {
    const ch = prefix[i]!;
    if (ch === "/" && prefix[i + 1] === "/") {
      while (i < prefix.length && prefix[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && prefix[i + 1] === "*") {
      i += 2;
      while (i < prefix.length && !(prefix[i] === "*" && prefix[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipStringLiteral(prefix, i, ch);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push({ bracket: ch, callee: ch === "(" ? identifierBefore(prefix, i) : "" });
    } else if (ch === ")" || ch === "]" || ch === "}") {
      stack.pop();
    }
  }

  let objectCallee: string | undefined;
  const top = stack[stack.length - 1];
  if (top && top.bracket === "{") {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i]!.bracket === "(") {
        const callee = stack[i]!.callee;
        if (callee) objectCallee = callee;
        break;
      }
    }
  }

  return { objectCallee, afterDollar };
}

/** Returns the index of the closing quote (or the last index if unterminated). */
function skipStringLiteral(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i;
    i += 1;
  }
  return source.length - 1;
}

function identifierBefore(source: string, openIndex: number): string {
  let end = openIndex;
  while (end > 0 && /\s/.test(source[end - 1]!)) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1]!)) start -= 1;
  return source.slice(start, end);
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
