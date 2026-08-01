/**
 * Aktion VS Code extension.
 *
 * `.aktion` files highlight as TypeScript (the TextMate grammar includes
 * `source.ts`) with Aktion-specific overlays, and this extension layers full
 * language intelligence on top — diagnostics, hover, completions, formatting,
 * go-to-definition, find-all-references, rename, document symbols (outline),
 * workspace symbols, document highlights, signature help, quick fixes, and
 * semantic highlighting.
 *
 * Every feature is powered IN-PROCESS by the DOM-free `aktion-runtime/language`
 * surface (the same pure functions the docs playground uses). There is no
 * language server: the extension is a thin adapter that maps the service's
 * 1-indexed JSON results onto VS Code's 0-indexed API types.
 *
 * That surface now has three adapters — this extension, `editors/lsp` (a stdio
 * LSP server for JetBrains / Neovim / Helix / Zed), and the in-page playground.
 * VS Code deliberately does NOT go through the LSP server: `src/tooling/*` is
 * pure, synchronous and dependency-free, so running it in the extension host is
 * strictly cheaper than spawning a child process and serialising every request
 * over stdio — there is nothing an LSP client would add here. The cost of that
 * choice is duplicated adapter code; each helper with a twin in
 * `editors/lsp/src/server.ts` says so in a comment, so the drift stays visible.
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getDiagnostics,
  getHoverInfo,
  getCompletions,
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
  suggestComponent,
  getComponentCatalog,
  defaultLibrary,
  type CompletionItem as AktionCompletion,
  type Diagnostic as AktionDiagnostic,
  type Range as AktionRange,
  type DocumentSymbol as AktionSymbol,
} from "aktion-runtime/language";
import { registerCommands } from "./commands.js";

const LANGUAGE = "aktion";
const SOURCE = "aktion";

/** Word shape for rename / quick-fix lookups — the `$` sigil is part of a name. */
const IDENTIFIER = /\$?[A-Za-z_][A-Za-z0-9_]*/;

/** Upper bound on files scanned for a workspace-symbol query (Ctrl+T). */
const WORKSPACE_SYMBOL_FILE_LIMIT = 512;

const SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(
  [...semanticTokenTypes],
  [...semanticTokenModifiers],
);

/**
 * Where recovered errors are reported. Every service call is wrapped in
 * `safely()`, so a pathological buffer degrades one feature instead of throwing
 * out of an event handler and leaving stale squiggles behind with no user-visible
 * failure. (`editors/lsp/src/server.ts` has the same helper for the same reason.)
 */
let channel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("Aktion");
  context.subscriptions.push(channel);

  registerDiagnostics(context);

  // No `scheme` filter on purpose: hover / completions / diagnostics are all
  // pure functions of the buffer text, so they work on `untitled:` and virtual
  // documents too. Only cross-file go-to-definition needs a real path, and
  // `resolveModule` guards that case itself.
  const selector: vscode.DocumentSelector = { language: LANGUAGE };
  context.subscriptions.push(
    ...registerCommands(context),
    vscode.languages.registerHoverProvider(selector, hoverProvider),
    vscode.languages.registerCompletionItemProvider(selector, completionProvider, "$", "."),
    vscode.languages.registerDocumentFormattingEditProvider(selector, formattingProvider),
    vscode.languages.registerDocumentRangeFormattingEditProvider(selector, formattingProvider),
    vscode.languages.registerDefinitionProvider(selector, definitionProvider),
    vscode.languages.registerReferenceProvider(selector, referenceProvider),
    vscode.languages.registerDocumentHighlightProvider(selector, highlightProvider),
    vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider),
    vscode.languages.registerWorkspaceSymbolProvider(workspaceSymbolProvider),
    vscode.languages.registerRenameProvider(selector, renameProvider),
    vscode.languages.registerSignatureHelpProvider(selector, signatureHelpProvider, "(", ","),
    vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.languages.registerDocumentSemanticTokensProvider(
      selector,
      semanticTokensProvider,
      SEMANTIC_LEGEND,
    ),
  );
}

