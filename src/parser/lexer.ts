/**
 * Tokenizer for LLM Response UI Lang.
 *
 * The language is line-oriented. We tokenize into a flat stream of tokens
 * including NEWLINE markers so that the parser can recover at line boundaries.
 */

export type TokenType =
  | "Identifier"
  | "StateIdentifier"
  | "BuiltinIdentifier"
  | "Number"
  | "String"
  | "Boolean"
  | "Null"
  | "Punctuation"
  | "Operator"
  | "Newline"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const SINGLE_CHAR_PUNCT = new Set(["(", ")", "[", "]", "{", "}", ",", ":", "?", "."]);
const KEYWORDS: Record<string, TokenType> = {
  true: "Boolean",
  false: "Boolean",
  null: "Null",
};

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const peek = (offset = 0) => source[i + offset];
  const push = (type: TokenType, value: string, startLine: number, startCol: number) => {
    tokens.push({ type, value, line: startLine, column: startCol });
  };
  const advance = () => {
    const ch = source[i];
    i += 1;
    if (ch === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return ch;
  };

  while (i < source.length) {
    const ch = peek();

    if (ch === undefined) break;

    // Newline.
    if (ch === "\n") {
      const startLine = line;
      const startCol = column;
      advance();
      push("Newline", "\n", startLine, startCol);
      continue;
    }

    // Whitespace (excluding newline).
    if (ch === " " || ch === "\t" || ch === "\r") {
      advance();
      continue;
    }

    // Line comments: //...
    if (ch === "/" && peek(1) === "/") {
      while (i < source.length && peek() !== "\n") advance();
      continue;
    }

    // Block comments: /* ... */
    if (ch === "/" && peek(1) === "*") {
      advance();
      advance();
      while (i < source.length && !(peek() === "*" && peek(1) === "/")) {
        advance();
      }
      if (i < source.length) {
        advance();
        advance();
      }
      continue;
    }

    // String literal: "..." with simple escape support.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startLine = line;
      const startCol = column;
      advance();
      let value = "";
      while (i < source.length && peek() !== quote) {
        if (peek() === "\\" && peek(1) !== undefined) {
          advance();
          const escaped = advance();
          switch (escaped) {
            case "n": value += "\n"; break;
            case "t": value += "\t"; break;
            case "r": value += "\r"; break;
            case "\\": value += "\\"; break;
            case '"': value += '"'; break;
            case "'": value += "'"; break;
            default: value += escaped ?? "";
          }
          continue;
        }
        if (peek() === "\n") {
          break;
        }
        value += advance();
      }
      if (peek() === quote) advance();
      push("String", value, startLine, startCol);
      continue;
    }

    // Number literal.
    if (isDigit(ch) || (ch === "-" && isDigit(peek(1) ?? ""))) {
      const startLine = line;
      const startCol = column;
      let raw = "";
      if (ch === "-") raw += advance();
      while (i < source.length && (isDigit(peek() ?? "") || peek() === ".")) {
        raw += advance();
      }
      push("Number", raw, startLine, startCol);
      continue;
    }

    // Builtin identifier: @Name
    if (ch === "@") {
      const startLine = line;
      const startCol = column;
      advance();
      let name = "";
      while (i < source.length && isIdentifierChar(peek() ?? "")) {
        name += advance();
      }
      push("BuiltinIdentifier", name, startLine, startCol);
      continue;
    }

    // State identifier: $name
    if (ch === "$") {
      const startLine = line;
      const startCol = column;
      advance();
      let name = "";
      while (i < source.length && isIdentifierChar(peek() ?? "")) {
        name += advance();
      }
      push("StateIdentifier", name, startLine, startCol);
      continue;
    }

    // Identifier or keyword.
    if (isIdentifierStart(ch)) {
      const startLine = line;
      const startCol = column;
      let name = "";
      while (i < source.length && isIdentifierChar(peek() ?? "")) {
        name += advance();
      }
      const keyword = KEYWORDS[name];
      if (keyword === "Boolean") {
        push("Boolean", name, startLine, startCol);
      } else if (keyword === "Null") {
        push("Null", name, startLine, startCol);
      } else {
        push("Identifier", name, startLine, startCol);
      }
      continue;
    }

    // Multi-character operators: ==, !=, >=, <=, &&, ||
    const two = ch + (peek(1) ?? "");
    if (
      two === "==" || two === "!=" || two === ">=" || two === "<=" ||
      two === "&&" || two === "||"
    ) {
      const startLine = line;
      const startCol = column;
      advance();
      advance();
      push("Operator", two, startLine, startCol);
      continue;
    }

    // Single-char operators.
    if ("+-*/%!=<>".includes(ch)) {
      const startLine = line;
      const startCol = column;
      advance();
      push("Operator", ch, startLine, startCol);
      continue;
    }

    // Punctuation.
    if (SINGLE_CHAR_PUNCT.has(ch)) {
      const startLine = line;
      const startCol = column;
      advance();
      push("Punctuation", ch, startLine, startCol);
      continue;
    }

    // Unknown char: skip with no token (parser surfaces errors per line).
    advance();
  }

  tokens.push({ type: "EOF", value: "", line, column });
  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentifierChar(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}
