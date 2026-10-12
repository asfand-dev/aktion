/**
 * AST types for Aktion.
 *
 * The surface syntax is JavaScript's. Identifiers prefixed
 * with `$` denote reactive state; everything else is standard JS:
 *
 *   $count = 0
 *   let name = "Ada"
 *   function Counter(initial) { return ... }
 *   effect(() => { ... }, [$count, "mount"])
 */

import type { RawComment } from "./lexer.js";

/**
 * A `//` / `/* *\/` comment attached to the statement it documents.
 *
 * Extends the lexer's `RawComment` (kind, raw text incl. delimiters,
 * position) with `blankLineBefore`, computed by the comment-attachment pass
 * in `parser.ts`: true when at least one full blank source line separated
 * this comment from whatever preceded it (the previous statement's last
 * line, or the previous comment in the same leading-comment group) — the
 * printer reinserts that gap so a deliberately-separated header comment
 * doesn't collapse against the code above it.
 */
export interface AttachedComment extends RawComment {
  blankLineBefore?: boolean;
}

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
  /**
   * Comment(s) immediately preceding the `case`/`default` keyword itself
   * (e.g. a one-line note on what the branch does) — distinct from a
   * `leadingComments` group on the FIRST statement inside `body`, which
   * documents that statement rather than the branch as a whole.
   */
  leadingComments?: ReadonlyArray<AttachedComment>;
}

/** `(args) => body` lambda / arrow function. */
export interface LambdaExpr {
  kind: "Lambda";
  params: ReadonlyArray<LambdaParam>;
  body: Expression;
  /**
   * The name of the function declaration this lambda replaces: the
   * JS-semantics layer turns a nested `function inc() {}` of a `.aktion.js` /
   * `.aktion.ts` module into `const inc = function () {}` (W2), and keeps the
   * name here so coverage and DevTools still call it `inc`. The parser never
   * sets it; the runtime ignores it, and `printProgram` does not print it.
   */
  name?: string;
  /**
   * The name of a named function expression (`function fact(n) { … }` used
   * as a value). As in JavaScript, the evaluator binds it to the function
   * itself inside its own body — below the parameters, so a parameter of the
   * same name wins — which is what lets the expression call itself.
   */
  selfName?: string;
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
  /**
   * Comment(s) that sit inside this block with NO following statement to
   * attach to as `leadingComments` — set only when `body` is empty (e.g. a
   * function stub whose whole body is `// TODO: implement`). A dangling
   * comment before `}` in a NON-empty block (after the last statement, on
   * its own line) is a documented, out-of-scope gap — see
   * `KNOWN_COMMENT_GAPS` in `tests/formatter-idempotency-sweep.test.ts`.
   */
  innerComments?: ReadonlyArray<AttachedComment>;
}

