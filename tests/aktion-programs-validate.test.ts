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

const root = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "site"]);

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collect(full, out);
    else if (entry.endsWith(".aktion")) out.push(full);
  }
}

const files: string[] = [];
collect(root, files);

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
