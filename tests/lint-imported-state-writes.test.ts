/**
 * `imported-state-write` (opt-in `{ importedStateWrites: true }`): a write to a
 * `$` atom the module imports, with a suggestion to write it from an exported
 * setter action in the owning module.
 */

import { describe, expect, it } from "vitest";
import { getLintWarnings } from "../src/language-api.js";

const on = { importedStateWrites: true } as const;
const lint = (source: string) => getLintWarnings(source, undefined, on);
const IMPORT = 'import { $open, $n, $o } from "./ui.aktion"\n';

describe("imported-state-write", () => {
  it.each([
    ["an assignment in a handler", '$app(Button("t", () => { $open = !$open }))'],
    ["an assignment in an expression-bodied lambda", 'const f = () => $open = true\n$app(Button("t", f))'],
    ["a compound assignment", '$app(Button("t", () => { $n += 1 }))'],
    ["a postfix increment", '$app(Button("t", () => { $n++ }))'],
    ["a prefix decrement", '$app(Button("t", () => { --$n }))'],
    ["a property write", '$app(Button("t", () => { $o.k = 1 }))'],
    ["a computed property write", '$app(Button("t", () => { $o["k"] = 1 }))'],
    ["an assignment nested in an if inside a function", "function go(x) { if (x) { $open = true } }"],
    ["an assignment in an effect", "$effect(() => { $open = true }, [$n])"],
    ["an assignment in a loop body", "for (const x of [1]) { $n = x }"],
  ])("flags %s", (_label, body) => {
    const warnings = lint(IMPORT + body);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe("warning");
    expect(warnings[0]!.line).toBe(2);
    expect(warnings[0]!.message).toMatch(/is imported from "\.\/ui\.aktion" and written here/);
    expect(warnings[0]!.message).toMatch(/no-import-assign/);
  });

  it("names the setter after the atom and the module that owns it", () => {
    const [warning] = lint('import { $mockClusters } from "../lib/api.aktion"\nfunction f(v) { $mockClusters = v }');
    expect(warning!.message).toContain("`$mockClusters` is imported from \"../lib/api.aktion\"");
    expect(warning!.message).toContain("export const setMockClusters = (value) => { $mockClusters = value }");
    expect(warning!.message).toContain("`setMockClusters(…)`");
  });

  it("names the setter after the name the owner exports when the import is aliased", () => {
    const [warning] = lint('import { $open as $isOpen } from "./ui.aktion"\nfunction f() { $isOpen = true }');
    expect(warning!.message).toContain("`$isOpen` is imported from \"./ui.aktion\"");
    expect(warning!.message).toContain("export const setOpen = (value) => { $open = value }");
    expect(warning!.message).not.toContain("setIsOpen");
    const [topLevel] = lint('import { $open as $isOpen } from "./ui.aktion"\n$isOpen = true');
    expect(topLevel!.message).toContain("`setOpen(…)`");
  });

  it("does not claim the runtime shares one cell for every write", () => {
    const [warning] = lint(`${IMPORT}function f() { $open = true }`);
    expect(warning!.message).toMatch(/private copy/);
    expect(warning!.message).toMatch(/does nothing/);
  });

  it("reports every write, each at its own position", () => {
    const warnings = lint(`${IMPORT}function f() {\n  $open = true\n  $n += 1\n  $o.k = 2\n}`);
    expect(warnings.map((w) => w.line)).toEqual([3, 4, 5]);
  });

  it("explains that a top-level write to an imported atom does nothing", () => {
    const warnings = lint(`${IMPORT}$open = true\n$app(Text("x"))`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.line).toBe(2);
    expect(warnings[0]!.message).toMatch(/set-once declaration/);
    expect(warnings[0]!.message).toMatch(/does nothing/);
  });

  it("uses the write wording, not the set-once one, for a top-level write nested in an if", () => {
    const [warning] = lint(`${IMPORT}if (true) { $open = true }`);
    expect(warning!.message).toMatch(/written here/);
    expect(warning!.message).not.toMatch(/set-once/);
  });

  it.each([
    ["a read", '$app(Text(`${$open} ${$n}`))'],
    ["a method call", '$app(Button("t", () => { $o.items.push(1) }))'],
    ["a write to the module's own atom", 'let $mine = 0\n$app(Button("t", () => { $mine = 1 }))'],
    ["a local declaration of the same name", "function f() { let $open = 1\n return $open }"],
    ["a call to an imported setter", 'import { setOpen } from "./ui.aktion"\n$app(Button("t", () => setOpen(true)))'],
    ["a property write on an imported store", 'import { ui } from "./store.aktion"\n$app(Button("t", () => { ui.open = true }))'],
    ["a write to an imported plain name", 'import { cache } from "./c.aktion"\n$app(Button("t", () => { cache = 1 }))'],
  ])("does not flag %s", (_label, body) => {
    expect(lint(IMPORT + body)).toEqual([]);
  });

  it("is off unless asked for", () => {
    const source = `${IMPORT}$app(Button("t", () => { $open = true }))`;
    expect(getLintWarnings(source)).toEqual([]);
    expect(getLintWarnings(source, undefined, { importedStateWrites: false })).toEqual([]);
  });

  it("is silent for a program without imports", () => {
    expect(lint('let $open = false\n$app(Button("t", () => { $open = true }))')).toEqual([]);
  });

  it("is silent on the setter pattern it recommends", () => {
    expect(lint("export let $open = false\nexport const setOpen = (value) => { $open = value }")).toEqual([]);
  });
});
