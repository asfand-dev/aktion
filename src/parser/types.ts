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
  | BuiltinCallExpr;

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
  | "&&" | "||";

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
