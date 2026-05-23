/**
 * Parser for Aktion.
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
  BlockExpr,
  DeclParam,
  EffectRateLimit,
  EffectTrigger,
} from "./types.js";

export function parse(source: string): Program {
  const tokens = tokenize(source);
  const ctx = new ParserContext(tokens);
  const statements: Statement[] = [];
  const errors: ParseError[] = [];

  while (!ctx.isEnd()) {
    if (ctx.match("Newline")) continue;

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
 * Top-level statement dispatcher. Recognises the language declaration
 * keywords first, then falls back to bare assignments and expression
 * statements.
 *
 * `topLevel` distinguishes program-level statements from block-internal
 * ones (inside `component` / `effect` / `action` bodies). Bare `$x = …`
 * is allowed both at top-level and inside blocks — every `$x = expr`
 * declares (or re-assigns) a reactive state atom.
 */
function parseStatement(ctx: ParserContext, _topLevel: boolean): Statement | null {
  const head = ctx.peek();
  if (head.type === "Keyword") {
    switch (head.value) {
      case "component": return parseComponentDecl(ctx);
      case "effect":    return parseEffectDecl(ctx);
      case "action":    return parseActionDecl(ctx);
      case "emit":      return parseEmit(ctx);
      case "cleanup":   return parseCleanup(ctx);
      case "await":     return parseAwait(ctx);
      case "return":    return parseReturn(ctx);
    }
  }
  // Try parseAssignment speculatively. If the head is `Identifier "="` /
  // `Identifier "(" ... ")" "="` / `StateIdentifier "="`, parseAssignment
  // succeeds. Otherwise rewind and parse as a bare expression statement —
  // free-standing component calls inside `component { ... }` bodies are
  // the common case (the last expression is the component's render).
  const saved = ctx.snapshot();
  if (couldStartAssignment(ctx)) {
    try {
      return parseAssignment(ctx);
    } catch (err) {
      // Definitive migration errors must bubble — they are intentionally
      // raised by parseAssignment when the user wrote a removed legacy
      // construct (e.g. `Name(args) = expr`). Recovery would mask them
      // behind a generic "Unexpected token" error.
      if (err && typeof err === "object" && (err as { __definitive?: boolean }).__definitive) {
        throw err;
      }
      ctx.restore(saved);
      // Fall through to expression statement.
    }
  }
  return parseExpressionStatement(ctx);
}

/**
 * Cheap check: does the immediate token stream look like an assignment
 * (`name =`, `$name =`, or `name(args) =`) rather than an expression
 * statement? A definitive yes returns true; ambiguous cases return true
 * and rely on the speculative parser to recover.
 */
function couldStartAssignment(ctx: ParserContext): boolean {
  const head = ctx.peek();
  if (head.type === "StateIdentifier") {
    const next = ctx.peek(1);
    return next.type === "Operator" && next.value === "=";
  }
  if (head.type !== "Identifier") return false;
  const next = ctx.peek(1);
  if (next.type === "Operator" && next.value === "=") return true;
  // `name(args) = …` is a local-helper definition. Walking the parameter
  // list is expensive; the speculative parser handles it.
  if (next.type === "Punctuation" && next.value === "(") return true;
  return false;
}

function parseExpressionStatement(ctx: ParserContext): Statement {
  const start = ctx.peek();
  const expression = parseExpression(ctx);
  if (!ctx.isEnd()) ctx.match("Newline");
  return {
    kind: "ExpressionStatement",
    expression,
    loc: { line: start.line, column: start.column },
  };
}

function parseComponentDecl(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "component");
  const nameTok = ctx.expect("Identifier");
  const { params, slots } = parseComponentSignature(ctx);
  const body = parseBlock(ctx);
  if (!ctx.isEnd()) ctx.match("Newline");
  // Components MUST end in an explicit `return` so the rendered tree is
  // unambiguous; bare last-expression bodies were a 0.5-era convenience
  // that hid intent and made action-returning components confusing.
  const hasReturn = body.body.some((s) => s.kind === "Return");
  if (!hasReturn) {
    const err: ParseError & { __definitive?: boolean } = {
      message: `component "${nameTok.value}" must end with an explicit \`return\` statement.`,
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
    slots,
    body,
    loc: { line: start.line, column: start.column },
  };
}

