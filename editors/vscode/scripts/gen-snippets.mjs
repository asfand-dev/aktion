#!/usr/bin/env node
/**
 * Generate `snippets/aktion.code-snippets` from the library's snippet catalog
 * (`getSnippets()` already emits VS Code `${1:label}` placeholder syntax), so
 * the extension's snippets stay in lockstep with the runtime — never hand-listed.
 *
 * The language surface is resolved by `scripts/load-surface.mjs` (built
 * `dist/language.js`, else the TypeScript source via esbuild).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurface } from "./load-surface.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// A `dist/language.js` predating the snippet catalog lacks the export — treat it
// as unusable so the loader falls back to the source instead of crashing.
const surface = await loadSurface((mod) => typeof mod.getSnippets === "function");

const out = {};
for (const snippet of surface.getSnippets()) {
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
