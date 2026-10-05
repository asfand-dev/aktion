/**
 * The `--lang ts` scaffold's own `typecheck` script on a clean checkout.
 *
 * `.aktion-types/` is gitignored and only the Vite plugin wrote it (on
 * `buildStart` and in the dev server), so a fresh clone or a CI job running
 * `npm run typecheck` first failed with TS2614 as soon as a `.aktion.ts`
 * module imported a `.aktion` one — the mixed setup the template advertises.
 * The script now generates the declarations before `tsc`; this runs it, as
 * written in the scaffold's package.json, with no `.aktion-types/` present.
 *
 * `aktion-dts` and `tsc` resolve to this repo's bin and TypeScript through the
 * scaffold's `node_modules/.bin`, and `aktion-runtime/dsl` to the committed
 * declarations (as in tests/create-aktion.test.ts).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { ensurePluginDist, repoRoot } from "./fixtures/tooling/plugin-dist.js";

let work = "";
beforeAll(() => {
  ensurePluginDist();
  work = mkdtempSync(join(tmpdir(), "create-aktion-tsc-"));
}, 120_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

const put = (dir: string, rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

describe("the TypeScript scaffold's `typecheck` script", () => {
  it("passes on a clean checkout whose `.aktion.ts` code imports a `.aktion` module", () => {
    const created = spawnSync(process.execPath, [join(repoRoot, "create-aktion/index.mjs"), "app", "-y", "--template", "todos-app", "--lang", "ts"], {
      cwd: work,
      encoding: "utf8",
    });
    expect(created.status, `${created.stdout}${created.stderr}`).toBe(0);
    const dir = join(work, "app");

    // A `.aktion` module with named exports, imported from TypeScript.
    put(dir, "src/components/badge.aktion", 'export $tone = "info"\nexport function Badge(label, tone = "muted") { return Text(label) }\n');
    put(
      dir,
      "src/components/badge-row.aktion.ts",
      [
        'import type { AktionNode } from "aktion-runtime/dsl";',
        'import { Badge, $tone } from "./badge.aktion";',
        "",
        "export function BadgeRow(labels: readonly string[]): AktionNode[] {",
        "  return labels.map((label, i) => Badge(label, { tone: $tone, key: i }));",
        "}",
        "",
      ].join("\n"),
    );

    put(dir, ".stage/dsl/index.d.ts", readFileSync(join(repoRoot, "src/dsl/index.d.ts"), "utf8"));
    put(
      dir,
      ".stage/compiler/runtime.d.ts",
      "export interface CompiledProgram { readonly __aktionCompiled: 1; readonly program: unknown; readonly source: string; readonly path: string; readonly sourcesContent?: readonly string[] }\n",
    );
    mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
    symlinkSync(join(repoRoot, "bin/aktion-dts.mjs"), join(dir, "node_modules/.bin/aktion-dts"));
    symlinkSync(join(repoRoot, "node_modules/typescript/bin/tsc"), join(dir, "node_modules/.bin/tsc"));
    // The scaffold's tsconfig over the Aktion modules (host code and tests need
    // the built package and Vitest).
    writeFileSync(
      join(dir, "tsconfig.check.json"),
      JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: { types: [], paths: { "aktion-runtime/dsl": ["./.stage/dsl/index.d.ts"] } },
        include: ["src/**/*.aktion.ts", "src/types.ts", ".aktion-types"],
      }),
    );

    expect(existsSync(join(dir, ".aktion-types"))).toBe(false);
    const { scripts } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { scripts: Record<string, string> };
    // What `npm run typecheck -- -p tsconfig.check.json` runs.
    const run = spawnSync(`${scripts.typecheck} -p tsconfig.check.json`, {
      cwd: dir,
      shell: true,
      encoding: "utf8",
      env: { ...process.env, PATH: `${join(dir, "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}` },
    });
    expect(`${run.stdout}${run.stderr}`).toBe("");
    expect(run.status).toBe(0);
    expect(existsSync(join(dir, ".aktion-types/src/components/badge.d.aktion.ts"))).toBe(true);
  }, 120_000);
});
