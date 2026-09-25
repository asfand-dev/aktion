import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  describe("regex literals (as opposed to a division `/`)", () => {
    it("does not let text inside a real regex literal corrupt into a bare export (the Copilot-reported bug)", () => {
      // `export NAME = 1` sitting INSIDE the regex pattern must never be
      // treated as a second bare export — only the outer `export PATTERN =`
      // is a real insertion point.
      const source = "export PATTERN = /export NAME = 1/";
      expect(findBareExportInsertions(source)).toEqual([{ originalOffset: 7 }]);
      expect(rewrite(source)).toBe("export const PATTERN = /export NAME = 1/");
    });

    it("does not let a quote character inside a regex character class start a phantom string literal (the older KNOWN LIMITATION)", () => {
      const source = "export QUOTE_RE = /['\"]/\nexport REAL = 2\n";
      expect(rewrite(source)).toBe("export const QUOTE_RE = /['\"]/\nexport const REAL = 2\n");
    });

    it("resumes scanning correctly after a regex literal and still finds a real bare export on the next line", () => {
      const source = "export RE = /abc/gi\nexport NEXT = 3\n";
      expect(rewrite(source)).toBe("export const RE = /abc/gi\nexport const NEXT = 3\n");
    });

    it("treats `/` as division (not a regex) right after a value, so it does not swallow a following bare export", () => {
      // If the first `/` (right after identifier `a`, a value — division
      // context) were wrongly treated as a regex-open, it would scan forward
      // to the SECOND `/` on the line as the "closing" delimiter, swallowing
      // `export NAME = 1` inside a phantom regex span and missing its
      // insertion entirely.
      const source = "export RATIO = a / export NAME = 1 / b\nexport NEXT = 3\n";
      const rewritten = rewrite(source);
      expect(rewritten).toContain("export const RATIO =");
      expect(rewritten).toContain("export const NAME = 1");
      expect(rewritten).toContain("export const NEXT = 3");
    });

    it("does not misdetect a plain division expression as a regex start", () => {
      const source = "export RATIO = a / b\nexport NEXT = 3\n";
      expect(rewrite(source)).toBe("export const RATIO = a / b\nexport const NEXT = 3\n");
    });

    it("treats `/` as division after a hex number literal", () => {
      const source = "export A = 0xFF / 2\nexport NEXT = 4\n";
      expect(rewrite(source)).toBe("export const A = 0xFF / 2\nexport const NEXT = 4\n");
    });

    it("treats `/` as division after a number literal with a decimal exponent", () => {
      const source = "export A = 1.5e10 / 2\nexport NEXT = 4\n";
      expect(rewrite(source)).toBe("export const A = 1.5e10 / 2\nexport const NEXT = 4\n");
    });

    it("matches this repo's own corpus: the real `.replace(/^www\\./, \"\")` regex used in docs/demos/mini-apps/news-reader.aktion", () => {
      // `news-reader.aktion` doesn't happen to use a bare top-level `export`
      // for this constant (it's a plain assignment, `domainOf = url => …`),
      // so this reproduces the SAME real regex pattern from that file in the
      // bare-export shape this scanner exists to fix, rather than reusing a
      // path that doesn't carry the construct under test.
      const source = 'export DOMAIN_STRIP = url => url.replace(/^www\\./, "")\n';
      expect(rewrite(source)).toBe('export const DOMAIN_STRIP = url => url.replace(/^www\\./, "")\n');
    });

    it("confirms the real regex-bearing corpus files parse cleanly through the full scan (not just a copied pattern)", () => {
      // `news-reader.aktion` and `pokedex.aktion` are two real, in-tree
      // `docs/demos/mini-apps/*.aktion` files containing genuine regex
      // literals (`.replace(/^www\./, "")`, `.replace(/-/g, " ")`) — see
      // `tests/eslint-corpus-sweep.test.ts` for the full-pipeline sweep over
      // every corpus file, including these two. This assertion just confirms
      // the scan itself doesn't produce any insertion inside either file's
      // regex text (both files have no top-level bare `export` at all, so
      // the correct result is zero insertions, not a corrupted one hiding
      // inside the regex).
      const root = join(__dirname, "..");
      for (const relPath of ["docs/demos/mini-apps/news-reader.aktion", "docs/demos/mini-apps/pokedex.aktion"]) {
        const source = readFileSync(join(root, relPath), "utf8");
        expect(source).toMatch(/\/[^/\n]*\//);
        expect(findBareExportInsertions(source)).toEqual([]);
      }
    });

    it("matches the real in-repo corpus: two real regex-shaped bare exports mirrored from the pattern style used in docs/demos/mini-apps/pokedex.aktion", () => {
      // `pokedex.aktion` itself uses `.replace(/-/g, " ")` inline (not as a
      // bare export), so this constructs the bare-export shape this module
      // targets using the SAME pattern text and flags, exercising both a
      // simple pattern and a following real bare export on the next line.
      const source = ["export SLUG_SEPARATOR = /-/g;", "export MAX_NAME_LENGTH = 255;"].join("\n");
      const rewritten = rewrite(source);
      expect(rewritten).toContain("export const SLUG_SEPARATOR = /-/g;");
      expect(rewritten).toContain("export const MAX_NAME_LENGTH = 255;");
    });
  });
});
