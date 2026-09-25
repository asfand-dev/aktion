/**
 * Parser for Aktion (strict JavaScript subset).
 *
 * The grammar mirrors the JS spec:
 *
 *   program     := (statement (NEWLINE | ";"))*
 *   statement   := functionDecl | varDecl | ifStmt | forStmt | whileStmt
 *                | switchStmt | tryStmt | breakStmt | continueStmt
 *                | returnStmt | throwStmt | assignment | expressionStmt
 *   expression  := assignmentExpr (logical, comparison, arithmetic, …)
 *   primary     := literal | identifier | array | object | lambda
 *                | grouped | new | unary
 *
 * `if` / `for` / `switch` / `while` / `try` are **statements only** —
 * they do not produce a value. To collect iterable bodies into an array
 * use `arr.map(x => …)` (every Aktion program is valid JavaScript).
 */

import { tokenize, type RawComment, type Token } from "./lexer.js";
import { walkNode } from "./walk.js";
import type {
  Program,
  Statement,
  AssignmentStatement,
  AttachedComment,
  ExpressionStatement,
  Expression,
  ParseError,
  ObjectProperty,
  BlockExpr,
  DeclParam,
  EffectRateLimit,
  EffectTrigger,
  SwitchCase,
  DestructuringPattern,
  LambdaParam,
  ImportSpecifier,
  SourceLocation,
} from "./types.js";

export function parse(source: string): Program {
  const comments: RawComment[] = [];
  const tokens = tokenize(source, comments);
  const ctx = new ParserContext(tokens, comments);
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

  // The program has no enclosing braces — comments before the first
  // statement (start boundary 0) through end-of-file (the `EOF` token's own
  // line, +1 so a comment ON that line is still "inside") are this
  // container's to attach.
  attachComments(ctx, statements, 0, ctx.peek().line + 1);

  return { statements, errors };
}

/**
 * Records, for a `Statement` this module itself constructed, the source line
 * its OWN grammar ends on — used only by `attachComments` to decide whether a
 * comment sits on the same line as a statement (trailing) or strictly after
 * it (leading for whatever comes next).
 *
 * A `WeakMap` keyed by the node object itself (rather than a new `endLoc`
 * field on all ~20 `Statement` interfaces) keeps this bookkeeping private to
 * the parser — every OTHER consumer of the AST (evaluator, linker, tooling)
 * never sees it and needs no changes.
 *
 * Populated two ways:
 *   - Generically, by the `parseStatement` wrapper below, from "the last
 *     token this statement's own parse function consumed" — correct for
 *     every statement kind EXCEPT `if`/`try`, whose parse functions do a
 *     speculative `skipWhitespace` lookahead for an optional `else`/`catch`/
 *     `finally` that may not be there, which would otherwise over-count
 *     trailing blank lines as part of the statement's own span.
 *   - Precisely, by `parseIfStatement`/`parseTryStatement` themselves (using
 *     the same map, populated for their constituent `BlockExpr`s by
 *     `parseBlock`), which the generic wrapper only fills in as a fallback
 *     (`if (!nodeEndLine.has(stmt))`) — so the precise value always wins.
 */
const nodeEndLine = new WeakMap<object, number>();

/**
 * Top-level statement dispatcher. Mirrors the JS statement grammar —
 * keyword-led statements (`function`, `if`, `for`, `while`, `switch`,
 * `try`, `throw`, `break`, `continue`, `return`, `await`, `let` /
 * `const` / `var`) take precedence; otherwise we try an assignment
 * (`name = expr` / `$name = expr`) and fall through to a bare
 * expression statement.
 */
function parseStatement(ctx: ParserContext, topLevel: boolean): Statement | null {
  const stmt = parseStatementImpl(ctx, topLevel);
  if (stmt && !nodeEndLine.has(stmt)) {
    nodeEndLine.set(stmt, ctx.previousConsumedLine());
  }
  return stmt;
}

