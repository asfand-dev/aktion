/**
 * Query / Mutation registry.
 *
 * Tools are user-supplied async functions registered against the
 * `<streaming-ui-script>` element. A `Query("toolName", args, defaults, refresh?)`
 * declaration creates an entry that:
 *   - Starts with the `defaults` value so partial UIs render immediately
 *   - Auto-runs whenever `$variables` referenced by `args` change
 *   - Optionally polls every `refresh` seconds
 *
 * A `Mutation` only runs when invoked by `@Run(...)` inside an action.
 */

import type { CallExpr, Expression } from "../parser/types.js";
import { evaluate, type EvaluationContext } from "./evaluator.js";

export type ToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export type ToolRegistry = Record<string, ToolHandler>;

interface BaseEntry {
  name: string;
  toolName: string;
  argsExpr: Expression | null;
  defaults: unknown;
}

export interface QueryEntry extends BaseEntry {
  kind: "Query";
  refreshSeconds: number;
  current: unknown;
  intervalId: ReturnType<typeof setInterval> | null;
  unsubscribe: (() => void) | null;
  inFlight: boolean;
}

export interface MutationEntry extends BaseEntry {
  kind: "Mutation";
  current: unknown;
}

export type Entry = QueryEntry | MutationEntry;

/**
 * Manages every Query/Mutation in the current program. The registry owns
 * lifecycle (auto re-fetch, polling) and exposes the current data so the
 * evaluator and renderer can read it during expression evaluation.
 */
export class QueryRegistry {
  private entries = new Map<string, Entry>();
  private tools: ToolRegistry = {};
  private notify: () => void = () => {};
  /**
   * Returns a fresh `EvaluationContext` for the active program. Set by the
   * planner the first time a Query / Mutation registers so we can re-fetch
   * any query whose tool only just became available (e.g. `setTools(...)`
   * is called after the element's response is already in flight).
   */
  private getCtx: (() => EvaluationContext) | null = null;

  setTools(tools: ToolRegistry): void {
    const previous = this.tools;
    this.tools = tools;
    if (!this.getCtx) return;
    // Re-bootstrap any Query whose tool was missing before this call so it
    // fetches the first time around. Without this, host pages that register
    // tools *after* installing the response (a very common shape — tools
    // depend on auth/session that resolves asynchronously) would never see
    // a network call.
    for (const entry of this.entries.values()) {
      if (entry.kind !== "Query") continue;
      const hadHandler = Boolean(previous[entry.toolName]);
      const hasHandler = Boolean(tools[entry.toolName]);
      if (!hadHandler && hasHandler) {
        void this.execute(entry, this.getCtx);
      }
    }
  }

  /** Current tool registry (used by host elements to expose `.tools`). */
  getTools(): ToolRegistry {
    return this.tools;
  }

  /** List the names of tools registered on this registry. */
  toolNames(): string[] {
    return Object.keys(this.tools);
  }

  /**
   * Invoke a registered tool by name. Used by the JS bridge so scripts can
   * trigger backend calls without going through Query / Mutation declarations.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const handler = this.tools[name];
    if (!handler) throw new Error(`Tool "${name}" is not registered`);
    return handler(args);
  }

  setNotify(notify: () => void): void {
    this.notify = notify;
  }

  list(): Entry[] {
    return [...this.entries.values()];
  }

  get(name: string): Entry | undefined {
    return this.entries.get(name);
  }

  /**
   * Register a Query / Mutation expression. We capture the AST args and
   * a getter for the current evaluation context so we can re-evaluate args
   * (which may reference `$variables`) just before each invocation.
   */
  register(name: string, callExpr: CallExpr, getCtx: () => EvaluationContext): void {
    this.getCtx = getCtx;
    const isQuery = callExpr.callee === "Query";
    const toolNameExpr = callExpr.arguments[0];
    const argsExpr = callExpr.arguments[1] ?? null;
    const defaultsExpr = callExpr.arguments[2] ?? null;
    const refreshExpr = callExpr.arguments[3] ?? null;

    const toolName = toolNameExpr && toolNameExpr.kind === "Literal"
      ? String(toolNameExpr.value ?? "")
      : "";

    const defaults = defaultsExpr ? evaluateStaticDefault(defaultsExpr) : null;
    const refreshSeconds = refreshExpr && refreshExpr.kind === "Literal"
      ? Number(refreshExpr.value ?? 0) || 0
      : 0;

    if (isQuery) {
      const entry: QueryEntry = {
        kind: "Query",
        name,
        toolName,
        argsExpr,
        defaults,
        refreshSeconds,
        current: defaults,
        intervalId: null,
        unsubscribe: null,
        inFlight: false,
      };
      this.entries.set(name, entry);
      this.bootstrapQuery(entry, getCtx);
    } else {
      const entry: MutationEntry = {
        kind: "Mutation",
        name,
        toolName,
        argsExpr,
        defaults,
        current: defaults,
      };
      this.entries.set(name, entry);
    }
  }

