/**
 * The JavaScript-semantics layer for `.aktion.js` and `.aktion.ts` modules.
 *
 * Erasing types makes a `.aktion.ts` file parse; it does not make it MEAN what
 * TypeScript thinks it means. Aktion's evaluator interprets a JS-shaped AST
 * under DSL rules: one flat map of function locals, closures that copy their
 * scope when they are created, module-level bindings rebuilt on every render,
 * an `await` that never suspends. For a `.aktion` author those rules are the
 * language. For a JS/TS author they are silent bugs that `tsc` type-checks
 * happily. This layer closes the gap for the JavaScript-shaped languages —
 * never for `.aktion`, whose meaning must not change:
 *
 *   - **W4** {@link normalizeComponentForms}: a module-level PascalCase
 *     `const Name = (…) => …` becomes a component, as React authors expect.
 *   - **Checks** {@link checkJavaScriptSemantics}: constructs whose Aktion
 *     meaning differs from their JavaScript meaning, and that no rewrite can
 *     fix, become diagnostics with a stable code (E101–E127 errors, W201–W202
 *     warnings).
 *   - **W1–W3** {@link lowerJavaScriptSemantics}: rewrites that make the
 *     evaluator compute what JavaScript would — every local gets a unique name
 *     (W1), a nested function becomes a `const` lambda in place (W2), and every
 *     function body ends in an explicit `return` (W3); a call that reaches a
 *     component declared in a JavaScript-shaped module binds its arguments
 *     positionally (`CallExpr.positional`, `ComponentDeclaration.javascript`).
 *
 * The rules, the measurements behind them and the exact messages are specified
 * in `aktion-in-typescript.md` §6. Rewrites keep every original `loc`, so
 * diagnostics, coverage and effect keys stay on the author's line and column.
 *
 * Browser-safe: no `node:*` imports.
 */

import { tokenize } from "../parser/lexer.js";
import { effectCallShape } from "../parser/effect-shape.js";
import { walk } from "../parser/walk.js";
import type {
  ActionDeclaration,
  AssignmentStatement,
  BlockExpr,
  CallExpr,
  DeclParam,
  DestructureStatement,
  DestructuringBinding,
  DestructuringPattern,
  EffectDeclaration,
  Expression,
  InvokeExpr,
  LambdaExpr,
  LambdaParam,
  Program,
  SourceLocation,
  Statement,
} from "../parser/types.js";
import manifest from "../dsl/manifest.json";
import type { LinkDiagnostic } from "./linker.js";
import { DSL_MODULE_ID } from "./module-kind.js";

// ── Vocabulary ──────────────────────────────────────────────────────────

/** Built-in component names (`Text`, `Button`, …), from the generated DSL manifest. */
const LIBRARY_COMPONENTS: ReadonlySet<string> = new Set(manifest.components.map((c) => c.name));

/** `$state`, `$memo`, `$ref`, `$reducer`, `$id` (names without `$`). */
const BUILTIN_HOOKS: ReadonlySet<string> = new Set(manifest.hooks);

/** Factories whose result is a handle whose methods are its API (`$store(…)`, `$http(…)`, …). */
const HANDLE_FACTORIES: ReadonlySet<string> = new Set(manifest.factories);

/**
 * The factories whose handle outlives the render that rebuilds its binding:
 * `$store(…)` / `$form(…)` are cached by their call site and `$query(…)` by
 * its request, so the initializer hands back the same handle (E107, see
 * `Analyzer.survivesRebuild`). `$http`, `$mutation`, `$sse`, `$socket`
 * and `$script` build a new handle on every render.
 */
const CACHED_HANDLE_FACTORIES: ReadonlySet<string> = new Set(["store", "form", "query"]);

/** The factories whose handle reads `undefined` when destructured (S39). */
const STORE_FACTORIES: ReadonlySet<string> = new Set(["store", "form"]);

/** Every `$` name the runtime provides — none of them is a user atom. */
const RUNTIME_STATE_NAMES: ReadonlySet<string> = new Set([
  ...manifest.hooks,
  ...manifest.factories,
  ...manifest.namespaces,
  ...manifest.builtins,
]);

/**
 * Non-`$` names the runtime injects into every program, with why (E112).
 * `children` and `slots` are deliberately absent: a declared `children`
 * parameter is a documented idiom, and W1 renames every local anyway.
 */
const RESERVED_INJECTED: ReadonlyMap<string, string> = new Map([
  ["route", "it holds the current route"],
  ["aktion", "it holds the program's UI root"],
  ["theme", "it holds the active theme tokens"],
  ["params", "it holds the route parameters"],
  ["outlet", "it renders the router outlet"],
  ["cleanup", "it registers effect cleanups"],
  ["setTimeout", "the runtime tracks its timers so it can clear them"],
  ["setInterval", "the runtime tracks its timers so it can clear them"],
  ["clearTimeout", "the runtime tracks its timers so it can clear them"],
  ["clearInterval", "the runtime tracks its timers so it can clear them"],
]);

/** Array methods that change their receiver in place (E107, E108). */
const ARRAY_MUTATORS: ReadonlySet<string> = new Set([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin",
]);

/** `Map` / `Set` (and `URLSearchParams`, `FormData`, …) methods that change their receiver in place. */
const COLLECTION_MUTATORS: ReadonlySet<string> = new Set(["set", "add", "delete", "clear"]);

/**
 * Whether `receiver.method(…)` changes the receiver in place, judged by how the
 * receiver was built (`init`, `undefined` when unknown). `set`/`add`/`delete`/
 * `clear` are also everyday API method names (`api.delete(id)`), so they count
 * only on an object built with `new`; the array mutators count unless the
 * receiver is known to be something other than an array.
 */
function mutatesInPlace(method: string, init: Expression | undefined): boolean {
  if (ARRAY_MUTATORS.has(method)) {
    if (!init) return true;
    switch (init.kind) {
      case "Object":
      case "Literal":
      case "Template":
      case "Lambda":
        return false;
      case "New":
        return init.callee.kind === "Identifier" && init.callee.name === "Array";
      default:
        return true;
    }
  }
  return COLLECTION_MUTATORS.has(method) && init?.kind === "New";
}

/** Operators whose operands are used as plain values (E111). */
const VALUE_BINARY: ReadonlySet<string> = new Set([
  "+", "-", "*", "/", "%", "**",
  "==", "!=", "===", "!==", ">", "<", ">=", "<=", "instanceof", "in",
  "&", "|", "^", "<<", ">>", ">>>",
]);
const VALUE_UNARY: ReadonlySet<string> = new Set(["!", "-", "+", "~", "typeof"]);
const LOGICAL: ReadonlySet<string> = new Set(["&&", "||", "??"]);

/** Names the compiler mints: `__a{n}_` (linker, module scope) and `__l{n}_` (W1, locals). */
const RESERVED_SYMBOL = /^__[al]\d+_/;

export { localBindingBaseName } from "../parser/module-symbols.js";

// ── Messages (stable; tests and docs quote them) ───────────────────────

