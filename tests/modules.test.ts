/**
 * Multi-file module syntax: parser AST shape + the runtime treating `Import`
 * as a no-op. (Linking is covered in tests/linker.test.ts.)
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";
import { parse } from "../src/parser/index.js";

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

describe("parser: import", () => {
  it("parses named imports with aliases", () => {
    const program = parse(`import { A, B as C } from "./x.aktion"`);
    expect(program.errors).toEqual([]);
    expect(program.statements[0]).toEqual({
      kind: "Import",
      source: "./x.aktion",
      specifiers: [
        { imported: "A", local: "A" },
        { imported: "B", local: "C" },
      ],
      loc: expect.any(Object),
    });
  });

  it("parses `$state` imports (bare names + isState)", () => {
    const program = parse(`import { $shared, $a as $b } from "./state.aktion"`);
    expect(program.errors).toEqual([]);
    const stmt = program.statements[0];
    expect(stmt).toMatchObject({
      kind: "Import",
      specifiers: [
        { imported: "shared", local: "shared", isState: true },
        { imported: "a", local: "b", isState: true },
      ],
    });
  });

  it("rejects mismatched `$`-ness across `as`", () => {
    expect(parse(`import { $a as b } from "./x.aktion"`).errors.length).toBeGreaterThan(0);
    expect(parse(`import { a as $b } from "./x.aktion"`).errors.length).toBeGreaterThan(0);
  });

  it("errors when `from` or the source string is missing", () => {
    expect(parse(`import { A } "./x.aktion"`).errors.length).toBeGreaterThan(0);
    expect(parse(`import { A } from`).errors.length).toBeGreaterThan(0);
  });
});

describe("parser: export", () => {
  it("marks an exported component declaration", () => {
    const program = parse(`export function Card2() { return Text("x") }`);
    expect(program.errors).toEqual([]);
    expect(program.statements[0]).toMatchObject({ kind: "ComponentDeclaration", name: "Card2", exported: true });
  });

  it("marks an exported `$state` assignment", () => {
    const program = parse(`export $count = 0`);
    expect(program.errors).toEqual([]);
    expect(program.statements[0]).toMatchObject({ kind: "Assignment", identifier: "count", isState: true, exported: true });
  });

  it("marks an exported plain binding", () => {
    const program = parse(`export greeting = Text("hi")`);
    expect(program.errors).toEqual([]);
    expect(program.statements[0]).toMatchObject({ kind: "Assignment", identifier: "greeting", exported: true });
  });

  it("marks an exported action + hook declaration", () => {
    expect(parse(`export function bump() { $n = $n + 1 }`).statements[0]).toMatchObject({
      kind: "ActionDeclaration",
      name: "bump",
      exported: true,
    });
    expect(parse(`export function $useCounter() { return 1 }`).statements[0]).toMatchObject({
      kind: "HookDeclaration",
      name: "useCounter",
      exported: true,
    });
  });

  it("rejects `export { … }` lists and `export <destructure>` with clear errors", () => {
    expect(parse(`export { a, b }`).errors[0]?.message).toMatch(/not supported/i);
    expect(parse(`export let { a, b } = obj`).errors[0]?.message).toMatch(/destructuring/i);
  });

  it("keeps `from` / `as` usable as ordinary identifiers", () => {
    const program = parse(`from = 1\nas = 2\naktion = Text(from + as)`);
    expect(program.errors).toEqual([]);
  });
});

describe("runtime tolerates module syntax (no-op)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("ignores `Import` and `exported` in a streamed single-file program", async () => {
    const el = document.createElement("aktion-app") as HTMLElement & { setResponse(t: string): void };
    document.body.appendChild(el);
    el.setResponse(`import { Helper } from "./other.aktion"\nexport $count = 0\naktion = Text("hello")`);
    await flush();
    await flush();
    // The import/export are ignored; the rest renders normally.
    expect(el.shadowRoot!.textContent).toContain("hello");
  });
});