export function deactivate(): void {
  /* Every disposable (collection, channel, providers) is in context.subscriptions. */
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface Settings {
  diagnosticsEnabled: boolean;
  debounceMs: number;
  maxFileSizeKb: number;
}

/** Read live — a `configurationDefaults`-style cache would go stale on change. */
function settings(): Settings {
  const config = vscode.workspace.getConfiguration("aktion");
  return {
    diagnosticsEnabled: config.get<boolean>("diagnostics.enable", true),
    debounceMs: Math.max(0, config.get<number>("diagnostics.debounceMs", 200)),
    maxFileSizeKb: Math.max(0, config.get<number>("maxFileSizeKb", 512)),
  };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE);
  // Per-document debounce timers. Without this, every keystroke re-tokenized,
  // re-parsed, schema-validated against the whole library and re-linted the
  // document synchronously on the extension host — the exact reason
  // `editors/lsp/src/server.ts` debounces its own `publishDiagnostics`.
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (key: string): void => {
    const pending = timers.get(key);
    if (pending) clearTimeout(pending);
    timers.delete(key);
  };

  const refresh = (doc: vscode.TextDocument): void => {
    if (doc.languageId !== LANGUAGE) return;
    const { diagnosticsEnabled, maxFileSizeKb } = settings();
    if (!diagnosticsEnabled) {
      collection.delete(doc.uri);
      return;
    }
    const source = doc.getText();
    // A generated or vendored megabyte of Aktion would otherwise re-parse on
    // every keystroke; better to say nothing than to stall the host.
    if (maxFileSizeKb > 0 && source.length > maxFileSizeKb * 1024) {
      collection.delete(doc.uri);
      return;
    }

    // `getDiagnostics` already folds parse errors, schema errors AND the soft
    // lint pass (unknown components, i18n shadowing) into one list — do NOT also
    // call `getLintWarnings` here or every warning is reported twice.
    // (`getLintWarnings` exists for hosts that want *only* the soft warnings.)
    const reported = safely("getDiagnostics", () => getDiagnostics(source, defaultLibrary), []);
    collection.set(
      doc.uri,
      reported.map((d) => toVsDiagnostic(doc, d)),
    );
  };

  const schedule = (doc: vscode.TextDocument): void => {
    if (doc.languageId !== LANGUAGE) return;
    const key = doc.uri.toString();
    cancel(key);
    const { debounceMs } = settings();
    if (debounceMs === 0) {
      refresh(doc);
      return;
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(doc);
      }, debounceMs),
    );
  };

  context.subscriptions.push(
    collection,
    new vscode.Disposable(() => {
      for (const pending of timers.values()) clearTimeout(pending);
      timers.clear();
    }),
    // Open and save publish immediately, so a debounced batch never lands after
    // the user has already moved on.
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidSaveTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      cancel(doc.uri.toString());
      collection.delete(doc.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("aktion")) return;
      vscode.workspace.textDocuments.forEach(refresh);
    }),
  );
  vscode.workspace.textDocuments.forEach(refresh);
}

/**
 * The service is 1-indexed; VS Code is 0-indexed. The squiggle runs from the
 * reported column to the end of that line, which is what
 * `editors/lsp/src/server.ts#diagnosticRange` does too.
 */
function toVsDiagnostic(doc: vscode.TextDocument, d: AktionDiagnostic): vscode.Diagnostic {
  const line = Math.min(Math.max(0, d.line - 1), Math.max(0, doc.lineCount - 1));
  const startCol = Math.max(0, d.column - 1);
  const endCol = doc.lineAt(line).range.end.character;
  const range = new vscode.Range(line, Math.min(startCol, endCol), line, endCol);
  const severity =
    d.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
  const diagnostic = new vscode.Diagnostic(range, d.message, severity);
  diagnostic.source = SOURCE;
  return diagnostic;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const hoverProvider: vscode.HoverProvider = {
  provideHover(doc, position) {
    const info = safely(
      "getHoverInfo",
      () => getHoverInfo(doc.getText(), toServicePosition(position), defaultLibrary),
      null,
    );
    return info ? new vscode.Hover(new vscode.MarkdownString(info.contents)) : null;
  },
};

const completionProvider: vscode.CompletionItemProvider = {
  provideCompletionItems(doc, position) {
    return safely(
      "getCompletions",
      () => getCompletions(doc.getText(), toServicePosition(position), defaultLibrary),
      [],
    ).map(toVsCompletion);
  },
};

// Format-on-save / "Format Document" / "Format Selection": `formatProgram` is the
// canonical, idempotent pretty-printer. It returns the input unchanged when the
// document has parse errors, so a mid-edit file is never mangled.
//
// The same object serves the range provider. Aktion's printer is whole-PROGRAM by
// construction — a selection is not a parseable unit — so "Format Selection"
// formats the document. Registering it is still worth it: without a range
// provider VS Code reports "no formatter" for a selection and for
// `editor.formatOnSaveMode: modifications`.
const formattingProvider: vscode.DocumentFormattingEditProvider &
  vscode.DocumentRangeFormattingEditProvider = {
  provideDocumentFormattingEdits(doc) {
    return formatWholeDocument(doc);
  },
  provideDocumentRangeFormattingEdits(doc) {
    return formatWholeDocument(doc);
  },
};

function formatWholeDocument(doc: vscode.TextDocument): vscode.TextEdit[] {
  const original = doc.getText();
  const result = safely("formatProgram", () => formatProgram(original), null);
  if (!result) return [];
  const { formatted, errors } = result;
  if (errors.length > 0 || formatted === original) return [];
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(original.length));
  return [vscode.TextEdit.replace(fullRange, formatted)];
}

