/**
 * The Vite plugin with `.aktion.ts` / `.aktion.js` modules (guide §7.6, Phase 2):
 * the PoC of Appendix B, ported. The hooks are driven the way Rollup drives them
 * — `configResolved`, `await buildStart` (it loads the TypeScript frontend), then
 * the object hook's `handler` — and the emitted module is unpacked and mounted.
 */

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aktionPlugin, aktionViteConfig, type AktionPluginOptions } from "../src/plugin/index.js";
import { defineCompiledProgram, type CompiledProgram } from "../src/compiler/index.js";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";
import type { Program } from "../src/parser/types.js";

const dir = mkdtempSync(join(tmpdir(), "aktion-plugin-ts-"));
const write = (name: string, source: string): string => {
  const path = join(dir, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, source, "utf8");
  return path;
};

afterEach(() => cleanup());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

interface Hooks {
  config: (this: unknown, user: Record<string, unknown>) => Record<string, unknown>;
  configResolved: (config: { command: string; root?: string }) => void;
  buildStart: (this: unknown) => Promise<void>;
  transform: {
    filter: { id: RegExp };
    handler: (this: unknown, code: string, id: string) => Promise<{ code: string; moduleType: string } | null>;
  };
}

interface Context {
  watched: string[];
  warnings: string[];
  errors: Array<{ message: string; id?: string; loc?: { file?: string; line: number; column: number } }>;
}

async function transform(
  entry: string,
  code: string,
  options: AktionPluginOptions = {},
  command = "build",
): Promise<{ out: { code: string; moduleType: string } | null; ctx: Context }> {
  const plugin = aktionPlugin(options) as unknown as Hooks;
  const ctx: Context = { watched: [], warnings: [], errors: [] };
  const rollup = {
    addWatchFile: (id: string) => ctx.watched.push(id),
    warn: (message: string) => ctx.warnings.push(message),
    error: (error: Context["errors"][number]): never => {
      ctx.errors.push(error);
      throw new Error(error.message);
    },
  };
  plugin.configResolved({ command, root: dir });
  await plugin.buildStart.call(rollup);
  try {
    return { out: await plugin.transform.handler.call(rollup, code, entry), ctx };
  } catch {
    return { out: null, ctx };
  }
}

/** Rebuild the `CompiledProgram` the generated module default-exports. */
function unpack(moduleCode: string): CompiledProgram & { sourcesContent?: string[] } {
  const programLiteral = /JSON\.parse\((".*")\);\nconst source/s.exec(moduleCode)![1]!;
  const program = JSON.parse(JSON.parse(programLiteral) as string) as Program;
  const source = JSON.parse(/const source = (".*");\nexport default/s.exec(moduleCode)![1]!) as string;
  const path = JSON.parse(/path: (".*?")(?:, sourcesContent| \})/s.exec(moduleCode)![1]!) as string;
  const contents = /sourcesContent: (\[.*\]) \}\);/s.exec(moduleCode);
  return {
    ...defineCompiledProgram({ __aktionCompiled: 1, program, source, path }),
    ...(contents ? { sourcesContent: JSON.parse(contents[1]!) as string[] } : {}),
  };
}

// The PoC graph: a `.aktion` entry → a `.aktion.ts` store and component → a `.aktion.js` helper.
const files = {
  "src/format.aktion.js": ['export function label(n) {', '  return "n=" + n', "}"].join("\n"),
  "src/store.aktion.ts": [
    'import { label } from "./format.aktion.js"',
    "export interface Todo { id: number; title: string }",
    "export let $count: number = 0",
    "export function increment(step: number = 1): void {",
    "  $count = $count + step",
    "}",
    "export function describe(): string {",
    "  return label($count)",
    "}",
  ].join("\n"),
  "src/counter.aktion.ts": [
    'import { Button, Column, Text } from "aktion-runtime/dsl"',
    'import { $count, increment, describe } from "./store.aktion.ts"',
    "type Props = { title: string }",
    "export function Counter({ title }: Props) {",
    "  return Column([",
    "    Text(title + \": \" + describe()),",
    '    Button("Go", { onClick: () => increment(2) }),',
    "  ])",
    "}",
  ].join("\n"),
  "src/app.aktion": ['import { Counter } from "./counter.aktion.ts"', '$app(Counter({ title: "Count" }))'].join("\n"),
};
for (const [name, source] of Object.entries(files)) write(name, source);

