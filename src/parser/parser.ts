/**
 * Parser for Aktion (JS-aligned surface syntax).
 *
 * The grammar is a strict subset of JavaScript:
 *
 *   program        := (statement (NEWLINE | ";"))*
 *   statement      := functionDecl | assignment | expressionStmt
 *   functionDecl   := "function" Identifier "(" params ")" "{" block "}"
 *   assignment     := (let|const|var)? (Identifier|StateIdentifier) "=" expression
 *   expression     := ternary
 *   ternary        := logicalOr ("?" expression ":" expression)?
 *   primary        := if | switch | for | literal | call | array | object | lambda | grouped
 */

import { tokenize, type Token } from "./lexer.js";
import type {
  Program,
  Statement,
  Expression,
  ParseError,
  ObjectProperty,
  BlockExpr,
  DeclParam,
  EffectRateLimit,
  EffectTrigger,
  SwitchCase,
} from "./types.js";

export function parse(source: string): Program {
  const tokens = tokenize(source);
  const ctx = new ParserContext(tokens);
  const statements: Statement[] = [];
  const errors: ParseError[] = [];

  while (!ctx.isEnd()) {
    if (ctx.match("Newline") || ctx.match("Semicolon")) continue;

    try {
      const stmt = parseStatement(ctx, true);
      if (stmt) statements.push(stmt);
    } catch (err) {
      const error = err as ParseError;
      errors.push(error);
      ctx.recoverToNextLine();
    }
  }

  return { statements, errors };
}

/**
 * Top-level statement dispatcher. Recognises `function`, `if`, `for`,
 * `switch` keywords, then falls back to assignments and expression
 * statements.
 */
function parseStatement(ctx: ParserContext, _topLevel: boolean): Statement | null {
  const head = ctx.peek();
  if (head.type === "Keyword") {
    switch (head.value) {
      case "function": return parseFunctionDecl(ctx);
      case "effect":   return parseEffectStatement(ctx);
      case "await":    return parseAwait(ctx);
      case "return":   return parseReturn(ctx);
      case "let":
      case "const":
      case "var":      return parseVarDecl(ctx);
    }
  }
  const saved = ctx.snapshot();
  if (couldStartAssignment(ctx)) {
    try {
      return parseAssignment(ctx);
    } catch (err) {
      if (err && typeof err === "object" && (err as { __definitive?: boolean }).__definitive) {
        throw err;
      }
      ctx.restore(saved);
    }
  }
  return parseExpressionStatement(ctx);
}

function couldStartAssignment(ctx: ParserContext): boolean {
  const head = ctx.peek();
  if (head.type === "StateIdentifier") {
    const next = ctx.peek(1);
    return next.type === "Operator" && next.value === "=";
  }
  if (head.type !== "Identifier") return false;
  const next = ctx.peek(1);
  if (next.type === "Operator" && next.value === "=") return true;
  return false;
}

function parseExpressionStatement(ctx: ParserContext): Statement {
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
          { kind: "Literal", value: next.value },
        ],
        loc: { line: next.line, column: next.column },
      };
    }
  } else if (next.type === "Operator" && (next.value === "++" || next.value === "--")) {
    if (isAssignableTarget(expression)) {
      ctx.consume();
      expression = {
        kind: "BuiltinCall",
        name: "__rui_postfix__",
        arguments: [expression, { kind: "Literal", value: next.value }],
        loc: { line: next.line, column: next.column },
      };
    }
  }
  skipTerminator(ctx);
  return {
    kind: "ExpressionStatement",
    expression,
    loc: { line: start.line, column: start.column },
  };
}

function isAssignmentOperator(value: string): boolean {
  return value === "=" || value === "+=" || value === "-=" || value === "*="
    || value === "/=" || value === "??=";
}

function isAssignableTarget(expr: Expression): boolean {
  if (expr.kind === "Member") return true;
  if (expr.kind === "StateRef") return true;
  if (expr.kind === "Identifier") return true;
  return false;
}

/**
 * Parse `function Name(params) { body }`.
 * PascalCase names → ComponentDeclaration, camelCase → ActionDeclaration.
 */
