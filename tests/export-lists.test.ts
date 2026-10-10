/**
 * `export { a, b as c }`, `export { x } from "…"` and `export * from "…"`:
 * parsing, linking, the runtime behaviour of what a barrel re-exports, the
 * errors, and the printer and declaration round trips. A list marks a binding
 * exactly as `export` in front of its declaration would, and a re-export links
 * its source at the position of the statement (link order is import order).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { linkProgram, linkProject, defineCompiledProgram, COMPILED_PROGRAM_VERSION } from "../src/compiler/index.js";
import type { ModuleResolver } from "../src/compiler/index.js";
import { parse } from "../src/parser/index.js";
import { formatProgram } from "../src/tooling/index.js";
import { aktionDeclarationText } from "../src/plugin/declarations.js";
import { renderCompiled, cleanup, flush } from "../src/testing/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Files = Record<string, string>;

function resolver(files: Files): ModuleResolver {
  return {
    resolve: (spec) => (spec.startsWith("./") ? `/${spec.slice(2)}` : null),
    load: (path) => {
      const source = files[path];
      if (source === undefined) throw new Error(`no such module ${path}`);
      return source;
    },
  };
}

const link = (files: Files) => linkProgram(files["/app.aktion"]!, "/app.aktion", resolver(files));
const messages = (files: Files) => link(files).diagnostics.map((d) => d.message);

function mount(files: Files) {
  const result = link(files);
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

/** Mounts the program, lets it settle, and returns the text it renders (the theme's `<style>` stripped). */
async function shown(files: Files): Promise<string> {
  const screen = mount(files);
  await screen.flush(12);
  const root = screen.shadowRoot!;
  const clone = root.cloneNode(true) as DocumentFragment;
  for (const style of clone.querySelectorAll("style")) style.remove();
  return clone.textContent ?? "";
}

describe("parsing", () => {
  it("parses a local list with aliases and `$` names", () => {
    const { statements, errors } = parse("let a = 1\nlet $b = 2\nexport { a, a as c, $b, $b as $d }");
    expect(errors).toEqual([]);
    expect(statements[2]).toMatchObject({
      kind: "ExportList",
      specifiers: [
        { local: "a", exported: "a" },
        { local: "a", exported: "c" },
        { local: "b", exported: "b", isState: true },
        { local: "b", exported: "d", isState: true },
      ],
    });
    expect(statements[2]).not.toHaveProperty("source");
  });

  it("parses re-exports, multi-line lists and a trailing comma", () => {
    const { statements, errors } = parse('export {\n  x,\n  $y as $z,\n} from "./m.aktion"\nexport * from "./n.aktion"\n');
    expect(errors).toEqual([]);
    expect(statements[0]).toMatchObject({ kind: "ExportList", source: "./m.aktion" });
    expect(statements[1]).toMatchObject({ kind: "ExportList", all: true, source: "./n.aktion", specifiers: [] });
  });

  it.each([
    ["`export * as ns` is rejected", 'export * as ns from "./m.aktion"', /namespace/i],
    ["a default export name is rejected", "export { a as default }", /named exports/i],
    ["`$` must be kept across `as`", "export { $a as b }", /keep its `\$`/],
    ["a name exported twice in one list", "export { a, b as a }", /exported twice/],
    ["a non-name entry", "export { 1 }", /export name/],
  ])("%s", (_name, source, message) => {
    expect(parse(source).errors[0]?.message).toMatch(message);
  });
});