function parseStatementImpl(ctx: ParserContext, _topLevel: boolean): Statement | null {
  const head = ctx.peek();
  // `$effect(() => { … }, [deps])` — the side-effect builtin. Its name is
  // `$`-prefixed (lexes as a StateIdentifier), but it is parsed specially so
  // the dependency array keeps its trigger semantics (`$state` refs by name,
  // `"mount"`, `"every(N)"`, …) rather than being read as a plain array.
  if (head.type === "StateIdentifier" && head.value === "effect" &&
      ctx.peek(1).type === "Punctuation" && ctx.peek(1).value === "(") {
    return parseEffectStatement(ctx);
  }
  if (head.type === "Keyword") {
    switch (head.value) {
      case "function": return parseFunctionDecl(ctx);
      case "import":   return parseImportStatement(ctx);
      case "export":   return parseExportStatement(ctx);
      case "await":    return parseAwait(ctx);
      case "async": {
        // `async function name(...) { ... }` — the runtime is already
        // async-aware (the action / effect runners `await` every
        // expression that returns a thenable), so `async` is accepted
        // as a no-op modifier in front of a function declaration.
        if (ctx.peek(1).type === "Keyword" && ctx.peek(1).value === "function") {
          ctx.consume();
          return parseFunctionDecl(ctx);
        }
        break;
      }
      case "return":   return parseReturn(ctx);
      case "let":
      case "const":
      case "var":      return parseVarDecl(ctx);
      case "if":       return parseIfStatement(ctx);
      case "switch":   return parseSwitchStatement(ctx);
      case "for":      return parseForStatement(ctx);
      case "while":    return parseWhileStatement(ctx);
      case "do":       return parseDoWhileStatement(ctx);
      case "break":    return parseBreakStatement(ctx);
      case "continue": return parseContinueStatement(ctx);
      case "throw":    return parseThrowStatement(ctx);
      case "try":      return parseTryStatement(ctx);
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
  if (head.type !== "Identifier" && head.type !== "StateIdentifier") {
    return false;
  }
  const next = ctx.peek(1);
  return next.type === "Operator" && next.value === "=";
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
    || value === "/=" || value === "%=" || value === "**="
    || value === "??=" || value === "&&=" || value === "||="
    || value === "&=" || value === "|=" || value === "^="
    || value === "<<=" || value === ">>=" || value === ">>>=";
}

function isAssignableTarget(expr: Expression): boolean {
  if (expr.kind === "Member") return true;
  if (expr.kind === "StateRef") return true;
  if (expr.kind === "Identifier") return true;
  return false;
}

/**
 * Parse `function name(params) { body }`.
 *
 * Name-case selects the default classification — a PascalCase name
 * declares a component, a lowercase-first name declares an action. The
 * runtime registers every component as an action too (so it works in
 * event-handler position), and every action remains usable as a value-
 * returning helper. The "component must `return`" requirement has been
 * dropped: a component with no `return` simply renders nothing.
 */
function parseFunctionDecl(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "function");
  // A `$`-prefixed name (`function $useCounter() { ... }`) declares a HOOK.
  // The lexer emits the name as a `StateIdentifier` (value without the `$`).
  // Hooks compose per-instance state — their body runs inline in the calling
  // component's hook scope (React's custom-hook model).
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
      loc: { line: start.line, column: start.column },
    };
  }

  const isPascalCase =
    nameTok.value.length > 0 && nameTok.value[0]! >= "A" && nameTok.value[0]! <= "Z";

  if (isPascalCase) {
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
      let isRest = false;
      if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
        ctx.consume();
        isRest = true;
      }
      const tok = ctx.peek();
      // Destructuring pattern parameter: `function Foo({ name }, [a, b]) { … }`.
      if (!isRest && tok.type === "Punctuation" && (tok.value === "{" || tok.value === "[")) {
        const pattern = parseDestructuringPattern(ctx);
        let defaultValue: Expression | undefined;
        if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          defaultValue = parseExpression(ctx);
        }
        const param: DeclParam = { name: "", pattern };
        if (defaultValue) param.defaultValue = defaultValue;
        params.push(param);
      } else if (tok.type === "Identifier" || tok.type === "Keyword") {
        const nameTok = ctx.consume();
        let defaultValue: Expression | undefined;
        if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          defaultValue = parseExpression(ctx);
        }
        const param: DeclParam = { name: nameTok.value };
        if (defaultValue) param.defaultValue = defaultValue;
        if (isRest) (param as DeclParam & { rest?: boolean }).rest = true;
        params.push(param);
      } else {
        throw {
          message: `Expected parameter name, got ${tok.type} "${tok.value}"`,
          line: tok.line,
          column: tok.column,
        } satisfies ParseError;
      }
      skipWhitespace(ctx);
      if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
        if (isRest) {
          throw {
            message: "Rest parameter `...name` must be the final parameter.",
            line: ctx.peek().line,
            column: ctx.peek().column,
          } satisfies ParseError;
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

/**
 * Parse `effect(() => { body }, [deps])` at the statement level.
 * Produces an EffectDeclaration AST node.
 */
function parseEffectStatement(ctx: ParserContext): Statement {
  const start = ctx.consume(); // consume the `$effect` StateIdentifier
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
    // Consume a dotted property path so an effect can depend on a precise
    // sub-path: `effect(() => …, [$user.name])` → trigger "user.name", which
    // fires only when `user.name` (or the whole `user`) changes. Bracket /
    // computed access stops the path (the trigger coarsens to what precedes
    // it), keeping the dependency sound.
    let name = head.value;
    while (ctx.peek().type === "Punctuation" && ctx.peek().value === ".") {
      const prop = ctx.peek(1);
      if (prop.type !== "Identifier" && prop.type !== "Keyword") break;
      ctx.consume(); // "."
      ctx.consume(); // property
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

  // Destructuring forms: `let [a, b, ...rest] = arr` and
  // `let {a, b: alias, c = 1, ...rest} = obj`. Both expand into a single
  // `DestructureStatement` so the evaluator can fan out the bindings
  // when the right-hand side is evaluated once.
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

/**
 * Parse a destructuring declaration: `let [a, b, ...rest] = arr` or
 * `let {x, y: alias, z = 0, ...rest} = obj`. Nested patterns are
 * intentionally not supported — destructure in two steps for those.
 */
function parseDestructureDecl(ctx: ParserContext, start: Token): Statement {
  const pattern = parseDestructuringPattern(ctx);
  ctx.expect("Operator", "=");
  const expression = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "DestructureStatement",
    patternKind: pattern.kind,
    bindings: pattern.bindings,
    expression,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * Parse a destructuring pattern (`[a, b, ...rest]` or
 * `{x, y: alias, z = 0, ...rest}`) WITHOUT the trailing `=` / value, so
 * the same code drives `let`-declarations and function / lambda
 * parameters. Nested patterns are intentionally flat — destructure in
 * two steps for deeper shapes.
 */
function parseDestructuringPattern(ctx: ParserContext): DestructuringPattern {
  const head = ctx.consume(); // `[` or `{`
  const patternKind: "array" | "object" = head.value === "[" ? "array" : "object";
  const bindings: import("./types.js").DestructuringBinding[] = [];

  if (patternKind === "array") {
    skipWhitespace(ctx);
    while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "]")) {
      // `[,, x]` — array holes skip a position. Parsed as an empty
      // binding name so the evaluator advances the index without
      // creating a variable.
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
      // Nested pattern element: `let [[a, b], { c }] = rows`.
      if (!isRest && ctx.peek().type === "Punctuation" && (ctx.peek().value === "[" || ctx.peek().value === "{")) {
        const nested = parseDestructuringPattern(ctx);
        let nestedDefault: Expression | undefined;
        if (ctx.peek().type === "Operator" && ctx.peek().value === "=") {
          ctx.consume();
          nestedDefault = parseExpression(ctx);
        }
        const nestedBinding: import("./types.js").DestructuringBinding = { name: "", pattern: nested };
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
      let defaultValue: Expression | undefined;
      if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
        ctx.consume();
        defaultValue = parseExpression(ctx);
      }
      const binding: import("./types.js").DestructuringBinding = { name: nameTok.value };
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
      let sourceKey: string | undefined;
      let nestedPattern: DestructuringPattern | undefined;
      // `{a: b}` — rename: source key `a`, local binding `b`.
      // `{a: { b }}` / `{a: [b]}` — nested pattern under source key `a`.
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
      let defaultValue: Expression | undefined;
      if (!isRest && ctx.peek().type === "Operator" && ctx.peek().value === "=") {
        ctx.consume();
        defaultValue = parseExpression(ctx);
      }
      const binding: import("./types.js").DestructuringBinding = nestedPattern
        ? { name: "", sourceKey, pattern: nestedPattern }
        : { name: alias };
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

/**
 * Flatten every variable name a destructuring pattern introduces, descending
 * into nested patterns. Shared by the linker (scope collection) and the
 * language service (shadowing checks) so both see the same set of names.
 */
export function collectPatternNames(pattern: DestructuringPattern): string[] {
  const names: string[] = [];
  for (const binding of pattern.bindings) {
    if (binding.pattern) {
      names.push(...collectPatternNames(binding.pattern));
    } else if (binding.name) {
      names.push(binding.name);
    }
  }
  return names;
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
  const close = ctx.expect("Punctuation", "}");
  const block: BlockExpr = {
    kind: "Block",
    body,
    loc: { line: start.line, column: start.column },
  };
  nodeEndLine.set(block, close.line);
  if (body.length === 0) {
    // No statement in this block to attach a leading comment to — the only
    // case a fully empty `{ … }` can still carry text, e.g. a function stub
    // whose whole body is `// TODO: implement`.
    const inner = collectDanglingComments(ctx, start.line, close.line);
    if (inner.length > 0) block.innerComments = inner;
  } else {
    attachComments(ctx, body, start.line, close.line);
  }
  return block;
}

/**
 * Parse the body of an `if` / `else` / `for` / `while` clause. Accepts
 * either a brace-delimited block (`{ … }`) or a single statement
 * (`if (cond) return`, `while (i--) i += 1`, etc.) and always returns
 * a `BlockExpr` so downstream evaluation is uniform.
 *
 * Comment attachment is intentionally NOT wired up for the brace-less
 * single-statement form: unlike `parseBlock`, there is no closing token here
 * to bound "this container's own comments", so a comment sitting between the
 * `if (cond)`/`while (cond)` header and a brace-less body would have no safe
 * boundary to test against and risks being misattributed to a later,
 * unrelated statement by whichever enclosing container's `attachComments`
 * call processes that line range next. Documented, measured gap — see
 * `KNOWN_COMMENT_GAPS` in `tests/formatter-comments.test.ts`; the house style
 * (confirmed against the real `.aktion` corpus) always braces multi-line
 * bodies, so this form is rare in practice.
 */
function parseBlockOrSingleStatement(ctx: ParserContext): BlockExpr {
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    return parseBlock(ctx);
  }
  const head = ctx.peek();
  const stmt = parseStatement(ctx, false);
  const block: BlockExpr = {
    kind: "Block",
    body: stmt ? [stmt] : [],
    loc: { line: head.line, column: head.column },
  };
  nodeEndLine.set(block, stmt ? (nodeEndLine.get(stmt) ?? head.line) : head.line);
  return block;
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
  /** Monotonic cursor into `comments` — see `attachComments`'s doc comment. */
  private commentIndex = 0;
  constructor(
    private readonly tokens: Token[],
    /** Out-of-band `//` / `/* *\/` comments in source order (see `lexer.ts`'s `RawComment`). */
    private readonly comments: RawComment[] = [],
  ) {}

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

  /** Line of the last token actually consumed — used to stamp a statement's own end line. */
  previousConsumedLine(): number {
    const tok = this.tokens[this.index - 1];
    return tok ? tok.line : this.peek().line;
  }

  /** Next not-yet-attached comment, without consuming it. */
  peekComment(): RawComment | undefined {
    return this.comments[this.commentIndex];
  }

  /** Consume and return the next not-yet-attached comment. */
  takeComment(): RawComment {
    const c = this.comments[this.commentIndex];
    this.commentIndex += 1;
    // Non-null: callers only call this after `peekComment()` confirmed one exists.
    return c!;
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

/**
 * `import { A, B as C, $shared } from "./other.aktion"` — named imports only.
 * `from`/`as` are contextual identifiers (not keywords). A `$state` import must
 * keep its `$` across `as`. Resolved + merged by the linker; the streaming
 * runtime ignores `Import`.
 */
function parseImportStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "import");
  ctx.expect("Punctuation", "{");
  const specifiers: ImportSpecifier[] = [];
  // Newlines inside the specifier list are insignificant, exactly as they are
  // inside an object literal. Without these skips a multi-line
  // `import {\n  a,\n  b,\n} from "…"` threw, and because `parse()` records the
  // error and recovers to the next line, the WHOLE import vanished silently —
  // the program still "parsed", just with those bindings missing.
  skipWhitespace(ctx);
  while (!ctx.isEnd() && !(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const importedTok = ctx.peek();
    let imported: string;
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
        column: importedTok.column,
      } satisfies ParseError;
    }

    let local = imported;
    // Optional `as alias` — `as` is a contextual identifier here.
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
          column: aliasTok.column,
        } satisfies ParseError;
      }
      if (aliasIsState !== isState) {
        throw {
          message:
            "A `$state` import must keep its `$` across `as` (e.g. `{ $x as $y }`); " +
            "a non-state import must not gain one.",
          line: aliasTok.line,
          column: aliasTok.column,
        } satisfies ParseError;
      }
    }

    specifiers.push(isState ? { imported, local, isState: true } : { imported, local });
    skipWhitespace(ctx);
    if (ctx.peek().type === "Punctuation" && ctx.peek().value === ",") {
      ctx.consume();
      // Tolerate a trailing comma before the closing brace.
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
      column: fromTok.column,
    } satisfies ParseError;
  }
  ctx.consume();
  const sourceTok = ctx.expect("String");
  skipTerminator(ctx);

  return {
    kind: "Import",
    specifiers,
    source: sourceTok.value,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * `export <declaration | assignment>` — marks the following top-level binding
 * importable from another module. `export { … }` lists / re-exports and
 * `export <destructure>` are intentionally not supported yet (clear errors).
 */
function parseExportStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "export");
  const next = ctx.peek();

  if (next.type === "Punctuation" && next.value === "{") {
    throw {
      message:
        "`export { … }` lists are not supported yet — use inline `export <declaration>` " +
        "(e.g. `export function Foo() {…}`, `export $count = 0`).",
      line: next.line,
      column: next.column,
    } satisfies ParseError;
  }

  let stmt: Statement | null;
  if (next.type === "Keyword" && next.value === "function") {
    stmt = parseFunctionDecl(ctx);
  } else if (
    next.type === "Keyword" && next.value === "async" &&
    ctx.peek(1).type === "Keyword" && ctx.peek(1).value === "function"
  ) {
    ctx.consume(); // async — accepted as a no-op modifier, mirroring parseStatement
    stmt = parseFunctionDecl(ctx);
  } else if (next.type === "Keyword" && (next.value === "let" || next.value === "const" || next.value === "var")) {
    stmt = parseVarDecl(ctx);
    if (stmt && stmt.kind === "DestructureStatement") {
      throw {
        message: "`export` of a destructuring declaration is not supported — export named bindings individually.",
        line: next.line,
        column: next.column,
      } satisfies ParseError;
    }
  } else if (couldStartAssignment(ctx)) {
    stmt = parseAssignment(ctx);
  } else {
    throw {
      message:
        "`export` must be followed by a declaration or assignment " +
        "(`export function …`, `export let x = …`, `export $state = …`).",
      line: next.line,
      column: next.column,
    } satisfies ParseError;
  }

  if (
    stmt &&
    (stmt.kind === "Assignment" ||
      stmt.kind === "ComponentDeclaration" ||
      stmt.kind === "ActionDeclaration" ||
      stmt.kind === "HookDeclaration")
  ) {
    stmt.exported = true;
    return stmt;
  }
  throw {
    message: "`export` must be followed by a declaration or assignment.",
    line: start.line,
    column: start.column,
  } satisfies ParseError;
}