export interface SourceLocation {
  line: number;
  column: number;
  /**
   * Which module this node was authored in — an index into
   * {@link Program.sources}.
   *
   * `parse()` never sets it (a single-file program has exactly one source, so
   * the field would be noise on every node). The **linker** stamps it while it
   * merges a multi-file graph, which is the only point where `line` alone stops
   * identifying a position: after merging, line 42 exists once per module.
   *
   * Absent therefore means "source 0" — the entry — and every consumer should
   * read it as `loc.source ?? 0`.
   */
  source?: number;
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
  /**
   * True when written as method shorthand — `{ save(item) { … } }` — rather
   * than `{ save: (item) => { … } }`. `value` is then a `Lambda` with a block
   * body; the flag only tells the printer to write the shorthand back.
   */
  method?: boolean;
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
  /**
   * Bind a user component's arguments as JavaScript binds them: every
   * argument — an object literal included — goes to the parameter at its
   * position, and none is read as the DSL's named-props bag (`Card({ title })`
   * for `function Card(title)`). The parser never sets it. The JS-semantics
   * layer sets it on a call written in a `.aktion.js` / `.aktion.ts` module to
   * a user component with an object-literal argument, and the evaluator
   * honours it only when the component it reaches was declared in such a
   * module (`ComponentDeclaration.javascript`) — however the import spelled
   * its path (`"./cards"` and `"./cards.aktion.ts"` bind alike). TypeScript
   * types that call with the component's plain signature; a call that reaches
   * a `.aktion` component keeps the named-props convention its generated
   * declaration types. Text cannot carry it (nor `DeclParam.publicName`), so
   * `printProgram` writes such a call in a form the DSL binds the same way —
   * see `printPositionalCall` in `src/tooling/formatter.ts`.
   */
  positional?: true;
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

/** Declaration keyword that can introduce a binding. See `declaration` fields. */
export type DeclarationKeyword = "let" | "const" | "var";

export interface AssignmentStatement {
  kind: "Assignment";
  identifier: string;
  isState: boolean;
  expression: Expression;
  /**
   * Declaration keyword the source used (`let` / `const` / `var`), or absent
   * when the statement had none. Purely informational — all three behave the
   * same at runtime — so the formatter can print the source back faithfully.
   */
  declaration?: DeclarationKeyword;
  /**
   * True for a declaration written without a value — `let x` / `var x` (never
   * `const`, which requires one). `expression` is then `void 0`, so the binding
   * reads `undefined`; the flag only tells the printer to write `let x` back.
   */
  uninitialized?: boolean;
  /**
   * True when prefixed with `export` (multi-file modules). Used by the linker
   * to decide importability; the streaming runtime ignores it.
   */
  exported?: boolean;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
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
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/**
 * One entry of an `export { … }` list. Names are stored WITHOUT the leading `$`.
 * `local` is the binding being exported — a top-level name of this module, or,
 * when the statement has a `source`, a name that module exports. `exported` is
 * the name importers see (the `as` alias, else `local`).
 */
export interface ExportSpecifier {
  local: string;
  exported: string;
  /** True when the binding is a `$state` atom (`$` is kept across `as`). */
  isState?: boolean;
  /** Where the entry starts, so a link error can point at it rather than at the statement. */
  loc?: SourceLocation;
}

/**
 * `export { a, b as c }`, `export { x as y } from "./m.aktion"` and
 * `export * from "./m.aktion"` — a local export list, or a re-export. A local
 * list marks existing top-level bindings exactly as `export` in front of their
 * declaration would; a re-export forwards another module's export WITHOUT
 * binding it in this module, and links `source` at the position of the
 * statement (link order is import order). The streaming runtime treats it as
 * a no-op, like `Import`.
 */
export interface ExportListStatement {
  kind: "ExportList";
  /** Empty for `export * from`. */
  specifiers: ReadonlyArray<ExportSpecifier>;
  /** Raw module specifier of a re-export; absent for a local list. */
  source?: string;
  /** `export * from "…"`: re-export every name the source exports. */
  all?: boolean;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
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
  /**
   * Declared in a `.aktion.js` / `.aktion.ts` module. A call marked
   * `CallExpr.positional` binds its arguments as JavaScript does only when it
   * reaches such a component. The parser never sets it — the JS-semantics
   * layer does. Text cannot carry it; `printProgram` prints the calls that
   * reach the component accordingly instead.
   */
  javascript?: true;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/**
 * Parameter on a `function` declaration. Distinct from `library/components`
 * `ComponentParam` (the editor-level surface projection).
 */
export interface DeclParam {
  name: string;
  /**
   * The name callers use for this parameter when the local `name` was renamed
   * by a compiler pass (e.g. the TS/JS frontend's hygienic renaming). The
   * parser never sets it.
   *
   * It matters for components, whose calling convention is partly by NAME:
   * named props (`Card({ title: "T" })`, `Card(child, { title: "T" })`) and
   * the named-slot logic match prop keys against `publicName ?? name`, while
   * the value is still bound to the local `name` inside the body. Text cannot
   * carry it, so `printProgram` prints such named props under the local name.
   */
  publicName?: string;
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
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
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
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
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
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `await expr` statement / expression — only valid inside `function`/`effect`. */
export interface AwaitStatement {
  kind: "Await";
  argument: Expression;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `return [expr]` statement — only valid inside `function`/`effect`. */
export interface ReturnStatement {
  kind: "Return";
  argument?: Expression;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** Bare expression statement at the top of a block / body. */
export interface ExpressionStatement {
  kind: "ExpressionStatement";
  expression: Expression;
  /**
   * True for `export default $app(…)` — the only default export Aktion has,
   * so that TypeScript sees the entry module's default export. It means the
   * same as `$app(…)` (`expression` is that call); the flag only tells the
   * printer to write `export default` back.
   */
  exportDefault?: boolean;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `if (cond) { … } else { … }` — JS if/else statement (body grammar). */
export interface IfStatement {
  kind: "IfStatement";
  test: Expression;
  consequent: BlockExpr;
  alternate?: IfStatement | BlockExpr;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `switch (value) { case X: …; break; default: … }` statement. */
export interface SwitchStatement {
  kind: "SwitchStatement";
  discriminant: Expression;
  cases: ReadonlyArray<SwitchCase>;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/**
 * `for (let x of arr) { body }` statement — iterates without producing a
 * value. Use `arr.map(x => …)` to collect the bodies into an array.
 */
export interface ForOfStatement {
  kind: "ForOfStatement";
  /** Item binding name (when the loop binds a single identifier). */
  item: string;
  /**
   * Full destructuring pattern when the loop head binds a pattern, e.g.
   * `for (const [k, v] of Object.entries(o))` (array, by index) or
   * `for (const { id, name } of rows)` (object, by key). Honours defaults,
   * renames, holes, and rest exactly like a `let`-destructuring declaration —
   * matching JavaScript semantics. When present, `item` is ignored.
   */
  pattern?: DestructuringPattern;
  /**
   * Declaration keyword the source used (`let` / `const` / `var`), or absent
   * when the statement had none. Purely informational — all three behave the
   * same at runtime — so the formatter can print the source back faithfully.
   */
  declaration?: DeclarationKeyword;
  iterable: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
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
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/**
 * `for (let key in obj) { body }` — iterates over the enumerable string
 * keys of `obj`. Use this for plain-object dictionaries; prefer the
 * `for…of` form for arrays.
 */
export interface ForInStatement {
  kind: "ForInStatement";
  item: string;
  /**
   * Declaration keyword the source used (`let` / `const` / `var`), or absent
   * when the statement had none. Purely informational — all three behave the
   * same at runtime — so the formatter can print the source back faithfully.
   */
  declaration?: DeclarationKeyword;
  iterable: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `while (cond) { body }` statement. */
export interface WhileStatement {
  kind: "WhileStatement";
  test: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `do { body } while (cond)` — body always runs at least once. */
export interface DoWhileStatement {
  kind: "DoWhileStatement";
  test: Expression;
  body: BlockExpr;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `break` — exits the nearest enclosing loop or switch case. */
export interface BreakStatement {
  kind: "BreakStatement";
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `continue` — skips to the next loop iteration. */
export interface ContinueStatement {
  kind: "ContinueStatement";
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `throw expr` — throws the given value. */
export interface ThrowStatement {
  kind: "ThrowStatement";
  argument: Expression;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/**
 * Single binding produced by an `Array` / `Object` destructuring pattern.
 * `defaultValue` is JS's `let {a = 1} = obj` / `let [a = 1] = arr` fallback.
 * A `pattern` makes the slot itself a nested destructuring target, so
 * `let { user: { name } } = resp` / `let [[a], [b]] = pairs` work.
 */
export interface DestructuringBinding {
  /** Variable name introduced by this slot (empty when `pattern` is set). */
  name: string;
  /** Optional renamed source key (object pattern only): `let {a: b} = …`. */
  sourceKey?: string;
  /** `let [a, ...rest] = …` / `let {a, ...rest} = …`. */
  rest?: boolean;
  defaultValue?: Expression;
  /**
   * Nested pattern for this slot: `let { user: { name } } = resp` (object,
   * keyed by `sourceKey`) or `let [[a, b]] = rows` (array, by position). When
   * set, this slot introduces the names inside `pattern` rather than `name`.
   */
  pattern?: DestructuringPattern;
}

/** `let [a, b, ...rest] = …` / `let {x, y: alias, z = 0, ...rest} = …`. */
export interface DestructureStatement {
  kind: "DestructureStatement";
  /** `"array"` for positional, `"object"` for keyed destructuring. */
  patternKind: "array" | "object";
  bindings: DestructuringBinding[];
  expression: Expression;
  /**
   * Declaration keyword the source used (`let` / `const` / `var`), or absent
   * when the statement had none. Purely informational — all three behave the
   * same at runtime — so the formatter can print the source back faithfully.
   */
  declaration?: DeclarationKeyword;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

/** `try { … } catch (e) { … } finally { … }` statement. */
export interface TryStatement {
  kind: "TryStatement";
  block: BlockExpr;
  catchParam?: string;
  catchBlock?: BlockExpr;
  finallyBlock?: BlockExpr;
  loc?: SourceLocation;
  /** Comment(s) immediately preceding this statement — see `AttachedComment`. */
  leadingComments?: ReadonlyArray<AttachedComment>;
  /** Comment(s) on the same source line as this statement's end. */
  trailingComments?: ReadonlyArray<AttachedComment>;
}

export type Statement =
  | AssignmentStatement
  | ImportStatement
  | ExportListStatement
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
  /**
   * Module paths of a **linked** program, indexed by
   * {@link SourceLocation.source}. Index 0 is always the entry module.
   *
   * Only the linker sets this; a `parse()`d single-file program leaves it
   * undefined and its nodes all belong to the single file the caller already
   * knows about. Tools that map a node back to a file should read
   * `program.sources?.[node.loc?.source ?? 0]`.
   */
  sources?: string[];
  /**
   * Set by `parse(source, { streaming: true })` when the source ended inside a
   * string or template literal that was accepted as-is. A host that parsed
   * unfinished text can check it to know whether parsing the final text again
   * could report something new.
   */
  openLiteral?: boolean;
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
}