describe("a local list", () => {
  it("exports the same atom `export let` would: reads, writes and set-once state are shared", async () => {
    const screen = mount({
      "/app.aktion": [
        'import { $n, bump, Badge } from "./lib.aktion"',
        '$app(Column([Text(`app=${$n}`), Button("app-bump", bump), Badge()]))',
      ].join("\n"),
      "/lib.aktion": [
        "let $n = 1",
        "function bump() { $n = $n + 1 }",
        "function Badge() { return Text(`badge=${$n}`) }",
        "export { $n, bump, Badge }",
      ].join("\n"),
    });
    await screen.flush(12);
    expect(screen.queryByText("app=1")).not.toBeNull();
    expect(screen.queryByText("badge=1")).not.toBeNull();
    await screen.click("app-bump");
    expect(screen.queryByText("app=2")).not.toBeNull();
    expect(screen.queryByText("badge=2")).not.toBeNull();
  });

  it("exports under an alias, and the original name stays private", async () => {
    const files = {
      "/app.aktion": 'import { shown } from "./lib.aktion"\n$app(Text(shown))',
      "/lib.aktion": 'const hidden = "ok"\nexport { hidden as shown }',
    };
    expect(await shown(files)).toContain("ok");
    expect(messages({ ...files, "/app.aktion": 'import { hidden } from "./lib.aktion"\n$app(Text(hidden))' })).toEqual([
      '"./lib.aktion" does not export `hidden`.',
    ]);
  });

  it("allows an export declared after the list", async () => {
    expect(await shown({
      "/app.aktion": 'import { later } from "./lib.aktion"\n$app(Text(later))',
      "/lib.aktion": 'export { later }\nconst later = "late"',
    })).toContain("late");
  });

  it("is a no-op in a single-file program", () => {
    const src = "let a = 1\nexport { a }\n$app(Text(`${a}`))";
    expect(link({ "/app.aktion": src }).diagnostics).toEqual([]);
  });

  it.each([
    ["an undeclared name", "export { nope }", "Cannot export `nope`: this module declares no top-level `nope`."],
    ["an undeclared atom", "export { $nope }", "Cannot export `$nope`: this module declares no top-level `$nope`."],
    ["a name in the wrong keyspace", "let $a = 1\nexport { a }", "Cannot export `a`: this module declares no top-level `a`."],
    ["a duplicate of an `export` declaration", "export let a = 1\nexport { a }", "`a` is exported more than once."],
    ["a duplicate through an alias", "let a = 1\nlet b = 2\nexport { a }\nexport { b as a }", "`a` is exported more than once."],
  ])("reports %s", (_name, lib, message) => {
    const diagnostics = link({
      "/app.aktion": 'import { z } from "./lib.aktion"\n$app(Text("x"))',
      "/lib.aktion": `${lib}\nexport let z = 0`,
    }).diagnostics;
    expect(diagnostics.map((d) => d.message)).toEqual([`/lib.aktion: ${message}`]);
    expect(diagnostics[0]).toMatchObject({ code: "AKT-LINK-EXPORT", path: "/lib.aktion", line: lib.split("\n").length });
  });

  it("says an import must be re-exported with `from`", () => {
    expect(messages({
      "/app.aktion": 'import { z } from "./lib.aktion"\n$app(Text("x"))',
      "/lib.aktion": 'import { q } from "./q.aktion"\nexport let z = q\nexport { q }',
      "/q.aktion": "export let q = 1",
    })[0]).toContain('`q` is imported, not declared in this module — re-export it with `export { q } from "…"`.');
  });
});