/** `let foo = expr` ALSO accepts compound assignment operators? No — JS only
 * allows `=` after `let/const/var`, so we stick with `=`. (Compound forms
 * apply only to existing bindings.) */

function parseExpression(ctx: ParserContext): Expression {
  return parseTernary(ctx);
}

/**
 * Peek through leading `Newline` tokens without consuming them and return
 * the first significant token. JavaScript treats a line break as a
 * continuation when the next token can only extend the current expression
 * (`.`, `?.`, `?`, `&&`, `||`, `+`, `-`, …). Operator parsers use this to
 * decide whether to swallow the newlines and keep building the expression.
 */
function peekNonNewline(ctx: ParserContext): { token: Token; skipped: number } {
  let i = 0;
  while (true) {
    const t = ctx.peek(i);
    if (t.type === "Newline") { i += 1; continue; }
    return { token: t, skipped: i };
  }
}

/**
 * If the next non-newline token satisfies `predicate`, drop the
 * intervening newlines (committing the continuation) and return true.
 * Otherwise the cursor is left untouched.
 */
function consumeNewlinesIfNext(
  ctx: ParserContext,
  predicate: (t: Token) => boolean,
): boolean {
  const { token, skipped } = peekNonNewline(ctx);
  if (!predicate(token)) return false;
  for (let i = 0; i < skipped; i += 1) ctx.consume();
  return true;
}

/**
 * Position a `Binary`/`Ternary` node at its OPERATOR token.
 *
 * The operands already carry their own `loc`, so pointing the composite node at
 * `?` / `&&` / `+` is what makes it locatable at all — and these are the nodes
 * that branch, which is what coverage and diagnostics need to name. Nesting the
 * left operand means `a && b && c` yields distinct locations per operator.
 */
function operatorLoc(tok: Token): SourceLocation {
  return { line: tok.line, column: tok.column };
}

