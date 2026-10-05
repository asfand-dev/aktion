// @vitest-environment node
/**
 * The dev-server stand-ins for an Aktion module's named exports
 * (`hostOnlyExports` in src/plugin/index.ts), driven through a real Vite dev
 * server — `createServer` + `ssrLoadModule`, what Vitest does — like
 * tests/tooling-plugin-host.test.ts:
 *
 *   - the stand-ins follow the entry's own frontend: a `.aktion.ts` export
 *     declared after an erased multi-line type gets one too (re-parsing the
 *     erased text without the TypeScript frontend's soft newlines lost it);
 *   - Vitest's automocker can mock such a module. `vi.mock(path)` with no
 *     factory loads the module and hands it to `mockObject` from
 *     `@vitest/mocker`, as `VitestMocker.mockObject` calls it (with
 *     `@vitest/spy`'s `spyOn`); that call is made here directly, since this
 *     repo's own Vitest config has no Aktion plugin to `vi.mock` through.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { mockObject } from "@vitest/mocker";
import { spyOn } from "@vitest/spy";
import { aktionPlugin } from "../src/plugin/index.js";

let dir = "";
let server: ViteDevServer;
const put = (rel: string, text: string): string => {
  const path = join(dir, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};

beforeAll(async () => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "aktion-host-round2-")));
  const runtime = put("runtime-stub.js", "export const defineCompiledProgram = (p) => p;\n");
  put("src/multi.aktion.ts", [
    "export function make(): {",
    "  readonly a: number;",
    "} {",
    "  return { a: 1 };",
    "}",
    "export let $count: number = 0;",
    "",
  ].join("\n"));
  put("src/api.aktion.ts", [
    'export const base: string = "https://example.test";',
    "export function remaining(todos: readonly { done: boolean }[]): number {",
    "  return todos.filter((t) => !t.done).length;",
    "}",
    "",
  ].join("\n"));
  put("src/host.ts", [
    'import { make, $count } from "./multi.aktion.ts";',
    "export const makeKind = typeof make;",
    "export const countKind = typeof $count;",
    "export const callMake = () => make();",
    "",
  ].join("\n"));
  server = await createServer({
    root: dir,
    configFile: false,
    logLevel: "silent",
    plugins: [aktionPlugin({ runtimeModuleId: runtime, config: false })],
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
});
afterAll(async () => {
  await server?.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The stand-in's error for the export `name`. */
const explanation = (name: string): RegExp => new RegExp(`\\[aktion\\] \`${name.replace(/\$/g, "\\$")}\` is not available to host code`);

describe("the stand-ins follow the entry's own frontend", () => {
  it("an export after an erased multi-line return type gets a stand-in", async () => {
    const host = (await server.ssrLoadModule("/src/host.ts")) as Record<string, unknown>;
    expect(host.makeKind).toBe("function");
    expect(host.countKind).toBe("function");
    expect(() => (host.callMake as () => unknown)()).toThrow(explanation("make"));
  });
});

describe("Vitest's automocker (vi.mock without a factory)", () => {
  const automock = (mod: unknown, type: "automock" | "autospy"): Record<string, unknown> =>
    mockObject({ globalConstructors: { Object, Function, RegExp, Array, Map }, spyOn, type }, mod as object) as Record<string, unknown>;

  it("mocks the module: the stand-ins are kept as they are, the default export is mocked", async () => {
    const mod = (await server.ssrLoadModule("/src/api.aktion.ts")) as Record<string, unknown>;
    for (const type of ["automock", "autospy"] as const) {
      const mocked = automock(mod, type);
      // (Vite's SSR module object also carries `__esModule`.)
      expect(Object.keys(mocked).filter((key) => key !== "__esModule").sort(), type).toEqual(["base", "default", "remaining"]);
      expect(mocked.remaining, type).toBe(mod.remaining);
      expect(mocked.base, type).toBe(mod.base);
      expect((mocked.default as { path?: unknown }).path, type).toBe(join(dir, "src/api.aktion.ts"));
    }
  });

  it("…and a stand-in still throws the explanation when used", async () => {
    const mod = (await server.ssrLoadModule("/src/api.aktion.ts")) as Record<string, unknown>;
    const mocked = automock(mod, "automock");
    expect(() => (mocked.remaining as (todos: unknown[]) => number)([])).toThrow(explanation("remaining"));
    expect(() => `${String(mocked.base)}/todos`).toThrow(explanation("base"));
    expect(() => (mocked.base as { length: number }).length).toThrow(explanation("base"));
    expect(() => Object.keys(mocked.base as object)).toThrow(explanation("base"));
    // The one read that answers: the type tag `Object.prototype.toString` reads.
    expect(Object.prototype.toString.call(mocked.remaining)).toBe("[object AktionHostOnly]");
  });
});
