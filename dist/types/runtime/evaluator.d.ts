import { Expression, Program, Statement, ComponentDeclaration, EffectDeclaration, ActionDeclaration, HookDeclaration, DestructuringPattern } from '../parser/types.js';
import { CoverageScope } from './coverage.js';
import { StateStore } from './state.js';
import { HttpRuntime, EndpointResource } from './http.js';
import { DomManager } from './interop.js';
import { HeadManager } from './head.js';
import { Router } from './router.js';
import { ComponentLibrary } from '../library/types.js';
import { ToastManager } from './toast.js';
import { EnvManager } from './env.js';
/** Lazily build (and cache on the context) the `$head` document-head manager. */
export declare function getHeadManager(ctx: EvaluationContext): HeadManager;
/**
 * Resolve any host JavaScript global by name (`window`, `document`, `URL`,
 * `Blob`, `FormData`, `crypto`, `navigator`, `localStorage`, `Intl`,
 * `BigInt`, `Reflect`, `Proxy`, `fetch`, `alert`, `confirm`, `prompt`,
 * `atob`/`btoa`, `requestAnimationFrame`, `queueMicrotask`, `eval`,
 * `Function`, …) as the FINAL fallback in identifier / call resolution.
 *
 * This is what makes the language expose the *full* JavaScript global
 * surface rather than only the curated `GLOBAL_NAMESPACES` set above. It is
 * always tried LAST — after user state, bindings, actions, user components,
 * the curated globals, and the component library — so it can never shadow
 * an author declaration or a built-in component (a library `Text` / `Map`
 * component still wins over the DOM `Text` / `Map` constructor).
 *
 * Lookup is prototype-aware (`name in globalThis`) so browser accessor
 * globals that live on `Window.prototype` (e.g. `location`, `navigator`)
 * resolve too, but names inherited *only* from `Object.prototype`
 * (`toString`, `constructor`, `hasOwnProperty`, …) are skipped so a bare
 * undeclared identifier can't accidentally resolve to prototype noise.
 *
 * SECURITY — READ THIS BEFORE CHANGING THE DEFAULT.
 *
 * Under the default `"all"` policy this is a full passthrough to the embedding
 * realm, which means **an Aktion program is as privileged as a `<script>` tag**:
 * it can reach `eval`, `Function`, `document`, `fetch`, `localStorage`, and
 * everything else on `globalThis`. That is a deliberate design choice — the
 * language is meant to be a productive authoring surface for code you trust —
 * but it has a consequence that is easy to miss:
 *
 *   The per-sink sanitisers elsewhere in this library (`sanitiseHref`,
 *   `sanitiseSvgMarkup`, the Markdown escaper, the `$head` allow-lists) defend
 *   **untrusted DATA flowing through a trusted program** — an API response, a
 *   chat message, a tool result, a URL parameter. They do NOT contain a hostile
 *   program *author*, and cannot: such an author would simply call `eval`.
 *
 * So if the program text itself can come from somewhere you do not trust — a
 * prompt-injectable LLM, a multi-tenant database, a user-editable template —
 * you must narrow this surface with {@link setGlobalAccessPolicy}. Otherwise
 * treat authoring a program as equivalent to shipping a script.
 */
export type GlobalAccessPolicy = "all" | "safe" | readonly string[];
/**
 * Globals reachable under the `"safe"` policy: data types, formatting, and
 * encoding — capabilities a program needs to compute with values, but none that
 * grant code execution, DOM access, network access, or persistence.
 *
 * Excluded on purpose: `eval` / `Function` / `WebAssembly` (code execution),
 * `window` / `self` / `globalThis` / `top` / `parent` / `frames` / `document`
 * (which re-expose everything, including the excluded names), `fetch` /
 * `XMLHttpRequest` / `EventSource` / `WebSocket` / `navigator` / `Worker`
 * (network + threads — `$http` is the vetted path), `localStorage` /
 * `sessionStorage` / `indexedDB` / `caches` (persistence — `storage` is the
 * vetted path), and `import` / `Reflect` / `Proxy` (reflection escapes).
 *
 * Exported so a host can SHOW the surface it is granting (the playground lists
 * these names in autocomplete) and so tooling never has to hand-maintain a
 * second copy of the allow-list.
 */
