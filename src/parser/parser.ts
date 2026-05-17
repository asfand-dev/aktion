/**
 * Parser for Streaming UI Script.
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

  /** Capture the current token cursor for speculative parsing. */
  snapshot(): number {
    return this.index;
  }

  /** Restore the cursor to a previous snapshot — see `parseAssignment`. */
  restore(index: number): void {
    this.index = index;
  }
}

function parseAssignment(ctx: ParserContext): Statement | null {
  const head = ctx.peek();
  let identifier = "";
  let isState = false;
  let isPersistent = false;
  let params: string[] | undefined;
  if (head.type === "Identifier") {
    identifier = ctx.consume().value;
    // Macro definition: `MyUserCard(user) = …`. Only treat the parameter list
    // as a macro when it is followed by `=` — otherwise the identifier is a
    // top-level call we should not consume.
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
      const savedIndex = ctx.snapshot();
      ctx.consume();
      const parsedParams: string[] = [];
      let ok = true;
      while (ctx.match("Newline")) {/* skip */}
      if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
        while (true) {
          while (ctx.match("Newline")) {/* skip */}
          const tok = ctx.peek();
          if (tok.type !== "Identifier") { ok = false; break; }
          parsedParams.push(ctx.consume().value);
          while (ctx.match("Newline")) {/* skip */}
          if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
            ctx.consume();
            continue;
          }
          break;
        }
      }
      if (ok && ctx.peek().type === "Punctuation" && ctx.peek().value === ")") {
        ctx.consume();
        if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          params = parsedParams;
        } else {
          ctx.restore(savedIndex);
        }
      } else {
        ctx.restore(savedIndex);
      }
    }
  } else if (head.type === "StateIdentifier") {
    identifier = ctx.consume().value;
    isState = true;
  } else if (head.type === "PersistentStateIdentifier") {
    identifier = ctx.consume().value;
    isState = true;
    isPersistent = true;
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
    isPersistent,
    params,
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
  // `??` shares precedence with `||` here for simplicity — authors who want
  // to mix `??` and `||` in the same expression should parenthesise.
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
      const prop = ctx.expect("Identifier").value;
      expr = { kind: "Member", object: expr, property: prop };
      continue;
    }
    if (tok.type === "Operator" && tok.value === "?.") {
      ctx.consume();
      const prop = ctx.expect("Identifier").value;
      expr = { kind: "Member", object: expr, property: prop, optional: true };
      continue;
    }
    break;
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
        // Interpolation runs back-to-back (e.g. `${a}${b}`). The template
        // literal grammar requires a quasi between every expression so we
        // emit an empty chunk to keep the invariant.
        quasis.push("");
      } else {
        flushChunk();
      }
      // Parse the substring as a standalone expression by feeding it
      // through `parse` wrapped in a synthetic assignment. We can't call
      // `parseExpression` directly because it expects a token stream and
      // the substring still needs its own lexer pass.
      const sub = parse(`__rui_tmpl__ = ${part.source}`);
      const firstStmt = sub.statements[0];
      if (firstStmt) {
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
  if (tok.type === "PersistentStateIdentifier") {
    ctx.consume();
    return { kind: "StateRef", name: tok.value, persistent: true };
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
  args.push(parseArgItem(ctx));
  while (ctx.match("Newline")) {/* skip */}
  while (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
    ctx.consume();
    while (ctx.match("Newline")) {/* skip */}
    if (ctx.peek().type === "Punctuation" && (ctx.peek().value === ")" || ctx.peek().value === "]")) {
      break;
    }
    args.push(parseArgItem(ctx));
    while (ctx.match("Newline")) {/* skip */}
  }
  while (ctx.match("Newline")) {/* skip */}
  return args;
}

/**
 * Single argument or array element. Recognises the spread form `...expr`
 * which is valid inside `[...]` only — callers that don't want spread will
 * receive a `SpreadExpr` they can reject. We keep the validation in the
 * evaluator so the parser stays small.
 */
function parseArgItem(ctx: ParserContext): Expression {
  if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
    const tok = ctx.consume();
    const argument = parseExpression(ctx);
    return { kind: "Spread", argument, loc: { line: tok.line, column: tok.column } };
  }
  return parseExpression(ctx);
}

function parseObjectProps(ctx: ParserContext): ObjectProperty[] {
  const props: ObjectProperty[] = [];
  while (ctx.match("Newline")) {/* skip */}
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") return props;

  while (true) {
    while (ctx.match("Newline")) {/* skip */}
    const keyTok = ctx.peek();
    // Object spread: `{...source, key: value}`. The spread expression's
    // resolved value is merged into the object during evaluation.
    if (keyTok.type === "Operator" && keyTok.value === "...") {
      ctx.consume();
      const value = parseExpression(ctx);
      props.push({ key: "", value, spread: true });
      while (ctx.match("Newline")) {/* skip */}
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        while (ctx.match("Newline")) {/* skip */}
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === "}") break;
        continue;
      }
      break;
    }
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
