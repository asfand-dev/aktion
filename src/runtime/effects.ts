/**
 * Aktion effect runtime — mounts `effect(() => { … }, [...deps])` declarations,
 * runs their triggers, and tears them down on unmount.
 *
 * Each declaration's dependency array mixes:
 *   - state triggers (`$atom`) — re-run when any listed atom changes.
 *   - lifecycle triggers (`on:mount`, `on:unmount`).
 *   - interval triggers (`on:every(N)`) — re-run every N ms.
 *   - rate-limit modifiers (`debounce(N)`, `throttle(N)`) — wrap the body
 *     with a trailing-edge rate-limit.
 *
 * Empty dependency arrays (`effect(() => { ... }, [])`) and explicit
 * `effect(() => { ... }, [on:mount])` are equivalent — both run the body
 * once on mount.
 *
 * `cleanup(fn)` registrations inside the body are collected and fired on
 * unmount, on re-run, or on program reload.
 */

import type {
  ActionDeclaration,
  EffectDeclaration,
  Statement,
} from "../parser/types.js";
import type { EvaluationContext, ScopedEffectDecl } from "./evaluator.js";
import {
  BreakSignal,
  ContinueSignal,
  ReturnSignal,
  evaluate,
  resolveStateAlias,
  runControlFlowStatement,
} from "./evaluator.js";
import type { StateStore, StateValue } from "./state.js";

export interface EffectRunnerOptions {
  state: StateStore;
  /** Called whenever an effect mutates state or completes — schedules render. */
  notify: () => void;
  /** Called when the effect/action body emits a CustomEvent via `emit()`. */
  onEmit?: (eventName: string, detail: unknown) => void;
}

interface MountedEffect {
  decl: EffectDeclaration;
  cleanups: Array<() => void>;
  intervals: Array<ReturnType<typeof setInterval>>;
  unsubscribers: Array<() => void>;
  /** Snapshot of `ctx` at mount-time so re-runs reuse the same scope. */
  ctxRef: () => EvaluationContext;
  /**
   * Per-instance state-alias frames captured at the moment the
   * declaration was discovered inside a function body. Empty
   * for program-level effects, where no alias frame applies. The runner
   * restores these onto `ctx.stateAliases` before evaluating the body
   * so `$x = …` writes resolve to the per-instance slot the surrounding
   * function owns.
   */
  capturedAliases: ReadonlyArray<ReadonlyMap<string, string>>;
  /**
   * Loop variables captured at the moment the declaration was collected
   * — function parameters (`todo` in `function Item(todo) {…}`),
   * slot bindings, and any enclosing `for`-loop variables. The runner
   * restores these onto `ctx.loopVars` before running the body so an
   * effect referencing the surrounding function's parameters keeps
   * working even though the param binding only lives for the duration
   * of `evaluateUserComponent`. Refreshed on every re-render via
   * `syncInstanceEffects` so the effect always sees the latest values.
   */
  capturedLoopVars: ReadonlyMap<string, unknown>;
}

/**
 * Separator used to compose per-instance effect map keys
 * (`<instanceKey>::<decl.name>`). The token doubles as a marker — any
 * mounted-effect key that contains it is per-instance, anything else is a
 * top-level program effect.
 */
const INSTANCE_KEY_SEPARATOR = "::";

/**
 * Shared empty captured-loop-vars map for top-level effects. Reusing a
 * single readonly instance avoids allocating a throwaway `Map` for every
 * top-level effect on every replan.
 */
const EMPTY_LOOP_VARS: ReadonlyMap<string, unknown> = new Map();

export class EffectRunner {
  private mounted = new Map<string, MountedEffect>();
  private errors: string[] = [];

  constructor(private readonly options: EffectRunnerOptions) {}

  /** Get any errors raised at mount-time (denied capabilities, parse issues). */
  getErrors(): ReadonlyArray<string> {
    return this.errors;
  }

  /**
   * Mount every top-level effect declaration in `decls`. Idempotent:
   * declarations that are already mounted under the same name are left
   * alone, those that vanish from the new program are torn down.
   *
   * Only touches global (top-level) effects. Per-instance effects mounted
   * inside function bodies are managed via `syncInstanceEffects`
   * / `unmountInstance` and are not affected by this call.
   */
  syncEffects(
    decls: ReadonlyArray<EffectDeclaration>,
    getCtx: () => EvaluationContext,
  ): void {
    this.errors = [];
    const incoming = new Set(decls.map((d) => d.name));
    // Tear down top-level effects no longer in the program. Per-instance
    // effects (keyed with `<instanceKey>::<decl.name>`) are skipped here.
    for (const name of [...this.mounted.keys()]) {
      if (name.includes(INSTANCE_KEY_SEPARATOR)) continue;
      if (!incoming.has(name)) {
        this.unmount(name);
      }
    }
    for (const decl of decls) {
      if (!this.mounted.has(decl.name)) {
        // Top-level effects have no captured alias frames *or* loop
        // vars — they run against the bare program context.
        this.mount(decl.name, decl, getCtx, [], EMPTY_LOOP_VARS);
      }
    }
  }

