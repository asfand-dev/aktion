import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dev server for Aktion Quest.
 *
 *   npx vite --config game/serve.config.mjs
 *   -> http://localhost:5180/game/game.html
 *
 * The root is the REPO root, not `game/`, on purpose: stages with a live
 * preview import the real runtime from `../dist/aktion.js`, which only resolves
 * when `dist/` is served alongside `game/`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

export default defineConfig({
  root: repo,
  server: {
    port: 5180,
    strictPort: true,
    open: false,
    fs: { allow: [repo] },
  },
});
