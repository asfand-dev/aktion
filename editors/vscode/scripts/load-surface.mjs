/**
 * Shared loader for the build-time generators (`gen-snippets.mjs`,
 * `gen-grammar.mjs`).
 *
 * Both generators need the DOM-free `aktion-runtime/language` surface, and both
 * used to bundle it themselves — which meant `npm run build` ran the same
 * esbuild pass twice and, worse, wrote its output to `scripts/.gen-*.tmp.mjs`
 * INSIDE the source tree. Those two 691 KB artifacts ended up committed and went
 * stale (they snapshotted a 197-component surface long after the library had
 * grown), so the fallback path shipped a lie in git history.
 *
 * The loader therefore does two things differently:
 *   - it resolves the surface ONCE per process and memoises it, so a build that
 *     needs both generators pays for at most one bundle; and
 *   - when it does have to bundle, it writes to `os.tmpdir()` and deletes the
 *     file in a `finally`, so nothing lands in the repo.
 *
 * Resolution order: the repo's built `dist/language.js` → the TypeScript source
 * via esbuild (so `npm run build` works before the root build has run).
 */

import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** @type {Promise<Record<string, unknown>> | null} */
let cached = null;

/**
 * Load the language surface.
 *
 * @param {(mod: Record<string, unknown>) => boolean} [isUsable]
 *   Optional predicate applied to the *built* bundle only. A `dist/language.js`
 *   that predates an export a generator needs is treated as absent, so a stale
 *   build degrades to bundling the source instead of crashing on `undefined`.
 * @returns {Promise<Record<string, unknown>>}
 */
export function loadSurface(isUsable) {
  if (!cached) cached = resolveSurface(isUsable);
  return cached;
}

async function resolveSurface(isUsable) {
  const built = resolve(repoRoot, "dist/language.js");
  if (existsSync(built)) {
    const mod = await import(pathToFileURL(built).href);
    if (!isUsable || isUsable(mod)) return mod;
  }
  return await bundleFromSource();
}

async function bundleFromSource() {
  const { build } = await import("esbuild");
  // A tmpdir path, never the source tree — see the header comment.
  const out = resolve(tmpdir(), `aktion-language-surface-${process.pid}.mjs`);
  try {
    await build({
      entryPoints: [resolve(repoRoot, "src/language-api.ts")],
      outfile: out,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
    });
    // Cache-bust so a second call in a long-lived process (watch mode) re-reads.
    return await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  } finally {
    // The module is already evaluated in memory; the file on disk is disposable.
    rmSync(out, { force: true });
    rmSync(`${out}.map`, { force: true });
  }
}
