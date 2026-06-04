/**
 * Module linker: graph resolution, true module scoping (per-module renaming),
 * import-alias rewriting, shared `$state`, diagnostics, cycles, effect
 * de-collision, and single-file no-op parity — all with an in-memory resolver.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { linkProgram, type ModuleResolver } from "../src/compiler/linker.js";
import { defineCompiledProgram } from "../src/compiler/runtime.js";
import { parse } from "../src/parser/index.js";
import type { Statement } from "../src/parser/types.js";

/** In-memory resolver: relative specifiers normalized against the importer dir. */
function memResolver(files: Record<string, string>): ModuleResolver {
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
    load: (path) => {
      const src = files[path];
      if (src === undefined) throw new Error(`not found: ${path}`);
      return src;
    },
  };
}

const link = (files: Record<string, string>, entry = "/app.aktion") =>
  linkProgram(files[entry]!, entry, memResolver(files));

const asgn = (stmts: readonly Statement[], id: string) =>
  stmts.find((s): s is Extract<Statement, { kind: "Assignment" }> => s.kind === "Assignment" && s.identifier === id);
const compNames = (stmts: readonly Statement[]) =>
  stmts.filter((s) => s.kind === "ComponentDeclaration").map((s) => (s as { name: string }).name);

describe("linker: basic import + rename", () => {
  it("merges an imported component, renames it privately, and rewrites the entry call", () => {
    const { program, diagnostics, dependencies } = link({
      "/app.aktion": `import { Counter } from "./counter.aktion"\naktion = Counter()`,
      "/counter.aktion": `export function Counter() { return Text("hi") }`,
    });
    expect(diagnostics).toEqual([]);
    expect(dependencies).toEqual(["/counter.aktion"]);
    // Imported module is id 1 → its component is renamed.
    expect(compNames(program.statements)).toContain("__a1_Counter");
    // The entry keeps `aktion`, and its `Counter()` call is rewritten.
    expect(asgn(program.statements, "aktion")?.expression).toMatchObject({ kind: "Call", callee: "__a1_Counter" });
  });

  it("keeps the entry's own names canonical (serializeState/applyDelta targets)", () => {
    const { program } = link({
      "/app.aktion": `$count = 0\nimport { Inc } from "./inc.aktion"\naktion = Text(\`n=\${$count}\`)`,
      "/inc.aktion": `export function Inc() { return Text("inc") }`,
    });
    // Entry's own `$count` is NOT renamed.
    expect(asgn(program.statements, "count")?.isState).toBe(true);
  });
});

describe("linker: true module scope", () => {
  it("lets two modules reuse a private name without clashing", () => {
    const { program, diagnostics } = link({
      "/app.aktion": `import { A } from "./a.aktion"\nimport { B } from "./b.aktion"\naktion = Row([A(), B()])`,
      "/a.aktion": `label = "a"\nexport function A() { return Text(label) }`,
      "/b.aktion": `label = "b"\nexport function B() { return Text(label) }`,
    });
    expect(diagnostics).toEqual([]);
    // Each module's private `label` is renamed under its own module id.
    const labels = program.statements
      .filter((s) => s.kind === "Assignment" && /_label$/.test((s as { identifier: string }).identifier))
      .map((s) => (s as { identifier: string }).identifier);
    expect(new Set(labels).size).toBe(2); // distinct (__a1_label, __a2_label)
  });

  it("shares a single atom for an imported `$state`", () => {
    const { program, diagnostics } = link({
      "/app.aktion": `import { $count } from "./store.aktion"\naktion = Text(\`n=\${$count}\`)`,
      "/store.aktion": `export $count = 0`,
    });
    expect(diagnostics).toEqual([]);
    // store ($count) renamed to __a1_count; the entry's `$count` references rewrite to the same name.
    expect(asgn(program.statements, "__a1_count")?.isState).toBe(true);
    const entryAktion = asgn(program.statements, "aktion");
    const templateExpr = (entryAktion?.expression as { arguments: { expressions: { name: string }[] }[] }).arguments[0];
    expect(templateExpr.expressions[0]?.name).toBe("__a1_count");
  });
});

describe("linker: diagnostics", () => {
  it("reports importing a name the module does not export", () => {
    const { diagnostics } = link({
      "/app.aktion": `import { Missing } from "./m.aktion"\naktion = Text("x")`,
      "/m.aktion": `export function Present() { return Text("p") }`,
    });
    expect(diagnostics.some((d) => /does not export `Missing`/.test(d.message))).toBe(true);
  });

  it("reports an unresolved import path", () => {
    const { diagnostics } = link({ "/app.aktion": `import { X } from "nonrelative"\naktion = Text("x")` });
    expect(diagnostics.some((d) => /Cannot resolve import/.test(d.message))).toBe(true);
  });

  it("reports a failed module load", () => {
    const { diagnostics } = link({ "/app.aktion": `import { X } from "./missing.aktion"\naktion = Text("x")` });
    expect(diagnostics.some((d) => /Failed to load/.test(d.message))).toBe(true);
  });
});

describe("linker: graph edge cases", () => {
  it("tolerates import cycles (load once, merge once)", () => {
    const { program, diagnostics } = link({
      "/app.aktion": `import { B } from "./b.aktion"\nexport function A() { return Text("a") }\naktion = B()`,
      "/b.aktion": `import { A } from "./app.aktion"\nexport function B() { return A() }`,
    });
    expect(diagnostics).toEqual([]);
    // Both modules merged exactly once; no duplicate B / infinite loop.
    expect(compNames(program.statements).filter((n) => /_B$/.test(n))).toHaveLength(1);
  });

  it("de-collides effects declared at the same position in different files", () => {
    const { program } = link({
      "/app.aktion": `import { setup } from "./a.aktion"\n$effect(() => { setup() }, ["mount"])\naktion = Text("x")`,
      "/a.aktion": `export function setup() {}\n$effect(() => {}, ["mount"])`,
    });
    const effectNames = program.statements.filter((s) => s.kind === "EffectDeclaration").map((s) => (s as { name: string }).name);
    expect(new Set(effectNames).size).toBe(effectNames.length); // all unique
  });
});

describe("linker: single-file parity preserved", () => {
  it("an import-free program links to itself (program === parse)", () => {
    const source = `$count = 0\nfunction Inc() { $count = $count + 1 }\naktion = Card([CardHeader("Hi")])`;
    const { program, diagnostics, dependencies } = link({ "/app.aktion": source });
    expect(diagnostics).toEqual([]);
    expect(dependencies).toEqual([]);
    expect(program).toEqual(parse(source));
  });
});

describe("multi-file end-to-end render", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts a linked 2-file graph and renders the imported component", async () => {
    const files = {
      "/app.aktion": `import { Greeting } from "./greeting.aktion"\naktion = Greeting()`,
      "/greeting.aktion": `export function Greeting() { return Card([CardHeader("FromModule")]) }`,
    };
    const result = link(files);
    expect(result.diagnostics).toEqual([]);

    const el = document.createElement("aktion-app") as HTMLElement & {
      mountCompiled(c: unknown): void;
    };
    document.body.appendChild(el);
    el.mountCompiled(
      defineCompiledProgram({ __aktionCompiled: 1, program: result.program, source: files["/app.aktion"], path: "/app.aktion" }),
    );
    await new Promise<void>((r) => queueMicrotask(() => r()));
    await new Promise<void>((r) => queueMicrotask(() => r()));
    expect(el.shadowRoot!.querySelector(".rui-card-title")?.textContent).toBe("FromModule");
  });
});
