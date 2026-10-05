/**
 * `dist/plugin.js` for tests that run the `aktion-dts` bin, which imports it.
 *
 * `.github/workflows/test.yml` runs `npm ci && npm test` with no build step, so
 * the bundle is built on demand (as `tests/aktion-dts.test.ts` and
 * `tests/validate-tools.test.ts` do) — into a scratch dir inside `dist/`, then
 * MOVED in, `.js` last: sibling workers probe `dist/plugin.js` with
 * `existsSync` before importing it, and rollup writes it in place.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function ensurePluginDist(): void {
  const dist = join(repoRoot, "dist");
  if (existsSync(join(dist, "plugin.js"))) return;
  mkdirSync(dist, { recursive: true });
  const stage = mkdtempSync(join(dist, "test-build-"));
  try {
    execFileSync(
      process.execPath,
      [join(repoRoot, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.plugin.config.ts", "--outDir", stage],
      { cwd: repoRoot, stdio: "pipe" },
    );
    const produced = readdirSync(stage);
    const isModule = (f: string): boolean => f.endsWith(".js") || f.endsWith(".cjs");
    for (const name of [...produced.filter((f) => !isModule(f)), ...produced.filter(isModule)]) {
      renameSync(join(stage, name), join(dist, name));
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