  /** Stop polling and clear all entries. Called when reloading the program. */
  reset(): void {
    for (const entry of this.entries.values()) {
      if (entry.kind === "Query") {
        if (entry.intervalId) clearInterval(entry.intervalId);
        if (entry.unsubscribe) entry.unsubscribe();
      }
    }
    this.entries.clear();
    // Drop the context getter so a future `setTools(...)` doesn't re-fire
    // queries against a torn-down program.
    this.getCtx = null;
  }

  /**
   * Run a query or mutation imperatively. For queries, the cached result
   * is updated. For mutations, the same flow runs once.
   */
  async run(name: string, getCtx: () => EvaluationContext): Promise<unknown> {
    const entry = this.entries.get(name);
    if (!entry) return null;
    return this.execute(entry, getCtx);
  }

  /** Get the current value or default for a Query/Mutation reference. */
  valueOf(name: string): unknown {
    const entry = this.entries.get(name);
    if (!entry) return null;
    return entry.current ?? entry.defaults;
  }

  private async execute(entry: Entry, getCtx: () => EvaluationContext): Promise<unknown> {
    const handler = this.tools[entry.toolName];
    if (!handler) {
      // No tool registered → keep defaults. Don't notify because nothing changed
      // (notifying here would cause every re-plan to schedule another render).
      return entry.current ?? entry.defaults;
    }
    const ctx = getCtx();
    const args = entry.argsExpr ? evaluateArgsObject(entry.argsExpr, ctx) : {};

    if (entry.kind === "Query") entry.inFlight = true;
    try {
      const result = await handler(args);
      entry.current = result ?? entry.defaults;
    } catch (err) {
      entry.current = entry.defaults;
      // eslint-disable-next-line no-console
      console.error(`[streaming-ui-script] tool "${entry.toolName}" failed`, err);
    } finally {
      if (entry.kind === "Query") entry.inFlight = false;
      this.notify();
    }
    return entry.current;
  }

  private bootstrapQuery(entry: QueryEntry, getCtx: () => EvaluationContext): void {
    // Initial run.
    void this.execute(entry, getCtx);

    // Auto re-run when any state referenced by args changes.
    const ctx = getCtx();
    const trackedNames = collectStateRefs(entry.argsExpr);
    if (trackedNames.size > 0) {
      entry.unsubscribe = ctx.state.subscribe((changed) => {
        for (const name of changed) {
          if (trackedNames.has(name)) {
            void this.execute(entry, getCtx);
            break;
          }
        }
      });
    }

    if (entry.refreshSeconds > 0) {
      entry.intervalId = setInterval(() => {
        void this.execute(entry, getCtx);
      }, entry.refreshSeconds * 1000);
    }
  }
}

function evaluateStaticDefault(expr: Expression): unknown {
  switch (expr.kind) {
    case "Literal": return expr.value;
    case "Array": {
      const out: unknown[] = [];
      for (const e of expr.elements) {
        if (e.kind === "Spread") continue;
        out.push(evaluateStaticDefault(e));
      }
      return out;
    }
    case "Object": {
      const obj: Record<string, unknown> = {};
      for (const prop of expr.properties) {
        if (prop.spread) continue;
        obj[prop.key] = evaluateStaticDefault(prop.value);
      }
      return obj;
    }
    case "Template": {
      // Static templates with zero expressions collapse to the single quasi.
      if (expr.expressions.length === 0) return expr.quasis[0] ?? "";
      return null;
    }
    default: return null;
  }
}

function evaluateArgsObject(expr: Expression, ctx: EvaluationContext): Record<string, unknown> {
  // Delegate to the full evaluator so query args can use any expression the
  // language supports (Member access, Binary ops, builtins like @Filter, …),
  // not just literal-only shapes. Returns {} for non-object expressions to
  // keep call sites simple.
  const value = evaluate(expr, ctx);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function collectStateRefs(expr: Expression | null): Set<string> {
  const out = new Set<string>();
  if (!expr) return out;
  visit(expr, (node) => {
    if (node.kind === "StateRef") out.add(node.name);
  });
  return out;
}

function visit(node: Expression, fn: (node: Expression) => void): void {
  fn(node);
  switch (node.kind) {
    case "Array":
      node.elements.forEach((e) => visit(e, fn));
      break;
    case "Object":
      node.properties.forEach((p) => visit(p.value, fn));
      break;
    case "Member":
      visit(node.object, fn);
      break;
    case "Unary":
      visit(node.argument, fn);
      break;
    case "Binary":
      visit(node.left, fn);
      visit(node.right, fn);
      break;
    case "Ternary":
      visit(node.test, fn);
      visit(node.consequent, fn);
      visit(node.alternate, fn);
      break;
    case "Call":
    case "BuiltinCall":
      node.arguments.forEach((a) => visit(a, fn));
      break;
    case "Template":
      node.expressions.forEach((e) => visit(e, fn));
      break;
    case "Spread":
      visit(node.argument, fn);
      break;
    default: break;
  }
}
