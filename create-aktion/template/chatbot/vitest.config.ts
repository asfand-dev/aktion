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
    },
  }),
);
