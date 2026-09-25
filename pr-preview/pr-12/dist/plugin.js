import { readFileSync, statSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
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
function tokenize(source) {
  const tokens = [];
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
      advance();
      push("Newline", "\n", startLine, startCol);
      continue;
    }
    if (ch === " " || ch === "	" || ch === "\r") {
      advance();
      continue;
    }
    if (ch === "/" && peek(1) === "/") {
      while (i < source.length && peek() !== "\n") advance();
      continue;
    }
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
      if (peek() === quote) advance();
      push("String", value, startLine, startCol);
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
        parts
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
    advance();
  }
  tokens.push({ type: "EOF", value: "", line, column });
  return tokens;
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
function isNode(value) {
  if (typeof value !== "object" || value === null) return false;
  const kind = value.kind;
  if (typeof kind !== "string" || kind.length === 0) return false;
  const first = kind.charCodeAt(0);
  return first >= 65 && first <= 90;
}
function walkNode(root, visit) {
  visitNode(root, null, null, null, 0, visit);
}
function visitNode(node, parent, key, index, depth, visit) {
  if (visit({ node, parent, key, index, depth }) === false) return;
  for (const childKey of Object.keys(node)) {
    if (childKey === "loc") continue;
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
    if (inner === "loc") continue;
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
function parse(source) {
  const tokens = tokenize(source);
  const ctx = new ParserContext(tokens);
  const statements = [];
  const errors = [];
  while (!ctx.isEnd()) {
    if (ctx.match("Newline") || ctx.match("Semicolon")) continue;
    try {
      const stmt = parseStatement(ctx, true);
      if (stmt) statements.push(stmt);
    } catch (err) {
      const error = err;
      errors.push(error);
      ctx.recoverToNextLine();
    }
  }
  return { statements, errors };
}
function parseStatement(ctx, _topLevel) {
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
    if (isAssignableTarget(expression)) {
      ctx.consume();
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
    }
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
function parseFunctionDecl(ctx) {
  const start = ctx.expect("Keyword", "function");
  const isHook = ctx.peek().type === "StateIdentifier";
  const nameTok = isHook ? ctx.consume() : ctx.expect("Identifier");
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
  const isPascalCase = nameTok.value.length > 0 && nameTok.value[0] >= "A" && nameTok.value[0] <= "Z";
  if (isPascalCase) {
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
          message: `Expected parameter name, got ${tok.type} "${tok.value}"`,
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
  skipWhitespace(ctx);
  const callbackExpr = parseExpression(ctx);
  let body;
  if (callbackExpr.kind === "Lambda") {
    body = callbackExpr.body.kind === "Block" ? callbackExpr.body : { kind: "Block", body: [{ kind: "ExpressionStatement", expression: callbackExpr.body }] };
  } else {
    body = { kind: "Block", body: [] };
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
      parseExpression(ctx);
    }
  }
  skipWhitespace(ctx);
  ctx.expect("Punctuation", ")");
  skipTerminator(ctx);
  const decl = {
    kind: "EffectDeclaration",
    name: `__effect_L${start.line}_C${start.column}`,
    triggers,
    body,
    loc: { line: start.line, column: start.column }
  };
  if (rateLimit) decl.rateLimit = rateLimit;
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
    message: `Unexpected ${head.type} "${head.value}" inside effect dependency array. Expected $state or a string token ("mount", "unmount", "every(N)", etc.).`,
    line: head.line,
    column: head.column
  };
}
function parseVarDecl(ctx) {
  const start = ctx.consume();
  const head = ctx.peek();
  if (head.type === "Punctuation" && (head.value === "[" || head.value === "{")) {
    return parseDestructureDecl(ctx, start);
  }
  let identifier = "";
  let isState = false;
  if (head.type === "StateIdentifier") {
    identifier = ctx.consume().value;
    isState = true;
  } else if (head.type === "Identifier") {
    identifier = ctx.consume().value;
  } else {
    throw {
      message: `Expected identifier after "${start.value}", got ${head.type} "${head.value}"`,
      line: head.line,
      column: head.column
    };
  }
  ctx.expect("Operator", "=");
  const expression = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "Assignment",
    identifier,
    isState,
    expression,
    loc: { line: start.line, column: start.column }
  };
}
function parseDestructureDecl(ctx, start) {
  const pattern = parseDestructuringPattern(ctx);
  ctx.expect("Operator", "=");
  const expression = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "DestructureStatement",
    patternKind: pattern.kind,
    bindings: pattern.bindings,
    expression,
    loc: { line: start.line, column: start.column }
  };
}
function parseDestructuringPattern(ctx) {
  const head = ctx.consume();
  const patternKind = head.value === "[" ? "array" : "object";
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
      const nameTok = ctx.expect("Identifier");
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
      const keyTok = ctx.expect("Identifier");
      let alias = keyTok.value;
      let sourceKey;
      let nestedPattern;
      if (!isRest && ctx.peek().type === "Punctuation" && ctx.peek().value === ":") {
        ctx.consume();
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && (ctx.peek().value === "{" || ctx.peek().value === "[")) {
          sourceKey = keyTok.value;
          nestedPattern = parseDestructuringPattern(ctx);
        } else {
          const aliasTok = ctx.expect("Identifier");
          sourceKey = keyTok.value;
          alias = aliasTok.value;
        }
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
  const body = [];
  skipWhitespace(ctx);
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const stmt = parseStatement(ctx);
    if (stmt) body.push(stmt);
    skipWhitespace(ctx);
  }
  ctx.expect("Punctuation", "}");
  return {
    kind: "Block",
    body,
    loc: { line: start.line, column: start.column }
  };
}
function parseBlockOrSingleStatement(ctx) {
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    return parseBlock(ctx);
  }
  const head = ctx.peek();
  const stmt = parseStatement(ctx);
  return {
    kind: "Block",
    body: stmt ? [stmt] : [],
    loc: { line: head.line, column: head.column }
  };
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
class ParserContext {
  constructor(tokens) {
    this.tokens = tokens;
  }
  index = 0;
  isEnd() {
    return this.peek().type === "EOF";
  }
  peek(offset = 0) {
    return this.tokens[this.index + offset] ?? { type: "EOF", value: "", line: 0, column: 0 };
  }
  consume() {
    const tok = this.tokens[this.index] ?? { type: "EOF", value: "", line: 0, column: 0 };
    this.index += 1;
    return tok;
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
        message: `Expected ${type}${value !== void 0 ? ` "${value}"` : ""} but got ${tok.type} "${tok.value}"`,
        line: tok.line,
        column: tok.column
      };
    }
    return this.consume();
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
    identifier = ctx.consume().value;
  } else if (head.type === "StateIdentifier") {
    identifier = ctx.consume().value;
    isState = true;
  } else {
    throw {
      message: `Expected identifier at start of statement, got ${head.type} "${head.value}"`,
      line: head.line,
      column: head.column
    };
  }
  const eq = ctx.expect("Operator", "=");
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
  ctx.expect("Punctuation", "{");
  const specifiers = [];
  skipWhitespace(ctx);
  while (!ctx.isEnd() && !(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const importedTok = ctx.peek();
    let imported;
    let isState = false;
    if (importedTok.type === "StateIdentifier") {
      imported = ctx.consume().value;
      isState = true;
    } else if (importedTok.type === "Identifier") {
      imported = ctx.consume().value;
    } else {
      throw {
        message: `Expected an import name, got ${importedTok.type} "${importedTok.value}"`,
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
        local = ctx.consume().value;
      } else {
        throw {
          message: `Expected an alias after \`as\`, got ${aliasTok.type} "${aliasTok.value}"`,
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
      message: `Expected \`from\` after import specifiers, got ${fromTok.type} "${fromTok.value}"`,
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
function parseExportStatement(ctx) {
  const start = ctx.expect("Keyword", "export");
  const next = ctx.peek();
  if (next.type === "Punctuation" && next.value === "{") {
    throw {
      message: "`export { … }` lists are not supported yet — use inline `export <declaration>` (e.g. `export function Foo() {…}`, `export $count = 0`).",
      line: next.line,
      column: next.column
    };
  }
  let stmt;
  if (next.type === "Keyword" && next.value === "function") {
    stmt = parseFunctionDecl(ctx);
  } else if (next.type === "Keyword" && next.value === "async" && ctx.peek(1).type === "Keyword" && ctx.peek(1).value === "function") {
    ctx.consume();
    stmt = parseFunctionDecl(ctx);
  } else if (next.type === "Keyword" && (next.value === "let" || next.value === "const" || next.value === "var")) {
    stmt = parseVarDecl(ctx);
    if (stmt && stmt.kind === "DestructureStatement") {
      throw {
        message: "`export` of a destructuring declaration is not supported — export named bindings individually.",
        line: next.line,
        column: next.column
      };
    }
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
              message: `Expected Identifier but got ${propTok.type} "${propTok.value}"`,
              line: propTok.line,
              column: propTok.column
            };
          }
          callee = { kind: "Member", object: callee, property: propTok.value };
          continue;
        }
        if (t.type === "Punctuation" && t.value === "[") {
          ctx.consume();
          const computed = parseExpression(ctx);
          ctx.expect("Punctuation", "]");
          callee = { kind: "Member", object: callee, computed };
          continue;
        }
        break;
      }
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        ctx.consume();
        args = parseCallArgs(ctx);
        ctx.expect("Punctuation", ")");
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
          message: `Expected Identifier but got ${propTok.type} "${propTok.value}"`,
          line: propTok.line,
          column: propTok.column
        };
      }
      const after = ctx.peek();
      if (after.type === "Punctuation" && after.value === "(") {
        ctx.consume();
        const args = parseCallArgs(ctx);
        ctx.expect("Punctuation", ")");
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
        ctx.consume();
        const computed = parseExpression(ctx);
        ctx.expect("Punctuation", "]");
        expr = { kind: "Member", object: expr, computed, optional: true };
      } else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        ctx.consume();
        const args = parseCallArgs(ctx);
        ctx.expect("Punctuation", ")");
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
            message: `Expected Identifier but got ${propTok.type} "${propTok.value}"`,
            line: propTok.line,
            column: propTok.column
          };
        }
        const after = ctx.peek();
        if (after.type === "Punctuation" && after.value === "(") {
          ctx.consume();
          const args = parseCallArgs(ctx);
          ctx.expect("Punctuation", ")");
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
      ctx.consume();
      const computed = parseExpression(ctx);
      ctx.expect("Punctuation", "]");
      expr = { kind: "Member", object: expr, computed };
      continue;
    }
    if (tok.type === "Punctuation" && tok.value === "(") {
      ctx.consume();
      const args = parseCallArgs(ctx);
      ctx.expect("Punctuation", ")");
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
  if (tok.type === "Keyword") {
    if (tok.value === "function") {
      const lookahead = ctx.peek(1);
      const lookahead2 = ctx.peek(2);
      const looksLikeFunctionExpr = lookahead.type === "Punctuation" && lookahead.value === "(" || lookahead.type === "Identifier" && lookahead2.type === "Punctuation" && lookahead2.value === "(";
      if (looksLikeFunctionExpr) {
        const start = tok;
        ctx.consume();
        if (ctx.peek().type === "Identifier") ctx.consume();
        const params = parseFunctionParams(ctx);
        const body = parseBlock(ctx);
        return {
          kind: "Lambda",
          params,
          body,
          loc: { line: start.line, column: start.column }
        };
      }
    }
    if (tok.value === "function" || tok.value === "let" || tok.value === "const" || tok.value === "var" || tok.value === "of" || tok.value === "in" || tok.value === "case" || tok.value === "break" || tok.value === "continue" || tok.value === "default") {
      ctx.consume();
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        ctx.consume();
        const args = parseCallArgs(ctx);
        ctx.expect("Punctuation", ")");
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
      const sub = parse(`${TEMPLATE_SUB_PREFIX}${part.source}`);
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
      ctx.consume();
      const args = parseCallArgs(ctx);
      ctx.expect("Punctuation", ")");
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
    const elements = parseCallArgs(ctx);
    ctx.expect("Punctuation", "]");
    return { kind: "Array", elements };
  }
  if (tok.type === "Punctuation" && tok.value === "{") {
    ctx.consume();
    const properties = parseObjectProps(ctx);
    ctx.expect("Punctuation", "}");
    return { kind: "Object", properties };
  }
  if (tok.type === "Punctuation" && tok.value === "(") {
    const saved = ctx.snapshot();
    const lambda = tryParseLambdaFromParenList(ctx);
    if (lambda) return lambda;
    ctx.restore(saved);
    ctx.consume();
    const expr = parseExpression(ctx);
    ctx.expect("Punctuation", ")");
    return expr;
  }
  throw {
    message: `Unexpected token ${tok.type} "${tok.value}"`,
    line: tok.line,
    column: tok.column
  };
}
function parseEffectCallAsExpr(ctx, nameTok) {
  ctx.consume();
  const args = parseCallArgs(ctx);
  ctx.expect("Punctuation", ")");
  return {
    kind: "Call",
    callee: nameTok.value,
    arguments: args,
    loc: { line: nameTok.line, column: nameTok.column }
  };
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
  ctx.expect("Punctuation", "(");
  const test = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
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
  return {
    kind: "IfStatement",
    test,
    consequent,
    alternate,
    loc: { line: start.line, column: start.column }
  };
}
function parseSwitchStatement(ctx) {
  const start = ctx.expect("Keyword", "switch");
  ctx.expect("Punctuation", "(");
  const discriminant = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  ctx.expect("Punctuation", "{");
  const cases = [];
  skipWhitespace(ctx);
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    let test = null;
    if (ctx.peek().type === "Keyword" && ctx.peek().value === "case") {
      ctx.consume();
      test = parseExpression(ctx);
    } else if (ctx.peek().type === "Keyword" && ctx.peek().value === "default") {
      ctx.consume();
      test = null;
    } else {
      throw {
        message: `Expected "case" or "default" in switch body, got ${ctx.peek().type} "${ctx.peek().value}"`,
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
      skipWhitespace(ctx);
    }
    cases.push({ test, body });
    skipWhitespace(ctx);
  }
  ctx.expect("Punctuation", "}");
  skipTerminator(ctx);
  return {
    kind: "SwitchStatement",
    discriminant,
    cases,
    loc: { line: start.line, column: start.column }
  };
}
function parseForStatement(ctx) {
  const start = ctx.expect("Keyword", "for");
  ctx.expect("Punctuation", "(");
  skipWhitespace(ctx);
  const headSnapshot = ctx.snapshot();
  let kind = "for-of";
  {
    let depth = 1;
    let i = 0;
    while (true) {
      const tok = ctx.peek(i);
      if (tok.type === "EOF") break;
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
      i += 1;
    }
  }
  ctx.restore(headSnapshot);
  if (kind === "classic") return parseForClassic(ctx, start);
  if (ctx.peek().type === "Keyword" && (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")) {
    ctx.consume();
  }
  skipWhitespace(ctx);
  let item = "__row";
  let pattern;
  if (ctx.peek().type === "Punctuation" && (ctx.peek().value === "[" || ctx.peek().value === "{")) {
    pattern = parseDestructuringPattern(ctx);
  } else {
    item = ctx.expect("Identifier").value;
  }
  if (kind === "for-in") {
    ctx.expect("Keyword", "in");
  } else {
    ctx.expect("Keyword", "of");
  }
  const iterable = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  const body = parseBlockOrSingleStatement(ctx);
  skipTerminator(ctx);
  if (kind === "for-in") {
    return {
      kind: "ForInStatement",
      item,
      iterable,
      body,
      loc: { line: start.line, column: start.column }
    };
  }
  return {
    kind: "ForOfStatement",
    item,
    pattern,
    iterable,
    body,
    loc: { line: start.line, column: start.column }
  };
}
function parseForClassic(ctx, start) {
  let init;
  if (!(ctx.peek().type === "Semicolon")) {
    if (ctx.peek().type === "Keyword" && (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")) {
      const decl = parseVarDecl(ctx);
      if (decl.kind === "Assignment") init = decl;
      skipWhitespace(ctx);
    } else {
      const exprStart = ctx.peek();
      const expression = parseExpression(ctx);
      init = {
        kind: "ExpressionStatement",
        expression,
        loc: { line: exprStart.line, column: exprStart.column }
      };
      ctx.expect("Semicolon");
      skipWhitespace(ctx);
    }
  } else {
    ctx.expect("Semicolon");
    skipWhitespace(ctx);
  }
  let test;
  if (!(ctx.peek().type === "Semicolon")) {
    test = parseExpression(ctx);
  }
  ctx.expect("Semicolon");
  skipWhitespace(ctx);
  let update;
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    update = parseAssignmentLikeExpression(ctx);
  }
  ctx.expect("Punctuation", ")");
  const body = parseBlockOrSingleStatement(ctx);
  skipTerminator(ctx);
  return {
    kind: "ForClassicStatement",
    init,
    test,
    update,
    body,
    loc: { line: start.line, column: start.column }
  };
}
function parseWhileStatement(ctx) {
  const start = ctx.expect("Keyword", "while");
  ctx.expect("Punctuation", "(");
  const test = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
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
  ctx.expect("Punctuation", "(");
  const test = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
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
      if (ctx.peek().type === "Identifier") {
        catchParam = ctx.consume().value;
      }
      ctx.expect("Punctuation", ")");
    }
    catchBlock = parseBlock(ctx);
    skipWhitespace(ctx);
  }
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "finally") {
    ctx.consume();
    finallyBlock = parseBlock(ctx);
  }
  skipTerminator(ctx);
  return {
    kind: "TryStatement",
    block,
    catchParam,
    catchBlock,
    finallyBlock,
    loc: { line: start.line, column: start.column }
  };
}
function tryParseLambdaFromParenList(ctx) {
  const start = ctx.peek();
  if (start.type !== "Punctuation" || start.value !== "(") return null;
  ctx.consume();
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
        } catch {
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
          continue;
        }
        break;
      }
      if (tok.type !== "Identifier") return null;
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
        continue;
      }
      break;
    }
  }
  skipWhitespace(ctx);
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    return null;
  }
  ctx.consume();
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
    let key;
    let computedKey;
    if (keyTok.type === "Punctuation" && keyTok.value === "[") {
      ctx.consume();
      skipWhitespace(ctx);
      computedKey = parseExpression(ctx);
      skipWhitespace(ctx);
      ctx.expect("Punctuation", "]");
      key = "";
    } else if (keyTok.type === "Number") {
      key = ctx.consume().value;
    } else if (keyTok.type === "Identifier" || keyTok.type === "String" || keyTok.type === "Keyword") {
      key = ctx.consume().value;
    } else {
      throw {
        message: `Expected object key, got ${keyTok.type} "${keyTok.value}"`,
        line: keyTok.line,
        column: keyTok.column
      };
    }
    const after = ctx.peek();
    let value;
    if (!computedKey && keyTok.type === "Identifier" && after.type === "Punctuation" && (after.value === "," || after.value === "}")) {
      value = { kind: "Identifier", name: key, loc: { line: keyTok.line, column: keyTok.column } };
    } else {
      ctx.expect("Punctuation", ":");
      value = parseExpression(ctx);
    }
    const prop = { key, value };
    if (computedKey) prop.computedKey = computedKey;
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
function skipWhitespace(ctx) {
  while (ctx.match("Newline") || ctx.match("Semicolon")) {
  }
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
function moduleLocalSymbol(moduleId, name) {
  return `__a${moduleId}_${name}`;
}
function linkProgram(entrySource, entryPath, resolver) {
  const modules = /* @__PURE__ */ new Map();
  const order = [];
  const visiting = /* @__PURE__ */ new Set();
  const diagnostics = [];
  let nextId = 0;
  const fail = (path, line, column, message) => {
    diagnostics.push({
      line,
      column,
      message: path === entryPath ? message : `${path}: ${message}`,
      severity: "error"
    });
  };
  function load(path, sourceOverride) {
    const existing = modules.get(path);
    if (existing) return existing;
    if (visiting.has(path)) return void 0;
    visiting.add(path);
    let src;
    if (sourceOverride !== null) {
      src = sourceOverride;
    } else {
      try {
        src = resolver.load(path);
      } catch {
        visiting.delete(path);
        fail(entryPath, 0, 0, `Failed to load imported module "${path}".`);
        return void 0;
      }
    }
    const program2 = parse(src);
    for (const e of program2.errors) fail(path, e.line, e.column, e.message);
    const rec = {
      id: nextId++,
      path,
      program: program2,
      edges: [],
      declaredPlain: /* @__PURE__ */ new Set(),
      declaredState: /* @__PURE__ */ new Set(),
      exportedPlain: /* @__PURE__ */ new Set(),
      exportedState: /* @__PURE__ */ new Set(),
      renamePlain: /* @__PURE__ */ new Map(),
      renameState: /* @__PURE__ */ new Map()
    };
    modules.set(path, rec);
    buildSymbolTable(rec);
    for (const stmt of program2.statements) {
      if (stmt.kind !== "Import") continue;
      const resolved = resolver.resolve(stmt.source, path);
      rec.edges.push({ stmt, resolvedPath: resolved });
      if (resolved === null) {
        fail(path, stmt.loc?.line ?? 0, stmt.loc?.column ?? 0, `Cannot resolve import "${stmt.source}".`);
        continue;
      }
      load(resolved, null);
    }
    visiting.delete(path);
    order.push(path);
    return rec;
  }
  load(entryPath, entrySource);
  for (const rec of modules.values()) {
    if (rec.path === entryPath) continue;
    for (const name of rec.declaredPlain) rec.renamePlain.set(name, moduleLocalSymbol(rec.id, name));
    for (const name of rec.declaredState) rec.renameState.set(name, moduleLocalSymbol(rec.id, name));
  }
  for (const rec of modules.values()) {
    for (const { stmt, resolvedPath } of rec.edges) {
      if (resolvedPath === null) continue;
      const src = modules.get(resolvedPath);
      if (!src) continue;
      for (const spec of stmt.specifiers) {
        const line = stmt.loc?.line ?? 0;
        const column = stmt.loc?.column ?? 0;
        if (spec.isState) {
          if (!src.exportedState.has(spec.imported)) {
            fail(rec.path, line, column, `"${stmt.source}" does not export \`$${spec.imported}\`.`);
            continue;
          }
          rec.renameState.set(spec.local, src.renameState.get(spec.imported) ?? moduleLocalSymbol(src.id, spec.imported));
        } else {
          if (!src.exportedPlain.has(spec.imported)) {
            fail(rec.path, line, column, `"${stmt.source}" does not export \`${spec.imported}\`.`);
            continue;
          }
          rec.renamePlain.set(spec.local, src.renamePlain.get(spec.imported) ?? moduleLocalSymbol(src.id, spec.imported));
        }
      }
    }
  }
  const merged = [];
  const sources = [entryPath];
  const sourceIndex = /* @__PURE__ */ new Map([[entryPath, 0]]);
  for (const path of order) {
    if (sourceIndex.has(path)) continue;
    sourceIndex.set(path, sources.length);
    sources.push(path);
  }
  const multiModule = sources.length > 1;
  for (const path of order) {
    const rec = modules.get(path);
    const renamer = makeRenamer(rec);
    const index = sourceIndex.get(path);
    for (const stmt of rec.program.statements) {
      if (stmt.kind === "Import") continue;
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
  return {
    program,
    diagnostics,
    dependencies: order.filter((p) => p !== entryPath)
  };
}
function buildSymbolTable(rec) {
  for (const stmt of rec.program.statements) {
    switch (stmt.kind) {
      case "Assignment":
        if (stmt.isState) {
          rec.declaredState.add(stmt.identifier);
          if (stmt.exported) rec.exportedState.add(stmt.identifier);
        } else {
          rec.declaredPlain.add(stmt.identifier);
          if (stmt.exported) rec.exportedPlain.add(stmt.identifier);
        }
        break;
      case "ComponentDeclaration":
      case "ActionDeclaration":
        rec.declaredPlain.add(stmt.name);
        if (stmt.exported) rec.exportedPlain.add(stmt.name);
        break;
      case "HookDeclaration":
        rec.declaredState.add(stmt.name);
        if (stmt.exported) rec.exportedState.add(stmt.name);
        break;
      case "DestructureStatement":
        for (const name of collectPatternNames({ kind: stmt.patternKind, bindings: stmt.bindings })) {
          rec.declaredPlain.add(name);
        }
        break;
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
        push(paramNames(expr.params));
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
      const renamePatternBindings = (bindings) => {
        for (const b of bindings) {
          if (b.defaultValue) renameExpr(b.defaultValue);
          if (b.pattern) renamePatternBindings(b.pattern.bindings);
          else b.name = rPlain(b.name);
        }
      };
      renamePatternBindings(stmt.bindings);
      return;
    }
    renameStatement(stmt, true);
  }
  function renameStatement(stmt, topLevel) {
    switch (stmt.kind) {
      case "Import":
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
function aktionPlugin(options = {}) {
  const runtimeModuleId = options.runtimeModuleId ?? "aktion-runtime";
  let isServe = false;
  let projectRoot = process.cwd();
  let resolution = options;
  return {
    name: "aktion",
    enforce: "pre",
    configResolved(config) {
      isServe = config.command === "serve";
      if (config.root) projectRoot = resolve(config.root);
      resolution = options.config === false ? options : mergeResolveOptions(loadAktionConfig(projectRoot), options);
    },
    transform(code, id) {
      if (!isAktionId(id)) return null;
      const cleanId = stripQuery(id);
      const { program, diagnostics, dependencies } = linkProgram(
        code,
        cleanId,
        createNodeResolver({
          ...resolution,
          root: options.allowOutsideRoot === true ? null : projectRoot
        })
      );
      for (const dep of dependencies) this.addWatchFile(dep);
      const warnings = collectDiagnostics(program, diagnostics);
      const fatal = warnings.find((d) => d.severity === "error" || options.strict && d.severity === "warning");
      if (fatal) {
        return this.error({ message: fatal.message, id: cleanId, loc: { file: cleanId, line: fatal.line, column: fatal.column } });
      }
      for (const w of warnings) {
        if (w.severity === "warning") this.warn(w.message);
      }
      const moduleCode = emitModule(program, code, cleanId, runtimeModuleId) + (isServe ? HMR_FOOTER : "");
      return { code: moduleCode, map: buildSourceMap(moduleCode, cleanId, code) };
    }
  };
}
function isAktionId(id) {
  return stripQuery(id).endsWith(".aktion");
}
function compileAktionFile(entryPath, options = {}) {
  const absolute = resolve(entryPath);
  return compileAktionSource(readFileSync(absolute, "utf8"), absolute, options);
}
function compileAktionSource(source, virtualPath, options = {}) {
  const absolute = resolve(virtualPath);
  const root = options.root === null ? null : resolve(options.root ?? dirname(absolute));
  const resolution = options.config === false ? options : mergeResolveOptions(loadAktionConfig(root ?? absolute), options);
  const { program, diagnostics } = linkProgram(source, absolute, createNodeResolver({ ...resolution, root }));
  const fatal = collectDiagnostics(program, diagnostics).filter(
    (d) => d.severity === "error" || options.strict === true && d.severity === "warning"
  );
  if (fatal.length > 0) {
    const detail = fatal.map((d) => `  ${d.line}:${d.column} ${d.message}`).join("\n");
    throw new Error(`[aktion] failed to compile ${absolute}:
${detail}`);
  }
  return defineCompiledProgram({
    __aktionCompiled: COMPILED_PROGRAM_VERSION,
    program,
    source,
    path: absolute
  });
}
function stripQuery(id) {
  const q = id.indexOf("?");
  const base = q === -1 ? id : id.slice(0, q);
  const h = base.indexOf("#");
  return h === -1 ? base : base.slice(0, h);
}
function isInsideRoot(candidate, root) {
  const normalisedRoot = resolve(root);
  const normalised = resolve(candidate);
  if (normalised === normalisedRoot) return true;
  return normalised.startsWith(normalisedRoot.endsWith(sep) ? normalisedRoot : normalisedRoot + sep);
}
const DEFAULT_EXTENSIONS = [".aktion", "/index.aktion"];
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
function createNodeResolver(options = {}) {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const aliases = Object.entries(options.alias ?? {}).map(([prefix, target]) => [prefix, resolve(target)]).sort((a, b) => b[0].length - a[0].length);
  const root = options.root === void 0 ? process.cwd() : options.root;
  const allowed = root === null ? null : [resolve(root), ...(options.roots ?? []).map((r) => resolve(r)), ...aliases.map(([, t]) => t)];
  const contained = (path) => allowed === null || allowed.some((r) => isInsideRoot(path, r));
  const complete = (base) => {
    if (isFile(base)) return base;
    for (const ext of extensions) {
      if (isFile(base + ext)) return base + ext;
    }
    return null;
  };
  return {
    resolve(spec, importerPath) {
      try {
        for (const [prefix, target] of aliases) {
          if (spec !== prefix && !spec.startsWith(`${prefix}/`)) continue;
          const rest = spec === prefix ? "" : spec.slice(prefix.length + 1);
          const base2 = rest === "" ? target : resolve(target, rest);
          if (!isInsideRoot(base2, target)) return null;
          return complete(base2);
        }
        if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
        const base = resolve(dirname(importerPath), spec);
        const resolved = complete(base);
        if (resolved === null || !contained(resolved)) return null;
        return resolved;
      } catch {
        return null;
      }
    },
    load(path) {
      if (!contained(path)) {
        throw new Error(`[aktion] refusing to read "${path}" — outside the project root`);
      }
      return readFileSync(path, "utf8");
    }
  };
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
function emitModule(program, source, path, runtimeModuleId) {
  const programLiteral = JSON.stringify(JSON.stringify(program));
  return `// Generated by the Aktion Vite plugin — do not edit by hand.
import { defineCompiledProgram } from ${JSON.stringify(runtimeModuleId)};
const program = /*#__PURE__*/ JSON.parse(${programLiteral});
const source = ${JSON.stringify(source)};
export default /*#__PURE__*/ defineCompiledProgram({ __aktionCompiled: ${COMPILED_PROGRAM_VERSION}, program, source, path: ${JSON.stringify(path)} });
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
  aktionPlugin,
  compileAktionFile,
  compileAktionSource,
  createNodeResolver,
  aktionPlugin as default,
  isAktionId,
  isInsideRoot,
  loadAktionConfig,
  mergeResolveOptions
};
//# sourceMappingURL=plugin.js.map
