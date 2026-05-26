/**
 * Evaluator for Aktion programs.
 *
 * The evaluator walks expressions to produce values. Component calls
 * become `ComponentNode` objects that the renderer maps to web components.
 * Expressions that reference `$variables` are wrapped in a `Computation`
 * so that their dependencies can be tracked and re-evaluated when state
 * changes.
 */

import type {
  Expression,
  Program,
  Statement,
  ComponentDeclaration,
  EffectDeclaration,
  ActionDeclaration,
  BlockExpr,
  ObjectProperty,
  SwitchCase,
} from "../parser/types.js";
import type { StateStore } from "./state.js";
import type { HttpRuntime } from "./http.js";
import { createHttpResource } from "./http.js";
import type { I18nRuntime } from "./i18n.js";
import type { ActionDeclRunner } from "./effects.js";
import { dataBuiltins, type ThemeNode } from "./builtins.js";
import { matchRoute, type Router } from "./router.js";
import { findComponent } from "../library/registry.js";
import { findPositionalIndex } from "../library/types.js";
import type { ComponentLibrary } from "../library/types.js";
import { storage as storageGlobal } from "./storage.js";
import { consoleNs as consoleGlobal } from "./console.js";

/**
 * Built-in namespaces injected as top-level identifiers so authors can
 * reach for them without an explicit declaration. Each value is an
 * ordinary object — its public methods become `MethodCall` targets
 * (e.g. `storage.local.get("x")`, `console.warn("…")`).
 */
const GLOBAL_NAMESPACES: Record<string, unknown> = {
  storage: storageGlobal,
  console: consoleGlobal,
};

/**
 * Runtime safety budget — bounds the work a single render can perform
 * so a partial / accidentally-recursive program (e.g. while the user is
 * still typing in the playground) cannot freeze the browser or exhaust
 * the heap.
 *
 * Three independent dimensions are tracked:
 *
 *   - `componentDepth` — current user-component invocation depth.
 *     `function Foo() { return Foo() }` would otherwise recurse until the JS
 *     stack overflows; capping this at ~150 catches the typo in <1ms
 *     and surfaces a friendly error instead of a frozen tab.
 *   - `iterations` — cumulative count of loop body evaluations across
 *     every `for` loop in the current render. Bounded across the
 *     whole render (not per-loop) so a thousand tiny loops still get
 *     caught before they pile up into seconds of work.
 *   - `arrayLengthLimit` — pre-flight cap on `@Range` / `@Repeat`
 *     allocations. A bare `@Range(0, 1e9)` would otherwise call
 *     `Array.push` a billion times and OOM the renderer process.
 *
 * Limits are deliberately generous (anything a real app needs fits
 * easily) but tight enough to abort runaway evaluations in
 * milliseconds. The host element resets the budget at the start of
 * every render so each pass starts fresh.
 */
export interface RuntimeBudget {
  /** Max simultaneous depth of user-component invocations. */
  componentDepthLimit: number;
  /** Max total iterations executed across every loop in a single render. */
  iterationLimit: number;
  /** Max length of any array materialised by `@Range` / `@Repeat`. */
  arrayLengthLimit: number;
  /** Current depth — managed by enter/leave in `evaluateUserComponent`. */
  componentDepth: number;
  /** Iterations consumed so far in the current render. */
  iterations: number;
}

/** Default limits — comfortable for real apps, fatal for runaway typos. */
export const DEFAULT_RUNTIME_BUDGET: Readonly<Omit<RuntimeBudget, "componentDepth" | "iterations">> = {
  componentDepthLimit: 150,
  iterationLimit: 250_000,
  arrayLengthLimit: 100_000,
};

/** Why the runtime aborted. Used by the host to render a friendly banner. */
export type RuntimeBudgetKind = "component-depth" | "iterations" | "array-length";

/**
 * Thrown when the evaluator hits a runtime safety limit. Carries enough
 * detail for the host to surface a parse-error-style message that
 * points the user at the offending construct.
 */
export class RuntimeBudgetError extends Error {
  readonly kind: RuntimeBudgetKind;
  readonly limit: number;
  readonly source: string;
  constructor(kind: RuntimeBudgetKind, limit: number, source: string) {
    super(buildBudgetMessage(kind, limit, source));
    this.name = "RuntimeBudgetError";
    this.kind = kind;
    this.limit = limit;
    this.source = source;
  }
}

function buildBudgetMessage(kind: RuntimeBudgetKind, limit: number, source: string): string {
  switch (kind) {
    case "component-depth":
      return `[aktion] runtime aborted at ${source}: component recursion exceeded ${limit} levels — check for a component that calls itself directly or transitively.`;
    case "iterations":
      return `[aktion] runtime aborted at ${source}: exceeded ${limit} total loop iterations in a single render — narrow the iterable or split the loop.`;
    case "array-length":
      return `[aktion] runtime aborted at ${source}: array length would exceed ${limit} elements.`;
  }
}

/** Create a fresh budget with default (or overridden) limits. */
export function createRuntimeBudget(
  overrides: Partial<Omit<RuntimeBudget, "componentDepth" | "iterations">> = {},
): RuntimeBudget {
  return {
    componentDepthLimit: overrides.componentDepthLimit ?? DEFAULT_RUNTIME_BUDGET.componentDepthLimit,
    iterationLimit: overrides.iterationLimit ?? DEFAULT_RUNTIME_BUDGET.iterationLimit,
    arrayLengthLimit: overrides.arrayLengthLimit ?? DEFAULT_RUNTIME_BUDGET.arrayLengthLimit,
    componentDepth: 0,
    iterations: 0,
  };
}

/**
 * Reset the per-render counters on an existing budget. Limits are
 * preserved; only the running totals (`iterations`, `componentDepth`)
 * are cleared. Called by the host between renders.
 */
export function resetRuntimeBudget(budget: RuntimeBudget): void {
  budget.iterations = 0;
  budget.componentDepth = 0;
}

/** Tick `n` iterations against the budget; throws when the limit is hit. */
function tickIterations(budget: RuntimeBudget | undefined, n: number, source: string): void {
  if (!budget) return;
  budget.iterations += n;
  if (budget.iterations > budget.iterationLimit) {
    throw new RuntimeBudgetError("iterations", budget.iterationLimit, source);
  }
}

/** Assert a planned allocation fits the array-length budget. */
function enforceArrayLength(
  budget: RuntimeBudget | undefined,
  size: number,
  source: string,
): void {
  if (!budget) return;
  if (!Number.isFinite(size) || size > budget.arrayLengthLimit) {
    throw new RuntimeBudgetError("array-length", budget.arrayLengthLimit, source);
  }
}

/**
 * Open a user-component frame against the budget. The caller MUST pair
 * every successful return with a `leaveUserComponent(ctx)` call (use
 * `try { … } finally { leaveUserComponent(ctx) }`).
 *
 * Lives here rather than inside `evaluateUserComponent` because the
 * renderer drives the recursive expansion of nested user components
 * via `renderAt(value, …) → renderUserComponent(…) → evaluateUserComponent`.
 * The depth bracket has to span that whole chain — including the
 * `renderAt` call that recurses — so it can't sit inside
 * `evaluateUserComponent`'s own try/finally (that frame is popped
 * before the recursive call starts).
 */
export function enterUserComponent(ctx: EvaluationContext, name: string): void {
  const budget = ctx.budget;
  if (!budget) return;
  budget.componentDepth += 1;
  if (budget.componentDepth > budget.componentDepthLimit) {
    budget.componentDepth -= 1;
    throw new RuntimeBudgetError(
      "component-depth",
      budget.componentDepthLimit,
      `component "${name}"`,
    );
  }
}

/** Close a user-component frame previously opened by `enterUserComponent`. */
export function leaveUserComponent(ctx: EvaluationContext): void {
  const budget = ctx.budget;
  if (!budget) return;
  if (budget.componentDepth > 0) budget.componentDepth -= 1;
}

export interface ArgMeta {
  /**
   * Name of the `$variable` (or dotted path inside one) carried by this
   * argument. Direct refs (`value: $name`) store the bare atom name;
   * member-access refs (`value: $form.email`, `value: $cart.items[0]`)
   * store a dotted path (`"form.email"`, `"cart.items.0"`) so renderers
   * can wire two-way binding into the right nested slot.
   */
  stateRef?: string;
}

export interface ComponentNode {
  __kind: "Component";
  /** Component name as written in Aktion. */
  name: string;
  /** Positional arguments after evaluation. */
  args: unknown[];
  /** Per-position metadata (state ref binding, etc.). */
  argMeta: ArgMeta[];
  /**
   * Explicit `key:` override for content-addressed identity (§13). When
   * present, the renderer uses this value as the suffix of the instance
   * path instead of the source location — so reordering siblings keeps
   * per-instance state attached to the right node.
   */
  explicitKey?: unknown;
  /** Original AST for debugging/introspection. */
  source?: { line: number; column: number };
}

export const isComponentNode = (value: unknown): value is ComponentNode => {
  return Boolean(
    value && typeof value === "object" &&
    (value as { __kind?: unknown }).__kind === "Component",
  );
};

/**
 * Lazy node produced when a user-declared `function Foo(p) { return ... }` is
 * called. The renderer expands these per-instance: each instance gets its
 * own state-alias scope so two `Counter()` calls hold independent `$state`
 * atoms (§7 — per-instance reactivity).
 *
 * The evaluator captures the call arguments + named slots eagerly; the
 * body itself is evaluated at render-time once the instance key is known.
 */
export interface UserComponentNode {
  __kind: "UserComponent";
  decl: ComponentDeclaration;
  /** Positional argument values (already evaluated). */
  positional: unknown[];
  /** Named argument values (already evaluated), keyed by param/slot name. */
  named: Record<string, unknown>;
  /** Optional `key:` override the caller passed for stable instance identity. */
  explicitKey?: unknown;
  source?: { line: number; column: number };
}

export const isUserComponentNode = (value: unknown): value is UserComponentNode => {
  return Boolean(
    value && typeof value === "object" &&
    (value as { __kind?: unknown }).__kind === "UserComponent",
  );
};

/**
 * An `effect(() => { … }, [deps])` declaration discovered inside a `function` component
 * body, paired with the per-instance state-alias stack captured at the
 * moment the body was walked. The runner restores those aliases before
 * running the body so `$count = …` lands on the same instance slot the
 * component itself uses, even though the alias frame is no longer on
 * `ctx.stateAliases` by the time the effect fires.
 */
export interface ScopedEffectDecl {
  decl: EffectDeclaration;
  /**
   * Cloned alias frames in stack order (bottom → top). `[]` for effects
   * declared at the program top level, where no per-instance frame applies.
   */
  capturedAliases: ReadonlyArray<ReadonlyMap<string, string>>;
  /**
   * Snapshot of `ctx.loopVars` at the moment the declaration was
   * collected (component parameters, slots, and any outer `for`-loop
   * variables in scope). Restored onto `ctx.loopVars` before the effect
   * body runs so an effect declared inside
   * `function Item(todo) { effect(() => { use(todo) }, [$x]) }` keeps seeing
   * its `todo` parameter even after the body has returned and the
   * runtime cleared the loop var. Without it `todo` resolves to
   * `undefined` because the param binding only lives for the duration
   * of `evaluateUserComponent`.
   *
   * Refreshed on every re-render via `EffectRunner.syncInstanceEffects`
   * so the effect always observes the latest prop values rather than
   * the ones captured at first mount.
   */
  capturedLoopVars: ReadonlyMap<string, unknown>;
}