const MESSAGES = {
  E101:
    "`await` is not supported in Aktion modules: Aktion bodies run synchronously, so `await x` is the Promise itself " +
    "and a statement-level `await f()` is skipped. Chain it instead — `f().then((value) => { … })` — or use `$http(…)` " +
    "and its `.onDone`.",
  E102:
    "`async` functions are not supported: Aktion runs them synchronously and returns their value, not a Promise. " +
    "Remove `async` and chain Promises with `.then(…)`.",
  E103this: "`this` is always null in Aktion — there are no methods or classes; pass the value as a parameter.",
  E103super: "`super` is not available in Aktion — there are no classes or inheritance; call the function you need directly.",
  E103debugger: "`debugger` is not available in Aktion — remove it, or log the value with `$console.log(…)`.",
  E103arguments: "`arguments` is not available in Aktion — use a rest parameter `(...args)`.",
  E104: "`var` is not supported in Aktion modules — use `let` or `const`.",
  E105: (name: string) =>
    `\`${name}\` is reassigned after a closure captured it. Aktion closures copy values when they are created, so the ` +
    "closure would not see — or keep — the new value. Use a `$state` atom, `$ref(…)` inside a component, or an object " +
    "box (`const box = { value: … }`).",
  E106: (name: string) =>
    `\`${name}\` is used by a closure before it is declared. Aktion closures capture their scope when they are ` +
    `created, so \`${name}\` does not exist yet. Move the declaration of \`${name}\` above the closure; for recursion, ` +
    `declare a module-level \`function ${name}(…)\`.`,
  E107: (name: string, fn: string | null) =>
    `Module-level \`${name}\` is changed${fn ? ` in \`${fn}\`` : ""}, but Aktion rebuilds module-level bindings on ` +
    "every render, so the change is lost on the next render. Keep mutable data in a state atom " +
    `(\`let $${name} = …\`) or, inside a component, in \`$ref(…)\`.`,
  E107init: (name: string) =>
    `Module-level \`${name}\` is changed in place after it was built, but Aktion rebuilds module-level bindings ` +
    "from their initializer on every render, so the change is lost. Build the whole value in the initializer " +
    "(`const xs = [1, 2]`, `Object.fromEntries(items.map((it) => [it.id, it]))`, `new Map([[key, value]])`), " +
    `or keep data that changes in a state atom (\`let $${name} = …\`).`,
  E108method: (name: string, method: string) =>
    `\`$${name}.${method}(…)\` changes state in place, and Aktion only re-renders when a \`$\` atom is assigned. ` +
    `Assign a new value instead, e.g. \`$${name} = [...$${name}, item]\`.`,
  E108key: (name: string) =>
    `\`$${name}[…]\` is changed in place, and Aktion only re-renders when a \`$\` atom is assigned. Assign a new value ` +
    `instead, e.g. \`$${name} = $${name}.map(…)\` or \`$${name} = { ...$${name}, [key]: value }\`.`,
  E108assign: (name: string) =>
    `\`Object.assign($${name}, …)\` changes state in place, and Aktion only re-renders when a \`$\` atom is ` +
    `assigned. Assign a new value instead, e.g. \`$${name} = { ...$${name}, ...changes }\`.`,
  E108delete: (name: string) =>
    `\`delete $${name}…\` changes state in place, and Aktion only re-renders when a \`$\` atom is assigned. Assign a ` +
    `new value instead, e.g. a copy without the key: \`const { [key]: _, ...rest } = $${name}; $${name} = rest\`.`,
  E109: (name: string) =>
    `Per-instance state \`$${name}\` must be declared at the top level of the component body — inside a block it ` +
    "becomes a global atom.",
  E110: (hook: string) =>
    `\`$${hook}(…)\` must be called at the top level of a component or of a \`function $useX\` hook — not inside a ` +
    "callback, a condition, a loop, an action, or a lambda that is not a module-level component.",
  E111: (name: string) =>
    `\`${name}\` is a component (its name starts with a capital letter), so calling it produces a UI node, not a ` +
    `value. Rename the helper to camelCase (\`${camelCase(name)}\`).`,
  E112: (name: string, reason: string) => `\`${name}\` is reserved by the Aktion runtime (${reason}) — rename it.`,
  E113:
    "Block statements `{ … }` are not supported — Aktion reads `{` at the start of a statement as an object literal. " +
    "Remove the braces.",
  E114: (name: string, dep: string) =>
    `\`$${name}\` is derived from \`$${dep}\` (its initializer reads state), so Aktion recomputes it whenever ` +
    `\`$${dep}\` changes and overwrites this assignment. Initialize it with a literal and update it in actions, or ` +
    "compute the value where it is used.",
  E115: (name: string) =>
    `Names starting with \`__a<n>_\` or \`__l<n>_\` are reserved for the Aktion compiler — rename \`${name}\`.`,
  E117:
    "Spreads inside component props are ignored by Aktion — list the props explicitly " +
    "(`{ variant: extra.variant, … }`).",
  E118:
    "`$app(…)` registers the UI root and must be a top-level statement of the entry module " +
    "(optionally `export default $app(…)`).",
  E119:
    "Pass the effect body inline: `$effect(() => load(), [...])` — Aktion only runs an inline function here.",
  E120:
    "`$effect` dependencies must be an array literal of `$atoms` and trigger strings " +
    "(`\"mount\"`, `\"every(1000)\"`, …).",
  E121:
    "Returning a cleanup function from an effect has no effect in Aktion — call `cleanup(() => …)` inside the body " +
    "instead.",
  E127arms:
    "`$router(…)` takes its route arms as an object literal written at the call — " +
    "`$router({ \"/\": Home(), default: NotFound() })`. Aktion reads the arms from the source, so a value built " +
    "elsewhere is ignored and the router renders nothing.",
  E127spread:
    "Spreads in `$router({ … })` are ignored — Aktion reads the route arms from the source. List every arm in the " +
    "object literal.",
  E127computed:
    "Computed route paths in `$router({ … })` are ignored — Aktion reads each arm's path from the source. Write the " +
    "path as a string key (`\"/users/:id\": …`).",
  E127routes:
    "A layout arm's `routes` must be an object literal written in place — Aktion reads it from the source, so a value " +
    "built elsewhere renders no child route.",
  E124: (name: string, field: string) =>
    "Destructuring a `$store`/`$form` handle reads `undefined` in Aktion — read the fields as " +
    `\`${name}.${field}\`.`,
  E125: (written: string, bare: string) =>
    `\`${written}\` is not declared — declare it with \`let\` (state: \`let $${bare} = …\` at module level or at ` +
    "the top of the component body).",
  E126: "Declare components and hooks at module top level.",
  W201: (name: string, fn: string) =>
    `\`${name}\` calls \`${fn}\`, and Aktion re-evaluates module-level bindings on every render. Use ` +
    "`$state(…)`/`$memo(…)` in a component, or compute it in an effect or action.",
  W202: (fn: string, atom: string) =>
    `\`${fn}\` assigns \`$${atom}\` and is called while rendering; Aktion applies such writes once and does not ` +
    "re-render. Call it from an event handler or an effect.",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────

function isPascalCase(name: string): boolean {
  const c = name.charCodeAt(0);
  return c >= 65 && c <= 90;
}

function camelCase(name: string): string {
  return name.length === 0 ? name : name[0]!.toLowerCase() + name.slice(1);
}

function isStoreCall(expr: Expression | undefined): expr is InvokeExpr {
  return (
    expr !== undefined &&
    expr.kind === "Invoke" &&
    expr.callee.kind === "StateRef" &&
    STORE_FACTORIES.has(expr.callee.name)
  );
}

/** `$app(…)` as an expression. */
function isAppCall(expr: Expression): expr is InvokeExpr {
  return expr.kind === "Invoke" && expr.callee.kind === "StateRef" && expr.callee.name === "app";
}

/** Line/column ↔ offset over a module's text (1-based positions, as the parser reports them). */
class SourceText {
  private readonly lineStarts: number[] = [0];

  constructor(readonly text: string) {
    for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") this.lineStarts.push(i + 1);
  }

  offsetOf(loc: SourceLocation): number | null {
    const start = this.lineStarts[loc.line - 1];
    return start === undefined ? null : start + loc.column - 1;
  }

  locationOf(offset: number): SourceLocation {
    // The last line starting at or before `offset` (binary search).
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.lineStarts[lo]! + 1 };
  }
}

/**
 * Where a `$name(…)` call starts. The parser locates an `Invoke` at its `(`
 * (and its `StateRef` callee not at all), but a diagnostic should point at the
 * `$`. With the module text, step back from the `(` over whitespace — which is
 * what the TypeScript frontend leaves of the type arguments in
 * `$state<number>(0)`, and what `$memo (…)` has — then over `$name`. Without
 * it, assume nothing sits between the name and `(`.
 */
function invokeStart(expr: InvokeExpr, fallback: SourceLocation, source?: SourceText): SourceLocation {
  const loc = expr.loc ?? fallback;
  if (expr.callee.kind !== "StateRef" || !expr.loc) return loc;
  const name = expr.callee.name;
  const paren = source?.offsetOf(expr.loc);
  if (source && paren !== null && paren !== undefined && source.text[paren] === "(") {
    let end = paren - 1;
    while (end >= 0 && /\s/.test(source.text[end]!)) end -= 1;
    const dollar = end - name.length;
    if (dollar >= 0 && source.text[dollar] === "$" && source.text.slice(dollar + 1, end + 1) === name) {
      return { ...expr.loc, ...source.locationOf(dollar) };
    }
  }
  const column = expr.loc.column - name.length - 1;
  return column >= 1 ? { ...expr.loc, column } : loc;
}

/** Visit every leaf binding of `pattern` (and the defaults on the way) in source order. */
function forEachPatternLeaf(
  pattern: DestructuringPattern,
  visit: (binding: DestructuringBinding, inObject: boolean) => void,
  visitDefault: (expr: Expression) => void,
): void {
  for (const binding of pattern.bindings) {
    if (binding.defaultValue) visitDefault(binding.defaultValue);
    if (binding.pattern) forEachPatternLeaf(binding.pattern, visit, visitDefault);
    else if (binding.name) visit(binding, pattern.kind === "object");
  }
}

/**
 * Rename a pattern leaf. An object-pattern slot without an explicit source key
 * reads the property named like its binding (`{ title }` reads `.title`; the
 * evaluator uses `sourceKey ?? name`), so pin the original name as the key
 * before the binding is renamed.
 */
function renamePatternLeaf(binding: DestructuringBinding, inObject: boolean, symbol: string): void {
  if (inObject && !binding.rest && binding.sourceKey === undefined) binding.sourceKey = binding.name;
  binding.name = symbol;
}

// ── W4: component forms ────────────────────────────────────────────────

/**
 * W4 — a module-level `const Name = (params) => expr` or
 * `const Name = function (params) {…}` (optionally `export`ed) becomes
 * `function Name(params) {…}`, so a PascalCase arrow is a component — hooks,
 * per-instance state and named props work — exactly as React authors expect
 * (S25). An expression body becomes `{ return expr }`. Every `loc` is kept.
 *
 * Runs BEFORE the checks, so E110–E112 see these as components. Returns a new
 * `Program` sharing every statement it did not convert.
 */
export function normalizeComponentForms(program: Program): Program {
  let changed = false;
  const statements = program.statements.map((stmt): Statement => {
    if (
      stmt.kind !== "Assignment" ||
      stmt.isState ||
      stmt.declaration !== "const" ||
      !isPascalCase(stmt.identifier) ||
      stmt.expression.kind !== "Lambda"
    ) {
      return stmt;
    }
    changed = true;
    return arrowAsComponent(stmt, stmt.expression);
  });
  return changed ? { ...program, statements } : program;
}

function arrowAsComponent(stmt: AssignmentStatement, lambda: LambdaExpr): Statement {
  const returnLoc = lambda.body.loc ?? lambda.loc ?? stmt.loc;
  const body: BlockExpr =
    lambda.body.kind === "Block"
      ? lambda.body
      : {
          kind: "Block",
          body: [{ kind: "Return", argument: lambda.body, ...(returnLoc ? { loc: returnLoc } : {}) }],
          ...(lambda.loc ? { loc: lambda.loc } : {}),
        };
  return {
    kind: "ComponentDeclaration",
    name: stmt.identifier,
    params: lambda.params.map((p) => ({ ...p })),
    slots: [],
    body,
    ...(stmt.exported ? { exported: true } : {}),
    ...(stmt.loc ? { loc: stmt.loc } : {}),
    ...(stmt.leadingComments ? { leadingComments: stmt.leadingComments } : {}),
    ...(stmt.trailingComments ? { trailingComments: stmt.trailingComments } : {}),
  };
}

// ── Scope analysis ─────────────────────────────────────────────────────

type FnKind = "component" | "action" | "hook" | "lambda" | "nested" | "effect";

interface FnInfo {
  readonly kind: FnKind;
  /** Name for messages: the declaration, or the module-level `const` a lambda is assigned to. */
  readonly label: string | null;
  readonly parent: FnInfo | null;
  /** Order index of the closure's creation. */
  readonly start: number;
  /** Loops (by id) enclosing the closure's creation. */
  readonly loops: readonly number[];
  /** The body runs during render with hook slots — a component or a `function $useX` hook. */
  readonly hookHost: boolean;
  /** `$` atoms assigned directly in this body (not in nested functions) — W202. */
  readonly stateWrites: string[];
}

type BindingKind =
  | "module" // module-level `let` / `const` (and module-level destructuring)
  | "function" // module-level function, component or hook
  | "import"
  | "param"
  | "local" // `let` / `const` inside a function or a nested block
  | "nested-function" // a function declared inside another (W2)
  | "loop" // loop-header variable
  | "catch";

/** Bindings W1 renames (when plain): everything that is not module scope. */
const LOCAL_KINDS: ReadonlySet<BindingKind> = new Set(["param", "local", "nested-function", "loop", "catch"]);

interface Scope {
  readonly parent: Scope | null;
  readonly fn: FnInfo | null;
  /** Loops enclosing this scope. */
  readonly loopDepth: number;
  readonly plain: Map<string, Binding>;
  readonly state: Map<string, Binding>;
}

