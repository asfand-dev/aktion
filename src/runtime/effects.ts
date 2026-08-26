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
  EffectDeclaration,
  Expression,
  SourceLocation,
  Statement,
} from "../parser/types.js";
import type { EvaluationContext, ScopedEffectDecl } from "./evaluator.js";
import {
  evaluate,
  resolveStateAlias,
  runControlFlowStatement,
} from "./evaluator.js";
import {
  recordFunction as recordCoverageFunction,
  recordLine as recordCoverageLine,
} from "./coverage.js";
import type { StateStore, StateValue } from "./state.js";
import { anyPathAffects } from "./state.js";
import { isDevtoolsActive, nowMs } from "../devtools/hook.js";
import type { EffectEventPayload, EffectInfo, EffectPhase } from "../devtools/protocol.js";

/**
 * `true` for a `$emit("name", detail)` call — an Invoke on the reserved
 * `$emit` StateRef. The effect / action runner dispatches these straight to
 * `onEmit` rather than evaluating them as ordinary expressions.
 */
function isEmitCall(expr: Expression): expr is Extract<Expression, { kind: "Invoke" }> {
  return (
    expr.kind === "Invoke" &&
    expr.callee.kind === "StateRef" &&
    expr.callee.name === "emit"
  );
}

export interface EffectRunnerOptions {
  state: StateStore;
  /** Called whenever an effect mutates state or completes — schedules render. */
  notify: () => void;
  /** Called when the effect/action body emits a CustomEvent via `emit()`. */
  onEmit?: (eventName: string, detail: unknown) => void;
  /**
   * DevTools instrumentation sink. Called on every effect lifecycle
   * transition (mount / run / cleanup / unmount / error) with everything the
   * runner can compute on its own; the host stamps on `appId` + `time`. Only
   * invoked while a DevTools frontend is actually attached, so it costs
   * nothing when the inspector is closed.
   */
  onEffectEvent?: (payload: EffectEventPayload) => void;
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
  /**
   * The rate-limit-wrapped body runner, kept so DevTools can fire an effect
   * on demand ("run now") without waiting for its trigger. Assigned at the end
   * of `mount`; absent only in the window before the wrapper exists.
   */
  run?: (reason: string) => void;
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

  /* ---- DevTools introspection ------------------------------------------ */

  /**
   * Describe every currently-mounted effect: what it subscribes to, what
   * intervals it holds, how many `cleanup(fn)` handlers are live.
   *
   * The event timeline shows what effects *did*; this shows what they *are* —
   * which is the half you need when the question is "why did nothing happen?"
   * (a dependency list that never matches never produces an event to look at).
   */
  listMounted(): EffectInfo[] {
    const out: EffectInfo[] = [];
    for (const [mountKey, mounted] of this.mounted) {
      const sep = mountKey.lastIndexOf(INSTANCE_KEY_SEPARATOR);
      const stateDeps: string[] = [];
      const intervals: number[] = [];
      for (const trigger of mounted.decl.triggers) {
        if (trigger.kind === "state") stateDeps.push(trigger.name);
        else if (trigger.kind === "every") intervals.push(trigger.intervalMs);
      }
      out.push({
        effectKey: mountKey,
        label: effectLabel(mounted.decl.name),
        instanceKey: sep >= 0 ? mountKey.slice(0, sep) : null,
        triggers: summariseTriggers(mounted.decl),
        stateDeps,
        intervals,
        cleanups: mounted.cleanups.length,
        source: mounted.decl.loc
          ? { line: mounted.decl.loc.line, column: mounted.decl.loc.column }
          : undefined,
      });
    }
    return out;
  }

