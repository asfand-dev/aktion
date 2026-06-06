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
  | InvokeExpr
  | BuiltinCallExpr
  | NewExpr
  | TemplateLiteralExpr
  | SpreadExpr
  | LambdaExpr
  | BlockExpr;

export interface SwitchCase {
  /** `null` for the `default` case. */
  test: Expression | null;
  body: ReadonlyArray<Statement>;
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
  /** True for `...rest` parameters — must be the final param. */
  rest?: boolean;
  /**
   * Destructuring pattern parameter — `(x => …)` stays a plain name, but
   * `({ a, b }) => …` / `([a, b]) => …` carry the pattern here. When set,
   * `name` is empty and the binder fans the argument out into the pattern.
   */
  pattern?: DestructuringPattern;
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
  /**
   * Computed property key: `{ [expr]: value }`. When set the literal
   * `key` field is ignored and the key is resolved at runtime by
   * evaluating this expression. Falls back to a string coercion.
   */
  computedKey?: Expression;
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
  operator: "!" | "-" | "+" | "~" | "typeof" | "void" | "delete";
  argument: Expression;
  loc?: SourceLocation;
}

export type BinaryOperator =
  | "+" | "-" | "*" | "/" | "%" | "**"
  | "==" | "!=" | "===" | "!==" | ">" | "<" | ">=" | "<="
  | "&&" | "||" | "instanceof" | "in"
  /** Bitwise / shift operators — coerced through ToInt32 / ToUint32 like JS. */
  | "&" | "|" | "^" | "<<" | ">>" | ">>>"
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

/**
 * Postfix call on an arbitrary expression — `(fn)(args)`, IIFE
 * `(() => { … })()`, or `arr[i](args)`. The dedicated `Call` node is
 * still used for bare-identifier callees so the evaluator can resolve
 * component / action / library lookups by name.
 */
export interface InvokeExpr {
  kind: "Invoke";
  callee: Expression;
  arguments: Expression[];
  /** True for `expr?.()` — short-circuits when `callee` is null/undefined. */
  optional?: boolean;
  loc?: SourceLocation;
}

export interface BuiltinCallExpr {
  kind: "BuiltinCall";
  name: string;
  arguments: Expression[];
  loc?: SourceLocation;
}

/** `new Constructor(args)` expression. */
export interface NewExpr {
  kind: "New";
  callee: Expression;
  arguments: Expression[];
  loc?: SourceLocation;
}

export interface AssignmentStatement {
  kind: "Assignment";
  identifier: string;
  isState: boolean;
  expression: Expression;
  /**
   * True when prefixed with `export` (multi-file modules). Used by the linker
   * to decide importability; the streaming runtime ignores it.
   */
  exported?: boolean;
  loc?: SourceLocation;
}

/**
 * Single specifier in an `import { … } from "./mod.aktion"`. Names are stored
 * WITHOUT the leading `$`; `isState` records that the surface syntax used `$`
 * (so `import { $shared }` and `export $shared = …` line up by bare name).
 */
export interface ImportSpecifier {
  /** Name as exported by the source module (bare, no `$`). */
  imported: string;
  /** Local alias bound in this module (bare, no `$`). */
  local: string;
  /** True when the binding is a `$state` atom. */
  isState?: boolean;
}

/**
 * `import { A, B as C, $shared } from "./other.aktion"` — named imports for
 * multi-file `.aktion` programs. Resolved + merged into a single program by the
 * linker (`linkProgram` / `linkProject`); the streaming runtime treats `Import`
 * as a no-op (it has no module map to resolve against).
 */
export interface ImportStatement {
  kind: "Import";
  specifiers: ReadonlyArray<ImportSpecifier>;
  /** Raw module specifier, e.g. "./components/counter.aktion". */
  source: string;
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
  /** True when prefixed with `export` (multi-file modules). */
  exported?: boolean;
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
  /** True for `...rest` parameters — must be the final param. */
  rest?: boolean;
  /**
   * Destructuring pattern parameter — `function Foo({ name }) { … }` /
   * `function Foo([a, b]) { … }`. When set, `name` is empty and the
   * argument value is fanned out into the pattern's bindings.
   */
  pattern?: DestructuringPattern;
}

/**
 * A destructuring pattern shared by `let`-declarations and
 * function / lambda parameters. `kind` selects positional (array) vs.
 * keyed (object) destructuring.
 */
export interface DestructuringPattern {
  kind: "array" | "object";
  bindings: DestructuringBinding[];
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
  body: BlockExpr;
  /** True when prefixed with `export` (multi-file modules). */
  exported?: boolean;
  loc?: SourceLocation;
}

