/**
 * Command palette entries.
 *
 * The language *providers* only ever answer questions about the document under
 * the cursor, which left three whole catalogs on the language surface with no way
 * to reach them from the editor: the component catalog (name + group + params for
 * every component), the namespace / factory-resource catalogs, and the language
 * spec + grammar. These commands are that missing door — and, as everywhere else
 * in this extension, they *read* the surface rather than restating it.
 *
 *   - `aktion.copySystemPrompt`     — the generated LLM system prompt (full or chat).
 *   - `aktion.showLanguageReference` — the derived Markdown reference (see reference.ts).
 *   - `aktion.insertComponent`      — quick pick over every component, grouped.
 */

import * as vscode from "vscode";
import { getComponentCatalog, type ComponentEntry } from "aktion-runtime/language";
import { buildLanguageReference } from "./reference.js";

/** Prompt variants, as published by the runtime package's `exports` map. */
const PROMPT_VARIANTS: ReadonlyArray<{ label: string; description: string; file: string }> = [
  {
    label: "Full system prompt",
    description: "Complete language + component reference — for coding agents",
    file: "system_prompt.txt",
  },
  {
    label: "Chat system prompt",
    description: "Compact variant — for chat-sized context windows",
    file: "system_prompt_chat.txt",
  },
];

export function registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("aktion.copySystemPrompt", () => copySystemPrompt(context)),
    vscode.commands.registerCommand("aktion.showLanguageReference", showLanguageReference),
    vscode.commands.registerCommand("aktion.insertComponent", insertComponent),
  ];
}

/**
 * Copy the generated Aktion system prompt to the clipboard.
 *
 * The prompts are build outputs of the runtime (`scripts/emit-prompt.mjs`), copied
 * into this extension's `dist/` by `esbuild.mjs`. They are large (hundreds of KB),
 * so they are read on demand and never held in the bundle.
 */
async function copySystemPrompt(context: vscode.ExtensionContext): Promise<void> {
  const pick = await vscode.window.showQuickPick(PROMPT_VARIANTS, {
    placeHolder: "Which Aktion system prompt?",
    matchOnDescription: true,
  });
  if (!pick) return;

  const uri = vscode.Uri.joinPath(context.extensionUri, "dist", pick.file);
  let text: string;
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    void vscode.window.showErrorMessage(
      `Aktion: ${pick.file} is not bundled with this build. Run \`npm run build\` at the ` +
        `repository root (it generates dist/${pick.file}), then rebuild the extension.`,
    );
    return;
  }

  await vscode.env.clipboard.writeText(text);
  const open = "Open in editor";
  const choice = await vscode.window.showInformationMessage(
    `Aktion: ${pick.label} copied (${text.length.toLocaleString()} characters).`,
    open,
  );
  if (choice === open) await openScratch(text, "plaintext");
}

/** Open the derived language reference as an untitled Markdown document. */
async function showLanguageReference(): Promise<void> {
  await openScratch(buildLanguageReference(), "markdown");
}

/**
 * Insert a component call at the cursor, chosen from the full catalog.
 *
 * The inserted text is assembled from the component's declared REQUIRED params —
 * their names and declared types, read from the catalog — so no per-component
 * shape is encoded here. Note this deliberately does NOT reuse the runtime's
 * curated snippets: those are statement-level templates (`card1 = Card([…])`) and
 * would be malformed dropped inside an existing component tree. They stay
 * available the usual way, by typing their prefix.
 */
async function insertComponent(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Aktion: open a .aktion file first.");
    return;
  }

  const catalog = getComponentCatalog();
  const items: ComponentPick[] = [];
  // Bucket by the catalog's own `group`, in order of first appearance, so the
  // picker is browsable and not 282 undifferentiated names. Separators are inert
  // rows — hence `entry` being optional on the item type.
  const byGroup = new Map<string, ComponentEntry[]>();
  for (const entry of catalog) {
    const bucket = byGroup.get(entry.group);
    if (bucket) bucket.push(entry);
    else byGroup.set(entry.group, [entry]);
  }
  for (const [group, entries] of byGroup) {
    items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
    for (const entry of entries) {
      items.push({
        label: entry.name,
        description: entry.group,
        detail: firstSentence(entry.description),
        entry,
      });
    }
  }

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Insert a component (${catalog.length} available)`,
    matchOnDetail: true,
  });
  if (!pick?.entry) return;

  await editor.insertSnippet(new vscode.SnippetString(snippetFromParams(pick.entry)));
}

/** A component row, or a group separator (which carries no `entry`). */
type ComponentPick = vscode.QuickPickItem & { entry?: ComponentEntry };

/** `Card(${1:children})`-style skeleton built from the declared params. */
function snippetFromParams(entry: ComponentEntry): string {
  const required = entry.params.filter((p) => p.required);
  const args = required.map((param, index) => {
    const stop = `\${${index + 1}:${param.name}}`;
    // A `Node[]` / `string[]` param is written as an array literal at the call
    // site; the declared type is the only thing that tells us so.
    return param.type.endsWith("[]") ? `[${stop}]` : stop;
  });
  return `${entry.name}(${args.join(", ")})$0`;
}

async function openScratch(content: string, language: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(doc, { preview: false });
}

function firstSentence(text: string | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  const stop = trimmed.search(/\.\s|\.$/);
  return stop > 0 ? trimmed.slice(0, stop + 1) : trimmed;
}
