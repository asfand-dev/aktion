import { describe, expect, it } from "vitest";
import { computeFrontier, buildFrontier, isQuiescent } from "../src/parser/frontier.js";
import { parse } from "../src/parser/index.js";

describe("computeFrontier()", () => {
  it("returns fully committed for a clean program", () => {
    const source = '$count = 0\nroot = Text("Hello")';
    const f = computeFrontier(source);

    expect(f.errors).toHaveLength(0);
    expect(f.committedSource).toBe(source);
    expect(f.draftingSource).toBe("");
    expect(f.committedBindings).toContain("count");
    expect(f.committedBindings).toContain("root");
    expect(f.uncommittedBindings).toHaveLength(0);
  });

  it("returns empty committed source when the first line has an error", () => {
    const f = computeFrontier("{ unclosed");
    expect(f.committedSource).toBe("");
    expect(f.draftingSource).toBe("{ unclosed");
    expect(f.errors.length).toBeGreaterThan(0);
  });

  it("splits at the first error line", () => {
    const source = '$a = 1\n$b = 2\n{ broken\n$c = 3';
    const f = computeFrontier(source);

    expect(f.committedBindings).toContain("a");
    expect(f.committedBindings).toContain("b");
    expect(f.uncommittedBindings).not.toContain("a");
    expect(f.errors.length).toBeGreaterThan(0);
    expect(f.committedSource).not.toBe("");
    expect(f.draftingSource).not.toBe("");
  });

  it("identifies function declarations as committed bindings", () => {
    const source = 'function Counter() {\n  return Text("0")\n}';
    const f = computeFrontier(source);
    expect(f.committedBindings).toContain("Counter");
  });

  it("puts half-written functions in uncommitted bindings", () => {
    const source = '$count = 0\nfunction Counter() {\n  Stack(Te';
    const f = computeFrontier(source);
    expect(f.committedBindings).toContain("count");
  });

  it("returns committed statements for clean programs", () => {
    const source = '$x = 1\n$y = 2';
    const f = computeFrontier(source);
    expect(f.committedStatements).toHaveLength(2);
    expect(f.committedStatements[0]!.kind).toBe("Assignment");
  });

  it("handles empty input", () => {
    const f = computeFrontier("");
    expect(f.committedSource).toBe("");
    expect(f.draftingSource).toBe("");
    expect(f.committedBindings).toHaveLength(0);
    expect(f.uncommittedBindings).toHaveLength(0);
    expect(f.errors).toHaveLength(0);
  });
});

describe("buildFrontier()", () => {
  it("accepts a pre-parsed program", () => {
    const source = '$x = 42';
    const program = parse(source);
    const f = buildFrontier(source, program);
    expect(f.committedBindings).toContain("x");
    expect(f.errors).toHaveLength(0);
  });

  it("produces same result as computeFrontier for the same input", () => {
    const source = '$a = 1\nroot = Text("hi")';
    const f1 = computeFrontier(source);
    const f2 = buildFrontier(source, parse(source));
    expect(f1.committedBindings).toEqual(f2.committedBindings);
    expect(f1.uncommittedBindings).toEqual(f2.uncommittedBindings);
    expect(f1.committedSource).toBe(f2.committedSource);
    expect(f1.draftingSource).toBe(f2.draftingSource);
  });
});

describe("isQuiescent()", () => {
  it("returns true when deps is empty", () => {
    const f = computeFrontier("");
    expect(isQuiescent(f, [])).toBe(true);
  });

  it("returns true when all deps are committed", () => {
    const f = computeFrontier('$a = 1\n$b = 2');
    expect(isQuiescent(f, ["a", "b"])).toBe(true);
  });

  it("returns false when a dep is not committed", () => {
    const source = '$a = 1\n{ broken';
    const f = computeFrontier(source);
    expect(isQuiescent(f, ["a"])).toBe(true);
    expect(isQuiescent(f, ["nonexistent"])).toBe(false);
  });

  it("returns false when any dep is in the drafting tail", () => {
    const source = '$a = 1\n$b = 2\n{ broken\n$c = 3';
    const f = computeFrontier(source);
    expect(isQuiescent(f, ["a", "c"])).toBe(false);
  });
});
