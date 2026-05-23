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
    expect(program.statements[0]).toMatchObject({
      kind: "Assignment",
      identifier: "days",
      isState: true,
    });
    const callExpr = program.statements[1]?.expression;
    expect(callExpr?.kind).toBe("Call");
    if (callExpr?.kind !== "Call") return;
    expect(callExpr.arguments[4]).toEqual({ kind: "StateRef", name: "days" });
  });

  it("accepts the bare `$name = value` reactive-atom form (the only state form)", () => {
    const program = parse(`$days = "7"`);
    expect(program.errors).toEqual([]);
    expect(program.statements[0]).toMatchObject({
      kind: "Assignment",
      identifier: "days",
      isState: true,
    });
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

  it("parses bracket member access and optional ?.[key]", () => {
    const program = parse(`first = $rows[0]\nkey = $user?.[$name]`);
    expect(program.errors).toEqual([]);
    expect(program.statements[0]?.expression).toMatchObject({
      kind: "Member",
      computed: { kind: "Literal", value: 0 },
      object: { kind: "StateRef", name: "rows" },
    });
    expect(program.statements[1]?.expression).toMatchObject({
      kind: "Member",
      optional: true,
      computed: { kind: "StateRef", name: "name" },
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

  it("parses inline named call arguments using the `name: value` form", () => {
    const program = parse(`cell = GridItem(Text("Side"), span: "1/4")`);
    expect(program.errors).toEqual([]);
    const callExpr = program.statements[0]?.expression;
    expect(callExpr?.kind).toBe("Call");
    if (callExpr?.kind !== "Call") return;
    expect(callExpr.arguments[1]).toMatchObject({
      kind: "NamedArg",
      name: "span",
      value: { kind: "Literal", value: "1/4" },
    });
  });

  it("rejects the legacy `name=value` named-arg form with a migration hint", () => {
    const program = parse(`cell = GridItem(Text("Side"), span="1/4")`);
    expect(program.errors.length).toBeGreaterThan(0);
    expect(program.errors[0]?.message).toMatch(/Legacy "name=value"/);
    expect(program.errors[0]?.message).toMatch(/span: value/);
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

  it("supports backtick-quoted multi-line strings (template-literal style)", () => {
    // Backticks let LLMs embed JavaScript bodies without escaping newlines.
    const source = "ticker = Script(\"ticker\", `const x = 1;\nctx.state.set('x', x);`, [\"x\"])";
    const program = parse(source);
    expect(program.errors).toEqual([]);
    const expr = program.statements[0]?.expression;
    expect(expr?.kind).toBe("Call");
    if (expr?.kind !== "Call") return;
    const body = expr.arguments[1];
    expect(body?.kind).toBe("Literal");
    if (body?.kind !== "Literal") return;
    expect(body.value).toBe("const x = 1;\nctx.state.set('x', x);");
  });

  it("backtick strings allow unescaped double quotes inside the body", () => {
    const source = "snippet = Script(\"s\", `console.log(\"hi\");`)";
    const program = parse(source);
    expect(program.errors).toEqual([]);
    const expr = program.statements[0]?.expression;
    if (expr?.kind !== "Call") throw new Error("expected Call");
    const body = expr.arguments[1];
    if (body?.kind !== "Literal") throw new Error("expected Literal");
    expect(body.value).toBe('console.log("hi");');
  });

  it("backtick strings keep escape sequences working", () => {
    const source = "msg = Script(\"m\", `a\\nb\\tc`)";
    const program = parse(source);
    const expr = program.statements[0]?.expression;
    if (expr?.kind !== "Call") throw new Error("expected Call");
    const body = expr.arguments[1];
    if (body?.kind !== "Literal") throw new Error("expected Literal");
    expect(body.value).toBe("a\nb\tc");
  });

  it("strips `#` line comments on their own line", () => {
    const program = parse(`# header for the next block\nroot = Card([])`);
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(1);
    expect(program.statements[0]).toMatchObject({
      identifier: "root",
      expression: { kind: "Call", callee: "Card" },
    });
  });

  it("strips trailing `#` line comments after a statement", () => {
    const program = parse(`root = Card([]) # the top level card\nname = "Alex"`);
    expect(program.errors).toEqual([]);
    const ids = program.statements.map((s) => s.identifier);
    expect(ids).toEqual(["root", "name"]);
  });

  it("keeps `#` inside string literals untouched", () => {
    const program = parse(`hex = "#ff00aa # not a comment"`);
    expect(program.errors).toEqual([]);
    const expr = program.statements[0]?.expression;
    expect(expr).toMatchObject({ kind: "Literal", value: "#ff00aa # not a comment" });
  });

  it("parses subtraction without whitespace as Binary `-`", () => {
    // Regression: the lexer used to greedily consume the `-` into the
    // following number whenever the previous character was anything,
    // turning `$x-1` into `[$x, Number(-1)]` (which then failed to parse
    // as a valid expression).
    const program = parse(`val = $x-1`);
    expect(program.errors).toEqual([]);
    const expr = program.statements[0]?.expression;
    expect(expr).toMatchObject({
      kind: "Binary",
      operator: "-",
      left: { kind: "StateRef", name: "x" },
      right: { kind: "Literal", value: 1 },
    });
  });

  it("rejects multi-dot numbers gracefully (1.2.3 -> 1.2 then `.3` member)", () => {
    const program = parse(`val = 1.2`);
    expect(program.errors).toEqual([]);
    const expr = program.statements[0]?.expression;
    expect(expr).toMatchObject({ kind: "Literal", value: 1.2 });
  });

  it("still treats a parenthesised negative literal as a signed number", () => {
    const program = parse(`val = (-3)`);
    expect(program.errors).toEqual([]);
    const expr = program.statements[0]?.expression;
    expect(expr).toMatchObject({ kind: "Literal", value: -3 });
  });
});
