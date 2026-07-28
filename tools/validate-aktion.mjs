#!/usr/bin/env node
/**
 * Validate one or more Aktion programs against the current component library.
 *
 * Usage:
 *   node tools/validate-aktion.mjs path/to/block.aktion [more.aktion ...]
 *   cat block.aktion | node tools/validate-aktion.mjs -
 *
 * Exits non-zero and prints "FILE: Lnn: message" for every schema error, so it
 * can gate authored blocks the same way tests/aktion-programs-validate.test.ts
 * gates the committed examples.
 */
import { readFileSync } from "node:fs";
import { parse } from "../src/parser/index.js";
import { defaultLibrary, validateProgramSchema } from "../src/library/index.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node tools/validate-aktion.mjs <file.aktion> [...]  (or - for stdin)");
  process.exit(2);
}

let failed = 0;
for (const file of args) {
  const source = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  let errors;
  try {
    errors = validateProgramSchema(parse(source), defaultLibrary);
  } catch (e) {
    console.log(`${file}: PARSE ERROR: ${e && e.message ? e.message : String(e)}`);
    failed += 1;
    continue;
  }
  if (errors.length === 0) {
    console.log(`${file}: OK`);
  } else {
    failed += 1;
    for (const e of errors) console.log(`${file}: L${e.line}: ${e.message}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
