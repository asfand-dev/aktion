/**
 * Errors thrown by a program carry the `.aktion` file, line and column, and
 * every error the runtime used to only log reaches `element.errorHook`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import { getAktionErrorInfo, type AktionElementErrorInfo, type ComponentSpec } from "../src/index.js";
import { render } from "../src/testing/index.js";
import { linkProgram, type ModuleResolver } from "../src/compiler/linker.js";
import { COMPILED_PROGRAM_VERSION, compileLite, defineCompiledProgram } from "../src/compiler/runtime.js";
import { linkProject } from "../src/compiler/index.js";
import { defaultFrontends } from "../src/compiler/frontend.js";
import { createTypeScriptFrontend } from "../src/plugin/typescript.js";

type App = HTMLElement & {
  setResponse(text: string): void;
  mountCompiled(compiled: ReturnType<typeof defineCompiledProgram>): void;
  registerComponents(components: ComponentSpec[], rootName?: string): void;
  errorHook: ((info: AktionElementErrorInfo) => void) | null;
};

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await flush();
};
const later = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function create(): App {
  const el = document.createElement("aktion-app") as App;
  document.body.appendChild(el);
  return el;
}

function resolverOf(files: Record<string, string>): ModuleResolver {
  return {
    resolve: (spec, importer) => `/${importer.slice(1, importer.lastIndexOf("/") + 1)}${spec.replace(/^\.\//, "")}`,
    load: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`not found: ${path}`);
      return text;
    },
  };
}

function link(files: Record<string, string>, entry: string, withSources = true) {
  const result = linkProgram(files[entry]!, entry, resolverOf(files));
  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program: result.program,
    source: files[entry]!,
    path: entry,
    ...(withSources ? { sourcesContent: result.modules.map((m) => m.originalSource) } : {}),
  });
}

const click = async (el: App, label: string): Promise<void> => {
  const btn = [...(el.shadowRoot?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.includes(label));
  (btn as HTMLButtonElement).click();
  await settle();
};

let reports: AktionElementErrorInfo[];
let el: App;

beforeEach(() => {
  reports = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function mount(text: string): App {
  el = create();
  el.errorHook = (info) => reports.push(info);
  el.setResponse(text);
  return el;
}

describe("error locations", () => {
  it("names the imported module, line and column of a throw in a linked graph, and the call chain", async () => {
    const compiled = link(
      {
        "/app/main.aktion": [
          'import { outer } from "./lib.aktion"',
          "function go() {",
          "  outer()",
          "}",
          '$app(Button("Go", { onClick: go }))',
        ].join("\n"),
        "/app/lib.aktion": [
          "function inner() {",
          '  throw new Error("deep")',
          "}",
          "export function outer() {",
          "  inner()",
          "}",
        ].join("\n"),
      },
      "/app/main.aktion",
    );
    el = create();
    el.errorHook = (info) => reports.push(info);
    el.mountCompiled(compiled);
    await settle();
    await click(el, "Go");

    expect(reports).toHaveLength(1);
    const [report] = reports;
    expect(report!.location).toMatchObject({ file: "/app/lib.aktion", line: 2, column: 3 });
    expect(report!.frames.map((f) => `${f.file}:${f.line}:${f.function}`)).toEqual([
      "/app/lib.aktion:1:inner",
      "/app/lib.aktion:4:outer",
      "/app/main.aktion:2:go",
    ]);
    expect(getAktionErrorInfo(report!.error)).toEqual({ location: report!.location, frames: report!.frames });
    expect(report!.sourceText("/app/lib.aktion")).toContain('throw new Error("deep")');
  });

  it("names the entry path and line of a single-module program", async () => {
    mount(
      ['function boom() {', '  throw new Error("x")', "}", '$app(Button("Go", { onClick: boom }))'].join("\n"),
    );
    await settle();
    await click(el, "Go");
    expect(reports).toHaveLength(1);
    expect(reports[0]!.location).toMatchObject({ line: 2, column: 3 });
    expect(reports[0]!.kind).toBe("action");
  });

  it("carries the position of a thrown primitive in the payload", async () => {
    mount(['function boom() {', '  throw "kaboom"', "}", '$app(Button("Go", { onClick: boom }))'].join("\n"));
    await settle();
    await click(el, "Go");
    expect(reports).toHaveLength(1);
    expect(reports[0]!.error).toBe("kaboom");
    expect(reports[0]!.location).toMatchObject({ line: 2 });
  });

  it("leaves no enumerable property on the error", async () => {
    mount(['function boom() {', '  throw new Error("x")', "}", '$app(Button("Go", { onClick: boom }))'].join("\n"));
    await settle();
    await click(el, "Go");
    expect(Object.keys(reports[0]!.error as object)).toEqual([]);
    expect(JSON.stringify(reports[0]!.error)).toBe("{}");
  });

  it("gives sourceText undefined when the build dropped the sources", async () => {
    const compiled = link(
      { "/app/main.aktion": 'function boom() {\n  throw new Error("x")\n}\n$app(Button("Go", { onClick: boom }))' },
      "/app/main.aktion",
      false,
    );
    el = create();
    el.errorHook = (info) => reports.push(info);
    el.mountCompiled(compiled);
    await settle();
    await click(el, "Go");
    expect(reports[0]!.sourceText("/app/main.aktion")).toBeUndefined();
  });
});

describe("every swallowed catch reaches element.errorHook once", () => {
  const cases: Array<{ name: string; kind: string; program: string; act?: string; wait?: number }> = [
    {
      name: "a library component that throws while rendering",
      kind: "render",
      program: '$app(Thrower("x"))',
    },
    {
      name: "an effect body",
      kind: "effect",
      program: ['$n = 0', '$effect(() => {', '  throw new Error("fx")', "}, [$n])", '$app(Text("x"))'].join("\n"),
    },
    {
      name: "a top-level statement",
      kind: "top-level",
      program: ['throw new Error("top")', '$app(Text("x"))'].join("\n"),
    },
    {
      name: "a method call",
      kind: "action",
      program: [
        "function boom() {",
        "  [1, 2].map(() => { throw new Error(\"m\") })",
        "}",
        '$app(Button("Go", { onClick: boom }))',
      ].join("\n"),
      act: "Go",
    },
    {
      name: "a timer callback",
      kind: "action",
      program: [
        "function boom() {",
        '  setTimeout(() => { throw new Error("t") }, 0)',
        "}",
        '$app(Button("Go", { onClick: boom }))',
      ].join("\n"),
      act: "Go",
      wait: 30,
    },
  ];

  it.each(cases)("$name", async ({ kind, program, act, wait }) => {
    mount(program);
    el.registerComponents([{
      name: "Thrower",
      description: "Test-only component that throws.",
      props: [{ name: "label", type: "string", optional: true }],
      render: () => { throw new Error("render boom"); },
    }]);
    await settle();
    if (act) await click(el, act);
    if (wait) await later(wait);
    expect(reports.filter((r) => r.kind === kind)).toHaveLength(1);
    expect(reports).toHaveLength(1);
  });

  it("an $query onDone callback", async () => {
    const screen = render(
      [
        '$list = $query({ url: "/api/items" })',
        '$list.onDone = () => { throw new Error("cb") }',
        '$app(Text("x"))',
      ].join("\n"),
      { fetch: () => ({ json: { ok: true } }) },
    );
    (screen.container as unknown as App).errorHook = (info) => reports.push(info);
    await later(40);
    expect(reports.filter((r) => r.kind === "http-callback")).toHaveLength(1);
    expect(reports).toHaveLength(1);
  });

  it("still calls $util.onError with the old fields, plus the position", async () => {
    mount(
      [
        '$seen = ""',
        '$util.onError(info => { $seen = info.source + "@" + info.location.line })',
        "function boom() {",
        '  throw new Error("x")',
        "}",
        '$app(Column([Button("Go", { onClick: boom }), Text($seen)]))',
      ].join("\n"),
    );
    await settle();
    await click(el, "Go");
    expect(el.shadowRoot?.textContent).toContain("boom@4");
    expect(reports).toHaveLength(1);
  });

  it("does not fail when no hook is set", async () => {
    el = create();
    el.setResponse(['function boom() {', '  throw new Error("x")', "}", '$app(Button("Go", { onClick: boom }))'].join("\n"));
    await settle();
    await click(el, "Go");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("ErrorBoundary", () => {
  it("hands onError the original error, and the hook sees it once", async () => {
    const received: unknown[] = [];
    (globalThis as { __got?: unknown[] }).__got = received;
    mount(
      [
        'function Bad() {',
        '  throw new Error("original message")',
        "}",
        '$app(ErrorBoundary([Bad()], null, e => __got.push(e)))',
      ].join("\n"),
    );
    await settle();
    delete (globalThis as { __got?: unknown[] }).__got;
    expect(received).toHaveLength(1);
    expect((received[0] as Error).message).toBe("original message");
    expect(reports.filter((r) => r.error === received[0])).toHaveLength(1);
    expect(reports[0]!.location).toMatchObject({ line: 2 });
  });

  it("hands onError the original error of a library component the renderer already swallowed", async () => {
    const received: unknown[] = [];
    (globalThis as { __got?: unknown[] }).__got = received;
    mount('$app(ErrorBoundary([Thrower("x")], null, e => __got.push(e)))');
    el.registerComponents([{
      name: "Thrower",
      description: "Test-only component that throws.",
      props: [{ name: "label", type: "string", optional: true }],
      render: () => { throw new Error("render boom"); },
    }]);
    await settle();
    delete (globalThis as { __got?: unknown[] }).__got;
    expect(received).toHaveLength(1);
    expect((received[0] as Error).message).toBe("render boom");
    expect(reports).toHaveLength(1);
  });

  it("a nested boundary consumes the failure; the outer one does not fire", async () => {
    const calls: string[] = [];
    (globalThis as { __seen?: string[] }).__seen = calls;
    mount(
      [
        'function Bad() {',
        '  throw new Error("nested")',
        "}",
        '$app(ErrorBoundary([ErrorBoundary([Bad()], null, e => __seen.push("inner:" + e.message))], null, e => __seen.push("outer")))',
      ].join("\n"),
    );
    await settle();
    expect(calls).toEqual(["inner:nested"]);
    delete (globalThis as { __seen?: string[] }).__seen;
  });
});

describe("error event", () => {
  it("names the module file of a parse error", async () => {
    const seen: Array<{ errors: Array<{ file?: string; line: number }> }> = [];
    el = create();
    el.addEventListener("error", (e) => seen.push((e as CustomEvent).detail));
    el.mountCompiled(compileLite("$app(", { path: "app/bad.aktion" }));
    await settle();
    const errors = seen.flatMap((d) => d.errors);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.file === "app/bad.aktion")).toBe(true);
  });
});

describe("a TypeScript module", () => {
  it("reports the line and column of the text the author wrote", async () => {
    const files = {
      "app.aktion.ts": [
        'import { $app, Button } from "aktion-runtime/dsl"',
        "export function boom(n: number): number {",
        '  throw new Error("ts " + n)',
        "}",
        'export default $app(Button("Go", { onClick: () => { boom(1) } }))',
      ].join("\n"),
    };
    const res = await linkProject({
      entry: "app.aktion.ts",
      files,
      frontends: { ...defaultFrontends, typescript: createTypeScriptFrontend() },
    });
    expect(res.diagnostics).toEqual([]);
    el = create();
    el.errorHook = (info) => reports.push(info);
    el.mountCompiled(
      defineCompiledProgram({
        __aktionCompiled: COMPILED_PROGRAM_VERSION,
        program: res.program,
        source: res.source,
        path: "app.aktion.ts",
      }),
    );
    await settle();
    await click(el, "Go");
    expect(reports).toHaveLength(1);
    expect(reports[0]!.location).toMatchObject({ file: "app.aktion.ts", line: 3, column: 3 });
  });
});
