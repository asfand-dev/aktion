import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the `aktion-runtime/language` entry (`dist/language.js`) — the DOM-free
 * language + tooling surface (`getDiagnostics`, `getCompletions`, `getHoverInfo`,
 * `getSnippets`, `getLanguageSpec`, `grammarSpec`, …).
 *
 * It is a SELF-CONTAINED ESM bundle so a Node host (the VS Code extension, an
 * LSP, a CLI) can import it WITHOUT pulling in the `<aktion-app>` custom element
 * (which extends `HTMLElement` and throws outside a DOM). Run standalone with
 * `npm run build:language`; the main `npm run build` chains it in. Types come
 * from the main build's `dist/types/language-api.d.ts`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/language-api.ts"),
      formats: ["es"],
      fileName: () => "language.js",
    },
    outDir: "dist",
    emptyOutDir: false, // keep the primary + testing + devtools bundles
    sourcemap: true,
    target: "es2020",
    minify: false,
  },
});
