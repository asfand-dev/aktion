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
 *
 * A block tagged ```ts aktion / ```js aktion is an `.aktion.ts` / `.aktion.js`
 * MODULE, not DSL text: it is compiled by that language's frontend first (type
 * erasure, the JavaScript-semantics rules), then schema-checked and linted on
 * the erased text — exactly what the Vite plugin and `validate-aktion` do.
 * GitHub highlights it by the first word of the info string.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getDiagnostics, getLintWarnings } from "../src/tooling/language-service.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

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
  /** The second word of the info string — `aktion` in ```ts aktion. */
  meta: string;
}

function fencedBlocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.split("\n");
  let start = -1;
  let fence = "";
  let meta = "";
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (start < 0) {
      const open = /^```([\w-]*)(?:\s+([\w-]+))?\s*$/.exec(trimmed);
      if (open) {
        fence = open[1] ?? "";
        meta = open[2] ?? "";
        start = i;
      }
      continue;
    }
    if (trimmed !== "```") continue;
    out.push({ code: lines.slice(start + 1, i).join("\n"), line: start + 1, fence, meta });
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

const typescriptFrontend = createTypeScriptFrontend();

/** Every problem in a block: DSL text through `getDiagnostics`, a ```ts aktion / ```js aktion module through its frontend. */
function blockDiagnostics(block: Block): Array<{ line: number; severity: string; message: string }> {
  if (block.meta !== "aktion" || block.fence === "aktion" || block.fence === "") {
    return getDiagnostics(block.code, defaultLibrary);
  }
  const typescript = block.fence === "ts" || block.fence === "typescript";
  const frontend = typescript ? typescriptFrontend : javascriptFrontend;
  const out = frontend.compile(block.code, typescript ? "/docs/example.aktion.ts" : "/docs/example.aktion.js");
  return [
    ...out.program.errors.map((e) => ({ line: e.line, severity: "error", message: e.message })),
    ...out.diagnostics.map((d) => ({ line: d.line, severity: d.severity, message: `${d.code ?? ""} ${d.message}` })),
    ...validateProgramSchema(out.program, defaultLibrary).map((e) => ({ line: e.line, severity: "error", message: e.message })),
    ...getLintWarnings(out.aktionSource, defaultLibrary).map((w) => ({ line: w.line, severity: "warning", message: w.message })),
  ];
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
        for (const d of blockDiagnostics(block)) {
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
