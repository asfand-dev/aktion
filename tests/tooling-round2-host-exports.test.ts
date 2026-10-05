// @vitest-environment node
/**
 * The dev-server stand-ins for an Aktion module's named exports
 * (`hostOnlyExports` in src/plugin/index.ts), driven through a real Vite dev
 * server — `createServer` + `ssrLoadModule`, what Vitest does — like
 * tests/tooling-plugin-host.test.ts: the stand-ins follow the entry's own
 * frontend, so a `.aktion.ts` export declared after an erased multi-line type
 * gets one too (re-parsing the erased text without the TypeScript frontend's
 * soft newlines lost it).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer, type ViteDevServer } from "vite";
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
