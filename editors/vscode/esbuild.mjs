#!/usr/bin/env node
/**
 * Bundle the extension to `dist/extension.js` (CJS, Node target). `vscode` is
 * provided by the host (external). For local development inside this repo we
 * alias `aktion-runtime/language` to the built DOM-free entry (or the TS source
 * if it hasn't been built yet), so the extension is buildable without
 * publishing/linking the package; a standalone checkout resolves it from
 * `node_modules`.
 */

import { build, context } from "esbuild";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const built = resolve(repoRoot, "dist/language.js");
const source = resolve(repoRoot, "src/language-api.ts");

const options = {
  entryPoints: [resolve(here, "src/extension.ts")],
  outfile: resolve(here, "dist/extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  external: ["vscode"],
  alias: { "aktion-runtime/language": existsSync(built) ? built : source },
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  // eslint-disable-next-line no-console
  console.log("esbuild watching…");
} else {
  await build(options);
}
