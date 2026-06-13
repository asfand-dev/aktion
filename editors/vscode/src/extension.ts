/**
 * Aktion VS Code extension.
 *
 * `.aktion` files highlight as TypeScript (the TextMate grammar includes
 * `source.ts`) with Aktion-specific overlays, and this extension layers full
 * language intelligence on top — diagnostics, hover, completions, formatting,
 * go-to-definition, find-all-references, rename, document symbols (outline),
 * document highlights, signature help, and semantic highlighting.
 *
 * Every feature is powered IN-PROCESS by the DOM-free `aktion-runtime/language`
 * surface (the same pure functions the docs playground uses). There is no
 * language server: the extension is a thin adapter that maps the service's
 * 1-indexed JSON results onto VS Code's 0-indexed API types.
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
  defaultLibrary,
  type CompletionItem as AktionCompletion,
  type Range as AktionRange,
  type DocumentSymbol as AktionSymbol,
} from "aktion-runtime/language";

const LANGUAGE = "aktion";
const SOURCE = "aktion";

const SEMANTIC_LEGEND = new vscode.SemanticTokensLegend(
  [...semanticTokenTypes],
  [...semanticTokenModifiers],
);

export function activate(context: vscode.ExtensionContext): void {
  registerDiagnostics(context);

  const selector: vscode.DocumentSelector = { language: LANGUAGE };
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, hoverProvider),
    vscode.languages.registerCompletionItemProvider(selector, completionProvider, "$", "."),
    vscode.languages.registerDocumentFormattingEditProvider(selector, formattingProvider),
    vscode.languages.registerDefinitionProvider(selector, definitionProvider),
    vscode.languages.registerReferenceProvider(selector, referenceProvider),
    vscode.languages.registerDocumentHighlightProvider(selector, highlightProvider),
    vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider),
    vscode.languages.registerRenameProvider(selector, renameProvider),
    vscode.languages.registerSignatureHelpProvider(selector, signatureHelpProvider, "(", ","),
    vscode.languages.registerDocumentSemanticTokensProvider(
      selector,
      semanticTokensProvider,
      SEMANTIC_LEGEND,
    ),
  );
}

export function deactivate(): void {
  /* DiagnosticCollection is disposed via context.subscriptions. */
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE);
  context.subscriptions.push(collection);

  const refresh = (doc: vscode.TextDocument): void => {
    if (doc.languageId !== LANGUAGE) return;
    const diagnostics = getDiagnostics(doc.getText(), defaultLibrary).map((d) => {
      // The language service is 1-indexed; VS Code is 0-indexed.
      const line = Math.min(Math.max(0, d.line - 1), Math.max(0, doc.lineCount - 1));
      const startCol = Math.max(0, d.column - 1);
      const endCol = doc.lineAt(line).range.end.character;
      const range = new vscode.Range(line, Math.min(startCol, endCol), line, endCol);
      const severity =
        d.severity === "warning"
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Error;
      const diagnostic = new vscode.Diagnostic(range, d.message, severity);
      diagnostic.source = SOURCE;
      return diagnostic;
    });
    collection.set(doc.uri, diagnostics);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
  );
  vscode.workspace.textDocuments.forEach(refresh);
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const hoverProvider: vscode.HoverProvider = {
  provideHover(doc, position) {
    const info = getHoverInfo(doc.getText(), toServicePosition(position), defaultLibrary);
    return info ? new vscode.Hover(new vscode.MarkdownString(info.contents)) : null;
  },
};

const completionProvider: vscode.CompletionItemProvider = {
  provideCompletionItems(doc, position) {
    return getCompletions(doc.getText(), toServicePosition(position), defaultLibrary).map(
      toVsCompletion,
    );
  },
};

// Format-on-save / "Format Document": `formatProgram` is the canonical,
// idempotent pretty-printer. It returns the input unchanged when the document
// has parse errors, so a mid-edit file is never mangled.
const formattingProvider: vscode.DocumentFormattingEditProvider = {
  provideDocumentFormattingEdits(doc) {
    const { formatted, errors } = formatProgram(doc.getText());
    if (errors.length > 0 || formatted === doc.getText()) return [];
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    return [vscode.TextEdit.replace(fullRange, formatted)];
  },
};

// Go-to-definition resolves three cases (classified by the language service):
//   - a file-local declaration → jump within this document,
//   - an imported binding (e.g. `$count` from "./counter.aktion") → open the
//     source module and land on its declaration,
//   - the module specifier string itself → open that file.
const definitionProvider: vscode.DefinitionProvider = {
  provideDefinition(doc, position) {
    const target = getDefinitionTarget(doc.getText(), toServicePosition(position));
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
        ? findDeclaration(targetSource, target.imported, target.isState ?? false)
        : null;
    return new vscode.Location(fileUri, range ? toVsRange(range) : new vscode.Position(0, 0));
  },
};

/**
 * Resolve a relative module specifier against the importing document's
 * directory. Tries the literal path, then `.aktion`, then `/index.aktion`.
 * Bare (non-relative) specifiers are not resolved.
 */
function resolveModule(fromUri: vscode.Uri, spec: string): vscode.Uri | null {
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

/** Read a module's source, preferring an open (possibly unsaved) document. */
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
    const ranges = getReferences(doc.getText(), toServicePosition(position), {
      includeDeclaration: ctx.includeDeclaration,
    });
    return ranges.map((r) => new vscode.Location(doc.uri, toVsRange(r)));
  },
};

const highlightProvider: vscode.DocumentHighlightProvider = {
  provideDocumentHighlights(doc, position) {
    const ranges = getDocumentHighlights(doc.getText(), toServicePosition(position));
    return ranges.map((r) => new vscode.DocumentHighlight(toVsRange(r)));
  },
};

const symbolProvider: vscode.DocumentSymbolProvider = {
  provideDocumentSymbols(doc) {
    return getDocumentSymbols(doc.getText()).map((s) => toVsSymbol(s));
  },
};

const renameProvider: vscode.RenameProvider = {
  prepareRename(doc, position) {
    const word = doc.getWordRangeAtPosition(position, /\$?[A-Za-z_][A-Za-z0-9_]*/);
    if (!word) throw new Error("Nothing to rename here.");
    // Validate eagerly so a non-renameable symbol shows the reason up front.
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
    const help = getSignatureHelp(doc.getText(), toServicePosition(position), defaultLibrary);
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

const semanticTokensProvider: vscode.DocumentSemanticTokensProvider = {
  provideDocumentSemanticTokens(doc) {
    const builder = new vscode.SemanticTokensBuilder(SEMANTIC_LEGEND);
    for (const token of getSemanticTokens(doc.getText(), defaultLibrary)) {
      builder.push(
        token.line - 1,
        token.column - 1,
        token.length,
        SEMANTIC_LEGEND.tokenTypes.indexOf(token.tokenType),
        encodeModifiers(token.tokenModifiers),
      );
    }
    return builder.build();
  },
};

// ---------------------------------------------------------------------------
// Mapping helpers (service is 1-indexed; VS Code is 0-indexed)
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