interface Binding {
  readonly name: string;
  readonly state: boolean;
  readonly kind: BindingKind;
  readonly scope: Scope;
  readonly loc: SourceLocation | undefined;
  /** `let`/`const` initializer. */
  readonly init: Expression | undefined;
  /** The declaring statement (module-level / block-level declarations). */
  readonly decl: Statement | undefined;
  readonly importSource: string | undefined;
  readonly importedName: string | undefined;
  /** Parameters of the function, when the binding is one (E124 call-site patterns). */
  readonly params: ReadonlyArray<DeclParam | LambdaParam> | undefined;
  /** A component's top-level `let $x` — per-instance state. */
  readonly instance: boolean;
  /** Order index from which the binding exists; `Infinity` until its declaration completes. */
  ready: number;
  /** The W1 name. */
  symbol?: string;
}

interface Ref {
  readonly name: string;
  readonly state: boolean;
  readonly binding: Binding | null;
  readonly index: number;
  readonly loc: SourceLocation;
  readonly fn: FnInfo | null;
  readonly loops: readonly number[];
  readonly write: boolean;
  /** The binding's own declaration (`let x = 1`, a parameter) — never a reassignment. */
  readonly declaring: boolean;
  /** Renames this occurrence (W1). */
  readonly rename: ((symbol: string) => void) | undefined;
}

interface StmtContext {
  /** A direct child of the module. */
  readonly moduleTop: boolean;
  /** A direct child of this function's body block. */
  readonly bodyOf: FnInfo | null;
}

interface ExprContext {
  /** A hook call is allowed here (unconditionally evaluated at the top of a component / hook body). */
  readonly hooks: boolean;
  /** The expression's value is consumed as a plain value (E111). */
  readonly value: boolean;
  /** Name of the module-level `const` a lambda here is assigned to. */
  readonly label?: string;
}

/** A diagnostic before it gets a path. */
interface Finding {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly loc: SourceLocation;
}

/**
 * An in-place change of an imported `$` atom. Whether it is E108 depends on how
 * the EXPORTING module declares the atom, which only the linker sees — see
 * {@link importedStateMutationApplies}.
 */
