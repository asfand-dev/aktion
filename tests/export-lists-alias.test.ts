/**
 * A barrel behind a repo-root `aktion.config.json` alias (`@dcd/aktion/*`): an
 * app imports through the alias, the barrel re-exports from siblings both
 * relatively and through the alias, and the whole graph links in order and
 * compiles. The
 * project lives under the repo's git-ignored `dist/`, like the other
 * filesystem tests.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { linkProgram } from "../src/compiler/index.js";
import { renderCompiled } from "../src/testing/index.js";
import { compileAktionFile, createNodeResolver, loadAktionConfig, mergeResolveOptions } from "../src/plugin/index.js";

let root = "";
const put = (path: string, text: string): string => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};

beforeAll(() => {
  const dist = resolve(__dirname, "../dist");
  mkdirSync(dist, { recursive: true });
  root = mkdtempSync(join(dist, "test-export-alias-"));
  put(join(root, "aktion.config.json"), JSON.stringify({ alias: { "@dcd/aktion": "./libs/shared/aktion/src" } }));
  const lib = join(root, "libs/shared/aktion/src");
  put(join(lib, "barrel.aktion"), [
    'export { $open, toggle } from "./state.aktion"',
    'export { Panel } from "@dcd/aktion/panel.aktion"',
    'export * from "./format.aktion"',
  ].join("\n"));
  put(join(lib, "state.aktion"), "export let $open = false\nexport function toggle() { $open = !$open }");
  put(join(lib, "panel.aktion"), 'import { $open } from "@dcd/aktion/state.aktion"\nexport function Panel() { return Text(`open=${$open}`) }');
  put(join(lib, "format.aktion"), "export function shout(s) { return s.toUpperCase() }");
  put(join(root, "apps/web/src/main.aktion"), [
    'import { $open, toggle, Panel, shout } from "@dcd/aktion/barrel.aktion"',
    '$app(Column([Text(shout("hi")), Panel(), Button("go", toggle)]))',
  ].join("\n"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("re-exports behind an aktion.config.json alias", () => {
  it("links the app through the barrel to the declaring modules", () => {
    const entry = join(root, "apps/web/src/main.aktion");
    const config = loadAktionConfig(entry)!;
    const resolver = createNodeResolver(mergeResolveOptions(config, {}));
    const result = linkProgram(readFileSync(entry, "utf8"), entry, resolver);
    expect(result.diagnostics).toEqual([]);
    expect(result.dependencies.map((d) => d.slice(root.length))).toEqual([
      "/libs/shared/aktion/src/state.aktion",
      "/libs/shared/aktion/src/panel.aktion",
      "/libs/shared/aktion/src/format.aktion",
      "/libs/shared/aktion/src/barrel.aktion",
    ]);
  });

  it("compiles through the public file API", () => {
    expect(() => compileAktionFile(join(root, "apps/web/src/main.aktion"))).not.toThrow();
  });

  it("renders: the barrel's atom is one shared cell", async () => {
    const screen = renderCompiled(compileAktionFile(join(root, "apps/web/src/main.aktion")));
    await screen.flush(12);
    expect(screen.queryByText("HI")).not.toBeNull();
    expect(screen.queryByText("open=false")).not.toBeNull();
    await screen.click("go");
    expect(screen.queryByText("open=true")).not.toBeNull();
  });
});
