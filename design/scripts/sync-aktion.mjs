#!/usr/bin/env node
/**
 * Deep-integration helper: copy a locally-built Aktion `dist/` over the
 * installed `node_modules/aktion-runtime/dist`, so changes made to the Aktion
 * runtime/library (new components, new features) are picked up by the design
 * app immediately — the palette, inspector, and renderer are all driven by
 * `componentSchema()` at runtime, so nothing else needs to change.
 *
 * Usage:  npm run sync:aktion [-- /path/to/aktion]
 * Default source: the parent directory (when this app lives inside the
 * aktion repo) — falls back with a clear message when it doesn't.
 */
import { cpSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const source = resolve(process.argv[2] ?? resolve(appRoot, ".."));
const sourceDist = resolve(source, "dist");
const target = resolve(appRoot, "node_modules", "aktion-runtime", "dist");

if (!existsSync(sourceDist)) {
  console.error(`No Aktion dist found at ${sourceDist}.`);
  console.error("Pass the aktion repo path: npm run sync:aktion -- /path/to/aktion");
  process.exit(1);
}
if (!existsSync(target)) {
  console.error(`aktion-runtime is not installed at ${target}. Run npm install first.`);
  process.exit(1);
}

cpSync(sourceDist, target, { recursive: true });
console.log(`Synced ${sourceDist} -> ${target}`);
console.log("Restart the dev server to pick up the new runtime.");