/**
 * Assignment wrapper used to parse a `${...}` interpolation as a standalone
 * program. Its length is the column offset every node in the sub-tree carries.
 */
const TEMPLATE_SUB_PREFIX = "__rui_tmpl__ = ";

/**
 * Move a sub-parsed interpolation's locations from the synthetic one-line
 * program they were parsed in to where the `${` really sits in the source.
 *
 * `line`/`column` are the lexer's position for the `$` of `${`, so the expression
 * itself starts two columns later. A node on the sub-program's first line has
 * both coordinates shifted (its column is relative to the wrapper prefix); a
 * node on a later line — a multi-line interpolation — only needs the line
 * shifted, since its column is already relative to a real line start.
 */
function rebaseTemplateLocations(root: Expression, line: number, column: number): void {
  const exprStartColumn = column + "${".length;
  walkNode(root, ({ node }) => {
    const loc = (node as { loc?: SourceLocation }).loc;
    if (!loc) return;
    if (loc.line === 1) {
      loc.column = exprStartColumn + (loc.column - (TEMPLATE_SUB_PREFIX.length + 1));
    }
    loc.line = line + (loc.line - 1);
  });
}

function parseTernary(ctx: ParserContext): Expression {
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

function parseLogicalOr(ctx: ParserContext): Expression {
  let left = parseLogicalAnd(ctx);
  while (
    consumeNewlinesIfNext(
      ctx,
      (t) => t.type === "Operator" && (t.value === "||" || t.value === "??"),
    )
  ) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseLogicalAnd(ctx);
    left = { kind: "Binary", operator: tok.value as "||" | "??", left, right, loc: operatorLoc(tok) };
  }
  return left;
}

function parseLogicalAnd(ctx: ParserContext): Expression {
  let left = parseBitwiseOr(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "&&")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseOr(ctx);
    left = { kind: "Binary", operator: "&&", left, right, loc: operatorLoc(tok) };
  }
  return left;
}

/** Bitwise OR (`|`) — lower precedence than `^`, higher than `&&`. */
function parseBitwiseOr(ctx: ParserContext): Expression {
  let left = parseBitwiseXor(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "|")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseXor(ctx);
    left = { kind: "Binary", operator: "|", left, right, loc: operatorLoc(tok) };
  }
  return left;
}

/** Bitwise XOR (`^`). */
function parseBitwiseXor(ctx: ParserContext): Expression {
  let left = parseBitwiseAnd(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "^")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseBitwiseAnd(ctx);
    left = { kind: "Binary", operator: "^", left, right, loc: operatorLoc(tok) };
  }
  return left;
}

/** Bitwise AND (`&`). */
function parseBitwiseAnd(ctx: ParserContext): Expression {
  let left = parseEquality(ctx);
  while (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "&")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseEquality(ctx);
    left = { kind: "Binary", operator: "&", left, right, loc: operatorLoc(tok) };
  }
  return left;
}

function parseEquality(ctx: ParserContext): Expression {
  let left = parseComparison(ctx);
  while (
    consumeNewlinesIfNext(
      ctx,
      (t) =>
        t.type === "Operator" &&
        (t.value === "==" || t.value === "!=" || t.value === "===" || t.value === "!=="),
    )
  ) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseComparison(ctx);
    left = {
      kind: "Binary",
      operator: tok.value as "==" | "!=" | "===" | "!==",
      left,
      right,
      loc: operatorLoc(tok),
    };
  }
  return left;
}

function parseComparison(ctx: ParserContext): Expression {
  let left = parseShift(ctx);
  while (true) {
    if (
      consumeNewlinesIfNext(
        ctx,
        (t) => t.type === "Operator" && (t.value === ">" || t.value === "<" || t.value === ">=" || t.value === "<="),
      )
    ) {
      const tok = ctx.consume();
      skipWhitespace(ctx);
      const right = parseShift(ctx);
      left = {
        kind: "Binary",
        operator: tok.value as ">" | "<" | ">=" | "<=",
        left,
        right,
        loc: operatorLoc(tok),
      };
      continue;
    }
    if (consumeNewlinesIfNext(ctx, (t) => t.type === "Keyword" && (t.value === "instanceof" || t.value === "in"))) {
      const tok = ctx.consume();
      skipWhitespace(ctx);
      const right = parseShift(ctx);
      left = {
        kind: "Binary",
        operator: tok.value as "instanceof" | "in",
        left,
        right,
        loc: operatorLoc(tok),
      };
      continue;
    }
    break;
  }
  return left;
}

/** Bitwise shift operators (`<<`, `>>`, `>>>`) — between relational and additive. */
function parseShift(ctx: ParserContext): Expression {
  let left = parseAdditive(ctx);
  while (
    consumeNewlinesIfNext(
      ctx,
      (t) => t.type === "Operator" && (t.value === "<<" || t.value === ">>" || t.value === ">>>"),
    )
  ) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseAdditive(ctx);
    left = {
      kind: "Binary",
      operator: tok.value as "<<" | ">>" | ">>>",
      left,
      right,
      loc: operatorLoc(tok),
    };
  }
  return left;
}

function parseAdditive(ctx: ParserContext): Expression {
  let left = parseMultiplicative(ctx);
  while (
    consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && (t.value === "+" || t.value === "-"))
  ) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseMultiplicative(ctx);
    left = { kind: "Binary", operator: tok.value as "+" | "-", left, right, loc: operatorLoc(tok) };
  }
  return left;
}

function parseMultiplicative(ctx: ParserContext): Expression {
  let left = parseExponent(ctx);
  while (
    consumeNewlinesIfNext(
      ctx,
      (t) => t.type === "Operator" && (t.value === "*" || t.value === "/" || t.value === "%"),
    )
  ) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseExponent(ctx);
    left = {
      kind: "Binary",
      operator: tok.value as "*" | "/" | "%",
      left,
      right,
      loc: operatorLoc(tok),
    };
  }
  return left;
}

/** Right-associative exponentiation — `2 ** 3 ** 2` parses as `2 ** (3 ** 2)`. */
function parseExponent(ctx: ParserContext): Expression {
  const left = parseUnary(ctx);
  if (consumeNewlinesIfNext(ctx, (t) => t.type === "Operator" && t.value === "**")) {
    const tok = ctx.consume();
    skipWhitespace(ctx);
    const right = parseExponent(ctx);
    return { kind: "Binary", operator: "**", left, right, loc: operatorLoc(tok) };
  }
  return left;
}

