/**
 * The names the runtime injects — `params`, `route`, `outlet`, `cleanup`,
 * `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` — are declared
 * by `aktion-runtime/dsl`, and a `.aktion.ts` / `.aktion.js` module imports
 * them from there so TypeScript can see them (without the import, `tsc`
 * reports TS2304). The import used to be rejected as E112 ("reserved by the
 * Aktion runtime"), like a declaration of the same name, so no module could
 * use them with both `tsc` and Aktion passing. Importing them is accepted and
 * resolves to the runtime's binding; declaring one is still E112.
 */

import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup as unmount, flush, renderCompiled } from "../src/testing/index.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { defaultFrontends, javascriptFrontend } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

afterEach(() => unmount());

const typescript = createTypeScriptFrontend();
const frontends = { ...defaultFrontends, typescript };
const repoRoot = resolve(__dirname, "..");
const lines = (...l: string[]): string => l.join("\n");

const INJECTED = ["params", "route", "outlet", "cleanup", "setTimeout", "setInterval", "clearTimeout", "clearInterval"] as const;

/** Diagnostics of one module, as `CODE@line:column`. */
function codes(src: string, language: "js" | "ts"): string[] {
  const frontend = language === "ts" ? typescript : javascriptFrontend;
  const out = frontend.compile(src, `/src/m.aktion.${language}`);
  return [
    ...out.program.errors.map((e) => `PARSE@${e.line}:${e.column}`),
    ...out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`),
  ];
}

/** `tsc` diagnostics of `src` as a `.aktion.ts` module against the committed `src/dsl` declarations. */
function typeErrors(src: string): string[] {
  const file = resolve(repoRoot, "tests/__injected_imports_probe__.aktion.ts");
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    baseUrl: repoRoot,
    paths: { "aktion-runtime/dsl": ["src/dsl/index.d.ts"] },
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, ...rest) =>
    resolve(name) === file ? ts.createSourceFile(name, src, version, true) : getSourceFile(name, version, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => resolve(name) === file || fileExists(name);
  const program = ts.createProgram([file], options, host);
  return ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).map((d) => {
    const at = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
    return `TS${d.code}@${at}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
  });
}

async function texts(entry: string, src: string, route?: string): Promise<string[]> {
  const res = await linkProject({ entry, files: { [entry]: src }, frontends });
  expect(res.diagnostics).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
    route ? { route } : {},
  );
  for (let i = 0; i < 5; i += 1) await flush();
  // The timers the program starts fire on the next macrotask.
  await new Promise((done) => setTimeout(done, 20));
  for (let i = 0; i < 5; i += 1) await flush();
  return [...screen.shadowRoot.querySelectorAll(".rui-text")].map((el) => el.textContent ?? "");
}

/** Every injected name, imported and used where the runtime binds it. */
const PROGRAM_TS = lines(
  "import {",
  "  $app, $effect, $router, Column, Text,",
  "  params, route, outlet, cleanup, setTimeout, setInterval, clearTimeout, clearInterval,",
  "  type RouteParamsOf,",
  '} from "aktion-runtime/dsl";',
  'let $kinds = "";',
  'let $fired = "no";',
  'let $cleared = "no";',
  "$effect(() => {",
  '  $kinds = [typeof cleanup, typeof setTimeout, typeof setInterval, typeof clearTimeout, typeof clearInterval].join(",");',
  "  cleanup(() => {});",
  '  setTimeout(() => { $fired = "yes"; }, 0);',
  '  const timeout = setTimeout(() => { $cleared = "timeout fired"; }, 0);',
  "  clearTimeout(timeout);",
  '  const interval = setInterval(() => { $cleared = "interval fired"; }, 0);',
  "  clearInterval(interval);",
  '}, ["mount"]);',
  "export default $app(Column([",
  '  Text("path=" + route.path),',
  "  $router({",
  '    "/users/:id": Text("user=" + (params as RouteParamsOf<"/users/:id">).id),',
  '    "/": { layout: Column([Text("layout"), outlet]), routes: { "/": Text("child") } },',
  "  }),",
  "  Text($kinds),",
  "  Text($fired),",
  "  Text($cleared),",
  "]));",
);