describe("a barrel", () => {
  const files: Files = {
    "/app.aktion": [
      'import { $count, inc, Counter, double } from "./barrel.aktion"',
      "$app(Column([Text(`app=${$count} x2=${double($count)}`), Button(\"app-inc\", inc), Counter()]))",
    ].join("\n"),
    "/barrel.aktion": [
      'export { $count, inc } from "./state.aktion"',
      'export { Counter } from "./ui.aktion"',
      'export { twice as double } from "./fn.aktion"',
    ].join("\n"),
    "/state.aktion": "export let $count = 1\nexport function inc() { $count = $count + 1 }",
    "/ui.aktion": 'import { $count } from "./state.aktion"\nexport function Counter() { return Text(`ui=${$count}`) }',
    "/fn.aktion": "export function twice(n) { return n * 2 }",
  };

  it("forwards an atom, an action, a component and an aliased function, sharing ONE atom", async () => {
    const screen = mount(files);
    await screen.flush(12);
    expect(screen.queryByText("app=1 x2=2")).not.toBeNull();
    expect(screen.queryByText("ui=1")).not.toBeNull();
    await screen.click("app-inc");
    expect(screen.queryByText("app=2 x2=4")).not.toBeNull();
    expect(screen.queryByText("ui=2")).not.toBeNull();
  });

  it("binds nothing in the barrel itself and drops the statements from the merged program", () => {
    const { program } = link(files);
    expect(JSON.stringify(program.statements)).not.toContain("ExportList");
  });

  it("forwards through a chain of barrels and `export *`", async () => {
    const chain: Files = {
      ...files,
      "/app.aktion": 'import { $count, Counter } from "./top.aktion"\n$app(Column([Text(`n=${$count}`), Counter()]))',
      "/top.aktion": 'export * from "./barrel.aktion"',
    };
    const out = await shown(chain);
    expect(out).toContain("n=1");
    expect(out).toContain("ui=1");
  });

  it("lets an explicit export shadow `export *`, and rejects a name two stars disagree on", async () => {
    const star: Files = {
      "/app.aktion": 'import { v } from "./top.aktion"\n$app(Text(v))',
      "/top.aktion": 'export * from "./a.aktion"\nexport * from "./b.aktion"',
      "/a.aktion": 'export const v = "a"',
      "/b.aktion": 'export const v = "b"',
    };
    expect(messages(star)).toEqual(['"./top.aktion" exports `v` from more than one module through `export *` — export it by name to choose one.']);
    expect(await shown({ ...star, "/top.aktion": `${star["/top.aktion"]}\nexport { v } from "./b.aktion"` })).toContain("b");
    // Both stars reach the SAME declaration: not ambiguous.
    expect(await shown({ ...star, "/b.aktion": 'export * from "./a.aktion"' })).toContain("a");
  });

  it("survives a re-export cycle", async () => {
    const cyc: Files = {
      "/app.aktion": 'import { v } from "./a.aktion"\n$app(Text(v))',
      "/a.aktion": 'export * from "./b.aktion"\nexport const v = "ok"',
      "/b.aktion": 'export * from "./a.aktion"',
    };
    expect(await shown(cyc)).toContain("ok");
    expect(messages({ ...cyc, "/app.aktion": 'import { w } from "./a.aktion"\n$app(Text("x"))' })).toEqual(['"./a.aktion" does not export `w`.']);
  });

  it("reports a re-export of a name the source lacks, even if nobody imports it", () => {
    const diagnostics = link({
      "/app.aktion": 'import { ok } from "./barrel.aktion"\n$app(Text(ok))',
      "/barrel.aktion": 'export { ok } from "./m.aktion"\nexport { missing } from "./m.aktion"\nexport { $missingAtom } from "./m.aktion"',
      "/m.aktion": 'export const ok = "ok"',
    }).diagnostics;
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, '/barrel.aktion: "./m.aktion" does not export `missing`.'],
      [3, '/barrel.aktion: "./m.aktion" does not export `$missingAtom`.'],
    ]);
  });

  it("reports an import through a barrel that lacks the name", () => {
    expect(messages({
      "/app.aktion": 'import { nope } from "./barrel.aktion"\n$app(Text("x"))',
      "/barrel.aktion": 'export * from "./m.aktion"',
      "/m.aktion": "export const ok = 1",
    })).toEqual(['"./barrel.aktion" does not export `nope`.']);
  });

  it("does not pile diagnostics on a barrel whose source is unresolvable", () => {
    expect(messages({
      "/app.aktion": 'import { a } from "./barrel.aktion"\n$app(Text("x"))',
      "/barrel.aktion": 'export { a } from "nowhere"',
    })).toEqual(['/barrel.aktion: Cannot resolve import "nowhere".']);
  });

  it("rejects re-exporting the built-in module", () => {
    expect(messages({
      "/app.aktion": 'export { $effect } from "aktion-runtime/dsl"\n$app(Text("x"))',
    })[0]).toContain("cannot be re-exported");
  });
});