function parseUnary(ctx: ParserContext): Expression {
  const tok = ctx.peek();
  if (tok.type === "Operator" && (tok.value === "!" || tok.value === "-" || tok.value === "+" || tok.value === "~")) {
    ctx.consume();
    const argument = parseUnary(ctx);
    return { kind: "Unary", operator: tok.value as "!" | "-" | "+" | "~", argument };
  }
  // `await expr` as an expression. The keyword is accepted so
  // JavaScript-shaped output still parses, but it does NOT suspend: bodies
  // run synchronously (`runActionDeclSync`), and nothing unwraps the thenable.
  // The value is therefore the PROMISE, which is why `if (await p)` is always
  // true. Documented under "await parses, but it never suspends"; authors
  // should chain `.then(...)` or use `$http(...).onDone` instead.
  if (tok.type === "Keyword" && tok.value === "await") {
    ctx.consume();
    const argument = parseUnary(ctx);
    return {
      kind: "BuiltinCall",
      name: "__rui_await__",
      arguments: [argument],
      loc: { line: tok.line, column: tok.column },
    };
  }
  // Prefix increment / decrement: `++x` and `--x`. Reuses the runtime's
  // synthetic assignment helper with an explicit "prefix" flag so the
  // value of `++x` is the NEW value (whereas `x++` keeps JS's postfix
  // semantics of returning the OLD value).
  if (tok.type === "Operator" && (tok.value === "++" || tok.value === "--")) {
    ctx.consume();
    const argument = parseUnary(ctx);
    return {
      kind: "BuiltinCall",
      name: "__rui_prefix__",
      arguments: [
        argument,
        { kind: "Literal", value: tok.value },
      ],
      loc: { line: tok.line, column: tok.column },
    };
  }
  // `typeof expr`, `void expr`, `delete expr` — prefix keyword operators.
  if (tok.type === "Keyword" && (tok.value === "typeof" || tok.value === "void" || tok.value === "delete")) {
    ctx.consume();
    const argument = parseUnary(ctx);
    return {
      kind: "Unary",
      operator: tok.value as "typeof" | "void" | "delete",
      argument,
    };
  }
  // `new Constructor(args)` — produces a New AST node so the evaluator
  // can `Reflect.construct(...)` against host globals (Date, Map, …). JS
  // binds the constructor's own argument list tighter than any trailing
  // `.member` / call, so `new Date(0).getTime()` is `(new Date(0)).getTime()`.
  // We parse the callee as a member-only chain (no call), consume one
  // optional argument list, then resume the postfix loop on the result.
  if (tok.type === "Keyword" && tok.value === "new") {
    ctx.consume();
    let callee = parsePrimary(ctx);
    let args: Expression[] = [];
    // `parsePrimary` parses `Foo(...)` as a `Call` (consuming its args) —
    // those ARE the constructor's arguments. Lift them onto the New node
    // and normalise the callee back to an identifier.
    if (callee.kind === "Call") {
      args = callee.arguments;
      callee = { kind: "Identifier", name: callee.callee, loc: callee.loc };
    } else {
      // `new ns.Thing(...)` / `new Foo` — extend with member-only access
      // (no calls), then take one optional constructor argument list.
      while (true) {
        const t = ctx.peek();
        if (t.type === "Punctuation" && t.value === ".") {
          ctx.consume();
          const propTok = ctx.consume();
          if (propTok.type !== "Identifier" && propTok.type !== "Keyword") {
            throw {
              message: `Expected Identifier but got ${propTok.type} "${propTok.value}"`,
              line: propTok.line,
              column: propTok.column,
            } satisfies ParseError;
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
    const newNode: Expression = {
      kind: "New",
      callee,
      arguments: args,
      loc: { line: tok.line, column: tok.column },
    };
    // Resume the postfix loop so `new Date(0).getTime()` chains the
    // trailing member / call onto the constructed value.
    return parsePostfixFrom(ctx, newNode);
  }
  return parsePostfixWithIncDec(ctx);
}

/**
 * Wrap `parsePostfix` with trailing `++` / `--` so postfix increment /
 * decrement can appear anywhere a normal expression can — `let x = i++`,
 * `total + i--`, etc. JS's postfix returns the OLD value (handled by
 * the runtime's `__rui_postfix__` helper).
 */
function parsePostfixWithIncDec(ctx: ParserContext): Expression {
  const expr = parsePostfix(ctx);
  const tok = ctx.peek();
  if (tok.type === "Operator" && (tok.value === "++" || tok.value === "--")) {
    ctx.consume();
    return {
      kind: "BuiltinCall",
      name: "__rui_postfix__",
      arguments: [
        expr,
        { kind: "Literal", value: tok.value },
      ],
      loc: { line: tok.line, column: tok.column },
    };
  }
  return expr;
}

function parsePostfix(ctx: ParserContext): Expression {
  return parsePostfixFrom(ctx, parsePrimary(ctx));
}

/**
 * Run the member / call / index postfix loop starting from an already-
 * parsed base expression. Lets `new Date(0).getTime()` continue chaining
 * onto the `New` node (JS binds `new X(args)` tighter than the trailing
 * `.member` / call).
 */
function parsePostfixFrom(ctx: ParserContext, base: Expression): Expression {
  let expr = base;
  while (true) {
    // Member / optional-member access may continue on the next line:
    //   fetch(url)
    //     .then(…)
    //     ?.catch(…)
    // We only commit the line break when the next significant token is
    // a continuation. `[ ... ]` and `( ... )` postfixes are not skipped
    // across newlines — that direction is a well-known ASI footgun and
    // very rare in practice.
    consumeNewlinesIfNext(
      ctx,
      (t) => (t.type === "Punctuation" && t.value === ".") ||
             (t.type === "Operator" && t.value === "?."),
    );
    const tok = ctx.peek();
    if (tok.type === "Punctuation" && tok.value === ".") {
      ctx.consume();
      const propTok = ctx.consume();
      if (propTok.type !== "Identifier" && propTok.type !== "Keyword" && propTok.type !== "StateIdentifier") {
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
      } else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        // `expr?.()` — optional call on an arbitrary expression.
        ctx.consume();
        const args = parseCallArgs(ctx);
        ctx.expect("Punctuation", ")");
        expr = {
          kind: "Invoke",
          callee: expr,
          arguments: args,
          optional: true,
          loc: { line: tok.line, column: tok.column },
        };
      } else {
        const propTok = ctx.consume();
        if (propTok.type !== "Identifier" && propTok.type !== "Keyword" && propTok.type !== "StateIdentifier") {
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
    // Call postfix on an arbitrary expression — `(fn)(args)`, IIFE
    // `(() => …)()`, `arr[i](args)`, etc. Bare identifier callees stay
    // as `Call` nodes (handled in `parsePrimary`) so component / action
    // / library lookups still resolve by name.
    if (tok.type === "Punctuation" && tok.value === "(") {
      ctx.consume();
      const args = parseCallArgs(ctx);
      ctx.expect("Punctuation", ")");
      expr = {
        kind: "Invoke",
        callee: expr,
        arguments: args,
        loc: { line: tok.line, column: tok.column },
      };
      continue;
    }
    break;
  }
  return expr;
}

function parsePrimary(ctx: ParserContext): Expression {
  const tok = ctx.peek();

  // `if` / `for` / `switch` / `while` / `try` are STATEMENTS in JS —
  // they do not produce a value. Reject any attempt to use them in
  // expression position (e.g. `name = for (…) { … }`) with a clear
  // migration hint instead of silently parsing the legacy form.
  if (
    tok.type === "Keyword" &&
    (tok.value === "if" || tok.value === "for" || tok.value === "switch" ||
      tok.value === "while" || tok.value === "try")
  ) {
    const hint = tok.value === "if"
      ? "Use the ternary operator (`cond ? a : b`) when you need a value."
      : tok.value === "for"
      ? "Use `arr.map(x => …)` (or `.filter`, `.reduce`, …) to collect bodies into an array."
      : tok.value === "switch"
      ? "Use chained ternaries, an object lookup, or wrap the switch inside a `function`."
      : `Use the ${tok.value} statement inside a function / effect body.`;
    const err: ParseError & { __definitive?: boolean } = {
      message:
        `\`${tok.value}\` is a statement, not an expression. ${hint}`,
      line: tok.line,
      column: tok.column,
    };
    err.__definitive = true;
    throw err;
  }

  if (tok.type === "Keyword") {
    // Anonymous function expression: `function (params) { body }` or
    // `function name(params) { body }`. JS allows these as values
    // (e.g. `arr.map(function (e) { return Button(e) })`) so we parse
    // them into a `Lambda` node sharing the same params/body shape as
    // an arrow function — `name`, if present, is currently discarded
    // (function expressions are rarely referenced by their own name in
    // this subset).
    if (tok.value === "function") {
      const lookahead = ctx.peek(1);
      const lookahead2 = ctx.peek(2);
      const looksLikeFunctionExpr =
        (lookahead.type === "Punctuation" && lookahead.value === "(") ||
        (lookahead.type === "Identifier" && lookahead2.type === "Punctuation" && lookahead2.value === "(");
      if (looksLikeFunctionExpr) {
        const start = tok;
        ctx.consume(); // function
        if (ctx.peek().type === "Identifier") ctx.consume(); // optional name
        const params = parseFunctionParams(ctx);
        const body = parseBlock(ctx);
        return {
          kind: "Lambda",
          params,
          body: body as never,
          loc: { line: start.line, column: start.column },
        };
      }
    }
    // Keywords that are also valid identifier names in expressions.
    if (
      tok.value === "function" ||
      tok.value === "let" || tok.value === "const" || tok.value === "var" ||
      tok.value === "of" || tok.value === "in" || tok.value === "case" ||
      tok.value === "break" || tok.value === "continue" || tok.value === "default"
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
    return { kind: "Literal", value: numericLiteralValue(tok.value) };
  }
  if (tok.type === "String") {
    ctx.consume();
    return { kind: "Literal", value: tok.value };
  }
  if (tok.type === "Regex") {
    // Desugar `/pattern/flags` to `new RegExp("pattern", "flags")` so it reuses
    // the runtime's existing `RegExp` global — no evaluator change needed.
    ctx.consume();
    const args: Expression[] = [{ kind: "Literal", value: tok.value }];
    if (tok.flags) args.push({ kind: "Literal", value: tok.flags });
    return {
      kind: "New",
      callee: { kind: "Identifier", name: "RegExp" },
      arguments: args,
      loc: { line: tok.line, column: tok.column },
    };
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
      const sub = parse(`${TEMPLATE_SUB_PREFIX}${part.source}`);
      const firstStmt = sub.statements[0];
      if (firstStmt && firstStmt.kind === "Assignment") {
        // The interpolation was parsed as its own one-line program, so every
        // node inside it claims line 1 — which would put `${expr}` hits and
        // diagnostics on the first line of whatever file it came from. The
        // lexer recorded where the `${` actually is; rebase onto that.
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
    // `$effect(...)` in expression position — produce an EffectDeclaration so
    // its dependency array keeps trigger semantics (rare; effects are usually
    // statements). Other `$name(...)` calls stay StateRef Invokes.
    if (tok.value === "effect" && ctx.peek(1).type === "Punctuation" && ctx.peek(1).value === "(") {
      ctx.consume();
      return parseEffectCallAsExpr(ctx, tok);
    }
    ctx.consume();
    return { kind: "StateRef", name: tok.value };
  }
  if (tok.type === "Identifier") {
    ctx.consume();
    // Unparenthesised single-param arrow: `x => expr` or `x => { … }`.
    if (ctx.peek().type === "Operator" && ctx.peek().value === "=>") {
      ctx.consume();
      const body = parseLambdaBody(ctx);
      return {
        kind: "Lambda",
        params: [{ name: tok.value }],
        body: body as never,
        loc: { line: tok.line, column: tok.column },
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
 * Parse `if (condition) { … } else if (…) { … } else { … }` as a
 * STATEMENT. The condition MUST be wrapped in parentheses (JS syntax).
 * `if` does not produce a value — use the ternary operator
 * (`cond ? a : b`) when you need a value.
 */
function parseIfStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "if");
  ctx.expect("Punctuation", "(");
  const test = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  // Either a block `{ … }` or a single statement — `if (!$email) return`.
  const consequent = parseBlockOrSingleStatement(ctx);
  let alternate: Statement | BlockExpr | undefined;
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
  const ifStmt: Statement = {
    kind: "IfStatement",
    test,
    consequent,
    alternate: alternate as never,
    loc: { line: start.line, column: start.column },
  };
  // Precise end line: whichever of consequent/alternate was parsed LAST.
  // Must NOT fall back to "last token consumed before returning" (the
  // generic `parseStatement` wrapper's default) — the `skipWhitespace(ctx)`
  // lookahead above, used to check for an `else` that may not be there,
  // greedily consumes any blank lines between this if-statement's own
  // content and whatever follows, which would otherwise inflate this
  // statement's recorded end line past its real closing `}` and break both
  // trailing-comment matching and the next statement's blank-line-before
  // computation. An `else if` alternate was already stamped precisely by its
  // OWN recursive `parseIfStatement` return, so `nodeEndLine.get(alternate)`
  // resolves it either way.
  const last: BlockExpr | Statement = alternate ?? consequent;
  nodeEndLine.set(ifStmt, nodeEndLine.get(last) ?? last.loc?.line ?? start.line);
  return ifStmt;
}

/**
 * Parse `switch (value) { case X: …; break; default: … }` as a
 * STATEMENT. `switch` does not produce a value — use chained ternaries
 * or an object lookup when you need one.
 */
function parseSwitchStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "switch");
  ctx.expect("Punctuation", "(");
  const discriminant = parseExpression(ctx);
  ctx.expect("Punctuation", ")");
  const openBrace = ctx.expect("Punctuation", "{");
  const cases: SwitchCase[] = [];
  skipWhitespace(ctx);
  // Tracks the last line touched by real content (or an already-attached
  // comment) across case boundaries, for each case HEADER's own
  // `blankLineBefore` — mirrors `attachComments`'s `lastTouchedLine`, kept
  // separately here because a switch's cases are a list of `SwitchCase`
  // records, not `Statement`s, so the generic helper doesn't cover them.
  let lastLine = openBrace.line;
  // Lower bound for "does this comment belong to the NEXT case header" — see
  // `attachComments`'s `inWindow` doc comment for why a lower bound (not just
  // an upper one) is required: without it, the FIRST case would wrongly
  // claim a comment sitting above the `switch` statement itself.
  let caseWindowStart = openBrace.line;
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const caseHead = ctx.peek();
    let test: Expression | null = null;
    if (caseHead.type === "Keyword" && caseHead.value === "case") {
      ctx.consume();
      test = parseExpression(ctx);
    } else if (caseHead.type === "Keyword" && caseHead.value === "default") {
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
      const stmt = parseStatement(ctx, false);
      if (stmt) body.push(stmt);
      skipWhitespace(ctx);
    }
    const caseEndLineExclusive = ctx.peek().line; // line of whichever token stopped the loop above

    // Comment(s) on the `case`/`default` keyword's OWN line or above it,
    // before any of this case's body statements — attach to the SwitchCase
    // record itself (a note on the branch), not to the first body statement.
    const caseLeading: AttachedComment[] = [];
    while (true) {
      const c = ctx.peekComment();
      if (!c || c.line < caseWindowStart || c.line >= caseHead.line) break;
      ctx.takeComment();
      caseLeading.push({ ...c, blankLineBefore: c.line > lastLine + 1 });
      lastLine = c.endLine;
    }
    const caseObj: SwitchCase = { test, body };
    if (caseLeading.length > 0) caseObj.leadingComments = caseLeading;

    attachComments(ctx, body, caseHead.line, caseEndLineExclusive);
    lastLine = body.length > 0
      ? (nodeEndLine.get(body[body.length - 1]!) ?? caseHead.line)
      : caseHead.line;
    caseWindowStart = caseEndLineExclusive;

    cases.push(caseObj);
    skipWhitespace(ctx);
  }
  ctx.expect("Punctuation", "}");
  skipTerminator(ctx);
  return {
    kind: "SwitchStatement",
    discriminant,
    cases,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * Parse `for` STATEMENT. Two shapes are recognised — `for (let x of arr) { … }`
 * (iteration; supports array / object destructuring) and the classic
 * `for (init; cond; update) { … }`. Neither shape produces a value.
 * To collect the bodies into an array use `arr.map(x => …)`.
 */
function parseForStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "for");
  ctx.expect("Punctuation", "(");
  skipWhitespace(ctx);

  // Decide between for-of, for-in, and classic-for. We peek ahead: a `;`
  // before the matching `)` means classic; an `of`/`in` keyword
  // determines for-of vs. for-in.
  const headSnapshot = ctx.snapshot();
  let kind: "for-of" | "for-in" | "classic" = "for-of";
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

  // for-of / for-in: optional let/const/var, then binding,
  // then `of` / `in`, then iterable.
  if (
    ctx.peek().type === "Keyword" &&
    (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")
  ) {
    ctx.consume();
  }
  skipWhitespace(ctx);

  let item = "__row";
  let pattern: DestructuringPattern | undefined;

  // `for (const [a, b] of pairs)` / `for (const { id, name } of rows)` —
  // a full destructuring pattern (array by index, object by key), matching
  // JavaScript. Reuses the same pattern parser as `let`-destructuring so
  // defaults, renames, holes, and rest all behave identically.
  if (
    ctx.peek().type === "Punctuation" &&
    (ctx.peek().value === "[" || ctx.peek().value === "{")
  ) {
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
      loc: { line: start.line, column: start.column },
    };
  }
  return {
    kind: "ForOfStatement",
    item,
    pattern,
    iterable,
    body,
    loc: { line: start.line, column: start.column },
  };
}

function parseForClassic(ctx: ParserContext, start: Token): Statement {
  // init — may be a `let/const/var` decl, an expression, or empty.
  let init: AssignmentStatement | ExpressionStatement | undefined;
  if (!(ctx.peek().type === "Semicolon")) {
    if (
      ctx.peek().type === "Keyword" &&
      (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")
    ) {
      // `parseVarDecl` itself consumes the trailing `;` / newline, so we
      // do not need to expect another semicolon afterwards.
      const decl = parseVarDecl(ctx);
      if (decl.kind === "Assignment") init = decl;
      skipWhitespace(ctx);
    } else {
      const exprStart = ctx.peek();
      const expression = parseExpression(ctx);
      init = {
        kind: "ExpressionStatement",
        expression,
        loc: { line: exprStart.line, column: exprStart.column },
      };
      ctx.expect("Semicolon");
      skipWhitespace(ctx);
    }
  } else {
    ctx.expect("Semicolon");
    skipWhitespace(ctx);
  }

  let test: Expression | undefined;
  if (!(ctx.peek().type === "Semicolon")) {
    test = parseExpression(ctx);
  }
  ctx.expect("Semicolon");
  skipWhitespace(ctx);

  let update: Expression | undefined;
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
    loc: { line: start.line, column: start.column },
  };
}

/** Parse `while (cond) { body }`. */
function parseWhileStatement(ctx: ParserContext): Statement {
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
    loc: { line: start.line, column: start.column },
  };
}

function parseDoWhileStatement(ctx: ParserContext): Statement {
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
    loc: { line: start.line, column: start.column },
  };
}

function parseBreakStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "break");
  skipTerminator(ctx);
  return { kind: "BreakStatement", loc: { line: start.line, column: start.column } };
}

function parseContinueStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "continue");
  skipTerminator(ctx);
  return { kind: "ContinueStatement", loc: { line: start.line, column: start.column } };
}

function parseThrowStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "throw");
  const argument = parseExpression(ctx);
  skipTerminator(ctx);
  return {
    kind: "ThrowStatement",
    argument,
    loc: { line: start.line, column: start.column },
  };
}

function parseTryStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "try");
  const block = parseBlock(ctx);
  let catchParam: string | undefined;
  let catchBlock: BlockExpr | undefined;
  let finallyBlock: BlockExpr | undefined;
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
  const tryStmt: Statement = {
    kind: "TryStatement",
    block,
    catchParam,
    catchBlock,
    finallyBlock,
    loc: { line: start.line, column: start.column },
  };
  // Precise end line, for the same reason as `parseIfStatement`: the
  // `skipWhitespace(ctx)` lookaheads above (checking for an optional
  // `catch`/`finally` that may not be there) can greedily consume blank
  // lines past this statement's real closing `}`.
  const last = finallyBlock ?? catchBlock ?? block;
  nodeEndLine.set(tryStmt, nodeEndLine.get(last) ?? last.loc?.line ?? start.line);
  return tryStmt;
}

function tryParseLambdaFromParenList(ctx: ParserContext): Expression | null {
  const start = ctx.peek();
  if (start.type !== "Punctuation" || start.value !== "(") return null;
  ctx.consume();
  const params: LambdaParam[] = [];
  skipWhitespace(ctx);
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    while (true) {
      skipWhitespace(ctx);
      // Rest parameter: `(...args) => …`. Must be the final parameter
      // — `parseFunctionParams` enforces the same rule.
      let isRest = false;
      if (ctx.peek().type === "Operator" && ctx.peek().value === "...") {
        ctx.consume();
        isRest = true;
      }
      const tok = ctx.peek();
      // Destructuring pattern param: `({ a, b }) => …` / `([a, b]) => …`.
      if (!isRest && tok.type === "Punctuation" && (tok.value === "{" || tok.value === "[")) {
        let pattern: DestructuringPattern;
        try {
          pattern = parseDestructuringPattern(ctx);
        } catch {
          return null;
        }
        const param: LambdaParam = { name: "", pattern };
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
      if (tok.type !== "Identifier") return null;
      ctx.consume();
      const param: LambdaParam = { name: tok.value };
      if (isRest) param.rest = true;
      // Default values use `=` in JS arrow functions.
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
    body: body as never,
    loc: { line: start.line, column: start.column },
  };
}

/** Parse the body of an arrow function — either `{ stmts }` or a bare
 * expression. In JavaScript the body may legally appear on the line
 * after `=>` (`x =>\n  expr`), so we tolerate intervening newlines. */
function parseLambdaBody(ctx: ParserContext): Expression {
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    return parseBlock(ctx);
  }
  return parseAssignmentLikeExpression(ctx);
}