function parseComponentSignature(ctx: ParserContext): {
  params: DeclParam[];
  slots: string[];
} {
  ctx.expect("Punctuation", "(");
  const params: DeclParam[] = [];
  const slots: string[] = [];
  while (ctx.match("Newline")) {/* skip */}
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    while (true) {
      while (ctx.match("Newline")) {/* skip */}
      const tok = ctx.peek();
      // `slots: { footer?, header? }` declaration. `slots` is a contextual
      // keyword that only matters in the component signature position;
      // elsewhere it parses as an ordinary identifier so `slots.footer`
      // works inside the body.
      if (tok.type === "Identifier" && tok.value === "slots") {
        ctx.consume();
        ctx.expect("Punctuation", ":");
        ctx.expect("Punctuation", "{");
        while (ctx.match("Newline")) {/* skip */}
        while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
          const slotTok = ctx.expect("Identifier");
          slots.push(slotTok.value);
          // Optional `?`.
          if (ctx.peek().type === "Punctuation" && ctx.peek().value === "?") {
            ctx.consume();
          }
          while (ctx.match("Newline")) {/* skip */}
          if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
            ctx.consume();
            while (ctx.match("Newline")) {/* skip */}
          }
        }
        ctx.expect("Punctuation", "}");
      } else if (tok.type === "Identifier" || tok.type === "Keyword") {
        // Accept keywords as component parameter names so component bodies
        // can take props like `action`, `effect`, `query`, etc. without
        // forcing the author to rename them.
        const nameTok = ctx.consume();
        let defaultValue: Expression | undefined;
        if (ctx.peek().type === "Punctuation" && ctx.peek().value === ":") {
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
      while (ctx.match("Newline")) {/* skip */}
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        continue;
      }
      break;
    }
  }
  ctx.expect("Punctuation", ")");
  return { params, slots };
}

function parseEffectDecl(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "effect");
  const triggers: EffectTrigger[] = [];
  let rateLimit: EffectRateLimit | undefined;

  // New canonical form: `effect [ ...deps ] { body }` or `effect { body }`.
  // The dependency list is a square-bracket array whose entries can be:
  //   - `$name`                  → state trigger
  //   - `on:mount` / `on:unmount`→ lifecycle trigger
  //   - `on:every(N)`            → interval trigger
  //   - `debounce(N)` / `throttle(N)` → rate-limit modifier
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "[") {
    ctx.consume();
    while (ctx.match("Newline")) { /* skip */ }
    while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "]")) {
      parseEffectDependency(ctx, triggers, (rl) => { rateLimit = rl; });
      while (ctx.match("Newline")) { /* skip */ }
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        while (ctx.match("Newline")) { /* skip */ }
      }
    }
    ctx.expect("Punctuation", "]");
  }

  const body = parseBlock(ctx);
  if (!ctx.isEnd()) ctx.match("Newline");
  const decl: Statement = {
    kind: "EffectDeclaration",
    name: `__effect_L${start.line}_C${start.column}`,
    triggers,
    body,
    loc: { line: start.line, column: start.column },
  };
  if (rateLimit) decl.rateLimit = rateLimit;
  return decl;
}

/**
 * Parse a single dependency entry inside `effect [ … ]`. Each entry
 * commits either a trigger (state / lifecycle / every) or a rate-limit
 * modifier (debounce / throttle).
 */
function parseEffectDependency(
  ctx: ParserContext,
  triggers: EffectTrigger[],
  setRateLimit: (rl: EffectRateLimit) => void,
): void {
  const head = ctx.peek();

  // `$state` reference → state trigger.
  if (head.type === "StateIdentifier") {
    ctx.consume();
    triggers.push({ kind: "state", name: head.value });
    return;
  }

  // `on:mount` / `on:unmount` / `on:every(N)`.
  if (head.type === "Keyword" && head.value === "on") {
    ctx.consume();
    ctx.expect("Punctuation", ":");
    const lifecycle = ctx.expect("Identifier").value;
    if (lifecycle === "mount" || lifecycle === "unmount") {
      triggers.push({ kind: "lifecycle", name: lifecycle });
      return;
    }
    if (lifecycle === "every") {
      ctx.expect("Punctuation", "(");
      const arg = ctx.expect("Number");
      ctx.expect("Punctuation", ")");
      triggers.push({ kind: "every", intervalMs: Number(arg.value) });
      return;
    }
    throw {
      message: `Unknown lifecycle trigger "on:${lifecycle}" inside effect dependency list`,
      line: head.line,
      column: head.column,
    } satisfies ParseError;
  }

  // `debounce(N)` / `throttle(N)` modifier.
  if (head.type === "Identifier" && (head.value === "debounce" || head.value === "throttle")) {
    const kind = ctx.consume().value as "debounce" | "throttle";
    ctx.expect("Punctuation", "(");
    const arg = ctx.expect("Number");
    ctx.expect("Punctuation", ")");
    setRateLimit({ kind, ms: Number(arg.value) });
    return;
  }

  throw {
    message:
      `Unexpected ${head.type} "${head.value}" inside effect dependency list. ` +
      `Expected $state, on:mount, on:unmount, on:every(N), debounce(N), or throttle(N).`,
    line: head.line,
    column: head.column,
  } satisfies ParseError;
}

