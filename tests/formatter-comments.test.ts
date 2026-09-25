/**
 * `formatProgram` / `printProgram` — comment preservation.
 *
 * Before this change the printer was `printProgram(parse(source))` with zero
 * comment representation anywhere in the AST — `formatProgram` silently
 * dropped every `//` and `/* *\/` comment in the input. That made write-mode
 * formatting unusable on real, heavily-documented code (measured: 162 of the
 * 165 `.aktion` files in this repo's own corpus carry at least one comment —
 * see `tests/formatter-idempotency-sweep.test.ts`'s "keep their comments"
 * describe block for the full sweep and its one documented, measured gap).
 *
 * Scope (see `src/parser/parser.ts`'s `attachComments` doc comment for the
 * full design): comments are attached at STATEMENT granularity — as
 * `leadingComments` on the statement immediately following them, or
 * `trailingComments` on the statement whose own last line they share — plus
 * one narrower extension for a `case`/`default` header (`SwitchCase.
 * leadingComments`) and for an otherwise-empty `{ … }` block (`BlockExpr.
 * innerComments`). A comment INSIDE an expression (between object/array
 * literal properties, inside a template `${...}`) is NOT attached — a
 * documented, measured, out-of-scope gap (2 of 922 real comments in this
 * repo's corpus, both mid-object-literal section dividers).
 */
import { describe, expect, it } from "vitest";
import { formatProgram } from "../src/tooling/formatter.js";