describe("link order", () => {
  const A = 'console.log("a")\nexport let $a = 1';
  const B = 'console.log("b")\nexport let $b = 2';

  it("links a re-export's source at the position of the export statement", () => {
    const sources = (entry: string) =>
      link({ "/app.aktion": entry, "/a.aktion": A, "/b.aktion": B }).program.sources;
    const body = '$app(Text("x"))';
    expect(sources(`export { $a } from "./a.aktion"\nimport { $b } from "./b.aktion"\n${body}`)).toEqual(["/app.aktion", "/a.aktion", "/b.aktion"]);
    expect(sources(`import { $b } from "./b.aktion"\nexport { $a } from "./a.aktion"\n${body}`)).toEqual(["/app.aktion", "/b.aktion", "/a.aktion"]);
    expect(sources(`export * from "./b.aktion"\nexport { $a } from "./a.aktion"\n${body}`)).toEqual(["/app.aktion", "/b.aktion", "/a.aktion"]);
  });

  it("runs the top-level code of re-exported modules in that order", async () => {
    const run = async (barrel: string): Promise<string[]> => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      mount({ "/app.aktion": 'import { $a } from "./barrel.aktion"\nimport { $b } from "./b.aktion"\n$app(Text(`${$a}${$b}`))', "/barrel.aktion": barrel, "/a.aktion": A, "/b.aktion": B });
      await flush(8);
      const calls = log.mock.calls.map((call) => String(call[0]));
      log.mockRestore();
      cleanup();
      return calls;
    };
    expect(await run('export { $a } from "./a.aktion"')).toEqual(["a", "b"]);
    // The barrel is linked where it is imported (first); it pulls `b` in before `a`.
    expect(await run('export * from "./b.aktion"\nexport { $a } from "./a.aktion"')).toEqual(["b", "a"]);
  });

  it("is kept for a re-export reached through an import cycle", () => {
    const result = link({
      "/app.aktion": 'import { $a } from "./a.aktion"\n$app(Text("x"))',
      "/a.aktion": 'export { $b } from "./b.aktion"\nexport let $a = 1',
      "/b.aktion": 'import { $a } from "./a.aktion"\nexport let $b = 2',
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.dependencies).toEqual(["/b.aktion", "/a.aktion"]);
  });
});

describe("formatting and declarations", () => {
  const source = [
    'export { a, b as c, $d, $e as $f } from "./m.aktion"',
    'export * from "./n.aktion"',
    "export { g, h as i }",
    "",
  ].join("\n");

  it("prints every form back and the output parses to the same program", () => {
    const result = formatProgram(source);
    expect(result.warnings).toBeUndefined();
    const printed = result.formatted;
    expect(printed).toBe(source);
    const strip = (s: string) => JSON.stringify(parse(s).statements, (k, v) => (k === "loc" ? undefined : v));
    expect(strip(printed)).toBe(strip(source));
  });

  it("declares a listed name like an exported one, and forwards re-exports to the other declaration file", () => {
    const { text: dts } = aktionDeclarationText(
      'let $n = 1\nfunction bump() {}\nexport { $n, bump as inc }\nexport { x as y } from "./m.aktion"\nexport * from "./k.aktion"\n',
    );
    expect(dts).toContain("export declare let $n: number;");
    expect(dts).toContain("export declare function inc(");
    expect(dts).not.toContain("function bump");
    expect(aktionDeclarationText("function Card(title) { return Text(title) }\nexport { Card as Tile }").text).toContain(
      "export declare function Tile(",
    );
    expect(dts).toContain('export { x as y } from "./m.aktion";');
    expect(dts).toContain('export * from "./k.aktion";');
  });
});

