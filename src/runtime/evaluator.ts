/**
 * Evaluator for Streaming UI Script programs.
 *
 * The evaluator walks expressions to produce values. Component calls
 * become `ComponentNode` objects that the renderer maps to web components.
 * Expressions that reference `$variables` or queries are wrapped in a
 * `Computation` so that their dependencies can be tracked and re-evaluated
 * when state changes.
 */

import type {
  Expression,
  Program,
  AssignmentStatement,
} from "../parser/types.js";
import type { StateStore } from "./state.js";
import type { QueryRegistry } from "./queries.js";
import {
  dataBuiltins,
  isActionStep,
  type ActionPayload,
  type ActionStep,
  type ThemeNode,
} from "./builtins.js";
import { matchRoute, type Router, type RouteParams } from "./router.js";

export interface ArgMeta {
  /** Name of the `$variable` if this argument is a direct state reference. */
  stateRef?: string;
}

export interface ComponentNode {
  __kind: "Component";
  /** Component name as written in Streaming UI Script. */
  name: string;
  /** Positional arguments after evaluation. */
  args: unknown[];
  /** Per-position metadata (state ref binding, etc.). */
  argMeta: ArgMeta[];
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
 * Authored macro — `MyUserCard(user) = Card([...])`. Stored on the
 * evaluation context so callers can find and invoke it with positional args.
 */
export interface MacroDefinition {
  /** Macro parameter names in declaration order. */
  params: string[];
  /** Macro body — evaluated with the parameters bound as loop variables. */
  expression: Expression;
}

export interface EvaluationContext {
  state: StateStore;
  queries: QueryRegistry;
  /** Per-program scope for non-state assignments (refs to other lines). */
  bindings: Map<string, () => unknown>;
  /**
   * Raw AST expressions for each top-level identifier. Used by `Routes(...)`
   * to deferr-evaluate a matched `Route(path, content)`'s content with the
   * extracted path params injected as a loop variable.
   */
  expressions: Map<string, Expression>;
  /** Macro definitions — looked up before component renderers in calls. */
  macros: Map<string, MacroDefinition>;
  /** Set of $variable names accessed during the current evaluation. */
  trackedState: Set<string>;
  /** Set of query/mutation refs accessed during the current evaluation. */
  trackedQueries: Set<string>;
  /** Inline loop variables for `@Each` and `Routes` (`params`). */
  loopVars: Map<string, unknown>;
  /** Optional router — used to special-case `Routes(...)` and `@Navigate(...)`. */
  router?: Router;
}

/** Build a top-level evaluation context for a freshly parsed program. */
export function createContext(
  state: StateStore,
  queries: QueryRegistry,
  router?: Router,
): EvaluationContext {
  return {
    state,
    queries,
    bindings: new Map(),
    expressions: new Map(),
    macros: new Map(),
    trackedState: new Set(),
    trackedQueries: new Set(),
    loopVars: new Map(),
    router,
  };
}

/**
 * Plan a program: declare state variables, register queries/mutations, and
 * build lazy bindings for every assignment so forward references resolve.
 */
export function planProgram(program: Program, ctx: EvaluationContext): void {
  const seen = new Map<string, AssignmentStatement>();
  for (const stmt of program.statements) {
    seen.set((stmt.isState ? "$" : "") + stmt.identifier, stmt);
  }

  // First pass: declare state defaults so $vars resolve immediately.
  for (const stmt of program.statements) {
    if (stmt.isState) {
      const initial = evaluateLiteral(stmt.expression);
      if (stmt.isPersistent) {
        ctx.state.declarePersistent(stmt.identifier, initial);
      } else {
        ctx.state.declare(stmt.identifier, initial);
      }
    }
  }

  // Second pass: register queries/mutations early so refs are valid.
  for (const stmt of program.statements) {
    if (stmt.isState) continue;
    if (stmt.expression.kind === "Call" && (stmt.expression.callee === "Query" || stmt.expression.callee === "Mutation")) {
      ctx.queries.register(stmt.identifier, stmt.expression, () => ctx);
    }
  }

  // Third pass: install lazy bindings for non-state assignments. We also
  // keep the raw AST around (in `ctx.expressions`) so `Routes(...)` can find
  // a `Route(path, content)` referenced by name and re-evaluate its content
  // with path params injected as a loop variable.
  for (const stmt of program.statements) {
    if (stmt.isState) continue;
    if (stmt.params) {
      // Macro definition — registered separately and NOT installed as a
      // binding (calling the bare name would otherwise yield the body
      // evaluated with the parameters unbound).
      ctx.macros.set(stmt.identifier, {
        params: stmt.params,
        expression: stmt.expression,
      });
      continue;
    }
    ctx.expressions.set(stmt.identifier, stmt.expression);
    if (
      stmt.expression.kind === "Call" &&
      (stmt.expression.callee === "Query" || stmt.expression.callee === "Mutation")
    ) {
      const id = stmt.identifier;
      ctx.bindings.set(id, () => {
        ctx.trackedQueries.add(id);
        return ctx.queries.valueOf(id);
      });
    } else {
      ctx.bindings.set(stmt.identifier, () => evaluate(stmt.expression, ctx));
    }
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
      const binding = ctx.bindings.get(expr.name);
      if (binding) return binding();
      // Unknown identifier — render as null so the parser is forgiving.
      return null;
    }
    case "StateRef": {
      // Track via the same name regardless of persistence — the state store
      // owns both flavours under a single namespace.
      ctx.trackedState.add(expr.name);
      return ctx.state.get(expr.name);
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
      return memberAccess(target, expr.property);
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
    case "BuiltinCall": return evaluateBuiltinCall(expr.name, expr.arguments, ctx);
    case "Template": return evaluateTemplate(expr.quasis, expr.expressions, ctx);
    case "Spread": {
      // A bare spread outside of an array/object literal collapses to its
      // argument value. The array/object evaluators handle the spread
      // semantics, so we only reach here for malformed input.
      return evaluate(expr.argument, ctx);
    }
    default: return null;
  }
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

function evaluateComponentCall(
  callee: string,
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  // Macro call — `MyUserCard(user)` defined as `MyUserCard(user) = …`.
  // Resolved before component dispatch so authors can shadow component
  // names with their own macros if they really want to.
  const macro = ctx.macros.get(callee);
  if (macro) {
    return invokeMacro(macro, args, ctx);
  }

  // Special: Query/Mutation evaluation reads the registered runtime value.
  if (callee === "Query") {
    return null; // handled by registry
  }
  if (callee === "Mutation") {
    return null; // mutations are run via @Run inside actions
  }
  if (callee === "Routes") {
    return evaluateRoutes(args, ctx, loc);
  }
  if (callee === "Theme") {
    // `Theme({colorPrimary: "...", ...})` — capture an arbitrary token map
    // to be applied on top of the base theme between render cycles. We do
    // not render anything; the element picks the value up via the `theme`
    // binding (or any other binding) and writes the tokens to its host.
    const tokensArg = args[0];
    let tokens: Record<string, string> = {};
    if (tokensArg) {
      const evaluated = evaluate(tokensArg, ctx);
      if (evaluated && typeof evaluated === "object" && !Array.isArray(evaluated)) {
        for (const [key, value] of Object.entries(evaluated as Record<string, unknown>)) {
          if (value == null) continue;
          if (typeof value === "string" && value.trim() !== "") tokens[key] = value;
          else if (typeof value === "number") tokens[key] = String(value);
        }
      }
    }
    const node: ThemeNode = { kind: "Theme", tokens };
    return node;
  }
  if (callee === "Action") {
    const stepsArg = args[0];
    let steps: ActionStep[] = [];
    if (stepsArg && stepsArg.kind === "Array") {
      steps = stepsArg.elements
        .map((e) => evaluate(e, ctx))
        .filter(isActionStep);
    } else if (stepsArg) {
      const value = evaluate(stepsArg, ctx);
      if (Array.isArray(value)) steps = value.filter(isActionStep);
      else if (isActionStep(value)) steps = [value];
    }
    const payload: ActionPayload = { kind: "Action", steps };
    return payload;
  }

  const evaluated: unknown[] = args.map((arg) => evaluate(arg, ctx));
  const argMeta: ArgMeta[] = args.map((arg) => (arg.kind === "StateRef" ? { stateRef: arg.name } : {}));
  const node: ComponentNode = {
    __kind: "Component",
    name: callee,
    args: evaluated,
    argMeta,
    source: loc,
  };
  return node;
}

function invokeMacro(
  macro: MacroDefinition,
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  // Snapshot every existing binding for the macro's parameter names so we
  // can restore them after evaluation. This mirrors the `@Each` loop-var
  // scoping rules — the parameters are visible inside the body only.
  const restore: Array<{ name: string; had: boolean; prev: unknown }> = [];
  for (let i = 0; i < macro.params.length; i += 1) {
    const name = macro.params[i]!;
    const argExpr = args[i];
    const value = argExpr ? evaluate(argExpr, ctx) : undefined;
    restore.push({ name, had: ctx.loopVars.has(name), prev: ctx.loopVars.get(name) });
    ctx.loopVars.set(name, value);
  }
  try {
    return evaluate(macro.expression, ctx);
  } finally {
    for (const slot of restore) {
      if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
      else ctx.loopVars.delete(slot.name);
    }
  }
}

function evaluateBuiltinCall(
  name: string,
  args: Expression[],
  ctx: EvaluationContext,
): unknown {
  // Action step builtins.
  if (name === "Run") {
    const ref = args[0];
    const refName = ref && ref.kind === "Identifier" ? ref.name : "";
    if (refName) ctx.trackedQueries.add(refName);
    return { kind: "Run", ref: refName } satisfies ActionStep;
  }
  if (name === "Set") {
    const target = args[0];
    const valueExpr = args[1];
    const stateName = target && target.kind === "StateRef" ? target.name : "";
    const value = valueExpr ? evaluate(valueExpr, ctx) : undefined;
    return { kind: "Set", name: stateName, value } satisfies ActionStep;
  }
  if (name === "Reset") {
    const names = args
      .map((a) => (a.kind === "StateRef" ? a.name : ""))
      .filter(Boolean);
    return { kind: "Reset", names } satisfies ActionStep;
  }
  if (name === "ToAssistant") {
    const message = args[0] ? String(evaluate(args[0], ctx) ?? "") : "";
    return { kind: "ToAssistant", message } satisfies ActionStep;
  }
  if (name === "OpenUrl") {
    const url = args[0] ? String(evaluate(args[0], ctx) ?? "") : "";
    return { kind: "OpenUrl", url } satisfies ActionStep;
  }
  if (name === "Navigate") {
    const path = args[0] ? String(evaluate(args[0], ctx) ?? "") : "";
    return { kind: "Navigate", path } satisfies ActionStep;
  }
  if (name === "Js") {
    // @Js(body, args?) — `body` is a JS string. The optional `args` is an
    // object evaluated at render time and exposed to the body as `ctx.args`.
    // Use it to capture per-item values inside @Each loops without resorting
    // to string concatenation:
    //   @Each($todos, "t", Button("X", Action([
    //     @Js("ctx.state.set('todos', (ctx.state.get('todos')||[]).filter(x => x.id !== ctx.args.id))", {id: t.id})
    //   ])))
    const code = args[0] ? String(evaluate(args[0], ctx) ?? "") : "";
    let capturedArgs: Record<string, unknown> = {};
    if (args[1]) {
      const evaluated = evaluate(args[1], ctx);
      if (evaluated && typeof evaluated === "object" && !Array.isArray(evaluated)) {
        capturedArgs = evaluated as Record<string, unknown>;
      }
    }
    return { kind: "Js", code, args: capturedArgs } satisfies ActionStep;
  }

  // Iteration builtin uses unevaluated AST.
  if (name === "Each") {
    const sourceArg = args[0];
    const varNameArg = args[1];
    const templateArg = args[2];
    if (!sourceArg || !varNameArg || !templateArg) return [];
    const sourceValue = evaluate(sourceArg, ctx);
    const arr = Array.isArray(sourceValue) ? sourceValue : [];
    const varName = varNameArg.kind === "Literal" ? String(varNameArg.value ?? "") : "";
    // Destructuring forms: `"{id, name, role}"` binds those fields directly
    // in addition to the row object (also bound under its single-name
    // counterpart for backward compatibility — `"{id, name}"` exposes
    // `id` / `name`; `"row,{id,name}"` would expose `row`, `id`, `name`).
    const destructuring = parseDestructureNames(varName);
    const out: unknown[] = [];
    // Snapshot every binding we are about to overwrite so we can restore
    // the outer scope exactly — including the legitimate case where the
    // outer value is `undefined`. Using `has(...)` instead of `prev ===
    // undefined` prevents an inner @Each from accidentally deleting an
    // outer loop var.
    const snapshots = destructuring.bindings.map((name) => ({
      name,
      had: ctx.loopVars.has(name),
      prev: ctx.loopVars.get(name),
    }));
    try {
      for (const item of arr) {
        if (destructuring.scalarName) {
          ctx.loopVars.set(destructuring.scalarName, item);
        }
        for (const field of destructuring.fields) {
          if (item && typeof item === "object") {
            ctx.loopVars.set(field, (item as Record<string, unknown>)[field]);
          } else {
            ctx.loopVars.set(field, undefined);
          }
        }
        out.push(evaluate(templateArg, ctx));
      }
    } finally {
      for (const slot of snapshots) {
        if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
        else ctx.loopVars.delete(slot.name);
      }
    }
    return out;
  }

  // Lazy conditional renderer: `@If(cond, trueNode, falseNode?)`. Only the
  // selected branch is evaluated — useful for forms whose alternate branch
  // would otherwise consume `params.id` / loop variables in scope.
  if (name === "If") {
    const condArg = args[0];
    const thenArg = args[1];
    const elseArg = args[2];
    if (!condArg) return null;
    const condition = evaluate(condArg, ctx);
    if (condition) return thenArg ? evaluate(thenArg, ctx) : null;
    return elseArg ? evaluate(elseArg, ctx) : null;
  }

  // Lazy switch: `@Switch(value, { key1: branch1, key2: branch2 }, default?)`.
  // The map's branches are evaluated lazily — only the matching branch
  // (or the default) is computed.
  if (name === "Switch") {
    const valueArg = args[0];
    const casesArg = args[1];
    const defaultArg = args[2];
    if (!valueArg || !casesArg) return null;
    const value = evaluate(valueArg, ctx);
    const key = stringify(value);
    if (casesArg.kind === "Object") {
      for (const prop of casesArg.properties) {
        if (prop.spread) continue;
        if (prop.key === key) return evaluate(prop.value, ctx);
      }
    }
    return defaultArg ? evaluate(defaultArg, ctx) : null;
  }

  const fn = dataBuiltins[name];
  if (!fn) return null;
  const evaluated = args.map((a) => evaluate(a, ctx));
  return fn(evaluated);
}

/**
 * Parse an `@Each` loop variable specifier into the set of names to bind.
 * Supports:
 *   - `"row"`                       — single scalar binding
 *   - `"{id, name}"`                — destructure the row object's fields
 *   - `"row, {id, name}"`           — bind the row AND destructured fields
 * The result lists every name we will write into `ctx.loopVars` so the
 * caller can snapshot/restore them.
 */
function parseDestructureNames(spec: string): {
  scalarName: string;
  fields: string[];
  bindings: string[];
} {
  const trimmed = spec.trim();
  if (!trimmed) return { scalarName: "", fields: [], bindings: [] };

  // `{a, b, c}` — pure destructure.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const fields = trimmed.slice(1, -1).split(",").map((f) => f.trim()).filter(Boolean);
    return { scalarName: "", fields, bindings: fields };
  }
  // `row, {a, b}` — row binding plus destructured fields.
  const braceIdx = trimmed.indexOf("{");
  if (braceIdx > 0) {
    const head = trimmed.slice(0, braceIdx).trim();
    const scalar = head.replace(/,\s*$/, "").trim();
    const closeIdx = trimmed.indexOf("}", braceIdx);
    const fields = closeIdx > braceIdx
      ? trimmed.slice(braceIdx + 1, closeIdx).split(",").map((f) => f.trim()).filter(Boolean)
      : [];
    return { scalarName: scalar, fields, bindings: scalar ? [scalar, ...fields] : fields };
  }
  return { scalarName: trimmed, fields: [], bindings: [trimmed] };
}

/**
 * Special-case `Routes(items, default?)` evaluation. We inspect the items
 * array AST to find candidate `Route(path, content)` expressions, pick the
 * one whose path matches the router's current path, and re-evaluate that
 * Route's content with `params` injected as a loop variable. The resulting
 * tree is wrapped in a `Routes` component node whose first arg is the
 * matched content (the renderer just renders whatever's inside).
 *
 * Doing the match at evaluation time (rather than at render time) is what
 * lets the matched page's content read `params.id` correctly on the very
 * first frame after a route change — there's no "stale params" tick.
 */
function evaluateRoutes(
  args: Expression[],
  ctx: EvaluationContext,
  loc?: { line: number; column: number },
): unknown {
  const path = readRoutePath(ctx);
  const defaultExpr = args[1];
  const itemsExpr = args[0];

  const candidates = collectRouteCandidates(itemsExpr, ctx);

  let matched: { pattern: string; params: RouteParams; contentExpr: Expression | undefined } | null = null;

  for (const candidate of candidates) {
    const result = matchRoute(candidate.pattern, path);
    if (result.matched) {
      matched = { pattern: candidate.pattern, params: result.params, contentExpr: candidate.contentExpr };
      break;
    }
  }

  if (!matched && defaultExpr) {
    const defaultPath = String(evaluate(defaultExpr, ctx) ?? "");
    if (defaultPath) {
      for (const candidate of candidates) {
        if (candidate.pattern === defaultPath || matchRoute(candidate.pattern, defaultPath).matched) {
          matched = { pattern: candidate.pattern, params: {}, contentExpr: candidate.contentExpr };
          break;
        }
      }
    }
  }

  // If still no match but we have any candidates, fall back to the first one
  // so the LLM-generated UI is never blank. This is also the path taken when
  // routes are disabled — `path` defaults to `/` and a `Route("/")` (if any)
  // wins, otherwise the first declared page shows.
  if (!matched && candidates.length > 0) {
    matched = { pattern: candidates[0]!.pattern, params: {}, contentExpr: candidates[0]!.contentExpr };
  }

  let content: unknown = null;
  if (matched && matched.contentExpr) {
    const prev = ctx.loopVars.get("params");
    const hadPrev = ctx.loopVars.has("params");
    ctx.loopVars.set("params", matched.params);
    try {
      content = evaluate(matched.contentExpr, ctx);
    } finally {
      if (hadPrev) ctx.loopVars.set("params", prev);
      else ctx.loopVars.delete("params");
    }
  }

  // Record the match on the router so `NavLink(active)` can highlight the
  // currently active anchor. Done outside the params loop so we never
  // re-enter evaluation through the router.
  ctx.router?.setActiveMatch(matched ? matched.pattern : null, matched ? matched.params : {});

  return {
    __kind: "Component",
    name: "Routes",
    args: [content, matched ? matched.pattern : ""],
    argMeta: [{}, {}],
    source: loc,
  } satisfies ComponentNode;
}

/**
 * Collect every `Route(path, content)` AST expression referenced from `items`.
 * `items` can be an inline array literal of Route calls, an identifier
 * referencing an array, or even a single identifier pointing at a Route —
 * we resolve all three so the LLM is free to write Routes the most natural
 * way for the response.
 */
function collectRouteCandidates(
  expr: Expression | undefined,
  ctx: EvaluationContext,
): Array<{ pattern: string; contentExpr: Expression | undefined }> {
  if (!expr) return [];

  if (expr.kind === "Array") {
    const out: Array<{ pattern: string; contentExpr: Expression | undefined }> = [];
    for (const element of expr.elements) {
      const resolved = resolveRouteExpr(element, ctx);
      if (resolved) out.push(resolved);
    }
    return out;
  }

  if (expr.kind === "Identifier") {
    const referenced = ctx.expressions.get(expr.name);
    if (referenced) return collectRouteCandidates(referenced, ctx);
  }

  const single = resolveRouteExpr(expr, ctx);
  return single ? [single] : [];
}

function resolveRouteExpr(
  expr: Expression,
  ctx: EvaluationContext,
): { pattern: string; contentExpr: Expression | undefined } | null {
  if (expr.kind === "Call" && expr.callee === "Route") {
    const patternExpr = expr.arguments[0];
    const pattern = patternExpr ? String(evaluate(patternExpr, ctx) ?? "") : "";
    return { pattern, contentExpr: expr.arguments[1] };
  }
  if (expr.kind === "Identifier") {
    const referenced = ctx.expressions.get(expr.name);
    if (referenced) return resolveRouteExpr(referenced, ctx);
  }
  return null;
}

/**
 * Resolve the current route path. Prefers the router (when present), falls
 * back to `$route` state, and finally to "/". Tracking `$route` here makes
 * `Routes(...)` reactive to host pages that write the path imperatively
 * (e.g. for SSR-style hydration).
 */
function readRoutePath(ctx: EvaluationContext): string {
  if (ctx.router) {
    return ctx.router.getPath();
  }
  if (ctx.state.has("route")) {
    ctx.trackedState.add("route");
    const value = ctx.state.get("route");
    if (typeof value === "string" && value) return value;
  }
  return "/";
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

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
