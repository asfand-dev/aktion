import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the `aktion/devtools` entry (`dist/devtools.js`) — the in-page
 * DevTools panel (state inspector, render profiler, effect timeline).
 *
 * Like the testing entry it is a SELF-CONTAINED ESM bundle so a consumer can
 * `import { mountDevtools } from "aktion/devtools"` without also importing the
 * main bundle. It talks to the runtime purely through the global hook
 * (`__AKTION_DEVTOOLS_HOOK__`), so loading it alongside `aktion` is safe and
 * the runtime stays decoupled from the panel UI.
 *
 * Run standalone with `npm run build:devtools`; the main `npm run build`
 * chains it in after the primary + testing bundles. Types come from the main
 * build's `dist/types`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/devtools/index.ts"),
      formats: ["es"],
      fileName: () => "devtools.js",
    },
    outDir: "dist",
    emptyOutDir: false, // keep the primary + testing bundles
    sourcemap: true,
    target: "es2020",
    minify: false,
  },
});