describe("E108 through export chains", () => {
  const importer = (spec: string, name = "$todos") =>
    `import { ${spec} } from "./barrel.aktion"\nexport function add(t) {\n  ${name}.push(t)\n}`;
  const run = async (barrel: string, imp: string, store = "export let $todos = []") => {
    const res = await linkProject({
      entry: "app.aktion",
      files: {
        "app.aktion": 'import { add } from "./ops.aktion.js"\n$app(Button("Go", { onClick: () => add(1) }))',
        "ops.aktion.js": imp,
        "barrel.aktion": barrel,
        "store.aktion": store,
      },
    });
    return res.diagnostics.map((d) => `${d.code}@${d.path}:${d.line}:${d.column}`);
  };

  it.each([
    ["an inline export", 'export { $todos } from "./store.aktion"', importer("$todos"), "export let $todos = []"],
    ["a local list in the exporter", "export { $todos } from \"./store.aktion\"", importer("$todos"), "let $todos = []\nexport { $todos }"],
    ["an alias in a list", 'export { $todos as $items } from "./store.aktion"', importer("$items", "$items"), "export let $todos = []"],
    ["a local alias list", "let $todos = []\nexport { $todos as $items }", importer("$items", "$items"), ""],
    ["a star barrel", 'export * from "./store.aktion"', importer("$todos"), "export let $todos = []"],
    ["a chain of barrels", 'export * from "./store.aktion"', importer("$todos"), "export let $todos = []"],
  ])("flags a data atom behind %s", async (_name, barrel, imp, store) => {
    expect(await run(barrel, imp, store)).toEqual(["E108@ops.aktion.js:3:10"]);
  });

  it("stays quiet for a handle behind the same barrels", async () => {
    expect(await run('export { $todos as $items } from "./store.aktion"', importer("$items", "$items"), "export let $todos = $store({ items: [] })")).toEqual([]);
    expect(await run('export * from "./store.aktion"', importer("$todos"), "export let $todos = $store({ items: [] })")).toEqual([]);
  });
});

describe("export diagnostics", () => {
  it("names an explicit re-export cycle", () => {
    expect(messages({
      "/app.aktion": 'import { x } from "./a.aktion"\n$app(Text("x"))',
      "/a.aktion": 'export { x } from "./b.aktion"',
      "/b.aktion": 'export { x } from "./a.aktion"',
    })).toContain('"./a.aktion" re-exports `x` in a cycle of re-exports that never reaches a declaration.');
  });

  it("points at the offending specifier", () => {
    const d = link({
      "/app.aktion": 'import { ok } from "./barrel.aktion"\n$app(Text(ok))',
      "/barrel.aktion": 'export {\n  ok,\n  missing,\n} from "./m.aktion"\nexport { nope }',
      "/m.aktion": "export const ok = 1",
    }).diagnostics;
    expect(d.map((x) => `${x.line}:${x.column}`).sort()).toEqual(["3:3", "5:10"]);
  });

  it("keeps a name a failed re-export source supplies quiet, but not one it never named", () => {
    expect(messages({
      "/app.aktion": 'import { a } from "./barrel.aktion"\n$app(Text("x"))',
      "/barrel.aktion": 'export { a } from "nowhere"',
    })).toEqual(['/barrel.aktion: Cannot resolve import "nowhere".']);
    expect(messages({
      "/app.aktion": 'import { b } from "./barrel.aktion"\n$app(Text("x"))',
      "/barrel.aktion": 'export { a } from "nowhere"',
    })).toEqual(['/barrel.aktion: Cannot resolve import "nowhere".', '"./barrel.aktion" does not export `b`.']);
  });

  it("is silent about a name a failed `export *` source might hold, also through another star", () => {
    const files: Files = {
      "/app.aktion": 'import { a } from "./top.aktion"\n$app(Text("x"))',
      "/top.aktion": 'export * from "./barrel.aktion"',
      "/barrel.aktion": 'export * from "nowhere"',
    };
    expect(messages(files)).toEqual(['/barrel.aktion: Cannot resolve import "nowhere".']);
  });

  it("a failed plain import does not silence a missing re-export", () => {
    expect(messages({
      "/app.aktion": 'import { missing } from "./barrel.aktion"\n$app(Text("x"))',
      "/barrel.aktion": 'import { q } from "nowhere"\nexport { missing } from "./m.aktion"',
      "/m.aktion": "export const ok = 1",
    })).toContain('/barrel.aktion: "./m.aktion" does not export `missing`.');
  });

  it("keeps `a` and `$a` apart: one list can export both", () => {
    const files: Files = {
      "/app.aktion": 'import { a, $a } from "./lib.aktion"\n$app(Text(`${a}${$a}`))',
      "/lib.aktion": "const a = 1\nlet $a = 2\nexport { a, $a }",
    };
    expect(messages(files)).toEqual([]);
    expect(parse("export { a, $a }").errors).toEqual([]);
  });

  it("resolves a long chain of stars without exploding", () => {
    const files: Files = { "/app.aktion": 'import { v } from "./s0.aktion"\n$app(Text(v))', "/end.aktion": 'export const v = "ok"' };
    for (let i = 0; i < 30; i += 1) files[`/s${i}.aktion`] = `export * from "./s${i + 1}.aktion"\nexport * from "./s${i + 1}.aktion"`;
    files["/s30.aktion"] = 'export * from "./end.aktion"';
    expect(messages(files)).toEqual([]);
  });
});