  /**
   * Mount per-instance effects discovered inside a function body.
   * Idempotent: re-rendering the same instance with the same effect set is
   * a no-op; effects that vanished from the body since the last render are
   * torn down. Effects belonging to other instances are untouched.
   */
  syncInstanceEffects(
    instanceKey: string,
    decls: ReadonlyArray<ScopedEffectDecl>,
    getCtx: () => EvaluationContext,
  ): void {
    const prefix = `${instanceKey}${INSTANCE_KEY_SEPARATOR}`;
    const incoming = new Set(decls.map((d) => `${prefix}${d.decl.name}`));
    for (const name of [...this.mounted.keys()]) {
      if (!name.startsWith(prefix)) continue;
      if (!incoming.has(name)) this.unmount(name);
    }
    for (const scoped of decls) {
      const key = `${prefix}${scoped.decl.name}`;
      const existing = this.mounted.get(key);
      if (existing) {
        // Re-render: keep the same mounted effect (don't re-fire the
        // body), but refresh the captured loop vars so the next time
        // the body runs it observes the latest prop values rather than
        // the snapshot taken on first mount. Alias frames are stable
        // per instance — derived from `instanceKey` — so they don't
        // need refreshing.
        existing.capturedLoopVars = scoped.capturedLoopVars;
        continue;
      }
      this.mount(
        key,
        scoped.decl,
        getCtx,
        scoped.capturedAliases,
        scoped.capturedLoopVars,
      );
    }
  }

  /**
   * Tear down every effect that belongs to the given component instance
   * (i.e. mounted via `syncInstanceEffects(instanceKey, …)`). Called by
   * the renderer when an instance disappears from the tree so timers,
   * interval handles, and state subscriptions don't outlive the
   * component the user can see.
   */
  unmountInstance(instanceKey: string): void {
    const prefix = `${instanceKey}${INSTANCE_KEY_SEPARATOR}`;
    for (const name of [...this.mounted.keys()]) {
      if (name.startsWith(prefix)) this.unmount(name);
    }
  }

  reset(): void {
    for (const name of [...this.mounted.keys()]) {
      this.unmount(name);
    }
    this.errors = [];
  }

  private mount(
    mountKey: string,
    decl: EffectDeclaration,
    getCtx: () => EvaluationContext,
    capturedAliases: ReadonlyArray<ReadonlyMap<string, string>>,
    capturedLoopVars: ReadonlyMap<string, unknown>,
  ): void {
    const mounted: MountedEffect = {
      decl,
      cleanups: [],
      intervals: [],
      unsubscribers: [],
      ctxRef: getCtx,
      capturedAliases,
      capturedLoopVars,
    };
    this.mounted.set(mountKey, mounted);

    const rawRunBody = (): void => {
      // Reset cleanups before each run — prior cleanups should fire so
      // observers / listeners don't leak across re-fires.
      for (const fn of mounted.cleanups.splice(0)) {
        try { fn(); } catch (err) { logCleanupError(mountKey, err); }
      }
      try {
        runEffectBody(decl, getCtx(), mounted, this.options);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[aktion] effect "${mountKey}" failed`, err);
      } finally {
        this.options.notify();
      }
    };

    // Optional `debounce(N)` / `throttle(N)` modifier — rate-limit the
    // effect body. The wrapper is installed once at mount-time so
    // subsequent re-runs go through the same timer state.
    const runBody = wrapRateLimit(rawRunBody, decl.rateLimit, mounted);

    // Wire triggers.
    let hasMountTrigger = false;
    let hasUnmountTrigger = false;
    let hasEveryTrigger = false;
    for (const trigger of decl.triggers) {
      switch (trigger.kind) {
        case "lifecycle":
          if (trigger.name === "mount") hasMountTrigger = true;
          if (trigger.name === "unmount") hasUnmountTrigger = true;
          break;
        case "every": {
          hasEveryTrigger = true;
          const id = setInterval(runBody, trigger.intervalMs);
          mounted.intervals.push(id);
          break;
        }
        case "state": {
          // Per-instance effects declared inside a function body need to
          // subscribe to the *aliased* atom name, not the bare `$isDone`
          // written by the author. Without this lookup, a Counter
          // instance's effect subscribes to a global `isDone` slot that
          // never changes — the per-instance slot is named
          // `<instanceKey>:isDone`, so the subscriber's `has(…)` check
          // would never match and the effect would never fire.
          const targetName = resolveTriggerAlias(trigger.name, capturedAliases);
          const unsub = this.options.state.subscribe((changed) => {
            if (changed.has(targetName)) runBody();
          });
          mounted.unsubscribers.push(unsub);
          break;
        }
      }
    }

    // Default trigger: if no triggers are declared at all, treat as on:mount.
    // If `on:unmount` is the only trigger, the body is run on teardown
    // instead.
    if (decl.triggers.length === 0 || hasMountTrigger) {
      runBody();
    } else if (!hasEveryTrigger && !hasUnmountTrigger && decl.triggers.every((t) => t.kind === "state")) {
      // Pure state-driven effects also run once on mount so the initial
      // state is observed (matches React's `useEffect` and the spec's
      // "first quiescence" rule for stream effects).
      runBody();
    }
  }

  private unmount(name: string): void {
    const mounted = this.mounted.get(name);
    if (!mounted) return;
    this.mounted.delete(name);

    for (const id of mounted.intervals) clearInterval(id);
    for (const unsub of mounted.unsubscribers) {
      try { unsub(); } catch { /* swallow */ }
    }
    for (const fn of mounted.cleanups) {
      try { fn(); } catch (err) { logCleanupError(name, err); }
    }

    // Run `on:unmount` body if declared.
    const hasUnmountTrigger = mounted.decl.triggers.some(
      (t) => t.kind === "lifecycle" && t.name === "unmount",
    );
    if (hasUnmountTrigger) {
      try {
        runEffectBody(mounted.decl, mounted.ctxRef(), mounted, this.options);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[aktion] effect "${name}" unmount body threw`, err);
      }
    }
  }
}