export interface EvaluationContext {
  state: StateStore;
  /** Per-program scope for non-state assignments (refs to other lines). */
  bindings: Map<string, () => unknown>;
  /** Raw AST expressions for each top-level identifier. */
  expressions: Map<string, Expression>;
  /** Set of $variable names accessed during the current evaluation. */
  trackedState: Set<string>;
  /**
   * Inline loop variables for expression `for` / `match`, router param
   * bindings, lambda parameters, and component declaration parameters.
   */
  loopVars: Map<string, unknown>;
  /**
   * Per-instance state alias scope (§7). When a user-declared component
   * body declares `$state n = 0`, the renderer pushes an alias frame so
   * that the StateRef `n` reads/writes the per-instance key (e.g.
   * `Counter@1:5#0:n`) rather than a shared global atom. The lookup walks
   * from the top of the stack down — outer frames are still visible when
   * not overridden.
   */
  stateAliases: Array<Map<string, string>>;
  /** Optional router — exposed to the runtime for `route.path` / `params`. */
  router?: Router;
  /** Component library used to resolve trailing named-arg object literals. */
  library?: ComponentLibrary;
  /** Component declarations (`function Foo() { return ... }` — PascalCase). */
  componentDecls: Map<string, ComponentDeclaration>;
  /** Effect declarations (`effect(() => { ... }, [deps])`), keyed by auto-generated name. */
  effectDecls: Map<string, EffectDeclaration>;
  /**
   * Stack of per-component-invocation effect collection frames.
   *
   * When this stack is non-empty, an `EffectDeclaration` encountered while
   * walking a block body is appended to the top frame instead of being
   * registered globally on `effectDecls`. The renderer drains the frame
   * immediately after `evaluateUserComponent` returns so it can mount the
   * declarations on a per-instance scope (instead of globally, once per
   * program).
   *
   * Each entry pairs the declaration with a snapshot of `stateAliases` at
   * the moment the body was walked, so `$x = …` writes inside the effect
   * body resolve through the per-instance alias frame even after the
   * component body has returned and the alias frame has been popped.
   */
  componentEffectStack: ScopedEffectDecl[][];
  /** Action declarations (`function foo() { ... }` — camelCase). */
  actionDecls: Map<string, ActionDeclaration>;
  /** HTTP runtime (`http({...})` calls + interceptor configuration). */
  http?: HttpRuntime;
  /** Aktion 0.5 i18n runtime (`$i18n = i18n({...})` declaration + `t()` builtin). */
  i18n?: I18nRuntime;
  /** Action runner for function declarations. */
  actionRunner?: ActionDeclRunner;
  /** Notify the host that something changed and a re-render is needed. */
  notify?: () => void;
  /** Dispatch a custom event from an `emit("name", detail)` call. */
  onEmit?: (eventName: string, detail: unknown) => void;
  /**
   * Cleanup callbacks attached to this context. Populated during
   * `planProgram` for resources that outlive a single evaluation pass —
   * notably the state-store subscription that re-derives computed
   * `$state = expr` atoms when their dependencies change. The host
   * (`element.replan()`) drains this array via `disposeContext` before
   * creating a fresh context so subscribers don't leak across replans.
   */
  disposers: Array<() => void>;
  /**
   * Runtime safety budget — bounds component recursion depth, loop
   * iterations, and array allocations so a partial/recursive program
   * (typed live in the playground, mid-stream LLM token, …) cannot
   * freeze the browser. The host resets it between renders; tests
   * inherit the defaults and never bother because realistic test
   * programs are orders of magnitude under the limits. Set to
   * `undefined` (via `createContext({ budget: null })`) to disable
   * enforcement entirely — only do this in trusted offline pipelines.
   */
  budget?: RuntimeBudget;
}

/**
 * Optional injectables for `createContext` — the host element passes its
 * runtime singletons (HTTP, i18n, action runner) so endpoint use sites and
 * action calls can resolve against them.
 */
export interface CreateContextOptions {
  router?: Router;
  library?: ComponentLibrary;
  http?: HttpRuntime;
  i18n?: I18nRuntime;
  actionRunner?: ActionDeclRunner;
  notify?: () => void;
  onEmit?: (eventName: string, detail: unknown) => void;
  /**
   * Runtime safety budget for this context.
   *   - omitted (default): a fresh budget with `DEFAULT_RUNTIME_BUDGET` limits.
   *   - explicit `RuntimeBudget`: caller-supplied limits (e.g. higher caps for
   *     server-side batch renders that don't need browser-tab safety).
   *   - `null`: disable enforcement entirely.
   */
  budget?: RuntimeBudget | null;
}

/**
 * Build a top-level evaluation context for a freshly parsed program.
 */
export function createContext(
  state: StateStore,
  options: CreateContextOptions = {},
): EvaluationContext {
  return {
    state,
    bindings: new Map(),
    expressions: new Map(),
    trackedState: new Set(),
    loopVars: new Map(),
    stateAliases: [],
    router: options.router,
    library: options.library,
    componentDecls: new Map(),
    effectDecls: new Map(),
    componentEffectStack: [],
    actionDecls: new Map(),
    http: options.http,
    i18n: options.i18n,
    actionRunner: options.actionRunner,
    notify: options.notify,
    onEmit: options.onEmit,
    disposers: [],
    budget: options.budget === null ? undefined : (options.budget ?? createRuntimeBudget()),
  };
}

/**
 * Drain every cleanup callback attached to `ctx.disposers`. Safe to call
 * multiple times — each callback is invoked at most once even if it
 * throws (the array is cleared up-front so a faulty disposer can't
 * prevent siblings from running).
 */
export function disposeContext(ctx: EvaluationContext): void {
  const disposers = ctx.disposers;
  ctx.disposers = [];
  for (const dispose of disposers) {
    try {
      dispose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[aktion] context disposer threw", err);
    }
  }
}

/**
 * Resolve a `$name` reference through the active per-instance alias
 * stack. Returns the topmost binding or `name` itself when no alias is
 * present. Exported so the action / effect runners can resolve writes
 * the same way the evaluator resolves reads.
 */
export function resolveStateAlias(ctx: EvaluationContext, name: string): string {
  for (let i = ctx.stateAliases.length - 1; i >= 0; i -= 1) {
    const frame = ctx.stateAliases[i]!;
    const aliased = frame.get(name);
    if (aliased !== undefined) return aliased;
  }
  return name;
}

/**
 * Walk a chain of `Member` expressions rooted at a `StateRef` and return
 * the alias-resolved root atom name plus the trailing dotted path. Used
 * by two-way-binding extraction (`value: $form.email`) and by the
 * synthetic-assign runner (`() => $form.email = …`).
 *
 * Returns `null` for any expression whose root is not a `$variable`
 * (e.g. `loopVar.field`, `someBinding.x`). Bracket-access segments are
 * supported when the key is a literal — `$cart.items[0]` resolves to
 * path `["items", "0"]`. Optional chaining (`?.`) is treated as a
 * regular member step for binding purposes; the renderer's getter still
 * short-circuits at runtime if the chain is null.
 */
export function extractStatePath(
  expr: Expression,
  ctx: EvaluationContext,
): { name: string; path: string[] } | null {
  const segments: string[] = [];
  let cursor: Expression = expr;
  while (cursor.kind === "Member") {
    if (cursor.computed) {
      // Only literal keys are addressable for binding — dynamic ones
      // ($obj[$key]) can't be encoded into a stable dotted path.
      if (cursor.computed.kind !== "Literal") return null;
      const key = cursor.computed.value;
      if (typeof key !== "string" && typeof key !== "number") return null;
      segments.unshift(String(key));
    } else if (cursor.property) {
      segments.unshift(cursor.property);
    } else {
      return null;
    }
    cursor = cursor.object;
  }
  if (cursor.kind !== "StateRef") return null;
  return { name: resolveStateAlias(ctx, cursor.name), path: segments };
}

/**
 * Build the dotted argMeta encoding (`"form.email"`) from an expression
 * that is either a bare `StateRef` or a `Member` chain rooted at one.
 * Returns `null` when the expression isn't a state-rooted reference.
 */
function stateRefForArg(
  expr: Expression,
  ctx: EvaluationContext,
): string | null {
  if (expr.kind === "StateRef") return resolveStateAlias(ctx, expr.name);
  if (expr.kind === "Member") {
    const extracted = extractStatePath(expr, ctx);
    if (!extracted) return null;
    return extracted.path.length === 0
      ? extracted.name
      : `${extracted.name}.${extracted.path.join(".")}`;
  }
  return null;
}

/**
 * Plan a program: declare state variables, register HTTP endpoints, and
 * build lazy bindings for every assignment so forward references resolve.
 */
export function planProgram(program: Program, ctx: EvaluationContext): void {
  // First pass: declare state defaults so `$vars` resolve immediately.
  // Every `$x = expr` declares a single-tier reactive atom; the initial
  // value is computed via best-effort literal evaluation so partial
  // streams don't need a full context yet.
  for (const stmt of program.statements) {
    if (stmt.kind === "Assignment" && stmt.isState) {
      const initial = evaluateLiteral(stmt.expression);
      ctx.state.declare(stmt.identifier, initial);
    }
  }
  // 1.25 pass: state declarations whose RHS is a `http({...})` call need
  // their resource bag created eagerly so the request fires at program
  // mount. We re-run those initializers through the full evaluator now
  // that every state slot has at least a literal default.
  for (const stmt of program.statements) {
    if (stmt.kind !== "Assignment" || !stmt.isState) continue;
    if (stmt.expression.kind !== "Call") continue;
    if (stmt.expression.callee !== "http") continue;
    const value = evaluate(stmt.expression, ctx);
    ctx.state.set(stmt.identifier, value);
  }

  // 1.5 pass: resolve `Http({...})` / `i18n({...})` setup helpers so any
  // subsequent http() calls observe the configured defaults.
  for (const stmt of program.statements) {
    if (stmt.kind !== "Assignment") continue;
    const expr = stmt.expression;
    if (expr.kind !== "Call") continue;
    if ((stmt.identifier === "http" || stmt.identifier === "$http") && expr.callee === "Http") {
      evaluate(expr, ctx);
      continue;
    }
    if ((stmt.identifier === "i18n" || stmt.identifier === "$i18n") && expr.callee === "i18n") {
      evaluate(expr, ctx);
      continue;
    }
  }

  // Second pass: install bindings for components, helpers, actions,
  // effects, and any other non-state declarations.
  //
  // We do this *before* the computed-state pass so a derivation like
  // `$hello = greet("Ada")` (where `greet` is a top-level lambda) or
  // `$result = MyAction(…)` resolves the forward reference correctly
  // — bindings and action declarations are registered lazily, so it's
  // cheap to install them up-front, and doing so removes a streaming
  // ordering hazard that would otherwise leave `$hello` stuck on `null`
  // if `greet` happened to be declared later in source order.
  for (const stmt of program.statements) {
    installStatementBinding(stmt, ctx);
  }

  // 1.75 pass: computed `$state = expr` atoms whose RHS is *not* a pure
  // literal. The literal pass above seeded these slots with `null`
  // because `evaluateLiteral` is intentionally conservative; without
  // this follow-up pass the user-visible value would stay `null` for
  // every program that uses derived state (`$total = @Sum($cart.price)`,
  // `$subtotal = @Sum($lines)`, `$shipping = if … else …`, …) — exactly
  // the pattern the language spec advertises as "computed values".
  //
  // We also wire each derivation up to the state store so the value
  // re-derives reactively whenever any of the `$variables` it reads
  // changes. The dependency set is recaptured on every recompute so
  // expressions that take conditional branches (`$x = if $on { $a } else { $b }`)
  // stay correct after the branch condition flips.
  installComputedStateDerivations(program, ctx);
}

