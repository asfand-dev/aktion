#!/usr/bin/env node
/**
 * Validate one or more Aktion programs against the current component library.
 *
 * Usage:
 *   node tools/validate-aktion.mjs path/to/block.aktion [more.aktion ...]
 *   cat block.aktion | node tools/validate-aktion.mjs -
 *
 * Prints `FILE: Lnn: message` for every problem and exits non-zero if any
 * ERROR was found, so it can gate authored blocks the same way
 * tests/aktion-programs-validate.test.ts gates the committed examples.
 * Warnings are reported but do not fail the run — an unknown component renders
 * as nothing rather than breaking the program, so it should not block a commit.
 *
 * Reads the built DOM-free surface (`dist/language.js`), which bundles the
 * parser, the schema validator, AND the lint pass in a single `getDiagnostics`
 * call. Run `npm run build:language` first if it is missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolve(here, "../dist/language.js");

if (!existsSync(bundle)) {
  console.error(
    "dist/language.js not found. Run `npm run build:language` (or `npm run build`) first.",
  );
  process.exit(2);
}

const { getDiagnostics, defaultLibrary } = await import(pathToFileURL(bundle).href);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node tools/validate-aktion.mjs <file.aktion> [...]  (or - for stdin)");
  process.exit(2);
}

let errorCount = 0;
let warningCount = 0;

for (const file of args) {
  let diagnostics;
  try {
    const source = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
    // `getDiagnostics` folds parse errors, schema violations, and lint warnings
    // into one ordered list. Note that `parse()` does NOT throw on a bad
    // statement — it records the error, drops the statement, and recovers on the
    // next line — so a validator that only looked at schema errors would report
    // OK for a file whose imports had silently vanished.
    diagnostics = getDiagnostics(source, defaultLibrary);
  } catch (e) {
    console.log(`${file}: READ/PARSE ERROR: ${e && e.message ? e.message : String(e)}`);
    errorCount += 1;
    continue;
  }

  if (diagnostics.length === 0) {
    console.log(`${file}: OK`);
    continue;
  }

  for (const d of diagnostics) {
    const label = d.severity === "warning" ? "warning" : "error";
    if (d.severity === "warning") warningCount += 1;
    else errorCount += 1;
    console.log(`${file}: L${d.line}: ${label}: ${d.message}`);
  }
}

if (errorCount > 0 || warningCount > 0) {
  console.log(`\n${errorCount} error(s), ${warningCount} warning(s)`);
}
process.exit(errorCount > 0 ? 1 : 0);
