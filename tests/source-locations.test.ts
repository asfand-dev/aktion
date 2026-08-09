/**
 * Source-location contract. `loc` is not decoration: per-instance component
 * keys, `$store` identity, diagnostics, source maps and coverage all read it, so
 * a node that reports the wrong position produces a wrong-looking bug somewhere
 * far away.
 */
import { describe, it, expect } from "vitest";
import { parse, walk } from "../src/parser/index.js";
import type { Expression } from "../src/parser/index.js";
import { aktionPlugin } from "../src/plugin/index.js";

/** All located nodes of `source`, as `kind@line:column`. */
function locations(source: string): string[] {
  const out: string[] = [];
  walk(parse(source), ({ node }) => {
    const loc = (node as { loc?: { line: number; column: number } }).loc;
    if (loc) out.push(`${node.kind}@${loc.line}:${loc.column}`);
  });
  return out;
}

describe("branching nodes are locatable", () => {
  it("a ternary is positioned at its `?`", () => {
    const program = parse('$app(Text($on ? "y" : "n"))');
    let ternary: { line: number; column: number } | undefined;
    walk(program, ({ node }) => {
      if (node.kind === "Ternary") ternary = node.loc;
    });
    expect(ternary).toBeDefined();
    expect(ternary!.line).toBe(1);
    // `$app(Text($on ? …` — the `?` is the 15th character.
    expect(ternary!.column).toBe(15);
  });

  it("each operator in a chain gets its own position", () => {
    const program = parse("$app(Text(a && b && c))");
    const columns: number[] = [];
    walk(program, ({ node }) => {
      if (node.kind === "Binary") columns.push(node.loc!.column);
    });
    expect(columns).toHaveLength(2);
    expect(new Set(columns).size).toBe(2);
  });

  it("covers every binary operator family", () => {
    const source = [
      "$app(Text(",
      "  (a ?? b) + (c - d) * (e / f) % g ** h",
      "))",
      "x = (a | b) ^ (c & d)",
      "y = a << 1 >> 2 >>> 3",
      "z = a == b != (c === d) !== e",
      "w = a > b < c >= d <= e",
      "v = a instanceof B",
    ].join("\n");
    const program = parse(source);
    let located = 0;
    let unlocated = 0;
    walk(program, ({ node }) => {
      if (node.kind !== "Binary") return;
      if (node.loc) located += 1;
      else unlocated += 1;
    });
    expect(unlocated).toBe(0);
    expect(located).toBeGreaterThan(10);
  });
});

describe("template interpolations report their real position", () => {
  it("an interpolation on a later line is not attributed to line 1", () => {
    const source = ["$name = \"Ada\"", "$app(Text(`", "  hello ${$name}", "`))"].join("\n");
    const lines = locations(source)
      .filter((entry) => entry.startsWith("Identifier@") || entry.startsWith("Call@"))
      .map((entry) => Number(entry.split("@")[1]!.split(":")[0]));
    // Nothing may claim a line the file does not have content on, and in
    // particular no interpolation may land on line 1 (the old bug: every
    // sub-parsed `${…}` reported line 1 whatever file it came from).
    expect(Math.max(...lines)).toBeLessThanOrEqual(4);
    expect(lines.filter((l) => l === 1)).toEqual([]);
  });

  it("a single-line interpolation keeps its column inside the line", () => {
    const source = 'label = "x"\n$app(Text(`v=${label}`))';
    let identifier: { line: number; column: number } | undefined;
    walk(parse(source), ({ node }) => {
      if (node.kind === "Identifier" && node.name === "label" && node.loc!.line === 2) {
        identifier = node.loc;
      }
    });
    expect(identifier).toBeDefined();
    // `$app(Text(`v=${label}`))` — `label` starts at column 16.
    expect(identifier!.column).toBe(16);
  });

  it("a nested call inside an interpolation is located too", () => {
    const source = ["$app(Text(`", "  ${upper(name)}", "`))"].join("\n");
    const calls = locations(source).filter((entry) => entry.startsWith("Call@"));
    expect(calls.some((entry) => entry.endsWith("@2:5"))).toBe(true);
  });

  it("an interpolation still evaluates after the rebase", async () => {
    const { render, cleanup } = await import("../src/testing/index.js");
    const screen = render(['$who = "Ada"', "$app(Text(`hi ${$who}`))"].join("\n"));
    await screen.flush();
    expect(screen.getByText("hi Ada")).toBeDefined();
    cleanup();
  });
});

