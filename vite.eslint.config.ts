import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the `aktion-runtime/eslint` entry (`dist/eslint.{js,cjs}`) — the
 * ESLint processor that lets a consumer's own ESLint installation lint (and
 * `--fix`) `.aktion` DSL files. Like the `./vite` entry (`vite.plugin.config.ts`),
 * this is a NODE-target output: it runs inside a plain `eslint.config.js`
 * under plain Node, never in the browser bundle, so `eslint` and Node
 * built-ins are externalized rather than bundled in.
 *
 * Run standalone with `npm run build:eslint`; the main `npm run build` chains
 * it in. Types come from the main build's `dist/types/eslint-api.d.ts`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/eslint-api.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "eslint.js" : "eslint.cjs"),
    },
    outDir: "dist",
    emptyOutDir: false, // keep the primary + testing + devtools + language + plugin bundles
    sourcemap: true,
    target: "node18",
    minify: false,
    rollupOptions: {
      external: ["eslint", /^node:/, /^aktion-runtime/],
      // The entry exports both named bindings and `default`; make it
      // explicit (ESM `import aktionEslint from` / CJS
      // `require(...).default`).
      output: { exports: "named" },
    },
  },
});
