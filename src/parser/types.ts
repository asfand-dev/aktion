/**
 * AST types for Streaming UI Script.
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
  | BuiltinCallExpr
  | TemplateLiteralExpr
  | SpreadExpr;

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
  /**
   * When true, this reference targets a persistent (`$$name`) variable whose
   * value survives page reloads via the host's storage. Persistent and
   * non-persistent names live in independent namespaces.
   */
  persistent?: boolean;
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
  property: string;
  /** True for `obj?.prop` — short-circuits to undefined if `obj` is null/undefined. */
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
  /** True for `$$persistent = …` declarations. Ignored when `isState` is false. */
  isPersistent?: boolean;
  /**
   * When set, the assignment defines a **macro** (`Name(arg1, arg2) = …`).
   * `params` holds the macro parameter names; the macro body is `expression`.
   * Macros are *not* state — they can be referenced anywhere a component or
   * value can appear, and inlining happens at call time.
   */
  params?: string[];
  expression: Expression;
  loc?: SourceLocation;
}

export type Statement = AssignmentStatement;

export interface Program {
  statements: Statement[];
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
}