function parseAssignmentLikeExpression(ctx: ParserContext): Expression {
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
    let computedKey: Expression | undefined;
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
        column: keyTok.column,
      } satisfies ParseError;
    }
    const after = ctx.peek();
    let value: Expression;
    if (
      !computedKey &&
      keyTok.type === "Identifier" &&
      after.type === "Punctuation" &&
      (after.value === "," || after.value === "}")
    ) {
      value = { kind: "Identifier", name: key, loc: { line: keyTok.line, column: keyTok.column } };
    } else {
      ctx.expect("Punctuation", ":");
      value = parseExpression(ctx);
    }
    const prop: ObjectProperty = { key, value };
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

/** Skip newlines and semicolons. */
function skipWhitespace(ctx: ParserContext): void {
  while (ctx.match("Newline") || ctx.match("Semicolon")) {/* skip */}
}

/**
 * Distribute not-yet-attached comments across `statements` — a COMPLETE
 * statement list belonging to one lexical container (the top-level program,
 * one `{ … }` block, or one `switch` case's body). Each not-yet-consumed
 * comment whose line falls before `containerEndLineExclusive` becomes either:
 *
 *   - a `trailingComments` entry on the PRECEDING statement, when its line
 *     equals that statement's own end line (`nodeEndLine`) — `foo() // note`;
 *   - a `leadingComments` entry on the FOLLOWING statement otherwise, with
 *     `blankLineBefore` recording whether a full blank source line separated
 *     it from whatever came directly before it (the previous statement's end
 *     line, or the previous comment in the same leading group) — so a
 *     deliberately blank-line-separated header comment doesn't collapse
 *     against the code above it.
 *
 * Comments are consumed from `ctx`'s single shared, monotonically-advancing
 * cursor (`peekComment`/`takeComment`). That is safe ONLY because parsing is
 * strictly left-to-right and every container calls this exactly once,
 * immediately after its own statement list is fully built — a nested
 * container (e.g. an `if`'s consequent block) always finishes consuming "its"
 * comments before the enclosing container resumes and makes its own call.
 *
 * A comment with no following statement to attach to — the last thing in a
 * non-empty container, on its own line, not sharing the previous statement's
 * end line — is a documented, measured gap (see `KNOWN_COMMENT_GAPS` in
 * `tests/formatter-comments.test.ts`). It is still consumed here (never left
 * for an unrelated LATER container to misattribute it to one of ITS
 * statements) but its text is dropped.
 */
