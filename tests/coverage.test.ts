import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, renderCompiled, cleanup, coverage } from "../src/testing/index.js";
import { linkProgram, defineCompiledProgram, COMPILED_PROGRAM_VERSION } from "../src/compiler/index.js";
import type { ModuleResolver } from "../src/compiler/index.js";
import { parse } from "../src/parser/index.js";

/** Link an in-memory multi-file project the way the Vite plugin does. */
function link(files: Record<string, string>, entry: string) {
  const resolver: ModuleResolver = {
    resolve(spec, importer) {
      // Only relative specifiers matter for these fixtures.
      const dir = importer.slice(0, importer.lastIndexOf("/"));
      return spec.startsWith("./") ? `${dir}/${spec.slice(2)}` : spec;
    },
    load(path) {
      const source = files[path];
      if (source === undefined) throw new Error(`no such module ${path}`);
      return source;
    },
  };
  const result = linkProgram(files[entry]!, entry, resolver);
  expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program: result.program,
    source: files[entry]!,
    path: entry,
  });
}

beforeEach(() => {
  coverage.reset();
  coverage.start();
});

afterEach(() => {
  cleanup();
  coverage.stop();
  coverage.reset();
});

describe("DSL coverage — the basics", () => {
  it("records nothing while disabled", async () => {
    coverage.stop();
    coverage.reset();
    const screen = render(`$app(Text("hi"))`);
    await screen.flush();
    expect(coverage.report().files).toEqual([]);
  });

  it("reports lines for a program mounted from a string", async () => {
    const screen = render(`$app(Text("hi"))`);
    await screen.flush();

    const report = coverage.report();
    expect(report.files).toHaveLength(1);
    expect(report.summary.lines.total).toBeGreaterThan(0);
    expect(report.summary.lines.covered).toBe(report.summary.lines.total);
    expect(report.summary.lines.pct).toBe(100);
  });

  it("counts an unexecuted branch of a program as uncovered", async () => {
    const source = [
      "$on = false",
      "function Shown() {",
      '  return Text("yes")',
      "}",
      "function Hidden() {",
      '  return Text("no")',
      "}",
      "$app(Stack([$on ? Hidden() : Shown()]))",
    ].join("\n");
    const screen = render(source);
    await screen.flush();

    const file = coverage.report().files[0]!;
    // `Hidden`'s body (line 6) never ran; `Shown`'s (line 3) did.
    expect(file.uncoveredLines).toContain(6);
    expect(file.uncoveredLines).not.toContain(3);
    expect(file.summary.lines.pct).toBeLessThan(100);
  });

  it("accumulates across renders instead of resetting", async () => {
    const source = [
      "$flag = false",
      "function A() {",
      '  return Text("a")',
      "}",
      "function B() {",
      '  return Text("b")',
      "}",
      "$app(Stack([$flag ? B() : A()]))",
    ].join("\n");

    const first = render(source);
    await first.flush();
    expect(coverage.report().files[0]!.uncoveredLines).toContain(6);

    // A second mount that takes the other branch fills the hole rather than
    // starting a fresh measurement.
    const second = render(source, { state: { flag: true } });
    await second.flush();
    const file = coverage.report().files[0]!;
    expect(file.uncoveredLines).not.toContain(6);
    expect(file.uncoveredLines).not.toContain(3);
  });
});

describe("DSL coverage — functions", () => {
  it("marks a lambda covered only once it is called", async () => {
    const screen = render(
      [
        "$hits = 0",
        '$app(Button("Go", { onClick: () => $hits = $hits + 1 }))',
      ].join("\n"),
    );
    await screen.flush();

    const lambdaBefore = coverage.report().files[0]!.functions.find((f) => f.line === 2);
    expect(lambdaBefore?.hits).toBe(0);

    await screen.click("Go");
    const lambdaAfter = coverage.report().files[0]!.functions.find((f) => f.line === 2);
    expect(lambdaAfter?.hits).toBeGreaterThan(0);
    expect(screen.state.get("hits")).toBe(1);
  });

  it("names declared components and actions", async () => {
    const screen = render(
      [
        "function bump() {",
        "  $n = 1",
        "}",
        "function Panel() {",
        '  return Text("panel")',
        "}",
        "$n = 0",
        "$app(Panel())",
      ].join("\n"),
    );
    await screen.flush();

    const names = coverage.report().files[0]!.functions.map((f) => f.name);
    expect(names).toContain("Panel");
    expect(names).toContain("bump");

    const bump = coverage.report().files[0]!.functions.find((f) => f.name === "bump")!;
    expect(bump.hits).toBe(0); // declared, never invoked
  });

  it("counts an effect body as a function", async () => {
    const screen = render(
      ["$n = 0", "$effect(() => { $n = 5 }, [])", "$app(Text(`${$n}`))"].join("\n"),
    );
    await screen.flush();
    const effect = coverage.report().files[0]!.functions.find((f) => f.name === "effect");
    expect(effect?.hits).toBeGreaterThan(0);
    expect(screen.state.get("n")).toBe(5);
  });
});

