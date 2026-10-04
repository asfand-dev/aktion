/// <reference types="vitest" />
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Reuse the Vite config so the aktion() plugin compiles `.aktion` imports under
// tests too, then run them in a happy-dom DOM (custom elements + shadow DOM).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      include: ["tests/**/*.test.ts"],
      // V8 would attribute the plugin's generated module to each `.aktion.ts` /
      // `.aktion.js` file; Aktion's own coverage (`aktion-runtime/coverage`)
      // reports those modules on their real lines instead.
      coverage: { exclude: ["**/*.aktion.{ts,js}"] },
    },
  }),
);
