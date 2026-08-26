import { EffectDeclaration } from '../parser/types.js';
import { EvaluationContext, ScopedEffectDecl } from './evaluator.js';
import { StateStore } from './state.js';
import { EffectEventPayload, EffectInfo } from '../devtools/protocol.js';
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
export declare class EffectRunner {
    private readonly options;
    private mounted;
    private errors;
    constructor(options: EffectRunnerOptions);
    /** Get any errors raised at mount-time (denied capabilities, parse issues). */
    getErrors(): ReadonlyArray<string>;
    /**
     * Mount every top-level effect declaration in `decls`. Idempotent:
     * declarations that are already mounted under the same name are left
     * alone, those that vanish from the new program are torn down.
     *
     * Only touches global (top-level) effects. Per-instance effects mounted
     * inside function bodies are managed via `syncInstanceEffects`
     * / `unmountInstance` and are not affected by this call.
     */
    syncEffects(decls: ReadonlyArray<EffectDeclaration>, getCtx: () => EvaluationContext): void;
    /**
     * Mount per-instance effects discovered inside a function body.
     * Idempotent: re-rendering the same instance with the same effect set is
     * a no-op; effects that vanished from the body since the last render are
     * torn down. Effects belonging to other instances are untouched.
     */
    syncInstanceEffects(instanceKey: string, decls: ReadonlyArray<ScopedEffectDecl>, getCtx: () => EvaluationContext): void;
    /**
     * Tear down every effect that belongs to the given component instance
     * (i.e. mounted via `syncInstanceEffects(instanceKey, …)`). Called by
     * the renderer when an instance disappears from the tree so timers,
     * interval handles, and state subscriptions don't outlive the
     * component the user can see.
     */
    unmountInstance(instanceKey: string): void;
    reset(): void;
    /**
     * Describe every currently-mounted effect: what it subscribes to, what
     * intervals it holds, how many `cleanup(fn)` handlers are live.
     *
     * The event timeline shows what effects *did*; this shows what they *are* —
     * which is the half you need when the question is "why did nothing happen?"
     * (a dependency list that never matches never produces an event to look at).
     */
    listMounted(): EffectInfo[];
    /**
     * Run one mounted effect's body now, as if its trigger had fired. Prior
     * cleanups fire first, exactly like a real re-run, so "run now" can't leave
     * an effect with two live subscriptions. Returns `false` for an unknown key.
     */
    runNow(mountKey: string, reason?: string): boolean;
    private mount;
    /**
     * Build and dispatch one DevTools effect event. Returns immediately when no
     * frontend is attached, so the only cost on the hot path is a single
     * global-property read.
     */
    private emitEffect;
    private unmount;
}
