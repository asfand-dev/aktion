import { defineConfig } from "vite";
import aktion from "aktion-runtime/vite";

// The aktion() plugin compiles Aktion modules — `.aktion.ts` (types erased by
// `ts-blank-space`), `.aktion.js` and `.aktion` — links their import graph,
// and enables HMR. `dts: true` writes `.aktion-types/**/*.d.aktion.ts`
// declarations for any `.aktion` module, so TypeScript code can import from
// one with types. The same plugin runs under Vitest.
export default defineConfig({
  plugins: [aktion({ dts: true })],
});
