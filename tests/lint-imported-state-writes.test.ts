/**
 * `imported-state-write` (on by default, off with `{ importedStateWrites: false }`): a write to a
 * `$` atom the module imports, with a suggestion to write it from an exported
 * setter action in the owning module.
 */

import { describe, expect, it } from "vitest";
import { getDiagnostics, getLintWarnings } from "../src/language-api.js";
import { defaultLibrary } from "../src/library/index.js";

const lint = (source: string) => getLintWarnings(source);
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
    expect(warning!.message).toContain("`export const setMockClusters = (value) => { $… = value }`");
    expect(warning!.message).toContain("(`$mockClusters` when \"../lib/api.aktion\" is that module)");
    expect(warning!.message).toContain("`setMockClusters(…)`");
  });

  it("says the setter belongs in the module that declares the atom, and what to do for a re-export", () => {
    const [warning] = lint(`${IMPORT}function f() { $open = true }`);
    expect(warning!.message).toContain("Keep the write in the module that declares the atom (`export let $…`)");
    expect(warning!.message).toContain("assigning the atom under the name that module declares it with");
    expect(warning!.message).toContain(
      'If "./ui.aktion" only re-exports the atom (`export { … } from`), add the setter to the declaring module and re-export it from "./ui.aktion".',
    );
  });

  it("names the setter after the name the owner exports when the import is aliased", () => {
    const [warning] = lint('import { $open as $isOpen } from "./ui.aktion"\nfunction f() { $isOpen = true }');
    expect(warning!.message).toContain("`$isOpen` is imported from \"./ui.aktion\"");
    expect(warning!.message).toContain("`export const setOpen = (value) => { $… = value }`");
    expect(warning!.message).toContain("`$open` when \"./ui.aktion\" is that module");
    expect(warning!.message).not.toContain("setIsOpen");
    const [topLevel] = lint('import { $open as $isOpen } from "./ui.aktion"\n$isOpen = true');
    expect(topLevel!.message).toContain("`setOpen(…)`");
  });

  it("does not claim the runtime shares one cell for every write", () => {
    const [warning] = lint(`${IMPORT}function f() { $open = true }`);
    expect(warning!.message).toMatch(/private copy/);
    expect(warning!.message).toMatch(/does nothing/);
  });

  /**
   * `$` names are not scoped: a `$` parameter or loop binding is a parse error and a nested `let` / `const`
   * of an imported name writes the shared atom (measured, see tests/cross-module-state.test.ts), so each is flagged.
   */
  it.each([
    ["let in a function", "function f() { let $open = 1\n $open = 2 }", [2, 3]],
    ["let in a handler", 'Button("t", () => { let $open = 1\n $open = 2 })', [2, 3]],
    ["const in a handler", 'Button("t", () => { const $open = 1 })', [2]],
    ["let in an inner block, with a write before and after it", "function f() { $open = 0\n if (true) { let $open = 1\n $open = 2 }\n $open = 3 }", [2, 3, 4, 5]],
  ])("flags a nested declaration of an imported name as a write: %s", (_label, body, lines) => {
    expect(lint(IMPORT + body).map((w) => w.line)).toEqual(lines);
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
    ["a top-level declaration of the same name, which declares nothing new", "let $open = 1"],
    ["delete on a property, which changes nothing at run time", "function f() { delete $o.k }"],
    ["a call to an imported setter", 'import { setOpen } from "./ui.aktion"\n$app(Button("t", () => setOpen(true)))'],
    ["a property write on an imported store", 'import { ui } from "./store.aktion"\n$app(Button("t", () => { ui.open = true }))'],
    ["a write to an imported plain name", 'import { cache } from "./c.aktion"\n$app(Button("t", () => { cache = 1 }))'],
  ])("does not flag %s", (_label, body) => {
    expect(lint(IMPORT + body)).toEqual([]);
  });

  it("is on by default in getLintWarnings and getDiagnostics, and an explicit true changes nothing", () => {
    const source = `${IMPORT}$app(Button("t", () => { $open = true }))`;
    expect(getLintWarnings(source)).toHaveLength(1);
    expect(getLintWarnings(source, defaultLibrary)).toHaveLength(1);
    expect(getLintWarnings(source, undefined, {})).toHaveLength(1);
    expect(getLintWarnings(source, undefined, { importedStateWrites: true })).toEqual(getLintWarnings(source));
    const diagnostics = getDiagnostics(source, defaultLibrary);
    expect(diagnostics.map((d) => d.severity)).toEqual(["warning"]);
    expect(diagnostics[0]!.message).toMatch(/is imported from "\.\/ui\.aktion" and written here/);
  });

  it("is turned off with importedStateWrites: false, in getLintWarnings and getDiagnostics", () => {
    const source = `${IMPORT}$app(Button("t", () => { $open = true }))`;
    expect(getLintWarnings(source, undefined, { importedStateWrites: false })).toEqual([]);
    expect(getDiagnostics(source, defaultLibrary, { importedStateWrites: false })).toEqual([]);
  });

  it("leaves the other lints alone when it is turned off", () => {
    const source = 'function f(v) { const ok = await $util.copy(v)\n return ok }\n' + IMPORT + "$open = true";
    const withLint = getLintWarnings(source).filter((w) => !/imported from/.test(w.message));
    expect(withLint.length).toBeGreaterThan(0);
    expect(getLintWarnings(source, undefined, { importedStateWrites: false })).toEqual(withLint);
  });

  it("is silent for a program without imports", () => {
    expect(lint('let $open = false\n$app(Button("t", () => { $open = true }))')).toEqual([]);
  });

  it("is silent on the setter pattern it recommends", () => {
    expect(lint("export let $open = false\nexport const setOpen = (value) => { $open = value }")).toEqual([]);
  });
});

