/**
 * `aktion-runtime/aktion-modules` (src/aktion-modules.d.ts): with the
 * reference in place, `import app from "./app.aktion"` is the
 * `CompiledProgram` the Vite plugin emits — not `any`.
 *
 * The file used to take the type through an `import type` DECLARATION with a
 * relative name, which an ambient module may not use (TS2439) and which then
 * did not resolve (TS2307). Every template sets `skipLibCheck: true`, which hid
 * both errors and left the default import `any`. So this test type-checks the
 * file where it is published (`dist/types/aktion-modules.d.ts` beside
 * `dist/types/compiler/runtime.d.ts`) with `skipLibCheck: false`, and proves
 * the import is not `any` with a `@ts-expect-error` that must be used.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tscBin = join(repoRoot, "node_modules/typescript/bin/tsc");

let project = "";
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(project, rel)), { recursive: true });
  writeFileSync(join(project, rel), text);
};

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), "aktion-modules-"));
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };
  // The published layout: the real `exports` entry, the real file, and a
  // stand-in for the runtime declarations it points at.
  put(
    "node_modules/aktion-runtime/package.json",
    JSON.stringify({ name: "aktion-runtime", type: "module", exports: { "./aktion-modules": pkg.exports["./aktion-modules"] } }),
  );
  put("node_modules/aktion-runtime/dist/types/aktion-modules.d.ts", readFileSync(join(repoRoot, "src/aktion-modules.d.ts"), "utf8"));
  put(
    "node_modules/aktion-runtime/dist/types/compiler/runtime.d.ts",
    "export interface CompiledProgram { readonly __aktionCompiled: 1; readonly path: string }\n",
  );
  put("src/env.d.ts", '/// <reference types="aktion-runtime/aktion-modules" />\n');
  put(
    "src/main.ts",
    [
      'import app from "./app.aktion";',
      "export const path: string = app.path;",
      "// @ts-expect-error a CompiledProgram is not a number (were `app` `any`, this directive would be unused)",
      "export const n: number = app;",
      "",
    ].join("\n"),
  );
  put(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
      },
      include: ["src"],
    }),
  );
});
afterAll(() => rmSync(project, { recursive: true, force: true }));

describe("aktion-runtime/aktion-modules", () => {
  it("types a `.aktion` default import as the CompiledProgram, with no error in the declaration", () => {
    const run = spawnSync(process.execPath, [tscBin, "-p", join(project, "tsconfig.json")], { encoding: "utf8" });
    expect(`${run.stdout}${run.stderr}`).toBe("");
    expect(run.status).toBe(0);
  }, 60_000);
});