function parseActionDecl(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "action");
  const nameTok = ctx.expect("Identifier");
  let params: DeclParam[] = [];
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
    params = parseComponentSignature(ctx).params;
  }
  consumeLegacyUsesClause(ctx);
  let optimistic = false;
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "optimistic") {
    ctx.consume();
    optimistic = true;
  }
  const body = parseBlock(ctx);
  if (!ctx.isEnd()) ctx.match("Newline");
  return {
    kind: "ActionDeclaration",
    name: nameTok.value,
    params,
    optimistic,
    body,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * Aktion does not carry a `uses { … }` capability clause on `action`
 * declarations — every runtime primitive (timers, network, DOM, storage,
 * clipboard, `js{}` blocks, …) is available unconditionally. Silently
 * swallow a stray `uses { … }` clause so older programs keep parsing.
 */
function consumeLegacyUsesClause(ctx: ParserContext): EffectRateLimit | undefined {
  const tok = ctx.peek();
  if (tok.type !== "Identifier" || tok.value !== "uses") return undefined;
  ctx.consume();
  ctx.expect("Punctuation", "{");
  let rateLimit: EffectRateLimit | undefined;
  while (ctx.match("Newline")) {/* skip */}
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const head = ctx.peek();
    if (head.type !== "Identifier" && head.type !== "Keyword") {
      throw {
        message: `Expected capability name inside legacy "uses { … }" clause, got ${head.type} "${head.value}"`,
        line: head.line,
        column: head.column,
      } satisfies ParseError;
    }
    let name = ctx.consume().value;
    while (ctx.peek().type === "Punctuation" && ctx.peek().value === ".") {
      ctx.consume();
      name += `.${ctx.expect("Identifier").value}`;
    }
    let firstArg: number | undefined;
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
      ctx.consume();
      if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
        const arg = ctx.peek();
        if (arg.type === "Number") {
          firstArg = Number(arg.value);
        }
        // Discard remaining args inside the (...).
        let depth = 1;
        while (!ctx.isEnd() && depth > 0) {
          const next = ctx.consume();
          if (next.type === "Punctuation" && next.value === "(") depth += 1;
          else if (next.type === "Punctuation" && next.value === ")") depth -= 1;
        }
      } else {
        ctx.expect("Punctuation", ")");
      }
    }
    if ((name === "debounce" || name === "throttle") && firstArg !== undefined) {
      rateLimit = { kind: name, ms: firstArg };
    }
    while (ctx.match("Newline")) {/* skip */}
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
      while (ctx.match("Newline")) {/* skip */}
    }
  }
  ctx.expect("Punctuation", "}");
  return rateLimit;
}


function parseBlock(ctx: ParserContext): BlockExpr {
  const start = ctx.expect("Punctuation", "{");
  const body: Statement[] = [];
  while (ctx.match("Newline")) {/* skip */}
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const stmt = parseStatement(ctx, false);
    if (stmt) body.push(stmt);
    while (ctx.match("Newline")) {/* skip */}
  }
  ctx.expect("Punctuation", "}");
  return {
    kind: "Block",
    body,
    loc: { line: start.line, column: start.column },
  };
}

function parseEmit(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "emit");
  const nameTok = ctx.expect("String");
  let detail: Expression = { kind: "Object", properties: [] };
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    ctx.consume();
    const props = parseObjectProps(ctx);
    ctx.expect("Punctuation", "}");
    detail = { kind: "Object", properties: props };
  }
  if (!ctx.isEnd()) ctx.match("Newline");
  return {
    kind: "Emit",
    eventName: nameTok.value,
    detail,
    loc: { line: start.line, column: start.column },
  };
}

