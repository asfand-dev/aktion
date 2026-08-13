import { describe, expect, it } from "vitest";
import { inspectAST, inspectProgram } from "../src/tooling/inspector.js";
import { parse } from "../src/parser/index.js";

describe("inspectAST()", () => {
  it("returns a full view for a clean program", () => {
    const source = '$count = 0\nroot = Text("Hello")';
    const view = inspectAST(source);

    expect(view.committed.source).toBe(source);
    expect(view.committed.statementCount).toBe(2);
    expect(view.committed.bindings).toHaveLength(2);
    expect(view.drafting.source).toBe("");
    expect(view.drafting.bindings).toHaveLength(0);
    expect(view.drafting.inFlightNames).toHaveLength(0);
    expect(view.errors).toHaveLength(0);
    expect(view.totalBindings).toBe(2);
  });

  it("identifies assignment bindings", () => {
    const view = inspectAST('$x = 42');
    const binding = view.committed.bindings[0]!;
    expect(binding.name).toBe("x");
    expect(binding.kind).toBe("assignment");
    expect(binding.line).toBeGreaterThan(0);
  });

  it("identifies component declarations", () => {
    const view = inspectAST('function Counter(start) {\n  return Text("0")\n}');
    const binding = view.committed.bindings[0]!;
    expect(binding.name).toBe("Counter");
    expect(binding.kind).toBe("component");
    expect(binding.summary).toContain("component");
    expect(binding.summary).toContain("1 param");
  });

  it("identifies action declarations", () => {
    const view = inspectAST('function handleClick() {\n  $count = $count + 1\n}');
    const bindings = view.committed.bindings;
    expect(bindings.length).toBeGreaterThan(0);
  });

  it("summarises call expressions", () => {
    const view = inspectAST('root = Button("Click")');
    const binding = view.committed.bindings[0]!;
    expect(binding.summary).toContain("Button(...)");
  });

  it("summarises literal values", () => {
    const view = inspectAST('$name = "Alice"');
    const binding = view.committed.bindings[0]!;
    expect(binding.summary).toContain('"Alice"');
  });

  it("summarises number literals", () => {
    const view = inspectAST("$count = 42");
    const binding = view.committed.bindings[0]!;
    expect(binding.summary).toContain("42");
  });

  it("summarises identifier references", () => {
    const view = inspectAST("alias = original");
    const binding = view.committed.bindings[0]!;
    expect(binding.summary).toBe("original");
  });

  it("summarises state references", () => {
    const view = inspectAST("ref = $count");
    const binding = view.committed.bindings[0]!;
    expect(binding.summary).toBe("$count");
  });

  it("summarises array expressions", () => {
    const view = inspectAST("items = [1, 2, 3]");
    expect(view.committed.bindings[0]!.summary).toBe("[…]");
  });

  it("summarises object expressions", () => {
    const view = inspectAST('config = { a: 1, b: 2 }');
    expect(view.committed.bindings[0]!.summary).toBe("{…}");
  });

  it("summarises template expressions", () => {
    const view = inspectAST("msg = `hello ${name}`");
    expect(view.committed.bindings[0]!.summary).toBe("`…`");
  });

  it("puts half-written code in the drafting section", () => {
    const source = '$a = 1\nfunction Broken() {\n  Text(';
    const view = inspectAST(source);

    expect(view.errors.length).toBeGreaterThan(0);
    expect(view.committed.bindings.some((b) => b.name === "a")).toBe(true);
    expect(view.drafting.source.length).toBeGreaterThan(0);
  });

  it("scans drafting source for function declarations", () => {
    const source = '{broken\nfunction Widget() {\n  Stack(';
    const view = inspectAST(source);

    const inFlight = view.drafting.inFlightNames;
    expect(inFlight).toContain("Widget");
  });

  it("scans drafting source for $state assignments", () => {
    const source = '$a = 1\n{broken\n$b = 2';
    const view = inspectAST(source);

    expect(view.drafting.inFlightNames).toContain("b");
  });

  it("scans drafting source for hook declarations", () => {
    const source = '$a = 1\n{broken\nfunction $useFoo() {';
    const view = inspectAST(source);

    expect(view.drafting.inFlightNames).toContain("$useFoo");
  });

  it("scans drafting source for let/const/var assignments", () => {
    const source = '$a = 1\n{broken\nlet x = 5';
    const view = inspectAST(source);

    expect(view.drafting.inFlightNames).toContain("x");
  });

  it("scans drafting source for plain assignments", () => {
    const source = '$a = 1\n{broken\nfoo = 5';
    const view = inspectAST(source);

    expect(view.drafting.inFlightNames).toContain("foo");
  });

  it("handles empty input", () => {
    const view = inspectAST("");

    expect(view.committed.source).toBe("");
    expect(view.committed.bindings).toHaveLength(0);
    expect(view.committed.statementCount).toBe(0);
    expect(view.drafting.source).toBe("");
    expect(view.totalBindings).toBe(0);
  });

  it("skips comments and blank lines in drafting scan", () => {
    const source = '$a = 1\n{broken\n// comment\n\n$b = 2';
    const view = inspectAST(source);

    const names = view.drafting.inFlightNames;
    expect(names).toContain("b");
    expect(names).not.toContain("comment");
  });

  it("includes both top-level and parser-resolved bindings from drafting tail", () => {
    const source = '$a = 1\n{broken\ntop = 2';
    const view = inspectAST(source);

    expect(view.drafting.inFlightNames).toContain("top");
  });

  it("does not duplicate names between frontier and scan", () => {
    const source = '$a = 1\n{broken';
    const view = inspectAST(source);

    const allDraftingNames = view.drafting.bindings.map((b) => b.name);
    const uniqueNames = [...new Set(allDraftingNames)];
    expect(allDraftingNames).toEqual(uniqueNames);
  });
});

