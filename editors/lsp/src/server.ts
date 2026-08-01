/**
 * Aktion Language Server — a standalone LSP server for `.aktion` files.
 *
 * WHY THIS EXISTS
 * ---------------
 * The VS Code extension (`editors/vscode`) talks to the DOM-free
 * `aktion-runtime/language` surface **in-process**, because VS Code extensions
 * are JavaScript. Every other editor family cannot do that: a JetBrains plugin
 * is JVM code, Neovim/Helix/Zed/Sublime/Emacs are not JS hosts at all. Rather
 * than reimplement Aktion's parser and schema checks per editor — which the
 * repo's `editor-tooling-sync` rule explicitly forbids — this server exposes
 * the SAME pure functions over the Language Server Protocol.
 *
 * So there is exactly one implementation of every language feature, in
 * `src/tooling/*`, reached three ways:
 *
 *     src/language-api.ts  ──►  editors/vscode      (in-process, JS host)
 *                          ──►  editors/lsp         (this file, stdio LSP)
 *                          ──►  docs/assets/playground.js  (in-page, browser)
 *
 * DESIGN NOTES
 * ------------
 *  - **Zero dependencies.** LSP is a thin JSON-RPC-over-stdio protocol, and the
 *    repo ships no runtime deps; adding `vscode-languageserver` for ~40 lines of
 *    framing would be the tail wagging the dog. The framing, dispatch, and
 *    delta-encoding live below and are exercised by `tests/lsp-server.test.ts`.
 *  - **No language logic here.** This file only converts coordinates and shapes.
 *    The service is 1-indexed (line + column); LSP is 0-indexed (line +
 *    character, UTF-16 code units). That single off-by-one is the entire
 *    adapter — see `toServicePosition` / `toLspRange`.
 *  - **Cross-file work lives in the host.** `getDefinitionTarget` classifies the
 *    cursor and stays pure; resolving `"./counter.aktion"` and reading that file
 *    happens here, exactly as it does in the VS Code extension.
 *
 * Run it with `node dist/server.mjs --stdio`.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  getDiagnostics,
  getCompletions,
  getHoverInfo,
  getDefinitionTarget,
  findDeclaration,
  getReferences,
  getDocumentHighlights,
  getDocumentSymbols,
  getRenameEdits,
  getSignatureHelp,
  getSemanticTokens,
  semanticTokenTypes,
  semanticTokenModifiers,
  formatProgram,
  getSnippets,
  defaultLibrary,
  type CompletionItem as AktionCompletion,
  type Diagnostic as AktionDiagnostic,
  type DocumentSymbol as AktionSymbol,
  type Position as AktionPosition,
  type Range as AktionRange,
} from "aktion-runtime/language";

/* -------------------------------------------------------------------------- */
/*  Protocol constants                                                        */
/* -------------------------------------------------------------------------- */

/** LSP `DiagnosticSeverity`. */
const SEVERITY = { error: 1, warning: 2 } as const;

/** LSP `TextDocumentSyncKind.Full` — we re-analyse whole documents. */
const SYNC_FULL = 1;

/** LSP `InsertTextFormat.Snippet`. */
const SNIPPET_FORMAT = 2;

/** LSP `SymbolKind` values we map onto. */
const SYMBOL_KIND = {
  class: 5,
  method: 6,
  property: 7,
  function: 12,
  variable: 13,
  module: 2,
} as const;

/** LSP `CompletionItemKind` values we map onto. */
const COMPLETION_KIND = {
  class: 7,
  property: 10,
  variable: 6,
  function: 3,
  keyword: 14,
  snippet: 15,
  text: 1,
} as const;

/** LSP `DocumentHighlightKind.Text`. */
const HIGHLIGHT_TEXT = 1;

/** JSON-RPC error codes we emit. */
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INTERNAL = -32603;
/** LSP-specific: the request refers to a document the server does not hold. */
const ERR_INVALID_PARAMS = -32602;

