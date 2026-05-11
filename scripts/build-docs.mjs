#!/usr/bin/env node
/**
 * Assemble a static `site/` folder from `docs/` + `dist/` so the docs can be
 * deployed straight to any static host (GitHub Pages, Cloudflare, S3, etc.).
 *
 * Layout produced:
 *   site/
 *   ├── .nojekyll                       (disable Jekyll on GitHub Pages)
 *   ├── index.html, get-started.html…   (docs HTML)
 *   ├── assets/site.js, site.css…       (docs assets)
 *   └── dist/                           (CDN-shippable bundle)
 *       ├── streaming-ui-script.js
 *       ├── streaming-ui-script.iife.js
 *       ├── streaming-ui-script.umd.cjs
 *       └── system_prompt.txt
 *
 * The docs HTML / JS sources use `../dist/…` paths so local development from
 * the project root works. For the deployed site the docs and the bundle live
 * side-by-side, so this script rewrites those paths to `./dist/…` (HTML) and
 * `../dist/…` (assets/site.js) as a final pass.
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
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

  await rewriteDeployPaths(outDir);
  await writeFile(resolve(outDir, ".nojekyll"), "", "utf8");

  // eslint-disable-next-line no-console
  console.log(`Site assembled in ${outDir}`);
}

/**
 * Rewrite dev-mode relative paths into deploy-mode relative paths.
 *  - HTML files (at site/*.html) reach the bundle via `./dist/…`.
 *  - site/assets/site.js (one level deeper) reaches it via `../dist/…`.
 */
async function rewriteDeployPaths(siteDir) {
  for await (const path of walk(siteDir)) {
    const ext = extname(path).toLowerCase();
    if (ext !== ".html" && ext !== ".js") continue;
    const original = await readFile(path, "utf8");
    let updated = original;

    if (ext === ".html") {
      updated = updated
        .replaceAll("../dist/streaming-ui-script", "./dist/streaming-ui-script")
        .replaceAll("../dist/system_prompt", "./dist/system_prompt");
    } else {
      updated = updated.replaceAll(
        "../../dist/streaming-ui-script",
        "../dist/streaming-ui-script",
      );
    }

    if (updated !== original) {
      await writeFile(path, updated, "utf8");
    }
  }
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