export interface ImportedStateMutation {
  /** The import specifier, as written. */
  readonly source: string;
  /** Exported name (no `$`). */
  readonly imported: string;
  /** The mutating method, for `$x.push(…)`-style changes. */
  readonly method?: string;
  /** The change goes through a property path (`$x.items.push(…)`), not the atom's own value. */
  readonly path: boolean;
  /** Message to report when it applies. */
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

const NOWHERE: SourceLocation = { line: 0, column: 0 };

function newScope(parent: Scope | null, fn: FnInfo | null, loopDepth: number): Scope {
  return { parent, fn, loopDepth, plain: new Map(), state: new Map() };
}

/**
 * The outermost function strictly inside `owner` that encloses a reference
 * made from `from` — the closure whose creation copies the binding — or `null`
 * when the reference is made directly in the binding's own function.
 */
function captureOf(from: FnInfo | null, owner: FnInfo | null): FnInfo | null {
  let capture: FnInfo | null = null;
  for (let f = from; f !== null && f !== owner; f = f.parent) capture = f;
  return capture;
}

function commonPrefix(a: readonly number[], b: readonly number[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

class Analyzer {
  /** The module text, when the caller has it — positions `$name(…)` diagnostics exactly. */
  constructor(private readonly source?: SourceText) {}

  private index = 0;
  private nextLoop = 0;
  private readonly moduleScope: Scope = newScope(null, null, 0);
  private scope: Scope = this.moduleScope;
  private fn: FnInfo | null = null;
  private loops: number[] = [];
  private readonly locs: SourceLocation[] = [];
  private readonly appRoots = new Set<Expression>();
  private readonly reserved = new Set<string>();
  private readonly fnOf = new Map<object, FnInfo>();
  private readonly renderCalls: Array<{ binding: Binding; loc: SourceLocation }> = [];

  readonly bindings: Binding[] = [];
  readonly refs: Ref[] = [];
  readonly findings: Finding[] = [];
  readonly importedMutations: ImportedStateMutation[] = [];
  /** Calls whose arguments bind positionally, as in JavaScript (`CallExpr.positional`). */
  readonly positionalCalls: CallExpr[] = [];

  run(program: Program): this {
    this.hoistModule(program.statements);
    for (const stmt of program.statements) this.stmt(stmt, { moduleTop: true, bodyOf: null });
    this.checkClosures();
    this.checkModuleBindings();
    this.checkDerivedAtoms();
    this.checkRenderWrites();
    return this;
  }

  // ── bookkeeping ──

  private report(code: string, loc: SourceLocation | undefined, message: string): void {
    this.findings.push({
      code,
      severity: code.startsWith("W") ? "warning" : "error",
      message,
      loc: loc ?? this.here(),
    });
  }

  private here(): SourceLocation {
    return this.locs[this.locs.length - 1] ?? NOWHERE;
  }

  private enter(loc: SourceLocation | undefined): boolean {
    if (!loc) return false;
    this.locs.push(loc);
    return true;
  }

  private leave(pushed: boolean): void {
    if (pushed) this.locs.pop();
  }

  private pushScope(): Scope {
    this.scope = newScope(this.scope, this.fn, this.loops.length);
    return this.scope;
  }

  private popScope(): void {
    this.scope = this.scope.parent ?? this.moduleScope;
  }

  /**
   * E115 — the compiler's own name shapes. Tested on the bare name: the linker
   * renames atoms as well (`$total` → `$__a3_total`), so `$__a1_x` collides too.
   */
  private checkReserved(name: string, state: boolean, loc: SourceLocation | undefined): void {
    if (!RESERVED_SYMBOL.test(name)) return;
    // Once per name, at its first occurrence: renaming it fixes every site.
    const written = state ? `$${name}` : name;
    if (this.reserved.has(written)) return;
    this.reserved.add(written);
    this.report("E115", loc ?? this.here(), MESSAGES.E115(written));
  }

  private declare(
    name: string,
    state: boolean,
    kind: BindingKind,
    extra: {
      loc?: SourceLocation | undefined;
      init?: Expression | undefined;
      decl?: Statement | undefined;
      importSource?: string;
      importedName?: string;
      params?: ReadonlyArray<DeclParam | LambdaParam>;
      instance?: boolean;
      ready?: number;
    } = {},
  ): Binding {
    const table = state ? this.scope.state : this.scope.plain;
    const existing = table.get(name);
    if (existing) return existing;
    this.checkReserved(name, state, extra.loc);
    const binding: Binding = {
      name,
      state,
      kind,
      scope: this.scope,
      loc: extra.loc,
      init: extra.init,
      decl: extra.decl,
      importSource: extra.importSource,
      importedName: extra.importedName,
      params: extra.params,
      instance: extra.instance ?? false,
      ready: extra.ready ?? Number.POSITIVE_INFINITY,
    };
    table.set(name, binding);
    this.bindings.push(binding);
    return binding;
  }

  /** The binding `name` refers to from `from` (the current scope by default). */
  private resolve(name: string, state: boolean, from: Scope | null = this.scope): Binding | null {
    for (let s: Scope | null = from; s !== null; s = s.parent) {
      const found = (state ? s.state : s.plain).get(name);
      if (found) return found;
    }
    return null;
  }

  private addRef(
    name: string,
    state: boolean,
    binding: Binding | null,
    loc: SourceLocation,
    flags: { write?: boolean; declaring?: boolean; rename?: (symbol: string) => void },
  ): Ref {
    const ref: Ref = {
      name,
      state,
      binding,
      index: this.index,
      loc,
      fn: this.fn,
      loops: [...this.loops],
      write: flags.write ?? false,
      declaring: flags.declaring ?? false,
      rename: flags.rename,
    };
    this.refs.push(ref);
    return ref;
  }

  /** A read of `name` here. */
  private read(name: string, state: boolean, loc: SourceLocation, rename?: (symbol: string) => void): Binding | null {
    this.checkReserved(name, state, loc);
    const binding = this.resolve(name, state);
    this.addRef(name, state, binding, loc, rename ? { rename } : {});
    return binding;
  }

  /** An assignment to `name` here (not a declaration). */
  private write(name: string, state: boolean, loc: SourceLocation, rename?: (symbol: string) => void): void {
    this.checkReserved(name, state, loc);
    const binding = this.resolve(name, state);
    this.addRef(name, state, binding, loc, { write: true, ...(rename ? { rename } : {}) });
    if (state) this.fn?.stateWrites.push(name);
    if (!binding) {
      // `$util = …` and friends write a runtime namespace; the runtime ignores
      // it and so do we — it is not an undeclared USER atom.
      if (!(state && RUNTIME_STATE_NAMES.has(name))) {
        this.report("E125", loc, MESSAGES.E125(state ? `$${name}` : name, name));
      }
      return;
    }
    if (!state && (binding.kind === "module" || this.isUserImport(binding))) {
      this.report("E107", loc, MESSAGES.E107(name, this.fnLabel()));
    }
  }

  /** The binding's own declaration site. */
  private declaring(binding: Binding, loc: SourceLocation, rename?: (symbol: string) => void): void {
    this.addRef(binding.name, binding.state, binding, loc, { declaring: true, write: true, ...(rename ? { rename } : {}) });
  }

  private isUserImport(binding: Binding): boolean {
    return binding.kind === "import" && binding.importSource !== DSL_MODULE_ID;
  }

  /** The nearest named function, for "… is changed in `fn`". */
  private fnLabel(): string | null {
    for (let f = this.fn; f !== null; f = f.parent) if (f.label) return f.label;
    return null;
  }

  private newFn(kind: FnKind, label: string | null, start: number, hookHost: boolean, node: object): FnInfo {
    const fn: FnInfo = {
      kind,
      label,
      parent: this.fn,
      start,
      loops: [...this.loops],
      hookHost,
      stateWrites: [],
    };
    this.fnOf.set(node, fn);
    return fn;
  }

  /** Hook calls are allowed in a statement that is a direct child of a component / hook body. */
  private hooksAt(context: StmtContext): boolean {
    return context.bodyOf !== null && context.bodyOf === this.fn && this.fn.hookHost;
  }

  private isHook(name: string): boolean {
    if (BUILTIN_HOOKS.has(name)) return true;
    const binding = this.resolve(name, true);
    if (!binding) return false;
    if (binding.decl?.kind === "HookDeclaration") return true;
    return this.isUserImport(binding) && /^use[A-Z0-9_]/.test(name);
  }

  // ── declarations ──

  private hoistModule(statements: ReadonlyArray<Statement>): void {
    for (const stmt of statements) {
      switch (stmt.kind) {
        case "Assignment":
          if (stmt.declaration) {
            this.declare(stmt.identifier, stmt.isState, "module", {
              loc: stmt.loc,
              init: stmt.expression,
              decl: stmt,
              ready: 0,
              ...(stmt.expression.kind === "Lambda" ? { params: stmt.expression.params } : {}),
            });
          }
          break;
        case "DestructureStatement":
          forEachPatternLeaf(
            { kind: stmt.patternKind, bindings: stmt.bindings },
            (b) => this.declare(b.name, false, "module", { loc: stmt.loc, decl: stmt, ready: 0 }),
            () => {},
          );
          break;
        case "ComponentDeclaration":
        case "ActionDeclaration":
          this.declare(stmt.name, false, "function", { loc: stmt.loc, decl: stmt, params: stmt.params, ready: 0 });
          break;
        case "HookDeclaration":
          this.declare(stmt.name, true, "function", { loc: stmt.loc, decl: stmt, params: stmt.params, ready: 0 });
          break;
        case "Import":
          for (const spec of stmt.specifiers) {
            this.declare(spec.local, spec.isState === true, "import", {
              loc: stmt.loc,
              importSource: stmt.source,
              importedName: spec.imported,
              ready: 0,
            });
          }
          break;
        default:
          break;
      }
    }
  }

  /** Declarations of a block, visible (with TDZ) throughout it — JavaScript block scoping. */
  private hoistBlock(statements: ReadonlyArray<Statement>, bodyOf: FnInfo | null): void {
    for (const stmt of statements) {
      switch (stmt.kind) {
        case "Assignment":
          if (stmt.declaration) {
            this.declare(stmt.identifier, stmt.isState, "local", {
              loc: stmt.loc,
              init: stmt.expression,
              decl: stmt,
              instance: stmt.isState && bodyOf !== null && bodyOf.kind === "component" && bodyOf === this.fn,
              ...(stmt.expression.kind === "Lambda" ? { params: stmt.expression.params } : {}),
            });
          }
          break;
        case "DestructureStatement":
          forEachPatternLeaf(
            { kind: stmt.patternKind, bindings: stmt.bindings },
            (b) => this.declare(b.name, false, "local", { loc: stmt.loc, decl: stmt }),
            () => {},
          );
          break;
        case "ActionDeclaration":
        case "ComponentDeclaration":
          this.declare(stmt.name, false, "nested-function", { loc: stmt.loc, decl: stmt, params: stmt.params });
          break;
        case "HookDeclaration":
          this.declare(stmt.name, true, "nested-function", { loc: stmt.loc, decl: stmt, params: stmt.params });
          break;
        default:
          break;
      }
    }
  }

  private param(p: DeclParam | LambdaParam, component: boolean, fnStart: number): void {
    if (p.defaultValue) this.expr(p.defaultValue, { hooks: false, value: false });
    const loc = this.here();
    if (p.pattern) {
      forEachPatternLeaf(
        p.pattern,
        (leaf, inObject) => {
          const binding = this.declare(leaf.name, false, "param", { loc, ready: fnStart });
          this.declaring(binding, loc, (symbol) => renamePatternLeaf(leaf, inObject, symbol));
        },
        (expr) => this.expr(expr, { hooks: false, value: false }),
      );
      return;
    }
    if (!p.name) return;
    const binding = this.declare(p.name, false, "param", { loc, ready: fnStart });
    this.declaring(binding, loc, (symbol) => {
      // R6: named props bind by the name callers use, which W1 must not change.
      if (component && (p as DeclParam).publicName === undefined) (p as DeclParam).publicName = p.name;
      p.name = symbol;
    });
  }

  // ── statements ──

  private stmt(stmt: Statement, context: StmtContext): void {
    this.index += 1;
    const pushed = this.enter(stmt.loc);
    const hooks = this.hooksAt(context);
    switch (stmt.kind) {
      case "Import":
      case "ExportList":
        break; // declared by hoistModule
      case "Assignment":
        this.assignment(stmt, context, hooks);
        break;
      case "DestructureStatement":
        this.destructure(stmt, context, hooks);
        break;
      case "ComponentDeclaration":
      case "ActionDeclaration":
      case "HookDeclaration":
        this.declaration(stmt, context);
        break;
      case "EffectDeclaration":
        this.effect(stmt);
        break;
      case "Await":
        this.report("E101", stmt.loc, MESSAGES.E101);
        this.expr(stmt.argument, { hooks: false, value: false });
        break;
      case "Return":
        if (stmt.argument) {
          if (this.fn?.kind === "effect") this.report("E121", stmt.loc, MESSAGES.E121);
          if (this.fn?.kind === "component" && this.fn.label && returnsPlainValue(stmt.argument)) {
            this.report("E111", stmt.loc, MESSAGES.E111(this.fn.label));
          }
          this.expr(stmt.argument, { hooks, value: false });
        }
        break;
      case "ExpressionStatement":
        // `{ a }` parses as an object literal; a real block (`{ const x = 1 }`)
        // as a `Block` — `ParseOptions.statementBlocks`.
        if (stmt.expression.kind === "Object" || stmt.expression.kind === "Block") {
          this.report("E113", stmt.loc, MESSAGES.E113);
        }
        if (context.moduleTop && isAppCall(stmt.expression)) this.appRoots.add(stmt.expression);
        this.expr(stmt.expression, { hooks, value: false });
        break;
      case "IfStatement":
        this.expr(stmt.test, { hooks: false, value: true });
        this.block(stmt.consequent, null);
        if (stmt.alternate) {
          if (stmt.alternate.kind === "IfStatement") this.stmt(stmt.alternate, { moduleTop: false, bodyOf: null });
          else this.block(stmt.alternate, null);
        }
        break;
      case "SwitchStatement":
        this.expr(stmt.discriminant, { hooks: false, value: true });
        // One scope for every case, as in JavaScript.
        this.pushScope();
        for (const c of stmt.cases) this.hoistBlock(c.body, null);
        for (const c of stmt.cases) {
          if (c.test) this.expr(c.test, { hooks: false, value: false });
          for (const s of c.body) this.stmt(s, { moduleTop: false, bodyOf: null });
        }
        this.popScope();
        break;
      case "ForOfStatement":
      case "ForInStatement": {
        if (stmt.declaration === "var") this.report("E104", stmt.loc, MESSAGES.E104);
        this.expr(stmt.iterable, { hooks: false, value: false });
        const loop = this.enterLoop();
        this.pushScope();
        this.loopHead(stmt);
        this.block(stmt.body, null);
        this.popScope();
        this.leaveLoop(loop);
        break;
      }
      case "ForClassicStatement": {
        this.pushScope();
        if (stmt.init) {
          if (stmt.init.kind === "Assignment" && stmt.init.declaration) {
            const init = stmt.init;
            if (init.declaration === "var") this.report("E104", init.loc, MESSAGES.E104);
            this.expr(init.expression, { hooks: false, value: false });
            const binding = this.declare(init.identifier, init.isState, "loop", {
              loc: init.loc,
              init: init.expression,
              decl: init,
              ready: this.index,
            });
            this.declaring(binding, init.loc ?? this.here(), init.isState ? undefined : (symbol) => {
              init.identifier = symbol;
            });
          } else {
            this.stmt(stmt.init, { moduleTop: false, bodyOf: null });
          }
        }
        const loop = this.enterLoop();
        if (stmt.test) this.expr(stmt.test, { hooks: false, value: true });
        this.block(stmt.body, null);
        if (stmt.update) this.expr(stmt.update, { hooks: false, value: false });
        this.leaveLoop(loop);
        this.popScope();
        break;
      }
      case "WhileStatement": {
        const loop = this.enterLoop();
        this.expr(stmt.test, { hooks: false, value: true });
        this.block(stmt.body, null);
        this.leaveLoop(loop);
        break;
      }
      case "DoWhileStatement": {
        const loop = this.enterLoop();
        this.block(stmt.body, null);
        this.expr(stmt.test, { hooks: false, value: true });
        this.leaveLoop(loop);
        break;
      }
      case "BreakStatement":
      case "ContinueStatement":
        break;
      case "ThrowStatement":
        this.expr(stmt.argument, { hooks: false, value: false });
        break;
      case "TryStatement":
        this.block(stmt.block, null);
        if (stmt.catchBlock) {
          this.pushScope();
          if (stmt.catchParam) {
            const binding = this.declare(stmt.catchParam, false, "catch", { loc: stmt.loc, ready: this.index });
            this.declaring(binding, stmt.loc ?? this.here(), (symbol) => {
              stmt.catchParam = symbol;
            });
          }
          this.block(stmt.catchBlock, null);
          this.popScope();
        }
        if (stmt.finallyBlock) this.block(stmt.finallyBlock, null);
        break;
    }
    this.leave(pushed);
  }

  private enterLoop(): number {
    const id = this.nextLoop++;
    this.loops.push(id);
    return id;
  }

  private leaveLoop(id: number): void {
    const at = this.loops.lastIndexOf(id);
    if (at !== -1) this.loops.length = at;
  }

  private loopHead(stmt: Statement & { kind: "ForOfStatement" | "ForInStatement" }): void {
    const loc = stmt.loc ?? this.here();
    if (stmt.kind === "ForOfStatement" && stmt.pattern) {
      forEachPatternLeaf(
        stmt.pattern,
        (leaf, inObject) => {
          if (stmt.declaration) {
            const binding = this.declare(leaf.name, false, "loop", { loc, ready: this.index });
            this.declaring(binding, loc, (symbol) => renamePatternLeaf(leaf, inObject, symbol));
          } else {
            this.write(leaf.name, false, loc, (symbol) => renamePatternLeaf(leaf, inObject, symbol));
          }
        },
        (expr) => this.expr(expr, { hooks: false, value: false }),
      );
      return;
    }
    const rename = (symbol: string): void => {
      stmt.item = symbol;
    };
    if (stmt.declaration) {
      const binding = this.declare(stmt.item, false, "loop", { loc, ready: this.index });
      this.declaring(binding, loc, rename);
    } else {
      this.write(stmt.item, false, loc, rename);
    }
  }

  private assignment(stmt: AssignmentStatement, context: StmtContext, hooks: boolean): void {
    if (stmt.declaration === "var") this.report("E104", stmt.loc, MESSAGES.E104);
    const loc = stmt.loc ?? this.here();
    const label = context.moduleTop && stmt.expression.kind === "Lambda" ? stmt.identifier : undefined;
    this.expr(stmt.expression, { hooks, value: false, ...(label ? { label } : {}) });
    const rename = stmt.isState
      ? undefined
      : (symbol: string): void => {
          stmt.identifier = symbol;
        };
    if (!stmt.declaration) {
      this.write(stmt.identifier, stmt.isState, loc, rename);
      return;
    }
    const table = stmt.isState ? this.scope.state : this.scope.plain;
    const binding = table.get(stmt.identifier);
    if (!binding || binding.decl !== stmt) {
      // A second declaration of a name in the same scope — in JavaScript a
      // SyntaxError, in Aktion a reassignment.
      this.write(stmt.identifier, stmt.isState, loc, rename);
      return;
    }
    if (binding.ready === Number.POSITIVE_INFINITY) binding.ready = this.index;
    this.declaring(binding, loc, rename);
    if (stmt.isState) {
      this.fn?.stateWrites.push(stmt.identifier);
      // S26: only the top-level `$x = …` statements of a component body are
      // per-instance state.
      if (this.fn?.kind === "component" && context.bodyOf !== this.fn) {
        this.report("E109", loc, MESSAGES.E109(stmt.identifier));
      }
    } else if (context.moduleTop) {
      const unstable = renderUnstableCall(stmt.expression, (n) => this.resolve(n, false) === null);
      if (unstable) this.report("W201", loc, MESSAGES.W201(stmt.identifier, unstable));
    }
  }

  private destructure(stmt: DestructureStatement, context: StmtContext, hooks: boolean): void {
    if (stmt.declaration === "var") this.report("E104", stmt.loc, MESSAGES.E104);
    const loc = stmt.loc ?? this.here();
    this.expr(stmt.expression, { hooks, value: false });
    if (stmt.patternKind === "object") {
      const handle = this.handleName(stmt.expression);
      if (handle) this.report("E124", loc, MESSAGES.E124(handle, firstField(stmt.bindings)));
    }
    const pattern: DestructuringPattern = { kind: stmt.patternKind, bindings: stmt.bindings };
    const leaves: Array<{ leaf: DestructuringBinding; inObject: boolean }> = [];
    forEachPatternLeaf(
      pattern,
      (leaf, inObject) => leaves.push({ leaf, inObject }),
      (expr) => this.expr(expr, { hooks: false, value: false }),
    );
    for (const { leaf, inObject } of leaves) {
      const binding = this.scope.plain.get(leaf.name);
      const rename = (symbol: string): void => renamePatternLeaf(leaf, inObject, symbol);
      if (!binding || binding.decl !== stmt) {
        this.write(leaf.name, false, loc, rename);
        continue;
      }
      if (binding.ready === Number.POSITIVE_INFINITY) binding.ready = this.index;
      this.declaring(binding, loc, rename);
    }
    if (context.moduleTop) {
      const unstable = renderUnstableCall(stmt.expression, (n) => this.resolve(n, false) === null);
      const first = leaves[0];
      if (unstable && first) this.report("W201", loc, MESSAGES.W201(first.leaf.name, unstable));
    }
  }

  private declaration(
    stmt: Statement & { kind: "ComponentDeclaration" | "ActionDeclaration" | "HookDeclaration" },
    context: StmtContext,
  ): void {
    const nested = !context.moduleTop;
    const isComponent = stmt.kind === "ComponentDeclaration";
    const isHook = stmt.kind === "HookDeclaration";
    const loc = stmt.loc ?? this.here();
    if (nested && (isComponent || isHook)) this.report("E126", loc, MESSAGES.E126);
    if (!nested) this.checkReserved(stmt.name, isHook, loc);

    const start = this.index;
    const kind: FnKind = nested ? "nested" : isComponent ? "component" : isHook ? "hook" : "action";
    const fn = this.newFn(kind, isHook ? `$${stmt.name}` : stmt.name, start, isComponent || isHook, stmt);
    const savedFn = this.fn;
    this.fn = fn;
    this.pushScope();
    for (const p of stmt.params) this.param(p, isComponent && !nested, start);
    this.block(stmt.body, fn);
    this.popScope();
    this.fn = savedFn;

    if (nested) {
      const binding = (isHook ? this.scope.state : this.scope.plain).get(stmt.name);
      if (binding && binding.decl === stmt) {
        binding.ready = this.index;
        this.declaring(binding, loc, isHook ? undefined : (symbol) => {
          stmt.name = symbol;
        });
      }
    }
  }

  private effect(stmt: EffectDeclaration): void {
    const shape = effectCallShape(stmt);
    if (shape?.callback) this.report("E119", shape.callback, MESSAGES.E119);
    if (shape?.deps) this.report("E120", shape.deps, MESSAGES.E120);
    const loc = stmt.loc ?? this.here();
    for (const trigger of stmt.triggers) {
      if (trigger.kind === "state") this.read(trigger.name.split(".")[0]!, true, loc);
    }
    const fn = this.newFn("effect", null, this.index, false, stmt);
    const savedFn = this.fn;
    this.fn = fn;
    this.pushScope();
    this.block(stmt.body, fn);
    this.popScope();
    this.fn = savedFn;
  }

  private block(block: BlockExpr, bodyOf: FnInfo | null): void {
    this.index += 1;
    const pushed = this.enter(block.loc);
    this.pushScope();
    this.hoistBlock(block.body, bodyOf);
    for (const stmt of block.body) this.stmt(stmt, { moduleTop: false, bodyOf });
    this.popScope();
    this.leave(pushed);
  }

  // ── expressions ──

  private expr(expr: Expression, context: ExprContext): void {
    this.index += 1;
    const pushed = this.enter(expr.loc);
    const neutral: ExprContext = { hooks: context.hooks, value: false };
    const asValue: ExprContext = { hooks: context.hooks, value: true };
    const conditional: ExprContext = { hooks: false, value: false };
    switch (expr.kind) {
      case "Literal":
        break;
      case "Identifier": {
        const loc = expr.loc ?? this.here();
        if (expr.name === "this") {
          this.report("E103", loc, MESSAGES.E103this);
          break;
        }
        if (expr.name === "super") {
          this.report("E103", loc, MESSAGES.E103super);
          break;
        }
        if (expr.name === "debugger") {
          this.report("E103", loc, MESSAGES.E103debugger);
          break;
        }
        if (expr.name === "arguments") {
          this.report("E103", loc, MESSAGES.E103arguments);
          break;
        }
        this.read(expr.name, false, loc, (symbol) => {
          expr.name = symbol;
        });
        break;
      }
      case "StateRef":
        this.read(expr.name, true, expr.loc ?? this.here());
        break;
      case "Array":
        for (const element of expr.elements) this.expr(element, neutral);
        break;
      case "Object":
        for (const prop of expr.properties) {
          if (prop.computedKey) this.expr(prop.computedKey, asValue);
          this.expr(prop.value, neutral);
        }
        break;
      case "Member":
        this.expr(expr.object, asValue);
        if (expr.computed) this.expr(expr.computed, asValue);
        break;
      case "Unary":
        if (expr.operator === "delete") this.mutation(expr.argument, "delete", undefined, expr.loc);
        this.expr(expr.argument, VALUE_UNARY.has(expr.operator) ? asValue : neutral);
        break;
      case "Binary":
        if (LOGICAL.has(expr.operator)) {
          this.expr(expr.left, neutral);
          this.expr(expr.right, conditional);
        } else {
          this.expr(expr.left, VALUE_BINARY.has(expr.operator) ? asValue : neutral);
          this.expr(expr.right, VALUE_BINARY.has(expr.operator) ? asValue : neutral);
        }
        break;
      case "Ternary":
        this.expr(expr.test, { hooks: context.hooks, value: true });
        this.expr(expr.consequent, conditional);
        this.expr(expr.alternate, conditional);
        break;
      case "Call":
        if (expr.callee === "this" || expr.callee === "super" || expr.callee === "debugger") {
          this.report("E103", expr.loc, MESSAGES[expr.callee === "this" ? "E103this" : expr.callee === "super" ? "E103super" : "E103debugger"]);
          for (const arg of expr.arguments) this.expr(arg, neutral);
          break;
        }
        this.call(expr, context);
        break;
      case "MethodCall":
        if (ARRAY_MUTATORS.has(expr.method) || COLLECTION_MUTATORS.has(expr.method)) {
          this.mutation(expr.object, "method", expr.method, expr.loc);
        }
        // `Object.assign(target, …)` changes its first argument in place.
        if (isObjectAssign(expr, (n) => this.resolve(n, false) === null) && expr.arguments[0]) {
          this.mutation(expr.arguments[0], "target", undefined, expr.loc);
        }
        this.expr(expr.object, asValue);
        for (const arg of expr.arguments) this.expr(arg, neutral);
        break;
      case "Invoke":
        this.invoke(expr, context);
        break;
      case "BuiltinCall":
        this.builtin(expr, context);
        break;
      case "New":
        this.expr(expr.callee, asValue);
        for (const arg of expr.arguments) this.expr(arg, neutral);
        break;
      case "Template":
        for (const e of expr.expressions) this.expr(e, asValue);
        break;
      case "Spread":
        this.expr(expr.argument, neutral);
        break;
      case "Lambda":
        this.lambda(expr, context.label ?? null);
        break;
      case "Block":
        this.block(expr, null);
        break;
    }
    this.leave(pushed);
  }

  private call(expr: CallExpr, context: ExprContext): void {
    const loc = expr.loc ?? this.here();
    const binding = this.read(expr.callee, false, loc, (symbol) => {
      expr.callee = symbol;
    });
    if (isPascalCase(expr.callee)) {
      if (context.value && this.isUserComponent(binding)) this.report("E111", loc, MESSAGES.E111(expr.callee));
      if (binding === null || (binding.kind === "import" && binding.importSource === DSL_MODULE_ID)) {
        this.checkPropsSpread(expr);
      }
    }
    if (binding) {
      this.checkPatternArguments(expr, binding);
      if (this.fn === null || this.fn.hookHost) this.renderCalls.push({ binding, loc });
      // Whether it binds positionally depends on where the component it
      // reaches was declared, which the evaluator knows (`CallExpr.positional`).
      if (this.isUserComponent(binding) && expr.arguments.some((arg) => arg.kind === "Object")) {
        this.positionalCalls.push(expr);
      }
    }
    const neutral: ExprContext = { hooks: context.hooks, value: false };
    for (const arg of expr.arguments) this.expr(arg, neutral);
  }

  private invoke(expr: InvokeExpr, context: ExprContext): void {
    const neutral: ExprContext = { hooks: context.hooks, value: false };
    if (expr.callee.kind === "StateRef") {
      const name = expr.callee.name;
      const start = invokeStart(expr, this.here(), this.source);
      if (name === "app" && !this.appRoots.has(expr)) this.report("E118", start, MESSAGES.E118);
      if (!context.hooks && this.isHook(name)) this.report("E110", start, MESSAGES.E110(name));
      if (name === "router" && this.isRuntimeName("router")) this.checkRouterArms(expr, start);
      this.read(name, true, start);
    } else {
      this.expr(expr.callee, { hooks: context.hooks, value: true });
    }
    for (const arg of expr.arguments) this.expr(arg, neutral);
  }

  private builtin(expr: Expression & { kind: "BuiltinCall" }, context: ExprContext): void {
    const neutral: ExprContext = { hooks: context.hooks, value: false };
    const [target, value] = expr.arguments;
    switch (expr.name) {
      case "__rui_await__":
        this.report("E101", expr.loc, MESSAGES.E101);
        if (target) this.expr(target, neutral);
        return;
      case "__rui_assign__":
        if (target) this.assignTarget(target, "assign", expr.loc, value);
        return;
      case "__rui_postfix__":
      case "__rui_prefix__":
        if (target) this.assignTarget(target, "update", expr.loc, undefined);
        return;
      default:
        for (const arg of expr.arguments) this.expr(arg, neutral);
    }
  }

  private assignTarget(
    target: Expression,
    kind: "assign" | "update",
    at: SourceLocation | undefined,
    value: Expression | undefined,
  ): void {
    const loc = at ?? this.here();
    const neutral: ExprContext = { hooks: false, value: false };
    if (target.kind === "Identifier") {
      if (value) this.expr(value, neutral);
      this.index += 1;
      this.write(target.name, false, loc, (symbol) => {
        target.name = symbol;
      });
      return;
    }
    if (target.kind === "StateRef") {
      if (value) this.expr(value, neutral);
      this.index += 1;
      this.write(target.name, true, loc);
      return;
    }
    if (target.kind === "Member") this.mutation(target, kind, undefined, loc);
    this.expr(target, neutral);
    if (value) this.expr(value, neutral);
  }

  private lambda(expr: LambdaExpr, label: string | null): void {
    const start = this.index;
    const fn = this.newFn("lambda", label, start, false, expr);
    const savedFn = this.fn;
    this.fn = fn;
    this.pushScope();
    // A named function expression binds its own name in its body, so a
    // self-call resolves (and W1 renames it with the references).
    if (expr.selfName) {
      const loc = expr.loc ?? this.here();
      const self = this.declare(expr.selfName, false, "local", { loc, ready: start });
      this.declaring(self, loc, (symbol) => {
        expr.selfName = symbol;
      });
    }
    for (const p of expr.params) this.param(p, false, start);
    if (expr.body.kind === "Block") this.block(expr.body, fn);
    else this.expr(expr.body, { hooks: false, value: false });
    this.popScope();
    this.fn = savedFn;
  }

  // ── inline rules ──

  private isUserComponent(binding: Binding | null): boolean {
    if (!binding) return false;
    if (binding.kind === "function") return binding.decl?.kind === "ComponentDeclaration";
    return this.isUserImport(binding) && isPascalCase(binding.name);
  }

  /** `$name` is the runtime's own (not shadowed by a user hook or import) — seen from `from`. */
  private isRuntimeName(name: string, from: Scope | null = this.scope): boolean {
    const binding = this.resolve(name, true, from);
    return binding === null || (binding.kind === "import" && binding.importSource === DSL_MODULE_ID);
  }

  /**
   * E127 — `$router(…)` reads its arms from the AST, not from a value: the
   * evaluator matches the properties of the object literal written at the call
   * (skipping spreads, and comparing each arm's literal key with the path), and
   * a layout arm's `routes` the same way. Anything else is silently ignored.
   */
  private checkRouterArms(expr: InvokeExpr, start: SourceLocation): void {
    const arms = expr.arguments[0];
    if (!arms || arms.kind !== "Object") {
      this.report("E127", arms?.loc ?? start, MESSAGES.E127arms);
      return;
    }
    const visit = (object: Expression & { kind: "Object" }): void => {
      for (const prop of object.properties) {
        if (prop.spread) {
          this.report("E127", prop.value.loc ?? start, MESSAGES.E127spread);
          continue;
        }
        if (prop.computedKey) {
          this.report("E127", prop.computedKey.loc ?? start, MESSAGES.E127computed);
          continue;
        }
        if (prop.value.kind !== "Object") continue;
        // A layout arm: `{ layout: Shell(outlet), routes: { … } }`.
        const layout = prop.value.properties.some((p) => !p.spread && !p.computedKey && p.key === "layout");
        const routes = prop.value.properties.find((p) => !p.spread && !p.computedKey && p.key === "routes");
        if (!layout || !routes) continue;
        if (routes.value.kind === "Object") visit(routes.value);
        else this.report("E127", routes.value.loc ?? start, MESSAGES.E127routes);
      }
    };
    visit(arms);
  }

  /** E117 — `{ ...extra }` in the props bag of a library or host component. */
  private checkPropsSpread(expr: CallExpr): void {
    let bag: Expression | undefined;
    for (const arg of expr.arguments) if (arg.kind === "Object") bag = arg;
    if (!bag || bag.kind !== "Object") return;
    for (const prop of bag.properties) {
      if (prop.spread) this.report("E117", prop.value.loc ?? expr.loc, MESSAGES.E117);
    }
  }

  /** The name to show for a `$store`/`$form` handle `expr` evaluates to, or `null` when it is none. */
  private handleName(expr: Expression): string | null {
    if (isStoreCall(expr)) return expr.callee.kind === "StateRef" ? expr.callee.name : "store";
    if (expr.kind === "Identifier") {
      const binding = this.resolve(expr.name, false);
      return binding && isStoreCall(binding.init) ? expr.name : null;
    }
    if (expr.kind === "StateRef") {
      const binding = this.resolve(expr.name, true);
      return binding && isStoreCall(binding.init) ? `$${expr.name}` : null;
    }
    return null;
  }

  /** E124 at a call site: a handle passed to a parameter that destructures it. */
  private checkPatternArguments(expr: CallExpr, binding: Binding): void {
    const params = binding.params;
    if (!params) return;
    expr.arguments.forEach((arg, i) => {
      const param = params[i];
      if (!param?.pattern || param.pattern.kind !== "object") return;
      const handle = this.handleName(arg);
      if (handle) this.report("E124", arg.loc ?? expr.loc, MESSAGES.E124(handle, firstField(param.pattern.bindings)));
    });
  }

  /**
   * An in-place change of what `subject` evaluates to: `obj.k = v`, `list.push(x)`,
   * `delete o.k`, `a[i]++`, `Object.assign(o, …)`. `subject` is the member chain
   * being changed (or the receiver of a mutating method, or the `target` of
   * `Object.assign`).
   */
  private mutation(
    subject: Expression,
    kind: "method" | "assign" | "update" | "delete" | "target",
    method: string | undefined,
    at: SourceLocation | undefined,
  ): void {
    let node = subject;
    let dynamicKey = false;
    let path = false;
    while (node.kind === "Member") {
      if (node.computed && node.computed.kind !== "Literal") dynamicKey = true;
      node = node.object;
      path = true;
    }
    if (node.kind !== "Identifier" && node.kind !== "StateRef") return;
    // `delete x` / `x = …` are not in-place changes of a value.
    if (kind !== "method" && kind !== "target" && !path) return;
    const state = node.kind === "StateRef";
    const binding = this.resolve(node.name, state);
    if (!binding) return;
    const loc = at ?? this.here();
    // Through a path, the receiver is a property of the binding: its shape is unknown.
    if (kind === "method" && !mutatesInPlace(method ?? "", path ? undefined : binding.init)) {
      if (!(state && this.isUserImport(binding))) return;
    }
    if (!state) {
      // E107: the module-level binding is changed after it was built, and
      // every render rebuilds the binding from its initializer. When that
      // builds a fresh value (`[]`, `{}`, `new Map()`, a call) the change is
      // lost: inside a function on the next render; at module top level
      // (`xs.push(2)`, `byId[it.id] = it` in a top-level loop) on the first
      // one, since the imperative top-level statements run once per plan and
      // the render then re-seeds the binding. An initializer that hands back
      // the same object every time keeps the change — see survivesRebuild.
      if ((binding.kind === "module" || this.isUserImport(binding)) && !this.survivesRebuild(binding)) {
        this.report(
          "E107",
          loc,
          this.fn !== null ? MESSAGES.E107(node.name, this.fnLabel()) : MESSAGES.E107init(node.name),
        );
      }
      return;
    }
    if (kind !== "method" && kind !== "target") this.fn?.stateWrites.push(node.name);
    const inPlace = kind === "method" || kind === "target" || kind === "delete" || dynamicKey;
    if (!inPlace) return; // `$o.k = v` is a reactive, copy-on-write path write
    const message =
      kind === "method"
        ? MESSAGES.E108method(node.name, method ?? "")
        : kind === "target"
          ? MESSAGES.E108assign(node.name)
          : kind === "delete"
            ? MESSAGES.E108delete(node.name)
            : MESSAGES.E108key(node.name);
    if (this.isUserImport(binding)) {
      this.importedMutations.push({
        source: binding.importSource!,
        imported: binding.importedName ?? binding.name,
        ...(kind === "method" && method !== undefined ? { method } : {}),
        path,
        message,
        line: loc.line,
        column: loc.column,
      });
      return;
    }
    if (isDataAtom(binding)) this.report("E108", loc, message);
  }

  /**
   * A module-level binding whose initializer hands back the SAME object on
   * every render, so an in-place change of it outlives the rebuild (no E107):
   *
   *   - a `$store(…)`, `$form(…)` or `$query(…)` handle
   *     ({@link CACHED_HANDLE_FACTORIES}) — `cart.items = [item]`,
   *     `signup.values.name = "Ada"`;
   *   - a host object read through a global — `const root =
   *     document.documentElement`, then `root.dataset.theme = "dark"`.
   *
   * Measured on the `.aktion` control in tests/compiler-module-mutation.test.ts.
   * An import is judged by its own module, which this one cannot see, so it
   * never qualifies.
   */
  private survivesRebuild(binding: Binding): boolean {
    const init = binding.init;
    if (binding.kind !== "module" || !init) return false;
    if (init.kind === "Invoke") {
      return (
        init.callee.kind === "StateRef" &&
        CACHED_HANDLE_FACTORIES.has(init.callee.name) &&
        this.isRuntimeName(init.callee.name, binding.scope)
      );
    }
    // `document`, `document.documentElement`, `window["app"]`: a member chain
    // with fixed keys, rooted in a name that no binding declares. The names
    // the runtime injects (`route`, `params`, `theme`, …) are rebuilt with it.
    let root: Expression = init;
    while (root.kind === "Member") {
      if (root.computed && root.computed.kind !== "Literal") return false;
      root = root.object;
    }
    return (
      root.kind === "Identifier" &&
      !RESERVED_INJECTED.has(root.name) &&
      this.resolve(root.name, false, binding.scope) === null
    );
  }

  // ── whole-module rules ──

  /** E105 and E106 — closures copy their scope when they are created. */
  private checkClosures(): void {
    const captures = new Map<Binding, FnInfo[]>();
    for (const ref of this.refs) {
      const binding = ref.binding;
      if (!binding || binding.state || ref.declaring || !LOCAL_KINDS.has(binding.kind)) continue;
      const capture = captureOf(ref.fn, binding.scope.fn);
      if (capture) {
        const list = captures.get(binding) ?? [];
        if (!list.includes(capture)) list.push(capture);
        captures.set(binding, list);
        // E106: the closure was created before the binding existed.
        if (capture.start < binding.ready) this.report("E106", ref.loc, MESSAGES.E106(ref.name));
      } else if (binding.kind === "nested-function" && ref.index < binding.ready) {
        // No hoisting (W2): the nested function does not exist yet.
        this.report("E106", ref.loc, MESSAGES.E106(ref.name));
      }
    }
    for (const ref of this.refs) {
      const binding = ref.binding;
      if (!ref.write || ref.declaring || !binding || binding.state) continue;
      if (!LOCAL_KINDS.has(binding.kind) || binding.kind === "loop") continue;
      const closures = captures.get(binding);
      if (!closures) continue;
      const insideClosure = captureOf(ref.fn, binding.scope.fn) !== null;
      const afterClosure = closures.some((c) => c.start < ref.index);
      const sameLoop = closures.some((c) => commonPrefix(c.loops, ref.loops) > binding.scope.loopDepth);
      if (insideClosure || afterClosure || sameLoop) this.report("E105", ref.loc, MESSAGES.E105(ref.name));
    }
  }

  /** E112 — module-level names the runtime owns. */
  private checkModuleBindings(): void {
    for (const binding of this.moduleScope.plain.values()) {
      const injected = RESERVED_INJECTED.get(binding.name);
      if (injected) {
        // `import { params } from "aktion-runtime/dsl"` names the runtime's own
        // binding — the linker drops the import, so the name resolves at
        // runtime — and is what lets `tsc` see it. Anything else that binds the
        // name is E112; a module that both imports and declares it is E123,
        // which the linker reports.
        if (binding.kind !== "import" || binding.importSource !== DSL_MODULE_ID) {
          this.report("E112", binding.loc, MESSAGES.E112(binding.name, injected));
        }
        continue;
      }
      if (!LIBRARY_COMPONENTS.has(binding.name)) continue;
      if (binding.kind === "function" || binding.kind === "import") continue;
      if (binding.init?.kind === "Lambda") continue;
      this.report("E112", binding.loc, MESSAGES.E112(binding.name, `it is the built-in \`${binding.name}\` component`));
    }
  }

  /** E114 — a derived module-level atom that is also assigned. */
  private checkDerivedAtoms(): void {
    for (const binding of this.moduleScope.state.values()) {
      if (binding.kind !== "module" || !binding.init) continue;
      const dep = derivedDependency(binding.init, binding.name, (name) => this.moduleScope.state.has(name));
      if (!dep) continue;
      const assigned = this.refs.some((r) => r.binding === binding && r.write && !r.declaring);
      if (assigned) this.report("E114", binding.loc, MESSAGES.E114(binding.name, dep));
    }
  }

  /** W202 — a camelCase function that assigns state, called while rendering. */
  private checkRenderWrites(): void {
    for (const { binding, loc } of this.renderCalls) {
      if (binding.scope !== this.moduleScope || isPascalCase(binding.name)) continue;
      const node = binding.decl?.kind === "ActionDeclaration" ? binding.decl : binding.init;
      const fn = node ? this.fnOf.get(node) : undefined;
      const atom = fn?.stateWrites[0];
      if (atom !== undefined) this.report("W202", loc, MESSAGES.W202(binding.name, atom));
    }
  }
}

/** `Object.assign(…)` on the global `Object` (`isFree("Object")`: not shadowed by a binding). */
function isObjectAssign(expr: Expression & { kind: "MethodCall" }, isFree: (name: string) => boolean): boolean {
  return expr.method === "assign" && expr.object.kind === "Identifier" && expr.object.name === "Object" && isFree("Object");
}

function firstField(bindings: ReadonlyArray<DestructuringBinding>): string {
  for (const b of bindings) {
    if (b.rest) continue;
    const key = b.sourceKey ?? b.name;
    if (key) return key;
  }
  return "field";
}

/** A component `return` whose value is plainly not UI (E111). `return null` is fine. */
function returnsPlainValue(expr: Expression): boolean {
  switch (expr.kind) {
    case "Literal":
      return expr.value !== null;
    case "Template":
      return true;
    case "Binary":
      return VALUE_BINARY.has(expr.operator);
    case "Unary":
      return VALUE_UNARY.has(expr.operator);
    default:
      return false;
  }
}

/**
 * Data atoms (E108): a `$x` declared at module level or at the top of a
 * component body whose initializer builds a plain value — a literal, array,
 * object, template or arithmetic — rather than a factory handle such as
 * `$store(…)` / `$http(…)`, whose methods are its API.
 */
function isDataAtom(binding: Binding): boolean {
  if (!binding.state || (binding.kind !== "module" && !binding.instance)) return false;
  return isDataExpression(binding.init);
}

function isDataExpression(expr: Expression | undefined): boolean {
  if (!expr) return false;
  switch (expr.kind) {
    case "Literal":
    case "Array":
    case "Object":
    case "Template":
    case "Binary":
    case "Unary":
      return true;
    case "Ternary":
      return isDataExpression(expr.consequent) || isDataExpression(expr.alternate);
    case "New":
      return expr.callee.kind === "Identifier" && ["Map", "Set", "Array", "Object", "Date"].includes(expr.callee.name);
    default:
      return false;
  }
}

/**
 * The data atoms a module declares (name without `$` → initializer) — what an
 * importer's in-place change must not touch (E108 across modules). Works on any
 * module language: `.aktion` declares atoms with a bare `$x = []`.
 */
export function dataAtomInitializers(program: Program): Map<string, Expression> {
  const out = new Map<string, Expression>();
  const seen = new Set<string>();
  for (const stmt of program.statements) {
    if (stmt.kind !== "Assignment" || !stmt.isState || seen.has(stmt.identifier)) continue;
    seen.add(stmt.identifier);
    if (isDataExpression(stmt.expression)) out.set(stmt.identifier, stmt.expression);
  }
  return out;
}

/**
 * Whether an importer's in-place change of an atom is E108, given the module
 * that exports the atom: it must be a data atom there, and a method call must
 * be one that mutates a value built that way.
 */
export function importedStateMutationApplies(mutation: ImportedStateMutation, exporter: Program): boolean {
  const init = dataAtomInitializers(exporter).get(mutation.imported);
  if (!init) return false;
  if (mutation.method === undefined) return true;
  return mutatesInPlace(mutation.method, mutation.path ? undefined : init);
}

/**
 * The first other atom a module-level atom's initializer reads (E114) —
 * ignoring lambdas (read later, not at initialization) and the arguments of
 * runtime factories (`$http({ url: "/x/" + $id })` is meant to be reactive).
 */
function derivedDependency(expr: Expression, self: string, isAtom: (name: string) => boolean): string | null {
  let found: string | null = null;
  const visit = (e: Expression): void => {
    if (found !== null) return;
    switch (e.kind) {
      case "StateRef":
        if (e.name !== self && isAtom(e.name)) found = e.name;
        return;
      case "Lambda":
        return;
      case "Invoke":
        if (e.callee.kind === "StateRef" && (RUNTIME_STATE_NAMES.has(e.callee.name) || HANDLE_FACTORIES.has(e.callee.name))) {
          return;
        }
        visit(e.callee);
        e.arguments.forEach(visit);
        return;
      default:
        forEachChildExpression(e, visit);
    }
  };
  visit(expr);
  return found;
}

/** The direct child expressions of `expr` (statements inside blocks are not visited). */
function forEachChildExpression(expr: Expression, visit: (e: Expression) => void): void {
  switch (expr.kind) {
    case "Array":
      expr.elements.forEach(visit);
      return;
    case "Object":
      for (const p of expr.properties) {
        if (p.computedKey) visit(p.computedKey);
        visit(p.value);
      }
      return;
    case "Member":
      visit(expr.object);
      if (expr.computed) visit(expr.computed);
      return;
    case "Unary":
    case "Spread":
      visit(expr.argument);
      return;
    case "Binary":
      visit(expr.left);
      visit(expr.right);
      return;
    case "Ternary":
      visit(expr.test);
      visit(expr.consequent);
      visit(expr.alternate);
      return;
    case "Call":
    case "BuiltinCall":
      expr.arguments.forEach(visit);
      return;
    case "MethodCall":
      visit(expr.object);
      expr.arguments.forEach(visit);
      return;
    case "Invoke":
    case "New":
      visit(expr.callee);
      expr.arguments.forEach(visit);
      return;
    case "Template":
      expr.expressions.forEach(visit);
      return;
    default:
      return;
  }
}

/**
 * The render-unstable call a module-level initializer makes (W201), spelled as
 * the author would recognise it — `Date.now()`, `new Date()`, `crypto.randomUUID()`
 * — or `null`. `isFree(name)` says whether `name` is the global (not a binding
 * of the module).
 */
function renderUnstableCall(expr: Expression, isFree: (name: string) => boolean): string | null {
  let found: string | null = null;
  const rootOf = (e: Expression): { name: string; path: string } | null => {
    let path = "";
    let node = e;
    while (node.kind === "Member" && node.property !== undefined) {
      path = `.${node.property}${path}`;
      node = node.object;
    }
    return node.kind === "Identifier" ? { name: node.name, path } : null;
  };
  const visit = (e: Expression): void => {
    if (found !== null || e.kind === "Lambda") return;
    if (e.kind === "MethodCall") {
      if (e.object.kind === "StateRef" && e.object.name === "util" && e.method === "now") {
        found = "$util.now()";
        return;
      }
      const root = rootOf(e.object);
      if (root && isFree(root.name)) {
        const call = `${root.name}${root.path}.${e.method}()`;
        if (root.path === "" && root.name === "Date" && e.method === "now") found = call;
        else if (root.path === "" && root.name === "Math" && e.method === "random") found = call;
        else if (root.path === "" && root.name === "performance" && e.method === "now") found = call;
        else if (root.name === "crypto") found = call;
        if (found !== null) return;
      }
    }
    if (e.kind === "New" && e.callee.kind === "Identifier" && e.callee.name === "Date" && isFree("Date")) {
      found = "new Date()";
      return;
    }
    if (e.kind === "Call" && e.callee === "fetch" && isFree("fetch")) {
      found = "fetch()";
      return;
    }
    forEachChildExpression(e, visit);
  };
  visit(expr);
  return found;
}

// ── E102: `async` (the parser drops the modifier) ───────────────────────

/**
 * Positions of every `async` modifier in `source`. The parser accepts
 * `async function` as a no-op modifier and rejects `async` arrows and
 * function expressions, so neither leaves a trace in the AST; the tokens are
 * the only record. A property named `async` (`{ async: true }`, `o.async`) is
 * not a modifier.
 */
export function findAsyncModifiers(source: string): SourceLocation[] {
  let tokens;
  try {
    tokens = tokenize(source);
  } catch {
    return [];
  }
  const out: SourceLocation[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i]!;
    // A template literal is one token: look inside each `${…}`, whose own
    // text starts two columns after the `$` (later lines keep their columns).
    if (tok.type === "TemplateString") {
      for (const part of tok.parts ?? []) {
        if (part.kind !== "expr") continue;
        for (const loc of findAsyncModifiers(part.source)) {
          out.push({
            line: part.line + loc.line - 1,
            column: loc.line === 1 ? part.column + 2 + (loc.column - 1) : loc.column,
          });
        }
      }
      continue;
    }
    if (tok.type !== "Keyword" || tok.value !== "async") continue;
    let prev: (typeof tokens)[number] | undefined;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (tokens[j]!.type !== "Newline") {
        prev = tokens[j];
        break;
      }
    }
    if (prev && (prev.value === "." || prev.value === "?.")) continue; // `o.async`, `o?.async`
    let next: (typeof tokens)[number] | undefined;
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (tokens[j]!.type !== "Newline") {
        next = tokens[j];
        break;
      }
    }
    if (!next) continue;
    const modifies =
      (next.type === "Keyword" && next.value === "function") ||
      (next.type === "Punctuation" && next.value === "(") ||
      next.type === "Identifier" ||
      next.type === "StateIdentifier";
    if (modifies) out.push({ line: tok.line, column: tok.column });
  }
  return out;
}

