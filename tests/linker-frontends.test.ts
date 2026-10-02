/**
 * The linker's module languages (guide §7.3, Phase 1a): frontend dispatch per
 * module, the types-only `aktion-runtime/dsl` built-ins module (E122 / E123),
 * the native-import diagnostic, `path` and `code` on every diagnostic, the
 * `modules` list, and the two Phase 0 linker fixes this feature depends on.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import {
  linkProgram,
  nativeImportMessage,
  type LinkDiagnostic,
  type ModuleResolver,
} from "../src/compiler/linker.js";
import { defaultFrontends, type ModuleFrontend } from "../src/compiler/frontend.js";
import { defineCompiledProgram, linkProject } from "../src/compiler/index.js";
import { parse } from "../src/parser/index.js";
import { cleanup, flush, renderCompiled } from "../src/testing/index.js";

afterEach(() => cleanup());

function memResolver(files: Record<string, string>): ModuleResolver & { load: ReturnType<typeof vi.fn> } {
  const norm = (importer: string, spec: string): string => {
    const dir = importer.slice(0, importer.lastIndexOf("/"));
    const out: string[] = [];
    for (const part of `${dir}/${spec}`.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return `/${out.join("/")}`;
  };
  return {
    resolve: (spec, importer) => (spec.startsWith(".") ? norm(importer, spec) : null),
    load: vi.fn((path: string) => {
      const src = files[path];
      if (src === undefined) throw new Error(`not found: ${path}`);
      return src;
    }),
  };
}

const link = (files: Record<string, string>, entry: string, frontends = defaultFrontends) =>
  linkProgram(files[entry]!, entry, memResolver(files), { frontends });

const brief = (d: LinkDiagnostic): string => `${d.code}@${d.path}:${d.line}:${d.column}`;

async function mount(files: Record<string, string>, entry: string) {
  const res = await linkProject({ entry, files });
  expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const screen = renderCompiled(
    defineCompiledProgram({ __aktionCompiled: 1, program: res.program, source: res.source, path: entry }),
  );
  await flush();
  return screen;
}

describe("frontend dispatch", () => {
  it("compiles each module with its language's frontend", () => {
    const seen: string[] = [];
    const spy = (base: ModuleFrontend): ModuleFrontend => ({
      language: base.language,
      compile(source, path) {
        seen.push(`${base.language}:${path}`);
        return base.compile(source, path);
      },
    });
    const res = link(
      {
        "/app.aktion": 'import { a } from "./a.aktion.js"\nimport { b } from "./b.aktion"\n$app(Text(a + b))',
        "/a.aktion.js": 'export const a = "A"',
        "/b.aktion": 'export b = "B"',
      },
      "/app.aktion",
      { aktion: spy(defaultFrontends.aktion!), javascript: spy(defaultFrontends.javascript!) },
    );
    expect(res.diagnostics).toEqual([]);
    expect(seen).toEqual(["aktion:/app.aktion", "javascript:/a.aktion.js", "aktion:/b.aktion"]);
    expect(res.modules.map((m) => `${m.language}:${m.path}`)).toEqual([
      "aktion:/app.aktion",
      "javascript:/a.aktion.js",
      "aktion:/b.aktion",
    ]);
  });

  it("compiles the entry through its frontend too (JS rules apply to a `.aktion.js` entry)", () => {
    const res = link({ "/app.aktion.js": 'var x = 1\n$app(Text("x"))' }, "/app.aktion.js");
    expect(res.diagnostics.map(brief)).toEqual(["E104@/app.aktion.js:1:1"]);
  });

  it("uses an injected frontend for `.aktion.ts`, and reports a missing one instead of garbage parse errors", () => {
    const files = {
      "/app.aktion": 'import { n } from "./n.aktion.ts"\n$app(Text(String(n)))',
      "/n.aktion.ts": "export const n: number = 5",
    };
    const missing = link(files, "/app.aktion");
    expect(missing.diagnostics.map((d) => d.code)).toEqual(["AKT-LINK-NO-FRONTEND"]);
    expect(missing.diagnostics[0]!.path).toBe("/n.aktion.ts");
    expect(missing.diagnostics[0]!.message).toContain("no typescript frontend is configured");

    const fakeTs: ModuleFrontend = {
      language: "typescript",
      compile: (source, path) => defaultFrontends.javascript!.compile(source.replace(": number", "        "), path),
    };
    const ok = link(files, "/app.aktion", { ...defaultFrontends, typescript: fakeTs });
    expect(ok.diagnostics).toEqual([]);
    expect(ok.modules[1]!.aktionSource).toBe("export const n         = 5");
    expect(ok.modules[1]!.originalSource).toBe("export const n: number = 5");
  });

  it("reports a throwing frontend at the module, without losing the rest of the link", () => {
    const boom: ModuleFrontend = {
      language: "javascript",
      compile: () => {
        throw new Error("kaboom");
      },
    };
    const res = link(
      { "/app.aktion": 'import { a } from "./a.aktion.js"\n$app(Text("x"))', "/a.aktion.js": "export const a = 1" },
      "/app.aktion",
      { ...defaultFrontends, javascript: boom },
    );
    expect(res.diagnostics.map((d) => d.code)).toContain("AKT-LINK-FRONTEND");
    expect(res.diagnostics.find((d) => d.code === "AKT-LINK-FRONTEND")!.message).toContain("kaboom");
  });

  it("a `.aktion` ↔ `.aktion.js` graph links, renders and shares `$state` both ways", async () => {
    const screen = await mount(
      {
        "app.aktion": [
          'import { Counter } from "./counter.aktion.js"',
          "export $count = 0",
          '$app(Column([Counter(), Text("app:" + $count)]))',
        ].join("\n"),
        "counter.aktion.js": [
          'import { $count } from "./app.aktion"',
          "export function Counter() {",
          '  return Button("js:" + $count, { onClick: () => { $count = $count + 1 } })',
          "}",
        ].join("\n"),
      },
      "app.aktion",
    );
    await screen.click("js:0");
    await flush();
    expect(screen.shadowRoot.textContent).toContain("js:1");
    expect(screen.shadowRoot.textContent).toContain("app:1");
  });
});

describe("the aktion-runtime/dsl built-ins module", () => {
  it("is never resolved or loaded, and the names resolve to the built-ins", async () => {
    const resolver = memResolver({});
    const resolve = vi.spyOn(resolver, "resolve");
    const res = linkProgram(
      'import { Button, $state } from "aktion-runtime/dsl"\n$app(Button("Go"))',
      "/app.aktion.js",
      resolver,
    );
    expect(res.diagnostics).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
    expect(res.program.statements.map((s) => s.kind)).toEqual(["ExpressionStatement"]);
    const screen = await mount(
      { "app.aktion.js": 'import { Button } from "aktion-runtime/dsl"\n$app(Button("Go"))' },
      "app.aktion.js",
    );
    expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  });

  it("E122: rejects an alias — in `.aktion` files too", () => {
    for (const entry of ["/app.aktion.js", "/app.aktion"]) {
      const res = link({ [entry]: 'import { Button as B } from "aktion-runtime/dsl"\n$app(B("x"))' }, entry);
      expect(res.diagnostics.map(brief)).toEqual([`E122@${entry}:1:1`]);
      expect(res.diagnostics[0]!.message).toBe("Import Aktion built-ins by their own name (`Button`); aliases are not supported.");
    }
  });

  it("E123: rejects importing a name the module also declares", () => {
    const res = link(
      { "/app.aktion.js": 'import { Card } from "aktion-runtime/dsl"\nfunction Card() { return null }\n$app(Card())' },
      "/app.aktion.js",
    );
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E123"]);
    expect(res.diagnostics[0]!.message).toBe("`Card` is imported from aktion-runtime/dsl and also declared here — remove one.");
  });
});

describe("imports of native code", () => {
  it("are rejected with the specified message and never read (E116 / AKT-LINK-NATIVE)", () => {
    const files = {
      "/app.aktion": 'import { x } from "./utils.ts"\n$app(Text(x))',
      "/utils.ts": "export const x: number = 1",
    };
    const resolver = memResolver(files);
    const res = linkProgram(files["/app.aktion"], "/app.aktion", resolver);
    expect(res.diagnostics.map(brief)).toEqual(["AKT-LINK-NATIVE@/app.aktion:1:1"]);
    expect(res.diagnostics[0]!.message).toBe(
      '"./utils.ts" is not an Aktion module. Aktion modules end in .aktion, .aktion.ts or .aktion.js — rename it to ' +
        "utils.aktion.ts to write it as Aktion, or keep it native and pass values in from the host (importing native " +
        "modules is not supported yet).",
    );
    expect(resolver.load).not.toHaveBeenCalledWith("/utils.ts");
  });

  it("suggests the matching Aktion suffix", () => {
    expect(nativeImportMessage("./h.js", "/src/h.js")).toContain("rename it to h.aktion.js");
    expect(nativeImportMessage("./h.mts", "/src/h.mts")).toContain("rename it to h.aktion.ts");
  });

  it("reserves `.aktion.tsx` / `.aktion.jsx` with their own message", () => {
    const res = link({ "/app.aktion": 'import { V } from "./v.aktion.tsx"\n$app(V())' }, "/app.aktion");
    expect(res.diagnostics.map((d) => d.code)).toEqual(["AKT-LINK-JSX"]);
  });

  it("links an entry with a native extension as `.aktion`, with a warning", () => {
    const res = link({ "/app.js": '$app(Text("x"))' }, "/app.js");
    expect(res.diagnostics.map((d) => `${d.code}:${d.severity}`)).toEqual(["AKT-LINK-NATIVE-ENTRY:warning"]);
    expect(res.program.statements).toHaveLength(1);
  });
});

describe("diagnostics carry `path` and `code` (8.0.1)", () => {
  it("a dependency's syntax error reports the dependency's path", () => {
    const res = link(
      { "/app.aktion": 'import { a } from "./a.aktion"\n$app(Text(a))', "/a.aktion": "export a = (" },
      "/app.aktion",
    );
    const error = res.diagnostics.find((d) => d.severity === "error")!;
    expect(error.path).toBe("/a.aktion");
    expect(error.message.startsWith("/a.aktion: ")).toBe(true);
  });

  it("unresolved imports, failed loads and missing exports have codes", () => {
    const unresolved = link({ "/app.aktion": 'import { a } from "pkg"\n$app(Text(a))' }, "/app.aktion");
    expect(unresolved.diagnostics.map(brief)).toEqual(["AKT-LINK-RESOLVE@/app.aktion:1:1"]);
    const missing = link({ "/app.aktion": 'import { a } from "./gone.aktion"\n$app(Text(a))' }, "/app.aktion");
    expect(missing.diagnostics.map((d) => d.code)).toEqual(["AKT-LINK-LOAD"]);
    const notExported = link(
      { "/app.aktion": 'import { a } from "./a.aktion"\n$app(Text(a))', "/a.aktion": "a = 1" },
      "/app.aktion",
    );
    expect(notExported.diagnostics.map((d) => d.code)).toEqual(["AKT-LINK-EXPORT"]);
  });

  it("appends the resolver's explanation to an unresolved import", () => {
    const resolver: ModuleResolver = {
      resolve: () => null,
      load: () => "",
      explain: () => "Did you mean ./x.aktion.ts?",
    };
    const res = linkProgram('import { a } from "./x.aktion"\n$app(Text(a))', "/app.aktion", resolver);
    expect(res.diagnostics[0]!.message).toBe('Cannot resolve import "./x.aktion". Did you mean ./x.aktion.ts?');
  });
});

describe("parity and Phase 0 fixes", () => {
  it("a single-file `.aktion` program still deep-equals parse(source)", () => {
    const src = '$count = 0\nfunction inc() { $count = $count + 1 }\n$app(Button("n", { onClick: inc }))';
    const res = link({ "/app.aktion": src }, "/app.aktion");
    expect(res.program).toEqual(parse(src));
    expect(res.modules).toEqual([{ path: "/app.aktion", language: "aktion", originalSource: src, aktionSource: src }]);
  });

  it("8.0.4a: a non-entry module's top-level shorthand destructuring still reads its property", async () => {
    const screen = await mount(
      {
        "app.aktion": 'import { Show } from "./show.aktion"\n$app(Show())',
        "show.aktion": [
          'data = { title: "T" }',
          "const { title } = data",
          'export function Show() { return Text("title=" + title) }',
        ].join("\n"),
      },
      "app.aktion",
    );
    expect(screen.shadowRoot.textContent).toContain("title=T");
  });
});
