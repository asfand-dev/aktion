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
import { applyAdvice, moduleProblems, runAsModule } from "./fixtures/bare-advice.js";

const ON = { bareDeclarations: true };

/** `line:message-subject` for each bare-declaration warning, e.g. `1:export B`. */
function bare(src: string): string[] {
  return getLintWarnings(src, undefined, ON).map((d) => `${d.line}:${/^`([^`]+)`/.exec(d.message)![1]}`);
}

/** The first (only) warning for `src`, with the bare-declaration lint on. */
function only(src: string): { line: number; column: number; message: string } {
  const warnings = getLintWarnings(src, undefined, ON);
  expect(warnings).toHaveLength(1);
  return warnings[0]!;
}

describe("bare-declaration — what is flagged", () => {
  it.each([
    ["an exported bare constant", "export B = 1", ["1:export B"]],
    ["an exported bare state atom", "export $s = 4", ["1:export $s"]],
    ["a first bare top-level binding", "y = 4", ["1:y"]],
    ["a first bare top-level state atom", "$count = 0", ["1:$count"]],
    ["each distinct bare name once", "a = 1\nb = 2\nc = 3", ["1:a", "2:b", "3:c"]],
    ["a bare export even after the name was declared", "let B = 1\nexport B = 2", ["2:export B"]],
    ["a bare export of a name a function declares", "export go = 2\nfunction go() {}", ["1:export go"]],
    ["a second bare export of the same name", "export B = 1\nexport B = 2", ["1:export B", "2:export B"]],
    ["a bare export of a name an exported hook declares", "export function $useX() { return 1 }\nexport $useX = 2", ["2:export $useX"]],
    ["a plain `useX` is not the hook `$useX`", "function $useX() { return 1 }\nuseX = 2", ["2:useX"]],
    ["a bare export of a destructured name", "const o = { B: 1 }\nconst { B } = o\nexport B = 2", ["3:export B"]],
    ["a bare export of an imported name", 'import { B } from "./other.aktion"\nexport B = 2', ["2:export B"]],
    ["a bare export of a `const` name", "const B = 1\nexport B = 2", ["2:export B"]],
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
    ["an assignment BEFORE a hoisted function of that name", "go = 2\nfunction go() {}"],
    ["an assignment BEFORE a component of that name", 'Row = 2\nfunction Row() { return Text("x") }'],
    ["an assignment BEFORE a `var` of that name", "y = 1\nvar y"],
    ["an assignment to a hook, written with its `$`", "function $useX() { return 1 }\n$useX = 2"],
    ["an assignment BEFORE a hook of that name", "$useX = 2\nfunction $useX() { return 1 }"],
    ["the writable legacy root `aktion`", 'aktion = Column([Text("x")])'],
    ["the writable legacy root `theme`", 'theme = $theme({ colors: {} })'],
    ["a keyword-less `for (x of …)` head", "const xs = [1]\nfor (x of xs) { }"],
    ["a keyword-less `for (k in …)` head", "const o = {}\nfor (k in o) { }"],
    ["an assignment BEFORE a `let` of that name", "y = 1\nlet y = 2"],
    ["an assignment BEFORE an import of that name", 'total = 1\nimport { total } from "./m.aktion"'],
    ["an assignment BEFORE a destructuring of that name", "a = 1\nconst { a } = $obj"],
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
    expect(w!.message).toMatch(/write `const` before the name/);
  });

  it.each([
    ["a plain name", "y = 4", [1, 1]],
    ["extra spaces before the `=`", "y   = 4", [1, 1]],
    ["an indented statement", "  y = 4", [1, 3]],
    ["an `export` binding starts at `export`", "export B = 1", [1, 1]],
    ["an `export` binding with extra spaces", "export   $s=4", [1, 1]],
    ["a state atom", "let a = 1\n$count = 0", [2, 1]],
  ])("starts the warning at the declaration, not the `=`: %s", (_name, src, [line, column]) => {
    const warning = getLintWarnings(src, undefined, ON)[0];
    expect([warning!.line, warning!.column]).toEqual([line, column]);
  });

  it.each([
    ["a name nothing else writes", "y = 4", "`const`"],
    ["a name assigned again", "y = 4\ny = 5", "`let`"],
    ["a name assigned again inside a function", "y = 4\nfunction f() { y = 5 }", "`let`"],
    ["a name changed by a compound assignment", "y = 4\ny += 1", "`let`"],
    ["a name incremented", "y = 4\ny++", "`let`"],
    ["a name only read", "y = 4\n$app(Text(String(y)))", "`const`"],
    ["a name a keyword-less `for…of` head assigns", "x = 0\nfor (x of [1, 2]) { }", "`let`"],
    ["a name a keyword-less `for…in` head assigns", "k = 0\nfor (k in { a: 1 }) { }", "`let`"],
    ["a name a keyword-less `for…of` head assigns, head first", "for (item of [1]) { }\nitem = 1", "`let`"],
    ["a name a keyword-less destructuring head assigns", "a = 0\nfor ([a] of [[1]]) { }", "`let`"],
    ["a name only a KEYWORDED `for…of` head declares", "x = 0\nfor (const x of [1, 2]) { }", "`const`"],
    ["a name whose member is written", "y = {}\ny.k = 1", "`const`"],
    ["a state atom, even if nothing writes it", "$n = 0", "`let`"],
    ["an exported name nothing writes", "export B = 1", "`export const`"],
    ["an exported name assigned again", "export B = 1\nB = 2", "`export let`"],
    ["an exported state atom", "export $s = 4", "`export let`"],
  ])("recommends only a keyword the program survives: %s", (_name, src, keyword) => {
    expect(getLintWarnings(src, undefined, ON)[0]!.message).toContain(`write ${keyword} before the name`);
  });

  it("explains that `const` on a state atom would be a TypeError", () => {
    expect(only("$n = 0\n$n = $n + 1").message).toMatch(/`const` would make that a TypeError/);
  });

  it("names the `export` forms for an exported binding", () => {
    const w = only("export B = 1");
    expect(w.message).toMatch(/`export B`/);
    expect(w.message).toMatch(/write `export const` before the name/);
  });

  it("leads with putting `export` on the declaration, not with dropping it", () => {
    const { message } = only("let B = 1\nexport B = 2");
    expect(message).toMatch(/`export B` writes to `B`, which another statement already declares/);
    expect(message).toMatch(/put `export` on the declaration/);
    expect(message.indexOf("put `export`")).toBeLessThan(message.indexOf("drop it here"));
    expect(message).toMatch(/If nothing imports `B`, dropping it here is enough/);
    expect(message).not.toMatch(/write `export/);
  });

  it.each([
    [
      "a destructured name: `export` cannot go on a destructuring",
      "const o = { B: 1 }\nconst { B } = o\nexport B = 2",
      [/a destructuring declares/, /not supported on a destructuring/, /Take `B` out of the pattern/, /`export let B = …`/],
      [/put `export` on the declaration/i],
    ],
    [
      "an imported name: it can be neither exported nor assigned",
      'import { B } from "./other.aktion"\nexport B = 2',
      [/which this file imports/, /neither assigned nor re-exported/, /import it under another local name/, /`export let B = …` here/],
      [/put `export` on the declaration/i, /drop the `export` here/],
    ],
    [
      "a renamed import: the specifier to rewrite is spelled with the imported name",
      'import { X as B } from "./other.aktion"\nexport B = 2',
      [
        /which this file imports/,
        /\(`import \{ X as … \}`, in place of `X as B`\)/,
        /`export let B = …` here/,
      ],
      [/`import \{ B as/, /put `export` on the declaration/i],
    ],
    [
      "a renamed state import",
      'import { $a as $b } from "./other.aktion"\nexport $b = 2',
      [/\(`import \{ \$a as … \}`, in place of `\$a as \$b`\)/, /`export let \$b = …` here/],
      [/`import \{ \$b as/],
    ],
    [
      "a `const` name: the declaration has to become `let`",
      "const B = 1\nexport B = 2",
      [
        /`export B` writes to `B`, but another statement declares it with `const`, and a `const` cannot be assigned/,
        /change its `const` to `let`/,
        /`export let B = …`/,
      ],
      [/which this assignment writes/],
    ],
    [
      "an exported `const` name: only the `const` is wrong",
      "export const B = 1\nexport B = 2",
      [
        /`export B` writes to `B`, but its own exported declaration declares it with `const`, and a `const` cannot be assigned/,
        /Change that `const` to `let`/,
        /drop the `export` here/,
      ],
      [/put `export`/i, /which this assignment writes/],
    ],
  ])("gives accurate advice for %s", (_name, src, present, absent) => {
    const { message } = only(src);
    for (const pattern of present) expect(message).toMatch(pattern);
    for (const pattern of absent) expect(message).not.toMatch(pattern);
  });

  it("only says to drop the `export` when the declaration already carries one", () => {
    for (const src of ["export let B = 1\nexport B = 2", "export B = 1\nexport B = 2", "export function $useX() { return 1 }\nexport $useX = 2"]) {
      const message = getLintWarnings(src, undefined, ON).at(-1)!.message;
      expect(message, src).toMatch(/already exported/);
      expect(message, src).not.toMatch(/put `export`/);
    }
  });

  it("is a warning only: the program still parses with no errors", () => {
    expect(parse("export B = 1\ny = 4\nexport $s = 4").errors).toEqual([]);
  });
});

