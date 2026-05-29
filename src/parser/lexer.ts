/**
 * Tokenizer for Aktion.
 *
 * The surface syntax is a strict subset of JavaScript. We tokenize into a
 * flat stream of tokens including NEWLINE markers so that the parser can
 * recover at line boundaries.
 */

export type TokenType =
  | "Identifier"
  | "Keyword"
  | "StateIdentifier"
  | "BuiltinIdentifier"
  | "Number"
  | "String"
  /**
   * Backtick-quoted template literal — carries alternating raw chunks and
   * embedded expression source strings via `parts`.
   */
  | "TemplateString"
  | "Boolean"
  | "Null"
  | "Punctuation"
  | "Operator"
  | "Newline"
  | "Semicolon"
  | "EOF";

/**
 * Keywords reserved by Aktion. The lexer recognises them so the parser can
 * dispatch on `Keyword` tokens directly.
 */
export const KEYWORDS_AKTION = new Set([
  "function",
  "effect",
  "if",
  "else",
  "switch",
  "case",
  "break",
  "continue",
  "for",
  "while",
  "do",
  "of",
  "in",
  "let",
  "var",
  "const",
  "await",
  "async",
  "return",
  "default",
  "try",
  "catch",
  "finally",
  "throw",
  "new",
  "typeof",
  "instanceof",
  "delete",
  "void",
]);