// ── Public entry points ────────────────────────────────────────────────

/** Options for {@link checkJavaScriptSemantics}. */
export interface CheckJavaScriptOptions {
  /**
   * The module text the program was parsed from. Needed for E102 (`async`
   * modifiers leave no trace in the AST); without it that rule is skipped,
   * and a `$name(…)` diagnostic assumes nothing sits between the name and
   * its `(`.
   */
  source?: string;
}

/**
 * Check a `.aktion.js` / `.aktion.ts` module for constructs whose Aktion
 * meaning differs from their JavaScript meaning (E101–E127, W201–W202).
 *
 * Run on the program as the author wrote it, after {@link normalizeComponentForms}.
 * Every diagnostic carries `path`, a stable `code` and the author's
 * line/column. Pure — `program` is not modified.
 */
export function checkJavaScriptSemantics(
  program: Program,
  path: string,
  options: CheckJavaScriptOptions = {},
): LinkDiagnostic[] {
  const text = options.source !== undefined ? new SourceText(options.source) : undefined;
  const findings = [...new Analyzer(text).run(program).findings];
  if (options.source !== undefined) {
    for (const loc of findAsyncModifiers(options.source)) {
      findings.push({ code: "E102", severity: "error", message: MESSAGES.E102, loc });
    }
  }
  return toDiagnostics(findings, path);
}

