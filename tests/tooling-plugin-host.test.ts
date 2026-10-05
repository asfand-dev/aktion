// @vitest-environment node
/**
 * How the Vite plugin meets host code (src/plugin/index.ts), driven through a
 * real Vite — `createServer` + `ssrLoadModule` (what Vitest does) and `build`:
 *
 *   - host code gets an Aktion module's DEFAULT export only. A named import
 *     used to read `undefined` under Vitest and fail a build with a bare
 *     "is not exported"; it now throws, or fails the build, with an
 *     Aktion-specific explanation;
 *   - `?raw` / `?url` imports of an Aktion module are Vite's, not compiled;
 *   - an unresolvable specifier that names the module in the other language
 *     (`./x.aktion.js` for `x.aktion.ts`) says which file exists.
 *
 * The runtime import of the emitted module is pointed at a stand-in
 * (`runtimeModuleId`), so no build of the package is needed.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build, createServer, type ViteDevServer } from "vite";
import { aktionPlugin, compileAktionSource, createNodeResolver } from "../src/plugin/index.js";

let dir = "";
let runtime = "";
const put = (rel: string, text: string): string => {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "aktion-host-")));
  runtime = put("runtime-stub.js", "export const defineCompiledProgram = (p) => p;\n");
  put("src/api.aktion.ts", [
    'export const base: string = "https://example.test";',
    "export let $count: number = 0;",
    "export function remaining(todos: readonly { done: boolean }[]): number {",
    "  return todos.filter((t) => !t.done).length;",
    "}",
    "",
  ].join("\n"));
  put("src/app.aktion", 'import { remaining } from "./api.aktion.ts"\nexport label = "x"\n$app(Text("left: " + remaining([])))\n');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const plugin = () => aktionPlugin({ runtimeModuleId: runtime, config: false });

describe("named imports from host code", () => {
  let server: ViteDevServer;
  beforeAll(async () => {
    put("src/host.ts", [
      'import app, { remaining, base, $count } from "./api.aktion.ts";',
      'import * as dsl from "./app.aktion";',
      "export const path = app.path;",
      "export const dslKeys = Object.keys(dsl).sort();",
      "export const call = () => remaining([]);",
      'export const concat = () => base + "/todos";',
      "export const read = () => $count.toString();",
      "export const kind = typeof remaining;",
      "",
    ].join("\n"));
    server = await createServer({
      root: dir,
      configFile: false,
      logLevel: "silent",
      plugins: [plugin()],
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
  });
  afterAll(async () => {
    await server?.close();
  });

  it("under the dev server (and so Vitest), the default import works and a named one throws the Aktion explanation", async () => {
    const host = (await server.ssrLoadModule("/src/host.ts")) as Record<string, unknown>;
    // Importing is harmless; only using a binding throws.
    expect(host.path).toBe(join(dir, "src/api.aktion.ts"));
    expect(host.kind).toBe("function");
    expect(host.dslKeys).toEqual(["default", "label"]);
    const explanation = /\[aktion\] `remaining` is not available to host code: the Aktion module ".*api\.aktion\.ts" gives host code only its compiled program/;
    expect(() => (host.call as () => unknown)()).toThrow(explanation);
    // A non-function export must not read as `undefined` either: "undefined/todos".
    expect(() => (host.concat as () => unknown)()).toThrow(/`base` is not available to host code/);
    expect(() => (host.read as () => unknown)()).toThrow(/`\$count` is not available to host code/);
  });

  it("a build fails at the import, naming the binding and the default-import alternative", async () => {
    put("src/build-entry.ts", 'import { remaining } from "./api.aktion.ts";\nexport const n = remaining([]);\n');
    await expect(
      build({
        root: dir,
        configFile: false,
        logLevel: "silent",
        plugins: [plugin()],
        build: {
          write: false,
          lib: { entry: join(dir, "src/build-entry.ts"), formats: ["es"], fileName: "out" },
          rollupOptions: { external: [runtime] },
        },
      }),
    ).rejects.toThrow(
      /(?:^|\s)src\/build-entry\.ts imports `remaining` from "\.\/api\.aktion\.ts", but an Aktion module gives host code only its compiled program: `import app from "\.\/api\.aktion\.ts"`/,
    );
  });

  it("a build that only takes the default import is unaffected", async () => {
    put("src/ok-entry.ts", 'import app from "./api.aktion.ts";\nexport const path = app.path;\n');
    const out = await build({
      root: dir,
      configFile: false,
      logLevel: "silent",
      plugins: [plugin()],
      build: {
        write: false,
        lib: { entry: join(dir, "src/ok-entry.ts"), formats: ["es"], fileName: "out" },
        rollupOptions: { external: [runtime] },
      },
    });
    const chunk = (Array.isArray(out) ? out[0]! : out) as { output: Array<{ code?: string }> };
    expect(chunk.output[0]!.code).toContain("api.aktion.ts");
    expect(chunk.output[0]!.code).not.toContain("__aktionHostOnly");
  });
});

describe("Vite's asset queries", () => {
  it("`?raw` and `?url` imports of an Aktion module are left to Vite", async () => {
    put("src/raw-entry.ts", [
      'import tsText from "./api.aktion.ts?raw";',
      'import dslText from "./app.aktion?raw";',
      'import dslUrl from "./app.aktion?url";',
      "export const all = [tsText, dslText, dslUrl];",
      "",
    ].join("\n"));
    const out = await build({
      root: dir,
      configFile: false,
      logLevel: "silent",
      plugins: [plugin()],
      build: {
        write: false,
        lib: { entry: join(dir, "src/raw-entry.ts"), formats: ["es"], fileName: "out" },
      },
    });
    const chunk = (Array.isArray(out) ? out[0]! : out) as { output: Array<{ code?: string; fileName: string }> };
    const code = chunk.output.find((o) => o.code !== undefined)!.code!;
    // The files' own text, not a compiled program.
    expect(code).toContain("export function remaining(todos: readonly { done: boolean }[]): number");
    expect(code).toContain('$app(Text("left: " + remaining([])))');
    expect(code).not.toContain("defineCompiledProgram");
  });

  it("the transform filter and handler skip asset queries but keep Vite's other queries", async () => {
    const hooks = plugin() as unknown as {
      configResolved: (c: { command: string; root: string }) => void;
      transform: { filter: { id: RegExp }; handler: (this: unknown, code: string, id: string) => Promise<unknown> };
    };
    hooks.configResolved({ command: "build", root: dir });
    for (const id of ["/p/x.aktion?raw", "/p/x.aktion.ts?raw", "/p/x.aktion.js?url", "/p/x.aktion?worker", "/p/x.aktion.ts?import&raw", "/p/x.aktion?url&inline"]) {
      expect(hooks.transform.filter.id.test(id), id).toBe(false);
      expect(await hooks.transform.handler.call({}, 'export default "text"', id), id).toBeNull();
    }
    for (const id of ["/p/x.aktion.ts?import", "/p/x.aktion?t=123", "/p/x.aktion.js?v=abc", "/p/x.aktion#h", "/p/rawness.aktion?import"]) {
      expect(hooks.transform.filter.id.test(id), id).toBe(true);
    }
  });
});

describe("the other language's suffix", () => {
  beforeAll(() => {
    put("res/only.aktion.ts", "export const a = 1\n");
    put("res/jsonly.aktion.js", "export const b = 2\n");
    put("res/dsl.aktion", "export c = 3\n");
  });
  const explain = (spec: string): string | undefined =>
    createNodeResolver({ root: join(dir, "res") }).explain!(spec, join(dir, "res/app.aktion.ts"));

  it("names the file that exists", () => {
    expect(explain("./only.aktion.js")).toBe(
      'Did you mean "./only.aktion.ts"? Aktion imports the file named, without TypeScript\'s `.js` → `.ts` mapping.',
    );
    expect(explain("./jsonly.aktion.ts")).toBe('Did you mean "./jsonly.aktion.js"?');
    expect(explain("./dsl.aktion.ts")).toBe('Did you mean "./dsl.aktion"?');
    expect(explain("./only.aktion")).toBe('Did you mean "./only.aktion.ts"?');
    expect(explain("./missing.aktion.js")).toBeUndefined();
  });

  it("in the compile error", () => {
    expect(() =>
      compileAktionSource('import { a } from "./only.aktion.js"\n$app(Text("x" + a))', join(dir, "res/app.aktion"), { root: join(dir, "res") }),
    ).toThrow(/Cannot resolve import "\.\/only\.aktion\.js"\. Did you mean "\.\/only\.aktion\.ts"\?/);
  });
});
