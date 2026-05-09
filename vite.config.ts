import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "LlmResponseUiLang",
      formats: ["es", "umd", "iife"],
      fileName: (format) => {
        if (format === "es") return "llm-response-ui-lang.js";
        if (format === "iife") return "llm-response-ui-lang.iife.js";
        return "llm-response-ui-lang.umd.cjs";
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    target: "es2020",
    minify: "esbuild",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (asset) => {
          if (asset.name?.endsWith(".css")) return "llm-response-ui-lang.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  server: {
    port: 5173,
    open: "/docs/index.html",
    fs: { allow: [".."] },
  },
});
