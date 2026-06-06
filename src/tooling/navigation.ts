/**
 * Code navigation for Aktion — definitions, references, rename, document
 * highlights, and the document outline.
 *
 * Like the rest of the language service (`./language-service.ts`) these are
 * pure, JSON-friendly functions: feed in source + a cursor position, get back
 * 1-indexed ranges. A VS Code extension / LSP server maps them onto its own
 * range types.
 *
 * Resolution is file-scoped and tolerant of parse errors (it works off the
 * raw token stream, never throwing). The navigable symbols are the four
 * top-level, file-global declaration kinds the runtime hoists:
 *
 *   - reactive atoms        `$count = 0`           (StateIdentifier)
 *   - components            `function Card() {}`   (PascalCase Identifier)
 *   - actions               `function save() {}`   (camelCase Identifier)
 *   - hooks                 `function $useX() {}`  (StateIdentifier)
 *
 * plus `import { … }` bindings. Locals / params are intentionally out of scope
 * for definition + rename (scope analysis would be overkill); clicking one
 * still yields same-name document highlights, which is genuinely useful.
 */

import { tokenize, type Token } from "../parser/lexer.js";
import type { Position } from "./language-service.js";

export interface Range {
  /** 1-indexed inclusive start. */
  start: Position;
  /** 1-indexed exclusive end (column points one past the last character). */
  end: Position;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface RenameResult {
  edits: TextEdit[];
  /** Set when the rename is rejected (the symbol cannot be renamed safely). */
  error?: string;
}

export type SymbolKind = "component" | "action" | "hook" | "state" | "import";

/**
 * Resolved go-to-definition target. Cross-file navigation lives in the host
 * (it must read the imported file), so the service classifies the cursor:
 *
 *   - `local`          → a declaration in THIS file (`range` is set).
 *   - `import-binding` → an imported name; the host resolves `moduleSource`
 *                        to a file and looks up `imported` there.
 *   - `module`         → the module specifier string itself (open the file).
 */
export interface DefinitionTarget {
  kind: "local" | "import-binding" | "module";
  /** Set for `kind: "local"` — the declaration range in this file. */
  range?: Range;
  /** Set for `kind: "import-binding"` — the name as exported by the module. */
  imported?: string;
  /** Set for `kind: "import-binding"` — whether the binding is a `$state` atom. */
  isState?: boolean;
  /** Set for `import-binding` + `module` — the raw module specifier. */
  moduleSource?: string;
}

export interface DocumentSymbol {
  /** Display name — includes the `$` sigil for state atoms / hooks. */
  name: string;
  /** Human-readable category, e.g. `"component"`. */
  detail: string;
  kind: SymbolKind;
  /** Span used for the outline row (here: the name token). */
  range: Range;
  /** Span the editor reveals/selects when the row is picked (the name). */
  selectionRange: Range;
}

interface SymbolDecl {
  /** Bare name without the `$` sigil. */
  name: string;
  kind: Exclude<SymbolKind, never>;
  /** True for `$`-prefixed symbols (atoms, hooks). */
  sigil: boolean;
  range: Range;
}

interface SymbolTable {
  /** `$`-namespace: atoms + hooks, keyed by bare name. */
  state: Map<string, SymbolDecl>;
  /** Identifier namespace: components + actions, keyed by name. */
  ident: Map<string, SymbolDecl>;
  /** All declarations in source order (for the document outline). */
  all: SymbolDecl[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Location of the declaration for the symbol under `position`, or `null` when
 * the cursor is not over a navigable, file-scoped symbol.
 */
export function getDefinition(source: string, position: Position): Range | null {
  const tokens = tokenize(source);
  const tok = findNameTokenAt(tokens, position);
  if (!tok) return null;
  const sym = resolveSymbol(tokens, tok);
  return sym ? sym.range : null;
}

/**
 * Classify the go-to-definition target under `position`. Unlike
 * `getDefinition` (which only ever resolves within the current file), this
 * also recognises imported bindings and the module specifier string so a host
 * can perform cross-file navigation. Returns `null` when there is nothing to
 * jump to.
 */
export function getDefinitionTarget(source: string, position: Position): DefinitionTarget | null {
  const tokens = tokenize(source);
  const imports = parseImports(tokens);

  // On the module specifier string → open that file.
  for (const clause of imports) {
    if (clause.sourceRange && positionInRange(position, clause.sourceRange)) {
      return { kind: "module", moduleSource: clause.source };
    }
  }

  const tok = findNameTokenAt(tokens, position);
  if (!tok) return null;
  const wantsState = tok.type === "StateIdentifier";

  // An imported binding (anywhere it is used, including the import clause) →
  // resolve cross-file against the module it came from.
  for (const clause of imports) {
    for (const spec of clause.specifiers) {
      if (spec.local === tok.value && spec.isState === wantsState) {
        return {
          kind: "import-binding",
          imported: spec.imported,
          isState: spec.isState,
          moduleSource: clause.source,
        };
      }
    }
  }

  // A file-local declaration.
  const sym = resolveSymbol(tokens, tok);
  if (sym && sym.kind !== "import") return { kind: "local", range: sym.range };
  return null;
}

/**
 * Find the declaration of a top-level `name` in `source` (used by a host to
 * land on an imported symbol's definition in another file). `isState`
 * disambiguates the `$`-namespace from the identifier namespace.
 */
export function findDeclaration(source: string, name: string, isState: boolean): Range | null {
  const table = collectSymbols(tokenize(source));
  const decl = isState ? table.state.get(name) : table.ident.get(name);
  if (!decl || decl.kind === "import") return null;
  return decl.range;
}

/**
 * Every occurrence of the symbol under `position`. For a known file-scoped
 * declaration this is precise; for an unrecognised identifier it falls back to
 * same-name, same-kind tokens (handy as document highlights).
 */
export function getReferences(
  source: string,
  position: Position,
  options: { includeDeclaration?: boolean } = {},
): Range[] {
  const includeDeclaration = options.includeDeclaration ?? true;
  const tokens = tokenize(source);
  const tok = findNameTokenAt(tokens, position);
  if (!tok) return [];
  const refs = occurrences(tokens, tok.type, tok.value);
  if (includeDeclaration) return refs;
  const sym = resolveSymbol(tokens, tok);
  if (!sym) return refs;
  return refs.filter((r) => !rangesEqual(r, sym.range));
}

/**
 * Highlight all occurrences of the symbol under `position` (the editor paints
 * these when the cursor rests on a name). Always includes the declaration.
 */
export function getDocumentHighlights(source: string, position: Position): Range[] {
  return getReferences(source, position, { includeDeclaration: true });
}

/**
 * Rename a file-scoped symbol. Returns the edits to apply, or an `error`
 * explaining why the rename was rejected (unknown symbol, invalid new name).
 * `newName` may be supplied with or without the leading `$`.
 */
export function getRenameEdits(
  source: string,
  position: Position,
  newName: string,
): RenameResult {
  const tokens = tokenize(source);
  const tok = findNameTokenAt(tokens, position);
  if (!tok) return { edits: [], error: "No symbol to rename at this position." };
  const sym = resolveSymbol(tokens, tok);
  if (!sym) {
    return {
      edits: [],
      error: "Only file-scoped components, actions, hooks, and reactive atoms can be renamed.",
    };
  }
  const bare = sym.sigil ? newName.replace(/^\$/, "") : newName;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare)) {
    return { edits: [], error: `"${newName}" is not a valid Aktion identifier.` };
  }
  const replacement = sym.sigil ? `$${bare}` : bare;
  const edits = occurrences(tokens, tok.type, tok.value).map((range) => ({
    range,
    newText: replacement,
  }));
  return { edits };
}

/**
 * The document outline: every top-level declaration (atoms, components,
 * actions, hooks) and `import` binding, in source order.
 */
export function getDocumentSymbols(source: string): DocumentSymbol[] {
  const tokens = tokenize(source);
  const table = collectSymbols(tokens);
  return table.all.map((decl) => ({
    name: decl.sigil ? `$${decl.name}` : decl.name,
    detail: detailFor(decl.kind),
    kind: decl.kind,
    range: decl.range,
    selectionRange: decl.range,
  }));
}

// ---------------------------------------------------------------------------
// Symbol resolution
// ---------------------------------------------------------------------------

function resolveSymbol(tokens: Token[], tok: Token): SymbolDecl | null {
  const table = collectSymbols(tokens);
  if (tok.type === "StateIdentifier") return table.state.get(tok.value) ?? null;
  return table.ident.get(tok.value) ?? null;
}

/**
 * Walk the token stream once and record every top-level declaration. Tolerant
 * of malformed input — it only reads token types/values and never throws.
 */
function collectSymbols(tokens: Token[]): SymbolTable {
  const table: SymbolTable = { state: new Map(), ident: new Map(), all: [] };

  const add = (decl: SymbolDecl): void => {
    const bucket = decl.sigil ? table.state : table.ident;
    if (bucket.has(decl.name)) return; // first declaration wins
    bucket.set(decl.name, decl);
    table.all.push(decl);
  };

  let depth = 0;
  let stmtStart = true;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;

    if (t.type === "Newline" || t.type === "Semicolon") {
      stmtStart = true;
      continue;
    }
    if (t.type === "EOF") break;

    // `import { A, B as C, $shared } from "./mod.aktion"`.
    if (t.type === "Keyword" && t.value === "import") {
      i = scanImport(tokens, i, add);
      stmtStart = true;
      continue;
    }

    // `function Name(...)` / `function $useX(...)` declarations.
    if (t.type === "Keyword" && t.value === "function") {
      const nameTok = nextMeaningful(tokens, i + 1);
      if (nameTok) {
        if (nameTok.type === "StateIdentifier") {
          add({ name: nameTok.value, kind: "hook", sigil: true, range: tokenRange(nameTok) });
        } else if (nameTok.type === "Identifier") {
          add({
            name: nameTok.value,
            kind: isPascalCase(nameTok.value) ? "component" : "action",
            sigil: false,
            range: tokenRange(nameTok),
          });
        }
      }
    }

    // Top-level reactive atom declaration: `$name = …` (or `export $name = …`).
    if (t.type === "StateIdentifier" && stmtStart && depth === 0) {
      const next = nextMeaningful(tokens, i + 1);
      if (next && next.type === "Operator" && next.value === "=") {
        add({ name: t.value, kind: "state", sigil: true, range: tokenRange(t) });
      }
    }

    // Update statement-start + brace depth for the NEXT token.
    if (t.type === "Punctuation" && t.value === "{") {
      depth += 1;
      stmtStart = true;
    } else if (t.type === "Punctuation" && t.value === "}") {
      depth = Math.max(0, depth - 1);
      stmtStart = true;
    } else if (t.type === "Keyword" && t.value === "export") {
      // `export` is transparent — the declaration that follows is still at a
      // statement-start position.
    } else {
      stmtStart = false;
    }
  }

