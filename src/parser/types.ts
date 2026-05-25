/**
 * AST types for Aktion.
 *
 * The grammar is line-oriented:
 *   identifier = Expression
 *   $stateVariable = LiteralDefault
 *   name = Query(...) | Mutation(...)
 *
 * Expressions form a tree of literals, references, calls, and operators.
 */

export type Expression =
  | LiteralExpr
  | IdentifierExpr
  | StateRefExpr
  | ArrayExpr
  | ObjectExpr
  | MemberExpr
  | UnaryExpr
  | BinaryExpr
  | TernaryExpr
  | CallExpr
  | MethodCallExpr
  | BuiltinCallExpr
  | TemplateLiteralExpr
  | SpreadExpr
  | NamedArgExpr
  | IfExpr
  | MatchExpr
  | ForExpr
  | LambdaExpr
  | JsBlockExpr
  | BlockExpr;

/** `if cond { ... } else { ... }` expression — see §8.1. */
export interface IfExpr {
  kind: "If";
  test: Expression;
  consequent: BlockExpr;
  alternate?: IfExpr | BlockExpr;
  loc?: SourceLocation;
}

/** `match value { pat -> expr, _ -> expr }` expression — see §8.2. */
export interface MatchExpr {
  kind: "Match";
  discriminant: Expression;
  arms: ReadonlyArray<MatchArm>;
  loc?: SourceLocation;
}

export interface MatchArm {
  /** Literal pattern (string / number / boolean / null / identifier) or `_`. */
  pattern: Expression | "_";
  body: Expression;
}

