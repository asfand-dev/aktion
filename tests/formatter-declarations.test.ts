/**
 * Declaration keywords (`let` / `const` / `var`) survive `parse` → `print`.
 *
 * The AST used to carry no trace of the keyword, so the printer dropped it
 * (`export let $a = 0` → `export $a = 0`) and emitted keyword-less classic
 * `for (i = 0; …)`, which Aktion itself cannot parse — `formatProgram` then
 * silently fell back to the original source for any file with a classic `for`.
 */
import { describe, expect, it } from "vitest";
import { formatProgram, printProgram } from "../src/tooling/formatter.js";
import { parse } from "../src/parser/index.js";
import { linkProject } from "../src/compiler/index.js";
import type { Statement } from "../src/parser/types.js";

/** First statement of a one-statement program, loosely typed for field checks. */
function first(source: string): Record<string, unknown> {
  const program = parse(source);
  expect(program.errors).toEqual([]);
  return program.statements[0] as unknown as Record<string, unknown>;
}

/** Source positions and comments are not part of what a round-trip must preserve. */
function shape(source: string): string {
  const program = parse(source);
  expect(program.errors).toEqual([]);
  return JSON.stringify(program.statements, (key, value: unknown) =>
    ["loc", "leadingComments", "trailingComments"].includes(key) ? undefined : value);
}

function roundTrip(source: string): string {
  const { formatted, errors } = formatProgram(source);
  expect(errors).toEqual([]);
  return formatted;
}

describe("parser — records the declaration keyword", () => {
  it.each(["let", "const", "var"] as const)("sets declaration=%s on an assignment", (kw) => {
    expect(first(`${kw} pages = 3`).declaration).toBe(kw);
  });

  it("leaves the field off a keyword-less assignment", () => {
    const stmt = first("pages = 3");
    expect("declaration" in stmt).toBe(false);
  });

  it("records the keyword on `$state` atoms and on exports", () => {
    expect(first("let $a = 0").declaration).toBe("let");
    const exported = first("export const B = 1");
    expect(exported.declaration).toBe("const");
    expect(exported.exported).toBe(true);
  });

  it("records the keyword on destructuring, for-of and for-in", () => {
    expect(first("const [a, b] = [1, 2]").declaration).toBe("const");
    expect(first("let { a, b } = { a: 1, b: 2 }").declaration).toBe("let");
    expect(first("for (const x of [1]) { x }").declaration).toBe("const");
    expect(first("for (var k in {}) { k }").declaration).toBe("var");
  });

  it("leaves the field off a for-of / for-in head that has no keyword", () => {
    expect("declaration" in first("for (x of [1]) { x }")).toBe(false);
    expect("declaration" in first("for (k in {}) { k }")).toBe(false);
  });

  it("serialises to JSON without the field when there is no keyword", () => {
    const json = JSON.stringify(parse("pages = 3").statements);
    expect(json).not.toContain("declaration");
  });
});

describe("formatProgram — keeps declaration keywords", () => {
  it("reproduces the keyword-loss repro from issue #23", () => {
    expect(roundTrip("export let $a = 0\nexport const B = 1\nlet pages = 3\n")).toBe(
      "export let $a = 0\nexport const B = 1\nlet pages = 3\n",
    );
  });

  it.each([
    ["let", "let x = 1\n"],
    ["const", "const x = 1\n"],
    ["var", "var x = 1\n"],
    ["none", "x = 1\n"],
    ["let state atom", "let $x = 1\n"],
    ["bare state atom", "$x = 1\n"],
    ["export let", "export let x = 1\n"],
    ["export const", "export const x = 1\n"],
    ["export let state atom", "export let $x = 1\n"],
    ["export bare", "export x = 1\n"],
    ["export bare state atom", "export $x = 1\n"],
  ])("prints a top-level binding unchanged: %s", (_label, source) => {
    expect(roundTrip(source)).toBe(source);
  });

  it("keeps each keyword on array and object destructuring", () => {
    expect(roundTrip("const [a, b] = [1, 2]\n")).toBe("const [a, b] = [1, 2]\n");
    expect(roundTrip("let [a, b] = [1, 2]\n")).toBe("let [a, b] = [1, 2]\n");
    expect(roundTrip("var {a, b} = { a: 1, b: 2 }\n")).toBe("var {a, b} = { a: 1, b: 2 }\n");
  });

  it("keeps each keyword on for-of and for-in heads, including destructured ones", () => {
    expect(roundTrip("for (const x of [1, 2]) {\n  x\n}\n")).toBe("for (const x of [1, 2]) {\n  x\n}\n");
    expect(roundTrip("for (var x of [1, 2]) {\n  x\n}\n")).toBe("for (var x of [1, 2]) {\n  x\n}\n");
    expect(roundTrip("for (const [k, v] of [[1, 2]]) {\n  k\n}\n")).toBe("for (const [k, v] of [[1, 2]]) {\n  k\n}\n");
    expect(roundTrip("for (const k in {}) {\n  k\n}\n")).toBe("for (const k in {}) {\n  k\n}\n");
  });

  it("still prints `let` for a for-of / for-in head that had no keyword (unchanged behaviour)", () => {
    expect(roundTrip("for (x of [1]) {\n  x\n}\n")).toBe("for (let x of [1]) {\n  x\n}\n");
    expect(roundTrip("for (k in {}) {\n  k\n}\n")).toBe("for (let k in {}) {\n  k\n}\n");
  });

  it("keeps keywords inside function bodies and nested blocks", () => {
    const source = [
      "function work(items) {",
      "  const total = 0",
      "  var seen = 0",
      "  let [first, second] = items",
      "  count = 1",
      "  if (items.length) {",
      "    const inner = items[0]",
      "    for (const item of items) {",
      "      let doubled = item * 2",
      "      doubled",
      "    }",
      "  }",
      "  return total",
      "}",
      "",
    ].join("\n");
    expect(roundTrip(source)).toBe(source);
  });
});

