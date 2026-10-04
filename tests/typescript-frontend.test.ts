/**
 * The TypeScript frontend (`src/plugin/typescript.ts`, guide §7.4): types are
 * erased without moving a character, so every node — and every diagnostic —
 * sits at the line and column of the `.aktion.ts` file; constructs with runtime
 * meaning are refused with positioned messages; newlines inside erased types
 * do not end statements (soft newlines).
 */

import { describe, expect, it } from "vitest";
import {
  MISSING_ERASER_MESSAGE,
  checkErasureInvariant,
  computeSoftNewlines,
  createTypeScriptFrontend,
  loadTypeScriptFrontend,
  typeScriptFrontendFromEraser,
  unavailableTypeScriptFrontend,
  type TypeEraser,
} from "../src/plugin/typescript.js";
import { parse } from "../src/parser/index.js";
import type { Expression, Statement } from "../src/parser/types.js";

const ts = createTypeScriptFrontend();
const compile = (src: string) => ts.compile(src, "/src/m.aktion.ts");
const lines = (...l: string[]): string => l.join("\n");

/** Every problem the frontend reports, as `code@line:column`. */
function problems(src: string): string[] {
  const out = compile(src);
  return [
    ...out.program.errors.map((e) => `PARSE@${e.line}:${e.column}`),
    ...out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`),
  ];
}

const first = <K extends Statement["kind"]>(statements: readonly Statement[], kind: K) =>
  statements.find((s) => s.kind === kind) as Extract<Statement, { kind: K }>;

describe("erasure keeps positions", () => {
  const src = lines(
    'import type { Todo } from "./types.aktion.ts"',
    "interface Props { dense?: boolean }",
    "export const total: number = sum([1, 2])",
    "export function Row(todo: Todo, { dense = false }: Props = {}): unknown {",
    "  const label: string = todo.title as string",
    "  return Text(label, { size: dense ? \"sm\" : \"md\" })",
    "}",
  );

  it("produces same-length JavaScript with every line break in place", () => {
    const out = compile(src);
    expect(out.aktionSource.length).toBe(src.length);
    expect(out.aktionSource.split("\n").length).toBe(src.split("\n").length);
    expect(checkErasureInvariant(src, out.aktionSource)).toBeNull();
    expect(out.diagnostics).toEqual([]);
    expect(out.program.errors).toEqual([]);
  });

  it("locates nodes at the TypeScript file's line and column", () => {
    const { program } = compile(src);
    const assignment = first(program.statements, "Assignment");
    expect(assignment.loc).toEqual({ line: 3, column: 8 });
    const call = assignment.expression as Expression & { kind: "Call" };
    expect(call.loc).toEqual({ line: 3, column: 30 });
    const row = first(program.statements, "ComponentDeclaration");
    expect(row.loc).toEqual({ line: 4, column: 8 });
    const ret = row.body.body.find((s) => s.kind === "Return")!;
    expect(ret.loc).toEqual({ line: 6, column: 3 });
  });

  it("drops `import type` and type-only declarations", () => {
    const { program } = compile(src);
    expect(program.statements.some((s) => s.kind === "Import")).toBe(false);
  });

  it("reports JS-semantics diagnostics at TypeScript positions", () => {
    expect(problems(lines("let count: number = 0", "export function inc(): void {", "  count = count + 1", "}"))).toEqual([
      "E107@3:9",
    ]);
    expect(problems("const f = async (x: number): Promise<number> => x")).toEqual(["E102@1:11"]);
  });
});

describe("non-erasable TypeScript", () => {
  it.each([
    ["enum E { A }", "1:1", 'TypeScript enums are not erasable — use a plain object (`const E = { A: "a" }`) or a string union.'],
    ["namespace N { export const a = 1 }", "1:1", "TypeScript namespaces are not supported in Aktion modules — use an ordinary module."],
    ['import fs = require("fs")', "1:1", "CommonJS-style TypeScript imports/exports are not supported — use `import { … } from`."],
    ["const x = 1\nexport = x", "2:1", "CommonJS-style TypeScript imports/exports are not supported — use `import { … } from`."],
    ["const v = <number>someValue", "1:11", "Angle-bracket type assertions are not supported — use `expr as T` (it is erased)."],
    ["@dec\nfunction f() {}", "1:1", "Decorators are not supported in Aktion modules."],
  ])("%s → its message at %s", (src, where, message) => {
    const out = compile(src);
    const erase = out.diagnostics.filter((d) => d.code === "AKT-TS-ERASE");
    expect(erase.map((d) => `${d.line}:${d.column}`)).toEqual([where]);
    expect(erase[0]!.message).toBe(message);
    expect(erase[0]!.severity).toBe("error");
    // The rejected range is blanked, so the Aktion parser does not report it again.
    expect(out.program.errors).toEqual([]);
  });

  it("parameter properties", () => {
    const erase = compile("class C { constructor(private x: number) {} }").diagnostics.filter((d) => d.code === "AKT-TS-ERASE");
    expect(erase.map((d) => `${d.line}:${d.column} ${d.message}`)).toEqual([
      "1:23 Parameter properties are not supported (Aktion has no classes).",
    ]);
  });

  it("reports every non-erasable construct, not just the first", () => {
    expect(problems(lines("enum A { X }", "enum B { Y }", "const v = <T>w"))).toEqual([
      "AKT-TS-ERASE@1:1",
      "AKT-TS-ERASE@2:1",
      "AKT-TS-ERASE@3:11",
    ]);
  });

  it("reports TypeScript syntax errors that erasure would hide", () => {
    const out = compile("let x: = 1");
    expect(out.diagnostics.map((d) => `${d.code}@${d.line}:${d.column}`)).toEqual(["AKT-TS-SYNTAX@1:8"]);
    expect(out.diagnostics[0]!.message).toBe("TypeScript syntax error: Type expected.");
  });
});

describe("soft newlines (F18)", () => {
  it("computes the newlines inside erased ranges", () => {
    const src = "const x = foo<\n  Bar\n>(1)\ntype A = {\n  a: 1\n}\nconst y = 2";
    const erased = compile(src).aktionSource;
    const soft = [...computeSoftNewlines(src, erased)].map((i) => src.slice(0, i).split("\n").length);
    // Lines 1 and 2 end inside `<Bar>`, lines 4 and 5 inside `type A`; line 6
    // ends after a fully erased statement, before `const y`: hard.
    expect(soft.sort()).toEqual([1, 2, 4, 5]);
  });

  it("a multi-line type argument does not split the call", () => {
    const { program, diagnostics } = compile(lines("const x = foo<", "  Bar", ">(1)"));
    expect(diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
    expect(program.statements).toHaveLength(1);
    const call = first(program.statements, "Assignment").expression;
    expect(call).toMatchObject({ kind: "Call", callee: "foo", arguments: [{ kind: "Literal", value: 1 }] });
  });

  it.each([
    ["a multi-line annotation before `=`", lines("const o: {", "  a: number", "} = { a: 1 }")],
    ["a multi-line union annotation", lines("let m:", '  | "a"', '  | "b" = "a"')],
    ["a multi-line return type", lines("function f(): {", "  a: number", "} {", "  return { a: 1 }", "}")],
    ["a line break inside `as`", lines("const y = (x as", "  T)")],
  ])("%s parses", (_name, src) => {
    const out = compile(src);
    expect(out.program.errors).toEqual([]);
    expect(out.diagnostics).toEqual([]);
    expect(out.program.statements).toHaveLength(1);
  });

  it("keeps exact positions after a soft newline", () => {
    const { program } = compile(lines("const o: {", "  a: number", "} = { a: 1 }", "const later = 2"));
    expect(program.statements.map((s) => s.loc)).toEqual([
      { line: 1, column: 1 },
      { line: 4, column: 1 },
    ]);
  });
});

describe("the frontend contract", () => {
  it("rejects an eraser that moves positions, instead of mis-attributing every diagnostic", () => {
    const shifty: TypeEraser = (source) => ({ code: source.replace(": number", ""), diagnostics: [] });
    const out = typeScriptFrontendFromEraser(shifty).compile("const n: number = 1", "/m.aktion.ts");
    expect(out.diagnostics.map((d) => d.code)).toEqual(["AKT-TS-ERASE"]);
    expect(out.diagnostics[0]!.message).toContain("type erasure changed the length of the module");
    const moved: TypeEraser = (source) => ({ code: source.replace("\n", " ").replace("x", "\n"), diagnostics: [] });
    expect(checkErasureInvariant("a\nbx", moved("a\nbx", "").code)).toContain("moved a line break");
  });

  it("never throws: a throwing eraser becomes a diagnostic", () => {
    const boom: TypeEraser = () => {
      throw new Error("nope");
    };
    const out = typeScriptFrontendFromEraser(boom).compile("const a = 1", "/m.aktion.ts");
    expect(out.diagnostics.map((d) => `${d.code}: ${d.message}`)).toEqual(["AKT-TS-ERASE: Type erasure failed: Error: nope"]);
  });

  it("accepts a custom eraser", async () => {
    const naive: TypeEraser = (source) => ({ code: source.replace(/: [a-z]+/g, (m) => " ".repeat(m.length)), diagnostics: [] });
    const fe = await loadTypeScriptFrontend({ eraser: naive });
    const out = fe.compile("const n: number = 1", "/m.aktion.ts");
    expect(out.aktionSource).toBe("const n         = 1");
    expect(out.program).toEqual(parse("const n         = 1"));
  });

  it("the async loader and the sync constructor build the same frontend", async () => {
    const loaded = await loadTypeScriptFrontend();
    const src = "export const n: number = 2";
    expect(loaded.compile(src, "/m.aktion.ts")).toEqual(createTypeScriptFrontend().compile(src, "/m.aktion.ts"));
    expect(loaded.language).toBe("typescript");
  });

  it("the stand-in frontend says what to install", () => {
    const out = unavailableTypeScriptFrontend().compile("const n: number = 1", "/m.aktion.ts");
    expect(out.diagnostics).toEqual([
      { line: 1, column: 1, message: MISSING_ERASER_MESSAGE, severity: "error", code: "AKT-TS-MISSING" },
    ]);
    expect(MISSING_ERASER_MESSAGE).toBe("Compiling `.aktion.ts` needs the `ts-blank-space` package — `npm i -D ts-blank-space`.");
  });

  it("pins the internal `parseDiagnostics` field the syntax check relies on", () => {
    // Read straight from ts-blank-space's own TypeScript: if a TypeScript
    // upgrade renames the field, the syntax check would go silently blind.
    expect(compile("const = 1").diagnostics.some((d) => d.code === "AKT-TS-SYNTAX")).toBe(true);
  });
});
