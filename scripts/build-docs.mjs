#!/usr/bin/env node
/**
 * Assemble a static `site/` folder from `docs/` + `dist/` so the docs can be
 * deployed straight to any static host (GitHub Pages, Cloudflare, S3, etc.).
 */

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const docsDir = resolve(root, "docs");
const distDir = resolve(root, "dist");
const outDir = resolve(root, "site");

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(docsDir, outDir, { recursive: true });
  await cp(distDir, resolve(outDir, "dist"), { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`Site assembled in ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