/**
 * Wrap `run` with a debounce / throttle gate when the declaration carries
 * a `debounce(N)` / `throttle(N)` modifier. Returns the raw `run` when no
 * modifier is present. The pending timer is registered as a cleanup so a
 * fast unmount cancels in-flight calls.
 */
function wrapRateLimit(
  run: () => void,
  rateLimit: EffectDeclaration["rateLimit"],
  mounted: MountedEffect,
): () => void {
  if (!rateLimit || rateLimit.ms <= 0) return run;
  if (rateLimit.kind === "debounce") {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };
    mounted.cleanups.push(cancel);
    return () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; run(); }, rateLimit.ms);
    };
  }
  // Throttle: fire immediately, then ignore further calls until `ms` elapsed.
  let lastFired = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  mounted.cleanups.push(() => {
    if (pending) { clearTimeout(pending); pending = null; }
  });
  return () => {
    const now = Date.now();
    const elapsed = now - lastFired;
    if (elapsed >= rateLimit.ms) {
      lastFired = now;
      run();
    } else if (!pending) {
      // Schedule a trailing call so the latest state still propagates.
      pending = setTimeout(() => {
        pending = null;
        lastFired = Date.now();
        run();
      }, rateLimit.ms - elapsed);
    }
  };
}

function runEffectBody(
  decl: EffectDeclaration,
  ctx: EvaluationContext,
  mounted: MountedEffect,
  options: EffectRunnerOptions,
): void {
  // Walk the block body executing each statement. Effect bodies allow:
  //   - assignments (`$state = …`) — committed as state writes.
  //   - expression statements — evaluated for side effects.
  //   - `cleanup(fn)` calls — register a teardown handler.
  //   - `emit("name", detail)` — dispatch an outbound event.
  //
  // For per-instance effects (declared inside a function body)
  // both the alias stack AND the loop-var map are restored around the
  // run:
  //   - aliases so `$x = …` writes resolve to the per-instance slot the
  //     surrounding function owns (otherwise the assignment would land
  //     on a brand-new top-level atom).
  //   - loop vars so the body can still read function parameters and
  //     enclosing for-loop bindings (`effect(() => { use(todo) }, [$x])`
  //     inside `function Item(todo) { … }`). Without this the param
  //     resolves to `undefined` because `evaluateUserComponent` already
  //     restored the outer scope by the time the effect fires.
  // Top-level effects pass empty captures, so both restore blocks
  // become no-ops.
  const restoreAliases = mounted.capturedAliases.length > 0
    ? ctx.stateAliases.slice()
    : null;
  if (restoreAliases) {
    ctx.stateAliases.length = 0;
    for (const frame of mounted.capturedAliases) {
      ctx.stateAliases.push(new Map(frame));
    }
  }
  const restoreLoopVars = mounted.capturedLoopVars.size > 0
    ? new Map(ctx.loopVars)
    : null;
  if (restoreLoopVars) {
    ctx.loopVars.clear();
    for (const [k, v] of mounted.capturedLoopVars) ctx.loopVars.set(k, v);
  }
  try {
    for (const stmt of decl.body.body) {
      runStatement(stmt, ctx, mounted, options);
    }
  } finally {
    if (restoreAliases) {
      ctx.stateAliases.length = 0;
      for (const frame of restoreAliases) ctx.stateAliases.push(frame);
    }
    if (restoreLoopVars) {
      ctx.loopVars.clear();
      for (const [k, v] of restoreLoopVars) ctx.loopVars.set(k, v);
    }
  }
}