describe("transform of a mixed-language graph", () => {
  it("links `.aktion` → `.aktion.ts` → `.aktion.js`, renders, and shares state", async () => {
    const { out, ctx } = await transform(join(dir, "src/app.aktion"), files["src/app.aktion"]);
    expect(ctx.errors).toEqual([]);
    expect(out!.moduleType).toBe("js");
    const screen = renderCompiled(unpack(out!.code));
    await flush();
    expect(screen.shadowRoot.textContent).toContain("Count: n=0");
    await screen.click("Go");
    await flush();
    expect(screen.shadowRoot.textContent).toContain("Count: n=2");
  });

  it("watches every dependency, including `.aktion.ts` and `.aktion.js` modules", async () => {
    const { ctx } = await transform(join(dir, "src/app.aktion"), files["src/app.aktion"]);
    expect(ctx.watched.sort()).toEqual(
      [join(dir, "src/counter.aktion.ts"), join(dir, "src/format.aktion.js"), join(dir, "src/store.aktion.ts")].sort(),
    );
  });

  it("transforms a `.aktion.ts` ENTRY, and emits runnable Aktion text plus the original sources", async () => {
    const text = ['import { Counter } from "./counter.aktion.ts"', 'export default $app(Counter({ title: "Entry" }))'].join("\n");
    const entry = write("src/main.aktion.ts", text);
    const { out, ctx } = await transform(`${entry}?import`, text);
    expect(ctx.errors.map((e) => e.message)).toEqual([]);
    const compiled = unpack(out!.code);
    expect(compiled.path).toBe(entry);
    // `source` is the PRINTED linked program — Aktion, not TypeScript.
    expect(compiled.source).not.toContain(": number");
    expect(compiled.source).toContain("$app(");
    // `sourcesContent` is the text each module was written in.
    expect(compiled.sourcesContent![0]).toContain("export default $app");
    expect(compiled.sourcesContent!.some((s) => s.includes("export let $count: number = 0"))).toBe(true);
    const screen = renderCompiled(compiled);
    await flush();
    expect(screen.shadowRoot.textContent).toContain("Entry: n=0");
  });

  it("`devtools: false` leaves `sourcesContent` out", async () => {
    const { out } = await transform(join(dir, "src/app.aktion"), files["src/app.aktion"], { devtools: false });
    expect(out!.code).not.toContain("sourcesContent");
  });

  it("appends the HMR footer in serve mode", async () => {
    const { out } = await transform(join(dir, "src/app.aktion"), files["src/app.aktion"], {}, "serve");
    expect(out!.code).toContain("import.meta.hot.accept");
  });

  it("ignores native ids, and filters ids before calling the handler", async () => {
    const plugin = aktionPlugin() as unknown as Hooks;
    expect(plugin.transform.filter.id.test("/p/app.aktion.ts?import")).toBe(true);
    expect(plugin.transform.filter.id.test("/p/app.aktion.js")).toBe(true);
    expect(plugin.transform.filter.id.test("/p/main.ts")).toBe(false);
    const { out } = await transform("/p/main.ts", "const x: number = 1");
    expect(out).toBeNull();
  });
});

describe("diagnostics point at the module that has the problem", () => {
  it("an error in a `.aktion.ts` dependency carries its file, line and column (`loc.file`)", async () => {
    const bad = write("src/bad.aktion.ts", ["export const ok = 1", "export enum Mode { A, B }"].join("\n"));
    const { ctx } = await transform(join(dir, "src/uses-bad.aktion"), 'import { ok } from "./bad.aktion.ts"\n$app(Text(String(ok)))');
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.errors[0]!.loc).toEqual({ file: bad, line: 2, column: 1 }); // the declaration starts at `export`
    expect(ctx.errors[0]!.id).toBe(bad);
    expect(ctx.errors[0]!.message).toContain("TypeScript enums are not erasable");
  });

  it("an `async` arrow is reported at the TypeScript file's position", async () => {
    const bad = write("src/async.aktion.ts", ["export const ok = 1", "export const load = async (id: string) => id"].join("\n"));
    const { ctx } = await transform(join(dir, "src/uses-async.aktion"), 'import { ok } from "./async.aktion.ts"\n$app(Text(String(ok)))');
    expect(ctx.errors[0]!.loc).toEqual({ file: bad, line: 2, column: 21 });
    expect(ctx.errors[0]!.message).toContain("`async` functions are not supported");
  });

  it("several errors are listed, each with `path:line:column`", async () => {
    const bad = write("src/many.aktion.js", ["export var a = 1", "export function f() {", "  return this", "}"].join("\n"));
    const { ctx } = await transform(join(dir, "src/uses-many.aktion"), 'import { a } from "./many.aktion.js"\n$app(Text(String(a)))');
    const lines = ctx.errors[0]!.message.split("\n");
    expect(lines).toEqual([
      `${bad}:1:8 \`var\` is not supported in Aktion modules — use \`let\` or \`const\`.`,
      `${bad}:3:10 \`this\` is always null in Aktion — there are no methods or classes; pass the value as a parameter.`,
    ]);
  });

  it("`typescript: false` refuses `.aktion.ts` modules with a clear message", async () => {
    const { ctx } = await transform(join(dir, "src/app.aktion"), files["src/app.aktion"], { typescript: false });
    expect(ctx.errors[0]!.message).toContain("`.aktion.ts` modules are disabled by the plugin option `typescript: false`.");
  });

  it("`typescript: { eraser }` swaps the eraser", async () => {
    const eraser = vi.fn((source: string) => ({ code: source.replace(/: number/g, "        "), diagnostics: [] }));
    write("src/num.aktion.ts", "export const n: number = 4");
    const { ctx, out } = await transform(join(dir, "src/uses-num.aktion"), 'import { n } from "./num.aktion.ts"\n$app(Text(String(n)))', {
      typescript: { eraser },
    });
    expect(ctx.errors).toEqual([]);
    expect(eraser).toHaveBeenCalledTimes(1);
    expect(out).not.toBeNull();
  });
});

