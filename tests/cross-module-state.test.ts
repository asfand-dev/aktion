/**
 * State written from more than one module. Three shapes all share one cell
 * across every importer at runtime: an exported atom with an exported setter
 * action, an exported `$store` written by property, and a direct write to an
 * imported `$atom`. The first two are the documented patterns; the third is what
 * JavaScript tooling flags as `no-import-assign`. Measured behind
 * `docs/modules.html#shared-state-writes`. A `$store` factory is the shape that
 * does NOT work: it returns one instance per call site.
 */

import { afterEach, describe, expect, it } from "vitest";
import { linkProgram, defineCompiledProgram, COMPILED_PROGRAM_VERSION } from "../src/compiler/index.js";
import type { ModuleResolver } from "../src/compiler/index.js";
import { renderCompiled, cleanup } from "../src/testing/index.js";

afterEach(() => cleanup());

function mount(files: Record<string, string>) {
  const resolver: ModuleResolver = {
    resolve: (spec) => (spec.startsWith("./") ? `/${spec.slice(2)}` : null),
    load: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`no such module ${path}`);
      return source;
    },
  };
  const result = linkProgram(files["/app.aktion"]!, "/app.aktion", resolver);
  expect(result.diagnostics).toEqual([]);
  return renderCompiled(
    defineCompiledProgram({
      __aktionCompiled: COMPILED_PROGRAM_VERSION,
      program: result.program,
      source: files["/app.aktion"]!,
      path: "/app.aktion",
    }),
  );
}

/** The entry and an imported component each show the flag and each own a toggle button. */
const app = (importLine: string, entryToggle: string, read: string) =>
  [
    importLine,
    'import { Panel } from "./panel.aktion"',
    `$app(Column([Text(\`app=\${${read}}\`), Button("tog-app", ${entryToggle}), Panel()]))`,
  ].join("\n");
const panel = (importLine: string, panelToggle: string, read: string) =>
  [
    importLine,
    `export function Panel() { return Column([Text(\`panel=\${${read}}\`), Button("tog-panel", ${panelToggle})]) }`,
  ].join("\n");

const SHAPES: Array<[string, Record<string, string>]> = [
  [
    "an exported atom and an exported setter action",
    {
      "/ui.aktion": "export let $open = false\nexport function toggle() { $open = !$open }",
      "/app.aktion": app('import { $open, toggle } from "./ui.aktion"', "toggle", "$open"),
      "/panel.aktion": panel('import { $open, toggle } from "./ui.aktion"', "toggle", "$open"),
    },
  ],
  [
    "an exported $store written by property",
    {
      "/ui.aktion": "export const ui = $store({ open: false })",
      "/app.aktion": app('import { ui } from "./ui.aktion"', "() => { ui.open = !ui.open }", "ui.open"),
      "/panel.aktion": panel('import { ui } from "./ui.aktion"', "() => { ui.open = !ui.open }", "ui.open"),
    },
  ],
  [
    "a direct write to an imported atom (flagged by no-import-assign)",
    {
      "/ui.aktion": "export let $open = false",
      "/app.aktion": app('import { $open } from "./ui.aktion"', "() => { $open = !$open }", "$open"),
      "/panel.aktion": panel('import { $open } from "./ui.aktion"', "() => { $open = !$open }", "$open"),
    },
  ],
];

describe.each(SHAPES)("%s", (_label, files) => {
  it("is one cell shared by the entry and an imported component", async () => {
    const screen = mount(files);
    await screen.flush(12);
    expect(screen.queryByText("app=false")).not.toBeNull();
    expect(screen.queryByText("panel=false")).not.toBeNull();

    await screen.click("tog-app");
    expect(screen.queryByText("app=true")).not.toBeNull();
    expect(screen.queryByText("panel=true")).not.toBeNull();

    await screen.click("tog-panel");
    expect(screen.queryByText("app=false")).not.toBeNull();
    expect(screen.queryByText("panel=false")).not.toBeNull();
  });
});

describe("a $store factory", () => {
  it("hands every caller the same instance, because the store is keyed by its call site", async () => {
    const screen = mount({
      "/f.aktion": "export function make() { return $store({ n: 0 }) }",
      "/app.aktion": [
        'import { make } from "./f.aktion"',
        "const a = make()",
        "const b = make()",
        '$app(Column([Text(`a=${a.n}`), Text(`b=${b.n}`), Button("incA", () => { a.n = a.n + 1 })]))',
      ].join("\n"),
    });
    await screen.flush(12);
    await screen.click("incA");
    expect(screen.queryByText("a=1")).not.toBeNull();
    expect(screen.queryByText("b=1")).not.toBeNull();
  });
});