function parseFunctionDecl(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "function");
  const nameTok = ctx.expect("Identifier");
  const params = parseFunctionParams(ctx);
  const body = parseBlock(ctx);
  skipTerminator(ctx);

  const isPascalCase = nameTok.value.length > 0 && nameTok.value[0]! >= "A" && nameTok.value[0]! <= "Z";

  if (isPascalCase) {
    const hasReturn = body.body.some((s) => s.kind === "Return");
    if (!hasReturn) {
      const err: ParseError & { __definitive?: boolean } = {
        message: `function "${nameTok.value}" (component) must end with an explicit \`return\` statement.`,
        line: start.line,
        column: start.column,
      };
      err.__definitive = true;
      throw err;
    }
    return {
      kind: "ComponentDeclaration",
      name: nameTok.value,
      params,
      slots: [],
      body,
      loc: { line: start.line, column: start.column },
    };
  }

  return {
    kind: "ActionDeclaration",
    name: nameTok.value,
    params,
    optimistic: false,
    body,
    loc: { line: start.line, column: start.column },
  };
}

function parseFunctionParams(ctx: ParserContext): DeclParam[] {
  ctx.expect("Punctuation", "(");
  const params: DeclParam[] = [];
  skipWhitespace(ctx);
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    while (true) {
      skipWhitespace(ctx);
      const tok = ctx.peek();
      if (tok.type === "Identifier" || tok.type === "Keyword") {
        const nameTok = ctx.consume();
        let defaultValue: Expression | undefined;
        if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          defaultValue = parseExpression(ctx);
        }
        params.push({ name: nameTok.value, defaultValue });
      } else {
        throw {
          message: `Expected parameter name, got ${tok.type} "${tok.value}"`,
          line: tok.line,
          column: tok.column,
        } satisfies ParseError;
      }
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        continue;
      }
      break;
    }
  }
  ctx.expect("Punctuation", ")");
  return params;
}

/**
 * Parse `effect(() => { body }, [deps])` at the statement level.
 * Produces an EffectDeclaration AST node.
 */
function parseEffectStatement(ctx: ParserContext): Statement {
  const start = ctx.consume(); // consume "effect" keyword
  ctx.expect("Punctuation", "(");
  skipWhitespace(ctx);

  const callbackExpr = parseExpression(ctx);
  let body: BlockExpr;
  if (callbackExpr.kind === "Lambda") {
    body = callbackExpr.body.kind === "Block"
      ? callbackExpr.body
      : { kind: "Block", body: [{ kind: "ExpressionStatement", expression: callbackExpr.body }] };
  } else {
    body = { kind: "Block", body: [] };
  }

  const triggers: EffectTrigger[] = [];
  let rateLimit: EffectRateLimit | undefined;

  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
    ctx.consume();
    skipWhitespace(ctx);
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "[") {
      ctx.consume();
      skipWhitespace(ctx);
      while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "]")) {
        parseEffectDep(ctx, triggers, (rl) => { rateLimit = rl; });
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

  const decl: Statement = {
    kind: "EffectDeclaration",
    name: `__effect_L${start.line}_C${start.column}`,
    triggers,
    body,
    loc: { line: start.line, column: start.column },
  };
  if (rateLimit) (decl as { rateLimit?: EffectRateLimit }).rateLimit = rateLimit;
  return decl;
}

/**
 * Parse a single dependency entry inside `effect(() => {}, [...])`.
 * Accepts: $state refs, "mount", "unmount", "every(N)", "debounce(N)", "throttle(N)".
 */
function parseEffectDep(
  ctx: ParserContext,
  triggers: EffectTrigger[],
  setRateLimit: (rl: EffectRateLimit) => void,
): void {
  const head = ctx.peek();

  if (head.type === "StateIdentifier") {
    ctx.consume();
    triggers.push({ kind: "state", name: head.value });
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
      column: head.column,
    } satisfies ParseError;
  }

  throw {
    message:
      `Unexpected ${head.type} "${head.value}" inside effect dependency array. ` +
      `Expected $state or a string token ("mount", "unmount", "every(N)", etc.).`,
    line: head.line,
    column: head.column,
  } satisfies ParseError;
}

/** Parse `let/const/var identifier = expression`. */
function parseVarDecl(ctx: ParserContext): Statement {
  const start = ctx.consume(); // let/const/var
  const head = ctx.peek();
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
      column: head.column,
    } satisfies ParseError;
  }
  ctx.expect("Operator", "=");
  const expression = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "Assignment",
    identifier,
    isState,
    expression,
    loc: { line: start.line, column: start.column },
  };
}

