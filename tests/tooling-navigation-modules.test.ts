/**
 * `findDeclaration` — how the LSP server and the VS Code extension land on an
 * imported name inside another module — must reach the MODULE-LEVEL
 * declaration: what a module exports is never a helper nested in a body or an
 * assignment inside a call. Both shapes below are valid `.aktion.js` modules
 * (`compileJavaScriptModule` accepts them with no diagnostics), and `.aktion.ts`
 * / `.aktion.js` modules declare with `let` / `const`, which the `.aktion`
 * symbol scan does not record.
 */
import { describe, expect, it } from "vitest";
import { compileJavaScriptModule } from "../src/compiler/frontend.js";
import { findDeclaration, getDefinition, getDocumentSymbols } from "../src/tooling/navigation.js";

// A nested helper declared BEFORE the exported function of the same name.
const NESTED_HELPER = [
  "export let $open = false;",
  "export function Panel() {",
  "  function toggle() { $open = !$open; }",
  '  return Button("x", { onClick: toggle });',
  "}",
  "export function toggle() { $open = !$open; }",
  "$app(Panel())",
  "",
].join("\n");

// An assignment at the start of a line inside a multi-line call.
const ASSIGNMENT_IN_CALL = [
  'export let $q = "";',
  "$effect(() =>",
  "  $q = $q.trim()",
  ", [$q]);",
  '$app(Text($q))',
  "",
].join("\n");

// A module-level reassignment after the `export let` that declares the atom.
const REASSIGNED = ["export let $items = [];", "$items = load();", "function load() { return [1, 2]; }", "$app(Text(String($items)))", ""].join("\n");

// The same, with the declaration spanning lines.
const REASSIGNED_MULTILINE = ["// items", "export let $b = [", "  1,", "];", "$b = [2];", "$app(Text(String($b)))", ""].join("\n");

describe("findDeclaration in .aktion.ts / .aktion.js modules", () => {
  it("every module compiles", () => {
    for (const source of [NESTED_HELPER, ASSIGNMENT_IN_CALL, REASSIGNED, REASSIGNED_MULTILINE]) {
      const out = compileJavaScriptModule(source, "/m.aktion.js");
      expect(out.program.errors).toEqual([]);
      expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    }
  });

  it("prefers the exported function over a same-named helper nested in a component", () => {
    expect(findDeclaration(NESTED_HELPER, "toggle", false)?.start).toEqual({ line: 6, column: 17 });
  });

  it("lands on `export let $q`, not on an assignment inside a multi-line call", () => {
    expect(findDeclaration(ASSIGNMENT_IN_CALL, "q", true)?.start).toEqual({ line: 1, column: 12 });
  });

  it("lands on `export let`, not on a module-level reassignment after it", () => {
    expect(findDeclaration(REASSIGNED, "items", true)?.start).toEqual({ line: 1, column: 12 });
    expect(findDeclaration(REASSIGNED_MULTILINE, "b", true)?.start).toEqual({ line: 2, column: 12 });
  });

  it("…which is never a declaration in a module: `$x = …` without `let` is E125", () => {
    const out = compileJavaScriptModule("$items = [];\n$app(Text(String($items)))\n", "/m.aktion.js");
    expect(out.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["E125"]);
  });

  it("still finds a nested helper when nothing at module level has the name", () => {
    const source = "export function Panel() {\n  function helper() { return 1; }\n  return Text(String(helper()));\n}\n";
    expect(findDeclaration(source, "helper", false)?.start).toEqual({ line: 2, column: 12 });
  });

  it("an import of the name is not a declaration in this file", () => {
    const source = 'import { toggle } from "./other.aktion.js";\nexport function Panel() {\n  function toggle() {}\n}\n';
    expect(findDeclaration(source, "toggle", false)).toBeNull();
  });
});

describe("the `.aktion` symbol scan ignores `$x =` inside parentheses", () => {
  const source = ['$q = ""', "$effect(() =>", "  $q = $q.trim()", ", [$q])", "$app(Text($q))", ""].join("\n");

  it("go-to-definition from the assignment goes to the declaration", () => {
    expect(getDefinition(source, { line: 3, column: 4 })?.start).toEqual({ line: 1, column: 1 });
  });

  it("the outline lists the atom once", () => {
    expect(getDocumentSymbols(source).map((symbol) => `${symbol.name}@${symbol.range.start.line}`)).toEqual(["$q@1"]);
  });

  it("an assignment inside a call is not listed as a declaration", () => {
    const writesOnly = ["$effect(() =>", "  $seen = true", ", [])", ""].join("\n");
    expect(getDocumentSymbols(writesOnly)).toEqual([]);
  });
});
