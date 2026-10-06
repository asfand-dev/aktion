/**
 * Parser for Aktion (strict JavaScript subset).
 *
 * The grammar mirrors the JS spec:
 *
 *   program     := (statement (NEWLINE | ";"))*   (a statement that ends in a
 *                                                  `}` block needs no separator)
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
 *
 * Newlines: a statement ends at a newline (or `;`), except where JavaScript
 * could never end one — inside `( … )`, `[ … ]`, an object literal or a
 * destructuring pattern, a newline is whitespace (`ParserContext.withNewlines`),
 * and a `{ … }` statement block nested in them is statement level again. A line
 * break right after `=` or a compound assignment operator continues the
 * statement (`skipNewlinesBeforeOperand`), and a binary operator, `.`, `?.` or
 * `?` at the start of the next line continues the expression
 * (`consumeNewlinesIfNext`). `ParseOptions.softNewlines` marks further newlines
 * as whitespace (line breaks left inside erased TypeScript types).
 */

import { tokenize, type RawComment, type Token } from "./lexer.js";
import { moduleLocalBaseName } from "./module-symbols.js";
import { recordEffectCallShape, type EffectCallShape } from "./effect-shape.js";
import { walkNode } from "./walk.js";
import type {
  Program,
  Statement,
  AssignmentStatement,
  DeclarationKeyword,
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

/** Options for {@link parse}. */
export interface ParseOptions {
  /**
   * `source` is a prefix of a response that is still being generated, so a
   * string or template literal left open at the very end is not yet an error.
   * See {@link TokenizeOptions.streaming}.
   */
  streaming?: boolean;
  /**
   * Offsets of `\n` characters in `source` that do not end a line for the
   * grammar: no statement ends there, but positions after them stay exact.
   * See {@link TokenizeOptions.softNewlines}. The TypeScript frontend passes
   * the line breaks left inside erased multi-line type annotations, so
   * `const x = foo<⏎ Bar⏎>(1)` (erased to `foo` + blank lines + `(1)`) stays
   * one call instead of becoming two statements.
   */
  softNewlines?: ReadonlySet<number>;
  /**
   * Read a `{` at the start of a statement that is not an object literal as a
   * statement block — an `ExpressionStatement` whose expression is a `Block` —
   * instead of failing inside the object-literal grammar. For the
   * `.aktion.js` / `.aktion.ts` frontends, which reject block statements
   * (E113) at the `{` with one diagnostic; `.aktion` keeps reading every
   * statement-position `{` as an object literal.
   */
  statementBlocks?: boolean;
  /**
   * Parse `this`, `super` and `debugger` as ordinary identifiers instead of
   * reporting them. `.aktion` has none of them, so by default each is a parse
   * error at the word. The `.aktion.js` / `.aktion.ts` frontends set this
   * because their checker reports a read of any of them as E103. A module with
   * any parse error gets only the parse errors (the semantic checks need a
   * complete tree), so a parse error would also hide every other diagnostic in
   * that module. Declaring one of them as a name (`let this`) is then accepted
   * by the parser, as `let this` was before this option existed.
   */
  allowUnsupportedWords?: boolean;
}

export function parse(source: string, options: ParseOptions = {}): Program {
  const comments: RawComment[] = [];
  const tokens = tokenize(source, comments, {
    streaming: options.streaming,
    softNewlines: options.softNewlines,
  });
  const openLiteral = tokens[tokens.length - 2]?.open === true;
  const ctx = new ParserContext(tokens, comments, options.softNewlines, options.statementBlocks === true, options.allowUnsupportedWords === true);
  const statements: Statement[] = [];
  const errors: ParseError[] = [];

  while (!ctx.isEnd()) {
    if (ctx.match("Newline") || ctx.match("Semicolon")) continue;

    try {
      const stmt = parseStatement(ctx, true);
      if (stmt) statements.push(stmt);
      // `let a = 1, b = 2` is one statement in the source and two in the AST.
      statements.push(...ctx.takePending());
    } catch (err) {
      ctx.takePending();
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

  return openLiteral ? { statements, errors, openLiteral } : { statements, errors };
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
 * Statements whose grammar ends in a `}` block, plus `do … while (c)`, which
 * JS's automatic semicolon insertion also lets the next statement follow. Like
 * JS, Aktion lets the next statement start right after them on the same line
 * (`function a() {} function b() {}`); every other statement must be followed
 * by a newline, a `;`, a closing `}` or the end of the input.
 */
const BLOCK_TERMINATED_STATEMENTS: ReadonlySet<Statement["kind"]> = new Set<Statement["kind"]>([
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
  "TryStatement",
]);

/**
 * TypeScript-only declaration keywords. They are ordinary identifiers to the
 * lexer, so `interface A {}` reads as the expression `interface` followed by
 * the unrelated statement `A {}`.
 */
const TYPESCRIPT_DECLARATION_WORDS: ReadonlySet<string> = new Set([
  "type",
  "interface",
  "enum",
  "namespace",
  "declare",
  "abstract",
]);

/**
 * Require a statement boundary after a statement that did not end in a block.
 *
 * Terminators are optional, so without this check input that is not Aktion
 * (`class A {}`, `` tag`x` ``, `x as T`, `1n`, `a$b`) parses as several
 * unrelated statements and no error is reported. The boundary is the newline
 * or `;` the statement consumed, or the newline / `;` / `}` / end of input
 * that follows it. As in JS, a block comment that spans lines counts as a
 * newline.
 */
function requireStatementBoundary(ctx: ParserContext, startIndex: number): void {
  const prev = ctx.tokenAt(ctx.snapshot() - 1);
  if (prev && (prev.type === "Newline" || prev.type === "Semicolon")) return;
  const next = ctx.peek();
  if (next.type === "EOF" || next.type === "Newline" || next.type === "Semicolon") return;
  if (next.type === "Punctuation" && next.value === "}") return;
  if (prev && ctx.hasLineBreakCommentBetween(prev, next)) return;
  throw statementBoundaryError(ctx.tokenAt(startIndex), prev, next);
}

function statementBoundaryError(head: Token | undefined, prev: Token | undefined, next: Token): ParseError {
  const at = (tok: Token, message: string): ParseError => ({ message, line: tok.line, column: tok.column });
  if (next.type === "Error") return at(next, unexpected(next, ""));
  if (!prev) return at(next, `Expected end of statement but found ${describeToken(next)}.`);

  if (prev.type === "Identifier" && prev.value === "class") {
    return at(prev,
      "`class` is not supported in Aktion — there are no classes. " +
      "Use plain objects for data and functions for behaviour.");
  }
  if (prev.type === "Identifier" && prev.value === "yield") {
    return at(prev, "`yield` is not supported in Aktion — there are no generators.");
  }
  if (head === prev && prev.type === "Identifier" && next.type === "Punctuation" && next.value === ":") {
    return at(prev,
      `Labels (\`${prev.value}:\`) are not supported in Aktion — use a flag variable, ` +
      "or move the loop into a function and `return` from it.");
  }
  if (
    head === prev && prev.type === "Keyword" && (prev.value === "break" || prev.value === "continue") &&
    next.type === "Identifier"
  ) {
    return at(next,
      `\`${prev.value} ${next.value}\` is not supported in Aktion — there are no labels, so \`${prev.value}\` ` +
      "always applies to the innermost loop. Use a flag variable, or move the loop into a function and `return` from it.");
  }
  if (next.type === "Operator" && isAssignmentOperator(next.value)) {
    return at(next, "Chained assignment (`a = b = 1`) is not supported in Aktion — assign each name in its own statement.");
  }
  if (
    head === prev && prev.type === "Identifier" && next.type === "Identifier" &&
    TYPESCRIPT_DECLARATION_WORDS.has(prev.value)
  ) {
    return at(prev,
      `TypeScript \`${prev.value}\` declarations are not supported in Aktion — it has no static types, so remove it.`);
  }
  if (next.type === "Identifier" && (next.value === "as" || next.value === "satisfies")) {
    return at(next,
      `\`${next.value}\` type assertions are not supported in Aktion — it has no static types, so remove the cast.`);
  }
  const isTemplate = next.type === "TemplateString" || (next.type === "String" && next.template === true);
  if (
    isTemplate &&
    (prev.type === "Identifier" || prev.type === "StateIdentifier" ||
      (prev.type === "Punctuation" && (prev.value === ")" || prev.value === "]")))
  ) {
    return at(next,
      "Tagged template literals are not supported in Aktion — " +
      "call the function with the string instead: `tag(`…`)`.");
  }
  if (prev.type === "Number" && next.type === "Identifier" && next.value === "n" && adjacent(prev, next)) {
    return at(prev, `BigInt literals (\`${prev.value}n\`) are not supported in Aktion — use a regular number.`);
  }
  if (prev.type === "Identifier" && next.type === "StateIdentifier" && adjacent(prev, next)) {
    return at(next,
      `\`$\` can only start a name (a state atom such as \`$count\`), so \`${prev.value}$${next.value}\` ` +
      "is not a valid name.");
  }
  return at(next,
    `Expected end of statement after ${describeToken(prev)}, but found ${describeToken(next)}. ` +
    "Put each statement on its own line or separate them with `;`.");
}

/** True when `b` starts exactly where the single-line token `a` ends (no whitespace between). */
function adjacent(a: Token, b: Token): boolean {
  return a.line === b.line && b.column === a.column + a.value.length;
}

/**
 * Message for a token the grammar did not expect: the lexer's own diagnostic
 * for an `Error` token (`Unexpected character '#' …`), `fallback` otherwise.
 */
function unexpected(tok: Token, fallback: string): string {
  return tok.type === "Error" ? (tok.message ?? `Unexpected character '${tok.value}'.`) : fallback;
}

/** Human-readable token description for diagnostics. */
function describeToken(tok: Token): string {
  switch (tok.type) {
    case "Identifier": return `identifier '${tok.value}'`;
    case "Keyword": return `keyword '${tok.value}'`;
    case "StateIdentifier": return `'$${tok.value}'`;
    case "Number": return `number '${tok.value}'`;
    case "String": return "a string";
    case "TemplateString": return "a template literal";
    case "Regex": return "a regular expression";
    case "Newline": return "the end of the line";
    case "EOF": return "the end of the input";
    default: return `'${tok.value}'`;
  }
}

/**
 * Top-level statement dispatcher. Mirrors the JS statement grammar —
 * keyword-led statements (`function`, `if`, `for`, `while`, `switch`,
 * `try`, `throw`, `break`, `continue`, `return`, `await`, `let` /
 * `const` / `var`) take precedence; otherwise we try an assignment
 * (`name = expr` / `$name = expr`) and fall through to a bare
 * expression statement.
 */
function parseStatement(ctx: ParserContext, topLevel: boolean): Statement | null {
  const startIndex = ctx.snapshot();
  const stmt = parseStatementImpl(ctx, topLevel);
  if (!stmt || !BLOCK_TERMINATED_STATEMENTS.has(stmt.kind)) {
    requireStatementBoundary(ctx, startIndex);
  }
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
  if (ctx.statementBlocks && head.type === "Punctuation" && head.value === "{") {
    // `{ a }` is still an object literal; anything else (`{ const x = 1 }`,
    // `case 2: { … }`) is a statement block, whose own errors are real ones.
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
    // Without `statementBlocks` a statement-position `{` can only be an object
    // literal. One that fails inside its own braces with a grammar error
    // ("Expected ':' but got …") is nearly always a block (`{ const x = 1 }`,
    // `case 2: { … }`), whose real problem is that Aktion has none — the
    // object-literal error names an inner token and says nothing about that.
    // Every other failure keeps its own, more specific message and position.
    const start = ctx.snapshot();
    try {
      return parseExpressionStatement(ctx);
    } catch (err) {
      const failedAt = ctx.snapshot();
      ctx.takePending();
      const error = err as ParseError & { __definitive?: boolean };
      const { close, errorDepth } = scanBraces(ctx, start, error);
      // Depth 1 is directly inside the statement's own braces: an error deeper
      // in is a real mistake in a nested function, call or array, not a block.
      if (error.__definitive || close < 0 || errorDepth !== 1 || !BLOCK_LIKE_ERROR.test(error.message)) {
        ctx.restore(failedAt);
        throw err;
      }
      // Step over the whole block so its own closing `}` is not reported again.
      ctx.restore(close + 1);
      throw { message: BLOCK_STATEMENT_MESSAGE, line: head.line, column: head.column } satisfies ParseError;
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
        { kind: "Literal", value: next.value },
      ],
      loc: { line: next.line, column: next.column },
    };
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

const DESTRUCTURING_ASSIGNMENT_MESSAGE =
  "Destructuring assignment (`[a, b] = …`, `({ a } = …)`) is not supported in Aktion — declare new names " +
  "instead (`const [a, b] = …`), or assign each one separately.";

/** The error for `target = value` whose target cannot be assigned. `head` is the target's first token. */
function invalidAssignmentTarget(target: Expression, head: Token, operator: Token): ParseError {
  if (target.kind === "Array" || target.kind === "Object") {
    return { message: DESTRUCTURING_ASSIGNMENT_MESSAGE, line: head.line, column: head.column };
  }
  return {
    message: `Cannot assign to this expression with \`${operator.value}\` — only a name, a \`$state\` atom or a ` +
      "property (`a.b`, `a[i]`) can be assigned.",
    line: operator.line,
    column: operator.column,
  };
}

/**
 * Skip the line break(s) after `=` or a compound assignment operator when the
 * value starts on the next line — `const x =⏎  value`, the layout Prettier and
 * XO (`operator-linebreak: ['=', 'after']`) produce for a long right-hand side.
 * JavaScript never ends a statement right after `=`, so neither does Aktion.
 *
 * The line breaks are kept (and the statement fails where it stopped) when the
 * next line cannot be this statement's value: the end of the input, a `;`, a
 * keyword that only starts a statement, a closing bracket, or another
 * assignment (`a =⏎ b = 1` would be a chained assignment, which Aktion does not
 * support). An unfinished `x =` therefore still reports its error on its own
 * line — what the streaming frontier and the line-based error recovery rely
 * on — instead of swallowing the next statement.
 */
function skipNewlinesBeforeOperand(ctx: ParserContext): void {
  const { token, skipped } = peekNonNewline(ctx);
  if (skipped === 0 || !canStartOperand(ctx, token, skipped)) return;
  for (let i = 0; i < skipped; i += 1) ctx.consume();
}

/** Keywords that can begin an expression (everything else in `KEYWORDS_AKTION` only begins a statement). */
const OPERAND_KEYWORDS: ReadonlySet<string> = new Set(["function", "new", "typeof", "void", "delete", "await", "async"]);

/** True when `token` (at `offset` from the cursor) can begin the value of an assignment. */
function canStartOperand(ctx: ParserContext, token: Token, offset: number): boolean {
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
      return token.value === "!" || token.value === "-" || token.value === "+" || token.value === "~" ||
        token.value === "++" || token.value === "--";
    default:
      return false;
  }
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
 *
 * The case is read from the name the author wrote: a linker-renamed symbol
 * (`__a1_Counter`, see `module-symbols.ts`) is classified by its base name
 * (`Counter`). Otherwise printing a linked program and parsing it again — the
 * reconnect, DevTools and `linkProject` paths — would turn every imported
 * component into an action.
 */
function parseFunctionDecl(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "function");
  // A `$`-prefixed name (`function $useCounter() { ... }`) declares a HOOK.
  // The lexer emits the name as a `StateIdentifier` (value without the `$`).
  // Hooks compose per-instance state — their body runs inline in the calling
  // component's hook scope (React's custom-hook model).
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
      loc: { line: start.line, column: start.column },
    };
  }

  const authoredName = moduleLocalBaseName(nameTok.value) ?? nameTok.value;
  const isPascalCase =
    authoredName.length > 0 && authoredName[0]! >= "A" && authoredName[0]! <= "Z";

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
  return ctx.withNewlines(true, () => parseFunctionParamList(ctx));
}

/** The parameters after `(`, through the closing `)`. */
function parseFunctionParamList(ctx: ParserContext): DeclParam[] {
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
        rejectUnsupportedWord(ctx, tok);
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
          message: unexpected(tok, `Expected parameter name, got ${tok.type} "${tok.value}"`),
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
  const decl = ctx.withNewlines(true, () => parseEffectArguments(ctx, start));
  skipTerminator(ctx);
  return decl;
}

/** `$effect(` arguments through the closing `)`. */
function parseEffectArguments(ctx: ParserContext, start: Token): Statement {
  skipWhitespace(ctx);

  // Only an inline function and an array literal mean anything here; anything
  // else is dropped. `.aktion` keeps that behaviour, but the JS-semantics layer
  // rejects it (E119 / E120), so the position goes into a side table — the
  // AST itself does not change.
  const shape: EffectCallShape = {};
  const callbackTok = ctx.peek();
  const callbackExpr = parseExpression(ctx);
  let body: BlockExpr;
  if (callbackExpr.kind === "Lambda") {
    body = callbackExpr.body.kind === "Block"
      ? callbackExpr.body
      : { kind: "Block", body: [{ kind: "ExpressionStatement", expression: callbackExpr.body }] };
  } else {
    body = { kind: "Block", body: [] };
    shape.callback = { line: callbackTok.line, column: callbackTok.column };
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
      const depsTok = ctx.peek();
      parseExpression(ctx);
      shape.deps = { line: depsTok.line, column: depsTok.column };
    }
  }

  skipWhitespace(ctx);
  ctx.expect("Punctuation", ")");

  const decl: Statement = {
    kind: "EffectDeclaration",
    name: `__effect_L${start.line}_C${start.column}`,
    triggers,
    body,
    loc: { line: start.line, column: start.column },
  };
  if (rateLimit) (decl as { rateLimit?: EffectRateLimit }).rateLimit = rateLimit;
  recordEffectCallShape(decl, shape);
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
    message: head.type === "Error"
      ? unexpected(head, "")
      : `Unexpected ${head.type} "${head.value}" inside effect dependency array. ` +
        `Expected $state or a string token ("mount", "unmount", "every(N)", etc.).`,
    line: head.line,
    column: head.column,
  } satisfies ParseError;
}

