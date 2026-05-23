/**
 * Aktion effect runtime — mounts `effect [ ...deps ] { … }` blocks,
 * runs their triggers, and tears them down on unmount.
 *
 * Each declaration's bracketed dependency list mixes:
 *   - state triggers (`$atom`) — re-run when any listed atom changes.
 *   - lifecycle triggers (`on:mount`, `on:unmount`).
 *   - interval triggers (`on:every(N)`) — re-run every N ms.
 *   - rate-limit modifiers (`debounce(N)`, `throttle(N)`) — wrap the body
 *     with a trailing-edge rate-limit.
 *
 * Empty dependency lists (`effect { ... }`) and explicit
 * `effect [on:mount] { ... }` are equivalent — both run the body once on
 * mount.
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
import { evaluate, resolveStateAlias } from "./evaluator.js";
import type { StateStore, StateValue } from "./state.js";

export interface EffectRunnerOptions {
  state: StateStore;
  /** Called whenever an effect mutates state or completes — schedules render. */
  notify: () => void;
  /** Called when the action body emits a CustomEvent via `emit`. */
  onEmit?: (eventName: string, detail: unknown) => void;
  /** Host element — exposed to `js{}` block bodies as `ctx.host`. */
  host?: HTMLElement;
  /**
   * Optional pluggable async tool registry — exposed to `js{}` blocks as
   * `ctx.tools.<name>(...)`. Each entry is invoked with whatever args the
   * JS body passes; the return value is awaited. Hosts can register fetch
   * shims, persistence helpers, etc.
   */
  tools?: Record<string, (...args: unknown[]) => unknown>;
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
   * declaration was discovered inside a `component { … }` body. Empty
   * for program-level effects, where no alias frame applies. The runner
   * restores these onto `ctx.stateAliases` before evaluating the body
   * so `$x = …` writes resolve to the per-instance slot the surrounding
   * component owns.
   */
  capturedAliases: ReadonlyArray<ReadonlyMap<string, string>>;
}

/**
 * Separator used to compose per-instance effect map keys
 * (`<instanceKey>::<decl.name>`). The token doubles as a marker — any
 * mounted-effect key that contains it is per-instance, anything else is a
 * top-level program effect.
 */
const INSTANCE_KEY_SEPARATOR = "::";

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
   * inside `component { … }` bodies are managed via `syncInstanceEffects`
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
        this.mount(decl.name, decl, getCtx, []);
      }
    }
  }

  /**
   * Mount per-instance effects discovered inside a `component { … }` body.
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
      if (!this.mounted.has(key)) {
        this.mount(key, scoped.decl, getCtx, scoped.capturedAliases);
      }
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
  ): void {
    const mounted: MountedEffect = {
      decl,
      cleanups: [],
      intervals: [],
      unsubscribers: [],
      ctxRef: getCtx,
      capturedAliases,
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
          const targetName = trigger.name;
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
  //   - `emit "name" { detail }` — dispatch an outbound event.
  //
  // For per-instance effects (declared inside a `component { … }` body)
  // the captured alias stack is restored around the run so `$x = …`
  // writes resolve to the per-instance slot the surrounding component
  // owns — without this the assignment would silently write the
  // top-level `x` instead. Top-level effects pass an empty array which
  // makes the push/pop a no-op.
  const restoreAliases = mounted.capturedAliases.length > 0
    ? ctx.stateAliases.slice()
    : null;
  if (restoreAliases) {
    ctx.stateAliases.length = 0;
    for (const frame of mounted.capturedAliases) {
      ctx.stateAliases.push(new Map(frame));
    }
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
      // `cleanup(fn)` is a function call — recognise it and register the
      // callback rather than evaluating the call normally.
      if (expr.kind === "Call" && expr.callee === "cleanup") {
        const cb = expr.arguments[0] ? evaluate(expr.arguments[0], ctx) : null;
        if (typeof cb === "function") {
          mounted.cleanups.push(cb as () => void);
        }
        return undefined;
      }
      // Inline `js { ... }` block — execute the opaque body.
      if (expr.kind === "JsBlock") {
        return executeJsBlock(expr.body, mounted.decl.name, ctx, options, mounted);
      }
      return evaluate(expr, ctx);
    }
    case "Assignment": {
      const value = evaluate(stmt.expression, ctx);
      if (stmt.identifier && stmt.identifier !== "") {
        // Treat any assignment inside an effect body as a state write.
        // This mirrors the spec's "$x = …" mutation form. Route through
        // the per-instance alias stack so writes from inside a component
        // body hit the right per-instance slot (§7).
        const target = resolveStateAlias(ctx, stmt.identifier);
        ctx.state.set(target, value as StateValue);
      }
      return value;
    }
    case "Cleanup": {
      const cb = stmt.callback ? evaluate(stmt.callback, ctx) : null;
      if (typeof cb === "function") {
        mounted.cleanups.push(cb as () => void);
      }
      return undefined;
    }
    case "Emit": {
      const detail = evaluate(stmt.detail, ctx);
      options.onEmit?.(stmt.eventName, detail);
      return undefined;
    }
    default:
      return undefined;
  }
}

function logCleanupError(name: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[aktion] cleanup for effect "${name}" threw`, err);
}

/* -------------------------------------------------------------------------- */
/*  JS escape hatch — executes `js { ... }` blocks inside effect/action bodies */
/* -------------------------------------------------------------------------- */

