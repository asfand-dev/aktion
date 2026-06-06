import { defineConfig } from "vite";
import aktion from "aktion-runtime/vite";

// The aktion() plugin compiles `.aktion` files (resolving cross-file
// import/export graphs) at build time and enables HMR. The same plugin runs
// under Vitest, so tests can `import app from "./app.aktion"` and render its
// linked `.source`.
export default defineConfig({
  plugins: [aktion()],
});