/**
 * The advice has to be right, not just plausible: every program below is flagged,
 * and applying exactly what the warnings say must give a program that parses as an
 * ES module with no const write or redeclaration (ESLint), that Node runs (no
 * SyntaxError, no TypeError), and that the lint no longer flags. Each of these
 * once failed: `export let B` after `let B`, `let go` over a `function go`,
 * `const $n` followed by a write, `const x` followed by `for (x of …)`, and
 * `let $useX` over `function $useX`.
 *
 * The importer half of the export advice (dropping an `export` must not take a
 * name out of the module's exports) is in `validate-tools.test.ts`, which links
 * real modules.
 */
describe("bare-declaration — following the advice gives valid JavaScript", () => {
  it.each([
    ["a first plain constant", "y = 4\nconsole.log(y)"],
    ["a plain name written again", "y = 4\ny = y + 1"],
    ["a plain name incremented", "y = 4\ny++"],
    ["a plain name changed by a compound assignment", "y = 4\ny += 1"],
    ["a plain name a `for…of` head assigns", "x = 0\nfor (x of [1, 2]) { }"],
    ["a plain name a `for…in` head assigns", "k = 0\nfor (k in { a: 1 }) { }"],
    ["a plain name a destructuring `for…of` head assigns", "a = 0\nfor ([a] of [[1]]) { }"],
    ["a plain name only a keyworded loop declares", "x = 0\nfor (const x of [1, 2]) { }\nconsole.log(x)"],
    ["a state atom written again", "$n = 0\n$n = $n + 1"],
    ["a state atom written inside a function", "$n = 0\nfunction bump() { $n = $n + 1 }\nbump()"],
    ["an exported constant", "export B = 1"],
    ["an exported name written again", "export B = 1\nB = 2"],
    ["an exported state atom", "export $s = 4"],
    ["an export of a name `let` already declared", "let B = 1\nexport B = 2"],
    ["an export of a name an earlier bare assignment declares", "B = 1\nexport B = 2"],
    ["an export of a name that is already exported", "export let B = 1\nexport B = 2"],
    ["two bare exports of one name", "export B = 1\nexport B = 2"],
    ["an export of a name a function declares", "export go = 2\nfunction go() {}"],
    ["an export of a name an exported hook declares", "export function $useX() { return 1 }\nexport $useX = 2"],
    ["a plain `useX` beside a hook `$useX`", "function $useX() { return 1 }\nuseX = 2"],
  ])("%s", (_name, src) => {
    const warnings = getLintWarnings(src, undefined, ON);
    expect(warnings.length).toBeGreaterThan(0);
    const fixed = applyAdvice(src, warnings);
    expect(moduleProblems(fixed), fixed).toEqual([]);
    expect(() => runAsModule(fixed), fixed).not.toThrow();
    expect(getLintWarnings(fixed, undefined, ON), fixed).toEqual([]);
  });
});