/**
 * Bookkeeping for one `$state = expr` declaration whose RHS is computed
 * (i.e. *not* a pure literal value). Each entry knows which $variables
 * the most recent evaluation read so the re-derivation subscriber can
 * check overlap with the changed-name set without re-walking the AST.
 */
interface ComputedDerivation {
  name: string;
  expr: Expression;
  deps: Set<string>;
}

/** Maximum depth limit for cascade resolution within a single flush. */
const COMPUTED_DERIVATION_MAX_DEPTH = 8;

function installComputedStateDerivations(
  program: Program,
  ctx: EvaluationContext,
): void {
  const computed: ComputedDerivation[] = [];

  const recompute = (entry: ComputedDerivation): void => {
    const tracker = new Set<string>();
    const previousTracker = ctx.trackedState;
    ctx.trackedState = tracker;
    try {
      const value = evaluate(entry.expr, ctx);
      ctx.state.set(entry.name, value);
    } finally {
      ctx.trackedState = previousTracker;
    }
    entry.deps = tracker;
  };

  for (const stmt of program.statements) {
    if (stmt.kind !== "Assignment" || !stmt.isState) continue;
    if (isPureLiteralExpression(stmt.expression)) continue;
    if (isHttpResourceCall(stmt.expression)) continue; // already handled in 1.25 pass
    if (isRuntimeSetupCall(stmt.identifier, stmt.expression)) continue; // Http()/i18n()

    const entry: ComputedDerivation = {
      name: stmt.identifier,
      expr: stmt.expression,
      deps: new Set(),
    };
    computed.push(entry);
    recompute(entry);
  }

  if (computed.length === 0) return;

  // Cascade-aware re-derivation. When a dependency of any derivation
  // changes, recompute every dependent derivation in declaration order.
  // If a recompute itself produces a fresh value we widen the changed
  // set and run another pass — this lets `$a → $b → $c` chains settle
  // synchronously inside a single flush instead of leaking stale values
  // through to the renderer for one extra frame.
  let recomputing = false;
  const unsubscribe = ctx.state.subscribe((changed) => {
    if (recomputing) return;
    recomputing = true;
    try {
      const propagated = new Set<string>(changed);
      for (let depth = 0; depth < COMPUTED_DERIVATION_MAX_DEPTH; depth += 1) {
        let progressed = false;
        for (const entry of computed) {
          let needs = false;
          for (const dep of entry.deps) {
            if (propagated.has(dep)) {
              needs = true;
              break;
            }
          }
          if (!needs) continue;
          const before = ctx.state.get(entry.name);
          recompute(entry);
          if (ctx.state.get(entry.name) !== before) {
            propagated.add(entry.name);
            progressed = true;
          }
        }
        if (!progressed) break;
      }
    } finally {
      recomputing = false;
    }
  });

  ctx.disposers.push(unsubscribe);
}

/**
 * `true` when `expr` evaluates to the same value regardless of context —
 * literals, arrays of pure values, objects of pure values, and template
 * strings without interpolation. These don't need a re-evaluation pass
 * because the literal-default seed already produced their final value.
 */
function isPureLiteralExpression(expr: Expression): boolean {
  switch (expr.kind) {
    case "Literal":
      return true;
    case "Array":
      return expr.elements.every(
        (el) => el.kind !== "Spread" && isPureLiteralExpression(el),
      );
    case "Object":
      return expr.properties.every(
        (prop) => !prop.spread && isPureLiteralExpression(prop.value),
      );
    case "Template":
      return expr.expressions.length === 0;
    default:
      return false;
  }
}

/** `true` for `http({...})` resource declarations (handled in 1.25 pass). */
function isHttpResourceCall(expr: Expression): boolean {
  return expr.kind === "Call" && expr.callee === "http";
}

/** `true` for `$http = Http({...})` / `$i18n = i18n({...})` setups (handled in 1.5 pass). */
function isRuntimeSetupCall(identifier: string, expr: Expression): boolean {
  if (expr.kind !== "Call") return false;
  if (expr.callee === "Http" && (identifier === "http" || identifier === "$http")) {
    return true;
  }
  if (expr.callee === "i18n" && (identifier === "i18n" || identifier === "$i18n")) {
    return true;
  }
  return false;
}

function installStatementBinding(stmt: Statement, ctx: EvaluationContext): void {
  switch (stmt.kind) {
    case "ComponentDeclaration":
      ctx.componentDecls.set(stmt.name, stmt);
      return;
    case "EffectDeclaration":
      ctx.effectDecls.set(stmt.name, stmt);
      return;
    case "ActionDeclaration":
      ctx.actionDecls.set(stmt.name, stmt);
      return;
    case "Await":
    case "Return":
    case "ExpressionStatement":
      return;
    case "Assignment": {
      if (stmt.isState) return;
      ctx.expressions.set(stmt.identifier, stmt.expression);
      const expr = stmt.expression;
      ctx.bindings.set(stmt.identifier, () => evaluate(expr, ctx));
      return;
    }
  }
}

/**
 * Evaluate a `Router({ "/": Home(), "/users/:id": User(params), default: NotFound() })`
 * call. The argument MUST be an object literal whose keys are route patterns
 * (string literals) or the `default` keyword (wildcard fallback). Values are
 * arbitrary expressions, evaluated lazily — only the matching arm runs, and
 * `params` is bound as a loop variable inside that body so authors can read
 * captured path segments (`:id`, `*` → `params._`).
 *
 * The return value is the matched arm's evaluated expression, or `null` when
 * no arm matches and no `default` is provided. The host's `Router` instance
 * is informed via `setActiveMatch(...)` so `NavLink` can highlight the
 * currently-active route.
 */
function evaluateRouterCall(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const arg = args[0];
  if (!arg || arg.kind !== "Object") {
    // eslint-disable-next-line no-console
    console.error(
      `[aktion] Router expects an object literal of route arms (e.g. \`Router({ "/": Home(), default: NotFound() })\`).`,
      loc,
    );
    ctx.router?.setActiveMatch(null, {});
    return null;
  }
  const path = readRoutePath(ctx);
  let wildcardArm: ObjectProperty | null = null;
  for (const prop of arg.properties) {
    if (prop.spread) continue;
    const pattern = prop.key;
    if (pattern === "default" || pattern === "*") {
      // Hold the wildcard until every concrete pattern has failed.
      wildcardArm = prop;
      continue;
    }
    const result = matchRoute(pattern, path);
    if (!result.matched) continue;
    return runRouterArm(pattern, prop.value, result.params, ctx);
  }
  if (wildcardArm) {
    return runRouterArm(null, wildcardArm.value, {}, ctx);
  }
  ctx.router?.setActiveMatch(null, {});
  return null;
}

function runRouterArm(
  pattern: string | null,
  body: Expression,
  params: Record<string, string>,
  ctx: EvaluationContext,
): unknown {
  const prev = ctx.loopVars.get("params");
  const had = ctx.loopVars.has("params");
  ctx.loopVars.set("params", params);
  try {
    const value = evaluate(body, ctx);
    ctx.router?.setActiveMatch(pattern, params);
    return value;
  } finally {
    if (had) ctx.loopVars.set("params", prev);
    else ctx.loopVars.delete("params");
  }
}

/**
 * Best-effort evaluation of literal-only expressions used for $variable
 * defaults. Falls back to `null` for expressions that need a full context
 * — we keep the binding present so `$foo` returns a typed value (null)
 * instead of `undefined`, which would surface in concatenations as the
 * string "undefined".
 */
function evaluateLiteral(expr: Expression): unknown {
  switch (expr.kind) {
    case "Literal": return expr.value;
    case "Array": {
      const out: unknown[] = [];
      for (const e of expr.elements) {
        if (e.kind === "Spread") continue;
        out.push(evaluateLiteral(e));
      }
      return out;
    }
    case "Object": {
      const obj: Record<string, unknown> = {};
      for (const prop of expr.properties) {
        if (prop.spread) continue;
        obj[prop.key] = evaluateLiteral(prop.value);
      }
      return obj;
    }
    case "Template": {
      if (expr.expressions.length === 0) return expr.quasis[0] ?? "";
      return null;
    }
    default: return null;
  }
}