describe("formatProgram — classic for loops", () => {
  const classic = "function count() {\n  for (let i = 0; i < 3; i++) {\n    i\n  }\n}\n";

  it("prints the init keyword, so the output re-parses", () => {
    const { formatted } = formatProgram(classic);
    expect(formatted).toBe(classic);
    expect(parse(formatted).errors).toEqual([]);
  });

  it.each(["let", "const", "var"] as const)("keeps `%s` in a classic for init", (kw) => {
    const source = `for (${kw} i = 0; i < 3; i++) {\n  i\n}\n`;
    expect(roundTrip(source)).toBe(source);
  });

  it("really formats the file instead of falling back to the original source", () => {
    const messy = "function count(){for(let i=0;i<3;i++){i}}";
    const { formatted } = formatProgram(messy);
    expect(formatted).not.toBe(messy);
    expect(formatted).toBe(classic);
  });
});

describe("printProgram — AST is preserved across a round-trip", () => {
  const programs = [
    "export let $a = 0\nexport const B = 1\nlet pages = 3\nbare = 2\n",
    "function f(xs) {\n  const [a, b] = xs\n  for (const x of xs) {\n    var y = x\n  }\n  for (var i = 0; i < 2; i++) {\n    y\n  }\n  for (const k in xs) {\n    k\n  }\n}\n",
  ];

  it.each(programs)("print(parse(x)) parses to the same tree, declaration included", (source) => {
    const printed = printProgram(parse(source));
    expect(parse(printed).errors).toEqual([]);
    expect(shape(printed)).toBe(shape(source));
  });

  it.each(programs)("is idempotent", (source) => {
    const once = roundTrip(source);
    expect(roundTrip(once)).toBe(once);
  });
});

describe("linker — merged programs keep declaration keywords", () => {
  it("re-emits `let` / `const` from the linked source", async () => {
    const files = {
      "app.aktion": 'import { $shared } from "./lib.aktion"\nlet local = 1\naktion = Text("x")',
      "lib.aktion": "export let $shared = 0\nexport const LIMIT = 5\n",
    };
    const { source, diagnostics } = await linkProject({ entry: "app.aktion", files });
    expect(diagnostics).toEqual([]);
    expect(source).toContain("let local = 1");
    expect(source).toMatch(/^let \$\w*shared = 0$/m);
    expect(source).toMatch(/^const \w*LIMIT = 5$/m);
  });
});

describe("evaluation — the keyword is a no-op at runtime", () => {
  it("parses to the same statements apart from the `declaration` field", () => {
    const withKeyword = parse("let a = 1\nconst b = 2\nvar c = 3\n").statements;
    const without = parse("a = 1\nb = 2\nc = 3\n").statements;
    const strip = (stmts: readonly Statement[]) =>
      JSON.stringify(stmts, (key, value: unknown) =>
        ["loc", "declaration"].includes(key) ? undefined : value);
    expect(strip(withKeyword)).toBe(strip(without));
  });
});