describe("DSL coverage — branches", () => {
  it("records both arms of an `if` only when both run", async () => {
    const source = [
      "$flag = false",
      "let label = \"\"",
      "if ($flag) {",
      '  label = "on"',
      "} else {",
      '  label = "off"',
      "}",
      "$app(Text(label))",
    ].join("\n");

    const screen = render(source);
    await screen.flush();
    const first = coverage.report().files[0]!.branches.find((b) => b.kind === "if")!;
    expect(first.arms[0]).toBe(0); // consequent never taken
    expect(first.arms[1]).toBeGreaterThan(0);

    const second = render(source, { state: { flag: true } });
    await second.flush();
    const both = coverage.report().files[0]!.branches.find((b) => b.kind === "if")!;
    expect(both.arms[0]).toBeGreaterThan(0);
    expect(both.arms[1]).toBeGreaterThan(0);
  });

  it("records a short-circuited `&&` as one arm", async () => {
    const screen = render(['$ready = false', '$app(Text($ready && "loaded" || "waiting"))'].join("\n"));
    await screen.flush();

    const logical = coverage.report().files[0]!.branches.filter((b) => b.kind === "logical");
    expect(logical.length).toBeGreaterThan(0);
    // The `&&` stopped at its left operand, so its right-hand arm is untaken.
    const andBranch = logical.find((b) => b.arms[0]! > 0 && b.arms[1] === 0);
    expect(andBranch).toBeDefined();
  });

  it("positions a ternary branch at its `?`", async () => {
    const screen = render(['$on = true', '$app(Text($on ? "y" : "n"))'].join("\n"));
    await screen.flush();
    const ternary = coverage.report().files[0]!.branches.find((b) => b.kind === "ternary")!;
    expect(ternary.line).toBe(2);
    expect(ternary.arms).toEqual([1, 0]);
  });

  it("credits only the switch case that matched", async () => {
    const screen = render(
      [
        "function label(n) {",
        "  switch (n) {",
        '    case 1: return "one"',
        '    case 2: return "two"',
        '    default: return "many"',
        "  }",
        "}",
        "$app(Text(label(2)))",
      ].join("\n"),
    );
    await screen.flush();
    const branch = coverage.report().files[0]!.branches.find((b) => b.kind === "switch")!;
    expect(branch.arms).toHaveLength(3);
    expect(branch.arms[1]).toBeGreaterThan(0);
    expect(branch.arms[0]).toBe(0);
    expect(branch.arms[2]).toBe(0);
  });
});