export function evaluate(expr: Expression, ctx: EvaluationContext): unknown {
  switch (expr.kind) {
    case "Literal": return expr.value;
    case "Identifier": {
      if (ctx.loopVars.has(expr.name)) return ctx.loopVars.get(expr.name);
      // `route` is the canonical handle for the router's reactive
      // surface. Reading it subscribes to the internal `route` state slot
      // so the renderer re-runs when the URL hash changes, and the
      // returned object exposes `path`, `params`, `pattern`, `query`,
      // plus an imperative `navigate(path)` method that delegates to the
      // host router.
      if (expr.name === "route") {
        ctx.trackedState.add("route");
        return ctx.router ? buildRouteState(ctx.router) : { path: "/", params: {}, pattern: null, query: {}, navigate() {}, toString() { return "/"; } };
      }
      const binding = ctx.bindings.get(expr.name);
      if (binding) return binding();
      // A bare `myAction` reference (e.g. `Button("Save", save)`) resolves
      // to a callable wrapping the action runner. Without this branch the
      // identifier returns null and the click silently no-ops.
      const action = ctx.actionDecls.get(expr.name);
      if (action) return makeActionCallable(action, ctx);
      // Built-in namespace globals (`storage`, `console`). Returned as
      // ordinary objects so member/method-call expressions resolve
      // against them directly via the standard `memberAccess` path.
      if (Object.prototype.hasOwnProperty.call(GLOBAL_NAMESPACES, expr.name)) {
        return GLOBAL_NAMESPACES[expr.name];
      }
      // Unknown identifier — render as null so the parser is forgiving.
      return null;
    }
    case "StateRef": {
      // Resolve through the per-instance alias stack so `$n` inside a
      // component body picks the right per-instance slot.
      const resolved = resolveStateAlias(ctx, expr.name);
      ctx.trackedState.add(resolved);
      return ctx.state.get(resolved);
    }
    case "Array": {
      const out: unknown[] = [];
      for (const element of expr.elements) {
        if (element.kind === "Spread") {
          const value = evaluate(element.argument, ctx);
          if (Array.isArray(value)) {
            for (const item of value) out.push(item);
          } else if (value != null) {
            // Mirror JS spread on iterables — strings spread into their
            // characters. Objects without an iterator are ignored to keep
            // LLM mistakes from blowing up the render.
            if (typeof value === "string") for (const ch of value) out.push(ch);
          }
          continue;
        }
        out.push(evaluate(element, ctx));
      }
      return out;
    }
    case "Object": {
      const obj: Record<string, unknown> = {};
      for (const prop of expr.properties) {
        if (prop.spread) {
          const value = evaluate(prop.value, ctx);
          if (value && typeof value === "object" && !Array.isArray(value)) {
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
              obj[k] = v;
            }
          }
          continue;
        }
        obj[prop.key] = evaluate(prop.value, ctx);
      }
      return obj;
    }
    case "Member": {
      const target = evaluate(expr.object, ctx);
      if (expr.optional && target == null) return undefined;
      if (expr.computed) {
        const key = evaluate(expr.computed, ctx);
        return computedMemberAccess(target, key);
      }
      return memberAccess(target, expr.property ?? "");
    }
    case "Unary": {
      const value = evaluate(expr.argument, ctx);
      return expr.operator === "!" ? !value : -toNumber(value);
    }
    case "Binary": return evaluateBinary(expr.operator, expr.left, expr.right, ctx);
    case "Ternary": {
      const test = evaluate(expr.test, ctx);
      return test ? evaluate(expr.consequent, ctx) : evaluate(expr.alternate, ctx);
    }
    case "Call": return evaluateComponentCall(expr.callee, expr.arguments, ctx, expr.loc);
    case "MethodCall": return evaluateMethodCall(expr, ctx);
    case "BuiltinCall": return evaluateBuiltinCall(expr.name, expr.arguments, ctx);
    case "Template": return evaluateTemplate(expr.quasis, expr.expressions, ctx);
    case "Spread": {
      // A bare spread outside of an array/object literal collapses to its
      // argument value. The array/object evaluators handle the spread
      // semantics, so we only reach here for malformed input.
      return evaluate(expr.argument, ctx);
    }
    case "If": return evaluateIf(expr, ctx);
    case "Switch": return evaluateSwitch(expr, ctx);
    case "For": return evaluateFor(expr, ctx);
    case "Block": return evaluateBlock(expr, ctx, {});
    case "Lambda": {
      // Lambdas evaluate to a callable JS function. We capture the current
      // context AND a snapshot of the active per-instance state-alias
      // stack so that closures created inside a `component` body still
      // resolve `$n` to the right per-instance slot when invoked later
      // (the render pass that built them already popped the alias frame).
      const lambdaParams = expr.params;
      const lambdaBody = expr.body;
      const capturedAliases: Array<Map<string, string>> = ctx.stateAliases.map(
        (frame) => new Map(frame),
      );
      // Also capture the loopVars present at lambda-creation time so a
      // handler emitted inside `for item in items { Button(item.name, () => del(item.id)) }`
      // can read `item` at click time even though the loop variable is
      // long gone by then.
      const capturedLoopVars = new Map(ctx.loopVars);
      return (...callArgs: unknown[]) => {
        const restoreLoopVars = new Map(ctx.loopVars);
        const restoreAliases = ctx.stateAliases.slice();
        // Restore the captured loop vars + alias frames for the body.
        ctx.loopVars.clear();
        for (const [k, v] of capturedLoopVars) ctx.loopVars.set(k, v);
        ctx.stateAliases.length = 0;
        for (const frame of capturedAliases) ctx.stateAliases.push(frame);

        const restore: Array<{ name: string; had: boolean; prev: unknown }> = [];
        for (let i = 0; i < lambdaParams.length; i += 1) {
          const param = lambdaParams[i]!;
          let value: unknown = callArgs[i];
          if (value === undefined && param.defaultValue) {
            value = evaluate(param.defaultValue, ctx);
          }
          restore.push({
            name: param.name,
            had: ctx.loopVars.has(param.name),
            prev: ctx.loopVars.get(param.name),
          });
          ctx.loopVars.set(param.name, value);
        }
        try {
          return evaluate(lambdaBody, ctx);
        } finally {
          for (const slot of restore) {
            if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
            else ctx.loopVars.delete(slot.name);
          }
          // Fully restore the caller's scope — drop our temporary
          // captured-frame substitution and put back whatever was there.
          ctx.loopVars.clear();
          for (const [k, v] of restoreLoopVars) ctx.loopVars.set(k, v);
          ctx.stateAliases.length = 0;
          for (const frame of restoreAliases) ctx.stateAliases.push(frame);
        }
      };
    }
    default: return null;
  }
}

function evaluateIf(expr: { test: Expression; consequent: BlockExpr; alternate?: Expression | BlockExpr }, ctx: EvaluationContext): unknown {
  if (evaluate(expr.test, ctx)) {
    return evaluateBlock(expr.consequent, ctx, {});
  }
  if (expr.alternate) {
    if ((expr.alternate as { kind?: string }).kind === "Block") {
      return evaluateBlock(expr.alternate as BlockExpr, ctx, {});
    }
    return evaluate(expr.alternate as Expression, ctx);
  }
  return null;
}

function evaluateSwitch(
  expr: { discriminant: Expression; cases: ReadonlyArray<SwitchCase> },
  ctx: EvaluationContext,
): unknown {
  const value = evaluate(expr.discriminant, ctx);
  for (const c of expr.cases) {
    if (c.test === null) {
      return evaluateSwitchBody(c.body, ctx);
    }
    const patternValue = evaluate(c.test, ctx);
    if (patternValue === value) {
      return evaluateSwitchBody(c.body, ctx);
    }
  }
  return null;
}

function evaluateSwitchBody(
  body: ReadonlyArray<Statement>,
  ctx: EvaluationContext,
): unknown {
  let result: unknown = null;
  for (const stmt of body) {
    if (stmt.kind === "ExpressionStatement") {
      result = evaluate(stmt.expression, ctx);
    } else if (stmt.kind === "Assignment") {
      const value = evaluate(stmt.expression, ctx);
      if (stmt.isState) {
        const target = resolveStateAlias(ctx, stmt.identifier);
        ctx.state.set(target, value);
      } else {
        ctx.loopVars.set(stmt.identifier, value);
      }
      result = value;
    } else if (stmt.kind === "Return") {
      return stmt.argument ? evaluate(stmt.argument, ctx) : undefined;
    }
  }
  return result;
}

function evaluateFor(
  expr: {
    item: string;
    index?: string;
    destructure?: ReadonlyArray<string>;
    iterable: Expression;
    body: BlockExpr;
  },
  ctx: EvaluationContext,
): unknown {
  const iterableValue = evaluate(expr.iterable, ctx);
  if (!Array.isArray(iterableValue)) return [];
  const out: unknown[] = [];
  const itemHad = ctx.loopVars.has(expr.item);
  const itemPrev = ctx.loopVars.get(expr.item);
  const idxName = expr.index;
  const idxHad = idxName ? ctx.loopVars.has(idxName) : false;
  const idxPrev = idxName ? ctx.loopVars.get(idxName) : undefined;
  const destructure = expr.destructure ?? [];
  const destructurePrev: Array<{ name: string; had: boolean; value: unknown }> =
    destructure.map((name) => ({
      name,
      had: ctx.loopVars.has(name),
      value: ctx.loopVars.get(name),
    }));
  try {
    for (let i = 0; i < iterableValue.length; i += 1) {
      tickIterations(ctx.budget, 1, "`for` expression");
      const row = iterableValue[i];
      ctx.loopVars.set(expr.item, row);
      if (idxName) ctx.loopVars.set(idxName, i);
      for (const field of destructure) {
        const value = row && typeof row === "object"
          ? (row as Record<string, unknown>)[field]
          : undefined;
        ctx.loopVars.set(field, value);
      }
      out.push(evaluateBlock(expr.body, ctx, {}));
    }
  } finally {
    if (itemHad) ctx.loopVars.set(expr.item, itemPrev);
    else ctx.loopVars.delete(expr.item);
    if (idxName) {
      if (idxHad) ctx.loopVars.set(idxName, idxPrev);
      else ctx.loopVars.delete(idxName);
    }
    for (const entry of destructurePrev) {
      if (entry.had) ctx.loopVars.set(entry.name, entry.value);
      else ctx.loopVars.delete(entry.name);
    }
  }
  return out;
}

/**
 * Options that change how `evaluateBlock` interprets specific statement
 * kinds inside the body. The defaults match the legacy "generic block"
 * semantics — `$x = expr` writes to state, etc. — and only the direct
 * call site from `evaluateUserComponent` opts into the per-instance
 * declaration semantics.
 */
interface BlockEvalOptions {
  /**
   * When `true`, `$x = expr` at the top level of this block is treated
   * as a **per-instance state declaration**: the initializer runs once
   * (on first invocation, when the alias slot is still empty) and is
   * skipped on every subsequent re-render so user mutations persist.
   *
   * Nested blocks (lambda bodies, `if` arms, `for` bodies, …) are
   * unaffected — they evaluate without this flag so `$x = newValue`
   * keeps working as a regular state write.
   */
  stateAsDeclaration?: boolean;
}

/**
 * Evaluate a block: run every declaration / statement sequentially and
 * return the value of the last expression statement (last-expression-wins
 * per §3.5 of the spec). Statements that don't produce a value (state
 * declarations, effect declarations, helper bindings, …) are still
 * executed for their side-effects on `ctx`.
 */