// Go-to-definition resolves three cases (classified by the language service):
//   - a file-local declaration → jump within this document,
//   - an imported binding (e.g. `$count` from "./counter.aktion") → open the
//     source module and land on its declaration,
//   - the module specifier string itself → open that file.
const definitionProvider: vscode.DefinitionProvider = {
  provideDefinition(doc, position) {
    const target = safely(
      "getDefinitionTarget",
      () => getDefinitionTarget(doc.getText(), toServicePosition(position)),
      null,
    );
    if (!target) return null;

    if (target.kind === "local") {
      return target.range ? new vscode.Location(doc.uri, toVsRange(target.range)) : null;
    }

    const fileUri = resolveModule(doc.uri, target.moduleSource ?? "");
    if (!fileUri) return null;

    if (target.kind === "module") {
      return new vscode.Location(fileUri, new vscode.Position(0, 0));
    }

    // import-binding: read the target module and find the exported declaration.
    const targetSource = readModuleSource(fileUri);
    const range =
      targetSource != null && target.imported != null
        ? safely(
            "findDeclaration",
            () => findDeclaration(targetSource, target.imported as string, target.isState ?? false),
            null,
          )
        : null;
    return new vscode.Location(fileUri, range ? toVsRange(range) : new vscode.Position(0, 0));
  },
};

/**
 * Resolve a relative module specifier against the importing document's
 * directory. Tries the literal path, then `.aktion`, then `/index.aktion`.
 * Bare (non-relative) specifiers are not resolved.
 *
 * Twin: `resolveModule` in `editors/lsp/src/server.ts` (same candidate order).
 */
function resolveModule(fromUri: vscode.Uri, spec: string): vscode.Uri | null {
  // `fsPath` is meaningless for `untitled:` / `git:` / virtual documents, and
  // there is no directory to resolve against — decline rather than guess.
  if (fromUri.scheme !== "file") return null;
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const baseDir = path.dirname(fromUri.fsPath);
  const candidates = [spec, `${spec}.aktion`, path.join(spec, "index.aktion")];
  for (const candidate of candidates) {
    const resolved = path.resolve(baseDir, candidate);
    try {
      if (fs.statSync(resolved).isFile()) return vscode.Uri.file(resolved);
    } catch {
      /* not found — try the next candidate */
    }
  }
  return null;
}

/**
 * Read a module's source, preferring an open (possibly unsaved) document.
 * Synchronous on purpose: `provideDefinition` returns a plain value, and
 * `resolveModule` has already established that this is a local file path.
 * (The async `workspace.fs` reader below serves the workspace-symbol provider.)
 */
function readModuleSource(uri: vscode.Uri): string | null {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === uri.fsPath);
  if (open) return open.getText();
  try {
    return fs.readFileSync(uri.fsPath, "utf8");
  } catch {
    return null;
  }
}

const referenceProvider: vscode.ReferenceProvider = {
  provideReferences(doc, position, ctx) {
    const ranges = safely(
      "getReferences",
      () =>
        getReferences(doc.getText(), toServicePosition(position), {
          includeDeclaration: ctx.includeDeclaration,
        }),
      [],
    );
    return ranges.map((r) => new vscode.Location(doc.uri, toVsRange(r)));
  },
};

const highlightProvider: vscode.DocumentHighlightProvider = {
  provideDocumentHighlights(doc, position) {
    const ranges = safely(
      "getDocumentHighlights",
      () => getDocumentHighlights(doc.getText(), toServicePosition(position)),
      [],
    );
    return ranges.map((r) => new vscode.DocumentHighlight(toVsRange(r)));
  },
};

