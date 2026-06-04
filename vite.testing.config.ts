import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the `aktion/test` entry (`dist/testing.js`) — the Aktion Testing
 * Library. It is intentionally a SELF-CONTAINED ESM bundle: it pulls in
 * whatever runtime it needs (`defineElement` + the element) so a consumer can
 * `import { render } from "aktion/test"` in a test runner without also
 * importing the main bundle. The `<aktion-app>` registration is idempotent
 * (guards on `customElements.get`), so loading both `aktion` and `aktion/test`
 * in the same process is safe. ESM-only — tests run in module environments.
 *
 * Run standalone with `npm run build:test`; the main `npm run build` chains it
 * in after the primary bundle. Types come from the main build's `dist/types`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/testing/index.ts"),
      formats: ["es"],
      fileName: () => "testing.js",
    },
    outDir: "dist",
    emptyOutDir: false, // keep the primary bundle (aktion.js, css, prompts)
    sourcemap: true,
    target: "es2020",
    minify: false,
  },
});
