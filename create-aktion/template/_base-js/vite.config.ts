import { defineConfig } from "vite";
import aktion from "aktion-runtime/vite";

// The aktion() plugin compiles Aktion modules — `.aktion.js`, `.aktion` and
// `.aktion.ts` — links their import graph, and enables HMR. The same plugin
// runs under Vitest.
export default defineConfig({
  plugins: [aktion()],
});
