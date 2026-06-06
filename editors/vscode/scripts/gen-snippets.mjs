#!/usr/bin/env node
/**
 * Generate `snippets/aktion.code-snippets` from the library's snippet catalog
 * (`getSnippets()` already emits VS Code `${1:label}` placeholder syntax), so
 * the extension's snippets stay in lockstep with the runtime — never hand-listed.
 *
 * Resolves the language surface from the repo's built `dist/language.js`, or
 * falls back to the TypeScript source via a tiny esbuild transform if that
 * build hasn't run yet.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

async function loadGetSnippets() {
  const built = resolve(repoRoot, "dist/language.js");
  if (existsSync(built)) {
    return (await import(pathToFileURL(built).href)).getSnippets;
  }
  // Fallback: bundle the source on the fly so `npm run build` works before the
  // root `npm run build`.
  const { build } = await import("esbuild");
  const out = resolve(here, ".gen-snippets.tmp.mjs");
  await build({
    entryPoints: [resolve(repoRoot, "src/language-api.ts")],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
  const mod = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  return mod.getSnippets;
}

const getSnippets = await loadGetSnippets();

const out = {};
for (const snippet of getSnippets()) {
  out[snippet.name] = {
    prefix: snippet.name,
    body: snippet.template.split("\n"),
    description: snippet.description,
  };
}

const snippetsDir = resolve(here, "../snippets");
mkdirSync(snippetsDir, { recursive: true });
const target = resolve(snippetsDir, "aktion.code-snippets");
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`, "utf8");

// eslint-disable-next-line no-console
console.log(`Wrote ${Object.keys(out).length} snippets to ${target}`);