function attachComments(
  ctx: ParserContext,
  statements: ReadonlyArray<Statement>,
  containerStartLine: number,
  containerEndLineExclusive: number,
): void {
  // Running "last line touched by real content or a comment already
  // attached", used purely to decide each leading comment's own
  // `blankLineBefore` — distinct from `prevStmtEndLine`, which stays pinned
  // to the previous statement's OWN end line for the trailing-comment test
  // below (so a leading comment on the line right after a trailing comment
  // is correctly judged against the trailing comment's line, not the
  // statement's).
  let lastTouchedLine = containerStartLine;
  let prevStmtEndLine: number | null = null;

  // A comment strictly BEFORE `containerStartLine` does not belong to this
  // container at all — it belongs to an ANCESTOR container that has not run
  // its own `attachComments` call yet. That happens for the outermost
  // (`Program`-level) container specifically: `parse()` only calls it once,
  // after every nested block has already been fully parsed — and every
  // nested block already ran ITS OWN `attachComments` call inline,
  // chronologically EARLIER. Without this lower-bound guard, an inner block
  // would greedily claim a header comment that sits many lines above it —
  // before the block, its enclosing statement, and possibly several
  // unrelated SIBLING statements — simply because nothing had consumed it
  // yet. Every loop below stops (without consuming) the moment the next
  // comment falls outside THIS container's own window, on either side,
  // leaving it for whichever container's window actually contains it.
  const inWindow = (c: RawComment): boolean =>
    c.line >= containerStartLine && c.line < containerEndLineExclusive;

  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    const stmtStartLine = stmt.loc?.line ?? containerEndLineExclusive;

    if (prevStmtEndLine !== null) {
      const trailing: AttachedComment[] = [];
      while (true) {
        const c = ctx.peekComment();
        if (!c || !inWindow(c) || c.line !== prevStmtEndLine) break;
        ctx.takeComment();
        trailing.push({ ...c });
        lastTouchedLine = c.endLine;
      }
      if (trailing.length > 0) statements[i - 1]!.trailingComments = trailing;
    }

    const leading: AttachedComment[] = [];
    while (true) {
      const c = ctx.peekComment();
      if (!c || !inWindow(c) || c.line >= stmtStartLine) break;
      ctx.takeComment();
      leading.push({ ...c, blankLineBefore: c.line > lastTouchedLine + 1 });
      lastTouchedLine = c.endLine;
    }
    if (leading.length > 0) stmt.leadingComments = leading;

    prevStmtEndLine = nodeEndLine.get(stmt) ?? stmtStartLine;
    if (prevStmtEndLine > lastTouchedLine) lastTouchedLine = prevStmtEndLine;
  }

  if (prevStmtEndLine !== null) {
    const trailing: AttachedComment[] = [];
    while (true) {
      const c = ctx.peekComment();
      if (!c || !inWindow(c) || c.line !== prevStmtEndLine) break;
      ctx.takeComment();
      trailing.push({ ...c });
    }
    if (trailing.length > 0) statements[statements.length - 1]!.trailingComments = trailing;
  }

  // Anything left inside this container's own window has no statement to
  // attach to — drop it (documented gap above), but still consume it so an
  // unrelated later container never claims it.
  while (true) {
    const c = ctx.peekComment();
    if (!c || !inWindow(c)) break;
    ctx.takeComment();
  }
}

/**
 * Collect comments inside a fully empty `{ … }` block — the only case a
 * block can carry comment text with zero statements to attach it to (e.g. a
 * function stub whose body is only `// TODO: implement`). Stored on the
 * `BlockExpr` itself as `innerComments`.
 */
function collectDanglingComments(
  ctx: ParserContext,
  containerStartLine: number,
  containerEndLineExclusive: number,
): AttachedComment[] {
  let lastLine = containerStartLine;
  const out: AttachedComment[] = [];
  while (true) {
    const c = ctx.peekComment();
    // Lower-bound guard: see `attachComments`'s `inWindow` doc comment — a
    // comment before this container's own start line belongs to an
    // ancestor that has not run its own attachment pass yet.
    if (!c || c.line < containerStartLine || c.line >= containerEndLineExclusive) break;
    ctx.takeComment();
    out.push({ ...c, blankLineBefore: c.line > lastLine + 1 });
    lastLine = c.endLine;
  }
  return out;
}

/** Skip an optional statement terminator (newline, semicolon, or nothing before `}`/EOF). */
function skipTerminator(ctx: ParserContext): void {
  if (!ctx.isEnd()) {
    ctx.match("Newline") || ctx.match("Semicolon");
  }
}

/**
 * Convert a `Number` token's raw text into a JS number. Handles every JS
 * numeric-literal form the lexer can emit: decimals, scientific notation
 * (`1e6`, `1.5e-3`), hex / binary / octal radix literals (`0xFF`, `0b1010`,
 * `0o17`), and `_` digit separators (`1_000_000`). The sign is applied
 * separately so signed radix literals (`-0xFF`) round-trip — `Number()`
 * alone rejects those.
 */
function numericLiteralValue(raw: string): number {
  let s = raw.replace(/_/g, "");
  let sign = 1;
  if (s.startsWith("-")) { sign = -1; s = s.slice(1); }
  else if (s.startsWith("+")) { s = s.slice(1); }
  return sign * Number(s);
}
