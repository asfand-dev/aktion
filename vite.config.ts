import { defineConfig } from "vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      outDir: "dist/types",
      include: ["src/**/*"],
      entryRoot: "src",
      insertTypesEntry: false,
      // Copy authored `.d.ts` sources (e.g. src/aktion-modules.d.ts — the
      // ambient `*.aktion` module declarations) into dist/types so the
      // `aktion-runtime/aktion-modules` export resolves.
      copyDtsFiles: true,
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "Aktion",
      formats: ["es", "umd", "iife"],
      fileName: (format) => {
        if (format === "es") return "aktion.js";
        if (format === "iife") return "aktion.iife.js";
        return "aktion.umd.cjs";
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
          if (asset.name?.endsWith(".css")) return "aktion.css";
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
