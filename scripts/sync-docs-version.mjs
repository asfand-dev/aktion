#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const packageJsonPath = resolve(root, "package.json");
const docsTargets = [
  {
    path: resolve(root, "docs/index.html"),
    replacements: [
      { pattern: /(<span class="v">)v\d+\.\d+\.\d+(<\/span>)/, replacement: "$1__V_TAG__$2" },
      { pattern: /(<span class="tag">)v\d+\.\d+\.\d+(<\/span>)/, replacement: "$1__V_TAG__$2" },
    ],
  },
  {
    path: resolve(root, "docs/assets/playground.js"),
    replacements: [
      { pattern: /(runtime:\s*\{\s*version:\s*")\d+\.\d+\.\d+(")/, replacement: "$1__VERSION__$2" },
    ],
  },
  {
    path: resolve(root, "docs/deployment.html"),
    replacements: [
      // ONE global three-component pattern, not two overlapping non-global ones.
      // The pair this replaces appended a segment on every single build: the
      // narrow pattern rewrote the first `aktion@x.y.z`, then the two-component
      // pattern matched the `x.y` PREFIX of what had just been written and
      // replaced it with the full version again — `0.6.4` → `0.6.4.4` → `0.6.4.4.4`.
      // Being non-global, it also never reached the file's second occurrence, so
      // one URL rotted while the other went stale. `/g` fixes both halves, and a
      // three-component-only pattern cannot match its own output.
      { pattern: /(aktion@)\d+\.\d+\.\d+/g, replacement: "$1__VERSION__" },
      { pattern: /(Pin a version \(\s*<code>@)\d+\.\d+\.\d+(<\/code>\))/, replacement: "$1__VERSION__$2" },
    ],
  },
  {
    path: resolve(root, "docs/demos/mini-apps/aktion-website.aktion"),
    replacements: [
      { pattern: /(version:\s*")v\d+\.\d+\.\d+(")/, replacement: "$1__V_TAG__$2" },
      { pattern: /(Badge\(")v\d+\.\d+\.\d+(")/, replacement: "$1__V_TAG__$2" },
    ],
  },
  {
    path: resolve(root, "docs/demos/mini-apps/json-formatter.aktion"),
    replacements: [
      { pattern: /("version":\s*")\d+\.\d+\.\d+(")/, replacement: "$1__VERSION__$2" },
    ],
  },
  {
    path: resolve(root, "docs/demos/components/data-display.aktion"),
    replacements: [
      { pattern: /(version:\s*")\d+\.\d+\.\d+(")/, replacement: "$1__VERSION__$2" },
    ],
  },
  {
    path: resolve(root, "docs/assets/component-catalog.js"),
    replacements: [
      { pattern: /(version:\s*")\d+\.\d+\.\d+(")/, replacement: "$1__VERSION__$2" },
    ],
  },
  {
    path: resolve(root, "docs/assets/site.js"),
    replacements: [
      { pattern: /(topbar-version"\s*\},\s*")v\d+\.\d+(?:\.\d+)?(")/, replacement: "$1__V_TAG__$2" },
    ],
  },
];

function replaceOne(source, pattern, replacement, filePath) {
  // `test` advances `lastIndex` on a /g pattern, so reset BEFORE the replace as
  // well as relying on the reset after — a global pattern that matched at the end
  // of the file would otherwise start its replace pass from there and silently
  // rewrite nothing.
  pattern.lastIndex = 0;
  if (!pattern.test(source)) {
    throw new Error(`Expected pattern not found in ${filePath}: ${pattern}`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

async function main() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = packageJson.version;
  const versionTag = `v${version}`;

  for (const target of docsTargets) {
    const original = await readFile(target.path, "utf8");
    let updated = original;

    for (const entry of target.replacements) {
      updated = replaceOne(updated, entry.pattern, entry.replacement, target.path);
    }

    updated = updated.replaceAll("__VERSION__", version).replaceAll("__V_TAG__", versionTag);

    if (updated !== original) {
      await writeFile(target.path, updated, "utf8");
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Synced docs version markers to ${version}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
