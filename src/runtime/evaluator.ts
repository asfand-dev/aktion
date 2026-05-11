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
} from "./builtins.js";

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

export interface EvaluationContext {
  state: StateStore;
  queries: QueryRegistry;
  /** Per-program scope for non-state assignments (refs to other lines). */
  bindings: Map<string, () => unknown>;
  /** Set of $variable names accessed during the current evaluation. */
  trackedState: Set<string>;
  /** Set of query/mutation refs accessed during the current evaluation. */
  trackedQueries: Set<string>;
  /** Inline loop variables for `@Each`. */
  loopVars: Map<string, unknown>;
}

/** Build a top-level evaluation context for a freshly parsed program. */
export function createContext(state: StateStore, queries: QueryRegistry): EvaluationContext {
  return {
    state,
    queries,
    bindings: new Map(),
    trackedState: new Set(),
    trackedQueries: new Set(),
    loopVars: new Map(),
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
      ctx.state.declare(stmt.identifier, initial);
    }
  }

  // Second pass: register queries/mutations early so refs are valid.
  for (const stmt of program.statements) {
    if (stmt.isState) continue;
    if (stmt.expression.kind === "Call" && (stmt.expression.callee === "Query" || stmt.expression.callee === "Mutation")) {
      ctx.queries.register(stmt.identifier, stmt.expression, () => ctx);
    }
  }

  // Third pass: install lazy bindings for non-state assignments.
  for (const stmt of program.statements) {
    if (stmt.isState) continue;
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
 * defaults. Falls back to undefined for expressions that need a full context.
 */
function evaluateLiteral(expr: Expression): unknown {
  switch (expr.kind) {
    case "Literal": return expr.value;
    case "Array": return expr.elements.map(evaluateLiteral);
    case "Object": {
      const obj: Record<string, unknown> = {};
      for (const prop of expr.properties) obj[prop.key] = evaluateLiteral(prop.value);
      return obj;
    }
    default: return undefined;
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
      ctx.trackedState.add(expr.name);
      return ctx.state.get(expr.name);
    }
    case "Array": return expr.elements.map((e) => evaluate(e, ctx));
    case "Object": {
      const obj: Record<string, unknown> = {};
      for (const prop of expr.properties) obj[prop.key] = evaluate(prop.value, ctx);
      return obj;
    }
    case "Member": {
      const target = evaluate(expr.object, ctx);
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
    default: return null;
  }
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
  // Special: Query/Mutation evaluation reads the registered runtime value.
  if (callee === "Query") {
    return null; // handled by registry
  }
  if (callee === "Mutation") {
    return null; // mutations are run via @Run inside actions
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
    const out: unknown[] = [];
    for (const item of arr) {
      const prev = ctx.loopVars.get(varName);
      ctx.loopVars.set(varName, item);
      out.push(evaluate(templateArg, ctx));
      if (prev === undefined) ctx.loopVars.delete(varName);
      else ctx.loopVars.set(varName, prev);
    }
    return out;
  }

  const fn = dataBuiltins[name];
  if (!fn) return null;
  const evaluated = args.map((a) => evaluate(a, ctx));
  return fn(evaluated);
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