export type TemplatePart =
  | { kind: "str"; text: string }
  | { kind: "expr"; source: string; line: number; column: number };

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  /** Set on `TemplateString` tokens to carry the alternating parts. */
  parts?: TemplatePart[];
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

    // Semicolons — treated as statement terminators (like newlines).
    if (ch === ";") {
      const startLine = line;
      const startCol = column;
      advance();
      push("Semicolon", ";", startLine, startCol);
      continue;
    }

    // String literal:
    //   - "..." / '...' — single-line strings with escape support
    //   - `...`         — multi-line template literals with `${expr}` interpolation
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
            case "`": value += "`"; break;
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
    if (ch === "`") {
      const startLine = line;
      const startCol = column;
      advance();
      const parts: TemplatePart[] = [];
      let chunk = "";
      let sawExpr = false;
      while (i < source.length && peek() !== "`") {
        if (peek() === "\\" && peek(1) !== undefined) {
          advance();
          const escaped = advance();
          switch (escaped) {
            case "n": chunk += "\n"; break;
            case "t": chunk += "\t"; break;
            case "r": chunk += "\r"; break;
            case "\\": chunk += "\\"; break;
            case '"': chunk += '"'; break;
            case "'": chunk += "'"; break;
            case "`": chunk += "`"; break;
            case "$": chunk += "$"; break;
            default: chunk += escaped ?? "";
          }
          continue;
        }
        if (peek() === "$" && peek(1) === "{") {
          parts.push({ kind: "str", text: chunk });
          chunk = "";
          const exprLine = line;
          const exprCol = column;
          advance();
          advance();
          let depth = 1;
          let source2 = "";
          while (i < source.length && depth > 0) {
            const next = peek();
            if (next === undefined) break;
            if (next === "`") {
              source2 += advance();
              while (i < source.length && peek() !== "`") {
                if (peek() === "\\" && peek(1) !== undefined) {
                  source2 += advance();
                  source2 += advance();
                  continue;
                }
                source2 += advance();
              }
              if (peek() === "`") source2 += advance();
              continue;
            }
            if (next === '"' || next === "'") {
              const q = next;
              source2 += advance();
              while (i < source.length && peek() !== q) {
                if (peek() === "\\" && peek(1) !== undefined) {
                  source2 += advance();
                  source2 += advance();
                  continue;
                }
                if (peek() === "\n") break;
                source2 += advance();
              }
              if (peek() === q) source2 += advance();
              continue;
            }
            if (next === "{") {
              depth += 1;
              source2 += advance();
              continue;
            }
            if (next === "}") {
              depth -= 1;
              if (depth === 0) {
                advance();
                break;
              }
              source2 += advance();
              continue;
            }
            source2 += advance();
          }
          parts.push({ kind: "expr", source: source2, line: exprLine, column: exprCol });
          sawExpr = true;
          continue;
        }
        chunk += advance();
      }
      if (peek() === "`") advance();
      parts.push({ kind: "str", text: chunk });
      if (!sawExpr) {
        push("String", chunk, startLine, startCol);
        continue;
      }
      tokens.push({
        type: "TemplateString",
        value: "",
        line: startLine,
        column: startCol,
        parts,
      });
      continue;
    }

    // Number literal.
    const lastToken = tokens[tokens.length - 1];
    const allowSignedNumber =
      !lastToken ||
      lastToken.type === "Newline" ||
      lastToken.type === "Semicolon" ||
      lastToken.type === "Operator" ||
      (lastToken.type === "Punctuation" &&
        (lastToken.value === "(" || lastToken.value === "[" ||
          lastToken.value === "," || lastToken.value === ":" ||
          lastToken.value === "?" || lastToken.value === "{"));
    if (isDigit(ch) || (ch === "-" && isDigit(peek(1) ?? "") && allowSignedNumber)) {
      const startLine = line;
      const startCol = column;
      let raw = "";
      if (ch === "-") raw += advance();
      let sawDot = false;
      while (i < source.length) {
        const next = peek() ?? "";
        if (isDigit(next)) {
          raw += advance();
          continue;
        }
        if (next === "." && !sawDot && isDigit(peek(1) ?? "")) {
          sawDot = true;
          raw += advance();
          continue;
        }
        break;
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

    // State identifier: $name. Reactive atoms are declared with `$name = value`
    // and referenced as `$name`.
    if (ch === "$") {
      const startLine = line;
      const startCol = column;
      advance();
      if (peek() === "$") {
        const err = new Error(
          'Legacy "$$x" persistent reference is removed. ' +
            'Reactive state is declared with "$x = value" and referenced as "$x".',
        ) as Error & { line?: number; column?: number };
        err.line = startLine;
        err.column = startCol;
        throw err;
      }
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
      } else if (KEYWORDS_AKTION.has(name)) {
        push("Keyword", name, startLine, startCol);
      } else {
        push("Identifier", name, startLine, startCol);
      }
      continue;
    }

    // Spread operator `...` (must come before single-dot punctuation).
    if (ch === "." && peek(1) === "." && peek(2) === ".") {
      const startLine = line;
      const startCol = column;
      advance();
      advance();
      advance();
      push("Operator", "...", startLine, startCol);
      continue;
    }

    // Multi-character operators. Order matters — longer matches must
    // be attempted before shorter ones (`===` before `==`, `**=` before
    // `**`, `&&=` before `&&`, `>>>=` before `>>>` before `>>`).
    const two = ch + (peek(1) ?? "");
    const three = two + (peek(2) ?? "");
    const four = three + (peek(3) ?? "");
    // Unsigned right-shift assignment — the only 4-char operator in JS.
    if (four === ">>>=") {
      const startLine = line;
      const startCol = column;
      advance(); advance(); advance(); advance();
      push("Operator", four, startLine, startCol);
      continue;
    }
    if (three === "===" || three === "!==" || three === "**=" ||
        three === "??=" || three === "&&=" || three === "||=" ||
        three === ">>>" || three === ">>=" || three === "<<=") {
      const startLine = line;
      const startCol = column;
      advance(); advance(); advance();
      push("Operator", three, startLine, startCol);
      continue;
    }
    if (
      two === "==" || two === "!=" || two === ">=" || two === "<=" ||
      two === "&&" || two === "||" || two === "??" || two === "?." ||
      two === "->" || two === "=>" || two === "**" || two === "%=" ||
      two === "+=" || two === "-=" || two === "*=" || two === "/=" ||
      two === "++" || two === "--" ||
      two === "<<" || two === ">>" ||
      two === "&=" || two === "|=" || two === "^="
    ) {
      const startLine = line;
      const startCol = column;
      advance();
      advance();
      push("Operator", two, startLine, startCol);
      continue;
    }

    // Single-char operators (arithmetic, comparison, bitwise).
    if ("+-*/%!=<>&|^~".includes(ch)) {
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
