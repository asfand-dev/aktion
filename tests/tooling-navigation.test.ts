import { describe, expect, it } from "vitest";
import {
  getDefinition,
  getDefinitionTarget,
  findDeclaration,
  getReferences,
  getDocumentSymbols,
  getRenameEdits,
} from "../src/tooling/navigation.js";

// Lines (1-indexed):
// 1: $count = 0
// 2: function Counter() {
// 3:   return Button("Add", { action: increment })
// 4: }
// 5: function increment() {
// 6:   $count = $count + 1
// 7: }
// 8: $app(Counter())
const PROGRAM = [
  "$count = 0",
  "function Counter() {",
  '  return Button("Add", { action: increment })',
  "}",
  "function increment() {",
  "  $count = $count + 1",
  "}",
  "$app(Counter())",
].join("\n");

describe("getDefinition", () => {
  it("resolves a reactive atom usage to its declaration", () => {
    // `$count` inside the increment body (line 6, the second `$count`).
    const def = getDefinition(PROGRAM, { line: 6, column: 13 });
    expect(def).not.toBeNull();
    expect(def?.start.line).toBe(1);
    expect(def?.start.column).toBe(1);
  });

  it("resolves a component call to its declaration", () => {
    // `Counter()` on line 8.
    const def = getDefinition(PROGRAM, { line: 8, column: 6 });
    expect(def?.start.line).toBe(2);
  });

  it("resolves an action reference to its declaration", () => {
    // `increment` referenced on line 3.
    const def = getDefinition(PROGRAM, { line: 3, column: 35 });
    expect(def?.start.line).toBe(5);
  });

  it("returns null for a library component (no in-file declaration)", () => {
    // `Button` is a library component, not declared in this file.
    expect(getDefinition(PROGRAM, { line: 3, column: 11 })).toBeNull();
  });
});

describe("getDefinitionTarget", () => {
  const IMPORTER = [
    'import { Counter, $count } from "./components/counter.aktion"',
    "",
    "$app(Counter())",
  ].join("\n");
  const moduleCol = IMPORTER.indexOf("./components") + 2; // inside the string (1-indexed)
  const dollarCol = IMPORTER.indexOf("$count") + 2; // on the `$count` binding
  const counterCol = IMPORTER.indexOf("Counter") + 2; // on the `Counter` binding

  it("classifies an imported reactive atom as a cross-file binding", () => {
    expect(getDefinitionTarget(IMPORTER, { line: 1, column: dollarCol })).toEqual({
      kind: "import-binding",
      imported: "count",
      isState: true,
      moduleSource: "./components/counter.aktion",
    });
  });

  it("classifies an imported component, preserving its source name (alias-aware)", () => {
    const aliased = 'import { Counter as Tally } from "./counter.aktion"\n$app(Tally())';
    const col = "$app(Tally())".indexOf("Tally") + 2; // usage on line 2
    expect(getDefinitionTarget(aliased, { line: 2, column: col })).toEqual({
      kind: "import-binding",
      imported: "Counter",
      isState: false,
      moduleSource: "./counter.aktion",
    });
  });

  it("classifies the module specifier string as a module target", () => {
    expect(getDefinitionTarget(IMPORTER, { line: 1, column: moduleCol })).toEqual({
      kind: "module",
      moduleSource: "./components/counter.aktion",
    });
  });

  it("classifies the imported component binding (in the clause) as cross-file", () => {
    expect(getDefinitionTarget(IMPORTER, { line: 1, column: counterCol })).toMatchObject({
      kind: "import-binding",
      imported: "Counter",
    });
  });

  it("resolves a file-local declaration to a range", () => {
    const target = getDefinitionTarget(PROGRAM, { line: 6, column: 13 });
    expect(target).toMatchObject({ kind: "local" });
    expect(target?.range?.start.line).toBe(1);
  });

  it("returns null for an undeclared / library symbol", () => {
    expect(getDefinitionTarget(PROGRAM, { line: 3, column: 11 })).toBeNull(); // Button
  });
});

describe("findDeclaration", () => {
  const MODULE = [
    "export $count = 0",
    "",
    "export function Counter() {",
    '  Button("+")',
    "}",
  ].join("\n");

  it("finds an exported reactive atom by name", () => {
    const range = findDeclaration(MODULE, "count", true);
    expect(range?.start.line).toBe(1);
  });

  it("finds an exported component by name", () => {
    const range = findDeclaration(MODULE, "Counter", false);
    expect(range?.start.line).toBe(3);
  });

  it("returns null for a name that is not declared", () => {
    expect(findDeclaration(MODULE, "Missing", false)).toBeNull();
  });
});

describe("getReferences", () => {
  it("finds every occurrence of a reactive atom (declaration included)", () => {
    const refs = getReferences(PROGRAM, { line: 1, column: 1 });
    // line 1 (decl) + two on line 6.
    expect(refs.length).toBe(3);
    expect(refs.map((r) => r.start.line).sort()).toEqual([1, 6, 6]);
  });

  it("can exclude the declaration", () => {
    const refs = getReferences(PROGRAM, { line: 1, column: 1 }, { includeDeclaration: false });
    expect(refs.length).toBe(2);
    expect(refs.every((r) => r.start.line === 6)).toBe(true);
  });

  it("finds component references across the file", () => {
    const refs = getReferences(PROGRAM, { line: 2, column: 10 });
    // declaration on line 2 + call on line 8.
    expect(refs.map((r) => r.start.line).sort()).toEqual([2, 8]);
  });
});

describe("getDocumentSymbols", () => {
  it("lists top-level atoms, components, and actions in source order", () => {
    const symbols = getDocumentSymbols(PROGRAM);
    expect(symbols.map((s) => s.name)).toEqual(["$count", "Counter", "increment"]);
    expect(symbols.map((s) => s.kind)).toEqual(["state", "component", "action"]);
  });

  it("includes import bindings", () => {
    const src = 'import { Card, $shared as $store2 } from "./mod.aktion"\n$x = 1';
    const symbols = getDocumentSymbols(src);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Card");
    expect(names).toContain("$store2");
    expect(names).toContain("$x");
  });
});

describe("getRenameEdits", () => {
  it("renames a reactive atom and all references (sigil preserved)", () => {
    const result = getRenameEdits(PROGRAM, { line: 1, column: 1 }, "total");
    expect(result.error).toBeUndefined();
    expect(result.edits.length).toBe(3);
    expect(result.edits.every((e) => e.newText === "$total")).toBe(true);
  });

  it("accepts a new name typed with the sigil", () => {
    const result = getRenameEdits(PROGRAM, { line: 1, column: 1 }, "$total");
    expect(result.edits.every((e) => e.newText === "$total")).toBe(true);
  });

  it("renames a component", () => {
    const result = getRenameEdits(PROGRAM, { line: 2, column: 10 }, "Widget");
    expect(result.edits.length).toBe(2);
    expect(result.edits.every((e) => e.newText === "Widget")).toBe(true);
  });

  it("rejects an invalid identifier", () => {
    const result = getRenameEdits(PROGRAM, { line: 1, column: 1 }, "2bad");
    expect(result.edits.length).toBe(0);
    expect(result.error).toBeDefined();
  });

  it("rejects renaming a non-declared symbol", () => {
    const result = getRenameEdits(PROGRAM, { line: 8, column: 1 }, "boot"); // $app builtin
    expect(result.error).toBeDefined();
  });
});