describe("resolution between language variants", () => {
  it("refuses side-by-side variants of one module", async () => {
    write("src/twin.aktion", "export x = 1");
    write("src/twin.aktion.ts", "export const x = 1");
    const { ctx } = await transform(join(dir, "src/uses-twin.aktion"), 'import { x } from "./twin.aktion"\n$app(Text(String(x)))');
    expect(ctx.errors[0]!.message).toContain(
      '"twin.aktion" and "twin.aktion.ts" both exist — keep one (TypeScript and Vite resolve "./twin.aktion" to different files).',
    );
  });

  it("completes an extensionless specifier to `.aktion.ts`, and suggests the suffix for an exact one", async () => {
    write("src/only.aktion.ts", "export const v = 7");
    const ok = await transform(join(dir, "src/uses-only.aktion"), 'import { v } from "./only"\n$app(Text(String(v)))');
    expect(ok.ctx.errors).toEqual([]);
    const hint = await transform(join(dir, "src/uses-only2.aktion"), 'import { v } from "./only.aktion"\n$app(Text(String(v)))');
    expect(hint.ctx.errors[0]!.message).toContain('Did you mean "./only.aktion.ts"?');
  });

  it("rejects an import of a plain `.ts` file with the native-import message", async () => {
    write("src/util.ts", "export const u = 1");
    const { ctx } = await transform(join(dir, "src/uses-util.aktion"), 'import { u } from "./util.ts"\n$app(Text(String(u)))');
    expect(ctx.errors[0]!.message).toContain('"./util.ts" is not an Aktion module.');
  });
});

describe("config()", () => {
  it("excludes `.aktion.ts` from esbuild (Vite 5–7) and keeps the default `.js` exclusion", () => {
    const out = aktionViteConfig({}, undefined) as { esbuild: { exclude: RegExp[] }; optimizeDeps: { exclude: string[] } };
    expect(out.optimizeDeps.exclude).toEqual(["aktion-runtime/dsl", "aktion-runtime/dsl-globals"]);
    expect(out.esbuild.exclude.map(String)).toEqual([String(/\.js$/), String(/\.aktion\.ts(?:[?#]|$)/)]);
    expect("oxc" in out).toBe(false);
  });

  it("uses `oxc` on Vite 8, detected from `this.meta.viteVersion`", () => {
    const plugin = aktionPlugin() as unknown as Hooks;
    const out = plugin.config.call({ meta: { viteVersion: "8.3.2" } }, {}) as { oxc?: { exclude: RegExp[] }; esbuild?: unknown };
    expect(out.oxc!.exclude).toHaveLength(2);
    expect(out.esbuild).toBeUndefined();
    const vite7 = plugin.config.call({ meta: { viteVersion: "7.3.6" } }, {}) as { esbuild?: unknown };
    expect(vite7.esbuild).toBeDefined();
  });

  it("merges with the user's own `exclude` and respects `esbuild: false`", () => {
    const merged = aktionViteConfig({ esbuild: { exclude: [/vendor/] } }, 6) as { esbuild: { exclude: RegExp[] } };
    expect(merged.esbuild.exclude.map(String)).toEqual([String(/\.aktion\.ts(?:[?#]|$)/)]);
    expect("esbuild" in aktionViteConfig({ esbuild: false }, 6)).toBe(false);
  });
});