function runStatement(
  stmt: Statement,
  ctx: EvaluationContext,
  mounted: MountedEffect,
  options: EffectRunnerOptions,
): unknown {
  switch (stmt.kind) {
    case "ExpressionStatement": {
      const expr = stmt.expression;
      // `cleanup(fn)` — recognise it and register the callback rather
      // than evaluating the call normally.
      if (expr.kind === "Call" && expr.callee === "cleanup") {
        const cb = expr.arguments[0] ? evaluate(expr.arguments[0], ctx) : null;
        if (typeof cb === "function") {
          mounted.cleanups.push(cb as () => void);
        }
        return undefined;
      }
      // `emit("name", detail)` — dispatch an outbound CustomEvent.
      if (expr.kind === "Call" && expr.callee === "emit") {
        const args = expr.arguments;
        const eventName = args[0] ? String(evaluate(args[0], ctx)) : "";
        const detail = args[1] ? evaluate(args[1], ctx) : undefined;
        options.onEmit?.(eventName, detail);
        return undefined;
      }
      return evaluate(expr, ctx);
    }
    case "Assignment": {
      const value = evaluate(stmt.expression, ctx);
      if (stmt.identifier && stmt.identifier !== "") {
        // Treat any assignment inside an effect body as a state write.
        // Route through the per-instance alias stack so writes from
        // inside a function body hit the right per-instance slot (§7).
        const target = resolveStateAlias(ctx, stmt.identifier);
        ctx.state.set(target, value as StateValue);
      }
      return value;
    }
    case "IfStatement":
    case "ForOfStatement":
    case "ForClassicStatement":
    case "ForInStatement":
    case "SwitchStatement":
    case "WhileStatement":
    case "DoWhileStatement":
    case "TryStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "ThrowStatement":
    case "DestructureStatement":
      // Control-flow statements share semantics with the rest of the
      // evaluator — delegate so `for` / `while` / `if` bodies inside an
      // effect run with the same break/continue/return handling.
      runControlFlowStatement(stmt, ctx);
      return undefined;
    default:
      return undefined;
  }
}

function logCleanupError(name: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[aktion] cleanup for effect "${name}" threw`, err);
}

/**
 * Walk the captured per-instance alias frames (top-of-stack → bottom)
 * looking for `name`. Returns the aliased atom (e.g.
 * `Item@2:0#0:isDone`) when one matches, falls back to the bare name
 * for top-level effects where no frame is captured.
 *
 * Used by the state-trigger subscriber so an effect's dependency list
 * (`effect(() => { … }, [$isDone])`) wires up to the same atom the body
 * reads/writes via the alias stack (§7 — per-instance state). Without
 * this, a per-instance effect would silently never fire because the
 * subscription points at a global `isDone` slot the component never
 * touches.
 */
function resolveTriggerAlias(
  name: string,
  frames: ReadonlyArray<ReadonlyMap<string, string>>,
): string {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const aliased = frames[i]!.get(name);
    if (aliased !== undefined) return aliased;
  }
  return name;
}

/* -------------------------------------------------------------------------- */
/*  Action runner (§10) — optimistic snapshot/rollback                        */
/* -------------------------------------------------------------------------- */

export interface ActionRunnerOptions {
  state: StateStore;
  notify: () => void;
  onEmit?: (eventName: string, detail: unknown) => void;
  onAssistantMessage?: (message: string) => void;
}

/**
 * Run an `action` declaration. When the declaration is `optimistic` we
 * snapshot every state atom touched before the first `await`; if any
 * subsequent step throws, the snapshot is restored.
 */
export class ActionDeclRunner {
  constructor(private readonly options: ActionRunnerOptions) {}

