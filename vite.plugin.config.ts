import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the `aktion-runtime/vite` entry (`dist/plugin.{js,cjs}`) — the
 * Vite/Rollup plugin for `.aktion` files. It's the ONLY Node-target output:
 * `vite`/`rollup`/`node:*` are externalized, and it bundles the browser-safe
 * linker (`src/compiler`) it builds on. It NEVER enters the browser bundle.
 *
 * Run standalone with `npm run build:plugin`; the main `npm run build` chains
 * it in. Types come from the main build's `dist/types/plugin/index.d.ts`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/plugin/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "plugin.js" : "plugin.cjs"),
    },
    outDir: "dist",
    emptyOutDir: false, // keep the primary + testing + devtools + language bundles
    sourcemap: true,
    target: "node18",
    minify: false,
    rollupOptions: {
      external: ["vite", "rollup", /^node:/, /^aktion-runtime/],
      // The entry exports both `aktionPlugin` and `default`; make it explicit
      // (ESM `import aktion from` / CJS `require(...).default`).
      output: { exports: "named" },
    },
  },
});
