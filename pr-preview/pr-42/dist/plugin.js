import { rmSync, existsSync, readdirSync, statSync, readFileSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, isAbsolute, join, relative, dirname, sep } from "node:path";
import { createRequire } from "node:module";
const KEYWORDS_AKTION = /* @__PURE__ */ new Set([
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
  "void"
]);
const SINGLE_CHAR_PUNCT = /* @__PURE__ */ new Set(["(", ")", "[", "]", "{", "}", ",", ":", "?", "."]);
const KEYWORDS = {
  true: "Boolean",
  false: "Boolean",
  null: "Null"
};
function tokenize(source, comments, options = {}) {
  const tokens = [];
  const softNewlines = options.softNewlines !== void 0 && options.softNewlines.size > 0 ? options.softNewlines : void 0;
  let i = 0;
  let line = 1;
  let column = 1;
  const peek = (offset = 0) => source[i + offset];
  const push = (type, value, startLine, startCol) => {
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
  const readHex = (count) => {
    for (let k = 0; k < count; k += 1) {
      if (!isHexDigit(peek(k) ?? "")) return null;
    }
    let hex = "";
    for (let k = 0; k < count; k += 1) hex += advance();
    return hex;
  };
  const decodeEscape = (esc) => {
    switch (esc) {
      case "n":
        return "\n";
      case "t":
        return "	";
      case "r":
        return "\r";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return peek() !== void 0 && peek() >= "0" && peek() <= "9" ? "0" : "\0";
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "'":
        return "'";
      case "`":
        return "`";
      case "$":
        return "$";
      case "x": {
        const hex = readHex(2);
        return hex === null ? "x" : String.fromCharCode(parseInt(hex, 16));
      }
      case "u": {
        if (peek() === "{") {
          let off = 1;
          let digits = "";
          while (isHexDigit(peek(off) ?? "")) {
            digits += peek(off);
            off += 1;
          }
          const cp = digits.length > 0 ? parseInt(digits, 16) : NaN;
          if (peek(off) === "}" && Number.isFinite(cp) && cp <= 1114111) {
            for (let k = 0; k <= off; k += 1) advance();
            try {
              return String.fromCodePoint(cp);
            } catch {
              return "";
            }
          }
          return "u";
        }
        const hex = readHex(4);
        return hex === null ? "u" : String.fromCharCode(parseInt(hex, 16));
      }
      default:
        return esc ?? "";
    }
  };
  const regexAllowedHere = (toks) => {
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
        return !(last.value === ")" || last.value === "]" || last.value === "}");
      default:
        return true;
    }
  };
  const scanRegexLiteral = () => {
    const savedI = i;
    const savedLine = line;
    const savedColumn = column;
    advance();
    let body = "";
    let inClass = false;
    while (i < source.length) {
      const c = peek();
      if (c === void 0 || c === "\n") break;
      if (c === "\\") {
        body += advance();
        if (peek() !== void 0 && peek() !== "\n") body += advance();
        continue;
      }
      if (c === "[") {
        inClass = true;
        body += advance();
        continue;
      }
      if (c === "]") {
        inClass = false;
        body += advance();
        continue;
      }
      if (c === "/" && !inClass) {
        advance();
        let flags = "";
        while (/[a-z]/i.test(peek() ?? "")) flags += advance();
        return { body, flags };
      }
      body += advance();
    }
    i = savedI;
    line = savedLine;
    column = savedColumn;
    return null;
  };
  while (i < source.length) {
    const ch = peek();
    if (ch === void 0) break;
    if (ch === "\n") {
      const startLine = line;
      const startCol = column;
      const soft = softNewlines?.has(i) === true;
      advance();
      if (!soft) push("Newline", "\n", startLine, startCol);
      continue;
    }
    if (ch === "\u2028" || ch === "\u2029") {
      const startLine = line;
      const startCol = column;
      const soft = softNewlines?.has(i) === true;
      advance();
      if (!soft) push("Newline", ch, startLine, startCol);
      continue;
    }
    if (ch === " " || ch === "	" || ch === "\r" || ch === "\f" || ch === "\v" || ch > "" && /\s/.test(ch)) {
      advance();
      continue;
    }
    if (ch === "/" && peek(1) === "/") {
      const startLine = line;
      const startCol = column;
      let text = "";
      while (i < source.length && peek() !== "\n") text += advance();
      comments?.push({ kind: "Line", text, line: startLine, column: startCol, endLine: startLine });
      continue;
    }
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
          column: startCol
        });
        continue;
      }
    }
    if (ch === ";") {
      const startLine = line;
      const startCol = column;
      advance();
      push("Semicolon", ";", startLine, startCol);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startLine = line;
      const startCol = column;
      advance();
      let value = "";
      while (i < source.length && peek() !== quote) {
        if (peek() === "\\" && peek(1) !== void 0) {
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
          message: "Unterminated string literal — add the closing quote (a string cannot span lines; use a backtick template literal for that)."
        });
      }
      continue;
    }
    if (ch === "`") {
      const startLine = line;
      const startCol = column;
      advance();
      const parts = [];
      let chunk = "";
      let sawExpr = false;
      while (i < source.length && peek() !== "`") {
        if (peek() === "\\" && peek(1) !== void 0) {
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
          const exprOffset = i;
          let depth = 1;
          let source2 = "";
          while (i < source.length && depth > 0) {
            const next = peek();
            if (next === void 0) break;
            if (next === "`") {
              source2 += advance();
              while (i < source.length && peek() !== "`") {
                if (peek() === "\\" && peek(1) !== void 0) {
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
                if (peek() === "\\" && peek(1) !== void 0) {
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
          parts.push({ kind: "expr", source: source2, line: exprLine, column: exprCol, offset: exprOffset });
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
          message: "Unterminated template literal — add the closing backtick."
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
          ...open ? { open: true } : {}
        });
        continue;
      }
      tokens.push({
        type: "TemplateString",
        value: "",
        line: startLine,
        column: startCol,
        parts,
        ...open ? { open: true } : {}
      });
      continue;
    }
    const lastToken = tokens[tokens.length - 1];
    const allowSignedNumber = !lastToken || lastToken.type === "Newline" || lastToken.type === "Semicolon" || lastToken.type === "Operator" || lastToken.type === "Punctuation" && (lastToken.value === "(" || lastToken.value === "[" || lastToken.value === "," || lastToken.value === ":" || lastToken.value === "?" || lastToken.value === "{");
    if (isDigit(ch) || ch === "-" && isDigit(peek(1) ?? "") && allowSignedNumber || ch === "." && isDigit(peek(1) ?? "") && allowSignedNumber) {
      const startLine = line;
      const startCol = column;
      let raw = "";
      if (ch === "-") raw += advance();
      const radixMark = peek(1);
      if (peek() === "0" && (radixMark === "x" || radixMark === "X" || radixMark === "b" || radixMark === "B" || radixMark === "o" || radixMark === "O")) {
        raw += advance();
        raw += advance();
        while (i < source.length) {
          const next = peek() ?? "";
          if (isHexDigit(next)) {
            raw += advance();
            continue;
          }
          if (next === "_" && isHexDigit(peek(1) ?? "")) {
            raw += advance();
            continue;
          }
          break;
        }
        push("Number", raw, startLine, startCol);
        continue;
      }
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
          const afterSign = afterE === "+" || afterE === "-" ? peek(2) ?? "" : afterE;
          if (isDigit(afterSign)) {
            sawExp = true;
            raw += advance();
            if (peek() === "+" || peek() === "-") raw += advance();
            continue;
          }
        }
        break;
      }
      push("Number", raw, startLine, startCol);
      continue;
    }
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
    if (ch === "." && peek(1) === "." && peek(2) === ".") {
      const startLine = line;
      const startCol = column;
      advance();
      advance();
      advance();
      push("Operator", "...", startLine, startCol);
      continue;
    }
    const two = ch + (peek(1) ?? "");
    const three = two + (peek(2) ?? "");
    const four = three + (peek(3) ?? "");
    if (four === ">>>=") {
      const startLine = line;
      const startCol = column;
      advance();
      advance();
      advance();
      advance();
      push("Operator", four, startLine, startCol);
      continue;
    }
    if (three === "===" || three === "!==" || three === "**=" || three === "??=" || three === "&&=" || three === "||=" || three === ">>>" || three === ">>=" || three === "<<=") {
      const startLine = line;
      const startCol = column;
      advance();
      advance();
      advance();
      push("Operator", three, startLine, startCol);
      continue;
    }
    if (two === "==" || two === "!=" || two === ">=" || two === "<=" || two === "&&" || two === "||" || two === "??" || two === "?." || two === "->" || two === "=>" || two === "**" || two === "%=" || two === "+=" || two === "-=" || two === "*=" || two === "/=" || two === "++" || two === "--" || two === "<<" || two === ">>" || two === "&=" || two === "|=" || two === "^=") {
      const startLine = line;
      const startCol = column;
      advance();
      advance();
      push("Operator", two, startLine, startCol);
      continue;
    }
    if ("+-*/%!=<>&|^~".includes(ch)) {
      const startLine = line;
      const startCol = column;
      advance();
      push("Operator", ch, startLine, startCol);
      continue;
    }
    if (SINGLE_CHAR_PUNCT.has(ch)) {
      const startLine = line;
      const startCol = column;
      advance();
      push("Punctuation", ch, startLine, startCol);
      continue;
    }
    const errLine = line;
    const errCol = column;
    const codePoint = String.fromCodePoint(source.codePointAt(i));
    for (let k = 0; k < codePoint.length; k += 1) advance();
    tokens.push({
      type: "Error",
      value: codePoint,
      line: errLine,
      column: errCol,
      message: unexpectedCharacterMessage(codePoint)
    });
  }
  tokens.push({ type: "EOF", value: "", line, column });
  return tokens;
}
function unexpectedCharacterMessage(ch) {
  const base = `Unexpected character '${ch}'`;
  switch (ch) {
    case "@":
      return `${base} — decorators are not supported in Aktion.`;
    case "#":
      return `${base} — private fields (\`#name\`) are not supported in Aktion; use a plain property.`;
    case "\\":
      return `${base} — a backslash is only valid inside a string or template literal.`;
    case "“":
    case "”":
    case "„":
    case "‘":
    case "’":
    case "‚":
      return `${base} — this is a typographic (curly) quote; use a straight quote (" or ') instead.`;
  }
  if (/^[\p{Cc}\p{Cf}]$/u.test(ch)) {
    const hex = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
    return `Unexpected invisible character U+${hex} — delete it (it is usually pasted in with the text).`;
  }
  return ch > "" ? `${base} — names may only use a-z, A-Z, 0-9 and _ (non-ASCII text belongs inside a string).` : `${base}.`;
}
function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}
function isHexDigit(ch) {
  return ch >= "0" && ch <= "9" || ch >= "a" && ch <= "f" || ch >= "A" && ch <= "F";
}
function isIdentifierStart(ch) {
  return ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_";
}
function isIdentifierChar(ch) {
  return isIdentifierStart(ch) || isDigit(ch);
}
function moduleLocalSymbol(moduleId, name) {
  return `__a${moduleId}_${name}`;
}
const MODULE_LOCAL_SYMBOL = /^__a(\d+)_(.+)$/;
function moduleLocalBaseName(symbol) {
  const match = MODULE_LOCAL_SYMBOL.exec(symbol);
  return match ? match[2] : null;
}
const shapes = /* @__PURE__ */ new WeakMap();
function recordEffectCallShape(decl, shape) {
  if (shape.callback === void 0 && shape.deps === void 0) return;
  shapes.set(decl, shape);
}
function effectCallShape(decl) {
  return shapes.get(decl);
}
function isNode(value) {
  if (typeof value !== "object" || value === null) return false;
  const kind = value.kind;
  if (typeof kind !== "string" || kind.length === 0) return false;
  const first = kind.charCodeAt(0);
  return first >= 65 && first <= 90;
}
const NON_CHILD_KEYS = /* @__PURE__ */ new Set(["loc", "leadingComments", "trailingComments", "innerComments"]);
function walk(program, visit) {
  for (const stmt of program.statements) visitNode(stmt, null, null, null, 0, visit);
}
function walkNode(root, visit) {
  visitNode(root, null, null, null, 0, visit);
}
function visitNode(node, parent, key, index, depth, visit) {
  if (visit({ node, parent, key, index, depth }) === false) return;
  for (const childKey of Object.keys(node)) {
    if (NON_CHILD_KEYS.has(childKey)) continue;
    const value = node[childKey];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (isNode(item)) visitNode(item, node, childKey, i, depth + 1, visit);
        else if (item && typeof item === "object") visitRecord(item, node, childKey, depth, visit);
      }
      continue;
    }
    if (isNode(value)) visitNode(value, node, childKey, null, depth + 1, visit);
    else if (value && typeof value === "object") {
      visitRecord(value, node, childKey, depth, visit);
    }
  }
}
function visitRecord(record, owner, key, depth, visit) {
  for (const inner of Object.keys(record)) {
    if (NON_CHILD_KEYS.has(inner)) continue;
    const value = record[inner];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (isNode(item)) visitNode(item, owner, key, i, depth + 1, visit);
        else if (item && typeof item === "object") visitRecord(item, owner, key, depth, visit);
      }
      continue;
    }
    if (isNode(value)) visitNode(value, owner, key, null, depth + 1, visit);
    else if (value && typeof value === "object") {
      visitRecord(value, owner, key, depth, visit);
    }
  }
}
function stampSourceIndex(root, index) {
  walkNode(root, ({ node }) => {
    const loc = node.loc;
    if (loc && loc.source === void 0) loc.source = index;
  });
}
function parse(source, options = {}) {
  const comments = [];
  const tokens = tokenize(source, comments, {
    streaming: options.streaming,
    softNewlines: options.softNewlines
  });
  const openLiteral = tokens[tokens.length - 2]?.open === true;
  const ctx = new ParserContext(tokens, comments, options.softNewlines, options.statementBlocks === true, options.allowUnsupportedWords === true);
  const statements = [];
  const errors = [];
  while (!ctx.isEnd()) {
    if (ctx.match("Newline") || ctx.match("Semicolon")) continue;
    try {
      const stmt = parseStatement(ctx, true);
      if (stmt) statements.push(stmt);
      statements.push(...ctx.takePending());
    } catch (err) {
      ctx.takePending();
      const error = err;
      errors.push(error);
      ctx.recoverToNextLine();
    }
  }
  attachComments(ctx, statements, 0, ctx.peek().line + 1);
  return openLiteral ? { statements, errors, openLiteral } : { statements, errors };
}
const nodeEndLine = /* @__PURE__ */ new WeakMap();
const BLOCK_TERMINATED_STATEMENTS = /* @__PURE__ */ new Set([
  "ComponentDeclaration",
  "ActionDeclaration",
  "HookDeclaration",
  "IfStatement",
  "ForOfStatement",
  "ForInStatement",
  "ForClassicStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "TryStatement"
]);
const TYPESCRIPT_DECLARATION_WORDS = /* @__PURE__ */ new Set([
  "type",
  "interface",
  "enum",
  "namespace",
  "declare",
  "abstract"
]);
function requireStatementBoundary(ctx, startIndex) {
  const prev = ctx.tokenAt(ctx.snapshot() - 1);
  if (prev && (prev.type === "Newline" || prev.type === "Semicolon")) return;
  const next = ctx.peek();
  if (next.type === "EOF" || next.type === "Newline" || next.type === "Semicolon") return;
  if (next.type === "Punctuation" && next.value === "}") return;
  if (prev && ctx.hasLineBreakCommentBetween(prev, next)) return;
  throw statementBoundaryError(ctx.tokenAt(startIndex), prev, next);
}
function statementBoundaryError(head, prev, next) {
  const at = (tok, message) => ({ message, line: tok.line, column: tok.column });
  if (next.type === "Error") return at(next, unexpected(next, ""));
  if (!prev) return at(next, `Expected end of statement but found ${describeToken(next)}.`);
  if (prev.type === "Identifier" && prev.value === "class") {
    return at(
      prev,
      "`class` is not supported in Aktion — there are no classes. Use plain objects for data and functions for behaviour."
    );
  }
  if (prev.type === "Identifier" && prev.value === "yield") {
    return at(prev, "`yield` is not supported in Aktion — there are no generators.");
  }
  if (head === prev && prev.type === "Identifier" && next.type === "Punctuation" && next.value === ":") {
    return at(
      prev,
      `Labels (\`${prev.value}:\`) are not supported in Aktion — use a flag variable, or move the loop into a function and \`return\` from it.`
    );
  }
  if (head === prev && prev.type === "Keyword" && (prev.value === "break" || prev.value === "continue") && next.type === "Identifier") {
    return at(
      next,
      `\`${prev.value} ${next.value}\` is not supported in Aktion — there are no labels, so \`${prev.value}\` always applies to the innermost loop. Use a flag variable, or move the loop into a function and \`return\` from it.`
    );
  }
  if (next.type === "Operator" && isAssignmentOperator(next.value)) {
    return at(next, "Chained assignment (`a = b = 1`) is not supported in Aktion — assign each name in its own statement.");
  }
  if (head === prev && prev.type === "Identifier" && next.type === "Identifier" && TYPESCRIPT_DECLARATION_WORDS.has(prev.value)) {
    return at(
      prev,
      `TypeScript \`${prev.value}\` declarations are not supported in Aktion — it has no static types, so remove it.`
    );
  }
  if (next.type === "Identifier" && (next.value === "as" || next.value === "satisfies")) {
    return at(
      next,
      `\`${next.value}\` type assertions are not supported in Aktion — it has no static types, so remove the cast.`
    );
  }
  const isTemplate = next.type === "TemplateString" || next.type === "String" && next.template === true;
  if (isTemplate && (prev.type === "Identifier" || prev.type === "StateIdentifier" || prev.type === "Punctuation" && (prev.value === ")" || prev.value === "]"))) {
    return at(
      next,
      "Tagged template literals are not supported in Aktion — call the function with the string instead: `tag(`…`)`."
    );
  }
  if (prev.type === "Number" && next.type === "Identifier" && next.value === "n" && adjacent(prev, next)) {
    return at(prev, `BigInt literals (\`${prev.value}n\`) are not supported in Aktion — use a regular number.`);
  }
  if (prev.type === "Identifier" && next.type === "StateIdentifier" && adjacent(prev, next)) {
    return at(
      next,
      `\`$\` can only start a name (a state atom such as \`$count\`), so \`${prev.value}$${next.value}\` is not a valid name.`
    );
  }
  return at(
    next,
    `Expected end of statement after ${describeToken(prev)}, but found ${describeToken(next)}. Put each statement on its own line or separate them with \`;\`.`
  );
}
function adjacent(a, b) {
  return a.line === b.line && b.column === a.column + a.value.length;
}
function unexpected(tok, fallback) {
  return tok.type === "Error" ? tok.message ?? `Unexpected character '${tok.value}'.` : fallback;
}
function describeToken(tok) {
  switch (tok.type) {
    case "Identifier":
      return `identifier '${tok.value}'`;
    case "Keyword":
      return `keyword '${tok.value}'`;
    case "StateIdentifier":
      return `'$${tok.value}'`;
    case "Number":
      return `number '${tok.value}'`;
    case "String":
      return "a string";
    case "TemplateString":
      return "a template literal";
    case "Regex":
      return "a regular expression";
    case "Newline":
      return "the end of the line";
    case "EOF":
      return "the end of the input";
    default:
      return `'${tok.value}'`;
  }
}
function parseStatement(ctx, topLevel) {
  const startIndex = ctx.snapshot();
  const stmt = parseStatementImpl(ctx);
  if (!stmt || !BLOCK_TERMINATED_STATEMENTS.has(stmt.kind)) {
    requireStatementBoundary(ctx, startIndex);
  }
  if (stmt && !nodeEndLine.has(stmt)) {
    nodeEndLine.set(stmt, ctx.previousConsumedLine());
  }
  return stmt;
}
function parseStatementImpl(ctx, _topLevel) {
  const head = ctx.peek();
  if (head.type === "StateIdentifier" && head.value === "effect" && ctx.peek(1).type === "Punctuation" && ctx.peek(1).value === "(") {
    return parseEffectStatement(ctx);
  }
  if (head.type === "Keyword") {
    switch (head.value) {
      case "function":
        return parseFunctionDecl(ctx);
      case "import":
        return parseImportStatement(ctx);
      case "export":
        return parseExportStatement(ctx);
      case "await":
        return parseAwait(ctx);
      case "async": {
        if (ctx.peek(1).type === "Keyword" && ctx.peek(1).value === "function") {
          ctx.consume();
          return parseFunctionDecl(ctx);
        }
        break;
      }
      case "return":
        return parseReturn(ctx);
      case "let":
      case "const":
      case "var":
        return parseVarDecl(ctx);
      case "if":
        return parseIfStatement(ctx);
      case "switch":
        return parseSwitchStatement(ctx);
      case "for":
        return parseForStatement(ctx);
      case "while":
        return parseWhileStatement(ctx);
      case "do":
        return parseDoWhileStatement(ctx);
      case "break":
        return parseBreakStatement(ctx);
      case "continue":
        return parseContinueStatement(ctx);
      case "throw":
        return parseThrowStatement(ctx);
      case "try":
        return parseTryStatement(ctx);
    }
  }
  if (ctx.statementBlocks && head.type === "Punctuation" && head.value === "{") {
    const start = ctx.snapshot();
    try {
      return parseExpressionStatement(ctx);
    } catch {
      ctx.restore(start);
      ctx.takePending();
    }
    const block = parseBlock(ctx);
    skipTerminator(ctx);
    return { kind: "ExpressionStatement", expression: block, loc: { line: head.line, column: head.column } };
  }
  if (head.type === "Punctuation" && head.value === "{") {
    const start = ctx.snapshot();
    try {
      return parseExpressionStatement(ctx);
    } catch (err) {
      const failedAt = ctx.snapshot();
      ctx.takePending();
      const error = err;
      const { close, errorDepth } = scanBraces(ctx, start, error);
      if (error.__definitive || close < 0 || errorDepth !== 1 || !BLOCK_LIKE_ERROR.test(error.message)) {
        ctx.restore(failedAt);
        throw err;
      }
      ctx.restore(close + 1);
      throw { message: BLOCK_STATEMENT_MESSAGE, line: head.line, column: head.column };
    }
  }
  const saved = ctx.snapshot();
  if (couldStartAssignment(ctx)) {
    try {
      return parseAssignment(ctx);
    } catch (err) {
      if (err && typeof err === "object" && err.__definitive) {
        throw err;
      }
      ctx.restore(saved);
    }
  }
  return parseExpressionStatement(ctx);
}
function couldStartAssignment(ctx) {
  const head = ctx.peek();
  if (head.type !== "Identifier" && head.type !== "StateIdentifier") {
    return false;
  }
  const next = ctx.peek(1);
  return next.type === "Operator" && next.value === "=";
}
function parseExpressionStatement(ctx) {
  const start = ctx.peek();
  let expression = parseExpression(ctx);
  const next = ctx.peek();
  if (next.type === "Operator" && isAssignmentOperator(next.value)) {
    if (!isAssignableTarget(expression)) throw invalidAssignmentTarget(expression, start, next);
    ctx.consume();
    skipNewlinesBeforeOperand(ctx);
    const value = parseExpression(ctx);
    expression = {
      kind: "BuiltinCall",
      name: "__rui_assign__",
      arguments: [
        expression,
        value,
        { kind: "Literal", value: next.value }
      ],
      loc: { line: next.line, column: next.column }
    };
  } else if (next.type === "Operator" && (next.value === "++" || next.value === "--")) {
    if (isAssignableTarget(expression)) {
      ctx.consume();
      expression = {
        kind: "BuiltinCall",
        name: "__rui_postfix__",
        arguments: [expression, { kind: "Literal", value: next.value }],
        loc: { line: next.line, column: next.column }
      };
    }
  }
  skipTerminator(ctx);
  return {
    kind: "ExpressionStatement",
    expression,
    loc: { line: start.line, column: start.column }
  };
}
function isAssignmentOperator(value) {
  return value === "=" || value === "+=" || value === "-=" || value === "*=" || value === "/=" || value === "%=" || value === "**=" || value === "??=" || value === "&&=" || value === "||=" || value === "&=" || value === "|=" || value === "^=" || value === "<<=" || value === ">>=" || value === ">>>=";
}
function isAssignableTarget(expr) {
  if (expr.kind === "Member") return true;
  if (expr.kind === "StateRef") return true;
  if (expr.kind === "Identifier") return true;
  return false;
}
const DESTRUCTURING_ASSIGNMENT_MESSAGE = "Destructuring assignment (`[a, b] = …`, `({ a } = …)`) is not supported in Aktion — declare new names instead (`const [a, b] = …`), or assign each one separately.";
function invalidAssignmentTarget(target, head, operator) {
  if (target.kind === "Array" || target.kind === "Object") {
    return { message: DESTRUCTURING_ASSIGNMENT_MESSAGE, line: head.line, column: head.column };
  }
  return {
    message: `Cannot assign to this expression with \`${operator.value}\` — only a name, a \`$state\` atom or a property (\`a.b\`, \`a[i]\`) can be assigned.`,
    line: operator.line,
    column: operator.column
  };
}
function skipNewlinesBeforeOperand(ctx) {
  const { token, skipped } = peekNonNewline(ctx);
  if (skipped === 0 || !canStartOperand(ctx, token, skipped)) return;
  for (let i = 0; i < skipped; i += 1) ctx.consume();
}
const OPERAND_KEYWORDS = /* @__PURE__ */ new Set(["function", "new", "typeof", "void", "delete", "await", "async"]);
function canStartOperand(ctx, token, offset) {
  switch (token.type) {
    case "Identifier":
    case "StateIdentifier": {
      const after = ctx.peek(offset + 1);
      return !(after.type === "Operator" && isAssignmentOperator(after.value));
    }
    case "Number":
    case "String":
    case "TemplateString":
    case "Boolean":
    case "Null":
    case "Regex":
    case "Error":
      return true;
    case "Keyword":
      return OPERAND_KEYWORDS.has(token.value);
    case "Punctuation":
      return token.value === "(" || token.value === "[" || token.value === "{";
    case "Operator":
      return token.value === "!" || token.value === "-" || token.value === "+" || token.value === "~" || token.value === "++" || token.value === "--";
    default:
      return false;
  }
}
function parseFunctionDecl(ctx) {
  const start = ctx.expect("Keyword", "function");
  const isHook = ctx.peek().type === "StateIdentifier";
  const nameTok = isHook ? ctx.consume() : ctx.expectName();
  const params = parseFunctionParams(ctx);
  const body = parseBlock(ctx);
  skipTerminator(ctx);
  if (isHook) {
    return {
      kind: "HookDeclaration",
      name: nameTok.value,
      params,
      body,
      loc: { line: start.line, column: start.column }
    };
  }
  const authoredName = moduleLocalBaseName(nameTok.value) ?? nameTok.value;
  const isPascalCase2 = authoredName.length > 0 && authoredName[0] >= "A" && authoredName[0] <= "Z";
  if (isPascalCase2) {
    return {
      kind: "ComponentDeclaration",
      name: nameTok.value,
      params,
      slots: [],
      body,
      loc: { line: start.line, column: start.column }
    };
  }
  return {
    kind: "ActionDeclaration",
    name: nameTok.value,
    params,
    body,
    loc: { line: start.line, column: start.column }
  };
}
function parseFunctionParams(ctx) {
  ctx.expect("Punctuation", "(");
  return ctx.withNewlines(true, () => parseFunctionParamList(ctx));
}
function parseFunctionParamList(ctx) {
  const params = [];
  skipWhitespace(ctx);
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    while (true) {
      skipWhitespace(ctx);
      let isRest = false;
      if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
        ctx.consume();
        isRest = true;
      }
      const tok = ctx.peek();
      if (!isRest && tok.type === "Punctuation" && (tok.value === "{" || tok.value === "[")) {
        const pattern = parseDestructuringPattern(ctx);
        let defaultValue;
        if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          defaultValue = parseExpression(ctx);
        }
        const param = { name: "", pattern };
        if (defaultValue) param.defaultValue = defaultValue;
        params.push(param);
      } else if (tok.type === "Identifier" || tok.type === "Keyword") {
        rejectUnsupportedWord(ctx, tok);
        const nameTok = ctx.consume();
        let defaultValue;
        if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          defaultValue = parseExpression(ctx);
        }
        const param = { name: nameTok.value };
        if (defaultValue) param.defaultValue = defaultValue;
        if (isRest) param.rest = true;
        params.push(param);
      } else {
        throw {
          message: unexpected(tok, `Expected parameter name, got ${tok.type} "${tok.value}"`),
          line: tok.line,
          column: tok.column
        };
      }
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        if (isRest) {
          throw {
            message: "Rest parameter `...name` must be the final parameter.",
            line: ctx.peek().line,
            column: ctx.peek().column
          };
        }
        ctx.consume();
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === ")") break;
        continue;
      }
      break;
    }
  }
  ctx.expect("Punctuation", ")");
  return params;
}
function parseEffectStatement(ctx) {
  const start = ctx.consume();
  ctx.expect("Punctuation", "(");
  const decl = ctx.withNewlines(true, () => parseEffectArguments(ctx, start));
  skipTerminator(ctx);
  return decl;
}
function parseEffectArguments(ctx, start) {
  skipWhitespace(ctx);
  const shape = {};
  const callbackTok = ctx.peek();
  const callbackExpr = parseExpression(ctx);
  let body;
  if (callbackExpr.kind === "Lambda") {
    body = callbackExpr.body.kind === "Block" ? callbackExpr.body : { kind: "Block", body: [{ kind: "ExpressionStatement", expression: callbackExpr.body }] };
  } else {
    body = { kind: "Block", body: [] };
    shape.callback = { line: callbackTok.line, column: callbackTok.column };
  }
  const triggers = [];
  let rateLimit;
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
    ctx.consume();
    skipWhitespace(ctx);
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "[") {
      ctx.consume();
      skipWhitespace(ctx);
      while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "]")) {
        parseEffectDep(ctx, triggers, (rl) => {
          rateLimit = rl;
        });
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
          ctx.consume();
          skipWhitespace(ctx);
        }
      }
      ctx.expect("Punctuation", "]");
    } else {
      const depsTok = ctx.peek();
      parseExpression(ctx);
      shape.deps = { line: depsTok.line, column: depsTok.column };
    }
  }
  skipWhitespace(ctx);
  ctx.expect("Punctuation", ")");
  const decl = {
    kind: "EffectDeclaration",
    name: `__effect_L${start.line}_C${start.column}`,
    triggers,
    body,
    loc: { line: start.line, column: start.column }
  };
  if (rateLimit) decl.rateLimit = rateLimit;
  recordEffectCallShape(decl, shape);
  return decl;
}
function parseEffectDep(ctx, triggers, setRateLimit) {
  const head = ctx.peek();
  if (head.type === "StateIdentifier") {
    ctx.consume();
    let name = head.value;
    while (ctx.peek().type === "Punctuation" && ctx.peek().value === ".") {
      const prop = ctx.peek(1);
      if (prop.type !== "Identifier" && prop.type !== "Keyword") break;
      ctx.consume();
      ctx.consume();
      name += "." + prop.value;
    }
    triggers.push({ kind: "state", name });
    return;
  }
  if (head.type === "String") {
    ctx.consume();
    const val = head.value;
    if (val === "mount" || val === "unmount") {
      triggers.push({ kind: "lifecycle", name: val });
      return;
    }
    const everyMatch = val.match(/^every\((\d+)\)$/);
    if (everyMatch) {
      triggers.push({ kind: "every", intervalMs: Number(everyMatch[1]) });
      return;
    }
    const debounceMatch = val.match(/^debounce\((\d+)\)$/);
    if (debounceMatch) {
      setRateLimit({ kind: "debounce", ms: Number(debounceMatch[1]) });
      return;
    }
    const throttleMatch = val.match(/^throttle\((\d+)\)$/);
    if (throttleMatch) {
      setRateLimit({ kind: "throttle", ms: Number(throttleMatch[1]) });
      return;
    }
    throw {
      message: `Unknown effect dependency string "${val}". Expected "mount", "unmount", "every(N)", "debounce(N)", or "throttle(N)".`,
      line: head.line,
      column: head.column
    };
  }
  throw {
    message: head.type === "Error" ? unexpected(head, "") : `Unexpected ${head.type} "${head.value}" inside effect dependency array. Expected $state or a string token ("mount", "unmount", "every(N)", etc.).`,
    line: head.line,
    column: head.column
  };
}
function declarationOf(token) {
  return token.value === "let" || token.value === "const" || token.value === "var" ? { declaration: token.value } : {};
}
function parseVarDecl(ctx, inForHead = false) {
  const keyword = ctx.consume();
  const declarators = [];
  let start = keyword;
  while (true) {
    const declarator = parseDeclarator(ctx, keyword, start);
    nodeEndLine.set(declarator, ctx.previousConsumedLine());
    declarators.push(declarator);
    const comma = ctx.peek();
    if (!(comma.type === "Punctuation" && comma.value === ",")) break;
    if (inForHead) {
      throw {
        message: "Declaring several variables in a `for (…)` head is not supported in Aktion — declare the others before the loop.",
        line: comma.line,
        column: comma.column
      };
    }
    ctx.consume();
    skipNewlines(ctx);
    start = ctx.peek();
  }
  if (!inForHead) skipTerminator(ctx);
  const [first, ...rest] = declarators;
  ctx.queuePending(rest);
  return first;
}
function undefinedValue() {
  return { kind: "Unary", operator: "void", argument: { kind: "Literal", value: 0 } };
}
function parseDeclarator(ctx, keyword, start) {
  const head = ctx.peek();
  const loc = { line: start.line, column: start.column };
  if (head.type === "Punctuation" && (head.value === "[" || head.value === "{")) {
    const pattern = parseDestructuringPattern(ctx);
    consumeNewlinesIfNext(ctx, isAssignToken);
    const eq2 = ctx.peek();
    if (eq2.type === "Punctuation" && eq2.value === ":") throw typeAnnotationError(eq2, pattern.kind === "array" ? "[…]" : "{ … }");
    if (!isAssignToken(eq2)) {
      throw {
        message: unexpected(
          eq2,
          `Missing initializer in a destructuring declaration — destructure a value: \`${keyword.value} ${pattern.kind === "array" ? "[a, b]" : "{ a, b }"} = value\`.`
        ),
        line: eq2.line,
        column: eq2.column
      };
    }
    ctx.consume();
    skipNewlinesBeforeOperand(ctx);
    const expression = parseExpression(ctx);
    return {
      kind: "DestructureStatement",
      patternKind: pattern.kind,
      bindings: pattern.bindings,
      expression,
      ...declarationOf(keyword),
      loc
    };
  }
  let identifier = "";
  let isState = false;
  if (head.type === "StateIdentifier") {
    identifier = ctx.consume().value;
    isState = true;
  } else if (head.type === "Identifier") {
    rejectUnsupportedWord(ctx, head);
    identifier = ctx.consume().value;
  } else {
    throw {
      message: unexpected(head, `Expected identifier after "${keyword.value}", got ${head.type} "${head.value}"`),
      line: head.line,
      column: head.column
    };
  }
  const name = isState ? `$${identifier}` : identifier;
  consumeNewlinesIfNext(ctx, isAssignToken);
  const eq = ctx.peek();
  if (isAssignToken(eq)) {
    ctx.consume();
    skipNewlinesBeforeOperand(ctx);
    const expression = parseExpression(ctx);
    return { kind: "Assignment", identifier, isState, expression, ...declarationOf(keyword), loc };
  }
  if (eq.type === "Error") throw { message: unexpected(eq, ""), line: eq.line, column: eq.column };
  if (eq.type === "Punctuation" && eq.value === ":") throw typeAnnotationError(eq, name);
  if (keyword.value === "const") {
    throw {
      message: `Missing initializer in \`const ${name}\` — a \`const\` needs a value (\`const ${name} = …\`); use \`let ${name}\` to declare it without one.`,
      line: head.line,
      column: head.column
    };
  }
  return {
    kind: "Assignment",
    identifier,
    isState,
    expression: undefinedValue(),
    uninitialized: true,
    ...declarationOf(keyword),
    loc
  };
}
function isAssignToken(t) {
  return t.type === "Operator" && t.value === "=";
}
function typeAnnotationError(colon, target) {
  return {
    message: `Type annotations (\`${target}: …\`) are not supported in Aktion — it has no static types, so remove the annotation.`,
    line: colon.line,
    column: colon.column
  };
}
function parseDestructuringPattern(ctx) {
  const head = ctx.consume();
  const patternKind = head.value === "[" ? "array" : "object";
  return ctx.withNewlines(true, () => parsePatternBody(ctx, patternKind));
}
function parsePatternBody(ctx, patternKind) {
  const bindings = [];
  if (patternKind === "array") {
    skipWhitespace(ctx);
    while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "]")) {
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        bindings.push({ name: "" });
        ctx.consume();
        skipWhitespace(ctx);
        continue;
      }
      let isRest = false;
      if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
        ctx.consume();
        isRest = true;
      }
      if (!isRest && ctx.peek().type === "Punctuation" && (ctx.peek().value === "[" || ctx.peek().value === "{")) {
        const nested = parseDestructuringPattern(ctx);
        let nestedDefault;
        if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          nestedDefault = parseExpression(ctx);
        }
        const nestedBinding = { name: "", pattern: nested };
        if (nestedDefault) nestedBinding.defaultValue = nestedDefault;
        bindings.push(nestedBinding);
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
          ctx.consume();
          skipWhitespace(ctx);
          continue;
        }
        break;
      }
      const nameTok = ctx.expectName();
      let defaultValue;
      if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
        ctx.consume();
        defaultValue = parseExpression(ctx);
      }
      const binding = { name: nameTok.value };
      if (isRest) binding.rest = true;
      if (defaultValue) binding.defaultValue = defaultValue;
      bindings.push(binding);
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        skipWhitespace(ctx);
        continue;
      }
      break;
    }
    ctx.expect("Punctuation", "]");
  } else {
    skipWhitespace(ctx);
    while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
      let isRest = false;
      if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
        ctx.consume();
        isRest = true;
      }
      const keyTok = isRest ? ctx.expectName() : parsePatternKey(ctx);
      const key = keyTok.type === "Number" ? String(numericLiteralValue(keyTok.value)) : keyTok.value;
      let alias = key;
      let sourceKey;
      let nestedPattern;
      if (!isRest && ctx.peek().type === "Punctuation" && ctx.peek().value === ":") {
        ctx.consume();
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && (ctx.peek().value === "{" || ctx.peek().value === "[")) {
          sourceKey = key;
          nestedPattern = parseDestructuringPattern(ctx);
        } else {
          const aliasTok = ctx.expectName();
          sourceKey = key;
          alias = aliasTok.value;
        }
      } else if (keyTok.type !== "Identifier") {
        throw patternKeyNeedsName(keyTok);
      } else if (!isRest) {
        rejectUnsupportedWord(ctx, keyTok);
      }
      let defaultValue;
      if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
        ctx.consume();
        defaultValue = parseExpression(ctx);
      }
      const binding = nestedPattern ? { name: "", sourceKey, pattern: nestedPattern } : { name: alias };
      if (!nestedPattern && sourceKey) binding.sourceKey = sourceKey;
      if (isRest) binding.rest = true;
      if (defaultValue) binding.defaultValue = defaultValue;
      bindings.push(binding);
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        skipWhitespace(ctx);
        continue;
      }
      break;
    }
    ctx.expect("Punctuation", "}");
  }
  return { kind: patternKind, bindings };
}
function parsePatternKey(ctx) {
  const tok = ctx.peek();
  if (tok.type === "Identifier" || tok.type === "Keyword" || tok.type === "Number" || tok.type === "String" && tok.template !== true) {
    return ctx.consume();
  }
  return ctx.expect("Identifier");
}
function patternKeyNeedsName(tok) {
  const shown = tok.type === "String" ? JSON.stringify(tok.value) : tok.value;
  const what = tok.type === "Keyword" ? `\`${tok.value}\` is a reserved word, so it cannot be a binding name` : tok.type === "Number" ? `The key \`${shown}\` is a number, so it cannot be a binding name` : `The key \`${shown}\` is quoted, so it cannot be a binding name`;
  const err = {
    message: `${what} — rename it: \`{ ${shown}: name }\`.`,
    line: tok.line,
    column: tok.column
  };
  err.__definitive = true;
  return err;
}
function collectPatternNames(pattern) {
  const names = [];
  for (const binding of pattern.bindings) {
    if (binding.pattern) {
      names.push(...collectPatternNames(binding.pattern));
    } else if (binding.name) {
      names.push(binding.name);
    }
  }
  return names;
}
function parseBlock(ctx) {
  const start = ctx.expect("Punctuation", "{");
  return ctx.withNewlines(false, () => parseBlockBody(ctx, start));
}
function parseBlockBody(ctx, start) {
  const body = [];
  skipWhitespace(ctx);
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const stmt = parseStatement(ctx);
    if (stmt) body.push(stmt);
    body.push(...ctx.takePending());
    skipWhitespace(ctx);
  }
  const close = ctx.expect("Punctuation", "}");
  const block = {
    kind: "Block",
    body,
    loc: { line: start.line, column: start.column }
  };
  nodeEndLine.set(block, close.line);
  if (body.length === 0) {
    const inner = collectDanglingComments(ctx, start.line, close.line);
    if (inner.length > 0) block.innerComments = inner;
  } else {
    attachComments(ctx, body, start.line, close.line);
  }
  return block;
}
function parseBlockOrSingleStatement(ctx) {
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    return parseBlock(ctx);
  }
  const head = ctx.peek();
  const stmt = parseStatement(ctx);
  const body = [...stmt ? [stmt] : [], ...ctx.takePending()];
  const last = body[body.length - 1];
  const block = {
    kind: "Block",
    body,
    loc: { line: head.line, column: head.column }
  };
  nodeEndLine.set(block, last ? nodeEndLine.get(last) ?? head.line : head.line);
  return block;
}
function parseAwait(ctx) {
  const start = ctx.expect("Keyword", "await");
  const argument = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "Await",
    argument,
    loc: { line: start.line, column: start.column }
  };
}
function parseReturn(ctx) {
  const start = ctx.expect("Keyword", "return");
  let argument;
  const next = ctx.peek();
  if (next.type !== "Newline" && next.type !== "Semicolon" && !(next.type === "Punctuation" && next.value === "}")) {
    argument = parseExpression(ctx);
  }
  skipTerminator(ctx);
  return {
    kind: "Return",
    argument,
    loc: { line: start.line, column: start.column }
  };
}
const EOF_TOKEN = { type: "EOF", value: "", line: 0, column: 0 };
class ParserContext {
  constructor(tokens, comments = [], softNewlines, statementBlocks = false, allowUnsupportedWords = false) {
    this.tokens = tokens;
    this.comments = comments;
    this.softNewlines = softNewlines;
    this.statementBlocks = statementBlocks;
    this.allowUnsupportedWords = allowUnsupportedWords;
  }
  index = 0;
  /**
   * Whether newlines are significant, innermost region last: `true` while
   * inside `( … )`, `[ … ]`, an object literal or a destructuring pattern —
   * where JavaScript never ends a statement, so a line break is whitespace —
   * and `false` inside a `{ … }` statement block, where statements end at
   * newlines again even if the block itself sits inside parentheses
   * (`f(() => {⏎ a()⏎ b()⏎})`). Empty means statement level: significant.
   *
   * While the innermost entry is `true`, `peek` / `consume` (and so `match` /
   * `expect`) step over `Newline` tokens as if they were not there. Regions are
   * entered only through `withNewlines`, whose `finally` unwinds the stack when
   * a parse error is thrown inside one.
   */
  newlineModes = [];
  /** The innermost `newlineModes` entry (`false` when empty), cached for `peek` / `consume`. */
  skipNewlines = false;
  /**
   * Statements a single source statement produced beyond the one returned —
   * the second and later declarators of `let a = 1, b = 2`. Every statement
   * list (`parse`, `parseBlock`, switch cases, brace-less bodies) appends them
   * right after the `parseStatement` call that returned their first sibling.
   */
  pending = [];
  /**
   * Indices into `comments` already claimed by SOME container's
   * `attachComments`/`collectDanglingComments`/switch-case-header pass.
   * Comments are no longer consumed strictly in source order (see
   * `peekComment`/`takeComment` below) — an ancestor container's comment can
   * remain unconsumed while a nested container reaches past it to claim a
   * LATER comment that is actually its own, so "already attached" has to be
   * tracked per-index rather than via a single monotonic cursor.
   */
  consumedComments = /* @__PURE__ */ new Set();
  isEnd() {
    return this.peek().type === "EOF";
  }
  /**
   * Run `parse` with newlines ignored (`true`) or significant (`false`), then
   * restore the enclosing mode — also when `parse` throws.
   */
  withNewlines(ignore, parse2) {
    this.newlineModes.push(ignore);
    this.skipNewlines = ignore;
    try {
      return parse2();
    } finally {
      this.newlineModes.pop();
      this.skipNewlines = this.newlineModes.length > 0 && this.newlineModes[this.newlineModes.length - 1] === true;
    }
  }
  peek(offset = 0) {
    if (!this.skipNewlines) return this.tokens[this.index + offset] ?? EOF_TOKEN;
    let remaining = offset;
    for (let i = this.index; i < this.tokens.length; i += 1) {
      const tok = this.tokens[i];
      if (tok.type === "Newline") continue;
      if (remaining === 0) return tok;
      remaining -= 1;
    }
    return EOF_TOKEN;
  }
  /** Queue statements for the statement list being parsed (see `pending`). */
  queuePending(statements) {
    this.pending.push(...statements);
  }
  /** Take (and clear) the queued statements. */
  takePending() {
    if (this.pending.length === 0) return [];
    const out = this.pending;
    this.pending = [];
    return out;
  }
  /**
   * The soft newlines inside `length` characters of source starting at
   * `offset`, shifted to start at `base` — what the sub-parse of a template
   * interpolation (`base` = its synthetic prefix) needs. `undefined` when there
   * are none.
   */
  softNewlinesWithin(offset, length, base) {
    if (!this.softNewlines || this.softNewlines.size === 0) return void 0;
    const out = /* @__PURE__ */ new Set();
    for (const at of this.softNewlines) {
      if (at >= offset && at < offset + length) out.add(base + (at - offset));
    }
    return out.size > 0 ? out : void 0;
  }
  /**
   * True when a `/* … *\/` comment that spans lines sits between `a` and `b`.
   * Comments are not tokens, so this is the only trace of the line break they
   * hide.
   */
  hasLineBreakCommentBetween(a, b) {
    return this.comments.some((c) => c.kind === "Block" && c.endLine > c.line && (c.line > a.line || c.line === a.line && c.column > a.column) && (c.line < b.line || c.line === b.line && c.column < b.column));
  }
  /** Token at absolute index `i`, or `undefined` outside the stream. */
  tokenAt(i) {
    return this.tokens[i];
  }
  consume() {
    if (this.skipNewlines) {
      while (this.tokens[this.index]?.type === "Newline") this.index += 1;
    }
    const tok = this.tokens[this.index] ?? EOF_TOKEN;
    this.index += 1;
    return tok;
  }
  /** Line of the last token actually consumed — used to stamp a statement's own end line. */
  previousConsumedLine() {
    const tok = this.tokens[this.index - 1];
    return tok ? tok.line : this.peek().line;
  }
  /**
   * Next not-yet-attached comment whose line is `>= minLine`, without
   * consuming it. A comment strictly before `minLine` belongs to an
   * ANCESTOR container (or a not-yet-reached sibling) that has not run its
   * own attachment pass yet — it is SKIPPED OVER (not consumed) rather than
   * blocking the search, so it can never permanently hide a container's own,
   * later comment behind it. See `attachComments`'s doc comment for the full
   * ancestor/nested-container reasoning that makes this necessary.
   */
  peekComment(minLine) {
    for (let i = 0; i < this.comments.length; i += 1) {
      if (this.consumedComments.has(i)) continue;
      const c = this.comments[i];
      if (c.line < minLine) continue;
      return c;
    }
    return void 0;
  }
  /** Consume and return the next not-yet-attached comment whose line is `>= minLine`. */
  takeComment(minLine) {
    for (let i = 0; i < this.comments.length; i += 1) {
      if (this.consumedComments.has(i)) continue;
      const c = this.comments[i];
      if (c.line < minLine) continue;
      this.consumedComments.add(i);
      return c;
    }
    throw new Error("takeComment: no unconsumed comment at or after the given line");
  }
  match(type, value) {
    const tok = this.peek();
    if (tok.type !== type) return false;
    if (value !== void 0 && tok.value !== value) return false;
    this.consume();
    return true;
  }
  expect(type, value) {
    const tok = this.peek();
    if (tok.type !== type || value !== void 0 && tok.value !== value) {
      throw {
        message: unexpected(tok, `Expected ${type}${value !== void 0 ? ` "${value}"` : ""} but got ${tok.type} "${tok.value}"`),
        line: tok.line,
        column: tok.column
      };
    }
    return this.consume();
  }
  /** `expect("Identifier")` for a name being declared or bound, which may not be `this`, `super` or `debugger`. */
  expectName() {
    const tok = this.expect("Identifier");
    rejectUnsupportedWord(this, tok);
    return tok;
  }
  recoverToNextLine() {
    while (!this.isEnd() && this.peek().type !== "Newline" && this.peek().type !== "Semicolon") this.consume();
    if (this.peek().type === "Newline" || this.peek().type === "Semicolon") this.consume();
  }
  snapshot() {
    return this.index;
  }
  restore(index) {
    this.index = index;
  }
}
function parseAssignment(ctx) {
  const head = ctx.peek();
  let identifier = "";
  let isState = false;
  if (head.type === "Identifier") {
    rejectUnsupportedWord(ctx, head);
    identifier = ctx.consume().value;
  } else if (head.type === "StateIdentifier") {
    identifier = ctx.consume().value;
    isState = true;
  } else {
    throw {
      message: unexpected(head, `Expected identifier at start of statement, got ${head.type} "${head.value}"`),
      line: head.line,
      column: head.column
    };
  }
  const eq = ctx.expect("Operator", "=");
  skipNewlinesBeforeOperand(ctx);
  const expression = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "Assignment",
    identifier,
    isState,
    expression,
    loc: { line: eq.line, column: eq.column }
  };
}
function parseImportStatement(ctx) {
  const start = ctx.expect("Keyword", "import");
  const unsupported = unsupportedImportForm(ctx, start);
  if (unsupported) throw unsupported;
  ctx.expect("Punctuation", "{");
  const specifiers = [];
  skipWhitespace(ctx);
  while (!ctx.isEnd() && !(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const importedTok = ctx.peek();
    let imported;
    let isState = false;
    if (importedTok.type === "Identifier" && importedTok.value === "type" && ctx.peek(1).type === "Identifier") {
      throw { message: IMPORT_TYPE_MESSAGE, line: importedTok.line, column: importedTok.column };
    }
    if (importedTok.type === "Keyword" && importedTok.value === "default") {
      throw {
        message: 'Default imports are not supported in Aktion — modules only have named exports; import the name the module exports (`import { Name } from "…"`).',
        line: importedTok.line,
        column: importedTok.column
      };
    }
    if (importedTok.type === "StateIdentifier") {
      imported = ctx.consume().value;
      isState = true;
    } else if (importedTok.type === "Identifier") {
      rejectUnsupportedWord(ctx, importedTok);
      imported = ctx.consume().value;
    } else {
      throw {
        message: unexpected(importedTok, `Expected an import name, got ${importedTok.type} "${importedTok.value}"`),
        line: importedTok.line,
        column: importedTok.column
      };
    }
    let local = imported;
    if (ctx.peek().type === "Identifier" && ctx.peek().value === "as") {
      ctx.consume();
      const aliasTok = ctx.peek();
      let aliasIsState = false;
      if (aliasTok.type === "StateIdentifier") {
        local = ctx.consume().value;
        aliasIsState = true;
      } else if (aliasTok.type === "Identifier") {
        rejectUnsupportedWord(ctx, aliasTok);
        local = ctx.consume().value;
      } else {
        throw {
          message: unexpected(aliasTok, `Expected an alias after \`as\`, got ${aliasTok.type} "${aliasTok.value}"`),
          line: aliasTok.line,
          column: aliasTok.column
        };
      }
      if (aliasIsState !== isState) {
        throw {
          message: "A `$state` import must keep its `$` across `as` (e.g. `{ $x as $y }`); a non-state import must not gain one.",
          line: aliasTok.line,
          column: aliasTok.column
        };
      }
    }
    specifiers.push(isState ? { imported, local, isState: true } : { imported, local });
    skipWhitespace(ctx);
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
      skipWhitespace(ctx);
      continue;
    }
    break;
  }
  ctx.expect("Punctuation", "}");
  const fromTok = ctx.peek();
  if (!(fromTok.type === "Identifier" && fromTok.value === "from")) {
    throw {
      message: unexpected(fromTok, `Expected \`from\` after import specifiers, got ${fromTok.type} "${fromTok.value}"`),
      line: fromTok.line,
      column: fromTok.column
    };
  }
  ctx.consume();
  const sourceTok = ctx.expect("String");
  skipTerminator(ctx);
  return {
    kind: "Import",
    specifiers,
    source: sourceTok.value,
    loc: { line: start.line, column: start.column }
  };
}
const DYNAMIC_IMPORT_MESSAGE = 'Dynamic `import()` is not supported in Aktion — use a static `import { … } from "…"` at the top of the module.';
const IMPORT_META_MESSAGE = "`import.meta` is not supported in Aktion — pass the value in from the host page instead.";
const UNSUPPORTED_WORD_MESSAGES = /* @__PURE__ */ new Map([
  [
    "this",
    "`this` is not supported in Aktion — there are no classes or methods, so nothing is ever bound to it. Pass the value as a parameter instead."
  ],
  [
    "super",
    "`super` is not supported in Aktion — there are no classes or inheritance. Call the function you need directly."
  ],
  ["debugger", "`debugger` is not supported in Aktion — remove it, or log the value with `$console.log(…)`."]
]);
function rejectUnsupportedWord(ctx, tok) {
  if (tok.type !== "Identifier" || ctx.allowUnsupportedWords) return;
  const message = UNSUPPORTED_WORD_MESSAGES.get(tok.value);
  if (message) throw { message, line: tok.line, column: tok.column };
}
const BLOCK_LIKE_ERROR = /^(Expected |Unexpected token |Labels )/;
function scanBraces(ctx, open, error) {
  let depth = 0;
  let errorDepth = 0;
  for (let i = open; ; i += 1) {
    const tok = ctx.tokenAt(i);
    if (!tok || tok.type === "EOF") return { close: -1, errorDepth };
    if (errorDepth === 0 && (tok.line > error.line || tok.line === error.line && tok.column >= error.column)) {
      errorDepth = depth;
    }
    if (tok.type !== "Punctuation") continue;
    if (tok.value === "{" || tok.value === "(" || tok.value === "[") depth += 1;
    else if (tok.value === "}" || tok.value === ")" || tok.value === "]") {
      depth -= 1;
      if (depth === 0) return { close: i, errorDepth };
    }
  }
}
const BLOCK_STATEMENT_MESSAGE = "Aktion has no block statements or block scoping — a `{` at the start of a statement can only open an object literal, and this is not one. Hoist the body out of the braces (a `case X:` body needs none), or move it into a function.";
const ASYNC_REASON = "it runs functions synchronously and returns their value, not a Promise. Remove `async` and chain Promises with `.then(…)`.";
const IMPORT_TYPE_MESSAGE = "`import type` is not supported in a `.aktion` file — Aktion has no static types, so remove it (a `.aktion.ts` module may use it: types are erased before parsing).";
function unsupportedImportForm(ctx, start) {
  const next = ctx.peek();
  const at = (tok, message) => ({ message, line: tok.line, column: tok.column });
  if (next.type === "Punctuation" && next.value === "(") return at(start, DYNAMIC_IMPORT_MESSAGE);
  if (next.type === "Punctuation" && next.value === ".") return at(start, IMPORT_META_MESSAGE);
  if (next.type === "Identifier" && next.value === "type") {
    const after = ctx.peek(1);
    const isTypeImport = after.type === "Punctuation" && after.value === "{" || after.type === "Operator" && after.value === "*" || after.type === "Identifier" && after.value !== "from";
    if (isTypeImport) return at(next, IMPORT_TYPE_MESSAGE);
  }
  if (next.type === "String") {
    return at(
      start,
      `Side-effect imports (\`import ${JSON.stringify(next.value)}\`) are not supported in Aktion — import the names you use: \`import { name } from "…"\`.`
    );
  }
  if (next.type === "Operator" && next.value === "*") {
    return at(
      next,
      'Namespace imports (`import * as name`) are not supported in Aktion — import each binding by name: `import { a, b } from "…"`.'
    );
  }
  if (next.type === "Identifier" || next.type === "StateIdentifier") {
    const name = next.type === "StateIdentifier" ? `$${next.value}` : next.value;
    return at(
      next,
      `Default imports are not supported in Aktion — modules only have named exports; write \`import { ${name} } from "…"\`.`
    );
  }
  return null;
}
function parseExportStatement(ctx) {
  const start = ctx.expect("Keyword", "export");
  const next = ctx.peek();
  if (next.type === "Keyword" && next.value === "default") return parseExportDefault(ctx, next);
  if (next.type === "Operator" && next.value === "*") return parseExportAll(ctx, start);
  if (next.type === "Punctuation" && next.value === "{") return parseExportList(ctx, start);
  let stmt;
  if (next.type === "Keyword" && next.value === "function") {
    stmt = parseFunctionDecl(ctx);
  } else if (next.type === "Keyword" && next.value === "async" && ctx.peek(1).type === "Keyword" && ctx.peek(1).value === "function") {
    ctx.consume();
    stmt = parseFunctionDecl(ctx);
  } else if (next.type === "Keyword" && (next.value === "let" || next.value === "const" || next.value === "var")) {
    stmt = parseVarDecl(ctx);
    const more = ctx.takePending();
    for (const declarator of [stmt, ...more]) {
      if (declarator.kind === "DestructureStatement") {
        throw {
          message: "`export` of a destructuring declaration is not supported — export named bindings individually.",
          line: declarator.loc?.line ?? next.line,
          column: declarator.loc?.column ?? next.column
        };
      }
      if (declarator.kind === "Assignment") declarator.exported = true;
    }
    ctx.queuePending(more);
  } else if (couldStartAssignment(ctx)) {
    stmt = parseAssignment(ctx);
  } else {
    throw {
      message: "`export` must be followed by a declaration or assignment (`export function …`, `export let x = …`, `export $state = …`).",
      line: next.line,
      column: next.column
    };
  }
  if (stmt && (stmt.kind === "Assignment" || stmt.kind === "ComponentDeclaration" || stmt.kind === "ActionDeclaration" || stmt.kind === "HookDeclaration")) {
    stmt.exported = true;
    return stmt;
  }
  throw {
    message: "`export` must be followed by a declaration or assignment.",
    line: start.line,
    column: start.column
  };
}
const EXPORT_DEFAULT_MESSAGE = "Aktion modules only have named exports — `default` cannot be an export name; `export default` is reserved for the entry's `$app(…)` call.";
function parseExportList(ctx, start) {
  ctx.expect("Punctuation", "{");
  const specifiers = [];
  const seen = /* @__PURE__ */ new Set();
  skipWhitespace(ctx);
  while (!ctx.isEnd() && !(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const localTok = ctx.peek();
    if (localTok.type === "Keyword" && localTok.value === "default") {
      throw { message: EXPORT_DEFAULT_MESSAGE, line: localTok.line, column: localTok.column };
    }
    if (localTok.type !== "StateIdentifier" && localTok.type !== "Identifier") {
      throw {
        message: unexpected(localTok, `Expected an export name, got ${localTok.type} "${localTok.value}"`),
        line: localTok.line,
        column: localTok.column
      };
    }
    if (localTok.type === "Identifier") rejectUnsupportedWord(ctx, localTok);
    const isState = localTok.type === "StateIdentifier";
    const local = ctx.consume().value;
    let exported = local;
    if (ctx.peek().type === "Identifier" && ctx.peek().value === "as") {
      ctx.consume();
      const aliasTok = ctx.peek();
      if (aliasTok.type === "Keyword" && aliasTok.value === "default") {
        throw { message: EXPORT_DEFAULT_MESSAGE, line: aliasTok.line, column: aliasTok.column };
      }
      if (aliasTok.type !== "StateIdentifier" && aliasTok.type !== "Identifier") {
        throw {
          message: unexpected(aliasTok, `Expected an alias after \`as\`, got ${aliasTok.type} "${aliasTok.value}"`),
          line: aliasTok.line,
          column: aliasTok.column
        };
      }
      if (aliasTok.type === "Identifier") rejectUnsupportedWord(ctx, aliasTok);
      if (aliasTok.type === "StateIdentifier" !== isState) {
        throw {
          message: "A `$state` export must keep its `$` across `as` (e.g. `{ $x as $y }`); a non-state export must not gain one.",
          line: aliasTok.line,
          column: aliasTok.column
        };
      }
      exported = ctx.consume().value;
    }
    const key = isState ? `$${exported}` : exported;
    if (seen.has(key)) {
      throw {
        message: `\`${key}\` is exported twice in this list.`,
        line: localTok.line,
        column: localTok.column
      };
    }
    seen.add(key);
    specifiers.push({
      local,
      exported,
      ...isState ? { isState: true } : {},
      loc: { line: localTok.line, column: localTok.column }
    });
    skipWhitespace(ctx);
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
      skipWhitespace(ctx);
      continue;
    }
    break;
  }
  ctx.expect("Punctuation", "}");
  let source;
  const fromTok = ctx.peek();
  if (fromTok.type === "Identifier" && fromTok.value === "from") {
    ctx.consume();
    source = ctx.expect("String").value;
  }
  skipTerminator(ctx);
  return {
    kind: "ExportList",
    specifiers,
    ...source === void 0 ? {} : { source },
    loc: { line: start.line, column: start.column }
  };
}
function parseExportAll(ctx, start) {
  const star = ctx.expect("Operator", "*");
  const after = ctx.peek();
  if (after.type === "Identifier" && after.value === "as") {
    throw {
      message: '`export * as name from …` is not supported — Aktion has no namespace objects; list the names: `export { a, b } from "…"`, or `export * from "…"`.',
      line: star.line,
      column: star.column
    };
  }
  if (!(after.type === "Identifier" && after.value === "from")) {
    throw {
      message: unexpected(after, `Expected \`from\` after \`export *\`, got ${after.type} "${after.value}"`),
      line: after.line,
      column: after.column
    };
  }
  ctx.consume();
  const source = ctx.expect("String").value;
  skipTerminator(ctx);
  return { kind: "ExportList", specifiers: [], source, all: true, loc: { line: start.line, column: start.column } };
}
function parseExportDefault(ctx, defaultTok) {
  ctx.consume();
  const head = ctx.peek();
  if (head.type === "Error") throw { message: unexpected(head, ""), line: head.line, column: head.column };
  if (head.type === "StateIdentifier" && head.value === "app") {
    const stmt = parseExpressionStatement(ctx);
    if (stmt.kind === "ExpressionStatement" && isAppCall$1(stmt.expression)) {
      stmt.exportDefault = true;
      return stmt;
    }
  }
  throw {
    message: "`export default` is only supported for the entry's `$app(…)` call — export anything else by name (`export function App() {…}`, `export const value = …`).",
    line: defaultTok.line,
    column: defaultTok.column
  };
}
function isAppCall$1(expr) {
  return expr.kind === "Invoke" && expr.optional !== true && expr.callee.kind === "StateRef" && expr.callee.name === "app";
}
function parseExpression(ctx) {
  return parseTernary(ctx);
}
function peekNonNewline(ctx) {
  let i = 0;
  while (true) {
    const t = ctx.peek(i);
    if (t.type === "Newline") {
      i += 1;
      continue;
    }
    return { token: t, skipped: i };
  }
}
function consumeNewlinesIfNext(ctx, predicate) {
  const { token, skipped } = peekNonNewline(ctx);
  if (!predicate(token)) return false;
  for (let i = 0; i < skipped; i += 1) ctx.consume();
  return true;
}
function operatorLoc(tok) {
  return { line: tok.line, column: tok.column };
}
const TEMPLATE_SUB_PREFIX = "__rui_tmpl__ = ";
function rebaseTemplateLocations(root, line, column) {
  const exprStartColumn = column + "${".length;
  walkNode(root, ({ node }) => {
    const loc = node.loc;
    if (!loc) return;
    if (loc.line === 1) {
      loc.column = exprStartColumn + (loc.column - (TEMPLATE_SUB_PREFIX.length + 1));
    }
    loc.line = line + (loc.line - 1);
  });
}
function rebaseTemplatePosition(pos, line, column) {
  if (pos.line !== 1) return { line: line + (pos.line - 1), column: pos.column };
  const exprStartColumn = column + "${".length;
  return { line, column: Math.max(exprStartColumn, exprStartColumn + (pos.column - (TEMPLATE_SUB_PREFIX.length + 1))) };
}
function interpolationError(sub, source, line, column) {
  if (source.trim() === "") {
    return {
      message: "Empty `${}` in a template literal — write an expression inside it, or remove it.",
      line,
      column
    };
  }
  const first = sub.errors[0];
  if (first) {
    const at = rebaseTemplatePosition(first, line, column);
    const message = first.message.startsWith("Unexpected token EOF") ? "Unexpected end of the `${…}` interpolation — it needs a complete expression." : first.message;
    return { message, ...at };
  }
  if (sub.statements.length !== 1 || sub.statements[0].kind !== "Assignment") {
    const loc = sub.statements[1]?.loc;
    const at = loc ? rebaseTemplatePosition(loc, line, column) : { line, column };
    return {
      message: "A `${…}` interpolation holds a single expression — move the other statements out of the template.",
      ...at
    };
  }
  return null;
}
function parseTernary(ctx) {
  const test = parseLogicalOr(ctx);
  if (consumeNewlinesIfNext(ctx, (t) => t.type === "Punctuation" && t.value === "?")) {
    const question = ctx.consume();
    skipWhitespace(ctx);
    const consequent = parseExpression(ctx);
    skipWhitespace(ctx);
    ctx.expect("Punctuation", ":");
    skipWhitespace(ctx);
    const alternate = parseExpression(ctx);
    return { kind: "Ternary", test, consequent, alternate, loc: operatorLoc(question) };
  }
  return test;
}
function parseLogicalOr(ctx) {
  let left = parseLogicalAnd(ctx);
  while (consumeNewlinesIfNext(
    ctx,
    (t) => t.type === "Operator" && (t.value === "||" || t.value === "??")
  )) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseLogicalAnd(ctx);
    left = { kind: "Binary", operator: tok.value, left, right, loc: operatorLoc(tok) };
  }
  return left;
}
function parseLogicalAnd(ctx) {
  let left = parseBitwiseOr(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "&&")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseOr(ctx);
    left = { kind: "Binary", operator: "&&", left, right, loc: operatorLoc(tok) };
  }
  return left;
}
function parseBitwiseOr(ctx) {
  let left = parseBitwiseXor(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "|")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseXor(ctx);
    left = { kind: "Binary", operator: "|", left, right, loc: operatorLoc(tok) };
  }
  return left;
}
function parseBitwiseXor(ctx) {
  let left = parseBitwiseAnd(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "^")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseAnd(ctx);
    left = { kind: "Binary", operator: "^", left, right, loc: operatorLoc(tok) };
  }
  return left;
}
function parseBitwiseAnd(ctx) {
  let left = parseEquality(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "&")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseEquality(ctx);
    left = { kind: "Binary", operator: "&", left, right, loc: operatorLoc(tok) };
  }
  return left;
}
function parseEquality(ctx) {
  let left = parseComparison(ctx);
  while (consumeNewlinesIfNext(
    ctx,
    (t) => t.type === "Operator" && (t.value === "==" || t.value === "!=" || t.value === "===" || t.value === "!==")
  )) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseComparison(ctx);
    left = {
      kind: "Binary",
      operator: tok.value,
      left,
      right,
      loc: operatorLoc(tok)
    };
  }
  return left;
}
function parseComparison(ctx) {
  let left = parseShift(ctx);
  while (true) {
    if (consumeNewlinesIfNext(
      ctx,
      (t) => t.type === "Operator" && (t.value === ">" || t.value === "<" || t.value === ">=" || t.value === "<=")
    )) {
      const tok = ctx.consume();
      skipWhitespace(ctx);
      const right = parseShift(ctx);
      left = {
        kind: "Binary",
        operator: tok.value,
        left,
        right,
        loc: operatorLoc(tok)
      };
      continue;
    }
    if (consumeNewlinesIfNext(ctx, (t) => t.type === "Keyword" && (t.value === "instanceof" || t.value === "in"))) {
      const tok = ctx.consume();
      skipWhitespace(ctx);
      const right = parseShift(ctx);
      left = {
        kind: "Binary",
        operator: tok.value,
        left,
        right,
        loc: operatorLoc(tok)
      };
      continue;
    }
    break;
  }
  return left;
}
function parseShift(ctx) {
  let left = parseAdditive(ctx);
  while (consumeNewlinesIfNext(
    ctx,
    (t) => t.type === "Operator" && (t.value === "<<" || t.value === ">>" || t.value === ">>>")
  )) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseAdditive(ctx);
    left = {
      kind: "Binary",
      operator: tok.value,
      left,
      right,
      loc: operatorLoc(tok)
    };
  }
  return left;
}
function parseAdditive(ctx) {
  let left = parseMultiplicative(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && (t.value === "+" || t.value === "-"))) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseMultiplicative(ctx);
    left = { kind: "Binary", operator: tok.value, left, right, loc: operatorLoc(tok) };
  }
  return left;
}
function parseMultiplicative(ctx) {
  let left = parseExponent(ctx);
  while (consumeNewlinesIfNext(
    ctx,
    (t) => t.type === "Operator" && (t.value === "*" || t.value === "/" || t.value === "%")
  )) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseExponent(ctx);
    left = {
      kind: "Binary",
      operator: tok.value,
      left,
      right,
      loc: operatorLoc(tok)
    };
  }
  return left;
}
function parseExponent(ctx) {
  const left = parseUnary(ctx);
  if (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "**")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseExponent(ctx);
    return { kind: "Binary", operator: "**", left, right, loc: operatorLoc(tok) };
  }
  return left;
}
function parseUnary(ctx) {
  const tok = ctx.peek();
  if (tok.type === "Operator" && (tok.value === "!" || tok.value === "-" || tok.value === "+" || tok.value === "~")) {
    ctx.consume();
    const argument = parseUnary(ctx);
    return { kind: "Unary", operator: tok.value, argument };
  }
  if (tok.type === "Keyword" && tok.value === "await") {
    ctx.consume();
    const argument = parseUnary(ctx);
    return {
      kind: "BuiltinCall",
      name: "__rui_await__",
      arguments: [argument],
      loc: { line: tok.line, column: tok.column }
    };
  }
  if (tok.type === "Operator" && (tok.value === "++" || tok.value === "--")) {
    ctx.consume();
    const argument = parseUnary(ctx);
    return {
      kind: "BuiltinCall",
      name: "__rui_prefix__",
      arguments: [
        argument,
        { kind: "Literal", value: tok.value }
      ],
      loc: { line: tok.line, column: tok.column }
    };
  }
  if (tok.type === "Keyword" && (tok.value === "typeof" || tok.value === "void" || tok.value === "delete")) {
    ctx.consume();
    const argument = parseUnary(ctx);
    return {
      kind: "Unary",
      operator: tok.value,
      argument
    };
  }
  if (tok.type === "Keyword" && tok.value === "new") {
    ctx.consume();
    let callee = parsePrimary(ctx);
    let args = [];
    if (callee.kind === "Call") {
      args = callee.arguments;
      callee = { kind: "Identifier", name: callee.callee, loc: callee.loc };
    } else {
      while (true) {
        const t = ctx.peek();
        if (t.type === "Punctuation" && t.value === ".") {
          ctx.consume();
          const propTok = ctx.consume();
          if (propTok.type !== "Identifier" && propTok.type !== "Keyword") {
            throw {
              message: unexpected(propTok, `Expected Identifier but got ${propTok.type} "${propTok.value}"`),
              line: propTok.line,
              column: propTok.column
            };
          }
          callee = { kind: "Member", object: callee, property: propTok.value };
          continue;
        }
        if (t.type === "Punctuation" && t.value === "[") {
          callee = { kind: "Member", object: callee, computed: parseBracketedKey(ctx) };
          continue;
        }
        break;
      }
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        args = parseParenArgs(ctx);
      }
    }
    const newNode = {
      kind: "New",
      callee,
      arguments: args,
      loc: { line: tok.line, column: tok.column }
    };
    return parsePostfixFrom(ctx, newNode);
  }
  return parsePostfixWithIncDec(ctx);
}
function parsePostfixWithIncDec(ctx) {
  const expr = parsePostfix(ctx);
  const tok = ctx.peek();
  if (tok.type === "Operator" && (tok.value === "++" || tok.value === "--")) {
    ctx.consume();
    return {
      kind: "BuiltinCall",
      name: "__rui_postfix__",
      arguments: [
        expr,
        { kind: "Literal", value: tok.value }
      ],
      loc: { line: tok.line, column: tok.column }
    };
  }
  return expr;
}
function parsePostfix(ctx) {
  return parsePostfixFrom(ctx, parsePrimary(ctx));
}
function parsePostfixFrom(ctx, base) {
  let expr = base;
  while (true) {
    consumeNewlinesIfNext(
      ctx,
      (t) => t.type === "Punctuation" && t.value === "." || t.type === "Operator" && t.value === "?."
    );
    const tok = ctx.peek();
    if (tok.type === "Punctuation" && tok.value === ".") {
      ctx.consume();
      const propTok = ctx.consume();
      if (propTok.type !== "Identifier" && propTok.type !== "Keyword" && propTok.type !== "StateIdentifier") {
        throw {
          message: unexpected(propTok, `Expected Identifier but got ${propTok.type} "${propTok.value}"`),
          line: propTok.line,
          column: propTok.column
        };
      }
      const after = ctx.peek();
      if (after.type === "Punctuation" && after.value === "(") {
        const args = parseParenArgs(ctx);
        expr = {
          kind: "MethodCall",
          object: expr,
          method: propTok.value,
          arguments: args,
          loc: { line: propTok.line, column: propTok.column }
        };
        continue;
      }
      expr = { kind: "Member", object: expr, property: propTok.value };
      continue;
    }
    if (tok.type === "Operator" && tok.value === "?.") {
      ctx.consume();
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "[") {
        expr = { kind: "Member", object: expr, computed: parseBracketedKey(ctx), optional: true };
      } else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        const args = parseParenArgs(ctx);
        expr = {
          kind: "Invoke",
          callee: expr,
          arguments: args,
          optional: true,
          loc: { line: tok.line, column: tok.column }
        };
      } else {
        const propTok = ctx.consume();
        if (propTok.type !== "Identifier" && propTok.type !== "Keyword" && propTok.type !== "StateIdentifier") {
          throw {
            message: unexpected(propTok, `Expected Identifier but got ${propTok.type} "${propTok.value}"`),
            line: propTok.line,
            column: propTok.column
          };
        }
        const after = ctx.peek();
        if (after.type === "Punctuation" && after.value === "(") {
          const args = parseParenArgs(ctx);
          expr = {
            kind: "MethodCall",
            object: expr,
            method: propTok.value,
            arguments: args,
            optional: true,
            loc: { line: propTok.line, column: propTok.column }
          };
          continue;
        }
        expr = { kind: "Member", object: expr, property: propTok.value, optional: true };
      }
      continue;
    }
    if (tok.type === "Punctuation" && tok.value === "[") {
      expr = { kind: "Member", object: expr, computed: parseBracketedKey(ctx) };
      continue;
    }
    if (tok.type === "Punctuation" && tok.value === "(") {
      const args = parseParenArgs(ctx);
      expr = {
        kind: "Invoke",
        callee: expr,
        arguments: args,
        loc: { line: tok.line, column: tok.column }
      };
      continue;
    }
    break;
  }
  return expr;
}
function parsePrimary(ctx) {
  const tok = ctx.peek();
  if (tok.type === "Keyword" && (tok.value === "if" || tok.value === "for" || tok.value === "switch" || tok.value === "while" || tok.value === "try")) {
    const hint = tok.value === "if" ? "Use the ternary operator (`cond ? a : b`) when you need a value." : tok.value === "for" ? "Use `arr.map(x => …)` (or `.filter`, `.reduce`, …) to collect bodies into an array." : tok.value === "switch" ? "Use chained ternaries, an object lookup, or wrap the switch inside a `function`." : `Use the ${tok.value} statement inside a function / effect body.`;
    const err = {
      message: `\`${tok.value}\` is a statement, not an expression. ${hint}`,
      line: tok.line,
      column: tok.column
    };
    err.__definitive = true;
    throw err;
  }
  if (tok.type === "Keyword" && tok.value === "async") {
    const next = ctx.peek(1);
    const what = next.type === "Keyword" && next.value === "function" ? "function expressions" : "arrow functions";
    throw {
      message: `\`async\` ${what} are not supported in Aktion — ${ASYNC_REASON}`,
      line: tok.line,
      column: tok.column
    };
  }
  if (tok.type === "Keyword" && tok.value === "import") {
    const next = ctx.peek(1);
    if (next.type === "Punctuation" && (next.value === "(" || next.value === ".")) {
      throw {
        message: next.value === "(" ? DYNAMIC_IMPORT_MESSAGE : IMPORT_META_MESSAGE,
        line: tok.line,
        column: tok.column
      };
    }
  }
  if (tok.type === "Keyword") {
    if (tok.value === "function") {
      const lookahead = ctx.peek(1);
      const lookahead2 = ctx.peek(2);
      const looksLikeFunctionExpr = lookahead.type === "Punctuation" && lookahead.value === "(" || lookahead.type === "Identifier" && lookahead2.type === "Punctuation" && lookahead2.value === "(";
      if (looksLikeFunctionExpr) {
        const start = tok;
        ctx.consume();
        const selfName = ctx.peek().type === "Identifier" ? ctx.expectName().value : void 0;
        const params = parseFunctionParams(ctx);
        const body = parseBlock(ctx);
        return {
          kind: "Lambda",
          params,
          body,
          ...selfName !== void 0 ? { selfName } : {},
          loc: { line: start.line, column: start.column }
        };
      }
    }
    if (tok.value === "function" || tok.value === "let" || tok.value === "const" || tok.value === "var" || tok.value === "of" || tok.value === "in" || tok.value === "case" || tok.value === "break" || tok.value === "continue" || tok.value === "default") {
      ctx.consume();
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        const args = parseParenArgs(ctx);
        return {
          kind: "Call",
          callee: tok.value,
          arguments: args,
          loc: { line: tok.line, column: tok.column }
        };
      }
      return { kind: "Identifier", name: tok.value, loc: { line: tok.line, column: tok.column } };
    }
  }
  if (tok.type === "Number") {
    ctx.consume();
    return { kind: "Literal", value: numericLiteralValue(tok.value) };
  }
  if (tok.type === "String") {
    ctx.consume();
    return { kind: "Literal", value: tok.value };
  }
  if (tok.type === "Regex") {
    ctx.consume();
    const args = [{ kind: "Literal", value: tok.value }];
    if (tok.flags) args.push({ kind: "Literal", value: tok.flags });
    return {
      kind: "New",
      callee: { kind: "Identifier", name: "RegExp" },
      arguments: args,
      loc: { line: tok.line, column: tok.column }
    };
  }
  if (tok.type === "TemplateString") {
    ctx.consume();
    const parts = tok.parts ?? [];
    const quasis = [];
    const expressions = [];
    let pendingChunk = "";
    let hasPendingChunk = false;
    const flushChunk = () => {
      quasis.push(pendingChunk);
      pendingChunk = "";
      hasPendingChunk = false;
    };
    for (const part of parts) {
      if (part.kind === "str") {
        pendingChunk += part.text;
        hasPendingChunk = true;
        continue;
      }
      if (!hasPendingChunk) {
        quasis.push("");
      } else {
        flushChunk();
      }
      const softNewlines = part.offset === void 0 ? void 0 : ctx.softNewlinesWithin(part.offset, part.source.length, TEMPLATE_SUB_PREFIX.length);
      const sub = parse(`${TEMPLATE_SUB_PREFIX}${part.source}`, {
        ...softNewlines ? { softNewlines } : {},
        ...ctx.allowUnsupportedWords ? { allowUnsupportedWords: true } : {}
      });
      if (tok.open !== true) {
        const problem = interpolationError(sub, part.source, part.line, part.column);
        if (problem) throw problem;
      }
      const firstStmt = sub.statements[0];
      if (firstStmt && firstStmt.kind === "Assignment") {
        rebaseTemplateLocations(firstStmt.expression, part.line, part.column);
        expressions.push(firstStmt.expression);
      } else {
        expressions.push({ kind: "Literal", value: "" });
      }
    }
    if (hasPendingChunk || quasis.length === 0) {
      quasis.push(pendingChunk);
    }
    while (quasis.length <= expressions.length) quasis.push("");
    return {
      kind: "Template",
      quasis,
      expressions,
      loc: { line: tok.line, column: tok.column }
    };
  }
  if (tok.type === "Boolean") {
    ctx.consume();
    return { kind: "Literal", value: tok.value === "true" };
  }
  if (tok.type === "Null") {
    ctx.consume();
    return { kind: "Literal", value: null };
  }
  if (tok.type === "StateIdentifier") {
    if (tok.value === "effect" && ctx.peek(1).type === "Punctuation" && ctx.peek(1).value === "(") {
      ctx.consume();
      return parseEffectCallAsExpr(ctx, tok);
    }
    ctx.consume();
    return { kind: "StateRef", name: tok.value };
  }
  if (tok.type === "Identifier") {
    rejectUnsupportedWord(ctx, tok);
    ctx.consume();
    if (ctx.peek().type === "Operator" && ctx.peek().value === "=>") {
      ctx.consume();
      const body = parseLambdaBody(ctx);
      return {
        kind: "Lambda",
        params: [{ name: tok.value }],
        body,
        loc: { line: tok.line, column: tok.column }
      };
    }
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
      const args = parseParenArgs(ctx);
      return {
        kind: "Call",
        callee: tok.value,
        arguments: args,
        loc: { line: tok.line, column: tok.column }
      };
    }
    return {
      kind: "Identifier",
      name: tok.value,
      loc: { line: tok.line, column: tok.column }
    };
  }
  if (tok.type === "Punctuation" && tok.value === "[") {
    ctx.consume();
    const elements = ctx.withNewlines(true, () => {
      const items = parseCallArgs(ctx);
      ctx.expect("Punctuation", "]");
      return items;
    });
    return { kind: "Array", elements };
  }
  if (tok.type === "Punctuation" && tok.value === "{") {
    ctx.consume();
    const properties = ctx.withNewlines(true, () => {
      const props = parseObjectProps(ctx);
      ctx.expect("Punctuation", "}");
      return props;
    });
    return { kind: "Object", properties };
  }
  if (tok.type === "Punctuation" && tok.value === "(") {
    const saved = ctx.snapshot();
    const lambda = tryParseLambdaFromParenList(ctx);
    if (lambda) return lambda;
    ctx.restore(saved);
    ctx.consume();
    return ctx.withNewlines(true, () => {
      const expr = parseExpression(ctx);
      const next = ctx.peek();
      if (next.type === "Punctuation" && next.value === ",") {
        throw {
          message: "The comma operator is not supported in Aktion — write each expression as its own statement (inside an arrow function, use a `{ … }` body).",
          line: next.line,
          column: next.column
        };
      }
      if (next.type === "Operator" && isAssignmentOperator(next.value)) {
        if (expr.kind === "Array" || expr.kind === "Object") {
          throw { message: DESTRUCTURING_ASSIGNMENT_MESSAGE, line: tok.line, column: tok.column };
        }
        throw {
          message: "Assignment inside an expression is not supported in Aktion — assign in its own statement first, then use the name.",
          line: next.line,
          column: next.column
        };
      }
      ctx.expect("Punctuation", ")");
      return expr;
    });
  }
  throw {
    message: unexpected(tok, `Unexpected token ${tok.type} "${tok.value}"`),
    line: tok.line,
    column: tok.column
  };
}
function parseEffectCallAsExpr(ctx, nameTok) {
  const args = parseParenArgs(ctx);
  return {
    kind: "Call",
    callee: nameTok.value,
    arguments: args,
    loc: { line: nameTok.line, column: nameTok.column }
  };
}
function parseParenArgs(ctx) {
  ctx.expect("Punctuation", "(");
  return ctx.withNewlines(true, () => {
    const args = parseCallArgs(ctx);
    ctx.expect("Punctuation", ")");
    return args;
  });
}
function parseBracketedKey(ctx) {
  ctx.expect("Punctuation", "[");
  return ctx.withNewlines(true, () => {
    const key = parseExpression(ctx);
    ctx.expect("Punctuation", "]");
    return key;
  });
}
function parseConditionHead(ctx) {
  ctx.expect("Punctuation", "(");
  return ctx.withNewlines(true, () => {
    const test = parseExpression(ctx);
    ctx.expect("Punctuation", ")");
    return test;
  });
}
function parseCallArgs(ctx) {
  const args = [];
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && (ctx.peek().value === ")" || ctx.peek().value === "]")) {
    return args;
  }
  args.push(parseArgItem(ctx));
  skipWhitespace(ctx);
  while (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
    ctx.consume();
    skipWhitespace(ctx);
    if (ctx.peek().type === "Punctuation" && (ctx.peek().value === ")" || ctx.peek().value === "]")) {
      break;
    }
    args.push(parseArgItem(ctx));
    skipWhitespace(ctx);
  }
  skipWhitespace(ctx);
  return args;
}
function parseArgItem(ctx) {
  if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
    const tok = ctx.consume();
    const argument = parseExpression(ctx);
    return { kind: "Spread", argument, loc: { line: tok.line, column: tok.column } };
  }
  return parseExpression(ctx);
}
function parseIfStatement(ctx) {
  const start = ctx.expect("Keyword", "if");
  const test = parseConditionHead(ctx);
  const consequent = parseBlockOrSingleStatement(ctx);
  let alternate;
  skipWhitespace(ctx);
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "else") {
    ctx.consume();
    skipWhitespace(ctx);
    if (ctx.peek().type === "Keyword" && ctx.peek().value === "if") {
      alternate = parseIfStatement(ctx);
    } else {
      alternate = parseBlockOrSingleStatement(ctx);
    }
  }
  skipTerminator(ctx);
  const ifStmt = {
    kind: "IfStatement",
    test,
    consequent,
    alternate,
    loc: { line: start.line, column: start.column }
  };
  const last = alternate ?? consequent;
  nodeEndLine.set(ifStmt, nodeEndLine.get(last) ?? last.loc?.line ?? start.line);
  return ifStmt;
}
function parseSwitchStatement(ctx) {
  const start = ctx.expect("Keyword", "switch");
  const discriminant = parseConditionHead(ctx);
  const openBrace = ctx.expect("Punctuation", "{");
  const cases = ctx.withNewlines(false, () => parseSwitchCases(ctx, openBrace));
  skipTerminator(ctx);
  return {
    kind: "SwitchStatement",
    discriminant,
    cases,
    loc: { line: start.line, column: start.column }
  };
}
function parseSwitchCases(ctx, openBrace) {
  const cases = [];
  skipWhitespace(ctx);
  let lastLine = openBrace.line;
  let caseWindowStart = openBrace.line;
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const caseHead = ctx.peek();
    let test = null;
    if (caseHead.type === "Keyword" && caseHead.value === "case") {
      ctx.consume();
      test = parseExpression(ctx);
    } else if (caseHead.type === "Keyword" && caseHead.value === "default") {
      ctx.consume();
      test = null;
    } else {
      throw {
        message: unexpected(ctx.peek(), `Expected "case" or "default" in switch body, got ${ctx.peek().type} "${ctx.peek().value}"`),
        line: ctx.peek().line,
        column: ctx.peek().column
      };
    }
    ctx.expect("Punctuation", ":");
    skipWhitespace(ctx);
    const body = [];
    while (!ctx.isEnd() && !(ctx.peek().type === "Keyword" && (ctx.peek().value === "case" || ctx.peek().value === "default")) && !(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
      const stmt = parseStatement(ctx);
      if (stmt) body.push(stmt);
      body.push(...ctx.takePending());
      skipWhitespace(ctx);
    }
    const caseEndLineExclusive = ctx.peek().line;
    const caseLeading = [];
    while (true) {
      const c = ctx.peekComment(caseWindowStart);
      if (!c || c.line >= caseHead.line) break;
      ctx.takeComment(caseWindowStart);
      caseLeading.push({ ...c, blankLineBefore: c.line > lastLine + 1 });
      lastLine = c.endLine;
    }
    const caseObj = { test, body };
    if (caseLeading.length > 0) caseObj.leadingComments = caseLeading;
    const lastBodyLine = body.length > 0 ? nodeEndLine.get(body[body.length - 1]) ?? caseHead.line : caseHead.line;
    const bodyEndLineExclusive = Math.min(caseEndLineExclusive, lastBodyLine + 1);
    attachComments(ctx, body, caseHead.line, bodyEndLineExclusive);
    lastLine = lastBodyLine;
    caseWindowStart = bodyEndLineExclusive;
    cases.push(caseObj);
    skipWhitespace(ctx);
  }
  ctx.expect("Punctuation", "}");
  return cases;
}
function parseForStatement(ctx) {
  const start = ctx.expect("Keyword", "for");
  ctx.expect("Punctuation", "(");
  const head = ctx.withNewlines(true, () => parseForHead(ctx));
  const body = parseBlockOrSingleStatement(ctx);
  skipTerminator(ctx);
  const loc = { line: start.line, column: start.column };
  if (head.kind === "classic") {
    return { kind: "ForClassicStatement", init: head.init, test: head.test, update: head.update, body, loc };
  }
  if (head.kind === "for-in") {
    return { kind: "ForInStatement", item: head.item, ...head.declaration, iterable: head.iterable, body, loc };
  }
  return {
    kind: "ForOfStatement",
    item: head.item,
    pattern: head.pattern,
    ...head.declaration,
    iterable: head.iterable,
    body,
    loc
  };
}
function parseForHead(ctx) {
  let kind = "for-of";
  {
    let depth = 1;
    for (let i = ctx.snapshot(); ; i += 1) {
      const tok = ctx.tokenAt(i);
      if (!tok || tok.type === "EOF") break;
      if (tok.type === "Punctuation" && tok.value === "(") depth += 1;
      else if (tok.type === "Punctuation" && tok.value === ")") {
        depth -= 1;
        if (depth === 0) break;
      } else if (depth === 1 && tok.type === "Semicolon") {
        kind = "classic";
        break;
      } else if (depth === 1 && tok.type === "Keyword" && tok.value === "of") {
        kind = "for-of";
        break;
      } else if (depth === 1 && tok.type === "Keyword" && tok.value === "in") {
        kind = "for-in";
        break;
      }
    }
  }
  if (kind === "classic") return parseForClassicHead(ctx);
  let declaration = {};
  if (ctx.peek().type === "Keyword" && (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")) {
    declaration = declarationOf(ctx.consume());
  }
  skipWhitespace(ctx);
  let item = "__row";
  let pattern;
  if (ctx.peek().type === "Punctuation" && (ctx.peek().value === "[" || ctx.peek().value === "{")) {
    pattern = parseDestructuringPattern(ctx);
  } else {
    item = ctx.expectName().value;
  }
  if (kind === "for-in") {
    ctx.expect("Keyword", "in");
  } else {
    ctx.expect("Keyword", "of");
  }
  const iterable = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  return { kind, item, pattern, declaration, iterable };
}
function parseForClassicHead(ctx) {
  let init;
  if (!(ctx.peek().type === "Semicolon")) {
    if (ctx.peek().type === "Keyword" && (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")) {
      const decl = parseVarDecl(ctx, true);
      if (decl.kind === "Assignment") init = decl;
      ctx.expect("Semicolon");
    } else {
      const exprStart = ctx.peek();
      const expression = parseExpression(ctx);
      init = {
        kind: "ExpressionStatement",
        expression,
        loc: { line: exprStart.line, column: exprStart.column }
      };
      ctx.expect("Semicolon");
    }
  } else {
    ctx.expect("Semicolon");
  }
  let test;
  if (!(ctx.peek().type === "Semicolon")) {
    test = parseExpression(ctx);
  }
  ctx.expect("Semicolon");
  let update;
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    update = parseAssignmentLikeExpression(ctx);
  }
  const comma = ctx.peek();
  if (comma.type === "Punctuation" && comma.value === ",") {
    throw {
      message: "The comma operator is not supported in Aktion — a `for (…)` update must be a single expression; update the other variable inside the loop body.",
      line: comma.line,
      column: comma.column
    };
  }
  ctx.expect("Punctuation", ")");
  return { kind: "classic", init, test, update };
}
function parseWhileStatement(ctx) {
  const start = ctx.expect("Keyword", "while");
  const test = parseConditionHead(ctx);
  const body = parseBlockOrSingleStatement(ctx);
  skipTerminator(ctx);
  return {
    kind: "WhileStatement",
    test,
    body,
    loc: { line: start.line, column: start.column }
  };
}
function parseDoWhileStatement(ctx) {
  const start = ctx.expect("Keyword", "do");
  const body = parseBlockOrSingleStatement(ctx);
  skipWhitespace(ctx);
  ctx.expect("Keyword", "while");
  const test = parseConditionHead(ctx);
  skipTerminator(ctx);
  return {
    kind: "DoWhileStatement",
    test,
    body,
    loc: { line: start.line, column: start.column }
  };
}
function parseBreakStatement(ctx) {
  const start = ctx.expect("Keyword", "break");
  skipTerminator(ctx);
  return { kind: "BreakStatement", loc: { line: start.line, column: start.column } };
}
function parseContinueStatement(ctx) {
  const start = ctx.expect("Keyword", "continue");
  skipTerminator(ctx);
  return { kind: "ContinueStatement", loc: { line: start.line, column: start.column } };
}
function parseThrowStatement(ctx) {
  const start = ctx.expect("Keyword", "throw");
  const argument = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "ThrowStatement",
    argument,
    loc: { line: start.line, column: start.column }
  };
}
function parseTryStatement(ctx) {
  const start = ctx.expect("Keyword", "try");
  const block = parseBlock(ctx);
  let catchParam;
  let catchBlock;
  let finallyBlock;
  skipWhitespace(ctx);
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "catch") {
    ctx.consume();
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
      ctx.consume();
      catchParam = ctx.withNewlines(true, () => {
        const tok = ctx.peek();
        if (tok.type === "Punctuation" && (tok.value === "{" || tok.value === "[")) {
          throw {
            message: "Destructuring the `catch` parameter is not supported in Aktion — catch the error by name (`catch (error)`) and read its fields (`error.message`).",
            line: tok.line,
            column: tok.column
          };
        }
        const name = tok.type === "Identifier" ? ctx.expectName().value : void 0;
        ctx.expect("Punctuation", ")");
        return name;
      });
    }
    catchBlock = parseBlock(ctx);
    skipWhitespace(ctx);
  }
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "finally") {
    ctx.consume();
    finallyBlock = parseBlock(ctx);
  }
  skipTerminator(ctx);
  const tryStmt = {
    kind: "TryStatement",
    block,
    catchParam,
    catchBlock,
    finallyBlock,
    loc: { line: start.line, column: start.column }
  };
  const last = finallyBlock ?? catchBlock ?? block;
  nodeEndLine.set(tryStmt, nodeEndLine.get(last) ?? last.loc?.line ?? start.line);
  return tryStmt;
}
function tryParseLambdaFromParenList(ctx) {
  const start = ctx.peek();
  if (start.type !== "Punctuation" || start.value !== "(") return null;
  ctx.consume();
  const params = ctx.withNewlines(true, () => parseLambdaParamList(ctx));
  if (params === null) return null;
  if (!(ctx.peek().type === "Operator" && ctx.peek().value === "=>")) {
    return null;
  }
  ctx.consume();
  const body = parseLambdaBody(ctx);
  return {
    kind: "Lambda",
    params,
    body,
    loc: { line: start.line, column: start.column }
  };
}
function parseLambdaParamList(ctx) {
  const params = [];
  skipWhitespace(ctx);
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    while (true) {
      skipWhitespace(ctx);
      let isRest = false;
      if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
        ctx.consume();
        isRest = true;
      }
      const tok = ctx.peek();
      if (!isRest && tok.type === "Punctuation" && (tok.value === "{" || tok.value === "[")) {
        let pattern;
        try {
          pattern = parseDestructuringPattern(ctx);
        } catch (err) {
          if (err && typeof err === "object" && err.__definitive) throw err;
          return null;
        }
        const param2 = { name: "", pattern };
        if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          try {
            param2.defaultValue = parseExpression(ctx);
          } catch {
            return null;
          }
        }
        params.push(param2);
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
          ctx.consume();
          if (isCloseParen(ctx.peek())) break;
          continue;
        }
        break;
      }
      if (tok.type !== "Identifier") return null;
      rejectUnsupportedWord(ctx, tok);
      ctx.consume();
      const param = { name: tok.value };
      if (isRest) param.rest = true;
      if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
        ctx.consume();
        try {
          param.defaultValue = parseExpression(ctx);
        } catch {
          return null;
        }
      }
      params.push(param);
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        if (isRest) return null;
        ctx.consume();
        if (isCloseParen(ctx.peek())) break;
        continue;
      }
      break;
    }
  }
  skipWhitespace(ctx);
  if (!isCloseParen(ctx.peek())) {
    return null;
  }
  ctx.consume();
  return params;
}
function isCloseParen(tok) {
  return tok.type === "Punctuation" && tok.value === ")";
}
function parseLambdaBody(ctx) {
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    return parseBlock(ctx);
  }
  return parseAssignmentLikeExpression(ctx);
}
function parseAssignmentLikeExpression(ctx) {
  const expression = parseExpression(ctx);
  const next = ctx.peek();
  if (next.type === "Operator") {
    if (isAssignmentOperator(next.value)) {
      ctx.consume();
      skipNewlinesBeforeOperand(ctx);
      const value = parseExpression(ctx);
      return {
        kind: "BuiltinCall",
        name: "__rui_assign__",
        arguments: [
          expression,
          value,
          { kind: "Literal", value: next.value }
        ],
        loc: { line: next.line, column: next.column }
      };
    }
    if (next.value === "++" || next.value === "--") {
      ctx.consume();
      return {
        kind: "BuiltinCall",
        name: "__rui_postfix__",
        arguments: [
          expression,
          { kind: "Literal", value: next.value }
        ],
        loc: { line: next.line, column: next.column }
      };
    }
  }
  return expression;
}
function parseObjectProps(ctx) {
  const props = [];
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") return props;
  while (true) {
    skipWhitespace(ctx);
    const keyTok = ctx.peek();
    if (keyTok.type === "Operator" && keyTok.value === "...") {
      ctx.consume();
      const value2 = parseExpression(ctx);
      props.push({ key: "", value: value2, spread: true });
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") break;
        continue;
      }
      break;
    }
    const unsupported = unsupportedMemberForm(ctx, keyTok);
    if (unsupported) throw unsupported;
    let key;
    let computedKey;
    if (keyTok.type === "Punctuation" && keyTok.value === "[") {
      ctx.consume();
      skipWhitespace(ctx);
      const keyStart = ctx.peek();
      computedKey = parseExpression(ctx);
      if (!computedKey.loc) computedKey.loc = { line: keyStart.line, column: keyStart.column };
      skipWhitespace(ctx);
      ctx.expect("Punctuation", "]");
      key = "";
    } else if (keyTok.type === "Number") {
      key = ctx.consume().value;
    } else if (keyTok.type === "Identifier" || keyTok.type === "String" || keyTok.type === "Keyword") {
      key = ctx.consume().value;
    } else {
      throw {
        message: unexpected(keyTok, `Expected object key, got ${keyTok.type} "${keyTok.value}"`),
        line: keyTok.line,
        column: keyTok.column
      };
    }
    const after = ctx.peek();
    let value;
    let method = false;
    if (!computedKey && keyTok.type === "Identifier" && after.type === "Punctuation" && (after.value === "," || after.value === "}")) {
      rejectUnsupportedWord(ctx, keyTok);
      value = { kind: "Identifier", name: key, loc: { line: keyTok.line, column: keyTok.column } };
    } else if (after.type === "Punctuation" && after.value === "(") {
      const params = parseFunctionParams(ctx);
      const body = parseBlock(ctx);
      value = { kind: "Lambda", params, body, loc: { line: keyTok.line, column: keyTok.column } };
      method = true;
    } else {
      ctx.expect("Punctuation", ":");
      value = parseExpression(ctx);
    }
    const prop = { key, value };
    if (computedKey) prop.computedKey = computedKey;
    if (method) prop.method = true;
    props.push(prop);
    skipWhitespace(ctx);
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") break;
      continue;
    }
    break;
  }
  skipWhitespace(ctx);
  return props;
}
function unsupportedMemberForm(ctx, keyTok) {
  const at = (message) => ({ message, line: keyTok.line, column: keyTok.column });
  if (keyTok.type === "Operator" && keyTok.value === "*") {
    return at("Generator methods (`*name() {}`) are not supported in Aktion — there are no generators.");
  }
  const next = ctx.peek(1);
  const startsKey = next.type === "Identifier" || next.type === "Keyword" || next.type === "String" || next.type === "Number" || next.type === "StateIdentifier" || next.type === "Punctuation" && next.value === "[";
  if (keyTok.type === "Identifier" && (keyTok.value === "get" || keyTok.value === "set") && startsKey) {
    return at("getters and setters are not supported — use a plain property or a function");
  }
  if (keyTok.type === "Keyword" && keyTok.value === "async" && (startsKey || next.type === "Operator" && next.value === "*")) {
    return at(`\`async\` methods are not supported in Aktion — ${ASYNC_REASON}`);
  }
  return null;
}
function skipNewlines(ctx) {
  while (ctx.match("Newline")) {
  }
}
function skipWhitespace(ctx) {
  while (ctx.match("Newline") || ctx.match("Semicolon")) {
  }
}
function attachComments(ctx, statements, containerStartLine, containerEndLineExclusive) {
  let lastTouchedLine = containerStartLine;
  let prevStmtEndLine = null;
  const inWindow = (c) => c.line < containerEndLineExclusive;
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i];
    const stmtStartLine = stmt.loc?.line ?? containerEndLineExclusive;
    const sharesLine = stmt.loc !== void 0 && stmtStartLine === prevStmtEndLine && (nodeEndLine.get(stmt) ?? stmtStartLine) === stmtStartLine;
    if (prevStmtEndLine !== null) {
      const trailing = [];
      while (true) {
        const c = ctx.peekComment(containerStartLine);
        if (!c || !inWindow(c) || c.line !== prevStmtEndLine) break;
        if (sharesLine && c.column > stmt.loc.column) break;
        ctx.takeComment(containerStartLine);
        trailing.push({ ...c });
        lastTouchedLine = c.endLine;
      }
      if (trailing.length > 0) statements[i - 1].trailingComments = trailing;
    }
    const leading = [];
    while (true) {
      const c = ctx.peekComment(containerStartLine);
      if (!c || !inWindow(c) || c.line >= stmtStartLine) break;
      ctx.takeComment(containerStartLine);
      leading.push({ ...c, blankLineBefore: c.line > lastTouchedLine + 1 });
      lastTouchedLine = c.endLine;
    }
    if (leading.length > 0) stmt.leadingComments = leading;
    prevStmtEndLine = nodeEndLine.get(stmt) ?? stmtStartLine;
    if (prevStmtEndLine > lastTouchedLine) lastTouchedLine = prevStmtEndLine;
  }
  if (prevStmtEndLine !== null) {
    const trailing = [];
    while (true) {
      const c = ctx.peekComment(containerStartLine);
      if (!c || !inWindow(c) || c.line !== prevStmtEndLine) break;
      ctx.takeComment(containerStartLine);
      trailing.push({ ...c });
    }
    if (trailing.length > 0) statements[statements.length - 1].trailingComments = trailing;
  }
  while (true) {
    const c = ctx.peekComment(containerStartLine);
    if (!c || !inWindow(c)) break;
    ctx.takeComment(containerStartLine);
  }
}
function collectDanglingComments(ctx, containerStartLine, containerEndLineExclusive) {
  let lastLine = containerStartLine;
  const out = [];
  while (true) {
    const c = ctx.peekComment(containerStartLine);
    if (!c || c.line >= containerEndLineExclusive) break;
    ctx.takeComment(containerStartLine);
    out.push({ ...c, blankLineBefore: c.line > lastLine + 1 });
    lastLine = c.endLine;
  }
  return out;
}
function skipTerminator(ctx) {
  if (!ctx.isEnd()) {
    ctx.match("Newline") || ctx.match("Semicolon");
  }
}
function numericLiteralValue(raw) {
  let s = raw.replace(/_/g, "");
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  return sign * Number(s);
}
const COMPILED_PROGRAM_VERSION = 1;
function defineCompiledProgram(compiled) {
  return compiled;
}
const components = [
  {
    name: "Accordion",
    slots: [
      "items",
      "showArrow",
      "type",
      "onChange"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange"
    }
  },
  {
    name: "AccordionItem",
    slots: [
      "title",
      "children",
      "open",
      "subtitle",
      "showArrow",
      "variant",
      "disabled",
      "onToggle"
    ],
    positional: 0,
    aliases: {
      child: "children",
      summary: "subtitle",
      tone: "variant",
      onOpenChange: "onToggle",
      ontoggle: "onToggle"
    }
  },
  {
    name: "ActionLink",
    slots: [
      "label",
      "onClick",
      "disabled",
      "icon",
      "iconPosition",
      "ariaLabel",
      "tone"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      variant: "tone"
    }
  },
  {
    name: "ActionStripe",
    slots: [
      "label",
      "description",
      "icon",
      "value",
      "href",
      "disabled",
      "onClick",
      "trailing",
      "target"
    ],
    positional: 0,
    aliases: {
      subtitle: "description",
      meta: "description",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "ActivityLog",
    slots: [
      "items",
      "variant",
      "emptyLabel",
      "onItemClick",
      "loading",
      "loaderLabel"
    ],
    positional: 0,
    aliases: {
      tone: "variant"
    }
  },
  {
    name: "AppShell",
    slots: [
      "sidebar",
      "content",
      "topbar",
      "collapsible",
      "sidebarOpen",
      "onSidebarOpenChange"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "AspectRatio",
    slots: [
      "ratio",
      "children"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Async",
    slots: [
      "resource",
      "loading",
      "error",
      "empty",
      "data",
      "retry"
    ],
    positional: 0,
    aliases: {
      onRetry: "retry"
    }
  },
  {
    name: "AudioPlayer",
    slots: [
      "src",
      "sources",
      "title",
      "artist",
      "controls",
      "autoplay",
      "loop",
      "icon",
      "muted",
      "onEnded"
    ],
    positional: 0,
    aliases: {
      onended: "onEnded"
    }
  },
  {
    name: "AuthorByline",
    slots: [
      "name",
      "avatar",
      "role",
      "date",
      "href",
      "readingTime"
    ],
    positional: 0,
    aliases: {
      src: "avatar"
    }
  },
  {
    name: "Avatar",
    slots: [
      "name",
      "src",
      "size",
      "status",
      "fallback"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "AvatarGroup",
    slots: [
      "items",
      "max",
      "size",
      "total",
      "fallback"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "BackToTop",
    slots: [
      "label",
      "showAfter",
      "position"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Backdrop",
    slots: [
      "grid",
      "blobs",
      "particles",
      "type",
      "particleColors",
      "speed",
      "linkDistance",
      "particleSize",
      "fixed"
    ],
    positional: 0,
    aliases: {
      particleType: "type",
      colors: "particleColors"
    }
  },
  {
    name: "Badge",
    slots: [
      "label",
      "tone",
      "icon",
      "size"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "BadgeList",
    slots: [
      "labels",
      "tone",
      "size",
      "tones",
      "icons",
      "max"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      variants: "tones"
    }
  },
  {
    name: "Banner",
    slots: [
      "title",
      "message",
      "action",
      "icon",
      "tone",
      "dismissible",
      "onDismiss",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      description: "message",
      variant: "tone",
      closable: "dismissible",
      onClose: "onDismiss",
      onclick: "onClick"
    }
  },
  {
    name: "BarChart",
    slots: [
      "labels",
      "series",
      "title",
      "stacked",
      "horizontal",
      "xAxisLabel",
      "yAxisLabel",
      "showLegend",
      "height",
      "loading",
      "emptyText",
      "onBarClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Bento",
    slots: [
      "items",
      "columns",
      "gap",
      "rowHeight",
      "dense"
    ],
    positional: 0,
    aliases: {
      children: "items",
      cells: "items"
    }
  },
  {
    name: "BentoCell",
    slots: [
      "child",
      "span",
      "rowSpan"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "BottomSheet",
    slots: [
      "children",
      "open",
      "title",
      "onClose",
      "label",
      "height",
      "showClose",
      "footer"
    ],
    positional: 0,
    aliases: {
      child: "children",
      content: "children",
      onclose: "onClose"
    }
  },
  {
    name: "Box",
    slots: [
      "children",
      "padding",
      "margin",
      "border",
      "background",
      "maxWidth",
      "radius"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Brand",
    slots: [
      "name",
      "logoSrc",
      "version",
      "href"
    ],
    positional: 0,
    aliases: {
      label: "name",
      logo: "logoSrc"
    }
  },
  {
    name: "Breadcrumb",
    slots: [
      "items",
      "separator",
      "maxItems",
      "onItemClick",
      "homeIcon",
      "autoLink"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "BreadcrumbItem",
    slots: [
      "label",
      "href",
      "icon",
      "to",
      "onClick"
    ],
    positional: 0,
    aliases: {
      onclick: "onClick"
    }
  },
  {
    name: "BrowserFrame",
    slots: [
      "child",
      "url",
      "height",
      "clip"
    ],
    positional: 0,
    aliases: {
      children: "child",
      content: "child"
    }
  },
  {
    name: "Button",
    slots: [
      "label",
      "onClick",
      "variant",
      "type",
      "size",
      "icon",
      "iconPosition",
      "iconOnly",
      "loading",
      "fullWidth",
      "disabled",
      "href"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      tone: "variant"
    }
  },
  {
    name: "ButtonGroup",
    slots: [
      "items",
      "size",
      "fullWidth",
      "ariaLabel",
      "ariaLabelledBy"
    ],
    positional: 0,
    aliases: {
      full: "fullWidth",
      label: "ariaLabel"
    }
  },
  {
    name: "Buttons",
    slots: [
      "items",
      "direction"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Calendar",
    slots: [
      "month",
      "year",
      "selected",
      "onSelect",
      "events",
      "firstDay",
      "navigable",
      "onNavigate",
      "minDate",
      "maxDate",
      "disabledDates",
      "onEventClick",
      "locale",
      "weekdayLabels",
      "monthLabels"
    ],
    positional: 0,
    aliases: {
      blackoutDates: "disabledDates"
    }
  },
  {
    name: "CalendarView",
    slots: [
      "value",
      "month",
      "events",
      "view",
      "firstDay",
      "onSelect",
      "onMonthChange",
      "onEventClick",
      "maxEventsPerDay",
      "min",
      "max",
      "disabledDates",
      "hideNav"
    ],
    positional: 0,
    aliases: {
      onNavigate: "onMonthChange"
    }
  },
  {
    name: "Callout",
    slots: [
      "tone",
      "title",
      "description",
      "icon",
      "compact",
      "actions",
      "hideIcon",
      "live",
      "dismissible",
      "onDismiss"
    ],
    positional: 1,
    aliases: {
      variant: "tone",
      text: "description",
      footer: "actions",
      noIcon: "hideIcon",
      closable: "dismissible",
      onClose: "onDismiss"
    }
  },
  {
    name: "Card",
    slots: [
      "children",
      "variant",
      "padding",
      "onClick",
      "href"
    ],
    positional: 0,
    aliases: {
      child: "children",
      tone: "variant",
      onclick: "onClick"
    }
  },
  {
    name: "CardFooter",
    slots: [
      "children",
      "justify"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "CardHeader",
    slots: [
      "title",
      "subtitle",
      "eyebrow",
      "actions",
      "level"
    ],
    positional: 0,
    aliases: {
      preheadline: "eyebrow",
      kicker: "eyebrow"
    }
  },
  {
    name: "CardSection",
    slots: [
      "children",
      "tone",
      "align"
    ],
    positional: 0,
    aliases: {
      child: "children",
      variant: "tone",
      status: "tone"
    }
  },
  {
    name: "Carousel",
    slots: [
      "items",
      "activeIndex",
      "ratio",
      "showDots",
      "showArrows",
      "onChange",
      "autoplay",
      "interval",
      "label",
      "empty",
      "emptyText"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange"
    }
  },
  {
    name: "Cart",
    slots: [
      "items",
      "onQty",
      "onRemove",
      "currency",
      "footer",
      "disabled",
      "loading",
      "error"
    ],
    positional: 0,
    aliases: {
      busy: "disabled"
    }
  },
  {
    name: "Center",
    slots: [
      "children",
      "axis",
      "minHeight",
      "gap",
      "padding",
      "inline"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ChatBubble",
    slots: [
      "author",
      "body",
      "time",
      "avatarSrc",
      "from",
      "status",
      "content",
      "onRetry"
    ],
    positional: 0,
    aliases: {
      text: "body",
      message: "body",
      src: "avatarSrc",
      role: "from",
      children: "content"
    }
  },
  {
    name: "CheckBoxGroup",
    slots: [
      "name",
      "items",
      "value",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "disabled",
      "labelHidden",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CheckBoxItem",
    slots: [
      "label",
      "name",
      "description",
      "defaultChecked",
      "disabled",
      "value"
    ],
    positional: 0,
    aliases: {
      checked: "defaultChecked"
    }
  },
  {
    name: "Checkbox",
    slots: [
      "id",
      "label",
      "value",
      "onChange",
      "disabled",
      "description",
      "required",
      "error",
      "hint",
      "indeterminate",
      "labelHidden",
      "warning",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      checked: "value",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CodeBlock",
    slots: [
      "language",
      "codeString",
      "showLineNumbers",
      "highlightLines",
      "highlight",
      "copy",
      "header",
      "width",
      "height",
      "filename",
      "wrap"
    ],
    positional: 1,
    aliases: {
      code: "codeString",
      title: "filename"
    }
  },
  {
    name: "CodeEditor",
    slots: [
      "id",
      "value",
      "language",
      "placeholder",
      "minHeight",
      "tabSize",
      "showGutter",
      "readonly",
      "onChange",
      "maxHeight",
      "filename",
      "copyable",
      "onSave",
      "name",
      "disabled",
      "label",
      "hint",
      "error",
      "required",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      helperText: "hint",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CodeWindow",
    slots: [
      "code",
      "file",
      "language",
      "status",
      "preview",
      "copy",
      "height",
      "maxHeight",
      "showLineNumbers",
      "highlightLines"
    ],
    positional: 0,
    aliases: {
      codeString: "code"
    }
  },
  {
    name: "Col",
    slots: [
      "header",
      "values",
      "format",
      "align",
      "sortable",
      "filterable",
      "render",
      "onClick",
      "currency",
      "width",
      "wrap",
      "headerTooltip",
      "locale",
      "initiallyHidden",
      "pinned",
      "resizable",
      "minWidth",
      "maxWidth",
      "headerHidden"
    ],
    positional: 0,
    aliases: {
      cell: "render",
      onclick: "onClick",
      cellClick: "onClick",
      hint: "headerTooltip",
      colHidden: "initiallyHidden"
    }
  },
  {
    name: "ColorPicker",
    slots: [
      "id",
      "value",
      "label",
      "swatches",
      "disabled",
      "onChange",
      "format",
      "allowAlpha",
      "showInput",
      "showSwatches",
      "name",
      "hint",
      "error",
      "required",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      helperText: "hint",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "Column",
    slots: [
      "children",
      "gap",
      "align",
      "justify",
      "wrap",
      "reverse",
      "padding",
      "inline",
      "alignContent"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Combobox",
    slots: [
      "id",
      "items",
      "value",
      "placeholder",
      "emptyLabel",
      "disabled",
      "open",
      "onOpenChange",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "loading",
      "onSearch",
      "clearable",
      "onBlur",
      "onFocus",
      "creatable",
      "labelHidden",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onopenchange: "onOpenChange",
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CommandPalette",
    slots: [
      "items",
      "open",
      "placeholder",
      "shortcut",
      "onSelect",
      "onClose",
      "loading",
      "emptyLabel",
      "label",
      "maxResults"
    ],
    positional: 0,
    aliases: {
      onOpenChange: "onClose"
    }
  },
  {
    name: "Comment",
    slots: [
      "author",
      "body",
      "time",
      "avatarSrc",
      "actions"
    ],
    positional: 0,
    aliases: {
      text: "body",
      message: "body",
      src: "avatarSrc"
    }
  },
  {
    name: "ComparisonTable",
    slots: [
      "columns",
      "rows",
      "highlightColumn",
      "featureLabel",
      "caption",
      "stickyFirstColumn",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      arialabel: "ariaLabel"
    }
  },
  {
    name: "Confetti",
    slots: [
      "fire",
      "count",
      "colors",
      "duration",
      "onDone"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ConfirmDialog",
    slots: [
      "title",
      "open",
      "message",
      "confirmLabel",
      "cancelLabel",
      "tone",
      "onConfirm",
      "onCancel",
      "loading",
      "confirmDisabled",
      "icon",
      "confirmFirst"
    ],
    positional: 0,
    aliases: {
      body: "message",
      variant: "tone"
    }
  },
  {
    name: "Container",
    slots: [
      "children",
      "size",
      "maxWidth",
      "padding"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ContextMenu",
    slots: [
      "target",
      "items",
      "label",
      "trigger",
      "disabled",
      "placement",
      "offset",
      "open",
      "onOpenChange"
    ],
    positional: 0,
    aliases: {
      side: "placement"
    }
  },
  {
    name: "CopyButton",
    slots: [
      "text",
      "label",
      "copiedLabel",
      "iconOnly"
    ],
    positional: 0,
    aliases: {
      value: "text",
      variant: "iconOnly"
    }
  },
  {
    name: "CountUp",
    slots: [
      "value",
      "suffix",
      "prefix",
      "duration",
      "decimals"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "CountdownTimer",
    slots: [
      "to",
      "endLabel",
      "onEnd",
      "units",
      "showDays"
    ],
    positional: 0,
    aliases: {
      target: "to",
      date: "to",
      onFinish: "onEnd",
      onComplete: "onEnd"
    }
  },
  {
    name: "Css",
    slots: [
      "child",
      "style",
      "class"
    ],
    positional: 0,
    aliases: {
      children: "child",
      className: "class",
      classes: "class"
    }
  },
  {
    name: "DataGrid",
    slots: [
      "columns",
      "rowIds",
      "caption",
      "sort",
      "selectedIds",
      "selectable",
      "page",
      "perPage",
      "emptyLabel",
      "onRowClick",
      "toolbar",
      "density",
      "striped",
      "stickyHeader",
      "stickyFirstColumn",
      "exportable",
      "exportFilename",
      "loading",
      "error",
      "loadingLabel",
      "maxHeight",
      "allowOverflow",
      "onSort",
      "onSelectionChange",
      "perPageOptions",
      "onPerPageChange",
      "persistKey",
      "resizable",
      "columnMenu",
      "globalSearch",
      "onGlobalSearch",
      "wrapCells",
      "rowNumbers",
      "highlightOnHover",
      "scrollArrows",
      "columnMenuOpen",
      "onColumnMenuOpenChange",
      "columnMenuButton",
      "columnMenuAnchor",
      "columnMenuTitle",
      "columnMenuDescription",
      "columnMenuResetLabel",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      rowAction: "onRowClick",
      oncolumnmenuopenchange: "onColumnMenuOpenChange",
      arialabel: "ariaLabel"
    }
  },
  {
    name: "DatePicker",
    slots: [
      "id",
      "value",
      "label",
      "min",
      "max",
      "placeholder",
      "disabled",
      "onChange",
      "hint",
      "error",
      "required",
      "onBlur",
      "onFocus",
      "locale",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "DateRangePicker",
    slots: [
      "id",
      "from",
      "to",
      "label",
      "min",
      "max",
      "disabled",
      "onChange",
      "hint",
      "error",
      "required",
      "onBlur",
      "onFocus",
      "locale",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "DateTimePicker",
    slots: [
      "id",
      "value",
      "min",
      "max",
      "step",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "DescriptionItem",
    slots: [
      "label",
      "value",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "DescriptionList",
    slots: [
      "items",
      "columns"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "DiffViewer",
    slots: [
      "left",
      "right",
      "mode",
      "leftTitle",
      "rightTitle",
      "lineNumbers",
      "contextLines",
      "maxHeight"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Display",
    slots: [
      "content",
      "size",
      "align",
      "balance",
      "weight"
    ],
    positional: 0,
    aliases: {
      children: "content",
      title: "content"
    }
  },
  {
    name: "Draggable",
    slots: [
      "child",
      "data",
      "type",
      "disabled",
      "ariaLabel",
      "onDragStart",
      "onDragEnd"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "Drawer",
    slots: [
      "title",
      "open",
      "children",
      "side",
      "footer",
      "onClose",
      "width",
      "closeOnBackdrop"
    ],
    positional: 0,
    aliases: {
      child: "children",
      onclose: "onClose",
      size: "width"
    }
  },
  {
    name: "DrawingCanvas",
    slots: [
      "width",
      "height",
      "color",
      "lineWidth",
      "background",
      "clearable",
      "value",
      "onChange",
      "onEnd",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      arialabel: "ariaLabel"
    }
  },
  {
    name: "DropZone",
    slots: [
      "child",
      "onDrop",
      "label",
      "accept",
      "disabled",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "DropdownMenu",
    slots: [
      "trigger",
      "items",
      "side",
      "align",
      "label",
      "open",
      "onOpenChange",
      "disabled"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "EmptyState",
    slots: [
      "title",
      "description",
      "icon",
      "illustration",
      "action",
      "actions"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ErrorBoundary",
    slots: [
      "fallback",
      "onError",
      "showDetails",
      "onRetry",
      "children"
    ],
    positional: 4,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ErrorState",
    slots: [
      "title",
      "description",
      "actions",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Eyebrow",
    slots: [
      "text"
    ],
    positional: 0,
    aliases: {
      label: "text",
      children: "text"
    }
  },
  {
    name: "FeatureGrid",
    slots: [
      "items",
      "columns"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "FeatureItem",
    slots: [
      "title",
      "description",
      "icon",
      "tone",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "FieldRepeater",
    slots: [
      "items",
      "fields",
      "onAdd",
      "onRemove",
      "addLabel",
      "onChange",
      "removeLabel",
      "min",
      "max"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "FieldSet",
    slots: [
      "legend",
      "children",
      "helper",
      "disabled",
      "error",
      "required"
    ],
    positional: 0,
    aliases: {
      title: "legend",
      label: "legend",
      child: "children",
      fields: "children",
      hint: "helper",
      description: "helper"
    }
  },
  {
    name: "FileUpload",
    slots: [
      "id",
      "label",
      "hint",
      "accept",
      "multiple",
      "onSelect",
      "icon",
      "disabled",
      "maxSize",
      "error",
      "progress",
      "onRemove"
    ],
    positional: 0,
    aliases: {
      action: "onSelect",
      onChange: "onSelect"
    }
  },
  {
    name: "FilterChips",
    slots: [
      "chips",
      "onRemove",
      "onClear",
      "clearLabel",
      "max",
      "disabled"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "FilterPill",
    slots: [
      "label",
      "active",
      "count",
      "icon",
      "disabled",
      "onToggle"
    ],
    positional: 0,
    aliases: {
      selected: "active",
      pressed: "active",
      onClick: "onToggle",
      action: "onToggle"
    }
  },
  {
    name: "FlipList",
    slots: [
      "children",
      "duration",
      "horizontal"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "FloatingActionButton",
    slots: [
      "icon",
      "label",
      "onClick",
      "position",
      "extended",
      "disabled"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "FocusTrap",
    slots: [
      "child",
      "active",
      "restoreFocus",
      "onEscape",
      "autoFocus"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "FollowUpBlock",
    slots: [
      "items",
      "title",
      "onSelect",
      "disabled",
      "layout"
    ],
    positional: 0,
    aliases: {
      columns: "layout"
    }
  },
  {
    name: "FollowUpItem",
    slots: [
      "label",
      "message"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Footer",
    slots: [
      "brand",
      "tagline",
      "columns",
      "legal",
      "social"
    ],
    positional: 0,
    aliases: {
      copyright: "legal"
    }
  },
  {
    name: "FooterColumn",
    slots: [
      "title",
      "links"
    ],
    positional: 0,
    aliases: {
      children: "links",
      items: "links"
    }
  },
  {
    name: "Form",
    slots: [
      "id",
      "buttons",
      "fields",
      "onSubmit",
      "error",
      "loading"
    ],
    positional: 0,
    aliases: {
      onsubmit: "onSubmit",
      submitting: "loading"
    }
  },
  {
    name: "FormControl",
    slots: [
      "label",
      "field",
      "hint",
      "error",
      "required",
      "for",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      control: "field",
      htmlFor: "for",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "FormSection",
    slots: [
      "label",
      "children",
      "helper",
      "level"
    ],
    positional: 0,
    aliases: {
      title: "label",
      child: "children",
      fields: "children",
      description: "helper"
    }
  },
  {
    name: "Fragment",
    slots: [
      "children"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Gallery",
    slots: [
      "items",
      "columns",
      "ratio",
      "onSelect",
      "fit",
      "label",
      "empty",
      "emptyText"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Gantt",
    slots: [
      "tasks",
      "startDate",
      "endDate",
      "axis",
      "ticks",
      "today",
      "onTaskClick"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Gauge",
    slots: [
      "value",
      "min",
      "max",
      "label",
      "tone",
      "size",
      "caption",
      "unit",
      "format",
      "thresholds",
      "showRange",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      suffix: "unit",
      alt: "ariaLabel"
    }
  },
  {
    name: "GradientText",
    slots: [
      "text",
      "gradient"
    ],
    positional: 0,
    aliases: {
      children: "text",
      label: "text"
    }
  },
  {
    name: "Grid",
    slots: [
      "children",
      "columns",
      "gap",
      "rowGap",
      "columnGap",
      "minChildWidth",
      "alignItems",
      "justifyItems",
      "dense"
    ],
    positional: 0,
    aliases: {
      child: "children",
      minItemWidth: "minChildWidth"
    }
  },
  {
    name: "GridItem",
    slots: [
      "child",
      "span",
      "offset",
      "spanAt",
      "rowSpan"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "HTMLTag",
    slots: [
      "tag",
      "attributes",
      "children"
    ],
    positional: 0,
    aliases: {
      attrs: "attributes",
      props: "attributes",
      child: "children"
    }
  },
  {
    name: "Heading",
    slots: [
      "content",
      "level",
      "size",
      "align"
    ],
    positional: 0,
    aliases: {
      children: "content",
      title: "content"
    }
  },
  {
    name: "Heatmap",
    slots: [
      "xLabels",
      "yLabels",
      "values",
      "title",
      "tone",
      "showValues",
      "min",
      "max",
      "valueFormat",
      "emptyText",
      "onCellClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      alt: "ariaLabel"
    }
  },
  {
    name: "Hero",
    slots: [
      "title",
      "subtitle",
      "primary",
      "secondary",
      "eyebrow",
      "highlights",
      "imageSrc",
      "caption",
      "height",
      "actions",
      "layout",
      "tone",
      "overlay",
      "align"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "Histogram",
    slots: [
      "values",
      "binCount",
      "bins",
      "title",
      "tone",
      "xLabel",
      "yLabel",
      "height",
      "emptyText",
      "loading",
      "onBinClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      alt: "ariaLabel"
    }
  },
  {
    name: "HoverCard",
    slots: [
      "trigger",
      "content",
      "side",
      "open",
      "align",
      "width",
      "openDelay",
      "closeDelay",
      "label",
      "onOpenChange"
    ],
    positional: 0,
    aliases: {
      children: "content",
      placement: "side",
      ariaLabel: "label"
    }
  },
  {
    name: "Icon",
    slots: [
      "name",
      "variant",
      "size",
      "color",
      "label",
      "title"
    ],
    positional: 0,
    aliases: {
      tone: "variant",
      ariaLabel: "label",
      alt: "label"
    }
  },
  {
    name: "IconButton",
    slots: [
      "icon",
      "label",
      "onClick",
      "variant",
      "size",
      "disabled",
      "active",
      "loading",
      "type",
      "href"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      tone: "variant",
      pressed: "active",
      selected: "active"
    }
  },
  {
    name: "Image",
    slots: [
      "src",
      "alt",
      "caption",
      "ratio",
      "fit",
      "fallback",
      "placeholder",
      "loading",
      "sizes",
      "srcset",
      "onClick"
    ],
    positional: 0,
    aliases: {
      srcSet: "srcset",
      onclick: "onClick",
      action: "onClick"
    }
  },
  {
    name: "InboxPanel",
    slots: [
      "items",
      "emptyLabel",
      "onMarkAllRead",
      "loading",
      "loadingLabel",
      "markAllLabel",
      "unreadLabel",
      "earlierLabel"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "InfiniteList",
    slots: [
      "items",
      "onLoadMore",
      "loading",
      "hasMore",
      "loaderLabel",
      "error",
      "onRetry",
      "emptyLabel",
      "rootMargin",
      "threshold",
      "retryLabel"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "InlineEdit",
    slots: [
      "value",
      "label",
      "onSave",
      "placeholder",
      "type",
      "onCancel",
      "disabled",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Input",
    slots: [
      "id",
      "placeholder",
      "type",
      "validations",
      "value",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "readOnly",
      "autocomplete",
      "maxLength"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      readonly: "readOnly",
      autoComplete: "autocomplete",
      maxlength: "maxLength"
    }
  },
  {
    name: "InputGroup",
    slots: [
      "field",
      "icon",
      "leading",
      "action",
      "suffix",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      prefix: "leading",
      trailing: "action",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "JsonTree",
    slots: [
      "data",
      "expanded",
      "expandedDepth",
      "maxHeight"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "KanbanBoard",
    slots: [
      "columns",
      "onCardMove",
      "draggable"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "KanbanCard",
    slots: [
      "title",
      "description",
      "tags",
      "assignee",
      "tone",
      "icon",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "KanbanColumn",
    slots: [
      "title",
      "items",
      "tone",
      "actions",
      "limit"
    ],
    positional: 0,
    aliases: {
      cards: "items",
      variant: "tone"
    }
  },
  {
    name: "Kbd",
    slots: [
      "keys",
      "size"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "KbdShortcut",
    slots: [
      "keys",
      "size",
      "separator"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Lazy",
    slots: [
      "loader",
      "fallback",
      "children",
      "error",
      "onError",
      "retry"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Lightbox",
    slots: [
      "items",
      "open",
      "index",
      "onClose",
      "showThumbnail"
    ],
    positional: 0,
    aliases: {
      onclose: "onClose"
    }
  },
  {
    name: "LineChart",
    slots: [
      "labels",
      "series",
      "data",
      "title",
      "filled",
      "stacked",
      "yMin",
      "yMax",
      "xAxisLabel",
      "yAxisLabel",
      "showLegend",
      "height",
      "loading",
      "emptyText",
      "onPointClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Link",
    slots: [
      "label",
      "to",
      "href",
      "external",
      "variant",
      "disabled",
      "onClick",
      "download"
    ],
    positional: 0,
    aliases: {
      child: "label",
      children: "label",
      tone: "variant",
      onclick: "onClick"
    }
  },
  {
    name: "List",
    slots: [
      "items",
      "ordered",
      "emptyLabel",
      "divided",
      "gap"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ListBlock",
    slots: [
      "items",
      "ordered",
      "marker",
      "start"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ListItem",
    slots: [
      "title",
      "description",
      "icon",
      "onClick",
      "href",
      "trailing",
      "active",
      "tone"
    ],
    positional: 0,
    aliases: {
      meta: "description",
      onclick: "onClick",
      action: "onClick",
      actions: "trailing",
      accessory: "trailing",
      selected: "active",
      variant: "tone"
    }
  },
  {
    name: "LiveCursor",
    slots: [
      "x",
      "y",
      "label",
      "color",
      "space",
      "smooth",
      "typing"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "LiveRegion",
    slots: [
      "text",
      "politeness",
      "visible"
    ],
    positional: 0,
    aliases: {
      children: "text"
    }
  },
  {
    name: "LoadingDots",
    slots: [
      "label",
      "size",
      "tone"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "LoadingState",
    slots: [
      "title",
      "description",
      "actions",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "LogoChip",
    slots: [
      "label",
      "icon",
      "imageSrc",
      "href"
    ],
    positional: 0,
    aliases: {
      logo: "imageSrc",
      image: "imageSrc",
      src: "imageSrc"
    }
  },
  {
    name: "LogoCloud",
    slots: [
      "items",
      "label"
    ],
    positional: 0,
    aliases: {
      children: "items",
      chips: "items"
    }
  },
  {
    name: "Lottie",
    slots: [
      "src",
      "data",
      "loop",
      "autoplay",
      "speed",
      "width",
      "height",
      "poster",
      "fallback",
      "label",
      "playing",
      "onComplete",
      "onError"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Map",
    slots: [
      "lat",
      "lng",
      "zoom",
      "markers",
      "height",
      "caption",
      "title"
    ],
    positional: 0,
    aliases: {
      locations: "markers"
    }
  },
  {
    name: "Markdown",
    slots: [
      "content",
      "linkTarget"
    ],
    positional: 0,
    aliases: {
      target: "linkTarget"
    }
  },
  {
    name: "MaskedInput",
    slots: [
      "id",
      "mask",
      "value",
      "placeholder",
      "unmasked",
      "inputMode",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      rawValue: "unmasked",
      inputmode: "inputMode",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "MasonryGrid",
    slots: [
      "items",
      "columns",
      "gap"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "MediaCard",
    slots: [
      "title",
      "imageSrc",
      "description",
      "tags",
      "meta",
      "actions",
      "badge",
      "orientation",
      "ratio",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      src: "imageSrc",
      image: "imageSrc",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "MentionInput",
    slots: [
      "id",
      "people",
      "value",
      "placeholder",
      "rows",
      "maxSuggestions",
      "mentionFormat",
      "loading",
      "onSearch",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "MenuItem",
    slots: [
      "label",
      "onClick",
      "icon",
      "shortcut",
      "variant",
      "disabled",
      "checked",
      "role",
      "keepOpen"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      tone: "variant"
    }
  },
  {
    name: "MenuLabel",
    slots: [
      "label"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "MenuSeparator",
    slots: [],
    positional: -1,
    aliases: {}
  },
  {
    name: "Metric",
    slots: [
      "value",
      "label",
      "gradient",
      "countUp",
      "duration",
      "trend"
    ],
    positional: 0,
    aliases: {
      delta: "trend",
      change: "trend"
    }
  },
  {
    name: "MetricStrip",
    slots: [
      "items",
      "columns"
    ],
    positional: 0,
    aliases: {
      children: "items",
      metrics: "items"
    }
  },
  {
    name: "Modal",
    slots: [
      "title",
      "open",
      "children",
      "size",
      "footer",
      "closable",
      "closeOnBackdrop",
      "onClose",
      "onRequestClose",
      "lazy"
    ],
    positional: 0,
    aliases: {
      child: "children",
      onclose: "onClose"
    }
  },
  {
    name: "Mount",
    slots: [
      "setup",
      "update",
      "cleanup",
      "props",
      "tag",
      "deps",
      "onError"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "MultiSelect",
    slots: [
      "id",
      "items",
      "value",
      "placeholder",
      "emptyLabel",
      "max",
      "disabled",
      "open",
      "onOpenChange",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "min",
      "onSearch",
      "loading",
      "creatable",
      "labelHidden",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onopenchange: "onOpenChange",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "MultiStepForm",
    slots: [
      "steps",
      "current",
      "onSubmit",
      "prevLabel",
      "nextLabel",
      "submitLabel",
      "stepsLayout",
      "nextDisabled",
      "submitting",
      "onStepChange",
      "onStepClick",
      "clickableSteps",
      "showProgress",
      "hideFooter",
      "emptyText"
    ],
    positional: 0,
    aliases: {
      layout: "stepsLayout",
      stepsDirection: "stepsLayout"
    }
  },
  {
    name: "NavBar",
    slots: [
      "brand",
      "links",
      "actions",
      "sticky",
      "blur"
    ],
    positional: 0,
    aliases: {
      items: "links"
    }
  },
  {
    name: "NavLink",
    slots: [
      "label",
      "to",
      "variant",
      "exact",
      "icon",
      "prefetch",
      "disabled"
    ],
    positional: 0,
    aliases: {
      tone: "variant"
    }
  },
  {
    name: "Navbar",
    slots: [
      "brand",
      "items",
      "actions",
      "sticky",
      "variant",
      "collapsible"
    ],
    positional: 0,
    aliases: {
      links: "items",
      tone: "variant"
    }
  },
  {
    name: "NavbarItem",
    slots: [
      "label",
      "to",
      "href",
      "icon",
      "active",
      "onClick",
      "external",
      "disabled"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "Notification",
    slots: [
      "title",
      "message",
      "time",
      "icon",
      "avatarSrc",
      "tone",
      "unread",
      "actions",
      "author",
      "onClick",
      "dismissible",
      "onDismiss"
    ],
    positional: 0,
    aliases: {
      description: "message",
      src: "avatarSrc",
      variant: "tone",
      actor: "author",
      action: "onClick",
      onclick: "onClick",
      closable: "dismissible",
      onClose: "onDismiss"
    }
  },
  {
    name: "NotificationBell",
    slots: [
      "count",
      "items",
      "onOpen",
      "onItemClick",
      "onMarkAllRead",
      "align",
      "loading",
      "emptyLabel",
      "label",
      "markAllLabel",
      "maxCount"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "NumberInput",
    slots: [
      "id",
      "value",
      "min",
      "max",
      "step",
      "placeholder",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "prefix",
      "suffix",
      "precision",
      "readOnly",
      "onLimit"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      readonly: "readOnly"
    }
  },
  {
    name: "OnClick",
    slots: [
      "child",
      "onClick",
      "disabled",
      "stopPropagation",
      "role",
      "keyboard"
    ],
    positional: 0,
    aliases: {
      children: "child",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "OnFocus",
    slots: [
      "child",
      "onFocus",
      "onBlur"
    ],
    positional: 0,
    aliases: {
      children: "child",
      onfocus: "onFocus",
      onblur: "onBlur"
    }
  },
  {
    name: "OnGesture",
    slots: [
      "child",
      "swipe",
      "longPress",
      "doubleTap",
      "pan",
      "onPanEnd",
      "threshold",
      "disabled",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      children: "child",
      onSwipe: "swipe",
      onLongPress: "longPress",
      onDoubleTap: "doubleTap",
      onPan: "pan",
      panEnd: "onPanEnd",
      onRelease: "onPanEnd"
    }
  },
  {
    name: "OnIntersect",
    slots: [
      "child",
      "onEnter",
      "onLeave",
      "onChange",
      "threshold",
      "rootMargin",
      "root",
      "once",
      "disabled"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "OnKeyboard",
    slots: [
      "child",
      "onKeyDown",
      "onKeyUp",
      "onKeyPress",
      "focusable",
      "global"
    ],
    positional: 0,
    aliases: {
      children: "child",
      onkeydown: "onKeyDown",
      onkeyup: "onKeyUp",
      onkeypress: "onKeyPress"
    }
  },
  {
    name: "OnMount",
    slots: [
      "child",
      "onMount",
      "onUnmount",
      "deps"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "OnMouse",
    slots: [
      "child",
      "enter",
      "leave",
      "hover",
      "move",
      "down",
      "up",
      "click",
      "doubleClick",
      "contextMenu",
      "scroll",
      "wheel",
      "pointerDown",
      "pointerMove",
      "pointerUp",
      "drag",
      "drop",
      "dragStart",
      "dragEnd",
      "dragEnter",
      "dragLeave",
      "dragOver",
      "draggable",
      "passiveScroll"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "OnboardingChecklist",
    slots: [
      "items",
      "title",
      "subtitle",
      "onDismiss",
      "onComplete"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "OrderSummary",
    slots: [
      "items",
      "subtotal",
      "shipping",
      "tax",
      "total",
      "currency",
      "discount",
      "locale",
      "loading",
      "note",
      "empty"
    ],
    positional: 0,
    aliases: {
      lines: "items"
    }
  },
  {
    name: "Overlay",
    slots: [
      "base",
      "items"
    ],
    positional: 0,
    aliases: {
      overlays: "items"
    }
  },
  {
    name: "OverlayItem",
    slots: [
      "child",
      "anchor",
      "offset"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "PageHeader",
    slots: [
      "title",
      "subtitle",
      "breadcrumbs",
      "actions",
      "status",
      "onCrumbClick"
    ],
    positional: 0,
    aliases: {
      badge: "status"
    }
  },
  {
    name: "Pagination",
    slots: [
      "page",
      "totalPages",
      "siblings",
      "total",
      "perPage",
      "perPageOptions",
      "compact",
      "onChange",
      "disabled",
      "onPerPageChange"
    ],
    positional: 0,
    aliases: {
      pages: "totalPages",
      onPageChange: "onChange"
    }
  },
  {
    name: "Parallax",
    slots: [
      "child",
      "speed",
      "maxOffset"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "PasswordInput",
    slots: [
      "id",
      "value",
      "placeholder",
      "strengthMeter",
      "autocomplete",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      showStrength: "strengthMeter",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "PersonChip",
    slots: [
      "name",
      "role",
      "avatarSrc",
      "size",
      "status",
      "onClick"
    ],
    positional: 0,
    aliases: {
      src: "avatarSrc",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "PieChart",
    slots: [
      "labels",
      "values",
      "title",
      "showValues",
      "valueFormat",
      "donut",
      "innerRadius",
      "size",
      "showLegend",
      "legendPosition",
      "loading",
      "emptyText",
      "onSliceClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Pill",
    slots: [
      "label",
      "tone",
      "icon"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      status: "tone"
    }
  },
  {
    name: "PinInput",
    slots: [
      "id",
      "length",
      "value",
      "type",
      "mask",
      "autoFocus",
      "onChange",
      "onComplete",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      autofocus: "autoFocus",
      onchange: "onChange",
      oncomplete: "onComplete",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Popover",
    slots: [
      "trigger",
      "content",
      "title",
      "side",
      "align",
      "width",
      "open",
      "onOpenChange",
      "showClose",
      "disabled"
    ],
    positional: 0,
    aliases: {
      children: "content",
      placement: "side"
    }
  },
  {
    name: "Portal",
    slots: [
      "target",
      "children"
    ],
    positional: 1,
    aliases: {
      child: "children"
    }
  },
  {
    name: "PresenceAvatars",
    slots: [
      "people",
      "max",
      "size",
      "onClick"
    ],
    positional: 0,
    aliases: {
      users: "people",
      children: "people",
      onPersonClick: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "PriceTag",
    slots: [
      "price",
      "compareAt",
      "currency",
      "size",
      "currencyPosition",
      "period"
    ],
    positional: 0,
    aliases: {
      was: "compareAt",
      original: "compareAt",
      suffix: "period",
      per: "period"
    }
  },
  {
    name: "PricingCard",
    slots: [
      "plan",
      "price",
      "period",
      "description",
      "features",
      "action",
      "badge",
      "featured",
      "ribbon"
    ],
    positional: 0,
    aliases: {
      cta: "action",
      highlighted: "featured",
      badgeLabel: "ribbon"
    }
  },
  {
    name: "PricingTable",
    slots: [
      "tiers",
      "columns"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ProductCard",
    slots: [
      "title",
      "image",
      "price",
      "compareAt",
      "currency",
      "rating",
      "badge",
      "action",
      "onAdd",
      "href",
      "onClick",
      "reviewCount",
      "soldOut"
    ],
    positional: 0,
    aliases: {
      src: "image",
      onSelect: "onClick",
      onclick: "onClick",
      reviews: "reviewCount",
      disabled: "soldOut"
    }
  },
  {
    name: "ProfileCard",
    slots: [
      "name",
      "role",
      "avatarSrc",
      "bio",
      "tags",
      "actions"
    ],
    positional: 0,
    aliases: {
      src: "avatarSrc"
    }
  },
  {
    name: "Progress",
    slots: [
      "value",
      "max",
      "label",
      "tone",
      "indeterminate",
      "showValue",
      "segments",
      "buffered"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "ProgressRing",
    slots: [
      "value",
      "max",
      "label",
      "caption",
      "tone",
      "size",
      "indeterminate",
      "icon"
    ],
    positional: 0,
    aliases: {
      description: "caption",
      variant: "tone"
    }
  },
  {
    name: "Prose",
    slots: [
      "children",
      "size"
    ],
    positional: 0,
    aliases: {
      child: "children",
      content: "children"
    }
  },
  {
    name: "QRCode",
    slots: [
      "data",
      "size",
      "ecc",
      "color",
      "background",
      "margin",
      "label"
    ],
    positional: 0,
    aliases: {
      value: "data",
      text: "data",
      alt: "label"
    }
  },
  {
    name: "QuantityStepper",
    slots: [
      "value",
      "min",
      "max",
      "step",
      "onChange",
      "disabled",
      "label",
      "size"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaLabel: "label"
    }
  },
  {
    name: "QueryBuilder",
    slots: [
      "fields",
      "value",
      "onChange",
      "operators",
      "disabled",
      "maxRules"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Quote",
    slots: [
      "text",
      "cite",
      "tone"
    ],
    positional: 0,
    aliases: {
      attribution: "cite",
      author: "cite",
      variant: "tone"
    }
  },
  {
    name: "RadarChart",
    slots: [
      "axes",
      "series",
      "max",
      "title",
      "size",
      "showDots",
      "showValues",
      "emptyText",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Radio",
    slots: [
      "id",
      "items",
      "value",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "disabled",
      "direction",
      "labelHidden",
      "slots",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "Rating",
    slots: [
      "value",
      "max",
      "label",
      "count",
      "size",
      "interactive",
      "readonly",
      "halfStep",
      "icon",
      "onChange",
      "allowClear",
      "tone"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      variant: "tone",
      color: "tone"
    }
  },
  {
    name: "ReactionPicker",
    slots: [
      "reactions",
      "onReact",
      "disabled"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ReadingProgress",
    slots: [
      "gradient",
      "height",
      "target",
      "color"
    ],
    positional: 0,
    aliases: {
      scrollContainer: "target"
    }
  },
  {
    name: "Redirect",
    slots: [
      "path",
      "replace"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "RelativeTime",
    slots: [
      "value"
    ],
    positional: 0,
    aliases: {
      date: "value",
      time: "value"
    }
  },
  {
    name: "RequirementList",
    slots: [
      "items",
      "title",
      "pending",
      "announce",
      "announceText",
      "metLabel",
      "unmetLabel"
    ],
    positional: 0,
    aliases: {
      rules: "items",
      requirements: "items"
    }
  },
  {
    name: "ResizablePanels",
    slots: [
      "primary",
      "secondary",
      "initialPrimaryWidth",
      "minPrimaryWidth",
      "minSecondaryWidth",
      "onResize"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Reveal",
    slots: [
      "child",
      "animation",
      "delay",
      "duration",
      "threshold",
      "once"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "RichTextEditor",
    slots: [
      "id",
      "value",
      "placeholder",
      "minHeight",
      "disabled",
      "onChange",
      "tools",
      "maxHeight",
      "readonly",
      "name",
      "label",
      "hint",
      "error",
      "required",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      helperText: "hint",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "RouteView",
    slots: [
      "children",
      "routeKey",
      "animation",
      "duration",
      "scrollToTop",
      "announce"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Row",
    slots: [
      "children",
      "gap",
      "align",
      "justify",
      "grow",
      "wrap",
      "reverse",
      "padding",
      "inline",
      "alignContent"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ScatterChart",
    slots: [
      "series",
      "xLabel",
      "yLabel",
      "title",
      "pointSize",
      "pointOpacity",
      "xMin",
      "xMax",
      "yMin",
      "yMax",
      "height",
      "showLegend",
      "emptyText",
      "onPointClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "ScrollArea",
    slots: [
      "children",
      "maxHeight",
      "direction",
      "height",
      "stickToBottom"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ScrollSpy",
    slots: [
      "sections",
      "title",
      "offset",
      "top",
      "onChange"
    ],
    positional: 0,
    aliases: {
      items: "sections",
      onchange: "onChange"
    }
  },
  {
    name: "SearchBar",
    slots: [
      "id",
      "placeholder",
      "value",
      "shortcut",
      "onSubmit",
      "submitLabel",
      "onChange",
      "clearable",
      "onClear",
      "disabled",
      "loading",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      action: "onSubmit",
      onClick: "onSubmit",
      onchange: "onChange"
    }
  },
  {
    name: "Section",
    slots: [
      "children",
      "background",
      "width",
      "padding",
      "align",
      "eyebrow",
      "title",
      "subtitle",
      "id",
      "actions"
    ],
    positional: 0,
    aliases: {
      child: "children",
      bg: "background",
      description: "subtitle"
    }
  },
  {
    name: "SectionBlock",
    slots: [
      "title",
      "children",
      "description",
      "actions",
      "level",
      "icon"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "SectionHeader",
    slots: [
      "title",
      "subtitle",
      "eyebrow",
      "status",
      "actions"
    ],
    positional: 0,
    aliases: {
      description: "subtitle",
      badge: "status"
    }
  },
  {
    name: "SegmentedControl",
    slots: [
      "options",
      "value",
      "onChange",
      "disabled",
      "size",
      "label"
    ],
    positional: 0,
    aliases: {
      items: "options",
      onchange: "onChange",
      ariaLabel: "label"
    }
  },
  {
    name: "Select",
    slots: [
      "id",
      "items",
      "label",
      "placeholder",
      "value",
      "searchable",
      "onChange",
      "hint",
      "error",
      "required",
      "disabled",
      "onBlur",
      "onFocus",
      "loading",
      "onSearch",
      "labelHidden",
      "emptyLabel",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "SelectItem",
    slots: [
      "value",
      "label",
      "disabled",
      "group"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Separator",
    slots: [
      "orientation",
      "label",
      "decorative"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Series",
    slots: [
      "name",
      "values",
      "color",
      "points"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ShareButtons",
    slots: [
      "url",
      "title",
      "networks",
      "showLabels"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Sheet",
    slots: [
      "children",
      "open",
      "side",
      "title",
      "onClose",
      "label",
      "width",
      "footer",
      "dismissible"
    ],
    positional: 0,
    aliases: {
      child: "children",
      content: "children",
      onclose: "onClose"
    }
  },
  {
    name: "Show",
    slots: [
      "when",
      "children",
      "fallback"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Sidebar",
    slots: [
      "items",
      "brand",
      "tagline",
      "footer",
      "collapsed",
      "fullHeight",
      "label"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "SidebarItem",
    slots: [
      "label",
      "icon",
      "active",
      "badge",
      "to",
      "onClick",
      "href",
      "disabled"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "SidebarSection",
    slots: [
      "label",
      "items"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "SignaturePad",
    slots: [
      "width",
      "height",
      "color",
      "lineWidth",
      "background",
      "clearable",
      "value",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      arialabel: "ariaLabel"
    }
  },
  {
    name: "Skeleton",
    slots: [
      "variant",
      "lines",
      "height",
      "shape",
      "width",
      "label",
      "live"
    ],
    positional: 0,
    aliases: {
      tone: "variant",
      count: "lines",
      columns: "lines"
    }
  },
  {
    name: "SkipLink",
    slots: [
      "to",
      "label"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Slider",
    slots: [
      "id",
      "min",
      "max",
      "step",
      "value",
      "label",
      "showValue",
      "disabled",
      "onChange",
      "suffix",
      "format",
      "hint",
      "error",
      "marks",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "Sortable",
    slots: [
      "items",
      "onReorder",
      "handle",
      "horizontal",
      "disabled",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      children: "items"
    }
  },
  {
    name: "Spacer",
    slots: [
      "size",
      "flex"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Sparkline",
    slots: [
      "values",
      "tone",
      "width",
      "height",
      "min",
      "max",
      "label"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      ariaLabel: "label"
    }
  },
  {
    name: "SpeedDial",
    slots: [
      "actions",
      "icon",
      "open",
      "onOpenChange",
      "position",
      "label"
    ],
    positional: 0,
    aliases: {
      items: "actions"
    }
  },
  {
    name: "Spinner",
    slots: [
      "size",
      "label",
      "tone"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "Split",
    slots: [
      "left",
      "right",
      "ratio",
      "gap",
      "divider",
      "sticky",
      "stickyOffset",
      "stackAt",
      "reverseOnStack",
      "align"
    ],
    positional: 0,
    aliases: {
      primary: "left",
      secondary: "right"
    }
  },
  {
    name: "SplitView",
    slots: [
      "primary",
      "detail",
      "primaryWidth",
      "showDetail"
    ],
    positional: 0,
    aliases: {
      secondary: "detail",
      splitAt: "primaryWidth"
    }
  },
  {
    name: "Spotlight",
    slots: [
      "title",
      "open",
      "description",
      "actions",
      "onClose",
      "target"
    ],
    positional: 0,
    aliases: {
      action: "actions",
      onclose: "onClose"
    }
  },
  {
    name: "Stack",
    slots: [
      "children",
      "direction",
      "gap",
      "align",
      "justify",
      "alignContent",
      "wrap",
      "reverse",
      "uniform",
      "inline",
      "padding"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "StackItem",
    slots: [
      "child",
      "grow",
      "shrink",
      "basis",
      "alignSelf",
      "order",
      "minWidth",
      "maxWidth"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "StatCard",
    slots: [
      "label",
      "value",
      "trend",
      "delta",
      "icon",
      "spark",
      "tone",
      "hint",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      description: "hint",
      onclick: "onClick",
      action: "onClick"
    }
  },
  {
    name: "Stats",
    slots: [
      "items",
      "layout",
      "columns",
      "align"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "StatusDot",
    slots: [
      "label",
      "tone",
      "pulse"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "Steps",
    slots: [
      "items",
      "orientation"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Sticky",
    slots: [
      "children",
      "side",
      "offset",
      "zIndex"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Styles",
    slots: [
      "css",
      "scope",
      "tokens"
    ],
    positional: 0,
    aliases: {
      content: "css",
      rules: "css"
    }
  },
  {
    name: "SuccessState",
    slots: [
      "title",
      "description",
      "actions",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Svg",
    slots: [
      "content",
      "viewBox",
      "width",
      "height",
      "fill",
      "stroke",
      "strokeWidth",
      "preserveAspectRatio",
      "label"
    ],
    positional: 0,
    aliases: {
      paths: "content",
      markup: "content",
      "stroke-width": "strokeWidth"
    }
  },
  {
    name: "Swatch",
    slots: [
      "name",
      "background",
      "foreground",
      "colors",
      "onClick",
      "selected"
    ],
    positional: 0,
    aliases: {
      onSelect: "onClick",
      onclick: "onClick",
      active: "selected"
    }
  },
  {
    name: "Switch",
    slots: [
      "id",
      "label",
      "value",
      "description",
      "disabled",
      "onChange",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      checked: "value",
      onchange: "onChange"
    }
  },
  {
    name: "TabBar",
    slots: [
      "items",
      "active",
      "onChange",
      "pinned"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "TabItem",
    slots: [
      "value",
      "label",
      "children",
      "badge",
      "icon",
      "disabled"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Table",
    slots: [
      "columns",
      "caption",
      "density",
      "striped",
      "sticky",
      "emptyLabel",
      "loading",
      "loadingRows",
      "maxHeight",
      "onRowClick",
      "allowOverflow",
      "ariaLabel",
      "locale"
    ],
    positional: 0,
    aliases: {
      title: "caption",
      rowAction: "onRowClick",
      overflow: "allowOverflow"
    }
  },
  {
    name: "TableOfContents",
    slots: [
      "items",
      "title",
      "activeHref",
      "onSelect"
    ],
    positional: 0,
    aliases: {
      children: "items",
      active: "activeHref",
      onChange: "onSelect"
    }
  },
  {
    name: "Tabs",
    slots: [
      "items",
      "defaultValue",
      "orientation",
      "onChange",
      "value",
      "fitted"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange"
    }
  },
  {
    name: "TagInput",
    slots: [
      "id",
      "value",
      "placeholder",
      "max",
      "suggestions",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Terminal",
    slots: [
      "lines",
      "file",
      "prompt",
      "height",
      "maxHeight"
    ],
    positional: 0,
    aliases: {
      children: "lines",
      content: "lines"
    }
  },
  {
    name: "Testimonial",
    slots: [
      "quote",
      "author",
      "role",
      "avatarSrc",
      "rating"
    ],
    positional: 0,
    aliases: {
      name: "author",
      src: "avatarSrc"
    }
  },
  {
    name: "Text",
    slots: [
      "value",
      "variant",
      "tone",
      "align",
      "style",
      "as",
      "truncate",
      "lines"
    ],
    positional: 0,
    aliases: {
      tag: "as",
      clamp: "lines"
    }
  },
  {
    name: "TextArea",
    slots: [
      "id",
      "placeholder",
      "rows",
      "value",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "maxLength",
      "readOnly",
      "autoResize"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      maxlength: "maxLength",
      readonly: "readOnly"
    }
  },
  {
    name: "TextContent",
    slots: [
      "value",
      "variant",
      "tone",
      "align",
      "style",
      "as",
      "truncate",
      "lines"
    ],
    positional: 0,
    aliases: {
      tag: "as",
      clamp: "lines"
    }
  },
  {
    name: "ThemeToggle",
    slots: [
      "light",
      "dark"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Tile",
    slots: [
      "label",
      "icon",
      "value",
      "description",
      "tone",
      "onClick",
      "href",
      "selected",
      "iconPosition"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick",
      active: "selected"
    }
  },
  {
    name: "TimePicker",
    slots: [
      "id",
      "value",
      "min",
      "max",
      "step",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Timeline",
    slots: [
      "items"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "TimelineItem",
    slots: [
      "title",
      "time",
      "description",
      "icon",
      "tone",
      "content",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "Toast",
    slots: [
      "title",
      "message",
      "tone",
      "icon",
      "duration",
      "action",
      "onClose",
      "position",
      "pauseOnHover"
    ],
    positional: 0,
    aliases: {
      description: "message",
      variant: "tone"
    }
  },
  {
    name: "Toasts",
    slots: [
      "children",
      "position",
      "max"
    ],
    positional: 0,
    aliases: {
      child: "children",
      limit: "max"
    }
  },
  {
    name: "ToggleGroup",
    slots: [
      "id",
      "items",
      "value",
      "variant",
      "size",
      "onChange",
      "multiple",
      "type",
      "disabled",
      "label"
    ],
    positional: 0,
    aliases: {
      tone: "variant",
      onchange: "onChange",
      ariaLabel: "label"
    }
  },
  {
    name: "Toolbar",
    slots: [
      "left",
      "right",
      "center",
      "searchable",
      "searchPlaceholder",
      "searchValue",
      "onSearch",
      "searchId"
    ],
    positional: 0,
    aliases: {
      onSearchChange: "onSearch",
      onChange: "onSearch"
    }
  },
  {
    name: "Tooltip",
    slots: [
      "label",
      "trigger",
      "side",
      "delay",
      "open",
      "align",
      "onOpenChange"
    ],
    positional: 0,
    aliases: {
      children: "trigger",
      placement: "side",
      delayDuration: "delay",
      enterDelay: "delay"
    }
  },
  {
    name: "TopBar",
    slots: [
      "title",
      "subtitle",
      "left",
      "center",
      "right",
      "sticky"
    ],
    positional: 0,
    aliases: {
      badges: "left",
      search: "center",
      actions: "right"
    }
  },
  {
    name: "Tour",
    slots: [
      "steps",
      "current",
      "open",
      "onOpenChange",
      "onComplete",
      "onSkip",
      "skipLabel",
      "backLabel",
      "nextLabel",
      "finishLabel"
    ],
    positional: 0,
    aliases: {
      onopenchange: "onOpenChange"
    }
  },
  {
    name: "Transition",
    slots: [
      "child",
      "show",
      "preset",
      "duration",
      "onExited"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "Tree",
    slots: [
      "items",
      "selectedId",
      "onSelect",
      "expandedIds",
      "ariaLabel",
      "emptyLabel",
      "checkable",
      "checkedIds",
      "onCheck"
    ],
    positional: 0,
    aliases: {
      selected: "selectedId",
      value: "selectedId",
      checkedKeys: "checkedIds"
    }
  },
  {
    name: "TreeNode",
    slots: [
      "label",
      "children",
      "icon",
      "expanded",
      "active",
      "badge",
      "onClick",
      "href",
      "disabled",
      "onToggle",
      "nodeId",
      "hasChildren"
    ],
    positional: 0,
    aliases: {
      child: "children",
      selected: "active",
      action: "onClick",
      onclick: "onClick",
      value: "nodeId",
      lazy: "hasChildren"
    }
  },
  {
    name: "Truncate",
    slots: [
      "text",
      "maxLines",
      "expandLabel",
      "collapseLabel",
      "expanded",
      "onToggle",
      "child"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "TypingIndicator",
    slots: [
      "name"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ValidationSummary",
    slots: [
      "errors",
      "title",
      "tone",
      "count",
      "onErrorClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "VariantSelector",
    slots: [
      "options",
      "value",
      "kind",
      "label",
      "onChange",
      "disabled",
      "multiple",
      "size"
    ],
    positional: 0,
    aliases: {
      items: "options",
      onchange: "onChange"
    }
  },
  {
    name: "VideoPlayer",
    slots: [
      "src",
      "sources",
      "poster",
      "caption",
      "controls",
      "autoplay",
      "loop",
      "muted",
      "ratio",
      "tracks",
      "onEnded",
      "fallback",
      "onError"
    ],
    positional: 0,
    aliases: {
      onended: "onEnded",
      onerror: "onError"
    }
  },
  {
    name: "VirtualGrid",
    slots: [
      "items",
      "columns",
      "itemHeight",
      "gap",
      "height",
      "minItemWidth",
      "onItemClick",
      "empty",
      "loading"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "VirtualList",
    slots: [
      "items",
      "itemHeight",
      "renderItem",
      "height",
      "onItemClick",
      "empty",
      "loading"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "VisuallyHidden",
    slots: [
      "children"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "WebComponent",
    slots: [
      "tag",
      "attributes",
      "properties",
      "on",
      "children"
    ],
    positional: 0,
    aliases: {
      attrs: "attributes",
      props: "properties",
      events: "on",
      child: "children"
    }
  }
];
const hooks = [
  "id",
  "memo",
  "reducer",
  "ref",
  "state"
];
const factories = [
  "form",
  "http",
  "mutation",
  "query",
  "script",
  "socket",
  "sse",
  "store"
];
const namespaces = [
  "console",
  "dom",
  "i18n",
  "storage",
  "toast",
  "util"
];
const builtins = [
  "app",
  "effect",
  "emit",
  "head",
  "optimistic",
  "router",
  "theme"
];
const manifest = {
  components,
  hooks,
  factories,
  namespaces,
  builtins
};
const DSL_MODULE_ID = "aktion-runtime/dsl";
const AKTION_MODULE_SUFFIXES = [".aktion.ts", ".aktion.js", ".aktion"];
const RESERVED_AKTION_SUFFIXES = [".aktion.tsx", ".aktion.jsx"];
const NATIVE_MODULE_RE = /\.(?:[cm]?[jt]sx?|json|css|wasm)$/i;
function stripQuery(id) {
  const q = id.indexOf("?");
  const base = q === -1 ? id : id.slice(0, q);
  const h = base.indexOf("#");
  return h === -1 ? base : base.slice(0, h);
}
function isReservedAktionPath(path) {
  const clean = stripQuery(path).toLowerCase();
  return RESERVED_AKTION_SUFFIXES.some((suffix) => clean.endsWith(suffix));
}
function moduleLanguage(path) {
  const clean = stripQuery(path).toLowerCase();
  if (clean.endsWith(".aktion.ts")) return "typescript";
  if (clean.endsWith(".aktion.js")) return "javascript";
  if (clean.endsWith(".aktion")) return "aktion";
  if (isReservedAktionPath(clean)) return null;
  if (NATIVE_MODULE_RE.test(clean)) return null;
  return "aktion";
}
function isAktionModulePath(path) {
  const clean = stripQuery(path).toLowerCase();
  return AKTION_MODULE_SUFFIXES.some((suffix) => clean.endsWith(suffix));
}
function isNativeModulePath(path) {
  return moduleLanguage(path) === null && !isReservedAktionPath(path);
}
const LIBRARY_COMPONENTS$1 = new Set(manifest.components.map((c) => c.name));
const BUILTIN_HOOKS = new Set(manifest.hooks);
const HANDLE_FACTORIES = new Set(manifest.factories);
const CACHED_HANDLE_FACTORIES = /* @__PURE__ */ new Set(["store", "form", "query"]);
const STORE_FACTORIES = /* @__PURE__ */ new Set(["store", "form"]);
const RUNTIME_STATE_NAMES = /* @__PURE__ */ new Set([
  ...manifest.hooks,
  ...manifest.factories,
  ...manifest.namespaces,
  ...manifest.builtins
]);
const RESERVED_INJECTED = /* @__PURE__ */ new Map([
  ["route", "it holds the current route"],
  ["aktion", "it holds the program's UI root"],
  ["theme", "it holds the active theme tokens"],
  ["params", "it holds the route parameters"],
  ["outlet", "it renders the router outlet"],
  ["cleanup", "it registers effect cleanups"],
  ["setTimeout", "the runtime tracks its timers so it can clear them"],
  ["setInterval", "the runtime tracks its timers so it can clear them"],
  ["clearTimeout", "the runtime tracks its timers so it can clear them"],
  ["clearInterval", "the runtime tracks its timers so it can clear them"]
]);
const ARRAY_MUTATORS = /* @__PURE__ */ new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin"
]);
const COLLECTION_MUTATORS = /* @__PURE__ */ new Set(["set", "add", "delete", "clear"]);
function mutatesInPlace(method, init) {
  if (ARRAY_MUTATORS.has(method)) {
    if (!init) return true;
    switch (init.kind) {
      case "Object":
      case "Literal":
      case "Template":
      case "Lambda":
        return false;
      case "New":
        return init.callee.kind === "Identifier" && init.callee.name === "Array";
      default:
        return true;
    }
  }
  return COLLECTION_MUTATORS.has(method) && init?.kind === "New";
}
const VALUE_BINARY = /* @__PURE__ */ new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "**",
  "==",
  "!=",
  "===",
  "!==",
  ">",
  "<",
  ">=",
  "<=",
  "instanceof",
  "in",
  "&",
  "|",
  "^",
  "<<",
  ">>",
  ">>>"
]);
const VALUE_UNARY = /* @__PURE__ */ new Set(["!", "-", "+", "~", "typeof"]);
const LOGICAL = /* @__PURE__ */ new Set(["&&", "||", "??"]);
const RESERVED_SYMBOL = /^__[al]\d+_/;
const MESSAGES = {
  E101: "`await` is not supported in Aktion modules: Aktion bodies run synchronously, so `await x` is the Promise itself and a statement-level `await f()` is skipped. Chain it instead — `f().then((value) => { … })` — or use `$http(…)` and its `.onDone`.",
  E102: "`async` functions are not supported: Aktion runs them synchronously and returns their value, not a Promise. Remove `async` and chain Promises with `.then(…)`.",
  E103this: "`this` is always null in Aktion — there are no methods or classes; pass the value as a parameter.",
  E103super: "`super` is not available in Aktion — there are no classes or inheritance; call the function you need directly.",
  E103debugger: "`debugger` is not available in Aktion — remove it, or log the value with `$console.log(…)`.",
  E103arguments: "`arguments` is not available in Aktion — use a rest parameter `(...args)`.",
  E104: "`var` is not supported in Aktion modules — use `let` or `const`.",
  E105: (name) => `\`${name}\` is reassigned after a closure captured it. Aktion closures copy values when they are created, so the closure would not see — or keep — the new value. Use a \`$state\` atom, \`$ref(…)\` inside a component, or an object box (\`const box = { value: … }\`).`,
  E106: (name) => `\`${name}\` is used by a closure before it is declared. Aktion closures capture their scope when they are created, so \`${name}\` does not exist yet. Move the declaration of \`${name}\` above the closure; for recursion, declare a module-level \`function ${name}(…)\`.`,
  E107: (name, fn) => `Module-level \`${name}\` is changed${fn ? ` in \`${fn}\`` : ""}, but Aktion rebuilds module-level bindings on every render, so the change is lost on the next render. Keep mutable data in a state atom (\`let $${name} = …\`) or, inside a component, in \`$ref(…)\`.`,
  E107init: (name) => `Module-level \`${name}\` is changed in place after it was built, but Aktion rebuilds module-level bindings from their initializer on every render, so the change is lost. Build the whole value in the initializer (\`const xs = [1, 2]\`, \`Object.fromEntries(items.map((it) => [it.id, it]))\`, \`new Map([[key, value]])\`), or keep data that changes in a state atom (\`let $${name} = …\`).`,
  E108method: (name, method) => `\`$${name}.${method}(…)\` changes state in place, and Aktion only re-renders when a \`$\` atom is assigned. Assign a new value instead, e.g. \`$${name} = [...$${name}, item]\`.`,
  E108key: (name) => `\`$${name}[…]\` is changed in place, and Aktion only re-renders when a \`$\` atom is assigned. Assign a new value instead, e.g. \`$${name} = $${name}.map(…)\` or \`$${name} = { ...$${name}, [key]: value }\`.`,
  E108assign: (name) => `\`Object.assign($${name}, …)\` changes state in place, and Aktion only re-renders when a \`$\` atom is assigned. Assign a new value instead, e.g. \`$${name} = { ...$${name}, ...changes }\`.`,
  E108delete: (name) => `\`delete $${name}…\` changes state in place, and Aktion only re-renders when a \`$\` atom is assigned. Assign a new value instead, e.g. a copy without the key: \`const { [key]: _, ...rest } = $${name}; $${name} = rest\`.`,
  E109: (name) => `Per-instance state \`$${name}\` must be declared at the top level of the component body — inside a block it becomes a global atom.`,
  E110: (hook) => `\`$${hook}(…)\` must be called at the top level of a component or of a \`function $useX\` hook — not inside a callback, a condition, a loop, an action, or a lambda that is not a module-level component.`,
  E111: (name) => `\`${name}\` is a component (its name starts with a capital letter), so calling it produces a UI node, not a value. Rename the helper to camelCase (\`${camelCase(name)}\`).`,
  E112: (name, reason) => `\`${name}\` is reserved by the Aktion runtime (${reason}) — rename it.`,
  E113: "Block statements `{ … }` are not supported — Aktion reads `{` at the start of a statement as an object literal. Remove the braces.",
  E114: (name, dep) => `\`$${name}\` is derived from \`$${dep}\` (its initializer reads state), so Aktion recomputes it whenever \`$${dep}\` changes and overwrites this assignment. Initialize it with a literal and update it in actions, or compute the value where it is used.`,
  E115: (name) => `Names starting with \`__a<n>_\` or \`__l<n>_\` are reserved for the Aktion compiler — rename \`${name}\`.`,
  E117: "Spreads inside component props are ignored by Aktion — list the props explicitly (`{ variant: extra.variant, … }`).",
  E118: "`$app(…)` registers the UI root and must be a top-level statement of the entry module (optionally `export default $app(…)`).",
  E119: "Pass the effect body inline: `$effect(() => load(), [...])` — Aktion only runs an inline function here.",
  E120: '`$effect` dependencies must be an array literal of `$atoms` and trigger strings (`"mount"`, `"every(1000)"`, …).',
  E121: "Returning a cleanup function from an effect has no effect in Aktion — call `cleanup(() => …)` inside the body instead.",
  E127arms: '`$router(…)` takes its route arms as an object literal written at the call — `$router({ "/": Home(), default: NotFound() })`. Aktion reads the arms from the source, so a value built elsewhere is ignored and the router renders nothing.',
  E127spread: "Spreads in `$router({ … })` are ignored — Aktion reads the route arms from the source. List every arm in the object literal.",
  E127computed: 'Computed route paths in `$router({ … })` are ignored — Aktion reads each arm\'s path from the source. Write the path as a string key (`"/users/:id": …`).',
  E127routes: "A layout arm's `routes` must be an object literal written in place — Aktion reads it from the source, so a value built elsewhere renders no child route.",
  E124: (name, field) => `Destructuring a \`$store\`/\`$form\` handle reads \`undefined\` in Aktion — read the fields as \`${name}.${field}\`.`,
  E125: (written, bare) => `\`${written}\` is not declared — declare it with \`let\` (state: \`let $${bare} = …\` at module level or at the top of the component body).`,
  E126: "Declare components and hooks at module top level.",
  W201: (name, fn) => `\`${name}\` calls \`${fn}\`, and Aktion re-evaluates module-level bindings on every render. Use \`$state(…)\`/\`$memo(…)\` in a component, or compute it in an effect or action.`,
  W202: (fn, atom) => `\`${fn}\` assigns \`$${atom}\` and is called while rendering; Aktion applies such writes once and does not re-render. Call it from an event handler or an effect.`
};
function isPascalCase(name) {
  const c = name.charCodeAt(0);
  return c >= 65 && c <= 90;
}
function camelCase(name) {
  return name.length === 0 ? name : name[0].toLowerCase() + name.slice(1);
}
function isStoreCall(expr) {
  return expr !== void 0 && expr.kind === "Invoke" && expr.callee.kind === "StateRef" && STORE_FACTORIES.has(expr.callee.name);
}
function isAppCall(expr) {
  return expr.kind === "Invoke" && expr.callee.kind === "StateRef" && expr.callee.name === "app";
}
class SourceText {
  constructor(text) {
    this.text = text;
    for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") this.lineStarts.push(i + 1);
  }
  lineStarts = [0];
  offsetOf(loc) {
    const start = this.lineStarts[loc.line - 1];
    return start === void 0 ? null : start + loc.column - 1;
  }
  locationOf(offset) {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.lineStarts[lo] + 1 };
  }
}
function invokeStart(expr, fallback, source) {
  const loc = expr.loc ?? fallback;
  if (expr.callee.kind !== "StateRef" || !expr.loc) return loc;
  const name = expr.callee.name;
  const paren = source?.offsetOf(expr.loc);
  if (source && paren !== null && paren !== void 0 && source.text[paren] === "(") {
    let end = paren - 1;
    while (end >= 0 && /\s/.test(source.text[end])) end -= 1;
    const dollar = end - name.length;
    if (dollar >= 0 && source.text[dollar] === "$" && source.text.slice(dollar + 1, end + 1) === name) {
      return { ...expr.loc, ...source.locationOf(dollar) };
    }
  }
  const column = expr.loc.column - name.length - 1;
  return column >= 1 ? { ...expr.loc, column } : loc;
}
function forEachPatternLeaf(pattern, visit, visitDefault) {
  for (const binding of pattern.bindings) {
    if (binding.defaultValue) visitDefault(binding.defaultValue);
    if (binding.pattern) forEachPatternLeaf(binding.pattern, visit, visitDefault);
    else if (binding.name) visit(binding, pattern.kind === "object");
  }
}
function renamePatternLeaf(binding, inObject, symbol) {
  if (inObject && !binding.rest && binding.sourceKey === void 0) binding.sourceKey = binding.name;
  binding.name = symbol;
}
function normalizeComponentForms(program) {
  let changed = false;
  const statements = program.statements.map((stmt) => {
    if (stmt.kind !== "Assignment" || stmt.isState || stmt.declaration !== "const" || !isPascalCase(stmt.identifier) || stmt.expression.kind !== "Lambda") {
      return stmt;
    }
    changed = true;
    return arrowAsComponent(stmt, stmt.expression);
  });
  return changed ? { ...program, statements } : program;
}
function arrowAsComponent(stmt, lambda) {
  const returnLoc = lambda.body.loc ?? lambda.loc ?? stmt.loc;
  const body = lambda.body.kind === "Block" ? lambda.body : {
    kind: "Block",
    body: [{ kind: "Return", argument: lambda.body, ...returnLoc ? { loc: returnLoc } : {} }],
    ...lambda.loc ? { loc: lambda.loc } : {}
  };
  return {
    kind: "ComponentDeclaration",
    name: stmt.identifier,
    params: lambda.params.map((p) => ({ ...p })),
    slots: [],
    body,
    ...stmt.exported ? { exported: true } : {},
    ...stmt.loc ? { loc: stmt.loc } : {},
    ...stmt.leadingComments ? { leadingComments: stmt.leadingComments } : {},
    ...stmt.trailingComments ? { trailingComments: stmt.trailingComments } : {}
  };
}
const LOCAL_KINDS = /* @__PURE__ */ new Set(["param", "local", "nested-function", "loop", "catch"]);
const NOWHERE = { line: 0, column: 0 };
function newScope(parent, fn, loopDepth) {
  return { parent, fn, loopDepth, plain: /* @__PURE__ */ new Map(), state: /* @__PURE__ */ new Map() };
}
function captureOf(from, owner) {
  let capture = null;
  for (let f = from; f !== null && f !== owner; f = f.parent) capture = f;
  return capture;
}
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}
class Analyzer {
  /** The module text, when the caller has it — positions `$name(…)` diagnostics exactly. */
  constructor(source) {
    this.source = source;
  }
  index = 0;
  nextLoop = 0;
  moduleScope = newScope(null, null, 0);
  scope = this.moduleScope;
  fn = null;
  loops = [];
  locs = [];
  appRoots = /* @__PURE__ */ new Set();
  reserved = /* @__PURE__ */ new Set();
  fnOf = /* @__PURE__ */ new Map();
  renderCalls = [];
  bindings = [];
  refs = [];
  findings = [];
  importedMutations = [];
  /** Calls whose arguments bind positionally, as in JavaScript (`CallExpr.positional`). */
  positionalCalls = [];
  run(program) {
    this.hoistModule(program.statements);
    for (const stmt of program.statements) this.stmt(stmt, { moduleTop: true, bodyOf: null });
    this.checkClosures();
    this.checkModuleBindings();
    this.checkDerivedAtoms();
    this.checkRenderWrites();
    return this;
  }
  // ── bookkeeping ──
  report(code, loc, message) {
    this.findings.push({
      code,
      severity: code.startsWith("W") ? "warning" : "error",
      message,
      loc: loc ?? this.here()
    });
  }
  here() {
    return this.locs[this.locs.length - 1] ?? NOWHERE;
  }
  enter(loc) {
    if (!loc) return false;
    this.locs.push(loc);
    return true;
  }
  leave(pushed) {
    if (pushed) this.locs.pop();
  }
  pushScope() {
    this.scope = newScope(this.scope, this.fn, this.loops.length);
    return this.scope;
  }
  popScope() {
    this.scope = this.scope.parent ?? this.moduleScope;
  }
  /**
   * E115 — the compiler's own name shapes. Tested on the bare name: the linker
   * renames atoms as well (`$total` → `$__a3_total`), so `$__a1_x` collides too.
   */
  checkReserved(name, state, loc) {
    if (!RESERVED_SYMBOL.test(name)) return;
    const written = state ? `$${name}` : name;
    if (this.reserved.has(written)) return;
    this.reserved.add(written);
    this.report("E115", loc ?? this.here(), MESSAGES.E115(written));
  }
  declare(name, state, kind, extra = {}) {
    const table = state ? this.scope.state : this.scope.plain;
    const existing = table.get(name);
    if (existing) return existing;
    this.checkReserved(name, state, extra.loc);
    const binding = {
      name,
      state,
      kind,
      scope: this.scope,
      loc: extra.loc,
      init: extra.init,
      decl: extra.decl,
      importSource: extra.importSource,
      importedName: extra.importedName,
      params: extra.params,
      instance: extra.instance ?? false,
      ready: extra.ready ?? Number.POSITIVE_INFINITY
    };
    table.set(name, binding);
    this.bindings.push(binding);
    return binding;
  }
  /** The binding `name` refers to from `from` (the current scope by default). */
  resolve(name, state, from = this.scope) {
    for (let s = from; s !== null; s = s.parent) {
      const found = (state ? s.state : s.plain).get(name);
      if (found) return found;
    }
    return null;
  }
  addRef(name, state, binding, loc, flags) {
    const ref = {
      name,
      state,
      binding,
      index: this.index,
      loc,
      fn: this.fn,
      loops: [...this.loops],
      write: flags.write ?? false,
      declaring: flags.declaring ?? false,
      rename: flags.rename
    };
    this.refs.push(ref);
    return ref;
  }
  /** A read of `name` here. */
  read(name, state, loc, rename) {
    this.checkReserved(name, state, loc);
    const binding = this.resolve(name, state);
    this.addRef(name, state, binding, loc, rename ? { rename } : {});
    return binding;
  }
  /** An assignment to `name` here (not a declaration). */
  write(name, state, loc, rename) {
    this.checkReserved(name, state, loc);
    const binding = this.resolve(name, state);
    this.addRef(name, state, binding, loc, { write: true, ...rename ? { rename } : {} });
    if (state) this.fn?.stateWrites.push(name);
    if (!binding) {
      if (!(state && RUNTIME_STATE_NAMES.has(name))) {
        this.report("E125", loc, MESSAGES.E125(state ? `$${name}` : name, name));
      }
      return;
    }
    if (!state && (binding.kind === "module" || this.isUserImport(binding))) {
      this.report("E107", loc, MESSAGES.E107(name, this.fnLabel()));
    }
  }
  /** The binding's own declaration site. */
  declaring(binding, loc, rename) {
    this.addRef(binding.name, binding.state, binding, loc, { declaring: true, write: true, ...rename ? { rename } : {} });
  }
  isUserImport(binding) {
    return binding.kind === "import" && binding.importSource !== DSL_MODULE_ID;
  }
  /** The nearest named function, for "… is changed in `fn`". */
  fnLabel() {
    for (let f = this.fn; f !== null; f = f.parent) if (f.label) return f.label;
    return null;
  }
  newFn(kind, label, start, hookHost, node) {
    const fn = {
      kind,
      label,
      parent: this.fn,
      start,
      loops: [...this.loops],
      hookHost,
      stateWrites: []
    };
    this.fnOf.set(node, fn);
    return fn;
  }
  /** Hook calls are allowed in a statement that is a direct child of a component / hook body. */
  hooksAt(context) {
    return context.bodyOf !== null && context.bodyOf === this.fn && this.fn.hookHost;
  }
  isHook(name) {
    if (BUILTIN_HOOKS.has(name)) return true;
    const binding = this.resolve(name, true);
    if (!binding) return false;
    if (binding.decl?.kind === "HookDeclaration") return true;
    return this.isUserImport(binding) && /^use[A-Z0-9_]/.test(name);
  }
  // ── declarations ──
  hoistModule(statements) {
    for (const stmt of statements) {
      switch (stmt.kind) {
        case "Assignment":
          if (stmt.declaration) {
            this.declare(stmt.identifier, stmt.isState, "module", {
              loc: stmt.loc,
              init: stmt.expression,
              decl: stmt,
              ready: 0,
              ...stmt.expression.kind === "Lambda" ? { params: stmt.expression.params } : {}
            });
          }
          break;
        case "DestructureStatement":
          forEachPatternLeaf(
            { kind: stmt.patternKind, bindings: stmt.bindings },
            (b) => this.declare(b.name, false, "module", { loc: stmt.loc, decl: stmt, ready: 0 }),
            () => {
            }
          );
          break;
        case "ComponentDeclaration":
        case "ActionDeclaration":
          this.declare(stmt.name, false, "function", { loc: stmt.loc, decl: stmt, params: stmt.params, ready: 0 });
          break;
        case "HookDeclaration":
          this.declare(stmt.name, true, "function", { loc: stmt.loc, decl: stmt, params: stmt.params, ready: 0 });
          break;
        case "Import":
          for (const spec of stmt.specifiers) {
            this.declare(spec.local, spec.isState === true, "import", {
              loc: stmt.loc,
              importSource: stmt.source,
              importedName: spec.imported,
              ready: 0
            });
          }
          break;
      }
    }
  }
  /** Declarations of a block, visible (with TDZ) throughout it — JavaScript block scoping. */
  hoistBlock(statements, bodyOf) {
    for (const stmt of statements) {
      switch (stmt.kind) {
        case "Assignment":
          if (stmt.declaration) {
            this.declare(stmt.identifier, stmt.isState, "local", {
              loc: stmt.loc,
              init: stmt.expression,
              decl: stmt,
              instance: stmt.isState && bodyOf !== null && bodyOf.kind === "component" && bodyOf === this.fn,
              ...stmt.expression.kind === "Lambda" ? { params: stmt.expression.params } : {}
            });
          }
          break;
        case "DestructureStatement":
          forEachPatternLeaf(
            { kind: stmt.patternKind, bindings: stmt.bindings },
            (b) => this.declare(b.name, false, "local", { loc: stmt.loc, decl: stmt }),
            () => {
            }
          );
          break;
        case "ActionDeclaration":
        case "ComponentDeclaration":
          this.declare(stmt.name, false, "nested-function", { loc: stmt.loc, decl: stmt, params: stmt.params });
          break;
        case "HookDeclaration":
          this.declare(stmt.name, true, "nested-function", { loc: stmt.loc, decl: stmt, params: stmt.params });
          break;
      }
    }
  }
  param(p, component, fnStart) {
    if (p.defaultValue) this.expr(p.defaultValue, { hooks: false, value: false });
    const loc = this.here();
    if (p.pattern) {
      forEachPatternLeaf(
        p.pattern,
        (leaf, inObject) => {
          const binding2 = this.declare(leaf.name, false, "param", { loc, ready: fnStart });
          this.declaring(binding2, loc, (symbol) => renamePatternLeaf(leaf, inObject, symbol));
        },
        (expr) => this.expr(expr, { hooks: false, value: false })
      );
      return;
    }
    if (!p.name) return;
    const binding = this.declare(p.name, false, "param", { loc, ready: fnStart });
    this.declaring(binding, loc, (symbol) => {
      if (component && p.publicName === void 0) p.publicName = p.name;
      p.name = symbol;
    });
  }
  // ── statements ──
  stmt(stmt, context) {
    this.index += 1;
    const pushed = this.enter(stmt.loc);
    const hooks2 = this.hooksAt(context);
    switch (stmt.kind) {
      case "Import":
      case "ExportList":
        break;
      case "Assignment":
        this.assignment(stmt, context, hooks2);
        break;
      case "DestructureStatement":
        this.destructure(stmt, context, hooks2);
        break;
      case "ComponentDeclaration":
      case "ActionDeclaration":
      case "HookDeclaration":
        this.declaration(stmt, context);
        break;
      case "EffectDeclaration":
        this.effect(stmt);
        break;
      case "Await":
        this.report("E101", stmt.loc, MESSAGES.E101);
        this.expr(stmt.argument, { hooks: false, value: false });
        break;
      case "Return":
        if (stmt.argument) {
          if (this.fn?.kind === "effect") this.report("E121", stmt.loc, MESSAGES.E121);
          if (this.fn?.kind === "component" && this.fn.label && returnsPlainValue(stmt.argument)) {
            this.report("E111", stmt.loc, MESSAGES.E111(this.fn.label));
          }
          this.expr(stmt.argument, { hooks: hooks2, value: false });
        }
        break;
      case "ExpressionStatement":
        if (stmt.expression.kind === "Object" || stmt.expression.kind === "Block") {
          this.report("E113", stmt.loc, MESSAGES.E113);
        }
        if (context.moduleTop && isAppCall(stmt.expression)) this.appRoots.add(stmt.expression);
        this.expr(stmt.expression, { hooks: hooks2, value: false });
        break;
      case "IfStatement":
        this.expr(stmt.test, { hooks: false, value: true });
        this.block(stmt.consequent, null);
        if (stmt.alternate) {
          if (stmt.alternate.kind === "IfStatement") this.stmt(stmt.alternate, { moduleTop: false, bodyOf: null });
          else this.block(stmt.alternate, null);
        }
        break;
      case "SwitchStatement":
        this.expr(stmt.discriminant, { hooks: false, value: true });
        this.pushScope();
        for (const c of stmt.cases) this.hoistBlock(c.body, null);
        for (const c of stmt.cases) {
          if (c.test) this.expr(c.test, { hooks: false, value: false });
          for (const s of c.body) this.stmt(s, { moduleTop: false, bodyOf: null });
        }
        this.popScope();
        break;
      case "ForOfStatement":
      case "ForInStatement": {
        if (stmt.declaration === "var") this.report("E104", stmt.loc, MESSAGES.E104);
        this.expr(stmt.iterable, { hooks: false, value: false });
        const loop = this.enterLoop();
        this.pushScope();
        this.loopHead(stmt);
        this.block(stmt.body, null);
        this.popScope();
        this.leaveLoop(loop);
        break;
      }
      case "ForClassicStatement": {
        this.pushScope();
        if (stmt.init) {
          if (stmt.init.kind === "Assignment" && stmt.init.declaration) {
            const init = stmt.init;
            if (init.declaration === "var") this.report("E104", init.loc, MESSAGES.E104);
            this.expr(init.expression, { hooks: false, value: false });
            const binding = this.declare(init.identifier, init.isState, "loop", {
              loc: init.loc,
              init: init.expression,
              decl: init,
              ready: this.index
            });
            this.declaring(binding, init.loc ?? this.here(), init.isState ? void 0 : (symbol) => {
              init.identifier = symbol;
            });
          } else {
            this.stmt(stmt.init, { moduleTop: false, bodyOf: null });
          }
        }
        const loop = this.enterLoop();
        if (stmt.test) this.expr(stmt.test, { hooks: false, value: true });
        this.block(stmt.body, null);
        if (stmt.update) this.expr(stmt.update, { hooks: false, value: false });
        this.leaveLoop(loop);
        this.popScope();
        break;
      }
      case "WhileStatement": {
        const loop = this.enterLoop();
        this.expr(stmt.test, { hooks: false, value: true });
        this.block(stmt.body, null);
        this.leaveLoop(loop);
        break;
      }
      case "DoWhileStatement": {
        const loop = this.enterLoop();
        this.block(stmt.body, null);
        this.expr(stmt.test, { hooks: false, value: true });
        this.leaveLoop(loop);
        break;
      }
      case "BreakStatement":
      case "ContinueStatement":
        break;
      case "ThrowStatement":
        this.expr(stmt.argument, { hooks: false, value: false });
        break;
      case "TryStatement":
        this.block(stmt.block, null);
        if (stmt.catchBlock) {
          this.pushScope();
          if (stmt.catchParam) {
            const binding = this.declare(stmt.catchParam, false, "catch", { loc: stmt.loc, ready: this.index });
            this.declaring(binding, stmt.loc ?? this.here(), (symbol) => {
              stmt.catchParam = symbol;
            });
          }
          this.block(stmt.catchBlock, null);
          this.popScope();
        }
        if (stmt.finallyBlock) this.block(stmt.finallyBlock, null);
        break;
    }
    this.leave(pushed);
  }
  enterLoop() {
    const id = this.nextLoop++;
    this.loops.push(id);
    return id;
  }
  leaveLoop(id) {
    const at = this.loops.lastIndexOf(id);
    if (at !== -1) this.loops.length = at;
  }
  loopHead(stmt) {
    const loc = stmt.loc ?? this.here();
    if (stmt.kind === "ForOfStatement" && stmt.pattern) {
      forEachPatternLeaf(
        stmt.pattern,
        (leaf, inObject) => {
          if (stmt.declaration) {
            const binding = this.declare(leaf.name, false, "loop", { loc, ready: this.index });
            this.declaring(binding, loc, (symbol) => renamePatternLeaf(leaf, inObject, symbol));
          } else {
            this.write(leaf.name, false, loc, (symbol) => renamePatternLeaf(leaf, inObject, symbol));
          }
        },
        (expr) => this.expr(expr, { hooks: false, value: false })
      );
      return;
    }
    const rename = (symbol) => {
      stmt.item = symbol;
    };
    if (stmt.declaration) {
      const binding = this.declare(stmt.item, false, "loop", { loc, ready: this.index });
      this.declaring(binding, loc, rename);
    } else {
      this.write(stmt.item, false, loc, rename);
    }
  }
  assignment(stmt, context, hooks2) {
    if (stmt.declaration === "var") this.report("E104", stmt.loc, MESSAGES.E104);
    const loc = stmt.loc ?? this.here();
    const label = context.moduleTop && stmt.expression.kind === "Lambda" ? stmt.identifier : void 0;
    this.expr(stmt.expression, { hooks: hooks2, value: false, ...label ? { label } : {} });
    const rename = stmt.isState ? void 0 : (symbol) => {
      stmt.identifier = symbol;
    };
    if (!stmt.declaration) {
      this.write(stmt.identifier, stmt.isState, loc, rename);
      return;
    }
    const table = stmt.isState ? this.scope.state : this.scope.plain;
    const binding = table.get(stmt.identifier);
    if (!binding || binding.decl !== stmt) {
      this.write(stmt.identifier, stmt.isState, loc, rename);
      return;
    }
    if (binding.ready === Number.POSITIVE_INFINITY) binding.ready = this.index;
    this.declaring(binding, loc, rename);
    if (stmt.isState) {
      this.fn?.stateWrites.push(stmt.identifier);
      if (this.fn?.kind === "component" && context.bodyOf !== this.fn) {
        this.report("E109", loc, MESSAGES.E109(stmt.identifier));
      }
    } else if (context.moduleTop) {
      const unstable = renderUnstableCall(stmt.expression, (n) => this.resolve(n, false) === null);
      if (unstable) this.report("W201", loc, MESSAGES.W201(stmt.identifier, unstable));
    }
  }
  destructure(stmt, context, hooks2) {
    if (stmt.declaration === "var") this.report("E104", stmt.loc, MESSAGES.E104);
    const loc = stmt.loc ?? this.here();
    this.expr(stmt.expression, { hooks: hooks2, value: false });
    if (stmt.patternKind === "object") {
      const handle = this.handleName(stmt.expression);
      if (handle) this.report("E124", loc, MESSAGES.E124(handle, firstField(stmt.bindings)));
    }
    const pattern = { kind: stmt.patternKind, bindings: stmt.bindings };
    const leaves = [];
    forEachPatternLeaf(
      pattern,
      (leaf, inObject) => leaves.push({ leaf, inObject }),
      (expr) => this.expr(expr, { hooks: false, value: false })
    );
    for (const { leaf, inObject } of leaves) {
      const binding = this.scope.plain.get(leaf.name);
      const rename = (symbol) => renamePatternLeaf(leaf, inObject, symbol);
      if (!binding || binding.decl !== stmt) {
        this.write(leaf.name, false, loc, rename);
        continue;
      }
      if (binding.ready === Number.POSITIVE_INFINITY) binding.ready = this.index;
      this.declaring(binding, loc, rename);
    }
    if (context.moduleTop) {
      const unstable = renderUnstableCall(stmt.expression, (n) => this.resolve(n, false) === null);
      const first = leaves[0];
      if (unstable && first) this.report("W201", loc, MESSAGES.W201(first.leaf.name, unstable));
    }
  }
  declaration(stmt, context) {
    const nested = !context.moduleTop;
    const isComponent = stmt.kind === "ComponentDeclaration";
    const isHook = stmt.kind === "HookDeclaration";
    const loc = stmt.loc ?? this.here();
    if (nested && (isComponent || isHook)) this.report("E126", loc, MESSAGES.E126);
    if (!nested) this.checkReserved(stmt.name, isHook, loc);
    const start = this.index;
    const kind = nested ? "nested" : isComponent ? "component" : isHook ? "hook" : "action";
    const fn = this.newFn(kind, isHook ? `$${stmt.name}` : stmt.name, start, isComponent || isHook, stmt);
    const savedFn = this.fn;
    this.fn = fn;
    this.pushScope();
    for (const p of stmt.params) this.param(p, isComponent && !nested, start);
    this.block(stmt.body, fn);
    this.popScope();
    this.fn = savedFn;
    if (nested) {
      const binding = (isHook ? this.scope.state : this.scope.plain).get(stmt.name);
      if (binding && binding.decl === stmt) {
        binding.ready = this.index;
        this.declaring(binding, loc, isHook ? void 0 : (symbol) => {
          stmt.name = symbol;
        });
      }
    }
  }
  effect(stmt) {
    const shape = effectCallShape(stmt);
    if (shape?.callback) this.report("E119", shape.callback, MESSAGES.E119);
    if (shape?.deps) this.report("E120", shape.deps, MESSAGES.E120);
    const loc = stmt.loc ?? this.here();
    for (const trigger of stmt.triggers) {
      if (trigger.kind === "state") this.read(trigger.name.split(".")[0], true, loc);
    }
    const fn = this.newFn("effect", null, this.index, false, stmt);
    const savedFn = this.fn;
    this.fn = fn;
    this.pushScope();
    this.block(stmt.body, fn);
    this.popScope();
    this.fn = savedFn;
  }
  block(block, bodyOf) {
    this.index += 1;
    const pushed = this.enter(block.loc);
    this.pushScope();
    this.hoistBlock(block.body, bodyOf);
    for (const stmt of block.body) this.stmt(stmt, { moduleTop: false, bodyOf });
    this.popScope();
    this.leave(pushed);
  }
  // ── expressions ──
  expr(expr, context) {
    this.index += 1;
    const pushed = this.enter(expr.loc);
    const neutral = { hooks: context.hooks, value: false };
    const asValue = { hooks: context.hooks, value: true };
    const conditional = { hooks: false, value: false };
    switch (expr.kind) {
      case "Literal":
        break;
      case "Identifier": {
        const loc = expr.loc ?? this.here();
        if (expr.name === "this") {
          this.report("E103", loc, MESSAGES.E103this);
          break;
        }
        if (expr.name === "super") {
          this.report("E103", loc, MESSAGES.E103super);
          break;
        }
        if (expr.name === "debugger") {
          this.report("E103", loc, MESSAGES.E103debugger);
          break;
        }
        if (expr.name === "arguments") {
          this.report("E103", loc, MESSAGES.E103arguments);
          break;
        }
        this.read(expr.name, false, loc, (symbol) => {
          expr.name = symbol;
        });
        break;
      }
      case "StateRef":
        this.read(expr.name, true, expr.loc ?? this.here());
        break;
      case "Array":
        for (const element of expr.elements) this.expr(element, neutral);
        break;
      case "Object":
        for (const prop of expr.properties) {
          if (prop.computedKey) this.expr(prop.computedKey, asValue);
          this.expr(prop.value, neutral);
        }
        break;
      case "Member":
        this.expr(expr.object, asValue);
        if (expr.computed) this.expr(expr.computed, asValue);
        break;
      case "Unary":
        if (expr.operator === "delete") this.mutation(expr.argument, "delete", void 0, expr.loc);
        this.expr(expr.argument, VALUE_UNARY.has(expr.operator) ? asValue : neutral);
        break;
      case "Binary":
        if (LOGICAL.has(expr.operator)) {
          this.expr(expr.left, neutral);
          this.expr(expr.right, conditional);
        } else {
          this.expr(expr.left, VALUE_BINARY.has(expr.operator) ? asValue : neutral);
          this.expr(expr.right, VALUE_BINARY.has(expr.operator) ? asValue : neutral);
        }
        break;
      case "Ternary":
        this.expr(expr.test, { hooks: context.hooks, value: true });
        this.expr(expr.consequent, conditional);
        this.expr(expr.alternate, conditional);
        break;
      case "Call":
        if (expr.callee === "this" || expr.callee === "super" || expr.callee === "debugger") {
          this.report("E103", expr.loc, MESSAGES[expr.callee === "this" ? "E103this" : expr.callee === "super" ? "E103super" : "E103debugger"]);
          for (const arg of expr.arguments) this.expr(arg, neutral);
          break;
        }
        this.call(expr, context);
        break;
      case "MethodCall":
        if (ARRAY_MUTATORS.has(expr.method) || COLLECTION_MUTATORS.has(expr.method)) {
          this.mutation(expr.object, "method", expr.method, expr.loc);
        }
        if (isObjectAssign(expr, (n) => this.resolve(n, false) === null) && expr.arguments[0]) {
          this.mutation(expr.arguments[0], "target", void 0, expr.loc);
        }
        this.expr(expr.object, asValue);
        for (const arg of expr.arguments) this.expr(arg, neutral);
        break;
      case "Invoke":
        this.invoke(expr, context);
        break;
      case "BuiltinCall":
        this.builtin(expr, context);
        break;
      case "New":
        this.expr(expr.callee, asValue);
        for (const arg of expr.arguments) this.expr(arg, neutral);
        break;
      case "Template":
        for (const e of expr.expressions) this.expr(e, asValue);
        break;
      case "Spread":
        this.expr(expr.argument, neutral);
        break;
      case "Lambda":
        this.lambda(expr, context.label ?? null);
        break;
      case "Block":
        this.block(expr, null);
        break;
    }
    this.leave(pushed);
  }
  call(expr, context) {
    const loc = expr.loc ?? this.here();
    const binding = this.read(expr.callee, false, loc, (symbol) => {
      expr.callee = symbol;
    });
    if (isPascalCase(expr.callee)) {
      if (context.value && this.isUserComponent(binding)) this.report("E111", loc, MESSAGES.E111(expr.callee));
      if (binding === null || binding.kind === "import" && binding.importSource === DSL_MODULE_ID) {
        this.checkPropsSpread(expr);
      }
    }
    if (binding) {
      this.checkPatternArguments(expr, binding);
      if (this.fn === null || this.fn.hookHost) this.renderCalls.push({ binding, loc });
      if (this.isUserComponent(binding) && expr.arguments.some((arg) => arg.kind === "Object")) {
        this.positionalCalls.push(expr);
      }
    }
    const neutral = { hooks: context.hooks, value: false };
    for (const arg of expr.arguments) this.expr(arg, neutral);
  }
  invoke(expr, context) {
    const neutral = { hooks: context.hooks, value: false };
    if (expr.callee.kind === "StateRef") {
      const name = expr.callee.name;
      const start = invokeStart(expr, this.here(), this.source);
      if (name === "app" && !this.appRoots.has(expr)) this.report("E118", start, MESSAGES.E118);
      if (!context.hooks && this.isHook(name)) this.report("E110", start, MESSAGES.E110(name));
      if (name === "router" && this.isRuntimeName("router")) this.checkRouterArms(expr, start);
      this.read(name, true, start);
    } else {
      this.expr(expr.callee, { hooks: context.hooks, value: true });
    }
    for (const arg of expr.arguments) this.expr(arg, neutral);
  }
  builtin(expr, context) {
    const neutral = { hooks: context.hooks, value: false };
    const [target, value] = expr.arguments;
    switch (expr.name) {
      case "__rui_await__":
        this.report("E101", expr.loc, MESSAGES.E101);
        if (target) this.expr(target, neutral);
        return;
      case "__rui_assign__":
        if (target) this.assignTarget(target, "assign", expr.loc, value);
        return;
      case "__rui_postfix__":
      case "__rui_prefix__":
        if (target) this.assignTarget(target, "update", expr.loc, void 0);
        return;
      default:
        for (const arg of expr.arguments) this.expr(arg, neutral);
    }
  }
  assignTarget(target, kind, at, value) {
    const loc = at ?? this.here();
    const neutral = { hooks: false, value: false };
    if (target.kind === "Identifier") {
      if (value) this.expr(value, neutral);
      this.index += 1;
      this.write(target.name, false, loc, (symbol) => {
        target.name = symbol;
      });
      return;
    }
    if (target.kind === "StateRef") {
      if (value) this.expr(value, neutral);
      this.index += 1;
      this.write(target.name, true, loc);
      return;
    }
    if (target.kind === "Member") this.mutation(target, kind, void 0, loc);
    this.expr(target, neutral);
    if (value) this.expr(value, neutral);
  }
  lambda(expr, label) {
    const start = this.index;
    const fn = this.newFn("lambda", label, start, false, expr);
    const savedFn = this.fn;
    this.fn = fn;
    this.pushScope();
    if (expr.selfName) {
      const loc = expr.loc ?? this.here();
      const self = this.declare(expr.selfName, false, "local", { loc, ready: start });
      this.declaring(self, loc, (symbol) => {
        expr.selfName = symbol;
      });
    }
    for (const p of expr.params) this.param(p, false, start);
    if (expr.body.kind === "Block") this.block(expr.body, fn);
    else this.expr(expr.body, { hooks: false, value: false });
    this.popScope();
    this.fn = savedFn;
  }
  // ── inline rules ──
  isUserComponent(binding) {
    if (!binding) return false;
    if (binding.kind === "function") return binding.decl?.kind === "ComponentDeclaration";
    return this.isUserImport(binding) && isPascalCase(binding.name);
  }
  /** `$name` is the runtime's own (not shadowed by a user hook or import) — seen from `from`. */
  isRuntimeName(name, from = this.scope) {
    const binding = this.resolve(name, true, from);
    return binding === null || binding.kind === "import" && binding.importSource === DSL_MODULE_ID;
  }
  /**
   * E127 — `$router(…)` reads its arms from the AST, not from a value: the
   * evaluator matches the properties of the object literal written at the call
   * (skipping spreads, and comparing each arm's literal key with the path), and
   * a layout arm's `routes` the same way. Anything else is silently ignored.
   */
  checkRouterArms(expr, start) {
    const arms = expr.arguments[0];
    if (!arms || arms.kind !== "Object") {
      this.report("E127", arms?.loc ?? start, MESSAGES.E127arms);
      return;
    }
    const visit = (object) => {
      for (const prop of object.properties) {
        if (prop.spread) {
          this.report("E127", prop.value.loc ?? start, MESSAGES.E127spread);
          continue;
        }
        if (prop.computedKey) {
          this.report("E127", prop.computedKey.loc ?? start, MESSAGES.E127computed);
          continue;
        }
        if (prop.value.kind !== "Object") continue;
        const layout = prop.value.properties.some((p) => !p.spread && !p.computedKey && p.key === "layout");
        const routes = prop.value.properties.find((p) => !p.spread && !p.computedKey && p.key === "routes");
        if (!layout || !routes) continue;
        if (routes.value.kind === "Object") visit(routes.value);
        else this.report("E127", routes.value.loc ?? start, MESSAGES.E127routes);
      }
    };
    visit(arms);
  }
  /** E117 — `{ ...extra }` in the props bag of a library or host component. */
  checkPropsSpread(expr) {
    let bag;
    for (const arg of expr.arguments) if (arg.kind === "Object") bag = arg;
    if (!bag || bag.kind !== "Object") return;
    for (const prop of bag.properties) {
      if (prop.spread) this.report("E117", prop.value.loc ?? expr.loc, MESSAGES.E117);
    }
  }
  /** The name to show for a `$store`/`$form` handle `expr` evaluates to, or `null` when it is none. */
  handleName(expr) {
    if (isStoreCall(expr)) return expr.callee.kind === "StateRef" ? expr.callee.name : "store";
    if (expr.kind === "Identifier") {
      const binding = this.resolve(expr.name, false);
      return binding && isStoreCall(binding.init) ? expr.name : null;
    }
    if (expr.kind === "StateRef") {
      const binding = this.resolve(expr.name, true);
      return binding && isStoreCall(binding.init) ? `$${expr.name}` : null;
    }
    return null;
  }
  /** E124 at a call site: a handle passed to a parameter that destructures it. */
  checkPatternArguments(expr, binding) {
    const params = binding.params;
    if (!params) return;
    expr.arguments.forEach((arg, i) => {
      const param = params[i];
      if (!param?.pattern || param.pattern.kind !== "object") return;
      const handle = this.handleName(arg);
      if (handle) this.report("E124", arg.loc ?? expr.loc, MESSAGES.E124(handle, firstField(param.pattern.bindings)));
    });
  }
  /**
   * An in-place change of what `subject` evaluates to: `obj.k = v`, `list.push(x)`,
   * `delete o.k`, `a[i]++`, `Object.assign(o, …)`. `subject` is the member chain
   * being changed (or the receiver of a mutating method, or the `target` of
   * `Object.assign`).
   */
  mutation(subject, kind, method, at) {
    let node = subject;
    let dynamicKey = false;
    let path = false;
    while (node.kind === "Member") {
      if (node.computed && node.computed.kind !== "Literal") dynamicKey = true;
      node = node.object;
      path = true;
    }
    if (node.kind !== "Identifier" && node.kind !== "StateRef") return;
    if (kind !== "method" && kind !== "target" && !path) return;
    const state = node.kind === "StateRef";
    const binding = this.resolve(node.name, state);
    if (!binding) return;
    const loc = at ?? this.here();
    if (kind === "method" && !mutatesInPlace(method ?? "", path ? void 0 : binding.init)) {
      if (!(state && this.isUserImport(binding))) return;
    }
    if (!state) {
      if ((binding.kind === "module" || this.isUserImport(binding)) && !this.survivesRebuild(binding)) {
        this.report(
          "E107",
          loc,
          this.fn !== null ? MESSAGES.E107(node.name, this.fnLabel()) : MESSAGES.E107init(node.name)
        );
      }
      return;
    }
    if (kind !== "method" && kind !== "target") this.fn?.stateWrites.push(node.name);
    const inPlace = kind === "method" || kind === "target" || kind === "delete" || dynamicKey;
    if (!inPlace) return;
    const message = kind === "method" ? MESSAGES.E108method(node.name, method ?? "") : kind === "target" ? MESSAGES.E108assign(node.name) : kind === "delete" ? MESSAGES.E108delete(node.name) : MESSAGES.E108key(node.name);
    if (this.isUserImport(binding)) {
      this.importedMutations.push({
        source: binding.importSource,
        imported: binding.importedName ?? binding.name,
        ...kind === "method" && method !== void 0 ? { method } : {},
        path,
        message,
        line: loc.line,
        column: loc.column
      });
      return;
    }
    if (isDataAtom(binding)) this.report("E108", loc, message);
  }
  /**
   * A module-level binding whose initializer hands back the SAME object on
   * every render, so an in-place change of it outlives the rebuild (no E107):
   *
   *   - a `$store(…)`, `$form(…)` or `$query(…)` handle
   *     ({@link CACHED_HANDLE_FACTORIES}) — `cart.items = [item]`,
   *     `signup.values.name = "Ada"`;
   *   - a host object read through a global — `const root =
   *     document.documentElement`, then `root.dataset.theme = "dark"`.
   *
   * Measured on the `.aktion` control in tests/compiler-module-mutation.test.ts.
   * An import is judged by its own module, which this one cannot see, so it
   * never qualifies.
   */
  survivesRebuild(binding) {
    const init = binding.init;
    if (binding.kind !== "module" || !init) return false;
    if (init.kind === "Invoke") {
      return init.callee.kind === "StateRef" && CACHED_HANDLE_FACTORIES.has(init.callee.name) && this.isRuntimeName(init.callee.name, binding.scope);
    }
    let root = init;
    while (root.kind === "Member") {
      if (root.computed && root.computed.kind !== "Literal") return false;
      root = root.object;
    }
    return root.kind === "Identifier" && !RESERVED_INJECTED.has(root.name) && this.resolve(root.name, false, binding.scope) === null;
  }
  // ── whole-module rules ──
  /** E105 and E106 — closures copy their scope when they are created. */
  checkClosures() {
    const captures = /* @__PURE__ */ new Map();
    for (const ref of this.refs) {
      const binding = ref.binding;
      if (!binding || binding.state || ref.declaring || !LOCAL_KINDS.has(binding.kind)) continue;
      const capture = captureOf(ref.fn, binding.scope.fn);
      if (capture) {
        const list = captures.get(binding) ?? [];
        if (!list.includes(capture)) list.push(capture);
        captures.set(binding, list);
        if (capture.start < binding.ready) this.report("E106", ref.loc, MESSAGES.E106(ref.name));
      } else if (binding.kind === "nested-function" && ref.index < binding.ready) {
        this.report("E106", ref.loc, MESSAGES.E106(ref.name));
      }
    }
    for (const ref of this.refs) {
      const binding = ref.binding;
      if (!ref.write || ref.declaring || !binding || binding.state) continue;
      if (!LOCAL_KINDS.has(binding.kind) || binding.kind === "loop") continue;
      const closures = captures.get(binding);
      if (!closures) continue;
      const insideClosure = captureOf(ref.fn, binding.scope.fn) !== null;
      const afterClosure = closures.some((c) => c.start < ref.index);
      const sameLoop = closures.some((c) => commonPrefix(c.loops, ref.loops) > binding.scope.loopDepth);
      if (insideClosure || afterClosure || sameLoop) this.report("E105", ref.loc, MESSAGES.E105(ref.name));
    }
  }
  /** E112 — module-level names the runtime owns. */
  checkModuleBindings() {
    for (const binding of this.moduleScope.plain.values()) {
      const injected = RESERVED_INJECTED.get(binding.name);
      if (injected) {
        if (binding.kind !== "import" || binding.importSource !== DSL_MODULE_ID) {
          this.report("E112", binding.loc, MESSAGES.E112(binding.name, injected));
        }
        continue;
      }
      if (!LIBRARY_COMPONENTS$1.has(binding.name)) continue;
      if (binding.kind === "function" || binding.kind === "import") continue;
      if (binding.init?.kind === "Lambda") continue;
      this.report("E112", binding.loc, MESSAGES.E112(binding.name, `it is the built-in \`${binding.name}\` component`));
    }
  }
  /** E114 — a derived module-level atom that is also assigned. */
  checkDerivedAtoms() {
    for (const binding of this.moduleScope.state.values()) {
      if (binding.kind !== "module" || !binding.init) continue;
      const dep = derivedDependency(binding.init, binding.name, (name) => this.moduleScope.state.has(name));
      if (!dep) continue;
      const assigned = this.refs.some((r) => r.binding === binding && r.write && !r.declaring);
      if (assigned) this.report("E114", binding.loc, MESSAGES.E114(binding.name, dep));
    }
  }
  /** W202 — a camelCase function that assigns state, called while rendering. */
  checkRenderWrites() {
    for (const { binding, loc } of this.renderCalls) {
      if (binding.scope !== this.moduleScope || isPascalCase(binding.name)) continue;
      const node = binding.decl?.kind === "ActionDeclaration" ? binding.decl : binding.init;
      const fn = node ? this.fnOf.get(node) : void 0;
      const atom = fn?.stateWrites[0];
      if (atom !== void 0) this.report("W202", loc, MESSAGES.W202(binding.name, atom));
    }
  }
}
function isObjectAssign(expr, isFree) {
  return expr.method === "assign" && expr.object.kind === "Identifier" && expr.object.name === "Object" && isFree("Object");
}
function firstField(bindings) {
  for (const b of bindings) {
    if (b.rest) continue;
    const key = b.sourceKey ?? b.name;
    if (key) return key;
  }
  return "field";
}
function returnsPlainValue(expr) {
  switch (expr.kind) {
    case "Literal":
      return expr.value !== null;
    case "Template":
      return true;
    case "Binary":
      return VALUE_BINARY.has(expr.operator);
    case "Unary":
      return VALUE_UNARY.has(expr.operator);
    default:
      return false;
  }
}
function isDataAtom(binding) {
  if (!binding.state || binding.kind !== "module" && !binding.instance) return false;
  return isDataExpression(binding.init);
}
function isDataExpression(expr) {
  if (!expr) return false;
  switch (expr.kind) {
    case "Literal":
    case "Array":
    case "Object":
    case "Template":
    case "Binary":
    case "Unary":
      return true;
    case "Ternary":
      return isDataExpression(expr.consequent) || isDataExpression(expr.alternate);
    case "New":
      return expr.callee.kind === "Identifier" && ["Map", "Set", "Array", "Object", "Date"].includes(expr.callee.name);
    default:
      return false;
  }
}
function dataAtomInitializers(program) {
  const out = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  for (const stmt of program.statements) {
    if (stmt.kind !== "Assignment" || !stmt.isState || seen.has(stmt.identifier)) continue;
    seen.add(stmt.identifier);
    if (isDataExpression(stmt.expression)) out.set(stmt.identifier, stmt.expression);
  }
  return out;
}
function importedStateMutationApplies(mutation, exporter) {
  const init = dataAtomInitializers(exporter).get(mutation.imported);
  if (!init) return false;
  if (mutation.method === void 0) return true;
  return mutatesInPlace(mutation.method, mutation.path ? void 0 : init);
}
function derivedDependency(expr, self, isAtom) {
  let found = null;
  const visit = (e) => {
    if (found !== null) return;
    switch (e.kind) {
      case "StateRef":
        if (e.name !== self && isAtom(e.name)) found = e.name;
        return;
      case "Lambda":
        return;
      case "Invoke":
        if (e.callee.kind === "StateRef" && (RUNTIME_STATE_NAMES.has(e.callee.name) || HANDLE_FACTORIES.has(e.callee.name))) {
          return;
        }
        visit(e.callee);
        e.arguments.forEach(visit);
        return;
      default:
        forEachChildExpression(e, visit);
    }
  };
  visit(expr);
  return found;
}
function forEachChildExpression(expr, visit) {
  switch (expr.kind) {
    case "Array":
      expr.elements.forEach(visit);
      return;
    case "Object":
      for (const p of expr.properties) {
        if (p.computedKey) visit(p.computedKey);
        visit(p.value);
      }
      return;
    case "Member":
      visit(expr.object);
      if (expr.computed) visit(expr.computed);
      return;
    case "Unary":
    case "Spread":
      visit(expr.argument);
      return;
    case "Binary":
      visit(expr.left);
      visit(expr.right);
      return;
    case "Ternary":
      visit(expr.test);
      visit(expr.consequent);
      visit(expr.alternate);
      return;
    case "Call":
    case "BuiltinCall":
      expr.arguments.forEach(visit);
      return;
    case "MethodCall":
      visit(expr.object);
      expr.arguments.forEach(visit);
      return;
    case "Invoke":
    case "New":
      visit(expr.callee);
      expr.arguments.forEach(visit);
      return;
    case "Template":
      expr.expressions.forEach(visit);
      return;
    default:
      return;
  }
}
function renderUnstableCall(expr, isFree) {
  let found = null;
  const rootOf = (e) => {
    let path = "";
    let node = e;
    while (node.kind === "Member" && node.property !== void 0) {
      path = `.${node.property}${path}`;
      node = node.object;
    }
    return node.kind === "Identifier" ? { name: node.name, path } : null;
  };
  const visit = (e) => {
    if (found !== null || e.kind === "Lambda") return;
    if (e.kind === "MethodCall") {
      if (e.object.kind === "StateRef" && e.object.name === "util" && e.method === "now") {
        found = "$util.now()";
        return;
      }
      const root = rootOf(e.object);
      if (root && isFree(root.name)) {
        const call = `${root.name}${root.path}.${e.method}()`;
        if (root.path === "" && root.name === "Date" && e.method === "now") found = call;
        else if (root.path === "" && root.name === "Math" && e.method === "random") found = call;
        else if (root.path === "" && root.name === "performance" && e.method === "now") found = call;
        else if (root.name === "crypto") found = call;
        if (found !== null) return;
      }
    }
    if (e.kind === "New" && e.callee.kind === "Identifier" && e.callee.name === "Date" && isFree("Date")) {
      found = "new Date()";
      return;
    }
    if (e.kind === "Call" && e.callee === "fetch" && isFree("fetch")) {
      found = "fetch()";
      return;
    }
    forEachChildExpression(e, visit);
  };
  visit(expr);
  return found;
}
function findAsyncModifiers(source) {
  let tokens;
  try {
    tokens = tokenize(source);
  } catch {
    return [];
  }
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.type === "TemplateString") {
      for (const part of tok.parts ?? []) {
        if (part.kind !== "expr") continue;
        for (const loc of findAsyncModifiers(part.source)) {
          out.push({
            line: part.line + loc.line - 1,
            column: loc.line === 1 ? part.column + 2 + (loc.column - 1) : loc.column
          });
        }
      }
      continue;
    }
    if (tok.type !== "Keyword" || tok.value !== "async") continue;
    let prev;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (tokens[j].type !== "Newline") {
        prev = tokens[j];
        break;
      }
    }
    if (prev && (prev.value === "." || prev.value === "?.")) continue;
    let next;
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (tokens[j].type !== "Newline") {
        next = tokens[j];
        break;
      }
    }
    if (!next) continue;
    const modifies = next.type === "Keyword" && next.value === "function" || next.type === "Punctuation" && next.value === "(" || next.type === "Identifier" || next.type === "StateIdentifier";
    if (modifies) out.push({ line: tok.line, column: tok.column });
  }
  return out;
}
function checkJavaScriptSemantics(program, path, options = {}) {
  const text = options.source !== void 0 ? new SourceText(options.source) : void 0;
  const findings = [...new Analyzer(text).run(program).findings];
  if (options.source !== void 0) {
    for (const loc of findAsyncModifiers(options.source)) {
      findings.push({ code: "E102", severity: "error", message: MESSAGES.E102, loc });
    }
  }
  return toDiagnostics(findings, path);
}
function collectImportedStateMutations(program) {
  return new Analyzer().run(program).importedMutations;
}
function asyncModifierDiagnostic(loc, path) {
  return { severity: "error", message: MESSAGES.E102, line: loc.line, column: loc.column, path, code: "E102" };
}
function toDiagnostics(findings, path) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const sorted = [...findings].sort(
    (a, b) => a.loc.line - b.loc.line || a.loc.column - b.loc.column || a.code.localeCompare(b.code)
  );
  for (const f of sorted) {
    const key = `${f.code}:${f.loc.line}:${f.loc.column}:${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ severity: f.severity, message: f.message, line: f.loc.line, column: f.loc.column, path, code: f.code });
  }
  return out;
}
function lowerJavaScriptSemantics(program) {
  const analysis = new Analyzer().run(program);
  let counter = 0;
  for (const binding of analysis.bindings) {
    if (binding.state || !LOCAL_KINDS.has(binding.kind)) continue;
    counter += 1;
    binding.symbol = `__l${counter}_${binding.name}`;
  }
  for (const ref of analysis.refs) {
    const symbol = ref.binding?.symbol;
    if (symbol !== void 0 && ref.rename) ref.rename(symbol);
  }
  for (const stmt of program.statements) if (stmt.kind === "ComponentDeclaration") stmt.javascript = true;
  for (const call of analysis.positionalCalls) call.positional = true;
  liftNestedFunctions(program);
  appendImplicitReturns(program);
  return program;
}
function liftNestedFunctions(program) {
  const lists = [];
  walk(program, ({ node }) => {
    if (node.kind === "Block" && Array.isArray(node.body)) lists.push(node.body);
    else if (node.kind === "SwitchStatement") for (const c of node.cases) lists.push(c.body);
  });
  for (const list of lists) {
    for (let i = 0; i < list.length; i += 1) {
      const stmt = list[i];
      if (stmt.kind === "ActionDeclaration") list[i] = nestedFunctionAsLambda(stmt);
    }
  }
}
function nestedFunctionAsLambda(decl) {
  const lambda = {
    kind: "Lambda",
    params: decl.params.map((p) => {
      const out2 = { name: p.name };
      if (p.defaultValue) out2.defaultValue = p.defaultValue;
      if (p.rest) out2.rest = true;
      if (p.pattern) out2.pattern = p.pattern;
      return out2;
    }),
    body: decl.body,
    // So coverage and DevTools still call it by the name the author wrote.
    name: decl.name
  };
  if (decl.loc) lambda.loc = decl.loc;
  const out = {
    kind: "Assignment",
    identifier: decl.name,
    isState: false,
    expression: lambda,
    declaration: "const"
  };
  if (decl.loc) out.loc = decl.loc;
  if (decl.leadingComments) out.leadingComments = decl.leadingComments;
  if (decl.trailingComments) out.trailingComments = decl.trailingComments;
  return out;
}
function appendImplicitReturns(program) {
  const bodies = [];
  walk(program, ({ node }) => {
    if (node.kind === "ComponentDeclaration" || node.kind === "ActionDeclaration" || node.kind === "HookDeclaration") {
      bodies.push(node.body);
    } else if (node.kind === "Lambda" && node.body.kind === "Block") {
      bodies.push(node.body);
    }
  });
  for (const body of bodies) {
    const last = body.body[body.body.length - 1];
    if (last && (last.kind === "Return" || last.kind === "ThrowStatement")) continue;
    body.body.push({ kind: "Return" });
  }
}
const aktionFrontend = {
  language: "aktion",
  compile(source) {
    return { program: parse(source), diagnostics: [], aktionSource: source };
  }
};
function compileJavaScriptModule(code, path, options = {}) {
  const parseOptions = { statementBlocks: true, allowUnsupportedWords: true };
  if (options.softNewlines && options.softNewlines.size > 0) parseOptions.softNewlines = options.softNewlines;
  const parsed = parse(code, parseOptions);
  if (parsed.errors.length > 0) {
    const asyncAt = new Map(findAsyncModifiers(code).map((loc) => [`${loc.line}:${loc.column}`, loc]));
    const replaced = [];
    const errors = parsed.errors.filter((e) => {
      const loc = asyncAt.get(`${e.line}:${e.column}`);
      if (!loc) return true;
      replaced.push(asyncModifierDiagnostic(loc, path));
      return false;
    });
    return { program: { ...parsed, errors }, diagnostics: replaced, aktionSource: code };
  }
  const normalized = normalizeComponentForms(parsed);
  const diagnostics = checkJavaScriptSemantics(normalized, path, { source: code });
  if (diagnostics.some((d) => d.severity === "error")) {
    return { program: normalized, diagnostics, aktionSource: code };
  }
  const importedStateMutations = collectImportedStateMutations(normalized);
  const program = lowerJavaScriptSemantics(normalized);
  return {
    program,
    diagnostics,
    aktionSource: code,
    ...importedStateMutations.length > 0 ? { importedStateMutations } : {}
  };
}
const javascriptFrontend = {
  language: "javascript",
  compile(source, path) {
    return compileJavaScriptModule(source, path);
  }
};
const defaultFrontends = {
  aktion: aktionFrontend,
  javascript: javascriptFrontend
};
const UNLOADED = "\0unloaded";
function exportKey(name, isState) {
  return isState === true ? `$${name}` : name;
}
const LANGUAGE_LABEL = {
  aktion: "Aktion",
  javascript: "JavaScript",
  typescript: "TypeScript"
};
function baseName(path) {
  const suffixStart = path.search(/[?#]/);
  const clean = suffixStart < 0 ? path : path.slice(0, suffixStart);
  const slash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return slash < 0 ? clean : clean.slice(slash + 1);
}
function nativeImportMessage(spec, resolvedPath) {
  const name = baseName(resolvedPath);
  const stem = name.replace(/\.(?:[cm]?[jt]sx?|json|css|wasm)$/i, "");
  const suggestion = /\.(?:[cm]?ts|tsx)$/i.test(name) ? `${stem}.aktion.ts` : `${stem}.aktion.js`;
  return `"${spec}" is not an Aktion module. Aktion modules end in .aktion, .aktion.ts or .aktion.js — rename it to ${suggestion} to write it as Aktion, or keep it native and pass values in from the host (importing native modules is not supported yet).`;
}
function typeOnlyNativeImportMessage(spec, names) {
  const list = names.join(", ");
  return `Every name in this import is a type (\`import { type ${names[0] ?? "T"} }\`), so erasing the types leaves \`import {} from "${spec}"\`, which still loads "${spec}" — and Aktion cannot import native code. Write \`import type { ${list} } from "${spec}"\`: a type-only import is erased completely.`;
}
function inlineTypeOnlyNames(source, line, column) {
  let offset = 0;
  for (let l = 1; l < line; l += 1) {
    const next = source.indexOf("\n", offset);
    if (next === -1) return null;
    offset = next + 1;
  }
  const match = /^import\s*\{([^}]*)\}\s*from\b/.exec(source.slice(offset + column - 1));
  if (!match) return null;
  const entries = match[1].split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (entries.length === 0 || !entries.every((entry) => /^type\s/.test(entry))) return null;
  return entries.map((entry) => entry.replace(/^type\s+/, ""));
}
function linkProgram(entrySource, entryPath, resolver, options = {}) {
  const frontends = options.frontends ?? defaultFrontends;
  const modules = /* @__PURE__ */ new Map();
  const order = [];
  const visiting = /* @__PURE__ */ new Set();
  const diagnostics = [];
  let nextId = 0;
  const report = (path2, line, column, message, severity, code) => {
    const diagnostic = {
      line,
      column,
      message: path2 === entryPath ? message : `${path2}: ${message}`,
      severity,
      path: path2
    };
    if (code) diagnostic.code = code;
    diagnostics.push(diagnostic);
  };
  const fail = (path2, line, column, message, code) => report(path2, line, column, message, "error", code);
  function load(path2, sourceOverride, language) {
    const existing = modules.get(path2);
    if (existing) return existing;
    if (visiting.has(path2)) return void 0;
    visiting.add(path2);
    let src;
    if (sourceOverride !== null) {
      src = sourceOverride;
    } else {
      try {
        src = resolver.load(path2);
      } catch {
        visiting.delete(path2);
        fail(entryPath, 0, 0, `Failed to load imported module "${path2}".`, "AKT-LINK-LOAD");
        return void 0;
      }
    }
    const frontend = frontends[language];
    if (!frontend) {
      visiting.delete(path2);
      fail(
        path2,
        0,
        0,
        `"${path2}" is a ${LANGUAGE_LABEL[language]} Aktion module, but no ${language} frontend is configured — compile it with aktion-runtime/vite, or pass a ${language} frontend to linkProgram (loadTypeScriptFrontend() from aktion-runtime/vite).`,
        "AKT-LINK-NO-FRONTEND"
      );
      return void 0;
    }
    let compiled;
    try {
      compiled = frontend.compile(src, path2);
    } catch (err) {
      visiting.delete(path2);
      fail(path2, 0, 0, `Failed to compile "${path2}": ${err?.message ?? String(err)}`, "AKT-LINK-FRONTEND");
      return void 0;
    }
    const { program: program2 } = compiled;
    for (const e of program2.errors) fail(path2, e.line, e.column, e.message);
    for (const d of compiled.diagnostics) {
      report(path2, d.line, d.column, d.message, d.severity, d.code);
    }
    const rec = {
      id: nextId++,
      path: path2,
      language,
      originalSource: src,
      aktionSource: compiled.aktionSource,
      program: program2,
      edges: [],
      builtinImports: [],
      declaredPlain: /* @__PURE__ */ new Set(),
      declaredState: /* @__PURE__ */ new Set(),
      exportRefs: /* @__PURE__ */ new Map(),
      stars: [],
      starFailed: false,
      renamePlain: /* @__PURE__ */ new Map(),
      renameState: /* @__PURE__ */ new Map(),
      importedStateMutations: compiled.importedStateMutations ?? []
    };
    modules.set(path2, rec);
    buildSymbolTable(rec);
    for (const stmt of program2.statements) {
      if (stmt.kind !== "Import" && !(stmt.kind === "ExportList" && stmt.source !== void 0)) continue;
      const source = stmt.source;
      const line = stmt.loc?.line ?? 0;
      const column = stmt.loc?.column ?? 0;
      if (source === DSL_MODULE_ID) {
        if (stmt.kind === "ExportList") {
          if (stmt.all) rec.starFailed = true;
          fail(path2, line, column, "Built-ins from aktion-runtime/dsl cannot be re-exported — import them where you use them.", "AKT-LINK-EXPORT");
          continue;
        }
        checkBuiltinImport(rec, stmt, fail);
        rec.builtinImports.push(stmt);
        continue;
      }
      const resolved = resolver.resolve(source, path2);
      if (resolved === null) {
        if (stmt.kind === "ExportList" && stmt.all) rec.starFailed = true;
        rec.edges.push({ stmt, resolvedPath: null });
        const why = resolver.explain?.(source, path2);
        fail(path2, line, column, `Cannot resolve import "${source}".${why ? ` ${why}` : ""}`, "AKT-LINK-RESOLVE");
        continue;
      }
      const language2 = moduleLanguage(resolved);
      if (language2 === null) {
        if (stmt.kind === "ExportList" && stmt.all) rec.starFailed = true;
        rec.edges.push({ stmt, resolvedPath: null });
        if (isReservedAktionPath(resolved)) {
          fail(
            path2,
            line,
            column,
            `"${source}": JSX Aktion modules (.aktion.tsx / .aktion.jsx) are not supported yet — use .aktion.ts or .aktion.js.`,
            "AKT-LINK-JSX"
          );
        } else {
          const typeNames = rec.language === "typescript" && stmt.kind === "Import" && stmt.specifiers.length === 0 ? inlineTypeOnlyNames(src, line, column) : null;
          fail(
            path2,
            line,
            column,
            typeNames ? typeOnlyNativeImportMessage(source, typeNames) : nativeImportMessage(source, resolved),
            "AKT-LINK-NATIVE"
          );
        }
        continue;
      }
      rec.edges.push({ stmt, resolvedPath: resolved });
      if (!load(resolved, null, language2) && !modules.has(resolved) && stmt.kind === "ExportList" && stmt.all) {
        rec.starFailed = true;
      }
    }
    visiting.delete(path2);
    order.push(path2);
    return rec;
  }
  let entryLanguage = moduleLanguage(entryPath);
  if (entryLanguage === null) {
    if (isNativeModulePath(entryPath)) {
      report(
        entryPath,
        1,
        1,
        `Aktion entry "${baseName(entryPath)}" has a JavaScript extension; rename it to ${baseName(entryPath).replace(/\.[^.]+$/, "")}.aktion (or .aktion.js for JavaScript semantics). It is linked as an .aktion module for now.`,
        "warning",
        "AKT-LINK-NATIVE-ENTRY"
      );
    } else {
      fail(
        entryPath,
        1,
        1,
        `"${baseName(entryPath)}": JSX Aktion modules (.aktion.tsx / .aktion.jsx) are not supported yet — use .aktion.ts or .aktion.js.`,
        "AKT-LINK-JSX"
      );
    }
    entryLanguage = "aktion";
  }
  load(entryPath, entrySource, entryLanguage);
  for (const rec of modules.values()) {
    if (rec.path === entryPath) continue;
    for (const name of rec.declaredPlain) rec.renamePlain.set(name, moduleLocalSymbol(rec.id, name));
    for (const name of rec.declaredState) rec.renameState.set(name, moduleLocalSymbol(rec.id, name));
  }
  const edgeSource = (rec) => (stmt) => rec.edges.find((e) => e.stmt === stmt)?.resolvedPath ?? null;
  for (const rec of modules.values()) collectExports(rec, fail, edgeSource(rec));
  const memo = /* @__PURE__ */ new Map();
  const path = /* @__PURE__ */ new Set();
  let cutCycles = 0;
  const resolveExport = (rec, key) => {
    const visit = `${rec.path}\0${key}`;
    const known = memo.get(visit);
    if (known !== void 0) return known;
    if (path.has(visit)) {
      cutCycles += 1;
      return "cycle";
    }
    path.add(visit);
    const before = cutCycles;
    const result = resolveExportUncached(rec, key);
    path.delete(visit);
    if (cutCycles === before) memo.set(visit, result);
    return result;
  };
  const resolveExportUncached = (rec, key) => {
    const ref = rec.exportRefs.get(key);
    if (ref) {
      if (ref.from === null) return { rec, name: ref.name };
      const target = modules.get(ref.from);
      return target ? resolveExport(target, exportKey(ref.name, key.startsWith("$"))) : "opaque";
    }
    const origins = /* @__PURE__ */ new Map();
    let opaque = rec.starFailed;
    for (const star of rec.stars) {
      const target = modules.get(star);
      if (!target) {
        opaque = true;
        continue;
      }
      const found = resolveExport(target, key);
      if (found === "ambiguous") return found;
      if (found === "opaque") opaque = true;
      else if (found !== "missing" && found !== "cycle") origins.set(`${found.rec.path}\0${found.name}`, found);
    }
    if (origins.size > 1) return "ambiguous";
    return origins.values().next().value ?? (opaque ? "opaque" : "missing");
  };
  const exportProblem = (rec, found, key, source, line, column) => {
    if (found === "opaque") return;
    fail(
      rec.path,
      line,
      column,
      found === "ambiguous" ? `"${source}" exports \`${key}\` from more than one module through \`export *\` — export it by name to choose one.` : found === "cycle" ? `"${source}" re-exports \`${key}\` in a cycle of re-exports that never reaches a declaration.` : `"${source}" does not export \`${key}\`.`,
      "AKT-LINK-EXPORT"
    );
  };
  for (const rec of modules.values()) {
    for (const { stmt, resolvedPath } of rec.edges) {
      if (stmt.kind !== "ExportList" || resolvedPath === null) continue;
      const src = modules.get(resolvedPath);
      if (!src) continue;
      for (const spec of stmt.specifiers) {
        const key = exportKey(spec.local, spec.isState);
        const found = resolveExport(src, key);
        if (typeof found === "string") {
          const at = spec.loc ?? stmt.loc;
          exportProblem(rec, found, key, stmt.source, at?.line ?? 0, at?.column ?? 0);
        }
      }
    }
  }
  const exportSymbol = (src, name, renames) => renames.get(name) ?? (src.path === entryPath ? name : moduleLocalSymbol(src.id, name));
  for (const rec of modules.values()) {
    for (const { stmt, resolvedPath } of rec.edges) {
      if (resolvedPath === null || stmt.kind !== "Import") continue;
      const src = modules.get(resolvedPath);
      if (!src) continue;
      for (const spec of stmt.specifiers) {
        const line = stmt.loc?.line ?? 0;
        const column = stmt.loc?.column ?? 0;
        const key = exportKey(spec.imported, spec.isState);
        const found = resolveExport(src, key);
        if (typeof found === "string") {
          exportProblem(rec, found, key, stmt.source, line, column);
          continue;
        }
        if (spec.isState) {
          rec.renameState.set(spec.local, exportSymbol(found.rec, found.name, found.rec.renameState));
        } else {
          rec.renamePlain.set(spec.local, exportSymbol(found.rec, found.name, found.rec.renamePlain));
        }
      }
    }
  }
  for (const rec of modules.values()) {
    for (const mutation of rec.importedStateMutations) {
      const edge = rec.edges.find((e) => e.stmt.source === mutation.source && e.resolvedPath !== null);
      const exporter = edge ? modules.get(edge.resolvedPath) : void 0;
      const found = exporter ? resolveExport(exporter, `$${mutation.imported}`) : void 0;
      if (found && typeof found !== "string" && importedStateMutationApplies({ ...mutation, imported: found.name }, found.rec.program)) {
        fail(rec.path, mutation.line, mutation.column, mutation.message, "E108");
      }
    }
  }
  const merged = [];
  const sources = [entryPath];
  const sourceIndex = /* @__PURE__ */ new Map([[entryPath, 0]]);
  for (const path2 of order) {
    if (sourceIndex.has(path2)) continue;
    sourceIndex.set(path2, sources.length);
    sources.push(path2);
  }
  const multiModule = sources.length > 1;
  for (const path2 of order) {
    const rec = modules.get(path2);
    const renamer = makeRenamer(rec);
    const index = sourceIndex.get(path2);
    for (const stmt of rec.program.statements) {
      if (stmt.kind === "Import" || stmt.kind === "ExportList") continue;
      renamer.renameTopLevel(stmt);
      stripExported(stmt);
      if (multiModule) stampSourceIndex(stmt, index);
      if (stmt.kind === "EffectDeclaration" && rec.path !== entryPath) {
        stmt.name = `__effect_a${rec.id}_${stmt.name.replace(/^__effect_/, "")}`;
      }
      merged.push(stmt);
    }
  }
  const entryRec = modules.get(entryPath);
  const program = {
    statements: merged,
    errors: entryRec ? entryRec.program.errors : []
  };
  if (multiModule) program.sources = sources;
  const linkedModules = [];
  for (const path2 of sources) {
    const rec = modules.get(path2);
    if (!rec) continue;
    linkedModules.push({
      path: rec.path,
      language: rec.language,
      originalSource: rec.originalSource,
      aktionSource: rec.aktionSource
    });
  }
  return {
    program,
    diagnostics,
    dependencies: order.filter((p) => p !== entryPath),
    modules: linkedModules
  };
}
function checkBuiltinImport(rec, stmt, fail) {
  const line = stmt.loc?.line ?? 0;
  const column = stmt.loc?.column ?? 0;
  for (const spec of stmt.specifiers) {
    const sigil = spec.isState ? "$" : "";
    if (spec.local !== spec.imported) {
      fail(
        rec.path,
        line,
        column,
        `Import Aktion built-ins by their own name (\`${sigil}${spec.imported}\`); aliases are not supported.`,
        "E122"
      );
      continue;
    }
    const declared = spec.isState ? rec.declaredState.has(spec.local) : rec.declaredPlain.has(spec.local);
    if (declared) {
      fail(
        rec.path,
        line,
        column,
        `\`${sigil}${spec.local}\` is imported from aktion-runtime/dsl and also declared here — remove one.`,
        "E123"
      );
    }
  }
}
function buildSymbolTable(rec) {
  for (const stmt of rec.program.statements) {
    switch (stmt.kind) {
      case "Assignment":
        if (stmt.isState) {
          rec.declaredState.add(stmt.identifier);
          if (stmt.exported) rec.exportRefs.set(`$${stmt.identifier}`, { name: stmt.identifier, from: null });
        } else {
          rec.declaredPlain.add(stmt.identifier);
          if (stmt.exported) rec.exportRefs.set(stmt.identifier, { name: stmt.identifier, from: null });
        }
        break;
      case "ComponentDeclaration":
      case "ActionDeclaration":
        rec.declaredPlain.add(stmt.name);
        if (stmt.exported) rec.exportRefs.set(stmt.name, { name: stmt.name, from: null });
        break;
      case "HookDeclaration":
        rec.declaredState.add(stmt.name);
        if (stmt.exported) rec.exportRefs.set(`$${stmt.name}`, { name: stmt.name, from: null });
        break;
      case "DestructureStatement":
        for (const name of collectPatternNames({ kind: stmt.patternKind, bindings: stmt.bindings })) {
          rec.declaredPlain.add(name);
        }
        break;
    }
  }
}
function collectExports(rec, fail, resolved) {
  const imported = /* @__PURE__ */ new Set();
  for (const { stmt } of rec.edges) {
    if (stmt.kind === "Import") for (const spec of stmt.specifiers) imported.add(exportKey(spec.local, spec.isState));
  }
  for (const stmt of rec.program.statements) {
    if (stmt.kind !== "ExportList") continue;
    const line = stmt.loc?.line ?? 0;
    const column = stmt.loc?.column ?? 0;
    if (stmt.all) {
      const from2 = resolved(stmt);
      if (from2 !== null) rec.stars.push(from2);
      continue;
    }
    const from = stmt.source === void 0 ? null : resolved(stmt) ?? UNLOADED;
    for (const spec of stmt.specifiers) {
      const specLine = spec.loc?.line ?? line;
      const specColumn = spec.loc?.column ?? column;
      const key = exportKey(spec.exported, spec.isState);
      if (from === null) {
        const localKey = exportKey(spec.local, spec.isState);
        const declared = spec.isState ? rec.declaredState : rec.declaredPlain;
        if (!declared.has(spec.local)) {
          fail(
            rec.path,
            specLine,
            specColumn,
            imported.has(localKey) ? `\`${localKey}\` is imported, not declared in this module — re-export it with \`export { ${localKey} } from "…"\`.` : `Cannot export \`${localKey}\`: this module declares no top-level \`${localKey}\`.`,
            "AKT-LINK-EXPORT"
          );
          continue;
        }
      }
      if (rec.exportRefs.has(key)) {
        fail(rec.path, specLine, specColumn, `\`${key}\` is exported more than once.`, "AKT-LINK-EXPORT");
        continue;
      }
      rec.exportRefs.set(key, { name: spec.local, from });
    }
  }
}
function stripExported(stmt) {
  if (stmt.kind === "Assignment" || stmt.kind === "ComponentDeclaration" || stmt.kind === "ActionDeclaration" || stmt.kind === "HookDeclaration") {
    delete stmt.exported;
  }
}
function makeRenamer(rec) {
  const shadow = [];
  const shadowed = (name) => {
    for (const set of shadow) if (set.has(name)) return true;
    return false;
  };
  const rPlain = (name) => shadowed(name) ? name : rec.renamePlain.get(name) ?? name;
  const rState = (name) => rec.renameState.get(name) ?? name;
  const push = (names) => {
    shadow.push(new Set(names));
  };
  const pop = () => {
    shadow.pop();
  };
  const patternNames = (p) => collectPatternNames(p);
  const paramNames = (params) => {
    const out = [];
    for (const p of params) {
      if (p.name) out.push(p.name);
      if (p.pattern) out.push(...patternNames(p.pattern));
    }
    return out;
  };
  const renameParamDefaults = (params) => {
    for (const p of params) if (p.defaultValue) renameExpr(p.defaultValue);
  };
  function renameExpr(expr) {
    switch (expr.kind) {
      case "Literal":
        return;
      case "Identifier":
        expr.name = rPlain(expr.name);
        return;
      case "StateRef":
        expr.name = rState(expr.name);
        return;
      case "Array":
        for (const el of expr.elements) renameExpr(el);
        return;
      case "Object":
        for (const prop of expr.properties) {
          if (prop.computedKey) renameExpr(prop.computedKey);
          renameExpr(prop.value);
        }
        return;
      case "Member":
        renameExpr(expr.object);
        if (expr.computed) renameExpr(expr.computed);
        return;
      case "Unary":
        renameExpr(expr.argument);
        return;
      case "Binary":
        renameExpr(expr.left);
        renameExpr(expr.right);
        return;
      case "Ternary":
        renameExpr(expr.test);
        renameExpr(expr.consequent);
        renameExpr(expr.alternate);
        return;
      case "Call":
        expr.callee = rPlain(expr.callee);
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "MethodCall":
        renameExpr(expr.object);
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "Invoke":
        renameExpr(expr.callee);
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "BuiltinCall":
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "New":
        renameExpr(expr.callee);
        for (const a of expr.arguments) renameExpr(a);
        return;
      case "Template":
        for (const e of expr.expressions) renameExpr(e);
        return;
      case "Spread":
        renameExpr(expr.argument);
        return;
      case "Lambda":
        push(expr.selfName ? [expr.selfName, ...paramNames(expr.params)] : paramNames(expr.params));
        renameParamDefaults(expr.params);
        renameExpr(expr.body);
        pop();
        return;
      case "Block":
        renameBlock(expr);
        return;
    }
  }
  function renameBlock(block) {
    push([]);
    const scope = shadow[shadow.length - 1];
    for (const stmt of block.body) {
      renameStatement(stmt, false);
      addBlockLocals(stmt, scope);
    }
    pop();
  }
  function addBlockLocals(stmt, scope) {
    if (stmt.kind === "DestructureStatement") {
      for (const name of collectPatternNames({ kind: stmt.patternKind, bindings: stmt.bindings })) scope.add(name);
    } else if (stmt.kind === "ComponentDeclaration" || stmt.kind === "ActionDeclaration") {
      scope.add(stmt.name);
    }
  }
  function renameTopLevel(stmt) {
    if (stmt.kind === "DestructureStatement") {
      renameExpr(stmt.expression);
      const renamePatternBindings = (bindings, kind) => {
        for (const b of bindings) {
          if (b.defaultValue) renameExpr(b.defaultValue);
          if (b.pattern) {
            renamePatternBindings(b.pattern.bindings, b.pattern.kind);
            continue;
          }
          const renamed = rPlain(b.name);
          if (kind === "object" && !b.rest && b.sourceKey === void 0 && renamed !== b.name) {
            b.sourceKey = b.name;
          }
          b.name = renamed;
        }
      };
      renamePatternBindings(stmt.bindings, stmt.patternKind);
      return;
    }
    renameStatement(stmt, true);
  }
  function renameStatement(stmt, topLevel) {
    switch (stmt.kind) {
      case "Import":
      case "ExportList":
        return;
      case "Assignment":
        stmt.identifier = stmt.isState ? rState(stmt.identifier) : rPlain(stmt.identifier);
        renameExpr(stmt.expression);
        return;
      case "ComponentDeclaration":
      case "ActionDeclaration":
        stmt.name = rPlain(stmt.name);
        push(paramNames(stmt.params));
        renameParamDefaults(stmt.params);
        renameBlock(stmt.body);
        pop();
        return;
      case "HookDeclaration":
        stmt.name = rState(stmt.name);
        push(paramNames(stmt.params));
        renameParamDefaults(stmt.params);
        renameBlock(stmt.body);
        pop();
        return;
      case "EffectDeclaration":
        for (const t of stmt.triggers) if (t.kind === "state") t.name = rState(t.name);
        renameBlock(stmt.body);
        return;
      case "Await":
        renameExpr(stmt.argument);
        return;
      case "Return":
        if (stmt.argument) renameExpr(stmt.argument);
        return;
      case "ExpressionStatement":
        renameExpr(stmt.expression);
        return;
      case "IfStatement":
        renameExpr(stmt.test);
        renameBlock(stmt.consequent);
        if (stmt.alternate) {
          if (stmt.alternate.kind === "IfStatement") renameStatement(stmt.alternate, false);
          else renameBlock(stmt.alternate);
        }
        return;
      case "SwitchStatement":
        renameExpr(stmt.discriminant);
        for (const c of stmt.cases) {
          if (c.test) renameExpr(c.test);
          for (const s of c.body) renameStatement(s, false);
        }
        return;
      case "ForOfStatement": {
        renameExpr(stmt.iterable);
        const names = stmt.pattern ? collectPatternNames(stmt.pattern) : [stmt.item];
        push(names);
        renameBlock(stmt.body);
        pop();
        return;
      }
      case "ForInStatement":
        renameExpr(stmt.iterable);
        push([stmt.item]);
        renameBlock(stmt.body);
        pop();
        return;
      case "ForClassicStatement": {
        const initNames = [];
        if (stmt.init && stmt.init.kind === "Assignment" && stmt.init.identifier) {
          initNames.push(stmt.init.identifier);
        }
        push(initNames);
        if (stmt.init) renameStatement(stmt.init, false);
        if (stmt.test) renameExpr(stmt.test);
        if (stmt.update) renameExpr(stmt.update);
        renameBlock(stmt.body);
        pop();
        return;
      }
      case "WhileStatement":
      case "DoWhileStatement":
        renameExpr(stmt.test);
        renameBlock(stmt.body);
        return;
      case "DestructureStatement":
        renameExpr(stmt.expression);
        for (const b of stmt.bindings) if (b.defaultValue) renameExpr(b.defaultValue);
        if (topLevel) for (const b of stmt.bindings) b.name = rPlain(b.name);
        return;
      case "ThrowStatement":
        renameExpr(stmt.argument);
        return;
      case "TryStatement":
        renameBlock(stmt.block);
        if (stmt.catchBlock) {
          push(stmt.catchParam ? [stmt.catchParam] : []);
          renameBlock(stmt.catchBlock);
          pop();
        }
        if (stmt.finallyBlock) renameBlock(stmt.finallyBlock);
        return;
      case "BreakStatement":
      case "ContinueStatement":
        return;
    }
  }
  return { renameTopLevel };
}
function componentParamPublicName(param) {
  return param.publicName ?? param.name;
}
function hasRestParam(params) {
  return params.length > 0 && params[params.length - 1].rest === true;
}
const IDENTIFIER_KEY = /^[A-Za-z_$][\w$]*$/;
function trailingPropsArgument(args, params) {
  let index = -1;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (args[i].kind === "Object") {
      index = i;
      break;
    }
  }
  if (index < 0) return null;
  const object = args[index];
  const publicNames = new Set(params.map(componentParamPublicName));
  let named = false;
  let keys = 0;
  let identifierKeys = true;
  for (const prop of object.properties) {
    if (prop.spread) continue;
    keys += 1;
    if (prop.key === "key" || publicNames.has(prop.key)) named = true;
    if (!IDENTIFIER_KEY.test(prop.key)) identifierKeys = false;
  }
  if (!named && identifierKeys && keys > 0 && !hasRestParam(params) && args.length - 1 >= params.length) {
    named = true;
  }
  return { index, named };
}
function positionalKeyArguments(args, params) {
  const out = [];
  const rest = hasRestParam(params);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.kind !== "Object") continue;
    const keyOnly = i === args.length - 1 && arg.properties.length === 1 && !arg.properties[0].spread && arg.properties[0].key === "key";
    if (keyOnly || i >= params.length && !rest) out.push(i);
  }
  return out;
}
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NEEDS_ESCAPE_DOUBLE = /[\\"\n\r\t]/;
const NEEDS_ESCAPE_SINGLE = /[\\'\n\r\t]/;
const PREC = {
  /**
   * Arrow and `function` expressions, and an assignment: a concise arrow body
   * runs to the end of the enclosing expression, so these print bare only in
   * a full-expression position (an argument, element, property value,
   * statement expression, ternary branch, interpolation, …).
   */
  lambda: 0,
  ternary: 1,
  /** `||` and `??` share one level in this grammar (`parseLogicalOr`). */
  logicalOr: 2,
  logicalAnd: 3,
  bitwiseOr: 4,
  bitwiseXor: 5,
  bitwiseAnd: 6,
  equality: 7,
  /** `<` `>` `<=` `>=` `in` `instanceof`. */
  relational: 8,
  shift: 9,
  additive: 10,
  multiplicative: 11,
  /** `**`, right-associative; its base is a unary operand (`parseExponent`). */
  exponent: 12,
  /** Prefix operators: `!x`, `-x`, `typeof x`, `++x`, `await x`. */
  unary: 13,
  /** `x++` / `x--`. */
  postfix: 14,
  /** Member access, calls, `new X()`, and every primary. */
  member: 15
};
const BINARY_PRECEDENCE = {
  "||": PREC.logicalOr,
  "??": PREC.logicalOr,
  "&&": PREC.logicalAnd,
  "|": PREC.bitwiseOr,
  "^": PREC.bitwiseXor,
  "&": PREC.bitwiseAnd,
  "==": PREC.equality,
  "!=": PREC.equality,
  "===": PREC.equality,
  "!==": PREC.equality,
  "<": PREC.relational,
  ">": PREC.relational,
  "<=": PREC.relational,
  ">=": PREC.relational,
  in: PREC.relational,
  instanceof: PREC.relational,
  "<<": PREC.shift,
  ">>": PREC.shift,
  ">>>": PREC.shift,
  "+": PREC.additive,
  "-": PREC.additive,
  "*": PREC.multiplicative,
  "/": PREC.multiplicative,
  "%": PREC.multiplicative,
  "**": PREC.exponent
};
const LIBRARY_COMPONENTS = new Set(manifest.components.map((c) => c.name));
function componentsOf(statements) {
  const out = /* @__PURE__ */ new Map();
  for (const stmt of statements) if (stmt.kind === "ComponentDeclaration") out.set(stmt.name, stmt);
  return out;
}
const DEFAULT_INDENT_WIDTH = 2;
function resolveFormatOptions(program, options) {
  const unit = (() => {
    const width = DEFAULT_INDENT_WIDTH;
    if (!Number.isInteger(width) || width < 0) {
      throw new RangeError(
        `FormatOptions.indentWidth must be a non-negative integer, got ${width}`
      );
    }
    return " ".repeat(width);
  })();
  return {
    unit,
    quote: '"',
    trailingComma: false,
    objectCurlySpacing: true,
    calls: { topLevel: componentsOf(program.statements), nested: [], enclosing: [] }
  };
}
function pad(indent, opts) {
  return opts.unit.repeat(indent);
}
function printPattern(pattern, indent, opts) {
  const open = pattern.kind === "array" ? "[" : "{";
  const close = pattern.kind === "array" ? "]" : "}";
  const key = (k) => PLAIN_KEY.test(k) ? k : printStringLiteral(k, opts);
  const parts = pattern.bindings.map((b) => {
    const lead = b.rest ? "..." : "";
    const target = b.pattern ? pattern.kind === "object" && b.sourceKey ? `${key(b.sourceKey)}: ${printPattern(b.pattern, indent, opts)}` : printPattern(b.pattern, indent, opts) : b.sourceKey ? `${key(b.sourceKey)}: ${b.name}` : b.name || "";
    const def = b.defaultValue ? ` = ${printExpression(b.defaultValue, indent, opts)}` : "";
    return `${lead}${target}${def}`;
  });
  return `${open}${parts.join(", ")}${close}`;
}
function printProgram(program, options) {
  const opts = resolveFormatOptions(program);
  const lines = [];
  let prev = null;
  for (const stmt of program.statements) {
    const forceBlankLine = prev !== null && needsBlankLineBetween(prev, stmt);
    lines.push(printStatementWithComments(stmt, 0, opts, forceBlankLine));
    prev = stmt;
  }
  return lines.join("\n") + "\n";
}
function needsBlankLineBetween(prev, next) {
  const heavy = /* @__PURE__ */ new Set([
    "ComponentDeclaration",
    "EffectDeclaration",
    "ActionDeclaration",
    "HookDeclaration"
  ]);
  if (heavy.has(prev.kind) || heavy.has(next.kind)) return true;
  return false;
}
function printCommentGroup(comments, indent, opts) {
  const padStr = pad(indent, opts);
  const lines = [];
  for (const c of comments) {
    if (c.blankLineBefore) lines.push("");
    lines.push(`${padStr}${c.text}`);
  }
  return lines;
}
function printStatementWithComments(stmt, indent, opts, forceBlankLineBefore) {
  const lines = [];
  const leading = stmt.leadingComments;
  if (leading && leading.length > 0) {
    if (forceBlankLineBefore || leading[0].blankLineBefore) lines.push("");
    const padStr = pad(indent, opts);
    for (let i = 0; i < leading.length; i += 1) {
      const c = leading[i];
      if (i > 0 && c.blankLineBefore) lines.push("");
      lines.push(`${padStr}${c.text}`);
    }
  } else if (forceBlankLineBefore) {
    lines.push("");
  }
  const stmtText = printStatement(stmt, indent, opts);
  const trailing = stmt.trailingComments;
  if (trailing && trailing.length > 0) {
    lines.push(`${stmtText} ${trailing.map((c) => c.text).join(" ")}`);
  } else {
    lines.push(stmtText);
  }
  return lines.join("\n");
}
function printStatement(stmt, indent, opts) {
  const padStr = pad(indent, opts);
  const exp = "exported" in stmt && stmt.exported ? "export " : "";
  switch (stmt.kind) {
    case "Import": {
      const specs = stmt.specifiers.map((s) => {
        const imported = s.isState ? `$${s.imported}` : s.imported;
        if (s.local === s.imported) return imported;
        const local = s.isState ? `$${s.local}` : s.local;
        return `${imported} as ${local}`;
      }).join(", ");
      return `${padStr}import { ${specs} } from ${printStringLiteral(stmt.source, opts)}`;
    }
    case "ExportList": {
      const from = stmt.source === void 0 ? "" : ` from ${printStringLiteral(stmt.source, opts)}`;
      if (stmt.all) return `${padStr}export *${from}`;
      const specs = stmt.specifiers.map((s) => {
        const local = s.isState ? `$${s.local}` : s.local;
        if (s.exported === s.local) return local;
        return `${local} as ${s.isState ? `$${s.exported}` : s.exported}`;
      }).join(", ");
      return `${padStr}export { ${specs} }${from}`;
    }
    case "Assignment": {
      const lhs = stmt.isState ? `$${stmt.identifier}` : stmt.identifier;
      if (stmt.uninitialized) return `${padStr}${exp}${stmt.declaration ?? "let"} ${lhs}`;
      const expr = printExpression(stmt.expression, indent, opts);
      const kw = stmt.declaration ? `${stmt.declaration} ` : "";
      return `${padStr}${exp}${kw}${lhs} = ${expr}`;
    }
    case "ComponentDeclaration": {
      const params = printDeclParams(stmt.params, opts);
      const head = `${padStr}${exp}function ${stmt.name}(${params}) {`;
      opts.calls.enclosing.push(stmt.name);
      let body;
      try {
        body = printBlockBody(stmt.body, indent + 1, opts);
      } finally {
        opts.calls.enclosing.pop();
      }
      return body.length > 0 ? `${head}
${body}
${padStr}}` : `${head}
${padStr}}`;
    }
    case "EffectDeclaration": {
      const deps = stmt.triggers.map((t) => printTrigger(t, opts)).filter((s) => s.length > 0);
      if (stmt.rateLimit) {
        deps.push(printStringLiteral(`${stmt.rateLimit.kind}(${stmt.rateLimit.ms})`, opts));
      }
      const body = printBlockBody(stmt.body, indent + 1, opts);
      const depsArray = `[${deps.join(", ")}]`;
      return `${padStr}$effect(() => {
${body}
${padStr}}, ${depsArray})`;
    }
    case "ActionDeclaration": {
      const params = printDeclParams(stmt.params, opts);
      const head = `${padStr}${exp}function ${stmt.name}(${params}) {`;
      const body = printBlockBody(stmt.body, indent + 1, opts);
      return `${head}
${body}
${padStr}}`;
    }
    case "HookDeclaration": {
      const params = printDeclParams(stmt.params, opts);
      const head = `${padStr}${exp}function $${stmt.name}(${params}) {`;
      const body = printBlockBody(stmt.body, indent + 1, opts);
      return `${head}
${body}
${padStr}}`;
    }
    case "Await": {
      return `${padStr}await ${printExpression(stmt.argument, indent, opts)}`;
    }
    case "Return": {
      return stmt.argument ? `${padStr}return ${afterKeyword(printExpression(stmt.argument, indent, opts))}` : `${padStr}return`;
    }
    case "ExpressionStatement": {
      if (stmt.exportDefault) return `${padStr}export default ${printExpression(stmt.expression, indent, opts)}`;
      const text = printExpression(stmt.expression, indent, opts);
      return /^(?:function\b|await\b|\{)/.test(text) ? `${padStr}(${text})` : `${padStr}${text}`;
    }
    case "IfStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const cons = `{
${printBlockBody(stmt.consequent, indent + 1, opts)}
${padStr}}`;
      if (!stmt.alternate) return `${padStr}if (${test}) ${cons}`;
      const alt = stmt.alternate.kind === "IfStatement" ? printStatement(stmt.alternate, indent, opts).trimStart() : `{
${printBlockBody(stmt.alternate, indent + 1, opts)}
${padStr}}`;
      return `${padStr}if (${test}) ${cons} else ${alt}`;
    }
    case "SwitchStatement": {
      const disc = printExpression(stmt.discriminant, indent, opts);
      const cases = stmt.cases.map((c) => printSwitchCase(c, indent + 1, opts)).join("\n");
      return `${padStr}switch (${disc}) {
${cases}
${padStr}}`;
    }
    case "ForOfStatement": {
      const iter = afterKeyword(printExpression(stmt.iterable, indent, opts));
      const body = `{
${printBlockBody(stmt.body, indent + 1, opts)}
${padStr}}`;
      const binding = stmt.pattern ? printPattern(stmt.pattern, indent, opts) : stmt.item;
      return `${padStr}for (${stmt.declaration ?? "let"} ${binding} of ${iter}) ${body}`;
    }
    case "ForClassicStatement": {
      const init = stmt.init ? printStatement(stmt.init, 0, opts).trimStart() : "";
      const test = stmt.test ? printExpression(stmt.test, indent, opts) : "";
      const update = stmt.update ? printExpression(stmt.update, indent, opts) : "";
      const body = `{
${printBlockBody(stmt.body, indent + 1, opts)}
${padStr}}`;
      return `${padStr}for (${init}; ${test}; ${update}) ${body}`;
    }
    case "WhileStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const body = `{
${printBlockBody(stmt.body, indent + 1, opts)}
${padStr}}`;
      return `${padStr}while (${test}) ${body}`;
    }
    case "DoWhileStatement": {
      const test = printExpression(stmt.test, indent, opts);
      const body = `{
${printBlockBody(stmt.body, indent + 1, opts)}
${padStr}}`;
      return `${padStr}do ${body} while (${test})`;
    }
    case "ForInStatement": {
      const iter = afterKeyword(printExpression(stmt.iterable, indent, opts));
      const body = `{
${printBlockBody(stmt.body, indent + 1, opts)}
${padStr}}`;
      return `${padStr}for (${stmt.declaration ?? "let"} ${stmt.item} in ${iter}) ${body}`;
    }
    case "DestructureStatement": {
      const pattern = printPattern({ kind: stmt.patternKind, bindings: stmt.bindings }, indent, opts);
      const expr = printExpression(stmt.expression, indent, opts);
      return `${padStr}${stmt.declaration ?? "let"} ${pattern} = ${expr}`;
    }
    case "BreakStatement":
      return `${padStr}break`;
    case "ContinueStatement":
      return `${padStr}continue`;
    case "ThrowStatement":
      return `${padStr}throw ${afterKeyword(printExpression(stmt.argument, indent, opts))}`;
    case "TryStatement": {
      const block = `{
${printBlockBody(stmt.block, indent + 1, opts)}
${padStr}}`;
      let out = `${padStr}try ${block}`;
      if (stmt.catchBlock) {
        const catchHead = stmt.catchParam ? ` (${stmt.catchParam})` : "";
        const catchBody = `{
${printBlockBody(stmt.catchBlock, indent + 1, opts)}
${padStr}}`;
        out += ` catch${catchHead} ${catchBody}`;
      }
      if (stmt.finallyBlock) {
        const finBody = `{
${printBlockBody(stmt.finallyBlock, indent + 1, opts)}
${padStr}}`;
        out += ` finally ${finBody}`;
      }
      return out;
    }
  }
}
function printDeclParams(params, opts) {
  return params.map((p) => printParam(p, 0, opts)).join(", ");
}
function printParam(p, indent, opts) {
  const rest = p.rest ? "..." : "";
  const target = p.pattern ? printPattern(p.pattern, indent, opts) : p.name;
  const def = p.defaultValue ? ` = ${printExpression(p.defaultValue, indent, opts)}` : "";
  return `${rest}${target}${def}`;
}
function printTrigger(t, opts) {
  if (t.kind === "lifecycle") return printStringLiteral(t.name, opts);
  if (t.kind === "every") return printStringLiteral(`every(${t.intervalMs})`, opts);
  if (t.kind === "state") return `$${t.name}`;
  return "";
}
function printBlock(stmts, indent, opts) {
  const nested = componentsOf(stmts);
  if (nested.size === 0) return stmts.map((s) => printStatementWithComments(s, indent, opts, false)).join("\n");
  opts.calls.nested.push(nested);
  try {
    return stmts.map((s) => printStatementWithComments(s, indent, opts, false)).join("\n");
  } finally {
    opts.calls.nested.pop();
  }
}
function printBlockBody(block, indent, opts) {
  if (block.body.length === 0 && block.innerComments && block.innerComments.length > 0) {
    return printCommentGroup(block.innerComments, indent, opts).join("\n");
  }
  return printBlock(block.body, indent, opts);
}
function printDesugaredOperator(expr, indent, opts) {
  const literalOperator = (arg) => arg && arg.kind === "Literal" && typeof arg.value === "string" ? arg.value : null;
  switch (expr.name) {
    case "__rui_assign__": {
      const [target, value, opNode] = expr.arguments;
      const op = literalOperator(opNode);
      if (!target || !value || op === null) return null;
      return `${printOperand(target, PREC.member, indent, opts)} ${op} ${printExpression(value, indent, opts)}`;
    }
    case "__rui_postfix__": {
      const [target, opNode] = expr.arguments;
      const op = literalOperator(opNode);
      if (!target || op === null) return null;
      return `${printOperand(target, PREC.member, indent, opts)}${op}`;
    }
    case "__rui_prefix__": {
      const [target, opNode] = expr.arguments;
      const op = literalOperator(opNode);
      if (!target || op === null) return null;
      return `${op}${printOperand(target, PREC.unary, indent, opts)}`;
    }
    case "__rui_await__": {
      const [argument] = expr.arguments;
      if (!argument) return null;
      return `await (${printExpression(argument, indent, opts)})`;
    }
    default:
      return null;
  }
}
function precedenceOf(expr) {
  switch (expr.kind) {
    case "Lambda":
      return PREC.lambda;
    case "Ternary":
      return PREC.ternary;
    case "Binary":
      return BINARY_PRECEDENCE[expr.operator];
    case "Unary":
      return PREC.unary;
    case "BuiltinCall":
      switch (expr.name) {
        case "__rui_assign__":
          return PREC.lambda;
        case "__rui_prefix__":
        case "__rui_await__":
          return PREC.unary;
        case "__rui_postfix__":
          return PREC.postfix;
        default:
          return PREC.member;
      }
    default:
      return PREC.member;
  }
}
function printOperand(expr, min, indent, opts) {
  const text = printExpression(expr, indent, opts);
  return precedenceOf(expr) < min ? `(${text})` : text;
}
function printReceiver(expr, indent, opts) {
  const text = printExpression(expr, indent, opts);
  const group = precedenceOf(expr) < PREC.member || expr.kind === "Literal" && typeof expr.value === "number";
  return group ? `(${text})` : text;
}
function isNegativeNumber(expr) {
  return expr.kind === "Literal" && typeof expr.value === "number" && (expr.value < 0 || Object.is(expr.value, -0));
}
function afterKeyword(text) {
  return /^-[\d.]/.test(text) ? `(${text})` : text;
}
function mixesNullish(operator, operand) {
  if (operand.kind !== "Binary") return false;
  if (operator === "??") return operand.operator === "||" || operand.operator === "&&";
  return (operator === "||" || operator === "&&") && operand.operator === "??";
}
function isNewCallee(expr) {
  if (expr.kind === "Identifier" || expr.kind === "StateRef") return true;
  return expr.kind === "Member" && expr.optional !== true && isNewCallee(expr.object);
}
function printExpression(expr, indent, opts) {
  switch (expr.kind) {
    case "Literal":
      return printLiteral(expr.value, opts);
    case "Identifier":
      return expr.name;
    case "StateRef":
      return `$${expr.name}`;
    case "Array": {
      if (expr.elements.length === 0) return "[]";
      const items = expr.elements.map((e) => printExpression(e, indent + 1, opts));
      const inline = `[${items.join(", ")}]`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const innerPad = pad(indent + 1, opts);
      const body = items.map((s) => `${innerPad}${s}`).join(",\n");
      const trailingComma = opts.trailingComma ? "," : "";
      return `[
${body}${trailingComma}
${pad(indent, opts)}]`;
    }
    case "Object": {
      if (expr.properties.length === 0) return "{}";
      const items = expr.properties.map((p) => printObjectProp(p, indent + 1, opts));
      const inline = opts.objectCurlySpacing ? `{ ${items.join(", ")} }` : `{${items.join(", ")}}`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const innerPad = pad(indent + 1, opts);
      const body = items.map((s) => `${innerPad}${s}`).join(",\n");
      const trailingComma = opts.trailingComma ? "," : "";
      return `{
${body}${trailingComma}
${pad(indent, opts)}}`;
    }
    case "Member": {
      const obj = printReceiver(expr.object, indent, opts);
      const dot = expr.optional ? "?." : ".";
      if (expr.property) return `${obj}${dot}${expr.property}`;
      if (expr.computed) {
        const inner = printExpression(expr.computed, indent, opts);
        return expr.optional ? `${obj}?.[${inner}]` : `${obj}[${inner}]`;
      }
      return obj;
    }
    case "Unary": {
      const argument = printOperand(expr.argument, PREC.unary, indent, opts);
      if (/^[a-z]/.test(expr.operator)) return `${expr.operator} ${afterKeyword(argument)}`;
      const spaced = (expr.operator === "-" || expr.operator === "+") && argument.startsWith(expr.operator) || expr.operator === "-" && /^[\d.]/.test(argument);
      return `${expr.operator}${spaced ? " " : ""}${argument}`;
    }
    case "Binary": {
      const precedence = BINARY_PRECEDENCE[expr.operator];
      const exponent = expr.operator === "**";
      const leftText = printExpression(expr.left, indent, opts);
      const rightText = printExpression(expr.right, indent, opts);
      const groupLeft = precedenceOf(expr.left) < (exponent ? PREC.postfix : precedence) || mixesNullish(expr.operator, expr.left) || exponent && isNegativeNumber(expr.left);
      const groupRight = precedenceOf(expr.right) < (exponent ? precedence : precedence + 1) || mixesNullish(expr.operator, expr.right);
      const left = groupLeft ? `(${leftText})` : leftText;
      const right = groupRight ? `(${rightText})` : rightText;
      const keyword = expr.operator === "in" || expr.operator === "instanceof";
      return `${left} ${expr.operator} ${keyword ? afterKeyword(right) : right}`;
    }
    case "Ternary": {
      const test = printOperand(expr.test, PREC.logicalOr, indent, opts);
      return `${test} ? ${printExpression(expr.consequent, indent, opts)} : ${printExpression(expr.alternate, indent, opts)}`;
    }
    case "Call":
      return printCallExpr(expr, indent, opts);
    case "MethodCall": {
      const target = printReceiver(expr.object, indent, opts);
      const sep2 = expr.optional ? "?." : ".";
      return printCall(`${target}${sep2}${expr.method}`, expr.arguments, indent, opts);
    }
    case "Invoke": {
      const byName = expr.callee.kind === "Identifier" || expr.callee.kind === "Member" && expr.callee.property !== void 0;
      const receiver = printReceiver(expr.callee, indent, opts);
      const callee = byName ? `(${receiver})` : receiver;
      const sep2 = expr.optional ? "?." : "";
      return printCall(`${callee}${sep2}`, expr.arguments, indent, opts);
    }
    case "New": {
      const text = printExpression(expr.callee, indent, opts);
      const callee = isNewCallee(expr.callee) ? text : `(${text})`;
      return `new ${printCall(callee, expr.arguments, indent, opts)}`;
    }
    case "BuiltinCall":
      return printDesugaredOperator(expr, indent, opts) ?? printCall(`@${expr.name}`, expr.arguments, indent, opts);
    case "Template":
      return printTemplate(expr.quasis, expr.expressions, indent, opts);
    case "Spread":
      return `...${printExpression(expr.argument, indent, opts)}`;
    case "Lambda":
      return printLambda(expr, indent, opts);
    case "Block":
      return `{
${printBlockBody(expr, indent + 1, opts)}
${pad(indent, opts)}}`;
  }
}
function printLambda(expr, indent, opts) {
  const params = expr.params.map((p) => printParam(p, indent, opts)).join(", ");
  if (expr.selfName !== void 0) {
    const body2 = expr.body.kind === "Block" ? expr.body : { kind: "Block", body: [{ kind: "Return", argument: expr.body }] };
    return `function ${expr.selfName}(${params}) ${printExpression(body2, indent, opts)}`;
  }
  const only = expr.params.length === 1 ? expr.params[0] : void 0;
  const head = only && !only.defaultValue && !only.rest && !only.pattern ? only.name : `(${params})`;
  if (expr.body.kind === "Block") return `${head} => ${printExpression(expr.body, indent, opts)}`;
  const body = printExpression(expr.body, indent, opts);
  return `${head} => ${body.startsWith("{") ? `(${body})` : body}`;
}
function printCall(callee, args, indent, opts) {
  if (args.length === 0) return `${callee}()`;
  const parts = args.map((a) => printExpression(a, indent + 1, opts));
  const inline = `${callee}(${parts.join(", ")})`;
  if (inline.length <= 80 && !parts.some((s) => s.includes("\n"))) return inline;
  const innerPad = pad(indent + 1, opts);
  return `${callee}(
${parts.map((s) => `${innerPad}${s}`).join(",\n")}
${pad(indent, opts)})`;
}
function printCallExpr(expr, indent, opts) {
  const decl = reachedComponent(expr.callee, opts.calls);
  if (!decl) return printCall(expr.callee, expr.arguments, indent, opts);
  if (expr.positional === true && decl.javascript === true) return printPositionalCall(expr, decl, indent, opts);
  return printCall(expr.callee, namedPropsByLocalName(expr.arguments, decl), indent, opts);
}
function reachedComponent(callee, scope) {
  if (LIBRARY_COMPONENTS.has(callee) && scope.enclosing.includes(callee)) return void 0;
  for (let i = scope.nested.length - 1; i >= 0; i -= 1) {
    const found = scope.nested[i].get(callee);
    if (found) return found;
  }
  return scope.topLevel.get(callee);
}
function namedPropsByLocalName(args, decl) {
  const localOf = /* @__PURE__ */ new Map();
  for (const p of decl.params) {
    if (p.name && p.publicName !== void 0 && p.publicName !== p.name) localOf.set(p.publicName, p.name);
  }
  if (localOf.size === 0) return args;
  const bag = trailingPropsArgument(args, decl.params);
  if (!bag || !bag.named) return args;
  const object = args[bag.index];
  const properties = object.properties.map((prop) => {
    if (prop.spread || prop.computedKey || prop.key === "key") return prop;
    const local = localOf.get(prop.key);
    return local === void 0 ? prop : { ...prop, key: local };
  });
  return args.map((arg, i) => i === bag.index ? { ...object, properties } : arg);
}
function ownKey(literal) {
  let value;
  let dynamic = false;
  for (const prop of literal.properties) {
    if (prop.spread || prop.computedKey) {
      dynamic = true;
    } else if (prop.key === "key") {
      value = prop.value;
      dynamic = false;
    }
  }
  if (dynamic) return "maybe";
  return value ?? "absent";
}
function isSideEffectFree(expr) {
  switch (expr.kind) {
    case "Literal":
    case "Identifier":
    case "StateRef":
    case "Lambda":
      return true;
    case "Template":
      return expr.expressions.every(isSideEffectFree);
    case "Member":
      return isSideEffectFree(expr.object) && (expr.computed === void 0 || isSideEffectFree(expr.computed));
    case "Unary":
      return expr.operator !== "delete" && isSideEffectFree(expr.argument);
    case "Binary":
      return isSideEffectFree(expr.left) && isSideEffectFree(expr.right);
    case "Ternary":
      return isSideEffectFree(expr.test) && isSideEffectFree(expr.consequent) && isSideEffectFree(expr.alternate);
    case "Spread":
      return isSideEffectFree(expr.argument);
    case "Array":
      return expr.elements.every(isSideEffectFree);
    case "Object":
      return expr.properties.every((p) => isSideEffectFree(p.value) && (p.computedKey === void 0 || isSideEffectFree(p.computedKey)));
    default:
      return false;
  }
}
function positionalKey(args, params) {
  const candidates = positionalKeyArguments(args, params);
  for (let c = candidates.length - 1; c >= 0; c -= 1) {
    const index = candidates[c];
    const own = ownKey(args[index]);
    if (own === "absent") continue;
    if (own === "maybe" || !args.slice(index).every(isSideEffectFree)) return { kind: "dynamic", candidates };
    return { kind: "static", value: own };
  }
  return { kind: "none" };
}
function printPositionalCall(expr, decl, indent, opts) {
  const key = positionalKey(expr.arguments, decl.params);
  if (key.kind === "dynamic") return printPositionalCallOnce(expr, key.candidates, indent, opts);
  const args = expr.arguments.map((arg) => arg.kind === "Object" ? { kind: "Spread", argument: { kind: "Array", elements: [arg] } } : arg);
  if (key.kind === "static") args.push({ kind: "Object", properties: [{ key: "key", value: key.value }] });
  return printCall(expr.callee, args, indent, opts);
}
function printPositionalCallOnce(expr, candidates, indent, opts) {
  const args = expr.arguments;
  const names = args.map((_, i) => `__arg${i}`);
  const ref = (i) => ({ kind: "Identifier", name: names[i] });
  let key;
  for (const index of candidates) {
    const own = ownKey(args[index]);
    if (own === "absent") continue;
    const read = { kind: "Member", object: ref(index), property: "key" };
    key = own === "maybe" ? {
      kind: "Ternary",
      test: { kind: "Binary", operator: "in", left: { kind: "Literal", value: "key" }, right: ref(index) },
      consequent: read,
      alternate: key ?? { kind: "Identifier", name: "undefined" }
    } : read;
  }
  const inner = args.map((arg, i) => arg.kind === "Spread" ? { kind: "Spread", argument: ref(i) } : ref(i));
  if (key) inner.push({ kind: "Object", properties: [{ key: "key", value: key }] });
  const call = {
    kind: "Lambda",
    params: names.map((name) => ({ name })),
    body: { kind: "Call", callee: expr.callee, arguments: inner }
  };
  const outer = args.map((arg) => arg.kind === "Spread" ? arg.argument : arg);
  return printExpression({ kind: "Invoke", callee: call, arguments: outer }, indent, opts);
}
function printSwitchCase(c, indent, opts) {
  const padStr = pad(indent, opts);
  const body = printBlock(c.body, indent + 1, opts);
  const head = c.test === null ? `${padStr}default:` : `${padStr}case ${afterKeyword(printExpression(c.test, indent, opts))}:`;
  const caseText = body.length > 0 ? `${head}
${body}` : head;
  if (!c.leadingComments || c.leadingComments.length === 0) return caseText;
  const header = printCommentGroup(c.leadingComments, indent, opts);
  return `${header.join("\n")}
${caseText}`;
}
function printObjectProp(prop, indent, opts) {
  if (prop.spread) return `...${printExpression(prop.value, indent, opts)}`;
  const name = prop.computedKey ? `[${printExpression(prop.computedKey, indent, opts)}]` : PLAIN_KEY.test(prop.key) ? prop.key : printStringLiteral(prop.key, opts);
  if (prop.method && prop.value.kind === "Lambda" && prop.value.body.kind === "Block") {
    const params = prop.value.params.map((p) => printParam(p, indent, opts)).join(", ");
    return `${name}(${params}) ${printExpression(prop.value.body, indent, opts)}`;
  }
  const value = printExpression(prop.value, indent, opts);
  if (!prop.computedKey && prop.value.kind === "Identifier" && prop.value.name === prop.key && PLAIN_KEY.test(prop.key)) {
    return prop.key;
  }
  return `${name}: ${value}`;
}
function printLiteral(value, opts) {
  if (value === null) return "null";
  if (typeof value === "string") return printStringLiteral(value, opts);
  if (typeof value === "boolean") return value ? "true" : "false";
  return Object.is(value, -0) ? "-0" : String(value);
}
function chooseQuote(value, opts) {
  const other = opts.quote === '"' ? "'" : '"';
  if (value.includes(opts.quote) && !value.includes(other)) return other;
  return opts.quote;
}
function printStringLiteral(value, opts) {
  const quote = chooseQuote(value, opts);
  const needsEscape = quote === '"' ? NEEDS_ESCAPE_DOUBLE.test(value) : NEEDS_ESCAPE_SINGLE.test(value);
  if (needsEscape) {
    const quoteEscape = quote === '"' ? /"/g : /'/g;
    const quoteReplacement = quote === '"' ? '\\"' : "\\'";
    const escaped = value.replace(/\\/g, "\\\\").replace(quoteEscape, quoteReplacement).replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    return `${quote}${escaped}${quote}`;
  }
  return `${quote}${value}${quote}`;
}
function printTemplateChunk(text) {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}
function printTemplate(quasis, expressions, indent, opts) {
  const parts = [];
  for (let i = 0; i < quasis.length; i += 1) {
    parts.push(printTemplateChunk(quasis[i] ?? ""));
    if (i < expressions.length) {
      parts.push("${");
      parts.push(printExpression(expressions[i], indent, opts));
      parts.push("}");
    }
  }
  return `\`${parts.join("")}\``;
}
const MISSING_ERASER_MESSAGE = "Compiling `.aktion.ts` needs the `ts-blank-space` package — `npm i -D ts-blank-space`.";
const isWhitespace = (ch) => ch === " " || ch === "	" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v" || ch === " " || ch === "\uFEFF";
function checkErasureInvariant(source, code) {
  if (code.length !== source.length) {
    return `type erasure changed the length of the module (${source.length} → ${code.length} characters) — please report this`;
  }
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n" !== (code[i] === "\n")) {
      return "type erasure moved a line break — please report this";
    }
  }
  return null;
}
function computeSoftNewlines(source, code) {
  const soft = /* @__PURE__ */ new Set();
  const erased = (i) => i >= 0 && i < source.length && code[i] !== source[i];
  const prevNonWs = new Int32Array(source.length);
  let last = -1;
  for (let i = 0; i < source.length; i += 1) {
    prevNonWs[i] = last;
    if (!isWhitespace(source[i])) last = i;
  }
  let next = -1;
  for (let i = source.length - 1; i >= 0; i -= 1) {
    if (source[i] === "\n" && erased(prevNonWs[i]) && erased(next)) soft.add(i);
    if (!isWhitespace(source[i])) next = i;
  }
  return soft;
}
function blankRange(text, start, end) {
  let out = "";
  for (let i = start; i < end; i += 1) {
    const ch = text[i];
    out += ch === "\n" || ch === "\r" ? ch : " ";
  }
  return text.slice(0, start) + out + text.slice(end);
}
function nonErasableMessage(ts, node) {
  const SK = ts.SyntaxKind;
  switch (node.kind) {
    case SK.EnumDeclaration:
      return 'TypeScript enums are not erasable — use a plain object (`const E = { A: "a" }`) or a string union.';
    case SK.ModuleDeclaration:
      return "TypeScript namespaces are not supported in Aktion modules — use an ordinary module.";
    case SK.Parameter:
    case SK.Constructor:
    case SK.PublicKeyword:
    case SK.PrivateKeyword:
    case SK.ProtectedKeyword:
    case SK.ReadonlyKeyword:
    case SK.OverrideKeyword:
      return "Parameter properties are not supported (Aktion has no classes).";
    case SK.ImportEqualsDeclaration:
    case SK.ExportAssignment:
      return "CommonJS-style TypeScript imports/exports are not supported — use `import { … } from`.";
    case SK.TypeAssertionExpression:
      return "Angle-bracket type assertions are not supported — use `expr as T` (it is erased).";
    case SK.Decorator:
      return "Decorators are not supported in Aktion modules.";
    default:
      return `This TypeScript syntax (${SK[node.kind]}) has runtime meaning and cannot be erased — rewrite it as plain JavaScript.`;
  }
}
function position(sf, offset) {
  const { line, character } = sf.getLineAndCharacterOfPosition(offset);
  return { line: line + 1, column: character + 1 };
}
function createBlankSpaceEraser(mod, ts) {
  const languageOptions = {
    languageVersion: ts.ScriptTarget.ESNext,
    impliedNodeFormat: ts.ModuleKind.ESNext
  };
  if (ts.JSDocParsingMode) {
    languageOptions.jsDocParsingMode = ts.JSDocParsingMode.ParseNone;
  }
  return (source, path) => {
    const diagnostics = [];
    let sf;
    try {
      sf = ts.createSourceFile(
        path,
        source,
        languageOptions,
        /* setParentNodes */
        false,
        ts.ScriptKind.TS
      );
    } catch (err) {
      return {
        code: source,
        diagnostics: [{ line: 1, column: 1, message: `TypeScript could not read this module: ${String(err)}`, code: "AKT-TS-SYNTAX" }]
      };
    }
    const parseDiagnostics = sf.parseDiagnostics ?? [];
    for (const d of parseDiagnostics) {
      diagnostics.push({
        ...position(sf, d.start ?? 0),
        message: `TypeScript syntax error: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
        code: "AKT-TS-SYNTAX"
      });
    }
    const rejected = [];
    const reject = (node) => {
      const start = node.getStart(sf);
      diagnostics.push({ ...position(sf, start), message: nonErasableMessage(ts, node), code: "AKT-TS-ERASE" });
      const end = ts.isTypeAssertionExpression(node) ? node.expression.getStart(sf) : node.getEnd();
      rejected.push([start, end]);
    };
    const findDecorators = (node) => {
      if (node.kind === ts.SyntaxKind.Decorator) {
        reject(node);
        return;
      }
      ts.forEachChild(node, findDecorators);
    };
    findDecorators(sf);
    let code;
    try {
      code = mod.blankSourceFile(sf, (node) => reject(node));
    } catch (err) {
      return {
        code: source,
        diagnostics: [...diagnostics, { line: 1, column: 1, message: `Type erasure failed: ${String(err)}`, code: "AKT-TS-ERASE" }]
      };
    }
    for (const [start, end] of rejected) code = blankRange(code, start, end);
    diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
    return { code, diagnostics };
  };
}
const EMPTY_PROGRAM = () => ({ statements: [], errors: [] });
function typeScriptFrontendFromEraser(eraser) {
  return {
    language: "typescript",
    compile(source, path) {
      let erased;
      try {
        erased = eraser(source, path);
      } catch (err) {
        return {
          program: EMPTY_PROGRAM(),
          diagnostics: [{ line: 1, column: 1, message: `Type erasure failed: ${String(err)}`, severity: "error", code: "AKT-TS-ERASE" }],
          aktionSource: source
        };
      }
      const toLink = (d) => ({
        line: d.line,
        column: d.column,
        message: d.message,
        severity: "error",
        ...d.code ? { code: d.code } : {}
      });
      const broken = checkErasureInvariant(source, erased.code);
      if (broken) {
        return {
          program: EMPTY_PROGRAM(),
          diagnostics: [...erased.diagnostics.map(toLink), { line: 1, column: 1, message: broken, severity: "error", code: "AKT-TS-ERASE" }],
          aktionSource: erased.code
        };
      }
      const result = compileJavaScriptModule(erased.code, path, {
        softNewlines: computeSoftNewlines(source, erased.code)
      });
      return {
        ...result,
        diagnostics: [...erased.diagnostics.map(toLink), ...result.diagnostics],
        aktionSource: erased.code
      };
    }
  };
}
function unavailableTypeScriptFrontend(message = MISSING_ERASER_MESSAGE) {
  return {
    language: "typescript",
    compile(source) {
      return {
        program: EMPTY_PROGRAM(),
        diagnostics: [{ line: 1, column: 1, message, severity: "error", code: "AKT-TS-MISSING" }],
        aktionSource: source
      };
    }
  };
}
function localRequire() {
  return createRequire(import.meta.url);
}
function typescriptOfBlankSpace(req) {
  const entry = req.resolve("ts-blank-space");
  return createRequire(entry)("typescript");
}
async function loadTypeScriptFrontend(options = {}) {
  if (options.eraser) return typeScriptFrontendFromEraser(options.eraser);
  const req = localRequire();
  const mod = await import("ts-blank-space");
  return typeScriptFrontendFromEraser(createBlankSpaceEraser(mod, typescriptOfBlankSpace(req)));
}
function createTypeScriptFrontend(options = {}) {
  if (options.eraser) return typeScriptFrontendFromEraser(options.eraser);
  const req = localRequire();
  let mod;
  try {
    mod = req("ts-blank-space");
  } catch (err) {
    const code = err.code;
    if (code === "ERR_REQUIRE_ESM" || code === "ERR_REQUIRE_ASYNC_MODULE") {
      throw new Error(
        "[aktion] This Node version cannot load `ts-blank-space` synchronously (require of an ES module needs Node ≥ 20.19 / 22.12). Use `await loadTypeScriptFrontend()` (or the *Async compile helpers) instead."
      );
    }
    throw new Error(`[aktion] ${MISSING_ERASER_MESSAGE}`);
  }
  return typeScriptFrontendFromEraser(createBlankSpaceEraser(mod, typescriptOfBlankSpace(req)));
}
async function tryLoadTypeScriptFrontend(options = {}) {
  try {
    return await loadTypeScriptFrontend(options);
  } catch {
    return unavailableTypeScriptFrontend();
  }
}
function tryCreateTypeScriptFrontend(options = {}) {
  try {
    return createTypeScriptFrontend(options);
  } catch (err) {
    return unavailableTypeScriptFrontend(err.message.replace(/^\[aktion\] /, ""));
  }
}
const DECLARATION_HEADER = "// Generated by aktion-dts";
const DEFAULT_DECLARATIONS_DIR = ".aktion-types";
const SKIPPED_DIRECTORIES = /* @__PURE__ */ new Set(["node_modules", ".git", "dist"]);
function declarationFileName(modulePath) {
  return modulePath.replace(/\.aktion$/i, ".d.aktion.ts");
}
const RESERVED_WORDS = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield await".split(" ")
);
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const propertyName = (key) => IDENTIFIER.test(key) ? key : JSON.stringify(key);
function aktionExportNames(program) {
  const names = /* @__PURE__ */ new Set();
  const listed = listedExports(program);
  for (const stmt of program.statements) {
    for (const name of exportNames(stmt, listed)) names.add(name);
    if (stmt.kind === "ExportList" && stmt.source !== void 0) {
      for (const spec of stmt.specifiers) names.add(spec.isState ? `$${spec.exported}` : spec.exported);
    }
  }
  return [...names];
}
function declaredKey(stmt) {
  switch (stmt.kind) {
    case "ComponentDeclaration":
    case "ActionDeclaration":
      return stmt.name;
    case "HookDeclaration":
      return `$${stmt.name}`;
    case "Assignment":
      return stmt.isState ? `$${stmt.identifier}` : stmt.identifier;
    default:
      return null;
  }
}
function listedExports(program) {
  const listed = /* @__PURE__ */ new Map();
  for (const stmt of program.statements) {
    if (stmt.kind !== "ExportList" || stmt.source !== void 0) continue;
    for (const spec of stmt.specifiers) {
      const key = spec.isState ? `$${spec.local}` : spec.local;
      listed.set(key, [...listed.get(key) ?? [], spec.isState ? `$${spec.exported}` : spec.exported]);
    }
  }
  return listed;
}
function exportNames(stmt, listed) {
  const key = declaredKey(stmt);
  if (key === null) return [];
  const own = "exported" in stmt && stmt.exported ? [key] : [];
  return [.../* @__PURE__ */ new Set([...own, ...listed.get(key) ?? []])];
}
function aktionDeclarationText(source, sourceName = "module.aktion") {
  const program = parse(source);
  const assigned = assignedValues(program);
  const taken = new Set(aktionExportNames(program));
  const byName = /* @__PURE__ */ new Map();
  const listed = listedExports(program);
  for (const stmt of program.statements) {
    for (const name of exportNames(stmt, listed)) {
      const declared = declare(stmt, name, assigned, taken);
      if (declared === null) continue;
      byName.delete(declared.name);
      byName.set(declared.name, declared);
    }
  }
  const forwarded = [];
  for (const stmt of program.statements) {
    if (stmt.kind !== "ExportList" || stmt.source === void 0) continue;
    if (stmt.all) {
      forwarded.push(`export * from ${JSON.stringify(stmt.source)};`);
      continue;
    }
    const specs = stmt.specifiers.map((s) => {
      const local2 = s.isState ? `$${s.local}` : s.local;
      return s.exported === s.local ? local2 : `${local2} as ${s.isState ? `$${s.exported}` : s.exported}`;
    });
    forwarded.push(`export { ${specs.join(", ")} } from ${JSON.stringify(stmt.source)};`);
  }
  const uses = /* @__PURE__ */ new Set(["CompiledProgram"]);
  const lines = [];
  for (const declared of byName.values()) {
    for (const type of declared.uses) uses.add(type);
    lines.push(...declared.lines);
  }
  const local = unusedName("compiled", taken);
  const text = [
    `${DECLARATION_HEADER} from ${sourceName} — do not edit.`,
    `import type { ${[...uses].sort().join(", ")} } from "aktion-runtime/dsl";`,
    "",
    ...lines,
    ...forwarded,
    ...lines.length + forwarded.length > 0 ? [""] : [],
    `declare const ${local}: CompiledProgram;`,
    `export default ${local};`,
    ""
  ].join("\n");
  return { text, errors: program.errors };
}
function declare(stmt, name, assigned, taken) {
  const uses = /* @__PURE__ */ new Set();
  switch (stmt.kind) {
    case "ComponentDeclaration":
      return { name, lines: componentOverloads(name, stmt.params, uses, stmt.name), uses };
    case "ActionDeclaration":
    case "HookDeclaration":
      return { name, lines: [`export declare function ${name}(${parameterList(stmt.params)}): any;`], uses };
    case "Assignment": {
      const mutable = stmt.isState || stmt.declaration === "let" || stmt.declaration === "var";
      const type = mutable ? bindingType(stmt.expression, assigned.get(declaredKey(stmt)) ?? [], uses) : valueType(stmt.expression, uses);
      return { name, lines: exportBinding(name, mutable ? "let" : "const", type, taken), uses };
    }
    default:
      return null;
  }
}
function unusedName(base, taken) {
  let name = base;
  while (taken.has(name) || RESERVED_WORDS.has(name)) name = `_${name}`;
  taken.add(name);
  return name;
}
function exportBinding(name, keyword, type, taken) {
  if (!RESERVED_WORDS.has(name)) return [`export declare ${keyword} ${name}: ${type};`];
  const local = unusedName(name, taken);
  return [`declare ${keyword} ${local}: ${type};`, `export { ${local} as ${name} };`];
}
function parameterNames(params) {
  const taken = new Set(params.map((p) => p.name).filter((n) => n !== ""));
  return params.map((p, i) => {
    let name = p.name || `p${i}`;
    if (p.name !== "" && !RESERVED_WORDS.has(name)) return name;
    while (taken.has(name) || RESERVED_WORDS.has(name)) name = `_${name}`;
    taken.add(name);
    return name;
  });
}
function parameterType(param) {
  if (param.pattern || !param.defaultValue) return "any";
  const type = valueType(param.defaultValue, /* @__PURE__ */ new Set());
  return type === "string" || type === "number" || type === "boolean" ? `${type} | null` : "any";
}
const optionalType = (type) => type === "any" ? "any" : `${type} | undefined`;
function parameterList(params) {
  const names = parameterNames(params);
  return params.map((p, i) => p.rest ? `...${names[i]}: any[]` : `${names[i]}?: ${parameterType(p)}`).join(", ");
}
function componentOverloads(name, params, uses, tag = name) {
  uses.add("AktionNode");
  const result = `AktionNode<${JSON.stringify(tag)}>`;
  const names = parameterNames(params);
  const types = params.map(parameterType);
  if (params.some((p) => p.rest)) {
    const list = params.map((p, i) => p.rest ? `...${names[i]}: any[]` : `${names[i]}?: ${types[i]}`).join(", ");
    return [`export declare function ${name}(${list}): ${result};`];
  }
  uses.add("Children");
  uses.add("Key");
  let children = "children";
  while (names.includes(children)) children = `_${children}`;
  let propsName = "props";
  while (names.includes(propsName) || propsName === children) propsName = `_${propsName}`;
  const rest = `...${children}: Children[]`;
  const keys = params.map((p) => p.pattern || (p.publicName ?? p.name) === "key" ? null : p.publicName ?? p.name);
  const props = `${name}Props`;
  const given = (from, to) => names.slice(from, to).map((n, i) => `${n}: ${optionalType(types[from + i])}`);
  const bag = (m) => {
    const parts = [props];
    const repeated = keys.slice(0, m).filter((key) => key !== null);
    if (repeated.length > 0) parts.push(`{ ${repeated.map((key) => `readonly ${propertyName(key)}?: never`).join("; ")} }`);
    if (m < params.length) {
      const members = ["{ readonly key: Key }"];
      for (let i = m; i < params.length; i += 1) {
        const key = keys[i];
        if (key !== null && key !== void 0) members.push(`{ readonly ${propertyName(key)}: ${optionalType(types[i])} }`);
      }
      parts.push(members.length === 1 ? members[0] : `(${members.join(" | ")})`);
    }
    return parts.join(" & ");
  };
  const lines = [
    `/** Named props of \`${name}\`: its parameters by name, \`key\`, and named slots (any other key). */`,
    `export interface ${props} {`,
    "  readonly key?: Key;",
    ...keys.flatMap((key, i) => key === null ? [] : [`  readonly ${propertyName(key)}?: ${types[i]};`]),
    "  readonly [slot: string]: unknown;",
    "}",
    `export declare function ${name}(${[...names.map((n, i) => `${n}?: ${types[i]}`), rest].join(", ")}): ${result};`
  ];
  for (let m = 0; m <= params.length; m += 1) {
    for (let k = 0; k <= m; k += 1) {
      const list = [...given(0, k), `${propsName}: ${bag(m)}`, ...given(k, m)];
      if (m === params.length) list.push(rest);
      lines.push(`export declare function ${name}(${list.join(", ")}): ${result};`);
    }
  }
  lines.push(
    `export declare function ${name}(...args: [${[...given(0, params.length), rest, `${propsName}: ${bag(params.length)}`].join(", ")}]): ${result};`
  );
  return lines;
}
const RESOURCE_TYPES = {
  http: "HttpResource",
  mutation: "MutationResource",
  socket: "SocketResource",
  sse: "SseResource",
  script: "ScriptResource"
};
const PRIMITIVES = /* @__PURE__ */ new Set(["string", "number", "boolean"]);
const grouped = (type) => type.startsWith("(") && type.includes("=>") ? `(${type})` : type;
function valueType(expr, uses) {
  switch (expr.kind) {
    case "Literal":
      if (expr.value === null) return "null";
      return typeof expr.value === "string" || typeof expr.value === "number" || typeof expr.value === "boolean" ? typeof expr.value : "any";
    case "Template":
      return "string";
    case "Unary":
      if ((expr.operator === "-" || expr.operator === "+") && expr.argument.kind === "Literal" && typeof expr.argument.value === "number") {
        return "number";
      }
      return expr.operator === "!" ? "boolean" : "any";
    case "Lambda":
      return "(...args: any[]) => any";
    case "Array":
      return arrayType([expr], uses);
    case "Object":
      return isShape(expr) ? objectType([expr], uses) : "any";
    case "Invoke":
      return expr.callee.kind === "StateRef" ? resourceType(expr.callee.name, expr.arguments, uses) : "any";
    default:
      return "any";
  }
}
const isShape = (expr) => expr.properties.every((p) => !p.spread && !p.computedKey);
function unionTypes(exprs, uses) {
  const objects = [];
  const arrays = [];
  const slots = [];
  for (const expr of exprs) {
    if (expr.kind === "Object" && isShape(expr)) {
      if (objects.length === 0) slots.push(objects);
      objects.push(expr);
    } else if (expr.kind === "Array") {
      if (arrays.length === 0) slots.push(arrays);
      arrays.push(expr);
    } else {
      slots.push(valueType(expr, uses));
    }
  }
  const types = slots.map(
    (slot) => typeof slot === "string" ? slot : slot === objects ? objectType(objects, uses) : arrayType(arrays, uses)
  );
  return [...new Set(types)];
}
function arrayType(arrays, uses) {
  const elements = arrays.flatMap((a) => a.elements);
  if (arrays.some((a) => a.elements.length === 0) || elements.some((e) => e.kind === "Spread")) return "any[]";
  const union = unionTypes(elements, uses);
  if (union.includes("any")) return "any[]";
  return union.length === 1 && IDENTIFIER.test(union[0]) ? `${union[0]}[]` : `Array<${union.map(grouped).join(" | ")}>`;
}
function objectType(objects, uses) {
  const values = /* @__PURE__ */ new Map();
  for (const obj of objects) {
    for (const prop of obj.properties) {
      const list = values.get(prop.key) ?? [];
      list.push(prop.value);
      values.set(prop.key, list);
    }
  }
  if (values.size === 0) return "Record<string, any>";
  const fields = [];
  for (const [key, exprs] of values) {
    const optional = objects.some((obj) => !obj.properties.some((p) => p.key === key));
    fields.push(`${propertyName(key)}${optional ? "?" : ""}: ${withNull(unionTypes(exprs, uses))}`);
  }
  return `{ ${fields.join("; ")} }`;
}
function withNull(types) {
  if (types.includes("any")) return "any";
  const known = types.filter((t) => t !== "null");
  if (known.length === 0) return "any";
  const nullable = types.includes("null");
  const ordered = known.length === 1 && !nullable ? known : known.map(grouped);
  if (nullable) ordered.push("null");
  return ordered.join(" | ");
}
function resourceType(builtin, args, uses) {
  const config = args[0]?.kind === "Object" ? args[0] : null;
  const field = (key) => config?.properties.find((p) => !p.spread && p.key === key)?.value;
  const use = (type) => {
    uses.add(type);
    return type;
  };
  if (RESOURCE_TYPES[builtin]) return `${use(RESOURCE_TYPES[builtin])}<unknown>`;
  if (builtin === "query") {
    if (config === null || config.properties.some((p) => p.spread)) return "any";
    const infinite = field("infinite");
    const off = infinite === void 0 || infinite.kind === "Literal" && (infinite.value === null || infinite.value === false);
    return off ? `${use("HttpResource")}<unknown>` : `${use("InfiniteQueryResource")}<unknown>`;
  }
  if (builtin === "form") {
    const values = field("values");
    const shape = values?.kind === "Object" ? valueType(values, uses) : "any";
    return shape.startsWith("{ ") ? `${use("FormHandle")}<${shape}>` : use("FormHandle");
  }
  if (builtin === "i18n") return use("I18nInstance");
  if (builtin === "theme") return use("ThemeHandle");
  return "any";
}
function bindingType(init, writes, uses) {
  const initial = valueType(init, /* @__PURE__ */ new Set());
  if (initial === "any") return "any";
  const primitive = PRIMITIVES.has(initial);
  const known = [init];
  for (const write of writes) {
    if (write === "member") return "any";
    if (write === "unknown" || valueType(write, /* @__PURE__ */ new Set()) === "any") {
      if (!primitive) return "any";
      continue;
    }
    known.push(write);
  }
  return withNull(unionTypes(known, uses));
}
const NUMBER = { kind: "Literal", value: 0 };
const MUTATORS = /* @__PURE__ */ new Set(["push", "unshift", "splice", "fill", "copyWithin"]);
function bindingKey(expr) {
  if (expr?.kind === "StateRef") return `$${expr.name}`;
  if (expr?.kind === "Identifier") return expr.name;
  return null;
}
function rootKey(expr) {
  let node = expr;
  while (node?.kind === "Member" || node?.kind === "MethodCall") node = node.object;
  return bindingKey(node);
}
function compoundValue(operator, value) {
  if (value === void 0) return "unknown";
  if (operator === "=" || operator === "??=" || operator === "||=" || operator === "&&=") return value;
  if (operator === "+=") return valueType(value, /* @__PURE__ */ new Set()) === "string" ? value : "unknown";
  return NUMBER;
}
function assignedValues(program) {
  const out = /* @__PURE__ */ new Map();
  const record = (key, value) => {
    if (key === null) return;
    const list = out.get(key) ?? [];
    list.push(value);
    out.set(key, list);
  };
  walk(program, ({ node }) => {
    switch (node.kind) {
      case "Assignment":
        record(node.isState ? `$${node.identifier}` : node.identifier, node.expression);
        break;
      case "BuiltinCall": {
        const [target, value, op] = node.arguments;
        if (node.name === "__rui_assign__") {
          const direct = bindingKey(target);
          if (direct !== null) record(direct, compoundValue(op?.kind === "Literal" ? op.value : "=", value));
          else record(rootKey(target), "member");
        } else if (node.name === "__rui_prefix__" || node.name === "__rui_postfix__") {
          const direct = bindingKey(target);
          if (direct !== null) record(direct, NUMBER);
          else record(rootKey(target), "member");
        }
        break;
      }
      case "Unary":
        if (node.operator === "delete" && node.argument.kind === "Member") record(rootKey(node.argument), "member");
        break;
      case "MethodCall":
        if (MUTATORS.has(node.method)) record(rootKey(node.object), "member");
        if (node.object.kind === "Identifier" && node.object.name === "Object" && node.method === "assign") {
          record(rootKey(node.arguments[0]), "member");
        }
        break;
    }
  });
  return out;
}
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += /[\\^$.|+()[\]{}]/.test(ch) ? `\\${ch}` : ch;
    }
  }
  return new RegExp(`^${re}$`);
}
const toPosix = (p) => p.split(sep).join("/");
function walkFiles(dir, skip, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (skip.has(full)) continue;
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(name)) walkFiles(full, skip, out);
    } else if (stats.isFile()) {
      out.push(full);
    }
  }
}
function isInside(path, dir) {
  const rel = relative(dir, path);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
function resolveOptions(options) {
  const root = resolve(options.root ?? process.cwd());
  const outDir = resolve(root, options.outDir ?? DEFAULT_DECLARATIONS_DIR);
  const include = options.include ?? ["src/**/*.aktion"];
  const warnings = [];
  for (const glob of include) {
    if (glob.startsWith("../") || glob.startsWith("/") || isAbsolute(glob)) {
      warnings.push(
        `include "${glob}" matches nothing: globs are relative to the root (${root}) and cannot leave it. Declare a shared library through \`alias\` (aktion.config.json), or run aktion-dts with --root in the library.`
      );
    }
  }
  const mirrorRoot = outDir === root ? join(root, DEFAULT_DECLARATIONS_DIR) : outDir;
  const aliases = [];
  for (const [prefix, target] of Object.entries(options.alias ?? {})) {
    const segments = prefix.replace(/\/+$/, "").split("/");
    if (isAbsolute(prefix) || segments.some((s) => s === "" || s === "." || s === "..")) {
      warnings.push(`alias "${prefix}" cannot be mirrored as a directory; its modules are not declared.`);
      continue;
    }
    aliases.push({ target: resolve(root, target), mirror: join(mirrorRoot, ...segments) });
  }
  return {
    root,
    outDir,
    include: include.map(globToRegExp),
    exclude: (options.exclude ?? []).map(globToRegExp),
    aliases,
    write: options.write !== false,
    warnings
  };
}
const isModule = (file) => /\.aktion$/i.test(file);
const excluded = (file, o) => o.exclude.some((re) => re.test(toPosix(relative(o.root, file))));
function isDeclared(file, o) {
  if (!isModule(file)) return false;
  const rel = toPosix(relative(o.root, file));
  if (rel.startsWith("..")) return false;
  return o.include.some((re) => re.test(rel)) && !excluded(file, o);
}
function targetsOf(file, o) {
  const targets = [];
  if (isDeclared(file, o)) targets.push(join(o.outDir, declarationFileName(relative(o.root, file))));
  if (isModule(file) && !excluded(file, o)) {
    for (const { target, mirror } of o.aliases) {
      if (isInside(file, target)) targets.push(join(mirror, declarationFileName(relative(target, file))));
    }
  }
  return targets;
}
function emitOne(file, target, o, result) {
  const { text, errors } = aktionDeclarationText(readFileSync(file, "utf8"), toPosix(relative(o.root, file)));
  for (const e of errors) {
    if (!result.diagnostics.some((d) => d.path === file && d.line === e.line && d.column === e.column && d.message === e.message)) {
      result.diagnostics.push({ path: file, line: e.line, column: e.column, message: e.message });
    }
  }
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current === text) {
    result.unchanged.push(target);
  } else {
    result.written.push(target);
    if (o.write) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  }
}
function isGenerated(file) {
  if (!file.endsWith(".d.aktion.ts")) return false;
  try {
    return readFileSync(file, "utf8").slice(0, DECLARATION_HEADER.length) === DECLARATION_HEADER;
  } catch {
    return false;
  }
}
function emitAktionDeclarations(options = {}) {
  const o = resolveOptions(options);
  const result = { written: [], unchanged: [], removed: [], diagnostics: [], warnings: [...o.warnings] };
  const files = [];
  walkFiles(o.root, /* @__PURE__ */ new Set([o.outDir]), files);
  for (const { target } of o.aliases) if (!isInside(target, o.root)) walkFiles(target, /* @__PURE__ */ new Set(), files);
  const targets = /* @__PURE__ */ new Set();
  for (const file of [...new Set(files)].sort()) {
    for (const target of targetsOf(file, o)) {
      if (targets.has(target)) continue;
      targets.add(target);
      emitOne(file, target, o, result);
    }
  }
  const existing = [];
  walkFiles(o.outDir === o.root ? o.root : o.outDir, /* @__PURE__ */ new Set(), existing);
  for (const file of existing) {
    if (targets.has(file) || !isGenerated(file)) continue;
    result.removed.push(file);
    if (o.write) rmSync(file, { force: true });
  }
  return result;
}
function updateAktionDeclaration(file, options = {}) {
  const o = resolveOptions(options);
  const result = { written: [], unchanged: [], removed: [], diagnostics: [], warnings: [] };
  const absolute = resolve(file);
  for (const target of targetsOf(absolute, o)) {
    if (existsSync(absolute)) {
      emitOne(absolute, target, o, result);
    } else if (existsSync(target)) {
      result.removed.push(target);
      if (o.write) rmSync(target, { force: true });
    }
  }
  return result;
}
const TYPESCRIPT_DISABLED_MESSAGE = "`.aktion.ts` modules are disabled by the plugin option `typescript: false`.";
const VITE_ASSET_QUERY = /[?&](?:raw|url|inline|no-inline|worker|sharedworker)(?:[=&#]|$)/;
const AKTION_ID_FILTER = new RegExp(`^(?!.*${VITE_ASSET_QUERY.source}).*\\.aktion(?:\\.[jt]s)?(?:[?#]|$)`);
const AKTION_TS_ID = /\.aktion\.ts(?:[?#]|$)/;
function viteMajorOf(ctx) {
  const version = ctx?.meta?.viteVersion;
  if (typeof version !== "string") return void 0;
  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) ? major : void 0;
}
function aktionViteConfig(user, viteMajor) {
  const out = { optimizeDeps: { exclude: [DSL_MODULE_ID, `${DSL_MODULE_ID}-globals`] } };
  const key = viteMajor !== void 0 && viteMajor >= 8 ? "oxc" : "esbuild";
  const current = user[key];
  if (current !== false) {
    const userExclude = current && typeof current === "object" ? current.exclude : void 0;
    out[key] = { exclude: userExclude === void 0 ? [/\.js$/, AKTION_TS_ID] : [AKTION_TS_ID] };
  }
  return out;
}
function aktionPlugin(options = {}) {
  const runtimeModuleId = options.runtimeModuleId ?? "aktion-runtime";
  let isServe = false;
  let projectRoot = process.cwd();
  let resolution = options;
  let typescriptFrontend = null;
  const declarationOptions = () => ({
    alias: absoluteAliasTargets(resolution.alias),
    ...typeof options.dts === "object" ? options.dts : {}
  });
  const loadTypeScript = () => {
    if (options.typescript === false) return Promise.resolve(unavailableTypeScriptFrontend(TYPESCRIPT_DISABLED_MESSAGE));
    typescriptFrontend ??= tryLoadTypeScriptFrontend(options.typescript ?? {});
    return typescriptFrontend;
  };
  const transform = {
    // Vite ≥ 6.3 / Rollup ≥ 4.38 skip non-matching ids before calling the
    // handler; Vite 5's dev server ignores `filter`, so the handler re-checks.
    filter: { id: AKTION_ID_FILTER },
    async handler(code, id) {
      if (!isAktionId(id) || VITE_ASSET_QUERY.test(id)) return null;
      const cleanId = stripQuery(id);
      const frontends = { ...defaultFrontends, typescript: await loadTypeScript() };
      const result = linkProgram(
        code,
        cleanId,
        createNodeResolver({
          ...resolution,
          root: options.allowOutsideRoot === true ? null : projectRoot
        }),
        { frontends }
      );
      for (const dep of result.dependencies) this.addWatchFile(dep);
      const diagnostics = collectDiagnostics(result.program, result.diagnostics);
      const fatal = diagnostics.filter((d) => d.severity === "error" || options.strict && d.severity === "warning");
      if (fatal.length > 0) {
        const first = fatal[0];
        const file = first.path ?? cleanId;
        return this.error({
          message: fatal.length === 1 ? first.message : fatal.map(formatDiagnostic).join("\n"),
          id: file,
          loc: { file, line: first.line, column: first.column }
        });
      }
      for (const w of diagnostics) {
        if (w.severity === "warning") this.warn(w.message);
      }
      const moduleCode = emitModule(result, code, cleanId, runtimeModuleId, { sourcesContent: options.devtools !== false }) + (isServe ? hostOnlyExports(result, frontends, displayPath(cleanId, projectRoot)) + HMR_FOOTER : "");
      return { code: moduleCode, map: buildSourceMap(moduleCode, cleanId, code), moduleType: "js" };
    }
  };
  const plugin = {
    name: "aktion",
    enforce: "pre",
    config(user) {
      return aktionViteConfig(user, viteMajorOf(this));
    },
    configResolved(config) {
      isServe = config.command === "serve";
      if (config.root) projectRoot = resolve(config.root);
      resolution = options.config === false ? options : mergeResolveOptions(loadAktionConfig(projectRoot), options);
    },
    async buildStart() {
      await loadTypeScript();
      if (options.dts) {
        const result = emitAktionDeclarations({ ...declarationOptions(), root: projectRoot });
        for (const w of result.warnings) this.warn?.(w);
        for (const d of result.diagnostics) this.warn?.(`${d.path}:${d.line}:${d.column} ${d.message}`);
      }
    },
    // Host code receives only an Aktion module's default export (the compiled
    // program): its other exports live inside Aktion programs, which the linker
    // inlines. A named import from host code would otherwise fail as a bare
    // "is not exported" — say why instead. Rollup builds only: the dev server
    // does not call `moduleParsed`, Rolldown (Vite 8) throws "UNSUPPORTED:
    // ModuleInfo#ast" on reading the AST and keeps its own missing-export
    // error, and in serve mode the emitted module carries stand-ins that fail
    // with the same explanation when used.
    async moduleParsed(info) {
      if (isServe || isAktionId(info.id)) return;
      let ast;
      try {
        ast = info.ast ?? null;
      } catch {
        return;
      }
      for (const node of ast?.body ?? []) {
        if (node.type !== "ImportDeclaration" && !(node.type === "ExportNamedDeclaration" && node.source)) continue;
        const source = node.source?.value;
        if (typeof source !== "string" || !source.includes(".aktion")) continue;
        const named = (node.specifiers ?? []).map(specifierName).filter((n) => n !== null);
        if (named.length === 0) continue;
        const resolved = await this.resolve(source, info.id);
        if (!resolved || !isAktionId(resolved.id) || VITE_ASSET_QUERY.test(resolved.id)) continue;
        this.error(hostImportMessage(named, source, displayPath(info.id, projectRoot)));
      }
    },
    configureServer(server) {
      if (!options.dts || !server.watcher) return;
      const refresh = (file) => {
        if (/\.aktion$/i.test(file)) {
          updateAktionDeclaration(file, { ...declarationOptions(), root: projectRoot });
        }
      };
      server.watcher.on("add", refresh);
      server.watcher.on("change", refresh);
      server.watcher.on("unlink", refresh);
    },
    transform
  };
  return plugin;
}
function specifierName(spec) {
  if (spec.type === "ImportDefaultSpecifier" || spec.type === "ImportNamespaceSpecifier") return null;
  const ref = spec.type === "ImportSpecifier" ? spec.imported : spec.local;
  const name = ref?.name ?? ref?.value;
  return name === void 0 || name === "default" ? null : name;
}
function displayPath(id, root) {
  return isInsideRoot(id, root) ? relative(root, id).split(sep).join("/") : id;
}
function hostImportMessage(names, source, importer) {
  return `${importer} imports ${names.map((n) => `\`${n}\``).join(", ")} from "${source}", but an Aktion module gives host code only its compiled program: \`import app from "${source}"\`. Its other exports exist inside Aktion programs — exercise them through a program (compileAktionSource from aktion-runtime/vite).`;
}
function formatDiagnostic(d) {
  const where = d.path ? `${d.path}:${d.line}:${d.column}` : `${d.line}:${d.column}`;
  const message = d.path && d.message.startsWith(`${d.path}: `) ? d.message.slice(d.path.length + 2) : d.message;
  return `${where} ${message}`;
}
function isAktionId(id) {
  return isAktionModulePath(id);
}
let defaultSyncTypeScriptFrontend;
function compileFrontends(options) {
  const typescript = options.frontends?.typescript ?? (defaultSyncTypeScriptFrontend ??= tryCreateTypeScriptFrontend());
  return { ...defaultFrontends, ...options.frontends, typescript };
}
function compileAktionFile(entryPath, options = {}) {
  const absolute = resolve(entryPath);
  return compileAktionSource(readFileSync(absolute, "utf8"), absolute, options);
}
async function compileAktionFileAsync(entryPath, options = {}) {
  const absolute = resolve(entryPath);
  return compileAktionSourceAsync(readFileSync(absolute, "utf8"), absolute, options);
}
function compileAktionSource(source, virtualPath, options = {}) {
  const absolute = resolve(virtualPath);
  const root = options.root === null ? null : resolve(options.root ?? dirname(absolute));
  const resolution = options.config === false ? options : mergeResolveOptions(loadAktionConfig(root ?? absolute), options);
  const result = linkProgram(source, absolute, createNodeResolver({ ...resolution, root }), {
    frontends: compileFrontends(options)
  });
  const fatal = collectDiagnostics(result.program, result.diagnostics).filter(
    (d) => d.severity === "error" || options.strict === true && d.severity === "warning"
  );
  if (fatal.length > 0) {
    const detail = fatal.map((d) => `  ${d.line}:${d.column} ${d.message}`).join("\n");
    throw new Error(`[aktion] failed to compile ${absolute}:
${detail}`);
  }
  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program: result.program,
    source: runnableSource(result, source),
    path: absolute,
    ...options.sourcesContent === false ? {} : { sourcesContent: result.modules.map((m) => m.originalSource) }
  });
}
async function compileAktionSourceAsync(source, virtualPath, options = {}) {
  const typescript = options.frontends?.typescript ?? await tryLoadTypeScriptFrontend();
  return compileAktionSource(source, virtualPath, { ...options, frontends: { ...options.frontends, typescript } });
}
function runnableSource(result, entrySource) {
  try {
    return printProgram(result.program);
  } catch {
    return result.modules[0]?.aktionSource ?? entrySource;
  }
}
function isInsideRoot(candidate, root) {
  const normalisedRoot = resolve(root);
  const normalised = resolve(candidate);
  if (normalised === normalisedRoot) return true;
  return normalised.startsWith(normalisedRoot.endsWith(sep) ? normalisedRoot : normalisedRoot + sep);
}
const DEFAULT_EXTENSIONS = [
  ".aktion",
  ".aktion.ts",
  ".aktion.js",
  "/index.aktion",
  "/index.aktion.ts",
  "/index.aktion.js"
];
function siblingVariant(path) {
  const lower = path.toLowerCase();
  const suffix = AKTION_MODULE_SUFFIXES.find((s) => lower.endsWith(s));
  if (!suffix) return null;
  const stem = path.slice(0, path.length - suffix.length);
  for (const other of AKTION_MODULE_SUFFIXES) {
    if (other !== suffix && isFile(stem + other)) return stem + other;
  }
  return null;
}
const baseNameOf = (p) => p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
function realPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}
function withRealPaths(paths) {
  const out = new Set(paths);
  for (const p of paths) out.add(realPath(p));
  return [...out];
}
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
function createNodeResolver(options = {}) {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const aliases = Object.entries(absoluteAliasTargets(options.alias) ?? {}).sort((a, b) => b[0].length - a[0].length);
  const root = options.root === void 0 ? process.cwd() : options.root;
  const allowed = root === null ? null : withRealPaths([resolve(root), ...(options.roots ?? []).map((r) => resolve(r)), ...aliases.map(([, t]) => t)]);
  const contained = (path) => allowed === null || allowed.some((r) => isInsideRoot(path, r) || isInsideRoot(realPath(path), r));
  const complete = (base) => {
    if (isFile(base)) return base;
    for (const ext of extensions) {
      if (isFile(base + ext)) return base + ext;
    }
    return null;
  };
  const resolveDetailed = (spec, importerPath) => {
    try {
      for (const [prefix, target] of aliases) {
        if (spec !== prefix && !spec.startsWith(`${prefix}/`)) continue;
        const rest = spec === prefix ? "" : spec.slice(prefix.length + 1);
        const base2 = rest === "" ? target : resolve(target, rest);
        if (!isInsideRoot(base2, target)) {
          return { path: null, why: `It climbs out of the directory the "${prefix}" alias names.` };
        }
        return checked(spec, base2, complete(base2));
      }
      if (!spec.startsWith(".") && !spec.startsWith("/")) {
        return {
          path: null,
          why: "Bare specifiers name packages, not Aktion modules; map a prefix with `alias` (plugin option or aktion.config.json) or use a relative path."
        };
      }
      const base = resolve(dirname(importerPath), spec);
      const resolved = complete(base);
      if (resolved !== null && !contained(resolved)) {
        return { path: null, why: "It resolves outside the project root (see the `roots` / `alias` options)." };
      }
      return checked(spec, base, resolved);
    } catch {
      return { path: null };
    }
  };
  const checked = (spec, base, resolved) => {
    if (resolved === null) {
      const lower = spec.toLowerCase();
      const suffix = AKTION_MODULE_SUFFIXES.find((s) => lower.endsWith(s));
      if (suffix) {
        const stem = base.slice(0, base.length - suffix.length);
        for (const other of AKTION_MODULE_SUFFIXES) {
          if (other === suffix || !isFile(stem + other)) continue;
          const hint = `Did you mean "${spec.slice(0, spec.length - suffix.length)}${other}"?`;
          return {
            path: null,
            why: suffix === ".aktion.js" && other === ".aktion.ts" ? `${hint} Aktion imports the file named, without TypeScript's \`.js\` → \`.ts\` mapping.` : hint
          };
        }
      }
      return { path: null };
    }
    const sibling = siblingVariant(resolved);
    if (sibling !== null) {
      return {
        path: null,
        why: `"${baseNameOf(resolved)}" and "${baseNameOf(sibling)}" both exist — keep one (TypeScript and Vite resolve "./${baseNameOf(resolved).replace(/\.(?:ts|js)$/, "")}" to different files).`
      };
    }
    return { path: resolved };
  };
  return {
    resolve(spec, importerPath) {
      return resolveDetailed(spec, importerPath).path;
    },
    explain(spec, importerPath) {
      return resolveDetailed(spec, importerPath).why;
    },
    load(path) {
      if (!contained(path)) {
        throw new Error(`[aktion] refusing to read "${path}" — outside the project root`);
      }
      return readFileSync(path, "utf8");
    }
  };
}
function absoluteAliasTargets(alias) {
  if (!alias) return void 0;
  return Object.fromEntries(Object.entries(alias).map(([prefix, target]) => [prefix, resolve(target)]));
}
function loadAktionConfig(from) {
  let dir = isFile(from) ? dirname(resolve(from)) : resolve(from);
  for (; ; ) {
    const candidate = resolve(dir, "aktion.config.json");
    if (isFile(candidate)) {
      try {
        const raw = JSON.parse(readFileSync(candidate, "utf8"));
        const alias = {};
        for (const [prefix, target] of Object.entries(raw.alias ?? {})) {
          alias[prefix] = resolve(dir, target);
        }
        return {
          configPath: candidate,
          alias,
          roots: (raw.roots ?? []).map((r) => resolve(dir, r)),
          ...raw.extensions ? { extensions: raw.extensions } : {}
        };
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function mergeResolveOptions(base, override) {
  if (!base) return override;
  return {
    alias: { ...base.alias, ...override.alias },
    roots: [...base.roots ?? [], ...override.roots ?? []],
    extensions: override.extensions ?? base.extensions
  };
}
function collectDiagnostics(program, linkDiagnostics) {
  const out = [...linkDiagnostics];
  if (!hasEntryBinding(program)) {
    out.push({
      line: 1,
      column: 1,
      severity: "warning",
      message: "No top-level `$app(…)` entry found — this program renders nothing."
    });
  }
  return out;
}
function hasEntryBinding(program) {
  return program.statements.some((s) => {
    if (s.kind === "Assignment") return s.identifier === "aktion";
    if (s.kind !== "ExpressionStatement") return false;
    const expr = s.expression;
    return expr.kind === "Invoke" && expr.callee.kind === "StateRef" && expr.callee.name === "app";
  });
}
function buildSourceMap(generated, sourcePath, source) {
  const lineCount = generated.split("\n").length;
  const mappings = new Array(lineCount).fill("AAAA").join(";");
  return {
    version: 3,
    sources: [sourcePath],
    sourcesContent: [source],
    names: [],
    mappings
  };
}
function omitDeclarationKeyword(key, value) {
  if (key !== "declaration") return value;
  const kind = this?.kind;
  return kind === "Assignment" || kind === "DestructureStatement" || kind === "ForOfStatement" || kind === "ForInStatement" ? void 0 : value;
}
function emitModule(result, entrySource, path, runtimeModuleId, options) {
  const programLiteral = JSON.stringify(JSON.stringify(result.program, omitDeclarationKeyword));
  const contents = options.sourcesContent ? `, sourcesContent: ${JSON.stringify(result.modules.map((m) => m.originalSource))}` : "";
  return `// Generated by the Aktion Vite plugin — do not edit by hand.
import { defineCompiledProgram } from ${JSON.stringify(runtimeModuleId)};
const program = /*#__PURE__*/ JSON.parse(${programLiteral});
const source = ${JSON.stringify(runnableSource(result, entrySource))};
export default /*#__PURE__*/ defineCompiledProgram({ __aktionCompiled: ${COMPILED_PROGRAM_VERSION}, program, source, path: ${JSON.stringify(path)}${contents} });
`;
}
const HOST_ONLY_TAG = "AktionHostOnly";
function hostOnlyExports(result, frontends, path) {
  const entry = result.modules[0];
  const frontend = entry ? frontends[entry.language] : void 0;
  if (!entry || !frontend) return "";
  const names = aktionExportNames(frontend.compile(entry.originalSource, entry.path).program).filter((name) => name !== "then");
  if (names.length === 0) return "";
  const message = `"[aktion] \`" + __aktionNames[i] + "\` is not available to host code: the Aktion module " + ${JSON.stringify(JSON.stringify(path))} + " gives host code only its compiled program (\`import app from\`). Exercise its other exports through a program (compileAktionSource from aktion-runtime/vite)."`;
  return `const __aktionNames = ${JSON.stringify(names)};
function __aktionHostOnly(i) {
  const message = ${message};
  const fail = () => { throw new Error(message); };
  const get = (_target, key) => (key === Symbol.toStringTag ? ${JSON.stringify(HOST_ONLY_TAG)} : fail());
  return new Proxy(function () {}, { apply: fail, construct: fail, get, set: fail, has: fail, ownKeys: fail, defineProperty: fail, deleteProperty: fail, getOwnPropertyDescriptor: fail, getPrototypeOf: fail, setPrototypeOf: fail });
}
` + names.map((_, i) => `const __aktion_${i} = __aktionHostOnly(${i});
`).join("") + `export { ${names.map((n, i) => `__aktion_${i} as ${n}`).join(", ")} };
`;
}
const HMR_FOOTER = `
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    const next = mod && mod.default;
    if (!next || typeof document === "undefined") return;
    for (const el of document.querySelectorAll("aktion-app")) {
      if (el.sourceId !== next.path) continue;
      el.mountCompiled(next, el.serializeState());
    }
  });
}
`;
export {
  DECLARATION_HEADER,
  DEFAULT_DECLARATIONS_DIR,
  MISSING_ERASER_MESSAGE,
  aktionDeclarationText,
  aktionExportNames,
  aktionPlugin,
  aktionViteConfig,
  checkErasureInvariant,
  compileAktionFile,
  compileAktionFileAsync,
  compileAktionSource,
  compileAktionSourceAsync,
  computeSoftNewlines,
  createNodeResolver,
  createTypeScriptFrontend,
  declarationFileName,
  aktionPlugin as default,
  emitAktionDeclarations,
  isAktionId,
  isInsideRoot,
  loadAktionConfig,
  loadTypeScriptFrontend,
  mergeResolveOptions,
  tryCreateTypeScriptFrontend,
  tryLoadTypeScriptFrontend,
  typeScriptFrontendFromEraser,
  unavailableTypeScriptFrontend,
  updateAktionDeclaration
};
//# sourceMappingURL=plugin.js.map
