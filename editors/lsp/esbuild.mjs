#!/usr/bin/env node
/**
 * Bundle the language server to `dist/server.mjs` — one self-contained ESM file
 * with no runtime dependencies, so a JetBrains plugin (or any editor config) can
 * ship it as a single asset and run it with `node dist/server.mjs`.
 *
 * For local development inside this repo we alias `aktion-runtime/language` to
 * the built DOM-free entry (or the TS source if it hasn't been built yet), so
 * the server is buildable without publishing/linking the package; a standalone
 * checkout resolves it from `node_modules`. This mirrors
 * `editors/vscode/esbuild.mjs` deliberately — one pattern, two hosts.
 */

import { build, context } from "esbuild";
import { chmod, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const built = resolve(repoRoot, "dist/language.js");
const source = resolve(repoRoot, "src/language-api.ts");

const pkg = JSON.parse(await readFile(resolve(here, "package.json"), "utf8"));
const outfile = resolve(here, "dist/server.mjs");

const options = {
  entryPoints: [resolve(here, "src/server.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  sourcemap: true,
  // `--version` / `serverInfo.version` report the package version without
  // needing to read package.json at runtime (it isn't shipped next to the
  // bundle when a JetBrains plugin embeds just `server.mjs`).
  define: { __SERVER_VERSION__: JSON.stringify(pkg.version) },
  banner: { js: "#!/usr/bin/env node" },
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
  // The `bin` entry is executed directly by some clients; make it runnable.
  await chmod(outfile, 0o755);
  // eslint-disable-next-line no-console
  console.log(`Bundled aktion-language-server ${pkg.version} → ${outfile}`);
}