/** `{ declaration }` for a `let` / `const` / `var` token, spread so keyword-less nodes stay field-free. */
function declarationOf(token: Token): { declaration: DeclarationKeyword } | Record<string, never> {
  return token.value === "let" || token.value === "const" || token.value === "var"
    ? { declaration: token.value }
    : {};
}

/**
 * Parse `let` / `const` / `var` with one or more declarators:
 * `let x = 1`, `let x` (no value yet), `let a = 1, b = 2`, `const { a } = o`.
 *
 * The first declarator is returned; each further one becomes its own
 * statement, located where that declarator starts, and is queued on the context
 * (`ctx.takePending()`) for the statement list being parsed to append right
 * after it. Aktion has no block scoping (every declaration keyword behaves the
 * same), so `let a = 1, b = 2` and `let a = 1⏎let b = 2` mean the same thing.
 *
 * `inForHead` is the init of `for (…; …; …)`: one declarator only, and the
 * caller consumes the `;` that follows.
 */
function parseVarDecl(ctx: ParserContext, inForHead = false): Statement {
  const keyword = ctx.consume(); // let/const/var
  const declarators: Statement[] = [];
  let start: Token = keyword;
  while (true) {
    const declarator = parseDeclarator(ctx, keyword, start);
    nodeEndLine.set(declarator, ctx.previousConsumedLine());
    declarators.push(declarator);
    const comma = ctx.peek();
    if (!(comma.type === "Punctuation" && comma.value === ",")) break;
    if (inForHead) {
      throw {
        message:
          "Declaring several variables in a `for (…)` head is not supported in Aktion — " +
          "declare the others before the loop.",
        line: comma.line,
        column: comma.column,
      } satisfies ParseError;
    }
    ctx.consume();
    skipNewlines(ctx); // `let a = 1,⏎  b = 2`
    start = ctx.peek();
  }
  if (!inForHead) skipTerminator(ctx);
  const [first, ...rest] = declarators;
  ctx.queuePending(rest);
  return first!;
}

