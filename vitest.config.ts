import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    environmentOptions: {
      happyDOM: {
        settings: {
          disableCSSFileLoading: true,
          disableCrossOriginPolicy: true,
          fetch: { disableSameOriginPolicy: true },
        },
      },
    },
  },
});