export declare const SAFE_HOST_GLOBALS: ReadonlySet<string>;
/**
 * Narrow which host JavaScript globals an Aktion program may reach.
 *
 *   - `"all"` (default) — the full `globalThis` surface, including `eval` and
 *     `Function`. Appropriate only when program text is as trusted as your own
 *     source code.
 *   - `"safe"` — the {@link SAFE_HOST_GLOBALS} allow-list: data, formatting,
 *     and encoding, with no code-execution / DOM / network / storage capability.
 *     Use this whenever program text may come from an untrusted source.
 *   - an explicit array — exactly those names, and nothing else.
 *
 * The curated `GLOBAL_NAMESPACES` fast path (`Math`, `JSON`, `Object`, …) and
 * the runtime's own namespaces (`$http`, `storage`, …) are unaffected: they are
 * resolved before this passthrough and are already a vetted surface.
 */
export declare function setGlobalAccessPolicy(policy: GlobalAccessPolicy): void;
/** The active policy (see {@link setGlobalAccessPolicy}). */
export declare function getGlobalAccessPolicy(): GlobalAccessPolicy;
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
 *     allocations. A bare `Util.range(0, 1e9)` would otherwise call
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
export declare const DEFAULT_RUNTIME_BUDGET: Readonly<Omit<RuntimeBudget, "componentDepth" | "iterations">>;
/** Why the runtime aborted. Used by the host to render a friendly banner. */
export type RuntimeBudgetKind = "component-depth" | "iterations" | "array-length";
/**
 * Thrown when the evaluator hits a runtime safety limit. Carries enough
 * detail for the host to surface a parse-error-style message that
 * points the user at the offending construct.
 */
export declare class RuntimeBudgetError extends Error {
    readonly kind: RuntimeBudgetKind;
    readonly limit: number;
    readonly source: string;
    constructor(kind: RuntimeBudgetKind, limit: number, source: string);
}
/** Create a fresh budget with default (or overridden) limits. */
export declare function createRuntimeBudget(overrides?: Partial<Omit<RuntimeBudget, "componentDepth" | "iterations">>): RuntimeBudget;
/**
 * Reset the per-render counters on an existing budget. Limits are
 * preserved; only the running totals (`iterations`, `componentDepth`)
 * are cleared. Called by the host between renders.
 */
export declare function resetRuntimeBudget(budget: RuntimeBudget): void;
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
export declare function enterUserComponent(ctx: EvaluationContext, name: string): void;
/** Close a user-component frame previously opened by `enterUserComponent`. */
export declare function leaveUserComponent(ctx: EvaluationContext): void;
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
    /**
     * Universal style/behaviour channel (suggestions-global Part I). The named
     * props every component implicitly accepts — see `UNIVERSAL_PROP_NAMES` in
     * `src/library/sx.ts` for the authoritative list, which this comment used to
     * duplicate and fall behind. They match no declared slot, so the evaluator
     * collects them here and the renderer applies them to the rendered element
     * after `render(...)`.
     */
    universal?: Record<string, unknown>;
    /** Original AST for debugging/introspection. */
    source?: {
        line: number;
        column: number;
    };
}
export declare const isComponentNode: (value: unknown) => value is ComponentNode;
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
    source?: {
        line: number;
        column: number;
    };
}
export declare const isUserComponentNode: (value: unknown) => value is UserComponentNode;
/**
 * A global store created by `Store({ …state, …methods })` (§ Global state).
 *
 * State (the non-function entries of the config) lives in a single reactive
 * atom named `__atom`, so reads through the handle (`store.field`) get the
 * same fine-grained path tracking as a `$state` read, and writes
 * (`s.field = …` inside a method) route through `setPath`. Methods (the
 * function entries) are pre-bound so calling `store.method(args)` invokes the
 * author's function with the handle injected as the first argument
 * (`(s, ...args)`); the bound functions are reference-stable across renders,
 * which keeps memoization tight when an action is passed as a prop.
 */
export interface StoreHandle {
    __kind: "Store";
    /** Backing reactive atom name holding the store's state object. */
    __atom: string;
    /** Pre-bound methods: `(...args) => rawMethod(handle, ...args)`. */
    __methods: Record<string, (...args: unknown[]) => unknown>;
}
export declare const isStoreHandle: (value: unknown) => value is StoreHandle;
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
/**
 * One hook slot held by a component instance (§ Hooks). Slots are matched
 * by call order across renders — the React "rules of hooks" model.
 *
 *   - `state` cells back a `$state(initial)` call. The `value` is the live
 *     current state; the setter returned by the hook mutates it in place and
 *     calls `ctx.notify()` to schedule a re-render. The cell object identity
 *     is stable across renders, so a setter captured in an event handler from
 *     an earlier render still writes the slot the next render reads.
 *   - `memo` cells back a `$memo(fn, deps)` call. `value` is the last
 *     computed result; `deps` is the dependency array it was computed with
 *     (shallow-compared via `Object.is` to decide whether to recompute).
 */