/** `Unary(void, 0)` — the value of a declaration written without one (`let x`). */
function undefinedValue(): Expression {
  return { kind: "Unary", operator: "void", argument: { kind: "Literal", value: 0 } };
}

/**
 * One declarator of a `let` / `const` / `var` declaration, starting at `start`
 * (the keyword for the first declarator, the name for later ones).
 *
 * Destructuring forms — `let [a, b, ...rest] = arr` and
 * `let {a, b: alias, c = 1, ...rest} = obj` — expand into a single
 * `DestructureStatement` so the evaluator can fan out the bindings when the
 * right-hand side is evaluated once. A plain name without a value
 * (`let x`) is an `Assignment` of `void 0` flagged `uninitialized`, so the
 * printer can write it back as written.
 */
function parseDeclarator(ctx: ParserContext, keyword: Token, start: Token): Statement {
  const head = ctx.peek();
  const loc = { line: start.line, column: start.column };

  if (head.type === "Punctuation" && (head.value === "[" || head.value === "{")) {
    const pattern = parseDestructuringPattern(ctx);
    consumeNewlinesIfNext(ctx, isAssignToken);
    const eq = ctx.peek();
    if (eq.type === "Punctuation" && eq.value === ":") throw typeAnnotationError(eq, pattern.kind === "array" ? "[…]" : "{ … }");
    if (!isAssignToken(eq)) {
      throw {
        message: unexpected(eq,
          "Missing initializer in a destructuring declaration — destructure a value: " +
          `\`${keyword.value} ${pattern.kind === "array" ? "[a, b]" : "{ a, b }"} = value\`.`),
        line: eq.line,
        column: eq.column,
      } satisfies ParseError;
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
      loc,
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
      column: head.column,
    } satisfies ParseError;
  }
  const name = isState ? `$${identifier}` : identifier;

  // `let x⏎  = 1`: a statement cannot start with `=`, so the declarator goes on.
  consumeNewlinesIfNext(ctx, isAssignToken);
  const eq = ctx.peek();
  if (isAssignToken(eq)) {
    ctx.consume();
    skipNewlinesBeforeOperand(ctx);
    const expression = parseExpression(ctx);
    return { kind: "Assignment", identifier, isState, expression, ...declarationOf(keyword), loc };
  }
  // A character the lexer could not read (`const café = 1`) is the real problem.
  if (eq.type === "Error") throw { message: unexpected(eq, ""), line: eq.line, column: eq.column } satisfies ParseError;
  if (eq.type === "Punctuation" && eq.value === ":") throw typeAnnotationError(eq, name);
  if (keyword.value === "const") {
    throw {
      message:
        `Missing initializer in \`const ${name}\` — a \`const\` needs a value (\`const ${name} = …\`); ` +
        `use \`let ${name}\` to declare it without one.`,
      line: head.line,
      column: head.column,
    } satisfies ParseError;
  }
  // `let x` / `var x`: declared, value `undefined`. Whatever follows is checked
  // by the caller (`,` for another declarator) or the statement boundary.
  return {
    kind: "Assignment",
    identifier,
    isState,
    expression: undefinedValue(),
    uninitialized: true,
    ...declarationOf(keyword),
    loc,
  };
}

function isAssignToken(t: Token): boolean {
  return t.type === "Operator" && t.value === "=";
}

