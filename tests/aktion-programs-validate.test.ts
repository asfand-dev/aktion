/**
 * Whole-repo schema sweep: every committed `.aktion` program (docs examples,
 * demo apps, component showcases) must parse and validate cleanly against
 * the current library — keeps the shipped examples honest whenever prop
 * enums, call-binding rules, or naming rules change.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "../src/parser/index.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";
import { javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

const root = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "site"]);
// `.aktion.ts` / `.aktion.js` fixtures (ESLint, DSL types) contain deliberate
// mistakes; real modules live in the templates and docs.
const FIXTURES = join(root, "tests", "fixtures");

function collect(dir: string, out: string[], modules: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collect(full, out, modules);
    else if (entry.endsWith(".aktion")) out.push(full);
    else if (/\.aktion\.[jt]s$/.test(entry) && !full.startsWith(FIXTURES)) modules.push(full);
  }
}

const files: string[] = [];
const jsModules: string[] = [];
collect(root, files, jsModules);
const typescript = createTypeScriptFrontend();

describe("repo .aktion programs validate cleanly", () => {
  it("found a representative set of programs", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files.sort()) {
    it(relative(root, file), () => {
      const program = parse(readFileSync(file, "utf8"));
      const errors = validateProgramSchema(program, defaultLibrary);
      expect(errors.map((e) => `L${e.line}: ${e.message}`)).toEqual([]);
    });
  }
});

describe("repo .aktion.ts / .aktion.js modules compile and validate cleanly", () => {
  it("found the TypeScript and JavaScript templates", () => {
    expect(jsModules.some((f) => f.endsWith(".aktion.ts"))).toBe(true);
    expect(jsModules.some((f) => f.endsWith(".aktion.js"))).toBe(true);
  });

  for (const file of jsModules.sort()) {
    it(relative(root, file), () => {
      const frontend = file.endsWith(".ts") ? typescript : javascriptFrontend;
      const out = frontend.compile(readFileSync(file, "utf8"), file);
      const problems = [
        ...out.program.errors.map((e) => `L${e.line}: ${e.message}`),
        ...out.diagnostics.map((d) => `L${d.line}: ${d.code ?? ""} ${d.message}`),
        ...validateProgramSchema(out.program, defaultLibrary).map((e) => `L${e.line}: ${e.message}`),
      ];
      expect(problems).toEqual([]);
    });
  }
});