/** How long to coalesce keystrokes before re-publishing diagnostics. */
const DIAGNOSTIC_DEBOUNCE_MS = 60;

/* -------------------------------------------------------------------------- */
/*  Document store                                                            */
/* -------------------------------------------------------------------------- */

interface Doc {
  uri: string;
  version: number;
  text: string;
  /** Cached line-start offsets are unnecessary — we only need line lengths. */
  lines: string[];
}

const documents = new Map<string, Doc>();
const diagnosticTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Client capabilities we care about, captured at `initialize`. A client that
 * cannot render snippets must not be sent `${1:…}` placeholders as plain text.
 */
const client = {
  snippets: false,
  hierarchicalSymbols: false,
  markdownHover: false,
};

let shuttingDown = false;

function setDoc(uri: string, version: number, text: string): Doc {
  const doc: Doc = { uri, version, text, lines: text.split(/\r\n|\r|\n/) };
  documents.set(uri, doc);
  return doc;
}

function getDoc(uri: string): Doc | undefined {
  return documents.get(uri);
}

/**
 * Read a module's source, preferring an open (possibly unsaved) buffer over the
 * copy on disk — the same precedence the VS Code extension uses, so navigation
 * lands on what the user is actually looking at.
 */
function readModuleSource(uri: string): string | null {
  const open = documents.get(uri);
  if (open) return open.text;
  try {
    return readFileSync(uriToPath(uri), "utf8");
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  URI helpers                                                               */
/* -------------------------------------------------------------------------- */

function uriToPath(uri: string): string {
  if (uri.startsWith("file:")) return fileURLToPath(uri);
  // Some clients hand back a bare path; accept it rather than throwing.
  return uri;
}

function pathToUri(path: string): string {
  return pathToFileURL(path).href;
}

/**
 * Resolve a relative module specifier against the importing document's
 * directory. Tries the literal path, then `.aktion`, then `/index.aktion` —
 * the resolution order the in-browser linker and the Vite plugin both use.
 * Bare (non-relative) specifiers are not resolved.
 */
function resolveModuleUri(fromUri: string, spec: string): string | null {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const baseDir = dirname(uriToPath(fromUri));
  const candidates = [spec, `${spec}.aktion`, join(spec, "index.aktion")];
  for (const candidate of candidates) {
    const abs = isAbsolute(candidate) ? candidate : resolvePath(baseDir, candidate);
    try {
      if (statSync(abs).isFile()) return pathToUri(abs);
    } catch {
      /* not found — try the next candidate */
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Coordinate conversion (service is 1-indexed; LSP is 0-indexed)            */
/* -------------------------------------------------------------------------- */

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

function toServicePosition(position: LspPosition): AktionPosition {
  return { line: position.line + 1, column: position.character + 1 };
}

function toLspPosition(position: AktionPosition): LspPosition {
  return { line: Math.max(0, position.line - 1), character: Math.max(0, position.column - 1) };
}

function toLspRange(range: AktionRange): LspRange {
  return { start: toLspPosition(range.start), end: toLspPosition(range.end) };
}

/** A zero-width range at the top of a file — used when a target has no range. */
const FILE_START: LspRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

/* -------------------------------------------------------------------------- */
/*  Diagnostics                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Diagnostics carry a point, not a span. Underlining to end-of-line is what the
 * VS Code extension does and reads far better than a 1-character squiggle.
 */
function diagnosticRange(doc: Doc, d: AktionDiagnostic): LspRange {
  const line = Math.min(Math.max(0, d.line - 1), Math.max(0, doc.lines.length - 1));
  const lineText = doc.lines[line] ?? "";
  const startCol = Math.min(Math.max(0, d.column - 1), lineText.length);
  return {
    start: { line, character: startCol },
    end: { line, character: Math.max(startCol, lineText.length) },
  };
}

function publishDiagnostics(uri: string): void {
  const doc = getDoc(uri);
  if (!doc) return;

  // `getDiagnostics` already folds parse errors, schema errors, AND the soft
  // lint pass into one list — do NOT also call `getLintWarnings` here or every
  // warning is reported twice. (`getLintWarnings` exists for hosts that want
  // *only* the soft warnings.)
  const diagnostics = safely(
    () => getDiagnostics(doc.text, defaultLibrary),
    [] as AktionDiagnostic[],
  ).map((d) => ({
    range: diagnosticRange(doc, d),
    severity: SEVERITY[d.severity] ?? SEVERITY.error,
    source: "aktion",
    message: d.message,
  }));

  notify("textDocument/publishDiagnostics", { uri, version: doc.version, diagnostics });
}

function scheduleDiagnostics(uri: string): void {
  const existing = diagnosticTimers.get(uri);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    diagnosticTimers.delete(uri);
    publishDiagnostics(uri);
  }, DIAGNOSTIC_DEBOUNCE_MS);
  // Never hold the process open on a pending debounce.
  timer.unref?.();
  diagnosticTimers.set(uri, timer);
}

function clearDiagnostics(uri: string): void {
  const existing = diagnosticTimers.get(uri);
  if (existing) clearTimeout(existing);
  diagnosticTimers.delete(uri);
  notify("textDocument/publishDiagnostics", { uri, diagnostics: [] });
}

/* -------------------------------------------------------------------------- */
/*  Request handlers                                                          */
/* -------------------------------------------------------------------------- */

type Handler = (params: any) => unknown;

const handlers: Record<string, Handler> = {
  /* ---- lifecycle ------------------------------------------------------- */

  initialize(params) {
    const caps = params?.capabilities ?? {};
    client.snippets = caps.textDocument?.completion?.completionItem?.snippetSupport === true;
    client.hierarchicalSymbols =
      caps.textDocument?.documentSymbol?.hierarchicalDocumentSymbolSupport === true;
    const hoverFormats: string[] = caps.textDocument?.hover?.contentFormat ?? [];
    client.markdownHover = hoverFormats.includes("markdown");

    return {
      capabilities: {
        // Full sync: the service parses whole documents anyway, so
        // incremental patching would add state for no gain.
        textDocumentSync: { openClose: true, change: SYNC_FULL },
        hoverProvider: true,
        completionProvider: {
          // `$` opens the builtin/atom catalog; `.` opens namespace and
          // resource-bag members ($util., $storage.local., $todos., route.).
          triggerCharacters: ["$", "."],
          resolveProvider: false,
        },
        signatureHelpProvider: { triggerCharacters: ["(", ","], retriggerCharacters: [")"] },
        definitionProvider: true,
        referencesProvider: true,
        documentHighlightProvider: true,
        documentSymbolProvider: true,
        renameProvider: { prepareProvider: true },
        documentFormattingProvider: true,
        semanticTokensProvider: {
          legend: {
            tokenTypes: [...semanticTokenTypes],
            tokenModifiers: [...semanticTokenModifiers],
          },
          full: true,
        },
      },
      serverInfo: { name: "aktion-language-server", version: SERVER_VERSION },
    };
  },

  initialized() {
    return null;
  },

  shutdown() {
    shuttingDown = true;
    for (const timer of diagnosticTimers.values()) clearTimeout(timer);
    diagnosticTimers.clear();
    documents.clear();
    return null;
  },

  /* ---- document sync --------------------------------------------------- */

  "textDocument/didOpen"(params) {
    const { uri, version, text } = params.textDocument;
    setDoc(uri, version ?? 0, text ?? "");
    publishDiagnostics(uri);
    return undefined;
  },

  "textDocument/didChange"(params) {
    const { uri, version } = params.textDocument;
    const changes: Array<{ text: string; range?: unknown }> = params.contentChanges ?? [];
    if (changes.length === 0) return undefined;

    // We declare `TextDocumentSyncKind.Full`, so the last change carries the
    // whole document. A client that sent an INCREMENTAL change anyway would hand
    // us a fragment, and treating that as the full text would silently replace
    // the document with a few characters — every later diagnostic, hover and
    // definition would then be computed against garbage. Refuse instead: keep the
    // last known-good text and say so where the client's log will show it.
    const last = changes[changes.length - 1]!;
    if (last.range !== undefined) {
      process.stderr.write(
        "[aktion-language-server] ignoring an incremental textDocument/didChange: " +
          "this server declares full-document sync (TextDocumentSyncKind.Full).\n",
      );
      return undefined;
    }

    setDoc(uri, version ?? 0, last.text);
    scheduleDiagnostics(uri);
    return undefined;
  },

  "textDocument/didClose"(params) {
    const { uri } = params.textDocument;
    documents.delete(uri);
    clearDiagnostics(uri);
    return undefined;
  },

  "textDocument/didSave"(params) {
    // Re-publish immediately on save so a debounced batch never lands late.
    publishDiagnostics(params.textDocument.uri);
    return undefined;
  },

  /* ---- language features ---------------------------------------------- */

  "textDocument/hover"(params) {
    const doc = requireDoc(params);
    const info = getHoverInfo(doc.text, toServicePosition(params.position), defaultLibrary);
    if (!info) return null;
    return {
      contents: client.markdownHover
        ? { kind: "markdown", value: info.contents }
        : { kind: "plaintext", value: info.contents },
    };
  },

  "textDocument/completion"(params) {
    const doc = requireDoc(params);
    const position = toServicePosition(params.position);
    const items = getCompletions(doc.text, position, defaultLibrary).map(toLspCompletion);

    // Snippets are shipped to VS Code as a static `.code-snippets` contribution,
    // which no other editor reads. Offering them here is what gives Neovim /
    // JetBrains / Zed the same `App`, `Card`, `Hero` … expansions.
    if (client.snippets) {
      for (const snippet of getSnippets()) {
        items.push({
          label: snippet.name,
          kind: COMPLETION_KIND.snippet,
          detail: snippet.description,
          insertText: snippet.template,
          insertTextFormat: SNIPPET_FORMAT,
          // Sort snippets just after the identically-named component so the
          // plain name still wins an exact-match keystroke.
          sortText: `${snippet.name}~snippet`,
        });
      }
    }

    return { isIncomplete: false, items };
  },

  "textDocument/signatureHelp"(params) {
    const doc = requireDoc(params);
    const help = getSignatureHelp(doc.text, toServicePosition(params.position), defaultLibrary);
    if (!help) return null;
    return {
      activeSignature: help.activeSignature,
      activeParameter: help.activeParameter,
      signatures: help.signatures.map((sig) => ({
        label: sig.label,
        documentation: sig.documentation
          ? { kind: client.markdownHover ? "markdown" : "plaintext", value: sig.documentation }
          : undefined,
        parameters: sig.parameters.map((p) => ({
          label: p.label,
          documentation: p.documentation
            ? { kind: client.markdownHover ? "markdown" : "plaintext", value: p.documentation }
            : undefined,
        })),
      })),
    };
  },

  "textDocument/definition"(params) {
    const doc = requireDoc(params);
    const target = getDefinitionTarget(doc.text, toServicePosition(params.position));
    if (!target) return null;

    if (target.kind === "local") {
      return target.range ? { uri: doc.uri, range: toLspRange(target.range) } : null;
    }

    const moduleUri = resolveModuleUri(doc.uri, target.moduleSource ?? "");
    if (!moduleUri) return null;

    if (target.kind === "module") {
      return { uri: moduleUri, range: FILE_START };
    }

    // import-binding: open the module and locate the exported declaration.
    const source = readModuleSource(moduleUri);
    const range =
      source != null && target.imported != null
        ? findDeclaration(source, target.imported, target.isState ?? false)
        : null;
    return { uri: moduleUri, range: range ? toLspRange(range) : FILE_START };
  },

  "textDocument/references"(params) {
    const doc = requireDoc(params);
    const ranges = getReferences(doc.text, toServicePosition(params.position), {
      includeDeclaration: params.context?.includeDeclaration !== false,
    });
    return ranges.map((r) => ({ uri: doc.uri, range: toLspRange(r) }));
  },

  "textDocument/documentHighlight"(params) {
    const doc = requireDoc(params);
    return getDocumentHighlights(doc.text, toServicePosition(params.position)).map((r) => ({
      range: toLspRange(r),
      kind: HIGHLIGHT_TEXT,
    }));
  },

  "textDocument/documentSymbol"(params) {
    const doc = requireDoc(params);
    const symbols = getDocumentSymbols(doc.text);
    if (client.hierarchicalSymbols) {
      return symbols.map((s) => ({
        name: s.name,
        detail: s.detail,
        kind: symbolKindFor(s.kind),
        range: toLspRange(s.range),
        selectionRange: toLspRange(s.selectionRange),
      }));
    }
    // Fall back to the flat `SymbolInformation[]` shape for older clients.
    return symbols.map((s) => ({
      name: s.name,
      kind: symbolKindFor(s.kind),
      location: { uri: doc.uri, range: toLspRange(s.range) },
    }));
  },

  "textDocument/prepareRename"(params) {
    const doc = requireDoc(params);
    const position = toServicePosition(params.position);
    // Probe first so a non-renameable symbol reports *why* up front rather
    // than failing after the user has typed a new name.
    const probe = getRenameEdits(doc.text, position, "renameProbe");
    if (probe.error) throw new RpcError(ERR_INVALID_PARAMS, probe.error);
    const word = wordRangeAt(doc, params.position);
    if (!word) throw new RpcError(ERR_INVALID_PARAMS, "Nothing to rename here.");
    return { range: word.range, placeholder: word.text };
  },

  "textDocument/rename"(params) {
    const doc = requireDoc(params);
    const result = getRenameEdits(doc.text, toServicePosition(params.position), params.newName);
    if (result.error) throw new RpcError(ERR_INVALID_PARAMS, result.error);
    return {
      changes: {
        [doc.uri]: result.edits.map((e) => ({
          range: toLspRange(e.range),
          newText: e.newText,
        })),
      },
    };
  },

  "textDocument/formatting"(params) {
    const doc = requireDoc(params);
    const { formatted, errors } = formatProgram(doc.text);
    // A document with parse errors is returned unchanged by the formatter, so a
    // mid-edit file is never mangled. Emit no edit at all in that case.
    if (errors.length > 0 || formatted === doc.text) return [];
    return [{ range: fullRange(doc), newText: formatted }];
  },

  "textDocument/semanticTokens/full"(params) {
    const doc = requireDoc(params);
    return { data: encodeSemanticTokens(doc) };
  },

  /* ---- ignorable notifications ---------------------------------------- */

  "workspace/didChangeConfiguration": () => undefined,
  "workspace/didChangeWatchedFiles": () => undefined,
  "$/setTrace": () => undefined,
  "$/cancelRequest": () => undefined,
};

/* -------------------------------------------------------------------------- */
/*  Shape helpers                                                             */
/* -------------------------------------------------------------------------- */

function requireDoc(params: any): Doc {
  const uri = params?.textDocument?.uri;
  const doc = uri ? getDoc(uri) : undefined;
  if (!doc) throw new RpcError(ERR_INVALID_PARAMS, `Document not open: ${uri}`);
  return doc;
}

function fullRange(doc: Doc): LspRange {
  const lastLine = Math.max(0, doc.lines.length - 1);
  return {
    start: { line: 0, character: 0 },
    end: { line: lastLine, character: (doc.lines[lastLine] ?? "").length },
  };
}

/**
 * The Aktion word pattern deliberately includes the `$` sigil so renaming
 * `$count` offers `$count` (and the service preserves the sigil on the way out).
 */
const WORD_PATTERN = /\$?[A-Za-z_][A-Za-z0-9_]*/g;

function wordRangeAt(doc: Doc, position: LspPosition): { range: LspRange; text: string } | null {
  const lineText = doc.lines[position.line] ?? "";
  WORD_PATTERN.lastIndex = 0;
  for (let match = WORD_PATTERN.exec(lineText); match; match = WORD_PATTERN.exec(lineText)) {
    const start = match.index;
    const end = start + match[0].length;
    if (position.character >= start && position.character <= end) {
      return {
        range: {
          start: { line: position.line, character: start },
          end: { line: position.line, character: end },
        },
        text: match[0],
      };
    }
  }
  return null;
}

function symbolKindFor(kind: AktionSymbol["kind"]): number {
  switch (kind) {
    case "component":
      return SYMBOL_KIND.class;
    case "action":
      return SYMBOL_KIND.function;
    case "hook":
      return SYMBOL_KIND.method;
    case "state":
      return SYMBOL_KIND.variable;
    case "import":
      return SYMBOL_KIND.module;
    default:
      return SYMBOL_KIND.variable;
  }
}

function toLspCompletion(item: AktionCompletion): Record<string, unknown> {
  return {
    label: item.label,
    kind: completionKindFor(item.kind),
    detail: item.detail,
    documentation: item.documentation
      ? { kind: client.markdownHover ? "markdown" : "plaintext", value: item.documentation }
      : undefined,
  };
}

function completionKindFor(kind: AktionCompletion["kind"]): number {
  switch (kind) {
    case "component":
      return COMPLETION_KIND.class;
    case "prop":
      return COMPLETION_KIND.property;
    case "state":
      return COMPLETION_KIND.variable;
    case "builtin":
      return COMPLETION_KIND.function;
    case "keyword":
      return COMPLETION_KIND.keyword;
    default:
      return COMPLETION_KIND.text;
  }
}

/**
 * LSP transmits semantic tokens as a flat, delta-encoded `uint[]` of 5-tuples:
 * `[deltaLine, deltaStartChar, length, tokenType, tokenModifiers]`. Deltas are
 * relative to the previous token — and `deltaStartChar` resets to an absolute
 * column whenever the line advances — so the list MUST be sorted first.
 */
export function encodeSemanticTokens(doc: Doc): number[] {
  const tokens = safely(() => getSemanticTokens(doc.text, defaultLibrary), []);
  const sorted = [...tokens].sort((a, b) => a.line - b.line || a.column - b.column);

  const typeIndex = new Map(semanticTokenTypes.map((t, i) => [t, i]));
  const modifierIndex = new Map(semanticTokenModifiers.map((m, i) => [m, i]));

  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const token of sorted) {
    const line = Math.max(0, token.line - 1);
    const char = Math.max(0, token.column - 1);
    const type = typeIndex.get(token.tokenType);
    if (type == null) continue; // unknown type — omit rather than mis-colour

    let mask = 0;
    for (const modifier of token.tokenModifiers) {
      const index = modifierIndex.get(modifier);
      if (index != null) mask |= 1 << index;
    }

    data.push(line - prevLine, line === prevLine ? char - prevChar : char, token.length, type, mask);
    prevLine = line;
    prevChar = char;
  }
  return data;
}

/* -------------------------------------------------------------------------- */
/*  JSON-RPC transport                                                        */
/* -------------------------------------------------------------------------- */

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = "RpcError";
  }
}

