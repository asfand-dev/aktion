// ../../src/parser/lexer.ts
var KEYWORDS_AKTION = /* @__PURE__ */ new Set([
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
var SINGLE_CHAR_PUNCT = /* @__PURE__ */ new Set(["(", ")", "[", "]", "{", "}", ",", ":", "?", "."]);
var KEYWORDS = {
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
          const escaped = advance();
          switch (escaped) {
            case "n":
              value += "\n";
              break;
            case "t":
              value += "	";
              break;
            case "r":
              value += "\r";
              break;
            case "\\":
              value += "\\";
              break;
            case '"':
              value += '"';
              break;
            case "'":
              value += "'";
              break;
            case "`":
              value += "`";
              break;
            default:
              value += escaped ?? "";
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
      const parts = [];
      let chunk = "";
      let sawExpr = false;
      while (i < source.length && peek() !== "`") {
        if (peek() === "\\" && peek(1) !== void 0) {
          advance();
          const escaped = advance();
          switch (escaped) {
            case "n":
              chunk += "\n";
              break;
            case "t":
              chunk += "	";
              break;
            case "r":
              chunk += "\r";
              break;
            case "\\":
              chunk += "\\";
              break;
            case '"':
              chunk += '"';
              break;
            case "'":
              chunk += "'";
              break;
            case "`":
              chunk += "`";
              break;
            case "$":
              chunk += "$";
              break;
            default:
              chunk += escaped ?? "";
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

// ../../src/parser/parser.ts
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
  const isPascalCase2 = nameTok.value.length > 0 && nameTok.value[0] >= "A" && nameTok.value[0] <= "Z";
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
      if (!isRest && ctx.peek().type === "Punctuation" && ctx.peek().value === ":") {
        ctx.consume();
        const aliasTok = ctx.expect("Identifier");
        sourceKey = keyTok.value;
        alias = aliasTok.value;
      }
      let defaultValue;
      if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
        ctx.consume();
        defaultValue = parseExpression(ctx);
      }
      const binding = { name: alias };
      if (sourceKey) binding.sourceKey = sourceKey;
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
function parseBlock(ctx) {
  const start = ctx.expect("Punctuation", "{");
  const body = [];
  skipWhitespace(ctx);
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const stmt = parseStatement(ctx, false);
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
  const stmt = parseStatement(ctx, false);
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
var ParserContext = class {
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
};
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
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
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
      message: "`export { \u2026 }` lists are not supported yet \u2014 use inline `export <declaration>` (e.g. `export function Foo() {\u2026}`, `export $count = 0`).",
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
        message: "`export` of a destructuring declaration is not supported \u2014 export named bindings individually.",
        line: next.line,
        column: next.column
      };
    }
  } else if (couldStartAssignment(ctx)) {
    stmt = parseAssignment(ctx);
  } else {
    throw {
      message: "`export` must be followed by a declaration or assignment (`export function \u2026`, `export let x = \u2026`, `export $state = \u2026`).",
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
function parseTernary(ctx) {
  const test = parseLogicalOr(ctx);
  if (consumeNewlinesIfNext(ctx, (t) => t.type === "Punctuation" && t.value === "?")) {
    ctx.consume();
    skipWhitespace(ctx);
    const consequent = parseExpression(ctx);
    skipWhitespace(ctx);
    ctx.expect("Punctuation", ":");
    skipWhitespace(ctx);
    const alternate = parseExpression(ctx);
    return { kind: "Ternary", test, consequent, alternate };
  }
  return test;
}
function parseLogicalOr(ctx) {
  let left = parseLogicalAnd(ctx);
  while (consumeNewlinesIfNext(
    ctx,
    (t) => t.type === "Operator" && (t.value === "||" || t.value === "??")
  )) {
    const op = ctx.consume().value;
    skipWhitespace(ctx);
    const right = parseLogicalAnd(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}
function parseLogicalAnd(ctx) {
  let left = parseBitwiseOr(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "&&")) {
    ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseOr(ctx);
    left = { kind: "Binary", operator: "&&", left, right };
  }
  return left;
}
function parseBitwiseOr(ctx) {
  let left = parseBitwiseXor(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "|")) {
    ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseXor(ctx);
    left = { kind: "Binary", operator: "|", left, right };
  }
  return left;
}
function parseBitwiseXor(ctx) {
  let left = parseBitwiseAnd(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "^")) {
    ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseAnd(ctx);
    left = { kind: "Binary", operator: "^", left, right };
  }
  return left;
}
function parseBitwiseAnd(ctx) {
  let left = parseEquality(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "&")) {
    ctx.consume();
    skipWhitespace(ctx);
    const right = parseEquality(ctx);
    left = { kind: "Binary", operator: "&", left, right };
  }
  return left;
}
function parseEquality(ctx) {
  let left = parseComparison(ctx);
  while (consumeNewlinesIfNext(
    ctx,
    (t) => t.type === "Operator" && (t.value === "==" || t.value === "!=" || t.value === "===" || t.value === "!==")
  )) {
    const op = ctx.consume().value;
    skipWhitespace(ctx);
    const right = parseComparison(ctx);
    left = { kind: "Binary", operator: op, left, right };
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
      const op = ctx.consume().value;
      skipWhitespace(ctx);
      const right = parseShift(ctx);
      left = { kind: "Binary", operator: op, left, right };
      continue;
    }
    if (consumeNewlinesIfNext(ctx, (t) => t.type === "Keyword" && (t.value === "instanceof" || t.value === "in"))) {
      const op = ctx.consume().value;
      skipWhitespace(ctx);
      const right = parseShift(ctx);
      left = { kind: "Binary", operator: op, left, right };
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
    const op = ctx.consume().value;
    skipWhitespace(ctx);
    const right = parseAdditive(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}
function parseAdditive(ctx) {
  let left = parseMultiplicative(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && (t.value === "+" || t.value === "-"))) {
    const op = ctx.consume().value;
    skipWhitespace(ctx);
    const right = parseMultiplicative(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}
function parseMultiplicative(ctx) {
  let left = parseExponent(ctx);
  while (consumeNewlinesIfNext(
    ctx,
    (t) => t.type === "Operator" && (t.value === "*" || t.value === "/" || t.value === "%")
  )) {
    const op = ctx.consume().value;
    skipWhitespace(ctx);
    const right = parseExponent(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}
function parseExponent(ctx) {
  const left = parseUnary(ctx);
  if (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "**")) {
    ctx.consume();
    skipWhitespace(ctx);
    const right = parseExponent(ctx);
    return { kind: "Binary", operator: "**", left, right };
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
      if (propTok.type !== "Identifier" && propTok.type !== "Keyword") {
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
        if (propTok.type !== "Identifier" && propTok.type !== "Keyword") {
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
    const hint = tok.value === "if" ? "Use the ternary operator (`cond ? a : b`) when you need a value." : tok.value === "for" ? "Use `arr.map(x => \u2026)` (or `.filter`, `.reduce`, \u2026) to collect bodies into an array." : tok.value === "switch" ? "Use chained ternaries, an object lookup, or wrap the switch inside a `function`." : `Use the ${tok.value} statement inside a function / effect body.`;
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
      const sub = parse(`__rui_tmpl__ = ${part.source}`);
      const firstStmt = sub.statements[0];
      if (firstStmt && firstStmt.kind === "Assignment") {
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
      const stmt = parseStatement(ctx, false);
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
  let item;
  let index;
  let destructure;
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "[") {
    ctx.consume();
    item = ctx.expect("Identifier").value;
    ctx.expect("Punctuation", ",");
    index = ctx.expect("Identifier").value;
    ctx.expect("Punctuation", "]");
  } else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    ctx.consume();
    const fields = [];
    while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
      fields.push(ctx.expect("Identifier").value);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") ctx.consume();
    }
    ctx.expect("Punctuation", "}");
    item = "__row";
    destructure = fields;
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
    index,
    destructure,
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

// ../../src/library/registry.ts
var indexCache = /* @__PURE__ */ new WeakMap();
function getIndex(library) {
  let index = indexCache.get(library.components);
  if (!index) {
    index = /* @__PURE__ */ new Map();
    for (const spec of library.components) {
      if (spec?.name) index.set(spec.name, spec);
    }
    indexCache.set(library.components, index);
  }
  return index;
}
function findComponent(library, name) {
  return getIndex(library).get(name);
}

// ../../src/library/types.ts
function findPositionalIndex(spec) {
  const explicit = spec.props.findIndex((p) => p.positional === true);
  if (explicit >= 0) return explicit;
  return spec.props.length > 0 ? 0 : -1;
}
function findPositionalProp(spec) {
  const idx = findPositionalIndex(spec);
  return idx >= 0 ? spec.props[idx] : void 0;
}
function assertOnePositionalMax(specs) {
  for (const spec of specs) {
    const positional = spec.props.filter((p) => p.positional === true);
    if (positional.length > 1) {
      const names = positional.map((p) => p.name).join(", ");
      throw new SyntaxError(
        `Component "${spec.name}" declares ${positional.length} positional props (${names}). Aktion 0.5 \xA719.1 allows at most one.`
      );
    }
  }
}

// ../../src/library/validate.ts
function validateProgramSchema(program, library) {
  const errors = [];
  for (const stmt of program.statements) {
    walkStatement(stmt, library, errors);
  }
  return errors;
}
function walkStatement(stmt, library, out) {
  switch (stmt.kind) {
    case "Assignment":
      walkExpression(stmt.expression, library, out);
      return;
    case "ExpressionStatement":
      walkExpression(stmt.expression, library, out);
      return;
    case "ComponentDeclaration":
    case "ActionDeclaration":
    case "EffectDeclaration":
    case "HookDeclaration":
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "Return":
      if (stmt.argument) walkExpression(stmt.argument, library, out);
      return;
    case "Await":
      walkExpression(stmt.argument, library, out);
      return;
    case "IfStatement":
      walkExpression(stmt.test, library, out);
      for (const inner of stmt.consequent.body) walkStatement(inner, library, out);
      if (stmt.alternate) {
        if (stmt.alternate.kind === "IfStatement") {
          walkStatement(stmt.alternate, library, out);
        } else {
          for (const inner of stmt.alternate.body) walkStatement(inner, library, out);
        }
      }
      return;
    case "SwitchStatement":
      walkExpression(stmt.discriminant, library, out);
      for (const c of stmt.cases) {
        if (c.test) walkExpression(c.test, library, out);
        for (const inner of c.body) walkStatement(inner, library, out);
      }
      return;
    case "ForOfStatement":
      walkExpression(stmt.iterable, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "ForClassicStatement":
      if (stmt.init) walkStatement(stmt.init, library, out);
      if (stmt.test) walkExpression(stmt.test, library, out);
      if (stmt.update) walkExpression(stmt.update, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "WhileStatement":
    case "DoWhileStatement":
      walkExpression(stmt.test, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "ForInStatement":
      walkExpression(stmt.iterable, library, out);
      for (const inner of stmt.body.body) walkStatement(inner, library, out);
      return;
    case "DestructureStatement":
      walkExpression(stmt.expression, library, out);
      for (const binding of stmt.bindings) {
        if (binding.defaultValue) walkExpression(binding.defaultValue, library, out);
      }
      return;
    case "TryStatement":
      for (const inner of stmt.block.body) walkStatement(inner, library, out);
      if (stmt.catchBlock) for (const inner of stmt.catchBlock.body) walkStatement(inner, library, out);
      if (stmt.finallyBlock) for (const inner of stmt.finallyBlock.body) walkStatement(inner, library, out);
      return;
    case "ThrowStatement":
      walkExpression(stmt.argument, library, out);
      return;
    default:
      return;
  }
}
function walkExpression(expr, library, out) {
  if (!expr) return;
  switch (expr.kind) {
    case "Call": {
      validateCall(expr, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    }
    case "MethodCall": {
      walkExpression(expr.object, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    }
    case "BuiltinCall": {
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    }
    case "Array":
      for (const e of expr.elements) walkExpression(e, library, out);
      return;
    case "Object":
      for (const prop of expr.properties) walkExpression(prop.value, library, out);
      return;
    case "Template":
      for (const e of expr.expressions) walkExpression(e, library, out);
      return;
    case "Binary":
      walkExpression(expr.left, library, out);
      walkExpression(expr.right, library, out);
      return;
    case "Unary":
      walkExpression(expr.argument, library, out);
      return;
    case "Ternary":
      walkExpression(expr.test, library, out);
      walkExpression(expr.consequent, library, out);
      walkExpression(expr.alternate, library, out);
      return;
    case "Member":
      walkExpression(expr.object, library, out);
      if (expr.computed) walkExpression(expr.computed, library, out);
      return;
    case "Spread":
      walkExpression(expr.argument, library, out);
      return;
    case "Invoke":
      if (expr.callee.kind === "StateRef" && expr.callee.name === "theme") {
        validateThemeCall(expr, out);
      }
      walkExpression(expr.callee, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    case "New":
      walkExpression(expr.callee, library, out);
      for (const arg of expr.arguments) walkExpression(arg, library, out);
      return;
    case "Lambda":
      if (expr.body.kind === "Block") {
        for (const inner of expr.body.body) walkStatement(inner, library, out);
      } else {
        walkExpression(expr.body, library, out);
      }
      return;
    case "Block":
      for (const inner of expr.body) walkStatement(inner, library, out);
      return;
    default:
      return;
  }
}
function validateCall(expr, library, out) {
  const spec = findComponent(library, expr.callee);
  if (!spec) return;
  const propNames = /* @__PURE__ */ new Set();
  for (const p of spec.props) {
    propNames.add(p.name);
    if (p.aliases) {
      for (const alias of p.aliases) propNames.add(alias);
    }
  }
  propNames.add("key");
  const args = expr.arguments;
  let trailingObjIdx = -1;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (args[i].kind === "Object") {
      trailingObjIdx = i;
      break;
    }
  }
  const trailingObj = trailingObjIdx >= 0 ? args[trailingObjIdx] : null;
  const positionalArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (i === trailingObjIdx) continue;
    positionalArgs.push(args[i]);
  }
  if (positionalArgs.length > 1) {
    const positionalProp = findPositionalProp(spec);
    const positionalName = positionalProp?.name ?? "(none)";
    const namedNames = collectNamedPropNames(args, trailingObj);
    const extras = spec.props.filter((p) => p.name !== positionalName && !namedNames.has(p.name)).slice(0, positionalArgs.length - 1).map((p) => p.name);
    const hints = extras.length > 0 ? extras.map((n) => `${n}: \u2026`).join(", ") : "use a trailing { prop: value } object";
    out.push({
      message: `${expr.callee}(...) \u2014 Aktion 0.5 \xA719.1 allows at most one positional argument (the "${positionalName}" prop). The extra ${positionalArgs.length - 1} positional argument(s) must be passed inside a trailing object: ${hints}. Multi-positional calls are removed.`,
      line: expr.loc?.line ?? 0,
      column: expr.loc?.column ?? 0
    });
  }
  const namedEntries = [];
  if (trailingObj) {
    for (const prop of trailingObj.properties) {
      if (prop.spread) continue;
      namedEntries.push({
        name: prop.key,
        value: prop.value,
        loc: prop.value.loc ?? trailingObj.loc
      });
    }
  }
  for (const entry of namedEntries) {
    if (!propNames.has(entry.name)) {
      out.push({
        message: `Unknown prop "${entry.name}" on <${expr.callee}>. Known props: ${spec.props.map((p) => p.name).join(", ")}.`,
        line: entry.loc?.line ?? expr.loc?.line ?? 0,
        column: entry.loc?.column ?? expr.loc?.column ?? 0
      });
      continue;
    }
    const prop = spec.props.find(
      (p) => p.name === entry.name || (p.aliases?.includes(entry.name) ?? false)
    );
    if (prop?.enum && entry.value.kind === "Literal" && typeof entry.value.value === "string") {
      const value = entry.value.value;
      if (!prop.enum.includes(value)) {
        out.push({
          message: `<${expr.callee}> ${entry.name}="${value}" \u2014 must be one of ${prop.enum.map((v) => `"${v}"`).join(", ")}.`,
          line: entry.loc?.line ?? expr.loc?.line ?? 0,
          column: entry.loc?.column ?? expr.loc?.column ?? 0
        });
      }
    }
  }
}
function collectNamedPropNames(_args, trailingObj) {
  const names = /* @__PURE__ */ new Set();
  if (trailingObj) {
    for (const prop of trailingObj.properties) {
      if (!prop.spread) names.add(prop.key);
    }
  }
  return names;
}
var STRUCTURED_THEME_GROUPS = /* @__PURE__ */ new Set(["colors", "radius", "font"]);
var THEME_METADATA_KEYS = /* @__PURE__ */ new Set(["name", "direction"]);
function validateThemeCall(expr, out) {
  const arg = expr.arguments[0];
  if (!arg || arg.kind !== "Object") return;
  for (const prop of arg.properties) {
    if (prop.spread) continue;
    if (STRUCTURED_THEME_GROUPS.has(prop.key)) continue;
    if (THEME_METADATA_KEYS.has(prop.key)) continue;
    const suggestion = suggestStructuredKey(prop.key);
    const message = prop.key.startsWith("--") ? `$theme({"${prop.key}": ...}) \u2014 free-form CSS variable keys are removed in Aktion 0.5. Use the structured form: $theme({ colors: {...}, radius: {...}, font: {...} }).` : `$theme({${prop.key}: ...}) \u2014 legacy flat-shape token is removed in Aktion 0.5. Use ${suggestion}.`;
    out.push({
      message,
      line: expr.loc?.line ?? 0,
      column: expr.loc?.column ?? 0
    });
  }
}
function suggestStructuredKey(flatKey) {
  const groups = [
    { prefix: "color", group: "colors" },
    { prefix: "radius", group: "radius" },
    { prefix: "font", group: "font" }
  ];
  for (const { prefix, group } of groups) {
    if (flatKey === prefix) continue;
    if (flatKey.startsWith(prefix) && flatKey.length > prefix.length) {
      const tail = flatKey.slice(prefix.length);
      const inner = tail.charAt(0).toLowerCase() + tail.slice(1);
      return `$theme({ ${group}: { ${inner}: ... } })`;
    }
  }
  return `$theme({ colors: {...}, radius: {...}, font: {...} })`;
}

// ../../src/language/grammar.ts
var grammarSpec = {
  name: "aktion",
  atoms: ["true", "false", "null", "undefined"],
  // Full reserved-word set, kept in sync with `KEYWORDS_AKTION` in
  // `src/parser/lexer.ts` plus the reserved top-level handle `aktion` and the
  // router handle `route`. Aktion's `$`-prefixed builtins (`$effect`, `$emit`,
  // …) lex as StateIdentifiers, so they are not in this keyword list. Every
  // entry is documented in `keywordDocs` so the playground can show a popup.
  keywords: [
    "function",
    "import",
    "export",
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
    "aktion",
    "route"
  ],
  operators: ["+", "-", "*", "/", "%", "!", "=", "<", ">", "?", ":", ".", ","],
  // Long operators include `??` and `?.` (nullish coalescing + optional chain)
  // and `...` (spread). Order matters: longest match wins.
  operatorsLong: ["...", "==", "!=", ">=", "<=", "&&", "||", "??", "?."],
  brackets: [
    { open: "(", close: ")" },
    { open: "[", close: "]" },
    { open: "{", close: "}" }
  ],
  comments: { line: "//", blockStart: "/*", blockEnd: "*/" },
  strings: {
    singleLineQuotes: ['"', "'"],
    multiLineQuote: "`"
  },
  identifier: {
    start: /[A-Za-z_]/,
    part: /[A-Za-z0-9_]/
  },
  sigils: { state: "$" }
};
var keywordDocs = {
  aktion: {
    summary: "Legacy entry-point binding \u2014 prefer the `$app(...)` builtin to register the root of the rendered UI tree.",
    syntax: "$app(Component(...))",
    example: '$app(Stack([Heading("Hi"), Text("Welcome")]))'
  },
  route: {
    summary: "Reactive router handle \u2014 exposes path, params, query, and navigate().",
    syntax: "route.path \xB7 route.params \xB7 route.query \xB7 route.navigate(path)",
    example: 'Button("Home", () => route.navigate("/"))'
  },
  $emit: {
    summary: "Dispatch a custom DOM event from the host element.",
    syntax: '$emit("event-name", detail)',
    example: 'Button("Save", () => $emit("saved", { id: $id }))'
  },
  import: {
    summary: "Import named bindings (components, actions, hooks, `$state`) from another `.aktion` file. Multi-file projects are linked in the browser.",
    syntax: 'import { Name, Other as Alias, $shared } from "./module.aktion"',
    example: 'import { Button } from "./Button.aktion"\nimport { $count } from "./store.aktion"'
  },
  export: {
    summary: "Mark a top-level declaration importable from another file. Anything not exported is private to its file.",
    syntax: "export function Name(...) { ... } \xB7 export $state = ... \xB7 export name = ...",
    example: "export function Card2({ title }) {\n  return Card([CardHeader(title)])\n}"
  },
  function: {
    summary: "Declare a component or action \u2014 first-letter case does not matter.",
    syntax: "function name(params) { ... }",
    example: "function Greeting(name) {\n  return Text(`Hello ${name}`)\n}"
  },
  $effect: {
    summary: "Run a side-effect when dependencies change (timers, fetch, analytics).",
    syntax: "$effect(() => { ... }, [deps])",
    example: '$effect(() => {\n  $now = $util.now()\n}, ["every(1000)"])'
  },
  if: {
    summary: "Conditional statement \u2014 run a block when a condition is truthy.",
    syntax: "if (condition) { ... } else { ... }",
    example: "if (!$user) {\n  return Spinner()\n}"
  },
  else: {
    summary: "Fallback branch executed when the matching `if` condition is falsy.",
    syntax: "if (condition) { ... } else { ... }",
    example: "if ($ok) { return Done() } else { return Retry() }"
  },
  switch: {
    summary: "Multi-way branch on a value \u2014 pair each arm with `case` / `default`.",
    syntax: "switch (value) { case x: ...; default: ... }",
    example: 'switch (tab) {\n  case "list": return List()\n  default: return Empty()\n}'
  },
  case: {
    summary: "A labelled arm inside a `switch` statement.",
    syntax: "case value: statements; break",
    example: 'case "grid": return Grid($items)'
  },
  break: {
    summary: "Exit the nearest enclosing loop or `switch` immediately.",
    syntax: "break",
    example: "for (let i = 0; i < n; i++) {\n  if (done) break\n}"
  },
  continue: {
    summary: "Skip to the next iteration of the nearest enclosing loop.",
    syntax: "continue",
    example: "for (let x of items) {\n  if (!x.ok) continue\n}"
  },
  for: {
    summary: "Loop \u2014 classic `for`, `for\u2026of` (values), or `for\u2026in` (keys).",
    syntax: "for (let i = 0; i < n; i++) { ... }",
    example: "for (let item of $items) {\n  log(item)\n}"
  },
  while: {
    summary: "Loop while a condition stays truthy (checked before each pass).",
    syntax: "while (condition) { ... }",
    example: "while (i > 0) {\n  i = i - 1\n}"
  },
  do: {
    summary: "Run a block once, then repeat while a condition holds.",
    syntax: "do { ... } while (condition)",
    example: "do {\n  step()\n} while (hasMore)"
  },
  of: {
    summary: "Iterate the VALUES of an array/iterable in a `for\u2026of` loop.",
    syntax: "for (let item of iterable) { ... }",
    example: "for (let row of $rows) { render(row) }"
  },
  in: {
    summary: "Iterate the KEYS of an object (`for\u2026in`) or test key membership.",
    syntax: 'for (let key in obj) { ... }  \xB7  "key" in obj',
    example: "for (let k in $config) { use(k) }"
  },
  let: {
    summary: "Declare a block-scoped mutable variable (supports destructuring).",
    syntax: "let name = value  \xB7  let [a, b] = arr  \xB7  let { x } = obj",
    example: "let { name, age = 0 } = $user"
  },
  var: {
    summary: "Declare a variable (function-scoped) \u2014 `let` is preferred.",
    syntax: "var name = value",
    example: "var total = 0"
  },
  const: {
    summary: "Declare a block-scoped constant binding (supports destructuring).",
    syntax: "const name = value",
    example: "const [first, ...rest] = $items"
  },
  await: {
    summary: "Await a promise inside an action/effect body (or expression).",
    syntax: "await expression",
    example: 'let res = await $http({ url: "https://api.example.com" })'
  },
  async: {
    summary: "Marks a function as async \u2014 accepted as a no-op modifier.",
    syntax: "async function name() { ... }",
    example: "async function load() {\n  let data = await fetch()\n}"
  },
  return: {
    summary: "Return a value from a component / action / helper body.",
    syntax: "return expression",
    example: 'return Card({ title: "Done" })'
  },
  default: {
    summary: "The fallback arm of a `switch` (or wildcard route in Router).",
    syntax: "default: statements",
    example: "default: return NotFound()"
  },
  try: {
    summary: "Run code that may throw, handling errors in a `catch` block.",
    syntax: "try { ... } catch (e) { ... } finally { ... }",
    example: "try {\n  risky()\n} catch (e) {\n  log(e)\n}"
  },
  catch: {
    summary: "Handle an error thrown inside the preceding `try` block.",
    syntax: "catch (error) { ... }",
    example: "catch (e) { $error = e }"
  },
  finally: {
    summary: "Run cleanup after `try` / `catch`, regardless of outcome.",
    syntax: "finally { ... }",
    example: "finally { $loading = false }"
  },
  throw: {
    summary: "Raise an error \u2014 caught by an enclosing `try` / `catch`.",
    syntax: "throw value",
    example: 'throw "invalid state"'
  },
  new: {
    summary: "Construct an instance of a host class (Date, Map, Set, \u2026).",
    syntax: "new Constructor(args)",
    example: "let now = new Date()"
  },
  typeof: {
    summary: `Return a string naming a value's type ("number", "string", \u2026).`,
    syntax: "typeof value",
    example: 'if (typeof x === "number") { ... }'
  },
  instanceof: {
    summary: "Test whether a value is an instance of a constructor.",
    syntax: "value instanceof Constructor",
    example: "if (d instanceof Date) { ... }"
  },
  delete: {
    summary: "Remove a property from an object.",
    syntax: "delete obj.prop",
    example: "delete $form.draft"
  },
  void: {
    summary: "Evaluate an expression and yield `undefined`.",
    syntax: "void expression",
    example: "void sideEffect()"
  }
};
function createStreamTokenizer(spec = grammarSpec) {
  const startState = () => ({ inBacktick: false, inBlockComment: false });
  const copyState = (state) => ({ ...state });
  const atomSet = new Set(spec.atoms);
  const keywordSet = new Set(spec.keywords);
  const componentCallRe = /^[A-Z][A-Za-z0-9_]*/;
  const lowerIdentRe = /^[a-z_][A-Za-z0-9_]*/;
  const numberRe = /^-?\d+(?:\.\d+)?/;
  const operatorChars = /* @__PURE__ */ new Set([...spec.operators.join(""), ..."=<>!&|"]);
  const consumeStringBody = (stream, quote) => {
    while (!stream.eol()) {
      const ch = stream.next();
      if (!ch) return;
      if (ch === "\\") {
        stream.next();
        continue;
      }
      if (ch === quote) return;
    }
  };
  const token = (stream, state) => {
    if (state.inBacktick) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") {
          stream.next();
          continue;
        }
        if (ch === "`") {
          state.inBacktick = false;
          return "string";
        }
      }
      return "string";
    }
    if (state.inBlockComment) {
      while (!stream.eol()) {
        if (stream.match(spec.comments.blockEnd, true)) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }
    if (stream.eatWhile(/[ \t]/)) return null;
    if (stream.match(spec.comments.line, true)) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(spec.comments.blockStart, true)) {
      state.inBlockComment = true;
      while (!stream.eol()) {
        if (stream.match(spec.comments.blockEnd, true)) {
          state.inBlockComment = false;
          return "comment";
        }
        stream.next();
      }
      return "comment";
    }
    const next = stream.peek();
    if (next === null || next === void 0) return null;
    if (spec.strings.singleLineQuotes.includes(next)) {
      const quote = next;
      stream.next();
      consumeStringBody(stream, quote);
      return "string";
    }
    if (next === spec.strings.multiLineQuote) {
      stream.next();
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === "\\") {
          stream.next();
          continue;
        }
        if (ch === "`") return "string";
      }
      state.inBacktick = true;
      return "string";
    }
    if (next >= "0" && next <= "9") {
      if (stream.match(numberRe, true)) return "number";
    }
    if (next === "-" && stream.match(/^-\d+(?:\.\d+)?/, false)) {
      if (stream.match(numberRe, true)) return "number";
    }
    if (next === spec.sigils.state) {
      stream.next();
      if (stream.peek() === spec.sigils.state) stream.next();
      stream.eatWhile(spec.identifier.part);
      return "state";
    }
    if (spec.identifier.start.test(next)) {
      const upper = stream.match(componentCallRe, true);
      if (upper) {
        return "component";
      }
      const lower = stream.match(lowerIdentRe, true);
      if (lower) {
        const text = lower[0];
        if (atomSet.has(text)) return "atom";
        if (keywordSet.has(text)) return "keyword";
        const ahead = stream.peek();
        if (ahead === ".") return "loopvar";
        return "identifier";
      }
    }
    for (const op of spec.operatorsLong) {
      if (stream.match(op, true)) return "operator";
    }
    if (next === ".") {
      stream.next();
      if (stream.peek() && spec.identifier.start.test(stream.peek())) {
        stream.eatWhile(spec.identifier.part);
        return "property";
      }
      return "punctuation";
    }
    if ("()[]{},:?".includes(next)) {
      stream.next();
      return "punctuation";
    }
    if (operatorChars.has(next)) {
      stream.next();
      return "operator";
    }
    stream.next();
    return null;
  };
  return {
    startState,
    copyState,
    token,
    languageData: {
      commentTokens: { line: spec.comments.line, block: { open: spec.comments.blockStart, close: spec.comments.blockEnd } },
      closeBrackets: { brackets: ["(", "[", "{", '"', "'", "`"] },
      indentOnInput: /^\s*[)\]}]$/
    }
  };
}
var defaultTagMap = {
  comment: "comment",
  string: "string",
  number: "number",
  atom: "atom",
  keyword: "keyword",
  state: "variableName.special",
  component: "typeName",
  identifier: "variableName",
  loopvar: "variableName.local",
  property: "propertyName",
  operator: "operator",
  punctuation: null
};

// ../../src/language/builtins.ts
var builtinCatalog = [
  // Hooks (per-instance state — mirror React's use* family).
  {
    name: "state",
    sigil: "$state",
    category: "hook",
    signature: "$state(initial)",
    summary: "Hook: per-instance state \u2192 [value, setValue] (like React's useState)."
  },
  {
    name: "memo",
    sigil: "$memo",
    category: "hook",
    signature: "$memo(() => value, [deps])",
    summary: "Hook: value recomputed only when a dependency changes (like useMemo)."
  },
  {
    name: "ref",
    sigil: "$ref",
    category: "hook",
    signature: "$ref(initial)",
    summary: "Hook: stable { current } box; writing .current does not re-render (like useRef)."
  },
  {
    name: "reducer",
    sigil: "$reducer",
    category: "hook",
    signature: "$reducer((state, action) => next, initial)",
    summary: "Hook: [state, dispatch] (like useReducer)."
  },
  {
    name: "id",
    sigil: "$id",
    category: "hook",
    signature: "$id(prefix?)",
    summary: "Hook: stable unique id per component instance (like useId)."
  },
  // Effects + reactivity.
  {
    name: "effect",
    sigil: "$effect",
    category: "effect",
    signature: "$effect(() => { \u2026 }, [deps])",
    summary: 'Declarative side effect; deps mix $state, "mount"/"unmount", "every(N)", "debounce(N)".'
  },
  {
    name: "optimistic",
    sigil: "$optimistic",
    category: "effect",
    signature: "$optimistic(() => { \u2026 })",
    summary: "Run optimistic writes; auto-rolls back state if the callback throws or rejects."
  },
  {
    name: "store",
    sigil: "$store",
    category: "effect",
    signature: "$store({ ...state, ...methods })",
    summary: "Global store: shared state + actions (like Zustand/Pinia)."
  },
  // Data layer.
  {
    name: "http",
    sigil: "$http",
    category: "data",
    signature: "$http({ url, method, \u2026 })",
    summary: "Reactive HTTP resource bag \u2014 { data, loading, error, refetch }."
  },
  {
    name: "query",
    sigil: "$query",
    category: "data",
    signature: "$query({ url, key, ttl })",
    summary: "Cached + deduplicated HTTP read."
  },
  {
    name: "mutation",
    sigil: "$mutation",
    category: "data",
    signature: "$mutation({ url, method })",
    summary: "Deferred write; fires on .mutate(overrides?)."
  },
  // App / routing / theming / events.
  {
    name: "app",
    sigil: "$app",
    category: "app",
    signature: "$app(root)",
    summary: "Register the root of the rendered UI tree \u2014 every program needs one."
  },
  {
    name: "router",
    sigil: "$router",
    category: "routing",
    signature: "$router({ '/': Home(), default: NotFound() })",
    summary: "Outlet-first router: maps path patterns to component trees."
  },
  {
    name: "theme",
    sigil: "$theme",
    category: "theme",
    signature: "$theme({ colors, radius, font, \u2026 })",
    summary: "In-script theme override merged on top of the active base theme."
  },
  {
    name: "emit",
    sigil: "$emit",
    category: "event",
    signature: "$emit('name', detail)",
    summary: "Dispatch a CustomEvent from the host element."
  },
  // Namespaces (members reached via `.`).
  {
    name: "util",
    sigil: "$util",
    category: "namespace",
    signature: "$util",
    summary: "Runtime helper namespace ($util.format, $util.sum, $util.range, \u2026).",
    namespace: true
  },
  {
    name: "storage",
    sigil: "$storage",
    category: "namespace",
    signature: "$storage",
    summary: "Persistent storage namespace ($storage.local, $storage.session, \u2026).",
    namespace: true
  },
  {
    name: "console",
    sigil: "$console",
    category: "namespace",
    signature: "$console",
    summary: "Console namespace ($console.log, $console.warn, \u2026).",
    namespace: true
  },
  {
    name: "toast",
    sigil: "$toast",
    category: "namespace",
    signature: "$toast",
    summary: "Imperative toasts: $toast.show/.success/.error/.dismiss; reactive .items.",
    namespace: true
  },
  {
    name: "i18n",
    sigil: "$i18n",
    category: "data",
    signature: "$i18n({ translations, \u2026 })",
    summary: "Translation bundle \u2192 { t, setCurrentLanguage, getCurrentLanguage }."
  }
];
var builtinNames = new Set(
  builtinCatalog.map((b) => b.name)
);
var builtinsByName = Object.freeze(
  Object.fromEntries(builtinCatalog.map((b) => [b.name, b]))
);
function findBuiltin(bareName) {
  return builtinsByName[bareName];
}
function isBuiltinName(bareName) {
  return builtinNames.has(bareName);
}

// ../../src/tooling/language-service.ts
var KEYWORDS2 = [
  { label: "function", detail: "Declare a component or action \u2014 either case works" },
  { label: "$effect", detail: "Reactive side-effect: $effect(() => { ... }, [deps])" },
  { label: "$router", detail: "pages = $router({ '/': Home(), default: NotFound() })" },
  { label: "switch", detail: "switch (value) { case \u2026: \u2026; break; default: \u2026 }" },
  { label: "for", detail: "for (let x of xs) { \u2026 }" },
  { label: "if", detail: "if (condition) { \u2026 } else { \u2026 }" },
  { label: "return", detail: "Return value from a component or action" },
  { label: "let", detail: "Declare a variable (reactive if $-prefixed)" },
  { label: "const", detail: "Declare a constant" },
  { label: "$emit", detail: "$emit('name', detail) \u2014 dispatch a CustomEvent" },
  { label: "cleanup", detail: "Register an effect teardown callback" }
];
function getDiagnostics(source, library) {
  const program = parse(source);
  const schemaErrors = validateProgramSchema(program, library);
  return [
    ...program.errors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
      severity: "error"
    })),
    ...schemaErrors.map((e) => ({
      line: e.line,
      column: e.column,
      message: e.message,
      severity: "error"
    }))
  ];
}
function getCompletions(source, position, library) {
  const ctx = analyseCursor(source, position);
  const user = collectUserSymbols(source);
  if (ctx.afterDollar) {
    return [
      ...user.atoms.map((name) => ({
        label: `$${name}`,
        kind: "state",
        detail: "Reactive atom declared in this file"
      })),
      { label: "$name = value", kind: "state", detail: "Declare or assign a reactive atom" },
      ...builtinCatalog.map((b) => ({
        label: b.signature,
        kind: "builtin",
        detail: b.summary
      }))
    ];
  }
  const general = generalCompletions(library, user);
  if (ctx.objectCallee) {
    const spec = findComponent(library, ctx.objectCallee);
    if (spec) return [...propCompletions(spec), ...general];
  }
  return general;
}
function generalCompletions(library, user) {
  const keywordItems = /* @__PURE__ */ new Map();
  for (const [label, doc] of Object.entries(keywordDocs)) {
    keywordItems.set(label, {
      label,
      kind: "keyword",
      detail: doc.summary,
      documentation: `${doc.syntax}

${doc.example}`
    });
  }
  for (const k of KEYWORDS2) {
    if (!keywordItems.has(k.label)) {
      keywordItems.set(k.label, { label: k.label, kind: "keyword", detail: k.detail });
    }
  }
  return [
    // Author-declared symbols first so they rank above the large library
    // list in editors that preserve provider order.
    ...user.components.map((name) => ({
      label: name,
      kind: "component",
      detail: "Component declared in this file"
    })),
    ...user.actions.map((name) => ({
      label: name,
      kind: "builtin",
      detail: "Action declared in this file"
    })),
    ...user.atoms.map((name) => ({
      label: `$${name}`,
      kind: "state",
      detail: "Reactive atom declared in this file"
    })),
    ...keywordItems.values(),
    ...library.components.map((c) => ({
      label: c.name,
      kind: "component",
      detail: signaturePreview(c),
      documentation: c.description
    }))
  ];
}
function collectUserSymbols(source) {
  const atoms = /* @__PURE__ */ new Set();
  const components2 = /* @__PURE__ */ new Set();
  const actions = /* @__PURE__ */ new Set();
  try {
    const program = parse(source);
    for (const stmt of program.statements) {
      if (stmt.kind === "Assignment" && stmt.isState && stmt.identifier) {
        atoms.add(stmt.identifier);
      } else if (stmt.kind === "ComponentDeclaration" && stmt.name) {
        components2.add(stmt.name);
      } else if (stmt.kind === "ActionDeclaration" && stmt.name) {
        actions.add(stmt.name);
      }
    }
  } catch {
  }
  return { atoms: [...atoms], components: [...components2], actions: [...actions] };
}
function getHoverInfo(source, position, library) {
  const word = wordAt(source, position);
  if (!word) return null;
  const spec = findComponent(library, word);
  if (spec) {
    return {
      kind: "component",
      contents: `**${spec.name}** \u2014 ${spec.description ?? "Component."}

Signature: \`${signaturePreview(spec)}\``
    };
  }
  if (word.startsWith("$")) {
    const builtin = findBuiltin(word.slice(1));
    if (builtin) {
      return {
        kind: "builtin",
        contents: `**${builtin.sigil}** \u2014 ${builtin.summary}

Signature: \`${builtin.signature}\``
      };
    }
    return { kind: "state", contents: `**${word}** \u2014 reactive state atom` };
  }
  const doc = keywordDocs[word];
  if (doc) {
    return { kind: "unknown", contents: formatKeywordHover(word, doc) };
  }
  const kw = KEYWORDS2.find((k) => k.label === word);
  if (kw) {
    return { kind: "unknown", contents: `**${word}** \u2014 ${kw.detail}` };
  }
  return null;
}
function formatKeywordHover(word, doc) {
  return `**${word}** \u2014 ${doc.summary}

**Syntax**

\`\`\`js
${doc.syntax}
\`\`\`

**Example**

\`\`\`js
${doc.example}
\`\`\``;
}
function analyseCursor(source, position) {
  const offset = lineColumnToOffset(source, position);
  const prefix = source.slice(0, offset);
  const afterDollar = /\$[A-Za-z_]*$/.test(prefix);
  const stack = [];
  for (let i = 0; i < prefix.length; i += 1) {
    const ch = prefix[i];
    if (ch === "/" && prefix[i + 1] === "/") {
      while (i < prefix.length && prefix[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && prefix[i + 1] === "*") {
      i += 2;
      while (i < prefix.length && !(prefix[i] === "*" && prefix[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipStringLiteral(prefix, i, ch);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push({ bracket: ch, callee: ch === "(" ? identifierBefore(prefix, i) : "" });
    } else if (ch === ")" || ch === "]" || ch === "}") {
      stack.pop();
    }
  }
  let objectCallee;
  const top = stack[stack.length - 1];
  if (top && top.bracket === "{") {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].bracket === "(") {
        const callee = stack[i].callee;
        if (callee) objectCallee = callee;
        break;
      }
    }
  }
  return { objectCallee, afterDollar };
}
function skipStringLiteral(source, start, quote) {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i;
    i += 1;
  }
  return source.length - 1;
}
function identifierBefore(source, openIndex) {
  let end = openIndex;
  while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1])) start -= 1;
  return source.slice(start, end);
}
function propCompletions(spec) {
  const positional = findPositionalProp(spec);
  return spec.props.map((prop) => ({
    label: `${prop.name}:`,
    kind: "prop",
    detail: propDetail(prop, positional?.name === prop.name),
    documentation: prop.description
  }));
}
function propDetail(prop, isPositional) {
  const tags = [];
  if (isPositional) tags.push("positional");
  if (prop.required) tags.push("required");
  if (prop.enum) tags.push(`enum: ${prop.enum.map((e) => `"${e}"`).join(" | ")}`);
  const tagText = tags.length > 0 ? ` (${tags.join(", ")})` : "";
  return `${prop.type}${tagText}`;
}
function signaturePreview(spec) {
  const positional = findPositionalProp(spec);
  const positionalLabel = positional ? positional.name : "";
  const rest = spec.props.filter((p) => p.name !== positional?.name).map((p) => `${p.name}${p.optional || !p.required ? "?" : ""}: ${p.type}`).join(", ");
  if (positionalLabel === "" && rest === "") return `${spec.name}()`;
  if (positionalLabel === "") return `${spec.name}(${rest})`;
  if (rest === "") return `${spec.name}(${positionalLabel})`;
  return `${spec.name}(${positionalLabel}, ${rest})`;
}
function lineColumnToOffset(source, pos) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < source.length; i += 1) {
    if (line === pos.line && col === pos.column) return i;
    if (source[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return source.length;
}
function wordAt(source, pos) {
  const offset = lineColumnToOffset(source, pos);
  const isWord = (c) => /[\w$]/.test(c);
  let start = offset;
  while (start > 0 && isWord(source[start - 1])) start -= 1;
  let end = offset;
  while (end < source.length && isWord(source[end])) end += 1;
  if (start === end) return null;
  return source.slice(start, end);
}

// ../../src/tooling/navigation.ts
function getDefinition(source, position) {
  const tokens = tokenize(source);
  const tok = findNameTokenAt(tokens, position);
  if (!tok) return null;
  const sym = resolveSymbol(tokens, tok);
  return sym ? sym.range : null;
}
function getDefinitionTarget(source, position) {
  const tokens = tokenize(source);
  const imports = parseImports(tokens);
  for (const clause of imports) {
    if (clause.sourceRange && positionInRange(position, clause.sourceRange)) {
      return { kind: "module", moduleSource: clause.source };
    }
  }
  const tok = findNameTokenAt(tokens, position);
  if (!tok) return null;
  const wantsState = tok.type === "StateIdentifier";
  for (const clause of imports) {
    for (const spec of clause.specifiers) {
      if (spec.local === tok.value && spec.isState === wantsState) {
        return {
          kind: "import-binding",
          imported: spec.imported,
          isState: spec.isState,
          moduleSource: clause.source
        };
      }
    }
  }
  const sym = resolveSymbol(tokens, tok);
  if (sym && sym.kind !== "import") return { kind: "local", range: sym.range };
  return null;
}
function findDeclaration(source, name, isState) {
  const table = collectSymbols(tokenize(source));
  const decl = isState ? table.state.get(name) : table.ident.get(name);
  if (!decl || decl.kind === "import") return null;
  return decl.range;
}
function getReferences(source, position, options = {}) {
  const includeDeclaration = options.includeDeclaration ?? true;
  const tokens = tokenize(source);
  const tok = findNameTokenAt(tokens, position);
  if (!tok) return [];
  const refs = occurrences(tokens, tok.type, tok.value);
  if (includeDeclaration) return refs;
  const sym = resolveSymbol(tokens, tok);
  if (!sym) return refs;
  return refs.filter((r) => !rangesEqual(r, sym.range));
}
function getDocumentHighlights(source, position) {
  return getReferences(source, position, { includeDeclaration: true });
}
function getRenameEdits(source, position, newName) {
  const tokens = tokenize(source);
  const tok = findNameTokenAt(tokens, position);
  if (!tok) return { edits: [], error: "No symbol to rename at this position." };
  const sym = resolveSymbol(tokens, tok);
  if (!sym) {
    return {
      edits: [],
      error: "Only file-scoped components, actions, hooks, and reactive atoms can be renamed."
    };
  }
  const bare = sym.sigil ? newName.replace(/^\$/, "") : newName;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare)) {
    return { edits: [], error: `"${newName}" is not a valid Aktion identifier.` };
  }
  const replacement = sym.sigil ? `$${bare}` : bare;
  const edits = occurrences(tokens, tok.type, tok.value).map((range) => ({
    range,
    newText: replacement
  }));
  return { edits };
}
function getDocumentSymbols(source) {
  const tokens = tokenize(source);
  const table = collectSymbols(tokens);
  return table.all.map((decl) => ({
    name: decl.sigil ? `$${decl.name}` : decl.name,
    detail: detailFor(decl.kind),
    kind: decl.kind,
    range: decl.range,
    selectionRange: decl.range
  }));
}
function resolveSymbol(tokens, tok) {
  const table = collectSymbols(tokens);
  if (tok.type === "StateIdentifier") return table.state.get(tok.value) ?? null;
  return table.ident.get(tok.value) ?? null;
}
function collectSymbols(tokens) {
  const table = { state: /* @__PURE__ */ new Map(), ident: /* @__PURE__ */ new Map(), all: [] };
  const add = (decl) => {
    const bucket = decl.sigil ? table.state : table.ident;
    if (bucket.has(decl.name)) return;
    bucket.set(decl.name, decl);
    table.all.push(decl);
  };
  let depth = 0;
  let stmtStart = true;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === "Newline" || t.type === "Semicolon") {
      stmtStart = true;
      continue;
    }
    if (t.type === "EOF") break;
    if (t.type === "Keyword" && t.value === "import") {
      i = scanImport(tokens, i, add);
      stmtStart = true;
      continue;
    }
    if (t.type === "Keyword" && t.value === "function") {
      const nameTok = nextMeaningful(tokens, i + 1);
      if (nameTok) {
        if (nameTok.type === "StateIdentifier") {
          add({ name: nameTok.value, kind: "hook", sigil: true, range: tokenRange(nameTok) });
        } else if (nameTok.type === "Identifier") {
          add({
            name: nameTok.value,
            kind: isPascalCase(nameTok.value) ? "component" : "action",
            sigil: false,
            range: tokenRange(nameTok)
          });
        }
      }
    }
    if (t.type === "StateIdentifier" && stmtStart && depth === 0) {
      const next = nextMeaningful(tokens, i + 1);
      if (next && next.type === "Operator" && next.value === "=") {
        add({ name: t.value, kind: "state", sigil: true, range: tokenRange(t) });
      }
    }
    if (t.type === "Punctuation" && t.value === "{") {
      depth += 1;
      stmtStart = true;
    } else if (t.type === "Punctuation" && t.value === "}") {
      depth = Math.max(0, depth - 1);
      stmtStart = true;
    } else if (t.type === "Keyword" && t.value === "export") {
    } else {
      stmtStart = false;
    }
  }
  return table;
}
function scanImport(tokens, start, add) {
  const { clause, end } = readImportClause(tokens, start);
  for (const spec of clause.specifiers) {
    add({ name: spec.local, kind: "import", sigil: spec.isState, range: spec.localRange });
  }
  return end;
}
function parseImports(tokens) {
  const clauses = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type === "Keyword" && tokens[i].value === "import") {
      const { clause, end } = readImportClause(tokens, i);
      clauses.push(clause);
      i = end;
    }
  }
  return clauses;
}
function readImportClause(tokens, start) {
  const names = [];
  let source = "";
  let sourceRange = null;
  let i = start + 1;
  for (; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === "Newline" || t.type === "Semicolon" || t.type === "EOF") break;
    if (t.type === "Identifier" && t.value === "from") {
      const src = nextMeaningful(tokens, i + 1);
      if (src && src.type === "String") {
        source = src.value;
        sourceRange = {
          start: { line: src.line, column: src.column },
          end: { line: src.line, column: src.column + src.value.length + 2 }
        };
      }
      break;
    }
    if (t.type === "Punctuation") continue;
    if (t.type === "Identifier" || t.type === "StateIdentifier") names.push(t);
  }
  const specifiers = [];
  for (let n = 0; n < names.length; n += 1) {
    const nameTok = names[n];
    const asTok = names[n + 1];
    if (asTok && asTok.type === "Identifier" && asTok.value === "as" && names[n + 2]) {
      const aliasTok = names[n + 2];
      specifiers.push({
        imported: nameTok.value,
        local: aliasTok.value,
        isState: aliasTok.type === "StateIdentifier",
        localRange: tokenRange(aliasTok)
      });
      n += 2;
    } else {
      specifiers.push({
        imported: nameTok.value,
        local: nameTok.value,
        isState: nameTok.type === "StateIdentifier",
        localRange: tokenRange(nameTok)
      });
    }
  }
  return { clause: { source, sourceRange, specifiers }, end: i - 1 };
}
function positionInRange(position, range) {
  if (position.line !== range.start.line || position.line !== range.end.line) return false;
  return position.column >= range.start.column && position.column <= range.end.column;
}
function occurrences(tokens, type, value) {
  const out = [];
  for (const t of tokens) {
    if (t.type === type && t.value === value) out.push(tokenRange(t));
  }
  return out;
}
function findNameTokenAt(tokens, position) {
  let best = null;
  for (const t of tokens) {
    if (t.type !== "Identifier" && t.type !== "StateIdentifier") continue;
    if (t.line !== position.line) continue;
    const startCol = t.column;
    const endCol = t.column + tokenTextLength(t);
    if (position.column >= startCol && position.column <= endCol) {
      if (!best || t.column > best.column) best = t;
    }
  }
  return best;
}
function nextMeaningful(tokens, from) {
  for (let i = from; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === "Newline") continue;
    return t;
  }
  return null;
}
function tokenTextLength(t) {
  return t.type === "StateIdentifier" ? t.value.length + 1 : t.value.length;
}
function tokenRange(t) {
  const length = tokenTextLength(t);
  return {
    start: { line: t.line, column: t.column },
    end: { line: t.line, column: t.column + length }
  };
}
function rangesEqual(a, b) {
  return a.start.line === b.start.line && a.start.column === b.start.column && a.end.line === b.end.line && a.end.column === b.end.column;
}
function isPascalCase(name) {
  return /^[A-Z]/.test(name);
}
function detailFor(kind) {
  switch (kind) {
    case "component":
      return "component";
    case "action":
      return "action";
    case "hook":
      return "hook";
    case "state":
      return "reactive atom";
    case "import":
      return "import";
    default:
      return "";
  }
}

// ../../src/icons/index.ts
var SUPPORTED_VARIANTS = /* @__PURE__ */ new Set(["solid", "regular", "brands"]);
var DEFAULT_VARIANT = "solid";
function resolveIconClasses(value) {
  if (typeof value !== "string") return [];
  const sanitized = stripInvisibleModifiers(value).trim();
  if (!sanitized) return [];
  if (!isAsciiIconName(sanitized)) return [];
  const [variant, name] = splitVariant(sanitized);
  if (!name) return [];
  return [`fa-${variant}`, `fa-${name}`];
}
var INVISIBLE_MODIFIER_RE = /[\uFE0E\uFE0F\u200D\u200C\uFEFF]/g;
function stripInvisibleModifiers(input) {
  return input.replace(INVISIBLE_MODIFIER_RE, "");
}
function splitVariant(input) {
  const idx = input.indexOf(":");
  if (idx === -1) return [DEFAULT_VARIANT, input];
  const variant = input.slice(0, idx).trim().toLowerCase();
  const name = input.slice(idx + 1).trim();
  if (!SUPPORTED_VARIANTS.has(variant)) return [DEFAULT_VARIANT, name || input];
  return [variant, name];
}
function isAsciiIconName(value) {
  return /^[a-zA-Z0-9:_-]+$/.test(value);
}
var ICON_SIZES = ["xs", "sm", "md", "lg", "xl"];

// ../../src/library/utils.ts
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === void 0 || value === false) continue;
      if (key === "class") node.setAttribute("class", String(value));
      else if (key === "html") node.innerHTML = String(value);
      else if (value === true) node.setAttribute(key, "");
      else node.setAttribute(key, String(value));
    }
  }
  if (children) {
    for (const child of children) {
      if (child === null || child === void 0) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === void 0) return [];
  return [value];
}
function asString(value, fallback = "") {
  if (value === null || value === void 0) return fallback;
  if (typeof value === "string") return value;
  return String(value);
}
function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === null || value === void 0) return fallback;
  return Boolean(value);
}
function asNumber(value, fallback = 0) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
var RESPONSIVE_BREAKPOINTS = ["base", "sm", "md", "lg", "xl"];
function readResponsiveProp(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "single", value: value ?? null };
  }
  const entries = Object.entries(value);
  const values = {};
  let matched = false;
  for (const [key, raw] of entries) {
    if (RESPONSIVE_BREAKPOINTS.includes(key)) {
      values[key] = raw;
      matched = true;
    }
  }
  if (!matched) {
    return { kind: "single", value };
  }
  return { kind: "responsive", values };
}
var CSS_URL_FORBIDDEN = /["'\\\n\r<>;{}]/g;
function sanitiseCssUrl(raw) {
  if (!raw) return "";
  return raw.replace(CSS_URL_FORBIDDEN, "").trim();
}
var CSS_LENGTH_ALLOWED = /^[a-zA-Z0-9.%+\-*/\s(),]+$/;
function sanitiseCssLength(raw, fallback) {
  const trimmed = (asString(raw) ?? "").trim();
  if (!trimmed) return fallback;
  if (trimmed.length > 64) return fallback;
  if (!CSS_LENGTH_ALLOWED.test(trimmed)) return fallback;
  return trimmed;
}
var CSS_COLOR_ALLOWED = /^[a-zA-Z0-9#%.,()\s+\-]+$/;
function sanitiseCssColor(raw) {
  const trimmed = asString(raw).trim();
  if (!trimmed) return "";
  if (trimmed.length > 64) return "";
  if (!CSS_COLOR_ALLOWED.test(trimmed)) return "";
  if (/\burl\s*\(|\bexpression\s*\(|javascript\s*:|@import\b/i.test(trimmed)) return "";
  return trimmed;
}
var SAFE_HREF_SCHEMES = /* @__PURE__ */ new Set(["http", "https", "mailto", "tel"]);
function sanitiseHref(raw, fallback = "#") {
  const value = asString(raw).trim();
  if (!value) return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!cleaned) return fallback;
  if (cleaned.startsWith("//")) return fallback;
  if (cleaned.startsWith("#") || cleaned.startsWith("/") || cleaned.startsWith("?") || cleaned.startsWith(".")) {
    return cleaned;
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(cleaned);
  if (!schemeMatch) {
    return cleaned;
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (!SAFE_HREF_SCHEMES.has(scheme)) return fallback;
  return cleaned;
}
var SAFE_IMAGE_SCHEMES = /* @__PURE__ */ new Set(["http", "https", "data", "blob"]);
function sanitiseImageSrc(raw) {
  const value = asString(raw).trim();
  if (!value) return "";
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("//")) return "";
  if (cleaned.startsWith("/") || cleaned.startsWith(".") || cleaned.startsWith("?") || cleaned.startsWith("#")) {
    return cleaned;
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(cleaned);
  if (!schemeMatch) return cleaned;
  const scheme = schemeMatch[1].toLowerCase();
  if (!SAFE_IMAGE_SCHEMES.has(scheme)) return "";
  if (scheme === "data" && !/^data:image\//i.test(cleaned)) return "";
  return cleaned;
}
function isComponentNode(value) {
  if (value === null || typeof value !== "object") return false;
  const kind = value.__kind;
  return kind === "Component" || kind === "UserComponent";
}
function fillTableCell(td, col, value, rowIndex, helpers, formatValue) {
  const format = col.format ?? "text";
  let content = value;
  if (typeof col.render === "function") {
    try {
      content = col.render(value, rowIndex);
    } catch (err) {
      console.error("[aktion] Col render() threw", err);
      content = null;
    }
  }
  const appendOne = (item) => {
    if (isComponentNode(item)) {
      td.append(helpers.renderNode(item));
    } else if (item !== null && item !== void 0) {
      td.append(document.createTextNode(formatValue(item, format)));
    }
  };
  if (Array.isArray(content)) {
    for (const item of content) appendOne(item);
  } else {
    appendOne(content);
  }
  if (typeof col.onClick === "function") {
    td.setAttribute("data-clickable", "true");
    td.setAttribute("role", "button");
    td.tabIndex = 0;
    const guardedFire = (event) => {
      const target = event.target;
      if (target?.closest("input,button,a,label,select,textarea")) return false;
      event.stopPropagation();
      helpers.invoke(col.onClick, value, rowIndex);
      return true;
    };
    td.onclick = (event) => {
      guardedFire(event);
    };
    td.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (guardedFire(event)) event.preventDefault();
    };
  }
}
function renderIcon(value, options = {}) {
  const text = asString(value);
  if (!text) return null;
  const color = options.color ? sanitiseCssColor(options.color) : "";
  const style = color ? `color:${color};` : null;
  const classes = resolveIconClasses(text);
  const wrapperClass = ["rui-icon", options.className].filter(Boolean).join(" ");
  if (classes.length === 0) {
    return el("span", {
      class: wrapperClass,
      "data-icon-size": options.size ?? null,
      style
    }, [text]);
  }
  return el("i", {
    class: `${wrapperClass} ${classes.join(" ")}`,
    "data-icon-size": options.size ?? null,
    style,
    "aria-hidden": "true"
  });
}

// ../../src/library/components/layout.ts
var GRID_COLUMNS = 12;
var FLEX_ALIGN = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch"
};
var FLEX_JUSTIFY = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly"
};
function mapFlexAlign(token) {
  return FLEX_ALIGN[token] ?? "stretch";
}
function mapFlexJustify(token) {
  return FLEX_JUSTIFY[token] ?? "flex-start";
}
function applyDirectionWithReverse(value, reverse) {
  if (!reverse) return value;
  if (value === "row") return "row-reverse";
  if (value === "column") return "column-reverse";
  if (value.endsWith("-reverse")) return value;
  return `${value}-reverse`;
}
function emitResponsiveSpacingVars(styleParts, prop, cssPrefix) {
  for (const bp of RESPONSIVE_BREAKPOINTS) {
    const v = prop.values[bp];
    if (v) styleParts.push(`${cssPrefix}-${bp}:var(--rui-spacing-${v}, ${v})`);
  }
}
function emitResponsiveFlexVars(styleParts, prop, cssPrefix, mapper) {
  for (const bp of RESPONSIVE_BREAKPOINTS) {
    const v = prop.values[bp];
    if (v) styleParts.push(`${cssPrefix}-${bp}:${mapper(String(v))}`);
  }
}
function applyResponsiveEnumProp(value, styleParts, attrs, options) {
  const parsed = readResponsiveProp(value);
  if (parsed.kind === "single") {
    const token = parsed.value ? String(parsed.value) : options.defaultToken;
    attrs[options.attrName] = token;
    return;
  }
  attrs[options.attrName] = "responsive";
  attrs[options.responsiveFlag] = "true";
  emitResponsiveFlexVars(styleParts, parsed, options.cssVarPrefix, options.mapper);
}
function isComponentNamed(value, name) {
  return Boolean(
    value && typeof value === "object" && value.__kind === "Component" && value.name === name
  );
}
function stackBaseDirection(props) {
  const direction = readResponsiveProp(props.direction);
  if (direction.kind === "single") {
    return direction.value ? String(direction.value) : "column";
  }
  return direction.values.base ? String(direction.values.base) : "column";
}
var StackItem = {
  name: "StackItem",
  description: "Per-child flex control inside a `Row`, `Column`, or `Stack`. Wraps one child so it can `grow` to fill leftover space, `shrink`, set a `basis`, override `alignSelf`, or change visual `order` \u2014 the building block for asymmetric rows like `Row([StackItem(searchInput, { grow: 1 }), saveButton])` (input expands, button hugs).",
  props: [
    { name: "child", type: "Node", description: "Child node to wrap" },
    { name: "grow", type: "number", optional: true, description: "flex-grow (0 or 1 typical)" },
    { name: "shrink", type: "number", optional: true, description: "flex-shrink (0 or 1 typical)" },
    { name: "basis", type: "string", optional: true, description: "flex-basis (`auto`, `0`, or CSS length)" },
    { name: "alignSelf", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Per-item cross-axis alignment" },
    { name: "order", type: "number", optional: true, description: "Visual order override" },
    { name: "minWidth", type: "string", optional: true, description: "CSS min-width" },
    { name: "maxWidth", type: "string", optional: true, description: "CSS max-width" }
  ],
  render: (_node, props, helpers) => {
    const attrs = { class: "rui-stack-item" };
    const styleParts = [];
    if (props.grow !== void 0 && props.grow !== null) {
      attrs["data-grow"] = String(asNumber(props.grow, 0));
    }
    if (props.shrink !== void 0 && props.shrink !== null) {
      attrs["data-shrink"] = String(asNumber(props.shrink, 1));
    }
    const basis = asString(props.basis);
    if (basis === "auto" || basis === "0") {
      attrs["data-basis"] = basis;
    } else if (basis) {
      styleParts.push(`flex-basis:${sanitiseCssLength(basis, basis)}`);
    }
    const alignSelf = asString(props.alignSelf);
    if (alignSelf) attrs["data-align-self"] = alignSelf;
    if (props.order !== void 0 && props.order !== null) {
      const order = asNumber(props.order, 0);
      attrs["data-order"] = String(order);
      styleParts.push(`order:${order}`);
    }
    const minWidth = asString(props.minWidth);
    if (minWidth) styleParts.push(`min-width:${sanitiseCssLength(minWidth, minWidth)}`);
    const maxWidth = asString(props.maxWidth);
    if (maxWidth) styleParts.push(`max-width:${sanitiseCssLength(maxWidth, maxWidth)}`);
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    root.append(helpers.renderNode(props.child));
    return root;
  }
};
function renderFlexContainer(directionValue, uniform, alignDefault, props, helpers) {
  const direction = readResponsiveProp(directionValue);
  const gap = readResponsiveProp(props.gap);
  const padding = readResponsiveProp(props.padding);
  const reverse = asBoolean(props.reverse);
  const attrs = {
    class: "rui-stack",
    "data-wrap": asBoolean(props.wrap) ? "true" : null,
    "data-reverse": reverse ? "true" : null,
    "data-uniform": uniform ? "true" : "false",
    "data-inline": asBoolean(props.inline) ? "true" : null
  };
  const styleParts = [];
  if (direction.kind === "single") {
    const dir = direction.value ? String(direction.value) : "column";
    attrs["data-direction"] = applyDirectionWithReverse(dir, reverse);
  } else {
    attrs["data-direction"] = "responsive";
    attrs["data-responsive-dir"] = "true";
    for (const bp of RESPONSIVE_BREAKPOINTS) {
      const v = direction.values[bp];
      if (v) styleParts.push(`--rui-stack-dir-${bp}:${applyDirectionWithReverse(String(v), reverse)}`);
    }
  }
  if (gap.kind === "single") {
    attrs["data-gap"] = gap.value ? String(gap.value) : "m";
  } else {
    attrs["data-gap"] = "responsive";
    attrs["data-responsive-gap"] = "true";
    emitResponsiveSpacingVars(styleParts, gap, "--rui-stack-gap");
  }
  applyResponsiveEnumProp(props.align, styleParts, attrs, {
    attrName: "data-align",
    responsiveFlag: "data-responsive-align",
    cssVarPrefix: "--rui-stack-align",
    defaultToken: alignDefault,
    mapper: mapFlexAlign
  });
  applyResponsiveEnumProp(props.justify, styleParts, attrs, {
    attrName: "data-justify",
    responsiveFlag: "data-responsive-justify",
    cssVarPrefix: "--rui-stack-justify",
    defaultToken: "start",
    mapper: mapFlexJustify
  });
  const alignContent = asString(props.alignContent);
  if (alignContent) attrs["data-align-content"] = alignContent;
  if (padding.kind === "single") {
    const pad = padding.value ? String(padding.value) : null;
    if (pad) attrs["data-padding"] = pad;
  } else {
    attrs["data-padding"] = "responsive";
    attrs["data-responsive-padding"] = "true";
    emitResponsiveSpacingVars(styleParts, padding, "--rui-stack-padding");
  }
  if (styleParts.length > 0) attrs.style = styleParts.join(";");
  const root = el("div", attrs);
  for (const child of asArray(props.children)) {
    root.append(helpers.renderNode(child));
  }
  return root;
}
var FLEX_GAP_PROP = { name: "gap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Spacing between children. May be a responsive map." };
var FLEX_JUSTIFY_PROP = { name: "justify", type: "string | object", optional: true, enum: ["start", "center", "end", "between", "around", "evenly"], description: "Main-axis distribution. May be a responsive map." };
var FLEX_WRAP_PROP = { name: "wrap", type: "boolean", optional: true, description: "Wrap children onto multiple lines when they overflow" };
var FLEX_REVERSE_PROP = { name: "reverse", type: "boolean", optional: true, description: "Reverse the visual order of children" };
var FLEX_PADDING_PROP = { name: "padding", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Inner padding token. May be a responsive map." };
var FLEX_INLINE_PROP = { name: "inline", type: "boolean", optional: true, description: "Use inline-flex (shrink-to-fit) instead of a full-width block" };
var FLEX_ALIGN_CONTENT_PROP = { name: "alignContent", type: "string", optional: true, enum: ["start", "center", "end", "between", "around", "stretch"], description: "Alignment of wrapped lines (only when `wrap` is on)" };
var Row = {
  name: "Row",
  description: "Lay children out horizontally (left \u2192 right) with even spacing. The developer-friendly default: children keep their natural width and are vertically centered. Set `grow=true` to make children share the row equally (for equal-width columns prefer `Grid(columns: N)`); drop a `Spacer()` between children to push them apart; wrap a child in `StackItem` for per-child grow/shrink/alignment. Use `wrap=true` for chips/tags that should flow onto multiple lines.",
  props: [
    { name: "children", type: "Node[]", description: "Children laid out left \u2192 right" },
    { name: "gap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Horizontal spacing between children (default `m`). May be a responsive map." },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Vertical alignment of children (default `center`). May be a responsive map." },
    { ...FLEX_JUSTIFY_PROP },
    { name: "grow", type: "boolean", optional: true, description: "Children share the row width equally (replaces the old `uniform`)" },
    { ...FLEX_WRAP_PROP },
    { ...FLEX_REVERSE_PROP },
    { ...FLEX_PADDING_PROP },
    { ...FLEX_INLINE_PROP },
    { ...FLEX_ALIGN_CONTENT_PROP }
  ],
  render: (_node, props, helpers) => renderFlexContainer("row", asBoolean(props.grow), "center", props, helpers)
};
var Column = {
  name: "Column",
  description: "Lay children out vertically (top \u2192 bottom) with even spacing \u2014 the most common page/section layout. Children stretch to the full width by default; set `align` to `start`/`center`/`end` to change that. This is the recommended root container for a page or a card body.",
  props: [
    { name: "children", type: "Node[]", description: "Children laid out top \u2192 bottom" },
    { name: "gap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Vertical spacing between children (default `m`). May be a responsive map." },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Horizontal alignment of children (default `stretch`). May be a responsive map." },
    { ...FLEX_JUSTIFY_PROP },
    { ...FLEX_WRAP_PROP },
    { ...FLEX_REVERSE_PROP },
    { ...FLEX_PADDING_PROP },
    { ...FLEX_INLINE_PROP }
  ],
  render: (_node, props, helpers) => renderFlexContainer("column", false, "stretch", props, helpers)
};
var Stack = {
  name: "Stack",
  description: 'Low-level flex container with a configurable, optionally responsive `direction`. Reach for `Row` or `Column` first \u2014 they are clearer for fixed-direction layouts. Use `Stack` when the direction itself must change across breakpoints, e.g. `direction: {base: "column", md: "row"}` for a sidebar that stacks on mobile. `gap`, `align`, `justify`, and `padding` also accept responsive maps. NOTE: a `row` Stack grows its children equally by default (`uniform=true`); set `uniform=false` for natural widths (this is `Row`\'s default).',
  props: [
    { name: "children", type: "Node[]", description: "Child components to stack" },
    { name: "direction", type: "string | object", optional: true, enum: ["column", "row"], description: 'Layout direction (default column). May be a responsive map like `{base: "column", md: "row"}`.' },
    { ...FLEX_GAP_PROP },
    { name: "align", type: "string | object", optional: true, enum: ["start", "center", "end", "stretch"], description: "Cross-axis alignment (default stretch). May be a responsive map." },
    { ...FLEX_JUSTIFY_PROP },
    { ...FLEX_ALIGN_CONTENT_PROP },
    { ...FLEX_WRAP_PROP },
    { ...FLEX_REVERSE_PROP },
    { name: "uniform", type: "boolean", optional: true, description: "Row children share space equally (default true for row stacks; use `Row` for natural widths)" },
    { ...FLEX_INLINE_PROP },
    { ...FLEX_PADDING_PROP }
  ],
  render: (_node, props, helpers) => {
    const baseDir = stackBaseDirection(props);
    const uniformDefault = baseDir === "row";
    const uniform = props.uniform === void 0 ? uniformDefault : asBoolean(props.uniform, uniformDefault);
    return renderFlexContainer(props.direction, uniform, "stretch", props, helpers);
  }
};
var Center = {
  name: "Center",
  description: 'Centers its children on both axes \u2014 the easy way to drop a spinner, an empty state, a hero call-to-action, or a modal body into the middle of a region. Give it `minHeight` (e.g. `"60vh"`) to center vertically inside a tall area, or `axis` to center on only one axis. Multiple children stack in a column and are centered as a group.',
  props: [
    { name: "children", type: "Node[]", description: "Content to center" },
    { name: "axis", type: "string", optional: true, enum: ["both", "horizontal", "vertical"], description: "Which axis to center on (default both)" },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height \u2014 set to center vertically inside a tall region (e.g. `60vh`, `400px`)" },
    { name: "gap", type: "string", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Spacing between stacked children (default `m`)" },
    { name: "padding", type: "string", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Inner padding token" },
    { name: "inline", type: "boolean", optional: true, description: "Shrink to fit content instead of filling the available width" }
  ],
  render: (_node, props, helpers) => {
    const attrs = {
      class: "rui-center",
      "data-axis": asString(props.axis, "both"),
      "data-gap": asString(props.gap, "m"),
      "data-inline": asBoolean(props.inline) ? "true" : null
    };
    const padding = asString(props.padding);
    if (padding) attrs["data-padding"] = padding;
    const styleParts = [];
    const minHeight = asString(props.minHeight);
    if (minHeight) styleParts.push(`min-height:${sanitiseCssLength(minHeight, minHeight)}`);
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var Card = {
  name: "Card",
  description: "Vertical card container.",
  props: [
    { name: "children", type: "Node[]", description: "Card contents" },
    { name: "variant", type: "string", optional: true, enum: ["default", "outlined", "elevated"] }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-card",
      "data-variant": asString(props.variant, "default")
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var CardHeader = {
  name: "CardHeader",
  description: "Card header with title and optional subtitle.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true }
  ],
  render: (_node, props) => {
    const root = el("header", { class: "rui-card-header" });
    root.append(el("h3", { class: "rui-card-title" }, [asString(props.title)]));
    const subtitle = asString(props.subtitle);
    if (subtitle) root.append(el("p", { class: "rui-card-subtitle" }, [subtitle]));
    return root;
  }
};
var CardFooter = {
  name: "CardFooter",
  description: "Card footer for actions.",
  props: [{ name: "children", type: "Node[]" }],
  render: (_node, props, helpers) => {
    const root = el("footer", { class: "rui-card-footer" });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var Separator = {
  name: "Separator",
  description: "Visual divider between content sections. Supports horizontal or vertical orientation, and an optional center `label` (lifted from the legacy `Divider`). Use `decorative=false` to expose the separator to assistive tech.",
  props: [
    { name: "orientation", type: "string", optional: true, enum: ["horizontal", "vertical"] },
    { name: "label", type: "string", optional: true, description: "Optional label rendered in the middle (horizontal only)" },
    { name: "decorative", type: "boolean", optional: true, description: "Hides the separator from assistive tech when true (default)" }
  ],
  render: (_node, props) => {
    const orientation = asString(props.orientation, "horizontal");
    const decorative = asBoolean(props.decorative, true);
    const label = asString(props.label);
    if (label && orientation === "horizontal") {
      return el("div", {
        class: "rui-separator rui-separator-with-label",
        "data-orientation": orientation,
        role: decorative ? "presentation" : "separator",
        "aria-orientation": decorative ? null : orientation
      }, [
        el("span", { class: "rui-separator-line" }),
        el("span", { class: "rui-separator-label" }, [label]),
        el("span", { class: "rui-separator-line" })
      ]);
    }
    return el("div", {
      class: "rui-separator",
      "data-orientation": orientation,
      role: decorative ? "presentation" : "separator",
      "aria-orientation": decorative ? null : orientation
    });
  }
};
var renderStepLi = (title, details, active = false) => {
  const root = el("li", {
    class: "rui-steps-item",
    "data-active": active ? "true" : "false"
  });
  root.append(el("div", { class: "rui-steps-title" }, [title]));
  if (details) root.append(el("div", { class: "rui-steps-details" }, [details]));
  return root;
};
var Steps = {
  name: "Steps",
  description: "Numbered step-by-step guide. Pass items as `{title, details?, active?}` objects. Use `active` to mark the current step in a multi-step flow.",
  props: [
    { name: "items", type: "object[]" }
  ],
  render: (_node, props, helpers) => {
    const root = el("ol", { class: "rui-steps" });
    for (const item of asArray(props.items)) {
      if (item && typeof item === "object" && item.__kind === "Component") {
        root.append(helpers.renderNode(item));
        continue;
      }
      if (item && typeof item === "object") {
        const data = item;
        root.append(renderStepLi(
          asString(data.title),
          asString(data.details),
          asBoolean(data.active)
        ));
        continue;
      }
      root.append(renderStepLi(asString(item), ""));
    }
    return root;
  }
};
var TabItem = {
  name: "TabItem",
  description: "Single tab definition (used inside Tabs). Add `badge` for a count chip in the tab trigger, and `icon` for a leading Font Awesome icon.",
  props: [
    { name: "value", type: "string", description: "Stable identifier for the tab" },
    { name: "label", type: "string", description: "Display label" },
    { name: "children", type: "Node[]", description: "Tab content" },
    { name: "badge", type: "string", optional: true, description: "Trailing chip rendered in the tab trigger (count / status)" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name shown before the label" }
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("div", {
      class: "rui-tab-content",
      role: "tabpanel",
      "data-value": asString(props.value),
      "data-active": "false"
    });
    for (const child of asArray(props.children)) wrapper.append(helpers.renderNode(child));
    return wrapper;
  }
};
var Tabs = {
  name: "Tabs",
  description: 'Tabbed container. Children must be TabItem components. Supports `orientation="vertical"` for sidebar-style tabs and built-in keyboard navigation (\u2190/\u2192 or \u2191/\u2193, Home, End). Provide `onChange` to react when the user switches tabs (called with the new tab\'s value).',
  props: [
    { name: "items", type: "TabItem[]", description: "Tab definitions" },
    { name: "defaultValue", type: "string", optional: true, description: "Initially active tab value" },
    { name: "orientation", type: "string", optional: true, enum: ["horizontal", "vertical"], description: "Layout direction (default `horizontal`)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-activated tab value when the user switches tabs" }
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const orientation = asString(props.orientation, "horizontal");
    const root = el("div", { class: "rui-tabs", "data-orientation": orientation });
    const tablist = el("div", {
      class: "rui-tab-list",
      role: "tablist",
      "aria-orientation": orientation
    });
    const panels = el("div", { class: "rui-tab-panels" });
    let fallbackValue = asString(props.defaultValue);
    if (!fallbackValue && items.length > 0) {
      const first = items[0];
      fallbackValue = asString(first?.args?.[0], "tab-0");
    }
    const activeSlot = helpers.useInstanceState("activeTab", fallbackValue);
    if (asString(props.defaultValue) && asString(props.defaultValue) !== fallbackValue) {
      activeSlot.set(asString(props.defaultValue));
    }
    const validValues = new Set(
      items.map((item, idx) => asString(item.args?.[0], `tab-${idx}`))
    );
    if (!validValues.has(activeSlot.get())) {
      activeSlot.set(fallbackValue);
    }
    const setActive = (next, originBtn) => {
      const previous = activeSlot.get();
      activeSlot.set(next);
      const liveRoot = originBtn.closest(".rui-tabs");
      if (liveRoot) {
        liveRoot.querySelectorAll(".rui-tab-trigger").forEach((b) => {
          const isActive = b.getAttribute("data-value") === next;
          b.setAttribute("aria-selected", isActive ? "true" : "false");
          b.tabIndex = isActive ? 0 : -1;
        });
        liveRoot.querySelectorAll(".rui-tab-content").forEach((p) => {
          p.setAttribute("data-active", p.getAttribute("data-value") === next ? "true" : "false");
        });
      }
      if (previous !== next) helpers.invoke(props.onChange, next);
    };
    items.forEach((item, idx) => {
      const tabNode = item;
      const value = asString(tabNode.args?.[0], `tab-${idx}`);
      const label = asString(tabNode.args?.[1], `Tab ${idx + 1}`);
      const badge = asString(tabNode.args?.[3]);
      const icon = asString(tabNode.args?.[4]);
      const isActive = value === activeSlot.get();
      const button = el(
        "button",
        {
          class: "rui-tab-trigger",
          role: "tab",
          type: "button",
          "data-value": value,
          "aria-selected": isActive ? "true" : "false",
          tabindex: isActive ? "0" : "-1"
        }
      );
      const iconNode = icon ? renderIconForTab(icon) : null;
      if (iconNode) button.append(iconNode);
      button.append(el("span", { class: "rui-tab-trigger-label" }, [label]));
      if (badge) button.append(el("span", { class: "rui-tab-trigger-badge" }, [badge]));
      button.onclick = (event) => {
        const origin = event.currentTarget ?? event.target;
        setActive(value, origin);
      };
      button.onkeydown = (event) => {
        const e = event;
        const horizontal = orientation !== "vertical";
        const isNext = horizontal ? e.key === "ArrowRight" : e.key === "ArrowDown";
        const isPrev = horizontal ? e.key === "ArrowLeft" : e.key === "ArrowUp";
        if (!isNext && !isPrev && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        const origin = e.currentTarget ?? e.target;
        const liveList = origin.closest(".rui-tab-list");
        if (!liveList) return;
        const triggers = Array.from(liveList.querySelectorAll(".rui-tab-trigger"));
        if (triggers.length === 0) return;
        const currentIdx = triggers.indexOf(origin);
        let nextIdx = currentIdx;
        if (e.key === "Home") nextIdx = 0;
        else if (e.key === "End") nextIdx = triggers.length - 1;
        else if (isNext) nextIdx = (currentIdx + 1) % triggers.length;
        else if (isPrev) nextIdx = (currentIdx - 1 + triggers.length) % triggers.length;
        const target = triggers[nextIdx];
        if (!target) return;
        target.focus();
        const nextValue = target.getAttribute("data-value") ?? "";
        if (nextValue) setActive(nextValue, target);
      };
      tablist.append(button);
      const panel = helpers.renderNode(item);
      panel.setAttribute("data-value", value);
      panel.setAttribute("data-active", isActive ? "true" : "false");
      panels.append(panel);
    });
    root.append(tablist, panels);
    return root;
  }
};
function renderIconForTab(iconName) {
  return renderIcon(iconName, { className: "rui-tab-trigger-icon" });
}
var AccordionItem = {
  name: "AccordionItem",
  description: "Single accordion section.",
  props: [
    { name: "title", type: "string" },
    { name: "children", type: "Node[]" },
    { name: "open", type: "boolean", optional: true },
    { name: "showArrow", type: "boolean", optional: true, description: "Show a chevron icon on the right (default false). Inherits from parent Accordion when unset." }
  ],
  render: (_node, props, helpers) => {
    const explicit = props.showArrow !== void 0 && props.showArrow !== null;
    const details = el("details", {
      class: "rui-accordion-item",
      "data-show-arrow": explicit ? asBoolean(props.showArrow) ? "true" : "false" : null
    });
    if (asBoolean(props.open)) details.setAttribute("open", "");
    const summary = el("summary", { class: "rui-accordion-trigger" });
    summary.append(el("span", { class: "rui-accordion-title" }, [asString(props.title)]));
    summary.append(el("span", { class: "rui-accordion-chevron", "aria-hidden": "true" }));
    details.append(summary);
    const body = el("div", { class: "rui-accordion-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    details.append(body);
    return details;
  }
};
var Accordion = {
  name: "Accordion",
  description: "Accordion container. Children must be AccordionItem components. Set `showArrow: true` to add a chevron indicator to every item; individual `AccordionItem`s can override via their own `showArrow` prop.",
  props: [
    { name: "items", type: "AccordionItem[]" },
    { name: "showArrow", type: "boolean", optional: true, description: "Show chevron icon on every item (default false)." }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-accordion",
      "data-show-arrow": asBoolean(props.showArrow) ? "true" : "false"
    });
    for (const child of asArray(props.items)) root.append(helpers.renderNode(child));
    return root;
  }
};
var clampGridColumns = (n) => Math.max(1, Math.min(GRID_COLUMNS, Math.round(n)));
function resolveSpan(span) {
  if (span == null || span === "") return 12;
  const raw = String(span).trim();
  if (raw.includes("/")) {
    const [numPart, denPart] = raw.split("/");
    const num = Number(numPart);
    const den = Number(denPart);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return clampGridColumns(Math.round(GRID_COLUMNS * num / den));
    }
  }
  if (raw === "auto" || raw === "fit" || raw === "auto-fit" || raw === "full" || raw === "100%") return 12;
  return clampGridColumns(asNumber(span, 12));
}
function gridMinChildWidth(props) {
  const width = asString(props.minChildWidth) || asString(props.minItemWidth);
  return sanitiseCssLength(width || "220px", "220px");
}
var GridItem = {
  name: "GridItem",
  description: 'Wraps a child in a 12-column grid cell with `span`, `offset`, and responsive `spanAt` maps. Parent `Grid` auto-enables 12-column mode when any child is a `GridItem`. Fraction spans like `"1/3"` resolve against the 12-column track.',
  props: [
    { name: "child", type: "Node", description: "Child node to place in the grid" },
    { name: "span", type: "number | string", optional: true, description: 'Columns to span (1\u201312) or fraction like "1/2", "1/3"' },
    { name: "offset", type: "number", optional: true, description: "Empty columns before this item (0\u201311)" },
    { name: "spanAt", type: "object", optional: true, description: "Responsive span map `{sm: 12, md: 6, lg: 4}`" }
  ],
  render: (_node, props, helpers) => {
    const baseSpan = resolveSpan(props.span ?? 12);
    const spanAt = readResponsiveProp(props.spanAt);
    const offset = props.offset === void 0 || props.offset === null ? 0 : Math.max(0, Math.min(GRID_COLUMNS - 1, Math.round(asNumber(props.offset, 0))));
    const attrs = {
      class: "rui-grid-item",
      "data-span": String(baseSpan)
    };
    const styleParts = [`--rui-grid-item-span:${baseSpan}`];
    if (offset > 0) {
      attrs["data-offset"] = String(offset);
      styleParts.push(`--rui-grid-item-offset:${offset}`);
    }
    if (spanAt.kind === "responsive") {
      attrs["data-responsive-span"] = "true";
      for (const bp of RESPONSIVE_BREAKPOINTS) {
        const v = spanAt.values[bp];
        if (v !== void 0) {
          const resolved = resolveSpan(v);
          styleParts.push(`--rui-grid-item-span-${bp}:${resolved}`);
        }
      }
    } else if (spanAt.kind === "single" && spanAt.value != null) {
      const resolved = resolveSpan(spanAt.value);
      styleParts.push(`--rui-grid-item-span:${resolved}`);
      attrs["data-span"] = String(resolved);
    }
    attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    root.append(helpers.renderNode(props.child));
    return root;
  }
};
var Box = {
  name: "Box",
  description: "Spacing and surface wrapper for padding, margin, borders, semantic backgrounds, and max-width constraints. Use when a `Card` is too heavy but the content needs a subtle surface or inset.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "padding", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Inner padding. May be a responsive map." },
    { name: "margin", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Outer margin. May be a responsive map." },
    { name: "border", type: "string", optional: true, enum: ["none", "subtle", "default"], description: "Border preset (default none)" },
    { name: "background", type: "string", optional: true, enum: ["none", "surface", "muted", "primary", "success", "warning", "danger", "info"], description: "Semantic background token" },
    { name: "maxWidth", type: "string", optional: true, description: "CSS max-width" }
  ],
  render: (_node, props, helpers) => {
    const padding = readResponsiveProp(props.padding);
    const margin = readResponsiveProp(props.margin);
    const attrs = {
      class: "rui-box",
      "data-border": asString(props.border, "none"),
      "data-background": asString(props.background, "none")
    };
    const styleParts = [];
    const maxWidth = asString(props.maxWidth);
    if (maxWidth) styleParts.push(`max-width:${sanitiseCssLength(maxWidth, maxWidth)}`);
    if (padding.kind === "single") {
      const pad = padding.value ? String(padding.value) : null;
      if (pad) attrs["data-padding"] = pad;
    } else {
      attrs["data-padding"] = "responsive";
      attrs["data-responsive-padding"] = "true";
      emitResponsiveSpacingVars(styleParts, padding, "--rui-box-padding");
    }
    if (margin.kind === "single") {
      const mar = margin.value ? String(margin.value) : null;
      if (mar) attrs["data-margin"] = mar;
    } else {
      attrs["data-margin"] = "responsive";
      attrs["data-responsive-margin"] = "true";
      emitResponsiveSpacingVars(styleParts, margin, "--rui-box-margin");
    }
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var Grid = {
  name: "Grid",
  description: 'Two-dimensional grid with three modes:\n  1. AUTO-FIT (default, no `columns`): wraps as many equal columns as fit, each at least `minChildWidth` wide (default 220px) \u2014 perfect for card/KPI grids that should reflow on their own.\n  2. FIXED (`columns: N`, 1\u201312): exactly N equal columns.\n  3. SPAN (`columns: 12` or any `GridItem` children): a 12-track grid where each `GridItem` sets its own `span` (a number 1\u201312 or a fraction like `"1/3"`) for dashboards and asymmetric layouts.\n`columns` and `gap` accept responsive maps like `{base: 1, md: 2, lg: 4}`.',
  props: [
    { name: "children", type: "Node[]" },
    { name: "columns", type: "number | object", optional: true, description: "Fixed column count 1\u201312. Omit for auto-fit; `12` (or `GridItem` children) enables the 12-track span system. May be a responsive map like `{base: 1, md: 3}`." },
    { name: "gap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Gap on both axes (default `m`). May be a responsive map." },
    { name: "rowGap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Row gap override. May be a responsive map." },
    { name: "columnGap", type: "string | object", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Column gap override. May be a responsive map." },
    { name: "minChildWidth", type: "string", optional: true, aliases: ["minItemWidth"], description: 'Minimum column width for AUTO-FIT mode, e.g. `"240px"` (default 220px). Also caps the floor in FIXED mode.' },
    { name: "alignItems", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Vertical alignment of items within their cells" },
    { name: "justifyItems", type: "string", optional: true, enum: ["start", "center", "end", "stretch"], description: "Horizontal alignment of items within their cells" },
    { name: "dense", type: "boolean", optional: true, description: "Dense auto-flow packing \u2014 let later items backfill earlier gaps" }
  ],
  render: (_node, props, helpers) => {
    const children = asArray(props.children);
    const hasGridItems = children.some((child) => isComponentNamed(child, "GridItem"));
    const columns = readResponsiveProp(props.columns);
    const gap = readResponsiveProp(props.gap);
    const rowGap = readResponsiveProp(props.rowGap);
    const columnGap = readResponsiveProp(props.columnGap);
    const attrs = {
      class: "rui-grid"
    };
    const styleParts = [];
    let twelveColMode = false;
    let explicitNonTwelve = false;
    if (columns.kind === "single") {
      const requested = columns.value === null ? 0 : asNumber(columns.value, 0);
      const cols = requested > 0 ? clampGridColumns(requested) : 0;
      if (cols === GRID_COLUMNS) {
        twelveColMode = true;
      } else if (cols > 0) {
        explicitNonTwelve = true;
      }
      if (cols > 0) {
        attrs["data-columns"] = String(cols);
        const minChild = asString(props.minChildWidth) || asString(props.minItemWidth);
        if (minChild) {
          attrs["data-min-child-width"] = "true";
          styleParts.push(`--rui-grid-min-child:${sanitiseCssLength(minChild, "220px")}`);
        }
      } else {
        styleParts.push(`--rui-grid-min-item:${gridMinChildWidth(props)}`);
      }
    } else {
      attrs["data-responsive-cols"] = "true";
      for (const bp of RESPONSIVE_BREAKPOINTS) {
        const v = columns.values[bp];
        if (v === void 0) continue;
        const cols = clampGridColumns(asNumber(v, 0));
        if (cols === GRID_COLUMNS) {
          twelveColMode = true;
        } else if (cols > 0) {
          explicitNonTwelve = true;
        }
        styleParts.push(`--rui-grid-cols-${bp}:${cols}`);
      }
    }
    if (hasGridItems && !explicitNonTwelve) twelveColMode = true;
    if (twelveColMode) attrs["data-grid-mode"] = "12";
    if (gap.kind === "single") {
      attrs["data-gap"] = gap.value ? String(gap.value) : "m";
    } else {
      attrs["data-gap"] = "responsive";
      attrs["data-responsive-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, gap, "--rui-grid-gap");
    }
    if (rowGap.kind === "single" && rowGap.value) {
      attrs["data-row-gap"] = String(rowGap.value);
    } else if (rowGap.kind === "responsive") {
      attrs["data-row-gap"] = "responsive";
      attrs["data-responsive-row-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, rowGap, "--rui-grid-row-gap");
    }
    if (columnGap.kind === "single" && columnGap.value) {
      attrs["data-column-gap"] = String(columnGap.value);
    } else if (columnGap.kind === "responsive") {
      attrs["data-column-gap"] = "responsive";
      attrs["data-responsive-column-gap"] = "true";
      emitResponsiveSpacingVars(styleParts, columnGap, "--rui-grid-column-gap");
    }
    const alignItems = asString(props.alignItems);
    if (alignItems) attrs["data-align-items"] = alignItems;
    const justifyItems = asString(props.justifyItems);
    if (justifyItems) attrs["data-justify-items"] = justifyItems;
    if (asBoolean(props.dense)) attrs["data-dense"] = "true";
    if (styleParts.length > 0) attrs.style = styleParts.join(";");
    const root = el("div", attrs);
    for (const child of children) root.append(helpers.renderNode(child));
    return root;
  }
};
var AspectRatio = {
  name: "AspectRatio",
  description: "Container that constrains its child to a fixed aspect ratio (e.g. 16:9 for video embeds, 1:1 for thumbnails). The child fills the box.",
  props: [
    { name: "ratio", type: "string", description: "`width:height` (e.g. `16:9`, `4:3`) or a decimal like `1.78`" },
    { name: "children", type: "Node[]" }
  ],
  render: (_node, props, helpers) => {
    const ratio = parseRatio(asString(props.ratio, "16:9"));
    const root = el("div", {
      class: "rui-aspect-ratio",
      style: `aspect-ratio:${ratio};`
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
function parseRatio(input) {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}
var ScrollArea = {
  name: "ScrollArea",
  description: "Bounded scroll container. Use to clip long lists / logs / chat panels to a fixed max height with a clean scrollbar.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "maxHeight", type: "string", optional: true, aliases: ["height"], description: "CSS height (default 320px)" },
    { name: "direction", type: "string", optional: true, enum: ["vertical", "horizontal", "both"] }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-scroll-area",
      "data-direction": asString(props.direction, "vertical"),
      style: `max-height:${sanitiseCssLength(props.maxHeight, "320px")};`
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var MODAL_SIZES = ["sm", "md", "lg", "xl", "full"];
var FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
var modalIdSeq = 0;
function activeWithin(el2) {
  const root = el2.getRootNode();
  return root.activeElement ?? null;
}
var Modal = {
  name: "Modal",
  description: "Dialog overlay shown when `open` is true. Pass a `$variable` as `open` to control it. The header always renders a \xD7 close button (disable via `closable: false`); the optional `footer` slot is the canonical place for action buttons. `closeOnBackdrop=true` opts in to backdrop-click dismissal. `onClose` fires every time the modal closes (\xD7 button, backdrop, programmatic state write). Accessible by default: the dialog is labelled by its title, focus moves into it on open and is restored on close, Tab is trapped inside, and Escape closes it (unless `closable: false`).",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state \u2014 usually a $variable" },
    { name: "children", type: "Node[]" },
    { name: "size", type: "string", optional: true, enum: MODAL_SIZES, description: "Width preset (default `md`)" },
    { name: "footer", type: "Node[]", optional: true, description: "Footer slot \u2014 typically a row of action Buttons" },
    { name: "closable", type: "boolean", optional: true, description: "Render the header \xD7 button (default true)" },
    { name: "closeOnBackdrop", type: "boolean", optional: true, description: "Close when the overlay is clicked (default false)" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked when the modal is closed (\xD7 button or backdrop)" }
  ],
  render: (node, props, helpers) => {
    const size = asString(props.size, "md");
    const closable = props.closable === void 0 ? true : asBoolean(props.closable);
    const overlay = el("div", {
      class: "rui-modal-overlay",
      "data-open": asBoolean(props.open) ? "true" : "false"
    });
    const titleIdSlot = helpers.useInstanceState("rui-modal-title-id", "");
    if (!titleIdSlot.get()) titleIdSlot.set(`rui-modal-title-${modalIdSeq += 1}`);
    const titleId = titleIdSlot.get();
    const dialog = el("div", {
      class: "rui-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      // Focusable so we can move focus into the dialog on open.
      tabindex: "-1",
      "data-size": size
    });
    const header = el("header", { class: "rui-modal-header" });
    header.append(el("h3", { class: "rui-modal-title", id: titleId }, [asString(props.title)]));
    const stateName = node.argMeta?.[1]?.stateRef;
    const closeModal = () => {
      if (stateName) helpers.setState(stateName, false);
      helpers.invoke(props.onClose);
    };
    if (closable) {
      const closeBtn = el("button", {
        type: "button",
        class: "rui-modal-close",
        "aria-label": "Close dialog"
      }, ["\xD7"]);
      closeBtn.onclick = (event) => {
        event.stopPropagation();
        closeModal();
      };
      header.append(closeBtn);
    }
    dialog.append(header);
    const body = el("div", { class: "rui-modal-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    dialog.append(body);
    const footer = asArray(props.footer);
    if (footer.length > 0) {
      const footRow = el("footer", { class: "rui-modal-footer" });
      for (const item of footer) footRow.append(helpers.renderNode(item));
      dialog.append(footRow);
    }
    overlay.append(dialog);
    if (asBoolean(props.closeOnBackdrop)) {
      overlay.onclick = (event) => {
        if (event.target === overlay) closeModal();
      };
    }
    const isOpen = asBoolean(props.open);
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && closable) {
        event.stopPropagation();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = activeWithin(dialog);
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    });
    const focusSlot = helpers.useInstanceState(
      "rui-modal-focus",
      { open: false, prev: null }
    );
    const prevState = focusSlot.get();
    if (isOpen && !prevState.open) {
      const previouslyFocused = activeWithin(dialog);
      focusSlot.set({ open: true, prev: previouslyFocused });
      const focusFirst = () => {
        const items = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
        (items[0] ?? dialog).focus();
      };
      if (typeof queueMicrotask === "function") queueMicrotask(focusFirst);
      else void Promise.resolve().then(focusFirst);
    } else if (!isOpen && prevState.open) {
      const toRestore = prevState.prev;
      focusSlot.set({ open: false, prev: null });
      if (toRestore && typeof toRestore.focus === "function") {
        const restore = () => toRestore.focus();
        if (typeof queueMicrotask === "function") queueMicrotask(restore);
        else void Promise.resolve().then(restore);
      }
    }
    return overlay;
  }
};

// ../../src/library/components/content.ts
var ICON_VARIANTS = ["solid", "regular", "brands"];
var SIZE_ENUM = ["xs", "sm", "md", "lg", "xl"];
var TONE_ENUM = ["default", "neutral", "primary", "success", "warning", "danger", "info"];
function normaliseSize(value, fallback = "md") {
  const v = asString(value).trim().toLowerCase();
  if (!v) return fallback;
  if (v === "small") return "sm";
  if (v === "normal") return "md";
  if (v === "large") return "lg";
  if (SIZE_ENUM.includes(v)) return v;
  return fallback;
}
var Icon = {
  name: "Icon",
  description: 'Single Font Awesome icon. `name` is the FA name without the `fa-` prefix (e.g. `"house"`, `"chart-line"`). Use `variant` for non-solid styles (`regular`/`brands`) or prefix the name (`"regular:star"`). `color` accepts any CSS colour (`"#00ff00"`, `"tomato"`, `"var(--rui-color-primary)"`).',
  props: [
    { name: "name", type: "string", description: "FA name without the fa- prefix" },
    { name: "variant", type: "string", optional: true, enum: ICON_VARIANTS },
    { name: "size", type: "string", optional: true, enum: ICON_SIZES },
    { name: "color", type: "string", optional: true, description: "CSS colour applied to the glyph (hex, named, rgb()/hsl(), or var(--token))" }
  ],
  render: (_node, props) => {
    const name = asString(props.name);
    const variant = asString(props.variant, "");
    const size = asString(props.size, "md");
    const color = asString(props.color, "");
    const composed = variant ? `${variant}:${name}` : name;
    const node = renderIcon(composed, { size, color });
    if (node) return node;
    return el("span", { class: "rui-icon", "data-icon-size": size }, [name]);
  }
};
var TEXT_VARIANTS = [
  "small",
  "small-heavy",
  "body",
  "body-heavy",
  "large",
  "large-heavy",
  "heading",
  "title"
];
function sanitiseInlineStyle(input) {
  const raw = asString(input).trim();
  if (!raw) return "";
  if (/[<>]/.test(raw)) return "";
  if (/\bexpression\s*\(|\bjavascript\s*:|\bbehavior\s*:|@import\b/i.test(raw)) {
    return "";
  }
  return raw;
}
var TEXT_PROPS = [
  { name: "value", type: "string" },
  { name: "variant", type: "string", optional: true, enum: TEXT_VARIANTS },
  { name: "tone", type: "string", optional: true, enum: ["default", "muted", "primary", "success", "warning", "danger"], description: "Visual accent" },
  {
    name: "style",
    type: "string",
    optional: true,
    description: 'Inline CSS declarations applied to the rendered element (e.g. "font-size: 16px; font-weight: bold; color: #000;").'
  }
];
var renderText = (_node, props) => {
  const variant = asString(props.variant, "body");
  const tone = asString(props.tone, "default");
  const style = sanitiseInlineStyle(props.style);
  return el("span", {
    class: "rui-text",
    "data-variant": variant,
    "data-color": tone,
    style: style || null
  }, [asString(props.value)]);
};
var Text = {
  name: "Text",
  description: 'Renders plain text with a typographic variant. Optional `style` prop accepts a CSS declaration string (e.g. "font-size: 16px; color: #000;") applied directly to the rendered element.',
  props: TEXT_PROPS,
  render: renderText
};
var TextContent = {
  name: "TextContent",
  description: "Deprecated alias for `Text`. Prefer `Text(...)` \u2014 both render identically.",
  props: TEXT_PROPS,
  render: renderText
};
var IMAGE_FIT = ["cover", "contain", "fill", "none", "scale-down"];
var Image = {
  name: "Image",
  description: "Inline image. `ratio` constrains the box to a fixed aspect ratio (e.g. `16:9`, `1:1`) so callers do not need an outer `AspectRatio`. `fit` controls how the image fills that box. When `src` is missing or unsafe the component renders a placeholder (or `fallback` text/icon).",
  props: [
    { name: "src", type: "string" },
    { name: "alt", type: "string", optional: true },
    { name: "caption", type: "string", optional: true },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio shorthand (e.g. `16:9`, `1:1`, `4:3`)" },
    { name: "fit", type: "string", optional: true, enum: IMAGE_FIT, description: "object-fit value (default `cover`)" },
    { name: "fallback", type: "string", optional: true, description: "Text label or Font Awesome icon shown when src is missing/unsafe" }
  ],
  render: (_node, props) => {
    const wrapper = el("figure", {
      class: "rui-image",
      "data-fit": asString(props.fit, "cover"),
      style: props.ratio ? `aspect-ratio:${parseImageRatio(asString(props.ratio))};` : null
    });
    const safeSrc = sanitiseImageSrc(props.src);
    if (safeSrc) {
      wrapper.append(el("img", {
        src: safeSrc,
        alt: asString(props.alt),
        loading: "lazy"
      }));
    } else {
      const placeholder = el("div", {
        class: "rui-image-placeholder",
        role: "presentation",
        "aria-hidden": "true"
      });
      const fallback = asString(props.fallback);
      if (fallback) {
        const iconNode = renderIcon(fallback, { className: "rui-image-fallback-icon" });
        if (iconNode) placeholder.append(iconNode);
        else placeholder.append(el("span", { class: "rui-image-fallback-text" }, [fallback]));
      }
      wrapper.append(placeholder);
    }
    const cap = asString(props.caption);
    if (cap) wrapper.append(el("figcaption", { class: "rui-image-caption" }, [cap]));
    return wrapper;
  }
};
function parseImageRatio(input) {
  if (!input) return "auto";
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "auto";
}
var BADGE_VARIANTS = ["neutral", "primary", "success", "warning", "danger", "info"];
var Badge = {
  name: "Badge",
  description: "Small pill-style tag for status, counts, categories. Accepts an optional leading `icon` and a `size`.",
  props: [
    { name: "label", type: "string", positional: true },
    { name: "tone", type: "string", optional: true, enum: BADGE_VARIANTS, aliases: ["variant"], description: "Visual tone" },
    { name: "icon", type: "string", optional: true, description: 'Optional Font Awesome icon name (e.g. "star")' },
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM }
  ],
  render: (_node, props) => {
    const variant = asString(props.tone, "neutral");
    const size = normaliseSize(props.size, "md");
    const root = el("span", {
      class: "rui-badge",
      "data-variant": variant,
      "data-size": size
    });
    const iconNode = renderIcon(props.icon, { className: "rui-badge-icon" });
    if (iconNode) root.append(iconNode);
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-badge-label" }, [label]));
    return root;
  }
};
var BadgeList = {
  name: "BadgeList",
  description: "Cluster of Badge pills rendered from an array of strings.",
  props: [
    { name: "labels", type: "string[]", positional: true, description: "Array of badge labels" },
    { name: "tone", type: "string", optional: true, enum: BADGE_VARIANTS, aliases: ["variant"] },
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM }
  ],
  render: (_node, props) => {
    const variant = asString(props.tone, "neutral");
    const size = normaliseSize(props.size, "md");
    const root = el("div", { class: "rui-badge-list" });
    for (const raw of asArray(props.labels)) {
      const label = asString(raw);
      if (!label) continue;
      const pill = el("span", {
        class: "rui-badge",
        "data-variant": variant,
        "data-size": size
      });
      pill.append(el("span", { class: "rui-badge-label" }, [label]));
      root.append(pill);
    }
    return root;
  }
};
var CALLOUT_VARIANTS = ["neutral", "info", "success", "warning", "danger", "error"];
var Callout = {
  name: "Callout",
  description: "Highlighted callout banner with variant, title, description, and leading icon. Pass `compact: true` for a one-line inline-note rendering.",
  props: [
    { name: "tone", type: "string", optional: true, enum: CALLOUT_VARIANTS, aliases: ["variant"] },
    { name: "title", type: "string", positional: true, required: true },
    { name: "description", type: "string", optional: true, aliases: ["text"], description: "Body text" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
    { name: "compact", type: "boolean", optional: true, description: "Render with the dense, one-line note shape." }
  ],
  render: (_node, props) => {
    const variant = asString(props.tone, "info");
    const compact = asBoolean(props.compact);
    const root = el("div", {
      class: "rui-callout",
      "data-variant": variant,
      "data-compact": compact ? "true" : "false"
    });
    const iconName = asString(props.icon) || defaultCalloutIcon(variant);
    const iconNode = renderIcon(iconName, { className: "rui-callout-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-callout-body" });
    body.append(el("div", { class: "rui-callout-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) body.append(el("div", { class: "rui-callout-description" }, [desc]));
    root.append(body);
    return root;
  }
};
var CodeBlock = {
  name: "CodeBlock",
  description: 'Read-only code block with a language label and a copy-to-clipboard button. Pass `showLineNumbers=true` to render a gutter; `highlightLines` accepts a string like `"3-5,8"` to emphasise specific lines.',
  props: [
    { name: "language", type: "string", optional: true, description: "Display label (e.g. ts, bash)" },
    { name: "codeString", type: "string", positional: true, required: true, aliases: ["code"], description: "Raw source text" },
    { name: "showLineNumbers", type: "boolean", optional: true, description: "Render a left-side line-number gutter" },
    { name: "highlightLines", type: "string", optional: true, aliases: ["highlight"], description: 'Highlight ranges, e.g. "3-5,8"' },
    { name: "copy", type: "boolean", optional: true, description: "Show the copy-to-clipboard button (default true)" }
  ],
  render: (_node, props) => {
    const language = asString(props.language);
    const code = asString(props.codeString);
    const showLineNumbers = asBoolean(props.showLineNumbers);
    const highlights = parseLineRanges(asString(props.highlightLines));
    const showCopy = props.copy === void 0 ? true : asBoolean(props.copy);
    const root = el("div", { class: "rui-code-block" });
    if (language || showCopy) {
      const head = el("div", { class: "rui-code-block-head" });
      if (language) head.append(el("span", { class: "rui-code-block-language" }, [language]));
      if (showCopy) {
        const copyBtn = el("button", {
          type: "button",
          class: "rui-code-block-copy",
          "aria-label": "Copy code",
          title: "Copy"
        });
        const copyIcon = renderIcon("copy", { className: "rui-code-block-copy-icon" });
        if (copyIcon) copyBtn.append(copyIcon);
        copyBtn.append(el("span", { class: "rui-code-block-copy-label" }, ["Copy"]));
        copyBtn.onclick = (event) => {
          const origin = event.currentTarget ?? event.target;
          const live = origin.closest(".rui-code-block")?.querySelector("code");
          const text = live?.textContent ?? code;
          const nav = typeof navigator !== "undefined" ? navigator : null;
          const clipboard = nav?.clipboard;
          if (clipboard?.writeText) {
            clipboard.writeText(text).catch(() => {
            });
          }
          const label = origin.querySelector(".rui-code-block-copy-label");
          if (label) {
            const original = label.textContent ?? "Copy";
            label.textContent = "Copied";
            setTimeout(() => {
              label.textContent = original;
            }, 1500);
          }
        };
        head.append(copyBtn);
      }
      root.append(head);
    }
    const pre = el("pre", { class: "rui-code-block-pre", "data-line-numbers": showLineNumbers ? "true" : "false" });
    if (showLineNumbers || highlights.size > 0) {
      const lines = code.split(/\r?\n/);
      const codeEl = el("code", {});
      lines.forEach((lineText, idx) => {
        const lineNumber = idx + 1;
        const line = el("span", {
          class: "rui-code-block-line",
          "data-line": String(lineNumber),
          "data-highlight": highlights.has(lineNumber) ? "true" : null
        });
        if (showLineNumbers) {
          line.append(el("span", { class: "rui-code-block-gutter" }, [String(lineNumber)]));
        }
        line.append(el("span", { class: "rui-code-block-code" }, [lineText]));
        codeEl.append(line);
      });
      pre.append(codeEl);
    } else {
      pre.append(el("code", {}, [code]));
    }
    root.append(pre);
    return root;
  }
};
function parseLineRanges(input) {
  const out = /* @__PURE__ */ new Set();
  if (!input) return out;
  for (const segment of input.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const parts = trimmed.split("-").map((s) => Number(s.trim()));
      const a = parts[0] ?? NaN;
      const b = parts[1] ?? NaN;
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
        for (let i = a; i <= b; i += 1) out.add(i);
      }
    } else {
      const n = Number(trimmed);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return out;
}
function defaultCalloutIcon(variant) {
  switch (variant) {
    case "success":
      return "circle-check";
    case "warning":
      return "triangle-exclamation";
    case "danger":
    case "error":
      return "circle-xmark";
    case "info":
      return "circle-info";
    default:
      return "circle-info";
  }
}
var SKELETON_VARIANTS = ["paragraph", "card", "table-row", "avatar", "image"];
var SKELETON_SHAPES = ["rect", "circle"];
var Skeleton = {
  name: "Skeleton",
  description: "Loading placeholder. Pass a `variant` for common shapes \u2014 `paragraph` (default), `card`, `table-row`, `avatar`, `image` \u2014 or use `shape` / `width` / `height` to build a custom one. All variants use a shimmer animation that respects `prefers-reduced-motion`.",
  props: [
    { name: "variant", type: "string", optional: true, enum: SKELETON_VARIANTS },
    { name: "lines", type: "number", optional: true, aliases: ["count"], description: "Lines for the `paragraph` variant (default 3)" },
    { name: "height", type: "number | string", optional: true, description: "Line height in px (paragraph) or CSS height for custom shape" },
    { name: "shape", type: "string", optional: true, enum: SKELETON_SHAPES, description: "Force a primitive shape (rect/circle)" },
    { name: "width", type: "string", optional: true, description: "CSS width for shape-only skeletons" }
  ],
  render: (_node, props) => {
    const variant = asString(props.variant);
    const shape = asString(props.shape);
    if (shape) return renderShapeSkeleton(shape, props);
    if (variant && variant !== "paragraph") return renderVariantSkeleton(variant, props);
    const rawLines = Number(props.lines);
    const lines = Math.max(1, Math.min(50, Number.isFinite(rawLines) ? Math.floor(rawLines) : 3));
    const rawHeight = Number(props.height);
    const lineHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.min(200, Math.floor(rawHeight)) : 12;
    const root = el("div", { class: "rui-skeleton", "data-variant": "paragraph" });
    for (let i = 0; i < lines; i += 1) {
      root.append(el("div", { class: "rui-skeleton-line", style: `height:${lineHeight}px` }));
    }
    return root;
  }
};
function renderShapeSkeleton(shape, props) {
  const width = sanitiseCssLength(asString(props.width), "100%");
  const heightInput = asString(props.height);
  const height = heightInput ? sanitiseCssLength(heightInput, "16px") : shape === "circle" ? width : "16px";
  return el("div", {
    class: "rui-skeleton",
    "data-variant": "shape",
    "data-shape": shape === "circle" ? "circle" : "rect",
    style: `width:${width};height:${height};`
  });
}
function renderVariantSkeleton(variant, props) {
  const root = el("div", { class: "rui-skeleton", "data-variant": variant });
  switch (variant) {
    case "avatar": {
      const size = sanitiseCssLength(asString(props.width), "40px");
      root.append(el("div", {
        class: "rui-skeleton-shape",
        "data-shape": "circle",
        style: `width:${size};height:${size};`
      }));
      return root;
    }
    case "image": {
      const width = sanitiseCssLength(asString(props.width), "100%");
      const height = sanitiseCssLength(asString(props.height), "160px");
      root.append(el("div", {
        class: "rui-skeleton-shape",
        "data-shape": "rect",
        style: `width:${width};height:${height};`
      }));
      return root;
    }
    case "card": {
      root.append(el("div", { class: "rui-skeleton-shape", "data-shape": "rect", style: "width:100%;height:120px;" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:14px;width:70%;" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:12px;width:90%;" }));
      root.append(el("div", { class: "rui-skeleton-line", style: "height:12px;width:60%;" }));
      return root;
    }
    case "table-row": {
      const cells = Math.max(1, Math.min(8, Math.floor(Number(props.lines ?? 4))));
      const row = el("div", { class: "rui-skeleton-row" });
      for (let i = 0; i < cells; i += 1) {
        row.append(el("div", { class: "rui-skeleton-line", style: "height:12px;flex:1;" }));
      }
      root.append(row);
      return root;
    }
    default:
      return root;
  }
}
var Markdown = {
  name: "Markdown",
  description: "Render markdown-flavoured text. Supports **bold**, *italic*, `code`, headings (`#`/`##`/`###`), blockquotes (`>`), bullet (`-`/`*`) and numbered (`1.`) lists, fenced code blocks (```), images (`![alt](src)`), inline links, and auto-linked bare URLs. Multi-line paragraphs collapse into `<p>` blocks.",
  props: [{ name: "content", type: "string" }],
  render: (_node, props) => {
    const value = asString(props.content);
    const html = renderMarkdown(value);
    return el("div", { class: "rui-markdown", html });
  }
};
var Container = {
  name: "Container",
  description: "Centered, max-width content wrapper. Use when a page is wider than comfortable reading width \u2014 landing pages, marketing sections, long documents. Picks a sensible default max-width per size; pass `maxWidth` to override with any CSS value.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg", "xl", "full"], description: "sm=640 / md=820 / lg=1040 / xl=1280 / full=100% (default lg)" },
    { name: "maxWidth", type: "string", optional: true, description: "Custom CSS max-width (overrides `size`)" },
    { name: "padding", type: "string", optional: true, enum: ["none", "s", "m", "l"], description: "Horizontal padding (default m)" }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-container",
      "data-size": asString(props.size, "lg"),
      "data-padding": asString(props.padding, "m"),
      style: props.maxWidth ? `max-width:${sanitiseCssLength(props.maxWidth, "auto")};` : null
    });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var Spacer = {
  name: "Spacer",
  description: 'Explicit space element for fine layout control. By default acts as a flex spacer that pushes following content to the far edge (use inside `Stack(direction="row")`). Pass `size` to render a fixed vertical/horizontal gap instead.',
  props: [
    { name: "size", type: "string", optional: true, enum: ["xs", "s", "m", "l", "xl"], description: "Fixed gap; omit to flex-grow" },
    { name: "flex", type: "boolean", optional: true, description: "Flex-grow even when size is set (default true when size omitted)" }
  ],
  render: (_node, props) => {
    const size = asString(props.size);
    const flex = props.flex === void 0 ? !size : asBoolean(props.flex);
    return el("span", {
      class: "rui-spacer",
      "data-size": size || null,
      "data-flex": flex ? "true" : "false",
      "aria-hidden": "true"
    });
  }
};
var Spinner = {
  name: "Spinner",
  description: "Indeterminate inline loader. Use for tiny loading states inside buttons, toolbars, table cells, or chat bubbles where `Skeleton` and `Progress(indeterminate=true)` are too heavy. Pass `label` to render an inline caption beside the spinner (also announced via `aria-label`).",
  props: [
    { name: "size", type: "string", optional: true, enum: SIZE_ENUM, description: "Default `md`" },
    { name: "label", type: "string", optional: true, description: "Caption rendered beside the spinner (also announced)" },
    { name: "tone", type: "string", optional: true, enum: TONE_ENUM, description: "Visual accent (default `primary`)" }
  ],
  render: (_node, props) => {
    const size = normaliseSize(props.size, "md");
    const tone = asString(props.tone, "primary");
    const label = asString(props.label);
    const root = el("span", {
      class: "rui-spinner",
      "data-size": size,
      "data-tone": tone,
      role: "status",
      "aria-live": "polite",
      "aria-label": label || "Loading"
    });
    root.append(el("span", { class: "rui-spinner-ring", "aria-hidden": "true" }));
    if (label) root.append(el("span", { class: "rui-spinner-label" }, [label]));
    return root;
  }
};
var Quote = {
  name: "Quote",
  description: "Inline pull-quote with optional citation. Lighter than `Testimonial` \u2014 use inside articles, blog posts, marketing sections, or anywhere you need to highlight a sentence without the full quote/author/role + rating shape.",
  props: [
    { name: "text", type: "string" },
    { name: "cite", type: "string", optional: true, aliases: ["attribution", "author"], description: "Attribution text shown below the quote" },
    { name: "tone", type: "string", optional: true, enum: ["default", "primary", "success", "warning", "danger", "info"] }
  ],
  render: (_node, props) => {
    const root = el("figure", {
      class: "rui-quote",
      "data-tone": asString(props.tone, "default")
    });
    root.append(el("blockquote", { class: "rui-quote-text" }, [asString(props.text)]));
    const cite = asString(props.cite);
    if (cite) root.append(el("figcaption", { class: "rui-quote-cite" }, [cite]));
    return root;
  }
};
function renderMarkdown(value) {
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = value.split(/\r?\n/);
  const out = [];
  let listMode = null;
  let inQuote = false;
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  const closeList = () => {
    if (listMode) {
      out.push(listMode === "ul" ? "</ul>" : "</ol>");
      listMode = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push("</blockquote>");
      inQuote = false;
    }
  };
  const flushCode = () => {
    const lang = codeLang ? ` data-language="${escape(codeLang)}"` : "";
    out.push(`<pre class="rui-markdown-code"${lang}><code>${escape(codeBuf.join("\n"))}</code></pre>`);
    codeBuf = [];
    codeLang = "";
    inCode = false;
  };
  for (const rawLine of lines) {
    const fenceMatch = /^```\s*(.*)$/.exec(rawLine.trim());
    if (inCode) {
      if (fenceMatch) {
        flushCode();
        continue;
      }
      codeBuf.push(rawLine);
      continue;
    }
    if (fenceMatch) {
      closeList();
      closeQuote();
      inCode = true;
      codeLang = fenceMatch[1] ?? "";
      continue;
    }
    const heading = /^\s*(#{1,3})\s+(.+)$/.exec(rawLine);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      out.push(`<h${level} class="rui-markdown-h${level}">${inline(escape(heading[2]))}</h${level}>`);
      continue;
    }
    const quoteMatch = /^\s*>\s?(.*)$/.exec(rawLine);
    if (quoteMatch) {
      closeList();
      if (!inQuote) {
        out.push('<blockquote class="rui-markdown-quote">');
        inQuote = true;
      }
      out.push(`<p>${inline(escape(quoteMatch[1] ?? ""))}</p>`);
      continue;
    } else if (inQuote && rawLine.trim() !== "") {
      closeQuote();
    }
    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(rawLine);
    if (ulMatch) {
      closeQuote();
      if (listMode !== "ul") {
        closeList();
        out.push("<ul>");
        listMode = "ul";
      }
      out.push(`<li>${inline(escape(ulMatch[1] ?? ""))}</li>`);
      continue;
    }
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(rawLine);
    if (olMatch) {
      closeQuote();
      if (listMode !== "ol") {
        closeList();
        out.push("<ol>");
        listMode = "ol";
      }
      out.push(`<li>${inline(escape(olMatch[1] ?? ""))}</li>`);
      continue;
    }
    if (rawLine.trim() === "") {
      closeList();
      closeQuote();
      continue;
    }
    closeList();
    closeQuote();
    out.push(`<p>${inline(escape(rawLine))}</p>`);
  }
  if (inCode) flushCode();
  closeList();
  closeQuote();
  return out.join("");
  function inline(s) {
    let result = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, rawSrc) => {
      const src = sanitiseImageSrc(rawSrc);
      if (!src) return `<span class="rui-markdown-image-fallback">${alt}</span>`;
      return `<img class="rui-markdown-image" src="${escapeAttr(src)}" alt="${alt}" loading="lazy">`;
    }).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, rawHref) => {
      const href = sanitizeMarkdownHref(rawHref);
      return `<a class="rui-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    result = result.replace(
      /(?<![="'>])\bhttps?:\/\/[a-zA-Z0-9._~:/?#@!$&'()*+,;=%\-]+/g,
      (url) => {
        const safe = sanitizeMarkdownHref(url);
        return `<a class="rui-link" href="${safe}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      }
    );
    return result;
  }
}
function sanitizeMarkdownHref(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "#";
  if (trimmed.startsWith("//")) return "#";
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("?")) {
    return escapeAttr(trimmed);
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!schemeMatch) return escapeAttr(trimmed);
  const scheme = schemeMatch[1].toLowerCase();
  const allowed = /* @__PURE__ */ new Set(["http", "https", "mailto", "tel"]);
  if (!allowed.has(scheme)) return "#";
  return escapeAttr(trimmed);
}
function escapeAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ../../src/library/components/_internal.ts
function renderAvatar(src, name, size) {
  const root = el("span", { class: "rui-avatar", "data-size": size, role: "img" });
  const safeSrc = sanitiseImageSrc(src);
  if (safeSrc) {
    const img = el("img", { src: safeSrc, alt: name, loading: "lazy" });
    img.onerror = (event) => {
      const ev = event;
      const live = ev.currentTarget ?? ev.target;
      live.replaceWith(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
    };
    root.append(img);
  } else {
    root.append(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
  }
  return root;
}
function initialsFor(name) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || trimmed.charAt(0).toUpperCase();
}
var DISMISS_REGISTRY = /* @__PURE__ */ new WeakMap();
function installDismissListeners(opts) {
  const { liveRoot, onDismiss } = opts;
  const existing = DISMISS_REGISTRY.get(liveRoot);
  if (existing) existing.dispose();
  const host = liveRoot.getRootNode();
  let disposed = false;
  const onOutside = (event) => {
    const target = event.target;
    if (target && liveRoot.contains(target)) return;
    handle.dispose();
    onDismiss();
  };
  const onKey = (event) => {
    if (event.key !== "Escape") return;
    handle.dispose();
    onDismiss();
  };
  const ownerDoc = liveRoot.ownerDocument;
  let observer = null;
  if (ownerDoc && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      if (!liveRoot.isConnected) handle.dispose();
    });
    const observeRoot = liveRoot.getRootNode();
    if (observeRoot instanceof Element || observeRoot instanceof Document || observeRoot instanceof ShadowRoot) {
      observer.observe(observeRoot, { childList: true, subtree: true });
    }
  }
  const handle = {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      host.removeEventListener("click", onOutside, true);
      host.removeEventListener("keydown", onKey, true);
      observer?.disconnect();
      DISMISS_REGISTRY.delete(liveRoot);
    }
  };
  setTimeout(() => {
    if (disposed) return;
    host.addEventListener("click", onOutside, true);
    host.addEventListener("keydown", onKey, true);
  }, 0);
  DISMISS_REGISTRY.set(liveRoot, handle);
  return handle;
}
function disposeDismissListeners(liveRoot) {
  if (!liveRoot) return;
  const existing = DISMISS_REGISTRY.get(liveRoot);
  if (existing) existing.dispose();
}
var ICON_KEYWORD_RULES = [
  { match: /\b(revenue|sales|sale|income|payment|charges?|invoices?|billing)\b/i, icon: "sack-dollar" },
  { match: /\b(profit|earnings?|margin|roi)\b/i, icon: "chart-line" },
  { match: /\b(customers?|clients?|users?|members?|people|accounts?)\b/i, icon: "users" },
  { match: /\b(visitors?|sessions?|traffic|page-?views?|impressions?)\b/i, icon: "chart-line" },
  { match: /\b(orders?|carts?|purchases?|transactions?)\b/i, icon: "cart-shopping" },
  { match: /\b(products?|inventory|sku|stock|items?)\b/i, icon: "box" },
  { match: /\b(subscriptions?|plans?|tiers?|pricing)\b/i, icon: "credit-card" },
  { match: /\b(emails?|messages?|inbox|threads?|mail)\b/i, icon: "envelope" },
  { match: /\b(notifications?|alerts?|reminders?)\b/i, icon: "bell" },
  { match: /\b(growth|trend|increase|up)\b/i, icon: "arrow-trend-up" },
  { match: /\b(decline|drop|down|decrease|loss)\b/i, icon: "arrow-trend-down" },
  { match: /\b(reports?|analytics|insights?|dashboards?|metrics?|stats?|kpis?)\b/i, icon: "chart-pie" },
  { match: /\b(charts?|graphs?)\b/i, icon: "chart-column" },
  { match: /\b(tasks?|todos?|backlog|kanban|sprint)\b/i, icon: "list-check" },
  { match: /\b(projects?|workspaces?)\b/i, icon: "folder-open" },
  { match: /\b(files?|folders?|documents?|docs?|attachments?)\b/i, icon: "folder-open" },
  { match: /\b(images?|photos?|gallery|albums?)\b/i, icon: "image" },
  { match: /\b(videos?|clips?|recordings?)\b/i, icon: "video" },
  { match: /\b(audio|music|podcasts?|sounds?)\b/i, icon: "music" },
  { match: /\b(calendars?|schedule|events?|meetings?|appointments?)\b/i, icon: "calendar-days" },
  { match: /\b(comments?|replies|feedback|reviews?|ratings?)\b/i, icon: "comments" },
  { match: /\b(settings?|preferences?|config|configuration|options?)\b/i, icon: "gear" },
  { match: /\b(security|privacy|password|locks?|secure)\b/i, icon: "shield-halved" },
  { match: /\b(api|integrations?|webhooks?|connections?)\b/i, icon: "plug" },
  { match: /\b(database|storage|backups?|servers?)\b/i, icon: "database" },
  { match: /\b(speed|performance|latency|response\s?time)\b/i, icon: "gauge-high" },
  { match: /\b(uptime|availability|status|health)\b/i, icon: "heart-pulse" },
  { match: /\b(errors?|bugs?|failures?|exceptions?|incidents?)\b/i, icon: "circle-exclamation" },
  { match: /\b(success|complete|done|approved)\b/i, icon: "circle-check" },
  { match: /\b(warnings?|caution)\b/i, icon: "triangle-exclamation" },
  { match: /\b(search|results?|queries)\b/i, icon: "magnifying-glass" },
  { match: /\b(downloads?|exports?)\b/i, icon: "download" },
  { match: /\b(uploads?|imports?)\b/i, icon: "upload" },
  { match: /\b(time|hours?|duration|elapsed)\b/i, icon: "clock" },
  { match: /\b(locations?|maps?|addresses?|countries?|regions?)\b/i, icon: "location-dot" },
  { match: /\b(stars?|favourites?|favorites?|highlights?)\b/i, icon: "star" },
  { match: /\b(trophy|awards?|achievements?|badges?|gold)\b/i, icon: "trophy" },
  { match: /\b(targets?|goals?|objectives?|quotas?)\b/i, icon: "bullseye" },
  { match: /\b(teams?|departments?|orgs?|organisations?|organizations?)\b/i, icon: "people-group" },
  { match: /\b(tickets?|issues?|bugs?|requests?)\b/i, icon: "ticket" },
  { match: /\b(deploys?|builds?|releases?|versions?)\b/i, icon: "rocket" }
];
function pickIconForLabel(label) {
  if (!label) return null;
  for (const rule of ICON_KEYWORD_RULES) {
    if (rule.match.test(label)) return rule.icon;
  }
  return null;
}
var TONE_ICONS = {
  default: "circle-info",
  info: "circle-info",
  primary: "bolt",
  success: "circle-check",
  warning: "triangle-exclamation",
  danger: "circle-exclamation",
  error: "circle-exclamation",
  neutral: "circle-info"
};
function pickIconForTone(tone) {
  if (!tone) return null;
  return TONE_ICONS[tone.toLowerCase()] ?? null;
}
function dicebearUrlFor(name, style = "shapes") {
  const seed = name.trim() || "anon";
  const safeStyle = /^[a-z0-9-]+$/i.test(style) ? style : "shapes";
  return `https://api.dicebear.com/9.x/${safeStyle}/svg?seed=${encodeURIComponent(seed)}`;
}

// ../../src/library/components/forms-shared.ts
function extractComboboxItems(raw) {
  const items = asArray(raw);
  return items.map((entry) => {
    if (entry && typeof entry === "object") {
      const node = entry;
      if (node.__kind === "Component" && Array.isArray(node.args)) {
        const value2 = asString(node.args[0]);
        return { value: value2, label: asString(node.args[1], value2) };
      }
      if (node.value !== void 0 || node.label !== void 0) {
        const value2 = asString(node.value);
        return { value: value2, label: asString(node.label, value2) };
      }
    }
    const value = asString(entry);
    return { value, label: value };
  }).filter((item) => item.value !== "" || item.label !== "");
}

// ../../src/library/components/wrappers.ts
function renderChildAsNode(helpers, child) {
  if (child == null) return document.createTextNode("");
  if (Array.isArray(child)) {
    const wrap = el("span", { class: "rui-wrapper-fragment" });
    for (const c of child) {
      if (c == null) continue;
      wrap.append(typeof c === "string" ? document.createTextNode(c) : helpers.renderNode(c));
    }
    return wrap;
  }
  if (typeof child === "string") return document.createTextNode(child);
  return helpers.renderNode(child);
}
function transparentWrapper(className, extraAttrs) {
  return el("span", {
    class: `rui-wrapper ${className}`,
    style: "display: contents;",
    ...extraAttrs ?? {}
  });
}
function sanitiseInlineStyle2(input) {
  const raw = asString(input).trim();
  if (!raw) return "";
  if (/[<>]/.test(raw)) return "";
  if (/\bexpression\s*\(|\bjavascript\s*:|\bbehavior\s*:|@import\b/i.test(raw)) return "";
  return raw;
}
var CLASS_TOKEN_RE = /^[A-Za-z_][A-Za-z0-9_\-:/]*$/;
function sanitiseClassList(input) {
  const tokens = Array.isArray(input) ? input.map((value) => asString(value)) : asString(input).split(/\s+/);
  return tokens.map((token) => token.trim()).filter((token) => token.length > 0 && token.length <= 64 && CLASS_TOKEN_RE.test(token));
}
var OnClick = {
  name: "OnClick",
  description: "Make any component clickable. Wraps the child in a transparent span and dispatches `onClick(event)` when the user clicks or taps anywhere inside it. Use to attach click behaviour to components that do not expose an `action` / `onClick` prop (cards, list rows, media tiles, custom layouts).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"], description: "Component (or array of components) to wrap" },
    { name: "onClick", type: "callable", required: true, aliases: ["action", "onclick"], description: "Callable invoked on click / tap. Receives the native MouseEvent." },
    { name: "disabled", type: "boolean", optional: true, description: "Skip firing the handler while truthy" },
    { name: "stopPropagation", type: "boolean", optional: true, description: "Call event.stopPropagation() after invoking the handler (default false)" }
  ],
  render: (_node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-click", { role: "button", tabindex: "0" });
    wrapper.append(renderChildAsNode(helpers, props.child));
    const disabled = asBoolean(props.disabled);
    const stopProp = asBoolean(props.stopPropagation);
    const handle = (event) => {
      if (disabled) return;
      if (stopProp) event.stopPropagation();
      helpers.invoke(props.onClick, event);
    };
    wrapper.addEventListener("click", handle);
    wrapper.addEventListener("keydown", (event) => {
      const e = event;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handle(e);
      }
    });
    return wrapper;
  }
};
var MOUSE_EVENT_MAP = [
  { prop: "enter", event: "mouseenter" },
  { prop: "leave", event: "mouseleave" },
  { prop: "hover", event: "mouseover" },
  { prop: "move", event: "mousemove" },
  { prop: "down", event: "mousedown" },
  { prop: "up", event: "mouseup" },
  { prop: "click", event: "click" },
  { prop: "doubleClick", event: "dblclick" },
  { prop: "contextMenu", event: "contextmenu" },
  { prop: "scroll", event: "scroll" },
  { prop: "wheel", event: "wheel" },
  { prop: "drag", event: "drag" },
  { prop: "drop", event: "drop" },
  { prop: "dragStart", event: "dragstart" },
  { prop: "dragEnd", event: "dragend" },
  { prop: "dragEnter", event: "dragenter" },
  { prop: "dragLeave", event: "dragleave" },
  { prop: "dragOver", event: "dragover" }
];
var OnMouse = {
  name: "OnMouse",
  description: "Attach any combination of mouse / pointer / drag listeners to a component. Pass only the props you need \u2014 unused events install no listener so the wrapper is essentially free. Each handler receives the native MouseEvent / DragEvent / WheelEvent. Use for hover tracking, custom drag-and-drop, context menus, scroll-aware UIs.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"], description: "Component to wrap" },
    { name: "enter", type: "callable", optional: true, description: "Fired when the pointer enters the element (mouseenter)" },
    { name: "leave", type: "callable", optional: true, description: "Fired when the pointer leaves the element (mouseleave)" },
    { name: "hover", type: "callable", optional: true, description: "Fired on every mouseover inside the element" },
    { name: "move", type: "callable", optional: true, description: "Fired on every mousemove inside the element" },
    { name: "down", type: "callable", optional: true, description: "Fired on mousedown" },
    { name: "up", type: "callable", optional: true, description: "Fired on mouseup" },
    { name: "click", type: "callable", optional: true, description: "Fired on click / tap" },
    { name: "doubleClick", type: "callable", optional: true, description: "Fired on double-click" },
    { name: "contextMenu", type: "callable", optional: true, description: "Fired on right-click (contextmenu)" },
    { name: "scroll", type: "callable", optional: true, description: "Fired when an inner element scrolls" },
    { name: "wheel", type: "callable", optional: true, description: "Fired on mouse-wheel / trackpad scroll" },
    { name: "drag", type: "callable", optional: true, description: "Fired while the element is being dragged" },
    { name: "drop", type: "callable", optional: true, description: "Fired when something is dropped onto the element" },
    { name: "dragStart", type: "callable", optional: true, description: "Fired when a drag begins" },
    { name: "dragEnd", type: "callable", optional: true, description: "Fired when a drag ends" },
    { name: "dragEnter", type: "callable", optional: true, description: "Fired when a drag enters the element" },
    { name: "dragLeave", type: "callable", optional: true, description: "Fired when a drag leaves the element" },
    { name: "dragOver", type: "callable", optional: true, description: "Fired while something is dragged over the element. Call `event.preventDefault()` to make the element a valid drop target." },
    { name: "draggable", type: "boolean", optional: true, description: 'Make the wrapper itself draggable (sets `draggable="true"`)' },
    { name: "passiveScroll", type: "boolean", optional: true, description: "Register scroll/wheel listeners as passive (default true for better scroll performance)" }
  ],
  render: (_node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-mouse");
    if (asBoolean(props.draggable)) wrapper.setAttribute("draggable", "true");
    wrapper.append(renderChildAsNode(helpers, props.child));
    const passive = props.passiveScroll === void 0 ? true : asBoolean(props.passiveScroll);
    for (const { prop, event } of MOUSE_EVENT_MAP) {
      const handler = props[prop];
      if (handler == null) continue;
      const isScrollEvent = event === "scroll" || event === "wheel";
      const options = isScrollEvent ? { passive } : {};
      wrapper.addEventListener(event, (ev) => {
        helpers.invoke(handler, ev);
      }, options);
    }
    return wrapper;
  }
};
var KEYBOARD_EVENT_MAP = [
  { prop: "onKeyDown", event: "keydown" },
  { prop: "onKeyUp", event: "keyup" },
  { prop: "onKeyPress", event: "keypress" }
];
var OnKeyboard = {
  name: "OnKeyboard",
  description: 'Attach keyboard listeners to a component. Pass any combination of `onKeyDown`, `onKeyUp`, and `onKeyPress`; each handler receives the native KeyboardEvent. Use for keyboard shortcuts, navigation, and custom focusable widgets. The wrapper is focusable by default (tabindex="0") so it can be reached via Tab; pass `focusable=false` to disable when the child is already focusable.',
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onKeyDown", type: "callable", optional: true, aliases: ["onkeydown"], description: "Fired on keydown" },
    { name: "onKeyUp", type: "callable", optional: true, aliases: ["onkeyup"], description: "Fired on keyup" },
    { name: "onKeyPress", type: "callable", optional: true, aliases: ["onkeypress"], description: "Fired on keypress" },
    { name: "focusable", type: "boolean", optional: true, description: "Make the wrapper focusable via Tab (default true)" }
  ],
  render: (_node, props, helpers) => {
    const focusable = props.focusable === void 0 ? true : asBoolean(props.focusable);
    const wrapper = transparentWrapper("rui-on-keyboard", focusable ? { tabindex: "0" } : {});
    wrapper.append(renderChildAsNode(helpers, props.child));
    for (const { prop, event } of KEYBOARD_EVENT_MAP) {
      const handler = props[prop];
      if (handler == null) continue;
      wrapper.addEventListener(event, (ev) => {
        helpers.invoke(handler, ev);
      });
    }
    return wrapper;
  }
};
var OnFocus = {
  name: "OnFocus",
  description: "Attach focus / blur listeners to a component. Use to track input focus rings, custom focus indicators, or autosave-on-blur flows. Listens on the capture phase so blur from descendants is observed.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onFocus", type: "callable", optional: true, aliases: ["onfocus"], description: "Fired when focus enters the element or any descendant" },
    { name: "onBlur", type: "callable", optional: true, aliases: ["onblur"], description: "Fired when focus leaves the element and all descendants" }
  ],
  render: (_node, props, helpers) => {
    const wrapper = transparentWrapper("rui-on-focus");
    wrapper.append(renderChildAsNode(helpers, props.child));
    if (props.onFocus != null) {
      wrapper.addEventListener("focusin", (ev) => helpers.invoke(props.onFocus, ev));
    }
    if (props.onBlur != null) {
      wrapper.addEventListener("focusout", (ev) => helpers.invoke(props.onBlur, ev));
    }
    return wrapper;
  }
};
var OnIntersect = {
  name: "OnIntersect",
  description: "Observe whether a component is visible in the viewport (or a scroll container) using IntersectionObserver. Fires `onEnter` the first time the wrapped element becomes visible, `onLeave` when it leaves, and `onChange({visible, ratio})` for every transition. Use for lazy-load sentinels, infinite-scroll triggers, impression analytics, and reveal-on-scroll animations.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onEnter", type: "callable", optional: true, description: "Fired when the element enters the viewport" },
    { name: "onLeave", type: "callable", optional: true, description: "Fired when the element leaves the viewport" },
    { name: "onChange", type: "callable", optional: true, description: "Fired with `{visible, ratio}` on every transition" },
    { name: "threshold", type: "number", optional: true, description: "Visible-ratio threshold 0\u20131 (default 0.05)" },
    { name: "rootMargin", type: "string", optional: true, description: 'CSS-length root margin (e.g. "0px 0px -64px 0px")' },
    { name: "once", type: "boolean", optional: true, description: "Disconnect after the first entry (default false)" }
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("span", {
      class: "rui-wrapper rui-on-intersect",
      style: "display: inline-block;"
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    const ObserverCtor = typeof IntersectionObserver !== "undefined" ? IntersectionObserver : void 0;
    if (!ObserverCtor) return wrapper;
    const threshold = Math.max(0, Math.min(1, asNumber(props.threshold, 0.05)));
    const rootMargin = asString(props.rootMargin);
    const once = asBoolean(props.once);
    let lastVisible = null;
    const observer = new ObserverCtor((entries) => {
      for (const entry of entries) {
        const visible = entry.isIntersecting;
        if (visible !== lastVisible) {
          if (visible && props.onEnter != null) helpers.invoke(props.onEnter, entry);
          if (!visible && lastVisible === true && props.onLeave != null) {
            helpers.invoke(props.onLeave, entry);
          }
          lastVisible = visible;
        }
        if (props.onChange != null) {
          helpers.invoke(props.onChange, { visible, ratio: entry.intersectionRatio });
        }
        if (once && visible) {
          observer.disconnect();
          return;
        }
      }
    }, {
      threshold,
      ...rootMargin ? { rootMargin } : {}
    });
    observer.observe(wrapper);
    helpers.registerDisposer(() => observer.disconnect());
    return wrapper;
  }
};
var OnMount = {
  name: "OnMount",
  description: "Run imperative code against the wrapped component's rendered DOM node. `onMount(node)` fires once, on a microtask after the child is attached to the DOM \u2014 the Aktion way to get a DOM ref (measure an element, focus it, or hand it to an imperative library such as a chart / map / editor). `onUnmount(node)` fires when the component leaves the tree. Pair with `$ref(...)` to stash the node across renders.",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "onMount", type: "callable", optional: true, description: "`(node) => void` \u2014 fired once after the wrapped element is attached." },
    { name: "onUnmount", type: "callable", optional: true, description: "`(node) => void` \u2014 fired when the wrapped element leaves the tree." }
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("span", {
      class: "rui-wrapper rui-on-mount",
      style: "display: contents;"
    });
    wrapper.append(renderChildAsNode(helpers, props.child));
    const mounted = helpers.useInstanceState("rui-on-mount", false);
    if (!mounted.get()) {
      mounted.set(true);
      const fire = () => {
        const node = wrapper.firstElementChild ?? wrapper;
        if (props.onMount != null) helpers.invoke(props.onMount, node);
        if (props.onUnmount != null) {
          helpers.registerDisposer(() => {
            const run = () => helpers.invoke(props.onUnmount, node);
            if (typeof queueMicrotask === "function") queueMicrotask(run);
            else void Promise.resolve().then(run);
          }, "rui-on-mount-unmount");
        }
      };
      if (typeof queueMicrotask === "function") queueMicrotask(fire);
      else void Promise.resolve().then(fire);
    }
    return wrapper;
  }
};
function renderLinkChildren(helpers, child) {
  if (child == null) return [];
  if (typeof child === "string") return [document.createTextNode(child)];
  if (Array.isArray(child)) {
    return child.filter((c) => c != null).map((c) => typeof c === "string" ? document.createTextNode(c) : helpers.renderNode(c));
  }
  return [helpers.renderNode(child)];
}
var Link = {
  name: "Link",
  description: 'Anchor link. Accepts either a plain string label or a wrapped component as its positional child. Pass `to` for client-side router navigation (no page reload) or `href` for a regular anchor. `external: true` opens the link in a new tab with `rel="noopener noreferrer"`. Use to make any component clickable as a link \u2014 cards, icons, badges, list rows.',
  props: [
    { name: "label", type: "string | Node", positional: true, required: true, aliases: ["child", "children"], description: "Visible text OR a wrapped component" },
    { name: "to", type: "string", optional: true, description: "Router path (preferred). Navigates via the runtime router on click." },
    { name: "href", type: "string", optional: true, description: "Standard anchor href. Used when `to` is omitted." },
    { name: "external", type: "boolean", optional: true, description: 'Open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`)' },
    { name: "variant", type: "string", optional: true, enum: ["default", "subtle"] }
  ],
  render: (_node, props, helpers) => {
    const to = asString(props.to);
    const external = asBoolean(props.external);
    const target = to || asString(props.href);
    const safeHref = to ? target.startsWith("/") || target.startsWith("#") ? target : sanitiseHref(target, "#") : sanitiseHref(props.href, "#");
    const variant = asString(props.variant, "default");
    const anchor = el("a", {
      class: "rui-link",
      "data-variant": variant,
      href: safeHref,
      target: external ? "_blank" : null,
      rel: external ? "noopener noreferrer" : null
    });
    for (const node of renderLinkChildren(helpers, props.label)) anchor.append(node);
    if (to && !external) {
      anchor.addEventListener("click", (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        helpers.router.navigate(to);
      });
    }
    return anchor;
  }
};
var Css = {
  name: "Css",
  description: "Apply raw CSS class names and / or an inline style string to a wrapped component. The styling is merged onto the rendered child's DOM element \u2014 no extra wrapper element is added unless the child is plain text (in which case the styling lands on a wrapping span). Reach for `Css` only when the component's own props cannot express the styling (use `Box`/`Stack`/`Grid` props for layout, `Theme` for tokens, `Styles` + selector classes for sweeping changes).",
  props: [
    { name: "child", type: "Node", positional: true, required: true, aliases: ["children"] },
    { name: "style", type: "string", optional: true, description: 'Inline CSS declarations (e.g. "padding: 16px; background: #eef;")' },
    { name: "class", type: "string | string[]", optional: true, aliases: ["className", "classes"], description: "Class name (space-separated string or array). Tokens must match `[A-Za-z_][A-Za-z0-9_-:/]*`." }
  ],
  render: (_node, props, helpers) => {
    const rendered = renderChildAsNode(helpers, props.child);
    const target = rendered instanceof HTMLElement ? rendered : (() => {
      const span = el("span", { class: "rui-css" });
      span.append(rendered);
      return span;
    })();
    const safeClasses = sanitiseClassList(props.class);
    for (const token of safeClasses) target.classList.add(token);
    const safeStyle = sanitiseInlineStyle2(props.style);
    if (safeStyle) {
      const existing = target.getAttribute("style");
      target.setAttribute("style", existing ? `${existing};${safeStyle}` : safeStyle);
    }
    return target;
  }
};
function attachOnChange(element, callback, helpers, options) {
  if (callback === null || callback === void 0) return;
  const eventName = options.event ?? "change";
  element.addEventListener(eventName, () => {
    helpers.invoke(callback, options.getValue(element));
  });
}

// ../../src/library/components/forms.ts
var BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"];
var BUTTON_SIZES = ["xs", "sm", "md", "lg", "xl"];
var INPUT_TYPES = ["text", "email", "password", "number", "tel", "url", "date"];
function normaliseButtonSize(value) {
  const v = asString(value).trim().toLowerCase();
  if (v === "xs" || v === "extra-small") return "xs";
  if (v === "sm") return "sm";
  if (v === "lg") return "lg";
  if (v === "xl" || v === "extra-large") return "xl";
  return "md";
}
var Button = {
  name: "Button",
  description: "Clickable button. `onClick` (a callable) runs when the user presses the button. The legacy `action` prop is an alias and is still accepted.",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable invoked when the button is clicked" },
    { name: "variant", type: "string", optional: true, aliases: ["tone"], enum: BUTTON_VARIANTS },
    { name: "type", type: "string", optional: true, enum: ["button", "submit"], description: "HTML button type" },
    { name: "size", type: "string", optional: true, enum: BUTTON_SIZES, description: "Size token `xs|sm|md|lg|xl`" },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" },
    { name: "iconPosition", type: "string", optional: true, enum: ["leading", "trailing"], description: "Icon placement (default leading)" },
    { name: "iconOnly", type: "boolean", optional: true, description: "Hide the label visually (keeps aria-label)" },
    { name: "loading", type: "boolean", optional: true, description: "Show spinner and disable interaction" },
    { name: "fullWidth", type: "boolean", optional: true },
    { name: "disabled", type: "boolean", optional: true }
  ],
  render: (_node, props, helpers) => {
    const loading = asBoolean(props.loading);
    const iconOnly = asBoolean(props.iconOnly);
    const iconPosition = asString(props.iconPosition, "leading");
    const labelText = asString(props.label);
    const button = el("button", {
      class: "rui-button",
      type: asString(props.type, "button"),
      "data-variant": asString(props.variant, "primary"),
      "data-size": normaliseButtonSize(props.size),
      "data-icon-position": iconPosition,
      "data-icon-only": iconOnly ? "true" : null,
      "data-full-width": asBoolean(props.fullWidth) ? "true" : null,
      "data-loading": loading ? "true" : null,
      "aria-label": iconOnly ? labelText : null,
      disabled: asBoolean(props.disabled) || loading ? "" : null
    });
    const labelSpan = el("span", { class: "rui-button-label" }, [labelText]);
    const iconNode = renderIcon(props.icon, { className: "rui-button-icon" });
    const spinNode = loading ? renderIcon("spinner", { className: "rui-button-spinner" }) : null;
    const adornment = spinNode ?? iconNode;
    if (iconOnly) {
      if (adornment) button.append(adornment);
    } else if (iconPosition === "trailing") {
      button.append(labelSpan);
      if (adornment) button.append(adornment);
    } else {
      if (adornment) button.append(adornment);
      button.append(labelSpan);
    }
    button.onclick = () => {
      if (loading) return;
      helpers.invoke(props.onClick);
    };
    return button;
  }
};
var Buttons = {
  name: "Buttons",
  description: "Group of buttons laid out horizontally or vertically.",
  props: [
    { name: "items", type: "Button[]" },
    { name: "direction", type: "string", optional: true, enum: ["row", "column"] }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-buttons",
      "data-direction": asString(props.direction, "row")
    });
    for (const child of asArray(props.items)) root.append(helpers.renderNode(child));
    return root;
  }
};
var Input = {
  name: "Input",
  description: "Text input field. Pass a $variable as `value` for two-way binding. `onChange(value)` fires on every keystroke with the current string.",
  props: [
    { name: "id", type: "string", description: "Input identifier" },
    { name: "placeholder", type: "string", optional: true },
    { name: "type", type: "string", optional: true, enum: INPUT_TYPES },
    { name: "validations", type: "any", optional: true, description: "Array or object of validation hints" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const input = el("input", {
      class: "rui-input",
      id: asString(props.id),
      name: asString(props.id),
      type: asString(props.type, "text"),
      placeholder: asString(props.placeholder),
      value: asString(props.value)
    });
    bindToStateAtArg(input, node, 4, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => n.value
    });
    applyValidations(input, props.validations);
    return input;
  }
};
var TextArea = {
  name: "TextArea",
  description: "Multi-line text input. `onChange(value)` fires on every keystroke with the current text.",
  props: [
    { name: "id", type: "string" },
    { name: "placeholder", type: "string", optional: true },
    { name: "rows", type: "number", optional: true },
    { name: "value", type: "any", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const textarea = el("textarea", {
      class: "rui-textarea",
      id: asString(props.id),
      name: asString(props.id),
      placeholder: asString(props.placeholder),
      rows: String(Number(props.rows ?? 4) || 4)
    });
    textarea.value = asString(props.value);
    bindToStateAtArg(textarea, node, 3, helpers);
    attachOnChange(textarea, props.onChange, helpers, {
      event: "input",
      getValue: (n) => n.value
    });
    return textarea;
  }
};
var SelectItem = {
  name: "SelectItem",
  description: "Single option for a Select component.",
  props: [
    { name: "value", type: "string" },
    { name: "label", type: "string" }
  ],
  render: (_node, props) => {
    return el("option", { value: asString(props.value) }, [asString(props.label)]);
  }
};
var Select = {
  name: "Select",
  description: "Dropdown select. Pass a `$variable` as `value` for two-way binding. Set `searchable: true` for a combobox-style filter UI on long option lists. `onChange(value)` fires with the newly-selected value.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]" },
    { name: "label", type: "string", optional: true },
    { name: "placeholder", type: "string", optional: true },
    { name: "value", type: "any", optional: true },
    { name: "searchable", type: "boolean", optional: true, description: "Render as a filterable combobox" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value" }
  ],
  render: (node, props, helpers) => {
    if (asBoolean(props.searchable)) {
      return renderSearchableSelect(node, props, helpers);
    }
    const select = el("select", {
      class: "rui-select",
      id: asString(props.id),
      name: asString(props.id)
    });
    const placeholder = asString(props.placeholder);
    if (placeholder) {
      select.append(el("option", { value: "", disabled: "", selected: "" }, [placeholder]));
    }
    for (const item of asArray(props.items)) {
      select.append(helpers.renderNode(item));
    }
    select.value = asString(props.value);
    bindToStateAtArg(select, node, 4, helpers);
    attachOnChange(select, props.onChange, helpers, {
      event: "change",
      getValue: (n) => n.value
    });
    return select;
  }
};
var Checkbox = {
  name: "Checkbox",
  description: "Boolean checkbox. `onChange(checked)` fires with the new boolean state.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string" },
    { name: "value", type: "boolean", optional: true, aliases: ["checked"] },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new boolean value" }
  ],
  render: (node, props, helpers) => {
    const wrapper = el("label", { class: "rui-checkbox" });
    const isChecked = asBoolean(props.value);
    const input = el("input", {
      type: "checkbox",
      id: asString(props.id),
      name: asString(props.id),
      checked: isChecked ? "" : null
    });
    input.checked = isChecked;
    bindToStateAtArg(input, node, 2, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => n.checked
    });
    wrapper.append(input, el("span", { class: "rui-checkbox-label" }, [asString(props.label)]));
    return wrapper;
  }
};
var CheckBoxItem = {
  name: "CheckBoxItem",
  description: "Single option inside a CheckBoxGroup.",
  props: [
    { name: "label", type: "string" },
    { name: "name", type: "string", description: "Key inside the group's value object" },
    { name: "description", type: "string", optional: true },
    { name: "defaultChecked", type: "boolean", optional: true, aliases: ["checked"] }
  ],
  render: (_node, props) => {
    const itemName = asString(props.name);
    const label = asString(props.label);
    const description = asString(props.description);
    const isChecked = asBoolean(props.defaultChecked);
    const wrapper = el("label", {
      class: "rui-checkbox-item",
      "data-name": itemName
    });
    const input = el("input", {
      type: "checkbox",
      name: itemName,
      checked: isChecked ? "" : null
    });
    input.checked = isChecked;
    const text = el("div", { class: "rui-checkbox-item-text" });
    text.append(el("div", { class: "rui-checkbox-item-label" }, [label]));
    if (description) text.append(el("div", { class: "rui-checkbox-item-description" }, [description]));
    wrapper.append(input, text);
    return wrapper;
  }
};
var CheckBoxGroup = {
  name: "CheckBoxGroup",
  description: "Group of checkboxes. Value is an object keyed by item name. Pass a `$variable` for two-way binding. `onChange(value)` fires with the full updated object.",
  props: [
    { name: "name", type: "string", description: "Group identifier" },
    { name: "items", type: "CheckBoxItem[]" },
    { name: "value", type: "any", optional: true, description: "Bound value (typically $variable)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated `{name: checked}` object when any item toggles" }
  ],
  render: (node, props, helpers) => {
    const groupName = asString(props.name);
    const root = el("div", { class: "rui-checkbox-group", role: "group", "data-name": groupName });
    const items = asArray(props.items);
    const valueObject = props.value && typeof props.value === "object" ? props.value : {};
    const inputs = [];
    items.forEach((item, idx) => {
      const label = asString(item.args?.[0]);
      const itemName = asString(item.args?.[1], `${groupName}-${idx}`);
      const description = asString(item.args?.[2]);
      const defaultChecked = asBoolean(item.args?.[3]);
      const id = `${groupName}-${itemName}`;
      const wrapper = el("label", { class: "rui-checkbox-item", for: id });
      const isChecked = itemName in valueObject ? Boolean(valueObject[itemName]) : defaultChecked;
      const input = el("input", {
        type: "checkbox",
        id,
        name: itemName,
        checked: isChecked ? "" : null
      });
      inputs.push(input);
      const text = el("div", { class: "rui-checkbox-item-text" });
      text.append(el("div", { class: "rui-checkbox-item-label" }, [label]));
      if (description) text.append(el("div", { class: "rui-checkbox-item-description" }, [description]));
      wrapper.append(input, text);
      root.append(wrapper);
    });
    const stateName = node.argMeta?.[2]?.stateRef;
    const readGroupValue = (rootEl) => {
      const out = {};
      rootEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        out[input.name] = input.checked;
      });
      return out;
    };
    if (stateName) {
      helpers.bindState(root, stateName, {
        event: "change",
        // Read from the *live* DOM rooted at the event target, never from
        // the closure's `inputs` array. After a morph re-render those
        // captured input elements are detached and report stale `checked`.
        getValue: readGroupValue
      });
    }
    attachOnChange(root, props.onChange, helpers, {
      event: "change",
      getValue: (n) => readGroupValue(n)
    });
    return root;
  }
};
var Radio = {
  name: "Radio",
  description: "Radio button group. `onChange(value)` fires with the newly-selected option value.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]" },
    { name: "value", type: "any", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected radio value" }
  ],
  render: (node, props, helpers) => {
    const groupName = asString(props.id);
    const root = el("div", { class: "rui-radio-group", role: "radiogroup" });
    for (const item of asArray(props.items)) {
      const value = asString(item.args?.[0]);
      const label = asString(item.args?.[1], value);
      const id = `${groupName}-${value}`;
      const itemRoot = el("label", { class: "rui-radio", for: id });
      const isChecked = asString(props.value) === value;
      const input = el("input", {
        type: "radio",
        id,
        name: groupName,
        value,
        checked: isChecked ? "" : null
      });
      input.checked = isChecked;
      bindToStateAtArg(input, node, 2, helpers);
      attachOnChange(input, props.onChange, helpers, {
        event: "change",
        getValue: (n) => n.value
      });
      itemRoot.append(input, el("span", { class: "rui-radio-label" }, [label]));
      root.append(itemRoot);
    }
    return root;
  }
};
var FormControl = {
  name: "FormControl",
  description: "Labeled wrapper around a single form field.",
  props: [
    { name: "label", type: "string" },
    { name: "field", type: "Node", aliases: ["control"] },
    { name: "hint", type: "string", optional: true }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-form-control" });
    root.append(el("label", { class: "rui-form-label" }, [asString(props.label)]));
    const fieldEl = helpers.renderNode(props.field);
    root.append(fieldEl);
    const hint = asString(props.hint);
    if (hint) root.append(el("p", { class: "rui-form-hint" }, [hint]));
    return root;
  }
};
var SearchBar = {
  name: "SearchBar",
  description: "Pre-styled search input with a leading magnifying-glass icon, optional trailing submit button, and optional keyboard-shortcut hint. Pass a `$variable` as `value` for two-way binding. Use anywhere a user needs to filter content \u2014 toolbars, command bars, lists, headers.",
  props: [
    { name: "id", type: "string" },
    { name: "placeholder", type: "string", optional: true },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "shortcut", type: "string", optional: true, description: 'Keyboard hint chip on the right (e.g. "/")' },
    { name: "onSubmit", type: "callable", optional: true, aliases: ["action", "onClick"], description: "Optional submit callable; clicking the trailing button or pressing Enter invokes it" },
    { name: "submitLabel", type: "string", optional: true, description: 'Label for the trailing submit button (default "Search"). Omitted when no action is provided.' },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current query on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const root = el("form", { class: "rui-search-bar", role: "search" });
    root.onsubmit = (event) => {
      event.preventDefault();
      helpers.invoke(props.onSubmit);
    };
    const iconWrap = renderIcon("magnifying-glass", { className: "rui-search-bar-icon" }) ?? el("span", { class: "rui-search-bar-icon", "aria-hidden": "true" });
    root.append(iconWrap);
    const input = el("input", {
      class: "rui-search-bar-input",
      id: asString(props.id),
      name: asString(props.id),
      type: "search",
      placeholder: asString(props.placeholder, "Search\u2026"),
      value: asString(props.value),
      autocomplete: "off"
    });
    bindToStateAtArg(input, node, 2, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => n.value
    });
    root.append(input);
    const shortcut = asString(props.shortcut);
    if (shortcut) root.append(el("span", { class: "rui-search-bar-shortcut" }, [shortcut]));
    if (props.onSubmit != null) {
      const btn = el("button", {
        type: "submit",
        class: "rui-search-bar-submit"
      }, [asString(props.submitLabel, "Search")]);
      root.append(btn);
    }
    return root;
  }
};
var Form = {
  name: "Form",
  description: 'Form container. Children FormControls render in order; buttons render at the bottom. Provide `onSubmit` to handle form submission (invoked when the user presses Enter on a focused input or clicks a `type="submit"` Button inside the form).',
  props: [
    { name: "id", type: "string" },
    { name: "buttons", type: "Buttons | Button" },
    { name: "fields", type: "FormControl[]" },
    { name: "onSubmit", type: "callable", optional: true, aliases: ["onsubmit"], description: "Called when the form is submitted (Enter key or submit button)" }
  ],
  render: (_node, props, helpers) => {
    const form = el("form", { class: "rui-form", id: asString(props.id) });
    form.onsubmit = (event) => {
      event.preventDefault();
      helpers.invoke(props.onSubmit);
    };
    for (const field of asArray(props.fields)) form.append(helpers.renderNode(field));
    if (props.buttons) {
      const actions = el("div", { class: "rui-form-actions" });
      actions.append(helpers.renderNode(props.buttons));
      form.append(actions);
    }
    return form;
  }
};
var Slider = {
  name: "Slider",
  description: "Range slider for selecting a single numeric value between `min` and `max`. Pass a `$variable` as `value` for two-way binding. Useful for filters, settings (volume, brightness), and parameter tuning.",
  props: [
    { name: "id", type: "string" },
    { name: "min", type: "number", optional: true, description: "Default 0" },
    { name: "max", type: "number", optional: true, description: "Default 100" },
    { name: "step", type: "number", optional: true, description: "Default 1" },
    { name: "value", type: "number", optional: true, description: "Bound value (typically $variable)" },
    { name: "label", type: "string", optional: true },
    { name: "showValue", type: "boolean", optional: true, description: "Render the current numeric value beside the slider" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new number as the user drags" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const min = asNumber(props.min, 0);
    const max = asNumber(props.max, 100);
    const step = asNumber(props.step, 1);
    const value = asNumber(props.value, min);
    const root = el("div", { class: "rui-slider", "data-disabled": asBoolean(props.disabled) ? "true" : "false" });
    const label = asString(props.label);
    const showValue = asBoolean(props.showValue);
    if (label || showValue) {
      const head = el("div", { class: "rui-slider-head" });
      if (label) head.append(el("label", { class: "rui-slider-label", for: id }, [label]));
      if (showValue) head.append(el("span", { class: "rui-slider-value" }, [String(value)]));
      root.append(head);
    }
    const input = el("input", {
      type: "range",
      class: "rui-slider-input",
      id,
      name: id,
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
      disabled: asBoolean(props.disabled) ? "" : null
    });
    input.oninput = (event) => {
      const target = event.currentTarget;
      if (!target) return;
      const sliderRoot = target.closest(".rui-slider");
      const valueEl = sliderRoot?.querySelector(".rui-slider-value");
      if (valueEl) valueEl.textContent = target.value;
    };
    const stateName = node.argMeta?.[4]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => Number(n.value)
      });
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => Number(n.value)
    });
    root.append(input);
    return root;
  }
};
var NumberInput = {
  name: "NumberInput",
  description: 'Numeric input with paired increment/decrement buttons. Use for quantity steppers, integer settings, and any field where a `<input type="number">` plus +/- controls is friendlier than the native spinner. Pass a `$variable` as `value` for two-way binding.',
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "number", optional: true, description: "Bound value (typically $variable)" },
    { name: "min", type: "number", optional: true },
    { name: "max", type: "number", optional: true },
    { name: "step", type: "number", optional: true, description: "Default 1" },
    { name: "placeholder", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new number (or null when blank)" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const step = asNumber(props.step, 1);
    const hasMin = props.min !== void 0 && props.min !== null;
    const hasMax = props.max !== void 0 && props.max !== null;
    const min = hasMin ? asNumber(props.min, 0) : Number.NEGATIVE_INFINITY;
    const max = hasMax ? asNumber(props.max, 0) : Number.POSITIVE_INFINITY;
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-number-input", "data-disabled": disabled ? "true" : "false" });
    const decBtn = el("button", {
      type: "button",
      class: "rui-number-input-button",
      "data-direction": "down",
      "aria-label": "Decrement",
      disabled: disabled ? "" : null
    }, ["\u2212"]);
    const input = el("input", {
      type: "number",
      class: "rui-number-input-field",
      id,
      name: id,
      value: asString(props.value),
      placeholder: asString(props.placeholder),
      min: hasMin ? String(min) : null,
      max: hasMax ? String(max) : null,
      step: String(step),
      disabled: disabled ? "" : null
    });
    const incBtn = el("button", {
      type: "button",
      class: "rui-number-input-button",
      "data-direction": "up",
      "aria-label": "Increment",
      disabled: disabled ? "" : null
    }, ["+"]);
    const stateName = node.argMeta?.[1]?.stateRef;
    const readNumberValue = (n) => {
      const raw = n.value;
      if (raw === "") return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    };
    if (stateName) {
      helpers.bindState(input, stateName, { event: "input", getValue: readNumberValue });
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: readNumberValue
    });
    const adjust = (origin, delta) => {
      const liveRoot = origin.closest(".rui-number-input");
      const live = liveRoot?.querySelector(".rui-number-input-field");
      if (!live) return;
      const current = Number(live.value);
      const base = Number.isFinite(current) ? current : 0;
      const next = clampNumber(base + delta, min, max);
      live.value = String(next);
      live.dispatchEvent(new Event("input", { bubbles: true }));
    };
    decBtn.onclick = (event) => adjust(event.currentTarget ?? event.target, -step);
    incBtn.onclick = (event) => adjust(event.currentTarget ?? event.target, step);
    root.append(decBtn, input, incBtn);
    return root;
  }
};
var DatePicker = {
  name: "DatePicker",
  description: 'Date picker that wraps the native `<input type="date">` with consistent styling. Pass a `$variable` as `value` for two-way binding. Use `min`/`max` to bound the selectable range.',
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "ISO date (YYYY-MM-DD); typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true, description: "Earliest ISO date" },
    { name: "max", type: "string", optional: true, description: "Latest ISO date" },
    { name: "placeholder", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new ISO date string when the picker changes" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("div", { class: "rui-date-picker" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-date-picker-label", for: id }, [label]));
    const input = el("input", {
      type: "date",
      class: "rui-date-picker-input",
      id,
      name: id,
      value: asString(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      placeholder: asString(props.placeholder),
      disabled: asBoolean(props.disabled) ? "" : null
    });
    bindToStateAtArg(input, node, 1, helpers);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => n.value
    });
    root.append(input);
    return root;
  }
};
var FileUpload = {
  name: "FileUpload",
  description: 'Styled file picker. Renders a click/drop area with a leading icon, label, and helper text. Files cannot round-trip through `$variables` (they are not serialisable), so pass a callable as `action` to handle the picked files via `ctx.query("#id").files`.',
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string", optional: true, description: 'Primary label (default "Choose a file")' },
    { name: "hint", type: "string", optional: true, description: "Secondary helper text" },
    { name: "accept", type: "string", optional: true, description: "Comma-separated MIME types or extensions" },
    { name: "multiple", type: "boolean", optional: true },
    { name: "onSelect", type: "callable", optional: true, aliases: ["action", "onChange"], description: "Callable fired with the FileList when files are picked" },
    { name: "icon", type: "string", optional: true, description: 'Font Awesome icon (default "cloud-arrow-up")' },
    { name: "disabled", type: "boolean", optional: true }
  ],
  render: (_node, props, helpers) => {
    const id = asString(props.id);
    const disabled = asBoolean(props.disabled);
    const root = el("div", {
      class: "rui-file-upload",
      "data-disabled": disabled ? "true" : "false"
    });
    const dropZone = el("label", {
      class: "rui-file-upload-dropzone",
      for: id
    });
    const iconNode = renderIcon(asString(props.icon, "cloud-arrow-up"), { className: "rui-file-upload-icon" });
    if (iconNode) dropZone.append(iconNode);
    const text = el("div", { class: "rui-file-upload-text" });
    text.append(el("div", { class: "rui-file-upload-label" }, [asString(props.label, "Choose a file")]));
    const hint = asString(props.hint);
    if (hint) text.append(el("div", { class: "rui-file-upload-hint" }, [hint]));
    dropZone.append(text);
    const input = el("input", {
      type: "file",
      id,
      name: id,
      class: "rui-file-upload-input",
      accept: asString(props.accept) || null,
      multiple: asBoolean(props.multiple) ? "" : null,
      disabled: disabled ? "" : null
    });
    dropZone.append(input);
    root.append(dropZone);
    const isImageFile = (file, accept) => accept.includes("image") || file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name);
    input.onchange = (event) => {
      const fileInput = event.currentTarget;
      helpers.invoke(props.onSelect, fileInput.files);
      const uploadRoot = fileInput.closest(".rui-file-upload");
      if (!uploadRoot) return;
      const files = fileInput.files;
      const existing = uploadRoot.querySelector(".rui-file-upload-preview");
      if (existing) existing.remove();
      if (!files || files.length === 0) return;
      const accept = asString(props.accept);
      const preview = el("div", { class: "rui-file-upload-preview" });
      Array.from(files).forEach((file) => {
        const row = el("div", { class: "rui-file-upload-preview-item" });
        if (isImageFile(file, accept)) {
          const objectUrl = URL.createObjectURL(file);
          const img = el("img", {
            src: objectUrl,
            alt: file.name,
            class: "rui-file-upload-thumbnail"
          });
          img.onload = () => URL.revokeObjectURL(objectUrl);
          row.append(img);
        }
        row.append(el("span", { class: "rui-file-upload-filename" }, [file.name]));
        preview.append(row);
      });
      uploadRoot.append(preview);
    };
    return root;
  }
};
var Combobox = {
  name: "Combobox",
  description: "Searchable single-select dropdown \u2014 type to filter, click an option to choose. Use instead of `Select` when the list is long enough that scanning is faster than scrolling (countries, currencies, repos, users). Pass a `$variable` as `value` for two-way binding; the selected option's `value` is written to state on pick.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) or {value, label}" },
    { name: "value", type: "string", optional: true, description: "Bound selected value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "emptyLabel", type: "string", optional: true, description: 'Text shown when no items match the filter (default "No matches")' },
    { name: "disabled", type: "boolean", optional: true },
    { name: "open", type: "boolean", optional: true, description: "Initial open state \u2014 use to demo or pre-open the dropdown" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const items = extractComboboxItems(props.items);
    const currentValue = asString(props.value);
    const currentLabel = items.find((item) => item.value === currentValue)?.label ?? currentValue;
    const placeholder = asString(props.placeholder, "Select\u2026");
    const emptyLabel = asString(props.emptyLabel, "No matches");
    const disabled = asBoolean(props.disabled);
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState("open", initialOpen);
    const filterSlot = helpers.useInstanceState("filter", "");
    const isOpen = openSlot.get();
    const root = el("div", {
      class: "rui-combobox",
      "data-open": isOpen ? "true" : "false",
      "data-disabled": disabled ? "true" : "false"
    });
    const triggerBtn = el("button", {
      type: "button",
      class: "rui-combobox-trigger",
      id,
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen ? "true" : "false",
      disabled: disabled ? "" : null
    });
    triggerBtn.append(el("span", {
      class: "rui-combobox-value",
      "data-placeholder": currentLabel ? "false" : "true"
    }, [currentLabel || placeholder]));
    const chevron = renderIcon("chevron-down", { className: "rui-combobox-chevron" });
    if (chevron) triggerBtn.append(chevron);
    root.append(triggerBtn);
    const panel = el("div", { class: "rui-combobox-panel", role: "listbox" });
    const filterInput = el("input", {
      type: "text",
      class: "rui-combobox-filter",
      placeholder: "Filter\u2026",
      autocomplete: "off",
      value: filterSlot.get()
    });
    panel.append(filterInput);
    const list = el("div", { class: "rui-combobox-list" });
    panel.append(list);
    const renderList = (target, filter) => {
      target.replaceChildren();
      const lower = filter.trim().toLowerCase();
      const matches = lower === "" ? items : items.filter(
        (item) => item.label.toLowerCase().includes(lower) || item.value.toLowerCase().includes(lower)
      );
      if (matches.length === 0) {
        target.append(el("div", { class: "rui-combobox-empty" }, [emptyLabel]));
        return;
      }
      for (const item of matches) {
        const option = el("button", {
          type: "button",
          class: "rui-combobox-option",
          role: "option",
          "data-value": item.value,
          "aria-selected": item.value === currentValue ? "true" : "false"
        }, [item.label]);
        option.onclick = (event) => {
          event.stopPropagation();
          selectComboboxValue(event.currentTarget, item.value);
        };
        target.append(option);
      }
    };
    const selectComboboxValue = (origin, value) => {
      const stateName = node.argMeta?.[2]?.stateRef;
      if (stateName) {
        helpers.setState(stateName, value);
      }
      helpers.invoke(props.onChange, value);
      openSlot.set(false);
      filterSlot.set("");
      const live = origin.closest(".rui-combobox");
      live?.setAttribute("data-open", "false");
      live?.querySelector(".rui-combobox-trigger")?.setAttribute("aria-expanded", "false");
      disposeDismissListeners(live);
    };
    renderList(list, filterSlot.get());
    filterInput.oninput = (event) => {
      const target = event.currentTarget;
      filterSlot.set(target.value);
      const liveList = target.closest(".rui-combobox-panel")?.querySelector(".rui-combobox-list");
      if (liveList) renderList(liveList, target.value);
    };
    filterInput.onkeydown = (event) => {
      const e = event;
      if (e.key !== "Enter") return;
      e.preventDefault();
      const target = e.currentTarget;
      const live = target.closest(".rui-combobox");
      const firstOption = live?.querySelector(
        ".rui-combobox-option[data-value]"
      );
      const value = firstOption?.getAttribute("data-value");
      if (value !== null && value !== void 0 && firstOption) {
        selectComboboxValue(firstOption, value);
      }
    };
    triggerBtn.onclick = (event) => {
      if (disabled) return;
      event.stopPropagation();
      const next = !openSlot.get();
      openSlot.set(next);
      const live = event.currentTarget.closest(".rui-combobox");
      live?.setAttribute("data-open", next ? "true" : "false");
      live?.querySelector(".rui-combobox-trigger")?.setAttribute("aria-expanded", next ? "true" : "false");
      if (!live) return;
      if (!next) {
        disposeDismissListeners(live);
        return;
      }
      setTimeout(() => filterInput.focus(), 0);
      installDismissListeners({
        liveRoot: live,
        onDismiss: () => {
          openSlot.set(false);
          filterSlot.set("");
          live.setAttribute("data-open", "false");
          live.querySelector(".rui-combobox-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
    };
    root.append(panel);
    return root;
  }
};
var MultiSelect = {
  name: "MultiSelect",
  description: "Multi-option searchable dropdown. Type to filter, click an option to add/remove it from the bound array. Renders the selected options as removable chips inside the trigger. Pass a `$variable` (array of values) as `value` for two-way binding.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "SelectItem[]", description: "Options; SelectItem(value, label) or {value, label}" },
    { name: "value", type: "any[]", optional: true, description: "Bound array of selected values (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no items match the filter" },
    { name: "max", type: "number", optional: true, description: "Maximum number of selections" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "open", type: "boolean", optional: true, description: "Initial open state \u2014 use to demo or pre-open the dropdown" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated array of selected values" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const items = extractComboboxItems(props.items);
    const placeholder = asString(props.placeholder, "Select\u2026");
    const emptyLabel = asString(props.emptyLabel, "No matches");
    const disabled = asBoolean(props.disabled);
    const max = Math.max(0, Math.floor(Number(props.max ?? 0)));
    const selected = Array.isArray(props.value) ? props.value.map((v) => asString(v)).filter(Boolean) : [];
    const selectedSet = new Set(selected);
    const stateName = node.argMeta?.[2]?.stateRef;
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState("open", initialOpen);
    const filterSlot = helpers.useInstanceState("filter", "");
    const isOpen = openSlot.get();
    const root = el("div", {
      class: "rui-multiselect",
      "data-open": isOpen ? "true" : "false",
      "data-disabled": disabled ? "true" : "false"
    });
    const triggerBtn = el("button", {
      type: "button",
      class: "rui-multiselect-trigger",
      id,
      "aria-haspopup": "listbox",
      "aria-expanded": isOpen ? "true" : "false",
      disabled: disabled ? "" : null
    });
    const chipRow = el("span", { class: "rui-multiselect-chips" });
    const writeSelection = (next) => {
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
    };
    if (selected.length === 0) {
      chipRow.append(el("span", { class: "rui-multiselect-placeholder" }, [placeholder]));
    } else {
      for (const value of selected) {
        const label = items.find((item) => item.value === value)?.label ?? value;
        const chip = el("span", { class: "rui-multiselect-chip", "data-value": value });
        chip.append(el("span", { class: "rui-multiselect-chip-label" }, [label]));
        const removeBtn = el("button", {
          type: "button",
          class: "rui-multiselect-chip-remove",
          "aria-label": `Remove ${label}`
        }, ["\xD7"]);
        removeBtn.onclick = (event) => {
          event.stopPropagation();
          const next = selected.filter((v) => v !== value);
          writeSelection(next);
        };
        chip.append(removeBtn);
        chipRow.append(chip);
      }
    }
    triggerBtn.append(chipRow);
    const chevron = renderIcon("chevron-down", { className: "rui-multiselect-chevron" });
    if (chevron) triggerBtn.append(chevron);
    root.append(triggerBtn);
    const panel = el("div", { class: "rui-multiselect-panel", role: "listbox", "aria-multiselectable": "true" });
    const filterInput = el("input", {
      type: "text",
      class: "rui-multiselect-filter",
      placeholder: "Filter\u2026",
      autocomplete: "off",
      value: filterSlot.get()
    });
    panel.append(filterInput);
    const list = el("div", { class: "rui-multiselect-list" });
    panel.append(list);
    const renderList = (target, filter) => {
      target.replaceChildren();
      const lower = filter.trim().toLowerCase();
      const matches = lower === "" ? items : items.filter(
        (item) => item.label.toLowerCase().includes(lower) || item.value.toLowerCase().includes(lower)
      );
      if (matches.length === 0) {
        target.append(el("div", { class: "rui-multiselect-empty" }, [emptyLabel]));
        return;
      }
      for (const item of matches) {
        const isSelected = selectedSet.has(item.value);
        const atCap = !isSelected && max > 0 && selected.length >= max;
        const option = el("button", {
          type: "button",
          class: "rui-multiselect-option",
          role: "option",
          "data-value": item.value,
          "data-selected": isSelected ? "true" : "false",
          "aria-selected": isSelected ? "true" : "false",
          disabled: atCap ? "" : null
        });
        const checkbox = el("span", { class: "rui-multiselect-option-check" });
        const checkIcon = renderIcon(isSelected ? "check" : "", { className: "rui-multiselect-option-check-icon" });
        if (checkIcon) checkbox.append(checkIcon);
        option.append(checkbox);
        option.append(el("span", { class: "rui-multiselect-option-label" }, [item.label]));
        option.onclick = (event) => {
          event.stopPropagation();
          if (atCap) return;
          const next = isSelected ? selected.filter((v) => v !== item.value) : [...selected, item.value];
          writeSelection(next);
        };
        target.append(option);
      }
    };
    renderList(list, filterSlot.get());
    filterInput.oninput = (event) => {
      const target = event.currentTarget;
      filterSlot.set(target.value);
      const liveList = target.closest(".rui-multiselect-panel")?.querySelector(".rui-multiselect-list");
      if (liveList) renderList(liveList, target.value);
    };
    triggerBtn.onclick = (event) => {
      if (disabled) return;
      event.stopPropagation();
      const next = !openSlot.get();
      openSlot.set(next);
      const live = event.currentTarget.closest(".rui-multiselect");
      live?.setAttribute("data-open", next ? "true" : "false");
      live?.querySelector(".rui-multiselect-trigger")?.setAttribute("aria-expanded", next ? "true" : "false");
      if (!live) return;
      if (!next) {
        disposeDismissListeners(live);
        return;
      }
      setTimeout(() => filterInput.focus(), 0);
      installDismissListeners({
        liveRoot: live,
        onDismiss: () => {
          openSlot.set(false);
          filterSlot.set("");
          live.setAttribute("data-open", "false");
          live.querySelector(".rui-multiselect-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
    };
    root.append(panel);
    return root;
  }
};
var DateRangePicker = {
  name: "DateRangePicker",
  description: "Paired date inputs with a single label, sharing the same min/max range. Pass `$variable` references for both `from` and `to` to two-way-bind a date range (ISO `YYYY-MM-DD` strings).",
  props: [
    { name: "id", type: "string" },
    { name: "from", type: "string", optional: true, description: "ISO date start; typically $variable" },
    { name: "to", type: "string", optional: true, description: "ISO date end; typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true, description: "Earliest selectable ISO date" },
    { name: "max", type: "string", optional: true, description: "Latest selectable ISO date" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with `{from, to}` whenever either endpoint changes" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const fromId = `${id}-from`;
    const toId = `${id}-to`;
    const min = asString(props.min);
    const max = asString(props.max);
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-date-range-picker", "data-disabled": disabled ? "true" : "false" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-date-range-picker-label", for: fromId }, [label]));
    const row = el("div", { class: "rui-date-range-picker-row" });
    const fromInput = el("input", {
      type: "date",
      class: "rui-date-range-picker-input",
      id: fromId,
      name: fromId,
      value: asString(props.from),
      min: min || null,
      max: max || null,
      disabled: disabled ? "" : null,
      "data-role": "from"
    });
    row.append(fromInput);
    row.append(el("span", { class: "rui-date-range-picker-separator", "aria-hidden": "true" }, ["\u2013"]));
    const toInput = el("input", {
      type: "date",
      class: "rui-date-range-picker-input",
      id: toId,
      name: toId,
      value: asString(props.to),
      min: min || null,
      max: max || null,
      disabled: disabled ? "" : null,
      "data-role": "to"
    });
    row.append(toInput);
    root.append(row);
    const fromState = node.argMeta?.[1]?.stateRef;
    const toState = node.argMeta?.[2]?.stateRef;
    if (fromState) helpers.bindState(fromInput, fromState);
    if (toState) helpers.bindState(toInput, toState);
    if (props.onChange != null) {
      const readRange = (target) => {
        const wrapper = target.closest(".rui-date-range-picker");
        const from = wrapper?.querySelector('.rui-date-range-picker-input[data-role="from"]')?.value ?? "";
        const to = wrapper?.querySelector('.rui-date-range-picker-input[data-role="to"]')?.value ?? "";
        return { from, to };
      };
      fromInput.addEventListener("change", (e) => helpers.invoke(props.onChange, readRange(e.currentTarget)));
      toInput.addEventListener("change", (e) => helpers.invoke(props.onChange, readRange(e.currentTarget)));
    }
    return root;
  }
};
function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min === Number.NEGATIVE_INFINITY ? 0 : min;
  return Math.min(Math.max(value, min), max);
}
function renderSearchableSelect(node, props, helpers) {
  const meta = node.argMeta ? [...node.argMeta] : [];
  while (meta.length < 5) meta.push({});
  if (meta[4]?.stateRef) meta[2] = meta[4];
  const root = Combobox.render(
    { ...node, argMeta: meta },
    {
      id: props.id,
      items: props.items,
      value: props.value,
      placeholder: props.placeholder,
      emptyLabel: "No matches",
      disabled: false
    },
    helpers
  );
  root.classList.add("rui-select-searchable");
  return root;
}
function bindToStateAtArg(element, node, argIndex, helpers) {
  const stateName = node.argMeta?.[argIndex]?.stateRef;
  if (!stateName) return;
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    helpers.bindState(element, stateName, {
      event: "change",
      getValue: (n) => n.checked
    });
    return;
  }
  helpers.bindState(element, stateName);
}
function applyValidations(input, validations) {
  if (!validations) return;
  const list = Array.isArray(validations) ? validations.map((v) => String(v)) : typeof validations === "object" ? Object.entries(validations).map(([k, v]) => v ? `${k}:${v}` : k) : [];
  for (const v of list) {
    if (v === "required") input.required = true;
    else if (v.startsWith("minLength:")) input.minLength = Number(v.slice("minLength:".length)) || 0;
    else if (v.startsWith("maxLength:")) input.maxLength = Number(v.slice("maxLength:".length)) || 0;
    else if (v === "email") input.type = "email";
  }
}

// ../../src/library/components/patterns.ts
var SURFACE_TONES = ["default", "primary", "success", "warning", "danger", "info"];
var renderActionsRow = (raw, helpers) => {
  const items = asArray(raw);
  if (items.length === 0) return null;
  const row = el("div", { class: "rui-pattern-actions" });
  for (const item of items) row.append(helpers.renderNode(item));
  return row;
};
var HERO_EYEBROW_RULES = [
  { match: /\bbeta\b/i, label: "Beta" },
  { match: /\b(early\s?access|preview)\b/i, label: "Preview" },
  { match: /\b(introduc(?:ing|e)|launch(?:ed|ing)?|announcing)\b/i, label: "Introducing" },
  { match: /\b(welcome\b|get(?:ting)?\s?started)/i, label: "Welcome" },
  { match: /\b(new\b|whats\s?new|now\b)/i, label: "What's new" },
  { match: /\bfree\b/i, label: "Free trial" },
  { match: /\bupgrade\b/i, label: "Upgrade" },
  { match: /\b(sale|discount|deal)\b/i, label: "Limited time" }
];
function deriveHeroEyebrow(title, subtitle) {
  const haystack = `${title} ${subtitle}`.trim();
  if (!haystack) return "";
  for (const rule of HERO_EYEBROW_RULES) {
    if (rule.match.test(haystack)) return rule.label;
  }
  return "";
}
var Hero = {
  name: "Hero",
  description: 'Eye-catching landing/marketing header with eyebrow tag, title, subtitle, optional bullet highlights, and primary/secondary CTA buttons. Use `layout="cover"` with `imageSrc` for an image-backed hero band (pass `height` and optional `caption`). Default layout shows an optional side illustration.',
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
    { name: "primary", type: "Button", optional: true, description: "Primary CTA \u2014 pass a Button(...)" },
    { name: "secondary", type: "Button", optional: true, description: "Secondary CTA \u2014 pass a Button(...)" },
    { name: "eyebrow", type: "string", optional: true, description: "Short uppercase tag above the title" },
    { name: "highlights", type: "string[]", optional: true, description: "Bullet items rendered as tag pills" },
    { name: "imageSrc", type: "string", optional: true, description: "Illustration or cover background when layout=cover" },
    { name: "caption", type: "string", optional: true, description: "Small caption above CTAs (cover layout)" },
    { name: "height", type: "string", optional: true, description: "Min-height for cover layout (default 280px)" },
    { name: "actions", type: "Node[]", optional: true, description: "CTA row (cover layout; alternative to primary/secondary)" },
    { name: "layout", type: "string", optional: true, enum: ["default", "cover"], description: "default = text-first; cover = image-backed band" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES, description: "Accent tone" }
  ],
  render: (_node, props, helpers) => {
    const layout = asString(props.layout, "default");
    const heroTitle = asString(props.title);
    const heroSubtitle = asString(props.subtitle);
    const explicitEyebrow = asString(props.eyebrow);
    const eyebrow = explicitEyebrow || deriveHeroEyebrow(heroTitle, heroSubtitle);
    const tone = asString(props.tone, "primary");
    if (layout === "cover") {
      const safeImageSrc = sanitiseCssUrl(asString(props.imageSrc));
      const safeHeight = sanitiseCssLength(asString(props.height), "280px");
      const root2 = el("section", {
        class: "rui-cover",
        "data-tone": tone,
        style: `background-image:linear-gradient(180deg, rgba(15, 23, 42, 0.05) 0%, rgba(15, 23, 42, 0.62) 100%), url("${safeImageSrc}");min-height:${safeHeight};`
      });
      const body2 = el("div", { class: "rui-cover-body" });
      if (eyebrow) body2.append(el("span", { class: "rui-cover-eyebrow" }, [eyebrow]));
      body2.append(el("h1", { class: "rui-cover-title" }, [heroTitle]));
      if (heroSubtitle) body2.append(el("p", { class: "rui-cover-subtitle" }, [heroSubtitle]));
      const caption = asString(props.caption);
      if (caption) body2.append(el("p", { class: "rui-cover-caption" }, [caption]));
      const actions = renderActionsRow(props.actions, helpers);
      if (actions) {
        actions.classList.add("rui-cover-actions");
        body2.append(actions);
      } else {
        const ctaItems2 = [props.primary, props.secondary].filter(Boolean);
        if (ctaItems2.length > 0) {
          const ctas = el("div", { class: "rui-cover-actions rui-pattern-actions" });
          for (const cta of ctaItems2) ctas.append(helpers.renderNode(cta));
          body2.append(ctas);
        }
      }
      root2.append(body2);
      return root2;
    }
    const heroImageSrc = sanitiseImageSrc(props.imageSrc);
    const root = el("section", {
      class: "rui-hero",
      "data-tone": tone,
      "data-has-image": heroImageSrc ? "true" : "false"
    });
    const body = el("div", { class: "rui-hero-body" });
    if (eyebrow) body.append(el("span", { class: "rui-hero-eyebrow" }, [eyebrow]));
    body.append(el("h1", { class: "rui-hero-title" }, [heroTitle]));
    if (heroSubtitle) body.append(el("p", { class: "rui-hero-subtitle" }, [heroSubtitle]));
    const highlights = asArray(props.highlights);
    if (highlights.length > 0) {
      const tags = el("div", { class: "rui-hero-highlights" });
      for (const h of highlights) {
        const label = asString(h);
        if (label) tags.append(el("span", { class: "rui-hero-highlight" }, [label]));
      }
      body.append(tags);
    }
    const ctaItems = [props.primary, props.secondary].filter(Boolean);
    if (ctaItems.length > 0) {
      const ctas = el("div", { class: "rui-hero-ctas" });
      for (const cta of ctaItems) ctas.append(helpers.renderNode(cta));
      body.append(ctas);
    }
    root.append(body);
    if (heroImageSrc) {
      const media = el("div", { class: "rui-hero-media" });
      media.append(el("img", { src: heroImageSrc, alt: "", loading: "lazy" }));
      root.append(media);
    }
    return root;
  }
};
var PageHeader = {
  name: "PageHeader",
  description: 'Page-level header with breadcrumbs, title, subtitle, status tag, and a right-aligned actions row. The canonical first child for any dashboard, settings, or detail page \u2014 replaces ad-hoc Stack+Header+Buttons stitching. If `breadcrumbs` is omitted the component auto-derives `["Home", title]` so the page never lacks a trail. Pass `breadcrumbs=false` to opt out.',
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true },
    { name: "breadcrumbs", type: "string[] | Breadcrumb | false", optional: true, description: "Array of strings, a Breadcrumb(...) node, or `false` to suppress the auto-derived trail" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / NavLinks shown on the right" },
    { name: "status", type: "Badge", optional: true, aliases: ["badge"], description: "Optional Badge(...) rendered next to the title" }
  ],
  render: (_node, props, helpers) => {
    const root = el("header", { class: "rui-page-header" });
    const title = asString(props.title);
    let crumbs = props.breadcrumbs;
    if (crumbs === void 0 || crumbs === null) {
      if (title) crumbs = ["Home", title];
    } else if (crumbs === false || crumbs === "false") {
      crumbs = null;
    }
    if (crumbs) {
      const crumbWrap = el("div", { class: "rui-page-header-breadcrumbs" });
      if (Array.isArray(crumbs)) {
        crumbs.forEach((c, i) => {
          if (i > 0) crumbWrap.append(el("span", { class: "rui-page-header-crumb-sep" }, ["/"]));
          crumbWrap.append(el("span", { class: "rui-page-header-crumb" }, [asString(c)]));
        });
      } else {
        crumbWrap.append(helpers.renderNode(crumbs));
      }
      root.append(crumbWrap);
    }
    const titleRow = el("div", { class: "rui-page-header-title-row" });
    const titleBlock = el("div", { class: "rui-page-header-title-block" });
    const titleLine = el("div", { class: "rui-page-header-title-line" });
    titleLine.append(el("h1", { class: "rui-page-header-title" }, [title]));
    if (props.status) titleLine.append(helpers.renderNode(props.status));
    titleBlock.append(titleLine);
    const subtitle = asString(props.subtitle);
    if (subtitle) titleBlock.append(el("p", { class: "rui-page-header-subtitle" }, [subtitle]));
    titleRow.append(titleBlock);
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-page-header-actions");
      titleRow.append(actions);
    }
    root.append(titleRow);
    return root;
  }
};
var EmptyState = {
  name: "EmptyState",
  description: "Zero-state placeholder for empty lists, searches, dashboards. Renders a centered icon (or illustration), title, description, and either a single `action` Button or an `actions` row (primary + secondary). Always preferable to an empty Card with raw text.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: 'Font Awesome icon name (defaults to "inbox")' },
    { name: "illustration", type: "string", optional: true, description: "Image URL \u2014 takes precedence over `icon` when provided" },
    { name: "action", type: "Button", optional: true, description: "Single CTA (legacy slot)" },
    { name: "actions", type: "Node[]", optional: true, description: "Row of CTA Buttons / Links \u2014 preferred over `action` for primary + secondary affordances" }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-empty-state" });
    const illustration = sanitiseImageSrc(props.illustration);
    if (illustration) {
      root.append(el("img", {
        class: "rui-empty-state-illustration",
        src: illustration,
        alt: "",
        loading: "lazy"
      }));
    } else {
      const title = asString(props.title);
      const description = asString(props.description);
      const iconName = asString(props.icon) || pickIconForLabel(`${title} ${description}`) || "inbox";
      const iconNode = renderIcon(iconName, { className: "rui-empty-state-icon" });
      if (iconNode) root.append(iconNode);
    }
    root.append(el("h3", { class: "rui-empty-state-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-empty-state-description" }, [desc]));
    const actions = asArray(props.actions);
    if (actions.length > 0) {
      const row = el("div", { class: "rui-empty-state-actions" });
      for (const item of actions) row.append(helpers.renderNode(item));
      root.append(row);
    } else if (props.action) {
      const wrap = el("div", { class: "rui-empty-state-action" });
      wrap.append(helpers.renderNode(props.action));
      root.append(wrap);
    }
    return root;
  }
};
var TimelineItem = {
  name: "TimelineItem",
  description: "Single event on a Timeline.",
  props: [
    { name: "title", type: "string" },
    { name: "time", type: "string", optional: true, description: "Display label (ISO, relative, etc.)" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name rendered inside the marker" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES }
  ],
  render: (_node, props) => {
    const li = el("li", {
      class: "rui-timeline-item",
      "data-tone": asString(props.tone, "default")
    });
    const marker = el("span", { class: "rui-timeline-marker" });
    const iconNode = renderIcon(props.icon);
    if (iconNode) marker.append(iconNode);
    li.append(marker);
    const body = el("div", { class: "rui-timeline-body" });
    const head = el("div", { class: "rui-timeline-head" });
    head.append(el("span", { class: "rui-timeline-title" }, [asString(props.title)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-timeline-time" }, [time]));
    body.append(head);
    const desc = asString(props.description);
    if (desc) body.append(el("div", { class: "rui-timeline-description" }, [desc]));
    li.append(body);
    return li;
  }
};
var Timeline = {
  name: "Timeline",
  description: "Vertical event timeline. Children must be TimelineItem entries. Ideal for activity feeds, changelogs, and process flows.",
  props: [{ name: "items", type: "TimelineItem[]" }],
  render: (_node, props, helpers) => {
    const root = el("ol", { class: "rui-timeline" });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  }
};
var FeatureItem = {
  name: "FeatureItem",
  description: "Single tile on a FeatureGrid.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES }
  ],
  render: (_node, props) => {
    const root = el("div", {
      class: "rui-feature-item",
      "data-tone": asString(props.tone, "primary")
    });
    const iconName = asString(props.icon, "sparkles");
    const iconNode = renderIcon(iconName, { className: "rui-feature-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("h3", { class: "rui-feature-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-feature-description" }, [desc]));
    return root;
  }
};
var FeatureGrid = {
  name: "FeatureGrid",
  description: "Responsive grid of FeatureItem tiles (typically 2\u20133 columns). Use to highlight product capabilities or page categories.",
  props: [
    { name: "items", type: "FeatureItem[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default auto)" }
  ],
  render: (_node, props, helpers) => {
    const columns = Math.max(1, Math.min(4, Number(props.columns ?? "auto")));
    const root = el("div", {
      class: "rui-feature-grid",
      "data-columns": columns > 0 ? String(columns) : null
    });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  }
};
var Testimonial = {
  name: "Testimonial",
  description: "Quote card with author, role, and optional avatar.",
  props: [
    { name: "quote", type: "string" },
    { name: "author", type: "string", aliases: ["name"] },
    { name: "role", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "rating", type: "number", optional: true, description: "0\u20135 stars" }
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-testimonial" });
    const rating = Math.max(0, Math.min(5, Math.round(Number(props.rating ?? 0))));
    if (rating > 0) {
      const stars = el("div", { class: "rui-testimonial-rating" });
      for (let i = 0; i < 5; i += 1) {
        const filled = i < rating;
        const icon = renderIcon(filled ? "star" : "regular:star", { className: "rui-testimonial-rating-star" });
        if (icon) stars.append(icon);
      }
      root.append(stars);
    }
    root.append(el("blockquote", { class: "rui-testimonial-quote" }, [
      asString(props.quote)
    ]));
    const footer = el("figcaption", { class: "rui-testimonial-author" });
    const avatarSrc = sanitiseImageSrc(props.avatarSrc);
    if (avatarSrc) {
      footer.append(el("img", { class: "rui-testimonial-avatar", src: avatarSrc, alt: "" }));
    }
    const meta = el("div", { class: "rui-testimonial-meta" });
    meta.append(el("div", { class: "rui-testimonial-name" }, [asString(props.author)]));
    const role = asString(props.role);
    if (role) meta.append(el("div", { class: "rui-testimonial-role" }, [role]));
    footer.append(meta);
    root.append(footer);
    return root;
  }
};
var ProfileCard = {
  name: "ProfileCard",
  description: "Compact profile/user card with avatar, name, role, optional bio, social tags, and a row of action buttons. Use for team rosters, contributor lists, and contact panels.",
  props: [
    { name: "name", type: "string" },
    { name: "role", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"], description: "Avatar image src; falls back to initials" },
    { name: "bio", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons to render at the bottom" }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-profile-card" });
    const header = el("div", { class: "rui-profile-card-header" });
    header.append(renderAvatar(asString(props.avatarSrc), asString(props.name), "lg"));
    const meta = el("div", { class: "rui-profile-card-meta" });
    meta.append(el("h3", { class: "rui-profile-card-name" }, [asString(props.name)]));
    const role = asString(props.role);
    if (role) meta.append(el("p", { class: "rui-profile-card-role" }, [role]));
    header.append(meta);
    root.append(header);
    const bio = asString(props.bio);
    if (bio) root.append(el("p", { class: "rui-profile-card-bio" }, [bio]));
    const tags = asArray(props.tags);
    if (tags.length > 0) {
      const tagRow = el("div", { class: "rui-profile-card-tags" });
      for (const t of tags) {
        const label = asString(t);
        if (label) tagRow.append(el("span", { class: "rui-tag", "data-size": "sm" }, [
          el("span", { class: "rui-tag-label" }, [label])
        ]));
      }
      root.append(tagRow);
    }
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-profile-card-actions");
      root.append(actions);
    }
    return root;
  }
};
var Comment = {
  name: "Comment",
  description: "Single comment / message bubble. Renders avatar, author, timestamp, body, and an optional row of toolbar buttons (reply, like, \u2026).",
  props: [
    { name: "author", type: "string" },
    { name: "body", type: "string", aliases: ["text", "message"] },
    { name: "time", type: "string", optional: true, description: "Relative or absolute timestamp" },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "actions", type: "Node[]", optional: true }
  ],
  render: (_node, props, helpers) => {
    const root = el("article", { class: "rui-comment" });
    root.append(renderAvatar(asString(props.avatarSrc), asString(props.author), "md"));
    const body = el("div", { class: "rui-comment-body" });
    const head = el("header", { class: "rui-comment-header" });
    head.append(el("span", { class: "rui-comment-author" }, [asString(props.author)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-comment-time" }, [time]));
    body.append(head);
    body.append(el("div", { class: "rui-comment-content" }, [asString(props.body)]));
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-comment-actions");
      body.append(actions);
    }
    root.append(body);
    return root;
  }
};
var Banner = {
  name: "Banner",
  description: "Full-width announcement banner. Use at the top of a page for promos, release notes, or downtime notices. For inline notices prefer Callout or Alert.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true, aliases: ["description"] },
    { name: "action", type: "Button", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES }
  ],
  render: (_node, props, helpers) => {
    const tone = asString(props.tone, "primary");
    const root = el("aside", {
      class: "rui-banner",
      "data-tone": tone
    });
    const iconName = asString(props.icon) || pickIconForTone(tone) || "";
    const iconNode = renderIcon(iconName, { className: "rui-banner-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-banner-body" });
    body.append(el("strong", { class: "rui-banner-title" }, [asString(props.title)]));
    const msg = asString(props.message);
    if (msg) body.append(el("span", { class: "rui-banner-message" }, [msg]));
    root.append(body);
    if (props.action) {
      const wrap = el("div", { class: "rui-banner-action" });
      wrap.append(helpers.renderNode(props.action));
      root.append(wrap);
    }
    return root;
  }
};
var KanbanCard = {
  name: "KanbanCard",
  description: "Single card on a Kanban board.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true },
    { name: "assignee", type: "string", optional: true, description: "Name shown next to avatar initials" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name shown beside the title" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Optional callable fired when the card is clicked" }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", {
      class: "rui-kanban-card",
      "data-tone": asString(props.tone, "default")
    });
    if (typeof props.onClick === "function") {
      root.setAttribute("role", "button");
      root.setAttribute("tabindex", "0");
      root.onclick = () => helpers.invoke(props.onClick);
      root.onkeydown = (event) => {
        const e = event;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          helpers.invoke(props.onClick);
        }
      };
    }
    const titleEl = el("div", { class: "rui-kanban-card-title" });
    const iconNode = renderIcon(props.icon, { className: "rui-kanban-card-icon" });
    if (iconNode) titleEl.append(iconNode);
    titleEl.append(document.createTextNode(asString(props.title)));
    root.append(titleEl);
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-kanban-card-description" }, [desc]));
    const tags = asArray(props.tags);
    if (tags.length > 0) {
      const tagRow = el("div", { class: "rui-kanban-card-tags" });
      for (const t of tags) {
        const label = asString(t);
        if (label) tagRow.append(el("span", { class: "rui-tag", "data-size": "sm" }, [
          el("span", { class: "rui-tag-label" }, [label])
        ]));
      }
      root.append(tagRow);
    }
    const assignee = asString(props.assignee);
    if (assignee) {
      const footer = el("footer", { class: "rui-kanban-card-footer" });
      footer.append(renderAvatar("", assignee, "sm"));
      footer.append(el("span", { class: "rui-kanban-card-assignee" }, [assignee]));
      root.append(footer);
    }
    return root;
  }
};
var KanbanColumn = {
  name: "KanbanColumn",
  description: "Single column inside a KanbanBoard. Children must be KanbanCard entries.",
  props: [
    { name: "title", type: "string" },
    { name: "items", type: "KanbanCard[]", aliases: ["cards"] },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES, description: "Header accent tone" }
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const root = el("section", {
      class: "rui-kanban-column",
      "data-tone": asString(props.tone, "default")
    });
    const header = el("header", { class: "rui-kanban-column-header" });
    header.append(el("span", { class: "rui-kanban-column-title" }, [asString(props.title)]));
    header.append(el("span", { class: "rui-kanban-column-count" }, [String(items.length)]));
    root.append(header);
    const body = el("div", { class: "rui-kanban-column-body" });
    for (const item of items) body.append(helpers.renderNode(item));
    if (items.length === 0) {
      body.append(el("div", { class: "rui-kanban-column-empty" }, ["No items"]));
    }
    root.append(body);
    return root;
  }
};
var KanbanBoard = {
  name: "KanbanBoard",
  description: "Horizontal Kanban board. Children must be KanbanColumn entries. The board scrolls horizontally on narrow viewports so columns stay readable.",
  props: [{ name: "columns", type: "KanbanColumn[]" }],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-kanban-board" });
    for (const column of asArray(props.columns)) root.append(helpers.renderNode(column));
    return root;
  }
};
var SectionHeader = {
  name: "SectionHeader",
  description: "Compact section header for the top of a Card or panel. Renders a small eyebrow, a title, an optional subtitle, an optional status Tag/Badge, and a right-aligned actions row. Use this inside a Card to introduce a section instead of a bare `CardHeader`.",
  props: [
    { name: "title", type: "string" },
    { name: "subtitle", type: "string", optional: true, aliases: ["description"] },
    { name: "eyebrow", type: "string", optional: true, description: "Short uppercase label above the title" },
    { name: "status", type: "Badge | Tag", optional: true, aliases: ["badge"] },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / Links shown on the right" }
  ],
  render: (_node, props, helpers) => {
    const root = el("header", { class: "rui-section-header" });
    const left = el("div", { class: "rui-section-header-left" });
    const eyebrow = asString(props.eyebrow);
    if (eyebrow) left.append(el("span", { class: "rui-section-header-eyebrow" }, [eyebrow]));
    const titleLine = el("div", { class: "rui-section-header-title-line" });
    titleLine.append(el("h3", { class: "rui-section-header-title" }, [asString(props.title)]));
    if (props.status) titleLine.append(helpers.renderNode(props.status));
    left.append(titleLine);
    const subtitle = asString(props.subtitle);
    if (subtitle) left.append(el("p", { class: "rui-section-header-subtitle" }, [subtitle]));
    root.append(left);
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-section-header-actions");
      root.append(actions);
    }
    return root;
  }
};
var Toolbar = {
  name: "Toolbar",
  description: "Horizontal toolbar for filters, search, view modes, and primary actions. Left/center/right slots wrap onto separate rows on narrow viewports so the bar never overflows. Pass `searchable: true` to auto-mount a SearchBar in the left slot (bind `searchValue` to a `$variable`). Use ABOVE a Table, List, Grid, or Kanban view \u2014 never replace `PageHeader` with it.",
  props: [
    { name: "left", type: "Node[]", optional: true, description: "Filters / search inputs / chips" },
    { name: "right", type: "Node[]", optional: true, description: "Primary action buttons" },
    { name: "center", type: "Node[]", optional: true, description: "Centered controls (e.g. SegmentedControl, search bar)" },
    { name: "searchable", type: "boolean", optional: true, description: "Auto-mount a SearchBar at the start of the left slot" },
    { name: "searchPlaceholder", type: "string", optional: true, description: "Placeholder for the auto-mounted SearchBar" },
    { name: "searchValue", type: "string", optional: true, description: "$variable bound to the auto-mounted SearchBar" }
  ],
  render: (_node, props, helpers) => {
    const center = asArray(props.center);
    const root = el("div", {
      class: "rui-toolbar",
      "data-has-center": center.length > 0 ? "true" : "false"
    });
    const left = el("div", { class: "rui-toolbar-side rui-toolbar-left" });
    if (asBoolean(props.searchable)) {
      left.append(SearchBar.render(
        { __kind: "Component", name: "SearchBar", args: [], argMeta: [] },
        {
          id: "toolbar-search",
          placeholder: asString(props.searchPlaceholder, "Search\u2026"),
          value: props.searchValue
        },
        helpers
      ));
    }
    for (const child of asArray(props.left)) left.append(helpers.renderNode(child));
    root.append(left);
    if (center.length > 0) {
      const centerWrap = el("div", { class: "rui-toolbar-side rui-toolbar-center" });
      for (const child of center) centerWrap.append(helpers.renderNode(child));
      root.append(centerWrap);
    }
    const right = el("div", { class: "rui-toolbar-side rui-toolbar-right" });
    for (const child of asArray(props.right)) right.append(helpers.renderNode(child));
    root.append(right);
    return root;
  }
};
var SidebarItem = {
  name: "SidebarItem",
  description: "Single navigation item inside a Sidebar. Pass `active=true` to mark as the current page, a `to` path to navigate via the runtime router on click, an `onClick` callable for arbitrary click handling, or an optional `badge` (string/number) for a trailing chip. `to` and `onClick` can coexist \u2014 `onClick` is invoked AFTER the router navigates so authors can do extra work (analytics, side-effects).",
  props: [
    { name: "label", type: "string" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name rendered before the label" },
    { name: "active", type: "boolean", optional: true, description: "Mark this item as the current page. When `to` is provided and `active` is omitted, the item auto-detects the active state from the current router path." },
    { name: "badge", type: "string", optional: true, description: "Trailing chip (count or status)" },
    { name: "to", type: "string", optional: true, description: 'Router path to navigate to on click (e.g. "/", "/orders"). Uses the runtime router \u2014 no full page reload.' },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable invoked on click. Runs in addition to `to`-based navigation." }
  ],
  render: (_node, props, helpers) => {
    const to = asString(props.to);
    const explicitActive = props.active !== void 0 && props.active !== null;
    const currentPath = to ? helpers.router.getPath() : "";
    const autoActive = (() => {
      if (!to) return false;
      if (to === "/") return currentPath === "/";
      if (currentPath === to) return true;
      return currentPath.startsWith(to + "/");
    })();
    const isActive = explicitActive ? asBoolean(props.active) : autoActive;
    const root = el("button", {
      type: "button",
      class: "rui-sidebar-item",
      "data-active": isActive ? "true" : "false",
      "data-to": to || null
    });
    const iconNode = renderIcon(props.icon, { className: "rui-sidebar-item-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("span", { class: "rui-sidebar-item-label" }, [asString(props.label)]));
    const badge = asString(props.badge);
    if (badge) root.append(el("span", { class: "rui-sidebar-item-badge" }, [badge]));
    if (to || props.onClick != null) {
      root.onclick = (event) => {
        if (to) {
          const e = event;
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          helpers.router.navigate(to);
        }
        if (props.onClick != null) helpers.invoke(props.onClick);
      };
    }
    return root;
  }
};
var SidebarSection = {
  name: "SidebarSection",
  description: "Grouping inside a Sidebar \u2014 small uppercase label followed by SidebarItem entries. Use this to chunk a long sidebar into sections.",
  props: [
    { name: "label", type: "string" },
    { name: "items", type: "SidebarItem[]" }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-sidebar-section" });
    const label = asString(props.label);
    if (label) root.append(el("div", { class: "rui-sidebar-section-label" }, [label]));
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  }
};
var Sidebar = {
  name: "Sidebar",
  description: "Vertical app navigation panel. Supports a brand header, navigation items (`SidebarItem` or `SidebarSection`), an optional footer, and a `collapsed` mode that hides labels to leave just an icon rail. Use inside `AppShell` for SaaS-style left navigation.",
  props: [
    { name: "items", type: "(SidebarItem | SidebarSection)[]" },
    { name: "brand", type: "string", optional: true, description: "Product name / workspace label at the top" },
    { name: "tagline", type: "string", optional: true },
    { name: "footer", type: "Node[]", optional: true, description: "Footer block (Avatar + name, upgrade CTA, \u2026)" },
    { name: "collapsed", type: "boolean", optional: true, description: "Render as an icon-only rail (hides labels/badges)" }
  ],
  render: (_node, props, helpers) => {
    const collapsed = asBoolean(props.collapsed);
    const root = el("aside", { class: "rui-sidebar" });
    if (collapsed) root.dataset.collapsed = "true";
    const brand = asString(props.brand);
    const tagline = asString(props.tagline);
    if (brand || tagline) {
      const header = el("div", { class: "rui-sidebar-header" });
      if (brand) header.append(el("div", { class: "rui-sidebar-brand" }, [brand]));
      if (tagline) header.append(el("div", { class: "rui-sidebar-tagline" }, [tagline]));
      root.append(header);
    }
    const body = el("nav", { class: "rui-sidebar-body" });
    for (const item of asArray(props.items)) body.append(helpers.renderNode(item));
    root.append(body);
    const footerItems = asArray(props.footer);
    if (footerItems.length > 0) {
      const footer = el("div", { class: "rui-sidebar-footer" });
      for (const item of footerItems) footer.append(helpers.renderNode(item));
      root.append(footer);
    }
    return root;
  }
};
var AppShell = {
  name: "AppShell",
  description: "Canonical SaaS application shell: optional top bar, fixed left Sidebar, and scrollable main content. Reach for this whenever a response represents a full product surface (dashboard with nav, settings + sections, admin panels). Pass `collapsible=true` to render a hamburger that turns the sidebar into a slide-over drawer on narrow viewports.",
  props: [
    { name: "sidebar", type: "Sidebar", description: "Pass a Sidebar(...) node" },
    { name: "content", type: "Node[]", description: "Main content (typically starts with a PageHeader)" },
    { name: "topbar", type: "Node[]", optional: true, description: "Optional thin top bar above the content" },
    { name: "collapsible", type: "boolean", optional: true, description: "Show a hamburger that toggles the sidebar drawer on mobile" },
    { name: "sidebarOpen", type: "boolean", optional: true, description: "$variable controlling whether the mobile drawer is open" }
  ],
  render: (_node, props, helpers) => {
    const collapsible = asBoolean(props.collapsible);
    const sidebarOpen = asBoolean(props.sidebarOpen);
    const root = el("div", { class: "rui-app-shell" });
    if (collapsible) root.dataset.collapsible = "true";
    if (sidebarOpen) root.dataset.sidebarOpen = "true";
    const sidebarHost = el("div", { class: "rui-app-shell-sidebar" });
    sidebarHost.append(helpers.renderNode(props.sidebar));
    root.append(sidebarHost);
    if (collapsible) {
      const scrim = el("div", { class: "rui-app-shell-scrim", "aria-hidden": "true" });
      scrim.addEventListener("click", () => {
        delete root.dataset.sidebarOpen;
      });
      root.append(scrim);
    }
    const main = el("div", { class: "rui-app-shell-main" });
    const topbar = asArray(props.topbar);
    if (topbar.length > 0 || collapsible) {
      const bar = el("div", { class: "rui-app-shell-topbar" });
      if (collapsible) {
        const toggle = el("button", {
          class: "rui-app-shell-toggle",
          type: "button",
          "aria-label": "Toggle navigation"
        });
        toggle.append(renderIcon("bars", { size: "md" }) ?? document.createTextNode("\u2261"));
        toggle.addEventListener("click", () => {
          if (root.dataset.sidebarOpen) delete root.dataset.sidebarOpen;
          else root.dataset.sidebarOpen = "true";
        });
        bar.append(toggle);
      }
      for (const item of topbar) bar.append(helpers.renderNode(item));
      main.append(bar);
    }
    const content = el("div", { class: "rui-app-shell-content" });
    for (const child of asArray(props.content)) content.append(helpers.renderNode(child));
    main.append(content);
    root.append(main);
    return root;
  }
};
var SplitView = {
  name: "SplitView",
  description: "Two-pane master/detail layout \u2014 a narrow primary pane on the left, wider detail pane on the right. Collapses to a single column on narrow viewports. Use for inboxes, file browsers, contact lists.",
  props: [
    { name: "primary", type: "Node[]", description: "Master pane content (list, filters)" },
    { name: "detail", type: "Node[]", aliases: ["secondary"], description: "Detail pane content (selected item, empty state)" },
    { name: "primaryWidth", type: "string", optional: true, aliases: ["splitAt"], description: "CSS width for the primary pane (default 320px)" }
  ],
  render: (_node, props, helpers) => {
    const width = sanitiseCssLength(asString(props.primaryWidth), "320px");
    const root = el("div", { class: "rui-split-view", style: `--rui-split-primary:${width}` });
    const primary = el("div", { class: "rui-split-view-primary" });
    for (const child of asArray(props.primary)) primary.append(helpers.renderNode(child));
    const detail = el("div", { class: "rui-split-view-detail" });
    for (const child of asArray(props.detail)) detail.append(helpers.renderNode(child));
    root.append(primary, detail);
    return root;
  }
};
var DescriptionItem = {
  name: "DescriptionItem",
  description: "Single row inside a DescriptionList. Renders a small uppercase label on the left and a value (string or arbitrary Node) on the right.",
  props: [
    { name: "label", type: "string" },
    { name: "value", type: "Node | string" },
    { name: "icon", type: "string", optional: true }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-description-item" });
    const labelWrap = el("dt", { class: "rui-description-label" });
    const iconNode = renderIcon(props.icon, { className: "rui-description-icon" });
    if (iconNode) labelWrap.append(iconNode);
    labelWrap.append(document.createTextNode(asString(props.label)));
    const value = el("dd", { class: "rui-description-value" });
    if (props.value && typeof props.value === "object" && props.value.__kind === "Component") {
      value.append(helpers.renderNode(props.value));
    } else {
      value.append(document.createTextNode(asString(props.value)));
    }
    root.append(labelWrap, value);
    return root;
  }
};
var DescriptionList = {
  name: "DescriptionList",
  description: "Compact key/value summary for detail pages \u2014 replaces a row of `Text`s with a properly aligned `<dl>`. Children must be DescriptionItem entries. Two columns by default on wide viewports.",
  props: [
    { name: "items", type: "DescriptionItem[]" },
    { name: "columns", type: "number", optional: true, description: "1 or 2 (default 2)" }
  ],
  render: (_node, props, helpers) => {
    const columns = Math.max(1, Math.min(2, Math.floor(Number(props.columns ?? 2))));
    const root = el("dl", {
      class: "rui-description-list",
      "data-columns": String(columns)
    });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  }
};
var StatusDot = {
  name: "StatusDot",
  description: "Inline status pip + label. Use for compact health/state indicators in toolbars, sidebars, lists, and table cells.",
  props: [
    { name: "label", type: "string" },
    { name: "tone", type: "string", optional: true, enum: ["default", "primary", "success", "warning", "danger", "info"] },
    { name: "pulse", type: "boolean", optional: true, description: "Animate the dot for 'live' state" }
  ],
  render: (_node, props) => {
    const root = el("span", {
      class: "rui-status-dot",
      "data-tone": asString(props.tone, "success"),
      "data-pulse": asBoolean(props.pulse) ? "true" : "false"
    });
    root.append(el("span", { class: "rui-status-dot-marker" }));
    root.append(el("span", { class: "rui-status-dot-label" }, [asString(props.label)]));
    return root;
  }
};
var PricingCard = {
  name: "PricingCard",
  description: "Single pricing tier card with plan name, price, billing period, description, bullet features, and a CTA button. Mark one tier as `featured=true` to highlight it (raises the card, adds a ribbon).",
  props: [
    { name: "plan", type: "string", description: "Tier name (e.g. 'Pro')" },
    { name: "price", type: "string", description: "Display price (e.g. '$29')" },
    { name: "period", type: "string", optional: true, description: "Billing period (e.g. '/mo')" },
    { name: "description", type: "string", optional: true },
    { name: "features", type: "string[]", optional: true, description: "Bullet list of included features" },
    { name: "action", type: "Button", optional: true, aliases: ["cta"], description: "Primary CTA \u2014 pass a Button(...)" },
    { name: "badge", type: "string", optional: true, description: "Eyebrow / badge above the plan name" },
    { name: "featured", type: "boolean", optional: true, aliases: ["highlighted"] }
  ],
  render: (_node, props, helpers) => {
    const featured = asBoolean(props.featured);
    const root = el("article", {
      class: "rui-pricing-card",
      "data-featured": featured ? "true" : "false"
    });
    const badge = asString(props.badge);
    if (badge) root.append(el("div", { class: "rui-pricing-card-badge" }, [badge]));
    root.append(el("h3", { class: "rui-pricing-card-plan" }, [asString(props.plan)]));
    const description = asString(props.description);
    if (description) root.append(el("p", { class: "rui-pricing-card-description" }, [description]));
    const priceRow = el("div", { class: "rui-pricing-card-price-row" });
    priceRow.append(el("span", { class: "rui-pricing-card-price" }, [asString(props.price)]));
    const period = asString(props.period);
    if (period) priceRow.append(el("span", { class: "rui-pricing-card-period" }, [period]));
    root.append(priceRow);
    const features = asArray(props.features);
    if (features.length > 0) {
      const list = el("ul", { class: "rui-pricing-card-features" });
      for (const f of features) {
        const label = asString(f);
        if (!label) continue;
        const check = renderIcon("circle-check", { className: "rui-pricing-card-check" }) ?? el("span", { class: "rui-pricing-card-check" });
        list.append(el("li", { class: "rui-pricing-card-feature" }, [
          check,
          document.createTextNode(label)
        ]));
      }
      root.append(list);
    }
    if (props.action) {
      const wrap = el("div", { class: "rui-pricing-card-action" });
      wrap.append(helpers.renderNode(props.action));
      root.append(wrap);
    }
    return root;
  }
};
var PricingTable = {
  name: "PricingTable",
  description: "Responsive grid of PricingCard tiers. Items size uniformly across a row and wrap onto multiple rows on narrow viewports. Use as the centerpiece of any pricing or upgrade page.",
  props: [
    { name: "tiers", type: "PricingCard[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default auto)" }
  ],
  render: (_node, props, helpers) => {
    const columns = Math.max(1, Math.min(4, Math.floor(Number(props.columns ?? "auto"))));
    const root = el("div", {
      class: "rui-pricing-table",
      "data-columns": columns > 0 ? String(columns) : null
    });
    for (const tier of asArray(props.tiers)) root.append(helpers.renderNode(tier));
    return root;
  }
};
var MediaCard = {
  name: "MediaCard",
  description: 'Card with a media (image) header followed by title, body, optional tags, footer meta, and an actions row. Use for article previews, product cards, project highlights, gallery items \u2014 anywhere a Card needs a leading image. Orient with `orientation="horizontal"` for side-by-side media + content on wide viewports.',
  props: [
    { name: "title", type: "string" },
    { name: "imageSrc", type: "string", optional: true, aliases: ["src", "image"], description: "Image URL (omit to render a neutral placeholder)" },
    { name: "description", type: "string", optional: true },
    { name: "tags", type: "string[]", optional: true, description: "Tag pill labels" },
    { name: "meta", type: "string", optional: true, description: "Footer meta line (author \xB7 date \xB7 category)" },
    { name: "actions", type: "Node[]", optional: true, description: "Buttons / Links rendered at the bottom" },
    { name: "badge", type: "string | Badge", optional: true, description: "Eyebrow string or Badge node shown over the image" },
    { name: "orientation", type: "string", optional: true, enum: ["vertical", "horizontal"] },
    { name: "ratio", type: "string", optional: true, description: "Media aspect ratio (default 16:9 vertical, 4:3 horizontal)" }
  ],
  render: (_node, props, helpers) => {
    const orientation = asString(props.orientation, "vertical");
    const root = el("article", {
      class: "rui-media-card",
      "data-orientation": orientation
    });
    const ratio = parseMediaRatio(asString(props.ratio, orientation === "horizontal" ? "4:3" : "16:9"));
    const media = el("div", {
      class: "rui-media-card-media",
      style: `aspect-ratio:${ratio};`
    });
    const imageSrc = sanitiseImageSrc(props.imageSrc);
    if (imageSrc) {
      media.append(el("img", { src: imageSrc, alt: asString(props.title), loading: "lazy" }));
    } else {
      media.classList.add("rui-media-card-media-empty");
      const placeholder = renderIcon("image", { className: "rui-media-card-placeholder" }) ?? el("span", { class: "rui-media-card-placeholder" });
      media.append(placeholder);
    }
    if (props.badge) {
      const badgeWrap = el("span", { class: "rui-media-card-badge" });
      if (typeof props.badge === "string") {
        badgeWrap.append(document.createTextNode(asString(props.badge)));
      } else {
        badgeWrap.append(helpers.renderNode(props.badge));
      }
      media.append(badgeWrap);
    }
    root.append(media);
    const body = el("div", { class: "rui-media-card-body" });
    body.append(el("h3", { class: "rui-media-card-title" }, [asString(props.title)]));
    const description = asString(props.description);
    if (description) body.append(el("p", { class: "rui-media-card-description" }, [description]));
    const tags = asArray(props.tags);
    if (tags.length > 0) {
      const row = el("div", { class: "rui-media-card-tags" });
      for (const t of tags) {
        const label = asString(t);
        if (label) row.append(el("span", { class: "rui-tag", "data-size": "sm" }, [
          el("span", { class: "rui-tag-label" }, [label])
        ]));
      }
      body.append(row);
    }
    const meta = asString(props.meta);
    if (meta) body.append(el("p", { class: "rui-media-card-meta" }, [meta]));
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-media-card-actions");
      body.append(actions);
    }
    root.append(body);
    return root;
  }
};
function parseMediaRatio(input) {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}
function renderInlineSparkline(values, tone = "primary") {
  const width = 80;
  const height = 24;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "rui-sparkline");
  svg.setAttribute("data-tone", tone);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");
  if (values.length < 2) return svg;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, i) => {
    const x = i * step;
    const y = 2 + (max - value) / range * (height - 4);
    return [x, y];
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const area = document.createElementNS(svgNS, "path");
  area.setAttribute("d", areaPath);
  area.setAttribute("class", "rui-sparkline-area");
  svg.appendChild(area);
  const line = document.createElementNS(svgNS, "path");
  line.setAttribute("d", linePath);
  line.setAttribute("class", "rui-sparkline-line");
  line.setAttribute("fill", "none");
  svg.appendChild(line);
  return svg;
}
var Stats = {
  name: "Stats",
  description: 'KPI strip or grid. Pass `items` as `{label, value, hint?, tone?, spark?}` objects for strip layout, or as `StatCard(...)` nodes when `layout="grid"`.',
  props: [
    { name: "items", type: "object[] | StatCard[]", description: "Stat objects or StatCard nodes when layout=grid" },
    { name: "layout", type: "string", optional: true, enum: ["strip", "grid"], description: "strip = horizontal row; grid = responsive Grid" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count for grid layout (1\u20136)" },
    { name: "align", type: "string", optional: true, enum: ["start", "center", "end"], description: "Strip alignment (layout=strip only)" }
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const hasComponentItems = items.some(
      (item) => item && typeof item === "object" && item.__kind === "Component"
    );
    const layout = asString(
      props.layout,
      hasComponentItems ? "grid" : "strip"
    );
    if (layout === "grid") {
      const columns = props.columns ? Math.max(1, Math.min(6, Math.floor(asNumber(props.columns)))) : 0;
      const gridNode = Grid.render(
        { __kind: "Component", name: "Grid", args: [], argMeta: [] },
        {
          children: items,
          columns: columns > 0 ? columns : "auto",
          gap: "m"
        },
        helpers
      );
      gridNode.classList.add("rui-metric-grid");
      return gridNode;
    }
    const align = asString(props.align, "start");
    const root = el("div", { class: "rui-stats", "data-align": align });
    for (const raw of items) {
      const item = raw ?? {};
      const tone = asString(item.tone, "default");
      const block = el("div", { class: "rui-stats-item", "data-tone": tone });
      block.append(el("div", { class: "rui-stats-label" }, [asString(item.label)]));
      const valueRow = el("div", { class: "rui-stats-value-row" });
      valueRow.append(el("div", { class: "rui-stats-value" }, [asString(item.value)]));
      const sparkValues = asArray(item.spark).map((v) => Number(v)).filter((n) => Number.isFinite(n));
      if (sparkValues.length > 1) {
        valueRow.append(renderInlineSparkline(sparkValues, tone));
      }
      block.append(valueRow);
      const hint = asString(item.hint);
      if (hint) block.append(el("div", { class: "rui-stats-hint" }, [hint]));
      root.append(block);
    }
    return root;
  }
};
var Tile = {
  name: "Tile",
  description: "Compact icon + label + optional value tile. Smaller and denser than `StatCard`, ideal for menu grids, quick-action panels, category directories, and category filters. Pair with `Grid` for uniform rows.",
  props: [
    { name: "label", type: "string" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "value", type: "string", optional: true, description: "Secondary value rendered next to/under the label" },
    { name: "description", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] }
  ],
  render: (_node, props, helpers) => {
    const isClickable = typeof props.onClick === "function";
    const tag = isClickable ? "button" : "div";
    const root = el(tag, {
      type: isClickable ? "button" : null,
      class: "rui-tile",
      "data-tone": asString(props.tone, "default")
    });
    const iconNode = renderIcon(props.icon, { className: "rui-tile-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-tile-body" });
    body.append(el("div", { class: "rui-tile-label" }, [asString(props.label)]));
    const value = asString(props.value);
    if (value) body.append(el("div", { class: "rui-tile-value" }, [value]));
    const description = asString(props.description);
    if (description) body.append(el("div", { class: "rui-tile-description" }, [description]));
    root.append(body);
    if (isClickable) {
      root.onclick = () => helpers.invoke(props.onClick);
    }
    return root;
  }
};
var Notification = {
  name: "Notification",
  description: "Inline notification card with title, message, time, optional avatar, and dismiss/action buttons. Use inside notification panels, inboxes, or activity drawers \u2014 for top-of-page announcements prefer `Banner`.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true, aliases: ["description"] },
    { name: "time", type: "string", optional: true, description: "Relative or absolute timestamp" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a colored disc" },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"], description: "Avatar URL (alternative to `icon`)" },
    { name: "tone", type: "string", optional: true, enum: SURFACE_TONES },
    { name: "unread", type: "boolean", optional: true, description: "Highlights the card with an accent" },
    { name: "actions", type: "Node[]", optional: true }
  ],
  render: (_node, props, helpers) => {
    const isUnread = asBoolean(props.unread);
    const root = el("article", {
      class: "rui-notification",
      "data-tone": asString(props.tone, "default"),
      "data-unread": isUnread ? "true" : "false"
    });
    const avatarSrc = asString(props.avatarSrc);
    const visual = el("div", { class: "rui-notification-visual" });
    if (avatarSrc) {
      visual.append(renderAvatar(avatarSrc, asString(props.title), "md"));
    } else {
      const iconNode = renderIcon(asString(props.icon, "bell"), { className: "rui-notification-icon" });
      if (iconNode) visual.append(iconNode);
    }
    root.append(visual);
    const body = el("div", { class: "rui-notification-body" });
    const head = el("header", { class: "rui-notification-head" });
    const titleWrap = el("span", { class: "rui-notification-title-wrap" });
    if (isUnread) {
      titleWrap.append(el("span", { class: "rui-notification-unread-dot", "aria-label": "Unread" }));
    }
    titleWrap.append(el("span", { class: "rui-notification-title" }, [asString(props.title)]));
    head.append(titleWrap);
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-notification-time" }, [time]));
    body.append(head);
    const message = asString(props.message);
    if (message) body.append(el("p", { class: "rui-notification-message" }, [message]));
    const actions = renderActionsRow(props.actions, helpers);
    if (actions) {
      actions.classList.add("rui-notification-actions");
      body.append(actions);
    }
    root.append(body);
    return root;
  }
};
var PersonChip = {
  name: "PersonChip",
  description: 'Inline avatar + name + optional role/meta pill. Use anywhere a person needs to be referenced compactly: table cells, list rows, comments, kanban cards, sidebar footers. Pair multiple chips with `Stack(direction="row", wrap=true)` for assignee lists.',
  props: [
    { name: "name", type: "string" },
    { name: "role", type: "string", optional: true, description: "Sub-line below the name (role, email, handle, \u2026)" },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "status", type: "string", optional: true, enum: ["online", "offline", "busy", "away"] },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] }
  ],
  render: (_node, props, helpers) => {
    const isClickable = typeof props.onClick === "function";
    const tag = isClickable ? "button" : "div";
    const size = asString(props.size, "md");
    const avatarSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";
    const root = el(tag, {
      type: isClickable ? "button" : null,
      class: "rui-person-chip",
      "data-size": size
    });
    const avatarWrap = el("span", { class: "rui-person-chip-avatar" });
    avatarWrap.append(renderAvatar(asString(props.avatarSrc), asString(props.name), avatarSize));
    const status = asString(props.status);
    if (status) avatarWrap.append(el("span", { class: "rui-person-chip-status", "data-status": status }));
    root.append(avatarWrap);
    const meta = el("div", { class: "rui-person-chip-meta" });
    meta.append(el("span", { class: "rui-person-chip-name" }, [asString(props.name)]));
    const role = asString(props.role);
    if (role) meta.append(el("span", { class: "rui-person-chip-role" }, [role]));
    root.append(meta);
    if (isClickable) {
      root.onclick = () => helpers.invoke(props.onClick);
    }
    return root;
  }
};

// ../../src/library/components/data.ts
var COL_ALIGN = ["left", "center", "right"];
var Col = {
  name: "Col",
  description: 'Single column inside a Table or DataGrid. Use `align` for per-column text alignment, `format` for cell rendering (`text|number|currency|date`). `values` may be plain values OR an array of component nodes \u2014 e.g. `Col("Status", rows.map(r => Badge(r.status)))` or `Col("Actions", rows.map(r => Button("Edit")))` \u2014 each component renders directly in its cell. Pass `render: (value, index) => \u2026` for the same effect when you prefer to keep `values` as the raw row data (return a component, string, or array). Pass `onClick: (value, index) => \u2026` to make the whole cell clickable (pointer + keyboard). `sortable` and `filterable` only take effect inside `DataGrid` (Table ignores them).',
  props: [
    { name: "header", type: "string" },
    { name: "values", type: "any[]", description: "Column values. Plain values are formatted as text; component nodes (e.g. `rows.map(r => Badge(r.status))`) render directly. You can also pass the full row array and map each cell with `render`." },
    { name: "format", type: "string", optional: true, enum: ["text", "number", "currency", "date"] },
    { name: "align", type: "string", optional: true, enum: COL_ALIGN, description: "Per-column horizontal alignment" },
    { name: "sortable", type: "boolean", optional: true, description: "DataGrid: enable click-to-sort on this column" },
    { name: "filterable", type: "boolean", optional: true, description: "DataGrid: enable a per-column filter chip" },
    { name: "render", type: "callable", optional: true, aliases: ["cell"], description: "`(value, index) => Component | string | array` \u2014 map each cell to arbitrary content (buttons, badges, links)." },
    { name: "onClick", type: "callable", optional: true, aliases: ["onclick", "cellClick"], description: "`(value, index) => void` \u2014 fired when a cell in this column is clicked or activated via keyboard." }
  ],
  // Cols are read positionally inside Table.render — this render is a fallback.
  render: (_node, props) => {
    const wrapper = el("div", { class: "rui-col" });
    wrapper.append(el("strong", {}, [asString(props.header)]));
    return wrapper;
  }
};
var TABLE_DENSITY = ["comfortable", "compact"];
var Table = {
  name: "Table",
  description: 'Tabular data view. Children must be Col components. `density="compact"` tightens row padding for dense data, `striped=true` zebra-stripes the rows, and `sticky=true` pins the header row when the table scrolls. The empty-state row uses `emptyLabel` when set.',
  props: [
    { name: "columns", type: "Col[]" },
    { name: "caption", type: "string", optional: true, aliases: ["title"] },
    { name: "density", type: "string", optional: true, enum: TABLE_DENSITY, description: "Row padding (default `comfortable`)" },
    { name: "striped", type: "boolean", optional: true, description: "Zebra-stripe alternating rows" },
    { name: "sticky", type: "boolean", optional: true, description: "Pin the header row when the table scrolls" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when the table has no rows (default `No data`)" }
  ],
  render: (_node, props, helpers) => {
    const cols = asArray(props.columns);
    const density = asString(props.density, "comfortable");
    const striped = asBoolean(props.striped);
    const sticky = asBoolean(props.sticky);
    const wrapper = el("div", {
      class: "rui-table-wrapper",
      "data-density": density,
      "data-striped": striped ? "true" : "false",
      "data-sticky": sticky ? "true" : "false"
    });
    const table = el("table", { class: "rui-table" });
    const caption = asString(props.caption);
    if (caption) table.append(el("caption", { class: "rui-table-caption" }, [caption]));
    const aligns = cols.map((col) => {
      const align = asString(col.args?.[3], "");
      return COL_ALIGN.includes(align) ? align : "";
    });
    const thead = el("thead");
    const headRow = el("tr");
    for (let c = 0; c < cols.length; c += 1) {
      const col = cols[c];
      const th = el("th", {
        "data-align": aligns[c] || null
      }, [asString(col.args?.[0])]);
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);
    const tbody = el("tbody");
    const columnValues = cols.map((col) => asArray(col.args?.[1]));
    const formats = cols.map((col) => asString(col.args?.[2], "text"));
    const renders = cols.map((col) => col.args?.[6]);
    const clicks = cols.map((col) => col.args?.[7]);
    const rowCount = Math.max(0, ...columnValues.map((c) => c.length));
    for (let r = 0; r < rowCount; r += 1) {
      const tr = el("tr");
      columnValues.forEach((values, c) => {
        const format = formats[c] ?? "text";
        const align = aligns[c];
        const td = el("td", { "data-format": format, "data-align": align || null });
        fillTableCell(
          td,
          { format, render: renders[c], onClick: clicks[c] },
          values[r],
          r,
          helpers,
          formatCell
        );
        tr.append(td);
      });
      tbody.append(tr);
    }
    if (rowCount === 0) {
      const emptyRow = el("tr");
      const emptyLabel = asString(props.emptyLabel, "No data");
      emptyRow.append(el("td", {
        colspan: String(cols.length || 1),
        class: "rui-table-empty"
      }, [emptyLabel]));
      tbody.append(emptyRow);
    }
    table.append(tbody);
    wrapper.append(table);
    return wrapper;
  }
};
var ListItem = {
  name: "ListItem",
  description: "Single list item with optional title and description.",
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true, aliases: ["meta"] },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name" }
  ],
  render: (_node, props) => {
    const li = el("li", { class: "rui-list-item" });
    const iconNode = renderIcon(props.icon, { className: "rui-list-icon" });
    if (iconNode) li.append(iconNode);
    const text = el("div", { class: "rui-list-text" });
    text.append(el("div", { class: "rui-list-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) text.append(el("div", { class: "rui-list-description" }, [desc]));
    li.append(text);
    return li;
  }
};
var List = {
  name: "List",
  description: "Vertical list of ListItems.",
  props: [
    { name: "items", type: "ListItem[]" },
    { name: "ordered", type: "boolean", optional: true }
  ],
  render: (_node, props, helpers) => {
    const tag = asBoolean(props.ordered) ? "ol" : "ul";
    const root = el(tag, { class: "rui-list" });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  }
};
var StatCard = {
  name: "StatCard",
  description: "Single KPI card with label, value, optional delta, optional icon, and optional inline sparkline (`spark=[\u2026numbers]`). Use inside `Stats` for a uniform KPI strip.",
  props: [
    { name: "label", type: "string" },
    { name: "value", type: "string" },
    { name: "trend", type: "string", optional: true, enum: ["up", "down", "flat"] },
    { name: "delta", type: "string", optional: true, description: "Change vs previous period" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown in a chip beside the label" },
    { name: "spark", type: "number[]", optional: true, description: "Optional inline sparkline values" },
    { name: "tone", type: "string", optional: true, enum: ["default", "primary", "success", "warning", "danger", "info"] }
  ],
  render: (_node, props) => {
    const tone = asString(props.tone, "default");
    const root = el("div", { class: "rui-stat-card", "data-tone": tone });
    const labelRow = el("div", { class: "rui-stat-label-row" });
    const label = asString(props.label);
    const iconName = asString(props.icon) || pickIconForLabel(label) || "";
    const iconNode = renderIcon(iconName, { className: "rui-stat-icon" });
    if (iconNode) labelRow.append(iconNode);
    labelRow.append(el("div", { class: "rui-stat-label" }, [label]));
    root.append(labelRow);
    root.append(el("div", { class: "rui-stat-value" }, [asString(props.value)]));
    const delta = asString(props.delta);
    const trend = asString(props.trend);
    if (delta || trend) {
      root.append(el("div", { class: "rui-stat-trend", "data-trend": trend || "flat" }, [delta || trendArrow(trend)]));
    }
    const spark = asArray(props.spark).map((v) => asNumber(v));
    if (spark.length > 1) {
      const sparkWrap = el("div", { class: "rui-stat-spark" });
      sparkWrap.append(renderInlineSparkline(spark, tone === "default" ? "primary" : tone));
      root.append(sparkWrap);
    }
    return root;
  }
};
var Sparkline = {
  name: "Sparkline",
  description: "Tiny inline trend chart for KPIs, table cells, and dashboards. Renders an SVG line with a soft fill \u2014 use anywhere you would otherwise reach for `LineChart` but a single value series should stay inline with surrounding text.",
  props: [
    { name: "values", type: "number[]" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] }
  ],
  render: (_node, props) => {
    const tone = asString(props.tone, "primary");
    const values = asArray(props.values).map((v) => asNumber(v));
    const wrap = el("span", { class: "rui-sparkline-wrap" });
    wrap.append(renderInlineSparkline(values, tone));
    return wrap;
  }
};
var TreeNode = {
  name: "TreeNode",
  description: "Single node in a Tree view. When `children` is provided the node renders as an expandable branch with a chevron; otherwise it renders as a leaf. `onClick` fires on click. Use `active=true` to highlight the current selection.",
  props: [
    { name: "label", type: "string" },
    { name: "children", type: "TreeNode[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon shown before the label" },
    { name: "expanded", type: "boolean", optional: true, description: "Whether the branch is open by default" },
    { name: "active", type: "boolean", optional: true, aliases: ["selected"], description: "Highlights the row as the current selection" },
    { name: "badge", type: "string", optional: true, description: "Trailing chip (count or status)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable fired when the row is clicked" }
  ],
  render: (_node, props, helpers) => {
    const children = asArray(props.children);
    const hasChildren = children.length > 0;
    const expanded = asBoolean(props.expanded);
    const active = asBoolean(props.active);
    const isClickable = typeof props.onClick === "function";
    const row = el(isClickable ? "button" : "div", {
      type: isClickable ? "button" : null,
      class: "rui-tree-node-row",
      role: "treeitem",
      "data-active": active ? "true" : "false",
      "aria-expanded": hasChildren ? expanded ? "true" : "false" : null
    });
    if (hasChildren) {
      const chevron = renderIcon("chevron-right", { className: "rui-tree-node-chevron" });
      if (chevron) row.append(chevron);
    } else {
      row.append(el("span", { class: "rui-tree-node-chevron-spacer", "aria-hidden": "true" }));
    }
    const iconNode = renderIcon(props.icon, { className: "rui-tree-node-icon" });
    if (iconNode) row.append(iconNode);
    row.append(el("span", { class: "rui-tree-node-label" }, [asString(props.label)]));
    const badge = asString(props.badge);
    if (badge) row.append(el("span", { class: "rui-tree-node-badge" }, [badge]));
    if (isClickable) {
      row.onclick = () => helpers.invoke(props.onClick);
    }
    if (!hasChildren) return row;
    const details = el("details", { class: "rui-tree-node" });
    if (expanded) details.setAttribute("open", "");
    const summary = el("summary", { class: "rui-tree-node-summary" });
    summary.append(row);
    if (isClickable) {
      summary.onclick = (event) => {
        const target = event.target;
        if (target?.closest(".rui-tree-node-chevron")) return;
        event.preventDefault();
      };
    }
    details.append(summary);
    const childList = el("div", { class: "rui-tree-node-children", role: "group" });
    for (const child of children) childList.append(helpers.renderNode(child));
    details.append(childList);
    return details;
  }
};
var Tree = {
  name: "Tree",
  description: "Hierarchical tree view. Children must be TreeNode entries. Use for file browsers, nested navigation, category pickers, and any parent/child structure with arbitrary depth.",
  props: [{ name: "items", type: "TreeNode[]" }],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-tree", role: "tree" });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  }
};
function trendArrow(trend) {
  if (trend === "up") return "\u25B2";
  if (trend === "down") return "\u25BC";
  return "\u2014";
}
function formatCell(value, format) {
  if (value === null || value === void 0) return "";
  switch (format) {
    case "number":
      return typeof value === "number" ? value.toLocaleString() : asString(value);
    case "currency":
      return typeof value === "number" ? value.toLocaleString(void 0, { style: "currency", currency: "USD" }) : asString(value);
    case "date":
      try {
        const d = new Date(asString(value));
        return Number.isNaN(d.getTime()) ? asString(value) : d.toLocaleDateString();
      } catch {
        return asString(value);
      }
    default:
      return asString(value);
  }
}

// ../../src/library/components/charts.ts
var PALETTE = [
  "var(--rui-chart-1, #6366f1)",
  "var(--rui-chart-2, #10b981)",
  "var(--rui-chart-3, #f59e0b)",
  "var(--rui-chart-4, #ef4444)",
  "var(--rui-chart-5, #06b6d4)",
  "var(--rui-chart-6, #8b5cf6)"
];
var colorAt = (index) => PALETTE[index % PALETTE.length] ?? PALETTE[0];
var Series = {
  name: "Series",
  description: "Named data series for charts. Used inside BarChart, LineChart, PieChart.",
  props: [
    { name: "name", type: "string" },
    { name: "values", type: "number[]" }
  ],
  render: (_node, props) => {
    return el("span", { class: "rui-series", "data-name": asString(props.name) });
  }
};
var readSeries = (raw) => {
  return raw.map((s, i) => {
    const node = s;
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const values = asArray(node.args?.[1]).map((v) => asNumber(v));
    return { name, values };
  });
};
var BarChart = {
  name: "BarChart",
  description: "Vertical bar chart. `labels` define the x-axis, `series` define grouped bars.",
  props: [
    { name: "labels", type: "string[]" },
    { name: "series", type: "Series[]" },
    { name: "title", type: "string", optional: true }
  ],
  render: (_node, props) => {
    const labels = asArray(props.labels).map((l) => asString(l));
    const series = readSeries(asArray(props.series));
    const root = el("div", { class: "rui-chart rui-bar-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const width = 640;
    const height = 240;
    const labelPlan = planLabels(labels, width - 40 - 12);
    const padding = { left: 40, right: 12, top: 12, bottom: labelPlan.bottomPadding };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const svg = createSvg(width, height);
    drawAxes(svg, padding, innerWidth, innerHeight, max);
    const groupCount = labels.length;
    const groupWidth = innerWidth / Math.max(groupCount, 1);
    const seriesCount = series.length;
    const barWidth = groupWidth * 0.7 / Math.max(seriesCount, 1);
    series.forEach((s, sIdx) => {
      s.values.forEach((value, gIdx) => {
        const barHeight = value / max * innerHeight;
        const x = padding.left + gIdx * groupWidth + groupWidth * 0.15 + sIdx * barWidth;
        const y = padding.top + innerHeight - barHeight;
        const rect = svgEl("rect", {
          x: String(x),
          y: String(y),
          width: String(Math.max(barWidth - 2, 1)),
          height: String(barHeight),
          fill: colorAt(sIdx),
          rx: "2"
        });
        rect.append(svgEl("title", {}, [`${s.name}: ${value}`]));
        svg.append(rect);
      });
    });
    drawXAxisLabels(svg, labels, padding, innerWidth, innerHeight, labelPlan, (i) => padding.left + (i + 0.5) * groupWidth);
    root.append(svg);
    if (series.length > 0) root.append(legend(series));
    return root;
  }
};
var LineChart = {
  name: "LineChart",
  description: 'Line chart. `labels` define the x-axis, each Series is a line. As a shortcut you can pass `data=[{x: "Jan", revenue: 12, signups: 4}, \u2026]` and the labels + series will be derived automatically (one line per non-`x` key). Use `data` when the dataset is already row-shaped; use `series` when you have explicit Series objects.',
  props: [
    { name: "labels", type: "string[]", optional: true },
    { name: "series", type: "Series[]", optional: true },
    { name: "data", type: "{x: string, [key: string]: number}[]", optional: true, description: "Row-shaped data \u2014 labels and series are auto-derived" },
    { name: "title", type: "string", optional: true },
    { name: "filled", type: "boolean", optional: true, description: "Fill the area beneath each line (area-chart style)" },
    { name: "stacked", type: "boolean", optional: true, description: "Stack series when filled=true" }
  ],
  render: (_node, props) => {
    let labels = asArray(props.labels).map((l) => asString(l));
    let series = readSeries(asArray(props.series));
    const rows = asArray(props.data);
    if (rows.length > 0 && (labels.length === 0 || series.length === 0)) {
      const derivedLabels = [];
      const seriesByKey = /* @__PURE__ */ new Map();
      for (const raw of rows) {
        const row = raw;
        if (!row || typeof row !== "object") continue;
        derivedLabels.push(asString(row.x ?? row.label ?? ""));
        for (const [k, v] of Object.entries(row)) {
          if (k === "x" || k === "label") continue;
          const num = asNumber(v);
          if (Number.isNaN(num)) continue;
          if (!seriesByKey.has(k)) seriesByKey.set(k, []);
          seriesByKey.get(k).push(num);
        }
      }
      if (labels.length === 0) labels = derivedLabels;
      if (series.length === 0) {
        series = [...seriesByKey.entries()].map(([name, values]) => ({ name, values }));
      }
    }
    const filled = props.filled === true;
    const stacked = props.stacked === true;
    const pointCount = Math.max(labels.length, ...series.map((s) => s.values.length), 1);
    const stackedValues = series.map(() => Array(pointCount).fill(0));
    if (filled && stacked) {
      for (let i = 0; i < pointCount; i += 1) {
        let acc = 0;
        series.forEach((s, sIdx) => {
          acc += s.values[i] ?? 0;
          stackedValues[sIdx][i] = acc;
        });
      }
    }
    const root = el("div", {
      class: "rui-chart rui-line-chart",
      "data-filled": filled ? "true" : "false"
    });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const all = filled && stacked ? stackedValues.flat() : series.flatMap((s) => s.values);
    const max = Math.max(1, ...all);
    const min = filled && stacked ? 0 : Math.min(0, ...all);
    const width = 640;
    const height = 240;
    const labelPlan = planLabels(labels, width - 40 - 12);
    const padding = { left: 40, right: 12, top: 12, bottom: labelPlan.bottomPadding };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const svg = createSvg(width, height);
    drawAxes(svg, padding, innerWidth, innerHeight, max, min);
    const denominator = Math.max(labels.length - 1, 1);
    const stepX = innerWidth / denominator;
    const xForPoint = (i) => padding.left + i * (innerWidth / Math.max(pointCount - 1, 1));
    series.forEach((s, sIdx) => {
      const values = filled && stacked ? stackedValues[sIdx] : s.values;
      const baseline = filled && stacked && sIdx > 0 ? stackedValues[sIdx - 1] : null;
      const points = values.map((value, i) => {
        const x = xForPoint(i);
        const y = padding.top + innerHeight - (value - min) / (max - min || 1) * innerHeight;
        return [x, y];
      });
      if (filled && points.length > 0) {
        let areaPath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        if (baseline) {
          const baselinePoints = baseline.map((value, i) => {
            const x = xForPoint(i);
            const y = padding.top + innerHeight - (value - min) / (max - min || 1) * innerHeight;
            return [x, y];
          });
          areaPath += " " + baselinePoints.slice().reverse().map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
        } else {
          const first = points[0];
          const last = points[points.length - 1];
          areaPath += ` L${last[0].toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${first[0].toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`;
        }
        svg.append(svgEl("path", {
          d: areaPath,
          fill: colorAt(sIdx),
          "fill-opacity": "0.2",
          stroke: "none"
        }));
      }
      const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      svg.append(svgEl("path", {
        d,
        fill: "none",
        stroke: colorAt(sIdx),
        "stroke-width": "2",
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      }));
      if (s.values.length <= 30) {
        points.forEach(([x, y]) => {
          svg.append(svgEl("circle", {
            cx: String(x),
            cy: String(y),
            r: "3",
            fill: colorAt(sIdx)
          }));
        });
      }
    });
    drawXAxisLabels(svg, labels, padding, innerWidth, innerHeight, labelPlan, (i) => padding.left + i * stepX);
    root.append(svg);
    if (series.length > 0) root.append(legend(series));
    return root;
  }
};
var PieChart = {
  name: "PieChart",
  description: 'Pie / Donut chart. Each segment maps to a label/value pair. Numeric labels are rendered on every segment by default \u2014 set `showValues: false` to hide them, or `valueFormat: "percent"` to show the share instead of the raw value.',
  props: [
    { name: "labels", type: "string[]" },
    { name: "values", type: "number[]" },
    { name: "title", type: "string", optional: true },
    { name: "showValues", type: "boolean", optional: true, description: "Render numeric labels on each slice (default true)" },
    { name: "valueFormat", type: "string", optional: true, enum: ["value", "percent", "both"], description: 'How to format the on-segment label (default "value")' }
  ],
  render: (_node, props) => {
    const labels = asArray(props.labels).map((l) => asString(l));
    const values = asArray(props.values).map((v) => asNumber(v));
    const showValues = props.showValues == null ? true : asBoolean(props.showValues);
    const fmtToken = asString(props.valueFormat, "value").toLowerCase();
    const valueFormat = fmtToken === "percent" ? "percent" : fmtToken === "both" ? "both" : "value";
    const root = el("div", { class: "rui-chart rui-pie-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const total = values.reduce((acc, v) => acc + (v > 0 ? v : 0), 0) || 1;
    const svg = createSvg(240, 240);
    const cx = 120, cy = 120, r = 90;
    const MIN_LABEL_FRACTION = 0.05;
    let angle = -Math.PI / 2;
    values.forEach((value, i) => {
      const safeValue = value > 0 ? value : 0;
      const fraction = safeValue / total;
      const slice = fraction * Math.PI * 2;
      const next = angle + slice;
      const large = slice > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(next);
      const y2 = cy + r * Math.sin(next);
      const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
      const segment = svgEl("path", {
        d: path,
        fill: colorAt(i),
        stroke: "var(--rui-color-bg, #fff)",
        "stroke-width": "2"
      });
      segment.append(svgEl("title", {}, [
        `${labels[i] ?? ""}: ${value} (${(fraction * 100).toFixed(1)}%)`
      ]));
      svg.append(segment);
      if (showValues && safeValue > 0 && fraction >= MIN_LABEL_FRACTION) {
        const mid = angle + slice / 2;
        const labelR = r * 0.62;
        const lx = cx + labelR * Math.cos(mid);
        const ly = cy + labelR * Math.sin(mid);
        const display = formatSliceLabel(value, fraction, valueFormat);
        const labelText = svgEl("text", {
          x: String(lx),
          y: String(ly),
          class: "rui-pie-chart-value",
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "paint-order": "stroke",
          stroke: "rgba(15, 23, 42, 0.55)",
          "stroke-width": "3",
          "stroke-linejoin": "round",
          fill: "#fff"
        }, [display]);
        svg.append(labelText);
      }
      angle = next;
    });
    root.append(svg);
    root.append(legend(labels.map((name, i) => ({ name, values: [values[i] ?? 0] }))));
    return root;
  }
};
function formatSliceLabel(value, fraction, format) {
  const pct = `${Math.round(fraction * 100)}%`;
  const num = formatNumeric(value);
  if (format === "percent") return pct;
  if (format === "both") return `${num} (${pct})`;
  return num;
}
function formatNumeric(value) {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
var APPROX_CHAR_PX = 7;
var MIN_ROTATED_SLOT_PX = 12;
function planLabels(labels, innerWidth) {
  if (labels.length === 0) {
    return { step: 1, rotated: false, maxChars: 32, bottomPadding: 32 };
  }
  const slot = innerWidth / Math.max(labels.length, 1);
  const longest = labels.reduce((max, l) => Math.max(max, l.length), 0);
  if (longest * APPROX_CHAR_PX + 4 <= slot) {
    return { step: 1, rotated: false, maxChars: longest, bottomPadding: 32 };
  }
  const step = slot < MIN_ROTATED_SLOT_PX ? Math.max(1, Math.ceil(MIN_ROTATED_SLOT_PX / slot)) : 1;
  const maxChars = Math.min(longest, 14);
  return { step, rotated: true, maxChars, bottomPadding: 60 };
}
function truncateLabel(label, maxChars) {
  if (label.length <= maxChars) return label;
  return label.slice(0, Math.max(maxChars - 1, 1)) + "\u2026";
}
function drawXAxisLabels(svg, labels, padding, _innerWidth, innerHeight, plan, xFor) {
  const baseY = padding.top + innerHeight + (plan.rotated ? 14 : 18);
  labels.forEach((label, i) => {
    if (i % plan.step !== 0) return;
    const x = xFor(i);
    const display = truncateLabel(label, plan.maxChars);
    const attrs = {
      x: String(x),
      y: String(baseY),
      class: "rui-chart-label",
      "text-anchor": plan.rotated ? "end" : "middle"
    };
    if (plan.rotated) {
      attrs.transform = `rotate(-45, ${x}, ${baseY})`;
    }
    const text = svgEl("text", attrs, [display]);
    if (display !== label) {
      text.append(svgEl("title", {}, [label]));
    }
    svg.append(text);
  });
}
function createSvg(width, height) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "rui-chart-svg");
  svg.setAttribute("role", "img");
  return svg;
}
function svgEl(tag, attrs, children) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (children) {
    for (const child of children) {
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}
function drawAxes(svg, padding, innerWidth, innerHeight, max, min = 0) {
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const ratio = i / ticks;
    const y = padding.top + innerHeight - ratio * innerHeight;
    svg.append(svgEl("line", {
      x1: String(padding.left),
      x2: String(padding.left + innerWidth),
      y1: String(y),
      y2: String(y),
      stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))"
    }));
    svg.append(svgEl("text", {
      x: String(padding.left - 6),
      y: String(y + 3),
      "text-anchor": "end",
      class: "rui-chart-tick"
    }, [String(Math.round((min + (max - min) * ratio) * 10) / 10)]));
  }
}
function legend(series) {
  const root = el("div", { class: "rui-chart-legend" });
  series.forEach((s, i) => {
    const item = el("span", { class: "rui-chart-legend-item" });
    item.append(el("span", { class: "rui-chart-legend-swatch", style: `background:${colorAt(i)}` }));
    item.append(el("span", {}, [s.name]));
    root.append(item);
  });
  return root;
}

// ../../src/library/components/chat.ts
var SectionBlock = {
  name: "SectionBlock",
  description: "Titled chat block with a description and child content.",
  props: [
    { name: "title", type: "string" },
    { name: "children", type: "Node[]" },
    { name: "description", type: "string", optional: true }
  ],
  render: (_node, props, helpers) => {
    const root = el("section", { class: "rui-section-block" });
    root.append(el("h3", { class: "rui-section-block-title" }, [asString(props.title)]));
    const desc = asString(props.description);
    if (desc) root.append(el("p", { class: "rui-section-block-description" }, [desc]));
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var ListBlock = {
  name: "ListBlock",
  description: "Chat-styled list with bullets, useful for steps or summaries.",
  props: [
    { name: "items", type: "string[]" },
    { name: "ordered", type: "boolean", optional: true }
  ],
  render: (_node, props) => {
    const tag = asBoolean(props.ordered) ? "ol" : "ul";
    const root = el(tag, { class: "rui-list-block" });
    for (const item of asArray(props.items)) {
      root.append(el("li", {}, [asString(item)]));
    }
    return root;
  }
};
var FollowUpBlock = {
  name: "FollowUpBlock",
  description: 'Suggested follow-up prompts shown as buttons. Each item dispatches its label as an assistant message (equivalent to `emit "assistant-message" { message }`).',
  props: [
    { name: "items", type: "FollowUpItem[]", description: "Array of FollowUpItem(label, message?), {label, message} objects, or plain strings" },
    { name: "title", type: "string", optional: true }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-follow-up" });
    const title = asString(props.title, "You can also ask");
    if (title) root.append(el("div", { class: "rui-follow-up-title" }, [title]));
    const list = el("div", { class: "rui-follow-up-list" });
    for (const item of asArray(props.items)) {
      list.append(buildFollowUpButton(item, helpers));
    }
    root.append(list);
    return root;
  }
};
var buildFollowUpButton = (item, helpers) => {
  const { label, message } = extractFollowUp(item);
  const button = el("button", { class: "rui-follow-up-button", type: "button" }, [label]);
  button.onclick = () => {
    helpers.sendToAssistant(message);
  };
  return button;
};
var extractFollowUp = (item) => {
  if (typeof item === "string") return { label: item, message: item };
  if (item && typeof item === "object") {
    const node = item;
    if (node.__kind === "Component" && Array.isArray(node.args)) {
      const label2 = asString(node.args[0]);
      const message2 = asString(node.args[1], label2);
      return { label: label2, message: message2 };
    }
    const label = asString(node.label);
    const message = asString(node.message, label);
    return { label, message };
  }
  const fallback = asString(item);
  return { label: fallback, message: fallback };
};
var FollowUpItem = {
  name: "FollowUpItem",
  description: "Single follow-up item.",
  props: [
    { name: "label", type: "string" },
    { name: "message", type: "string", optional: true, description: "Defaults to label" }
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label);
    const message = asString(props.message, label);
    const button = el("button", { class: "rui-follow-up-button", type: "button" }, [label]);
    button.onclick = () => {
      helpers.sendToAssistant(message);
    };
    return button;
  }
};
var ActionLink = {
  name: "ActionLink",
  description: "Inline link that runs an action when clicked instead of navigating.",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", aliases: ["action", "onclick"] }
  ],
  render: (_node, props, helpers) => {
    const link = el("a", { class: "rui-action-link", href: "#", role: "button" }, [asString(props.label)]);
    link.onclick = (event) => {
      event.preventDefault();
      helpers.invoke(props.onClick);
    };
    return link;
  }
};

// ../../src/library/components/feedback.ts
var AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl"];
var AVATAR_FALLBACKS = ["initials", "dicebear"];
var Avatar = {
  name: "Avatar",
  description: 'User avatar. Shows the image at `src`. When `src` is missing, falls back to a deterministic DiceBear illustration seeded by `name` (pass `fallback="initials"` to render two-letter initials instead). If the image errors at runtime the avatar gracefully degrades to initials.',
  props: [
    { name: "name", type: "string", description: "Used for alt text + initials fallback" },
    { name: "src", type: "string", optional: true, description: "Image URL" },
    { name: "size", type: "string", optional: true, enum: AVATAR_SIZES },
    { name: "status", type: "string", optional: true, enum: ["online", "offline", "busy", "away"] },
    {
      name: "fallback",
      type: "string",
      optional: true,
      enum: AVATAR_FALLBACKS,
      description: "How to render when `src` is missing (default: dicebear illustration; pass `initials` for the two-letter pill)"
    }
  ],
  render: (_node, props) => {
    const size = asString(props.size, "md");
    const root = el("span", {
      class: "rui-avatar",
      "data-size": size,
      role: "img"
    });
    const name = asString(props.name);
    const fallback = asString(props.fallback, "dicebear");
    const explicitSrc = sanitiseImageSrc(props.src);
    const generated = !explicitSrc && fallback === "dicebear" && name ? sanitiseImageSrc(dicebearUrlFor(name)) : "";
    const src = explicitSrc || generated;
    if (src) {
      const img = el("img", { src, alt: name, loading: "lazy" });
      img.onerror = (event) => {
        const ev = event;
        const live = ev.currentTarget ?? ev.target;
        live.replaceWith(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
      };
      root.append(img);
    } else {
      root.append(el("span", { class: "rui-avatar-fallback" }, [initialsFor(name)]));
    }
    const status = asString(props.status);
    if (status) root.append(el("span", { class: "rui-avatar-status", "data-status": status }));
    return root;
  }
};
var AvatarGroup = {
  name: "AvatarGroup",
  description: "Stack of overlapping avatars with a `+N` chip when the list overflows. Pass either Avatar(...) nodes or plain {name, src} objects.",
  props: [
    { name: "items", type: "Avatar[]", description: "Avatar(...) nodes or {name, src} objects" },
    { name: "max", type: "number", optional: true, description: "Maximum avatars to show (default 4)" },
    { name: "size", type: "string", optional: true, enum: AVATAR_SIZES }
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const max = Math.max(1, Math.floor(Number(props.max ?? 4)));
    const size = asString(props.size, "md");
    const visible = items.slice(0, max);
    const overflow = items.length - visible.length;
    const root = el("div", { class: "rui-avatar-group", "data-size": size });
    for (const item of visible) {
      if (item && typeof item === "object" && item.__kind === "Component") {
        root.append(helpers.renderNode(item));
        continue;
      }
      const data = item;
      const name = typeof data === "string" ? data : asString((data ?? {}).name);
      const src = typeof data === "string" ? "" : asString((data ?? {}).src);
      root.append(Avatar.render(
        { __kind: "Component", name: "Avatar", args: [], argMeta: [] },
        { name, src, size },
        helpers
      ));
    }
    if (overflow > 0) {
      root.append(el("span", {
        class: "rui-avatar rui-avatar-overflow",
        "data-size": size
      }, [el("span", { class: "rui-avatar-fallback" }, [`+${overflow}`])]));
    }
    return root;
  }
};
var Progress = {
  name: "Progress",
  description: "Linear progress bar. `value` is clamped between 0 and `max` (default 100). `indeterminate=true` renders a looping animation when the total is unknown. Provide `segments` to render a segmented progress strip (steps in an onboarding flow), or `buffered` for a secondary buffer indicator (downloads, video buffering).",
  props: [
    { name: "value", type: "number", optional: true, description: "Current progress; ignored when indeterminate" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: "Shown above the bar" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "indeterminate", type: "boolean", optional: true },
    { name: "showValue", type: "boolean", optional: true, description: "Show the numeric value on the right" },
    { name: "segments", type: "number", optional: true, description: "Render N equal segments (filled by current step)" },
    { name: "buffered", type: "number", optional: true, description: "Secondary value (0..max) drawn behind the bar" }
  ],
  render: (_node, props) => {
    const max = Math.max(1, asNumber(props.max, 100));
    const indeterminate = asBoolean(props.indeterminate);
    const value = Math.max(0, Math.min(max, asNumber(props.value, 0)));
    const percent = Math.round(value / max * 100);
    const segments = Math.max(0, Math.floor(asNumber(props.segments, 0)));
    const buffered = props.buffered != null ? Math.max(0, Math.min(max, asNumber(props.buffered, 0))) : null;
    const root = el("div", { class: "rui-progress", "data-tone": asString(props.tone, "primary") });
    const label = asString(props.label);
    const showValue = asBoolean(props.showValue);
    if (label || showValue) {
      const head = el("div", { class: "rui-progress-head" });
      head.append(el("span", { class: "rui-progress-label" }, [label]));
      if (showValue && !indeterminate) {
        const display = segments > 0 ? `${Math.min(segments, Math.round(value / max * segments))} / ${segments}` : `${percent}%`;
        head.append(el("span", { class: "rui-progress-value" }, [display]));
      }
      root.append(head);
    }
    if (segments > 0 && !indeterminate) {
      const trackRoot = el("div", {
        class: "rui-progress-segments",
        role: "progressbar",
        "aria-valuemin": "0",
        "aria-valuemax": String(segments),
        "aria-valuenow": String(Math.min(segments, Math.round(value / max * segments)))
      });
      const filled = Math.min(segments, Math.round(value / max * segments));
      for (let i = 0; i < segments; i += 1) {
        trackRoot.append(el("span", {
          class: "rui-progress-segment",
          "data-filled": i < filled ? "true" : "false"
        }));
      }
      root.append(trackRoot);
      return root;
    }
    const track = el("div", {
      class: "rui-progress-track",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": String(max),
      "aria-valuenow": indeterminate ? null : String(value),
      "data-indeterminate": indeterminate ? "true" : "false"
    });
    if (buffered !== null) {
      const bufferedPercent = Math.round(buffered / max * 100);
      track.append(el("div", {
        class: "rui-progress-buffer",
        style: `width:${bufferedPercent}%`,
        "aria-hidden": "true"
      }));
    }
    track.append(el("div", {
      class: "rui-progress-bar",
      style: indeterminate ? "" : `width:${percent}%`
    }));
    root.append(track);
    return root;
  }
};
var Switch = {
  name: "Switch",
  description: "Compact on/off toggle. Pass a `$variable` as `value` for two-way binding \u2014 prefer Switch over Checkbox when the control represents a setting. `onChange(checked)` fires with the new boolean.",
  props: [
    { name: "id", type: "string" },
    { name: "label", type: "string", optional: true },
    { name: "value", type: "boolean", optional: true, aliases: ["checked"], description: "Bound value (typically $variable)" },
    { name: "description", type: "string", optional: true },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new boolean value" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("label", {
      class: "rui-switch",
      for: id,
      "data-disabled": asBoolean(props.disabled) ? "true" : "false"
    });
    const isChecked = asBoolean(props.value);
    const input = el("input", {
      type: "checkbox",
      id,
      name: id,
      class: "rui-switch-input",
      role: "switch",
      checked: isChecked ? "" : null,
      disabled: asBoolean(props.disabled) ? "" : null
    });
    input.checked = isChecked;
    const track = el("span", { class: "rui-switch-track" }, [
      el("span", { class: "rui-switch-thumb" })
    ]);
    const stateName = node.argMeta?.[2]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "change",
        getValue: (n) => n.checked
      });
    }
    if (props.onChange != null) {
      input.addEventListener("change", (e) => {
        helpers.invoke(props.onChange, e.currentTarget.checked);
      });
    }
    const label = asString(props.label);
    const description = asString(props.description);
    root.append(input, track);
    if (label || description) {
      const meta = el("span", { class: "rui-switch-meta" });
      if (label) meta.append(el("span", { class: "rui-switch-label" }, [label]));
      if (description) meta.append(el("span", { class: "rui-switch-description" }, [description]));
      root.append(meta);
    }
    return root;
  }
};
var ToggleGroup = {
  name: "ToggleGroup",
  description: "Group of mutually-exclusive Toggle-style buttons (single-select). Items are `[value, label]` arrays, `{value, label, icon?}` objects, or plain strings (used for both value and label). Pass a `$variable` as `value` for two-way binding. `onChange(value)` fires with the newly-selected value.",
  props: [
    { name: "id", type: "string" },
    { name: "items", type: "any[]" },
    { name: "value", type: "any", optional: true },
    { name: "variant", type: "string", optional: true, enum: ["default", "outline"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected value" }
  ],
  render: (node, props, helpers) => {
    const current = asString(props.value);
    const variant = asString(props.variant, "outline");
    const size = asString(props.size, "md");
    const root = el("div", {
      class: "rui-toggle-group",
      role: "radiogroup",
      "data-variant": variant,
      "data-size": size
    });
    const stateName = node.argMeta?.[2]?.stateRef;
    for (const raw of asArray(props.items)) {
      const { value, label, icon } = extractToggleItem(raw);
      const isOn = value === current;
      const btn = el("button", {
        type: "button",
        class: "rui-toggle",
        role: "radio",
        "aria-checked": isOn ? "true" : "false",
        "data-variant": variant,
        "data-size": size,
        "data-state": isOn ? "on" : "off",
        "data-value": value
      });
      const itemIconNode = renderIcon(icon, { className: "rui-toggle-icon" });
      if (itemIconNode) btn.append(itemIconNode);
      btn.append(el("span", { class: "rui-toggle-label" }, [label]));
      btn.onclick = () => {
        if (stateName) helpers.setState(stateName, value);
        helpers.invoke(props.onChange, value);
      };
      root.append(btn);
    }
    return root;
  }
};
function extractToggleItem(raw) {
  if (typeof raw === "string") return { value: raw, label: raw, icon: "" };
  if (Array.isArray(raw)) {
    return {
      value: asString(raw[0]),
      label: asString(raw[1], asString(raw[0])),
      icon: asString(raw[2])
    };
  }
  if (raw && typeof raw === "object") {
    const r = raw;
    const value = asString(r.value);
    return { value, label: asString(r.label, value), icon: asString(r.icon) };
  }
  return { value: "", label: "", icon: "" };
}
var Tooltip = {
  name: "Tooltip",
  description: "Wraps a trigger node and shows `label` text when the user hovers or focuses it. Pure CSS \u2014 no JS needed. The tooltip hides on click/touch (so it does not stay stuck on touch devices) and supports `top|bottom|left|right` placement. Use for short hints (\u22646 words); reach for HoverCard when you need rich content.",
  props: [
    { name: "label", type: "string" },
    { name: "trigger", type: "Node", aliases: ["children"] },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom", "left", "right"], aliases: ["placement"] }
  ],
  render: (_node, props, helpers) => {
    const side = asString(props.side, "top");
    const root = el("span", {
      class: "rui-tooltip",
      "data-side": side,
      tabindex: "0"
    });
    root.append(el("span", { class: "rui-tooltip-trigger" }, [
      helpers.renderNode(props.trigger)
    ]));
    const content = el("span", { class: "rui-tooltip-content", role: "tooltip" }, [
      asString(props.label)
    ]);
    content.append(el("span", { class: "rui-tooltip-arrow", "aria-hidden": "true" }));
    root.append(content);
    root.addEventListener("mousedown", () => {
      requestAnimationFrame(() => {
        if (document.activeElement === root || root.contains(document.activeElement)) {
          document.activeElement?.blur?.();
        }
      });
    });
    return root;
  }
};
var HoverCard = {
  name: "HoverCard",
  description: "Wraps a trigger node and reveals a card with rich content on hover/focus. Use for previewing a referenced item (profile, link target, definition).",
  props: [
    { name: "trigger", type: "Node" },
    { name: "content", type: "Node[]", aliases: ["children"] },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom", "left", "right"], aliases: ["placement"] },
    { name: "open", type: "boolean", optional: true, description: "Force the card open (otherwise reveal on hover/focus)" }
  ],
  render: (_node, props, helpers) => {
    const root = el("span", {
      class: "rui-hover-card",
      "data-side": asString(props.side, "bottom"),
      "data-open": asBoolean(props.open) ? "true" : null,
      tabindex: "0"
    });
    root.append(el("span", { class: "rui-hover-card-trigger" }, [
      helpers.renderNode(props.trigger)
    ]));
    const card = el("span", { class: "rui-hover-card-content", role: "dialog" });
    for (const child of asArray(props.content)) card.append(helpers.renderNode(child));
    root.append(card);
    return root;
  }
};
var RATING_ICONS = {
  star: { full: "star", half: "star-half-stroke", empty: "regular:star" },
  heart: { full: "heart", half: "heart", empty: "regular:heart" },
  thumb: { full: "thumbs-up", half: "thumbs-up", empty: "regular:thumbs-up" },
  fire: { full: "fire", half: "fire", empty: "regular:fire" },
  bolt: { full: "bolt", half: "bolt", empty: "regular:bolt" }
};
var Rating = {
  name: "Rating",
  description: "Compact 0\u20135 star rating with optional numeric badge and review count. Use in product cards, testimonials, reviews, and KPI rows. Pass `interactive: true` (or an `onChange` handler) to let users pick a rating; bind `value: $rating` for two-way binding, or read the new value from `onChange: (v) => \u2026`. With `halfStep: true` clicking the left half of a star sets a fractional value. `icon` swaps the glyph family \u2014 `star` (default), `heart`, `thumb`, `fire`, `bolt`, or any custom Font Awesome name.",
  props: [
    { name: "value", type: "number", description: "0\u2013max; can be a $variable when interactive" },
    { name: "max", type: "number", optional: true, description: "Maximum number of stars (default 5)" },
    { name: "label", type: "string", optional: true, description: 'Inline text shown after the stars (e.g. "4.2 of 5")' },
    { name: "count", type: "number", optional: true, description: "Review/voter count rendered in parentheses" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "interactive", type: "boolean", optional: true, description: "Allow clicking a star to set the value" },
    { name: "readonly", type: "boolean", optional: true, description: "Force read-only (overrides `interactive`)" },
    { name: "halfStep", type: "boolean", optional: true, description: "Allow half-star resolution when interactive" },
    { name: "icon", type: "string", optional: true, description: "Icon family \u2014 `star` (default), `heart`, `thumb`, `fire`, `bolt`, or any FA name" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new rating when the user clicks a star (interactive mode)" }
  ],
  render: (node, props, helpers) => {
    const max = Math.max(1, Math.floor(asNumber(props.max, 5)));
    const size = asString(props.size, "md");
    const halfStep = asBoolean(props.halfStep);
    const stateName = node.argMeta?.[0]?.stateRef;
    const interactive = (asBoolean(props.interactive) || props.onChange != null) && !asBoolean(props.readonly);
    const uncontrolled = interactive && !stateName;
    const localSlot = uncontrolled ? helpers.useInstanceState("rating-value", asNumber(props.value, 0)) : null;
    const current = localSlot ? asNumber(localSlot.get(), 0) : asNumber(props.value, 0);
    const raw = Math.max(0, Math.min(max, current));
    const iconChoice = resolveRatingIcons(asString(props.icon));
    const root = el("div", {
      class: "rui-rating",
      "data-size": size,
      "data-interactive": interactive ? "true" : "false",
      "data-half-step": interactive && halfStep ? "true" : "false",
      role: "img",
      "aria-label": `${raw} of ${max}`
    });
    const stars = el("span", { class: "rui-rating-stars" });
    for (let i = 1; i <= max; i += 1) {
      const fill = Math.max(0, Math.min(1, raw - (i - 1)));
      const iconName = fill >= 1 ? iconChoice.full : fill > 0 ? iconChoice.half : iconChoice.empty;
      const iconClasses = resolveIconClasses(iconName).join(" ");
      const star = el(interactive ? "button" : "span", {
        class: `rui-rating-star ${iconClasses}`.trim(),
        type: interactive ? "button" : null,
        "data-fill": fill >= 1 ? "full" : fill > 0 ? "half" : "empty",
        "aria-label": interactive ? `Rate ${i}` : null,
        "aria-hidden": interactive ? null : "true"
      });
      if (interactive) {
        const fullValue = i;
        const halfValue = i - 0.5;
        star.onclick = (event) => {
          const evt = event;
          const origin = evt.currentTarget ?? evt.target;
          let next = fullValue;
          if (halfStep) {
            const rect = origin.getBoundingClientRect();
            if (rect.width > 0 && evt.clientX - rect.left < rect.width / 2) {
              next = halfValue;
            }
          }
          if (stateName) helpers.setState(stateName, next);
          if (localSlot) localSlot.set(next);
          paintRating(origin.closest(".rui-rating"), next, max, iconChoice);
          helpers.invoke(props.onChange, next);
        };
      }
      stars.append(star);
    }
    root.append(stars);
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-rating-label" }, [label]));
    const count = props.count != null ? asNumber(props.count, 0) : null;
    if (count !== null && count > 0) {
      root.append(el("span", { class: "rui-rating-count" }, [`(${count.toLocaleString()})`]));
    }
    return root;
  }
};
function paintRating(root, value, max, icons) {
  if (!root) return;
  const stars = root.querySelectorAll(".rui-rating-star");
  stars.forEach((star, idx) => {
    const fill = Math.max(0, Math.min(1, value - idx));
    const iconName = fill >= 1 ? icons.full : fill > 0 ? icons.half : icons.empty;
    star.setAttribute("data-fill", fill >= 1 ? "full" : fill > 0 ? "half" : "empty");
    star.className = `rui-rating-star ${resolveIconClasses(iconName).join(" ")}`.trim();
  });
  root.setAttribute("aria-label", `${Math.max(0, Math.min(max, value))} of ${max}`);
}
function resolveRatingIcons(icon) {
  const key = icon.trim().toLowerCase();
  if (!key) return RATING_ICONS.star;
  if (RATING_ICONS[key]) return RATING_ICONS[key];
  return { full: key, half: key, empty: `regular:${key}` };
}
var ProgressRing = {
  name: "ProgressRing",
  description: "Circular progress indicator. Use for KPIs, quotas, completion rings, and any metric better shown as a circle than a bar. Renders the value (or a custom label) inside the ring.",
  props: [
    { name: "value", type: "number", optional: true, description: "Current value (ignored when indeterminate)" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "label", type: "string", optional: true, description: 'Text shown inside the ring (default "{percent}%")' },
    { name: "caption", type: "string", optional: true, aliases: ["description"], description: "Small caption rendered under the ring" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "indeterminate", type: "boolean", optional: true }
  ],
  render: (_node, props) => {
    const max = Math.max(1, asNumber(props.max, 100));
    const indeterminate = asBoolean(props.indeterminate);
    const value = Math.max(0, Math.min(max, asNumber(props.value, 0)));
    const percent = Math.round(value / max * 100);
    const size = asString(props.size, "md");
    const px = size === "lg" ? 120 : size === "sm" ? 72 : 96;
    const stroke = size === "lg" ? 10 : size === "sm" ? 6 : 8;
    const r = (px - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = indeterminate ? circumference * 0.65 : circumference * (1 - percent / 100);
    const root = el("div", {
      class: "rui-progress-ring",
      "data-tone": asString(props.tone, "primary"),
      "data-size": size,
      "data-indeterminate": indeterminate ? "true" : "false"
    });
    const wrap = el("div", { class: "rui-progress-ring-wrap" });
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", String(px));
    svg.setAttribute("height", String(px));
    svg.setAttribute("viewBox", `0 0 ${px} ${px}`);
    svg.setAttribute("class", "rui-progress-ring-svg");
    const track = document.createElementNS(svgNS, "circle");
    track.setAttribute("class", "rui-progress-ring-track");
    track.setAttribute("cx", String(px / 2));
    track.setAttribute("cy", String(px / 2));
    track.setAttribute("r", String(r));
    track.setAttribute("stroke-width", String(stroke));
    track.setAttribute("fill", "none");
    svg.appendChild(track);
    const bar = document.createElementNS(svgNS, "circle");
    bar.setAttribute("class", "rui-progress-ring-bar");
    bar.setAttribute("cx", String(px / 2));
    bar.setAttribute("cy", String(px / 2));
    bar.setAttribute("r", String(r));
    bar.setAttribute("stroke-width", String(stroke));
    bar.setAttribute("fill", "none");
    bar.setAttribute("stroke-linecap", "round");
    bar.setAttribute("stroke-dasharray", String(circumference));
    bar.setAttribute("stroke-dashoffset", String(offset));
    svg.appendChild(bar);
    wrap.append(svg);
    const rawLabel = asString(props.label, indeterminate ? "\u2026" : `${percent}%`);
    const center = el("span", { class: "rui-progress-ring-value" });
    const labelIcon = renderIcon(rawLabel, { className: "rui-progress-ring-icon" });
    if (labelIcon && resolveIconClasses(rawLabel).length > 0) {
      center.append(labelIcon);
    } else {
      center.append(document.createTextNode(rawLabel));
    }
    wrap.append(center);
    root.append(wrap);
    const caption = asString(props.caption);
    if (caption) root.append(el("span", { class: "rui-progress-ring-caption" }, [caption]));
    return root;
  }
};
var ChatBubble = {
  name: "ChatBubble",
  description: 'Single chat-style message bubble with author, time, and body. Use for conversation threads, agent transcripts, support chats, and any message-style UI. Set `from="me"` (or any non-empty author) for the active speaker \u2014 the bubble aligns to the right with a primary tint. `from="agent"` (default) renders as the canonical incoming bubble on the left.',
  props: [
    { name: "author", type: "string" },
    { name: "body", type: "string", aliases: ["text", "message"] },
    { name: "time", type: "string", optional: true },
    { name: "avatarSrc", type: "string", optional: true, aliases: ["src"] },
    { name: "from", type: "string", optional: true, enum: ["agent", "me", "system"], aliases: ["role"], description: "Lane (default agent)" },
    { name: "status", type: "string", optional: true, enum: ["sending", "sent", "delivered", "read", "error"] }
  ],
  render: (_node, props) => {
    const from = asString(props.from, "agent");
    const root = el("div", {
      class: "rui-chat-bubble",
      "data-from": from
    });
    if (from !== "me") {
      root.append(renderAvatarFallback(asString(props.avatarSrc), asString(props.author)));
    }
    const bubble = el("div", { class: "rui-chat-bubble-bubble" });
    const head = el("header", { class: "rui-chat-bubble-head" });
    head.append(el("span", { class: "rui-chat-bubble-author" }, [asString(props.author)]));
    const time = asString(props.time);
    if (time) head.append(el("span", { class: "rui-chat-bubble-time" }, [time]));
    bubble.append(head);
    bubble.append(el("p", { class: "rui-chat-bubble-body" }, [asString(props.body)]));
    const status = asString(props.status);
    if (status) bubble.append(el("span", { class: "rui-chat-bubble-status", "data-status": status }, [status]));
    root.append(bubble);
    if (from === "me") {
      root.append(renderAvatarFallback(asString(props.avatarSrc), asString(props.author)));
    }
    return root;
  }
};
function renderAvatarFallback(src, name) {
  const wrap = el("span", { class: "rui-chat-bubble-avatar" });
  const safeSrc = sanitiseImageSrc(src);
  if (safeSrc) {
    wrap.append(el("img", { src: safeSrc, alt: name, loading: "lazy" }));
  } else {
    wrap.append(el("span", { class: "rui-chat-bubble-fallback" }, [initialsFor(name)]));
  }
  return wrap;
}
var Kbd = {
  name: "Kbd",
  description: "Renders a keyboard shortcut chip (e.g. `Cmd+K`). Pass a single label, or multiple labels as an array to render a `key + key + \u2026` combo.",
  props: [
    { name: "keys", type: "string | string[]" },
    { name: "size", type: "string", optional: true, enum: ["sm", "md"] }
  ],
  render: (_node, props) => {
    const size = asString(props.size, "md");
    const root = el("span", { class: "rui-kbd-group", "data-size": size });
    const keys = Array.isArray(props.keys) ? props.keys : [props.keys];
    keys.forEach((key, i) => {
      const label = asString(key);
      if (!label) return;
      if (i > 0) root.append(el("span", { class: "rui-kbd-sep" }, ["+"]));
      root.append(el("kbd", { class: "rui-kbd" }, [label]));
    });
    return root;
  }
};
var POPOVER_SIDES = ["bottom", "top", "left", "right"];
var POPOVER_ALIGNS = ["start", "center", "end"];
var Popover = {
  name: "Popover",
  description: "Click-triggered popup with arbitrary rich content. Use when HoverCard's hover trigger is too eager and Modal/Sheet is too heavy \u2014 perfect for filter panels, color pickers, share menus, and small settings flyouts. The trigger stays visible while the popover is open \u2014 clicking it again, clicking outside, pressing Escape, or clicking the built-in \xD7 button all close it.",
  props: [
    { name: "trigger", type: "Node", description: "Clickable trigger element (Button, Avatar, IconButton, \u2026). The trigger remains visible while the popover is open." },
    { name: "content", type: "Node[]", aliases: ["children"], description: "Body rendered inside the popover" },
    { name: "title", type: "string", optional: true, description: "Optional bold heading rendered above the content" },
    { name: "side", type: "string", optional: true, enum: POPOVER_SIDES, aliases: ["placement"], description: 'Where the popover opens relative to the trigger (default "bottom")' },
    { name: "align", type: "string", optional: true, enum: POPOVER_ALIGNS, description: 'Alignment along the trigger edge (default "start")' },
    { name: "width", type: "string", optional: true, description: 'CSS width for the popover panel (default "280px")' },
    { name: "open", type: "boolean", optional: true, description: "Initial open state \u2014 use to demo or pre-open the popover" }
  ],
  render: (_node, props, helpers) => {
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState("open", initialOpen);
    const isOpen = openSlot.get();
    const width = sanitiseCssLength(props.width, "");
    const root = el("div", {
      class: "rui-popover",
      "data-open": isOpen ? "true" : "false",
      "data-side": asString(props.side, "bottom"),
      "data-align": asString(props.align, "start")
    });
    const triggerWrap = el("span", {
      class: "rui-popover-trigger",
      "data-state": isOpen ? "open" : "closed",
      "aria-haspopup": "dialog",
      "aria-expanded": isOpen ? "true" : "false"
    });
    triggerWrap.append(helpers.renderNode(props.trigger));
    root.append(triggerWrap);
    const body = el("div", {
      class: "rui-popover-content",
      role: "dialog",
      style: width ? `width: ${width};` : null
    });
    const header = el("div", { class: "rui-popover-header" });
    const titleText = asString(props.title);
    header.append(
      titleText ? el("div", { class: "rui-popover-title" }, [titleText]) : el("span", { class: "rui-popover-title-spacer" })
    );
    const closeBtn = el("button", {
      type: "button",
      class: "rui-popover-close",
      "aria-label": "Close popover"
    }, ["\xD7"]);
    closeBtn.onclick = (event) => {
      event.stopPropagation();
      setPopoverOpen(closeBtn, false, openSlot);
    };
    header.append(closeBtn);
    body.append(header);
    for (const child of asArray(props.content)) {
      body.append(helpers.renderNode(child));
    }
    root.append(body);
    triggerWrap.onclick = (event) => {
      event.stopPropagation();
      const origin = event.currentTarget ?? event.target;
      const next = !openSlot.get();
      const liveRoot = setPopoverOpen(origin, next, openSlot);
      if (next && liveRoot) installPopoverDismiss(liveRoot, openSlot);
    };
    triggerWrap.onkeydown = (event) => {
      const e = event;
      const origin = e.currentTarget ?? e.target;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const next = !openSlot.get();
        const liveRoot = setPopoverOpen(origin, next, openSlot);
        if (next && liveRoot) installPopoverDismiss(liveRoot, openSlot);
      } else if (e.key === "Escape" && openSlot.get()) {
        e.preventDefault();
        setPopoverOpen(origin, false, openSlot);
      }
    };
    return root;
  }
};
var setPopoverOpen = (origin, next, openSlot) => {
  openSlot.set(next);
  const liveRoot = origin.closest(".rui-popover");
  if (!liveRoot) return null;
  liveRoot.setAttribute("data-open", next ? "true" : "false");
  const trigger = liveRoot.querySelector(".rui-popover-trigger");
  trigger?.setAttribute("aria-expanded", next ? "true" : "false");
  trigger?.setAttribute("data-state", next ? "open" : "closed");
  if (!next) disposeDismissListeners(liveRoot);
  return liveRoot;
};
var installPopoverDismiss = (liveRoot, openSlot) => {
  installDismissListeners({
    liveRoot,
    onDismiss: () => {
      openSlot.set(false);
      liveRoot.setAttribute("data-open", "false");
      const trigger = liveRoot.querySelector(".rui-popover-trigger");
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.setAttribute("data-state", "closed");
    }
  });
};
var TOAST_TONES = ["default", "primary", "success", "warning", "danger", "info"];
var TOASTS_POSITIONS = [
  "top-right",
  "top-left",
  "top-center",
  "bottom-right",
  "bottom-left",
  "bottom-center"
];
var Toast = {
  name: "Toast",
  description: "Single transient notification card. Always shows a close (\xD7) button that removes the toast from the DOM (and fires `onClose` if set). Pass `duration` (ms) to auto-dismiss, or `position` for a standalone one-off toast (the renderer will pin it to the viewport corner so you do not have to wrap a single notification in `Stack(...)`). Use `Toasts` for grouped stacks; prefer `Banner` for top-of-page announcements and `Notification` for permanent inbox entries.",
  props: [
    { name: "title", type: "string" },
    { name: "message", type: "string", optional: true, aliases: ["description"] },
    { name: "tone", type: "string", optional: true, enum: TOAST_TONES, description: 'Visual accent (default "default")' },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name (default picked from tone)" },
    { name: "duration", type: "number", optional: true, description: "Auto-dismiss after N milliseconds (e.g. 4000). Omit to keep the toast until the user closes it." },
    { name: "action", type: "Button", optional: true, description: "Optional inline `Button` action shown above the message" },
    { name: "onClose", type: "callable", optional: true, description: "Callable invoked when the toast is dismissed (\xD7 button, auto-dismiss, or programmatic)" },
    { name: "position", type: "string", optional: true, enum: TOASTS_POSITIONS, description: "Pin a standalone Toast to a viewport corner without wrapping it in `Stack(...)`" }
  ],
  render: (_node, props, helpers) => {
    const tone = asString(props.tone, "default");
    const position = asString(props.position);
    const root = el("div", {
      class: position ? "rui-toast rui-toast-standalone" : "rui-toast",
      // Danger toasts are interruptive — `alert` + `assertive` so screen
      // readers announce them immediately; others are polite `status`.
      role: tone === "danger" ? "alert" : "status",
      "aria-live": tone === "danger" ? "assertive" : "polite",
      "data-tone": tone,
      "data-position": position || null
    });
    const iconName = asString(props.icon) || defaultToastIcon(tone);
    const iconNode = renderIcon(iconName, { className: "rui-toast-icon" });
    if (iconNode) root.append(iconNode);
    const body = el("div", { class: "rui-toast-body" });
    body.append(el("div", { class: "rui-toast-title" }, [asString(props.title)]));
    const message = asString(props.message);
    if (message) body.append(el("div", { class: "rui-toast-message" }, [message]));
    if (props.action) {
      const actionWrap = el("div", { class: "rui-toast-action" });
      actionWrap.append(helpers.renderNode(props.action));
      body.append(actionWrap);
    }
    root.append(body);
    const dismissedSlot = helpers.useInstanceState("dismissed", false);
    const timerSlot = helpers.useInstanceState("timer", null);
    const liveToast = (origin) => {
      if (origin) {
        const live = origin.closest(".rui-toast");
        if (live) return live;
      }
      return root.isConnected ? root : null;
    };
    const cancelTimer = () => {
      const handle = timerSlot.get();
      if (handle !== null) {
        clearTimeout(handle);
        timerSlot.set(null);
      }
    };
    const removalTimerSlot = helpers.useInstanceState("removal-timer", null);
    const dismiss = (origin) => {
      if (dismissedSlot.get()) return;
      dismissedSlot.set(true);
      cancelTimer();
      const target = liveToast(origin);
      if (!target) return;
      target.classList.add("is-dismissed");
      const handle = setTimeout(() => {
        removalTimerSlot.set(null);
        target.remove();
      }, 180);
      removalTimerSlot.set(handle);
      helpers.registerDisposer(() => {
        const h = removalTimerSlot.get();
        if (h !== null) {
          clearTimeout(h);
          removalTimerSlot.set(null);
        }
      }, "exit-animation-timer");
      helpers.invoke(props.onClose);
    };
    const closeBtn = el("button", {
      type: "button",
      class: "rui-toast-close",
      "aria-label": "Dismiss notification"
    }, ["\xD7"]);
    closeBtn.onclick = (event) => {
      event.stopPropagation();
      dismiss(event.currentTarget ?? event.target);
    };
    root.append(closeBtn);
    const duration = asNumber(props.duration, 0);
    if (duration > 0 && timerSlot.get() === null && !dismissedSlot.get()) {
      const handle = setTimeout(() => {
        timerSlot.set(null);
        if (!dismissedSlot.get() && root.isConnected) dismiss();
      }, duration);
      timerSlot.set(handle);
      helpers.registerDisposer(() => {
        const h = timerSlot.get();
        if (h !== null) {
          clearTimeout(h);
          timerSlot.set(null);
        }
      }, "auto-dismiss-timer");
    }
    if (dismissedSlot.get()) {
      const placeholder = el("div", { class: "rui-toast-placeholder", hidden: "" });
      return placeholder;
    }
    return root;
  }
};
function defaultToastIcon(tone) {
  switch (tone) {
    case "success":
      return "circle-check";
    case "warning":
      return "triangle-exclamation";
    case "danger":
      return "circle-xmark";
    case "primary":
      return "bell";
    case "info":
      return "circle-info";
    default:
      return "circle-info";
  }
}

// ../../src/library/components/navigation.ts
var BreadcrumbItem = {
  name: "BreadcrumbItem",
  description: "Single item inside a Breadcrumb trail. Provide `href` for a link, omit it for the current/leaf page (rendered with emphasis).",
  props: [
    { name: "label", type: "string" },
    { name: "href", type: "string", optional: true },
    { name: "icon", type: "string", optional: true, description: "Optional Font Awesome icon name" }
  ],
  render: (_node, props) => {
    const root = el("li", { class: "rui-breadcrumb-item" });
    const label = asString(props.label);
    const rawHref = asString(props.href);
    const safeHref = rawHref ? sanitiseHref(rawHref) : "";
    const inner = [];
    const iconNode = renderIcon(props.icon, { className: "rui-breadcrumb-icon" });
    if (iconNode) inner.push(iconNode);
    inner.push(el("span", { class: "rui-breadcrumb-label" }, [label]));
    if (safeHref) {
      root.append(el("a", { class: "rui-breadcrumb-link", href: safeHref }, inner));
    } else {
      root.setAttribute("aria-current", "page");
      const span = el("span", { class: "rui-breadcrumb-current" });
      for (const node of inner) if (node) span.append(typeof node === "string" ? document.createTextNode(node) : node);
      root.append(span);
    }
    return root;
  }
};
var Breadcrumb = {
  name: "Breadcrumb",
  description: "Trail of links showing the user's location. Children may be BreadcrumbItem(label, href?) nodes OR plain strings (the last string is treated as the current page).",
  props: [
    { name: "items", type: "BreadcrumbItem[] | string[]" },
    { name: "separator", type: "string", optional: true, description: "Default `/`" }
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const separator = asString(props.separator, "/");
    const root = el("nav", { class: "rui-breadcrumb", "aria-label": "Breadcrumb" });
    const list = el("ol", { class: "rui-breadcrumb-list" });
    items.forEach((item, i) => {
      if (i > 0) {
        list.append(el("li", { class: "rui-breadcrumb-separator", "aria-hidden": "true" }, [separator]));
      }
      if (item && typeof item === "object" && item.__kind === "Component") {
        list.append(helpers.renderNode(item));
        return;
      }
      const label = asString(item);
      const isLast = i === items.length - 1;
      list.append(BreadcrumbItem.render(
        { __kind: "Component", name: "BreadcrumbItem", args: [], argMeta: [] },
        { label, href: isLast ? "" : "#" },
        helpers
      ));
    });
    root.append(list);
    return root;
  }
};
var PER_PAGE_OPTIONS = [10, 20, 50, 100];
var Pagination = {
  name: "Pagination",
  description: 'Page navigator with Prev/Next, page numbers, and ellipses. Pass a `$variable` as `page` for two-way binding \u2014 clicking a page button sets that state to the new (1-indexed) value. Add `total` to render a "Showing N\u2013M of T" summary, pass `$variable` as `perPage` to expose a per-page selector, or set `compact: true` to drop the page-number row for tight toolbars.',
  props: [
    { name: "page", type: "number", description: "Current page (1-indexed); typically a $variable" },
    { name: "totalPages", type: "number", aliases: ["pages"] },
    { name: "siblings", type: "number", optional: true, description: "Number of page links shown around the current page (default 1)" },
    { name: "total", type: "number", optional: true, description: 'Total record count \u2014 enables the "Showing N\u2013M of T" summary' },
    { name: "perPage", type: "number", optional: true, description: "Bind a `$variable` to expose a per-page selector" },
    { name: "perPageOptions", type: "number[]", optional: true, description: "Override the per-page choices (default 10/20/50/100)" },
    { name: "compact", type: "boolean", optional: true, description: "Hide page numbers \u2014 keep Prev / Next only" }
  ],
  render: (node, props, helpers) => {
    const total = Math.max(1, Math.floor(asNumber(props.totalPages, 1)));
    const current = Math.max(1, Math.min(total, Math.floor(asNumber(props.page, 1))));
    const siblings = Math.max(0, Math.floor(asNumber(props.siblings, 1)));
    const compact = asBoolean(props.compact);
    const stateName = node.argMeta?.[0]?.stateRef;
    const root = el("nav", { class: "rui-pagination", "aria-label": "Pagination", "data-compact": compact ? "true" : "false" });
    const setPage = (next) => {
      if (!stateName) return;
      const clamped = Math.max(1, Math.min(total, next));
      if (clamped === current) return;
      helpers.setState(stateName, clamped);
    };
    const totalRecords = props.total != null ? Math.max(0, Math.floor(asNumber(props.total, 0))) : null;
    const perPageValue = props.perPage != null ? Math.max(1, Math.floor(asNumber(props.perPage, 0))) : null;
    if (totalRecords !== null && perPageValue && perPageValue > 0) {
      const start = totalRecords === 0 ? 0 : (current - 1) * perPageValue + 1;
      const end = Math.min(totalRecords, current * perPageValue);
      root.append(el("span", { class: "rui-pagination-summary" }, [
        totalRecords === 0 ? "No results" : `Showing ${start.toLocaleString()}\u2013${end.toLocaleString()} of ${totalRecords.toLocaleString()}`
      ]));
    } else if (totalRecords !== null) {
      root.append(el("span", { class: "rui-pagination-summary" }, [
        `${totalRecords.toLocaleString()} result${totalRecords === 1 ? "" : "s"}`
      ]));
    }
    const buttonsWrap = el("div", { class: "rui-pagination-buttons" });
    const button = (label, target, opts = {}) => {
      if (opts.ellipsis) {
        return el("span", { class: "rui-pagination-ellipsis", "aria-hidden": "true" }, [label]);
      }
      const btn = el("button", {
        type: "button",
        class: "rui-pagination-button",
        "data-active": opts.active ? "true" : "false",
        "aria-current": opts.active ? "page" : null,
        "aria-label": opts.ariaLabel ?? null,
        disabled: opts.disabled ? "" : null
      }, [label]);
      if (!opts.disabled && !opts.active) {
        btn.onclick = () => setPage(target);
      }
      return btn;
    };
    buttonsWrap.append(button("\u2039", current - 1, { disabled: current <= 1, ariaLabel: "Previous page" }));
    if (!compact) {
      const pageNumbers = computePageNumbers(current, total, siblings);
      for (const entry of pageNumbers) {
        if (entry === "\u2026") {
          buttonsWrap.append(button("\u2026", 0, { ellipsis: true }));
        } else {
          buttonsWrap.append(button(String(entry), entry, { active: entry === current }));
        }
      }
    } else {
      buttonsWrap.append(el("span", { class: "rui-pagination-current" }, [`${current} / ${total}`]));
    }
    buttonsWrap.append(button("\u203A", current + 1, { disabled: current >= total, ariaLabel: "Next page" }));
    root.append(buttonsWrap);
    const perPageState = node.argMeta?.[4]?.stateRef;
    if (perPageValue && (perPageState || asArray(props.perPageOptions).length > 0)) {
      const options = asArray(props.perPageOptions).length > 0 ? asArray(props.perPageOptions).map((v) => Math.max(1, Math.floor(Number(v) || 0))).filter((n) => n > 0) : Array.from(PER_PAGE_OPTIONS);
      const perPageWrap = el("label", { class: "rui-pagination-per-page" }, [
        document.createTextNode("Show ")
      ]);
      const select = el("select", { class: "rui-pagination-per-page-select" });
      for (const opt of options) {
        const optEl = el("option", {
          value: String(opt),
          selected: opt === perPageValue ? "" : null
        }, [String(opt)]);
        select.append(optEl);
      }
      if (perPageState) {
        helpers.bindState(select, perPageState, {
          event: "change",
          getValue: (n) => Number(n.value)
        });
      }
      perPageWrap.append(select);
      perPageWrap.append(document.createTextNode(" per page"));
      root.append(perPageWrap);
    }
    return root;
  }
};
function computePageNumbers(current, total, siblings) {
  const pages = [];
  const range = (from, to) => {
    for (let i = from; i <= to; i += 1) pages.push(i);
  };
  const totalNumbers = siblings * 2 + 5;
  if (total <= totalNumbers) {
    range(1, total);
    return pages;
  }
  const leftSibling = Math.max(2, current - siblings);
  const rightSibling = Math.min(total - 1, current + siblings);
  pages.push(1);
  if (leftSibling > 2) pages.push("\u2026");
  range(leftSibling, rightSibling);
  if (rightSibling < total - 1) pages.push("\u2026");
  pages.push(total);
  return pages;
}
var NavbarItem = {
  name: "NavbarItem",
  description: "Single link inside a Navbar's main item slot. Renders as an inline anchor / button \u2014 pass `to` for a router-aware link, `href` for an external link, or `onClick` for a click handler. `active=true` highlights the current page.",
  props: [
    { name: "label", type: "string" },
    { name: "to", type: "string", optional: true, description: "Internal route (consumes the built-in router)" },
    { name: "href", type: "string", optional: true, description: "External href; opens in a new tab when set with `external=true`" },
    { name: "icon", type: "string", optional: true },
    { name: "active", type: "boolean", optional: true },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable fired on click (alternative to `to`/`href`)" },
    { name: "external", type: "boolean", optional: true }
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label);
    const icon = props.icon;
    const active = asBoolean(props.active);
    const to = asString(props.to);
    const safeHref = sanitiseHref(props.href, "");
    const external = asBoolean(props.external);
    const tagName = to || safeHref ? "a" : "button";
    const root = el(tagName, {
      class: "rui-navbar-item",
      type: tagName === "button" ? "button" : null,
      href: safeHref || (to ? `#${to.startsWith("/") ? to : `/${to}`}` : null),
      target: external && safeHref ? "_blank" : null,
      rel: external && safeHref ? "noopener noreferrer" : null,
      "data-active": active ? "true" : "false"
    });
    const iconNode = renderIcon(icon, { className: "rui-navbar-item-icon" });
    if (iconNode) root.append(iconNode);
    root.append(el("span", { class: "rui-navbar-item-label" }, [label]));
    if (to && !safeHref) {
      root.onclick = (event) => {
        if (event.defaultPrevented) return;
        const evt = event;
        if (evt.button !== 0 || evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey) return;
        event.preventDefault();
        helpers.router.navigate(to);
      };
    } else if (typeof props.onClick === "function") {
      root.onclick = (event) => {
        event.preventDefault();
        helpers.invoke(props.onClick);
      };
    }
    return root;
  }
};
var Navbar = {
  name: "Navbar",
  description: "Top navigation bar with a brand on the left, primary nav items in the middle, and a right-aligned actions slot (user avatar, DropdownMenu, CTA buttons, \u2026). Use `sticky=true` to pin it to the top of the page. The canonical companion of `Sidebar` for product surfaces; prefer Navbar for marketing/docs pages without a sidebar.",
  props: [
    { name: "brand", type: "string | Node", optional: true, description: "Workspace/product name (string) or a node (e.g. logo Image)" },
    { name: "items", type: "NavbarItem[]", optional: true, description: "Center navigation items" },
    { name: "actions", type: "Node[]", optional: true, description: "Right-side controls (Buttons, Avatar, DropdownMenu, \u2026)" },
    { name: "sticky", type: "boolean", optional: true, description: "Pin the bar to the top of the viewport" },
    { name: "variant", type: "string", optional: true, enum: ["default", "transparent"], description: "Visual variant" }
  ],
  render: (_node, props, helpers) => {
    const root = el("nav", {
      class: "rui-navbar",
      "data-sticky": asBoolean(props.sticky) ? "true" : "false",
      "data-variant": asString(props.variant, "default"),
      "aria-label": "Primary"
    });
    const brand = props.brand;
    if (brand !== void 0 && brand !== null && brand !== "") {
      const brandWrap = el("div", { class: "rui-navbar-brand" });
      if (typeof brand === "string") {
        brandWrap.append(document.createTextNode(brand));
      } else {
        brandWrap.append(helpers.renderNode(brand));
      }
      root.append(brandWrap);
    }
    const items = asArray(props.items);
    if (items.length > 0) {
      const list = el("div", { class: "rui-navbar-items" });
      for (const item of items) list.append(helpers.renderNode(item));
      root.append(list);
    }
    const actions = asArray(props.actions);
    if (actions.length > 0) {
      const right = el("div", { class: "rui-navbar-actions" });
      for (const item of actions) right.append(helpers.renderNode(item));
      root.append(right);
    }
    return root;
  }
};

// ../../src/library/components/menu.ts
var MENU_SIDES = ["bottom", "top", "left", "right"];
var MENU_ALIGNS = ["start", "center", "end"];
var MENU_VARIANTS = ["default", "danger"];
var setDropdownOpen = (origin, next, openSlot) => {
  openSlot.set(next);
  const liveRoot = origin.closest(".rui-dropdown-menu");
  if (!liveRoot) return null;
  liveRoot.setAttribute("data-open", next ? "true" : "false");
  const trigger = liveRoot.querySelector(".rui-dropdown-menu-trigger");
  trigger?.setAttribute("aria-expanded", next ? "true" : "false");
  if (!next) disposeDismissListeners(liveRoot);
  return liveRoot;
};
var installOutsideClickClose = (liveRoot, openSlot) => {
  installDismissListeners({
    liveRoot,
    onDismiss: () => {
      openSlot.set(false);
      liveRoot.setAttribute("data-open", "false");
      liveRoot.querySelector(".rui-dropdown-menu-trigger")?.setAttribute("aria-expanded", "false");
    }
  });
};
var isMenuChild = (item, name) => {
  if (!item || typeof item !== "object") return false;
  const node = item;
  return node.__kind === "Component" && node.name === name;
};
var DropdownMenu = {
  name: "DropdownMenu",
  description: "Click-triggered dropdown menu. Click the trigger to toggle, click a MenuItem to run its action and close, click outside or press Escape to close without acting. Children must be MenuItem, MenuSeparator, or MenuLabel entries.",
  props: [
    { name: "trigger", type: "Node", description: "Clickable trigger element (typically a Button or Avatar)" },
    { name: "items", type: "(MenuItem | MenuSeparator | MenuLabel)[]" },
    { name: "side", type: "string", optional: true, enum: MENU_SIDES, description: 'Where the menu opens relative to the trigger (default "bottom")' },
    { name: "align", type: "string", optional: true, enum: MENU_ALIGNS, description: 'How the menu aligns along the trigger edge (default "start")' },
    { name: "label", type: "string", optional: true, description: "Optional ARIA label for the menu" },
    { name: "open", type: "boolean", optional: true, description: "Initial open state \u2014 use to demo or pre-open the menu" }
  ],
  render: (_node, props, helpers) => {
    const initialOpen = asBoolean(props.open);
    const openSlot = helpers.useInstanceState("open", initialOpen);
    const isOpen = openSlot.get();
    const root = el("div", {
      class: "rui-dropdown-menu",
      "data-open": isOpen ? "true" : "false",
      "data-side": asString(props.side, "bottom"),
      "data-align": asString(props.align, "start")
    });
    const triggerWrap = el("span", {
      class: "rui-dropdown-menu-trigger",
      "data-state": isOpen ? "open" : "closed",
      "aria-haspopup": "menu",
      "aria-expanded": isOpen ? "true" : "false",
      tabindex: "0"
    });
    triggerWrap.append(helpers.renderNode(props.trigger));
    triggerWrap.onclick = (event) => {
      event.stopPropagation();
      const origin = event.currentTarget ?? event.target;
      const next = !openSlot.get();
      const liveRoot = setDropdownOpen(origin, next, openSlot);
      if (next && liveRoot) installOutsideClickClose(liveRoot, openSlot);
    };
    triggerWrap.onkeydown = (event) => {
      const e = event;
      const origin = e.currentTarget ?? e.target;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const next = !openSlot.get();
        const liveRoot = setDropdownOpen(origin, next, openSlot);
        if (next && liveRoot) installOutsideClickClose(liveRoot, openSlot);
        return;
      }
      if (e.key === "Escape" && openSlot.get()) {
        e.preventDefault();
        setDropdownOpen(origin, false, openSlot);
      }
    };
    root.append(triggerWrap);
    const content = el("div", {
      class: "rui-dropdown-menu-content",
      role: "menu",
      "aria-label": asString(props.label) || null
    });
    for (const raw of asArray(props.items)) {
      if (isMenuChild(raw, "MenuItem")) {
        const args = raw.args ?? [];
        const label = asString(args[0]);
        const action = args[1];
        const icon = args[2];
        const shortcut = asString(args[3]);
        const variant = asString(args[4], "default");
        const disabled = asBoolean(args[5]);
        const btn = el("button", {
          type: "button",
          class: "rui-menu-item",
          role: "menuitem",
          "data-variant": variant,
          disabled: disabled ? "" : null
        });
        const iconNode = renderIcon(icon, { className: "rui-menu-item-icon" });
        if (iconNode) btn.append(iconNode);
        btn.append(el("span", { class: "rui-menu-item-label" }, [label]));
        if (shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [shortcut]));
        if (!disabled) {
          btn.onclick = (event) => {
            const origin = event.currentTarget ?? event.target;
            setDropdownOpen(origin, false, openSlot);
            helpers.invoke(action);
          };
        }
        content.append(btn);
        continue;
      }
      if (isMenuChild(raw, "MenuSeparator")) {
        content.append(el("div", { class: "rui-menu-separator", role: "separator" }));
        continue;
      }
      if (isMenuChild(raw, "MenuLabel")) {
        const label = asString((raw.args ?? [])[0]);
        content.append(el("div", { class: "rui-menu-label" }, [label]));
        continue;
      }
      content.append(helpers.renderNode(raw));
    }
    root.append(content);
    return root;
  }
};
var MenuItem = {
  name: "MenuItem",
  description: "Single item inside a DropdownMenu. Renders a button-style row with an optional leading icon and trailing keyboard-shortcut hint. `onClick` (legacy: `action`) runs when clicked; the menu closes automatically afterwards.",
  props: [
    { name: "label", type: "string" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"], description: "Callable to execute on click" },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon name shown before the label" },
    { name: "shortcut", type: "string", optional: true, description: 'Trailing keyboard-shortcut hint (e.g. "\u2318 K")' },
    { name: "variant", type: "string", optional: true, enum: MENU_VARIANTS, description: 'Use "danger" for destructive actions' },
    { name: "disabled", type: "boolean", optional: true }
  ],
  // Standalone render (when used outside a DropdownMenu): an inert button so
  // the structure still appears, but without the parent's open/close wiring.
  render: (_node, props, helpers) => {
    const disabled = asBoolean(props.disabled);
    const btn = el("button", {
      type: "button",
      class: "rui-menu-item",
      role: "menuitem",
      "data-variant": asString(props.variant, "default"),
      disabled: disabled ? "" : null
    });
    const iconNode = renderIcon(props.icon, { className: "rui-menu-item-icon" });
    if (iconNode) btn.append(iconNode);
    btn.append(el("span", { class: "rui-menu-item-label" }, [asString(props.label)]));
    const shortcut = asString(props.shortcut);
    if (shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [shortcut]));
    if (!disabled) {
      btn.onclick = () => {
        helpers.invoke(props.onClick);
      };
    }
    return btn;
  }
};
var MenuSeparator = {
  name: "MenuSeparator",
  description: "Thin horizontal rule used inside a DropdownMenu to group items.",
  props: [],
  render: () => el("div", { class: "rui-menu-separator", role: "separator" })
};
var MenuLabel = {
  name: "MenuLabel",
  description: 'Small uppercase section header inside a DropdownMenu. Use to group related MenuItems (e.g. "Account", "Workspace", "Danger zone").',
  props: [{ name: "label", type: "string" }],
  render: (_node, props) => el("div", { class: "rui-menu-label" }, [asString(props.label)])
};

// ../../src/library/components/advanced-data.ts
var COL_ALIGN2 = ["left", "center", "right"];
function readDataGridCols(raw) {
  return asArray(raw).map((node, idx) => {
    const args = node.args ?? [];
    const header = asString(args[0]);
    return {
      header,
      values: asArray(args[1]),
      format: asString(args[2], "text"),
      align: COL_ALIGN2.includes(asString(args[3])) ? asString(args[3]) : "",
      sortable: asBoolean(args[4]),
      filterable: asBoolean(args[5]),
      render: args[6],
      onClick: args[7],
      key: header || `col-${idx}`
    };
  });
}
function compareCells(a, b, format) {
  if (a === null || a === void 0) return b === null || b === void 0 ? 0 : 1;
  if (b === null || b === void 0) return -1;
  if (format === "number" || format === "currency") {
    return asNumber(a, 0) - asNumber(b, 0);
  }
  if (format === "date") {
    const ta = new Date(asString(a)).getTime();
    const tb = new Date(asString(b)).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  }
  return asString(a).localeCompare(asString(b));
}
function formatCellValue(value, format) {
  if (value === null || value === void 0) return "";
  switch (format) {
    case "number":
      return typeof value === "number" ? value.toLocaleString() : asString(value);
    case "currency":
      return typeof value === "number" ? value.toLocaleString(void 0, { style: "currency", currency: "USD" }) : asString(value);
    case "date":
      try {
        const d = new Date(asString(value));
        return Number.isNaN(d.getTime()) ? asString(value) : d.toLocaleDateString();
      } catch {
        return asString(value);
      }
    default:
      return asString(value);
  }
}
var DataGrid = {
  name: "DataGrid",
  description: "Advanced data table with sortable headers, per-column filter chips, row selection (checkboxes), sticky header / first column, optional pagination, an optional bulk-action toolbar slot, and click-to-act rows. Columns are Col(header, values, format?, align?, sortable?, filterable?) entries. Bind `$sort` (`{key, direction}` object), `$selectedIds` (string[]), and `$page` (number) for full reactivity. Use INSTEAD of `Table` when you need any of those interactions.",
  props: [
    { name: "columns", type: "Col[]", description: "Columns; pass sortable=true / filterable=true on each Col." },
    { name: "rowIds", type: "any[]", optional: true, description: "Stable id per row (used by `selectedIds`); defaults to row index." },
    { name: "caption", type: "string", optional: true },
    { name: "sort", type: "object", optional: true, description: "`{key, direction}` \u2014 pass a $variable for two-way binding" },
    { name: "selectedIds", type: "any[]", optional: true, description: "Array of selected row ids \u2014 bind a $variable" },
    { name: "selectable", type: "boolean", optional: true, description: "Render leading selection checkboxes" },
    { name: "page", type: "number", optional: true, description: "1-indexed current page \u2014 bind a $variable" },
    { name: "perPage", type: "number", optional: true, description: "Page size (default 20)" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when no rows match (default `No results`)" },
    { name: "onRowClick", type: "callable", optional: true, aliases: ["rowAction"], description: "Callable fired when a row is clicked. Receives the row index." },
    { name: "toolbar", type: "Node[]", optional: true, description: "Bulk-action toolbar shown above the table when any rows are selected" },
    { name: "density", type: "string", optional: true, enum: ["comfortable", "compact"] },
    { name: "striped", type: "boolean", optional: true },
    { name: "stickyHeader", type: "boolean", optional: true, description: "Pin the header row (default true)" },
    { name: "stickyFirstColumn", type: "boolean", optional: true, description: "Pin the first column horizontally" }
  ],
  render: (node, props, helpers) => {
    const cols = readDataGridCols(props.columns);
    const rowCount = Math.max(0, ...cols.map((c) => c.values.length));
    const rowIds = asArray(props.rowIds);
    const idFor = (rowIdx) => asString(rowIds[rowIdx] ?? rowIdx);
    const sortState = props.sort && typeof props.sort === "object" ? props.sort : null;
    const sortKey = asString(sortState?.key);
    const sortDir = asString(sortState?.direction, "asc") === "desc" ? "desc" : "asc";
    const selectedIds = asArray(props.selectedIds).map((v) => asString(v));
    const selectedSet = new Set(selectedIds);
    const selectable = asBoolean(props.selectable) || node.argMeta?.[4]?.stateRef !== void 0;
    const stickyHeader = props.stickyHeader === void 0 ? true : asBoolean(props.stickyHeader);
    const stickyFirst = asBoolean(props.stickyFirstColumn);
    const density = asString(props.density, "comfortable");
    const striped = asBoolean(props.striped);
    const filterSlot = helpers.useInstanceState("filters", {});
    const filters = filterSlot.get();
    const indices = [];
    for (let r = 0; r < rowCount; r += 1) {
      let keep = true;
      for (const c of cols) {
        if (!c.filterable) continue;
        const term = (filters[c.key] ?? "").trim().toLowerCase();
        if (!term) continue;
        const cell = c.values[r];
        if (!formatCellValue(cell, c.format).toLowerCase().includes(term)) {
          keep = false;
          break;
        }
      }
      if (keep) indices.push(r);
    }
    if (sortKey) {
      const sortCol = cols.find((c) => c.key === sortKey);
      if (sortCol && sortCol.sortable) {
        indices.sort((a, b) => {
          const cmp = compareCells(sortCol.values[a], sortCol.values[b], sortCol.format);
          return sortDir === "desc" ? -cmp : cmp;
        });
      }
    }
    const totalAfterFilter = indices.length;
    const perPage = Math.max(1, Math.floor(asNumber(props.perPage, 20)));
    const totalPages = Math.max(1, Math.ceil(totalAfterFilter / perPage));
    const rawPage = Math.max(1, Math.floor(asNumber(props.page, 1)));
    const page = Math.min(rawPage, totalPages);
    const visible = indices.slice((page - 1) * perPage, page * perPage);
    const wrapper = el("div", {
      class: "rui-data-grid",
      "data-density": density,
      "data-striped": striped ? "true" : "false",
      "data-sticky-header": stickyHeader ? "true" : "false",
      "data-sticky-first": stickyFirst ? "true" : "false"
    });
    const sortStateName = node.argMeta?.[3]?.stateRef;
    const selectedStateName = node.argMeta?.[4]?.stateRef;
    const pageStateName = node.argMeta?.[6]?.stateRef;
    const toolbarChildren = asArray(props.toolbar);
    if (selectedIds.length > 0 && toolbarChildren.length > 0) {
      const bar = el("div", { class: "rui-data-grid-bulk" });
      bar.append(el("span", { class: "rui-data-grid-bulk-count" }, [
        `${selectedIds.length} selected`
      ]));
      const tools = el("div", { class: "rui-data-grid-bulk-tools" });
      for (const child of toolbarChildren) tools.append(helpers.renderNode(child));
      bar.append(tools);
      wrapper.append(bar);
    }
    const tableWrap = el("div", { class: "rui-data-grid-scroll" });
    const table = el("table", { class: "rui-data-grid-table" });
    const caption = asString(props.caption);
    if (caption) table.append(el("caption", { class: "rui-data-grid-caption" }, [caption]));
    const thead = el("thead");
    const headRow = el("tr");
    if (selectable) {
      const th = el("th", { class: "rui-data-grid-cell-select", scope: "col" });
      const allSelected = visible.length > 0 && visible.every((r) => selectedSet.has(idFor(r)));
      const cb = el("input", {
        type: "checkbox",
        class: "rui-data-grid-checkbox",
        "aria-label": "Select all rows on this page",
        checked: allSelected ? "" : null
      });
      if (selectedStateName) {
        cb.onclick = (event) => {
          const target = event.currentTarget;
          const next = new Set(selectedIds);
          for (const r of visible) {
            const id = idFor(r);
            if (target.checked) next.add(id);
            else next.delete(id);
          }
          helpers.setState(selectedStateName, Array.from(next));
        };
      }
      th.append(cb);
      headRow.append(th);
    }
    cols.forEach((col, c) => {
      const th = el("th", {
        scope: "col",
        "data-align": col.align || null,
        "data-sortable": col.sortable ? "true" : null,
        "data-active": col.sortable && col.key === sortKey ? "true" : null,
        "data-first": c === 0 ? "true" : null
      });
      if (col.sortable && sortStateName) {
        const btn = el("button", {
          type: "button",
          class: "rui-data-grid-sort"
        });
        btn.append(el("span", {}, [col.header]));
        const dirIcon = col.key === sortKey ? sortDir === "asc" ? "arrow-up-short-wide" : "arrow-down-wide-short" : "sort";
        const dirNode = renderIcon(dirIcon, { className: "rui-data-grid-sort-icon" });
        if (dirNode) btn.append(dirNode);
        btn.onclick = () => {
          const nextDir = col.key === sortKey && sortDir === "asc" ? "desc" : "asc";
          helpers.setState(sortStateName, { key: col.key, direction: nextDir });
        };
        th.append(btn);
      } else {
        th.append(document.createTextNode(col.header));
      }
      headRow.append(th);
    });
    thead.append(headRow);
    if (cols.some((c) => c.filterable)) {
      const filterRow = el("tr", { class: "rui-data-grid-filter-row" });
      if (selectable) filterRow.append(el("td", { class: "rui-data-grid-cell-select" }));
      cols.forEach((col) => {
        const td = el("td");
        if (col.filterable) {
          const input = el("input", {
            type: "search",
            class: "rui-data-grid-filter",
            placeholder: `Filter ${col.header}`,
            value: filters[col.key] ?? ""
          });
          input.oninput = (event) => {
            const target = event.currentTarget;
            const next = { ...filterSlot.get(), [col.key]: target.value };
            filterSlot.set(next);
            const liveTbody = target.closest("table")?.querySelector("tbody");
            requestRebody(liveTbody);
          };
          td.append(input);
        }
        filterRow.append(td);
      });
      thead.append(filterRow);
    }
    table.append(thead);
    const tbody = el("tbody");
    table.append(tbody);
    const renderBody = (rows) => {
      tbody.replaceChildren();
      if (rows.length === 0) {
        const emptyRow = el("tr");
        const span = (selectable ? 1 : 0) + Math.max(cols.length, 1);
        emptyRow.append(el("td", {
          colspan: String(span),
          class: "rui-data-grid-empty"
        }, [asString(props.emptyLabel, "No results")]));
        tbody.append(emptyRow);
        return;
      }
      for (const r of rows) {
        const id = idFor(r);
        const isSelected = selectedSet.has(id);
        const tr = el("tr", {
          "data-selected": isSelected ? "true" : null
        });
        if (selectable) {
          const cellTd = el("td", { class: "rui-data-grid-cell-select" });
          const cb = el("input", {
            type: "checkbox",
            class: "rui-data-grid-checkbox",
            "aria-label": "Select row",
            checked: isSelected ? "" : null
          });
          if (selectedStateName) {
            cb.onclick = (event) => {
              event.stopPropagation();
              const target = event.currentTarget;
              const next = new Set(selectedIds);
              if (target.checked) next.add(id);
              else next.delete(id);
              helpers.setState(selectedStateName, Array.from(next));
            };
          }
          cellTd.append(cb);
          tr.append(cellTd);
        }
        cols.forEach((col, c) => {
          const td = el("td", {
            "data-format": col.format,
            "data-align": col.align || null,
            "data-first": c === 0 ? "true" : null
          });
          fillTableCell(td, col, col.values[r], r, helpers, formatCellValue);
          tr.append(td);
        });
        if (typeof props.onRowClick === "function") {
          tr.setAttribute("data-clickable", "true");
          tr.onclick = (event) => {
            const target = event.target;
            if (target?.closest("input,button,a,label,select,textarea")) return;
            helpers.invoke(props.onRowClick, r);
          };
        }
        tbody.append(tr);
      }
    };
    const requestRebody = (liveOverride) => {
      const liveTbody = liveOverride ?? tbody;
      const localFilters = filterSlot.get();
      const filtered = [];
      for (let r = 0; r < rowCount; r += 1) {
        let keep = true;
        for (const c of cols) {
          if (!c.filterable) continue;
          const term = (localFilters[c.key] ?? "").trim().toLowerCase();
          if (!term) continue;
          const cell = c.values[r];
          if (!formatCellValue(cell, c.format).toLowerCase().includes(term)) {
            keep = false;
            break;
          }
        }
        if (keep) filtered.push(r);
      }
      if (sortKey) {
        const sortCol = cols.find((c) => c.key === sortKey);
        if (sortCol && sortCol.sortable) {
          filtered.sort((a, b) => {
            const cmp = compareCells(sortCol.values[a], sortCol.values[b], sortCol.format);
            return sortDir === "desc" ? -cmp : cmp;
          });
        }
      }
      const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
      const swap = (target) => {
        target.replaceChildren();
        for (const row of pageRows) {
          const id = idFor(row);
          const isSelected = selectedSet.has(id);
          const tr = el("tr", { "data-selected": isSelected ? "true" : null });
          if (selectable) {
            const cellTd = el("td", { class: "rui-data-grid-cell-select" });
            const cb = el("input", {
              type: "checkbox",
              class: "rui-data-grid-checkbox",
              checked: isSelected ? "" : null
            });
            cellTd.append(cb);
            tr.append(cellTd);
          }
          cols.forEach((col, c) => {
            const td = el("td", {
              "data-format": col.format,
              "data-align": col.align || null,
              "data-first": c === 0 ? "true" : null
            });
            fillTableCell(td, col, col.values[row], row, helpers, formatCellValue);
            tr.append(td);
          });
          target.append(tr);
        }
        if (pageRows.length === 0) {
          const emptyRow = el("tr");
          const span = (selectable ? 1 : 0) + Math.max(cols.length, 1);
          emptyRow.append(el("td", {
            colspan: String(span),
            class: "rui-data-grid-empty"
          }, [asString(props.emptyLabel, "No results")]));
          target.append(emptyRow);
        }
      };
      swap(liveTbody);
    };
    renderBody(visible);
    tableWrap.append(table);
    wrapper.append(tableWrap);
    if (totalAfterFilter > perPage) {
      const footer = el("div", { class: "rui-data-grid-footer" });
      const startIdx = totalAfterFilter === 0 ? 0 : (page - 1) * perPage + 1;
      const endIdx = Math.min(totalAfterFilter, page * perPage);
      footer.append(el("span", { class: "rui-data-grid-footer-summary" }, [
        totalAfterFilter === 0 ? "No results" : `Showing ${startIdx}\u2013${endIdx} of ${totalAfterFilter}`
      ]));
      const buttons = el("div", { class: "rui-data-grid-footer-buttons" });
      const prev = el("button", {
        type: "button",
        class: "rui-data-grid-page-button",
        disabled: page <= 1 ? "" : null
      }, ["\u2039 Prev"]);
      const next = el("button", {
        type: "button",
        class: "rui-data-grid-page-button",
        disabled: page >= totalPages ? "" : null
      }, ["Next \u203A"]);
      if (pageStateName) {
        prev.onclick = () => {
          if (page <= 1) return;
          helpers.setState(pageStateName, page - 1);
        };
        next.onclick = () => {
          if (page >= totalPages) return;
          helpers.setState(pageStateName, page + 1);
        };
      }
      buttons.append(prev);
      buttons.append(el("span", { class: "rui-data-grid-page-current" }, [`${page} / ${totalPages}`]));
      buttons.append(next);
      footer.append(buttons);
      wrapper.append(footer);
    }
    return wrapper;
  }
};
function readCalendarEvents(raw) {
  const out = [];
  for (const entry of asArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry;
    const date = asString(e.date);
    if (!date) continue;
    out.push({
      date,
      title: asString(e.title),
      tone: asString(e.tone, "primary"),
      time: asString(e.time)
    });
  }
  return out;
}
function startOfWeek(date, weekStartsOn) {
  const out = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = out.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}
function formatIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
var CalendarView = {
  name: "CalendarView",
  description: "Full-month or week calendar grid for scheduling apps \u2014 distinct from the form-input `DatePicker`. Pass events as an array of `{date: 'YYYY-MM-DD', title, tone?, time?}` objects. Bind `value` to a `$variable` for the selected date (ISO string). Use `view=\"week\"` for a single-week strip. `firstDay=1` (Monday) matches most business apps.",
  props: [
    { name: "value", type: "string", optional: true, description: "Selected ISO date (YYYY-MM-DD); bind a $variable" },
    { name: "month", type: "string", optional: true, description: "Reference month \u2014 ISO date or YYYY-MM (defaults to today)" },
    { name: "events", type: "object[]", optional: true, description: "Array of {date, title, tone?, time?} objects" },
    { name: "view", type: "string", optional: true, enum: ["month", "week"] },
    { name: "firstDay", type: "number", optional: true, description: "0=Sunday, 1=Monday (default 1)" },
    { name: "onSelect", type: "callable", optional: true, description: "Callable fired when a day is clicked; receives the ISO date string" }
  ],
  render: (node, props, helpers) => {
    const view = asString(props.view, "month");
    const events = readCalendarEvents(props.events);
    const valueRaw = asString(props.value);
    const monthRaw = asString(props.month, valueRaw);
    const today = /* @__PURE__ */ new Date();
    let refDate = /* @__PURE__ */ new Date(NaN);
    if (monthRaw) {
      const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(monthRaw);
      if (m) {
        refDate = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
      } else {
        const d = new Date(monthRaw);
        if (!Number.isNaN(d.getTime())) refDate = d;
      }
    }
    if (Number.isNaN(refDate.getTime())) refDate = today;
    const weekStartsOn = (asNumber(props.firstDay, 1) % 7 + 7) % 7;
    const valueIso = valueRaw && /^\d{4}-\d{2}-\d{2}$/.test(valueRaw) ? valueRaw : "";
    const eventsByDate = /* @__PURE__ */ new Map();
    for (const evt of events) {
      const key = evt.date.slice(0, 10);
      const list = eventsByDate.get(key) ?? [];
      list.push(evt);
      eventsByDate.set(key, list);
    }
    const onSelectState = node.argMeta?.[0]?.stateRef;
    const root = el("div", { class: "rui-calendar", "data-view": view });
    const header = el("div", { class: "rui-calendar-header" });
    const monthLabel = refDate.toLocaleDateString(void 0, { month: "long", year: "numeric" });
    header.append(el("div", { class: "rui-calendar-title" }, [monthLabel]));
    root.append(header);
    const weekRow = el("div", { class: "rui-calendar-weekrow" });
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 7; i += 1) {
      const label = dayLabels[(weekStartsOn + i) % 7] ?? "";
      weekRow.append(el("div", { class: "rui-calendar-weekday" }, [label]));
    }
    root.append(weekRow);
    const cells = [];
    if (view === "week") {
      const anchor = valueIso ? new Date(valueIso) : refDate;
      const start = startOfWeek(anchor, weekStartsOn);
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        cells.push({ date: d, inMonth: d.getMonth() === refDate.getMonth() });
      }
    } else {
      const firstOfMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const lastOfMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      const gridStart = startOfWeek(firstOfMonth, weekStartsOn);
      const totalDays = Math.ceil((lastOfMonth.getDate() + (firstOfMonth.getDay() - weekStartsOn + 7) % 7) / 7) * 7;
      for (let i = 0; i < totalDays; i += 1) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        cells.push({ date: d, inMonth: d.getMonth() === refDate.getMonth() });
      }
    }
    const grid = el("div", { class: "rui-calendar-grid", "data-view": view });
    const todayIso = formatIsoDate(today);
    for (const cell of cells) {
      const iso = formatIsoDate(cell.date);
      const isToday = iso === todayIso;
      const isSelected = iso === valueIso;
      const cellEvents = eventsByDate.get(iso) ?? [];
      const dayBtn = el("button", {
        type: "button",
        class: "rui-calendar-day",
        "data-in-month": cell.inMonth ? "true" : "false",
        "data-today": isToday ? "true" : "false",
        "data-selected": isSelected ? "true" : "false",
        "aria-label": cell.date.toDateString()
      });
      dayBtn.append(el("span", { class: "rui-calendar-daynumber" }, [String(cell.date.getDate())]));
      if (cellEvents.length > 0) {
        const evts = el("div", { class: "rui-calendar-day-events" });
        const visibleEvents = cellEvents.slice(0, 3);
        for (const evt of visibleEvents) {
          const chip = el("span", {
            class: "rui-calendar-event",
            "data-tone": evt.tone ?? "primary",
            title: evt.time ? `${evt.time} \u2014 ${evt.title}` : evt.title
          }, [evt.title]);
          evts.append(chip);
        }
        if (cellEvents.length > 3) {
          evts.append(el("span", { class: "rui-calendar-event-more" }, [
            `+${cellEvents.length - 3} more`
          ]));
        }
        dayBtn.append(evts);
      }
      dayBtn.onclick = () => {
        if (onSelectState) helpers.setState(onSelectState, iso);
        helpers.invoke(props.onSelect, iso);
      };
      grid.append(dayBtn);
    }
    root.append(grid);
    return root;
  }
};
function readFeedEntries(raw) {
  const out = [];
  for (const entry of asArray(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry;
    out.push({
      title: asString(e.title),
      description: asString(e.description),
      actor: asString(e.actor),
      avatarSrc: asString(e.avatarSrc),
      time: asString(e.time),
      icon: asString(e.icon),
      tone: asString(e.tone, "default"),
      meta: asString(e.meta)
    });
  }
  return out;
}
function renderFeed(klass, items, variant) {
  const root = el("ol", { class: klass, "data-variant": variant });
  for (const entry of items) {
    const li = el("li", { class: `${klass}-item`, "data-tone": entry.tone });
    const marker = el("span", { class: `${klass}-marker` });
    const iconNode = renderIcon(entry.icon, { className: `${klass}-icon` });
    if (iconNode) marker.append(iconNode);
    li.append(marker);
    const body = el("div", { class: `${klass}-body` });
    const head = el("div", { class: `${klass}-head` });
    if (entry.actor) head.append(el("span", { class: `${klass}-actor` }, [entry.actor]));
    head.append(el("span", { class: `${klass}-title` }, [entry.title]));
    if (entry.time) head.append(el("span", { class: `${klass}-time` }, [entry.time]));
    body.append(head);
    if (entry.description) {
      body.append(el("p", { class: `${klass}-description` }, [entry.description]));
    }
    if (entry.meta) {
      body.append(el("span", { class: `${klass}-meta` }, [entry.meta]));
    }
    li.append(body);
    root.append(li);
  }
  return root;
}
var ActivityLog = {
  name: "ActivityLog",
  description: 'Purpose-built feed of user/system activity. Each entry has `actor`, `title`, `description?`, `time?`, `icon?`, `tone?`, and optional `meta` (IP, browser, request id). Use `variant="audit"` for monospace security/admin trails. Pass items as `{actor, title, description, time, icon, tone, avatarSrc, meta}` objects.',
  props: [
    { name: "items", type: "object[]" },
    { name: "variant", type: "string", optional: true, enum: ["default", "audit"], description: "audit = monospace voice with meta column" }
  ],
  render: (_node, props) => {
    const variant = asString(props.variant, "default");
    const klass = variant === "audit" ? "rui-audit-trail" : "rui-activity-log";
    return renderFeed(klass, readFeedEntries(props.items), variant);
  }
};
var ComparisonTable = {
  name: "ComparisonTable",
  description: "Feature/spec comparison table \u2014 generic counterpart of `PricingTable`. Pass `columns` (e.g. plan/product names) and `rows` of `{label, values}` where `values` aligns 1-to-1 with `columns`. Each value can be a boolean (\u2713/\u2014), a string, or a node.",
  props: [
    { name: "columns", type: "string[]", description: "Column headers" },
    { name: "rows", type: "object[]", description: "Array of {label, values, hint?, group?} entries" },
    { name: "highlightColumn", type: "number", optional: true, description: "0-indexed column to visually emphasise" }
  ],
  render: (_node, props, helpers) => {
    const columns = asArray(props.columns).map((c) => asString(c));
    const rows = asArray(props.rows).map((entry) => {
      const r = entry ?? {};
      return {
        label: asString(r.label),
        values: asArray(r.values),
        hint: asString(r.hint),
        group: asString(r.group)
      };
    });
    const highlightIdx = Math.floor(asNumber(props.highlightColumn, -1));
    const root = el("div", { class: "rui-comparison-table" });
    const table = el("table");
    const thead = el("thead");
    const headRow = el("tr");
    headRow.append(el("th", { scope: "col", class: "rui-comparison-table-feature" }, ["Feature"]));
    columns.forEach((col, c) => {
      headRow.append(el("th", {
        scope: "col",
        "data-highlight": c === highlightIdx ? "true" : null
      }, [col]));
    });
    thead.append(headRow);
    table.append(thead);
    const tbody = el("tbody");
    let currentGroup = "";
    for (const row of rows) {
      if (row.group && row.group !== currentGroup) {
        currentGroup = row.group;
        const groupRow = el("tr", { class: "rui-comparison-table-group" });
        groupRow.append(el("td", { colspan: String(columns.length + 1) }, [row.group]));
        tbody.append(groupRow);
      }
      const tr = el("tr");
      const labelCell = el("td", { class: "rui-comparison-table-feature" });
      labelCell.append(el("div", { class: "rui-comparison-table-feature-label" }, [row.label]));
      if (row.hint) labelCell.append(el("div", { class: "rui-comparison-table-feature-hint" }, [row.hint]));
      tr.append(labelCell);
      for (let c = 0; c < columns.length; c += 1) {
        const value = row.values[c];
        const td = el("td", { "data-highlight": c === highlightIdx ? "true" : null });
        if (value === true) {
          const icon = renderIcon("circle-check", { className: "rui-comparison-yes" });
          if (icon) td.append(icon);
          else td.textContent = "\u2713";
        } else if (value === false || value === null || value === void 0) {
          td.append(el("span", { class: "rui-comparison-no" }, ["\u2014"]));
        } else if (value && typeof value === "object" && value.__kind === "Component") {
          td.append(helpers.renderNode(value));
        } else {
          td.textContent = asString(value);
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    root.append(table);
    return root;
  }
};
var InfiniteList = {
  name: "InfiniteList",
  description: "Vertical list that fires `onLoadMore` when the user scrolls near the bottom. Pass already-rendered child nodes as `items`; wire `onLoadMore` to an `action` that awaits a `$mutation` or `$query` (e.g. `await loadMore.invoke()`) and appends to the bound state. Use `loading=true` to show the spinner row, `hasMore=false` to suppress further loads.",
  props: [
    { name: "items", type: "Node[]", description: "Already-rendered child nodes" },
    { name: "onLoadMore", type: "callable", optional: true, description: "Callable fired when the sentinel scrolls into view" },
    { name: "loading", type: "boolean", optional: true },
    { name: "hasMore", type: "boolean", optional: true, description: "Default true \u2014 set false to hide the sentinel" },
    { name: "loaderLabel", type: "string", optional: true, description: "Label rendered while loading (default `Loading\u2026`)" }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-infinite-list" });
    const list = el("div", { class: "rui-infinite-list-body" });
    for (const child of asArray(props.items)) list.append(helpers.renderNode(child));
    root.append(list);
    const hasMore = props.hasMore === void 0 ? true : asBoolean(props.hasMore);
    const loading = asBoolean(props.loading);
    if (hasMore) {
      const sentinel = el("div", { class: "rui-infinite-list-sentinel" });
      if (loading) {
        const spin = renderIcon("spinner", { className: "rui-infinite-list-spin" });
        if (spin) sentinel.append(spin);
        sentinel.append(el("span", {}, [asString(props.loaderLabel, "Loading\u2026")]));
      } else if (typeof props.onLoadMore === "function") {
        const btn = el("button", {
          type: "button",
          class: "rui-infinite-list-load-more"
        }, ["Load more"]);
        btn.onclick = () => helpers.invoke(props.onLoadMore);
        sentinel.append(btn);
      }
      root.append(sentinel);
      if (!loading && typeof props.onLoadMore === "function" && typeof IntersectionObserver !== "undefined") {
        const callback = props.onLoadMore;
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              helpers.invoke(callback);
              break;
            }
          }
        });
        observer.observe(sentinel);
        helpers.registerDisposer(() => observer.disconnect(), "infinite-observer");
      }
    }
    return root;
  }
};

// ../../src/library/components/media.ts
var SAFE_MEDIA_SCHEMES = /^(https?:|blob:|data:(audio|video)\/)/i;
function sanitiseMediaSrc(raw) {
  const value = asString(raw).trim();
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith(".")) return value;
  if (value.startsWith("//")) return "";
  return SAFE_MEDIA_SCHEMES.test(value) ? value : "";
}
var VideoPlayer = {
  name: "VideoPlayer",
  description: "Themed native `<video>` wrapper. Pass a `src` URL (or `sources` array for multi-codec fallback) and optional `poster`. Standard controls are visible by default; pass `autoplay`, `loop`, `muted`, or `controls=false` to override. Use for product demos, tutorials, and any inline video.",
  props: [
    { name: "src", type: "string", optional: true, description: "Video URL (mp4 / webm / etc.)" },
    { name: "sources", type: "object[]", optional: true, description: "Array of {src, type} entries for multi-codec fallback" },
    { name: "poster", type: "string", optional: true, description: "Thumbnail image URL shown before playback" },
    { name: "caption", type: "string", optional: true },
    { name: "controls", type: "boolean", optional: true, description: "Show native controls (default true)" },
    { name: "autoplay", type: "boolean", optional: true },
    { name: "loop", type: "boolean", optional: true },
    { name: "muted", type: "boolean", optional: true },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio (default 16:9)" }
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-video-player" });
    const ratio = parseRatio2(asString(props.ratio, "16:9"));
    const playerWrap = el("div", {
      class: "rui-video-player-frame",
      style: `aspect-ratio:${ratio};`
    });
    const showControls = props.controls === void 0 ? true : asBoolean(props.controls);
    const video = el("video", {
      class: "rui-video-player-video",
      controls: showControls ? "" : null,
      autoplay: asBoolean(props.autoplay) ? "" : null,
      loop: asBoolean(props.loop) ? "" : null,
      muted: asBoolean(props.muted) ? "" : null,
      poster: sanitiseImageSrc(props.poster) || null,
      playsinline: "",
      preload: "metadata"
    });
    const sources = asArray(props.sources);
    if (sources.length > 0) {
      for (const raw of sources) {
        if (!raw || typeof raw !== "object") continue;
        const s = raw;
        const safeSrc = sanitiseMediaSrc(s.src);
        if (!safeSrc) continue;
        video.append(el("source", { src: safeSrc, type: asString(s.type) || null }));
      }
    } else {
      const safeSrc = sanitiseMediaSrc(props.src);
      if (safeSrc) video.setAttribute("src", safeSrc);
    }
    playerWrap.append(video);
    root.append(playerWrap);
    const caption = asString(props.caption);
    if (caption) root.append(el("figcaption", { class: "rui-video-player-caption" }, [caption]));
    return root;
  }
};
var AudioPlayer = {
  name: "AudioPlayer",
  description: "Themed native `<audio>` wrapper with a title, optional artist, and standard transport controls. Pass `src` (or `sources`) plus a `title` so the bar still looks like a player when the controls bar is hidden. Use for podcasts, voice notes, and demo audio.",
  props: [
    { name: "src", type: "string", optional: true, description: "Audio URL (mp3 / ogg / wav / etc.)" },
    { name: "sources", type: "object[]", optional: true, description: "Array of {src, type} entries for multi-codec fallback" },
    { name: "title", type: "string", optional: true },
    { name: "artist", type: "string", optional: true },
    { name: "controls", type: "boolean", optional: true, description: "Show native controls (default true)" },
    { name: "autoplay", type: "boolean", optional: true },
    { name: "loop", type: "boolean", optional: true },
    { name: "icon", type: "string", optional: true, description: "Leading icon (default `music`)" }
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-audio-player" });
    const meta = el("div", { class: "rui-audio-player-meta" });
    const iconNode = renderIcon(asString(props.icon, "music"), { className: "rui-audio-player-icon" });
    if (iconNode) meta.append(iconNode);
    const text = el("div", { class: "rui-audio-player-text" });
    const title = asString(props.title);
    if (title) text.append(el("div", { class: "rui-audio-player-title" }, [title]));
    const artist = asString(props.artist);
    if (artist) text.append(el("div", { class: "rui-audio-player-artist" }, [artist]));
    meta.append(text);
    root.append(meta);
    const showControls = props.controls === void 0 ? true : asBoolean(props.controls);
    const audio = el("audio", {
      class: "rui-audio-player-audio",
      controls: showControls ? "" : null,
      autoplay: asBoolean(props.autoplay) ? "" : null,
      loop: asBoolean(props.loop) ? "" : null,
      preload: "metadata"
    });
    const sources = asArray(props.sources);
    if (sources.length > 0) {
      for (const raw of sources) {
        if (!raw || typeof raw !== "object") continue;
        const s = raw;
        const safeSrc = sanitiseMediaSrc(s.src);
        if (!safeSrc) continue;
        audio.append(el("source", { src: safeSrc, type: asString(s.type) || null }));
      }
    } else {
      const safeSrc = sanitiseMediaSrc(props.src);
      if (safeSrc) audio.setAttribute("src", safeSrc);
    }
    root.append(audio);
    return root;
  }
};
function renderCarouselSlide(item, helpers) {
  if (item === null || item === void 0) return null;
  if (typeof item === "object" && item.__kind === "Component") {
    return helpers.renderNode(item);
  }
  if (typeof item === "string") {
    const safeSrc = sanitiseImageSrc(item);
    if (!safeSrc) return null;
    return el("img", { src: safeSrc, alt: "", loading: "lazy", class: "rui-carousel-image" });
  }
  if (typeof item === "object") {
    const obj = item;
    const safeSrc = sanitiseImageSrc(obj.src);
    if (safeSrc) {
      const wrap = el("figure", { class: "rui-carousel-figure" });
      wrap.append(el("img", {
        src: safeSrc,
        alt: asString(obj.alt ?? obj.caption ?? obj.title),
        loading: "lazy",
        class: "rui-carousel-image"
      }));
      const captionText = asString(obj.caption ?? obj.title);
      if (captionText) {
        wrap.append(el("figcaption", { class: "rui-carousel-caption" }, [captionText]));
      }
      return wrap;
    }
  }
  return helpers.renderNode(item);
}
var Carousel = {
  name: "Carousel",
  description: "Horizontal slider with prev/next buttons and dot navigation. Each child slide takes full width. Slides may be Component nodes (Image, Card, MediaCard, \u2026), URL strings, or plain `{src, alt, caption?}` image objects \u2014 bare image objects are auto-wrapped into a captioned figure. Use for image galleries, onboarding carousels, hero banners, and product image strips. The active slide is preserved across re-renders via instance state.",
  props: [
    { name: "items", type: "Node[]", description: "Slide nodes, image URLs, or {src, alt, caption?} objects" },
    { name: "activeIndex", type: "number", optional: true, description: "0-indexed initial slide (default 0)" },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio of the frame (default `16:9`)" },
    { name: "showDots", type: "boolean", optional: true, description: "Show indicator dots (default true)" },
    { name: "showArrows", type: "boolean", optional: true, description: "Show prev/next arrows (default true)" }
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const count = items.length;
    const defaultIdx = Math.max(0, Math.min(Math.max(count - 1, 0), Math.floor(asNumber(props.activeIndex, 0))));
    const slot = helpers.useInstanceState("active", defaultIdx);
    let active = slot.get();
    if (active >= count) {
      active = 0;
      slot.set(active);
    }
    const showDots = props.showDots === void 0 ? true : asBoolean(props.showDots);
    const showArrows = props.showArrows === void 0 ? true : asBoolean(props.showArrows);
    const ratio = parseRatio2(asString(props.ratio, "16:9"));
    const root = el("div", { class: "rui-carousel" });
    const frame = el("div", {
      class: "rui-carousel-frame",
      style: `aspect-ratio:${ratio};`
    });
    const track = el("div", {
      class: "rui-carousel-track",
      style: `transform:translateX(${active * -100}%);`
    });
    items.forEach((item) => {
      const slide = el("div", { class: "rui-carousel-slide" });
      const rendered = renderCarouselSlide(item, helpers);
      if (rendered) slide.append(rendered);
      track.append(slide);
    });
    frame.append(track);
    const move = (origin, next) => {
      const clamped = (next % count + count) % count;
      slot.set(clamped);
      const liveRoot = origin.closest(".rui-carousel");
      const liveTrack = liveRoot?.querySelector(".rui-carousel-track");
      if (liveTrack) liveTrack.style.transform = `translateX(${clamped * -100}%)`;
      liveRoot?.querySelectorAll(".rui-carousel-dot").forEach((dot, i) => {
        dot.setAttribute("data-active", i === clamped ? "true" : "false");
      });
    };
    if (showArrows && count > 1) {
      const prev = el("button", {
        type: "button",
        class: "rui-carousel-arrow",
        "data-direction": "prev",
        "aria-label": "Previous slide"
      });
      const prevIcon = renderIcon("chevron-left");
      if (prevIcon) prev.append(prevIcon);
      const next = el("button", {
        type: "button",
        class: "rui-carousel-arrow",
        "data-direction": "next",
        "aria-label": "Next slide"
      });
      const nextIcon = renderIcon("chevron-right");
      if (nextIcon) next.append(nextIcon);
      prev.onclick = (event) => move(event.currentTarget, slot.get() - 1);
      next.onclick = (event) => move(event.currentTarget, slot.get() + 1);
      frame.append(prev, next);
    }
    root.append(frame);
    if (showDots && count > 1) {
      const dots = el("div", { class: "rui-carousel-dots" });
      items.forEach((_item, i) => {
        const dot = el("button", {
          type: "button",
          class: "rui-carousel-dot",
          "data-active": i === active ? "true" : "false",
          "aria-label": `Go to slide ${i + 1}`
        });
        dot.onclick = (event) => move(event.currentTarget, i);
        dots.append(dot);
      });
      root.append(dots);
    }
    return root;
  }
};
var Gallery = {
  name: "Gallery",
  description: "Responsive image grid. Pass items as plain URL strings, `{src, alt, caption?}` objects, or `Image(...)` nodes. When `onSelect` is provided each tile becomes a button; bind it through an Action that opens a `Lightbox`.",
  props: [
    { name: "items", type: "any[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default auto)" },
    { name: "ratio", type: "string", optional: true, description: "Per-tile aspect ratio (default `1:1`)" },
    { name: "onSelect", type: "callable", optional: true, description: "Callable fired when a tile is clicked" }
  ],
  render: (_node, props, helpers) => {
    const items = asArray(props.items);
    const columns = Math.max(1, Math.min(6, Number(props.columns ?? "auto")));
    const ratio = parseRatio2(asString(props.ratio, "1:1"));
    const root = el("div", {
      class: "rui-gallery",
      "data-columns": columns > 0 ? String(columns) : null
    });
    items.forEach((raw, i) => {
      const { src, alt, caption } = extractGalleryItem(raw);
      const safeSrc = sanitiseImageSrc(src);
      const clickable = typeof props.onSelect === "function";
      const tile = el(clickable ? "button" : "figure", {
        type: clickable ? "button" : null,
        class: "rui-gallery-tile",
        style: `aspect-ratio:${ratio};`,
        "data-index": String(i)
      });
      if (safeSrc) {
        tile.append(el("img", { src: safeSrc, alt, loading: "lazy" }));
      } else {
        const placeholder = renderIcon("image", { className: "rui-gallery-placeholder" });
        if (placeholder) tile.append(placeholder);
      }
      if (caption) {
        tile.append(el("span", { class: "rui-gallery-caption" }, [caption]));
      }
      if (clickable) {
        tile.onclick = () => helpers.invoke(props.onSelect, i, raw);
      }
      root.append(tile);
    });
    return root;
  }
};
function extractGalleryItem(raw) {
  if (typeof raw === "string") return { src: raw, alt: "", caption: "" };
  if (raw && typeof raw === "object") {
    const r = raw;
    if (r.__kind === "Component" && Array.isArray(r.args)) {
      return {
        src: asString(r.args[0]),
        alt: asString(r.args[1]),
        caption: asString(r.args[2])
      };
    }
    return {
      src: asString(r.src),
      alt: asString(r.alt),
      caption: asString(r.caption)
    };
  }
  return { src: "", alt: "", caption: "" };
}
var Lightbox = {
  name: "Lightbox",
  description: "Image overlay. When you bind a `$variable` to `open` you control it explicitly; without one, Lightbox renders a clickable thumbnail of the current image that opens the overlay on click (and uses internal state for next/prev). Pass `items` (string URLs or `{src, alt, caption?}` objects). Clicking the backdrop or \xD7 closes; arrows step through the array.",
  props: [
    { name: "items", type: "any[]" },
    { name: "open", type: "boolean", optional: true, description: "Open/closed; bind a $variable to control externally" },
    { name: "index", type: "number", optional: true, description: "0-indexed current image; typically a $variable" }
  ],
  render: (node, props, helpers) => {
    const items = asArray(props.items).map((raw) => extractGalleryItem(raw)).filter((entry) => sanitiseImageSrc(entry.src) !== "");
    const total = items.length;
    const indexStateName = node.argMeta?.[2]?.stateRef;
    const openStateName = node.argMeta?.[1]?.stateRef;
    const internalOpen = helpers.useInstanceState("open", false);
    const internalIndex = helpers.useInstanceState("index", 0);
    const isOpen = openStateName ? asBoolean(props.open) : internalOpen.get();
    const rawIndex = indexStateName ? Math.floor(asNumber(props.index, 0)) : internalIndex.get();
    const idx = total === 0 ? 0 : (rawIndex % total + total) % total;
    const setOpen = (next) => {
      if (openStateName) helpers.setState(openStateName, next);
      else internalOpen.set(next);
    };
    const setIndex = (next) => {
      if (indexStateName) helpers.setState(indexStateName, next);
      else internalIndex.set(next);
    };
    const close = () => setOpen(false);
    const move = (delta) => {
      if (total === 0) return;
      setIndex(((idx + delta) % total + total) % total);
    };
    const root = el("div", { class: "rui-lightbox-root" });
    if (!openStateName && total > 0) {
      const current2 = items[idx];
      const thumb = el("button", {
        type: "button",
        class: "rui-lightbox-thumb",
        "aria-label": current2?.alt || "Open image"
      });
      if (current2) {
        const safeThumb = sanitiseImageSrc(current2.src);
        if (safeThumb) thumb.append(el("img", { src: safeThumb, alt: current2.alt, loading: "lazy" }));
      }
      thumb.onclick = (event) => {
        event.stopPropagation();
        setOpen(true);
      };
      root.append(thumb);
    }
    const overlay = el("div", {
      class: "rui-lightbox-overlay",
      "data-open": isOpen ? "true" : "false"
    });
    root.append(overlay);
    if (!isOpen || total === 0) return root;
    const current = items[idx];
    if (!current) return root;
    const safeSrc = sanitiseImageSrc(current.src);
    overlay.onclick = (event) => {
      if (event.target === overlay) close();
    };
    const dialog = el("div", { class: "rui-lightbox", role: "dialog", "aria-modal": "true" });
    const closeBtn = el("button", {
      type: "button",
      class: "rui-lightbox-close",
      "aria-label": "Close lightbox"
    }, ["\xD7"]);
    closeBtn.onclick = close;
    dialog.append(closeBtn);
    if (total > 1) {
      const prev = el("button", {
        type: "button",
        class: "rui-lightbox-arrow",
        "data-direction": "prev",
        "aria-label": "Previous image"
      });
      const prevIcon = renderIcon("chevron-left");
      if (prevIcon) prev.append(prevIcon);
      prev.onclick = () => move(-1);
      const next = el("button", {
        type: "button",
        class: "rui-lightbox-arrow",
        "data-direction": "next",
        "aria-label": "Next image"
      });
      const nextIcon = renderIcon("chevron-right");
      if (nextIcon) next.append(nextIcon);
      next.onclick = () => move(1);
      dialog.append(prev, next);
    }
    const imageWrap = el("div", { class: "rui-lightbox-image-wrap" });
    if (safeSrc) {
      imageWrap.append(el("img", { src: safeSrc, alt: current.alt }));
    }
    dialog.append(imageWrap);
    if (current.caption) {
      dialog.append(el("div", { class: "rui-lightbox-caption" }, [current.caption]));
    }
    if (total > 1) {
      dialog.append(el("div", { class: "rui-lightbox-counter" }, [`${idx + 1} / ${total}`]));
    }
    overlay.append(dialog);
    return root;
  }
};
function parseLatLng(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw;
    const lat = asNumber(r.lat ?? r.latitude, NaN);
    const lng = asNumber(r.lng ?? r.longitude, NaN);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (Array.isArray(raw) && raw.length >= 2) {
    const lat = asNumber(raw[0], NaN);
    const lng = asNumber(raw[1], NaN);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (typeof raw === "string") {
    const parts = raw.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return { lat: parts[0], lng: parts[1] };
    }
  }
  return null;
}
var Map2 = {
  name: "Map",
  description: "Static map view centered on a lat/lng coordinate. Renders an OpenStreetMap embed inside an `<iframe>` (no external JS, no API key). Pass `lat` and `lng` as bare numbers; `zoom` controls the level (1\u201318, default 13). Optional `markers` array adds map pins (rendered as a labelled list alongside the map). Use for store locators, address cards, itinerary previews.",
  props: [
    { name: "lat", type: "number", description: "Latitude of the map center" },
    { name: "lng", type: "number", description: "Longitude of the map center" },
    { name: "zoom", type: "number", optional: true, description: "1\u201318 (default 13)" },
    { name: "markers", type: "object[]", optional: true, description: "Array of {lat, lng, label?} markers (informational; rendered alongside the map)" },
    { name: "height", type: "string", optional: true, description: "CSS height (default 320px)" },
    { name: "caption", type: "string", optional: true }
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-map" });
    const height = sanitiseCssLength(props.height, "320px");
    const frameWrap = el("div", { class: "rui-map-frame", style: `height:${height};` });
    const lat = asNumber(props.lat, NaN);
    const lng = asNumber(props.lng, NaN);
    const center = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    if (!center) {
      frameWrap.append(el("div", { class: "rui-map-empty" }, [
        "Pass lat & lng (numbers) to render the map."
      ]));
      root.append(frameWrap);
      const caption2 = asString(props.caption);
      if (caption2) root.append(el("figcaption", { class: "rui-map-caption" }, [caption2]));
      return root;
    }
    const zoom = Math.max(1, Math.min(18, Math.floor(asNumber(props.zoom, 13))));
    const span = 1 / Math.pow(2, zoom - 8);
    const bbox = [
      center.lng - span,
      center.lat - span / 2,
      center.lng + span,
      center.lat + span / 2
    ].join(",");
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.lat},${center.lng}`;
    const iframe = el("iframe", {
      class: "rui-map-iframe",
      src: url,
      loading: "lazy",
      title: "Map view",
      referrerpolicy: "no-referrer"
    });
    frameWrap.append(iframe);
    root.append(frameWrap);
    const markers = asArray(props.markers).map((raw) => {
      const pin = parseLatLng(raw);
      const label = raw && typeof raw === "object" ? asString(raw.label) : "";
      return pin ? { ...pin, label } : null;
    }).filter((p) => p !== null);
    if (markers.length > 0) {
      const list = el("ul", { class: "rui-map-markers" });
      for (const m of markers) {
        const li = el("li", { class: "rui-map-marker" });
        const pinIcon = renderIcon("location-dot", { className: "rui-map-marker-icon" });
        if (pinIcon) li.append(pinIcon);
        li.append(el("span", { class: "rui-map-marker-label" }, [
          m.label || `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`
        ]));
        list.append(li);
      }
      root.append(list);
    }
    const caption = asString(props.caption);
    if (caption) root.append(el("figcaption", { class: "rui-map-caption" }, [caption]));
    return root;
  }
};
function parseRatio2(input) {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}

// ../../src/library/components/editors.ts
var DEFAULT_RTE_TOOLS = [
  { command: "bold", icon: "bold", label: "Bold" },
  { command: "italic", icon: "italic", label: "Italic" },
  { command: "underline", icon: "underline", label: "Underline" },
  { command: "strikeThrough", icon: "strikethrough", label: "Strikethrough" },
  { command: "formatBlock", icon: "heading", label: "Heading", block: "h2" },
  { command: "formatBlock", icon: "quote-left", label: "Quote", block: "blockquote" },
  { command: "insertUnorderedList", icon: "list-ul", label: "Bullet list" },
  { command: "insertOrderedList", icon: "list-ol", label: "Numbered list" },
  { command: "createLink", icon: "link", label: "Link" }
];
var RichTextEditor = {
  name: "RichTextEditor",
  description: "Rich-text WYSIWYG editor for CMS, email, and comment surfaces. Renders a small toolbar (bold / italic / underline / strikethrough / headings / lists / quote / link) above a `contenteditable` region. Pass `$variable` as `value` for two-way binding \u2014 the HTML body is written back to state on every edit. Provide `placeholder` for the empty-state prompt.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound HTML body (typically $variable)" },
    { name: "placeholder", type: "string", optional: true, description: "Empty-state prompt" },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height for the editor area (default 160px)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current HTML on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const placeholder = asString(props.placeholder, "Start writing\u2026");
    const disabled = asBoolean(props.disabled);
    const root = el("div", {
      class: "rui-rich-text",
      "data-disabled": disabled ? "true" : "false"
    });
    const toolbar = el("div", { class: "rui-rich-text-toolbar", role: "toolbar" });
    for (const tool of DEFAULT_RTE_TOOLS) {
      const btn = el("button", {
        type: "button",
        class: "rui-rich-text-tool",
        "data-command": tool.command,
        "data-block": tool.block ?? null,
        "aria-label": tool.label,
        title: tool.label,
        disabled: disabled ? "" : null
      });
      const iconNode = renderIcon(tool.icon);
      if (iconNode) btn.append(iconNode);
      btn.onmousedown = (event) => event.preventDefault();
      btn.onclick = (event) => {
        const live = event.currentTarget.closest(".rui-rich-text");
        const editor2 = live?.querySelector(".rui-rich-text-content");
        if (!editor2) return;
        editor2.focus();
        try {
          if (tool.command === "createLink") {
            const url = window.prompt("URL");
            if (url) document.execCommand("createLink", false, url);
          } else if (tool.command === "formatBlock" && tool.block) {
            document.execCommand("formatBlock", false, tool.block);
          } else {
            document.execCommand(tool.command, false);
          }
        } catch {
        }
        editor2.dispatchEvent(new Event("input", { bubbles: true }));
      };
      toolbar.append(btn);
    }
    root.append(toolbar);
    const initial = asString(props.value) || "";
    const isEmpty = (html) => {
      const text = html.replace(/<br\s*\/?>(?=\s*$)/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
      return text.length === 0;
    };
    const editor = el("div", {
      class: "rui-rich-text-content",
      id,
      contenteditable: disabled ? "false" : "true",
      role: "textbox",
      "aria-multiline": "true",
      "aria-placeholder": placeholder,
      "data-placeholder": placeholder,
      "data-empty": isEmpty(initial) ? "true" : "false",
      style: `min-height:${asString(props.minHeight, "160px")};`,
      html: initial
    });
    const refreshEmpty = (target) => {
      target.setAttribute("data-empty", isEmpty(target.innerHTML) ? "true" : "false");
    };
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !disabled) {
      helpers.bindState(editor, stateName, {
        event: "input",
        // Sync the placeholder state on every keystroke, alongside the
        // state write — keeps both behaviours in the single property-based
        // `oninput` slot so the morph reconciler transfers them as a unit.
        getValue: (n) => {
          const target = n;
          refreshEmpty(target);
          return target.innerHTML;
        }
      });
    } else {
      editor.oninput = (event) => {
        const target = event.currentTarget ?? event.target;
        refreshEmpty(target);
      };
    }
    editor.onblur = (event) => {
      const target = event.currentTarget ?? event.target;
      refreshEmpty(target);
    };
    attachOnChange(editor, props.onChange, helpers, {
      event: "input",
      getValue: (n) => n.innerHTML
    });
    root.append(editor);
    return root;
  }
};
var CODE_LANGUAGES = ["text", "javascript", "typescript", "json", "html", "css", "bash", "python", "sql", "markdown"];
var CodeEditor = {
  name: "CodeEditor",
  description: "Lightweight, dependency-free code editor. Pairs a styled textarea with a synchronised line-number gutter \u2014 no syntax highlighting, but the editor stays a single rendered node so it works inside Shadow DOM. Use for dev tooling, snippet editing, prompt playgrounds. Pass a `$variable` as `value` for two-way binding. For read-only rendering with highlights prefer `CodeBlock`.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound source text (typically $variable)" },
    { name: "language", type: "string", optional: true, enum: CODE_LANGUAGES, description: "Language label shown on the header (default `text`)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "minHeight", type: "string", optional: true, description: "CSS min-height for the editor area (default 200px)" },
    { name: "tabSize", type: "number", optional: true, description: "Spaces per Tab (default 2)" },
    { name: "showGutter", type: "boolean", optional: true, description: "Show line-number gutter (default true)" },
    { name: "readonly", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current source on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const value = asString(props.value);
    const language = asString(props.language, "text");
    const showGutter = props.showGutter === void 0 ? true : asBoolean(props.showGutter);
    const tabSize = Math.max(1, Math.min(8, Math.floor(asNumber(props.tabSize, 2))));
    const readonly = asBoolean(props.readonly);
    const minHeight = asString(props.minHeight, "200px");
    const root = el("div", {
      class: "rui-code-editor",
      "data-language": language,
      "data-gutter": showGutter ? "true" : "false"
    });
    const head = el("div", { class: "rui-code-editor-head" });
    head.append(el("span", { class: "rui-code-editor-language" }, [language]));
    root.append(head);
    const body = el("div", {
      class: "rui-code-editor-body",
      style: `min-height:${minHeight};`
    });
    const gutter = el("div", { class: "rui-code-editor-gutter", "aria-hidden": "true" });
    const renderGutter = (text) => {
      gutter.replaceChildren();
      const lines = text.split(/\r?\n/);
      const total = Math.max(1, lines.length);
      for (let i = 1; i <= total; i += 1) {
        gutter.append(el("span", { class: "rui-code-editor-line" }, [String(i)]));
      }
    };
    if (showGutter) {
      renderGutter(value);
      body.append(gutter);
    }
    const textarea = el("textarea", {
      class: "rui-code-editor-textarea",
      id,
      name: id,
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      placeholder: asString(props.placeholder),
      readonly: readonly ? "" : null,
      style: `tab-size:${tabSize};-moz-tab-size:${tabSize};`
    });
    textarea.value = value;
    textarea.oninput = (event) => {
      const target = event.currentTarget;
      if (!showGutter) return;
      const liveRoot = target.closest(".rui-code-editor");
      const liveGutter = liveRoot?.querySelector(".rui-code-editor-gutter");
      if (!liveGutter) return;
      liveGutter.replaceChildren();
      const lines = target.value.split(/\r?\n/);
      const total = Math.max(1, lines.length);
      for (let i = 1; i <= total; i += 1) {
        liveGutter.append(el("span", { class: "rui-code-editor-line" }, [String(i)]));
      }
    };
    textarea.onkeydown = (event) => {
      const e = event;
      if (e.key !== "Tab") return;
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const indent = " ".repeat(tabSize);
      target.value = target.value.slice(0, start) + indent + target.value.slice(end);
      target.selectionStart = target.selectionEnd = start + indent.length;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !readonly) {
      helpers.bindState(textarea, stateName, {
        event: "input",
        getValue: (n) => n.value
      });
    }
    if (!readonly) {
      attachOnChange(textarea, props.onChange, helpers, {
        event: "input",
        getValue: (n) => n.value
      });
    }
    body.append(textarea);
    root.append(body);
    return root;
  }
};
function extractContextItem(raw) {
  if (!raw) return null;
  if (typeof raw === "object") {
    const node = raw;
    if (node.__kind === "Component" && node.name === "MenuItem" && Array.isArray(node.args)) {
      const args = node.args;
      return {
        label: asString(args[0]),
        action: args[1],
        icon: asString(args[2]),
        shortcut: asString(args[3]),
        variant: asString(args[4], "default"),
        disabled: asBoolean(args[5]),
        separator: false
      };
    }
    if (node.__kind === "Component" && node.name === "MenuSeparator") {
      return { label: "", action: null, icon: "", shortcut: "", variant: "default", disabled: false, separator: true };
    }
    const r = raw;
    if (r.separator) {
      return { label: "", action: null, icon: "", shortcut: "", variant: "default", disabled: false, separator: true };
    }
    return {
      label: asString(r.label),
      action: r.action,
      icon: asString(r.icon),
      shortcut: asString(r.shortcut),
      variant: asString(r.variant, "default"),
      disabled: asBoolean(r.disabled),
      separator: false
    };
  }
  return null;
}
var ContextMenu = {
  name: "ContextMenu",
  description: "Right-click (or long-press) menu that attaches to a child node. Wraps `target` and shows the menu at the pointer when the user right-clicks anywhere inside it. Items are `MenuItem(...)` nodes, `MenuSeparator()` entries, or `{label, action, icon?, shortcut?, variant?, disabled?, separator?}` objects. Use on table rows, tree nodes, kanban cards, file browser entries.",
  props: [
    { name: "target", type: "Node", description: "Child node the menu is bound to" },
    { name: "items", type: "any[]", description: "MenuItem nodes or {label, action} objects" },
    { name: "label", type: "string", optional: true, description: "ARIA label for the menu" }
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-context-menu" });
    const wrap = el("div", { class: "rui-context-menu-target" });
    wrap.append(helpers.renderNode(props.target));
    root.append(wrap);
    const menu = el("div", {
      class: "rui-context-menu-pop",
      role: "menu",
      "aria-label": asString(props.label) || null,
      "data-open": "false"
    });
    const items = asArray(props.items).map(extractContextItem).filter((i) => i !== null);
    for (const item of items) {
      if (item.separator) {
        menu.append(el("div", { class: "rui-menu-separator", role: "separator" }));
        continue;
      }
      const btn = el("button", {
        type: "button",
        class: "rui-menu-item",
        role: "menuitem",
        "data-variant": item.variant,
        disabled: item.disabled ? "" : null
      });
      const iconNode = renderIcon(item.icon, { className: "rui-menu-item-icon" });
      if (iconNode) btn.append(iconNode);
      btn.append(el("span", { class: "rui-menu-item-label" }, [item.label]));
      if (item.shortcut) btn.append(el("span", { class: "rui-menu-item-shortcut" }, [item.shortcut]));
      if (!item.disabled) {
        btn.onclick = () => {
          helpers.invoke(item.action);
          menu.setAttribute("data-open", "false");
        };
      }
      menu.append(btn);
    }
    root.append(menu);
    const closeAll = () => menu.setAttribute("data-open", "false");
    const open = (clientX, clientY) => {
      const liveRoot = wrap.isConnected ? wrap.closest(".rui-context-menu") : null;
      const liveMenu = liveRoot?.querySelector(".rui-context-menu-pop") ?? menu;
      const rect = liveRoot?.getBoundingClientRect();
      const x = rect ? clientX - rect.left : clientX;
      const y = rect ? clientY - rect.top : clientY;
      liveMenu.style.left = `${x}px`;
      liveMenu.style.top = `${y}px`;
      liveMenu.setAttribute("data-open", "true");
      const dismiss = (event) => {
        if (event.target && liveMenu.contains(event.target)) return;
        liveMenu.setAttribute("data-open", "false");
        document.removeEventListener("click", dismiss, true);
        document.removeEventListener("contextmenu", dismiss, true);
      };
      setTimeout(() => {
        document.addEventListener("click", dismiss, true);
        document.addEventListener("contextmenu", dismiss, true);
      }, 0);
    };
    wrap.oncontextmenu = (event) => {
      event.preventDefault();
      open(event.clientX, event.clientY);
    };
    wrap.onkeydown = (event) => {
      const e = event;
      if (e.key === "ContextMenu" || e.shiftKey && e.key === "F10") {
        e.preventDefault();
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        open(rect.left, rect.top + rect.height);
      }
      if (e.key === "Escape") closeAll();
    };
    return root;
  }
};
var DEFAULT_SWATCHES = [
  "#0f172a",
  "#334155",
  "#64748b",
  "#94a3b8",
  "#ef4444",
  "#f59e0b",
  "#facc15",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6"
];
function normaliseHex(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6,8}$/.test(hex)) return "";
  return `#${hex.toLowerCase().slice(0, 6)}`;
}
var ColorPicker = {
  name: "ColorPicker",
  description: 'Hex / RGB color form control with preset swatches. Pairs a native `<input type="color">` chip with a hex text input and a row of preset swatches. Pass a `$variable` as `value` (hex string, e.g. `"#6366f1"`) for two-way binding. Use for theme builders, label color pickers, and any "pick a color" surface.',
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound hex value (typically $variable)" },
    { name: "label", type: "string", optional: true },
    { name: "swatches", type: "string[]", optional: true, description: "Preset hex colors (default to a 12-color palette)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the newly-selected hex string" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const value = normaliseHex(asString(props.value)) || asString(props.value, "#000000");
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-color-picker", "data-disabled": disabled ? "true" : "false" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-color-picker-label", for: id }, [label]));
    const row = el("div", { class: "rui-color-picker-row" });
    const colorInput = el("input", {
      type: "color",
      class: "rui-color-picker-color",
      id,
      name: id,
      value: normaliseHex(value) || "#000000",
      disabled: disabled ? "" : null
    });
    const textInput = el("input", {
      type: "text",
      class: "rui-color-picker-hex",
      value,
      placeholder: "#000000",
      disabled: disabled ? "" : null,
      autocomplete: "off"
    });
    const swatchRow = el("div", { class: "rui-color-picker-swatches" });
    const swatches = asArray(props.swatches).map((c) => asString(c)).filter(Boolean);
    const palette = swatches.length > 0 ? swatches : DEFAULT_SWATCHES;
    for (const swatch of palette) {
      const safeHex = normaliseHex(swatch) || swatch;
      const btn = el("button", {
        type: "button",
        class: "rui-color-picker-swatch",
        style: `background:${safeHex}`,
        "aria-label": safeHex,
        title: safeHex,
        "data-active": safeHex.toLowerCase() === value.toLowerCase() ? "true" : "false"
      });
      btn.onclick = () => {
        colorInput.value = normaliseHex(safeHex) || colorInput.value;
        textInput.value = safeHex;
        colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      };
      swatchRow.append(btn);
    }
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName && !disabled) {
      helpers.bindState(colorInput, stateName, {
        event: "input",
        getValue: (n) => n.value
      });
      colorInput.addEventListener("input", () => {
        textInput.value = colorInput.value;
      });
      textInput.oninput = () => {
        const next = normaliseHex(textInput.value);
        if (!next) return;
        colorInput.value = next;
        colorInput.dispatchEvent(new Event("input", { bubbles: true }));
      };
    }
    if (!disabled) {
      attachOnChange(colorInput, props.onChange, helpers, {
        event: "input",
        getValue: (n) => n.value
      });
    }
    row.append(colorInput, textInput);
    root.append(row, swatchRow);
    return root;
  }
};

// ../../src/library/components/advanced-charts.ts
var PALETTE2 = [
  "var(--rui-chart-1, #6366f1)",
  "var(--rui-chart-2, #10b981)",
  "var(--rui-chart-3, #f59e0b)",
  "var(--rui-chart-4, #ef4444)",
  "var(--rui-chart-5, #06b6d4)",
  "var(--rui-chart-6, #8b5cf6)"
];
var colorAt2 = (index) => PALETTE2[index % PALETTE2.length] ?? PALETTE2[0];
function readSeries2(raw) {
  return raw.map((s, i) => {
    const node = s;
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const values = asArray(node.args?.[1]).map((v) => asNumber(v));
    return { name, values };
  });
}
function createSvg2(width, height) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "rui-chart-svg");
  svg.setAttribute("role", "img");
  return svg;
}
function svgEl2(tag, attrs, children) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (children) {
    for (const child of children) {
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}
function legend2(series) {
  const root = el("div", { class: "rui-chart-legend" });
  series.forEach((s, i) => {
    const item = el("span", { class: "rui-chart-legend-item" });
    item.append(el("span", { class: "rui-chart-legend-swatch", style: `background:${colorAt2(i)}` }));
    item.append(el("span", {}, [s.name]));
    root.append(item);
  });
  return root;
}
var Gauge = {
  name: "Gauge",
  description: "Half-doughnut gauge indicator for a single value between `min` and `max`. The inner value is auto-formatted from the value (override via `label`). Pass `caption`, `tone`, and `size` for visual treatment. Use for KPI thresholds (uptime %, score, capacity, NPS, page-speed).",
  props: [
    { name: "value", type: "number" },
    { name: "min", type: "number", optional: true, description: "Lower bound (default 0)" },
    { name: "max", type: "number", optional: true, description: "Upper bound (default 100)" },
    { name: "caption", type: "string", optional: true, description: "Small caption below the gauge" },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] },
    { name: "size", type: "string", optional: true, enum: ["sm", "md", "lg"] },
    { name: "label", type: "string", optional: true, description: "Inner label override (defaults to auto-formatted value)" }
  ],
  render: (_node, props) => {
    const min = asNumber(props.min, 0);
    const max = Math.max(min + 1, asNumber(props.max, 100));
    const value = Math.max(min, Math.min(max, asNumber(props.value, min)));
    const pct = (value - min) / (max - min);
    const tone = asString(props.tone, "primary");
    const size = asString(props.size, "md");
    const px = size === "lg" ? 220 : size === "sm" ? 140 : 180;
    const half = px / 2;
    const stroke = size === "lg" ? 18 : size === "sm" ? 10 : 14;
    const r = half - stroke;
    const root = el("div", {
      class: "rui-gauge",
      "data-tone": tone,
      "data-size": size
    });
    const svg = createSvg2(px, half + stroke + 4);
    const cx = half;
    const cy = half;
    const startX = cx - r;
    const startY = cy;
    const endX = cx + r;
    const endY = cy;
    svg.append(svgEl2("path", {
      d: `M${startX},${startY} A${r},${r} 0 0 1 ${endX},${endY}`,
      fill: "none",
      stroke: "var(--rui-color-border, #e2e8f0)",
      "stroke-width": String(stroke),
      "stroke-linecap": "round"
    }));
    if (pct > 0) {
      const angle = Math.PI * pct;
      const x = cx - r * Math.cos(angle);
      const y = cy - r * Math.sin(angle);
      svg.append(svgEl2("path", {
        d: `M${startX},${startY} A${r},${r} 0 0 1 ${x.toFixed(2)},${y.toFixed(2)}`,
        fill: "none",
        stroke: `var(--rui-color-${tone}, ${colorAt2(0)})`,
        "stroke-width": String(stroke),
        "stroke-linecap": "round",
        class: "rui-gauge-arc"
      }));
    }
    root.append(svg);
    const autoLabel = formatGaugeValue(value, min, max);
    const label = asString(props.label) || autoLabel;
    root.append(el("div", { class: "rui-gauge-value" }, [label]));
    const caption = asString(props.caption);
    if (caption) root.append(el("div", { class: "rui-gauge-caption" }, [caption]));
    return root;
  }
};
function formatGaugeValue(value, min, max) {
  const isPercentLike = min === 0 && max === 100;
  if (isPercentLike) {
    return value % 1 === 0 ? `${value}%` : `${value.toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1e3) return Math.round(value).toLocaleString();
  if (value % 1 === 0) return String(value);
  return value.toFixed(value < 10 ? 2 : 1);
}
var Heatmap = {
  name: "Heatmap",
  description: "Color-intensity matrix grid (calendar-style or correlation-style). Pass `xLabels`, `yLabels`, and a `values` array of arrays (rows \xD7 columns). Each cell's color intensity scales with the value relative to the global max. Use for activity heatmaps, schedule density, correlation matrices.",
  props: [
    { name: "xLabels", type: "string[]" },
    { name: "yLabels", type: "string[]" },
    { name: "values", type: "number[][]", description: "Matrix indexed by row (y), then column (x)" },
    { name: "title", type: "string", optional: true },
    { name: "tone", type: "string", optional: true, enum: ["primary", "success", "warning", "danger", "info"] }
  ],
  render: (_node, props) => {
    const xLabels = asArray(props.xLabels).map((l) => asString(l));
    const yLabels = asArray(props.yLabels).map((l) => asString(l));
    const valueRows = asArray(props.values).map((row) => asArray(row).map((v) => asNumber(v, 0)));
    const tone = asString(props.tone, "primary");
    const max = Math.max(1, ...valueRows.flat());
    const root = el("div", { class: "rui-heatmap", "data-tone": tone });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const tableWrap = el("div", { class: "rui-heatmap-table" });
    const headerRow = el("div", { class: "rui-heatmap-row rui-heatmap-row-header" });
    headerRow.append(el("div", { class: "rui-heatmap-cell rui-heatmap-corner" }));
    for (const x of xLabels) {
      headerRow.append(el("div", { class: "rui-heatmap-cell rui-heatmap-xlabel" }, [x]));
    }
    tableWrap.append(headerRow);
    valueRows.forEach((row, rIdx) => {
      const rowEl = el("div", { class: "rui-heatmap-row" });
      rowEl.append(el("div", { class: "rui-heatmap-cell rui-heatmap-ylabel" }, [yLabels[rIdx] ?? String(rIdx + 1)]));
      row.forEach((value, cIdx) => {
        const intensity = max > 0 ? value / max : 0;
        const cell = el("div", {
          class: "rui-heatmap-cell rui-heatmap-value",
          style: `background:color-mix(in srgb, var(--rui-color-${tone}, ${colorAt2(0)}) ${Math.round(intensity * 90 + 5)}%, transparent);`,
          title: `${xLabels[cIdx] ?? cIdx + 1} \xB7 ${yLabels[rIdx] ?? rIdx + 1}: ${value}`
        });
        cell.append(el("span", {}, [String(value)]));
        rowEl.append(cell);
      });
      tableWrap.append(rowEl);
    });
    root.append(tableWrap);
    return root;
  }
};
var RadarChart = {
  name: "RadarChart",
  description: "Polygon chart with one axis per category. Use for skill maps, scorecards, capability comparisons, and any multi-dimensional snapshot. Each Series renders as a filled polygon \u2014 overlapping is expected for comparisons.",
  props: [
    { name: "axes", type: "string[]", description: "Category labels \u2014 one per radial axis" },
    { name: "series", type: "Series[]" },
    { name: "max", type: "number", optional: true, description: "Outer ring value (default = max across series)" },
    { name: "title", type: "string", optional: true }
  ],
  render: (_node, props) => {
    const axes = asArray(props.axes).map((a) => asString(a));
    const series = readSeries2(asArray(props.series));
    const n = Math.max(axes.length, 3);
    const root = el("div", { class: "rui-chart rui-radar-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const max = Math.max(1, asNumber(props.max, series.flatMap((s) => s.values).reduce((m, v) => Math.max(m, v), 1)));
    const size = 280;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 24;
    const svg = createSvg2(size, size);
    const rings = 4;
    for (let i = 1; i <= rings; i += 1) {
      const radius = r / rings * i;
      const points = [];
      for (let j = 0; j < n; j += 1) {
        const angle = Math.PI * 2 * j / n - Math.PI / 2;
        points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
      }
      svg.append(svgEl2("polygon", {
        points: points.join(" "),
        fill: "none",
        stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))",
        "stroke-width": "1"
      }));
    }
    for (let j = 0; j < n; j += 1) {
      const angle = Math.PI * 2 * j / n - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      svg.append(svgEl2("line", {
        x1: String(cx),
        y1: String(cy),
        x2: x.toFixed(1),
        y2: y.toFixed(1),
        stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))",
        "stroke-width": "1"
      }));
      const labelX = cx + (r + 16) * Math.cos(angle);
      const labelY = cy + (r + 16) * Math.sin(angle);
      svg.append(svgEl2("text", {
        x: labelX.toFixed(1),
        y: labelY.toFixed(1),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        class: "rui-chart-label",
        "font-size": "13",
        "font-weight": "500"
      }, [axes[j] ?? ""]));
    }
    series.forEach((s, sIdx) => {
      const points = [];
      for (let j = 0; j < n; j += 1) {
        const value = s.values[j] ?? 0;
        const ratio = Math.max(0, Math.min(1, value / max));
        const angle = Math.PI * 2 * j / n - Math.PI / 2;
        const x = cx + r * ratio * Math.cos(angle);
        const y = cy + r * ratio * Math.sin(angle);
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      svg.append(svgEl2("polygon", {
        points: points.join(" "),
        fill: colorAt2(sIdx),
        "fill-opacity": "0.2",
        stroke: colorAt2(sIdx),
        "stroke-width": "2",
        "stroke-linejoin": "round"
      }));
    });
    root.append(svg);
    if (series.length > 0) root.append(legend2(series));
    return root;
  }
};
function readScatterSeries(raw) {
  return raw.map((entry, i) => {
    const node = entry;
    const name = asString(node.args?.[0], `Series ${i + 1}`);
    const points = asArray(node.args?.[1]).map((p) => {
      if (Array.isArray(p)) {
        return { x: asNumber(p[0], 0), y: asNumber(p[1], 0), label: asString(p[2]) };
      }
      if (p && typeof p === "object") {
        const r = p;
        return { x: asNumber(r.x, 0), y: asNumber(r.y, 0), label: asString(r.label) };
      }
      return { x: 0, y: 0, label: "" };
    });
    return { name, points };
  });
}
var ScatterChart = {
  name: "ScatterChart",
  description: 'XY scatter plot \u2014 one dot per data point, optionally grouped by series. Pass each `Series(name, points)` with points as `{x, y, label?}` objects or `[x, y, label?]` tuples. Use for correlations, distributions, and "price vs. rating" style charts.',
  props: [
    { name: "series", type: "Series[]" },
    { name: "xLabel", type: "string", optional: true },
    { name: "yLabel", type: "string", optional: true },
    { name: "title", type: "string", optional: true }
  ],
  render: (_node, props) => {
    const series = readScatterSeries(asArray(props.series));
    const root = el("div", { class: "rui-chart rui-scatter-chart" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    const width = 640;
    const height = 280;
    const padding = { left: 50, right: 16, top: 16, bottom: 40 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const points = series.flatMap((s) => s.points);
    if (points.length === 0) {
      root.append(el("div", { class: "rui-chart-empty" }, ["No points"]));
      return root;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const xRange = maxX - minX || 1;
    const yRange = maxY - minY || 1;
    const svg = createSvg2(width, height);
    drawHorizontalGrid(svg, padding, innerWidth, innerHeight, maxY, minY);
    svg.append(svgEl2("line", {
      x1: String(padding.left),
      y1: String(padding.top + innerHeight),
      x2: String(padding.left + innerWidth),
      y2: String(padding.top + innerHeight),
      stroke: "var(--rui-color-border, #e2e8f0)"
    }));
    series.forEach((s, sIdx) => {
      s.points.forEach((pt) => {
        const cx = padding.left + (pt.x - minX) / xRange * innerWidth;
        const cy = padding.top + innerHeight - (pt.y - minY) / yRange * innerHeight;
        const circle = svgEl2("circle", {
          cx: cx.toFixed(1),
          cy: cy.toFixed(1),
          r: "7",
          fill: colorAt2(sIdx),
          "fill-opacity": "0.8",
          stroke: "#fff",
          "stroke-width": "1.5"
        });
        circle.append(svgEl2("title", {}, [pt.label || `${pt.x}, ${pt.y}`]));
        svg.append(circle);
      });
    });
    if (asString(props.xLabel)) {
      svg.append(svgEl2("text", {
        x: String(padding.left + innerWidth / 2),
        y: String(height - 6),
        "text-anchor": "middle",
        class: "rui-chart-label",
        "font-size": "14",
        "font-weight": "500"
      }, [asString(props.xLabel)]));
    }
    if (asString(props.yLabel)) {
      const labelX = 14;
      const labelY = padding.top + innerHeight / 2;
      svg.append(svgEl2("text", {
        x: String(labelX),
        y: String(labelY),
        "text-anchor": "middle",
        transform: `rotate(-90, ${labelX}, ${labelY})`,
        class: "rui-chart-label",
        "font-size": "14",
        "font-weight": "500"
      }, [asString(props.yLabel)]));
    }
    root.append(svg);
    const seriesData = series.map((s) => ({ name: s.name, values: s.points.map((p) => p.y) }));
    if (seriesData.length > 0) root.append(legend2(seriesData));
    return root;
  }
};
var Histogram = {
  name: "Histogram",
  description: "Frequency distribution from raw numeric values. Pass `values` directly (the component bins them automatically) or pre-computed `bins` of `{label, count}` objects. Use for response-time histograms, score distributions, age buckets.",
  props: [
    { name: "values", type: "number[]", optional: true, description: "Raw observations (binned automatically)" },
    { name: "bins", type: "object[]", optional: true, description: "Pre-computed {label, count} entries (overrides `values`)" },
    { name: "binCount", type: "number", optional: true, description: "Number of bins when computing from `values` (default 10)" },
    { name: "title", type: "string", optional: true }
  ],
  render: (_node, props) => {
    let bins = [];
    if (Array.isArray(props.bins) && props.bins.length > 0) {
      bins = props.bins.map((entry) => {
        const r = entry ?? {};
        return { label: asString(r.label), count: asNumber(r.count, 0) };
      });
    } else {
      const values = asArray(props.values).map((v) => asNumber(v, NaN)).filter((n) => Number.isFinite(n));
      if (values.length > 0) {
        const binCount = Math.max(2, Math.min(50, Math.floor(asNumber(props.binCount, 10))));
        const min = Math.min(...values);
        const max2 = Math.max(...values);
        const span = max2 - min || 1;
        const step = span / binCount;
        const counts = new Array(binCount).fill(0);
        for (const v of values) {
          let idx = Math.floor((v - min) / step);
          if (idx >= binCount) idx = binCount - 1;
          if (idx < 0) idx = 0;
          counts[idx] += 1;
        }
        bins = counts.map((count, i) => {
          const a = min + i * step;
          const b = a + step;
          return { label: `${formatBinLabel(a)}\u2013${formatBinLabel(b)}`, count };
        });
      }
    }
    const root = el("div", { class: "rui-chart rui-histogram" });
    if (asString(props.title)) root.append(el("div", { class: "rui-chart-title" }, [asString(props.title)]));
    if (bins.length === 0) {
      root.append(el("div", { class: "rui-chart-empty" }, ["No data"]));
      return root;
    }
    const width = 640;
    const height = 240;
    const padding = { left: 40, right: 12, top: 16, bottom: 50 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const max = Math.max(1, ...bins.map((b) => b.count));
    const slot = innerWidth / bins.length;
    const svg = createSvg2(width, height);
    drawHorizontalGrid(svg, padding, innerWidth, innerHeight, max);
    bins.forEach((bin, i) => {
      const x = padding.left + i * slot + slot * 0.1;
      const barWidth = slot * 0.8;
      const barHeight = bin.count / max * innerHeight;
      const y = padding.top + innerHeight - barHeight;
      const rect = svgEl2("rect", {
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: barWidth.toFixed(1),
        height: barHeight.toFixed(1),
        fill: colorAt2(0),
        rx: "2"
      });
      rect.append(svgEl2("title", {}, [`${bin.label}: ${bin.count}`]));
      svg.append(rect);
      svg.append(svgEl2("text", {
        x: (x + barWidth / 2).toFixed(1),
        y: String(padding.top + innerHeight + 22),
        "text-anchor": "middle",
        class: "rui-chart-label",
        "font-size": "12"
      }, [bin.label]));
    });
    root.append(svg);
    return root;
  }
};
function formatBinLabel(value) {
  if (!Number.isFinite(value)) return "?";
  if (Math.abs(value) >= 1e3) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 10) return value.toFixed(0);
  return value.toFixed(1);
}
function drawHorizontalGrid(svg, padding, innerWidth, innerHeight, max, min = 0) {
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const ratio = i / ticks;
    const y = padding.top + innerHeight - ratio * innerHeight;
    svg.append(svgEl2("line", {
      x1: String(padding.left),
      x2: String(padding.left + innerWidth),
      y1: String(y),
      y2: String(y),
      stroke: "var(--rui-color-border-subtle, rgba(0,0,0,0.08))"
    }));
    svg.append(svgEl2("text", {
      x: String(padding.left - 8),
      y: String(y + 5),
      "text-anchor": "end",
      class: "rui-chart-tick",
      "font-size": "14"
    }, [String(Math.round((min + (max - min) * ratio) * 10) / 10)]));
  }
}

// ../../src/library/components/advanced-forms.ts
var PIN_TYPES = ["numeric", "alphanumeric"];
function renderPin(id, length, type, value, disabled, mask, onChange) {
  const root = el("div", {
    class: "rui-pin-input",
    "data-disabled": disabled ? "true" : "false"
  });
  const inputs = [];
  for (let i = 0; i < length; i += 1) {
    const input = el("input", {
      class: "rui-pin-input-slot",
      id: i === 0 ? id : null,
      maxlength: "1",
      autocomplete: "one-time-code",
      inputmode: type === "numeric" ? "numeric" : "text",
      type: mask ? "password" : "text",
      "aria-label": `Digit ${i + 1}`,
      value: value.charAt(i) || "",
      disabled: disabled ? "" : null
    });
    inputs.push(input);
    root.append(input);
  }
  const getLiveSlots = (origin) => {
    const pinRoot = origin.closest(".rui-pin-input");
    if (!pinRoot) return inputs;
    return Array.from(pinRoot.querySelectorAll(".rui-pin-input-slot"));
  };
  const collectLive = (origin) => {
    return getLiveSlots(origin).map((i) => i.value).join("").slice(0, length);
  };
  inputs.forEach((input, idx) => {
    input.oninput = (event) => {
      const target = event.currentTarget;
      const liveSlots = getLiveSlots(target);
      let v = target.value;
      if (type === "numeric") v = v.replace(/\D/g, "");
      else v = v.replace(/[^A-Za-z0-9]/g, "");
      if (v.length > 1) {
        const chars = v.split("");
        chars.slice(0, length - idx).forEach((c, k) => {
          const next = liveSlots[idx + k];
          if (next) next.value = c;
        });
        const lastFilled = Math.min(idx + chars.length, length - 1);
        liveSlots[lastFilled]?.focus();
      } else {
        target.value = v;
        if (v && idx < length - 1) liveSlots[idx + 1]?.focus();
      }
      onChange?.(collectLive(target));
    };
    input.onkeydown = (event) => {
      const e = event;
      const target = e.currentTarget;
      const liveSlots = getLiveSlots(target);
      if (e.key === "Backspace" && !target.value && idx > 0) {
        e.preventDefault();
        liveSlots[idx - 1]?.focus();
        const prev = liveSlots[idx - 1];
        if (prev) prev.value = "";
        onChange?.(collectLive(target));
      } else if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        liveSlots[idx - 1]?.focus();
      } else if (e.key === "ArrowRight" && idx < length - 1) {
        e.preventDefault();
        liveSlots[idx + 1]?.focus();
      }
    };
  });
  return root;
}
var PinInput = {
  name: "PinInput",
  description: 'Per-digit PIN entry. Auto-advances focus as the user types and supports paste. Pass a `$variable` as `value` for two-way binding (the bound value is the joined string). Use `type="numeric"` for PINs / 2FA codes, `"alphanumeric"` for invite codes.',
  props: [
    { name: "id", type: "string" },
    { name: "length", type: "number", optional: true, description: "Number of slots (default 4)" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "type", type: "string", optional: true, enum: PIN_TYPES },
    { name: "mask", type: "boolean", optional: true, description: "Render slots as `<input type=password>`" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current joined string on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const length = Math.max(1, Math.min(12, Math.floor(asNumber(props.length, 4))));
    const type = asString(props.type, "numeric");
    const value = asString(props.value);
    const disabled = asBoolean(props.disabled);
    const mask = asBoolean(props.mask);
    const stateName = node.argMeta?.[2]?.stateRef;
    return renderPin(id, length, type, value, disabled, mask, (next) => {
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
    });
  }
};
function passwordStrength(value) {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  score = Math.min(4, score);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] ?? "" };
}
var PasswordInput = {
  name: "PasswordInput",
  description: "Password input with a show/hide toggle and an optional strength meter. Pass a `$variable` as `value` for two-way binding. Set `strengthMeter=true` to render a 4-step indicator and label.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "label", type: "string", optional: true, description: "Inline label above the field" },
    { name: "strengthMeter", type: "boolean", optional: true, aliases: ["showStrength"] },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current value on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const visibleSlot = helpers.useInstanceState("visible", false);
    const visible = visibleSlot.get();
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-password-input", "data-disabled": disabled ? "true" : "false" });
    const labelText = asString(props.label);
    if (labelText) {
      root.append(el("label", { class: "rui-password-input-label", for: id }, [labelText]));
    }
    const row = el("div", { class: "rui-password-input-row" });
    const input = el("input", {
      type: visible ? "text" : "password",
      class: "rui-password-input-field",
      id,
      name: id,
      autocomplete: "current-password",
      placeholder: asString(props.placeholder),
      value: asString(props.value),
      disabled: disabled ? "" : null
    });
    const toggleBtn = el("button", {
      type: "button",
      class: "rui-password-input-toggle",
      "aria-label": visible ? "Hide password" : "Show password"
    });
    const toggleIcon = renderIcon(visible ? "eye-slash" : "eye");
    if (toggleIcon) toggleBtn.append(toggleIcon);
    toggleBtn.onclick = (event) => {
      event.preventDefault();
      const next = !visibleSlot.get();
      visibleSlot.set(next);
      const target = event.currentTarget;
      const live = target.closest(".rui-password-input");
      const liveInput = live?.querySelector(".rui-password-input-field");
      if (liveInput) liveInput.type = next ? "text" : "password";
    };
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => n.value
      });
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => n.value
    });
    row.append(input);
    row.append(toggleBtn);
    root.append(row);
    if (asBoolean(props.strengthMeter)) {
      const strength = passwordStrength(asString(props.value));
      const meter = el("div", { class: "rui-password-input-strength", "data-score": String(strength.score) });
      for (let i = 0; i < 4; i += 1) {
        meter.append(el("span", {
          class: "rui-password-input-strength-bar",
          "data-filled": i < strength.score ? "true" : "false"
        }));
      }
      const labelRow = el("div", { class: "rui-password-input-strength-row" });
      labelRow.append(meter);
      if (strength.label) labelRow.append(el("span", { class: "rui-password-input-strength-label" }, [strength.label]));
      root.append(labelRow);
    }
    return root;
  }
};
var TagInput = {
  name: "TagInput",
  description: "Tag/chip input \u2014 type a value, press Enter (or comma) to commit, click \xD7 on a chip to remove. Pass a `$variable` (array of strings) as `value` for two-way binding. Use for keywords, recipients, labels, skills, allowlists.",
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string[]", optional: true, description: "Bound array of tag values" },
    { name: "placeholder", type: "string", optional: true },
    { name: "label", type: "string", optional: true, description: "Inline label above the field" },
    { name: "max", type: "number", optional: true, description: "Maximum number of tags" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the updated array of tags whenever one is added or removed" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const tags = asArray(props.value).map((v) => asString(v)).filter(Boolean);
    const max = Math.max(0, Math.floor(asNumber(props.max, 0)));
    const disabled = asBoolean(props.disabled);
    const stateName = node.argMeta?.[1]?.stateRef;
    const setTags = (next) => {
      if (stateName) helpers.setState(stateName, next);
      helpers.invoke(props.onChange, next);
    };
    const labelText = asString(props.label);
    const root = el("div", {
      class: "rui-tag-input",
      "data-disabled": disabled ? "true" : "false"
    });
    for (const tag of tags) {
      const chip = el("span", { class: "rui-tag-input-chip" });
      chip.append(el("span", {}, [tag]));
      const remove = el("button", {
        type: "button",
        class: "rui-tag-input-remove",
        "aria-label": `Remove ${tag}`
      }, ["\xD7"]);
      remove.onclick = () => setTags(tags.filter((t) => t !== tag));
      chip.append(remove);
      root.append(chip);
    }
    const input = el("input", {
      type: "text",
      class: "rui-tag-input-field",
      id,
      name: id,
      placeholder: asString(props.placeholder, tags.length === 0 ? "Add tags\u2026" : ""),
      disabled: disabled ? "" : null,
      autocomplete: "off"
    });
    input.onkeydown = (event) => {
      const e = event;
      const liveInput = e.currentTarget;
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const value = liveInput.value.trim();
        if (!value) return;
        if (max > 0 && tags.length >= max) return;
        if (tags.includes(value)) {
          liveInput.value = "";
          return;
        }
        setTags([...tags, value]);
        liveInput.value = "";
      } else if (e.key === "Backspace" && liveInput.value === "" && tags.length > 0) {
        e.preventDefault();
        setTags(tags.slice(0, -1));
      }
    };
    root.append(input);
    if (labelText) {
      const wrapper = el("div", { class: "rui-tag-input-wrapper" });
      wrapper.append(el("label", { class: "rui-tag-input-label", for: id }, [labelText]));
      wrapper.append(root);
      return wrapper;
    }
    return root;
  }
};
function readMentionItems(raw) {
  return asArray(raw).map((entry) => {
    if (typeof entry === "string") return { value: entry, label: entry };
    if (entry && typeof entry === "object") {
      const r = entry;
      const display = asString(r.label ?? r.name ?? r.value ?? r.id);
      const handle = asString(r.handle ?? r.value ?? r.id ?? r.name ?? r.label);
      return { value: handle, label: display };
    }
    return { value: "", label: "" };
  }).filter((i) => i.value || i.label);
}
var MentionInput = {
  name: "MentionInput",
  description: "Multi-line input with inline @-mention suggestions. Typing `@` opens a popover listing the provided `people` (filtered by what follows). Selecting an option inserts `@label` into the text. Pass a `$variable` as `value` for two-way binding. Use for comments, task notes, chat composers.",
  props: [
    { name: "id", type: "string" },
    { name: "people", type: "any[]", description: "Available mentions: strings or {value, label} objects" },
    { name: "value", type: "string", optional: true, description: "Bound text (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "rows", type: "number", optional: true, description: "TextArea rows (default 3)" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the current text on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const people = readMentionItems(props.people);
    const disabled = asBoolean(props.disabled);
    const root = el("div", { class: "rui-mention-input", "data-disabled": disabled ? "true" : "false" });
    const textarea = el("textarea", {
      class: "rui-mention-input-field",
      id,
      name: id,
      rows: String(Math.max(2, Math.floor(asNumber(props.rows, 3)))),
      placeholder: asString(props.placeholder, "Type @ to mention someone"),
      disabled: disabled ? "" : null
    });
    textarea.value = asString(props.value);
    const suggestions = el("div", { class: "rui-mention-input-suggestions", "data-open": "false" });
    const activeSlot = helpers.useInstanceState("activeIndex", 0);
    const matchesSlot = helpers.useInstanceState("matches", []);
    const querySlot = helpers.useInstanceState("query", null);
    const liveSuggestionsFor = (origin) => {
      const root2 = origin.closest(".rui-mention-input");
      return root2?.querySelector(".rui-mention-input-suggestions") ?? null;
    };
    const liveTextareaFor = (origin) => {
      const root2 = origin.closest(".rui-mention-input");
      return root2?.querySelector(".rui-mention-input-field") ?? null;
    };
    const insertMention = (liveTextarea, item) => {
      const text = liveTextarea.value;
      const caret = liveTextarea.selectionStart ?? text.length;
      const before = text.slice(0, caret);
      const triggerIdx = before.lastIndexOf("@");
      if (triggerIdx === -1) return;
      const after = text.slice(caret);
      const insert = `@${item.value} `;
      const next = before.slice(0, triggerIdx) + insert + after;
      liveTextarea.value = next;
      const cursor = triggerIdx + insert.length;
      liveTextarea.selectionStart = liveTextarea.selectionEnd = cursor;
      liveTextarea.dispatchEvent(new Event("input", { bubbles: true }));
      liveTextarea.focus();
    };
    const paintSuggestions = (panel, query) => {
      panel.replaceChildren();
      if (query === null) {
        panel.setAttribute("data-open", "false");
        matchesSlot.set([]);
        return;
      }
      const q = query.toLowerCase();
      const filtered = people.filter(
        (p) => p.label.toLowerCase().includes(q) || p.value.toLowerCase().includes(q)
      );
      const slice = filtered.slice(0, 6);
      matchesSlot.set(slice);
      if (slice.length === 0) {
        panel.setAttribute("data-open", "false");
        return;
      }
      const nextActive = Math.min(activeSlot.get(), slice.length - 1);
      activeSlot.set(nextActive);
      panel.setAttribute("data-open", "true");
      slice.forEach((item, idx) => {
        const btn = el("button", {
          type: "button",
          class: "rui-mention-input-option",
          "data-value": item.value,
          "data-active": idx === nextActive ? "true" : "false"
        });
        btn.append(el("span", { class: "rui-mention-input-option-label" }, [item.label]));
        if (item.value && item.value !== item.label) {
          btn.append(el("span", { class: "rui-mention-input-option-handle" }, [`@${item.value}`]));
        }
        btn.onmousedown = (event) => event.preventDefault();
        btn.onclick = (event) => {
          const origin = event.currentTarget;
          const ta = liveTextareaFor(origin);
          const live = liveSuggestionsFor(origin);
          if (ta) insertMention(ta, item);
          querySlot.set(null);
          if (live) paintSuggestions(live, null);
        };
        panel.append(btn);
      });
    };
    const updateFromCaret = (liveTextarea) => {
      const live = liveSuggestionsFor(liveTextarea);
      if (!live) return;
      const caret = liveTextarea.selectionStart ?? liveTextarea.value.length;
      const before = liveTextarea.value.slice(0, caret);
      const match = /@([\w-]*)$/.exec(before);
      const nextQuery = match ? match[1] ?? "" : null;
      querySlot.set(nextQuery);
      paintSuggestions(live, nextQuery);
    };
    const stateName = node.argMeta?.[2]?.stateRef;
    if (stateName) {
      helpers.bindState(textarea, stateName, {
        event: "input",
        getValue: (n) => {
          const ta = n;
          updateFromCaret(ta);
          return ta.value;
        }
      });
    } else {
      textarea.oninput = (event) => {
        updateFromCaret(event.currentTarget);
      };
    }
    attachOnChange(textarea, props.onChange, helpers, {
      event: "input",
      getValue: (n) => n.value
    });
    textarea.onkeydown = (event) => {
      const ta = event.currentTarget;
      const live = liveSuggestionsFor(ta);
      if (!live || live.getAttribute("data-open") !== "true") return;
      const matches = matchesSlot.get();
      if (matches.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = (activeSlot.get() + 1) % matches.length;
        activeSlot.set(next);
        const items = live.querySelectorAll(".rui-mention-input-option");
        items.forEach((b, i) => b.setAttribute("data-active", i === next ? "true" : "false"));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = (activeSlot.get() - 1 + matches.length) % matches.length;
        activeSlot.set(next);
        const items = live.querySelectorAll(".rui-mention-input-option");
        items.forEach((b, i) => b.setAttribute("data-active", i === next ? "true" : "false"));
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const chosen = matches[activeSlot.get()];
        if (chosen) {
          insertMention(ta, chosen);
          querySlot.set(null);
          paintSuggestions(live, null);
        }
      } else if (event.key === "Escape") {
        querySlot.set(null);
        paintSuggestions(live, null);
      }
    };
    textarea.onblur = (event) => {
      const ta = event.currentTarget;
      setTimeout(() => {
        const live = liveSuggestionsFor(ta);
        querySlot.set(null);
        if (live) paintSuggestions(live, null);
      }, 120);
    };
    root.append(textarea);
    root.append(suggestions);
    paintSuggestions(suggestions, querySlot.get());
    return root;
  }
};
var TimePicker = {
  name: "TimePicker",
  description: 'Time-of-day picker that wraps `<input type="time">`. Pass a `$variable` as `value` for two-way binding (HH:MM 24-hour). Set `step` to constrain to specific increments (e.g. 900 for 15-minute buckets).',
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "HH:MM value; typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true },
    { name: "max", type: "string", optional: true },
    { name: "step", type: "number", optional: true, description: "Seconds between selectable times" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new HH:MM string when the user picks a time" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("div", { class: "rui-time-picker" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-time-picker-label", for: id }, [label]));
    const input = el("input", {
      type: "time",
      class: "rui-time-picker-input",
      id,
      name: id,
      value: asString(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      step: props.step != null ? String(asNumber(props.step, 60)) : null,
      disabled: asBoolean(props.disabled) ? "" : null
    });
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) helpers.bindState(input, stateName);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => n.value
    });
    root.append(input);
    return root;
  }
};
var DateTimePicker = {
  name: "DateTimePicker",
  description: 'Combined date + time picker \u2014 wraps `<input type="datetime-local">`. Pass a `$variable` as `value` for two-way binding (ISO `YYYY-MM-DDTHH:MM`).',
  props: [
    { name: "id", type: "string" },
    { name: "value", type: "string", optional: true, description: "ISO date-time value; typically $variable" },
    { name: "label", type: "string", optional: true },
    { name: "min", type: "string", optional: true },
    { name: "max", type: "string", optional: true },
    { name: "step", type: "number", optional: true, description: "Seconds between selectable times" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the new ISO `YYYY-MM-DDTHH:MM` string" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const root = el("div", { class: "rui-datetime-picker" });
    const label = asString(props.label);
    if (label) root.append(el("label", { class: "rui-datetime-picker-label", for: id }, [label]));
    const input = el("input", {
      type: "datetime-local",
      class: "rui-datetime-picker-input",
      id,
      name: id,
      value: asString(props.value),
      min: asString(props.min) || null,
      max: asString(props.max) || null,
      step: props.step != null ? String(asNumber(props.step, 60)) : null,
      disabled: asBoolean(props.disabled) ? "" : null
    });
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) helpers.bindState(input, stateName);
    attachOnChange(input, props.onChange, helpers, {
      event: "change",
      getValue: (n) => n.value
    });
    root.append(input);
    return root;
  }
};
function applyMask(value, mask) {
  if (!mask) return value;
  let out = "";
  let i = 0;
  const v = String(value ?? "");
  for (const ch of mask) {
    if (i >= v.length) break;
    if (ch === "9") {
      while (i < v.length && !/\d/.test(v[i] ?? "")) i += 1;
      if (i >= v.length) break;
      out += v[i];
      i += 1;
    } else if (ch === "A") {
      while (i < v.length && !/[a-zA-Z]/.test(v[i] ?? "")) i += 1;
      if (i >= v.length) break;
      out += v[i];
      i += 1;
    } else if (ch === "*") {
      out += v[i];
      i += 1;
    } else {
      out += ch;
      if (v[i] === ch) i += 1;
    }
  }
  return out;
}
var MaskedInput = {
  name: "MaskedInput",
  description: 'Text input with an inline mask \u2014 `9` matches a digit, `A` matches a letter, `*` matches any character, every other character is a fixed delimiter. Useful for phone numbers, postal codes, credit cards. Pass `mask` (e.g. `"(999) 999-9999"`) and a `$variable` as `value`.',
  props: [
    { name: "id", type: "string" },
    { name: "mask", type: "string", description: "Mask pattern" },
    { name: "value", type: "string", optional: true, description: "Bound value (typically $variable)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "label", type: "string", optional: true, description: "Inline label above the field" },
    { name: "disabled", type: "boolean", optional: true },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Called with the masked value on every keystroke" }
  ],
  render: (node, props, helpers) => {
    const id = asString(props.id);
    const mask = asString(props.mask);
    const disabled = asBoolean(props.disabled);
    const initial = applyMask(asString(props.value), mask);
    const labelText = asString(props.label);
    const input = el("input", {
      type: "text",
      class: "rui-masked-input",
      id,
      name: id,
      value: initial,
      placeholder: asString(props.placeholder, mask),
      disabled: disabled ? "" : null,
      autocomplete: "off"
    });
    input.value = initial;
    const stateName = node.argMeta?.[2]?.stateRef;
    const formatInPlace = (target) => {
      const before = target.value;
      const masked = applyMask(before, mask);
      if (masked === before) return masked;
      const caret = target.selectionStart ?? masked.length;
      target.value = masked;
      const newPos = Math.min(masked.length, caret);
      try {
        target.setSelectionRange(newPos, newPos);
      } catch {
      }
      return masked;
    };
    if (stateName) {
      helpers.bindState(input, stateName, {
        event: "input",
        getValue: (n) => formatInPlace(n)
      });
    } else {
      input.oninput = (event) => {
        formatInPlace(event.currentTarget ?? event.target);
      };
    }
    attachOnChange(input, props.onChange, helpers, {
      event: "input",
      getValue: (n) => n.value
    });
    if (labelText) {
      const wrapper = el("div", { class: "rui-masked-input-wrapper" });
      wrapper.append(el("label", { class: "rui-masked-input-label", for: id }, [labelText]));
      wrapper.append(input);
      return wrapper;
    }
    return input;
  }
};
var FormSection = {
  name: "FormSection",
  description: "Semantic grouping for related form fields \u2014 renders a small heading (`label`), optional helper paragraph, and stacks the children with consistent spacing. Use INSTEAD of wrapping fields in `Card` + `SectionHeader` by hand. Pair with `FieldSet` when the group is a true `<fieldset>` (radio sets, checkbox groups).",
  props: [
    { name: "label", type: "string", aliases: ["title"] },
    { name: "children", type: "Node[]", aliases: ["fields"] },
    { name: "helper", type: "string", optional: true, aliases: ["description"], description: "Description rendered below the label" }
  ],
  render: (_node, props, helpers) => {
    const root = el("section", { class: "rui-form-section" });
    const header = el("header", { class: "rui-form-section-header" });
    header.append(el("h3", { class: "rui-form-section-label" }, [asString(props.label)]));
    const helper = asString(props.helper);
    if (helper) header.append(el("p", { class: "rui-form-section-helper" }, [helper]));
    root.append(header);
    const body = el("div", { class: "rui-form-section-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    root.append(body);
    return root;
  }
};
var FieldSet = {
  name: "FieldSet",
  description: "Native `<fieldset>`/`<legend>` wrapper for accessible grouping of related controls. Use when assistive tech should announce the wrapper (radio sets, checkbox groups). For purely visual grouping prefer `FormSection`.",
  props: [
    { name: "legend", type: "string", aliases: ["title", "label"] },
    { name: "children", type: "Node[]", aliases: ["fields"] },
    { name: "helper", type: "string", optional: true, aliases: ["hint", "description"] },
    { name: "disabled", type: "boolean", optional: true }
  ],
  render: (_node, props, helpers) => {
    const root = el("fieldset", {
      class: "rui-fieldset",
      disabled: asBoolean(props.disabled) ? "" : null
    });
    root.append(el("legend", { class: "rui-fieldset-legend" }, [asString(props.legend)]));
    const helper = asString(props.helper);
    if (helper) root.append(el("p", { class: "rui-fieldset-helper" }, [helper]));
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var ValidationSummary = {
  name: "ValidationSummary",
  description: "Aggregate error list rendered at the top of a form. Pass `errors` as `{label?, message, field?}` objects or plain strings. Pair with individual field hints via `FormControl(hint=...)`.",
  props: [
    { name: "errors", type: "any[]" },
    { name: "title", type: "string", optional: true, description: 'Heading (default "Please fix the following:")' },
    { name: "tone", type: "string", optional: true, enum: ["danger", "warning"] }
  ],
  render: (_node, props) => {
    const errors = asArray(props.errors).map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return { label: "", message: entry, field: "" };
      if (typeof entry === "object") {
        const r = entry;
        return {
          label: asString(r.label),
          message: asString(r.message ?? r.error),
          field: asString(r.field)
        };
      }
      return null;
    }).filter((e) => e !== null && e.message !== "");
    if (errors.length === 0) {
      return el("div", { class: "rui-validation-summary", "data-empty": "true", hidden: "" });
    }
    const tone = asString(props.tone, "danger");
    const root = el("aside", {
      class: "rui-validation-summary",
      "data-tone": tone,
      role: "alert"
    });
    const titleNode = el("div", { class: "rui-validation-summary-title" });
    const iconNode = renderIcon(tone === "warning" ? "triangle-exclamation" : "circle-xmark", { className: "rui-validation-summary-icon" });
    if (iconNode) titleNode.append(iconNode);
    titleNode.append(document.createTextNode(asString(props.title, "Please fix the following:")));
    root.append(titleNode);
    const list = el("ul", { class: "rui-validation-summary-list" });
    for (const err of errors) {
      const li = el("li", { class: "rui-validation-summary-item" });
      if (err.label) li.append(el("strong", {}, [`${err.label}: `]));
      li.append(document.createTextNode(err.message));
      list.append(li);
    }
    root.append(list);
    return root;
  }
};
function readSteps(raw) {
  return asArray(raw).map((entry) => {
    if (!entry || typeof entry !== "object") {
      return { title: asString(entry), details: "", content: null };
    }
    const r = entry;
    return {
      title: asString(r.title),
      details: asString(r.details),
      content: r.content ?? null
    };
  });
}
var MultiStepForm = {
  name: "MultiStepForm",
  description: 'Multi-step / wizard form composite. Renders a `Steps` indicator, the active step\'s `content`, and Prev/Next buttons that drive a `$variable` for the current 0-indexed step. Use INSTEAD of hand-rolling `Steps` + content + manual prev/next wiring. The submit button is rendered on the final step (override via `submitLabel`). Step indicator direction defaults to `column` (stacked next to the content); set `stepsLayout: "row"` for a classic horizontal stepper.',
  props: [
    { name: "steps", type: "object[]", description: "Array of {title, details?, content} step objects" },
    { name: "current", type: "number", description: "0-indexed active step \u2014 bind a $variable" },
    { name: "onSubmit", type: "callable", optional: true, description: "Callable fired when the user clicks Submit on the final step" },
    { name: "prevLabel", type: "string", optional: true, description: 'Default "Back"' },
    { name: "nextLabel", type: "string", optional: true, description: 'Default "Continue"' },
    { name: "submitLabel", type: "string", optional: true, description: 'Default "Submit" (final step)' },
    { name: "stepsLayout", type: "string", optional: true, enum: ["column", "row"], aliases: ["layout", "stepsDirection"], description: 'Direction of the steps indicator (default "column")' }
  ],
  render: (node, props, helpers) => {
    const steps = readSteps(props.steps);
    const total = steps.length;
    const current = Math.max(0, Math.min(total - 1, Math.floor(asNumber(props.current, 0))));
    const stateName = node.argMeta?.[1]?.stateRef;
    const layoutToken = asString(props.stepsLayout, "column").toLowerCase();
    const layout = layoutToken === "row" || layoutToken === "horizontal" ? "row" : "column";
    const root = el("div", {
      class: "rui-multi-step-form",
      "data-layout": layout
    });
    const stepsEl = el("ol", {
      class: "rui-steps rui-multi-step-form-steps",
      "data-layout": layout
    });
    steps.forEach((step, idx) => {
      const li = el("li", {
        class: "rui-steps-item",
        "data-active": idx === current ? "true" : "false",
        "data-complete": idx < current ? "true" : "false"
      });
      li.append(el("div", { class: "rui-steps-title" }, [step.title || `Step ${idx + 1}`]));
      if (step.details) li.append(el("div", { class: "rui-steps-details" }, [step.details]));
      stepsEl.append(li);
    });
    root.append(stepsEl);
    const body = el("div", { class: "rui-multi-step-form-body" });
    const active = steps[current];
    if (active && active.content) {
      body.append(helpers.renderNode(active.content));
    }
    root.append(body);
    const footer = el("div", { class: "rui-multi-step-form-footer" });
    const prevBtn = el("button", {
      type: "button",
      class: "rui-button",
      "data-variant": "ghost",
      disabled: current <= 0 ? "" : null
    }, [asString(props.prevLabel, "Back")]);
    if (stateName && current > 0) {
      prevBtn.onclick = () => helpers.setState(stateName, current - 1);
    }
    const isFinal = current >= total - 1;
    const nextLabel = isFinal ? asString(props.submitLabel, "Submit") : asString(props.nextLabel, "Continue");
    const nextBtn = el("button", {
      type: "button",
      class: "rui-button",
      "data-variant": "primary"
    }, [nextLabel]);
    nextBtn.onclick = () => {
      if (isFinal) {
        helpers.invoke(props.onSubmit);
      } else if (stateName) {
        helpers.setState(stateName, current + 1);
      }
    };
    footer.append(prevBtn);
    footer.append(el("span", { class: "rui-multi-step-form-progress" }, [`${current + 1} / ${total}`]));
    footer.append(nextBtn);
    root.append(footer);
    return root;
  }
};

// ../../src/library/components/advanced-patterns.ts
function readInboxEntries(raw) {
  return asArray(raw).map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const r = entry;
    return {
      title: asString(r.title),
      message: asString(r.message),
      time: asString(r.time),
      icon: asString(r.icon),
      tone: asString(r.tone, "default"),
      unread: asBoolean(r.unread),
      avatarSrc: asString(r.avatarSrc),
      onClick: r.onClick ?? r.action
    };
  }).filter((e) => e !== null);
}
var InboxPanel = {
  name: "InboxPanel",
  description: "Grouped notification list \u2014 entries are grouped into Unread/Earlier sections, with a count chip on each group header. Pass `items` as `{title, message, time, icon?, tone?, unread?, avatarSrc?, onClick?}` objects (`action` is also accepted as an alias). Pair with a `SectionHeader` for the panel title (the component does not render its own title to avoid duplication). Use for top-bar notification trays, activity drawers, and alert center pages.",
  props: [
    { name: "items", type: "object[]" },
    { name: "emptyLabel", type: "string", optional: true, description: "Text shown when there are no notifications" },
    { name: "onMarkAllRead", type: "callable", optional: true, description: 'Callable fired by the "Mark all as read" button' }
  ],
  render: (_node, props, helpers) => {
    const entries = readInboxEntries(props.items);
    const unread = entries.filter((e) => e.unread);
    const read = entries.filter((e) => !e.unread);
    const root = el("div", { class: "rui-inbox-panel" });
    if (typeof props.onMarkAllRead === "function" && unread.length > 0) {
      const toolbar = el("div", { class: "rui-inbox-panel-toolbar" });
      const btn = el("button", { type: "button", class: "rui-inbox-panel-mark-all" }, ["Mark all as read"]);
      btn.onclick = () => helpers.invoke(props.onMarkAllRead);
      toolbar.append(btn);
      root.append(toolbar);
    }
    if (entries.length === 0) {
      root.append(el("div", { class: "rui-inbox-panel-empty" }, [asString(props.emptyLabel, "You're all caught up.")]));
      return root;
    }
    const renderGroup = (label, items) => {
      if (items.length === 0) return;
      const group = el("section", { class: "rui-inbox-panel-group" });
      const groupHead = el("header", { class: "rui-inbox-panel-group-head" });
      groupHead.append(el("span", { class: "rui-inbox-panel-group-label" }, [label]));
      groupHead.append(el("span", { class: "rui-inbox-panel-group-count" }, [String(items.length)]));
      group.append(groupHead);
      for (const entry of items) {
        const card = Notification.render(
          { __kind: "Component", name: "Notification", args: [], argMeta: [] },
          {
            title: entry.title,
            message: entry.message,
            time: entry.time,
            icon: entry.icon,
            tone: entry.tone,
            avatarSrc: entry.avatarSrc,
            unread: entry.unread
          },
          helpers
        );
        if (typeof entry.onClick === "function") {
          card.setAttribute("data-clickable", "true");
          card.onclick = () => helpers.invoke(entry.onClick);
        }
        group.append(card);
      }
      root.append(group);
    };
    renderGroup(`Unread (${unread.length})`, unread);
    renderGroup("Earlier", read);
    return root;
  }
};
function readChecklistItems(raw) {
  return asArray(raw).map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const r = entry;
    return {
      title: asString(r.title),
      description: asString(r.description),
      done: asBoolean(r.done),
      onClick: r.onClick ?? r.action,
      cta: asString(r.cta, "Start")
    };
  }).filter((c) => c !== null);
}
var OnboardingChecklist = {
  name: "OnboardingChecklist",
  description: 'Step-by-step product checklist with completion progress at the top. Pass `items` as `{title, description?, done?, onClick?, cta?}` objects (`action` is also accepted as an alias). The progress percentage is computed automatically from `done`. Use on first-run dashboards, empty workspaces, and "complete your profile" surfaces.',
  props: [
    { name: "items", type: "object[]" },
    { name: "title", type: "string", optional: true, description: 'Heading (default "Getting started")' },
    { name: "subtitle", type: "string", optional: true }
  ],
  render: (_node, props, helpers) => {
    const items = readChecklistItems(props.items);
    const completed = items.filter((i) => i.done).length;
    const total = Math.max(1, items.length);
    const pct = Math.round(completed / total * 100);
    const root = el("div", { class: "rui-onboarding-checklist" });
    const head = el("header", { class: "rui-onboarding-checklist-header" });
    head.append(el("h3", { class: "rui-onboarding-checklist-title" }, [
      asString(props.title, "Getting started")
    ]));
    const subtitle = asString(props.subtitle);
    if (subtitle) head.append(el("p", { class: "rui-onboarding-checklist-subtitle" }, [subtitle]));
    head.append(el("div", { class: "rui-onboarding-checklist-progress" }, [
      el("div", { class: "rui-onboarding-checklist-bar" }, [
        el("div", {
          class: "rui-onboarding-checklist-fill",
          style: `width:${pct}%`
        })
      ]),
      el("span", { class: "rui-onboarding-checklist-meta" }, [`${completed}/${items.length} complete`])
    ]));
    root.append(head);
    const list = el("ol", { class: "rui-onboarding-checklist-list" });
    for (const item of items) {
      const li = el("li", {
        class: "rui-onboarding-checklist-item",
        "data-done": item.done ? "true" : "false"
      });
      const marker = el("span", { class: "rui-onboarding-checklist-marker" });
      const iconNode = renderIcon(item.done ? "circle-check" : "circle", { className: "rui-onboarding-checklist-marker-icon" });
      if (iconNode) marker.append(iconNode);
      li.append(marker);
      const body = el("div", { class: "rui-onboarding-checklist-body" });
      body.append(el("div", { class: "rui-onboarding-checklist-item-title" }, [item.title]));
      if (item.description) body.append(el("p", { class: "rui-onboarding-checklist-item-description" }, [item.description]));
      li.append(body);
      if (!item.done && typeof item.onClick === "function") {
        const btn = el("button", {
          type: "button",
          class: "rui-button",
          "data-variant": "secondary",
          "data-size": "sm"
        }, [item.cta]);
        btn.onclick = () => helpers.invoke(item.onClick);
        li.append(btn);
      }
      list.append(li);
    }
    root.append(list);
    return root;
  }
};
function renderStateCard(opts) {
  const root = el("div", { class: `rui-${opts.klass}` });
  if (opts.iconName) {
    const icon = renderIcon(opts.iconName, { className: opts.iconClass });
    if (icon) root.append(icon);
  }
  if (opts.title) root.append(el("h3", { class: `rui-${opts.klass}-title` }, [opts.title]));
  if (opts.description) root.append(el("p", { class: `rui-${opts.klass}-description` }, [opts.description]));
  const items = asArray(opts.actions);
  if (items.length > 0) {
    const row = el("div", { class: `rui-${opts.klass}-actions` });
    for (const item of items) row.append(opts.helpers.renderNode(item));
    root.append(row);
  }
  return root;
}
var LoadingState = {
  name: "LoadingState",
  description: "Full-card loading state \u2014 large spinner + title + description. Use while a query is in flight or while a long-running tool runs. For tiny inline loaders prefer `Spinner`; for skeleton placeholders prefer `Skeleton`.",
  props: [
    { name: "title", type: "string", optional: true, description: 'Default "Loading\u2026"' },
    { name: "description", type: "string", optional: true }
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-loading-state" });
    const spinner = el("span", { class: "rui-spinner", "data-size": "lg", "data-tone": "primary" });
    spinner.append(el("span", { class: "rui-spinner-ring", "aria-hidden": "true" }));
    root.append(spinner);
    root.append(el("h3", { class: "rui-loading-state-title" }, [asString(props.title, "Loading\u2026")]));
    const description = asString(props.description);
    if (description) root.append(el("p", { class: "rui-loading-state-description" }, [description]));
    return root;
  }
};
var ErrorState = {
  name: "ErrorState",
  description: "Full-card error placeholder. Pairs a danger icon with title, description, and a row of recovery actions (Retry / Contact support / Go home). Pass `actions` as Button(...) entries.",
  props: [
    { name: "title", type: "string", optional: true, description: 'Default "Something went wrong"' },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Font Awesome icon (default `circle-exclamation`)" }
  ],
  render: (_node, props, helpers) => renderStateCard({
    klass: "error-state",
    iconName: asString(props.icon, "circle-exclamation"),
    iconClass: "rui-error-state-icon",
    title: asString(props.title, "Something went wrong"),
    description: asString(props.description),
    actions: props.actions,
    helpers
  })
};
var SuccessState = {
  name: "SuccessState",
  description: 'Full-card success placeholder. Use for confirmation screens ("Order placed", "Payment succeeded", "Account verified") at the end of a flow. Pass `actions` for follow-up CTAs.',
  props: [
    { name: "title", type: "string" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true },
    { name: "icon", type: "string", optional: true, description: "Default `circle-check`" }
  ],
  render: (_node, props, helpers) => renderStateCard({
    klass: "success-state",
    iconName: asString(props.icon, "circle-check"),
    iconClass: "rui-success-state-icon",
    title: asString(props.title),
    description: asString(props.description),
    actions: props.actions,
    helpers
  })
};
var Tour = {
  name: "Tour",
  description: "Product-tour controller \u2014 renders the current step's title, description, and a Prev/Next/Skip row. Bind `current` to a `$variable` (0-indexed). Pass `steps` as `{title, description, target?}` objects; the optional `target` is a CSS selector that renders alongside the step for designers to reference.",
  props: [
    { name: "steps", type: "object[]" },
    { name: "current", type: "number", description: "0-indexed active step \u2014 bind a $variable" },
    { name: "open", type: "boolean", optional: true, description: "Whether the tour is visible" },
    { name: "onComplete", type: "callable", optional: true }
  ],
  render: (node, props, helpers) => {
    const steps = asArray(props.steps).map((entry) => {
      if (!entry || typeof entry !== "object") return { title: asString(entry), description: "", target: "" };
      const r = entry;
      return { title: asString(r.title), description: asString(r.description), target: asString(r.target) };
    });
    const isOpen = props.open === void 0 ? true : asBoolean(props.open);
    const total = steps.length;
    const current = Math.max(0, Math.min(total - 1, Math.floor(asNumber(props.current, 0))));
    const stateName = node.argMeta?.[1]?.stateRef;
    const overlay = el("div", { class: "rui-tour", "data-open": isOpen ? "true" : "false" });
    if (!isOpen || total === 0) return overlay;
    const step = steps[current];
    if (!step) return overlay;
    const card = el("div", { class: "rui-tour-card", role: "dialog", "aria-modal": "false" });
    card.append(el("div", { class: "rui-tour-step" }, [`Step ${current + 1} of ${total}`]));
    card.append(el("h3", { class: "rui-tour-title" }, [step.title]));
    if (step.description) card.append(el("p", { class: "rui-tour-description" }, [step.description]));
    if (step.target) card.append(el("div", { class: "rui-tour-target" }, [`Target: ${step.target}`]));
    const footer = el("div", { class: "rui-tour-footer" });
    const skip = el("button", { type: "button", class: "rui-button", "data-variant": "ghost" }, ["Skip"]);
    skip.onclick = () => helpers.invoke(props.onComplete);
    const prev = el("button", {
      type: "button",
      class: "rui-button",
      "data-variant": "secondary",
      disabled: current <= 0 ? "" : null
    }, ["Back"]);
    if (stateName && current > 0) {
      prev.onclick = () => helpers.setState(stateName, current - 1);
    }
    const isLast = current >= total - 1;
    const next = el("button", { type: "button", class: "rui-button", "data-variant": "primary" }, [isLast ? "Finish" : "Next"]);
    next.onclick = () => {
      if (isLast) {
        helpers.invoke(props.onComplete);
      } else if (stateName) {
        helpers.setState(stateName, current + 1);
      }
    };
    footer.append(skip, prev, next);
    card.append(footer);
    overlay.append(card);
    return overlay;
  }
};
var Spotlight = {
  name: "Spotlight",
  description: 'Single-step product highlight \u2014 a dimmed full-page overlay with a ring around the focused area and a small explainer card. Use for one-off feature reveals ("Try the new commands menu"). Bind `open` to a `$variable` to dismiss.',
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", optional: true, description: "Whether the spotlight is visible \u2014 typically a $variable (default true)" },
    { name: "description", type: "string", optional: true },
    { name: "actions", type: "Node[]", optional: true, aliases: ["action"] }
  ],
  render: (node, props, helpers) => {
    const isOpen = props.open === void 0 ? true : asBoolean(props.open);
    const overlay = el("div", { class: "rui-spotlight", "data-open": isOpen ? "true" : "false" });
    if (!isOpen) return overlay;
    const card = el("div", { class: "rui-spotlight-card" });
    card.append(el("h3", { class: "rui-spotlight-title" }, [asString(props.title)]));
    const description = asString(props.description);
    if (description) card.append(el("p", { class: "rui-spotlight-description" }, [description]));
    const actions = asArray(props.actions);
    if (actions.length > 0) {
      const row = el("div", { class: "rui-spotlight-actions" });
      for (const item of actions) row.append(helpers.renderNode(item));
      card.append(row);
    }
    const stateName = node.argMeta?.[1]?.stateRef;
    if (stateName) {
      overlay.onclick = (event) => {
        if (event.target !== overlay) return;
        helpers.setState(stateName, false);
      };
    }
    overlay.append(card);
    return overlay;
  }
};
var Sticky = {
  name: "Sticky",
  description: "Wraps content in a `position: sticky` container so it pins to the top (or bottom) of the nearest scrollable ancestor. Use for toolbar action rows above tables, in-page navs, status banners.",
  props: [
    { name: "children", type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["top", "bottom"] },
    { name: "offset", type: "string", optional: true, description: "CSS offset (default 0)" },
    { name: "zIndex", type: "number", optional: true, description: "Z-index (default 10)" }
  ],
  render: (_node, props, helpers) => {
    const side = asString(props.side, "top");
    const offset = sanitiseCssLength(props.offset, "0");
    const z = Math.max(0, Math.floor(asNumber(props.zIndex, 10)));
    const styles = `position:sticky;${side}:${offset};z-index:${z};`;
    const root = el("div", { class: "rui-sticky", style: styles });
    for (const child of asArray(props.children)) root.append(helpers.renderNode(child));
    return root;
  }
};
var ResizablePanels = {
  name: "ResizablePanels",
  description: "Two-pane horizontal split with a draggable divider. The user can drag the divider to resize the primary pane; defaults respect the starting width. Use for code editors, file browsers, master/detail layouts that need user-controllable proportions.",
  props: [
    { name: "primary", type: "Node[]" },
    { name: "secondary", type: "Node[]" },
    { name: "initialPrimaryWidth", type: "string", optional: true, description: "CSS width for the primary pane (default 40%)" },
    { name: "minPrimaryWidth", type: "string", optional: true, description: "Min width (default 240px)" }
  ],
  render: (_node, props, helpers) => {
    const initial = sanitiseCssLength(props.initialPrimaryWidth, "40%");
    const minWidth = sanitiseCssLength(props.minPrimaryWidth, "240px");
    const root = el("div", {
      class: "rui-resizable-panels",
      style: `--rui-resizable-primary:${initial};--rui-resizable-min:${minWidth};`
    });
    const primary = el("div", { class: "rui-resizable-panel rui-resizable-panel-primary" });
    for (const child of asArray(props.primary)) primary.append(helpers.renderNode(child));
    const divider = el("div", {
      class: "rui-resizable-divider",
      role: "separator",
      "aria-orientation": "vertical",
      tabindex: "0"
    });
    const secondary = el("div", { class: "rui-resizable-panel rui-resizable-panel-secondary" });
    for (const child of asArray(props.secondary)) secondary.append(helpers.renderNode(child));
    root.append(primary, divider, secondary);
    divider.onpointerdown = (event) => {
      const e = event;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const live = target.closest(".rui-resizable-panels");
      if (!live) return;
      const rect = live.getBoundingClientRect();
      const onMove = (moveEvent) => {
        const ratio = (moveEvent.clientX - rect.left) / rect.width * 100;
        const clamped = Math.max(15, Math.min(85, ratio));
        live.style.setProperty("--rui-resizable-primary", `${clamped}%`);
      };
      const onUp = (upEvent) => {
        target.releasePointerCapture(upEvent.pointerId);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    };
    return root;
  }
};
var MasonryGrid = {
  name: "MasonryGrid",
  description: "Pinterest-style column grid. Children flow into columns that reflow on viewport changes. Use for galleries, social-style feeds, and mixed-height card walls. Prefer `Grid` when children should share the same height per row.",
  props: [
    { name: "items", type: "Node[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default 3)" },
    { name: "gap", type: "string", optional: true, enum: ["xs", "s", "m", "l", "xl"] }
  ],
  render: (_node, props, helpers) => {
    const columns = Math.max(1, Math.min(6, Math.floor(asNumber(props.columns, 3))));
    const gap = asString(props.gap, "m");
    const root = el("div", {
      class: "rui-masonry-grid",
      "data-columns": String(columns),
      "data-gap": gap
    });
    for (const item of asArray(props.items)) root.append(helpers.renderNode(item));
    return root;
  }
};
var Drawer = {
  name: "Drawer",
  description: "Side drawer overlay shown when `open` is true. Pass a `$variable` as `open` to control it. Choose `side` for slide direction (default right). `onClose` fires whenever the drawer is dismissed (\xD7 button or backdrop click).",
  props: [
    { name: "title", type: "string" },
    { name: "open", type: "boolean", description: "Open/closed state \u2014 usually a $variable" },
    { name: "children", type: "Node[]" },
    { name: "side", type: "string", optional: true, enum: ["right", "left", "top", "bottom"] },
    { name: "footer", type: "Node[]", optional: true, description: "Optional footer actions row" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked when the drawer is dismissed" }
  ],
  render: (node, props, helpers) => {
    const isOpen = asBoolean(props.open);
    const side = asString(props.side, "right");
    const overlay = el("div", {
      class: "rui-sheet-overlay",
      "data-open": isOpen ? "true" : "false",
      "data-side": side
    });
    const panel = el("aside", {
      class: "rui-sheet",
      role: "dialog",
      "aria-modal": "true",
      "data-side": side
    });
    const header = el("header", { class: "rui-sheet-header" });
    header.append(el("h3", { class: "rui-sheet-title" }, [asString(props.title)]));
    const closeBtn = el("button", {
      type: "button",
      class: "rui-sheet-close",
      "aria-label": "Close"
    }, ["\xD7"]);
    const stateName = node.argMeta?.[1]?.stateRef;
    const closeDrawer = () => {
      if (stateName) helpers.setState(stateName, false);
      helpers.invoke(props.onClose);
    };
    closeBtn.onclick = closeDrawer;
    overlay.onclick = (event) => {
      if (event.target === overlay) closeDrawer();
    };
    header.append(closeBtn);
    panel.append(header);
    const body = el("div", { class: "rui-sheet-body" });
    for (const child of asArray(props.children)) body.append(helpers.renderNode(child));
    panel.append(body);
    const footer = asArray(props.footer);
    if (footer.length > 0) {
      const footerRow = el("footer", { class: "rui-sheet-footer" });
      for (const child of footer) footerRow.append(helpers.renderNode(child));
      panel.append(footerRow);
    }
    overlay.append(panel);
    return overlay;
  }
};
var TopBar = {
  name: "TopBar",
  description: 'Compact header strip that pairs a title (or breadcrumb) with search and action slots. Use INSTEAD of hand-rolling a `Stack(direction="row")` above a page. For full SaaS shells use `Navbar` (links) or `AppShell` (sidebar + topbar + content).',
  props: [
    { name: "title", type: "string", optional: true },
    { name: "subtitle", type: "string", optional: true },
    { name: "left", type: "Node[]", optional: true, aliases: ["badges"], description: "Leading slot (breadcrumbs, brand, status, badges)" },
    { name: "center", type: "Node[]", optional: true, aliases: ["search"], description: "Centered slot (search bar, segmented control)" },
    { name: "right", type: "Node[]", optional: true, aliases: ["actions"], description: "Trailing slot (actions, avatar)" },
    { name: "sticky", type: "boolean", optional: true }
  ],
  render: (_node, props, helpers) => {
    const root = el("header", {
      class: "rui-topbar",
      "data-sticky": asBoolean(props.sticky) ? "true" : "false"
    });
    const left = el("div", { class: "rui-topbar-side rui-topbar-left" });
    const title = asString(props.title);
    if (title) {
      const titleBlock = el("div", { class: "rui-topbar-title-block" });
      titleBlock.append(el("h2", { class: "rui-topbar-title" }, [title]));
      const subtitle = asString(props.subtitle);
      if (subtitle) titleBlock.append(el("p", { class: "rui-topbar-subtitle" }, [subtitle]));
      left.append(titleBlock);
    }
    for (const child of asArray(props.left)) left.append(helpers.renderNode(child));
    root.append(left);
    const center = asArray(props.center);
    if (center.length > 0) {
      const centerWrap = el("div", { class: "rui-topbar-side rui-topbar-center" });
      for (const child of center) centerWrap.append(helpers.renderNode(child));
      root.append(centerWrap);
    }
    const right = el("div", { class: "rui-topbar-side rui-topbar-right" });
    for (const child of asArray(props.right)) right.append(helpers.renderNode(child));
    root.append(right);
    return root;
  }
};

// ../../src/library/components/router.ts
var NavLink = {
  name: "NavLink",
  description: 'Anchor that navigates to a route on click and stays in sync with the URL hash. Reflects `data-active="true"` (and `aria-current="page"` for assistive tech) when the current path matches `to` (set `exact=true` to require exact equality instead of prefix matching).',
  props: [
    { name: "label", type: "string", description: "Visible link text." },
    { name: "to", type: "string", description: 'Target route path, e.g. "/about".' },
    {
      name: "variant",
      type: "string",
      optional: true,
      enum: ["default", "primary", "ghost", "pill"],
      description: "Visual variant."
    },
    {
      name: "exact",
      type: "boolean",
      optional: true,
      description: "Match the current path exactly (default: prefix match)."
    },
    {
      name: "icon",
      type: "string",
      optional: true,
      description: "Optional Font Awesome icon name shown before the label."
    }
  ],
  render: (_node, props, helpers) => {
    const label = asString(props.label, "");
    const to = asString(props.to, "/");
    const variant = asString(props.variant, "default");
    const exact = asBoolean(props.exact, false);
    const router = helpers.router;
    const currentPath = router.getPath();
    const isActive = (() => {
      if (!currentPath) return false;
      if (exact) return currentPath === to;
      if (to === "/") return currentPath === "/";
      if (currentPath === to) return true;
      return currentPath.startsWith(to + "/");
    })();
    const anchor = el("a", {
      class: "rui-nav-link",
      "data-variant": variant,
      "data-active": isActive ? "true" : "false",
      // Expose the active route to assistive tech, not just CSS.
      "aria-current": isActive ? "page" : null,
      href: "#" + (to.startsWith("/") ? to : "/" + to)
    });
    const iconNode = renderIcon(props.icon, { className: "rui-nav-link-icon" });
    if (iconNode) anchor.append(iconNode);
    anchor.append(el("span", { class: "rui-nav-link-label" }, [label]));
    anchor.onclick = (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      router.navigate(to);
    };
    return anchor;
  }
};

// ../../src/library/components/new-components.ts
var BUTTON_VARIANTS2 = ["primary", "secondary", "ghost", "danger"];
var BUTTON_SIZES2 = ["xs", "sm", "md", "lg", "xl", "small", "normal", "large"];
function normaliseButtonSize2(value) {
  const v = asString(value).trim().toLowerCase();
  if (v === "xs" || v === "extra-small") return "xs";
  if (v === "small" || v === "sm") return "sm";
  if (v === "large" || v === "lg") return "lg";
  if (v === "xl" || v === "extra-large") return "xl";
  if (v === "normal" || v === "md" || v === "") return "md";
  if (v === "xs" || v === "sm" || v === "md" || v === "lg" || v === "xl") return v;
  return "md";
}
function readChipList(raw) {
  return asArray(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry;
      const value2 = asString(obj.value ?? obj.label);
      return { value: value2, label: asString(obj.label, value2) };
    }
    const value = asString(entry);
    return { value, label: value };
  }).filter((c) => c.label !== "");
}
function readPlainObjects(raw) {
  return asArray(raw).filter(
    (e) => !!e && typeof e === "object" && !Array.isArray(e)
  );
}
function readCommandItems(raw) {
  return asArray(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry;
      const value2 = asString(obj.value ?? obj.label);
      return {
        value: value2,
        label: asString(obj.label, value2),
        group: asString(obj.group) || void 0,
        shortcut: asString(obj.shortcut) || void 0,
        action: obj.action
      };
    }
    const value = asString(entry);
    return { value, label: value };
  }).filter((i) => i.label !== "");
}
function readFields(raw) {
  return asArray(raw).map((entry) => {
    if (entry && typeof entry === "object") {
      const obj = entry;
      const name2 = asString(obj.name ?? obj.label);
      return { name: name2, label: asString(obj.label, name2), type: asString(obj.type, "text") || "text" };
    }
    const name = asString(entry);
    return { name, label: name, type: "text" };
  }).filter((f) => f.name !== "");
}
function readGanttTasks(raw) {
  return readPlainObjects(raw).map((t, i) => ({
    id: asString(t.id, `task-${i}`),
    label: asString(t.label ?? t.name, `Task ${i + 1}`),
    start: asString(t.start),
    end: asString(t.end),
    progress: t.progress != null ? asNumber(t.progress, 0) : void 0
  }));
}
function parseIsoDate(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? Date.now() : t;
}
function diffLines(left, right) {
  const a = left.split("\n");
  const b = right.split("\n");
  const max = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < max; i++) {
    const la = a[i];
    const lb = b[i];
    if (la === lb) {
      if (la !== void 0) out.push({ type: "same", text: la });
    } else {
      if (la !== void 0) out.push({ type: "remove", text: la });
      if (lb !== void 0) out.push({ type: "add", text: lb });
    }
  }
  return out;
}
function jsonPreview(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function appendJsonChildren(container, entries, expanded, depth) {
  for (const [key, val] of entries) {
    const row = el("div", { class: "rui-json-tree-row" });
    row.append(el("span", { class: "rui-json-tree-key" }, [`${key}: `]));
    if (val !== null && typeof val === "object") {
      row.append(buildJsonTree(val, expanded, depth + 1));
    } else {
      row.append(el("span", { class: "rui-json-tree-leaf" }, [jsonPreview(val)]));
    }
    container.append(row);
  }
}
function buildJsonTree(data, expanded, depth = 0) {
  const root = el("div", { class: "rui-json-tree-node", "data-depth": String(depth) });
  if (data === null || typeof data !== "object") {
    root.append(el("span", { class: "rui-json-tree-leaf" }, [jsonPreview(data)]));
    return root;
  }
  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v, i) => [String(i), v]) : Object.entries(data);
  const open = expanded || depth < 1;
  const toggle = el("button", {
    type: "button",
    class: "rui-json-tree-toggle",
    "aria-expanded": open ? "true" : "false"
  }, [open ? "\u25BC" : "\u25B6", isArray ? ` Array(${entries.length})` : ` Object`]);
  const children = el("div", { class: "rui-json-tree-children", "data-open": open ? "true" : "false" });
  if (open) appendJsonChildren(children, entries, expanded, depth);
  toggle.onclick = (event) => {
    const liveToggle = event.currentTarget;
    const liveChildren = liveToggle.nextElementSibling;
    if (!liveChildren) return;
    const next = liveChildren.getAttribute("data-open") !== "true";
    liveChildren.setAttribute("data-open", next ? "true" : "false");
    liveToggle.setAttribute("aria-expanded", next ? "true" : "false");
    if (liveToggle.firstChild) liveToggle.firstChild.textContent = next ? "\u25BC" : "\u25B6";
    if (next && liveChildren.childElementCount === 0) {
      appendJsonChildren(liveChildren, entries, expanded, depth);
    } else if (!next) {
      liveChildren.replaceChildren();
    }
  };
  root.append(toggle, children);
  return root;
}
var IconButton = {
  name: "IconButton",
  description: "Icon-only button with an accessible label. Use for toolbars, table row actions, and compact controls.",
  props: [
    { name: "icon", type: "string", description: "Font Awesome icon name" },
    { name: "label", type: "string", description: "Accessible label (visually hidden)" },
    { name: "onClick", type: "callable", optional: true, aliases: ["action", "onclick"] },
    { name: "variant", type: "string", optional: true, aliases: ["tone"], enum: BUTTON_VARIANTS2 },
    { name: "size", type: "string", optional: true, enum: BUTTON_SIZES2 },
    { name: "disabled", type: "boolean", optional: true }
  ],
  render: (_node, props, helpers) => {
    const btn = el("button", {
      class: "rui-icon-button",
      type: "button",
      "data-variant": asString(props.variant, "ghost"),
      "data-size": normaliseButtonSize2(props.size),
      "aria-label": asString(props.label),
      title: asString(props.label),
      disabled: asBoolean(props.disabled) ? "" : null
    });
    const iconNode = renderIcon(props.icon, { className: "rui-icon-button-icon" });
    if (iconNode) btn.append(iconNode);
    btn.onclick = () => helpers.invoke(props.onClick);
    return btn;
  }
};
var CommandPalette = {
  name: "CommandPalette",
  description: "Cmd-K style searchable command list. Pass `items` as `{label, value, group?, shortcut?, action?}` objects.",
  props: [
    { name: "items", type: "any[]" },
    { name: "open", type: "boolean", optional: true, description: "Whether the palette is visible (default true)" },
    { name: "placeholder", type: "string", optional: true },
    { name: "shortcut", type: "string", optional: true, description: "Hint label, e.g. Cmd+K" }
  ],
  render: (_node, props, helpers) => {
    const items = readCommandItems(props.items);
    const propProvided = props.open !== void 0;
    const propOpen = propProvided ? asBoolean(props.open) : true;
    const openSlot = helpers.useInstanceState("open", propOpen);
    if (propProvided && openSlot.get() !== propOpen) openSlot.set(propOpen);
    const filterSlot = helpers.useInstanceState("filter", "");
    const isOpen = propProvided ? propOpen : openSlot.get();
    const host = el("div", { class: "rui-command-palette", "data-open": isOpen ? "true" : "false" });
    if (!isOpen) return host;
    const backdrop = el("div", { class: "rui-command-palette-backdrop" });
    const shell = el("div", { class: "rui-command-palette-panel", role: "dialog", "aria-modal": "true" });
    const header = el("div", { class: "rui-command-palette-header" });
    const search = el("input", {
      type: "text",
      class: "rui-command-palette-input",
      placeholder: asString(props.placeholder, "Search commands\u2026"),
      value: filterSlot.get(),
      autocomplete: "off"
    });
    header.append(search);
    const shortcut = asString(props.shortcut);
    if (shortcut) header.append(el("span", { class: "rui-command-palette-shortcut" }, [shortcut]));
    shell.append(header);
    const list = el("div", { class: "rui-command-palette-list", role: "listbox" });
    const paintList = (target, filter) => {
      target.replaceChildren();
      const lower = filter.trim().toLowerCase();
      const matches = lower === "" ? items : items.filter(
        (i) => i.label.toLowerCase().includes(lower) || i.value.toLowerCase().includes(lower) || (i.group ?? "").toLowerCase().includes(lower)
      );
      let lastGroup = "";
      for (const item of matches.slice(0, 50)) {
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          target.append(el("div", { class: "rui-command-palette-group" }, [lastGroup]));
        }
        const row = el("button", {
          type: "button",
          class: "rui-command-palette-item",
          role: "option",
          "data-value": item.value
        }, [item.label]);
        if (item.shortcut) row.append(el("span", { class: "rui-command-palette-item-kbd" }, [item.shortcut]));
        row.onclick = (event) => {
          event.stopPropagation();
          helpers.invoke(item.action);
          openSlot.set(false);
          filterSlot.set("");
          const liveHost = event.currentTarget.closest(".rui-command-palette");
          const liveShell = liveHost?.querySelector(".rui-command-palette-panel");
          liveHost?.setAttribute("data-open", "false");
          disposeDismissListeners(liveShell ?? null);
        };
        target.append(row);
      }
      if (matches.length === 0) {
        target.append(el("div", { class: "rui-command-palette-empty" }, ["No commands found"]));
      }
    };
    paintList(list, filterSlot.get());
    shell.append(list);
    backdrop.onclick = (event) => {
      const liveHost = event.currentTarget.closest(".rui-command-palette");
      const liveShell = liveHost?.querySelector(".rui-command-palette-panel");
      openSlot.set(false);
      liveHost?.setAttribute("data-open", "false");
      disposeDismissListeners(liveShell ?? null);
    };
    host.append(backdrop, shell);
    search.oninput = (event) => {
      const target = event.currentTarget;
      const liveList = target.closest(".rui-command-palette-panel")?.querySelector(".rui-command-palette-list");
      filterSlot.set(target.value);
      if (liveList) paintList(liveList, target.value);
    };
    search.onkeydown = (event) => {
      if (event.key === "Escape") {
        const liveHost = event.currentTarget.closest(".rui-command-palette");
        const liveShell = liveHost?.querySelector(".rui-command-palette-panel");
        openSlot.set(false);
        liveHost?.setAttribute("data-open", "false");
        disposeDismissListeners(liveShell ?? null);
      }
    };
    setTimeout(() => search.focus(), 0);
    installDismissListeners({
      liveRoot: shell,
      key: "command-palette",
      onDismiss: () => {
        openSlot.set(false);
        host.setAttribute("data-open", "false");
      }
    });
    return host;
  }
};
var FilterChips = {
  name: "FilterChips",
  description: "Removable filter chips with an optional clear-all control.",
  props: [
    { name: "chips", type: "any[]", description: "Array of strings or {label, value} objects" },
    { name: "onRemove", type: "callable", optional: true, description: "Receives the removed chip value as an argument" },
    { name: "onClear", type: "callable", optional: true }
  ],
  render: (_node, props, helpers) => {
    const chips = readChipList(props.chips);
    const root = el("div", { class: "rui-filter-chips" });
    const row = el("div", { class: "rui-filter-chips-row" });
    for (const chip of chips) {
      const pill = el("span", { class: "rui-filter-chip", "data-value": chip.value });
      pill.append(el("span", { class: "rui-filter-chip-label" }, [chip.label]));
      const remove = el("button", {
        type: "button",
        class: "rui-filter-chip-remove",
        "aria-label": `Remove ${chip.label}`
      });
      const xIcon = renderIcon("xmark", { className: "rui-filter-chip-remove-icon" });
      if (xIcon) remove.append(xIcon);
      remove.onclick = () => helpers.invoke(props.onRemove, chip.value);
      pill.append(remove);
      row.append(pill);
    }
    root.append(row);
    if (chips.length > 0 && typeof props.onClear === "function") {
      const clear = el("button", { type: "button", class: "rui-filter-chips-clear" }, ["Clear all"]);
      clear.onclick = () => helpers.invoke(props.onClear);
      root.append(clear);
    }
    return root;
  }
};
var FieldRepeater = {
  name: "FieldRepeater",
  description: "Dynamic list of field groups. Pass `items` as row objects and `fields` as `{name, label, type?}` definitions.",
  props: [
    { name: "items", type: "any[]" },
    { name: "fields", type: "any[]" },
    { name: "onAdd", type: "callable", optional: true },
    { name: "onRemove", type: "callable", optional: true, description: "Receives the removed row's 0-indexed position" },
    { name: "addLabel", type: "string", optional: true }
  ],
  render: (_node, props, helpers) => {
    const rows = readPlainObjects(props.items);
    const fields = readFields(props.fields);
    const root = el("div", { class: "rui-field-repeater" });
    rows.forEach((row, index) => {
      const card = el("div", { class: "rui-field-repeater-row", "data-index": String(index) });
      const grid = el("div", { class: "rui-field-repeater-grid" });
      for (const field of fields) {
        const wrap = el("label", { class: "rui-field-repeater-field" });
        wrap.append(el("span", { class: "rui-field-repeater-label" }, [field.label]));
        const input = el("input", {
          class: "rui-input",
          type: field.type === "number" ? "number" : "text",
          name: `${field.name}-${index}`,
          value: asString(row[field.name]),
          readonly: ""
        });
        wrap.append(input);
        grid.append(wrap);
      }
      card.append(grid);
      if (typeof props.onRemove === "function") {
        const remove = el("button", {
          type: "button",
          class: "rui-field-repeater-remove",
          "aria-label": "Remove row"
        }, ["Remove"]);
        remove.onclick = () => helpers.invoke(props.onRemove, index);
        card.append(remove);
      }
      root.append(card);
    });
    if (typeof props.onAdd === "function") {
      const add = el("button", {
        type: "button",
        class: "rui-field-repeater-add rui-button",
        "data-variant": "secondary"
      }, [asString(props.addLabel, "Add row")]);
      add.onclick = () => helpers.invoke(props.onAdd);
      root.append(add);
    }
    return root;
  }
};
var VirtualList = {
  name: "VirtualList",
  description: "Windowed vertical list for large datasets. Pass pre-rendered nodes as `items` or plain row objects plus a `renderItem` component node per row.",
  props: [
    { name: "items", type: "any[]" },
    { name: "itemHeight", type: "number", optional: true, description: "Fixed row height in px (default 40)" },
    { name: "renderItem", type: "Node", optional: true, description: "Template node rendered per data row" }
  ],
  render: (_node, props, helpers) => {
    const itemHeight = Math.max(24, asNumber(props.itemHeight, 40));
    const rawItems = asArray(props.items);
    const viewport = el("div", { class: "rui-virtual-list" });
    const scrollEl = el("div", { class: "rui-virtual-list-scroller" });
    const spacer = el("div", { class: "rui-virtual-list-spacer" });
    const windowEl = el("div", { class: "rui-virtual-list-window" });
    const total = rawItems.length;
    spacer.style.height = `${total * itemHeight}px`;
    spacer.style.position = "relative";
    windowEl.style.position = "absolute";
    windowEl.style.top = "0";
    windowEl.style.left = "0";
    windowEl.style.right = "0";
    scrollEl.style.maxHeight = `${Math.min(Math.max(total, 1), 12) * itemHeight}px`;
    scrollEl.style.overflow = "auto";
    const renderSlice = (startIndex) => {
      windowEl.replaceChildren();
      const viewHeight = scrollEl.clientHeight || itemHeight * 12;
      const visible = Math.ceil(viewHeight / itemHeight) + 2;
      const start = Math.max(0, startIndex);
      const end = Math.min(total, start + visible);
      windowEl.style.transform = `translateY(${start * itemHeight}px)`;
      for (let i = start; i < end; i++) {
        const entry = rawItems[i];
        if (props.renderItem) {
          windowEl.append(helpers.renderNode(entry ?? props.renderItem));
        } else if (entry && typeof entry === "object" && entry.__kind) {
          windowEl.append(helpers.renderNode(entry));
        } else {
          const row = el("div", { class: "rui-virtual-list-item", style: `height:${itemHeight}px` });
          row.append(el("span", {}, [asString(entry)]));
          windowEl.append(row);
        }
      }
    };
    scrollEl.onscroll = () => {
      const start = Math.floor(scrollEl.scrollTop / itemHeight);
      renderSlice(start);
    };
    renderSlice(0);
    scrollEl.append(spacer, windowEl);
    viewport.append(scrollEl);
    return viewport;
  }
};
var QueryBuilder = {
  name: "QueryBuilder",
  description: "Visual filter builder. Pass `fields` as `{name, label, type?}` and bind `value` to a rule array.",
  props: [
    { name: "fields", type: "any[]" },
    { name: "value", type: "any[]", optional: true },
    { name: "onChange", type: "callable", optional: true, description: "Receives the next rule array" }
  ],
  render: (node, props, helpers) => {
    const fields = readFields(props.fields);
    const rules = readPlainObjects(props.value);
    const stateRef = node.argMeta?.[1]?.stateRef;
    const root = el("div", { class: "rui-query-builder" });
    const paint = (current) => {
      root.replaceChildren();
      current.forEach((rule, index) => {
        const row = el("div", { class: "rui-query-builder-row", "data-index": String(index) });
        const fieldSelect = el("select", { class: "rui-select rui-query-builder-field" });
        for (const f of fields) {
          fieldSelect.append(el("option", { value: f.name }, [f.label]));
        }
        fieldSelect.value = asString(rule.field ?? fields[0]?.name);
        const opSelect = el("select", { class: "rui-select rui-query-builder-op" }, []);
        for (const op of ["equals", "contains", "gt", "lt"]) {
          opSelect.append(el("option", { value: op }, [op]));
        }
        opSelect.value = asString(rule.op, "equals");
        const valueInput = el("input", {
          class: "rui-input rui-query-builder-value",
          value: asString(rule.value)
        });
        row.append(fieldSelect, opSelect, valueInput);
        const remove = el("button", { type: "button", class: "rui-query-builder-remove" }, ["\xD7"]);
        remove.onclick = () => {
          const next = current.filter((_, i) => i !== index);
          if (stateRef) helpers.setState(stateRef, next);
          else helpers.invoke(props.onChange, next);
          paint(next);
        };
        row.append(remove);
        root.append(row);
      });
      const add = el("button", { type: "button", class: "rui-query-builder-add" }, ["Add rule"]);
      add.onclick = () => {
        const next = [...current, { field: fields[0]?.name ?? "", op: "equals", value: "" }];
        if (stateRef) helpers.setState(stateRef, next);
        else helpers.invoke(props.onChange, next);
        paint(next);
      };
      root.append(add);
    };
    paint(rules.length > 0 ? rules : [{ field: fields[0]?.name ?? "", op: "equals", value: "" }]);
    return root;
  }
};
var DiffViewer = {
  name: "DiffViewer",
  description: "Side-by-side or unified diff of two text blobs.",
  props: [
    { name: "left", type: "string" },
    { name: "right", type: "string" },
    { name: "mode", type: "string", optional: true, enum: ["split", "unified"], description: "Default split" }
  ],
  render: (_node, props) => {
    const left = asString(props.left);
    const right = asString(props.right);
    const mode = asString(props.mode, "split");
    const root = el("div", { class: "rui-diff-viewer", "data-mode": mode });
    if (mode === "unified") {
      const body = el("pre", { class: "rui-diff-viewer-unified" });
      for (const line of diffLines(left, right)) {
        body.append(el("div", { class: `rui-diff-line rui-diff-line-${line.type}` }, [
          (line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  ") + line.text
        ]));
      }
      root.append(body);
      return root;
    }
    const panes = el("div", { class: "rui-diff-viewer-panes" });
    const leftPane = el("pre", { class: "rui-diff-viewer-pane rui-diff-viewer-left" }, [left]);
    const rightPane = el("pre", { class: "rui-diff-viewer-pane rui-diff-viewer-right" }, [right]);
    panes.append(leftPane, rightPane);
    root.append(panes);
    return root;
  }
};
var JsonTree = {
  name: "JsonTree",
  description: "Expandable JSON tree viewer for objects and arrays.",
  props: [
    { name: "data", type: "any" },
    { name: "expanded", type: "boolean", optional: true, description: "Expand all nodes (default: first level only)" }
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-json-tree" });
    root.append(buildJsonTree(props.data, asBoolean(props.expanded)));
    return root;
  }
};
var Gantt = {
  name: "Gantt",
  description: "Simple Gantt chart. Pass `tasks` as `{id, label, start, end, progress?}` ISO date strings.",
  props: [
    { name: "tasks", type: "any[]" },
    { name: "startDate", type: "string", optional: true },
    { name: "endDate", type: "string", optional: true }
  ],
  render: (_node, props) => {
    const tasks = readGanttTasks(props.tasks);
    const starts = tasks.map((t) => parseIsoDate(t.start));
    const ends = tasks.map((t) => parseIsoDate(t.end));
    const rangeStart = props.startDate ? parseIsoDate(asString(props.startDate)) : starts.length ? Math.min(...starts) : Date.now();
    const rangeEnd = props.endDate ? parseIsoDate(asString(props.endDate)) : ends.length ? Math.max(...ends) : rangeStart + 864e5;
    const span = Math.max(rangeEnd - rangeStart, 1);
    const root = el("div", { class: "rui-gantt" });
    const track = el("div", { class: "rui-gantt-track" });
    for (const task of tasks) {
      const row = el("div", { class: "rui-gantt-row" });
      row.append(el("div", { class: "rui-gantt-label" }, [task.label]));
      const barWrap = el("div", { class: "rui-gantt-bars" });
      const startPct = (parseIsoDate(task.start) - rangeStart) / span * 100;
      const widthPct = Math.max(
        (parseIsoDate(task.end) - parseIsoDate(task.start)) / span * 100,
        2
      );
      const bar = el("div", {
        class: "rui-gantt-bar",
        style: `left:${startPct}%;width:${widthPct}%`,
        title: `${task.start} \u2192 ${task.end}`
      });
      if (task.progress != null) {
        bar.append(el("div", {
          class: "rui-gantt-bar-progress",
          style: `width:${Math.min(100, Math.max(0, task.progress))}%`
        }));
      }
      barWrap.append(bar);
      row.append(barWrap);
      track.append(row);
    }
    root.append(track);
    return root;
  }
};
var Truncate = {
  name: "Truncate",
  description: "Clamp long text with an expand control.",
  props: [
    { name: "text", type: "string" },
    { name: "maxLines", type: "number", optional: true, description: "Lines before clamping (default 3)" },
    { name: "expandLabel", type: "string", optional: true }
  ],
  render: (_node, props, helpers) => {
    const maxLines = Math.max(1, Math.floor(asNumber(props.maxLines, 3)));
    const expandedSlot = helpers.useInstanceState("expanded", false);
    const clampStyle = `display:-webkit-box;-webkit-line-clamp:${maxLines};-webkit-box-orient:vertical;overflow:hidden`;
    const root = el("div", { class: "rui-truncate", "data-expanded": expandedSlot.get() ? "true" : "false" });
    const body = el("p", {
      class: "rui-truncate-text",
      style: expandedSlot.get() ? "" : clampStyle
    }, [asString(props.text)]);
    const toggle = el("button", {
      type: "button",
      class: "rui-truncate-toggle"
    }, [expandedSlot.get() ? "Show less" : asString(props.expandLabel, "Show more")]);
    toggle.onclick = (event) => {
      const liveToggle = event.currentTarget;
      const liveRoot = liveToggle.closest(".rui-truncate");
      const liveBody = liveRoot?.querySelector(".rui-truncate-text");
      if (!liveRoot || !liveBody) return;
      const next = !expandedSlot.get();
      expandedSlot.set(next);
      liveBody.style.cssText = next ? "" : clampStyle;
      liveToggle.textContent = next ? "Show less" : asString(props.expandLabel, "Show more");
      liveRoot.setAttribute("data-expanded", next ? "true" : "false");
    };
    root.append(body, toggle);
    return root;
  }
};
var InlineEdit = {
  name: "InlineEdit",
  description: "Click-to-edit inline field with save on Enter or blur.",
  props: [
    { name: "value", type: "string" },
    { name: "label", type: "string", optional: true },
    { name: "onSave", type: "callable", optional: true, description: "Receives the committed draft string" }
  ],
  render: (node, props, helpers) => {
    const editingSlot = helpers.useInstanceState("editing", false);
    const draftSlot = helpers.useInstanceState("draft", asString(props.value));
    const stateRef = node.argMeta?.[0]?.stateRef;
    const root = el("div", { class: "rui-inline-edit", "data-editing": editingSlot.get() ? "true" : "false" });
    const label = asString(props.label);
    if (label) root.append(el("span", { class: "rui-inline-edit-label" }, [label]));
    const display = el("button", {
      type: "button",
      class: "rui-inline-edit-display"
    }, [asString(props.value)]);
    const input = el("input", {
      class: "rui-inline-edit-input rui-input",
      value: draftSlot.get()
    });
    const resolveLive = (origin) => {
      const liveRoot = origin.closest(".rui-inline-edit");
      const liveInput = liveRoot?.querySelector(".rui-inline-edit-input");
      if (!liveRoot || !liveInput) return null;
      return { root: liveRoot, input: liveInput };
    };
    const commit = (origin) => {
      const live = resolveLive(origin);
      editingSlot.set(false);
      live?.root.setAttribute("data-editing", "false");
      const draft = draftSlot.get();
      if (stateRef) helpers.setState(stateRef, draft);
      helpers.invoke(props.onSave, draft);
    };
    display.onclick = (event) => {
      const live = resolveLive(event.currentTarget);
      draftSlot.set(asString(props.value));
      editingSlot.set(true);
      if (live) {
        live.root.setAttribute("data-editing", "true");
        live.input.value = draftSlot.get();
        setTimeout(() => live.input.focus(), 0);
      }
    };
    input.oninput = (event) => draftSlot.set(event.currentTarget.value);
    input.onkeydown = (event) => {
      const kev = event;
      if (kev.key === "Enter") commit(event.currentTarget);
      if (kev.key === "Escape") {
        const live = resolveLive(event.currentTarget);
        editingSlot.set(false);
        live?.root.setAttribute("data-editing", "false");
      }
    };
    input.onblur = (event) => commit(event.currentTarget);
    root.append(display, input);
    return root;
  }
};
var NotificationBell = {
  name: "NotificationBell",
  description: "Bell icon with unread count badge and dropdown notification list.",
  props: [
    { name: "count", type: "number", optional: true },
    { name: "items", type: "any[]", optional: true, description: "{title, message?, time?} objects" },
    { name: "onOpen", type: "callable", optional: true }
  ],
  render: (_node, props, helpers) => {
    const count = Math.max(0, Math.floor(asNumber(props.count, 0)));
    const items = readPlainObjects(props.items);
    const openSlot = helpers.useInstanceState("open", false);
    const isOpen = openSlot.get();
    const root = el("div", { class: "rui-notification-bell", "data-open": isOpen ? "true" : "false" });
    const trigger = el("button", {
      type: "button",
      class: "rui-notification-bell-trigger",
      "aria-expanded": isOpen ? "true" : "false",
      "aria-haspopup": "true"
    });
    const bell = renderIcon("bell", { className: "rui-notification-bell-icon" });
    if (bell) trigger.append(bell);
    if (count > 0) {
      trigger.append(el("span", { class: "rui-notification-bell-badge" }, [
        count > 99 ? "99+" : String(count)
      ]));
    }
    root.append(trigger);
    const panel = el("div", { class: "rui-notification-bell-panel", role: "menu" });
    if (items.length === 0) {
      panel.append(el("div", { class: "rui-notification-bell-empty" }, ["No notifications"]));
    } else {
      for (const item of items) {
        const row = el("div", { class: "rui-notification-bell-item" });
        row.append(el("div", { class: "rui-notification-bell-item-title" }, [asString(item.title)]));
        const msg = asString(item.message);
        if (msg) row.append(el("div", { class: "rui-notification-bell-item-message" }, [msg]));
        const time = asString(item.time);
        if (time) row.append(el("div", { class: "rui-notification-bell-item-time" }, [time]));
        panel.append(row);
      }
    }
    root.append(panel);
    trigger.onclick = (event) => {
      event.stopPropagation();
      const liveTrigger = event.currentTarget;
      const liveRoot = liveTrigger.closest(".rui-notification-bell");
      if (!liveRoot) return;
      const next = !openSlot.get();
      openSlot.set(next);
      liveRoot.setAttribute("data-open", next ? "true" : "false");
      liveTrigger.setAttribute("aria-expanded", next ? "true" : "false");
      if (next) {
        helpers.invoke(props.onOpen);
        installDismissListeners({
          liveRoot,
          key: "notification-bell",
          onDismiss: () => {
            openSlot.set(false);
            liveRoot.setAttribute("data-open", "false");
            liveTrigger.setAttribute("aria-expanded", "false");
          }
        });
      } else {
        disposeDismissListeners(liveRoot);
      }
    };
    return root;
  }
};

// ../../src/library/components/helpers.ts
var renderChild = (helpers, value) => {
  if (value == null) return document.createDocumentFragment();
  return helpers.renderNode(value);
};
var isResourceShape = (value) => {
  return Boolean(value && typeof value === "object");
};
var Async = {
  name: "Async",
  description: "Render `loading`, `error`, `empty`, or `data` slot based on an `$http({...})` resource's state.",
  props: [
    { name: "resource", type: "any", positional: true, required: true },
    { name: "loading", type: "Node", optional: true },
    { name: "error", type: "Node", optional: true },
    { name: "empty", type: "Node", optional: true },
    { name: "data", type: "Node", optional: true }
  ],
  render: (_node, props, helpers) => {
    const resource = props.resource;
    const slots = {
      loading: props.loading,
      error: props.error,
      empty: props.empty,
      data: props.data
    };
    if (!isResourceShape(resource)) {
      return renderChild(helpers, slots.empty ?? slots.data ?? null);
    }
    const state = resource.state;
    if (state === "loading" || resource.loading) {
      return renderChild(helpers, slots.loading ?? null);
    }
    if (state === "error" || resource.error) {
      return renderChild(helpers, slots.error ?? null);
    }
    const data = resource.data;
    if (data === void 0 || data === null || Array.isArray(data) && data.length === 0) {
      return renderChild(helpers, slots.empty ?? slots.data ?? null);
    }
    return renderChild(helpers, slots.data ?? null);
  }
};
var Show = {
  name: "Show",
  description: "Conditional renderer. Sugar over `if expr { children } else { fallback }`.",
  props: [
    { name: "when", type: "any", positional: true, required: true },
    { name: "fallback", type: "Node", optional: true },
    { name: "children", type: "Node[]", optional: true }
  ],
  render: (_node, props, helpers) => {
    if (props.when) {
      return renderChild(helpers, props.children ?? null);
    }
    return renderChild(helpers, props.fallback ?? null);
  }
};
var Portal = {
  name: "Portal",
  description: "Render children outside the parent subtree (e.g. into document.body).",
  props: [
    { name: "target", type: "string", optional: true },
    { name: "children", type: "Node[]", positional: true }
  ],
  render: (_node, props, helpers) => {
    const target = asString(props.target);
    let mount = null;
    if (target) {
      try {
        mount = document.querySelector(target);
      } catch {
        mount = null;
      }
    }
    if (!mount) mount = document.body;
    const container = el("div", { class: "rui-portal" });
    for (const child of asArray(props.children)) {
      container.append(helpers.renderNode(child));
    }
    if (mount) {
      mount.append(container);
      helpers.registerDisposer(() => {
        if (container.parentNode) container.parentNode.removeChild(container);
      });
    }
    return el("span", { class: "rui-portal-anchor", "data-portal": target ?? "body" });
  }
};
var Redirect = {
  name: "Redirect",
  description: "Navigate to `path` and unmount the rest of the subtree.",
  props: [
    { name: "path", type: "string", positional: true, required: true }
  ],
  render: (_node, props, helpers) => {
    const path = asString(props.path);
    if (path) {
      try {
        helpers.router.navigate(path);
      } catch {
      }
    }
    return el("span", { class: "rui-redirect", "data-path": path, hidden: "true" });
  }
};
var Lazy = {
  name: "Lazy",
  description: "Defer rendering until an async `loader` resolves: show `fallback` while pending, then render the resolved value (or `children`). A synchronous loader value renders immediately.",
  props: [
    { name: "loader", type: "any", positional: true, required: true },
    { name: "fallback", type: "Node", optional: true },
    { name: "children", type: "Node[]", optional: true }
  ],
  render: (_node, props, helpers) => {
    const loader = props.loader;
    const slot = helpers.useInstanceState("rui-lazy", { status: "init" });
    const wrapper = el("span", { class: "rui-lazy", style: "display: contents;" });
    const paint = (value) => {
      wrapper.replaceChildren(renderChild(helpers, value));
    };
    const fallback = () => props.fallback ?? null;
    const resolvedContent = (value) => value ?? props.children ?? null;
    const state = slot.get();
    if (state.status === "resolved") {
      paint(resolvedContent(state.value));
      return wrapper;
    }
    if (state.status === "pending" || state.status === "error") {
      paint(fallback());
      return wrapper;
    }
    let result;
    try {
      result = typeof loader === "function" ? loader() : loader;
    } catch {
      slot.set({ status: "error" });
      paint(fallback());
      return wrapper;
    }
    if (result && typeof result.then === "function") {
      slot.set({ status: "pending" });
      paint(fallback());
      let cancelled = false;
      helpers.registerDisposer(() => {
        cancelled = true;
      }, "rui-lazy-cancel");
      void result.then(
        (value) => {
          if (cancelled) return;
          slot.set({ status: "resolved", value });
          paint(resolvedContent(value));
        },
        () => {
          if (cancelled) return;
          slot.set({ status: "error" });
          paint(fallback());
        }
      );
      return wrapper;
    }
    slot.set({ status: "resolved", value: result });
    paint(resolvedContent(result));
    return wrapper;
  }
};
var ErrorBoundary = {
  name: "ErrorBoundary",
  description: "Render a fallback subtree when rendering children throws.",
  props: [
    { name: "fallback", type: "Node", optional: true },
    { name: "onError", type: "callable", optional: true },
    { name: "children", type: "Node[]", positional: true }
  ],
  render: (_node, props, helpers) => {
    const wrapper = el("div", { class: "rui-error-boundary" });
    try {
      for (const child of asArray(props.children)) {
        wrapper.append(helpers.renderNode(child));
      }
      return wrapper;
    } catch (err) {
      try {
        helpers.invoke(props.onError, err);
      } catch {
      }
      const fallback = renderChild(helpers, props.fallback ?? null);
      const errorWrapper = el("div", { class: "rui-error-boundary rui-error-boundary--fallback" });
      errorWrapper.append(fallback);
      errorWrapper.setAttribute("data-error", err instanceof Error ? err.message : String(err));
      return errorWrapper;
    }
  }
};

// ../../src/library/components/escape-hatch.ts
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "div",
  "span",
  "p",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "nav",
  "aside",
  "figure",
  "figcaption",
  "details",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "colgroup",
  "col",
  "a",
  "img",
  "picture",
  "source",
  "video",
  "audio",
  "track",
  "small",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "mark",
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
  "sub",
  "sup",
  "abbr",
  "cite",
  "blockquote",
  "q",
  "time",
  "address",
  "ins",
  "del",
  "ruby",
  "rt",
  "rp",
  "bdi",
  "bdo",
  "br",
  "hr",
  "wbr",
  "hgroup",
  "label",
  "fieldset",
  "legend",
  "progress",
  "meter",
  "output"
]);
var ATTR_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_:-]*$/;
var URL_ATTRS_HREF = /* @__PURE__ */ new Set(["href", "ping", "action", "formaction"]);
var URL_ATTRS_SRC = /* @__PURE__ */ new Set(["src", "poster"]);
function sanitiseInlineStyleAttr(value) {
  const raw = asString(value).trim();
  if (!raw) return "";
  if (/[<>]/.test(raw)) return "";
  if (/\bexpression\s*\(|\bjavascript\s*:|\bbehavior\s*:|@import\b/i.test(raw)) return "";
  return raw;
}
function resolveTagName(input) {
  const name = asString(input).trim().toLowerCase();
  if (!name) return "div";
  if (!ALLOWED_TAGS.has(name)) return "div";
  return name;
}
function buildAttrs(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim();
    if (!key) continue;
    if (!ATTR_NAME_RE.test(key)) continue;
    const lower = key.toLowerCase();
    if (lower.startsWith("on")) continue;
    if (rawValue === null || rawValue === void 0 || rawValue === false) continue;
    if (lower === "style") {
      const style = sanitiseInlineStyleAttr(rawValue);
      if (style) out.style = style;
      continue;
    }
    if (URL_ATTRS_HREF.has(lower)) {
      const safe = sanitiseHref(rawValue, "");
      if (safe) out[key] = safe;
      continue;
    }
    if (URL_ATTRS_SRC.has(lower)) {
      const safe = sanitiseImageSrc(rawValue);
      if (safe) out[key] = safe;
      continue;
    }
    out[key] = rawValue === true ? "" : asString(rawValue);
  }
  return out;
}
var HTMLTag = {
  name: "HTMLTag",
  description: "Escape-hatch primitive that renders an allow-listed HTML tag with the given attributes and children. Use ONLY when the standard component catalogue cannot express the markup (custom semantic elements, inline SVG, third-party widget mounts). Tag names outside the allow-list collapse to `div`. Attribute names matching `on*` (event handlers) are dropped, `href`/`src` are sanitised, and `style` is filtered for `expression()` / `javascript:` / `@import`. Pass children as an array of components \u2014 strings render as text nodes.",
  props: [
    { name: "tag", type: "string", positional: true, required: true, description: 'HTML tag name (e.g. "div", "section", "svg"). Falls back to `div` when outside the allow-list.' },
    { name: "attributes", type: "object", optional: true, aliases: ["attrs", "props"], description: 'Plain object of attribute name \u2192 value pairs (e.g. `{ class: "hero", "data-id": 1 }`). `on*` handlers are dropped.' },
    { name: "children", type: "Node[]", optional: true, description: "Child components or text nodes to render inside the tag." }
  ],
  render: (_node, props, helpers) => {
    const tag = resolveTagName(props.tag);
    const attrs = buildAttrs(props.attributes);
    const root = el(tag, attrs);
    for (const child of asArray(props.children)) {
      if (child === null || child === void 0) continue;
      if (typeof child === "string") {
        root.append(document.createTextNode(child));
        continue;
      }
      if (typeof child === "number" || typeof child === "boolean") {
        root.append(document.createTextNode(String(child)));
        continue;
      }
      root.append(helpers.renderNode(child));
    }
    return root;
  }
};
var STYLES_BLOCK_RE = /<\/style|<script|expression\s*\(|javascript\s*:|behavior\s*:|@import\b/i;
var STYLES_MAX_LENGTH = 64 * 1024;
function sanitiseStyleSheet(input) {
  const raw = asString(input);
  if (!raw) return "";
  if (raw.length > STYLES_MAX_LENGTH) return "";
  if (STYLES_BLOCK_RE.test(raw)) return "";
  return raw;
}
var Styles = {
  name: "Styles",
  description: "Escape-hatch primitive that injects a `<style>` block containing the given CSS rules. Use ONLY when a layout cannot be expressed via component props or the `$theme(...)` token map. The CSS is rendered verbatim into the document so authors can target their own `HTMLTag` markup or scope rules to a wrapper class. Payloads containing `</style>`, `<script>`, `expression(`, `javascript:`, `behavior:`, or `@import` are dropped for safety.",
  props: [
    { name: "css", type: "string", positional: true, required: true, aliases: ["content", "rules"], description: 'Raw CSS text (e.g. `".hero { color: red; }"`).' }
  ],
  render: (_node, props) => {
    const css = sanitiseStyleSheet(props.css);
    const node = document.createElement("style");
    node.setAttribute("class", "rui-styles");
    if (css) node.textContent = css;
    return node;
  }
};

// ../../src/library/index.ts
var components = [
  Row,
  Column,
  Center,
  Stack,
  StackItem,
  Grid,
  GridItem,
  Box,
  Card,
  CardHeader,
  CardFooter,
  Separator,
  Tabs,
  TabItem,
  Accordion,
  AccordionItem,
  Modal,
  Steps,
  AspectRatio,
  ScrollArea,
  Container,
  Spacer,
  Text,
  TextContent,
  Image,
  Link,
  Badge,
  BadgeList,
  Callout,
  CodeBlock,
  Skeleton,
  Markdown,
  Quote,
  Icon,
  Spinner,
  Form,
  FormControl,
  Input,
  TextArea,
  Select,
  SelectItem,
  Checkbox,
  CheckBoxGroup,
  CheckBoxItem,
  Radio,
  Button,
  Buttons,
  SearchBar,
  Slider,
  NumberInput,
  DatePicker,
  FileUpload,
  Combobox,
  MultiSelect,
  DateRangePicker,
  Table,
  Col,
  List,
  ListItem,
  StatCard,
  Sparkline,
  Tree,
  TreeNode,
  BarChart,
  LineChart,
  PieChart,
  Series,
  SectionBlock,
  ListBlock,
  FollowUpBlock,
  FollowUpItem,
  ActionLink,
  ChatBubble,
  Avatar,
  AvatarGroup,
  Progress,
  ProgressRing,
  Switch,
  ToggleGroup,
  Tooltip,
  HoverCard,
  Popover,
  Toast,
  Kbd,
  Rating,
  Breadcrumb,
  BreadcrumbItem,
  Pagination,
  Navbar,
  NavbarItem,
  DropdownMenu,
  MenuItem,
  MenuSeparator,
  MenuLabel,
  Hero,
  PageHeader,
  Stats,
  Tile,
  EmptyState,
  Timeline,
  TimelineItem,
  FeatureGrid,
  FeatureItem,
  Testimonial,
  ProfileCard,
  PersonChip,
  Comment,
  Banner,
  Notification,
  MediaCard,
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  SectionHeader,
  Toolbar,
  Sidebar,
  SidebarSection,
  SidebarItem,
  AppShell,
  SplitView,
  DescriptionList,
  DescriptionItem,
  StatusDot,
  PricingTable,
  PricingCard,
  // Advanced data
  DataGrid,
  CalendarView,
  ActivityLog,
  ComparisonTable,
  InfiniteList,
  // Media
  VideoPlayer,
  AudioPlayer,
  Carousel,
  Gallery,
  Lightbox,
  Map2,
  // Editors
  RichTextEditor,
  CodeEditor,
  ContextMenu,
  ColorPicker,
  // More charts
  Gauge,
  Heatmap,
  RadarChart,
  ScatterChart,
  Histogram,
  // Advanced forms
  PinInput,
  PasswordInput,
  TagInput,
  MentionInput,
  TimePicker,
  DateTimePicker,
  MaskedInput,
  FormSection,
  FieldSet,
  ValidationSummary,
  MultiStepForm,
  // Advanced patterns + state cards
  InboxPanel,
  OnboardingChecklist,
  LoadingState,
  ErrorState,
  SuccessState,
  Tour,
  Spotlight,
  Sticky,
  ResizablePanels,
  MasonryGrid,
  Drawer,
  TopBar,
  NavLink,
  IconButton,
  CommandPalette,
  FilterChips,
  FieldRepeater,
  VirtualList,
  QueryBuilder,
  DiffViewer,
  JsonTree,
  Gantt,
  Truncate,
  InlineEdit,
  NotificationBell,
  // Aktion 0.5 standard helpers
  Async,
  Show,
  Portal,
  Redirect,
  Lazy,
  ErrorBoundary,
  // Behavioural & styling wrappers
  OnClick,
  OnMouse,
  OnKeyboard,
  OnFocus,
  OnIntersect,
  OnMount,
  Css,
  Link,
  // Escape hatches for raw HTML / CSS — last-resort primitives
  HTMLTag,
  Styles
];
var componentGroups = [
  {
    name: "Layout",
    components: [
      "Column",
      "Row",
      "Center",
      "Stack",
      "StackItem",
      "Grid",
      "GridItem",
      "Box",
      "Container",
      "Spacer",
      "Card",
      "CardHeader",
      "CardFooter",
      "Separator",
      "Tabs",
      "TabItem",
      "Accordion",
      "AccordionItem",
      "Modal",
      "Drawer",
      "Steps",
      "AspectRatio",
      "ScrollArea",
      "Sticky",
      "ResizablePanels",
      "MasonryGrid"
    ],
    notes: [
      "- THREE primitives cover almost everything: `Column` (stack top\u2192bottom), `Row` (left\u2192right), and `Grid` (equal columns / card walls). Reach for these first.",
      "- `root` is normally a `Column([...])` (or `Container([...])` for a centered page). A `Column` is the page body; put each major chunk in a `Card(...)`.",
      "- `Row([...])` keeps children at their natural width and vertically centered \u2014 ideal for toolbars, button rows, label+value pairs, nav bars. Use `justify` to distribute (`between`, `center`, `end`) and `gap` for spacing.",
      "- `Grid([...], { columns: N })` = N equal columns. Omit `columns` for auto-fit (wraps as many \u2265`minChildWidth` columns as fit \u2014 best for KPI/card grids). Prefer `Grid` over a wrapping `Row` whenever cells should share a width.",
      '- For a 12-column dashboard / sidebar layout use `GridItem` spans: `Grid([GridItem(side, { span: "1/4" }), GridItem(main, { span: "3/4" })])`. Fractions `"1/2"`\u2026`"1/12"` (or numbers 1\u201312) resolve on a 12-track grid; any `GridItem` child turns the grid on automatically.',
      '- `Center([...], { minHeight })` centers content on both axes \u2014 spinners, empty states, hero CTAs, modal bodies. Add `minHeight: "60vh"` to center vertically in a region.',
      '- `Stack` is the responsive escape hatch: use it ONLY when the direction itself must change across breakpoints, e.g. `Stack([...], { direction: {base: "column", md: "row"} })`.',
      "- Make one child in a `Row` expand with `StackItem(child, { grow: 1 })` (e.g. a search input beside a fixed button), or push items apart with a bare `Spacer()` between them.",
      "- `Container([...], { size })` centers a wide page within a comfortable max-width (sm/md/lg/xl/full) \u2014 landing pages, articles, marketing sections.",
      "- `Box([...], { padding?, margin?, border?, background?, maxWidth? })` is a plain spacing/surface wrapper for when a `Card` is too heavy.",
      '- `Separator(orientation?, label?)` adds a visual break between sections; pass a `label` for a centered "OR"-style divider.',
      "- `gap`/`padding` spacing tokens are `xs|s|m|l|xl`; `align`/`justify`/`columns`/`direction`/`gap` all accept responsive maps like `{base: \u2026, md: \u2026, lg: \u2026}`.",
      "- Use `Drawer` for side-panel detail views and `Modal` for centered dialogs. `Sticky(children, side?, offset?)` pins a toolbar/banner while content scrolls. `ResizablePanels(primary, secondary)` gives a user-resizable two-pane split. `MasonryGrid([...])` is for Pinterest-style mixed-height walls."
    ]
  },
  {
    name: "Content",
    components: [
      "Text",
      "Image",
      "Badge",
      "BadgeList",
      "Callout",
      "Quote",
      "CodeBlock",
      "Skeleton",
      "Spinner",
      "Markdown",
      "Kbd",
      "Icon"
    ],
    notes: [
      "- Prefer `Markdown(...)` for rich paragraph text with inline formatting \u2014 the parser supports headings, blockquotes, fenced code, numbered/bullet lists, links, images, and bare-URL auto-linking.",
      "- Use `Callout(variant, title, description, icon?, compact?)` for highlighted notices; pass `compact: true` for a one-line inline note.",
      "- Use `Quote(text, cite?)` for inline pull-quotes inside articles and marketing sections (use `Testimonial` when you also have author/role/rating).",
      "- Use `CodeBlock(language, codeString, showLineNumbers?, highlightLines?)` for read-only code snippets. The header always renders a copy-to-clipboard button.",
      '- Use `Badge(label, variant?, icon?, size?)` for a single pill and `BadgeList(["a","b","c"], variant?, size?)` to render an array of strings as Badge pills.',
      "- Use `Skeleton(variant?, lines?, height?, shape?, width?)` for loading placeholders; `variant` accepts `paragraph` (default), `card`, `table-row`, `avatar`, `image`.",
      "- Use `Spinner(size?, label?, tone?)` for tiny inline loading indicators inside buttons, toolbars, or table cells.",
      '- Use `Image(src, alt?, caption?, ratio?, fit?, fallback?)` \u2014 `ratio` (e.g. `"16:9"`) makes the image self-constrain so you do not need an outer `AspectRatio`.',
      '- Use `Kbd(["Cmd", "K"])` when referring to keyboard shortcuts.',
      '- Use `Icon(name, variant?, size?)` to render a standalone Font Awesome icon (`name` is the FA name without the `fa-` prefix, e.g. `"house"`, `"chart-line"`, `"regular:star"`, `"brands:github"`).',
      '- For page-level titles reach for `PageHeader(...)` (top of dashboards/detail pages) or `SectionHeader(...)` (inside a Card). For tiny inline titles use `Text(value, variant="large-heavy")`.'
    ]
  },
  {
    name: "Forms",
    components: [
      "Form",
      "FormControl",
      "FormSection",
      "FieldSet",
      "ValidationSummary",
      "Input",
      "TextArea",
      "PasswordInput",
      "MaskedInput",
      "MentionInput",
      "TagInput",
      "Select",
      "SelectItem",
      "Combobox",
      "MultiSelect",
      "Checkbox",
      "CheckBoxGroup",
      "CheckBoxItem",
      "Radio",
      "Switch",
      "ToggleGroup",
      "Button",
      "Buttons",
      "SearchBar",
      "Slider",
      "NumberInput",
      "ColorPicker",
      "DatePicker",
      "DateRangePicker",
      "TimePicker",
      "DateTimePicker",
      "FileUpload",
      "PinInput",
      "MultiStepForm"
    ],
    notes: [
      "- Each FormControl should be a separate reference for progressive streaming.",
      "- Pass a `$variable` as the last argument to `Input`, `Select`, `Checkbox`, `Switch`, `MultiSelect`, or `CheckBoxGroup` for two-way binding.",
      "- Prefer `Switch` over `Checkbox` for settings; use `ToggleGroup` for view-mode pickers and mutually-exclusive filters.",
      "- Reach for `SearchBar(id, placeholder?, value?, shortcut?)` instead of a raw `Input` whenever the field's purpose is to filter content. It ships with the magnifier icon and keyboard hint baked in.",
      "- `Slider(id, min?, max?, step?, value?, label?, showValue?)` is the canonical control for numeric ranges (volume, brightness, filters); pass a `$variable` as `value` for two-way binding.",
      '- `NumberInput(id, value?, min?, max?, step?, placeholder?)` is friendlier than `Input(type="number")` for quantity steppers and integer settings \u2014 it ships with +/- buttons that respect `min`/`max`.',
      "- `DatePicker(id, value?, label?, min?, max?, placeholder?)` wraps the native date picker; pass `value` as a `$variable` for two-way binding (ISO `YYYY-MM-DD`).",
      "- `DateRangePicker(id, from?, to?, label?, min?, max?)` is the paired-date variant \u2014 bind both `from` and `to` to `$variable`s for a single shared range.",
      "- `Combobox(id, items, value?, placeholder?, emptyLabel?)` is the searchable single-select alternative to `Select` \u2014 type to filter long option lists (countries, currencies, users).",
      "- `MultiSelect(id, items, value?, placeholder?, emptyLabel?, max?)` is the multi-select equivalent \u2014 bind a `$variable` array as `value` for two-way binding, the trigger renders the picks as removable chips.",
      "- `FileUpload(id, { label?, hint?, accept?, multiple?, action? })` is the styled file picker; the picked files cannot pass through a `$variable`, so wire the `action` prop to a `function` declaration.",
      '- A submit button should call an `action` that awaits the relevant `$mutation` resource, optionally refetches a `$query`, and resets the form `$variable`s (e.g. `$title = ""`).',
      "- Button `size` accepts both `sm|md|lg` (canonical) and the legacy `small|normal|large`. Pass `icon` for an inline leading icon.",
      "- `FormSection(label, children, helper?)` is the canonical wrapper for related fields. Reach for it INSTEAD of nesting fields in Card + SectionHeader by hand.",
      "- `FieldSet(legend, children, helper?)` is the accessible `<fieldset>` for radio/checkbox groups; prefer `FormSection` for purely visual grouping.",
      "- `ValidationSummary(errors, title?)` renders an aggregate error panel at the top of the form. Pass `errors` as `{label, message}` objects.",
      '- `PasswordInput(id, value?, placeholder?, strengthMeter?)` adds a show/hide toggle and an optional 4-step strength meter \u2014 prefer over `Input(type="password")` for sign-up flows.',
      "- `PinInput(id, length?, value?, type?)` renders per-digit code entry for 2FA / SMS verification (use `length=6` for OTP codes).",
      "- `TagInput(id, value?, placeholder?)` lets the user add comma- or Enter-separated chips bound to a `$variable` array.",
      "- `MentionInput(id, people, value?)` is a textarea with inline @-mention suggestions \u2014 use for comments, task notes, chat composers.",
      "- `MaskedInput(id, mask, value?)` formats input against a mask string (`9` digit, `A` letter, `*` any). Use for phone numbers, postal codes.",
      "- `TimePicker(id, value?)` and `DateTimePicker(id, value?)` wrap the corresponding native inputs with consistent styling.",
      "- `ColorPicker(id, value?, label?, swatches?)` pairs a color chip with a hex input and preset swatches \u2014 bind a $variable holding a hex string.",
      "- `MultiStepForm(steps, current, onSubmit?)` replaces ad-hoc `Steps` + content + manual prev/next wiring. Each step is `{title, details?, content}`."
    ]
  },
  {
    name: "Data",
    components: ["Table", "Col", "DataGrid", "List", "ListItem", "StatCard", "Stats", "Sparkline", "Tile", "Progress", "ProgressRing", "Pagination", "Tree", "TreeNode", "CalendarView", "ComparisonTable", "InfiniteList"],
    notes: [
      '- Build columns using array pluck: `Col("Title", data.rows.title, format?, align?)`.',
      "- For per-row controls inside a Col, use `for (let row of data.rows) { ... }` and reference `row.field` inline.",
      '- `Table(cols, caption?, density?, striped?, sticky?, emptyLabel?)` \u2014 pass `density="compact"` for dense data, `sticky=true` to pin the header in a scrolling parent, and `emptyLabel` for the zero-state cell.',
      "- `DataGrid(cols, rowIds?, caption?, sort, selectedIds, selectable?, page, perPage?, \u2026)` is the advanced Table \u2014 adds sortable headers (`sortable=true` on Col), per-column filter chips (`filterable=true`), checkbox row selection bound to `$selectedIds`, sticky header / first column, pagination, and an optional bulk-action toolbar. Reach for this whenever a user needs to sort, filter, or page through a list.",
      "- `CalendarView(value?, month?, events?, view?, firstDay?, onSelect?)` renders a full-month (or week) calendar grid for scheduling apps \u2014 distinct from the `DatePicker` input. Bind `value` to a `$variable` for the selected ISO date.",
      "- `ComparisonTable(columns, rows, highlightColumn?)` is the generic counterpart of `PricingTable` \u2014 pass rows of `{label, values, hint?, group?}`. Use for feature comparisons, spec sheets, plan grids.",
      "- `InfiniteList(items, onLoadMore?, loading?, hasMore?)` is a scroll-to-load list; the action fires when the sentinel scrolls into view.",
      "- Use `Progress(value, max?, label?, tone?, indeterminate?, segments?, buffered?)` for linear bars \u2014 `segments` renders an N-step strip (onboarding flows), `buffered` adds a secondary buffer indicator.",
      "- `ProgressRing(value, max?, label?, tone?, size?)` is the circular variant for quotas/completion.",
      '- `Stats([{label, value, hint?, tone?, spark?}, \u2026], layout?)` \u2014 `layout="strip"` (default) for inline KPIs; `layout="grid"` for a responsive StatCard grid. Pass `spark` for an inline trend line.',
      "- `StatCard(label, value, trend?, delta?, icon?, spark?, tone?)` gains an optional inline `Sparkline` via the `spark` prop. Use `Sparkline(values, tone?)` standalone for tiny trend chips in table cells.",
      "- `Tile(label, icon?, value?, description?, tone?, action?)` is the dense icon tile for quick-action menus and category grids; pair with `Grid` for uniform rows.",
      "- `Tree([TreeNode(label, children?, icon?, expanded?, active?, badge?, action?)])` renders a hierarchical tree (file browsers, nested navigation, category pickers); use `expanded=true` to open a branch by default.",
      '- `Pagination(page, totalPages, siblings?, total?, perPage?, perPageOptions?, compact?)` \u2014 bind `page` (and optionally `perPage`) to a `$variable`; pass `total` to render the "Showing N\u2013M of T" summary. Reuse the same variable when slicing data with `arr.filter(...)` / `for`.'
    ]
  },
  {
    name: "Charts",
    components: [
      "BarChart",
      "LineChart",
      "PieChart",
      "RadarChart",
      "ScatterChart",
      "Histogram",
      "Heatmap",
      "Gauge",
      "Series"
    ],
    notes: [
      "- Use `LineChart` for trends (pass `filled=true` for area-style charts), `BarChart` for comparisons, `PieChart` for proportions, `RadarChart` for multi-axis scorecards.",
      "- `Heatmap(xLabels, yLabels, values)` renders a color-intensity matrix \u2014 perfect for calendar heatmaps, correlation grids, schedule density.",
      "- `ScatterChart(series, xLabel?, yLabel?)` plots XY points; pass each Series as `Series(name, points)` where points are `{x, y, label?}`.",
      "- `Histogram(values, binCount?)` bins raw numbers; pass pre-computed `bins=[{label, count}]` instead when you control the bucketing.",
      "- `Gauge(value, min?, max?, label?, tone?, size?)` is the half-doughnut KPI indicator for thresholds (uptime %, score, NPS).",
      '- Pass series via `Series("Name", [...numbers])`.'
    ]
  },
  {
    name: "Feedback & Media",
    components: [
      "Avatar",
      "AvatarGroup",
      "PersonChip",
      "Tooltip",
      "HoverCard",
      "Popover",
      "Rating",
      "Toast",
      "VideoPlayer",
      "AudioPlayer",
      "Carousel",
      "Gallery",
      "Lightbox",
      "Map"
    ],
    notes: [
      "- `Avatar(name, src?, size?, status?)` falls back to initials when the image is missing.",
      "- Use `AvatarGroup` to render contributor strips with a `+N` overflow chip.",
      "- `PersonChip(name, role?, avatarSrc?, size?, status?, action?)` is the inline avatar + name + role pill \u2014 use everywhere a person is referenced (table cells, list rows, sidebar footers, kanban cards) instead of a raw `Avatar` next to `Text`.",
      "- Wrap any node in `Tooltip(label, trigger)` for inline hints.",
      "- Use `HoverCard(trigger, content)` when the popover needs rich content (profile preview, link target) and the trigger should open on hover.",
      "- `Popover(trigger, content, title?, side?, align?, width?)` is the click-triggered counterpart of `HoverCard` \u2014 use for filter panels, color pickers, share menus, and small settings flyouts. Always renders an \xD7 close button in the header; clicking the trigger again, clicking outside, or pressing Escape also closes it.",
      '- `Rating(value, max?, label?, count?, size?, interactive?, halfStep?, icon?)` renders stars for product reviews, testimonials, and ranked lists. Pass a `$variable` as `value` with `interactive=true` to let users rate; add `halfStep=true` so clicking the left half of a star sets a half-value. Set `icon="heart"|"thumb"|"fire"|"bolt"` (or any FA name) to swap glyphs.',
      "- `Toast(title, message?, tone?, icon?, duration?, action?, onClose?, position?)` pins a transient notice; pass `duration` (ms) for auto-dismiss. Drive lists from an `action` body: `$toasts = [...$toasts, item]` to append and `$toasts = $toasts.filter((t) => t.id !== id)` to dismiss. Use `Banner` for top-of-page announcements and `Notification` for permanent inbox entries.",
      "- `NotificationBell(count?, items?, onOpen?)` \u2014 compact inbox trigger; `CommandPalette` for Cmd-K action search."
    ]
  },
  {
    name: "Navigation",
    components: ["Breadcrumb", "BreadcrumbItem", "Navbar", "NavbarItem", "DropdownMenu", "MenuItem", "MenuSeparator", "MenuLabel"],
    notes: [
      '- Use `Breadcrumb(["Workspace", "Reports", "Q3"])` at the top of every detail page so users see the path.',
      "- For per-item links, pass `BreadcrumbItem(label, href)` nodes instead of strings.",
      "- `Navbar(brand?, items?, actions?, sticky?, variant?)` + `NavbarItem(label, to?, href?, icon?, active?, action?, external?)` produces a top navigation bar with brand on the left, links in the middle, and actions on the right \u2014 the canonical companion of `Sidebar` for marketing pages, docs, or any product surface without left-side nav.",
      '- `DropdownMenu(trigger, items, side?, align?, label?)` is the click-triggered dropdown menu \u2014 use it for user-profile menus, row "\u2026" action menus, and any compact list of actions hanging off a single trigger. Children must be `MenuItem`, `MenuSeparator`, or `MenuLabel` entries.',
      '- `MenuItem(label, action?, icon?, shortcut?, variant?, disabled?)` renders a single row inside a `DropdownMenu`; use `variant="danger"` for destructive actions and `MenuSeparator()`/`MenuLabel(label)` to group related items.'
    ]
  },
  {
    name: "Chat",
    components: ["SectionBlock", "ListBlock", "FollowUpBlock", "FollowUpItem", "ActionLink", "ChatBubble"],
    notes: [
      "- End most responses with a `FollowUpBlock` of 2\u20134 short prompts to keep the conversation moving.",
      '- `ChatBubble(author, body, time?, avatarSrc?, from?)` renders a single message bubble; use `from="me"` for the active speaker and `from="agent"` for the assistant. Compose transcripts as `Stack([ChatBubble(...), ChatBubble(...), \u2026])` inside a `Card`.'
    ]
  },
  {
    name: "Patterns",
    components: [
      "Hero",
      "PageHeader",
      "EmptyState",
      "Timeline",
      "TimelineItem",
      "ActivityLog",
      "FeatureGrid",
      "FeatureItem",
      "Testimonial",
      "ProfileCard",
      "Comment",
      "Banner",
      "Notification",
      "InboxPanel",
      "OnboardingChecklist",
      "MediaCard",
      "TopBar",
      "KanbanBoard",
      "KanbanColumn",
      "KanbanCard",
      "SectionHeader",
      "Toolbar",
      "DescriptionList",
      "DescriptionItem",
      "StatusDot",
      "PricingTable",
      "PricingCard",
      "LoadingState",
      "ErrorState",
      "SuccessState",
      "Tour",
      "Spotlight"
    ],
    notes: [
      "- Patterns are **opinionated composites** that pack an entire UI idiom into one component. Reach for them BEFORE composing equivalent layouts by hand with Card+Stack \u2014 the result will look more polished and require fewer tokens.",
      '- `Hero(title, subtitle, primary, secondary, eyebrow?, highlights?, tone?)` \u2014 landing-style text-first header. Use `layout="cover"` with `imageSrc`, `height`, and optional `caption` for image-backed hero bands.',
      '- `PageHeader(title, subtitle?, breadcrumbs?, actions?, status?)` \u2014 the canonical first child for any dashboard or detail page. If you omit `breadcrumbs`, the component auto-derives `["Home", title]`.',
      "- `TopBar(title?, search?, actions?, sticky?)` \u2014 compact top strip for a content surface (panels, dialogs, embedded views). Use `AppShell` when you need a full sidebar; use `TopBar` for narrower headers above scrolling content.",
      "- `SectionHeader(title, subtitle?, eyebrow?, status?, actions?)` \u2014 sub-header inside a Card or panel. Use instead of bare `CardHeader` when the section also needs eyebrow / actions / status.",
      '- `Stats(items, layout?)` \u2014 KPI strip (`layout="strip"`, default) or responsive grid (`layout="grid"` with StatCard children). Prefer over hand-rolled StatCard rows.',
      "- `Toolbar(left?, right?, center?, searchable?, searchPlaceholder?, searchValue?)` \u2014 filter/search/actions row above a list, table, or board. Pass `searchable: true` to auto-mount a `SearchBar` (use `searchValue` to bind it to a `$variable`).",
      "- `EmptyState(title, description?, icon?, illustration?, actions?, action?)` \u2014 render this when a list is empty rather than an empty Card. The icon is auto-picked from the title keywords if you omit it (inbox/messages \u2192 `inbox`, charts/analytics \u2192 `chart-pie`, files/folders \u2192 `folder-open`, etc.).",
      "- `Timeline([TimelineItem(...)])` \u2014 vertical event feed (audit log, changelog, activity).",
      '- `ActivityLog(entries, variant?)` \u2014 purpose-built feed of user actions. Pass `entries` of `{actor, title, description?, time?, icon?, tone?, meta?}`; use `variant="audit"` for security/admin trails with monospace meta.',
      "- `FeatureGrid([FeatureItem(...)])` \u2014 feature highlights with iconography.",
      "- `MediaCard(title, imageSrc?, description?, tags?, meta?, actions?, badge?, orientation?, ratio?)` \u2014 image + content card. Use for article previews, product cards, project highlights. Pair with `Grid` for uniform card rows.",
      '- `KanbanBoard([KanbanColumn("To do", [KanbanCard(...), ...])])` \u2014 task boards.',
      '- `DescriptionList([DescriptionItem("Status", Badge(...)), \u2026])` \u2014 detail-page key/value summary. Always preferable to a Stack of Text rows on profile, billing, or metadata panels.',
      "- `StatusDot(label, tone?, pulse?)` \u2014 inline status pip. Use in toolbars, list rows, table cells, sidebars.",
      "- `Notification(title, message?, time?, icon?, avatarSrc?, tone?, unread?, actions?)` \u2014 inline notification card for notification panels / inboxes (prefer `Banner` for top-of-page announcements).",
      "- `InboxPanel(items, title?, onMarkAllRead?)` \u2014 `Notification` cards grouped into Unread / Earlier sections, with a shared mark-all-read action.",
      "- `OnboardingChecklist(items, title?, description?)` \u2014 checklist of `{title, description?, done?, action?}` items with progress. Use for product onboarding, setup wizards, getting-started panels.",
      "- `PricingTable([PricingCard(plan, price, period?, description?, features?, action?, badge?, featured?)])` \u2014 full pricing page block.",
      "- `LoadingState(title?, description?, tone?, action?)`, `ErrorState(title, description?, action?, secondaryAction?, retryLabel?)`, `SuccessState(title, description?, action?, secondaryAction?)` \u2014 full-card empty-state alternatives for asynchronous content states.",
      "- `Tour(steps, current, onFinish?)` and `Spotlight(title?, description?, action?)` are the product-tour primitives. `Spotlight` is a single highlighted call-out; `Tour` walks the user through multiple `{title, description, image?}` steps with Prev/Next/Skip controls and a progress dots indicator."
    ]
  },
  {
    name: "Editors & overlays",
    components: ["RichTextEditor", "CodeEditor", "ContextMenu"],
    notes: [
      "- `RichTextEditor(id, value?, placeholder?, minHeight?)` is the contenteditable WYSIWYG editor \u2014 toolbar ships with bold/italic/underline/strike/heading/lists/link. Bind `value` to a `$variable` holding HTML.",
      "- `CodeEditor(id, value?, language?, placeholder?, minHeight?)` is a lightweight `<textarea>` with a synced line-number gutter and tab indentation. Use for snippet editors, prompt sandboxes, settings JSON.",
      "- `ContextMenu(target, items)` attaches a right-click menu to any node. `items` are `MenuItem` or `{label, action?, icon?, shortcut?, variant?, disabled?}` objects; pass a `MenuSeparator()` to split groups."
    ]
  },
  {
    name: "App shell",
    components: [
      "AppShell",
      "Sidebar",
      "SidebarSection",
      "SidebarItem",
      "SplitView"
    ],
    notes: [
      "- App shell components produce a **full SaaS-style layout in a single statement**. Use them whenever the response represents a complete product surface (dashboards with nav, settings sections, admin consoles, inboxes).",
      "- `AppShell(sidebar, content, topbar?, collapsible?, sidebarOpen?)` \u2014 fixed-left navigation + scrollable main area. Pass `collapsible=true` to enable a hamburger that turns the sidebar into a slide-over drawer on mobile; bind `sidebarOpen` to a `$variable` if you want to drive that drawer programmatically.",
      "- `Sidebar(items, brand?, tagline?, footer?, collapsed?)` + `SidebarItem(label, icon?, active?, badge?, action?)` + `SidebarSection(label, items)` \u2014 group nav links into sections, mark the current page with `active=true`, attach badges for counts. Pass `collapsed=true` (or bind to a `$variable`) to collapse it to an icon rail.",
      "- `SplitView(primary, detail, primaryWidth?)` \u2014 master/detail layout (inboxes, file browsers, contact lists). Both panes are scrollable."
    ]
  },
  {
    name: "Advanced UI",
    components: [
      "IconButton",
      "CommandPalette",
      "FilterChips",
      "FieldRepeater",
      "VirtualList",
      "QueryBuilder",
      "DiffViewer",
      "JsonTree",
      "Gantt",
      "Truncate",
      "InlineEdit",
      "NotificationBell"
    ],
    notes: [
      "- `IconButton(icon, label, action?, variant?, size?, disabled?)` \u2014 accessible icon-only control.",
      "- `CommandPalette(items, open?, placeholder?, shortcut?)` \u2014 Cmd-K searchable actions.",
      "- `FilterChips(chips, onRemove?, onClear?)` \u2014 applied filter pills with remove.",
      "- `FieldRepeater(items, fields, onAdd?, onRemove?)` \u2014 dynamic form rows.",
      "- `VirtualList(items, itemHeight?, renderItem)` \u2014 windowed long lists.",
      "- `QueryBuilder(fields, value?)` \u2014 visual AND/OR filter builder.",
      "- `DiffViewer(left, right, mode?)` \u2014 side-by-side or unified diff.",
      "- `JsonTree(data)` \u2014 collapsible JSON inspector.",
      "- `Gantt(tasks, startDate?, endDate?)` \u2014 horizontal schedule timeline.",
      "- `Truncate(text, maxLines?)` / `InlineEdit(value, onSave?)` / `NotificationBell(count?, items?)`."
    ]
  },
  {
    name: "Routing",
    components: ["NavLink"],
    notes: [
      '- Declare routes with the `$router({...})` call form: `pages = $router({ "/": Dashboard(), "/orders/:id": OrderDetail({ id: params.id }), default: NotFound() })`. The matched arm\'s `params` object is in scope on the right-hand side; nest `$router` inside components for layout-preserving sub-routes.',
      "- `Redirect(path)` is a router-aware component: returning it from a route's body navigates and unmounts the rest of the subtree.",
      "- `NavLink(label, { to })` is a thin link wrapper that reads `route.path` and dispatches `route.navigate(to)` \u2014 use it for sidebars, navbars and breadcrumbs.",
      "- Read URL params via `route.params.<name>` (e.g. `route.params.id` for `/users/:id`) and the current path via `route.path`."
    ]
  },
  {
    name: "Helpers",
    components: ["Async", "Show", "Portal", "Redirect", "Lazy", "ErrorBoundary"],
    notes: [
      "- `Async(resource, { loading:, error:, empty:, data: })` switches an `$http({...})` resource on its `state` field (`empty` shows for `null`/empty-array data).",
      "- `Show(when, { fallback?, children })` is sugar over `if (expr) { children } else { fallback }`.",
      "- `Portal(target?, children)` renders into a different DOM subtree (defaults to `document.body`).",
      "- `Redirect(path)` is a router-aware component \u2014 see Routing.",
      "- `Lazy(loader, fallback?)` defers rendering until the async `loader` resolves, showing `fallback` while pending (a synchronous loader value renders immediately).",
      "- `ErrorBoundary(fallback?, onError?, children)` catches rendering errors thrown by descendants."
    ]
  },
  {
    name: "Behaviour wrappers",
    components: [
      "OnClick",
      "OnMouse",
      "OnKeyboard",
      "OnFocus",
      "OnIntersect",
      "OnMount",
      "Css",
      "Link"
    ],
    notes: [
      "- Wrappers compose: any built-in component can be made clickable, hoverable, observable, or restyled by wrapping it in one of these primitives \u2014 no need for the underlying component to grow another prop.",
      "- `OnClick(child, { onClick, disabled?, stopPropagation? })` makes any component clickable / tappable (touch devices fire `click` too). Use for clickable cards, list rows, media tiles, and any custom layout that needs a tap target without a `<button>` baseline.",
      "- `OnMouse(child, { enter?, leave?, hover?, move?, down?, up?, click?, doubleClick?, contextMenu?, scroll?, wheel?, drag?, drop?, dragStart?, dragEnd?, dragEnter?, dragLeave?, dragOver?, draggable?, passiveScroll? })` attaches any combination of mouse / pointer / drag listeners. Pass `draggable: true` to make the wrapper itself draggable. Scroll / wheel listeners default to `{ passive: true }` for smooth scrolling.",
      "- `OnKeyboard(child, { onKeyDown?, onKeyUp?, onKeyPress?, focusable? })` attaches keyboard listeners. The wrapper is focusable by default; pass `focusable: false` when the child is already focusable (input, button).",
      "- `OnFocus(child, { onFocus?, onBlur? })` tracks focus moving into or out of a subtree (uses bubbling `focusin` / `focusout` so descendants count).",
      "- `OnIntersect(child, { onEnter?, onLeave?, onChange?, threshold?, rootMargin?, once? })` is the IntersectionObserver wrapper \u2014 perfect for lazy-load sentinels, infinite-scroll triggers, impression analytics, and reveal-on-scroll animations.",
      "- `OnMount(child, { onMount?, onUnmount? })` is the DOM-ref / lifecycle wrapper. `onMount(node)` fires once after the wrapped element attaches; `onUnmount(node)` fires when it leaves the tree. Use it to measure or focus an element, or to hand a node to an imperative library (chart / map / editor). Stash the node in a `$ref(...)`.",
      "- `Css(child, { style?, class? })` merges raw class tokens and inline styles onto the wrapped child. Reach for it ONLY when the standard component props can't express the styling \u2014 prefer `Box`/`Stack`/`Grid` for layout and `$theme(...)` for tokens.",
      "- `Link(label_or_child, { to?, href?, external?, variant? })` is the anchor primitive \u2014 accepts either a plain string label or a wrapped component. Use `to` for client-side router navigation and `href` (with `external: true`) for outbound links."
    ]
  },
  {
    name: "Escape hatches",
    components: ["HTMLTag", "Styles"],
    notes: [
      "- **Use only as a last resort.** Reach for these primitives when the standard catalogue cannot express the markup or styling you need; for everything else (typography, layout, surfaces, controls) the dedicated components produce a more consistent UI for fewer tokens.",
      '- `HTMLTag(tag, attributes?, children?)` renders an allow-listed HTML tag with the given attribute object and child nodes (e.g. `HTMLTag("section", attributes: {class: "hero", "data-id": 1}, children: [Text("Hello")])`). Tag names outside the allow-list collapse to `div`; `on*` attributes, `javascript:` URLs in `href`/`src`, and `expression()` / `@import` in inline `style` are stripped.',
      "- `Styles(css)` injects a `<style>` block containing the given CSS rules (e.g. `` Styles(`.hero { background: linear-gradient(...); }`) ``). Pair it with `HTMLTag` (or any built-in component's `class`-bearing wrapper) when scoping to a custom selector. Payloads containing `</style>`, `<script>`, `expression(`, `javascript:`, `behavior:`, or `@import` are dropped."
    ]
  }
];
assertOnePositionalMax(components);
var defaultLibrary = {
  root: "Column",
  components,
  componentGroups
};

// ../../src/tooling/semantic-tokens.ts
var semanticTokenTypes = [
  "namespace",
  "class",
  "function",
  "variable",
  "property",
  "keyword",
  "number"
];
var semanticTokenModifiers = ["declaration", "defaultLibrary"];
var HANDLE_KEYWORDS = /* @__PURE__ */ new Set(["route", "aktion"]);
function getSemanticTokens(source, library = defaultLibrary) {
  const tokens = tokenize(source);
  const components2 = new Set(library.components.map((c) => c.name));
  const userComponents = /* @__PURE__ */ new Set();
  const userActions = /* @__PURE__ */ new Set();
  const hooks = /* @__PURE__ */ new Set();
  collectUserDeclarations(tokens, userComponents, userActions, hooks);
  const out = [];
  let prev;
  for (const t of tokens) {
    const classified = classify(t, prev, {
      components: components2,
      userComponents,
      userActions,
      hooks
    });
    if (classified) {
      out.push({
        line: t.line,
        column: t.column,
        length: tokenLength(t),
        tokenType: classified.type,
        tokenModifiers: classified.modifiers
      });
    }
    if (t.type !== "Newline") prev = t;
  }
  return out;
}
function classify(t, prev, scope) {
  if (t.type === "Keyword") return { type: "keyword", modifiers: [] };
  if (t.type === "Number") return { type: "number", modifiers: [] };
  if (t.type === "StateIdentifier") {
    const builtin = findBuiltin(t.value);
    if (builtin) {
      return {
        type: builtin.namespace ? "namespace" : "function",
        modifiers: ["defaultLibrary"]
      };
    }
    if (scope.hooks.has(t.value)) return { type: "function", modifiers: [] };
    return { type: "variable", modifiers: [] };
  }
  if (t.type === "Identifier") {
    if (HANDLE_KEYWORDS.has(t.value)) return { type: "keyword", modifiers: [] };
    if (isMemberAccess(prev)) return { type: "property", modifiers: [] };
    if (scope.components.has(t.value)) {
      return { type: "class", modifiers: ["defaultLibrary"] };
    }
    if (scope.userComponents.has(t.value)) return { type: "class", modifiers: [] };
    if (scope.userActions.has(t.value)) return { type: "function", modifiers: [] };
    if (/^[A-Z]/.test(t.value)) return { type: "class", modifiers: [] };
    return null;
  }
  return null;
}
function isMemberAccess(prev) {
  if (!prev) return false;
  return prev.type === "Punctuation" && prev.value === "." || prev.type === "Operator" && prev.value === "?.";
}
function collectUserDeclarations(tokens, components2, actions, hooks) {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === "Keyword" && t.value === "function") {
      const next = nextMeaningful2(tokens, i + 1);
      if (!next) continue;
      if (next.type === "StateIdentifier") hooks.add(next.value);
      else if (next.type === "Identifier") {
        if (/^[A-Z]/.test(next.value)) components2.add(next.value);
        else actions.add(next.value);
      }
    }
  }
}
function nextMeaningful2(tokens, from) {
  for (let i = from; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === "Newline") continue;
    return t;
  }
  return null;
}
function tokenLength(t) {
  return t.type === "StateIdentifier" ? t.value.length + 1 : t.value.length;
}

// ../../src/language/components.ts
var projectParam = (prop) => {
  const param = {
    name: prop.name,
    type: prop.type,
    required: !prop.optional
  };
  if (prop.description) param.description = prop.description;
  if (prop.enum && prop.enum.length > 0) param.enumValues = prop.enum;
  return param;
};
var buildSignature = (spec) => {
  const parts = spec.props.map((p) => p.optional ? `${p.name}?` : p.name);
  return `${spec.name}(${parts.join(", ")})`;
};
var buildGroupIndex = (library) => {
  const index = /* @__PURE__ */ new Map();
  for (const group of library.componentGroups ?? []) {
    for (const name of group.components) index.set(name, group.name);
  }
  return index;
};
function getComponentCatalog(library = defaultLibrary) {
  const groupOf = buildGroupIndex(library);
  return library.components.map((spec) => ({
    name: spec.name,
    group: groupOf.get(spec.name) ?? "Other",
    description: spec.description,
    params: spec.props.map(projectParam),
    signature: buildSignature(spec)
  }));
}
function indexCatalog(entries) {
  const out = {};
  for (const entry of entries) out[entry.name] = entry;
  return out;
}

// ../../src/tooling/signature-help.ts
function getSignatureHelp(source, position, library = defaultLibrary) {
  const call = findActiveCall(source, position);
  if (!call || !call.callee) return null;
  const signature = libraryComponentSignature(call.callee, library) ?? builtinSignature(call.callee) ?? userSignature(call.callee, source);
  if (!signature) return null;
  const activeParameter = signature.parameters.length > 0 ? Math.min(call.argIndex, signature.parameters.length - 1) : 0;
  return { signatures: [signature], activeSignature: 0, activeParameter };
}
var cachedCatalog = null;
function catalogFor(library) {
  if (cachedCatalog && cachedCatalog.library === library) return cachedCatalog.byName;
  const byName = {};
  for (const entry of getComponentCatalog(library)) byName[entry.name] = entry;
  cachedCatalog = { library, byName };
  return byName;
}
function libraryComponentSignature(callee, library) {
  const entry = catalogFor(library)[callee];
  if (!entry) return null;
  return {
    label: entry.signature,
    documentation: entry.description,
    parameters: entry.params.map((p) => ({
      label: p.required ? p.name : `${p.name}?`,
      documentation: paramDoc(p.type, p.enumValues, p.description)
    }))
  };
}
function builtinSignature(callee) {
  if (!callee.startsWith("$")) return null;
  const builtin = findBuiltin(callee.slice(1));
  if (!builtin) return null;
  return { label: builtin.signature, documentation: builtin.summary, parameters: [] };
}
function userSignature(callee, source) {
  let program;
  try {
    program = parse(source);
  } catch {
    return null;
  }
  for (const stmt of program.statements) {
    const matches = (stmt.kind === "ComponentDeclaration" || stmt.kind === "ActionDeclaration" || stmt.kind === "HookDeclaration") && stmt.name === callee;
    if (!matches) continue;
    const decl = stmt;
    const params = decl.params.map((p) => ({
      label: paramLabel(p)
    }));
    const label = `${callee}(${params.map((p) => p.label).join(", ")})`;
    return { label, documentation: `Declared in this file (${kindLabel(stmt.kind)}).`, parameters: params };
  }
  return null;
}
function paramLabel(p) {
  if (p.rest) return `...${p.name}`;
  return p.optional ? `${p.name}?` : p.name;
}
function kindLabel(kind) {
  if (kind === "ComponentDeclaration") return "component";
  if (kind === "ActionDeclaration") return "action";
  return "hook";
}
function paramDoc(type, enumValues, description) {
  const parts = [type];
  if (enumValues && enumValues.length > 0) {
    parts.push(`enum: ${enumValues.map((e) => `"${e}"`).join(" | ")}`);
  }
  const head = parts.join(" \u2014 ");
  return description ? `${head}

${description}` : head;
}
function findActiveCall(source, position) {
  const offset = lineColumnToOffset2(source, position);
  const stack = [];
  for (let i = 0; i < offset; i += 1) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      while (i < offset && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < offset && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i, ch, offset);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      const callee = ch === "(" ? identifierBefore2(source, i) : "";
      stack.push({ bracket: ch, callee, commas: 0 });
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      stack.pop();
      continue;
    }
    if (ch === "," && stack.length > 0) {
      stack[stack.length - 1].commas += 1;
    }
  }
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i];
    if (frame.bracket === "(") {
      return { callee: frame.callee, argIndex: frame.commas };
    }
  }
  return null;
}
function skipString(source, start, quote, limit) {
  let i = start + 1;
  while (i < limit) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i;
    i += 1;
  }
  return limit - 1;
}
function identifierBefore2(source, parenIndex) {
  let end = parenIndex;
  while (end > 0 && /\s/.test(source[end - 1])) end -= 1;
  let start = end;
  while (start > 0 && /[\w$]/.test(source[start - 1])) start -= 1;
  return source.slice(start, end);
}
function lineColumnToOffset2(source, pos) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < source.length; i += 1) {
    if (line === pos.line && col === pos.column) return i;
    if (source[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return source.length;
}

// ../../src/theme/index.ts
var baseFonts = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyHeading: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
};
var baseFontScale = {
  fontSizeBase: "14px",
  fontSizeSm: "12px",
  fontSizeLg: "16px",
  fontSizeHeading: "16px",
  fontSizeTitle: "22px",
  fontWeightBody: "400",
  fontWeightHeading: "700",
  lineHeightBody: "1.5",
  lineHeightHeading: "1.2",
  letterSpacingHeading: "0",
  headingTextTransform: "none"
};
var baseSpacing = {
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "12px",
  spacingL: "20px",
  spacingXl: "32px"
};
var baseRadii = {
  radiusXs: "4px",
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "16px",
  radiusPill: "999px",
  radiusButton: "6px",
  radiusInput: "6px"
};
var baseButtons = {
  buttonFontWeight: "600",
  buttonTextTransform: "none",
  buttonLetterSpacing: "0",
  buttonPaddingY: "8px",
  buttonPaddingX: "14px"
};
var baseMotion = {
  transitionDuration: "120ms"
};
var lightTheme = {
  colorBg: "#ffffff",
  colorBgSubtle: "#f8fafc",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f1f5f9",
  colorBorder: "#e2e8f0",
  colorBorderSubtle: "rgba(15, 23, 42, 0.08)",
  colorText: "#0f172a",
  colorTextMuted: "#475569",
  colorPrimary: "#6366f1",
  colorPrimaryHover: "#4f46e5",
  colorPrimaryText: "#ffffff",
  colorAccent: "#6366f1",
  colorAccentHover: "#4f46e5",
  colorAccentText: "#ffffff",
  colorFocusRing: "#6366f1",
  colorSuccess: "#10b981",
  colorWarning: "#f59e0b",
  colorDanger: "#ef4444",
  colorInfo: "#06b6d4",
  shadowSm: "0 1px 2px rgba(15, 23, 42, 0.06)",
  shadowMd: "0 6px 24px rgba(15, 23, 42, 0.08)",
  shadowLg: "0 18px 60px rgba(15, 23, 42, 0.12)",
  borderWidth: "1px",
  chart1: "#6366f1",
  chart2: "#10b981",
  chart3: "#f59e0b",
  chart4: "#ef4444",
  chart5: "#06b6d4",
  chart6: "#8b5cf6",
  ...baseFonts,
  ...baseFontScale,
  ...baseSpacing,
  ...baseRadii,
  ...baseButtons,
  ...baseMotion
};
var darkTheme = {
  ...lightTheme,
  colorBg: "#0b1220",
  colorBgSubtle: "#0f172a",
  colorSurface: "#111827",
  colorSurfaceMuted: "#1e293b",
  colorBorder: "#1f2937",
  colorBorderSubtle: "rgba(248, 250, 252, 0.08)",
  colorText: "#f8fafc",
  colorTextMuted: "#94a3b8",
  colorPrimary: "#818cf8",
  colorPrimaryHover: "#6366f1",
  colorPrimaryText: "#0b1220",
  colorAccent: "#818cf8",
  colorAccentHover: "#6366f1",
  colorAccentText: "#0b1220",
  colorFocusRing: "#818cf8",
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.4)",
  shadowMd: "0 8px 24px rgba(0, 0, 0, 0.4)",
  shadowLg: "0 22px 60px rgba(0, 0, 0, 0.55)"
};
var neonTheme = {
  ...lightTheme,
  colorBg: "#05060f",
  colorBgSubtle: "#0a0c1c",
  colorSurface: "#0d1024",
  colorSurfaceMuted: "#161a36",
  colorBorder: "#2a2f6b",
  colorBorderSubtle: "rgba(236, 72, 153, 0.18)",
  colorText: "#f5f3ff",
  colorTextMuted: "#a5b4fc",
  colorPrimary: "#ec4899",
  colorPrimaryHover: "#f472b6",
  colorPrimaryText: "#05060f",
  colorAccent: "#22d3ee",
  colorAccentHover: "#67e8f9",
  colorAccentText: "#05060f",
  colorFocusRing: "#ec4899",
  colorSuccess: "#34d399",
  colorWarning: "#fbbf24",
  colorDanger: "#f87171",
  colorInfo: "#22d3ee",
  fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontFamilyHeading: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  letterSpacingHeading: "0.02em",
  radiusXs: "2px",
  radiusSm: "2px",
  radiusMd: "4px",
  radiusLg: "6px",
  radiusButton: "2px",
  radiusInput: "2px",
  shadowSm: "0 0 0 1px rgba(236, 72, 153, 0.25), 0 0 12px rgba(34, 211, 238, 0.18)",
  shadowMd: "0 0 0 1px rgba(236, 72, 153, 0.35), 0 0 28px rgba(34, 211, 238, 0.22)",
  shadowLg: "0 0 0 1px rgba(236, 72, 153, 0.45), 0 0 48px rgba(34, 211, 238, 0.35)",
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "14px",
  spacingL: "22px",
  spacingXl: "36px",
  chart1: "#ec4899",
  chart2: "#22d3ee",
  chart3: "#fbbf24",
  chart4: "#a78bfa",
  chart5: "#34d399",
  chart6: "#f472b6"
};
var pastelTheme = {
  ...lightTheme,
  colorBg: "#fdf6ff",
  colorBgSubtle: "#fbf2ff",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f4ecff",
  colorBorder: "#ead8ff",
  colorBorderSubtle: "rgba(168, 132, 232, 0.18)",
  colorText: "#3b1f56",
  colorTextMuted: "#7d6193",
  colorPrimary: "#a78bfa",
  colorPrimaryHover: "#8b5cf6",
  colorPrimaryText: "#ffffff",
  colorAccent: "#5eead4",
  colorAccentHover: "#2dd4bf",
  colorAccentText: "#0f3a35",
  colorFocusRing: "#a78bfa",
  colorSuccess: "#5eead4",
  colorWarning: "#fcd34d",
  colorDanger: "#fda4af",
  colorInfo: "#93c5fd",
  fontFamily: "'Quicksand', 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading: "'Quicksand', 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusXs: "8px",
  radiusSm: "12px",
  radiusMd: "20px",
  radiusLg: "28px",
  radiusButton: "16px",
  radiusInput: "16px",
  shadowSm: "0 4px 14px rgba(168, 132, 232, 0.12)",
  shadowMd: "0 18px 40px rgba(168, 132, 232, 0.18)",
  shadowLg: "0 28px 70px rgba(168, 132, 232, 0.22)",
  spacingXs: "6px",
  spacingS: "12px",
  spacingM: "18px",
  spacingL: "28px",
  spacingXl: "44px",
  chart1: "#a78bfa",
  chart2: "#5eead4",
  chart3: "#fcd34d",
  chart4: "#fda4af",
  chart5: "#93c5fd",
  chart6: "#f9a8d4"
};
var glassTheme = {
  ...lightTheme,
  colorBg: "#0f1730",
  colorBgSubtle: "#13204a",
  colorSurface: "rgba(255, 255, 255, 0.08)",
  colorSurfaceMuted: "rgba(255, 255, 255, 0.04)",
  colorBorder: "rgba(255, 255, 255, 0.18)",
  colorBorderSubtle: "rgba(255, 255, 255, 0.10)",
  colorText: "#f1f5ff",
  colorTextMuted: "#b6c3e6",
  colorPrimary: "#60a5fa",
  colorPrimaryHover: "#3b82f6",
  colorPrimaryText: "#0b132b",
  colorAccent: "#22d3ee",
  colorAccentHover: "#67e8f9",
  colorAccentText: "#0b132b",
  colorFocusRing: "#60a5fa",
  colorSuccess: "#34d399",
  colorWarning: "#fbbf24",
  colorDanger: "#fb7185",
  colorInfo: "#22d3ee",
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusXs: "6px",
  radiusSm: "10px",
  radiusMd: "16px",
  radiusLg: "24px",
  radiusButton: "12px",
  radiusInput: "12px",
  shadowSm: "0 1px 2px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  shadowMd: "0 18px 50px rgba(7, 14, 33, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
  shadowLg: "0 28px 80px rgba(7, 14, 33, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
  spacingXs: "4px",
  spacingS: "10px",
  spacingM: "16px",
  spacingL: "24px",
  spacingXl: "40px",
  chart1: "#60a5fa",
  chart2: "#22d3ee",
  chart3: "#a78bfa",
  chart4: "#f472b6",
  chart5: "#34d399",
  chart6: "#fbbf24"
};
var brutalistTheme = {
  ...lightTheme,
  colorBg: "#fef9c3",
  colorBgSubtle: "#fde68a",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#fef3c7",
  colorBorder: "#0a0a0a",
  colorBorderSubtle: "#0a0a0a",
  colorText: "#0a0a0a",
  colorTextMuted: "#3f3f46",
  colorPrimary: "#1d4ed8",
  colorPrimaryHover: "#1e40af",
  colorPrimaryText: "#ffffff",
  colorAccent: "#dc2626",
  colorAccentHover: "#b91c1c",
  colorAccentText: "#ffffff",
  colorFocusRing: "#0a0a0a",
  colorSuccess: "#16a34a",
  colorWarning: "#ea580c",
  colorDanger: "#dc2626",
  colorInfo: "#0891b2",
  fontFamily: "'Space Grotesk', 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  fontFamilyHeading: "'Space Grotesk', 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontWeightHeading: "800",
  letterSpacingHeading: "-0.01em",
  headingTextTransform: "uppercase",
  radiusXs: "0px",
  radiusSm: "0px",
  radiusMd: "0px",
  radiusLg: "0px",
  radiusPill: "0px",
  radiusButton: "0px",
  radiusInput: "0px",
  borderWidth: "2px",
  shadowSm: "3px 3px 0 0 #0a0a0a",
  shadowMd: "6px 6px 0 0 #0a0a0a",
  shadowLg: "10px 10px 0 0 #0a0a0a",
  spacingXs: "4px",
  spacingS: "10px",
  spacingM: "16px",
  spacingL: "22px",
  spacingXl: "36px",
  buttonFontWeight: "800",
  buttonTextTransform: "uppercase",
  buttonLetterSpacing: "0.02em",
  chart1: "#dc2626",
  chart2: "#1d4ed8",
  chart3: "#16a34a",
  chart4: "#ea580c",
  chart5: "#7c3aed",
  chart6: "#0a0a0a"
};
var skylineTheme = {
  ...lightTheme,
  colorBg: "#eff2f7",
  colorBgSubtle: "#e6ecf3",
  colorSurface: "#ffffff",
  colorSurfaceMuted: "#f4f7fb",
  colorBorder: "#d6deea",
  colorBorderSubtle: "rgba(13, 27, 58, 0.08)",
  colorText: "#0d1b3a",
  colorTextMuted: "#5a6a85",
  colorPrimary: "#003580",
  colorPrimaryHover: "#002a66",
  colorPrimaryText: "#ffffff",
  colorAccent: "#0095d6",
  colorAccentHover: "#0078ad",
  colorAccentText: "#ffffff",
  colorFocusRing: "#0095d6",
  colorSuccess: "#1b8f4f",
  colorWarning: "#c47e00",
  colorDanger: "#c8362b",
  colorInfo: "#0095d6",
  fontFamily: "'Inter', 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyHeading: "'Inter', 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  radiusXs: "3px",
  radiusSm: "4px",
  radiusMd: "6px",
  radiusLg: "10px",
  radiusButton: "4px",
  radiusInput: "4px",
  shadowSm: "0 1px 0 rgba(13, 27, 58, 0.04), 0 1px 3px rgba(13, 27, 58, 0.06)",
  shadowMd: "0 4px 16px rgba(13, 27, 58, 0.08), 0 1px 3px rgba(13, 27, 58, 0.04)",
  shadowLg: "0 16px 40px rgba(13, 27, 58, 0.12), 0 2px 6px rgba(13, 27, 58, 0.06)",
  spacingXs: "4px",
  spacingS: "8px",
  spacingM: "14px",
  spacingL: "20px",
  spacingXl: "32px",
  chart1: "#003580",
  chart2: "#0095d6",
  chart3: "#1b8f4f",
  chart4: "#c47e00",
  chart5: "#d43594",
  chart6: "#5a6a85"
};
var builtInThemes = {
  light: lightTheme,
  dark: darkTheme,
  neon: neonTheme,
  pastel: pastelTheme,
  glass: glassTheme,
  brutalist: brutalistTheme,
  skyline: skylineTheme
};

// ../../src/language/snippets.ts
var snippetCatalog = [
  {
    name: "App",
    description: "Top-level `$app(...)` root \u2014 every program needs one.",
    template: '$app(Column([\n  ${1:Card([CardHeader("${2:Hello}")])}\n]))'
  },
  {
    name: "Card",
    description: "Card with header + body block.",
    template: 'card${1} = Card([\n  CardHeader("${2:Title}", { subtitle: "${3:Subtitle}" }),\n  Column([\n    Text("${4:Body copy goes here.}")\n  ])\n])'
  },
  {
    name: "Row",
    description: "Horizontal toolbar \u2014 label on the left, actions pushed to the right.",
    template: 'toolbar${1} = Row([\n  Text("${2:Section title}", { variant: "large-heavy" }),\n  Spacer(),\n  Button("${3:Action}", { variant: "primary" })\n], { gap: "m" })'
  },
  {
    name: "Center",
    description: "Center content on both axes inside a tall region.",
    template: 'empty${1} = Center([\n  EmptyState("${2:Nothing here yet}", { description: "${3:Create your first item to get started.}" })\n], { minHeight: "${4:50vh}" })'
  },
  {
    name: "Hero",
    description: "Landing-page hero with eyebrow, title, subtitle, and a CTA.",
    template: 'function ${4:start}() { route.navigate("/start") }\nfunction ${5:openDemo}() { route.navigate("/demo") }\nhero${1} = Hero(\n  "${2:Ship faster}",\n  { subtitle: "${3:From idea to production in minutes.}",\n    primary: Button("${6:Get started}", { action: ${4:start}, variant: "primary" }),\n    secondary: Button("${7:Live demo}", { action: ${5:openDemo}, variant: "ghost" }),\n    eyebrow: "${8:v2 launch}" }\n)'
  },
  {
    name: "PageHeader",
    description: "Dashboard page header with breadcrumbs and actions.",
    template: 'function ${6:runAction}() { /* TODO: implement */ }\nheader${1} = PageHeader(\n  "${2:Page title}",\n  { subtitle: "${3:Subtitle / meta line}",\n    breadcrumbs: ["${4:Workspace}", "${5:Section}"],\n    actions: [Button("${7:Action}", { action: ${6:runAction}, variant: "primary" })],\n    status: Badge("${8:On track}", { variant: "success" }) }\n)'
  },
  {
    name: "Stats",
    description: "Responsive KPI strip with four StatCards.",
    template: 'metrics${1} = Stats([\n  StatCard("${2:Active}", { value: "${3:12}", trend: "flat" }),\n  StatCard("${4:At risk}", { value: "${5:4}", trend: "up", delta: "+2" }),\n  StatCard("${6:Shipped}", { value: "${7:8}", trend: "up", delta: "+3" }),\n  StatCard("${8:On-time}", { value: "${9:87%}", trend: "down", delta: "-3%" })\n])'
  },
  {
    name: "GridLayout",
    description: "12-column sidebar layout with named GridItem spans.",
    template: 'sidebar${1} = Card([CardHeader("${2:Sidebar}")])\nmain${1}    = Card([CardHeader("${3:Main}")])\n$app(Grid([\n  GridItem(sidebar${1}, { span: "1/4" }),\n  GridItem(main${1}, { span: "3/4" })\n], { columns: 12, gap: "l" }))'
  },
  {
    name: "KanbanBoard",
    description: "Three-column kanban board with sample cards.",
    template: 'board${1} = KanbanBoard([\n  KanbanColumn("To do", { items: [\n    KanbanCard("${2:Migrate auth}", { description: "${3:Roll out the new SDK.}", tags: ["auth"], assignee: "${4:Asha}" })\n  ] }),\n  KanbanColumn("Doing", { items: [\n    KanbanCard("${5:Streaming UI v2}", { description: "${6:Ship 20 new components.}", tags: ["frontend"], assignee: "${7:Alex}", tone: "primary" })\n  ] }),\n  KanbanColumn("Done", { items: [\n    KanbanCard("${8:Activity timeline}", { description: "${9:Shipped to 100%.}", tags: ["shipped"], assignee: "${10:Mira}", tone: "success" })\n  ] })\n])'
  },
  {
    name: "FollowUpBlock",
    description: "Chat follow-up prompts.",
    template: 'follow${1} = FollowUpBlock([\n  FollowUpItem("${2:Show me a chart}"),\n  FollowUpItem("${3:Add a filter}"),\n  FollowUpItem("${4:Export as CSV}")\n])'
  },
  {
    name: "Router",
    description: "Multi-page router via $router({\u2026}) with NavLink sidebar.",
    template: 'pages = $router({\n  "/":            HomePage(),\n  "/dashboard":   DashboardPage(),\n  "/users/:id":   UserPage(params.id),\n  "/docs/*":      DocsPage(params._),\n  default:        NotFoundPage()\n})\n\nfunction HomePage() {\n  return Card([CardHeader("Welcome")])\n}\nfunction DashboardPage() {\n  return Card([CardHeader("Dashboard")])\n}\nfunction UserPage(id) {\n  return Card([CardHeader(`User ${id}`)])\n}\nfunction DocsPage(rest) {\n  return Card([CardHeader(`Docs \xB7 ${rest}`)])\n}\nfunction NotFoundPage() {\n  return Callout("Not found", { variant: "warning", description: `We couldn\'t find ${route.path}.` })\n}\n\nnav${1} = Row([\n  NavLink("Home",      { to: "/",          variant: "ghost", exact: true }),\n  NavLink("Dashboard", { to: "/dashboard", variant: "ghost" }),\n  NavLink("Users",     { to: "/users",     variant: "ghost" })\n], { gap: "s" })'
  },
  {
    name: "Effect",
    description: "Lifecycle-managed effect (clock/interval) with cleanup.",
    template: '$${3:now} = ""\n\n$effect(() => {\n  let id = setInterval(() => { $${3:now} = new Date().toISOString() }, 1000)\n  cleanup(() => clearInterval(id))\n}, ["mount"])\n\nbody = Text($${3:now})'
  },
  {
    name: "Action",
    description: "Action declaration that POSTs through the $http() builtin.",
    template: '$${1:items} = []\n\nfunction add(text) {\n  $${1:items} = [...$${1:items}, { id: $${1:items}.length + 1, text: text }]\n  $response = $http({ url: "https://api.example.com/save", method: "POST", body: { item: { text: text } } })\n}'
  },
  {
    name: "MapList",
    description: "Map an array of items into a list of components using `.map`.",
    template: "list${1} = $items.map(item => Card([Text(item.${2:name})]))"
  },
  {
    name: "ForLoop",
    description: "Iterate over an array statement-style \u2014 usable in a function body.",
    template: "function build${1:List}() {\n  let out = []\n  for (let item of $items) {\n    out.push(Card([Text(item.${2:name})]))\n  }\n  return Column(out)\n}"
  },
  {
    name: "FormReactive",
    description: "Two-way bound input with submit action.",
    template: '$draft = ""\n$items = []\n\nfunction add() {\n  $items = [...$items, { id: $items.length + 1, text: $draft }]\n  $draft = ""\n}\n\nform${1} = Column([\n  Input("${2:draft}", { placeholder: "What needs doing?", type: "text", value: $draft }),\n  Button("Add", { action: add, variant: "primary" })\n])'
  },
  {
    name: "Theme",
    description: "Brand-style theme override applied on top of the base theme.",
    template: '$theme({\n  name: "${1:brand}",\n  colors: {\n    primary:      "${2:#0969da}",\n    primaryHover: "${3:#0860c4}",\n    bg:           "${4:#ffffff}",\n    text:         "${5:#1f2328}"\n  },\n  radius: { button: "${6:6px}", input: "${7:6px}" },\n  font: { family: "${8:-apple-system, BlinkMacSystemFont, sans-serif}" }\n})'
  },
  {
    name: "Component",
    description: "Reusable component declaration \u2014 first-letter case is not significant; a function with no `return` simply renders nothing.",
    template: "function ${1:UserCard}(${2:user}) {\n  return Card([\n    Avatar(${2:user}.name),\n    Text(${2:user}.role)\n  ])\n}\n\nlist = $users.map(u => ${1:UserCard}(u))"
  },
  {
    name: "Ternary",
    description: "Pick between two expressions \u2014 the JS way to express a value-producing if.",
    template: "body${1} = ${2:condition} ? ${3:trueBranch} : ${4:falseBranch}"
  },
  {
    name: "IfStatement",
    description: "Imperative `if (cond) { \u2026 } else { \u2026 }` \u2014 usable inside function / effect bodies.",
    template: "if (${1:condition}) {\n  ${2:// then branch}\n} else {\n  ${3:// else branch}\n}"
  },
  {
    name: "SwitchStatement",
    description: "Switch on a value with case/default/break \u2014 statement form.",
    template: 'switch (${1:$tab}) {\n  case "overview": ${2:// \u2026}; break\n  case "billing":  ${3:// \u2026}; break\n  case "security": ${4:// \u2026}; break\n  default: ${5:// \u2026}\n}'
  },
  {
    name: "TemplateLiteral",
    description: "Template literal with `${}` interpolation.",
    template: "greeting${1} = `Hello ${${2:$user.name}}, you have ${${3:$messages.length}} messages`"
  },
  {
    name: "Http",
    description: "Fire an $http() request and bind the reactive resource bag.",
    template: '$${1:response} = $http({\n  url: "${2:https://api.example.com/items}",\n  method: "${3:GET}",\n  headers: { "Content-Type": "application/json" }\n})'
  },
  {
    name: "State",
    description: "Reactive state atom \u2014 declared with `$name = value`.",
    template: '$${1:name} = ${2:"default"}'
  },
  {
    name: "Store",
    description: "Global store \u2014 colocated state + actions shared across components (like Zustand/Pinia).",
    template: "${1:cart} = $store({\n  ${2:items}: [],\n  ${3:count}: (s) => s.${2:items}.length,\n  ${4:add}: (s, item) => { s.${2:items} = [...s.${2:items}, item] },\n})"
  },
  {
    name: "useState",
    description: "`$state` hook \u2014 per-instance state with a [value, setValue] pair (like React's useState).",
    template: 'const [${1:value}, set${2:Value}] = $state(${3:"default"})'
  },
  {
    name: "useMemo",
    description: "`$memo` hook \u2014 value recomputed only when a dependency changes (like React's useMemo).",
    template: "const ${1:memoized} = $memo(() => ${2:compute}, [${3:deps}])"
  },
  {
    name: "Hook",
    description: "Custom hook declaration \u2014 a `$`-prefixed function that composes $state / $memo.",
    template: "function $use${1:Counter}(${2:start}) {\n  const [${3:count}, set${4:Count}] = $state(${2:start})\n  return { ${3:count}: ${3:count}, increment: () => set${4:Count}(v => v + 1) }\n}"
  },
  {
    name: "ResponsiveGrid",
    description: "Grid with a responsive column map per breakpoint.",
    template: 'cards${1} = Grid(${2:items}, { columns: {sm: 1, md: 2, lg: 4}, gap: "${3:l}" })'
  }
];
function getSnippets() {
  return snippetCatalog;
}

// ../../src/language/index.ts
function getLanguageSpec(library = defaultLibrary) {
  const components2 = getComponentCatalog(library);
  return {
    grammar: grammarSpec,
    tokenizer: createStreamTokenizer(grammarSpec),
    tagMap: defaultTagMap,
    components: components2,
    componentsByName: indexCatalog(components2),
    builtins: builtinCatalog,
    snippets: getSnippets(),
    keywordDocs,
    themeNames: Object.keys(builtInThemes),
    severityTokenMap: { "parse-error": "error" },
    iconAliases: COMMON_ICON_ALIASES
  };
}
var COMMON_ICON_ALIASES = [
  "house",
  "user",
  "users",
  "gear",
  "bell",
  "envelope",
  "magnifying-glass",
  "plus",
  "minus",
  "pen",
  "trash",
  "check",
  "xmark",
  "arrow-right",
  "arrow-left",
  "arrow-up",
  "arrow-down",
  "chevron-right",
  "chevron-left",
  "chevron-down",
  "chevron-up",
  "ellipsis",
  "ellipsis-vertical",
  "star",
  "heart",
  "bookmark",
  "calendar",
  "clock",
  "file",
  "folder",
  "image",
  "video",
  "music",
  "chart-line",
  "chart-bar",
  "chart-pie",
  "gauge",
  "table",
  "circle-info",
  "circle-check",
  "circle-exclamation",
  "circle-question",
  "triangle-exclamation",
  "shield",
  "lock",
  "unlock",
  "key",
  "rocket",
  "bolt",
  "fire",
  "snowflake",
  "sun",
  "moon",
  "cloud",
  "code",
  "terminal",
  "database",
  "server",
  "globe",
  "link",
  "share",
  "download",
  "upload",
  "filter",
  "sort",
  "list",
  "grid",
  "columns",
  "sidebar",
  "bars",
  "tag",
  "tags",
  "flag",
  "trophy",
  "medal",
  "gift",
  "cart-shopping",
  "credit-card",
  "money-bill",
  "receipt",
  "wallet",
  "comment",
  "comments",
  "paper-plane",
  "inbox",
  "paper-clip",
  "phone",
  "video-camera",
  "play",
  "pause",
  "stop",
  "forward",
  "backward",
  "expand",
  "compress",
  "eye",
  "eye-slash",
  "thumbs-up",
  "thumbs-down",
  "thumbtack"
];

// ../../src/tooling/formatter.ts
var INDENT = "  ";
var SAFE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
var NEEDS_DOUBLE_QUOTE = /[\\"]/;
function formatProgram(source) {
  const program = parse(source);
  if (program.errors.length > 0) {
    return { formatted: source, errors: [...program.errors] };
  }
  const out = printProgram(program);
  const second = parse(out);
  if (second.errors.length > 0) {
    return { formatted: source, errors: [] };
  }
  return { formatted: out, errors: [] };
}
function printProgram(program) {
  const lines = [];
  let prev = null;
  for (const stmt of program.statements) {
    if (prev && needsBlankLineBetween(prev, stmt)) lines.push("");
    lines.push(printStatement(stmt, 0));
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
function printStatement(stmt, indent) {
  const pad = INDENT.repeat(indent);
  const exp = "exported" in stmt && stmt.exported ? "export " : "";
  switch (stmt.kind) {
    case "Import": {
      const specs = stmt.specifiers.map((s) => {
        const imported = s.isState ? `$${s.imported}` : s.imported;
        if (s.local === s.imported) return imported;
        const local = s.isState ? `$${s.local}` : s.local;
        return `${imported} as ${local}`;
      }).join(", ");
      return `${pad}import { ${specs} } from "${stmt.source}"`;
    }
    case "Assignment": {
      const lhs = stmt.isState ? `$${stmt.identifier}` : stmt.identifier;
      const expr = printExpression(stmt.expression, indent);
      return `${pad}${exp}${lhs} = ${expr}`;
    }
    case "ComponentDeclaration": {
      const params = stmt.params.map(printDeclParam).join(", ");
      const head = `${pad}${exp}function ${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1);
      return body.length > 0 ? `${head}
${body}
${pad}}` : `${head}
${pad}}`;
    }
    case "EffectDeclaration": {
      const deps = stmt.triggers.map(printTrigger).filter((s) => s.length > 0);
      if (stmt.rateLimit) {
        deps.push(`"${stmt.rateLimit.kind}(${stmt.rateLimit.ms})"`);
      }
      const body = printBlock(stmt.body.body, indent + 1);
      const depsArray = `[${deps.join(", ")}]`;
      return `${pad}$effect(() => {
${body}
${pad}}, ${depsArray})`;
    }
    case "ActionDeclaration": {
      const params = stmt.params.map(printDeclParam).join(", ");
      const head = `${pad}${exp}function ${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1);
      return `${head}
${body}
${pad}}`;
    }
    case "HookDeclaration": {
      const params = stmt.params.map(printDeclParam).join(", ");
      const head = `${pad}${exp}function $${stmt.name}(${params}) {`;
      const body = printBlock(stmt.body.body, indent + 1);
      return `${head}
${body}
${pad}}`;
    }
    case "Await": {
      return `${pad}await ${printExpression(stmt.argument, indent)}`;
    }
    case "Return": {
      return stmt.argument ? `${pad}return ${printExpression(stmt.argument, indent)}` : `${pad}return`;
    }
    case "ExpressionStatement": {
      return `${pad}${printExpression(stmt.expression, indent)}`;
    }
    case "IfStatement": {
      const test = printExpression(stmt.test, indent);
      const cons = `{
${printBlock(stmt.consequent.body, indent + 1)}
${pad}}`;
      if (!stmt.alternate) return `${pad}if (${test}) ${cons}`;
      const alt = stmt.alternate.kind === "IfStatement" ? printStatement(stmt.alternate, indent).trimStart() : `{
${printBlock(stmt.alternate.body, indent + 1)}
${pad}}`;
      return `${pad}if (${test}) ${cons} else ${alt}`;
    }
    case "SwitchStatement": {
      const disc = printExpression(stmt.discriminant, indent);
      const cases = stmt.cases.map((c) => printSwitchCase(c, indent + 1)).join("\n");
      return `${pad}switch (${disc}) {
${cases}
${pad}}`;
    }
    case "ForOfStatement": {
      const iter = printExpression(stmt.iterable, indent);
      const body = `{
${printBlock(stmt.body.body, indent + 1)}
${pad}}`;
      return `${pad}for (let ${stmt.item} of ${iter}) ${body}`;
    }
    case "ForClassicStatement": {
      const init = stmt.init ? printStatement(stmt.init, 0).trimStart() : "";
      const test = stmt.test ? printExpression(stmt.test, indent) : "";
      const update = stmt.update ? printExpression(stmt.update, indent) : "";
      const body = `{
${printBlock(stmt.body.body, indent + 1)}
${pad}}`;
      return `${pad}for (${init}; ${test}; ${update}) ${body}`;
    }
    case "WhileStatement": {
      const test = printExpression(stmt.test, indent);
      const body = `{
${printBlock(stmt.body.body, indent + 1)}
${pad}}`;
      return `${pad}while (${test}) ${body}`;
    }
    case "DoWhileStatement": {
      const test = printExpression(stmt.test, indent);
      const body = `{
${printBlock(stmt.body.body, indent + 1)}
${pad}}`;
      return `${pad}do ${body} while (${test})`;
    }
    case "ForInStatement": {
      const iter = printExpression(stmt.iterable, indent);
      const body = `{
${printBlock(stmt.body.body, indent + 1)}
${pad}}`;
      return `${pad}for (let ${stmt.item} in ${iter}) ${body}`;
    }
    case "DestructureStatement": {
      const open = stmt.patternKind === "array" ? "[" : "{";
      const close = stmt.patternKind === "array" ? "]" : "}";
      const parts = stmt.bindings.map((b) => {
        const lead = b.rest ? "..." : "";
        const keyed = b.sourceKey ? `${b.sourceKey}: ${b.name}` : b.name || "";
        const def = b.defaultValue ? ` = ${printExpression(b.defaultValue, indent)}` : "";
        return `${lead}${keyed}${def}`;
      });
      const expr = printExpression(stmt.expression, indent);
      return `${pad}let ${open}${parts.join(", ")}${close} = ${expr}`;
    }
    case "BreakStatement":
      return `${pad}break`;
    case "ContinueStatement":
      return `${pad}continue`;
    case "ThrowStatement":
      return `${pad}throw ${printExpression(stmt.argument, indent)}`;
    case "TryStatement": {
      const block = `{
${printBlock(stmt.block.body, indent + 1)}
${pad}}`;
      let out = `${pad}try ${block}`;
      if (stmt.catchBlock) {
        const catchHead = stmt.catchParam ? ` (${stmt.catchParam})` : "";
        const catchBody = `{
${printBlock(stmt.catchBlock.body, indent + 1)}
${pad}}`;
        out += ` catch${catchHead} ${catchBody}`;
      }
      if (stmt.finallyBlock) {
        const finBody = `{
${printBlock(stmt.finallyBlock.body, indent + 1)}
${pad}}`;
        out += ` finally ${finBody}`;
      }
      return out;
    }
  }
}
function printDeclParam(p) {
  if (p.defaultValue) {
    return `${p.name} = ${printExpression(p.defaultValue, 0)}`;
  }
  return p.name;
}
function printTrigger(t) {
  if (t.kind === "lifecycle") return `"${t.name}"`;
  if (t.kind === "every") return `"every(${t.intervalMs})"`;
  if (t.kind === "state") return `$${t.name}`;
  return "";
}
function printBlock(stmts, indent) {
  return stmts.map((s) => printStatement(s, indent)).join("\n");
}
function printExpression(expr, indent) {
  switch (expr.kind) {
    case "Literal":
      return printLiteral(expr.value);
    case "Identifier":
      return expr.name;
    case "StateRef":
      return `$${expr.name}`;
    case "Array": {
      if (expr.elements.length === 0) return "[]";
      const items = expr.elements.map((e) => printExpression(e, indent));
      const inline = `[${items.join(", ")}]`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const pad = INDENT.repeat(indent + 1);
      return `[
${items.map((s) => `${pad}${s}`).join(",\n")}
${INDENT.repeat(indent)}]`;
    }
    case "Object": {
      if (expr.properties.length === 0) return "{}";
      const items = expr.properties.map((p) => printObjectProp(p, indent));
      const inline = `{ ${items.join(", ")} }`;
      if (inline.length <= 80 && !items.some((s) => s.includes("\n"))) return inline;
      const pad = INDENT.repeat(indent + 1);
      return `{
${items.map((s) => `${pad}${s}`).join(",\n")}
${INDENT.repeat(indent)}}`;
    }
    case "Member": {
      const obj = printExpression(expr.object, indent);
      const dot = expr.optional ? "?." : ".";
      if (expr.property) return `${obj}${dot}${expr.property}`;
      if (expr.computed) {
        const inner = printExpression(expr.computed, indent);
        return expr.optional ? `${obj}?.[${inner}]` : `${obj}[${inner}]`;
      }
      return obj;
    }
    case "Unary":
      return `${expr.operator}${printExpression(expr.argument, indent)}`;
    case "Binary":
      return `${printExpression(expr.left, indent)} ${expr.operator} ${printExpression(expr.right, indent)}`;
    case "Ternary":
      return `${printExpression(expr.test, indent)} ? ${printExpression(expr.consequent, indent)} : ${printExpression(expr.alternate, indent)}`;
    case "Call":
      return printCall(expr.callee, expr.arguments, indent);
    case "MethodCall": {
      const target = printExpression(expr.object, indent);
      const sep = expr.optional ? "?." : ".";
      return printCall(`${target}${sep}${expr.method}`, expr.arguments, indent);
    }
    case "Invoke": {
      const callee = printExpression(expr.callee, indent);
      const sep = expr.optional ? "?." : "";
      return printCall(`${callee}${sep}`, expr.arguments, indent);
    }
    case "New": {
      const callee = printExpression(expr.callee, indent);
      return `new ${printCall(callee, expr.arguments, indent)}`;
    }
    case "BuiltinCall":
      return printCall(`@${expr.name}`, expr.arguments, indent);
    case "Template":
      return printTemplate(expr.quasis, expr.expressions, indent);
    case "Spread":
      return `...${printExpression(expr.argument, indent)}`;
    case "Lambda": {
      const params = expr.params.map((p) => {
        const prefix = p.rest ? "..." : "";
        return p.defaultValue ? `${prefix}${p.name} = ${printExpression(p.defaultValue, indent)}` : `${prefix}${p.name}`;
      }).join(", ");
      const head = expr.params.length === 1 && !expr.params[0].defaultValue && !expr.params[0].rest ? expr.params[0].name : `(${params})`;
      return `${head} => ${printExpression(expr.body, indent)}`;
    }
    case "Block":
      return `{
${printBlock(expr.body, indent + 1)}
${INDENT.repeat(indent)}}`;
  }
}
function printCall(callee, args, indent) {
  if (args.length === 0) return `${callee}()`;
  const parts = args.map((a) => printExpression(a, indent));
  const inline = `${callee}(${parts.join(", ")})`;
  if (inline.length <= 80 && !parts.some((s) => s.includes("\n"))) return inline;
  const pad = INDENT.repeat(indent + 1);
  return `${callee}(
${parts.map((s) => `${pad}${s}`).join(",\n")}
${INDENT.repeat(indent)})`;
}
function printSwitchCase(c, indent) {
  const pad = INDENT.repeat(indent);
  const body = c.body.map((s) => printStatement(s, indent + 1)).join("\n");
  if (c.test === null) {
    return `${pad}default:
${body}
${printStatement({ kind: "ExpressionStatement", expression: { kind: "Identifier", name: "break" } }, indent + 1)}`;
  }
  return `${pad}case ${printExpression(c.test, indent)}:
${body}
${INDENT.repeat(indent + 1)}break`;
}
function printObjectProp(prop, indent) {
  if (prop.spread) return `...${printExpression(prop.value, indent)}`;
  const value = printExpression(prop.value, indent);
  if (prop.value.kind === "Identifier" && prop.value.name === prop.key && SAFE_IDENT.test(prop.key)) {
    return prop.key;
  }
  const key = SAFE_IDENT.test(prop.key) ? prop.key : printStringLiteral(prop.key);
  return `${key}: ${value}`;
}
function printLiteral(value) {
  if (value === null) return "null";
  if (typeof value === "string") return printStringLiteral(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
function printStringLiteral(value) {
  if (NEEDS_DOUBLE_QUOTE.test(value)) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return `"${value}"`;
}
function printTemplate(quasis, expressions, indent) {
  const parts = [];
  for (let i = 0; i < quasis.length; i += 1) {
    parts.push(quasis[i] ?? "");
    if (i < expressions.length) {
      parts.push("${");
      parts.push(printExpression(expressions[i], indent));
      parts.push("}");
    }
  }
  return `\`${parts.join("")}\``;
}
export {
  builtinCatalog,
  defaultLibrary,
  findBuiltin,
  findDeclaration,
  formatProgram,
  getCompletions,
  getComponentCatalog,
  getDefinition,
  getDefinitionTarget,
  getDiagnostics,
  getDocumentHighlights,
  getDocumentSymbols,
  getHoverInfo,
  getLanguageSpec,
  getReferences,
  getRenameEdits,
  getSemanticTokens,
  getSignatureHelp,
  getSnippets,
  grammarSpec,
  isBuiltinName,
  keywordDocs,
  semanticTokenModifiers,
  semanticTokenTypes
};