  /**
   * Run one mounted effect's body now, as if its trigger had fired. Prior
   * cleanups fire first, exactly like a real re-run, so "run now" can't leave
   * an effect with two live subscriptions. Returns `false` for an unknown key.
   */
  runNow(mountKey: string, reason = "devtools"): boolean {
    const mounted = this.mounted.get(mountKey);
    if (!mounted?.run) return false;
    mounted.run(reason);
    return true;
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
    // DevTools: announce the effect registered, before any run, so the
    // timeline shows even effects that only fire on teardown.
    this.emitEffect(mountKey, decl, "mount", "mount");

    // `reason` records WHY the body is running (mount / a `$state` change /
    // an interval tick) so the effect timeline can attribute each run.
    const rawRunBody = (reason: string): void => {
      // Reset cleanups before each run — prior cleanups should fire so
      // observers / listeners don't leak across re-fires.
      const prior = mounted.cleanups.splice(0);
      if (prior.length > 0) {
        for (const fn of prior) {
          try { fn(); } catch (err) { logCleanupError(mountKey, err); }
        }
        this.emitEffect(mountKey, decl, "cleanup", reason, { cleanups: prior.length });
      }
      const start = nowMs();
      try {
        runEffectBody(decl, getCtx(), mounted, this.options);
        this.emitEffect(mountKey, decl, "run", reason, { duration: nowMs() - start });
      } catch (err) {
        this.emitEffect(mountKey, decl, "error", reason, {
          duration: nowMs() - start,
          error: err instanceof Error ? err.message : String(err),
        });
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
    // Keep a handle so DevTools can run this effect on demand (see `runNow`).
    mounted.run = runBody;

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
          const reason = `every(${trigger.intervalMs})`;
          const id = setInterval(() => runBody(reason), trigger.intervalMs);
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
          // Display the atom the author wrote (`$count`), not the aliased slot.
          const reason = `state:${trigger.name}`;
          const unsub = this.options.state.subscribe((changed) => {
            // Fine-grained: a `[$user.name]` trigger fires only when
            // `user.name` (or the whole `user`) changes, not `user.role`.
            if (anyPathAffects(changed, targetName)) runBody(reason);
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
      runBody("mount");
    } else if (!hasEveryTrigger && !hasUnmountTrigger && decl.triggers.every((t) => t.kind === "state")) {
      // Pure state-driven effects also run once on mount so the initial
      // state is observed (matches React's `useEffect` and the spec's
      // "first quiescence" rule for stream effects).
      runBody("mount");
    }
  }

  /**
   * Build and dispatch one DevTools effect event. Returns immediately when no
   * frontend is attached, so the only cost on the hot path is a single
   * global-property read.
   */
  private emitEffect(
    mountKey: string,
    decl: EffectDeclaration,
    phase: EffectPhase,
    reason: string,
    extra: Partial<EffectEventPayload> = {},
  ): void {
    const cb = this.options.onEffectEvent;
    if (!cb || !isDevtoolsActive()) return;
    const sep = mountKey.lastIndexOf(INSTANCE_KEY_SEPARATOR);
    cb({
      effectKey: mountKey,
      label: effectLabel(decl.name),
      instanceKey: sep >= 0 ? mountKey.slice(0, sep) : null,
      phase,
      reason,
      triggers: summariseTriggers(decl),
      ...extra,
    });
  }

  private unmount(name: string): void {
    const mounted = this.mounted.get(name);
    if (!mounted) return;
    this.mounted.delete(name);

    for (const id of mounted.intervals) clearInterval(id);
    for (const unsub of mounted.unsubscribers) {
      try { unsub(); } catch { /* swallow */ }
    }
    if (mounted.cleanups.length > 0) {
      const count = mounted.cleanups.length;
      for (const fn of mounted.cleanups) {
        try { fn(); } catch (err) { logCleanupError(name, err); }
      }
      this.emitEffect(name, mounted.decl, "cleanup", "unmount", { cleanups: count });
    }

    // Run `on:unmount` body if declared.
    const hasUnmountTrigger = mounted.decl.triggers.some(
      (t) => t.kind === "lifecycle" && t.name === "unmount",
    );
    if (hasUnmountTrigger) {
      const start = nowMs();
      try {
        runEffectBody(mounted.decl, mounted.ctxRef(), mounted, this.options);
        this.emitEffect(name, mounted.decl, "run", "unmount", { duration: nowMs() - start });
      } catch (err) {
        this.emitEffect(name, mounted.decl, "error", "unmount", {
          error: err instanceof Error ? err.message : String(err),
        });
        // eslint-disable-next-line no-console
        console.error(`[aktion] effect "${name}" unmount body threw`, err);
      }
    }
    this.emitEffect(name, mounted.decl, "unmount", "unmount");
  }
}

/**
 * Wrap `run` with a debounce / throttle gate when the declaration carries
 * a `debounce(N)` / `throttle(N)` modifier. Returns the raw `run` when no
 * modifier is present. The pending timer is registered as a cleanup so a
 * fast unmount cancels in-flight calls.
 */
function wrapRateLimit(
  run: (reason: string) => void,
  rateLimit: EffectDeclaration["rateLimit"],
  mounted: MountedEffect,
): (reason: string) => void {
  if (!rateLimit || rateLimit.ms <= 0) return run;
  if (rateLimit.kind === "debounce") {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };
    mounted.cleanups.push(cancel);
    return (reason: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; run(reason); }, rateLimit.ms);
    };
  }
  // Throttle: fire immediately, then ignore further calls until `ms` elapsed.
  let lastFired = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let pendingReason = "";
  mounted.cleanups.push(() => {
    if (pending) { clearTimeout(pending); pending = null; }
  });
  return (reason: string) => {
    const now = Date.now();
    const elapsed = now - lastFired;
    if (elapsed >= rateLimit.ms) {
      lastFired = now;
      run(reason);
    } else if (!pending) {
      // Schedule a trailing call so the latest state still propagates.
      pendingReason = reason;
      pending = setTimeout(() => {
        pending = null;
        lastFired = Date.now();
        run(pendingReason);
      }, rateLimit.ms - elapsed);
    } else {
      // Keep the most recent reason for the already-scheduled trailing call.
      pendingReason = reason;
    }
  };
}

