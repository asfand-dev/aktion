#!/usr/bin/env node
/**
 * One-shot migration: replace every `@FooName(` invocation with the
 * equivalent `Util.fooName(` call. The Aktion runtime no longer
 * recognises the legacy `@`-builtin sigil; the `Util` global exposes
 * the same set of helpers.
 *
 * Run from the repository root:
 *   node scripts/migrate-at-builtins.mjs
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { readdirSync } from "node:fs";

const ROOT = resolve(process.argv[2] ?? ".");

const INCLUDE_EXT = new Set([
  ".md", ".html", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".txt", ".css", ".json",
]);

const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".git", "coverage", ".vscode",
  "backup-files",
  // Migration script outputs/inputs we do NOT want to touch.
  "scripts",
]);

// Files we explicitly want to skip (already authoritative or self-referential).
const SKIP_FILES = new Set([
  "scripts/migrate-at-builtins.mjs",
]);

const BUILTIN_RE = /@([A-Z][A-Za-z0-9]*)\(/g;

function lowerFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT)
  .filter((f) => INCLUDE_EXT.has(f.slice(f.lastIndexOf("."))))
  .filter((f) => !SKIP_FILES.has(relative(ROOT, f)));

let changed = 0;
let hits = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  let count = 0;
  const after = before.replace(BUILTIN_RE, (_m, name) => {
    count += 1;
    return `Util.${lowerFirst(name)}(`;
  });
  if (count > 0) {
    writeFileSync(file, after);
    changed += 1;
    hits += count;
    console.log(`  ${relative(ROOT, file)} (${count})`);
  }
}

console.log(`\nReplaced ${hits} occurrences across ${changed} file(s).`);
