import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";

describe("parser", () => {
  it("parses a single component assignment", () => {
    const program = parse(`root = Card([])`);
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0]).toMatchObject({
      identifier: "root",
      isState: false,
      expression: { kind: "Call", callee: "Card" },
    });
  });

  it("parses state declarations and references", () => {
    const program = parse(`$days = "7"\nbox = Input("days", "...", "text", null, $days)`);
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(2);
    expect(program.statements[0]).toMatchObject({ identifier: "days", isState: true });
    const callExpr = program.statements[1]?.expression;
    expect(callExpr?.kind).toBe("Call");
    if (callExpr?.kind !== "Call") return;
    expect(callExpr.arguments[4]).toEqual({ kind: "StateRef", name: "days" });
  });

  it("supports member access (array pluck)", () => {
    const program = parse(`titles = data.rows.title`);
    const expr = program.statements[0]?.expression;
    expect(expr).toMatchObject({
      kind: "Member",
      property: "title",
      object: { kind: "Member", property: "rows", object: { kind: "Identifier", name: "data" } },
    });
  });

  it("parses ternary, binary, and string concatenation", () => {
    const program = parse(`label = "" + $days + " days"`);
    const expr = program.statements[0]?.expression;
    expect(expr?.kind).toBe("Binary");
  });

  it("parses object literals with mixed types", () => {
    const program = parse(`q = Query("get", {limit: 10, search: $q}, {rows: []})`);
    expect(program.errors).toEqual([]);
    const callExpr = program.statements[0]?.expression;
    expect(callExpr?.kind).toBe("Call");
  });

  it("collects errors but keeps parsing", () => {
    const program = parse(`root = Stack([a, b\nbroken =\nb = Card([])`);
    expect(program.errors.length).toBeGreaterThan(0);
    const ids = program.statements.map((s) => s.identifier);
    expect(ids).toContain("b");
  });

  it("supports builtin calls and ternary", () => {
    const program = parse(`view = @Count(rows) > 0 ? table : empty`);
    const expr = program.statements[0]?.expression;
    expect(expr?.kind).toBe("Ternary");
  });
});