describe("formatProgram — leading comment before a declaration", () => {
  it("keeps a single-line header comment directly above a function", () => {
    const source = [
      "// Increments the shared counter by one.",
      "function inc(count) {",
      "  return count + 1",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toBe(
      [
        "// Increments the shared counter by one.",
        "function inc(count) {",
        "  return count + 1",
        "}",
        "",
        '$app(Text("x"))',
        "",
      ].join("\n"),
    );
  });

  it("indents a leading comment to match the statement it documents, inside a nested block", () => {
    const source = [
      "function outer() {",
      "  if (true) {",
      "    // nested note",
      "    return 1",
      "  }",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toContain("    // nested note\n    return 1");
  });

  it("re-formats idempotently when the input carries comments", () => {
    const source = [
      "// header",
      "function inc(count) {",
      "  // body note",
      "  return count + 1 // trailing",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    const second = formatProgram(first.formatted);
    expect(second.errors).toEqual([]);
    expect(second.formatted).toBe(first.formatted);
  });
});

describe("formatProgram — consecutive comment lines (multi-line header block)", () => {
  it("keeps every line of a multi-line // header, in order, all at the same indent", () => {
    const source = [
      "// Line one of the header.",
      "// Line two of the header.",
      "// Line three of the header.",
      "$app(Text(\"x\"))",
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toBe(
      [
        "// Line one of the header.",
        "// Line two of the header.",
        "// Line three of the header.",
        '$app(Text("x"))',
        "",
      ].join("\n"),
    );
  });

  it("keeps a /* … */ block comment verbatim, including its own internal newlines", () => {
    const source = [
      "/**",
      " * Multi-line block comment.",
      " * Second line.",
      " */",
      "function f() {",
      "  return 1",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toContain("/**\n * Multi-line block comment.\n * Second line.\n */\nfunction f()");
  });
});

describe("formatProgram — trailing comment on the same line as a statement", () => {
  it("keeps a same-line comment on a single-line statement", () => {
    const source = [
      "count = count + 1 // bump the counter",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toContain("count = count + 1 // bump the counter");
  });

  it("keeps a same-line comment after a multi-line block's closing brace", () => {
    const source = [
      "function f() {",
      "  return 1",
      "} // end f",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toContain("return 1\n} // end f");
  });

  it("is idempotent for a same-line trailing comment", () => {
    const source = [
      "count = count + 1 // bump the counter",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    const second = formatProgram(first.formatted);
    expect(second.formatted).toBe(first.formatted);
  });
});

describe("formatProgram — comment before an if / for / switch case", () => {
  it("keeps a comment before an if statement", () => {
    const source = [
      "function f(n) {",
      "  // only when positive",
      "  if (n > 0) {",
      "    return n",
      "  }",
      "  return 0",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toContain("  // only when positive\n  if (n > 0) {");
  });

  it("keeps a comment before a for-of loop", () => {
    const source = [
      "function f(items) {",
      "  // walk every item",
      "  for (let item of items) {",
      "    $util.log(item)",
      "  }",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toContain("  // walk every item\n  for (let item of items) {");
  });

  it("keeps a comment on a switch case header, distinct from a comment on its first statement", () => {
    // `case`/`default` bodies are NOT brace-delimited — statements follow
    // the `:` directly, up to the next `case`/`default`/`}` (see
    // `parseSwitchStatement`'s grammar comment).
    const source = [
      "function label(n) {",
      "  switch (n) {",
      "    // the common case",
      "    case 1:",
      "      return \"one\"",
      "    default:",
      "      // fallback note",
      "      return \"other\"",
      "  }",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toContain("    // the common case\n    case 1:");
    expect(formatted).toContain("      // fallback note\n      return \"other\"");
  });

  it("is idempotent for comments attached around if/for/switch", () => {
    const source = [
      "function f(n, items) {",
      "  // guard",
      "  if (n > 0) {",
      "    // loop",
      "    for (let item of items) {",
      "      $util.log(item)",
      "    }",
      "  }",
      "  switch (n) {",
      "    // one",
      "    case 1:",
      "      return \"one\"",
      "  }",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    const second = formatProgram(first.formatted);
    expect(second.errors).toEqual([]);
    expect(second.formatted).toBe(first.formatted);
  });
});

describe("formatProgram — blank-line preservation around comments", () => {
  it("keeps a deliberate blank line between a statement and a following comment group", () => {
    // The blank line AFTER `b = 2` (before the unrelated, comment-less
    // `$app(...)` statement) is a separate, pre-existing formatter behaviour
    // — blank lines between two plain statements with no comment involved
    // are never preserved (confirmed unchanged from before this feature) —
    // so it is correctly absent below; only the blank line directly before
    // the COMMENT is this feature's concern.
    const source = [
      "a = 1",
      "",
      "// documents b",
      "b = 2",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toBe(
      [
        "a = 1",
        "",
        "// documents b",
        "b = 2",
        '$app(Text("x"))',
        "",
      ].join("\n"),
    );
  });

  it("does NOT insert a blank line when the source had none", () => {
    const source = [
      "// documents b",
      "b = 2",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted.startsWith("// documents b\nb = 2\n")).toBe(true);
  });

  it("preserves a blank line between two comments in the same leading group", () => {
    const source = [
      "// first paragraph",
      "",
      "// second paragraph, after a blank line",
      "b = 2",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toBe(
      [
        "// first paragraph",
        "",
        "// second paragraph, after a blank line",
        "b = 2",
        '$app(Text("x"))',
        "",
      ].join("\n"),
    );
  });

  it("does not double a blank line already forced by the heavy-declaration spacing rule", () => {
    // `needsBlankLineBetween` already forces a blank line before a
    // `ComponentDeclaration` regardless of comments — a leading comment
    // group on that same declaration must not ALSO add its own blank line
    // on top, or the file would grow a second, redundant blank line on
    // every reformat.
    const source = [
      "a = 1",
      "// documents Foo",
      "function Foo() {",
      "  return null",
      "}",
      "",
      "$app(Foo())",
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toBe(
      [
        "a = 1",
        "",
        "// documents Foo",
        "function Foo() {",
        "  return null",
        "}",
        "",
        "$app(Foo())",
        "",
      ].join("\n"),
    );
  });
});

describe("formatProgram — a fully empty block whose only content is a comment", () => {
  it("keeps a lone comment inside an otherwise-empty function body", () => {
    const source = [
      "function stub() {",
      "  // TODO: implement",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const { formatted, errors } = formatProgram(source);
    expect(errors).toEqual([]);
    expect(formatted).toBe(
      [
        "function stub() {",
        "  // TODO: implement",
        "}",
        "",
        '$app(Text("x"))',
        "",
      ].join("\n"),
    );
  });

  it("is idempotent for an empty-body function with only a comment", () => {
    const source = [
      "function stub() {",
      "  // TODO: implement",
      "}",
      "",
      '$app(Text("x"))',
      "",
    ].join("\n");
    const first = formatProgram(source);
    expect(first.errors).toEqual([]);
    const second = formatProgram(first.formatted);
    expect(second.formatted).toBe(first.formatted);
  });
});