/** Run `fn`, returning `fallback` if it throws — used for best-effort passes. */
function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

interface RpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
}

function write(message: unknown): void {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  // `Content-Length` counts BYTES, not characters — a non-ASCII program would
  // desynchronise the stream if this used `string.length`.
  process.stdout.write(`Content-Length: ${payload.byteLength}\r\n\r\n`);
  process.stdout.write(payload);
}

function notify(method: string, params: unknown): void {
  write({ jsonrpc: "2.0", method, params });
}

function respond(id: number | string, result: unknown): void {
  write({ jsonrpc: "2.0", id, result: result === undefined ? null : result });
}

function respondError(id: number | string, code: number, message: string): void {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * Opt-in protocol trace. Clients own the stdio channel, so a trace can only go
 * to stderr — every LSP client tees that into a log window (LSP4IJ shows it
 * under *Language Servers*; VS Code under *Output → Aktion*).
 */
const TRACE = process.env.AKTION_LSP_TRACE === "1";

function trace(direction: "→" | "←", detail: string): void {
  if (TRACE) process.stderr.write(`[aktion-lsp] ${direction} ${detail}\n`);
}

export function dispatch(message: RpcMessage): void {
  const { id, method, params } = message;
  if (!method) return;
  trace("→", id != null ? `${method} (#${id})` : method);

  // `exit` is a notification and must terminate the process; per the spec the
  // status code depends on whether `shutdown` was received first.
  if (method === "exit") {
    process.exit(shuttingDown ? 0 : 1);
  }

  const handler = handlers[method];
  if (!handler) {
    // Unknown notifications are ignored (the spec requires it); unknown
    // requests get a proper MethodNotFound so clients stop asking.
    if (id != null) respondError(id, ERR_METHOD_NOT_FOUND, `Unhandled method: ${method}`);
    return;
  }

  try {
    const result = handler(params ?? {});
    if (id != null) {
      respond(id, result);
      trace("←", `${method} (#${id}) ok`);
    }
  } catch (err) {
    const code = err instanceof RpcError ? err.code : ERR_INTERNAL;
    const detail = err instanceof Error ? err.message : String(err);
    trace("←", `${method} failed: ${detail}`);
    if (id != null) {
      respondError(id, code, detail);
    } else {
      // A failing notification has nowhere to report; surface it on the
      // server's stderr, which every LSP client tees into a log.
      process.stderr.write(`[aktion-language-server] ${method} failed: ${detail}\n`);
    }
  }
}

/**
 * Split a raw stdio byte stream into LSP messages. Exposed (and pure) so the
 * framing can be unit-tested without spawning a process.
 */
export function createMessageReader(onMessage: (message: RpcMessage) => void): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);

  return (chunk: Buffer): void => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);

    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;

      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Malformed header — drop it and resynchronise on the next frame.
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.byteLength < bodyStart + length) return; // wait for more bytes

      const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.subarray(bodyStart + length);

      let parsed: RpcMessage;
      try {
        parsed = JSON.parse(body) as RpcMessage;
      } catch {
        continue; // unparseable frame — skip it, keep the stream alive
      }
      onMessage(parsed);
    }
  };
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

