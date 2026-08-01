/**
 * Every Aktion example in the repo's markdown must be a valid program.
 *
 * This closes a structural gap. `scripts/emit-skill.mjs` gates the ```aktion
 * blocks inside `skills/aktion/`, and `tests/prompt-structure.test.ts` gates the
 * generated system prompt — but README.md's ~30 Aktion examples are tagged
 * ```js (they render better on GitHub that way) and were therefore checked by
 * NOTHING. That is exactly how three of them came to sit at HEAD calling
 * `ErrorAlert`, `Notice`, `ListView`, `GridView`, `ShowName` and `ShowAge` —
 * six components that do not exist. A reader pasting them into the playground
 * saw squiggles in a snippet whose point was control flow.
 *
 * The check is by CONTENT, not by fence tag: any fenced block that contains
 * `$app(` is a complete Aktion program and is validated, whatever it is tagged.
 * That way an example cannot escape the gate by choosing a different tag.
 *
 * Gating on warnings as well as errors is deliberate — the unknown-component
 * lint is a warning, and an example naming a non-existent component is the single
 * worst thing documentation can do here.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getDiagnostics } from "../src/tooling/language-service.js";
import { defaultLibrary } from "../src/library/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Markdown files whose Aktion examples are part of the public contract. */
const FILES = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "create-aktion/README.md",
  "editors/vscode/README.md",
  "editors/vscode/docs/README.md",
  "editors/lsp/README.md",
  "editors/jetbrains/README.md",
  "editors/jetbrains/docs/README.md",
  "skills/aktion/SKILL.md",
  ...readdirSync(resolve(repoRoot, "skills/aktion/references"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `skills/aktion/references/${f}`),
].filter((f) => existsSync(resolve(repoRoot, f)));

interface Block {
  code: string;
  line: number;
  fence: string;
}

function fencedBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.split("\n");
  let start = -1;
  let fence = "";
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (start < 0) {
      const open = /^```([\w-]*)\s*$/.exec(trimmed);
      if (open) {
        fence = open[1] ?? "";
        start = i;
      }
      continue;
    }
    if (trimmed !== "```") continue;
    out.push({ code: lines.slice(start + 1, i).join("\n"), line: start + 1, fence });
    start = -1;
  }
  return out;
}

/**
 * A complete program. Fragments (`$count = 0` on its own, a prop table, a shell
 * command) are not validated — they legitimately do not stand alone.
 *
 * `text`-tagged blocks are excluded by design: that tag marks a grammar sketch
 * with metasyntactic placeholders, e.g. `Component(positionalArg, …)`.
 */
function isCompleteProgram(block: Block): boolean {
  if (block.fence === "text") return false;
  if (!/^(aktion|js|javascript|ts|typescript|)$/.test(block.fence)) return false;
  return block.code.includes("$app(");
}

describe("documentation examples are valid Aktion", () => {
  it("finds programs to check in the README", () => {
    // Guard the guard: if the extraction ever stops matching, this test would
    // silently pass while protecting nothing.
    const readme = fencedBlocks(readFileSync(resolve(repoRoot, "README.md"), "utf8"));
    expect(readme.filter(isCompleteProgram).length).toBeGreaterThan(5);
  });

  for (const file of FILES) {
    it(`validates every complete program in ${file}`, () => {
      const blocks = fencedBlocks(readFileSync(resolve(repoRoot, file), "utf8"));
      const failures: string[] = [];
      for (const block of blocks) {
        if (!isCompleteProgram(block)) continue;
        for (const d of getDiagnostics(block.code, defaultLibrary)) {
          failures.push(`${file}:${block.line + d.line} ${d.severity}: ${d.message}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

describe("documentation examples inside <aktion-app> tags are valid Aktion", () => {
  /**
   * The docs also show programs embedded in a plain HTML page. Those live inside
   * ```html blocks, so the fenced-program extractor above skips them — but the
   * Aktion inside the tag is just as copyable, and just as able to name a
   * component that does not exist.
   *
   * Extraction is scoped to ```html BLOCKS rather than run over the whole file.
   * Scanning the raw markdown looks simpler and is wrong: `<aktion-app>` appears
   * dozens of times in prose, and an opening tag with no nearby close makes even a
   * non-greedy match swallow paragraphs of markdown until the next `</aktion-app>`,
   * which then "fails" as a syntax error somewhere unrelated.
   */
  const TAG = /<aktion-app(?:\s[^>]*)?>([\s\S]*?)<\/aktion-app>/g;

  for (const file of FILES) {
    it(`validates every embedded program in ${file}`, () => {
      const blocks = fencedBlocks(readFileSync(resolve(repoRoot, file), "utf8"))
        .filter((b) => b.fence === "html");
      const failures: string[] = [];
      for (const block of blocks) {
        for (const match of block.code.matchAll(TAG)) {
          const code = match[1]!.trim();
          // Skip empty hosts (`<aktion-app></aktion-app>` as a mount point) and
          // attribute-only examples that carry no program.
          if (!code || !code.includes("$app(")) continue;
          for (const d of getDiagnostics(code, defaultLibrary)) {
            failures.push(`${file}:${block.line} (embedded) L${d.line} ${d.severity}: ${d.message}`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