function evaluateBlock(
  block: BlockExpr,
  ctx: EvaluationContext,
  options: BlockEvalOptions,
): unknown {
  let result: unknown = null;
  // Clone-restore tracking for any block-local bindings that shadow outer
  // names (component params, $state declarations, etc.). We only restore
  // names introduced by THIS block.
  const introduced: string[] = [];
  for (const stmt of block.body) {
    switch (stmt.kind) {
      case "ExpressionStatement":
        result = evaluate(stmt.expression, ctx);
        continue;
      case "Assignment": {
        if (stmt.isState && stmt.identifier) {
          const target = resolveStateAlias(ctx, stmt.identifier);
          if (options.stateAsDeclaration) {
            // Per-instance state declaration — semantically equivalent
            // to `useState` in React: the initializer runs once when the
            // instance first mounts, and every later render preserves
            // whatever value the user (or an action / effect) has
            // written. Without this branch, every re-render would clobber
            // the user's mutation and the component would appear "stuck"
            // on its initial value (the bug this option exists to fix).
            if (ctx.state.has(target)) {
              result = ctx.state.get(target);
              continue;
            }
            const value = evaluate(stmt.expression, ctx);
            ctx.state.declare(target, value);
            result = value;
            continue;
          }
          // Generic block (lambda body, if/match arm, for body, …):
          // `$x = expr` writes to the reactive state store, resolving
          // through the per-instance alias stack so user-component
          // scopes hit the right slot (§7).
          const value = evaluate(stmt.expression, ctx);
          ctx.state.set(target, value);
          result = value;
          continue;
        }
        const value = evaluate(stmt.expression, ctx);
        if (!ctx.loopVars.has(stmt.identifier)) introduced.push(stmt.identifier);
        ctx.loopVars.set(stmt.identifier, value);
        result = value;
        continue;
      }
      case "Return":
        result = stmt.argument ? evaluate(stmt.argument, ctx) : undefined;
        return result;
      case "EffectDeclaration": {
        // Effects declared inside a `component { … }` body are scoped to
        // the surrounding component instance — defer them to the top
        // frame of `componentEffectStack` so the renderer can mount them
        // against the per-instance key. Capture the active alias stack
        // *now* so `$x = …` writes inside the body still resolve to the
        // right per-instance slot when the effect fires after the
        // component body has already returned (and popped its frame).
        // At the program top level (no active frame) the declaration is
        // registered globally — the host's `syncEffects(...)` pass picks
        // it up.
        const frame = ctx.componentEffectStack[ctx.componentEffectStack.length - 1];
        if (frame) {
          frame.push({
            decl: stmt,
            capturedAliases: ctx.stateAliases.map((f) => new Map(f)),
            // Capture the live loop-var map (component params, slots,
            // outer for-loop bindings) so the effect body still sees
            // them after `evaluateUserComponent` returns and clears the
            // frame. Cloned so later mutations of `ctx.loopVars` don't
            // bleed in.
            capturedLoopVars: new Map(ctx.loopVars),
          });
        } else {
          installStatementBinding(stmt, ctx);
        }
        continue;
      }
      case "ComponentDeclaration":
      case "ActionDeclaration":
        // Top-level constructs that may legally appear inside a block;
        // register them on the context so they're discoverable from
        // sibling statements without mutating outer scope.
        installStatementBinding(stmt, ctx);
        continue;
      case "Await":
        // Deferred to the action / effect runners; in a pure expression
        // block this is a no-op.
        continue;
    }
  }
  // Restore introduced names so block-local bindings don't leak.
  for (const name of introduced) ctx.loopVars.delete(name);
  return result;
}

function evaluateTemplate(
  quasis: string[],
  expressions: Expression[],
  ctx: EvaluationContext,
): string {
  let out = quasis[0] ?? "";
  for (let i = 0; i < expressions.length; i += 1) {
    out += stringify(evaluate(expressions[i]!, ctx));
    out += quasis[i + 1] ?? "";
  }
  return out;
}

function evaluateBinary(
  op: string,
  leftExpr: Expression,
  rightExpr: Expression,
  ctx: EvaluationContext,
): unknown {
  if (op === "&&") {
    const left = evaluate(leftExpr, ctx);
    if (!left) return left;
    return evaluate(rightExpr, ctx);
  }
  if (op === "||") {
    const left = evaluate(leftExpr, ctx);
    if (left) return left;
    return evaluate(rightExpr, ctx);
  }
  if (op === "??") {
    const left = evaluate(leftExpr, ctx);
    if (left !== null && left !== undefined) return left;
    return evaluate(rightExpr, ctx);
  }

  const left = evaluate(leftExpr, ctx);
  const right = evaluate(rightExpr, ctx);

  switch (op) {
    case "+":
      if (typeof left === "string" || typeof right === "string") {
        return stringify(left) + stringify(right);
      }
      return toNumber(left) + toNumber(right);
    case "-": return toNumber(left) - toNumber(right);
    case "*": return toNumber(left) * toNumber(right);
    case "/": {
      const r = toNumber(right);
      return r === 0 ? 0 : toNumber(left) / r;
    }
    case "%": {
      const r = toNumber(right);
      return r === 0 ? 0 : toNumber(left) % r;
    }
    case "==": return left === right;
    case "!=": return left !== right;
    case ">": return toNumber(left) > toNumber(right);
    case "<": return toNumber(left) < toNumber(right);
    case ">=": return toNumber(left) >= toNumber(right);
    case "<=": return toNumber(left) <= toNumber(right);
    default: return null;
  }
}

/**
 * Evaluate an `object.method(args)` invocation. All arguments are
 * positional (the caller passes an object literal as the last arg if
 * needed). Unknown methods resolve to `null` rather than throwing —
 * keeps streaming scripts forgiving when a runtime value disappears
 * mid-render.
 */
function evaluateMethodCall(
  expr: {
    object: Expression;
    method: string;
    arguments: Expression[];
    optional?: boolean;
  },
  ctx: EvaluationContext,
): unknown {
  const target = evaluate(expr.object, ctx);
  if (target == null) {
    return expr.optional ? undefined : null;
  }
  const fn = (target as Record<string, unknown>)[expr.method];
  if (typeof fn !== "function") return null;

  const positional: unknown[] = [];
  for (const arg of expr.arguments) {
    if (arg.kind === "Spread") {
      const value = evaluate(arg.argument, ctx);
      if (Array.isArray(value)) {
        for (const item of value) positional.push(item);
      }
      continue;
    }
    positional.push(evaluate(arg, ctx));
  }
  const callArgs = positional;
  try {
    return (fn as (...a: unknown[]) => unknown).apply(target, callArgs);
  } catch (err) {
    // Don't crash the render — surface the failure via the host console
    // so authors can still see what went wrong.
    // eslint-disable-next-line no-console
    console.error(`[aktion] method "${expr.method}" threw`, err);
    return null;
  }
}