function parseCleanup(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "cleanup");
  ctx.expect("Punctuation", "(");
  const callback = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  if (!ctx.isEnd()) ctx.match("Newline");
  return {
    kind: "Cleanup",
    callback,
    loc: { line: start.line, column: start.column },
  };
}

function parseAwait(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "await");
  const argument = parseExpression(ctx);
  if (!ctx.isEnd()) ctx.match("Newline");
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
  if (next.type !== "Newline" && !(next.type === "Punctuation" && next.value === "}")) {
    argument = parseExpression(ctx);
  }
  if (!ctx.isEnd()) ctx.match("Newline");
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
  if (head.type === "Identifier") {
    identifier = ctx.consume().value;
    // The legacy `Name(args) = expr` macro shorthand was removed in Streaming
    // UI Script 0.5. We still recognise the pattern so we can surface a
    // clear migration error pointing the author at `component` blocks for
    // top-level reusables or at lambdas (`name = (args) => …`) for local
    // helpers — silently falling through would produce a confusing
    // "expected =, got (" message instead.
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
          // Surface a *definitive* migration error so the speculative
          // statement dispatcher does not swallow it and retry as an
          // expression statement (which would produce a generic
          // "Unexpected token" instead of the helpful guidance below).
          const err: ParseError & { __definitive?: boolean } = {
            message:
              `Legacy "${identifier}(...) = expr" macro shorthand is removed in ` +
              `Aktion 0.5. Use "component ${identifier}(` +
              `${parsedParams.join(", ")}) { ... }" for reusables, or ` +
              `"${identifier} = (${parsedParams.join(", ")}) => ..." for ` +
              `local helpers.`,
            line: head.line,
            column: head.column,
          };
          err.__definitive = true;
          throw err;
        }
        ctx.restore(savedIndex);
      } else {
        ctx.restore(savedIndex);
      }
    }
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
        const args = parseCallArgs(ctx, { named: true });
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
          const args = parseCallArgs(ctx, { named: true });
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

  // Aktion 0.5 expression forms — `if`, `match`, `for` evaluate to ComponentNodes.
  if (tok.type === "Keyword") {
    if (tok.value === "if")    return parseIfExpression(ctx);
    if (tok.value === "match") return parseMatchExpression(ctx);
    if (tok.value === "for")   return parseForExpression(ctx);
    // Keywords that are also valid component-parameter / object-key names
    // may appear in identifier position inside expressions (e.g. a body
    // that re-emits a `action` parameter). Treat them as identifiers when
    // not followed by tokens that would start a declaration.
    if (tok.value === "action" || tok.value === "effect") {
      const nxt = ctx.peek(1);
      const looksLikeDecl = nxt && nxt.type === "Identifier";
      if (!looksLikeDecl) {
        ctx.consume();
        return { kind: "Identifier", name: tok.value, loc: { line: tok.line, column: tok.column } };
      }
    }
  }

  if (tok.type === "JsBlock") {
    ctx.consume();
    return {
      kind: "JsBlock",
      body: tok.value,
      loc: { line: tok.line, column: tok.column },
    };
  }

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
    const args = parseCallArgs(ctx, { named: true });
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
      const args = parseCallArgs(ctx, { named: true });
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
    // Could be either a parenthesised expression OR a lambda parameter
    // list. Speculatively try lambda first by walking ahead to find a
    // matching `)` followed by `=>`. If matched, parse as lambda;
    // otherwise rewind and parse as a normal grouping.
    const saved = ctx.snapshot();
    const lambda = tryParseLambdaFromParenList(ctx);
    if (lambda) return lambda;
    ctx.restore(saved);
    ctx.consume(); // (
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

