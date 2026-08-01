#!/usr/bin/env node
/**
 * Bundle the extension to `dist/extension.js` (CJS, Node target). `vscode` is
 * provided by the host (external).
 *
 * `aktion-runtime/language` resolves three ways, in order:
 *   1. the repo's built DOM-free entry `../../dist/language.js` (normal case);
 *   2. its TypeScript source `../../src/language-api.ts`, so the extension is
 *      buildable inside this repo before `npm run build` has run at the root;
 *   3. nothing — the alias is then LEFT OFF entirely and esbuild resolves the
 *      specifier from `node_modules` (the published `aktion-runtime` package).
 *      This is the standalone-checkout case, and it only works because the alias
 *      is conditional: an unconditional alias would rewrite the import to a
 *      nonexistent sibling path and fail with "Could not resolve".
 *
 * The bundle INLINES the language surface, so the extension always serves the
 * version it was built against — see docs/README.md on version lockstep.
 */

import { build, context } from "esbuild";
import { dirname, resolve } from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const built = resolve(repoRoot, "dist/language.js");
const source = resolve(repoRoot, "src/language-api.ts");
const outDir = resolve(here, "dist");

const local = existsSync(built) ? built : existsSync(source) ? source : null;
if (!local) {
  // eslint-disable-next-line no-console
  console.log(
    "esbuild: no local runtime build — resolving aktion-runtime/language from node_modules",
  );
}

const options = {
  entryPoints: [resolve(here, "src/extension.ts")],
  outfile: resolve(outDir, "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  external: ["vscode"],
  ...(local ? { alias: { "aktion-runtime/language": local } } : {}),
  logLevel: "info",
};

copyPromptAssets();

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  // eslint-disable-next-line no-console
  console.log("esbuild watching…");
} else {
  await build(options);
}

/**
 * Copy the generated system prompts into `dist/` so `aktion.copySystemPrompt`
 * can serve them from the packaged extension. They are *generated* files
 * (`scripts/emit-prompt.mjs` at the repo root writes them from the component
 * library), so they are copied — never vendored into git — and the command
 * degrades to a clear message when the root build has not produced them.
 */
function copyPromptAssets() {
  mkdirSync(outDir, { recursive: true });
  for (const name of ["system_prompt.txt", "system_prompt_chat.txt"]) {
    const from = resolve(repoRoot, "dist", name);
    if (!existsSync(from)) {
      // eslint-disable-next-line no-console
      console.log(`esbuild: ${name} not built at the repo root — skipping (command will say so)`);
      continue;
    }
    copyFileSync(from, resolve(outDir, name));
  }
}