function parseBlock(ctx: ParserContext): BlockExpr {
  const start = ctx.expect("Punctuation", "{");
  const body: Statement[] = [];
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
    loc: { line: start.line, column: start.column },
  };
}

function parseAwait(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "await");
  const argument = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "Await",
    argument,
    loc: { line: start.line, column: start.column },
  };
}

function parseReturn(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "return");
  let argument: Expression | undefined;
  const next = ctx.peek();
  if (
    next.type !== "Newline" && next.type !== "Semicolon" &&
    !(next.type === "Punctuation" && next.value === "}")
  ) {
    argument = parseExpression(ctx);
  }
  skipTerminator(ctx);
  return {
    kind: "Return",
    argument,
    loc: { line: start.line, column: start.column },
  };
}

class ParserContext {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  isEnd(): boolean {
    return this.peek().type === "EOF";
  }

  peek(offset = 0): Token {
    return this.tokens[this.index + offset] ?? { type: "EOF", value: "", line: 0, column: 0 };
  }

  consume(): Token {
    const tok = this.tokens[this.index] ?? { type: "EOF", value: "", line: 0, column: 0 };
    this.index += 1;
    return tok;
  }

  match(type: Token["type"], value?: string): boolean {
    const tok = this.peek();
    if (tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    this.consume();
    return true;
  }

  expect(type: Token["type"], value?: string): Token {
    const tok = this.peek();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw {
        message: `Expected ${type}${value !== undefined ? ` "${value}"` : ""} but got ${tok.type} "${tok.value}"`,
        line: tok.line,
        column: tok.column,
      } satisfies ParseError;
    }
    return this.consume();
  }

  recoverToNextLine(): void {
    while (!this.isEnd() && this.peek().type !== "Newline" && this.peek().type !== "Semicolon") this.consume();
    if (this.peek().type === "Newline" || this.peek().type === "Semicolon") this.consume();
  }

  snapshot(): number {
    return this.index;
  }

  restore(index: number): void {
    this.index = index;
  }
}

function parseAssignment(ctx: ParserContext): Statement | null {
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
      column: head.column,
    } satisfies ParseError;
  }

  const eq = ctx.expect("Operator", "=");
  const expression = parseExpression(ctx);
  skipTerminator(ctx);

  return {
    kind: "Assignment",
    identifier,
    isState,
    expression,
    loc: { line: eq.line, column: eq.column },
  };
}

function parseExpression(ctx: ParserContext): Expression {
  return parseTernary(ctx);
}

function parseTernary(ctx: ParserContext): Expression {
  const test = parseLogicalOr(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "?") {
    ctx.consume();
    const consequent = parseExpression(ctx);
    ctx.expect("Punctuation", ":");
    const alternate = parseExpression(ctx);
    return { kind: "Ternary", test, consequent, alternate };
  }
  return test;
}

