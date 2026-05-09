/**
 * Parser for LLM Response UI Lang.
 *
 * Grammar (informal, line-oriented):
 *
 *   program        := (statement NEWLINE)*
 *   statement      := assignment
 *   assignment     := (Identifier | StateIdentifier) "=" expression
 *   expression     := ternary
 *   ternary        := logicalOr ("?" expression ":" expression)?
 *   logicalOr      := logicalAnd ("||" logicalAnd)*
 *   logicalAnd     := equality ("&&" equality)*
 *   equality       := comparison (("==" | "!=") comparison)*
 *   comparison     := additive ((">" | "<" | ">=" | "<=") additive)*
 *   additive       := multiplicative (("+" | "-") multiplicative)*
 *   multiplicative := unary (("*" | "/" | "%") unary)*
 *   unary          := ("!" | "-") unary | postfix
 *   postfix        := primary ("." Identifier)*
 *   primary        := Literal
 *                  | Identifier ("(" args ")")?      ; component or reference
 *                  | StateIdentifier
 *                  | "@" Identifier "(" args ")"     ; builtin call
 *                  | "[" args "]"                    ; array
 *                  | "{" objectProps "}"             ; object literal
 *                  | "(" expression ")"
 *
 * Errors per line are collected; the parser tries to recover at NEWLINE.
 */

import { tokenize, type Token } from "./lexer.js";
import type {
  Program,
  Statement,
  Expression,
  ParseError,
  ObjectProperty,
} from "./types.js";

export function parse(source: string): Program {
  const tokens = tokenize(source);
  const ctx = new ParserContext(tokens);
  const statements: Statement[] = [];
  const errors: ParseError[] = [];

  while (!ctx.isEnd()) {
    if (ctx.match("Newline")) continue;

    try {
      const stmt = parseAssignment(ctx);
      if (stmt) statements.push(stmt);
    } catch (err) {
      const error = err as ParseError;
      errors.push(error);
      ctx.recoverToNextLine();
    }
  }

  return { statements, errors };
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

  /** Skip a token only if it matches the given type/value, returning true. */
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
    while (!this.isEnd() && this.peek().type !== "Newline") this.consume();
    if (this.peek().type === "Newline") this.consume();
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

  // Trailing newline (or EOF).
  if (!ctx.isEnd()) ctx.match("Newline");

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
  while (ctx.peek().type === "Operator" && ctx.peek().value === "||") {
    ctx.consume();
    const right = parseLogicalAnd(ctx);
    left = { kind: "Binary", operator: "||", left, right };
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
  while (ctx.peek().type === "Punctuation" && ctx.peek().value === ".") {
    ctx.consume();
    const prop = ctx.expect("Identifier").value;
    expr = { kind: "Member", object: expr, property: prop };
  }
  return expr;
}

function parsePrimary(ctx: ParserContext): Expression {
  const tok = ctx.peek();

  if (tok.type === "Number") {
    ctx.consume();
    const value = Number(tok.value);
    return { kind: "Literal", value };
  }
  if (tok.type === "String") {
    ctx.consume();
    return { kind: "Literal", value: tok.value };
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
    return { kind: "BuiltinCall", name: tok.value, arguments: args };
  }
  if (tok.type === "Identifier") {
    ctx.consume();
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
      ctx.consume();
      const args = parseCallArgs(ctx);
      ctx.expect("Punctuation", ")");
      return { kind: "Call", callee: tok.value, arguments: args };
    }
    return { kind: "Identifier", name: tok.value };
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

function parseCallArgs(ctx: ParserContext): Expression[] {
  const args: Expression[] = [];
  // Allow newlines/whitespace inside argument lists for multi-line forms.
  while (ctx.match("Newline")) {/* skip */}
  if (ctx.peek().type === "Punctuation" && (ctx.peek().value === ")" || ctx.peek().value === "]")) {
    return args;
  }
  args.push(parseExpression(ctx));
  while (ctx.match("Newline")) {/* skip */}
  while (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
    ctx.consume();
    while (ctx.match("Newline")) {/* skip */}
    if (ctx.peek().type === "Punctuation" && (ctx.peek().value === ")" || ctx.peek().value === "]")) {
      break;
    }
    args.push(parseExpression(ctx));
    while (ctx.match("Newline")) {/* skip */}
  }
  while (ctx.match("Newline")) {/* skip */}
  return args;
}

function parseObjectProps(ctx: ParserContext): ObjectProperty[] {
  const props: ObjectProperty[] = [];
  while (ctx.match("Newline")) {/* skip */}
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") return props;

  while (true) {
    while (ctx.match("Newline")) {/* skip */}
    const keyTok = ctx.peek();
    let key: string;
    if (keyTok.type === "Identifier" || keyTok.type === "String") {
      key = ctx.consume().value;
    } else {
      throw {
        message: `Expected object key, got ${keyTok.type} "${keyTok.value}"`,
        line: keyTok.line,
        column: keyTok.column,
      } satisfies ParseError;
    }
    ctx.expect("Punctuation", ":");
    const value = parseExpression(ctx);
    props.push({ key, value });
    while (ctx.match("Newline")) {/* skip */}
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
      while (ctx.match("Newline")) {/* skip */}
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") break;
      continue;
    }
    break;
  }
  while (ctx.match("Newline")) {/* skip */}
  return props;
}
