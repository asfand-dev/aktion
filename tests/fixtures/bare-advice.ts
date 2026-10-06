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
 * there and, when the message says to, put `export` on the declaration instead.
 */
export function applyAdvice(source: string, warnings: readonly AdviceWarning[]): string {
  const lines = source.split("\n");
  const exportOn: string[] = [];

  // Bottom-up, so an edit never moves a position another warning still needs.
  for (const warning of [...warnings].sort((a, b) => b.line - a.line)) {
    const text = lines[warning.line - 1]!;
    const at = warning.column - 1;
    const advised = /write `((?:export )?(?:let|const))` before the name/.exec(warning.message);
    if (advised) {
      const keyword = advised[1]!;
      const rest = keyword.startsWith("export") ? text.slice(at).replace(/^export\s+/, "") : text.slice(at);
      lines[warning.line - 1] = `${text.slice(0, at)}${keyword} ${rest}`;
      continue;
    }
    if (!/drop the `export` here|and drop it here/.test(warning.message)) throw new Error(`no advice found in: ${warning.message}`);
    lines[warning.line - 1] = `${text.slice(0, at)}${text.slice(at).replace(/^export\s+/, "")}`;
    if (warning.message.includes("put `export` on the declaration")) {
      exportOn.push(/^`export ([^`]+)`/.exec(warning.message)![1]!);
    }
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