/**
 * A barrel (`export { $open } from "./store.aktion"`) is a new path to an atom.
 * The lint reads one file, so for an import it knows only the name the module it
 * imports FROM exports: the setter follows that name, and the message sends the
 * reader to that module, which is the barrel, not the file that declares the atom.
 */
describe("imported-state-write — atoms imported through a re-export", () => {
  it("flags a direct write to an atom imported from a barrel and names the barrel", () => {
    const warnings = lint('import { $open } from "./index.aktion"\n$app(Button("t", () => { $open = !$open }))');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.line).toBe(2);
    expect(warnings[0]!.message).toContain('`$open` is imported from "./index.aktion" and written here');
    expect(warnings[0]!.message).toContain("`setOpen(…)`");
  });

  it("names the setter after the name the barrel exports, not the name the store declares", () => {
    // index.aktion: `export { $open as $isOpen } from "./store.aktion"`
    const [aliased] = lint('import { $isOpen } from "./index.aktion"\nfunction f() { $isOpen = true }');
    expect(aliased!.message).toContain("`export const setIsOpen = (value) => { $… = value }`");
    expect(aliased!.message).not.toContain("setOpen");
    // the importer renames it again: still the name the barrel exports
    const [renamed] = lint('import { $isOpen as $o } from "./index.aktion"\nfunction f() { $o = true }');
    expect(renamed!.message).toContain("`$o` is imported from \"./index.aktion\"");
    expect(renamed!.message).toContain("`setIsOpen(…)`");
  });

  it("flags a write to a barrel atom at the top level with the set-once wording", () => {
    const [warning] = lint('import { $isOpen } from "./index.aktion"\n$isOpen = true');
    expect(warning!.message).toMatch(/set-once declaration/);
    expect(warning!.message).toContain("`setIsOpen(…)`");
  });

  it("is silent on the barrel itself, which only re-exports", () => {
    expect(lint('export { $open } from "./store.aktion"\nexport { $open as $isOpen } from "./store.aktion"')).toEqual([]);
    expect(lint('import { $open } from "./store.aktion"\nexport { $open }')).toEqual([]);
  });
});