describe("DSL coverage — multi-file attribution", () => {
  const files = {
    "/p/app.aktion": [
      'import { Panel } from "./panel.aktion"',
      "$app(Panel())",
    ].join("\n"),
    "/p/panel.aktion": [
      "export function Panel() {",
      '  return Text(helper())',
      "}",
      "function helper() {",
      '  return "hello"',
      "}",
      "function unused() {",
      '  return "never"',
      "}",
    ].join("\n"),
  };

  it("attributes hits to the file each node was authored in", async () => {
    const screen = renderCompiled(link(files, "/p/app.aktion"));
    await screen.flush();
    expect(screen.getByText("hello")).toBeDefined();

    const report = coverage.report();
    expect(report.files.map((f) => f.path).sort()).toEqual(["/p/app.aktion", "/p/panel.aktion"]);

    const panel = report.files.find((f) => f.path === "/p/panel.aktion")!;
    // `unused` is declared on line 7 and never called, so its body (line 8) is
    // the hole — and it is reported against panel.aktion, not the entry.
    expect(panel.uncoveredLines).toContain(8);
    expect(panel.functions.find((f) => f.name === "unused")!.hits).toBe(0);
    expect(panel.functions.find((f) => f.name === "Panel")!.hits).toBeGreaterThan(0);

    const entry = report.files.find((f) => f.path === "/p/app.aktion")!;
    expect(entry.summary.lines.pct).toBe(100);
  });

  it("does not double-count when the same program is mounted twice", async () => {
    const compiled = link(files, "/p/app.aktion");
    const first = renderCompiled(compiled);
    await first.flush();
    const afterOne = coverage.report().files.find((f) => f.path === "/p/panel.aktion")!;

    const second = renderCompiled(compiled);
    await second.flush();
    const afterTwo = coverage.report().files.find((f) => f.path === "/p/panel.aktion")!;

    expect(afterTwo.summary.lines.total).toBe(afterOne.summary.lines.total);
    expect(afterTwo.summary.functions.total).toBe(afterOne.summary.functions.total);
  });
});

describe("coverage reporting", () => {
  it("merges shards by adding hits and unioning denominators", () => {
    const shardA = {
      version: 1 as const,
      files: [
        {
          path: "/p/a.aktion",
          lines: { 1: 2, 2: 0 },
          uncoveredLines: [2],
          functions: [{ name: "f", line: 1, column: 1, hits: 1 }],
          branches: [{ kind: "if" as const, line: 1, column: 1, arms: [1, 0] }],
          summary: {
            lines: { covered: 1, total: 2, pct: 50 },
            functions: { covered: 1, total: 1, pct: 100 },
            branches: { covered: 1, total: 2, pct: 50 },
          },
        },
      ],
      summary: {
        lines: { covered: 1, total: 2, pct: 50 },
        functions: { covered: 1, total: 1, pct: 100 },
        branches: { covered: 1, total: 2, pct: 50 },
      },
    };
    const shardB = structuredClone(shardA);
    shardB.files[0]!.lines = { 1: 0, 2: 3 };
    shardB.files[0]!.branches[0]!.arms = [0, 4];

    const merged = coverage.merge([shardA, shardB]);
    const file = merged.files[0]!;
    expect(file.lines).toEqual({ 1: 2, 2: 3 });
    expect(file.uncoveredLines).toEqual([]);
    expect(file.summary.lines.pct).toBe(100);
    expect(file.branches[0]!.arms).toEqual([1, 4]);
    expect(file.summary.branches.pct).toBe(100);
  });

  it("merging does not disturb the live session", async () => {
    const screen = render(`$app(Text("live"))`);
    await screen.flush();
    const before = coverage.report();
    coverage.merge([before]);
    expect(coverage.report()).toEqual(before);
  });

  it("emits lcov with per-file records", async () => {
    const screen = render(['$app(Text("x"))'].join("\n"));
    await screen.flush();
    const lcov = coverage.toLcov();
    expect(lcov).toContain("SF:");
    expect(lcov).toMatch(/^LF:\d+$/m);
    expect(lcov).toMatch(/^LH:\d+$/m);
    expect(lcov.trimEnd().endsWith("end_of_record")).toBe(true);
  });

  it("gives lcov every anonymous function a distinct name", async () => {
    const screen = render(
      [
        "$a = 0",
        "$b = 0",
        "$app(Stack([",
        '  Button("A", { onClick: () => $a = 1 }),',
        '  Button("B", { onClick: () => $b = 1 })',
        "]))",
      ].join("\n"),
    );
    await screen.flush();
    const fnLines = coverage
      .toLcov()
      .split("\n")
      .filter((l) => l.startsWith("FN:"));
    expect(new Set(fnLines).size).toBe(fnLines.length);
  });

  it("emits nothing for an empty session", () => {
    expect(coverage.toLcov()).toBe("");
  });

  it("formats a human summary with an overall line", async () => {
    const screen = render(`$app(Text("x"))`);
    await screen.flush();
    const text = coverage.formatSummary();
    expect(text).toContain("uncovered lines");
    expect(text).toContain("ALL:");
  });
});

