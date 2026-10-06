/**
 * `bare-declaration` lint: a top-level binding written without `let` / `const`.
 *
 * The parser accepts `export B = 1`, `export $s = 4` and a first `y = 4`, and the
 * AST records the keyword on `Assignment.declaration` (undefined for the bare
 * form). The lint is opt-in because the system prompt, the agent skill and the
 * bundled demos all teach the keyword-less `$x = 0`; the validators turn it on.
 */

import { describe, expect, it } from "vitest";
import { getDiagnostics, getLintWarnings } from "../src/tooling/language-service.js";
import { defaultLibrary } from "../src/library/index.js";
import { parse } from "../src/parser/index.js";
import { formatProgram } from "../src/tooling/formatter.js";

const ON = { bareDeclarations: true };

/** `line:message-subject` for each bare-declaration warning, e.g. `1:export B`. */
function bare(src: string): string[] {
  return getLintWarnings(src, undefined, ON)
    .filter((d) => d.message.includes("without a keyword"))
    .map((d) => `${d.line}:${/^`([^`]+)`/.exec(d.message)![1]}`);
}

describe("bare-declaration — what is flagged", () => {
  it.each([
    ["an exported bare constant", "export B = 1", ["1:export B"]],
    ["an exported bare state atom", "export $s = 4", ["1:export $s"]],
    ["a first bare top-level binding", "y = 4", ["1:y"]],
    ["a first bare top-level state atom", "$count = 0", ["1:$count"]],
    ["each distinct bare name once", "a = 1\nb = 2\nc = 3", ["1:a", "2:b", "3:c"]],
    ["a bare export even after the name was declared", "let B = 1\nexport B = 2", ["2:export B"]],
    ["a bare declaration after an unrelated declared one", "const a = 1\nb = 2", ["2:b"]],
    ["only the first of repeated bare writes", "y = 4\ny = 5\ny = 6", ["1:y"]],
    ["`$x` separately from `x`", "let x = 1\n$x = 2", ["2:$x"]],
  ])("%s", (_name, src, expected) => {
    expect(bare(src)).toEqual(expected);
  });
});

describe("bare-declaration — what is not flagged", () => {
  it.each([
    ["let", "let a = 1"],
    ["const", "const a = 1"],
    ["var", "var a = 1"],
    ["export let", "export let a = 1"],
    ["export const", "export const a = 1"],
    ["export let of a state atom", "export let $s = 4"],
    ["a state atom declared with let", "let $count = 0"],
    ["an uninitialised `let a`", "let a"],
    ["an uninitialised `var a`", "var a"],
    ["an exported uninitialised `export let a`", "export let a"],
    ["a later plain assignment to a declared binding", "let y = 4\ny = 5"],
    ["a later plain assignment to a const-declared state atom", "let $y = 4\n$y = 5"],
    ["a later plain assignment to a bare-declared binding (only the first is flagged)", "const y = 4\ny = 5\ny = 6"],
    ["a plain assignment to an imported name", 'import { total } from "./m.aktion"\ntotal = 1'],
    ["a plain assignment to an imported state atom", 'import { $total } from "./m.aktion"\n$total = 1'],
    ["a plain assignment to a function name", "function go() { return 1 }\ngo = 2"],
    ["a plain assignment to a destructured name", "const { a, b } = $obj\na = 1"],
    ["a compound assignment", "let n = 1\nn += 1"],
    ["a bare assignment inside a function body", "function f() {\n  total = 1\n  return total\n}"],
    ["a bare assignment inside an `if` block", "let a = 1\nif (a) { w = 1 }"],
    ["a member assignment", "const h = {}\nh.k = 3"],
  ])("%s", (_name, src) => {
    expect(bare(src)).toEqual([]);
  });
});

describe("bare-declaration — reporting", () => {
  it("points at the statement and names the fix", () => {
    const [w] = getLintWarnings("let a = 1\n\ny = 4\n", undefined, ON);
    expect(w).toMatchObject({ line: 3, column: 1, severity: "warning" });
    expect(w!.message).toMatch(/`y` declares a binding without a keyword/);
    expect(w!.message).toMatch(/`let` or `const`/);
  });

  it.each([
    ["a plain name", "y = 4", [1, 1]],
    ["extra spaces before the `=`", "y   = 4", [1, 1]],
    ["an indented statement", "  y = 4", [1, 3]],
    ["an `export` binding starts at `export`", "export B = 1", [1, 1]],
    ["an `export` binding with extra spaces", "export   $s=4", [1, 1]],
    ["a state atom", "let a = 1\n$count = 0", [2, 1]],
  ])("starts the warning at the declaration, not the `=`: %s", (_name, src, [line, column]) => {
    const warning = getLintWarnings(src, undefined, ON).find((d) => d.message.includes("without a keyword"));
    expect([warning!.line, warning!.column]).toEqual([line, column]);
  });

  it("names the `export` forms for an exported binding", () => {
    const [w] = getLintWarnings("export B = 1", undefined, ON);
    expect(w!.message).toMatch(/`export B`/);
    expect(w!.message).toMatch(/`export let` or `export const`/);
  });

  it("is a warning only: the program still parses with no errors", () => {
    expect(parse("export B = 1\ny = 4\nexport $s = 4").errors).toEqual([]);
  });
});

describe("bare-declaration — opt-in", () => {
  const src = "export B = 1\n$count = 0\n$app(Text(B))";

  it("stays silent by default, in both getLintWarnings and getDiagnostics", () => {
    expect(getLintWarnings(src)).toEqual([]);
    expect(getLintWarnings(src, defaultLibrary)).toEqual([]);
    expect(getDiagnostics(src, defaultLibrary)).toEqual([]);
    expect(getDiagnostics(src, defaultLibrary, { bareDeclarations: false })).toEqual([]);
  });

  it("surfaces in getLintWarnings and getDiagnostics once switched on", () => {
    expect(getLintWarnings(src, defaultLibrary, ON)).toHaveLength(2);
    const diagnostics = getDiagnostics(src, defaultLibrary, ON);
    expect(diagnostics.map((d) => d.severity)).toEqual(["warning", "warning"]);
  });

  it("does not change any other lint", () => {
    const withAwait = 'function f(v) { const ok = await $util.copy(v)\n return ok }\n$app(Text("x"))';
    expect(getLintWarnings(withAwait, defaultLibrary, ON)).toEqual(getLintWarnings(withAwait, defaultLibrary));
  });
});

describe("bare-declaration — the migration the message points at", () => {
  it("is mechanical: adding the keyword clears the warning and the formatter keeps it", () => {
    const fixed = "export const B = 1\nlet y = 4\nexport let $s = 4\n";
    expect(bare(fixed)).toEqual([]);
    const out = formatProgram(fixed);
    expect(out.warnings ?? []).toEqual([]);
    expect(out.formatted).toContain("export const B = 1");
    expect(out.formatted).toContain("export let $s = 4");
  });
});