function parseCallArgs(ctx: ParserContext, opts?: { named?: boolean }): Expression[] {
  const args: Expression[] = [];
  const allowNamed = opts?.named === true;
  // Allow newlines/whitespace inside argument lists for multi-line forms.
  while (ctx.match("Newline")) {/* skip */}
  if (ctx.peek().type === "Punctuation" && (ctx.peek().value === ")" || ctx.peek().value === "]")) {
    return args;
  }
  args.push(allowNamed ? parseCallArgItem(ctx) : parseArgItem(ctx));
  while (ctx.match("Newline")) {/* skip */}
  while (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
    ctx.consume();
    while (ctx.match("Newline")) {/* skip */}
    if (ctx.peek().type === "Punctuation" && (ctx.peek().value === ")" || ctx.peek().value === "]")) {
      break;
    }
    args.push(allowNamed ? parseCallArgItem(ctx) : parseArgItem(ctx));
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

/**
 * Call-list argument: optional `name: expr` / `bind:prop: stateRef` before
 * falling back to a full expression. Named args are only allowed in `(...)`
 * lists, not `[...]`.
 *
 * The legacy `name=expr` form has been removed in Aktion 0.5 —
 * the parser surfaces a definitive migration error pointing the author at
 * the canonical `name: expr` form. Silently accepting both would let LLM
 * outputs keep drifting and would re-introduce the very ambiguity the
 * "named args with `:`, defaults with `:`" rule exists to resolve.
 */
function parseCallArgItem(ctx: ParserContext): Expression {
  if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
    const tok = ctx.consume();
    const argument = parseExpression(ctx);
    return { kind: "Spread", argument, loc: { line: tok.line, column: tok.column } };
  }
  // `bind:prop: stateRef` two-way binding sugar.
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "bind") {
    const start = ctx.consume();
    ctx.expect("Punctuation", ":");
    const propTok = ctx.expect("Identifier");
    ctx.expect("Punctuation", ":");
    const target = parseExpression(ctx);
    return {
      kind: "Bind",
      prop: propTok.value,
      target,
      loc: { line: start.line, column: start.column },
    };
  }
  // Reject legacy `name=expr` form with a clear migration error before
  // attempting to parse it as an expression. The error is marked
  // `__definitive` so the speculative statement dispatcher does not
  // swallow it and retry as a bare expression statement (which would
  // produce a misleading "Unexpected token" error instead).
  if (
    ctx.peek().type === "Identifier" &&
    ctx.peek(1).type === "Operator" &&
    ctx.peek(1).value === "="
  ) {
    const nameTok = ctx.peek();
    const err: ParseError & { __definitive?: boolean } = {
      message:
        `Legacy "name=value" named-arg form is removed in Aktion 0.5. ` +
        `Use "${nameTok.value}: value" instead.`,
      line: nameTok.line,
      column: nameTok.column,
    };
    err.__definitive = true;
    throw err;
  }
  // `name: expr` — the canonical Aktion 0.5 named-arg form.
  // Distinguish from a free-standing ternary by requiring the
  // `Identifier ":"` (or `Keyword ":"`) pair to be a clean prefix. We
  // accept keyword tokens as prop names so component authors can use
  // names like `action`, `effect`, `query`, `mutation`, `subscription`,
  // `component`, `then` as props without escaping (matches the
  // object-literal parser's behaviour for keys).
  const head = ctx.peek();
  if (
    (head.type === "Identifier" || head.type === "Keyword") &&
    ctx.peek(1).type === "Punctuation" &&
    ctx.peek(1).value === ":"
  ) {
    const nameTok = ctx.consume();
    ctx.consume(); // :
    const value = parseExpression(ctx);
    return {
      kind: "NamedArg",
      name: nameTok.value,
      value,
      loc: { line: nameTok.line, column: nameTok.column },
    };
  }
  return parseExpression(ctx);
}

/**
 * Parse an `if cond { ... } [else (if-expr | block)]` expression. The
 * `if` keyword has already been peeked but not consumed.
 */