export type HookCell = {
    kind: "state";
    value: unknown;
} | {
    kind: "memo";
    deps: ReadonlyArray<unknown> | undefined;
    value: unknown;
} | {
    kind: "ref";
    box: {
        current: unknown;
    };
} | {
    kind: "reducer";
    value: unknown;
} | {
    kind: "id";
    value: string;
};
/**
 * Active hook scope — the component instance currently rendering, plus a
 * monotonically increasing slot cursor. Set by `evaluateUserComponent`
 * around the body walk and shared by any `$hook()` calls (built-in or
 * user-declared) encountered while walking, so a custom hook's internal
 * `$state` / `$memo` allocate slots on the calling component (React's
 * custom-hook model). `null` when no component is rendering.
 */
export interface HookScope {
    instanceKey: string;
    /** Next slot index to hand out — advanced once per hook call. */
    cursor: number;
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
     * Per-render slot store for top-level non-`$state` bindings
     * (`let badges = []`, `i = 10`, …). Reads memoise their declared
     * initialiser here on first access and writes (`badges = …`,
     * `badges.push(…)` against the cached reference) land here too — so a
     * single render observes ONE stable value/reference for each top-level
     * variable instead of re-evaluating the initialiser on every read
     * (which previously made `.push` mutations vanish and `[...x, y]`
     * reassignments accumulate across renders). Reset at the start of
     * every render pass via `resetMutableBindings`.
     */
    mutableBindings: Map<string, unknown>;
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
    /**
     * Names of user component declarations whose bodies are currently being
     * evaluated (innermost last). Inside its own body, a declaration that
     * shadows a library component resolves back to the BUILT-IN, so the
     * wrapper pattern (`function Button(...) { return Button(...) }`) renders
     * the library Button instead of recursing to the depth limit.
     */
    activeComponentDecls: string[];
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
    /**
     * Hook declarations (`function $useFoo() { ... }`), keyed by name WITHOUT
     * the `$` sigil. Invoked as `$useFoo(...)`; the body runs inline in the
     * caller's hook scope so its `$state` / `$memo` calls allocate slots on
     * the rendering component instance.
     */
    hookDecls: Map<string, HookDeclaration>;
    /**
     * Active hook scope, or `null` when no user component is rendering. Set by
     * `evaluateUserComponent` around the body walk and consumed by the
     * `$state` / `$memo` built-ins (and any user `$hook()` they reach).
     */
    hookScope: HookScope | null;
    /**
     * Per-instance hook cells, keyed by the same `instanceKey` the renderer
     * derives for per-instance `$state` / effects. Each entry is the ordered
     * slot array for one component instance. Persists across renders so hook
     * state survives a re-render; the renderer prunes an instance's entry when
     * it leaves the tree (`clearInstanceHooks`), giving React-like reset-on-
     * unmount semantics.
     */
    hookStore: Map<string, HookCell[]>;
    /**
     * Global stores created by `Store({...})`, keyed by source location so the
     * same call site yields one singleton handle across renders (the store is
     * app-global, not per-instance). Lives as long as the program; rebuilt on
     * replan with a fresh context.
     */
    stores: Map<string, StoreHandle>;
    /** HTTP runtime (`Http({...})` calls + interceptor configuration). */
    http?: HttpRuntime;
    /**
     * Shared cache of `$query({...})` resources, keyed by the query's `key`
     * (or a value derived from method + url + query + body). Lets repeated and
     * cross-component queries share one in-flight request / cached result.
     * Lives as long as the program; rebuilt on replan with a fresh context.
     */
    queryCache: Map<string, EndpointResource>;
    /**
     * Lazily-created singleton backing the reserved `$toast` namespace
     * (`$toast.show(...)`, `$toast.items`, …). Created on first reference via
     * `getToastManager`; its auto-dismiss timers are cleared on dispose.
     */
    toastManager?: ToastManager;
    /**
     * Per-render flag: set true when the program reads `$toast.items` while the
     * `$app(...)` tree is being evaluated (i.e. the author renders toasts by
     * hand). Reset at the start of each `$app` evaluation; when it stays false
     * and toasts exist, the runtime auto-renders a `Toasts` layer so authors
     * don't have to wire one up. See the `$app` case in `evaluateCall`.
     */
    toastItemsRead?: boolean;
    /**
     * Corner the auto-rendered toast stack pins to, set by `$toast.configure`.
     * Absent leaves the `Toasts` component's own default (`top-right`).
     */
    toastPosition?: string;
    /**
     * Lazily-created singleton backing the reserved `$dom` observer namespace
     * (`$dom.onResize`, `$dom.onIntersect`, `$dom.measure`, …). Every observer
     * it creates registers on `disposers`, so all are torn down on replan.
     */
    domManager?: DomManager;
    /**
     * Lazily-created singleton backing the `$head({...})` document-head manager.
     * Accumulates per-render contributions and feeds SSR's resolved `<head>`.
     */
    headManager?: HeadManager;
    /**
     * Lazily-created singleton backing the reactive environment namespaces
     * (`$viewport`, `$breakpoint`, `$scroll`, `$media`, `$mouse`). Listeners
     * attach on first access and are torn down via `disposers` on replan.
     */
    envManager?: EnvManager;
    /**
     * Per-context `$util` facade (static helpers + reactive env-global getters),
     * built lazily on first `$util` reference and reused across the render.
     */
    utilFacade?: Record<string, unknown>;
    /** Notify the host that something changed and a re-render is needed. */
    notify?: () => void;
    /**
     * Program-level error sink registered via `$onError(fn)` (suggestions-global
     * XIII.7). Invoked with `{ error, source }` when a user action body throws,
     * before the default console logging. Lets a program report to a Sentry-style
     * sink or surface a toast without a bad row blanking the page.
     */
    errorHook?: (info: {
        error: unknown;
        source: string;
    }) => void;
    /** Dispatch a custom event from an `emit("name", detail)` call. */
    onEmit?: (eventName: string, detail: unknown) => void;
    /**
     * Active teardown sink during an effect-body run. When set, a bare
     * `cleanup` identifier resolves to a real bound function that pushes into
     * the running effect's cleanup list — so `cleanup(fn)` keeps working even
     * when aliased (`const c = cleanup; c(fn)`) or used inside a nested block,
     * rather than being detected only by literal callee name (feedback §2.5).
     * Unset outside effect runs, where `cleanup` has no meaning.
     */
    cleanupSink?: ((fn: () => void) => void) | null;
    /**
     * Dev/strict mode (opt-in via the `strict` attribute on `<aktion-app>`).
     * When set, the evaluator surfaces silent failures — currently unknown
     * bare identifiers that would otherwise resolve to `null` — as
     * `console.warn`s. Off by default so production behaviour is unchanged.
     */
    strict?: boolean;
    /** De-dupes strict-mode warnings to one per identifier per program. */
    strictWarned: Set<string>;
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
     * Pending timer handles created by the language-level `setTimeout` /
     * `setInterval` builtins. Tracked per context so every timer is cleared
     * when the context is disposed (`disposeContext`), which the host runs
     * before each replan and on disconnect — otherwise a `setInterval` from a
     * previous program would keep firing against a stale scope forever.
     * `clearTimeout` / `clearInterval` remove handles from these sets.
     */
    timers: {
        timeouts: Set<ReturnType<typeof setTimeout>>;
        intervals: Set<ReturnType<typeof setInterval>>;
    };
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
    /**
     * Coverage recorder for this program, or `undefined` (the default) when
     * coverage is off.
     *
     * Present only while a test harness has called `coverage.start()`;
     * `planProgram` attaches it. Every instrumentation site is guarded by
     * `if (ctx.coverage)`, so a normal render pays one property read per
     * evaluated node and allocates nothing. The scope carries the map from
     * `loc.source` to per-file accumulators, which is what makes attribution
     * exact for a linked multi-file program.
     */
    coverage?: CoverageScope;
    /**
     * File name to report coverage under when the program carries no `sources`
     * — a single-file program, or one mounted from a string. Ignored for a linked
     * multi-file program, whose own `Program.sources` is authoritative.
     */
    coverageSourcePath?: string;
}
/**
 * Optional injectables for `createContext` — the host element passes its
 * runtime singletons (HTTP, action runner) so endpoint use sites and
 * action calls can resolve against them.
 */
