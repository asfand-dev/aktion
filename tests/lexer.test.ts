import { describe, expect, it } from "vitest";
import { tokenize, KEYWORDS_AKTION, type Token } from "../src/parser/lexer.js";

function types(tokens: Token[]): string[] {
  return tokens.map((t) => t.type);
}

function values(tokens: Token[]): string[] {
  return tokens.map((t) => t.value);
}

describe("lexer — tokenize()", () => {
  it("returns an EOF token for empty input", () => {
    const tokens = tokenize("");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.type).toBe("EOF");
  });

  it("tokenizes a simple identifier", () => {
    const tokens = tokenize("hello");
    expect(types(tokens)).toEqual(["Identifier", "EOF"]);
    expect(tokens[0]!.value).toBe("hello");
  });

  it("tracks line and column correctly", () => {
    const tokens = tokenize("a\nb");
    expect(tokens[0]).toMatchObject({ type: "Identifier", value: "a", line: 1, column: 1 });
    expect(tokens[1]).toMatchObject({ type: "Newline", line: 1 });
    expect(tokens[2]).toMatchObject({ type: "Identifier", value: "b", line: 2, column: 1 });
  });

  describe("keywords", () => {
    it("tokenizes all Aktion keywords", () => {
      for (const kw of KEYWORDS_AKTION) {
        const tokens = tokenize(kw);
        expect(tokens[0]!.type).toBe("Keyword");
        expect(tokens[0]!.value).toBe(kw);
      }
    });

    it("tokenizes true/false as Boolean", () => {
      expect(tokenize("true")[0]).toMatchObject({ type: "Boolean", value: "true" });
      expect(tokenize("false")[0]).toMatchObject({ type: "Boolean", value: "false" });
    });

    it("tokenizes null as Null", () => {
      expect(tokenize("null")[0]).toMatchObject({ type: "Null", value: "null" });
    });
  });

  describe("numbers", () => {
    it("tokenizes integers", () => {
      const t = tokenize("42");
      expect(t[0]).toMatchObject({ type: "Number", value: "42" });
    });

    it("tokenizes decimals", () => {
      const t = tokenize("3.14");
      expect(t[0]).toMatchObject({ type: "Number", value: "3.14" });
    });

    it("tokenizes negative numbers in operand position", () => {
      const t = tokenize("(-5)");
      expect(t[1]).toMatchObject({ type: "Number", value: "-5" });
    });

    it("tokenizes hex literals (0x)", () => {
      const t = tokenize("0xFF");
      expect(t[0]).toMatchObject({ type: "Number", value: "0xFF" });
    });

    it("tokenizes binary literals (0b)", () => {
      const t = tokenize("0b1010");
      expect(t[0]).toMatchObject({ type: "Number", value: "0b1010" });
    });

    it("tokenizes octal literals (0o)", () => {
      const t = tokenize("0o17");
      expect(t[0]).toMatchObject({ type: "Number", value: "0o17" });
    });

    it("tokenizes digit separators", () => {
      const t = tokenize("1_000_000");
      expect(t[0]).toMatchObject({ type: "Number", value: "1_000_000" });
    });

    it("tokenizes scientific notation", () => {
      const t = tokenize("1.5e-3");
      expect(t[0]).toMatchObject({ type: "Number", value: "1.5e-3" });
    });

    it("tokenizes scientific notation with plus sign", () => {
      const t = tokenize("2E+10");
      expect(t[0]).toMatchObject({ type: "Number", value: "2E+10" });
    });

    it("tokenizes leading-dot decimals in operand position", () => {
      const t = tokenize("(.5)");
      expect(t[1]).toMatchObject({ type: "Number", value: ".5" });
    });

    it("tokenizes hex with digit separators", () => {
      const t = tokenize("0xDEAD_BEEF");
      expect(t[0]).toMatchObject({ type: "Number", value: "0xDEAD_BEEF" });
    });
  });

  describe("strings", () => {
    it("tokenizes double-quoted strings", () => {
      const t = tokenize('"hello"');
      expect(t[0]).toMatchObject({ type: "String", value: "hello" });
    });

    it("tokenizes single-quoted strings", () => {
      const t = tokenize("'world'");
      expect(t[0]).toMatchObject({ type: "String", value: "world" });
    });

    it("handles backslash escapes", () => {
      const t = tokenize('"line1\\nline2"');
      expect(t[0]!.value).toBe("line1\nline2");
    });

    it("handles tab escapes", () => {
      const t = tokenize('"a\\tb"');
      expect(t[0]!.value).toBe("a\tb");
    });

    it("handles \\r, \\b, \\f, \\v escapes", () => {
      expect(tokenize('"\\r"')[0]!.value).toBe("\r");
      expect(tokenize('"\\b"')[0]!.value).toBe("\b");
      expect(tokenize('"\\f"')[0]!.value).toBe("\f");
      expect(tokenize('"\\v"')[0]!.value).toBe("\v");
    });

    it("handles escaped quotes", () => {
      const t = tokenize('"say \\"hi\\""');
      expect(t[0]!.value).toBe('say "hi"');
    });

    it("handles \\0 (NUL)", () => {
      const t = tokenize('"\\0"');
      expect(t[0]!.value).toBe("\0");
    });

    it("handles \\0 followed by a digit (not NUL)", () => {
      const t = tokenize('"\\09"');
      expect(t[0]!.value).toBe("09");
    });

    it("handles \\xNN hex escapes", () => {
      const t = tokenize('"\\x41"');
      expect(t[0]!.value).toBe("A");
    });

    it("degrades malformed \\x to literal x", () => {
      const t = tokenize('"\\xGG"');
      expect(t[0]!.value).toBe("xGG");
    });

    it("handles \\uXXXX unicode escapes", () => {
      const t = tokenize('"\\u00AE"');
      expect(t[0]!.value).toBe("\u00AE");
    });

    it("handles \\u{...} variable-length code point", () => {
      const t = tokenize('"\\u{1F600}"');
      expect(t[0]!.value).toBe(String.fromCodePoint(0x1f600));
    });

    it("degrades malformed \\u to literal u", () => {
      const t = tokenize('"\\uZZZZ"');
      expect(t[0]!.value).toBe("uZZZZ");
    });

    it("degrades malformed \\u{} to literal u", () => {
      const t = tokenize('"\\u{GGGG}"');
      expect(t[0]!.value).toBe("u{GGGG}");
    });

    it("handles escaped backslash", () => {
      const t = tokenize('"\\\\"');
      expect(t[0]!.value).toBe("\\");
    });

    it("handles escaped dollar sign", () => {
      const t = tokenize('"\\$"');
      expect(t[0]!.value).toBe("$");
    });
  });

  describe("template strings", () => {
    it("tokenizes simple backtick strings as String", () => {
      const t = tokenize("`hello`");
      expect(t[0]).toMatchObject({ type: "String", value: "hello" });
    });

    it("tokenizes template strings with interpolation", () => {
      const t = tokenize("`hi ${name}`");
      expect(t[0]!.type).toBe("TemplateString");
      expect(t[0]!.parts).toBeDefined();
      expect(t[0]!.parts!).toHaveLength(3);
      expect(t[0]!.parts![0]).toEqual({ kind: "str", text: "hi " });
      expect(t[0]!.parts![1]).toMatchObject({ kind: "expr", source: "name" });
      expect(t[0]!.parts![2]).toEqual({ kind: "str", text: "" });
    });

    it("handles nested braces in template expressions", () => {
      const t = tokenize("`${a + {b: 1}}`");
      expect(t[0]!.type).toBe("TemplateString");
      expect(t[0]!.parts![1]).toMatchObject({ kind: "expr", source: "a + {b: 1}" });
    });

    it("handles nested backtick strings in template expressions", () => {
      const t = tokenize("`outer ${`inner`}`");
      expect(t[0]!.type).toBe("TemplateString");
      expect(t[0]!.parts![1]).toMatchObject({ kind: "expr" });
    });

    it("handles escape sequences in backtick strings", () => {
      const t = tokenize("`\\n\\t`");
      expect(t[0]!.value).toBe("\n\t");
    });

    it("handles nested quotes inside template expressions", () => {
      const t = tokenize('`${"hello"}`');
      expect(t[0]!.type).toBe("TemplateString");
      expect(t[0]!.parts![1]).toMatchObject({ kind: "expr", source: '"hello"' });
    });
  });

  describe("state identifiers", () => {
    it("tokenizes $name as StateIdentifier", () => {
      const t = tokenize("$count");
      expect(t[0]).toMatchObject({ type: "StateIdentifier", value: "count" });
    });

    it("handles bare $ sign", () => {
      const t = tokenize("$");
      expect(t[0]).toMatchObject({ type: "StateIdentifier", value: "" });
    });
  });

  describe("operators", () => {
    it("tokenizes single-char operators", () => {
      const ops = ["+", "-", "*", "/", "%", "!", "=", "<", ">", "&", "|", "^", "~"];
      for (const op of ops) {
        const t = tokenize(`a ${op} b`);
        const opToken = t.find((tok) => tok.type === "Operator" && tok.value === op);
        expect(opToken).toBeDefined();
      }
    });

    it("tokenizes two-char operators", () => {
      const ops = ["==", "!=", ">=", "<=", "&&", "||", "??", "?.", "=>", "**", "++", "--", "<<", ">>"];
      for (const op of ops) {
        const t = tokenize(op);
        expect(t[0]).toMatchObject({ type: "Operator", value: op });
      }
    });

    it("tokenizes three-char operators", () => {
      const ops = ["===", "!==", "**=", "??=", "&&=", "||=", ">>>", ">>=", "<<="];
      for (const op of ops) {
        const t = tokenize(op);
        expect(t[0]).toMatchObject({ type: "Operator", value: op });
      }
    });

    it("tokenizes the four-char operator >>>=", () => {
      const t = tokenize(">>>=");
      expect(t[0]).toMatchObject({ type: "Operator", value: ">>>=" });
    });

    it("tokenizes spread operator", () => {
      const t = tokenize("...arr");
      expect(t[0]).toMatchObject({ type: "Operator", value: "..." });
    });

    it("tokenizes compound assignment operators", () => {
      for (const op of ["+=", "-=", "*=", "/=", "%=", "&=", "|=", "^="]) {
        const t = tokenize(`a ${op} 1`);
        const opTok = t.find((tok) => tok.value === op);
        expect(opTok?.type).toBe("Operator");
      }
    });
  });

  describe("punctuation", () => {
    it("tokenizes all single-char punctuation", () => {
      const puncts = ["(", ")", "[", "]", "{", "}", ",", ":", "?", "."];
      for (const p of puncts) {
        const t = tokenize(p);
        expect(t[0]).toMatchObject({ type: "Punctuation", value: p });
      }
    });
  });

  describe("comments", () => {
    it("skips line comments", () => {
      const t = tokenize("a // comment\nb");
      const ids = t.filter((tok) => tok.type === "Identifier");
      expect(ids.map((tok) => tok.value)).toEqual(["a", "b"]);
    });

    it("skips block comments", () => {
      const t = tokenize("a /* block\ncomment */ b");
      const ids = t.filter((tok) => tok.type === "Identifier");
      expect(ids.map((tok) => tok.value)).toEqual(["a", "b"]);
    });

    it("handles unterminated block comments", () => {
      const t = tokenize("a /* unterminated");
      expect(t.filter((tok) => tok.type === "Identifier")).toHaveLength(1);
    });
  });

  describe("semicolons", () => {
    it("tokenizes semicolons", () => {
      const t = tokenize("a; b");
      expect(t[1]).toMatchObject({ type: "Semicolon", value: ";" });
    });
  });

  describe("newlines", () => {
    it("tokenizes newlines", () => {
      const t = tokenize("a\nb");
      expect(t[1]).toMatchObject({ type: "Newline", value: "\n" });
    });

    it("skips carriage returns (whitespace)", () => {
      const t = tokenize("a\r\nb");
      const ids = t.filter((tok) => tok.type === "Identifier");
      expect(ids).toHaveLength(2);
    });
  });

  describe("regex literals", () => {
    it("tokenizes a regex literal in operand position", () => {
      const t = tokenize("let x = /abc/gi");
      const regex = t.find((tok) => tok.type === "Regex");
      expect(regex).toBeDefined();
      expect(regex!.value).toBe("abc");
      expect(regex!.flags).toBe("gi");
    });

    it("does not tokenize / as regex after a value", () => {
      const t = tokenize("a / b");
      expect(t.find((tok) => tok.type === "Regex")).toBeUndefined();
      expect(t.find((tok) => tok.value === "/")).toMatchObject({ type: "Operator" });
    });

    it("tokenizes regex after opening bracket", () => {
      const t = tokenize("(/test/)");
      const regex = t.find((tok) => tok.type === "Regex");
      expect(regex).toBeDefined();
      expect(regex!.value).toBe("test");
    });

    it("handles regex with escaped slash", () => {
      const t = tokenize("let x = /a\\/b/");
      const regex = t.find((tok) => tok.type === "Regex");
      expect(regex).toBeDefined();
      expect(regex!.value).toBe("a\\/b");
    });

    it("handles regex with character class", () => {
      const t = tokenize("let x = /[a/b]/");
      const regex = t.find((tok) => tok.type === "Regex");
      expect(regex).toBeDefined();
      expect(regex!.value).toBe("[a/b]");
    });

    it("falls back to division for unterminated regex", () => {
      const t = tokenize("= /abc");
      const regex = t.find((tok) => tok.type === "Regex");
      expect(regex).toBeUndefined();
    });
  });

  describe("whitespace handling", () => {
    it("skips tabs", () => {
      const t = tokenize("\ta\t");
      expect(t.filter((tok) => tok.type === "Identifier")).toHaveLength(1);
    });

    it("unknown characters are skipped", () => {
      const t = tokenize("a @ b");
      const ids = t.filter((tok) => tok.type === "Identifier");
      expect(ids.map((tok) => tok.value)).toEqual(["a", "b"]);
    });
  });

  describe("complex expressions", () => {
    it("tokenizes a full assignment expression", () => {
      const t = tokenize('$count = 0');
      expect(types(t).slice(0, -1)).toEqual(["StateIdentifier", "Operator", "Number"]);
    });

    it("tokenizes a function call with arguments", () => {
      const t = tokenize('Button("Click me", onClick)');
      const meaningful = t.filter((tok) => tok.type !== "EOF");
      expect(meaningful.map((tok) => tok.type)).toEqual([
        "Identifier", "Punctuation", "String", "Punctuation", "Identifier", "Punctuation",
      ]);
    });

    it("tokenizes arrow function", () => {
      const t = tokenize("() => $count = $count + 1");
      const arrow = t.find((tok) => tok.value === "=>");
      expect(arrow).toMatchObject({ type: "Operator" });
    });

    it("tokenizes the -> operator", () => {
      const t = tokenize("a -> b");
      expect(t[1]).toMatchObject({ type: "Operator", value: "->" });
    });
  });

  describe("KEYWORDS_AKTION set", () => {
    it("contains expected keywords", () => {
      expect(KEYWORDS_AKTION.has("function")).toBe(true);
      expect(KEYWORDS_AKTION.has("if")).toBe(true);
      expect(KEYWORDS_AKTION.has("else")).toBe(true);
      expect(KEYWORDS_AKTION.has("for")).toBe(true);
      expect(KEYWORDS_AKTION.has("return")).toBe(true);
      expect(KEYWORDS_AKTION.has("import")).toBe(true);
      expect(KEYWORDS_AKTION.has("export")).toBe(true);
    });

    it("does not contain non-keywords", () => {
      expect(KEYWORDS_AKTION.has("true")).toBe(false);
      expect(KEYWORDS_AKTION.has("false")).toBe(false);
      expect(KEYWORDS_AKTION.has("null")).toBe(false);
      expect(KEYWORDS_AKTION.has("from")).toBe(false);
      expect(KEYWORDS_AKTION.has("as")).toBe(false);
    });
  });
});
