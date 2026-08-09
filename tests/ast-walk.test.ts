import { describe, it, expect } from "vitest";
import { parse, walk, walkNode, stampSourceIndex } from "../src/parser/index.js";
import type { AnyNode, Expression, Statement } from "../src/parser/index.js";

/** Collect every visited node kind, in visit order. */
function kinds(source: string): string[] {
  const out: string[] = [];
  walk(parse(source), ({ node }) => {
    out.push(node.kind);
  });
  return out;
}

describe("walk", () => {
  it("visits parents before children, in source order", () => {
    const seen = kinds(`$app(Text("hi"))`);
    expect(seen[0]).toBe("ExpressionStatement");
    expect(seen).toContain("Invoke");
    expect(seen).toContain("Call");
    expect(seen).toContain("Literal");
    expect(seen.indexOf("Call")).toBeLessThan(seen.indexOf("Literal"));
  });

  it("reports the parent, key and index of each node", () => {
    const steps: Array<{ kind: string; parent: string | null; key: string | null; index: number | null }> = [];
    walk(parse(`total = a + b`), ({ node, parent, key, index }) => {
      steps.push({ kind: node.kind, parent: parent?.kind ?? null, key, index });
    });
    expect(steps[0]).toEqual({ kind: "Assignment", parent: null, key: null, index: null });
    // Reached through a single-valued property, so `index` is null (not 0).
    const left = steps.find((s) => s.key === "left");
    expect(left).toEqual({ kind: "Identifier", parent: "Binary", key: "left", index: null });
  });

  it("returning false skips a subtree", () => {
    const visited: string[] = [];
    walk(parse(`$app(Stack([Text("a"), Text("b")]))`), ({ node }) => {
      visited.push(node.kind);
      if (node.kind === "Array") return false;
      return undefined;
    });
    // The array itself is visited, but neither `Text(...)` call inside it is.
    expect(visited).toContain("Array");
    expect(visited.filter((k) => k === "Call")).toHaveLength(1); // only Stack
  });

  it("descends through node-bearing records that are not nodes themselves", () => {
    // ObjectProperty has no `kind`; its value must still be visited.
    const seen = kinds(`$app(Button("Go", { onClick: () => notify("x") }))`);
    expect(seen).toContain("Lambda");
    expect(seen.filter((k) => k === "Call")).toEqual(expect.arrayContaining(["Call"]));
  });

  it("visits switch-case tests and bodies", () => {
    const source = [
      "function pick(n) {",
      "  switch (n) {",
      '    case 1: return "one"',
      '    default: return "many"',
      "  }",
      "}",
      "$app(Text(pick(1)))",
    ].join("\n");
    const seen = kinds(source);
    expect(seen).toContain("SwitchStatement");
    expect(seen.filter((k) => k === "Return")).toHaveLength(2);
  });

  it("does not mistake EffectTrigger / DestructuringPattern records for nodes", () => {
    // `kind: "state"` (EffectTrigger) and `kind: "object"` (DestructuringPattern)
    // are lowercase records, not AST nodes — a caller must never be handed one.
    const source = [
      "$count = 0",
      "let { a, b } = { a: 1, b: 2 }",
      "$effect(() => { $count = $count + 1 }, [$count])",
      "$app(Text(`${a}`))",
    ].join("\n");
    const seen = new Set(kinds(source));
    for (const kind of seen) {
      expect(kind[0]).toBe(kind[0]!.toUpperCase());
    }
    // Both constructs whose records carry a lowercase `kind` are present, so the
    // PascalCase assertion above is actually exercised.
    expect(seen.has("EffectDeclaration")).toBe(true);
    expect(seen.has("DestructureStatement")).toBe(true);
  });

  it("walkNode walks a single subtree", () => {
    const program = parse(`$app(Text("x"))`);
    const stmt = program.statements[0]!;
    const viaNode: string[] = [];
    walkNode(stmt as AnyNode, ({ node }) => {
      viaNode.push(node.kind);
    });
    expect(viaNode).toEqual(kinds(`$app(Text("x"))`));
  });

  it("never reports `loc` as a child", () => {
    walk(parse(`$app(Text("x"))`), ({ key }) => {
      expect(key).not.toBe("loc");
    });
  });
});

describe("stampSourceIndex", () => {
  it("stamps every located node and leaves existing stamps alone", () => {
    const program = parse(`$app(Text("hi"))`);
    const stmt = program.statements[0]! as AnyNode;

    // Pre-stamp one node with a different index; it must survive.
    const inner = (stmt as unknown as { expression: { arguments: Expression[] } }).expression
      .arguments[0]!;
    if (inner.loc) inner.loc.source = 9;

    stampSourceIndex(stmt, 3);

    const stamped: number[] = [];
    walkNode(stmt, ({ node }) => {
      const loc = (node as { loc?: { source?: number } }).loc;
      if (loc) stamped.push(loc.source!);
    });
    expect(stamped.length).toBeGreaterThan(0);
    expect(new Set(stamped)).toEqual(new Set([3, 9]));
  });

  it("is a no-op for nodes with no loc", () => {
    const node: Statement = { kind: "BreakStatement" } as Statement;
    expect(() => {
      stampSourceIndex(node as AnyNode, 1);
    }).not.toThrow();
  });
});