function parseIfExpression(ctx: ParserContext): Expression {
  const start = ctx.expect("Keyword", "if");
  const test = parseExpression(ctx);
  const consequent = parseBlock(ctx);
  let alternate: Expression | undefined;
  while (ctx.match("Newline")) {/* skip */}
  if (ctx.peek().type === "Keyword" && ctx.peek().value === "else") {
    ctx.consume();
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

function parseMatchExpression(ctx: ParserContext): Expression {
  const start = ctx.expect("Keyword", "match");
  const discriminant = parseExpression(ctx);
  ctx.expect("Punctuation", "{");
  const arms: { pattern: Expression | "_"; body: Expression }[] = [];
  while (ctx.match("Newline")) {/* skip */}
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    let pattern: Expression | "_";
    const tok = ctx.peek();
    if (tok.type === "Keyword" && tok.value === "default") {
      ctx.consume();
      pattern = "_";
    } else {
      pattern = parseExpression(ctx);
    }
    ctx.expect("Punctuation", ":");
    const body = parseMatchArmBody(ctx);
    arms.push({ pattern, body });
    while (ctx.match("Newline")) {/* skip */}
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
      while (ctx.match("Newline")) {/* skip */}
    }
  }
  ctx.expect("Punctuation", "}");
  return {
    kind: "Match",
    discriminant,
    arms,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * Parse the right-hand side of a `match` arm.
 *
 * When the body opens with `{`, treat it as a **statement block** — the
 * same shape `if` / `for` accept — so callers can run side effects
 * (`{ $drafts = [...$drafts, payload] }`) and return the last expression.
 *
 * Without this carve-out, `parseExpression` would route the brace to the
 * object-literal branch in `parsePrimary`, which only accepts
 * `key: value` pairs and rejects state writes / control statements with
 * a confusing "Expected object key" error.
 *
 * Authors who need to return an object literal from a match arm can wrap
 * it in parentheses (`"a": ({ y: 1 })`) — the grouping form keeps the
 * primary expression path active.
 */
function parseMatchArmBody(ctx: ParserContext): Expression {
  const head = ctx.peek();
  if (head.type === "Punctuation" && head.value === "{") {
    return parseBlock(ctx);
  }
  return parseExpression(ctx);
}

function parseForExpression(ctx: ParserContext): Expression {
  const start = ctx.expect("Keyword", "for");
  let item: string;
  let index: string | undefined;
  let destructure: string[] | undefined;
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
    ctx.consume();
    item = ctx.expect("Identifier").value;
    ctx.expect("Punctuation", ",");
    index = ctx.expect("Identifier").value;
    ctx.expect("Punctuation", ")");
  } else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    ctx.consume();
    const fields: string[] = [];
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
  ctx.expect("Keyword", "in");
  const iterable = parseExpression(ctx);
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

/**
 * Speculatively try to parse a parenthesised lambda parameter list.
 * Returns a lambda expression when the trailing `=>` is found, otherwise
 * `null` (the caller restores the cursor and parses a normal grouping).
 *
 * Accepted forms: `()`, `(x)`, `(x, y)`, `(x: 0, y: 1)` (defaults),
 * followed by `=>` and a body expression OR a `js{ … }` block.
 */
function tryParseLambdaFromParenList(ctx: ParserContext): Expression | null {
  const start = ctx.peek();
  if (start.type !== "Punctuation" || start.value !== "(") return null;
  ctx.consume();
  const params: { name: string; defaultValue?: Expression }[] = [];
  while (ctx.match("Newline")) {/* skip */}
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    while (true) {
      while (ctx.match("Newline")) {/* skip */}
      const tok = ctx.peek();
      if (tok.type !== "Identifier") return null;
      ctx.consume();
      const param: { name: string; defaultValue?: Expression } = { name: tok.value };
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ":") {
        ctx.consume();
        try {
          param.defaultValue = parseExpression(ctx);
        } catch {
          return null;
        }
      }
      params.push(param);
      while (ctx.match("Newline")) {/* skip */}
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        ctx.consume();
        continue;
      }
      break;
    }
  }
  while (ctx.match("Newline")) {/* skip */}
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    return null;
  }
  ctx.consume();
  if (!(ctx.peek().type === "Operator" && ctx.peek().value === "=>")) {
    return null;
  }
  ctx.consume();
  // Body: a JS block, a `{ ... }` block, or a single expression /
  // assignment statement (the spec permits a lone assignment here).
  let body: Expression;
  if (ctx.peek().type === "JsBlock") {
    const tok = ctx.consume();
    body = { kind: "JsBlock", body: tok.value, loc: { line: tok.line, column: tok.column } };
  } else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
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

/**
 * Parse a single expression OR an assignment statement as a synthetic
 * builtin call. Used inside lambda bodies (`() => $x = 1`,
 * `() => count++`) where the Aktion 0.5 spec accepts a single statement form.
 *
 * The runtime recognises the following synthetic builtins:
 *   `@__rui_assign__($name, value, op)` — `op` is `"="`, `"+="`, `"-="`, etc.
 *   `@__rui_postfix__($name, op)`       — `op` is `"++"` or `"--"`.
 */
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
    // Accept identifiers, strings, AND most keywords (so component code can
    // freely use names like `action`, `effect`, `query` as object keys).
    if (keyTok.type === "Identifier" || keyTok.type === "String" || keyTok.type === "Keyword") {
      key = ctx.consume().value;
    } else {
      throw {
        message: `Expected object key, got ${keyTok.type} "${keyTok.value}"`,
        line: keyTok.line,
        column: keyTok.column,
      } satisfies ParseError;
    }
    // Property shorthand: `{ name }` desugars to `{ name: name }`. Only
    // valid when the key is a bare identifier and the next token closes
    // the property (comma or `}`).
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