  async run(
    decl: ActionDeclaration,
    callArgs: unknown[],
    ctx: EvaluationContext,
  ): Promise<unknown> {
    // Bind parameters into loop vars so the body can reference them.
    const restore: Array<{ name: string; had: boolean; prev: unknown }> = [];
    for (let i = 0; i < decl.params.length; i += 1) {
      const param = decl.params[i]!;
      const value = callArgs[i];
      restore.push({
        name: param.name,
        had: ctx.loopVars.has(param.name),
        prev: ctx.loopVars.get(param.name),
      });
      ctx.loopVars.set(param.name, value);
    }
    // Snapshot for optimistic rollback. We snapshot the entire state
    // store; the spec only requires snapshotting writes-before-first-await
    // but the simpler whole-store snapshot is always correct (the cost is
    // a single `Map` clone — negligible).
    const snapshot: Map<string, StateValue> | null = decl.optimistic
      ? snapshotState(this.options.state)
      : null;
    try {
      let lastValue: unknown;
      try {
        for (const stmt of decl.body.body) {
          lastValue = await this.runStatement(stmt, ctx);
        }
      } catch (err) {
        if (err instanceof ReturnSignal) {
          this.options.notify();
          return err.value;
        }
        throw err;
      }
      this.options.notify();
      return lastValue;
    } catch (err) {
      // Control-flow signals leaking past the action body are author
      // bugs (`break` outside a loop, etc.) — surface them but don't
      // crash the page.
      if (err instanceof BreakSignal || err instanceof ContinueSignal) {
        // eslint-disable-next-line no-console
        console.error(`[aktion] action "${decl.name}" — \`${err.kind}\` outside a loop.`);
        return undefined;
      }
      if (snapshot) {
        restoreState(this.options.state, snapshot);
        this.options.notify();
      }
      // eslint-disable-next-line no-console
      console.error(`[aktion] action "${decl.name}" failed`, err);
      throw err;
    } finally {
      for (const slot of restore) {
        if (slot.had) ctx.loopVars.set(slot.name, slot.prev);
        else ctx.loopVars.delete(slot.name);
      }
    }
  }

  private async runStatement(
    stmt: Statement,
    ctx: EvaluationContext,
  ): Promise<unknown> {
    switch (stmt.kind) {
      case "ExpressionStatement": {
        const expr = stmt.expression;
        // `emit("name", detail)` — dispatch an outbound CustomEvent.
        if (expr.kind === "Call" && expr.callee === "emit") {
          const args = expr.arguments;
          const eventName = args[0] ? String(evaluate(args[0], ctx)) : "";
          const detail = args[1] ? evaluate(args[1], ctx) : undefined;
          this.options.onEmit?.(eventName, detail);
          return undefined;
        }
        const value = evaluate(expr, ctx);
        return await unwrapPromise(value);
      }
      case "Await": {
        const value = evaluate(stmt.argument, ctx);
        return await unwrapPromise(value);
      }
      case "Assignment": {
        const value = await unwrapPromise(evaluate(stmt.expression, ctx));
        if (stmt.identifier) {
          if (stmt.isState) {
            // Resolve through the per-instance alias stack so an `action`
            // declared inside a function body writes the right slot (§7).
            const target = resolveStateAlias(ctx, stmt.identifier);
            this.options.state.set(target, value as StateValue);
          } else {
            // `let x = …` inside an action body is a local — keep it in
            // the per-frame `loopVars` map so the rest of the body can
            // read it without it leaking into the reactive state store.
            ctx.loopVars.set(stmt.identifier, value);
          }
        }
        return value;
      }
      case "Return": {
        if (!stmt.argument) throw new ReturnSignal(undefined);
        const value = await unwrapPromise(evaluate(stmt.argument, ctx));
        throw new ReturnSignal(value);
      }
      case "IfStatement":
      case "ForOfStatement":
      case "ForClassicStatement":
      case "ForInStatement":
      case "SwitchStatement":
      case "WhileStatement":
      case "DoWhileStatement":
      case "TryStatement":
      case "BreakStatement":
      case "ContinueStatement":
      case "ThrowStatement":
      case "DestructureStatement":
        runControlFlowStatement(stmt, ctx);
        return undefined;
      default:
        return undefined;
    }
  }
}

async function unwrapPromise(value: unknown): Promise<unknown> {
  if (value && typeof (value as { then?: unknown }).then === "function") {
    return await (value as Promise<unknown>);
  }
  return value;
}

function snapshotState(state: StateStore): Map<string, StateValue> {
  const out = new Map<string, StateValue>();
  for (const [name, value] of state.entries()) {
    out.set(name, value);
  }
  return out;
}

function restoreState(state: StateStore, snapshot: Map<string, StateValue>): void {
  for (const [name, value] of snapshot) {
    state.set(name, value);
  }
}