function typeAnnotationError(colon: Token, target: string): ParseError {
  return {
    message: `Type annotations (\`${target}: …\`) are not supported in Aktion — it has no static types, so remove the annotation.`,
    line: colon.line,
    column: colon.column,
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
  // Newlines inside the brackets are whitespace, as in JS (`{⏎  a,⏎  b =⏎  1⏎}`).
  return ctx.withNewlines(true, () => parsePatternBody(ctx, patternKind));
}

/** The bindings after a pattern's opening `[` / `{`, through its closing bracket. */
function parsePatternBody(ctx: ParserContext, patternKind: "array" | "object"): DestructuringPattern {
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
      const nameTok = ctx.expectName();
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
      const keyTok = isRest ? ctx.expectName() : parsePatternKey(ctx);
      const key = keyTok.type === "Number" ? String(numericLiteralValue(keyTok.value)) : keyTok.value;
      let alias = key;
      let sourceKey: string | undefined;
      let nestedPattern: DestructuringPattern | undefined;
      // `{a: b}` — rename: source key `a`, local binding `b`.
      // `{a: { b }}` / `{a: [b]}` — nested pattern under source key `a`.
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
 * The key of one object-pattern entry. Besides a plain name, JavaScript allows
 * a quoted string, a number or a reserved word as the key of an entry that
 * renames (`{ "a-b": x, default: d, 0: first }`); the caller rejects those
 * without a `: name`.
 */
function parsePatternKey(ctx: ParserContext): Token {
  const tok = ctx.peek();
  if (
    tok.type === "Identifier" || tok.type === "Keyword" || tok.type === "Number" ||
    (tok.type === "String" && tok.template !== true)
  ) {
    return ctx.consume();
  }
  return ctx.expect("Identifier"); // throws the usual "Expected Identifier" error
}

/**
 * `{ default }`, `{ "a-b" }`, `{ 0 }`: a key that is not a name cannot be a
 * binding, so it needs `: name`. Definitive: `tryParseLambdaFromParenList`
 * rethrows it rather than retrying the parameter list as an object literal,
 * which is invalid there too.
 */
function patternKeyNeedsName(tok: Token): ParseError {
  const shown = tok.type === "String" ? JSON.stringify(tok.value) : tok.value;
  const what = tok.type === "Keyword"
    ? `\`${tok.value}\` is a reserved word, so it cannot be a binding name`
    : tok.type === "Number"
    ? `The key \`${shown}\` is a number, so it cannot be a binding name`
    : `The key \`${shown}\` is quoted, so it cannot be a binding name`;
  const err: ParseError & { __definitive?: boolean } = {
    message: `${what} — rename it: \`{ ${shown}: name }\`.`,
    line: tok.line,
    column: tok.column,
  };
  err.__definitive = true;
  return err;
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

/**
 * A `{ … }` statement block. Its statements end at newlines again even when the
 * block sits inside parentheses, where newlines are otherwise whitespace
 * (`f(() => {⏎  a()⏎  b()⏎})`).
 */
function parseBlock(ctx: ParserContext): BlockExpr {
  const start = ctx.expect("Punctuation", "{");
  return ctx.withNewlines(false, () => parseBlockBody(ctx, start));
}

function parseBlockBody(ctx: ParserContext, start: Token): BlockExpr {
  const body: Statement[] = [];
  skipWhitespace(ctx);
  while (!(ctx.peek().type === "Punctuation" && ctx.peek().value === "}")) {
    const stmt = parseStatement(ctx, false);
    if (stmt) body.push(stmt);
    body.push(...ctx.takePending());
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
 * `KNOWN_COMMENT_GAPS` in `tests/formatter-idempotency-sweep.test.ts`. That
 * map currently has NO entry for this category: every brace-less body in
 * this repo's own `.aktion` corpus (223, swept across all 165 files) sits on
 * the SAME source line as its `if (cond)`/`while (cond)` header, so there is
 * no physical line for a comment to occupy between header and body in any of
 * them — the gap is real (a comment there would still be misattributed) but
 * currently has zero real corpus occurrences to regress against. The house
 * style always braces multi-line bodies, which is why.
 */
function parseBlockOrSingleStatement(ctx: ParserContext): BlockExpr {
  skipWhitespace(ctx);
  if (ctx.peek().type === "Punctuation" && ctx.peek().value === "{") {
    return parseBlock(ctx);
  }
  const head = ctx.peek();
  const stmt = parseStatement(ctx, false);
  // `if (c) let a = 1, b = 2` is still one body statement in the source.
  const body = [...(stmt ? [stmt] : []), ...ctx.takePending()];
  const last = body[body.length - 1];
  const block: BlockExpr = {
    kind: "Block",
    body,
    loc: { line: head.line, column: head.column },
  };
  nodeEndLine.set(block, last ? (nodeEndLine.get(last) ?? head.line) : head.line);
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

const EOF_TOKEN: Token = { type: "EOF", value: "", line: 0, column: 0 };

class ParserContext {
  private index = 0;
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
  private readonly newlineModes: boolean[] = [];
  /** The innermost `newlineModes` entry (`false` when empty), cached for `peek` / `consume`. */
  private skipNewlines = false;
  /**
   * Statements a single source statement produced beyond the one returned —
   * the second and later declarators of `let a = 1, b = 2`. Every statement
   * list (`parse`, `parseBlock`, switch cases, brace-less bodies) appends them
   * right after the `parseStatement` call that returned their first sibling.
   */
  private pending: Statement[] = [];
  /**
   * Indices into `comments` already claimed by SOME container's
   * `attachComments`/`collectDanglingComments`/switch-case-header pass.
   * Comments are no longer consumed strictly in source order (see
   * `peekComment`/`takeComment` below) — an ancestor container's comment can
   * remain unconsumed while a nested container reaches past it to claim a
   * LATER comment that is actually its own, so "already attached" has to be
   * tracked per-index rather than via a single monotonic cursor.
   */
  private readonly consumedComments = new Set<number>();
  constructor(
    private readonly tokens: Token[],
    /** Out-of-band `//` / `/* *\/` comments in source order (see `lexer.ts`'s `RawComment`). */
    private readonly comments: RawComment[] = [],
    /** `ParseOptions.softNewlines`, kept for the sub-parse of template interpolations. */
    private readonly softNewlines?: ReadonlySet<number>,
    /** `ParseOptions.statementBlocks`. */
    readonly statementBlocks = false,
    /** `ParseOptions.allowUnsupportedWords`. */
    readonly allowUnsupportedWords = false,
  ) {}

  isEnd(): boolean {
    return this.peek().type === "EOF";
  }

  /**
   * Run `parse` with newlines ignored (`true`) or significant (`false`), then
   * restore the enclosing mode — also when `parse` throws.
   */
  withNewlines<T>(ignore: boolean, parse: () => T): T {
    this.newlineModes.push(ignore);
    this.skipNewlines = ignore;
    try {
      return parse();
    } finally {
      this.newlineModes.pop();
      this.skipNewlines = this.newlineModes.length > 0 && this.newlineModes[this.newlineModes.length - 1] === true;
    }
  }

  peek(offset = 0): Token {
    if (!this.skipNewlines) return this.tokens[this.index + offset] ?? EOF_TOKEN;
    let remaining = offset;
    for (let i = this.index; i < this.tokens.length; i += 1) {
      const tok = this.tokens[i]!;
      if (tok.type === "Newline") continue;
      if (remaining === 0) return tok;
      remaining -= 1;
    }
    return EOF_TOKEN;
  }

  /** Queue statements for the statement list being parsed (see `pending`). */
  queuePending(statements: ReadonlyArray<Statement>): void {
    this.pending.push(...statements);
  }

  /** Take (and clear) the queued statements. */
  takePending(): Statement[] {
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
  softNewlinesWithin(offset: number, length: number, base: number): ReadonlySet<number> | undefined {
    if (!this.softNewlines || this.softNewlines.size === 0) return undefined;
    const out = new Set<number>();
    for (const at of this.softNewlines) {
      if (at >= offset && at < offset + length) out.add(base + (at - offset));
    }
    return out.size > 0 ? out : undefined;
  }

  /**
   * True when a `/* … *\/` comment that spans lines sits between `a` and `b`.
   * Comments are not tokens, so this is the only trace of the line break they
   * hide.
   */
  hasLineBreakCommentBetween(a: Token, b: Token): boolean {
    return this.comments.some((c) =>
      c.kind === "Block" && c.endLine > c.line &&
      (c.line > a.line || (c.line === a.line && c.column > a.column)) &&
      (c.line < b.line || (c.line === b.line && c.column < b.column)));
  }

  /** Token at absolute index `i`, or `undefined` outside the stream. */
  tokenAt(i: number): Token | undefined {
    return this.tokens[i];
  }

  consume(): Token {
    if (this.skipNewlines) {
      while (this.tokens[this.index]?.type === "Newline") this.index += 1;
    }
    const tok = this.tokens[this.index] ?? EOF_TOKEN;
    this.index += 1;
    return tok;
  }

  /** Line of the last token actually consumed — used to stamp a statement's own end line. */
  previousConsumedLine(): number {
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
  peekComment(minLine: number): RawComment | undefined {
    for (let i = 0; i < this.comments.length; i += 1) {
      if (this.consumedComments.has(i)) continue;
      const c = this.comments[i]!;
      if (c.line < minLine) continue;
      return c;
    }
    return undefined;
  }

  /** Consume and return the next not-yet-attached comment whose line is `>= minLine`. */
  takeComment(minLine: number): RawComment {
    for (let i = 0; i < this.comments.length; i += 1) {
      if (this.consumedComments.has(i)) continue;
      const c = this.comments[i]!;
      if (c.line < minLine) continue;
      this.consumedComments.add(i);
      return c;
    }
    // Unreachable: callers only call this after `peekComment(minLine)` with
    // the SAME `minLine` confirmed one exists.
    throw new Error("takeComment: no unconsumed comment at or after the given line");
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
        message: unexpected(tok, `Expected ${type}${value !== undefined ? ` "${value}"` : ""} but got ${tok.type} "${tok.value}"`),
        line: tok.line,
        column: tok.column,
      } satisfies ParseError;
    }
    return this.consume();
  }

  /** `expect("Identifier")` for a name being declared or bound, which may not be `this`, `super` or `debugger`. */
  expectName(): Token {
    const tok = this.expect("Identifier");
    rejectUnsupportedWord(this, tok);
    return tok;
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
    rejectUnsupportedWord(ctx, head);
    identifier = ctx.consume().value;
  } else if (head.type === "StateIdentifier") {
    identifier = ctx.consume().value;
    isState = true;
  } else {
    throw {
      message: unexpected(head, `Expected identifier at start of statement, got ${head.type} "${head.value}"`),
      line: head.line,
      column: head.column,
    } satisfies ParseError;
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
  const unsupported = unsupportedImportForm(ctx, start);
  if (unsupported) throw unsupported;
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
    if (importedTok.type === "Identifier" && importedTok.value === "type" && ctx.peek(1).type === "Identifier") {
      throw { message: IMPORT_TYPE_MESSAGE, line: importedTok.line, column: importedTok.column } satisfies ParseError;
    }
    if (importedTok.type === "Keyword" && importedTok.value === "default") {
      throw {
        message: "Default imports are not supported in Aktion — modules only have named exports; import the name " +
          "the module exports (`import { Name } from \"…\"`).",
        line: importedTok.line,
        column: importedTok.column,
      } satisfies ParseError;
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
        rejectUnsupportedWord(ctx, aliasTok);
        local = ctx.consume().value;
      } else {
        throw {
          message: unexpected(aliasTok, `Expected an alias after \`as\`, got ${aliasTok.type} "${aliasTok.value}"`),
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
      message: unexpected(fromTok, `Expected \`from\` after import specifiers, got ${fromTok.type} "${fromTok.value}"`),
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

const DYNAMIC_IMPORT_MESSAGE =
  "Dynamic `import()` is not supported in Aktion — use a static `import { … } from \"…\"` " +
  "at the top of the module.";
const IMPORT_META_MESSAGE =
  "`import.meta` is not supported in Aktion — pass the value in from the host page instead.";

/**
 * JavaScript words that are valid expressions to this grammar (plain
 * identifiers) but mean nothing in Aktion. Without an error they used to parse
 * and then read `null` (`this.x`), call an undefined function (`super.foo()`)
 * or do nothing (`debugger`).
 */
const UNSUPPORTED_WORD_MESSAGES: ReadonlyMap<string, string> = new Map([
  [
    "this",
    "`this` is not supported in Aktion — there are no classes or methods, so nothing is ever bound to it. " +
      "Pass the value as a parameter instead.",
  ],
  [
    "super",
    "`super` is not supported in Aktion — there are no classes or inheritance. " +
      "Call the function you need directly.",
  ],
  ["debugger", "`debugger` is not supported in Aktion — remove it, or log the value with `$console.log(…)`."],
]);

/**
 * Throw the error for `tok` when it is a word Aktion has no use for (`this`,
 * `super`, `debugger`), wherever a name is read or declared. A property name
 * (`o.this`, `{ this: 1 }`) never reaches a caller of this.
 */
function rejectUnsupportedWord(ctx: ParserContext, tok: Token): void {
  if (tok.type !== "Identifier" || ctx.allowUnsupportedWords) return;
  const message = UNSUPPORTED_WORD_MESSAGES.get(tok.value);
  if (message) throw { message, line: tok.line, column: tok.column } satisfies ParseError;
}

/** The grammar errors an object-literal parse gives for text that is really a block. */
const BLOCK_LIKE_ERROR = /^(Expected |Unexpected token |Labels )/;

/**
 * Looks at the `{` at token index `open` without consuming anything: `close` is
 * the index of the `}` that closes it, or -1 when it never is (a stray `{`, or a
 * streamed prefix that has not reached the `}` yet), and `errorDepth` is how
 * deeply `error`'s token is nested in brackets inside it (1 is directly inside
 * the braces; a closing bracket counts at the depth it closes from).
 */
function scanBraces(ctx: ParserContext, open: number, error: ParseError): { close: number; errorDepth: number } {
  let depth = 0;
  let errorDepth = 0;
  for (let i = open; ; i += 1) {
    const tok = ctx.tokenAt(i);
    if (!tok || tok.type === "EOF") return { close: -1, errorDepth };
    if (errorDepth === 0 && (tok.line > error.line || (tok.line === error.line && tok.column >= error.column))) {
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

const BLOCK_STATEMENT_MESSAGE =
  "Aktion has no block statements or block scoping — a `{` at the start of a statement can only open an " +
  "object literal, and this is not one. Hoist the body out of the braces (a `case X:` body needs none), " +
  "or move it into a function.";

/** Why `async` arrows, function expressions and methods are rejected (statement-level `async function` is a no-op). */
const ASYNC_REASON =
  "it runs functions synchronously and returns their value, not a Promise. " +
  "Remove `async` and chain Promises with `.then(…)`.";

const IMPORT_TYPE_MESSAGE =
  "`import type` is not supported in a `.aktion` file — Aktion has no static types, so remove it " +
  "(a `.aktion.ts` module may use it: types are erased before parsing).";

/**
 * The import forms Aktion has no production for, with what to write instead:
 * dynamic `import()`, `import.meta`, `import type`, side-effect, namespace and
 * default imports. `null` when the statement continues with `{`.
 */
function unsupportedImportForm(ctx: ParserContext, start: Token): ParseError | null {
  const next = ctx.peek();
  const at = (tok: Token, message: string): ParseError => ({ message, line: tok.line, column: tok.column });
  if (next.type === "Punctuation" && next.value === "(") return at(start, DYNAMIC_IMPORT_MESSAGE);
  if (next.type === "Punctuation" && next.value === ".") return at(start, IMPORT_META_MESSAGE);
  if (next.type === "Identifier" && next.value === "type") {
    const after = ctx.peek(1);
    const isTypeImport = (after.type === "Punctuation" && after.value === "{") ||
      (after.type === "Operator" && after.value === "*") ||
      (after.type === "Identifier" && after.value !== "from");
    if (isTypeImport) return at(next, IMPORT_TYPE_MESSAGE);
  }
  if (next.type === "String") {
    return at(start,
      `Side-effect imports (\`import ${JSON.stringify(next.value)}\`) are not supported in Aktion — ` +
      "import the names you use: `import { name } from \"…\"`.");
  }
  if (next.type === "Operator" && next.value === "*") {
    return at(next,
      "Namespace imports (`import * as name`) are not supported in Aktion — import each binding by name: " +
      "`import { a, b } from \"…\"`.");
  }
  if (next.type === "Identifier" || next.type === "StateIdentifier") {
    const name = next.type === "StateIdentifier" ? `$${next.value}` : next.value;
    return at(next,
      "Default imports are not supported in Aktion — modules only have named exports; " +
      `write \`import { ${name} } from "…"\`.`);
  }
  return null;
}

/**
 * `export <declaration | assignment>` — marks the following top-level binding
 * importable from another module. `export { … }` lists / re-exports and
 * `export <destructure>` are intentionally not supported yet (clear errors).
 */
function parseExportStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "export");
  const next = ctx.peek();

  if (next.type === "Keyword" && next.value === "default") return parseExportDefault(ctx, next);
  if (next.type === "Operator" && next.value === "*") {
    throw {
      message:
        "`export * from …` is not supported — Aktion modules cannot re-export; import what you need " +
        "from that module directly.",
      line: next.line,
      column: next.column,
    } satisfies ParseError;
  }
  if (next.type === "Punctuation" && next.value === "{") {
    throw {
      message:
        "`export { … }` lists (and re-export lists) are not supported — declare each binding with `export` " +
        "where it is defined (e.g. `export function Foo() {…}`, `export let $count = 0`, `export const NAME = …`).",
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
    // `export let a = 1, b = 2` exports every declarator.
    const more = ctx.takePending();
    for (const declarator of [stmt, ...more]) {
      if (declarator.kind === "DestructureStatement") {
        throw {
          message: "`export` of a destructuring declaration is not supported — export named bindings individually.",
          line: declarator.loc?.line ?? next.line,
          column: declarator.loc?.column ?? next.column,
        } satisfies ParseError;
      }
      if (declarator.kind === "Assignment") declarator.exported = true;
    }
    ctx.queuePending(more);
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

/**
 * `export default $app(…)` — the entry's UI root, written so that TypeScript
 * sees the module's default export (`import app from "./app.aktion.ts"`). It
 * parses to exactly the `ExpressionStatement` that `$app(…)` produces, flagged
 * `exportDefault` so the printer writes it back. Aktion modules have no other
 * default export.
 */
function parseExportDefault(ctx: ParserContext, defaultTok: Token): Statement {
  ctx.consume(); // default
  const head = ctx.peek();
  if (head.type === "Error") throw { message: unexpected(head, ""), line: head.line, column: head.column } satisfies ParseError;
  if (head.type === "StateIdentifier" && head.value === "app") {
    const stmt = parseExpressionStatement(ctx);
    if (stmt.kind === "ExpressionStatement" && isAppCall(stmt.expression)) {
      stmt.exportDefault = true;
      return stmt;
    }
  }
  throw {
    message:
      "`export default` is only supported for the entry's `$app(…)` call — export anything else by name " +
      "(`export function App() {…}`, `export const value = …`).",
    line: defaultTok.line,
    column: defaultTok.column,
  } satisfies ParseError;
}

function isAppCall(expr: Expression): boolean {
  return expr.kind === "Invoke" && expr.optional !== true &&
    expr.callee.kind === "StateRef" && expr.callee.name === "app";
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

/**
 * A position in an interpolation's sub-program, moved to where it sits in the
 * source — the same arithmetic as {@link rebaseTemplateLocations}.
 */
function rebaseTemplatePosition(pos: { line: number; column: number }, line: number, column: number): SourceLocation {
  if (pos.line !== 1) return { line: line + (pos.line - 1), column: pos.column };
  const exprStartColumn = column + "${".length;
  return { line, column: Math.max(exprStartColumn, exprStartColumn + (pos.column - (TEMPLATE_SUB_PREFIX.length + 1))) };
}

/**
 * Why a `${…}` interpolation (sub-parsed as `sub`) is not one complete
 * expression, positioned in the source; `null` when it is. `line`/`column`
 * are the lexer's position for the `$` of `${`.
 */
function interpolationError(sub: Program, source: string, line: number, column: number): ParseError | null {
  if (source.trim() === "") {
    return {
      message: "Empty `${}` in a template literal — write an expression inside it, or remove it.",
      line,
      column,
    };
  }
  const first = sub.errors[0];
  if (first) {
    const at = rebaseTemplatePosition(first, line, column);
    const message = first.message.startsWith("Unexpected token EOF")
      ? "Unexpected end of the `${…}` interpolation — it needs a complete expression."
      : first.message;
    return { message, ...at };
  }
  if (sub.statements.length !== 1 || sub.statements[0]!.kind !== "Assignment") {
    const loc = (sub.statements[1] as { loc?: SourceLocation } | undefined)?.loc;
    const at = loc ? rebaseTemplatePosition(loc, line, column) : { line, column };
    return {
      message: "A `${…}` interpolation holds a single expression — move the other statements out of the template.",
      ...at,
    };
  }
  return null;
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
              message: unexpected(propTok, `Expected Identifier but got ${propTok.type} "${propTok.value}"`),
              line: propTok.line,
              column: propTok.column,
            } satisfies ParseError;
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
          message: unexpected(propTok, `Expected Identifier but got ${propTok.type} "${propTok.value}"`),
          line: propTok.line,
          column: propTok.column,
        } satisfies ParseError;
      }
      const after = ctx.peek();
      if (after.type === "Punctuation" && after.value === "(") {
        const args = parseParenArgs(ctx);
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
        expr = { kind: "Member", object: expr, computed: parseBracketedKey(ctx), optional: true };
      } else if (ctx.peek().type === "Punctuation" && ctx.peek().value === "(") {
        // `expr?.()` — optional call on an arbitrary expression.
        const args = parseParenArgs(ctx);
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
            message: unexpected(propTok, `Expected Identifier but got ${propTok.type} "${propTok.value}"`),
            line: propTok.line,
            column: propTok.column,
          } satisfies ParseError;
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
            loc: { line: propTok.line, column: propTok.column },
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
    // Call postfix on an arbitrary expression — `(fn)(args)`, IIFE
    // `(() => …)()`, `arr[i](args)`, etc. Bare identifier callees stay
    // as `Call` nodes (handled in `parsePrimary`) so component / action
    // / library lookups still resolve by name.
    if (tok.type === "Punctuation" && tok.value === "(") {
      const args = parseParenArgs(ctx);
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

  if (tok.type === "Keyword" && tok.value === "async") {
    const next = ctx.peek(1);
    const what = next.type === "Keyword" && next.value === "function" ? "function expressions" : "arrow functions";
    throw {
      message: `\`async\` ${what} are not supported in Aktion — ${ASYNC_REASON}`,
      line: tok.line,
      column: tok.column,
    } satisfies ParseError;
  }
  if (tok.type === "Keyword" && tok.value === "import") {
    const next = ctx.peek(1);
    if (next.type === "Punctuation" && (next.value === "(" || next.value === ".")) {
      throw {
        message: next.value === "(" ? DYNAMIC_IMPORT_MESSAGE : IMPORT_META_MESSAGE,
        line: tok.line,
        column: tok.column,
      } satisfies ParseError;
    }
  }

  if (tok.type === "Keyword") {
    // Function expression: `function (params) { body }` or
    // `function name(params) { body }`. JS allows these as values
    // (e.g. `arr.map(function (e) { return Button(e) })`) so we parse
    // them into a `Lambda` node sharing the same params/body shape as
    // an arrow function. The optional `name` is kept as `selfName`: as in
    // JavaScript it is bound inside the function's own body (and nowhere
    // else), so `function fact(n) { … fact(n - 1) }` can recurse.
    if (tok.value === "function") {
      const lookahead = ctx.peek(1);
      const lookahead2 = ctx.peek(2);
      const looksLikeFunctionExpr =
        (lookahead.type === "Punctuation" && lookahead.value === "(") ||
        (lookahead.type === "Identifier" && lookahead2.type === "Punctuation" && lookahead2.value === "(");
      if (looksLikeFunctionExpr) {
        const start = tok;
        ctx.consume(); // function
        const selfName = ctx.peek().type === "Identifier" ? ctx.expectName().value : undefined;
        const params = parseFunctionParams(ctx);
        const body = parseBlock(ctx);
        return {
          kind: "Lambda",
          params,
          body: body as never,
          ...(selfName !== undefined ? { selfName } : {}),
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
        const args = parseParenArgs(ctx);
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
      // A soft newline (erased type) inside the interpolation must stay soft in
      // its own sub-parse, or `${foo<⏎T⏎>(x)}` would lose its call.
      const softNewlines = part.offset === undefined
        ? undefined
        : ctx.softNewlinesWithin(part.offset, part.source.length, TEMPLATE_SUB_PREFIX.length);
      const sub = parse(`${TEMPLATE_SUB_PREFIX}${part.source}`, {
        ...(softNewlines ? { softNewlines } : {}),
        ...(ctx.allowUnsupportedWords ? { allowUnsupportedWords: true } : {}),
      });
      // An interpolation that is not one complete expression is an error, at
      // its own position — never a silent `""` (which used to swallow
      // `${import.meta.env.X}`, `${10n}`, `${async () => …}` and plain typos).
      // A template still open at the end of a streamed prefix may hold a cut-off
      // interpolation, so it keeps the lenient reading until it is complete.
      if (tok.open !== true) {
        const problem = interpolationError(sub, part.source, part.line, part.column);
        if (problem) throw problem;
      }
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
    rejectUnsupportedWord(ctx, tok);
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
      const args = parseParenArgs(ctx);
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
    const elements = ctx.withNewlines(true, () => {
      const items = parseCallArgs(ctx);
      ctx.expect("Punctuation", "]");
      return items;
    });
    return { kind: "Array", elements };
  }
  if (tok.type === "Punctuation" && tok.value === "{") {
    ctx.consume();
    // Newlines inside an object literal are whitespace (`{ key:⏎  value }`);
    // a method or arrow body inside it is a block, where they end statements.
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
    // A parenthesised expression: newlines inside are whitespace, as in JS
    // (`return (⏎  Text("x")⏎)`, `if ((⏎  a &&⏎  b⏎))`).
    return ctx.withNewlines(true, () => {
      const expr = parseExpression(ctx);
      const next = ctx.peek();
      if (next.type === "Punctuation" && next.value === ",") {
        throw {
          message:
            "The comma operator is not supported in Aktion — write each expression as its own statement " +
            "(inside an arrow function, use a `{ … }` body).",
          line: next.line,
          column: next.column,
        } satisfies ParseError;
      }
      if (next.type === "Operator" && isAssignmentOperator(next.value)) {
        if (expr.kind === "Array" || expr.kind === "Object") {
          throw { message: DESTRUCTURING_ASSIGNMENT_MESSAGE, line: tok.line, column: tok.column } satisfies ParseError;
        }
        throw {
          message: "Assignment inside an expression is not supported in Aktion — assign in its own statement first, " +
            "then use the name.",
          line: next.line,
          column: next.column,
        } satisfies ParseError;
      }
      ctx.expect("Punctuation", ")");
      return expr;
    });
  }

  throw {
    message: unexpected(tok, `Unexpected token ${tok.type} "${tok.value}"`),
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
  const args = parseParenArgs(ctx);
  return {
    kind: "Call",
    callee: nameTok.value,
    arguments: args,
    loc: { line: nameTok.line, column: nameTok.column },
  };
}

/**
 * `( args )` of a call or `new`, both parentheses included. Newlines inside are
 * whitespace, as in JS.
 */
function parseParenArgs(ctx: ParserContext): Expression[] {
  ctx.expect("Punctuation", "(");
  return ctx.withNewlines(true, () => {
    const args = parseCallArgs(ctx);
    ctx.expect("Punctuation", ")");
    return args;
  });
}

/** `[ key ]` of a computed member access, both brackets included. */
function parseBracketedKey(ctx: ParserContext): Expression {
  ctx.expect("Punctuation", "[");
  return ctx.withNewlines(true, () => {
    const key = parseExpression(ctx);
    ctx.expect("Punctuation", "]");
    return key;
  });
}

/**
 * `( expr )` after `if` / `while` / `switch` / `do … while`, both parentheses
 * included. Newlines inside are whitespace, as in JS
 * (`if (⏎  a &&⏎  b⏎) { … }`).
 */
function parseConditionHead(ctx: ParserContext): Expression {
  ctx.expect("Punctuation", "(");
  return ctx.withNewlines(true, () => {
    const test = parseExpression(ctx);
    ctx.expect("Punctuation", ")");
    return test;
  });
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
  const test = parseConditionHead(ctx);
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
  const discriminant = parseConditionHead(ctx);
  const openBrace = ctx.expect("Punctuation", "{");
  // The `{ case … }` body is statement level: newlines end statements again.
  const cases = ctx.withNewlines(false, () => parseSwitchCases(ctx, openBrace));
  skipTerminator(ctx);
  return {
    kind: "SwitchStatement",
    discriminant,
    cases,
    loc: { line: start.line, column: start.column },
  };
}

/** The cases of a `switch` after its `{`, through the closing `}`. */
function parseSwitchCases(ctx: ParserContext, openBrace: Token): SwitchCase[] {
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
        message: unexpected(ctx.peek(), `Expected "case" or "default" in switch body, got ${ctx.peek().type} "${ctx.peek().value}"`),
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
      body.push(...ctx.takePending());
      skipWhitespace(ctx);
    }
    const caseEndLineExclusive = ctx.peek().line; // line of whichever token stopped the loop above

    // Comment(s) on the `case`/`default` keyword's OWN line or above it,
    // before any of this case's body statements — attach to the SwitchCase
    // record itself (a note on the branch), not to the first body statement.
    // `ctx.peekComment(caseWindowStart)` skips over (without consuming) any
    // earlier, not-yet-reached comment — see `ParserContext.peekComment`'s
    // doc comment — so only the upper bound (`caseHead.line`) needs an
    // explicit check here.
    const caseLeading: AttachedComment[] = [];
    while (true) {
      const c = ctx.peekComment(caseWindowStart);
      if (!c || c.line >= caseHead.line) break;
      ctx.takeComment(caseWindowStart);
      caseLeading.push({ ...c, blankLineBefore: c.line > lastLine + 1 });
      lastLine = c.endLine;
    }
    const caseObj: SwitchCase = { test, body };
    if (caseLeading.length > 0) caseObj.leadingComments = caseLeading;

    const lastBodyLine = body.length > 0
      ? (nodeEndLine.get(body[body.length - 1]!) ?? caseHead.line)
      : caseHead.line;
    // The body's own `attachComments` window must stop just past
    // `lastBodyLine` (allowing only a genuine SAME-LINE trailing comment on
    // the last body statement) — NOT at `caseEndLineExclusive` (the next
    // case/default keyword's own line). Passing `caseEndLineExclusive` here
    // let this call's "drop anything left in this window" cleanup swallow
    // the NEXT case's own header-comment run before that case's `caseLeading`
    // loop above ever got a chance to claim it — the bug that meant only the
    // FIRST case could ever carry a header comment. `Math.min` guards the
    // rare case where the last statement's own end line coincides with the
    // next case token's line (e.g. a one-line `if (x) { y() }` body sharing
    // a line with `case 2:`), so the window never extends past what the old
    // bound allowed. Any comment between `lastBodyLine` and the next case
    // token is left unconsumed here and falls through to become that next
    // case's own leading comment — the same "leading for whatever follows,
    // unless it shares the previous statement's end line" rule
    // `attachComments` already applies between two ordinary statements.
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

/**
 * Parse `for` STATEMENT. Two shapes are recognised — `for (let x of arr) { … }`
 * (iteration; supports array / object destructuring) and the classic
 * `for (init; cond; update) { … }`. Neither shape produces a value.
 * To collect the bodies into an array use `arr.map(x => …)`.
 */
function parseForStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "for");
  ctx.expect("Punctuation", "(");
  // Everything up to the matching `)` is the head: newlines there are
  // whitespace, as in JS (`for (⏎  const x of xs⏎) …`).
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
    loc,
  };
}

type ForHead =
  | {
      kind: "classic";
      init: AssignmentStatement | ExpressionStatement | undefined;
      test: Expression | undefined;
      update: Expression | undefined;
    }
  | {
      kind: "for-of" | "for-in";
      item: string;
      pattern: DestructuringPattern | undefined;
      declaration: Record<string, never> | { declaration: DeclarationKeyword };
      iterable: Expression;
    };

/**
 * A `for` head after its `(`, through the matching `)`. Newlines are already
 * whitespace here (the caller ignores them), so nothing may skip `;` — that is
 * what separates an empty part (`for (;;)`, `for (let i = 0;; i++)`).
 */
function parseForHead(ctx: ParserContext): ForHead {
  // Decide between for-of, for-in, and classic-for. We look ahead: a `;`
  // before the matching `)` means classic; an `of`/`in` keyword
  // determines for-of vs. for-in. (Scans the raw tokens, skipping newlines,
  // so the lookahead stays linear.)
  let kind: "for-of" | "for-in" | "classic" = "for-of";
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

  // for-of / for-in: optional let/const/var, then binding,
  // then `of` / `in`, then iterable.
  let declaration: Record<string, never> | { declaration: DeclarationKeyword } = {};
  if (
    ctx.peek().type === "Keyword" &&
    (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")
  ) {
    declaration = declarationOf(ctx.consume());
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

/** `init; test; update)` of a classic `for` head. */
function parseForClassicHead(ctx: ParserContext): ForHead {
  // init — may be a `let/const/var` decl, an expression, or empty.
  let init: AssignmentStatement | ExpressionStatement | undefined;
  if (!(ctx.peek().type === "Semicolon")) {
    if (
      ctx.peek().type === "Keyword" &&
      (ctx.peek().value === "let" || ctx.peek().value === "const" || ctx.peek().value === "var")
    ) {
      // One declarator only (several are rejected inside `parseVarDecl`);
      // the `;` after it is this head's separator.
      const decl = parseVarDecl(ctx, true);
      if (decl.kind === "Assignment") init = decl;
      ctx.expect("Semicolon");
    } else {
      const exprStart = ctx.peek();
      const expression = parseExpression(ctx);
      init = {
        kind: "ExpressionStatement",
        expression,
        loc: { line: exprStart.line, column: exprStart.column },
      };
      ctx.expect("Semicolon");
    }
  } else {
    ctx.expect("Semicolon");
  }

  let test: Expression | undefined;
  if (!(ctx.peek().type === "Semicolon")) {
    test = parseExpression(ctx);
  }
  ctx.expect("Semicolon");

  let update: Expression | undefined;
  if (!(ctx.peek().type === "Punctuation" && ctx.peek().value === ")")) {
    update = parseAssignmentLikeExpression(ctx);
  }
  const comma = ctx.peek();
  if (comma.type === "Punctuation" && comma.value === ",") {
    throw {
      message:
        "The comma operator is not supported in Aktion — a `for (…)` update must be a single expression; " +
        "update the other variable inside the loop body.",
      line: comma.line,
      column: comma.column,
    } satisfies ParseError;
  }
  ctx.expect("Punctuation", ")");
  return { kind: "classic", init, test, update };
}

/** Parse `while (cond) { body }`. */
function parseWhileStatement(ctx: ParserContext): Statement {
  const start = ctx.expect("Keyword", "while");
  const test = parseConditionHead(ctx);
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
  const test = parseConditionHead(ctx);
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
      catchParam = ctx.withNewlines(true, () => {
        const tok = ctx.peek();
        if (tok.type === "Punctuation" && (tok.value === "{" || tok.value === "[")) {
          throw {
            message:
              "Destructuring the `catch` parameter is not supported in Aktion — catch the error by name " +
              "(`catch (error)`) and read its fields (`error.message`).",
            line: tok.line,
            column: tok.column,
          } satisfies ParseError;
        }
        const name = tok.type === "Identifier" ? ctx.expectName().value : undefined;
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
  // Newlines inside the parameter list are whitespace, as in JS.
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
    body: body as never,
    loc: { line: start.line, column: start.column },
  };
}

/**
 * An arrow function's parameters after `(`, through the closing `)`, or `null`
 * when the parenthesised text is not a parameter list (the caller then parses
 * it as a grouped expression).
 */
function parseLambdaParamList(ctx: ParserContext): LambdaParam[] | null {
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
        } catch (err) {
          if (err && typeof err === "object" && (err as { __definitive?: boolean }).__definitive) throw err;
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
          if (isCloseParen(ctx.peek())) break; // trailing comma (Prettier's multi-line layout)
          continue;
        }
        break;
      }
      if (tok.type !== "Identifier") return null;
      rejectUnsupportedWord(ctx, tok);
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
        if (isCloseParen(ctx.peek())) break; // trailing comma (Prettier's multi-line layout)
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

function isCloseParen(tok: Token): boolean {
  return tok.type === "Punctuation" && tok.value === ")";
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
      skipNewlinesBeforeOperand(ctx);
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
    const unsupported = unsupportedMemberForm(ctx, keyTok);
    if (unsupported) throw unsupported;
    let key: string;
    let computedKey: Expression | undefined;
    if (keyTok.type === "Punctuation" && keyTok.value === "[") {
      ctx.consume();
      skipWhitespace(ctx);
      const keyStart = ctx.peek();
      computedKey = parseExpression(ctx);
      // A literal key (`["/x"]`) carries no position of its own; give it its
      // first token's, so a diagnostic about the key can point at it.
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
        column: keyTok.column,
      } satisfies ParseError;
    }
    const after = ctx.peek();
    let value: Expression;
    let method = false;
    if (
      !computedKey &&
      keyTok.type === "Identifier" &&
      after.type === "Punctuation" &&
      (after.value === "," || after.value === "}")
    ) {
      rejectUnsupportedWord(ctx, keyTok);
      value = { kind: "Identifier", name: key, loc: { line: keyTok.line, column: keyTok.column } };
    } else if (after.type === "Punctuation" && after.value === "(") {
      // Method shorthand: `{ save(item) { … } }` is `{ save: function (item) { … } }`.
      const params = parseFunctionParams(ctx);
      const body = parseBlock(ctx);
      value = { kind: "Lambda", params, body: body as never, loc: { line: keyTok.line, column: keyTok.column } };
      method = true;
    } else {
      ctx.expect("Punctuation", ":");
      value = parseExpression(ctx);
    }
    const prop: ObjectProperty = { key, value };
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

/**
 * Object-literal members Aktion has no production for, recognised at their
 * first token: getters / setters (`get x() {}`), `async` methods and generator
 * methods (`*m() {}`). `null` for anything else — including properties that
 * are merely named `get`, `set` or `async` (`{ get: 1 }`, `{ get() {} }`).
 */
function unsupportedMemberForm(ctx: ParserContext, keyTok: Token): ParseError | null {
  const at = (message: string): ParseError => ({ message, line: keyTok.line, column: keyTok.column });
  if (keyTok.type === "Operator" && keyTok.value === "*") {
    return at("Generator methods (`*name() {}`) are not supported in Aktion — there are no generators.");
  }
  const next = ctx.peek(1);
  const startsKey = next.type === "Identifier" || next.type === "Keyword" || next.type === "String" ||
    next.type === "Number" || next.type === "StateIdentifier" ||
    (next.type === "Punctuation" && next.value === "[");
  if (keyTok.type === "Identifier" && (keyTok.value === "get" || keyTok.value === "set") && startsKey) {
    return at("getters and setters are not supported — use a plain property or a function");
  }
  if (keyTok.type === "Keyword" && keyTok.value === "async" && (startsKey || (next.type === "Operator" && next.value === "*"))) {
    return at(`\`async\` methods are not supported in Aktion — ${ASYNC_REASON}`);
  }
  return null;
}

/** Consume line breaks only — unlike `skipWhitespace`, a `;` is left for the statement to end at. */
function skipNewlines(ctx: ParserContext): void {
  while (ctx.match("Newline")) {/* skip */}
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
 * Comments are consumed from `ctx`'s shared comment list via
 * `peekComment(minLine)`/`takeComment(minLine)`, which SKIP OVER (without
 * consuming) any not-yet-attached comment whose line is `< minLine` — such a
 * comment belongs to an ANCESTOR container (or a not-yet-reached sibling)
 * that has not run its own attachment pass yet. This is load-bearing: a
 * nested container's own comments are always LATER in source order than an
 * unconsumed ancestor comment sitting above it, and the ancestor's call
 * (`Program`-level `attachComments`, in particular) only runs at the very
 * end of `parse()` — after every nested block already ran its own call
 * inline. A single monotonically-advancing cursor (no skipping) would let
 * that earlier, still-unconsumed ancestor comment permanently block every
 * nested container from ever reaching its own, later comments.
 *
 * A comment with no following statement to attach to — the last thing in a
 * non-empty container, on its own line, not sharing the previous statement's
 * end line — is a documented, measured gap (see `KNOWN_COMMENT_GAPS` in
 * `tests/formatter-idempotency-sweep.test.ts`). It is still consumed here
 * (never left for an unrelated LATER container to misattribute it to one of
 * ITS statements) but its text is dropped.
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
  // chronologically EARLIER. `ctx.peekComment(containerStartLine)` /
  // `ctx.takeComment(containerStartLine)` already SKIP OVER (without
  // consuming) any such ancestor comment sitting ahead of the queue, so the
  // loops below only need to additionally test the UPPER bound and whichever
  // per-loop line condition applies; `inWindow` here means "at or past
  // `containerStartLine`" is already true by construction — this checks the
  // remaining "and still before `containerEndLineExclusive`" half.
  const inWindow = (c: RawComment): boolean => c.line < containerEndLineExclusive;

  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    const stmtStartLine = stmt.loc?.line ?? containerEndLineExclusive;
    // A statement that starts and ends on the line the previous one ended on
    // (`let a = 1, b = 2 // note`, `a(); b() // note`) owns the comments after
    // its own start: they are its trailing comments, not the previous one's.
    const sharesLine = stmt.loc !== undefined && stmtStartLine === prevStmtEndLine &&
      (nodeEndLine.get(stmt) ?? stmtStartLine) === stmtStartLine;

    if (prevStmtEndLine !== null) {
      const trailing: AttachedComment[] = [];
      while (true) {
        const c = ctx.peekComment(containerStartLine);
        if (!c || !inWindow(c) || c.line !== prevStmtEndLine) break;
        if (sharesLine && c.column > stmt.loc!.column) break;
        ctx.takeComment(containerStartLine);
        trailing.push({ ...c });
        lastTouchedLine = c.endLine;
      }
      if (trailing.length > 0) statements[i - 1]!.trailingComments = trailing;
    }

    const leading: AttachedComment[] = [];
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
    const trailing: AttachedComment[] = [];
    while (true) {
      const c = ctx.peekComment(containerStartLine);
      if (!c || !inWindow(c) || c.line !== prevStmtEndLine) break;
      ctx.takeComment(containerStartLine);
      trailing.push({ ...c });
    }
    if (trailing.length > 0) statements[statements.length - 1]!.trailingComments = trailing;
  }

  // Anything left inside this container's own window has no statement to
  // attach to — drop it (documented gap above), but still consume it so an
  // unrelated later container never claims it.
  while (true) {
    const c = ctx.peekComment(containerStartLine);
    if (!c || !inWindow(c)) break;
    ctx.takeComment(containerStartLine);
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
    // `ctx.peekComment(containerStartLine)` already skips over (without
    // consuming) any ancestor comment sitting ahead of the queue — see
    // `attachComments`'s `inWindow` doc comment — so only the upper bound
    // needs checking here.
    const c = ctx.peekComment(containerStartLine);
    if (!c || c.line >= containerEndLineExclusive) break;
    ctx.takeComment(containerStartLine);
    out.push({ ...c, blankLineBefore: c.line > lastLine + 1 });
    lastLine = c.endLine;
  }
  return out;
}

/**
 * Skip an optional statement terminator (newline, semicolon, or nothing before `}`/EOF).
 * Whether a missing one is an error is decided by `requireStatementBoundary`.
 */
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
