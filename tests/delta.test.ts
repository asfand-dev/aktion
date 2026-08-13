import { describe, expect, it } from "vitest";
import { applyDelta, type DeltaOp } from "../src/tooling/delta.js";

describe("applyDelta()", () => {
  describe("patch operations", () => {
    it("collects state updates without modifying program text", () => {
      const source = '$count = 0\nroot = Text("hi")';
      const ops: DeltaOp[] = [{ kind: "patch", target: "count", value: 42 }];
      const result = applyDelta(source, ops);

      expect(result.programText).toBe(source);
      expect(result.stateUpdates).toEqual({ count: 42 });
      expect(result.warnings).toHaveLength(0);
    });

    it("handles multiple patch operations", () => {
      const source = "$a = 1\n$b = 2";
      const ops: DeltaOp[] = [
        { kind: "patch", target: "a", value: 10 },
        { kind: "patch", target: "b", value: 20 },
      ];
      const result = applyDelta(source, ops);
      expect(result.stateUpdates).toEqual({ a: 10, b: 20 });
    });

    it("allows any value type in patch", () => {
      const source = "$data = null";
      const ops: DeltaOp[] = [
        { kind: "patch", target: "data", value: { items: [1, 2, 3] } },
      ];
      const result = applyDelta(source, ops);
      expect(result.stateUpdates.data).toEqual({ items: [1, 2, 3] });
    });
  });

  describe("new operations", () => {
    it("appends a new statement to the program", () => {
      const source = '$count = 0';
      const ops: DeltaOp[] = [{ kind: "new", source: '$name = "Alice"' }];
      const result = applyDelta(source, ops);

      expect(result.programText).toContain('$name = "Alice"');
      expect(result.programText).toContain("$count = 0");
      expect(result.warnings).toHaveLength(0);
    });

    it("adds a newline separator when source does not end with one", () => {
      const source = "$x = 1";
      const ops: DeltaOp[] = [{ kind: "new", source: "$y = 2" }];
      const result = applyDelta(source, ops);
      expect(result.programText).toBe("$x = 1\n$y = 2\n");
    });

    it("does not double newline when source ends with one", () => {
      const source = "$x = 1\n";
      const ops: DeltaOp[] = [{ kind: "new", source: "$y = 2" }];
      const result = applyDelta(source, ops);
      expect(result.programText).toBe("$x = 1\n$y = 2\n");
    });

    it("warns for unparseable new source", () => {
      const source = "$x = 1";
      const ops: DeltaOp[] = [{ kind: "new", source: "{ unclosed" }];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("delta(new)");
    });
  });

  describe("delete operations", () => {
    it("removes a binding by name", () => {
      const source = '$a = 1\n$b = 2\n$c = 3';
      const ops: DeltaOp[] = [{ kind: "delete", binding: "b" }];
      const result = applyDelta(source, ops);

      expect(result.programText).toContain("$a = 1");
      expect(result.programText).toContain("$c = 3");
      expect(result.programText).not.toContain("$b = 2");
      expect(result.warnings).toHaveLength(0);
    });

    it("warns when binding is not found", () => {
      const source = "$a = 1";
      const ops: DeltaOp[] = [{ kind: "delete", binding: "nonexistent" }];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("not found");
    });

    it("can delete a function declaration", () => {
      const source = '$x = 1\nfunction Foo() {\n  return Text("hi")\n}\n$y = 2';
      const ops: DeltaOp[] = [{ kind: "delete", binding: "Foo" }];
      const result = applyDelta(source, ops);
      expect(result.programText).not.toContain("function Foo");
      expect(result.programText).toContain("$x = 1");
      expect(result.programText).toContain("$y = 2");
    });
  });

  describe("replace operations", () => {
    it("replaces a binding's value", () => {
      const source = '$greeting = "Hello"\n$name = "World"';
      const ops: DeltaOp[] = [{ kind: "replace", binding: "greeting", source: '"Hi"' }];
      const result = applyDelta(source, ops);

      expect(result.programText).toContain('greeting = "Hi"');
      expect(result.programText).toContain('$name = "World"');
      expect(result.warnings).toHaveLength(0);
    });

    it("warns when binding is not found", () => {
      const source = "$a = 1";
      const ops: DeltaOp[] = [{ kind: "replace", binding: "missing", source: "2" }];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("not found");
    });

    it("warns when replacement source is invalid", () => {
      const source = "$a = 1";
      const ops: DeltaOp[] = [{ kind: "replace", binding: "a", source: "{ broken" }];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("could not parse");
    });
  });

  describe("append operations", () => {
    it("appends an item to an array binding", () => {
      const source = 'items = ["a", "b"]';
      const ops: DeltaOp[] = [{ kind: "append", binding: "items", item: '"c"' }];
      const result = applyDelta(source, ops);

      expect(result.programText).toContain('"a"');
      expect(result.programText).toContain('"b"');
      expect(result.programText).toContain('"c"');
      expect(result.warnings).toHaveLength(0);
    });

    it("warns when binding is not an array", () => {
      const source = "$x = 42";
      const ops: DeltaOp[] = [{ kind: "append", binding: "x", item: "1" }];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("not an array");
    });

    it("warns when binding is not found", () => {
      const source = "items = [1]";
      const ops: DeltaOp[] = [{ kind: "append", binding: "missing", item: "2" }];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
    });

    it("warns when item source is invalid", () => {
      const source = "items = [1]";
      const ops: DeltaOp[] = [{ kind: "append", binding: "items", item: "{ broken" }];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("could not parse");
    });
  });

  describe("mixed operations", () => {
    it("applies multiple op kinds in sequence", () => {
      const source = '$count = 0\n$name = "Alice"\nitems = ["a"]';
      const ops: DeltaOp[] = [
        { kind: "patch", target: "count", value: 5 },
        { kind: "replace", binding: "name", source: '"Bob"' },
        { kind: "append", binding: "items", item: '"b"' },
        { kind: "new", source: '$extra = true' },
      ];
      const result = applyDelta(source, ops);

      expect(result.stateUpdates.count).toBe(5);
      expect(result.programText).toContain('name = "Bob"');
      expect(result.programText).toContain('"b"');
      expect(result.programText).toContain("$extra = true");
    });

    it("skips individual failing ops but applies the rest", () => {
      const source = '$a = 1\n$b = 2';
      const ops: DeltaOp[] = [
        { kind: "delete", binding: "nonexistent" },
        { kind: "replace", binding: "a", source: "10" },
      ];
      const result = applyDelta(source, ops);
      expect(result.warnings).toHaveLength(1);
      expect(result.programText).toContain("a = 10");
    });
  });

  describe("edge cases", () => {
    it("handles empty source", () => {
      const result = applyDelta("", [{ kind: "new", source: "$x = 1" }]);
      expect(result.programText).toContain("$x = 1");
    });

    it("handles empty ops array", () => {
      const source = "$x = 1";
      const result = applyDelta(source, []);
      expect(result.programText).toBe(source);
      expect(result.stateUpdates).toEqual({});
      expect(result.warnings).toHaveLength(0);
    });

    it("warns when source does not parse cleanly for structural ops", () => {
      const source = "{ broken";
      const result = applyDelta(source, [
        { kind: "delete", binding: "x" },
      ]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("did not parse cleanly");
    });
  });
});
