import { defineConfig } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";
import type { Plugin } from "vite";

/** `.aktion`, `.aktion.ts` and `.aktion.js` — every Aktion module kind. */
const AKTION_MODULE = /\.aktion(?:\.[jt]s)?$/;

function watchAktionFiles(): Plugin {
  return {
    name: "watch-aktion-files",
    configureServer(server) {
      server.watcher.add(["**/*.aktion", "**/*.aktion.ts", "**/*.aktion.js"]);
      server.watcher.on("change", (file) => {
        if (AKTION_MODULE.test(file)) {
          server.ws.send({ type: "full-reload" });
        }
      });
    },
    handleHotUpdate({ file, server }) {
      if (AKTION_MODULE.test(file)) {
        server.ws.send({ type: "full-reload" });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [
    watchAktionFiles(),
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
      // The ambient `aktion-runtime/dsl-globals` flavour is excluded from this
      // repo's own tsconfig (its globals would leak into runtime source), so the
      // program above never sees it — copy it next to the module flavour.
      afterBuild: () => {
        mkdirSync(resolve(__dirname, "dist/types/dsl"), { recursive: true });
        copyFileSync(resolve(__dirname, "src/dsl/globals.d.ts"), resolve(__dirname, "dist/types/dsl/globals.d.ts"));
      },
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
