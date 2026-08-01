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
 *       ├── aktion.js
 *       ├── aktion.iife.js
 *       ├── aktion.umd.cjs
 *       └── system_prompt.txt
 *
 * The docs HTML / JS sources use `../dist/…` paths so local development from
 * the project root works. For the deployed site the docs and the bundle live
 * side-by-side, so this script rewrites those paths to `./dist/…` (HTML) and
 * `../dist/…` (assets/site.js) as a final pass.
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const docsDir = resolve(root, "docs");
const distDir = resolve(root, "dist");
const outDir = resolve(root, "site");

async function main() {
  await writeDemosManifest();

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
 * Scan `docs/demos/<folder>/*.aktion` and regenerate `docs/demos/manifest.json`.
 * Static hosts cannot list directories, so `demos/index.html` and
 * `live-demos.html` read this manifest instead. `mini-apps` is always listed
 * first; remaining folders follow alphabetically.
 */
async function writeDemosManifest() {
  const demosDir = resolve(docsDir, "demos");
  const entries = await readdir(demosDir, { withFileTypes: true });
  const folders = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => (a === "mini-apps" ? -1 : b === "mini-apps" ? 1 : a.localeCompare(b)));

  const manifest = {};
  for (const folder of folders) {
    const files = await readdir(resolve(demosDir, folder));
    manifest[folder] = files.filter((f) => f.endsWith(".aktion")).sort();
  }
  await writeFile(resolve(demosDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Rewrite dev-mode relative paths into deploy-mode relative paths.
 *
 * In the repo, `docs/` and `dist/` are siblings, so a page at `docs/x.html`
 * reaches a bundle via `../dist/…` and a module at `docs/assets/x.js` via
 * `../../dist/…`. In the deployed site the bundle is nested INSIDE the docs
 * (`site/dist/…`), so both need one fewer `..`.
 *
 * The `dist/` PREFIX is rewritten wholesale rather than one bundle name at a
 * time. The previous version enumerated `aktion`, `devtools` and `system_prompt`,
 * which meant that adding an import of any other bundle — `dist/language.js`,
 * `dist/testing.js` — silently shipped a path that 404s only on the deployed
 * site and works fine locally. That is the worst possible failure shape.
 */
async function rewriteDeployPaths(siteDir) {
  const bundleDir = resolve(siteDir, "dist");

  for await (const path of walk(siteDir)) {
    // Never rewrite inside the copied bundle itself: those are build artefacts
    // that must ship byte-for-byte, and a bundled string that happens to look
    // like a relative path is not ours to touch.
    if (path.startsWith(`${bundleDir}${sep}`)) continue;

    const ext = extname(path).toLowerCase();
    if (ext !== ".html" && ext !== ".js") continue;

    // How many directories deep is this file? `site/x.html` -> 0 -> `./dist/`;
    // `site/assets/x.js` -> 1 -> `../dist/`. Deriving the prefix means a file
    // added at any depth gets the right one with no new rule.
    const depth = relative(siteDir, dirname(path)).split(sep).filter(Boolean).length;
    const prefix = depth === 0 ? "./dist/" : `${"../".repeat(depth)}dist/`;

    const original = await readFile(path, "utf8");
    // Match any number of leading `../` segments before `dist/` and normalise
    // them all to the correct prefix for this file's depth.
    const updated = original.replaceAll(/(?:\.\.\/)+dist\//g, prefix);

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
