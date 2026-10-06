// @vitest-environment node
/**
 * The Vite plugin's `dts` declarations and its build resolve a RELATIVE plugin
 * `alias` target the same way (src/plugin/index.ts `absoluteAliasTargets`):
 * against the working directory, as `createNodeResolver` always has. The
 * declaration emitter on its own resolves a relative target against its
 * `root` — the Vite root — so with a Vite root other than the working
 * directory the `.aktion-types/<prefix>/` mirror used to declare a directory
 * the build never linked (here: one that does not exist, so nothing at all).
 *
 * The project lives under the repo's (git-ignored) `dist/`, not the system
 * temp dir: a relative path from the working directory to the temp dir climbs
 * to `/`, where any further `..` is a no-op, so it names the same directory
 * from either base and hides the disagreement.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { aktionPlugin, createNodeResolver } from "../src/plugin/index.js";

let mono = "";
let app = "";
let lib = "";
const put = (path: string, text: string): string => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};

beforeAll(() => {
  const dist = resolve(__dirname, "../dist");
  mkdirSync(dist, { recursive: true });
  mono = mkdtempSync(join(dist, "test-dts-alias-"));
  app = join(mono, "apps/web");
  lib = join(mono, "libs/ui/src");
  put(join(lib, "badge.aktion"), 'export function Badge(label, tone = "info") { return Text(label) }\n');
  put(join(app, "src/main.aktion"), 'import { Badge } from "@ui/badge.aktion"\n$app(Badge("x"))\n');
});
afterAll(() => rmSync(mono, { recursive: true, force: true }));

type Hooks = {
  configResolved: (c: { command: string; root: string }) => void;
  buildStart: (this: unknown) => Promise<void>;
  configureServer: (server: { watcher: { on(event: string, listener: (file: string) => void): unknown } }) => void;
};

describe("a relative plugin alias, with a Vite root that is not the working directory", () => {
  // Relative to the working directory, as a target in vite.config.ts run from
  // there would be written.
  const alias = (): Record<string, string> => ({ "@ui": relative(process.cwd(), lib) });

  it("the premise: the target names another directory from the Vite root, and the build resolves it into the library", () => {
    expect(resolve(app, alias()["@ui"]!)).not.toBe(lib);
    const resolver = createNodeResolver({ alias: alias(), root: app });
    expect(resolver.resolve("@ui/badge.aktion", join(app, "src/main.aktion"))).toBe(join(lib, "badge.aktion"));
  });

  it("buildStart mirrors that same library under .aktion-types/@ui/", async () => {
    rmSync(join(app, ".aktion-types"), { recursive: true, force: true });
    const plugin = aktionPlugin({ alias: alias(), dts: true, config: false }) as unknown as Hooks;
    const warnings: string[] = [];
    plugin.configResolved({ command: "build", root: app });
    await plugin.buildStart.call({ warn: (m: string) => warnings.push(m) });
    expect(warnings).toEqual([]);
    const mirrored = join(app, ".aktion-types/@ui/badge.d.aktion.ts");
    expect(existsSync(mirrored)).toBe(true);
    expect(readFileSync(mirrored, "utf8")).toContain("export declare function Badge(");
  });

  it("the dev-server watcher keeps that mirror current", () => {
    const plugin = aktionPlugin({ alias: alias(), dts: true, config: false }) as unknown as Hooks;
    plugin.configResolved({ command: "serve", root: app });
    const listeners = new Map<string, (file: string) => void>();
    plugin.configureServer({ watcher: { on: (event, listener) => listeners.set(event, listener) } });
    const badge = put(join(lib, "badge.aktion"), "export function Badge(label, hint) { return Text(label) }\n");
    listeners.get("change")!(badge);
    expect(readFileSync(join(app, ".aktion-types/@ui/badge.d.aktion.ts"), "utf8")).toContain("hint?: any");
  });
});