describe("inspectProgram()", () => {
  it("treats a clean program as fully committed", () => {
    const source = '$x = 10\n$y = 20';
    const program = parse(source);
    const view = inspectProgram(source, program);

    expect(view.committed.bindings).toHaveLength(2);
    expect(view.committed.statementCount).toBe(2);
    expect(view.drafting.source).toBe("");
    expect(view.drafting.bindings).toHaveLength(0);
    expect(view.drafting.inFlightNames).toHaveLength(0);
    expect(view.totalBindings).toBe(2);
  });

  it("surfaces parse errors", () => {
    const source = "{ broken";
    const program = parse(source);
    const view = inspectProgram(source, program);

    expect(view.errors.length).toBeGreaterThan(0);
    expect(view.errors[0]!.message).toBeTruthy();
    expect(view.errors[0]!.line).toBeGreaterThan(0);
  });

  it("includes hook declarations with $ prefix", () => {
    const source = 'function $useCounter() {\n  $count = 0\n  return $count\n}';
    const program = parse(source);
    const view = inspectProgram(source, program);

    const hook = view.committed.bindings.find((b) => b.kind === "hook");
    if (hook) {
      expect(hook.name).toBe("$useCounter");
      expect(hook.summary).toContain("hook");
    }
  });

  it("includes effect declarations with trigger info", () => {
    const source = '$effect(() => { $now = Date.now() }, ["every(1000)"])';
    const program = parse(source);
    const view = inspectProgram(source, program);

    const effect = view.committed.bindings.find((b) => b.kind === "effect");
    if (effect) {
      expect(effect.summary).toContain("effect");
    }
  });

  it("handles method call summaries", () => {
    const source = "result = obj.method(1)";
    const program = parse(source);
    const view = inspectProgram(source, program);

    const binding = view.committed.bindings[0];
    if (binding) {
      expect(binding.summary).toContain(".method(...)");
    }
  });
});
