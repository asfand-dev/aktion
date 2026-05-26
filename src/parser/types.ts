/**
 * AST types for Aktion.
 *
 * The surface syntax is a strict subset of JavaScript. Identifiers prefixed
 * with `$` denote reactive state; everything else is standard JS:
 *
 *   $count = 0
 *   let name = "Ada"
 *   function Counter(initial) { return ... }
 *   effect(() => { ... }, [$count, "mount"])
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
  | IfExpr
  | SwitchExpr
  | ForExpr
  | LambdaExpr
  | BlockExpr;

/** `if (cond) { ... } else { ... }` — JS if statement used as expression. */
export interface IfExpr {
  kind: "If";
  test: Expression;
  consequent: BlockExpr;
  alternate?: IfExpr | BlockExpr;
  loc?: SourceLocation;
}

/** `switch (value) { case X: ...; break; default: ... }` expression. */
export interface SwitchExpr {
  kind: "Switch";
  discriminant: Expression;
  cases: ReadonlyArray<SwitchCase>;
  loc?: SourceLocation;
}

export interface SwitchCase {
  /** `null` for the `default` case. */
  test: Expression | null;
  body: ReadonlyArray<Statement>;
}

/** `for (let x of arr) { body }` expression — collects body values into an array. */
export interface ForExpr {
  kind: "For";
  /** Item binding name. */
  item: string;
  /** Optional index binding via `for (let [item, i] of ...)`. */
  index?: string;
  /** Optional `{a, b, c}` destructuring — binds each named field of the row. */
  destructure?: ReadonlyArray<string>;
  iterable: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** `(args) => body` lambda / arrow function. */
export interface LambdaExpr {
  kind: "Lambda";
  params: ReadonlyArray<LambdaParam>;
  body: Expression;
  loc?: SourceLocation;
}

export interface LambdaParam {
  name: string;
  defaultValue?: Expression;
}

/**
 * Statement block delimited by `{ ... }`. Used as the body of `function`,
 * `effect`, `if`, `switch`, `for`, and lambdas with multiple statements.
 * The last expression in the block (if any) is its value.
 */
export interface BlockExpr {
  kind: "Block";
  body: ReadonlyArray<Statement>;
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
 * runtime values (`$res.refetch()`).
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
 * `function Name(p, q) { ... }` declaration. PascalCase names are treated
 * as component declarations; camelCase/snake_case as action declarations.
 * Components MUST have an explicit `return` statement.
 */
export interface ComponentDeclaration {
  kind: "ComponentDeclaration";
  name: string;
  params: ReadonlyArray<DeclParam>;
  /** Names of the declared slots (from props object convention). */
  slots: ReadonlyArray<string>;
  body: BlockExpr;
  loc?: SourceLocation;
}

/**
 * Parameter on a `function` declaration. Distinct from `library/components`
 * `ComponentParam` (the editor-level surface projection).
 */
export interface DeclParam {
  name: string;
  defaultValue?: Expression;
  optional?: boolean;
}

/**
 * `effect(() => { body }, [deps])` declaration.
 *
 * Effects are anonymous — the parser auto-assigns a stable name from the
 * declaration's source location so the runtime can keep track of them
 * across re-parses. The dependency array mixes state triggers (`$name`),
 * lifecycle tokens (`"mount"`, `"unmount"`), interval tokens
 * (`"every(N)"`), and rate-limit modifiers (`"debounce(N)"`,
 * `"throttle(N)"`) in any order.
 *
 * `effect(() => { ... })` (no deps) and `effect(() => { ... }, ["mount"])`
 * are equivalent — both run the body once on mount.
 */
export interface EffectDeclaration {
  kind: "EffectDeclaration";
  /** Auto-generated name (`__effect_L{line}_C{column}`) — used as a runtime key. */
  name: string;
  triggers: ReadonlyArray<EffectTrigger>;
  /** Optional rate-limit modifier (`"debounce(N)"` / `"throttle(N)"`). */
  rateLimit?: EffectRateLimit;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** Trigger literal (`$state`, `"mount"`, `"unmount"`, `"every(N)"`). */
export type EffectTrigger =
  | { kind: "state"; name: string }
  | { kind: "lifecycle"; name: "mount" | "unmount" }
  | { kind: "every"; intervalMs: number };

/** Rate-limit modifier on an `effect` (`"debounce(N)"` / `"throttle(N)"`). */
export interface EffectRateLimit {
  kind: "debounce" | "throttle";
  /** Window in milliseconds. */
  ms: number;
}

/**
 * `function Name(args) { body }` for actions (camelCase names).
 * Actions are explicit-call effects; their body runs whenever the action
 * is invoked from an event handler (`onClick: actionName`).
 */
export interface ActionDeclaration {
  kind: "ActionDeclaration";
  name: string;
  params: ReadonlyArray<DeclParam>;
  optimistic: boolean;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** `await expr` statement / expression — only valid inside `function`/`effect`. */
export interface AwaitStatement {
  kind: "Await";
  argument: Expression;
  loc?: SourceLocation;
}

/** `return [expr]` statement — only valid inside `function`/`effect`. */
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
  | AwaitStatement
  | ReturnStatement
  | ExpressionStatement;

export interface Program {
  statements: Statement[];
  errors: ParseError[];
  /**
   * Non-fatal diagnostics surfaced by schema validation. The program
   * still runs — these are advisory hints.
   */
  warnings?: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
}