export interface CreateContextOptions {
    router?: Router;
    library?: ComponentLibrary;
    http?: HttpRuntime;
    notify?: () => void;
    onEmit?: (eventName: string, detail: unknown) => void;
    /** Enable dev/strict-mode warnings for silent failures. */
    strict?: boolean;
    /**
     * File name coverage reports use for a program with no `Program.sources`
     * (single-file, or mounted from a string). See
     * `EvaluationContext.coverageSourcePath`.
     */
    coverageSourcePath?: string;
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
export declare function createContext(state: StateStore, options?: CreateContextOptions): EvaluationContext;
/**
 * Drain every cleanup callback attached to `ctx.disposers`. Safe to call
 * multiple times — each callback is invoked at most once even if it
 * throws (the array is cleared up-front so a faulty disposer can't
 * prevent siblings from running).
 */
export declare function disposeContext(ctx: EvaluationContext): void;
/**
 * Clear the per-render mutable-binding cache. Called by the host at the
 * start of every render pass so top-level `let`/`var`/plain bindings are
 * re-seeded from their initialisers each render (keeping derived values
 * reactive) while remaining stable WITHIN a single render (so `.push`
 * and `[...x, y]` mutations behave like ordinary JS module variables).
 */
export declare function resetMutableBindings(ctx: EvaluationContext): void;
/**
 * Resolve a `$name` reference through the active per-instance alias
 * stack. Returns the topmost binding or `name` itself when no alias is
 * present. Exported so the action / effect runners can resolve writes
 * the same way the evaluator resolves reads.
 */
export declare function resolveStateAlias(ctx: EvaluationContext, name: string): string;
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
export declare function extractStatePath(expr: Expression, ctx: EvaluationContext): {
    name: string;
    path: string[];
} | null;
/**
 * Plan a program: declare state variables, register HTTP endpoints, and
 * build lazy bindings for every assignment so forward references resolve.
 */
export declare function planProgram(program: Program, ctx: EvaluationContext): void;
export declare function evaluate(expr: Expression, ctx: EvaluationContext): unknown;
/**
 * Control-flow signals threaded through `runStatement` / `evaluateBlock`
 * so `break`, `continue`, and `return` in nested `for` / `while` /
 * `if` bodies propagate up to the enclosing loop / function body.
 *
 * Thrown as a class so the existing try/finally restores still execute
 * along the way; the loop / function runners catch the matching
 * signal and either resume or exit.
 */
export declare class BreakSignal {
    readonly kind: "break";
}
export declare class ContinueSignal {
    readonly kind: "continue";
}
export declare class ReturnSignal {
    readonly value: unknown;
    readonly kind: "return";
    constructor(value: unknown);
}
/**
 * Resolve a destructuring pattern (`{ a, b: c = 1, ...rest }` /
 * `[x, , y, ...rest]`) against a source value into a flat list of
 * `name → value` pairs. Shared by `let`-destructuring statements and
 * destructured function / lambda parameters so both honour defaults,
 * renames, holes, and rest the same way. Does NOT touch `loopVars` —
 * the caller decides how to bind + restore.
 */
export declare function resolvePatternBindings(pattern: DestructuringPattern, source: unknown, ctx: EvaluationContext): Array<{
    name: string;
    value: unknown;
}>;
/**
 * Public entry point for the effect / action runners — they delegate
 * control-flow statements (`if`, `for`, `while`, `switch`, `try`,
 * `break`, `continue`, `throw`) to this helper so the same semantics
 * apply everywhere. Returns nothing; `BreakSignal`, `ContinueSignal`,
 * and `ReturnSignal` are thrown for the caller's loop / function frame
 * to catch.
 */
export declare function runControlFlowStatement(stmt: Statement, ctx: EvaluationContext): void;
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
    /**
     * Number of hook slots (`$state` / `$memo` / user `$hook`) this instance
     * consumed during the body walk. `0` when the component uses no hooks.
     * The renderer uses a non-zero count to track the instance for hook
     * teardown when it later leaves the tree (reset-on-unmount).
     */
    hooks: number;
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
export declare function evaluateUserComponent(node: UserComponentNode, ctx: EvaluationContext, instanceKey: string): EvaluatedUserComponent;
/**
 * Drop every hook cell owned by `instanceKey`. Called by the renderer when a
 * component instance leaves the tree so its `$state` resets to the initial
 * value on a future remount (React-like reset-on-unmount).
 */
export declare function clearInstanceHooks(ctx: EvaluationContext, instanceKey: string): void;