  return table;
}

/**
 * Scan an `import { … } from "…"` clause starting at the `import` keyword,
 * recording the local bindings as symbols. Returns the index of the last
 * consumed token.
 */
function scanImport(
  tokens: Token[],
  start: number,
  add: (decl: SymbolDecl) => void,
): number {
  const { clause, end } = readImportClause(tokens, start);
  for (const spec of clause.specifiers) {
    add({ name: spec.local, kind: "import", sigil: spec.isState, range: spec.localRange });
  }
  return end;
}

interface ImportSpecifierToken {
  /** Name as exported by the source module (bare, no `$`). */
  imported: string;
  /** Local binding in this module (bare, no `$`). */
  local: string;
  isState: boolean;
  /** Range of the local binding token. */
  localRange: Range;
}

interface ImportClause {
  /** Raw module specifier, e.g. `"./components/counter.aktion"`. */
  source: string;
  /** Range of the module specifier string token (quotes included). */
  sourceRange: Range | null;
  specifiers: ImportSpecifierToken[];
}

/** Parse every `import { … } from "…"` clause in the token stream. */
function parseImports(tokens: Token[]): ImportClause[] {
  const clauses: ImportClause[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]!.type === "Keyword" && tokens[i]!.value === "import") {
      const { clause, end } = readImportClause(tokens, i);
      clauses.push(clause);
      i = end;
    }
  }
  return clauses;
}