function runEffectBody(
  decl: EffectDeclaration,
  ctx: EvaluationContext,
  mounted: MountedEffect,
  options: EffectRunnerOptions,
): void {
  if (ctx.coverage) recordCoverageFunction(ctx.coverage, decl.loc);
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
  // Expose a real `cleanup` binding for the duration of the body run so it
  // survives aliasing / nested blocks (feedback §2.5). Saved/restored so
  // nested effect runs don't leak each other's sink.
  const priorCleanupSink = ctx.cleanupSink;
  ctx.cleanupSink = (fn: () => void): void => {
    mounted.cleanups.push(fn);
  };
  try {
    for (const stmt of decl.body.body) {
      runStatement(stmt, ctx, mounted, options);
    }
  } finally {
    ctx.cleanupSink = priorCleanupSink;
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
  // Effect bodies bypass the evaluator's statement dispatch for the two most
  // common kinds, so they need their own coverage hook — otherwise the inside of
  // every `effect(() => { … })` reads as dead code.
  if (ctx.coverage) {
    const loc = (stmt as { loc?: SourceLocation }).loc;
    if (loc) recordCoverageLine(ctx.coverage, loc);
  }
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
      // `$emit("name", detail)` — dispatch an outbound CustomEvent.
      if (isEmitCall(expr)) {
        const args = expr.arguments;
        const eventName = args[0] ? String(evaluate(args[0], ctx)) : "";
        const detail = args[1] ? evaluate(args[1], ctx) : undefined;
        options.onEmit?.(eventName, detail);
        return undefined;
      }
      return evaluate(expr, ctx);
    }
    case "Assignment": {
      // `$state = …` is a state write; `const rows = …` is a local.
      //
      // This used to treat EVERY assignment as a state write, which meant a
      // `const` declared in an effect body was filed under `ctx.state` instead
      // of being bound — so the next line read it back as undefined, with no
      // error anywhere. Effect bodies that were one `if` worked; the moment a
      // body pulled a value into a name first, it silently computed on nothing.
      //
      // `isState` is the flag the parser already sets from the `$` sigil, and
      // the block runner below has always used it. Non-state assignments are
      // delegated there so a local inside an effect binds exactly the way it
      // does inside an `if`, a `for` body, or a function.
      if (!stmt.isState) {
        runControlFlowStatement(stmt, ctx);
        return undefined;
      }

      const value = evaluate(stmt.expression, ctx);
      if (stmt.identifier && stmt.identifier !== "") {
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
 * Turn the auto-generated effect name (`__effect_L3_C1`) into a friendly
 * label for the DevTools timeline (`effect @ L3:C1`). Falls back to the raw
 * name for anything that doesn't match the generated shape.
 */
function effectLabel(name: string): string {
  const m = /^__effect_L(\d+)_C(\d+)$/.exec(name);
  return m ? `effect @ L${m[1]}:C${m[2]}` : name;
}

/**
 * Summarise an effect's declared trigger list the way the author wrote it
 * (`[$count, "mount"]`, `[every(1000)]`, `[debounce(250), $query]`). Used as
 * a tooltip / subtitle in the DevTools effect lane.
 */
function summariseTriggers(decl: EffectDeclaration): string {
  const parts = decl.triggers.map((t) => {
    if (t.kind === "lifecycle") return `"${t.name}"`;
    if (t.kind === "every") return `every(${t.intervalMs})`;
    return `$${t.name}`;
  });
  if (decl.rateLimit) parts.push(`${decl.rateLimit.kind}(${decl.rateLimit.ms})`);
  return parts.length > 0 ? `[${parts.join(", ")}]` : "[mount]";
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
  // A trigger may be a dotted path (`user.name`); only the ROOT atom is
  // aliased per-instance, so resolve the root segment and re-attach the
  // trailing path (`Item@2:0#0:user` + `.name`).
  const dot = name.indexOf(".");
  const root = dot < 0 ? name : name.slice(0, dot);
  const rest = dot < 0 ? "" : name.slice(dot);
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const aliased = frames[i]!.get(root);
    if (aliased !== undefined) return aliased + rest;
  }
  return name;
}