function parseLogicalOr(ctx: ParserContext): Expression {
  let left = parseLogicalAnd(ctx);
  while (
    ctx.peek().type === "Operator" &&
    (ctx.peek().value === "||" || ctx.peek().value === "??")
  ) {
    const op = ctx.consume().value as "||" | "??";
    const right = parseLogicalAnd(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}

function parseLogicalAnd(ctx: ParserContext): Expression {
  let left = parseEquality(ctx);
  while (ctx.peek().type === "Operator" && ctx.peek().value === "&&") {
    ctx.consume();
    const right = parseEquality(ctx);
    left = { kind: "Binary", operator: "&&", left, right };
  }
  return left;
}

function parseEquality(ctx: ParserContext): Expression {
  let left = parseComparison(ctx);
  while (ctx.peek().type === "Operator" && (ctx.peek().value === "==" || ctx.peek().value === "!=")) {
    const op = ctx.consume().value as "==" | "!=";
    const right = parseComparison(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}

function parseComparison(ctx: ParserContext): Expression {
  let left = parseAdditive(ctx);
  while (
    ctx.peek().type === "Operator" &&
    [">", "<", ">=", "<="].includes(ctx.peek().value)
  ) {
    const op = ctx.consume().value as ">" | "<" | ">=" | "<=";
    const right = parseAdditive(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}

function parseAdditive(ctx: ParserContext): Expression {
  let left = parseMultiplicative(ctx);
  while (ctx.peek().type === "Operator" && (ctx.peek().value === "+" || ctx.peek().value === "-")) {
    const op = ctx.consume().value as "+" | "-";
    const right = parseMultiplicative(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}

function parseMultiplicative(ctx: ParserContext): Expression {
  let left = parseUnary(ctx);
  while (
    ctx.peek().type === "Operator" &&
    (ctx.peek().value === "*" || ctx.peek().value === "/" || ctx.peek().value === "%")
  ) {
    const op = ctx.consume().value as "*" | "/" | "%";
    const right = parseUnary(ctx);
    left = { kind: "Binary", operator: op, left, right };
  }
  return left;
}

function parseUnary(ctx: ParserContext): Expression {
  const tok = ctx.peek();
  if (tok.type === "Operator" && (tok.value === "!" || tok.value === "-")) {
    ctx.consume();
    const argument = parseUnary(ctx);
    return { kind: "Unary", operator: tok.value as "!" | "-", argument };
  }
  return parsePostfix(ctx);
}

function parsePostfix(ctx: ParserContext): Expression {
  let expr = parsePrimary(ctx);
  while (true) {
    const tok = ctx.peek();
    if (tok.type === "Punctuation" && tok.value === ".") {
      ctx.consume();
      const propTok = ctx.consume();
      if (propTok.type !== "Identifier" && propTok.type !== "Keyword") {
        throw {
          message: `Expected Identifier but got ${propTok.type} "${propTok.value}"`,
          line: propTok.line,
          column: propTok.column,
        } satisfies ParseError;
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
          loc: { line: propTok.line, column: propTok.column },
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
      } else {
        const propTok = ctx.consume();
        if (propTok.type !== "Identifier" && propTok.type !== "Keyword") {
          throw {
            message: `Expected Identifier but got ${propTok.type} "${propTok.value}"`,
            line: propTok.line,
            column: propTok.column,
          } satisfies ParseError;
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
            loc: { line: propTok.line, column: propTok.column },
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
    break;
  }
  return expr;
}

function parsePrimary(ctx: ParserContext): Expression {
  const tok = ctx.peek();

  // JS control flow as expressions.
  if (tok.type === "Keyword") {
    if (tok.value === "if")     return parseIfExpression(ctx);
    if (tok.value === "switch") return parseSwitchExpression(ctx);
    if (tok.value === "for")    return parseForExpression(ctx);
    // Keywords that are also valid identifier names in expressions.
    if (
      tok.value === "function" || tok.value === "effect" ||
      tok.value === "let" || tok.value === "const" || tok.value === "var" ||
      tok.value === "of" || tok.value === "in" || tok.value === "case" ||
      tok.value === "break" || tok.value === "default"
    ) {
      ctx.consume();
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        ctx.consume();
        const args = parseCallArgs(ctx);
        ctx.expect("Punctuation", ")");
        return {
          kind: "Call",
          callee: tok.value,
          arguments: args,
          loc: { line: tok.line, column: tok.column },
        };
      }
      return { kind: "Identifier", name: tok.value, loc: { line: tok.line, column: tok.column } };
    }
  }

  if (tok.type === "Number") {
    ctx.consume();
    return { kind: "Literal", value: Number(tok.value) };
  }
  if (tok.type === "String") {
    ctx.consume();
    return { kind: "Literal", value: tok.value };
  }
  if (tok.type === "TemplateString") {
    ctx.consume();
    const parts = tok.parts ?? [];
    const quasis: string[] = [];
    const expressions: Expression[] = [];
    let pendingChunk = "";
    let hasPendingChunk = false;
    const flushChunk = (): void => {
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
      loc: { line: tok.line, column: tok.column },
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
    ctx.consume();
    return { kind: "StateRef", name: tok.value };
  }
  if (tok.type === "BuiltinIdentifier") {
    ctx.consume();
    ctx.expect("Punctuation", "(");
    const args = parseCallArgs(ctx);
    ctx.expect("Punctuation", ")");
    return {
      kind: "BuiltinCall",
      name: tok.value,
      arguments: args,
      loc: { line: tok.line, column: tok.column },
    };
  }
  if (tok.type === "Identifier") {
    ctx.consume();
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
      // Intercept `effect(...)` to produce an EffectDeclaration.
      if (tok.value === "effect") {
        return parseEffectCallAsExpr(ctx, tok);
      }
      ctx.consume();
      const args = parseCallArgs(ctx);
      ctx.expect("Punctuation", ")");
      return {
        kind: "Call",
        callee: tok.value,
        arguments: args,
        loc: { line: tok.line, column: tok.column },
      };
    }
    return {
      kind: "Identifier",
      name: tok.value,
      loc: { line: tok.line, column: tok.column },
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
    column: tok.column,
  } satisfies ParseError;
}

/**
 * Parse `effect(...)` in expression position — should not normally reach
 * here since the statement dispatcher handles `effect` at the top level.
 * Falls back to a regular Call node for the evaluator to handle.
 */
function parseEffectCallAsExpr(ctx: ParserContext, nameTok: Token): Expression {
  ctx.consume(); // (
  const args = parseCallArgs(ctx);
  ctx.expect("Punctuation", ")");
  return {
    kind: "Call",
    callee: nameTok.value,
    arguments: args,
    loc: { line: nameTok.line, column: nameTok.column },
  };
}

function parseCallArgs(ctx: ParserContext): Expression[] {
  const args: Expression[] = [];
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

function parseArgItem(ctx: ParserContext): Expression {
  if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
    const tok = ctx.consume();
    const argument = parseExpression(ctx);
    return { kind: "Spread", argument, loc: { line: tok.line, column: tok.column } };
  }
  return parseExpression(ctx);
}

/**
 * Parse `if (condition) { ... } else if (...) { ... } else { ... }`.
 * The condition MUST be wrapped in parentheses (JS syntax).
 */
function parseIfExpression(ctx: ParserContext): Expression {
  const start = ctx.expect("Keyword", "if");
  ctx.expect("Punctuation", "(");
  const test = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  const consequent = parseBlock(ctx);
  let alternate: Expression | undefined;
  skipWhitespace(ctx);
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "else") {
    ctx.consume();
    skipWhitespace(ctx);
    if (ctx.peek().type === "Keyword" && ctx.peek().value === "if") {
      alternate = parseIfExpression(ctx);
    } else {
      alternate = parseBlock(ctx);
    }
  }
  return {
    kind: "If",
    test,
    consequent,
    alternate: alternate as never,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * Parse `switch (value) { case X: ...; break; default: ... }`.
 */
function parseSwitchExpression(ctx: ParserContext): Expression {
  const start = ctx.expect("Keyword", "switch");
  ctx.expect("Punctuation", "(");
  const discriminant = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  ctx.expect("Punctuation", "{");
  const cases: SwitchCase[] = [];
  skipWhitespace(ctx);
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    let test: Expression | null = null;
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
        column: ctx.peek().column,
      } satisfies ParseError;
    }
    ctx.expect("Punctuation", ":");
    skipWhitespace(ctx);
    const body: Statement[] = [];
    while (
      !ctx.isEnd() &&
      !(ctx.peek().type === "Keyword" && (ctx.peek().value === "case" || ctx.peek().value === "default")) &&
      !(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")
    ) {
      // Skip `break` statements — they're valid JS but don't affect our semantics.
      if (ctx.peek().type === "Keyword" && ctx.peek().value === "break") {
        ctx.consume();
        skipTerminator(ctx);
        continue;
      }
      const stmt = parseStatement(ctx, false);
      if (stmt) body.push(stmt);
      skipWhitespace(ctx);
    }
    cases.push({ test, body });
    skipWhitespace(ctx);
  }
  ctx.expect("Punctuation", "}");
  return {
    kind: "Switch",
    discriminant,
    cases,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * Parse `for (let/const/var x of array) { body }` expression.
 * Also supports destructuring: `for (let {a, b} of array) { ... }`.
 */
function parseForExpression(ctx: ParserContext): Expression {
  const start = ctx.expect("Keyword", "for");
  ctx.expect("Punctuation", "(");
  skipWhitespace(ctx);

  // Optional let/const/var prefix.
  if (
    ctx.peek().type === "Keyword" &&
    (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")
  ) {
    ctx.consume();
  }
  skipWhitespace(ctx);

  let item: string;
  let index: string | undefined;
  let destructure: string[] | undefined;

  // Array destructuring: `[item, i]`
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "[") {
    ctx.consume();
    item = ctx.expect("Identifier").value;
    ctx.expect("Punctuation", ",");
    index = ctx.expect("Identifier").value;
    ctx.expect("Punctuation", "]");
  }
  // Object destructuring: `{a, b, c}`
  else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    ctx.consume();
    const fields: string[] = [];
    while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
      fields.push(ctx.expect("Identifier").value);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") ctx.consume();
    }
    ctx.expect("Punctuation", "}");
    item = "__row";
    destructure = fields;
  }
  // Simple binding: `x`
  else {
    item = ctx.expect("Identifier").value;
  }

  // `of` keyword
  ctx.expect("Keyword", "of");
  const iterable = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  const body = parseBlock(ctx);
  return {
    kind: "For",
    item,
    index,
    destructure,
    iterable,
    body,
    loc: { line: start.line, column: start.column },
  };
}

function tryParseLambdaFromParenList(ctx: ParserContext): Expression | null {
  const start = ctx.peek();
  if (start.type !== "Punctuation" || start.value !== "(") return null;
  ctx.consume();
  const params: { name: string; defaultValue?: Expression }[] = [];
  skipWhitespace(ctx);
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    while (true) {
      skipWhitespace(ctx);
      const tok = ctx.peek();
      if (tok.type !== "Identifier") return null;
      ctx.consume();
      const param: { name: string; defaultValue?: Expression } = { name: tok.value };
      // Default values use `=` in JS arrow functions (not `:` like old Aktion).
      if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
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
  let body: Expression;
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    body = parseBlock(ctx);
  } else {
    body = parseAssignmentLikeExpression(ctx);
  }
  return {
    kind: "Lambda",
    params,
    body: body as never,
    loc: { line: start.line, column: start.column },
  };
}

function parseAssignmentLikeExpression(ctx: ParserContext): Expression {
  const expression = parseExpression(ctx);
  const next = ctx.peek();
  if (next.type === "Operator") {
    const ops = ["=", "+=", "-=", "*=", "/=", "??="];
    if (ops.includes(next.value)) {
      ctx.consume();
      const value = parseExpression(ctx);
      return {
        kind: "BuiltinCall",
        name: "__rui_assign__",
        arguments: [
          expression,
          value,
          { kind: "Literal", value: next.value },
        ],
        loc: { line: next.line, column: next.column },
      };
    }
    if (next.value === "++" || next.value === "--") {
      ctx.consume();
      return {
        kind: "BuiltinCall",
        name: "__rui_postfix__",
        arguments: [
          expression,
          { kind: "Literal", value: next.value },
        ],
        loc: { line: next.line, column: next.column },
      };
    }
  }
  return expression;
}

function parseObjectProps(ctx: ParserContext): ObjectProperty[] {
  const props: ObjectProperty[] = [];
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") return props;

  while (true) {
    skipWhitespace(ctx);
    const keyTok = ctx.peek();
    if (keyTok.type === "Operator" && keyTok.value === "...") {
      ctx.consume();
      const value = parseExpression(ctx);
      props.push({ key: "", value, spread: true });
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        skipWhitespace(ctx);
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") break;
        continue;
      }
      break;
    }
    let key: string;
    if (keyTok.type === "Identifier" || keyTok.type === "String" || keyTok.type === "Keyword") {
      key = ctx.consume().value;
    } else {
      throw {
        message: `Expected object key, got ${keyTok.type} "${keyTok.value}"`,
        line: keyTok.line,
        column: keyTok.column,
      } satisfies ParseError;
    }
    const after = ctx.peek();
    let value: Expression;
    if (
      keyTok.type === "Identifier" &&
      after.type === "Punctuation" &&
      (after.value === "," || after.value === "}")
    ) {
      value = { kind: "Identifier", name: key, loc: { line: keyTok.line, column: keyTok.column } };
    } else {
      ctx.expect("Punctuation", ":");
      value = parseExpression(ctx);
    }
    props.push({ key, value });
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

/** Skip newlines and semicolons. */
function skipWhitespace(ctx: ParserContext): void {
  while (ctx.match("Newline") || ctx.match("Semicolon")) {/* skip */}
}

/** Skip an optional statement terminator (newline, semicolon, or nothing before `}`/EOF). */
function skipTerminator(ctx: ParserContext): void {
  if (!ctx.isEnd()) {
    ctx.match("Newline") || ctx.match("Semicolon");
  }
}