describe("JavaScript modules and project links", () => {
  it("exports a list from a `.aktion.js` module and forwards it through a barrel", async () => {
    const files: Files = {
      "app.aktion": 'import { $n, up } from "./barrel.aktion"\n$app(Column([Text(`n=${$n}`), Button("up", up)]))',
      "barrel.aktion": 'export { $n, up } from "./state.aktion.js"',
      "state.aktion.js": "let $n = 1\nfunction up() { $n = $n + 1 }\nexport { $n, up }",
    };
    const res = await linkProject({ entry: "app.aktion", files });
    expect(res.diagnostics).toEqual([]);
    const screen = renderCompiled(
      defineCompiledProgram({ __aktionCompiled: COMPILED_PROGRAM_VERSION, program: res.program, source: res.source, path: "app.aktion" }),
    );
    await screen.flush(12);
    expect(screen.queryByText("n=1")).not.toBeNull();
    await screen.click("up");
    expect(screen.queryByText("n=2")).not.toBeNull();
  });

  it("fetches a URL module that is only re-exported", async () => {
    const res = await linkProject({
      entry: "app.aktion",
      files: { "app.aktion": 'import { v } from "./barrel.aktion"\n$app(Text(v))', "barrel.aktion": 'export { v } from "https://x.test/v.aktion"' },
      fetch: async (url: string) => {
        if (url === "https://x.test/v.aktion") return 'export const v = "remote"';
        throw new Error(`unexpected url ${url}`);
      },
    });
    expect(res.diagnostics).toEqual([]);
    expect(res.dependencies).toContain("https://x.test/v.aktion");
  });

  it("walks a re-export's source when linking a project, so a module only re-exported is still loaded", async () => {
    const res = await linkProject({
      entry: "app.aktion",
      files: {
        "app.aktion": 'import { v } from "./barrel.aktion"\n$app(Text(v))',
        "barrel.aktion": 'export * from "./deep.aktion"',
        "deep.aktion": 'export const v = "deep"',
      },
    });
    expect(res.diagnostics).toEqual([]);
    expect(res.program.sources).toEqual(["app.aktion", "deep.aktion", "barrel.aktion"]);
  });
});