describe("source provenance", () => {
  it("a single-file program links to an AST equal to a plain parse", () => {
    const source = '$app(Text("solo"))';
    const resolver: ModuleResolver = { resolve: () => null, load: () => "" };
    const linked = linkProgram(source, "/p/solo.aktion", resolver);
    expect(linked.program.sources).toBeUndefined();
    expect(linked.program).toEqual(parse(source));
  });

  it("a linked graph records its module paths, entry first", () => {
    const compiled = link(
      {
        "/p/app.aktion": 'import { X } from "./x.aktion"\n$app(X())',
        "/p/x.aktion": 'export function X() {\n  return Text("x")\n}',
      },
      "/p/app.aktion",
    );
    expect(compiled.program.sources).toEqual(["/p/app.aktion", "/p/x.aktion"]);
  });

  it("stamps imported nodes with their own source index", () => {
    const compiled = link(
      {
        "/p/app.aktion": 'import { X } from "./x.aktion"\n$app(X())',
        "/p/x.aktion": 'export function X() {\n  return Text("x")\n}',
      },
      "/p/app.aktion",
    );
    const decl = compiled.program.statements.find((s) => s.kind === "ComponentDeclaration")!;
    expect(decl.loc?.source).toBe(1);
    const entry = compiled.program.statements.find((s) => s.kind === "ExpressionStatement")!;
    expect(entry.loc?.source).toBe(0);
  });
});

describe("report filtering", () => {
  it("keeps only the files the filter accepts, and sums over those", async () => {
    coverage.reset();
    coverage.start();
    const compiled = link(
      {
        "/proj/src/app.aktion": 'import { X } from "./x.aktion"\n$app(X())',
        "/proj/src/x.aktion": 'export function X() {\n  return Text("x")\n}',
      },
      "/proj/src/app.aktion",
    );
    const screen = renderCompiled(compiled);
    await screen.flush();

    // A throwaway probe program, of the kind a helper test compiles.
    const probe = link({ "/proj/tests/.probe-1.aktion": '$app(Text("probe"))' }, "/proj/tests/.probe-1.aktion");
    const probeScreen = renderCompiled(probe);
    await probeScreen.flush();

    expect(coverage.report().files).toHaveLength(3);

    const filtered = coverage.report({ filter: (path) => path.includes("/src/") });
    expect(filtered.files.map((f) => f.path)).toEqual([
      "/proj/src/app.aktion",
      "/proj/src/x.aktion",
    ]);
    // The summary is over what survived, not over everything recorded.
    const srcLines = filtered.files.reduce((n, f) => n + f.summary.lines.total, 0);
    expect(filtered.summary.lines.total).toBe(srcLines);
    expect(filtered.summary.lines.total).toBeLessThan(coverage.report().summary.lines.total);
  });

  it("merge applies the same filter", () => {
    const shard = {
      version: 1 as const,
      files: [
        {
          path: "/proj/src/a.aktion",
          lines: { 1: 1 },
          uncoveredLines: [],
          functions: [],
          branches: [],
          summary: {
            lines: { covered: 1, total: 1, pct: 100 },
            functions: { covered: 0, total: 0, pct: 100 },
            branches: { covered: 0, total: 0, pct: 100 },
          },
        },
        {
          path: "/proj/tests/.probe-2.aktion",
          lines: { 1: 0 },
          uncoveredLines: [1],
          functions: [],
          branches: [],
          summary: {
            lines: { covered: 0, total: 1, pct: 0 },
            functions: { covered: 0, total: 0, pct: 100 },
            branches: { covered: 0, total: 0, pct: 100 },
          },
        },
      ],
      summary: {
        lines: { covered: 1, total: 2, pct: 50 },
        functions: { covered: 0, total: 0, pct: 100 },
        branches: { covered: 0, total: 0, pct: 100 },
      },
    };

    expect(coverage.merge([shard]).summary.lines.pct).toBe(50);
    const filtered = coverage.merge([shard], { filter: (p) => p.includes("/src/") });
    expect(filtered.files.map((f) => f.path)).toEqual(["/proj/src/a.aktion"]);
    expect(filtered.summary.lines.pct).toBe(100);
  });
});