/**
 * The in-place changes a module makes to IMPORTED `$` atoms. Whether each is
 * E108 depends on how the exporting module declares the atom, which only the
 * linker knows — it reports the ones whose exporter declares a data atom
 * (see {@link dataAtomNames}).
 */
export function collectImportedStateMutations(program: Program): ImportedStateMutation[] {
  return new Analyzer().run(program).importedMutations;
}

/** The E102 diagnostic for an `async` modifier at `loc` — used when the module did not parse. */
export function asyncModifierDiagnostic(loc: SourceLocation, path: string): LinkDiagnostic {
  return { severity: "error", message: MESSAGES.E102, line: loc.line, column: loc.column, path, code: "E102" };
}

function toDiagnostics(findings: ReadonlyArray<Finding>, path: string): LinkDiagnostic[] {
  const seen = new Set<string>();
  const out: LinkDiagnostic[] = [];
  const sorted = [...findings].sort(
    (a, b) => a.loc.line - b.loc.line || a.loc.column - b.loc.column || a.code.localeCompare(b.code),
  );
  for (const f of sorted) {
    const key = `${f.code}:${f.loc.line}:${f.loc.column}:${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ severity: f.severity, message: f.message, line: f.loc.line, column: f.loc.column, path, code: f.code });
  }
  return out;
}

/**
 * Lower a checked `.aktion.js` / `.aktion.ts` module so the evaluator computes
 * what JavaScript would:
 *
 *   - **W1** every binding that is not module-level — parameters, `let`/`const`
 *     in functions and nested blocks, loop and `catch` variables — gets a
 *     unique name `__l{n}_{name}`, and every reference resolved to it follows.
 *     Aktion keeps all of a function's locals in one flat map and lets a callee
 *     read its caller's locals, so without this a block's `let x` leaks out
 *     (S1), a local overwrites a module binding (S2), a helper reads its
 *     caller's variable (S3) and a parameter loses to a top-level function of
 *     the same name (S4). `$` names are never renamed (state is keyed by name);
 *     a renamed component parameter keeps its calling-convention name in
 *     `publicName` (R6), and an object-pattern slot pins its `sourceKey`.
 *   - **W2** a function declared inside another becomes
 *     `const __l{n}_name = function (…) {…}` at the same position (S8). Never
 *     hoisted: a lambda copies the locals that exist when it is created, so a
 *     hoisted one would lose every local declared above it.
 *   - **W3** every function body that does not end in `return`/`throw` gets a
 *     bare `return` (without `loc`, so coverage gains no phantom line), so
 *     falling off the end yields `undefined` instead of the last expression
 *     (S24).
 *   - **Positional calls** — every component this module declares is marked
 *     `javascript`, and every call it makes to a user component with an
 *     object-literal argument is marked `positional`. When such a call reaches
 *     a `javascript` component, its arguments bind as JavaScript binds them,
 *     so an object literal (`KVRow({ key: "a", value: "1" })`) is the value of
 *     the parameter at its position instead of a named-props bag that silently
 *     reroutes or drops it. TypeScript types such a call with the component's
 *     plain signature, so this is what the caller's types say. The evaluator
 *     decides by the declaration, not by the import's spelling, so
 *     `"./cards"` and `"./cards.aktion.js"` bind alike. Calls that reach
 *     `.aktion` components, and every call written in a `.aktion` module,
 *     keep the DSL's named props.
 *
 * Mutates and returns `program` (the frontend owns the freshly parsed tree).
 * Run only on a module {@link checkJavaScriptSemantics} accepted.
 */
export function lowerJavaScriptSemantics(program: Program): Program {
  const analysis = new Analyzer().run(program);
  // W1
  let counter = 0;
  for (const binding of analysis.bindings) {
    if (binding.state || !LOCAL_KINDS.has(binding.kind)) continue;
    counter += 1;
    binding.symbol = `__l${counter}_${binding.name}`;
  }
  for (const ref of analysis.refs) {
    const symbol = ref.binding?.symbol;
    if (symbol !== undefined && ref.rename) ref.rename(symbol);
  }
  // Positional calls
  for (const stmt of program.statements) if (stmt.kind === "ComponentDeclaration") stmt.javascript = true;
  for (const call of analysis.positionalCalls) call.positional = true;
  // W2
  liftNestedFunctions(program);
  // W3
  appendImplicitReturns(program);
  return program;
}

/** W2 — nested `function name() {…}` → `const name = function () {…}`, in place. */
function liftNestedFunctions(program: Program): void {
  const lists: Statement[][] = [];
  walk(program, ({ node }) => {
    // `Array.isArray`: only a real block has a statement list — anything else
    // that reaches here with `kind: "Block"` must not crash the module.
    if (node.kind === "Block" && Array.isArray(node.body)) lists.push(node.body as Statement[]);
    else if (node.kind === "SwitchStatement") for (const c of node.cases) lists.push(c.body as Statement[]);
  });
  for (const list of lists) {
    for (let i = 0; i < list.length; i += 1) {
      const stmt = list[i]!;
      if (stmt.kind === "ActionDeclaration") list[i] = nestedFunctionAsLambda(stmt);
    }
  }
}

function nestedFunctionAsLambda(decl: ActionDeclaration): AssignmentStatement {
  const lambda: LambdaExpr = {
    kind: "Lambda",
    params: decl.params.map((p): LambdaParam => {
      const out: LambdaParam = { name: p.name };
      if (p.defaultValue) out.defaultValue = p.defaultValue;
      if (p.rest) out.rest = true;
      if (p.pattern) out.pattern = p.pattern;
      return out;
    }),
    body: decl.body,
    // So coverage and DevTools still call it by the name the author wrote.
    name: decl.name,
  };
  if (decl.loc) lambda.loc = decl.loc;
  const out: AssignmentStatement = {
    kind: "Assignment",
    identifier: decl.name,
    isState: false,
    expression: lambda,
    declaration: "const",
  };
  if (decl.loc) out.loc = decl.loc;
  if (decl.leadingComments) out.leadingComments = decl.leadingComments;
  if (decl.trailingComments) out.trailingComments = decl.trailingComments;
  return out;
}

/** W3 — a bare `return` at the end of every function body (effects excluded: R1 covers them). */
function appendImplicitReturns(program: Program): void {
  const bodies: BlockExpr[] = [];
  walk(program, ({ node }) => {
    if (
      node.kind === "ComponentDeclaration" ||
      node.kind === "ActionDeclaration" ||
      node.kind === "HookDeclaration"
    ) {
      bodies.push(node.body);
    } else if (node.kind === "Lambda" && node.body.kind === "Block") {
      bodies.push(node.body);
    }
  });
  for (const body of bodies) {
    const last = body.body[body.body.length - 1];
    if (last && (last.kind === "Return" || last.kind === "ThrowStatement")) continue;
    (body.body as Statement[]).push({ kind: "Return" });
  }
}
