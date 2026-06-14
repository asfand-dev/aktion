/**
 * String-literal escape decoding (issue #5 from issues-to-fix.md).
 *
 * The lexer used to drop the backslash of an unrecognised escape, so
 * `"®"` rendered as the literal text `u00ae`. It now decodes the standard
 * JS escapes including `\uXXXX`, `\u{...}`, and `\xXX`.
 *
 * NB: the source strings double the backslash (`\\u`) so the Aktion lexer —
 * not the TypeScript compiler — sees the escape sequence.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser/index.js";

/** Parse `x = <literal>` and return the decoded string value. */
function literalValue(literalSource: string): string {
  const program = parse(`x = ${literalSource}`);
  expect(program.errors).toEqual([]);
  const stmt = program.statements.find(
    (s) => (s as { identifier?: string }).identifier === "x",
  ) as { expression: { value?: unknown } } | undefined;
  return String(stmt?.expression.value ?? "");
}

describe("#5 string escapes are decoded", () => {
  it("\\uXXXX decodes to its character", () => {
    expect(literalValue('"WireGuard\\u00ae"')).toBe("WireGuard®");
    expect(literalValue('"WireGuard\\u00ae"')).not.toContain("u00ae");
  });

  it("\\u{...} code-point escapes decode (including astral)", () => {
    expect(literalValue('"grin \\u{1F600}"')).toBe("grin \u{1F600}");
  });

  it("\\xXX hex escapes decode", () => {
    expect(literalValue('"\\x41\\x42"')).toBe("AB");
  });

  it("standard control escapes decode", () => {
    expect(literalValue('"a\\tb\\nc"')).toBe("a\tb\nc");
  });

  it("decodes inside template literals too", () => {
    expect(literalValue("`mark \\u00b7 dot`")).toBe("mark · dot");
  });

  it("a malformed escape degrades to literal characters (lexer never throws)", () => {
    // `\uZZ` is not valid — emit "u" then the following chars, no throw.
    expect(() => parse('x = "\\uZZ"')).not.toThrow();
    expect(literalValue('"\\uZZ"')).toBe("uZZ");
  });
});