function evaluateComponentCall(
  callee: string,
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  // `Router({ "/": Home(), "/users/:id": User(params), default: NotFound() })`
  // — the routing primitive. Intercept *before* arguments are evaluated so
  // only the matching arm's body runs (and so `params` is in scope for it).
  if (callee === "Router") {
    return evaluateRouterCall(args, ctx, loc);
  }
  // `emit("name", detail)` — dispatch a custom event via the host.
  if (callee === "emit") {
    const eventName = args[0] ? String(evaluate(args[0], ctx)) : "";
    const detail = args[1] ? evaluate(args[1], ctx) : undefined;
    ctx.onEmit?.(eventName, detail);
    return undefined;
  }
  // `Storage({...})` — returns the built-in storage namespace.
  if (callee === "Storage") {
    if (args[0]) evaluate(args[0], ctx);
    return storageGlobal;
  }
  // Aktion 0.5 component declarations win over the legacy macro form and the
  // built-in library. This lets author code override built-in components
  // by name (e.g. wrapping `Button` with telemetry).
  const componentDecl = ctx.componentDecls.get(callee);
  if (componentDecl) {
    return invokeComponentDecl(componentDecl, args, ctx, loc);
  }
  // Aktion 0.5 action declarations: when called as `myAction(arg1, arg2)`, the
  // call returns a function that the action runner will invoke. Returning
  // a function (rather than running synchronously) lets `onClick: myAction`
  // bindings work without the renderer racing the action body.
  const actionDecl = ctx.actionDecls.get(callee);
  if (actionDecl) {
    if (args.length === 0) {
      // Bare reference (`onClick: save`) — return the callable.
      return makeActionCallable(actionDecl, ctx);
    }
    // Eager invocation (`save(orderId)`) — schedule the action body.
    const evaluated = args.map((a) => evaluate(a, ctx));
    return invokeActionDecl(actionDecl, evaluated, ctx);
  }
  // `http({ url, method, body, headers, ... })` builtin — returns a
  // reactive `EndpointResource` bag with `data`, `error`, `loading`,
  // `status`, `lastUpdated`, `headers`, `refetch()`, `cancel()`.
  if (callee === "http") {
    const optsArg = args[0];
    const opts = optsArg ? evaluate(optsArg, ctx) : {};
    return createHttpResource(opts, ctx);
  }
  // Local lambda registered into loopVars (e.g. an in-block helper
  // `itemRow = (item) => Card(item.title)` evaluated by `evaluateBlock`).
  const localHelper = ctx.loopVars.get(callee);
  if (typeof localHelper === "function") {
    const evaluated = args.map((arg) => evaluate(arg, ctx));
    return (localHelper as (...a: unknown[]) => unknown)(...evaluated);
  }
  // Top-level lambda binding: e.g. `priorityTone = (p) => switch (p) { case ... }`.
  const binding = ctx.bindings.get(callee);
  if (binding) {
    const fn = binding();
    if (typeof fn === "function") {
      const evaluated = args.map((arg) => evaluate(arg, ctx));
      return (fn as (...a: unknown[]) => unknown)(...evaluated);
    }
  }

  if (callee === "Theme") {
    // `Theme({ colors: {...}, radius: {...}, font: {...}, motion: {...},
    // elevation: {...} })` — capture the structured token map to be
    // applied on top of the base theme between render cycles. We do not
    // render anything; the element picks the value up via the `theme`
    // binding (or any other binding) and writes the tokens to its host.
    //
    // The keys inside each group are flattened into prefixed CSS tokens
    // (`colors.primary` → `colorPrimary`, `radius.md` → `radiusMd`, …).
    // The legacy flat-shape form is rejected — see `collectThemeTokens`.
    const tokensArg = args[0];
    const tokens = collectThemeTokens(tokensArg ? evaluate(tokensArg, ctx) : null);
    const node: ThemeNode = { kind: "Theme", tokens };
    return node;
  }
  if (callee === "Http") {
    // `Http({ baseUrl, headers, retry, ... })` — pushes config into the
    // host runtime and returns a marker so callers can `$http = Http({...})`
    // without crashing the evaluator. The marker has a stable shape so
    // host code introspecting `$http` sees the configured defaults.
    const configArg = args[0];
    const config = configArg ? evaluate(configArg, ctx) : null;
    if (config && typeof config === "object" && !Array.isArray(config) && ctx.http) {
      const cfg = config as Record<string, unknown>;
      ctx.http.setDefaults({
        baseUrl: typeof cfg.baseUrl === "string" ? cfg.baseUrl : undefined,
        headers: cfg.headers && typeof cfg.headers === "object" && !Array.isArray(cfg.headers)
          ? Object.fromEntries(
              Object.entries(cfg.headers as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
            )
          : undefined,
        timeoutMs: typeof cfg.timeout === "number" ? cfg.timeout : undefined,
        retry: cfg.retry && typeof cfg.retry === "object" && !Array.isArray(cfg.retry)
          ? {
              count: Number((cfg.retry as Record<string, unknown>).count ?? 0) || 0,
              backoff: (cfg.retry as Record<string, unknown>).backoff === "linear"
                ? "linear"
                : "exponential",
            }
          : undefined,
        credentials:
          cfg.credentials === "omit" || cfg.credentials === "same-origin" || cfg.credentials === "include"
            ? cfg.credentials
            : undefined,
      });
    }
    return { __kind: "Http", config };
  }
  if (callee === "i18n") {
    // `i18n({ locale, messages, fallback })` — push into the host runtime.
    const configArg = args[0];
    const config = configArg ? evaluate(configArg, ctx) : null;
    if (config && typeof config === "object" && !Array.isArray(config) && ctx.i18n) {
      const cfg = config as Record<string, unknown>;
      ctx.i18n.configure({
        locale: typeof cfg.locale === "string" ? cfg.locale : "en",
        messages:
          cfg.messages && typeof cfg.messages === "object" && !Array.isArray(cfg.messages)
            ? (cfg.messages as Record<string, unknown>)
            : {},
        fallback: typeof cfg.fallback === "string" ? cfg.fallback : "en",
        fallbackMessages:
          cfg.fallbackMessages && typeof cfg.fallbackMessages === "object" && !Array.isArray(cfg.fallbackMessages)
            ? (cfg.fallbackMessages as Record<string, unknown>)
            : undefined,
      });
    }
    return { __kind: "I18n", config };
  }
  // Final fallthrough: treat the call as a built-in component invocation
  // and build a `ComponentNode` the renderer will hand to the library. If
  // the callee resolves against *neither* the library nor any user
  // declaration we return a synthetic Skeleton node (§2 — anticipatory
  // skeletons). This handles mid-stream forward references like
  // `aktion = App()` that arrive before the `function App() { ... }`
  // declaration has finished streaming: rather than dumping
  // `[unknown component: App]` into the DOM, the user sees a Skeleton
  // until the next render pass resolves the declaration.
  if (ctx.library && !findComponent(ctx.library, callee)) {
    if (findComponent(ctx.library, "Skeleton")) {
      const skeleton: ComponentNode = {
        __kind: "Component",
        name: "Skeleton",
        args: [],
        argMeta: [],
        source: loc,
      };
      return skeleton;
    }
    return null;
  }
  // Extract a `key:` prop from the trailing object literal (§13 —
  // content-addressed identity). The renderer uses it instead of the
  // source location so reordering siblings keeps per-instance state
  // attached to the right node. We strip it from the arg list before
  // evaluating positional / named props so the library never sees it.
  let explicitKey: unknown = undefined;
  const propArgs: Expression[] = [...args];
  if (propArgs.length > 0) {
    const last = propArgs[propArgs.length - 1]!;
    if (last.kind === "Object") {
      const keyProp = last.properties.find((p) => !p.spread && p.key === "key");
      if (keyProp) {
        explicitKey = evaluate(keyProp.value, ctx);
        const filtered = last.properties.filter((p) => p !== keyProp);
        if (filtered.length > 0) {
          propArgs[propArgs.length - 1] = { ...last, properties: filtered };
        } else {
          propArgs.pop();
        }
      }
    }
  }
  const { args: evaluated, argMeta } = resolveLibraryCallArgs(ctx, callee, propArgs);
  const node: ComponentNode = {
    __kind: "Component",
    name: callee,
    args: evaluated,
    argMeta,
    explicitKey,
    source: loc,
  };
  return node;
}

/**
 * Aktion 0.5 §19.1 — build the slot-aligned `args` and
 * `argMeta` arrays for a library-component call. The function handles:
 *
 *   - Plain positional arguments — routed to the spec's single
 *     `positional: true` prop (or slot 0 by default). A direct
 *     `$variable` reference (or member chain rooted at one, e.g.
 *     `$user.name`) lifts to `argMeta.stateRef` so the library renderer
 *     can wire two-way binding into the right nested slot.
 *   - A trailing `ObjectExpr` — its properties are treated as named
 *     args routed by prop name. If a property's value is a bare
 *     `$variable` (`Input("title", { value: $title })`) or a member
 *     chain rooted at one (`{ value: $form.email }`), the slot's
 *     `argMeta.stateRef` carries the dotted path so renderers can wire
 *     a deep two-way binding.
 *   - Extra positional args (multi-positional, §19.1 violation) — fall
 *     through to the next unnamed slot in declaration order so the
 *     graceful runtime path keeps rendering while the schema-validator
 *     warning surfaces the migration hint.
 *
 * For user-declared components (no library spec) we fall back to the
 * simple "evaluate each argument as-is" path so per-instance state lookup
 * sees raw `propArgs` unchanged.
 */
function resolveLibraryCallArgs(
  ctx: EvaluationContext,
  callee: string,
  propArgs: Expression[],
): { args: unknown[]; argMeta: ArgMeta[] } {
  const spec = ctx.library ? findComponent(ctx.library, callee) : undefined;
  if (!spec) {
    const args = propArgs.map((arg) => evaluate(arg, ctx));
    const argMeta = propArgs.map<ArgMeta>((arg) => {
      const ref = stateRefForArg(arg, ctx);
      return ref !== null ? { stateRef: ref } : {};
    });
    return { args, argMeta };
  }

  const slotByName = new Map<string, number>();
  spec.props.forEach((p, i) => {
    slotByName.set(p.name, i);
    if (p.aliases) {
      for (const alias of p.aliases) {
        if (!slotByName.has(alias)) slotByName.set(alias, i);
      }
    }
  });
  const positionalIndex = findPositionalIndex(spec);
  const slots: Array<{ value: unknown; meta: ArgMeta; filled: boolean }> = spec.props.map(() => ({
    value: undefined,
    meta: {},
    filled: false,
  }));

  // Split the named-props ObjectExpr from positional args. The named-props
  // block is the *last* ObjectExpr in `propArgs` — so `Foo("hi", {x: 1})`
  // (trailing) and `Foo({x: 1}, [children])` (leading) both work. This is
  // the most JS-natural shape and matches how React-style libraries pass
  // props alongside positional children.
  type PositionalSource = { expr: Expression; value: unknown };
  const positionals: PositionalSource[] = [];
  let trailingObjIdx = -1;
  for (let i = propArgs.length - 1; i >= 0; i -= 1) {
    if (propArgs[i]!.kind === "Object") {
      trailingObjIdx = i;
      break;
    }
  }

  for (let i = 0; i < propArgs.length; i += 1) {
    if (i === trailingObjIdx) continue;
    const arg = propArgs[i]!;
    positionals.push({ expr: arg, value: evaluate(arg, ctx) });
  }

  if (trailingObjIdx >= 0) {
    const trailingObj = propArgs[trailingObjIdx]!;
    if (trailingObj.kind === "Object") {
      for (const prop of trailingObj.properties) {
        if (prop.spread) continue;
        const slot = slotByName.get(prop.key);
        if (slot === undefined) continue;
        const value = evaluate(prop.value, ctx);
        slots[slot]!.value = value;
        slots[slot]!.filled = true;
        const ref = stateRefForArg(prop.value, ctx);
        if (ref !== null) slots[slot]!.meta = { stateRef: ref };
      }
    }
  }

  // Aktion 0.5 §19.1 — exactly one positional argument max
  // *at the language layer* (schema validator surfaces an error for any
  // additional positional). The runtime keeps a graceful render path so
  // direct-evaluator callers without the validator hooked up still see a
  // populated node: the first positional lands in the spec's positional
  // slot; any extras fall through to the next unnamed slots in spec
  // order. This is the same "best-effort render even on schema error"
  // contract the rest of the runtime follows.
  if (positionals.length > 0 && positionalIndex >= 0 && !slots[positionalIndex]!.filled) {
    const { expr, value } = positionals.shift()!;
    slots[positionalIndex]!.value = value;
    slots[positionalIndex]!.filled = true;
    const ref = stateRefForArg(expr, ctx);
    if (ref !== null) slots[positionalIndex]!.meta = { stateRef: ref };
  }
  let cursor = 0;
  for (const { expr, value } of positionals) {
    while (cursor < spec.props.length && slots[cursor]!.filled) cursor += 1;
    if (cursor >= spec.props.length) break;
    slots[cursor]!.value = value;
    slots[cursor]!.filled = true;
    const ref = stateRefForArg(expr, ctx);
    if (ref !== null) slots[cursor]!.meta = { stateRef: ref };
    cursor += 1;
  }

  // Trim trailing empty slots so optional tail props stay omitted from
  // `node.args` (preserves the legacy contract every library renderer
  // assumes — undefined-tail slots are not appended).
  const args: unknown[] = slots.map((s) => s.value);
  const argMeta: ArgMeta[] = slots.map((s) => s.meta);
  while (args.length > 0 && args[args.length - 1] === undefined) {
    args.pop();
    argMeta.pop();
  }
  return { args, argMeta };
}

/**
 * Invoke a `function Name(p) { return ... }` declaration. Parameters are
 * bound to the supplied positional / named arguments and the block body
 * is evaluated; the last expression's value is returned as the rendered
 * output. State and effect declarations inside the body are *registered
 * during the block walk*; full per-instance scoping is a follow-up — see
 * the status file. The current behaviour: the first invocation registers
 * any `$state`/`effect`/`action` inside as global names, which works for
 * single-instance components but does not yet isolate multiple instances.
 */
function invokeComponentDecl(
  decl: ComponentDeclaration,
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  // Split positional vs. named for the slot-aware UserComponentNode. The
  // named-props block is the *last* ObjectExpr in `args` (rightmost),
  // which lets users write `Foo("hi", {x: 1})` (trailing) or
  // `Foo({x: 1}, child)` (leading) — both routes through the same path.
  const positionalExprs: Expression[] = [];
  const named: Record<string, Expression> = {};
  let explicitKeyExpr: Expression | undefined;

  let trailingObjIdx = -1;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (args[i]!.kind === "Object") {
      trailingObjIdx = i;
      break;
    }
  }
  let trailingObjArg = trailingObjIdx >= 0 ? args[trailingObjIdx]! : null;

  // Decide whether to treat the trailing object as named-args or a regular
  // positional arg. Rule: if the object has `key:` or any key that matches
  // one of the component's param names, it expands to named-args. If none
  // of its keys match any param name, it's passed positionally — this lets
  // callers pass an opaque data/slots object to a user component without
  // surprising key-routing.
  let expandAsNamed = false;
  if (trailingObjArg && trailingObjArg.kind === "Object") {
    const paramNames = new Set(decl.params.map((p) => p.name));
    for (const prop of trailingObjArg.properties) {
      if (prop.spread) continue;
      if (prop.key === "key" || paramNames.has(prop.key)) {
        expandAsNamed = true;
        break;
      }
    }
  }
  if (!expandAsNamed) {
    trailingObjIdx = -1;
    trailingObjArg = null;
  }

  for (let i = 0; i < args.length; i += 1) {
    if (i === trailingObjIdx) continue;
    positionalExprs.push(args[i]!);
  }

  if (trailingObjArg && trailingObjArg.kind === "Object") {
    for (const prop of trailingObjArg.properties) {
      if (prop.spread) continue;
      if (prop.key === "key") {
        explicitKeyExpr = prop.value;
      } else {
        named[prop.key] = prop.value;
      }
    }
  }

  // Evaluate args in the caller's scope (params are not in scope yet, so
  // arg expressions cannot reference the component's own params — which
  // matches every other language with eager argument evaluation).
  const positional = positionalExprs.map((expr) =>
    expr.kind === "Spread" ? evaluate(expr.argument, ctx) : evaluate(expr, ctx),
  );
  // Flatten Spread results inline so `Counter(...defaults, { key: "a" })` works.
  const flatPositional: unknown[] = [];
  for (let i = 0; i < positionalExprs.length; i += 1) {
    const expr = positionalExprs[i]!;
    const value = positional[i];
    if (expr.kind === "Spread" && Array.isArray(value)) {
      for (const item of value) flatPositional.push(item);
    } else {
      flatPositional.push(value);
    }
  }
  const evaluatedNamed: Record<string, unknown> = {};
  for (const [name, expr] of Object.entries(named)) {
    evaluatedNamed[name] = evaluate(expr, ctx);
  }
  const explicitKey = explicitKeyExpr ? evaluate(explicitKeyExpr, ctx) : undefined;

  return {
    __kind: "UserComponent",
    decl,
    positional: flatPositional,
    named: evaluatedNamed,
    explicitKey,
    source: loc,
  } satisfies UserComponentNode;
}

