#!/usr/bin/env node
/**
 * Validate one or more Aktion programs against the current component library.
 *
 * Usage:
 *   node tools/validate-aktion.mjs path/to/block.aktion [more.aktion ...]
 *   node tools/validate-aktion.mjs src/store.aktion.ts src/format.aktion.js
 *   cat block.aktion | node tools/validate-aktion.mjs -
 *
 * `.aktion.js` / `.aktion.ts` files are compiled first, by the frontend the Vite
 * plugin uses: the JavaScript-semantics rules (E1xx / W2xx) and TypeScript
 * erasure errors are reported alongside the schema and lint findings, at the
 * file's own lines. Imports are not followed — use `validate-aktion-app.mjs`
 * for a whole graph.
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

const {
  getDiagnostics,
  getLintWarnings,
  validateProgramSchema,
  defaultLibrary,
  defaultFrontends,
  moduleLanguage,
} = await import(pathToFileURL(bundle).href);

/** The frontend for a JavaScript-shaped file — `.aktion.ts` needs the Node plugin entry. */
async function frontendFor(file) {
  const language = file === "-" ? "aktion" : moduleLanguage(file);
  if (language === "javascript") return defaultFrontends.javascript;
  if (language !== "typescript") return null;
  const pluginBundle = resolve(here, "../dist/plugin.js");
  if (!existsSync(pluginBundle)) {
    console.error("dist/plugin.js not found. Run `npm run build:plugin` (or `npm run build`) first.");
    process.exit(2);
  }
  const { tryLoadTypeScriptFrontend } = await import(pathToFileURL(pluginBundle).href);
  return tryLoadTypeScriptFrontend();
}

/** Parse errors, frontend rules, schema errors and lint warnings for a JS/TS module. */
function diagnoseCompiled(frontend, source, file) {
  const out = frontend.compile(source, resolve(file));
  return [
    ...out.program.errors.map((e) => ({ ...e, severity: "error" })),
    ...out.diagnostics.map((d) => ({ ...d, message: d.code ? `${d.code} ${d.message}` : d.message })),
    ...validateProgramSchema(out.program, defaultLibrary).map((e) => ({ ...e, severity: "error" })),
    ...getLintWarnings(out.aktionSource, defaultLibrary).map((w) => ({ ...w, severity: "warning" })),
  ].sort((a, b) => a.line - b.line || a.column - b.column);
}

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
    const frontend = await frontendFor(file);
    // `getDiagnostics` folds parse errors, schema violations, and lint warnings
    // into one ordered list. Note that `parse()` does NOT throw on a bad
    // statement — it records the error, drops the statement, and recovers on the
    // next line — so a validator that only looked at schema errors would report
    // OK for a file whose imports had silently vanished.
    diagnostics = frontend ? diagnoseCompiled(frontend, source, file) : getDiagnostics(source, defaultLibrary);
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