/** `for x in arr { body }` expression — see §8.3. */
export interface ForExpr {
  kind: "For";
  /** Item binding name. */
  item: string;
  /** Optional `(item, idx)` destructuring index name. */
  index?: string;
  /** Optional `{a, b, c}` destructuring — binds each named field of the row. */
  destructure?: ReadonlyArray<string>;
  iterable: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** `(args) => body` lambda. The body is a single expression OR a `js{}` block. */
export interface LambdaExpr {
  kind: "Lambda";
  params: ReadonlyArray<LambdaParam>;
  body: Expression | JsBlockExpr;
  loc?: SourceLocation;
}

export interface LambdaParam {
  name: string;
  defaultValue?: Expression;
}

/** `js{ ... raw js ... }` opaque block. Runs verbatim under an `effect` or `action` body. */
export interface JsBlockExpr {
  kind: "JsBlock";
  body: string;
  loc?: SourceLocation;
}

/**
 * Statement block delimited by `{ ... }`. Used as the body of `component`,
 * `effect`, `action`, `if`, `match`, `for`, and lambdas with multiple
 * statements. The last expression in the block (if any) is its value.
 */
export interface BlockExpr {
  kind: "Block";
  body: ReadonlyArray<Statement>;
  loc?: SourceLocation;
}

/**
 * Named component argument inside a call list: `GridItem(child, span: "1/4")`.
 * Only valid in `(...)` argument lists, not inside `[...]` arrays.
 */
export interface NamedArgExpr {
  kind: "NamedArg";
  name: string;
  value: Expression;
  loc?: SourceLocation;
}

export interface SourceLocation {
  line: number;
  column: number;
}

export interface LiteralExpr {
  kind: "Literal";
  value: string | number | boolean | null;
  loc?: SourceLocation;
}

export interface IdentifierExpr {
  kind: "Identifier";
  name: string;
  loc?: SourceLocation;
}

export interface StateRefExpr {
  kind: "StateRef";
  name: string;
  loc?: SourceLocation;
}

export interface ArrayExpr {
  kind: "Array";
  elements: Expression[];
  loc?: SourceLocation;
}

export interface ObjectProperty {
  key: string;
  value: Expression;
  /** True for `{...source}` shorthand — `key` is ignored when set. */
  spread?: boolean;
}

export interface ObjectExpr {
  kind: "Object";
  properties: ObjectProperty[];
  loc?: SourceLocation;
}

export interface MemberExpr {
  kind: "Member";
  object: Expression;
  /** Dot-access property name (`obj.field`). */
  property?: string;
  /** Bracket-access key (`arr[i]`, `obj[$key]`). */
  computed?: Expression;
  /** True for `obj?.prop` / `obj?.[key]` — short-circuits when `obj` is null/undefined. */
  optional?: boolean;
  loc?: SourceLocation;
}

/**
 * Spread element used inside array literals (`[...a, b]`). Object spread is
 * modelled as an `ObjectProperty` with `spread: true` because the parser
 * already enumerates props.
 */
export interface SpreadExpr {
  kind: "Spread";
  argument: Expression;
  loc?: SourceLocation;
}

/**
 * Template literal: `` `Hello ${$user.name}, you have ${$count} messages` ``.
 *
 * Encoded as alternating raw string chunks (`quasis`) and embedded
 * expressions. `quasis.length === expressions.length + 1` — there is always
 * one more chunk than expression, even when the template starts or ends
 * with an interpolation (the boundary chunk is empty in that case). This
 * mirrors how the JavaScript AST represents template literals.
 */
export interface TemplateLiteralExpr {
  kind: "Template";
  quasis: string[];
  expressions: Expression[];
  loc?: SourceLocation;
}

export interface UnaryExpr {
  kind: "Unary";
  operator: "!" | "-";
  argument: Expression;
  loc?: SourceLocation;
}

export type BinaryOperator =
  | "+" | "-" | "*" | "/" | "%"
  | "==" | "!=" | ">" | "<" | ">=" | "<="
  | "&&" | "||"
  /**
   * Nullish coalescing — returns `left` unless it is `null` or `undefined`.
   * Distinct from `||`, which also short-circuits on `0`, `""`, and `false`.
   */
  | "??";

export interface BinaryExpr {
  kind: "Binary";
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
  loc?: SourceLocation;
}

export interface TernaryExpr {
  kind: "Ternary";
  test: Expression;
  consequent: Expression;
  alternate: Expression;
  loc?: SourceLocation;
}

export interface CallExpr {
  kind: "Call";
  callee: string;
  arguments: Expression[];
  loc?: SourceLocation;
}

/**
 * `object.method(args...)` invocation. Used for namespaced globals like
 * `storage.set(...)`, `console.log(...)`, and chained member calls on
 * runtime values (`$res.refetch()`). Named args inside the argument list
 * are collected into a single trailing options object — so
 * `storage.cookies.set("k", "v", expires: 1, path: "/")` resolves to
 * `set("k", "v", { expires: 1, path: "/" })`.
 */
export interface MethodCallExpr {
  kind: "MethodCall";
  object: Expression;
  method: string;
  arguments: Expression[];
  /** True for `obj?.method(...)` — short-circuits to `undefined` when `obj` is null. */
  optional?: boolean;
  loc?: SourceLocation;
}

export interface BuiltinCallExpr {
  kind: "BuiltinCall";
  name: string;
  arguments: Expression[];
  loc?: SourceLocation;
}

export interface AssignmentStatement {
  kind: "Assignment";
  identifier: string;
  isState: boolean;
  expression: Expression;
  loc?: SourceLocation;
}

/**
 * `component Name(p, q: default, slots: { footer? }) { ... }` declaration.
 * The body is a `BlockExpr`; the last expression is the rendered output.
 */
export interface ComponentDeclaration {
  kind: "ComponentDeclaration";
  name: string;
  params: ReadonlyArray<DeclParam>;
  /** Names of the declared slots, e.g. `{ footer? }` -> `["footer"]`. */
  slots: ReadonlyArray<string>;
  body: BlockExpr;
  loc?: SourceLocation;
}

/**
 * Parameter on a `component`, `action`, or `effect` declaration. Distinct
 * from `library/components` `ComponentParam` (the editor-level surface
 * projection) — kept under a different name to avoid an ambiguous re-export
 * from the package root.
 */
export interface DeclParam {
  name: string;
  defaultValue?: Expression;
  optional?: boolean;
}

/**
 * `effect [ ...dependencies ] { body }` declaration.
 *
 * Effects are anonymous — the parser auto-assigns a stable name from the
 * declaration's source location so the runtime can keep track of them
 * across re-parses. The optional bracketed dependency list mixes state
 * triggers (`$name`), lifecycle / interval triggers (`on:mount`,
 * `on:unmount`, `on:every(N)`), and rate-limit modifiers (`debounce(N)`,
 * `throttle(N)`) in any order.
 *
 * `effect { ... }` (no brackets) and `effect [on:mount] { ... }` are
 * equivalent — both run the body once on mount.
 */
export interface EffectDeclaration {
  kind: "EffectDeclaration";
  /** Auto-generated name (`__effect_L{line}_C{column}`) — used as a runtime key. */
  name: string;
  triggers: ReadonlyArray<EffectTrigger>;
  /** Optional rate-limit modifier (`debounce(N)` / `throttle(N)`). */
  rateLimit?: EffectRateLimit;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** Trigger literal (`$state`, `on:mount`, `on:unmount`, `on:every(N)`). */
export type EffectTrigger =
  | { kind: "state"; name: string }
  | { kind: "lifecycle"; name: "mount" | "unmount" }
  | { kind: "every"; intervalMs: number };

/** Rate-limit modifier on an `effect` (`debounce(N)` / `throttle(N)`). */
export interface EffectRateLimit {
  kind: "debounce" | "throttle";
  /** Window in milliseconds. */
  ms: number;
}

/**
 * `action Name(args) [optimistic] { body }` declaration. Actions are
 * explicit-call effects; their body runs whenever the action is invoked
 * from an event handler (`onClick: actionName`).
 */
export interface ActionDeclaration {
  kind: "ActionDeclaration";
  name: string;
  params: ReadonlyArray<DeclParam>;
  optimistic: boolean;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** `emit "name" { detail }` outbound event statement. */
export interface EmitStatement {
  kind: "Emit";
  eventName: string;
  detail: Expression;
  loc?: SourceLocation;
}

/** `cleanup(fn)` registration call — only valid inside `effect` bodies. */
export interface CleanupStatement {
  kind: "Cleanup";
  callback: Expression;
  loc?: SourceLocation;
}

/** `await expr` statement / expression — only valid inside `action`/`effect`. */
export interface AwaitStatement {
  kind: "Await";
  argument: Expression;
  loc?: SourceLocation;
}

/** `return [expr]` statement — only valid inside `action`/`effect`/`component`. */
export interface ReturnStatement {
  kind: "Return";
  argument?: Expression;
  loc?: SourceLocation;
}

/** Bare expression statement at the top of a block / body. */
export interface ExpressionStatement {
  kind: "ExpressionStatement";
  expression: Expression;
  loc?: SourceLocation;
}

export type Statement =
  | AssignmentStatement
  | ComponentDeclaration
  | EffectDeclaration
  | ActionDeclaration
  | EmitStatement
  | CleanupStatement
  | AwaitStatement
  | ReturnStatement
  | ExpressionStatement;

export interface Program {
  statements: Statement[];
  errors: ParseError[];
  /**
   * Non-fatal diagnostics surfaced by schema validation (§15). The
   * program still runs — these are advisory hints for authors who chose
   * a token outside the closed enum, supplied an unknown named arg, or
   * tripped some other "this will not look right" lint.
   */
  warnings?: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
}