/**
 * Result of `evaluateUserComponent`. `value` is the body's last
 * expression value (a `ComponentNode`, another `UserComponentNode`, or a
 * primitive) that the renderer will materialise. `effects` is the list of
 * `effect(() => { … }, [deps])` declarations discovered inside the body
 * (paired with the per-instance alias stack captured at walk time) —
 * the renderer hands them to the host's `EffectRunner` so they mount on
 * a per-instance scope and tear down when the instance unmounts.
 */
export interface EvaluatedUserComponent {
  value: unknown;
  effects: ReadonlyArray<ScopedEffectDecl>;
}

/**
 * Evaluate a user-declared component body in a fresh per-instance scope.
 * Called by the renderer once the stable instance key is known so
 * `$state` declarations inside the body land in instance-private slots.
 *
 * `instanceKey` should be a deterministic string derived from the
 * render-tree path (and/or the `key:` override) — it becomes the prefix
 * for every per-instance state atom and effect / action declaration.
 *
 * Returns the body's last-expression value (typically a `ComponentNode`
 * the renderer can hand to the library, or another `UserComponentNode`
 * to expand recursively) plus any `effect(() => { … }, [deps])` declarations
 * discovered inside the body that the renderer must mount per-instance.
 */
export function evaluateUserComponent(
  node: UserComponentNode,
  ctx: EvaluationContext,
  instanceKey: string,
): EvaluatedUserComponent {
  // NB: component-recursion depth is bounded by the renderer (which is
  // the only caller that drives recursive expansion). See
  // `enterUserComponent` / `leaveUserComponent` and `renderer.ts`.
  const { decl, positional, named } = node;
  const restoreLoopVars: Array<{ name: string; had: boolean; prev: unknown }> = [];
  // Bind component params in declaration order, with defaults for absent
  // values. Trailing positional becomes `children`.
  for (let i = 0; i < decl.params.length; i += 1) {
    const param = decl.params[i]!;
    let value: unknown;
    if (named[param.name] !== undefined) {
      value = named[param.name];
    } else if (positional[i] !== undefined) {
      value = positional[i];
    } else if (param.defaultValue) {
      // Defaults are evaluated in the component's own scope so they may
      // reference earlier params (`tone: "info", icon: iconFor(tone)`).
      value = evaluate(param.defaultValue, ctx);
    } else {
      value = undefined;
    }
    restoreLoopVars.push({
      name: param.name,
      had: ctx.loopVars.has(param.name),
      prev: ctx.loopVars.get(param.name),
    });
    ctx.loopVars.set(param.name, value);
  }
  // `children` slot from any extra trailing positional arguments.
  if (positional.length > decl.params.length) {
    const extras = positional.slice(decl.params.length);
    const childrenValue = extras.length === 1 ? extras[0] : extras;
    restoreLoopVars.push({
      name: "children",
      had: ctx.loopVars.has("children"),
      prev: ctx.loopVars.get("children"),
    });
    ctx.loopVars.set("children", childrenValue);
  }
  // Named slots: declared as `slots: { name? }` on the component.
  if (decl.slots.length > 0) {
    const slotsValue: Record<string, unknown> = {};
    for (const slotName of decl.slots) {
      if (named[slotName] !== undefined) {
        slotsValue[slotName] = named[slotName];
      }
    }
    restoreLoopVars.push({
      name: "slots",
      had: ctx.loopVars.has("slots"),
      prev: ctx.loopVars.get("slots"),
    });
    ctx.loopVars.set("slots", slotsValue);
  }

  // Walk the body once to discover `$x = expr` state declarations and
  // register per-instance aliases for each. The initial value is NOT
  // computed here — `evaluateBlock` lazily evaluates the initializer
  // expression the first time it sees the statement (when the slot has
  // not yet been declared) so non-literal initializers like
  // `$now = @Now()` or `$n = initial` work the same way literals do.
  // On every subsequent render the alias frame is rebuilt with the same
  // mappings and the block walk skips the initializer because the slot
  // already exists in the state store — preserving the user's mutations.
  const aliasFrame = new Map<string, string>();
  for (const stmt of decl.body.body) {
    if (stmt.kind === "Assignment" && stmt.isState) {
      const instanceName = `${instanceKey}:${stmt.identifier}`;
      aliasFrame.set(stmt.identifier, instanceName);
    }
  }
  ctx.stateAliases.push(aliasFrame);
  // Push a frame so `effect(() => { … }, [deps])` declarations encountered
  // inside this body collect into a per-instance bucket instead of
  // mutating the global `effectDecls` map.
  const effectsFrame: ScopedEffectDecl[] = [];
  ctx.componentEffectStack.push(effectsFrame);
  try {
    const value = evaluateBlock(decl.body, ctx, { stateAsDeclaration: true });
    return { value, effects: effectsFrame };
  } finally {
    ctx.componentEffectStack.pop();
    ctx.stateAliases.pop();
    for (const slot of restoreLoopVars) {
      if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
      else ctx.loopVars.delete(slot.name);
    }
  }
}

/**
 * Build a callable that runs the action body when invoked. The returned
 * function signature matches a JS event handler (`(event) => Promise<unknown>`)
 * so `onClick: actionName` bindings dispatch correctly without extra
 * adapter logic.
 */
function makeActionCallable(decl: ActionDeclaration, ctx: EvaluationContext) {
  // Snapshot the alias frames *at callable-creation time* so per-instance
  // `$state` slots declared in the surrounding `component` body resolve
  // correctly when the action fires later (e.g. on click). Without this,
  // the action would inherit the alias stack as it exists at *call time* —
  // which is usually empty because component rendering already returned.
  // The lambda path (§9 `Lambda` in `evaluate`) does the same.
  const capturedAliases: Array<Map<string, string>> = ctx.stateAliases.map(
    (frame) => new Map(frame),
  );
  return async (...args: unknown[]) => {
    const restoreAliases = ctx.stateAliases.slice();
    ctx.stateAliases.length = 0;
    for (const frame of capturedAliases) ctx.stateAliases.push(frame);
    try {
      return await invokeActionDecl(decl, args, ctx);
    } finally {
      ctx.stateAliases.length = 0;
      for (const frame of restoreAliases) ctx.stateAliases.push(frame);
    }
  };
}

/**
 * Run an action declaration eagerly with `args` already evaluated. The
 * call returns a Promise so authors can `await save(order.id)` and have
 * the optimistic-rollback semantics described in §10.
 */
function invokeActionDecl(
  decl: ActionDeclaration,
  args: unknown[],
  ctx: EvaluationContext,
): Promise<unknown> | unknown {
  if (!ctx.actionRunner) {
    // No host runtime — fall back to a synchronous best-effort eval that
    // still binds parameters and runs the body but ignores `await` /
    // `optimistic`. Better than silently dropping the call.
    const restore: Array<{ name: string; had: boolean; prev: unknown }> = [];
    for (let i = 0; i < decl.params.length; i += 1) {
      const param = decl.params[i]!;
      restore.push({
        name: param.name,
        had: ctx.loopVars.has(param.name),
        prev: ctx.loopVars.get(param.name),
      });
      ctx.loopVars.set(param.name, args[i]);
    }
    try {
      return evaluateBlock(decl.body, ctx, {});
    } finally {
      for (const slot of restore) {
        if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
        else ctx.loopVars.delete(slot.name);
      }
    }
  }
  return ctx.actionRunner.run(decl, args, ctx);
}

function evaluateBuiltinCall(
  name: string,
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  // Synthetic assignment-as-expression emitted by the parser for the
  // single-statement lambda form `() => $x = expr` (and `+=`, `-=`,
  // `*=`, `/=`, `??=`). Without this handler the assignment would be
  // silently dropped because no real `@__rui_assign__` builtin exists.
  if (name === "__rui_assign__") {
    return evaluateSyntheticAssign(args, ctx);
  }
  if (name === "__rui_postfix__") {
    return evaluateSyntheticPostfix(args, ctx);
  }
  // Aktion 0.5 i18n: `t(key, vars?)` — global translation builtin.
  if (name === "T" || name === "t") {
    const keyArg = args[0];
    const varsArg = args[1];
    const key = keyArg ? String(evaluate(keyArg, ctx) ?? "") : "";
    if (!ctx.i18n) return key;
    let vars: Record<string, unknown> | undefined;
    if (varsArg) {
      const evaluated = evaluate(varsArg, ctx);
      if (evaluated && typeof evaluated === "object" && !Array.isArray(evaluated)) {
        vars = evaluated as Record<string, unknown>;
      }
    }
    return ctx.i18n.t(key, vars);
  }

  // Aktion 0.5 i18n: `Locale()` — return the active locale tag. Cheap escape
  // hatch so authors can pass it to `Format`/`FormatDate` without wiring
  // a `$session.locale` atom themselves.
  if (name === "Locale") {
    return ctx.i18n?.getLocale() ?? "";
  }

  const fn = dataBuiltins[name];
  if (!fn) return null;
  const evaluated = args.map((a) => evaluate(a, ctx));
  // Pre-flight allocation checks. Both builtins materialise an array
  // proportional to a user-supplied number; without bounds, a stray
  // `@Range(0, 1e9)` would push a billion entries before throwing JS-
  // level errors. We compute the expected size cheaply and reject up
  // front so the renderer never starts allocating.
  if (name === "Range") {
    enforceArrayLength(ctx.budget, expectedRangeSize(evaluated), "@Range");
  } else if (name === "Repeat") {
    enforceArrayLength(ctx.budget, Math.max(0, toNumber(evaluated[1])), "@Repeat");
  }
  return fn(evaluated);
}

/**
 * Compute how many entries `@Range(start, end, step?)` would emit
 * *without* actually allocating the array. Matches the inclusive
 * semantics of the `Range` builtin in `runtime/builtins.ts`.
 */
function expectedRangeSize(evaluated: unknown[]): number {
  const start = toNumber(evaluated[0]);
  const end = toNumber(evaluated[1]);
  const stepArg = evaluated[2];
  const step = stepArg === undefined ? (end >= start ? 1 : -1) : toNumber(stepArg);
  if (step === 0) return 1;
  const span = Math.abs(end - start);
  return Math.floor(span / Math.abs(step)) + 1;
}

/**
 * Apply a compound-assignment operator. Used by the synthetic
 * `__rui_assign__` builtin so single-statement lambdas like
 * `() => $count += 1` update state through the same code path the
 * action runner uses.
 */
function applyAssignOp(op: string, current: unknown, next: unknown): unknown {
  switch (op) {
    case "=": return next;
    case "+=": {
      if (typeof current === "string" || typeof next === "string") {
        return `${current ?? ""}${next ?? ""}`;
      }
      return toNumber(current) + toNumber(next);
    }
    case "-=": return toNumber(current) - toNumber(next);
    case "*=": return toNumber(current) * toNumber(next);
    case "/=": {
      const divisor = toNumber(next);
      return divisor === 0 ? 0 : toNumber(current) / divisor;
    }
    case "??=": return current == null ? next : current;
    default: return next;
  }
}