/**
 * Read a single import clause from the `import` keyword at `start`. Handles
 * `{ A, B as C, $shared }` specifier lists and the `from "…"` source.
 */
function readImportClause(tokens: Token[], start: number): { clause: ImportClause; end: number } {
  const names: Token[] = []; // specifier name tokens + the literal `as`
  let source = "";
  let sourceRange: Range | null = null;
  let i = start + 1;
  for (; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type === "Newline" || t.type === "Semicolon" || t.type === "EOF") break;
    if (t.type === "Identifier" && t.value === "from") {
      const src = nextMeaningful(tokens, i + 1);
      if (src && src.type === "String") {
        source = src.value;
        // String tokens carry the unquoted value; the source span is
        // value length + the two surrounding quotes.
        sourceRange = {
          start: { line: src.line, column: src.column },
          end: { line: src.line, column: src.column + src.value.length + 2 },
        };
      }
      break;
    }
    if (t.type === "Punctuation") continue; // `{` `}` `,`
    if (t.type === "Identifier" || t.type === "StateIdentifier") names.push(t);
  }

  const specifiers: ImportSpecifierToken[] = [];
  for (let n = 0; n < names.length; n += 1) {
    const nameTok = names[n]!;
    const asTok = names[n + 1];
    if (asTok && asTok.type === "Identifier" && asTok.value === "as" && names[n + 2]) {
      const aliasTok = names[n + 2]!;
      specifiers.push({
        imported: nameTok.value,
        local: aliasTok.value,
        isState: aliasTok.type === "StateIdentifier",
        localRange: tokenRange(aliasTok),
      });
      n += 2;
    } else {
      specifiers.push({
        imported: nameTok.value,
        local: nameTok.value,
        isState: nameTok.type === "StateIdentifier",
        localRange: tokenRange(nameTok),
      });
    }
  }

  return { clause: { source, sourceRange, specifiers }, end: i - 1 };
}

