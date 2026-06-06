import { defineConfig } from "vite";
import aktion from "aktion-runtime/vite";

// The aktion() plugin compiles `.aktion` files (resolving cross-file
// import/export graphs) at build time and wires up HMR. That is the entire
// integration.
export default defineConfig({
  plugins: [aktion()],
});