/** The same program as `.aktion.js` (no type import, no cast). */
const PROGRAM_JS = PROGRAM_TS.replace("  type RouteParamsOf,\n", "").replace(' as RouteParamsOf<"/users/:id">', "");

describe("importing an injected name from aktion-runtime/dsl", () => {
  for (const name of INJECTED) {
    it(`\`${name}\` is accepted in .aktion.ts and .aktion.js`, () => {
      const module = lines(`import { ${name} } from "aktion-runtime/dsl"`, `export const used = ${name}`);
      expect(codes(module, "ts")).toEqual([]);
      expect(codes(module, "js")).toEqual([]);
    });
  }

  it("the .aktion.ts program type-checks against the DSL declarations", () => {
    expect(typeErrors(PROGRAM_TS)).toEqual([]);
  }, 60_000);

  it("without the import, tsc cannot see the names (control)", () => {
    const missing = PROGRAM_TS.replace(
      "  params, route, outlet, cleanup, setTimeout, setInterval, clearTimeout, clearInterval,\n",
      "",
    );
    // TS2304 "Cannot find name", or TS2552 when tsc also suggests a near-miss.
    const errors = typeErrors(missing).filter((e) => e.startsWith("TS2304") || e.startsWith("TS2552"));
    // `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` are also DOM globals.
    for (const name of ["params", "route", "outlet", "cleanup"]) {
      expect(errors.some((e) => e.includes(`'${name}'`)), name).toBe(true);
    }
  }, 60_000);

  it("they resolve to the runtime's bindings: params in a $router arm, cleanup in an $effect, the timers, route, outlet", async () => {
    const kinds = "function,function,function,function,function";
    expect(await texts("app.aktion.ts", PROGRAM_TS, "/users/42")).toEqual(["path=/users/42", "user=42", kinds, "yes", "no"]);
    unmount();
    expect(await texts("app.aktion.ts", PROGRAM_TS)).toEqual(["path=/", "layout", "child", kinds, "yes", "no"]);
    unmount();
    expect(await texts("app.aktion.js", PROGRAM_JS, "/users/42")).toEqual(["path=/users/42", "user=42", kinds, "yes", "no"]);
    unmount();
    expect(await texts("app.aktion.js", PROGRAM_JS)).toEqual(["path=/", "layout", "child", kinds, "yes", "no"]);
  });

  it("a cleanup registered through the imported name runs when the program is torn down", async () => {
    const src = lines(
      'import { $app, $effect, Text, cleanup } from "aktion-runtime/dsl";',
      "$effect(() => {",
      "  cleanup(() => { (window as unknown as { __injectedCleanup: number }).__injectedCleanup += 1; });",
      '}, ["mount"]);',
      'export default $app(Text("x"));',
    );
    const counter = window as unknown as { __injectedCleanup?: number };
    counter.__injectedCleanup = 0;
    await texts("app.aktion.ts", src);
    expect(counter.__injectedCleanup).toBe(0);
    unmount();
    expect(counter.__injectedCleanup).toBe(1);
    delete counter.__injectedCleanup;
  });
});

describe("declaring an injected name is still E112", () => {
  it("in .aktion.ts and .aktion.js", () => {
    const src = lines(
      "const params = 1",
      "let route = 2",
      "const outlet = 3",
      "function cleanup() {}",
      "const setTimeout = 4",
      "function setInterval() {}",
      "const clearTimeout = 5",
      "const clearInterval = 6",
    );
    const expected = ["E112@1:1", "E112@2:1", "E112@3:1", "E112@4:1", "E112@5:1", "E112@6:1", "E112@7:1", "E112@8:1"];
    expect(codes(src, "ts")).toEqual(expected);
    expect(codes(src, "js")).toEqual(expected);
  });

  it("an import from a user module is a user binding: E112", () => {
    expect(codes('import { params } from "./routes.aktion.ts"', "ts")).toEqual(["E112@1:1"]);
  });
});