function positionInRange(position: Position, range: Range): boolean {
  if (position.line !== range.start.line || position.line !== range.end.line) return false;
  return position.column >= range.start.column && position.column <= range.end.column;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function occurrences(tokens: Token[], type: Token["type"], value: string): Range[] {
  const out: Range[] = [];
  for (const t of tokens) {
    if (t.type === type && t.value === value) out.push(tokenRange(t));
  }
  return out;
}

/** Find the identifier / state token whose span contains `position`. */
function findNameTokenAt(tokens: Token[], position: Position): Token | null {
  let best: Token | null = null;
  for (const t of tokens) {
    if (t.type !== "Identifier" && t.type !== "StateIdentifier") continue;
    if (t.line !== position.line) continue;
    const startCol = t.column;
    const endCol = t.column + tokenTextLength(t);
    if (position.column >= startCol && position.column <= endCol) {
      // Prefer the closest token starting at or before the cursor.
      if (!best || t.column > best.column) best = t;
    }
  }
  return best;
}

function nextMeaningful(tokens: Token[], from: number): Token | null {
  for (let i = from; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type === "Newline") continue;
    return t;
  }
  return null;
}

/** Character length of a token's source text (StateIdentifier includes `$`). */
function tokenTextLength(t: Token): number {
  return t.type === "StateIdentifier" ? t.value.length + 1 : t.value.length;
}

function tokenRange(t: Token): Range {
  const length = tokenTextLength(t);
  return {
    start: { line: t.line, column: t.column },
    end: { line: t.line, column: t.column + length },
  };
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.start.line === b.start.line &&
    a.start.column === b.start.column &&
    a.end.line === b.end.line &&
    a.end.column === b.end.column
  );
}

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function detailFor(kind: SymbolKind): string {
  switch (kind) {
    case "component":
      return "component";
    case "action":
      return "action";
    case "hook":
      return "hook";
    case "state":
      return "reactive atom";
    case "import":
      return "import";
    default:
      return "";
  }
}