/**
 * The `export` of a name that an import, a destructuring or a `const` declares has
 * advice of its own: `export` cannot go on an import or inside a destructuring, and
 * a `const` cannot be assigned. The advised program must be valid and clear the
 * lint. The imported-from module does not exist here, so that row is parsed and
 * linted but not run; `validate-tools.test.ts` links the real pairs.
 */
describe("bare-declaration — advice for an export of an import, destructuring or const", () => {
  it.each([
    ["a destructured name", "const o = { B: 1 }\nconst { B } = o\nexport B = 2", true],
    ["one name of a larger destructuring", "const o = { A: 1, B: 2 }\nconst { A, B } = o\nexport B = 2", true],
    ["an imported name", 'import { B } from "./other.mjs"\nexport B = 2', false],
    ["a renamed import", 'import { X as B } from "./other.mjs"\nexport B = 2', false],
    ["a renamed state import", 'import { $a as $b } from "./other.mjs"\nexport $b = 2', false],
    ["a `const` name", "const B = 1\nexport B = 2", true],
    ["an exported `const` name", "export const B = 1\nexport B = 2", true],
  ])("%s", (_name, src, runnable) => {
    const warnings = getLintWarnings(src, undefined, ON);
    expect(warnings.length).toBeGreaterThan(0);
    const fixed = applyAdvice(src, warnings);
    expect(moduleProblems(fixed), fixed).toEqual([]);
    if (runnable) expect(() => runAsModule(fixed), fixed).not.toThrow();
    expect(getLintWarnings(fixed, undefined, ON), fixed).toEqual([]);
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
