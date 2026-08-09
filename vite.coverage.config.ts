import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the `aktion-runtime/coverage` entry (`dist/coverage.js`) — the DSL
 * coverage recorder and its reporters.
 *
 * A separate entry because of WHERE this code runs. `aktion-runtime/test`
 * bundles the `<aktion-app>` element and therefore needs a DOM; a coverage
 * reporter runs in the plain-Node half of a test run — a `globalSetup`/teardown,
 * a CI script, a merge step — where importing the element throws
 * `HTMLElement is not defined`. This entry has no DOM dependency at all: it is
 * the recorder plus pure data transforms (merge, lcov, summary).
 *
 * The recorder's session state lives on `globalThis`, so the copy reached through
 * this entry, through `aktion-runtime/test`, and inside the runtime bundle are all
 * the same session.
 *
 * Run standalone with `npm run build:coverage`; `npm run build` chains it in.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/runtime/coverage.ts"),
      formats: ["es"],
      fileName: () => "coverage.js",
    },
    outDir: "dist",
    emptyOutDir: false, // keep the primary bundle
    sourcemap: true,
    target: "es2020",
    minify: false,
  },
});
