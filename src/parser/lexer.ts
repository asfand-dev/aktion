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
  | "Number"
  | "String"
  /**
   * Backtick-quoted template literal — carries alternating raw chunks and
   * embedded expression source strings via `parts`.
   */
  | "TemplateString"
  | "Boolean"
  | "Null"
  /**
   * Regex literal `/pattern/flags`. `value` carries the pattern body and
   * `flags` the trailing flag letters; the parser desugars it to
   * `new RegExp(value, flags)`.
   */
  | "Regex"
  | "Punctuation"
  | "Operator"
  | "Newline"
  | "Semicolon"
  /**
   * Source the lexer cannot make a token of: a character Aktion has no use
   * for (`@`, `#`, `\`, a non-ASCII letter) or an unterminated string or
   * template literal. `value` is the offending text and `message` the
   * diagnostic. The parser reports it wherever it meets the token, so the
   * input is rejected instead of silently losing the character.
   */
  | "Error"
  | "EOF";

/**
 * Keywords reserved by Aktion. The lexer recognises them so the parser can
 * dispatch on `Keyword` tokens directly.
 */
export const KEYWORDS_AKTION = new Set([
  "function",
  // Module syntax for multi-file `.aktion` programs (resolved by the in-browser
  // linker / `linkProject`; a no-op for the streaming single-file runtime).
  // `from`/`as` are NOT keywords — they stay usable as ordinary identifiers and
  // are matched contextually by the import parser.
  "import",
  "export",
  // NOTE: `$effect` (the side-effect builtin) is `$`-prefixed, so it lexes as
  // a StateIdentifier and is recognised in the parser — it is NOT a keyword.
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
  /** Set on `Regex` tokens to carry the trailing flag letters. */
  flags?: string;
  /** Set on `Error` tokens: the diagnostic the parser reports for them. */
  message?: string;
  /**
   * Set on a `String` token written as a backtick template literal without
   * interpolation, so the parser can tell `` tag`x` `` (a tagged template,
   * unsupported) from a plain string.
   */
  template?: true;
  /**
   * Set on the `String` / `TemplateString` token that was still open at the end
   * of the input and was accepted only because of {@link TokenizeOptions.streaming}.
   */
  open?: true;
}

export type CommentKind = "Line" | "Block";

/**
 * A `//` or `/* *\/` comment collected as out-of-band trivia rather than a
 * token — the parser never has to explicitly skip a "Comment" token at every
 * call site (mirrors how most JS-family tokenizers keep comments off the main
 * token stream). `text` is the RAW comment text INCLUDING its delimiters
 * (`// note`, `/* block *\/`), exactly as written; the comment-attachment
 * pass in `parser.ts` re-emits it verbatim rather than reformatting the
 * contents.
 */
export interface RawComment {
  kind: CommentKind;
  text: string;
  line: number;
  column: number;
  /** Line the comment's last character sits on — equals `line` for a `Line` comment, may exceed it for a multi-line `Block` comment. */
  endLine: number;
}

const SINGLE_CHAR_PUNCT = new Set(["(", ")", "[", "]", "{", "}", ",", ":", "?", "."]);
const KEYWORDS: Record<string, TokenType> = {
  true: "Boolean",
  false: "Boolean",
  null: "Null",
};

/** Options for {@link tokenize}. */
export interface TokenizeOptions {
  /**
   * The source is a prefix of a response that is still being generated. A
   * string or template literal that is still open at the very end of the input
   * is then lexed as the string it has so far, because the chunk that closes it
   * has not arrived yet. Left off, such a literal is an `Error` token. (A plain
   * string cut off by a newline is an error either way: more input cannot
   * close it.)
   */
  streaming?: boolean;
}

/**
 * Tokenize `source`. When `comments` is passed, every `//` line comment and
 * `/* *\/` block comment encountered is pushed onto it (in source order,
 * mirroring the token stream) instead of being silently discarded — this is
 * an optional out-param rather than a return-shape change so every existing
 * caller (`navigation.ts`, `semantic-tokens.ts`, …) that only wants tokens
 * keeps working unmodified.
 */
export function tokenize(source: string, comments?: RawComment[], options: TokenizeOptions = {}): Token[] {
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

  // Consume exactly `count` hex digits if present; returns the hex string, or
  // null (consuming nothing) when fewer than `count` hex digits follow.
  const readHex = (count: number): string | null => {
    for (let k = 0; k < count; k += 1) {
      if (!isHexDigit(peek(k) ?? "")) return null;
    }
    let hex = "";
    for (let k = 0; k < count; k += 1) hex += advance();
    return hex;
  };

  // Decode a backslash escape inside a string / template literal. `esc` is the
  // character already consumed after the backslash. Handles the standard JS
  // escapes plus `\uXXXX`, `\u{...}`, and `\xXX` so unicode/hex escapes render
  // as their characters instead of leaking the literal `u00ae` text (issue #5).
  // The lexer is total: a malformed escape degrades to its literal characters
  // rather than throwing.
  const decodeEscape = (esc: string | undefined): string => {
    switch (esc) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "0":
        // `\0` is NUL only when not followed by another decimal digit.
        return (peek() !== undefined && peek()! >= "0" && peek()! <= "9") ? "0" : "\0";
      case "\\": return "\\";
      case '"': return '"';
      case "'": return "'";
      case "`": return "`";
      case "$": return "$";
      case "x": {
        const hex = readHex(2);
        return hex === null ? "x" : String.fromCharCode(parseInt(hex, 16));
      }
      case "u": {
        if (peek() === "{") {
          // `\u{...}` — variable-length code point. Look ahead without
          // consuming until we confirm `{<hex>}` so a malformed form degrades.
          let off = 1;
          let digits = "";
          while (isHexDigit(peek(off) ?? "")) { digits += peek(off); off += 1; }
          const cp = digits.length > 0 ? parseInt(digits, 16) : NaN;
          if (peek(off) === "}" && Number.isFinite(cp) && cp <= 0x10ffff) {
            for (let k = 0; k <= off; k += 1) advance(); // `{`, digits, `}`
            try { return String.fromCodePoint(cp); } catch { return ""; }
          }
          return "u"; // malformed — leave `{...}` for normal scanning
        }
        const hex = readHex(4);
        return hex === null ? "u" : String.fromCharCode(parseInt(hex, 16));
      }
      default:
        return esc ?? "";
    }
  };

  // True when a `/` at the current position should begin a regex literal
  // rather than a division operator — i.e. the previous significant token does
  // NOT end an expression. Operators, keywords, `(`/`[`/`{`/`,`/`:`, newlines,
  // and start-of-input are all operand positions.
  const regexAllowedHere = (toks: Token[]): boolean => {
    const last = toks[toks.length - 1];
    if (!last) return true;
    switch (last.type) {
      case "Identifier":
      case "Number":
      case "String":
      case "TemplateString":
      case "Boolean":
      case "Null":
      case "StateIdentifier":
      case "Regex":
        return false;
      case "Punctuation":
        // A closing bracket ends a value → division; openers / separators are
        // operand positions.
        return !(last.value === ")" || last.value === "]" || last.value === "}");
      default:
        return true;
    }
  };

  // Scan a `/pattern/flags` regex literal starting at the current `/`. Returns
  // the body + flags, or null (restoring the cursor) when the literal is not
  // terminated on this line. Honours `\` escapes and `[...]` character classes
  // (where `/` is literal), the same edge cases JS regex literals handle.
  const scanRegexLiteral = (): { body: string; flags: string } | null => {
    const savedI = i;
    const savedLine = line;
    const savedColumn = column;
    advance(); // opening `/`
    let body = "";
    let inClass = false;
    while (i < source.length) {
      const c = peek();
      if (c === undefined || c === "\n") break; // unterminated
      if (c === "\\") {
        body += advance();
        if (peek() !== undefined && peek() !== "\n") body += advance();
        continue;
      }
      if (c === "[") { inClass = true; body += advance(); continue; }
      if (c === "]") { inClass = false; body += advance(); continue; }
      if (c === "/" && !inClass) {
        advance(); // closing `/`
        let flags = "";
        while (/[a-z]/i.test(peek() ?? "")) flags += advance();
        return { body, flags };
      }
      body += advance();
    }
    // Not a regex — rewind so the `/` is handled as a division operator.
    i = savedI;
    line = savedLine;
    column = savedColumn;
    return null;
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

    // U+2028 / U+2029 are line terminators in JS, so they end a statement like
    // a newline. They do not advance the line counter, which counts `\n` only.
    if (ch === "\u2028" || ch === "\u2029") {
      const startLine = line;
      const startCol = column;
      advance();
      push("Newline", ch, startLine, startCol);
      continue;
    }

    // Whitespace (excluding newline), including the Unicode spaces JS also
    // treats as whitespace (NBSP, BOM, …) so they are not reported as stray
    // characters.
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\v" || (ch > "\x7f" && /\s/.test(ch))) {
      advance();
      continue;
    }

    // Line comments: //...
    if (ch === "/" && peek(1) === "/") {
      const startLine = line;
      const startCol = column;
      let text = "";
      while (i < source.length && peek() !== "\n") text += advance();
      comments?.push({ kind: "Line", text, line: startLine, column: startCol, endLine: startLine });
      continue;
    }

    // Block comments: /* ... */
    if (ch === "/" && peek(1) === "*") {
      const startLine = line;
      const startCol = column;
      let text = "";
      text += advance();
      text += advance();
      while (i < source.length && !(peek() === "*" && peek(1) === "/")) {
        text += advance();
      }
      if (i < source.length) {
        text += advance();
        text += advance();
      }
      comments?.push({ kind: "Block", text, line: startLine, column: startCol, endLine: line });
      continue;
    }

    // Regex literal `/pattern/flags` (issue #6). A leading `/` starts a regex
    // only in operand position — where a value, not a binary operator, is
    // expected — mirroring the standard JS lexer disambiguation (and the
    // `allowSignedNumber` heuristic below). After a value-ending token a `/`
    // is division. An unterminated regex (no closing `/` before end-of-line)
    // falls through to the division operator, so the lexer never throws.
    if (ch === "/" && regexAllowedHere(tokens)) {
      const startLine = line;
      const startCol = column;
      const scanned = scanRegexLiteral();
      if (scanned) {
        tokens.push({
          type: "Regex",
          value: scanned.body,
          flags: scanned.flags,
          line: startLine,
          column: startCol,
        });
        continue;
      }
      // else: not a valid regex here — fall through to operator handling.
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
          value += decodeEscape(advance());
          continue;
        }
        if (peek() === "\n") {
          break;
        }
        value += advance();
      }
      if (peek() === quote) {
        advance();
        push("String", value, startLine, startCol);
      } else if (options.streaming === true && i >= source.length) {
        tokens.push({ type: "String", value, line: startLine, column: startCol, open: true });
      } else {
        tokens.push({
          type: "Error",
          value,
          line: startLine,
          column: startCol,
          message:
            "Unterminated string literal — add the closing quote " +
            "(a string cannot span lines; use a backtick template literal for that).",
        });
      }
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
          chunk += decodeEscape(advance());
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
      const open = peek() !== "`";
      if (!open) {
        advance();
      } else if (options.streaming !== true) {
        tokens.push({
          type: "Error",
          value: chunk,
          line: startLine,
          column: startCol,
          message: "Unterminated template literal — add the closing backtick.",
        });
        continue;
      }
      parts.push({ kind: "str", text: chunk });
      if (!sawExpr) {
        tokens.push({
          type: "String",
          value: chunk,
          line: startLine,
          column: startCol,
          template: true,
          ...(open ? { open: true as const } : {}),
        });
        continue;
      }
      tokens.push({
        type: "TemplateString",
        value: "",
        line: startLine,
        column: startCol,
        parts,
        ...(open ? { open: true as const } : {}),
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
    if (
      isDigit(ch) ||
      (ch === "-" && isDigit(peek(1) ?? "") && allowSignedNumber) ||
      (ch === "." && isDigit(peek(1) ?? "") && allowSignedNumber)
    ) {
      const startLine = line;
      const startCol = column;
      let raw = "";
      if (ch === "-") raw += advance();

      // Hex (0x), binary (0b) and octal (0o) integer literals, with optional
      // `_` digit separators (e.g. 0xFF, 0b1010, 0o17, 0xDEAD_BEEF).
      const radixMark = peek(1);
      if (
        peek() === "0" &&
        (radixMark === "x" || radixMark === "X" ||
          radixMark === "b" || radixMark === "B" ||
          radixMark === "o" || radixMark === "O")
      ) {
        raw += advance(); // 0
        raw += advance(); // x / b / o
        while (i < source.length) {
          const next = peek() ?? "";
          if (isHexDigit(next)) { raw += advance(); continue; }
          if (next === "_" && isHexDigit(peek(1) ?? "")) { raw += advance(); continue; }
          break;
        }
        push("Number", raw, startLine, startCol);
        continue;
      }

      // Decimal literal: integer / fraction with optional scientific-notation
      // exponent (1e6, 1.5e-3, 2E10) and `_` digit separators (1_000_000).
      let sawDot = false;
      let sawExp = false;
      while (i < source.length) {
        const next = peek() ?? "";
        if (isDigit(next)) {
          raw += advance();
          continue;
        }
        if (next === "_" && isDigit(peek(1) ?? "")) {
          raw += advance();
          continue;
        }
        if (next === "." && !sawDot && !sawExp && isDigit(peek(1) ?? "")) {
          sawDot = true;
          raw += advance();
          continue;
        }
        if ((next === "e" || next === "E") && !sawExp) {
          const afterE = peek(1) ?? "";
          const afterSign = afterE === "+" || afterE === "-" ? (peek(2) ?? "") : afterE;
          if (isDigit(afterSign)) {
            sawExp = true;
            raw += advance(); // e / E
            if (peek() === "+" || peek() === "-") raw += advance();
            continue;
          }
        }
        break;
      }
      push("Number", raw, startLine, startCol);
      continue;
    }

    // State identifier: $name. Reactive atoms are declared with `$name = value`
    // and referenced as `$name`.
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

    // Unknown character: emit an `Error` token so the parser rejects it.
    // Skipping it silently would turn `@dec`, `o.#p` or `café` into a
    // different, valid program. A whole code point is consumed, so an emoji
    // is one error, not two.
    const errLine = line;
    const errCol = column;
    const codePoint = String.fromCodePoint(source.codePointAt(i)!);
    for (let k = 0; k < codePoint.length; k += 1) advance();
    tokens.push({
      type: "Error",
      value: codePoint,
      line: errLine,
      column: errCol,
      message: unexpectedCharacterMessage(codePoint),
    });
  }

  tokens.push({ type: "EOF", value: "", line, column });
  return tokens;
}

function unexpectedCharacterMessage(ch: string): string {
  const base = `Unexpected character '${ch}'`;
  switch (ch) {
    case "@": return `${base} — decorators are not supported in Aktion.`;
    case "#": return `${base} — private fields (\`#name\`) are not supported in Aktion; use a plain property.`;
    case "\\": return `${base} — a backslash is only valid inside a string or template literal.`;
    case "\u201C":
    case "\u201D":
    case "\u201E":
    case "\u2018":
    case "\u2019":
    case "\u201A":
      return `${base} — this is a typographic (curly) quote; use a straight quote (" or ') instead.`;
  }
  if (/^[\p{Cc}\p{Cf}]$/u.test(ch)) {
    const hex = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
    return `Unexpected invisible character U+${hex} — delete it (it is usually pasted in with the text).`;
  }
  return ch > "\x7f"
    ? `${base} — names may only use a-z, A-Z, 0-9 and _ (non-ASCII text belongs inside a string).`
    : `${base}.`;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isHexDigit(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentifierChar(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}
