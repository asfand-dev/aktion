#!/usr/bin/env node
/**
 * Write `name.d.aktion.ts` type declarations for `.aktion` modules, so
 * `.aktion.ts` code that imports from them type-checks (see
 * `emitAktionDeclarations` in `aktion-runtime/vite`). Run it before
 * `tsc --noEmit` in CI:
 *
 *   aktion-dts                         # src/**\/*.aktion → .aktion-types/
 *   aktion-dts --out-dir . --include "app/**\/*.aktion"
 *   aktion-dts --check                 # exit 1 if any declaration is stale
 *
 * Options: `--root <dir>` (default: the current directory), `--out-dir <dir>`,
 * `--include <glob>` and `--exclude <glob>` (repeatable), `--check`, `--quiet`.
 */
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { emitAktionDeclarations } = await import(pathToFileURL(join(here, "../dist/plugin.js")).href);

const usage =
  "usage: aktion-dts [--root <dir>] [--out-dir <dir>] [--include <glob>]… [--exclude <glob>]… [--check] [--quiet]";
const options = { include: [], exclude: [] };
let check = false;
let quiet = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  const value = () => {
    const v = argv[++i];
    if (v === undefined) {
      console.error(`${arg} needs a value\n${usage}`);
      process.exit(2);
    }
    return v;
  };
  if (arg === "--root") options.root = value();
  else if (arg === "--out-dir") options.outDir = value();
  else if (arg === "--include") options.include.push(value());
  else if (arg === "--exclude") options.exclude.push(value());
  else if (arg === "--check") check = true;
  else if (arg === "--quiet") quiet = true;
  else if (arg === "--help" || arg === "-h") {
    console.log(usage);
    process.exit(0);
  } else {
    console.error(`unknown argument "${arg}"\n${usage}`);
    process.exit(2);
  }
}
if (options.include.length === 0) delete options.include;

const result = emitAktionDeclarations({ ...options, write: !check });
const root = options.root ?? process.cwd();
const show = (p) => relative(root, p) || p;

for (const d of result.diagnostics) console.error(`${show(d.path)}:${d.line}:${d.column} ${d.message}`);
if (check) {
  const stale = [...result.written, ...result.removed];
  if (stale.length > 0) {
    console.error(`${stale.length} stale declaration(s) — run aktion-dts:\n  ${stale.map(show).join("\n  ")}`);
    process.exit(1);
  }
  if (!quiet) console.log(`${result.unchanged.length} declaration(s) up to date`);
  process.exit(0);
}
if (!quiet) {
  for (const p of result.written) console.log(`wrote ${show(p)}`);
  for (const p of result.removed) console.log(`removed ${show(p)}`);
  console.log(`${result.written.length} written, ${result.unchanged.length} unchanged, ${result.removed.length} removed`);
}
