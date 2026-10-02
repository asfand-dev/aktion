#!/usr/bin/env node
/**
 * Generate the `aktion-runtime/dsl` declarations and manifest:
 *
 *   src/dsl/index.d.ts     → package export "./dsl"          (module flavour)
 *   src/dsl/globals.d.ts   → package export "./dsl-globals"  (ambient flavour)
 *   src/dsl/manifest.json  → read by the compiler's JS-semantics checks
 *
 * All three are GENERATED AND COMMITTED: this repo's own type-check fixtures
 * resolve `aktion-runtime/dsl` to `src/dsl/index.d.ts` without a build, and
 * vite-plugin-dts (`copyDtsFiles`) ships the two `.d.ts` files to
 * `dist/types/dsl/`. `tests/dsl-types.test.ts` fails when they are stale.
 *
 * Runs WITHOUT a prior build: the generator (`scripts/dsl-types/generate.ts`)
 * and the `src/` modules it reads are bundled with esbuild and evaluated from a
 * `data:` URL — nothing is written next to the sources, and a stale `dist/` can
 * never leak into the output. TypeScript is passed in rather than bundled.
 *
 * Usage:
 *   node scripts/emit-dsl-types.mjs                  write src/dsl/*
 *   node scripts/emit-dsl-types.mjs --out-dir <dir>  write the files to <dir> instead
 *   node scripts/emit-dsl-types.mjs --check          exit 1 if src/dsl/* is stale
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const committedDir = resolve(repoRoot, "src/dsl");

function parseArgs(argv) {
  const args = { outDir: committedDir, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--out-dir") {
      const value = argv[i + 1];
      if (!value) throw new Error("--out-dir needs a directory");
      args.outDir = resolve(process.cwd(), value);
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

async function loadGenerator() {
  const result = await build({
    entryPoints: [resolve(here, "dsl-types/generate.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node18",
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { generateDslTypes, OUTPUT_FILES } = await loadGenerator();
  const { files, summary } = generateDslTypes({ ts, repoRoot });

  if (args.check) {
    const stale = OUTPUT_FILES.filter((name) => {
      const path = join(committedDir, name);
      return !existsSync(path) || readFileSync(path, "utf8") !== files[name];
    });
    if (stale.length > 0) {
      console.error(`emit-dsl-types: stale — ${stale.map((n) => `src/dsl/${n}`).join(", ")}. Run \`npm run build:dsl-types\`.`);
      process.exitCode = 1;
      return;
    }
    console.log("emit-dsl-types: src/dsl is up to date.");
    return;
  }

  mkdirSync(args.outDir, { recursive: true });
  for (const name of OUTPUT_FILES) writeFileSync(join(args.outDir, name), files[name]);
  const kb = (name) => `${(Buffer.byteLength(files[name]) / 1024).toFixed(0)} KB`;
  const where = relative(process.cwd(), args.outDir) || ".";
  console.log(
    `emit-dsl-types: ${summary.components} components (${summary.props} props, ${summary.overloads} overloads), ` +
      `${summary.builtins} $-builtins → ${where}/ ` +
      `(index.d.ts ${kb("index.d.ts")}, globals.d.ts ${kb("globals.d.ts")}, manifest.json ${kb("manifest.json")})`,
  );
  const unresolved = Object.keys(summary.unresolvedTypeNames);
  if (unresolved.length > 0) {
    console.log(`emit-dsl-types: type hints naming no component compile to \`unknown\`: ${unresolved.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