/** Injected by esbuild at build time from `package.json`. */
declare const __SERVER_VERSION__: string;
const SERVER_VERSION = typeof __SERVER_VERSION__ === "string" ? __SERVER_VERSION__ : "0.0.0-dev";

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }

  const read = createMessageReader(dispatch);
  process.stdin.on("data", read);
  process.stdin.on("end", () => process.exit(shuttingDown ? 0 : 1));
  process.stdin.resume();
}

const USAGE = `aktion-language-server ${SERVER_VERSION}

A Language Server Protocol server for the Aktion DSL (.aktion files).
Speaks LSP over stdio; every feature is powered by the DOM-free
\`aktion-runtime/language\` surface.

USAGE
  aktion-language-server [--stdio]

OPTIONS
  --stdio        Communicate over stdin/stdout (the default; accepted for
                 compatibility with clients that always pass it).
  -v, --version  Print the version and exit.
  -h, --help     Print this help and exit.

Features: diagnostics (errors + lint warnings), hover, completions,
signature help, go-to-definition (cross-file), find references, document
highlights, document symbols, rename, formatting, semantic tokens, and
component/builtin snippets.
`;

// Only auto-start when executed as a program. Importing this module (from a
// test, or from a host that drives `dispatch` directly) must not hijack stdin.
if (process.argv[1] && /(?:^|[\\/])server\.(?:mjs|js|cjs|ts)$/.test(process.argv[1])) {
  main();
}
