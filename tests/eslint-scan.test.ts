import { describe, expect, it } from "vitest";
import { findBareExportInsertions } from "../src/eslint/scan.js";
import { applyInsertions } from "../src/eslint/remap.js";

/**
 * Applies the scan's own insertions to `source`, for readable assertions.
 */
function rewrite(source: string): string {
  const insertions = findBareExportInsertions(source).map(({ originalOffset }) => ({
    originalOffset,
    insertedLength: 6,
  }));
  return applyInsertions(source, insertions, "const ");
}

describe("findBareExportInsertions", () => {
  it("rewrites a bare `export IDENTIFIER =`", () => {
    expect(rewrite('export ENDPOINT = "https://example.com"')).toBe('export const ENDPOINT = "https://example.com"');
  });

  it("rewrites a bare `export $identifier =`", () => {
    expect(rewrite("export $messages = []")).toBe("export const $messages = []");
  });

  it("rewrites multiple occurrences across a file", () => {
    const source = "export A = 1\nexport $b = 2\nexport CCC = 3\n";
    expect(rewrite(source)).toBe("export const A = 1\nexport const $b = 2\nexport const CCC = 3\n");
  });

  it("preserves arbitrary whitespace between export and the identifier", () => {
    expect(rewrite("export    ENDPOINT = 1")).toBe("export    const ENDPOINT = 1");
  });

  it("preserves whitespace between the identifier and the equals sign", () => {
    expect(rewrite("export ENDPOINT   = 1")).toBe("export const ENDPOINT   = 1");
  });

  const alreadyValidExportSources: Record<string, string> = {
    function: "export function Foo() {}",
    async: "export async function Foo() {}",
    class: "export class Foo {}",
    let: "export let FOO = 1",
    const: "export const FOO = 1",
    var: "export var FOO = 1",
  };

  for (const [keyword, source] of Object.entries(alreadyValidExportSources)) {
    it(`does not rewrite an already-valid \`export ${keyword}\``, () => {
      expect(findBareExportInsertions(source)).toEqual([]);
    });
  }

  it("does not rewrite `export {` lists", () => {
    expect(findBareExportInsertions("export { a, b }")).toEqual([]);
  });

  it("does not rewrite `export *`", () => {
    expect(findBareExportInsertions('export * from "x"')).toEqual([]);
  });

  it("does not misfire on an identifier that merely starts with \"export\"", () => {
    expect(findBareExportInsertions("exportedValue = 1")).toEqual([]);
  });

  it("does not misfire on a property access named export (no identifier word follows)", () => {
    expect(findBareExportInsertions("obj.export = 5")).toEqual([]);
  });

  it("does not misfire on equality (`==`) after the identifier", () => {
    expect(findBareExportInsertions("export FOO == 1")).toEqual([]);
  });

  it("does not misfire on an arrow function (`=>`) after the identifier", () => {
    expect(findBareExportInsertions("export FOO => 1")).toEqual([]);
  });

  it("ignores the literal text `export NAME = ` inside a double-quoted string", () => {
    const source = 'export DOC = "example: export NAME = 1"';
    expect(rewrite(source)).toBe('export const DOC = "example: export NAME = 1"');
  });

  it("ignores the literal text `export NAME = ` inside a single-quoted string", () => {
    const source = "export DOC = 'example: export NAME = 1'";
    expect(rewrite(source)).toBe("export const DOC = 'example: export NAME = 1'");
  });

  it("ignores an escaped quote inside a string without ending the string early", () => {
    const source = String.raw`export DOC = "a \" export NAME = 1 quote"`;
    expect(rewrite(source)).toBe(String.raw`export const DOC = "a \" export NAME = 1 quote"`);
  });

  it("ignores the literal text `export NAME = ` inside a // line comment", () => {
    const source = "// export NAME = 1\nexport REAL = 2";
    expect(rewrite(source)).toBe("// export NAME = 1\nexport const REAL = 2");
  });

  it("ignores the literal text `export NAME = ` inside a block comment", () => {
    const source = "/* export NAME = 1 */\nexport REAL = 2";
    expect(rewrite(source)).toBe("/* export NAME = 1 */\nexport const REAL = 2");
  });

  it("ignores inert template-literal text but still scans real code inside ${…} interpolations", () => {
    // The backtick text itself is inert (never rewritten), but a nested
    // interpolation IS real Aktion code and must still be scanned.
    const source = "export MSG = `literal export NAME = 1 text ${(() => { export INNER = 1 })()}`";
    const rewritten = rewrite(source);
    expect(rewritten).toContain("export const MSG =");
    expect(rewritten).toContain("literal export NAME = 1 text");
    expect(rewritten).toContain("export const INNER = 1");
  });

  it("recurses into a nested template literal inside an interpolation", () => {
    const source = "export OUTER = `${`inner ${(() => { export NESTED = 1 })()}`}`";
    const rewritten = rewrite(source);
    expect(rewritten).toContain("export const OUTER =");
    expect(rewritten).toContain("export const NESTED = 1");
  });

  it("returns insertion offsets in ascending order", () => {
    const source = "export A = 1\nexport B = 2\nexport C = 3\n";
    const insertions = findBareExportInsertions(source);
    const offsets = insertions.map(insertion => insertion.originalOffset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(offsets).toHaveLength(3);
  });

  it("returns an empty list for a file with no bare exports", () => {
    const source = "export function Foo() { return 1 }\nconst x = 1\n";
    expect(findBareExportInsertions(source)).toEqual([]);
  });
});