/**
 * Evaluate a `__rui_assign__(target, value, op)` synthetic call. The
 * target may be:
 *   - a `StateRef` (write to the state store, alias-aware)
 *   - a `Member` chain rooted at a `StateRef` (immutable nested update
 *     via `state.setPath`, so subscribers see a fresh top-level ref)
 *   - a plain `Identifier` (write to `loopVars` so block-local helpers
 *     still observe the new value).
 *
 * Member writes onto non-reactive targets (loop variables, locals)
 * fall back to a direct in-place mutation so block-local helpers behave
 * predictably.
 */
function evaluateSyntheticAssign(
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  const [targetExpr, valueExpr, opExpr] = args;
  if (!targetExpr || !valueExpr) return null;
  const op = opExpr && opExpr.kind === "Literal" ? String(opExpr.value ?? "=") : "=";
  const rhs = evaluate(valueExpr, ctx);
  if (targetExpr.kind === "StateRef") {
    const target = resolveStateAlias(ctx, targetExpr.name);
    const current = ctx.state.get(target);
    const next = applyAssignOp(op, current, rhs);
    ctx.state.set(target, next);
    return next;
  }
  if (targetExpr.kind === "Member") {
    const extracted = extractStatePath(targetExpr, ctx);
    if (extracted) {
      const current = readAtPath(ctx.state.get(extracted.name), extracted.path);
      const next = applyAssignOp(op, current, rhs);
      ctx.state.setPath(extracted.name, extracted.path, next);
      return next;
    }
    // Member on a non-reactive root (loop var, local helper, …). Best
    // effort: mutate in place so the assignment is at least observable
    // to subsequent reads on the same value.
    const root = evaluate(targetExpr.object, ctx);
    const key = targetExpr.computed
      ? (targetExpr.computed.kind === "Literal" ? targetExpr.computed.value : null)
      : targetExpr.property;
    if (root && typeof root === "object" && key != null) {
      const current = (root as Record<string, unknown>)[String(key)];
      const next = applyAssignOp(op, current, rhs);
      (root as Record<string, unknown>)[String(key)] = next;
      return next;
    }
    return rhs;
  }
  if (targetExpr.kind === "Identifier") {
    const current = ctx.loopVars.get(targetExpr.name);
    const next = applyAssignOp(op, current, rhs);
    ctx.loopVars.set(targetExpr.name, next);
    return next;
  }
  return rhs;
}

/**
 * Read the value at `path` inside `target`. Returns `undefined` when
 * any intermediate step is null/undefined. Mirrors the read semantics
 * the renderer's reactive trackers already use.
 */
function readAtPath(target: unknown, path: ReadonlyArray<string>): unknown {
  let cursor: unknown = target;
  for (const segment of path) {
    if (cursor == null) return undefined;
    if (Array.isArray(cursor)) {
      const idx = Number(segment);
      cursor = Number.isNaN(idx) ? undefined : cursor[idx];
      continue;
    }
    if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}

/**
 * Evaluate a `__rui_postfix__(target, op)` synthetic call (`++` / `--`).
 * Returns the value *after* the increment so the expression composes
 * predictably inside other expressions.
 */
function evaluateSyntheticPostfix(
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  const [targetExpr, opExpr] = args;
  if (!targetExpr) return null;
  const op = opExpr && opExpr.kind === "Literal" ? String(opExpr.value ?? "++") : "++";
  const delta = op === "--" ? -1 : 1;
  if (targetExpr.kind === "StateRef") {
    const target = resolveStateAlias(ctx, targetExpr.name);
    const next = toNumber(ctx.state.get(target)) + delta;
    ctx.state.set(target, next);
    return next;
  }
  if (targetExpr.kind === "Member") {
    const extracted = extractStatePath(targetExpr, ctx);
    if (extracted) {
      const current = readAtPath(ctx.state.get(extracted.name), extracted.path);
      const next = toNumber(current) + delta;
      ctx.state.setPath(extracted.name, extracted.path, next);
      return next;
    }
  }
  if (targetExpr.kind === "Identifier") {
    const next = toNumber(ctx.loopVars.get(targetExpr.name)) + delta;
    ctx.loopVars.set(targetExpr.name, next);
    return next;
  }
  return null;
}

/**
 * Resolve the current route path. Prefers the router (when present), falls
 * back to the `route` state slot, and finally to "/". Tracking the slot
 * here makes router bindings reactive to host pages that write the path
 * imperatively (e.g. for SSR-style hydration).
 */
function readRoutePath(ctx: EvaluationContext): string {
  if (ctx.router) {
    return ctx.router.getPath();
  }
  if (ctx.state.has("route")) {
    ctx.trackedState.add("route");
    const value = ctx.state.get("route");
    if (typeof value === "string" && value) return value;
    if (value && typeof value === "object" && "path" in value) {
      const path = (value as { path: unknown }).path;
      if (typeof path === "string" && path) return path;
    }
  }
  return "/";
}

/**
 * Build the reactive `route` payload from the host's `Router`. Returns
 * a plain object with `path`, `params`, `pattern`, `query`, a
 * `navigate(path)` method that delegates to the router, plus a
 * `toString()` so template literals like `${route}` still coerce to
 * the path. Computed on every read so route arm matches that update
 * params mid-render are reflected in subsequent `route.params` reads
 * in the same render pass.
 */
function buildRouteState(router: NonNullable<EvaluationContext["router"]>): Record<string, unknown> {
  const path = router.getPath();
  const params: Record<string, unknown> = { ...router.getParams() };
  const pattern = router.getActivePattern();
  const query: Record<string, string> = {};
  if (typeof globalThis !== "undefined" && (globalThis as { location?: { search?: string } }).location) {
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? "";
    if (search) {
      const usp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      for (const [k, v] of usp) query[k] = v;
    }
  }
  return {
    path,
    params,
    pattern,
    query,
    navigate(target: unknown): void {
      if (typeof target !== "string" || !target) return;
      router.navigate(target);
    },
    toString() {
      return path;
    },
  };
}

/**
 * Aktion 0.5 §19.1 — see `resolveLibraryCallArgs`. The
 * legacy "trailing object literal expands to named args" hack was
 * removed in 0.5 — object literals are treated as opaque values like
 * any other argument, so `Stack({ gap: "md" })` no longer aliases
 * `Stack(gap: "md")`.
 */

function computedMemberAccess(target: unknown, key: unknown): unknown {
  if (target == null) return undefined;

  if (Array.isArray(target)) {
    const index = toArrayIndex(key, target.length);
    if (index === null) return undefined;
    return target[index];
  }

  if (typeof target === "string") {
    const index = toArrayIndex(key, target.length);
    if (index === null) return undefined;
    return target[index];
  }

  if (typeof target === "object") {
    return (target as Record<string, unknown>)[String(key ?? "")];
  }

  return undefined;
}

/** Resolve numeric/string keys to a bounded array index (supports negatives). */
function toArrayIndex(key: unknown, length: number): number | null {
  let index: number;
  if (typeof key === "number") {
    index = key;
  } else if (typeof key === "string" && key.trim() !== "" && !Number.isNaN(Number(key))) {
    index = Number(key);
  } else {
    return null;
  }
  if (index < 0) index = length + index;
  if (index < 0 || index >= length) return null;
  return index;
}

function memberAccess(target: unknown, property: string): unknown {
  if (target == null) return undefined;
  if (Array.isArray(target)) {
    // A handful of "array-shaped" properties LLMs reach for reflexively.
    // Resolving them here means common JS idioms (`$todos.length`,
    // `$rows.first`) just work without forcing every author to remember the
    // @Count/@First builtins.
    switch (property) {
      case "length": return target.length;
      case "first": return target[0] ?? null;
      case "last": return target.length === 0 ? null : target[target.length - 1];
      default: break;
    }
    // "Array pluck": map each item through the property. Idiomatic for
    // turning `data.rows` into a per-column array.
    return target.map((item) => {
      if (item && typeof item === "object") {
        return (item as Record<string, unknown>)[property];
      }
      return undefined;
    });
  }
  if (typeof target === "string") {
    // Strings get the same shortcut so the LLM doesn't have to switch idioms.
    if (property === "length") return target.length;
  }
  if (typeof target === "object") {
    return (target as Record<string, unknown>)[property];
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.trim() === "") return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return 0;
}

/**
 * Flatten a Aktion 0.5 theme config into the flat
 * `{tokenKey: string}` shape the host element applies as CSS variables.
 *
 * Only the structured form is accepted:
 *
 *   `Theme({ name, colors: {...}, radius: {...}, font: {...},
 *            motion: {...}, elevation: {...}, direction })`
 *
 * Groups flatten with a stable naming convention:
 *   `colors.primary`     → `colorPrimary`
 *   `radius.md`          → `radiusMd`
 *   `font.heading`       → `fontHeading`
 *   `motion.default`     → `motionDefault`
 *   `elevation.2`        → `elevation2`
 *
 * Top-level metadata keys (`name`, `direction`) are accepted but never
 * emitted as CSS variables. The legacy flat-shape form
 * (`Theme({colorPrimary: "...", ...})`) and free-form CSS variable
 * keys (`Theme({"--color-x": "..."})`) were removed in SUIS/2: the
 * runtime ignores unknown top-level keys silently to keep streaming
 * partial themes safe, but the schema validator surfaces them as
 * advisory warnings (§15) so authors can migrate.
 */
const STRUCTURED_THEME_GROUPS = new Set([
  "colors",
  "radius",
  "font",
  "motion",
  "elevation",
]);
const THEME_METADATA_KEYS = new Set(["name", "direction"]);

function collectThemeTokens(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const map = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(map)) {
    if (raw == null) continue;
    if (THEME_METADATA_KEYS.has(key)) continue;
    if (!STRUCTURED_THEME_GROUPS.has(key)) {
      // Legacy flat-shape token (e.g. `colorPrimary`, `radiusMd`) or
      // free-form CSS variable key (`--color-x`). Silently drop —
      // schema validation surfaces it as a warning at parse time so
      // the author sees the migration hint without crashing the
      // render.
      continue;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const prefix = key === "colors" ? "color" : key;
      for (const [innerKey, innerValue] of Object.entries(raw as Record<string, unknown>)) {
        if (innerValue == null) continue;
        const flatKey = prefix + capitalise(innerKey);
        out[flatKey] = stringifyTokenValue(innerValue);
      }
    }
  }
  return out;
}

function capitalise(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function stringifyTokenValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Objects with a custom `toString()` (notably the reactive `route`
  // payload whose `toString()` returns `path`) get their string form so
  // template literals like `${route}` keep coercing to the path.
  if (typeof v === "object" && v !== null) {
    const proto = Object.getPrototypeOf(v);
    const ownToString = (v as { toString?: () => string }).toString;
    if (typeof ownToString === "function" && ownToString !== Object.prototype.toString) {
      const str = ownToString.call(v);
      if (typeof str === "string") return str;
    }
    void proto;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