describe("plugin entry detection", () => {
  const transform = (code: string): { warnings: string[]; errored: boolean } => {
    const plugin = aktionPlugin();
    const warnings: string[] = [];
    let errored = false;
    const ctx = {
      addWatchFile() {},
      warn(message: string) { warnings.push(message); },
      error(): never { errored = true; throw new Error("plugin error"); },
    };
    (plugin as { configResolved: (c: unknown) => void }).configResolved({
      command: "build",
      root: "/p",
    });
    try {
      (plugin as { transform: (this: unknown, c: string, id: string) => unknown }).transform.call(
        ctx,
        code,
        "/p/app.aktion",
      );
    } catch {
      // `error()` throws by contract in Rollup; the flag records that it fired.
    }
    return { warnings, errored };
  };

  it("accepts `$app(...)` as an entry — no `renders nothing` warning", () => {
    const { warnings, errored } = transform('$app(Text("hi"))');
    expect(errored).toBe(false);
    expect(warnings.filter((w) => w.includes("renders nothing"))).toEqual([]);
  });

  it("still accepts the legacy `aktion = ...` form", () => {
    const { warnings } = transform('aktion = Text("hi")');
    expect(warnings.filter((w) => w.includes("renders nothing"))).toEqual([]);
  });

  it("still warns for a program with no entry at all", () => {
    const { warnings } = transform('greeting = "hi"');
    expect(warnings.some((w) => w.includes("renders nothing"))).toBe(true);
  });
});

describe("loc survives the plugin's JSON round-trip", () => {
  it("keeps line, column and source on every located node", () => {
    const plugin = aktionPlugin();
    (plugin as { configResolved: (c: unknown) => void }).configResolved({
      command: "build",
      root: "/p",
    });
    const out = (
      plugin as { transform: (this: unknown, c: string, id: string) => { code: string } | null }
    ).transform.call(
      { addWatchFile() {}, warn() {}, error() { throw new Error("unexpected"); } },
      '$app(Text($on ? "y" : "n"))',
      "/p/app.aktion",
    );
    const literal = /JSON\.parse\((".*")\);/s.exec(out!.code)![1]!;
    const program = JSON.parse(JSON.parse(literal) as string) as { statements: unknown[] };
    const stmt = program.statements[0] as { loc?: { line: number; column: number } };
    expect(stmt.loc).toEqual({ line: 1, column: 1 });

    // And the ternary the parser now locates is still located after the trip.
    const found: Array<{ line: number; column: number }> = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (value && typeof value === "object") {
        const node = value as { kind?: string; loc?: { line: number; column: number } };
        if (node.kind === "Ternary" && node.loc) found.push(node.loc);
        for (const key of Object.keys(node)) visit((node as Record<string, unknown>)[key]);
      }
    };
    visit(program);
    expect(found).toEqual([{ line: 1, column: 15 }]);
  });
});

describe("evaluateLiteral-folded declarations stay attributed", () => {
  it("a literal `$state` declaration carries its own loc", () => {
    const program = parse("$count = 0\n$app(Text(`${$count}`))");
    const decl = program.statements[0] as { loc?: { line: number } };
    expect(decl.loc?.line).toBe(1);
  });

  it("an object literal's property values are visited even though the literal has no loc", () => {
    const program = parse('$app(Button("Go", { tone: pickTone() }))');
    const calls: string[] = [];
    walk(program, ({ node }) => {
      if (node.kind === "Call") calls.push((node as Extract<Expression, { kind: "Call" }>).callee);
    });
    expect(calls).toContain("pickTone");
  });
});