/**
 * Shape exposed to `js{}` bodies as the `ctx` parameter. Intentionally
 * narrow — `ctx.state`, `ctx.cleanup`, `ctx.host`, `ctx.tools`, and
 * `ctx.args` (for action bodies) cover the common cases without leaking
 * the entire runtime surface to opaque JS.
 */
interface JsBlockCtx {
  state: {
    get: (name: string) => unknown;
    set: (name: string, value: unknown) => void;
  };
  cleanup: (fn: () => void) => void;
  host?: HTMLElement;
  tools: Record<string, (...args: unknown[]) => unknown>;
  args: Record<string, unknown>;
}

interface JsBlockExecOptions {
  state: StateStore;
  host?: HTMLElement;
  tools?: Record<string, (...args: unknown[]) => unknown>;
}

/**
 * Build a standalone `js{ … }` runner closure for the renderer / inline
 * lambdas to invoke. Identical sandbox surface as the effect/action
 * runners (host, tools, state get/set, optional cleanup hook).
 */
export function createInlineJsExecutor(
  options: JsBlockExecOptions,
): (body: string, args?: Record<string, unknown>) => unknown {
  return (body, args = {}) => executeJsBlock(body, "<inline>", undefined as unknown as EvaluationContext, options, undefined, args);
}

function executeJsBlock(
  body: string,
  ownerName: string,
  ctx: EvaluationContext,
  options: JsBlockExecOptions,
  mounted?: MountedEffect,
  args: Record<string, unknown> = {},
): unknown {
  const blockCtx: JsBlockCtx = {
    state: {
      get: (name) => options.state.get(name),
      set: (name, value) => options.state.set(name, value as StateValue),
    },
    cleanup: (fn) => {
      if (typeof fn !== "function") return;
      if (mounted) mounted.cleanups.push(fn);
    },
    host: options.host,
    tools: options.tools ?? {},
    args,
  };
  try {
    // Wrap the body as `(async (ctx) => { <body> })(ctx)` so authors can
    // freely use `await`. The block is opaque — we never reparse it.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function(
      "ctx",
      `return (async () => { ${body}\n })()`,
    ) as (c: JsBlockCtx) => Promise<unknown>;
    const result = fn(blockCtx);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[aktion] js{} body in "${ownerName}" rejected`, err);
      });
    }
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[aktion] js{} body in "${ownerName}" threw`, err);
    return undefined;
  }
  // ctx ref kept to silence "unused" linter on a future no-op refactor.
  void ctx;
}

/* -------------------------------------------------------------------------- */
/*  Action runner (§10) — optimistic snapshot/rollback                        */
/* -------------------------------------------------------------------------- */

export interface ActionRunnerOptions {
  state: StateStore;
  notify: () => void;
  onEmit?: (eventName: string, detail: unknown) => void;
  onAssistantMessage?: (message: string) => void;
  /** Host element exposed to `js{}` blocks as `ctx.host`. */
  host?: HTMLElement;
  /** Pluggable tool registry exposed to `js{}` blocks as `ctx.tools.<name>`. */
  tools?: Record<string, (...args: unknown[]) => unknown>;
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
    // Bind parameters into loop vars + collect them as a name-keyed map so
    // `js{}` bodies can read them via `ctx.args.<name>`.
    const restore: Array<{ name: string; had: boolean; prev: unknown }> = [];
    const args: Record<string, unknown> = {};
    for (let i = 0; i < decl.params.length; i += 1) {
      const param = decl.params[i]!;
      const value = callArgs[i];
      restore.push({
        name: param.name,
        had: ctx.loopVars.has(param.name),
        prev: ctx.loopVars.get(param.name),
      });
      ctx.loopVars.set(param.name, value);
      args[param.name] = value;
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
      for (const stmt of decl.body.body) {
        lastValue = await this.runStatement(stmt, ctx, decl, args);
      }
      this.options.notify();
      return lastValue;
    } catch (err) {
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
    decl: ActionDeclaration,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (stmt.kind) {
      case "ExpressionStatement": {
        const expr = stmt.expression;
        if (expr.kind === "JsBlock") {
          const result = executeJsBlock(
            expr.body,
            decl.name,
            ctx,
            this.options,
            undefined,
            args,
          );
          return await unwrapPromise(result);
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
          // Resolve through the per-instance alias stack so an `action`
          // declared inside a `component` body writes the right slot (§7).
          const target = resolveStateAlias(ctx, stmt.identifier);
          this.options.state.set(target, value as StateValue);
        }
        return value;
      }
      case "Return": {
        if (!stmt.argument) return undefined;
        return await unwrapPromise(evaluate(stmt.argument, ctx));
      }
      case "Emit": {
        const detail = evaluate(stmt.detail, ctx);
        this.options.onEmit?.(stmt.eventName, detail);
        return undefined;
      }
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
