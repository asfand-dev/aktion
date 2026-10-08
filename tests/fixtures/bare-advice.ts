/**
 * Test support for the `bare-declaration` lint: apply the advice its warnings give
 * to a program, the way an author would, so a test can check the result is still a
 * program. Not a test file itself.
 */

import { Linter } from "eslint";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface AdviceWarning {
  line: number;
  column: number;
  message: string;
}

const escapeRegExp = (name: string): string => name.replace(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

/**
 * Apply every warning's advice to `source`: insert the keyword it recommends at the
 * reported position; for an `export` of an already declared name, drop the `export`
 * there and do what else the message says: put `export` on the declaration, change
 * its `const` to `let`, take the name out of a destructuring and declare it on its
 * own, or import it under another local name. The destructuring edit understands
 * `const { A, B } = source` with plain (not renamed or nested) names.
 */
export function applyAdvice(source: string, warnings: readonly AdviceWarning[]): string {
  const lines = source.split("\n");
  const exportOn: string[] = [];
  const constToLet: string[] = [];
  const outOfPattern: string[] = [];
  const renameImport: Array<{ local: string; imported: string }> = [];

  // Bottom-up, so an edit never moves a position another warning still needs.
  for (const warning of [...warnings].sort((a, b) => b.line - a.line)) {
    const text = lines[warning.line - 1]!;
    const at = warning.column - 1;
    const name = /^`export ([^`]+)`/.exec(warning.message)?.[1];
    if (name && /import it under another local name/.test(warning.message)) {
      lines[warning.line - 1] = `${text.slice(0, at)}export let ${text.slice(at).replace(/^export\s+/, "")}`;
      const imported = /another local name \(`import \{ ([^ `]+) as … \}`/.exec(warning.message)?.[1];
      if (!imported) throw new Error(`no imported name in: ${warning.message}`);
      renameImport.push({ local: name, imported });
      continue;
    }
    const advised = /write `((?:export )?(?:let|const))` before the name/.exec(warning.message);
    if (advised) {
      const keyword = advised[1]!;
      const rest = keyword.startsWith("export") ? text.slice(at).replace(/^export\s+/, "") : text.slice(at);
      lines[warning.line - 1] = `${text.slice(0, at)}${keyword} ${rest}`;
      continue;
    }
    if (!/drop the `export` here|and drop it here/.test(warning.message)) throw new Error(`no advice found in: ${warning.message}`);
    lines[warning.line - 1] = `${text.slice(0, at)}${text.slice(at).replace(/^export\s+/, "")}`;
    if (/put `export` on the declaration/i.test(warning.message)) exportOn.push(name!);
    if (/`const` to `let`/.test(warning.message)) constToLet.push(name!);
    if (/out of the pattern/.test(warning.message)) outOfPattern.push(name!);
  }

  // The advice names the imported name, as the specifier is spelled: `import { X as … }` (and
  // `in place of X as B` when the local name differs). Give the specifier a new local name.
  for (const { local, imported } of renameImport) {
    const specifier = new RegExp(
      String.raw`(?<![\w$])${escapeRegExp(imported)}(?:\s+as\s+${escapeRegExp(local)})?(?![\w$])`,
    );
    const index = lines.findIndex((line) => /^\s*import\b/.test(line) && specifier.test(line));
    if (index === -1) throw new Error(`no import of ${imported}:\n${lines.join("\n")}`);
    lines[index] = lines[index]!.replace(specifier, `${imported} as ${local}_`);
  }

  for (const name of outOfPattern) {
    const pattern = new RegExp(String.raw`^(\s*(?:const|let|var)\s*)\{([^}]*)\}(\s*=\s*)(.+)$`);
    const index = lines.findIndex((line) => {
      const m = pattern.exec(line);
      return m !== null && m[2]!.split(",").some((part) => part.trim() === name);
    });
    if (index === -1) throw new Error(`no destructuring of ${name}:\n${lines.join("\n")}`);
    const [, head, names, eq, source] = pattern.exec(lines[index]!)!;
    const rest = names!.split(",").map((part) => part.trim()).filter((part) => part !== name && part !== "");
    lines[index] = `${head}{ ${rest.join(", ")} }${eq}${source}`;
    lines.splice(index + 1, 0, `export let ${name} = ${source}.${name}`);
  }

  for (const name of constToLet) {
    const declaration = new RegExp(String.raw`^(\s*(?:export\s+)?)const(\s+${escapeRegExp(name)}\b)`);
    const index = lines.findIndex((line) => declaration.test(line));
    if (index === -1) throw new Error(`no const ${name} to change:\n${lines.join("\n")}`);
    lines[index] = lines[index]!.replace(declaration, "$1let$2");
  }

  for (const name of exportOn) {
    const declaration = new RegExp(String.raw`^\s*(?:let|const|var|function)\s+${escapeRegExp(name)}\b`);
    const index = lines.findIndex((line) => declaration.test(line));
    if (index === -1) throw new Error(`no declaration of ${name} to put \`export\` on:\n${lines.join("\n")}`);
    lines[index] = lines[index]!.replace(/^(\s*)/, "$1export ");
  }
  return lines.join("\n");
}

/** What ESLint reports for `source` as an ES module: parse errors, const writes, redeclarations. */
export function moduleProblems(source: string): string[] {
  const messages = new Linter().verify(
    source,
    [
      {
        files: ["**/*.js"],
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
        rules: { "no-const-assign": "error", "no-redeclare": "error", "no-import-assign": "error" },
      },
    ],
    "advice.js",
  );
  return messages.map((m) => `${m.ruleId ?? "parse"}: ${m.message}`);
}

/** Run `source` as an ES module under Node; throws on a SyntaxError, a TypeError, anything. */
export function runAsModule(source: string): void {
  const dir = mkdtempSync(join(tmpdir(), "aktion-bare-advice-"));
  try {
    const file = join(dir, "advice.mjs");
    writeFileSync(file, source, "utf8");
    execFileSync(process.execPath, [file], { stdio: "pipe" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
