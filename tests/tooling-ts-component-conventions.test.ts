/**
 * The typed conventions for a `.aktion.ts` user component that takes a `key`
 * or children — measured here because the TypeScript guide recommends them.
 *
 * A TypeScript component's signature is its parameter list, so
 * `Item(label, { key })` and `Shell(title, child)` are TS2554 against
 * `function Item(label: string)`. Two forms type-check AND bind as written:
 *
 *   - a trailing `_opts?: { readonly key?: Key }` parameter — the runtime takes
 *     an object literal with `key` as the named props and `key` as identity,
 *     so the parameter itself stays `undefined`;
 *   - a declared `children` parameter.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAktionFileAsync } from "../src/plugin/index.js";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tscBin = join(repoRoot, "node_modules/typescript/bin/tsc");

const APP = [
  'import { $app, Column, Text, type AktionNode, type Children, type Key } from "aktion-runtime/dsl";',
  "",
  "export function Item(label: string, _opts?: { readonly key?: Key }): AktionNode {",
  '  return Text("item " + label + ":" + (_opts === undefined ? "no-opts" : "opts"));',
  "}",
  "",
  "export function Shell(title: string, children: Children): AktionNode {",
  '  return Column([Text("shell " + title), children]);',
  "}",
  "",
  "export default $app(Column([",
  '  ...["a", "b"].map((id) => Item(id, { key: id })),',
  '  Shell("S", Text("child")),',
  "]));",
  "",
].join("\n");

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "aktion-ts-conventions-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/app.aktion.ts"), APP);
});
afterAll(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

describe("keys and children for a `.aktion.ts` component", () => {
  it("type-check", () => {
    mkdirSync(join(dir, "stage/dsl"), { recursive: true });
    mkdirSync(join(dir, "stage/compiler"), { recursive: true });
    writeFileSync(join(dir, "stage/dsl/index.d.ts"), readFileSync(join(repoRoot, "src/dsl/index.d.ts"), "utf8"));
    writeFileSync(
      join(dir, "stage/compiler/runtime.d.ts"),
      "export interface CompiledProgram { readonly __aktionCompiled: 1; readonly program: unknown; readonly source: string; readonly path: string; readonly sourcesContent?: readonly string[] }\n",
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM"],
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
          verbatimModuleSyntax: true,
          paths: { "aktion-runtime/dsl": ["./stage/dsl/index.d.ts"] },
        },
        files: ["src/app.aktion.ts"],
      }),
    );
    const run = spawnSync(process.execPath, [tscBin, "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
    expect(`${run.stdout}${run.stderr}`).toBe("");
    expect(run.status).toBe(0);
  }, 60_000);

  it("bind as written", async () => {
    const screen = renderCompiled(await compileAktionFileAsync(join(dir, "src/app.aktion.ts"), { root: join(dir, "src") }));
    await flush();
    const text = screen.shadowRoot.textContent ?? "";
    // `key` is taken as identity; `_opts` itself is never bound.
    expect(text).toContain("item a:no-opts");
    expect(text).toContain("item b:no-opts");
    expect(text).toContain("shell S");
    expect(text).toContain("child");
  });
});
