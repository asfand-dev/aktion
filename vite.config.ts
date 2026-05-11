import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "StreamingUiScript",
      formats: ["es", "umd", "iife"],
      fileName: (format) => {
        if (format === "es") return "streaming-ui-script.js";
        if (format === "iife") return "streaming-ui-script.iife.js";
        return "streaming-ui-script.umd.cjs";
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
          if (asset.name?.endsWith(".css")) return "streaming-ui-script.css";
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