const symbolProvider: vscode.DocumentSymbolProvider = {
  provideDocumentSymbols(doc) {
    return safely("getDocumentSymbols", () => getDocumentSymbols(doc.getText()), []).map((s) =>
      toVsSymbol(s),
    );
  },
};

/**
 * Ctrl+T across an `.aktion` project. The service is single-file, so — exactly as
 * with cross-file go-to-definition — the *host* walks the files and calls it once
 * per document.
 */
const workspaceSymbolProvider: vscode.WorkspaceSymbolProvider = {
  async provideWorkspaceSymbols(query, token) {
    // VS Code opens the picker with an empty query; scanning the whole workspace
    // to fill a list nobody asked for is pure latency.
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];

    const files = await vscode.workspace.findFiles(
      "**/*.aktion",
      "**/node_modules/**",
      WORKSPACE_SYMBOL_FILE_LIMIT,
      token,
    );

    const found: vscode.SymbolInformation[] = [];
    for (const file of files) {
      if (token.isCancellationRequested) return found;
      const source = await readSource(file);
      if (source == null) continue;
      for (const symbol of safely("getDocumentSymbols", () => getDocumentSymbols(source), [])) {
        if (!symbol.name.toLowerCase().includes(needle)) continue;
        found.push(
          new vscode.SymbolInformation(
            symbol.name,
            symbolKindFor(symbol.kind),
            symbol.detail,
            new vscode.Location(file, toVsRange(symbol.selectionRange)),
          ),
        );
      }
    }
    return found;
  },
};

/** Async counterpart of `readModuleSource` — works for any URI scheme. */
async function readSource(uri: vscode.Uri): Promise<string | null> {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.getText();
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return null;
  }
}

const renameProvider: vscode.RenameProvider = {
  prepareRename(doc, position) {
    const word = doc.getWordRangeAtPosition(position, IDENTIFIER);
    if (!word) throw new Error("Nothing to rename here.");
    // Validate eagerly so a non-renameable symbol shows the reason up front.
    // Deliberately NOT wrapped in `safely` — rename is the one flow where VS Code
    // surfaces the thrown message to the user, so swallowing it would be worse.
    const probe = getRenameEdits(doc.getText(), toServicePosition(position), "renameProbe");
    if (probe.error) throw new Error(probe.error);
    return { range: word, placeholder: doc.getText(word) };
  },
  provideRenameEdits(doc, position, newName) {
    const result = getRenameEdits(doc.getText(), toServicePosition(position), newName);
    if (result.error) throw new Error(result.error);
    const edit = new vscode.WorkspaceEdit();
    for (const e of result.edits) edit.replace(doc.uri, toVsRange(e.range), e.newText);
    return edit;
  },
};

const signatureHelpProvider: vscode.SignatureHelpProvider = {
  provideSignatureHelp(doc, position) {
    const help = safely(
      "getSignatureHelp",
      () => getSignatureHelp(doc.getText(), toServicePosition(position), defaultLibrary),
      null,
    );
    if (!help) return null;
    const result = new vscode.SignatureHelp();
    result.activeSignature = help.activeSignature;
    result.activeParameter = help.activeParameter;
    result.signatures = help.signatures.map((sig) => {
      const info = new vscode.SignatureInformation(
        sig.label,
        sig.documentation ? new vscode.MarkdownString(sig.documentation) : undefined,
      );
      info.parameters = sig.parameters.map(
        (p) =>
          new vscode.ParameterInformation(
            p.label,
            p.documentation ? new vscode.MarkdownString(p.documentation) : undefined,
          ),
      );
      return info;
    });
    return result;
  },
};

/**
 * Quick fixes for the unknown-component warning `getDiagnostics` reports.
 *
 * The warning's prose already says "Did you mean …?"; this makes the suggestion
 * *applicable*. The candidate ranking comes from `suggestComponent` on the
 * language surface — the extension must never own a second notion of which
 * component names are near a typo.
 */
const codeActionProvider: vscode.CodeActionProvider = {
  provideCodeActions(doc, _range, ctx) {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of ctx.diagnostics) {
      if (diagnostic.source !== SOURCE) continue;
      if (diagnostic.severity !== vscode.DiagnosticSeverity.Warning) continue;

      const wordRange = doc.getWordRangeAtPosition(diagnostic.range.start, IDENTIFIER);
      if (!wordRange) continue;
      const name = doc.getText(wordRange);
      // Only a PascalCase name that is genuinely not a component: this keeps the
      // pass off the other soft warnings (e.g. i18n shadowing, whose subject is a
      // lower-case binding) without matching on message text.
      if (!/^[A-Z][A-Za-z0-9_]*$/.test(name) || componentNames().has(name)) continue;

      for (const suggestion of safely(
        "suggestComponent",
        () => suggestComponent(name, defaultLibrary, 3),
        [],
      )) {
        if (suggestion === name) continue;
        const action = new vscode.CodeAction(
          `Change to "${suggestion}"`,
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [diagnostic];
        action.isPreferred = actions.length === 0;
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(doc.uri, wordRange, suggestion);
        actions.push(action);
      }
    }
    return actions;
  },
};