/**
 * `function $name(args) { body }` — a **hook** declaration (the `$` sigil
 * on the function name is the marker, mirroring React's `use*` convention).
 *
 * Hooks are the composable unit of per-instance state. Unlike a component
 * or action, a hook's body runs *inline inside the calling component's hook
 * scope* — it does NOT open its own instance scope — so the `$state(...)` /
 * `$memo(...)` calls inside it allocate slots on the component that invoked
 * the hook (exactly how a React custom hook shares its caller's hook slots).
 *
 * `name` is stored WITHOUT the leading `$` (e.g. `function $useCounter()`
 * becomes `{ name: "useCounter" }`); the hook is invoked as `$useCounter()`.
 *
 * Like React, hooks must be called unconditionally and in a stable order at
 * the top level of a component / hook body — slots are matched by call
 * order across renders.
 */
export interface HookDeclaration {
  kind: "HookDeclaration";
  /** Hook name WITHOUT the leading `$` (e.g. `"useCounter"`). */
  name: string;
  params: ReadonlyArray<DeclParam>;
  body: BlockExpr;
  /** True when prefixed with `export` (multi-file modules). */
  exported?: boolean;
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

/** `if (cond) { … } else { … }` — JS if/else statement (body grammar). */
export interface IfStatement {
  kind: "IfStatement";
  test: Expression;
  consequent: BlockExpr;
  alternate?: IfStatement | BlockExpr;
  loc?: SourceLocation;
}

/** `switch (value) { case X: …; break; default: … }` statement. */
export interface SwitchStatement {
  kind: "SwitchStatement";
  discriminant: Expression;
  cases: ReadonlyArray<SwitchCase>;
  loc?: SourceLocation;
}

/**
 * `for (let x of arr) { body }` statement — iterates without producing a
 * value. Use `arr.map(x => …)` to collect the bodies into an array.
 */
export interface ForOfStatement {
  kind: "ForOfStatement";
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

/**
 * `for (init; test; update) { body }` — classic C-style for loop.
 * `init` is an Assignment statement (`let i = 0`) or null; `test` and
 * `update` are expressions (`i < 10`, `i++`).
 */
export interface ForClassicStatement {
  kind: "ForClassicStatement";
  init?: AssignmentStatement | ExpressionStatement;
  test?: Expression;
  update?: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
}

/**
 * `for (let key in obj) { body }` — iterates over the enumerable string
 * keys of `obj`. Use this for plain-object dictionaries; prefer the
 * `for…of` form for arrays.
 */
export interface ForInStatement {
  kind: "ForInStatement";
  item: string;
  iterable: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** `while (cond) { body }` statement. */
export interface WhileStatement {
  kind: "WhileStatement";
  test: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** `do { body } while (cond)` — body always runs at least once. */
export interface DoWhileStatement {
  kind: "DoWhileStatement";
  test: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
}

/** `break` — exits the nearest enclosing loop or switch case. */
export interface BreakStatement {
  kind: "BreakStatement";
  loc?: SourceLocation;
}

/** `continue` — skips to the next loop iteration. */
export interface ContinueStatement {
  kind: "ContinueStatement";
  loc?: SourceLocation;
}

/** `throw expr` — throws the given value. */
export interface ThrowStatement {
  kind: "ThrowStatement";
  argument: Expression;
  loc?: SourceLocation;
}

/**
 * Single binding produced by an `Array` / `Object` destructuring pattern.
 * Nested patterns are intentionally not modelled — authors with more
 * complex needs can destructure in two steps. `defaultValue` is JS's
 * `let {a = 1} = obj` / `let [a = 1] = arr` fallback.
 */
export interface DestructuringBinding {
  /** Variable name introduced by this slot. */
  name: string;
  /** Optional renamed source key (object pattern only): `let {a: b} = …`. */
  sourceKey?: string;
  /** `let [a, ...rest] = …` / `let {a, ...rest} = …`. */
  rest?: boolean;
  defaultValue?: Expression;
}

/** `let [a, b, ...rest] = …` / `let {x, y: alias, z = 0, ...rest} = …`. */
export interface DestructureStatement {
  kind: "DestructureStatement";
  /** `"array"` for positional, `"object"` for keyed destructuring. */
  patternKind: "array" | "object";
  bindings: DestructuringBinding[];
  expression: Expression;
  loc?: SourceLocation;
}

/** `try { … } catch (e) { … } finally { … }` statement. */
export interface TryStatement {
  kind: "TryStatement";
  block: BlockExpr;
  catchParam?: string;
  catchBlock?: BlockExpr;
  finallyBlock?: BlockExpr;
  loc?: SourceLocation;
}

export type Statement =
  | AssignmentStatement
  | ImportStatement
  | ComponentDeclaration
  | EffectDeclaration
  | ActionDeclaration
  | HookDeclaration
  | AwaitStatement
  | ReturnStatement
  | ExpressionStatement
  | IfStatement
  | SwitchStatement
  | ForOfStatement
  | ForClassicStatement
  | ForInStatement
  | WhileStatement
  | DoWhileStatement
  | DestructureStatement
  | BreakStatement
  | ContinueStatement
  | ThrowStatement
  | TryStatement;

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
