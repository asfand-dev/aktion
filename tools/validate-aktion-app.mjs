#!/usr/bin/env node
/**
 * Validate a MULTI-MODULE Aktion app: link the import graph from an entry file,
 * then schema-check the merged program against the component library.
 *
 * `tools/validate-aktion.mjs` handles single, self-contained programs. An app
 * split across `import`ed modules needs the linker first, otherwise every
 * imported name reads as an unknown identifier.
 *
 * Usage:
 *   node tools/validate-aktion-app.mjs path/to/app.aktion
 *
 * Prints `Lnn: message` for each link or schema problem. Exits non-zero on any
 * error; warnings are reported but do not fail the run.
 *
 * Reads the built DOM-free surface (`dist/language.js`) — run
 * `npm run build:language` (or `npm run build`) first if it is missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolvePath(here, "../dist/language.js");

if (!existsSync(bundle)) {
  console.error(
    "dist/language.js not found. Run `npm run build:language` (or `npm run build`) first.",
  );
  process.exit(2);
}

const { linkProgram, validateProgramSchema, defaultLibrary, getLintWarnings } = await import(
  pathToFileURL(bundle).href
);

const entry = process.argv[2];
if (!entry) {
  console.error("usage: node tools/validate-aktion-app.mjs <entry.aktion>");
  process.exit(2);
}
const entryPath = resolvePath(entry);

const resolver = {
  resolve(spec, importerPath) {
    // Only relative specifiers are meaningful for an app's own modules.
    if (!spec.startsWith(".")) return null;
    const candidate = resolvePath(dirname(importerPath), spec);
    if (existsSync(candidate)) return candidate;
    // Allow the extension to be omitted.
    for (const ext of [".aktion", "/index.aktion"]) {
      if (existsSync(candidate + ext)) return candidate + ext;
    }
    return null;
  },
  load(path) {
    return readFileSync(path, "utf8");
  },
};

let result;
try {
  result = linkProgram(entryPath, resolver);
} catch (e) {
  console.log(`LINK ERROR: ${e && e.message ? e.message : String(e)}`);
  process.exit(1);
}

let errorCount = 0;
let warningCount = 0;

for (const d of result.diagnostics ?? []) {
  errorCount += 1;
  console.log(`L${d.line ?? 0}: error: ${d.message}`);
}
for (const e of result.program?.errors ?? []) {
  errorCount += 1;
  console.log(`L${e.line}: error: ${e.message}`);
}

if (result.program) {
  for (const e of validateProgramSchema(result.program, defaultLibrary)) {
    errorCount += 1;
    console.log(`L${e.line}: error: ${e.message}`);
  }
  // The lint pass takes source, not a Program, so run it on the LINKED source —
  // that is the text whose component calls and bindings actually resolve.
  if (result.source) {
    for (const w of getLintWarnings(result.source, defaultLibrary)) {
      warningCount += 1;
      console.log(`L${w.line}: warning: ${w.message}`);
    }
  }
}

if (errorCount === 0 && warningCount === 0) {
  console.log(`${entry}: OK`);
} else {
  console.log(`\n${errorCount} error(s), ${warningCount} warning(s)`);
}
process.exit(errorCount > 0 ? 1 : 0);