/** Component names, from the catalog. Built once — the library is immutable. */
let componentNameCache: Set<string> | undefined;
function componentNames(): Set<string> {
  componentNameCache ??= new Set(getComponentCatalog().map((entry) => entry.name));
  return componentNameCache;
}

const semanticTokensProvider: vscode.DocumentSemanticTokensProvider = {
  provideDocumentSemanticTokens(doc) {
    const builder = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND);
    for (const token of safely(
      "getSemanticTokens",
      () => getSemanticTokens(doc.getText(), defaultLibrary),
      [],
    )) {
      const typeIndex = SEMANTIC_LEGEND.tokenTypes.indexOf(token.tokenType);
      // A type the legend does not declare would encode as -1 and corrupt the
      // whole delta-encoded stream — drop the token instead.
      if (typeIndex < 0) continue;
      builder.push(
        token.line - 1,
        token.column - 1,
        token.length,
        typeIndex,
        encodeModifiers(token.tokenModifiers),
      );
    }
    return builder.build();
  },
};

// ---------------------------------------------------------------------------
// Mapping helpers (service is 1-indexed; VS Code is 0-indexed)
//
// Twins of `toServicePosition` / `toLspRange` / the two kind tables in
// `editors/lsp/src/server.ts` — same convention, different target types.
// ---------------------------------------------------------------------------

function toServicePosition(position: vscode.Position): { line: number; column: number } {
  return { line: position.line + 1, column: position.character + 1 };
}

function toVsRange(range: AktionRange): vscode.Range {
  return new vscode.Range(
    range.start.line - 1,
    range.start.column - 1,
    range.end.line - 1,
    range.end.column - 1,
  );
}

function toVsSymbol(symbol: AktionSymbol): vscode.DocumentSymbol {
  const range = toVsRange(symbol.range);
  const selection = toVsRange(symbol.selectionRange);
  return new vscode.DocumentSymbol(symbol.name, symbol.detail, symbolKindFor(symbol.kind), range, selection);
}

function symbolKindFor(kind: AktionSymbol["kind"]): vscode.SymbolKind {
  switch (kind) {
    case "component":
      return vscode.SymbolKind.Class;
    case "action":
      return vscode.SymbolKind.Function;
    case "hook":
      return vscode.SymbolKind.Method;
    case "state":
      return vscode.SymbolKind.Variable;
    case "import":
      return vscode.SymbolKind.Module;
    default:
      return vscode.SymbolKind.Variable;
  }
}

function encodeModifiers(modifiers: readonly string[]): number {
  let mask = 0;
  for (const mod of modifiers) {
    const index = SEMANTIC_LEGEND.tokenModifiers.indexOf(mod);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

function toVsCompletion(item: AktionCompletion): vscode.CompletionItem {
  const completion = new vscode.CompletionItem(item.label, kindFor(item.kind));
  if (item.detail) completion.detail = item.detail;
  if (item.documentation) completion.documentation = new vscode.MarkdownString(item.documentation);
  return completion;
}

function kindFor(kind: AktionCompletion["kind"]): vscode.CompletionItemKind {
  switch (kind) {
    case "component":
      return vscode.CompletionItemKind.Class;
    case "prop":
      return vscode.CompletionItemKind.Property;
    case "state":
      return vscode.CompletionItemKind.Variable;
    case "builtin":
      return vscode.CompletionItemKind.Function;
    case "keyword":
      return vscode.CompletionItemKind.Keyword;
    default:
      return vscode.CompletionItemKind.Text;
  }
}

/**
 * Run a best-effort service call. A throw from tokenize/parse/validate on a
 * pathological buffer must not escape a provider or an event handler: VS Code
 * would log it to a hidden extension-host log and the user would just see a dead
 * feature. Twin: `safely` in `editors/lsp/src/server.ts`.
 */
function safely<T>(what: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    channel?.appendLine(`[${new Date().toISOString()}] ${what} failed: ${String(err)}`);
    return fallback;
  }
}
